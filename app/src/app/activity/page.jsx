"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { parseEventLogs } from "viem";
import { ABI, addr, getDeployment, notesOf } from "@/lib/contracts";
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

/** Plain name of a savings plan from its contract address, e.g. "3-year savings plan". */
function planName(chainId, address) {
  const n = notesOf(chainId).find((x) => address && x.address.toLowerCase() === String(address).toLowerCase());
  if (!n) return "savings plan";
  if (n.termDays) return n.termDays >= 365 ? `${Math.round(n.termDays / 365)}-year savings plan` : `${n.termDays}-day savings plan`;
  if (n.termSeconds) return `${Math.round(n.termSeconds / 3600)}-hour demo savings plan`;
  return "savings plan";
}

function describe(e, stock, chainId) {
  const a = e.args || {};
  const money = (v) => fmtMoney(fromUnits(v));
  const who = (x) => shortAddr(x) || "Someone";
  const price = (sym, v) => { const st = stock(sym); const p = fmtNum(Number(v) / 1e8, 2); return st.currency === "USD" ? `$${p}` : `${p}${st.currency ? ` ${st.currency}` : ""}`; };
  const plan = planName(chainId, e.contract || e.address);
  switch (e.event) {
    case "CoverBought": return `${who(a.holder)} protected ${money(a.notional)} of ${stock(a.symbol).name} for ${money(a.premium)}`;
    case "CoverSettled": {
      const paid = a.payout !== undefined && Number(a.payout) > 0;
      return `Protection on ${stock(a.symbol).name} ended at ${price(a.symbol, a.settlePrice)} (${fmtNum(Number(a.returnBps) / 100, 2)}%): ${paid ? `paid ${money(a.payout)}` : "nothing to pay"}`;
    }
    case "Subscribed": return `${who(a.investor)} put ${money(a.face)} into the ${plan}: ${money(a.floor)} into government bonds, ${money(a.sleeve)} into the pool`;
    case "CouponDistributed": return `Savers earned ${money(a.amount)} from protection fees`;
    case "CouponClaimed": return `${who(a.holder)} collected ${money(a.amount)} of earnings`;
    case "Matured": return `The ${plan} reached its end date: ${money(a.proceeds)} came back from government bonds and the pool`;
    case "MaturityClaimed": return `${who(a.holder)} took back ${money(a.amount)}`;
    case "ForcedTransfer": return `Operator moved ${money(a.amount)} of savings from ${who(a.from)} to ${who(a.to)}`;
    case "IdentitySet": return `ID ${a.verified ? "verified" : "removed"} for ${who(a.account)}${a.country !== undefined ? ` (country ${a.country})` : ""}`;
    case "Frozen": return `Wallet ${who(a.account)} ${a.frozen ? "frozen" : "unfrozen"}`;
    case "CountryBlocked": return `Country ${a.country} ${a.blocked ? "blocked" : "allowed again"}`;
    case "PricePosted": return `Closing price posted: ${stock(a.symbol).name} ${price(a.symbol, a.price)}`;
    case "NavUpdated": return `Government bonds now earn ${fmtNum(Number(a.apyBps) / 100, 2)}% a year; ${money(a.attestedReserve)} confirmed held`;
    case "ClaimPaid": return `The pool paid ${money(a.amount)} to ${who(a.to)}${a.fromPro !== undefined ? ` (${money(a.fromPro)} from Pro investors, ${money(a.fromSenior)} from savers)` : ""}`;
    case "RiskParams": return "Safety rules updated";
    case "Paused": return "Paused for safety: no new protection or savings for now";
    case "Unpaused": return "Running again";
    default: return e.summary || e.event;
  }
}

// Friendly chip + category for each contract event.
const KIND = {
  CoverBought: ["Protected", "cover"], CoverSettled: ["Protection ended", "cover"], ClaimPaid: ["Payout", "cover"], PricePosted: ["Closing price", "cover"],
  Subscribed: ["Saved", "notes"], CouponDistributed: ["Earnings", "notes"], CouponClaimed: ["Earnings collected", "notes"], Matured: ["Plan ended", "notes"],
  MaturityClaimed: ["Money back", "notes"], NavUpdated: ["Bond update", "notes"],
  IdentitySet: ["ID check", "compliance"], Frozen: ["Wallet frozen", "compliance"], CountryBlocked: ["Country rule", "compliance"], ForcedTransfer: ["Operator move", "compliance"],
  RiskParams: ["Safety rules", "compliance"], Paused: ["Paused", "compliance"], Unpaused: ["Running again", "compliance"],
};
const TONE = { cover: "text-accent border-accent/40", notes: "text-good border-good/40", compliance: "" };

