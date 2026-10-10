/**
 * VELTRUVIA Blockchain Integration
 *
 * Tamper-proof audit trail with two backends:
 *  1. Hardhat/EVM contract (primary when deployed — record hashes on-chain).
 *  2. Shared file chain (fallback): the SAME data/chain.json the Electron
 *     apps maintain — identical block format, so the Server appends to and
 *     reads the one shared chain instead of reporting "disconnected".
 *
 * Medical record hashes are stored on-chain while actual data remains
 * encrypted in the existing database.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');

// ── Shared file chain (same format as electron/blockchain.js) ────────
function chainFilePath() {
  const dir = config.dbPath ? dirname(config.dbPath) : join(process.cwd(), 'data');
  try { mkdirSync(dir, { recursive: true }); } catch {}
  return join(dir, 'chain.json');
}

function calculateHash(block) {
  const { index, timestamp, data, previousHash } = block;
  return createHash('sha256').update(`${index}${timestamp}${JSON.stringify(data)}${previousHash}`).digest('hex');
}

function readChain() {
  try {
    const file = chainFilePath();
    if (existsSync(file)) {
      const data = JSON.parse(readFileSync(file, 'utf8'));
      if (Array.isArray(data.chain) && data.chain.length > 0) return data.chain;
    }
  } catch { /* unreadable — treated as empty */ }
  return null;
}

function writeChain(chain) {
  try {
    const file = chainFilePath();
    const tmp = `${file}.tmp-${process.pid}`;
    writeFileSync(tmp, JSON.stringify({ chain }, null, 2));
    renameSync(tmp, file);
    return true;
  } catch {
    return false;
  }
}

function fileAppend(data, app = 'server') {
  // Disk is authoritative: adopt other apps' blocks, then extend the tip.
  let chain = readChain();
  if (!chain) {
    const genesis = {
      index: 0,
      timestamp: new Date().toISOString(),
      data: { type: 'genesis', message: 'VELTRUVIA Blockchain Initialized' },
      previousHash: '0'.repeat(64),
      hash: '',
      app: 'system',
    };
    genesis.hash = calculateHash(genesis);
    chain = [genesis];
  }
  const prev = chain[chain.length - 1];
  const block = {
    index: prev.index + 1,
    timestamp: new Date().toISOString(),
    data,
    previousHash: prev.hash,
    hash: '',
    app,
  };
  block.hash = calculateHash(block);
  chain.push(block);
  return writeChain(chain) ? block : null;
}

function fileVerify() {
  const chain = readChain() || [];
  for (let i = 1; i < chain.length; i++) {
    if (chain[i].hash !== calculateHash(chain[i])) return { valid: false, error: `Block ${i} hash mismatch` };
    if (chain[i].previousHash !== chain[i - 1].hash) return { valid: false, error: `Block ${i} previous hash mismatch` };
  }
  return { valid: true, chainLength: chain.length };
}

class BlockchainAudit {
  constructor() {
    this.provider = null;
    this.contract = null;
    this.signer = null;
    this.connected = false;
    this.backend = null; // 'hardhat' | 'file'
  }

  /**
   * Lazy fallback: if connect() was never called (e.g. Electron standalone
   * mode loads app.js without server.js), the shared file chain is still
   * usable — every API method activates it on first use.
   */
  _ensureBackend() {
    if (!this.connected) {
      this.connected = true;
      this.backend = 'file';
    }
  }

