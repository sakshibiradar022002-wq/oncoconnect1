// Hardening tests: single-writer DB lock, login-time credential migration,
// MLLP default-off + loopback bind, /ice-servers endpoint, backup creation.
// Runs against a real spawned server (isolated port + ephemeral DB).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { rmSync, writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import net from 'node:net';

const APP = resolve('VELTRUVIA Server/resources/app');
const PORT = 3127;
const base = `http://localhost:${PORT}`;
// Own data dir: node:test runs test FILES in parallel, and the app derives
// patient-store.json from dirname(DB_PATH) — a shared dir would race with
// server.api.test.mjs's demo seeding.
const dataDir = join(APP, 'hardening-tmp');
const dbPath = join(dataDir, 'test.db');
const lockPath = dbPath + '.lock';
const storePath = join(dataDir, 'patient-store.json');

try { rmSync(dataDir, { recursive: true, force: true }); } catch {}
mkdirSync(dataDir, { recursive: true });

// ── Seed a store with a plaintext legacy credential ───────────────
writeFileSync(storePath, JSON.stringify({
  LEG001: { mrn: 'LEG001', name: 'Legacy User', dob: '1980-01-01',
    pass: 'plain-old-secret', passPlain: 'plain-old-secret', docId: 'test-admin-doc' },
  RECOV1: { mrn: 'RECOV1', name: 'Recovery Test', dob: '1990-02-02',
    pass: 'pbkdf2$seeded', email: 'recov1@example.com', docId: 'test-admin-doc' },
}), 'utf-8');

