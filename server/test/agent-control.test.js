import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import express from "express";
import { ethers } from "ethers";
import { controlMessage, canonicalJson } from "../../shared/agent-control.mjs";
import { mountAgentControls, controlPayload } from "../src/agent/control.js";
import { AgentState } from "../src/agent/state.js";
import { AgentRuntime } from "../src/agent/runtime.js";
import { CHAIN_ID, NETWORK, DEFAULT_LIMITS } from "../src/agent/policy.js";
import { FACILITATOR, FEE_PAYER } from "../src/agent/protocol.js";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.homedir(), ".insurevex-control-test-"));
  const state = new AgentState(path.join(root, "agent.sqlite"));
  t.after(() => { state.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, state };
}
function policy() {
  return { chainId: CHAIN_ID, network: NETWORK, origin: "http://localhost:8080", merchant: "0.0.1234", feePayer: FEE_PAYER, facilitator: FACILITATOR,
    ...Object.fromEntries(["market", "stable", "equity", "identity", "pool"].map((k) => [k, ethers.Wallet.createRandom().address])), limits: { ...DEFAULT_LIMITS } };
}

async function controllerApp(t, options = {}) {
  const { root, state } = fixture(t);
  const controller = ethers.Wallet.createRandom();
  const config = { origin: "http://localhost:8080", killFile: path.join(root, "STOP") };
  const env = { AGENT_CONTROLLER_ADDRESS: controller.address, ...options.env };
  const counts = { runs: 0, plans: 0, settings: 0 };
  let locked = false;
  const runtime = {
    status: () => ({ ready: true, locked, limits: DEFAULT_LIMITS, runs: [], spending: [] }),
    plan: async (p) => { counts.plans++; return { id: randomUUID(), parameters: p }; },
    start: () => { assert.equal(locked, false); locked = true; counts.runs++; return "test-run"; },
    saveSettings: (limits) => { counts.settings++; return limits; },
  };
  const app = express(); app.use(express.json());
  mountAgentControls(app, { config: options.disabled ? null : config, env, runtime, state });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}/api/agent/control`;
  const post = (suffix, body) => fetch(base + suffix, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  async function authorize(action, payload = {}, signer = controller) {
    const res = await post("/challenge", { action, payload });
    assert.equal(res.status, 200, await res.clone().text());
    const { authorization, message } = await res.json();
    assert.equal(message, controlMessage(authorization));
    return { nonce: authorization.nonce, signature: await signer.signMessage(message) };
  }
  return { state, config, counts, controller, post, authorize, base };
}

test("signed controls are disabled unless a controller and merchant are configured", async (t) => {
  const a = await controllerApp(t, { disabled: true });
  assert.equal((await a.post("/challenge", { action: "run", payload: { planId: randomUUID() } })).status, 503);
  assert.equal((await a.post("", {})).status, 503);
  assert.equal(a.counts.runs, 0);
});

test("only controller signatures work; successful nonce is consumed once", async (t) => {
  const a = await controllerApp(t);
  const wrong = await a.authorize("plan", { shares: "0.01", deductibleBps: 1000 }, ethers.Wallet.createRandom());
  assert.equal((await a.post("", wrong)).status, 403);
  assert.equal(a.counts.plans, 0);
  const signed = await a.authorize("plan", { shares: "0.01", deductibleBps: 1000 });
  assert.equal((await a.post("", signed)).status, 200);
  assert.equal((await a.post("", signed)).status, 403);
  assert.equal(a.counts.plans, 1);
});

test("expired and tampered authorisations cannot execute", async (t) => {
  const a = await controllerApp(t);
  const signed = await a.authorize("run", { planId: randomUUID() });
  const row = a.state.db.prepare("SELECT authorization FROM control_nonces WHERE nonce=?").get(signed.nonce);
  const changed = JSON.parse(row.authorization); changed.action = "resume"; changed.payload = {};
  a.state.db.prepare("UPDATE control_nonces SET authorization=? WHERE nonce=?").run(JSON.stringify(changed), signed.nonce);
  assert.equal((await a.post("", signed)).status, 403);
  const expired = await a.authorize("run", { planId: randomUUID() });
  a.state.db.prepare("UPDATE control_nonces SET expires=? WHERE nonce=?").run(Date.now() - 1, expired.nonce);
  assert.equal((await a.post("", expired)).status, 403);
  assert.equal(a.counts.runs, 0);
});

test("duplicate concurrent signed runs execute at most once", async (t) => {
  const a = await controllerApp(t);
  const signed = await a.authorize("run", { planId: randomUUID() });
  const results = await Promise.all([a.post("", signed), a.post("", signed)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [202, 403]);
  assert.equal(a.counts.runs, 1);
});

test("stop is durable, and resume cannot clear an active run lock", async (t) => {
  const a = await controllerApp(t);
  assert.equal((await a.post("", await a.authorize("stop"))).status, 200);
  assert.equal(fs.existsSync(a.config.killFile), true);
  assert.equal((await a.post("", await a.authorize("plan", { shares: "0.01", deductibleBps: 1000 }))).status, 409);
  assert.equal((await a.post("", await a.authorize("resume"))).status, 200);
  assert.equal(fs.existsSync(a.config.killFile), false);
  await a.post("", await a.authorize("run", { planId: randomUUID() }));
  await a.post("", await a.authorize("stop"));
  assert.equal((await a.post("", await a.authorize("resume"))).status, 409);
  assert.equal(fs.existsSync(a.config.killFile), true);
});

test("an environment stop cannot be removed through the dashboard", async (t) => {
  const a = await controllerApp(t, { env: { AGENT_KILL_SWITCH: "1" } });
  assert.equal((await a.post("", await a.authorize("resume"))).status, 409);
  assert.equal(a.counts.runs, 0);
});

test("unknown parameters and unsafe spending limits are rejected before signing", () => {
  assert.throws(() => controlPayload("plan", { shares: "0.01", deductibleBps: 1000, privateKey: "no" }), /Unexpected/);
  assert.throws(() => controlPayload("settings", { limits: { gasDaily: "200000001" } }), /ceiling/);
  assert.throws(() => controlPayload("settings", { limits: { merchant: "0.0.999" } }), /Unexpected/);
  assert.throws(() => controlPayload("run", { command: "arbitrary shell" }), /preflight/);
  assert.throws(() => controlPayload("resume", { clearLocks: true }), /no parameters/);
  assert.equal(canonicalJson({ b: 1, a: { c: 2 } }), canonicalJson({ a: { c: 2 }, b: 1 }));
});

test("budget edits persist, respect wallet ceilings and cannot race active runs", (t) => {
  const { state } = fixture(t);
  const runtime = Object.assign(Object.create(AgentRuntime.prototype), { state, base: policy(), lock: "wallet" });
  assert.equal(runtime.saveSettings({ premiumDaily: "1500000" }).premiumDaily, "1500000");
  assert.equal(runtime.policy().limits.premiumDaily, "1500000");
  assert.throws(() => runtime.saveSettings({ premiumDaily: "2000001" }), /Unsafe/);
  assert.throws(() => runtime.saveSettings({ premiumDaily: "500000" }), /Daily/);
  state.acquire("wallet");
  assert.throws(() => runtime.saveSettings({ premiumDaily: "2000000" }), /running/);
});

test("preflight is single-use and cannot launch two wallet runs or reuse changed limits", (t) => {
  const { state } = fixture(t);
  let calls = 0;
  const runtime = Object.assign(Object.create(AgentRuntime.prototype), { state, base: policy(), lock: "wallet", execute: async () => { calls++; } });
  const planId = randomUUID();
  const data = { parameters: { shares: "0.01", deductibleBps: 1000 }, policy: runtime.policy().limits };
  state.db.prepare("INSERT INTO plans VALUES (?,?,?)").run(planId, JSON.stringify(data), Date.now() + 10000);
  runtime.start(planId);
  assert.equal(calls, 1); assert.equal(state.locked("wallet"), true);
  assert.throws(() => runtime.start(planId), /expired/);
  const nextId = randomUUID();
  state.db.prepare("INSERT INTO plans VALUES (?,?,?)").run(nextId, JSON.stringify(data), Date.now() + 10000);
  assert.throws(() => runtime.start(nextId), /reconciliation/);
  state.release("wallet");
  runtime.saveSettings({ premiumDaily: "1500000" });
  assert.throws(() => runtime.start(nextId), /Limits changed/);
  assert.equal(calls, 1);
});

test("public status exposes no credentials or reusable authorisations", async (t) => {
  const a = await controllerApp(t);
  await a.authorize("plan", { shares: "0.01", deductibleBps: 1000 });
  const response = await fetch(a.base + "/status");
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.equal(text.includes("privateKey"), false);
  assert.equal(text.includes("signature"), false);
  assert.equal(text.includes("nonce"), false);
});
