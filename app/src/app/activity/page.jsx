"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { parseEventLogs } from "viem";
import { ABI, addr, getDeployment, notesOf, stableSymbol } from "@/lib/contracts";
import { useApi } from "@/lib/api";
import { useSymbolNames } from "@/lib/useSymbolNames";
import { fmtMoney, fromUnits, shortAddr, fmtNum } from "@/lib/format";
import { PageHead, Section, SectionHead, Seg, useActiveChain, DeployGate, TxLink, Placeholder, HeroCtas, HowItWorks, Faq } from "@/components/ui";
import { SettleArt } from "@/components/IsoArt";

const ALL_ABI = [...ABI.CoverMarket, ...ABI.ProtectedNote, ...ABI.UnderwritingPool, ...ABI.IdentityRegistry, ...ABI.PriceOracle, ...ABI.TBillVault];
const INTERESTING = new Set(["CoverBought", "CoverSettled", "Subscribed", "CouponDistributed", "CouponClaimed", "Matured", "MaturityClaimed",
  "ForcedTransfer", "IdentitySet", "Frozen", "CountryBlocked", "PricePosted", "NavUpdated", "ClaimPaid", "RiskParams", "Paused", "Unpaused"]);

/** Fallback: read recent logs straight from the chain when the server is offline. */
function useChainActivity(chainId, enabled) {
  const client = usePublicClient({ chainId });
  return useQuery({
    queryKey: ["chain-activity", chainId],
    enabled: Boolean(client && enabled && getDeployment(chainId)),
    retry: 0,
    queryFn: async () => {
      const d = getDeployment(chainId);
      const latest = await client.getBlockNumber();
      const from = BigInt(Math.max(Number(d.startBlock || 0), Number(latest) - 9_000));
      const addresses = [addr(chainId, "CoverMarket"), addr(chainId, "UnderwritingPool"), addr(chainId, "IdentityRegistry"), addr(chainId, "PriceOracle"), addr(chainId, "TBillVault"), ...notesOf(chainId).map((n) => n.address)].filter(Boolean);
      const logs = await client.getLogs({ address: addresses, fromBlock: from, toBlock: latest });
      return parseEventLogs({ abi: ALL_ABI, logs, strict: false })
        .filter((l) => INTERESTING.has(l.eventName))
        .map((l) => ({ event: l.eventName, txHash: l.transactionHash, blockNumber: Number(l.blockNumber), args: l.args, contract: l.address }))
        .reverse();
    },
  });
}

function describe(e, nameOf, stable) {
  const a = e.args || {};
  const money = (v) => `${fmtMoney(fromUnits(v), { sym: "" })} ${stable}`;
  switch (e.event) {
    case "CoverBought": return `${shortAddr(a.holder)} protected ${money(a.notional)} of ${nameOf(a.symbol)} for ${money(a.premium)}`;
    case "CoverSettled": return `Policy #${a.id} on ${nameOf(a.symbol)} settled at ${fmtNum(Number(a.settlePrice) / 1e8, 2)} (${fmtNum(Number(a.returnBps) / 100, 2)}%), paid ${money(a.payout)}`;
    case "Subscribed": return `${shortAddr(a.investor)} bought ${money(a.face)} of notes: ${money(a.floor)} to T-bills, ${money(a.sleeve)} to the pool`;
    case "CouponDistributed": return `Coupon of ${money(a.amount)} distributed to noteholders`;
    case "CouponClaimed": return `${shortAddr(a.holder)} claimed a ${money(a.amount)} coupon`;
    case "Matured": return `Note matured: ${money(a.proceeds)} returned from T-bills and the pool`;
    case "MaturityClaimed": return `${shortAddr(a.holder)} redeemed ${money(a.amount)}`;
    case "ForcedTransfer": return `Agent moved ${money(a.amount)} of notes from ${shortAddr(a.from)} to ${shortAddr(a.to)}`;
    case "IdentitySet": return `KYC ${a.verified ? "verified" : "revoked"} for ${shortAddr(a.account)} (country ${a.country})`;
    case "Frozen": return `${shortAddr(a.account)} ${a.frozen ? "frozen" : "unfrozen"}`;
    case "CountryBlocked": return `Country ${a.country} ${a.blocked ? "blocked" : "unblocked"}`;
    case "PricePosted": return `Official close ${nameOf(a.symbol)} = ${fmtNum(Number(a.price) / 1e8, 2)}`;
    case "NavUpdated": return `T-bill NAV ${fmtNum(Number(a.navPerShare) / 1e18, 6)} at ${fmtNum(Number(a.apyBps) / 100, 2)}%, reserve ${money(a.attestedReserve)}`;
    case "ClaimPaid": return `Pool paid a ${money(a.amount)} claim to ${shortAddr(a.to)}${a.fromPro !== undefined ? ` (Pro ${money(a.fromPro)}, Savers ${money(a.fromSenior)})` : ""}`;
    default: return e.summary || e.event;
  }
}

