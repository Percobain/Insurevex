import { timingSafeEqual } from "node:crypto";
import { chain, CHAINS } from "../chain.js";
import { SYMBOLS } from "../catalog.js";
import { ethers } from "ethers";
import { chainlinkConfig, usesChainlink } from "./config.js";
import { SettlementState } from "./state.js";
import { validateObservations } from "../shared/chainlink-settlement.mjs";

const symbols = new Map([...SYMBOLS.values()].map((s) => [ethers.id(s.symbol), s]));
let persistent;
export const reportId = (chainId, market, policyId, expiry) => `${chainId}:${market.toLowerCase()}:${policyId}:${expiry}`;
export function settlementState(config = chainlinkConfig()) {
  if (!config.enabled) return null;
  if (!persistent) persistent = new SettlementState(config.stateFile);
  return persistent;
}
function requireThat(ok, message, status = 400) { if (!ok) throw Object.assign(new Error(message), { status }); }

export async function jobFor(c, id, now, config) {
  requireThat(Number.isSafeInteger(id) && id >= 0 && id < 500, "Policy outside the demo scan range");
  const p = await c.market.getPolicy(id);
  requireThat(usesChainlink(c.chainId, p.symbol, config), "Policy is outside CRE's configured scope");
  requireThat(Number(p.status) === 1 && Number(p.expiry) <= now, "Policy is not open and expired", 409);
  const symbol = symbols.get(p.symbol);
  requireThat(symbol?.currency === "USD", "CRE currently supports USD stock quotes only");
  return { id: reportId(c.chainId, c.dep.contracts.CoverMarket, id, Number(p.expiry)), chainId: c.chainId,
    policyId: id, market: c.dep.contracts.CoverMarket, oracle: c.dep.contracts.PriceOracle,
    symbol: symbol.symbol, symbolId: p.symbol, expiry: Number(p.expiry), startPrice: p.startPrice.toString() };
}

export function chainlinkClose(c, id, p, options = {}) {
  const config = options.config || chainlinkConfig();
  if (!usesChainlink(c.chainId, p.symbol, config)) return null;
  if (!config.settlementEnabled) return { ready: false, reason: "CRE validation-only mode: on-chain settlement is disabled" };
  const now = options.now || Math.floor(Date.now() / 1000);
  const state = options.state || settlementState(config);
  const key = reportId(c.chainId, c.dep.contracts.CoverMarket, id, Number(p.expiry));
  const report = state.get(key);
  if (!report) return { ready: false, reason: "Waiting for a validated CRE report; legacy price fallback disabled" };
  try {
    const expected = report.body.job;
    requireThat(expected.oracle.toLowerCase() === c.dep.contracts.PriceOracle.toLowerCase() && expected.symbolId === p.symbol && expected.startPrice === p.startPrice.toString(), "CRE report does not match the on-chain policy");
    const result = validateObservations(expected, report.body.observations, now);
    requireThat(result.price === report.price, "Stored report price mismatch");
    return { ready: true, price: BigInt(result.price), reportId: key, source: "CRE validated Yahoo + Stooq closing prices" };
  } catch (e) { return { ready: false, reason: e.message }; }
}

export function mountChainlinkRoutes(app, options = {}) {
  const config = options.config || chainlinkConfig();
  const getChain = options.chain || chain;
  const clock = options.clock || (() => Math.floor(Date.now() / 1000));
  const getState = () => options.state || settlementState(config);
  const wrap = (fn) => async (req, res) => {
    res.set("Cache-Control", "no-store");
    try { await fn(req, res); }
    catch (e) { res.status(e.status || 503).json({ ok: false, error: e.status ? e.message : "CRE report could not be validated; no settlement was authorised" }); }
  };
  app.get("/api/chainlink/status", wrap(async (req, res) => {
    res.json({ enabled: config.enabled, settlementEnabled: config.settlementEnabled,
      mode: !config.enabled ? "disabled" : config.settlementEnabled ? "operator-relayed settlement" : "validation-only",
      reportDelivery: "Authenticated operator relay; not DON-signature verification", chains: config.chainIds, symbols: config.symbols,
      providers: ["yahoo", "stooq"], maxDeviationBps: 50,
      reports: config.enabled ? getState().recent().map((r) => ({ id: r.id, status: r.status, price: r.price,
        validatedAt: r.validated_at, symbol: r.body.job.symbol, sessionDate: r.body.sessionDate,
        chainId: r.body.job.chainId, policyId: r.body.job.policyId, providers: r.body.providers,
        transaction: r.tx, explorer: CHAINS[r.body.job.chainId]?.explorer })) : [] });
  }));
  app.get("/api/chainlink/jobs", wrap(async (req, res) => {
    requireThat(config.enabled, "Chainlink feature is disabled", 503);
    const ids = req.query.chainId ? [Number(req.query.chainId)] : config.chainIds;
    requireThat(ids.every((id) => config.chainIds.includes(id)), "Chain is not enabled for CRE");
    const jobs = [];
    for (const id of ids) {
      const c = getChain(id);
      if (!c) continue;
      const count = Number(await c.market.policyCount());
      requireThat(count <= 500, "CRE demo scan is limited to 500 policies; add an indexer before scaling", 503);
      for (let policyId = 0; policyId < count && jobs.length < 10; policyId++) {
        const p = await c.market.getPolicy(policyId);
        if (Number(p.status) !== 1 || Number(p.expiry) > clock() || !usesChainlink(id, p.symbol, config)) continue;
        jobs.push(await jobFor(c, policyId, clock(), config));
      }
    }
    res.json({ jobs, validationOnly: !config.settlementEnabled });
  }));
  app.post("/api/chainlink/reports", wrap(async (req, res) => {
    requireThat(config.enabled, "Chainlink feature is disabled", 503);
    requireThat(config.token.length >= 32, "CRE report authentication is not configured", 503);
    const supplied = Buffer.from(req.get("Authorization") || "");
    const expected = Buffer.from(`Bearer ${config.token}`);
    requireThat(supplied.length === expected.length && timingSafeEqual(supplied, expected), "Invalid CRE relay credentials", 401);
    const input = req.body;
    requireThat(input && input.simulated !== true, "Simulation fixtures cannot authorise settlement");
    requireThat(config.chainIds.includes(input.chainId), "Unconfigured settlement chain");
    const c = getChain(input.chainId);
    requireThat(c, "Chain is not deployed", 503);
    const now = clock();
    const job = await jobFor(c, input.policyId, now, config);
    requireThat(input.jobId === job.id, "Report targets a different policy");
    let result;
    try { result = validateObservations(job, input.observations, now); }
    catch (e) { throw Object.assign(e, { status: 422 }); }
    let accepted;
    try { accepted = getState().accept(job.id, { ...result, job }, now); }
    catch (e) { throw Object.assign(e, { status: 409 }); }
    res.json({ ok: true, jobId: job.id, price: accepted.price, status: accepted.status,
      validationOnly: !config.settlementEnabled, message: "Validated and recorded. Only the keeper can submit on-chain transactions." });
  }));
}
