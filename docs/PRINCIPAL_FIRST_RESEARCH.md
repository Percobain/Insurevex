# Principal first research results and strategy

Research date: 7 November 2026. Equity cutoff: 30 October 2026. All amounts are per dollar of nominal USD deposit unless another unit is stated.

A maturity-matched principal asset, separately funded expenses, and a hard limit on insurance claims can protect Saver face value from underwriting losses, conditional on delivery of the backing asset's maturity payment. The existing assumed-yield floor does not establish that protection. The rebuilt historical insurance pricing also fails important tests. There is no validated perfect pricing formula or evidence here that every participant can earn a positive return.

The recommended architecture is a funded maturity floor plus fully collateralised, exactly hedged retail protection. Its funding identities can be established mathematically. Historical profitability of the hedge execution cannot be claimed without historical executable options quotes, which are not in this dataset. The current contracts were not modified or deployed by this research.

## Data recovered and tests completed

- 543 recoverable securities across 23 markets, with 3,341,498 daily adjusted closes from the original 1999 onward universe. All available observations through the cutoff are included; the weekly panel contains 1,430 start buckets.
- Official daily Treasury bill discount rates and the Federal Reserve fitted zero curve; 2,223 completed monthly floor cohorts across 1, 3, and 5 years, beginning in 1962 where the required rate series overlap.
- 2,260 weekly-insurance note scenarios, 1,362 fixed 156-week holding scenarios, 3,390 model and utilisation scenarios, and 750 demand/cost/catastrophe scenarios. These overlap substantially and are not independent trials.
- Continuous account balances within each note or long-duration scenario. No annual capital resets, invisible Pro injections, or assumed maturity top-ups.
- Unknown expiry observations receive the maximum contractual payout. For the long holding test, any unknown weekly observation in the holding path triggers that conservative payout convention. An unavailable price is not an observed stock default.
- Source hashes, missing tickers, fixed assumptions, cash ledgers, generated summaries, and the dependency lock are saved in `backtest/results/principal_research/`.

Eight source symbols remain unavailable: ELET3.SA, JBSS3.SA, EMBR3.SA, ROG.SW, 0011.HK, 3333.HK, AMS.JO, ^TASI.SR. The universe remains current constituents, not historical membership. It omits many historical corporate failures. This is the complete recovered existing universe, not all securities ever traded.

## Changing Treasury rates invalidate the old floor assumption

For the old compounded floor sized from the issue-date par yield, then funded with a succession of 91-day bills, the since-1999 three-year analysis has **293 completed cohorts**. The floor alone finishes below face in **67.92%**. The worst shortfall is **9.76%**. This does not say that the entire note loses that amount: a surviving underwriting sleeve could offset the floor shortfall.

For the 1 July 2007 cohort, the old calculation sets aside approximately **$866.56 per $1,000 face**. Rolling bills deliver a modeled growth factor of **1.041311**, leaving floor proceeds of **$902.36** at maturity. Future rate cuts matter.

