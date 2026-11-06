"use client";
import { useEffect, useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { ABI, ERC20_ABI, addr, notesOf, stableSymbol } from "@/lib/contracts";
import { fmtDate, fmtDuration, fmtMoney, fmtPct, fromUnits, toUnits } from "@/lib/format";
import { useTx } from "@/lib/useTx";
import { useDemo, DEMO_BALANCE } from "@/lib/demo";
import { PageHead, Section, SectionHead, Notice, Row, useActiveChain, DeployGate, AddrLink, Placeholder, HeroCtas, HowItWorks, Faq } from "@/components/ui";
import { SaverArt } from "@/components/IsoArt";
import { useKyc } from "@/components/KycBadge";
import SaverCalculator from "@/components/SaverCalculator";

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => { const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

/** "3 yrs", "11 mo", "6 days", "3h 20m": whichever reads best at a glance. */
function humanTerm(sec) {
  const d = sec / 86400;
  if (d >= 365) return `${(d / 365).toFixed(d >= 730 ? 0 : 1)} yrs`;
  if (d >= 60) return `${Math.round(d / 30)} mo`;
  if (d >= 2) return `${Math.floor(d)} days`;
  return fmtDuration(sec);
}

/** Plain plan name from its length: "3-year savings plan", "3-hour test plan". */
function planName(termSec, fallback) {
  if (!termSec || termSec <= 0) return fallback || "Savings plan";
  const d = termSec / 86400;
  if (d >= 300) return `${Math.round(d / 365)}-year savings plan`;
  if (d >= 45) return `${Math.round(d / 30)}-month savings plan`;
  if (d >= 2) return `${Math.round(d)}-day savings plan`;
  return `${Math.max(1, Math.round(termSec / 3600))}-hour test plan`;
}

/** Dollars, without cents once the amount is large. */
const usd = (x) => fmtMoney(x, { dp: Math.abs(Number(x) || 0) >= 100 ? 0 : 2 });

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
  const [name, symbol, snap, couponInterval, lastCoupon, couponAvailable, paused, issueDate] = r;
  const floor1000 = r[NOTE_READS.length];
  const [bal, pending, claimable, redeemed] = account ? r.slice(NOTE_READS.length + 1) : [];
  const allowance = useReadContract({ address: stableAddr, abi: ERC20_ABI, functionName: "allowance", args: [account, note.address], query: { enabled: Boolean(account && stableAddr) } });
  const wallet = useReadContract({ address: stableAddr, abi: ERC20_ABI, functionName: "balanceOf", args: [account], query: { enabled: Boolean(account && stableAddr), refetchInterval: 15_000 } });

  const demo = useDemo();
  useEffect(() => { if (demo) setAmount("1000"); }, [demo]);
  if (!snap) return <div className="card h-80 animate-pulse" />;
  const [supply, floorVal, sleeveVal, sleevePrin, couponsPaid, maturity, subEnd, rateBps, matured] = snap;
  const subOpen = now <= Number(subEnd);
  const isMature = now >= Number(maturity);
  const floorShare = floor1000 !== undefined ? fromUnits(floor1000) / 1000 : 0;
  const couponDue = now >= Number(lastCoupon || 0) + Number(couponInterval || 0);
  const units = toUnits(amount);
  const sleevePnL = fromUnits(sleeveVal) - fromUnits(sleevePrin);
  const walletUnits = demo ? DEMO_BALANCE : wallet.data;
  const overBalance = walletUnits !== undefined && units > walletUnits;
  const hasRedeemed = Boolean(matured && redeemed && redeemed > 0n && (!claimable || claimable === 0n));

  async function subscribe() {
    if ((allowance.data || 0n) < units) {
      const ok = await run(`Allow ${stable} spending`, { address: stableAddr, abi: ERC20_ABI, functionName: "approve", args: [note.address, units] });
      if (!ok) return;
      await allowance.refetch();
    }
    await run(`Save ${usd(Number(amount) || 0)}`, { address: note.address, abi: ABI.ProtectedNote, functionName: "subscribe", args: [units] });
  }

  const title = planName(issueDate !== undefined ? Number(maturity) - Number(issueDate) : 0, name);
  const status = matured ? "Ended" : paused ? "Paused" : isMature ? "Ready to close" : subOpen ? "Open" : "Running";
  const statusCls = matured ? "" : paused ? "text-bad border-bad/40" : subOpen ? "text-good border-good/40 bg-sage/40" : "text-accent border-accent/40";
  const amt = Number(amount) || 0;

  const saveBlocked = !account ? "Connect a wallet first."
    : !kycOk ? "Verify your ID first (top right)."
    : paused ? "This plan is paused."
    : units <= 0n ? "Enter an amount."
    : null;
  const holds = account && (bal > 0n || hasRedeemed);
  const canRedeem = Boolean(matured && claimable > 0n);
  const redeemWhy = !isMature ? `Available on ${fmtDate(maturity).split(",")[0]}, the end date.`
    : !matured ? "Close the plan first (button above)."
    : "Nothing left to pay back.";
  const payoutWhy = !account ? "Connect a wallet to pay out earnings."
    : matured ? "This plan has ended."
    : !couponDue ? `Next payout in ${fmtDuration(Number(lastCoupon) + Number(couponInterval) - now)}.`
    : null;

  return (
    <div className="card p-5 sm:p-6 flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold leading-snug break-words min-w-0">{title}</h3>
        <span className={`chip shrink-0 ${statusCls}`}>{status}</span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-sunk p-4">
          <div className="label">Government bond rate</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight tabular">{fmtPct(Number(rateBps) / 1e4, 2)}</div>
          <div className="text-xs text-muted mt-0.5">a year, locked in</div>
        </div>
        <div className="rounded-xl bg-sunk p-4">
          <div className="label">{isMature ? "Ended on" : "Ends on"}</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight tabular">{fmtDate(maturity).split(",")[0]}</div>
          {!isMature && <div className="text-xs text-muted mt-0.5">in {humanTerm(Number(maturity) - now)}</div>}
        </div>
      </div>

      {floor1000 !== undefined && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-muted"><span>Safe part {fmtPct(floorShare, 0)}</span><span>Earning part {fmtPct(1 - floorShare, 0)}</span></div>
          <div className="mt-1.5 h-2 rounded-full overflow-hidden bg-sunk flex">
            <div className="bg-ink2/40" style={{ width: `${floorShare * 100}%` }} />
            <div className="bg-accent" style={{ width: `${(1 - floorShare) * 100}%` }} />
          </div>
        </div>
      )}

      {holds && (
        <div className="rounded-xl border border-line p-4 mt-4 space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-ink2">You saved</span><span className="tabular font-semibold">{usd(fromUnits(bal))}</span></div>
          <div className="flex justify-between"><span className="text-ink2">Earnings ready to collect</span><span className="tabular">{fmtMoney(fromUnits(pending))}</span></div>
          {matured && !hasRedeemed && <div className="flex justify-between"><span className="text-ink2">Ready to pay back</span><span className="tabular text-good">{fmtMoney(fromUnits(claimable))}</span></div>}
          {hasRedeemed && <div className="flex justify-between"><span className="text-ink2">Paid back at the end</span><span className="tabular text-good">{fmtMoney(fromUnits(redeemed))}{bal > 0n ? ` (${fromUnits(redeemed) >= fromUnits(bal) ? "+" : ""}${fmtMoney(fromUnits(redeemed) - fromUnits(bal))} vs what you saved)` : ""}</span></div>}
        </div>
      )}

      <div className="mt-auto pt-5 space-y-3">
        {subOpen && !matured && (
          <div className="space-y-2">
            <label className="label block" htmlFor={`amt-${note.address}`}>How much to save</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
                <input id={`amt-${note.address}`} className="input pl-7" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <button className="btn-primary shrink-0" disabled={Boolean(saveBlocked) || Boolean(busy) || overBalance} onClick={subscribe}>Save {usd(amt)}</button>
            </div>
            {account && walletUnits !== undefined && (
              <p className={`text-xs ${overBalance ? "text-bad" : "text-muted"}`}>
                {overBalance ? "More than your wallet holds. " : ""}In your wallet: {fmtMoney(fromUnits(walletUnits))}.{" "}
                {walletUnits > 0n && <button type="button" className="underline underline-offset-2" onClick={() => setAmount(String(fromUnits(walletUnits)))}>Use all</button>}
              </p>
            )}
            {saveBlocked && <p className="text-xs text-muted">{saveBlocked}</p>}
            {units > 0n && floor1000 !== undefined && (
              <p className="text-sm text-ink2">
                {usd(amt * floorShare)} goes to government bonds, {usd(amt * (1 - floorShare))} earns fees.{" "}
                <b className="text-ink">Worst case at the end: {usd(amt)}.</b>
              </p>
            )}
          </div>
        )}
        {!subOpen && !matured && !isMature && <p className="text-sm text-muted">This plan is no longer taking new savings.</p>}

        {isMature && !matured && (
          <div>
            <button className="btn-primary w-full" disabled={!account || Boolean(busy)} title="Anyone can do this once the end date has passed."
              onClick={() => run("Close the plan", { address: note.address, abi: ABI.ProtectedNote, functionName: "mature", args: [] })}>Close the plan</button>
            <p className="text-xs text-muted mt-1">{account ? "The end date has passed. Anyone can close the plan so savers get paid back." : "Connect a wallet to close the plan."}</p>
          </div>
        )}

        {(pending > 0n || (holds && !hasRedeemed)) && (
          <div className="flex gap-2">
            {pending > 0n && <button className="btn-ghost flex-1" disabled={Boolean(busy)} onClick={() => run("Collect earnings", { address: note.address, abi: ABI.ProtectedNote, functionName: "claimCoupon", args: [] })}>Collect earnings</button>}
            {holds && !hasRedeemed && <button className="btn-primary flex-1" disabled={!canRedeem || Boolean(busy)} onClick={() => run("Get my money back", { address: note.address, abi: ABI.ProtectedNote, functionName: "redeem", args: [] })}>Get my money back</button>}
          </div>
        )}
        {holds && !hasRedeemed && !canRedeem && redeemWhy && <p className="text-xs text-muted">{redeemWhy}</p>}

        <details className="group border-t border-line pt-3">
          <summary className="cursor-pointer list-none text-sm text-ink2 hover:text-ink flex items-center justify-between">
            Details <span className="transition group-open:rotate-180">⌄</span>
          </summary>
          <div className="mt-3">
            <Row k="Total saved in this plan" v={usd(fromUnits(supply))} />
            <Row k="Safe part (government bonds)" v={usd(fromUnits(floorVal))} />
            <Row k="Earning part" v={<span>{fmtMoney(fromUnits(sleeveVal))} <span className={sleevePnL >= 0 ? "text-good" : "text-bad"}>({sleevePnL >= 0 ? "+" : ""}{fmtMoney(sleevePnL)})</span></span>} />
            <Row k="Earnings paid out" v={fmtMoney(fromUnits(couponsPaid))} />
            <Row k="Next payout" v={matured ? "—" : couponDue ? `ready now · ${fmtMoney(fromUnits(couponAvailable))}` : `in ${fmtDuration(Number(lastCoupon) + Number(couponInterval) - now)}`} />
            <Row k="Contract" v={<AddrLink address={note.address} chainId={chainId} />} />
            <Row k="Token" v={<span className="font-mono text-xs">{symbol} · paid in {stable}</span>} />
            <button className="btn-ghost btn-sm w-full mt-3" disabled={Boolean(payoutWhy) || Boolean(busy)} title="Anyone can trigger this. It sends the earnings that are due to everyone in the plan."
              onClick={() => run("Pay out earnings", { address: note.address, abi: ABI.ProtectedNote, functionName: "distributeCoupon", args: [] })}>Pay out earnings</button>
            <p className="text-xs text-muted mt-1">{payoutWhy || "Anyone can press this. It pays everyone their earnings."}</p>
          </div>
        </details>
      </div>
    </div>
  );
}

