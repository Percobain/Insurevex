"""InsureVEX world backtest: model iterations, walk-forward config selection, global vs single-market pools, Savers,
Holders, stress, bootstrap. Reads only the cache from fetch_world.py.
python run_world.py            (full run, ~20-40 min)       outputs: results/*.csv, ../docs/charts/*.png, ../app/public/data/*.json"""
import os, sys, json, pickle, time, warnings
import numpy as np, pandas as pd
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from lib import world as W
from lib import em_engine as E
from fetch_world import MARKETS

RES = os.path.join(HERE, "results"); CH = os.path.join(HERE, "..", "docs", "charts")
JS = os.path.join(HERE, "..", "app", "public", "data"); CACHE = os.path.join(HERE, "data", "_cache")
for d in (RES, CH, JS, CACHE): os.makedirs(d, exist_ok=True)
PERIODS = ["M", "2W", "W"]; PPY = {"M": 12, "2W": 26.09, "W": 52.18}
POOL_START = pd.Timestamp("2001-01-01"); SCORE_START = "2005-01-01"
MARKUPS = [1.2, 1.5, 2.0]; MCAPS = [0.05, 0.10]; MKT_CAP = 0.25
LEVERAGES = {0.075: "R70/u25", 0.125: "R50/u25", 0.15: "R70/u50", 0.25: "R50/u50", 0.35: "R30/u50", 0.5: "R50/u100", 0.7: "R30/u100"}
DD_LIMIT, WORST_YEAR_LIMIT = -0.15, -0.08
HEADLINE_MAX_MARKUP = 1.5   # demand guard: 2.0x is reported but not eligible for the headline (no demand data)
t0 = time.time()
def log(*a): print(f"[{time.time()-t0:6.0f}s]", *a, flush=True)
def jdump(name, obj): json.dump(obj, open(os.path.join(JS, name), "w"), default=lambda o: o.item() if hasattr(o, "item") else str(o))
def r4(x): return None if x is None or (isinstance(x, float) and not np.isfinite(x)) else round(float(x), 4)

# =================================================================== panels + model iterations
def panel(per):
    p = os.path.join(CACHE, f"panel_{per}.pkl")
    if os.path.exists(p): return pickle.load(open(p, "rb"))
    P = W.build_world(per); pickle.dump(P, open(p, "wb")); return P

def models_stage(P):
    per = P["period"]; bc = W.REF_BC[per]; out = {}
    for v in ["rv20", "ewma", "max2060", "regime", "mr30", "mr50"]:
        f = W.price_pooled(P, variant=v, scope="global")[bc]; out[f"global_{v}"] = f
        out[f"hier_{v}"] = W.credibility(P, f, bc)
        log(per, "model", v)
    out["market_rv20"] = W.price_pooled(P, variant="rv20", scope="market")[bc]
    out["bs_rv30x1.0"] = W.price_bs(P, markup_vol=1.0)[bc]; out["bs_rv30x1.2"] = W.price_bs(P, markup_vol=1.2)[bc]
    rows = []
    for name, f in out.items():
        s = W.score(P, f, bc, SCORE_START); s.update(model=name, period=per, b=bc[0], c=bc[1]); rows.append(s)
    return rows

# =================================================================== pool simulation (vectorised, per unit capacity)
def pool_x(P, fair, b, c, markup, m, max_fee, only=None, demand="equal"):
    fee = np.maximum(markup * fair, 1e-4)
    elig = np.isfinite(fair) & P["ok"] & (fee <= max_fee)
    if only is not None: elig &= (P["mkt"] == only)[None, :]
    ne = elig.sum(1)
    w = np.where(elig, np.minimum(1.0 / np.maximum(ne, 1), m)[:, None], 0.0)
    if demand == "hot":                                      # all demand in the 10 most volatile eligible names
        sig = np.where(elig, P["sd"]["rv20"], -1); rank = np.argsort(-sig, axis=1)
        w = np.zeros_like(w); top = rank[:, :int(round(1 / m))]
        np.put_along_axis(w, top, m, axis=1); w = np.where(elig, w, 0)
    if only is None:                                         # no market above MKT_CAP of capacity
        for mk in np.unique(P["mkt"]):
            cols = P["mkt"] == mk; share = w[:, cols].sum(1)
            scale = np.where(share > MKT_CAP, MKT_CAP / np.maximum(share, 1e-12), 1.0); w[:, cols] *= scale[:, None]
    pay = np.clip(-b - P["g"], 0, c)
    prem = np.nansum(w * np.where(elig, fee, 0), 1) / c; payo = np.nansum(w * np.where(elig, pay, 0), 1) / c
    sold = w.sum(1)
    return dict(x=prem - payo, prem=prem, pay=payo, sold=sold, ne=ne, breach=(elig & (pay > 0)).sum(1))

def yield_series(P):
    days = (P["end"] - P["start"]).days.values
    return (1 + P["irx"]) ** (days / 365) - 1

