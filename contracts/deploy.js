// VELTRUVIA — one-command anchor deployment to Sepolia (free testnet).
// Prereqs (one-time, Sara's side):
//   1. MetaMask wallet → switch to Sepolia network → account details →
//      "Show private key" → copy it
//   2. Free Sepolia ETH from a faucet (Google/GitHub login, no donation):
//        https://sepolia-faucet.pk910.de   (PoW faucet — leave the tab open
//        ~20 min; it mines more than enough for hundreds of thousands of txs)
//   3. Put the key in this folder's .env:  ANCHOR_PRIVATE_KEY=0x....
// Then:  npm install && npm run deploy
const { writeFileSync, copyFileSync } = require('node:fs');

async function main() {
  if (!process.env.ANCHOR_PRIVATE_KEY) {
    console.error('Missing ANCHOR_PRIVATE_KEY in contracts/.env (see README.md steps 1-3)');
    process.exit(1);
  }
  const hre = require('hardhat');
  console.log('⟳ deploying AuditTrail to Sepolia…');
  const factory = await hre.ethers.getContractFactory('AuditTrail');
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log('\n✅ AuditTrail deployed to:', address);
  console.log('   Network: sepolia (chain 11155111)');
  console.log('   View: https://sepolia.etherscan.io/address/' + address);

  const out = JSON.stringify({ network: 'sepolia', address, deployedAt: new Date().toISOString() }, null, 2);
  writeFileSync('deployment.json', out);
  try { copyFileSync('deployment.json', '../VELTRUVIA Server/resources/app/deployment.json'); } catch {}
  console.log('   deployment.json written (and copied into the app folder).');
  console.log('\nNext: add SEPOLIA_RPC_URL + ANCHOR_PRIVATE_KEY (+ ethers) to the VM,');
  console.log('restart — the server then anchors every audit block on-chain.');
}

main().catch(e => { console.error(e); process.exit(1); });
