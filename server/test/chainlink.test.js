import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import express from "express";
import { ethers } from "ethers";
import { chainlinkConfig, usesChainlink } from "../src/chainlink/config.js";
import { SettlementState } from "../src/chainlink/state.js";
import { chainlinkClose, mountChainlinkRoutes, reportId } from "../src/chainlink/service.js";
import { validateObservations, regularUsClose, parseYahoo, parseStooq } from "../../shared/chainlink-settlement.mjs";
import { settleDue } from "../src/keeper.js";

const now = Date.parse("2026-11-06T22:00:00Z") / 1000;
const symbol = "NASDAQ:NVDA";
const market = "0x0000000000000000000000000000000000000001";
const oracle = "0x0000000000000000000000000000000000000002";
const config = () => chainlinkConfig({ CHAINLINK_ENABLED: "1", CHAINLINK_REPORT_TOKEN: "x".repeat(40) });
const job = () => ({ id: reportId(1874, market, 0, now), chainId: 1874, market, oracle, policyId: 0, symbol, symbolId: ethers.id(symbol), expiry: now, startPrice: "10000000000" });
const observations = () => ["yahoo", "stooq"].map((provider) => ({ provider, symbol, currency: "USD", sessionDate: "2026-11-06", closeAt: regularUsClose("2026-11-06"), price: provider === "yahoo" ? "80.00" : "80.10", observedAt: now }));
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.homedir(), ".insurevex-cre-test-"));
  const state = new SettlementState(path.join(dir, "state.sqlite"));
  t.after(() => { state.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return state;
}
function chainMock() {
  return { chainId: 1874, dep: { contracts: { CoverMarket: market, PriceOracle: oracle } }, market: {
    policyCount: async () => 1n,
    getPolicy: async () => ({ status: 1n, symbol: ethers.id(symbol), expiry: BigInt(now), startPrice: 10000000000n }),
  } };
}

test("CRE is off by default and only scopes configured chains and stocks", () => {
  assert.equal(chainlinkConfig({}).enabled, false);
  assert.equal(chainlinkConfig({ CHAINLINK_ENABLED: "true" }).settlementEnabled, false);
  assert.equal(usesChainlink(1874, ethers.id(symbol), config()), true);
  assert.equal(usesChainlink(296, ethers.id("NSE:RELIANCE"), config()), false);
  assert.throws(() => chainlinkConfig({ CHAINLINK_ENABLED: "1", CHAINLINK_CHAIN_IDS: "1" }), /testnets/);
  assert.throws(() => chainlinkConfig({ CHAINLINK_ENABLED: "1", VERCEL: "1" }), /persistent/);
  assert.equal(chainlinkClose(chainMock(), 0, { symbol: ethers.id(symbol) }, { config: chainlinkConfig({}) }), null);
});

test("prices require matching sessions, currency, freshness and independent providers", () => {
  assert.equal(validateObservations(job(), observations(), now).price, "8005000000");
  for (const patch of [{ provider: "yahoo" }, { price: "85" }, { observedAt: now - 301 }, { observedAt: now + 31 },
    { symbol: "NASDAQ:MSFT" }, { currency: "INR" }, { price: "NaN" }, { price: "-1" },
    { sessionDate: "2026-11-05", closeAt: regularUsClose("2026-11-05") }, { closeAt: now + 1 }]) {
    const o = observations(); Object.assign(o[1], patch);
    assert.throws(() => validateObservations(job(), o, now));
  }
  assert.throws(() => validateObservations({ ...job(), expiry: now + 1 }, observations(), now), /expired/);
  assert.throws(() => validateObservations(job(), [observations()[0]], now), /Two independent/);
  assert.throws(() => regularUsClose("2026-11-27"), /calendar/);
  assert.throws(() => regularUsClose("2026-11-07"), /weekend/);
});

test("a zero close is valid only when both providers agree", () => {
  const o = observations().map((r) => ({ ...r, price: "0" }));
  assert.equal(validateObservations(job(), o, now).price, "0");
  o[1].price = "0.00000001";
  assert.throws(() => validateObservations(job(), o, now), /disagreement/);
});

test("adapters use completed raw closes rather than adjusted closes or live trades", () => {
  const yahoo = JSON.stringify({ chart: { result: [{ meta: { currency: "USD", symbol: "NVDA", regularMarketPrice: 900 }, timestamp: [now - 8 * 3600], indicators: { quote: [{ close: [80] }], adjclose: [{ adjclose: [10] }] } }] } });
  assert.equal(parseYahoo(yahoo, job(), now).price, "80.00000000");
  assert.equal(parseStooq("Date,Open,High,Low,Close,Volume\n2026-11-06,80,81,79,80.10,100", job(), now).price, "80.10");
  assert.throws(() => parseYahoo(yahoo, { ...job(), symbol: "NASDAQ:MSFT" }, now), /ticker/);
  assert.throws(() => parseYahoo(yahoo, { ...job(), expiry: now - 7200 }, now), /completed/);
});

test("validation-only mode and missing or stale reports cannot authorise keeper prices", (t) => {
  const state = fixture(t); const c = chainMock();
  const p = { symbol: ethers.id(symbol), expiry: BigInt(now), startPrice: 10000000000n };
  assert.equal(chainlinkClose(c, 0, p, { config: config(), state, now }).ready, false);
  const live = { ...config(), settlementEnabled: true };
  assert.equal(chainlinkClose(c, 0, p, { config: live, state, now }).ready, false);
  state.accept(job().id, { ...validateObservations(job(), observations(), now), job: job() }, now);
  assert.equal(chainlinkClose(c, 0, p, { config: config(), state, now }).ready, false);
  assert.equal(chainlinkClose(c, 0, p, { config: live, state, now }).price, 8005000000n);
  assert.equal(chainlinkClose(c, 0, p, { config: live, state, now: now + 301 }).ready, false);
  assert.equal(chainlinkClose(c, 0, { ...p, startPrice: 1n }, { config: live, state, now }).ready, false);
});

test("durable reports are idempotent and reject conflicting replacement prices", (t) => {
  const state = fixture(t);
  const result = { ...validateObservations(job(), observations(), now), job: job() };
  state.accept(job().id, result, now); state.accept(job().id, result, now);
  assert.equal(state.recent().length, 1);
  assert.throws(() => state.accept(job().id, { ...result, price: "1" }, now), /Conflicting/);
  state.settled(job().id, "0xreceipt");
  assert.equal(state.accept(job().id, result, now).status, "settled");
  assert.equal(state.get(job().id).tx, "0xreceipt");
});

test("report API authenticates, rereads policy and validates before queueing; no chain writes", async (t) => {
  const state = fixture(t); const cfg = config(); const app = express(); app.use(express.json());
  mountChainlinkRoutes(app, { config: cfg, state, chain: () => chainMock(), clock: () => now });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => { server.closeAllConnections(); server.close(r); }));
  const base = `http://127.0.0.1:${server.address().port}/api/chainlink`;
  const body = { chainId: 1874, policyId: 0, jobId: job().id, observations: observations() };
  const post = (data, token = cfg.token) => fetch(`${base}/reports`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(data) });
  assert.equal((await post(body, "wrong")).status, 401);
  assert.equal(state.recent().length, 0);
  assert.equal((await post({ ...body, jobId: "wrong" })).status, 400);
  assert.equal((await post({ ...body, simulated: true })).status, 400);
  const bad = { ...body, observations: observations() }; bad.observations[1].price = "100";
  assert.equal((await post(bad)).status, 422);
  assert.equal(state.recent().length, 0);
  const response = await post(body);
  assert.equal(response.status, 200); assert.equal((await response.json()).validationOnly, true);
  assert.equal((await post(body)).status, 200); assert.equal(state.recent().length, 1);
  const jobs = await (await fetch(`${base}/jobs`)).json(); assert.equal(jobs.jobs[0].id, job().id);
  const status = await (await fetch(`${base}/status`)).json();
  assert.equal(status.mode, "validation-only"); assert.equal(JSON.stringify(status).includes(cfg.token), false);
});

