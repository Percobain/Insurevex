// Chain access: providers, the quoter/keeper signer, and contract handles for every deployed testnet.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

const here = path.dirname(fileURLToPath(import.meta.url));
const abi = (n) => JSON.parse(fs.readFileSync(path.join(here, "abi", `${n}.json`), "utf8"));
export const ABI = Object.fromEntries(["IdentityRegistry", "PriceOracle", "TBillVault", "UnderwritingPool", "CoverMarket", "ProtectedNote", "TestUSD"].map((n) => [n, abi(n)]));
export const ERC20_ABI = ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)", "function symbol() view returns (string)", "function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)", "function transfer(address,uint256) returns (bool)"];

// TESTNETS ONLY. The server refuses any other chain id.
// Each chain has a list of RPCs (from chainlist.org, tested), tried in order with automatic failover. An env override
// (comma-separated) replaces the list. ALCHEMY_API_KEY adds Alchemy where it supports the chain: Arc (works on the free
// plan; its eth_getLogs range is tiny, so log scans fail over to the next RPC) and Hedera (enable "Hedera Testnet" for the
// app in the Alchemy dashboard; until then it is skipped automatically).
const ALCHEMY = (process.env.ALCHEMY_API_KEY || "").trim();
const rpcList = (env, list) => (process.env[env] || "").trim() ? process.env[env].split(",") : list.filter(Boolean);
export const CHAINS = {
  1874: { key: "whitechainSepolia", name: "Whitechain Sepolia", explorer: "https://explorer.testnet.whitechain.io", stableSymbol: "USDT", logChunk: 5000,
    rpcs: rpcList("WHITECHAIN_RPC", ["https://rpc.testnet.whitechain.io"]) },
  296: { key: "hederaTestnet", name: "Hedera Testnet", explorer: "https://hashscan.io/testnet", stableSymbol: "tUSD", logChunk: 1000,
    rpcs: rpcList("HEDERA_RPC", ["https://296.rpc.thirdweb.com", "https://testnet.hashio.io/api",
      ALCHEMY && `https://hedera-testnet.g.alchemy.com/v2/${ALCHEMY}`, "https://lb.routeme.sh/rpc/evm/296"]) },
  5042002: { key: "arcTestnet", name: "Arc Testnet", explorer: "https://explorer.testnet.arc.io", stableSymbol: "USDC", logChunk: 5000,
    rpcs: rpcList("ARC_RPC", ["https://rpc.testnet.arc.network", "https://arc-testnet-rpc.publicnode.com",
      ALCHEMY && `https://arc-testnet.g.alchemy.com/v2/${ALCHEMY}`, "https://arc-testnet.drpc.org"]) },
};
for (const c of Object.values(CHAINS)) c.rpc = c.rpcs[0]; // primary, for display


const DEPLOY_DIRS = [path.join(here, "..", "deployments"), path.join(here, "..", "..", "contracts", "deployments")];
function loadDeployment(key) {
  for (const d of DEPLOY_DIRS) {
    const f = path.join(d, `${key}.json`);
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
  }
  return null;
}

const rawKey = (process.env.QUOTER_PRIVATE_KEY || process.env.PRIVATE_KEY || "").trim();
export const quoterKey = rawKey ? (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) : null;

// An RPC answered but cannot serve this request (rate limit, plan limit, range too large, network not enabled, overloaded).
// Contract reverts and bad-input errors are NOT in here: those are real answers and must not fail over.
const INFRA = /rate.?limit|too many|exceed|limit(ed)? |upgrade|free (tier|plan)|plan|not enabled|not supported|unsupported|unauthori|forbidden|capacity|overload|busy|timeout|timed out|try again|temporar|unavailable|internal error|header not found|ranges? over|block range|range is too/i;
const mask = (u) => u.replace(/\/v2\/[A-Za-z0-9_-]+/, "/v2/<key>");

/**
 * JSON-RPC provider over a list of URLs with failover. A transport failure (timeout, reset, HTTP error) or an
 * infrastructure error in the JSON-RPC answer moves the request to the next URL; the URL that failed sits out for
 * RPC_COOLDOWN_MS (default 60 s). A single URL gets one retry. Each request times out after RPC_TIMEOUT_MS (20 s).
 */
