/**
 * Blockchain Audit Trail API
 * 
 * Endpoints for verifying records and checking blockchain status.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/validate.js';
import { getBlockchainStats, verifyBlockchainRecord } from '../blockchain/audit.js';

export const blockchainRouter = Router();

/**
 * GET /api/blockchain/status
 * Get blockchain audit trail statistics
 */
blockchainRouter.get('/status', authenticate, asyncHandler(async (req, res) => {
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
