// InsureVEX stress run: a separate suite on a testnet, settled in a TEST-ONLY dollar (StressUSD) so the book can be
// sized in billions. Eight wallets (W1..W3 from hidden.txt, G1..G5 generated) play Savers, a Pro LP and Holders on
// 27 stocks across 9 markets, defined in stress/book.json and backtested first by backtest/stress_book.py.
//
// Two rounds, each a full lifecycle: covers priced by the live engine (today's prices and volatility, 1-week product
// terms) -> premiums booked -> expiry -> oracle posts the replayed close -> settlement -> waterfall -> coupons.
//   round "calm":  the oracle replays each stock's real return in the backtest's median week for this book
//   round "crash": the oracle replays the book's worst week in 21 years (21-28 Feb 2020, COVID)
// Expiry is compressed to minutes so the run finishes today; the settlement prices are the replayed historical
// returns applied to today's start prices, and every one is posted on-chain where anyone can see it.
//
//   npx hardhat compile && NET=local node scripts/stress-run.js     (dry run against `npx hardhat node`)
//   NET=hedera node scripts/stress-run.js                           (Hedera testnet; resumable)
// Output: deployments/<net>.stress.json (state + tx log) and app/public/data/stress_run[_local].json (for /admin).
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const { loadKeys } = require("../stress/wallets");

const NET = process.env.NET || "local";
const NETS = {
  local: { rpc: "http://127.0.0.1:8545", chainId: 31337, expiryMin: 15, explorerTx: "", explorerAddr: "" },
  hedera: { rpc: "https://testnet.hashio.io/api", chainId: 296, expiryMin: Number(process.env.EXPIRY_MIN || 12),
    explorerTx: "https://hashscan.io/testnet/transaction/", explorerAddr: "https://hashscan.io/testnet/contract/" },
};
const N = NETS[NET];
if (!N) throw new Error("NET must be local or hedera");
const ROOT = path.join(__dirname, "..", "..");
const BOOK = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "stress", "book.json"), "utf8"));
const REPLAY = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "stress", "replay_weeks.json"), "utf8"));
const STATE_FILE = path.join(__dirname, "..", "deployments", `${NET === "hedera" ? "hederaTestnet" : "local"}.stress.json`);
const OUT_FILE = path.join(ROOT, "app", "public", "data", NET === "hedera" ? "stress_run.json" : "stress_run_local.json");
const art = (n) => {
  const dir = { StressUSD: "mocks", IdentityRegistry: "compliance", PriceOracle: "oracle", TBillVault: "rwa" }[n] || "core";
  return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "artifacts", "contracts", dir, `${n}.sol`, `${n}.json`), "utf8"));
};
const U = (usd) => BigInt(Math.round(usd * 1e6));
const f6 = (x) => Number(x) / 1e6;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const provider = new ethers.JsonRpcProvider(N.rpc, N.chainId, { staticNetwork: true });
const keys = loadKeys();
const LOCAL_DEPLOYER = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // hardhat account #0
const depKey = NET === "local" ? LOCAL_DEPLOYER
  : (() => { const k = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").match(/PRIVATE_KEY=\s*(\S+)/)[1]; return k.startsWith("0x") ? k : "0x" + k; })();
const deployer = new ethers.NonceManager(new ethers.Wallet(depKey, provider));
const W = Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, new ethers.NonceManager(new ethers.Wallet(v, provider))]));
const ADDR = Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, new ethers.Wallet(v).address]));
const COUNTRY = { W1: 840, W2: 826, W3: 840, G1: 756, G2: 356, G3: 356, G4: 392, G5: 276 };

const S = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8"))
  : { net: NET, chainId: N.chainId, contracts: {}, done: {}, txs: [], rounds: {}, snapshots: [], createdAt: new Date().toISOString() };
const save = () => fs.writeFileSync(STATE_FILE, JSON.stringify(S, null, 2));

