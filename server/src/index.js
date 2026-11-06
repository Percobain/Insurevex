// InsureVEX server: global pricing engine + EIP-712 quoter + oracle/settlement keeper + read API.
import "dotenv/config";
import express from "express";
import cors from "cors";
import { ethers } from "ethers";
import { MARKETS, SYMBOLS, resolveSymbol } from "./catalog.js";
const SYMBOL_BY_ID = new Map([...SYMBOLS.values()].map((x) => [ethers.id(x.symbol), x]));
import { history } from "./prices.js";
import { priceFloor, PARAMS, ENGINE_INFO, RECOMMENDED } from "./pricing.js";
import { chain, activeChains, CHAINS, symbolId, signQuote, quoterKey } from "./chain.js";
import { startKeeper, rememberSymbol, tick } from "./keeper.js";
import { store } from "./store.js";
import { mountAgentRoutes } from "./agent/merchant.js";

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(",") || true }));
app.use(express.json({ limit: "100kb" }));
mountAgentRoutes(app);
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => res.status(e.status || 500).json({ ok: false, error: e.message }));
const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
const fmt6 = (x) => Number(ethers.formatUnits(x, 6));

app.get("/api/health", (req, res) => res.json({
  ok: true, quoter: quoterKey ? new ethers.Wallet(quoterKey).address : null,
  chains: activeChains().map((id) => ({ chainId: id, name: CHAINS[id].name, contracts: chain(id).dep.contracts })),
  engine: { ...ENGINE_INFO, markup: PARAMS.markup, recommended: RECOMMENDED },
}));

// ------------------------------------------------------------------ markets and prices
// USD per one unit of a quote currency, from Yahoo FX closes. Sub-unit quotes (pence, agorot, cents) are scaled.
const SUBUNIT = { GBp: ["GBP", 100], GBX: ["GBP", 100], ILA: ["ILS", 100], ZAc: ["ZAR", 100], ZAC: ["ZAR", 100] };
const fxMemo = new Map();
export async function usdPer(currency) {
  if (!currency || currency === "USD") return 1;
  const [cur, div] = SUBUNIT[currency] || [currency.toUpperCase(), 1];
  if (cur === "USD") return 1 / div;
  if (!fxMemo.has(cur)) fxMemo.set(cur, history(`${cur}USD=X`, "3mo").then((h) => h.close).catch(() => { fxMemo.delete(cur); return null; }));
  const r = await fxMemo.get(cur);
  return r ? r / div : null;
}
setInterval(() => fxMemo.clear(), 6 * 3600 * 1000).unref();

// The full market list (100+ symbols) is built in the background and served from memory, so a request never
// waits on 100+ price fetches. Rebuilt every few minutes; the first request after boot waits for the first build.
let marketsCache = null; // { at, markets }
let marketsBuild = null;
function buildMarkets() {
  if (!marketsBuild) marketsBuild = marketsPayload(true)
    .then((markets) => { marketsCache = { at: Date.now(), markets }; return markets; })
    .finally(() => { marketsBuild = null; });
  return marketsBuild;
}
const countErrors = (ms) => ms.reduce((n, m) => n + m.symbols.filter((x) => x.error).length, 0);
let marketsRetryMs = 30_000; // grows 30 s -> 1 m -> 2 m ... up to 10 m while symbols keep failing
let marketsRetry = null;
function refreshMarkets() {
  return buildMarkets().then((ms) => {
    const bad = countErrors(ms);
    if (!bad) { marketsRetryMs = 30_000; return; }
    console.warn(`[markets] ${bad} symbol(s) without prices; retrying in ${Math.round(marketsRetryMs / 1000)}s`);
    if (!marketsRetry) marketsRetry = setTimeout(() => { marketsRetry = null; refreshMarkets(); }, marketsRetryMs).unref();
    marketsRetryMs = Math.min(marketsRetryMs * 2, 10 * 60 * 1000);
  }).catch((e) => console.error("[markets] refresh failed:", e.message));
}
function startMarketRefresh() {
  refreshMarkets();
  setInterval(refreshMarkets, 5 * 60 * 1000).unref();
}

