"use client";
import { useEffect, useRef, useState } from "react";
import { useAccount, useSignMessage, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useApi } from "@/lib/api";
import { authoriseAgentAction, LIMIT_FIELDS, displayUnits, inputUnits } from "@/lib/agent";
import { shortAddr } from "@/lib/format";
import { useToasts } from "@/components/Toasts";
import { PageHead, Section, SectionHead, Panel, Row, Notice, Placeholder, HeroCtas, HowItWorks, Faq } from "@/components/ui";
import { AgentArt } from "@/components/IsoArt";
import ChainlinkSettlement from "@/components/ChainlinkSettlement";

const STAGES = [
  ["preflight", "Check the limits", "Your ID, the shares you own, and the budget"],
  ["underwriting", "Pay for a price", "A tiny pay-per-use fee to the pricing service (x402)"],
  ["insurance", "Buy the protection", "Checks the price, pays exactly that, and gets the protection"],
  ["audit", "Save a public log", "Writes what it spent to a public log (Hedera Consensus Service)"],
  ["complete", "Protection active", "Receipts for the protection and payments are ready"],
];
const money = (v) => v == null ? "—" : `${(Number(v) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 6 })} tUSD`;
const hbar = (v) => v == null ? "—" : `${(Number(v) / 1e8).toLocaleString(undefined, { maximumFractionDigits: 6 })} HBAR`;
const sharesText = (v) => v == null ? "—" : (Number(v) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 8 });
const LIMIT_LABEL = {
  notionalPerPolicy: "Protected amount each time", premiumPerPolicy: "Protection price each time", premiumDaily: "Protection a day",
  apiPerCall: "Price fee each time", apiDaily: "Price fees a day", gasPerTransaction: "Network fee each time", gasDaily: "Network fees a day", maxOpenPolicies: "Open protections",
};
const when = (v) => v ? new Date(v).toLocaleString() : "—";
const txUrl = (tx) => `https://hashscan.io/testnet/transaction/${encodeURIComponent(tx)}`;

const STEPS = [
  { icon: "sliders", title: "You set the limits", body: "Which stock, how many shares, and a daily budget.", stat: "One signature per run" },
  { icon: "bolt", title: "It checks, then pays", body: "Free checks first. Then a tiny fee for the price, then the protection.", stat: "0.01 HBAR, paid per use (x402)" },
  { icon: "receipt", title: "A receipt for every step", body: "Payments, protection and a spending log, all public.", stat: "Open any of it on HashScan" },
];

function Rules() {
  return (
    <div className="card p-5 sm:p-6">
      <div className="text-sm font-medium">The agent can never</div>
      <ul className="mt-4 space-y-2.5">
        {["Spend past its daily budget", "Buy protection you did not approve", "Protect shares you do not own", "Send money anywhere else"].map((t) => (
          <li key={t} className="flex items-center gap-3 text-[15px]"><span className="h-5 w-5 rounded-full bg-accentSoft text-accent grid place-items-center text-xs font-bold">✕</span>{t}</li>
        ))}
      </ul>
      <div className="mt-5 pt-4 border-t border-line text-xs text-muted">Plus a stop button you control.</div>
    </div>
  );
}

const FAQ = [
  ["What is x402?", "A simple way for software to pay per use over the web. The pricing service asks for a tiny fee; the agent pays it and gets the price."],
  ["What is HCS?", "Hedera Consensus Service: a public, permanent log. The agent writes what it spent there so anyone can check."],
  ["Does the agent hold my private key?", "No. It has its own wallet on our server. You approve each run by signing with your own wallet."],
  ["What if something goes wrong?", "The agent stops and never retries a payment by itself. An operator then checks what happened."],
  ["Can I stop it?", "Yes. The stop button blocks new payments at once. Payments already sent may still go through."],
];

function Budget({ title, used, limit, format }) {
  const percent = limit ? Math.min(100, Math.max(0, Number(used || 0) / Number(limit) * 100)) : 0;
  return <div className="rounded-xl border border-line p-4">
    <div className="text-sm text-ink2">{title}</div>
    <div className="mt-2 font-semibold tabular">{format(used)} <span className="text-muted font-normal text-xs">/ {format(limit)}</span></div>
    <div className="h-1.5 mt-3 bg-sunk rounded-full overflow-hidden" role="progressbar" aria-label={title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}>
      <div className={`h-full rounded-full ${percent >= 90 ? "bg-warn" : "bg-accent"}`} style={{ width: `${percent}%` }} />
    </div>
  </div>;
}

