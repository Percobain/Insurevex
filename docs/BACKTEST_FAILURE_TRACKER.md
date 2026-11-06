# Backtest failures and expectation gaps

Baseline recorded 7 November 2026 IST, against repo HEAD `cd120177ce88a22fecc6a33a5358a2c9c8b09283` plus existing uncommitted research and application work. Equity research cutoff is 30 October 2026. This is the project context and open issue register for principal losses, Pro LP losses, and results that do not support the published expectations.

## Project context

InsureVEX combines a Saver note, a stock Holder buying deductible-and-cap crash cover, and optional Pro LP first-loss capital. The Saver deposit is split between a T-bill principal floor and an underwriting sleeve. Pro absorbs claims ahead of the senior sleeve and receives a share of gross premiums. That split can pay senior profit while Pro loses principal. Paying all promised Holder claims does not imply either capital provider makes money.

Three separate experiments must stay separate:

- The original world backtest models a combined pool, with the headline 8.8% annual total return and simulated notes returning at least face value. It does not model a Pro investment.
- The historical stress book models senior and Pro but resets both balances each January. Its average annual returns do not establish the performance of an original deposit left invested.
- The principal-first research tests segregated floors, costs, weekly cover and fixed 156-week floors. These are research candidates, not the current deployed contracts. The saved testnet stress execution is another distinct settlement experiment, denominated in test USD.

Primary context: [engine audit](ENGINE_AUDIT.md), [original backtest](BACKTEST.md), [method](BACKTEST_METHOD.md), and the research sources in `backtest/principal_research.py`, `holding_floor_research.py`, and `principal_model_sensitivity.py`.

## Expectations and definitions

Use face value at maturity as the Saver principal benchmark. Count coupons separately, then include them in total investor return. Distinguish a deficient floor asset, a whole-note shortfall, and delayed redemption cash.

Measure Pro loss as ending capital plus withdrawals or distributions minus deposits, with capital flows recorded at their dates. Gross claims charged to Pro are not its net loss: premium income offsets claims. `juniorAssets` already includes paid claims; subtracting those claims again double counts losses.

The repo does not establish an agreed minimum Pro APY, maximum Pro drawdown, or acceptable loss probability. Those targets remain **unspecified**. Zero principal loss is the advertised Saver expectation; protection of Pro principal is not established. Negative Pro outcomes are tracked as material losses, not automatically as accounting bugs.

## Open issue register

| ID | Expected behavior or claim | Observed result | Status and next evidence needed |
|---|---|---|---|
| PRINCIPAL-01 | Legacy floor asset grows back to face | Since June 1999, 199 of 293 overlapping three-year floor cohorts fall short (67.92%); worst shortfall 9.7643%, issue July 2007. That is $902.36 of floor proceeds per $1,000 face. | OPEN. This is the floor alone funded with rolling bills, not a measured loss of the entire note. Test the complete cash flow ledger against actual maturity funding. |
| PRINCIPAL-02 | Current note always redeems at least face | Local contract test: construct using assumed 4% yield, lower vault yield to zero, subscribe $1,000, incur $20 sleeve loss; maturity redemption is approximately $980. | OPEN, reproduced. Protection depends on future floor proceeds; constructor-only rate checks do not lock them. See `contracts/test/economic-audit.test.js`. |
| LIQUIDITY-01 | Accounting yield can be redeemed at maturity | With accrued NAV but no funded vault yield, `mature()` reverts with `liquidity: T-bills settling`. | OPEN, reproduced separately from insolvency. Demonstrate actual cash availability on the liability date. |
| PRO-01 | Pro performance must be assessed independently of combined-pool profit | Saved testnet Pro capital: $650M → $452.929M, net loss $197.071M (−30.3187%). Normal round +1.7539%; crash round −31.5198% of that round's starting capital. Senior including coupons gains $8.025M. | OPEN economic loss; accounting reconciles. Test USD only. Do not annualise these compressed scenarios. |
| PRO-02 | Historical Pro return describes an investable continuous ledger | 7 negative Pro years in 22; worst 2020 −61.1419%. Arithmetic mean +15.6937%; geometric mean of annually reset returns +10.1461%. | OPEN. Annual resets hide recapitalisation and withdrawals. Continuous deposit CAGR, capital calls, and drawdown remain unestablished. |
| PRO-03 | Profitable underwriting book should support intended Pro economics | With senior $1,000, Pro $500, 50% reserve and 40% first-loss fee, $100 premiums / $80 claims produces combined +$20, senior +$30, Pro −$10. A 60% fee only brings Pro to zero in this example. | OPEN, reproduced. Gross premium allocation precedes first-loss claims. Validate a complete waterfall against agreed tranche targets. |
| PRICE-01 | Weekly premium covers claims and 5% premium execution charge | Rebuilt 10% deductible / 90% cap, 1.5× markup, 0.5% daily vol floor: claims/premium 1.300115. About $1.30 claims per $1 premium, before costs. | OPEN. Loss ratio must be at most 0.95 merely to cover that execution charge, before other costs or investor profit. At 2× markup the ratio is 0.963724, still above this boundary; 2.5× gives 0.724085 under assumed demand. |
| PRICE-02 | Fixed three-year stock floor is adequately priced | 90% stock floor at 1.5×: claims/premium 1.317287; at 2×: 1.054593; at 2.5×: 0.923061. Quoted share falls from 53.14% at 1.5× to 18.02% at 2.5×. | OPEN. The higher markup leaves only about 2.69 cents per premium dollar after the 5% charge, before additional costs. Demand and hedge execution are unvalidated. |
| RETURN-01 | Original 4.95% Saver headline applies to rebuilt designs | Matched three-year weekly 10%/90% design median APY 1.0752%; only 61.72% beat rolling bills. Realised-interest version median 0.6688%; none beat bills; 31.42% need external operating-cost funding. | OPEN comparison gap. These have different rates, costs, cover and floor assumptions from the flat-4% original headline, so the APY difference is not a like-for-like regression. |
| CAPACITY-01 | A protected Saver deposit can fund comparable retail protection | Fixed 90% stock floor at 1.5× and 25% risk utilisation supports median $9,280 notional per $1M Saver deposit. Weekly matched 10%/90% cover supports median $9,289 per week per $1M. | OPEN feasibility gap. Reusable weekly cover does not promise a fixed floor on original stock purchase value. Set required capacity and validate funding and demand together. |
| CLAIM-01 | README and pitch guarantees reflect current evidence | README says the Saver note always repays face; pitch says worst case $1,000 back. Local counterexamples and floor research make those claims conditional. The +8.8% combined-pool headline says nothing about Pro returns. | OPEN. Reconcile public claims after selecting and validating the actual product; this tracking change does not rewrite the pitch. |

