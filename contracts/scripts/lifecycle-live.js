// Runs the InsureVEX lifecycle on a live testnet with the chain's real test stablecoin, through the running server's
// quoter. Every tx hash is appended to deployments/<network>.lifecycle.json (used in the README).
// SERVER=http://localhost:8091 npx hardhat run scripts/lifecycle-live.js --network whitechainSepolia
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

const SERVER = process.env.SERVER || "http://localhost:8080";
const STEPS = (process.env.STEPS || "risk,subscribe3y,subscribeDemo,pro,cover,tbill").split(",");

async function main() {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  if (![1874, 296, 5042002].includes(chainId)) throw new Error("testnets only");
  const [me] = await ethers.getSigners();
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", `${network.name}.json`), "utf8"));
  const c = d.contracts;
  const logFile = path.join(__dirname, "..", "deployments", `${network.name}.lifecycle.json`);
  const log = fs.existsSync(logFile) ? JSON.parse(fs.readFileSync(logFile, "utf8")) : [];
  const explorer = { 1874: "https://explorer.testnet.whitechain.io/tx/", 296: "https://hashscan.io/testnet/transaction/", 5042002: "https://testnet.arcscan.app/tx/" }[chainId];
  const rec = async (step, p) => {
    const tx = await p; const r = await tx.wait();
    log.push({ step, tx: r.hash, url: explorer + r.hash, at: new Date().toISOString() });
    fs.writeFileSync(logFile, JSON.stringify(log, null, 2));
    console.log(step.padEnd(42), explorer + r.hash);
    return r;
  };

  const usd = await ethers.getContractAt("TestUSD", c.stable); // ERC-20 surface only
  const pool = await ethers.getContractAt("UnderwritingPool", c.UnderwritingPool);
  const note3 = await ethers.getContractAt("ProtectedNote", c.Note3Y);
  const noteD = await ethers.getContractAt("ProtectedNote", c.NoteDemo);
  const market = await ethers.getContractAt("CoverMarket", c.CoverMarket);
  const tbill = await ethers.getContractAt("TBillVault", c.TBillVault);
  const U = (x) => ethers.parseUnits(String(x), 6);
  console.log("stable balance", ethers.formatUnits(await usd.balanceOf(me.address), 6));

  if (STEPS.includes("risk") && (await pool.symbolCapBps()) !== 2500n)
    await rec("pool.setRiskParams(R=50%, m=25%) testnet depth", pool.setRiskParams(5000, 2500, 5000, 4000));

  if (STEPS.includes("subscribe3y")) {
    const amt = U(process.env.SUB3Y || 50);
    await rec("USDT approve -> 3Y note", usd.approve(c.Note3Y, amt));
    await rec(`Saver subscribes ${ethers.formatUnits(amt, 6)} USDT to 3Y note`, note3.subscribe(amt));
  }
  if (STEPS.includes("subscribeDemo")) {
    const amt = U(process.env.SUBDEMO || 15);
    await rec("USDT approve -> demo note", usd.approve(c.NoteDemo, amt));
    await rec(`Saver subscribes ${ethers.formatUnits(amt, 6)} USDT to 3h demo note`, noteD.subscribe(amt));
  }

  if (STEPS.includes("pro")) {
    const amt = U(process.env.PRO || 8);
    await rec("USDT approve -> pool (Pro LP)", usd.approve(c.UnderwritingPool, amt));
    await rec(`Pro LP deposits ${ethers.formatUnits(amt, 6)} USDT first-loss capital`, pool.depositPro(amt));
  }

  if (STEPS.includes("cover")) {
    const covers = process.env.COVERS ? JSON.parse(process.env.COVERS) : [
      { symbol: "NASDAQ:NVDA", notional: 2, tenorDays: 28, deductibleBps: 1000 },
      { symbol: "NYSEARCA:SPY", notional: 2, tenorMinutes: 10, deductibleBps: 500 },
    ];
    for (const cv of covers) {
      const qs = new URLSearchParams({ chainId: String(chainId), buyer: me.address, symbol: cv.symbol, notional: String(cv.notional),
        deductibleBps: String(cv.deductibleBps), capBps: "2000", ...(cv.tenorDays ? { tenorDays: String(cv.tenorDays) } : { tenorMinutes: String(cv.tenorMinutes) }) });
      const q = await (await fetch(`${SERVER}/api/quote?${qs}`)).json();
      if (!q.ok) { console.log("quote refused", cv.symbol, q.pricing?.reason || q.error); continue; }
      await rec(`USDT approve premium (${cv.symbol})`, usd.approve(c.CoverMarket, BigInt(q.quote.premium)));
      await rec(`Holder buys ${cv.symbol} floor, premium ${q.premium} USDT`, market.buyCover(q.quote, q.signature));
    }
  }

  if (STEPS.includes("tbill")) {
    await rec("USDT approve -> T-bill custodian proceeds", usd.approve(c.TBillVault, U(1)));
    await rec("T-bill vault: custodian funds yield", tbill.fundYield(U(1)));
    await rec("T-bill NAV update + reserve attestation", tbill.updateNav(420, await tbill.totalAssets()));
  }
  console.log("pool", { totalAssets: ethers.formatUnits(await pool.totalAssets(), 6), locked: ethers.formatUnits(await pool.locked(), 6), capacity: ethers.formatUnits(await pool.capacity(), 6) });
}
main().catch((e) => { console.error(e); process.exit(1); });
