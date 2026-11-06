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

### Hedera testnet (chain 296): live, verified (Sourcify, shown on HashScan), with Asset Tokenization Studio

**Asset Tokenization Studio (ATS)**, issued through the live ATS Factory v8.0.0 (`0xd1F118A40f3b02883D35909eF2517e7EDd78379d`):

| ATS security | Address | What it does in InsureVEX |
|---|---|---|
| Tokenised NVIDIA equity (ERC-1400, ISIN US67066G1040, KYC, freeze, controller, pause) | [`0xe77F4a19C336841643b7a671557fdBa2eFd0465E`](https://hashscan.io/testnet/contract/0xe77F4a19C336841643b7a671557fdBa2eFd0465E) | `CoverMarket` reads the holder's ATS balance on-chain as proof they own what they insure |
| InsureVEX 3Y Protected Note as an ATS bond (ISIN, 3-year maturity, KYC via SSI issuer, coupons) | [`0x2bCfC2Bb864f651d78a0838ae2068141B2F57703`](https://hashscan.io/testnet/contract/0x2bCfC2Bb864f651d78a0838ae2068141B2F57703) | The note issued as a regulated bond with an on-chain coupon schedule |

| InsureVEX contract | Address |
|---|---|
| Settlement token (InsureVEX test USD) | [`0xB5297E51C700EcE40912C0857F866eCd09348484`](https://hashscan.io/testnet/contract/0xB5297E51C700EcE40912C0857F866eCd09348484) |
| IdentityRegistry | [`0x59205D7a546Bd28bbE3A8C8BE4Eec256d9c34bC4`](https://hashscan.io/testnet/contract/0x59205D7a546Bd28bbE3A8C8BE4Eec256d9c34bC4) |
| PriceOracle | [`0x6ea034B50D2053A83c0d8193F907F91691a03601`](https://hashscan.io/testnet/contract/0x6ea034B50D2053A83c0d8193F907F91691a03601) |
| TBillVault | [`0x7A0aA73824cE1E523c903af8fDF8D67a249FD2a8`](https://hashscan.io/testnet/contract/0x7A0aA73824cE1E523c903af8fDF8D67a249FD2a8) |
| UnderwritingPool | [`0x167a116213EfE0Be71A3CB1d31802559b65db71b`](https://hashscan.io/testnet/contract/0x167a116213EfE0Be71A3CB1d31802559b65db71b) |
| CoverMarket | [`0x1019DE31d6710DfE1B33A87c31a4b65f4B803306`](https://hashscan.io/testnet/contract/0x1019DE31d6710DfE1B33A87c31a4b65f4B803306) |
| ProtectedNote 3Y / 3-hour demo | [`0xA64f…9cE2`](https://hashscan.io/testnet/contract/0xA64f0E730399de66fA6278c64BBb4A708d6d17f3) · [`0xa0Da…8651`](https://hashscan.io/testnet/contract/0xa0DaaFe98808145f717a764C940e4F3c26248651) |

**Lifecycle on Hedera** (full list in [`contracts/deployments/hederaTestnet.lifecycle.json`](contracts/deployments/hederaTestnet.lifecycle.json)):

| Step | Explorer |
|---|---|
| ATS issuance: equity via `deployEquity` | [tx](https://hashscan.io/testnet/transaction/0x1ad148f2f7b736a34777294c02d6b16b2c4512f9a0b19e14d73e2d0e6e31365c) |
| ATS configuration: SSI issuer, `grantKyc`, issue 100 tokenised NVDA to the holder | [issuer](https://hashscan.io/testnet/transaction/0x82418986f4877ae33763db6469eab6785521f12d2742c1068e6d2f87abba8b23) · [KYC](https://hashscan.io/testnet/transaction/0x228eac96c26683c50a43e45ddc13d461c3fc71499e1db99346aebe3270cb0a03) · [issue](https://hashscan.io/testnet/transaction/0x4f2b2a9486856f02b0deb317daa80f7062daf28e53e55b0bcdf7d06244360806) |
| ATS bond: issue the note bond, KYC, issue 1,000 units, `setCoupon` | [bond](https://hashscan.io/testnet/transaction/0xff29c0bf6dda7f39c99d6e1d1676c1884fe87d2f13f18130cc2a37663aa57600) · [issue](https://hashscan.io/testnet/transaction/0x6b2ee636a8837de2b0792bce393dde69a796bc8291d6468dae0038424b03dab1) · [coupon](https://hashscan.io/testnet/transaction/0x7d19657c49d5749c2b36d71f5af853a1bfbb1f86b6fbd1f157a99887593f08f2) |
| Holder buys NVDA cover; insurable interest proven by the **ATS balance on-chain** | [tx](https://hashscan.io/testnet/transaction/0xf9679e281bce8fa20bedcd00e194696d69b096444807bdcae3805a2cc7f1db99) |
| Cover on 150 NVDA with only 100 held: **reverted on-chain** (`cover exceeds holdings`) | `scripts/hedera-demo-checks.js` |
| ATS compliance: freeze 10 of the holder's tokenised shares | [tx](https://hashscan.io/testnet/transaction/0xd97f70ae0eb6f61fa73faa3ae66d4e328d25c59cdc49f8655a34efa1a29ad5a7) |
| **Hedera Schedule Service** (HIP-1215): the note's coupon scheduled natively, then **executed by the network at 00:06:34 UTC, paying 0.498 tUSD to note holders with no keeper** | [schedule tx](https://hashscan.io/testnet/transaction/0xb9f4678ae47afcc84b4103d76e6339b43edde85c40593b4f5cf696c90c4fd3f3) · [schedule 0.0.11331278](https://hashscan.io/testnet/schedule/0.0.11331278) |
| Saver subscribes 5,000 to the 3Y note · Pro LP deposits 2,000 · tradfi covers on Reliance (NSE), SAP (Xetra), SPY | [sub](https://hashscan.io/testnet/transaction/0x3de32ebfa4094403cdf6767af5cde4cc1c8e30a2b862087c912d26eeaef71819) · [Pro](https://hashscan.io/testnet/transaction/0xd16023a95197f3c8cffddf03a3d849f92beaffd17c9162625de4cf0c54d0e32f) · [RELIANCE](https://hashscan.io/testnet/transaction/0xba439ab5a198b29f3371f88811b1761977f360e65166aab07f604606cdcd0966) · [SAP](https://hashscan.io/testnet/transaction/0x01a66b7e57f3708bc8878561bd9022c7a97349a49da8eaecdd374a7d9a04cbcf) |
| T-bill NAV + reserve attestation | [tx](https://hashscan.io/testnet/transaction/0x1287b18ca4a13a17726ee31268db87ce4f96f13359a205559e46c4a692ee6dc3) |

### Arc testnet (chain 5042002): live, verified, settling in USDC

USDC is both the settlement token (`0x3600…0000`) and the gas token, so a Saver needs nothing but USDC.

**Built in Arc Studio:** https://studio.arc.io/app/7356f9d2-e713-4576-a2f0-4acfd62806e4. Studio was prompted with the InsureVEX spec and pointed at the live Arc deployment below.

| Contract | Address |
|---|---|
| IdentityRegistry | [`0xB5297E51C700EcE40912C0857F866eCd09348484`](https://explorer.testnet.arc.io/address/0xB5297E51C700EcE40912C0857F866eCd09348484) |
| PriceOracle | [`0x59205D7a546Bd28bbE3A8C8BE4Eec256d9c34bC4`](https://explorer.testnet.arc.io/address/0x59205D7a546Bd28bbE3A8C8BE4Eec256d9c34bC4) |
| TBillVault | [`0x6ea034B50D2053A83c0d8193F907F91691a03601`](https://explorer.testnet.arc.io/address/0x6ea034B50D2053A83c0d8193F907F91691a03601) |
| UnderwritingPool | [`0x7A0aA73824cE1E523c903af8fDF8D67a249FD2a8`](https://explorer.testnet.arc.io/address/0x7A0aA73824cE1E523c903af8fDF8D67a249FD2a8) |
| CoverMarket | [`0x167a116213EfE0Be71A3CB1d31802559b65db71b`](https://explorer.testnet.arc.io/address/0x167a116213EfE0Be71A3CB1d31802559b65db71b) |
| ProtectedNote 3Y / 3-hour demo | [`0x1019…3306`](https://explorer.testnet.arc.io/address/0x1019DE31d6710DfE1B33A87c31a4b65f4B803306) · [`0xA64f…9cE2`](https://explorer.testnet.arc.io/address/0xA64f0E730399de66fA6278c64BBb4A708d6d17f3) |

| Step (USDC) | Explorer |
|---|---|
| Saver subscribes 6 USDC to the 3Y note | [tx](https://explorer.testnet.arc.io/tx/0x327c5789c69639c5caf98037f25c979edce6fc2515ccd9f2dd26d150d2946043) |
| Pro LP deposits 3 USDC first-loss capital | [tx](https://explorer.testnet.arc.io/tx/0x1a90dc898e25f7a938a64bc21e7285346d2a14243a5ddf8505c7fd12dab18495) |
| Holder covers MSFT (weekly) and Tencent (HKEX, 2 weeks) | [MSFT](https://explorer.testnet.arc.io/tx/0x8ecd92dc0fc0780efd81bf4771a570d5a386e96d66f683f48819b8eddd89230f) · [Tencent](https://explorer.testnet.arc.io/tx/0x187277a97abfe6956d0bd312aed741b9a354e403a0a7bb2836b1737b22c3c0d9) |
| T-bill NAV + reserve attestation | [tx](https://explorer.testnet.arc.io/tx/0x4b70ccaa878a96d640060060dac8d227649a14ae61afd146dbeaa957fbb4d736) |

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
- **Hedera:** live end to end, with ATS equity and bond issuance, KYC, freeze, coupons, on-chain holdings checks and a native Schedule Service coupon.
- **Arc:** live end to end in USDC; Arc Studio project linked above.
- **Single quoter and reporter on testnet.** Production would use several and take the median; the contracts already support many through `QUOTER_ROLE` and `REPORTER_ROLE`.
- **Brokerage holdings are attested by the server** (statement upload or broker API such as Zerodha Kite or IBKR). For tokenised stocks the contract reads the balance on-chain instead.
- **T-bill custody is simulated on testnet.** The NAV agent's attested reserve stands in for the custodian statement.
- **Quotes on stocks already in free fall are refused**, and the user is offered a deeper deductible instead. That protects the pool; the research shows the trade-off.
- **Testnet risk depth.** The per-stock cap is 25% and the per-market cap 50% on the small testnet pool so real policies fit; production uses 5% and 25%.
- **The backtest uses today's surviving companies**, so its returns are an upper bound.
