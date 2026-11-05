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
export const CHAINS = {
  1874: { key: "whitechainSepolia", name: "Whitechain Sepolia", rpc: process.env.WHITECHAIN_RPC || "https://rpc.testnet.whitechain.io", explorer: "https://explorer.testnet.whitechain.io", stableSymbol: "USDT", logChunk: 5000 },
  296: { key: "hederaTestnet", name: "Hedera Testnet", rpc: process.env.HEDERA_RPC || "https://testnet.hashio.io/api", explorer: "https://hashscan.io/testnet", stableSymbol: "tUSD", logChunk: 1000 },
  5042002: { key: "arcTestnet", name: "Arc Testnet", rpc: process.env.ARC_RPC || "https://rpc.testnet.arc.network", explorer: "https://testnet.arcscan.app", stableSymbol: "USDC", logChunk: 5000 },
};

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

const ctx = new Map();
export function chain(chainId) {
  chainId = Number(chainId);
  if (ctx.has(chainId)) return ctx.get(chainId);
  const cfg = CHAINS[chainId];
  if (!cfg) return null;
  const dep = loadDeployment(cfg.key);
  if (!dep) return null;
  const provider = new ethers.JsonRpcProvider(cfg.rpc, chainId, { staticNetwork: true, batchMaxCount: 20 });
  const signer = quoterKey ? new ethers.NonceManager(new ethers.Wallet(quoterKey, provider)) : null;
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

const QUOTE_TYPES = { Quote: [
  { name: "buyer", type: "address" }, { name: "symbol", type: "bytes32" }, { name: "notional", type: "uint256" },
  { name: "shares", type: "uint256" }, { name: "heldShares", type: "uint256" }, { name: "deductibleBps", type: "uint32" },
  { name: "capBps", type: "uint32" }, { name: "premium", type: "uint256" }, { name: "startPrice", type: "uint256" },
  { name: "expiry", type: "uint64" }, { name: "validUntil", type: "uint64" }, { name: "nonce", type: "uint256" }] };

export async function signQuote(c, q) {
  if (!quoterKey) throw new Error("quoter key not configured");
  const w = new ethers.Wallet(quoterKey);
  const domain = { name: "InsureVEX CoverMarket", version: "1", chainId: c.chainId, verifyingContract: c.dep.contracts.CoverMarket };
  return w.signTypedData(domain, QUOTE_TYPES, q);
}