// Friendly name + category for each contract event.
const KIND = {
  CoverBought: ["Cover bought", "cover"], CoverSettled: ["Cover settled", "cover"], ClaimPaid: ["Claim paid", "cover"], PricePosted: ["Closing price", "cover"],
  Subscribed: ["Note bought", "notes"], CouponDistributed: ["Coupon paid", "notes"], CouponClaimed: ["Coupon claimed", "notes"], Matured: ["Note matured", "notes"],
  MaturityClaimed: ["Redeemed", "notes"], NavUpdated: ["T-bill update", "notes"],
  IdentitySet: ["KYC", "compliance"], Frozen: ["Freeze", "compliance"], CountryBlocked: ["Country rule", "compliance"], ForcedTransfer: ["Forced transfer", "compliance"],
  RiskParams: ["Risk limits", "compliance"], Paused: ["Paused", "compliance"], Unpaused: ["Unpaused", "compliance"],
};
const TONE = { cover: "text-accent border-accent/40", notes: "text-good border-good/40", compliance: "" };

const STEPS = [
  ["Official close is posted", "At expiry, the exchange's official closing price is written on-chain."],
  ["Anyone can settle", "Settlement is open to everyone, so no one can hold a payout back."],
  ["Vault pays, or keeps the premium", "A crash pays the holder from locked money. A calm month leaves the premium with savers."],
];

const FAQ = [
  ["Why is everything public?", "Every action is a contract call, so the chain is the record. This page just reads it and puts it in plain words."],
  ["What are the KYC rows?", "Only verified wallets can hold notes or buy cover. Each verification or revocation by the issuer shows up here."],
  ["Can I check a row myself?", "Yes. Every row links to the transaction on the block explorer."],
];

export default function ActivityPage() {
  const { chainId, deployed } = useActiveChain();
  const api = useApi(`/api/activity?chainId=${chainId}`, { enabled: deployed, refetchInterval: 20_000 });
  const apiEvents = api.data?.events || (Array.isArray(api.data) ? api.data : null);
  const chain = useChainActivity(chainId, deployed && (api.isError || (api.isSuccess && !apiEvents)));
  const events = apiEvents || chain.data || [];
  const nameOf = useSymbolNames();
  const stable = stableSymbol(chainId);
  const [filter, setFilter] = useState("all");
  const kind = (e) => KIND[e.event || e.type] || [e.event || e.type, "other"];
  const shown = events.filter((e) => filter === "all" || kind(e)[1] === filter);
  return (
    <>
      <PageHead
        eyebrow="Activity"
        title="Every payment, in plain sight."
        art={<SettleArt />}
        right={<HeroCtas items={[["See the live feed", "#feed"], ["How settlement works", "#how"]]} />}
      >
        Every policy, note, payout and compliance action is recorded on-chain. Here it is in plain words, newest first.
      </PageHead>

      <HowItWorks title="How a policy settles" steps={STEPS} />

      <Section className="mt-20">
        <DeployGate chainId={chainId}>
          <SectionHead id="feed" eyebrow="Live feed" title="Latest events" right={<Seg value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "cover", label: "Cover" }, { value: "notes", label: "Notes" }, { value: "compliance", label: "Compliance" }]} />} />
          {api.isError && <p className="text-xs text-muted mb-3">Server offline: reading the last ~9,000 blocks directly from the chain.</p>}
          {(api.isLoading || chain.isLoading) && events.length === 0 ? (
            <div className="card h-64 animate-pulse" />
          ) : shown.length === 0 ? (
            <Placeholder title="No events yet">Activity appears as soon as someone subscribes, buys cover or the issuer acts.</Placeholder>
          ) : (
            <div className="card divide-y divide-line">
              {shown.slice(0, 80).map((e, i) => (
                <div key={(e.txHash || e.tx || "") + i} className="px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                  <span className={`chip w-fit shrink-0 sm:w-32 justify-center ${TONE[kind(e)[1]] || ""}`}>{kind(e)[0]}</span>
                  <span className="text-sm flex-1 min-w-0">{describe(e, nameOf, stable)}</span>
                  <span className="shrink-0 flex items-center gap-3 text-xs text-muted">
                    {(e.blockNumber || e.block) && <span>#{e.blockNumber || e.block}</span>}
                    <TxLink hash={e.txHash || e.tx || e.hash} chainId={chainId} />
                  </span>
                </div>
              ))}
            </div>
          )}
        </DeployGate>
      </Section>
      <Faq items={FAQ} />
    </>
  );
}
