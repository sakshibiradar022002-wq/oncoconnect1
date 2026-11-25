// Doctor account registration and login. Patient and lab logins live in
// routes/sync.js — they authenticate against the synced records.

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { db, writeAudit } from '../db/index.js';
import {
  hashPassword, verifyPassword, encryptPHI, decryptPHI, randomToken,
  generateTotpSecret, verifyTotp, verifyTotpCounter,
} from '../crypto.js';
import {
  createSession, revokeSession, clearSessionCookie, authenticate, requireRole,
} from '../middleware/auth.js';
import { validate, asyncHandler } from '../middleware/validate.js';
import { config } from '../config.js';
import { verifyRegistrationToken } from './email-otp.js';

export const authRouter = Router();

// ── Brute-force lockout (DB-backed, survives restarts) ──────────
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const WINDOW_MS = 15 * 60 * 1000;

async function recordFailedLogin(identifier) {
  const now = new Date().toISOString();
  const entry = await db.prepare('SELECT * FROM login_attempts WHERE identifier = ?').get(identifier);
  
  if (!entry || (Date.now() - new Date(entry.first_attempt).getTime()) > WINDOW_MS) {
    // Fresh window or expired — reset
    await db.prepare(`
      INSERT INTO login_attempts (identifier, count, first_attempt, locked_until)
      VALUES (?, 1, ?, NULL)
      ON CONFLICT(identifier) DO UPDATE SET count = 1, first_attempt = excluded.first_attempt, locked_until = NULL
    `).run(identifier, now);
    return { count: 1, lockedUntil: 0 };
  }
  
  const newCount = entry.count + 1;
  let lockedUntil = entry.locked_until;
  if (newCount >= MAX_ATTEMPTS) {
    lockedUntil = new Date(Date.now() + LOCKOUT_MS).toISOString();
  }
  await db.prepare('UPDATE login_attempts SET count = ?, locked_until = ? WHERE identifier = ?')
    .run(newCount, lockedUntil, identifier);
  return { count: newCount, lockedUntil: lockedUntil ? new Date(lockedUntil).getTime() : 0 };
}

async function isLockedOut(identifier) {
  const entry = await db.prepare('SELECT * FROM login_attempts WHERE identifier = ?').get(identifier);
  if (!entry) return false;
  if (entry.locked_until && new Date(entry.locked_until).getTime() > Date.now()) return true;
  if (entry.locked_until && new Date(entry.locked_until).getTime() <= Date.now()) {
    await db.prepare('DELETE FROM login_attempts WHERE identifier = ?').run(identifier);
  }
  return false;
}

async function clearLoginAttempts(identifier) {
  await db.prepare('DELETE FROM login_attempts WHERE identifier = ?').run(identifier);
}

// ── Doctor registration ───────────────────────────────────────────
const registerSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().toLowerCase(),
  // Password policy: ≥10 chars with at least one letter and one digit.
  password: z.string().min(10).max(200)
    .refine(p => /[A-Za-z]/.test(p) && /\d/.test(p),
      { message: 'Password must be at least 10 characters and include a letter and a number' }),
  specialty: z.string().max(120).optional(),
  institution: z.string().max(200).optional(),
  emailVerificationToken: z.string().min(1), // required: proves email was verified
});

authRouter.post('/register', validate(registerSchema), asyncHandler(async (req, res) => {
  const { name, email, password, specialty, institution, emailVerificationToken } = req.valid;

  // Verify the email OTP token (one-time use, deleted on success)
  // Skip in Electron desktop mode for easier local registration
  if (!process.env.ELECTRON_RUN && !verifyRegistrationToken(email, emailVerificationToken)) {
    return res.status(400).json({ error: 'Email verification required. Please verify your email first.', code: 'EMAIL_NOT_VERIFIED' });
  }

  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'An account already exists for this email' });

  // With REQUIRE_DOCTOR_APPROVAL=true, new accounts start inactive until an
  // admin flips users.active to 1. The very first account is always approved
  // so the instance owner can't lock themselves out.
  let active = 1;
  if (config.requireDoctorApproval) {
    const anyUser = await db.prepare('SELECT id FROM users LIMIT 1').get();
    if (anyUser) active = 0;
  }

  const id = randomToken(16);
  await db.prepare(`
    INSERT INTO users (id, email, password_hash, role, name_enc, meta_enc, active, created_at)
    VALUES (?, ?, ?, 'doctor', ?, ?, ?, ?)
  `).run(
    id, email, hashPassword(password),
    encryptPHI(name), encryptPHI({ specialty, institution }),
    active, new Date().toISOString()
  );

  await writeAudit({ actorId: id, actorRole: 'doctor', action: 'doctor.register', targetId: id, ip: req.ip });
  res.status(201).json({
    ok: true,
    message: active ? 'Account created. You can now sign in.' : 'Account created. An administrator must approve it before you can sign in.',
  });
}));

