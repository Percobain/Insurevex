"use client";
import { useReadContract, useReadContracts } from "wagmi";
import { ABI, addr, stableSymbol } from "@/lib/contracts";
import { useTx } from "@/lib/useTx";
import { useSymbolNames } from "@/lib/useSymbolNames";
import { fmtDate, fmtMoney, fmtNum, fmtPct, fromUnits } from "@/lib/format";
import { useActiveChain, Placeholder } from "./ui";

export const STATUS = ["—", "Open", "Settled"];

export function usePolicies(ids, chainId) {
  const market = addr(chainId, "CoverMarket");
  const q = useReadContracts({
    contracts: (ids || []).map((id) => ({ address: market, abi: ABI.CoverMarket, functionName: "getPolicy", args: [id], chainId })),
    query: { enabled: Boolean(market && ids?.length), refetchInterval: 20_000 },
  });
  return (q.data || []).map((r, i) => (r.status === "success" ? { id: Number(ids[i]), ...r.result } : null)).filter(Boolean);
}

export default function MyPolicies() {
  const { chainId, address, isConnected, deployed } = useActiveChain();
  const market = addr(chainId, "CoverMarket");
  const nameOf = useSymbolNames();
  const stable = stableSymbol(chainId);
  const { run, busy } = useTx();
  const ids = useReadContract({
    address: market, abi: ABI.CoverMarket, functionName: "policiesOf", args: [address],
    query: { enabled: Boolean(address && market), refetchInterval: 20_000 },
  });
  const list = usePolicies(ids.data ? [...ids.data].reverse() : [], chainId);
  const now = Math.floor(Date.now() / 1000);

  return (
    <div>
      <div className="flex items-end justify-between mb-4">
        <div>
          <div className="eyebrow">Your cover</div>
          <h2 className="font-display text-3xl tracking-tight mt-2">My policies</h2>
        </div>
      </div>
      {!isConnected || !deployed ? (
        <Placeholder title="Connect a wallet on a live chain">Your policies are read directly from the CoverMarket contract.</Placeholder>
      ) : list.length === 0 ? (
        <Placeholder title="No policies yet">Buy cover above and it will appear here with its settlement result.</Placeholder>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-x">
            <thead>
              <tr><th>#</th><th>Stock</th><th>Protected</th><th>Terms</th><th>Premium</th><th>Start</th><th>Expiry</th><th>Status</th><th>Result</th><th></th></tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const expired = Number(p.expiry) <= now;
                const settled = Number(p.status) === 2;
                const ret = settled ? Number(p.settlePrice) / Number(p.startPrice) - 1 : null;
                return (
                  <tr key={p.id}>
                    <td className="text-muted">{p.id}</td>
                    <td className="font-mono text-xs">{nameOf(p.symbol)}</td>
                    <td>{fmtMoney(fromUnits(p.notional), { sym: "" })} {stable}</td>
                    <td>{fmtPct(Number(p.deductibleBps) / 1e4, 0)} / {fmtPct(Number(p.capBps) / 1e4, 0)}</td>
                    <td>{fmtMoney(fromUnits(p.premium), { sym: "" })}</td>
                    <td>{fmtNum(Number(p.startPrice) / 1e8, 2)}</td>
                    <td>{fmtDate(p.expiry)}</td>
                    <td>
                      <span className={`chip ${settled ? "" : expired ? "text-warn border-warn/40" : "text-accent border-accent/40"}`}>
                        {settled ? "Settled" : expired ? "Awaiting close" : "Active"}
                      </span>
                    </td>
                    <td>
                      {settled ? (
                        <span>
                          <span className={ret < 0 ? "text-bad" : "text-good"}>{fmtPct(ret, 1, { sign: true })}</span>
                          {" · "}
                          <span className={Number(p.payout) > 0 ? "text-good font-medium" : "text-muted"}>paid {fmtMoney(fromUnits(p.payout), { sym: "" })}</span>
                        </span>
                      ) : "—"}
                    </td>
                    <td>
                      {!settled && expired && (
                        <button className="btn-ghost btn-sm" disabled={Boolean(busy)}
                          onClick={() => run(`Settle policy #${p.id}`, { address: market, abi: ABI.CoverMarket, functionName: "settle", args: [BigInt(p.id)] })}>
                          Settle
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
