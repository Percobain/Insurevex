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

/** "3 yrs", "11 mo", "6 days", "3h 20m" — whichever reads best at a glance. */
function humanTerm(sec) {
  const d = sec / 86400;
  if (d >= 365) return `${(d / 365).toFixed(d >= 730 ? 0 : 1)} yrs`;
  if (d >= 60) return `${Math.round(d / 30)} mo`;
  if (d >= 2) return `${Math.floor(d)} days`;
  return fmtDuration(sec);
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
      const ok = await run(`Approve ${stable}`, { address: stableAddr, abi: ERC20_ABI, functionName: "approve", args: [note.address, units] });
      if (!ok) return;
      await allowance.refetch();
    }
    await run(`Subscribe ${amount} ${stable} to ${symbol}`, { address: note.address, abi: ABI.ProtectedNote, functionName: "subscribe", args: [units] });
  }

  const status = matured ? "Matured" : paused ? "Paused" : isMature ? "At maturity" : subOpen ? "Open for deposits" : "Running";
  const statusCls = matured ? "" : paused ? "text-bad border-bad/40" : subOpen ? "text-good border-good/40 bg-sage/40" : "text-accent border-accent/40";
  const amt = Number(amount) || 0;

  return (
    <div className="card p-5 sm:p-6 flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold leading-snug break-words">{name}</h3>
          <div className="text-xs text-muted font-mono mt-0.5">{symbol}</div>
        </div>
        <span className={`chip shrink-0 ${statusCls}`}>{status}</span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-sunk p-4">
          <div className="label">Locked rate</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight tabular">{fmtPct(Number(rateBps) / 1e4, 2)}</div>
        </div>
        <div className="rounded-xl bg-sunk p-4">
          <div className="label">{isMature ? "Matured" : "Matures in"}</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight tabular">{isMature ? fmtDate(maturity).split(",")[0] : humanTerm(Number(maturity) - now)}</div>
          {!isMature && <div className="text-xs text-muted mt-0.5">{fmtDate(maturity)}</div>}
        </div>
      </div>

      {account && (bal > 0n || hasRedeemed) && (
        <div className="rounded-xl border border-line p-4 mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-ink2">You hold</span><span className="tabular font-semibold">{fmtMoney(fromUnits(bal), { sym: "" })} {stable}</span></div>
          <div className="flex justify-between"><span className="text-ink2">Coupon ready to claim</span><span className="tabular">{fmtMoney(fromUnits(pending), { sym: "" })}</span></div>
          {matured && !hasRedeemed && <div className="flex justify-between"><span className="text-ink2">Claimable now</span><span className="tabular text-good">{fmtMoney(fromUnits(claimable), { sym: "" })}</span></div>}
          {hasRedeemed && <div className="flex justify-between"><span className="text-ink2">Redeemed</span><span className="tabular text-good">{fmtMoney(fromUnits(redeemed), { sym: "" })} {stable}{bal > 0n ? ` (${fromUnits(redeemed) >= fromUnits(bal) ? "+" : ""}${fmtMoney(fromUnits(redeemed) - fromUnits(bal), { sym: "" })} vs deposit)` : ""}</span></div>}
        </div>
      )}

      <div className="mt-auto pt-5 space-y-3">
        {subOpen && !matured && (
          <>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input className="input pr-16" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Deposit amount" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">{stable}</span>
              </div>
              <button className="btn-primary shrink-0" disabled={!account || !kycOk || Boolean(busy) || units <= 0n || paused || overBalance} onClick={subscribe}>Deposit</button>
            </div>
            {account && walletUnits !== undefined && (
              <p className={`text-xs ${overBalance ? "text-bad" : "text-muted"}`}>
                {overBalance ? "More than your wallet holds. " : ""}Wallet: {fmtMoney(fromUnits(walletUnits), { sym: "" })} {stable}.{" "}
                {walletUnits > 0n && <button type="button" className="underline underline-offset-2" onClick={() => setAmount(String(fromUnits(walletUnits)))}>Use all</button>}
              </p>
            )}
            {units > 0n && floor1000 !== undefined && (
              <p className="text-sm text-ink2">
                Guaranteed back at maturity: <b className="text-ink">{fmtMoney(amt, { sym: "" })} {stable}</b>
                <span className="text-muted"> · {fmtMoney(amt * floorShare, { sym: "" })} to T-bills, {fmtMoney(amt * (1 - floorShare), { sym: "" })} to vault units</span>
              </p>
            )}
          </>
        )}
        {(pending > 0n || (matured && claimable > 0n)) && (
          <div className="flex gap-2">
            {pending > 0n && <button className="btn-ghost flex-1" disabled={Boolean(busy)} onClick={() => run("Claim coupon", { address: note.address, abi: ABI.ProtectedNote, functionName: "claimCoupon", args: [] })}>Claim coupon</button>}
            {matured && claimable > 0n && <button className="btn-primary flex-1" disabled={Boolean(busy)} onClick={() => run("Redeem note", { address: note.address, abi: ABI.ProtectedNote, functionName: "redeem", args: [] })}>Redeem</button>}
          </div>
        )}

        <details className="group border-t border-line pt-3">
          <summary className="cursor-pointer list-none text-sm text-ink2 hover:text-ink flex items-center justify-between">
            Note details <span className="transition group-open:rotate-180">⌄</span>
          </summary>
          <div className="mt-3">
            <div className="flex justify-between text-xs text-muted"><span>T-bills {fmtPct(floorShare, 1)}</span><span>Vault units {fmtPct(1 - floorShare, 1)}</span></div>
            <div className="mt-1.5 h-2 rounded-full overflow-hidden bg-sunk flex">
              <div className="bg-ink2/40" style={{ width: `${floorShare * 100}%` }} />
              <div className="bg-accent" style={{ width: `${(1 - floorShare) * 100}%` }} />
            </div>
            <div className="mt-2">
              <Row k="Notes outstanding" v={`${fmtMoney(fromUnits(supply), { sym: "" })} ${stable}`} />
              <Row k="T-bill value" v={fmtMoney(fromUnits(floorVal), { sym: "" })} />
              <Row k="Vault units value" v={<span>{fmtMoney(fromUnits(sleeveVal), { sym: "" })} <span className={sleevePnL >= 0 ? "text-good" : "text-bad"}>({sleevePnL >= 0 ? "+" : ""}{fmtMoney(sleevePnL, { sym: "" })})</span></span>} />
              <Row k="Coupons paid" v={`${fmtMoney(fromUnits(couponsPaid), { sym: "" })} ${stable}`} />
              <Row k="Next coupon" v={matured ? "—" : couponDue ? `due now · ${fmtMoney(fromUnits(couponAvailable), { sym: "" })}` : `in ${fmtDuration(Number(lastCoupon) + Number(couponInterval) - now)}`} />
              <Row k="Contract" v={<AddrLink address={note.address} chainId={chainId} />} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button className="btn-ghost btn-sm" disabled={!account || matured || !couponDue || Boolean(busy)}
                onClick={() => run("Distribute coupon", { address: note.address, abi: ABI.ProtectedNote, functionName: "distributeCoupon", args: [] })}>Pay out coupon</button>
              <button className="btn-ghost btn-sm" disabled={!account || !isMature || matured || Boolean(busy)}
                onClick={() => run("Mature note", { address: note.address, abi: ABI.ProtectedNote, functionName: "mature", args: [] })}>Settle maturity</button>
            </div>
            <p className="text-xs text-muted mt-2">Anyone can trigger these. They keep the note running on schedule.</p>
          </div>
        </details>
      </div>
    </div>
  );
}

