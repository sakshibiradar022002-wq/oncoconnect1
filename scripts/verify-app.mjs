// Portable full-feature verification runner — usage: node verify-app.mjs "<appDir>" "<appName>"
// Starts the app's own src/server.js on :3000 with an ephemeral DB and runs ~50 feature checks.
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const appDir = process.argv[2];
const appName = process.argv[3] || appDir;
// Pick a random free port: never test against (or fight with) a server that's
// already running — on Windows SO_REUSEADDR lets a probe "succeed" on an
// actively-listening port, which made checks silently hit the live instance.
import net from 'node:net';
const port = await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', () => reject(new Error('no free port available')));
  probe.listen(0, '127.0.0.1', () => { const p = probe.address().port; probe.close(() => resolve(p)); });
});
const base = `http://localhost:${port}`;
const dbPath = join(appDir, 'test-verify.db');const runtimeFiles = ['.demo-admin-password', 'patient-store.json', 'appointments-store.json',
  'availability-store.json', 'logs-store.json', 'messages-store.json',
  'telehealth-rooms.json', 'telehealth-signals.json', 'chain.json'].map(f => join(appDir, f));
for (const f of [dbPath, dbPath + '-wal', dbPath + '-shm', ...runtimeFiles]) { try { rmSync(f); } catch {} }
// Node binary override: VELTRUVIA_NODE=/path/to/electron.exe (with
// ELECTRON_RUN_AS_NODE=1) lets the whole suite run under a different
// runtime — e.g. to prove the app's 69 checks pass on the node:sqlite
// backend shipped inside newer Electron builds.
const nodeBin = process.env.VELTRUVIA_NODE || 'node';
const server = spawn(nodeBin, ['src/server.js'], {
  cwd: appDir,
  env: {
    ...process.env,
    JWT_SECRET: 'test-secret',
    PHI_ENCRYPTION_KEY: 'test-phi-key-32-bytes-long-here',
    DB_PATH: resolve(dbPath),  // absolute: the server derives patient-store.json's dir from this
    PORT: String(port),
    NODE_ENV: 'test',
    VELTRUVIA_DEMO: 'true',   // seed demo accounts so login flows can be tested
    VELTRUVIA_DEMO_PASSWORD: 'testdoc123', // pinned for deterministic test logins
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let out = '';
server.stdout.on('data', d => { out += d; });
server.stderr.on('data', d => { out += d; });
server.on('error', e => { console.error('spawn error:', e.message); process.exit(1); });
server.on('exit', (code) => { if (code) { console.error(`server exited early (${code}):`, out.slice(-600)); process.exit(1); } });

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

function api(method, path, body = null, cookie = '') {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (cookie) opts.headers.Cookie = cookie;
  if (body) opts.body = JSON.stringify(body);
  return fetch(base + path, opts).then(async res => {
    const setCookie = res.headers.get('set-cookie') || '';
    let data; try { data = await res.json(); } catch { data = null; }
    return { status: res.status, data, setCookie };
  });
}
const extractCookie = sc => sc.split(',').map(c => c.trim().split(';')[0]).join('; ');

let pass = 0, fail = 0; const failures = [];
function check(name, cond) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name); console.log('  ❌ ' + name); }
}

const ready = await waitReady();
if (!ready) {
  console.error(`${appName}: SERVER FAILED TO START:\n` + out.slice(-2000));
  server.kill(); process.exit(1);
}
console.log(`${appName}: server ready on :${port}\n`);

// ── AUTH ──
console.log('📋 Authentication');
let r = await api('POST', '/api/auth/login', { email: 'test@example.com', password: 'testdoc123' });
check('Doctor login', r.data?.ok === true);
const docCookie = extractCookie(r.setCookie);
r = await api('POST', '/api/auth/login', { email: 'test@example.com', password: 'wrong' });
check('Wrong password rejected (401)', r.status === 401);
r = await api('GET', '/api/admin/users', null, docCookie);
check('Admin users list', r.data?.users?.length > 0);
r = await api('POST', '/api/auth/logout', null, docCookie);
check('Logout revokes session', r.data?.ok === true);
r = await api('GET', '/api/admin/users', null, docCookie);
check('Revoked session rejected (401)', r.status === 401);
r = await api('POST', '/api/auth/login', { email: 'test@example.com', password: 'testdoc123' });
const cookie = extractCookie(r.setCookie);
// Register TEST001 in the doctor's kv registry exactly like the UI's
// createPatient() does (PUT /sync with pat_<MRN>). Several RBAC-checked
// routes — e.g. POST /features/adherence — correctly 403 for a patient
// that was never registered, so the precondition must exist first.
r = await api('PUT', '/api/sync', { changes: {
  'pat_TEST001': { mrn: 'TEST001', name: 'Verify Patient', dob: '1980-01-01', diag: 'Glioblastoma', docId: 'test-admin-doc' },
} }, cookie);
check('Register TEST001 in doctor registry', r.data?.ok === true);
r = await api('POST', '/api/sync/store-login', { mrn: '12345', password: 'testpat123' });
check('Patient store login', r.data?.ok === true);
const patCookie = extractCookie(r.setCookie);
r = await api('POST', '/api/sync/lab-store-login', { username: 'testlab', password: 'testlab123' });
check('Lab store login', r.data?.ok === true);

