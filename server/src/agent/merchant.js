import path from "node:path";
import fs from "node:fs";
import { ethers } from "ethers";
import { HTTPFacilitatorClient, decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader } from "@x402/core/http";
import { inspectHederaTransaction } from "@x402/hedera";
import { Transaction, TransferTransaction } from "@hiero-ledger/sdk";
import { AgentState } from "./state.js";
import { audit } from "./audit.js";
import { prepareUnderwriting } from "./underwriting.js";
import { CHAIN_ID, NETWORK, PATH, DEFAULT_LIMITS, insist, normalizeIntent, intentMessage, hash, same, hashscan, units } from "./policy.js";

export const FACILITATOR = "https://x402.org/facilitator";
export const FEE_PAYER = "0.0.9185802";

export function merchantConfig(env = process.env) {
  if (env.X402_ENABLED !== "1") return null;
  insist(!env.VERCEL, "x402 requires a persistent single-instance server; serverless state is unsupported", 503);
  insist(/^0\.0\.[1-9]\d*$/.test(env.X402_MERCHANT_ACCOUNT || ""), "Configure X402_MERCHANT_ACCOUNT", 503);
  const origin = new URL(env.X402_PUBLIC_ORIGIN || "http://localhost:8080");
  insist((origin.protocol === "https:" || (origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname))) && !origin.username && !origin.password && origin.pathname === "/", "Invalid public origin", 503);
  const amount = env.X402_PRICE_TINYBARS || DEFAULT_LIMITS.apiPerCall;
  insist(units(amount) > 0n && units(amount) <= BigInt(DEFAULT_LIMITS.apiPerCall), "x402 fee exceeds testnet maximum", 503);
  return { origin: origin.origin, merchant: env.X402_MERCHANT_ACCOUNT, amount,
    stateFile: env.X402_STATE_FILE || path.resolve(".agent-state/merchant.sqlite"), killFile: path.resolve(env.AGENT_KILL_FILE || ".agent-state/STOP") };
}

