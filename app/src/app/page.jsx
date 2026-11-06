"use client";
import { useState } from "react";
import Link from "next/link";
import { useData } from "@/lib/api";
import { usePoolState } from "@/lib/usePoolState";
import { CHAINS, CHAIN_META, DEFAULT_CHAIN_ID } from "@/lib/chains";
import { isDeployed, addr } from "@/lib/contracts";
import { fmtPct, fmtUnits, fmtNum } from "@/lib/format";
import { Section } from "@/components/ui";
import ExchangeGlobe from "@/components/ExchangeGlobe";
import { LayerArt, SaverArt, HolderArt, PoolArt } from "@/components/IsoArt";
import BrandLogo from "@/components/BrandLogo";
import { DEMOS, DemoButton } from "@/components/DemoVideo";

const CHOICES = [
  {
    title: "Protect my stocks",
    line: "Get paid if your stock crashes.",
    example: <>$10,000 of NVIDIA for 1 month costs about <b>$90</b>. If it falls 25%, you get <b>$1,500</b>.</>,
    href: "/protect",
    cta: "Get my price",
  },
  {
    title: "Save safely",
    line: "Your money back, guaranteed, plus extra.",
    example: <>Put in $1,000: about <b>$893</b> goes into US government bonds that grow back to <b>$1,000</b> in 3 years. The rest earns fees. Since 2005, no saver got back less than they put in.</>,
    href: "/save",
    cta: "Start saving",
  },
  {
    title: "Earn more",
    line: "Back the protection and earn the fees.",
    example: <>Higher return, real risk. You take the first loss when a stock crashes.</>,
    href: "/pool",
    cta: "Start earning",
  },
];

// Same split as ProtectedNote.floorFor: floor = face / (1 + r * t). A 1-year note at a 5% T-bill rate.
const FACE = 1000;
const FLOOR = FACE / (1 + 0.05 * 1);
const SLEEVE = FACE - FLOOR;

function NoteExample() {
  return (
    <div className="card p-5">
      <div className="text-sm font-medium">$1,000 note · 1 year · T-bills at 5%</div>
      <div className="mt-4 h-11 rounded-lg overflow-hidden flex border border-line text-sm" aria-hidden="true">
        <div className="bg-sunk grid place-items-center text-ink2" style={{ width: `${(FLOOR / FACE) * 100}%` }}>T-bills ${fmtNum(FLOOR, 2)}</div>
        <div className="bg-accent text-white grid place-items-center font-medium" style={{ width: `${(SLEEVE / FACE) * 100}%`, minWidth: 64 }}>${fmtNum(SLEEVE, 2)}</div>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-ink2">Worst case at maturity</span>
        <span className="font-semibold tabular">$1,000.00</span>
      </div>
    </div>
  );
}

function HolderExample() {
  const value = 10000, b = 0.1, c = 0.2, fall = 0.25, premium = 90;
  const payout = value * Math.min(Math.max(fall - b, 0), c);
  return (
    <div className="card p-5">
      <div className="text-sm font-medium">$10,000 NVDA · 1 month · covers a 10–30% fall</div>
      <div className="mt-4 space-y-2 text-sm tabular">
        <div className="flex justify-between"><span className="text-ink2">Premium</span><span>−${fmtNum(premium)}</span></div>
        <div className="flex justify-between"><span className="text-ink2">NVDA falls 25%</span><span className="text-bad">−${fmtNum(value * fall)}</span></div>
        <div className="flex justify-between"><span className="text-ink2">Vault pays 25% − 10%</span><span className="text-good">+${fmtNum(payout)}</span></div>
        <div className="flex justify-between pt-2 border-t border-line font-semibold"><span>Net loss</span><span>−${fmtNum(value * fall - payout + premium)}</span></div>
      </div>
    </div>
  );
}

/** Numbered facts, one line each. */
function Facts({ items }) {
  return (
    <ol className="space-y-4">
      {items.map((t, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-0.5 h-6 w-6 shrink-0 rounded-full bg-primary text-white grid place-items-center text-xs font-semibold">{i + 1}</span>
          <span className="text-[15px] leading-relaxed text-ink">{t}</span>
        </li>
      ))}
    </ol>
  );
}

