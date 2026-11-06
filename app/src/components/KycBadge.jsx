"use client";
import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { ABI, addr } from "@/lib/contracts";
import KycModal from "./KycModal";
import { useDemo } from "@/lib/demo";

export function useKyc() {
  const { address, chainId } = useAccount();
  const registry = addr(chainId, "IdentityRegistry");
  const { data: verified, isLoading } = useReadContract({
    address: registry,
    abi: ABI.IdentityRegistry,
    functionName: "isVerified",
    args: [address],
    query: { enabled: Boolean(address && registry), refetchInterval: 15_000 },
  });
  const { data: frozen } = useReadContract({
    address: registry,
    abi: ABI.IdentityRegistry,
    functionName: "isFrozen",
    args: [address],
    query: { enabled: Boolean(address && registry) },
  });
  const demo = useDemo();
  if (demo) return { verified: true, frozen: false, loading: false, available: true };
  return { verified: Boolean(verified), frozen: Boolean(frozen), loading: isLoading, available: Boolean(registry && address) };
}

export default function KycBadge() {
  const { isConnected: walletConnected } = useAccount();
  const demo = useDemo();
  const isConnected = walletConnected || demo;
  const { verified, frozen, available } = useKyc();
  const [open, setOpen] = useState(false);
  if (!isConnected || !available) return null;
  if (frozen) return <span className="chip border-bad/40 text-bad" title="Your wallet is paused by the issuer. Contact support.">Wallet paused</span>;
  if (verified)
    return (
      <span className="chip border-good/40 text-good">
        <span className="h-1.5 w-1.5 rounded-full bg-good" /> ID verified
      </span>
    );
  return (
    <>
      <button className="chip hover:bg-sunk" onClick={() => setOpen(true)}>
        <span className="h-1.5 w-1.5 rounded-full bg-warn" /> Verify ID
      </button>
      {open && <KycModal onClose={() => setOpen(false)} />}
    </>
  );
}