def metrics(uw, y, start, end, ppy):
    uw = np.asarray(uw); y = np.asarray(y)
    if len(uw) == 0: return {}
    yrs = max((end[-1] - start[0]).days / 365.25, 1e-9)
    ui = np.cumprod(1 + uw); ti = np.cumprod(1 + uw + y)
    yr = pd.Series(1 + uw, index=start.year).groupby(level=0).prod() - 1
    dd = lambda x: float((np.r_[1, x] / np.maximum.accumulate(np.r_[1, x]) - 1).min())
    return dict(uw_apy=ui[-1] ** (1 / yrs) - 1, total_apy=ti[-1] ** (1 / yrs) - 1, tbill_apy=np.prod(1 + y) ** (1 / yrs) - 1,
                sharpe=uw.mean() / uw.std() * np.sqrt(ppy) if uw.std() > 0 else np.nan, maxdd=dd(ui), maxdd_total=dd(ti),
                worst_period=float(uw.min()), worst_period_date=str(start[int(np.argmin(uw))].date()),
                worst_year=float(yr.min()), worst_year_label=int(yr.idxmin()), pct_loss_periods=float((uw < 0).mean()),
                years_neg=int((yr < 0).sum()), n_years=len(yr))

# =================================================================== holders
def holder_rows(P, fair, b, c, markup, max_fee, ppy):
    rows = []; sel = P["start"] >= pd.Timestamp(SCORE_START)
    yl = P["start"][sel].year.values
    for i, t in enumerate(P["tickers"]):
        g = P["g"][sel, i]; f = fair[sel, i]; ok = np.isfinite(g)
        if ok.sum() < 3 * ppy: continue
        fee = np.maximum(markup * f, 1e-4); cov = np.isfinite(f) & (fee <= max_fee)
        fee = np.where(cov, fee, 0); pay = np.where(cov, np.clip(-b - g, 0, c), 0)
        g, fee, pay, y_, cov = g[ok], fee[ok], pay[ok], yl[ok], cov[ok]; prot = g - fee + pay
        ce = lambda x: (np.mean((1 + x) ** -3.0)) ** (-1 / 3.0) - 1
        dd = lambda x: float((np.cumprod(1 + x) / np.maximum.accumulate(np.cumprod(1 + x)) - 1).min())
        yu = pd.Series(1 + g).groupby(y_).prod() - 1; yp = pd.Series(1 + prot).groupby(y_).prod() - 1
        rows.append(dict(ticker=t, market=P["mkt"][i], periods=len(g), quoted_share=cov.mean(), annual_cost=fee.mean() * ppy,
                         annual_net_cost=(fee - pay).mean() * ppy, hit_rate=(pay > 0).mean(), worst_unprot=g.min(), worst_prot=prot.min(),
                         worst_year_unprot=yu.min(), worst_year_prot=yp.min(), maxdd_unprot=dd(g), maxdd_prot=dd(prot),
                         ce_gain=(1 + ce(prot)) ** ppy - (1 + ce(g)) ** ppy))
    return pd.DataFrame(rows)

EVENTS = [("^GSPC", "2008-10-10", "Global financial crisis"), ("^GSPC", "2020-03-16", "COVID crash"),
          ("000001.SS", "2015-08-24", "China Black Monday"), ("9988.HK", "2021-07-27", "China tech crackdown"),
          ("0700.HK", "2022-03-15", "Hong Kong tech rout"), ("LLOY.L", "2016-06-24", "Brexit vote"), ("BARC.L", "2016-06-24", "Brexit vote"),
          ("UBSG.SW", "2015-01-15", "SNB drops the franc floor"), ("UBSG.SW", "2023-03-17", "Credit Suisse collapse"),
          ("^N225", "2024-08-05", "Nikkei -12% (yen carry unwind)"), ("8306.T", "2024-08-05", "Nikkei -12% (yen carry unwind)"),
          ("^KS11", "2024-12-04", "Korea martial law"), ("ADANIENT.NS", "2023-01-27", "Hindenburg vs Adani"),
          ("^BVSP", "2017-05-18", "Brazil 'Joesley day'"), ("PETR4.SA", "2020-03-09", "Oil price war"), ("NVDA", "2025-01-27", "DeepSeek"),
          ("^GSPC", "2025-04-04", "Tariff crash"), ("2330.TW", "2025-04-07", "Tariff crash (Taiwan)"), ("BAYN.DE", "2018-08-13", "Bayer Roundup verdict"),
          ("VOW3.DE", "2015-09-21", "VW Dieselgate"), ("BP.L", "2010-06-01", "Deepwater Horizon"), ("NPN.JO", "2021-07-27", "Tencent crackdown via Naspers"),
          ("2222.SR", "2020-03-09", "Oil price war (Aramco)"), ("INDUSINDBK.NS", "2025-03-11", "IndusInd accounting hole"),
          ("^AXJO", "2020-03-16", "COVID crash (Australia)"), ("^GDAXI", "2020-03-16", "COVID crash (Germany)")]

def event_cards(P, fair, b, c, markup, max_fee, label):
    rows = []
    for t, d, why in EVENTS:
        if t not in P["tickers"]: continue
        i = P["tickers"].index(t); d = pd.Timestamp(d)
        js = np.where((P["start"] < d) & (P["end"] >= d))[0]
        js = [j for j in js if np.isfinite(P["g"][j, i])]
        if not js: continue
        j = js[0]; g = P["g"][j, i]; f = fair[j, i]
        fee = max(markup * f, 1e-4) if np.isfinite(f) else np.nan; refused = (not np.isfinite(fee)) or fee > max_fee
        pay = 0.0 if refused else min(max(-b - g, 0), c)
        rows.append(dict(cover=label, event=why, ticker=t, market=P["mkt"][i], start=str(P["start"][j].date()), ret=g,
                         fee=None if refused else fee, payout=pay, unprotected_10k=10000 * g,
                         protected_10k=10000 * (g + (0 if refused else pay - fee)), quoted=not refused))
    return rows

