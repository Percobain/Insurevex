# Principal protection strategy and returns by persona

Prepared: 7 November 2026. Historical equity cutoff: 30 October 2026.

**The proposed strategy protects Saver principal by separately funding its maturity payment and limiting insurance claims to other cash. It does not establish a guaranteed profit percentage for every participant.** The recommended production version adds an exactly matching insurance hedge, whose historical execution returns remain unverified. The available historical percentages below come from the separately identified research simulations, not that untested hedged version.

## Strategy

### 1 Buy the principal payment

For a Saver deposit with face value `D` due at maturity `T`:

```text
F = D × actual all-in purchase price of one unit payable at T
K = separately funded operating and custody expenses
B = D − F − K
```

`F` buys the principal asset. `K` pays expenses. Only `B` can back insurance. Reject an issue when the asset and expenses leave no risk cash.

Use the actual purchase price and maturity payment of an appropriate asset, rather than assuming a floating T-bill APY continues for three years. Keep the principal asset through maturity. Its ability to deliver the promised payment, custody, settlement, and currency alignment remain conditions of protection. Early withdrawals, inflation protection, and stablecoin credit risk are separate matters.

### 2 Reserve every insurance claim

```text
Existing maximum insurance claims + new maximum claim
    <= utilisation × current liquid risk cash

0 < utilisation <= 100%
```

Current risk cash excludes principal assets, expense escrow, and other payable debts. It includes cash already earmarked against existing maximum claims; do not deduct that earmark a second time when calculating total claim backing.

Never use expected interest, future customer premiums, or a second investor's uncommitted money to satisfy this constraint.

### 3 Match protection to the retail holding period

The reference research product protects a fixed stock reference price for **156 weeks**, approximately three years:

```text
Retail claim = stock notional × max(0.90 − terminal price / initial price, 0)
```

This provides a 90% stock-value floor before insurance premiums. Maximum claim is 90% of the insured stock notional. It is different from a weekly floor whose strike resets every week. Insurance premiums are a cost and are not returned by this payoff.

### 4 Hedge before treating the insurance margin as secured

For the proposed production version:

```text
Retail premium >= executable matching hedge cost
                  + incremental execution expenses
                  + disclosed margin
```

The hedge must match the underlying, amount, currency, strike, maturity, corporate-action treatment, and settlement. Ordinary physically settled stock options do not automatically match a cash policy, and an index hedge does not exactly insure an arbitrary individual stock. Reject policies that cannot be matched or funded. Keep maximum-claim backing outside the Saver floor even when hedged.

With exact matching and successful settlement:

```text
Insurance net result = retail premium − hedge cost − incremental expenses
```

This identity does not prove that buyers will accept a profitable quote. Historical executable hedge quotes and customer demand have not been validated for this design.

## Return percentages by economic role

The historical reference below uses the **unhedged research version**: a matched principal asset, prepaid modeled expenses, a fixed 156-week 90% stock floor, 25% utilisation of risk cash, and the original 1.5× model pricing. It includes 215 accepted holding cohorts and 12 rejected cohorts. It is a diagnostic baseline, not a commercially approved price.

| Persona | Percentage supported by the existing research | Denominator and period | What can be claimed for the proposed hedged strategy |
|---|---|---|---|
| **Saver** | **1.11% median annualised return; 3.35% median total return** | Return on original Saver deposit over 156 weeks | Actual return percentage is unverified. Principal funding is conditional on backing-asset performance; extra return is variable. |
| **Retail Holder** | Median quoted premium **7.02%** of stock notional for the full term; stock-value floor **90% before premium** | Protection price and benefit, not an investment APY | No fixed profit percentage. Return depends on stock performance and the actual premium. |
| **Pro LP** | **Not included in this redesigned base strategy** | No Pro capital allocation; APY is not applicable | Do not advertise a 0% or positive Pro return. A separate Pro product would require its own funded terms and tests. |
| **Issuer / operator** | Expense allowance **0.25% of deposit upfront plus 0.25% per year**, approximately **1.00% over the term** | Modeled expense budget, not operator profit or return on equity | Net margin and company ROI are unverified. Fees, hedge costs, operating costs, and revenue ownership must be specified. |
| **Quoter / keeper / server** | **No separate investment return modeled** | Infrastructure, not an investment tranche | Any service payment must come from an explicit fee budget. It has no modeled investor APY. |

The Saver median corresponds to approximately **$1,033.50 at maturity on a $1,000 deposit** in this historical reference. The 1.11% annualised and 3.35% total figures are rounded medians calculated from the source cohorts. They are not a promised coupon and must not be copied into the hedged product as its forecast.

**A positive Saver return does not mean insurance underwriting made a profit.** Part of the principal asset's purchase discount remains as unused risk cash. The investor can finish above face even while insurance consumes part of that cash.

## Every named persona in the existing demo book

These are the names in `contracts/stress/book.json`. This mapping does not rerun that book's specific portfolios under the proposed hedge. Foreign-stock portfolios also require matching currency and settlement terms before they can be offered the production product.

