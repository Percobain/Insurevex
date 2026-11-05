import { defineChain } from "viem";

export const whitechainSepolia = defineChain({
  id: 1874,
  name: "Whitechain Sepolia",
  nativeCurrency: { name: "WBT", symbol: "WBT", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.whitechain.io"] } },
  blockExplorers: { default: { name: "Whitechain Explorer", url: "https://explorer.testnet.whitechain.io" } },
  testnet: true,
});

export const hederaTestnet = defineChain({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet.hashio.io/api"] } },
  blockExplorers: { default: { name: "HashScan", url: "https://hashscan.io/testnet" } },
  testnet: true,
});

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
  blockExplorers: { default: { name: "ArcScan", url: "https://explorer.testnet.arc.io" } },
  testnet: true,
});

export const CHAINS = [whitechainSepolia, hederaTestnet, arcTestnet];

/** Per-chain product metadata: the settlement stablecoin, what the chain is used for, and explorer link builders. */
export const CHAIN_META = {
  1874: {
    key: "whitechainSepolia",
    short: "Whitechain",
    stable: "USDT",
    role: "Notes and cover settled in the official test USDT",
    tx: (h) => `https://explorer.testnet.whitechain.io/tx/${h}`,
    address: (a) => `https://explorer.testnet.whitechain.io/address/${a}`,
  },
  296: {
    key: "hederaTestnet",
    short: "Hedera",
    stable: "tUSD",
    role: "Tokenised stocks and the note issued with Asset Tokenization Studio",
    tx: (h) => `https://hashscan.io/testnet/transaction/${h}`,
    address: (a) => `https://hashscan.io/testnet/address/${a}`,
  },
  5042002: {
    key: "arcTestnet",
    short: "Arc",
    stable: "USDC",
    role: "USDC-native settlement, gas paid in USDC",
    tx: (h) => `https://explorer.testnet.arc.io/tx/${h}`,
    address: (a) => `https://explorer.testnet.arc.io/address/${a}`,
  },
};

export const DEFAULT_CHAIN_ID = Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID || 1874);

export function chainMeta(chainId) {
  return CHAIN_META[chainId] || CHAIN_META[DEFAULT_CHAIN_ID];
}
