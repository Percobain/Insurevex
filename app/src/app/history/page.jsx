"use client";
import { useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Legend } from "recharts";
import { useData } from "@/lib/api";
import { Section, SectionHead, Seg } from "@/components/ui";

const P = 100_000;
const usd = (v, { sign = false } = {}) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const s = "$" + Math.round(Math.abs(v)).toLocaleString("en-US");
  // U+2060 word joiner keeps the sign glued to the number
  return v < 0 ? `−⁠${s}` : sign && v > 0 ? `+⁠${s}` : s;
};
const pct = (v, dp = 1, sign = false) => (v === null || v === undefined ? "—" : `${v < 0 ? "−" : sign && v > 0 ? "+" : ""}${Math.abs(v * 100).toFixed(dp)}%`);
const monthName = (ym) => {
  const [y, m] = String(ym).split("-");
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m) - 1]} ${y}`;
};
const tip = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12, color: "var(--ink)" };
const axis = { stroke: "var(--muted)", fontSize: 11, tickLine: false, axisLine: false };

/** What a $100k holder ends with for one crash card. */
function holderOutcome(c) {
  const without = P * c.fall;
  if (!c.quoted) return { without, with: without, fee: 0, payout: 0, status: "refused" };
  const fee = P * (c.fee || 0), payout = P * (c.payout || 0);
  return { without, with: without + payout - fee, fee, payout, status: payout > 0 ? "paid" : "nopay" };
}

function Bar({ value, max, tone, label }) {
  const w = max > 0 ? Math.min(100, (Math.abs(Math.min(value, 0)) / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-sm"><span className="text-ink2">{label}</span><span className={`tabular font-semibold ${value < 0 ? (tone === "bad" ? "text-bad" : "text-ink") : "text-good"}`}>{usd(value, { sign: true })}</span></div>
      <div className="h-3 rounded-full bg-sunk overflow-hidden" title={`${label}: ${usd(value)}`}>
        <div className="h-full rounded-full" style={{ width: `${w}%`, background: tone === "bad" ? "rgb(var(--bad-rgb))" : "rgb(var(--good-rgb))" }} />
      </div>
    </div>
  );
}

function BigNumber({ value, label, tone, small }) {
  return (
    <div className="card p-5">
      <div className={`${small ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl"} font-semibold tracking-tight tabular ${tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : ""}`}>{value}</div>
      <div className="text-sm text-ink2 mt-2 leading-snug">{label}</div>
    </div>
  );
}

