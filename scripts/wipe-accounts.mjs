#!/usr/bin/env node
/**
 * wipe-accounts.mjs — remove doctor/lab REGISTRATIONS and their email traces.
 *
 * Keeps: the admin account, patient/clinical data (kv_store), the deployment
 * backups and the tamper-evident chain (data/chain.json).
 * Removes: non-admin users, their sessions and push subscriptions, password
 * reset tokens, doctor login lockout counters, team invites/members, patient
 * access grants held by those accounts, password-change requests, and every
 * audit_log row whose actor or target is an email address.
 *
 * STOP THE SERVICE FIRST — the running server may hold the database in memory
 * (sql.js backend snapshots it to disk and would overwrite this wipe).
 *
 *   sudo systemctl stop veltruvia
 *   node scripts/wipe-accounts.mjs --yes
 *   sudo systemctl start veltruvia
 *
 * Patient records are owned by the doctor's user id. After the doctor
 * re-registers, reattach them with the old id printed by this script:
 *
 *   node scripts/wipe-accounts.mjs --reattach <oldUserId> --email <email>
 *
 * Nothing is written without --yes. A consistent backup (VACUUM INTO) is taken
 * before any delete and the removed accounts are listed in
 * backups/removed-accounts-<ts>.json so a reattach stays possible.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const APP_DIR = process.env.APP_DIR || '/home/ubuntu/veltruvia/app';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const DB_PATH = resolve(arg('--db', process.env.DB_PATH || join(APP_DIR, 'chemocure.db')));
const CONFIRMED = process.argv.includes('--yes');
const REATTACH_ID = arg('--reattach');
const EMAIL = arg('--email');

async function openDb(path, readOnly = false) {
  const opts = { readOnly };
  try {
    const { DatabaseSync } = await import('node:sqlite');
    return { db: new DatabaseSync(path, opts), driver: 'node:sqlite' };
  } catch { /* Node < 22.5 — fall through to the app's native driver */ }
  const { createRequire } = await import('node:module');
  const req = createRequire(join(APP_DIR, 'package.json'));
  const Database = req('better-sqlite3');
  return { db: new Database(path, opts), driver: 'better-sqlite3' };
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupDir = () => join(dirname(DB_PATH), 'backups');

async function reattach() {
  if (!EMAIL) throw new Error('--reattach needs --email <the email registered again>');
  const { db, driver } = await openDb(DB_PATH);
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(String(EMAIL).toLowerCase());
    if (!user) throw new Error(`no account found for ${EMAIL} — register first, then re-run this`);
    if (user.id === REATTACH_ID) throw new Error('old and new id are the same — nothing to do');
    const out = {};
    db.exec('BEGIN');
    try {
      for (const [table, col] of [
        ['kv_store', 'owner_id'],
        ['push_subs', 'subject_id'],
        ['patient_access', 'owner_id'],
        ['password_change_requests', 'doctor_id'],
      ]) {
        if (!tableExists(db, table)) continue;
        out[table] = db.prepare(`UPDATE ${table} SET ${col} = ? WHERE ${col} = ?`).run(user.id, REATTACH_ID).changes;
      }
      db.exec('COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch {}
      throw e;
    }
    console.log(`[reattach] ${driver}: ${EMAIL} (${REATTACH_ID} -> ${user.id})`);
    for (const [t, n] of Object.entries(out)) console.log(`  ${t.padEnd(24)} ${n} row(s) moved`);
  } finally { db.close(); }
}

function tableExists(db, name) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(name);
}