// ------------------------------------------------------------------ tx helper
async function send(label, who, contract, fn, args, opts = {}) {
  const c = contract.connect(who === "deployer" ? deployer : W[who]);
  let gasLimit;
  if (NET === "hedera") {
    // Hashio under-estimates multi-contract calls; Hedera charges >= 80% of the limit, so estimate and pad.
    try { gasLimit = (await c[fn].estimateGas(...args)) * 2n; } catch { gasLimit = 1_500_000n; }
    if (gasLimit < 120_000n) gasLimit = 120_000n;
    if (gasLimit > 6_000_000n) gasLimit = 6_000_000n;
  }
  for (let attempt = 0; ; attempt++) {
    try {
      const tx = await c[fn](...args, gasLimit ? { gasLimit } : {});
      const r = await tx.wait();
      if (r.status !== 1) throw new Error("reverted");
      const rec = { step: label, who, fn, tx: r.hash, url: N.explorerTx ? N.explorerTx + r.hash : null, gasUsed: Number(r.gasUsed),
        block: r.blockNumber, at: new Date().toISOString() };
      S.txs.push(rec); save();
      log(`${label.padEnd(64)} ${r.hash.slice(0, 18)}…`);
      return r;
    } catch (e) {
      const msg = e.shortMessage || e.reason || e.message;
      if (attempt >= 2 || /cover exceeds|pool capacity|market cap|nonce used|not open|KYC|terms|bad quote/.test(msg)) throw new Error(`${label}: ${msg}`);
      log(`retry ${label}: ${msg}`);
      if (gasLimit) gasLimit = gasLimit * 2n > 8_000_000n ? 8_000_000n : gasLimit * 2n;
      if (who !== "deployer") W[who].reset(); else deployer.reset();
      await sleep(3000);
    }
  }
}

async function chainNow() {
  return Number((await provider.getBlock("latest")).timestamp);
}

// ------------------------------------------------------------------ deploy + setup
async function deploy(key, name, args) {
  if (S.contracts[key]) return new ethers.Contract(S.contracts[key], art(name).abi, provider);
  const a = art(name);
  const f = new ethers.ContractFactory(a.abi, a.bytecode, deployer);
  const c = await f.deploy(...args, NET === "hedera" ? { gasLimit: 6_000_000 } : {});
  await c.waitForDeployment();
  S.contracts[key] = await c.getAddress();
  const h = c.deploymentTransaction().hash;
  S.txs.push({ step: `deploy ${key}`, who: "deployer", fn: "deploy", tx: h, url: N.explorerTx ? N.explorerTx + h : null, at: new Date().toISOString() });
  save();
  log(`deploy ${key.padEnd(18)} ${S.contracts[key]}`);
  return new ethers.Contract(S.contracts[key], a.abi, provider);
}

async function once(key, fn) {
  if (S.done[key]) return;
  await fn();
  S.done[key] = new Date().toISOString();
  save();
}

