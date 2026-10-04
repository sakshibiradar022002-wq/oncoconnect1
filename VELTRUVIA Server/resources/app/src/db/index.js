// Single shared SQLite connection via the adapter (better-sqlite3 or node:sqlite).

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, unlinkSync } from 'node:fs';
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

export function flushDb() {
  if (db && typeof db.flush === 'function') db.flush();
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

  // Boot-time restore point: snapshot the healthy DB so a later corruption
  // always has a recent backup for repairCorruptDb (src/db/adapter.js) to
  // restore from. Keeps the newest 14 backup files — auto-start on every
  // Windows boot would otherwise grow the directory unboundedly.
  try {
    flushDb();                                  // sql.js: write RAM → disk now
    const bdir = join(dirname(config.dbPath), 'backups');
    mkdirSync(bdir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    copyFileSync(config.dbPath, join(bdir, `veltruvia-boot-${stamp}.db`));
    const all = readdirSync(bdir).filter(f => f.endsWith('.db')).sort();
    for (const stale of all.slice(0, Math.max(0, all.length - 14))) {
      try { unlinkSync(join(bdir, stale)); } catch {}
    }
    console.log('[db] boot snapshot written to backups/');
  } catch { /* best-effort — never block boot */ }
}

// ── Demo account seeding ──────────────────────────────────────────
// SECURITY: OFF by default. A fresh install starts with NO known
// credentials — the first admin registers via /api/auth/register.
// Set VELTRUVIA_DEMO=true to seed the classic demo accounts
// (doctor test@example.com, patient MRN 12345, lab testlab).
//
// Even in demo mode we never store plaintext passwords: the admin
// password is generated randomly on first run, printed ONCE, and
// saved next to the database file (.demo-admin-password).
export async function initTestData() {
  if (String(process.env.VELTRUVIA_DEMO || '').trim().toLowerCase() !== 'true') {
    console.log('[db] Demo seeding disabled (set VELTRUVIA_DEMO=true to enable demo accounts).');
    return;
  }
  console.log('[demo-seed] VELTRUVIA_DEMO=true — seeding demo accounts...');

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

    // 1) Demo doctor account — random one-time password on first run
    const existingDoc = await db.prepare('SELECT id FROM users WHERE email = ?').get('test@example.com');
    if (!existingDoc) {
      const fsMod = await import('node:fs');
      const pwFile = join(dirname(config.dbPath || '.'), '.demo-admin-password');
      // VELTRUVIA_DEMO_PASSWORD pins the demo admin password (for automated
      // tests / throwaway sandboxes). Default remains a random one-time password.
      const fixedDemoPw = String(process.env.VELTRUVIA_DEMO_PASSWORD || '').trim();
      let adminPassword = fixedDemoPw || null;
      if (!adminPassword) {
        try { adminPassword = fsMod.readFileSync(pwFile, 'utf8').trim(); } catch {}
        if (!adminPassword) {
          adminPassword = 'vlt-' + randomBytes(9).toString('base64url');
          try { fsMod.writeFileSync(pwFile, adminPassword + '\n', { mode: 0o600 }); } catch {}
          console.warn('');
          console.warn('  ┌────────────────────────────────────────────────────────┐');
          console.warn('  │  DEMO admin account created: test@example.com          │');
          console.warn('  │  One-time password (saved to .demo-admin-password):    │');
          console.warn('  │      ' + adminPassword.padEnd(44) + '│');
          console.warn('  └────────────────────────────────────────────────────────┘');
          console.warn('');
        }
      }
      await db.prepare(
        'INSERT INTO users (id, email, password_hash, role, name_enc, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(docId, 'test@example.com', hashPassword(adminPassword), 'admin', encryptPHI('Test Doctor'), 1, new Date().toISOString());
      console.log('[demo-seed] Created demo doctor account');
    } else {
      console.log('[demo-seed] Doctor test@example.com already exists');
    }

    // 2) Demo patient data (hash-only — no plaintext password stored)
    const existingPat = await db.prepare('SELECT k FROM kv_store WHERE k = ?').get('pat_12345');
    if (!existingPat) {
      const patientData = {
        mrn: '12345', name: 'Test Patient', dob: '1985-06-15',
        diag: 'Acute Lymphoblastic Leukemia (ALL)', docId, pass: hashUiPassword('testpat123'),
      };
      await db.prepare(
        'INSERT INTO kv_store (owner_id, k, v_enc, updated_at) VALUES (?, ?, ?, ?)'
      ).run(docId, 'pat_12345', encryptPHI(patientData), new Date().toISOString());
      console.log('[demo-seed] Created demo patient account (MRN 12345)');
    } else {
      console.log('[demo-seed] Patient MRN=12345 already exists');
    }

    // 3) Demo lab account
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
      console.log('[demo-seed] Created demo lab account (testlab)');
    } else {
      console.log('[demo-seed] Lab testlab already exists');
    }

    // 4) Also write demo patient/lab to shared JSON store so Patient/Lab apps can login
    //    SECURITY: hash only — never a plaintext password field.
    try {
      const dataDir = config.dbPath ? dirname(config.dbPath) : dirname('veltruvia.db');
      const storePath = join(dataDir, 'patient-store.json');
      let store = {};
      try { store = JSON.parse(readFileSync(storePath, 'utf-8')); } catch {}
      if (!store['12345']) {
        store['12345'] = {
          mrn: '12345', name: 'Test Patient', dob: '1985-06-15',
          diag: 'Acute Lymphoblastic Leukemia (ALL)',
          pass: hashUiPassword('testpat123'),
          docId, _ownerId: docId, _savedAt: new Date().toISOString(),
        };
      }
      if (!store['lab_testlab']) {
        store['lab_testlab'] = {
          labId, username: 'testlab',
          name: 'Test Lab', password: hashUiPassword('testlab123'),
          docId, _ownerId: docId, _savedAt: new Date().toISOString(),
        };
      }
      writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf-8');
      console.log('[demo-seed] Patient/Lab entries written to patient-store.json');
    } catch (e) {
      console.warn('[demo-seed] patient-store.json write skipped:', e.message);
    }

    console.log('[demo-seed] Demo data ready.');
  } catch (e) {
    console.error('[demo-seed] Error:', e.message);
  }
}

export async function writeAudit({ actorId, actorRole, action, targetId, detail, ip }) {
  const now = new Date().toISOString();
  
  // Write to database (primary storage)
  await db.prepare(
    'INSERT INTO audit_log (id, actor_id, actor_role, action, target_id, detail_enc, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    randomToken(12), actorId || null, actorRole || null, action,
    targetId || null, detail ? encryptPHI(detail) : null, ip || null,
    now
  );
  
  // Record on blockchain (async, non-blocking). The module lazy-initializes
  // its file backend on first use, so no connected-check is needed here.
  try {
    const blockchain = (await import('../blockchain/index.js')).default;
    blockchain.recordAudit({
      record: { actorId, actorRole, action, targetId, timestamp: now },
      action,
      targetId: targetId || actorId || 'unknown',
      actorId
    }).catch(err => console.error('[blockchain] Audit failed:', err.message));
  } catch (err) {
    // Blockchain not available, continue without it
  }
}
