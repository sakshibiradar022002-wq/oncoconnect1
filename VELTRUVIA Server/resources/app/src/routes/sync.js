// Encrypted key-value sync for the doctor/patient UIs.
//
// The apps keep their working data in localStorage under cc_* keys. This
// router mirrors an account's whole keyspace server-side, encrypted with the
// PHI master key, so data follows the account across devices instead of
// living in one browser. Doctors sync everything they own; patients get a
// session scoped to the keys that mention their MRN.

import { Router } from 'express';
import { pbkdf2Sync, timingSafeEqual, randomBytes, createHash, randomInt } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { db, writeAudit, flushDb } from '../db/index.js';
import { encryptPHI, decryptPHI, randomToken } from '../crypto.js';
import { authenticate, requireRole, createSession } from '../middleware/auth.js';
import { mailConfigured, sendMail } from '../mail.js';
import { smsConfigured, sendSms } from '../sms.js';
import { validate, asyncHandler } from '../middleware/validate.js';
import { notifySubject } from '../push.js';
import { validateLabSubmission } from '../validators/labResults.js';

// Fire-and-forget doctor notifications for incoming alert / lab-result keys.
function pushDoctorForChanges(ownerId, changes) {
  for (const [k, v] of Object.entries(changes || {})) {
    if (k.startsWith('alerts_') && Array.isArray(v) && v[0]) {
      const a = v[0];
      notifySubject(ownerId, {
        title: a.urgent ? '🚨 Urgent patient alert' : 'Patient update',
        body: `${a.name || a.mrn}: ${a.text}`,
        url: '/',
      }).catch(() => {});
    } else if (k.startsWith('lab_subs_')) {
      notifySubject(ownerId, { title: 'New lab result', body: 'A lab uploaded new results. Tap to review.', url: '/' }).catch(() => {});
    }
  }
}

export const syncRouter = Router();

const MAX_KEYS_PER_PUSH = 500;
const MAX_KEY_LENGTH = 200;

// ── Self-service password recovery (no second person required) ──────
// Patients/Labs identify with MRN/username + the email on their account.
// A single-use, 15-minute token is emailed; the reset only succeeds if it
// matches. Responses are uniform whether or not the account exists.
const recoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many recovery attempts. Try again in 15 minutes.' },
});
const recoveryAttempts = new Map(); // ip → { count, windowStart } — second layer behind the proxy limiter
function recoveryAllow(ip) {
  const now = Date.now();
  const rec = recoveryAttempts.get(ip);
  if (!rec || now - rec.windowStart > 15 * 60 * 1000) {
    recoveryAttempts.set(ip, { count: 1, windowStart: now });
    return true;
  }
  rec.count += 1;
  return rec.count <= 8;
}

function recoveryEmail(rec) {
  if (rec.email) return String(rec.email).toLowerCase();
  if (rec.meta && rec.meta.email) return String(rec.meta.email).toLowerCase();
  return '';
}

function issueRecoveryToken(rec) {
  const token = randomBytes(24).toString('base64url');
  rec.resetTokenHash = createHash('sha256').update(token).digest('hex');
  rec.resetExpires = new Date(15 * 60 * 1000 + Date.now()).toISOString();
  return token;
}

const recoveryBodySchema = z.object({
  mrn: z.string().min(1).max(40).optional(),
  username: z.string().min(1).max(100).optional(),
  email: z.string().email().max(200).transform(s => s.trim().toLowerCase()),
  newPassword: z.string().min(6).max(200).optional(),
});

function findRecoveryTarget(store, mrn, username) {
  if (mrn) return { key: mrn, rec: store[mrn] || null, passField: 'pass' };
  if (username) {
    for (const [k, v] of Object.entries(store)) {
      if (v && typeof v === 'object' && v.username === username) {
        return { key: k, rec: v, passField: 'password' };
      }
    }
  }
  return { key: null, rec: null, passField: null };
}

// Step 1: request a reset token (emailed; response is always uniform)
syncRouter.post('/forgot-password', recoveryLimiter, validate(recoveryBodySchema), asyncHandler(async (req, res) => {
  if (!recoveryAllow(req.ip)) return res.status(429).json({ error: 'Too many recovery attempts. Try again in 15 minutes.' });
  const { mrn, username, email } = req.valid;
  const store = readPatientStore();
  const { rec } = findRecoveryTarget(store, mrn, username);
  if (rec) {
    const onFile = recoveryEmail(rec);
    if (onFile && onFile === email && mailConfigured()) {
      const token = issueRecoveryToken(rec);
      try {
        await sendMail({
          to: onFile,
        subject: 'VELTRUVIA — password reset code',
          text: `Your VELTRUVIA password reset code is:\n\n${token}\n\nIt expires in 15 minutes. If you did not request this, ignore this email.`,
        });
        writePatientStore(store);
      } catch { /* fall through to uniform response */ }
    }
  }
  res.json({
    ok: true,
    message: mailConfigured()
      ? 'If the account and email match, a reset code has been sent.'
      : 'Email is not configured on this server — ask your doctor or lab administrator to reset the password for you.',
  });
}));

// Step 2: complete the reset with the emailed token
syncRouter.post('/reset-password', recoveryLimiter, validate(recoveryBodySchema.extend({ token: z.string().min(10).max(200) })), asyncHandler(async (req, res) => {
  if (!recoveryAllow(req.ip)) return res.status(429).json({ error: 'Too many recovery attempts. Try again in 15 minutes.' });
  const { mrn, username, newPassword, token } = req.valid;
  if (!newPassword) return res.status(400).json({ error: 'New password is required.' });
  const store = readPatientStore();
  const { key, rec, passField } = findRecoveryTarget(store, mrn, username);
  const fail = () => res.status(400).json({ error: 'Invalid or expired reset code.' });
  if (!key || !rec || !rec.resetTokenHash || !rec.resetExpires) return fail();
  if (new Date(rec.resetExpires).getTime() < Date.now()) {
    delete rec.resetTokenHash; delete rec.resetExpires;
    writePatientStore(store);
    return fail();
  }
  const hash = createHash('sha256').update(token).digest('hex');
  if (hash !== rec.resetTokenHash) return fail();

  // Success: burn the token, set the new hashed password, revoke sessions.
  delete rec.resetTokenHash; delete rec.resetExpires; delete rec.passPlain;
  rec[passField] = hashUiPasswordV2(newPassword);
  store[key] = rec;
  writePatientStore(store);
  try {
    await db.prepare('UPDATE sessions SET revoked = 1 WHERE subject_id LIKE ? AND revoked = 0').run('%::' + key);
  } catch { /* best-effort revocation */ }
  await writeAudit({ actorId: key, actorRole: passField === 'pass' ? 'kv-patient' : 'kv-lab', action: 'sync.self_password_reset', targetId: key, ip: req.ip });
  res.json({ ok: true, message: 'Password updated. Sign in with your new password.' });
}));

async function upsertKey(ownerId, k, v, now) {
  if (v === null || v === undefined) {
    await db.prepare('DELETE FROM kv_store WHERE owner_id = ? AND k = ?').run(ownerId, k);
  } else {
    await db.prepare(`
      INSERT INTO kv_store (owner_id, k, v_enc, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(owner_id, k) DO UPDATE SET v_enc = excluded.v_enc, updated_at = excluded.updated_at
    `).run(ownerId, k, encryptPHI(v), now);
  }
}

async function applyChanges(ownerId, changes, allow) {
  const entries = Object.entries(changes);
  if (entries.length > MAX_KEYS_PER_PUSH) {
    const e = new Error('Too many keys in one push'); e.status = 400; throw e;
  }
  const now = new Date().toISOString();
  let count = 0;
  for (const [k, v] of entries) {
    if (typeof k !== 'string' || !k || k.length > MAX_KEY_LENGTH) continue;
    if (allow && !allow(k)) continue;
    await upsertKey(ownerId, k, v ?? null, now);
    count++;
  }
  return count;
}

const pushSchema = z.object({ changes: z.record(z.any()) });

// ── Doctor: pull the whole keyspace ───────────────────────────────
syncRouter.get('/', authenticate, requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  const rows = await db.prepare('SELECT k, v_enc, updated_at FROM kv_store WHERE owner_id = ?')
    .all(req.auth.subjectId);
  const keys = {};
  for (const r of rows) keys[r.k] = { v: decryptPHI(r.v_enc), ts: r.updated_at };
  res.json({ keys });
}));