let C = {};
async function setup() {
  const dep = await deployer.getAddress();
  S.deployer = dep;
  C.usd = await deploy("StressUSD", "StressUSD", []);
  C.idr = await deploy("IdentityRegistry", "IdentityRegistry", [dep]);
  C.oracle = await deploy("PriceOracle", "PriceOracle", [dep]);
  C.tbill = await deploy("TBillVault", "TBillVault", [S.contracts.StressUSD, S.contracts.IdentityRegistry, BOOK.tbill.apyBps, dep]);
  C.pool = await deploy("UnderwritingPool", "UnderwritingPool", [S.contracts.StressUSD, S.contracts.IdentityRegistry, dep]);
  C.market = await deploy("CoverMarket", "CoverMarket", [S.contracts.StressUSD, S.contracts.IdentityRegistry, S.contracts.PriceOracle,
    S.contracts.UnderwritingPool, dep, dep]);
  C.note = await deploy("Note3Y", "ProtectedNote", ["InsureVEX 3Y Protected Note (stress)", "vx3Y-S", S.contracts.StressUSD,
    S.contracts.IdentityRegistry, S.contracts.TBillVault, S.contracts.UnderwritingPool, 30 * 86400, 3 * 365 * 86400,
    BOOK.tbill.floorRateBps, Number(process.env.COUPON_INTERVAL || 240), dep]);

  for (const k of ["TBillVault", "UnderwritingPool", "CoverMarket", "Note3Y"])
    await once(`system:${k}`, () => send(`IdentityRegistry.setSystem(${k})`, "deployer", C.idr, "setSystem", [S.contracts[k], true]));
  await once("marketRole", async () => send("pool.grantRole(MARKET_ROLE, CoverMarket)", "deployer", C.pool, "grantRole",
    [await C.pool.MARKET_ROLE(), S.contracts.CoverMarket]));
  const r = BOOK.risk;
  await once("risk", () => send(`pool.setRiskParams(R ${r.reserveBps / 100}%, name ${r.symbolCapBps / 100}%, market ${r.marketCapBps / 100}%, Pro fee ${r.proFeeBps / 100}%)`,
    "deployer", C.pool, "setRiskParams", [r.reserveBps, r.symbolCapBps, r.marketCapBps, r.proFeeBps]));
  const until = (await chainNow()) + 365 * 86400;
  await once("kyc:deployer", () => send("KYC issuer", "deployer", C.idr, "setIdentity", [dep, true, 840, until]));
  for (const w of Object.keys(W))
    await once(`kyc:${w}`, () => send(`KYC ${w} (${persona(w)}), country ${COUNTRY[w]}`, "deployer", C.idr, "setIdentity", [ADDR[w], true, COUNTRY[w], until]));

  // test dollars: Savers and the Pro LP get their deposit, Holders a premium budget (3% of their notional)
  const mint = {};
  for (const s of BOOK.savers) mint[s.wallet] = (mint[s.wallet] || 0) + s.usd;
  for (const p of BOOK.pro) mint[p.wallet] = (mint[p.wallet] || 0) + p.usd;
  for (const h of BOOK.holders) mint[h.wallet] = (mint[h.wallet] || 0) + 0.03 * h.covers.reduce((a, c) => a + c[3], 0);
  for (const [w, usd] of Object.entries(mint))
    await once(`mint:${w}`, () => send(`mint ${fmtUsd(usd)} sUSD -> ${w}`, "deployer", C.usd, "mint", [ADDR[w], U(usd)]));
}

function persona(w) {
  for (const s of BOOK.savers) if (s.wallet === w) return `Saver: ${s.persona}`;
  for (const p of BOOK.pro) if (p.wallet === w) return `Pro LP: ${p.persona}`;
  for (const h of BOOK.holders) if (h.wallet === w) return `Holder: ${h.persona}`;
  return w;
}
function fmtUsd(x) {
  return x >= 1e9 ? `$${(x / 1e9).toFixed(2)}B` : x >= 1e6 ? `$${(x / 1e6).toFixed(1)}M` : `$${x.toFixed(0)}`;
}

// ------------------------------------------------------------------ deposits
async function deposits() {
  for (const s of BOOK.savers) {
    await once(`approveNote:${s.wallet}`, () => send(`${s.wallet} approve note`, s.wallet, C.usd, "approve", [S.contracts.Note3Y, U(s.usd)]));
    await once(`subscribe:${s.wallet}`, () => send(`${s.wallet} ${s.persona} subscribes ${fmtUsd(s.usd)} to the 3Y note`, s.wallet, C.note, "subscribe", [U(s.usd)]));
  }
  for (const p of BOOK.pro) {
    await once(`approvePro:${p.wallet}`, () => send(`${p.wallet} approve pool`, p.wallet, C.usd, "approve", [S.contracts.UnderwritingPool, U(p.usd)]));
    await once(`pro:${p.wallet}`, () => send(`${p.wallet} ${p.persona} deposits ${fmtUsd(p.usd)} first-loss`, p.wallet, C.pool, "depositPro", [U(p.usd)]));
  }
  await once("snap:deposits", () => snapshot("Deposits: Savers and Pro LP funded"));
}

