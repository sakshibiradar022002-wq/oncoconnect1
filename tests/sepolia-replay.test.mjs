import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  decodeRecordAudit,
  decodeEntryRecorded,
  classifyTarget,
} from '../scripts/sepolia-replay.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', 'scripts', 'sepolia-replay.mjs');
const CONTRACT = '0x' + 'ab'.repeat(20);

// ── Minimal ABI encoder (no dependency) ───────────────────────────
const word32 = value => {
  const buf = Buffer.from(value.replace(/^0x/, ''), 'hex');
  assert.ok(buf.length <= 32);
  return Buffer.concat([Buffer.alloc(32 - buf.length), buf]);
};
const lenWord = n => { const b = Buffer.alloc(32); b.writeUInt32BE(n, 28); return b; };
const padRight = buf => Buffer.concat([buf, Buffer.alloc((32 - (buf.length % 32)) % 32)]);

function encodeRecordAudit(action, targetId, recordHash = '11'.repeat(32)) {
  const actionBuf = Buffer.from(action, 'utf8');
  const targetBuf = Buffer.from(targetId, 'utf8');
  const actionTail = Buffer.concat([lenWord(actionBuf.length), padRight(actionBuf)]);
  const head = Buffer.concat([
    word32(recordHash),
    lenWord(96),
    lenWord(96 + actionTail.length),
  ]);
  const targetTail = Buffer.concat([lenWord(targetBuf.length), padRight(targetBuf)]);
  return '0x' + 'a1b2c3d4' + Buffer.concat([head, actionTail, targetTail]).toString('hex');
}

function encodeEntryRecorded(action, recordHash = '22'.repeat(32)) {
  const actionBuf = Buffer.from(action, 'utf8');
  const tail = Buffer.concat([lenWord(actionBuf.length), padRight(actionBuf)]);
  const head = Buffer.concat([word32(recordHash), lenWord(96), word32('33'.repeat(32))]);
  return '0x' + Buffer.concat([head, tail]).toString('hex');
}

// ── Fake Sepolia JSON-RPC ─────────────────────────────────────────
const LATEST = 300;
const CREATION = 100;

const FIXTURES = [
  // 2026-09-30 · an email address in targetId (the disclosure)
  { block: 150, tx: '0x' + '11'.repeat(32), action: 'auth.login_failed', target: 'doctor.one@clinic.example' },
  // 2026-10-05 · an MRN
  { block: 200, tx: '0x' + '22'.repeat(32), action: 'patient.create', target: 'MRN-777' },
  // 2026-10-09 · a second MRN, its own transaction
  { block: 201, tx: '0x' + '66'.repeat(32), action: 'imaging.upload', target: 'MRN-778' },
  // 2026-11-22 · already-hashed target (2.6.8 write path)
  { block: 250, tx: '0x' + '33'.repeat(32), action: 'patient.update', target: '0x' + '44'.repeat(32) },
  // A log whose transaction carries no decodable recordAudit input.
  { block: 260, tx: '0x' + '55'.repeat(32), action: 'unknown.call', target: null },
];

const txInputs = new Map(FIXTURES.map(f => [
  f.tx,
  f.target === null ? '0xdeadbeef' : encodeRecordAudit(f.action, f.target),
]));