// ── Doctor: push changes (value null = delete) ────────────────────
syncRouter.put('/', authenticate, requireRole('doctor', 'admin'), validate(pushSchema), asyncHandler(async (req, res) => {
  const changes = req.valid.changes;
  const warnings = [];

  // Validate lab submissions for physiological ranges
  for (const [k, v] of Object.entries(changes)) {
    if (k.startsWith('lab_subs_') && v && typeof v === 'object') {
      const validation = validateLabSubmission(v);
      if (!validation.valid) {
        const e = new Error(`Lab result validation failed: ${validation.errors.join('; ')}`);
        e.status = 400;
        throw e;
      }
      if (validation.warnings.length > 0) {
        warnings.push(...validation.warnings);
      }
    }
  }

  const count = await applyChanges(req.auth.subjectId, changes);
  await writeAudit({
    actorId: req.auth.subjectId,
    actorRole: req.auth.role,
    action: 'sync.push',
    detail: { count, labWarnings: warnings.length > 0 ? warnings : undefined },
    ip: req.ip,
  });
  flushDb();
  res.json({ ok: true, count, warnings: warnings.length > 0 ? warnings : undefined });
}));

// ── Patient login against the synced records ──────────────────────
// Password formats, oldest to newest:
//   plaintext                              (legacy prototype records)
//   pbkdf2:<salt>:<b64>                    (browser, SHA-256 / 100k)
//   pbkdf2v2:<iterations>:<salt>:<b64>     (server upgrade, SHA-256 / 210k)
// Legacy records are re-hashed to v2 on successful login (see upgradeStoredPassword).
const V2_ITERATIONS = 210000;

function hashUiPasswordV2(password) {
  const salt = randomBytes(16).toString('base64url');
  const hash = pbkdf2Sync(String(password), salt, V2_ITERATIONS, 32, 'sha256').toString('base64');
  return `pbkdf2v2:${V2_ITERATIONS}:${salt}:${hash}`;
}

function verifyUiPassword(password, stored) {
  if (!stored) return false;
  let expected = String(stored);
  if (!expected.startsWith('pbkdf2')) {
    // One-time legacy migration: a stored plaintext value is compared
    // directly. On success upgradeStoredPassword() immediately re-hashes
    // and strips passPlain, so this path can fire at most once per
    // account. Rejecting plaintext outright would permanently lock out
    // every legacy user with no way to recover.
    return expected === String(password);
  }
  let actual = String(password);
  if (expected.startsWith('pbkdf2v2:')) {
    const [, iterStr, salt, hash] = expected.split(':');
    const iterations = parseInt(iterStr, 10);
    if (!salt || !hash || !iterations) return false;
    actual = pbkdf2Sync(actual, salt, iterations, 32, 'sha256').toString('base64');
    expected = hash;
  } else if (expected.startsWith('pbkdf2:')) {
    const [, salt, hash] = expected.split(':');
    if (!salt || !hash) return false;
    actual = pbkdf2Sync(actual, salt, 100000, 32, 'sha256').toString('base64');
    expected = hash;
  }
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// After a successful login, upgrade weak/plaintext stored credentials to v2.
async function upgradeStoredPassword(ownerId, key, rec, password, passField) {
  const stored = rec[passField];
  const isWeak = !String(stored || '').startsWith('pbkdf2') || rec.passPlain;
  if (!isWeak) return;
  const upgraded = { ...rec, [passField]: hashUiPasswordV2(password) };
  delete upgraded.passPlain;
  await upsertKey(ownerId, key, upgraded, new Date().toISOString());
}

// A key belongs to exactly this patient — matched by precise pattern, not a
// loose substring. Substring matching (instr / includes) was safe only while
// every MRN was the same length; exact patterns keep patients isolated even
// if the MRN format ever changes, and stop a patient injecting arbitrary keys.
function patientOwnsKey(k, mrn) {
  const exact = ['pat_', 'msgs_', 'appts_', 'lab_subs_', 'pat_tokens_',
    'reminders_', 'invoices_', 'checkin_', 'travel_'].map(pre => pre + mrn);
  if (exact.includes(k)) return true;
  // Red-flag / triage alerts: alerts_<docId>_<mrn>. Without this the
  // patient app's urgent alerts never leave the patient's own browser.
  if (k.startsWith('alerts_') && k.endsWith('_' + mrn)) return true;
  // date/suffix-scoped families: log_<mrn>_<date>, medlog_<mrn>_<date>,
  // factbr_<mrn>...
  return k.startsWith('log_' + mrn + '_') || k.startsWith('medlog_' + mrn + '_')
    || k.startsWith('factbr_' + mrn);
}

// MRN-scoped access control for the shared JSON-store endpoints.
// Doctors/admins may touch any record; a session patient may only touch
// records whose MRN matches their own session; unauthenticated callers are
// rejected. Guards every route that reads or writes PHI by MRN parameter.
async function requireMrnAccess(req, res, mrn) {
  if (res.headersSent) return false;
  if (!req.auth) { res.status(401).json({ error: 'Not authenticated' }); return false; }
  if (['doctor', 'admin'].includes(req.auth.role)) return true;
  if (req.auth.role === 'kv-patient') {
    const sessionMrn = String(req.auth.subjectId).split('::')[1];
    if (sessionMrn && sessionMrn === mrn) return true;
    res.status(403).json({ error: 'Not your patient record' });
    return false;
  }
  res.status(403).json({ error: 'Insufficient permissions' });
  return false;
}

// Everything the patient app needs: their own keys, plus the owning doctor's
// profile with credentials stripped.
async function collectPatientKeys(ownerId, mrn) {
  const rows = await db.prepare('SELECT k, v_enc, updated_at FROM kv_store WHERE owner_id = ?')
    .all(ownerId);
  const keys = {};
  let docId = null;
  for (const r of rows) {
    if (!patientOwnsKey(r.k, mrn)) continue;
    const v = decryptPHI(r.v_enc);
    // SECURITY: Never return password hashes to the client
    if (v) {
      delete v.pass;
      delete v.passPlain;
      delete v.password;
    }
    keys[r.k] = { v, ts: r.updated_at };
    if (r.k === 'pat_' + mrn && v && v.docId) docId = v.docId;
  }
  if (docId) {
    const d = await db.prepare('SELECT k, v_enc, updated_at FROM kv_store WHERE owner_id = ? AND k = ?')
      .get(ownerId, 'doc_' + docId);
    if (d) {
      const doc = decryptPHI(d.v_enc) || {};
      delete doc.pass;
      delete doc.passPlain;
      keys[d.k] = { v: doc, ts: d.updated_at };
    }
  }
  return keys;
}

// ── Brute-force lockout for patient/lab logins (DB-backed) ──
const KV_MAX_ATTEMPTS = 8;
const KV_LOCKOUT_MS = 15 * 60 * 1000;
const KV_WINDOW_MS = 15 * 60 * 1000;

async function kvRecordFailed(identifier) {
  const now = new Date().toISOString();
  const entry = await db.prepare('SELECT * FROM login_attempts WHERE identifier = ?').get(identifier);
  
  if (!entry || (Date.now() - new Date(entry.first_attempt).getTime()) > KV_WINDOW_MS) {
    await db.prepare(`
      INSERT INTO login_attempts (identifier, count, first_attempt, locked_until)
      VALUES (?, 1, ?, NULL)
      ON CONFLICT(identifier) DO UPDATE SET count = 1, first_attempt = excluded.first_attempt, locked_until = NULL
    `).run(identifier, now);
    return { count: 1, lockedUntil: 0 };
  }
  
  const newCount = entry.count + 1;
  let lockedUntil = entry.locked_until;
  if (newCount >= KV_MAX_ATTEMPTS) {
    lockedUntil = new Date(Date.now() + KV_LOCKOUT_MS).toISOString();
  }
  await db.prepare('UPDATE login_attempts SET count = ?, locked_until = ? WHERE identifier = ?')
    .run(newCount, lockedUntil, identifier);
  return { count: newCount, lockedUntil: lockedUntil ? new Date(lockedUntil).getTime() : 0 };
}

async function kvIsLocked(identifier) {
  const entry = await db.prepare('SELECT * FROM login_attempts WHERE identifier = ?').get(identifier);
  if (!entry) return false;
  if (entry.locked_until && new Date(entry.locked_until).getTime() > Date.now()) return true;
  if (entry.locked_until && new Date(entry.locked_until).getTime() <= Date.now()) {
    await db.prepare('DELETE FROM login_attempts WHERE identifier = ?').run(identifier);
  }
  return false;
}

async function kvClear(identifier) {
  await db.prepare('DELETE FROM login_attempts WHERE identifier = ?').run(identifier);
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later' },
});

