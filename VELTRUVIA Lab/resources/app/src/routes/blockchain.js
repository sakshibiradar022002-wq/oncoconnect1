/**
 * Blockchain Audit Trail API
 * 
 * Endpoints for verifying records and checking blockchain status.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/validate.js';
import { getBlockchainStats, verifyBlockchainRecord } from '../blockchain/audit.js';
import blockchain from '../blockchain/index.js';

export const blockchainRouter = Router();

/**
 * GET /api/blockchain/status
 * Get blockchain audit trail statistics
 */
// Public: blockchain.html loads before login, and the data is non-sensitive
// statistics (block counts and validity) — matches /api/blockchain/health.
blockchainRouter.get('/status', asyncHandler(async (req, res) => {
  const stats = await getBlockchainStats();
  res.json({
    ok: true,
    blockchain: stats,
    message: stats.connected 
      ? 'Blockchain audit trail is active' 
      : 'Blockchain not connected - start Hardhat node'
  });
}));

/**
 * GET /api/blockchain/blocks?limit=N
 * v2.5.2 — public, read-only ledger introspection for the /verify.html
 * tamper-evidence page. Returns only non-sensitive hash/chain metadata:
 * no record payloads, no actor ids, no timestamps beyond minute precision.
 */
blockchainRouter.get('/blocks', asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const chain = await blockchain.snapshot();
  const blocks = chain.slice(-limit).map(b => ({
    index: b.index,
    timestamp: typeof b.timestamp === 'string' ? b.timestamp.slice(0, 16) : b.timestamp, // minute precision only
    type: (b.data && (b.data.type === 'genesis' ? 'genesis' : 'audit')) || 'audit',
    action: b.data && typeof b.data.action === 'string' ? b.data.action : null,
    previousHash: b.previousHash,
    hash: b.hash,
  }));
  res.json({ ok: true, totalBlocks: chain.length, blocks });
}));

/**
 * POST /api/blockchain/verify
 * Verify a record exists in the blockchain
 */
blockchainRouter.post('/verify', authenticate, asyncHandler(async (req, res) => {
  const { record } = req.body;
  
  if (!record) {
    return res.status(400).json({ error: 'Record is required' });
  }
  
  const result = await verifyBlockchainRecord(record);
  
  res.json({
    ok: true,
    verification: result
  });
}));

/**
 * GET /api/blockchain/health
 * Health check for blockchain connection
 */
blockchainRouter.get('/health', asyncHandler(async (req, res) => {
  const stats = await getBlockchainStats();
  
  if (stats.connected) {
    res.json({
      ok: true,
      status: 'healthy',
      entryCount: stats.entryCount,
      network: stats.network
    });
  } else {
    res.status(503).json({
      ok: false,
      status: 'disconnected',
      message: 'Blockchain node not available'
    });
  }
}));
