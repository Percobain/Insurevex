"""Independent, offline cash-flow checks of the committed results (stdlib only).

Does not refit prices or claim to reproduce the missing historical price inputs.
Run from any directory: python3 backtest/audit_saved_results.py
"""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(relative):
    return json.loads((ROOT / relative).read_text())


def close(actual, expected, label):
    if not math.isclose(actual, expected, abs_tol=1e-8, rel_tol=1e-9):
        raise AssertionError(f"{label}: {actual} != {expected}")


def main():
    book = read("contracts/stress/book.json")
    historical = read("backtest/results/stress_book.json")
    live = read("contracts/deployments/hederaTestnet.stress.json")
    assert historical == read("app/public/data/stress_backtest.json"), "historical UI copy differs"
    assert live["snapshots"] == read("app/public/data/stress_run.json")["snapshots"], "live UI copy differs"

    senior0, junior0 = historical["sleeve_usd"], historical["pro_usd"]
    rho = junior0 / historical["capacity_usd"]
    historical_years = historical["yearly"]
    total_premium = total_claims = senior_profit = pro_profit = 0.0
    for year in historical_years:
        premium, claims = year["premium"], year["payout"]
        close(year["loss_ratio"], claims / premium, f"{year['year']} loss ratio")
        # Both capital accounts are reset every January in stress_book.py.
        # Thus each year's percentage return applies to the same initial USD.
        senior_delta = senior0 * year["senior_ret"]
        pro_delta = junior0 * year["pro_ret"]
        close(senior_delta + pro_delta, premium - claims, f"{year['year']} tranche conservation")
        total_premium += premium
        total_claims += claims
        senior_profit += senior_delta
        pro_profit += pro_delta
    close(historical["loss_ratio"], total_claims / total_premium, "historical loss ratio")
    close(historical["pro_mean_year"], sum(y["pro_ret"] for y in historical_years) / len(historical_years), "Pro arithmetic mean")
    assert historical["pro_years_negative"] == sum(y["pro_ret"] < 0 for y in historical_years)

    first, last = live["snapshots"][0], live["snapshots"][-1]
    initial, final = first["pool"], last["pool"]
    premium = final["premiums"] - initial["premiums"]
    claims = final["payouts"] - initial["payouts"]
    coupons = last["note"]["couponsPaid"] - first["note"]["couponsPaid"]
    senior_delta = final["senior"] - initial["senior"] + coupons
    pro_delta = final["junior"] - initial["junior"]
    close(senior_delta + pro_delta, premium - claims, "testnet conservation including coupons")
    round_results = []
    previous = first
    for snapshot in live["snapshots"][1:]:
        if ": settled," not in snapshot["label"]:
            continue
        p, q = previous["pool"], snapshot["pool"]
        allocated = q["junior"] - p["junior"] + q["proLosses"] - p["proLosses"]
        round_results.append({
            "label": snapshot["label"],
            "premium_usd": q["premiums"] - p["premiums"],
            "claims_usd": q["payouts"] - p["payouts"],
            "pro_premium_usd": allocated,
            "pro_profit_usd": q["junior"] - p["junior"],
            "pro_return": q["junior"] / p["junior"] - 1,
        })
        previous = snapshot

    result = {
        "scope": "Saved-output reconciliation; original backtest/data inputs absent",
        "starting_pro_capacity_share": rho,
        "starting_pro_premium_share_default_40pct": rho + (1 - rho) * 0.4,
        "starting_pro_premium_share_stress_60pct": rho + (1 - rho) * 0.6,
        "stress_book_fee_bps": book["risk"]["proFeeBps"],
        "historical": {
            "years": len(historical_years),
            "negative_pro_years": historical["pro_years_negative"],
            "worst_pro_year": historical["pro_worst_year"],
            "arithmetic_mean_pro_year": historical["pro_mean_year"],
            "geometric_rebalanced_year_return": math.prod(1 + y["pro_ret"] for y in historical_years) ** (1 / len(historical_years)) - 1,
            "premium_usd": total_premium, "claims_usd": total_claims,
            "senior_profit_with_annual_resets_usd": senior_profit,
            "pro_profit_with_annual_resets_usd": pro_profit,
            "continuous_unfunded_strategy_return": None,
        },
        "testnet": {
            "initial_pro_usd": initial["junior"], "final_pro_usd": final["junior"],
            "pro_profit_usd": pro_delta, "pro_return": pro_delta / initial["junior"],
            "senior_profit_including_coupons_usd": senior_delta,
            "premium_usd": premium, "claims_usd": claims,
            "combined_profit_usd": premium - claims, "rounds": round_results,
        },
        "checks": "PASS: UI copies, annual loss ratios, tranche cash conservation, Pro mean and loss count, testnet cash conservation",
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
