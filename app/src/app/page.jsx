"use client";
import Link from "next/link";
import { useData } from "@/lib/api";
import { usePoolState } from "@/lib/usePoolState";
import { CHAINS, CHAIN_META, DEFAULT_CHAIN_ID } from "@/lib/chains";
import { isDeployed, addr } from "@/lib/contracts";
import { EXCHANGES, REGIONS, flag } from "@/lib/exchanges";
import { fmtPct, fmtUnits, fmtNum, fromUnits } from "@/lib/format";
import { Section, Stat } from "@/components/ui";
import MoneyFlow from "@/components/MoneyFlow";

function NoteExample() {
  // 3-year note at a 4% locked T-bill rate (simple accrual, same formula as ProtectedNote.floorFor)
  const face = 1000;
  const floor = face / (1 + 0.04 * 3);
  const sleeve = face - floor;
  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-baseline justify-between">
        <div className="label">A $1,000 three-year note</div>
        <div className="text-xs text-muted">T-bill rate 4.0%</div>
      </div>
      <div className="mt-5 h-12 rounded-xl overflow-hidden flex border border-line" aria-hidden="true">
        <div className="bg-sunk grid place-items-center text-xs text-ink2" style={{ width: `${(floor / face) * 100}%` }}>
          T-bill floor
        </div>
        <div className="bg-accent text-accentInk grid place-items-center text-xs font-medium" style={{ width: `${(sleeve / face) * 100}%` }}>
          Sleeve
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 mt-5 text-sm">
        <div>
          <div className="text-2xl font-semibold tabular">${fmtNum(floor, 2)}</div>
          <div className="text-ink2 mt-1">buys tokenised T-bills that grow back to exactly $1,000 at maturity.</div>
        </div>
        <div>
          <div className="text-2xl font-semibold tabular text-accent">${fmtNum(sleeve, 2)}</div>
          <div className="text-ink2 mt-1">underwrites crash floors and pays you the premiums as coupons.</div>
        </div>
      </div>
      <div className="mt-5 pt-4 border-t border-line text-sm flex items-center justify-between">
        <span className="text-ink2">Worst case at maturity</span>
        <span className="font-semibold tabular">$1,000.00</span>
      </div>
    </div>
  );
}

