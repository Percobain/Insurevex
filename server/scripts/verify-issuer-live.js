// Bounded custodian funding/NAV attestation and live negative compliance checks.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { ethers } from "ethers";
import { randomBytes } from "node:crypto";
import { chain } from "../src/chain.js";
import { confirmedReceipt } from "../src/receipts.js";

const file = path.resolve("../docs/evidence/issuer-live-verification.json");
const evidence = { startedAt: new Date().toISOString(), testnetOnly: true, custodianFundingPerChain: "0.0001", chains: [] };
const save = () => fs.writeFileSync(file, JSON.stringify(evidence, null, 2) + "\n");
for (const id of [1874, 296, 5042002]) {
  const c = chain(id); const result = { chainId: id, transactions: [], checks: [] }; evidence.chains.push(result);
  let spent = 0n;
  async function send(step, contract, method, args) {
    const gasPrice = BigInt(await c.provider.send("eth_gasPrice", []));
    const gasLimit = (await contract[method].estimateGas(...args)) * 16n / 10n;
    const limit = ethers.parseEther(id === 296 ? "1" : id === 1874 ? "0.001" : "0.05");
    assert(spent + gasPrice * gasLimit <= limit, "Issuer check gas ceiling exceeded");
    const unsigned = await c.signer.populateTransaction(await contract[method].populateTransaction(...args, { gasLimit, gasPrice, type: 0 }));
    assert.equal(Number(unsigned.chainId), id);
    const signed = await c.signer.signTransaction(unsigned); const hash = ethers.keccak256(signed);
    const rec = { step, hash, status: "submitted", explorer: `${c.cfg.explorer}/${id === 296 ? "transaction" : "tx"}/${hash}` };
    result.transactions.push(rec); save();
    try { await c.provider.broadcastTransaction(signed); } catch { /* Never resubmit; reconcile known hash. */ }
    const receipt = await confirmedReceipt(c.provider, hash); assert.equal(receipt.status, 1);
    rec.status = "confirmed"; rec.blockNumber = receipt.blockNumber; spent += receipt.fee; save();
    console.log(JSON.stringify({ chainId: id, step, hash })); return receipt;
  }
  try {
    assert.equal(Number(BigInt(await c.provider.send("eth_chainId", []))), id);
    const amount = 100n;
    const before = await c.stable.balanceOf(c.dep.contracts.TBillVault);
    await send("Approve exact custodian proceeds", c.stable, "approve", [c.dep.contracts.TBillVault, amount]);
    const funded = await send("Custodian funds 0.0001 test stablecoin yield", c.tbill, "fundYield", [amount]);
    assert.equal(await c.stable.balanceOf(c.dep.contracts.TBillVault, { blockTag: funded.blockNumber }), before + amount);
    const apy = await c.tbill.apyBps();
    const nav = await c.tbill.navPerShare();
    const reserve = await c.stable.balanceOf(c.dep.contracts.TBillVault);
    const updated = await send("Roll NAV at unchanged rate and attest actual test-token cash reserve", c.tbill, "updateNav", [apy, reserve]);
    assert.equal(await c.tbill.apyBps({ blockTag: updated.blockNumber }), apy);
    assert.equal(await c.tbill.attestedReserve({ blockTag: updated.blockNumber }), reserve);
    assert((await c.tbill.navPerShare({ blockTag: updated.blockNumber })) >= nav);
    result.checks.push("custodian proceeds received, NAV accrued without changing APY, physical test-token reserve attested");
    const note = c.notes.find((n) => n.key === "Note3Y").contract;
    const outsider = ethers.getAddress(ethers.hexlify(randomBytes(20)));
    assert.equal(await c.identity.isVerified(outsider), false);
    await assert.rejects(note.transfer.staticCall(outsider, 1n), /restrict|revert/i);
    await assert.rejects(note.redeem.staticCall(), /mature|revert/i);
    const unauthorised = c.oracle.connect(new ethers.VoidSigner(outsider, c.provider));
    await assert.rejects(unauthorised.post.staticCall(ethers.id("INSUREVEX:NEGATIVE-TEST"), Math.floor(Date.now() / 1000), 1n), /role|access|revert/i);
    result.checks.push("unverified transfers, premature maturity redemption and unauthorised oracle writes rejected without sending transactions");
    if (id === 296) {
      const holder = (await (await fetch("http://localhost:8083/api/agent/control/status")).json()).wallet.address;
      const query = new URLSearchParams({ chainId: "296", buyer: holder, symbol: "NASDAQ:NVDA", notional: "1", shares: "2", heldShares: "2", deductibleBps: "1000", capBps: "1000", tenorDays: "7" });
      const report = await (await fetch(`http://localhost:8080/api/quote?${query}`, { signal: AbortSignal.timeout(30000) })).json();
      assert(report.ok, report.error || report.pricing?.reason);
      const market = c.market.connect(new ethers.VoidSigner(holder, c.provider));
      await assert.rejects(market.buyCover.staticCall(report.quote, report.signature), /holdings|revert/i);
      result.checks.push("ATS on-chain ownership prevents oversized protection despite a signed broker-style holdings claim");
    }
    result.status = "passed";
  } catch (e) { result.status = "failed"; result.error = e.shortMessage || e.message; process.exitCode = 1; }
  finally { save(); c.provider.destroy(); }
}
evidence.finishedAt = new Date().toISOString(); save(); console.log(JSON.stringify(evidence.chains.map((r) => ({ chainId: r.chainId, status: r.status, error: r.error }))));
