"""Independent checks of saved ledgers and source hashes; export a research chart."""
import hashlib
import json

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from principal_research import OUT, ROOT


def main():
    manifest = json.loads((OUT / "data_manifest.json").read_text())
    for item in manifest["prices"]:
        p = ROOT / "backtest/data" / (item["ticker"] + ".csv")
        assert hashlib.sha256(p.read_bytes()).hexdigest() == item["sha256"], p
    for item in manifest["rates"]:
        assert hashlib.sha256((ROOT / item["file"]).read_bytes()).hexdigest() == item["sha256"]
    c = pd.read_csv(OUT / "insurance_cohorts.csv")
    matched = c[c.accepted & (c.design == "matched_zero")]
    assert (matched.saver_maturity >= 1 - 1e-9).all()
    assert (matched.external_cost_funding_required.abs() < 1e-9).all()
    np.testing.assert_allclose(matched.floor_cost + matched.initial_risk_budget + matched.prepaid_operating_budget + .0025, 1, atol=1e-9)
    np.testing.assert_allclose(matched.saver_maturity - 1,
                               matched.initial_risk_budget + matched.prepaid_operating_budget + matched.premiums
                               - matched.claims - matched.costs_paid, atol=1e-9)
    stress = pd.read_csv(OUT / "sensitivities.csv")
    stress_matched = stress[stress.accepted & (stress.design == "matched_zero")]
    assert (stress_matched.saver_maturity >= 1 - 1e-9).all()
    assert (stress_matched.external_cost_funding_required.abs() < 1e-9).all()
    holding = pd.read_csv(OUT / "holding_floor_cohorts.csv")
    h = holding[holding.accepted]
    np.testing.assert_allclose(h.floor_cost + h.operating_budget + h.initial_risk + .0025, 1, atol=1e-9)
    np.testing.assert_allclose(h.saver_maturity, 1 + h.initial_risk + .95 * h.premium - h.payout, atol=1e-9)
    assert (h.all_claims_max_maturity >= 1 - 1e-9).all()
    assert (h.payout <= h.notional_per_deposit * h.c + 1e-9).all()
    # A single fixed holding-period book has no interim reinvestment. Scaling
    # committed risk from 25% to 50% or 100% therefore scales cash flows exactly.
    # These are analytical sensitivities, not additional independent backtests.
    scaled_rows = []
    for utilisation in (.25, .5, 1.):
        for (b, c_, markup), group in h.groupby(["b", "c", "markup"]):
            scale = utilisation / .25
            lock = scale * group.notional_per_deposit * group.c
            np.testing.assert_array_less(lock.to_numpy(), group.initial_risk.to_numpy() + 1e-9)
            wealth = 1 + group.initial_risk + scale * (.95 * group.premium - group.payout)
            catastrophe = 1 + group.initial_risk + .95 * scale * group.premium - lock
            assert wealth.min() >= 1 - 1e-9 and catastrophe.min() >= 1 - 1e-9
            years = (pd.to_datetime(group.maturity) - pd.to_datetime(group.issue)).dt.days / 365.25
            scaled_rows.append(dict(b=b, c=c_, markup=markup, utilisation=utilisation,
                                    cohorts=len(group), median_cover_per_deposit=float((group.notional_per_deposit * scale).median()),
                                    median_saver_apy=float((wealth ** (1 / years) - 1).median()),
                                    minimum_saver_maturity=float(wealth.min()),
                                    minimum_all_claims_max_maturity=float(catastrophe.min())))
    pd.DataFrame(scaled_rows).to_csv(OUT / "holding_utilisation_summary.csv", index=False)
    stats = dict(result="PASS", source_price_files=len(manifest["prices"]),
                 matched_weekly_cohorts=len(matched), weekly_rejected=int((~c[c.design == "matched_zero"].accepted).sum()),
                 matched_sensitivity_cases=len(stress_matched), fixed_holding_cohorts=len(h),
                 minimum_holding_max_claim_payout=float(h.all_claims_max_maturity.min()),
                 caveat="Cash-flow identities are conditional on floor payment. Cohorts overlap and do not estimate failure probability.")
    (OUT / "verification.json").write_text(json.dumps(stats, indent=2))
    print(json.dumps(stats, indent=2))

    f = pd.read_csv(OUT / "floor_cohorts.csv", parse_dates=["issue"])
    f = f[(f.term == 3) & (f.issue >= "1999-06-01")]
    selected = h[(h.b == .1) & (h.markup == 1.5)].copy()
    selected["issue"] = pd.to_datetime(selected.issue)
    fig, axes = plt.subplots(2, 2, figsize=(12, 8), layout="constrained")
    ax = axes[0, 0]
    ax.plot(f.issue, f.legacy_floor_maturity * 1000, color="#bd3a37", lw=1.5)
    ax.axhline(1000, color="#333", ls="--", lw=1)
    ax.set(title="Legacy assumed-rate floor funded by rolling bills", ylabel="Floor proceeds per $1,000 face")
    ax = axes[0, 1]
    ax.plot(f.issue, (f.matched_budget_after_25bp - .0025 * 3) * 100, color="#176b69")
    ax.axhline(0, color="#333", ls="--", lw=1)
    ax.set(title="Matched 3-year floor after stated cost budgets", ylabel="Remaining risk budget (% of deposit)")
    ax = axes[1, 0]
    ax.plot(selected.issue, selected.notional_per_deposit * 1e6, color="#2763a3")
    ax.set(title="Fixed 156-week 90% stock floor: funded capacity", ylabel="Retail notional per $1M Saver deposit")
    ax = axes[1, 1]
    ax.plot(selected.issue, selected.saver_maturity * 1000, label="Historical modeled claims", color="#2763a3")
    ax.plot(selected.issue, selected.all_claims_max_maturity * 1000, label="Every claim pays maximum", color="#bd3a37")
    ax.axhline(1000, color="#333", ls="--", lw=1)
    ax.set(title="Saver maturity proceeds: principal floor kept separate", ylabel="Maturity proceeds per $1,000")
    ax.legend(fontsize=8)
    for ax in axes.flat:
        ax.grid(alpha=.2)
        ax.spines[["top", "right"]].set_visible(False)
    fig.suptitle("Principal-first research: indicative rates, current-constituent universe, conditional asset performance", fontsize=12)
    fig.savefig(OUT / "principal_research.png", dpi=160)
    plt.close(fig)


if __name__ == "__main__":
    main()
