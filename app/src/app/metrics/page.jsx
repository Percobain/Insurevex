"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Legend,
} from "recharts";
import { useData } from "@/lib/api";
import { Section, SectionHead, Seg } from "@/components/ui";

// ------------------------------------------------------------------ formatting
const P = 100_000;
const usd = (v, { sign = false } = {}) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const s = "$" + Math.round(Math.abs(v)).toLocaleString("en-US");
  return v < 0 ? "−⁠" + s : sign && v > 0 ? "+⁠" + s : s;
};
const usdK = (v) => (Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${Math.round(v / 1000)}k`);
const pct = (v, dp = 1, sign = false) =>
  v === null || v === undefined ? "—" : `${v < 0 ? "−" : sign && v > 0 ? "+" : ""}${Math.abs(v * 100).toFixed(dp)}%`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthName = (ym) => { const [y, m] = String(ym).split("-"); return `${MONTHS[Number(m) - 1]} ${y}`; };
const tip = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12, color: "var(--ink)" };
const axis = { stroke: "var(--muted)", fontSize: 11, tickLine: false, axisLine: false };
const BAD = "rgb(var(--bad-rgb))", GOOD = "rgb(var(--good-rgb))", MUTED = "rgb(var(--muted-rgb))";
// gains that are not InsureVEX's own (stocks, Pro) use a neutral tan, so red always and only means a loss
const OTHER = "var(--chart-4)";

/** What a stock owner with $100k ends with in one crash. */
function outcome(c) {
  const without = P * c.fall;
  if (!c.quoted) return { without, with: without, fee: 0, payout: 0, status: "refused" };
  const fee = P * (c.fee || 0), payout = P * (c.payout || 0);
  return { without, with: without + payout - fee, fee, payout, status: payout > 0 ? "paid" : "nopay" };
}

function Kpi({ value, label, tone, small }) {
  return (
    <div className="card p-5 sm:p-6">
      <div className={`${small ? "text-2xl sm:text-3xl" : "text-4xl sm:text-5xl"} font-semibold tracking-tight tabular whitespace-nowrap ${tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : ""}`}>{value}</div>
      <div className="text-sm text-ink2 mt-2 leading-snug">{label}</div>
    </div>
  );
}

function Plain({ children }) {
  return <div className="rounded-2xl border border-line bg-sunk/60 p-4 sm:p-5 text-[15px] leading-relaxed text-ink2">{children}</div>;
}

// ------------------------------------------------------------------ 1. every crash
function CrashBoard({ m }) {
  const [tenor, setTenor] = useState("week");
  const terms = m.coverTerms[tenor];
  const rows = useMemo(() => {
    const all = m.holders[tenor].filter((c) => c.fall <= -0.05).map((c) => ({ c, o: outcome(c) }));
    return [...all.filter((r) => r.c.quoted), ...all.filter((r) => !r.c.quoted)]; // free-fall ones go last
  }, [m, tenor]);
  const firstRefused = rows.findIndex((r) => !r.c.quoted);
  const [sel, setSel] = useState("VW Dieselgate|VOW3.DE");
  const cur = rows.find((r) => `${r.c.event}|${r.c.ticker}` === sel) || rows[0];
  const max = Math.max(...rows.map((r) => -r.o.without), 1);
  const sold = rows.filter((r) => r.c.quoted);
  const avgWithout = sold.reduce((s, r) => s + r.o.without, 0) / (sold.length || 1);
  const avgWith = sold.reduce((s, r) => s + r.o.with, 0) / (sold.length || 1);
  return (
    <Section className="pt-14 sm:pt-20">
      <SectionHead id="crashes" eyebrow="1 · For people who own stocks" title="Every big crash since 2001. Red is what you lost. Green is what you lose with InsureVEX.">
        Each row is a real crash and $100,000 of that stock. Protection starts paying after a drop of {pct(terms.deductible, 0)} and pays up to {pct(terms.cap, 0)}. The fee is already taken off the green bar. Click a row to see the story.
      </SectionHead>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Seg value={tenor} onChange={setTenor} options={[{ value: "week", label: "Protected for 1 week" }, { value: "month", label: "Protected for 1 month" }]} />
        <span className="flex items-center gap-4 text-xs text-ink2">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: BAD }} />Without protection</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: GOOD }} />With InsureVEX</span>
        </span>
      </div>
      <div className="grid lg:grid-cols-[1.25fr_1fr] gap-4 items-start">
        <div className="card p-2 sm:p-3">
          {rows.map(({ c, o }, i) => {
            const k = `${c.event}|${c.ticker}`, on = k === `${cur.c.event}|${cur.c.ticker}`;
            return (
              <div key={k}>
              {i === firstRefused && (
                <div className="mx-3 mt-4 mb-2 pt-4 border-t border-line">
                  <div className="text-sm font-semibold">Not sold: the stock was already in free fall</div>
                  <p className="text-xs text-ink2 mt-1 leading-relaxed">
                    When a price is already collapsing, protection would cost more than 1% a week, so we don&apos;t sell it. Nobody could buy it, so these owners lost the same either way.
                    Saying no here is what keeps savers&apos; money safe. These are left out of the averages.
                  </p>
                </div>
              )}
              <button onClick={() => setSel(k)} className={`w-full text-left rounded-xl px-3 py-2.5 grid grid-cols-[minmax(0,9.5rem)_1fr] sm:grid-cols-[minmax(0,13rem)_1fr] gap-3 items-center ${on ? "bg-sunk ring-1 ring-ink/20" : "hover:bg-sunk/70"}`}>
                <span className="min-w-0">
                  <span className="block text-sm font-medium truncate">{c.event}</span>
                  <span className="block text-xs text-muted truncate">{c.name} · {c.date.slice(0, 4)}</span>
                </span>
                <span className="space-y-1">
                  <span className="flex items-center gap-2" title={`Without protection: ${usd(o.without)}`}>
                    <span className="h-2.5 rounded-full" style={{ width: `${(-o.without / max) * 78}%`, background: BAD }} />
                    <span className="text-xs tabular text-bad whitespace-nowrap">{usd(o.without)}</span>
                  </span>
                  <span className="flex items-center gap-2" title={`With InsureVEX: ${usd(o.with)}`}>
                    {o.status === "refused" ? (
                      <span className="text-xs text-muted">not sold</span>
                    ) : (
                      <>
                        <span className="h-2.5 rounded-full" style={{ width: `${(Math.max(-o.with, 0) / max) * 78}%`, minWidth: 3, background: GOOD }} />
                        <span className="text-xs tabular text-good whitespace-nowrap">{usd(o.with)}</span>
                      </>
                    )}
                  </span>
                </span>
              </button>
              </div>
            );
          })}
        </div>
        <div className="lg:sticky lg:top-20 space-y-4">
          <div className="card p-5 sm:p-7">
            <div className="text-xs text-muted">{cur.c.market} · {cur.c.name} · {monthName(cur.c.date.slice(0, 7))}</div>
            <h3 className="font-display text-3xl tracking-tight mt-1">{cur.c.event}</h3>
            <p className="text-ink2 mt-3 leading-relaxed">
              You owned <span className="font-semibold text-ink">$100,000</span> of {cur.c.name}. Over the {tenor} it fell <span className="font-semibold text-bad">{pct(cur.c.fall, 1)}</span>.
            </p>
            <div className="grid grid-cols-2 gap-3 mt-5">
              <div className="rounded-2xl p-4" style={{ background: "rgb(var(--bad-rgb) / 0.08)" }}>
                <div className="text-xs text-ink2">Without protection you had</div>
                <div className="text-2xl sm:text-3xl font-semibold tabular text-bad mt-1">{usd(P + cur.o.without)}</div>
              </div>
              <div className="rounded-2xl p-4" style={{ background: "rgb(var(--good-rgb) / 0.10)" }}>
                <div className="text-xs text-ink2">With InsureVEX you had</div>
                <div className="text-2xl sm:text-3xl font-semibold tabular text-good mt-1">{usd(P + cur.o.with)}</div>
              </div>
            </div>
            {cur.o.status === "paid" && (
              <p className="text-sm text-ink2 mt-4 leading-relaxed">
                The protection cost <span className="font-semibold text-ink">{usd(cur.o.fee)}</span> and paid you <span className="font-semibold text-good">{usd(cur.o.payout)}</span> on the official closing price, automatically.
                That is <span className="font-semibold text-ink">{usd(cur.o.with - cur.o.without)}</span> more in your pocket.
              </p>
            )}
            {cur.o.status === "nopay" && <p className="text-sm text-ink2 mt-4">The drop stayed under {pct(terms.deductible, 0)}, so there was nothing to pay. You only paid the {usd(cur.o.fee)} fee, like an insurance you did not need.</p>}
            {cur.o.status === "refused" && <p className="text-sm text-ink2 mt-4">No protection was sold that day: the price was already collapsing, so the fee would have been over 1% a week. Saying no to those is what keeps savers' money safe.</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Kpi small value={pct(avgWithout / P, 1)} tone="bad" label={`average loss without protection (${sold.length} crashes)`} />
            <Kpi small value={pct(avgWith / P, 1)} tone="good" label="average loss with InsureVEX, fee included" />
          </div>
        </div>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ 2. who pays
function WhoPays({ m }) {
  const lr = m.lossRatio;
  return (
    <Section className="pt-16 sm:pt-24">
      <SectionHead id="who" eyebrow="2 · Who pays for this?" title="Savers back the protection. They win too.">
        The fees stock owners pay go into one pool. Crash payouts come out of that pool. What is left over is the savers' profit.
      </SectionHead>
      <div className="card p-5 sm:p-7">
        <div className="font-semibold">Out of every $100 of protection fees, since 2001</div>
        <div className="mt-4 flex h-12 rounded-xl overflow-hidden text-sm font-semibold text-paper">
          <div className="flex items-center px-4" style={{ width: `${lr * 100}%`, background: MUTED }}>${Math.round(lr * 100)} paid back to stock owners in crashes</div>
          <div className="flex items-center px-3" style={{ width: `${(1 - lr) * 100}%`, background: GOOD }}>${Math.round((1 - lr) * 100)} profit</div>
        </div>
        <div className="grid sm:grid-cols-3 gap-4 mt-6 text-sm">
          {[
            ["Savers", "Put money in and get it back, guaranteed. Most of it sits in US government bonds (T-bills); a small part backs the protection and earns the fees."],
            ["Pro investors (optional)", "Take the first loss in a crash, before any saver. In return they earn a bigger share of the fees."],
            ["Stock owners", "Pay a small weekly fee. In a crash they are paid back automatically, on the official closing price."],
          ].map(([t, d]) => (
            <div key={t}><div className="font-semibold">{t}</div><p className="text-ink2 mt-1 leading-relaxed">{d}</p></div>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ 3. depositors
function Depositors({ m }) {
  const a = m.saverAll;
  const data = m.savers.map((s) => ({
    name: monthName(s.issue.slice(0, 7)), story: s.story,
    deposit: Math.round((s.note / 1000) * P), tbills: Math.round((s.tbill / 1000) * P), stocks: Math.round((s.stocks / 1000) * P),
  }));
  return (
    <Section className="pt-16 sm:pt-24">
      <SectionHead id="depositors" eyebrow="3 · For savers" title="Save $100,000 right before a crash. Three years later, you have more. Every time.">
        We checked every month since 2005. Most of the money buys government bonds that grow back to the full amount by the end date; the rest earns the protection fees.
      </SectionHead>
      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <Kpi value="0" tone="good" label={`savings plans that lost money, out of ${a.notes.toLocaleString()} started every month since 2005`} />
        <Kpi value={usd((a.worstPer1000 / 1000) * P)} label={`the worst savings plan ever (started ${monthName(a.worstIssue.slice(0, 7))}, when interest rates were near zero)`} />
        <Kpi value={usd((a.worstStocksPer1000 / 1000) * P)} tone="bad" label={`the worst result for the same money put straight into stocks; that lost money ${a.stocksBelow100} times`} />
      </div>
      <div className="card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><div className="font-semibold">$100,000 saved just before each crash, 3 years later</div><div className="text-xs text-muted">Dashed line: the $100,000 you put in. Red: you lost money.</div></div>
        <div className="h-80 mt-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }} barGap={2}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="name" {...axis} />
              <YAxis {...axis} width={52} domain={[60000, "auto"]} tickFormatter={usdK} />
              <Tooltip contentStyle={tip} cursor={{ fill: "var(--sunk)" }} labelFormatter={(l, p) => p?.[0]?.payload?.story || l}
                formatter={(v, k) => [usd(v), k === "deposit" ? "InsureVEX savings plan" : k === "tbills" ? "Government bonds only" : "S&P 500 instead"]} />
              <Legend formatter={(k) => <span style={{ color: "var(--ink2)", fontSize: 12 }}>{k === "deposit" ? "InsureVEX savings plan" : k === "tbills" ? "Government bonds only" : "S&P 500 instead"}</span>} />
              <ReferenceLine y={P} stroke="var(--ink)" strokeDasharray="4 4" />
              <Bar dataKey="deposit" fill={GOOD} radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="tbills" fill={MUTED} radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="stocks" fill={OTHER} radius={[4, 4, 0, 0]} maxBarSize={28}>
                {data.map((d) => <Cell key={d.name} fill={d.stocks < P ? BAD : OTHER} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-sm text-ink2 mt-3 leading-relaxed">
          After some crashes the stock market bounced back and did better. The savings plan has a different job: it never gives back less than you put in, and it still beats government bonds.
        </p>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ 4. the pool
function Pool({ m }) {
  const lp = m.lp;
  const [years, setYears] = useState(5);
  const r = lp.rolling.find((x) => x.years === years);
  const rows = useMemo(() => lp.curve.map(([d, pool, tb]) => ({ d, pool: Math.round(pool * P), tb: Math.round(tb * P) })), [lp]);
  return (
    <Section className="pt-16 sm:pt-24">
      <SectionHead id="pool" eyebrow="4 · The pool" title="The pool that pays for crashes grew through every one of them.">
        This is $100,000 left in the pool since {lp.from.slice(0, 4)}: it collects the fees, pays every payout, and keeps spare cash in government bonds. Dashed lines mark the bottom of each big crash.
      </SectionHead>
      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <Kpi value={pct(lp.outOfSample.apy, 1)} tone="good" label={`a year, tested honestly: every year's settings chosen only from earlier data (${lp.outOfSample.years} years)`} />
        <Kpi value={pct(lp.outOfSample.overTbills, 1)} label="a year more than government bonds" />
        <Kpi value={pct(lp.outOfSample.worstYear, 0)} tone="bad" label={`the worst calendar year (${lp.outOfSample.worstYearLabel}, the financial crisis)`} />
      </div>
      <div className="card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><div className="font-semibold">$100,000 in the pool vs in government bonds</div><div className="text-xs text-muted">Replayed {lp.from.slice(0, 4)}–{lp.to.slice(0, 4)}</div></div>
        <div className="h-80 mt-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="d" {...axis} minTickGap={48} tickFormatter={(d) => d.slice(0, 4)} />
              <YAxis {...axis} width={58} tickFormatter={usdK} />
              <Tooltip contentStyle={tip} labelFormatter={monthName} formatter={(v, k) => [usd(v), k === "pool" ? "The pool" : "Government bonds only"]} />
              <Legend formatter={(k) => <span style={{ color: "var(--ink2)", fontSize: 12 }}>{k === "pool" ? "The pool" : "Government bonds only"}</span>} />
              {lp.crashes.map((c) => <ReferenceLine key={c.start} x={c.troughAt} stroke="var(--muted)" strokeDasharray="3 4" />)}
              <Line type="monotone" dataKey="pool" dot={false} strokeWidth={2} stroke={GOOD} />
              <Line type="monotone" dataKey="tb" dot={false} strokeWidth={2} stroke={MUTED} strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="card p-5 sm:p-6 mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="font-semibold">Pick the worst possible day to put $100,000 in. After…</div>
          <Seg value={years} onChange={setYears} options={lp.rolling.map((x) => ({ value: x.years, label: `${x.years} yr${x.years > 1 ? "s" : ""}` }))} />
        </div>
        <div className="grid sm:grid-cols-3 gap-3 mt-4">
          {[["Worst start", r.worst, monthName(r.worst.start)], ["Typical start", r.median, "median"], ["Best start", r.best, monthName(r.best.start)]].map(([t, x, when]) => (
            <div key={t} className="rounded-2xl bg-sunk p-4">
              <div className="text-xs text-muted">{t} ({when})</div>
              <div className={`text-3xl font-semibold tabular mt-1 ${x.mult < 1 ? "text-bad" : t === "Best start" ? "text-good" : ""}`}>{usd(x.mult * P)}</div>
              <div className="text-sm text-ink2">{pct(x.apy, 1, true)} a year</div>
            </div>
          ))}
        </div>
        <p className="text-sm text-ink2 mt-4">
          {r.lost === 0 ? <>Of {r.windows} possible start months, <span className="font-semibold text-ink">not one</span> ended below $100,000 after {years} years.</> : <>Of {r.windows} possible start months, {r.lost} ended below $100,000 after {years} year{years > 1 ? "s" : ""}.</>}
        </p>
      </div>
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm min-w-[620px]">
          <thead><tr className="text-left text-xs text-muted border-b border-line">
            <th className="px-5 py-3 font-medium">$100,000 in the pool the month before…</th><th className="px-3 py-3 font-medium text-right">Lowest point</th>
            <th className="px-3 py-3 font-medium text-right">Back to $100k in</th><th className="px-3 py-3 font-medium text-right">5 years later</th><th className="px-5 py-3 font-medium text-right">Government bonds</th>
          </tr></thead>
          <tbody className="divide-y divide-line">
            {lp.crashes.map((c) => (
              <tr key={c.start}>
                <td className="px-5 py-3 font-medium">{c.event}<div className="text-xs text-muted font-normal">from {monthName(c.start)}</div></td>
                <td className="px-3 py-3 text-right tabular text-bad">{usd(c.trough * P)}</td>
                <td className="px-3 py-3 text-right tabular">{c.monthsUnderwater} months</td>
                <td className="px-3 py-3 text-right tabular font-semibold text-good">{c.after5y ? usd(c.after5y * P) : <span className="text-muted font-normal">{usd(c.after1y * P)} after 1 yr</span>}</td>
                <td className="px-5 py-3 text-right tabular text-muted">{c.tbill5y ? usd(c.tbill5y * P) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ 5. pro investors
function Pro({ m }) {
  const pro = m.pro;
  if (!pro) return null;
  const data = pro.years.map((y) => ({ year: String(y.year), pro: y.ret, dep: y.depositRet }));
  return (
    <Section className="pt-16 sm:pt-24">
      <SectionHead id="pro" eyebrow="5 · For Pro investors" title="Pro investors stand in front. When a crash hits, they take it, so savers don't.">
        Pro investors are people who choose to take the first loss in a crash, and earn a bigger share of the fees for it. Look at {pro.worst.year}: Pro investors lost {pct(-pro.worst.ret, 0)}, and the savers' side of the pool still made {pct(pro.worst.depositRet, 0, true)}.
      </SectionHead>
      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <Kpi value={usd(pro.mult * P)} tone="good" label={`what $100,000 of Pro money became, ${pro.from}–${pro.to} (${pct(pro.cagr, 1)} a year)`} />
        <Kpi value={`${pro.negativeYears} of ${pro.years.length}`} label={`years Pro investors lost money; never wiped out (worst ${pct(pro.worst.ret, 0)} in ${pro.worst.year}, best ${pct(pro.best.ret, 0, true)} in ${pro.best.year})`} />
        <Kpi value={`${pro.years.filter((y) => y.depositRet < 0).length} of ${pro.years.length}`} tone="good" label="years the savers' side lost money while Pro stood in front" />
      </div>
      <div className="card p-5">
        <div className="font-semibold">Return each year: Pro investors vs the savers' side of the pool</div>
        <div className="h-80 mt-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }} barGap={1}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="year" {...axis} interval="preserveStartEnd" minTickGap={14} />
              <YAxis {...axis} width={46} tickFormatter={(v) => pct(v, 0)} />
              <Tooltip contentStyle={tip} cursor={{ fill: "var(--sunk)" }} formatter={(v, k) => [pct(v, 1, true), k === "pro" ? "Pro investors" : "Savers' side"]} />
              <Legend formatter={(k) => <span style={{ color: "var(--ink2)", fontSize: 12 }}>{k === "pro" ? "Pro investors (take the first loss)" : "Savers' side"}</span>} />
              <ReferenceLine y={0} stroke="var(--muted)" />
              <Bar dataKey="pro" fill={OTHER} radius={[3, 3, 0, 0]} maxBarSize={16}>
                {data.map((d) => <Cell key={d.year} fill={d.pro < 0 ? BAD : OTHER} />)}
              </Bar>
              <Bar dataKey="dep" fill={GOOD} radius={[3, 3, 0, 0]} maxBarSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-muted mt-2">Today's prices and rules replayed over 2005–2026, with hindsight, so it looks a little better than real life. Pro money can lose; it is not a savings plan.</p>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ 6. worst case + proof
function WorstAndProof({ m }) {
  const lp = m.lp;
  const five = lp.rolling.find((x) => x.years === 5);
  const worstCover = m.holders.week.filter((c) => c.quoted && c.fall < 0).map((c) => ({ c, o: outcome(c) })).sort((a, b) => a.o.with - b.o.with)[0];
  const cards = [
    ["Stock owner", `${usd(P + worstCover.o.with)} left, not ${usd(P + worstCover.o.without)}`, `The worst week in our list, ${worstCover.c.event}. Payouts stop at 20%, so a giant crash still hurts, just far less. In a calm week you only pay the small fee.`],
    ["Saver", "$100,000 back. Always.", `${m.saverAll.notes.toLocaleString()} savings plans since 2005; the worst returned ${usd((m.saverAll.worstPer1000 / 1000) * P)}. The government-bond part is never used to pay anyone's crash.`],
    ["Pool / Pro", `${usd((1 + lp.maxDrawdown) * P)} at the very bottom`, `The pool's deepest dip, COVID in March 2020, was back in 11 months. Over any 5 years it still made at least ${pct(five.worst.apy, 1)} a year. Pro investors' worst year was ${pct(m.pro?.worst.ret ?? null, 0)}.`],
  ];
  return (
    <>
      <Section className="pt-16 sm:pt-24">
        <SectionHead id="worst" eyebrow="6 · The worst case" title="We don't hide the worst case. Here it is.">Not the average. The single worst outcome for each person in 25 years.</SectionHead>
        <div className="grid lg:grid-cols-3 gap-3">
          {cards.map(([who, big, small]) => (
            <div key={who} className="card p-6">
              <div className="eyebrow">{who}</div>
              <div className="font-display text-2xl tracking-tight mt-2 leading-tight">{big}</div>
              <p className="text-sm text-ink2 mt-3 leading-relaxed">{small}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section className="pt-16 sm:pt-24 pb-6">
        <div className="card p-6 sm:p-10 bg-ink text-paper">
          <div className="eyebrow !text-paper/70">7 · Not a slide</div>
          <h2 className="font-display text-3xl sm:text-4xl tracking-tight mt-2 max-w-3xl">It is live on three blockchains today. Try it with test money.</h2>
          <p className="mt-3 text-paper/80 max-w-2xl">Same rules as the numbers above: protection on stocks in 23 countries, a savings plan that cannot lose, and a pool that sets every payout aside before it sells protection.</p>
          <div className="flex flex-wrap gap-3 mt-6">
            <Link href="/protect" className="btn-primary !bg-paper !text-ink">Protect a stock</Link>
            {[["/save", "Start saving"], ["/pool", "See the pool"], ["/activity", "See everything that happened"]].map(([href, t]) => (
              <Link key={href} href={href} className="inline-flex items-center rounded-xl border border-paper/30 bg-transparent px-4 py-2.5 text-sm font-medium text-paper hover:bg-paper/10">{t}</Link>
            ))}
          </div>
          <p className="mt-5 text-xs text-paper/60">Runs on Whitechain (USDT), Hedera (tokenised stocks) and Arc (USDC).</p>
        </div>
        <p className="text-xs text-muted mt-6 leading-relaxed max-w-3xl">
          Backtest on real daily prices from 23 stock markets, {lp.from.slice(0, 4)}–{lp.to.slice(0, 4)}: what would have happened, not a promise. Protection fees are what our pricing would have charged at the time, using only earlier data.
          Pool: recommended setting (half the money kept in reserve, at most 5% on any one stock); with no hindsight {pct(lp.outOfSample.apy, 1)} a year, deepest fall {pct(lp.outOfSample.maxDrawdown, 1)}. Today's big companies are over-represented, so real results would be lower.
          Sources: <span className="font-mono">backtest/results</span>, built by <span className="font-mono">app/scripts/build-metrics.mjs</span>.
        </p>
      </Section>
    </>
  );
}

export default function MetricsPage() {
  const { data: m } = useData("metrics.json");
  const vw = m?.holders.week.find((x) => x.ticker === "VOW3.DE");
  const vwo = vw && outcome(vw);
  const sold = m ? m.holders.week.filter((c) => c.fall <= -0.05 && c.quoted).map(outcome) : [];
  const cut = sold.length ? 1 - sold.reduce((s, o) => s + o.with, 0) / sold.reduce((s, o) => s + o.without, 0) : null;
  return (
    <>
      <div className="mx-auto max-w-page px-4 pt-10 sm:pt-16">
        <div className="eyebrow mb-3">Proof · 25 years of crashes</div>
        <h1 className="font-display text-4xl sm:text-6xl leading-[1.02] tracking-tight max-w-5xl">
          We replayed every big stock crash since 2001. With InsureVEX, stock owners lost {cut ? <span className="text-good">{Math.round(cut * 100)}% less</span> : "far less"}.
        </h1>
        <p className="text-ink2 mt-5 text-lg leading-relaxed max-w-2xl">
          And the savers who backed that protection never lost a dollar. Real prices, 23 countries, the same $100,000 every time.
        </p>
        <div className="flex flex-wrap gap-2 mt-6">
          {[["#crashes", "I own stocks"], ["#depositors", "I want to save safely"], ["#pool", "The pool"], ["#pro", "Pro investors"], ["#worst", "Worst case"]].map(([href, label]) => (
            <a key={href} href={href} className="chip hover:bg-sunk">{label}</a>
          ))}
        </div>
      </div>
      {!m ? (
        <div className="mx-auto max-w-page px-4 mt-8"><div className="card h-96 animate-pulse" /></div>
      ) : (
        <>
          <div className="mx-auto max-w-page px-4 mt-8 grid sm:grid-cols-3 gap-3">
            <Kpi value={`${usd(vwo.without)} → ${usd(vwo.with)}`} small tone="good" label="$100,000 of Volkswagen in the Dieselgate week: what you lost without and with InsureVEX" />
            <Kpi value="0" tone="good" label={`savings plans that lost money, out of ${m.saverAll.notes.toLocaleString()} since 2005`} />
            <Kpi value={`${pct(m.lp.outOfSample.apy, 1)}`} tone="good" label="a year earned by the pool, tested with no hindsight" />
          </div>
          <CrashBoard m={m} />
          <WhoPays m={m} />
          <Depositors m={m} />
          <Pool m={m} />
          <Pro m={m} />
          <WorstAndProof m={m} />
        </>
      )}
    </>
  );
}