const server = spawn('node', ['src/server.js'], {
  cwd: APP,
  env: {
    ...process.env,
    JWT_SECRET: 'test-secret',
    PHI_ENCRYPTION_KEY: 'test-phi-key-32-bytes-long-here',
    DB_PATH: dbPath,
    PORT: String(PORT),
    NODE_ENV: 'test',
    VELTRUVIA_DEMO: 'false',
    MLLP_ENABLED: undefined,                 // default off — the point of the test
    BACKUP_INTERVAL_MS: '8000',              // fire within test lifetime
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let out = '';
server.stdout.on('data', d => { out += d; });
server.stderr.on('data', d => { out += d; });

await new Promise((res, rej) => {
  const probe = net.createServer();
  probe.once('error', () => rej(new Error(`Port ${PORT} in use`)));
  probe.listen(PORT, '127.0.0.1', () => probe.close(res));
});

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${base}/health`); if (r.ok) return; } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('server never became ready:\n' + out.slice(-2000));
}
before(waitReady);

test.after(() => {
  server.kill('SIGKILL'); // Windows ignores the signal; POSIX force-terminates so open handles can't hold the runner open
  setImmediate(() => process.exit(0)); // test-force-exit fallback (see package.json)
});

test('health is up', async () => {
  const r = await fetch(`${base}/health`);
  assert.equal(r.status, 200);
});

test('MLLP is OFF by default (port 2575 closed)', async () => {
  const closed = await new Promise((res) => {
    const s = net.connect(2575, '127.0.0.1');
    s.on('error', () => res(true));
    s.on('connect', () => { s.destroy(); res(false); });
  });
  assert.ok(closed, 'expected MLLP port to be closed when MLLP_ENABLED is unset');
  assert.ok(!out.includes('[mllp] MLLP/TCP server listening'), 'no MLLP listener should start');
});

test('single-writer lock: writer lock file exists next to the DB', () => {
  assert.ok(existsSync(lockPath), `${lockPath} should exist while the server owns the DB`);
});

test('second DB opener gets read-only (no lock overwrite)', { timeout: 30000 }, async () => {
  const { openDatabase } = await import(pathToFileURL(join(APP, 'src', 'db', 'adapter.js')).href);

  // 1) The lock still belongs to the spawned server, not to this process.
  const lockPid = parseInt(readFileSync(lockPath, 'utf-8').trim(), 10);
  assert.ok(lockPid && lockPid !== process.pid, `lock held by another process (pid ${lockPid})`);

  // 2) Open a second handle → must come up read-only.
  const db2 = await openDatabase(dbPath);
  await db2.exec('CREATE TABLE _lock_probe (x)');      // exists only in RAM
  await db2.close();

  // 3) The probe table must never reach the file: wait past the writer's
  //    5s snapshot, then inspect a copy of the DB with sql.js directly.
  for (let i = 0; i < 12 && !existsSync(dbPath); i++) await new Promise(r => setTimeout(r, 500));
  assert.ok(existsSync(dbPath), 'writer should have snapshotted the DB by now');
  await new Promise(r => setTimeout(r, 6000));
  const { createRequire } = await import('node:module');
  const require2 = createRequire(import.meta.url);
  const initSqlJs = require2(join(APP, 'node_modules', 'sql.js'));
  const SQL = await initSqlJs();
  const snapshot = new SQL.Database(readFileSync(dbPath));
  const tables = snapshot.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='_lock_probe'");
  assert.equal(tables.length, 0, 'read-only writes must not leak into the file');
  snapshot.close();
});

test('login-time migration hashes plaintext credentials (LEG001)', async () => {
  const r = await fetch(`${base}/api/sync/store-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mrn: 'LEG001', password: 'plain-old-secret' }),
  });
  const body = await r.json().catch(() => ({}));
  assert.equal(r.status, 200, 'legacy plaintext login should succeed: ' + JSON.stringify(body));
  assert.ok(body.ok);

  const store = JSON.parse(readFileSync(storePath, 'utf-8'));
  assert.ok(String(store.LEG001.pass).startsWith('pbkdf2v2:'), 'pass must now be a v2 hash');
  assert.equal(store.LEG001.passPlain, undefined, 'passPlain must be stripped');
  // ...and the hashed credential must still verify
  const r2 = await fetch(`${base}/api/sync/store-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mrn: 'LEG001', password: 'plain-old-secret' }),
  });
  assert.equal(r2.status, 200, 'hash-verified login after migration');
});

test('telehealth /ice-servers requires auth (no anonymous TURN leak)', async () => {
  const r = await fetch(`${base}/api/telehealth/ice-servers`);
  assert.equal(r.status, 401);
});

test('automatic backup file is created (BACKUP_INTERVAL_MS=8000)', { timeout: 70000 }, async () => {
  const backupsDir = join(dataDir, 'backups');
  let found = false;
  // first backup fires 30s after boot, then every 8s — poll up to ~65s
  for (let i = 0; i < 65 && !found; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try { found = readdirSync(backupsDir).some(f => f.startsWith('veltruvia-') && f.endsWith('.db')); } catch {}
  }
  assert.ok(found, 'expected a veltruvia-*.db backup within 65s');
  try { rmSync(backupsDir, { recursive: true, force: true }); } catch {}
});

test('self-service password recovery: request is uniform, reset rejects bad token', async () => {
  // Request — response must be uniform and never leak account existence.
  const r1 = await fetch(`${base}/api/sync/forgot-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mrn: 'RECOV1', email: 'recov1@example.com' }),
  });
  assert.equal(r1.status, 200);
  const d1 = await r1.json();
  assert.equal(d1.ok, true);
  assert.ok(d1.message);

  // Same response for a totally unknown MRN — no account enumeration.
  const r2 = await fetch(`${base}/api/sync/forgot-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mrn: 'NO-SUCH-MRN', email: 'x@example.com' }),
  });
  assert.equal(r2.status, 200);

  // Reset without a valid token fails and does NOT change the password.
  const r3 = await fetch(`${base}/api/sync/reset-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mrn: 'RECOV1', email: 'recov1@example.com', token: 'bogus-token-123456', newPassword: 'NewPass123' }),
  });
  assert.equal(r3.status, 400);
  const store = JSON.parse(readFileSync(storePath, 'utf-8'));
  assert.ok(!String(store.RECOV1.pass || '').includes('NewPass123'), 'password unchanged after bad token');
  assert.ok(!store.RECOV1.resetTokenHash, 'no token hash leaks to disk on failed reset');
});

