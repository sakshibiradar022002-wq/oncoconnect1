// Regression tests for the Sepolia anchor path in src/blockchain/index.js.
//
// Context: every clinical mutation writes an audit record, so anchors arrive
// in bursts (one per request). Each record used to send its own anchor
// transaction concurrently — several calls read the same "pending" nonce
// before any of them was mined, so the node rejected the extras with
// "replacement fee too low". 37 anchors were dropped that way between
// Sep 28 and Oct 15 2026, invisibly, because the local file chain (the
// source of truth) kept working. These tests pin the fix: sequential nonces
// via ethers.NonceManager, plus one resync-and-retry on a nonce conflict.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BlockchainAudit, anchorWithNonceRetry } from '../src/blockchain/index.js';

const ARGS = ['0x' + 'a'.repeat(64), 'patient.read', 'TEST001'];

test('anchor retries once after a nonce conflict, then returns the receipt', async () => {
  let sends = 0;
  let onRetryCalls = 0;
  const contract = {
    recordAudit: async (...args) => {
      assert.deepEqual(args, ARGS, 'anchor args must reach recordAudit unchanged');
      sends += 1;
      if (sends === 1) throw new Error('replacement fee too low');
      return { wait: async () => ({ hash: '0xdeadbeef', blockNumber: 42 }) };
    },
  };

  const info = await anchorWithNonceRetry(contract, ARGS, { onRetry: async () => { onRetryCalls += 1; } });

  assert.equal(sends, 2, 'a nonce conflict must be retried exactly once');
  assert.equal(onRetryCalls, 1, 'onRetry (nonce resync) must run before the retry');
  assert.deepEqual(info, { txHash: '0xdeadbeef', blockNumber: 42 });
});

test('a non-nonce failure is not retried', async () => {
  let sends = 0;
  const contract = {
    recordAudit: async () => { sends += 1; throw new Error('insufficient funds for gas * price + value'); },
  };

  await assert.rejects(anchorWithNonceRetry(contract, ARGS), /insufficient funds/);
  assert.equal(sends, 1, 'only nonce conflicts justify a resend');
});

test('a failed confirmation never triggers a second send (no double anchor)', async () => {
  let sends = 0;
  const contract = {
    recordAudit: async () => {
      sends += 1;
      return { wait: async () => { throw new Error('transaction was not mined within 300 seconds'); } };
    },
  };

  await assert.rejects(anchorWithNonceRetry(contract, ARGS), /not mined/);
  assert.equal(sends, 1, 'a broadcast transaction must never be re-sent');
});

test('gives up after the retry also fails, surfacing the node error', async () => {
  let sends = 0;
  const contract = {
    recordAudit: async () => { sends += 1; throw new Error('replacement fee too low'); },
  };

  await assert.rejects(anchorWithNonceRetry(contract, ARGS), /replacement fee too low/);
  assert.equal(sends, 2, 'at most two attempts, so a persistent conflict cannot loop');
});

test('sepolia mode routes anchors through a NonceManager, not the raw wallet', async () => {
  const { Wallet } = await import('ethers');
  const saved = {
    mode: process.env.BLOCKCHAIN_MODE,
    key: process.env.ANCHOR_PRIVATE_KEY,
    rpc: process.env.SEPOLIA_RPC_URL,
  };
  // A dead RPC URL: connect() needs no network for sepolia mode, so this
  // exercises the wiring without touching the public testnet.
  process.env.BLOCKCHAIN_MODE = 'sepolia';
  process.env.ANCHOR_PRIVATE_KEY = Wallet.createRandom().privateKey;
  process.env.SEPOLIA_RPC_URL = 'http://127.0.0.1:1';

  try {
    const chain = new BlockchainAudit();
    assert.equal(await chain.connect(), true);
    assert.equal(chain.backend, 'sepolia', 'deployment.json must select the sepolia backend');
    assert.equal(chain.anchorSigner?.constructor?.name, 'NonceManager',
      'anchors must use sequential nonces (this is the fix)');
    assert.equal(chain.contract.runner, chain.anchorSigner,
      'the contract must be bound to the NonceManager, not the bare wallet');
    assert.deepEqual(
      { sent: chain.anchorStats.sent, failed: chain.anchorStats.failed, retries: chain.anchorStats.retries },
      { sent: 0, failed: 0, retries: 0 },
      'anchor counters start clean'
    );
  } finally {
    for (const [k, v] of Object.entries({ BLOCKCHAIN_MODE: saved.mode, ANCHOR_PRIVATE_KEY: saved.key, SEPOLIA_RPC_URL: saved.rpc })) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});
