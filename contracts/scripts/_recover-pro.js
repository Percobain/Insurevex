const fs=require('fs');const path=require('path');const {ethers,network}=require('hardhat');
async function main(){const [me]=await ethers.getSigners();const d=JSON.parse(fs.readFileSync(path.join(__dirname,'..','deployments',network.name+'.json')));
const pool=new ethers.Contract(d.contracts.UnderwritingPool,['function maxProWithdraw(address) view returns (uint256)','function withdrawPro(uint256)'],me);
const m=await pool.maxProWithdraw(me.address);console.log(network.name,'withdrawable Pro',ethers.formatUnits(m,6));
if(m>1000n){const r=await (await pool.withdrawPro(m-1000n)).wait();console.log('withdrawn tx',r.hash);}}
main().catch(e=>{console.error(e.shortMessage||e.message);process.exit(1)});