const STEPS = [
  { icon: "coin", title: "Save once", body: "Pick a plan and choose how much to save.", stat: "$1,000 in" },
  { icon: "split", title: "It splits in two", body: "Most buys government bonds. A small part earns protection fees.", stat: "$889 safe · $111 earning" },
  { icon: "growth", title: "Get it all back, plus extra", body: "Earnings are paid along the way. Your $1,000 comes back at the end.", stat: "$1,000 + earnings" },
];

const FAQ = [
  ["Can I lose what I put in?", "Not if you stay to the end date. The government bonds alone grow back to the full amount."],
  ["Where do the earnings come from?", "People pay a small fee to protect their stocks from a crash. Part of those fees goes to savers."],
  ["What if the market crashes?", "The earning part can shrink, because it helps pay for crashes. The amount you get back at the end does not."],
  ["Why do I need an ID check?", "Only verified wallets can join a savings plan. It takes a minute (top right)."],
];

function SplitVisual() {
  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-ink2">You save</span>
        <span className="text-2xl font-semibold tabular">$1,000</span>
      </div>
      <div className="mt-4 h-14 rounded-xl overflow-hidden flex text-sm font-medium" aria-hidden="true">
        <div className="bg-primary text-white grid place-items-center" style={{ width: "88.9%" }}>$889 safe</div>
        <div className="bg-accent text-white grid place-items-center" style={{ minWidth: 64, width: "11.1%" }}>$111</div>
      </div>
      <div className="mt-3 flex justify-between text-xs text-muted"><span>Government bonds, grows back to $1,000</span><span>Earns fees</span></div>
      <div className="mt-5 pt-4 border-t border-line flex items-baseline justify-between">
        <span className="text-sm text-ink2">At the end you get</span>
        <span className="text-lg font-semibold">$1,000 <span className="text-accent">+ earnings</span></span>
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
        eyebrow="Save"
        title="Your money back, guaranteed. Plus extra."
        art={<SaverArt />}
        right={<HeroCtas items={[["Start saving", "#plans"]]} />}
      >
        Most of your money goes into US government bonds (T-bills). A small part earns fees.
      </PageHead>

      <Section className="mt-6">
        <SectionHead id="plans" eyebrow="Plans" title="Pick a plan">Each plan has a fixed rate and end date.</SectionHead>
        <div className="space-y-3 mb-6">
          <DeployGate chainId={chainId}>{null}</DeployGate>
          {isConnected && deployed && !kyc.verified && <Notice>Verify your ID (top right) before you save.</Notice>}
          {!isConnected && <Notice>Connect a wallet to save. You can look around without one.</Notice>}
        </div>
        {deployed && notes.length === 0 && <Placeholder title="No savings plans here yet">Switch network (top right) to see the open plans.</Placeholder>}
        <div className="grid md:grid-cols-2 gap-4">
          {deployed && notes.map((n) => <NoteCard key={n.address} note={n} chainId={chainId} account={address} kycOk={kyc.verified} />)}
        </div>
      </Section>

      <HowItWorks title="Three steps" steps={STEPS} aside={<SplitVisual />} />

      <Section className="mt-20">
        <SectionHead id="calculator" eyebrow="Past results" title="What would $1,000 have become?">
          Every past month, tested. Pick an amount and how long.
        </SectionHead>
        <SaverCalculator />
      </Section>

      <Faq items={FAQ} />
    </>
  );
}