// ------------------------------------------------------------------ Holders
function HolderSection({ h }) {
  const [tenor, setTenor] = useState("week");
  // only real crashes: the stock or index fell at least 5% over the cover period
  const cards = h.holders[tenor].filter((c) => c.fall <= -0.05);
  const big = useMemo(() => cards.filter((c) => c.fall <= -0.1), [cards]);
  const [sel, setSel] = useState("VW Dieselgate|VOW3.DE");
  const card = cards.find((c) => `${c.event}|${c.ticker}` === sel) || big[0] || cards[0];
  const o = holderOutcome(card);
  const terms = h.coverTerms[tenor];
  const max = Math.max(Math.abs(o.without), Math.abs(o.with), 1);
  const sold = cards.filter((c) => c.quoted).map(holderOutcome);
  const avgWithout = sold.reduce((s, x) => s + x.without, 0) / (sold.length || 1);
  const avgWith = sold.reduce((s, x) => s + x.with, 0) / (sold.length || 1);
  return (
    <Section className="pt-10 sm:pt-16">
      <SectionHead id="holder" eyebrow="1 · If you own stocks" title="You hold $100,000 of one stock. Then the crash comes.">
        Pick a real crash. Cover pays the fall beyond {pct(terms.deductible, 0)}, up to {pct(terms.cap, 0)} of the value, on the official close. The cost is the premium the engine would have charged that day, with no hindsight.
      </SectionHead>
      <div className="mb-4"><Seg value={tenor} onChange={setTenor} options={[{ value: "week", label: "1-week cover (pays beyond 5%)" }, { value: "month", label: "1-month cover (pays beyond 10%)" }]} /></div>
      <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-4 items-start">
        <div className="card p-2 max-h-[30rem] overflow-y-auto">
          {cards.map((c) => {
            const k = `${c.event}|${c.ticker}`;
            const x = holderOutcome(c);
            const on = k === `${card.event}|${card.ticker}`;
            return (
              <button key={k} onClick={() => setSel(k)} className={`w-full text-left rounded-xl px-3 py-2.5 flex items-center justify-between gap-3 ${on ? "bg-ink text-paper" : "hover:bg-sunk"}`}>
                <span className="min-w-0">
                  <span className="block text-sm font-medium truncate">{c.event}</span>
                  <span className={`block text-xs truncate ${on ? "opacity-70" : "text-muted"}`}>{c.name} · {c.market} · {monthName(c.date.slice(0, 7))}</span>
                </span>
                <span className="text-right shrink-0">
                  <span className={`block text-sm tabular font-semibold ${on ? "" : "text-bad"}`}>{pct(c.fall, 1)}</span>
                  <span className={`block text-xs tabular ${on ? "opacity-70" : x.status === "paid" ? "text-good" : "text-muted"}`}>{x.status === "paid" ? `saved ${usd(x.with - x.without)}` : x.status === "refused" ? "not sold" : "no payout"}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="card p-5 sm:p-7">
          <div className="text-xs text-muted">{card.market} · {card.name} ({card.ticker}) · {terms.label} from {card.date}</div>
          <h3 className="font-display text-2xl sm:text-3xl tracking-tight mt-1">{card.event}</h3>
          <p className="text-ink2 mt-2">{card.name} fell <span className="font-semibold text-bad">{pct(card.fall, 1)}</span> over the {tenor === "week" ? "week" : "month"}.</p>
          <div className="mt-6 space-y-5">
            <Bar label="Without protection" value={o.without} max={max} tone="bad" />
            <Bar label="With InsureVEX" value={o.with} max={max} tone="good" />
          </div>
          {o.status === "paid" && (
            <>
              <div className="mt-6 rounded-2xl bg-accentSoft p-5">
                <div className="text-sm text-ink2">You keep</div>
                <div className="text-4xl font-semibold tracking-tight tabular text-good">{usd(o.with - o.without, { sign: true })}</div>
                <div className="text-sm text-ink2 mt-1">more of your $100,000 than an unprotected holder.</div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-xl bg-sunk p-3"><div className="text-muted text-xs">Stock fell</div><div className="tabular font-semibold text-bad">{usd(o.without)}</div></div>
                <div className="rounded-xl bg-sunk p-3"><div className="text-muted text-xs">Cover paid you</div><div className="tabular font-semibold text-good">{usd(o.payout, { sign: true })}</div></div>
                <div className="rounded-xl bg-sunk p-3"><div className="text-muted text-xs">Cover cost</div><div className="tabular font-semibold">{usd(-o.fee)}</div></div>
              </div>
            </>
          )}
          {o.status === "nopay" && <p className="mt-6 rounded-2xl bg-sunk p-4 text-sm text-ink2">The fall stayed inside the {pct(terms.deductible, 0)} deductible, so there was no payout. The holder only paid the premium: <span className="font-semibold">{usd(-o.fee)}</span>.</p>}
          {o.status === "refused" && <p className="mt-6 rounded-2xl bg-sunk p-4 text-sm text-ink2">No cover was sold: the stock was already falling so fast that the engine refused to quote (the premium would have been over 1% a week). This is what protects the Savers' money, and it is why we show it.</p>}
        </div>
      </div>
      <div className="grid sm:grid-cols-3 gap-3 mt-4">
        <BigNumber value={pct(avgWithout / P, 1)} tone="bad" label={`Average loss without protection, across the ${sold.length} crashes of 5% or more where cover was sold`} />
        <BigNumber value={pct(avgWith / P, 1)} tone="good" label="Average loss with InsureVEX, cost of cover included" />
        <BigNumber value={usd(avgWith - avgWithout, { sign: true })} label="Kept per $100,000, on average, per crash" />
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ Savers
function SaverSection({ h }) {
  const a = h.saverAll;
  return (
    <Section className="pt-10 sm:pt-16">
      <SectionHead id="saver" eyebrow="2 · If you are saving" title="You put $100,000 in a 3-year note at the worst possible moment.">
        Most of it buys T-bills that grow back to $100,000 by maturity. The rest earns the Holders' premiums. Compare it with putting the same money in the S&P 500.
      </SectionHead>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {h.savers.map((s) => {
          const note = (s.note / 1000) * P, stocks = (s.stocks / 1000) * P, tb = (s.tbill / 1000) * P;
          const max = Math.max(note, stocks, tb);
          const rows = [["InsureVEX note", note, "good"], ["T-bills only", tb, "muted"], ["S&P 500 instead", stocks, stocks < P ? "bad" : "muted"]];
          return (
            <div key={s.issue} className="card p-5">
              <div className="text-xs text-muted">{monthName(s.issue.slice(0, 7))} → {monthName(s.maturity.slice(0, 7))} · T-bill rate {pct(s.rate, 1)}</div>
              <div className="font-semibold mt-1">{s.story}</div>
              <div className="mt-4 space-y-3">
                {rows.map(([k, v, tone]) => (
                  <div key={k}>
                    <div className="flex justify-between text-sm"><span className="text-ink2">{k}</span><span className={`tabular font-semibold ${tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : ""}`}>{usd(v)}</span></div>
                    <div className="h-2 rounded-full bg-sunk mt-1 relative overflow-hidden" title={`${k}: ${usd(v)}`}>
                      <div className="h-full rounded-full" style={{ width: `${(v / max) * 100}%`, background: tone === "good" ? "rgb(var(--good-rgb))" : tone === "bad" ? "rgb(var(--bad-rgb))" : "rgb(var(--muted-rgb))" }} />
                      <div className="absolute top-0 bottom-0 w-px bg-ink" style={{ left: `${(P / max) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-xs text-muted mt-3">The thin line marks the $100,000 you put in.</div>
            </div>
          );
        })}
      </div>
      <p className="text-sm text-ink2 mt-4 max-w-3xl">
        After some crashes stocks recovered and beat the note. The note does a different job: whatever the market does, you cannot get back less than you put in, and you still beat T-bills.
      </p>
      <div className="grid sm:grid-cols-3 gap-3 mt-4">
        <BigNumber value={a.below100 === 0 ? "$0" : String(a.below100)} tone="good" label={`lost by any Saver: ${a.notes.toLocaleString()} notes started every month since 2005 (1, 3 and 5 years), not one paid back less than $100,000`} />
        <BigNumber value={usd((a.worstPer1000 / 1000) * P)} label={`the worst note in history (${a.worstT}-year, from ${monthName(a.worstIssue.slice(0, 7))}, when rates were near zero): still more than you put in`} />
        <BigNumber value={usd((a.worstStocksPer1000 / 1000) * P)} tone="bad" label={`the worst outcome for the same money held directly in the asset instead; it lost money in ${a.stocksBelow100.toLocaleString()} of those periods`} />
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ LPs
function LpSection({ h }) {
  const lp = h.lp;
  const [years, setYears] = useState(5);
  const r = lp.rolling.find((x) => x.years === years);
  const rows = useMemo(() => lp.curve.map(([d, pool, tb]) => ({ d, pool: Math.round(pool * P), tb: Math.round(tb * P) })), [lp]);
  const marks = lp.crashes.map((c) => c.troughAt);
  return (
    <Section className="pt-10 sm:pt-16">
      <SectionHead id="lp" eyebrow="3 · If you back the pool" title={`You put $100,000 in the underwriting pool in ${monthName(lp.from)}.`}>
        The pool collects every premium and pays every claim. Idle cash sits in T-bills. This is the recommended setting: half the capital held back as a reserve.
      </SectionHead>
      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <BigNumber value={usd(lp.mult * P)} tone="good" label={`what $100,000 became by ${monthName(lp.to)}, ${pct(lp.cagr, 1)} a year (full backtest)`} />
        <BigNumber value={usd(lp.tbillMult * P)} label={`the same money in T-bills only, ${pct(lp.tbillCagr, 1)} a year`} />
        <BigNumber value={pct(lp.outOfSample.apy, 1)} label={`a year out of sample: each year's settings chosen only from earlier data (${lp.outOfSample.years} years, ${pct(lp.outOfSample.overTbills, 1)} above T-bills)`} />
      </div>
      <div className="card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <div className="font-semibold">$100,000 in the pool vs T-bills, {lp.from.slice(0, 4)}–{lp.to.slice(0, 4)}</div>
          <div className="text-xs text-muted">Dashed lines mark the bottom of each crash.</div>
        </div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="d" {...axis} minTickGap={48} tickFormatter={(d) => d.slice(0, 4)} />
              <YAxis {...axis} width={58} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
              <Tooltip contentStyle={tip} labelFormatter={monthName} formatter={(v, k) => [usd(v), k === "pool" ? "Underwriting pool" : "T-bills only"]} />
              <Legend formatter={(k) => <span style={{ color: "var(--ink2)", fontSize: 12 }}>{k === "pool" ? "Underwriting pool" : "T-bills only"}</span>} />
              {marks.map((m) => <ReferenceLine key={m} x={m} stroke="var(--muted)" strokeDasharray="3 4" />)}
              <Line type="monotone" dataKey="pool" dot={false} strokeWidth={2} stroke="var(--chart-1)" />
              <Line type="monotone" dataKey="tb" dot={false} strokeWidth={2} stroke="var(--muted)" strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card p-5 sm:p-6 mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="font-semibold">Whatever month you started, after</div>
          <Seg value={years} onChange={setYears} options={lp.rolling.map((x) => ({ value: x.years, label: `${x.years} year${x.years > 1 ? "s" : ""}` }))} />
        </div>
        <div className="grid sm:grid-cols-3 gap-3 mt-4">
          <div className="rounded-2xl bg-sunk p-4">
            <div className="text-xs text-muted">Worst start ({monthName(r.worst.start)})</div>
            <div className={`text-3xl font-semibold tabular mt-1 ${r.worst.mult < 1 ? "text-bad" : ""}`}>{usd(r.worst.mult * P)}</div>
            <div className="text-sm text-ink2">{pct(r.worst.apy, 1, true)} a year</div>
          </div>
          <div className="rounded-2xl bg-sunk p-4">
            <div className="text-xs text-muted">Typical start (median)</div>
            <div className="text-3xl font-semibold tabular mt-1">{usd(r.median.mult * P)}</div>
            <div className="text-sm text-ink2">{pct(r.median.apy, 1, true)} a year · T-bills {pct(r.tbillMedianApy, 1)}</div>
          </div>
          <div className="rounded-2xl bg-sunk p-4">
            <div className="text-xs text-muted">Best start ({monthName(r.best.start)})</div>
            <div className="text-3xl font-semibold tabular mt-1 text-good">{usd(r.best.mult * P)}</div>
            <div className="text-sm text-ink2">{pct(r.best.apy, 1, true)} a year</div>
          </div>
        </div>
        <p className="text-sm text-ink2 mt-4">
          {r.lost === 0
            ? <>Out of {r.windows} possible start months, <span className="font-semibold">none</span> ended below $100,000 after {years} years.</>
            : <>Out of {r.windows} possible start months, {r.lost} ended below $100,000 after {years} year{years > 1 ? "s" : ""} ({pct(r.lost / r.windows, 0)}).</>}
        </p>
      </div>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-left text-xs text-muted border-b border-line">
              <th className="px-5 py-3 font-medium">$100,000 in the month before…</th>
              <th className="px-3 py-3 font-medium text-right">Lowest point</th>
              <th className="px-3 py-3 font-medium text-right">Back above $100k</th>
              <th className="px-3 py-3 font-medium text-right">1 year later</th>
              <th className="px-3 py-3 font-medium text-right">5 years later</th>
              <th className="px-5 py-3 font-medium text-right">T-bills, 5 years</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lp.crashes.map((c) => (
              <tr key={c.start}>
                <td className="px-5 py-3"><div className="font-medium">{c.event}</div><div className="text-xs text-muted">from {monthName(c.start)}</div></td>
                <td className="px-3 py-3 text-right tabular text-bad">{usd(c.trough * P)}<div className="text-xs text-muted">{pct(c.trough - 1, 1)}</div></td>
                <td className="px-3 py-3 text-right tabular">{c.monthsUnderwater === null ? "—" : `${c.monthsUnderwater} months`}</td>
                <td className="px-3 py-3 text-right tabular">{usd(c.after1y * P)}</td>
                <td className="px-3 py-3 text-right tabular font-semibold">{c.after5y ? usd(c.after5y * P) : "—"}</td>
                <td className="px-5 py-3 text-right tabular text-muted">{c.tbill5y ? usd(c.tbill5y * P) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ worst cases
function WorstCases({ h }) {
  const lp = h.lp;
  const five = lp.rolling.find((x) => x.years === 5);
  const holderWorst = h.holders.week.filter((c) => c.quoted && c.fall < 0).map((c) => ({ c, o: holderOutcome(c) })).sort((a, b) => a.o.with - b.o.with)[0];
  const fees = h.holders.week.filter((c) => c.quoted && c.fee).map((c) => c.fee).sort((a, b) => a - b);
  const rows = [
    ["Saver", `${usd(P)} back, always.`, `In ${h.saverAll.notes.toLocaleString()} historical notes the worst result was ${usd((h.saverAll.worstPer1000 / 1000) * P)}. The T-bill floor is never used to pay claims.`],
    ["Holder", `The worst covered crash: ${usd(holderWorst.o.with)} instead of ${usd(holderWorst.o.without)}.`, `${holderWorst.c.event} (${holderWorst.c.name}): the payout is capped at 20%, so a fall bigger than 25% still hurts, just much less. If nothing crashes, you lose only the premium: ${pct(fees[0], 2)} to ${pct(fees[fees.length - 1], 2)} of the value for the week.`],
    ["Pool backer", `${usd((1 + lp.maxDrawdown) * P)} at the very bottom.`, `The deepest fall was ${pct(lp.maxDrawdown, 1)} (${monthName(lp.maxDrawdownAt)}, COVID), back above the old high within a year. Over any 5 years the worst result was still ${pct(five.worst.apy, 1, true)} a year. In ${lp.bootstrap.paths.toLocaleString()} simulated futures, the chance of being down after ${lp.bootstrap.years} years is ${pct(lp.bootstrap.pLoss5y, 1)}.`],
  ];
  return (
    <Section className="pt-10 sm:pt-16">
      <SectionHead id="worst" eyebrow="4 · The worst case" title="The worst that ever happened to each person.">Not the average. The worst month, the worst crash, the worst start date.</SectionHead>
      <div className="grid lg:grid-cols-3 gap-3">
        {rows.map(([who, big, small]) => (
          <div key={who} className="card p-6">
            <div className="eyebrow">{who}</div>
            <div className="font-display text-2xl tracking-tight mt-2 leading-tight">{big}</div>
            <p className="text-sm text-ink2 mt-3 leading-relaxed">{small}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted mt-6 leading-relaxed max-w-3xl">
        Backtest on real daily prices from 23 stock markets, {lp.from.slice(0, 4)}–{lp.to.slice(0, 4)}: what would have happened, not a promise. Premiums are what the pricing engine would have charged at the time, using only data available then.
        Pool figures use the recommended setting (50% reserve, 25% of capacity sold, 5% per stock); out of sample it earned {pct(lp.outOfSample.apy, 1)} a year with a worst fall of {pct(lp.outOfSample.maxDrawdown, 1)} and a worst year of {pct(lp.outOfSample.worstYear, 1)} ({lp.outOfSample.worstYearLabel}).
        Today's large companies are over-represented (survivorship), so real results would be lower. Source: <span className="font-mono">backtest/results</span>, generated by <span className="font-mono">app/scripts/build-history.mjs</span>.
      </p>
    </Section>
  );
}

export default function HistoryPage() {
  const q = useData("history.json");
  const h = q.data;
  return (
    <>
      <div className="mx-auto max-w-page px-4 pt-10 sm:pt-14 pb-4">
        <div className="eyebrow mb-3">History</div>
        <h1 className="font-display text-4xl sm:text-6xl leading-[1.02] tracking-tight max-w-4xl">Your $100,000 through the worst crashes in history.</h1>
        <p className="text-ink2 mt-5 text-base sm:text-lg leading-relaxed max-w-2xl">
          Real prices from 23 stock markets since 2001. Three people, the same $100,000, with and without InsureVEX.
        </p>
        <div className="flex flex-wrap gap-2 mt-6">
          {[["#holder", "I own stocks"], ["#saver", "I'm saving"], ["#lp", "I back the pool"], ["#worst", "Worst case"]].map(([href, label]) => (
            <a key={href} href={href} className="chip hover:bg-sunk">{label}</a>
          ))}
        </div>
      </div>
      {!h ? (
        <div className="mx-auto max-w-page px-4"><div className="card h-96 animate-pulse" /></div>
      ) : (
        <>
          <div className="mx-auto max-w-page px-4 pb-2">
            <div className="grid sm:grid-cols-3 gap-3">
              <BigNumber value="$0" tone="good" label={`lost by any Saver, in ${h.saverAll.notes.toLocaleString()} notes since 2005`} />
              <BigNumber value={(() => { const c = h.holders.week.find((x) => x.ticker === "VOW3.DE"); const o = holderOutcome(c); return `${usd(o.without)} → ${usd(o.with)}`; })()} small label="a Volkswagen holder's week of Dieselgate, without and with cover" />
              <BigNumber value={`${pct(h.lp.outOfSample.apy, 1)}/yr`} tone="good" label={`earned by the pool out of sample, worst year ${pct(h.lp.outOfSample.worstYear, 0)} (${h.lp.outOfSample.worstYearLabel})`} />
            </div>
          </div>
          <HolderSection h={h} />
          <SaverSection h={h} />
          <LpSection h={h} />
          <WorstCases h={h} />
        </>
      )}
    </>
  );
}
