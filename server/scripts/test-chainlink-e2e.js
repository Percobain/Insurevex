// Fully isolated local EVM + HTTP + durable queue + official CRE SDK + keeper test.
// No deployed testnet contracts, operator wallets or production state are used.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import express from "express";
import { chainlinkConfig } from "../src/chainlink/config.js";
import { SettlementState } from "../src/chainlink/state.js";
import { mountChainlinkRoutes, chainlinkClose } from "../src/chainlink/service.js";
import { settleDue } from "../src/keeper.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(path.join(root, "contracts/package.json"));
process.chdir(path.join(root, "contracts"));
const hre = require("hardhat");
// Configure only the ephemeral in-process Hardhat network before it is started.
hre.network.config.chainId = 1874;
hre.network.config.initialDate = "2026-11-05T21:00:00Z";
const { ethers } = hre;
const now = Date.parse("2026-11-06T22:00:00Z") / 1000;
const U = (n) => ethers.parseUnits(String(n), 6);
const dir = fs.mkdtempSync(path.join(os.homedir(), ".insurevex-cre-e2e-"));
let state = new SettlementState(path.join(dir, "reports.sqlite"));
let server;
try {
  assert.equal((await ethers.provider.getNetwork()).chainId, 1874n);
  const [admin, senior, pro, holder] = await ethers.getSigners();
  const deploy = async (name, ...args) => { const c = await (await ethers.getContractFactory(name)).deploy(...args); await c.waitForDeployment(); return c; };
  const usd = await deploy("TestUSD");
  const registry = await deploy("IdentityRegistry", admin.address);
  const oracle = await deploy("PriceOracle", admin.address);
  const pool = await deploy("UnderwritingPool", usd, registry, admin.address);
  const market = await deploy("CoverMarket", usd, registry, oracle, pool, admin.address, admin.address);
  for (const c of [pool, market]) await registry.setSystem(await c.getAddress(), true);
  await pool.grantRole(await pool.MARKET_ROLE(), await market.getAddress());
  await pool.setRiskParams(5000, 2500, 10000, 4000);
  for (const signer of [senior, pro, holder]) {
    await registry.setIdentity(signer.address, true, 840, now + 365 * 86400);
    await usd.transfer(signer.address, U(20000));
  }
  await usd.connect(senior).approve(pool, U(10000));
  await pool.connect(senior).deposit(U(10000), senior.address);
  await usd.connect(pro).approve(pool, U(2000));
  await pool.connect(pro).depositPro(U(2000));
  const q = { buyer: holder.address, symbol: ethers.id("NASDAQ:NVDA"), market: ethers.id("US"), notional: U(1000),
    shares: ethers.parseEther("10"), heldShares: ethers.parseEther("10"), deductibleBps: 1000, capBps: 2000,
    premium: U(20), startPrice: 10000000000n, expiry: now, validUntil: now - 3600, nonce: 1 };
  const types = { Quote: Object.entries({ buyer: "address", symbol: "bytes32", market: "bytes32", notional: "uint256", shares: "uint256", heldShares: "uint256",
    deductibleBps: "uint32", capBps: "uint32", premium: "uint256", startPrice: "uint256", expiry: "uint64", validUntil: "uint64", nonce: "uint256" }).map(([name, type]) => ({ name, type })) };
  const signature = await admin.signTypedData({ name: "InsureVEX CoverMarket", version: "1", chainId: 1874, verifyingContract: await market.getAddress() }, types, q);
  await usd.connect(holder).approve(market, q.premium);
  await (await market.connect(holder).buyCover(q, signature)).wait();
  assert.equal(await pool.locked(), U(200));
  await hre.network.provider.send("evm_setNextBlockTimestamp", [now]);
  await hre.network.provider.send("evm_mine");
  const snapshot = await hre.network.provider.send("evm_snapshot");
  const c = { chainId: 1874, cfg: { name: "Local E2E" }, dep: { contracts: { CoverMarket: await market.getAddress(), PriceOracle: await oracle.getAddress() } }, market, oracle };
  const cfg = chainlinkConfig({ CHAINLINK_ENABLED: "1", CHAINLINK_CHAIN_IDS: "1874", CHAINLINK_REPORT_TOKEN: "local-test-only-".repeat(3) });
  const app = express(); app.use(express.json());
  mountChainlinkRoutes(app, { config: cfg, chain: () => c, state, clock: () => now });
  app.post("/rpc", async (req, res) => {
    try { res.json({ jsonrpc: "2.0", id: req.body.id, result: await hre.network.provider.send(req.body.method, req.body.params) }); }
    catch (e) { res.json({ jsonrpc: "2.0", id: req.body.id, error: { code: -32000, message: e.message } }); }
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const job = (await (await fetch(`${base}/api/chainlink/jobs`)).json()).jobs[0];
  assert.equal(job.startPrice, q.startPrice.toString());
  const balance = await usd.balanceOf(holder.address);
  const seniorAssets = await pool.totalAssets();
  const proAssets = await pool.juniorAssets();
  const done = new Map();
  const options = { now, store: { get: (k, fallback) => done.get(k) ?? fallback, set: (k, v) => done.set(k, v) },
    chainlinkClose: (...args) => chainlinkClose(...args, { config: cfg, state, now }),
    closeAt: async () => { throw new Error("CRE must never fall back to legacy prices"); }, recordSettlement: (id, tx) => state.settled(id, tx) };
  cfg.settlementEnabled = true;
  await settleDue(c, options); // Missing report: no fallback or chain writes.
  assert.equal((await oracle.closeAt(q.symbol, now))[0], false);
  cfg.settlementEnabled = false;
  const file = path.join(dir, "sdk-context.json");
  fs.writeFileSync(file, JSON.stringify({ base, token: cfg.token, now, config: { schedule: "0 */5 * * * *", jobsUrl: `${base}/api/chainlink/jobs`, reportUrl: `${base}/api/chainlink/reports`, deliveryEnabled: true,
    chains: [{ chainId: 1874, rpc: `${base}/rpc`, market: await market.getAddress(), oracle: await oracle.getAddress() }] } }), { mode: 0o600 });
  const bun = process.env.BUN_BIN || "bun";
  const sdk = await promisify(execFile)(bun, ["test", path.join(root, "chainlink/settlement/e2e.test.ts")], { cwd: path.join(root, "chainlink"), timeout: 60000, env: { ...process.env, CHAINLINK_E2E_CONTEXT: file } });
  assert.match(sdk.stdout, /report-delivery/);
  assert.equal(state.get(job.id).status, "validated");
  await settleDue(c, options); // Validation-only cannot move money.
  assert.equal((await market.getPolicy(0)).status, 1n);
  assert.equal(await usd.balanceOf(holder.address), balance);
  // Exercise durability: reopen the database before the keeper reads it.
  state.close(); state = new SettlementState(path.join(dir, "reports.sqlite"));
  cfg.settlementEnabled = true;
  await settleDue(c, options);
  const settled = await market.getPolicy(0);
  assert.equal(settled.status, 2n);
  assert.equal(settled.settlePrice, 8005000000n);
  // Contract rounds the percentage down to whole basis points: 995 bps.
  assert.equal(settled.payout, U(99.5));
  assert.equal(await usd.balanceOf(holder.address), balance + U(99.5));
  assert.equal(await pool.locked(), 0n);
  assert.equal(await pool.totalAssets(), seniorAssets);
  assert.equal(await pool.juniorAssets(), proAssets - U(99.5));
  assert.equal(state.get(job.id).status, "settled");
  const tx = state.get(job.id).tx;
  await settleDue(c, options);
  assert.equal(await usd.balanceOf(holder.address), balance + U(99.5));
  const replay = await fetch(`${base}/api/chainlink/reports`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
    body: JSON.stringify({ chainId: 1874, policyId: 0, jobId: job.id, observations: state.get(job.id).body.observations }) });
  assert.equal(replay.status, 409);
  // Revert the isolated chain to prove the disabled flag preserves the legacy path.
  await hre.network.provider.send("evm_revert", [snapshot]); done.clear(); cfg.enabled = false;
  await settleDue(c, { ...options, closeAt: async () => ({ price: 85, source: "local legacy fixture" }) });
  assert.equal((await market.getPolicy(0)).payout, U(50));
  assert.equal(await usd.balanceOf(holder.address), balance + U(50));
  const evidence = { verifiedAt: new Date().toISOString(), environment: "ephemeral local Hardhat EVM; not testnet or DON evidence",
    workflow: "official CRE SDK test runtime with local HTTP transport and fixture market data", chainId: 1874,
    market: await market.getAddress(), oracle: await oracle.getAddress(), symbol: "NASDAQ:NVDA", startPrice: "100.00", fixturePrices: ["80.00", "80.10"],
    validatedPrice: "80.05", notional: "1000", deductibleBps: 1000, payout: "99.5", payoutUnits: "99500000", localSettlementTransaction: tx,
    checks: ["actual on-chain signed quote and premium", "actual SDK handler and on-chain policy reread", "authenticated HTTP report delivery", "SQLite reopen durability", "missing report blocks fallback", "validation-only moves no funds", "keeper posts oracle and settles", "holder receives exact payout", "Pro absorbs loss; senior assets unchanged", "collateral released", "repeat keeper does not pay twice", "settled report replay rejected", "disabled feature preserves legacy settlement"] };
  const evidenceDir = path.join(root, "docs/evidence"); fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "chainlink-local-e2e.json"), JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  if (server) await new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); });
  state.close(); fs.rmSync(dir, { recursive: true, force: true });
}
