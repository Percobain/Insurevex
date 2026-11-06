"use client";
import { useEffect, useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { ABI, ERC20_ABI, addr, notesOf, stableSymbol } from "@/lib/contracts";
import { fmtDate, fmtDuration, fmtMoney, fmtPct, fromUnits, toUnits } from "@/lib/format";
import { useTx } from "@/lib/useTx";
import { PageHead, Section, SectionHead, Notice, Row, useActiveChain, DeployGate, AddrLink, Placeholder } from "@/components/ui";
import { SaverArt } from "@/components/IsoArt";
import { useKyc } from "@/components/KycBadge";
import SaverCalculator from "@/components/SaverCalculator";

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => { const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

const NOTE_READS = ["name", "symbol", "snapshot", "couponInterval", "lastCoupon", "couponAvailable", "paused", "issueDate"];
const USER_READS = ["balanceOf", "pendingCoupon", "claimableAtMaturity", "maturityClaimed"];

function NoteCard({ note, chainId, account, kycOk }) {
  const now = useNow();
  const stable = stableSymbol(chainId);
  const stableAddr = addr(chainId, "stable");
  const { run, busy } = useTx();
  const [amount, setAmount] = useState("1");
  const reads = useReadContracts({
    contracts: [
      ...NOTE_READS.map((fn) => ({ address: note.address, abi: ABI.ProtectedNote, functionName: fn, chainId })),
      { address: note.address, abi: ABI.ProtectedNote, functionName: "floorFor", args: [1_000_000_000n], chainId },
      ...USER_READS.map((fn) => ({ address: note.address, abi: ABI.ProtectedNote, functionName: fn, args: [account], chainId })),
    ],
    query: { refetchInterval: 15_000 },
  });
  const r = (reads.data || []).map((x) => (x.status === "success" ? x.result : undefined));
  const [name, symbol, snap, couponInterval, lastCoupon, couponAvailable, paused] = r;
  const floor1000 = r[NOTE_READS.length];
  const [bal, pending, claimable, redeemed] = account ? r.slice(NOTE_READS.length + 1) : [];
  const allowance = useReadContract({ address: stableAddr, abi: ERC20_ABI, functionName: "allowance", args: [account, note.address], query: { enabled: Boolean(account && stableAddr) } });
  const wallet = useReadContract({ address: stableAddr, abi: ERC20_ABI, functionName: "balanceOf", args: [account], query: { enabled: Boolean(account && stableAddr), refetchInterval: 15_000 } });

  if (!snap) return <div className="card h-80 animate-pulse" />;
  const [supply, floorVal, sleeveVal, sleevePrin, couponsPaid, maturity, subEnd, rateBps, matured] = snap;
  const subOpen = now <= Number(subEnd);
  const isMature = now >= Number(maturity);
  const floorShare = floor1000 !== undefined ? fromUnits(floor1000) / 1000 : 0;
  const couponDue = now >= Number(lastCoupon || 0) + Number(couponInterval || 0);
  const units = toUnits(amount);
  const sleevePnL = fromUnits(sleeveVal) - fromUnits(sleevePrin);
  const walletUnits = wallet.data;
  const overBalance = walletUnits !== undefined && units > walletUnits;
  const hasRedeemed = Boolean(matured && redeemed && redeemed > 0n && (!claimable || claimable === 0n));

  async function subscribe() {
    if ((allowance.data || 0n) < units) {
      const ok = await run(`Approve ${stable}`, { address: stableAddr, abi: ERC20_ABI, functionName: "approve", args: [note.address, units] });
      if (!ok) return;
      await allowance.refetch();
    }
    await run(`Subscribe ${amount} ${stable} to ${symbol}`, { address: note.address, abi: ABI.ProtectedNote, functionName: "subscribe", args: [units] });
  }

  return (
    <div className="card p-5 sm:p-6 flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-muted font-mono">{symbol}</div>
          <h3 className="text-lg font-semibold mt-0.5 truncate">{name}</h3>
        </div>
        <span className={`chip shrink-0 ${matured ? "" : paused ? "text-bad border-bad/40" : subOpen ? "text-good border-good/40" : "text-accent border-accent/40"}`}>
          {matured ? "Matured" : paused ? "Paused" : isMature ? "At maturity" : subOpen ? "Subscribing" : "Running"}
        </span>
      </div>

      <div className="mt-5">
        <div className="flex justify-between text-xs text-muted"><span>Floor (T-bills) {fmtPct(floorShare, 1)}</span><span>Sleeve (underwriting) {fmtPct(1 - floorShare, 1)}</span></div>
        <div className="mt-1.5 h-3 rounded-full overflow-hidden bg-sunk flex">
          <div className="bg-ink2/40" style={{ width: `${floorShare * 100}%` }} />
          <div className="bg-accent" style={{ width: `${(1 - floorShare) * 100}%` }} />
        </div>
      </div>

      <div className="mt-4">
        <Row k="Locked floor rate" v={fmtPct(Number(rateBps) / 1e4, 2)} />
        <Row k="Maturity" v={`${fmtDate(maturity)}${isMature ? "" : ` · in ${fmtDuration(Number(maturity) - now)}`}`} />
        <Row k="Notes outstanding" v={`${fmtMoney(fromUnits(supply), { sym: "" })} ${stable}`} />
        <Row k="T-bill floor value" v={`${fmtMoney(fromUnits(floorVal), { sym: "" })}`} />
        <Row k="Sleeve value" v={<span>{fmtMoney(fromUnits(sleeveVal), { sym: "" })} <span className={sleevePnL >= 0 ? "text-good" : "text-bad"}>({sleevePnL >= 0 ? "+" : ""}{fmtMoney(sleevePnL, { sym: "" })})</span></span>} />
        <Row k="Coupons paid" v={`${fmtMoney(fromUnits(couponsPaid), { sym: "" })} ${stable}`} />
        <Row k="Next coupon" v={matured ? "—" : couponDue ? `due now · ${fmtMoney(fromUnits(couponAvailable), { sym: "" })} available` : `in ${fmtDuration(Number(lastCoupon) + Number(couponInterval) - now)}`} />
      </div>

      {account && (
        <div className="rounded-xl bg-sunk p-4 mt-4 space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-ink2">Your notes (face)</span><span className="tabular font-semibold">{fmtMoney(fromUnits(bal), { sym: "" })} {stable}</span></div>
          <div className="flex justify-between"><span className="text-ink2">Pending coupon</span><span className="tabular">{fmtMoney(fromUnits(pending), { sym: "" })}</span></div>
          {matured && !hasRedeemed && <div className="flex justify-between"><span className="text-ink2">Claimable at maturity</span><span className="tabular text-good">{fmtMoney(fromUnits(claimable), { sym: "" })}</span></div>}
          {hasRedeemed && <div className="flex justify-between"><span className="text-ink2">Redeemed at maturity</span><span className="tabular text-good">{fmtMoney(fromUnits(redeemed), { sym: "" })} {stable}{bal > 0n ? ` (${fromUnits(redeemed) >= fromUnits(bal) ? "+" : ""}${fmtMoney(fromUnits(redeemed) - fromUnits(bal), { sym: "" })} vs face)` : ""}</span></div>}
        </div>
      )}

      <div className="mt-auto pt-5 space-y-2">
        {subOpen && !matured && (
          <div className="flex gap-2">
            <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Subscription amount" />
            <button className="btn-primary shrink-0" disabled={!account || !kycOk || Boolean(busy) || units <= 0n || paused || overBalance} onClick={subscribe}>Subscribe</button>
          </div>
        )}
        {subOpen && !matured && account && walletUnits !== undefined && (
          <p className={`text-xs ${overBalance ? "text-bad" : "text-muted"}`}>
            {overBalance ? `More than your wallet holds. ` : ""}Wallet: {fmtMoney(fromUnits(walletUnits), { sym: "" })} {stable}.{" "}
            {walletUnits > 0n && <button type="button" className="underline underline-offset-2" onClick={() => setAmount(String(fromUnits(walletUnits)))}>Use all</button>}
          </p>
        )}
        {subOpen && units > 0n && floor1000 !== undefined && (
          <p className="text-xs text-muted">{fmtMoney(Number(amount) * floorShare, { sym: "" })} buys T-bills, {fmtMoney(Number(amount) * (1 - floorShare), { sym: "" })} joins the pool. Worst case at maturity: {fmtMoney(Number(amount), { sym: "" })} {stable}.</p>
        )}
        <div className="grid grid-cols-3 gap-2">
          <button className="btn-ghost btn-sm" disabled={!account || matured || !couponDue || Boolean(busy)}
            onClick={() => run("Distribute coupon", { address: note.address, abi: ABI.ProtectedNote, functionName: "distributeCoupon", args: [] })}>Pay coupon</button>
          <button className="btn-ghost btn-sm" disabled={!account || !pending || pending === 0n || Boolean(busy)}
            onClick={() => run("Claim coupon", { address: note.address, abi: ABI.ProtectedNote, functionName: "claimCoupon", args: [] })}>Claim coupon</button>
          {isMature ? (
            matured && claimable > 0n ? (
              <button className="btn-primary btn-sm" disabled={Boolean(busy)} onClick={() => run("Redeem note", { address: note.address, abi: ABI.ProtectedNote, functionName: "redeem", args: [] })}>Redeem</button>
            ) : hasRedeemed ? (
              <button className="btn-ghost btn-sm" disabled>Redeemed</button>
            ) : matured && fromUnits(sleeveVal) < 0.01 ? (
              <button className="btn-ghost btn-sm" disabled>{bal > 0n ? "Nothing to claim" : "Closed"}</button>
            ) : (
              <button className="btn-primary btn-sm" disabled={!account || Boolean(busy)} onClick={() => run("Mature note", { address: note.address, abi: ABI.ProtectedNote, functionName: "mature", args: [] })}>Mature</button>
            )
          ) : (
            <button className="btn-ghost btn-sm" disabled>Redeem at maturity</button>
          )}
        </div>
        <div className="text-xs text-muted pt-1">Contract <AddrLink address={note.address} chainId={chainId} /></div>
      </div>
    </div>
  );
}

export default function SavePage() {
  const { chainId, address, isConnected, deployed } = useActiveChain();
  const kyc = useKyc();
  const notes = notesOf(chainId);
  return (
    <>
      <PageHead
        eyebrow="For savers · type 1"
        title="Your deposit back, guaranteed."
        art={<SaverArt />}
        facts={[["$1,000", "back at maturity, from T-bills"], ["+ units", "vault units grow with every premium"], ["KYC", "only verified wallets hold notes"]]}
      >
        Each note splits your deposit in one transaction: T-bills sized to grow back to the full deposit by maturity, and a small
        remainder that buys vault units. Holders&apos; premiums raise the unit price.
      </PageHead>
      <Section>
        <SectionHead eyebrow="Live on-chain" title="Pick a note">Read straight from the contract. Subscribe with a verified wallet.</SectionHead>
        <div className="space-y-3 mb-6">
          <DeployGate chainId={chainId}>{null}</DeployGate>
          {isConnected && deployed && !kyc.verified && <Notice>Verify your identity (header) before subscribing. The note contract checks the on-chain registry on every subscription and transfer.</Notice>}
          {!isConnected && <Notice>Connect a wallet to subscribe. Note data below is read straight from the chain.</Notice>}
        </div>
        {deployed && notes.length === 0 && <Placeholder title="No note series on this chain yet" />}
        <div className="grid md:grid-cols-2 gap-4">
          {deployed && notes.map((n) => <NoteCard key={n.address} note={n} chainId={chainId} account={address} kycOk={kyc.verified} />)}
        </div>
      </Section>
      <Section className="mt-16">
        <SaverCalculator />
      </Section>
    </>
  );
}
