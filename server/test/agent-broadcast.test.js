import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ethers } from "ethers";
import { AgentState } from "../src/agent/state.js";
import { sendBounded, runGasPreflight } from "../src/agent/client.js";

test("insurance hash is durable before broadcast and a lost relay acknowledgement cannot duplicate payment", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "insurevex-broadcast-"));
  const state = new AgentState(path.join(dir, "agent.sqlite"));
  t.after(() => { state.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const signer = ethers.Wallet.createRandom();
  const stable = "0x0000000000000000000000000000000000000001";
  const market = "0x0000000000000000000000000000000000000002";
  let broadcasts = 0; let submittedHash;
  const provider = {
    send: async (method) => { assert.equal(method, "eth_gasPrice"); return "0x" + (10000000000n).toString(16); }, getBalance: async () => ethers.parseEther("3"),
    broadcastTransaction: async (signed) => {
      broadcasts++; submittedHash = ethers.keccak256(signed);
      assert.equal(state.spending()[0].tx, submittedHash);
      assert.equal(state.spending()[0].status, "submitted");
      throw new Error("relay accepted transaction but lost response");
    },
    getTransactionReceipt: async (hash) => { assert.equal(hash, submittedHash); return { hash, status: 1 }; },
  };
  const wallet = { address: signer.address, provider, estimateGas: async () => 100000n,
    populateTransaction: async (tx) => ({ ...tx, nonce: 0, chainId: 296 }), signTransaction: (tx) => signer.signTransaction(tx) };
  const policy = { stable, market, limits: { premiumPerPolicy: "1000000", gasPerTransaction: "100000000", gasDaily: "200000000" } };
  const data = new ethers.Interface(["function approve(address,uint256)"]).encodeFunctionData("approve", [market, 100n]);
  const receipt = await sendBounded({ wallet, policy, state, id: "approval", transaction: { to: stable, data } });
  assert.equal(receipt.hash, submittedHash); assert.equal(broadcasts, 1); assert.equal(state.spending()[0].status, "confirmed");
});
test("insufficient remaining whole-run gas budget is rejected before any payment is signed or reserved", async () => {
  const policy = { stable: "0x0000000000000000000000000000000000000001", market: "0x0000000000000000000000000000000000000002", hcsTopic: "0.0.1",
    limits: { premiumPerPolicy: "1000000", gasPerTransaction: "100000000", gasDaily: "200000000" } };
  const wallet = { estimateGas: async () => 70000n, provider: { send: async () => "0x" + (1000000000000n).toString(16) } };
  const used = { budget: () => ({ used: { gas: "111287824" } }) };
  const unavailableWallet = { estimateGas: async () => { throw Error("RPC must not be called for an exhausted budget"); } };
  await assert.rejects(runGasPreflight({ wallet: unavailableWallet, policy, state: used }), /no underwriting payment was made/);
  const fresh = { budget: () => ({ used: { gas: "0" } }) };
  assert(BigInt(await runGasPreflight({ wallet, policy, state: fresh })) < 200000000n);
});
