// ═══════════════════════════════════════════════════════════════════
// VELTRUVIA API Test Suite
// Run: node --test tests/api.test.js
// ═══════════════════════════════════════════════════════════════════

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import path from 'node:path';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// ── Test config ──
// Ephemeral port: a stray VELTRUVIA Server.exe (or anything else) squatting
// :3000 used to steal every request — the suite "passed" against the wrong
// server or failed 429 from its rate limiter. Bind a free port instead.
let BASE = '';
let serverProcess = null;
let serverOutput = '';

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// v2.6.1: boot the real server on an ephemeral DB before the suite runs.
// Previously the suite expected an already-running localhost:3000, so CI (and
// any fresh checkout) failed 22/30 assertions with connection refusals.
before(async () => {
  const appRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const port = await freePort();
  BASE = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, ['src/server.js'], {
    cwd: appRoot,
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: path.join(appRoot, 'data', 'test-db.sqlite'),
      VELTRUVIA_DEMO: 'true',
      VELTRUVIA_TEST_MODE: '1',
      VELTRUVIA_DEMO_PASSWORD: 'testdoc123',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  serverProcess.stderr.on('data', (d) => { serverOutput += d; });
  serverProcess.on('exit', (code) => {
    if (serverOutput && !serverOutput.includes('Goodbye')) {
      serverOutput += `\n[server exited code=${code}]`;
    }
  });
  // Poll /api/health until OUR server answers (max ~20s).
  for (let i = 0; i < 40; i++) {
    if (serverProcess.exitCode !== null) break; // died at boot — don't wait
    try {
      const res = await request('GET', '/api/health');
      if (res.status === 200) return;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('test server never became healthy on port ' + port +
    (serverOutput ? '\nserver output:\n' + serverOutput : ''));
}, { timeout: 30_000 });

after(async () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});

// ── Helper: make HTTP requests ──
function request(method, path, body = null, cookies = '') {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookies ? { Cookie: cookies } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        const setCookie = res.headers['set-cookie'] || [];
        let json = null;
        try { json = JSON.parse(data); } catch {}
        resolve({ status: res.statusCode, body: json || data, setCookie });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function extractCookie(setCookie) {
  return setCookie.map(c => c.split(';')[0]).join('; ');
}

// ═══════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════
describe('Health Check', () => {
  it('GET /health returns ok', async () => {
    const res = await request('GET', '/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });

  it('GET /health?deep=1 checks database', async () => {
    const res = await request('GET', '/health?deep=1');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.db, true);
  });

  it('GET /api/health returns ok', async () => {
    const res = await request('GET', '/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// AUTHENTICATION
// ═══════════════════════════════════════════════════════════════════
describe('Authentication', () => {
  let sessionCookie = '';

  it('POST /api/auth/login with test credentials succeeds', async () => {
    const res = await request('POST', '/api/auth/login', {
      email: 'test@example.com',
      password: 'testdoc123',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.ok(res.body.user);
    assert.equal(res.body.user.email, 'test@example.com');
    sessionCookie = extractCookie(res.setCookie);
    assert.ok(sessionCookie.includes('cc_session'));
  });

  it('POST /api/auth/login with wrong password returns 401', async () => {
    const res = await request('POST', '/api/auth/login', {
      email: 'test@example.com',
      password: 'wrongpassword',
    });
    assert.equal(res.status, 401);
    assert.ok(res.body.error);
  });

  it('POST /api/auth/login with non-existent email returns 401', async () => {
    const res = await request('POST', '/api/auth/login', {
      email: 'nonexistent@example.com',
      password: 'testdoc123',
    });
    assert.equal(res.status, 401);
  });

  it('GET /api/admin/users requires auth', async () => {
    const res = await request('GET', '/api/admin/users');
    assert.equal(res.status, 401);
  });

  it('GET /api/admin/users with session returns user list', async () => {
    const res = await request('GET', '/api/admin/users', null, sessionCookie);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.users));
  });

  it('POST /api/auth/logout revokes session', async () => {
    const res = await request('POST', '/api/auth/logout', null, sessionCookie);
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });

  it('GET /api/admin/users with revoked session returns 401', async () => {
    const res = await request('GET', '/api/admin/users', null, sessionCookie);
    assert.equal(res.status, 401);
  });
});

// ═══════════════════════════════════════════════════════════════════
// CLINICAL DECISION SUPPORT
// ═══════════════════════════════════════════════════════════════════
describe('Clinical Decision Support', () => {
  let sessionCookie = '';

  before(async () => {
    const res = await request('POST', '/api/auth/login', {
      email: 'test@example.com',
      password: 'testdoc123',
    });
    sessionCookie = extractCookie(res.setCookie);
  });

  after(async () => {
    await request('POST', '/api/auth/logout', null, sessionCookie);
  });

  it('POST /api/cds/interactions detects drug interactions', async () => {
    const res = await request('POST', '/api/cds/interactions', {
      medications: ['temozolomide', 'valproic acid'],
    }, sessionCookie);
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.ok(res.body.interactions.length > 0);
    assert.equal(res.body.interactions[0].severity, 'severe');
  });

  it('POST /api/cds/interactions with no interaction returns empty', async () => {
    const res = await request('POST', '/api/cds/interactions', {
      medications: ['aspirin', 'vitamin c'],
    }, sessionCookie);
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.interactions.length, 0);
  });

  it('POST /api/cds/dosage-check flags overdose', async () => {
    const res = await request('POST', '/api/cds/dosage-check', {
      medication: 'temozolomide',
      dosage: '300 mg/m²',
      frequency: 'daily',
    }, sessionCookie);
    assert.equal(res.status, 200);
    assert.ok(res.body.alerts.length > 0);
    assert.equal(res.body.alerts[0].severity, 'severe');
  });

  it('POST /api/cds/allergy-check detects allergies', async () => {
    // First add an allergy
    await request('POST', '/api/cds/allergies', {
      mrn: 'TEST001',
      drugName: 'penicillin',
      reaction: 'Rash',
      severity: 'moderate',
    }, sessionCookie);

    const res = await request('POST', '/api/cds/allergy-check', {
      patientMrn: 'TEST001',
      medications: ['amoxicillin'],
    }, sessionCookie);
    assert.equal(res.status, 200);
    assert.ok(res.body.alerts.length > 0);
  });

  it('GET /api/cds/drug-info/temozolomide returns drug data', async () => {
    const res = await request('GET', '/api/cds/drug-info/temozolomide', null, sessionCookie);
    assert.equal(res.status, 200);
    assert.ok(res.body.info);
    assert.equal(res.body.info.brand, 'Temodar');
  });
});

// ═══════════════════════════════════════════════════════════════════
// CLINICAL FEATURES
// ═══════════════════════════════════════════════════════════════════
describe('Clinical Features', () => {
  let sessionCookie = '';

  before(async () => {
    const res = await request('POST', '/api/auth/login', {
      email: 'test@example.com',
      password: 'testdoc123',
    });
    sessionCookie = extractCookie(res.setCookie);
  });

  after(async () => {
    await request('POST', '/api/auth/logout', null, sessionCookie);
  });

  it('POST /api/features/notes creates a clinical note', async () => {
    const res = await request('POST', '/api/features/notes', {
      patientMrn: 'TEST001',
      noteType: 'soap',
      subjective: 'Patient reports headache',
      objective: 'Neuro exam normal',
      assessment: 'GBM, stable',
      plan: 'Continue TMZ',
    }, sessionCookie);
    assert.equal(res.status, 201);
    assert.equal(res.body.ok, true);
    assert.ok(res.body.id);
  });

  it('GET /api/features/notes/TEST001 returns notes', async () => {
    const res = await request('GET', '/api/features/notes/TEST001', null, sessionCookie);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.notes));
    assert.ok(res.body.notes.length > 0);
  });

  it('POST /api/features/protocols returns seeded protocols', async () => {
    const res = await request('GET', '/api/features/protocols', null, sessionCookie);
    assert.equal(res.status, 200);
    assert.ok(res.body.protocols.length >= 4);
  });

  it('POST /api/features/outcomes with invalid type returns 400', async () => {
    const res = await request('POST', '/api/features/outcomes', {
      patientMrn: 'TEST001',
      outcomeType: 'invalid_type',
      date: '2024-01-01',
      value: 'test',
    }, sessionCookie);
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('Invalid outcomeType'));
  });

  it('POST /api/features/outcomes with valid type succeeds', async () => {
    const res = await request('POST', '/api/features/outcomes', {
      patientMrn: 'TEST001',
      outcomeType: 'response',
      date: '2024-01-01',
      value: 'Partial response',
    }, sessionCookie);
    assert.equal(res.status, 201);
    assert.equal(res.body.ok, true);
  });

  it('GET /api/features/export/TEST001 returns patient data', async () => {
    const res = await request('GET', '/api/features/export/TEST001', null, sessionCookie);
    assert.equal(res.status, 200);
    assert.ok(res.body.data);
    assert.ok(res.body.totalRecords >= 0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// BILLING (previously broken)
// ═══════════════════════════════════════════════════════════════════
describe('Billing Module (previously broken)', () => {
  let sessionCookie = '';

  before(async () => {
    const res = await request('POST', '/api/auth/login', {
      email: 'test@example.com',
      password: 'testdoc123',
    });
    sessionCookie = extractCookie(res.setCookie);
  });

  after(async () => {
    await request('POST', '/api/auth/logout', null, sessionCookie);
  });

  it('POST /api/billing/invoices creates an invoice', async () => {
    const res = await request('POST', '/api/billing/invoices', {
      patientMrn: 'TEST001',
      items: [
        { description: 'Office visit', cptCode: '99213', unitPrice: 150, quantity: 1 },
        { description: 'MRI Brain', cptCode: '70553', unitPrice: 800, quantity: 1 },
      ],
    }, sessionCookie);
    assert.equal(res.status, 200);
    assert.ok(res.body.invoiceNumber);
    assert.equal(res.body.total, 950);
  });

  it('GET /api/billing/invoices lists invoices', async () => {
    const res = await request('GET', '/api/billing/invoices?patientMrn=TEST001', null, sessionCookie);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });

  it('GET /api/billing/stats returns dashboard data', async () => {
    const res = await request('GET', '/api/billing/stats', null, sessionCookie);
    assert.equal(res.status, 200);
    assert.ok('totalRevenue' in res.body);
    assert.ok('totalClaims' in res.body);
  });

  it('GET /api/billing/codes/icd10?q=brain returns ICD codes', async () => {
    const res = await request('GET', '/api/billing/codes/icd10?q=brain', null, sessionCookie);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length > 0);
  });

  it('GET /api/billing/codes/cpt?q=mri returns CPT codes', async () => {
    const res = await request('GET', '/api/billing/codes/cpt?q=mri', null, sessionCookie);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length > 0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// TELEHEALTH
// ═══════════════════════════════════════════════════════════════════
describe('Telehealth', () => {
  let sessionCookie = '';

  before(async () => {
    const res = await request('POST', '/api/auth/login', {
      email: 'test@example.com',
      password: 'testdoc123',
    });
    sessionCookie = extractCookie(res.setCookie);
  });

  after(async () => {
    await request('POST', '/api/auth/logout', null, sessionCookie);
  });

  it('POST /api/telehealth/rooms creates a room', async () => {
    const res = await request('POST', '/api/telehealth/rooms', {
      patientMrn: 'TEST001',
    }, sessionCookie);
    assert.equal(res.status, 201);
    assert.ok(res.body.roomCode);
    assert.equal(res.body.status, 'waiting');
  });

  it('GET /api/telehealth/rooms lists active rooms', async () => {
    const res = await request('GET', '/api/telehealth/rooms', null, sessionCookie);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.rooms));
  });
});

// ═══════════════════════════════════════════════════════════════════
// 404 HANDLING
// ═══════════════════════════════════════════════════════════════════
describe('Error Handling', () => {
  it('GET /api/nonexistent returns 404', async () => {
    const res = await request('GET', '/api/nonexistent');
    assert.equal(res.status, 404);
    assert.ok(res.body.error);
  });

  it('GET /nonexistent returns a real 404 page (SPA fallback removed in app.js)', async () => {
    const res = await request('GET', '/nonexistent');
    // app.js serves a real 404 for unknown non-API GETs (the old catch-all
    // index.html fallback masked broken links); assert the intended behavior.
    assert.equal(res.status, 404);
  });
});

console.log('\n🧪 VELTRUVIA API Test Suite');
console.log('Run: node --test tests/api.test.js\n');
