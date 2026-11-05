// Verifies every deployed contract on the network's explorer (Blockscout for Whitechain/Arc, Sourcify for Hedera/HashScan).
// npx hardhat run scripts/verify.js --network whitechainSepolia
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const DAY = 86400;
async function main() {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", `${hre.network.name}.json`), "utf8"));
  const c = d.contracts;
  const me = d.deployer;
  const demoTerm = d.notes.find((n) => n.key === "NoteDemo")?.termSeconds || 7200;
  const jobs = [
    ["IdentityRegistry", c.IdentityRegistry, [me]],
    ["PriceOracle", c.PriceOracle, [me]],
    ["TBillVault", c.TBillVault, [c.stable, c.IdentityRegistry, 420, me]],
    ["UnderwritingPool", c.UnderwritingPool, [c.stable, c.IdentityRegistry, me]],
    ["CoverMarket", c.CoverMarket, [c.stable, c.IdentityRegistry, c.PriceOracle, c.UnderwritingPool, me, me]],
    ["ProtectedNote", c.Note3Y, ["InsureVEX 3Y Protected Note", "vx3Y", c.stable, c.IdentityRegistry, c.TBillVault, c.UnderwritingPool, 90, 3 * 365 * DAY, 400, 30 * DAY, me]],
    ["ProtectedNote", c.NoteDemo, ["InsureVEX Demo Note (2h)", "vxDEMO", c.stable, c.IdentityRegistry, c.TBillVault, c.UnderwritingPool, 0, demoTerm, 400, 600, me]],
  ];
  if (c.TestUSD) jobs.unshift(["TestUSD", c.TestUSD, []]);
  for (const [name, address, args] of jobs) {
    if (!address) continue;
    try {
      await hre.run("verify:verify", { address, constructorArguments: args });
      console.log("verified", name, address);
    } catch (e) {
      const m = String(e.message || e);
      console.log(/already verified/i.test(m) ? `already verified ${name} ${address}` : `FAILED ${name} ${address}: ${m.slice(0, 300)}`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
