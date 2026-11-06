// One-time provisioning uses the issuer key. The runtime agent receives no issuer privileges.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import { Client, PrivateKey, AccountCreateTransaction, TopicCreateTransaction, Hbar } from "@hiero-ledger/sdk";
import { chain } from "../src/chain.js";
import { confirmedReceipt } from "../src/receipts.js";
import { DEFAULT_LIMITS, CHAIN_ID, NETWORK, insist, hashscan } from "../src/agent/policy.js";
import { FACILITATOR, FEE_PAYER } from "../src/agent/merchant.js";

const root = path.resolve(process.env.AGENT_STATE_DIR || ".agent-state");
fs.mkdirSync(root, { recursive: true, mode: 0o700 });
const file = path.join(root, "credentials.json");
const policyFile = path.join(root, "policy.json");
let client;
try {
  const c = chain(CHAIN_ID);
  insist(c?.signer && Number(BigInt(await c.provider.send("eth_chainId", []))) === CHAIN_ID, "Configured Hedera testnet issuer required");
  const response = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/accounts/${c.address}`, { signal: AbortSignal.timeout(15000) });
  insist(response.ok, "Cannot resolve testnet issuer account");
  const operator = await response.json();
  insist(operator.account && operator.key?._type === "ECDSA_SECP256K1", "ECDSA issuer account required");
  client = Client.forTestnet().setOperator(operator.account, PrivateKey.fromStringECDSA(c.signer.privateKey.slice(2)));
  client.setDefaultMaxTransactionFee(new Hbar(0.5));
  let credentials;
  if (fs.existsSync(file)) credentials = JSON.parse(fs.readFileSync(file));
  else {
    const key = PrivateKey.generateECDSA();
    // Persist the new key before any network operation. Never print it or put it in public evidence.
    credentials = { accountId: null, privateKey: `0x${key.toStringRaw()}` };
    fs.writeFileSync(file, JSON.stringify(credentials), { flag: "wx", mode: 0o600 });
  }
  const agentKey = PrivateKey.fromStringECDSA(credentials.privateKey.slice(2));
  if (!credentials.accountId) {
    const tx = await new AccountCreateTransaction().setECDSAKeyWithAlias(agentKey.publicKey)
      .setInitialBalance(new Hbar(3)).setMaxTransactionFee(new Hbar(2)).execute(client);
    const receipt = await tx.getReceipt(client);
    credentials.accountId = receipt.accountId.toString();
    fs.writeFileSync(file, JSON.stringify(credentials), { mode: 0o600 });
    console.log("Isolated agent funded with 3 test HBAR:", hashscan(tx.transactionId.toString()));
  }
  const wallet = new ethers.Wallet(credentials.privateKey);
  insist(wallet.address !== c.address, "Agent/issuer separation failed");
  const expiry = Math.floor(Date.now() / 1000) + 30 * 86400;
  const record = async (label, pending) => {
    const tx = await pending;
    const receipt = await confirmedReceipt(c.provider, tx.hash);
    insist(receipt.status === 1, `${label} failed`);
    console.log(label, hashscan(tx.hash));
  };
  if (!(await c.identity.isVerified(wallet.address))) await record("Demo KYC (testnet only)", c.identity.setIdentity(wallet.address, true, 356, expiry, { gasLimit: 300000 }));
  const equity = new ethers.Contract(c.dep.ats.equityNVDA, [
    "function grantKyc(address,string,uint256,uint256,address) returns (bool)",
    "function issue(address,uint256,bytes)", "function balanceOf(address) view returns (uint256)",
  ], c.signer);
  if (await equity.balanceOf(wallet.address) < ethers.parseEther("1")) {
    await record("ATS demo KYC", equity.grantKyc(wallet.address, "insurevex-agent-testnet", 0, expiry, c.address, { gasLimit: 1000000 }));
    await record("Issue 1 test NVDA share", equity.issue(wallet.address, ethers.parseEther("1"), "0x", { gasLimit: 1500000 }));
  }
  if (await c.stable.balanceOf(wallet.address) < 10000000n) await record("Fund 10 test USD", c.stable.transfer(wallet.address, 10000000n, { gasLimit: 300000 }));
  let policy = fs.existsSync(policyFile) ? JSON.parse(fs.readFileSync(policyFile)) : null;
  if (!policy?.hcsTopic) {
    const tx = await new TopicCreateTransaction().setTopicMemo("InsureVEX testnet agent spending audit")
      .setSubmitKey(agentKey.publicKey).setMaxTransactionFee(new Hbar(0.5)).execute(client);
    const receipt = await tx.getReceipt(client);
    policy = { ...policy, hcsTopic: receipt.topicId.toString() };
    console.log("Restricted agent audit topic:", policy.hcsTopic);
  }
  policy = { ...policy, chainId: CHAIN_ID, network: NETWORK, origin: process.env.X402_PUBLIC_ORIGIN || "http://localhost:8080",
    merchant: operator.account, facilitator: FACILITATOR, feePayer: FEE_PAYER,
    market: c.dep.contracts.CoverMarket, stable: c.dep.contracts.stable, equity: c.dep.ats.equityNVDA,
    identity: c.dep.contracts.IdentityRegistry, pool: c.dep.contracts.UnderwritingPool,
    limits: DEFAULT_LIMITS, killFile: path.join(root, "STOP") };
  fs.writeFileSync(policyFile, JSON.stringify(policy, null, 2), { mode: 0o600 });
  console.log("Provisioning complete. Start the merchant with:");
  console.log(`X402_ENABLED=1 X402_MERCHANT_ACCOUNT=${operator.account} KEEPER=0 npm start`);
  console.log("Then: npm run agent:plan && npm run agent:run");
} catch (e) {
  console.error("Provisioning stopped:", e.shortMessage || e.message);
  process.exitCode = 1;
} finally { client?.close(); }