EPISODES = [("9/11 (Sep 2001)", "2001-09-01", "2001-09-30"), ("2002 bear market", "2002-06-01", "2002-10-31"),
            ("Lehman / GFC (Sep-Nov 2008)", "2008-09-01", "2008-11-30"), ("Flash crash (May 2010)", "2010-05-01", "2010-05-31"),
            ("US downgrade (Aug 2011)", "2011-08-01", "2011-08-31"), ("China deval (Aug 2015)", "2015-08-01", "2015-08-31"),
            ("Jan 2016 selloff", "2016-01-01", "2016-02-15"), ("Volmageddon (Feb 2018)", "2018-02-01", "2018-02-28"),
            ("Q4 2018", "2018-10-01", "2018-12-31"), ("COVID (Feb-Mar 2020)", "2020-02-15", "2020-03-31"), ("2022 bear market", "2022-01-01", "2022-12-31"),
            ("SVB / Credit Suisse (Mar 2023)", "2023-03-01", "2023-03-31"), ("Yen carry unwind (Aug 2024)", "2024-08-01", "2024-08-15"),
            ("DeepSeek (Jan 2025)", "2025-01-20", "2025-01-31"), ("Tariff crash (Apr 2025)", "2025-04-01", "2025-04-15")]

# =================================================================== main
def main():
    # ---------- 1. model iterations
    panels = {}
    model_rows = []
    for per in PERIODS:
        P = panel(per); panels[per] = P; log("panel", per, P["K"], "x", P["N"])
        mp = os.path.join(CACHE, f"models_{per}.pkl")
        if os.path.exists(mp): rows = pickle.load(open(mp, "rb"))
        else: rows = models_stage(P); pickle.dump(rows, open(mp, "wb"))
        model_rows += rows
    MD = pd.DataFrame(model_rows)
    MD["lr_dist_from_1"] = (MD.loss_ratio - 1).abs()
    MD["rank_score"] = MD.calib_err_total + 0.5 * MD.lr_dist_from_1
    MD[[c for c in MD.columns if c not in ("lr_by_market", "lr_by_year")]].to_csv(os.path.join(RES, "models.csv"), index=False)
    agg = MD.groupby("model")[["rank_score", "calib_err_total", "loss_ratio", "lr_year_std"]].mean().sort_values("rank_score")
    agg.to_csv(os.path.join(RES, "models_ranked.csv")); log("model ranking\n" + agg.round(3).to_string())
    winner = agg.index[0]
    log("WINNER", winner)
    variant = winner.split("_", 1)[1] if winner.startswith(("global_", "hier_")) else "rv20"
    use_hier = winner.startswith("hier_")

    # ---------- 2. full-grid fair for the winner
    fairs = {}
    for per in PERIODS:
        fp = os.path.join(CACHE, f"fair_{per}_{winner}.pkl")
        if os.path.exists(fp): fairs[per] = pickle.load(open(fp, "rb")); continue
        P = panels[per]; bcs = [(b, c) for b in W.B_GRID for c in W.C_GRID]
        if winner.startswith("bs_"): F = W.price_bs(P, bcs=bcs, markup_vol=float(winner.split("x")[1]))
        elif winner.startswith("market_"): F = W.price_pooled(P, variant="rv20", scope="market", bcs=bcs)
        else:
            F = W.price_pooled(P, variant=variant, scope="global", bcs=bcs)
            if use_hier: F = {bc: W.credibility(P, f, bc).astype(np.float32) for bc, f in F.items()}
        fairs[per] = F; pickle.dump(F, open(fp, "wb")); log("full grid priced", per)

    # ---------- 3. config grid (x per unit capacity), walk-forward selection
    X = {}
    for per in PERIODS:
        P = panels[per]; sel = P["start"] >= POOL_START
        for (b, c), f in fairs[per].items():
            for mu in MARKUPS:
                for m in MCAPS:
                    r = pool_x(P, f, b, c, mu, m, W.MAX_FEE[per])
                    X[(per, b, c, mu, m)] = dict(x=r["x"][sel], prem=r["prem"][sel], pay=r["pay"][sel], ne=r["ne"][sel],
                                                 breach=r["breach"][sel], sold=r["sold"][sel])
        log("grid", per)
    Y = {per: yield_series(panels[per])[panels[per]["start"] >= POOL_START] for per in PERIODS}
    S = {per: panels[per]["start"][panels[per]["start"] >= POOL_START] for per in PERIODS}
    Ed = {per: panels[per]["end"][panels[per]["start"] >= POOL_START] for per in PERIODS}

    # cache metrics by training year cutoff for speed: per config & leverage compute yearly arrays
    def train_metrics(cfg, L, upto_year=None):
        per = cfg[0]; x = X[cfg]["x"]; st = S[per]; en = Ed[per]
        mask = np.ones(len(x), bool) if upto_year is None else (st.year < upto_year)
        if mask.sum() < 12: return None
        return metrics(L * x[mask], Y[per][mask], st[mask], en[mask], PPY[per])
    def pick(upto_year=None, max_markup=HEADLINE_MAX_MARKUP):
        best, best_val, fallback, fb_dd = None, -1e9, None, -1e9
        for cfg in X:
            if cfg[3] > max_markup: continue
            for L in LEVERAGES:
                mt = train_metrics(cfg, L, upto_year)
                if not mt: continue
                ok = mt["maxdd"] >= DD_LIMIT and mt["worst_year"] >= WORST_YEAR_LIMIT
                if ok and mt["uw_apy"] > best_val: best, best_val = (cfg, L, mt), mt["uw_apy"]
                if mt["maxdd"] > fb_dd: fallback, fb_dd = (cfg, L, mt), mt["maxdd"]
        return best or fallback
    # train metrics depend only on years -> precompute candidate list once per year (270x3 configs x 7 L)
    wf_rows, oos = [], []
    for year in range(2004, 2027):
        cfg, L, mt = pick(year)
        per = cfg[0]; st = S[per]; m_ = st.year == year
        uw = L * X[cfg]["x"][m_]; y = Y[per][m_]
        oos.append(pd.DataFrame(dict(start=st[m_], end=Ed[per][m_], uw=uw, y=y, period=per)))
        wf_rows.append(dict(year=year, period=per, b=cfg[1], c=cfg[2], markup=cfg[3], m=cfg[4], leverage=L, sizing=LEVERAGES[L],
                            train_uw_apy=mt["uw_apy"], train_maxdd=mt["maxdd"], train_sharpe=mt["sharpe"],
                            oos_uw=float(np.prod(1 + uw) - 1), oos_total=float(np.prod(1 + uw + y) - 1)))
        log("wf", year, cfg, L, round(wf_rows[-1]["oos_uw"], 4))
    WF = pd.DataFrame(wf_rows); WF.to_csv(os.path.join(RES, "walkforward_selection.csv"), index=False)
    O = pd.concat(oos, ignore_index=True)
    oos_m = metrics(O.uw.values, O.y.values, pd.DatetimeIndex(O.start), pd.DatetimeIndex(O.end), 52.18 if (O.period == "W").mean() > .5 else 12)
    oos_m["sharpe"] = float(np.mean(WF.oos_uw) / np.std(WF.oos_uw)) if np.std(WF.oos_uw) > 0 else None  # annual Sharpe
    full = pick(None); fcfg, fL, fmt = full
    # same walk-forward allowing 2.0x markup (only valid if Holders accept it)
    wf2 = []
    for year in range(2004, 2027):
        cfg2, L2, _ = pick(year, max_markup=2.0); st2 = S[cfg2[0]]; m2 = st2.year == year
        wf2.append(pd.DataFrame(dict(start=st2[m2], end=Ed[cfg2[0]][m2], uw=L2 * X[cfg2]["x"][m2], y=Y[cfg2[0]][m2])))
    O2 = pd.concat(wf2, ignore_index=True)
    oos2 = metrics(O2.uw.values, O2.y.values, pd.DatetimeIndex(O2.start), pd.DatetimeIndex(O2.end), 26.09)
    log("full-sample best", fcfg, fL, fmt["uw_apy"], "OOS", oos_m["uw_apy"])
    # policy B (headline): product terms chosen walk-forward by training Sharpe (leverage-independent, markup <= 1.5,
    # training underwriting APY >= 4% at R50/u50), leverage FIXED by a risk-budget policy, not optimised.
    picks = {}
    for year in range(2004, 2027):
        best, bv = None, -1e9
        for cfg in X:
            if cfg[3] > HEADLINE_MAX_MARKUP: continue
            mt = train_metrics(cfg, 0.25, year)
            if not mt or mt["uw_apy"] < 0.04: continue
            if mt["sharpe"] > bv: best, bv = cfg, mt["sharpe"]
        picks[year] = best
    polB, rowsB = {}, []
    for Lfix in (0.075, 0.125, 0.15, 0.25):
        parts = []
        for year, cfg in picks.items():
            st = S[cfg[0]]; mm = st.year == year
            parts.append(pd.DataFrame(dict(start=st[mm], end=Ed[cfg[0]][mm], uw=Lfix * X[cfg]["x"][mm], y=Y[cfg[0]][mm])))
            if Lfix == 0.125: rowsB.append(dict(year=year, period=cfg[0], b=cfg[1], c=cfg[2], markup=cfg[3], m=cfg[4],
                                               oos_uw_at_R50u25=float(np.prod(1 + 0.125 * X[cfg]["x"][mm]) - 1)))
        OB = pd.concat(parts, ignore_index=True)
        mt = metrics(OB.uw.values, OB.y.values, pd.DatetimeIndex(OB.start), pd.DatetimeIndex(OB.end), 26.09)
        yr = OB.assign(yr=pd.DatetimeIndex(OB.start).year).groupby("yr").uw.apply(lambda s: np.prod(1 + s) - 1)
        mt["sharpe_annual"] = float(yr.mean() / yr.std()); polB[Lfix] = mt
        log("policyB", Lfix, LEVERAGES[Lfix], round(mt["uw_apy"], 4), round(mt["maxdd"], 4))
    pd.DataFrame(rowsB).to_csv(os.path.join(RES, "walkforward_policyB.csv"), index=False)
    pd.DataFrame(polB).T.to_csv(os.path.join(RES, "walkforward_policyB_metrics.csv"))
    okL = [L for L, mt in polB.items() if mt["maxdd"] >= -0.20]
    rL = max(okL) if okL else 0.075
    c_ = picks[2026]; rcfg = c_
    # conservative "demo" config: same product terms at R=50%, u=50%
    per = rcfg[0]; P = panels[per]; f = fairs[per][(rcfg[1], rcfg[2])]
    sel = P["start"] >= POOL_START
    rec_m = metrics(rL * X[rcfg]["x"], Y[per], S[per], Ed[per], PPY[per])
    bs12 = W.price_bs(P, bcs=[(rcfg[1], rcfg[2])], markup_vol=1.2)[(rcfg[1], rcfg[2])]
    feeq = np.maximum(rcfg[3] * f, 1e-4); qmask = np.isfinite(f) & (feeq <= W.MAX_FEE[per]) & np.isfinite(bs12) & (bs12 > 0)
    qmask &= (P["start"] >= pd.Timestamp(SCORE_START))[:, None]
    price_vs_listed_put = float(np.nanmedian(feeq[qmask] / bs12[qmask])); log("fee / BS(rv x1.2) median", price_vs_listed_put)
    base_m = metrics(0.25 * X[rcfg]["x"], Y[per], S[per], Ed[per], PPY[per])
    grid_rows = []
    for cfg in X:
        for L in (0.25, 0.5):
            mt = train_metrics(cfg, L)
            grid_rows.append(dict(period=cfg[0], b=cfg[1], c=cfg[2], markup=cfg[3], m=cfg[4], leverage=L,
                                  loss_ratio=float(X[cfg]["pay"].sum() / X[cfg]["prem"].sum()), **mt))
    G = pd.DataFrame(grid_rows); G.to_csv(os.path.join(RES, "config_grid_full_sample.csv"), index=False)

    # ---------- 4. global vs single-market pools (recommended terms, R50/u50)
    mrows, mser = [], {}
    for mk in sorted(np.unique(P["mkt"])):
        r = pool_x(P, f, rcfg[1], rcfg[2], rcfg[3], max(rcfg[4], 0.10), W.MAX_FEE[per], only=mk)
        x = r["x"][sel]; act = r["ne"][sel] >= 5
        if act.sum() < 24: continue
        mt = metrics(0.25 * x[act], Y[per][act], S[per][act], Ed[per][act], PPY[per])
        mt.update(market=mk, ccy=MARKETS[mk]["ccy"], names=int((P["mkt"] == mk).sum()), first=str(S[per][act][0].date()),
                  loss_ratio=float(r["pay"][sel][act].sum() / r["prem"][sel][act].sum()), avg_quoted=float(r["ne"][sel][act].mean()),
                  worst_payout_pct_nav=float(0.25 * r["pay"][sel][act].max()))
        mrows.append(mt); mser[mk] = pd.Series(0.25 * x, index=S[per]).where(act)
    gx = X[rcfg]; gm = metrics(0.25 * gx["x"], Y[per], S[per], Ed[per], PPY[per])
    gm.update(market="GLOBAL", ccy="USD", names=P["N"], first=str(S[per][0].date()), loss_ratio=float(gx["pay"].sum() / gx["prem"].sum()),
              avg_quoted=float(gx["ne"].mean()), worst_payout_pct_nav=float(0.25 * gx["pay"].max()))
    MK = pd.DataFrame(mrows + [gm]).sort_values("sharpe", ascending=False); MK.to_csv(os.path.join(RES, "markets.csv"), index=False)
    mon = pd.DataFrame(mser).groupby(lambda d: (d.year, d.month)).sum(min_count=1)
    corr = mon.corr(min_periods=36); corr.to_csv(os.path.join(RES, "market_correlation.csv"))
    avg_corr = float(corr.values[np.triu_indices_from(corr.values, 1)][np.isfinite(corr.values[np.triu_indices_from(corr.values, 1)])].mean())
    log("avg pairwise corr", avg_corr)

    # ---------- 5. loss ratio by year, worst periods, episodes, bootstrap (recommended terms, R50/u50 and recommended L)
    gdf = pd.DataFrame(dict(start=S[per], end=Ed[per], x=gx["x"], prem=gx["prem"], pay=gx["pay"], nq=gx["ne"], breach=gx["breach"], y=Y[per]))
    gdf["uw"] = rL * gdf.x
    lry = gdf.assign(yr=gdf.start.dt.year).groupby("yr").agg(prem=("prem", "sum"), pay=("pay", "sum"),
                                                             uw=("uw", lambda s: np.prod(1 + s) - 1), y=("y", lambda s: np.prod(1 + s) - 1))
    lry["loss_ratio"] = lry.pay / lry.prem; lry.to_csv(os.path.join(RES, "loss_ratio_by_year.csv"))
    worst = gdf.assign(payout_pct_nav=rL * gdf.pay).nlargest(12, "payout_pct_nav"); worst.to_csv(os.path.join(RES, "worst_periods.csv"), index=False)
    ep = []
    for name, a, b in EPISODES:
        a, b = pd.Timestamp(a), pd.Timestamp(b); w = gdf[(gdf.end > a) & (gdf.start <= b)]
        if not len(w): continue
        ep.append(dict(episode=name, pool_uw=float(np.prod(1 + w.uw) - 1), worst_period_payout_pct_nav=float(rL * w.pay.max()),
                       breaches=int(w.breach.sum()), names_quoted=float(w["nq"].mean())))
    EP = pd.DataFrame(ep); EP.to_csv(os.path.join(RES, "stress_episodes.csv"), index=False)
    gm_month = gdf.assign(k=gdf.start.dt.to_period("M")).groupby("k").apply(lambda d: np.prod(1 + d.uw + d.y) - 1).values
    rng = np.random.default_rng(7); paths = 10000; H = 60; blk = 12
    dd20 = 0; neg5 = 0; apys = []; yr_neg10 = 0
    for _ in range(paths):
        idx = np.concatenate([np.arange(s, s + blk) % len(gm_month) for s in rng.integers(0, len(gm_month), H // blk)])
        r = gm_month[idx]; nav = np.cumprod(1 + r)
        dd = (nav / np.maximum.accumulate(nav) - 1).min(); dd20 += dd < -0.20; neg5 += nav[-1] < 1
        apys.append(nav[-1] ** (12 / H) - 1); yr_neg10 += (np.prod((1 + r).reshape(-1, 12), 1) - 1 < -0.10).any()
    BOOT = dict(paths=paths, horizon_months=H, block_months=blk, p_drawdown_gt_20=dd20 / paths, p_5y_loss=neg5 / paths,
                p_any_year_below_minus10=yr_neg10 / paths, apy_p5=float(np.percentile(apys, 5)), apy_p50=float(np.percentile(apys, 50)),
                apy_p95=float(np.percentile(apys, 95)), leverage=rL)
    json.dump(BOOT, open(os.path.join(RES, "bootstrap.json"), "w"), indent=1)

    # ---------- 6. savers (USD, zero protocol fee, bid-ask kept), fed by the recommended pool
    E.PROTOCOL_FEE = 0.0
    acwi = E.load("ACWI"); mkt = dict(E.US_MKT); mkt["px"] = dict(E.ASSET_PX, ACWI=acwi)
    mkt["vol"] = dict(E.ASSET_VOL, ACWI=np.log(acwi).diff().rolling(30, min_periods=20).std() * np.sqrt(252) * E.RV_MARKUP)
    sdf = gdf[gdf.start >= pd.Timestamp("2005-01-01")].reset_index(drop=True)
    saver_tables = {}
    for lbl, L in (("recommended", rL), ("R50_u50", 0.25)):
        d = sdf.assign(uw=L * sdf.x)
        sv = E.sim_savers(d, net=True, assets=("SPY", "BTC", "GOLD", "ACWI"), mkt=mkt); ss = E.saver_summary(sv); ss["pool"] = lbl
        saver_tables[lbl] = ss
        for r in (0.04, 0.05):
            s2 = E.saver_summary(E.sim_savers(d, net=True, flat_rate=r, assets=("SPY", "BTC", "ACWI"), mkt=mkt)); s2["pool"] = f"{lbl}_flat{r}"
            saver_tables[f"{lbl}_flat{r}"] = s2
        if lbl == "recommended": sv.to_csv(os.path.join(RES, "saver_notes.csv"), index=False)
    SV = pd.concat(saver_tables.values(), ignore_index=True); SV.to_csv(os.path.join(RES, "saver_summary.csv"), index=False)
    below = int(SV[~SV.variant.isin(["hold_asset"])].below_100.sum()); log("saver notes below 100%:", below)

    # ---------- 7. holders per market + event cards (monthly b10 c20 and weekly b5 c20, markup = recommended)
    mu = rcfg[3]; hold = {}
    for hper, (hb, hc) in (("M", (0.10, 0.20)), ("W", (0.05, 0.20))):
        HT = holder_rows(panels[hper], fairs[hper][(hb, hc)], hb, hc, mu, W.MAX_FEE[hper], PPY[hper])
        HT.to_csv(os.path.join(RES, f"holders_{hper}.csv"), index=False); hold[hper] = HT
    HM = hold["M"].groupby("market")[["quoted_share", "annual_cost", "annual_net_cost", "hit_rate", "ce_gain", "worst_unprot", "worst_prot"]].median()
    HM["share_better_off"] = hold["M"].groupby("market").ce_gain.apply(lambda s: (s > 0).mean()); HM.to_csv(os.path.join(RES, "holders_by_market.csv"))
    cards = event_cards(panels["M"], fairs["M"][(0.10, 0.20)], 0.10, 0.20, mu, W.MAX_FEE["M"], "1 month, pays falls beyond 10%") + \
            event_cards(panels["W"], fairs["W"][(0.05, 0.20)], 0.05, 0.20, mu, W.MAX_FEE["W"], "1 week, pays falls beyond 5%")
    EC = pd.DataFrame(cards); EC.to_csv(os.path.join(RES, "event_cards.csv"), index=False)

    # ---------- 8. data cleaning report
    cl = panels["M"]["cleaning"]; CLN = dict(tickers=len(cl), spikes_removed=int(sum(v.get("spikes", 0) for v in cl.values())),
                                            stale_runs=int(sum(v.get("stale_runs_ge15", 0) for v in cl.values())),
                                            dropped_low_coverage=[k for k, v in cl.items() if "dropped_low_coverage" in v])
    json.dump(CLN, open(os.path.join(RES, "data_cleaning.json"), "w"), indent=1)

    # ---------- 9. JSON for the app + charts
    summary = dict(generated=str(pd.Timestamp.now().date()), markets=len(np.unique(P["mkt"])), names=int(P["N"]),
                   data_range=[str(panels["M"]["start"][0].date()), str(panels["M"]["end"][-1].date())], pool_start=str(POOL_START.date()),
                   winner_model=winner, recommended=dict(period=rcfg[0], b=rcfg[1], c=rcfg[2], markup=rcfg[3], m=rcfg[4], leverage=rL, sizing=LEVERAGES[rL]),
                   recommended_metrics={k: r4(v) if isinstance(v, float) else v for k, v in rec_m.items()},
                   r50u50_metrics={k: r4(v) if isinstance(v, float) else v for k, v in base_m.items()},
                   walkforward_oos={k: r4(v) if isinstance(v, float) else v for k, v in oos_m.items()},
                   walkforward_policyB={str(L): {k: r4(v) if isinstance(v, float) else v for k, v in mt.items()} for L, mt in polB.items()},
                   full_sample_best=dict(period=fcfg[0], b=fcfg[1], c=fcfg[2], markup=fcfg[3], m=fcfg[4], leverage=fL,
                                         **{k: r4(v) if isinstance(v, float) else v for k, v in fmt.items()}),
                   avg_market_correlation=r4(avg_corr), price_vs_listed_put_proxy=r4(price_vs_listed_put),
                   walkforward_oos_markup2={k: r4(v) if isinstance(v, float) else v for k, v in oos2.items()}, bootstrap=BOOT, saver_rows_below_100=below, cleaning=CLN)
    jdump("global_summary.json", summary)
    jdump("markets.json", [{k: (r4(v) if isinstance(v, float) else v) for k, v in r.items()} for r in MK.to_dict("records")])
    jdump("models.json", [{k: (r4(v) if isinstance(v, float) else v) for k, v in r.items() if k not in ("lr_by_market", "lr_by_year")}
                          | {"lr_by_year": r.get("lr_by_year")} for r in MD.to_dict("records")])
    jdump("configs.json", dict(policyB=[{k: (r4(v) if isinstance(v, float) else v) for k, v in r.items()} for r in rowsB],
                               policyB_metrics=summary["walkforward_policyB"], walkforward=[{k: (r4(v) if isinstance(v, float) else v) for k, v in r.items()} for r in WF.to_dict("records")],
                               full_sample_best=summary["full_sample_best"], oos=summary["walkforward_oos"],
                               top_full_sample=[{k: (r4(v) if isinstance(v, float) else v) for k, v in r.items()}
                                                for r in G[(G.maxdd >= DD_LIMIT)].sort_values("uw_apy", ascending=False).head(15).to_dict("records")]))
    jdump("saver.json", [{k: (r4(v) if isinstance(v, float) else v) for k, v in r.items()} for r in SV.to_dict("records")])
    jdump("holders.json", dict(by_market=[dict(market=i, **{k: r4(v) for k, v in r.items()}) for i, r in HM.iterrows()],
                               events=[{k: (r4(v) if isinstance(v, float) else v) for k, v in r.items()} for r in EC.to_dict("records")]))
    jdump("stress.json", dict(episodes=[{k: (r4(v) if isinstance(v, float) else v) for k, v in r.items()} for r in EP.to_dict("records")],
                              worst_periods=[dict(start=str(r.start.date()), payout_pct_nav=r4(r.payout_pct_nav), uw=r4(r.uw), breaches=int(r.breach),
                                                  quoted=int(r.nq)) for r in worst.itertuples()], bootstrap=BOOT,
                              correlation=dict(markets=list(corr.columns), matrix=[[r4(v) for v in row] for row in corr.values]), avg_corr=r4(avg_corr)))
    eq = pd.DataFrame({"GLOBAL": pd.Series(np.cumprod(1 + rL * gx["x"] + Y[per]), index=S[per])})
    top = MK[MK.market != "GLOBAL"].head(6).market.tolist() + [m for m in ("US", "India") if m not in MK.head(6).market.tolist()]
    for mk in top:
        s = mser[mk].fillna(0) / 0.25 * rL; eq[mk] = np.cumprod(1 + s + Y[per])
    eq["TBILLS"] = np.cumprod(1 + Y[per]); eqm = eq.groupby(lambda d: (d.year, d.month)).last()
    jdump("equity_curve.json", dict(dates=[f"{a}-{b:02d}" for a, b in eqm.index], series={c: [r4(v) for v in eqm[c].values] for c in eqm.columns}))
    jdump("loss_ratio_by_year.json", [dict(year=int(i), loss_ratio=r4(r.loss_ratio), uw=r4(r.uw), tbill=r4(r.y)) for i, r in lry.iterrows()])
    charts(eqm, MK, lry, MD, SV, HM, WF)
    charts2(SV, HM, polB)
    log("DONE")

INK, INK2, GRID = "#0b0b0b", "#52514e", "#e4e3df"
PAL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"]
def style(ax, title):
    ax.set_title(title, loc="left", fontsize=11, color=INK); ax.grid(axis="y", color=GRID, lw=0.8); ax.set_axisbelow(True)
    for s in ("top", "right"): ax.spines[s].set_visible(False)
    for s in ("left", "bottom"): ax.spines[s].set_color(GRID)
    ax.tick_params(colors=INK2, labelsize=8)

def charts(eqm, MK, lry, MD, SV, HM, WF):
    pct = matplotlib.ticker.PercentFormatter(1)
    fig, ax = plt.subplots(figsize=(10, 4.8)); x = np.arange(len(eqm))
    for i, c in enumerate([c for c in eqm.columns if c not in ("TBILLS",)][:8]):
        ax.plot(x, eqm[c].values, color=PAL[i % 8], lw=2.2 if c == "GLOBAL" else 1.2, label=c)
    ax.plot(x, eqm["TBILLS"].values, color=INK2, lw=1, ls="--", label="T-bills only")
    ax.set_xticks(x[::24]); ax.set_xticklabels([f"{a}" for a, _ in eqm.index[::24]])
    style(ax, "Pool NAV, growth of $1 (recommended config): global vs single-market pools"); ax.legend(fontsize=7, frameon=False, ncol=3)
    fig.tight_layout(); fig.savefig(os.path.join(CH, "world_equity.png"), dpi=130); plt.close(fig)
    m = MK.sort_values("uw_apy"); fig, ax = plt.subplots(1, 2, figsize=(11, 6.5), sharey=True)
    cols = [PAL[0] if k == "GLOBAL" else "#9aa3ad" for k in m.market]
    ax[0].barh(m.market, m.uw_apy, color=cols); ax[0].xaxis.set_major_formatter(pct); style(ax[0], "Underwriting APY over T-bills (R50/u50)")
    ax[1].barh(m.market, m.maxdd, color=[PAL[7] if k != "GLOBAL" else PAL[0] for k in m.market]); ax[1].xaxis.set_major_formatter(pct)
    style(ax[1], "Max drawdown")
    fig.tight_layout(); fig.savefig(os.path.join(CH, "world_markets.png"), dpi=130); plt.close(fig)
    fig, ax = plt.subplots(figsize=(10, 3.6)); lr = lry.loss_ratio.clip(upper=3)
    ax.bar(lr.index, lr.values, color=[PAL[7] if v > 1 else PAL[0] for v in lr.values]); style(ax, "Global pool loss ratio by year (payouts / premiums; red = losing year)")
    fig.tight_layout(); fig.savefig(os.path.join(CH, "world_loss_ratio.png"), dpi=130); plt.close(fig)
    md = MD[MD.period == "M"].sort_values("rank_score"); fig, ax = plt.subplots(figsize=(10, 4))
    for i, r in enumerate(md.head(6).itertuples()):
        ax.plot(range(1, len(r.lr_volq) + 1), r.lr_volq, marker="o", color=PAL[i], lw=1.6, label=r.model)
    ax.axhline(1, color=INK2, lw=1, ls="--"); ax.set_xlabel("volatility quintile (1 = calmest)", fontsize=8)
    style(ax, "Calibration: realised payout / model fair value by vol quintile (1.0 = perfect), monthly"); ax.legend(fontsize=7, frameon=False)
    fig.tight_layout(); fig.savefig(os.path.join(CH, "world_model_calibration.png"), dpi=130); plt.close(fig)

def charts2(SV, HM, polB):
    pct = matplotlib.ticker.PercentFormatter(1)
    d = SV[(SV.pool == "recommended_flat0.04") & (SV.asset == "SPY")].pivot_table(index="T", columns="variant", values="apy_median")
    fig, ax = plt.subplots(figsize=(9, 4)); x = np.arange(len(d.index)); w = 0.2
    for i, (v, lbl) in enumerate([("tbill", "T-bills"), ("income", "Income note"), ("split", "50/50 split (SPY calls)"), ("ppn_call", "Plain PPN (SPY calls)")]):
        ax.bar(x + (i - 1.5) * w, d[v].values, w * 0.92, color=[INK2, PAL[0], PAL[2], PAL[3]][i], label=lbl)
    ax.set_xticks(x); ax.set_xticklabels([f"{t}-year note" for t in d.index]); ax.yaxis.set_major_formatter(pct)
    style(ax, "Saver median APY at a flat 4% rate (principal 100% protected in every one of the notes)"); ax.legend(fontsize=8, frameon=False)
    fig.tight_layout(); fig.savefig(os.path.join(CH, "world_savers.png"), dpi=130); plt.close(fig)
    h = HM.sort_values("worst_unprot"); fig, ax = plt.subplots(figsize=(10, 4.4)); x = np.arange(len(h))
    ax.bar(x - 0.2, h.worst_unprot, 0.38, color=PAL[7], label="Worst month, unprotected (median name)")
    ax.bar(x + 0.2, h.worst_prot, 0.38, color=PAL[0], label="With a 1-month floor (pays falls beyond 10%)")
    ax.set_xticks(x); ax.set_xticklabels(h.index if "market" not in h.columns else h.market, rotation=45, fontsize=8); ax.yaxis.set_major_formatter(pct)
    style(ax, "Holders: worst month per market, median stock, 2005-2026"); ax.legend(fontsize=8, frameon=False)
    fig.tight_layout(); fig.savefig(os.path.join(CH, "world_holders.png"), dpi=130); plt.close(fig)
    fig, ax = plt.subplots(figsize=(7, 4))
    for L, mt in polB.items():
        ax.scatter(-mt["maxdd"], mt["uw_apy"], s=60, color=PAL[0]); ax.annotate(LEVERAGES[L], (-mt["maxdd"], mt["uw_apy"]), fontsize=8, xytext=(5, 3), textcoords="offset points")
    ax.xaxis.set_major_formatter(pct); ax.yaxis.set_major_formatter(pct); ax.set_xlabel("max drawdown (out of sample)", fontsize=8)
    style(ax, "Risk budget: out-of-sample APY over T-bills vs drawdown, 2004-2026")
    fig.tight_layout(); fig.savefig(os.path.join(CH, "world_frontier.png"), dpi=130); plt.close(fig)

if __name__ == "__main__":
    main()