| Wallet | Named persona | Treatment in the revised strategy | Return percentage that can honestly be stated |
|---|---|---|---|
| W1 | Pension fund | Saver | Same historical product reference: **1.11% annualised / 3.35% total median**. Future hedged-product return unverified. |
| G1 | Family office | Saver | Same historical product reference: **1.11% annualised / 3.35% total median**. Future hedged-product return unverified. |
| G2 | Retail savings app | Saver | Same historical product reference: **1.11% annualised / 3.35% total median**. App-level charges are not modeled. |
| W2 | Reinsurer / Pro LP | Excluded from the base design | **Not applicable**, not 0% investment return. |
| W3 | Global macro fund | Holder | Portfolio profit percentage unverified; apply the Holder payoff formula to each actually insured position. |
| G3 | Mumbai portfolio manager | Holder | Portfolio profit percentage unverified; INR stock exposure cannot be treated as exactly hedged USD cover without a matching arrangement. |
| G4 | Tokyo / Hong Kong asset manager | Holder | Portfolio profit percentage unverified; underlying and currency hedges must match. |
| G5 | European family office | Holder | Portfolio profit percentage unverified; underlying and currency hedges must match. |

The three Saver personas receive the same unit economics only if they subscribe to the same cohort, terms, and fee schedule. Their names or deposit sizes do not create different APYs. The historical product median is not a separate measured result for each named wallet. A savings app's end users can receive less after its own charges.

## What a retail Holder makes under different stock outcomes

The following is **an arithmetic illustration**, using the historical reference's median quoted full-term premium of 7.0229%. It is not a forecast or a backtest of any named Holder portfolio. Assume stock notional is purchased at inception and insurance premium is paid in additional cash.

```text
g = stock return over the covered holding period
p = premium / initial stock notional
claim_fraction = max(−0.10 − g, 0)

Net P&L / initial stock notional = g + claim_fraction − p
ROI on stock plus premium outlay = (1 + g + claim_fraction) / (1 + p) − 1
```

| Stock return | Insurance claim as % of initial stock notional | Net P&L as % of initial stock notional | ROI including the extra premium cash invested |
|---|---:|---:|---:|
| −100% | +90.00% | −17.02% | −15.91% |
| −50% | +40.00% | −17.02% | −15.91% |
| −10% | 0.00% | −17.02% | −15.91% |
| 0% | 0.00% | −7.02% | −6.56% |
| +20% | 0.00% | +12.98% | +12.13% |
| +100% | 0.00% | +92.98% | +86.88% |

For an existing stock holding, use its value when cover starts as the reference value; the table does not reconstruct its original historical purchase cost. The 90% floor protects against part of the downside, not against the deductible, premium, or every historical loss.

## Insurance margins are not persona investment returns

| Fixed 156-week 90% stock floor | Claims / premiums | Gross underwriting result as % of premiums | Result after modeled 5% execution charge as % of premiums |
|---|---:|---:|---:|
| 1.5× pricing | 131.73% | −31.73% | **−36.73%** |
| 2.0× pricing | 105.46% | −5.46% | **−10.46%** |
| 2.5× pricing | 92.31% | +7.69% | **+2.69%** |

These are aggregate historical results across overlapping cohorts. They are not annualised, not returns on the Saver deposit, and not profits automatically assigned to the operator or a Pro LP. Operating expenses are separately prepaid in this simulation. The proposed hedge's cost has not been included in these rows.

At 2.5×, the median quoted premium is approximately **8.00% for the full holding period**, and the median quoted share of eligible names falls to **18.02%**. Picking that markup after seeing these results does not establish independent validation or customer willingness to pay it.

## Funded scale of the reference product

At 25% risk-cash utilisation, the historical 1.5× fixed 90% floor funds a median **$9,280 of retail stock notional per $1 million of Saver deposits**. Scaling the same single holding-period book to 100% of risk cash funds a median **$37,121 per $1 million**. These are funding-capacity figures under the modeled quotes, not proof of profitable pricing or customer demand. They are not a 1:1 insurance capacity ratio.

The unhedged reference's median Saver APY at 100% risk-cash utilisation is approximately **1.07%**, versus **1.11%** at 25%. Higher utilisation does not necessarily improve returns when insurance is underpriced.

## Evidence and status

The research recovered 543 securities across 23 markets and tested varying rates, expenses, maximum-claim scenarios, and fixed versus weekly-reset protection. Backing-asset prices are indicative proxies; the equity universe has survivorship gaps. Historical zero principal shortfalls in the matched design follow its asset-payment and segregation assumptions, not an unconditional guarantee or an estimated zero probability of default.

- [Full strategy and research report](PRINCIPAL_FIRST_RESEARCH.md).
- [Fixed holding-period summary](../backtest/results/principal_research/holding_floor_summary.json).
- [Individual holding cohorts](../backtest/results/principal_research/holding_floor_cohorts.csv).
- [Holder quote and payoff diagnostics](../backtest/results/principal_research/holding_floor_holders.csv).
- [Utilisation sensitivities](../backtest/results/principal_research/holding_utilisation_summary.csv).
- [Independent saved-output verification](../backtest/results/principal_research/verification.json).
- [Existing named demo personas](../contracts/stress/book.json).

**Supported statement:** the research baseline produced the percentages above under its stated assumptions. **Unsupported statement:** every persona will earn a fixed positive percentage from the proposed hedged strategy. Actual hedge execution, customer demand, and persona-specific commercial returns still need validation.
