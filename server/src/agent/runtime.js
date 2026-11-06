import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ethers } from "ethers";
import { AgentState } from "./state.js";
import { audit } from "./audit.js";
import { prepareUnderwriting } from "./underwriting.js";
import { validateAgentPolicy, checkStop, insurancePreflight, buyUnderwriting, buyInsurance, publishAgentAudit } from "./client.js";
import { CHAIN_ID, NETWORK, insist, normalizeIntent, units, validateQuote } from "./policy.js";
import { ERC20_ABI } from "../chain.js";

export function parameters(raw = {}) {
  insist(raw && typeof raw === "object" && !Array.isArray(raw) && Object.keys(raw).every((k) => ["shares", "deductibleBps"].includes(k)), "Unexpected protection parameters");
  const p = { shares: raw.shares ?? "0.01", deductibleBps: raw.deductibleBps ?? 1000 };
  normalizeIntent({ ...p, chainId: CHAIN_ID, buyer: ethers.ZeroAddress, symbol: "NASDAQ:NVDA", capBps: 1000, tenorDays: 7, requestId: randomUUID(), deadline: Math.floor(Date.now() / 1000) + 600 });
  return p;
}

export class AgentRuntime {
  constructor({ config, env = process.env }) {
    this.env = env;
    this.root = path.resolve(env.AGENT_STATE_DIR || ".agent-state");
    this.base = validateAgentPolicy(JSON.parse(fs.readFileSync(env.AGENT_POLICY_FILE || path.join(this.root, "policy.json"))));
    this.base.killFile = config.killFile;
    insist(this.base.origin === config.origin && this.base.merchant === config.merchant, "Runtime policy must match this merchant");
    const file = path.join(this.root, "credentials.json");
    // POSIX mode bits are not enforced on Windows (Node reports 0o666); there the per-user profile ACL protects the file.
    insist(process.platform === "win32" || (fs.statSync(file).mode & 0o077) === 0, "Agent credentials must have mode 600");
    this.credentials = JSON.parse(fs.readFileSync(file));
    this.address = new ethers.Wallet(this.credentials.privateKey).address;
    insist(!env.QUOTER_PRIVATE_KEY || this.address !== new ethers.Wallet(env.QUOTER_PRIVATE_KEY).address, "Dedicated agent wallet required");
    this.state = new AgentState(path.join(this.root, "agent.sqlite"));
    this.lock = `agent:${this.address}`;
    this.fee = config.amount;
    // A process restart cannot resume an unknown payment. Preserve its wallet lock
    // and make the stopped state visible instead of showing an endless spinner.
    for (const run of this.state.runs()) {
      if (run.status === "running") this.state.updateRun(run.id, "blocked", run.stage, run.data,
        "Server restarted during this run; reconcile recorded transactions before retrying");
    }
  }
  policy() { return validateAgentPolicy({ ...this.base, limits: { ...this.base.limits, ...this.state.settings() } }); }
  context() {
    const provider = new ethers.JsonRpcProvider(this.env.HEDERA_RPC || "https://testnet.hashio.io/api", undefined, { batchMaxCount: 1 });
    return { provider, wallet: new ethers.Wallet(this.credentials.privateKey, provider), policy: this.policy() };
  }
  intent(p) {
    return normalizeIntent({ ...parameters(p), buyer: this.address, symbol: "NASDAQ:NVDA", chainId: CHAIN_ID,
      capBps: 1000, tenorDays: 7, requestId: randomUUID(), deadline: Math.floor(Date.now() / 1000) + 600 });
  }
  status() {
    const policy = this.policy();
    return { ready: true, wallet: { address: this.address, accountId: this.credentials.accountId },
      locked: this.state.locked(this.lock), limits: policy.limits, ceilings: this.base.limits,
      budget: this.state.budget(), runs: this.state.runs(), spending: this.state.spending(),
      hcsTopic: policy.hcsTopic || null };
  }
  saveSettings(limits) {
    insist(!this.state.locked(this.lock), "Cannot change limits while running or awaiting reconciliation", 409);
    const keys = Object.keys(this.base.limits);
    insist(limits && typeof limits === "object" && !Array.isArray(limits) && Object.keys(limits).every((k) => keys.includes(k)), "Unknown spending limit");
    const next = { ...this.policy().limits, ...limits };
    validateAgentPolicy({ ...this.base, limits: next });
    for (const key of keys) insist(BigInt(next[key]) <= BigInt(this.base.limits[key]), "Limit exceeds the configured wallet ceiling");
    insist(units(next.apiPerCall) <= units(next.apiDaily) && units(next.premiumPerPolicy) <= units(next.premiumDaily) &&
      units(next.gasPerTransaction) <= units(next.gasDaily), "Daily limits must cover per-payment limits");
    this.state.saveSettings(next);
    audit(this.state, "controller.settings", { limits: next });
    return next;
  }
  async plan(p) {
    insist(!this.state.locked(this.lock), "Agent is running or needs reconciliation", 409);
    const { provider, wallet, policy } = this.context();
    try {
      checkStop(policy);
      const intent = this.intent(p);
      const { market, stable } = await insurancePreflight({ wallet, policy, intent });
      const report = await prepareUnderwriting(intent);
      validateQuote(report, intent, policy);
      const budget = this.state.budget();
      insist(units(this.fee) <= units(policy.limits.apiPerCall) && units(budget.used.api) + units(this.fee) <= units(policy.limits.apiDaily), "Underwriting service budget exhausted");
      insist(units(budget.used.premium) + units(report.quote.premium) <= units(policy.limits.premiumDaily), "Premium budget exhausted");
      insist(units(budget.used.gas) < units(policy.limits.gasDaily), "Gas budget exhausted");
      const equity = new ethers.Contract(policy.equity, ERC20_ABI, provider);
      const [held, covered, balance, native, ids] = await Promise.all([
        equity.balanceOf(this.address), market.coveredShares(this.address, ethers.id(intent.symbol)), stable.balanceOf(this.address), provider.getBalance(this.address), market.policiesOf(this.address),
      ]);
      const policies = await Promise.all(ids.map((id) => market.getPolicy(id)));
      const summary = { id: randomUUID(), parameters: parameters(p), policy: policy.limits, expiresAt: Date.now() + 120000,
        notional: report.quote.notional, premium: report.quote.premium, maxPayout: report.underwriting.maxPayout,
        serviceFee: this.fee, probabilityOfPayout: report.underwriting.probabilityOfPayout,
        holdings: { held: held.toString(), covered: covered.toString(), available: (held - covered).toString() },
        balances: { stable: balance.toString(), hbar: (native / 10000000000n).toString() },
        openPolicies: policies.filter((x) => Number(x.status) === 1).length,
        checks: ["Hedera testnet", "Verified identity", "ATS share ownership", "Dedicated wallet", "Pinned contracts", "Pool collateral", "Spending policy"] };
      this.state.db.prepare("DELETE FROM plans WHERE expires<?").run(Date.now());
      this.state.db.prepare("INSERT INTO plans VALUES (?,?,?)").run(summary.id, JSON.stringify(summary), summary.expiresAt);
      return summary;
    } finally { provider.destroy(); }
  }
  start(planId) {
    const row = this.state.db.prepare("SELECT data,expires FROM plans WHERE id=?").get(planId);
    insist(row && row.expires > Date.now(), "Preflight expired; check protection again", 409);
    const plan = JSON.parse(row.data);
    insist(JSON.stringify(plan.policy) === JSON.stringify(this.policy().limits), "Limits changed; repeat preflight", 409);
    checkStop(this.policy());
    const id = randomUUID();
    this.state.transaction(() => {
      this.state.acquire(this.lock);
      this.state.db.prepare("DELETE FROM plans WHERE id=?").run(planId);
      this.state.createRun(id, { parameters: plan.parameters, events: [] });
    });
    // No subprocess, shell text, browser-supplied destination or private key is accepted.
    this.execute(id, plan.parameters).catch((e) => console.error("[agent runtime]", e.message));
    return id;
  }
  async execute(id, p) {
    const { provider, wallet, policy } = this.context();
    const intent = this.intent(p);
    let data = { parameters: p, events: [] };
    let stage = "preflight";
    const progress = (next, detail) => {
      stage = next;
      data.events.push({ stage: next, at: new Date().toISOString(), detail });
      this.state.updateRun(id, "running", stage, data);
    };
    try {
      progress("preflight", "Checking identity, ownership and policy limits");
      await insurancePreflight({ wallet, policy, intent });
      audit(this.state, "agent.started", { requestId: intent.requestId, buyer: this.address });
      progress("underwriting", "Discovering the service and paying the x402 challenge");
      const report = await buyUnderwriting({ policy, intent, wallet, accountId: this.credentials.accountId, state: this.state });
      data.servicePayment = { amount: report.paymentAmount, transaction: report.payment.transaction, hashscan: report.hashscan };
      progress("insurance", "Underwriting settled; verifying the quote and purchasing protection");
      data.insurance = await buyInsurance({ wallet, policy, state: this.state, intent, report });
      progress("audit", "Policy issued; anchoring the spending audit");
      data.hcs = await publishAgentAudit({ state: this.state, policy, accountId: this.credentials.accountId, privateKey: this.credentials.privateKey });
      progress("complete", "Protection purchased and receipts recorded");
      const evidence = { at: new Date().toISOString(), network: NETWORK, agent: this.credentials.accountId, buyer: this.address,
        requestId: intent.requestId, servicePayment: data.servicePayment, insurance: data.insurance, hcs: data.hcs, guardrails: policy.limits };
      fs.writeFileSync(path.join(this.root, "last-run.json"), JSON.stringify(evidence, null, 2), { mode: 0o600 });
      this.state.updateRun(id, "complete", "complete", data);
      this.state.release(this.lock);
    } catch (e) {
      // Retain the same durable lock used by the CLI. Stop/resume cannot clear it.
      const message = (e.shortMessage || e.message || "Agent stopped").split("\n")[0].slice(0, 220);
      this.state.updateRun(id, "blocked", stage, data, message);
      audit(this.state, "agent.blocked", { id, stage });
    } finally { provider.destroy(); }
  }
}