export function mountAgentRoutes(app, options = {}) {
  const config = options.config === undefined ? merchantConfig() : options.config;
  const state = config ? (options.state || new AgentState(config.stateFile)) : null;
  const facilitator = options.facilitator || new HTTPFacilitatorClient({ url: FACILITATOR, timeoutMs: 25000 });
  const prepare = options.prepare || prepareUnderwriting;
  const stopped = () => process.env.AGENT_KILL_SWITCH === "1" || (config && fs.existsSync(config.killFile));
  let supportedAt = 0;
  async function supported() {
    if (Date.now() - supportedAt < 60000) return;
    const s = await facilitator.getSupported();
    insist(s.kinds?.some((k) => k.x402Version === 2 && k.scheme === "exact" && k.network === NETWORK && k.extra?.feePayer === FEE_PAYER), "Facilitator does not advertise the pinned Hedera testnet fee payer", 503);
    supportedAt = Date.now();
  }
  app.get("/api/agent/discovery", (req, res) => res.json({
    name: "InsureVEX underwriting agent", enabled: Boolean(config) && !stopped(), network: NETWORK, chainId: CHAIN_ID,
    endpoint: config ? `${config.origin}${PATH}` : null, method: "POST", facilitator: FACILITATOR,
    merchant: config?.merchant || null, feePayer: FEE_PAYER, asset: "0.0.0", amount: config?.amount || null,
    limits: DEFAULT_LIMITS, symbols: ["NASDAQ:NVDA"], holdings: "on-chain ATS only",
    description: "Buy an underwriting quote with x402; pay the insurance premium separately through CoverMarket.",
  }));
  app.get("/api/agent/activity", (req, res) => {
    // Public evidence only. Intent bodies, signatures and database contents stay private.
    const events = state?.events().map((e) => ({ seq: e.seq, at: e.at, event: e.event, digest: e.digest,
      transaction: e.data.transaction || null, hashscan: e.data.transaction ? hashscan(e.data.transaction) : null })) || [];
    res.json({ network: NETWORK, events });
  });
  app.post(PATH, async (req, res) => {
    try {
      res.set("Cache-Control", "no-store");
      insist(config && !stopped(), "Agent payments disabled or emergency stop active", 503);
      const intent = normalizeIntent(req.body?.intent);
      let buyer;
      try { buyer = ethers.verifyMessage(intentMessage(intent), req.body.signature); } catch { /* invalid signature */ }
      insist(buyer === intent.buyer, "Invalid buyer intent signature", 403);
      const id = `${intent.buyer}:${intent.requestId}`;
      const digest = hash(intent);
      let row = state.get(id);
      if (row) insist(row.intent_hash === digest, "Request ID reused with different intent", 409);
      if (!row) {
        // Check insurability before asking for money. Never charge for an obvious refusal.
        const report = await prepare(intent);
        await supported();
        const resource = { url: `${config.origin}${PATH}?requestId=${intent.requestId}`, description: "InsureVEX testnet underwriting quote", mimeType: "application/json" };
        const requirements = { scheme: "exact", network: NETWORK, asset: "0.0.0", amount: config.amount,
          payTo: config.merchant, maxTimeoutSeconds: 120, extra: { feePayer: FEE_PAYER } };
        state.put(id, digest, { report, resource, requirements });
        row = state.get(id);
      }
      if (row.status === "complete") {
        res.set("PAYMENT-RESPONSE", encodePaymentResponseHeader(row.data.settlement));
        return res.json({ ...row.data.report, payment: row.data.settlement, hashscan: hashscan(row.data.settlement.transaction) });
      }
      insist(row.status === "quoted", "Prior payment outcome requires reconciliation; do not pay again", 409);
      insist(row.data.report.quote.validUntil > Math.floor(Date.now() / 1000) + 15, "Prepared quote expired; create a new request", 409);
      const required = { x402Version: 2, resource: row.data.resource, accepts: [row.data.requirements] };
      const header = req.get("PAYMENT-SIGNATURE");
      if (!header) return res.status(402).set("PAYMENT-REQUIRED", encodePaymentRequiredHeader(required)).json(required);
      insist(header.length <= 60000, "Payment header too large");
      const payload = decodePaymentSignatureHeader(header);
      insist(payload.x402Version === 2 && same(payload.accepted, row.data.requirements) && same(payload.resource, row.data.resource), "Payment requirements or resource mismatch");
      const transaction = inspectHederaTransaction(payload.payload?.transaction);
      const nativeTransaction = Transaction.fromBytes(Buffer.from(payload.payload.transaction, "base64"));
      // Bind application replay protection to the native transaction ID, not its mutable encoding.
      insist(transaction.transactionIdAccountId === FEE_PAYER, "Wrong fee payer");
      const payerDebits = transaction.hbarTransfers.filter((t) => BigInt(t.amount) < 0n);
      const credits = transaction.hbarTransfers.filter((t) => BigInt(t.amount) > 0n);
      // SDK builds minify constructor names, so use instanceof rather than inspector.transactionType.
      insist(nativeTransaction instanceof TransferTransaction && !transaction.hasNonTransferOperations &&
        Object.keys(transaction.tokenTransfers).length === 0 && payerDebits.length === 1 &&
        payerDebits[0].accountId !== FEE_PAYER && BigInt(payerDebits[0].amount) === -BigInt(config.amount) &&
        credits.length === 1 && credits[0].accountId === config.merchant && BigInt(credits[0].amount) === BigInt(config.amount), "Unexpected payment transfers");
      state.claim(id, hash(transaction.transactionId));
      try {
        const verified = await facilitator.verify(payload, row.data.requirements);
        insist(verified.isValid, "Facilitator rejected payment", 402);
        insist(!stopped(), "Emergency stop active", 503);
        const result = await facilitator.settle(payload, row.data.requirements);
        const tx = result.transaction || result.transactionId;
        insist(result.success === true && result.network === NETWORK && typeof tx === "string" && tx === transaction.transactionId, "Settlement was not confirmed", 502);
        const settlement = { ...result, transaction: tx };
        state.finish(id, "complete", { ...row.data, settlement });
        audit(state, "x402.settled", { requestId: intent.requestId, amount: config.amount, transaction: tx });
        res.set("PAYMENT-RESPONSE", encodePaymentResponseHeader(settlement));
        return res.json({ ...row.data.report, payment: settlement, hashscan: hashscan(tx) });
      } catch (e) {
        // A timeout may mean the payment settled. Never retry settlement or issue a new debit automatically.
        if (state.get(id)?.status !== "complete") state.finish(id, "unknown", row.data);
        throw e;
      }
    } catch (e) {
      res.status(e.status || 503).json({ ok: false, error: e.status ? e.message : "Agent service unavailable; inspect operator logs before retrying" });
      if (!e.status) console.error("[agent]", e.message);
    }
  });
  return { state };
}
