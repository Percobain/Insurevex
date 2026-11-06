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

## Live deployments (testnets, contracts v3)

All three chains run the same v3 contracts. v3 includes the four fixes from the Arc Studio security review, each with a regression test (12 passing):
- Pro shares are per epoch, so a wiped-out tranche can't claim new deposits.
- Undeliverable payouts are owed and claimable instead of blocking settlement.
- A frozen T-bill holder can't redeem to another address.
- A stock that closes at zero settles at the full cap.

Every contract is verified (Blockscout on Whitechain and Arc; Sourcify exact match, shown on HashScan, on Hedera). The earlier v1/v2 deployments and their transactions are archived in `contracts/deployments/*.v1*.json` and `*.v2*.json`.

### Whitechain Sepolia (chain 1874): settling in the official test USDT

Settlement token (official test USDT): [`0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`](https://explorer.testnet.whitechain.io/address/0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7)

| Contract | Address |
|---|---|
| IdentityRegistry (KYC, freeze, country) | [`0x2185E034040735187ad1480ec34a412A7127D737`](https://explorer.testnet.whitechain.io/address/0x2185E034040735187ad1480ec34a412A7127D737#code) |
| PriceOracle (official closes, zero-close aware) | [`0x3FCD2023FfE7E1d41dA07A96B47C3B9912033AD4`](https://explorer.testnet.whitechain.io/address/0x3FCD2023FfE7E1d41dA07A96B47C3B9912033AD4#code) |
| TBillVault (tokenised T-bill, NAV + reserve) | [`0xBdB8e50a25F9717Cb5B2C8ED0dCE71A89bCA10B2`](https://explorer.testnet.whitechain.io/address/0xBdB8e50a25F9717Cb5B2C8ED0dCE71A89bCA10B2#code) |
| UnderwritingPool (senior ERC-4626 + Pro first-loss, epochs, owed payouts) | [`0x915669bf64F4839c027ADAce51366534809de876`](https://explorer.testnet.whitechain.io/address/0x915669bf64F4839c027ADAce51366534809de876#code) |
| CoverMarket | [`0x0B19a2C1042874dFe0374814464f89537519dDF0`](https://explorer.testnet.whitechain.io/address/0x0B19a2C1042874dFe0374814464f89537519dDF0#code) |
| ProtectedNote, 3-year series (vx3Y) | [`0x857C551AeD884F7104a3557183aaC8F588D5F4A5`](https://explorer.testnet.whitechain.io/address/0x857C551AeD884F7104a3557183aaC8F588D5F4A5#code) |
| ProtectedNote, 3-hour demo series (vxDEMO) | [`0x9Eb5877812594612c4F39b2B3a12EFF4F3CFb166`](https://explorer.testnet.whitechain.io/address/0x9Eb5877812594612c4F39b2B3a12EFF4F3CFb166#code) |

**USDT payments in the main flow** (full list in [`contracts/deployments/whitechainSepolia.lifecycle.json`](contracts/deployments/whitechainSepolia.lifecycle.json)):

| Step | Party | Explorer |
|---|---|---|
| Saver subscribes 6 USDT to the 3-year note (split into T-bill floor + pool sleeve in one tx) | Saver | [tx](https://explorer.testnet.whitechain.io/tx/0x0f223d1724218845e34f555cbf85b632358a97808e33e99b43c02a8a8cbd8845) |
| Saver subscribes 2 USDT to the 3-hour demo note | Saver | [tx](https://explorer.testnet.whitechain.io/tx/0xc2d461791fdbd8cafa4bada38a80e457b98f6126c064e3677bd49d9791b72b69) |
| Pro LP deposits 4 USDT of first-loss capital | Pro LP | [tx](https://explorer.testnet.whitechain.io/tx/0xddc254bcc75422d987df89a87ad47041c1a70a524794c264b8979ebf77059c1f) |
| Holder buys a weekly MSFT floor (Nasdaq, brokerage shares) | Holder | [tx](https://explorer.testnet.whitechain.io/tx/0xc781ea23763d835b60669ddbc66826778064467f30dfb7cf0e0148385a23ad62) |
| Holder buys a 2-week NIFTY 50 floor (NSE) | Holder | [tx](https://explorer.testnet.whitechain.io/tx/0x78bce3b1cda9150244947edebdf7cf5f74ca22f772fc1906167ee51e4b36e7f5) |
| Holder buys a monthly Toyota floor (TSE:7203) | Holder | [tx](https://explorer.testnet.whitechain.io/tx/0x937a8670096337fdd5f74144e3340763520930adcd2e2c942cb536080ec60ea8) |
| Holder buys a 15-minute SPY floor (settled by the keeper from the official price) | Holder | [tx](https://explorer.testnet.whitechain.io/tx/0xafb5abf660385f4c2d5fe525f456858abf101f1f5a211b51af064e6adb6d903c) |
| T-bill custodian proceeds in USDT, then NAV and reserve attested | Issuer | [tx](https://explorer.testnet.whitechain.io/tx/0xf09b9ef9abbdc3512f574ee4a657225c7945ad1e8528844445fac18dcdf77695) · [NAV](https://explorer.testnet.whitechain.io/tx/0x4c99a0247d62b16af3c83d5afd31bde78f0c9912c7ede8a8535de757bf9db15a) |
| Saver claims the USDT coupon paid from underwriting profit | Saver | [tx](https://explorer.testnet.whitechain.io/tx/0x4f1ca2609c4a007777e8a9f9bc9fcb108bc94ed00c8193d0915935d885a27b50) |
| **Maturity:** the demo note matures and the Saver redeems **2 USDT in, 2.000026 USDT back** (principal protected, plus T-bill accrual) | Saver | [tx](https://explorer.testnet.whitechain.io/tx/0x24d2361d7c64521e6902a43f0523a2229824968bd42a2d65eb90fb9a894b0a89) |
| Earlier full-term run (v2): 8 USDT in, 8.000113 USDT back | Saver | [mature](https://explorer.testnet.whitechain.io/tx/0x57a6e53bf0a0c82735d02cff3389ee661a97ce5d39944ec9046916b36f0a7d69) · [redeem](https://explorer.testnet.whitechain.io/tx/0x2000f6b1f4a00931ca299c9f13e92d10f75b7153670dad3ecded867d6fc41eff) |

### Hedera testnet (chain 296): with Asset Tokenization Studio

**ATS securities**, issued through the live ATS Factory v8.0.0 (`0xd1F118A40f3b02883D35909eF2517e7EDd78379d`):

| ATS security | Address | Role in InsureVEX |
|---|---|---|
| Tokenised NVIDIA equity (ERC-1400, ISIN US67066G1040, KYC, freeze, controller, pause) | [`0xe77F4a19C336841643b7a671557fdBa2eFd0465E`](https://hashscan.io/testnet/contract/0xe77F4a19C336841643b7a671557fdBa2eFd0465E) | `CoverMarket` reads the holder's ATS balance on-chain as proof they own what they insure |
| InsureVEX 3Y Protected Note as an ATS bond (ISIN, 3-year maturity, KYC via SSI issuer, coupons) | [`0x2bCfC2Bb864f651d78a0838ae2068141B2F57703`](https://hashscan.io/testnet/contract/0x2bCfC2Bb864f651d78a0838ae2068141B2F57703) | The note issued as a regulated bond with an on-chain coupon schedule |

Settlement token (InsureVEX test USD): [`0xDF7DE17d60876a32b902dc4f4698633C7d849e1f`](https://hashscan.io/testnet/contract/0xDF7DE17d60876a32b902dc4f4698633C7d849e1f)

| Contract | Address |
|---|---|
| IdentityRegistry (KYC, freeze, country) | [`0x75cfAe23c84ADaF29e93ee804e7C2456f3c433df`](https://hashscan.io/testnet/contract/0x75cfAe23c84ADaF29e93ee804e7C2456f3c433df) |
| PriceOracle (official closes, zero-close aware) | [`0x5AadEb63aac4c26A399FA043Aec7A2Ab0da1FF75`](https://hashscan.io/testnet/contract/0x5AadEb63aac4c26A399FA043Aec7A2Ab0da1FF75) |
| TBillVault (tokenised T-bill, NAV + reserve) | [`0xe4bf04d81a232C9F4c20488d7654A6d54490b463`](https://hashscan.io/testnet/contract/0xe4bf04d81a232C9F4c20488d7654A6d54490b463) |
| UnderwritingPool (senior ERC-4626 + Pro first-loss, epochs, owed payouts) | [`0x31687E1D34CA89d720d6E9aaB85923b1584fBD32`](https://hashscan.io/testnet/contract/0x31687E1D34CA89d720d6E9aaB85923b1584fBD32) |
| CoverMarket | [`0x65420A913Fa66038102DB7A609b98E99c11A519c`](https://hashscan.io/testnet/contract/0x65420A913Fa66038102DB7A609b98E99c11A519c) |
| ProtectedNote, 3-year series (vx3Y) | [`0x1Af616c5dafB146FCDc93b31200a2a568ed1c561`](https://hashscan.io/testnet/contract/0x1Af616c5dafB146FCDc93b31200a2a568ed1c561) |
| ProtectedNote, 3-hour demo series (vxDEMO) | [`0xDE1fC6F88dc1BE86d744C0157a6fa472CccFF915`](https://hashscan.io/testnet/contract/0xDE1fC6F88dc1BE86d744C0157a6fa472CccFF915) |

**Lifecycle on Hedera** (full list in [`contracts/deployments/hederaTestnet.lifecycle.json`](contracts/deployments/hederaTestnet.lifecycle.json); ATS issuance history in `hederaTestnet.v2.lifecycle.json`):

| Step | Explorer |
|---|---|
| ATS issuance: equity `deployEquity`, SSI issuer, `grantKyc`, issue 100 tokenised NVDA | [equity](https://hashscan.io/testnet/transaction/0x1ad148f2f7b736a34777294c02d6b16b2c4512f9a0b19e14d73e2d0e6e31365c) · [KYC](https://hashscan.io/testnet/transaction/0x228eac96c26683c50a43e45ddc13d461c3fc71499e1db99346aebe3270cb0a03) · [issue](https://hashscan.io/testnet/transaction/0x4f2b2a9486856f02b0deb317daa80f7062daf28e53e55b0bcdf7d06244360806) |
| ATS bond: issue the note bond, KYC, 1,000 units, `setCoupon` | [bond](https://hashscan.io/testnet/transaction/0xff29c0bf6dda7f39c99d6e1d1676c1884fe87d2f13f18130cc2a37663aa57600) · [issue](https://hashscan.io/testnet/transaction/0x6b2ee636a8837de2b0792bce393dde69a796bc8291d6468dae0038424b03dab1) · [coupon](https://hashscan.io/testnet/transaction/0x7d19657c49d5749c2b36d71f5af853a1bfbb1f86b6fbd1f157a99887593f08f2) |
| v3 CoverMarket linked to the ATS equity (`setSymbolToken`) | [tx](https://hashscan.io/testnet/transaction/0xf5f64933226fd8a5218088466fcd44d504711ed32439f0809097d098666c0263) |
| Holder buys NVDA cover; insurable interest proven by the **ATS balance on-chain** | [tx](https://hashscan.io/testnet/transaction/0xc2052f731865cbaa9bbf3cf8c8d1c96b8babfcb1d6450f1115a2f24459c4634d) |
| Cover on 150 NVDA with only 90 transferable: **reverted on-chain** (`cover exceeds holdings`) | `scripts/hedera-demo-checks.js` |
| ATS compliance: freeze 10 of the holder's tokenised shares | [tx](https://hashscan.io/testnet/transaction/0xb6df323782b41dc637c037ffc71cbd7c4b2d7af43db7a2b240704d1c5ba7b9bf) |
| **Hedera Schedule Service** (HIP-1215): the note coupon is scheduled natively and **executed by the network with no keeper**: v3 at 01:21:41 UTC and v2 at 00:06:34 UTC, each paying 0.498 tUSD to note holders | [v3 schedule tx](https://hashscan.io/testnet/transaction/0xbcc84e157f4a2764b12c994b4cfea36e6bec4998fc439299156b6745b6956cb6) · [v2 schedule 0.0.11331278](https://hashscan.io/testnet/schedule/0.0.11331278) |
| Saver subscribes 5,000 · Pro LP 2,000 · tradfi covers on Reliance (NSE), SAP (Xetra), SPY | [sub](https://hashscan.io/testnet/transaction/0x56bc968679c1dc7161ea7d80e8961211d4e2342b64ad1d2a0406b55124a1743b) · [Pro](https://hashscan.io/testnet/transaction/0xe6c35fb5025b3bfa3aa50c37d4913b8daa761d1338c438dd4fd66f7186cb9ecf) · [RELIANCE](https://hashscan.io/testnet/transaction/0x4cd1830afdf7755f3da209355061798e310009dc428365f65cb899c5cd5514ad) · [SAP](https://hashscan.io/testnet/transaction/0x2231bccba3a39aa05303d7d6be8f0655815d0810181bcf4647e6b0a2561d4ebb) |
| T-bill NAV + reserve attestation | [tx](https://hashscan.io/testnet/transaction/0x0ebeb0a8d869fbca57d1fb74808549a8c768884adce69ddf5afd3b4b95fbbdda) |
| Saver claims the coupon; the demo note matures and redeems **1,000 tUSD in, 1,000.014 tUSD back** | [coupon](https://hashscan.io/testnet/transaction/0x62393ffcddf9cb42b881b07a00846f63ba62541e61bd491b400434146c52a538) · [redeem](https://hashscan.io/testnet/transaction/0x88fbb1e30b1e69880ed5f0b2005f34ecec0634825d31d9d4c939f0cd974039e2) |

### Arc testnet (chain 5042002): settling in USDC

USDC is both the settlement token (`0x3600…0000`) and the gas token, so a Saver needs nothing but USDC.

**Built in Arc Studio:** https://studio.arc.io/app/7356f9d2-e713-4576-a2f0-4acfd62806e4. Studio wrote and tested its own version of the six contracts (263 forge tests, two security reviews, Slither) and a Saver / Holder / Pool / Issuer app that reads these live v3 contracts and gets signed quotes from the InsureVEX API.

| Contract | Address |
|---|---|
| IdentityRegistry (KYC, freeze, country) | [`0x8Ed59B01a488373554C64fC2280d67a067D8d3bF`](https://explorer.testnet.arc.io/address/0x8Ed59B01a488373554C64fC2280d67a067D8d3bF#code) |
| PriceOracle (official closes, zero-close aware) | [`0x29f0fD47cc181eFCbEb52e49daF0317E8C4Db46b`](https://explorer.testnet.arc.io/address/0x29f0fD47cc181eFCbEb52e49daF0317E8C4Db46b#code) |
| TBillVault (tokenised T-bill, NAV + reserve) | [`0x5eCb935e504678a1fAfDd587C1d8f026980A7449`](https://explorer.testnet.arc.io/address/0x5eCb935e504678a1fAfDd587C1d8f026980A7449#code) |
| UnderwritingPool (senior ERC-4626 + Pro first-loss, epochs, owed payouts) | [`0x4513E017E0C77D82e920DAEDD47F653510Bb52c5`](https://explorer.testnet.arc.io/address/0x4513E017E0C77D82e920DAEDD47F653510Bb52c5#code) |
| CoverMarket | [`0x7832f47D5b13255d5F745F83837Bd4ffA8f2a9F4`](https://explorer.testnet.arc.io/address/0x7832f47D5b13255d5F745F83837Bd4ffA8f2a9F4#code) |
| ProtectedNote, 3-year series (vx3Y) | [`0x519F2841905FB4c3e6Cf4D7D4FE0793dBcf4b602`](https://explorer.testnet.arc.io/address/0x519F2841905FB4c3e6Cf4D7D4FE0793dBcf4b602#code) |
| ProtectedNote, 3-hour demo series (vxDEMO) | [`0x90D58a2B63Df22baFd8F6Ae3315D5728aAD9C0d6`](https://explorer.testnet.arc.io/address/0x90D58a2B63Df22baFd8F6Ae3315D5728aAD9C0d6#code) |

| Step (USDC) | Explorer |
|---|---|
| Saver subscribes 4 USDC to the 3-year note | [tx](https://explorer.testnet.arc.io/tx/0x493681cc37a8c3733300b7357c2162ed6130d33094b07d5f9372503b26606f56) |
| Pro LP deposits 2 USDC of first-loss capital | [tx](https://explorer.testnet.arc.io/tx/0x6ea31a9823dabbf7c7ee5c72723f9ad4196a8d33583e34f011100f515283b3fb) |
| Holder covers MSFT (weekly), Tencent (HKEX, 2 weeks) and SPY (15 minutes) | [MSFT](https://explorer.testnet.arc.io/tx/0xcc9e6b5d5cbdbffbcb9c1b455cb0a440dba53198ee651f29e8429c1b44218197) · [Tencent](https://explorer.testnet.arc.io/tx/0xe1062700cea4a7b1fa714ba1e6768ffbe7b9d23e50743318c7797320276bb90f) · [SPY](https://explorer.testnet.arc.io/tx/0xfc2713e2883a06d28ba01a2f61db5c9dc3ab62698b91ba0f508adf73e7a64a16) |
| T-bill NAV + reserve attestation | [tx](https://explorer.testnet.arc.io/tx/0xfb98dfacc62bd8af34fa00c52ea154775d04e9f33ff4b266d45ee82e8ffe46c5) |
| Saver claims the USDC coupon; the demo note matures and redeems **1 USDC in, 1.000012 USDC back** (gas paid separately in USDC) | [coupon](https://explorer.testnet.arc.io/tx/0x74dfd1ac034c5b4ce469c2eac18b04c194ad390baa91e7ac07f9238c12f9db59) · [redeem](https://explorer.testnet.arc.io/tx/0x399fed68ff961778d29dbe3c1a67b21fd64dc5eec5cb092792e0ae7eb676056b) |

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
| `contracts/` | Hardhat 2 project: Solidity contracts, 12 tests, deploy, verify (Blockscout + Sourcify), lifecycle, ATS and schedule-service scripts, deployments |
| `server/` | Node.js pricing engine (backtest winner), EIP-712 quoter, keeper and API |
| `app/` | Next.js frontend: Holder, Saver, Pool (with Pro), Research, Issuer console, Activity |
| `backtest/` | Python research: 23-market walk-forward backtest; exports the engine tables and the app's JSON |
| `docs/` | Architecture, backtest report and method, pitch numbers, charts |

## Setup

```bash
# contracts
cd contracts && npm i && npx hardhat test          # 12 passing
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
