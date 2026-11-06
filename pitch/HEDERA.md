# InsureVEX — Hedera pitch

**Bounties:** Tokenize Anything with Hedera Studios; AI Agents That Pay: x402 on Hedera.

## Spoken pitch — approximately 3 minutes

In today’s world, economic uncertainty is everywhere. Markets can crash overnight. Fear, uncertainty and doubt affect how people save and invest. A saver worries about losing their principal. A stockholder worries about a sudden crash. And even when software can identify the need for protection, paying for it still often requires a person to step in.

We built InsureVEX to connect those needs: tokenised investments, collateralised stock protection and an agent that can pay for underwriting and purchase protection on Hedera.

Here’s the financial idea. A saver buys a note designed to protect principal at maturity. Most of the deposit funds a Treasury floor; the remainder provides capital for stock crash protection. Stockholders pay premiums, and underwriting profits can become additional income for savers.

Using Hedera’s Asset Tokenization Studio, we issued two test securities: a tokenised NVIDIA equity and a three-year protected-note bond. We configured identity, KYC, freeze controls, maturity and coupons.

These tokens have a practical role in the application. When someone buys protection, our CoverMarket checks their ATS share balance directly on-chain. If they request more cover than their eligible holdings support, the transaction reverts. We demonstrated both that rejection and a partial freeze on testnet.

Now, how does the agent buy protection?

Within a predefined mandate, it discovers our underwriting endpoint and requests a quote. The server responds with HTTP 402 Payment Required and a price of 0.01 HBAR.

The agent checks the merchant and its persistent spending budget, signs the payment and retries. The official Hedera x402 facilitator verifies and settles the payment, sponsoring the network fee for that service request.

The agent receives a signed insurance quote, checks the signer, terms, holdings and limits, then approves exactly the required premium and purchases the policy. Our contract collects the premium and reserves the maximum possible payout in the same transaction.

That is two distinct payments: HBAR through x402 for underwriting, and test USD through CoverMarket for the insurance premium. The agent pays gas for the insurance transactions.

We recorded the complete flow on Hedera testnet: a settled x402 payment followed by a purchase that issued policy number four. Both receipts are on HashScan.

The agent operates with per-call and daily budgets, merchant and contract allowlists, position limits and an emergency stop. It anchors a digest of its spending log through Hedera Consensus Service. This is a deterministic client, with no human approving each payment and no authority to manage the pool or change settlement prices.

The asset lifecycle continues beyond purchase. We configured the ATS bond’s coupons and separately demonstrated an InsureVEX coupon call executed by Hedera’s native Schedule Service, without an external keeper.

Today, these are test assets with simulated Treasury custody. Production principal protection requires maturity-matched assets and dependable custody, alongside stablecoin, oracle and contract risk management.

InsureVEX connects two Hedera capabilities in one financial journey: ATS makes ownership and asset rules usable on-chain, and x402 lets an agent pay for underwriting and act within a budget. From issuing an asset to purchasing protection and executing a scheduled coupon, we demonstrate a working lifecycle on Hedera.

## Combined demo — target 4 minutes 45 seconds

1. **0:00–0:30 — Problem and product.** Explain the saver, stockholder and agent. Name both bounties.
2. **0:30–1:15 — ATS issuance and configuration.** Show equity and bond issuance on HashScan, KYC/SSI configuration, issued holdings, maturity and coupon settings. Show the ATS equity mapping in CoverMarket.
3. **1:15–2:30 — Autonomous payment and policy.** Show the mandate and spending limits on `/agent`, then execute a run or play the recorded run. Show the 402 challenge, settled HBAR payment, signed quote and separate test USD policy purchase. Open both receipts on HashScan.
4. **2:30–3:10 — Controls.** Show the recorded rejection of excessive coverage, a partial freeze, remaining agent budget and emergency stop. Show the HCS spending-log digest anchor.
5. **3:10–4:10 — Lifecycle operation.** Show the native scheduled coupon execution and resulting payment. Distinguish the ATS bond’s coupon configuration from the InsureVEX contract distributing the demonstrated coupon. Briefly show oracle/NAV controls.
6. **4:10–4:45 — Architecture and close.** Connect ATS ownership → paid underwriting through x402 → collateralised policy → expiry-price settlement. Explain simulated custody and close on the combined financial journey.

