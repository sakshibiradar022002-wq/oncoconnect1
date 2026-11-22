// Imaging API: raw-body upload, gallery, profile, byte serving integrity and
// time-limited public sharing. Runs against a real spawned server with an
// isolated port and ephemeral data dir.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { rmSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import net from 'node:net';

const APP = resolve('VELTRUVIA Server/resources/app');
// Bind an ephemeral port: a fixed one collides with a parallel test run and
// makes the suite fail for reasons unrelated to the code under test.
const PORT = await new Promise((res, rej) => {
  const probe = net.createServer();
  probe.once('error', () => rej(new Error('no free port available')));
  probe.listen(0, '127.0.0.1', () => { const p = probe.address().port; probe.close(() => res(p)); });
});
const base = `http://localhost:${PORT}`;
const dataDir = join(APP, 'images-tmp');
const dbPath = join(dataDir, 'test.db');

// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

try { rmSync(dataDir, { recursive: true, force: true }); } catch {}
mkdirSync(dataDir, { recursive: true });

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
    VELTRUVIA_TEST_MODE: '1',
    GMAIL_USER: '', GMAIL_APP_PASSWORD: '', RESEND_API_KEY: '',
    SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let out = '';
server.stdout.on('data', (d) => { out += d; });
server.stderr.on('data', (d) => { out += d; });