test("keeper preserves legacy mode, blocks CRE fallback and refuses conflicting oracle prices", async () => {
  const writes = [];
  const c = chainMock();
  c.cfg = { name: "Testnet" };
  c.oracle = { closeAt: async () => [false, 0n], post: async (_symbol, _expiry, px) => {
    writes.push(["post", px]); return { hash: "0xpost", wait: async () => ({ hash: "0xpost" }) };
  } };
  c.market.settle = async () => { writes.push(["settle"]); return { wait: async () => ({ hash: "0xsettle" }) }; };
  const book = { get: () => [], set: () => {} };
  let legacy = 0; let marked = 0;
  const options = { store: book, now, closeAt: async () => { legacy++; return { price: 90, source: "legacy" }; },
    recordSettlement: () => { marked++; } };
  await settleDue(c, { ...options, chainlinkClose: () => null });
  assert.equal(legacy, 1); assert.equal(writes[0][1], 9000000000n);
  writes.length = 0;
  await settleDue(c, { ...options, chainlinkClose: () => ({ ready: false, reason: "Validation only" }) });
  assert.equal(writes.length, 0); assert.equal(legacy, 1);
  await settleDue(c, { ...options, chainlinkClose: () => ({ ready: true, price: 8005000000n, source: "CRE", reportId: "report" }) });
  assert.equal(writes[0][1], 8005000000n); assert.equal(marked, 1); assert.equal(legacy, 1);
  writes.length = 0; c.oracle.closeAt = async () => [true, 9000000000n];
  await settleDue(c, { ...options, chainlinkClose: () => ({ ready: true, price: 8005000000n }) });
  assert.equal(writes.length, 0);
});
