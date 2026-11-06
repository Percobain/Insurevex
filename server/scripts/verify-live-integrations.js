// Bounded, explicit TESTNET integration transactions against the existing deployed product.
// Run from server: node --env-file=.env scripts/verify-live-integrations.js --execute
// Signer material is consumed by the existing chain module and is never printed or copied.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { ethers } from "ethers";
import { chain, signQuote } from "../src/chain.js";
import { confirmedReceipt } from "../src/receipts.js";

const execute = process.argv.includes("--execute");
const output = path.resolve(`../docs/evidence/live-integration-${execute ? "verification" : "preflight"}.json`);
const resume = process.argv.includes("--resume");
const run = resume ? JSON.parse(fs.readFileSync(output, "utf8")) : { startedAt: new Date().toISOString(), testnetOnly: true, execute, maxStablePrincipalPerChain: "1.25", chains: [], notes: [
  "Synthetic crash uses a unique E2E-only symbol; never overwrites a real stock's oracle close.",
  "No risk settings, existing identities, global pauses or production wallets are changed.",
  "Long-term maturity/coupon timing and negative controls are additionally tested on an isolated local EVM.",
] };
const save = () => { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(run, null, 2) + "\n"); };
const U = (n) => ethers.parseUnits(String(n), 6);
const transfers = new ethers.Interface(["event Transfer(address indexed from,address indexed to,uint256 value)"]);
const E2E = ethers.id(`INSUREVEX:E2E:${randomBytes(8).toString("hex")}`);
const desired = process.env.VERIFY_CHAIN_IDS ? process.env.VERIFY_CHAIN_IDS.split(",").map(Number) : [1874, 296, 5042002];
assert(desired.every((id) => [1874, 296, 5042002].includes(id)), "Testnets only");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
for (const id of desired) {
  const c = chain(id);
  const result = run.chains.find((r) => r.chainId === id) || { chainId: id, network: c?.cfg.name, status: "running", checks: [], transactions: [] };
  if (result.status === "passed") { c.provider.destroy(); continue; }
  result.status = "running"; delete result.error;
  if (!run.chains.includes(result)) run.chains.push(result); save();
  let spentGas = result.transactions.reduce((sum, t) => sum + BigInt(t.fee || 0), 0n);
  const gasBudget = id === 1874 ? ethers.parseEther("0.015") : id === 296 ? ethers.parseEther("12") : ethers.parseEther("0.25");
  const done = (name) => result.checks.some((check) => check.name === name && check.passed);
  const check = (name, detail = {}) => { if (!done(name)) result.checks.push({ name, passed: true, ...detail }); console.log(JSON.stringify({ chainId: id, check: name, ...detail })); save(); };
  async function send(label, contract, method, args) {
    const prior = result.transactions.find((t) => t.step === label);
    if (prior) {
      const receipt = await confirmedReceipt(c.provider, prior.hash);
      assert.equal(receipt.status, 1, `Previously submitted ${label} reverted; do not resubmit`);
      if (!prior.fee) spentGas += receipt.fee;
      Object.assign(prior, { status: "confirmed", blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed.toString(), fee: receipt.fee.toString(), reconciled: true });
      save(); return receipt;
    }
    const fee = { gasPrice: BigInt(await c.provider.send("eth_gasPrice", [])) };
    assert(fee.gasPrice && fee.gasPrice > 0n, "Gas price unavailable");
    let gasLimit = await contract[method].estimateGas(...args);
    gasLimit = gasLimit * (id === 296 ? 16n : 12n) / 10n;
    assert(gasLimit <= 2000000n, "Transaction exceeds integration gas limit");
    const maxFee = gasLimit * fee.gasPrice;
    assert(spentGas + maxFee <= gasBudget, "Per-chain test gas budget exceeded");
    assert(await c.provider.getBalance(await c.signer.getAddress()) >= maxFee, "Insufficient native test gas");
    const unsigned = await c.signer.populateTransaction(await contract[method].populateTransaction(...args, { gasLimit, gasPrice: fee.gasPrice, type: 0 }));
    assert.equal(Number(unsigned.chainId), id);
    const signed = await c.signer.signTransaction(unsigned);
    const hash = ethers.keccak256(signed);
    const txRecord = { step: label, hash, nonce: unsigned.nonce, status: "submitted", explorer: `${c.cfg.explorer}/${id === 296 ? "transaction" : "tx"}/${hash}` };
    result.transactions.push(txRecord); save();
    try { await c.provider.broadcastTransaction(signed); txRecord.broadcastAcknowledged = true; }
    catch { txRecord.broadcastAcknowledged = false; }
    save();
    // Never resubmit an uncertain payment. A submitted hash is persisted before waiting.
    const receipt = await confirmedReceipt(c.provider, hash);
    assert(receipt?.status === 1, `${label} reverted`);
    spentGas += receipt.fee;
    Object.assign(txRecord, { status: "confirmed", blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed.toString(), fee: receipt.fee.toString() });
    console.log(JSON.stringify({ chainId: id, transaction: label, hash })); save();
    return receipt;
  }
  try {
    assert(c?.signer, "No configured testnet signer");
    const address = await c.signer.getAddress();
    assert.equal(Number(BigInt(await c.provider.send("eth_chainId", []))), id, "Wrong RPC network");
    assert(await c.identity.isVerified(address), "Operator identity is not verified");
    const stableBalance = await c.stable.balanceOf(address);
    assert(stableBalance >= U(1.25), "Need 1.25 test stablecoins for bounded checks");
    assert.equal(Number(await c.stable.decimals()), 6);
    if (id === 1874) assert.equal(c.dep.contracts.stable.toLowerCase(), "0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7");
    result.wallet = address; result.stable = c.dep.contracts.stable; result.stableSymbol = await c.stable.symbol();
    for (const key of ["IdentityRegistry", "PriceOracle", "TBillVault", "UnderwritingPool", "CoverMarket"]) assert.notEqual(await c.provider.getCode(c.dep.contracts[key]), "0x", `Missing ${key} bytecode`);
    check("network, funded signer, KYC, official stablecoin and deployed contract bytecode");
    const block = await c.provider.getBlock("latest");
    const note = c.notes.find((n) => n.key === "3Y")?.contract || c.notes[0]?.contract;
    assert(note, "3Y note not configured");
    assert(Number(await note.subscriptionEnd()) >= block.timestamp, "Saver subscription window closed");
    const qs = new URLSearchParams({ chainId: String(id), buyer: address, symbol: "NASDAQ:MSFT", notional: "0.1", deductibleBps: "1000", capBps: "1000", tenorMinutes: "2" });
    const quoteResponse = await fetch(`${process.env.SERVER || "http://localhost:8080"}/api/quote?${qs}`, { signal: AbortSignal.timeout(30000) });
    const priced = await quoteResponse.json();
    assert(quoteResponse.ok && priced.ok, priced.pricing?.reason || priced.error || "Live pricing API refused");
    assert(BigInt(priced.quote.premium) > 0n && BigInt(priced.quote.premium) <= U(0.01), "Premium exceeds integration ceiling");
    check("live market data and API underwriting quote", { source: priced.symbol?.symbol, premium: priced.quote.premium });
    if (!execute) { result.status = "preflight-passed"; continue; }

    if (!done("Saver subscription mints face value and consumes exact allowance")) {
    const notesBefore = await note.balanceOf(address) - (result.transactions.some((t) => t.step === "Saver subscribes 1 test stablecoin") ? U(1) : 0n);
    await send("Approve exactly 1 test stablecoin for Saver", c.stable, "approve", [await note.getAddress(), U(1)]);
    await send("Saver subscribes 1 test stablecoin", note, "subscribe", [U(1)]);
    assert.equal(await note.balanceOf(address), notesBefore + U(1));
    assert.equal(await c.stable.allowance(address, await note.getAddress()), 0n);
    check("Saver subscription mints face value and consumes exact allowance");
    }

    if (!done("Pro first-loss liquidity deposit and withdrawal")) {
    await send("Approve exact Pro deposit", c.stable, "approve", [c.dep.contracts.UnderwritingPool, U(0.1)]);
    const beforePro = await c.pool.juniorAssets();
    await send("Pro deposits 0.1 test stablecoin", c.pool, "depositPro", [U(0.1)]);
    assert.equal(await c.pool.juniorAssets(), beforePro + U(0.1));
    await send("Pro withdraws 0.1 test stablecoin", c.pool, "withdrawPro", [U(0.1)]);
    assert.equal(await c.pool.juniorAssets(), beforePro);
    check("Pro first-loss liquidity deposit and withdrawal");
    }

    if (!done("T-bill deposit and redemption")) {
    const previousDeposit = result.transactions.find((t) => t.step === "Treasury deposits 0.01 test stablecoin");
    let alreadyDepositedShares = 0n;
    if (previousDeposit) {
      const rr = await confirmedReceipt(c.provider, previousDeposit.hash);
      assert.equal(rr.status, 1);
      const event = rr.logs.map((l) => { try { return c.tbill.interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === "Subscribed");
      assert(event, "Cannot reconcile prior treasury deposit"); alreadyDepositedShares = event.args.shares;
    }
    const previousRedemption = result.transactions.find((t) => t.step === "Treasury redeems newly acquired shares");
    if (previousRedemption) assert.equal((await confirmedReceipt(c.provider, previousRedemption.hash)).status, 1);
    const treasuryBefore = await c.tbill.balanceOf(address) - (previousRedemption ? 0n : alreadyDepositedShares);
    await send("Approve exact treasury deposit", c.stable, "approve", [c.dep.contracts.TBillVault, U(0.01)]);
    await send("Treasury deposits 0.01 test stablecoin", c.tbill, "deposit", [U(0.01), address]);
    const acquired = previousDeposit ? alreadyDepositedShares : await c.tbill.balanceOf(address) - treasuryBefore;
    assert(acquired > 0n);
    await send("Treasury redeems newly acquired shares", c.tbill, "redeem", [acquired, address, address]);
    assert.equal(await c.tbill.balanceOf(address), treasuryBefore);
    check("T-bill deposit and redemption");
    }

    // Reuse the actual API's live pricing, but isolate settlement under a uniquely named test symbol.
    // This is an explicit synthetic contract test, not a claim of a real MSFT crash or broker verification.
    const chainTime = Number((await c.provider.getBlock("latest")).timestamp);
    const q = { ...priced.quote, symbol: E2E, shares: ethers.parseEther("0.001").toString(), heldShares: ethers.parseEther("1").toString(),
      expiry: chainTime + (id === 296 ? 180 : 35), validUntil: chainTime + 600, nonce: BigInt("0x" + randomBytes(16).toString("hex")).toString() };
    const signature = await signQuote(c, q);
    const locked = await c.pool.locked();
    const junior = await c.pool.juniorAssets();
    await send("Approve exact bounded premium", c.stable, "approve", [c.dep.contracts.CoverMarket, BigInt(q.premium)]);
    await c.market.buyCover.staticCall(q, signature);
    const bought = await send("Holder pays live-priced synthetic-test premium", c.market, "buyCover", [q, signature]);
    const event = bought.logs.map((l) => { try { return c.market.interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === "CoverBought");
    assert(event, "No policy issuance event");
    const policyId = event.args.id;
    result.testPolicy = { policyId: policyId.toString(), symbol: E2E, expiry: q.expiry, notional: q.notional, premium: q.premium, synthetic: true };
    assert.equal(await c.pool.locked(), locked + BigInt(q.notional) * BigInt(q.capBps) / 10000n);
    assert.equal(await c.stable.allowance(address, c.dep.contracts.CoverMarket), 0n);
    await assert.rejects(c.market.buyCover.staticCall(q, signature), /nonce used|revert/i);
    await assert.rejects(c.market.settle.staticCall(policyId), /no official close|revert/i);
    check("premium collected, collateral reserved, replay and premature settlement rejected");
    // Timed waits happen only after actual chain reads; no local time travel on a live network.
    while (Number((await c.provider.getBlock("latest")).timestamp) < q.expiry) await wait(4000);
    const crashPrice = BigInt(q.startPrice) / 2n;
    await send("Post explicitly synthetic 50% crash for unique E2E symbol", c.oracle, "post", [E2E, q.expiry, crashPrice]);
    const expected = await c.market.previewPayout(policyId, crashPrice);
    const seniorBeforeSettlement = await c.pool.totalAssets();
    const beforePayout = await c.stable.balanceOf(address);
    const paid = await send("Settle test policy and pay capped protection", c.market, "settle", [policyId]);
    const policy = await c.market.getPolicy(policyId);
    assert.equal(policy.status, 2n); assert.equal(policy.payout, expected); assert(expected > 0n);
    // Arc uses USDC as gas: its ERC-20 transfer log, not a balance delta, is the payout proof.
    const transfer = paid.logs.filter((l) => l.address.toLowerCase() === c.dep.contracts.stable.toLowerCase()).map((l) => { try { return transfers.parseLog(l); } catch { return null; } }).find((e) => e?.name === "Transfer" && e.args.to.toLowerCase() === address.toLowerCase() && e.args.value === expected);
    if (id !== 5042002) assert.equal(await c.stable.balanceOf(address), beforePayout + expected);
    else assert(transfer, "Arc payout ERC-20 transfer event absent");
    assert.equal(await c.pool.totalAssets(), seniorBeforeSettlement);
    assert.equal(await c.pool.locked(), locked);
    assert.equal(await c.market.coveredShares(address, E2E), 0n);
    assert((await c.pool.juniorAssets()) < junior + BigInt(q.premium));
    await assert.rejects(c.market.settle.staticCall(policyId), /not open|revert/i);
    check("exact capped payout, Pro first loss, senior assets preserved, collateral released, no double settlement", { policyId: policyId.toString(), payout: expected.toString() });
    result.gasSpentWei = spentGas.toString(); result.status = "passed";
  } catch (e) {
    result.status = "failed";
    result.error = e.shortMessage || e.reason || e.message;
    console.error(JSON.stringify({ chainId: id, error: result.error, lastTransaction: result.transactions.at(-1)?.hash }));
  } finally { save(); c?.provider.destroy(); }
}
run.finishedAt = new Date().toISOString(); save();
console.log(JSON.stringify({ evidence: output, results: run.chains.map((c) => ({ chainId: c.chainId, status: c.status, transactions: c.transactions.length, error: c.error })) }));
if (run.chains.some((c) => c.status === "failed")) process.exitCode = 1;
