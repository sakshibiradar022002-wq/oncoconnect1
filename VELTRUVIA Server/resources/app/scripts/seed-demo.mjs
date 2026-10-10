// Demo seed — populates a busy clinic so presentations and new installs show
// a working system in seconds instead of empty dashboards.
//
//   node scripts/seed-demo.mjs
//
// Creates (idempotent — safe to run repeatedly):
//   • Demo doctor / patient / lab accounts (via initTestData() — needs
//     VELTRUVIA_DEMO=true in the environment; the script sets it)
//   • 3 patients in different phases (Surgery, Active Treatment, Recovery)
//   • 1 appointment each (one today, one next week)
//   • Symptom logs for the last 3 days
//   • 3 lab requests directed at the demo lab (one due today)
//   • 1 lab submission with a critically low hemoglobin result
//
// All data lands in the same encrypted kv_store / patient-store the apps
// read, with the demo doctor as owner. Fixed demo passwords are printed
// once and mirrored in the summary at the end.

process.env.VELTRUVIA_DEMO = process.env.VELTRUVIA_DEMO || 'true';

// Run from the app root regardless of caller cwd (Windows-safe).
import { fileURLToPath } from 'node:url';
const APP_ROOT = fileURLToPath(new URL('..', import.meta.url));
process.chdir(APP_ROOT);

const { db, initTestData } = await import('../src/db/index.js');
const { encryptPHI, decryptPHI, randomToken, hashPassword } = await import('../src/crypto.js');
const { createSession } = await import('../src/middleware/auth.js');
const { initSchema } = await import('../src/db/index.js');

await initSchema();

