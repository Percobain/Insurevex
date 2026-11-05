"use client";
import { useMemo, useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { isAddress } from "viem";
import { ABI, DEFAULT_ADMIN_ROLE, PRO_ABI, addr, notesOf } from "@/lib/contracts";
import { useApi } from "@/lib/api";
import { useTx } from "@/lib/useTx";
import { usePoolState } from "@/lib/usePoolState";
import { useSymbolNames } from "@/lib/useSymbolNames";
import { usePolicies } from "@/components/MyPolicies";
import { fmtDate, fmtPct, roleId, symbolId, shortAddr, toUnits } from "@/lib/format";
import { PageHead, Section, Notice, useActiveChain, DeployGate, Placeholder } from "@/components/ui";
import { COUNTRIES } from "@/components/KycModal";

function Panel({ title, role, allowed, children, sub }) {
  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{title}</h3>
          {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
        </div>
        <span className={`chip shrink-0 ${allowed ? "text-good border-good/40" : ""}`}>{role}{allowed ? "" : " · not held"}</span>
      </div>
      <fieldset disabled={!allowed} className="mt-4 space-y-3 disabled:opacity-50">{children}</fieldset>
    </div>
  );
}

const Field = ({ label, children }) => <label className="block space-y-1.5"><span className="label">{label}</span>{children}</label>;

export default function IssuerPage() {
  const { chainId, address, isConnected, deployed } = useActiveChain();
  const { run, busy } = useTx();
  const reg = addr(chainId, "IdentityRegistry");
  const oracle = addr(chainId, "PriceOracle");
  const tbill = addr(chainId, "TBillVault");
  const pool = addr(chainId, "UnderwritingPool");
  const market = addr(chainId, "CoverMarket");
  const notes = notesOf(chainId);
  const nameOf = useSymbolNames();

  const roles = useReadContracts({
    contracts: [
      { address: reg, abi: ABI.IdentityRegistry, functionName: "hasRole", args: [roleId("KYC_ROLE"), address] },
      { address: reg, abi: ABI.IdentityRegistry, functionName: "hasRole", args: [DEFAULT_ADMIN_ROLE, address] },
      { address: oracle, abi: ABI.PriceOracle, functionName: "hasRole", args: [roleId("REPORTER_ROLE"), address] },
      { address: tbill, abi: ABI.TBillVault, functionName: "hasRole", args: [roleId("NAV_ROLE"), address] },
      { address: pool, abi: ABI.UnderwritingPool, functionName: "hasRole", args: [DEFAULT_ADMIN_ROLE, address] },
      ...notes.map((n) => ({ address: n.address, abi: ABI.ProtectedNote, functionName: "hasRole", args: [roleId("AGENT_ROLE"), address] })),
    ],
    query: { enabled: Boolean(address && deployed) },
  });
  const r = (roles.data || []).map((x) => x.status === "success" && x.result === true);
  const [isKyc, isRegAdmin, isReporter, isNav, isPoolAdmin] = r;
  const agentOf = (i) => r[5 + i];

  // KYC
  const requests = useApi("/api/kyc/requests", { refetchInterval: 15_000 });
  const reqList = requests.data?.requests || (Array.isArray(requests.data) ? requests.data : []);
  const [kAddr, setKAddr] = useState("");
  const [kCountry, setKCountry] = useState(356);
  const [kDays, setKDays] = useState(365);
  const lookup = useReadContract({ address: reg, abi: ABI.IdentityRegistry, functionName: "identities", args: [kAddr], query: { enabled: isAddress(kAddr) } });
  const verifiedQ = useReadContract({ address: reg, abi: ABI.IdentityRegistry, functionName: "isVerified", args: [kAddr], query: { enabled: isAddress(kAddr) } });
  const [blockCode, setBlockCode] = useState(408);
  const approve = (a, country) =>
    run(`KYC approve ${shortAddr(a)}`, { address: reg, abi: ABI.IdentityRegistry, functionName: "setIdentity", args: [a, true, Number(country), BigInt(Math.floor(Date.now() / 1000) + Number(kDays) * 86400)] });

  // notes
  const [noteIdx, setNoteIdx] = useState(0);
  const note = notes[noteIdx];
  const notePaused = useReadContract({ address: note?.address, abi: ABI.ProtectedNote, functionName: "paused", query: { enabled: Boolean(note) } });
  const [ftFrom, setFtFrom] = useState("");
  const [ftTo, setFtTo] = useState("");
  const [ftAmt, setFtAmt] = useState("10");

  // oracle
  const s = usePoolState(chainId);
  const count = Number(s.policyCount || 0);
  const ids = useMemo(() => Array.from({ length: Math.min(count, 60) }, (_, i) => BigInt(count - 1 - i)), [count]);
  const policies = usePolicies(ids, chainId);
  const now = Math.floor(Date.now() / 1000);
  const awaiting = policies.filter((p) => Number(p.status) === 1 && Number(p.expiry) <= now);
  const [oSym, setOSym] = useState("NASDAQ:NVDA");
  const [oSymId, setOSymId] = useState(null);
  const [oTs, setOTs] = useState(String(now));
  const [oPx, setOPx] = useState("");

  // nav + risk
  const [apy, setApy] = useState("4.20");
  const [reserve, setReserve] = useState("");
  const [rR, setRR] = useState("50");
  const [rM, setRM] = useState("5");
  const [rK, setRK] = useState("25");
  const [rF, setRF] = useState("40");

  if (!isConnected) return (<><PageHead eyebrow="Issuer console" title="Compliance and lifecycle controls." /><Section><Placeholder title="Connect the issuer wallet">Every control is an on-chain call gated by a role. The page enables the panels for the roles your wallet holds.</Placeholder></Section></>);

  return (
    <>
      <PageHead eyebrow="Issuer console" title="Compliance and lifecycle controls.">
        Everything here is a contract call gated by an on-chain role: identity verification, freezes, jurisdiction blocks, pauses,
        forced transfers, official closes, T-bill NAV and reserve attestations, coupons and pool risk limits.
      </PageHead>
      <Section>
        <DeployGate chainId={chainId}>
          {!r.some(Boolean) && roles.isSuccess && <div className="mb-4"><Notice tone="warn">This wallet holds no issuer roles on this chain. Panels are read-only.</Notice></div>}
          <div className="grid lg:grid-cols-2 gap-4">
            <Panel title="Pending KYC requests" role="KYC_ROLE" allowed={isKyc} sub="From the request form. Approval writes to the IdentityRegistry.">
              {requests.isError && <p className="text-sm text-muted">Server offline: use the manual form.</p>}
              {reqList.length === 0 && !requests.isError && <p className="text-sm text-muted">No pending requests.</p>}
              <div className="divide-y divide-line">
                {reqList.slice(0, 8).map((q) => (
                  <div key={q.address + (q.createdAt || "")} className="py-2 flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0"><div className="font-medium truncate">{q.name || "—"}</div><div className="text-xs text-muted font-mono">{shortAddr(q.address)} · {COUNTRIES.find((c) => c.code === Number(q.country))?.name || q.country}</div></div>
                    <button type="button" className="btn-primary btn-sm" disabled={Boolean(busy)} onClick={() => approve(q.address, q.country)}>Approve</button>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Identity registry" role="KYC_ROLE" allowed={isKyc}>
              <Field label="Wallet"><input className="input font-mono text-xs" placeholder="0x…" value={kAddr} onChange={(e) => setKAddr(e.target.value.trim())} /></Field>
              {isAddress(kAddr) && lookup.data && (
                <div className="text-xs rounded-lg bg-sunk p-3 grid grid-cols-2 gap-1">
                  <span>Verified flag: {String(lookup.data[0])}</span><span>Frozen: {String(lookup.data[1])}</span>
                  <span>Country: {String(lookup.data[2])}</span><span>Expiry: {Number(lookup.data[3]) ? fmtDate(lookup.data[3]) : "—"}</span>
                  <span className="col-span-2 font-medium">Can hold restricted assets now: {String(verifiedQ.data)}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Country"><select className="input" value={kCountry} onChange={(e) => setKCountry(e.target.value)}>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></Field>
                <Field label="Valid (days)"><input className="input" value={kDays} onChange={(e) => setKDays(e.target.value)} /></Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary btn-sm" disabled={!isAddress(kAddr) || Boolean(busy)} onClick={() => approve(kAddr, kCountry)}>Verify</button>
                <button type="button" className="btn-ghost btn-sm" disabled={!isAddress(kAddr) || Boolean(busy)} onClick={() => run("Revoke KYC", { address: reg, abi: ABI.IdentityRegistry, functionName: "setIdentity", args: [kAddr, false, Number(kCountry), 0n] })}>Revoke</button>
                <button type="button" className="btn-ghost btn-sm text-bad" disabled={!isAddress(kAddr) || Boolean(busy)} onClick={() => run(`Freeze ${shortAddr(kAddr)}`, { address: reg, abi: ABI.IdentityRegistry, functionName: "setFrozen", args: [kAddr, true] })}>Freeze</button>
                <button type="button" className="btn-ghost btn-sm" disabled={!isAddress(kAddr) || Boolean(busy)} onClick={() => run(`Unfreeze ${shortAddr(kAddr)}`, { address: reg, abi: ABI.IdentityRegistry, functionName: "setFrozen", args: [kAddr, false] })}>Unfreeze</button>
              </div>
            </Panel>

            <Panel title="Jurisdictions" role="DEFAULT_ADMIN" allowed={isRegAdmin} sub="Blocked countries fail every KYC check, so their holders cannot receive notes or buy cover.">
              <div className="flex gap-2 items-end">
                <Field label="ISO country code"><input className="input w-32" value={blockCode} onChange={(e) => setBlockCode(e.target.value)} /></Field>
                <button type="button" className="btn-ghost btn-sm text-bad" disabled={Boolean(busy)} onClick={() => run(`Block country ${blockCode}`, { address: reg, abi: ABI.IdentityRegistry, functionName: "setCountryBlocked", args: [Number(blockCode), true] })}>Block</button>
                <button type="button" className="btn-ghost btn-sm" disabled={Boolean(busy)} onClick={() => run(`Unblock country ${blockCode}`, { address: reg, abi: ABI.IdentityRegistry, functionName: "setCountryBlocked", args: [Number(blockCode), false] })}>Unblock</button>
              </div>
            </Panel>

            <Panel title="Note lifecycle" role="AGENT_ROLE" allowed={note && agentOf(noteIdx)}>
              {notes.length > 1 && (
                <Field label="Series"><select className="input" value={noteIdx} onChange={(e) => setNoteIdx(Number(e.target.value))}>{notes.map((n, i) => <option key={n.address} value={i}>{n.name}</option>)}</select></Field>
              )}
              <div className="flex flex-wrap gap-2">
                {notePaused.data ? (
                  <button type="button" className="btn-ghost btn-sm" disabled={Boolean(busy)} onClick={() => run("Unpause note", { address: note.address, abi: ABI.ProtectedNote, functionName: "unpause", args: [] })}>Unpause</button>
                ) : (
                  <button type="button" className="btn-ghost btn-sm text-bad" disabled={Boolean(busy)} onClick={() => run("Pause note", { address: note.address, abi: ABI.ProtectedNote, functionName: "pause", args: [] })}>Pause transfers</button>
                )}
                <button type="button" className="btn-primary btn-sm" disabled={Boolean(busy)} onClick={() => run("Distribute coupon", { address: note.address, abi: ABI.ProtectedNote, functionName: "distributeCoupon", args: [] })}>Distribute coupon</button>
              </div>
              <div className="grid sm:grid-cols-3 gap-2">
                <input className="input font-mono text-xs" placeholder="from 0x…" value={ftFrom} onChange={(e) => setFtFrom(e.target.value.trim())} />
                <input className="input font-mono text-xs" placeholder="to 0x…" value={ftTo} onChange={(e) => setFtTo(e.target.value.trim())} />
                <input className="input" placeholder="amount" value={ftAmt} onChange={(e) => setFtAmt(e.target.value)} />
              </div>
              <button type="button" className="btn-ghost btn-sm" disabled={!isAddress(ftFrom) || !isAddress(ftTo) || Boolean(busy)}
                onClick={() => run("Forced transfer", { address: note.address, abi: ABI.ProtectedNote, functionName: "forcedTransfer", args: [ftFrom, ftTo, toUnits(ftAmt)] })}>
                Forced transfer (lost key / court order)
              </button>
            </Panel>

            <Panel title="Official closes" role="REPORTER_ROLE" allowed={isReporter} sub="Policies settle only from a posted close at their exact expiry timestamp.">
              {awaiting.length > 0 && (
                <div className="space-y-1">
                  <div className="label">Policies awaiting a close</div>
                  {awaiting.slice(0, 6).map((p) => (
                    <button type="button" key={p.id} className="w-full text-left text-xs rounded-lg border border-line px-3 py-2 hover:bg-sunk"
                      onClick={() => { setOSymId(p.symbol); setOSym(nameOf(p.symbol)); setOTs(String(p.expiry)); setOPx((Number(p.startPrice) / 1e8).toFixed(2)); }}>
                      #{p.id} · <span className="font-mono">{nameOf(p.symbol)}</span> · expiry {fmtDate(p.expiry)} · start {(Number(p.startPrice) / 1e8).toFixed(2)}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid sm:grid-cols-3 gap-2">
                <Field label="Symbol"><input className="input font-mono text-xs" value={oSym} onChange={(e) => { setOSym(e.target.value); setOSymId(null); }} /></Field>
                <Field label="Timestamp"><input className="input" value={oTs} onChange={(e) => setOTs(e.target.value)} /></Field>
                <Field label="Close"><input className="input" value={oPx} onChange={(e) => setOPx(e.target.value)} /></Field>
              </div>
              <button type="button" className="btn-primary btn-sm" disabled={!oPx || Boolean(busy)}
                onClick={() => run(`Post close ${oSym}`, { address: oracle, abi: ABI.PriceOracle, functionName: "post", args: [oSymId || symbolId(oSym), BigInt(oTs), BigInt(Math.round(Number(oPx) * 1e8))] })}>
                Post close
              </button>
              {awaiting.length > 0 && (
                <button type="button" className="btn-ghost btn-sm ml-2" disabled={Boolean(busy)}
                  onClick={() => run("Settle expired policies", { address: market, abi: ABI.CoverMarket, functionName: "settleMany", args: [awaiting.map((p) => BigInt(p.id))] })}>
                  Settle all with a close
                </button>
              )}
            </Panel>

            <Panel title="T-bill NAV and reserve" role="NAV_ROLE" allowed={isNav} sub="Rolls accrued NAV, sets the fund yield and records the custodian's attested T-bill holdings.">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Fund yield %"><input className="input" value={apy} onChange={(e) => setApy(e.target.value)} /></Field>
                <Field label="Attested reserve"><input className="input" placeholder={s.tbill.totalAssets ? (Number(s.tbill.totalAssets) / 1e6).toFixed(2) : ""} value={reserve} onChange={(e) => setReserve(e.target.value)} /></Field>
              </div>
              <button type="button" className="btn-primary btn-sm" disabled={Boolean(busy)}
                onClick={() => run("Update T-bill NAV", { address: tbill, abi: ABI.TBillVault, functionName: "updateNav", args: [Math.round(Number(apy) * 100), toUnits(reserve || (Number(s.tbill.totalAssets || 0) / 1e6).toFixed(6))] })}>
                Update NAV
              </button>
            </Panel>

            <Panel title="Pool risk limits" role="DEFAULT_ADMIN" allowed={isPoolAdmin} sub={`Current: reserve ${fmtPct(Number(s.pool.reserveBps || 0) / 1e4, 0)}, per-stock cap ${fmtPct(Number(s.pool.symbolCapBps || 0) / 1e4, 0)}, per-market cap ${fmtPct(Number(s.pool.marketCapBps || 0) / 1e4, 0)}. Contract bounds: reserve 20–90%, per-stock cap ≤ 25%, per-market cap ≥ per-stock cap.`}>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Reserve R %"><input className="input" value={rR} onChange={(e) => setRR(e.target.value)} /></Field>
                <Field label="Per-stock cap m %"><input className="input" value={rM} onChange={(e) => setRM(e.target.value)} /></Field>
                <Field label="Per-market cap %"><input className="input" value={rK} onChange={(e) => setRK(e.target.value)} /></Field>
                <Field label="Pro fee %"><input className="input" value={rF} onChange={(e) => setRF(e.target.value)} /></Field>
              </div>
              <button type="button" className="btn-primary btn-sm" disabled={Boolean(busy)}
                onClick={() => run("Set risk limits", { address: pool, abi: PRO_ABI, functionName: "setRiskParams", args: [Math.round(Number(rR) * 100), Math.round(Number(rM) * 100), Math.round(Number(rK) * 100), Math.round(Number(rF) * 100)] })}>
                Apply
              </button>
            </Panel>
          </div>
        </DeployGate>
      </Section>
    </>
  );
}