Use recorded receipts for completed operations and identify them as recorded evidence. The complete video must remain under five minutes for both tracks.

## Evidence — tokenization

- [ATS equity issuance](https://hashscan.io/testnet/transaction/0x1ad148f2f7b736a34777294c02d6b16b2c4512f9a0b19e14d73e2d0e6e31365c).
- [ATS bond issuance](https://hashscan.io/testnet/transaction/0xff29c0bf6dda7f39c99d6e1d1676c1884fe87d2f13f18130cc2a37663aa57600).
- [Bond coupon configuration](https://hashscan.io/testnet/transaction/0x7d19657c49d5749c2b36d71f5af853a1bfbb1f86b6fbd1f157a99887593f08f2).
- [Cover purchase using ATS ownership](https://hashscan.io/testnet/transaction/0xc2052f731865cbaa9bbf3cf8c8d1c96b8babfcb1d6450f1115a2f24459c4634d).
- [Partial freeze](https://hashscan.io/testnet/transaction/0xb6df323782b41dc637c037ffc71cbd7c4b2d7af43db7a2b240704d1c5ba7b9bf).
- [Native scheduled coupon transaction](https://hashscan.io/testnet/transaction/0xbcc84e157f4a2764b12c994b4cfea36e6bec4998fc439299156b6745b6956cb6).
- [Verified equity contract](https://hashscan.io/testnet/contract/0xe77F4a19C336841643b7a671557fdBa2eFd0465E), [verified ATS bond](https://hashscan.io/testnet/contract/0x2bCfC2Bb864f651d78a0838ae2068141B2F57703).
- [Architecture](../docs/ARCHITECTURE.md), [lifecycle evidence](../contracts/deployments/hederaTestnet.lifecycle.json), [README](../README.md).

## Evidence — x402 and autonomous purchase

- Endpoint: `POST /api/agent/underwrite` on the persistent merchant.
- [Settled x402 payment: 0.01 HBAR](https://hashscan.io/testnet/transaction/0.0.9185802%401793930226.658562707).
- Hedera transaction ID: `0.0.9185802@1793930226.658562707`.
- [Policy #4 purchase: 0.002091 test USD premium, protecting 1.816 test USD of tokenised NVIDIA](https://hashscan.io/testnet/transaction/0x55a420aa99da3be5f0296ec3ff7bec6de018aa9ca79a297baff3cb4674085b49).
- [HCS audit-anchor transaction](https://hashscan.io/testnet/transaction/0.0.11332658%401793930247.715859731), topic `0.0.11332661`.
- [Recorded 42.5-second live run](../docs/evidence/hedera-x402-demo.mp4), [sanitised receipts](../docs/evidence/hedera-x402.json), [independent verification](../docs/evidence/hedera-x402-verification.json).
- [Setup, architecture and payment flow](../docs/HEDERA_X402.md).
## Presenter notes and submission preparation

- Run the persistent merchant for the agent demo. Payment mode needs durable SQLite state and is not deployed on the existing Vercel API.
- Provide a public, reviewed and sanitised GitHub repository with setup, architecture, payment flow and the settled Hedera transaction ID. Existing submission documentation marks public-source publication as pending.
- Show issuance, configuration and at least one lifecycle operation, as well as a settled x402 payment and its HashScan receipt, within the five-minute video.
- The agent is a deterministic client, permitted by the supplied track requirements. Do not imply LLM reasoning or unrestricted autonomous investment decisions.
- HCS contains an anchor for a hash-linked local spending log; it does not store every full receipt. Local wallet policies cannot constrain a thief who obtains the private key.
- ATS ownership is checked at policy purchase. Continuous ownership enforcement is future work.
- Scheduled coupon execution is part of the asset lifecycle; it is not a recurring x402 subscription. ATS coupon configuration and the InsureVEX distribution contract are distinct.
- Do not claim Stablecoin Studio, HTS USDC settlement, HCS-14/ERC-8004 identity, multi-agent negotiation or Agent Kit integration.
- Principal protection is a maturity-based design subject to its funding and infrastructure assumptions. It is not cover against hacks or platform shutdowns.
