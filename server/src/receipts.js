// Poll a known transaction hash through the same bounded RPC failover transport.
// Some testnet relays do not support the event/filter subscriptions used by tx.wait().
// This only retries reads: it never resubmits, replaces or signs a transaction.
export async function confirmedReceipt(provider, hash, { timeoutMs = 90000, pollMs = 1500, confirmations = 1 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const receipt = await provider.getTransactionReceipt(hash);
      if (receipt && (confirmations <= 1 || (await provider.getBlockNumber()) - receipt.blockNumber + 1 >= confirmations)) return receipt;
    } catch (e) {
      // Only receipt-read availability is retried. A mined revert is returned to the caller.
      if (e.code === "INVALID_ARGUMENT") throw e;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, Math.max(0, deadline - Date.now()))));
  }
  throw new Error(`Receipt unavailable for ${hash}; reconcile this hash before any retry`);
}
