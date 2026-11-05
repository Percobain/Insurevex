#!/usr/bin/env bash
# One command to finish the Hedera and Arc deployments once the test wallet is funded (TESTNETS ONLY).
#   Hedera: ~45 testnet HBAR (portal.hedera.com faucet).   Arc: ~20 USDC (faucet.circle.com, "Arc Testnet").
# The InsureVEX server must be running (cd server && npm start) so quotes can be signed.
#   bash scripts/finish-deploy.sh hedera
#   bash scripts/finish-deploy.sh arc
set -euo pipefail
cd "$(dirname "$0")/.."
SERVER="${SERVER:-http://localhost:8080}"
case "${1:-}" in
  hedera)
    npx hardhat run scripts/deploy.js --network hederaTestnet
    npx hardhat run scripts/hedera-ats.js --network hederaTestnet          # ATS equity + bond, KYC, issue, setCoupon
    SERVER=$SERVER SUB3Y=500 SUBDEMO=100 PRO=200 \
      COVERS='[{"symbol":"NASDAQ:NVDA","notional":50,"tenorDays":7,"deductibleBps":1500},{"symbol":"NSE:RELIANCE","notional":50,"tenorDays":7,"deductibleBps":500},{"symbol":"NYSEARCA:SPY","notional":50,"tenorMinutes":15,"deductibleBps":300}]' \
      npx hardhat run scripts/lifecycle-live.js --network hederaTestnet
    npx hardhat run scripts/verify.js --network hederaTestnet || true      # Sourcify -> HashScan
    ;;
  arc)
    npx hardhat run scripts/deploy.js --network arcTestnet
    SERVER=$SERVER SUB3Y=6 SUBDEMO=2 PRO=2 \
      COVERS='[{"symbol":"NASDAQ:MSFT","notional":1,"tenorDays":7,"deductibleBps":300},{"symbol":"HKEX:0700","notional":1,"tenorDays":14,"deductibleBps":500},{"symbol":"NYSEARCA:SPY","notional":1,"tenorMinutes":15,"deductibleBps":300}]' \
      npx hardhat run scripts/lifecycle-live.js --network arcTestnet
    npx hardhat run scripts/verify.js --network arcTestnet || true
    ;;
  *) echo "usage: $0 hedera|arc"; exit 1 ;;
esac
cp deployments/*.json ../app/src/deployments/ 2>/dev/null || true
echo "done. Rebuild the app (cd ../app && npm run build) and restart the server so it picks up the new chain."