async function wipe() {
  if (!existsSync(DB_PATH)) throw new Error(`database not found: ${DB_PATH} (pass --db <path>)`);
  const { db, driver } = await openDb(DB_PATH);
  // Child rows are deleted explicitly, so FK enforcement would only abort the
  // users delete on rows this script is about to remove anyway.
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    const users = db.prepare("SELECT id, email, role, created_at FROM users WHERE role <> 'admin'").all();
    const admins = db.prepare("SELECT email FROM users WHERE role = 'admin'").all();
    const orphans = db.prepare("SELECT COUNT(DISTINCT owner_id) AS n FROM kv_store").get();

    console.log(`[wipe] ${driver}  ${DB_PATH}`);
    console.log(`[wipe] keeping ${admins.length} admin account(s): ${admins.map(a => a.email).join(', ') || '(none)'}`);
    console.log(`[wipe] to delete: ${users.length} account(s)`);
    for (const u of users) console.log(`         - ${u.email} (${u.role}, ${u.created_at.slice(0, 10)})`);
    console.log(`[wipe] patient-store owners on this box: ${orphans.n} — clinical data is kept`);
    if (!CONFIRMED) {
      console.log('\n[wipe] dry run — nothing changed. Re-run with --yes to delete.');
      return;
    }
    if (!users.length && !db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE actor_id LIKE '%@%' OR target_id LIKE '%@%'").get().n) {
      console.log('\n[wipe] nothing to delete — already clean.');
      return;
    }

    mkdirSync(backupDir(), { recursive: true });
    const ts = stamp();
    const backupPath = join(backupDir(), `pre-wipe-${ts}.db`);
    db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
    writeFileSync(join(backupDir(), `removed-accounts-${ts}.json`),
      JSON.stringify({ at: new Date().toISOString(), db: DB_PATH, removed: users }, null, 2));
    console.log(`[wipe] backup: ${backupPath}`);

    const ids = users.map(u => u.id);
    const inList = ids.length ? `(${ids.map(() => '?').join(',')})` : '(NULL)';
    const counts = {};
    db.exec('BEGIN');
    try {
      for (const [label, sql, params] of [
        ['password_change_requests', `DELETE FROM password_change_requests WHERE doctor_id IN ${inList}`, ids],
        ['push_subs',                `DELETE FROM push_subs WHERE subject_id IN ${inList}`, ids],
        ['team_members',             `DELETE FROM team_members WHERE user_id IN ${inList}`, ids],
        ['patient_access',           `DELETE FROM patient_access WHERE owner_id IN ${inList} OR doctor_id IN ${inList}`, [...ids, ...ids]],
        ['sessions',                 `DELETE FROM sessions WHERE subject_id IN ${inList}`, ids],
        ['team_invites',             `DELETE FROM team_invites`, []],
        ['password_resets',          `DELETE FROM password_resets`, []],
        ['users',                    `DELETE FROM users WHERE role <> 'admin'`, []],
        ['login_attempts',           `DELETE FROM login_attempts WHERE identifier LIKE 'auth:%'`, []],
        ['audit_log (email rows)',   `DELETE FROM audit_log WHERE actor_id LIKE '%@%' OR target_id LIKE '%@%'`, []],
      ]) {
        if (!tableExists(db, sql.match(/FROM (\w+)/)[1])) continue;
        counts[label] = db.prepare(sql).run(...params).changes;
      }
      // One non-identifying audit entry so the wipe itself stays accountable.
      db.prepare(`INSERT INTO audit_log (id, actor_id, actor_role, action, target_id, detail_enc, ip, created_at)
                  VALUES (?, 'system', 'system', 'admin.accounts_wipe', ?, NULL, NULL, ?)`)
        .run(Math.random().toString(36).slice(2, 14), 'accounts', new Date().toISOString());
      db.exec('COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch {}
      throw e;
    }

    console.log('[wipe] deleted:');
    for (const [t, n] of Object.entries(counts)) console.log(`  ${t.padEnd(26)} ${n} row(s)`);

    const left = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
    const orphanAfter = db.prepare("SELECT COUNT(DISTINCT owner_id) AS n FROM kv_store WHERE owner_id NOT IN (SELECT id FROM users)").get().n;
    console.log(`[wipe] accounts left: ${left}`);
    if (orphanAfter) {
      console.log(`\n[wipe] ${orphanAfter} patient-store owner(s) no longer have an account.`);
      for (const u of users) console.log(`  after re-registering ${u.email}: node scripts/wipe-accounts.mjs --reattach ${u.id} --email ${u.email}`);
    }
    console.log('\n[wipe] done — start the service: sudo systemctl start veltruvia');
  } finally { db.close(); }
}

try {
  REATTACH_ID ? await reattach() : await wipe();
} catch (e) {
  console.error(`[wipe] ${e.message}`);
  process.exit(1);
}
