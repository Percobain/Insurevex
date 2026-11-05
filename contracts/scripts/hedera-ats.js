// Hedera Asset Tokenization Studio (ATS) integration, Hedera TESTNET only.
//  1. Issues a tokenised equity through the ATS Factory (ERC-1400 / ERC-3643-style: KYC, freeze, controller, pause).
//     InsureVEX's CoverMarket reads the holder's ATS balance on-chain as proof of insurable interest.
//  2. Issues the InsureVEX Protected Note as an ATS bond (ISIN, maturity, coupons via setCoupon).
//  3. Lifecycle: SSI issuer + KYC grant, issue units, register the equity on CoverMarket, schedule a coupon.
// DRY=1 only estimates gas (free) to validate the encoding against the live factory.
// npx hardhat run scripts/hedera-ats.js --network hederaTestnet
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

const FACTORY = "0xd1F118A40f3b02883D35909eF2517e7EDd78379d";
const BLR = "0xBA2D5FC2083A0b8f164c50e65d782087fBA18E0a";
const CONFIG = { equity: ethers.zeroPadValue("0x01", 32), bond: ethers.zeroPadValue("0x02", 32) };
const ROLE = {
  ADMIN: ethers.ZeroHash,
  ISSUER: "0x5eeaf5602c75bf26e73b5206d0bd6ee82f621166255e5fd73cc06bc7bd84a95f",
  KYC: "0x754f499f9fdfbb089d12bdec817a6863d593d8a3ea7f546c00a5cafd20957bfc",
  SSI_MANAGER: "0x3120494a82251fe85b0403877539486dbfcf0f94c20741a3229cfad31f625ee1",
  CORPORATE_ACTION: "0xa1acfc499025c99f55059195e6276f639d34a18aad7b8121b9192b7f438c55cd",
  FREEZE_MANAGER: "0x71ae38482e1ab1c28e767d64766d686215b490c8c1bd7dfe6b101525187c2155",
  CONTROLLER: "0xb4d2b850c3ed8a234d390d5c157bbb1824883213c335ffe2a0f0761bb168713e",
  PAUSER: "0x3cb8b459fdb6e7dc3d2a2aa529e530f885d45e03584adb438423209c86a2731f",
};
const ATS_ABI = [
  "function addIssuer(address _issuer) returns (bool)",
  "function grantKyc(address _account, string _vcId, uint256 _validFrom, uint256 _validTo, address _issuer) returns (bool)",
  "function issue(address _tokenHolder, uint256 _value, bytes _data)",
  "function balanceOf(address) view returns (uint256)",
  "function name() view returns (string)",
  "function freezePartialTokens(address _userAddress, uint256 _amount)",
  "function setCoupon((uint256 recordDate,uint256 executionDate,uint256 startDate,uint256 endDate,uint256 fixingDate,uint256 rate,uint8 rateDecimals,uint8 rateStatus) _newCoupon) returns (uint256)",
];

