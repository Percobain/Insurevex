"use client";
import { useApi } from "@/lib/api";
import { PageHead, Section, Stat, Row, Notice, Placeholder } from "@/components/ui";

export default function AgentPage() {
  const discovery = useApi("/api/agent/discovery", { refetchInterval: 10000 });
  const activity = useApi("/api/agent/activity", { refetchInterval: 10000 });
  const d = discovery.data;
  const limits = d?.limits;
  const events = activity.data?.events || [];
  const hbar = (v) => v ? `${Number(v) / 1e8} HBAR` : "—";
  const usd = (v) => v ? `$${Number(v) / 1e6}` : "—";
  return <>
    <PageHead eyebrow="Hedera · AI agents that pay" title="Protection, within your limits.">
      An autonomous agent purchases underwriting through x402, checks the quote against its spending policy,
      and pays the insurance premium from its dedicated testnet wallet.
    </PageHead>
    <Section className="space-y-6 pb-16">
      {discovery.isError && <Notice tone="warn">The agent service is unavailable. No payment can be started from this dashboard.</Notice>}
      <div className="grid sm:grid-cols-3 gap-4">
        <Stat label="Environment" value="Hedera testnet" sub="Test assets only · chain 296" />
        <Stat label="Underwriting service" value={d?.enabled ? "Available" : discovery.isLoading ? "Checking…" : "Stopped"} sub="Operator-controlled emergency stop" tone={d?.enabled ? "good" : undefined} />
        <Stat label="Fee per underwriting request" value={hbar(d?.amount)} sub="Paid through x402 · facilitator sponsors gas" />
      </div>
      <div className="grid md:grid-cols-2 gap-5">
        <div className="card p-6">
          <h2 className="text-xl font-semibold mb-4">Every purchase has boundaries.</h2>
          <Row k="Allowed stock" v="Tokenised NVIDIA" />
          <Row k="Ownership proof" v="On-chain ATS balance" />
          <Row k="Maximum protected amount" v={usd(limits?.notionalPerPolicy)} />
          <Row k="Premium per policy / per day" v={`${usd(limits?.premiumPerPolicy)} / ${usd(limits?.premiumDaily)}`} />
          <Row k="Service spending per day" v={hbar(limits?.apiDaily)} />
          <Row k="Open policies" v={limits?.maxOpenPolicies ?? "—"} />
          <Row k="Protection period / payout cap" v="7 days / 10%" />
          <p className="text-xs text-muted mt-4">These are service ceilings. The wallet can apply lower limits. Uncertain payments remain counted until an operator reconciles them.</p>
        </div>
        <div className="card p-6">
          <h2 className="text-xl font-semibold mb-4">From discovery to protection.</h2>
          <ol className="space-y-4 text-sm text-ink2 list-decimal pl-5">
            <li>Discover the allowlisted underwriting service and its fee.</li>
            <li>Verify identity, share ownership, pool capacity and spending limits.</li>
            <li>Pay the HTTP 402 challenge in test HBAR and receive a signed quote.</li>
            <li>Verify the quote and approve exactly the test USD premium.</li>
            <li>Buy collateralised protection. Settlement follows the existing oracle flow.</li>
          </ol>
          <p className="text-xs text-muted mt-5">The underwriting service fee and insurance premium are separate payments. The agent has no authority to change prices, approve identities or withdraw pool funds.</p>
        </div>
      </div>
      <div>
        <h2 className="text-2xl font-semibold mb-4">Payment evidence</h2>
        {events.length === 0 ? <Placeholder title="No agent payments recorded">Confirmed service payments appear here with their HashScan receipts.</Placeholder> :
          <div className="card divide-y divide-line">{events.map((e) => <div key={e.seq} className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
            <div><div className="font-medium">{e.event === "x402.settled" ? "Underwriting payment settled" : e.event}</div><div className="text-xs text-muted mt-1">{new Date(e.at).toLocaleString()}</div></div>
            {e.hashscan && <a className="text-accent text-sm underline" href={e.hashscan} target="_blank" rel="noreferrer">View on HashScan ↗</a>}
          </div>)}</div>}
      </div>
    </Section>
  </>;
}
