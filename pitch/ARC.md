# InsureVEX — Arc pitch

**Bounty:** Best DeFi / Onchain Finance App Built End to End in Arc Studio.

## Spoken pitch — approximately 2–3 minutes

In today’s world, economic uncertainty is everywhere. Markets can crash overnight, and fear, uncertainty and doubt shape how people invest. For a saver, the question is simple: how can I earn something extra while protecting the money I started with?

We built InsureVEX: a principal-protected note design connected to a fully collateralised stock crash-protection market, settling in USDC on Arc.

We connect two users. A saver wants their principal back at maturity, plus potential income. A stockholder wants protection against a sharp fall in a stock they own.

Imagine a thousand-dollar, three-year note at an illustrative four-percent Treasury rate. About 893 dollars goes into the Treasury floor, designed to grow back to a thousand dollars at maturity. The remaining 107 dollars goes into an underwriting pool. Stockholders pay premiums for crash protection, and underwriting profits can become the saver’s coupons. Professional liquidity providers can add capital that absorbs losses before the saver’s underwriting allocation.

Arc Studio was part of building the product. It generated and tested its own version of our six core contracts and built a frontend for savers, stockholders, liquidity providers and issuers. Its security review identified issues we addressed in our deployed contracts, including payout handling and first-loss accounting.

Let me show you the Studio project, then the working flow.

A saver subscribes in USDC. The note splits the deposit between its floor and underwriting allocation. A stockholder receives a signed quote from our backend and pays the premium. In that transaction, the contracts issue the policy and reserve its maximum payout. At expiry, settlement uses the price posted to our oracle. Savers can claim available coupons and redeem when their note matures.

USDC is both the settlement asset and Arc’s gas asset, so users can complete this flow with one asset. We have recorded subscriptions, policy purchases, coupon claims and maturity redemption on Arc testnet.

Our architecture connects the Studio-built interface to the InsureVEX API and the deployed contracts. The backend prices and signs quotes; the contracts enforce collateral, eligibility and settlement rules.

This is a testnet MVP with simulated Treasury custody. Production principal protection requires maturity-matched Treasury assets and reliable custody, alongside stablecoin, oracle and contract risk management.

InsureVEX brings saving and stock protection into one USDC financial flow—and Arc Studio helped us build, test and improve that flow end to end.

## Demo cues — target 3–4 minutes

1. Open the shareable Arc Studio project. Show its generated contract code, tests and application. Explain that the Studio app connects to the existing InsureVEX API and deployed v3 contracts.
2. Show the architecture diagram and identify frontend, pricing backend and contracts. Explain that the shared diagram’s USDT labels become USDC for Arc.
3. Show the saver’s subscription, then the holder’s quote and policy purchase. Open the USDC transactions in the explorer.
4. Show the pool’s locked collateral and issuer controls, then recorded coupon and maturity redemption transactions. Use recorded evidence when a note has not yet matured.
5. Close on the product’s user benefit and the contribution of Arc Studio.

## Evidence and submission preparation

- [Arc Studio project](https://studio.arc.io/app/7356f9d2-e713-4576-a2f0-4acfd62806e4).
- [Arc subscription: 4 USDC](https://explorer.testnet.arc.io/tx/0x493681cc37a8c3733300b7357c2162ed6130d33094b07d5f9372503b26606f56).
- [MSFT cover purchase](https://explorer.testnet.arc.io/tx/0xcc9e6b5d5cbdbffbcb9c1b455cb0a440dba53198ee651f29e8429c1b44218197).
- [Demo-note redemption: 1 USDC in, 1.000012 USDC back, gas separate](https://explorer.testnet.arc.io/tx/0x399fed68ff961778d29dbe3c1a67b21fd64dc5eec5cb092792e0ae7eb676056b).
- [Architecture](../docs/ARCHITECTURE.md), [deployment lifecycle](../contracts/deployments/arcTestnet.lifecycle.json), [project README](../README.md).
- Confirm the Studio project opens for judges and record Studio in the demo. Repository documentation currently identifies public-source publication as pending; provide a public, sanitised repository before submission.

## Judge question: what did Studio build?

Studio wrote and tested its own contract implementation and built the role-based app. The app uses the shared InsureVEX backend and deployed v3 contracts. Describe those boundaries explicitly; do not imply every component originated in Studio. Do not claim CCTP, Circle Wallets, EURC or other Circle integrations that are not implemented.
