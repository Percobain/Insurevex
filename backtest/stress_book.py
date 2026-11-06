"""Backtest the exact stress-test book (contracts/stress/book.json) week by week over history, before it is run
on-chain. Same engine as the server (server/data/engine.json: hier_mr50 tail table + market factors, 1.5x markup,
refuse above 1%/week), same contract rules (reserve, Pro first loss, Pro fee, 3% deductible / 10% cap).

Every week the book is re-sized to the pool's current capacity (constant utilisation) and priced with each stock's
volatility known at the start of that week. Payouts use the real close-to-close weekly return of each stock.

Caveat: the engine's tail table and market factors were fitted on this same history, so this is an in-sample
replay of today's engine. The out-of-sample numbers are in docs/BACKTEST.md.

Outputs: backtest/results/stress_book.json, app/public/data/stress_backtest.json, contracts/stress/replay_weeks.json
"""
import json, os, math
import numpy as np, pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
BOOK = json.load(open(os.path.join(ROOT, "contracts", "stress", "book.json")))
ENGINE = json.load(open(os.path.join(ROOT, "server", "data", "engine.json")))

P = BOOK["product"]; R = BOOK["risk"]; T = BOOK["tbill"]
b, c, n = P["deductibleBps"] / 1e4, P["capBps"] / 1e4, P["tenorSessions"]
Q = np.sort(np.array(ENGINE["horizons"]["5"]["quantiles"], dtype=float))
FACT = ENGINE["marketFactors"]["W"]["0.03_0.1"]
MAX_FEE = 0.02 * min(1, n / 21) ** 0.5
reserve, pro_fee = R["reserveBps"] / 1e4, float(os.environ.get("PRO_FEE_BPS") or R["proFeeBps"]) / 1e4


def lpm(k):
    return np.maximum(k - Q, 0).mean()


def price(sigma_d, market):
    sp = sigma_d * math.sqrt(n)
    fair = FACT.get(market, 1.0) * sp * (lpm(-b / sp) - lpm(-(b + c) / sp))
    charged = max(P["markup"] * fair, 1e-4)
    return charged, charged > MAX_FEE


def load(yahoo):
    s = pd.read_csv(os.path.join(HERE, "data", f"{yahoo}.csv"), index_col=0, parse_dates=True)["Close"].astype(float)
    s = s[~s.index.duplicated()].sort_index()
    return s[s > 0]


covers = [(h["wallet"], sym, y, m, usd) for h in BOOK["holders"] for sym, y, m, usd in h["covers"]]
weekly, sigmas = {}, {}
for _, sym, y, m, _ in covers:
    s = load(y)
    lr = np.log(s).diff().dropna()
    ew = (lr ** 2).ewm(alpha=0.06, adjust=False).mean()
    v1 = lr.rolling(252, min_periods=120).std()
    sig = np.sqrt(0.5 * ew + 0.5 * v1 ** 2)
    w = s.resample("W-FRI").last()
    weekly[sym] = w.pct_change().shift(-1)  # return over the week that STARTS at this Friday close
    sigmas[sym] = sig.resample("W-FRI").last()  # vol known at the start of the week

dates = pd.date_range("2005-01-07", pd.Timestamp.today() - pd.Timedelta(days=7), freq="W-FRI")
saver_usd = sum(x["usd"] for x in BOOK["savers"])
floor_frac = 1 / (1 + T["floorRateBps"] / 1e4 * T["termYears"])
sleeve0 = saver_usd * (1 - floor_frac)
pro0 = float(os.environ.get("PRO_USD") or sum(x["usd"] for x in BOOK["pro"]))
book_notional0 = sum(x[4] for x in covers)
cap0 = sleeve0 * (1 - reserve) + pro0
util = book_notional0 * c / cap0

