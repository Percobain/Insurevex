import fs from "node:fs";
import { ethers } from "ethers";
import { createClientHederaSigner, inspectHederaTransaction } from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import { PrivateKey } from "@hiero-ledger/sdk";
import { decodePaymentRequiredHeader, encodePaymentSignatureHeader, readLimitedText } from "@x402/core/http";
import { CHAIN_ID, NETWORK, PATH, DEFAULT_LIMITS, insist, units, validateRequirements, validateQuote, intentMessage, hashscan } from "./policy.js";
import { FACILITATOR, FEE_PAYER } from "./protocol.js";
import { audit, anchorHcs } from "./audit.js";
import { ABI, ERC20_ABI, QUOTE_TYPES } from "../chain.js";

export function validateAgentPolicy(policy) {
  insist(policy?.chainId === CHAIN_ID && policy.network === NETWORK, "Policy must pin Hedera testnet");
  const url = new URL(policy.origin);
  insist(url.origin === policy.origin && !url.username && !url.password &&
    (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))), "Merchant origin must be HTTPS or localhost");
  insist(/^0\.0\.[1-9]\d*$/.test(policy.merchant) && policy.feePayer === FEE_PAYER && policy.facilitator === FACILITATOR, "Untrusted merchant/facilitator");
  for (const name of ["market", "stable", "equity", "identity", "pool"]) insist(ethers.isAddress(policy[name]), `Missing pinned ${name} contract`);
  for (const [key, maximum] of Object.entries(DEFAULT_LIMITS)) {
    if (key === "maxOpenPolicies") insist(Number.isInteger(policy.limits?.[key]) && policy.limits[key] > 0 && policy.limits[key] <= maximum, "Invalid open-policy limit");
    else insist(units(policy.limits?.[key], key) > 0n && units(policy.limits[key]) <= BigInt(maximum), `Unsafe ${key} limit`);
  }
  return policy;
}

export function checkStop(policy) {
  insist(process.env.AGENT_KILL_SWITCH !== "1" && !(policy.killFile && fs.existsSync(policy.killFile)), "Emergency stop active", 503);
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, { ...options, redirect: "error", signal: AbortSignal.timeout(60000) });
  const body = JSON.parse(await readLimitedText(response, 100000));
  return { response, body };
}

