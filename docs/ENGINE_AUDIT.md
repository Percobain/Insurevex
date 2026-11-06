# Engine math and backtest audit

Audit date: 7 November 2026. Scope: pricing, cover payout, tranche accounting, Saver valuation, historical selection, saved results, and the saved Hedera stress execution.

The saved execution confirms a 30.32% Pro loss across its two rounds. The saved historical replay reports profitable and losing Pro years, not losses in every case. Neither the combined-pool headline nor the senior return demonstrates that the Pro tranche is economically attractive. The accounting reconciles; the main problems are the allocation of risk and premiums, mismatched simulation assumptions, and incomplete validation of the historical claims.

No production pricing, contract parameters, deployments, or existing results were changed for this audit. The original `backtest/data/` directory and cached panels are absent, so historical input quality and a complete price-by-price reproduction remain unverified. The checks below independently reconcile the committed outputs and execute the actual contracts locally.

## Verified Pro results

Source: `contracts/deployments/hederaTestnet.stress.json`, also copied into `app/public/data/stress_run.json`. Amounts are test USD, not real investment proceeds.

| Saved execution | Premiums | Claims | Pro premium allocation | Pro profit | Pro return on round starting capital |
|---|---:|---:|---:|---:|---:|
| Normal week | $18.269M | $2.845M | $14.245M | +$11.400M | +1.75% |
| Crash week | $18.309M | $222.780M | $14.308M | −$208.472M | −31.52% |
| Both rounds | $36.578M | $225.625M | $28.554M | −$197.071M | −30.32% |

Pro capital went from $650M to $452.929M. Senior capital plus coupons earned $8.025M. Conservation holds:

`−$197.071M + $8.025M = $36.578M − $225.625M = −$189.047M`.

Do not subtract payouts from Pro value again: `juniorAssets` already reflects those payouts. Similarly, `totalProLosses` is gross claims charged to Pro, not net investor loss; premiums offset part of it. Claims temporarily held in `totalOwed` are liabilities, not retained profit.

Source: `backtest/results/stress_book.json`. The historical replay has 7 negative Pro years out of 22: 2007 −1.25%, 2008 −18.73%, 2011 −28.89%, 2018 −31.44%, 2020 −61.14%, 2022 −10.26%, and partial 2026 −2.46%. Its reported arithmetic mean annual Pro return is +15.69%. The geometric mean of those 22 annual returns is +10.15%, but this is an annually reset strategy, not a continuously funded Pro investment. The latter was not established by the saved results.

## Why a profitable pool can lose money for Pro

Let `S` be senior sleeve capital, `J` Pro capital, `R` senior reserve, `f` the first-loss fee fraction, `P` premiums, and `Q` claims. Ignoring rounding and treating premiums as one batch:

```text
C = (1 − R) S + J
rho = J / C
alpha = rho + f (1 − rho)
Pro premium = alpha P
Senior premium = (1 − alpha) P
Pro claims = min(Q, J + alpha P)
Pro closing capital = max(J + alpha P − Q, 0)
Senior closing capital = S + (1 − alpha) P − max(Q − J − alpha P, 0)
```

While Pro remains solvent, its profit is `alpha P − Q`. It needs a claims/premium ratio below **alpha**, whereas the combined book needs a ratio below **1**. On chain, each premium is booked separately and changes the capital ratio for subsequent premiums; the local tests exercise that accounting directly.

Example: senior $1,000, Pro $500, reserve 50%, first-loss fee 40%. Capacity is $1,000 and `rho = 50%`, so Pro receives 70% of premiums. With premiums $100 and claims $80:

| Account | Profit |
|---|---:|
| Combined pool | +$20 |
| Senior | +$30 |
| Pro | −$10 |

Even when premiums equal claims ($100 each), Pro loses $30 while senior earns $30. Raising the fee to 60% only makes Pro break even on the $80 claim example. Higher fees transfer economics from senior to Pro; they do not create profit.

At the stress book's starting capital, `rho = 44.72%`. The default contract fee of 40% gives Pro **66.83%** of premiums. The stress book fee of 60% gives it **77.89%**. These are materially different products. A 1.5× markup on a perfectly calibrated fair value implies an expected claims/premium ratio near 66.67% before the minimum fee and quote refusal filters. Thus the default allocation at this capital ratio leaves almost no expected Pro margin before adverse selection, costs, and model error. This illustration is not a forecast; actual filtered demand and capital ratios change the result.

