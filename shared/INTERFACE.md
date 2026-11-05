# InsureVEX interface (source of truth between contracts, server and app)

## Chains (testnets only)

| Chain | id | RPC | Explorer | Gas | Settlement token |
|---|---|---|---|---|---|
| Whitechain Sepolia | 1874 | https://rpc.testnet.whitechain.io | https://explorer.testnet.whitechain.io | WBT | official test USDT `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` (6 dp) |
| Hedera testnet | 296 | https://testnet.hashio.io/api | https://hashscan.io/testnet | HBAR | InsureVEX test USD (6 dp); tokenised stocks and the note are issued with Asset Tokenization Studio (ATS) |
| Arc testnet | 5042002 | https://rpc.testnet.arc.network | https://testnet.arcscan.app | USDC | USDC ERC-20 `0x3600000000000000000000000000000000000000` (6 dp) |

Addresses: `contracts/deployments/<network>.json` (copied to `app/src/deployments/` and read by the server).
Keys: `contracts.{stable, IdentityRegistry, PriceOracle, TBillVault, UnderwritingPool, CoverMarket, Note3Y, NoteDemo}`;
`notes[]` lists the note series. ABIs: `app/src/abi/*.json`, `server/src/abi/*.json`.

## Symbols

`symbolId = keccak256(utf8("EXCHANGE:TICKER"))`, for example `NASDAQ:NVDA`, `NSE:RELIANCE`, `LSE:HSBA`, `TSE:7203`, `HKEX:0700`, `XETRA:SAP`.
Prices are 8-decimal in the stock's own currency. Cover is USD-quanto: payout = notional * min(max(-b - r, 0), c), r = close(expiry)/startPrice - 1.

## EIP-712 quote (CoverMarket)

Domain `{ name: "InsureVEX CoverMarket", version: "1", chainId, verifyingContract: CoverMarket }`

```
Quote(address buyer, bytes32 symbol, uint256 notional, uint256 shares, uint256 heldShares, uint32 deductibleBps,
      uint32 capBps, uint256 premium, uint256 startPrice, uint64 expiry, uint64 validUntil, uint256 nonce)
```
`notional` and `premium` are in settlement-token units (6 dp). `shares` / `heldShares` are 1e18-scaled share counts.
The buyer must approve `premium` to CoverMarket, then call `buyCover(quote, signature)`.

## Server REST API (default http://localhost:8080)

| Method | Path | Returns |
|---|---|---|
| GET | `/api/health` | `{ ok, chains, quoter }` |
| GET | `/api/markets` | `{ markets: [{ id, name, country, flag, currency, exchange, symbols: [{ symbol, ticker, name, yahoo, currency, lastClose, lastCloseDate, sigmaDaily, quotable }] }] }` |
| GET | `/api/price?symbol=NSE:RELIANCE` | `{ symbol, close, date, currency, sigmaDaily, history: [[date, close]...] }` |
| GET | `/api/quote?chainId&buyer&symbol&notional&shares&heldShares&deductibleBps&capBps&tenorDays` | `{ ok, quote, signature, pricing: { fairBps, premiumBps, markup, sigmaPeriod, pPayout, refused, reason, lastClose, currency }, premium, maxPayout, contract }` (`notional` in whole USD; `deductibleBps` in 300/500/750/1000/1500/2000/2500; `capBps` 1000/2000/3000; `tenorDays` 7/14/28, or `tenorMinutes` for live testnet demos). When refused: `{ ok: false, pricing, alternatives: [{ deductibleBps, premiumBps, pPayout }] }`, the nearest deeper deductibles that are quotable; offer them in the UI. |
| POST | `/api/holdings/attest` | body `{ address, symbol, source: "kite"\|"statement"\|"ats", shares }` -> `{ heldShares, ref, source }` |
| GET | `/api/state?chainId` | `{ pool: { totalAssets, locked, capacity, utilisationBps, totalPremiums, totalPayouts, reserveBps, symbolCapBps, sharePrice }, tbill: { nav, apyBps, attestedReserve }, notes: [snapshot...], policies: { count, open } }` |
| GET | `/api/policies?chainId&holder` | `{ policies: [...] }` |
| POST | `/api/kyc/request` | body `{ address, country, name }` -> stored request (issuer approves on-chain from the app's Issuer console) |
| GET | `/api/kyc/requests` | pending requests |
| GET | `/api/activity?chainId` | latest on-chain events (subscriptions, covers, settlements, coupons) |

The keeper inside the server posts official closes to `PriceOracle` at each policy expiry, settles expired policies,
calls `distributeCoupon` when due and rolls the T-bill NAV daily.

## Backtest data for the docs page

`app/public/data/*.json`: `global_summary.json`, `markets.json`, `models.json`, `configs.json`, `saver.json`,
`holders.json`, `stress.json`, `equity_curve.json`, `loss_ratio_by_year.json` (written by `backtest/run_world.py`).