// ------------------------------------------------------------------ pricing (the live engine)
let engine;
async function loadEngine() {
  if (engine) return engine;
  const toUrl = (p) => "file:///" + path.join(ROOT, "server", "src", p).replace(/\\/g, "/");
  const pricing = await import(toUrl("pricing.js"));
  const prices = await import(toUrl("prices.js"));
  const fx = new Map();
  const usdPer = async (cur) => {
    if (!cur || cur === "USD") return 1;
    const SUB = { GBp: ["GBP", 100], GBX: ["GBP", 100] };
    const [cc, div] = SUB[cur] || [cur.toUpperCase(), 1];
    if (!fx.has(cc)) fx.set(cc, (await prices.history(`${cc}USD=X`, "3mo")).close);
    return fx.get(cc) / div;
  };
  engine = { priceFloor: pricing.priceFloor, history: prices.history, usdPer };
  return engine;
}

async function quote(wallet, [symbol, yahoo, market, usd], expiry, now) {
  const e = await loadEngine();
  const P = BOOK.product;
  const h = await e.history(yahoo);
  const p = e.priceFloor({ sigmaDaily: h.sigmaBlend, sessions: P.tenorSessions, deductible: P.deductibleBps / 1e4, cap: P.capBps / 1e4, market });
  const pricing = { sigmaDaily: h.sigmaBlend, fairBps: p.fair * 1e4, premiumBps: p.charged * 1e4, pPayout: p.pPayout, factor: p.factor,
    close: h.close, closeDate: new Date(h.closeTs * 1000).toISOString().slice(0, 10), currency: h.currency };
  if (p.refused) return { refused: true, pricing, reason: p.reason };
  const fx = await e.usdPer(h.currency);
  const shares = ethers.parseEther((usd / (h.close * fx)).toFixed(6));
  const q = {
    buyer: ADDR[wallet], symbol: ethers.id(symbol), market: ethers.id(market), notional: U(usd), shares, heldShares: shares,
    deductibleBps: P.deductibleBps, capBps: P.capBps, premium: U(usd * p.charged), startPrice: BigInt(Math.round(h.close * 1e8)),
    expiry: BigInt(expiry), validUntil: BigInt(now + 1800), nonce: BigInt(ethers.hexlify(ethers.randomBytes(16))),
  };
  const domain = { name: "InsureVEX CoverMarket", version: "1", chainId: N.chainId, verifyingContract: S.contracts.CoverMarket };
  const types = { Quote: [
    { name: "buyer", type: "address" }, { name: "symbol", type: "bytes32" }, { name: "market", type: "bytes32" }, { name: "notional", type: "uint256" },
    { name: "shares", type: "uint256" }, { name: "heldShares", type: "uint256" }, { name: "deductibleBps", type: "uint32" },
    { name: "capBps", type: "uint32" }, { name: "premium", type: "uint256" }, { name: "startPrice", type: "uint256" },
    { name: "expiry", type: "uint64" }, { name: "validUntil", type: "uint64" }, { name: "nonce", type: "uint256" }] };
  const sig = await deployer.signTypedData(domain, types, q); // the deployer holds QUOTER_ROLE on the stress market
  return { q, sig, pricing, fx };
}

