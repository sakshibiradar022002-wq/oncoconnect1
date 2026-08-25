// ═══════════════════════════════════════════════════════════════════════
// EMAIL OTP — Registration Verification
// ═══════════════════════════════════════════════════════════════════════
// Sends a 6-digit OTP to the registrant's email. The OTP must be
// verified before the account is created. In dev mode (no email
// configured), the OTP is returned in the response so it shows on screen.

import { Router } from 'express';
import { z } from 'zod';
import { randomInt, createHash } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { db, writeAudit } from '../db/index.js';
import { sendMail, mailConfigured } from '../mail.js';
import { validate, asyncHandler } from '../middleware/validate.js';
import { randomToken } from '../crypto.js';

export const emailOtpRouter = Router();

// In-memory OTP store (with TTL). On Vercel serverless each instance has
// its own store, but OTPs are short-lived so this is fine.
const otpStore = new Map(); // key: email, value: { hash, expiresAt, attempts, purpose }
const OTP_TTL_MS = 10 * 60 * 1000;  // 10 minutes
const OTP_MAX_ATTEMPTS = 5;
const OTP_LENGTH = 6;

// Cleanup expired OTPs every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of otpStore) {
    if (now > entry.expiresAt) otpStore.delete(key);
  }
}, 5 * 60 * 1000);

function generateOtp() {
  return String(randomInt(100000, 1000000));
}

function hashOtp(otp) {
  return createHash('sha256').update(otp).digest('hex');
}

function otpKey(email, purpose = 'register') {
  return `${email.toLowerCase()}:${purpose}`;
}

// ── Verify a registration token (called by auth.js) ───────────────
// Returns true if the token is valid and unexpired, then deletes it
// (one-time use). Returns false otherwise.
export function verifyRegistrationToken(email, token) {
  const key = `verified:${email.toLowerCase()}:register`;
  const entry = otpStore.get(key);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) { otpStore.delete(key); return false; }
  if (hashOtp(token) !== entry.hash) return false;
  otpStore.delete(key); // one-time use
  return true;
}

// ── Rate limiting: max 5 OTP sends per email per 10 min ────────────
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many OTP requests. Please wait a few minutes.' },
});

// ── Send OTP ───────────────────────────────────────────────────────
const sendOtpSchema = z.object({
  email: z.string().email().toLowerCase(),
  purpose: z.enum(['register', 'reset']).optional().default('register'),
});

emailOtpRouter.post('/send', otpLimiter, validate(sendOtpSchema), asyncHandler(async (req, res) => {
  const { email, purpose } = req.valid;

  // For registration: reject if email already registered
  if (purpose === 'register') {
    const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'An account already exists for this email' });
    }
  }

  const otp = generateOtp();
  const key = otpKey(email, purpose);

  otpStore.set(key, {
    hash: hashOtp(otp),
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
    purpose,
  });

  let delivered = false;
  let deliveryMethod = 'dev';
  let devOtp = null;

  // Try to send via email
  if (mailConfigured()) {
    try {
      const html = buildOtpEmailHtml(otp, purpose);
      const text = buildOtpEmailText(otp, purpose);
      await sendMail({
        to: email,
        subject: `Your OncoConnect verification code: ${otp}`,
        text,
        html,
      });
      delivered = true;
      deliveryMethod = 'email';
    } catch (e) {
      console.warn(`[OTP] Email send failed: ${e.message}`);
    }
  }

  // Dev fallback: include OTP in response so it shows on screen
  if (!delivered) {
    devOtp = otp;
    deliveryMethod = 'dev';
  }

  await writeAudit({
    actorId: email, actorRole: 'anonymous',
    action: 'otp.send', targetId: email,
    detail: { purpose, delivery: deliveryMethod }, ip: req.ip,
  });

  res.json({
    ok: true,
    message: delivered
      ? `Verification code sent to ${email}`
      : 'Email not configured — enter the code shown below',
    delivery: deliveryMethod,
    // Only include OTP in dev mode (when email didn't send)
    ...(devOtp ? { otp: devOtp, expiresIn: '10 minutes' } : {}),
  });
}));

// ── Verify OTP ─────────────────────────────────────────────────────
const verifyOtpSchema = z.object({
  email: z.string().email().toLowerCase(),
  code: z.string().length(OTP_LENGTH).regex(/^\d+$/),
  purpose: z.enum(['register', 'reset']).optional().default('register'),
});