app.get("/api/markets", wrap(async (req, res) => {
  const withPrices = req.query.prices !== "0";
  if (!withPrices) return res.json({ markets: await marketsPayload(false) });
  if (marketsCache) {
    if (Date.now() - marketsCache.at > 5 * 60 * 1000) buildMarkets().catch(() => {});
    return res.json({ markets: marketsCache.markets, asOf: new Date(marketsCache.at).toISOString() });
  }
  res.json({ markets: await buildMarkets() });
}));

// At most PRICE_CONCURRENCY price downloads at a time: 100+ at once starves a small (0.1 CPU) server and gets
// throttled by the price source.
const PRICE_CONCURRENCY = Number(process.env.PRICE_CONCURRENCY || 6);
let priceSlots = PRICE_CONCURRENCY;
const priceQueue = [];
async function limitedHistory(yahoo) {
  if (priceSlots <= 0) await new Promise((r) => priceQueue.push(r));
  priceSlots--;
  try { return await history(yahoo); } finally { priceSlots++; priceQueue.shift()?.(); }
}

async function marketsPayload(withPrices) {
  return Promise.all(MARKETS.map(async (m) => ({
    id: m.id, name: m.name, country: m.country, flag: m.flag, currency: m.currency, exchange: m.exchange,
    symbols: await Promise.all(m.symbols.map(async ([symbol, yahoo, name]) => {
      const base = { symbol, ticker: symbol.split(":")[1], name, yahoo, currency: m.currency };
      if (!withPrices) return base;
      try {
        const h = await limitedHistory(yahoo);
        const q = priceFloor({ sigmaDaily: h.sigmaBlend, sessions: 21, deductible: 0.1, cap: 0.2, market: m.id });
        const w = priceFloor({ sigmaDaily: h.sigmaBlend, sessions: 5, deductible: 0.03, cap: 0.1, market: m.id });
        const fx = await usdPer(h.currency || m.currency);
        return { ...base, currency: h.currency || m.currency, lastClose: h.close, usdPerUnit: fx, lastCloseUsd: fx ? h.close * fx : null, lastCloseDate: new Date(h.closeTs * 1000).toISOString().slice(0, 10),
          sigmaDaily: h.sigmaBlend, monthlyPremiumBps: Math.round(q.charged * 1e4), weeklyPremiumBps: Math.round(w.charged * 1e4), quotable: !q.refused || !w.refused };
      } catch (e) { return { ...base, error: e.message, quotable: false }; }
    })),
  })));
}

app.get("/api/price", wrap(async (req, res) => {
  const sym = resolveSymbol(req.query.symbol, req.query.yahoo);
  if (!sym) throw bad("unknown symbol");
  const h = await history(sym.yahoo, req.query.range || "1y");
  res.json({ symbol: sym.symbol, name: sym.name, close: h.close, date: new Date(h.closeTs * 1000).toISOString().slice(0, 10), currency: h.currency,
    sigmaDaily: h.sigmaBlend, history: h.rows.map(([t, c]) => [new Date(t * 1000).toISOString().slice(0, 10), c]) });
}));

