import { createHash } from "node:crypto";
import { ethers } from "ethers";

export const NETWORK = "hedera:testnet";
export const CHAIN_ID = 296;
export const PATH = "/api/agent/underwrite";
export const SYMBOL = "NASDAQ:NVDA";
export const DEFAULT_LIMITS = Object.freeze({
  apiPerCall: "1000000", apiDaily: "5000000", // 0.01 / 0.05 HBAR, tinybars
  premiumPerPolicy: "1000000", premiumDaily: "2000000", // 1 / 2 test USD, 6 dp
  gasPerTransaction: "100000000", gasDaily: "200000000", // 1 / 2 HBAR
  notionalPerPolicy: "25000000", maxOpenPolicies: 3,
});

export function insist(ok, message, status = 400) {
  if (!ok) throw Object.assign(new Error(message), { status });
}

export function units(value, label = "amount") {
  insist(typeof value === "string" && /^(0|[1-9]\d{0,19})$/.test(value), `Invalid ${label}`);
  return BigInt(value);
}

export const hash = (value) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const hashscan = (tx) => `https://hashscan.io/testnet/transaction/${encodeURIComponent(tx)}`;

// Reconstruct in a fixed order; unknown properties are never signed or acted upon.
export function normalizeIntent(raw, now = Math.floor(Date.now() / 1000)) {
  insist(raw && typeof raw === "object", "Missing intent");
  insist(raw.chainId === CHAIN_ID, "Hedera testnet only");
  insist(ethers.isAddress(raw.buyer), "Invalid buyer");
  insist(raw.symbol === SYMBOL, "Symbol is not allowlisted");
  insist(typeof raw.requestId === "string" && /^[a-f0-9-]{36}$/.test(raw.requestId), "Invalid request ID");
  insist(Number.isSafeInteger(raw.deadline) && raw.deadline > now && raw.deadline <= now + 600, "Intent expired or deadline too long");
  insist(typeof raw.shares === "string" && /^0\.\d{1,8}$/.test(raw.shares) && Number(raw.shares) > 0 && Number(raw.shares) <= 0.1, "Shares must be > 0 and <= 0.1");
  insist([300, 500, 750, 1000, 1500, 2000, 2500].includes(raw.deductibleBps), "Invalid deductible");
  insist(raw.capBps === 1000 && raw.tenorDays === 7, "Agent allows only 7-day, 10%-cap policies");
  return { chainId: CHAIN_ID, buyer: ethers.getAddress(raw.buyer), symbol: SYMBOL, shares: raw.shares,
    deductibleBps: raw.deductibleBps, capBps: raw.capBps, tenorDays: raw.tenorDays,
    requestId: raw.requestId, deadline: raw.deadline };
}

export const intentMessage = (intent) => `InsureVEX testnet underwriting request v1\n${JSON.stringify(intent)}`;

export function validateRequirements(required, policy, endpoint) {
  insist(required?.x402Version === 2 && required.resource?.url === endpoint, "Untrusted x402 resource");
  insist(Array.isArray(required.accepts) && required.accepts.length === 1, "Ambiguous payment requirements");
  const r = required.accepts[0];
  insist(r.scheme === "exact" && r.network === NETWORK && r.asset === "0.0.0", "Only exact testnet HBAR payments are allowed");
  insist(r.payTo === policy.merchant && r.extra?.feePayer === policy.feePayer, "Merchant or facilitator fee payer is not allowlisted");
  insist(Object.keys(r.extra || {}).every((k) => k === "feePayer"), "Unexpected payment execution method");
  insist(r.maxTimeoutSeconds === 120 && units(r.amount) > 0n && units(r.amount) <= units(policy.limits.apiPerCall), "Service fee exceeds policy");
  return r;
}

export function validateQuote(report, intent, policy, now = Math.floor(Date.now() / 1000)) {
  const q = report?.quote;
  insist(report?.ok && q && report.chainId === CHAIN_ID, "Underwriting refused");
  insist(report.contract?.toLowerCase() === policy.market.toLowerCase(), "CoverMarket is not allowlisted");
  insist(q.buyer === intent.buyer && q.symbol === ethers.id(intent.symbol) && q.market === ethers.id("US"), "Quote identity mismatch");
  insist(q.shares === ethers.parseEther(intent.shares).toString(), "Quote shares mismatch");
  insist(q.deductibleBps === intent.deductibleBps && q.capBps === intent.capBps, "Quote terms mismatch");
  insist(q.expiry > now && Math.abs(q.expiry - (now + 7 * 86400)) <= 600 && q.validUntil > now + 15 && q.validUntil <= intent.deadline, "Quote expired or tenor mismatch");
  insist(units(q.notional) > 0n && units(q.notional) <= units(policy.limits.notionalPerPolicy), "Notional exceeds policy");
  insist(units(q.premium) > 0n && units(q.premium) <= units(policy.limits.premiumPerPolicy), "Premium exceeds policy");
  insist(units(q.startPrice) > 0n && units(q.heldShares) >= units(q.shares), "Invalid price or holdings");
  return q;
}
