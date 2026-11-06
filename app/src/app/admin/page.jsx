"use client";
import { useEffect, useMemo, useState } from "react";
import { createPublicClient, http, fallback, formatUnits } from "viem";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, Cell, ReferenceLine,
} from "recharts";
import { hederaTestnet } from "@/lib/chains";
import { PageHead, Section, SectionHead, Panel, Stat, Notice, Placeholder } from "@/components/ui";
import { fmtPct, shortAddr, shortHash, marketLabel } from "@/lib/format";

const tip = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12, color: "var(--ink)" };
const axis = { stroke: "var(--muted)", fontSize: 11, tickLine: false, axisLine: false };

/** $1.23B / $456.7M / $12.3K / $12 */
function usd(x, dp = 1) {
  if (x === undefined || x === null || Number.isNaN(x)) return "—";
  const a = Math.abs(x), s = x < 0 ? "−" : "";
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(dp)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(dp)}K`;
  return `${s}$${a.toFixed(0)}`;
}
const mAxis = (v) => (Math.abs(v) >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : `${(v / 1e6).toFixed(0)}M`);

// Plain-language names for the three groups, used everywhere on this page.
const WHO = {
  Saver: { name: "Saver", plain: "Wants their money back for sure, plus a bit extra" },
  Holder: { name: "Stock owner", plain: "Owns shares and pays a small fee to be protected from a crash" },
  Pro: { name: "Risk-taker", plain: "Earns more, but pays first when a crash happens" },
};

/** The run script writes technical step names; show them in everyday words. */
function plainStep(label) {
  return label
    .replace("Deposits: Savers and Pro LP funded", "Savers and the risk-taker put their money in")
    .replace(/covers bought, collateral locked/, "protections bought, payout money set aside")
    .replace(/settled, (\S+) paid on (\S+) premiums/, "week over: $1 paid out to stock owners, $2 collected in fees")
    .replace(/(\w+) payout of (\S+) held as owed \(wallet on hold\)/, "$1's $2 payout kept safe while their wallet was frozen")
    .replace(/Coupon after (Round \d): (\S+) paid to Savers/, "$2 bonus paid to savers after $1")
    .replace("Round 1, a normal week", "Week 1 (a normal week)")
    .replace("Round 2, the worst week in 21 years (COVID, Feb 2020)", "Week 2 (the COVID crash)");
}
function plainTx(step) {
  return step
    .replace(/IdentityRegistry\.setSystem\((\w+)\)/, "Allow the $1 contract to hold money")
    .replace("pool.grantRole(MARKET_ROLE, CoverMarket)", "Let the protection shop use the pool")
    .replace(/pool\.setRiskParams.*/, "Set the safety limits")
    .replace(/^KYC issuer$/, "Verify the operator's identity")
    .replace(/^KYC (\w+) \(.*\), country (\d+)/, "Verify $1's identity")
    .replace(/^mint (\S+) sUSD -> (\w+)/, "Give $2 $1 in test dollars")
    .replace(/approve (note|pool|CoverMarket)$/, "allow the contract to take the payment")
    .replace(/subscribes (\S+) to the 3Y note/, "saves $1 for 3 years")
    .replace(/deposits (\S+) first-loss/, "puts in $1 as the risk-taker")
    .replace(/ buys (\S+) floor (\S+), premium (\S+) \(.*\)/, " protects $2 of $1 for a fee of $3")
    .replace(/oracle posts (\d+) closes \(replay of week (\S+)\)/, "Price feed posts $1 closing prices (from the week of $2)")
    .replace(/^settle policies .*/, "Pay out the finished protections")
    .replace(/stablecoin issuer puts (\w+) on hold \(blocklist\)/, "Digital-dollar company freezes $1's wallet")
    .replace(/stablecoin issuer lifts the hold on (\w+)/, "Digital-dollar company unfreezes $1's wallet")
    .replace(/(\w+) claims owed payout (\S+)/, "$1 collects their kept-safe payout of $2")
    .replace(/note\.distributeCoupon \((\S+) of underwriting profit\)/, "Pay $1 of profit to savers as a bonus")
    .replace(/(\w+) claims coupon (\S+)/, "$1 collects a $2 bonus")
    .replace(/^deploy (\w+)/, "Launch the $1 contract");
}

const POOL_ABI = ["totalAssets", "juniorAssets", "totalPremiums", "totalPayouts", "totalProLosses", "locked"].map((name) => ({
  type: "function", name, stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }],
}));
const COUNT_ABI = [{ type: "function", name: "policyCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }];

function useLive(run) {
  const [live, setLive] = useState(null);
  const [err, setErr] = useState(null);
  async function load() {
    if (!run?.contracts?.UnderwritingPool || run.chainId !== 296) return;
    try {
      const c = createPublicClient({ chain: hederaTestnet, transport: fallback(hederaTestnet.rpcUrls.default.http.map((u) => http(u))) });
      const pool = run.contracts.UnderwritingPool;
      const vals = await Promise.all(POOL_ABI.map((f) => c.readContract({ address: pool, abi: POOL_ABI, functionName: f.name })));
      const count = await c.readContract({ address: run.contracts.CoverMarket, abi: COUNT_ABI, functionName: "policyCount" });
      const block = await c.getBlockNumber();
      const o = Object.fromEntries(POOL_ABI.map((f, i) => [f.name, Number(formatUnits(vals[i], 6))]));
      setLive({ ...o, policies: Number(count), block: Number(block), at: new Date() });
      setErr(null);
    } catch (e) {
      setErr(e.shortMessage || e.message);
    }
  }
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [run?.contracts?.UnderwritingPool]);
  return { live, err, reload: load };
}

export default function AdminPage() {
  const [run, setRun] = useState(null);
  const [bt, setBt] = useState(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    const local = new URLSearchParams(window.location.search).get("run") === "local"; // dev: the local dry run
    fetch(local ? "/data/stress_run_local.json" : "/data/stress_run.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject())).then(setRun).catch(() => setMissing(true));
    fetch("/data/stress_backtest.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then(setBt).catch(() => {});
  }, []);
  const { live, err, reload } = useLive(run);

  const book = run?.book;
  const saversUsd = book ? book.savers.reduce((a, s) => a + s.usd, 0) : bt?.savers_usd;
  const proUsd = book ? book.pro.reduce((a, s) => a + s.usd, 0) : bt?.pro_usd;
  const allRounds = Object.entries(run?.rounds || {});
  const written = allRounds.reduce((a, [, r]) => a + (r.policies || []).reduce((s, p) => s + p.notional, 0), 0);
  const count = allRounds.reduce((a, [, r]) => a + (r.policies || []).length, 0);

  return (
    <>
      <PageHead eyebrow="Admin · big test" title="We ran billions through it. Here is what happened.">
        First we tested this exact setup on 21 years of real stock prices. Then we ran it for real on a public blockchain, with 8 wallets
        and stocks from 9 countries, including a replay of the COVID crash.
      </PageHead>

      <Section className="pb-4">
        <div className="grid sm:grid-cols-3 gap-3">
          {Object.values(WHO).map((w) => (
            <div key={w.name} className="card p-4">
              <div className="font-semibold">{w.name}</div>
              <div className="text-sm text-ink2 mt-1">{w.plain}</div>
            </div>
          ))}
        </div>
        <p className="text-sm text-ink2 mt-3 max-w-3xl">
          How it fits together: most of the savers' money goes into US government bonds, which grow back to the full amount by themselves.
          The small part left over, plus the risk-taker's money, pays stock owners when their stock crashes. The stock owners' fees become
          the savers' extra.
        </p>
      </Section>

      <Section className="pb-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Saved by savers" value={usd(saversUsd)} sub="for 3 years" />
          <Stat label="Put in by the risk-taker" value={usd(proUsd)} />
          <Stat label="Stock value protected" value={usd(written)} sub={`${count} protections, 9 countries`} />
          <Stat label="Blockchain transactions" value={run ? String(run.txCount) : "—"} sub={run?.chainId === 296 ? "on Hedera, each one public" : run ? "practice run on this computer" : null} />
        </div>
      </Section>
      <Section className="pb-6">
        <Notice tone="warn">
          This is a test. The money is test dollars made for this run, worth nothing. Prices come from real markets today; to finish in
          one day, each "week" lasts a few minutes, and the closing prices are each stock's real move from the week we replay.
        </Notice>
      </Section>

      {missing && !run && (
        <Section className="pb-10"><Placeholder title="No test run yet">Run <code>NET=hedera node scripts/stress-run.js</code> in <code>contracts/</code>.</Placeholder></Section>
      )}

      {run && <LivePanel run={run} live={live} err={err} reload={reload} />}
      {bt && <BacktestSection bt={bt} />}
      {run && <RunSection run={run} />}
      {run && <WalletsSection run={run} />}
      {run && <RoundsSection run={run} />}
      {run && <TxSection run={run} />}
    </>
  );
}

// ------------------------------------------------------------------ live
function LivePanel({ run, live, err, reload }) {
  const last = run.snapshots.at(-1)?.pool;
  return (
    <Section className="pb-12">
      <Panel
        title="Right now, read straight from the blockchain"
        desc={live ? `Updated ${live.at.toLocaleTimeString()}. Refreshes every 30 seconds. Nobody can edit these numbers.` : err ? `Could not reach the blockchain: ${err}` : "Reading the blockchain…"}
        right={<button type="button" className="btn-ghost btn-sm" onClick={reload}>Refresh</button>}
      >
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <Stat label="Savers' money backing protection" value={usd(live?.totalAssets ?? last?.senior)} />
          <Stat label="Risk-taker's money" value={usd(live?.juniorAssets ?? last?.junior)} />
          <Stat label="Fees collected" value={usd(live?.totalPremiums ?? last?.premiums)} />
          <Stat label="Paid out after crashes" value={usd(live?.totalPayouts ?? last?.payouts)} />
          <Stat label="Of that, paid by the risk-taker" value={usd(live?.totalProLosses ?? last?.proLosses)} />
          <Stat label="Protections sold" value={live ? String(live.policies) : "—"} />
        </div>
        <details className="mt-3 text-xs text-muted">
          <summary className="cursor-pointer">See the contracts</summary>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {Object.entries(run.contracts).map(([k, a]) => (
              <a key={k} className="underline underline-offset-2" href={`${run.explorerAddr}${a}`} target="_blank" rel="noreferrer">{k} {shortAddr(a)}</a>
            ))}
          </div>
        </details>
      </Panel>
    </Section>
  );
}

// ------------------------------------------------------------------ backtest
function BacktestSection({ bt }) {
  const yearly = bt.yearly.map((y) => ({ year: y.year, senior: y.senior_ret, pro: y.pro_ret }));
  const lr = Math.round(bt.loss_ratio * 100);
  return (
    <Section className="pb-14">
      <SectionHead eyebrow="Step 1 · test on history" title="We tested this exact setup on every week since 2005">
        {bt.weeks.toLocaleString()} weeks of real stock prices, with the same pricing and the same rules as the live system. (The pricing was
        built from this same history, so the Research page has the stricter test.)
      </SectionHead>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Savers who lost money" value={`0 of ${bt.saver_note_3y.n}`} tone="good"
          sub={`Every 3-year start date. Typical saver got ${fmtPct(bt.saver_note_3y.median - 1, 1)} back on top, vs ${fmtPct(bt.saver_note_3y.tbill - 1, 0)} from bonds alone`} />
        <Stat label="Yearly growth of the savers' backing money" value={`${fmtPct(bt.senior_cagr, 1)}`} sub="never had a losing week" />
        <Stat label="Risk-taker, average year" value={fmtPct(bt.pro_mean_year, 1, { sign: true })}
          sub={`Worst year ${fmtPct(bt.pro_worst_year, 0)}. Lost money in ${bt.pro_years_negative} of ${bt.yearly.length} years`} />
        <Stat label="Of every $1 in fees" value={`${lr}¢ paid back`} sub={`to stock owners after crashes; ${100 - lr}¢ kept as profit`} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <Panel title="How each group did, year by year" desc="The risk-taker absorbs the bad years so the savers don't have to.">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={yearly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                <XAxis dataKey="year" {...axis} minTickGap={8} />
                <YAxis {...axis} width={44} tickFormatter={(v) => fmtPct(v, 0)} />
                <Tooltip contentStyle={tip} formatter={(v, k) => [fmtPct(v, 1, { sign: true }), k === "senior" ? "Savers' backing money" : "Risk-taker"]} />
                <Legend formatter={(k) => <span style={{ color: "var(--ink2)", fontSize: 12 }}>{k === "senior" ? "Savers' backing money" : "Risk-taker"}</span>} />
                <ReferenceLine y={0} stroke="var(--muted)" />
                <Bar dataKey="senior" fill="var(--chart-1)" maxBarSize={12} />
                <Bar dataKey="pro" fill="var(--chart-2)" maxBarSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="The 10 worst weeks in 21 years" desc="We replay the very worst one on the blockchain in week 2.">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted text-xs"><th className="py-1.5">Week of</th><th>Fees in</th><th>Paid out</th><th>Risk-taker</th><th>Savers</th></tr></thead>
            <tbody>
              {bt.worst_weeks.map((w) => (
                <tr key={w.date} className="border-t border-line tabular">
                  <td className="py-1.5">{w.date}</td><td>{usd(w.premium)}</td><td>{usd(w.payout)}</td>
                  <td className={w.pro_ret < 0 ? "text-bad" : ""}>{fmtPct(w.pro_ret, 1, { sign: true })}</td>
                  <td className={w.senior_ret < 0 ? "text-bad" : "text-good"}>{fmtPct(w.senior_ret, 2, { sign: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ on-chain timeline
const LINES = { senior: "Savers' backing money", pro: "Risk-taker's money", locked: "Money set aside for payouts" };

function RunSection({ run }) {
  const steps = run.snapshots.map((s, i) => ({
    i: i + 1, label: plainStep(s.label), senior: s.pool.senior, pro: s.pool.junior, locked: s.pool.locked,
  }));
  const crash = run.rounds.crash;
  const byMarket = useMemo(() => {
    const m = {};
    for (const [, r] of Object.entries(run.rounds)) for (const p of r.policies || []) {
      m[p.market] = m[p.market] || { market: p.market, premium: 0, payout: 0, notional: 0 };
      m[p.market].premium += p.premium; m[p.market].payout += p.payout || 0; m[p.market].notional += p.notional;
    }
    return Object.values(m).sort((a, b) => b.notional - a.notional);
  }, [run]);
  const first = run.snapshots[0]?.pool, last = run.snapshots.at(-1)?.pool;
  const proStart = run.book.pro.reduce((a, p) => a + p.usd, 0);
  return (
    <Section className="pb-14">
      <SectionHead eyebrow="Step 2 · run it for real" title="What happened on the blockchain">
        Two test weeks: a normal week, then a replay of the COVID crash. When protection is sold, money is set aside to pay it. When the week
        ends, stock owners whose stock fell get paid, and the risk-taker pays first.
      </SectionHead>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Savers' money lost" value="$0" tone="good" sub={`${usd(run.snapshots.at(-1)?.note.floor)} sits in government bonds, untouched`} />
        <Stat label="Savers' backing money after the crash" value={usd(last?.senior)} tone={last?.senior >= first?.senior ? "good" : "bad"}
          sub={`started at ${usd(first?.senior)}; ${usd(run.snapshots.at(-1)?.note.couponsPaid)} paid to savers as bonus`} />
        <Stat label="Risk-taker after the crash" value={usd(last?.junior)} tone={last?.junior >= proStart ? "good" : "bad"}
          sub={`${fmtPct(last?.junior / proStart - 1, 1, { sign: true })} of the ${usd(proStart)} they put in`} />
        <Stat label="Paid to stock owners in the crash" value={usd(crash?.payouts)} sub={crash ? `they had paid ${usd(crash.premiums)} in fees` : ""} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <Panel title="Where the money was, step by step" desc="Hover a point to see the step.">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={steps} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                <XAxis dataKey="i" {...axis} />
                <YAxis {...axis} width={48} tickFormatter={mAxis} />
                <Tooltip contentStyle={tip} labelFormatter={(i) => steps[i - 1]?.label} formatter={(v, k) => [usd(v), LINES[k]]} />
                <Legend formatter={(k) => <span style={{ color: "var(--ink2)", fontSize: 12 }}>{LINES[k]}</span>} />
                <Line dataKey="senior" stroke="var(--chart-1)" strokeWidth={2} dot />
                <Line dataKey="pro" stroke="var(--chart-2)" strokeWidth={2} dot />
                <Line dataKey="locked" stroke="var(--chart-3)" strokeWidth={2} strokeDasharray="4 4" dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <ol className="mt-3 text-xs text-ink2 space-y-0.5 list-decimal pl-5">{steps.map((s) => <li key={s.i}>{s.label}</li>)}</ol>
        </Panel>
        <Panel title="Fees paid vs money paid out, by country" desc="Both weeks together.">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byMarket} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                <XAxis dataKey="market" {...axis} />
                <YAxis {...axis} width={48} tickFormatter={mAxis} />
                <Tooltip contentStyle={tip} labelFormatter={(m) => marketLabel(m)} formatter={(v, k) => [usd(v), k === "premium" ? "Fees paid" : "Paid out"]} />
                <Legend formatter={(k) => <span style={{ color: "var(--ink2)", fontSize: 12 }}>{k === "premium" ? "Fees paid" : "Paid out"}</span>} />
                <Bar dataKey="premium" fill="var(--chart-1)" maxBarSize={18} />
                <Bar dataKey="payout" fill="var(--chart-2)" maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ wallets
function WalletsSection({ run }) {
  const last = run.snapshots.at(-1);
  const dep = {};
  for (const s of run.book.savers) dep[s.wallet] = { kind: "Saver", usd: s.usd, who: s.persona };
  for (const p of run.book.pro) dep[p.wallet] = { kind: "Pro", usd: p.usd, who: "Reinsurance company" };
  for (const h of run.book.holders) dep[h.wallet] = { kind: "Holder", usd: 0, who: h.persona };
  const rows = Object.entries(last.wallets).map(([w, x]) => {
    const d = dep[w] || { kind: "", usd: 0, who: "" };
    let now = 0, net = 0, later = 0, got = 0;
    if (d.kind === "Saver") { now = x.noteFloorShare + x.noteSleeveShare; got = x.stable + x.pendingCoupon; net = got; later = x.projectedAtMaturity + x.pendingCoupon; }
    if (d.kind === "Pro") { now = x.proValue; net = x.proValue - d.usd; later = x.proValue; }
    if (d.kind === "Holder") { got = x.payoutsReceived; net = x.payoutsReceived - x.premiumsPaid; later = x.owed + x.openMaxPayout; }
    return { w, ...x, kind: d.kind, role: WHO[d.kind]?.name || "", who: d.who, deposited: d.usd, now, net, later, got };
  });
  const chart = rows.map((r) => ({ w: r.w, net: r.net }));
  return (
    <Section className="pb-14">
      <SectionHead eyebrow="Wallets" title="Who put in what, and who gets what">
        Savers get back everything they put in when the 3 years end, plus a bonus; the government bonds alone cover what they put in. The
        risk-taker keeps whatever is left of their money. Stock owners paid fees and got paid when their stock crashed.
      </SectionHead>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[980px]">
          <thead>
            <tr className="text-left text-muted text-xs border-b border-line">
              <th className="px-4 py-2.5">Wallet</th><th>Who</th><th className="text-right">Put in</th><th className="text-right">Worth today</th>
              <th className="text-right">Fees paid</th><th className="text-right">Received</th><th className="text-right">Gained / lost</th>
              <th className="text-right px-4">Gets back at the end</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.w} className="border-b border-line last:border-0 tabular align-top">
                <td className="px-4 py-2.5">
                  <div className="font-medium">{r.w}</div>
                  <a className="text-accent underline underline-offset-2 font-mono text-xs" href={`https://hashscan.io/testnet/account/${r.address}`} target="_blank" rel="noreferrer">{shortAddr(r.address)}</a>
                </td>
                <td className="py-2.5"><div>{r.role}</div><div className="text-xs text-muted">{r.who}</div></td>
                <td className="text-right">{r.deposited ? usd(r.deposited) : "—"}</td>
                <td className="text-right">{r.now ? usd(r.now) : "—"}</td>
                <td className="text-right">{r.premiumsPaid ? usd(r.premiumsPaid) : "—"}</td>
                <td className="text-right">{r.got ? usd(r.got) : "—"}<div className="text-xs text-muted">{r.kind === "Saver" ? "bonus" : r.kind === "Holder" ? "crash payouts" : ""}</div></td>
                <td className={`text-right ${r.net > 0 ? "text-good" : r.net < 0 ? "text-bad" : ""}`}>{r.net ? usd(r.net) : "—"}</td>
                <td className="text-right px-4">{r.later ? usd(r.later) : "—"}{r.owed > 0 && <div className="text-xs text-warn">{usd(r.owed)} waiting to be collected</div>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Panel className="mt-4" title="Gained or lost, per wallet" desc="Savers: bonus received. Risk-taker: change in their money. Stock owners: payouts minus fees.">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="w" {...axis} />
              <YAxis {...axis} width={48} tickFormatter={mAxis} />
              <Tooltip contentStyle={tip} formatter={(v) => [usd(v), "Gained / lost"]} />
              <ReferenceLine y={0} stroke="var(--muted)" />
              <Bar dataKey="net" maxBarSize={36}>{chart.map((c) => <Cell key={c.w} fill={c.net >= 0 ? "var(--chart-1)" : "var(--chart-2)"} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </Section>
  );
}

// ------------------------------------------------------------------ rounds
function RoundsSection({ run }) {
  const [tab, setTab] = useState(Object.keys(run.rounds).at(-1));
  const r = run.rounds[tab];
  if (!r) return null;
  const weekName = (k) => (k === "calm" ? "Week 1: normal" : k === "crash" ? "Week 2: COVID crash" : k);
  return (
    <Section className="pb-14">
      <SectionHead eyebrow="Every protection" title="Each protection: what it cost and what it paid"
        right={<div className="seg">{Object.keys(run.rounds).map((k) => (
          <button key={k} type="button" className="seg-item" data-on={tab === k} onClick={() => setTab(k)}>{weekName(k)}</button>
        ))}</div>}>
        The rule: if the stock falls more than 3% in the week, the owner gets paid the extra fall, up to 10% of the amount protected. Each
        stock moved exactly as it did in the week of {r.replayWeek}.
      </SectionHead>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[880px]">
          <thead>
            <tr className="text-left text-muted text-xs border-b border-line">
              <th className="px-4 py-2.5">#</th><th>Owner</th><th>Stock</th><th className="text-right">Amount protected</th><th className="text-right">Fee</th>
              <th className="text-right">Stock moved</th><th className="text-right">Paid out</th><th className="px-4">Proof</th>
            </tr>
          </thead>
          <tbody>
            {(r.policies || []).map((p) => (
              <tr key={p.id} className="border-b border-line last:border-0 tabular">
                <td className="px-4 py-2">{p.id}</td><td>{p.holder}</td>
                <td>{p.symbol} <span className="text-muted text-xs">{marketLabel(p.market)}</span></td>
                <td className="text-right">{usd(p.notional)}</td>
                <td className="text-right">{usd(p.premium, 2)} <span className="text-muted text-xs">{(p.premiumBps / 100).toFixed(2)}%</span></td>
                <td className={`text-right ${p.replayReturn < -0.03 ? "text-bad" : ""}`}>{p.replayReturn !== undefined ? fmtPct(p.replayReturn, 1, { sign: true }) : "—"}</td>
                <td className={`text-right ${p.payout > 0 ? "font-semibold" : "text-muted"}`}>{p.payout !== undefined ? (p.payout > 0 ? usd(p.payout, 2) : "$0") : "still open"}</td>
                <td className="px-4"><a className="text-accent underline underline-offset-2 font-mono text-xs" href={`${run.explorerTx}${p.tx}`} target="_blank" rel="noreferrer">{shortHash(p.tx)}</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {r.refused?.length > 0 && (
        <div className="mt-3"><Notice tone="info">
          <b>Said no to {r.refused.length}:</b> {r.refused.map((x) => x.symbol).join(", ")}. These stocks are swinging too wildly right now, so a
          fair fee would be more than 1% a week. The system refuses instead of selling protection too cheaply. That is what keeps savers safe.
        </Notice></div>
      )}
      {r.hold && (
        <div className="mt-3"><Notice tone="warn">
          In this week the digital-dollar company froze {r.hold}'s wallet, which really happens with USDT and USDC. Nobody else was held up:
          {" "}{r.hold}'s payout was kept safe in the pool, and {r.hold} collected it once the wallet was unfrozen.
        </Notice></div>
      )}
    </Section>
  );
}

// ------------------------------------------------------------------ tx log
function TxSection({ run }) {
  const [all, setAll] = useState(false);
  const txs = all ? run.txs : run.txs.slice(-25);
  return (
    <Section className="pb-20">
      <SectionHead eyebrow="Proof" title={`${run.txs.length} blockchain transactions. Click any one to check it yourself.`}
        right={<button type="button" className="btn-ghost btn-sm" onClick={() => setAll(!all)}>{all ? "Show the latest 25" : "Show all"}</button>} />
      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <tbody>
            {txs.map((t) => (
              <tr key={t.tx} className="border-b border-line last:border-0">
                <td className="px-4 py-2 text-xs text-muted tabular whitespace-nowrap">{t.at.slice(11, 19)}</td>
                <td className="py-2 text-xs">{t.who === "deployer" ? "Operator" : t.who}</td>
                <td className="py-2">{plainTx(t.step)}</td>
                <td className="px-4 py-2 text-right">{t.url ? <a className="text-accent underline underline-offset-2 font-mono text-xs" href={t.url} target="_blank" rel="noreferrer">{shortHash(t.tx)}</a> : shortHash(t.tx)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
