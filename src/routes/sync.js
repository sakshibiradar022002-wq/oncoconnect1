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
import { db, writeAudit } from '../db/index.js';
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

// ── Brute-force lockout for patient/lab logins ──
const _kvLoginAttempts = new Map();
const KV_MAX_ATTEMPTS = 8;
const KV_LOCKOUT_MS = 15 * 60 * 1000;
const KV_WINDOW_MS = 15 * 60 * 1000;

function kvRecordFailed(key) {
  const now = Date.now();
  let entry = _kvLoginAttempts.get(key);
  if (!entry || (now - entry.firstAttempt) > KV_WINDOW_MS) {
    entry = { count: 1, firstAttempt: now, lockedUntil: 0 };
  } else {
    entry.count++;
    if (entry.count >= KV_MAX_ATTEMPTS) entry.lockedUntil = now + KV_LOCKOUT_MS;
  }
  _kvLoginAttempts.set(key, entry);
  return entry;
}
function kvIsLocked(key) {
  const entry = _kvLoginAttempts.get(key);
  if (!entry) return false;
  if (entry.lockedUntil && Date.now() < entry.lockedUntil) return true;
  if (entry.lockedUntil) _kvLoginAttempts.delete(key);
  return false;
}
function kvClear(key) { _kvLoginAttempts.delete(key); }

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
    if (rec && (verifyUiPassword(password, rec.pass) || verifyUiPassword(password, rec.passPlain))) {
      ownerId = r.owner_id;
      await upgradeStoredPassword(ownerId, 'pat_' + mrn, rec, password, 'pass');
      break;
    }
  }
  if (!ownerId) {
    const entry = kvRecordFailed('pat:' + mrn);
    const remaining = KV_MAX_ATTEMPTS - entry.count;
    return res.status(401).json({ error: 'Invalid MRN or password' });
  }
  kvClear('pat:' + mrn);

  // Session subject encodes which doctor's keyspace this patient lives in.
  await createSession(res, { subjectId: `${ownerId}::${mrn}`, subjectType: 'kv-patient', role: 'kv-patient' });
  await writeAudit({ actorId: mrn, actorRole: 'kv-patient', action: 'sync.patient_login', targetId: ownerId, ip: req.ip });

  res.json({ ok: true, mrn, keys: await collectPatientKeys(ownerId, mrn) });
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
    kvRecordFailed('lab:' + username);
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  kvClear('lab:' + username);

  const { ownerId, rec } = found;
  await createSession(res, {
    subjectId: `${ownerId}::${rec.docId}::${rec.labId}`,
    subjectType: 'kv-lab',
    role: 'kv-lab',
  });
  await writeAudit({ actorId: rec.labId, actorRole: 'kv-lab', action: 'sync.lab_login', targetId: ownerId, ip: req.ip });

  res.json({ ok: true, labId: rec.labId, keys: await collectLabKeys(ownerId, rec.docId, rec.labId) });
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
