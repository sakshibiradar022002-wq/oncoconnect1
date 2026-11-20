#!/usr/bin/env node
/**
 * verify-backup.mjs — read-only restore drill.
 *
 *   node scripts/verify-backup.mjs                     # newest backup in <app>/backups
 *   node scripts/verify-backup.mjs --backup <file>
 *   node scripts/verify-backup.mjs --db <live db>
 *
 * Proves a backup is actually restorable WITHOUT touching the live database:
 * integrity_check, table/row counts, and a real PHI decryption using the key
 * from <app>/.env (so a backup encrypted under a lost key fails loudly instead
 * of looking fine). Compares the counts with the live DB when it is readable.
 *
 * Exit 0 = drill passed, 1 = a real problem.
 */
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createDecipheriv, createHash } from 'node:crypto';

const APP_DIR = process.env.APP_DIR || '/home/ubuntu/veltruvia/app';

function arg(name, fallback = null) {
  const eq = process.argv.find(a => a.startsWith(name + '='));
  if (eq) return eq.slice(name.length + 1) || fallback;
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const DB_PATH = resolve(arg('--db', process.env.DB_PATH || join(APP_DIR, 'chemocure.db')));
const BACKUP_DIR = resolve(arg('--backups', join(dirname(DB_PATH), 'backups')));
const problems = [];
const note = msg => console.log('  ' + msg);

async function open(path, readOnly = true) {
  const opts = { readOnly };
  try {
    const { DatabaseSync } = await import('node:sqlite');
    return new DatabaseSync(path, opts);
  } catch { /* older Node — use the app's native driver */ }
  const { createRequire } = await import('node:module');
  const req = createRequire(join(APP_DIR, 'package.json'));
  return new (req('better-sqlite3'))(path, opts);
}

function phiKey() {
  const envPath = join(APP_DIR, '.env');
  if (!existsSync(envPath)) return null;
  const line = readFileSync(envPath, 'utf8').split('\n').find(l => l.startsWith('PHI_ENCRYPTION_KEY='));
  if (!line) return null;
  const raw = line.slice('PHI_ENCRYPTION_KEY='.length).trim().replace(/^["']|["']$/g, '');
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  if (raw.length >= 16) return Buffer.from(createHash('sha256').update(raw).digest('hex'), 'hex');
  return null;
}

function decrypt(blob, key) {
  try {
    const [version, iv, tag, ct] = blob.split('.');
    if (version !== 'v1') return null;
    const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8'));
  } catch { return null; }
}

function pickBackup() {
  const explicit = arg('--backup');
  if (explicit) return resolve(explicit);
  if (!existsSync(BACKUP_DIR)) return null;
  const files = readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.db'))
    .map(f => ({ f, t: statSync(join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return files.length ? join(BACKUP_DIR, files[0].f) : null;
}

const counts = db => {
  const get = sql => { try { return db.prepare(sql).get().n; } catch { return null; } };
  return {
    tables: get("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'"),
    users: get('SELECT COUNT(*) AS n FROM users'),
    patients: get('SELECT COUNT(DISTINCT owner_id) AS n FROM kv_store'),
    audit: get('SELECT COUNT(*) AS n FROM audit_log'),
    sessions: get('SELECT COUNT(*) AS n FROM sessions'),
  };
};

const backupPath = pickBackup();
if (!backupPath || !existsSync(backupPath)) {
  console.error(`[drill] no backup found in ${BACKUP_DIR} (pass --backup <file>)`);
  process.exit(1);
}

console.log(`[drill] backup: ${backupPath}`);
console.log(`[drill] size:   ${(statSync(backupPath).size / 1024).toFixed(0)} KB`);

const db = await open(backupPath);
let integrity;
try {
  integrity = db.prepare('PRAGMA integrity_check').get();
  const verdict = Object.values(integrity || {})[0];
  note(`integrity_check: ${verdict}`);
  if (verdict !== 'ok') problems.push(`integrity_check returned ${verdict}`);
} finally { /* closed below */ }

const b = counts(db);

const key = phiKey();
if (!key) {
  problems.push('PHI_ENCRYPTION_KEY not readable from the app .env — cannot prove the backup decrypts');
  note('PHI decrypt: SKIPPED (no key found)');
} else {
  const row = db.prepare('SELECT email, name_enc FROM users WHERE name_enc IS NOT NULL LIMIT 1').get();
  if (!row) {
    note('PHI decrypt: no encrypted user records in this backup (nothing to test)');
  } else if (decrypt(row.name_enc, key)) {
    note(`PHI decrypt: ok (tested one name for ${row.email})`);
    const patientRow = db.prepare("SELECT v_enc FROM kv_store WHERE k LIKE '%patient%' LIMIT 1").get();
    if (patientRow?.v_enc) {
      note(decrypt(patientRow.v_enc, key) ? 'PHI decrypt: patient store ok' : 'PHI decrypt: patient store FAILED');
      if (!decrypt(patientRow.v_enc, key)) problems.push('patient-store rows do not decrypt with the current key');
    }
  } else {
    problems.push('encrypted rows do not decrypt with the current PHI_ENCRYPTION_KEY');
    note('PHI decrypt: FAILED — this backup is unreadable with the current key');
  }
}
db.close();

console.log('[drill] contents: ' + Object.entries(b).map(([k, v]) => `${k}=${v ?? '?'}`).join('  '));

if (existsSync(DB_PATH)) {
  const live = await open(DB_PATH);
  const l = counts(live);
  live.close();
  console.log('[drill] live DB:  ' + Object.entries(l).map(([k, v]) => `${k}=${v ?? '?'}`).join('  '));
  const drift = [];
  for (const k of ['users', 'patients', 'audit']) {
    if (b[k] != null && l[k] != null && b[k] !== l[k]) drift.push(`${k} ${b[k]} vs ${l[k]}`);
  }
  note(drift.length ? `drift vs live: ${drift.join(', ')}` : 'matches the live DB on users/patients/audit');
}

if (problems.length) {
  console.log('\n[drill] FAILED:');
  for (const p of problems) console.log('  - ' + p);
  process.exit(1);
}
console.log('\n[drill] passed — this backup restores to a readable database.');
