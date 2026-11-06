"use client";
import { useMemo } from "react";
import { addr, stableSymbol } from "@/lib/contracts";
import { usePoolState } from "@/lib/usePoolState";
import { useSymbolNames } from "@/lib/useSymbolNames";
import { usePolicies } from "@/components/MyPolicies";
import { fmtMoney, fmtNum, fmtPct, fromUnits } from "@/lib/format";
import { PageHead, Section, SectionHead, Panel, Stat, Row, useActiveChain, DeployGate, AddrLink, Placeholder, HeroCtas, HowItWorks, Faq, More } from "@/components/ui";
import { PoolArt } from "@/components/IsoArt";
import ProPanel from "@/components/ProPanel";

function Meter({ label, value, max, sub }) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm"><span className="text-ink2">{label}</span><span className="tabular">{fmtPct(pct, 1)}</span></div>
      <div className="h-2.5 rounded-full bg-sunk mt-2 overflow-hidden"><div className="h-full bg-accent rounded-full" style={{ width: `${pct * 100}%` }} /></div>
      {sub && <div className="text-xs text-muted mt-1.5">{sub}</div>}
    </div>
  );
}

const STEPS = [
  ["Holders pay premiums", "Every protection fee lands in the vault. That income is what savers and Pro LPs earn."],
  ["Payouts are set aside first", "Before a policy is sold, its maximum payout is locked in the vault. No policy is ever unfunded."],
  ["Crash or calm", "If a stock crashes, the locked money pays the holder. If not, it is released and the premium stays with the vault."],
];

const LOSS_ORDER = [
  ["Premiums collected", "Absorbs losses first", "bg-sage"],
  ["Pro LP capital", "Takes the next loss, earns more", "bg-accent text-white"],
  ["Savers' vault units", "Only after Pro is used up", "bg-primary text-white"],
  ["Savers' T-bills", "Never pays a claim", "bg-sunk text-muted"],
];

