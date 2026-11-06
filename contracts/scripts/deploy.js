// Deploys the InsureVEX suite to one TESTNET and wires every role.
// npx hardhat run scripts/deploy.js --network whitechainSepolia | hederaTestnet | arcTestnet | hardhat
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

const TESTNETS = { 1874: "whitechainSepolia", 296: "hederaTestnet", 5042002: "arcTestnet", 31337: "hardhat" };
// Settlement stablecoin per chain: official test USDT on Whitechain (track rule), native USDC ERC-20 on Arc.
const STABLE = { 1874: "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7", 5042002: "0x3600000000000000000000000000000000000000" };
const DAY = 86400;

async function main() {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  if (!TESTNETS[chainId]) throw new Error(`Refusing to deploy: chain ${chainId} is not an approved testnet`);
  const [deployer] = await ethers.getSigners();
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(`network ${network.name} (${chainId}) deployer ${deployer.address} gas balance ${ethers.formatEther(bal)}`);

  const out = { chainId, network: network.name, deployer: deployer.address, deployedAt: new Date().toISOString(), contracts: {}, notes: [] };
  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const save = () => fs.writeFileSync(file, JSON.stringify(out, null, 2));
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { contracts: {} };
  if (prev.ats) out.ats = prev.ats; // ATS securities (Hedera) outlive suite redeploys

  async function deploy(name, args = [], key = name) {
    if (prev.contracts?.[key] && process.env.REUSE !== "0") {
      out.contracts[key] = prev.contracts[key];
      console.log(`reuse ${key} ${prev.contracts[key]}`);
      return ethers.getContractAt(name, prev.contracts[key]);
    }
    const f = await ethers.getContractFactory(name);
    const c = await f.deploy(...args);
    await c.waitForDeployment();
    out.contracts[key] = await c.getAddress();
    console.log(`${key} ${out.contracts[key]}  tx ${c.deploymentTransaction().hash}`);
    save();
    return c;
  }
  const wait = async (p) => (await p).wait();

  let stableAddr = STABLE[chainId];
  if (!stableAddr) stableAddr = await (await deploy("TestUSD", [], "TestUSD")).getAddress();
  out.contracts.stable = stableAddr;
  out.startBlock = await ethers.provider.getBlockNumber();

  const idr = await deploy("IdentityRegistry", [deployer.address]);
  const oracle = await deploy("PriceOracle", [deployer.address]);
  const tbill = await deploy("TBillVault", [stableAddr, await idr.getAddress(), 420, deployer.address]);
  const pool = await deploy("UnderwritingPool", [stableAddr, await idr.getAddress(), deployer.address]);
  const market = await deploy("CoverMarket", [stableAddr, await idr.getAddress(), await oracle.getAddress(), await pool.getAddress(), deployer.address, deployer.address]);

  // Coupons: monthly in production; hourly on testnets so the lifecycle is visible in a demo.
  const couponInterval = Number(process.env.COUPON_INTERVAL_SECONDS || 3600);
  // Saver notes: the flagship 3-year series and a short demo series that matures during the demo.
  const note3y = await deploy("ProtectedNote", ["InsureVEX 3Y Protected Note", "vx3Y", stableAddr, await idr.getAddress(),
    await tbill.getAddress(), await pool.getAddress(), 90 * DAY, 3 * 365 * DAY, 400, couponInterval, deployer.address], "Note3Y");
  const demoWindow = Number(process.env.DEMO_WINDOW_SECONDS || 2 * 3600);
  const demoTerm = Number(process.env.DEMO_TERM_SECONDS || 3 * 3600);
  const noteDemo = await deploy("ProtectedNote", ["InsureVEX Demo Note (3h)", "vxDEMO", stableAddr, await idr.getAddress(),
    await tbill.getAddress(), await pool.getAddress(), demoWindow, demoTerm, 400, 600, deployer.address], "NoteDemo");
  out.notes = [
    { key: "Note3Y", address: out.contracts.Note3Y, name: "InsureVEX 3Y Protected Note", termDays: 1095, floorRateBps: 400, subscriptionWindow: 90 * DAY, couponInterval },
    { key: "NoteDemo", address: out.contracts.NoteDemo, name: "InsureVEX Demo Note (3h)", termSeconds: demoTerm, floorRateBps: 400, subscriptionWindow: demoWindow, couponInterval: 600 },
  ];
  save();

  // ---- wiring (idempotent)
  const sys = [tbill, pool, market, note3y, noteDemo];
  for (const c of sys) {
    const a = await c.getAddress();
    if (!(await idr.isSystem(a))) await wait(idr.setSystem(a, true));
  }
  const MARKET_ROLE = await pool.MARKET_ROLE();
  if (!(await pool.hasRole(MARKET_ROLE, await market.getAddress()))) await wait(pool.grantRole(MARKET_ROLE, await market.getAddress()));
  if ((await pool.tbill()) === ethers.ZeroAddress) await wait(pool.setTBill(await tbill.getAddress()));
  const kycUntil = Math.floor(Date.now() / 1000) + 365 * DAY;
  const id = await idr.identities(deployer.address);
  if (!id.verified) await wait(idr.setIdentity(deployer.address, true, 840, kycUntil)); // demo issuer/investor account
  console.log("wired. saved", file);
  save();
}

main().catch((e) => { console.error(e); process.exit(1); });
