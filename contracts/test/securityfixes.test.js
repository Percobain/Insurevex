const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

// Regression tests for the four issues found by the Arc Studio security review.
const U = (n) => ethers.parseUnits(String(n), 6);
const DAY = 86400;
const TYPES = { Quote: [
  { name: "buyer", type: "address" }, { name: "symbol", type: "bytes32" }, { name: "market", type: "bytes32" }, { name: "notional", type: "uint256" },
  { name: "shares", type: "uint256" }, { name: "heldShares", type: "uint256" }, { name: "deductibleBps", type: "uint32" },
  { name: "capBps", type: "uint32" }, { name: "premium", type: "uint256" }, { name: "startPrice", type: "uint256" },
  { name: "expiry", type: "uint64" }, { name: "validUntil", type: "uint64" }, { name: "nonce", type: "uint256" }] };

async function setup() {
  const [admin, holder, proA, proB, outsider] = await ethers.getSigners();
  const usd = await (await ethers.getContractFactory("BlockableUSD")).deploy();
  const idr = await (await ethers.getContractFactory("IdentityRegistry")).deploy(admin.address);
  const oracle = await (await ethers.getContractFactory("PriceOracle")).deploy(admin.address);
  const tbill = await (await ethers.getContractFactory("TBillVault")).deploy(usd, idr, 420, admin.address);
  const pool = await (await ethers.getContractFactory("UnderwritingPool")).deploy(usd, idr, admin.address);
  const market = await (await ethers.getContractFactory("CoverMarket")).deploy(usd, idr, oracle, pool, admin.address, admin.address);
  for (const c of [tbill, pool, market]) await idr.setSystem(await c.getAddress(), true);
  await pool.grantRole(await pool.MARKET_ROLE(), await market.getAddress());
  await pool.setRiskParams(5000, 2500, 10000, 4000);
  const exp = (await time.latest()) + 365 * DAY;
  for (const s of [admin, holder, proA, proB]) {
    await idr.setIdentity(s.address, true, 840, exp);
    await usd.transfer(s.address, U(100_000));
  }
  const net = await ethers.provider.getNetwork();
  const domain = { name: "InsureVEX CoverMarket", version: "1", chainId: net.chainId, verifyingContract: await market.getAddress() };
  let nonce = 1;
  const buy = async (sym, notional, startPrice = 100e8, tenor = 7 * DAY, premium = U(1)) => {
    const now = await time.latest();
    const q = { buyer: holder.address, symbol: ethers.id(sym), market: ethers.id("US"), notional: U(notional), shares: 1n, heldShares: 1n,
      deductibleBps: 1000, capBps: 2000, premium, startPrice, expiry: now + tenor, validUntil: now + 600, nonce: nonce++ };
    await usd.connect(holder).approve(market, premium);
    await market.connect(holder).buyCover(q, await admin.signTypedData(domain, TYPES, q));
    return q;
  };
  return { admin, holder, proA, proB, outsider, usd, idr, oracle, tbill, pool, market, buy, domain };
}

describe("Security fixes (Arc Studio review)", () => {
  it("1. a wiped-out Pro epoch cannot claim the next Pro LP's deposit", async () => {
    const { proA, proB, usd, pool, oracle, market, buy } = await setup();
    await usd.connect(proA).approve(pool, U(1_000));
    await pool.connect(proA).depositPro(U(1_000));
    // a crash wipes the whole Pro tranche (nothing else is in the pool): four stocks go to zero, each pays its 20% cap
    const qs = [];
    for (const s of ["NASDAQ:A", "NASDAQ:B", "NASDAQ:C", "NASDAQ:D"]) qs.push(await buy(s, 1_250, 100e8, 7 * DAY, 0n));
    await time.increaseTo(qs[3].expiry);
    for (const q of qs) await oracle.post(q.symbol, q.expiry, 0);
    await market.settleMany([0, 1, 2, 3]);
    expect(await pool.juniorAssets()).to.equal(0);
    expect(await pool.proBalanceOf(proA.address)).to.equal(U(1_000)); // shares still exist...

    await usd.connect(proB).approve(pool, U(1_000));
    await pool.connect(proB).depositPro(U(1_000));
    expect(await pool.proEpoch()).to.equal(1);
    expect(await pool.proBalanceOf(proA.address)).to.equal(0); // ...but are retired with the wiped epoch
    expect(await pool.maxProWithdraw(proA.address)).to.equal(0);
    expect(await pool.maxProWithdraw(proB.address)).to.equal(U(1_000)); // the new LP owns all of the new money
    await pool.connect(proB).withdrawPro(U(1_000));
  });

  it("2. a payout to a blocklisted holder is owed instead of blocking settlement, and can be claimed elsewhere", async () => {
    const { admin, holder, proA, usd, pool, oracle, market, buy } = await setup();
    await usd.connect(proA).approve(pool, U(10_000));
    await pool.connect(proA).depositPro(U(10_000));
    const q = await buy("NASDAQ:B", 1_000);
    await time.increaseTo(q.expiry);
    await oracle.post(q.symbol, q.expiry, 50e8); // -50% -> capped 20% -> 200
    await usd.setBlocked(holder.address, true); // stablecoin issuer blocklists the holder
    await market.settle(0); // does not revert
    expect(await pool.locked()).to.equal(0); // collateral released
    expect(await pool.owed(holder.address)).to.equal(U(200));
    expect(await pool.totalOwed()).to.equal(U(200));
    // the holder routes the claim to a clean wallet of theirs
    const before = await usd.balanceOf(admin.address);
    await pool.connect(holder).claimOwed(admin.address);
    expect((await usd.balanceOf(admin.address)) - before).to.equal(U(200));
    expect(await pool.totalOwed()).to.equal(0);
  });

  it("3. a frozen T-bill holder cannot redeem to another address", async () => {
    const { admin, holder, usd, idr, tbill } = await setup();
    await usd.connect(holder).approve(tbill, U(1_000));
    await tbill.connect(holder).deposit(U(1_000), holder.address);
    await idr.setFrozen(holder.address, true);
    const shares = await tbill.balanceOf(holder.address);
    await expect(tbill.connect(holder).redeem(shares, admin.address, holder.address)).to.be.revertedWith("KYC");
    await idr.setFrozen(holder.address, false);
    await usd.approve(tbill, U(10));
    await tbill.fundYield(U(10)); // custodian proceeds for the accrued yield
    await tbill.connect(holder).redeem(shares, holder.address, holder.address); // unfrozen: fine
  });

  it("4. a stock that closes at exactly zero settles at the full cap", async () => {
    const { proA, holder, usd, pool, oracle, market, buy } = await setup();
    await usd.connect(proA).approve(pool, U(10_000));
    await pool.connect(proA).depositPro(U(10_000));
    const q = await buy("NYSE:BANKRUPT", 1_000);
    await time.increaseTo(q.expiry);
    await expect(market.settle(0)).to.be.revertedWith("no official close yet");
    await oracle.post(q.symbol, q.expiry, 0);
    const [posted, px] = await oracle.closeAt(q.symbol, q.expiry);
    expect(posted).to.equal(true);
    expect(px).to.equal(0);
    const before = await usd.balanceOf(holder.address);
    await market.settle(0);
    expect((await usd.balanceOf(holder.address)) - before).to.equal(U(200)); // 20% cap of 1,000
  });
});
