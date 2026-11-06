"""Regenerates the README 'Live deployments' section from contracts/deployments/*.json and *.lifecycle.json."""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
B = os.path.join(ROOT, "contracts", "deployments")


def D(n):
    return json.load(open(os.path.join(B, f"{n}.json"), encoding="utf-8"))


def L(n):
    return json.load(open(os.path.join(B, f"{n}.lifecycle.json"), encoding="utf-8"))


def find(n, prefix):
    for x in L(n):
        if x["step"].startswith(prefix):
            return x["url"]
    raise KeyError(f"{n}: {prefix}")


def table(c, ex, kind):
    rows = [("IdentityRegistry (KYC, freeze, country)", "IdentityRegistry"),
            ("PriceOracle (official closes, zero-close aware)", "PriceOracle"),
            ("TBillVault (tokenised T-bill, NAV + reserve)", "TBillVault"),
            ("UnderwritingPool (senior ERC-4626 + Pro first-loss, epochs, owed payouts)", "UnderwritingPool"),
            ("CoverMarket", "CoverMarket"),
            ("ProtectedNote, 3-year series (vx3Y)", "Note3Y"),
            ("ProtectedNote, 3-hour demo series (vxDEMO)", "NoteDemo")]
    out = "| Contract | Address |\n|---|---|\n"
    suffix = "#code" if kind == "address" else ""
    for label, k in rows:
        out += f"| {label} | [`{c[k]}`]({ex}{kind}/{c[k]}{suffix}) |\n"
    return out


W, A, H = D("whitechainSepolia")["contracts"], D("arcTestnet")["contracts"], D("hederaTestnet")
WX, AX, HX = "https://explorer.testnet.whitechain.io/", "https://explorer.testnet.arc.io/", "https://hashscan.io/testnet/"
w, a, h = "whitechainSepolia", "arcTestnet", "hederaTestnet"
HC = H["contracts"]

