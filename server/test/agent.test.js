import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import express from "express";
import { ethers } from "ethers";
import { TransferTransaction, TransactionId, AccountId, PrivateKey, Hbar } from "@hiero-ledger/sdk";
import { encodePaymentSignatureHeader, decodePaymentRequiredHeader } from "@x402/core/http";
import { inspectHederaTransaction } from "@x402/hedera";
import { AgentState } from "../src/agent/state.js";
import { mountAgentRoutes, merchantConfig, FEE_PAYER, FACILITATOR } from "../src/agent/merchant.js";
import { DEFAULT_LIMITS, CHAIN_ID, NETWORK, PATH, normalizeIntent, intentMessage, validateRequirements, validateQuote } from "../src/agent/policy.js";
import { validateAgentPolicy, buyUnderwriting, checkStop } from "../src/agent/client.js";
import { audit } from "../src/agent/audit.js";

const wallet = ethers.Wallet.createRandom();
const makeIntent = () => normalizeIntent({ chainId: CHAIN_ID, buyer: wallet.address, symbol: "NASDAQ:NVDA", shares: "0.01", deductibleBps: 1000, capBps: 1000, tenorDays: 7, requestId: randomUUID(), deadline: Math.floor(Date.now() / 1000) + 600 });
const policy = () => ({ chainId: CHAIN_ID, network: NETWORK, origin: "http://localhost:8080", merchant: "0.0.1234", feePayer: FEE_PAYER, facilitator: FACILITATOR,
  market: ethers.Wallet.createRandom().address, stable: ethers.Wallet.createRandom().address, equity: ethers.Wallet.createRandom().address,
  identity: ethers.Wallet.createRandom().address, pool: ethers.Wallet.createRandom().address, limits: { ...DEFAULT_LIMITS } });