emailOtpRouter.post('/verify', validate(verifyOtpSchema), asyncHandler(async (req, res) => {
  const { email, code, purpose } = req.valid;
  const key = otpKey(email, purpose);
  const entry = otpStore.get(key);

  if (!entry) {
    return res.status(400).json({ error: 'No verification code found. Request a new one.', code: 'EXPIRED' });
  }

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(key);
    return res.status(400).json({ error: 'Verification code expired. Request a new one.', code: 'EXPIRED' });
  }

  if (entry.attempts >= OTP_MAX_ATTEMPTS) {
    otpStore.delete(key);
    return res.status(429).json({ error: 'Too many failed attempts. Request a new code.', code: 'LOCKED' });
  }

  entry.attempts++;

  if (hashOtp(code) !== entry.hash) {
    return res.status(401).json({
      error: `Invalid code. ${OTP_MAX_ATTEMPTS - entry.attempts} attempts remaining.`,
      code: 'INVALID',
      attemptsRemaining: OTP_MAX_ATTEMPTS - entry.attempts,
    });
  }

  // OTP valid — generate a verification token that the registration endpoint will accept
  const verificationToken = randomToken(32);
  const tokenKey = `verified:${email}:${purpose}`;

  // Store the verified token (replaces OTP entry)
  otpStore.delete(key);
  otpStore.set(tokenKey, {
    hash: hashOtp(verificationToken),
    expiresAt: Date.now() + OTP_TTL_MS,
    purpose,
  });

  await writeAudit({
    actorId: email, actorRole: 'anonymous',
    action: 'otp.verified', targetId: email,
    detail: { purpose }, ip: req.ip,
  });

  res.json({
    ok: true,
    message: 'Email verified successfully',
    verificationToken, // Client sends this with the register request
  });
}));

// ── Check if email is verified (for the registration form) ──────────
emailOtpRouter.post('/check', validate(verifyOtpSchema), asyncHandler(async (req, res) => {
  const { email, code, purpose } = req.valid;
  const key = otpKey(email, purpose);
  const entry = otpStore.get(key);

  // Check if there's a verification token stored (meaning OTP was already verified)
  const tokenKey = `verified:${email}:${purpose}`;
  const tokenEntry = otpStore.get(tokenKey);
  if (tokenEntry && hashOtp(code) === tokenEntry.hash) {
    return res.json({ ok: true, verified: true });
  }

  res.json({ ok: true, verified: false });
}));

// ── Email templates ────────────────────────────────────────────────
function buildOtpEmailHtml(otp, purpose) {
  const action = purpose === 'register' ? 'create your account' : 'reset your password';
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f4fa;font-family:system-ui,-apple-system,sans-serif">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
    <div style="background:linear-gradient(135deg,#1d4ed8,#2563eb,#3b82f6);padding:32px;text-align:center">
      <div style="font-size:32px;margin-bottom:8px">🧬</div>
      <div style="color:#fff;font-size:20px;font-weight:800">OncoConnect</div>
      <div style="color:rgba(255,255,255,.8);font-size:13px;margin-top:4px">Email Verification</div>
    </div>
    <div style="padding:32px">
      <div style="font-size:15px;color:#1a2740;margin-bottom:8px">Hi there,</div>
      <div style="font-size:14px;color:#5a6d8e;margin-bottom:24px">
        Use the code below to ${action}:
      </div>
      <div style="text-align:center;margin-bottom:24px">
        <div style="display:inline-block;font-size:36px;font-weight:800;letter-spacing:8px;background:#f0f4fa;border:2px solid #dde5f3;border-radius:12px;padding:16px 32px;color:#2563eb;font-family:monospace">
          ${otp}
        </div>
      </div>
      <div style="text-align:center;font-size:12px;color:#94a3b8;margin-bottom:20px">
        This code expires in 10 minutes.
      </div>
      <div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:12px 16px;font-size:12px;color:#92400e">
        ⚠️ If you didn't request this, someone may be trying to access your email. Do not share this code.
      </div>
    </div>
    <div style="padding:16px 32px;background:#f8faff;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0">
      OncoConnect — Secure Neuro-Oncology EMR
    </div>
  </div>
</body>
</html>`;
}

function buildOtpEmailText(otp, purpose) {
  const action = purpose === 'register' ? 'create your account' : 'reset your password';
  return `
OncoConnect — Email Verification

Use this code to ${action}:

${otp}

This code expires in 10 minutes.

If you didn't request this, ignore this email.
`.trim();
}