async function withFakeRpc(fn) {
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', d => { raw += d; });
    req.on('end', () => {
      const { id, method, params } = JSON.parse(raw || '{}');
      const send = result => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
      };
      switch (method) {
        case 'eth_chainId': return send('0xaa36a7');
        case 'eth_blockNumber': return send('0x' + LATEST.toString(16));
        case 'eth_getCode': { // params: [address, blockTag]
          if (String(params[0]).toLowerCase() !== CONTRACT) return send('0x');
          return send(Number(BigInt(params[1])) >= CREATION ? '0x6080604052' : '0x');
        }
        case 'eth_getBlockByNumber':
          return send({ number: params[0], timestamp: '0x' + (1790000000).toString(16) });
        case 'eth_getTransactionByHash': {
          const input = txInputs.get(params[0]);
          return send(input ? { hash: params[0], input } : null);
        }
        case 'eth_getLogs': {
          const from = Number(BigInt(params[0].fromBlock));
          const to = Number(BigInt(params[0].toBlock));
          const logs = FIXTURES
            .filter(f => f.block >= from && f.block <= to)
            .map(f => ({
              address: CONTRACT,
              blockNumber: '0x' + f.block.toString(16),
              transactionHash: f.tx,
              data: encodeEntryRecorded(f.action),
            }));
          return send(logs);
        }
        default:
          res.writeHead(200, { 'content-type': 'application/json' });
          return res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { message: `unsupported ${method}` } }));
      }
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