// ------------------------------------------------------------------ quote
app.get("/api/quote", wrap(async (req, res) => {
  const { chainId, buyer } = req.query;
  const c = chain(chainId);
  if (!c) throw bad("unsupported or undeployed chain");
  if (!ethers.isAddress(buyer)) throw bad("buyer address");
  const sym = resolveSymbol(req.query.symbol, req.query.yahoo);
  if (!sym) throw bad("unknown symbol");
  const notionalUsd = Number(req.query.notional);
  if (!(notionalUsd > 0 && notionalUsd <= 1e7)) throw bad("notional");
  const deductibleBps = Number(req.query.deductibleBps ?? RECOMMENDED.deductibleBps);
  const capBps = Number(req.query.capBps ?? RECOMMENDED.capBps);
  const tenorDays = Number(req.query.tenorDays ?? RECOMMENDED.tenorDays);
  const tenorMinutes = req.query.tenorMinutes ? Number(req.query.tenorMinutes) : null; // testnet live-demo expiries
  if (![300, 500, 750, 1000, 1500, 2000, 2500].includes(deductibleBps) || ![1000, 2000, 3000].includes(capBps)) throw bad("terms");
  if (!tenorMinutes && ![7, 14, 28].includes(tenorDays)) throw bad("tenor");

  const h = await history(sym.yahoo);
  const sessions = tenorMinutes ? 1 : Math.round((tenorDays * 5) / 7);
  const market = sym.market;
  const p = priceFloor({ sigmaDaily: h.sigmaBlend, sessions, deductible: deductibleBps / 1e4, cap: capBps / 1e4, market });
  const pricing = { model: ENGINE_INFO.model, marketFactor: p.factor, fairBps: p.fair * 1e4, premiumBps: p.charged * 1e4, markup: PARAMS.markup, sigmaDaily: h.sigmaBlend, sigmaPeriod: p.sigmaP,
    pPayout: p.pPayout, refused: p.refused, reason: p.reason, sessions, horizonUsed: p.horizonUsed, lastClose: h.close, currency: h.currency,
    lastCloseDate: new Date(h.closeTs * 1000).toISOString().slice(0, 10) };
  if (p.refused) {
    // Instead of a flat "no": offer the nearest deeper deductible that is still quotable (backtest: a deeper
    // deductible keeps cover available in volatile names at a premium the pool can carry).
    const alternatives = [];
    for (const b of [500, 750, 1000, 1500, 2000, 2500].filter((x) => x > deductibleBps)) {
      const a = priceFloor({ sigmaDaily: h.sigmaBlend, sessions, deductible: b / 1e4, cap: capBps / 1e4, market });
      if (!a.refused) alternatives.push({ deductibleBps: b, premiumBps: a.charged * 1e4, pPayout: a.pPayout });
    }
    return res.json({ ok: false, pricing, alternatives });
  }

  const toWad = (x) => ethers.parseEther(Number(x).toFixed(18));
  const fx = await usdPer(h.currency || sym.currency);
  const usdClose = fx ? h.close * fx : null;
  if (!usdClose) return res.json({ ok: false, error: `no FX rate for ${h.currency} right now`, pricing: { refused: true, reason: `No FX rate for ${h.currency} right now, so the cover cannot be sized in dollars. Try again shortly.` } });
  // insurable interest by value: cover cannot exceed what the covered shares are worth (10% slack for price moves)
  if (req.query.shares) {
    const worth = Number(req.query.shares) * usdClose;
    if (notionalUsd > worth * 1.1) {
      const reason = `${req.query.shares} ${sym.symbol} is worth about ${worth.toFixed(2)} USD at the last close; cover cannot exceed that.`;
      return res.json({ ok: false, error: reason, pricing: { refused: true, reason } });
    }
  }
  const shares = req.query.shares ? toWad(req.query.shares) : toWad(notionalUsd / usdClose);
  const heldShares = req.query.heldShares ? toWad(req.query.heldShares) : shares;
  const now = Math.floor(Date.now() / 1000);
  const notional = ethers.parseUnits(notionalUsd.toFixed(6), 6);
  const premium = (notional * BigInt(Math.ceil(p.charged * 1e6))) / 1_000_000n;
  const quote = {
    buyer: ethers.getAddress(buyer), symbol: symbolId(sym.symbol), market: ethers.id(sym.market), notional: notional.toString(), shares: shares.toString(),
    heldShares: heldShares.toString(), deductibleBps, capBps, premium: premium.toString(), startPrice: Math.round(h.live * 1e8).toString(),
    expiry: tenorMinutes ? now + tenorMinutes * 60 : now + tenorDays * 86400, validUntil: now + 10 * 60,
    nonce: BigInt(ethers.hexlify(ethers.randomBytes(16))).toString(),
  };
  const signature = await signQuote(c, quote);
  rememberSymbol(sym);
  store.set(`sym:${quote.symbol}`, sym);
  res.json({ ok: true, quote, signature, pricing, symbol: sym, contract: c.dep.contracts.CoverMarket,
    maxPayout: fmt6((notional * BigInt(capBps)) / 10000n), premium: fmt6(premium) });
}));

