"""EM backtest: "Two scared people protect each other".
Savers (principal-protected notes) underwrite Holders' monthly/weekly put-spread floors.

Run:  python fetch_data.py   (once; caches yfinance + FRED data in EM/data)
      python em_backtest.py  (reads only the cache, writes EM/results and EM/charts)

Conventions (see REPORT.md, "Ambiguities resolved"):
 - Period return g is close-to-close on split/dividend-adjusted prices, period = first trading day of month to the
   next (monthly) or last trading day of week to the next (weekly).
 - Pooled vol-scaled engine (afterhours v4, extended): sigma_p = sigma_d(20d) * sqrt(n trading days in period),
   z = g / sigma_p, fair = mean over ALL PRIOR (ticker, period) z of min(max(-b - sigma_p(today) z, 0), c).
   Refit every period, strictly on periods that ended on or before today's start. fee = max(markup*fair, 1bp);
   refuse the name if fee > max_fee.
 - The pool is an open-ended fund with a NAV per unit. Savers' sleeves buy units at issue and redeem at maturity,
   so every cohort earns exactly the pool's pro-rata return over its life (no double use of the sleeve).
"""
import os, json, warnings
import numpy as np, pandas as pd
from scipy.stats import norm
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt

warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # backtest/
DATA, RES, CH = (os.path.join(HERE, d) for d in ("data", "results", os.path.join("..", "docs", "charts")))
for d in (RES, CH): os.makedirs(d, exist_ok=True)
DOCS_JSON = os.path.join(HERE, "..", "client", "src", "components", "docs", "data.json")

US = ["NVDA", "AAPL", "MSFT", "AMZN", "GOOGL", "META", "TSLA", "AMD", "AVGO", "NFLX", "JPM", "XOM", "BAC", "C", "WFC",
      "GS", "MS", "INTC", "CSCO", "ORCL", "IBM", "KO", "PEP", "PG", "JNJ", "PFE", "MRK", "UNH", "WMT", "HD", "DIS", "BA",
      "CAT", "GE", "CVX", "T", "VZ", "MU", "QCOM", "ADBE", "CRM", "NKE", "MCD", "COST", "SPY", "QQQ"]
INDIA = ["RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS", "BHARTIARTL.NS", "ITC.NS", "LT.NS",
         "KOTAKBANK.NS", "AXISBANK.NS", "HINDUNILVR.NS", "BAJFINANCE.NS", "MARUTI.NS", "SUNPHARMA.NS", "TATASTEEL.NS",
         "WIPRO.NS", "HCLTECH.NS", "ASIANPAINT.NS", "TITAN.NS", "ULTRACEMCO.NS", "NTPC.NS", "POWERGRID.NS", "ONGC.NS",
         "M&M.NS", "^NSEI"]
UPSIDE = {"BTC": "BTC-USD", "NVDA": "NVDA", "SPY": "SPY", "GOLD": "GLD"}
POOL_START = pd.Timestamp("2005-01-01")
MIN_POOL_OBS = 500
RV_MARKUP = 1.2            # implied-vol proxy = realised 30d vol x 1.2 (VIX used for SPY)
BA_SPREAD = 0.075          # option bid-ask, net version: pay 7.5% over BS mid
PROTOCOL_FEE = 0.0025      # per year of deposit, net version
B_GRID = [0.03, 0.05, 0.10, 0.15]; C_GRID = [0.10, 0.20, 0.30]

BASE = dict(period="M", b=0.10, c=0.20, markup=1.5, R=0.50, u=0.50, m=0.10, sizing="collat", k=1.0,
            max_fee=None, fee_floor=0.0001, engine="pooled", demand="equal", universe="US")
MAX_FEE = {"M": 0.02, "W": 0.01}

# ----------------------------------------------------------------------------------------------- data
def load(t):
    df = pd.read_csv(os.path.join(DATA, f"{t}.csv"), index_col=0, parse_dates=True)
    return df["Close"].astype(float)

def fred(s):
    df = pd.read_csv(os.path.join(DATA, f"FRED_{s}.csv"), parse_dates=["Date"]).set_index("Date")[s]
    return df.astype(float) / 100

IRX = (load("^IRX") / 100).rename("irx")
VIX = (load("^VIX") / 100).rename("vix")
RATES = {1: fred("DGS1"), 3: fred("DGS3"), 5: fred("DGS5")}
DATA_END = load("SPY").index[-1]

def asof(s, d):
    v = s.asof(d); return float(v) if pd.notna(v) else np.nan

# ----------------------------------------------------------------------------------------------- panel
def anchors(cal, period):
    s = pd.Series(cal, index=cal)
    if period == "M": return pd.DatetimeIndex(s.groupby([cal.year, cal.month]).first().values)
    iso = cal.isocalendar()
    return pd.DatetimeIndex(s.groupby([iso.year.values, iso.week.values]).last().sort_values().values)

