const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const U = (n) => ethers.parseUnits(String(n), 6);
const SYM = ethers.id("NASDAQ:NVDA");
const DAY = 86400;

async function signQuote(market, signer, q) {
  const net = await ethers.provider.getNetwork();
  const domain = { name: "InsureVEX CoverMarket", version: "1", chainId: net.chainId, verifyingContract: await market.getAddress() };
  const types = { Quote: [
    { name: "buyer", type: "address" }, { name: "symbol", type: "bytes32" }, { name: "notional", type: "uint256" },
    { name: "shares", type: "uint256" }, { name: "heldShares", type: "uint256" }, { name: "deductibleBps", type: "uint32" },
    { name: "capBps", type: "uint32" }, { name: "premium", type: "uint256" }, { name: "startPrice", type: "uint256" },
    { name: "expiry", type: "uint64" }, { name: "validUntil", type: "uint64" }, { name: "nonce", type: "uint256" }] };
  return signer.signTypedData(domain, types, q);
}

describe("InsureVEX lifecycle", function () {
  let admin, saver, holder, outsider, usd, idr, oracle, tbill, pool, market, note;

  beforeEach(async () => {
    [admin, saver, holder, outsider] = await ethers.getSigners();
    usd = await (await ethers.getContractFactory("TestUSD")).deploy();
    idr = await (await ethers.getContractFactory("IdentityRegistry")).deploy(admin.address);
    oracle = await (await ethers.getContractFactory("PriceOracle")).deploy(admin.address);
    tbill = await (await ethers.getContractFactory("TBillVault")).deploy(usd, idr, 420, admin.address);
    pool = await (await ethers.getContractFactory("UnderwritingPool")).deploy(usd, idr, admin.address);
    market = await (await ethers.getContractFactory("CoverMarket")).deploy(usd, idr, oracle, pool, admin.address, admin.address);
    note = await (await ethers.getContractFactory("ProtectedNote")).deploy(
      "InsureVEX 3Y Protected Note", "vx3Y", usd, idr, tbill, pool, 30, 3 * 365 * DAY, 400, 30 * DAY, admin.address);
    for (const c of [tbill, pool, market, note]) await idr.setSystem(await c.getAddress(), true);
    await pool.grantRole(await pool.MARKET_ROLE(), await market.getAddress());
    await pool.setTBill(tbill);
    const exp = (await time.latest()) + 5 * 365 * DAY;
    await idr.setIdentity(saver.address, true, 356, exp);
    await idr.setIdentity(holder.address, true, 840, exp);
    await usd.transfer(saver.address, U(100_000));
    await usd.transfer(holder.address, U(50_000));
    await usd.transfer(admin.address, 0);
  });

  it("splits a subscription into a T-bill floor and an underwriting sleeve", async () => {
    await usd.connect(saver).approve(note, U(10_000));
    await note.connect(saver).subscribe(U(10_000));
    const s = await note.snapshot();
    // 3y at 4% simple: floor = 10000 / 1.12 = 8928.57
    expect(Number(s.floorVal) / 1e6).to.be.closeTo(8928.58, 0.5);
    expect(Number(s.sleevePrin) / 1e6).to.be.closeTo(1071.42, 0.5);
    expect(await note.balanceOf(saver.address)).to.equal(U(10_000));
  });

  it("rejects non-KYC subscribers and restricted transfers", async () => {
    await usd.transfer(outsider.address, U(1000));
    await usd.connect(outsider).approve(note, U(1000));
    await expect(note.connect(outsider).subscribe(U(1000))).to.be.revertedWith("KYC");
    await usd.connect(saver).approve(note, U(1000));
    await note.connect(saver).subscribe(U(1000));
    await expect(note.connect(saver).transfer(outsider.address, U(10))).to.be.revertedWith("transfer restricted");
    await note.connect(saver).transfer(holder.address, U(10)); // KYC'd -> allowed
    await idr.setFrozen(holder.address, true);
    await expect(note.connect(holder).transfer(saver.address, U(1))).to.be.revertedWith("transfer restricted");
  });

  it("sells a fully collateralised floor, enforces holdings, pays the crash, and settles from the oracle", async () => {
    await usd.connect(saver).approve(note, U(100_000));
    await note.connect(saver).subscribe(U(100_000)); // sleeve ~10.7k in the pool
    await pool.setRiskParams(5000, 2500); // m = 25% for this test
    const now = await time.latest();
    const q = { buyer: holder.address, symbol: SYM, notional: U(5_000), shares: ethers.parseEther("50"), heldShares: ethers.parseEther("50"),
      deductibleBps: 1000, capBps: 2000, premium: U(120), startPrice: 200e8, expiry: now + 28 * DAY, validUntil: now + 600, nonce: 1 };
    const sig = await signQuote(market, admin, q);
    await usd.connect(holder).approve(market, U(1000));

    // holdings check: covering more shares than held fails
    const tooMuch = { ...q, shares: ethers.parseEther("60"), nonce: 2 };
    await expect(market.connect(holder).buyCover(tooMuch, await signQuote(market, admin, tooMuch))).to.be.revertedWith("cover exceeds holdings");
    // bad signature fails
    await expect(market.connect(holder).buyCover({ ...q, premium: U(1) }, sig)).to.be.revertedWith("bad quote signature");

    await market.connect(holder).buyCover(q, sig);
    expect(await pool.locked()).to.equal(U(1000));
    await expect(market.connect(holder).buyCover(q, sig)).to.be.revertedWith("nonce used");

    await time.increaseTo(q.expiry);
    await expect(market.settle(0)).to.be.revertedWith("no official close yet");
    await oracle.post(SYM, q.expiry, 150e8); // -25%: pays (25% - 10%) = 15% of 5k = 750
    const before = await usd.balanceOf(holder.address);
    await market.settle(0);
    expect((await usd.balanceOf(holder.address)) - before).to.equal(U(750));
    expect(await pool.locked()).to.equal(0);
  });

  it("caps the payout at c and pays nothing inside the deductible", async () => {
    await usd.connect(saver).approve(note, U(100_000));
    await note.connect(saver).subscribe(U(100_000));
    await pool.setRiskParams(5000, 2500);
    const now = await time.latest();
    const base = { buyer: holder.address, symbol: SYM, notional: U(2_000), shares: ethers.parseEther("10"), heldShares: ethers.parseEther("100"),
      deductibleBps: 1000, capBps: 2000, premium: U(50), startPrice: 100e8, expiry: now + 7 * DAY, validUntil: now + 600 };
    await usd.connect(holder).approve(market, U(1000));
    const q1 = { ...base, nonce: 11 }; await market.connect(holder).buyCover(q1, await signQuote(market, admin, q1));
    const q2 = { ...base, nonce: 12 }; await market.connect(holder).buyCover(q2, await signQuote(market, admin, q2));
    await time.increaseTo(base.expiry);
    await oracle.post(SYM, base.expiry, 40e8); // -60% -> capped at 20%
    expect(await market.previewPayout(0, 40e8)).to.equal(U(400));
    expect(await market.previewPayout(0, 95e8)).to.equal(0); // -5% inside the 10% deductible
    await market.settleMany([0, 1]);
    expect((await market.getPolicy(1)).payout).to.equal(U(400));
  });

  it("enforces the pool reserve and per-symbol cap", async () => {
    await usd.connect(saver).approve(note, U(10_000));
    await note.connect(saver).subscribe(U(10_000)); // sleeve ~1,071 -> working 535 -> symbol cap 53.5
    const now = await time.latest();
    const q = { buyer: holder.address, symbol: SYM, notional: U(1_000), shares: 1n, heldShares: 10n, deductibleBps: 1000, capBps: 2000,
      premium: U(10), startPrice: 1e8, expiry: now + 7 * DAY, validUntil: now + 600, nonce: 21 };
    await usd.connect(holder).approve(market, U(100));
    await expect(market.connect(holder).buyCover(q, await signQuote(market, admin, q))).to.be.revertedWith("pool capacity");
  });

  it("pays underwriting profit as coupons and returns full principal at maturity even after a loss", async () => {
    await usd.connect(saver).approve(note, U(50_000));
    await note.connect(saver).subscribe(U(50_000));
    // premiums flow in from quiet months
    const now = await time.latest();
    await usd.connect(holder).approve(market, U(10_000));
    for (let i = 0; i < 3; i++) {
      const q = { buyer: holder.address, symbol: ethers.id("NSE:RELIANCE" + i), notional: U(1_000), shares: 1n, heldShares: 1n,
        deductibleBps: 1000, capBps: 2000, premium: U(40), startPrice: 1e8, expiry: now + 20 * DAY, validUntil: now + 600, nonce: 100 + i };
      await market.connect(holder).buyCover(q, await signQuote(market, admin, q));
    }
    await time.increaseTo(now + 31 * DAY);
    for (let i = 0; i < 3; i++) await oracle.post(ethers.id("NSE:RELIANCE" + i), now + 20 * DAY, 1e8);
    await market.settleMany([0, 1, 2]);
    await note.distributeCoupon();
    const pending = await note.pendingCoupon(saver.address);
    expect(pending).to.be.greaterThan(U(100)); // 120 of premium (+ T-bill yield on pool idle cash = 0 here)
    await note.connect(saver).claimCoupon();

    // a crash wipes part of the sleeve; principal must still come back in full
    const q = { buyer: holder.address, symbol: ethers.id("NYSE:XYZ"), notional: U(1_000), shares: 1n, heldShares: 1n,
      deductibleBps: 1000, capBps: 2000, premium: U(20), startPrice: 1e8, expiry: (await time.latest()) + 7 * DAY,
      validUntil: (await time.latest()) + 600, nonce: 999 };
    await market.connect(holder).buyCover(q, await signQuote(market, admin, q));
    await time.increaseTo(q.expiry);
    await oracle.post(ethers.id("NYSE:XYZ"), q.expiry, 0.5e8);
    await market.settle(3); // -50% capped at 20% -> pays 200

    // fund the T-bill vault's coupon cash (custodian proceeds) and mature
    await usd.connect(admin).approve(tbill, U(10_000));
    await tbill.fundYield(U(10_000));
    await time.increaseTo(Number(await note.maturity()));
    await note.mature();
    const before = await usd.balanceOf(saver.address);
    await note.connect(saver).redeem();
    const got = (await usd.balanceOf(saver.address)) - before;
    expect(got).to.be.greaterThanOrEqual(U(50_000)); // principal protected
    await expect(note.connect(saver).transfer(holder.address, 1)).to.be.revertedWith("matured: no transfers");
  });
});
