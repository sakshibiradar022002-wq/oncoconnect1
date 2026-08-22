// Authentication (JWT in httpOnly cookie) + server-side revocable sessions + RBAC.

import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { randomToken } from '../crypto.js';

const COOKIE_NAME = 'cc_session';

// ── Issue a session ───────────────────────────────────────────────
export async function createSession(res, { subjectId, subjectType, role }) {
  const jti = randomToken(16);
  const now = new Date();
  const expires = new Date(now.getTime() + config.sessionTtlMinutes * 60 * 1000);

  // Opportunistic cleanup so the table doesn't grow forever.
  await db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now.toISOString());

  await db.prepare(`
    INSERT INTO sessions (id, subject_id, subject_type, role, created_at, expires_at, revoked, last_activity)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `).run(jti, subjectId, subjectType, role, now.toISOString(), expires.toISOString(), now.toISOString());

  const token = jwt.sign(
    { sub: subjectId, type: subjectType, role, jti },
    config.jwtSecret,
    { expiresIn: `${config.sessionTtlMinutes}m` }
  );

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,                 // JS cannot read it → XSS-resistant
    secure: config.isProd,          // HTTPS-only in production
    sameSite: 'lax',                // CSRF mitigation
    maxAge: config.sessionTtlMinutes * 60 * 1000,
    path: '/',
  });

  return jti;
}

// ── Revoke (logout) ───────────────────────────────────────────────
export async function revokeSession(jti) {
  await db.prepare('UPDATE sessions SET revoked = 1 WHERE id = ?').run(jti);
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

// ── Verify on each request ────────────────────────────────────────
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes idle timeout

export async function authenticate(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  // Check the session still exists and isn't revoked/expired server-side.
  const session = await db.prepare('SELECT * FROM sessions WHERE id = ?').get(payload.jti);
  if (!session || session.revoked) {
    return res.status(401).json({ error: 'Session revoked' });
  }
  if (new Date(session.expires_at) < new Date()) {
    return res.status(401).json({ error: 'Session expired' });
  }

  // Idle timeout: revoke if no activity for 30 minutes
  if (session.last_activity) {
    const lastActive = new Date(session.last_activity).getTime();
    if (Date.now() - lastActive > IDLE_TIMEOUT_MS) {
      await db.prepare('UPDATE sessions SET revoked = 1 WHERE id = ?').run(payload.jti);
      return res.status(401).json({ error: 'Session expired due to inactivity' });
    }
  }

  // Update last activity timestamp
  await db.prepare('UPDATE sessions SET last_activity = ? WHERE id = ?')
    .run(new Date().toISOString(), payload.jti).catch(() => {});

  req.auth = {
    subjectId: payload.sub,
    subjectType: payload.type,   // 'user' | 'patient'
    role: payload.role,          // 'doctor' | 'lab' | 'admin' | 'patient'
    jti: payload.jti,
  };
  next();
}

// ── Role gate ─────────────────────────────────────────────────────
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