// ── Doctor / admin / lab login (by email) ─────────────────────────
const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
  totpCode: z.string().optional(),
});

authRouter.post('/login', validate(loginSchema), asyncHandler(async (req, res) => {
  const { email, password, totpCode } = req.valid;

  // Check brute-force lockout (DB-backed)
  if (await isLockedOut('auth:' + email)) {
    return res.status(429).json({ error: 'Too many failed attempts. Please try again in 15 minutes.' });
  }

  // Check if account exists (even if inactive) for better error messages
  const existingUser = await db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  const user = await db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(email);

  // Constant-ish behaviour whether or not the user exists.
  const ok = user && verifyPassword(password, user.password_hash);
  if (!ok) {
    // Show specific error for inactive accounts
    if (existingUser && !existingUser.active) {
      return res.status(403).json({ error: 'Account pending admin approval. Please contact your administrator.' });
    }
    const entry = await recordFailedLogin('auth:' + email);
    const remaining = MAX_ATTEMPTS - entry.count;
    const msg = remaining > 0
      ? `Invalid email or password. ${remaining} attempt(s) remaining before lockout.`
      : 'Invalid email or password. Account locked for 15 minutes.';
    await writeAudit({ actorId: email, actorRole: 'unknown', action: 'user.login_failed', targetId: email, detail: { remaining: Math.max(0, remaining) }, ip: req.ip });
    return res.status(401).json({ error: msg });
  }

  // Successful login — clear lockout
  await clearLoginAttempts('auth:' + email);

  // Second factor, if the account has enabled it.
  const totp = decryptPHI(user.totp_enc);
  if (totp?.enabled) {
    if (!totpCode) return res.status(401).json({ error: 'TOTP code required', totpRequired: true });
    const counter = verifyTotpCounter(totp.secret, totpCode);
    if (counter === null) {
      await clearLoginAttempts('auth:' + email); // Valid password but wrong TOTP — don't count as brute force
      return res.status(401).json({ error: 'Invalid TOTP code', totpRequired: true });
    }
    // A code is single-use: remember the time step it was accepted for and
    // refuse anything at or below it, so a code observed once cannot be
    // replayed inside the ±1-step drift window (~90 s).
    const lastCounter = Number(user.totp_last_counter) || 0;
    // The conditional UPDATE is the claim: two simultaneous logins cannot
    // both spend the same code.
    const claim = counter > lastCounter
      ? await db.prepare('UPDATE users SET totp_last_counter = ? WHERE id = ? AND (totp_last_counter IS NULL OR totp_last_counter < ?)')
        .run(counter, user.id, counter)
      : null;
    if (!claim || !claim.changes) {
      await clearLoginAttempts('auth:' + email);
      await writeAudit({ actorId: user.id, actorRole: user.role, action: 'user.login_totp_replay', targetId: user.id, detail: { counter, lastCounter }, ip: req.ip });
      return res.status(401).json({ error: 'Invalid TOTP code', totpRequired: true });
    }
  }

  await db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(new Date().toISOString(), user.id);
  const session = await createSession(res, { subjectId: user.id, subjectType: 'user', role: user.role });
  await writeAudit({ actorId: user.id, actorRole: user.role, action: 'user.login', targetId: user.id, ip: req.ip });

  res.json({
    ok: true,
    // Bearer token ONLY for native clients (mobile APKs) that don't persist
    // cookies — keeps browser responses free of exfiltratable credentials.
    ...(req.headers['x-veltruvia-native'] === '1' ? { token: session.token } : {}),
    user: {
      id: user.id, email: user.email, role: user.role,
      name: decryptPHI(user.name_enc),
      meta: decryptPHI(user.meta_enc),
      labId: user.lab_id,
    },
  });
}));

