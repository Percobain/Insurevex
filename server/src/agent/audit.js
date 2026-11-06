import { hash } from "./policy.js";

export function audit(state, event, data) {
  return state.transaction(() => {
    const previous = state.db.prepare("SELECT digest FROM audit ORDER BY seq DESC LIMIT 1").get()?.digest || "genesis";
    const at = new Date().toISOString();
    const digest = hash({ at, event, data, previous });
    state.db.prepare("INSERT INTO audit(at,event,data,previous,digest) VALUES (?,?,?,?,?)").run(at, event, JSON.stringify(data), previous, digest);
    return digest;
  });
}

export async function anchorHcs(client, topicId, digest) {
  // Only hashes go on a public topic; no private keys, holdings, or identity data.
  const { TopicMessageSubmitTransaction, Hbar } = await import("@hiero-ledger/sdk");
  const response = await new TopicMessageSubmitTransaction().setTopicId(topicId)
    .setMessage(JSON.stringify({ app: "InsureVEX", version: 1, digest }))
    .setMaxTransactionFee(new Hbar(0.1)).execute(client);
  await response.getReceipt(client);
  return response.transactionId.toString();
}
