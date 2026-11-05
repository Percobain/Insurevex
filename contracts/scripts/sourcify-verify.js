// Verifies every deployed contract on Sourcify (API v2) using Hardhat's standard-JSON build info.
// Sourcify supports Hedera testnet (296, shown on HashScan), Arc testnet (5042002) and Whitechain Sepolia (1874).
// npx hardhat run scripts/sourcify-verify.js --network hederaTestnet
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const API = "https://sourcify.dev/server";
const SRC = {
  TestUSD: "contracts/mocks/TestUSD.sol:TestUSD", IdentityRegistry: "contracts/compliance/IdentityRegistry.sol:IdentityRegistry",
  PriceOracle: "contracts/oracle/PriceOracle.sol:PriceOracle", TBillVault: "contracts/rwa/TBillVault.sol:TBillVault",
  UnderwritingPool: "contracts/core/UnderwritingPool.sol:UnderwritingPool", CoverMarket: "contracts/core/CoverMarket.sol:CoverMarket",
  Note3Y: "contracts/core/ProtectedNote.sol:ProtectedNote", NoteDemo: "contracts/core/ProtectedNote.sol:ProtectedNote",
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const chainId = Number((await hre.ethers.provider.getNetwork()).chainId);
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", `${hre.network.name}.json`), "utf8"));
  const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
  for (const [key, fq] of Object.entries(SRC)) {
    const address = d.contracts[key];
    if (!address || (only && !only.includes(key))) continue;
    const status = await fetch(`${API}/v2/contract/${chainId}/${address}`).then((r) => r.json()).catch(() => ({}));
    if (status.match) { console.log(`already verified ${key} ${address} (${status.match})`); continue; }
    const bi = await hre.artifacts.getBuildInfo(fq);
    const body = { stdJsonInput: bi.input, compilerVersion: bi.solcLongVersion, contractIdentifier: fq };
    const res = await fetch(`${API}/v2/verify/${chainId}/${address}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!j.verificationId) { console.log(`FAILED submit ${key}: ${res.status} ${JSON.stringify(j).slice(0, 200)}`); continue; }
    let out;
    for (let i = 0; i < 40; i++) {
      await sleep(3000);
      out = await fetch(`${API}/v2/verify/${j.verificationId}`).then((r) => r.json());
      if (out.isJobCompleted) break;
    }
    if (out?.contract?.match) console.log(`verified ${key} ${address} (${out.contract.match})`);
    else console.log(`FAILED ${key}: ${JSON.stringify(out?.error || out).slice(0, 300)}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