test('doctor forgot-password endpoint responds uniformly (no enumeration)', async () => {
  const r = await fetch(`${base}/api/auth/forgot-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'nobody@nowhere.test' }),
  });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.ok, true);
  assert.ok(d.message);
});

test('push VAPID public key endpoint is available (push wired up)', async () => {
  const r = await fetch(`${base}/api/push/vapid-public-key`);
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.ok(d.key && d.key.length > 40, 'auto-generated VAPID public key present');
});

// ── Corruption recovery (observed twice in production 2026-09-18/19) ──
// Scenario: a process killed mid-snapshot leaves a zeroed/truncated DB file.
// The NEXT boot must quarantine it and restore the newest valid backup.
// Verified unit-style (no second server needed): the repair runs during
// openDatabase, before any backend touches the file.
test('corrupt DB at boot is quarantined and restored from the newest backup', { timeout: 30000 }, async () => {
  const { repairCorruptDb, looksLikeSqliteFile } = await import(pathToFileURL(join(APP, 'src', 'db', 'repair.js')).href);

  // Build the newest backup as a MINIMAL VALID SQLite file (schema.sql and
  // migrations.sql are idempotent, so a marker-table-only database boots).
  const { createRequire } = await import('node:module');
  const require2 = createRequire(import.meta.url);
  const initSqlJs = require2(join(APP, 'node_modules', 'sql.js'));
  const SQL = await initSqlJs();
  const good = new SQL.Database();
  good.exec('CREATE TABLE recovery_marker (id INTEGER PRIMARY KEY, note TEXT); INSERT INTO recovery_marker (note) VALUES (\'pre-corruption\');');
  const goodBuf = Buffer.from(good.export());
  good.close();

  const backupsDir = join(dataDir, 'backups');
  mkdirSync(backupsDir, { recursive: true });
  writeFileSync(join(backupsDir, 'veltruvia-2099-01-01T00-00-00.db'), goodBuf); // sorts NEWEST
  writeFileSync(join(backupsDir, 'veltruvia-2000-01-01T00-00-00.db'), Buffer.alloc(0)); // corrupt — must be skipped

  // The live DB is zeroed end-to-end, as a torn write leaves it.
  writeFileSync(dbPath, Buffer.alloc(goodBuf.length));
  assert.equal(looksLikeSqliteFile(dbPath), false, 'zeroed file must fail the header check');

  const restored = repairCorruptDb(dbPath, dataDir);
  assert.ok(restored, 'repair must report a successful restore');
  assert.ok(looksLikeSqliteFile(dbPath), 'restored file carries the SQLite header');

  // Quarantine kept (never deleted), restore picked the NEWEST VALID backup.
  const quarantined = readdirSync(dataDir).filter(f => f.startsWith('test.db.corrupt-'));
  assert.equal(quarantined.length, 1, 'corrupt file quarantined exactly once');
  const adopted = new SQL.Database(readFileSync(dbPath));
  const marker = adopted.exec('SELECT note FROM recovery_marker');
  assert.ok(marker.length && marker[0].values[0][0] === 'pre-corruption', 'restored DB contains the marker table (newest backup won)');
  adopted.close();

  // Idempotent on a healthy file — no double quarantine.
  assert.equal(repairCorruptDb(dbPath, dataDir), false);
  assert.equal(readdirSync(dataDir).filter(f => f.startsWith('test.db.corrupt-')).length, 1);

  // Cleanup so later tests / reruns start clean.
  rmSync(join(backupsDir, 'veltruvia-2099-01-01T00-00-00.db'), { force: true });
  rmSync(join(backupsDir, 'veltruvia-2000-01-01T00-00-00.db'), { force: true });
  rmSync(quarantined.map(f => join(dataDir, f))[0], { force: true });
});

test('sql.js snapshot write is atomic (temp file, never in-place)', { timeout: 30000 }, async () => {
  // Read-only opener from the earlier lock test proved snapshot() runs and
  // publishes to disk; here we assert the on-disk file is ALWAYS valid across
  // many save cycles, i.e. the rename-over never exposes a torn write.
  for (let i = 0; i < 6; i++) {
    await new Promise(r => setTimeout(r, 1000)); // spans several 5s save ticks
    let buf;
    try { buf = readFileSync(dbPath); } catch { continue; } // vanished mid-rename is fine (atomic)
    if (!buf.length) continue;                              // not yet published
    assert.ok(
      buf.subarray(0, 16).equals(Buffer.from('SQLite format 3\x00', 'latin1')),
      `snapshot ${i}: on-disk DB must always carry the SQLite header (torn write would zero it)`,
    );
  }
});
