"""Exports the winning pricing model (hier_mr50) for the live server: server/data/engine.json
  - z quantiles per horizon (weekly 5 sessions, 2-week 10, monthly 21), z = r_n / (sigma_mr50 * sqrt(n)), pooled across all
    23 markets and every period in the history (the live engine prices today, so it may use all past data);
  - per-market credibility factors (realised / predicted payouts, shrunk to 1), as of the latest period.
sigma_mr50 = sqrt(0.5 * ewma_vol^2 + 0.5 * vol_1y^2) (daily). Run after run_world.py (uses the cached panels)."""
import os, sys, json, pickle
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from lib import world as W

CACHE = os.path.join(HERE, "data", "_cache")
OUT = os.path.join(HERE, "..", "server", "data", "engine.json")
MAP = {"US": "US", "Canada": "CA", "Brazil": "BR", "Mexico": "MX", "UK": "UK", "Germany": "DE", "France": "FR", "Netherlands": "NL",
       "Switzerland": "CH", "Spain": "ES", "Italy": "IT", "Sweden": "SE", "Japan": "JP", "HongKong": "HK", "ChinaA": "CN", "Taiwan": "TW",
       "Korea": "KR", "India": "IN", "Singapore": "SG", "Australia": "AU", "SouthAfrica": "ZA", "Saudi": "SA", "Indonesia": "ID"}
SESSIONS = {"W": 5, "2W": 10, "M": 21}
BCS = {"W": [(0.03, 0.10), (0.05, 0.20)], "2W": [(0.075, 0.20)], "M": [(0.10, 0.20)]}

def factors(P, fair, bc, k_cred=3000):
    b, c = bc; pay = np.clip(-b - P["g"], 0, c); mk = P["mkt"]; out = {}
    ok = np.isfinite(fair) & np.isfinite(pay)
    for m in np.unique(mk):
        mm = ok & (mk == m)[None, :]
        sp, sf, n = pay[mm].sum(), fair[mm].sum(), int(mm.sum())
        Z = n / (n + k_cred)
        out[MAP.get(m, m)] = round(float(Z * np.clip(sp / sf, 0.3, 3.0) + (1 - Z)) if sf > 0 else 1.0, 4)
    return out

out = {"model": "hier_mr50", "vol": "sqrt(0.5*ewma^2 + 0.5*vol_1y^2)", "horizons": {}, "marketFactors": {}}
q = np.linspace(0, 1, 4001)
for per, n in SESSIONS.items():
    P = pickle.load(open(os.path.join(CACHE, f"panel_{per}.pkl"), "rb"))
    sdp = P["sd"]["mr50"] * np.sqrt(P["n"])
    z = np.where(P["ok"] & np.isfinite(sdp) & (sdp > 0), P["g"] / sdp, np.nan)
    zz = z[np.isfinite(z)]
    out["horizons"][str(n)] = {"period": per, "n_obs": int(zz.size), "quantiles": np.round(np.quantile(zz, q), 5).tolist()}
    fairs = W.price_pooled(P, variant="mr50", scope="global", bcs=BCS[per])
    out["marketFactors"][per] = {f"{b}_{c}": factors(P, fairs[(b, c)], (b, c)) for (b, c) in BCS[per]}
    print(per, zz.size, "obs; factors", out["marketFactors"][per])
out["source"] = "InsureVEX world backtest: 23 markets, 543 names, 1999-2026 (backtest/run_world.py); winner hier_mr50 by out-of-sample calibration"
json.dump(out, open(OUT, "w"))
print("wrote", OUT, os.path.getsize(OUT))