const STEPS = [
  { icon: "coin", title: "Deposit", body: "One transaction from a verified wallet, into a note with a fixed end date.", stat: "$1,000 in" },
  { icon: "split", title: "It splits in two", body: "Most buys T-bills that grow back to your full deposit. The rest buys vault units.", stat: "$952 T-bills · $48 units" },
  { icon: "growth", title: "Get it all back, plus more", body: "Your deposit is locked in. The units grow every time a holder pays a premium.", stat: "$1,000 + vault units" },
];

const FAQ = [
  ["Can I lose my deposit?", "No. The T-bill part alone is sized to grow back to your full deposit by maturity. Only the small vault-unit part carries risk, and it is the part that earns the extra."],
  ["Where does the extra return come from?", "Stock holders pay premiums to protect their shares from a crash. Those premiums flow into the vault and raise the price of your vault units."],
  ["What happens if the market crashes?", "The vault pays protected holders, so your vault units can lose value. Your T-bills are untouched, so you still get your deposit back."],
  ["Why do I need to verify my identity?", "Notes are regulated-style instruments. The contract checks an on-chain registry on every deposit and transfer, so only verified wallets can hold them."],
];

function SplitVisual() {
  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-ink2">Your deposit</span>
        <span className="text-2xl font-semibold tabular">$1,000</span>
      </div>
      <div className="mt-4 h-14 rounded-xl overflow-hidden flex text-sm font-medium" aria-hidden="true">
        <div className="bg-primary text-white grid place-items-center" style={{ width: "95.2%" }}>$952 T-bills · safe</div>
        <div className="bg-accent text-white grid place-items-center" style={{ minWidth: 64, width: "4.8%" }}>$48</div>
      </div>
      <div className="mt-3 flex justify-between text-xs text-muted"><span>Grows back to $1,000</span><span>Vault units · earns premiums</span></div>
      <div className="mt-5 pt-4 border-t border-line flex items-baseline justify-between">
        <span className="text-sm text-ink2">At maturity you get</span>
        <span className="text-lg font-semibold">$1,000 <span className="text-accent">+ vault units</span></span>
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
        eyebrow="For savers"
        title="Earn more than T-bills. Never lose your deposit."
        art={<SaverArt />}
        right={<HeroCtas items={[["Start saving", "#notes"], ["See past returns", "#calculator"]]} />}
      >
        Your deposit is locked in by U.S. Treasury bills. A small slice earns extra from people paying to protect their stocks.
      </PageHead>

      <HowItWorks title="Three steps, one transaction" steps={STEPS} aside={<SplitVisual />} />

      <Section className="mt-20">
        <SectionHead id="calculator" eyebrow="Past returns" title="What would your deposit have become?">
          Every monthly start date in history, simulated. Pick an amount and a term.
        </SectionHead>
        <SaverCalculator />
      </Section>

      <Section className="mt-20">
        <SectionHead id="notes" eyebrow="Live on-chain" title="Pick a note">Each note has a fixed rate and end date. Deposit while it is open.</SectionHead>
        <div className="space-y-3 mb-6">
          <DeployGate chainId={chainId}>{null}</DeployGate>
          {isConnected && deployed && !kyc.verified && <Notice>Verify your identity (top right) before depositing.</Notice>}
          {!isConnected && <Notice>Connect a wallet to deposit. You can browse the notes below without one.</Notice>}
        </div>
        {deployed && notes.length === 0 && <Placeholder title="No note series on this chain yet" />}
        <div className="grid md:grid-cols-2 gap-4">
          {deployed && notes.map((n) => <NoteCard key={n.address} note={n} chainId={chainId} account={address} kycOk={kyc.verified} />)}
        </div>
      </Section>

      <Faq items={FAQ} />
    </>
  );
}
