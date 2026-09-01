/**
 * VELTRUVIA Blockchain Integration
 * 
 * Provides tamper-proof audit trail using a local Hardhat blockchain.
 * Medical record hashes are stored on-chain while actual data remains
 * encrypted in the existing database.
 */

import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');

class BlockchainAudit {
  constructor() {
    this.provider = null;
    this.contract = null;
    this.signer = null;
    this.connected = false;
  }

  /**
   * Connect to the local Hardhat blockchain
   */
  async connect(rpcUrl = 'http://127.0.0.1:8545') {
    try {
      const { ethers } = await import('ethers');
      
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
      await this.provider.getNetwork();
      
      // Load ABI and deployment info
      const abiPath = join(PROJECT_ROOT, 'artifacts/contracts/AuditTrail.sol/AuditTrail.json');
      const deploymentPath = join(PROJECT_ROOT, 'deployment.json');
      
      if (!existsSync(abiPath) || !existsSync(deploymentPath)) {
        console.warn('[blockchain] Contract not deployed. Run: npm run blockchain:deploy');
        return false;
      }
      
      const artifact = JSON.parse(readFileSync(abiPath, 'utf8'));
      const deployment = JSON.parse(readFileSync(deploymentPath, 'utf8'));
      
      this.signer = await this.provider.getSigner(0);
      this.contract = new ethers.Contract(deployment.address, artifact.abi, this.signer);
      
      this.connected = true;
      console.log(`[blockchain] ✅ Connected to AuditTrail at ${deployment.address}`);
      return true;
    } catch (error) {
      console.error('[blockchain] Connection failed:', error.message);
      this.connected = false;
      return false;
    }
  }

  /**
   * Hash a record for blockchain storage
   */
  hashRecord(record) {
    const data = typeof record === 'string' ? record : JSON.stringify(record);
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Record an audit entry on the blockchain
   */
  async recordAudit({ record, action, targetId, actorId }) {
    if (!this.connected || !this.contract) {
      return null;
    }

    try {
      const recordHash = this.hashRecord(record);
      const hashBytes = '0x' + recordHash;
      
      const tx = await this.contract.recordAudit(hashBytes, action, targetId);
      const receipt = await tx.wait();
      
      return {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        recordHash,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('[blockchain] Failed to record audit:', error.message);
      return null;
    }
  }

  /**
   * Verify a record exists in the blockchain
   */
  async verifyRecord(record) {
    if (!this.connected || !this.contract) {
      return { verified: false, error: 'Blockchain not connected' };
    }

    try {
      const recordHash = this.hashRecord(record);
      const hashBytes = '0x' + recordHash;
      
      const [exists, entryIds] = await this.contract.verifyRecord(hashBytes);
      
      if (exists) {
        const entry = await this.contract.getEntry(entryIds[0]);
        return {
          verified: true,
          recordHash,
          entryCount: entryIds.length,
          onChain: {
            action: entry.action,
            targetId: entry.targetId,
            timestamp: new Date(Number(entry.timestamp) * 1000).toISOString()
          }
        };
      }
      
      return { verified: false, recordHash, error: 'Record not found in blockchain' };
    } catch (error) {
      return { verified: false, error: error.message };
    }
  }

  /**
   * Get blockchain audit statistics
   */
  async getStats() {
    if (!this.connected || !this.contract) {
      return { connected: false, message: 'Blockchain not connected' };
    }

    try {
      const entryCount = await this.contract.getEntryCount();
      const latestHash = await this.contract.latestChainHash();
      const network = await this.provider.getNetwork();
      
      return {
        connected: true,
        entryCount: Number(entryCount),
        latestChainHash: latestHash,
        network: network.name,
        chainId: Number(network.chainId)
      };
    } catch (error) {
      return { connected: false, error: error.message };
    }
  }
}

// Singleton
const blockchain = new BlockchainAudit();

export default blockchain;
export { BlockchainAudit };
