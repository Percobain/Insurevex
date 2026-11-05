const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const U = (n) => ethers.parseUnits(String(n), 6);
const DAY = 86400;
const TYPES = { Quote: [
  { name: "buyer", type: "address" }, { name: "symbol", type: "bytes32" }, { name: "market", type: "bytes32" }, { name: "notional", type: "uint256" },
  { name: "shares", type: "uint256" }, { name: "heldShares", type: "uint256" }, { name: "deductibleBps", type: "uint32" },
  { name: "capBps", type: "uint32" }, { name: "premium", type: "uint256" }, { name: "startPrice", type: "uint256" },
  { name: "expiry", type: "uint64" }, { name: "validUntil", type: "uint64" }, { name: "nonce", type: "uint256" }] };

describe("Per-market exposure cap", () => {
  it("stops new cover in one market at 25% of capacity while other markets stay open", async () => {
    const [admin, holder] = await ethers.getSigners();
    const usd = await (await ethers.getContractFactory("TestUSD")).deploy();
    const idr = await (await ethers.getContractFactory("IdentityRegistry")).deploy(admin.address);
    const oracle = await (await ethers.getContractFactory("PriceOracle")).deploy(admin.address);
    const pool = await (await ethers.getContractFactory("UnderwritingPool")).deploy(usd, idr, admin.address);
    const market = await (await ethers.getContractFactory("CoverMarket")).deploy(usd, idr, oracle, pool, admin.address, admin.address);
    await idr.setSystem(await market.getAddress(), true);
    await pool.grantRole(await pool.MARKET_ROLE(), await market.getAddress());
    const exp = (await time.latest()) + 365 * DAY;
    await idr.setIdentity(admin.address, true, 840, exp);
    await idr.setIdentity(holder.address, true, 356, exp);
    await usd.approve(pool, U(10_000));
    await pool.depositPro(U(10_000)); // capacity 10,000; market cap 2,500; symbol cap 500
    await usd.transfer(holder.address, U(1_000));
    await usd.connect(holder).approve(market, U(1_000));
    const net = await ethers.provider.getNetwork();
    const domain = { name: "InsureVEX CoverMarket", version: "1", chainId: net.chainId, verifyingContract: await market.getAddress() };
    const now = await time.latest();
    let nonce = 1;
    const buy = async (sym, mkt) => {
      const q = { buyer: holder.address, symbol: ethers.id(sym), market: ethers.id(mkt), notional: U(2_000), shares: 1n, heldShares: 1n,
        deductibleBps: 300, capBps: 2000, premium: U(1), startPrice: 1e8, expiry: now + 7 * DAY, validUntil: now + 600, nonce: nonce++ };
      return market.connect(holder).buyCover(q, await admin.signTypedData(domain, TYPES, q));
    };
    // each policy locks 400; five Indian names = 2,000 <= 2,500, the sixth would be 2,400 + ... -> 7th breaches
    for (const s of ["NSE:A", "NSE:B", "NSE:C", "NSE:D", "NSE:E", "NSE:F"]) await buy(s, "IN");
    await expect(buy("NSE:G", "IN")).to.be.revertedWith("market cap");
    await buy("TSE:7203", "JP"); // another market is still open
    expect(await pool.lockedByMarket(ethers.id("IN"))).to.equal(U(2_400));
  });
});