const patientLoginSchema = z.object({
  mrn: z.string().min(3).max(40).transform(s => s.trim().toUpperCase()),
  password: z.string().min(1).max(200),
});

syncRouter.post('/patient-login', loginLimiter, validate(patientLoginSchema), asyncHandler(async (req, res) => {
  const { mrn, password } = req.valid;
  const rows = await db.prepare('SELECT owner_id, v_enc FROM kv_store WHERE k = ?').all('pat_' + mrn);

  let ownerId = null;
  for (const r of rows) {
    const rec = decryptPHI(r.v_enc);
    // SECURITY: only PBKDF2 hashes are accepted — plaintext passwords are never stored
    if (rec && verifyUiPassword(password, rec.pass)) {
      ownerId = r.owner_id;
      await upgradeStoredPassword(ownerId, 'pat_' + mrn, rec, password, 'pass');
      break;
    }
  }
  if (!ownerId) {
    const entry = await kvRecordFailed('pat:' + mrn);
    return res.status(401).json({ error: 'Invalid MRN or password' });
  }
  await kvClear('pat:' + mrn);

  // Session subject encodes which doctor's keyspace this patient lives in.
  const session = await createSession(res, { subjectId: `${ownerId}::${mrn}`, subjectType: 'kv-patient', role: 'kv-patient' });
  await writeAudit({ actorId: mrn, actorRole: 'kv-patient', action: 'sync.patient_login', targetId: ownerId, ip: req.ip });

  res.json({ ok: true, mrn, ...(req.headers['x-veltruvia-native'] === '1' ? { token: session.token } : {}), keys: await collectPatientKeys(ownerId, mrn) });
}));

function patientScope(req, res, next) {
  const [ownerId, mrn] = String(req.auth.subjectId).split('::');
  if (!ownerId || !mrn) return res.status(401).json({ error: 'Invalid session' });
  req.patientScope = { ownerId, mrn };
  next();
}

// ── Patient: refresh own keys ─────────────────────────────────────
syncRouter.get('/patient', authenticate, requireRole('kv-patient'), patientScope, asyncHandler(async (req, res) => {
  const { ownerId, mrn } = req.patientScope;
  res.json({ keys: await collectPatientKeys(ownerId, mrn) });
}));

// ── Patient: push changes — only keys that mention their MRN ──────
syncRouter.put('/patient', authenticate, requireRole('kv-patient'), patientScope, validate(pushSchema), asyncHandler(async (req, res) => {
  const { ownerId, mrn } = req.patientScope;
  const changes = req.valid.changes;
  const warnings = [];

  // Validate lab submissions for physiological ranges
  for (const [k, v] of Object.entries(changes)) {
    if ((k.startsWith('lab_subs_') || k === `lab_subs_${mrn}`) && v && typeof v === 'object') {
      const validation = validateLabSubmission(v);
      if (!validation.valid) {
        const e = new Error(`Lab result validation failed: ${validation.errors.join('; ')}`);
        e.status = 400;
        throw e;
      }
      if (validation.warnings.length > 0) {
        warnings.push(...validation.warnings);
      }
    }
  }

  const count = await applyChanges(ownerId, changes, k => patientOwnsKey(k, mrn));
  pushDoctorForChanges(ownerId, changes);
  await writeAudit({
    actorId: mrn,
    actorRole: 'kv-patient',
    action: 'sync.patient_push',
    targetId: ownerId,
    detail: { count, labWarnings: warnings.length > 0 ? warnings : undefined },
    ip: req.ip,
  });
  flushDb();
  res.json({ ok: true, count, warnings: warnings.length > 0 ? warnings : undefined });
}));

// ── Lab technician login against the synced records ───────────────
// Lab accounts are created in the doctor UI and stored under
// lab_<docId>_<labId> as { name, username, password, labId, docId }.
// Everything the lab portal needs:
//   - its own account record
//   - pat_tokens_<docId>   (assigned tasks; the lab marks tokens used)
//   - lab_subs_<docId>     (submission list; the lab appends results)
//   - lab_pat_<docId>      (synthesized, sanitized patient list — mrn/name/
//     diagnosis only, no credentials — for the upload dropdown)
async function collectLabKeys(ownerId, docId, labId) {
  const keys = {};
  const wanted = [`lab_${docId}_${labId}`, `pat_tokens_${docId}`, `lab_subs_${docId}`];
  for (const k of wanted) {
    const r = await db.prepare('SELECT k, v_enc, updated_at FROM kv_store WHERE owner_id = ? AND k = ?')
      .get(ownerId, k);
    if (r) keys[r.k] = { v: decryptPHI(r.v_enc), ts: r.updated_at };
  }

  const patRows = await db.prepare("SELECT k, v_enc FROM kv_store WHERE owner_id = ? AND k LIKE 'pat_%' AND k NOT LIKE 'pat_tokens_%'")
    .all(ownerId);
  const patients = [];
  for (const r of patRows) {
    const p = decryptPHI(r.v_enc);
    if (p && p.docId === docId && p.mrn && p.name) {
      patients.push({ mrn: p.mrn, name: p.name, diag: p.diag || '', docId: p.docId });
    }
  }
  keys[`lab_pat_${docId}`] = { v: patients, ts: new Date().toISOString() };
  return keys;
}

const labLoginSchema = z.object({
  username: z.string().min(1).max(100).transform(s => s.trim()),
  password: z.string().min(1).max(200),
});