const INVESTORS = [
  {
    key: "saver",
    kicker: "Type 1",
    label: "Saver",
    title: "Can't afford to lose principal.",
    art: <SaverArt />,
    facts: [
      <>$952 buys T-bills that grow back to <b>$1,000</b> by maturity.</>,
      <>$48 buys <b>vault units</b> at today&apos;s unit price.</>,
      <>Every holder&apos;s premium raises the unit price. At maturity: <b>$1,000 + the units</b>.</>,
    ],
    example: <NoteExample />,
    href: "/save",
    cta: "Buy a protected note",
  },
  {
    key: "holder",
    kicker: "Type 2",
    label: "Holder",
    title: "Owns a stock, fears a crash.",
    art: <HolderArt />,
    facts: [
      <>Owns a stock on any exchange. The <b>pricing engine</b>, backtested over 25 years, quotes the premium.</>,
      <>The first <b>10%</b> of a fall is the holder&apos;s. The next <b>20%</b> is covered.</>,
      <>The $2,000 max payout is <b>locked in the vault</b> before the cover is sold. Settled on the official close.</>,
    ],
    example: <HolderExample />,
    href: "/protect",
    cta: "Protect a stock",
  },
  {
    key: "pro",
    kicker: "Type 3",
    label: "Pro LP",
    title: "Takes the first loss for a bigger share.",
    art: <PoolArt />,
    facts: [
      <>Deposits <b>first-loss</b> capital into the vault.</>,
      <>Earns a <b>bigger share of premiums</b> for taking that risk.</>,
      <>Losses hit premiums, then Pro LP, then savers&apos; units. The <b>T-bill floor is never touched</b>.</>,
    ],
    example: null,
    href: "/pool",
    cta: "See the vault",
  },
];