before(async () => {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${base}/health`); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server never became ready:\n' + out.slice(-2000));
});

test.after(() => {
  server.kill('SIGKILL');
  setImmediate(() => process.exit(0));
});

let cookie = '';
let imageId = '';

test('imaging requires authentication', async () => {
  const r = await fetch(`${base}/api/images/12345`, {
    method: 'POST', headers: { 'x-filename': 'x.png', 'content-type': 'image/png' }, body: PNG,
  });
  assert.equal(r.status, 401);
  const g = await fetch(`${base}/api/images?mrn=12345`);
  assert.equal(g.status, 401);
});

test('doctor login', async () => {
  const r = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@example.com', password: 'testdoc123' }),
  });
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json().catch(() => ({}))));
  cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  assert.ok(cookie, 'session cookie set');
});

test('upload stores the image and reports its hash', async () => {
  const r = await fetch(`${base}/api/images/12345`, {
    method: 'POST',
    headers: { cookie, 'x-filename': 'scan.png', 'content-type': 'image/png', 'x-note': 'baseline MRI' },
    body: PNG,
  });
  const d = await r.json();
  assert.equal(r.status, 201, JSON.stringify(d));
  assert.ok(d.image.id);
  assert.equal(d.image.mimeType, 'image/png');
  assert.equal(d.image.sizeBytes, PNG.length);
  assert.equal(d.image.note, 'baseline MRI');
  imageId = d.image.id;
});

test('upload rejects non-image bytes', async () => {
  const r = await fetch(`${base}/api/images/12345`, {
    method: 'POST', headers: { cookie, 'x-filename': 'notes.txt', 'content-type': 'text/plain' },
    body: Buffer.from('not an image at all'),
  });
  assert.equal(r.status, 415);
});

test('gallery lists the image; profile returns the latest', async () => {
  const r = await fetch(`${base}/api/images?mrn=12345`, { headers: { cookie } });
  const d = await r.json();
  assert.equal(r.status, 200);
  assert.ok(d.images.some((i) => i.id === imageId));
  assert.ok(!('sha256' in d.images[0]), 'listing does not leak storage internals');

  const p = await fetch(`${base}/api/images/profile/12345`, { headers: { cookie } });
  const pd = await p.json();
  assert.equal(p.status, 200);
  assert.equal(pd.image.id, imageId);
});

test('image bytes round-trip byte-for-byte', async () => {
  const r = await fetch(`${base}/api/images/${imageId}/file`, { headers: { cookie } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/png');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  const buf = Buffer.from(await r.arrayBuffer());
  assert.ok(buf.equals(PNG), 'served bytes match uploaded bytes');
});

test('share token serves bytes with no session and no identifiers', async () => {
  const s = await fetch(`${base}/api/images/share`, {
    method: 'POST', headers: { cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageId, expiresInDays: 3 }),
  });
  const sd = await s.json();
  assert.equal(s.status, 200, JSON.stringify(sd));
  assert.match(sd.shareToken, /^[A-Za-z0-9_-]{20,64}$/);

  const pub = await fetch(`${base}${sd.shareUrl}`);
  assert.equal(pub.status, 200, 'share link works without a session');
  const buf = Buffer.from(await pub.arrayBuffer());
  assert.ok(buf.equals(PNG));
  assert.ok(!/12345/.test(pub.headers.get('content-disposition') || ''), 'no MRN in headers');

  const bad = await fetch(`${base}/api/images/shared/${'A'.repeat(22)}`);
  assert.equal(bad.status, 404);
});

test('delete removes the image and its bytes', async () => {
  const d = await fetch(`${base}/api/images/${imageId}`, { method: 'DELETE', headers: { cookie } });
  assert.equal(d.status, 200, JSON.stringify(await d.clone().json().catch(() => ({}))));
  const r = await fetch(`${base}/api/images/${imageId}/file`, { headers: { cookie } });
  assert.equal(r.status, 404);
});

test('only clinicians can reach the imaging API', async () => {
  const pat = await fetch(`${base}/api/sync/store-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mrn: '12345', password: 'testpat123' }),
  });
  assert.equal(pat.status, 200, 'demo patient logs in');
  const patCookie = (pat.headers.getSetCookie?.() || [pat.headers.get('set-cookie') || ''])
    .map(c => String(c || '').split(';')[0]).filter(Boolean)[0];
  const lab = await fetch(`${base}/api/sync/lab-store-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'testlab', password: 'testlab123' }),
  });
  assert.equal(lab.status, 200, 'demo lab logs in');
  const labCookie = (lab.headers.getSetCookie?.() || [lab.headers.get('set-cookie') || ''])
    .map(c => String(c || '').split(';')[0]).filter(Boolean)[0];

  for (const [who, ck] of [['patient', patCookie], ['lab', labCookie]]) {
    const g = await fetch(`${base}/api/images?mrn=12345`, { headers: { cookie: ck } });
    assert.equal(g.status, 403, `${who} cannot browse a chart gallery`);
    const u = await fetch(`${base}/api/images/12345`, {
      method: 'POST', headers: { cookie: ck, 'x-filename': 'x.png', 'content-type': 'image/png' }, body: PNG,
    });
    assert.equal(u.status, 403, `${who} cannot upload studies`);
  }
});

test('gallery paginates and keeps a stable total', async () => {
  for (let n = 1; n <= 3; n++) {
    const r = await fetch(`${base}/api/images/12345`, {
      method: 'POST',
      headers: { cookie, 'x-filename': `page-${n}.png`, 'content-type': 'image/png' },
      body: PNG,
    });
    assert.equal(r.status, 201, `upload ${n}`);
  }
  const first = await (await fetch(`${base}/api/images?mrn=12345&limit=2&offset=0`, { headers: { cookie } })).json();
  assert.equal(first.total, 3);
  assert.equal(first.images.length, 2);
  assert.equal(first.hasMore, true);

  const rest = await (await fetch(`${base}/api/images?mrn=12345&limit=2&offset=2`, { headers: { cookie } })).json();
  assert.equal(rest.images.length, 1);
  assert.equal(rest.hasMore, false);
  assert.notEqual(first.images[0].id, rest.images[0].id, 'pages do not overlap');
});

test('uploads above 10 MB are rejected', async () => {
  const big = Buffer.alloc(10 * 1024 * 1024 + 1, 0x41);
  const r = await fetch(`${base}/api/images/12345`, {
    method: 'POST', headers: { cookie, 'x-filename': 'huge.png', 'content-type': 'image/png' }, body: big,
  });
  assert.equal(r.status, 413);
});