senior, pro = sleeve0, pro0
rows = []
year = None
for d in dates:
    if d.year != year:  # each January both tranches are re-sized to the book's capital (a new Pro epoch)
        year, senior, pro = d.year, sleeve0, pro0
    capacity = senior * (1 - reserve) + pro
    scale = capacity / cap0
    prem = pay = 0.0
    refused = quoted = 0
    per = {}
    for wallet, sym, y, m, usd in covers:
        sg, r = sigmas[sym].get(d, np.nan), weekly[sym].get(d, np.nan)
        if not (np.isfinite(sg) and np.isfinite(r) and sg > 0):
            continue
        rate, ref = price(sg, m)
        if ref:
            refused += 1
            continue
        N = usd * scale
        po = N * min(max(-r - b, 0), c)
        prem += N * rate; pay += po; quoted += 1
        per[sym] = r
    if quoted == 0:
        continue
    senior_cap = senior * (1 - reserve)
    to_pro = prem * pro / (senior_cap + pro) if senior_cap + pro > 0 else 0
    if pro > 0:
        to_pro += (prem - to_pro) * pro_fee
    to_sen = prem - to_pro
    pro_before, sen_before = pro, senior
    pro += to_pro
    from_pro = min(pay, pro)
    pro -= from_pro
    senior += to_sen - (pay - from_pro)
    rows.append(dict(date=d.strftime("%Y-%m-%d"), premium=prem, payout=pay, quoted=quoted, refused=refused,
                     pro=pro, senior=senior, pro_ret=(pro / pro_before - 1) if pro_before > 0 else 0.0,
                     senior_ret=senior / sen_before - 1, book_ret=(prem - pay) / (pro_before + sen_before),
                     returns=per))

df = pd.DataFrame(rows).set_index("date")
yrs = len(df) / 52.18
df["senior_idx"] = (1 + df.senior_ret).cumprod()
df["pro_idx"] = (1 + df.pro_ret).cumprod()
senior_cagr = df.senior_idx.iloc[-1] ** (1 / yrs) - 1
dd = (df.senior_idx / df.senior_idx.cummax() - 1).min()
pro_years = [float(np.prod(1 + g.pro_ret) - 1) for _, g in df.groupby(df.index.str[:4])]
pro_mean = float(np.mean(pro_years))

yearly = []
for yr, g in df.groupby(df.index.str[:4]):
    yearly.append(dict(year=int(yr), premium=g.premium.sum(), payout=g.payout.sum(),
                       loss_ratio=g.payout.sum() / g.premium.sum(),
                       senior_ret=float(np.prod(1 + g.senior_ret) - 1), pro_ret=float(np.prod(1 + g.pro_ret) - 1)))

# a Saver's 3-year note on this pool, every start week: floor repays face, the sleeve rides the senior tranche
sleeve_frac = 1 - floor_frac
idx = list(df.index)
notes = []
for i in range(len(idx)):
    j = i + 156
    if j >= len(idx):
        break
    g = df.senior_idx.iloc[j] / df.senior_idx.iloc[i]
    notes.append(dict(start=idx[i], value=1 + sleeve_frac * g))  # floor repays face; sleeve worth sleeve x growth
note_vals = np.array([x["value"] for x in notes])
tbill_3y = 1 + T["floorRateBps"] / 1e4 * 3

worst = df.sort_values("book_ret").head(10)
median_wk = df.iloc[(df.book_ret - df.book_ret.median()).abs().argsort().iloc[0]]
worst_wk = worst.iloc[0]


def all_returns(d):
    return {sym: float(weekly[sym].get(pd.Timestamp(d), np.nan)) for _, sym, _, _, _ in covers
            if np.isfinite(weekly[sym].get(pd.Timestamp(d), np.nan))}


def wk(r):
    return dict(all_returns=all_returns(r.name), date=r.name, premium=r.premium, payout=r.payout, quoted=int(r.quoted), refused=int(r.refused),
                book_ret=r.book_ret, pro_ret=r.pro_ret, senior_ret=r.senior_ret,
                returns={k: float(v) for k, v in r.returns.items()})


