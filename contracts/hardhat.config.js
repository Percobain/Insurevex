require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// Accept the key with or without 0x. TESTNETS ONLY: every network below is a test network.
const raw = (process.env.PRIVATE_KEY || "").trim();
const accounts = raw ? [raw.startsWith("0x") ? raw : `0x${raw}`] : [];

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true, evmVersion: "cancun" },
  },
  networks: {
    hardhat: {},
    // Whitechain Sepolia (OP Stack L2, gas in WBT). Payments use the official test USDT.
    whitechainSepolia: { url: process.env.WHITECHAIN_RPC || "https://rpc.testnet.whitechain.io", chainId: 1874, accounts },
    // Hedera testnet JSON-RPC relay (Hashio). Gas in HBAR.
    hederaTestnet: { url: process.env.HEDERA_RPC || "https://testnet.hashio.io/api", chainId: 296, accounts, timeout: 120000 },
    // Arc testnet (Circle). Gas is USDC.
    arcTestnet: { url: process.env.ARC_RPC || "https://rpc.testnet.arc.network", chainId: 5042002, accounts },
  },
  etherscan: {
    apiKey: { whitechainSepolia: "empty", arcTestnet: "empty" },
    customChains: [
      { network: "whitechainSepolia", chainId: 1874,
        urls: { apiURL: "https://explorer.testnet.whitechain.io/api", browserURL: "https://explorer.testnet.whitechain.io" } },
      { network: "arcTestnet", chainId: 5042002,
        urls: { apiURL: "https://testnet.arcscan.app/api", browserURL: "https://testnet.arcscan.app" } },
    ],
  },
  sourcify: { enabled: true }, // HashScan verifies Hedera contracts through Sourcify
};
