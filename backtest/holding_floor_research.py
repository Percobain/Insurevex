"""One fixed-reference 156-week stock floor backed by one matched Saver note.

The retail strike does not reset during the holding period. This is indicative
physical-distribution pricing, not exchange option quotes or proven demand.
Only fully elapsed holding periods enter the historical price model.
"""
import json
import math

import numpy as np
import pandas as pd

from principal_research import OUT, DATA, CUTOFF, build_panel, pricing


def holding_panel(P, weeks=156):
    length = len(P["dates"]) - weeks + 1
    returns, known = [], []
    for j in range(length):
        # Conservatively pay the full cap if any part of the holding path was
        # unavailable. This is a model settlement convention, not an observed loss.
        good = P["known"][j:j + weeks].all(0)
        total = np.prod(1 + np.nan_to_num(P["g"][j:j + weeks], nan=-1), axis=0) - 1
        returns.append(np.where(good, total, -1))
        known.append(good)
    return dict(P, dates=P["dates"][:length], g=np.array(returns), known=np.array(known),
                sd=P["sd"][:length], eligible=P["eligible"][:length])


def main():
    P = holding_panel(build_panel())
    curve = pd.read_csv(DATA / "research_raw/feds200628.csv", skiprows=9, index_col=0, parse_dates=True).loc[:CUTOFF]
    curve = curve.apply(pd.to_numeric, errors="coerce")
    rows, holders = [], []
    for b, c in [(.1, .9), (0., 1.)]:
        for markup in (1.5, 2., 2.5):
            print("HOLDING", b, c, markup, flush=True)
            prod = pricing(P, b, c, sessions=756, information_lag=158, markup=markup, max_fee=.10)
            for j, issue in enumerate(P["dates"]):
                if issue < pd.Timestamp("2005-01-01"):
                    continue
                # One issue per month, chosen by a calendar rule, not outcomes.
                if j > 0 and P["dates"][j-1].month == issue.month:
                    continue
                maturity = issue + pd.Timedelta(weeks=156)
                if maturity > CUTOFF:
                    continue
                term = (maturity - issue).days / 365.25
                q = curve.loc[:issue].dropna(subset=["SVENY02", "SVENY03"]).iloc[-1]
                z = np.interp(term, np.arange(1, 31), [q[f"SVENY{t:02d}"] for t in range(1, 31)]) / 100
                floor = math.exp(-z * term)
                op_budget = .0025 * (maturity - issue).days / 365
                initial_risk = 1 - floor - .0025 - op_budget
                if initial_risk <= 0:
                    rows.append(dict(issue=str(issue.date()), b=b, c=c, markup=markup, accepted=False))
                    continue
                budget = .25 * initial_risk
                premium = budget * prod["premium"][j]
                payout = budget * prod["claims"][j]
                locked = budget * prod["sold"][j]
                assert payout <= locked + 1e-12 and locked <= initial_risk + 1e-12, (
                    issue, initial_risk, budget, premium, payout, locked)
                final_risk = initial_risk + .95 * premium - payout
                wealth = 1 + final_risk
                assert wealth >= 1 - 1e-12
                # In the all-claims-at-cap scenario, no prediction is needed.
                max_claim_wealth = 1 + initial_risk + .95 * premium - locked
                assert max_claim_wealth >= 1 - 1e-12
                rows.append(dict(issue=str(issue.date()), maturity=str(maturity.date()), b=b, c=c,
                                 markup=markup, accepted=True, floor_cost=floor, operating_budget=op_budget,
                                 initial_risk=initial_risk, premium=premium, payout=payout,
                                 notional_per_deposit=locked / c, saver_maturity=wealth,
                                 saver_apy=wealth ** (1 / term) - 1,
                                 all_claims_max_maturity=max_claim_wealth,
                                 quoted_names=int(prod["names"][j]),
                                 model_unknown_expiry_weight=float(prod["missing_claim_weight"][j])))
                mask = prod["eligible"][j] & P["known"][j]
                if mask.any():
                    g = P["g"][j, mask]
                    fee = prod["fee"][j, mask]
                    pay = np.clip(-b - g, 0, c)
                    holders.append(dict(issue=str(issue.date()), b=b, c=c, markup=markup,
                                        quote_share=float(prod["eligible"][j].sum() / max(P["eligible"][j].sum(), 1)),
                                        median_premium=float(np.median(prod["fee"][j, prod["eligible"][j]])),
                                        minimum_net_stock_return=float((g + pay - fee).min()),
                                        minimum_stock_return=float(g.min())))
    d = pd.DataFrame(rows)
    d.to_csv(OUT / "holding_floor_cohorts.csv", index=False)
    h = pd.DataFrame(holders)
    h.to_csv(OUT / "holding_floor_holders.csv", index=False)
    summary = []
    for (b, c, markup), g in d[d.accepted].groupby(["b", "c", "markup"]):
        hs = h[(h.b == b) & (h.c == c) & (h.markup == markup)]
        whole = d[(d.b == b) & (d.c == c) & (d.markup == markup)]
        summary.append(dict(b=b, c=c, markup=markup, accepted=len(g), rejected=int((~whole.accepted).sum()),
                            min_saver_maturity=float(g.saver_maturity.min()), median_saver_apy=float(g.saver_apy.median()),
                            min_all_claims_max_maturity=float(g.all_claims_max_maturity.min()),
                            median_cover_per_deposit=float(g.notional_per_deposit.median()),
                            min_cover_per_deposit=float(g.notional_per_deposit.min()),
                            median_quoted_names=float(g.quoted_names.median()),
                            median_holder_premium=float(hs.median_premium.median()),
                            median_quote_share=float(hs.quote_share.median()),
                            aggregate_loss_ratio=float(g.payout.sum() / g.premium.sum()) if g.premium.sum() else None))
    (OUT / "holding_floor_summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2), flush=True)


if __name__ == "__main__":
    main()
