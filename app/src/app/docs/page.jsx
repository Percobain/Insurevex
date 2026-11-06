"use client";
import { useEffect, useMemo, useState } from "react";
import { useData } from "@/lib/api";
import { fmtNum, fmtPct, marketLabel } from "@/lib/format";
import { PageHead, Section, Stat, Placeholder, Seg, More } from "@/components/ui";
import { EquityChart, LossRatioChart, WalkForwardChart, CorrHeatmap } from "@/components/docs/charts";
import SaverCalculator from "@/components/SaverCalculator";

const TOC = [
  ["summary", "Summary"], ["how", "How it works"], ["pool", "The pool over time"], ["markets", "By country"], ["models", "Pricing methods"],
  ["configs", "No hindsight"], ["savers", "Savers"], ["holders", "Stock owners"], ["stress", "Worst crashes"], ["honest", "Honest limits"],
];

const TOC_IDS = TOC.map(([id]) => id);

function H2({ id, eyebrow, children, sub }) {
  return (
    <div id={id} className="scroll-mt-24 mb-6">
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h2 className="font-display text-3xl sm:text-[34px] leading-tight tracking-tight mt-2">{children}</h2>
      {sub && <p className="text-ink2 text-[15px] mt-2 max-w-3xl leading-relaxed">{sub}</p>}
    </div>
  );
}

function Missing({ file }) {
  return <Placeholder title="Still being calculated">This part fills in when the research run finishes (<span className="font-mono text-xs">{file}</span>).</Placeholder>;
}

function Formula({ label, children }) {
  return (
    <div className="card overflow-hidden">
      {label && <div className="border-b border-line px-4 py-2 text-xs font-semibold text-ink2">{label}</div>}
      <div className="font-mono text-[13px] leading-relaxed bg-sunk/50 px-4 py-3 overflow-x-auto whitespace-pre text-ink">{children}</div>
    </div>
  );
}

/** Which section is in view, for the sidebar. */
function useScrollSpy(ids) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean);
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-15% 0px -70% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ids]);
  return active;
}

