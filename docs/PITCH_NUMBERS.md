# InsureVEX: the numbers in plain English

Every number here traces to a file in `backtest/results/` or `app/public/data/`. All of it is a backtest on real prices from 23 stock markets, 2001–2026. It is not a promise of future returns.

## One sentence

**Savers get their money back, guaranteed, plus extra. Stock holders anywhere in the world get paid when their stock crashes. The savers' spare money is the insurance.**

## Who makes money

- **Holders pay a small weekly fee** to protect a stock: about 4% a year of the holding for a typical US stock (`holders_by_market.csv`).
- **About $74 of every $100 in fees goes back to Holders as crash payouts.** The other $26 is the pool's profit, and it belongs to the Savers (`loss_ratio_by_year.csv`, overall 0.74).
- **The platform takes nothing in the demo** (protocol fee = 0).

## The Saver story ($1,000, 3 years, at today's ~4% rates)

1. **$889 goes into US T-bills.** They grow back to exactly $1,000 by maturity. That is the guarantee.
2. **$111 works as insurance capital.** It earns the Holders' fees.
3. **Median result:** about **$1,156** (4.95% a year) in the "income" note, against $1,125 from T-bills alone.
4. **With S&P 500 upside** (the 50/50 split): median about **$1,193** (6.07% a year).
5. **Worst case:** $1,000 back. This never failed in any note started in any month since 2005 (`saver_summary.csv`, `below_100 = 0`).

At 5 years, the income note returned **5.5%/yr** and beat T-bills in **100%** of start months. The S&P split returned **7.2%/yr** (`saver_summary.csv`, `recommended_flat0.04`).

## The Holder story ($10,000 in one stock)

| What happened | Without cover | With InsureVEX cover |
|---|---|---|
| VW Dieselgate, Sep 2015 (1 week) | −$3,393 | −$1,424 |
| Adani / Hindenburg, Jan 2023 (1 week) | −$2,010 | −$540 |
| IndusInd accounting hole, Mar 2025 (1 week) | −$2,823 | −$852 |
| UBS on the Swiss franc shock, Jan 2015 (1 week) | −$1,734 | −$508 |
| NVIDIA on DeepSeek, Jan 2025 (1 week) | −$1,581 | −$600 |
| Lloyds on the Brexit vote, Jun 2016 (1 month) | −$2,494 | −$1,037 |
| BP after Deepwater Horizon, May 2010 (1 month) | −$3,555 | −$1,631 |

Source: `event_cards.csv`. Weekly cover pays any fall beyond 3–5%, up to a cap.

## The pool (where the Savers' sleeve lives)

- **+6.9% a year over T-bills, out of sample**, at the recommended setting (half the capital held back as a reserve, a quarter of the capacity sold). Worst drawdown −19.9%. Source: `walkforward_policyB_metrics.csv`. "Out of sample" means each year's settings were picked using only earlier data.
- **$1 in the pool in 2001 became about $10.82 by 2026.** T-bills alone turned $1 into $1.57 (`equity_curve.json`).
- **Since 2023, $1 became $1.59**, against $1.18 for T-bills.
- **Bad years** (`loss_ratio_by_year.csv`):
  - **2008 (−13% for the pool):** a Saver's $111 sleeve would have lost about $15. Their $1,000 was never touched.
  - **COVID (−19% over Feb–Mar 2020, recovered within the year):** the sleeve would have lost about $21.

## Countries

- **The model works in all 23 markets** (`markets.csv`).
- **Best risk-adjusted:** China A, India, Mexico, Taiwan, Korea. In these markets crashes are feared more than they happen.
- **Holders gain most** where stocks crash hardest: Brazil, Indonesia, India, Spain, Germany (`holders_by_market.csv`).
- **Price:** InsureVEX cover costs about **8% less than a comparable listed put option** (median 0.92×, `global_summary.json`).

## What can go wrong (say this before they ask)

1. **Everything crashes together.** In 2008 and 2020 every market fell at once. The reserve exists for this. At the recommended setting the worst year was −13%. Simulating 10,000 five-year futures, the chance of a drop worse than 20% is about **2%** (`bootstrap.json`).
2. **We refuse cover when a stock is already in free fall.** If the fee would be above 1% a week, there's no quote. That protects the Savers, but it means no new cover in the very worst week (S&P in mid-March 2020).
3. **It needs interest rates.** The Saver guarantee is paid for by T-bill interest. At near-zero rates (2009–2021) the extra was small.
4. **It's a backtest** on today's big companies: survivorship bias. Real future returns will be lower.
