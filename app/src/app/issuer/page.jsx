"use client";
import { useEffect, useMemo, useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { isAddress } from "viem";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { ABI, DEFAULT_ADMIN_ROLE, PRO_ABI, addr, notesOf } from "@/lib/contracts";
import { useApi } from "@/lib/api";
import { useTx } from "@/lib/useTx";
import { usePoolState } from "@/lib/usePoolState";
import { useSymbolNames } from "@/lib/useSymbolNames";
import { usePolicies } from "@/components/MyPolicies";
import { fmtDate, fmtPct, roleId, symbolId, shortAddr, toUnits } from "@/lib/format";
import { PageHead, Section, SectionHead, Notice, useActiveChain, DeployGate, HowItWorks } from "@/components/ui";
import { COUNTRIES } from "@/components/KycModal";

function Panel({ title, role, allowed, children, sub }) {
  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{title}</h3>
          {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
        </div>
        <span className={`chip shrink-0 ${allowed ? "text-good border-good/40" : ""}`}>{role}{allowed ? "" : " · locked"}</span>
      </div>
      <fieldset disabled={!allowed} className="mt-4 space-y-3 disabled:opacity-50">{children}</fieldset>
    </div>
  );
}

const DUTIES = [
  { icon: "user", title: "Check people", body: "Approve ID checks, freeze a wallet or block a country.", stat: "Only verified wallets take part" },
  { icon: "chart", title: "Post closing prices", body: "Post each stock's closing price on the end date, then pay out.", stat: "Decides every payout" },
  { icon: "sliders", title: "Run the money", body: "Pay savers' earnings, update government bonds, set safety rules.", stat: "Within fixed limits" },
];

const Field = ({ label, children }) => <label className="block space-y-1.5"><span className="label">{label}</span>{children}</label>;

export default function IssuerPage() {
  const { chainId, address, isConnected, deployed } = useActiveChain();
  const { run, busy } = useTx();
  const { openConnectModal } = useConnectModal();
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
    run(`Approve ID for ${shortAddr(a)}`, { address: reg, abi: ABI.IdentityRegistry, functionName: "setIdentity", args: [a, true, Number(country), BigInt(Math.floor(Date.now() / 1000) + Number(kDays) * 86400)] });

  // notes
  const [noteIdx, setNoteIdx] = useState(0);
  const note = notes[noteIdx];
  const notePaused = useReadContract({ address: note?.address, abi: ABI.ProtectedNote, functionName: "paused", query: { enabled: Boolean(note) } });
  const [ftFrom, setFtFrom] = useState("");
  const [ftTo, setFtTo] = useState("");
  const [ftAmt, setFtAmt] = useState("10");

  // oracle
  const s = usePoolState(chainId);
  // risk form starts from what is on-chain now, so saving without edits changes nothing
  const riskKey = `${chainId}:${s.pool?.reserveBps}:${s.pool?.symbolCapBps}:${s.pool?.marketCapBps}:${s.pro?.proFeeBps}`;
  useEffect(() => {
    const pct = (v) => (v === undefined || v === null ? null : String(Number(v) / 100));
    if (pct(s.pool?.reserveBps) !== null) setRR(pct(s.pool.reserveBps));
    if (pct(s.pool?.symbolCapBps) !== null) setRM(pct(s.pool.symbolCapBps));
    if (pct(s.pool?.marketCapBps) !== null) setRK(pct(s.pool.marketCapBps));
    if (pct(s.pro?.proFeeBps) !== null) setRF(pct(s.pro.proFeeBps));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riskKey]);
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

  if (!isConnected) return (
    <>
      <PageHead eyebrow="Operator console" title="The controls behind InsureVEX">
        For the operator only. Each button works only if your wallet has the matching permission.
      </PageHead>
      <HowItWorks eyebrow="What the operator does" title="Three jobs" steps={DUTIES} />
      <Section className="mt-10 mb-8">
        <div className="card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div><div className="font-semibold">Connect the operator wallet</div><p className="text-sm text-ink2 mt-1">Panels unlock for the permissions your wallet has. Everyone else can look but not change anything.</p></div>
          <button className="btn-primary shrink-0" onClick={openConnectModal}>Connect wallet</button>
        </div>
      </Section>
    </>
  );

  return (
    <>
      <PageHead eyebrow="Operator console" title="The controls behind InsureVEX">
        A green tag means your wallet can use that panel. Every change is recorded in public.
      </PageHead>
      <Section>
        <DeployGate chainId={chainId}>
          {!r.some(Boolean) && roles.isSuccess && <div className="mb-4"><Notice tone="warn">This wallet has no operator permissions here. You can look, but not change anything.</Notice></div>}
          <SectionHead eyebrow="1" title="People">Who can save and buy protection.</SectionHead>
          <div className="grid lg:grid-cols-2 gap-4">
            <Panel title="ID checks" role="KYC_ROLE" allowed={isKyc} sub="People waiting to be verified. Approve to let them save and buy protection.">
              {requests.isError && <p className="text-sm text-muted">Our server is offline. Use the form next to this one.</p>}
              {reqList.length === 0 && !requests.isError && <p className="text-sm text-muted">Nobody is waiting.</p>}
              <div className="divide-y divide-line">
                {reqList.slice(0, 8).map((q) => (
                  <div key={q.address + (q.createdAt || "")} className="py-2 flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0"><div className="font-medium truncate">{q.name || "—"}</div><div className="text-xs text-muted font-mono">{shortAddr(q.address)} · {COUNTRIES.find((c) => c.code === Number(q.country))?.name || q.country}</div></div>
                    <button type="button" className="btn-primary btn-sm" disabled={Boolean(busy)} onClick={() => approve(q.address, q.country)}>Approve</button>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Check one wallet" role="KYC_ROLE" allowed={isKyc} sub="Verify, remove, freeze or unfreeze a single wallet.">
              <Field label="Wallet"><input className="input font-mono text-xs" placeholder="0x…" value={kAddr} onChange={(e) => setKAddr(e.target.value.trim())} /></Field>
              {isAddress(kAddr) && lookup.data && (
                <div className="text-xs rounded-lg bg-sunk p-3 grid grid-cols-2 gap-1">
                  <span>ID verified: {lookup.data[0] ? "yes" : "no"}</span><span>Frozen: {lookup.data[1] ? "yes" : "no"}</span>
                  <span>Country: {COUNTRIES.find((c) => c.code === Number(lookup.data[2]))?.name || String(lookup.data[2])}</span><span>Expires: {Number(lookup.data[3]) ? fmtDate(lookup.data[3]) : "—"}</span>
                  <span className="col-span-2 font-medium">Can save and buy protection now: {verifiedQ.data === undefined ? "—" : verifiedQ.data ? "yes" : "no"}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Country"><select className="input" value={kCountry} onChange={(e) => setKCountry(e.target.value)}>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></Field>
                <Field label="Valid for (days)"><input className="input" value={kDays} onChange={(e) => setKDays(e.target.value)} /></Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary btn-sm" disabled={!isAddress(kAddr) || Boolean(busy)} onClick={() => approve(kAddr, kCountry)}>Verify ID</button>
                <button type="button" className="btn-ghost btn-sm" disabled={!isAddress(kAddr) || Boolean(busy)} onClick={() => run("Remove ID", { address: reg, abi: ABI.IdentityRegistry, functionName: "setIdentity", args: [kAddr, false, Number(kCountry), 0n] })}>Remove ID</button>
                <button type="button" className="btn-ghost btn-sm text-bad" disabled={!isAddress(kAddr) || Boolean(busy)} onClick={() => run(`Freeze ${shortAddr(kAddr)}`, { address: reg, abi: ABI.IdentityRegistry, functionName: "setFrozen", args: [kAddr, true] })}>Freeze</button>
                <button type="button" className="btn-ghost btn-sm" disabled={!isAddress(kAddr) || Boolean(busy)} onClick={() => run(`Unfreeze ${shortAddr(kAddr)}`, { address: reg, abi: ABI.IdentityRegistry, functionName: "setFrozen", args: [kAddr, false] })}>Unfreeze</button>
              </div>
            </Panel>

            <Panel title="Countries" role="DEFAULT_ADMIN" allowed={isRegAdmin} sub="People in a blocked country cannot save or buy protection.">
              <div className="flex gap-2 items-end">
                <Field label="Country code (ISO number)"><input className="input w-32" value={blockCode} onChange={(e) => setBlockCode(e.target.value)} /></Field>
                <button type="button" className="btn-ghost btn-sm text-bad" disabled={Boolean(busy)} onClick={() => run(`Block country ${blockCode}`, { address: reg, abi: ABI.IdentityRegistry, functionName: "setCountryBlocked", args: [Number(blockCode), true] })}>Block</button>
                <button type="button" className="btn-ghost btn-sm" disabled={Boolean(busy)} onClick={() => run(`Unblock country ${blockCode}`, { address: reg, abi: ABI.IdentityRegistry, functionName: "setCountryBlocked", args: [Number(blockCode), false] })}>Unblock</button>
              </div>
            </Panel>

          </div>
          <div className="mt-14"><SectionHead eyebrow="2" title="Payouts">The closing price decides every payout.</SectionHead></div>
          <div className="grid lg:grid-cols-2 gap-4">
            <Panel title="Closing prices" role="REPORTER_ROLE" allowed={isReporter} sub="Protection pays out only from the closing price posted for its exact end time.">
              {awaiting.length > 0 && (
                <div className="space-y-1">
                  <div className="label">Protections waiting for a closing price</div>
                  {awaiting.slice(0, 6).map((p) => (
                    <button type="button" key={p.id} className="w-full text-left text-xs rounded-lg border border-line px-3 py-2 hover:bg-sunk"
                      onClick={() => { setOSymId(p.symbol); setOSym(nameOf(p.symbol)); setOTs(String(p.expiry)); setOPx((Number(p.startPrice) / 1e8).toFixed(2)); }}>
                      #{p.id} · <span className="font-mono">{nameOf(p.symbol)}</span> · ends {fmtDate(p.expiry)} · start price {(Number(p.startPrice) / 1e8).toFixed(2)}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid sm:grid-cols-3 gap-2">
                <Field label="Stock"><input className="input font-mono text-xs" value={oSym} onChange={(e) => { setOSym(e.target.value); setOSymId(null); }} /></Field>
                <Field label="End time (unix)"><input className="input" value={oTs} onChange={(e) => setOTs(e.target.value)} /></Field>
                <Field label="Closing price"><input className="input" value={oPx} onChange={(e) => setOPx(e.target.value)} /></Field>
              </div>
              <button type="button" className="btn-primary btn-sm" disabled={!oPx || Boolean(busy)}
                onClick={() => run(`Post closing price ${oSym}`, { address: oracle, abi: ABI.PriceOracle, functionName: "post", args: [oSymId || symbolId(oSym), BigInt(oTs), BigInt(Math.round(Number(oPx) * 1e8))] })}>
                Post closing price
              </button>
              {awaiting.length > 0 && (
                <button type="button" className="btn-ghost btn-sm ml-2" disabled={Boolean(busy)}
                  onClick={() => run("Pay out waiting protections", { address: market, abi: ABI.CoverMarket, functionName: "settleMany", args: [awaiting.map((p) => BigInt(p.id))] })}>
                  Pay out all that have a price
                </button>
              )}
            </Panel>

          </div>
          <div className="mt-14"><SectionHead eyebrow="3" title="Money and safety">Savings plans, government bonds and the pool's safety rules.</SectionHead></div>
          <div className="grid lg:grid-cols-2 gap-4">
            <Panel title="Savings plans" role="AGENT_ROLE" allowed={note && agentOf(noteIdx)} sub="Pay out earnings, pause transfers, or move savings after a lost key or court order.">
              {notes.length > 1 && (
                <Field label="Plan"><select className="input" value={noteIdx} onChange={(e) => setNoteIdx(Number(e.target.value))}>{notes.map((n, i) => <option key={n.address} value={i}>{n.name}</option>)}</select></Field>
              )}
              <div className="flex flex-wrap gap-2">
                {notePaused.data ? (
                  <button type="button" className="btn-ghost btn-sm" disabled={Boolean(busy)} onClick={() => run("Resume transfers", { address: note.address, abi: ABI.ProtectedNote, functionName: "unpause", args: [] })}>Resume transfers</button>
                ) : (
                  <button type="button" className="btn-ghost btn-sm text-bad" disabled={Boolean(busy)} onClick={() => run("Pause transfers", { address: note.address, abi: ABI.ProtectedNote, functionName: "pause", args: [] })}>Pause transfers</button>
                )}
                <button type="button" className="btn-primary btn-sm" disabled={Boolean(busy)} onClick={() => run("Pay out earnings", { address: note.address, abi: ABI.ProtectedNote, functionName: "distributeCoupon", args: [] })}>Pay out earnings</button>
              </div>
              <div className="grid sm:grid-cols-3 gap-2">
                <input className="input font-mono text-xs" placeholder="from 0x…" value={ftFrom} onChange={(e) => setFtFrom(e.target.value.trim())} />
                <input className="input font-mono text-xs" placeholder="to 0x…" value={ftTo} onChange={(e) => setFtTo(e.target.value.trim())} />
                <input className="input" placeholder="amount" value={ftAmt} onChange={(e) => setFtAmt(e.target.value)} />
              </div>
              <button type="button" className="btn-ghost btn-sm" disabled={!isAddress(ftFrom) || !isAddress(ftTo) || Boolean(busy)}
                onClick={() => run("Move savings", { address: note.address, abi: ABI.ProtectedNote, functionName: "forcedTransfer", args: [ftFrom, ftTo, toUnits(ftAmt)] })}>
                Move savings (lost key or court order)
              </button>
            </Panel>

            <Panel title="Government bonds" role="NAV_ROLE" allowed={isNav} sub="Set what the bonds earn and record how much the custodian confirms it holds.">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Yearly rate %"><input className="input" value={apy} onChange={(e) => setApy(e.target.value)} /></Field>
                <Field label="Confirmed holdings ($)"><input className="input" placeholder={s.tbill.totalAssets ? (Number(s.tbill.totalAssets) / 1e6).toFixed(2) : ""} value={reserve} onChange={(e) => setReserve(e.target.value)} /></Field>
              </div>
              <button type="button" className="btn-primary btn-sm" disabled={Boolean(busy)}
                onClick={() => run("Update government bonds", { address: tbill, abi: ABI.TBillVault, functionName: "updateNav", args: [Math.round(Number(apy) * 100), toUnits(reserve || (Number(s.tbill.totalAssets || 0) / 1e6).toFixed(6))] })}>
                Update bonds
              </button>
            </Panel>

            <Panel title="Safety rules" role="DEFAULT_ADMIN" allowed={isPoolAdmin} sub={`Now: reserve ${fmtPct(Number(s.pool.reserveBps || 0) / 1e4, 0)}, max ${fmtPct(Number(s.pool.symbolCapBps || 0) / 1e4, 0)} per stock, max ${fmtPct(Number(s.pool.marketCapBps || 0) / 1e4, 0)} per market. Allowed: reserve 20–90%, per stock up to 25%, per market at least the per-stock max.`}>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Reserve %"><input className="input" value={rR} onChange={(e) => setRR(e.target.value)} /></Field>
                <Field label="Max per stock %"><input className="input" value={rM} onChange={(e) => setRM(e.target.value)} /></Field>
                <Field label="Max per market %"><input className="input" value={rK} onChange={(e) => setRK(e.target.value)} /></Field>
                <Field label="Pro share of fees %"><input className="input" value={rF} onChange={(e) => setRF(e.target.value)} /></Field>
              </div>
              <button type="button" className="btn-primary btn-sm" disabled={Boolean(busy)}
                onClick={() => run("Save safety rules", { address: pool, abi: PRO_ABI, functionName: "setRiskParams", args: [Math.round(Number(rR) * 100), Math.round(Number(rM) * 100), Math.round(Number(rK) * 100), Math.round(Number(rF) * 100)] })}>
                Save safety rules
              </button>
            </Panel>
          </div>
        </DeployGate>
      </Section>
    </>
  );
}