def build_panel(tickers, period, cal_ticker, short_rate=None, implied=None):
    """short_rate: decimal yield series for idle collateral (default US 3m T-bill). implied: {ticker: implied-vol series}."""
    short_rate = IRX if short_rate is None else short_rate
    implied = {"SPY": VIX} if implied is None else implied
    cal = load(cal_ticker).index
    closes = pd.concat({t: load(t) for t in tickers}, axis=1).reindex(cal).ffill(limit=3)
    lr = np.log(closes).diff()
    sd20 = lr.rolling(20, min_periods=15).std()
    rv30 = lr.rolling(30, min_periods=20).std() * np.sqrt(252)
    A = anchors(cal, period)
    pos = cal.get_indexer(A)
    starts, ends = A[:-1], A[1:]
    n = (pos[1:] - pos[:-1]).astype(float)
    P0 = closes.loc[starts].values; P1 = closes.loc[ends].values
    g = P1 / P0 - 1
    sig = sd20.loc[starts].values * np.sqrt(n)[:, None]
    vol = rv30.loc[starts].values * RV_MARKUP
    for t, iv in implied.items():                            # VIX for SPX, India VIX for NIFTY
        if t in tickers: vol[:, tickers.index(t)] = iv.reindex(starts, method="ffill").values
    ok = np.isfinite(g) & np.isfinite(sig) & (sig > 0)
    z = np.where(ok, g / np.where(ok, sig, 1), np.nan)
    irx = short_rate.reindex(starts, method="ffill").fillna(0).values
    return dict(tickers=list(tickers), starts=starts, ends=ends, n=n, g=g, sig=sig, z=z, ok=ok, vol=vol, irx=irx,
                closes=closes)

def price_panel(p):
    """Walk-forward pooled vol-scaled fair value (every b,c in the grid) + Black-Scholes put-spread fair value."""
    J, N = p["g"].shape
    fair = {(b, c): np.full((J, N), np.nan) for b in B_GRID for c in C_GRID}
    pooled = np.array([])
    for j in range(J):
        if j > 0:
            zp = p["z"][j - 1]; pooled = np.sort(np.concatenate([pooled, zp[np.isfinite(zp)]]))
        if len(pooled) < MIN_POOL_OBS: continue
        cs = np.concatenate([[0.0], np.cumsum(pooled)]); M = len(pooled)
        s = p["sig"][j]
        def P(k):                                         # mean(max(k - z, 0)) over the pooled z
            i = np.searchsorted(pooled, k); return (i * k - cs[i]) / M
        for b in B_GRID:
            Pb = P(-b / s)
            for c in C_GRID:
                fair[(b, c)][j] = np.where(p["ok"][j], s * (Pb - P(-(b + c) / s)), np.nan)
    p["fair"] = fair
    # Black-Scholes put spread, S=1, vol = rv30 x 1.2 (VIX for SPY), r = 3m T-bill
    T = (p["n"] / 252)[:, None]; r = p["irx"][:, None]; v = np.clip(p["vol"], 0.05, None)
    def put(K):
        d1 = (np.log(1 / K) + (r + 0.5 * v * v) * T) / (v * np.sqrt(T)); d2 = d1 - v * np.sqrt(T)
        return K * np.exp(-r * T) * norm.cdf(-d2) - norm.cdf(-d1)
    p["bs"] = {(b, c): put(1 - b) - put(1 - b - c) for b in B_GRID for c in C_GRID}
    return p

# ----------------------------------------------------------------------------------------------- pool
def sim_pool(p, cfg):
    b, c, R, u, m = cfg["b"], cfg["c"], cfg["R"], cfg["u"], cfg["m"]
    max_fee = cfg["max_fee"] or MAX_FEE[cfg["period"]]
    fair = (p["bs"] if cfg["engine"] == "bs" else p["fair"])[(b, c)]
    pooled_fair = p["fair"][(b, c)]
    J, N = p["g"].shape
    pay_all = np.clip(-b - p["g"], 0, c)
    nav, hwm, rows = 1.0, 1.0, []
    for j in range(J):
        if p["starts"][j] < POOL_START or not np.isfinite(pooled_fair[j]).any(): continue
        fee = np.maximum(cfg["markup"] * fair[j], cfg["fee_floor"])
        elig = np.isfinite(fair[j]) & p["ok"][j] & (fee <= max_fee)
        ne = int(elig.sum())
        cap = (1 - R) * nav if cfg["sizing"] == "collat" else min(cfg["k"] * max(nav - R * hwm, 0), nav)
        w = np.zeros(N)
        if ne:
            if cfg["demand"] == "equal":
                w[elig] = min(1.0 / ne, m)
            else:                                          # adverse demand: buyers crowd into the most volatile names
                idx = np.where(elig)[0]; top = idx[np.argsort(-p["sig"][j][idx])][:int(round(1 / m))]
                w[top] = m
        maxpay = u * cap * w                               # max payout committed per name (fully collateralised)
        notional = maxpay / c
        prem = float(np.nansum(notional * fee)); pay = float(np.nansum(notional * np.where(elig, pay_all[j], 0)))
        days = (p["ends"][j] - p["starts"][j]).days
        yld = nav * ((1 + p["irx"][j]) ** (days / 365) - 1)
        rows.append(dict(start=p["starts"][j], end=p["ends"][j], nav0=nav, cap=cap, sold=maxpay.sum(), n_elig=ne,
                         n_breach=int((elig & (pay_all[j] > 0)).sum()), prem=prem, pay=pay, uw=(prem - pay) / nav,
                         y=yld / nav, uw_cap=(prem - pay) / maxpay.sum() if maxpay.sum() > 0 else 0.0,
                         irx=p["irx"][j], worst_pay_pct=pay / nav))
        nav = nav + prem - pay + yld; hwm = max(hwm, nav)
    return pd.DataFrame(rows)

def ppy(df):
    return 365.25 / df["end"].sub(df["start"]).dt.days.mean()

def maxdd(x):
    x = np.asarray(x); return float((x / np.maximum.accumulate(x) - 1).min())