  /**
   * Connect to the local Hardhat blockchain; fall back to the shared
   * file chain when no node is running (normal desktop operation).
   */
  async connect(rpcUrl = 'http://127.0.0.1:8545') {
    // 0) Sepolia anchor mode: BLOCKCHAIN_MODE=sepolia + a deployed contract.
    //    Anchors the audit chain onto the public testnet (tamper-evidence
    //    beyond the VM). Uses its own wallet (ANCHOR_PRIVATE_KEY), NOT the
    //    Hardhat getSigner path below.
    if (String(process.env.BLOCKCHAIN_MODE || '').toLowerCase() === 'sepolia'
        && process.env.ANCHOR_PRIVATE_KEY) {
      try {
        const { ethers } = await import('ethers');
        const deploymentPath = join(PROJECT_ROOT, 'deployment.json');
        if (existsSync(deploymentPath)) {
          const deployment = JSON.parse(readFileSync(deploymentPath, 'utf8'));
          this.provider = new ethers.JsonRpcProvider(
            process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com');
          this.signer = new ethers.Wallet(process.env.ANCHOR_PRIVATE_KEY, this.provider);
          // Minimal ABI — only what anchoring needs.
          const abi = [
            'function recordAudit(bytes32 recordHash, string action, string targetId)',
            'function verifyRecord(bytes32 recordHash) view returns (bool, uint256[])',
            'function getEntry(uint256 id) view returns (bytes32, string, string, uint64, bytes32)',
            'function getEntryCount() view returns (uint256)',
            'function latestChainHashValue() view returns (bytes32)',
            'event EntryRecorded(uint256 indexed id, bytes32 recordHash, string action, bytes32 previousHash)',
          ];
          this.contract = new ethers.Contract(deployment.address, abi, this.signer);
          this.connected = true;
          this.backend = 'sepolia';
          const addr = await this.signer.getAddress();
          console.log(`[blockchain] ✅ Sepolia anchor active: contract ${deployment.address}, wallet ${addr}`);
          return true;
        }
        console.warn('[blockchain] sepolia mode but deployment.json missing — file chain fallback');
      } catch (error) {
        console.warn('[blockchain] sepolia anchor init failed:', error.message, '— file chain fallback');
      }
    }

    // 1) Try Hardhat briefly so a real deployment still uses on-chain storage.
    try {
      const { ethers } = await import('ethers');
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
      await Promise.race([
        this.provider.getNetwork(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 800)),
      ]);

      const abiPath = join(PROJECT_ROOT, 'artifacts/contracts/AuditTrail.sol/AuditTrail.json');
      const deploymentPath = join(PROJECT_ROOT, 'deployment.json');

      if (existsSync(abiPath) && existsSync(deploymentPath)) {
        const artifact = JSON.parse(readFileSync(abiPath, 'utf8'));
        const deployment = JSON.parse(readFileSync(deploymentPath, 'utf8'));
        this.signer = await this.provider.getSigner(0);
        this.contract = new ethers.Contract(deployment.address, artifact.abi, this.signer);
        this.connected = true;
        this.backend = 'hardhat';
        console.log(`[blockchain] ✅ Connected to AuditTrail at ${deployment.address}`);
        return true;
      }
      console.warn('[blockchain] Contract not deployed. Run: npm run blockchain:deploy');
    } catch (error) {
      console.log('[blockchain] No Hardhat node — using shared file chain');
    }

    // 2) Shared file chain (same data/chain.json the Electron apps use).
    this.connected = true;
    this.backend = 'file';
    const chain = readChain() || [];
    console.log(`[blockchain] ✅ File chain active (${chain.length} blocks) at ${chainFilePath()}`);
    return true;
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
    this._ensureBackend();
    if (!this.connected) return null;

    // Sepolia mode: the FILE chain stays the local source of truth (fast,
    // always works); the record hash is additionally stamped on-chain
    // asynchronously — a failed tx never blocks or loses the local block.
    if (this.backend === 'sepolia' && this.contract) {
      const local = fileAppend({ type: 'audit', action, details: { record, targetId, actorId } }, 'server');
      const recordHash = this.hashRecord(record);
      let txInfo = null;
      try {
        const tx = await this.contract.recordAudit('0x' + recordHash, String(action || 'audit'), String(targetId || 'unknown'));
        const receipt = await tx.wait();
        txInfo = { txHash: receipt.hash, blockNumber: receipt.blockNumber };
      } catch (error) {
        console.error('[blockchain] sepolia anchor tx failed (local chain unaffected):', error.message);
      }
      return {
        txHash: txInfo?.txHash ?? local?.hash,
        blockNumber: txInfo?.blockNumber ?? local?.index,
        recordHash,
        timestamp: local?.timestamp ?? new Date().toISOString(),
        backend: 'file+sepolia',
      };
    }

    if (this.backend === 'file') {
      const block = fileAppend({
        type: 'audit',
        action,
        details: { record, targetId, actorId },
      }, 'server');
      if (!block) {
        console.error('[blockchain] Failed to append audit block');
        return null;
      }
      return {
        txHash: block.hash,
        blockNumber: block.index,
        recordHash: this.hashRecord(record),
        timestamp: block.timestamp,
        backend: 'file',
      };
    }

    if (!this.contract) return null;
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
    this._ensureBackend();
    if (!this.connected) {
      return { verified: false, error: 'Blockchain not connected' };
    }

    const recordHash = this.hashRecord(record);

    if (this.backend === 'file') {
      const chain = readChain() || [];
      const recordJson = JSON.stringify(record ?? null);
      const matches = chain.filter(b => {
        const d = b.data || {};
        const candidate = d.details?.record ?? d.record ?? null;
        return JSON.stringify(candidate) === recordJson;
      });
      if (matches.length > 0) {
        const first = matches[0];
        return {
          verified: true,
          recordHash,
          entryCount: matches.length,
          onChain: {
            action: first.data.action || first.data.type,
            targetId: first.data.details?.targetId ?? null,
            timestamp: first.timestamp,
            blockIndex: first.index,
            app: first.app,
          }
        };
      }
      return { verified: false, recordHash, error: 'Record not found in blockchain' };
    }

    if (!this.contract) {
      return { verified: false, error: 'Blockchain not connected' };
    }
    try {
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
  /**
   * v2.5.2: read-only snapshot of the current file chain, for public
   * verification (/api/blockchain/blocks). Mirrors readChain() but expands
   * the fallback to in-memory data — safe: callers only read.
   */
  async snapshot() {
    this._ensureBackend();
    const chain = readChain();
    if (chain && chain.length) return chain;
    return [];
  }

  async getStats() {
    this._ensureBackend();
    if (!this.connected) {
      return { connected: false, message: 'Blockchain not connected' };
    }

    if (this.backend === 'file') {
      const chain = readChain() || [];
      const types = {};
      const apps = {};
      for (const b of chain) {
        if (b.data) {
          types[b.data.type] = (types[b.data.type] || 0) + 1;
          apps[b.app] = (apps[b.app] || 0) + 1;
        }
      }
      return {
        connected: true,
        backend: 'file',
        entryCount: Math.max(0, chain.length - 1),
        totalBlocks: chain.length,
        latestChainHash: chain.length ? chain[chain.length - 1].hash : null,
        chainValid: fileVerify().valid,
        recordsByType: types,
        recordsByApp: apps,
        chainFile: chainFilePath(),
        network: 'veltruvia-local-file',
        chainId: 'local',
      };
    }

    if (!this.contract) {
      return { connected: false, message: 'Blockchain not connected' };
    }
    try {
      const entryCount = await this.contract.getEntryCount();
      // Sepolia contract exposes latestChainHashValue(); Hardhat artifact ABI
      // historically used latestChainHash() — try both.
      const latestHash = this.backend === 'sepolia'
        ? await this.contract.latestChainHashValue()
        : await this.contract.latestChainHash();
      const network = await this.provider.getNetwork();
      return {
        connected: true,
        backend: this.backend,
        entryCount: Number(entryCount),
        latestChainHash: latestHash,
        network: this.backend === 'sepolia' ? 'sepolia' : network.name,
        chainId: Number(network.chainId),
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
