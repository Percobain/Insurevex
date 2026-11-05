"use client";
import { useMemo, useState } from "react";
import { useData } from "@/lib/api";
import { fmtNum, fmtPct, marketLabel } from "@/lib/format";
import { PageHead, Section, Stat, Placeholder, Seg } from "@/components/ui";
import { EquityChart, LossRatioChart, WalkForwardChart, CorrHeatmap } from "@/components/docs/charts";
import SaverCalculator from "@/components/SaverCalculator";

const TOC = [
  ["summary", "Headline"], ["how", "How it works"], ["pool", "Pool returns"], ["markets", "By market"], ["models", "Pricing models"],
  ["configs", "Walk-forward"], ["savers", "Savers"], ["holders", "Holders"], ["stress", "Stress"], ["honest", "Limits"],
];

function H2({ id, eyebrow, children, sub }) {
  return (
    <div id={id} className="scroll-mt-24 mb-5">
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h2 className="font-display text-3xl sm:text-4xl tracking-tight mt-2">{children}</h2>
      {sub && <p className="text-ink2 text-sm mt-2 max-w-3xl leading-relaxed">{sub}</p>}
    </div>
  );
}

function Missing({ file }) {
  return <Placeholder title="Still computing">This section renders <span className="font-mono">{file}</span> from the research run.</Placeholder>;
}

function Formula({ children }) {
  return <div className="font-mono text-[13px] bg-sunk rounded-xl px-4 py-3 overflow-x-auto whitespace-pre text-ink">{children}</div>;
}

function cfgLabel(c) {
  if (!c) return "—";
  const per = { W: "weekly", M: "monthly", "2W": "fortnightly" }[c.period] || c.period;
  return `${per} · b ${fmtPct(c.b, 0)} · c ${fmtPct(c.c, 0)} · ${c.markup}× markup · m ${fmtPct(c.m, 0)}`;
}

