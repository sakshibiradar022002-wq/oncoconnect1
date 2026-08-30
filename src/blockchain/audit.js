/**
 * Blockchain Audit Middleware
 * 
 * Automatically records audit entries on the blockchain for important actions.
 * Falls back gracefully if blockchain is unavailable.
 */

import blockchain from './index.js';

/**
 * Middleware to record blockchain audit for sync operations
 */
export function blockchainAudit(action) {
  return async (req, res, next) => {
    // Store original json method
    const originalJson = res.json.bind(res);
    
    // Override json to capture response and record audit
    res.json = function(data) {
      // Record audit asynchronously (don't block response)
      if (data && data.ok) {
        const auditData = {
          record: {
            action,
            subjectId: req.auth?.subjectId,
            ip: req.ip,
            timestamp: new Date().toISOString(),
            responseOk: data.ok
          },
          action,
          targetId: req.auth?.subjectId || 'unknown',
          actorId: req.auth?.subjectId
        };
        
        blockchain.recordAudit(auditData).catch(err => {
          console.error('[blockchain-audit] Failed:', err.message);
        });
      }
      
      return originalJson(data);
    };
    
    next();
  };
}

/**
 * Record a custom audit entry
 */
export async function recordBlockchainAudit({ record, action, targetId, actorId }) {
  return blockchain.recordAudit({ record, action, targetId, actorId });
}

/**
 * Verify a record on the blockchain
 */
export async function verifyBlockchainRecord(record) {
  return blockchain.verifyRecord(record);
}

/**
 * Get blockchain audit statistics
 */
export async function getBlockchainStats() {
  return blockchain.getStats();
}

export default {
  blockchainAudit,
  recordBlockchainAudit,
  verifyBlockchainRecord,
  getBlockchainStats
};
