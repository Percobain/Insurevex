"use client";
import { useState } from "react";
import Link from "next/link";
import { useData } from "@/lib/api";
import { usePoolState } from "@/lib/usePoolState";
import { CHAINS, CHAIN_META, DEFAULT_CHAIN_ID } from "@/lib/chains";
import { isDeployed, addr } from "@/lib/contracts";
import { EXCHANGES, REGIONS, flag } from "@/lib/exchanges";
import { fmtPct, fmtUnits, fmtNum, fromUnits } from "@/lib/format";
import { Section, Stat } from "@/components/ui";
import { LayerArt, SaverArt, HolderArt, SettleArt, PoolArt, SystemArt } from "@/components/IsoArt";

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
    title: "Wants yield, fears a crash.",
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
    kicker: "Optional",
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

/** shadcn-style tabs: a segmented list and one panel. */
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
        <div key={t.key}>{t.art}</div>
        <div className="lg:pt-4">
          <h3 className="font-display text-3xl tracking-tight">{t.title}</h3>
          <div className="mt-6">
            <Facts items={t.facts} />
          </div>
          {t.example && <div className="mt-6">{t.example}</div>}
          <Link href={t.href} className="btn-primary h-11 px-5 mt-6">{t.cta} →</Link>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const summary = useData("global_summary.json");
  const s = summary.data;
  const live = usePoolState(DEFAULT_CHAIN_ID);
  // Headline = walk-forward product choice with leverage fixed by policy (R50/u25). The leverage-optimising walk-forward
  // (s.walkforward_oos) is shown in the research as the cautionary case: it chased APY in calm years and lost 24% in 2008.
  const oos = s?.walkforward_policyB?.["0.125"] || s?.walkforward_oos;
  return (
    <>
      <section className="border-b border-line">
        <div className="mx-auto max-w-[1440px] border-x border-line grid lg:grid-cols-[0.85fr_1.15fr] items-center gap-6 px-5 sm:px-10 lg:px-14 py-12 lg:py-16">
          <div>
            <div className="eyebrow">
              <span className="text-ink">InsureVEX</span> the layer between two investors
            </div>
            <h1 className="font-display uppercase text-[40px] leading-[0.98] sm:text-[52px] lg:text-[56px] mt-4">
              Principal safety for savers.
              <br />
              <span className="text-accent">Crash cover</span> for holders.
            </h1>
            <p className="text-ink2 text-base sm:text-lg mt-6 max-w-lg leading-relaxed">
              Savers get their principal back from T-bills and put the rest in a vault. Holders pay that vault to cover a crash. Every premium makes each saver&apos;s vault unit worth more.
            </p>
            <div className="flex flex-wrap gap-3 mt-8">
              <Link href="/save" className="btn-primary h-12 px-6">Save with a guarantee</Link>
              <Link href="/protect" className="btn h-12 px-6 bg-card border border-line hover:bg-sunk">Protect a stock</Link>
            </div>
          </div>
          <div className="min-w-0">
            <LayerArt />
          </div>
        </div>
      </section>

      <section className="border-b border-line">
        <div className="mx-auto max-w-[1440px] border-x border-line grid lg:grid-cols-[1.1fr_1fr]">
          <div className="px-5 sm:px-10 lg:px-14 py-8 lg:border-r border-line">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink"><span className="mr-0.5">//</span>Settles on</div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mt-4">
              {CHAINS.map((c, i) => (
                <span key={c.id} className="flex items-center gap-6">
                  {i > 0 && <span className="h-1 w-1 rounded-full bg-muted" />}
                  <span className="text-2xl font-semibold tracking-tight text-muted">{CHAIN_META[c.id].short}</span>
                  <span className="text-xs text-muted -ml-4">{CHAIN_META[c.id].stable}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="px-5 sm:px-10 lg:px-14 py-8 grid grid-cols-2 sm:grid-cols-4 gap-6">
            {[
              ["Pool APY", oos ? fmtPct(oos.total_apy) : "8.8%"],
              ["Worst year", oos ? fmtPct(oos.worst_year) : "−11%"],
              ["Markets", s ? fmtNum(s.markets) : "23"],
              ["Principal lost", "$0"],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted"><span className="mr-0.5">//</span>{k}</div>
                <div className="text-2xl font-semibold tracking-tight mt-3 tabular">{v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-page px-4 py-16 scroll-mt-28">
        <div className="max-w-2xl">
          <div className="eyebrow">Two investors, one layer</div>
          <h2 className="font-display text-4xl sm:text-5xl tracking-tight mt-3">Each side pays for what the other wants.</h2>
        </div>
        <div className="mt-10">
          <InvestorTabs />
        </div>
      </section>

      <Section className="py-16">
        <div className="grid lg:grid-cols-[1fr_1.35fr] gap-8 lg:gap-12 items-center">
          <div>
            <div className="eyebrow">At expiry</div>
            <h2 className="font-display text-4xl sm:text-5xl tracking-tight mt-3">Settled on the official close.</h2>
            <div className="mt-8">
              <Facts
                items={[
                  <>The exchange&apos;s official closing price is posted on-chain.</>,
                  <>NVDA fell 25%: the vault pays <b>$1,500</b>, the part between 10% and 25%.</>,
                  <>No crash: nothing is paid, the $2,000 is released and the <b>$90 stays with savers</b>.</>,
                ]}
              />
            </div>
          </div>
          <SettleArt />
        </div>
      </Section>

      <Section className="py-16">
        <div className="max-w-2xl">
          <div className="eyebrow">Under the hood</div>
          <h2 className="font-display text-4xl sm:text-5xl tracking-tight mt-3">Five contracts. Every rule on-chain.</h2>
        </div>
        <div className="mt-10"><SystemArt /></div>
      </Section>

      <Section className="py-14">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="max-w-2xl">
            <div className="eyebrow">Any listed stock</div>
            <h2 className="font-display text-4xl sm:text-5xl tracking-tight mt-3">23 exchanges, one pool.</h2>
            <p className="text-ink2 mt-3">No tokenised share needed: holders prove ownership with a broker statement or demat API, or hold an ATS-tokenised share on Hedera. Either way the cover pays in stablecoin, settled against the exchange&apos;s official close.</p>
          </div>
          <Link href="/protect" className="btn-ghost shrink-0">Find your stock</Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
          {REGIONS.map((r) => (
            <div key={r} className="card p-5">
              <div className="label">{r}</div>
              <ul className="mt-3 space-y-2 text-sm">
                {EXCHANGES.filter((e) => e.region === r).map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2">
                    <span className="truncate"><span className="mr-2" aria-hidden="true">{flag(e.code)}</span>{e.country}</span>
                    <span className="text-muted text-xs shrink-0">{e.exchange}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section className="py-14">
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1">
            <div className="eyebrow">Live on testnet</div>
            <h2 className="font-display text-4xl tracking-tight mt-3">On-chain, with the rules in the contracts.</h2>
            <p className="text-ink2 mt-3 text-sm leading-relaxed">
              KYC registry, freezes, transfer restrictions, per-stock exposure caps, full collateralisation and maturity rules are
              enforced by the contracts, not the website.
            </p>
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
                  <p className="text-sm text-ink2 mt-3 flex-1">{m.role}</p>
                  {d && (
                    <a className="text-xs text-accent mt-4 underline underline-offset-2" href={m.address(addr(c.id, "CoverMarket"))} target="_blank" rel="noreferrer">
                      CoverMarket on explorer
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
          <Stat label="Pool assets (live)" value={live.ok ? fmtUnits(live.pool.totalAssets, { sym: "$" }) : "—"} sub={CHAIN_META[DEFAULT_CHAIN_ID].short} />
          <Stat label="Collateral locked" value={live.ok ? fmtUnits(live.pool.locked, { sym: "$" }) : "—"} sub="max payout of open policies" />
          <Stat label="Premiums earned" value={live.ok ? fmtUnits(live.pool.totalPremiums, { sym: "$" }) : "—"} />
          <Stat label="Claims paid" value={live.ok ? fmtUnits(live.pool.totalPayouts, { sym: "$" }) : "—"} sub={live.ok && fromUnits(live.pool.totalPremiums) > 0 ? `loss ratio ${fmtPct(fromUnits(live.pool.totalPayouts) / fromUnits(live.pool.totalPremiums))}` : ""} />
        </div>
      </Section>

      <Section className="py-14">
        <div className="card p-6 sm:p-10 grid md:grid-cols-2 gap-8">
          <div>
            <div className="eyebrow">Honest about risk</div>
            <h2 className="font-display text-4xl tracking-tight mt-3">What can go wrong.</h2>
          </div>
          <ul className="space-y-4 text-sm text-ink2 leading-relaxed">
            <li><span className="text-ink font-medium">Crashes are correlated.</span> In the worst weeks almost every stock breaches at once. The reserve and per-stock caps limit a single period's loss to a known share of the pool, and the saver's T-bill floor is never used to pay claims.</li>
            <li><span className="text-ink font-medium">The sleeve is small when rates are low.</span> The note only has spare yield to work with when T-bills pay a few percent.</li>
            <li><span className="text-ink font-medium">Stocks already collapsing are refused.</span> The pool will not sell cover on a house that is already on fire.</li>
          </ul>
        </div>
      </Section>
    </>
  );
}
