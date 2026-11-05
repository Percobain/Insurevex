"""World panel + walk-forward pricing models for the InsureVEX backtest.

A period is bucket-anchored: anchor = last trading day of a bucket (week / 2-week / month) on each market's own
exchange calendar; the period runs anchor(k) close -> anchor(k+1) close and is keyed by its START bucket k, so
markets line up by calendar bucket. Returns are local-currency close-to-close (quanto cover: USD notional).
No lookahead: the model used for start bucket j is fitted on periods with key <= j-2 (one full bucket of lag,
which also removes the few-hour timezone overlap between Asian and US closes)."""
import os, json
import numpy as np, pandas as pd
from scipy.stats import norm

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(HERE, "data")
import sys; sys.path.insert(0, HERE)
from fetch_world import MARKETS

B_GRID = [0.03, 0.05, 0.075, 0.10, 0.15]; C_GRID = [0.10, 0.20, 0.30]
REF_BC = {"M": (0.10, 0.20), "2W": (0.075, 0.20), "W": (0.05, 0.20)}
MAX_FEE = {"M": 0.02, "2W": 0.015, "W": 0.01}
MIN_POOL = 500

def load(t):
    p = os.path.join(DATA, f"{t}.csv")
    if not os.path.exists(p): return None
    s = pd.read_csv(p, index_col=0, parse_dates=True)["Close"].astype(float)
    s = s[~s.index.duplicated()].sort_index()
    return s[s > 0]

# ------------------------------------------------------------------ cleaning
def clean(s):
    """Remove one-day spikes (|r|>60% that reverse the next day) and report counts."""
    r = np.log(s).diff()
    spike = (r.abs() > np.log(1.6)) & (r.shift(-1) * r < 0) & ((r + r.shift(-1)).abs() < 0.2 * r.abs())
    n_spike = int(spike.sum())
    s = s.copy(); s[spike] = np.nan; s = s.ffill()
    stale = (s.diff() == 0).astype(int)
    runs = stale.groupby((stale == 0).cumsum()).cumsum()
    return s, dict(spikes=n_spike, stale_runs_ge15=int((runs == 15).sum()))

