"use client";
import { useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { ERC20_ABI, PRO_ABI, addr, stableSymbol } from "@/lib/contracts";
import { fmtMoney, fmtNum, fmtPct, fromUnits, toUnits } from "@/lib/format";
import { useTx } from "@/lib/useTx";
import { Row, Notice } from "./ui";
import { useKyc } from "./KycBadge";
import { useDemo, DEMO_BALANCE } from "@/lib/demo";

const LOSS_ORDER = [
  ["Fees already collected", "pay first", "bg-sage"],
  ["Pro money", "pays next", "bg-accent text-white"],
  ["Savers' earning part", "only if Pro runs out", "bg-primary text-white"],
  ["Savers' government bonds", "never used", "bg-sunk text-muted"],
];

/** Dollars, without cents once the amount is large. */
const usd = (x) => fmtMoney(x, { dp: Math.abs(Number(x) || 0) >= 100 ? 0 : 2 });

/** Pro (junior, first-loss) money: add/withdraw and position. */
export default function ProPanel({ chainId, account, pro }) {
  const pool = addr(chainId, "UnderwritingPool");
  const stableAddr = addr(chainId, "stable");
  const stable = stableSymbol(chainId);
  const kyc = useKyc();
  const { run, busy } = useTx();
  const [amount, setAmount] = useState("1");
  const units = toUnits(amount);
  const mine = useReadContracts({
    contracts: [
      { address: pool, abi: PRO_ABI, functionName: "proBalanceOf", args: [account], chainId },
      { address: pool, abi: PRO_ABI, functionName: "maxProWithdraw", args: [account], chainId },
    ],
    query: { enabled: Boolean(account && pool && pro?.available), refetchInterval: 20_000 },
  });
  const [bal, maxW] = (mine.data || []).map((x) => (x.status === "success" ? x.result : undefined));
  const allowance = useReadContract({ address: stableAddr, abi: ERC20_ABI, functionName: "allowance", args: [account, pool], query: { enabled: Boolean(account && stableAddr && pool) } });
  const walletRead = useReadContract({ address: stableAddr, abi: ERC20_ABI, functionName: "balanceOf", args: [account], query: { enabled: Boolean(account && stableAddr), refetchInterval: 15_000 } });
  const demo = useDemo();
  const wallet = demo ? { data: DEMO_BALANCE } : walletRead;
  const overBalance = wallet.data !== undefined && units > wallet.data;
  const price = pro?.proSharePrice !== undefined ? fromUnits(pro.proSharePrice, 18) : null;
  const myValue = bal !== undefined && price !== null ? fromUnits(bal) * price : null;

  async function deposit() {
    if ((allowance.data || 0n) < units) {
      const ok = await run(`Allow ${stable} spending`, { address: stableAddr, abi: ERC20_ABI, functionName: "approve", args: [pool, units] });
      if (!ok) return;
      await allowance.refetch();
    }
    await run(`Add ${usd(Number(amount) || 0)} as Pro`, { address: pool, abi: PRO_ABI, functionName: "depositPro", args: [units] });
  }

  const amt = Number(amount) || 0;
  const overMax = maxW !== undefined && units > maxW;
  const addWhy = !account ? "Connect a wallet first."
    : !kyc.verified ? "Verify your ID (top right) to add money."
    : units <= 0n ? "Enter an amount."
    : null;
  const bonus = pro?.proFeeBps !== undefined ? fmtPct(Number(pro.proFeeBps) / 1e4, 0) : null;

  return (
    <div className="card p-5 sm:p-6">
      <div className="eyebrow">Pro</div>
      <h3 className="font-display text-3xl tracking-tight mt-2">Earn more as Pro</h3>
      <div className="grid lg:grid-cols-[1.1fr_1fr] gap-6 mt-5">
        <div className="space-y-4">
          <p className="text-[15px] text-ink2 leading-relaxed">
            Pro money takes the first hit in a crash. In return it earns a bigger share of the fees.
          </p>
          <div>
            <div className="text-sm font-medium">If a crash payout is due, who pays?</div>
            <ol className="mt-3 space-y-1.5">
              {LOSS_ORDER.map(([t, sub, cls], i) => (
                <li key={t} className={`rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 text-sm ${cls}`}>
                  <span className="font-medium">{i + 1}. {t}</span>
                  <span className="text-xs opacity-80 text-right">{sub}</span>
                </li>
              ))}
            </ol>
          </div>
          <p className="text-xs text-muted">
            This is risk money, not savings. In past tests, Pro lost a lot in 2008 and March 2020.{bonus ? ` Pro also gets ${bonus} of the savers' share of fees.` : ""}
          </p>
        </div>
        <div>
          {!pro?.available ? (
            <Notice tone="warn">Pro is not open on this network yet.</Notice>
          ) : (
            <>
              <Row k="All Pro money" v={usd(fromUnits(pro.juniorAssets))} />
              <Row k="Value of 1 Pro share" v={price !== null ? `$${fmtNum(price, 4)}` : "—"} strong />
              <Row k="Crash losses taken so far" v={usd(fromUnits(pro.totalProLosses))} />
              {account && <Row k="Your Pro money" v={myValue !== null ? usd(myValue) : "—"} />}
              <label className="label block mt-4" htmlFor="pro-amount">How much</label>
              <div className="flex gap-2 mt-1.5">
                <div className="relative flex-1 min-w-0">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
                  <input id="pro-amount" className="input pl-7" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <button className="btn-primary shrink-0" disabled={Boolean(addWhy) || Boolean(busy) || overBalance} onClick={deposit}>Add {usd(amt)}</button>
                <button className="btn-ghost shrink-0" disabled={!account || Boolean(busy) || units <= 0n || overMax}
                  onClick={() => run(`Withdraw ${usd(amt)} from Pro`, { address: pool, abi: PRO_ABI, functionName: "withdrawPro", args: [units] })}>
                  Withdraw
                </button>
              </div>
              {account && wallet.data !== undefined && (
                <p className={`text-xs mt-2 ${overBalance ? "text-bad" : "text-muted"}`}>
                  {overBalance ? "More than your wallet holds. " : ""}In your wallet: {fmtMoney(fromUnits(wallet.data))}.{" "}
                  {wallet.data > 0n && <button type="button" className="underline underline-offset-2" onClick={() => setAmount(String(fromUnits(wallet.data)))}>Use all</button>}
                  {maxW !== undefined && maxW > 0n && <> · <button type="button" className="underline underline-offset-2" onClick={() => setAmount(String(fromUnits(maxW)))}>Withdraw max</button></>}
                </p>
              )}
              {addWhy && <p className="text-xs text-muted mt-1">{addWhy}</p>}
              <p className="text-xs text-muted mt-1">
                You can take out {maxW !== undefined ? fmtMoney(fromUnits(maxW)) : "—"} now. Money backing open protection unlocks when it ends.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
