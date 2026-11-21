import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(ROOT, 'scripts', 'audit-anomaly.mjs');

const now = () => new Date().toISOString();

function makeDb(rows) {
  const dir = mkdtempSync(join(tmpdir(), 'veltruvia-anomaly-'));
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

const run = (args, cwd = ROOT) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd });

test('flags a successful login from an IP that had a burst of failures', () => {
  const rows = [];
  for (let i = 0; i < 8; i++) rows.push({ actor: 'u1', action: 'user.login.failed', ip: '203.0.113.9' });
  rows.push({ actor: 'u1', action: 'user.login.success', ip: '203.0.113.9' });

  const { dir, path } = makeDb(rows);
  const out = run(['--db', path, '--json', join(dir, 'report.json'), '--window', '24']);
  assert.equal(out.status, 1, out.stdout + out.stderr);

  const report = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8'));
  assert.ok(report.findings.some(f => f.id === 'success-after-fails' && f.severity === 'critical'));
});

test('warns on bulk record access and stays exit 0 without --strict', () => {
  const rows = [];
  for (let i = 0; i < 120; i++) rows.push({ actor: 'u2', action: 'patient.view', target: `p${i}` });
  const { dir, path } = makeDb(rows);
  const out = run(['--db', path, '--json', join(dir, 'report.json')]);
  assert.equal(out.status, 0, out.stdout + out.stderr);

  const report = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8'));
  assert.ok(report.findings.some(f => f.id === 'bulk-access'));
  assert.equal(report.counts.critical, 0);
});

test('reports silence when the audit log has no recent rows', () => {
  const old = new Date(Date.now() - 48 * 3600e3).toISOString();
  const { dir, path } = makeDb([{ actor: 'u3', action: 'user.login.success', at: old }]);
  const out = run(['--db', path, '--json', join(dir, 'report.json'), '--window', '6']);
  assert.equal(out.status, 0, out.stdout + out.stderr);

  const report = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8'));
  assert.equal(report.rowsInWindow, 0);
  assert.ok(report.findings.some(f => f.id === 'audit-silence'));
});

test('--ignore-ip suppresses the scanner\'s own failed-login burst', () => {
  const rows = [];
  for (let i = 0; i < 12; i++) rows.push({ action: 'user.login_failed', ip: '208.72.218.131' });

  const { dir, path } = makeDb(rows);
  const noisy = run(['--db', path, '--json', join(dir, 'a.json')]);
  const noisyReport = JSON.parse(readFileSync(join(dir, 'a.json'), 'utf8'));
  assert.ok(noisyReport.findings.some(f => f.id === 'fail-burst'), 'detected without the allowlist');

  const quiet = run(['--db', path, '--json', join(dir, 'b.json'), '--ignore-ip', '208.72.218.131']);
  assert.equal(quiet.status, 0, quiet.stdout + quiet.stderr);
  const quietReport = JSON.parse(readFileSync(join(dir, 'b.json'), 'utf8'));
  assert.deepEqual(quietReport.findings, []);
  assert.equal(quietReport.rowsIgnored, 12);
});

test('a quiet, healthy window exits 0 with no findings', () => {
  const { dir, path } = makeDb([
    { actor: 'u4', action: 'user.login.success', ip: '198.51.100.4' },
    { actor: 'u4', action: 'patient.view', target: 'p1' },
  ]);
  const out = run(['--db', path, '--json', join(dir, 'report.json')]);
  assert.equal(out.status, 0, out.stdout + out.stderr);

  const report = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8'));
  assert.deepEqual(report.findings, []);
});
