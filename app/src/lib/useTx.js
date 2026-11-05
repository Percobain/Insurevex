"use client";
import { useCallback, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { useToasts } from "@/components/Toasts";
import { chainMeta } from "./chains";

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

  const run = useCallback(
    async (label, request) => {
      setBusy(label);
      const id = push({ title: label, body: "Confirm in your wallet…" });
      try {
        const hash = await writeContractAsync(request);
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
    [chainId, client, writeContractAsync, push, update, qc],
  );

  return { run, busy };
}
