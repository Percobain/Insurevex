"""Print markdown tables from results/ for docs/BACKTEST.md and docs/PITCH_NUMBERS.md (every number traceable)."""
import os, json
import pandas as pd, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); RES = os.path.join(HERE, "results")
pct = lambda x, d=1: "" if pd.isna(x) else f"{x*100:.{d}f}%"
def md(df): return df.to_markdown(index=False)

def main():
    S = json.load(open(os.path.join(HERE, "..", "app", "public", "data", "global_summary.json")))
    print("## SUMMARY\n", json.dumps(S, indent=1)[:4000])
    M = pd.read_csv(os.path.join(RES, "models_ranked.csv")); print("\n## MODELS RANKED\n", M.round(3).to_markdown(index=False))
    MD = pd.read_csv(os.path.join(RES, "models.csv"))
    print("\n## MODELS BY PERIOD\n", MD[["period", "model", "loss_ratio", "calib_err_year", "calib_err_market", "calib_err_volq", "lr_year_std", "lr_volq", "rank_score"]].round(3).to_markdown(index=False))
    WF = pd.read_csv(os.path.join(RES, "walkforward_selection.csv")); print("\n## WALKFORWARD\n", WF.round(3).to_markdown(index=False))
    MK = pd.read_csv(os.path.join(RES, "markets.csv"))
    t = MK[["market", "names", "first", "uw_apy", "total_apy", "sharpe", "maxdd", "worst_period", "worst_period_date", "worst_year", "worst_year_label", "loss_ratio", "avg_quoted"]].copy()
    for c in ["uw_apy", "total_apy", "maxdd", "worst_period", "worst_year"]: t[c] = t[c].map(pct)
    print("\n## MARKETS\n", t.round(2).to_markdown(index=False))
    HM = pd.read_csv(os.path.join(RES, "holders_by_market.csv"))
    for c in ["quoted_share", "annual_cost", "annual_net_cost", "hit_rate", "ce_gain", "worst_unprot", "worst_prot", "share_better_off"]: HM[c] = HM[c].map(pct)
    print("\n## HOLDERS BY MARKET\n", HM.to_markdown(index=False))
    EC = pd.read_csv(os.path.join(RES, "event_cards.csv")); print("\n## EVENTS\n", EC.round(3).to_markdown(index=False))
    EP = pd.read_csv(os.path.join(RES, "stress_episodes.csv")); print("\n## EPISODES\n", EP.round(4).to_markdown(index=False))
    print("\n## BOOT\n", open(os.path.join(RES, "bootstrap.json")).read())
    LY = pd.read_csv(os.path.join(RES, "loss_ratio_by_year.csv")); print("\n## LR BY YEAR\n", LY.round(3).to_markdown(index=False))
    SV = pd.read_csv(os.path.join(RES, "saver_summary.csv"))
    v = SV[SV.variant.isin(["income", "split", "ppn_call", "tbill"])][["pool", "asset", "T", "variant", "median", "apy_median", "p5", "p95", "beat_tbill", "exactly_100", "below_100"]]
    print("\n## SAVERS\n", v.round(4).to_markdown(index=False))
    print("\n## WORST\n", pd.read_csv(os.path.join(RES, "worst_periods.csv")).round(4).to_markdown(index=False))
    print("\n## CLEANING\n", open(os.path.join(RES, "data_cleaning.json")).read()[:800])

if __name__ == "__main__":
    main()