function MarketsTable({ rows }) {
  const [sort, setSort] = useState("sharpe");
  const sorted = useMemo(() => [...rows].sort((a, b) => (b[sort] ?? -9) - (a[sort] ?? -9)), [rows, sort]);
  const cols = [["uw_apy", "Over T-bills"], ["total_apy", "Total APY"], ["sharpe", "Sharpe"], ["maxdd", "Max drawdown"], ["worst_year", "Worst year"]];
  return (
    <div className="card overflow-x-auto">
      <table className="table-x">
        <thead>
          <tr>
            <th>Market</th>
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
        <Seg value={period} onChange={setPeriod} options={periods.map((p) => ({ value: p, label: { W: "Weekly", M: "Monthly", "2W": "2 weeks" }[p] || p }))} />
        <Seg value={bSel} onChange={setB} options={bs.map((x) => ({ value: x, label: `b ${fmtPct(x, 0)}` }))} />
      </div>
      <div className="card overflow-x-auto">
        <table className="table-x">
          <thead><tr><th>Model</th><th>Loss ratio</th><th>Calibration error</th><th>by year</th><th>by market</th><th>by vol quintile</th><th>LR std (years)</th><th>Observations</th></tr></thead>
          <tbody>
            {view.map((r) => (
              <tr key={r.model} className={r.model === winner ? "bg-accentSoft/60" : ""}>
                <td className="font-mono text-xs">{r.model}{r.model === winner && <span className="chip ml-2 text-accent border-accent/40">winner</span>}</td>
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
      <p className="text-xs text-muted mt-2">Lower calibration error = the price matched what actually got paid out, consistently across years, markets and volatility regimes.</p>
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
        {markets.map((x) => <option key={x} value={x}>{x === "All" ? "All markets" : marketLabel(x)}</option>)}
      </select>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {list.map((e, i) => (
          <div key={i} className="card p-4">
            <div className="flex justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium truncate">{e.event}</div>
                <div className="text-xs text-muted">{e.ticker} · {marketLabel(e.market)} · {String(e.start).slice(0, 10)} · {e.cover}</div>
              </div>
              <span className={`chip h-fit shrink-0 ${e.quoted ? "text-good border-good/40" : ""}`}>{e.quoted ? "covered" : "refused"}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 text-sm tabular">
              <div><div className="text-xs text-muted">Unprotected</div><div className="text-bad font-semibold">{fmtNum(e.unprotected_10k)}</div></div>
              <div><div className="text-xs text-muted">With InsureVEX</div><div className={`font-semibold ${e.protected_10k > e.unprotected_10k ? "text-good" : ""}`}>{fmtNum(e.protected_10k)}</div></div>
            </div>
            <div className="text-[11px] text-muted mt-2">per $10,000 held · period return {fmtPct(e.ret, 1)}</div>
          </div>
        ))}
      </div>
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

  return (
    <>
      <PageHead eyebrow="Research" title="Does it work? We tested it on 25 years of crashes.">
        Every number here comes from a walk-forward backtest: each price and each parameter choice uses only data that existed at the
        time. Pool results are in USD; cover on foreign stocks pays in USD on the stock's local-currency fall.
      </PageHead>
      <Section>
        <nav className="flex gap-2 overflow-x-auto pb-2 sticky top-16 z-30 bg-paper/90 backdrop-blur -mx-4 px-4 py-2 border-b border-line">
          {TOC.map(([id, l]) => <a key={id} href={`#${id}`} className="chip shrink-0 hover:bg-sunk">{l}</a>)}
        </nav>

        <div className="mt-10" id="summary">
          {!s ? <Missing file="global_summary.json" /> : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Stat label="Markets / stocks" value={`${s.markets} / ${fmtNum(s.names)}`} sub={`${String(s.data_range?.[0]).slice(0, 4)}–${String(s.data_range?.[1]).slice(0, 4)}, pool from ${String(s.pool_start).slice(0, 4)}`} />
                <Stat label="Out-of-sample pool APY" value={fmtPct(oos?.total_apy)} sub={`${fmtPct(oos?.uw_apy)} over T-bills · walk-forward`} />
                <Stat label="Max drawdown (OOS)" value={fmtPct(oos?.maxdd)} sub={`worst year ${fmtPct(oos?.worst_year)} (${oos?.worst_year_label})`} tone="bad" />
                <Stat label="Pricing engine" value={<span className="font-mono text-lg">{s.winner_model}</span>} sub={`vs listed puts: ${fmtNum(s.price_vs_listed_put_proxy, 2)}× · market corr ${fmtNum(s.avg_market_correlation, 2)}`} />
              </div>
              <div className="grid lg:grid-cols-3 gap-3 mt-3">
                <div className="card p-5">
                  <div className="label">Recommended configuration</div>
                  <div className="font-semibold mt-2">{cfgLabel(rec)}</div>
                  <div className="text-sm text-ink2 mt-1">Sizing {rec?.sizing} · leverage {fmtPct(rec?.leverage, 1)} of pool at risk</div>
                  <div className="grid grid-cols-3 gap-2 mt-4 text-sm tabular">
                    <div><div className="text-xs text-muted">APY</div>{fmtPct(rm?.total_apy)}</div>
                    <div><div className="text-xs text-muted">Sharpe</div>{fmtNum(rm?.sharpe, 2)}</div>
                    <div><div className="text-xs text-muted">Max DD</div><span className="text-bad">{fmtPct(rm?.maxdd)}</span></div>
                  </div>
                </div>
                <div className="card p-5">
                  <div className="label">Same terms, more leverage (R50 / u50)</div>
                  <div className="grid grid-cols-3 gap-2 mt-3 text-sm tabular">
                    <div><div className="text-xs text-muted">APY</div>{fmtPct(s.r50u50_metrics?.total_apy)}</div>
                    <div><div className="text-xs text-muted">Sharpe</div>{fmtNum(s.r50u50_metrics?.sharpe, 2)}</div>
                    <div><div className="text-xs text-muted">Max DD</div><span className="text-bad">{fmtPct(s.r50u50_metrics?.maxdd)}</span></div>
                  </div>
                  <p className="text-xs text-muted mt-3">Leverage scales return and drawdown together. It is a risk budget, not an edge.</p>
                </div>
                <div className="card p-5">
                  <div className="label">Bootstrap, 5 years ahead</div>
                  {boot ? (
                    <>
                      <div className="grid grid-cols-3 gap-2 mt-3 text-sm tabular">
                        <div><div className="text-xs text-muted">APY P5</div>{fmtPct(boot.apy_p5)}</div>
                        <div><div className="text-xs text-muted">Median</div>{fmtPct(boot.apy_p50)}</div>
                        <div><div className="text-xs text-muted">P95</div>{fmtPct(boot.apy_p95)}</div>
                      </div>
                      <p className="text-xs text-muted mt-3">{fmtNum(boot.paths)} paths, {boot.block_months}-month blocks. P(drawdown &gt; 20%) = {fmtPct(boot.p_drawdown_gt_20, 1)}; P(5-year loss) = {fmtPct(boot.p_5y_loss, 2)}.</p>
                    </>
                  ) : <p className="text-sm text-muted mt-2">—</p>}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="mt-16" id="how">
          <H2 eyebrow="Method" sub="Plain English first, formulas second.">How it works</H2>
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="card p-5 sm:p-6 space-y-4 text-sm text-ink2 leading-relaxed">
              <p><span className="text-ink font-medium">The note.</span> A saver's deposit is split so the T-bill part grows back to exactly the deposit at maturity. Only the remainder, the sleeve, can ever be lost, and it can never lose more than itself.</p>
              <p><span className="text-ink font-medium">The cover.</span> A holder pays a premium today. If the stock's official close at expiry is more than the deductible below today's close, the pool pays the extra fall, capped. That is a put spread.</p>
              <p><span className="text-ink font-medium">The price.</span> Every past fall in every market is divided by the stock's volatility at the time. Today's price uses that pooled history of standardised falls, scaled by today's volatility, plus a risk margin. Names already in free fall are refused.</p>
              <p><span className="text-ink font-medium">The pool.</span> A reserve never backs policies, every policy's maximum payout is locked when it is sold, and no single stock can use more than its cap.</p>
            </div>
            <div className="space-y-3">
              <Formula>{`floor  = deposit / (1 + r·T)        r = T-bill rate locked at issue
sleeve = deposit − floor            the only money at risk`}</Formula>
              <Formula>{`payout per $1 = min( max(−b − g, 0), c )
g = close(expiry) / close(start) − 1`}</Formula>
              <Formula>{`σ_period = σ_daily(20d) · √(trading days)
z_i      = g_i / σ_period,i           (all prior periods, all markets)
fair     = mean_i  min( max(−b − σ_today·z_i, 0), c )
premium  = max(markup × fair, 1bp)   refuse if premium > cap`}</Formula>
              <Formula>{`capacity = (1 − R) · pool assets − locked
per stock ≤ m · (1 − R) · pool assets`}</Formula>
            </div>
          </div>
        </div>

        <div className="mt-16" id="pool">
          <H2 eyebrow="Supply side" sub="Growth of $1 in the underwriting pool, monthly, including the T-bill yield on collateral.">Pool returns through every crash</H2>
          <div className="card p-4 sm:p-6">{equity.data ? <EquityChart data={equity.data} /> : <Missing file="equity_curve.json" />}</div>
          <div className="card p-4 sm:p-6 mt-4">
            <div className="flex items-baseline justify-between mb-2"><h3 className="font-semibold">Loss ratio by year</h3><span className="text-xs text-muted">claims ÷ premiums · red = pool lost money that year</span></div>
            {lry.data ? <LossRatioChart rows={lry.data} /> : <Missing file="loss_ratio_by_year.json" />}
          </div>
        </div>

        <div className="mt-16" id="markets">
          <H2 eyebrow="23 exchanges" sub="Single-market pools under the same rules. Click a column to sort.">Which markets work best</H2>
          {Array.isArray(markets.data) ? <MarketsTable rows={markets.data} /> : <Missing file="markets.json" />}
          {stress.data?.correlation && (
            <div className="card p-4 sm:p-6 mt-4">
              <h3 className="font-semibold mb-1">Do crashes diversify across countries?</h3>
              <p className="text-sm text-ink2 mb-4">Correlation of monthly underwriting results between markets. Average {fmtNum(stress.data.avg_corr, 2)}: the big crashes are global.</p>
              <CorrHeatmap markets={stress.data.correlation.markets} matrix={stress.data.correlation.matrix} />
            </div>
          )}
        </div>

        <div className="mt-16" id="models">
          <H2 eyebrow="Accuracy" sub="Each candidate pricing engine priced every stock-period walk-forward. We scored how well its fair value matched realised payouts.">Pricing models compared</H2>
          {Array.isArray(models.data) ? <ModelsTable rows={models.data} winner={s?.winner_model} /> : <Missing file="models.json" />}
        </div>

        <div className="mt-16" id="configs">
          <H2 eyebrow="No cherry-picking" sub="Each year the configuration is chosen using only earlier years, then run on the next year. This is the honest headline.">Walk-forward configuration</H2>
          {configs.data ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <Stat label="Out-of-sample APY" value={fmtPct(configs.data.oos?.total_apy)} sub={`${fmtPct(configs.data.oos?.uw_apy)} over T-bills`} />
                <Stat label="Full-sample best APY" value={fmtPct(configs.data.full_sample_best?.total_apy)} sub="chosen with hindsight" />
                <Stat label="OOS Sharpe" value={fmtNum(configs.data.oos?.sharpe, 2)} sub={`hindsight: ${fmtNum(configs.data.full_sample_best?.sharpe, 2)}`} />
                <Stat label="OOS losing years" value={`${configs.data.oos?.years_neg ?? "—"} / ${configs.data.oos?.n_years ?? "—"}`} tone="bad" />
              </div>
              <div className="card p-4 sm:p-6"><WalkForwardChart rows={configs.data.walkforward} /></div>
              <div className="card overflow-x-auto mt-4">
                <table className="table-x">
                  <thead><tr><th>Year</th><th>Config chosen from prior years</th><th>Training APY</th><th>Training DD</th><th>Next-year result</th></tr></thead>
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
            </>
          ) : <Missing file="configs.json" />}
        </div>

        <div className="mt-16" id="savers">
          <H2 eyebrow="Demand side, part 1" sub="Every monthly cohort since the data begins. No note ever paid back less than its deposit.">What savers got</H2>
          <SaverCalculator />
        </div>

        <div className="mt-16" id="holders">
          <H2 eyebrow="Demand side, part 2" sub="Continuous cover, every stock, per market (medians). Then the famous crashes, per $10,000 held.">What holders paid and got</H2>
          {holders.data?.by_market ? (
            <div className="card overflow-x-auto">
              <table className="table-x">
                <thead><tr><th>Market</th><th>Quoted</th><th>Cost / yr</th><th>Net cost / yr</th><th>Periods that pay</th><th>Better off (CRRA 4)</th><th>Worst period: bare → covered</th></tr></thead>
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
          ) : <Missing file="holders.json" />}
          {holders.data?.events?.length > 0 && <div className="mt-6"><HolderEvents events={holders.data.events} /></div>}
        </div>

        <div className="mt-16" id="stress">
          <H2 eyebrow="Stress" sub="Named crises, and the single periods that hurt the pool most.">The worst days</H2>
          {stress.data ? (
            <div className="grid lg:grid-cols-2 gap-4">
              <div className="card overflow-x-auto">
                <table className="table-x">
                  <thead><tr><th>Episode</th><th>Pool</th><th>Worst payout</th><th>Breaches</th></tr></thead>
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
                  <thead><tr><th>Period start</th><th>Payouts</th><th>Pool result</th><th>Breached / quoted</th></tr></thead>
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
          <H2 eyebrow="Limits" sub="What the numbers cannot tell you.">Read before you trust a backtest</H2>
          <div className="grid md:grid-cols-3 gap-4 text-sm text-ink2 leading-relaxed">
            <div className="card p-5"><div className="text-ink font-medium mb-1">Survivorship</div>The stock lists are today's large caps. Companies that died are missing, which flatters the pool. We stress this with an extra collapse rate in the research report.</div>
            <div className="card p-5"><div className="text-ink font-medium mb-1">Demand</div>Markup and utilisation are assumptions. A backtest cannot know whether holders will pay 1.5× fair value, or whether buyers know something the price does not.</div>
            <div className="card p-5"><div className="text-ink font-medium mb-1">Rates</div>The saver's upside depends on the T-bill rate. When rates were near zero, the sleeve was tiny and the note had little to work with.</div>
          </div>
        </div>
      </Section>
    </>
  );
}
