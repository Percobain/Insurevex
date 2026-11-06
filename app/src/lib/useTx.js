"use client";
import { useCallback, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { useToasts } from "@/components/Toasts";
import { chainMeta } from "./chains";
import { useDemo, sleep, fakeHash } from "./demo";

function cleanError(e) {
  const m = e?.shortMessage || e?.details || e?.message || String(e);
  const reason = /reverted with the following reason:\s*\n?(.+)/i.exec(m)?.[1] || /reason:\s*(.+)/i.exec(m)?.[1];
  return (reason || m).split("\n")[0].slice(0, 220);
}

/**
 * Sends a contract write, waits for the receipt, toasts every state with an explorer link,
 * and refreshes all wagmi reads afterwards.
 */
export function useTx() {
  const { chainId } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const qc = useQueryClient();
  const { push, update } = useToasts();
  const [busy, setBusy] = useState(null);
  const demo = useDemo();

  const run = useCallback(
    async (label, request) => {
      if (demo) {
        // Demo: play the toasts, send nothing. Approvals are skipped so a purchase is a single step on screen.
        if (request?.functionName === "approve") return { status: "success" };
        setBusy(label);
        const id = push({ title: label, body: "Confirm in your wallet…" });
        await sleep(700);
        const href = chainMeta(chainId || 1874).tx(fakeHash());
        update(id, { body: "Submitted, waiting for confirmation…", href });
        await sleep(900);
        update(id, { state: "success", body: "Confirmed on-chain.", href });
        setBusy(null);
        return { status: "success" };
      }
      setBusy(label);
      const id = push({ title: label, body: "Confirm in your wallet…" });
      try {
        // Hedera's JSON-RPC relay under-estimates gas for calls that touch several contracts (cover, notes, pool),
        // which then fail with INSUFFICIENT_GAS, so give Hedera writes an explicit limit.
        const req = chainId === 296 && request.gas === undefined
          ? { ...request, gas: request.functionName === "approve" ? 120_000n : 1_500_000n }
          : request;
        const hash = await writeContractAsync(req);
        const href = chainMeta(chainId).tx(hash);
        update(id, { body: "Submitted, waiting for confirmation…", href });
        const receipt = await client.waitForTransactionReceipt({ hash, timeout: 180_000 });
        if (receipt.status !== "success") throw new Error("Transaction reverted");
        update(id, { state: "success", body: "Confirmed on-chain.", href });
        qc.invalidateQueries();
        return receipt;
      } catch (e) {
        update(id, { state: "error", body: cleanError(e) });
        return null;
      } finally {
        setBusy(null);
      }
    },
    [chainId, client, writeContractAsync, push, update, qc, demo],
  );

  return { run, busy };
}
