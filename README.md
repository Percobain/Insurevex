# InsureVEX

**Two scared people protect each other.**

- A **Saver** is scared of losing money. They buy a note that always repays its full face value, plus whatever the note earns.
- A **Holder** owns a stock (any listed stock: NVIDIA, Reliance, Toyota, Tencent, ASML…) and is scared of a crash. They buy a floor: if the stock falls more than 10% in the month, InsureVEX pays the extra fall, up to 20% of the value protected.

The Saver's note puts most of the deposit into a tokenised T-bill that grows back to the full face value by itself.
Only the small remainder (the **sleeve**) underwrites the Holders' floors. Holders' premiums become the Savers' coupons.
Every payment is a stablecoin transfer, and the compliance rules (KYC, freezes, transfer restrictions, maturity) are enforced in the contracts.

> **Why does this need on-chain stablecoin settlement on Whitechain?** The floor, the T-bill floor, the pool collateral and every coupon are one atomic USDT ledger. A premium paid in USDT is locked as fully-collateralised cover in the same transaction, and a crash payout or coupon reaches the holder's wallet the moment the official close is posted. A card or bank rail cannot escrow collateral against a policy, enforce KYC and transfer rules on the note itself, or pay out globally in seconds without a counterparty holding the money in between.

## Live deployments (testnets)

### Whitechain Sepolia (chain 1874): live, verified, settling in the official test USDT

