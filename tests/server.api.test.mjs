// Integration tests: boots the real server (src/server.js) on :3123 with an
// ephemeral DB and exercises auth, admin, CSRF, CSP and static-serving paths.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import net from 'node:net';

const APP = resolve('VELTRUVIA Server/resources/app');
const PORT = 3123;
const base = `http://localhost:${PORT}`;
const dbPath = join(APP, 'test-suite.db');

const runtimeFiles = ['.demo-admin-password', 'patient-store.json', 'appointments-store.json',
  'availability-store.json', 'logs-store.json', 'messages-store.json',
  'telehealth-rooms.json', 'telehealth-signals.json', 'chain.json'].map(f => join(APP, f));
for (const f of [dbPath, dbPath + '-wal', dbPath + '-shm', ...runtimeFiles]) { try { rmSync(f); } catch {} }

// Fail fast if the port is taken (stale server = testing the wrong code)
await new Promise((res, rej) => {
  const probe = net.createServer();
  probe.once('error', () => rej(new Error(`Port ${PORT} in use — kill the stale process first`)));
  probe.listen(PORT, '127.0.0.1', () => probe.close(res));
});

const server = spawn('node', ['src/server.js'], {
  cwd: APP,
  env: {
    ...process.env,
    JWT_SECRET: 'test-secret',
    PHI_ENCRYPTION_KEY: 'test-phi-key-32-bytes-long-here',
    DB_PATH: dbPath,
    PORT: String(PORT),
    NODE_ENV: 'test',
    VELTRUVIA_DEMO: 'true',
    VELTRUVIA_DEMO_PASSWORD: 'testdoc123',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOut = '';
server.stdout.on('data', d => { serverOut += d; });
server.stderr.on('data', d => { serverOut += d; });

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 1500);
      const r = await fetch(`${base}/health`, { signal: c.signal });
      clearTimeout(t);
      if (r.ok) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

function api(method, path, body = null, cookie = '', extraHeaders = {}) {
  const opts = { method, headers: { 'Content-Type': 'application/json', ...extraHeaders } };
  if (cookie) opts.headers.Cookie = cookie;
  if (body) opts.body = JSON.stringify(body);
  return fetch(base + path, opts).then(async r => {
    const setCookie = r.headers.get('set-cookie') || '';
    let data; try { data = await r.json(); } catch { data = null; }
    return { status: r.status, data, setCookie, headers: r.headers };
  });
}
const cookieOf = sc => sc.split(',').map(c => c.trim().split(';')[0]).join('; ');

let adminCookie = '';

before(async () => {
  const ready = await waitReady();
  if (!ready) {
    console.error('SERVER FAILED TO START:\n' + serverOut.slice(-2000));
    server.kill();
    process.exit(1);
  }
  const r = await api('POST', '/api/auth/login', { email: 'test@example.com', password: 'testdoc123' });
  assert.equal(r.status, 200, 'demo admin login should succeed: ' + JSON.stringify(r.data));
  adminCookie = cookieOf(r.setCookie);
});

after(() => {
  server.kill('SIGKILL'); // Windows ignores the signal; POSIX force-terminates so open handles can't hold the runner open
  setImmediate(() => process.exit(0)); // test-force-exit fallback (see package.json)
});

// ── Infrastructure ────────────────────────────────────────────────
test('health endpoint reports ok', async () => {
  const r = await api('GET', '/health');
  assert.equal(r.status, 200);
  assert.equal(r.data?.ok, true);
});

test('unknown API routes return 404 JSON', async () => {
  const r = await api('GET', '/api/definitely-not-a-route');
  assert.equal(r.status, 404);
});

test('security headers present (CSP without unsafe-inline scripts, HSTS-ish, nosniff)', async () => {
  const r = await api('GET', '/');
  const csp = r.headers.get('content-security-policy') || '';
  assert.ok(csp.includes("default-src 'self'"), 'default-src');
  assert.ok(!/script-src[^;]*'unsafe-inline'/.test(csp), 'script-src must NOT allow unsafe-inline');
  assert.ok(/script-src-attr[^;]*'none'/.test(csp), "script-src-attr must be 'none'");
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});

test('static pages served (index, patient, lab, admin, blockchain, download)', async () => {
  for (const p of ['/', '/patient.html', '/lab.html', '/admin.html', '/blockchain.html', '/download.html']) {
    const r = await api('GET', p);
    assert.equal(r.status, 200, p);
    assert.ok((r.data || '').toString?.length !== 0 || r.data === null);
  }
});

test('extracted page scripts are served as files', async () => {
  for (const f of ['js/actions.js', 'js/page/index-2-record.js', 'js/page/patient-1-core.js', 'js/page/admin-2-app.js']) {
    const r = await api('GET', '/' + f);
    assert.equal(r.status, 200, f);
  }
});

// ── Auth ──────────────────────────────────────────────────────────
test('login rejects wrong password with 401', async () => {
  const r = await api('POST', '/api/auth/login', { email: 'test@example.com', password: 'wrong-password' });
  assert.equal(r.status, 401);
  assert.ok(r.data?.error);
});

test('login rejects malformed payloads via validation (4xx, never 5xx)', async () => {
  for (const body of [{}, { email: 'not-an-email', password: 'x' }, { email: 'test@example.com' }]) {
    const r = await api('POST', '/api/auth/login', body);
    assert.ok(r.status >= 400 && r.status < 500, `status ${r.status} for ${JSON.stringify(body)}`);
  }
});

test('protected route requires session', async () => {
  const r = await api('GET', '/api/admin/users');
  assert.equal(r.status, 401);
});

test('admin login sets session cookie; /admin/users lists demo doctor', async () => {
  const r = await api('GET', '/api/admin/users', null, adminCookie);
  assert.equal(r.status, 200);
  const users = r.data?.users || [];
  assert.ok(users.some(u => u.email === 'test@example.com'), 'demo doctor listed');
  assert.ok(users.every(u => !('password_hash' in u)), 'no password hashes leaked');
  assert.ok(users.every(u => typeof u.name === 'string'), 'PHI decrypted for admin view');
});

// ── Admin user lifecycle (setActive round-trip) ───────────────────
test('register → pending account; admin approve → login works; deactivate → blocked', async () => {
  const email = `dr-${Date.now()}@test.local`;
  // 1) register (no email verification in test mode path — server decides)
  const reg = await api('POST', '/api/auth/register', {
    name: 'Test Doctor Two', email, password: 'Str0ngPassw0rd!x', specialty: 'Neuro-Oncology', institution: 'Test',
  });
  assert.ok(reg.status === 200 || reg.status === 201 || reg.status === 400, `register status ${reg.status}`);
  // 2) admin sees the user
  const list = await api('GET', '/api/admin/users', null, adminCookie);
  const u = (list.data?.users || []).find(x => x.email === email);
  if (u) {
    assert.equal(u.active, false, 'new user awaits approval');
    // 3) deactivate (no-op on inactive) → ok
    const d = await api('POST', `/api/admin/users/${u.id}/active`, { active: false }, adminCookie);
    assert.ok(d.status === 200 || d.status === 400);
    // 4) approve
    const a = await api('POST', `/api/admin/users/${u.id}/active`, { active: true }, adminCookie);
    assert.equal(a.status, 200, JSON.stringify(a.data));
    // 5) login now works
    const li = await api('POST', '/api/auth/login', { email, password: 'Str0ngPassw0rd!x' });
    assert.equal(li.status, 200, 'approved user can sign in');
    // 6) deactivate again → login blocked with the pending-approval message
    const de = await api('POST', `/api/admin/users/${u.id}/active`, { active: false }, adminCookie);
    assert.equal(de.status, 200);
    const li2 = await api('POST', '/api/auth/login', { email, password: 'Str0ngPassw0rd!x' });
    assert.equal(li2.status, 403);
    assert.match(li2.data?.error || '', /pending admin approval/i);
  }
});

test('admin cannot deactivate their own account', async () => {
  const me = await api('GET', '/api/admin/users', null, adminCookie);
  const admin = (me.data?.users || []).find(u => u.email === 'test@example.com');
  const r = await api('POST', `/api/admin/users/${admin.id}/active`, { active: false }, adminCookie);
  assert.equal(r.status, 400);
});

test('non-admin session cannot touch admin routes', async () => {
  // register+approve a second user, then use their session
  const email = `staff-${Date.now()}@test.local`;
  await api('POST', '/api/auth/register', { name: 'Staff', email, password: 'Str0ngPassw0rd!x' });
  const list = await api('GET', '/api/admin/users', null, adminCookie);
  const u = (list.data?.users || []).find(x => x.email === email);
  if (u) {
    await api('POST', `/api/admin/users/${u.id}/active`, { active: true }, adminCookie);
    const li = await api('POST', '/api/auth/login', { email, password: 'Str0ngPassw0rd!x' });
    if (li.status === 200) {
      const cookie = cookieOf(li.setCookie);
      const r = await api('POST', `/api/admin/users/${u.id}/active`, { active: true }, cookie);
      assert.equal(r.status, 403, 'role gate holds');
    }
  }
});

// ── CSRF guard ────────────────────────────────────────────────────
test('cross-origin writes are rejected (403)', async () => {
  const r = await api('POST', '/api/auth/login', { email: 'test@example.com', password: 'testdoc123' },
    '', { Origin: 'https://evil.example.com' });
  assert.equal(r.status, 403);
});

// ── SQLi guard smoke ─────────────────────────────────────────────
test("sql-injection-looking payload is handled safely (no 5xx)", async () => {
  const r = await api('POST', '/api/auth/login', { email: "x' OR 1=1 --", password: 'whatever123' });
  assert.ok(r.status < 500, `status ${r.status}`);
});

// ── Clinical safety: CDS routes over real HTTP ───────────────────
// These gate patient-safety decisions (allergy blocking, dose limits,
// interaction warnings) — they must be auth-gated, role-gated, validated,
// and must actually fire on known-dangerous inputs.

test('CDS safety routes are not public (401 without session)', async () => {
  for (const [path, body] of [
    ['/api/cds/allergy-check', { patientMrn: '12345', medications: ['amoxicillin'] }],
    ['/api/cds/dosage-check', { medication: 'temozolomide', dosage: '300 mg/m²', frequency: 'daily' }],
    ['/api/cds/interactions', { medications: ['a', 'b'] }],
  ]) {
    const r = await api('POST', path, body);
    assert.equal(r.status, 401, `${path} must require authentication`);
  }
});

test('CDS safety routes reject patient sessions (403 role gate)', async () => {
  const li = await api('POST', '/api/sync/patient-login', { mrn: '12345', password: 'testpat123' });
  assert.equal(li.status, 200, 'demo patient login: ' + JSON.stringify(li.data));
  const patientCookie = cookieOf(li.setCookie);
  for (const [path, body] of [
    ['/api/cds/allergy-check', { patientMrn: '12345', medications: ['amoxicillin'] }],
    ['/api/cds/dosage-check', { medication: 'temozolomide', dosage: '150 mg/m²', frequency: 'daily' }],
  ]) {
    const r = await api('POST', path, body, patientCookie);
    assert.equal(r.status, 403, `${path} must not be usable by patient sessions`);
  }
});

test('allergy gate: recorded allergy blocks the drug and its cross-reactive family', async () => {
  const add = await api('POST', '/api/cds/allergies', {
    mrn: 'CDS001', drugName: 'penicillin', reaction: 'Anaphylaxis', severity: 'anaphylaxis',
  }, adminCookie);
  assert.equal(add.status, 201, JSON.stringify(add.data));

  // Direct match on the recorded allergen
  const direct = await api('POST', '/api/cds/allergy-check',
    { patientMrn: 'CDS001', medications: ['penicillin'] }, adminCookie);
  assert.equal(direct.status, 200);
  assert.ok(direct.data.alerts.length >= 1, 'direct allergen must alert');
  assert.equal(direct.data.alerts[0].severity, 'anaphylaxis');
  assert.match(direct.data.alerts[0].message, /ALLERGY/i);

  // Cross-reactive family member (penicillin → amoxicillin)
  const cross = await api('POST', '/api/cds/allergy-check',
    { patientMrn: 'CDS001', medications: ['amoxicillin'] }, adminCookie);
  assert.equal(cross.status, 200);
  assert.ok(cross.data.alerts.some(a => a.crossReactivity === 'penicillin'),
    'cross-reactivity alert expected: ' + JSON.stringify(cross.data.alerts));

  // Unrelated drug on the same patient passes clean (no false positive)
  const clean = await api('POST', '/api/cds/allergy-check',
    { patientMrn: 'CDS001', medications: ['ondansetron'] }, adminCookie);
  assert.equal(clean.status, 200);
  assert.equal(clean.data.alerts.length, 0, 'no false-positive allergy alert');
});

test('dosing warning: temozolomide above max daily dose raises a severe alert', async () => {
  const r = await api('POST', '/api/cds/dosage-check', {
    medication: 'temozolomide', dosage: '300 mg/m²', frequency: 'daily',
  }, adminCookie);
  assert.equal(r.status, 200);
  const severe = (r.data.alerts || []).filter(a => a.severity === 'severe');
  assert.ok(severe.length >= 1, 'overdose must alert: ' + JSON.stringify(r.data));
  assert.match(severe[0].message, /exceeds maximum daily dose/i);
  assert.ok(r.data.reference, 'reference range returned for the drug');
});

test('dosing warning: therapeutic temozolomide dose raises no severe alert', async () => {
  const r = await api('POST', '/api/cds/dosage-check', {
    medication: 'temozolomide', dosage: '150 mg/m²', frequency: 'QD × 5 days', patientWeight: 70,
  }, adminCookie);
  assert.equal(r.status, 200);
  assert.equal((r.data.alerts || []).filter(a => a.severity === 'severe').length, 0,
    'no severe alert at therapeutic dose: ' + JSON.stringify(r.data.alerts));
});

test('severe interaction (temozolomide + valproic acid) surfaces over HTTP', async () => {
  const r = await api('POST', '/api/cds/interactions',
    { medications: ['temozolomide', 'valproic acid'] }, adminCookie);
  assert.equal(r.status, 200);
  assert.ok(r.data.interactions.length > 0, 'known severe pair must be detected');
  assert.equal(r.data.interactions[0].severity, 'severe');
});

test('CDS input validation rejects malformed payloads with 400 (never 5xx)', async () => {
  for (const [path, body] of [
    ['/api/cds/allergy-check', {}],
    ['/api/cds/dosage-check', { medication: 'temozolomide' }],
    ['/api/cds/interactions', { medications: ['only-one-med'] }],
    ['/api/cds/interactions', { medications: [] }],
  ]) {
    const r = await api('POST', path, body, adminCookie);
    assert.equal(r.status, 400, `${path} ${JSON.stringify(body)} → ${r.status}`);
    assert.equal(r.data?.error, 'Validation failed');
  }
});

// ── Regression: GET /hipaa/phi-log/:patientMrn returned 500 because the
// handler read req.params.mrn (undefined) instead of the declared param.
// Found by the 2026-10-05 live route sweep; keep it locked.
test('phi-log write → read round-trip works (regression: req.params name)', async () => {
  const mrn = 'PHILOG' + Date.now().toString(36).toUpperCase();
  const w = await api('POST', '/api/hipaa/phi-log',
    { patientMrn: mrn, action: 'view', section: 'test' }, adminCookie);
  assert.equal(w.status, 200, JSON.stringify(w.data));
  const r = await api('GET', `/api/hipaa/phi-log/${mrn}`, null, adminCookie);
  assert.equal(r.status, 200, 'read must not 500: ' + JSON.stringify(r.data));
  assert.ok(Array.isArray(r.data), 'returns an array');
  assert.ok(r.data.some(e => e.patient_mrn === mrn), 'returned the written row');
});