Principal source: `backtest/results/principal_research/summary.json` and `floor_cohorts.csv`. Pricing sources: `model_sensitivity_summary.json` and `holding_floor_summary.json`. Pro sources: `backtest/results/stress_book.json`, `contracts/deployments/hederaTestnet.stress.json`, and the independent `audit_saved_results.py` reconciliation. Financial figures here describe repository experiments, not forecasts.

Negative historical Pro years: 2007 −1.25%, 2008 −18.73%, 2011 −28.89%, 2018 −31.44%, 2020 −61.14%, 2022 −10.26%, partial 2026 −2.46%. Annual balances reset in every year, including losing years.

## Verification and artifact consistency

On this review, all **17 Python research tests** and **6 focused contract economic tests** passed. Saved-output cash conservation also passed. Several tests intentionally reproduce economic failure scenarios; a green suite therefore does not resolve the issues above.

`python3 -m unittest discover -s backtest -p 'test_*.py'` initially failed to import pandas in the default Python environment. Running the same suite with the existing `/tmp/ethgmum-research-venv/bin/python` passed all 17 tests. This is an environment failure, not a failed economic assertion. Dependency versions are in `backtest/results/principal_research/requirements-lock.txt`.

VERIFY-01: The first inspected `verification.json` recorded 1,070 accepted and 60 rejected matched weekly cohorts, while the current research summary implied 1,045 accepted and 85 rejected. During review the saved verifier output changed to **1,045 / 85**, now matching the CSV across five products (209 accepted and 17 rejected per product). **Current status: MATCHED.** Preserve this history: generated artifacts can come from different runs. Count agreement alone does not revalidate every ledger or source hash.

The latest `verification.json` reports zero principal loss under the matched-floor asset-payment assumption; that does not close the legacy contract failures. A full historical rerun, a new source-hash verification, and executable hedge-price validation were not performed in this tracking task.

## Updating the record

Run from the repository root:

```bash
python3 backtest/track_failures.py
python3 backtest/audit_saved_results.py
/tmp/ethgmum-research-venv/bin/python -m unittest discover -s backtest -p 'test_*.py'
(cd contracts && npx hardhat test test/economic-audit.test.js)
```

The temporary research environment path is specific to this machine; recreate an environment from the dependency lock if it disappears.

`track_failures.py` uses only Python's standard library. It writes `backtest/results/failure_tracking/latest.json` and preserves a timestamped JSON snapshot with source SHA-256 hashes, exact numbers, and issue IDs. It reads saved results and checks their accounting; it does not refit models, rerun the economics, or schedule background monitoring. It rejects a snapshot if its source files change while it is reading them.

For future economics work, refresh the snapshot after outputs finish generating, compare it with the previous timestamped snapshot, and update this register with the run, assumptions, observed result, and explanation. Keep historical failures when a new design passes. Close an issue only against its stated expectation with comparable data, a reconciled cash ledger, and a documented result. Do not close Pro losses merely because combined-pool returns are positive or close principal protection merely because maturity proceeds were added by assumption.