// ------------------------------------------------------------------ holdings attestation
app.post("/api/holdings/attest", wrap(async (req, res) => {
  const { address, symbol, source = "statement", broker = null, shares } = req.body || {};
  if (!["kite", "statement", "ats", "ibkr"].includes(source)) throw bad("source");
  if (!ethers.isAddress(address) || !symbol || !(Number(shares) > 0)) throw bad("address, symbol, shares");
  // Demo connectors: "kite" (Zerodha holdings API), "statement" (broker PDF/CSV upload), "ats" (on-chain balance on Hedera).
  const ref = ethers.id(JSON.stringify({ address: address.toLowerCase(), symbol, source, shares, at: Date.now() }));
  store.push("attestations", { address, symbol, source, broker, shares: Number(shares), ref, at: new Date().toISOString() });
  res.json({ heldShares: ethers.parseEther(Number(shares).toFixed(18)).toString(), ref, source });
}));

// ------------------------------------------------------------------ on-chain state
app.get("/api/state", wrap(async (req, res) => {
  const c = chain(req.query.chainId || 1874);
  if (!c) throw bad("chain not deployed");
  const [ta, locked, cap, util, prem, pay, R, m, supply, nav, apy, reserve, policyCount, K, junior, proFee, proLoss] = await Promise.all([
    c.pool.totalAssets(), c.pool.locked(), c.pool.capacity(), c.pool.utilisationBps(), c.pool.totalPremiums(), c.pool.totalPayouts(),
    c.pool.reserveBps(), c.pool.symbolCapBps(), c.pool.totalSupply(), c.tbill.navPerShare(), c.tbill.apyBps(), c.tbill.attestedReserve(),
    c.market.policyCount(), c.pool.marketCapBps(), c.pool.juniorAssets(), c.pool.proFeeBps(), c.pool.totalProLosses()]);
  const notes = await Promise.all(c.notes.map(async (n) => {
    const s = await n.contract.snapshot();
    return { key: n.key, address: n.address, name: n.name, supply: fmt6(s.supply), floorValue: fmt6(s.floorVal), sleeveValue: fmt6(s.sleeveVal),
      sleevePrincipal: fmt6(s.sleevePrin), couponsPaid: fmt6(s.couponsPaid), maturity: Number(s.maturity_), subscriptionEnd: Number(s.subscriptionEnd_),
      floorRateBps: Number(s.rateBps), matured: s.isMatured };
  }));
  res.json({
    chainId: c.chainId, contracts: c.dep.contracts, explorer: c.cfg.explorer,
    pool: { totalAssets: fmt6(ta), locked: fmt6(locked), capacity: fmt6(cap), utilisationBps: Number(util), totalPremiums: fmt6(prem),
      totalPayouts: fmt6(pay), lossRatio: prem > 0n ? Number(pay) / Number(prem) : null, reserveBps: Number(R), symbolCapBps: Number(m), marketCapBps: Number(K), proAssets: fmt6(junior), proFeeBps: Number(proFee), proLosses: fmt6(proLoss),
      sharePrice: supply > 0n ? Number(ta) / Number(supply) : 1 },
    tbill: { nav: Number(nav) / 1e18, apyBps: Number(apy), attestedReserve: fmt6(reserve) },
    notes, policies: { count: Number(policyCount) },
  });
}));

app.get("/api/policies", wrap(async (req, res) => {
  const c = chain(req.query.chainId || 1874);
  if (!c) throw bad("chain not deployed");
  const ids = req.query.holder ? (await c.market.policiesOf(req.query.holder)).map(Number) : [...Array(Number(await c.market.policyCount())).keys()];
  const policies = await Promise.all(ids.slice(-200).map(async (id) => {
    const p = await c.market.getPolicy(id);
    const sym = SYMBOL_BY_ID.get(p.symbol) || store.get(`sym:${p.symbol}`);
    return { id, holder: p.holder, symbol: sym?.symbol || p.symbol, name: sym?.name, notional: fmt6(p.notional), deductibleBps: Number(p.deductibleBps),
      capBps: Number(p.capBps), premium: fmt6(p.premium), startPrice: Number(p.startPrice) / 1e8, start: Number(p.start), expiry: Number(p.expiry),
      status: ["None", "Open", "Settled"][Number(p.status)], payout: fmt6(p.payout), settlePrice: Number(p.settlePrice) / 1e8 };
  }));
  res.json({ policies });
}));