summary = dict(
    method="In-sample replay of the live engine over 2005-2026 for the exact stress book (constant utilisation).",
    savers_usd=saver_usd, sleeve_usd=sleeve0, floor_usd=saver_usd * floor_frac, pro_usd=pro0,
    book_notional_usd=book_notional0, max_payout_usd=book_notional0 * c, capacity_usd=cap0, utilisation=util,
    weeks=len(df), years=yrs,
    senior_cagr=senior_cagr, senior_maxdd=float(dd), pro_mean_year=pro_mean, pro_years_negative=int(sum(x < 0 for x in pro_years)),
    pro_years_wiped=int(sum(x <= -0.99 for x in pro_years)), pro_worst_year=float(min(pro_years)),
    loss_ratio=float(df.payout.sum() / df.premium.sum()),
    pct_weeks_with_payout=float((df.payout > 0).mean()),
    pct_weeks_senior_loss=float((df.senior_ret < 0).mean()),
    saver_note_3y=dict(n=len(note_vals), min=float(note_vals.min()), median=float(np.median(note_vals)),
                       below_100=int((note_vals < 1).sum()), beat_tbill=float((note_vals > tbill_3y).mean()),
                       tbill=tbill_3y),
    worst_weeks=[wk(r) for _, r in worst.iterrows()],
    median_week=wk(median_wk), worst_week=wk(worst_wk),
    yearly=yearly,
    equity=[dict(date=d, senior=r.senior_idx) for d, r in df.iloc[::4].iterrows()],
)
os.makedirs(os.path.join(HERE, "results"), exist_ok=True)
if not os.environ.get("SWEEP"): json.dump(summary, open(os.path.join(HERE, "results", "stress_book.json"), "w"), indent=1, default=float)
if not os.environ.get("SWEEP"): json.dump(summary, open(os.path.join(ROOT, "app", "public", "data", "stress_backtest.json"), "w"), default=float)
if not os.environ.get("SWEEP"): json.dump(dict(calm=wk(median_wk), crash=wk(worst_wk)),
          open(os.path.join(ROOT, "contracts", "stress", "replay_weeks.json"), "w"), indent=1, default=float)

f = lambda x: f"${x/1e9:,.2f}B" if x >= 1e9 else f"${x/1e6:,.1f}M"
print(f"Savers {f(saver_usd)} -> floor {f(saver_usd*floor_frac)} + sleeve {f(sleeve0)}; Pro {f(pro0)}")
print(f"Book {f(book_notional0)} notional/week, max payout {f(book_notional0*c)}, capacity {f(cap0)}, utilisation {util:.0%}")
print(f"{len(df)} weeks, {yrs:.1f} yrs. Senior CAGR {senior_cagr:.2%} (maxDD {dd:.1%}), Pro mean year {pro_mean:+.1%}, worst {min(pro_years):+.0%}, negative years {summary['pro_years_negative']}, wiped years {summary['pro_years_wiped']}, loss ratio {summary['loss_ratio']:.2f}")
print(f"weeks with payout {summary['pct_weeks_with_payout']:.0%}, senior losing weeks {summary['pct_weeks_senior_loss']:.1%}")
print(f"Saver 3y note: n={len(note_vals)} min {note_vals.min():.4f} median {np.median(note_vals):.4f} below100 {(note_vals<1).sum()} beat T-bill {(note_vals>tbill_3y).mean():.0%}")
print("median week", median_wk.name, f"book {median_wk.book_ret:+.3%}", "| worst week", worst_wk.name, f"book {worst_wk.book_ret:+.2%} pro {worst_wk.pro_ret:+.1%} senior {worst_wk.senior_ret:+.2%}")
for _, r in worst.iterrows():
    print(" ", r.name, f"prem {f(r.premium)} pay {f(r.payout)} pro {r.pro_ret:+.1%} senior {r.senior_ret:+.2%} refused {int(r.refused)}")
for y in yearly:
    print(y["year"], f"LR {y['loss_ratio']:.2f} senior {y['senior_ret']:+.1%} pro {y['pro_ret']:+.1%}")
