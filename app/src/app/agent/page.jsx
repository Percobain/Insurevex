"use client";
import { useEffect, useRef, useState } from "react";
import { useAccount, useSignMessage, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useApi } from "@/lib/api";
import { authoriseAgentAction, LIMIT_FIELDS, displayUnits, inputUnits } from "@/lib/agent";
import { shortAddr } from "@/lib/format";
import { useToasts } from "@/components/Toasts";
import { PageHead, Section, SectionHead, Panel, Row, Notice, Placeholder } from "@/components/ui";
import { AgentArt } from "@/components/IsoArt";

const STAGES = [
  ["preflight", "Check guardrails", "Identity, holdings, contracts and budgets"],
  ["underwriting", "Pay for underwriting", "Discover the service and settle its x402 fee"],
  ["insurance", "Purchase protection", "Verify the quote, approve the exact premium and issue a policy"],
  ["audit", "Record the audit", "Anchor the spending log in Hedera Consensus Service"],
  ["complete", "Protection active", "Policy and payment receipts are available"],
];
const money = (v) => v == null ? "—" : `${(Number(v) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 6 })} tUSD`;
const hbar = (v) => v == null ? "—" : `${(Number(v) / 1e8).toLocaleString(undefined, { maximumFractionDigits: 6 })} HBAR`;
const sharesText = (v) => v == null ? "—" : (Number(v) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 8 });
const when = (v) => v ? new Date(v).toLocaleString() : "—";
const txUrl = (tx) => `https://hashscan.io/testnet/transaction/${encodeURIComponent(tx)}`;

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
  if (!run) return <Placeholder title="No dashboard runs yet">Start a bounded run after preflight. Existing CLI payments remain visible in the spending ledger.</Placeholder>;
  const index = STAGES.findIndex(([key]) => key === run.stage);
  return <>
    <div className="flex flex-wrap justify-between items-center gap-3 mb-5"><span className={`chip ${run.status === "complete" ? "text-good" : run.status === "blocked" ? "text-warn" : "text-accent"}`}>{run.status === "complete" ? "Completed" : run.status === "blocked" ? "Stopped · review needed" : "Running"}</span><span className="text-xs text-muted">{when(run.created_at)}</span></div>
    <ol className="space-y-5" aria-live="polite">{STAGES.map(([key, title, description], i) => {
      const done = run.status === "complete" || i < index;
      const current = i === index;
      return <li key={key} className="flex gap-3"><span className={`h-7 w-7 rounded-full border text-xs font-medium grid place-items-center shrink-0 ${done ? "bg-primary border-primary text-white" : current ? "border-accent text-accent bg-accentSoft" : "border-line text-muted"}`}>{done ? "✓" : i + 1}</span><div><div className={`text-sm font-medium ${!done && !current ? "text-muted" : ""}`}>{title}{current && run.status === "running" ? "…" : ""}</div><p className="text-xs text-muted mt-1">{description}</p></div></li>;
    })}</ol>
    {run.error && <div className="mt-5"><Notice tone="warn">{run.error} No automatic retry will run.</Notice></div>}
    <div className="grid gap-3 mt-6"><Receipt label="Underwriting payment" receipt={run.data.servicePayment} /><Receipt label={`Insurance policy #${run.data.insurance?.policyId}`} receipt={run.data.insurance} /><Receipt label="HCS audit anchor" receipt={run.data.hcs} /></div>
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
      if (!authorised) throw new Error("Connect the configured controller wallet on Hedera testnet.");
      const result = await authoriseAgentAction({ action, payload, address, signMessageAsync });
      if (action === "plan") { setPlan(result.plan); setNow(Date.now()); }
      if (action === "run") { setRunId(result.runId); setPlan(null); push({ state: "success", title: "Agent started", body: "One bounded purchase is running. Follow its progress below." }); }
      if (action === "settings") { setPlan(null); setSettingsOpen(false); push({ state: "success", title: "Spending limits saved" }); }
      if (action === "stop" || action === "resume") push({ state: "success", title: action === "stop" ? "Emergency stop activated" : "Agent resumed", body: action === "stop" ? "New payment steps will stop. Submitted transactions may still settle." : "New runs can start within the spending policy." });
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
      eyebrow="Hedera · agents that pay"
      title="Your agent buys the cover. Within your limits."
      art={<AgentArt stage={running ? selected?.stage : undefined} />}
      facts={[[d?.amount ? hbar(d.amount) : "0.01 HBAR", "underwriting fee, paid with x402"], ["1 run", "one signature covers one purchase"], ["Capped", "daily budgets it cannot exceed"]]}
      right={<span className="chip"><span className={`w-1.5 h-1.5 rounded-full ${running ? "bg-accent animate-pulse" : s?.stopped ? "bg-warn" : d?.enabled ? "bg-good" : "bg-muted"}`} />{running ? "Agent running" : s?.stopped ? "Emergency stop active" : d?.enabled ? "Testnet ready" : "Service offline"}</span>}
    >
      A dedicated wallet pays for underwriting over HTTP 402, buys collateralised cover on CoverMarket and logs every payment on
      Hedera Consensus Service. You set the mandate and the budget; the key never leaves the server.
    </PageHead>
    <Section className="space-y-6 pb-16">
      {(discovery.isError || status.isError) && <Notice tone="warn">The agent service is unavailable. Controls are disabled until its status can be verified.</Notice>}
      {!status.isLoading && !status.isError && !s?.controlsEnabled && <Notice tone="warn">{s?.reason || "The operator needs to enable wallet-signed controls before this agent can run from the dashboard."} Protection settings and payment evidence remain available to view.</Notice>}
      {s?.controlsEnabled && !authorised && <div className="card p-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-ink2">{!isConnected ? "Connect the controller wallet to manage this agent." : !controller ? `Only controller ${shortAddr(s.controller)} can authorise this agent.` : "Switch to Hedera testnet to use agent controls."}</p>{!isConnected ? <button className="btn-primary btn-sm" onClick={openConnectModal}>Connect wallet</button> : controller && chainId !== 296 ? <button className="btn-primary btn-sm" onClick={async () => { try { await switchChainAsync({ chainId: 296 }); } catch (e) { setError(e.shortMessage || "Could not switch network."); } }}>Switch to Hedera</button> : <span className="chip">View only</span>}</div>}
      {blocked && <Notice tone="warn">The agent wallet is locked. A CLI run may be active, or a previous run may need reconciliation. Reservations remain counted; stop/resume cannot clear the lock.</Notice>}
      {error && <div role="alert"><Notice tone="bad">{error}</Notice></div>}
      <div className="card grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-line">
        {[["Agent wallet", s?.wallet ? shortAddr(s.wallet.address) : "Awaiting setup", s?.wallet?.accountId || "Private key stays on the server"], ["Underwriting fee", hbar(d?.amount), "x402 · the facilitator sponsors gas"], ["Network", "Hedera testnet", "Test HBAR + test USD · chain 296"]].map(([k, v, sub]) => (
          <div key={k} className="px-5 py-4 min-w-0"><div className="text-xs text-muted">{k}</div><div className="mt-1 text-lg font-semibold tracking-tight truncate">{v}</div><div className="text-xs text-ink2 mt-0.5 truncate">{sub}</div></div>
        ))}
      </div>

      <SectionHead eyebrow="Step 1 · 2" title="Set the mandate, then check it">Choose what to protect. The preflight checks identity, holdings, collateral and price without paying anything.</SectionHead>

      <div className="grid lg:grid-cols-[1.15fr_1fr] gap-6 items-start">
        <Panel title="Protection mandate" desc="What the agent is allowed to protect.">
          <div className="space-y-5">
          <div className="rounded-xl bg-sunk p-4 flex gap-3 items-center"><div className="w-10 h-10 rounded-xl bg-primary text-white grid place-items-center font-semibold">N</div><div><div className="font-medium">Tokenised NVIDIA</div><div className="text-xs text-muted mt-1">NASDAQ:NVDA · verified ATS holdings only</div></div><span className="chip ml-auto">Allowlisted</span></div>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block space-y-2" htmlFor="agent-shares"><span className="label">Shares to protect</span><input id="agent-shares" type="number" min="0.00000001" max="0.1" step="any" className="input" value={shares} disabled={Boolean(busy || running)} onChange={(e) => { setShares(e.target.value); setPlan(null); }} /><span className="text-xs text-muted">Up to 0.1 shares per policy.</span></label>
            <label className="block space-y-2" htmlFor="agent-deductible"><span className="label">Deductible</span><select id="agent-deductible" className="input" value={deductibleBps} disabled={Boolean(busy || running)} onChange={(e) => { setDeductible(Number(e.target.value)); setPlan(null); }}>{[300, 500, 750, 1000, 1500, 2000, 2500].map((v) => <option key={v} value={v}>{v / 100}%</option>)}</select><span className="text-xs text-muted">The first part of the fall you absorb.</span></label>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl border border-line p-3"><div className="text-muted text-xs">Protection period</div><div className="font-medium mt-1">7 days</div></div><div className="rounded-xl border border-line p-3"><div className="text-muted text-xs">Maximum payout</div><div className="font-medium mt-1">10% of protected value</div></div></div>
          <p className="text-xs text-ink2 leading-relaxed">The underwriting fee is paid in test HBAR and the premium in test USD. One signed run authorisation covers one purchase; the agent handles the individual payments within its limits.</p>
          <div className="flex flex-wrap gap-3"><button className="btn-ghost flex-1" disabled={!canOperate || !shares || Number(shares) <= 0 || Number(shares) > 0.1} onClick={() => { setPlan(null); act("plan", { shares, deductibleBps }); }}>{busy === "plan" ? "Checking guardrails…" : "Check protection"}</button><button className="btn-primary flex-1" disabled={!canOperate || !livePlan} onClick={() => act("run", { planId: plan.id })}>{busy === "run" ? "Authorising…" : "Run agent once"}</button></div>
          <p className="text-xs text-muted">Preflight is free of payment. Prices and collateral are checked again during execution.</p>
          </div>
        </Panel>
        <Panel title="Preflight" desc="Checked before the agent pays anything.">
          {!plan ? <div className="py-7 text-center"><div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full border border-dashed border-line text-muted" aria-hidden="true">✓</div><p className="font-medium">Your preflight will appear here.</p><p className="text-sm text-muted mt-2 max-w-sm mx-auto">Check protection to verify identity, ownership, available collateral and the estimated premium.</p></div> : <>
            <div className="flex justify-between items-center gap-3 mb-4"><span className={`chip ${livePlan ? "text-good" : "text-warn"}`}>{livePlan ? "Preflight passed" : "Preflight expired"}</span><span className="text-xs text-muted">{livePlan ? `Valid for ${Math.ceil((plan.expiresAt - now) / 1000)}s` : "Check again"}</span></div>
            <Row k="Protected amount" v={money(plan.notional)} strong /><Row k="Estimated premium" v={money(plan.premium)} strong /><Row k="Maximum payout" v={money(plan.maxPayout)} /><Row k="Underwriting fee" v={hbar(plan.serviceFee)} /><Row k="Available ATS shares" v={sharesText(plan.holdings.available)} /><Row k="Open policies" v={`${plan.openPolicies} / ${limits?.maxOpenPolicies}`} /><Row k="Agent balances" v={`${hbar(plan.balances.hbar)} · ${money(plan.balances.stable)}`} />
            <div className="flex flex-wrap gap-2 mt-5">{plan.checks.map((check) => <span key={check} className="chip"><span className="text-good" aria-hidden="true">✓</span>{check}</span>)}</div>
          </>}
        </Panel>
      </div>

      <SectionHead eyebrow="Guardrails" title="A budget the agent cannot exceed">Daily caps per payment type, an emergency stop, and a signature from you for every run.</SectionHead>
      <div className="card p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap gap-4 justify-between items-center"><h3 className="text-[15px] font-semibold">Spent today</h3><button className="btn-ghost btn-sm" onClick={() => setSettingsOpen((v) => !v)} aria-expanded={settingsOpen} aria-controls="agent-budget-settings">{settingsOpen ? "Close limits" : "Manage limits"}</button></div>
        <div className="grid md:grid-cols-3 gap-3"><Budget title="Underwriting fees today" used={s?.budget?.used.api} limit={limits?.apiDaily} format={hbar} /><Budget title="Insurance premiums today" used={s?.budget?.used.premium} limit={limits?.premiumDaily} format={money} /><Budget title="Gas reserved today" used={s?.budget?.used.gas} limit={limits?.gasDaily} format={hbar} /></div>
        <p className="text-xs text-muted">Budgets reset at midnight UTC. Pending and uncertain payments remain counted. Gas totals use the maximum reserved estimate, which can exceed fees actually charged.</p>
        {settingsOpen && <form id="agent-budget-settings" onSubmit={saveLimits} className="pt-5 border-t border-line space-y-5"><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">{LIMIT_FIELDS.map((f) => <label key={f.key} className="space-y-2 block" htmlFor={`limit-${f.key}`}><span className="label">{f.label}</span><div className="relative"><input id={`limit-${f.key}`} className="input pr-16" type="text" inputMode={f.decimals ? "decimal" : "numeric"} value={limitInputs[f.key] || ""} disabled={!authorised || Boolean(busy || s?.locked)} onChange={(e) => setLimitInputs((v) => ({ ...v, [f.key]: e.target.value }))} /><span className="absolute right-3 top-3 text-xs text-muted pointer-events-none">{f.unit}</span></div><span className="text-xs text-muted">Ceiling {displayUnits((s?.ceilings || d?.limits)?.[f.key], f.decimals) || "—"} {f.unit}</span></label>)}</div><div className="flex flex-wrap gap-4 items-center"><button className="btn-primary" disabled={!canOperate} type="submit">{busy === "settings" ? "Saving…" : "Save spending limits"}</button><p className="text-xs text-muted">Controller signature required. Limits cannot exceed the configured ceilings.</p></div></form>}
        <div className="pt-5 border-t border-line flex flex-wrap items-center justify-between gap-4"><div className="max-w-xl"><div className="text-sm font-medium">Emergency stop</div><p className="text-xs text-muted mt-1">Stops new payment steps. Submitted transactions may still settle. Blocked runs require operator reconciliation.</p></div><button className={`btn-ghost ${s?.stopped ? "" : "text-bad border-bad/30"}`} disabled={!authorised || Boolean(busy) || (s?.stopped && (s?.locked || s?.environmentStopped))} onClick={() => act(s?.stopped ? "resume" : "stop")}>{busy === "stop" || busy === "resume" ? "Authorising…" : s?.stopped ? "Resume agent" : "Stop agent"}</button></div>
      </div>

      <SectionHead eyebrow="Step 3" title="Follow the run">Each stage settles on Hedera and leaves a receipt you can open on HashScan.</SectionHead>
      <div className="grid lg:grid-cols-[1.15fr_1fr] gap-6 items-start">
        <Panel title="Execution" desc="The selected run, stage by stage."><Execution run={selected} /></Panel>
        <div className="card p-5 sm:p-6"><h3 className="text-[15px] font-semibold mb-4">Recent runs</h3>{!s?.runs?.length ? <p className="text-sm text-muted">Run history appears after the first dashboard execution.</p> : <div className="space-y-2">{s.runs.map((r) => <button key={r.id} onClick={() => setRunId(r.id)} className={`w-full text-left rounded-xl border p-4 transition ${selected?.id === r.id ? "border-accent/40 bg-accentSoft" : "border-line hover:bg-sunk"}`} aria-pressed={selected?.id === r.id}><div className="flex justify-between gap-3 text-sm"><span className="font-medium">{r.data.parameters?.shares} NVDA shares</span><span className={r.status === "complete" ? "text-good" : r.status === "blocked" ? "text-warn" : "text-accent"}>{r.status === "complete" ? "Complete" : r.status === "blocked" ? "Review" : "Running"}</span></div><div className="text-xs text-muted mt-2">{when(r.created_at)} · {(r.data.parameters?.deductibleBps || 0) / 100}% deductible</div></button>)}</div>}
          <div className="mt-6 pt-5 border-t border-line"><h3 className="font-medium text-sm">Restricted to this mandate</h3><div className="mt-3 space-y-2 text-xs text-ink2">{["Hedera testnet and approved contracts", "Share ownership proven on-chain", "Exact approvals and reserved collateral", "Single-use controller authorisations", "Persistent budgets and replay protection", "Private key never sent to the browser"].map((text) => <p key={text}>✓ {text}</p>)}</div>{s?.hcsTopic && <a className="text-xs text-accent underline mt-4 inline-block" href={`https://hashscan.io/testnet/topic/${s.hcsTopic}`} target="_blank" rel="noreferrer">Audit topic {s.hcsTopic} ↗</a>}</div>
        </div>
      </div>

      <div className="card overflow-hidden"><div className="p-5 sm:p-6 flex flex-wrap justify-between items-center gap-4"><div><h3 className="text-[15px] font-semibold">Spending & receipts</h3><p className="text-xs text-muted mt-1">Confirmed transfers and conservative reservations from the agent wallet.</p></div><label><span className="sr-only">Filter spending</span><select className="input !w-auto !h-9 text-xs" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All spending</option><option value="api">Underwriting</option><option value="premium">Premiums</option><option value="gas">Gas & audit</option></select></label></div>
        {spends.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-y border-line bg-sunk text-xs text-muted text-left"><tr>{["Payment", "Reserved amount", "Status", "Receipt"].map((h) => <th key={h} className="px-5 py-3 font-medium">{h}</th>)}</tr></thead><tbody className="divide-y divide-line">{spends.map((r) => <tr key={r.id}><td className="px-5 py-4 whitespace-nowrap">{r.kind === "api" ? "Underwriting service" : r.kind === "premium" ? "Insurance premium" : r.id.startsWith("hcs:") ? "HCS audit" : "Transaction gas"}<div className="text-xs text-muted mt-1">{r.day} UTC</div></td><td className="px-5 py-4 tabular whitespace-nowrap">{r.kind === "premium" ? money(r.amount) : hbar(r.amount)}</td><td className="px-5 py-4"><span className={`chip ${r.status === "confirmed" ? "text-good" : "text-warn"}`}>{r.status}</span></td><td className="px-5 py-4 whitespace-nowrap">{r.tx ? <a className="text-accent underline text-xs" href={txUrl(r.tx)} target="_blank" rel="noreferrer">HashScan ↗</a> : <span className="text-xs text-muted">No receipt yet</span>}</td></tr>)}</tbody></table></div> : <div className="p-5 sm:p-6 border-t border-line"><Placeholder title={s?.ready ? "No matching spending records" : "Wallet ledger is unavailable"}>{s?.ready ? "Reservations appear when the agent authorises a payment." : "Complete agent setup to see its budgets and spending."}</Placeholder></div>}
      </div>
      {events.length > 0 && <details className="card p-5"><summary className="text-sm font-medium cursor-pointer">Merchant settlement evidence · {events.length} records</summary><div className="mt-4 divide-y divide-line">{events.map((e) => <div key={e.seq} className="py-3 flex flex-wrap justify-between items-center gap-3"><div className="text-sm">{e.event === "x402.settled" ? "Underwriting payment settled" : e.event}<div className="text-xs text-muted mt-1">{when(e.at)}</div></div>{e.hashscan && <a href={e.hashscan} target="_blank" rel="noreferrer" className="text-xs text-accent underline">HashScan ↗</a>}</div>)}</div></details>}
    </Section>
  </>;
}
