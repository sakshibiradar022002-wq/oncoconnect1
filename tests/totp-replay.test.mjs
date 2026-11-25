// S11 regression: 2FA codes must be single-use.
// The accepted time step is stored on the user row, so replaying a code
// inside the ±1-step (±30 s) drift window is refused instead of logging in
// a second time. Runs against a spawned server on its own port and DB.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { rmSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';

const APP = resolve('VELTRUVIA Server/resources/app');
const PORT = 3131;
const base = `http://localhost:${PORT}`;
const dataDir = join(APP, 'totp-replay-tmp');
const DEMO_PASSWORD = 'replay-check-pass-1';

try { rmSync(dataDir, { recursive: true, force: true }); } catch {}
mkdirSync(dataDir, { recursive: true });

const server = spawn('node', ['src/server.js'], {
  cwd: APP,
  env: {
    ...process.env,
    JWT_SECRET: 'test-secret',
    PHI_ENCRYPTION_KEY: 'test-phi-key-32-bytes-long-here',
    DB_PATH: join(dataDir, 'test.db'),
    PORT: String(PORT),
    NODE_ENV: 'test',
    VELTRUVIA_DEMO: 'true',
    VELTRUVIA_DEMO_PASSWORD: DEMO_PASSWORD,
    VELTRUVIA_TEST_MODE: '1',
    // Hermetic mail — never inherit a real provider from resources/app/.env
    GMAIL_USER: '', GMAIL_APP_PASSWORD: '', RESEND_API_KEY: '',
    SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let out = '';
server.stdout.on('data', d => { out += d; });
server.stderr.on('data', d => { out += d; });

test.after(() => {
  server.kill('SIGKILL');
  try { rmSync(dataDir, { recursive: true, force: true }); } catch {}
  setImmediate(() => process.exit(0)); // matches the other spawned-server tests
});

await new Promise((res, rej) => {
  const probe = net.createServer();
  probe.once('error', () => rej(new Error(`Port ${PORT} in use`)));
  probe.listen(PORT, '127.0.0.1', () => probe.close(res));
});

before(async () => {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${base}/health`); if (r.ok) return; } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('server never became ready:\n' + out.slice(-2000));
});

// ── RFC 6238, mirroring src/crypto.js ─────────────────────────────
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(str) {
  let bits = 0, value = 0;
  const buf = [];
  for (const ch of String(str).toUpperCase()) {
    const idx = B32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { buf.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(buf);
}
function totpCode(secret, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 0x0f;
  const n = ((h[o] & 0x7f) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1e6;
  return String(n).padStart(6, '0');
}
const step = () => Math.floor(Date.now() / 30000);

// A session cookie is only needed for the enrolment calls.
let cookie = '';
async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.getSetCookie?.() || [];
  if (set.length) cookie = set[0].split(';')[0];
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, body: json, text };
}

const login = code => call('/api/auth/login', {
  method: 'POST',
  body: { email: 'test@example.com', password: DEMO_PASSWORD, ...(code ? { totpCode: code } : {}) },
});

test('a used TOTP code cannot be replayed within the drift window', async () => {
  const first = await login();
  assert.equal(first.status, 200, `demo admin login failed: ${first.text}`);

  // Enrolment re-authenticates: a session cookie alone must not bind a factor.
  const noPassword = await call('/api/auth/totp/setup', { method: 'POST', body: {} });
  assert.equal(noPassword.status, 400, 'setup must reject a request without the password');
  const wrongPassword = await call('/api/auth/totp/setup', { method: 'POST', body: { password: 'not-the-password' } });
  assert.equal(wrongPassword.status, 401, 'setup must reject a wrong password');

  const setup = await call('/api/auth/totp/setup', { method: 'POST', body: { password: DEMO_PASSWORD } });
  assert.equal(setup.status, 200, `totp setup failed: ${setup.text}`);

  // A second setup must not silently replace the pending secret.
  const setupAgain = await call('/api/auth/totp/setup', { method: 'POST', body: { password: DEMO_PASSWORD } });
  assert.equal(setupAgain.status, 409, 'a pending enrolment must not be silently replaced');
  assert.equal(setupAgain.body?.pending, true);
  const secret = setup.body.secret;
  assert.ok(secret, 'setup must return a secret');

  const c0 = step();
  const enrolCode = totpCode(secret, c0);
  const enable = await call('/api/auth/totp/enable', { method: 'POST', body: { code: enrolCode } });
  assert.equal(enable.status, 200, `enrolment failed: ${enable.text}`);

  // The enrolment code was spent at enable: it must not log in.
  const spendEnrol = await login(enrolCode);
  assert.equal(spendEnrol.status, 401, 'the enrolment code must already be spent');

  // A newer step still works (no lockout from the counter check).
  const c1 = c0 + 1;
  const newer = totpCode(secret, c1);
  const okLogin = await login(newer);
  assert.equal(okLogin.status, 200, `a fresh code should log in: ${okLogin.text}`);

  // Replay of the code just used — the whole point of S11.
  const replay = await login(newer);
  assert.equal(replay.status, 401, 'the same code must not authenticate twice');
  assert.equal(replay.body?.totpRequired, true);
});
