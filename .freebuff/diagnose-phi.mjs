// Read-only diagnostic: identify failing PHI blobs and test against
// historical keys. Prints NO plaintext and NO key material — only
// table, rowid, and per-key OK/FAIL status.
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createDecipheriv } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = join(root, 'VELTRUVIA Server', 'resources', 'app', 'chemocure.db');
const appDir = join(root, 'VELTRUVIA Server', 'resources', 'app');

const envFiles = [
  ['current .env', join(appDir, '.env')],
  ['pre-rotation (Sep 22)', join(root, '.env.pre-rotation-2026-09-22T06-24-56')],
  ['pre-email-backup', join(root, '.env.pre-email-backup')],
];
const keys = envFiles.map(([label, p]) => {
  try {
    const line = readFileSync(p, 'utf8').split(/\r?\n/).find(l => l.startsWith('PHI_ENCRYPTION_KEY='));
    return [label, line ? line.slice('PHI_ENCRYPTION_KEY='.length).trim() : null];
  } catch { return [label, null]; }
});

const initSqlJs = (await import(pathToFileURL(join(appDir, 'node_modules', 'sql.js', 'dist', 'sql-wasm.js')).href)).default;
const SQL = await initSqlJs({ locateFile: f => join(appDir, 'node_modules', 'sql.js', 'dist', f) });
const db = new SQL.Database(readFileSync(dbPath));

function tryDecrypt(blob, keyHex) {
  try {
    const [v, ivB64, tagB64, ctB64] = String(blob).split('.');
    if (v !== 'v1') return false;
    const d = createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), Buffer.from(ivB64, 'base64'));
    d.setAuthTag(Buffer.from(tagB64, 'base64'));
    d.update(Buffer.from(ctB64, 'base64')); d.final();
    return true;
  } catch { return false; }
}

const TARGETS = [
  ['users', 'name_enc'], ['users', 'meta_enc'], ['users', 'totp_enc'],
  ['audit_log', 'detail_enc'], ['kv_store', 'v_enc'], ['clinical_audit_log', 'detail_enc'],
];
for (const [table, col] of TARGETS) {
  const stmt = db.prepare(`SELECT rowid AS rid, ${col} AS blob FROM ${table} WHERE ${col} LIKE 'v1.%'`);
  while (stmt.step()) {
    const { rid, blob } = stmt.getAsObject();
    const results = keys.map(([label, keyHex]) => `${label}: ${keyHex && tryDecrypt(blob, keyHex) ? 'OK' : 'fail'}`).join(' | ');
    const anyOk = keys.some(([l, k]) => k && tryDecrypt(blob, k));
    const marker = anyOk ? '' : '  ← decrypts with NO known key';
    console.log(`${table}.${col} rowid=${rid} → ${results}${marker}`);
  }
  stmt.free();
}