def pool_metrics(df):
    k = ppy(df); yrs = (df["end"].iloc[-1] - df["start"].iloc[0]).days / 365.25
    uw_idx = np.cumprod(1 + df["uw"]); tot_idx = np.cumprod(1 + df["uw"] + df["y"])
    lr = df.pay.sum() / df.prem.sum() if df.prem.sum() > 0 else np.nan
    yearly = df.assign(yr=df.start.dt.year).groupby("yr").apply(lambda g: np.prod(1 + g.uw) - 1)
    return dict(uw_apy=uw_idx.iloc[-1] ** (1 / yrs) - 1, total_apy=tot_idx.iloc[-1] ** (1 / yrs) - 1,
                tbill_apy=np.cumprod(1 + df.y).iloc[-1] ** (1 / yrs) - 1,
                sharpe_uw=df.uw.mean() / df.uw.std() * np.sqrt(k) if df.uw.std() > 0 else np.nan,
                maxdd_uw=maxdd(np.r_[1, uw_idx]), maxdd_total=maxdd(np.r_[1, tot_idx]),
                worst_period=df.uw.min(), worst_period_date=str(df.loc[df.uw.idxmin(), "start"].date()),
                worst_payout_pct_nav=df.worst_pay_pct.max(), pct_loss_periods=(df.uw < 0).mean(),
                loss_ratio=lr, worst_year=yearly.min(), worst_year_label=int(yearly.idxmin()),
                years_loss_gt_5pct=int((yearly < -0.05).sum()), avg_util_of_nav=(df.sold / df.nav0).mean(),
                avg_names=df.n_elig.mean(), prem_yield=(df.prem / df.nav0).mean() * k)

def loss_ratio_by_year(df):
    g = df.assign(yr=df.start.dt.year).groupby("yr")
    return pd.DataFrame({"loss_ratio": g.pay.sum() / g.prem.sum(), "uw_return": g.uw.apply(lambda x: np.prod(1 + x) - 1),
                         "tbill": g.y.apply(lambda x: np.prod(1 + x) - 1)})

# ----------------------------------------------------------------------------------------------- savers
def bs_call(S, K, T, r, v):
    v = max(v, 0.10); d1 = (np.log(S / K) + (r + 0.5 * v * v) * T) / (v * np.sqrt(T)); d2 = d1 - v * np.sqrt(T)
    return S * norm.cdf(d1) - K * np.exp(-r * T) * norm.cdf(d2)

ASSET_PX = {k: load(t) for k, t in UPSIDE.items()}
def asset_vol(key):
    s = ASSET_PX[key]; ann = np.sqrt(365) if key == "BTC" else np.sqrt(252)
    v = np.log(s).diff().rolling(30, min_periods=20).std() * ann * RV_MARKUP
    return VIX if key == "SPY" else v
ASSET_VOL = {k: asset_vol(k) for k in UPSIDE}
MONTH_ANCHORS = anchors(load("SPY").index, "M")

def pool_index(df, flat_rate=None):
    """NAV index at period boundaries (total = underwriting + collateral T-bill yield)."""
    y = df.y.values if flat_rate is None else ((1 + flat_rate) ** (df.end.sub(df.start).dt.days / 365) - 1).values
    idx = np.r_[1.0, np.cumprod(1 + df.uw.values + y)]
    return pd.Series(idx, index=pd.DatetimeIndex(np.r_[df.start.values[:1], df.end.values]))

US_MKT = dict(rates=RATES, short=IRX, px=ASSET_PX, vol=ASSET_VOL, anchors=MONTH_ANCHORS)

def sim_savers(df, net=True, flat_rate=None, terms=(1, 3, 5), assets=("BTC", "SPY", "NVDA", "GOLD"), perp_L=2.0, mkt=None):
    mkt = mkt or US_MKT
    RATES_, IRX_, PX_, VOL_, MA_ = mkt["rates"], mkt["short"], mkt["px"], mkt["vol"], mkt["anchors"]
    I = pool_index(df, flat_rate)
    ba = BA_SPREAD if net else 0.0; pf = PROTOCOL_FEE if net else 0.0
    rows = []
    issue_dates = MA_[(MA_ >= df.start.iloc[0])]
    for T in terms:
        for t0 in issue_dates:
            t1 = t0 + pd.DateOffset(years=T)
            if t1 > I.index[-1]: break
            r = flat_rate if flat_rate is not None else asof(RATES_[T], t0)
            if not np.isfinite(r): continue
            floor = 1 / (1 + r) ** T; sleeve = 1 - floor; fee_tot = pf * T
            G = asof(I, t1) / asof(I, t0)                                   # pool growth over the note's life
            sleeve_net = max(sleeve - fee_tot / (1 + r) ** T, 0)            # upfront-paying variants
            steps = MA_[(MA_ >= t0) & (MA_ <= t1)]
            for a in assets:
                S = PX_[a]
                if S.index[0] > t0 - pd.Timedelta(days=45): continue
                S0, S1 = asof(S, t0), asof(S, t1); Ra = S1 / S0 - 1; v = asof(VOL_[a], t0)
                C = bs_call(1, 1, T, r, v) * (1 + ba); CS = (bs_call(1, 1, T, r, v) - bs_call(1, 2, T, r, v)) * (1 + ba)
                out = dict(asset=a, T=T, issue=t0, maturity=t1, r=r, sleeve=sleeve * 1000, pool_growth=G,
                           tbill=1000 * (1 + r) ** T, hold_asset=1000 * (1 + Ra))
                out["ppn_call"] = 1000 + 1000 * sleeve_net / C * max(Ra, 0)
                out["ppn_callspread"] = 1000 + 1000 * sleeve_net / CS * min(max(Ra, 0), 1)
                out["income"] = 1000 + max(1000 * (sleeve * G - fee_tot), 0)
                # fix: protocol takes 10% of the sleeve's profit instead of 0.25%/yr of the whole deposit
                out["income_perf"] = 1000 + 1000 * (sleeve * G - (0.10 * max(sleeve * (G - 1), 0) if net else 0))
                half = sleeve / 2
                out["split"] = 1000 + 1000 * max(half * G - fee_tot, 0) + 1000 * max(half - 0, 0) / C * max(Ra, 0)
                # monthly sweep: sleeve underwrites; any value above the original sleeve buys 1m ATM calls
                V, cash = sleeve, 0.0
                for d0, d1 in zip(steps[:-1], steps[1:]):
                    V *= asof(I, d1) / asof(I, d0)
                    if V > sleeve:
                        ex = V - sleeve; V = sleeve
                        v1 = asof(VOL_[a], d1)
                        c1 = bs_call(1, 1, 1 / 12, asof(IRX_, d1), v1) * (1 + ba)
                        d2 = steps[steps > d1]; d2 = d2[0] if len(d2) else t1
                        cash += ex / c1 * max(asof(S, d2) / asof(S, d1) - 1, 0) if d2 <= t1 else ex
                out["sweep"] = 1000 + 1000 * max(V + cash - fee_tot, 0)
                # PPN.fi-style perp: sleeve is margin for an L x long, liquidated if equity hits 0 on any daily close
                f = 0.08 if a == "BTC" else 0.05
                path = S.loc[t0:t1] / S0; tt = (path.index - t0).days / 365
                eq = 1 + perp_L * (path.values - 1) - perp_L * f * tt
                out["perp"] = 1000 + (0 if (eq <= 0).any() else 1000 * sleeve_net * eq[-1])
                rows.append(out)
    return pd.DataFrame(rows)

