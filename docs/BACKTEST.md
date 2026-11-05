# InsureVEX: world backtest report

**This is a simulation, not a promise.** Every number below comes from `backtest/results/*.csv` or `app/public/data/*.json`, produced by `backtest/run_world.py` from public data. Method details: [BACKTEST_METHOD.md](BACKTEST_METHOD.md).

## Headline

| | Value | Source |
|---|---|---|
| Markets / names | **23 stock markets, 543 names** (current large caps plus each main index), Jun 1999 to Oct 2026. Pool booked from Jan 2001 | `global_summary.json` |
| Most accurate pricing model | **`hier_mr50`**: a global pooled tail shape, a mean-reverting vol forecast (50% EWMA + 50% 1-year vol) and a per-market credibility factor | `models_ranked.csv` |
| Its calibration out of sample, 2005–2026 | Realised payouts = **0.98×** predicted. Calibration error 0.19, against 0.39 for the afterhours v4 engine and 0.69 for Black-Scholes at 1.2× realised vol | `models_ranked.csv` |
| Recommended product | **Weekly floor: pays falls beyond 3%, capped at 10%. Price = 1.5× fair. Max 5% of capacity per name and 25% per market. Reserve 50%, utilisation 25%** | `global_summary.json` |
| Holder price vs a listed put | Median **0.92×** a Black-Scholes put spread at 1.2× realised vol, so cheaper than the options market | `global_summary.json` |
| Pool, **walk-forward out of sample** (2004–2026, recommended sizing) | **+6.9%/yr over T-bills** (8.8%/yr total). Max drawdown −19.9%. Worst year 2008: −11.0% | `walkforward_policyB_metrics.csv` |
| Same config, full sample (2001–2026) | +7.8%/yr over T-bills (9.7% total). Sharpe 1.53. Max drawdown −19.9% | `global_summary.json` |
| Bootstrap, 10,000 × 5-year paths | Median **9.7%/yr** total. 5th–95th percentile 3.6% to 15.7%. P(drawdown > 20%) = **2.3%**. P(losing money over 5 years) = **0.5%** | `bootstrap.json` |
| Savers | **No note ever returned below 100%** across every protected variant, term and start month | `saver_summary.csv` |
| Saver, 3-year note at a flat 4% rate | Income note **4.95%/yr** median. 50/50 SPY split **6.07%/yr**. T-bills 4.0% | `saver_summary.csv` |

## 1. Which pricing model is most accurate

Each model is scored out of sample on 130k–600k ticker-periods (2005–2026), averaged over the 1-week, 2-week and 1-month tenors. A loss ratio of 1.00 = perfectly calibrated. Calibration error = weighted |ln(loss ratio)| across years, markets and vol quintiles. Lower is better.

| Model | Rank score | Calibration error | Loss ratio (realised / predicted) | Std of yearly loss ratio |
|---|---|---|---|---|
| **hier_mr50** | **0.200** | **0.186** | **0.980** | 0.397 |
| hier_mr30 | 0.208 | 0.192 | 0.968 | 0.345 |
| hier_ewma | 0.243 | 0.204 | 0.924 | 0.274 |
| hier_max2060 | 0.250 | 0.205 | 0.910 | 0.274 |
| global_mr50 | 0.288 | 0.234 | 0.891 | 0.362 |
| hier_rv20 | 0.303 | 0.241 | 0.875 | 0.263 |
| global_ewma | 0.396 | 0.294 | 0.796 | 0.238 |
| bs_rv30x1.0 | 0.415 | 0.317 | 0.802 | 0.208 |
| market_rv20 (separate pool per market) | 0.534 | 0.391 | 0.714 | 0.216 |
| global_rv20 (= afterhours v4) | 0.535 | 0.392 | 0.714 | 0.217 |
| global_regime | 0.710 | 0.519 | 0.620 | 0.155 |
| bs_rv30x1.2 | 0.926 | 0.687 | 0.522 | 0.147 |

**Why `hier_mr50` wins.** Two biases were found and fixed.

1. **Vol mean-reverts.** With today's 20-day vol, calm stocks were under-priced: realised payouts were 1.6× predicted in the calmest quintile and 0.6× in the wildest. Blending today's EWMA vol with the stock's own 1-year vol flattens that curve (chart: `docs/charts/world_model_calibration.png`).
2. **Markets differ.** A Bühlmann-credibility factor per market (realised / predicted so far, shrunk to 1 with weight n/(n+3000)) cut the cross-market calibration error from 0.36 to about 0.11–0.15.