// ------------------------------------------------------------------ one round
async function round(name, label, replay) {
  S.rounds[name] = S.rounds[name] || {};
  const R = S.rounds[name];
  if (R.settled) return;
  if (!R.expiry) {
    R.expiry = (await chainNow()) + N.expiryMin * 60;
    R.label = label; R.replayWeek = replay.date; R.policies = []; R.refused = [];
    save();
  }
  log(`=== round ${name}: ${label} (expiry ${new Date(R.expiry * 1000).toISOString()})`);

  if (!R.bought) {
    await Promise.all(BOOK.holders.map(async (h) => {
      await once(`approveMarket:${h.wallet}`, () => send(`${h.wallet} approve CoverMarket`, h.wallet, C.usd, "approve", [S.contracts.CoverMarket, ethers.MaxUint256]));
      for (const cv of h.covers) {
        if (R.policies.some((p) => p.symbol === cv[0] && p.holder === h.wallet) || R.refused.some((x) => x.symbol === cv[0])) continue;
        const now = await chainNow();
        if (now > R.expiry - 60) { log(`no time left to buy ${cv[0]}`); break; }
        const qt = await quote(h.wallet, cv, R.expiry, now);
        if (qt.refused) { R.refused.push({ symbol: cv[0], holder: h.wallet, reason: qt.reason, pricing: qt.pricing }); save(); log(`refused ${cv[0]}: ${qt.reason}`); continue; }
        let r;
        try {
          r = await send(`${h.wallet} buys ${cv[0]} floor ${fmtUsd(cv[3])}, premium ${fmtUsd(f6(qt.q.premium))} (${qt.pricing.premiumBps.toFixed(1)} bps)`,
            h.wallet, C.market, "buyCover", [qt.q, qt.sig]);
        } catch (e) { R.refused.push({ symbol: cv[0], holder: h.wallet, reason: e.message }); save(); log(`failed ${cv[0]}: ${e.message}`); continue; }
        const ev = r.logs.map((l) => { try { return C.market.interface.parseLog(l); } catch { return null; } }).find((x) => x && x.name === "CoverBought");
        R.policies.push({ id: Number(ev.args.id), holder: h.wallet, symbol: cv[0], yahoo: cv[1], market: cv[2], notional: cv[3],
          premium: f6(qt.q.premium), premiumBps: qt.pricing.premiumBps, fairBps: qt.pricing.fairBps, sigmaDaily: qt.pricing.sigmaDaily,
          startPrice: Number(qt.q.startPrice) / 1e8, currency: qt.pricing.currency, closeDate: qt.pricing.closeDate, tx: r.hash });
        save();
      }
    }));
    R.bought = true; save();
    await snapshot(`${label}: ${R.policies.length} covers bought, collateral locked`);
  }

  // wait for expiry
  for (;;) {
    const now = await chainNow();
    if (now >= R.expiry) break;
    if (NET === "local") { await provider.send("evm_increaseTime", [R.expiry - now + 1]); await provider.send("evm_mine", []); continue; }
    log(`waiting for expiry: ${R.expiry - now}s`);
    await sleep(Math.min(60_000, (R.expiry - now + 5) * 1000));
  }

  if (!R.posted) {
    const syms = [...new Set(R.policies.map((p) => p.symbol))];
    const px = syms.map((s) => {
      const p = R.policies.find((x) => x.symbol === s);
      const ret = replay.all_returns[s] ?? 0;
      p.replayReturn = ret;
      for (const q of R.policies) if (q.symbol === s) { q.replayReturn = ret; q.settlePrice = p.startPrice * (1 + ret); }
      return BigInt(Math.round(p.startPrice * (1 + ret) * 1e8));
    });
    for (let i = 0; i < syms.length; i += 9) {
      const sl = syms.slice(i, i + 9);
      await send(`oracle posts ${sl.length} closes (replay of week ${replay.date})`, "deployer", C.oracle, "postMany",
        [sl.map((s) => ethers.id(s)), sl.map(() => R.expiry), px.slice(i, i + 9)]);
    }
    R.posted = true; save();
  }

  // crash round: the stablecoin issuer has put one holder on hold. Settlement must not stall: the payout is owed.
  const holdWallet = process.env.HOLD_WALLET || "G3";
  if (name === "crash" && !R.hold) {
    await send(`stablecoin issuer puts ${holdWallet} on hold (blocklist)`, "deployer", C.usd, "setBlocked", [ADDR[holdWallet], true]);
    R.hold = holdWallet; save();
  }

  const open = [];
  for (const p of R.policies) if (Number((await C.market.getPolicy(p.id)).status) === 1) open.push(p.id);
  for (let i = 0; i < open.length; i += 6)
    await send(`settle policies ${open.slice(i, i + 6).join(",")}`, "deployer", C.market, "settleMany", [open.slice(i, i + 6)]);
  for (const p of R.policies) {
    const x = await C.market.getPolicy(p.id);
    p.payout = f6(x.payout);
  }
  R.payouts = R.policies.reduce((a, p) => a + p.payout, 0);
  R.premiums = R.policies.reduce((a, p) => a + p.premium, 0);
  R.settled = true; save();
  await snapshot(`${label}: settled, ${fmtUsd(R.payouts)} paid on ${fmtUsd(R.premiums)} premiums`);

  if (R.hold && !R.claimed) {
    const owed = f6(await C.pool.owed(ADDR[R.hold]));
    await snapshot(`${label}: ${R.hold} payout of ${fmtUsd(owed)} held as owed (wallet on hold)`);
    await send(`stablecoin issuer lifts the hold on ${R.hold}`, "deployer", C.usd, "setBlocked", [ADDR[R.hold], false]);
    if (owed > 0) await send(`${R.hold} claims owed payout ${fmtUsd(owed)}`, R.hold, C.pool, "claimOwed", [ADDR[R.hold]]);
    R.claimed = true; save();
  }
}

