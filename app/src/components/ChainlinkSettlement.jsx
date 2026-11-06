"use client";
import { useApi } from "@/lib/api";
import { Panel, Row, Notice } from "./ui";

export default function ChainlinkSettlement() {
  const status = useApi("/api/chainlink/status", { refetchInterval: 15000 });
  const data = status.data;
  if (!data?.enabled) return null;
  return <Panel title="Settlement data · Chainlink CRE" desc="External closing prices are checked before a scoped policy can settle.">
    {status.isError && <Notice tone="warn">Settlement status is unavailable. Do not assume a report has been accepted.</Notice>}
    <div className="grid md:grid-cols-2 gap-x-8">
      <div><Row k="Mode" v={data.settlementEnabled ? "Operator-relayed settlement" : "Validation only · payments disabled"} />
        <Row k="Price sources" v="Yahoo Finance + Stooq" /><Row k="Maximum price disagreement" v={`${data.maxDeviationBps / 100}%`} />
        <p className="text-xs text-muted mt-3">A missing, stale or conflicting report leaves the policy pending. This prototype delivers reports through an authenticated operator relay.</p>
      </div>
      <div>{data.reports?.length ? data.reports.slice(0, 4).map((r) => <div key={r.id} className="py-3 border-b border-line text-sm">
        <div className="flex justify-between gap-3"><span className="font-medium">{r.symbol} · policy #{r.policyId}</span><span className={r.status === "settled" ? "text-good" : "text-accent"}>{r.status === "settled" ? "Settled" : "Validated"}</span></div>
        <div className="text-xs text-muted mt-1">{r.sessionDate} · close {(Number(r.price) / 1e8).toLocaleString()} USD</div>
        {r.transaction && r.explorer && <a className="text-xs text-accent underline mt-2 inline-block" href={`${r.explorer}/${r.chainId === 1874 ? "tx" : "transaction"}/${encodeURIComponent(r.transaction)}`} target="_blank" rel="noreferrer">Settlement receipt ↗</a>}
      </div>) : <p className="text-sm text-muted py-4">No validated reports yet. Run the CRE workflow for an expired policy.</p>}</div>
    </div>
  </Panel>;
}
