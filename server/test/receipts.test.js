import test from "node:test";
import assert from "node:assert/strict";
import { confirmedReceipt } from "../src/receipts.js";
test("receipt confirmation survives a transient relay error without needing subscriptions or resubmitting", async () => {
  let reads = 0;
  const receipt = { hash: "0xknown", status: 1, blockNumber: 10 };
  const provider = { getTransactionReceipt: async (hash) => { assert.equal(hash, receipt.hash); if (++reads === 1) throw Error("RPC unavailable"); return reads === 2 ? null : receipt; } };
  assert.equal(await confirmedReceipt(provider, receipt.hash, { pollMs: 1, timeoutMs: 1000 }), receipt);
  assert.equal(reads, 3);
});
test("a mined revert is returned and an unknown receipt times out without retrying a payment", async () => {
  const failed = { status: 0 };
  assert.equal(await confirmedReceipt({ getTransactionReceipt: async () => failed }, "0xfailed"), failed);
  await assert.rejects(confirmedReceipt({ getTransactionReceipt: async () => null }, "0xunknown", { pollMs: 1, timeoutMs: 10 }), /reconcile this hash/);
});
