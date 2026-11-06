// Actual signed dashboard API actions against an isolated Hedera testnet agent fixture.
// No credentials/signatures are written into public evidence.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { ethers } from "ethers";
import { chain } from "../src/chain.js";
import { controlMessage } from "../src/shared/agent-control.mjs";

const base = process.env.VERIFY_AGENT_ORIGIN || "http://localhost:8083";
assert(/^http:\/\/(localhost|127\.0\.0\.1):8083$/.test(base), "Only the isolated local test merchant is allowed");
const file = path.resolve("../docs/evidence/agent-live-verification.json");
const evidence = { startedAt: new Date().toISOString(), environment: "Hedera testnet; isolated agent fixture", origin: base, checks: [] };
const save = () => fs.writeFileSync(file, JSON.stringify(evidence, null, 2) + "\n");
const c = chain(296);
async function post(endpoint, body, expected = 200) {
  const response = await fetch(base + endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  const json = await response.json();
  assert.equal(response.status, expected, json.error || `HTTP ${response.status}`);
  return json;
}
async function authorise(action, payload = {}) {
  const result = await post("/api/agent/control/challenge", { action, payload });
  const a = result.authorization;
  assert.equal(a.origin, base); assert.equal(a.chainId, 296); assert.equal(a.controller, await c.signer.getAddress());
  assert.equal(a.action, action); assert.equal(result.message, controlMessage(a));
  assert(a.expiresAt > Date.now() && a.expiresAt <= Date.now() + 125000);
  const signature = await c.signer.signMessage(result.message);
  return post("/api/agent/control", { nonce: a.nonce, signature }, action === "run" ? 202 : 200);
}
try {
  assert.equal(Number(BigInt(await c.provider.send("eth_chainId", []))), 296);
  const initial = await (await fetch(base + "/api/agent/control/status")).json();
  assert(initial.ready && initial.controlsEnabled && !initial.locked && !initial.stopped);
  evidence.agent = initial.wallet;
  const challenge = await post("/api/agent/control/challenge", { action: "plan", payload: { shares: "0.01", deductibleBps: 1000 } });
  const outsider = ethers.Wallet.createRandom();
  await post("/api/agent/control", { nonce: challenge.authorization.nonce, signature: await outsider.signMessage(challenge.message) }, 403);
  evidence.checks.push("unauthorised controller rejected"); save();
  const stopped = await authorise("stop"); assert.equal(stopped.stopped, true);
  const blocked = await post("/api/agent/control/challenge", { action: "plan", payload: { shares: "0.01", deductibleBps: 1000 } });
  await post("/api/agent/control", { nonce: blocked.authorization.nonce, signature: await c.signer.signMessage(blocked.message) }, 409);
  assert.equal((await authorise("resume")).stopped, false);
  evidence.checks.push("signed emergency stop blocks preflight; signed resume restores fixture"); save();
  const settings = await authorise("settings", { limits: initial.limits });
  assert.deepEqual(settings.limits, initial.limits);
  evidence.checks.push("signed settings persist existing limits without raising ceilings"); save();
  const planned = await authorise("plan", { shares: "0.01", deductibleBps: 1000 });
  evidence.plan = { checks: planned.plan.checks, premium: planned.plan.premium, notional: planned.plan.notional, serviceFee: planned.plan.serviceFee };
  evidence.checks.push("actual ATS holdings, KYC, available collateral and budget preflight"); save();
  const started = await authorise("run", { planId: planned.plan.id });
  evidence.runId = started.runId; save();
  // A second run cannot reuse the consumed preflight plan.
  const reused = await post("/api/agent/control/challenge", { action: "run", payload: { planId: planned.plan.id } });
  await post("/api/agent/control", { nonce: reused.authorization.nonce, signature: await c.signer.signMessage(reused.message) }, 409);
  evidence.checks.push("a consumed preflight cannot start another paid run"); save();
  const deadline = Date.now() + 8 * 60000;
  let final;
  while (Date.now() < deadline) {
    const status = await (await fetch(base + "/api/agent/control/status", { signal: AbortSignal.timeout(10000) })).json();
    const run = status.runs?.find((r) => r.id === started.runId);
    if (run) { console.log(JSON.stringify({ stage: run.stage, status: run.status, error: run.error })); evidence.stage = run.stage; save(); }
    if (run?.status === "blocked") throw new Error(`Agent stopped at ${run.stage}: ${run.error}; reconcile recorded payments before retrying`);
    if (run?.status === "complete") { final = run; evidence.budget = status.budget; break; }
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }
  assert(final, "Run outcome not yet confirmed; do not start another payment");
  evidence.servicePayment = final.data.servicePayment; evidence.insurance = final.data.insurance; evidence.hcs = final.data.hcs;
  assert(evidence.servicePayment?.transaction && evidence.insurance?.transaction && evidence.hcs?.transaction);
  evidence.checks.push("autonomous x402 fee, insurance premium/policy and HCS spending anchor confirmed");
  evidence.status = "passed";
} catch (e) {
  evidence.status = "failed"; evidence.error = e.shortMessage || e.message; process.exitCode = 1;
} finally { evidence.finishedAt = new Date().toISOString(); save(); c.provider.destroy(); }
console.log(JSON.stringify(evidence, null, 2));
