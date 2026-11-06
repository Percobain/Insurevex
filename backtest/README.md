# InsureVEX world backtest

The independent principal and variable-rate study is documented in
[`docs/PRINCIPAL_FIRST_RESEARCH.md`](../docs/PRINCIPAL_FIRST_RESEARCH.md).
It identifies failures in the assumed-rate floor and broad insurance pricing;
the original headline results below do not validate principal protection or Pro profitability.
Its inputs, scripts, and outputs are separate from the original run.

This backtests the InsureVEX model across 23 stock markets. Savers' principal-protected notes underwrite USD-settled crash floors on stocks listed anywhere in the world.

Current economic failures and expectation gaps are tracked in [the backtest failure register](../docs/BACKTEST_FAILURE_TRACKER.md), including Saver principal shortfalls, Pro LP losses, pricing losses, and checks that pass despite those failures. Refresh the saved-result snapshots with `python3 backtest/track_failures.py` from the repo root.

## Run

```bash
pip install pandas numpy scipy matplotlib yfinance
python fetch_world.py      # ~10 min; downloads ~550 tickers + USD rates into data/ (gitignored)
python run_world.py        # ~20-40 min; writes results/, ../docs/charts/, ../app/public/data/
```

`data/_cache/` holds pickled panels and priced grids. Delete it to force a full recompute.

## Files

| File | What it does |
|---|---|
| `fetch_world.py` | Universe definition (23 markets, current large caps plus the main index) and the data fetch: yfinance daily prices adjusted for splits and dividends, and FRED USD rates |
| `lib/world.py` | Builds the panels on each exchange's own calendar, cleans the data, and runs the walk-forward pricing models (pooled vol-scaled with global or per-market pools, hierarchical credibility, Black-Scholes) and calibration scoring |
| `lib/em_engine.py` | The Saver-note engine: floor, sleeve, income / split / PPN / perp variants, T-bill and asset benchmarks |
| `run_world.py` | Model iterations → full-grid pricing → 270-config grid → walk-forward config selection → global vs single-market pools → Savers → Holders → stress and bootstrap → JSON and charts |
| `results/` | Every table as CSV, plus `bootstrap.json` and `data_cleaning.json` |

## Conventions

- **Periods.** A period runs from one bucket's anchor to the next. The anchor is the last trading day of the week, fortnight or month on that market's own calendar. Periods are keyed by their start bucket, so markets line up by calendar.
- **Cover.** Quanto: USD notional, payout = `min(max(-b - g_local, 0), c)`. The pool's collateral is in USD T-bills (^IRX).
- **No lookahead.** The model for start bucket j is fitted on periods with key ≤ j−2. That one-bucket lag also covers the time-zone overlap between Asian and US closes. Config selection is walk-forward: year Y's config is chosen on data before Y.
- **Survivorship.** Universes are *current* constituents, so companies that died are missing. Results are biased upward. See `../docs/BACKTEST.md` for the size of the bias.
