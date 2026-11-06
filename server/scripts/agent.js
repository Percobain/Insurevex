import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ethers } from "ethers";
import { AgentState } from "../src/agent/state.js";
import { normalizeIntent, DEFAULT_LIMITS, NETWORK, CHAIN_ID, insist } from "../src/agent/policy.js";
import { validateAgentPolicy, insurancePreflight, buyUnderwriting, buyInsurance, publishAgentAudit } from "../src/agent/client.js";
import { audit } from "../src/agent/audit.js";

const root = path.resolve(process.env.AGENT_STATE_DIR || ".agent-state");
const execute = process.argv.includes("--execute");
let state;
let lock;
let completed = false;
try {
  const policyFile = process.env.AGENT_POLICY_FILE || path.join(root, "policy.json");
  if (!fs.existsSync(policyFile) && !execute) {
    console.log(JSON.stringify({ mode: "plan", network: NETWORK, chainId: CHAIN_ID, limits: DEFAULT_LIMITS,
      next: "Run npm run agent:setup to provision an isolated testnet wallet, then start the x402 merchant and run agent:plan again." }, null, 2));
  } else {
    const base = JSON.parse(fs.readFileSync(policyFile));
    state = new AgentState(path.join(root, "agent.sqlite"));
    const policy = validateAgentPolicy({ ...base, limits: { ...base.limits, ...state.settings() },
      killFile: process.env.AGENT_KILL_FILE ? path.resolve(process.env.AGENT_KILL_FILE) : base.killFile });
    const credentialFile = path.join(root, "credentials.json");
    insist((fs.statSync(credentialFile).mode & 0o077) === 0, "Agent credentials must have mode 600");
    const credentials = JSON.parse(fs.readFileSync(credentialFile));
    const provider = new ethers.JsonRpcProvider(process.env.HEDERA_RPC || "https://testnet.hashio.io/api", undefined, { batchMaxCount: 1 });
    const wallet = new ethers.Wallet(credentials.privateKey, provider);
    const quoter = process.env.QUOTER_PRIVATE_KEY ? new ethers.Wallet(process.env.QUOTER_PRIVATE_KEY).address : null;
    insist(wallet.address !== quoter, "Agent must never use the privileged quoter wallet");
    const intent = normalizeIntent({ chainId: CHAIN_ID, buyer: wallet.address, symbol: "NASDAQ:NVDA", shares: process.env.AGENT_SHARES || "0.01",
      deductibleBps: Number(process.env.AGENT_DEDUCTIBLE_BPS || 1000), capBps: 1000, tenorDays: 7,
      requestId: randomUUID(), deadline: Math.floor(Date.now() / 1000) + 600 });
    await insurancePreflight({ wallet, policy, intent });
    if (!execute) {
      console.log(JSON.stringify({ mode: "plan", intent, limits: policy.limits, merchant: policy.merchant,
        message: "Read-only preflight passed. agent:run executes one bounded autonomous purchase with no per-payment approval." }, null, 2));
    } else {
      lock = `agent:${wallet.address}`;
      state.acquire(lock);
      audit(state, "agent.started", { requestId: intent.requestId, buyer: wallet.address });
      console.log("Dedicated Hedera testnet agent:", credentials.accountId);
      console.log("Discovering and paying for underwriting within the pinned spending policy...");
      const report = await buyUnderwriting({ wallet, accountId: credentials.accountId, policy, intent, state });
      console.log("x402 payment settled:", report.hashscan);
      console.log("Verifying signed quote, holdings and collateral; buying cover with an exact premium approval...");
      const insurance = await buyInsurance({ wallet, policy, state, intent, report });
      console.log("Insurance premium paid:", insurance.hashscan);
      const hcs = await publishAgentAudit({ state, policy, accountId: credentials.accountId, privateKey: credentials.privateKey });
      const evidence = { at: new Date().toISOString(), network: NETWORK, agent: credentials.accountId, buyer: wallet.address,
        requestId: intent.requestId, servicePayment: { amount: report.paymentAmount, transaction: report.payment.transaction, hashscan: report.hashscan },
        insurance, hcs, guardrails: policy.limits };
      fs.writeFileSync(path.join(root, "last-run.json"), JSON.stringify(evidence, null, 2), { mode: 0o600 });
      completed = true;
      console.log(JSON.stringify(evidence, null, 2));
    }
    provider.destroy();
  }
} catch (e) {
  console.error("Agent stopped:", e.shortMessage || e.message);
  if (state && lock) console.error("Persistent lock retained. Inspect agent.sqlite and HashScan before clearing the lock; do not automatically retry.");
  process.exitCode = 1;
} finally {
  if (completed && lock) state.release(lock);
  state?.close();
}