function run(args) {
  const child = spawn(process.execPath, [SCRIPT, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', d => { stdout += d; });
  child.stderr.on('data', d => { stderr += d; });
  return new Promise(resolve => child.on('close', code => resolve({ code, stdout, stderr })));
}

// ── Decoder units ─────────────────────────────────────────────────
test('recordAudit calldata decodes all three arguments, including the string targetId', () => {
  const decoded = decodeRecordAudit(encodeRecordAudit('patient.create', 'MRN-777'));
  assert.equal(decoded.action, 'patient.create');
  assert.equal(decoded.targetId, 'MRN-777');
  assert.match(decoded.recordHash, /^0x[0-9a-f]{64}$/);
});

test('malformed calldata is refused instead of guessed at', () => {
  assert.equal(decodeRecordAudit('0x'), null);
  assert.equal(decodeRecordAudit('0xdeadbeef'), null);
  assert.equal(decodeRecordAudit('not-hex'), null);
  // Offsets pointing outside the payload must not be followed.
  const bogus = '0x' + 'a1b2c3d4' + '11'.repeat(96);
  assert.equal(decodeRecordAudit(bogus), null);
  assert.equal(decodeEntryRecorded('0x00'), null);
});

test('classifyTarget separates emails, MRNs, hashed values and free text', () => {
  assert.equal(classifyTarget('doctor.one@clinic.example'), 'email address');
  assert.equal(classifyTarget('MRN-777'), 'MRN / short identifier');
  assert.equal(classifyTarget('12345'), 'MRN / short identifier');
  assert.equal(classifyTarget('0x' + 'ab'.repeat(32)), 'already hashed (2.6.8+)');
  assert.equal(classifyTarget('Room 4, bed 2'), 'other free text');
  assert.equal(classifyTarget(''), 'empty');
});

// ── End-to-end replay against a fake chain ────────────────────────
test('the replay counts events and distinct identifiers without printing any of them', async () => {
  await withFakeRpc(async rpcUrl => {
    const { code, stdout } = await run(['--rpc', rpcUrl, '--contract', CONTRACT, '--chunk', '100']);
    assert.equal(code, 0);
    assert.match(stdout, /EntryRecorded events\s+5/);
    assert.match(stdout, /email addresses\s+1/);
    assert.match(stdout, /MRN \/ short identifiers\s+2/); // MRN-777 and MRN-778
    assert.match(stdout, /already hashed \(2\.6\.8\+\)\s+1/);
    assert.match(stdout, /total distinct\s+4/);
    assert.match(stdout, /Tx without decodable targetId\s+1/);
    // The whole point: an MRN or an email must never reach the output.
    assert.doesNotMatch(stdout, /MRN-77/);
    assert.doesNotMatch(stdout, /doctor\.one@clinic/);
  });
});

// ── Local join (--join <db>) ──────────────────────────────────────
// A store that names two of the published values (one MRN, one email) and knows
// nothing about the other MRN. Values written here are synthetic.
async function withLocalStore(fn) {
  let DatabaseSync;
  try { ({ DatabaseSync } = await import('node:sqlite')); } catch { return 'skip'; }
  const dir = mkdtempSync(join(tmpdir(), 'veltruvia-join-'));
  const dbPath = join(dir, 'store.db');
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, role TEXT);
    CREATE TABLE audit_log (id TEXT PRIMARY KEY, target_id TEXT);
    CREATE TABLE patient_access (patient_mrn TEXT, owner_id TEXT, doctor_id TEXT);
  `);
  db.exec(`
    INSERT INTO users VALUES ('u-1', 'doctor.one@clinic.example', 'doctor');
    INSERT INTO audit_log VALUES ('a1', 'MRN-777'), ('a2', 'doctor.one@clinic.example'), ('a3', 'u-1');
    INSERT INTO patient_access VALUES ('MRN-777', 'u-1', 'u-1');
  `);
  db.close();
  try { return await fn(dbPath); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('--join resolves published identifiers against a local store, counts only', async t => {
  const result = await withLocalStore(async dbPath => withFakeRpc(async rpcUrl => run([
    '--rpc', rpcUrl, '--contract', CONTRACT, '--chunk', '100', '--join', dbPath,
  ])));
  if (result === 'skip') return t.skip('node:sqlite unavailable on this Node');
  const { code, stdout } = result;
  assert.equal(code, 0);
  assert.match(stdout, /short identifiers resolved\s+1 of 2 \(1 not found\)/);
  assert.match(stdout, /…as a patient MRN\s+1 of 2/);
  assert.match(stdout, /…as a user account\s+0 of 2/);
  assert.match(stdout, /email addresses resolved\s+1 of 1/);
  assert.match(stdout, /AFFECTED PATIENTS \(floor\)\s+1/);
  // The join must not become a way to print an identifier.
  assert.doesNotMatch(stdout, /MRN-77|doctor\.one@clinic/);
});

test('--join in --json mode reports the same floor and still no identifiers', async t => {
  const result = await withLocalStore(async dbPath => withFakeRpc(async rpcUrl => run([
    '--rpc', rpcUrl, '--contract', CONTRACT, '--chunk', '100', '--join', dbPath, '--json',
  ])));
  if (result === 'skip') return t.skip('node:sqlite unavailable on this Node');
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.localJoin.affectedPatientsFloor, 1);
  assert.equal(summary.localJoin.shortIdentifiers.matched, 1);
  assert.equal(summary.localJoin.emails.matched, 1);
  assert.equal(summary.localJoin.candidateValues.patientMrn, 1);
  assert.ok(summary.localJoin.database.endsWith('store.db'));
  assert.doesNotMatch(result.stdout, /MRN-77|doctor\.one@clinic/);
});

test('--join refuses a database that is not there instead of scanning the chain', async () => {
  const { code, stderr, stdout } = await run(['--join', join(tmpdir(), 'nope-missing.db'), '--to-block', '1']);
  assert.equal(code, 1);
  assert.match(stderr, /--join database not found/);
  assert.doesNotMatch(stdout, /Blocks scanned/);
});

test('--json emits the same counts and still no identifiers', async () => {
  await withFakeRpc(async rpcUrl => {
    const { code, stdout } = await run(['--rpc', rpcUrl, '--contract', CONTRACT, '--json', '--chunk', '100']);
    assert.equal(code, 0);
    const summary = JSON.parse(stdout);
    assert.equal(summary.events, 5);
    assert.equal(summary.distinctTargets.email, 1);
    assert.equal(summary.distinctTargets.mrnOrShortId, 2);
    assert.equal(summary.decodedTxs, 4);
    assert.equal(summary.distinctTargets.total, 4);
    assert.equal(summary.scanned.fromBlock, CREATION); // found by code search, not hardcoded
    assert.equal(summary.firstAnchor.block, 150);
    assert.equal(summary.lastAnchor.block, 260);
    assert.doesNotMatch(stdout, /MRN-77|doctor\.one@clinic/);
  });
});
