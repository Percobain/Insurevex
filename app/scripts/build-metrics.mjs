// Builds app/public/data/metrics.json for the /metrics page from the backtest outputs.
// Every number on that page comes from here, and every number here comes from backtest/results or the equity curve.
//   node app/scripts/build-metrics.mjs
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const RES = join(here, "../../backtest/results");
const DATA = join(here, "../public/data");

function csv(file) {
  const text = readFileSync(join(RES, file), "utf8").trim();
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = [];
    let cur = "", q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === "," && !q) { cells.push(cur); cur = ""; }
      else cur += ch;
    }
    cells.push(cur);
    rows.push(cells);
  }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h || "_", r[i]])));
}
const num = (v) => (v === undefined || v === "" ? null : Number(v));
const r4 = (v) => (v === null || v === undefined ? null : Math.round(v * 1e4) / 1e4);

// ---------------------------------------------------------------- Holders: famous crashes
const NAMES = {
  "^GSPC": "S&P 500", "000001.SS": "Shanghai Composite", "9988.HK": "Alibaba", "0700.HK": "Tencent", "LLOY.L": "Lloyds",
  "BARC.L": "Barclays", "UBSG.SW": "UBS", "^N225": "Nikkei 225", "8306.T": "Mitsubishi UFJ", "^KS11": "KOSPI",
  "ADANIENT.NS": "Adani Enterprises", "^BVSP": "Bovespa", "PETR4.SA": "Petrobras", NVDA: "NVIDIA", "2330.TW": "TSMC",
  "BAYN.DE": "Bayer", "VOW3.DE": "Volkswagen", "BP.L": "BP", "NPN.JO": "Naspers", "2222.SR": "Saudi Aramco",
  "INDUSINDBK.NS": "IndusInd Bank", "^AXJO": "ASX 200", "^GDAXI": "DAX",
};
const MARKET = {
  US: "United States", ChinaA: "China", HongKong: "Hong Kong", UK: "United Kingdom", Switzerland: "Switzerland", Japan: "Japan",
  Korea: "South Korea", India: "India", Brazil: "Brazil", Taiwan: "Taiwan", Germany: "Germany", SouthAfrica: "South Africa",
  Saudi: "Saudi Arabia", Australia: "Australia",
};
const holders = { week: [], month: [] };
for (const r of csv("event_cards.csv")) {
  const tenor = r.cover.startsWith("1 week") ? "week" : "month";
  holders[tenor].push({
    event: r.event, ticker: r.ticker, name: NAMES[r.ticker] || r.ticker, market: MARKET[r.market] || r.market, date: r.start,
    fall: r4(num(r.ret)), fee: r4(num(r.fee)), payout: r4(num(r.payout)), quoted: r.quoted === "True",
  });
}
for (const k of Object.keys(holders)) holders[k].sort((a, b) => a.fall - b.fall);
const coverTerms = {
  week: { label: "1-week cover", deductible: 0.05, cap: 0.2 },
  month: { label: "1-month cover", deductible: 0.1, cap: 0.2 },
};

// ---------------------------------------------------------------- Savers: notes bought right before crashes
const notes = csv("saver_notes.csv");
const pick = (asset, T, ym) => notes.find((n) => n.asset === asset && Number(n.T) === T && n.issue.startsWith(ym));
const SAVER_STARTS = [
  ["2007-10", "Bought at the market top, a year before Lehman"],
  ["2008-09", "Bought the month Lehman Brothers collapsed"],
  ["2015-08", "Bought during China's devaluation crash"],
  ["2020-02", "Bought weeks before the COVID crash"],
  ["2022-01", "Bought at the start of the 2022 bear market"],
];
const savers = SAVER_STARTS.map(([ym, story]) => {
  const n = pick("SPY", 3, ym);
  if (!n) return null;
  return {
    story, issue: n.issue, maturity: n.maturity, rate: r4(num(n.r)),
    // per $1,000 deposited
    tbill: num(n.tbill), stocks: num(n.hold_asset), note: num(n.income), noteUpside: num(n.split),
  };
}).filter(Boolean);
const allIncome = notes.filter((n) => n.income);
const worstNote = allIncome.reduce((m, n) => (num(n.income) < num(m.income) ? n : m));
const saverAll = {
  notes: allIncome.length,
  below100: allIncome.filter((n) => num(n.income) < 1000 - 1e-6).length,
  worstPer1000: num(worstNote.income), worstIssue: worstNote.issue, worstT: Number(worstNote.T),
  stocksBelow100: allIncome.filter((n) => num(n.hold_asset) < 1000).length,
  worstStocksPer1000: Math.min(...allIncome.map((n) => num(n.hold_asset))),
};

// ---------------------------------------------------------------- LPs: the pool
const eq = JSON.parse(readFileSync(join(DATA, "equity_curve.json"), "utf8"));
const d = eq.dates, g = eq.series.GLOBAL, t = eq.series.TBILLS;
const n = g.length;
const rolling = [1, 3, 5, 10].map((y) => {
  const m = y * 12, out = [];
  for (let i = 0; i + m < n; i++) out.push({ start: d[i], apy: Math.pow(g[i + m] / g[i], 1 / y) - 1, mult: g[i + m] / g[i] });
  out.sort((a, b) => a.apy - b.apy);
  const tb = [];
  for (let i = 0; i + m < n; i++) tb.push(Math.pow(t[i + m] / t[i], 1 / y) - 1);
  tb.sort((a, b) => a - b);
  return {
    years: y, windows: out.length, lost: out.filter((x) => x.mult < 1).length,
    worst: { start: out[0].start, apy: r4(out[0].apy), mult: r4(out[0].mult) },
    median: { apy: r4(out[out.length >> 1].apy), mult: r4(out[out.length >> 1].mult) },
    best: { start: out[out.length - 1].start, apy: r4(out[out.length - 1].apy), mult: r4(out[out.length - 1].mult) },
    tbillMedianApy: r4(tb[tb.length >> 1]),
  };
});
let peak = 0, maxdd = 0, ddAt = "";
g.forEach((v, i) => { peak = Math.max(peak, v); const x = v / peak - 1; if (x < maxdd) { maxdd = x; ddAt = d[i]; } });