class MultiRpcProvider extends ethers.JsonRpcProvider {
  constructor(urls, chainId, opts) {
    super(urls[0], chainId, opts);
    this.urls = urls.length > 1 ? urls : [urls[0], urls[0]];
    this.benchedUntil = new Map();
    this.timeoutMs = Number(process.env.RPC_TIMEOUT_MS || 20_000);
    this.cooldownMs = Number(process.env.RPC_COOLDOWN_MS || 60_000);
    this.lastGood = urls[0];
  }
  order() {
    const now = Date.now();
    const ok = this.urls.filter((u) => (this.benchedUntil.get(u) || 0) <= now);
    return ok.length ? ok : this.urls; // everything benched: try them all anyway
  }
  async _send(payload) {
    let lastErr;
    for (const url of this.order()) {
      const req = new ethers.FetchRequest(url);
      req.timeout = this.timeoutMs;
      req.body = JSON.stringify(payload);
      req.setHeader("content-type", "application/json");
      try {
        const resp = await req.send();
        resp.assertOk();
        const body = resp.bodyJson;
        const list = Array.isArray(body) ? body : [body];
        const bad = list.find((r) => r?.error && INFRA.test(`${r.error.message || ""} ${r.error.code || ""}`) && !/revert/i.test(r.error.message || ""));
        if (bad) throw new Error(`${mask(url)}: ${bad.error.message}`);
        if (url !== this.lastGood && process.env.RPC_LOG !== "0") console.log(`[rpc] chain ${this._network?.chainId ?? ""} now using ${mask(url)}`);
        this.lastGood = url;
        return list;
      } catch (e) {
        lastErr = e;
        this.benchedUntil.set(url, Date.now() + this.cooldownMs);
      }
    }
    throw lastErr;
  }
}

const ctx = new Map();
export function chain(chainId) {
  chainId = Number(chainId);
  if (ctx.has(chainId)) return ctx.get(chainId);
  const cfg = CHAINS[chainId];
  if (!cfg) return null;
  const dep = loadDeployment(cfg.key);
  const need = ["stable", "IdentityRegistry", "PriceOracle", "TBillVault", "UnderwritingPool", "CoverMarket"];
  if (!dep || need.some((k) => !dep.contracts?.[k])) return null; // missing or still being written
  const urls = cfg.rpcs.map((u) => u.trim()).filter(Boolean);
  // Hedera relays reject batched eth_getLogs: send every call on its own there.
  const provider = new MultiRpcProvider(urls, chainId, { staticNetwork: true, batchMaxCount: chainId === 296 ? 1 : 20 });
  const signer = quoterKey ? new ethers.Wallet(quoterKey, provider) : null; // fresh pending nonce per tx (keeper txs are sequential)
  const runner = signer || provider;
  const c = dep.contracts;
  const out = {
    chainId, cfg, dep, provider, signer,
    address: quoterKey ? new ethers.Wallet(quoterKey).address : null,
    stable: new ethers.Contract(c.stable, ERC20_ABI, runner),
    identity: new ethers.Contract(c.IdentityRegistry, ABI.IdentityRegistry, runner),
    oracle: new ethers.Contract(c.PriceOracle, ABI.PriceOracle, runner),
    tbill: new ethers.Contract(c.TBillVault, ABI.TBillVault, runner),
    pool: new ethers.Contract(c.UnderwritingPool, ABI.UnderwritingPool, runner),
    market: new ethers.Contract(c.CoverMarket, ABI.CoverMarket, runner),
    notes: (dep.notes || []).map((n) => ({ ...n, contract: new ethers.Contract(n.address, ABI.ProtectedNote, runner) })),
  };
  ctx.set(chainId, out);
  return out;
}

export function activeChains() {
  return Object.keys(CHAINS).map(Number).filter((id) => chain(id));
}

export const symbolId = (s) => ethers.id(s);

export const QUOTE_TYPES = { Quote: [
  { name: "buyer", type: "address" }, { name: "symbol", type: "bytes32" }, { name: "market", type: "bytes32" }, { name: "notional", type: "uint256" },
  { name: "shares", type: "uint256" }, { name: "heldShares", type: "uint256" }, { name: "deductibleBps", type: "uint32" },
  { name: "capBps", type: "uint32" }, { name: "premium", type: "uint256" }, { name: "startPrice", type: "uint256" },
  { name: "expiry", type: "uint64" }, { name: "validUntil", type: "uint64" }, { name: "nonce", type: "uint256" }] };

export async function signQuote(c, q) {
  if (!quoterKey) throw new Error("quoter key not configured");
  const w = new ethers.Wallet(quoterKey);
  const domain = { name: "InsureVEX CoverMarket", version: "1", chainId: c.chainId, verifyingContract: c.dep.contracts.CoverMarket };
  return w.signTypedData(domain, QUOTE_TYPES, q);
}