Evidence: `UnderwritingPool.bookPremium`, `UnderwritingPool.release`, `contracts/stress/book.json`, and `contracts/test/economic-audit.test.js`.

## Findings that affect the backtest claims

### 1 The headline backtest does not model Pro

`run_world.pool_x` computes premiums minus claims per unit of sold payout capacity. `metrics` compounds `L × (premiums − claims)` and collateral yield as a single pool return. There is no `juniorAssets`, Pro premium split, Pro share price, or first-loss waterfall in that path.

The +8.8% headline therefore cannot be applied to a Pro deposit. Nor can senior performance with a Pro subsidy be compared directly with the untranched headline.

### 2 Historical stress capital is reset each January

In `stress_book.py`, `year, senior, pro = d.year, sleeve0, pro0` resets **both** tranches every year. After losses this injects replacement capital; after gains it removes capital. Capital flows are not reported. Multiplying annual returns can describe a portfolio deliberately maintained at those allocations, but does not reproduce one original Pro deposit left in the engine, or quantify the recapitalisation needed to protect senior.

The yearly saved returns reconcile against the fixed starting balances in every year. Across years, premiums minus claims equal $5.956B: senior gains total $3.712B and Pro gains $2.244B on the annually reset capital bases. These are cumulative distributed or retained profits under that reset policy, not final account balances.

`pro_mean_year` is an arithmetic average including an incomplete 2026. It is not a CAGR. The senior index also chains returns across these resets, so it should be labelled as a reset-capital index.

### 3 The stress replay is not the exact contract lifecycle

The historical stress script uses a single weekly premium split. The contract splits each policy's premium as it arrives. The script retains senior profits, whereas the saved contract run pays senior coupons between rounds. The script omits pool T-bill yield and the note's coupon lifecycle, and it does not execute the contract's per-symbol and per-market lock checks.

The testnet stress runner prices with **current** volatility and then applies selected **historical** returns with expiry compressed to minutes. This proves settlement and accounting for those scenarios; it is not a historical fair-price backtest or an annual return experiment. Its final loss is real within the test accounting but cannot be annualised as a representative return.

### 4 The pricing export contains extreme tails and changes their weights

`server/data/engine.json` contains the following minimum standardised returns:

| Sessions | Minimum z | Next exported quantile | Original observations | Observations per exported point |
|---|---:|---:|---:|---:|
| 5 | −155,722,991.25 | −6.23332 | 657,286 | 164.28 |
| 10 | −116,069,064.70 | −6.42839 | 328,887 | 82.20 |
| 21 | −57,517,954.56 | −5.20875 | 151,353 | 37.83 |

The exporter samples 4,001 quantiles including the endpoints. The server assigns each equal probability, about 0.025%. Relative to the mass of one original observation, a weekly endpoint gets 164× the weight. Actual minimum ties cannot be checked without the inputs. The extreme negative point produces a capped claim at ordinary volatility inputs, adding approximately `marketFactor × cap / 4001` to fair value.

Near-zero trailing volatility followed by a gap is a plausible source of these enormous z values: the code checks only `sigma > 0`, not a meaningful volatility floor. This cause needs confirmation from the missing panels. Neither blindly dropping these observations nor retaining them at inflated weight is a validated solution. Identify the source names and dates, handle stale or suspended prices explicitly, and compare an empirical payoff-preserving export against the current quantile approximation.

Independent direct payoff integration agrees with the server formula over 810 input combinations to a maximum absolute difference of `2.21e-11`. The partial-moment arithmetic is sound at these inputs; that does not establish that the distribution or its calibration is sound.

### 5 The overall process is not fully out of sample

The pooled pricing and credibility routines use a two-bucket lag, which is a useful safeguard. However:

- `run_world.py` chooses the model winner using all scored 2005–2026 data, then uses that winner for historical strategy selection. Historical model selection is not nested inside training windows.
- Recommended leverage is chosen as the largest candidate whose **realised out-of-sample** drawdown stays above −20%. This is a retrospective choice on the evaluation record. Candidate curves can be reported, but the selected headline is not an untouched holdout test.
- Annual training uses `start.year < year`, not `end < decision_timestamp`. The last December period can end in January, leaking an outcome into a January decision. A model's internal pricing lag does not fix strategy-selection leakage.
- The bootstrap and Saver simulations use the final recommended config's full-history series, rather than the annually selected Policy B history. Their 0.5% five-year loss probability and Saver results are different experiments from the headline OOS strategy.
- The bootstrap drawdown starts its running maximum at the first simulated return, omitting initial NAV 1. An initial loss is consequently not fully counted as drawdown.