function Receipt({ label, receipt }) {
  if (!receipt?.transaction) return null;
  return <a className="rounded-xl border border-line p-4 hover:bg-sunk transition block min-w-0" href={txUrl(receipt.transaction)} target="_blank" rel="noreferrer">
    <div className="text-sm font-medium flex justify-between gap-3">{label}<span className="text-accent">↗</span></div>
    <div className="text-xs text-muted font-mono truncate mt-2">{receipt.transaction}</div>
  </a>;
}

function Execution({ run }) {
  if (!run) return <Placeholder title="No runs yet">Run a free check, then start the agent. Its progress shows here.</Placeholder>;
  const index = STAGES.findIndex(([key]) => key === run.stage);
  return <>
    <div className="flex flex-wrap justify-between items-center gap-3 mb-5"><span className={`chip ${run.status === "complete" ? "text-good" : run.status === "blocked" ? "text-warn" : "text-accent"}`}>{run.status === "complete" ? "Done" : run.status === "blocked" ? "Stopped: needs a look" : "Running"}</span><span className="text-xs text-muted">{when(run.created_at)}</span></div>
    <ol className="space-y-5" aria-live="polite">{STAGES.map(([key, title, description], i) => {
      const done = run.status === "complete" || i < index;
      const current = i === index;
      return <li key={key} className="flex gap-3"><span className={`h-7 w-7 rounded-full border text-xs font-medium grid place-items-center shrink-0 ${done ? "bg-primary border-primary text-white" : current ? "border-accent text-accent bg-accentSoft" : "border-line text-muted"}`}>{done ? "✓" : i + 1}</span><div><div className={`text-sm font-medium ${!done && !current ? "text-muted" : ""}`}>{title}{current && run.status === "running" ? "…" : ""}</div><p className="text-xs text-muted mt-1">{description}</p></div></li>;
    })}</ol>
    {run.error && <div className="mt-5"><Notice tone="warn">{run.error} It will not retry by itself.</Notice></div>}
    <div className="grid gap-3 mt-6"><Receipt label="Price fee paid" receipt={run.data.servicePayment} /><Receipt label={`Protection #${run.data.insurance?.policyId}`} receipt={run.data.insurance} /><Receipt label="Public spending log (HCS)" receipt={run.data.hcs} /></div>
  </>;
}

