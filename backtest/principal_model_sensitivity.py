"""Report predeclared alternatives for the true 90% stock-value floor.

No winner selection. Run after principal_research.py with the same environment.
"""
import json

import pandas as pd

from principal_research import CUTOFF, OUT, DATA, build_panel, load_rate, pricing, run_account


def main():
    P = build_panel()
    bills = load_rate("DTB3")
    curve = pd.read_csv(DATA / "research_raw/feds200628.csv", skiprows=9, index_col=0, parse_dates=True).loc[:CUTOFF]
    curve = curve.apply(pd.to_numeric, errors="coerce")
    rows = []
    for floor, markup in [(.0025, 1.5), (.005, 1.5), (.01, 1.5), (.005, 2), (.005, 2.5)]:
        print("MODEL", floor, markup, flush=True)
        product = pricing(P, .1, .9, volatility_floor=floor, markup=markup)
        sel = P["dates"] >= "2016"
        loss_ratio = product["claims"][sel].sum() / product["premium"][sel].sum()
        for issue in pd.date_range("2005-01-01", CUTOFF - pd.DateOffset(years=3), freq="MS"):
            for utilisation in (.1, .25, .5):
                out, _ = run_account(P, product, bills, curve, issue, issue + pd.DateOffset(years=3),
                                     "matched_zero", utilisation=utilisation)
                if out:
                    rows.append(dict(out, volatility_floor=floor, markup=markup,
                                     evaluation_book_loss_ratio=loss_ratio))
    d = pd.DataFrame(rows)
    d.to_csv(OUT / "model_sensitivity_cohorts.csv", index=False)
    summary = []
    for (floor, markup, u), g in d[d.accepted].groupby(["volatility_floor", "markup", "utilisation"]):
        summary.append(dict(volatility_floor=floor, markup=markup, utilisation=u, accepted=len(g),
                            median_apy=float(g.saver_apy.median()), worst_apy=float(g.saver_apy.min()),
                            median_weekly_cover=float(g.notional_per_week.median()),
                            share_beating_bills=float((g.saver_maturity > g.benchmark_maturity).mean()),
                            evaluation_book_loss_ratio=float(g.evaluation_book_loss_ratio.iloc[0]),
                            external_cost_funding_max=float(g.external_cost_funding_required.max())))
    (OUT / "model_sensitivity_summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2), flush=True)


if __name__ == "__main__":
    main()