// ISIN check digit (ISO 6166): letters -> numbers, then Luhn.
function isin(prefix9) {
  const body = prefix9.toUpperCase();
  const digits = body.split("").map((ch) => (/[0-9]/.test(ch) ? ch : String(ch.charCodeAt(0) - 55))).join("");
  let sum = 0;
  const rev = digits.split("").reverse();
  for (let i = 0; i < rev.length; i++) {
    let d = Number(rev[i]);
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return body + String((10 - (sum % 10)) % 10);
}

function security(me, name, symbol, isinCode, configKey, decimals, maxSupply) {
  return {
    resolver: BLR, maxSupply, resolverProxyConfiguration: { key: configKey, version: 1 },
    erc20MetadataInfo: { name, symbol, isin: isinCode, decimals },
    rbacs: Object.values(ROLE).map((role) => ({ role, members: [me] })),
    externalPauses: [], externalControlLists: [], externalKycLists: [],
    compliance: ethers.ZeroAddress, identityRegistry: ethers.ZeroAddress,
    arePartitionsProtected: false, isMultiPartition: false, isControllable: true, isWhiteList: false,
    clearingActive: false, internalKycActivated: true, erc20VotesActivated: false,
  };
}

async function main() {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  if (chainId !== 296) throw new Error("Hedera testnet only");
  const [me] = await ethers.getSigners();
  const dry = process.env.DRY === "1";
  const file = path.join(__dirname, "..", "deployments", "hederaTestnet.json");
  const dep = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { contracts: {}, ats: {} };
  dep.ats ||= {};
  const lifeFile = path.join(__dirname, "..", "deployments", "hederaTestnet.lifecycle.json");
  const life = fs.existsSync(lifeFile) ? JSON.parse(fs.readFileSync(lifeFile, "utf8")) : [];
  const rec = async (step, p) => {
    const r = await (await p).wait();
    life.push({ step, tx: r.hash, url: `https://hashscan.io/testnet/transaction/${r.hash}`, at: new Date().toISOString() });
    fs.writeFileSync(lifeFile, JSON.stringify(life, null, 2));
    console.log(step.padEnd(44), `https://hashscan.io/testnet/transaction/${r.hash}`);
    return r;
  };
  const factory = await ethers.getContractAt("IATSFactory", FACTORY);
  const now = Math.floor(Date.now() / 1000);
  const reg = { regulationType: 1, regulationSubType: 0, additionalSecurityData: { countriesControlListType: true, listOfCountries: "", info: "InsureVEX testnet (no real securities)" } };

  const equityData = {
    security: security(me.address, "InsureVEX Tokenised NVIDIA (testnet)", "vxNVDA", "US67066G1040", CONFIG.equity, 6, 1_000_000n * 10n ** 6n),
    equityDetails: { votingRight: true, informationRight: true, liquidationRight: true, subscriptionRight: false, conversionRight: false,
      redemptionRight: false, putRight: false, dividendRight: 2, currency: "0x555344", nominalValue: 1n, nominalValueDecimals: 2 },
  };
  const maturity = now + 3 * 365 * 86400;
  const bondData = {
    security: security(me.address, "InsureVEX 3Y Protected Note (ATS bond)", "vx3Y", (process.env.BOND_ISIN || isin("XS0INSVEX03")), CONFIG.bond, 6, 10_000_000n * 10n ** 6n),
    bondDetails: { currency: "0x555344", nominalValue: 100n, nominalValueDecimals: 2, startingDate: now + 300, maturityDate: maturity },
    proceedRecipients: [], proceedRecipientsData: [],
  };

  if (dry) {
    for (const [n, fn] of [["deployEquity", () => factory.deployEquity.estimateGas(equityData, reg)], ["deployBond", () => factory.deployBond.estimateGas(bondData, reg)]]) {
      try { console.log(n, "estimateGas", (await fn()).toString()); } catch (e) { console.log(n, "estimate failed:", e.shortMessage || e.message); }
    }
    return;
  }

  const deployVia = async (kind, data, key) => {
    if (dep.ats[key]) return dep.ats[key];
    const fn = kind === "equity" ? factory.deployEquity : factory.deployBond;
    const r = await rec(`ATS Factory.deploy${kind === "equity" ? "Equity" : "Bond"} (${key})`, fn(data, reg, { gasLimit: 9_000_000 }));
    const ev = r.logs.map((l) => { try { return factory.interface.parseLog(l); } catch { return null; } }).find((x) => x && /Deployed$/.test(x.name));
    dep.ats[key] = ev.args[1];
    fs.writeFileSync(file, JSON.stringify(dep, null, 2));
    console.log(`  ${key} =`, dep.ats[key]);
    return dep.ats[key];
  };

  const which = (process.env.ATS || "equity,bond").split(",");
  if (which.includes("equity")) {
    const eq = new ethers.Contract(await deployVia("equity", equityData, "equityNVDA"), ATS_ABI, me);
    await rec("ATS equity: addIssuer (SSI)", eq.addIssuer(me.address));
    await rec("ATS equity: grantKyc to holder", eq.grantKyc(me.address, "vc-insurevex-demo-1", now, now + 365 * 86400, me.address));
    await rec("ATS equity: issue 100 vxNVDA to holder", eq.issue(me.address, 100n * 10n ** 6n, "0x"));
    if (dep.contracts?.CoverMarket) {
      const market = await ethers.getContractAt("CoverMarket", dep.contracts.CoverMarket);
      await rec("CoverMarket.setSymbolToken(NASDAQ:NVDA -> ATS equity)", market.setSymbolToken(ethers.id("NASDAQ:NVDA"), await eq.getAddress()));
    }
  }
  if (which.includes("bond")) {
    const bd = new ethers.Contract(await deployVia("bond", bondData, "noteBond3Y"), ATS_ABI, me);
    await rec("ATS bond: addIssuer (SSI)", bd.addIssuer(me.address));
    await rec("ATS bond: grantKyc to saver", bd.grantKyc(me.address, "vc-insurevex-demo-2", now, now + 365 * 86400, me.address));
    await rec("ATS bond: issue 1,000 note units", bd.issue(me.address, 1000n * 10n ** 6n, "0x"));
    const t = Math.floor(Date.now() / 1000);
    await rec("ATS bond: setCoupon (underwriting coupon)", bd.setCoupon({ recordDate: t + 600, executionDate: t + 900, startDate: t, endDate: t + 30 * 86400,
      fixingDate: t + 600, rate: 4500, rateDecimals: 5, rateStatus: 1 }));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