// ── CDS ──
console.log('\n💊 Clinical Decision Support');
r = await api('POST', '/api/cds/interactions', { medications: ['temozolomide', 'valproic acid'] }, cookie);
check('Drug interactions (TMZ+VPA severe)', r.data?.interactions?.length > 0 && r.data.interactions[0].severity === 'severe');
r = await api('POST', '/api/cds/interactions', { medications: ['aspirin', 'vitamin c'] }, cookie);
check('No false-positive interactions', r.data?.interactions?.length === 0);
r = await api('POST', '/api/cds/dosage-check', { medication: 'temozolomide', dosage: '300 mg/m2', frequency: 'daily' }, cookie);
check('Dosage overdose detection', r.data?.alerts?.length > 0);
r = await api('POST', '/api/cds/allergies', { mrn: 'TEST001', drugName: 'penicillin', reaction: 'Rash', severity: 'moderate' }, cookie);
check('Add allergy', r.data?.ok === true);
r = await api('POST', '/api/cds/allergy-check', { patientMrn: 'TEST001', medications: ['amoxicillin'] }, cookie);
check('Allergy cross-reactivity alert', r.data?.alerts?.length > 0);
r = await api('GET', '/api/cds/drug-info/cisplatin', null, cookie);
check('Drug info (cisplatin)', r.data?.info?.brand === 'Platinol');
r = await api('GET', '/api/cds/drug-info/bevacizumab', null, cookie);
check('Drug info (bevacizumab)', r.data?.info?.brand === 'Avastin');

// ── CLINICAL ──
console.log('\n🏥 Clinical Features');
r = await api('POST', '/api/features/notes', { patientMrn: 'TEST001', noteType: 'soap', subjective: 'Headache', objective: 'Normal', assessment: 'GBM', plan: 'Continue TMZ' }, cookie);
check('Create SOAP note', r.data?.ok === true);
r = await api('GET', '/api/features/notes/TEST001', null, cookie);
check('List notes', r.data?.notes?.length > 0);
r = await api('GET', '/api/features/protocols', null, cookie);
check('Protocols seeded (>=4)', r.data?.protocols?.length >= 4);
r = await api('POST', '/api/features/outcomes', { patientMrn: 'TEST001', outcomeType: 'response', date: '2024-01-01', value: 'Partial' }, cookie);
check('Create outcome (valid)', r.data?.ok === true);
r = await api('POST', '/api/features/outcomes', { patientMrn: 'TEST001', outcomeType: 'INVALID', date: '2024-01-01', value: 'x' }, cookie);
check('Invalid outcome rejected (400)', r.status === 400);
r = await api('POST', '/api/features/adherence', { patientMrn: 'TEST001', medication: 'temozolomide', scheduledDate: '2024-01-15', status: 'taken' }, cookie);
check('Create adherence record', r.data?.ok === true);
r = await api('POST', '/api/features/chemo', { patientMrn: 'TEST001', protocolName: 'Stupp Protocol', startDate: '2024-01-01', totalCycles: 6 }, cookie);
check('Create chemo cycle', r.data?.ok === true);
r = await api('POST', '/api/features/referrals', { patientMrn: 'TEST001', toSpecialty: 'Radiation Oncology', reason: 'RT planning' }, cookie);
check('Create referral', r.data?.ok === true);
r = await api('GET', '/api/features/audit/TEST001', null, cookie);
check('Audit trail entries', r.data?.entries?.length > 0);
r = await api('GET', '/api/features/export/TEST001', null, cookie);
check('Patient data export', r.status === 200 && !r.data?.error);

