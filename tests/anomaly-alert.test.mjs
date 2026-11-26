import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(ROOT, 'scripts', 'anomaly-alert.mjs');
const UUID = '11111111-2222-3333-4444-555555555555';

const now = () => new Date().toISOString();

function makeDb(rows) {
  const dir = mkdtempSync(join(tmpdir(), 'veltruvia-alert-'));
  const path = join(dir, 'audit.db');
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE audit_log (
    id TEXT PRIMARY KEY, actor_id TEXT, actor_role TEXT, action TEXT NOT NULL,
    target_id TEXT, detail_enc TEXT, ip TEXT, created_at TEXT NOT NULL)`);
  const insert = db.prepare('INSERT INTO audit_log (id, actor_id, actor_role, action, target_id, detail_enc, ip, created_at) VALUES (?,?,?,?,?,?,?,?)');
  rows.forEach((r, i) => insert.run(`r${i}`, r.actor ?? null, r.role ?? 'doctor', r.action, r.target ?? null, null, r.ip ?? null, r.at ?? now()));
  db.close();
  return { dir, path };
}

// Minimal stand-in for a Healthchecks check: records the paths that get pinged.
async function withServer(fn) {
  const hits = [];
  const server = createServer((req, res) => {
    hits.push(req.url);
    res.writeHead(200).end('ok');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn({ base, hits });
  } finally {
    await new Promise(r => server.close(r));
  }
}

const runAsync = args => new Promise(resolve => {
  const child = spawn(process.execPath, [SCRIPT, ...args], { cwd: ROOT });
  let stdout = '', stderr = '';
  child.stdout.on('data', d => { stdout += d; });
  child.stderr.on('data', d => { stderr += d; });
  child.on('close', status => resolve({ status, stdout, stderr }));
});

test('a clean scan pings the check and exits 0', async () => {
  const { dir, path } = makeDb([
    { actor: 'u1', action: 'user.login.success', ip: '198.51.100.4' },
    { actor: 'u1', action: 'patient.view', target: 'p1' },
  ]);
  await withServer(async ({ base, hits }) => {
    const out = await runAsync(['--db', path, '--json', join(dir, 'r.json'), '--ping', `${base}/${UUID}`]);
    assert.equal(out.status, 0, out.stdout + out.stderr);
    assert.deepEqual(hits, [`/${UUID}`]);
  });
});

test('a critical finding pings /fail and exits 1', async () => {
  const rows = [];
  for (let i = 0; i < 8; i++) rows.push({ actor: 'u2', action: 'user.login.failed', ip: '203.0.113.9' });
  rows.push({ actor: 'u2', action: 'user.login.success', ip: '203.0.113.9' });
  const { dir, path } = makeDb(rows);

  await withServer(async ({ base, hits }) => {
    const out = await runAsync(['--db', path, '--json', join(dir, 'r.json'), '--ping', `${base}/${UUID}`]);
    assert.equal(out.status, 1, out.stdout + out.stderr);
    assert.deepEqual(hits, [`/${UUID}/fail`]);
  });
});

test('a warning with --strict pings /fail and exits 2', async () => {
  const rows = [];
  for (let i = 0; i < 120; i++) rows.push({ actor: 'u3', action: 'patient.view', target: `p${i}` });
  const { dir, path } = makeDb(rows);

  await withServer(async ({ base, hits }) => {
    const out = await runAsync(['--db', path, '--json', join(dir, 'r.json'), '--strict', '--ping', `${base}/${UUID}`]);
    assert.equal(out.status, 2, out.stdout + out.stderr);
    assert.deepEqual(hits, [`/${UUID}/fail`]);
  });
});

test('without a check URL the scan still runs and its exit code passes through', () => {
  const { dir, path } = makeDb([{ actor: 'u4', action: 'user.login.success', ip: '198.51.100.4' }]);
  const out = spawnSync(process.execPath, [SCRIPT, '--db', path, '--json', join(dir, 'r.json')], {
    encoding: 'utf8', cwd: ROOT, env: { ...process.env, ANOMALY_CHECK_URL: '' },
  });
  assert.equal(out.status, 0, out.stdout + out.stderr);
  assert.match(out.stderr, /no ANOMALY_CHECK_URL set/);
});

test('a placeholder check URL is refused rather than pinged', async () => {
  const { dir, path } = makeDb([{ actor: 'u5', action: 'user.login.success', ip: '198.51.100.4' }]);
  await withServer(async ({ base, hits }) => {
    // The loopback base makes a real ping possible; swapping in a placeholder
    // subdomain must suppress it entirely.
    const out = await runAsync(['--db', path, '--json', join(dir, 'r.json'), '--ping', `${base}/<uuid>`]);
    assert.equal(out.status, 0, out.stdout + out.stderr);
    assert.match(out.stderr, /not a usable check URL/);
    assert.deepEqual(hits, []);
  });
});

test('--print-cron emits the wrapper line and needs no database', () => {
  const out = spawnSync(process.execPath, [SCRIPT, '--print-cron', '--db', '/nonexistent/x.db'], {
    encoding: 'utf8', cwd: ROOT, env: { ...process.env, ANOMALY_CHECK_URL: '' },
  });
  assert.equal(out.status, 0, out.stdout + out.stderr);
  const line = out.stdout.trim();
  assert.match(line, /^\*\/15 \* \* \* \* cd \//);
  assert.match(line, /scripts\/anomaly-alert\.mjs/);
  assert.match(line, /ANOMALY_CHECK_URL=https:\/\/hc-ping\.com\/<uuid>/);
  assert.match(line, /--strict --stale-hours 24/);
});