/** Sticky contents list on large screens; a scrollable chip row on small ones. */
function Contents({ active }) {
  return (
    <>
      <nav className="lg:hidden flex gap-2 overflow-x-auto -mx-4 px-4 pb-2" aria-label="Sections">
        {TOC.map(([id, l]) => (
          <a key={id} href={`#${id}`} className={`chip shrink-0 ${active === id ? "bg-primary text-white border-primary" : "hover:bg-sunk"}`}>{l}</a>
        ))}
      </nav>
      <nav className="hidden lg:block sticky top-24 self-start" aria-label="Sections">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted mb-3">On this page</div>
        <ol className="border-l border-line">
          {TOC.map(([id, l], i) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className={`-ml-px flex items-center gap-2.5 border-l-2 py-1.5 pl-4 text-sm transition-colors ${active === id ? "border-accent text-ink font-medium" : "border-transparent text-ink2 hover:text-ink hover:border-line"}`}
              >
                <span className={`font-mono text-[11px] ${active === id ? "text-accent" : "text-muted"}`}>{String(i + 1).padStart(2, "0")}</span>
                {l}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}

function cfgLabel(c) {
  if (!c) return "—";
  const per = { W: "weekly", M: "monthly", "2W": "every 2 weeks" }[c.period] || c.period;
  return `${per} · pays after ${fmtPct(c.b, 0)} · up to ${fmtPct(c.c, 0)} · price ${c.markup}× fair · max ${fmtPct(c.m, 0)} per stock`;
}

function MarketsTable({ rows }) {
  const [sort, setSort] = useState("sharpe");
  const sorted = useMemo(() => [...rows].sort((a, b) => (b[sort] ?? -9) - (a[sort] ?? -9)), [rows, sort]);
  const cols = [["uw_apy", "More than bonds"], ["total_apy", "A year in total"], ["sharpe", "Return per risk"], ["maxdd", "Worst fall"], ["worst_year", "Worst year"]];
  return (
    <div className="card overflow-x-auto">
      <table className="table-x">
        <thead>
          <tr>
            <th>Country</th>
            {cols.map(([k, l]) => (
              <th key={k}><button className={`uppercase tracking-wider ${sort === k ? "text-ink" : ""}`} onClick={() => setSort(k)}>{l}{sort === k ? " ↓" : ""}</button></th>
            ))}
            <th>Worst period</th><th>Losing years</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.market} className={r.market === "GLOBAL" ? "bg-accentSoft/60 font-medium" : ""}>
              <td>{marketLabel(r.market)}</td>
              <td>{fmtPct(r.uw_apy, 1)}</td>
              <td>{fmtPct(r.total_apy, 1)}</td>
              <td>{fmtNum(r.sharpe, 2)}</td>
              <td className="text-bad">{fmtPct(r.maxdd, 1)}</td>
              <td>{fmtPct(r.worst_year, 1)} <span className="text-muted text-xs">{r.worst_year_label}</span></td>
              <td>{fmtPct(r.worst_period, 1)} <span className="text-muted text-xs">{String(r.worst_period_date || "").slice(0, 10)}</span></td>
              <td>{r.years_neg ?? "—"} / {r.n_years ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ModelsTable({ rows, winner }) {
  const periods = [...new Set(rows.map((r) => r.period))];
  const [period, setPeriod] = useState(periods.includes("M") ? "M" : periods[0]);
  const bs = [...new Set(rows.filter((r) => r.period === period).map((r) => r.b))].sort((a, b) => a - b);
  const [b, setB] = useState(null);
  const bSel = b !== null && bs.includes(b) ? b : bs.includes(0.1) ? 0.1 : bs[0];
  const view = rows.filter((r) => r.period === period && r.b === bSel).sort((x, y) => x.calib_err_total - y.calib_err_total);
  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-3">
        <Seg value={period} onChange={setPeriod} options={periods.map((p) => ({ value: p, label: { W: "1 week", M: "1 month", "2W": "2 weeks" }[p] || p }))} />
        <Seg value={bSel} onChange={setB} options={bs.map((x) => ({ value: x, label: `Pays after ${fmtPct(x, 0)}` }))} />
      </div>
      <div className="card overflow-x-auto">
        <table className="table-x">
          <thead><tr><th>Method</th><th>Payouts ÷ fees</th><th>Price error</th><th>by year</th><th>by country</th><th>by how jumpy</th><th>Spread across years</th><th>Prices tested</th></tr></thead>
          <tbody>
            {view.map((r) => (
              <tr key={r.model} className={r.model === winner ? "bg-accentSoft/60" : ""}>
                <td className="font-mono text-xs">{r.model}{r.model === winner && <span className="chip ml-2 text-accent border-accent/40">most accurate</span>}</td>
                <td>{fmtNum(r.loss_ratio, 2)}</td>
                <td className="font-medium">{fmtNum(r.calib_err_total, 3)}</td>
                <td>{fmtNum(r.calib_err_year, 3)}</td>
                <td>{fmtNum(r.calib_err_market, 3)}</td>
                <td>{fmtNum(r.calib_err_volq, 3)}</td>
                <td>{fmtNum(r.lr_year_std, 2)}</td>
                <td>{fmtNum(r.n_obs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted mt-2">Lower price error means the price matched what was actually paid out, across years, countries, and calm or jumpy markets.</p>
    </div>
  );
}

function HolderEvents({ events }) {
  const markets = ["All", ...new Set(events.map((e) => e.market))];
  const [m, setM] = useState("All");
  const list = events.filter((e) => m === "All" || e.market === m).sort((a, b) => a.unprotected_10k - b.unprotected_10k).slice(0, 18);
  return (
    <div>
      <select className="input h-9 w-auto text-sm mb-3" value={m} onChange={(e) => setM(e.target.value)}>
        {markets.map((x) => <option key={x} value={x}>{x === "All" ? "All countries" : marketLabel(x)}</option>)}
      </select>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {list.map((e, i) => (
          <div key={i} className="card p-4">
            <div className="flex justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium truncate">{e.event}</div>
                <div className="text-xs text-muted">{e.ticker} · {marketLabel(e.market)} · {String(e.start).slice(0, 10)} · {e.cover}</div>
              </div>
              <span className={`chip h-fit shrink-0 ${e.quoted ? "text-good border-good/40" : ""}`}>{e.quoted ? "protected" : "not sold"}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 text-sm tabular">
              <div><div className="text-xs text-muted">Without protection</div><div className="text-bad font-semibold">{fmtNum(e.unprotected_10k)}</div></div>
              <div><div className="text-xs text-muted">With InsureVEX</div><div className={`font-semibold ${e.protected_10k > e.unprotected_10k ? "text-good" : ""}`}>{fmtNum(e.protected_10k)}</div></div>
            </div>
            <div className="text-[11px] text-muted mt-2">per $10,000 owned · the stock moved {fmtPct(e.ret, 1)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryLine({ k, children }) {
  return (
    <div className="grid sm:grid-cols-[11rem_1fr] gap-1 sm:gap-4 py-3 border-b border-line last:border-0">
      <div className="font-semibold text-ink">{k}</div>
      <div className="text-ink2 leading-relaxed">{children}</div>
    </div>
  );
}

export default function DocsPage() {
  const summary = useData("global_summary.json");
  const markets = useData("markets.json");
  const models = useData("models.json");
  const configs = useData("configs.json");
  const holders = useData("holders.json");
  const stress = useData("stress.json");
  const equity = useData("equity_curve.json");
  const lry = useData("loss_ratio_by_year.json");
  const s = summary.data;
  const rec = s?.recommended;
  const rm = s?.recommended_metrics;
  // Headline = walk-forward product choice with leverage fixed by policy (R50/u25). The leverage-optimising walk-forward
  // (s.walkforward_oos) is shown in the research as the cautionary case: it chased APY in calm years and lost 24% in 2008.
  const oos = s?.walkforward_policyB?.["0.125"] || s?.walkforward_oos;
  const boot = stress.data?.bootstrap || s?.bootstrap;
  const active = useScrollSpy(TOC_IDS);

  return (
    <>
      <PageHead eyebrow="Research" title="Does it work? We tested 25 years of crashes.">
        Every price and every choice uses only data that existed at the time, so there is no hindsight. All results are in US dollars.
      </PageHead>
      <Section className="grid lg:grid-cols-[200px_minmax(0,1fr)] gap-6 lg:gap-12 pb-10">
        <Contents active={active} />
        <div className="min-w-0">
        <div className="mt-2 scroll-mt-24" id="summary">
          <div className="card px-5 sm:px-6 py-2 mb-4 text-[15px]">
            <SummaryLine k="What we tested">
              {s ? `${s.markets} countries and ${fmtNum(s.names)} stocks, ${String(s.data_range?.[0]).slice(0, 4)}–${String(s.data_range?.[1]).slice(0, 4)}. Every crash replayed with today's rules.` : "Every big crash in 23 countries, replayed with today's rules."}
            </SummaryLine>
            <SummaryLine k="What we found">
              {oos ? `The pool made ${fmtPct(oos.total_apy)} a year (${fmtPct(oos.uw_apy)} more than US government bonds) with no hindsight. No savings plan ever paid back less than was put in.` : "The pool earned more than US government bonds, and no savings plan ever paid back less than was put in."}
            </SummaryLine>
            <SummaryLine k="The honest limits">
              Only today's surviving companies are in the data, demand is a guess, and savers' extra depends on interest rates. <a href="#honest" className="text-accent underline underline-offset-2">More</a>
            </SummaryLine>
          </div>
          {!s ? <Missing file="global_summary.json" /> : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Stat label="Countries / stocks" value={`${s.markets} / ${fmtNum(s.names)}`} sub={`${String(s.data_range?.[0]).slice(0, 4)}–${String(s.data_range?.[1]).slice(0, 4)}, pool from ${String(s.pool_start).slice(0, 4)}`} />
                <Stat label="Pool, a year" value={fmtPct(oos?.total_apy)} sub={`${fmtPct(oos?.uw_apy)} more than bonds · no hindsight`} />
                <Stat label="Pool's worst fall" value={fmtPct(oos?.maxdd)} sub={`worst year ${fmtPct(oos?.worst_year)} (${oos?.worst_year_label})`} tone="bad" />
                <Stat label="Pricing method" value={<span className="font-mono text-lg">{s.winner_model}</span>} sub={`price vs stock-market options: ${fmtNum(s.price_vs_listed_put_proxy, 2)}× · countries crash together: ${fmtNum(s.avg_market_correlation, 2)}`} />
              </div>
              <More label="Show recommended settings and the 5-year outlook" className="mt-4">
                <div className="grid lg:grid-cols-3 gap-3">
                  <div className="card p-5">
                    <div className="label">Recommended settings</div>
                    <div className="font-semibold mt-2">{cfgLabel(rec)}</div>
                    <div className="text-sm text-ink2 mt-1">Sizing {rec?.sizing} · {fmtPct(rec?.leverage, 1)} of the pool at risk</div>
                    <div className="grid grid-cols-3 gap-2 mt-4 text-sm tabular">
                      <div><div className="text-xs text-muted">A year</div>{fmtPct(rm?.total_apy)}</div>
                      <div><div className="text-xs text-muted">Return per risk</div>{fmtNum(rm?.sharpe, 2)}</div>
                      <div><div className="text-xs text-muted">Worst fall</div><span className="text-bad">{fmtPct(rm?.maxdd)}</span></div>
                    </div>
                  </div>
                  <div className="card p-5">
                    <div className="label">Same rules, more of the pool at risk</div>
                    <div className="grid grid-cols-3 gap-2 mt-3 text-sm tabular">
                      <div><div className="text-xs text-muted">A year</div>{fmtPct(s.r50u50_metrics?.total_apy)}</div>
                      <div><div className="text-xs text-muted">Return per risk</div>{fmtNum(s.r50u50_metrics?.sharpe, 2)}</div>
                      <div><div className="text-xs text-muted">Worst fall</div><span className="text-bad">{fmtPct(s.r50u50_metrics?.maxdd)}</span></div>
                    </div>
                    <p className="text-xs text-muted mt-3">Putting more at risk raises returns and losses together. It is a choice of risk, not a free gain. (R50 / u50)</p>
                  </div>
                  <div className="card p-5">
                    <div className="label">5 years ahead, random replays</div>
                    {boot ? (
                      <>
                        <div className="grid grid-cols-3 gap-2 mt-3 text-sm tabular">
                          <div><div className="text-xs text-muted">Bad case</div>{fmtPct(boot.apy_p5)}</div>
                          <div><div className="text-xs text-muted">Typical</div>{fmtPct(boot.apy_p50)}</div>
                          <div><div className="text-xs text-muted">Good case</div>{fmtPct(boot.apy_p95)}</div>
                        </div>
                        <p className="text-xs text-muted mt-3">{fmtNum(boot.paths)} replays stitched from {boot.block_months}-month pieces of real history. Bad and good case: 1 in 20. Chance of a fall over 20%: {fmtPct(boot.p_drawdown_gt_20, 1)}. Chance of losing money over 5 years: {fmtPct(boot.p_5y_loss, 2)}.</p>
                      </>
                    ) : <p className="text-sm text-muted mt-2">—</p>}
                  </div>
                </div>
              </More>
            </>
          )}
        </div>

        <div className="mt-16" id="how">
          <H2 eyebrow="How it works" sub="Plain words first. The formulas are behind the toggle.">How it works</H2>
          <div className="card p-5 sm:p-6 space-y-4 text-sm text-ink2 leading-relaxed">
            <p><span className="text-ink font-medium">The savings plan.</span> Most of a saver's money buys US government bonds (T-bills), sized to grow back to exactly what they put in by the end date. Only the rest, the earning part, can ever be lost.</p>
            <p><span className="text-ink font-medium">The protection.</span> A stock owner pays a fee today. If the stock's closing price on the end date has fallen more than a set amount (say 10%), the pool pays the extra fall, up to a limit.</p>
            <p><span className="text-ink font-medium">The price.</span> We took every past fall in every country and adjusted it for how jumpy (volatile) the stock was then. Today's price uses that history, scaled to how jumpy the stock is today, plus a safety margin. Stocks already in free fall get no price.</p>
            <p><span className="text-ink font-medium">The pool.</span> Part of the pool is a reserve that never backs protection. The biggest possible payout is set aside when protection is sold, and no single stock can use more than its share.</p>
          </div>
          <More label="Show the formulas" className="mt-4">
            <div className="grid lg:grid-cols-2 gap-3">
              <Formula label="Savings plan: the guaranteed part">{`floor  = deposit / (1 + r·T)        r = government bond rate at the start
sleeve = deposit − floor            the earning part, the only money at risk`}</Formula>
              <Formula label="Protection: the payout (a put spread)">{`payout per $1 = min( max(−b − g, 0), c )
g = close(end) / close(start) − 1    b = starts paying after, c = pays up to`}</Formula>
              <Formula label="The price">{`σ_period = σ_daily(20d) · √(trading days)     σ = how jumpy
z_i      = g_i / σ_period,i           (all prior periods, all countries)
fair     = mean_i  min( max(−b − σ_today·z_i, 0), c )
price    = max(markup × fair, 1bp)   no price if price > c`}</Formula>
              <Formula label="The pool: how much protection it can sell">{`capacity = (1 − R) · pool money − set aside     R = reserve
per stock ≤ m · (1 − R) · pool money`}</Formula>
            </div>
          </More>
        </div>

        <div className="mt-16" id="pool">
          <H2 eyebrow="The pool" sub="What $1 in the pool grew to, month by month, including interest from government bonds.">The pool through every crash</H2>
          <div className="card p-4 sm:p-6">{equity.data ? <EquityChart data={equity.data} /> : <Missing file="equity_curve.json" />}</div>
          <div className="card p-4 sm:p-6 mt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2"><h3 className="font-semibold">Payouts as a share of fees, each year</h3><span className="text-xs text-muted">payouts ÷ fees · red = the pool lost money that year</span></div>
            {lry.data ? <LossRatioChart rows={lry.data} /> : <Missing file="loss_ratio_by_year.json" />}
          </div>
        </div>

        <div className="mt-16" id="markets">
          <H2 eyebrow="23 stock exchanges" sub="One pool per country, same rules.">Which countries work best</H2>
          {Array.isArray(markets.data) ? (
            <More label="Show the table by country">
              <MarketsTable rows={markets.data} />
              <p className="text-xs text-muted mt-2">Click a column to sort. Return per risk is the Sharpe ratio: higher means steadier gains.</p>
            </More>
          ) : <Missing file="markets.json" />}
          {stress.data?.correlation && (
            <div className="card p-4 sm:p-6 mt-4">
              <h3 className="font-semibold mb-1">Do crashes spread across countries?</h3>
              <p className="text-sm text-ink2 mb-4">How closely each pair of countries moves together, month by month (0 = not at all, 1 = exactly). Average {fmtNum(stress.data.avg_corr, 2)}: the big crashes are global.</p>
              <CorrHeatmap markets={stress.data.correlation.markets} matrix={stress.data.correlation.matrix} />
            </div>
          )}
        </div>

        <div className="mt-16" id="models">
          <H2 eyebrow="Accuracy" sub="We priced every stock in every period with each method, using only past data, then checked how close the price came to what was actually paid out.">Which pricing method was most accurate</H2>
          {s?.winner_model && <p className="text-[15px] text-ink2 mb-3">Most accurate: <span className="font-mono text-ink">{s.winner_model}</span>.</p>}
          {Array.isArray(models.data) ? <More label="Show all methods compared"><ModelsTable rows={models.data} winner={s?.winner_model} /></More> : <Missing file="models.json" />}
        </div>

        <div className="mt-16" id="configs">
          <H2 eyebrow="No hindsight" sub="Each year we picked the settings using only earlier years, then ran them on the next year. This is the honest headline.">Settings picked without hindsight</H2>
          {configs.data ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <Stat label="A year, no hindsight" value={fmtPct(configs.data.oos?.total_apy)} sub={`${fmtPct(configs.data.oos?.uw_apy)} more than bonds`} />
                <Stat label="Best, with hindsight" value={fmtPct(configs.data.full_sample_best?.total_apy)} sub="picked after the fact" />
                <Stat label="Return per risk" value={fmtNum(configs.data.oos?.sharpe, 2)} sub={`with hindsight: ${fmtNum(configs.data.full_sample_best?.sharpe, 2)}`} />
                <Stat label="Losing years" value={`${configs.data.oos?.years_neg ?? "—"} / ${configs.data.oos?.n_years ?? "—"}`} tone="bad" />
              </div>
              <div className="card p-4 sm:p-6"><WalkForwardChart rows={configs.data.walkforward} /></div>
              <More label="Show the settings picked each year" className="mt-4">
                <div className="card overflow-x-auto">
                  <table className="table-x">
                    <thead><tr><th>Year</th><th>Settings picked from earlier years</th><th>Earlier years, a year</th><th>Earlier years, worst fall</th><th>Next year's result</th></tr></thead>
                    <tbody>
                      {(configs.data.walkforward || []).map((r) => (
                        <tr key={r.year}>
                          <td>{r.year}</td><td className="text-xs">{cfgLabel(r)}</td><td>{fmtPct(r.train_uw_apy, 1)}</td>
                          <td>{fmtPct(r.train_maxdd, 1)}</td>
                          <td className={r.oos_total < 0 ? "text-bad" : "text-good"}>{fmtPct(r.oos_total, 1, { sign: true })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </More>
            </>
          ) : <Missing file="configs.json" />}
        </div>

        <div className="mt-16" id="savers">
          <H2 eyebrow="Savers" sub="Every monthly start since the data begins. No savings plan ever paid back less than was put in.">What savers got</H2>
          <SaverCalculator />
        </div>

        <div className="mt-16" id="holders">
          <H2 eyebrow="Stock owners" sub="The famous crashes, per $10,000 owned. The table shows protection kept all the time, typical values per country.">What stock owners paid and got</H2>
          {holders.data?.events?.length > 0 && <HolderEvents events={holders.data.events} />}
          {holders.data?.by_market ? (
            <More label="Show the table by country" className="mt-6">
              <div className="card overflow-x-auto">
                <table className="table-x">
                  <thead><tr><th>Country</th><th>Got a price</th><th>Cost a year</th><th>Cost after payouts</th><th>Periods that paid</th><th>Better off*</th><th>Worst period: without → with</th></tr></thead>
                  <tbody>
                    {holders.data.by_market.map((r) => (
                      <tr key={r.market}>
                        <td>{marketLabel(r.market)}</td><td>{fmtPct(r.quoted_share, 0)}</td><td>{fmtPct(r.annual_cost, 1)}</td><td>{fmtPct(r.annual_net_cost, 1)}</td>
                        <td>{fmtPct(r.hit_rate, 1)}</td><td>{fmtPct(r.share_better_off, 0)}</td>
                        <td><span className="text-bad">{fmtPct(r.worst_unprot, 0)}</span> → {fmtPct(r.worst_prot, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted mt-2">*Share of stocks where a fairly careful investor ends up happier with protection, counting the comfort of smaller losses (CRRA 4).</p>
            </More>
          ) : <Missing file="holders.json" />}
        </div>

        <div className="mt-16" id="stress">
          <H2 eyebrow="Stress test" sub="Famous crises, and the single periods that hurt the pool most.">The worst crashes for the pool</H2>
          {stress.data ? (
            <div className="grid lg:grid-cols-2 gap-4">
              <div className="card overflow-x-auto">
                <table className="table-x">
                  <thead><tr><th>Crisis</th><th>Pool</th><th>Biggest payout</th><th>Payouts</th></tr></thead>
                  <tbody>
                    {(stress.data.episodes || []).map((e) => (
                      <tr key={e.episode}>
                        <td className="whitespace-normal min-w-[160px]">{e.episode}</td>
                        <td className={e.pool_uw < 0 ? "text-bad" : "text-good"}>{fmtPct(e.pool_uw, 1, { sign: true })}</td>
                        <td>{fmtPct(e.worst_period_payout_pct_nav, 1)} of pool</td><td>{e.breaches}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="card overflow-x-auto">
                <table className="table-x">
                  <thead><tr><th>Period start</th><th>Paid out</th><th>Pool result</th><th>Paid / sold</th></tr></thead>
                  <tbody>
                    {(stress.data.worst_periods || []).map((w) => (
                      <tr key={w.start}>
                        <td>{String(w.start).slice(0, 10)}</td><td>{fmtPct(w.payout_pct_nav, 1)} of pool</td>
                        <td className="text-bad">{fmtPct(w.uw, 1)}</td><td>{w.breaches} / {w.quoted}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : <Missing file="stress.json" />}
        </div>

        <div className="mt-16" id="honest">
          <H2 eyebrow="Honest limits" sub="What a replay of the past cannot tell you.">Read this before trusting the numbers</H2>
          <div className="grid md:grid-cols-3 gap-4 text-sm text-ink2 leading-relaxed">
            <div className="card p-5"><div className="text-ink font-medium mb-1">Only survivors</div>The stock lists are today's big companies. Companies that went bust are missing, which makes the pool look better. The full research adds extra collapses to test this.</div>
            <div className="card p-5"><div className="text-ink font-medium mb-1">Will people buy it?</div>We assumed how much protection sells and that owners pay 1.5× the fair price. A replay cannot know if they will, or if buyers know something the price does not.</div>
            <div className="card p-5"><div className="text-ink font-medium mb-1">Interest rates</div>Savers' extra depends on government bond rates. When rates were near zero, the earning part was tiny and there was little extra.</div>
          </div>
        </div>
        </div>
      </Section>
    </>
  );
}