// ── TELEHEALTH ──
console.log('\n📹 Telehealth');
r = await api('POST', '/api/telehealth/rooms', { patientMrn: 'TEST001' }, cookie);
check('Create room', r.data?.ok === true && !!r.data?.roomCode);
const roomCode = r.data?.roomCode;
r = await api('GET', '/api/telehealth/rooms', null, cookie);
check('List rooms', r.data?.rooms?.length > 0);
r = await api('POST', `/api/telehealth/rooms/${roomCode}/end`, null, cookie);
check('End room', r.data?.ok === true);

// ── TELEHEALTH AUTH (sync/th endpoints) ──
console.log('\n📹 Telehealth security');
r = await api('POST', '/api/sync/th/create-room', { patientMrn: '12345', doctorId: 'test-admin-doc' }, cookie);
check('Doctor creates th room', r.data?.ok === true && !!r.data?.roomCode);
const thCode = r.data?.roomCode;
r = await api('GET', `/api/sync/th/my-rooms/test-admin-doc/12345`, null, patCookie);
check('Patient sees own th room', r.data?.ok === true && r.data?.rooms?.some(x => x.id === thCode));
r = await api('GET', `/api/sync/th/my-rooms/test-admin-doc/99999`, null, patCookie);
check('Patient blocked from other MRN rooms (403)', r.status === 403);
r = await api('GET', `/api/sync/th/rooms/test-admin-doc`, null, null);
check('Unauthenticated room listing rejected (401)', r.status === 401);
r = await api('POST', '/api/sync/th/join-room', { roomCode: thCode }, patCookie);
check('Patient joins own room', r.data?.ok === true);
r = await api('POST', '/api/sync/th/signal', { roomCode: thCode, type: 'offer', data: { sdp: 'x' }, sender: 'patient' }, patCookie);
check('Signal post (participant)', r.data?.ok === true);
r = await api('GET', `/api/sync/th/signal/${thCode}?timeout=100`, null, null);
check('Unauthenticated signal read rejected (401)', r.status === 401);
r = await api('POST', '/api/sync/th/end-room', { roomCode: thCode }, cookie);
check('Doctor ends th room', r.data?.ok === true);

// ── FILE-STORE ROUTE SECURITY ──
console.log('\n🔒 File-store security');
r = await api('POST', '/api/sync/save-patient', { mrn: 'SECTEST1', patient: { name: 'Sec Test', dob: '2000-01-01', diag: 'x', docId: 'test-admin-doc', pass: 'pw12345678' } }, cookie);
check('Doctor saves patient (auth)', r.data?.ok === true);
r = await api('POST', '/api/sync/save-patient', { mrn: 'SECTEST2', patient: { name: 'Anon', dob: '2000-01-01', docId: 'x', pass: 'pw12345678' } }, null);
check('Unauthenticated save-patient rejected (401)', r.status === 401);
r = await api('GET', '/api/sync/get-appointments/12345', null, patCookie);
check('Patient reads own appointments', r.data?.ok === true);
r = await api('GET', '/api/sync/get-appointments/99999', null, patCookie);
check('Patient blocked from other MRN appointments (403)', r.status === 403);
r = await api('GET', '/api/sync/get-messages/test-admin-doc/12345', null, null);
check('Unauthenticated message read rejected (401)', r.status === 401);
r = await api('POST', '/api/sync/send-message', { mrn: '12345', docId: 'test-admin-doc', role: 'patient', text: 'hi' }, patCookie);
check('Patient sends message to own thread', r.data?.ok === true);
r = await api('POST', '/api/sync/delete-patient', { mrn: 'SECTEST1' }, patCookie);
check('Patient cannot delete patient records (403)', r.status === 403);
r = await api('POST', '/api/sync/delete-patient', { mrn: 'SECTEST1' }, cookie);
check('Doctor deletes patient record', r.data?.ok === true);

// ── BILLING ──
console.log('\n💰 Billing');
r = await api('POST', '/api/billing/invoices', { patientMrn: 'TEST001', items: [{ description: 'Office visit', unitPrice: 150, quantity: 1 }] }, cookie);
check('Create invoice (total 150)', r.data?.invoiceNumber && r.data?.total === 150);
r = await api('GET', '/api/billing/invoices?patientMrn=TEST001', null, cookie);
check('List invoices', Array.isArray(r.data) && r.data.length > 0);
r = await api('GET', '/api/billing/stats', null, cookie);
check('Billing stats', r.data?.totalRevenue !== undefined);
r = await api('GET', '/api/billing/codes/icd10?q=brain', null, cookie);
check('ICD-10 lookup', Array.isArray(r.data) && r.data.length > 0);
r = await api('GET', '/api/billing/codes/cpt?q=mri', null, cookie);
check('CPT lookup', Array.isArray(r.data) && r.data.length > 0);

