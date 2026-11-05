"use client";
import { useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { ERC20_ABI, PRO_ABI, addr, stableSymbol } from "@/lib/contracts";
import { fmtMoney, fmtNum, fmtPct, fromUnits, toUnits } from "@/lib/format";
import { useTx } from "@/lib/useTx";
import { Row, Notice } from "./ui";
import { useKyc } from "./KycBadge";

/** Junior first-loss tranche: deposit/withdraw and position. */
export default function ProPanel({ chainId, account, pro }) {
  const pool = addr(chainId, "UnderwritingPool");
  const stableAddr = addr(chainId, "stable");
  const stable = stableSymbol(chainId);
  const kyc = useKyc();
  const { run, busy } = useTx();
  const [amount, setAmount] = useState("25");
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
          <h3 className="font-display text-3xl tracking-tight mt-2">Take the first loss, earn more of the premium.</h3>
        </div>
      </div>
      <div className="grid lg:grid-cols-[1.1fr_1fr] gap-6 mt-5">
        <div className="text-sm text-ink2 leading-relaxed space-y-3">
          <p>
            Pro capital sits in front of the Savers' sleeves. When a crash payout comes in, Pro pays first; Savers' sleeves are only
            touched once Pro is used up. In return Pro earns its share of premiums plus{" "}
            <span className="text-ink font-medium">{pro?.proFeeBps !== undefined ? fmtPct(Number(pro.proFeeBps) / 1e4, 0) : "40%"} of the Savers' premium share</span>.
          </p>
          <p>
            In the 2005–2026 backtest, with Pro capital of at least half the sleeves, Savers' sleeves never had a losing period. Pro's
            own drawdowns were deep in 2008 and March 2020: this is risk capital, not a savings product.
          </p>
          <div className="rounded-xl bg-sunk p-4">
            <div className="label mb-2">Loss order</div>
            <ol className="text-ink space-y-1 list-decimal list-inside">
              <li>Premiums collected</li><li>Pro first-loss capital</li><li>Savers' sleeves</li>
              <li className="text-muted">Savers' T-bill floor: never</li>
            </ol>
          </div>
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
                <button className="btn-primary shrink-0" disabled={!account || !kyc.verified || Boolean(busy) || units <= 0n} onClick={deposit}>Deposit</button>
                <button className="btn-ghost shrink-0" disabled={!account || Boolean(busy) || units <= 0n || (maxW !== undefined && units > maxW)}
                  onClick={() => run(`Withdraw ${amount} ${stable} from Pro`, { address: pool, abi: PRO_ABI, functionName: "withdrawPro", args: [units] })}>
                  Withdraw
                </button>
              </div>
              <p className="text-xs text-muted mt-2">
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