export async function buyUnderwriting({ policy, intent, wallet, accountId, state, fetchJson = jsonRequest }) {
  checkStop(policy);
  const discovery = await fetchJson(`${policy.origin}/api/agent/discovery`);
  const d = discovery.body;
  insist(discovery.response.ok && d.enabled && d.network === NETWORK && d.chainId === CHAIN_ID &&
    d.merchant === policy.merchant && d.feePayer === policy.feePayer && d.facilitator === policy.facilitator &&
    d.endpoint === `${policy.origin}${PATH}`, "Discovery does not match the local allowlist");
  const endpoint = `${policy.origin}${PATH}?requestId=${intent.requestId}`;
  const body = JSON.stringify({ intent, signature: await wallet.signMessage(intentMessage(intent)) });
  const request = { method: "POST", headers: { "content-type": "application/json" }, body };
  const unpaid = await fetchJson(endpoint, request);
  insist(unpaid.response.status === 402, unpaid.body.error || "Expected an x402 challenge; no payment signed");
  const required = decodePaymentRequiredHeader(unpaid.response.headers.get("PAYMENT-REQUIRED"));
  const requirements = validateRequirements(required, policy, endpoint);
  const spendId = `api:${intent.buyer}:${intent.requestId}`;
  state.reserve(spendId, "api", policy.merchant, units(requirements.amount), units(policy.limits.apiPerCall), units(policy.limits.apiDaily));
  // Reserve before signing, because a signed payload can settle even when the HTTP response is lost.
  checkStop(policy);
  const signer = createClientHederaSigner(accountId, PrivateKey.fromStringECDSA(wallet.privateKey.slice(2)), { network: NETWORK });
  const scheme = new ExactHederaScheme(signer);
  const partial = await scheme.createPaymentPayload(2, requirements);
  const payload = { ...partial, accepted: requirements, resource: required.resource };
  const tx = inspectHederaTransaction(payload.payload.transaction);
  audit(state, "x402.authorized", { requestId: intent.requestId, amount: requirements.amount, merchant: policy.merchant, transaction: tx.transactionId });
  state.spent(spendId, "submitted", tx.transactionId);
  checkStop(policy);
  const paid = await fetchJson(endpoint, { ...request, headers: { ...request.headers, "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(payload) } });
  const settlement = paid.body.payment;
  insist(paid.response.ok && settlement?.success === true && settlement.network === NETWORK && settlement.transaction === tx.transactionId, "Payment outcome uncertain; reconcile the recorded transaction, do not retry");
  state.spent(spendId, "confirmed", tx.transactionId);
  audit(state, "x402.confirmed", { requestId: intent.requestId, transaction: tx.transactionId, amount: requirements.amount });
  return { ...paid.body, paymentAmount: requirements.amount };
}

export async function insurancePreflight({ wallet, policy, intent, quote = null }) {
  checkStop(policy);
  insist(Number(BigInt(await wallet.provider.send("eth_chainId", []))) === CHAIN_ID, "RPC is not Hedera testnet");
  const market = new ethers.Contract(policy.market, ABI.CoverMarket, wallet);
  const pool = new ethers.Contract(policy.pool, ABI.UnderwritingPool, wallet.provider);
  const identity = new ethers.Contract(policy.identity, ABI.IdentityRegistry, wallet.provider);
  const stable = new ethers.Contract(policy.stable, ERC20_ABI, wallet);
  const equity = new ethers.Contract(policy.equity, ERC20_ABI, wallet.provider);
  const symbol = ethers.id(intent.symbol);
  const [kyc, marketPaused, poolPaused, token, stableAddress, poolAddress, identityAddress, held, covered, ids, allowance] = await Promise.all([
    identity.isVerified(wallet.address), market.paused(), pool.paused(), market.symbolToken(symbol), market.stable(), market.pool(), market.identity(),
    equity.balanceOf(wallet.address), market.coveredShares(wallet.address, symbol), market.policiesOf(wallet.address), stable.allowance(wallet.address, policy.market),
  ]);
  insist(kyc && !marketPaused && !poolPaused, "KYC or pause guard rejected purchase");
  const privileged = await Promise.all([
    market.hasRole(ethers.ZeroHash, wallet.address), market.hasRole(ethers.id("QUOTER_ROLE"), wallet.address),
    identity.hasRole(ethers.id("KYC_ROLE"), wallet.address), pool.hasRole(ethers.id("MANAGER_ROLE"), wallet.address),
  ]);
  insist(privileged.every((v) => !v), "Agent wallet must not hold issuer, underwriting or pool-management privileges");
  insist(token.toLowerCase() === policy.equity.toLowerCase() && stableAddress.toLowerCase() === policy.stable.toLowerCase() &&
    poolAddress.toLowerCase() === policy.pool.toLowerCase() && identityAddress.toLowerCase() === policy.identity.toLowerCase(), "Pinned contract wiring mismatch");
  insist(held >= covered + ethers.parseEther(intent.shares), "Not enough unencumbered ATS shares");
  insist(ids.length < 100, "Policy history exceeds demo bounds");
  const policies = await Promise.all(ids.map((id) => market.getPolicy(id)));
  insist(policies.filter((p) => Number(p.status) === 1).length < policy.limits.maxOpenPolicies, "Too many open policies");
  insist(allowance === 0n, "Existing premium allowance requires reconciliation before another purchase");
  if (quote) {
    const q = quote;
    insist(!(await market.nonceUsed(q.nonce)), "Quote nonce already used");
    const max = units(q.notional) * BigInt(q.capBps) / 10000n;
    const [capacity, marketCapacity, balance] = await Promise.all([pool.symbolCapacity(symbol), pool.marketCapacity(q.market), stable.balanceOf(wallet.address)]);
    insist(max <= capacity && max <= marketCapacity, "Pool collateral capacity exceeded");
    insist(balance >= units(q.premium), "Insufficient premium balance");
  }
  return { market, stable };
}

export async function sendBounded({ wallet, policy, state, id, transaction }) {
  checkStop(policy);
  insist(!transaction.value || BigInt(transaction.value) === 0n, "Agent cannot send native value through insurance calls");
  const to = transaction.to?.toLowerCase();
  if (to === policy.stable.toLowerCase()) {
    const decoded = new ethers.Interface(ERC20_ABI).parseTransaction({ data: transaction.data });
    insist(decoded?.name === "approve" && decoded.args[0].toLowerCase() === policy.market.toLowerCase() &&
      decoded.args[1] >= 0n && decoded.args[1] <= units(policy.limits.premiumPerPolicy), "Only bounded premium approvals or allowance revocation are allowed");
  } else {
    insist(to === policy.market.toLowerCase(), "Transaction destination is not allowlisted");
    const decoded = new ethers.Interface(ABI.CoverMarket).parseTransaction({ data: transaction.data });
    insist(decoded?.name === "buyCover", "Agent cannot call administrative or arbitrary contract functions");
  }
  const gasLimit = await wallet.estimateGas(transaction);
  // A little relay headroom, but an absolute fee ceiling; no unbounded automatic retries.
  const boundedGas = gasLimit * 12n / 10n;
  const gasPrice = (await wallet.provider.getFeeData()).gasPrice;
  insist(gasPrice && gasPrice > 0n, "Gas price unavailable");
  const maxCostWei = boundedGas * gasPrice;
  const tinybars = (maxCostWei + 9999999999n) / 10000000000n;
  state.reserve(id, "gas", policy.market, tinybars, units(policy.limits.gasPerTransaction), units(policy.limits.gasDaily));
  insist(await wallet.provider.getBalance(wallet.address) >= maxCostWei, "Insufficient test HBAR for insurance gas");
  checkStop(policy);
  const sent = await wallet.sendTransaction({ ...transaction, gasLimit: boundedGas, gasPrice, type: 0 });
  state.spent(id, "submitted", sent.hash);
  audit(state, "insurance.submitted", { transaction: sent.hash, maxGasTinybars: tinybars.toString() });
  const receipt = await sent.wait(1, 60000);
  insist(receipt?.status === 1, "Insurance transaction not confirmed; reconcile before retrying");
  state.spent(id, "confirmed", sent.hash);
  return receipt;
}

export async function buyInsurance({ wallet, policy, state, intent, report }) {
  const q = validateQuote(report, intent, policy);
  const domain = { name: "InsureVEX CoverMarket", version: "1", chainId: CHAIN_ID, verifyingContract: policy.market };
  const signer = ethers.verifyTypedData(domain, QUOTE_TYPES, q, report.signature);
  const { market, stable } = await insurancePreflight({ wallet, policy, intent, quote: q });
  insist(await market.hasRole(ethers.id("QUOTER_ROLE"), signer), "Quote signer lacks underwriting authority");
  const id = `premium:${wallet.address}:${q.nonce}`;
  state.reserve(id, "premium", policy.market, units(q.premium), units(policy.limits.premiumPerPolicy), units(policy.limits.premiumDaily));
  // Hedera's relay does not portably support allowance state overrides. Simulate
  // the purchase after the bounded approval, before submitting the premium transfer.
  const approval = await stable.approve.populateTransaction(policy.market, q.premium);
  await sendBounded({ wallet, policy, state, id: `${id}:approve`, transaction: approval });
  checkStop(policy);
  validateQuote(report, intent, policy);
  await market.buyCover.staticCall(q, report.signature);
  const purchase = await market.buyCover.populateTransaction(q, report.signature);
  const receipt = await sendBounded({ wallet, policy, state, id: `${id}:buy`, transaction: purchase });
  const event = receipt.logs.map((l) => { try { return market.interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === "CoverBought");
  insist(event && event.args.holder === wallet.address, "Purchase receipt missing expected policy");
  state.spent(id, "confirmed", receipt.hash);
  const result = { policyId: event.args.id.toString(), transaction: receipt.hash, hashscan: hashscan(receipt.hash), premium: q.premium, notional: q.notional };
  audit(state, "insurance.confirmed", result);
  return result;
}

export async function publishAgentAudit({ state, policy, accountId, privateKey }) {
  if (!policy.hcsTopic) return null;
  checkStop(policy);
  const { Client, PrivateKey: Key } = await import("@hiero-ledger/sdk");
  const digest = state.events()[0]?.digest;
  insist(digest, "No audit event to anchor");
  const id = `hcs:${digest}`;
  state.reserve(id, "gas", policy.hcsTopic, 10000000n, units(policy.limits.gasPerTransaction), units(policy.limits.gasDaily));
  const client = Client.forTestnet().setOperator(accountId, Key.fromStringECDSA(privateKey.replace(/^0x/, "")));
  try {
    const transaction = await anchorHcs(client, policy.hcsTopic, digest);
    state.spent(id, "confirmed", transaction);
    return { topic: policy.hcsTopic, digest, transaction, hashscan: hashscan(transaction) };
  } finally { client.close(); }
}