// ------------------------------------------------------------------ activity feed
const EVENTS = [
  ["market", "CoverBought"], ["market", "CoverSettled"], ["pool", "ClaimPaid"], ["identity", "IdentitySet"], ["identity", "Frozen"],
  ["oracle", "PricePosted"], ["tbill", "NavUpdated"],
];
const NOTE_EVENTS = ["Subscribed", "CouponDistributed", "CouponClaimed", "Matured", "MaturityClaimed", "ForcedTransfer"];
const activityCache = new Map(); // key -> { at, body }
async function getLogsRetry(c, address, fromBlock, toBlock) {
  for (let i = 0; i < 4; i++) {
    try { return await c.provider.getLogs({ address, fromBlock, toBlock }); } catch { await new Promise((r) => setTimeout(r, 400 * (i + 1))); }
  }
  console.warn(`activity: getLogs ${fromBlock}-${toBlock} on ${c.chainId} failed after retries`);
  return [];
}
async function loadActivity(c, blocks) {
  const latest = await c.provider.getBlockNumber();
  const from = Math.max(c.dep.startBlock || 0, latest - blocks);
  // address -> { contract, label, events }: one getLogs per block chunk over every contract, chunks in parallel
  const watch = new Map();
  const add = (ct, label, ev) => {
    if (!ct) return;
    const k = String(ct.target).toLowerCase();
    if (!watch.has(k)) watch.set(k, { ct, label, events: new Set() });
    watch.get(k).events.add(ev);
  };
  for (const [k, e] of EVENTS) add(c[k], k, e);
  for (const n of c.notes) for (const e of NOTE_EVENTS) add(n.contract, n.key, e);
  const addresses = [...watch.values()].map((w) => w.ct.target);
  const ranges = [];
  for (let x = from; x <= latest; x += c.cfg.logChunk) ranges.push([x, Math.min(latest, x + c.cfg.logChunk - 1)]);
  const logs = [];
  // 4 ranges at a time. Hedera relays reject JSON-RPC batches of eth_getLogs, so its provider never batches
  // (batchMaxCount 1 in chain.js) and the parallel calls go out as separate requests.
  const par = 4;
  for (let i = 0; i < ranges.length; i += par) {
    const batch = await Promise.all(ranges.slice(i, i + par).map(([f, t]) => getLogsRetry(c, addresses, f, t)));
    batch.forEach((l) => logs.push(...l));
  }
  const out = [];
  for (const l of logs) {
    const w = watch.get(String(l.address).toLowerCase());
    if (!w) continue;
    let parsed;
    try { parsed = w.ct.interface.parseLog(l); } catch { continue; }
    if (!parsed || !w.events.has(parsed.name)) continue;
    const args = {};
    parsed.fragment.inputs.forEach((inp, i) => { const v = parsed.args[i]; args[inp.name] = typeof v === "bigint" ? v.toString() : v; });
    out.push({ contract: w.label, event: parsed.name, block: l.blockNumber, tx: l.transactionHash, args });
  }
  out.sort((x, y) => y.block - x.block);
  return { explorer: c.cfg.explorer, latest, events: out.slice(0, 200) };
}
// default lookback per chain: Arc makes blocks ~every 0.5s, so it needs a much wider window for the same hours
const ACTIVITY_BLOCKS = { 1874: 20000, 296: 20000, 5042002: 200000 };
const activityInflight = new Map(); // key -> promise of the scan in progress
async function warmActivity() {
  for (const id of [1874, 296, 5042002]) {
    const c = chain(id);
    if (!c) continue;
    const b = ACTIVITY_BLOCKS[id];
    const key = `${id}:${b}`;
    const scan = loadActivity(c, b).then((body) => { activityCache.set(key, { at: Date.now(), body }); return body; })
      .finally(() => activityInflight.delete(key));
    activityInflight.set(key, scan);
    try { await scan; } catch {}
  }
}
app.get("/api/activity", wrap(async (req, res) => {
  const c = chain(req.query.chainId || 1874);
  if (!c) throw bad("chain not deployed");
  const id = Number(req.query.chainId || 1874);
  const blocks = Math.min(Number(req.query.blocks || ACTIVITY_BLOCKS[id] || 20000), 200000);
  const key = `${id}:${blocks}`;
  const hit = activityCache.get(key);
  if (hit && Date.now() - hit.at < 30_000) return res.json(hit.body);
  // serve a stale copy at once and refresh behind it, so the page never waits on a slow RPC twice
  if (hit) {
    if (!hit.refreshing) {
      hit.refreshing = true;
      loadActivity(c, blocks).then((body) => activityCache.set(key, { at: Date.now(), body })).catch(() => { hit.refreshing = false; });
    }
    return res.json(hit.body);
  }
  // Cold cache: every request shares one scan. If it is not done in 20 s, answer 503 so the page falls back to
  // reading recent blocks itself and asks again shortly, instead of hanging on a slow RPC.
  let scan = activityInflight.get(key);
  if (!scan) {
    scan = loadActivity(c, blocks).then((body) => { activityCache.set(key, { at: Date.now(), body }); return body; })
      .finally(() => activityInflight.delete(key));
    activityInflight.set(key, scan);
  }
  const body = await Promise.race([scan, new Promise((r) => setTimeout(() => r(null), 20_000).unref())]);
  if (!body) return res.status(503).json({ error: "activity is still loading, try again shortly", warming: true });
  res.json(body);
}));

