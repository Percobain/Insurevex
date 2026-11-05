# Whitechain feedback

Honest notes from building InsureVEX on Whitechain Sepolia during the hackathon.

## What worked

- **Plain EVM, no surprises.** Hardhat 2 with `chainId: 1874` and the public RPC deployed seven contracts first time. Gas at the 5 gwei floor was cheap: the whole suite plus wiring cost under 0.07 WBT.
- **Blockscout verification** through `hardhat verify` with a `customChains` entry (`https://explorer.testnet.whitechain.io/api`) verified every contract on the first try, including viaIR builds with long constructor arguments.
- **`llms.txt` and the `.md` version of every docs page** were excellent for an AI-assisted workflow. The network reference page has everything needed in one place.
- **A live Uniswap v3 pool** (SwapRouter02 `0xe208…6962`, WWBT/USDT 0.3%) meant we could turn faucet WBT into the official test USDT ourselves. That is what made "every payment in USDT" possible.

## Where we got stuck

- **Getting test USDT.** The faucet only drips WBT. Nothing in the docs explains how a builder gets `0xcedf…55a7`, even though the track requires a USDT payment. We had to read the token's transfer history on Blockscout to find the swap router and the pool. A one-line "swap WBT for USDT here" (or a USDT drip on the faucet) would save every team this detour.
- **Sourcify.** `hardhat-verify` also tries Sourcify, which does not know chain 1874, so every verification prints a 404 after succeeding on Blockscout. That is harmless but confusing. Documenting `sourcify: { enabled: false }` for Hardhat 2 would help.
- **Faucet amount.** The docs say 0.5 WBT per day, but the faucet UI offered and paid 2 WBT. The docs look out of date.

## What the docs were missing

- The USDT (and USDC) test token addresses, with how to obtain them on Sepolia.
- The DEX router and pool addresses (Uniswap v3 deployment on Sepolia) in the predeployed-contracts table.
- A Hardhat 2 (CommonJS) variant of the Hardhat guide. Many existing codebases are not on Hardhat 3 / ESM yet.
