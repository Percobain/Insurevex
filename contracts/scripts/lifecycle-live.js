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
  const explorer = { 1874: "https://explorer.testnet.whitechain.io/tx/", 296: "https://hashscan.io/testnet/transaction/", 5042002: "https://explorer.testnet.arc.io/tx/" }[chainId];
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
  // Hedera's relay under-estimates gas for calls that hop through several contracts: use an explicit limit there.
  const O = chainId === 296 ? { gasLimit: Number(process.env.HEDERA_GAS || 1_500_000) } : {};
  const SYMB = await usd.symbol();
  console.log("stable balance", ethers.formatUnits(await usd.balanceOf(me.address), 6), SYMB);

  if (STEPS.includes("risk") && (await pool.symbolCapBps()) !== 2500n)
    await rec("pool.setRiskParams(R=50%, m=25%) testnet depth", pool.setRiskParams(5000, 2500, 5000, 4000, O));

  if (STEPS.includes("subscribe3y")) {
    const amt = U(process.env.SUB3Y || 50);
    await rec(`${SYMB} approve -> 3Y note`, usd.approve(c.Note3Y, amt, O));
    await rec(`Saver subscribes ${ethers.formatUnits(amt, 6)} ${SYMB} to 3Y note`, note3.subscribe(amt, O));
  }
  if (STEPS.includes("subscribeDemo")) {
    const amt = U(process.env.SUBDEMO || 15);
    await rec(`${SYMB} approve -> demo note`, usd.approve(c.NoteDemo, amt, O));
    await rec(`Saver subscribes ${ethers.formatUnits(amt, 6)} ${SYMB} to 3h demo note`, noteD.subscribe(amt, O));
  }

  if (STEPS.includes("pro")) {
    const amt = U(process.env.PRO || 8);
    await rec(`${SYMB} approve -> pool (Pro LP)`, usd.approve(c.UnderwritingPool, amt, O));
    await rec(`Pro LP deposits ${ethers.formatUnits(amt, 6)} ${SYMB} first-loss capital`, pool.depositPro(amt, O));
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
      await rec(`${SYMB} approve premium (${cv.symbol})`, usd.approve(c.CoverMarket, BigInt(q.quote.premium), O));
      await rec(`Holder buys ${cv.symbol} floor, premium ${q.premium} ${SYMB}`, market.buyCover(q.quote, q.signature, O));
    }
  }

  if (STEPS.includes("tbill")) {
    await rec(`${SYMB} approve -> T-bill custodian proceeds`, usd.approve(c.TBillVault, U(1), O));
    await rec("T-bill vault: custodian funds yield", tbill.fundYield(U(1), O));
    await rec("T-bill NAV update + reserve attestation", tbill.updateNav(420, await tbill.totalAssets(), O));
  }
  if (STEPS.includes("claim")) {
    for (const [label, n] of [["3Y note", note3], ["demo note", noteD]]) {
      if ((await n.pendingCoupon(me.address)) > 0n) await rec(`Saver claims ${SYMB} coupon (${label})`, n.claimCoupon(O));
      else console.log("no coupon pending on", label);
    }
  }
  if (STEPS.includes("redeem")) {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    if (now < Number(await noteD.maturity())) console.log("demo note not matured yet; maturity", new Date(Number(await noteD.maturity()) * 1000).toISOString());
    else {
      if (!(await noteD.matured())) await rec("Demo note matures (T-bill floor + sleeve pulled back)", noteD.mature(O));
      // read the paid amount from the note's MaturityClaimed event (a balance delta would include gas on Arc, where USDC is the gas token)
      const rr = await rec(`Saver redeems demo note: face + sleeve in ${SYMB}`, noteD.redeem(O));
      const ev = rr.logs.map((l) => { try { return noteD.interface.parseLog(l); } catch { return null; } }).find((x) => x && x.name === "MaturityClaimed");
      console.log("redeemed", ethers.formatUnits(ev.args.amount, 6), SYMB);
    }
  }
  console.log("pool", { totalAssets: ethers.formatUnits(await pool.totalAssets(), 6), locked: ethers.formatUnits(await pool.locked(), 6), capacity: ethers.formatUnits(await pool.capacity(), 6) });
}
main().catch((e) => { console.error(e); process.exit(1); });
