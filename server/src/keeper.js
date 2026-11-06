// Keeper: posts official closes to the oracle at each policy's expiry, settles expired policies, pays coupons when
// due, matures notes, and rolls the T-bill NAV daily. Runs on every configured testnet.
import { ethers } from "ethers";
import { chain, activeChains, symbolId } from "./chain.js";
import { SYMBOLS } from "./catalog.js";
import { closeAt } from "./prices.js";
import { store } from "./store.js";
import { chainlinkClose, settlementState } from "./chainlink/service.js";

const log = (...a) => console.log(new Date().toISOString(), "[keeper]", ...a);
const BY_ID = new Map([...SYMBOLS.values()].map((s) => [symbolId(s.symbol), s]));
export function rememberSymbol(sym) { BY_ID.set(symbolId(sym.symbol), sym); }
// Hedera's JSON-RPC relay under-estimates gas for multi-contract calls: send an explicit limit there.
const gas = (c) => (c.chainId === 296 ? { gasLimit: 1_500_000 } : {});

export async function settleDue(c, options = {}) {
  const book = options.store || store;
  const getCreClose = options.chainlinkClose || chainlinkClose;
  const getLegacyClose = options.closeAt || closeAt;
  const recordSettlement = options.recordSettlement || ((id, tx) => settlementState().settled(id, tx));
  const n = Number(await c.market.policyCount());
  const st = book.get(`settled:${c.chainId}`, []);
  const done = new Set(st);
  const now = options.now ?? Math.floor(Date.now() / 1000);
  for (let id = 0; id < n; id++) {
    if (done.has(id)) continue;
    const p = await c.market.getPolicy(id);
    if (Number(p.status) === 2) { done.add(id); continue; }
    if (Number(p.expiry) > now) continue;
    const sym = BY_ID.get(p.symbol) || book.get(`sym:${p.symbol}`);
    if (!sym) { log("unknown symbol for policy", id); continue; }
    const cre = getCreClose(c, id, p);
    if (cre && !cre.ready) { log(c.cfg.name, `policy ${id} pending: ${cre.reason}`); continue; }
    const [posted, existingPrice] = await c.oracle.closeAt(p.symbol, p.expiry);
    if (cre && posted && existingPrice !== cre.price) {
      log(c.cfg.name, `policy ${id} pending: existing oracle close conflicts with CRE report`);
      continue;
    }
    let px;
    if (!posted) {
      const close = cre ? { price: Number(cre.price) / 1e8, source: cre.source } : await getLegacyClose(sym.yahoo, Number(p.expiry));
      px = cre ? cre.price : BigInt(Math.round(close.price * 1e8));
      const tx = await c.oracle.post(p.symbol, p.expiry, px, gas(c));
      await tx.wait();
      log(c.cfg.name, `posted ${sym.symbol} ${close.price} (${close.source}) for policy ${id}`, tx.hash);
    }
    const tx = await c.market.settle(id, gas(c));
    const r = await tx.wait();
    log(c.cfg.name, `settled policy ${id}`, r.hash);
    if (cre) recordSettlement(cre.reportId, r.hash);
    done.add(id);
  }
  book.set(`settled:${c.chainId}`, [...done]);
}

async function couponsAndMaturity(c) {
  const now = Math.floor(Date.now() / 1000);
  for (const n of c.notes) {
    const note = n.contract;
    const [matured, maturity, last, interval] = await Promise.all([note.matured(), note.maturity(), note.lastCoupon(), note.couponInterval()]);
    if (!matured && now >= Number(maturity)) {
      // keep the T-bill vault liquid for redemptions (custodian proceeds), then mature
      const r = await (await note.mature(gas(c))).wait();
      log(c.cfg.name, `matured ${n.key}`, r.hash);
      continue;
    }
    // On Hedera coupons are run by the native Schedule Service (scripts/hedera-schedule-coupon.js), not by this keeper.
    const scheduledNatively = (process.env.NATIVE_COUPON_CHAINS || "296").split(",").map(Number).includes(c.chainId);
    if (!scheduledNatively && !matured && now >= Number(last) + Number(interval) && (await note.totalSupply()) > 0n) {
      const avail = await note.couponAvailable();
      if (avail > 0n) {
        const r = await (await note.distributeCoupon(gas(c))).wait();
        log(c.cfg.name, `coupon ${n.key} ${ethers.formatUnits(avail, 6)}`, r.hash);
      }
    }
  }
}

async function rollNav(c) {
  const key = `nav:${c.chainId}`;
  const last = store.get(key, 0);
  if (Date.now() - last < 24 * 3600 * 1000) return;
  const apy = Number(process.env.TBILL_APY_BPS || (await c.tbill.apyBps()));
  const reserve = await c.tbill.totalAssets(); // custodian statement mirrors fund assets on testnet
  const r = await (await c.tbill.updateNav(apy, reserve, gas(c))).wait();
  log(c.cfg.name, `NAV rolled, reserve ${ethers.formatUnits(reserve, 6)}`, r.hash);
  store.set(key, Date.now());
}

let running = false;
export async function tick() {
  if (running) return;
  running = true;
  try {
    for (const id of activeChains()) {
      const c = chain(id);
      if (!c.signer) continue;
      for (const job of [settleDue, couponsAndMaturity, rollNav]) {
        try { await job(c); } catch (e) { log(c.cfg.name, job.name, "error:", e.shortMessage || e.message); }
      }
    }
  } finally {
    running = false;
  }
}

export function startKeeper() {
  const ms = Number(process.env.KEEPER_INTERVAL_MS || 60_000);
  setInterval(tick, ms);
  setTimeout(tick, 5_000);
  log(`started, every ${ms / 1000}s`);
}