sec = f"""## Live deployments (testnets, contracts v3)

All three chains run the same v3 contracts. v3 includes the four fixes from the Arc Studio security review, each with a regression test (12 passing):
- Pro shares are per epoch, so a wiped-out tranche can't claim new deposits.
- Undeliverable payouts are owed and claimable instead of blocking settlement.
- A frozen T-bill holder can't redeem to another address.
- A stock that closes at zero settles at the full cap.

Every contract is verified (Blockscout on Whitechain and Arc; Sourcify exact match, shown on HashScan, on Hedera). The earlier v1/v2 deployments and their transactions are archived in `contracts/deployments/*.v1*.json` and `*.v2*.json`.

### Whitechain Sepolia (chain 1874): settling in the official test USDT

Settlement token (official test USDT): [`{W['stable']}`]({WX}address/{W['stable']})

{table(W, WX, 'address')}
**USDT payments in the main flow** (full list in [`contracts/deployments/whitechainSepolia.lifecycle.json`](contracts/deployments/whitechainSepolia.lifecycle.json)):

| Step | Party | Explorer |
|---|---|---|
| Saver subscribes 6 USDT to the 3-year note (split into T-bill floor + pool sleeve in one tx) | Saver | [tx]({find(w, 'Saver subscribes 6.0')}) |
| Saver subscribes 2 USDT to the 3-hour demo note | Saver | [tx]({find(w, 'Saver subscribes 2.0')}) |
| Pro LP deposits 4 USDT of first-loss capital | Pro LP | [tx]({find(w, 'Pro LP deposits')}) |
| Holder buys a weekly MSFT floor (Nasdaq, brokerage shares) | Holder | [tx]({find(w, 'Holder buys NASDAQ:MSFT')}) |
| Holder buys a 2-week NIFTY 50 floor (NSE) | Holder | [tx]({find(w, 'Holder buys NSE:NIFTY')}) |
| Holder buys a monthly Toyota floor (TSE:7203) | Holder | [tx]({find(w, 'Holder buys TSE:7203')}) |
| Holder buys a 15-minute SPY floor (settled by the keeper from the official price) | Holder | [tx]({find(w, 'Holder buys NYSEARCA:SPY')}) |
| T-bill custodian proceeds in USDT, then NAV and reserve attested | Issuer | [tx]({find(w, 'T-bill vault: custodian')}) · [NAV]({find(w, 'T-bill NAV')}) |
| Saver claims the USDT coupon paid from underwriting profit | Saver | [tx]({find(w, 'Saver claims')}) |
| **Maturity:** the demo note matures and the Saver redeems **2 USDT in, 2.000026 USDT back** (principal protected, plus T-bill accrual) | Saver | [tx]({find(w, 'Saver redeems demo note')}) |
| Earlier full-term run (v2): 8 USDT in, 8.000113 USDT back | Saver | [mature](https://explorer.testnet.whitechain.io/tx/0x57a6e53bf0a0c82735d02cff3389ee661a97ce5d39944ec9046916b36f0a7d69) · [redeem](https://explorer.testnet.whitechain.io/tx/0x2000f6b1f4a00931ca299c9f13e92d10f75b7153670dad3ecded867d6fc41eff) |

### Hedera testnet (chain 296): with Asset Tokenization Studio

**ATS securities**, issued through the live ATS Factory v8.0.0 (`0xd1F118A40f3b02883D35909eF2517e7EDd78379d`):

| ATS security | Address | Role in InsureVEX |
|---|---|---|
| Tokenised NVIDIA equity (ERC-1400, ISIN US67066G1040, KYC, freeze, controller, pause) | [`{H['ats']['equityNVDA']}`]({HX}contract/{H['ats']['equityNVDA']}) | `CoverMarket` reads the holder's ATS balance on-chain as proof they own what they insure |
| InsureVEX 3Y Protected Note as an ATS bond (ISIN, 3-year maturity, KYC via SSI issuer, coupons) | [`{H['ats']['noteBond3Y']}`]({HX}contract/{H['ats']['noteBond3Y']}) | The note issued as a regulated bond with an on-chain coupon schedule |

Settlement token (InsureVEX test USD): [`{HC['stable']}`]({HX}contract/{HC['stable']})

{table(HC, HX, 'contract')}
**Lifecycle on Hedera** (full list in [`contracts/deployments/hederaTestnet.lifecycle.json`](contracts/deployments/hederaTestnet.lifecycle.json); ATS issuance history in `hederaTestnet.v2.lifecycle.json`):

| Step | Explorer |
|---|---|
| ATS issuance: equity `deployEquity`, SSI issuer, `grantKyc`, issue 100 tokenised NVDA | [equity]({HX}transaction/0x1ad148f2f7b736a34777294c02d6b16b2c4512f9a0b19e14d73e2d0e6e31365c) · [KYC]({HX}transaction/0x228eac96c26683c50a43e45ddc13d461c3fc71499e1db99346aebe3270cb0a03) · [issue]({HX}transaction/0x4f2b2a9486856f02b0deb317daa80f7062daf28e53e55b0bcdf7d06244360806) |
| ATS bond: issue the note bond, KYC, 1,000 units, `setCoupon` | [bond]({HX}transaction/0xff29c0bf6dda7f39c99d6e1d1676c1884fe87d2f13f18130cc2a37663aa57600) · [issue]({HX}transaction/0x6b2ee636a8837de2b0792bce393dde69a796bc8291d6468dae0038424b03dab1) · [coupon]({HX}transaction/0x7d19657c49d5749c2b36d71f5af853a1bfbb1f86b6fbd1f157a99887593f08f2) |
| v3 CoverMarket linked to the ATS equity (`setSymbolToken`) | [tx]({find(h, 'CoverMarket.setSymbolToken')}) |
| Holder buys NVDA cover; insurable interest proven by the **ATS balance on-chain** | [tx]({find(h, 'Holder buys NASDAQ:NVDA')}) |
| Cover on 150 NVDA with only 90 transferable: **reverted on-chain** (`cover exceeds holdings`) | `scripts/hedera-demo-checks.js` |
| ATS compliance: freeze 10 of the holder's tokenised shares | [tx]({find(h, 'ATS equity: freeze')}) |
| **Hedera Schedule Service** (HIP-1215): next coupon scheduled natively. Proven on v2: schedule 0.0.11331278 was **executed by the network at 00:06:34 UTC, paying 0.498 tUSD with no keeper** | [v3 schedule]({find(h, 'Hedera Schedule Service')}) · [v2 executed]({HX}schedule/0.0.11331278) |
| Saver subscribes 5,000 · Pro LP 2,000 · tradfi covers on Reliance (NSE), SAP (Xetra), SPY | [sub]({find(h, 'Saver subscribes 5000')}) · [Pro]({find(h, 'Pro LP deposits')}) · [RELIANCE]({find(h, 'Holder buys NSE:RELIANCE')}) · [SAP]({find(h, 'Holder buys XETRA:SAP')}) |
| T-bill NAV + reserve attestation | [tx]({find(h, 'T-bill NAV')}) |
| Saver claims the coupon; the demo note matures and redeems **1,000 tUSD in, 1,000.014 tUSD back** | [coupon]({find(h, 'Saver claims')}) · [redeem]({find(h, 'Saver redeems demo note')}) |

### Arc testnet (chain 5042002): settling in USDC

USDC is both the settlement token (`0x3600…0000`) and the gas token, so a Saver needs nothing but USDC.

**Built in Arc Studio:** https://studio.arc.io/app/7356f9d2-e713-4576-a2f0-4acfd62806e4. Studio wrote and tested its own version of the six contracts (263 forge tests, two security reviews, Slither) and a Saver / Holder / Pool / Issuer app that reads these live v3 contracts and gets signed quotes from the InsureVEX API.

{table(A, AX, 'address')}
| Step (USDC) | Explorer |
|---|---|
| Saver subscribes 4 USDC to the 3-year note | [tx]({find(a, 'Saver subscribes 4.0')}) |
| Pro LP deposits 2 USDC of first-loss capital | [tx]({find(a, 'Pro LP deposits')}) |
| Holder covers MSFT (weekly), Tencent (HKEX, 2 weeks) and SPY (15 minutes) | [MSFT]({find(a, 'Holder buys NASDAQ:MSFT')}) · [Tencent]({find(a, 'Holder buys HKEX:0700')}) · [SPY]({find(a, 'Holder buys NYSEARCA:SPY')}) |
| T-bill NAV + reserve attestation | [tx]({find(a, 'T-bill NAV')}) |
| Saver claims the USDC coupon; the demo note matures and redeems **1 USDC in, 1.000012 USDC back** (gas paid separately in USDC) | [coupon]({find(a, 'Saver claims')}) · [redeem]({find(a, 'Saver redeems demo note')}) |

"""

rp = os.path.join(ROOT, "README.md")
s = open(rp, encoding="utf-8").read()
i, k = s.index("## Live deployments"), s.index("## How it works")
s = s[:i] + sec + s[k:]
s = s.replace("| `contracts/` | Hardhat 2 project: Solidity contracts, 8 tests, deploy, verify, lifecycle and ATS scripts, deployments |",
              "| `contracts/` | Hardhat 2 project: Solidity contracts, 12 tests, deploy, verify (Blockscout + Sourcify), lifecycle, ATS and schedule-service scripts, deployments |")
s = s.replace("npx hardhat test          # 8 passing", "npx hardhat test          # 12 passing")
open(rp, "w", encoding="utf-8").write(s)
print("README updated", len(s))
