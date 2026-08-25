// Single shared SQLite connection via the adapter (better-sqlite3 or node:sqlite).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { openDatabase, activeImpl } from './adapter.js';
import { encryptPHI, randomToken } from '../crypto.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const db = await openDatabase(config.dbPath);
await db.pragma('journal_mode = WAL');
await db.pragma('foreign_keys = ON');
console.log(`[db] using ${activeImpl()}`);

export function closeDb() {
  if (db && typeof db.close === 'function') db.close();
}

export async function initSchema() {
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  await db.exec(schema);
  // Column additions for databases created before these features existed.
  try { await db.exec('ALTER TABLE users ADD COLUMN totp_enc TEXT'); } catch { /* already there */ }
  try { await db.exec('ALTER TABLE sessions ADD COLUMN last_activity TEXT'); } catch { /* already there */ }
  try { await db.exec('ALTER TABLE password_change_requests ADD COLUMN new_pass_plain TEXT'); } catch { /* already there */ }
  // Apply feature migrations (scheduling, CDS, e-prescribing, telehealth)
  try {
    const migrations = readFileSync(join(__dirname, 'migrations.sql'), 'utf8');
    await db.exec(migrations);
    console.log('[db] feature migrations applied');
  } catch (e) {
    console.warn('[db] migrations:', e.message);
  }
  console.log('[db] schema ready');
}

// Auto-create test accounts if the known test email doesn't exist yet.
// Uses fixed IDs so this is safe to run on any empty or fresh database.
export async function initTestData() {
  console.log('[test-data] Checking test accounts...');

  // For doctor accounts (verified by crypto.js verifyPassword)
  function hashPassword(pwd) {
    const salt = randomBytes(16);
    const hash = pbkdf2Sync(String(pwd), salt, 210000, 64, 'sha512');
    return `pbkdf2$210000$${salt.toString('hex')}$${hash.toString('hex')}`;
  }
  // For patient/lab passwords (verified by verifyUiPassword in sync.js)
  function hashUiPassword(pwd) {
    const salt = randomBytes(16).toString('base64url');
    const hash = pbkdf2Sync(String(pwd), salt, 210000, 32, 'sha256').toString('base64');
    return `pbkdf2v2:210000:${salt}:${hash}`;
  }

  try {
    const docId = 'test-admin-doc';
    const labId = 'test-lab-001';

    // 1) Test doctor account
    const existingDoc = await db.prepare('SELECT id FROM users WHERE email = ?').get('test@example.com');
    if (!existingDoc) {
      await db.prepare(
        'INSERT INTO users (id, email, password_hash, role, name_enc, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(docId, 'test@example.com', hashPassword('testdoc123'), 'admin', encryptPHI('Test Doctor'), 1, new Date().toISOString());
      console.log('[test-data] Created doctor: test@example.com / testdoc123');
    } else {
      console.log('[test-data] Doctor test@example.com already exists');
    }

    // 2) Test patient data
    const existingPat = await db.prepare('SELECT k FROM kv_store WHERE k = ?').get('pat_12345');
    if (!existingPat) {
      const patientData = {
        mrn: '12345', name: 'Test Patient', dob: '1985-06-15',
        diag: 'Acute Lymphoblastic Leukemia (ALL)', docId, pass: hashUiPassword('testpat123'),
      };
      await db.prepare(
        'INSERT INTO kv_store (owner_id, k, v_enc, updated_at) VALUES (?, ?, ?, ?)'
      ).run(docId, 'pat_12345', encryptPHI(patientData), new Date().toISOString());
      console.log('[test-data] Created patient: MRN=12345 / testpat123');
    } else {
      console.log('[test-data] Patient MRN=12345 already exists');
    }

    // 3) Test lab account
    const labKey = `lab_${docId}_${labId}`;
    const existingLab = await db.prepare('SELECT k FROM kv_store WHERE k = ?').get(labKey);
    if (!existingLab) {
      const labData = {
        name: 'Test Lab', username: 'testlab', password: hashUiPassword('testlab123'),
        labId, docId,
      };
      await db.prepare(
        'INSERT INTO kv_store (owner_id, k, v_enc, updated_at) VALUES (?, ?, ?, ?)'
      ).run(docId, labKey, encryptPHI(labData), new Date().toISOString());
      console.log('[test-data] Created lab: testlab / testlab123');
    } else {
      console.log('[test-data] Lab testlab already exists');
    }

    console.log('[test-data] Test data ready.');
  } catch (e) {
    console.error('[test-data] Error:', e.message);
  }
}

export async function writeAudit({ actorId, actorRole, action, targetId, detail, ip }) {
  await db.prepare(
    'INSERT INTO audit_log (id, actor_id, actor_role, action, target_id, detail_enc, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    randomToken(12), actorId || null, actorRole || null, action,
    targetId || null, detail ? encryptPHI(detail) : null, ip || null,
    new Date().toISOString()
  );
}
