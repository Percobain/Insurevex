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

/** Dollars, without cents once the amount is large. */
const usd = (x) => fmtMoney(x, { dp: Math.abs(Number(x) || 0) >= 100 ? 0 : 2 });

/** "Half" for 50%, otherwise "30%". */
function shareWord(bps) {
  const x = Number(bps || 0) / 1e4;
  return x === 0.5 ? "Half" : fmtPct(x, 0);
}

const STEPS = [
  { icon: "pay", title: "Fees come in", body: "Stock owners pay a fee for protection. It goes to the pool.", stat: "Income for the pool" },
  { icon: "lock", title: "Payouts set aside first", body: "Before protection is sold, its biggest possible payout is locked.", stat: "Every payout fully backed" },
  { icon: "check", title: "Crash or calm", body: "Crash: the stock owner is paid. Calm: the pool keeps the fee.", stat: "Paid at the closing price" },
];

const FAQ = [
  ["Who puts money in the pool?", "Savers, through savings plans, and Pro, who take the first hit for a bigger share of the fees."],
  ["Can the pool run out of money?", "Protection is only sold if its biggest payout can be set aside first. Part of the money is also always kept in reserve."],
  ["What does the pool earn in a normal year?", "In tests from 2005 to 2026, the pool kept about 40 cents of every $1 in fees."],
  ["Where does spare money wait?", "In US government bonds (T-bills), so it keeps earning interest."],
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
  const senior = fromUnits(p.totalAssets); // Savers' earning parts (senior NAV)
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
        eyebrow="Earn"
        title="Earn the fees from crash protection."
        art={<PoolArt />}
        right={<HeroCtas items={[["Start earning", "#pro"]]} />}
      >
        People pay to protect their stocks. The pool collects those fees and pays out in crashes.
      </PageHead>

      <Section className="mt-6">
        <DeployGate chainId={chainId}>
          <SectionHead id="live" eyebrow="Live" title="The pool right now" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Money in the pool" value={s.ok ? usd(total) : "—"} sub={pro.available ? `Savers ${usd(senior)} · Pro ${usd(junior)}` : "from savers"} />
            <Stat label="Set aside for payouts" value={s.ok ? usd(locked) : "—"} sub="for protection sold now" />
            <Stat label="Room for new protection" value={s.ok ? usd(fromUnits(p.capacity)) : "—"} sub="more payouts the pool can back" />
            <Stat label="Value of 1 share of the pool" value={s.ok && p.sharePrice ? `$${fmtNum(fromUnits(p.sharePrice), 4)}` : "—"} sub="started at $1, grows with fees" />
          </div>

          <div id="pro" className="mt-10 scroll-mt-28">
            <ProPanel chainId={chainId} account={address} pro={pro} />
          </div>

          <div className="mt-10 grid lg:grid-cols-3 gap-4">
            <Panel title="Safety rules" desc="Built into the contract. The website cannot change them.">
              <div className="space-y-5">
                <Meter label="Used for protection" value={locked} max={working} sub={`${usd(working)} can back protection`} />
                <ul className="space-y-2 text-sm text-ink2">
                  <li>{shareWord(p.reserveBps)} of the money is always kept in reserve</li>
                  <li>At most {fmtPct(Number(p.symbolCapBps || 0) / 1e4, 0)} on any one stock</li>
                  <li>At most {fmtPct(Number(p.marketCapBps || 0) / 1e4, 0)} on any one country</li>
                </ul>
              </div>
            </Panel>
            <Panel title="Fees vs payouts" desc="What came in, what went out.">
              <div>
                <Row k="Fees collected" v={usd(prem)} />
                <Row k="Paid out in crashes" v={usd(paid)} />
                <Row k="Share paid back" v={prem > 0 ? fmtPct(paid / prem, 1) : "—"} strong />
                <Row k="Protections sold" v={fmtNum(count)} />
                <Row k="Ended" v={`${settled.length} (${settled.filter((x) => Number(x.payout) > 0).length} paid out)`} />
              </div>
              <p className="text-xs text-muted mt-3">In tests from 2005 to 2026, about 60 cents of every $1 in fees was paid back. The pool kept the rest.</p>
            </Panel>
            <Panel title="Government bonds" desc="Where spare money waits and keeps earning.">
              <div>
                <Row k="Rate" v={s.tbill.apyBps !== undefined ? `${fmtPct(Number(s.tbill.apyBps) / 1e4, 2)} a year` : "—"} strong />
                <Row k="Value" v={usd(fromUnits(s.tbill.totalAssets))} />
                <Row k="Reserve checked by the issuer" v={usd(fromUnits(s.tbill.attestedReserve))} />
              </div>
            </Panel>
          </div>

          <div className="mt-16">
            <SectionHead eyebrow="Protection" title="Protection sold, by stock">Open protection, and the money set aside for each stock.</SectionHead>
            {bySymbol.length === 0 ? (
              <Placeholder title="No protection sold right now">Stocks show up here as soon as someone protects one.</Placeholder>
            ) : (
              <div className="card overflow-x-auto">
                <table className="table-x">
                  <thead><tr><th>Stock</th><th>Protections</th><th>Amount protected</th><th>Set aside</th><th>Fees paid</th><th>Share of the pool</th></tr></thead>
                  <tbody>
                    {bySymbol.map((r) => (
                      <tr key={r.symbol}>
                        <td className="font-mono text-xs">{nameOf(r.symbol)}</td>
                        <td>{r.n}</td>
                        <td>{usd(r.notional)}</td>
                        <td>{usd(r.maxPayout)}</td>
                        <td>{usd(r.premium)}</td>
                        <td>{working > 0 ? fmtPct(r.maxPayout / working, 1) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DeployGate>
      </Section>

      <HowItWorks title="Three steps" steps={STEPS} />

      <Faq items={FAQ} />

      {deployed && (
        <Section className="mb-8">
          <More label="Details">
            <div className="card p-5 text-sm max-w-xl">
              <Row k="Pool contract" v={<AddrLink address={addr(chainId, "UnderwritingPool")} chainId={chainId} />} />
              <Row k="Government bond fund contract" v={<AddrLink address={addr(chainId, "TBillVault")} chainId={chainId} />} />
              <Row k="Pool cash / in government bonds" v={`${usd(fromUnits(p.cash))} / ${usd(fromUnits(p.tbillAssets))}`} />
              <Row k="Price of 1 bond fund share" v={nav ? fmtNum(nav, 6) : "—"} />
              <Row k="Paid in" v={stable} />
            </div>
          </More>
        </Section>
      )}
    </>
  );
}