/** Segmented tabs: one panel per investor type. */
function InvestorTabs() {
  const [i, setI] = useState(0);
  const t = INVESTORS[i];
  return (
    <div>
      <div role="tablist" aria-label="Investor type" className="inline-flex flex-wrap rounded-xl border border-line bg-sunk p-1 gap-1">
        {INVESTORS.map((x, k) => (
          <button
            key={x.key}
            role="tab"
            aria-selected={i === k}
            onClick={() => setI(k)}
            className={`h-10 px-4 rounded-lg text-sm font-medium transition-colors ${i === k ? "bg-card text-ink shadow-sm border border-line" : "text-ink2 hover:text-ink border border-transparent"}`}
          >
            <span className={i === k ? "text-accent" : "text-muted"}>{x.kicker}</span>
            <span className="mx-1.5 text-line">/</span>
            {x.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mt-8 grid lg:grid-cols-[1.35fr_1fr] gap-8 lg:gap-12 items-start">
        <div key={t.key} className="min-w-0">{t.art}</div>
        <div className="lg:pt-4">
          <h3 className="font-display text-3xl tracking-tight">{t.title}</h3>
          <div className="mt-6">
            <Facts items={t.facts} />
          </div>
          {t.example && <div className="mt-6">{t.example}</div>}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link href={t.href} className="btn-primary h-11 px-5">{t.cta} →</Link>
            <DemoButton key={t.key} demo={DEMOS[t.key]} label={`Watch the ${t.kicker} demo`} />
          </div>
        </div>
      </div>
    </div>
  );
}

// Plain one-liners per network, keyed by chain id (CHAIN_META.role is written for developers).
const CHAIN_LINE = {
  1874: "Pays out in test USDT.",
  296: "Holds the stocks and savings plans.",
  5042002: "Pays out in test USDC.",
};

export default function Landing() {
  const summary = useData("global_summary.json");
  const s = summary.data;
  const live = usePoolState(DEFAULT_CHAIN_ID);
  // Pool return tested without hindsight: walk-forward product choice with leverage fixed by policy (R50/u25).
  const oos = s?.walkforward_policyB?.["0.125"] || s?.walkforward_oos;

  const proof = [
    ["56% less", "lost by stock owners in crashes since 2001"],
    ["0 of 2,229", "savings plans lost money"],
    [`${oos ? fmtPct(oos.total_apy) : "8.8%"} a year`, "earned by the pool, tested without hindsight"],
  ];

  return (
    <>
      {/* Hero */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-[1440px] border-x border-line grid lg:grid-cols-[0.85fr_1.15fr] items-center gap-6 px-5 sm:px-10 lg:px-14 py-12 lg:py-16">
          <div>
            <div className="eyebrow flex items-center gap-2">
              <BrandLogo variant="icon" className="w-6" alt="" />
              <span className="text-ink">InsureVEX</span>
            </div>
            <h1 className="font-display text-[40px] leading-[1.02] sm:text-[52px] lg:text-[56px] tracking-tight mt-4">
              Protect your stocks.
              <br />
              <span className="text-accent">Grow your savings</span> safely.
            </h1>
            <p className="text-ink2 text-base sm:text-lg mt-6 max-w-lg leading-relaxed">
              Stock owners get paid if their stock crashes. Savers get their money back, guaranteed, plus extra.
            </p>
            <div className="flex flex-wrap gap-3 mt-8">
              <Link href="/protect" className="btn-primary h-12 px-6">Protect my stocks</Link>
              <Link href="/save" className="btn h-12 px-6 bg-card border border-line hover:bg-sunk">Start saving</Link>
            </div>
          </div>
          <div className="min-w-0">
            <LayerArt />
          </div>
        </div>
      </section>

      {/* Choose */}
      <Section className="py-16">
        <h2 className="font-display text-4xl sm:text-5xl tracking-tight">What do you want to do?</h2>
        <div className="mt-8 grid md:grid-cols-3 gap-4">
          {CHOICES.map((c) => (
            <Link key={c.href} href={c.href} className="card p-6 sm:p-7 flex flex-col group hover:border-accent transition-colors">
              <h3 className="font-display text-2xl sm:text-3xl tracking-tight">{c.title}</h3>
              <p className="text-ink mt-2 text-base">{c.line}</p>
              <p className="text-ink2 text-sm leading-relaxed mt-4 flex-1">{c.example}</p>
              <span className="btn-primary h-11 px-5 mt-6 self-start">{c.cta} →</span>
            </Link>
          ))}
        </div>
      </Section>

      {/* Proof */}
      <section className="border-y border-line">
        <div className="mx-auto max-w-page px-4 py-12">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <h2 className="font-display text-4xl tracking-tight">Does it work?</h2>
            <Link href="/metrics" className="btn-ghost shrink-0">See every crash →</Link>
          </div>
          <div className="mt-8 grid sm:grid-cols-3 gap-6">
            {proof.map(([big, label]) => (
              <div key={label}>
                <div className="font-display text-4xl sm:text-5xl tracking-tight tabular text-good">{big}</div>
                <div className="text-ink2 mt-2">{label}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted mt-6">Tested on real prices from 23 stock markets, 2001 to 2026. Past results are not a promise.</p>
        </div>
      </section>

      {/* How it works */}
      <Section className="py-16">
        <InvestorTabs />
      </Section>

      {/* Countries */}
      <Section className="py-14">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="font-display text-4xl sm:text-5xl tracking-tight">Works with stocks in 23 countries.</h2>
            <p className="text-ink2 mt-3">Own shares in New York, Mumbai or Tokyo? You can protect them here.</p>
          </div>
          <Link href="/protect" className="btn-ghost shrink-0">Find your stock</Link>
        </div>
        <div className="mt-10">
          <ExchangeGlobe />
        </div>
      </Section>

      {/* Networks */}
      <Section className="py-14">
        <div className="grid lg:grid-cols-3 gap-4">
          <div>
            <h2 className="font-display text-4xl tracking-tight">Live on 3 networks.</h2>
            <p className="text-ink2 mt-3 text-sm leading-relaxed">
              The rules run on the blockchain, not on our website. This is a test version with test money.
            </p>
            <div className="mt-5 text-sm text-ink2">
              Money in the pool now:{" "}
              <span className="font-semibold text-ink tabular">{live.ok ? fmtUnits(live.pool.totalAssets, { sym: "$" }) : "—"}</span>
            </div>
          </div>
          <div className="lg:col-span-2 grid sm:grid-cols-3 gap-3">
            {CHAINS.map((c) => {
              const m = CHAIN_META[c.id];
              const d = isDeployed(c.id);
              return (
                <div key={c.id} className="card p-5 flex flex-col">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{m.short}</span>
                    <span className={`chip ${d ? "text-good border-good/40" : ""}`}>{d ? "Live" : "Soon"}</span>
                  </div>
                  <p className="text-sm text-ink2 mt-3 flex-1">{CHAIN_LINE[c.id]}</p>
                  {d && (
                    <a className="text-xs text-muted mt-4 underline underline-offset-2 hover:text-accent" href={m.address(addr(c.id, "CoverMarket"))} target="_blank" rel="noreferrer">
                      View on explorer
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Section>

      {/* Risks */}
      <Section className="py-14">
        <div className="card p-6 sm:p-10 grid md:grid-cols-2 gap-8">
          <h2 className="font-display text-4xl tracking-tight">What could go wrong</h2>
          <ul className="space-y-4 text-sm text-ink2 leading-relaxed">
            <li><span className="text-ink font-medium">Everything crashes at once.</span> In 2008 and 2020 the pool lost money. Savers still got all of their money back.</li>
            <li><span className="text-ink font-medium">Low interest rates mean a smaller extra.</span> The extra for savers comes from government bond interest.</li>
            <li><span className="text-ink font-medium">We say no to stocks already collapsing.</span> You cannot protect a stock that is already in free fall.</li>
          </ul>
        </div>
      </Section>
    </>
  );
}