A separate pool per market (`market_rv20`) was **worse** than one global pool: per-market history is too thin in the tail.

**Trade-off.** The winner's yearly loss ratio varies more (0.40 vs 0.22). It is right on average but noisier year to year. Crash years (2008, 2020) dominate that noise for every model.

## 2. Which product and how much leverage (walk-forward)

The grid has 270 product configs × 7 leverage settings. Two selection policies were tested, both walk-forward (year Y's choice uses only data before Y).

**Policy A: chase the highest APY under a drawdown limit.** This **fails**. In calm years (2004–2007) it picks high leverage (R30/u50), then loses −24% in 2008. Out of sample: 4.7%/yr over T-bills, Sharpe 0.47, max drawdown −40.5%. Lesson: **leverage must not be optimised on past returns.** (`walkforward_selection.csv`)

**Policy B (headline): choose the product terms by risk-adjusted return, and fix leverage as a policy.** Sharpe ratio doesn't depend on leverage. Markup is capped at 1.5×, because no data says Holders would pay more. The terms it picks are stable: **weekly, 3% deductible, 10% cap, 1.5×, 5% per name** in 21 of 23 years. (`walkforward_policyB.csv`)

| Sizing (reserve / utilisation) | Out-of-sample APY over T-bills | Total APY | Max drawdown | Worst year (2008) |
|---|---|---|---|---|
| R70 / u25 | 4.1% | 5.9% | −12.3% | −6.6% |
| **R50 / u25 (recommended)** | **6.9%** | **8.8%** | **−19.9%** | **−11.0%** |
| R70 / u50 | 8.4% | 10.2% | −23.5% | −13.1% |
| R50 / u50 | 14.1% | 16.0% | −36.9% | −21.6% |

Chart: `docs/charts/world_frontier.png`. R50/u25 is the largest sizing whose out-of-sample drawdown stays within −20%.

**If Holders accepted a 2.0× markup** (not proven), walk-forward gives 14.8%/yr over T-bills with a −31% drawdown. That is reported for completeness and excluded from the headline.

**Overfitting check.** The full-sample best under the same constraints is 4.0%/yr at R70/u25, against Policy A's 4.7% out of sample. There is no evidence that the headline is cherry-picked. The real overfitting risk is leverage, and Policy B fixes that.

## 3. Markets: does going global help?

Recommended terms at R50/u50, each market run on its own (per-name cap 10%). Source: `markets.csv`.

| Market | Names | Over T-bills | Sharpe | Max DD | Worst year | Loss ratio |
|---|---|---|---|---|---|---|
| China A | 25 | 20.3% | 2.19 | −18.3% | −10.9% (2018) | 0.64 |
| India | 41 | 22.1% | 2.09 | −29.4% | −19.0% (2008) | 0.68 |
| Mexico | 18 | 16.7% | 1.68 | −33.5% | −21.1% (2008) | 0.71 |
| Taiwan | 21 | 16.7% | 1.57 | −24.9% | −11.1% (2011) | 0.68 |
| Korea | 21 | 16.1% | 1.55 | −38.4% | −24.5% (2020) | 0.73 |
| **GLOBAL (all 543)** | 543 | **15.8%** | **1.53** | −36.9% | −26.0% (2008) | 0.74 |
| South Africa | 22 | 16.4% | 1.41 | −35.1% | −23.0% (2020) | 0.73 |
| Canada | 26 | 11.6% | 1.39 | −29.3% | −8.9% (2018) | 0.71 |
| Japan | 26 | 18.0% | 1.38 | −36.6% | −16.4% (2007) | 0.72 |
| Hong Kong | 23 | 13.0% | 1.26 | −29.9% | −22.0% (2011) | 0.73 |
| US | 47 | 13.7% | 1.20 | −37.3% | −27.3% (2008) | 0.74 |
| Australia | 25 | 10.7% | 1.15 | −34.2% | −25.0% (2008) | 0.76 |
| Singapore | 18 | 10.3% | 1.12 | −36.0% | −14.2% (2008) | 0.72 |
| Brazil | 20 | 13.1% | 1.11 | −30.3% | −25.3% (2020) | 0.78 |
| UK | 26 | 12.9% | 1.11 | −38.3% | −22.4% (2008) | 0.75 |
| France | 25 | 13.3% | 1.05 | −40.5% | −31.9% (2008) | 0.74 |
| Italy | 21 | 12.2% | 0.96 | −45.2% | −30.2% (2008) | 0.77 |
| Germany | 25 | 11.8% | 0.92 | −40.8% | −27.6% (2008) | 0.77 |
| Netherlands | 17 | 9.5% | 0.91 | −41.2% | −23.5% (2020) | 0.78 |
| Sweden | 21 | 11.3% | 0.87 | −39.0% | −14.5% (2018) | 0.77 |
| Indonesia | 19 | 11.0% | 0.81 | −40.3% | −28.0% (2008) | 0.81 |
| Spain | 21 | 9.6% | 0.76 | −43.9% | −35.0% (2020) | 0.81 |
| Saudi | 15 | 7.8% | 0.65 | −47.2% | −17.2% (2014) | 0.82 |
| Switzerland | 20 | 7.6% | 0.63 | −38.5% | −24.8% (2008) | 0.82 |

**Findings**

- **Every market is profitable over the full history.** The best risk-adjusted markets are China A, India, Mexico, Taiwan and Korea: emerging markets where crash fear is priced high relative to what happens. The weakest are Switzerland, Saudi, Spain and Indonesia.
- **Diversification helps Sharpe but not crash drawdown.** The average pairwise correlation of monthly underwriting P&L across markets is **0.54**. The global pool's Sharpe (1.53) beats 17 of 23 single markets. Its drawdown (−37%) is in line with a typical single market, because 2008 and 2020 hit everywhere at once. **Crash correlation is the main risk. Reserve and utilisation, not geography, are what control drawdown.**

## 4. Savers

USD notes, zero protocol fee, option bid-ask 7.5%. Fed by the recommended pool. Source: `saver_summary.csv`, pool `recommended_flat0.04`. Notes start every month (84–249 start months per asset and term). Every protected note in every series returned **≥ 100%**.

| Note at a flat 4% rate | T-bills | Income note | 50/50 split (calls on the asset) | Plain PPN | Income beats T-bills |
|---|---|---|---|---|---|
| 1 year, SPY | 4.00% | 4.28% | 5.06% | 5.65% | 85% of start months |
| 3 years, SPY | 4.00% | 4.95% | 6.07% | 7.15% | 95% |
| 5 years, SPY | 4.00% | 5.54% | 7.21% | 8.66% | 100% |
| 5 years, global equity (ACWI) | 4.00% | 5.60% | 6.01% | 6.32% | 100% |
| 5 years, BTC | 4.00% | 5.57% | 20.7% (median) | 30.4% (median) | 100% |

**Reading it.**
- The **income note** is the "T-bills plus" product: it beat T-bills in 85–100% of start months, and its 5th percentile is still above T-bills on 3–5 year terms.
- The **split and PPN** add upside but finish at exactly 100% more often (PPN on SPY, 1 year: 16% of the time).
- At historical rates (near zero from 2009 to 2021) every Saver figure is lower. The note needs rates of about 3% or more. Shown under the `recommended` pool rows.

## 5. Holders

Monthly floor (pays falls beyond 10%, capped at 20%) at 1.5× fair. Median stock per market, 2005–2026. Source: `holders_by_market.csv`.

| Market | Quoted | Cost/yr | Net cost/yr | Worst month, unprotected → protected | Better off (CRRA 4) |
|---|---|---|---|---|---|
| Brazil | 87% | 6.7% | 1.6% | −42.5% → −31.1% | 90% |
| Indonesia | 92% | 7.3% | 2.0% | −42.6% → −24.7% | 90% |
| Spain | 96% | 5.0% | 1.0% | −29.0% → −14.2% | 91% |
| Germany | 95% | 4.3% | 0.9% | −27.0% → −18.1% | 92% |
| Singapore | 95% | 2.7% | 0.3% | −28.3% → −13.2% | 89% |
| India | 89% | 6.5% | 1.2% | −34.9% → −24.1% | 83% |
| Hong Kong | 89% | 6.6% | 1.4% | −26.9% → −24.9% | 83% |
| China A | 91% | 7.7% | 2.5% | −29.6% → −26.4% | 80% |
| Australia | 97% | 3.5% | 0.7% | −30.2% → −13.4% | 76% |
| US | 95% | 4.1% | 1.1% | −23.7% → −18.5% | 60% |
| UK | 97% | 3.7% | 1.2% | −25.1% → −14.6% | 54% |
| Switzerland | 97% | 3.5% | 1.1% | −26.4% → −11.9% | 55% |
| Sweden | 96% | 4.2% | 2.0% | −20.3% → −12.2% | 43% |

The full table for all 23 markets is in the CSV.

**Holders gain the most where crashes are biggest** (Brazil, Indonesia, Spain, Germany, India). In calm, low-vol markets (Sweden, Canada, Switzerland) the cover is roughly break-even for a rational holder.

**Famous crashes, $10,000 per name** (`event_cards.csv`):

| Event | Cover | Unprotected | Protected |
|---|---|---|---|
| Brexit vote, Lloyds | 1 month | −$2,494 | −$1,037 |
| VW Dieselgate | 1 month | −$4,233 | −$2,301 |
| VW Dieselgate | 1 week | −$3,393 | −$1,424 |
| Deepwater Horizon, BP | 1 month | −$3,555 | −$1,631 |
| SNB franc shock, UBS | 1 week | −$1,734 | −$508 |
| Credit Suisse collapse, UBS | 1 week | −$1,079 | −$526 |
| Hindenburg vs Adani | 1 week | −$2,010 | −$540 |
| IndusInd accounting hole | 1 week | −$2,823 | −$852 |
| DeepSeek, NVDA | 1 week | −$1,581 | −$600 |
| Bayer Roundup verdict | 1 week | −$1,602 | −$506 |
| Petrobras, oil price war | 1 month | −$4,479 | −$2,591 |
| GFC, S&P 500 | 1 week | −$1,820 | −$566 |
| COVID, ASX 200 | 1 month | −$2,118 | −$1,005 |

**Refused** (the fee would have been above the 1%-a-week cap, because volatility was already extreme):
- S&P 500 in the week of 13 Mar 2020: −$1,498
- Petrobras in the week of 6 Mar 2020: −$3,254
- DAX in the week of 13 Mar 2020: −$328

## 6. Stress

Source: `stress_episodes.csv`, `worst_periods.csv` and `loss_ratio_by_year.csv`, at the recommended R50/u25.

| Episode | Pool | Worst week's payouts (% of NAV) |
|---|---|---|
| 9/11 | −8.5% | 5.2% |
| Lehman / GFC (Sep–Nov 2008) | −13.4% | 11.0% |
| US downgrade (Aug 2011) | −5.7% | 5.5% |
| Jan 2016 | −5.0% | 3.8% |
| **COVID (Feb–Mar 2020)** | **−18.6%** | 9.4% |
| 2022 bear market | **+4.0%** | 2.6% |
| SVB / Credit Suisse | 0.0% | 2.1% |
| Tariff crash (Apr 2025) | −3.8% | 4.3% |
| DeepSeek | +0.5% | 0.5% |

- **Losing years:** 2007 (−1.1%), 2008 (−13.3%), 2011 (−0.9%), 2018 (−3.1%). Loss ratio over all years 0.74.
- **Slow bear markets (2002, 2022) are profitable.** Sudden global crashes (2008, 2020) are the risk.
- **Bootstrap, R50/u25** (10,000 five-year paths, 12-month blocks): P(drawdown > 20%) = 2.3%; P(a calendar year below −10%) = 8.0%; P(5-year loss) = 0.5%; median total APY 9.7%.

## 7. Data cleaning

Source: `results/data_cleaning.json`.

- 543 tickers kept; 84 one-day spikes removed; 401 suspension runs of 15+ days counted (kept).
- Failed downloads: 0011.HK, 3333.HK (Evergrande), AMS.JO, ELET3.SA, EMBR3.SA, JBSS3.SA, ROG.SW, ^TASI.SR.

## 8. Risks and what this does not prove

1. **Crash correlation.** One global shock costs 13–19% of the pool at the recommended sizing. Doubling the sizing doubles that.
2. **Survivorship.** Today's large caps only. Evergrande, Wirecard, Lehman and Credit Suisse (as an issuer) are missing, so real tails are fatter. Treat the APYs as upper bounds. The EM study estimated a 0.1–0.5%/yr drag.
3. **Demand.** Utilisation and an equal-weight spread of demand are assumed. Informed buyers (earnings, news) are adverse selection that a price backtest cannot see. The 1.5× markup is cheaper than listed puts (0.92×), which supports demand but doesn't prove it.
4. **Rates.** The Saver product needs USD rates of about 3% or more.
5. **Settlement.** Close-to-close on the official close. On-chain settlement needs a robust oracle; basis and manipulation risk are not modelled.
6. **Quanto.** Cover pays USD per USD of notional on the local-currency move. A local Holder's FX exposure is not hedged by the product.