function LossOrder() {
  return (
    <div className="card p-5 sm:p-6">
      <div className="text-sm font-medium">If a claim comes in, who pays?</div>
      <ol className="mt-4 space-y-2">
        {LOSS_ORDER.map(([t, sub, cls], i) => (
          <li key={t} className={`rounded-xl px-4 py-3 flex items-center justify-between gap-3 ${cls}`}>
            <span className="font-medium">{i + 1}. {t}</span>
            <span className="text-xs opacity-80 text-right">{sub}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const FAQ = [
  ["Who puts money in the vault?", "Two groups. Savers, through protected notes, and Pro LPs, who take the first loss in exchange for a bigger share of premiums."],
  ["Can the vault run out of money?", "No policy is sold unless its maximum payout can be locked. Half the capital is held in reserve and never backs policies, and no single stock can use more than its cap."],
  ["What does the vault earn in a normal year?", "In the 2005–2026 backtest the long-run loss ratio was about 0.57–0.61: the vault kept roughly 40 cents of every premium dollar."],
  ["Where does idle money sit?", "In tokenised T-bills (vxTBILL), so cash that is not locked for a policy still earns the Treasury rate."],
];

export default function PoolPage() {
  const { chainId, deployed, address } = useActiveChain();
  const stable = stableSymbol(chainId);
  const s = usePoolState(chainId);
  const nameOf = useSymbolNames();
  const count = Number(s.policyCount || 0);
  const ids = useMemo(() => Array.from({ length: Math.min(count, 120) }, (_, i) => BigInt(count - 1 - i)), [count]);
  const policies = usePolicies(ids, chainId);

  const p = s.pool;
  const pro = s.pro || {};
  const senior = fromUnits(p.totalAssets); // Savers' sleeves (senior NAV)
  const junior = pro.available ? fromUnits(pro.juniorAssets) : 0;
  const total = pro.available && pro.physicalAssets !== undefined ? fromUnits(pro.physicalAssets) : senior;
  const locked = fromUnits(p.locked);
  const working = pro.available && pro.capacityTotal !== undefined ? fromUnits(pro.capacityTotal) : senior * (1 - Number(p.reserveBps || 0) / 1e4);
  const prem = fromUnits(p.totalPremiums);
  const paid = fromUnits(p.totalPayouts);
  const nav = s.tbill.navPerShare ? Number(s.tbill.navPerShare) / 1e18 : null;

  const bySymbol = useMemo(() => {
    const m = {};
    policies.filter((x) => Number(x.status) === 1).forEach((x) => {
      const k = x.symbol;
      m[k] = m[k] || { symbol: k, n: 0, notional: 0, maxPayout: 0, premium: 0 };
      m[k].n += 1;
      m[k].notional += fromUnits(x.notional);
      m[k].maxPayout += fromUnits(x.notional) * Number(x.capBps) / 1e4;
      m[k].premium += fromUnits(x.premium);
    });
    return Object.values(m).sort((a, b) => b.maxPayout - a.maxPayout);
  }, [policies]);
  const settled = policies.filter((x) => Number(x.status) === 2);

  return (
    <>
      <PageHead
        eyebrow="Underwriting vault"
        title="The vault that pays the claims."
        art={<PoolArt />}
        right={<HeroCtas items={[["See the vault live", "#live"], ["Earn as a Pro LP", "#pro"]]} />}
      >
        Savers and Pro LPs fund it. Stock holders pay premiums into it. Every policy&apos;s maximum payout is set aside before it is sold.
      </PageHead>

      <HowItWorks title="Premiums in, payouts locked" steps={STEPS} aside={<LossOrder />} />

      <Section className="mt-20">
        <DeployGate chainId={chainId}>
          <SectionHead id="live" eyebrow="Live on-chain" title="The vault right now">Read straight from the contracts.</SectionHead>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Total in the vault" value={s.ok ? fmtMoney(total, { sym: "" }) : "—"} sub={pro.available ? `Savers ${fmtMoney(senior, { sym: "" })} · Pro ${fmtMoney(junior, { sym: "" })}` : stable} />
            <Stat label="Set aside for payouts" value={s.ok ? fmtMoney(locked, { sym: "" }) : "—"} sub="max payout of open policies" />
            <Stat label="Room for new cover" value={s.ok ? fmtMoney(fromUnits(p.capacity), { sym: "" }) : "—"} sub="more payout the vault can back" />
            <Stat label="Vault unit price" value={s.ok && p.sharePrice ? fmtNum(fromUnits(p.sharePrice), 4) : "—"} sub="started at 1.0000, rises with premiums" />
          </div>
          <More label="Risk limits, results and T-bill details" className="mt-5">
          <div className="grid lg:grid-cols-3 gap-4">
            <Panel title="Risk limits" desc="Enforced by the contract, not the website.">
              <div className="space-y-5">
              <Meter label="Utilisation of working capital" value={locked} max={working} sub={`${fmtMoney(working, { sym: "" })} working capital = ${pro.available ? "Pro + " : ""}sleeves × (1 − reserve)`} />
              <Row k="Reserve R (never backs policies)" v={fmtPct(Number(p.reserveBps || 0) / 1e4, 0)} />
              <Row k="Per-stock cap m" v={fmtPct(Number(p.symbolCapBps || 0) / 1e4, 0)} />
              <Row k="Per-market cap" v={fmtPct(Number(p.marketCapBps || 0) / 1e4, 0)} />
              <Row k="Cash / T-bills" v={`${fmtMoney(fromUnits(p.cash), { sym: "" })} / ${fmtMoney(fromUnits(p.tbillAssets), { sym: "" })}`} />
              <div className="text-xs text-muted">Pool <AddrLink address={addr(chainId, "UnderwritingPool")} chainId={chainId} /></div>
              </div>
            </Panel>
            <Panel title="Underwriting result" desc="Premiums in, claims out.">
              <div>
                <Row k="Premiums earned" v={`${fmtMoney(prem, { sym: "" })} ${stable}`} />
                <Row k="Claims paid" v={`${fmtMoney(paid, { sym: "" })} ${stable}`} />
                <Row k="Loss ratio" v={prem > 0 ? fmtPct(paid / prem, 1) : "—"} strong />
                <Row k="Policies written" v={fmtNum(count)} />
                <Row k="Settled / paid out" v={`${settled.length} / ${settled.filter((x) => Number(x.payout) > 0).length}`} />
              </div>
              <p className="text-xs text-muted mt-3">The backtest's long-run loss ratio is about 0.57–0.61: savers keep roughly 40 cents of every premium dollar.</p>
            </Panel>
            <Panel title="Tokenised T-bill" desc="vxTBILL: where idle cash and savers' floors sit.">
              <div>
                <Row k="NAV per share" v={nav ? fmtNum(nav, 6) : "—"} strong />
                <Row k="Fund yield" v={s.tbill.apyBps !== undefined ? fmtPct(Number(s.tbill.apyBps) / 1e4, 2) : "—"} />
                <Row k="Fund assets" v={fmtMoney(fromUnits(s.tbill.totalAssets), { sym: "" })} />
                <Row k="Attested reserve" v={fmtMoney(fromUnits(s.tbill.attestedReserve), { sym: "" })} />
              </div>
              <div className="text-xs text-muted mt-3">Vault <AddrLink address={addr(chainId, "TBillVault")} chainId={chainId} /></div>
            </Panel>
          </div>
          </More>
          <div id="pro" className="mt-16 scroll-mt-28">
            <ProPanel chainId={chainId} account={address} pro={pro} />
          </div>
          <div className="mt-16">
            <SectionHead eyebrow="Exposure" title="What the vault is protecting">Open policies by stock, and how much is set aside for each.</SectionHead>
            <div>
              {bySymbol.length === 0 ? (
                <Placeholder title="No open cover right now">Policies appear here as soon as they are bought.</Placeholder>
              ) : (
                <div className="card overflow-x-auto">
                  <table className="table-x">
                    <thead><tr><th>Stock</th><th>Policies</th><th>Protected</th><th>Set aside</th><th>Premiums</th><th>Share of working capital</th></tr></thead>
                    <tbody>
                      {bySymbol.map((r) => (
                        <tr key={r.symbol}>
                          <td className="font-mono text-xs">{nameOf(r.symbol)}</td>
                          <td>{r.n}</td>
                          <td>{fmtMoney(r.notional, { sym: "" })}</td>
                          <td>{fmtMoney(r.maxPayout, { sym: "" })}</td>
                          <td>{fmtMoney(r.premium, { sym: "" })}</td>
                          <td>{working > 0 ? fmtPct(r.maxPayout / working, 1) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </DeployGate>
      </Section>
      <Faq items={FAQ} />
    </>
  );
}