// $100k in the pool the month before each crash
const LP_STARTS = [
  ["2001-08", "9/11"], ["2007-10", "Global financial crisis (the market top)"], ["2008-08", "Lehman Brothers"],
  ["2020-01", "COVID crash"], ["2021-12", "2022 bear market"], ["2025-02", "2025 tariff crash"],
];
const lpCrashes = LP_STARTS.map(([ym, event]) => {
  const i = d.indexOf(ym);
  if (i < 0) return null;
  let lo = i, rec = null;
  for (let j = i; j < Math.min(n, i + 36); j++) if (g[j] < g[lo]) lo = j;
  for (let j = lo; j < n; j++) if (g[j] >= g[i]) { rec = j; break; }
  const at = (k) => (i + k < n ? r4(g[i + k] / g[i]) : null);
  return {
    event, start: ym, trough: r4(g[lo] / g[i]), troughAt: d[lo], monthsUnderwater: rec === null ? null : rec - i,
    after1y: at(12), after3y: at(36), after5y: at(60), tbill5y: i + 60 < n ? r4(t[i + 60] / t[i]) : null,
  };
}).filter(Boolean);

// headline, out-of-sample (walk-forward) and bootstrap numbers at the recommended setting
const wf = csv("walkforward_policyB_metrics.csv").find((r) => Math.abs(Number(r._) - 0.125) < 1e-9);
const boot = JSON.parse(readFileSync(join(RES, "bootstrap.json"), "utf8"));

// where the premium dollar goes, over the whole backtest
const lry = csv("loss_ratio_by_year.csv");
const premSum = lry.reduce((a, r) => a + Number(r.prem), 0), paySum = lry.reduce((a, r) => a + Number(r.pay), 0);
const lossRatio = paySum / premSum;

// Pro (first-loss) investors: in-sample replay of the live engine and contract rules (backtest/stress_book.py)
let pro = null;
const sb = join(RES, "stress_book.json");
if (existsSync(sb)) {
  const j = JSON.parse(readFileSync(sb, "utf8"));
  let v = 1;
  const years = j.yearly.map((y) => { v *= 1 + y.pro_ret; return { year: y.year, ret: r4(y.pro_ret), depositRet: r4(y.senior_ret), value: r4(v) }; });
  const worst = years.reduce((m, y) => (y.ret < m.ret ? y : m));
  const best = years.reduce((m, y) => (y.ret > m.ret ? y : m));
  pro = {
    method: "In-sample replay of today's engine and contract rules, 2005-2026 (backtest/stress_book.py)",
    from: years[0].year, to: years[years.length - 1].year, years, mult: r4(v),
    cagr: r4(Math.pow(v, 1 / years.length) - 1), meanYear: r4(j.pro_mean_year),
    negativeYears: j.pro_years_negative, wipedYears: j.pro_years_wiped, worst, best,
  };
}

const out = {
  generated: new Date().toISOString().slice(0, 10),
  principal: 100000,
  holders, coverTerms, lossRatio: r4(lossRatio), pro,
  savers, saverAll,
  lp: {
    from: d[0], to: d[n - 1],
    curve: d.map((x, i) => [x, r4(g[i] / g[0]), r4(t[i] / t[0])]),
    cagr: r4(Math.pow(g[n - 1] / g[0], 12 / (n - 1)) - 1), tbillCagr: r4(Math.pow(t[n - 1] / t[0], 12 / (n - 1)) - 1),
    mult: r4(g[n - 1] / g[0]), tbillMult: r4(t[n - 1] / t[0]),
    maxDrawdown: r4(maxdd), maxDrawdownAt: ddAt, rolling, crashes: lpCrashes,
    outOfSample: wf && { apy: r4(Number(wf.total_apy)), overTbills: r4(Number(wf.uw_apy)), maxDrawdown: r4(Number(wf.maxdd_total)), worstYear: r4(Number(wf.worst_year)), worstYearLabel: wf.worst_year_label, years: Number(wf.n_years), negativeYears: Number(wf.years_neg) },
    bootstrap: { paths: boot.paths, years: boot.horizon_months / 12, pLoss5y: boot.p_5y_loss, pDrawdown20: boot.p_drawdown_gt_20, apyP5: r4(boot.apy_p5), apyP50: r4(boot.apy_p50), apyP95: r4(boot.apy_p95) },
  },
};
writeFileSync(join(DATA, "metrics.json"), JSON.stringify(out));
console.log("pro:", pro && { mult: pro.mult, cagr: pro.cagr, worst: pro.worst, best: pro.best, neg: pro.negativeYears }, "lossRatio", lossRatio);
console.log("metrics.json:", holders.week.length, "weekly +", holders.month.length, "monthly crash cards;", savers.length, "saver cohorts;", lpCrashes.length, "LP crash starts");
console.log("saver all:", saverAll, "\nLP:", out.lp.cagr, out.lp.maxDrawdown, ddAt, JSON.stringify(out.lp.outOfSample));
console.log(JSON.stringify(savers, null, 0));
console.log(JSON.stringify(lpCrashes, null, 0));