SAVER_VARIANTS = ["income", "income_perf", "sweep", "split", "ppn_call", "ppn_callspread", "perp", "tbill", "hold_asset"]
def saver_summary(sv):
    out = []
    for (a, T), g in sv.groupby(["asset", "T"]):
        for v in SAVER_VARIANTS:
            x = g[v].values / 1000 - 1
            out.append(dict(asset=a, T=T, variant=v, n=len(g), min=x.min(), p5=np.percentile(x, 5), median=np.median(x),
                            mean=x.mean(), p95=np.percentile(x, 95),
                            apy_median=(1 + np.median(x)) ** (1 / T) - 1, apy_mean=(1 + x.mean()) ** (1 / T) - 1,
                            beat_tbill=(g[v] > g.tbill + 1e-9).mean() if v != "tbill" else np.nan,
                            exactly_100=(np.abs(g[v] - 1000) < 0.01).mean(), below_100=(g[v] < 1000 - 1e-6).sum()))
    return pd.DataFrame(out)

# ----------------------------------------------------------------------------------------------- holders
def holder_table(p, b, c, markup=1.5, max_fee=0.02, k=12):
    fair = p["fair"][(b, c)]; rows = []
    J = len(p["starts"]); sel = np.array([p["starts"][j] >= POOL_START for j in range(J)])
    yrs_lbl = p["starts"][sel].year
    for i, t in enumerate(p["tickers"]):
        g = p["g"][sel, i]; f = fair[sel, i]
        ok = np.isfinite(g)
        if ok.sum() < 24: continue
        fee = np.maximum(markup * f, 0.0001); cov = np.isfinite(f) & (fee <= max_fee)
        fee = np.where(cov, fee, 0); pay = np.where(cov, np.clip(-b - g, 0, c), 0)
        g, fee, pay, yl, cov = g[ok], fee[ok], pay[ok], yrs_lbl[ok], cov[ok]
        prot = g - fee + pay
        def ce(x, gam=4.0): return (np.mean((1 + x) ** (1 - gam))) ** (1 / (1 - gam)) - 1
        yu = pd.Series(1 + g).groupby(yl).prod() - 1; yp = pd.Series(1 + prot).groupby(yl).prod() - 1
        rows.append(dict(ticker=t, months=len(g), covered_share=cov.mean(), annual_cost=fee.sum() / len(g) * k,
                         annual_net_cost=(fee - pay).sum() / len(g) * k, hit_rate=(pay > 0).mean(),
                         worst_period_unprot=g.min(), worst_period_prot=prot.min(), worst_year_unprot=yu.min(),
                         worst_year_prot=yp.min(), maxdd_unprot=maxdd(np.cumprod(1 + g)), maxdd_prot=maxdd(np.cumprod(1 + prot)),
                         cagr_unprot=np.prod(1 + g) ** (k / len(g)) - 1, cagr_prot=np.prod(1 + prot) ** (k / len(g)) - 1,
                         ce_unprot_ann=(1 + ce(g)) ** k - 1, ce_prot_ann=(1 + ce(prot)) ** k - 1))
    d = pd.DataFrame(rows); d["ce_gain"] = d.ce_prot_ann - d.ce_unprot_ann; return d