function HolderExample() {
  const value = 10000, b = 0.1, c = 0.2, fall = 0.25, premium = 0.009;
  const payout = value * Math.min(Math.max(fall - b, 0), c);
  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-baseline justify-between">
        <div className="label">$10,000 of NVDA, one month</div>
        <div className="text-xs text-muted">deductible 10% · cap 20%</div>
      </div>
      <div className="mt-5 space-y-2.5 text-sm tabular">
        <div className="flex justify-between"><span className="text-ink2">Premium paid upfront</span><span>−${fmtNum(value * premium)}</span></div>
        <div className="flex justify-between"><span className="text-ink2">Stock falls 25%</span><span className="text-bad">−${fmtNum(value * fall)}</span></div>
        <div className="flex justify-between"><span className="text-ink2">InsureVEX pays the fall beyond 10%</span><span className="text-good">+${fmtNum(payout)}</span></div>
        <div className="flex justify-between pt-2.5 border-t border-line font-semibold"><span>Net loss</span><span>−${fmtNum(value * fall - payout + value * premium)}</span></div>
      </div>
      <p className="text-xs text-muted mt-4">Illustrative premium. Live quotes come from the pricing engine and the official close settles every policy.</p>
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
      <Section className="pt-12 sm:pt-20 pb-10">
        <div className="grid lg:grid-cols-[1.15fr_1fr] gap-10 lg:gap-14 items-start">
          <div>
            <div className="eyebrow">Principal-protected notes · crash floors on any stock</div>
            <h1 className="font-display text-[44px] leading-[1.02] sm:text-6xl lg:text-[76px] tracking-tight mt-4">
              Two scared people
              <br />
              protect each other.
            </h1>
            <p className="text-ink2 text-lg mt-6 max-w-xl leading-relaxed">
              Savers are scared of losing money. Shareholders are scared of a crash. InsureVEX puts them in one pool: the saver's
              spare yield insures the shareholder's stock, and the saver always gets their deposit back.
            </p>
            <div className="grid sm:grid-cols-2 gap-3 mt-6 max-w-xl">
              <div className="rounded-xl border border-line p-3.5">
                <div className="text-sm font-semibold">Shares at your broker</div>
                <div className="text-xs text-ink2 mt-1">Zerodha on NSE, Robinhood or IBKR on Nasdaq, LSE, TSE, HKEX. Holdings attested from a statement or the broker API.</div>
              </div>
              <div className="rounded-xl border border-line p-3.5">
                <div className="text-sm font-semibold">Tokenised stocks</div>
                <div className="text-xs text-ink2 mt-1">ATS equities on Hedera and other RWA tokens. The contract reads your balance on-chain.</div>
              </div>
            </div>
            <p className="text-xs text-muted mt-3 max-w-xl">Either way the cover pays in stablecoin, settled against the exchange's official close.</p>
            <div className="flex flex-wrap gap-3 mt-8">
              <Link href="/protect" className="btn-primary h-12 px-6">Protect a stock</Link>
              <Link href="/save" className="btn-ghost h-12 px-6">Buy a protected note</Link>
              <Link href="/docs" className="btn h-12 px-4 text-ink2 hover:text-ink">Read the research →</Link>
            </div>
            <div className="flex flex-wrap gap-2 mt-8">
              {CHAINS.map((c) => (
                <span key={c.id} className="chip">
                  <span className={`h-1.5 w-1.5 rounded-full ${isDeployed(c.id) ? "bg-good" : "bg-muted"}`} />
                  {CHAIN_META[c.id].short} · {CHAIN_META[c.id].stable}
                </span>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <NoteExample />
            <HolderExample />
          </div>
        </div>
      </Section>

      <Section className="py-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Markets backtested" value={s ? fmtNum(s.markets) : "23"} sub={s ? `${fmtNum(s.names)} stocks, ${s.data_range?.[0]?.slice(0, 4)}–${s.data_range?.[1]?.slice(0, 4)}` : "2001–2026"} />
          <Stat label="Pool APY, out of sample" value={oos ? fmtPct(oos.total_apy) : "—"} sub={oos ? `${fmtPct(oos.uw_apy)} above T-bills · walk-forward, R50/u25` : "loading backtest"} />
          <Stat label="Worst year for the pool" value={oos ? fmtPct(oos.worst_year) : "—"} sub={oos ? `${oos.worst_year_label} · max drawdown ${fmtPct(oos.maxdd)}` : ""} tone="bad" />
          <Stat label="Saver principal lost" value="$0" sub="in every simulated note, every market" tone="good" />
        </div>
      </Section>

      <Section className="py-14">
        <div className="max-w-2xl">
          <div className="eyebrow">How the money moves</div>
          <h2 className="font-display text-4xl sm:text-5xl tracking-tight mt-3">Premiums in, crash payouts out, principal untouched.</h2>
        </div>
        <div className="mt-10"><MoneyFlow /></div>
        <div className="grid md:grid-cols-3 gap-4 mt-10">
          {[
            ["1 · Save", "A saver deposits stablecoins. Most of it buys tokenised T-bills sized to grow back to the full deposit by maturity. The rest, the sleeve, joins the underwriting pool."],
            ["2 · Protect", "A shareholder proves they own the stock and buys a floor for a week or a month. If the official close falls more than the deductible, the pool pays the extra fall, up to the cap."],
            ["3 · Settle", "Every policy is fully collateralised and settles from the official close. Quiet months turn premiums into coupons for savers. At maturity savers get their deposit back plus what the sleeve earned."],
          ].map(([t, d]) => (
            <div key={t} className="card p-5">
              <div className="font-semibold">{t}</div>
              <p className="text-sm text-ink2 mt-2 leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section className="py-14">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="max-w-2xl">
            <div className="eyebrow">Any listed stock</div>
            <h2 className="font-display text-4xl sm:text-5xl tracking-tight mt-3">23 exchanges, one pool.</h2>
            <p className="text-ink2 mt-3">No tokenised share needed: holders prove ownership with a broker statement or demat API, or hold an ATS-tokenised share on Hedera.</p>
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
