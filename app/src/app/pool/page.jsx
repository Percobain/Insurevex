"use client";
import { useMemo } from "react";
import { addr, stableSymbol } from "@/lib/contracts";
import { usePoolState } from "@/lib/usePoolState";
import { useSymbolNames } from "@/lib/useSymbolNames";
import { usePolicies } from "@/components/MyPolicies";
import { fmtMoney, fmtNum, fmtPct, fromUnits } from "@/lib/format";
import { PageHead, Section, Stat, Row, useActiveChain, DeployGate, AddrLink, Placeholder } from "@/components/ui";
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
      <PageHead eyebrow="Underwriting pool" title="Every policy is paid for before it is sold.">
        The pool is the savers' sleeves. A reserve never backs policies, no stock can use more than its cap, and the maximum payout of
        every open policy is locked until it settles. Idle cash sits in tokenised T-bills.
      </PageHead>
      <Section>
        <DeployGate chainId={chainId}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Pool assets" value={s.ok ? fmtMoney(total, { sym: "" }) : "—"} sub={pro.available ? `Savers ${fmtMoney(senior, { sym: "" })} · Pro ${fmtMoney(junior, { sym: "" })}` : stable} />
            <Stat label="Locked collateral" value={s.ok ? fmtMoney(locked, { sym: "" }) : "—"} sub="max payout of open cover" />
            <Stat label="Capacity left" value={s.ok ? fmtMoney(fromUnits(p.capacity), { sym: "" }) : "—"} sub="max payout the pool can still sell" />
            <Stat label="Saver unit price" value={s.ok && p.sharePrice ? fmtNum(fromUnits(p.sharePrice), 4) : "—"} sub="vxUW per share, starts at 1.0000" />
          </div>
          <div className="grid lg:grid-cols-3 gap-4 mt-4">
            <div className="card p-5 sm:p-6 space-y-5">
              <h3 className="font-semibold">Risk limits (on-chain)</h3>
              <Meter label="Utilisation of working capital" value={locked} max={working} sub={`${fmtMoney(working, { sym: "" })} working capital = ${pro.available ? "Pro + " : ""}sleeves × (1 − reserve)`} />
              <Row k="Reserve R (never backs policies)" v={fmtPct(Number(p.reserveBps || 0) / 1e4, 0)} />
              <Row k="Per-stock cap m" v={fmtPct(Number(p.symbolCapBps || 0) / 1e4, 0)} />
              <Row k="Per-market cap" v={fmtPct(Number(p.marketCapBps || 0) / 1e4, 0)} />
              <Row k="Cash / T-bills" v={`${fmtMoney(fromUnits(p.cash), { sym: "" })} / ${fmtMoney(fromUnits(p.tbillAssets), { sym: "" })}`} />
              <div className="text-xs text-muted">Pool <AddrLink address={addr(chainId, "UnderwritingPool")} chainId={chainId} /></div>
            </div>
            <div className="card p-5 sm:p-6">
              <h3 className="font-semibold">Underwriting result</h3>
              <div className="mt-4">
                <Row k="Premiums earned" v={`${fmtMoney(prem, { sym: "" })} ${stable}`} />
                <Row k="Claims paid" v={`${fmtMoney(paid, { sym: "" })} ${stable}`} />
                <Row k="Loss ratio" v={prem > 0 ? fmtPct(paid / prem, 1) : "—"} strong />
                <Row k="Policies written" v={fmtNum(count)} />
                <Row k="Settled / paid out" v={`${settled.length} / ${settled.filter((x) => Number(x.payout) > 0).length}`} />
              </div>
              <p className="text-xs text-muted mt-3">The backtest's long-run loss ratio is about 0.57–0.61: savers keep roughly 40 cents of every premium dollar.</p>
            </div>
            <div className="card p-5 sm:p-6">
              <h3 className="font-semibold">Tokenised T-bill (vxTBILL)</h3>
              <div className="mt-4">
                <Row k="NAV per share" v={nav ? fmtNum(nav, 6) : "—"} strong />
                <Row k="Fund yield" v={s.tbill.apyBps !== undefined ? fmtPct(Number(s.tbill.apyBps) / 1e4, 2) : "—"} />
                <Row k="Fund assets" v={fmtMoney(fromUnits(s.tbill.totalAssets), { sym: "" })} />
                <Row k="Attested reserve" v={fmtMoney(fromUnits(s.tbill.attestedReserve), { sym: "" })} />
              </div>
              <div className="text-xs text-muted mt-3">Vault <AddrLink address={addr(chainId, "TBillVault")} chainId={chainId} /></div>
            </div>
          </div>
          <div className="mt-8"><ProPanel chainId={chainId} account={address} pro={pro} /></div>
          <div className="mt-8">
            <h3 className="font-display text-3xl tracking-tight">Open cover by stock</h3>
            <div className="mt-4">
              {bySymbol.length === 0 ? (
                <Placeholder title="No open cover right now">Policies appear here as soon as they are bought.</Placeholder>
              ) : (
                <div className="card overflow-x-auto">
                  <table className="table-x">
                    <thead><tr><th>Stock</th><th>Policies</th><th>Protected</th><th>Max payout locked</th><th>Premiums</th><th>Share of working capital</th></tr></thead>
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
    </>
  );
}