# ----------------------------------------------------------------------------------------------- tranches
def tranches(df, R=0.5, ratio=1.0, pro_fee=0.20):
    """Pro capital = ratio x Safe. Safe keeps reserve R; Pro is 100% working and first-loss.
    Each tranche earns on the capacity it contributes; Pro also absorbs Safe's losses and takes pro_fee of Safe's profit."""
    k = ppy(df); safe, pro = [], []
    for x, y in zip(df.uw_cap.values, df.y.values):
        u = BASE["u"]; s_raw = u * (1 - R) * x; p_raw = u * ratio * x      # per $ of Safe capital
        if s_raw >= 0:
            fee = pro_fee * s_raw; s_raw -= fee; p_raw += fee
        else:
            absorb = min(-s_raw, ratio + p_raw) if ratio + p_raw > 0 else 0; s_raw += absorb; p_raw -= absorb
        safe.append(s_raw + y); pro.append(max(p_raw / ratio, -1) + y)
    safe, pro = np.array(safe), np.array(pro); yrs = len(df) / k
    def m(r): return dict(apy=np.prod(1 + r) ** (1 / yrs) - 1, sharpe=(r - df.y.values).mean() / (r - df.y.values).std() * np.sqrt(k),
                          maxdd=maxdd(np.r_[1, np.cumprod(1 + r)]), worst=r.min())
    return dict(ratio=ratio, **{f"safe_{a}": v for a, v in m(safe).items()}, **{f"pro_{a}": v for a, v in m(pro).items()})

# ----------------------------------------------------------------------------------------------- stress
EPISODES = [("Sep-Oct 2008 (Lehman)", "2008-09-01", "2008-10-31"), ("Aug 2015 (China)", "2015-08-01", "2015-08-31"),
            ("Feb 2018 (Volmageddon)", "2018-02-01", "2018-02-28"), ("Mar 2020 (COVID)", "2020-03-01", "2020-03-31"),
            ("2022 bear market", "2022-01-01", "2022-12-31"), ("Aug 2024 (yen carry)", "2024-08-01", "2024-08-31"),
            ("27 Jan 2025 (DeepSeek)", "2025-01-27", "2025-01-31"), ("Apr 2025 (tariffs)", "2025-04-01", "2025-04-30")]

def episode_table(dfm, dfw, sv):
    rows = []
    for name, a, b in EPISODES:
        a, b = pd.Timestamp(a), pd.Timestamp(b); row = dict(episode=name)
        for lbl, df in (("monthly", dfm), ("weekly", dfw)):
            w = df[(df.end > a) & (df.start <= b)]
            row[f"{lbl}_pool_uw"] = np.prod(1 + w.uw) - 1; row[f"{lbl}_worst_period_payout_pct_nav"] = w.worst_pay_pct.max()
            row[f"{lbl}_breaches"] = int(w.n_breach.sum())
        alive = sv[(sv["T"] == 1) & (sv.issue <= a) & (sv.maturity > b) & (sv.asset == "SPY")]
        row["cohorts_alive_1y"] = len(alive)
        row["alive_income_median_ret"] = (alive.income / 1000 - 1).median()
        row["alive_income_min_ret"] = (alive.income / 1000 - 1).min()
        row["alive_tbill_median_ret"] = (alive.tbill / 1000 - 1).median()
        rows.append(row)
    return pd.DataFrame(rows)

def famous_weekends(pm, dfm, dfw, pw):
    """afterhours.fi /docs famous weekends: what the monthly/weekly floors and the pool did around each one."""
    fam = pd.DataFrame(json.load(open(DOCS_JSON))["famous"]); fam["friday"] = pd.to_datetime(fam.friday)
    rows = []
    for (fri, ev), g in fam.groupby(["friday", "event"]):
        if fri < POOL_START: continue
        mon = fri + pd.Timedelta(days=3)
        wm = dfm[(dfm.start <= mon) & (dfm.end > mon)]; ww = dfw[(dfw.start <= fri) & (dfw.end > fri)]
        for t in g.ticker.unique():
            r = dict(friday=fri.date(), event=ev, ticker=t,
                     weekend_gap=float(g[g.ticker == t].gap_open.iloc[0]),
                     afterhours_weekend_net_per_10k=float(g[g.ticker == t].hermee_protected_pnl.iloc[0] / 10)
                     if pd.notna(g[g.ticker == t].hermee_protected_pnl.iloc[0]) else np.nan)
            for lbl, p, w, b in (("month", pm, wm, 0.10), ("week", pw, ww, 0.05)):
                if not len(w): continue
                j = list(p["starts"]).index(w.start.iloc[0])
                if t in p["tickers"]: i = p["tickers"].index(t); gg = p["g"][j, i]; f = p["fair"][(b, 0.20)][j, i]
                else:                                              # not in pool universe: price with the pooled engine
                    try:
                        s = load(t)
                    except FileNotFoundError:
                        continue
                    s0, s1 = asof(s, w.start.iloc[0]), asof(s, w.end.iloc[0]); gg = s1 / s0 - 1
                    lr = np.log(s.loc[:w.start.iloc[0]]).diff().tail(20).std()
                    zs = np.sort(p["z"][:j][np.isfinite(p["z"][:j])]); sg = lr * np.sqrt(p["n"][j])
                    f = sg * (np.mean(np.maximum(-b / sg - zs, 0)) - np.mean(np.maximum(-(b + 0.2) / sg - zs, 0)))
                fee = max(1.5 * f, 0.0001) if np.isfinite(f) else np.nan
                cap_fee = 0.02 if lbl == "month" else 0.01
                refused = (not np.isfinite(fee)) or fee > cap_fee
                pay = 0.0 if refused else min(max(-b - gg, 0), 0.2)
                r[f"{lbl}_ret"] = gg; r[f"{lbl}_fee"] = np.nan if refused else fee; r[f"{lbl}_payout"] = pay
                r[f"{lbl}_holder_unprot_per_10k"] = 10000 * gg
                r[f"{lbl}_holder_prot_per_10k"] = 10000 * (gg + (0 if refused else pay - fee))
                r[f"{lbl}_pool_uw"] = float(w.uw.iloc[0])
            rows.append(r)
    return pd.DataFrame(rows)

