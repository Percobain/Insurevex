import path from "node:path";
import { ethers } from "ethers";

const flag = (v) => {
  if (v == null || ["", "0", "false"].includes(v)) return false;
  if (["1", "true"].includes(v)) return true;
  throw new Error("Chainlink feature flags must be 0/1 or false/true");
};
export function chainlinkConfig(env = process.env) {
  const enabled = flag(env.CHAINLINK_ENABLED);
  const chainIds = (env.CHAINLINK_CHAIN_IDS || "1874,296").split(",").map(Number);
  const symbols = (env.CHAINLINK_SYMBOLS || "NASDAQ:NVDA,NYSEARCA:SPY").split(",");
  if (enabled) {
    if (env.VERCEL) throw new Error("CRE relay requires persistent state; serverless settlement is disabled");
    if (!chainIds.length || !chainIds.every((id) => [1874, 296].includes(id))) throw new Error("CRE integration is limited to Whitechain and Hedera testnets");
    if (!symbols.length || !symbols.every((s) => /^(NASDAQ|NYSEARCA|NYSE):[A-Z.]{1,10}$/.test(s))) throw new Error("CRE supports allowlisted US symbols only");
  }
  return { enabled, settlementEnabled: enabled && flag(env.CHAINLINK_SETTLEMENT_ENABLED), chainIds, symbols,
    symbolIds: symbols.map(ethers.id), token: env.CHAINLINK_REPORT_TOKEN || "",
    stateFile: env.CHAINLINK_STATE_FILE || path.resolve(".chainlink-state/settlements.sqlite") };
}
export function usesChainlink(chainId, symbol, config = chainlinkConfig()) {
  return config.enabled && config.chainIds.includes(Number(chainId)) && config.symbolIds.includes(symbol);
}
