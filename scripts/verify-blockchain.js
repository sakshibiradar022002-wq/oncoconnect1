/**
 * Verify records on the VELTRUVIA blockchain audit trail
 * Run: npm run blockchain:verify [record-hash]
 */

import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

async function main() {
  const recordArg = process.argv[2];
  
  console.log('🔗 VELTRUVIA Blockchain Verification\n');

  // Connect to blockchain
  const { ethers } = await import('ethers');
  const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
  
  try {
    await provider.getNetwork();
    console.log('✅ Connected to blockchain');
  } catch (error) {
    console.error('❌ Cannot connect to blockchain');
    console.error('   Start Hardhat node first: npm run blockchain:node');
    process.exit(1);
  }

  // Load contract
  const abiPath = join(ROOT, 'artifacts/contracts/AuditTrail.sol/AuditTrail.json');
  const deploymentPath = join(ROOT, 'deployment.json');
  
  if (!existsSync(abiPath) || !existsSync(deploymentPath)) {
    console.error('❌ Contract not deployed. Run: npm run blockchain:deploy');
    process.exit(1);
  }

  const artifact = JSON.parse(readFileSync(abiPath, 'utf8'));
  const deployment = JSON.parse(readFileSync(deploymentPath, 'utf8'));
  const signer = await provider.getSigner(0);
  const contract = new ethers.Contract(deployment.address, artifact.abi, signer);

  // Get stats
  const entryCount = await contract.getEntryCount();
  const latestHash = await contract.latestChainHash();
  
  console.log(`\n📊 Blockchain Statistics:`);
  console.log(`   Total Audit Entries: ${entryCount}`);
  console.log(`   Latest Chain Hash: ${latestHash}`);
  console.log(`   Contract Address: ${deployment.address}`);

  // If a record hash was provided, verify it
  if (recordArg) {
    console.log(`\n🔍 Verifying record: ${recordArg}`);
    
    const hashBytes = '0x' + recordArg;
    const [exists, entryIds] = await contract.verifyRecord(hashBytes);
    
    if (exists) {
      console.log('✅ Record FOUND in blockchain');
      console.log(`   Entry Count: ${entryIds.length}`);
      
      // Get details of first entry
      const entry = await contract.getEntry(entryIds[0]);
      console.log(`\n📋 Entry Details:`);
      console.log(`   Action: ${entry.action}`);
      console.log(`   Target ID: ${entry.targetId}`);
      console.log(`   Timestamp: ${new Date(Number(entry.timestamp) * 1000).toISOString()}`);
      console.log(`   Actor: ${entry.actor}`);
    } else {
      console.log('❌ Record NOT FOUND in blockchain');
    }
  } else {
    console.log('\n💡 To verify a specific record, run:');
    console.log('   npm run blockchain:verify <record-hash>');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Verification failed:', error);
    process.exit(1);
  });
