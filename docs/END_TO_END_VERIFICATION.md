# End-to-end verification — 7 November 2026 IST

All transactions below are on testnets with test tokens. This run used the existing deployed contracts, real pricing APIs, the official Hedera x402 facilitator, native Hedera services, and the actual CRE CLI. No mainnet transaction, CRE deployment, activation, or secret upload was performed.

## Confirmed live product flows

**45 core/issuer transactions confirmed: 15 on each chain**, plus the separate agent and native-service transactions below. Each chain passed the same core flow:

1. Verify the actual RPC chain ID, deployed bytecode, signer funding, identity, and stablecoin.
2. Get an actual API underwriting quote using live MSFT pricing.
3. Subscribe **1 stablecoin** to the 3Y protected note; check minted face value and consumed exact allowance.
4. Deposit and withdraw **0.1 stablecoin** of Pro first-loss liquidity.
5. Deposit and redeem **0.01 stablecoin** through the T-bill vault.
6. Pay a bounded premium and issue a fully collateralised test policy.
7. Reject replay and settlement without an oracle close.
8. After actual on-chain expiry, post an **explicitly synthetic** crash for a unique E2E-only symbol and settle the policy.
9. Verify the exact **0.01 stablecoin payout**, Pro first loss, unchanged senior assets, released collateral, released covered shares, and rejection of double settlement.
10. Fund **0.0001 stablecoin** of custodian proceeds, roll NAV at the unchanged APY, and attest the vault's actual test-token cash reserve.
11. Reject unverified transfers, premature note redemption, and unauthorised oracle writes using real contract static calls.

The synthetic symbols do not overwrite real-stock oracle closes. The core verification uses the existing operator as the test participant; the separate agent run uses a newly provisioned, unprivileged holder.

