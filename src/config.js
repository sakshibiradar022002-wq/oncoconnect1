// Central configuration. All secrets come from environment variables.
// Never hard-code secrets. On a cloud host, set these in the dashboard.

import crypto from 'node:crypto';


function required(name) {
  const val = process.env[name];
  if (val === undefined) {
    const msg = 'Missing required environment variable: ' + name;
    console.error('[FATAL] ' + msg);
    throw new Error(msg);
  }
  return val;
}

// In development we auto-generate ephemeral secrets so the app boots.
// In production (NODE_ENV=production) they MUST be provided, or we refuse to start.
const isProd = process.env.NODE_ENV === 'production';

function secret(name, bytes = 32) {
  if (process.env[name]) return process.env[name];
  if (isProd) return required(name); // hard-fail in prod
  const generated = crypto.randomBytes(bytes).toString('hex');
  console.warn(`[dev] ${name} not set — generated an ephemeral one. Sessions reset on restart.`);
  return generated;
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  isProd,

  // Secret used to sign session JWTs.
  jwtSecret: secret('JWT_SECRET'),

  // Master key used to encrypt PHI columns at rest (AES-256-GCM).
  // The AES-256 master key. Preferred: a 64-char hex string (32 bytes),
  //   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  // But ANY sufficiently long secret works too — if the value is not exactly
  // 64 hex chars, a 32-byte key is derived from it deterministically via
  // SHA-256. This lets managed hosts (Render/Railway) auto-generate the secret
  // with no format constraints, while an existing 64-hex key is used verbatim
  // (so already-encrypted data stays readable). The same secret always yields
  // the same key, so data survives restarts.
  phiKeyHex: (() => {
    const k = process.env.PHI_ENCRYPTION_KEY;
    if (k) {
      if (/^[0-9a-fA-F]{64}$/.test(k)) return k;              // exact hex key
      if (k.length >= 16) return crypto.createHash('sha256').update(k).digest('hex'); // derive
      throw new Error('PHI_ENCRYPTION_KEY is too short');
    }
    if (isProd) return required('PHI_ENCRYPTION_KEY');
    const gen = crypto.randomBytes(32).toString('hex');
    console.warn('[dev] PHI_ENCRYPTION_KEY not set — generated ephemeral. Encrypted data will be unreadable after restart.');
    return gen;
  })(),

  // Session lifetime.
  sessionTtlMinutes: parseInt(process.env.SESSION_TTL_MIN || '120', 10),

  // Path to the SQLite database file.
  // If DB_EPHEMERAL=true, uses :memory: (for testing/preview, data lost on restart)
  // In Electron, store DB in the user's data directory. Otherwise use local file or :memory:
  dbPath: (() => {
    if (process.env.DB_EPHEMERAL === 'true') return ':memory:';
    if (process.env.DB_PATH) return process.env.DB_PATH;

    return './chemocure.db';
  })(),

  // Password hashing cost (PBKDF2 iterations).
  pbkdf2Iterations: 210000,

  // When true, doctor accounts after the first one start deactivated and an
  // admin must set users.active = 1 before they can sign in.
  requireDoctorApproval: process.env.REQUIRE_DOCTOR_APPROVAL === 'true',
};
