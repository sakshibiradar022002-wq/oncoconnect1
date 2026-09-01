/**
 * VELTRUVIA Blockchain — Lightweight chain for cross-app linking.
 * 
 * Each app (Doctor, Patient, Lab) writes blocks to a shared JSON file.
 * No external blockchain node needed. Provides tamper-evident linking:
 * - Doctor creates patient record → writes block
 * - Patient app reads chain → verifies and displays record
 * - Lab uploads results → writes block
 * - Doctor verifies lab results via chain
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { app } from 'electron';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Shared blockchain file — all apps read/write here
const CHAIN_DIR = join(app.getPath('userData'), 'blockchain');
const CHAIN_FILE = join(CHAIN_DIR, 'chain.json');

class Blockchain {
  constructor() {
    this.chain = [];
    this.load();
  }

  /**
   * Load chain from disk
   */
  load() {
    try {
      if (!existsSync(CHAIN_DIR)) {
        mkdirSync(CHAIN_DIR, { recursive: true });
      }
      if (existsSync(CHAIN_FILE)) {
        const data = JSON.parse(readFileSync(CHAIN_FILE, 'utf8'));
        this.chain = data.chain || [];
      }
      // Create genesis block if chain is empty
      if (this.chain.length === 0) {
        this.chain.push(this.createGenesisBlock());
        this.save();
      }
    } catch (err) {
      console.error('[blockchain] Failed to load chain:', err.message);
      this.chain = [this.createGenesisBlock()];
      this.save();
    }
  }

  /**
   * Save chain to disk
   */
  save() {
    try {
      if (!existsSync(CHAIN_DIR)) {
        mkdirSync(CHAIN_DIR, { recursive: true });
      }
      writeFileSync(CHAIN_FILE, JSON.stringify({ chain: this.chain }, null, 2));
    } catch (err) {
      console.error('[blockchain] Failed to save chain:', err.message);
    }
  }

  /**
   * Create genesis block
   */
  createGenesisBlock() {
    return {
      index: 0,
      timestamp: new Date().toISOString(),
      data: { type: 'genesis', message: 'VELTRUVIA Blockchain Initialized' },
      previousHash: '0'.repeat(64),
      hash: '',
      app: 'system',
    };
  }

  /**
   * Calculate SHA-256 hash of a block
   */
  calculateHash(block) {
    const { index, timestamp, data, previousHash } = block;
    const payload = `${index}${timestamp}${JSON.stringify(data)}${previousHash}`;
    return createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Add a new block to the chain
   * @param {object} data - Block data (record, action, etc.)
   * @param {string} appName - Which app created this block ('doctor', 'patient', 'lab')
   * @returns {object} The new block
   */
  addBlock(data, appName) {
    const previousBlock = this.chain[this.chain.length - 1];
    const newBlock = {
      index: previousBlock.index + 1,
      timestamp: new Date().toISOString(),
      data,
      previousHash: previousBlock.hash || this.calculateHash(previousBlock),
      hash: '',
      app: appName,
    };
    newBlock.hash = this.calculateHash(newBlock);
    this.chain.push(newBlock);
    this.save();
    return newBlock;
  }

  /**
   * Record a patient record on the chain
   */
  recordPatient(mrn, recordData, appName = 'doctor') {
    return this.addBlock({
      type: 'patient_record',
      mrn,
      record: recordData,
      action: 'create',
    }, appName);
  }

  /**
   * Record a prescription
   */
  recordPrescription(mrn, prescription, doctorName, appName = 'doctor') {
    return this.addBlock({
      type: 'prescription',
      mrn,
      prescription,
      doctorName,
      action: 'create',
    }, appName);
  }

  /**
   * Record a lab result
   */
  recordLabResult(mrn, result, labName, appName = 'lab') {
    return this.addBlock({
      type: 'lab_result',
      mrn,
      result,
      labName,
      action: 'create',
    }, appName);
  }

  /**
   * Record an audit event
   */
  recordAudit(action, details, appName = 'system') {
    return this.addBlock({
      type: 'audit',
      action,
      details,
    }, appName);
  }

  /**
   * Get all records for a specific patient (by MRN)
   */
  getPatientRecords(mrn) {
    return this.chain.filter(b => 
      b.data && b.data.mrn === mrn && b.data.type !== 'audit'
    );
  }

  /**
   * Get all records of a specific type
   */
  getRecordsByType(type) {
    return this.chain.filter(b => b.data && b.data.type === type);
  }

  /**
   * Get all audit entries
   */
  getAuditLog() {
    return this.chain.filter(b => b.data && b.data.type === 'audit');
  }

  /**
   * Get recent blocks (last N)
   */
  getRecentBlocks(n = 10) {
    return this.chain.slice(-n);
  }

  /**
   * Verify chain integrity
   */
  verify() {
    for (let i = 1; i < this.chain.length; i++) {
      const current = this.chain[i];
      const previous = this.chain[i - 1];

      if (current.hash !== this.calculateHash(current)) {
        return { valid: false, error: `Block ${i} hash mismatch` };
      }
      if (current.previousHash !== previous.hash) {
        return { valid: false, error: `Block ${i} previous hash mismatch` };
      }
    }
    return { valid: true, chainLength: this.chain.length };
  }

  /**
   * Get chain statistics
   */
  getStats() {
    const types = {};
    const apps = {};
    for (const block of this.chain) {
      if (block.data) {
        types[block.data.type] = (types[block.data.type] || 0) + 1;
        apps[block.app] = (apps[block.app] || 0) + 1;
      }
    }
    return {
      totalBlocks: this.chain.length,
      recordsByType: types,
      recordsByApp: apps,
      chainValid: this.verify().valid,
    };
  }
}

// Singleton
const blockchain = new Blockchain();

export default blockchain;
export { Blockchain };