The missing input panels prevent quantifying how much each issue changes the returns. The current results should be treated as exploratory evidence, not confirmed out-of-sample Pro economics.

### 6 Future availability and data cleaning affect tradability

`world.build_world` defines `P["ok"]` using finite **future period return**. `price_pooled` and `pool_x` use that mask to decide whether to price or sell. That excludes observations with unavailable expiry prices retrospectively. A tradable simulation needs eligibility from information at issue, followed by an explicit missing-close, suspension, or delisting settlement rule.

Cleaning uses a next-day reversal to identify spikes and the universe uses current constituents. Both can change the historical book with hindsight. Already documented survivorship bias has not been removed. The numerical size of its drag cannot be validated from the saved aggregates.

### 7 Live quotes differ from the historical product

The world backtest rejects weekly fees above 1%; the live server uses `2% × sqrt(5/21) = 0.9759%`. Historical periods use actual sessions; live tenors estimate sessions from calendar days. The server also applies the nearest calibrated market factor to uncalibrated deductible/cap combinations.

More materially, `/api/quote` signs `startPrice` from `h.live`, while pricing volatility and historical tests use closing-price data. `prices.js` can also return an old cached history while refreshing asynchronously, and adjusted history can differ from raw live prices around corporate actions. This introduces start-price, timestamp, and adjustment bases that the backtest does not simulate. These require explicit product conventions and consistent pricing/settlement inputs.

### 8 Saver protection and Holder success need the right benchmark

`em_engine.sim_savers` reserves a compounded floor `1/(1+r)^T`; `ProtectedNote.floorFor` and the stress replay use simple growth `1/(1+rT)`. The live note sweeps excess sleeve profit into coupons, whereas the historical income variant compounds the sleeve through maturity. These are different cash flows.

The simulation adds principal back by construction and assumes the floor asset delivers the required maturity proceeds. The contract pays actual redeemed proceeds; tokenised NAV accrual alone does not supply stablecoin cash. Tests explicitly fund the vault yield. Zero notes below face in that simulation does not validate custodian returns, future reinvestment rates, or redemption liquidity.

The 4% and 5% flat-rate sensitivity runs also replace the pool collateral rate and note-floor rate; they are scenarios, not realised historical rates. Holders' `share_better_off` uses CRRA utility improvement, not positive monetary P&L. Cover buyers can pay more in premiums than they receive in claims and still have reduced downside. Stock losses remain possible because cover has a deductible and cap.

There is no accounting reason everyone must earn a positive monetary return in the same period. Cover premiums and claims transfer money between Holders and the pool; the waterfall transfers risk between senior and Pro. Bond returns and stock returns are separate sources of gains and losses.

## Required rerun before relying on the economics

Preserve the existing outputs and recover the original data snapshot with dates and checksums. Rebuild a continuous ledger with senior and Pro units, actual subscription and withdrawal flows, premium booking per policy, locked capital, claims, coupons, and vault cash flows. Report every recapitalisation separately.

Use issue-time eligibility and training outcomes that ended before each decision. Freeze model family and risk budget before the holdout, or select them inside training folds. Export the tail distribution with validated weights and audit the extreme z observations. Compare default 40% and stress 60% fees using identical prices, demand, capital, and dates.

Report Pro total return, CAGR where meaningful, drawdown, wipeout probability, capital calls, realised premium share, and T-bill opportunity cost. Report senior sleeve return separately from the whole Saver note and include paid coupons. Report Holder stock return, protection cash flow, and utility improvement separately. Include clustered demand, realistic costs, and suspended or delisted names. A fee change alone cannot certify Pro viability.

## Principal protection counterexamples in the contracts

Two additional local contract tests establish that current Saver protection is conditional:

1. Construct a note while the vault advertises 4.2% and the note assumes 4%. Lower the vault rate to zero, then subscribe $1,000. Subscription still succeeds: the floor-rate check ran only in the constructor. Apply a permitted $20 underwriting loss, wait to maturity, and redeem. The Saver receives approximately **$980**. The contract does not top up proceeds to face value. Rate reductions after subscription can likewise undermine the floor assumption; rechecking only at subscription would not lock future returns.
2. Keep the advertised yield, subscribe, and wait to maturity without funding the vault's yield. `mature()` reverts with `liquidity: T-bills settling`. Accounting NAV growth does not create redemption cash.

The first is a solvency shortfall under the scenario; the second is a cash-liquidity failure. They require different remedies.

## Mathematical constraints for a redesigned product