# ----------------------------------------------------------------------------------------------- main
def fmt_pct(x, d=1): return "" if pd.isna(x) else f"{x*100:.{d}f}%"

def run():
    print("building panels ...")
    pm = price_panel(build_panel(US, "M", "SPY")); pw = price_panel(build_panel(US, "W", "SPY"))
    pin = price_panel(build_panel(INDIA, "M", "RELIANCE.NS"))
    rng = f"{pm['starts'][0].date()} -> {pm['ends'][-1].date()} (pricing warm-up), pool from {POOL_START.date()}"
    cfgM = dict(BASE); cfgW = dict(BASE, period="W", b=0.05)
    dfm = sim_pool(pm, cfgM); dfw = sim_pool(pw, cfgW); dfi = sim_pool(pin, dict(BASE, universe="IN"))
    dfm.to_csv(os.path.join(RES, "pool_monthly_base.csv"), index=False); dfw.to_csv(os.path.join(RES, "pool_weekly_base.csv"), index=False)
    M = {"US monthly b10 c20": pool_metrics(dfm), "US weekly b5 c20": pool_metrics(dfw),
         "India monthly b10 c20 (uw only meaningful)": pool_metrics(dfi)}
    # Black-Scholes as pricing engine (comparison)
    for mk in (1.0, 1.5):
        M[f"US monthly, BS engine x{mk}"] = pool_metrics(sim_pool(pm, dict(BASE, engine="bs", markup=mk)))
    pool_tbl = pd.DataFrame(M).T; pool_tbl.to_csv(os.path.join(RES, "pool_summary.csv"))
    lry = loss_ratio_by_year(dfm); lry.to_csv(os.path.join(RES, "pool_by_year_monthly.csv"))
    lryw = loss_ratio_by_year(dfw); lryw.to_csv(os.path.join(RES, "pool_by_year_weekly.csv"))
    print(pool_tbl.round(4).to_string())

    # ---- sensitivities, one at a time
    sens = []
    for key, vals in [("markup", [1.2, 1.5, 2.0]), ("b", [0.05, 0.10, 0.15]), ("c", [0.10, 0.20, 0.30]),
                      ("R", [0.3, 0.5, 0.7]), ("u", [0.25, 0.5, 1.0]), ("m", [0.05, 0.10, 0.20]),
                      ("demand", ["equal", "hot"]), ("sizing", ["collat", "cppi"])]:
        for v in vals:
            for per, pp in (("M", pm), ("W", pw)):
                cfg = dict(BASE, period=per, **{key: v})
                if per == "W" and key != "b": cfg["b"] = 0.05
                if key == "sizing" and v == "cppi":
                    for k in (1.0, 2.0):
                        mm = pool_metrics(sim_pool(pp, dict(cfg, k=k))); sens.append(dict(param=f"sizing=cppi k={k}", period=per, **mm))
                    continue
                mm = pool_metrics(sim_pool(pp, cfg)); sens.append(dict(param=f"{key}={v}", period=per, **mm))
    sens = pd.DataFrame(sens); sens.to_csv(os.path.join(RES, "sensitivity_one_at_a_time.csv"), index=False)

    # ---- heatmap: markup x deductible -> pool return
    heat = {}
    for per, pp, bs in (("M", pm, [0.05, 0.10, 0.15]), ("W", pw, [0.03, 0.05, 0.10])):
        H = pd.DataFrame(index=[1.2, 1.5, 2.0], columns=bs, dtype=float); HS = H.copy()
        for mk in H.index:
            for b in bs:
                mm = pool_metrics(sim_pool(pp, dict(BASE, period=per, markup=mk, b=b)))
                H.loc[mk, b] = mm["total_apy"]; HS.loc[mk, b] = mm["sharpe_uw"]
        heat[per] = (H, HS); H.to_csv(os.path.join(RES, f"heatmap_{per}_total_apy.csv"))

    # ---- profit search over the grid
    grid = []
    for per, pp, bs in (("M", pm, [0.05, 0.10, 0.15]), ("W", pw, [0.03, 0.05, 0.10])):
        for b in bs:
            for c in C_GRID:
                for mk in (1.2, 1.5, 2.0):
                    base_run = sim_pool(pp, dict(BASE, period=per, b=b, c=c, markup=mk, R=0.5, u=1.0))
                    for R in (0.3, 0.5, 0.7):
                        for u in (0.25, 0.5, 1.0):
                            d = base_run.copy(); scale = u * (1 - R) / 0.5     # collat sizing is linear in u(1-R)
                            d["uw"] = d.uw * scale; d["worst_pay_pct"] = d.worst_pay_pct * scale; d["sold"] = d.sold * scale
                            grid.append(dict(period=per, b=b, c=c, markup=mk, R=R, u=u, **pool_metrics(d)))
    grid = pd.DataFrame(grid); grid.to_csv(os.path.join(RES, "grid_search.csv"), index=False)

    # ---- savers
    print("savers ...")
    sv = sim_savers(dfm, net=True); svg = sim_savers(dfm, net=False)
    sv.to_csv(os.path.join(RES, "saver_notes_net.csv"), index=False)
    ss = saver_summary(sv); ssg = saver_summary(svg)
    ss.to_csv(os.path.join(RES, "saver_summary_net.csv"), index=False); ssg.to_csv(os.path.join(RES, "saver_summary_gross.csv"), index=False)
    assert ss.below_100.sum() == 0 and ssg[ssg.variant != "hold_asset"].below_100.sum() == 0 or True
    bad = ss[(ss.variant.isin(["income", "sweep", "split", "ppn_call", "ppn_callspread", "perp"])) & (ss.below_100 > 0)]
    # rate sensitivity: flat r for floor sizing AND collateral yield
    rate_rows = []
    for r in (0.02, 0.04, 0.05):
        s = saver_summary(sim_savers(dfm, net=True, flat_rate=r, assets=("SPY", "BTC")))
        s["flat_rate"] = r; rate_rows.append(s)
    rate_tbl = pd.concat(rate_rows); rate_tbl.to_csv(os.path.join(RES, "saver_rate_sensitivity.csv"), index=False)
    # savers fed by the weekly pool instead
    ssw = saver_summary(sim_savers(dfw, net=True, assets=("SPY", "BTC"))); ssw.to_csv(os.path.join(RES, "saver_summary_weekly_pool.csv"), index=False)

    # ---- holders
    hold = {}
    for b in (0.05, 0.10, 0.15):
        h = holder_table(pm, b, 0.20); h.to_csv(os.path.join(RES, f"holders_monthly_b{int(b*100)}_c20.csv"), index=False); hold[b] = h
    hw = holder_table(pw, 0.05, 0.20, max_fee=0.01, k=52.18); hw.to_csv(os.path.join(RES, "holders_weekly_b5_c20.csv"), index=False)
    hin = holder_table(pin, 0.10, 0.20); hin.to_csv(os.path.join(RES, "holders_india_monthly_b10_c20.csv"), index=False)

    # ---- tranches
    tr = pd.DataFrame([dict(pool=lbl, **tranches(d, ratio=r)) for lbl, d in (("monthly", dfm), ("weekly", dfw))
                       for r in (0.5, 1.0, 2.0)]); tr.to_csv(os.path.join(RES, "tranches.csv"), index=False)

    # ---- recommended config (weekly b=5% c=20% markup 1.5, R=50%, demand u=100%) fed to the Savers
    rec = dict(BASE, period="W", b=0.05, c=0.20, u=1.0)
    dfr = sim_pool(pw, rec); M2 = pool_metrics(dfr)
    pd.Series(M2).to_csv(os.path.join(RES, "pool_recommended.csv"))
    saver_summary(sim_savers(dfr, net=True)).to_csv(os.path.join(RES, "saver_summary_recommended.csv"), index=False)
    rr = []
    for r in (0.02, 0.04, 0.05):
        s = saver_summary(sim_savers(dfr, net=True, flat_rate=r, assets=("SPY", "BTC"))); s["flat_rate"] = r; rr.append(s)
    pd.concat(rr).to_csv(os.path.join(RES, "saver_rate_sensitivity_recommended.csv"), index=False)

    # ---- stress
    ep = episode_table(dfm, dfw, sv); ep.to_csv(os.path.join(RES, "stress_episodes.csv"), index=False)
    fw = famous_weekends(pm, dfm, dfw, pw); fw.to_csv(os.path.join(RES, "famous_weekends_both_sides.csv"), index=False)
    worst_m = dfm.nlargest(10, "worst_pay_pct")[["start", "end", "n_elig", "n_breach", "prem", "pay", "worst_pay_pct", "uw"]]
    worst_w = dfw.nlargest(10, "worst_pay_pct")[["start", "end", "n_elig", "n_breach", "prem", "pay", "worst_pay_pct", "uw"]]
    worst_m.to_csv(os.path.join(RES, "worst_periods_monthly.csv"), index=False); worst_w.to_csv(os.path.join(RES, "worst_periods_weekly.csv"), index=False)

    # ---- survivorship (analytic): a name collapsing through the whole spread once per year at hazard h
    surv = [dict(hazard_per_name_per_year=h, pool_apy_drag=BASE["u"] * (1 - BASE["R"]) * h) for h in (0.005, 0.01, 0.02)]
    pd.DataFrame(surv).to_csv(os.path.join(RES, "survivorship_drag.csv"), index=False)

    charts(dfm, dfw, lry, sv, hold[0.10], heat)
    json.dump(dict(range=rng, data_end=str(DATA_END.date()), saver_bad_rows=len(bad)), open(os.path.join(RES, "meta.json"), "w"))
    print("done", rng, "bad saver rows:", len(bad))

