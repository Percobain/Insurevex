import { randomBytes } from "node:crypto";
import { ethers } from "ethers";
import { chain, ERC20_ABI, signQuote } from "../chain.js";
import { resolveSymbol } from "../catalog.js";
import { history } from "../prices.js";
import { priceFloor } from "../pricing.js";
import { CHAIN_ID, DEFAULT_LIMITS, insist } from "./policy.js";

export async function prepareUnderwriting(intent, deps = {}) {
  const c = (deps.chain || chain)(CHAIN_ID);
  insist(c?.signer, "Hedera quoter is not configured", 503);
  const actual = await c.provider.send("eth_chainId", []);
  insist(Number(BigInt(actual)) === CHAIN_ID, "RPC is not Hedera testnet", 503);
  const sym = resolveSymbol(intent.symbol);
  insist(sym?.currency === "USD", "Only USD-denominated allowlisted stocks are enabled");
  const symbol = ethers.id(intent.symbol);
  const market = ethers.id(sym.market);
  const [verified, token, paused, poolPaused, quoteRole] = await Promise.all([
    c.identity.isVerified(intent.buyer), c.market.symbolToken(symbol), c.market.paused(), c.pool.paused(),
    c.market.hasRole(ethers.id("QUOTER_ROLE"), c.address),
  ]);
  insist(verified && !paused && !poolPaused && quoteRole, "KYC, pause or quoter role check failed", 403);
  insist(token !== ethers.ZeroAddress && token.toLowerCase() === c.dep.ats?.equityNVDA?.toLowerCase(), "Agent requires the registered ATS equity");
  const equity = new ethers.Contract(token, ERC20_ABI, c.provider);
  const [held, decimals, covered, policyIds] = await Promise.all([
    equity.balanceOf(intent.buyer), equity.decimals(), c.market.coveredShares(intent.buyer, symbol), c.market.policiesOf(intent.buyer),
  ]);
  insist(Number(decimals) === 18, "Unsupported ATS share decimals");
  insist(policyIds.length < 100, "Too many policies for this demo agent");
  const policies = await Promise.all(policyIds.map((id) => c.market.getPolicy(id)));
  insist(policies.filter((p) => Number(p.status) === 1).length < DEFAULT_LIMITS.maxOpenPolicies, "Open-policy limit reached");
  const shares = ethers.parseEther(intent.shares);
  insist(shares > 0n && covered + shares <= held, "Insufficient on-chain holdings");
  const h = await (deps.history || history)(sym.yahoo);
  const now = Math.floor(Date.now() / 1000);
  insist(Number.isFinite(h.live) && h.live > 0 && Number.isSafeInteger(h.liveTs) && h.liveTs <= now + 60 && now - h.liveTs <= 4 * 86400, "Stale or invalid market price", 503);
  insist(Number.isFinite(h.sigmaBlend) && h.sigmaBlend > 0, "Invalid volatility", 503);
  const notional = BigInt(Math.floor(Number(intent.shares) * h.live * 1e6));
  insist(notional > 0n && notional <= BigInt(DEFAULT_LIMITS.notionalPerPolicy), "Notional exceeds $25 testnet limit");
  const p = priceFloor({ sigmaDaily: h.sigmaBlend, sessions: 5, deductible: intent.deductibleBps / 1e4, cap: 0.1, market: sym.market });
  insist(!p.refused, "Underwriting refused: try a deeper deductible", 422);
  const premium = (notional * BigInt(Math.ceil(p.charged * 1e6)) + 999999n) / 1000000n;
  insist(premium > 0n && premium <= BigInt(DEFAULT_LIMITS.premiumPerPolicy), "Premium exceeds testnet limit");
  const maxPayout = notional / 10n;
  const [capacity, marketCapacity, balance] = await Promise.all([
    c.pool.symbolCapacity(symbol), c.pool.marketCapacity(market), c.stable.balanceOf(intent.buyer),
  ]);
  insist(maxPayout <= capacity && maxPayout <= marketCapacity, "Insufficient collateral capacity", 422);
  insist(balance >= premium, "Insufficient test USD premium balance", 422);
  const quote = { buyer: intent.buyer, symbol, market, notional: notional.toString(), shares: shares.toString(), heldShares: held.toString(),
    deductibleBps: intent.deductibleBps, capBps: intent.capBps, premium: premium.toString(), startPrice: Math.round(h.live * 1e8).toString(),
    expiry: now + 7 * 86400, validUntil: Math.min(intent.deadline, now + 300), nonce: BigInt(`0x${randomBytes(16).toString("hex")}`).toString() };
  return { ok: true, chainId: CHAIN_ID, contract: c.dep.contracts.CoverMarket, stable: c.dep.contracts.stable,
    quote, signature: await (deps.signQuote || signQuote)(c, quote),
    underwriting: { model: "hier_mr50", probabilityOfPayout: p.pPayout, premiumBps: p.charged * 1e4,
      observedAt: h.liveTs, holdings: "on-chain ATS balance", maxPayout: maxPayout.toString(), testnetOnly: true } };
}