def bucket(dates, period):
    d = pd.DatetimeIndex(dates)
    if period == "M": return (d.year * 12 + d.month - 1).values
    mon = (d - pd.to_timedelta(d.weekday, unit="D")).normalize()
    wk = (mon.values.astype("datetime64[D]").astype(np.int64) // 7)
    return wk if period == "W" else wk // 2

def market_calendar(m):
    idx = load(MARKETS[m]["index"])
    if idx is not None and len(idx) > 1000: return idx.index
    best = max((load(t) for t in MARKETS[m]["tickers"]), key=lambda s: 0 if s is None else len(s))
    return best.index

# ------------------------------------------------------------------ panels
def build_world(period, markets=None):
    markets = markets or list(MARKETS)
    rows, cleaning = [], {}
    for m in markets:
        cal = market_calendar(m)
        series = {}
        for t in MARKETS[m]["tickers"] + [MARKETS[m]["index"]]:
            s = load(t)
            if s is None or len(s) < 300: continue
            s, info = clean(s); cleaning[t] = info
            s = s.reindex(cal).ffill(limit=5)
            first = s.first_valid_index()
            if first is None: continue
            cov = s.loc[first:].notna().mean()
            if cov < 0.9: cleaning[t]["dropped_low_coverage"] = float(cov); continue
            series[t] = s
        if not series: continue
        C = pd.DataFrame(series)
        lr = np.log(C).diff()
        sd20 = lr.rolling(20, min_periods=15).std(); sd60 = lr.rolling(60, min_periods=40).std()
        sd252 = lr.rolling(252, min_periods=120).std()
        ewm = np.sqrt((lr ** 2).ewm(alpha=0.06, adjust=False, min_periods=20).mean())
        med = sd20.median(axis=1); lr_med = med.rolling(252, min_periods=60).mean()
        reg = np.sqrt((med / lr_med).clip(0.8, 2.0)).fillna(1.0)
        rv30 = lr.rolling(30, min_periods=20).std() * np.sqrt(252)
        b = bucket(cal, period)
        s_b = pd.Series(cal, index=cal)
        anchors = s_b.groupby(b).last()                 # bucket -> last trading day
        keys = anchors.index.values; A = pd.DatetimeIndex(anchors.values)
        pos = cal.get_indexer(A)
        for k in range(len(A) - 2):                     # drop the final (possibly partial) period
            a0, a1 = A[k], A[k + 1]
            n = pos[k + 1] - pos[k]
            g = (C.loc[a1] / C.loc[a0] - 1).values
            rows.append(dict(key=int(keys[k]), market=m, start=a0, end=a1, n=n, g=g, tick=list(C.columns),
                             sd20=sd20.loc[a0].values, sd60=sd60.loc[a0].values, sd252=sd252.loc[a0].values, ewm=ewm.loc[a0].values,
                             reg=float(reg.loc[a0]), rv30=rv30.loc[a0].values))
    # assemble K x N
    tick = []; mk = []
    for m in markets:
        for r in rows:
            if r["market"] == m:
                for t in r["tick"]:
                    if t not in tick: tick.append(t); mk.append(m)
                break
    col = {t: i for i, t in enumerate(tick)}
    keys = sorted({r["key"] for r in rows}); kix = {k: i for i, k in enumerate(keys)}
    K, N = len(keys), len(tick)
    F = lambda: np.full((K, N), np.nan)
    g, n, sd20, sd60, ewm, reg, rv30, sd252 = F(), F(), F(), F(), F(), F(), F(), F()
    start_m = {}; end_m = {}
    for r in rows:
        i = kix[r["key"]]; c = [col[t] for t in r["tick"]]
        g[i, c] = r["g"]; n[i, c] = r["n"]; sd20[i, c] = r["sd20"]; sd60[i, c] = r["sd60"]; ewm[i, c] = r["ewm"]; sd252[i, c] = r["sd252"]
        reg[i, c] = r["reg"]; rv30[i, c] = r["rv30"]
        start_m[(r["key"], r["market"])] = r["start"]; end_m[(r["key"], r["market"])] = r["end"]
    # representative dates per key: US if present else earliest market
    ks, ke = [], []
    for k in keys:
        if (k, "US") in start_m: ks.append(start_m[(k, "US")]); ke.append(end_m[(k, "US")])
        else:
            ss = [v for (kk, mm), v in start_m.items() if kk == k]; ee = [v for (kk, mm), v in end_m.items() if kk == k]
            ks.append(min(ss)); ke.append(max(ee))
    irx = load("^IRX") / 100
    P = dict(period=period, keys=np.array(keys), K=K, N=N, tickers=tick, mkt=np.array(mk), g=g, n=n,
             start=pd.DatetimeIndex(ks), end=pd.DatetimeIndex(ke), irx=irx.reindex(pd.DatetimeIndex(ks), method="ffill").fillna(0).values,
             sd={"rv20": sd20, "ewma": ewm, "max2060": np.fmax(sd20, sd60), "regime": sd20 * reg,
                 # mean-reverting vol forecast: blend today's EWMA vol with the stock's own 1-year vol
                 "mr30": np.sqrt(0.7 * ewm ** 2 + 0.3 * np.where(np.isfinite(sd252), sd252, ewm) ** 2),
                 "mr50": np.sqrt(0.5 * ewm ** 2 + 0.5 * np.where(np.isfinite(sd252), sd252, ewm) ** 2)}, rv30=rv30,
             cleaning=cleaning)
    P["ok"] = np.isfinite(g) & np.isfinite(sd20) & (sd20 > 0) & np.isfinite(n)
    return P

# ------------------------------------------------------------------ pricing
def _P(Z, cs, k):
    i = np.searchsorted(Z, k); return (i * k - cs[i]) / len(Z)

def price_pooled(P, variant="rv20", scope="global", bcs=None, min_pool=MIN_POOL):
    """Walk-forward pooled vol-scaled engine. scope: 'global' (one pool) or 'market' (per-market pool, falls back
    to global when a market has < min_pool prior obs). Returns {(b,c): K x N fair}."""
    bcs = bcs or [REF_BC[P["period"]]]
    sdp = P["sd"][variant] * np.sqrt(P["n"])
    z = np.where(P["ok"] & np.isfinite(sdp) & (sdp > 0), P["g"] / sdp, np.nan)
    K, N = P["K"], P["N"]; out = {bc: np.full((K, N), np.nan, dtype=np.float32) for bc in bcs}
    mk = P["mkt"]; markets = np.unique(mk)
    pools = {"_g": np.array([])}
    if scope == "market": pools.update({m: np.array([]) for m in markets})
    for j in range(K):
        if j >= 2:
            row = z[j - 2]
            v = row[np.isfinite(row)]
            pools["_g"] = np.sort(np.concatenate([pools["_g"], v]), kind="mergesort")
            if scope == "market":
                for m in markets:
                    vm = row[(mk == m) & np.isfinite(row)]
                    if len(vm): pools[m] = np.sort(np.concatenate([pools[m], vm]), kind="mergesort")
        if len(pools["_g"]) < min_pool: continue
        s = sdp[j]
        groups = [("_g", np.ones(N, bool))] if scope == "global" else \
                 [(m if len(pools[m]) >= min_pool else "_g", mk == m) for m in markets]
        for key, mask in groups:
            Z = pools[key]; cs = np.concatenate([[0.0], np.cumsum(Z)]); sm = s[mask]
            with np.errstate(invalid="ignore", divide="ignore"):
                for (b, c) in bcs:
                    f = sm * (_P(Z, cs, -b / sm) - _P(Z, cs, -(b + c) / sm))
                    out[(b, c)][j, mask] = np.where(P["ok"][j, mask], f, np.nan)
    return out

def credibility(P, fair, bc, k_cred=3000):
    """Hierarchical: global tail shape x market calibration factor, Buhlmann-credibility shrunk to 1, walk-forward."""
    b, c = bc; pay = np.clip(-b - P["g"], 0, c); mk = P["mkt"]; markets = np.unique(mk)
    out = np.full_like(fair, np.nan); sp = {m: 0.0 for m in markets}; sf = {m: 0.0 for m in markets}; nn = {m: 0 for m in markets}
    for j in range(P["K"]):
        if j >= 2:
            f, p_ = fair[j - 2], pay[j - 2]; ok = np.isfinite(f) & np.isfinite(p_)
            for m in markets:
                mm = ok & (mk == m); sp[m] += p_[mm].sum(); sf[m] += f[mm].sum(); nn[m] += int(mm.sum())
        for m in markets:
            mm = mk == m
            if sf[m] > 0:
                Z = nn[m] / (nn[m] + k_cred); fac = Z * np.clip(sp[m] / sf[m], 0.3, 3.0) + (1 - Z)
            else: fac = 1.0
            out[j, mm] = fair[j, mm] * fac
    return out

def price_bs(P, bcs=None, markup_vol=1.2):
    bcs = bcs or [REF_BC[P["period"]]]
    T = P["n"] / 252; r = P["irx"][:, None]; v = np.clip(P["rv30"] * markup_vol, 0.05, None)
    def put(K):
        with np.errstate(invalid="ignore", divide="ignore"):
            d1 = (np.log(1 / K) + (r + 0.5 * v * v) * T) / (v * np.sqrt(T)); d2 = d1 - v * np.sqrt(T)
            return K * np.exp(-r * T) * norm.cdf(-d2) - norm.cdf(-d1)
    return {(b, c): np.where(P["ok"], put(1 - b) - put(1 - b - c), np.nan) for b, c in bcs}

# ------------------------------------------------------------------ scoring
def score(P, fair, bc, start="2005-01-01"):
    b, c = bc; pay = np.clip(-b - P["g"], 0, c)
    sel = (P["start"] >= pd.Timestamp(start))[:, None] & np.isfinite(fair) & np.isfinite(pay) & P["ok"]
    f, p_ = fair[sel], pay[sel]
    yrs = np.broadcast_to(P["start"].year.values[:, None], fair.shape)[sel]
    mk = np.broadcast_to(P["mkt"][None, :], fair.shape)[sel]
    sig = (P["sd"]["rv20"] * np.sqrt(P["n"]))[sel]
    q = pd.qcut(sig, 5, labels=False, duplicates="drop")
    def grp(lbl):
        d = pd.DataFrame({"g": lbl, "f": f, "p": p_}).groupby("g")[["f", "p"]].sum()
        lr = d.p / d.f; w = d.f / d.f.sum()
        return lr, float((w * np.abs(np.log(lr.clip(1e-3)))).sum())
    lr_y, ce_y = grp(yrs); lr_m, ce_m = grp(mk); lr_q, ce_q = grp(q)
    brier_model = float(np.mean((f - p_) ** 2)); brier_naive = float(np.mean((p_.mean() - p_) ** 2))
    return dict(loss_ratio=float(p_.sum() / f.sum()), calib_err_year=ce_y, calib_err_market=ce_m, calib_err_volq=ce_q,
                calib_err_total=(ce_y + ce_m + ce_q) / 3, lr_year_std=float(lr_y.std()),
                lr_volq=[float(x) for x in lr_q.values], skill_vs_naive=1 - brier_model / brier_naive,
                breach_freq_real=float((p_ > 0).mean()), n_obs=int(len(f)),
                lr_by_market={k: float(v) for k, v in lr_m.items()}, lr_by_year={int(k): float(v) for k, v in lr_y.items()})
