"use client";
import { useAccount } from "wagmi";
import { chainMeta } from "@/lib/chains";
import { isDeployed } from "@/lib/contracts";
import { shortHash, shortAddr } from "@/lib/format";

export function PageHead({ eyebrow, title, children, right }) {
  return (
    <div className="mx-auto max-w-page px-4 pt-10 sm:pt-14 pb-6 flex flex-col sm:flex-row sm:items-end gap-4 justify-between">
      <div className="max-w-2xl">
        {eyebrow && <div className="eyebrow mb-3">{eyebrow}</div>}
        <h1 className="font-display text-4xl sm:text-5xl leading-[1.05] tracking-tight">{title}</h1>
        {children && <p className="text-ink2 mt-4 text-[15px] leading-relaxed">{children}</p>}
      </div>
      {right}
    </div>
  );
}

export function Section({ children, className = "" }) {
  return <section className={`mx-auto max-w-page px-4 ${className}`}>{children}</section>;
}

export function Stat({ label, value, sub, tone }) {
  return (
    <div className="card p-4 sm:p-5 min-w-0">
      <div className="label">{label}</div>
      <div className={`mt-2 text-2xl sm:text-[28px] font-semibold tracking-tight tabular truncate ${tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : ""}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </div>
  );
}

export function Row({ k, v, strong }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-line last:border-0 text-sm">
      <span className="text-ink2">{k}</span>
      <span className={`tabular text-right ${strong ? "font-semibold text-ink" : "text-ink"}`}>{v}</span>
    </div>
  );
}

export function Notice({ tone = "info", children }) {
  const cls = tone === "warn" ? "border-warn/40 bg-warn/10" : tone === "bad" ? "border-bad/40 bg-bad/10" : "border-accent/30 bg-accentSoft";
  return <div className={`rounded-xl border px-4 py-3 text-sm text-ink ${cls}`}>{children}</div>;
}

export function Placeholder({ title = "Not available yet", children }) {
  return (
    <div className="card p-6 border-dashed text-center">
      <div className="font-medium">{title}</div>
      {children && <div className="text-sm text-ink2 mt-1">{children}</div>}
    </div>
  );
}

export function Seg({ value, onChange, options }) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={value === o.value} data-on={value === o.value} className="seg-item" onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TxLink({ hash, chainId }) {
  if (!hash) return null;
  return (
    <a className="text-accent underline underline-offset-2 font-mono text-xs" href={chainMeta(chainId).tx(hash)} target="_blank" rel="noreferrer">
      {shortHash(hash)}
    </a>
  );
}

export function AddrLink({ address, chainId, label }) {
  if (!address) return <span className="text-muted">—</span>;
  return (
    <a className="text-accent underline underline-offset-2 font-mono text-xs" href={chainMeta(chainId).address(address)} target="_blank" rel="noreferrer">
      {label || shortAddr(address)}
    </a>
  );
}

/** Wraps chain-dependent UI: shows a clear message when the wallet's chain has no deployment yet. */
export function useActiveChain() {
  const { chainId, isConnected, address } = useAccount();
  const id = chainId || Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID || 1874);
  return { chainId: id, isConnected, address, deployed: isDeployed(id), meta: chainMeta(id) };
}

export function DeployGate({ chainId, children }) {
  if (isDeployed(chainId)) return children;
  return (
    <Notice tone="warn">
      InsureVEX is deploying soon on {chainMeta(chainId).short}. Switch to Whitechain Sepolia in the wallet menu to use the live contracts.
    </Notice>
  );
}