async function coupons(tag) {
  if (S.done[`coupon:${tag}`]) return;
  const [last, interval] = await Promise.all([C.note.lastCoupon(), C.note.couponInterval()]);
  for (;;) {
    const now = await chainNow();
    const due = Number(last) + Number(interval);
    if (now >= due) break;
    if (NET === "local") { await provider.send("evm_increaseTime", [due - now + 1]); await provider.send("evm_mine", []); continue; }
    log(`waiting for coupon window: ${due - now}s`); await sleep((due - now + 5) * 1000);
  }
  const avail = f6(await C.note.couponAvailable());
  await send(`note.distributeCoupon (${fmtUsd(avail)} of underwriting profit)`, "deployer", C.note, "distributeCoupon", []);
  for (const s of BOOK.savers) {
    if ((await C.note.pendingCoupon(ADDR[s.wallet])) > 0n)
      await send(`${s.wallet} claims coupon ${fmtUsd(f6(await C.note.pendingCoupon(ADDR[s.wallet])))}`, s.wallet, C.note, "claimCoupon", []);
  }
  S.done[`coupon:${tag}`] = new Date().toISOString(); save();
  await snapshot(`Coupon after ${tag}: ${fmtUsd(avail)} paid to Savers`);
}

// ------------------------------------------------------------------ snapshot (everything /admin shows)
async function snapshot(label) {
  const p = C.pool, n = C.note, m = C.market;
  const [senior, junior, locked, capTotal, prem, pays, proLoss, owedTotal, util, proSupply, supply, nsnap, tbillAssets] = await Promise.all([
    p.totalAssets(), p.juniorAssets(), p.locked(), p.capacityTotal(), p.totalPremiums(), p.totalPayouts(), p.totalProLosses(), p.totalOwed(),
    p.utilisationBps(), p.proSupply(), n.totalSupply(), n.snapshot(), C.tbill.totalAssets()]);
  const count = Number(await m.policyCount());
  const policies = [];
  for (let i = 0; i < count; i++) {
    const x = await m.getPolicy(i);
    policies.push({ id: i, holder: x.holder, notional: f6(x.notional), premium: f6(x.premium), payout: f6(x.payout), status: Number(x.status),
      maxPayout: f6((x.notional * BigInt(x.capBps)) / 10000n) });
  }
  const wallets = {};
  for (const w of Object.keys(W)) {
    const a = ADDR[w];
    const [bal, noteBal, pend, owed, proShares, gas] = await Promise.all([C.usd.balanceOf(a), n.balanceOf(a), n.pendingCoupon(a), p.owed(a),
      p.proBalanceOf(a), provider.getBalance(a)]);
    const mine = policies.filter((x) => x.holder.toLowerCase() === a.toLowerCase());
    const share = supply > 0n ? Number(noteBal) / Number(supply) : 0;
    wallets[w] = {
      address: a, persona: persona(w), country: COUNTRY[w], stable: f6(bal), gasHbar: Number(ethers.formatEther(gas)),
      note: f6(noteBal), pendingCoupon: f6(pend), couponsReceived: 0,
      noteFloorShare: f6(nsnap.floorVal) * share, noteSleeveShare: f6(nsnap.sleeveVal) * share,
      projectedAtMaturity: f6(noteBal) + f6(nsnap.sleeveVal) * share, // floor repays face at maturity + this wallet's share of the sleeve
      proValue: proSupply > 0n ? (Number(proShares) / Number(proSupply)) * f6(junior) : 0,
      owed: f6(owed), premiumsPaid: mine.reduce((s, x) => s + x.premium, 0), payoutsReceived: mine.reduce((s, x) => s + x.payout, 0),
      openCover: mine.filter((x) => x.status === 1).reduce((s, x) => s + x.notional, 0),
      openMaxPayout: mine.filter((x) => x.status === 1).reduce((s, x) => s + x.maxPayout, 0),
      policies: mine.length,
    };
  }
  S.snapshots.push({ label, at: new Date().toISOString(), block: await provider.getBlockNumber(), pool: {
    senior: f6(senior), junior: f6(junior), locked: f6(locked), capacity: f6(capTotal), premiums: f6(prem), payouts: f6(pays),
    proLosses: f6(proLoss), owed: f6(owedTotal), utilisationBps: Number(util) },
    note: { supply: f6(supply), floor: f6(nsnap.floorVal), sleeve: f6(nsnap.sleeveVal), sleevePrincipal: f6(nsnap.sleevePrin), couponsPaid: f6(nsnap.couponsPaid) },
    tbill: f6(tbillAssets), wallets });
  save();
  writeOut();
  log(`snapshot: ${label}`);
}