export default function AgentPage() {
  const discovery = useApi("/api/agent/discovery", { refetchInterval: 10000 });
  const status = useApi("/api/agent/control/status", { refetchInterval: 3000 });
  const activity = useApi("/api/agent/activity", { refetchInterval: 10000 });
  const { address, chainId, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { switchChainAsync } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const { push } = useToasts();
  const [shares, setShares] = useState("0.01");
  const [deductibleBps, setDeductible] = useState(1000);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [runId, setRunId] = useState(null);
  const [limitInputs, setLimitInputs] = useState({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [now, setNow] = useState(Date.now());
  const pending = useRef(false);
  const d = discovery.data;
  const s = status.data;
  const limits = s?.limits || d?.limits;
  const controller = Boolean(address && s?.controller && address.toLowerCase() === s.controller.toLowerCase());
  const authorised = controller && chainId === 296 && s?.controlsEnabled;
  const running = s?.runs?.some((r) => r.status === "running");
  const blocked = s?.locked && !running;
  const canOperate = authorised && !busy && !s?.locked && !s?.stopped && d?.enabled && !status.isError;
  const selected = s?.runs?.find((r) => r.id === runId) || s?.runs?.[0];
  const livePlan = plan && plan.expiresAt > now;
  const spends = s?.spending?.filter((r) => filter === "all" || r.kind === filter) || [];
  const events = activity.data?.events || [];
  const limitsVersion = JSON.stringify(limits);
  // One plain line under the buttons saying why they are off.
  const whyOff = busy || running ? "" : discovery.isError || status.isError || !d?.enabled ? "The agent is offline right now." : !authorised ? "Only the owner's wallet can start the agent." : s?.stopped ? "The agent is stopped. Resume it below." : s?.locked ? "The agent's wallet is locked." : !livePlan ? "Run a free check first. It is good for a short time." : "";

  useEffect(() => {
    if (limits) setLimitInputs(Object.fromEntries(LIMIT_FIELDS.map((f) => [f.key, displayUnits(limits[f.key], f.decimals)])));
    setPlan(null);
    // Polls with unchanged limits must not overwrite edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limitsVersion]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { setPlan(null); }, [address, chainId]);

  async function act(action, payload = {}) {
    if (pending.current) return;
    pending.current = true; setBusy(action); setError("");
    try {
      if (!authorised) throw new Error("Connect the owner's wallet on Hedera testnet.");
      const result = await authoriseAgentAction({ action, payload, address, signMessageAsync });
      if (action === "plan") { setPlan(result.plan); setNow(Date.now()); }
      if (action === "run") { setRunId(result.runId); setPlan(null); push({ state: "success", title: "Agent started", body: "One purchase is running. Follow it below." }); }
      if (action === "settings") { setPlan(null); setSettingsOpen(false); push({ state: "success", title: "Limits saved" }); }
      if (action === "stop" || action === "resume") push({ state: "success", title: action === "stop" ? "Agent stopped" : "Agent resumed", body: action === "stop" ? "New payments are blocked. Payments already sent may still go through." : "It can run again within your limits." });
      await Promise.allSettled([status.refetch(), discovery.refetch(), activity.refetch()]);
    } catch (e) {
      setError((e.shortMessage || e.message || "Action failed").split("\n")[0].slice(0, 240));
      // Never retry a signed action after a timeout; refresh durable status instead.
      status.refetch();
    } finally { setBusy(null); pending.current = false; }
  }

  async function saveLimits(e) {
    e.preventDefault();
    try {
      const next = Object.fromEntries(LIMIT_FIELDS.map((f) => [f.key, f.decimals ? inputUnits(limitInputs[f.key] || "", f.decimals) : Number(inputUnits(limitInputs[f.key] || "", 0))]));
      await act("settings", { limits: next });
    } catch (e) { setError(e.message); }
  }

  return <>
    <PageHead
      eyebrow="AI agent"
      title="Let an AI agent buy protection for you"
      art={<AgentArt stage={running ? selected?.stage : undefined} />}
      right={<div className="flex flex-wrap items-center gap-4"><HeroCtas items={[["Set it up", "#mandate"], ["See the limits", "#guardrails"]]} /><span className="chip"><span className={`w-1.5 h-1.5 rounded-full ${running ? "bg-accent animate-pulse" : s?.stopped ? "bg-warn" : d?.enabled ? "bg-good" : "bg-muted"}`} />{running ? "Agent running" : s?.stopped ? "Stopped" : d?.enabled ? "Ready (test version)" : "Offline"}</span></div>}
    >
      Within limits you set. It checks everything, pays, and keeps a public receipt for every step.
      <span className="block mt-3 text-xs text-muted">Runs on Hedera testnet · pays per use with x402 · logs to Hedera Consensus Service (HCS)</span>
    </PageHead>

    <HowItWorks title="Hands-off, within your limits" steps={STEPS} aside={<Rules />} />

    <Section className="space-y-6 pb-4 mt-20">
      {(discovery.isError || status.isError) && <Notice tone="warn">The agent is offline right now. Buttons stay off until it is back.</Notice>}
      {!status.isLoading && !status.isError && !s?.controlsEnabled && <Notice tone="warn">{s?.reason || "The operator has not switched on the controls yet."} You can still look around.</Notice>}
      {s?.controlsEnabled && !authorised && <div className="card p-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-ink2">{!isConnected ? "Connect the owner's wallet to control this agent." : !controller ? `Only the owner's wallet (${shortAddr(s.controller)}) can control this agent.` : "Switch your wallet to Hedera testnet to control the agent."}</p>{!isConnected ? <button className="btn-primary btn-sm" onClick={openConnectModal}>Connect wallet</button> : controller && chainId !== 296 ? <button className="btn-primary btn-sm" onClick={async () => { try { await switchChainAsync({ chainId: 296 }); } catch (e) { setError(e.shortMessage || "Could not switch network."); } }}>Switch to Hedera</button> : <span className="chip">View only</span>}</div>}
      {blocked && <Notice tone="warn">The agent's wallet is locked. Another run may be going, or an earlier one needs an operator to check it. The stop button cannot unlock it.</Notice>}
      {error && <div role="alert"><Notice tone="bad">{error}</Notice></div>}
      <div className="card grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-line">
        {[["Agent's wallet", s?.wallet ? shortAddr(s.wallet.address) : "Not set up yet", s?.wallet?.accountId || "Its key stays on our server"], ["Fee for each price", hbar(d?.amount), "Paid per use (x402); network fees covered"], ["Network", "Hedera testnet", "Test money only · chain 296"]].map(([k, v, sub]) => (
          <div key={k} className="px-5 py-4 min-w-0"><div className="text-xs text-muted">{k}</div><div className="mt-1 text-lg font-semibold tracking-tight truncate">{v}</div><div className="text-xs text-ink2 mt-0.5 truncate">{sub}</div></div>
        ))}
      </div>

      <SectionHead id="mandate" eyebrow="Step 1" title="Tell the agent what to protect">Then run a free check. Nothing is paid until you start.</SectionHead>

      <div className="grid lg:grid-cols-[1.15fr_1fr] gap-6 items-start">
        <Panel title="What to protect" desc="The only thing the agent may buy.">
          <div className="space-y-5">
          <div className="rounded-xl bg-sunk p-4 flex gap-3 items-center"><div className="w-10 h-10 rounded-xl bg-primary text-white grid place-items-center font-semibold">N</div><div><div className="font-medium">NVIDIA (tokenised shares)</div><div className="text-xs text-muted mt-1">NASDAQ:NVDA · only shares you hold</div></div><span className="chip ml-auto">Allowed</span></div>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block space-y-2" htmlFor="agent-shares"><span className="label">Shares to protect</span><input id="agent-shares" type="number" min="0.00000001" max="0.1" step="any" className="input" value={shares} disabled={Boolean(busy || running)} onChange={(e) => { setShares(e.target.value); setPlan(null); }} /><span className="text-xs text-muted">Up to 0.1 shares at a time.</span></label>
            <label className="block space-y-2" htmlFor="agent-deductible"><span className="label">Starts paying after a drop of</span><select id="agent-deductible" className="input" value={deductibleBps} disabled={Boolean(busy || running)} onChange={(e) => { setDeductible(Number(e.target.value)); setPlan(null); }}>{[300, 500, 750, 1000, 1500, 2000, 2500].map((v) => <option key={v} value={v}>{v / 100}%</option>)}</select><span className="text-xs text-muted">You cover the first part of any fall.</span></label>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl border border-line p-3"><div className="text-muted text-xs">How long</div><div className="font-medium mt-1">7 days</div></div><div className="rounded-xl border border-line p-3"><div className="text-muted text-xs">Pays up to</div><div className="font-medium mt-1">10% of the value</div></div></div>
          <p className="text-xs text-ink2 leading-relaxed">Test money only. One signature buys protection once.</p>
          <div className="flex flex-wrap gap-3"><button className="btn-ghost flex-1" disabled={!canOperate || !shares || Number(shares) <= 0 || Number(shares) > 0.1} onClick={() => { setPlan(null); act("plan", { shares, deductibleBps }); }}>{busy === "plan" ? "Checking…" : "Run a free check"}</button><button className="btn-primary flex-1" disabled={!canOperate || !livePlan} onClick={() => act("run", { planId: plan.id })}>{busy === "run" ? "Starting…" : "Start the agent once"}</button></div>
          {whyOff && <p className="text-xs text-warn">{whyOff}</p>}<p className="text-xs text-muted">The check costs nothing. Prices are checked again when it buys.</p>
          </div>
        </Panel>
        <Panel title="Free check" desc="Done before the agent pays anything.">
          {!plan ? <div className="py-7 text-center"><div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full border border-dashed border-line text-muted" aria-hidden="true">✓</div><p className="font-medium">Your check will show here.</p><p className="text-sm text-muted mt-2 max-w-sm mx-auto">It confirms your ID, the shares you own, that the pool can pay, and the estimated price.</p></div> : <>
            <div className="flex justify-between items-center gap-3 mb-4"><span className={`chip ${livePlan ? "text-good" : "text-warn"}`}>{livePlan ? "Check passed" : "Check expired"}</span><span className="text-xs text-muted">{livePlan ? `Good for ${Math.ceil((plan.expiresAt - now) / 1000)}s` : "Check again"}</span></div>
            <Row k="Protected amount" v={money(plan.notional)} strong /><Row k="Estimated price" v={money(plan.premium)} strong /><Row k="Pays up to" v={money(plan.maxPayout)} /><Row k="Fee for the price" v={hbar(plan.serviceFee)} /><Row k="Shares you hold" v={sharesText(plan.holdings.available)} /><Row k="Open protections" v={`${plan.openPolicies} / ${limits?.maxOpenPolicies}`} /><Row k="Agent's money" v={`${hbar(plan.balances.hbar)} · ${money(plan.balances.stable)}`} />
            <div className="flex flex-wrap gap-2 mt-5">{plan.checks.map((check) => <span key={check} className="chip"><span className="text-good" aria-hidden="true">✓</span>{check}</span>)}</div>
          </>}
        </Panel>
      </div>

      <SectionHead id="guardrails" eyebrow="Limits" title="A budget it cannot go over">A daily limit for each kind of payment, plus a stop button.</SectionHead>
      <div className="card p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap gap-4 justify-between items-center"><h3 className="text-[15px] font-semibold">Spent today</h3><button className="btn-ghost btn-sm" onClick={() => setSettingsOpen((v) => !v)} aria-expanded={settingsOpen} aria-controls="agent-budget-settings">{settingsOpen ? "Close" : "Change limits"}</button></div>
        <div className="grid md:grid-cols-3 gap-3"><Budget title="Price fees today" used={s?.budget?.used.api} limit={limits?.apiDaily} format={hbar} /><Budget title="Protection bought today" used={s?.budget?.used.premium} limit={limits?.premiumDaily} format={money} /><Budget title="Network fees today" used={s?.budget?.used.gas} limit={limits?.gasDaily} format={hbar} /></div>
        <p className="text-xs text-muted">Budgets reset at midnight UTC. Payments still pending count too. Network fees are counted at their highest possible cost.</p>
        {settingsOpen && <form id="agent-budget-settings" onSubmit={saveLimits} className="pt-5 border-t border-line space-y-5"><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">{LIMIT_FIELDS.map((f) => <label key={f.key} className="space-y-2 block" htmlFor={`limit-${f.key}`}><span className="label">{LIMIT_LABEL[f.key] || f.label}</span><div className="relative"><input id={`limit-${f.key}`} className="input pr-16" type="text" inputMode={f.decimals ? "decimal" : "numeric"} value={limitInputs[f.key] || ""} disabled={!authorised || Boolean(busy || s?.locked)} onChange={(e) => setLimitInputs((v) => ({ ...v, [f.key]: e.target.value }))} /><span className="absolute right-3 top-3 text-xs text-muted pointer-events-none">{f.unit}</span></div><span className="text-xs text-muted">Max {displayUnits((s?.ceilings || d?.limits)?.[f.key], f.decimals) || "—"} {f.unit}</span></label>)}</div><div className="flex flex-wrap gap-4 items-center"><button className="btn-primary" disabled={!canOperate} type="submit">{busy === "settings" ? "Saving…" : "Save limits"}</button><p className="text-xs text-muted">Needs the owner's signature. Limits cannot go above the max.</p></div></form>}
        <div className="pt-5 border-t border-line flex flex-wrap items-center justify-between gap-4"><div className="max-w-xl"><div className="text-sm font-medium">Stop button</div><p className="text-xs text-muted mt-1">Blocks new payments at once. Payments already sent may still go through.</p></div><button className={`btn-ghost ${s?.stopped ? "" : "text-bad border-bad/30"}`} disabled={!authorised || Boolean(busy) || (s?.stopped && (s?.locked || s?.environmentStopped))} onClick={() => act(s?.stopped ? "resume" : "stop")}>{busy === "stop" || busy === "resume" ? "Signing…" : s?.stopped ? "Resume agent" : "Stop agent"}</button></div>
      </div>

      <ChainlinkSettlement />
      <SectionHead eyebrow="Step 2" title="Watch it work">Each step leaves a receipt you can open on HashScan, Hedera's public explorer.</SectionHead>
      <div className="grid lg:grid-cols-[1.15fr_1fr] gap-6 items-start">
        <Panel title="Progress" desc="The selected run, step by step."><Execution run={selected} /></Panel>
        <div className="card p-5 sm:p-6"><h3 className="text-[15px] font-semibold mb-4">Recent runs</h3>{!s?.runs?.length ? <p className="text-sm text-muted">Past runs show here after the first one.</p> : <div className="space-y-2">{s.runs.map((r) => <button key={r.id} onClick={() => setRunId(r.id)} className={`w-full text-left rounded-xl border p-4 transition ${selected?.id === r.id ? "border-accent/40 bg-accentSoft" : "border-line hover:bg-sunk"}`} aria-pressed={selected?.id === r.id}><div className="flex justify-between gap-3 text-sm"><span className="font-medium">{r.data.parameters?.shares} NVIDIA shares</span><span className={r.status === "complete" ? "text-good" : r.status === "blocked" ? "text-warn" : "text-accent"}>{r.status === "complete" ? "Done" : r.status === "blocked" ? "Needs a look" : "Running"}</span></div><div className="text-xs text-muted mt-2">{when(r.created_at)} · pays after a {(r.data.parameters?.deductibleBps || 0) / 100}% drop</div></button>)}</div>}
          {s?.hcsTopic && <div className="mt-6 pt-5 border-t border-line"><a className="text-xs text-accent underline inline-block" href={`https://hashscan.io/testnet/topic/${s.hcsTopic}`} target="_blank" rel="noreferrer">Public spending log ↗</a><span className="block text-[11px] text-muted mt-1 font-mono">HCS topic {s.hcsTopic}</span></div>}
        </div>
      </div>

      <div className="card overflow-hidden"><div className="p-5 sm:p-6 flex flex-wrap justify-between items-center gap-4"><div><h3 className="text-[15px] font-semibold">Spending and receipts</h3><p className="text-xs text-muted mt-1">Every payment from the agent's wallet, including ones still pending.</p></div><label><span className="sr-only">Filter spending</span><select className="input !w-auto !h-9 text-xs" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All payments</option><option value="api">Price fees</option><option value="premium">Protection</option><option value="gas">Network fees and log</option></select></label></div>
        {spends.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-y border-line bg-sunk text-xs text-muted text-left"><tr>{["Payment", "Amount", "Status", "Receipt"].map((h) => <th key={h} className="px-5 py-3 font-medium">{h}</th>)}</tr></thead><tbody className="divide-y divide-line">{spends.map((r) => <tr key={r.id}><td className="px-5 py-4 whitespace-nowrap">{r.kind === "api" ? "Price fee" : r.kind === "premium" ? "Protection" : r.id.startsWith("hcs:") ? "Public log entry" : "Network fee"}<div className="text-xs text-muted mt-1">{r.day} UTC</div></td><td className="px-5 py-4 tabular whitespace-nowrap">{r.kind === "premium" ? money(r.amount) : hbar(r.amount)}</td><td className="px-5 py-4"><span className={`chip ${r.status === "confirmed" ? "text-good" : "text-warn"}`}>{r.status}</span></td><td className="px-5 py-4 whitespace-nowrap">{r.tx ? <a className="text-accent underline text-xs" href={txUrl(r.tx)} target="_blank" rel="noreferrer">HashScan ↗</a> : <span className="text-xs text-muted">No receipt yet</span>}</td></tr>)}</tbody></table></div> : <div className="p-5 sm:p-6 border-t border-line"><Placeholder title={s?.ready ? "No payments yet" : "Spending list unavailable"}>{s?.ready ? "Payments show here when the agent makes one." : "Finish setting up the agent to see its spending."}</Placeholder></div>}
      </div>
      {events.length > 0 && <details className="card p-5"><summary className="text-sm font-medium cursor-pointer">Proof from the pricing service · {events.length}</summary><div className="mt-4 divide-y divide-line">{events.map((e) => <div key={e.seq} className="py-3 flex flex-wrap justify-between items-center gap-3"><div className="text-sm">{e.event === "x402.settled" ? "Price fee received" : e.event}<div className="text-xs text-muted mt-1">{when(e.at)}</div></div>{e.hashscan && <a href={e.hashscan} target="_blank" rel="noreferrer" className="text-xs text-accent underline">HashScan ↗</a>}</div>)}</div></details>}
    </Section>
    <Faq items={FAQ} />
  </>;
}
