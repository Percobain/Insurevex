// ATS compliance + Hedera Schedule Service execution + real coupon claim, on testnet only.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { ethers } from "ethers";
import { chain } from "../src/chain.js";
import { confirmedReceipt } from "../src/receipts.js";

const file = path.resolve("../docs/evidence/hedera-native-verification.json");
const evidence = process.argv.includes("--resume") ? JSON.parse(fs.readFileSync(file, "utf8")) : { startedAt: new Date().toISOString(), chainId: 296, transactions: [], checks: [] };
delete evidence.error; delete evidence.status;
const save = () => { evidence.checks = [...new Set(evidence.checks)]; fs.writeFileSync(file, JSON.stringify(evidence, null, 2) + "\n"); };
const c = chain(296);
let gasSpent = evidence.transactions.reduce((sum, t) => sum + BigInt(t.fee || 0), 0n);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function send(step, contract, method, args, gasOverride) {
  const prior = evidence.transactions.find((t) => t.step === step);
  if (prior) { const receipt = await confirmedReceipt(c.provider, prior.hash); assert.equal(receipt.status, 1); return receipt; }
  const gasPrice = BigInt(await c.provider.send("eth_gasPrice", []));
  const gasLimit = gasOverride || (await contract[method].estimateGas(...args)) * 16n / 10n;
  assert(gasSpent + gasPrice * gasLimit <= ethers.parseEther("6"), "Native verification gas budget exceeded");
  const unsigned = await c.signer.populateTransaction(await contract[method].populateTransaction(...args, { gasLimit, gasPrice, type: 0 }));
  assert.equal(Number(unsigned.chainId), 296);
  const signed = await c.signer.signTransaction(unsigned);
  const hash = ethers.keccak256(signed);
  const record = { step, hash, status: "submitted", explorer: `https://hashscan.io/testnet/transaction/${hash}` };
  evidence.transactions.push(record); save();
  try { await c.provider.broadcastTransaction(signed); } catch { /* Reconcile only this hash. */ }
  const receipt = await confirmedReceipt(c.provider, hash);
  assert.equal(receipt.status, 1, `${step} reverted`);
  gasSpent += receipt.fee;
  Object.assign(record, { status: "confirmed", blockNumber: receipt.blockNumber, fee: receipt.fee.toString() }); save();
  console.log(JSON.stringify(record)); return receipt;
}
try {
  assert.equal(Number(BigInt(await c.provider.send("eth_chainId", []))), 296);
  const status = await (await fetch("http://localhost:8083/api/agent/control/status")).json();
  assert(status.ready && status.wallet?.address && !status.locked, "Isolated agent must have completed its run first");
  const holder = status.wallet.address;
  evidence.atsHolder = holder; evidence.equity = c.dep.ats.equityNVDA;
  const equity = new ethers.Contract(evidence.equity, ["function balanceOf(address) view returns (uint256)", "function getFrozenTokens(address) view returns (uint256)",
    "function freezePartialTokens(address,uint256)", "function unfreezePartialTokens(address,uint256)"], c.signer);
  const amount = ethers.parseEther("0.000001");
  const previousFreeze = evidence.transactions.some((t) => t.step === "ATS freezes a tiny amount on the isolated test holder");
  const previousUnfreeze = evidence.transactions.some((t) => t.step === "ATS unfreezes the exact test amount");
  const frozen = evidence.frozenBefore == null ? await equity.getFrozenTokens(holder) - (previousFreeze && !previousUnfreeze ? amount : 0n) : BigInt(evidence.frozenBefore);
  const held = evidence.holdingBefore == null ? await equity.balanceOf(holder) + (previousFreeze && !previousUnfreeze ? amount : 0n) : BigInt(evidence.holdingBefore);
  assert(frozen >= 0n && held >= ethers.parseEther("1"));
  evidence.frozenBefore = frozen.toString(); evidence.holdingBefore = held.toString(); save();
  const freeze = await send("ATS freezes a tiny amount on the isolated test holder", equity, "freezePartialTokens", [holder, amount]);
  assert.equal(await equity.getFrozenTokens(holder, { blockTag: freeze.blockNumber }), frozen + amount);
  const unfreeze = await send("ATS unfreezes the exact test amount", equity, "unfreezePartialTokens", [holder, amount]);
  assert.equal(await equity.getFrozenTokens(holder, { blockTag: unfreeze.blockNumber }), frozen);
  assert.equal(await equity.balanceOf(holder, { blockTag: unfreeze.blockNumber }), held);
  evidence.checks.push("ATS compliance freeze/unfreeze restores the exact original holding"); save();

  const note = c.notes.find((n) => n.key === "Note3Y").contract;
  const latest = Number((await c.provider.getBlock("latest")).timestamp);
  // The original helper selected a past timestamp when the coupon was overdue.
  const when = evidence.schedule?.executeAt ?? Math.max(Number(await note.lastCoupon()) + Number(await note.couponInterval()) + 120, latest + 120);
  const hss = new ethers.Contract("0x000000000000000000000000000000000000016b", [
    "function hasScheduleCapacity(uint256,uint256) view returns (bool)",
    "function scheduleCall(address to,uint256 expirySecond,uint256 gasLimit,uint64 value,bytes callData) returns (int64 responseCode,address scheduleAddress)"], c.signer);
  if (!evidence.schedule) {
  assert(await hss.hasScheduleCapacity(when, 1500000), "Native scheduler has no capacity at this timestamp");
  const args = [await note.getAddress(), when, 1500000, 0, note.interface.encodeFunctionData("distributeCoupon")];
  const preview = await hss.scheduleCall.staticCall(...args, { gasLimit: 2000000 });
  assert.equal(preview.responseCode, 22n, `Schedule preflight response ${preview.responseCode}`);
  const scheduled = await send("Hedera native scheduleCall for an overdue coupon", hss, "scheduleCall", args, 2000000n);
  let result;
  for (let i = 0; i < 12; i++) {
    const response = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/contracts/results/${scheduled.hash}`, { signal: AbortSignal.timeout(10000) });
    if (response.ok) { result = await response.json(); break; } await sleep(3000);
  }
  assert.equal(result?.result, "SUCCESS");
  const decoded = hss.interface.decodeFunctionResult("scheduleCall", result.call_result);
  assert.equal(decoded.responseCode, 22n); assert.notEqual(decoded.scheduleAddress, ethers.ZeroAddress);
  assert(/^0x0{24}/i.test(decoded.scheduleAddress), "Unexpected schedule address encoding");
  const scheduleId = `0.0.${BigInt(decoded.scheduleAddress)}`;
  evidence.schedule = { id: scheduleId, address: decoded.scheduleAddress, executeAt: when, status: "created" }; save();
  console.log(JSON.stringify({ scheduleId, executeAt: when }));
  }
  const scheduleId = evidence.schedule.id;
  const deadline = Date.now() + Math.max(0, when * 1000 - Date.now()) + 120000;
  let schedule;
  while (Date.now() < deadline) {
    const response = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/schedules/${scheduleId}`, { signal: AbortSignal.timeout(10000) });
    if (response.ok) { schedule = await response.json(); if (schedule.executed_timestamp) break; }
    await sleep(5000);
  }
  assert(schedule?.executed_timestamp, "Schedule created but execution not confirmed yet");
  assert(Number(await note.lastCoupon()) >= when - 2, "Scheduled transaction did not advance coupon state");
  evidence.schedule.status = "executed"; evidence.schedule.executedTimestamp = schedule.executed_timestamp;
  evidence.checks.push("native scheduled transaction executed and advanced coupon state"); save();
  const priorClaim = evidence.transactions.some((t) => t.step === "Saver claims real scheduled coupon");
  const pending = priorClaim ? BigInt(evidence.couponClaimable) : await note.pendingCoupon(c.address);
  evidence.couponClaimable = pending.toString();
  if (pending > 0n) {
    const receipt = await send("Saver claims real scheduled coupon", note, "claimCoupon", []);
    const claimed = receipt.logs.map((l) => { try { return note.interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === "CouponClaimed");
    assert(claimed && claimed.args.holder.toLowerCase() === c.address.toLowerCase());
    assert.equal(claimed.args.amount, pending);
    assert.equal(await note.pendingCoupon(c.address, { blockTag: receipt.blockNumber }), 0n);
    evidence.checks.push("scheduled coupon claim transferred exact test USD to Saver");
  } else evidence.checks.push("coupon operation succeeded; no positive coupon was claimable for this holder");
  evidence.status = "passed";
} catch (e) { evidence.status = "failed"; evidence.error = e.shortMessage || e.message; process.exitCode = 1; }
finally { evidence.finishedAt = new Date().toISOString(); save(); c.provider.destroy(); }
console.log(JSON.stringify(evidence, null, 2));
