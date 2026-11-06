# InsureVEX — Whitechain pitch

**Bounty:** Tokenize · Real World Finance on Whitechain.

## Spoken pitch — approximately 2–3 minutes

In today’s world, economic uncertainty is everywhere. Markets can crash overnight. Fear, uncertainty and doubt leave ordinary investors asking: how do I earn a return while protecting the money I started with?

We built InsureVEX: a tokenised note with principal protection designed into its structure, connected to a stock crash-protection market. Its financial payments settle in the official test USDT on Whitechain Sepolia.

There are four roles. The issuer manages eligibility and asset attestations. The saver subscribes to the note. The stockholder buys crash protection. A professional liquidity provider can supply capital that absorbs losses first.

Imagine a saver deposits a thousand dollars for three years at an illustrative four-percent Treasury rate. About 893 dollars funds the Treasury floor, designed to grow back to a thousand dollars at maturity. The remaining 107 dollars supplies underwriting capital. Stockholders pay premiums for protection, and underwriting profits can become the saver’s USDT coupons.

Let me show you the lifecycle.

First, the issuer approves the saver’s identity with a country and expiry. The saver subscribes in USDT, and one transaction splits the deposit between the floor and the underwriting pool, then issues the note.

The note’s rules are enforced by the contract. Transfers require verified accounts, frozen accounts are restricted, and transfers stop at maturity. A wallet cannot bypass those rules by using a different interface.

Next, a stockholder receives a signed quote and purchases protection in USDT. The market collects the premium and reserves the maximum payout in the same transaction. At expiry, anyone can trigger settlement once the required oracle price has been posted.

Finally, the saver claims available coupons and redeems the note at maturity. We have a completed Whitechain demo-note redemption: two test USDT subscribed and 2.000026 test USDT returned.

Why does this need on-chain settlement? The USDT premium, collateral reservation and policy issuance are one atomic operation. The token’s investor restrictions are enforced on the same ledger. A regular payment transfer alone cannot enforce those asset and collateral conditions together.

Our contracts are deployed and verified on Whitechain Sepolia, chain 1874. We use the sponsor’s specified USDT contract for the main flow.

This is a testnet demonstration with simulated Treasury custody. Production principal protection requires maturity-matched Treasury assets and dependable custody, alongside stablecoin, oracle and contract risk management.

InsureVEX demonstrates a financial instrument through its lifecycle: eligible issuance, collateralised protection, USDT payments and maturity redemption—with the rules enforced on Whitechain.

## Demo cues — final video must be 2–4 minutes

1. **Issuer:** approve identity and show eligibility settings.
2. **Saver:** subscribe using the official test USDT. Show the split and a blocked transfer to a wallet without KYC.
3. **Pro liquidity provider:** show the first-loss deposit and pool balances.
4. **Stockholder:** request a quote, buy cover and show the premium transaction and locked maximum payout.
5. **Settlement and saver:** show the posted expiry price, settlement, coupon claim and recorded matured-note redemption. Clearly label any simulated crash price. Use recorded maturity evidence instead of implying a three-year note matures during the demo.

## Evidence and submission preparation

- Network: Whitechain Sepolia, chain ID `1874`.
- [Official test USDT](https://explorer.testnet.whitechain.io/address/0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7): `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`.
- [Saver subscription: 6 USDT to the three-year note](https://explorer.testnet.whitechain.io/tx/0x0f223d1724218845e34f555cbf85b632358a97808e33e99b43c02a8a8cbd8845).
- [Pro first-loss deposit: 4 USDT](https://explorer.testnet.whitechain.io/tx/0xddc254bcc75422d987df89a87ad47041c1a70a524794c264b8979ebf77059c1f).
- [MSFT protection purchase](https://explorer.testnet.whitechain.io/tx/0xc781ea23763d835b60669ddbc66826778064467f30dfb7cf0e0148385a23ad62).
- [Coupon claim](https://explorer.testnet.whitechain.io/tx/0x4f1ca2609c4a007777e8a9f9bc9fcb108bc94ed00c8193d0915935d885a27b50).
- [Demo-note redemption: 2 USDT in, 2.000026 USDT back](https://explorer.testnet.whitechain.io/tx/0x24d2361d7c64521e6902a43f0523a2229824968bd42a2d65eb90fb9a894b0a89).
- [Verified note contract](https://explorer.testnet.whitechain.io/address/0x857C551AeD884F7104a3557183aaC8F588D5F4A5#code).
- [Architecture](../docs/ARCHITECTURE.md), [full lifecycle evidence](../contracts/deployments/whitechainSepolia.lifecycle.json), [Whitechain feedback](../WHITECHAIN_FEEDBACK.md).
- The [README](../README.md) includes transaction links and the on-chain settlement rationale. Public-source publication remains pending in the submission documentation; preserve the hackathon’s progress history in the reviewed public submission.

## Judge questions to answer precisely

The testnet Treasury vault is a simulated custody/NAV component. Brokerage holdings are self-reported in the testnet quote flow and need independent verification for production. The floor protects against underwriting losses under its funding assumptions; it does not insure against hacks, custody failure or a stablecoin depeg. Financial payments use USDT; network gas uses WBT.
