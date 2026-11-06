const { expect } = require("chai");
const { ethers } = require("hardhat");

const U = (n) => ethers.parseUnits(String(n), 6);

// Isolate the pool hooks from price forecasting: these are accounting tests,
// not evidence of future profitability. Use only Hardhat's local network.
describe("Economic audit: combined pool versus Pro P&L", function () {
  async function setup(feeBps = 4000) {
    const [admin, senior, pro, holder] = await ethers.getSigners();
    const usd = await (await ethers.getContractFactory("TestUSD")).deploy();
    const identity = await (await ethers.getContractFactory("IdentityRegistry")).deploy(admin.address);
    const pool = await (await ethers.getContractFactory("UnderwritingPool")).deploy(usd, identity, admin.address);
    const block = await ethers.provider.getBlock("latest");
    for (const user of [senior, pro]) {
      await identity.setIdentity(user.address, true, 840, block.timestamp + 365 * 86400);
      await usd.transfer(user.address, U(2000));
      await usd.connect(user).approve(pool, U(2000));
    }
    await pool.connect(senior).deposit(U(1000), senior.address);
    await pool.connect(pro).depositPro(U(500));
    await pool.setRiskParams(5000, 2500, 10000, feeBps);
    await pool.grantRole(await pool.MARKET_ROLE(), admin.address);
    return { usd, pool, pro, holder, symbol: ethers.id("AUDIT"), market: ethers.id("US") };
  }

  async function period(ctx, premium, payout) {
    const { usd, pool, holder, symbol, market } = ctx;
    await pool.lock(symbol, market, U(100));
    await usd.transfer(pool, U(premium));
    await pool.bookPremium(symbol, U(premium));
    await pool.release(symbol, market, U(100), holder.address, U(payout));
  }

  it("a profitable book can lose money for Pro at the default 40% fee", async function () {
    const ctx = await setup();
    await period(ctx, 100, 80);
    // Capacity shares: 500 senior / 500 Pro. Pro gets 50 + 40%*50 = 70,
    // then pays the entire 80 claim. Senior keeps 30. Total profit is 20.
    expect(await ctx.pool.juniorAssets()).to.equal(U(490));
    expect(await ctx.pool.totalAssets()).to.equal(U(1030));
    expect(await ctx.pool.physicalAssets()).to.equal(U(1520));
  });

  it("60% fee only breaks even for Pro on the same 80% loss-ratio book", async function () {
    const ctx = await setup(6000);
    await period(ctx, 100, 80);
    expect(await ctx.pool.juniorAssets()).to.equal(U(500));
    expect(await ctx.pool.totalAssets()).to.equal(U(1020));
  });

  it("senior premiums are not consumed before Pro principal", async function () {
    const ctx = await setup();
    await period(ctx, 100, 100);
    // Even though aggregate premiums equal claims, Pro loses 30 principal.
    expect(await ctx.pool.juniorAssets()).to.equal(U(470));
    expect(await ctx.pool.totalAssets()).to.equal(U(1030));
    expect(await ctx.pool.physicalAssets()).to.equal(U(1500));
  });

  it("Pro earns a profit when its premium allocation exceeds claims", async function () {
    const ctx = await setup();
    await period(ctx, 100, 20);
    expect(await ctx.pool.juniorAssets()).to.equal(U(550));
    expect(await ctx.pool.totalAssets()).to.equal(U(1030));
  });
});

describe("Economic audit: conditions of Saver principal protection", function () {
  async function noteSetup() {
    const [admin, saver, holder] = await ethers.getSigners();
    const usd = await (await ethers.getContractFactory("TestUSD")).deploy();
    const identity = await (await ethers.getContractFactory("IdentityRegistry")).deploy(admin.address);
    const tbill = await (await ethers.getContractFactory("TBillVault")).deploy(usd, identity, 420, admin.address);
    const pool = await (await ethers.getContractFactory("UnderwritingPool")).deploy(usd, identity, admin.address);
    const note = await (await ethers.getContractFactory("ProtectedNote")).deploy(
      "Audit note", "AUDIT", usd, identity, tbill, pool,
      30 * 86400, 3 * 365 * 86400, 400, 30 * 86400, admin.address);
    const block = await ethers.provider.getBlock("latest");
    await identity.setIdentity(saver.address, true, 840, block.timestamp + 4 * 365 * 86400);
    for (const contract of [tbill, pool, note]) await identity.setSystem(contract, true);
    await usd.transfer(saver.address, U(1000));
    await usd.connect(saver).approve(note, U(1000));
    return { admin, saver, holder, usd, tbill, pool, note };
  }

  it("accepts a subscription after the vault rate falls below the floor assumption and can repay below face", async function () {
    const { time } = require("@nomicfoundation/hardhat-network-helpers");
    const { saver, holder, tbill, pool, note, usd } = await noteSetup();
    // The constructor checked 4% <= 4.2%; the vault rate can subsequently change.
    await tbill.updateNav(0, 0);
    await note.connect(saver).subscribe(U(1000));
    await pool.grantRole(await pool.MARKET_ROLE(), (await ethers.getSigners())[0].address);
    await pool.setRiskParams(2000, 2500, 10000, 4000);
    const symbol = ethers.id("AUDIT_LOSS"), market = ethers.id("US");
    // An admissible $20 underwriting loss; no Pro tranche in this example.
    await pool.lock(symbol, market, U(20));
    await pool.release(symbol, market, U(20), holder.address, U(20));
    await time.increaseTo(Number(await note.maturity()));
    await note.mature();
    const before = await usd.balanceOf(saver.address);
    await note.connect(saver).redeem();
    const repaid = (await usd.balanceOf(saver.address)) - before;
    expect(repaid).to.be.lessThan(U(1000));
    expect(Number(repaid) / 1e6).to.be.closeTo(980, 0.01);
  });

  it("accrued NAV without funded yield can prevent maturity redemption", async function () {
    const { time } = require("@nomicfoundation/hardhat-network-helpers");
    const { saver, note } = await noteSetup();
    await note.connect(saver).subscribe(U(1000));
    await time.increaseTo(Number(await note.maturity()));
    await expect(note.mature()).to.be.revertedWith("liquidity: T-bills settling");
  });
});