const STEPS = [
  { icon: "chart", title: "Closing price posted", body: "On the end date, the stock exchange's closing price is posted.", stat: "One price, no arguments" },
  { icon: "hand", title: "Anyone can trigger payment", body: "It is open to everyone, so no one can hold a payout back.", stat: "No one in the middle" },
  { icon: "check", title: "Paid, or fee kept", body: "A crash pays the stock owner. A calm month leaves the fee with savers.", stat: "Shows up in the list below" },
];

const FAQ = [
  ["Why is everything public?", "Every action is recorded on a public blockchain. This page reads it and puts it in plain words."],
  ["What are the ID check rows?", "Only wallets with a verified ID can save or buy protection. Each check shows up here."],
  ["Can I check a row myself?", "Yes. Every row links to its record on the blockchain explorer."],
];

export default function ActivityPage() {
  const { chainId, deployed } = useActiveChain();
  const api = useApi(`/api/activity?chainId=${chainId}`, { enabled: deployed, refetchInterval: 20_000, timeout: 30_000 });
  const apiEvents = api.data?.events || (Array.isArray(api.data) ? api.data : null);
  const chain = useChainActivity(chainId, deployed && (api.isError || (api.isSuccess && !apiEvents)));
  const events = (apiEvents || chain.data || []).filter((e) => !((e.event || e.type) === "Subscribed" && e.args && e.args.face === undefined));
  const nameOf = useSymbolNames();
  const markets = useApi("/api/markets", { timeout: 30000 });
  const stock = useMemo(() => {
    const info = {};
    (markets.data?.markets || []).forEach((mk) => (mk.symbols || []).forEach((x) => { info[x.symbol] = { name: x.name, currency: x.currency || mk.currency }; }));
    return (id) => { const sym = nameOf(id); return { name: info[sym]?.name || String(sym).split(":").pop(), currency: info[sym]?.currency }; };
  }, [markets.data, nameOf]);
  const [filter, setFilter] = useState("all");
  const kind = (e) => KIND[e.event || e.type] || [e.event || e.type, "other"];
  const shown = events.filter((e) => filter === "all" || kind(e)[1] === filter);
  return (
    <>
      <PageHead
        eyebrow="Activity"
        title="Everything that happened"
        art={<SettleArt />}
        right={<HeroCtas items={[["See the list", "#feed"], ["How payouts work", "#how"]]} />}
      >
        Every protection, saving and payout is recorded in public. Here it is in plain words, newest first.
      </PageHead>

      <HowItWorks title="How a payout happens" steps={STEPS} />

      <Section className="mt-20">
        <DeployGate chainId={chainId}>
          <SectionHead id="feed" eyebrow="Live" title="Newest first" right={<Seg value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "cover", label: "Protection" }, { value: "notes", label: "Savings" }, { value: "compliance", label: "ID and rules" }]} />} />
          {api.isError && <p className="text-xs text-muted mb-3">Our server is not answering, so this shows only the most recent activity, read straight from the blockchain.</p>}
          {(api.isLoading || chain.isLoading) && events.length === 0 ? (
            <div className="card h-64 animate-pulse" />
          ) : shown.length === 0 ? (
            <Placeholder title="Nothing here yet">Protect a stock or start saving, and it shows up here.</Placeholder>
          ) : (
            <div className="card divide-y divide-line">
              {shown.slice(0, 80).map((e, i) => (
                <div key={(e.txHash || e.tx || "") + i} className="px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                  <span className={`chip w-fit shrink-0 sm:w-32 justify-center ${TONE[kind(e)[1]] || ""}`}>{kind(e)[0]}</span>
                  <span className="text-sm flex-1 min-w-0">{describe(e, stock, chainId)}</span>
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
