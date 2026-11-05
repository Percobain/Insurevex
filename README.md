# InsureVEX

**Two scared people protect each other.**

- A **Saver** is scared of losing money. They buy a note that always repays its full face value, plus whatever the note earns.
- A **Holder** owns a stock and is scared of a crash. It can be **any listed stock, held at any broker** (Zerodha on NSE, Robinhood or IBKR on Nasdaq, LSE, TSE, HKEX…) **or a tokenised stock** (an ATS equity on Hedera). They buy a floor: if the stock falls more than the deductible by expiry, InsureVEX pays the extra fall, up to a cap.

The Saver's note puts most of the deposit into a tokenised T-bill that grows back to the full face value by itself.
Only the small remainder (the **sleeve**) underwrites the Holders' floors. Pro LPs can add first-loss capital in front of it.
Holders' premiums become the Savers' coupons. Every payment is a stablecoin transfer, and the compliance rules (KYC, freezes, transfer restrictions, maturity) are enforced in the contracts.

> **Why does this need on-chain stablecoin settlement on Whitechain?** The note, the T-bill floor, the pool collateral, every premium, payout and coupon are one atomic USDT ledger. A premium paid in USDT is locked as fully-collateralised cover in the same transaction, a crash payout reaches a holder in Mumbai or Tokyo the moment the official close is posted, and the note's KYC and transfer rules travel with the token itself. A card or bank rail cannot escrow collateral against a policy, enforce investor rules on the instrument, or pay out across borders in seconds without a counterparty holding the money in between.

## Does it work? (25 years, 23 stock markets, 543 stocks)

| | Result (out of sample, walk-forward) |
|---|---|
| Pool return | **8.8% a year** (6.9% above T-bills), worst drawdown −19.9%, worst year 2008 at −11% |
| Pricing accuracy | Realised payouts came to **0.98×** the model's prediction (Black-Scholes: calibration error 3.6× worse) |
| Saver, 3-year note at 4% rates | Median **4.95%/yr** (income) or **6.07%/yr** (with S&P upside), against 4.0% in T-bills. Never below 100% |
| Holder, $10k in Adani during Hindenburg (1 week) | −$2,010 unprotected → **−$540** protected |
| Markets | Profitable in all 23. Best risk-adjusted: China A, India, Mexico, Taiwan, Korea |

Plain-English numbers for the pitch: [`docs/PITCH_NUMBERS.md`](docs/PITCH_NUMBERS.md). Full research: [`docs/BACKTEST.md`](docs/BACKTEST.md), and the app's `/docs` page.

## Live deployments (testnets)

### Whitechain Sepolia (chain 1874): live, verified, settling in the official test USDT

