# InsureVEX backtest: method

This is the method appendix to [BACKTEST.md](BACKTEST.md). Every number lives in `backtest/results/` and `app/public/data/`.

## 1. What is simulated

**The Saver.** Deposits USD stablecoin into a T-year note.
- The **floor** is `1/(1+r)^T` of the deposit, where `r` is the US Treasury yield (FRED DGS1/3/5) on the issue date. It is held in tokenized T-bills and grows back to exactly 100% at maturity.
- The **sleeve** is the remainder. It buys units of the underwriting pool.

**The Holder.** Owns a stock on any of 23 exchanges and buys a **floor** for one period (1 week, 2 weeks or 1 month).
- If the local-currency close-to-close return `g` falls below `−b`, the pool pays `min(−b − g, c)` per $1 of USD notional.
- This is a quanto put spread.
- The premium is paid upfront in stablecoin.

**The pool.** Fully collateralised:
- The maximum payout of all open policies is ≤ `(1 − R) × NAV × u`. R is the reserve and u is the share of capacity actually sold.
- No name can take more than `m` of capacity, and no market more than 25%.
- Names whose fee would exceed a refusal cap (2%/month, 1.5% per 2 weeks, 1%/week) are not quoted.
- Idle collateral earns the US 3-month T-bill yield (^IRX).

## 2. Data (sourced)

- **Prices.** yfinance daily closes, adjusted for splits and dividends, June 1999 to Nov 2026.
- **Universe.** 23 markets, 543 names after cleaning: the current large caps plus each market's main index. The Saudi index (^TASI.SR) was unavailable, so Al Rajhi's calendar is used. Failed downloads: 0011.HK, 3333.HK (Evergrande, delisted), AMS.JO, ELET3.SA, EMBR3.SA, JBSS3.SA, ROG.SW.
- **Calendars.** Each market's periods use its own exchange calendar (its index's trading days).
- **Cleaning.** One-day spikes are removed: `|r| > 60%` that reverses the next day (within 20%). Tickers with < 90% coverage after listing are dropped. Runs of ≥ 15 unchanged closes (suspensions) are counted but kept, because a holder really bears the gap at resumption. Counts are in `results/data_cleaning.json`.
- **Rates.** FRED DGS1, DGS3, DGS5 (note floors) and ^IRX (pool collateral yield).

## 3. Pricing models tried (walk-forward)

All models price the same put spread. The fit for start bucket `j` uses only periods with key ≤ `j − 2`.

| Model | Description |
|---|---|
| `global_rv20` | The afterhours.fi v4 engine extended. Standardise every past period return by its trailing 20-day vol × √(days), `z = g / σ`. Pool all z across all markets. Fair = `mean(min(max(−b − σ_now·z, 0), c))` over the pool. |
| `global_ewma` | Same, with σ from an EWMA of squared returns (λ = 0.94). |
| `global_max2060` | σ = max(20-day vol, 60-day vol): slower to forget a shock. |
| `global_regime` | σ = rv20 × √(clip(market median rv20 / its 1-year average, 0.8, 2)): scales up when the whole market is stressed. |
| `hier_*` | The global model × a per-market calibration factor (realised / predicted payouts to date), shrunk toward 1 with Bühlmann credibility `Z = n/(n + 3000)`. |
| `market_rv20` | A separate pool of z per market (falls back to global below 500 observations). |
| `bs_rv30x1.0`, `bs_rv30x1.2` | Black-Scholes put spread at realised 30-day vol (× 1.2), r = ^IRX. |

**Scoring.** Out of sample, on every ticker-period from 2005 on:
- The loss ratio on *fair value* (realised payouts / predicted payouts). 1.0 = perfectly calibrated.
- Calibration error: the premium-weighted mean of |ln(loss ratio)| across years, across markets, and across vol quintiles.
- The standard deviation of yearly loss ratios.
- `rank_score = mean calibration error + 0.5 × |loss ratio − 1|`, averaged over the three tenors. Lowest wins.

## 4. Config selection (walk-forward)

- **Grid.** 3 periods × 5 deductibles {3, 5, 7.5, 10, 15%} × 3 caps {10, 20, 30%} × 3 markups {1.2, 1.5, 2.0} × 2 per-name caps {5, 10%} = 270 product configs.
- **Leverage.** Each config is run at 7 leverage settings `u(1−R)` ∈ {0.075 … 0.7}, covering R ∈ {30, 50, 70%} and u ∈ {25, 50, 100%}. With full collateralisation, P&L is linear in `u(1−R)`.
- **Annual selection.** Each year Y from 2004 to 2026, choose the config with the highest training underwriting APY, using only data before Y. Constraints: training max drawdown ≥ −15% and worst training year ≥ −8%. If none qualifies, choose the smallest drawdown.
- **Scoring.** Year Y is booked with that choice. The chained out-of-sample record is the headline. The full-sample best is shown alongside it to measure overfitting.

## 5. Savers, Holders, stress

- **Savers.** Notes issued every month from 2005. Terms of 1, 3 and 5 years. Upside on SPY, BTC, gold or ACWI. Variants:
  - **Income:** the sleeve underwrites the whole term.
  - **Split:** 50% buys ATM calls at issue, 50% underwrites.
  - **PPN:** the whole sleeve buys calls.

  Option bid-ask is 7.5% and the protocol fee is zero. Shown at historical rates and at a flat 4% and 5%. Every note is checked to return at least 100%.
- **Holders.** Per name: quoted share, gross and net annual cost, hit rate, worst period with and without cover, and certainty-equivalent gain at CRRA γ = 4. Plus event cards for famous crashes, at $10,000 per name.
- **Stress.** Named global episodes, the worst periods as % of pool NAV, a correlation matrix of market underwriting P&L, and a 12-month block bootstrap (10,000 five-year paths) of the global pool.

## 6. Honesty notes

- **Survivorship.** Universes are today's large caps. Wirecard, Evergrande, Credit Suisse, Lehman and every delisted name are missing. Real tails are fatter, so treat the pool APYs as an upper bound. In the EM study, a 0.5–2% yearly hazard of a full-spread collapse cut 0.13–0.5% a year at R50/u50.
- **Demand is assumed.** Equal-weight demand across all quoted names, at utilisation u. No price history can show that Holders would pay these premiums or buy this spread of names.
- **Settlement.** Close-to-close. Real settlement would use an oracle close and carries basis and manipulation risk.
- **Quanto.** A local Holder's hedge is in local currency, while cover pays USD per USD of notional. FX between the two is unhedged on the Holder's side.
