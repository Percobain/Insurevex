import IdentityRegistry from "@/abi/IdentityRegistry.json";
import PriceOracle from "@/abi/PriceOracle.json";
import TBillVault from "@/abi/TBillVault.json";
import UnderwritingPool from "@/abi/UnderwritingPool.json";
import CoverMarket from "@/abi/CoverMarket.json";
import ProtectedNote from "@/abi/ProtectedNote.json";
import { CHAIN_META } from "./chains";

export const ABI = { IdentityRegistry, PriceOracle, TBillVault, UnderwritingPool, CoverMarket, ProtectedNote };

export const ERC20_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "v", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
];

// Load every deployment JSON that exists at build time. Missing networks simply are not in the map.
const DEPLOYMENTS = {};
try {
  const ctx = require.context("../deployments", false, /\.json$/);
  ctx.keys().forEach((k) => {
    const d = ctx(k);
    const json = d.default || d;
    if (json && json.chainId) DEPLOYMENTS[json.chainId] = json;
  });
} catch (e) {
  // no deployments folder: every chain shows "deploying soon"
}

export function getDeployment(chainId) {
  return DEPLOYMENTS[chainId] || null;
}

export function deployedChainIds() {
  return Object.keys(DEPLOYMENTS).map(Number);
}

/** Address of a named contract on a chain, or undefined. */
export function addr(chainId, name) {
  return DEPLOYMENTS[chainId]?.contracts?.[name];
}

export function notesOf(chainId) {
  const d = DEPLOYMENTS[chainId];
  if (!d) return [];
  return (d.notes || []).filter((n) => n.address);
}

export function isDeployed(chainId) {
  return Boolean(DEPLOYMENTS[chainId]?.contracts?.CoverMarket);
}

export function stableSymbol(chainId) {
  return CHAIN_META[chainId]?.stable || "USD";
}

// DEFAULT_ADMIN_ROLE. Other roles are keccak256 of the role name: use roleId() from lib/format.
export const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";

// Junior "Pro" first-loss tranche of the UnderwritingPool. Kept as a local fragment so the app works whether or not
// the re-exported pool ABI is in place yet.
const u256 = [{ type: "uint256" }];
export const PRO_ABI = [
  { type: "function", name: "depositPro", stateMutability: "nonpayable", inputs: [{ name: "assets", type: "uint256" }], outputs: [] },
  { type: "function", name: "withdrawPro", stateMutability: "nonpayable", inputs: [{ name: "assets", type: "uint256" }], outputs: [] },
  { type: "function", name: "maxProWithdraw", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: u256 },
  { type: "function", name: "proBalanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: u256 },
  ...["juniorAssets", "proSupply", "proSharePrice", "proFeeBps", "totalProLosses", "physicalAssets", "capacityTotal"].map((name) => ({
    type: "function", name, stateMutability: "view", inputs: [], outputs: u256,
  })),
  { type: "function", name: "setRiskParams", stateMutability: "nonpayable",
    inputs: [{ name: "reserve_", type: "uint16" }, { name: "symbolCap_", type: "uint16" }, { name: "proFee_", type: "uint16" }], outputs: [] },
];