| Contract | Address |
|---|---|
| Settlement token (official test USDT) | [`0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`](https://explorer.testnet.whitechain.io/address/0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7) |
| IdentityRegistry (KYC, freeze, country) | [`0x59205D7a546Bd28bbE3A8C8BE4Eec256d9c34bC4`](https://explorer.testnet.whitechain.io/address/0x59205D7a546Bd28bbE3A8C8BE4Eec256d9c34bC4#code) |
| PriceOracle (official closes) | [`0x6ea034B50D2053A83c0d8193F907F91691a03601`](https://explorer.testnet.whitechain.io/address/0x6ea034B50D2053A83c0d8193F907F91691a03601#code) |
| TBillVault (tokenised T-bill, NAV + reserve) | [`0x7A0aA73824cE1E523c903af8fDF8D67a249FD2a8`](https://explorer.testnet.whitechain.io/address/0x7A0aA73824cE1E523c903af8fDF8D67a249FD2a8#code) |
| UnderwritingPool (senior ERC-4626 + Pro first-loss) | [`0x3eD15ce2936909016D6767d9D109D839E4E40B52`](https://explorer.testnet.whitechain.io/address/0x3eD15ce2936909016D6767d9D109D839E4E40B52#code) |
| CoverMarket | [`0x8f80d31BaF2AbFC91fF4837107871Ed0930B091C`](https://explorer.testnet.whitechain.io/address/0x8f80d31BaF2AbFC91fF4837107871Ed0930B091C#code) |
| ProtectedNote, 3-year series (vx3Y) | [`0x6a1D6a53D8886c4F94ddc5BBC975ef1B1850B4Ba`](https://explorer.testnet.whitechain.io/address/0x6a1D6a53D8886c4F94ddc5BBC975ef1B1850B4Ba#code) |
| ProtectedNote, 3-hour demo series (vxDEMO) | [`0x4597b0f5Ae9fd15f374726C5F916f2F841a38F20`](https://explorer.testnet.whitechain.io/address/0x4597b0f5Ae9fd15f374726C5F916f2F841a38F20#code) |

**USDT payments in the main flow.** Every step of the lifecycle is a USDT transfer. The full list is in [`contracts/deployments/whitechainSepolia.lifecycle.json`](contracts/deployments/whitechainSepolia.lifecycle.json).

| Step | Party | Explorer |
|---|---|---|
| Saver subscribes 25 USDT to the 3-year note (split into T-bill floor + pool sleeve in one tx) | Saver | [tx](https://explorer.testnet.whitechain.io/tx/0xc88c0d3ace047800850e18e2508b00286c2075e3236a8a9d538f04ee053f5dfb) |
| Saver subscribes 8 USDT to the 3-hour demo note | Saver | [tx](https://explorer.testnet.whitechain.io/tx/0x1cf178787d6291cddd6e0eebadc3e6dda0d1f9b680804eab37fbea8db585a565) |
| Pro LP deposits 8 USDT of first-loss capital | Pro LP | [tx](https://explorer.testnet.whitechain.io/tx/0xff8700f460ae97a73a26461d7e9c340d1bd147ed9b6a0791bacff524599f10bd) |
| Holder buys a weekly MSFT floor (Nasdaq, brokerage shares) | Holder | [tx](https://explorer.testnet.whitechain.io/tx/0xa34d1543eb98e185d537fa2398e2cbf445637c6b932c3284d80a76f90dfc2cc4) |
| Holder buys a 2-week NIFTY 50 floor (NSE) | Holder | [tx](https://explorer.testnet.whitechain.io/tx/0x0a004bb9e5b1176de2cbdbaae8b77f60d0fdaf466e25a058b0176a73958fc0f9) |
| Holder buys a monthly Toyota floor (TSE:7203) | Holder | [tx](https://explorer.testnet.whitechain.io/tx/0xbaec2af322ca3ed46433f6346f57330840946ae879ab97ee7eee863ba432cca4) |
| Holder buys a 15-minute SPY floor (settled by the keeper from the official price) | Holder | [tx](https://explorer.testnet.whitechain.io/tx/0x68ea88252364ea539a9ef2babf716cd66a7fcfe196a74b522607497784dff12a) |
| Keeper posts SPY's official price at expiry, then anyone settles the policy (flat market: no payout, collateral released) | Keeper | [price](https://explorer.testnet.whitechain.io/tx/0x338629e6aaa886e0412a9f549b50683316926bfb50d164c8c2a16d8b53c90d1c) · [settle](https://explorer.testnet.whitechain.io/tx/0x172472041094b6741217c402b04c387fa64ad67f99b4dc6dbd7e9a265b8c16ce) |
| T-bill custodian proceeds paid in USDT, NAV and reserve attested | Issuer | [tx](https://explorer.testnet.whitechain.io/tx/0x12dc01385d6dba151d0920363a94e35dc7886cc0648c81844161a33385b60f82) · [NAV](https://explorer.testnet.whitechain.io/tx/0x4749de7a2e3f334117572724ec88fcf4380e23eab4f3fad0e2fe022edab44c1b) |

The keeper then settles each policy against the official close at expiry, pays coupons hourly (monthly in production) and matures the 3-hour note. Each settlement, coupon and redemption is another USDT transfer; see `/activity` in the app. The v1 deployment (before the Pro tranche and the per-market cap) is kept in `contracts/deployments/whitechainSepolia.v1.*.json`.

### Hedera testnet (chain 296): Asset Tokenization Studio

Script ready: [`contracts/scripts/hedera-ats.js`](contracts/scripts/hedera-ats.js). It issues, through the live ATS Factory (v8.0.0):
- **a tokenised equity** (ERC-1400, with KYC, freeze, controller and pause). `CoverMarket` reads the holder's balance of it on-chain as proof they own what they insure.
- **the Protected Note as an ATS bond** (ISIN, maturity, KYC through an SSI issuer, coupons via `setCoupon`).

Encoding is validated against the live factory with free gas estimates (equity 8.09M gas, bond 8.30M gas). Deployment is waiting on testnet HBAR; see "Status".

### Arc testnet (chain 5042002): USDC settlement

The same suite, settling in Arc's USDC (`0x3600…0000`). Deployment is waiting on faucet USDC; see "Status".

## How it works

| Step | On-chain |
|---|---|
| 1. KYC | The issuer approves an investor in `IdentityRegistry` (country, expiry). Every contract checks it. |
| 2. Saver subscribes | `ProtectedNote.subscribe(face)`: floor = face / (1 + r·τ) goes to `TBillVault`; sleeve = rest goes to the senior tranche of `UnderwritingPool`; note tokens are minted. |
| 3. Pro LP (optional) | `UnderwritingPool.depositPro`: fully-working first-loss capital. It earns its capacity share of premiums plus 40% of the senior share. |
| 4. Holder buys a floor | The server prices it with the backtested engine and signs an EIP-712 quote. `CoverMarket.buyCover` checks KYC, the signature, holdings (ATS balance or broker attestation), the reserve and the per-stock and per-market caps. It takes the premium and locks the maximum payout. |
| 5. Settlement | The keeper posts the official close to `PriceOracle` at expiry, and anyone can call `settle`. Payout = `notional × min(max(−return − b, 0), c)` in USDT. Losses hit Pro first, then the Saver sleeve. |
| 6. Coupons | `distributeCoupon` pays underwriting profit above the sleeve to note holders in USDT. |
| 7. Maturity | `mature()` pulls the T-bill floor and the sleeve back; holders `redeem()` face plus sleeve. Transfers stop at maturity. |

Diagram and every compliance control: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Interface between the pieces: [`shared/INTERFACE.md`](shared/INTERFACE.md).

## Repo layout

| Path | What |
|---|---|
| `contracts/` | Hardhat 2 project: Solidity contracts, 8 tests, deploy, verify, lifecycle and ATS scripts, deployments |
| `server/` | Node.js pricing engine (backtest winner), EIP-712 quoter, keeper and API |
| `app/` | Next.js frontend: Holder, Saver, Pool (with Pro), Research, Issuer console, Activity |
| `backtest/` | Python research: 23-market walk-forward backtest; exports the engine tables and the app's JSON |
| `docs/` | Architecture, backtest report and method, pitch numbers, charts |

## Setup

```bash
# contracts
cd contracts && npm i && npx hardhat test          # 8 passing
echo "PRIVATE_KEY=<testnet key>" > .env
npx hardhat run scripts/deploy.js --network whitechainSepolia   # or hederaTestnet / arcTestnet
npx hardhat run scripts/verify.js --network whitechainSepolia
npx hardhat run scripts/hedera-ats.js --network hederaTestnet    # ATS equity + bond (Hedera)

# server (pricing, quotes, keeper)
cd server && npm i && cp .env.example .env   # set QUOTER_PRIVATE_KEY
npm start                                    # http://localhost:8080

# app
cd app && npm i && npm run build && npx next start   # http://localhost:3000

# research (optional, ~40 min)
cd backtest && python fetch_world.py && python run_world.py && python export_engine.py
```

## Status and current limitations

- **Whitechain:** live end to end with real test USDT (notes, Pro LP, tradfi covers on three exchanges, oracle settlement, NAV attestation, coupons, demo-note maturity).
- **Hedera:** the ATS script is validated against the live factory. It needs about 45 testnet HBAR; the faucet's second drip asks for a captcha.
- **Arc:** waiting for Circle faucet USDC and an Arc Studio project.
- **Single quoter and reporter on testnet.** Production would use several and take the median; the contracts already support many through `QUOTER_ROLE` and `REPORTER_ROLE`.
- **Brokerage holdings are attested by the server** (statement upload or broker API such as Zerodha Kite or IBKR). For tokenised stocks the contract reads the balance on-chain instead.
- **T-bill custody is simulated on testnet.** The NAV agent's attested reserve stands in for the custodian statement.
- **Quotes on stocks already in free fall are refused**, and the user is offered a deeper deductible instead. That protects the pool; the research shows the trade-off.
- **Testnet risk depth.** The per-stock cap is 25% and the per-market cap 50% on the small testnet pool so real policies fit; production uses 5% and 25%.
- **The backtest uses today's surviving companies**, so its returns are an upper bound.
