// Swap test WBT -> official test USDT on Whitechain Sepolia through the public Uniswap v3 SwapRouter02.
// Testnet only (chain 1874). Usage: npx hardhat run scripts/whitechain-get-usdt.js --network whitechainSepolia
const { ethers, network } = require("hardhat");
const ROUTER = "0xe208cC685cD95D56E8ec6DEC9816476567fc6962";
const WWBT = "0x4200000000000000000000000000000000000006";
const USDT = "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7";
async function main() {
  if (network.config.chainId !== 1874) throw new Error("Whitechain Sepolia only");
  const [me] = await ethers.getSigners();
  const amountIn = ethers.parseEther(process.env.WBT_IN || "1.2");
  const router = new ethers.Contract(ROUTER, ["function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)"], me);
  const usdt = new ethers.Contract(USDT, ["function balanceOf(address) view returns (uint256)"], me);
  const before = await usdt.balanceOf(me.address);
  const tx = await router.exactInputSingle({ tokenIn: WWBT, tokenOut: USDT, fee: 3000, recipient: me.address, amountIn, amountOutMinimum: 0, sqrtPriceLimitX96: 0 }, { value: amountIn });
  const r = await tx.wait();
  console.log("swap tx", r.hash, "USDT received", ethers.formatUnits((await usdt.balanceOf(me.address)) - before, 6));
}
main().catch((e) => { console.error(e); process.exit(1); });
