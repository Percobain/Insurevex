// Schedules the 3Y note's next distributeCoupon() with the Hedera Schedule Service (HIP-1215, system contract 0x16b),
// so coupons run natively on Hedera without an off-chain keeper. Hedera testnet only.
// npx hardhat run scripts/hedera-schedule-coupon.js --network hederaTestnet
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");
const HSS = "0x000000000000000000000000000000000000016b";
const ABI = ["function scheduleCall(address to, uint256 expirySecond, uint256 gasLimit, uint64 value, bytes callData) returns (int64 responseCode, address scheduleAddress)",
  "function hasScheduleCapacity(uint256 expirySecond, uint256 gasLimit) view returns (bool hasCapacity)"];
async function main() {
  if (Number((await ethers.provider.getNetwork()).chainId) !== 296) throw new Error("Hedera testnet only");
  const [me] = await ethers.getSigners();
  if (!me) throw new Error("Configure the Hedera testnet signer in the contracts environment before scheduling");
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", "hederaTestnet.json"), "utf8"));
  const note = await ethers.getContractAt("ProtectedNote", d.contracts.Note3Y);
  const hss = new ethers.Contract(HSS, ABI, me);
  const now = Number((await ethers.provider.getBlock("latest")).timestamp);
  const when = Math.max(Number(await note.lastCoupon()) + Number(await note.couponInterval()) + 120, now + 120);
  const data = note.interface.encodeFunctionData("distributeCoupon");
  const gasLimit = 1_500_000;
  try { console.log("capacity", await hss.hasScheduleCapacity(when, gasLimit)); } catch (e) { console.log("capacity check n/a:", e.shortMessage || e.message); }
  const sim = await hss.scheduleCall.staticCall(d.contracts.Note3Y, when, gasLimit, 0, data, { gasLimit: 2_000_000 });
  console.log("simulated", sim.responseCode.toString(), sim.scheduleAddress);
  if (sim.responseCode !== 22n) throw new Error(`Native schedule preflight refused: response ${sim.responseCode}`);
  if (process.env.DRY === "1") return;
  const r = await (await hss.scheduleCall(d.contracts.Note3Y, when, gasLimit, 0, data, { gasLimit: 2_000_000 })).wait();
  const url = `https://hashscan.io/testnet/transaction/${r.hash}`;
  console.log("scheduled distributeCoupon at", new Date(when * 1000).toISOString(), url);
  const lf = path.join(__dirname, "..", "deployments", "hederaTestnet.lifecycle.json");
  const life = JSON.parse(fs.readFileSync(lf, "utf8"));
  life.push({ step: `Hedera Schedule Service: coupon scheduled for ${new Date(when * 1000).toISOString()}`, tx: r.hash, url, at: new Date().toISOString() });
  fs.writeFileSync(lf, JSON.stringify(life, null, 2));
}
main().catch((e) => { console.error(e.shortMessage || e.message); process.exit(1); });