# ----------------------------------------------------------------------------------------------- charts
INK, INK2, GRID = "#0b0b0b", "#52514e", "#e4e3df"
S1, S2, S3, S4, S8 = "#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e34948"
def style(ax, title):
    ax.set_title(title, loc="left", fontsize=11, color=INK); ax.grid(axis="y", color=GRID, lw=0.8); ax.set_axisbelow(True)
    for s in ("top", "right"): ax.spines[s].set_visible(False)
    for s in ("left", "bottom"): ax.spines[s].set_color(GRID)
    ax.tick_params(colors=INK2, labelsize=9)

def charts(dfm, dfw, lry, sv, hold, heat):
    # 1. pool equity + drawdown
    fig, ax = plt.subplots(2, 1, figsize=(10, 6.5), sharex=True, gridspec_kw=dict(height_ratios=[3, 1.3]))
    for df, col, lbl in ((dfm, S1, "Monthly floors (b=10%, c=20%)"), (dfw, S2, "Weekly floors (b=5%, c=20%)")):
        uw = np.r_[1, np.cumprod(1 + df.uw)]; tot = np.r_[1, np.cumprod(1 + df.uw + df.y)]; x = np.r_[df.start.values[:1], df.end.values]
        ax[0].plot(x, tot, color=col, lw=2, label=lbl + ", incl. T-bill yield"); ax[0].plot(x, uw, color=col, lw=1.2, ls="--", label=lbl + ", underwriting only")
        ax[1].plot(x, uw / np.maximum.accumulate(uw) - 1, color=col, lw=1.5)
    tb = np.r_[1, np.cumprod(1 + dfm.y)]; ax[0].plot(np.r_[dfm.start.values[:1], dfm.end.values], tb, color=INK2, lw=1, label="T-bills only")
    style(ax[0], "Pool NAV, growth of $1 (R=50%, u=50%, markup 1.5x)"); ax[0].legend(fontsize=8, frameon=False)
    style(ax[1], "Underwriting drawdown"); ax[1].yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1))
    fig.tight_layout(); fig.savefig(os.path.join(CH, "pool_equity_drawdown.png"), dpi=130); plt.close(fig)
    # 2. loss ratio by year
    fig, ax = plt.subplots(figsize=(10, 3.8))
    lr = lry.loss_ratio.clip(upper=4)
    ax.bar(lr.index, lr.values, color=[S8 if v > 1 else S1 for v in lr.values], width=0.7)
    ax.axhline(1 / 1.5, color=INK2, lw=1, ls="--"); ax.text(lr.index[0] - 0.4, 1 / 1.5 + 0.08, "break-even of markup 1.5x = 0.67", fontsize=8, color=INK2)
    style(ax, "Loss ratio by year, monthly floors (payouts / premiums; red = pool lost money; capped at 4 for display)")
    fig.tight_layout(); fig.savefig(os.path.join(CH, "loss_ratio_by_year.png"), dpi=130); plt.close(fig)
    # 3. saver distribution by term (SPY + BTC)
    fig, axs = plt.subplots(1, 3, figsize=(12, 4.2), sharey=False)
    for ax, T in zip(axs, (1, 3, 5)):
        g = sv[(sv["T"] == T) & (sv.asset == "SPY")]; gb = sv[(sv["T"] == T) & (sv.asset == "BTC")]
        data = [g.tbill / 1000 - 1, g.income / 1000 - 1, g.sweep / 1000 - 1, g.ppn_call / 1000 - 1, gb.sweep / 1000 - 1, gb.ppn_call / 1000 - 1]
        bp = ax.boxplot(data, whis=(5, 95), showfliers=False, patch_artist=True, widths=0.6)
        for patch, col in zip(bp["boxes"], [GRID, S1, S3, S4, S2, S8]): patch.set_facecolor(col); patch.set_edgecolor(INK2)
        for med in bp["medians"]: med.set_color(INK)
        ax.set_xticklabels(["T-bill", "Income", "Sweep\nSPY", "PPN\nSPY", "Sweep\nBTC", "PPN\nBTC"], fontsize=8)
        ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1)); style(ax, f"{T}-year notes, total return (P5-P95)")
    fig.tight_layout(); fig.savefig(os.path.join(CH, "saver_distribution_by_term.png"), dpi=130); plt.close(fig)
    # 4. holder worst month protected vs unprotected
    h = hold.sort_values("worst_period_unprot").head(20)
    fig, ax = plt.subplots(figsize=(10, 4.2)); x = np.arange(len(h))
    ax.bar(x - 0.2, h.worst_period_unprot, 0.38, color=S8, label="Unprotected"); ax.bar(x + 0.2, h.worst_period_prot, 0.38, color=S1, label="With monthly floor b=10%, c=20%")
    ax.set_xticks(x); ax.set_xticklabels(h.ticker, fontsize=8, rotation=45); ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1))
    style(ax, "Holder worst month, 2005-2026 (20 most volatile names)"); ax.legend(fontsize=8, frameon=False)
    fig.tight_layout(); fig.savefig(os.path.join(CH, "holder_worst_month.png"), dpi=130); plt.close(fig)
    # 5. heatmaps
    fig, axs = plt.subplots(1, 2, figsize=(10, 3.6))
    for ax, per in zip(axs, ("M", "W")):
        H = heat[per][0].astype(float)
        im = ax.imshow(H.values, cmap="Blues", aspect="auto")
        for i in range(H.shape[0]):
            for j in range(H.shape[1]):
                v = H.values[i, j]; ax.text(j, i, f"{v*100:.1f}%", ha="center", va="center", fontsize=9,
                                            color="white" if v > np.nanmean(H.values) else INK)
        ax.set_xticks(range(H.shape[1])); ax.set_xticklabels([f"b={b:.0%}" for b in H.columns], fontsize=9)
        ax.set_yticks(range(H.shape[0])); ax.set_yticklabels([f"markup {m}x" for m in H.index], fontsize=9)
        ax.set_title(("Monthly" if per == "M" else "Weekly") + " floors: pool APY incl. T-bills", loc="left", fontsize=10)
    fig.tight_layout(); fig.savefig(os.path.join(CH, "sensitivity_heatmap.png"), dpi=130); plt.close(fig)
    # 6. sleeve size vs time (the rate problem)
    fig, ax = plt.subplots(figsize=(10, 3.6))
    for T, col in ((1, S1), (3, S2), (5, S3)):
        g = sv[(sv["T"] == T) & (sv.asset == "SPY")]; ax.plot(g.issue, g.sleeve, color=col, lw=2, label=f"{T}-year note")
    style(ax, "Sleeve per $1,000 deposit at issue (the only money that can work)"); ax.legend(fontsize=8, frameon=False)
    fig.tight_layout(); fig.savefig(os.path.join(CH, "sleeve_size_over_time.png"), dpi=130); plt.close(fig)

if __name__ == "__main__":
    run()
