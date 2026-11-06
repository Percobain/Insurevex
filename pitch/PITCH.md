# InsureVEX — ETHGlobal finalist pitch

A general pitch for finalist judges. Lead with the user problem and product demonstration; use the separate sponsor pitches for track-specific details.

## Spoken pitch — approximately 3 minutes

In today’s world, economic uncertainty is everywhere. Markets can crash overnight, and fear, uncertainty and doubt shape how people save and invest.

A saver asks: “How can I put my money to work while protecting what I started with?” A stockholder asks: “How can I protect my investment if the market suddenly falls?”

We built **InsureVEX** to connect those two needs.

Savers buy a note designed to protect their principal at maturity. Stockholders buy protection against a defined stock-price loss. The capital behind the note helps fund that protection, and underwriting profits can provide additional income for savers.

Here’s a simple example.

A saver deposits a thousand dollars into a three-year note. At an illustrative four-percent Treasury rate, about 893 dollars funds a Treasury floor, designed to grow back to a thousand dollars at maturity. The remaining 107 dollars provides underwriting capital. That allocation can take insurance losses without drawing on the Treasury floor. Professional liquidity providers can add capital that takes losses first.

Now imagine a stockholder protecting a ten-thousand-dollar position, with a three-percent deductible and a ten-percent payout cap. If the stock falls eight percent at expiry, the policy pays five hundred dollars. The holder still bears the deductible and premium; the policy cushions the loss.

**The saver provides protection capital. The stockholder pays for protection. Each helps meet the other’s needs.**

Let me show you the product.

On the saver screen, a subscription splits the deposit and issues the note in one transaction. On the protection screen, the stockholder receives a quote and buys cover. The contracts collect the premium and reserve the maximum payout together. At expiry, settlement uses the price posted to the oracle. Savers can claim available coupons and redeem at maturity.

Why does this belong on-chain?

Because the financial promises become inspectable rules: collateral is reserved when the policy is sold, restricted tokens enforce investor eligibility, and premium payments, policy issuance and settlement share the same ledger. For tokenised shares, the market can check ownership directly when protection is purchased.

We’ve demonstrated deposits, policy purchases, coupons and maturity redemption across three testnets. We also recorded an autonomous client paying for underwriting and buying a collateralised policy within spending limits, with no human approving each payment.

We evaluated the pricing and pool strategy using historical data covering 543 stocks across 23 markets. Our walk-forward backtest produced an annualised pool return of 8.8 percent. That measures the underwriting pool, not the saver’s return, and it is historical research rather than a forecast.

Today, this is a working testnet prototype with simulated Treasury custody. Production principal protection requires maturity-matched Treasury assets and dependable custody, alongside managing stablecoin, oracle and smart-contract risks.

Our next step is a focused pilot with verified holdings and a custody partner, testing whether demand for protection can support attractive saver income.

**InsureVEX connects people who want to protect their savings with people who need protection for their investments—and makes the rules visible on-chain.**

## Demo sequence — adapt to the allotted stage time

1. **Saver:** show the deposit, Treasury floor and underwriting allocation. Explain the split with one example.
2. **Stockholder:** show a quote, deductible, premium and maximum payout; purchase cover and show the reserved collateral.
3. **Outcome:** show a recorded settlement, coupon and matured demo-note redemption. Clearly identify recorded transactions and simulated prices.
4. **Optional extension:** show the autonomous underwriting payment and policy receipt if time permits. Keep the main story centred on the two users.

## Judge questions — concise answers

**What is the core innovation?**

The integration of a Treasury-floor note with a collateralised stock-protection pool: saver capital is split by purpose, while stockholder premiums can fund saver income. On-chain settlement connects the funding, ownership checks and policy rules.

**Where does the return come from?**

Treasury accrual supports the maturity floor. Underwriting profits can fund coupons and additional value. Premiums first need to cover claims; extra income is variable.

**Is principal guaranteed?**

The design separates the Treasury floor from underwriting risk. The prototype simulates Treasury custody, so it is not an unconditional production guarantee. A live product needs maturity-matched assets, reliable custody and controls for infrastructure risks. Protection is at maturity, not an assurance of an early exit at face value.

**Why would a stockholder use it?**

To choose a defined deductible, term and payout cap through a simple quote-and-purchase flow. The prototype supports tokenised stocks and a brokerage-holdings path; production brokerage coverage needs independently verified holdings.

**Does the backtest prove the business works?**

It supports the pricing research, but does not prove customer demand or future returns. It includes survivorship bias. A pilot must validate demand, pricing and real operating costs.

**How would the business earn revenue?**

A potential model is a transparent fee on protection purchases or servicing. Protocol fees are zero in the demo; commercial pricing and demand remain to be validated.

**What remains before production?**

Custody integration, maturity-matched assets, independent brokerage verification, stronger oracle operations, security review and the legal structure needed for the intended markets. ATS holdings are currently checked at purchase; continuous ownership enforcement remains future work.

## Supporting material

- [Architecture](../docs/ARCHITECTURE.md)
- [Research and backtest](../docs/BACKTEST.md)
- [Recorded autonomous payment demo](../docs/evidence/hedera-x402-demo.mp4)
- [Deployment and lifecycle evidence](../README.md)
- Sponsor pitches: [Hedera](HEDERA.md), [Arc](ARC.md), [Whitechain](WHITECHAIN.md)

## Delivery notes

Keep sponsor names and implementation details secondary to the user story. Use “designed to protect principal at maturity” rather than an unconditional guarantee. The hack/shutdown framing is not needed here: InsureVEX does not provide insurance against those events. Describe the proposed pilot and revenue model as next steps, not completed traction.