DTB3 is quoted on a bank-discount basis. A bill with discount rate `d` and `n` days costs `face × (1 − d n/360)`, and its gross holding-period growth is `1/(1 − d n/360)`. Treating that quote as an APY is incorrect. The model rolls completed 91-day purchases, keeps any terminal partial period in cash, and chooses cash instead of a negative-return purchase. [FRED DTB3](https://fred.stlouisfed.org/series/DTB3), [Treasury rate conventions](https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?page=0&type=daily_treasury_bill_rates).

For a matched zero-coupon asset, later interest-rate changes alter its sale price, but not its promised maturity payment. Actual acquisition cost must be used. A floating-yield token or rolling bill fund is not a substitute for that payment. [Treasury STRIPS](https://www.treasurydirect.gov/marketable-securities/strips/).

## The funding formula

Let `D` be Saver face value due at `T`, `p_ask(t,T)` the actual all-in purchase cost today of one unit payable at `T`, `K` the full funded operating and custody budget not included in that asset price, and `B` spendable risk cash:

```text
F = D × p_ask(t,T)
B = D − F − K
Reject the issue unless B > 0.
Segregate F and K; neither backs insurance or distributions.
```

For a research zero curve expressed as a continuously compounded yield `z`, the indicative discount factor is `exp(−z × tau)`. This is a price proxy, not an executable STRIP ask. The model uses same-date reconstructed curve prices as transaction-price proxies, rather than assuming an old yield can still be bought. These prices are not prediction inputs. They lack historical bid/ask spreads and actual custody availability. The source is a revisable staff research dataset, not a historical executable quote feed. [Federal Reserve nominal yield curve](https://www.federalreserve.gov/data/nominal-yield-curve.htm).

For insurance notionals `N_i` and maximum payout fractions `c_i`, before issuing a policy:

```text
L_old + N_new × c_new <= u × B_current, with 0 <= u <= 1
```

`L_old` counts every already committed maximum claim, including unresolved policies. `B_current` is the current liquid risk account after other payable liabilities, excluding the principal floor and operating escrow. It includes the cash already earmarked against `L_old`; do not subtract that earmark again on the right-hand side. New claim capacity is `max(u × B_current − L_old, 0)`. Do not require future premiums, asset sales, or expected interest to meet this inequality.

If claims do not exceed the reserved maxima, risk cash alone can pay every promised insurance claim. Even if it is exhausted, the separately held floor still owes `D`. This is a conditional funding proof; observing zero modeled principal losses does not estimate a real-world default probability. Principal protection remains subject to asset payment, custody, settlement, and currency assumptions, and applies at maturity. Early exit and inflation protection are different promises. [Investor.gov structured notes](https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-76).

For illustration only, a genuine three-year zero price of `exp(−0.04 × 3)` costs $886.92 per $1,000 face. After a $10 total expense budget, risk cash is $103.08. A 90% maximum claim permits at most $114.53 of insured stock per $1,000 deposit if all risk cash is committed, or $28.63 at 25% utilisation. The 4% is an illustration, not the rate used throughout the historical test.

## What the rebuilt tests show

The baseline models reserve a 25 bp acquisition/custody allowance and 25 bp per year of operating costs. The matched design segregates that operating budget at issue. Execution costs consume 5% of received insurance premiums. These are explicit cost scenarios, not measured commercial costs.

For matched three-year notes with weekly 10% deductible / 90% cap protection, **209 issue months are accepted and 17 rejected** because the modeled floor and costs leave no risk budget. Accepted cohorts show no principal shortfall and no unfunded modeled operating expense. Their median Saver APY is **1.08%**. Zero principal failures follow the segregated floor assumption and collateral rule; they are not evidence of unconditional safety.

The alternative that reserves all deposit principal and spends only realised rolling-bill interest has median Saver APY **0.67%** for that cover. **31.42%** of cohorts cannot fund all modeled costs from earnings. It therefore needs an explicit external expense arrangement or rejection rule; it is not a self-funding replacement in every low-rate regime.

| Weekly reset product | Median Saver APY in accepted matched notes | Median weekly cover capacity per $1M deposit |
|---|---:|---:|
| 0% deductible / 100% cap | 1.15% | $4,632 |
| 3% deductible / 10% cap | 1.49% | $98,687 |
| 5% deductible / 10% cap | 1.34% | $93,617 |
| 10% deductible / 20% cap | 1.12% | $42,701 |
| 10% deductible / 90% cap | 1.08% | $9,289 |

Weekly capacity is reusable only after a policy settles. It is not the amount of a fixed three-year portfolio floor. Weekly strike resets allow a slow cumulative bear market to erode a retailer's original purchase value.

## Fixed protection for a retailer who holds for three years

The separate 156-week test retains the original stock reference price throughout the holding period. For a 90% stock-value floor, payoff is `N × max(0.9 − S_T/S_0, 0)`; maximum payout is 90% of notional. For a 100% stock-value floor it is `N × max(1 − S_T/S_0, 0)`; maximum payout is 100%. Neither payoff reimburses the insurance premium.

Pricing uses only completed historical 156-week outcomes, with a 158-week information lag. No partially elapsed holding return can enter the fit. The insurer's physical-distribution estimate is not a traded option price. Demand is assumed, with a 10% of notional premium ceiling for this experiment.

| Fixed 156-week protection | Model markup | Aggregate claims / premiums | Median quoted share of eligible names | Median quoted premium for full term | Median funded notional per $1M Saver deposit at 25% utilisation |
|---|---:|---:|---:|---:|---:|
| 100% fixed stock floor | 1.5× | 1.245 | 25.8% | 8.30% | $7,800 |
| 100% fixed stock floor | 2.0× | 1.148 | 7.9% | 8.70% | $6,588 |
| 100% fixed stock floor | 2.5× | 1.282 | 2.6% | 8.85% | $3,319 |
| 90% fixed stock floor | 1.5× | 1.317 | 53.1% | 7.02% | $9,280 |
| 90% fixed stock floor | 2.0× | 1.055 | 32.2% | 7.76% | $8,567 |
| 90% fixed stock floor | 2.5× | 0.923 | 18.0% | 8.00% | $8,363 |

The 1.5× price fails: claims exceed premiums even before the 5% execution charge. A 2.5× markup on the 90% floor yields a historical claims ratio of 0.923, leaving about 2.7 cents per premium dollar after that charge, before unmodeled costs and risks. Fewer names remain quoted and demand at those prices is unproven. Retrospectively choosing that markup is not independent validation.

For the 90% floor at 1.5×, **215 holding cohorts are accepted and 12 rejected**. Median Saver APY is **1.11%**, mainly because a large part of the original bond discount remains outside claims; this does not mean underwriting is profitable. The minimum Saver maturity proceeds in the test where every claim pays its maximum are **$1000.0075 per $1,000** at 25% utilisation.

At 100% risk-cash utilisation, the same single-book cash flows scale analytically: median funded 90%-floor capacity becomes **$37,121 per $1M Saver deposit**. The minimum all-claims-at-cap maturity remains **$1000.0007 per $1,000** under the asset-payment assumption. These scaled cases are algebraic sensitivities, not independent observations. Even committing every available risk dollar does not insure a $1M retail stock portfolio using a $1M protected Saver deposit.

## Recommended production strategy

Start with USD liabilities, USD stocks with liquid matching options, fixed protection dates, and maturity-matched principal assets. Remove the promise of a protected Pro tranche: full Pro capital cannot simultaneously be loss-absorbing and protected unless its protection is separately funded.

1. Obtain an executable principal-asset ask and buy the required maturity payment. Allocate full-term expenses and only then calculate risk cash. Reject an unfunded issue.
2. Offer the retailer a clearly specified fixed-reference floor. For `q` shares and strike `K=(1−b)S_0`, a matching long put pays `q max(K−S_T,0)`. With `q=N/S_0` and cap `1−b`, this equals the policy payoff. A short lower-strike put is required only if the promised cover is a capped spread rather than a full floor. [Cboe portfolio protection](https://www.cboe.com/us/index_protection/).
3. Require `retail premium >= executable matching hedge ask + incremental execution costs + disclosed margin`. Include actual contract sizes, settlement dates, corporate-action treatment, fees, and rounding. Costs already funded in operating escrow must not be charged twice in this comparison. If the hedge cannot be bought at that price, do not issue the cover.
4. Keep full maximum-claim cash backing outside the Saver floor even with a hedge, unless a separately validated collateral model replaces it. Confirm hedge ownership and funding before treating the position as hedged. This retains claim funding if the hedge fails, within the risk budget.
5. Let the model assist risk measurement and quote screening; do not let a forecast replace the actual backing asset or matching hedge. Distribute only settled surplus after remaining liabilities and expenses are reserved.

With exact payoff matching and successful settlement, underwriting net result is `retail premium − hedge cost − incremental costs`, independent of the stock decline. This is an identity under the matching assumptions, not a promise that a buyer will accept a profitable retail quote. Ordinary physically settled stock options must not be assumed to deliver the cash payout of an OTC policy at an official close: exercise, delivery, conversion to cash, and timing must match, or their basis risk remains. [OCC equity option specifications](https://www.theocc.com/clearance-and-settlement/clearing/equity-options-product-specifications). An index hedge likewise does not exactly hedge arbitrary individual stocks. USD quanto cover on foreign-currency stocks does not match an ordinary local-currency put; that product needs an exact quanto/FX hedge or must be rejected. A bond fund with floating NAV or a mutable synthetic APY is not the required principal asset. A promise of USD face value also differs from a promise to return a fixed number of stablecoin tokens if the token deviates from USD; the contract liability and backing currency must agree.

No historical options ask/bid chain was available for the 543-name universe. Therefore a backtest of this exact hedge execution, commercial margins, available sizes, and customer demand remains unperformed. The research establishes a funding constraint and identifies pricing failures. It does not justify deploying the current engine or claiming guaranteed investor profit.

## Verification and reproduction

The saved-output verifier checked every price/rate source hash, initial funding identities, premiums minus claims and expenses, per-book maximum-claim backing, and maturity proceeds. It passed for 1,045 accepted matched weekly cohorts, 375 accepted matched sensitivity cases, and 1,290 accepted fixed holding cohorts. Seventeen Python tests and eighteen local contract tests pass, including lookahead, missing-curve, rate-change, unfunded-cost, exact hypothetical hedge payoff, and existing-contract failure cases.

The chart is [principal_research.png](../backtest/results/principal_research/principal_research.png). All old backtest outputs remain unchanged. Raw recovered data are under the existing gitignored `backtest/data/`; manifests make the local snapshot auditable, while upstream revisions can prevent a future fresh download from reproducing it exactly.

```bash
python backtest/fetch_world.py
python backtest/fetch_research_rates.py
python backtest/principal_research.py
python backtest/principal_model_sensitivity.py
python backtest/holding_floor_research.py
python backtest/verify_principal_research.py
python backtest/report_principal_research.py
python -m unittest discover -s backtest -p 'test_*.py'
```

Install the versions in `backtest/results/principal_research/requirements-lock.txt`. The report includes research assumptions and indicative execution proxies. Important remaining limits are historical constituent and delisting gaps, revised yield-curve data, non-executable prices, close-to-close and corporate-action basis, assumed demand, and settlement/custody/currency performance. None should be hidden inside a single headline APY.
