// InsureVEX server: global pricing engine + EIP-712 quoter + oracle/settlement keeper + read API.
import "dotenv/config";
import express from "express";
import cors from "cors";
import { ethers } from "ethers";
import { MARKETS, resolveSymbol } from "./catalog.js";
import { history } from "./prices.js";
import { priceFloor, PARAMS, ENGINE_INFO, RECOMMENDED } from "./pricing.js";
import { chain, activeChains, CHAINS, symbolId, signQuote, quoterKey } from "./chain.js";
import { startKeeper, rememberSymbol } from "./keeper.js";
import { store } from "./store.js";

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(",") || true }));
app.use(express.json({ limit: "100kb" }));
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => res.status(e.status || 500).json({ ok: false, error: e.message }));
const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
const fmt6 = (x) => Number(ethers.formatUnits(x, 6));

app.get("/api/health", (req, res) => res.json({
  ok: true, quoter: quoterKey ? new ethers.Wallet(quoterKey).address : null,
  chains: activeChains().map((id) => ({ chainId: id, name: CHAINS[id].name, contracts: chain(id).dep.contracts })),
  engine: { ...ENGINE_INFO, markup: PARAMS.markup, recommended: RECOMMENDED },
}));

// ------------------------------------------------------------------ markets and prices
app.get("/api/markets", wrap(async (req, res) => {
  const withPrices = req.query.prices !== "0";
  const markets = await Promise.all(MARKETS.map(async (m) => ({
    id: m.id, name: m.name, country: m.country, flag: m.flag, currency: m.currency, exchange: m.exchange,
    symbols: await Promise.all(m.symbols.map(async ([symbol, yahoo, name]) => {
      const base = { symbol, ticker: symbol.split(":")[1], name, yahoo, currency: m.currency };
      if (!withPrices) return base;
      try {
        const h = await history(yahoo);
        const q = priceFloor({ sigmaDaily: h.sigmaBlend, sessions: 21, deductible: 0.1, cap: 0.2, market: m.id });
        const w = priceFloor({ sigmaDaily: h.sigmaBlend, sessions: 5, deductible: 0.03, cap: 0.1, market: m.id });
        return { ...base, currency: h.currency || m.currency, lastClose: h.close, lastCloseDate: new Date(h.closeTs * 1000).toISOString().slice(0, 10),
          sigmaDaily: h.sigmaBlend, monthlyPremiumBps: Math.round(q.charged * 1e4), weeklyPremiumBps: Math.round(w.charged * 1e4), quotable: !q.refused || !w.refused };
      } catch (e) { return { ...base, error: e.message, quotable: false }; }
    })),
  })));
  res.json({ markets });
}));

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
  const shares = req.query.shares ? toWad(req.query.shares) : toWad(notionalUsd / h.close);
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
  const [ta, locked, cap, util, prem, pay, R, m, supply, nav, apy, reserve, policyCount] = await Promise.all([
    c.pool.totalAssets(), c.pool.locked(), c.pool.capacity(), c.pool.utilisationBps(), c.pool.totalPremiums(), c.pool.totalPayouts(),
    c.pool.reserveBps(), c.pool.symbolCapBps(), c.pool.totalSupply(), c.tbill.navPerShare(), c.tbill.apyBps(), c.tbill.attestedReserve(),
    c.market.policyCount()]);
  const notes = await Promise.all(c.notes.map(async (n) => {
    const s = await n.contract.snapshot();
    return { key: n.key, address: n.address, name: n.name, supply: fmt6(s.supply), floorValue: fmt6(s.floorVal), sleeveValue: fmt6(s.sleeveVal),
      sleevePrincipal: fmt6(s.sleevePrin), couponsPaid: fmt6(s.couponsPaid), maturity: Number(s.maturity_), subscriptionEnd: Number(s.subscriptionEnd_),
      floorRateBps: Number(s.rateBps), matured: s.isMatured };
  }));
  res.json({
    chainId: c.chainId, contracts: c.dep.contracts, explorer: c.cfg.explorer,
    pool: { totalAssets: fmt6(ta), locked: fmt6(locked), capacity: fmt6(cap), utilisationBps: Number(util), totalPremiums: fmt6(prem),
      totalPayouts: fmt6(pay), lossRatio: prem > 0n ? Number(pay) / Number(prem) : null, reserveBps: Number(R), symbolCapBps: Number(m),
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
    const sym = store.get(`sym:${p.symbol}`);
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
app.get("/api/activity", wrap(async (req, res) => {
  const c = chain(req.query.chainId || 1874);
  if (!c) throw bad("chain not deployed");
  const latest = await c.provider.getBlockNumber();
  const from = Math.max(c.dep.startBlock || 0, latest - Number(req.query.blocks || 20000));
  const out = [];
  const contracts = [...EVENTS.map(([k, e]) => [c[k], e, k]), ...c.notes.flatMap((n) => ["Subscribed", "CouponDistributed", "CouponClaimed", "Matured", "MaturityClaimed", "ForcedTransfer"].map((e) => [n.contract, e, n.key]))];
  for (const [ct, ev, label] of contracts) {
    for (let a = from; a <= latest; a += c.cfg.logChunk) {
      const logs = await ct.queryFilter(ct.filters[ev](), a, Math.min(latest, a + c.cfg.logChunk - 1)).catch(() => []);
      for (const l of logs) out.push({ contract: label, event: ev, block: l.blockNumber, tx: l.transactionHash,
        args: Object.fromEntries(Object.entries(l.args?.toObject?.() || {}).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v])) });
    }
  }
  out.sort((a, b) => b.block - a.block);
  res.json({ explorer: c.cfg.explorer, events: out.slice(0, 200) });
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

const port = Number(process.env.PORT || 8080);
app.listen(port, () => {
  console.log(`InsureVEX server on :${port}; chains: ${activeChains().map((i) => CHAINS[i].name).join(", ") || "none"}`);
  if (process.env.KEEPER !== "0" && quoterKey) startKeeper();
});
