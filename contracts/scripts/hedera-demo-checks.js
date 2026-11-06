// Hedera demo checks for the video: (1) CoverMarket refuses cover larger than the holder's ATS equity balance (read
// on-chain), (2) an ATS compliance lifecycle op: freeze part of the holder's tokenised shares. Hedera testnet only.
// SERVER=http://localhost:8080 npx hardhat run scripts/hedera-demo-checks.js --network hederaTestnet
const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");
const SERVER = process.env.SERVER || "http://localhost:8080";

async function main() {
  if (Number((await ethers.provider.getNetwork()).chainId) !== 296) throw new Error("Hedera testnet only");
  const [me] = await ethers.getSigners();
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", "hederaTestnet.json"), "utf8"));
  const lf = path.join(__dirname, "..", "deployments", "hederaTestnet.lifecycle.json");
  const life = JSON.parse(fs.readFileSync(lf, "utf8"));
  const market = await ethers.getContractAt("CoverMarket", d.contracts.CoverMarket);
  const equity = new ethers.Contract(d.ats.equityNVDA, ["function balanceOf(address) view returns (uint256)", "function freezePartialTokens(address,uint256)",
    "function getFrozenTokens(address) view returns (uint256)"], me);
  const bal = await equity.balanceOf(me.address);
  console.log("holder's ATS vxNVDA balance:", ethers.formatEther(bal));

  // 1) ask for cover on 150 shares while holding 100: the signed quote is valid, the contract still refuses
  const qs = new URLSearchParams({ chainId: "296", buyer: me.address, symbol: "NASDAQ:NVDA", notional: "100", shares: "150", heldShares: "150", deductibleBps: "1500", capBps: "2000", tenorDays: "7" });
  const q = await (await fetch(`${SERVER}/api/quote?${qs}`)).json();
  if (!q.ok) throw new Error("quote refused: " + (q.pricing?.reason || q.error));
  try {
    await market.buyCover.staticCall(q.quote, q.signature, { gasLimit: 1_500_000 });
    console.log("UNEXPECTED: oversized cover accepted");
  } catch (e) {
    const reason = e.reason || e.shortMessage || e.message;
    console.log("oversized cover refused on-chain:", reason);
    life.push({ step: `CoverMarket refuses cover on 150 NVDA when the ATS balance is ${ethers.formatEther(bal)} (${reason})`, tx: null, url: null, at: new Date().toISOString() });
  }

  // 2) ATS compliance: freeze 10 of the holder's tokenised shares
  const r = await (await equity.freezePartialTokens(me.address, ethers.parseEther("10"), { gasLimit: 1_500_000 })).wait();
  const url = `https://hashscan.io/testnet/transaction/${r.hash}`;
  console.log("ATS freezePartialTokens(10 vxNVDA)", url);
  life.push({ step: "ATS equity: freeze 10 vxNVDA (compliance lifecycle op)", tx: r.hash, url, at: new Date().toISOString() });
  fs.writeFileSync(lf, JSON.stringify(life, null, 2));
}
main().catch((e) => { console.error(e.shortMessage || e.message); process.exit(1); });