### Fund the Saver floor with maturity cash flows

For face value `D`, let `G` be enforceable maturity cash per dollar spent on the floor asset, net of its costs. Then:

```text
floor purchase F = D / G
risk sleeve B = D − F − upfront fees
required: B >= 0
required: actual floor maturity proceeds >= D
```

An estimated floating yield cannot establish `G`. Match the asset's cash payment to the note's date and currency, and keep the asset outside insurance collateral. Treasury STRIPS illustrate instruments with a single maturity payment; real custody, settlement, issuer, and stablecoin risks still require their own treatment. [TreasuryDirect STRIPS](https://www.treasurydirect.gov/marketable-securities/strips/). Principal-protected structured notes also remain exposed to the backing issuer's ability to pay. [Investor.gov principal protection](https://www.investor.gov/introduction-investing/investing-basics/investment-products/structured-notes-principal-protection).

For example, `D=$1,000` and genuinely locked `G=1.12` permit a $892.86 floor and $107.14 sleeve before fees. If growth is not locked and only `G=1` is supported, the entire $1,000 is needed for the floor, leaving no sleeve. The same interest dollars cannot both complete the floor and subsidise insurance profits.

### Promise only claims that can all be paid

For each policy, maximum claim is `notional × cap`. Before issue:

```text
sum(maximum open claims) + other due liabilities + cash buffer
    <= haircut-adjusted assets available when those claims are due
```

Exclude the Saver floor, assets reserved for another obligation, and projected future premiums. This conservative condition can fund every contractual capped claim, including simultaneous crashes. It does not reimburse every stock loss: deductibles, caps, premium costs, and uncovered exposures remain with the Holder. It also does not preserve the capital providers' money after those claims are paid.

### Share realised net profit instead of allocating gross premiums as profit

One candidate to test is a closed-book waterfall. For premiums `P`, settled claims `Q`, and costs `K`, define `X=P−Q−K`. If `X>=0`, split `X` between senior and Pro at an agreed fraction `beta`. If `X<0`, charge `min(−X,J)` to Pro and the remainder to senior. Reserve for unresolved claims before closing the book; do not distribute their premiums as earnings. This requires cohort accounting and cannot be substituted casually into the existing per-policy contract.

With the earlier $100 premium and $80 claim example, `beta=70%` would give Pro $14 profit and senior $6 profit. This removes the transfer that lets a profitable closed book reduce Pro principal while distributing profits to senior. It does **not** prevent Pro losses in losing books. The 70% is illustrative, not a recommended calibrated split.

Expected Pro profit under this candidate is:

```text
beta × E[max(X, 0)] − E[min(max(−X, 0), J)]
```

It is not `beta × E[X]`: Pro bears losses asymmetrically. Estimate both terms from a distribution of complete book outcomes, including crash correlation. Compare against explicit Pro return and drawdown requirements. Test senior's distribution separately.

### Require a feasible price and a real buyer

At whole-book level a necessary expectation budget is:

```text
expected premiums + genuinely available investment income
    >= expected claims + expenses + required combined investor profits
```

This is necessary, not sufficient: tranche losses, timing, tail risk, and capital constraints can still make the product infeasible. Do not count floor interest as available investment income. A feasible design also needs buyers willing to pay the required premiums; markup alone cannot prove demand. If no price satisfies buyer demand, investor economics, and capital constraints, reduce coverage or costs, change the product, or reject the trade.

Protecting every participant's original money in every scenario is a stronger obligation than paying insured claims. Without an external loss absorber, aggregate net claims and expenses must be covered by premiums and genuinely available investment income to preserve all underwriting principal. Renaming a tranche or changing its profit share does not supply that money.

`backtest/economic_constraints.py` implements the floor budget and candidate closed-book waterfall as an isolated deterministic reference. It is not connected to production and contains no fitted return assumptions. Its tests cover cash conservation, full Pro wipeout, spillover to senior, an underperforming floor, and rejection of unfunded claims.

## Reproducible checks added

```bash
python3 backtest/audit_saved_results.py
node backtest/audit_pricing.mjs
python3 backtest/economic_constraints.py
python3 -m unittest discover -s backtest -p test_economic_constraints.py
cd contracts
npx hardhat test
```

Results: saved-output cash-flow reconciliation passed; all 810 pricing comparisons passed; all 18 local contract tests passed, including six economic cases; all six deterministic constraint tests passed. No network transactions were sent. These verify arithmetic, protection counterexamples, and the candidate's allocation behaviour, not historical viability of the candidate or a full historical rerun.