| Chain | Stablecoin | Confirmed transactions | Payout receipt |
|---|---|---:|---|
| Whitechain Sepolia, 1874 | Official test USDT `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` | 15 | [0.01 USDT payout](https://explorer.testnet.whitechain.io/tx/0xe9951eda964e19bb3e73be59006ce14a434a30c97a7c0b8c1032e52ea9fe65e8) |
| Hedera testnet, 296 | Existing test USD | 15 | [0.01 test USD payout](https://hashscan.io/testnet/transaction/0x74b18bd99be96c6187df9029f84557c0d31b8ce65bfa986be8a8cbca8d031825) |
| Arc testnet, 5042002 | USDC | 15 | [0.01 USDC payout](https://explorer.testnet.arc.io/tx/0x549e0b2f6716d17794d831c7457de15743a58ee3c5a320439bb3d751eb17c303) |

Arc also charges gas in USDC. Its exact payout was checked using the stablecoin Transfer event rather than treating the wallet's net balance change as payout.

Complete receipts and assertions: [core flows](evidence/live-integration-verification.json), [issuer operations](evidence/issuer-live-verification.json), [independent explorer/Mirror confirmation](evidence/payout-explorer-verification.json).

## Hedera partners and agent controls

A fresh fixture was funded with 3 test HBAR and 10 test USD, granted test KYC and one ATS NVDA share, and given its own restricted HCS topic. This keeps the original agent's budgets and payment history intact; its limits were not raised or reset.

The actual signed dashboard API flow passed owner authentication, rejection of a different signer, stop/resume, preservation of existing limits, actual ATS holdings/collateral preflight, and rejection of preflight-plan reuse. One authorised run then completed autonomously:

| Operation | Result and receipt |
|---|---|
| x402 underwriting | **0.01 HBAR** settled through the official facilitator: [payment](https://hashscan.io/testnet/transaction/0.0.9185802%401793989802.202300975) |
| Insurance purchase | **Policy #10**, premium **0.004319 test USD**, protected notional **1.86375 test USD**: [purchase](https://hashscan.io/testnet/transaction/0x8a37a6dd43f2fb1852459daff9e0a6bf167aa90fbdd5d2e9f1d73a153b7c6844) |
| HCS spending audit | Restricted topic **0.0.11343736**, spending digest independently matched: [anchor](https://hashscan.io/testnet/transaction/0.0.11343726%401793989843.006391358) |
| ATS compliance | Freeze and unfreeze **0.000001 share** on the isolated holder; restore the exact original holding: [freeze](https://hashscan.io/testnet/transaction/0x7093a562b61ca020cbf268d10c72ed3f5f9e8407b800cfd65c3e4d119c826d3a), [unfreeze](https://hashscan.io/testnet/transaction/0xd6d817a5c92d75f190cc6ed9344323f426774069fcd9e41e50d0dee054c87fb0) |
| Native scheduled coupon | Schedule **0.0.11343812** created through HSS and confirmed executed by Mirror Node: [creation](https://hashscan.io/testnet/transaction/0xd2e87947e8ef8c1d6934a656700ba286f2215252169d805abeeff7b0eaad0fff) |
| Saver coupon claim | **0.210664 test USD** claimed after native coupon execution; exact transfer and zero remaining claim verified in [native evidence](evidence/hedera-native-verification.json) |
| Ownership control | A signed quote claiming two shares was rejected against the holder's actual one-share ATS holding. |

Mirror Node independently confirmed the merchant's 1,000,000-tinybar credit, the paying agent's matching debit, the successful insurance transaction, and the HCS message digest. See [agent run and controls](evidence/agent-live-verification.json), [independent Mirror verification](evidence/agent-live-mirror-verification.json), [provisioning](evidence/hedera-agent-provisioning-verification.txt), and [native services](evidence/hedera-native-verification.json).

## Chainlink CRE

The **actual CRE CLI simulation passed** against the deployed Whitechain market and live Yahoo API. It read **six policies**, fetched the completed NVDA close, and returned a clearly non-authorising observation because no scoped policy had expired. See [latest CLI output](evidence/chainlink-latest-live-simulation.txt).

The separate local EVM integration also passed the full two-source SDK handler → authenticated HTTP receiver → durable SQLite report → keeper → oracle → actual contract payout flow. The source prices in that local payout test are fixtures, explicitly labelled as such: [local E2E evidence](evidence/chainlink-local-e2e.json).

**Live CRE-driven two-source settlement remains blocked:** Stooq returned HTTP 403 and no valid closing-price CSV during this run. The workflow must leave scoped policies pending; this check did not weaken the two-source guard or turn on payment delivery. [Provider check](evidence/chainlink-second-source-status.json).

## Fixes discovered and validated

- Agent CLI discovery was pinned to the disabled merchant on 8080. Its local policy now selects the configured merchant on 8081.
- Agent wallets now reuse the bounded multi-RPC transport, batch related reads, and avoid repeated fee-method probes for legacy transactions.
- HTTP 429 fails over rather than silently backing off repeatedly on the same relay. A null receipt from a lagging relay is checked against other configured relays.
- Receipt confirmation polls the known hash without relying on unsupported relay subscriptions. Insurance hashes are committed to SQLite **before** broadcast, including when a relay loses its acknowledgement; no automatic replacement or duplicate payment is sent.
- A complete-run gas preflight checks approval, purchase and audit budget **before** charging for underwriting. The existing agent's insufficient remaining budget was rejected through the actual signed API with no changed budget and no retained lock: [verification](evidence/existing-agent-budget-verification.json).
- Activity warmup can be disabled on dedicated payment/CRE servers to avoid competing startup log scans. The main API retains its default behaviour.
- Native coupon scheduling selects a future timestamp when the coupon is already overdue and rejects non-success native response codes.
- Post-transaction ATS checks use the receipt's block, avoiding false failures from stale `latest` reads.

The existing payment service on **8081** was updated only while idle. Its wallet, limits, spending budget, controller, audit topic and two existing merchant receipt records were compared before/after and preserved. The main API on 8080 and frontend on 3000 were left running.

## Other verification and practical limits

- **37 server tests, 12 contract tests, six CRE SDK tests**, TypeScript checking, local keeper/payout E2E, and the frontend production build passed.
- All 11 application routes returned HTTP 200, including `/admin`, `/metrics`, `/agent`, `/protect`, `/save`, and `/pool`: [route checks](evidence/frontend-route-verification.json). On-chain writes were exercised through the actual APIs/CLI, not browser-extension wallet popups.
- Price APIs returned USD/NVDA, INR/RELIANCE and JPY/Toyota data. State, policies and activity APIs responded across all three chains. A cold Hedera activity scan was slow under public RPC quotas; cached/default and a bounded 1,000-block request subsequently succeeded.
- Existing live demo notes on all three chains were confirmed matured with zero remaining operator maturity claim. Fresh 3Y subscriptions were **not** artificially matured: [existing demo state](evidence/existing-demo-maturity-verification.json). Full maturity/redemption transitions are exercised in the local contract suite.
- Zerodha/IBKR/broker uploads are demo attestations, not verified live broker integrations. This run does not turn them into authenticated broker connectors.
- Persistent x402 runs locally; the existing serverless Vercel API does not host agent payments. CRE DON deployment and production readiness are not claimed. Public RPCs can still throttle or lag; successful receipts do not guarantee that external services will always be available.

Private keys and credential files remain in ignored, private local state. No credentials were copied into public evidence. All new subscriptions, policies and audit records are intentional testnet verification state.
