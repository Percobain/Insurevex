# InsureVEX: submission guide (ETHGlobal)

Live app: **https://insurevex-app.vercel.app** · API: **https://insurevex-api.vercel.app/api/health** · Repo: https://github.com/Percobain/ethgmum

## The product in one line

Savers buy principal-protected notes. The notes' spare yield insures stock holders (any listed stock, at any broker, or tokenised) against crashes. Everything settles in stablecoins with compliance enforced on-chain.

## Track 1: Whitechain, Tokenize · Real World Finance (USDT)

| Requirement | Where |
|---|---|
| Contracts on Whitechain Sepolia (1874), verified | README "Live deployments": 8 contracts, all verified on explorer.testnet.whitechain.io |
| At least one payment in the official USDT `0xcedf…55a7` in the main flow, with explorer links | README table "USDT payments in the main flow" and `contracts/deployments/whitechainSepolia.lifecycle.json` |
| Real transfer rules enforced on-chain | `ProtectedNote._update` (KYC both sides, not frozen, no transfers after maturity), `IdentityRegistry` (KYC expiry, freeze, blocked countries), `forcedTransfer`, `pause`; T-bill and pool shares are restricted too |
| Clear issuer / investor / business user and at least one full lifecycle step | Issuer (KYC, NAV, oracle), Saver (subscribe → coupon → redeem), Holder (buy cover → settlement), Pro LP (first-loss deposit) |
| Line on why on-chain stablecoin settlement on Whitechain | README blockquote at the top |
| Public repo with steady progress | 20+ commits across the night (contracts → deploy → server → research → app → v2) |
| README: setup, architecture, limitations | README "Setup", "How it works", "Status and current limitations"; `docs/ARCHITECTURE.md` |
| `WHITECHAIN_FEEDBACK.md` | repo root |
| Demo video, 2–4 minutes, showing each party | Script below |

**Video script (3–4 min)**
1. (0:00) Problem: a saver wants their money back; a shareholder in Mumbai or Tokyo fears a crash. One pool, two scared people.
2. (0:30) **Issuer**: `/issuer`. Approve a KYC request (country + expiry) and show the `IdentitySet` tx on the explorer.
3. (1:00) **Saver**: `/save`. Subscribe USDT to the note. On the explorer, one tx splits it into the tokenised T-bill floor and the pool sleeve. Show a blocked transfer to a non-KYC wallet.
4. (1:40) **Holder**: `/protect`. Pick Toyota (TSE) or NIFTY, attest broker holdings, get a signed quote, pay the premium in USDT, and show the max payout locked in the pool.
5. (2:30) **Settlement**: the keeper posts the official close and `settle` pays (or not) in USDT. Then the coupon goes to the Saver and the 3-hour demo note's redemption returns face + sleeve.
6. (3:20) **Pro LP + risk**: `/pool` shows the first-loss tranche, reserve, per-stock and per-market caps. Close on the backtest headline: 23 markets, 8.8%/yr out of sample, the Saver never below 100%.

## Track 2: Hedera, Tokenize Anything with Hedera Studios

| Requirement | Status |
|---|---|
| Use ATS or Stablecoin Studio | `contracts/scripts/hedera-ats.js` calls the live **ATS Factory** (v8.0.0): a tokenised equity (ERC-1400, KYC, freeze, controller, pause) and the Protected Note as an **ATS bond** (ISIN, maturity, KYC via SSI issuer, coupons via `setCoupon`). Encoding is validated against the live factory |
| Deploy and demo on Hedera testnet | **Live.** Full suite plus ATS equity and bond, all verified (Sourcify/HashScan). Lifecycle links in README |
| Contracts verified on HashScan | All 8 suite contracts are an exact match on Sourcify, which HashScan reads (`scripts/sourcify-verify.js`) |
| Video ≤ 5 min: issuance, configuration, one lifecycle operation | Script below |
| Extra points | Compliance controls (ATS KYC + `freezePartialTokens`, our KYC registry, pause, transfer restrictions); oracle/NAV feeds (`PriceOracle`, `TBillVault.updateNav`); custom distributions (coupons, Pro fee); **Scheduled Transactions: the note coupon is scheduled with the Hedera Schedule Service (HIP-1215)** |

**Video script (≤ 5 min)**
1. Issuance: run `hedera-ats.js`, then show the ATS equity and the ATS bond on HashScan.
2. Configuration: SSI issuer + `grantKyc`, issue 100 tokenised NVDA to the holder, `CoverMarket.setSymbolToken(NVDA → ATS equity)`.
3. Lifecycle: the holder buys NVDA cover. The contract reads the **ATS balance** as proof of ownership; try to cover more than held and it reverts. Then `setCoupon` on the bond, a freeze (`freezePartialTokens`), and settlement.

## Track 3: Arc, Best DeFi / Onchain Finance App built in Arc Studio

| Requirement | Status |
|---|---|
| Built in Arc Studio with a shareable project URL | **You** (Chrome is not permitted on studio.arc.io): open Arc Studio, prompt it with the InsureVEX spec (below), import the contracts, share the project URL |
| Functional MVP + architecture diagram | App + API live on Vercel; diagram in `docs/ARCHITECTURE.md` |
| Settlement in USDC | **Live** on Arc testnet, verified on explorer.testnet.arc.io; subscriptions, Pro LP, covers (MSFT, Tencent) and keeper settlement all in USDC |
| Video + docs | Same flow as Whitechain, on Arc (USDC is also the gas token, so a Saver needs nothing else) |

Arc Studio prompt to paste: *"Build InsureVEX: a principal-protected note (floor in a tokenised T-bill, sleeve in an underwriting pool) whose sleeve sells crash floors on stocks, settled in USDC. Contracts: IdentityRegistry, PriceOracle, TBillVault, UnderwritingPool (ERC-4626 senior + Pro first-loss), CoverMarket (EIP-712 quotes), ProtectedNote. Use the Solidity in github.com/Percobain/ethgmum/contracts."*

## Still to do

1. **Arc Studio**: sign in at studio.arc.io (accept the terms, Google or email). Claude can then drive Studio from Chrome to build the project and copy the shareable URL into the README.
2. **Push to GitHub**: the last commits are local because GitHub rejects every push to this repo with `fatal error in commit_refs_rules` (even an empty commit). Run `git push` once GitHub accepts it again.
3. Record the three videos with the scripts above. For a payout on camera, post a crash price from `/issuer` on testnet and label it as simulated.