// ── HL7 ──
console.log('\n🔬 HL7 Lab Interface');
const hl7Msg = 'MSH|^~\\&|LAB_SYSTEM|TEST_HOSP|VELTRUVIA|VELTRUVIA|20240115120000||ORU^R01|MSG001|P|2.5.1\rPID|1||MRN-99999^^^TEST_HOSP^MR||John Doe||19800101|M\rOBR|1||ORD001|CBC|||20240115|||||||20240115||||||||F\rOBX|1|NM|WBC^White Blood Cell||7.5|10*3/uL|4.0-11.0|||F|||20240115';
r = await api('POST', '/api/hl7/receive', { message: hl7Msg }, cookie);
check('Receive HL7 ORU (lab result stored)', r.data?.ok === true && r.data?.resultsStored > 0);
const adtMsg = 'MSH|^~\\&|ADT_SYSTEM|TEST_HOSP|VELTRUVIA|VELTRUVIA|20240115120000||ADT^A01|MSG002|P|2.5.1\rPID|1||MRN-88888^^^TEST_HOSP^MR||Jane Smith||19900515|F';
r = await api('POST', '/api/hl7/receive', { message: adtMsg }, cookie);
check('Receive HL7 ADT (patient)', r.data?.ok === true);
r = await api('GET', '/api/hl7/patient/MRN-88888', null, cookie);
check('Generate HL7 patient message', r.status === 200);

// ── FHIR ──
console.log('\n🔗 FHIR');
r = await api('GET', '/api/fhir/Patient/12345', null, cookie);
check('FHIR Patient resource', r.data?.resourceType === 'Patient');
r = await api('GET', '/api/fhir/Condition/12345', null, cookie);
check('FHIR Condition bundle', r.data?.resourceType === 'Bundle');
r = await api('GET', '/api/fhir/Bundle/TEST001', null, cookie);
check('FHIR full Bundle (TEST001 has entries)', r.data?.resourceType === 'Bundle' && r.data?.entry?.length > 0);

// ── HIPAA / REPORTS ──
console.log('\n🔒 HIPAA & Reports');
r = await api('GET', '/api/hipaa/retention', null, cookie);
check('Retention policies', Array.isArray(r.data));
r = await api('GET', '/api/reports/panel-health', null, cookie);
check('Panel health report', r.data?.totalPatients !== undefined);
r = await api('GET', '/api/reports/financial', null, cookie);
check('Financial report', r.data?.totalRevenue !== undefined);
r = await api('GET', '/api/reports/operational', null, cookie);
check('Operational report', r.data?.totalNotes !== undefined);
r = await api('GET', '/api/reports/quality', null, cookie);
check('Quality report', r.data?.measures?.length > 0);
r = await api('GET', '/api/reports/cancer-registry', null, cookie);
check('Cancer registry report', r.data?.totalPatients !== undefined);

// ── SECURITY / FRONTEND ──
console.log('\n🛡️ Security & Frontend');
r = await api('GET', '/api/nonexistent');
check('404 for unknown API route', r.status === 404);
r = await api('GET', '/health?deep=1');
check('Deep health (db ok)', r.data?.ok === true && r.data?.db === true);
r = await api('GET', '/api/health');
check('API health', r.data?.ok === true);
for (const p of ['/', '/patient.html', '/lab.html', '/admin.html', '/manifest.json']) {
  r = await fetch(base + p);
  check(`GET ${p}`, r.status === 200);
}
r = await fetch(base + '/icons/doctor-512.png');
check('Icon asset served (/icons/doctor-512.png)', r.status === 200 && (await r.arrayBuffer()).byteLength > 1000);

console.log(`\n═══════════════════════════════════════════════`);
console.log(`  ${appName}: ${pass} passed, ${fail} failed, ${pass + fail} total`);
console.log(`═══════════════════════════════════════════════`);

server.kill();
await new Promise(r => setTimeout(r, 800));
try { server.kill('SIGKILL'); } catch {}
for (const f of runtimeFiles) { try { rmSync(f); } catch {} }
process.exit(fail > 0 ? 1 : 0);
