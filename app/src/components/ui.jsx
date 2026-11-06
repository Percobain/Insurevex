"use client";
import { useAccount, useSwitchChain } from "wagmi";
import { chainMeta, CHAINS } from "@/lib/chains";
import { isDeployed } from "@/lib/contracts";
import { shortHash, shortAddr } from "@/lib/format";
import { useDemo, DEMO_ADDR } from "@/lib/demo";

/**
 * Page header. With `art`, the scene sits beside the title (two columns on large screens) and `facts` show as a short
 * row of big numbers under the description. Without it, the classic single-column header.
 */
export function PageHead({ eyebrow, title, children, right, art, facts }) {
  if (art) {
    return (
      <div className="mx-auto max-w-page px-4 pt-10 sm:pt-14 pb-10 grid lg:grid-cols-[1fr_1.15fr] gap-8 lg:gap-12 items-center">
        <div className="min-w-0">
          {eyebrow && <div className="eyebrow mb-3">{eyebrow}</div>}
          <h1 className="font-display text-4xl sm:text-5xl leading-[1.03] tracking-tight">{title}</h1>
          {children && <p className="text-ink2 mt-5 text-base leading-relaxed max-w-xl">{children}</p>}
          {facts && (
            <dl className="mt-8 grid grid-cols-3 divide-x divide-line rounded-2xl border border-line bg-card">
              {facts.map(([v, k]) => (
                <div key={k} className="px-4 py-4">
                  <dt className="sr-only">{k}</dt>
                  <dd className="text-2xl font-semibold tracking-tight tabular">{v}</dd>
                  <dd className="mt-1 text-xs leading-snug text-ink2">{k}</dd>
                </div>
              ))}
            </dl>
          )}
          {right && <div className="mt-6">{right}</div>}
        </div>
        <div className="min-w-0">{art}</div>
      </div>
    );
  }
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

/** Section heading used across pages: eyebrow, title, one-line description, optional action on the right. */
export function SectionHead({ eyebrow, title, children, right, id }) {
  return (
    <div id={id} className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4 scroll-mt-28">
      <div className="max-w-2xl">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2 className="font-display text-3xl sm:text-[34px] leading-tight tracking-tight mt-2">{title}</h2>
        {children && <p className="text-ink2 mt-2 text-[15px] leading-relaxed">{children}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

/** shadcn-style card with a header (title, description, action) and a body. */
export function Panel({ title, desc, right, children, className = "" }) {
  return (
    <div className={`card overflow-hidden ${className}`}>
      {(title || right) && (
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {title && <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>}
            {desc && <p className="mt-0.5 text-[13px] text-ink2 leading-snug">{desc}</p>}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </div>
      )}
      <div className="px-5 py-4">{children}</div>
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

const SEG_MOBILE_COLS = { 2: "max-sm:grid-cols-2", 3: "max-sm:grid-cols-3", 4: "max-sm:grid-cols-2" };

/** `full`: on phones the choices become an even grid across the full width instead of wrapping. */
export function Seg({ value, onChange, options, full = false }) {
  const mobile = options.length > 4 ? "max-sm:grid max-sm:grid-cols-4 max-sm:w-full" : full ? `max-sm:grid max-sm:w-full ${SEG_MOBILE_COLS[options.length] || ""}` : "";
  return (
    <div className={`seg ${mobile}`} role="radiogroup">
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
const DEFAULT_CHAIN = Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID || 1874);
const SUPPORTED = new Set(CHAINS.map((c) => c.id));

export function useActiveChain() {
  const { chainId: walletChain, isConnected, address } = useAccount();
  const demo = useDemo();
  if (demo) return { chainId: DEFAULT_CHAIN, walletChain: DEFAULT_CHAIN, unsupported: false, isConnected: true, address: DEMO_ADDR, deployed: isDeployed(DEFAULT_CHAIN), meta: chainMeta(DEFAULT_CHAIN), demo: true };
  // On a chain InsureVEX does not run on, keep showing live data from the default chain (read-only) and ask to switch.
  const unsupported = Boolean(walletChain) && !SUPPORTED.has(walletChain);
  const id = walletChain && !unsupported ? walletChain : DEFAULT_CHAIN;
  return { chainId: id, walletChain, unsupported, isConnected, address, deployed: isDeployed(id), meta: chainMeta(id) };
}

function SwitchButtons() {
  const { switchChain, isPending } = useSwitchChain();
  return (
    <span className="flex flex-wrap gap-2 mt-2">
      {CHAINS.filter((c) => isDeployed(c.id)).map((c) => (
        <button key={c.id} type="button" className="btn-ghost btn-sm" disabled={isPending} onClick={() => switchChain({ chainId: c.id })}>
          Switch to {chainMeta(c.id).short}
        </button>
      ))}
    </span>
  );
}

export function DeployGate({ chainId, children }) {
  const { walletChain, unsupported } = useActiveChain();
  if (unsupported) {
    return (
      <>
        <Notice tone="warn">
          This network isn&apos;t supported. Switch to Whitechain, Hedera or Arc.
          <SwitchButtons />
        </Notice>
        {children}
      </>
    );
  }
  if (isDeployed(chainId)) return children;
  return (
    <Notice tone="warn">
      InsureVEX isn&apos;t on {chainMeta(chainId).short} yet. Switch to a network below.
      <SwitchButtons />
    </Notice>
  );
}

/** Hero buttons: [label, href] pairs. The first is primary. */
export function HeroCtas({ items }) {
  return (
    <div className="flex flex-wrap gap-3">
      {items.map(([label, href], i) => (
        <a key={href} href={href} className={i === 0 ? "btn-primary" : "btn-ghost"}>{label}</a>
      ))}
    </div>
  );
}

const ICON_PATHS = {
  search: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM20 20l-4.7-4.7",
  coin: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM14.5 9.2c-.5-.8-1.4-1.2-2.5-1.2-1.5 0-2.5.8-2.5 1.9 0 2.6 5 1.4 5 4.1 0 1.1-1.1 2-2.6 2-1.2 0-2.1-.5-2.6-1.3M12 6.5V8m0 8v1.5",
  shield: "M12 3 4.5 6v5.5c0 4.5 3.2 8.2 7.5 9.5 4.3-1.3 7.5-5 7.5-9.5V6L12 3ZM8.8 12.2l2.2 2.2 4.3-4.6",
  lock: "M6.5 10.5h11v9.5h-11zM8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5M12 14.5v2",
  split: "M12 3v6m0 0-6 6v6m6-12 6 6v6",
  growth: "M4 19h16M6 15l4-4 3 3 6-7M15 7h4v4",
  pay: "M3.5 7.5h17v10h-17zM3.5 11h17M7 14.5h3",
  vault: "M4 4.5h16v14H4zM4 18.5V20m16-1.5V20M15 11.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM12 8.5V7m0 9v-1.5",
  bolt: "M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z",
  sliders: "M5 6h9m4 0h1M5 12h3m4 0h7M5 18h11m4 0h-1M16 4v4M10 10v4M18 16v4",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 8h6M9 12h6M9 16h3",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.5c1-3.5 4-5.5 7.5-5.5s6.5 2 7.5 5.5",
  chart: "M4 20V4m0 16h16M8 16v-4m4 4V8m4 8v-6",
  hand: "M7 11V6.5a1.5 1.5 0 0 1 3 0V11m0-3.5V5a1.5 1.5 0 0 1 3 0v6m0-4.5a1.5 1.5 0 0 1 3 0V12m0-3a1.5 1.5 0 0 1 3 0v4.5c0 4-3 7-7 7h-.5c-2.4 0-4.2-1.1-5.5-3L4 13.6c-.7-1 .3-2.3 1.4-1.8L7 12.5",
  check: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8 12.3l2.7 2.7L16 9.6",
};

export function Icon({ name, className = "h-5 w-5" }) {
  const d = ICON_PATHS[name];
  if (!d) return null;
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/**
 * Landing-style "how it works": a row of connected step cards, with an optional visual beside them.
 * Each step: { title, body, stat?, icon? }. The last step is the outcome and is drawn dark.
 */
export function HowItWorks({ id = "how", eyebrow = "How it works", title, steps, aside }) {
  return (
    <Section className="mt-10">
      <SectionHead id={id} eyebrow={eyebrow} title={title} />
      <div className={aside ? "grid xl:grid-cols-[1.45fr_1fr] gap-6 items-stretch" : ""}>
        <ol className="grid sm:grid-cols-3 gap-4">
          {steps.map((st, i) => {
            const last = i === steps.length - 1;
            return (
              <li key={st.title} className={`relative rounded-2xl border p-5 flex flex-col min-w-0 ${last ? "bg-primary border-primary text-white" : "bg-card border-line"}`}>
                <div className="flex items-center justify-between">
                  <span className={`h-10 w-10 rounded-xl grid place-items-center ${last ? "bg-white/10 text-white" : "bg-accentSoft text-accent"}`}>
                    <Icon name={st.icon} />
                  </span>
                  <span className={`font-mono text-[11px] tracking-[0.14em] ${last ? "text-white/50" : "text-muted"}`}>STEP {String(i + 1).padStart(2, "0")}</span>
                </div>
                <h3 className="mt-5 text-[17px] font-semibold tracking-tight leading-snug">{st.title}</h3>
                <p className={`mt-1.5 text-sm leading-relaxed ${last ? "text-white/75" : "text-ink2"}`}>{st.body}</p>
                {st.stat && (
                  <div className={`mt-auto pt-4`}>
                    <div className={`pt-4 border-t border-dashed text-sm font-semibold tabular ${last ? "border-white/20 text-white" : "border-line text-ink"}`}>{st.stat}</div>
                  </div>
                )}
                {!last && (
                  <span className="hidden sm:grid absolute top-[26px] -right-[22px] z-10 h-7 w-7 place-items-center rounded-full border border-line bg-paper text-ink2" aria-hidden="true">
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        {aside}
      </div>
    </Section>
  );
}

/** Short Q&A list, collapsed by default. */
export function Faq({ items, title = "Questions" }) {
  return (
    <Section className="mt-20 mb-8">
      <SectionHead eyebrow="Good to know" title={title} />
      <div className="card divide-y divide-line">
        {items.map(([q, a]) => (
          <details key={q} className="group px-5 py-4">
            <summary className="cursor-pointer list-none flex items-center justify-between gap-4 font-medium">
              {q}<span className="text-muted transition group-open:rotate-45 text-xl leading-none">+</span>
            </summary>
            <p className="mt-2 text-[15px] text-ink2 leading-relaxed max-w-3xl">{a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

/** A collapsible block for secondary detail ("Show details"). */
export function More({ label = "More details", children, className = "" }) {
  return (
    <details className={`group ${className}`}>
      <summary className="cursor-pointer list-none inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline underline-offset-4">
        {label}<span className="transition group-open:rotate-180">⌄</span>
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}