// ── Two-factor auth (TOTP, RFC 6238) for doctor/admin accounts ────
// Setup: returns a fresh secret + otpauth:// URL for the authenticator app.
// The account password is required again: a session cookie alone must not be
// able to bind an attacker-controlled authenticator (PENTEST-SCOPE §4 flow 6).
const totpSetupSchema = z.object({
  password: z.string().min(1),
  // Explicit opt-in to replace a pending (unenabled) secret.
  restart: z.boolean().optional().default(false),
});
authRouter.post('/totp/setup', authenticate, validate(totpSetupSchema), asyncHandler(async (req, res) => {
  if (req.auth.subjectType !== 'user') return res.status(403).json({ error: 'Accounts only' });
  const u = await db.prepare('SELECT email, password_hash, totp_enc FROM users WHERE id = ?').get(req.auth.subjectId);
  if (!u) return res.status(404).json({ error: 'Not found' });
  if (!verifyPassword(req.valid.password, u.password_hash)) {
    await writeAudit({ actorId: req.auth.subjectId, actorRole: req.auth.role, action: 'totp.setup_refused', targetId: req.auth.subjectId, ip: req.ip });
    return res.status(401).json({ error: 'Password incorrect' });
  }
  const existing = decryptPHI(u.totp_enc);
  if (existing?.enabled) return res.status(409).json({ error: '2FA already enabled' });
  // A pending secret is not silently replaced: a second setup would otherwise
  // swap the secret out from under whoever is mid-enrolment. Ask for restart.
  if (existing?.secret && !req.valid.restart) {
    return res.status(409).json({
      error: 'An enrolment is already pending. Finish it, or retry with restart:true to replace the pending secret.',
      pending: true,
    });
  }

  const secret = generateTotpSecret();
  // A new secret starts a new counter sequence, so clear the last accepted step.
  await db.prepare('UPDATE users SET totp_enc = ?, totp_last_counter = NULL WHERE id = ?')
    .run(encryptPHI({ secret, enabled: false }), req.auth.subjectId);
  await writeAudit({ actorId: req.auth.subjectId, actorRole: req.auth.role, action: 'totp.setup', targetId: req.auth.subjectId, detail: { restart: !!req.valid.restart }, ip: req.ip });
  res.json({
    ok: true, secret,
    otpauthUrl: `otpauth://totp/VELTRUVIA:${encodeURIComponent(u.email)}?secret=${secret}&issuer=VELTRUVIA`,
  });
}));

// Enable: prove possession of the authenticator by echoing a valid code.
const totpCodeSchema = z.object({ code: z.string().min(6).max(6) });
authRouter.post('/totp/enable', authenticate, validate(totpCodeSchema), asyncHandler(async (req, res) => {
  if (req.auth.subjectType !== 'user') return res.status(403).json({ error: 'Accounts only' });
  const u = await db.prepare('SELECT totp_enc FROM users WHERE id = ?').get(req.auth.subjectId);
  const totp = decryptPHI(u?.totp_enc);
  if (!totp?.secret) return res.status(400).json({ error: 'Run /totp/setup first' });
  // Store the step this enrolment code belongs to: it is spent here and
  // cannot be reused for a login in the same window.
  const enrolCounter = verifyTotpCounter(totp.secret, req.valid.code);
  if (enrolCounter === null) return res.status(401).json({ error: 'Invalid code' });

  await db.prepare('UPDATE users SET totp_enc = ?, totp_last_counter = ? WHERE id = ?')
    .run(encryptPHI({ secret: totp.secret, enabled: true }), enrolCounter, req.auth.subjectId);
  await writeAudit({ actorId: req.auth.subjectId, actorRole: req.auth.role, action: 'totp.enable', targetId: req.auth.subjectId, ip: req.ip });
  res.json({ ok: true, message: '2FA enabled. Codes will be required at login.' });
}));

// Disable (requires a valid current code).
authRouter.post('/totp/disable', authenticate, validate(totpCodeSchema), asyncHandler(async (req, res) => {
  if (req.auth.subjectType !== 'user') return res.status(403).json({ error: 'Accounts only' });
  const u = await db.prepare('SELECT totp_enc FROM users WHERE id = ?').get(req.auth.subjectId);
  const totp = decryptPHI(u?.totp_enc);
  if (!totp?.enabled) return res.status(400).json({ error: '2FA not enabled' });
  if (!verifyTotp(totp.secret, req.valid.code)) return res.status(401).json({ error: 'Invalid code' });

  await db.prepare('UPDATE users SET totp_enc = NULL, totp_last_counter = NULL WHERE id = ?').run(req.auth.subjectId);
  await writeAudit({ actorId: req.auth.subjectId, actorRole: req.auth.role, action: 'totp.disable', targetId: req.auth.subjectId, ip: req.ip });
  res.json({ ok: true });
}));

// ── Logout: revoke the session server-side, not just client-side ──
authRouter.post('/logout', authenticate, asyncHandler(async (req, res) => {
  await revokeSession(req.auth.jti);
  clearSessionCookie(res);
  await writeAudit({ actorId: req.auth.subjectId, actorRole: req.auth.role, action: 'user.logout', ip: req.ip });
  res.json({ ok: true });
}));

