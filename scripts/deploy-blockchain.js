/**
 * Deploy VELTRUVIA AuditTrail smart contract
 * Run: npm run blockchain:deploy
 */

import { ethers } from 'ethers';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

async function main() {
  console.log('🔗 Deploying VELTRUVIA AuditTrail contract...\n');

  // Connect to local Hardhat network
  const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
  
  try {
    await provider.getNetwork();
    console.log('✅ Connected to Hardhat network');
  } catch (error) {
    console.error('❌ Cannot connect to Hardhat network');
    console.error('   Start Hardhat node first: npx hardhat node');
    process.exit(1);
  }

  // Get signer (first account)
  const signer = await provider.getSigner(0);
  const address = await signer.getAddress();
  console.log(`📝 Deploying from: ${address}`);

  // Load contract artifact
  const artifactPath = join(ROOT, 'artifacts/contracts/AuditTrail.sol/AuditTrail.json');
  
  if (!existsSync(artifactPath)) {
    console.error('❌ Contract not compiled. Run: npx hardhat compile');
    process.exit(1);
  }

  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
  
  // Deploy contract
  console.log('🚀 Deploying AuditTrail...');
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
  const contract = await factory.deploy();
  
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();
  
  console.log(`✅ AuditTrail deployed to: ${contractAddress}`);

  // Save deployment info
  const deploymentInfo = {
    address: contractAddress,
    network: 'localhost',
    deployedAt: new Date().toISOString(),
    deployer: address,
    chainId: Number((await provider.getNetwork()).chainId)
  };

  const deploymentPath = join(ROOT, 'deployment.json');
  writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`💾 Deployment info saved to deployment.json`);

  // Verify deployment
  const owner = await contract.owner();
  const entryCount = Number(await contract.getEntryCount());
  console.log(`\n📋 Contract Details:`);
  console.log(`   Owner: ${owner}`);
  console.log(`   Entry Count: ${entryCount}`);
  console.log(`   Network: localhost`);
  
  console.log('\n✅ Deployment complete!');
  console.log('   The blockchain audit trail is ready to use.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Deployment failed:', error);
    process.exit(1);
  });