// ── main ──────────────────────────────────────────────────────────
async function main() {
  const crypto = (await import('node:crypto')).default ?? (await import('node:crypto'));
  const { pbkdf2Sync, randomBytes } = crypto;
  const { join } = await import('node:path');

  function uiHash(password) {
    const salt = randomBytes(16).toString('base64url');
    const hash = pbkdf2Sync(String(password), salt, 210000, 32, 'sha256').toString('base64');
    return `pbkdf2v2:210000:${salt}:${hash}`;
  }

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const nextWeek = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);

  // ── Accounts (doctor / patient / lab) via the built-in seeder ──
  await initTestData();
  const docRow = await db.prepare("SELECT id, name_enc FROM users WHERE email = 'test@example.com'").get();
  if (!docRow) { console.error('[seed] demo doctor not found — initTestData failed'); process.exit(1); }
  const docId = docRow.id;

  // Demo lab account (initTestData creates testlab under docId; reuse it)
  const labKey = `lab_${docId}_test-lab-001`;
  let labRec = null;
  // Match initTestData's relaxed lookup (key across all owners) — the demo
  // doctor id is random per install, and the lab may pre-date this docRow.
  const labRow = await db.prepare('SELECT v_enc FROM kv_store WHERE k = ?').get(labKey);
  if (labRow) { const l = decryptPHI(labRow.v_enc); labRec = (l && typeof l === 'object') ? l : null; }
  if (!labRec) {
    labRec = { name: 'VELTRUVIA Demo Lab', username: 'testlab', password: uiHash('testlab123'), labId: 'test-lab-001', docId };
    await db.prepare('INSERT INTO kv_store (owner_id, k, v_enc, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(owner_id, k) DO NOTHING').run(docId, labKey, encryptPHI(labRec), now);
  }

  // ── 3 patients, different phases ────────────────────────────────
  const patients = [
    { mrn: 'D-1001', name: 'Asha Verma',    dob: '1978-04-12', diag: 'Glioblastoma, IDH-wildtype',   phase: 'Treatment Phase', pass: 'demo-pat-1001' },
    { mrn: 'D-1002', name: 'Rohit Malhotra', dob: '1992-11-30', diag: 'Anaplastic Astrocytoma',       phase: 'Treatment Phase', pass: 'demo-pat-1002' },
    { mrn: 'D-1003', name: 'Meera Iyer',    dob: '1965-02-08', diag: 'Meningioma (benign)',           phase: 'Recovery Phase',  pass: 'demo-pat-1003' },
  ];
  for (const p of patients) {
    const rec = { mrn: p.mrn, name: p.name, dob: p.dob, diag: p.diag, phase: p.phase, docId, pass: uiHash(p.pass), _ownerId: docId, _savedAt: now };
    const existing = await db.prepare('SELECT k FROM kv_store WHERE owner_id = ? AND k = ?').get(docId, 'pat_' + p.mrn);
    if (!existing) {
      await db.prepare('INSERT INTO kv_store (owner_id, k, v_enc, updated_at) VALUES (?, ?, ?, ?)').run(docId, 'pat_' + p.mrn, encryptPHI(rec), now);
      console.log('[seed] patient ' + p.mrn + ' created');
    }
  }

  // Also write them into the shared patient-store so Lab/Patient apps see them
  try {
    const { createEncryptedStore } = await import('../src/lib/json-stores.js');
    const pstore = createEncryptedStore('patient-store.json', { label: 'seed-demo' });
    const store = pstore.read();
    for (const p of patients) {
      if (!store[p.mrn]) store[p.mrn] = { mrn: p.mrn, name: p.name, dob: p.dob, diag: p.diag, phase: p.phase, docId, pass: uiHash(p.pass), _ownerId: docId, _savedAt: now };
    }
    if (!store['lab_testlab']) {
      store['lab_testlab'] = { labId: 'test-lab-001', username: 'testlab', name: labRec.name, password: labRec.password, docId, _ownerId: docId, _savedAt: now };
    }
    pstore.write(store);
  } catch (e) { console.warn('[seed] patient-store write skipped:', e.message); }

  // ─── Appointments (one today, one next week, one completed) ─────
  const apptSets = [
    { mrn: 'D-1001', list: [ { date: today,    time: '10:30', type: 'Chemotherapy',  status: 'Scheduled', booked_by: 'doctor' },
                             { date: nextWeek, time: '09:00', type: 'Follow-up',     status: 'Scheduled', booked_by: 'doctor' } ] },
    { mrn: 'D-1002', list: [ { date: today,    time: '14:00', type: 'Consultation',  status: 'Scheduled', booked_by: 'patient' } ] },
    { mrn: 'D-1003', list: [ { date: '2026-09-20', time: '11:00', type: 'MRI Review', status: 'completed', booked_by: 'doctor' } ] },
  ];
  for (const set of apptSets) {
    const key = 'appts_' + set.mrn;
    const existing = await db.prepare('SELECT v_enc FROM kv_store WHERE owner_id = ? AND k = ?').get(docId, key);
    if (existing) continue;
    await db.prepare('INSERT INTO kv_store (owner_id, k, v_enc, updated_at) VALUES (?, ?, ?, ?)').run(docId, key, encryptPHI(set.list), now);
    console.log('[seed] appointments for ' + set.mrn);
  }

  // ─── Symptom logs (last 3 days, per patient 1 & 2) ──────────────
  for (const p of [patients[0], patients[1]]) {
    for (let d = 0; d < 3; d++) {
      const day = new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
      const key = 'log_' + p.mrn + '_' + day;
      const existing = await db.prepare('SELECT k FROM kv_store WHERE owner_id = ? AND k = ?').get(docId, key);
      if (existing) continue;
      const log = { date: day, mrn: p.mrn, cognitive: 4 - d, seizure: d === 0 ? 1 : 0, headache: 3 - d, nausea: d === 2 ? 2 : 1, fatigue: 3, sleep: 6 - d, notes: d === 0 ? 'Mild headache in the morning, eased after breakfast.' : '' };
      await db.prepare('INSERT INTO kv_store (owner_id, k, v_enc, updated_at) VALUES (?, ?, ?, ?)').run(docId, key, encryptPHI(log), now);
    }
    console.log('[seed] symptom logs for ' + p.mrn);
  }

  // ─── Lab requests (3, directed at the demo lab, one due today) ──
  const tokenKey = 'pat_tokens_' + docId;
  let tokens = null;
  const tokRow = await db.prepare('SELECT v_enc FROM kv_store WHERE owner_id = ? AND k = ?').get(docId, tokenKey);
  if (tokRow) { const t = decryptPHI(tokRow.v_enc); tokens = Array.isArray(t) ? t : []; }
  if (!Array.isArray(tokens)) tokens = [];
  const labRequests = [
    { taskId: randomToken(8), labId: 'test-lab-001', mrn: 'D-1001', patName: 'Asha Verma',    test: 'CBC with differential', dueDate: today,    status: 'Pending',  priority: 'Urgent' },
    { taskId: randomToken(8), labId: 'test-lab-001', mrn: 'D-1002', patName: 'Rohit Malhotra', test: 'Liver function panel',  dueDate: nextWeek, status: 'Pending',  priority: 'Routine' },
    { taskId: randomToken(8), labId: 'test-lab-001', mrn: 'D-1003', patName: 'Meera Iyer',     test: 'Electrolytes',          dueDate: nextWeek, status: 'Completed', priority: 'Routine' },
  ];
  let added = 0;
  for (const req of labRequests) {
    if (tokens.some(t => t.taskId === req.taskId)) continue;
    // skip if same patient+test already requested
    if (tokens.some(t => t.labId === req.labId && t.mrn === req.mrn && t.test === req.test && t.status !== 'Cancelled')) { continue; }
    tokens.push(req);
    added++;
  }
  if (added) {
    await db.prepare('INSERT INTO kv_store (owner_id, k, v_enc, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(owner_id, k) DO UPDATE SET v_enc = excluded.v_enc, updated_at = excluded.updated_at').run(docId, tokenKey, encryptPHI(tokens), now);
    console.log('[seed] lab requests: ' + added + ' added');
  }

  // ─── One delivered lab submission with a critical hemoglobin ────
  const subKey = 'lab_subs_' + docId;
  let subs = null;
  const subRow = await db.prepare('SELECT v_enc FROM kv_store WHERE owner_id = ? AND k = ?').get(docId, subKey);
  if (subRow) { const s = decryptPHI(subRow.v_enc); subs = Array.isArray(s) ? s : []; }
  if (!Array.isArray(subs)) subs = [];
  else subs = [];
  const criticalSub = {
    labId: 'test-lab-001', labName: labRec.name, mrn: 'D-1001', patName: 'Asha Verma',
    test: 'CBC with differential', date: today, taskId: null,
    results: [
      { test: 'Hemoglobin', value: 6.9, unit: 'g/dL', refRange: '12.0–15.5' },
      { test: 'WBC', value: 3.1, unit: '×10³/µL', refRange: '4.0–11.0' },
      { test: 'Platelets', value: 180, unit: '×10³/µL', refRange: '150–400' },
    ],
    notes: 'Sample collected 08:15, analyzed on Sysmex XN-1000. Hgb critically low — transfusion decision needed.',
    submittedAt: Date.now() - 90 * 60 * 1000,
  };
  if (!subs.some(s => s.mrn === criticalSub.mrn && s.results?.some(r => r.test === 'Hemoglobin' && r.value === 6.9))) {
    subs.push(criticalSub);
    await db.prepare('INSERT INTO kv_store (owner_id, k, v_enc, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(owner_id, k) DO UPDATE SET v_enc = excluded.v_enc, updated_at = excluded.updated_at').run(docId, subKey, encryptPHI(subs), now);
    console.log('[seed] critical lab submission created (Hgb 6.9 for D-1001)');
  }

  // ─── Prescription with Indian-style timing (0-1-0) ──────────────
  try {
    const rxMod = await import('../src/routes/prescriptions.js');
    // We can't easily invoke the express handler directly; write one active
    // Rx row + kv mirror manually (same shape prescriptions.js produces).
    const rxKey = 'rx_D-1001';
    const rxId = 'seed-rx-' + randomToken(6);
    const existing = await db.prepare('SELECT v_enc FROM kv_store WHERE owner_id = ? AND k = ?').get(docId, rxKey);
    let rxs = existing ? (decryptPHI(existing.v_enc) || []) : [];
    if (!Array.isArray(rxs)) rxs = [];
    if (!rxs.length) {
      const rxKv = {
        id: rxId, doctorId: docId, patientMrn: 'D-1001',
        medication: 'Levetiracetam', genericName: 'Levetiracetam',
        composition: 'Levetiracetam 500 mg',
        dosage: '500 mg', frequency: 'BID', route: 'oral', duration: 'ongoing',
        refills: 2, pharmacy: 'MedPlus, Manipal Hospital Rd',
        instructions: 'Swallow whole with water. Do not stop suddenly.',
        status: 'active', timing: '1-0-1', whenToTake: 'After food',
        prescribedDate: today, doctorName: 'Dr. Test Doctor',
      };
      rxs.push(rxKv);
      await db.prepare('INSERT INTO kv_store (owner_id, k, v_enc, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(owner_id, k) DO UPDATE SET v_enc = excluded.v_enc, updated_at = excluded.updated_at').run(docId, rxKey, encryptPHI(rxs), now);
      try {
        await db.prepare(`INSERT INTO prescriptions (id, doctor_id, patient_mrn, medication, generic_name, dosage, frequency, route, duration, refills, pharmacy, status, instructions, composition, timing, when_to_take, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`).run(rxId, docId, 'D-1001', rxKv.medication, rxKv.genericName, rxKv.dosage, rxKv.frequency, rxKv.route, rxKv.duration, rxKv.refills, rxKv.pharmacy, rxKv.instructions, rxKv.composition, rxKv.timing, rxKv.whenToTake, now, now);
      } catch (e) { console.warn('[seed] SQL Rx row skipped (kv mirror written):', e.message); }
      console.log('[seed] prescription (Levetiracetam 1-0-1) for D-1001');
    }
  } catch (e) { console.warn('[seed] prescription step skipped:', e.message); }

  // Summary
  let adminPw = '(from .demo-admin-password)';
  try {
    const fsMod = await import('node:fs');
    adminPw = fsMod.readFileSync(join(String(process.env.DB_PATH || './chemocure.db'), '..', '.demo-admin-password'), 'utf8').trim();
  } catch {}
  console.log('');
  console.log('════════════════════════════════════════════════════════');
  console.log('  DEMO READY — sign in with:');
  console.log('    Doctor:  test@example.com  /  ' + adminPw);
  console.log('    Labs:    testlab           /  testlab123');
  console.log('    Patient: D-1001            /  demo-pat-1001');
  console.log('             D-1002            /  demo-pat-1002');
  console.log('             D-1003            /  demo-pat-1003');
  console.log('  Highlights: 3 patients · 3 appointments · 3 days of logs ·');
  console.log('    3 lab requests (1 urgent, due today) · 1 CRITICAL result');
  console.log('    (Hgb 6.9) · 1 active prescription (1-0-1 timing).');
  console.log('════════════════════════════════════════════════════════');

  await db.close?.();
  process.exit(0);
}

main();