// ------------------------------------------------------------------ KYC requests (issuer approves on-chain)
app.post("/api/kyc/request", wrap(async (req, res) => {
  const { address, country, name } = req.body || {};
  if (!ethers.isAddress(address)) throw bad("address");
  const r = { address: ethers.getAddress(address), country: Number(country) || 840, name: String(name || "").slice(0, 80), at: new Date().toISOString(), status: "pending" };
  const list = store.get("kyc", []).filter((x) => x.address !== r.address);
  list.push(r);
  store.set("kyc", list);
  res.json({ ok: true, request: r });
}));
app.get("/api/kyc/requests", (req, res) => res.json({ requests: store.get("kyc", []) }));

// Keeper as an endpoint too, so a serverless deployment (Vercel cron) can run it. Protected by KEEPER_SECRET.
app.post("/api/keeper/tick", wrap(async (req, res) => {
  const secret = process.env.KEEPER_SECRET;
  const auth = req.headers.authorization || "";
  if (!secret || auth !== `Bearer ${secret}`) return res.status(401).json({ ok: false });
  await tick();
  res.json({ ok: true, at: new Date().toISOString() });
}));
app.get("/api/keeper/tick", (req, res) => {
  // Vercel cron sends GET with the CRON_SECRET bearer
  const secret = process.env.CRON_SECRET || process.env.KEEPER_SECRET;
  if (!secret || (req.headers.authorization || "") !== `Bearer ${secret}`) return res.status(401).json({ ok: false });
  tick().then(() => res.json({ ok: true })).catch((e) => res.status(500).json({ ok: false, error: e.message }));
});

export default app;

// Long-running mode (local / VM): listen and run the keeper loop. On Vercel the platform imports the app instead.
if (!process.env.VERCEL) {
  const port = Number(process.env.PORT || 8080);
  app.listen(port, "0.0.0.0", () => {
    console.log(`InsureVEX server on :${port}; chains: ${activeChains().map((i) => CHAINS[i].name).join(", ") || "none"}`);
    // Answer requests (and the host's health check) first; start the heavy background work a little later, one job
    // at a time, so a small instance is never too busy to respond.
    const delay = Number(process.env.WARMUP_DELAY_MS ?? 20_000);
    setTimeout(async () => {
      startMarketRefresh();
      await marketsBuild?.catch(() => {});
      await warmActivity().catch(() => {});
      if (process.env.KEEPER !== "0" && quoterKey) startKeeper();
    }, delay).unref();
  });
} else {
  startMarketRefresh(); // serverless: no listen callback, so warm on import as before
}