| Contract | Address |
|---|---|
| Settlement token (official test USDT) | [`0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`](https://explorer.testnet.whitechain.io/address/0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7) |
| IdentityRegistry (KYC, freeze, country) | [`0x59205D7a546Bd28bbE3A8C8BE4Eec256d9c34bC4`](https://explorer.testnet.whitechain.io/address/0x59205D7a546Bd28bbE3A8C8BE4Eec256d9c34bC4#code) |
| PriceOracle (official closes) | [`0x6ea034B50D2053A83c0d8193F907F91691a03601`](https://explorer.testnet.whitechain.io/address/0x6ea034B50D2053A83c0d8193F907F91691a03601#code) |
| TBillVault (tokenised T-bill, NAV + reserve) | [`0x7A0aA73824cE1E523c903af8fDF8D67a249FD2a8`](https://explorer.testnet.whitechain.io/address/0x7A0aA73824cE1E523c903af8fDF8D67a249FD2a8#code) |
| UnderwritingPool (ERC-4626) | [`0x167a116213EfE0Be71A3CB1d31802559b65db71b`](https://explorer.testnet.whitechain.io/address/0x167a116213EfE0Be71A3CB1d31802559b65db71b#code) |
| CoverMarket | [`0x1019DE31d6710DfE1B33A87c31a4b65f4B803306`](https://explorer.testnet.whitechain.io/address/0x1019DE31d6710DfE1B33A87c31a4b65f4B803306#code) |
| ProtectedNote, 3-year series (vx3Y) | [`0x59E27E944Fd4eeBf9C0F95DC9dD803d336a6cAdf`](https://explorer.testnet.whitechain.io/address/0x59E27E944Fd4eeBf9C0F95DC9dD803d336a6cAdf#code) |
| ProtectedNote, 3-hour demo series (vxDEMO) | [`0x70d63391e1Df728D3BDd48D83c24b34EF3e21970`](https://explorer.testnet.whitechain.io/address/0x70d63391e1Df728D3BDd48D83c24b34EF3e21970#code) |

**USDT payments in the main flow** (full list in [`contracts/deployments/whitechainSepolia.lifecycle.json`](contracts/deployments/whitechainSepolia.lifecycle.json)):

| Step | Who | Explorer |
|---|---|---|
| Saver subscribes 50 USDT to the 3-year note (split into T-bill floor + pool sleeve in one tx) | Saver | [tx](https://explorer.testnet.whitechain.io/tx/0x90e66df4b0c51bb3a2b20b3fa6be376c5b5cb4d2282c830b3ea5898d01968e89) |
| Saver subscribes 15 USDT to the 3-hour demo note | Saver | [tx](https://explorer.testnet.whitechain.io/tx/0x8e703ea8b3563757df844e385f6ffcdff756881e70ce084f1d672121f1ca18d2) |
| Holder buys a 28-day MSFT floor (premium in USDT, max payout locked in the pool) | Holder | [tx](https://explorer.testnet.whitechain.io/tx/0xf471c5cbd5d24356ce26721c8ea7a95c43f9841685ba31afe09161b1ac4fee39) |
| Holder buys a 14-day NIFTY 50 floor | Holder | [tx](https://explorer.testnet.whitechain.io/tx/0xd9887c9dd6329901dfa175e8e0238ba540dd410a00d9ee4da96acae88ee55688) |
| Holder buys a 10-minute SPY floor (settled by the keeper from the official price) | Holder | [tx](https://explorer.testnet.whitechain.io/tx/0x276c656a9675e5359ca478e3d3f45599403f775549cc3d9c16870ae215026e91) |
| T-bill custodian proceeds paid in USDT, NAV and reserve attested | Issuer | [tx](https://explorer.testnet.whitechain.io/tx/0x73ac73b810abb00a8a33fff2060dd291e81a9bd29f2d9649f63d3374af85e1db) · [NAV](https://explorer.testnet.whitechain.io/tx/0x9b27f06f8cd4b7c3683c3a9033182f5cf0bedec18b9a2321db0ee46a8954d97a) |

### Hedera testnet (chain 296): Asset Tokenization Studio

Script ready: [`contracts/scripts/hedera-ats.js`](contracts/scripts/hedera-ats.js). It issues, through the live ATS Factory:
- a tokenised equity whose balance `CoverMarket` reads on-chain as proof the Holder owns what they insure;
- the Protected Note as an ATS bond (ISIN, maturity, KYC via SSI issuer, coupons via `setCoupon`).

Encoding is validated against the live factory (equity 8.09M gas, bond 8.30M gas). Deployment is waiting on testnet HBAR; see "Status".

### Arc testnet (chain 5042002): USDC settlement

Same suite, settling in Arc's USDC (`0x3600…0000`). Deployment is waiting on faucet USDC; see "Status".

## How it works

| Step | On-chain |
|---|---|
| 1. KYC | The issuer approves an investor in `IdentityRegistry` (country, expiry). Every contract checks it. |
| 2. Saver subscribes | `ProtectedNote.subscribe(face)`: floor = face / (1 + r·τ) goes to `TBillVault`, sleeve = rest goes to `UnderwritingPool`, note tokens are minted. |
| 3. Holder buys a floor | The server prices it (backtested engine) and signs an EIP-712 quote. `CoverMarket.buyCover` checks KYC, the signature, holdings, and the pool's reserve and per-stock cap, then takes the premium and locks the maximum payout. |
| 4. Settlement | The keeper posts the official close to `PriceOracle` at expiry, and anyone can call `settle`. The payout is `notional × min(max(−return − b, 0), c)`, paid in USDT. |
| 5. Coupons | `distributeCoupon` pays underwriting profit above the sleeve to note holders in USDT (hourly on testnet, monthly in production). |
| 6. Maturity | `mature()` pulls the T-bill floor and the sleeve back, and holders `redeem()` face plus sleeve. Transfers stop at maturity. |

Full diagram and controls: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Interface between the pieces: [`shared/INTERFACE.md`](shared/INTERFACE.md).

## Research

The pricing engine and every parameter (deductible, cap, reserve, per-stock cap, tenor) come from a walk-forward backtest across 20+ stock exchanges, 1999–2026, through every crash (2008, COVID, China 2015, Adani, DeepSeek, the 2025 tariffs…). See [`docs/BACKTEST.md`](docs/BACKTEST.md) and the `/docs` page of the app.

## Repo layout

| Path | What |
|---|---|
| `contracts/` | Hardhat 2 project: Solidity contracts, tests, deploy, verify and lifecycle scripts, deployments |
| `server/` | Node.js pricing engine, EIP-712 quoter, keeper and API |
| `app/` | Next.js frontend (Holder, Saver, Pool, Research, Issuer console, Activity) |
| `backtest/` | Python research: global walk-forward backtest; writes JSON for the app |
| `docs/` | Architecture, backtest report, pitch numbers |

## Setup

```bash
# contracts
cd contracts && npm i && npx hardhat test
echo "PRIVATE_KEY=<testnet key>" > .env
npx hardhat run scripts/deploy.js --network whitechainSepolia   # or hederaTestnet / arcTestnet
npx hardhat run scripts/verify.js --network whitechainSepolia

# server (pricing, quotes, keeper)
cd server && npm i && cp .env.example .env   # set QUOTER_PRIVATE_KEY
npm start                                    # http://localhost:8080

# app
cd app && npm i && npm run dev               # http://localhost:3000
```

## Status and current limitations

- **Whitechain:** live end to end with real test USDT (subscriptions, covers, oracle settlement, NAV attestation; coupons and the 3-hour note's maturity run from the keeper).
- **Hedera:** ATS script validated against the live factory. It needs about 45 testnet HBAR; the faucet's second drip asks for a captcha.
- **Arc:** waiting for Circle faucet USDC.
- **The pricing quoter is a single signer.** Production would use several reporters and a median, plus a published fallback (the contracts already support many reporters through `REPORTER_ROLE` and `QUOTER_ROLE`).
- **Holdings at a broker are attested by the server** (statement upload or broker API such as Zerodha Kite). On Hedera the attestation is replaced by the on-chain ATS balance.
- **The T-bill vault's custody is simulated on testnet.** The NAV agent's attested reserve stands in for the custodian statement.
- **Quotes on very volatile stocks are refused** (premium above 2% a month). This protects the pool; the backtest shows the trade-off.
- **Testnet risk depth.** The per-stock cap is 25% on the testnet pool so a small pool can show real policies; production uses 10%.