function writeOut() {
  const coupons = {};
  for (const t of S.txs) { const m = t.step.match(/^(\w+) claims coupon/); if (m) coupons[m[1]] = true; }
  const out = {
    generatedAt: new Date().toISOString(), net: NET, chainId: N.chainId, explorerTx: N.explorerTx, explorerAddr: N.explorerAddr,
    disclaimer: "Testnet stress run in StressUSD, a test-only dollar minted for this run (no real value). Covers are priced by the live engine "
      + "on today's prices and volatility as 1-week floors; expiry is compressed to minutes and the oracle posts each stock's real return "
      + "from the replayed historical week, applied to today's start price.",
    contracts: S.contracts, deployer: S.deployer, book: BOOK, rounds: S.rounds, snapshots: S.snapshots,
    txs: S.txs, txCount: S.txs.length,
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(out));
}

async function main() {
  log(`stress run on ${NET} (${N.chainId})`);
  if (NET === "local") {
    for (const w of Object.keys(W)) if ((await provider.getBalance(ADDR[w])) < ethers.parseEther("1"))
      await (await deployer.sendTransaction({ to: ADDR[w], value: ethers.parseEther("100") })).wait();
  }
  await setup();
  await deposits();
  await round("calm", "Round 1, a normal week", REPLAY.calm);
  await coupons("Round 1");
  await round("crash", "Round 2, the worst week in 21 years (COVID, Feb 2020)", REPLAY.crash);
  await coupons("Round 2");
  S.finishedAt = new Date().toISOString(); save(); writeOut();
  log(`done. ${S.txs.length} transactions. Output: ${OUT_FILE}`);
}

async function runWithRestarts() {
  for (let i = 0; ; i++) {
    try { return await main(); } catch (e) {
      save();
      if (i >= 5) throw e;
      log(`run interrupted (${e.shortMessage || e.message}); resuming from saved state in 20s`);
      W && Object.values(W).forEach((w) => w.reset()); deployer.reset();
      await sleep(20000);
    }
  }
}
runWithRestarts().catch((e) => { console.error(e); save(); process.exit(1); });
