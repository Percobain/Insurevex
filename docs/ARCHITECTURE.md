# InsureVEX architecture

## The idea in one picture

```mermaid
flowchart LR
  S[Saver<br/>deposits 1,000 USDT] -->|subscribe| N[ProtectedNote<br/>restricted ERC-20]
  N -->|floor = face / (1 + r·τ)| T[TBillVault<br/>tokenised T-bill, NAV + reserve]
  N -->|sleeve = face − floor| P[UnderwritingPool<br/>ERC-4626, reserve R, cap m]
  H[Holder<br/>owns NVDA / RELIANCE / 7203.T] -->|signed quote + premium| M[CoverMarket]
  M -->|lock max payout| P
  M -->|premium| P
  O[PriceOracle<br/>official closes] -->|close at expiry| M
  M -->|crash payout| H
  P -->|profit above sleeve| N
  N -->|USDT coupons| S
  T -->|face at maturity| N
  N -->|face + sleeve| S
  K[IdentityRegistry<br/>KYC, freeze, country] -.gates.-> N & T & P & M
```

**Worst case for a Saver:** the T-bill floor alone repays the full face value at maturity. Only the sleeve is at risk.
**Worst case for the pool:** every open policy is fully collateralised, and only `(1 − R)` of the pool can ever back policies.

## Components

| Layer | Piece | What it does |
|---|---|---|
| Contracts (Solidity 0.8.24, OpenZeppelin 5, Hardhat) | `IdentityRegistry` | ERC-3643-style identity registry: KYC with expiry, ISO country, freeze, blocked jurisdictions, system accounts |
| | `TBillVault` | Tokenised T-bill fund (vxTBILL). NAV accrues at the fund yield; the NAV agent rolls the NAV and attests the custodian reserve. Restricted transfers |
| | `UnderwritingPool` | ERC-4626 pool of sleeves (vxUW). Enforces reserve R, per-symbol cap m and full collateralisation; withdrawals can never touch locked collateral; idle cash earns the T-bill yield |
| | `CoverMarket` | Sells crash floors on any listed stock: EIP-712 quote from the pricing engine, insurable-interest check (on-chain ATS token balance or a signed holdings attestation), settlement from the oracle's official close |
| | `ProtectedNote` | The Saver note: floor/sleeve split at subscription, stablecoin coupons from underwriting profit, maturity redemption, ERC-3643-style transfer rules, forced transfer, pause |
| | `PriceOracle` | Official closes (8 dp, local currency) per `keccak256("EXCHANGE:TICKER")` and settlement timestamp |
| Server (Node.js, Express, ethers 6) | Pricing engine | Pooled, volatility-scaled empirical tail (see `docs/BACKTEST.md`): a stock's 20-day vol × the historical distribution of standardised n-day returns across every market |
| | Quoter | Signs EIP-712 quotes (10-minute validity, single-use nonce) |
| | Keeper | Posts official closes at expiry, settles policies, pays coupons when due, matures notes, rolls the T-bill NAV |
| | API | Markets, prices, quotes, holdings attestation, pool/note state, policies, activity, KYC requests |
| App (Next.js, wagmi, RainbowKit) | `/`, `/protect`, `/save`, `/pool`, `/docs`, `/issuer`, `/activity` | Holder and Saver flows, pool dashboard, research, issuer compliance console |
| Research (Python) | `backtest/` | Walk-forward global backtest across 20+ exchanges; JSON for the docs page |

## Chains

| Chain | Why it is here | What lives there |
|---|---|---|
| **Whitechain Sepolia** (1874) | RWA lifecycle settled in USDT | Full suite settling in the official test USDT; every payment (subscription, premium, payout, coupon, redemption) is USDT |
| **Hedera testnet** (296) | Tokenised securities via Asset Tokenization Studio | ATS equity (tokenised stock whose balance proves insurable interest) and the note as an ATS bond (ISIN, maturity, KYC, coupons) next to the InsureVEX suite |
| **Arc testnet** (5042002) | USDC-native onchain finance | Full suite settling in Arc's USDC |

## Settlement rules

- Payout per policy = `notional × min(max(−r − b, 0), c)`, with `r = close(expiry) / startPrice − 1` in the stock's own currency. Payouts are in USD stablecoin, so this is quanto cover.
- Settlement uses the official close posted to `PriceOracle` for the policy's expiry. If no close exists 3 days after expiry (a trading halt), a settler may post an attested price. That is visible on-chain.
- A quote is valid for 10 minutes, carries a single-use nonce, and is signed by an address holding `QUOTER_ROLE`.

## Compliance controls

| Control | Where |
|---|---|
| KYC allowlist with expiry and country | `IdentityRegistry.setIdentity`, checked on every subscription, cover purchase, pool deposit and transfer |
| Freeze an account | `IdentityRegistry.setFrozen` (blocks all transfers and new positions) |
| Block a jurisdiction | `IdentityRegistry.setCountryBlocked` |
| Transfer restrictions | Note, T-bill and pool shares move only between verified accounts; notes cannot move after maturity |
| Pause | Note, pool, T-bill vault and market each have `pause()` |
| Forced transfer (recovery or court order) | `ProtectedNote.forcedTransfer` (AGENT_ROLE) |
| NAV and reserve attestation | `TBillVault.updateNav(apy, attestedReserve)` |