syncRouter.post('/lab-login', loginLimiter, validate(labLoginSchema), asyncHandler(async (req, res) => {
  const { username, password } = req.valid;
  const rows = await db.prepare("SELECT owner_id, k, v_enc FROM kv_store WHERE k LIKE 'lab_%'").all();

  let found = null;
  for (const r of rows) {
    if (r.k.startsWith('lab_subs_') || r.k.startsWith('lab_tokens_') || r.k.startsWith('lab_pat_')) continue;
    const rec = decryptPHI(r.v_enc);
    if (rec && rec.labId && rec.username === username && verifyUiPassword(password, rec.password)) {
      found = { ownerId: r.owner_id, rec };
      await upgradeStoredPassword(r.owner_id, r.k, rec, password, 'password');
      break;
    }
  }
  if (!found) {
    await kvRecordFailed('lab:' + username);
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  await kvClear('lab:' + username);

  const { ownerId, rec } = found;
  const session = await createSession(res, {
    subjectId: `${ownerId}::${rec.docId}::${rec.labId}`,
    subjectType: 'kv-lab',
    role: 'kv-lab',
  });
  await writeAudit({ actorId: rec.labId, actorRole: 'kv-lab', action: 'sync.lab_login', targetId: ownerId, ip: req.ip });

  res.json({ ok: true, labId: rec.labId, ...(req.headers['x-veltruvia-native'] === '1' ? { token: session.token } : {}), keys: await collectLabKeys(ownerId, rec.docId, rec.labId) });
}));

function labScope(req, res, next) {
  const [ownerId, docId, labId] = String(req.auth.subjectId).split('::');
  if (!ownerId || !docId || !labId) return res.status(401).json({ error: 'Invalid session' });
  req.labScope = { ownerId, docId, labId };
  next();
}

// ── Lab: refresh own keys ─────────────────────────────────────────
syncRouter.get('/lab', authenticate, requireRole('kv-lab'), labScope, asyncHandler(async (req, res) => {
  const { ownerId, docId, labId } = req.labScope;
  res.json({ keys: await collectLabKeys(ownerId, docId, labId) });
}));

// ── Lab: push changes — only its task tokens and submissions ──────
syncRouter.put('/lab', authenticate, requireRole('kv-lab'), labScope, validate(pushSchema), asyncHandler(async (req, res) => {
  const { ownerId, docId, labId } = req.labScope;
  const allowed = new Set([`pat_tokens_${docId}`, `lab_subs_${docId}`]);
  const changes = req.valid.changes;
  const warnings = [];

  // Validate lab submissions for physiological ranges
  for (const [k, v] of Object.entries(changes)) {
    if (k === `lab_subs_${docId}` && v && typeof v === 'object') {
      const validation = validateLabSubmission(v);
      if (!validation.valid) {
        const e = new Error(`Lab result validation failed: ${validation.errors.join('; ')}`);
        e.status = 400;
        throw e;
      }
      if (validation.warnings.length > 0) {
        warnings.push(...validation.warnings);
      }
    }
  }

  const count = await applyChanges(ownerId, changes, k => allowed.has(k));
  pushDoctorForChanges(ownerId, changes);
  await writeAudit({
    actorId: labId,
    actorRole: 'kv-lab',
    action: 'sync.lab_push',
    targetId: ownerId,
    detail: { count, labWarnings: warnings.length > 0 ? warnings : undefined },
    ip: req.ip,
  });
  flushDb();
  res.json({ ok: true, count, warnings: warnings.length > 0 ? warnings : undefined });
}));

// ═══════════════════════════════════════════════════════════════════
// Password change request flow: doctor-initiated, patient OTP-approved
// ═══════════════════════════════════════════════════════════════════

const hashPcrOtp = (mrn, code) =>
  createHash('sha256').update(mrn.toLowerCase() + '|' + code).digest('hex');

// Doctor: request a password change for a patient.
// Generates a 6-digit OTP the doctor shares with the patient (in person).
// The patient must enter this OTP in the patient app to approve the change.
const pcrRequestSchema = z.object({
  mrn: z.string().min(3).max(40).transform(s => s.trim().toUpperCase()),
});

syncRouter.post('/password-change-request', authenticate, requireRole('doctor', 'admin'), validate(pcrRequestSchema), asyncHandler(async (req, res) => {
  const { mrn } = req.valid;
  const doctorId = req.auth.subjectId;

  // Verify doctor owns this patient
  const patRow = await db.prepare('SELECT k, v_enc FROM kv_store WHERE owner_id = ? AND k = ?')
    .get(doctorId, 'pat_' + mrn);
  if (!patRow) return res.status(404).json({ error: 'Patient not found in your records' });

  // Cancel any existing pending requests for this MRN from this doctor
  await db.prepare(`UPDATE password_change_requests SET status = 'expired', resolved_at = ?
    WHERE doctor_id = ? AND mrn = ? AND status = 'pending'`)
    .run(new Date().toISOString(), doctorId, mrn);

  // Generate 6-digit OTP
  const otp = String(randomInt(100000, 1000000));
  const otpHash = hashPcrOtp(mrn, otp);

  // Generate new password hash using server-side v2 format
  const newPass = String(randomBytes(16).toString('base64url')).slice(0, 20);
  const salt = randomBytes(16).toString('base64url');
  const newPassHash = `pbkdf2v2:210000:${salt}:${pbkdf2Sync(newPass, salt, 210000, 32, 'sha256').toString('base64')}`;

  const id = randomToken(16);
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min

  await db.prepare(`
    INSERT INTO password_change_requests (id, doctor_id, mrn, otp_hash, new_pass, new_pass_plain, status, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(id, doctorId, mrn, otpHash, newPassHash, newPass, now, expires);

  // Notify patient via push
  notifySubject(`${doctorId}::${mrn}`, {
    title: '🔑 Password change requested',
    body: `Your doctor has requested a password change. Open the app to approve it.`,
    url: '/patient.html',
  }).catch(() => {});

  // Try to deliver OTP to the patient via email, then SMS, then fallback to doctor.
  const pat = decryptPHI(patRow.v_enc);
  let deliveryMethod = 'doctor'; // fallback: doctor shows OTP in person
  let deliveryDetail = '';

  // 1) Try email if patient has an email and server email is configured
  if (pat.email && mailConfigured()) {
    try {
      await sendMail({
        to: pat.email,
        subject: `Your VELTRUVIA password change code: ${otp}`,
        text: `Hello ${pat.name || ''},

Your doctor has requested a password change for your VELTRUVIA account.

Your verification code is: ${otp}

Open the VELTRUVIA Patient App and enter this code to approve the change.
This code expires in 30 minutes. If you didn't request this, contact your doctor.`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:0 auto;padding:24px;">
          <h2 style="color:#059669;margin:0 0 6px;">VELTRUVIA</h2>
          <p>Hello${pat.name ? ' ' + pat.name : ''},</p>
          <p>Your doctor has requested a password change for your account.</p>
          <p>Your verification code is:</p>
          <div style="font-size:32px;font-weight:800;letter-spacing:6px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:14px;text-align:center;color:#059669;">${otp}</div>
          <p>Open the <strong>VELTRUVIA Patient App</strong> and enter this code to approve the password change.</p>
          <p style="color:#64748b;font-size:13px;">This code expires in 30 minutes. If you didn't request this, contact your doctor.</p>
        </div>`,
      });
      deliveryMethod = 'email';
      deliveryDetail = pat.email;
    } catch (e) { /* email failed — try SMS next */ }
  }

  // 2) Try SMS if email didn't work and patient has a phone and SMS is configured
  if (deliveryMethod === 'doctor' && pat.phone && await smsConfigured()) {
    try {
      await sendSms(pat.phone,
        `VELTRUVIA: Your password change code is ${otp}. Enter it in the Patient App to approve. Expires in 30 min.`
      );
      deliveryMethod = 'sms';
      deliveryDetail = pat.phone;
    } catch (e) { /* SMS failed — fallback to doctor */ }
  }

  await writeAudit({
    actorId: doctorId, actorRole: req.auth.role,
    action: 'password_change.request', targetId: mrn,
    detail: { delivery: deliveryMethod },
    ip: req.ip,
  });

  if (deliveryMethod === 'doctor') {
    // Fallback: return OTP to doctor so they can show it in person
    res.json({ ok: true, otp, newPassword: newPass, delivery: 'doctor', expiresMin: 30,
      message: 'Email/SMS not available. Share the OTP with the patient in person, then the new password after approval.' });
  } else {
    // OTP sent remotely — doctor only gets the new password (to share after approval)
    res.json({ ok: true, newPassword: newPass, delivery: deliveryMethod, deliveryTo: deliveryDetail, expiresMin: 30,
      message: `OTP sent to patient via ${deliveryMethod === 'email' ? 'email' : 'SMS'}. Share the new password after they approve.` });
  }
}));

// Doctor: cancel a pending password change request
const pcrCancelSchema = z.object({
  requestId: z.string().min(1),
});

syncRouter.post('/password-change-cancel', authenticate, requireRole('doctor', 'admin'), validate(pcrCancelSchema), asyncHandler(async (req, res) => {
  const { requestId } = req.valid;
  const now = new Date().toISOString();

  const result = await db.prepare(`UPDATE password_change_requests SET status = 'cancelled', resolved_at = ?
    WHERE id = ? AND doctor_id = ? AND status = 'pending'`)
    .run(now, requestId, req.auth.subjectId);

  if (result.changes === 0) return res.status(404).json({ error: 'Request not found or already resolved' });

  await writeAudit({
    actorId: req.auth.subjectId, actorRole: req.auth.role,
    action: 'password_change.cancel', targetId: requestId, ip: req.ip,
  });
  res.json({ ok: true, message: 'Request cancelled' });
}));

// Doctor: list pending password change requests for their patients
syncRouter.get('/password-change-pending', authenticate, requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  const rows = await db.prepare(`SELECT id, mrn, status, created_at, expires_at, resolved_at
    FROM password_change_requests WHERE doctor_id = ? ORDER BY created_at DESC`).all(req.auth.subjectId);
  res.json({ ok: true, requests: rows });
}));

// Doctor: retrieve the new password for an approved request
const pcrRetrieveSchema = z.object({
  requestId: z.string().min(1),
});

syncRouter.post('/password-change-retrieve', authenticate, requireRole('doctor', 'admin'), validate(pcrRetrieveSchema), asyncHandler(async (req, res) => {
  const { requestId } = req.valid;
  const row = await db.prepare(`SELECT id, mrn, new_pass_plain, status, created_at
    FROM password_change_requests WHERE id = ? AND doctor_id = ?`)
    .get(requestId, req.auth.subjectId);

  if (!row) return res.status(404).json({ error: 'Request not found' });
  if (row.status !== 'approved') return res.status(400).json({ error: 'Request not yet approved by patient' });

  // Return the plaintext password once, then clear it
  const plain = row.new_pass_plain;
  await db.prepare(`UPDATE password_change_requests SET new_pass_plain = NULL WHERE id = ?`).run(requestId);

  res.json({ ok: true, mrn: row.mrn, status: row.status, newPassword: plain,
    message: 'Password change was approved. Share this new password with the patient.' });
}));

// Patient: list their pending password change requests
syncRouter.get('/patient/password-change-pending', authenticate, requireRole('kv-patient'), patientScope, asyncHandler(async (req, res) => {
  const { ownerId, mrn } = req.patientScope;
  const rows = await db.prepare(`SELECT id, doctor_id, created_at, expires_at
    FROM password_change_requests WHERE doctor_id = ? AND mrn = ? AND status = 'pending'
    AND expires_at > ?`).all(ownerId, mrn, new Date().toISOString());

  // Enrich with doctor name if possible
  const enriched = [];
  for (const r of rows) {
    const doc = await db.prepare('SELECT name_enc FROM users WHERE id = ?').get(r.doctor_id);
    enriched.push({ ...r, doctorName: doc ? decryptPHI(doc.name_enc) : 'Your doctor' });
  }
  res.json({ ok: true, requests: enriched });
}));

// Patient: approve a password change by entering the OTP
const pcrApproveSchema = z.object({
  requestId: z.string().min(1),
  otp: z.string().length(6).regex(/^\d+$/),
});

syncRouter.post('/patient/password-change-approve', authenticate, requireRole('kv-patient'), patientScope, validate(pcrApproveSchema), asyncHandler(async (req, res) => {
  const { ownerId, mrn } = req.patientScope;
  const { requestId, otp } = req.valid;
  const now = new Date().toISOString();

  // Find the pending request for this patient
  const row = await db.prepare(`SELECT * FROM password_change_requests
    WHERE id = ? AND doctor_id = ? AND mrn = ? AND status = 'pending'`)
    .get(requestId, ownerId, mrn);

  if (!row) return res.status(404).json({ error: 'No pending request found' });
  if (new Date(row.expires_at) < new Date()) {
    await db.prepare(`UPDATE password_change_requests SET status = 'expired', resolved_at = ? WHERE id = ?`)
      .run(now, requestId);
    return res.status(400).json({ error: 'Request expired. Ask your doctor to create a new one.' });
  }

  // Verify OTP
  if (row.otp_hash !== hashPcrOtp(mrn, otp)) {
    return res.status(401).json({ error: 'Invalid OTP code. Check with your doctor and try again.' });
  }

  // OTP correct — update the patient's password in kv_store
  await db.prepare(`UPDATE password_change_requests SET status = 'approved', resolved_at = ? WHERE id = ?`)
    .run(now, requestId);

  // Update the patient record with the new password hash
  const patRow = await db.prepare('SELECT v_enc FROM kv_store WHERE owner_id = ? AND k = ?')
    .get(ownerId, 'pat_' + mrn);
  if (patRow) {
    const pat = decryptPHI(patRow.v_enc);
    pat.pass = row.new_pass;
    pat.updatedAt = Date.now();
    await upsertKey(ownerId, 'pat_' + mrn, pat, now);
  }

  // Notify doctor via push
  notifySubject(ownerId, {
    title: '✅ Password change approved',
    body: `Patient ${mrn} has approved the password change.`,
    url: '/',
  }).catch(() => {});

  await writeAudit({
    actorId: mrn, actorRole: 'kv-patient',
    action: 'password_change.approve', targetId: ownerId, ip: req.ip,
  });

  res.json({ ok: true, message: 'Password change approved. Your doctor has been notified and can retrieve the new credentials.' });
}));

// ── Shared Patient Store (JSON file fallback for cross-app data sharing) ──
// sql.js is in-memory per process — Doctor and Patient can't share the same
// in-memory DB. This JSON-file store lets the Doctor write patient data to
// disk and the Patient/Lab read it directly, bypassing sql.js entirely.
import { readFileSync as _readFileSync, writeFileSync as _writeFileSync, existsSync as _existsSync, mkdirSync as _mkdirSync } from 'node:fs';
import { join as _join, dirname as _dirname } from 'node:path';

const PATIENT_STORE_PATH = _join(_dirname(process.env.DB_PATH || '.'), 'patient-store.json');
try { _mkdirSync(_dirname(PATIENT_STORE_PATH), { recursive: true }); } catch {}

function readPatientStore() {
  try {
    if (_existsSync(PATIENT_STORE_PATH)) {
      return JSON.parse(_readFileSync(PATIENT_STORE_PATH, 'utf-8'));
    }
  } catch {}
  return {};
}

function writePatientStore(data) {
  try {
    _writeFileSync(PATIENT_STORE_PATH, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('[patient-store] write failed:', e.message);
    return false;
  }
}

// ── Zod schemas for shared store endpoints ──
const savePatientSchema = z.object({
  mrn: z.string().min(1).max(40).transform(s => s.trim().toUpperCase()),
  patient: z.record(z.any()),
});
const deletePatientSchema = z.object({
  mrn: z.string().min(1).max(40).transform(s => s.trim().toUpperCase()),
});
const storeLoginSchema = z.object({
  mrn: z.string().min(1).max(40).transform(s => s.trim().toUpperCase()),
  password: z.string().min(1).max(200),
});
const labStoreLoginSchema = z.object({
  username: z.string().min(1).max(100).transform(s => s.trim()),
  password: z.string().min(1).max(200),
});
const saveLogSchema = z.object({
  mrn: z.string().min(1).max(40).transform(s => s.trim().toUpperCase()),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  log: z.record(z.any()),
});
const sendMessageSchema = z.object({
  mrn: z.string().min(1).max(40).transform(s => s.trim().toUpperCase()),
  docId: z.string().min(1).max(64),
  role: z.enum(['doctor', 'patient']),
  text: z.string().min(1).max(5000),
});
const saveAppointmentSchema = z.object({
  mrn: z.string().min(1).max(40).transform(s => s.trim().toUpperCase()),
  appointment: z.record(z.any()),
});
const updateAppointmentSchema = z.object({
  mrn: z.string().min(1).max(40).transform(s => s.trim().toUpperCase()),
  index: z.number().int().min(0),
  status: z.string().min(1).max(50),
});
const saveAvailabilitySchema = z.object({
  docId: z.string().min(1).max(64),
  slots: z.array(z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    slotDuration: z.number().int().min(5).max(120).optional(),
    active: z.boolean().optional(),
  })).max(50),
});

// Doctor: save patient to shared JSON store (authenticated — writes credentials)
syncRouter.post('/save-patient', authenticate, validate(savePatientSchema), asyncHandler(async (req, res) => {
  const { mrn, patient } = req.valid;
  const store = readPatientStore();
  store[mrn] = { ...patient, mrn, _ownerId: req.auth?.subjectId || patient.docId || 'local', _savedAt: new Date().toISOString() };
  const ok = writePatientStore(store);
  if (ok) {
    if (req.auth?.subjectId) {
      await writeAudit({ actorId: req.auth.subjectId, actorRole: 'doctor', action: 'patient_store.save', targetId: mrn, ip: req.ip }).catch(() => {});
    }
    res.json({ ok: true });
  } else {
    res.status(500).json({ error: 'Failed to save patient' });
  }
}));

// Doctor: delete patient from shared JSON store (doctor/admin only)
syncRouter.post('/delete-patient', authenticate, requireRole('doctor', 'admin'), validate(deletePatientSchema), asyncHandler(async (req, res) => {
  const { mrn } = req.valid;
  const store = readPatientStore();
  delete store[mrn];
  writePatientStore(store);
  res.json({ ok: true });
}));

// Patient/Lab login: check shared JSON store (no auth required — this IS the login)
syncRouter.post('/store-login', loginLimiter, validate(storeLoginSchema), asyncHandler(async (req, res) => {
  const { mrn, password } = req.valid;
  const store = readPatientStore();
  const pat = store[mrn];
  if (!pat) return res.status(401).json({ error: 'No patient accounts exist yet. Ask your doctor to create one.' });

  // SECURITY: verify against PBKDF2 hashes only — never plaintext
  let authOk = false;
  if (pat.pass) {
    authOk = verifyUiPassword(password, pat.pass);
  }

  if (!authOk) return res.status(401).json({ error: 'Invalid MRN or password' });

  // Issue a real session (mirrors /patient-login) so authenticated endpoints
  // like /sync/patient and the telehealth routes work for store-based accounts.
  const session = await createSession(res, { subjectId: `${pat.docId || 'store'}::${mrn}`, subjectType: 'kv-patient', role: 'kv-patient' });

  // One-time legacy migration: re-hash any plaintext credential in place and
  // strip passPlain so the plaintext path can never fire twice.
  if (pat.passPlain || !String(pat.pass || '').startsWith('pbkdf2')) {
    try {
      store[mrn] = { ...pat, pass: hashUiPasswordV2(password) };
      delete store[mrn].passPlain;
      writePatientStore(store);
    } catch { /* migration is best-effort; login still succeeds */ }
  }

  // SECURITY: Never return password hashes or plaintext passwords to the client
  const safePatient = { mrn: pat.mrn, name: pat.name, dob: pat.dob, diag: pat.diag, docId: pat.docId };
  res.json({
    ok: true,
    mrn,
    ...(req.headers['x-veltruvia-native'] === '1' ? { token: session.token } : {}),
    patient: safePatient,
    keys: { ['pat_' + mrn]: { v: safePatient } },
  });
}));

// Lab login: check shared JSON store
syncRouter.post('/lab-store-login', loginLimiter, validate(labStoreLoginSchema), asyncHandler(async (req, res) => {
  const { username, password } = req.valid;
  const store = readPatientStore();
  // Search for lab entry by username
  for (const [k, v] of Object.entries(store)) {
    if (k.startsWith('lab_') && v.username === username) {
      // SECURITY: PBKDF2 hash verification only — never plaintext
      let authOk = false;
      if (v.password) authOk = verifyUiPassword(password, v.password);
      if (authOk) {
        // One-time legacy migration: re-hash plaintext credentials in place.
        if (v.passPlain || !String(v.password || '').startsWith('pbkdf2')) {
          try {
            const upgraded = { ...v, password: hashUiPasswordV2(password) };
            delete upgraded.passPlain;
            store[k] = upgraded;
            writePatientStore(store);
          } catch { /* best-effort */ }
        }
        // Session subject must match labScope's ownerId::docId::labId shape —
        // a bare labId here would 401 every later GET/PUT /sync/lab call.
        const session = await createSession(res, { subjectId: `${v.docId}::${v.docId}::${v.labId}`, subjectType: 'kv-lab', role: 'kv-lab' });
        // SECURITY: Never return password hashes or plaintext passwords to the client
        const safeLab = { labId: v.labId, username: v.username, name: v.name, docId: v.docId };
        res.json({ ok: true, lab: safeLab, ...(req.headers['x-veltruvia-native'] === '1' ? { token: session.token } : {}), keys: await collectLabKeys(v.docId, v.docId, v.labId) });
        return;
      }
    }
  }
  res.status(401).json({ error: 'Invalid lab credentials' });
}));

// ═══ Shared Log Store ════════════════════════════════════════════════
const LOG_STORE_PATH = _join(_dirname(process.env.DB_PATH || '.'), 'logs-store.json');
try { _mkdirSync(_dirname(LOG_STORE_PATH), { recursive: true }); } catch {}

function readLogStore() {
  try { if (_existsSync(LOG_STORE_PATH)) return JSON.parse(_readFileSync(LOG_STORE_PATH, 'utf-8')); } catch {}
  return {};
}
function writeLogStore(data) {
  try { _writeFileSync(LOG_STORE_PATH, JSON.stringify(data, null, 2), 'utf-8'); return true; }
  catch (e) { console.error('[log-store] write failed:', e.message); return false; }
}

// Patient: save daily log to shared store
syncRouter.post('/save-log', authenticate, validate(saveLogSchema), asyncHandler(async (req, res) => {
  const { mrn, date, log } = req.valid;
  if (!(await requireMrnAccess(req, res, mrn))) return;
  const store = readLogStore();
  if (!store[mrn]) store[mrn] = {};
  store[mrn][date] = { ...log, savedAt: new Date().toISOString() };
  writeLogStore(store);
  res.json({ ok: true });
}));

// Doctor/Patient: get logs for a patient
syncRouter.get('/get-logs/:mrn', authenticate, asyncHandler(async (req, res) => {
  const { mrn } = req.params;
  if (!mrn) return res.status(400).json({ error: 'mrn required' });
  if (!(await requireMrnAccess(req, res, mrn))) return;
  const store = readLogStore();
  const logs = store[mrn] || {};
  res.json({ ok: true, logs });
}));

// ═══ Shared Message Store ═════════════════════════════════════════════
const MSG_STORE_PATH = _join(_dirname(process.env.DB_PATH || '.'), 'messages-store.json');
try { _mkdirSync(_dirname(MSG_STORE_PATH), { recursive: true }); } catch {}

function readMsgStore() {
  try { if (_existsSync(MSG_STORE_PATH)) return JSON.parse(_readFileSync(MSG_STORE_PATH, 'utf-8')); } catch {}
  return {};
}
function writeMsgStore(data) {
  try { _writeFileSync(MSG_STORE_PATH, JSON.stringify(data, null, 2), 'utf-8'); return true; }
  catch (e) { console.error('[msg-store] write failed:', e.message); return false; }
}

// Send a message (doctor or patient)
syncRouter.post('/send-message', authenticate, validate(sendMessageSchema), asyncHandler(async (req, res) => {
  const { mrn, docId, role, text } = req.valid;
  if (!(await requireMrnAccess(req, res, mrn))) return;
  const store = readMsgStore();
  const key = docId + '_' + mrn;
  if (!store[key]) store[key] = [];
  store[key].push({ role, text, timestamp: Date.now() });
  writeMsgStore(store);
  res.json({ ok: true });
}));

// Get messages for a doctor-patient conversation
syncRouter.get('/get-messages/:docId/:mrn', authenticate, asyncHandler(async (req, res) => {
  const { docId, mrn } = req.params;
  if (!(await requireMrnAccess(req, res, mrn))) return;
  const store = readMsgStore();
  const key = docId + '_' + mrn;
  const msgs = store[key] || [];
  res.json({ ok: true, msgs });
}));

// ═══ Shared Appointments Store ═══════════════════════════════════════
const APPT_STORE_PATH = _join(_dirname(process.env.DB_PATH || '.'), 'appointments-store.json');
try { _mkdirSync(_dirname(APPT_STORE_PATH), { recursive: true }); } catch {}

function readApptStore() {
  try { if (_existsSync(APPT_STORE_PATH)) return JSON.parse(_readFileSync(APPT_STORE_PATH, 'utf-8')); } catch {}
  return {};
}
function writeApptStore(data) {
  try { _writeFileSync(APPT_STORE_PATH, JSON.stringify(data, null, 2), 'utf-8'); return true; }
  catch (e) { console.error('[appt-store] write failed:', e.message); return false; }
}

// Save appointment (doctor or patient)
syncRouter.post('/save-appointment', authenticate, validate(saveAppointmentSchema), asyncHandler(async (req, res) => {
  const { mrn, appointment } = req.valid;
  if (!(await requireMrnAccess(req, res, mrn))) return;
  const store = readApptStore();
  if (!store[mrn]) store[mrn] = [];
  store[mrn].push({ ...appointment, savedAt: new Date().toISOString() });
  writeApptStore(store);
  res.json({ ok: true });
}));

// Update appointment status
syncRouter.post('/update-appointment', authenticate, validate(updateAppointmentSchema), asyncHandler(async (req, res) => {
  const { mrn, index, status } = req.valid;
  if (!(await requireMrnAccess(req, res, mrn))) return;
  const store = readApptStore();
  const appts = store[mrn] || [];
  if (appts[index]) { appts[index].status = status; appts[index].respondedAt = new Date().toISOString(); writeApptStore(store); }
  res.json({ ok: true });
}));

// Get appointments for a patient
syncRouter.get('/get-appointments/:mrn', authenticate, asyncHandler(async (req, res) => {
  const { mrn } = req.params;
  if (!mrn) return res.status(400).json({ error: 'mrn required' });
  if (!(await requireMrnAccess(req, res, mrn))) return;
  const store = readApptStore();
  const appts = store[mrn] || [];
  res.json({ ok: true, appointments: appts });
}));

// ═══ Shared Availability Store ═══════════════════════════════════════
const AVAIL_STORE_PATH = _join(_dirname(process.env.DB_PATH || '.'), 'availability-store.json');
try { _mkdirSync(_dirname(AVAIL_STORE_PATH), { recursive: true }); } catch {}

function readAvailStore() {
  try { if (_existsSync(AVAIL_STORE_PATH)) return JSON.parse(_readFileSync(AVAIL_STORE_PATH, 'utf-8')); } catch {}
  return {};
}
function writeAvailStore(data) {
  try { _writeFileSync(AVAIL_STORE_PATH, JSON.stringify(data, null, 2), 'utf-8'); return true; }
  catch (e) { console.error('[avail-store] write failed:', e.message); return false; }
}

// Save doctor availability (doctor/admin only)
syncRouter.post('/save-availability', authenticate, requireRole('doctor', 'admin'), validate(saveAvailabilitySchema), asyncHandler(async (req, res) => {
  const { docId, slots } = req.valid;
  const store = readAvailStore();
  store[docId] = slots.map(s => ({
    dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime,
    slotDuration: s.slotDuration || 30, active: s.active !== false,
    savedAt: new Date().toISOString()
  }));
  writeAvailStore(store);
  res.json({ ok: true });
}));

// Get doctor availability
syncRouter.get('/get-availability/:docId', asyncHandler(async (req, res) => {
  const { docId } = req.params;
  if (!docId) return res.status(400).json({ error: 'docId required' });
  const store = readAvailStore();
  const slots = store[docId] || [];
  res.json({ ok: true, availability: slots });
}));

// Generate bookable slots for next N days (mirrors scheduling.js logic without auth)
syncRouter.get('/get-slots/:docId', asyncHandler(async (req, res) => {
  const { docId } = req.params;
  const days = parseInt(req.query.days || '30', 10);
  const store = readAvailStore();
  let avail = (store[docId] || []).filter(s => s.active !== false);
  // If no availability for this docId, try all doctors' availability as fallback
  if (!avail.length) {
    for (const [key, entries] of Object.entries(store)) {
      if (key === docId) continue;
      const active = (entries || []).filter(s => s.active !== false);
      if (active.length) { avail = active; break; }
    }
  }
  // If still empty, seed default Mon-Fri 9-12, 14-17 availability so the
  // system works out-of-the-box before the doctor saves a schedule.
  if (!avail.length) {
    avail = [
      { dayOfWeek: 1, startTime: '09:00', endTime: '12:00', slotDuration: 30, active: true },
      { dayOfWeek: 1, startTime: '14:00', endTime: '17:00', slotDuration: 30, active: true },
      { dayOfWeek: 2, startTime: '09:00', endTime: '12:00', slotDuration: 30, active: true },
      { dayOfWeek: 2, startTime: '14:00', endTime: '17:00', slotDuration: 30, active: true },
      { dayOfWeek: 3, startTime: '09:00', endTime: '12:00', slotDuration: 30, active: true },
      { dayOfWeek: 4, startTime: '09:00', endTime: '12:00', slotDuration: 30, active: true },
      { dayOfWeek: 4, startTime: '14:00', endTime: '17:00', slotDuration: 30, active: true },
      { dayOfWeek: 5, startTime: '09:00', endTime: '12:00', slotDuration: 30, active: true },
      { dayOfWeek: 5, startTime: '14:00', endTime: '17:00', slotDuration: 30, active: true },
    ];
  }
  if (!avail.length) return res.json({ ok: true, slots: {} });
  // Also check existing appointments from appointment store
  const apptStore = readApptStore();
  const existingAppts = [];
  Object.values(apptStore).forEach(appts => {
    if (!Array.isArray(appts)) return;
    appts.forEach(a => {
      if (a.date && a.status !== 'Declined') existingAppts.push(a);
    });
  });
  const today = new Date();
  const slotsByDate = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayOfWeek = d.getDay();
    const daySlots = [];
    avail.filter(r => r.dayOfWeek === dayOfWeek).forEach(r => {
      const [sh, sm] = (r.startTime || '09:00').split(':').map(Number);
      const [eh, em] = (r.endTime || '17:00').split(':').map(Number);
      const dur = r.slotDuration || 30;
      let mins = sh * 60 + sm;
      const endMins = eh * 60 + em;
      while (mins + dur <= endMins) {
        const h = String(Math.floor(mins / 60)).padStart(2, '0');
        const m = String(mins % 60).padStart(2, '0');
        const timeStr = h + ':' + m;
        const endMins2 = mins + dur;
        const eh2 = String(Math.floor(endMins2 / 60)).padStart(2, '0');
        const em2 = String(endMins2 % 60).padStart(2, '0');
        const endTimeStr = eh2 + ':' + em2;
        // Check conflict
        const taken = existingAppts.some(e => e.date === dateStr && e.time === timeStr);
        if (!taken) daySlots.push({ time: timeStr, endTime: endTimeStr });
        mins += dur;
      }
    });
    if (daySlots.length) slotsByDate[dateStr] = daySlots;
  }
  res.json({ ok: true, slots: slotsByDate });
}));

// Generate bookable slots from ANY doctor (used when patient _docId is null)
syncRouter.get('/get-slots-all', asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days || '30', 10);
  const store = readAvailStore();
  // Collect all active availability entries from all doctors
  let avail = [];
  for (const entries of Object.values(store)) {
    const active = (entries || []).filter(s => s.active !== false);
    if (active.length) { avail = active; break; }
  }
  // Seed defaults if nothing configured at all
  if (!avail.length) {
    avail = [
      { dayOfWeek: 1, startTime: '09:00', endTime: '12:00', slotDuration: 30, active: true },
      { dayOfWeek: 1, startTime: '14:00', endTime: '17:00', slotDuration: 30, active: true },
      { dayOfWeek: 2, startTime: '09:00', endTime: '12:00', slotDuration: 30, active: true },
      { dayOfWeek: 2, startTime: '14:00', endTime: '17:00', slotDuration: 30, active: true },
      { dayOfWeek: 3, startTime: '09:00', endTime: '12:00', slotDuration: 30, active: true },
      { dayOfWeek: 4, startTime: '09:00', endTime: '12:00', slotDuration: 30, active: true },
      { dayOfWeek: 4, startTime: '14:00', endTime: '17:00', slotDuration: 30, active: true },
      { dayOfWeek: 5, startTime: '09:00', endTime: '12:00', slotDuration: 30, active: true },
      { dayOfWeek: 5, startTime: '14:00', endTime: '17:00', slotDuration: 30, active: true },
    ];
  }
  const apptStore = readApptStore();
  const existingAppts = [];
  Object.values(apptStore).forEach(appts => {
    if (!Array.isArray(appts)) return;
    appts.forEach(a => { if (a.date && a.status !== 'Declined') existingAppts.push(a); });
  });
  const today = new Date();
  const slotsByDate = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayOfWeek = d.getDay();
    const daySlots = [];
    avail.filter(r => r.dayOfWeek === dayOfWeek).forEach(r => {
      const [sh, sm] = (r.startTime || '09:00').split(':').map(Number);
      const [eh, em] = (r.endTime || '17:00').split(':').map(Number);
      const dur = r.slotDuration || 30;
      let mins = sh * 60 + sm;
      const endMins = eh * 60 + em;
      while (mins + dur <= endMins) {
        const h = String(Math.floor(mins / 60)).padStart(2, '0');
        const m = String(mins % 60).padStart(2, '0');
        const timeStr = h + ':' + m;
        const endMins2 = mins + dur;
        const eh2 = String(Math.floor(endMins2 / 60)).padStart(2, '0');
        const em2 = String(endMins2 % 60).padStart(2, '0');
        const endTimeStr = eh2 + ':' + em2;
        const taken = existingAppts.some(e => e.date === dateStr && e.time === timeStr);
        if (!taken) daySlots.push({ time: timeStr, endTime: endTimeStr });
        mins += dur;
      }
    });
    if (daySlots.length) slotsByDate[dateStr] = daySlots;
  }
  res.json({ ok: true, slots: slotsByDate });
}));

// ═══ Shared Telehealth (Video Calls) ════════════════════════════════
// File-based stores (shared across all desktop apps on same machine)
const TH_ROOM_PATH = _join(_dirname(process.env.DB_PATH || '.'), 'telehealth-rooms.json');
const TH_SIGNAL_PATH = _join(_dirname(process.env.DB_PATH || '.'), 'telehealth-signals.json');
try { _mkdirSync(_dirname(TH_ROOM_PATH), { recursive: true }); } catch {}
function readThRooms() { try { if (_existsSync(TH_ROOM_PATH)) return JSON.parse(_readFileSync(TH_ROOM_PATH, 'utf-8')); } catch {} return {}; }
function writeThRooms(d) { try { _writeFileSync(TH_ROOM_PATH, JSON.stringify(d, null, 2), 'utf-8'); } catch {} }
function readThSignals() { try { if (_existsSync(TH_SIGNAL_PATH)) return JSON.parse(_readFileSync(TH_SIGNAL_PATH, 'utf-8')); } catch {} return {}; }
function writeThSignals(d) { try { _writeFileSync(TH_SIGNAL_PATH, JSON.stringify(d, null, 2), 'utf-8'); } catch {} }

function genRoomCode() {
  // Crypto-random: 6 chars from a 32-char unambiguous alphabet (uniform — 256 % 32 == 0).
  // Math.random made codes predictable, and the code is the room's join credential.
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) code += c[bytes[i] % c.length];
  return code;
}

// ── Telehealth Zod schemas ──
const thCreateRoomSchema = z.object({
  patientMrn: z.string().min(1).max(40).transform(s => s.trim().toUpperCase()),
  doctorId: z.string().max(64).optional(),
});
const thEndRoomSchema = z.object({
  roomCode: z.string().min(4).max(10),
});
const thJoinRoomSchema = z.object({
  roomCode: z.string().min(4).max(10),
});
const thSignalSchema = z.object({
  roomCode: z.string().min(4).max(10),
  type: z.enum(['offer', 'answer', 'candidate', 'join', 'leave', 'chat']),
  data: z.any(),
  sender: z.string().max(64).optional(),
});

// Doctor: create a video room
syncRouter.post('/th/create-room', authenticate, requireRole('doctor', 'admin'), validate(thCreateRoomSchema), asyncHandler(async (req, res) => {
  const { patientMrn, doctorId } = req.valid;
  const roomCode = genRoomCode();
  const rooms = readThRooms();
  rooms[roomCode] = { doctorId: doctorId || 'unknown', patientMrn, status: 'waiting', createdAt: Date.now() };
  writeThRooms(rooms);
  res.json({ ok: true, roomCode, status: 'waiting' });
}));

// Doctor: list active rooms
syncRouter.get('/th/rooms/:doctorId', authenticate, requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  const { doctorId } = req.params;
  const rooms = readThRooms();
  const result = [];
  for (const [code, room] of Object.entries(rooms)) {
    if (room.doctorId === doctorId && room.status !== 'ended') result.push({ id: code, ...room });
  }
  res.json({ ok: true, rooms: result });
}));

// Doctor: end a room
syncRouter.post('/th/end-room', authenticate, requireRole('doctor', 'admin'), validate(thEndRoomSchema), asyncHandler(async (req, res) => {
  const { roomCode } = req.valid;
  const rooms = readThRooms();
  if (rooms[roomCode]) rooms[roomCode].status = 'ended';
  writeThRooms(rooms);
  const signals = readThSignals();
  delete signals[roomCode];
  writeThSignals(signals);
  res.json({ ok: true });
}));

// Patient: check for available rooms (session patient must match :mrn)
syncRouter.get('/th/my-rooms/:doctorId/:mrn', authenticate, requireRole('kv-patient'), patientScope, asyncHandler(async (req, res) => {
  const { doctorId, mrn } = req.params;
  if (req.patientScope.mrn !== mrn) return res.status(403).json({ error: 'Not your patient record' });
  const rooms = readThRooms();
  const result = [];
  for (const [code, room] of Object.entries(rooms)) {
    if (room.doctorId === doctorId && room.patientMrn === mrn && room.status !== 'ended') result.push({ id: code, ...room });
  }
  res.json({ ok: true, rooms: result });
}));

// Patient: join a room (only the room's own patient may join)
syncRouter.post('/th/join-room', authenticate, requireRole('kv-patient'), patientScope, validate(thJoinRoomSchema), asyncHandler(async (req, res) => {
  const { roomCode } = req.valid;
  const rooms = readThRooms();
  if (!rooms[roomCode] || rooms[roomCode].status === 'ended') return res.status(404).json({ error: 'Room not found' });
  if (rooms[roomCode].patientMrn !== req.patientScope.mrn) return res.status(403).json({ error: 'Not your video room' });
  rooms[roomCode].status = 'active';
  writeThRooms(rooms);
  res.json({ ok: true, roomCode, status: 'active' });
}));

// ── Waiting-room queue (v2.3) ───────────────────────────────────────
// A patient "sits" in the waiting room by joining without marking the
// session active; the doctor sees arrival order + wait times and admits.
const QUEUE_REVERSE = { active: 'waiting', waiting: 'active' };

syncRouter.post('/th/queue/join', authenticate, validate(thJoinRoomSchema), asyncHandler(async (req, res) => {
  const { roomCode } = req.valid;
  const rooms = readThRooms();
  const room = rooms[roomCode];
  if (!room || room.status === 'ended') return res.status(404).json({ error: 'Room not found' });
  // Only the room's own patient (by subjectId suffix) or a kv-patient scoped
  // to the room's MRN may queue.
  const sid = String(req.auth?.subjectId || '');
  if (req.auth?.role === 'kv-patient' && room.patientMrn !== sid.split('::').pop()) {
    return res.status(403).json({ error: 'Not your video room' });
  }
  if (room.status === 'waiting') {
    room.joinedAt = room.joinedAt || Date.now();
    writeThRooms(rooms);
  }
  res.json({ ok: true, roomCode, status: room.status, position: 'waiting-room' });
}));

syncRouter.post('/th/queue/leave', authenticate, validate(thJoinRoomSchema), asyncHandler(async (req, res) => {
  const { roomCode } = req.valid;
  const rooms = readThRooms();
  const room = rooms[roomCode];
  if (!room) return res.status(404).json({ error: 'Room not found' });
  const sid = String(req.auth?.subjectId || '');
  if (req.auth?.role === 'kv-patient' && room.patientMrn !== sid.split('::').pop()) {
    return res.status(403).json({ error: 'Not your video room' });
  }
  if (room.status === 'waiting') delete room.joinedAt;
  writeThRooms(rooms);
  res.json({ ok: true });
}));

// Doctor: waiting-room list (arrival order) + admit the next patient
syncRouter.get('/th/queue/:doctorId', authenticate, requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  const { doctorId } = req.params;
  const rooms = readThRooms();
  const now = Date.now();
  const waiting = Object.entries(rooms)
    .filter(([, r]) => r.doctorId === doctorId && r.status === 'waiting' && r.joinedAt)
    .sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0))
    .map(([code, r], i) => ({
      roomCode: code,
      patientMrn: r.patientMrn,
      position: i + 1,
      waitedMinutes: Math.max(0, Math.round((now - (r.joinedAt || now)) / 60000)),
      createdAt: r.createdAt,
    }));
  res.json({ ok: true, waiting });
}));

syncRouter.post('/th/queue/admit', authenticate, requireRole('doctor', 'admin'), validate(thJoinRoomSchema), asyncHandler(async (req, res) => {
  const { roomCode } = req.valid;
  const rooms = readThRooms();
  const room = rooms[roomCode];
  if (!room || room.status === 'ended') return res.status(404).json({ error: 'Room not found' });
  if (room.doctorId !== req.auth.subjectId) return res.status(403).json({ error: 'Not your video room' });
  room.status = 'active';
  delete room.joinedAt;
  room.admittedAt = Date.now();
  writeThRooms(rooms);
  writeAudit({ actorId: req.auth.subjectId, actorRole: 'doctor', action: 'telehealth.queue_admit', targetId: roomCode, ip: req.ip }).catch(() => {});
  // Tell the patient they're being brought in
  notifySubject(`${req.auth.subjectId}::${room.patientMrn}`, {
    title: '📹 Your doctor is ready',
    body: 'You are being brought into the video consultation now.',
    url: '/patient.html',
  }).catch(() => {});
  res.json({ ok: true, roomCode, status: 'active' });
}));

// WebRTC Signaling: post a message (must be the room's doctor or its patient)
syncRouter.post('/th/signal', authenticate, validate(thSignalSchema), asyncHandler(async (req, res) => {
  const { roomCode, type, data, sender } = req.valid;
  const rooms = readThRooms();
  const room = rooms[roomCode];
  if (!room || room.status === 'ended') return res.status(404).json({ error: 'Room not found' });
  if (req.auth.role === 'kv-patient') {
    if (room.patientMrn !== String(req.auth.subjectId).split('::')[1]) {
      return res.status(403).json({ error: 'Not your video room' });
    }
  } else if (!['doctor', 'admin'].includes(req.auth.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const signals = readThSignals();
  if (!signals[roomCode]) signals[roomCode] = [];
  signals[roomCode].push({ type, data, sender: sender || 'unknown', timestamp: Date.now() });
  if (signals[roomCode].length > 200) signals[roomCode] = signals[roomCode].slice(-200);
  writeThSignals(signals);
  res.json({ ok: true });
}));

// WebRTC Signaling: poll for messages
// WebRTC Signaling: long-poll (must be the room's doctor or its patient)
syncRouter.get('/th/signal/:roomCode', authenticate, asyncHandler(async (req, res) => {
  const { roomCode } = req.params;
  const rooms = readThRooms();
  const room = rooms[roomCode];
  if (!room || room.status === 'ended') return res.status(404).json({ error: 'Room not found' });
  if (req.auth.role === 'kv-patient') {
    if (room.patientMrn !== String(req.auth.subjectId).split('::')[1]) {
      return res.status(403).json({ error: 'Not your video room' });
    }
  } else if (!['doctor', 'admin'].includes(req.auth.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const since = parseInt(req.query.since || '0', 10);
  const timeout = Math.min(parseInt(req.query.timeout || '10000', 10), 15000);
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const signals = readThSignals();
    const store = signals[roomCode] || [];
    const newMsgs = store.filter(m => m.timestamp > since);
    if (newMsgs.length > 0) return res.json({ ok: true, messages: newMsgs });
    await new Promise(r => setTimeout(r, 500));
  }
  res.json({ ok: true, messages: [] });
}));
