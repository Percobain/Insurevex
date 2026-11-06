import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { testnetProvider } from "../src/chain.js";

async function rpc(t, respond) {
  const server = http.createServer(async (req, res) => {
    let body = ""; for await (const data of req) body += data;
    respond(JSON.parse(body), res);
  });
  server.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}`;
}
test("agent-compatible testnet provider fails over transport errors and benches the failed RPC", async (t) => {
  let failed = 0; let working = 0;
  const first = await rpc(t, (_req, res) => { failed++; res.writeHead(429); res.end("Rate limited"); });
  const second = await rpc(t, (req, res) => { working++; res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: "0x128" })); });
  const provider = testnetProvider(296, { rpc: `${first},${second}`, batchMaxCount: 1 });
  t.after(() => provider.destroy());
  assert.equal(await provider.send("eth_chainId", []), "0x128");
  assert.equal(await provider.send("eth_chainId", []), "0x128");
  assert.equal(failed, 1); assert.equal(working, 2);
  assert.throws(() => testnetProvider(1), /Unsupported testnet/);
});
test("contract reverts are returned without replaying the operation against another RPC", async (t) => {
  let fallback = 0;
  const first = await rpc(t, (req, res) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ jsonrpc: "2.0", id: req.id, error: { code: 3, message: "execution reverted: KYC", data: "0x" } })); });
  const second = await rpc(t, (_req, res) => { fallback++; res.end("{}"); });
  const provider = testnetProvider(296, { rpc: `${first},${second}`, batchMaxCount: 1 });
  t.after(() => provider.destroy());
  await assert.rejects(provider.send("eth_call", [{ to: "0x0000000000000000000000000000000000000001", data: "0x" }, "latest"]), /revert/i);
  assert.equal(fallback, 0);
});
test("a lagging relay's null receipt does not hide a receipt available from the fallback", async (t) => {
  let fallback = 0;
  const first = await rpc(t, (req, res) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: null })); });
  const second = await rpc(t, (req, res) => { fallback++; res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: { transactionHash: "known" } })); });
  const provider = testnetProvider(296, { rpc: `${first},${second}`, batchMaxCount: 1 });
  t.after(() => provider.destroy());
  const receipt = await provider.send("eth_getTransactionReceipt", ["0x" + "1".repeat(64)]);
  assert.equal(receipt.transactionHash, "known"); assert.equal(fallback, 1);
});