// ── Search patients by MRN or name (for doctors) ──────────────────
authRouter.get('/search-patients', authenticate, requireRole('doctor', 'admin'),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q || q.length < 1) return res.json({ ok: true, patients: [] });

    // Search in kv_store for patient records
    const rows = await db.prepare(
      `SELECT DISTINCT owner_id, k, v_enc FROM kv_store
       WHERE k LIKE 'pat_%' AND k NOT LIKE '%::appts_%'`
    ).all();

    const patients = [];
    for (const row of rows) {
      const data = decryptPHI(row.v_enc);
      if (!data) continue;
      const mrn = data.mrn || row.owner_id.split('::')[1] || '';
      const name = data.name || '';
      const diag = data.diag || data.diagnosis || '';
      const lowerQ = q.toLowerCase();
      if (
        mrn.toLowerCase().includes(lowerQ) ||
        name.toLowerCase().includes(lowerQ)
      ) {
        patients.push({ mrn, name, diag });
      }
    }

    // Also search the patients table if it exists
    try {
      const dbPatients = await db.prepare(
        `SELECT mrn, name, diagnosis FROM patients WHERE mrn LIKE ? OR name LIKE ? LIMIT 10`
      ).all(`%${q}%`, `%${q}%`);
      const seenM = new Set(patients.map(p => p.mrn));
      for (const p of dbPatients) {
        if (!seenM.has(p.mrn)) {
          patients.push({ mrn: p.mrn, name: p.name, diag: p.diagnosis || '' });
          seenM.add(p.mrn);
        }
      }
    } catch (_) { /* patients table may not exist */ }

    res.json({ ok: true, patients: patients.slice(0, 20) });
  })
);

// ── Self-service doctor password recovery ─────────────────────────
// Single-use, 15-minute reset token emailed to the account's address.
// Uniform response — never reveals whether an email is registered.
const recoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many recovery attempts. Try again in 15 minutes.' },
});
const doctorRecoverySchema = z.object({
  email: z.string().email().toLowerCase(),
  newPassword: z.string().min(10).max(200)
    .refine(p => /[A-Za-z]/.test(p) && /\d/.test(p),
      { message: 'Password must be at least 10 characters and include a letter and a number' })
    .optional(),
  token: z.string().min(10).max(200).optional(),
});

authRouter.post('/forgot-password', recoveryLimiter, validate(doctorRecoverySchema), asyncHandler(async (req, res) => {
  const { email } = req.valid;
  const { mailConfigured, sendMail } = await import('../mail.js');
  const user = await db.prepare('SELECT id FROM users WHERE email = ? AND active = 1').get(email);
  if (user && mailConfigured()) {
    const token = randomToken(24);
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await db.prepare(`
      INSERT INTO password_resets (email, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET token_hash = excluded.token_hash, expires_at = excluded.expires_at, created_at = excluded.created_at
    `).run(email, tokenHash, expires, new Date().toISOString());
    try {
      await sendMail({
        to: email,
        subject: 'VELTRUVIA — password reset code',
        text: `Your VELTRUVIA password reset code is:\n\n${token}\n\nIt expires in 15 minutes. If you did not request this, ignore this email.`,
      });
    } catch { /* uniform response regardless */ }
  }
  res.json({
    ok: true,
    message: mailConfigured()
      ? 'If the account exists, a reset code has been sent.'
      : 'Email is not configured on this server — ask your administrator to reset your password.',
  });
}));

authRouter.post('/reset-password', recoveryLimiter, validate(doctorRecoverySchema), asyncHandler(async (req, res) => {
  const { email, newPassword, token } = req.valid;
  if (!token) return res.status(400).json({ error: 'Reset code is required.' });
  if (!newPassword) return res.status(400).json({ error: 'New password is required.' });
  const row = await db.prepare('SELECT * FROM password_resets WHERE email = ?').get(email);
  const fail = () => res.status(400).json({ error: 'Invalid or expired reset code.' });
  if (!row) return fail();
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.prepare('DELETE FROM password_resets WHERE email = ?').run(email);
    return fail();
  }
  const hash = createHash('sha256').update(token).digest('hex');
  if (hash !== row.token_hash) return fail();

  const user = await db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(email);
  if (!user) return fail();
  await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), user.id);
  await db.prepare('DELETE FROM password_resets WHERE email = ?').run(email);
  await db.prepare('UPDATE sessions SET revoked = 1 WHERE subject_id = ? AND revoked = 0').run(user.id);
  await clearLoginAttempts('auth:' + email);
  await writeAudit({ actorId: user.id, actorRole: 'doctor', action: 'doctor.self_password_reset', targetId: user.id, ip: req.ip });
  res.json({ ok: true, message: 'Password updated. Sign in with your new password.' });
}));
