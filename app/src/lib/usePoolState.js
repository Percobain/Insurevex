"use client";
import { useReadContracts } from "wagmi";
import { ABI, PRO_ABI, addr } from "./contracts";

const POOL_FIELDS = ["totalAssets", "locked", "capacity", "utilisationBps", "reserveBps", "symbolCapBps", "totalPremiums", "totalPayouts", "totalSupply", "cash", "tbillAssets"];
const TBILL_FIELDS = ["navPerShare", "apyBps", "attestedReserve", "totalAssets"];
const PRO_FIELDS = ["juniorAssets", "proSupply", "proSharePrice", "proFeeBps", "totalProLosses", "physicalAssets", "capacityTotal"];

/** Reads the pool, the T-bill vault and the cover market straight from the chain (no server needed). */
export function usePoolState(chainId) {
  const pool = addr(chainId, "UnderwritingPool");
  const tbill = addr(chainId, "TBillVault");
  const market = addr(chainId, "CoverMarket");
  const contracts = [
    ...POOL_FIELDS.map((fn) => ({ address: pool, abi: ABI.UnderwritingPool, functionName: fn, chainId })),
    { address: pool, abi: ABI.UnderwritingPool, functionName: "convertToAssets", args: [1_000_000n], chainId },
    ...TBILL_FIELDS.map((fn) => ({ address: tbill, abi: ABI.TBillVault, functionName: fn, chainId })),
    { address: market, abi: ABI.CoverMarket, functionName: "policyCount", chainId },
    ...PRO_FIELDS.map((fn) => ({ address: pool, abi: PRO_ABI, functionName: fn, chainId })),
  ];
  const q = useReadContracts({ contracts, query: { enabled: Boolean(pool && tbill && market), refetchInterval: 20_000 } });
  const r = q.data?.map((x) => (x.status === "success" ? x.result : undefined)) || [];
  const p = {};
  POOL_FIELDS.forEach((k, i) => (p[k] = r[i]));
  p.sharePrice = r[POOL_FIELDS.length];
  const t = {};
  TBILL_FIELDS.forEach((k, i) => (t[k] = r[POOL_FIELDS.length + 1 + i]));
  const policyCount = r[POOL_FIELDS.length + 1 + TBILL_FIELDS.length];
  const pro = {};
  PRO_FIELDS.forEach((k, i) => (pro[k] = r[POOL_FIELDS.length + 2 + TBILL_FIELDS.length + i]));
  pro.available = pro.juniorAssets !== undefined;
  const ok = q.isSuccess && p.totalAssets !== undefined;
  return { ok, loading: q.isLoading, pool: p, tbill: t, pro, policyCount, refetch: q.refetch };
}
