"""Independent principal-first research. Never writes old backtest/live artifacts.

Run with pandas/numpy/matplotlib installed after fetch_world.py:
  python backtest/principal_research.py

Historical indicative-rate/adjusted-close scenarios, not executable quotations.
No return optimisation, annual capital reset, or hidden Pro recapitalisation.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

from fetch_world import MARKETS

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "backtest/data"
OUT = ROOT / "backtest/results/principal_research"
OUT.mkdir(parents=True, exist_ok=True)
CUTOFF = pd.Timestamp("2026-10-30")  # final completed week with downloaded Fed curve
CONFIG = dict(
    cutoff=str(CUTOFF.date()), universe="all recoverable names from existing 23-market universe",
    start="2005-01-07", evaluation_start="2016-01-01", history_start="1999-06-01",
    tenor="weekly", sessions=5, volatility_floor_daily=0.005,
    markup=1.5, max_weekly_fee=0.01, min_fee=0.0001,
    utilisation=0.25, per_name_weight=0.05, per_market_weight=0.25,
    annual_operating_cost_per_deposit=0.0025, premium_execution_cost=0.05,
    matched_zero_cost_policy="Entire fixed-term operating budget segregated at issue, outside claim collateral",
    bill_term_days=91, rate_quote_convention="same-date indicative secondary-market rate, not an executable ask",
    tail_information_lag_buckets=2, curve_price_convention="same-date fitted zero curve as an execution-price proxy, not a predictive input",
    products=[[0.03, 0.10], [0.05, 0.10], [0.10, 0.20], [0.10, 0.90], [0.0, 1.0]],
    missing_expiry_rule="pay the contractual maximum; omit unknown underlying return from holder metrics",
    note="Fixed research assumptions, not parameter estimates, broker quotes, or launch approval",
)


def dump(name, obj):
    (OUT / name).write_text(json.dumps(obj, indent=2, default=lambda x: x.item() if hasattr(x, "item") else str(x), allow_nan=False))


def load_rate(name):
    p = DATA / "research_raw" / f"{name}.csv"
    if not p.exists():
        p = DATA / f"FRED_{name}.csv"
    d = pd.read_csv(p)
    dates = pd.to_datetime(d.iloc[:, 0])
    values = pd.to_numeric(d[name], errors="coerce") / 100
    return pd.Series(values.to_numpy(), index=dates).dropna().loc[:CUTOFF]


def bill_growth(discount, days=91):
    """Bank discount is on FACE / 360 days, not purchase price APY."""
    price = 1 - discount * days / 360
    if price <= 0:
        raise ValueError("invalid bill discount")
    return 1 / price


def bill_path(rate, start, end, lag=0, cost_annual=0):
    """Indicative 91d bills held to maturity; terminal partial roll stays cash.

    At each bill maturity principal is preserved in the next purchase and
    positive realised interest is available outside the principal account.
    No interest is spent before the bill pays it. Fees come from interest.
    """
    d = pd.Timestamp(start)
    rows = []
    while d + pd.Timedelta(days=91) <= end:
        qdate = d - pd.Timedelta(days=lag)
        obs = rate.loc[:qdate]
        if not len(obs) or (qdate - obs.index[-1]).days > 14:
            break
        r = float(obs.iloc[-1])
        maturity = d + pd.Timedelta(days=91)
        gross = bill_growth(r) - 1
        # If rates are negative, protect face by holding cash instead.
        interest = max(gross, 0)
        fee = cost_annual * 91 / 365
        rows.append(dict(start=d, end=maturity, quote_date=obs.index[-1], discount=r,
                         interest=interest, available=max(interest - fee, 0),
                         unfunded_operating_cost=max(fee - interest, 0)))
        d = maturity
    return rows


def rate_research():
    bills = load_rate("DTB3")
    curve = pd.read_csv(DATA / "research_raw/feds200628.csv", skiprows=9, index_col=0, parse_dates=True).loc[:CUTOFF]
    curve = curve.apply(pd.to_numeric, errors="coerce")
    rows = []
    first = max(bills.index[0], curve.index[0]) + pd.Timedelta(days=14)
    starts = pd.date_range(first, CUTOFF, freq="MS")
    for term in (1, 3, 5):
        par = load_rate(f"DGS{term}")
        for issue in starts:
            maturity = issue + pd.DateOffset(years=term)
            if maturity > CUTOFF:
                continue
            a = par.loc[:issue]
            z = curve[f"SVENY{term:02d}"].loc[:issue].dropna()
            if not len(a) or not len(z):
                continue
            # Legacy floor assumption: DGS is a par yield, not a zero price.
            legacy_floor = (1 + float(a.iloc[-1])) ** -term
            path = bill_path(bills, issue, maturity)
            if len(path) != int((maturity - issue).days // 91):
                continue
            realised_growth = math.prod(1 + p["interest"] for p in path)
            legacy_maturity = legacy_floor * realised_growth
            zero = float(z.iloc[-1]) / 100  # GSW is continuously compounded
            matched_cost = math.exp(-zero * ((maturity - issue).days / 365.25))
            # 25 bp initial custody/transaction budget; its amount is a scenario.
            matched_risk = 1 - matched_cost - 0.0025
            rows.append(dict(issue=issue, maturity=maturity, term=term,
                             legacy_floor=legacy_floor, rolling_growth=realised_growth,
                             legacy_floor_maturity=legacy_maturity,
                             legacy_shortfall=max(1 - legacy_maturity, 0),
                             zero_yield=zero, matched_cost=matched_cost,
                             matched_budget_after_25bp=matched_risk,
                             matched_feasible=matched_risk >= 0))
    d = pd.DataFrame(rows)
    d.to_csv(OUT / "floor_cohorts.csv", index=False)
    summaries = []
    for period, mask in [("all_available", np.ones(len(d), bool)), ("since_1999", d.issue >= "1999-06-01")]:
        for term, g in d[mask].groupby("term"):
            worst = g.loc[g.legacy_shortfall.idxmax()]
            summaries.append(dict(period=period, term=int(term), cohorts=len(g), first=str(g.issue.min().date()),
                                  last=str(g.issue.max().date()), legacy_shortfall_share=float((g.legacy_shortfall > 1e-8).mean()),
                                  legacy_worst_shortfall=float(g.legacy_shortfall.max()), worst_issue=str(worst.issue.date()),
                                  legacy_median_maturity=float(g.legacy_floor_maturity.median()),
                                  matched_budget_min=float(g.matched_budget_after_25bp.min()),
                                  matched_budget_median=float(g.matched_budget_after_25bp.median()),
                                  matched_budget_max=float(g.matched_budget_after_25bp.max()),
                                  matched_infeasible_share=float((~g.matched_feasible).mean())))
    pd.DataFrame(summaries).to_csv(OUT / "floor_summary.csv", index=False)
    return bills, curve, summaries


def build_panel():
    dates = pd.date_range("1999-06-04", CUTOFF, freq="W-FRI")
    names, markets, columns, vols, eligibility, real_known, counts = [], [], [], [], [], [], []
    manifest, failures = [], []
    used = set()
    for market, universe in MARKETS.items():
        for ticker in universe["tickers"] + [universe["index"]]:
            if ticker in used:
                continue
            used.add(ticker)
            p = DATA / f"{ticker}.csv"
            if not p.exists():
                failures.append(dict(ticker=ticker, market=market, reason="download missing"))
                continue
            raw = pd.read_csv(p, index_col=0, parse_dates=True)
            s = pd.to_numeric(raw["Close"], errors="coerce").dropna().loc[:CUTOFF]
            s = s[~s.index.duplicated()].sort_index()
            s = s[s > 0]
            if len(s) < 250:
                failures.append(dict(ticker=ticker, market=market, reason="fewer than 250 usable closes"))
                continue
            lr = np.log(s).diff()
            ew = (lr * lr).ewm(alpha=.06, adjust=False, min_periods=20).mean()
            long = lr.rolling(252, min_periods=120).var()
            sd = np.sqrt(.5 * ew + .5 * long)
            # No future reversal cleaning or future coverage filter.
            weekly = s.resample("W-FRI").last().reindex(dates)
            last_date = pd.Series(s.index, index=s.index).resample("W-FRI").last().reindex(dates)
            age = (pd.Series(dates, index=dates) - last_date).dt.days
            current = weekly.notna() & (age <= 4)
            sig = sd.resample("W-FRI").last().reindex(dates)
            ok = current & sig.notna()
            r = weekly.shift(-1) / weekly - 1
            known = r.notna() & current.shift(-1, fill_value=False)
            # Unknown expiry pays max on an issued policy. It never disappears.
            payout_return = r.where(known, -1).where(ok)
            names.append(ticker); markets.append(market)
            columns.append(payout_return.to_numpy()); vols.append(sig.to_numpy())
            eligibility.append(ok.to_numpy()); real_known.append(known.to_numpy())
            counts.append(int((lr.abs() > .5).sum()))
            manifest.append(dict(ticker=ticker, market=market, rows=len(s), first=str(s.index[0].date()),
                                 last=str(s.index[-1].date()), sha256=hashlib.sha256(p.read_bytes()).hexdigest()))
    # Last row has no complete future week, even if a future close was downloaded.
    P = dict(dates=dates[:-1], names=names, market=np.array(markets),
             g=np.array(columns).T[:-1], sd=np.array(vols).T[:-1],
             eligible=np.array(eligibility).T[:-1], known=np.array(real_known).T[:-1])
    dump("data_manifest.json", dict(config=CONFIG, prices=manifest, missing=failures,
                                    large_daily_log_moves=sum(counts),
                                    rates=[dict(file=str(p.relative_to(ROOT)), sha256=hashlib.sha256(p.read_bytes()).hexdigest())
                                           for p in sorted((DATA / "research_raw").glob("*.csv"))]))
    return P


def empirical_fair(sorted_z, sigma, b, c):
    """Exact empirical capped payoff using only the finite interval sum.

    No equally weighted endpoint quantiles and no subtraction of enormous
    partial moments. Every original training observation retains its weight.
    """
    cs = np.r_[0., np.cumsum(sorted_z)]
    lower = np.searchsorted(sorted_z, -(b + c) / sigma, side="right")
    upper = np.searchsorted(sorted_z, -b / sigma, side="left")
    value = (c * lower - b * (upper - lower) - sigma * (cs[upper] - cs[lower])) / len(sorted_z)
    return np.clip(value, 0, c)


def pricing(P, b, c, volatility_floor=None, markup=None, information_lag=2, sessions=5, max_fee=None):
    K, N = P["g"].shape
    volatility_floor = CONFIG["volatility_floor_daily"] if volatility_floor is None else volatility_floor
    markup = CONFIG["markup"] if markup is None else markup
    max_fee = CONFIG["max_weekly_fee"] if max_fee is None else max_fee
    sigma = np.maximum(P["sd"], volatility_floor) * np.sqrt(sessions)
    z = P["g"] / sigma
    fair = np.full((K, N), np.nan)
    raw_fair = np.full_like(fair, np.nan)
    pool = np.array([])
    mk = P["market"]
    totals = {m: [0., 0., 0] for m in np.unique(mk)}
    for j in range(K):
        if j >= information_lag:
            prior = j - information_lag
            good = P["eligible"][prior] & np.isfinite(z[prior])
            pool = np.sort(np.r_[pool, z[prior, good]])
            for m in totals:
                mask = (mk == m) & np.isfinite(raw_fair[prior]) & good
                totals[m][0] += float(np.clip(-b - P["g"][prior, mask], 0, c).sum())
                totals[m][1] += float(raw_fair[prior, mask].sum())
                totals[m][2] += int(mask.sum())
        if len(pool) < 500:
            continue
        ok = P["eligible"][j] & np.isfinite(sigma[j])
        raw_fair[j, ok] = empirical_fair(pool, sigma[j, ok], b, c)
        for m, (pay, predicted, count) in totals.items():
            credibility = count / (count + 3000)
            factor = credibility * np.clip(pay / predicted, .3, 3) + 1 - credibility if predicted > 0 else 1
            mask = ok & (mk == m)
            fair[j, mask] = np.minimum(c, factor * raw_fair[j, mask])
    fee = np.maximum(markup * fair, CONFIG["min_fee"])
    eligible = P["eligible"] & np.isfinite(fee) & (fee <= max_fee)
    ne = eligible.sum(1)
    weights = np.where(eligible, np.minimum(1 / np.maximum(ne, 1), CONFIG["per_name_weight"])[:, None], 0.)
    for m in np.unique(mk):
        mask = mk == m
        share = weights[:, mask].sum(1)
        weights[:, mask] *= np.minimum(1, CONFIG["per_market_weight"] / np.maximum(share, 1e-12))[:, None]
    payout = np.clip(-b - P["g"], 0, c)
    premium = np.nansum(weights * np.where(eligible, fee, 0), axis=1) / c
    claims = np.nansum(weights * np.where(eligible, payout, 0), axis=1) / c
    return dict(fee=fee, eligible=eligible, weights=weights, premium=premium, claims=claims,
                sold=weights.sum(1), names=ne, b=b, c=c,
                missing_claim_weight=np.sum(weights * eligible * ~P["known"], axis=1))


def demand_variant(P, product, mode):
    if mode == "equal":
        return product
    # These exposures are decided from start volatility, not future crashes.
    eligible = product["eligible"].copy()
    if mode == "single_market":
        eligible &= (P["market"] == "US")[None, :]
    w = np.zeros_like(product["weights"])
    for j in range(len(w)):
        indices = np.flatnonzero(eligible[j])
        if mode == "hot":
            indices = indices[np.argsort(-P["sd"][j, indices])][:20]
        if len(indices):
            w[j, indices] = min(1 / len(indices), CONFIG["per_name_weight"])
    for market in np.unique(P["market"]):
        mask = P["market"] == market
        share = w[:, mask].sum(1)
        w[:, mask] *= np.minimum(1, .25 / np.maximum(share, 1e-12))[:, None]
    c = product["c"]
    pay = np.clip(-product["b"] - P["g"], 0, c)
    return dict(product, weights=w, premium=np.nansum(w * np.where(eligible, product["fee"], 0), axis=1) / c,
                claims=np.nansum(w * np.where(eligible, pay, 0), axis=1) / c,
                sold=w.sum(1), names=(w > 0).sum(1),
                missing_claim_weight=np.sum(w * ~P["known"], axis=1))


def run_account(P, product, bills, curve, issue, maturity, design, utilisation=.25,
                annual_cost=.0025, execution=.05, catastrophe=False, zero_future_yield=False):
    """One deposit, no recapitalisation. One complete nonoverlapping weekly book.

    Principal lives outside insurance cash; fees may exhaust earnings and stop
    issuance, never charge principal. Cost deficits are explicitly reported.
    """
    selected = np.flatnonzero((P["dates"] >= issue) & (P["dates"] + pd.Timedelta(days=7) <= maturity))
    if not len(selected):
        return None, []
    issue = pd.Timestamp(issue); maturity = pd.Timestamp(maturity)
    expense_escrow = 0.
    floor_quote_date = None
    if design == "matched_zero":
        term = (maturity - issue).days / 365.25
        if not 1 <= term <= 30:
            raise ValueError("matched-zero illustration requires a 1-30 year term")
        required = [f"SVENY{t:02d}" for t in set((int(math.floor(term)), int(math.ceil(term))))]
        available = curve.loc[:issue].dropna(subset=required)
        if not len(available):
            return dict(issue=str(issue.date()), maturity=str(maturity.date()), design=design,
                        accepted=False, rejection_reason="missing curve data"), []
        quoted = available.iloc[-1]
        floor_quote_date = available.index[-1]
        tenors = np.arange(1, 31)
        yields = np.array([quoted[f"SVENY{t:02d}"] for t in tenors], dtype=float)
        good = np.isfinite(yields)
        if good.sum() < 2 or term < tenors[good].min() or term > tenors[good].max():
            return None, []
        zero = np.interp(term, tenors[good], yields[good]) / 100
        floor_cost = math.exp(-zero * term)
        floor_execution = .0025
        # Set aside the entire fixed-term operating budget BEFORE underwriting.
        # This money is excluded from claim backing, just like the principal floor.
        expense_escrow = annual_cost * (maturity - issue).days / 365
        reserve = 1 - floor_cost - floor_execution - expense_escrow
        if reserve <= 0:
            return dict(issue=str(issue.date()), maturity=str(maturity.date()), design=design, accepted=False,
                        floor_cost=floor_cost, initial_risk_budget=reserve,
                        prepaid_operating_budget=expense_escrow), []
        receipts = []
    elif design == "realised_interest":
        floor_cost = 1.
        floor_execution = 0.
        reserve = 0.
        receipts = bill_path(bills, issue, maturity, cost_annual=0)
    else:
        raise ValueError(design)
    benchmark = math.prod(1 + x["interest"] for x in bill_path(bills, issue, maturity)) - 1
    receipt_i = 0
    income = premium_total = claims_total = expenses_paid = cost_shortfall = 0.
    cumulative_sold = quoted_weeks = unknown = 0
    max_locked = 0.
    min_reserve = reserve
    initial_reserve = reserve
    initial_expense_escrow = expense_escrow
    path = []
    previous_cost_date = issue
    for j in selected:
        date = P["dates"][j]
        # Interest becomes available only at maturity of an earlier purchase.
        while receipt_i < len(receipts) and receipts[receipt_i]["end"] <= date:
            earned = 0 if zero_future_yield and receipt_i > 0 else receipts[receipt_i]["interest"]
            reserve += earned; income += earned; receipt_i += 1
        cost_date = date + pd.Timedelta(days=7)
        cost = annual_cost * (cost_date - previous_cost_date).days / 365
        previous_cost_date = cost_date
        cost_shortfall += cost
        if design == "matched_zero":
            paid = min(cost_shortfall, expense_escrow)
            expense_escrow -= paid
        else:
            paid = min(cost_shortfall, reserve)
            reserve -= paid
        expenses_paid += paid; cost_shortfall -= paid
        budget = utilisation * reserve
        locked = budget * product["sold"][j]
        assert locked <= reserve + 1e-12
        premium = budget * product["premium"][j]
        payout = locked if catastrophe else budget * product["claims"][j]
        trading_cost = execution * premium
        assert payout <= locked + 1e-10
        # Maximum claims are covered without depending on incoming premiums.
        reserve += premium - payout - trading_cost
        assert reserve >= -1e-10
        premium_total += premium; claims_total += payout; expenses_paid += trading_cost
        cumulative_sold += locked / product["c"]
        quoted_weeks += int(locked > 1e-10)
        unknown += int(budget * product["missing_claim_weight"][j] > 0)
        max_locked = max(max_locked, locked)
        min_reserve = min(min_reserve, reserve)
        path.append(dict(date=str(date.date()), reserve=reserve, premium=premium, payout=payout,
                         locked=locked, notional=locked / product["c"], bill_income=income,
                         principal_maturity_claim=1., costs_paid=expenses_paid, unpaid_costs=cost_shortfall))
    while receipt_i < len(receipts) and receipts[receipt_i]["end"] <= maturity:
        earned = 0 if zero_future_yield and receipt_i > 0 else receipts[receipt_i]["interest"]
        reserve += earned; income += earned; receipt_i += 1
    cost_shortfall += annual_cost * (maturity - previous_cost_date).days / 365
    if design == "matched_zero":
        final_paid = min(cost_shortfall, expense_escrow)
        expense_escrow -= final_paid
    else:
        final_paid = min(cost_shortfall, reserve)
        reserve -= final_paid
    expenses_paid += final_paid; cost_shortfall -= final_paid
    # The principal claim pays 1 only on the explicit asset-performance assumption.
    saver_payout = 1 + reserve + expense_escrow
    wealth = saver_payout - cost_shortfall
    assert math.isclose(reserve + expense_escrow,
                        initial_reserve + initial_expense_escrow + income + premium_total - claims_total - expenses_paid, abs_tol=1e-8)
    result = dict(issue=str(issue.date()), maturity=str(maturity.date()), design=design, accepted=True,
                  utilisation=utilisation, annual_cost=annual_cost, execution_cost=execution,
                  catastrophe=catastrophe, zero_future_yield=zero_future_yield,
                  floor_cost=floor_cost, initial_risk_budget=initial_reserve, bill_income=income,
                  floor_quote_date=str(floor_quote_date.date()) if floor_quote_date is not None else None,
                  prepaid_operating_budget=initial_expense_escrow,
                  premiums=premium_total, claims=claims_total, costs_paid=expenses_paid,
                  external_cost_funding_required=cost_shortfall, saver_maturity=saver_payout,
                  system_wealth_after_unpaid_costs=wealth,
                  saver_apy=saver_payout ** (365.25 / (maturity - issue).days) - 1,
                  benchmark_maturity=1 + benchmark, below_principal=saver_payout < 1 - 1e-9,
                  notional_per_week=cumulative_sold / len(selected),
                  quoted_weeks=quoted_weeks, total_weeks=len(selected),
                  max_claims_locked=max_locked, minimum_risk_cash=min_reserve,
                  weeks_with_unknown_expiry_max_claim=unknown)
    return result, path


def holder_summary(P, product):
    rows = []
    for period, sel in [("development_2005_2015", (P["dates"] >= "2005") & (P["dates"] < "2016")),
                        ("evaluation_2016_2026", P["dates"] >= "2016")]:
        for market in np.unique(P["market"]):
            mask = sel[:, None] & (P["market"] == market)[None, :] & P["eligible"] & P["known"]
            cov = mask & product["eligible"]
            g = P["g"][cov]
            fee = product["fee"][cov]
            pay = np.clip(-product["b"] - g, 0, product["c"])
            if not len(g):
                continue
            rows.append(dict(period=period, market=market, b=product["b"], c=product["c"],
                             observations=len(g), quoted_share=float(cov.sum() / max(mask.sum(), 1)),
                             mean_weekly_fee=float(fee.mean()), mean_weekly_payout=float(pay.mean()),
                             annualised_net_insurance_cost=float((fee - pay).mean() * 52.18),
                             loss_ratio=float(pay.sum() / fee.sum()),
                             worst_stock_week=float(g.min()), worst_protected_week=float((g + pay - fee).min()),
                             p01_stock=float(np.quantile(g, .01)), p01_protected=float(np.quantile(g + pay - fee, .01))))
    return rows


def main():
    dump("config.json", CONFIG)
    bills, curve, floor_summary = rate_research()
    print("RATE_RESEARCH", json.dumps(floor_summary), flush=True)
    P = build_panel()
    print("PANEL", len(P["names"]), "names", len(np.unique(P["market"])), "markets", len(P["dates"]), "weeks", flush=True)
    summaries, holders, sensitivity = [], [], []
    starts = pd.date_range("2005-01-01", CUTOFF - pd.DateOffset(years=3), freq="MS")
    for b, c in CONFIG["products"]:
        print("PRICE", b, c, flush=True)
        product = pricing(P, b, c)
        holders.extend(holder_summary(P, product))
        unit = pd.DataFrame(dict(date=P["dates"], premium_per_capacity=product["premium"],
                                 claims_per_capacity=product["claims"], names=product["names"], sold=product["sold"]))
        unit.to_csv(OUT / f"weekly_product_{b}_{c}.csv", index=False)
        for issue in starts:
            maturity = issue + pd.DateOffset(years=3)
            for design in ("matched_zero", "realised_interest"):
                out, _ = run_account(P, product, bills, curve, issue, maturity, design)
                if out:
                    summaries.append(dict(out, b=b, c=c))
        # Sensitivity alternatives are reported, never ranked to choose a winner.
        for demand in ("equal", "hot", "single_market"):
            prod = demand_variant(P, product, demand)
            for issue in ("2005-01-01", "2007-01-01", "2010-01-01", "2018-01-01", "2022-01-01"):
                for design in ("matched_zero", "realised_interest"):
                    for stress in ("base", "cost_1pct", "all_policies_max_claim", "zero_future_yield", "cost_10bp"):
                        out, path = run_account(P, prod, bills, curve, pd.Timestamp(issue), CUTOFF, design,
                                                annual_cost=.01 if stress == "cost_1pct" else .001 if stress == "cost_10bp" else .0025,
                                                catastrophe=stress == "all_policies_max_claim",
                                                zero_future_yield=stress == "zero_future_yield")
                        if out:
                            sensitivity.append(dict(out, b=b, c=c, demand=demand, stress=stress))
                            if b == .03 and demand == "equal" and issue == "2005-01-01" and stress in ("base", "all_policies_max_claim"):
                                pd.DataFrame(path).to_csv(OUT / f"ledger_{design}_{stress}.csv", index=False)
        print("DONE_PRODUCT", b, c, flush=True)
    cohorts = pd.DataFrame(summaries)
    cohorts.to_csv(OUT / "insurance_cohorts.csv", index=False)
    pd.DataFrame(holders).to_csv(OUT / "holders.csv", index=False)
    pd.DataFrame(sensitivity).to_csv(OUT / "sensitivities.csv", index=False)
    aggregates = []
    for (design, b, c), g in cohorts[cohorts.accepted].groupby(["design", "b", "c"]):
        attempted = cohorts[(cohorts.design == design) & (cohorts.b == b) & (cohorts.c == c)]
        aggregates.append(dict(design=design, b=b, c=c, cohorts=len(g),
                               rejected_cohorts=int((~attempted.accepted).sum()),
                               min_maturity=float(g.saver_maturity.min()), median_maturity=float(g.saver_maturity.median()),
                               min_apy=float(g.saver_apy.min()), median_apy=float(g.saver_apy.median()),
                               below_principal=int(g.below_principal.sum()),
                               share_beating_bills=float((g.saver_maturity > g.benchmark_maturity).mean()),
                               share_needing_external_cost_funding=float((g.external_cost_funding_required > 1e-8).mean()),
                               median_external_cost_funding=float(g.external_cost_funding_required.median()),
                               median_weekly_cover_per_deposit=float(g.notional_per_week.median()),
                               min_weekly_cover_per_deposit=float(g.notional_per_week.min()),
                               median_total_premiums=float(g.premiums.median()), median_total_claims=float(g.claims.median())))
    dump("summary.json", dict(config=CONFIG, names=len(P["names"]), markets=len(np.unique(P["market"])),
                              rate_summary=floor_summary, cohort_summary=aggregates,
                              accepted_cohorts=int(cohorts.accepted.sum()), rejected_cohorts=int((~cohorts.accepted).sum())))
    print("SUMMARY", json.dumps(aggregates), flush=True)


if __name__ == "__main__":
    main()
