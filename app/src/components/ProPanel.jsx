"use client";
import { useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { ERC20_ABI, PRO_ABI, addr, stableSymbol } from "@/lib/contracts";
import { fmtMoney, fmtNum, fmtPct, fromUnits, toUnits } from "@/lib/format";
import { useTx } from "@/lib/useTx";
import { Row, Notice } from "./ui";
import { useKyc } from "./KycBadge";
import { useDemo, DEMO_BALANCE } from "@/lib/demo";

/** Junior first-loss tranche: deposit/withdraw and position. */
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
      const ok = await run(`Approve ${stable} for Pro`, { address: stableAddr, abi: ERC20_ABI, functionName: "approve", args: [pool, units] });
      if (!ok) return;
      await allowance.refetch();
    }
    await run(`Deposit ${amount} ${stable} as Pro`, { address: pool, abi: PRO_ABI, functionName: "depositPro", args: [units] });
  }

  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow">Pro LP · junior tranche</div>
          <h3 className="font-display text-3xl tracking-tight mt-2">Take the first loss, earn more.</h3>
        </div>
      </div>
      <div className="grid lg:grid-cols-[1.1fr_1fr] gap-6 mt-5">
        <div className="space-y-4">
          <p className="text-[15px] text-ink2 leading-relaxed">
            Pro capital pays claims before savers do. In return it earns its share of premiums plus{" "}
            <b className="text-ink">{pro?.proFeeBps !== undefined ? fmtPct(Number(pro.proFeeBps) / 1e4, 0) : "40%"} of the savers&apos; share</b>.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-xl bg-sage/60 p-4"><div className="text-sm font-semibold">Upside</div><p className="text-sm text-ink2 mt-1">The biggest cut of premiums in calm markets.</p></div>
            <div className="rounded-xl bg-accentSoft p-4"><div className="text-sm font-semibold">Risk</div><p className="text-sm text-ink2 mt-1">First to lose in a crash. Deep drawdowns in 2008 and March 2020.</p></div>
          </div>
          <p className="text-xs text-muted">Risk capital, not a savings product. In the 2005–2026 backtest, with Pro at least half the size of savers&apos; units, savers never had a losing period.</p>
        </div>
        <div>
          {!pro?.available ? (
            <Notice tone="warn">The Pro tranche is not live on this deployment yet.</Notice>
          ) : (
            <>
              <Row k="Pro capital" v={`${fmtMoney(fromUnits(pro.juniorAssets), { sym: "" })} ${stable}`} />
              <Row k="Pro share price" v={price !== null ? fmtNum(price, 4) : "—"} strong />
              <Row k="Losses absorbed to date" v={`${fmtMoney(fromUnits(pro.totalProLosses), { sym: "" })} ${stable}`} />
              {account && <Row k="Your Pro position" v={myValue !== null ? `${fmtMoney(myValue, { sym: "" })} ${stable}` : "—"} />}
              <div className="flex gap-2 mt-4">
                <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Pro amount" />
                <button className="btn-primary shrink-0" disabled={!account || !kyc.verified || Boolean(busy) || units <= 0n || overBalance} onClick={deposit}>Deposit</button>
                <button className="btn-ghost shrink-0" disabled={!account || Boolean(busy) || units <= 0n || (maxW !== undefined && units > maxW)}
                  onClick={() => run(`Withdraw ${amount} ${stable} from Pro`, { address: pool, abi: PRO_ABI, functionName: "withdrawPro", args: [units] })}>
                  Withdraw
                </button>
              </div>
              {account && wallet.data !== undefined && (
                <p className={`text-xs mt-2 ${overBalance ? "text-bad" : "text-muted"}`}>
                  {overBalance ? "More than your wallet holds. " : ""}Wallet: {fmtMoney(fromUnits(wallet.data), { sym: "" })} {stable}.{" "}
                  {wallet.data > 0n && <button type="button" className="underline underline-offset-2" onClick={() => setAmount(String(fromUnits(wallet.data)))}>Use all</button>}
                  {maxW !== undefined && maxW > 0n && <> · <button type="button" className="underline underline-offset-2" onClick={() => setAmount(String(fromUnits(maxW)))}>Withdraw max</button></>}
                </p>
              )}
              <p className="text-xs text-muted mt-1">
                Withdrawable now: {maxW !== undefined ? `${fmtMoney(fromUnits(maxW), { sym: "" })} ${stable}` : "—"}. Pro capital backing open policies stays locked until they settle.
                {account && !kyc.verified && " KYC is required to deposit."}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