const required = (p, endpoint) => ({ x402Version: 2, resource: { url: endpoint }, accepts: [{ scheme: "exact", network: NETWORK, asset: "0.0.0", amount: "1000000", payTo: p.merchant, maxTimeoutSeconds: 120, extra: { feePayer: FEE_PAYER } }] });
function database(t) {
  // macOS /var is durable enough for a test fixture; production /tmp is deliberately rejected.
  const dir = fs.mkdtempSync(path.join(os.homedir(), ".insurevex-test-"));
  const state = new AgentState(path.join(dir, "state.sqlite"));
  t.after(() => { state.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return state;
}

test("policy rejects mainnet, invalid amounts, untrusted origins, and excessive limits", () => {
  assert.throws(() => normalizeIntent({ ...makeIntent(), chainId: 295 }), /testnet/);
  assert.throws(() => normalizeIntent({ ...makeIntent(), shares: "NaN" }), /Shares/);
  assert.throws(() => normalizeIntent({ ...makeIntent(), shares: "0.11" }), /Shares/);
  assert.throws(() => normalizeIntent({ ...makeIntent(), capBps: 2000 }), /7-day/);
  assert.throws(() => validateAgentPolicy({ ...policy(), origin: "http://evil.example" }), /HTTPS/);
  const p = policy(); p.limits.premiumDaily = "2000001";
  assert.throws(() => validateAgentPolicy(p), /Unsafe/);
  assert.equal(merchantConfig({}), null);
  assert.throws(() => merchantConfig({ X402_ENABLED: "1", VERCEL: "1" }), /persistent/);
});

test("client rejects malicious payment requirements before signing", () => {
  const p = policy(); const endpoint = `${p.origin}${PATH}`;
  const good = required(p, endpoint);
  assert.equal(validateRequirements(good, p, endpoint).amount, "1000000");
  for (const patch of [{ network: "hedera:mainnet" }, { scheme: "upto" }, { asset: "0.0.429274" }, { payTo: "0.0.999" },
    { amount: "1000001" }, { amount: "-1" }, { amount: "1e6" }, { extra: { feePayer: "0.0.999" } },
    { extra: { feePayer: FEE_PAYER, assetTransferMethod: "transferExecutor" } }]) {
    assert.throws(() => validateRequirements({ ...good, accepts: [{ ...good.accepts[0], ...patch }] }, p, endpoint));
  }
  assert.throws(() => validateRequirements({ ...good, resource: { url: "https://evil.example" } }, p, endpoint), /resource/);
});

test("persistent spending reservations, duplicate IDs, and locks survive reopening", (t) => {
  const s = database(t);
  s.reserve("one", "api", "merchant", 3n, 3n, 5n);
  s.spent("one", "unknown");
  assert.throws(() => s.reserve("two", "api", "merchant", 3n, 3n, 5n), /budget/);
  assert.throws(() => s.reserve("one", "api", "merchant", 1n, 3n, 5n), /UNIQUE/);
  s.acquire("agent");
  assert.throws(() => s.acquire("agent"), /reconciliation/);
  s.release("agent"); s.acquire("agent");
  const file = s.db.location();
  const other = new AgentState(file);
  assert.equal(other.spending()[0].amount, "3");
  assert.throws(() => other.acquire("agent"), /reconciliation/);
  assert.throws(() => other.reserve("two", "api", "other-merchant", 3n, 3n, 5n), /budget/);
  other.close(); // close before the fixture deletes its folder (Windows cannot delete an open SQLite file)
});

test("emergency stop and audit chain", (t) => {
  const s = database(t);
  const a = audit(s, "first", { amount: "1" });
  audit(s, "second", { amount: "2" });
  assert.equal(s.events()[0].previous, a);
  const p = { ...policy(), killFile: path.join(path.dirname(s.db.location()), "STOP") };
  fs.writeFileSync(p.killFile, "stop");
  assert.throws(() => checkStop(p), /Emergency/);
});

function report(intent, p) {
  const now = Math.floor(Date.now() / 1000);
  return { ok: true, chainId: CHAIN_ID, contract: p.market, signature: "0x", quote: { buyer: intent.buyer, symbol: ethers.id(intent.symbol), market: ethers.id("US"), shares: ethers.parseEther(intent.shares).toString(), heldShares: ethers.parseEther("1").toString(), notional: "2000000", premium: "1000", startPrice: "20000000000", deductibleBps: intent.deductibleBps, capBps: 1000, expiry: now + 7 * 86400, validUntil: now + 300, nonce: "1" } };
}

test("agent rejects tampered quotes and expensive premiums", () => {
  const i = makeIntent(); const p = policy(); const r = report(i, p);
  assert.equal(validateQuote(r, i, p), r.quote);
  for (const patch of [{ buyer: ethers.ZeroAddress }, { shares: "1" }, { premium: "1000001" }, { notional: "25000001" }, { validUntil: 1 }, { capBps: 2000 }, { market: ethers.ZeroHash }]) {
    assert.throws(() => validateQuote({ ...r, quote: { ...r.quote, ...patch } }, i, p));
  }
});

async function payment(r) {
  const tx = new TransferTransaction().setNodeAccountIds([AccountId.fromString("0.0.3")])
    .setTransactionId(TransactionId.generate(AccountId.fromString(FEE_PAYER)))
    .addHbarTransfer("0.0.5678", Hbar.fromTinybars(-Number(r.accepts[0].amount)))
    .addHbarTransfer(r.accepts[0].payTo, Hbar.fromTinybars(r.accepts[0].amount)).freeze();
  const signed = await tx.sign(PrivateKey.generateECDSA());
  return { x402Version: 2, resource: r.resource, accepted: r.accepts[0], payload: { transaction: Buffer.from(signed.toBytes()).toString("base64") } };
}

async function merchant(t, overrides = {}) {
  const p = policy(); const state = database(t);
  const app = express(); app.use(express.json());
  const stats = { verified: 0, settled: 0 };
  const facilitator = {
    async getSupported() { return { kinds: [{ x402Version: 2, network: NETWORK, scheme: "exact", extra: { feePayer: FEE_PAYER } }] }; },
    async verify() { stats.verified++; return { isValid: true }; },
    async settle(payload) { stats.settled++; return { success: true, network: NETWORK, transaction: inspectHederaTransaction(payload.payload.transaction).transactionId }; },
    ...overrides,
  };
  mountAgentRoutes(app, { config: { origin: p.origin, merchant: p.merchant, amount: "1000000", killFile: "/nonexistent-insurevex-stop" }, state, facilitator, prepare: async (i) => report(i, p) });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const url = `http://127.0.0.1:${server.address().port}${PATH}`;
  const intent = makeIntent();
  const body = JSON.stringify({ intent, signature: await wallet.signMessage(intentMessage(intent)) });
  const post = (payload, bodyOverride = body) => fetch(url, { method: "POST", headers: { "content-type": "application/json", ...(payload ? { "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(payload) } : {}) }, body: bodyOverride });
  return { p, state, stats, intent, post };
}

test("402 handshake, official Hedera payload decoding, settled response and idempotency", async (t) => {
  const m = await merchant(t);
  const unpaid = await m.post(); assert.equal(unpaid.status, 402);
  const r = decodePaymentRequiredHeader(unpaid.headers.get("PAYMENT-REQUIRED"));
  const payload = await payment(r);
  const paid = await m.post(payload); assert.equal(paid.status, 200, await paid.clone().text());
  const body = await paid.json(); assert.equal(body.payment.success, true);
  assert.match(body.hashscan, /^https:\/\/hashscan.io\/testnet/);
  assert.equal((await m.post(payload)).status, 200);
  assert.equal(m.stats.settled, 1);
});

test("concurrent duplicate requests cannot settle twice", async (t) => {
  const m = await merchant(t, { async verify() { await new Promise((r) => setTimeout(r, 30)); return { isValid: true }; } });
  const unpaid = await m.post(); const payload = await payment(await unpaid.json());
  const results = await Promise.all([m.post(payload), m.post(payload)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(m.stats.settled, 1);
});

test("uncertain settlement fails closed and cannot be automatically retried", async (t) => {
  let calls = 0;
  const m = await merchant(t, { async settle() { calls++; throw new Error("network timeout"); } });
  const unpaid = await m.post(); const payload = await payment(await unpaid.json());
  assert.equal((await m.post(payload)).status, 503);
  assert.equal((await m.post(payload)).status, 409);
  assert.equal(calls, 1);
});

test("invalid intent and changed recipient are rejected before facilitator settlement", async (t) => {
  const m = await merchant(t);
  assert.equal((await m.post(null, JSON.stringify({ intent: m.intent, signature: "0x00" }))).status, 403);
  const unpaid = await m.post(); const payload = await payment(await unpaid.json());
  payload.accepted.payTo = "0.0.999";
  assert.equal((await m.post(payload)).status, 400);
  assert.equal(m.stats.settled, 0);
});

test("agent will not sign or reserve spending for an untrusted merchant", async (t) => {
  const s = database(t); const p = policy();
  await assert.rejects(buyUnderwriting({ policy: p, intent: makeIntent(), wallet, accountId: "0.0.5678", state: s,
    fetchJson: async () => ({ response: { ok: true }, body: { enabled: true, merchant: "0.0.999" } }) }), /allowlist/);
  assert.equal(s.spending().length, 0);
});
