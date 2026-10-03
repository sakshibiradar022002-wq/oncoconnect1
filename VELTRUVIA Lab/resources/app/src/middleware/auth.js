// Authentication (JWT in httpOnly cookie) + server-side revocable sessions + RBAC.

import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { randomToken } from '../crypto.js';

const COOKIE_NAME = 'cc_session';

// ── Issue a session ───────────────────────────────────────────────
// Returns { jti, token } — the token lets native apps (Capacitor APKs)
// authenticate via the Authorization header where cookies aren't ideal.
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
    { expiresIn: `${config.sessionTtlMinutes}m`, algorithm: 'HS256' }
  );

  // NOTE: `partitioned: true` (CHIPS) is deliberately NOT set. The CHIPS
  // spec requires the Secure attribute, and browsers silently drop
  // Secure-partitioned cookies delivered over plain HTTP — which is how
  // the Electron desktop apps serve the UI by default. With partitioned
  // set, login succeeded but the session cookie was never persisted, so
  // every subsequent request 401'd (masked by the localStorage fallback).
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,                 // JS cannot read it → XSS-resistant
    secure: config.isProd,          // HTTPS-only in production
    sameSite: 'strict',             // CSRF mitigation (stricter than lax)
    maxAge: config.sessionTtlMinutes * 60 * 1000,
    path: '/',
    priority: 'high',               // Ensure cookie is sent early
  });

  return { jti, token };
}

// ── Revoke (logout) ───────────────────────────────────────────────
export async function revokeSession(jti) {
  await db.prepare('UPDATE sessions SET revoked = 1 WHERE id = ?').run(jti);
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

// ── Verify on each request ────────────────────────────────────────
// No idle-timeout revoke: “stay logged in” is the product promise for the
// Patient/Lab apps and the desktop software. Session lifetime is bounded by
// SESSION_TTL_MIN (default 30 days) — a fresh JWT is issued long before
// expiry thanks to the sliding refresh below.

// Sliding refresh: when a session is past ⅔ of its lifetime, mint a fresh
// JWT (and extend the DB row) so an actively-used app never sees a 401.
const REFRESH_THRESHOLD_MS = 20 * 24 * 60 * 60 * 1000; // 20 of 30 days
const REFRESH_COOLDOWN_MS = 60 * 60 * 1000; // at most once/hour per session
const recentRefresh = new Map(); // jti → last refresh ts (in-memory only)

export async function authenticate(req, res, next) {
  // Cookie first (desktop apps + browser UI), then Authorization: Bearer
  // (native mobile apps — Capacitor WebView can't rely on httpOnly cookies).
  const token = req.cookies?.[COOKIE_NAME]
    || (String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1] ?? null);
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  let payload;
  try {
    // Algorithm pinned: without this, an attacker-crafted token could name a
    // different algorithm (e.g. 'none' family tricks in older libs).
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
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

  // Sliding refresh keeps active users signed in indefinitely (see above).
  const created = new Date(session.created_at).getTime();
  if (Date.now() - created > REFRESH_THRESHOLD_MS
      && Date.now() - (recentRefresh.get(payload.jti) || 0) > REFRESH_COOLDOWN_MS) {
    const now = new Date();
    const expires = new Date(now.getTime() + config.sessionTtlMinutes * 60 * 1000);
    const fresh = jwt.sign(
      { sub: payload.sub, type: payload.type, role: payload.role, jti: payload.jti },
      config.jwtSecret,
      { expiresIn: `${config.sessionTtlMinutes}m`, algorithm: 'HS256' }
    );
    await db.prepare('UPDATE sessions SET expires_at = ?, last_activity = ? WHERE id = ?')
      .run(expires.toISOString(), now.toISOString(), payload.jti).catch(() => {});
    recentRefresh.set(payload.jti, Date.now());
    if (recentRefresh.size > 4096) recentRefresh.clear();
    // Cookie clients pick the new value up automatically; native apps can't
    // take cookies — hand the fresh token back in a response header so
    // mobile-api.js swaps it in (same jti, extended expiry). Without this,
    // mobile users hit a hard 401 after 30 days no matter how often they
    // used the app.
    if (String(req.headers['x-veltruvia-native'] || '') === '1') {
      res.setHeader('X-Veltruvia-Refreshed-Token', fresh);
    }
    res.cookie(COOKIE_NAME, fresh, {
      httpOnly: true,
      secure: config.isProd,
      sameSite: 'strict',
      maxAge: config.sessionTtlMinutes * 60 * 1000,
      path: '/',
      priority: 'high',
    });
  }

  // Touch last_activity (bookkeeping only — no longer used for revocation).
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
