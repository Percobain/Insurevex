# InsureVEX, end to end

A walkthrough of the whole product for the pitch: who does what, why, what each contract guarantees, what the backtest really shows, and the questions a sharp judge could ask.

## The one-line idea

Two groups of scared people end up protecting each other:

- **Savers** are scared of losing money. They want "my money back for sure, plus something."
- **Holders** own a stock and are scared it will crash.

The Saver's spare yield pays for insurance capital. The Holder's insurance premium becomes the Saver's extra return. Each side's fear pays for what the other side wants.

## The five players and why each one shows up

| Who | What they want | What they do | What they get |
|---|---|---|---|
| **Saver** | Principal safety, a better return than T-bills | Buys a `ProtectedNote` | Full face value back at maturity, plus coupons |
| **Holder** | Crash protection on a stock they already own (any exchange) | Buys cover in `CoverMarket` | Gets paid if the stock falls more than X% by expiry |
| **Pro LP** | A higher return, and they accept risk for it | Deposits first-loss capital into the pool | A bigger share of premiums (+40% of the Savers' share) |
| **Issuer / operator** | Runs the platform | Does KYC, attests the T-bill reserve, sets risk parameters | Platform (protocol fee is 0 in the demo) |
| **Server: quoter + keeper** | Plumbing | Prices and signs quotes, posts official closes, settles, pays coupons | Nothing. It's infrastructure |

## The flow, step by step, with real numbers

### Step 0: KYC (`IdentityRegistry`)

The issuer whitelists each wallet with a country, a KYC expiry, a freeze flag and blocked countries. Every other contract asks one question before it moves anything: `isVerified(addr)`. That one call is the source of the compliance story: KYC, freezing and jurisdiction blocks all apply on-chain, on the token itself.

### Step 1: The Saver deposits (`ProtectedNote.subscribe`)

Say $1,000, a 3-year note, 4% T-bill rate. In **one transaction** the contract splits the money:

- **Floor** = 1000 / (1 + 0.04 × 3) = **$892.86** goes to `TBillVault`. At 4% that grows back to exactly $1,000 by maturity. This is the guarantee.
- **Sleeve** = **$107.14** goes to `UnderwritingPool`. This is the only money at risk.
- The Saver receives 1,000 note tokens.

Why it works: you only need $893 today to have $1,000 in 3 years. The ~$107 left over is "free" risk capital. Even if all of it is lost, the Saver still gets $1,000.

> ⚠️ Pitch-doc mismatch: `PITCH_NUMBERS.md` says $889 / $111 (compound interest). The contract uses simple interest, so $893 / $107. Pick one before going on stage.

### Step 2: The Pro LP adds first-loss capital (`UnderwritingPool.depositPro`)

This is optional. Pro money sits **in front of** the Savers' sleeves: any payout hits Pro first. In return Pro gets premiums in proportion to the capacity it adds, plus 40% of the Savers' share of premiums. Why does Pro exist? It's a risk buffer that makes the Saver sleeve safer, and it lets a risk-loving investor be paid for taking that risk.

### Step 3: How much cover the pool can sell

```
capacity = (1 − Reserve) × Senior sleeves + all Pro capital
```

With a 50% reserve, only half the Savers' money can ever back policies. The other half is never exposed. On top of that, the contract enforces:

- a per-stock cap (5% of capacity in production, 25% on testnet)
- a per-market cap (25% in production, 50% on testnet)
- **full collateral**: every policy's maximum payout is locked when it's sold, so the pool can never owe more than it holds.

### Step 4: The Holder buys a floor (`CoverMarket.buyCover`)

Example: $10k of Reliance, a 1-week floor, 3% deductible, 10% cap.

1. The app asks the server for a quote. The pricing engine (the winner of the backtest) prices it from the stock's volatility × a global historical crash distribution × a per-market correction, then charges 1.5× fair. If the stock is already in free fall (fee above the cap), the quote is **refused** and deeper deductibles are offered instead.
2. The server **signs** the quote using EIP-712, valid for 10 minutes with a single-use nonce.
3. The contract checks: KYC → signature from `QUOTER_ROLE` → quote not expired → **insurable interest** (you can't cover more shares than you hold) → pool capacity and caps.
4. The premium goes to the pool and is split between Pro and Senior. The $1,000 max payout (10% of $10k) is **locked**.

Insurable interest is what makes this insurance and not gambling. For tokenised stocks (an ATS equity on Hedera) the contract reads the token balance on-chain itself. For broker shares (Zerodha, IBKR) the server signs an attestation.

### Step 5: Settlement (`PriceOracle` + `CoverMarket.settle`)

At expiry the keeper posts the **official close** to the oracle. Then **anyone** can call `settle`:

```
payout = notional × min(max(fall − deductible, 0), cap)
```

| Reliance moves | Payout |
|---|---|
| −2% | $0 (inside the deductible) |
| −8% | 5% × $10k = **$500** |
| −25% | capped at 10% = **$1,000** |

The locked collateral is released and the payout goes **Pro first, then Senior**. If the holder's wallet can't receive the money (for example, it's blocklisted by the stablecoin), the payout is recorded as **owed** and can be claimed later, so settlement can't get stuck. That was one of the v3 security fixes.

The oracle tells "zero close" (a bankrupt stock pays the full cap) apart from "not posted yet." If no close appears within 3 days (a trading halt), a settler can post an attested price, visibly on-chain.

### Step 6: Coupons (`ProtectedNote.distributeCoupon`)

Once per interval, any sleeve value **above its principal** (the underwriting profit) is withdrawn and paid to note holders in USDT. Accounting is pull-based, so coupons follow token transfers correctly. On Hedera this is fired by the network's own **Schedule Service**, no keeper needed: a $0.498 coupon was paid that way.

### Step 7: Maturity (`mature` → `redeem`)

`mature()` pulls the T-bill floor (now about $1,000) and whatever the sleeve is worth back from the pool. Holders `redeem()` face + sleeve + any unclaimed coupons. Transfers stop at maturity. This was proven live on Whitechain: **8 USDT in, 8.000113 back**.

## What each contract guarantees

| Contract | Its job | The guarantee it provides |
|---|---|---|
| `IdentityRegistry` | Who is allowed to touch anything | KYC, expiry, freeze and country blocks, all enforced on-chain |
| `TBillVault` | Tokenised T-bill, the NAV grows at the yield | Backs the Saver's floor. The NAV agent attests the custodian reserve |
| `UnderwritingPool` | The insurance balance sheet: Senior (Savers, ERC-4626) + Pro (first loss) | Reserve, caps, full collateral, loss order, withdrawals can't touch locked money |
| `CoverMarket` | Sells and settles crash floors | Signed price, insurable interest, settlement only from the official close |
| `PriceOracle` | Official closes per `EXCHANGE:TICKER` | Policies settle on a public, timestamped price |
| `ProtectedNote` | The Saver's product | Floor/sleeve split in one tx, coupons, maturity, transfer restrictions, forced transfer |

**Why on-chain?** Premium in, collateral locked and policy recorded happen in one atomic transaction. A payout reaches Mumbai or Tokyo seconds after the close is posted. The compliance rules travel with the token. A bank rail can't do escrow + investor rules + instant cross-border payout without a middleman holding the money.

**Why three chains:** Whitechain settles in real test USDT. Hedera has real tokenised securities through ATS plus native scheduling. Arc is USDC-native, so USDC is also the gas token.

## The backtest: what it really shows

Don't say "it never fails." Someone in the room will know that 2008 happened. Say exactly what is true, because the true version is still strong.

**What genuinely never failed:**

- **The Saver's principal.** No note, of any term, starting in any month since 2005, returned below 100% (`saver_summary.csv`, `below_100 = 0`). That isn't luck. It's structural: the T-bill floor alone repays face, and only the sleeve is at risk.

**What did lose money (say it before they ask):**

- **The pool has losing years.** 2008 −13%, COVID −19% over Feb–Mar 2020, plus small losses in 2007, 2011 and 2018. Out-of-sample max drawdown is −19.9%. On a $1,000 note in 2008, the $107 sleeve would have lost about $15, and the $1,000 stayed safe.
- **Bootstrap (10,000 simulated 5-year paths):** 2.3% chance of a drawdown above 20%, 0.5% chance of losing money over 5 years.

**The strong numbers (all out of sample, walk-forward):**

- Pool: **8.8%/yr, 6.9% above T-bills**, across 23 markets and 543 stocks, 2001–2026.
- Pricing accuracy: realised payouts were **0.98×** predicted. Black-Scholes was 3.6× worse.
- Profitable in **all 23 markets**.
- Saver 3-year note: median **4.95%/yr** against 4.0% for T-bills, and beat T-bills in 95% of start months (100% on 5-year notes).
- Holders: Adani/Hindenburg −$2,010 → **−$540**. The cover costs about 8% less than a comparable listed put.
- The honest lesson that makes it credible: "chasing yield with leverage fails (−40% drawdown), so we fix leverage as a policy."

**Caveats the docs already admit:** survivorship bias (only today's survivors, so returns are an upper bound), Holder demand is assumed rather than proven, the Saver note needs rates of about 3% or more, and cover is refused in the very worst crash weeks.

## Gaps in the code (questions a sharp judge could ask)

1. **The floor assumes the T-bill rate stays put.** `TBillVault` accrues at whatever `apyBps` the NAV agent sets now. If rates drop after a Saver subscribes, the $893 won't grow to $1,000. Real protection needs term-matched bills (a 3-year Treasury). Answer ready: "the custodian buys maturity-matched bills; the vault is a testnet stand-in."
2. **The backtested leverage isn't enforced on-chain.** The headline uses 25% utilisation, but the contract lets the pool sell up to 100% of capacity. Either add a utilisation cap or say "sales are throttled off-chain."
3. **Broker holdings are self-declared on testnet.** `server/src/index.js:92` signs the quote with whatever `heldShares` the client sends (it defaults to `shares`), so the "you must own it" check is only real for ATS tokens.
4. **ATS holdings are checked only at purchase.** A Holder can sell the token after buying cover, which turns the cover into a bare bet on a crash.
5. **Trust points:** there is one quoter and one price reporter on testnet. The README already says so, but expect the oracle question.
6. **An unbacked claim:** the `UnderwritingPool` comment says "with Pro ≥ 0.5× sleeves, the senior tranche never had a losing period." No results file shows that, so don't use it in the pitch.

## The 20-second close

> "Savers can't lose their principal, by construction: T-bills cover it. Holders anywhere can insure any stock in stablecoins, settled in seconds. Over 25 years and 23 markets, the insurance pool earned 6.9% above T-bills out of sample, with its worst year at −11%, and no Saver ever got back less than they put in."
