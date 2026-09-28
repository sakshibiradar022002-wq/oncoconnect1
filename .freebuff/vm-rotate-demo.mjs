// Rotate demo patient/lab passwords on the VM in-place, using the app's own crypto.
// Usage: node vm-rotate-demo.mjs <newPatientPassword> <newLabPassword>
//   Env: OLD_PAT (default testpat123), OLD_LAB (default testlab123)
// Mirrors src/routes/sync.js hashUiPasswordV2 / verifyUiPassword exactly.
// Skips sub-keys (pat_subs_, pat_tokens_, lab_subs_, lab_tokens_, lab_pat_),
// same exclusions the login routes use. Verifies by re-read after writing.
import { createRequire } from 'node:module';
import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
const require = createRequire(import.meta.url);
require('dotenv').config({ path: new URL('./.env', import.meta.url).pathname });
const { db } = await import('./src/db/index.js').then(m => m);
const { decryptPHI, encryptPHI } = await import('./src/crypto.js').then(m => m);

const V2_ITERATIONS = 210000;
function hashUiPasswordV2(password) {
  const salt = randomBytes(16).toString('base64url');
  const hash = pbkdf2Sync(String(password), salt, V2_ITERATIONS, 32, 'sha256').toString('base64');
  return 'pbkdf2v2:' + V2_ITERATIONS + ':' + salt + ':' + hash;
}
function verifyUiPassword(password, stored) {
  if (!stored) return false;
  let expected = String(stored);
  if (!expected.startsWith('pbkdf2')) return expected === String(password);
  let actual = String(password);
  if (expected.startsWith('pbkdf2v2:')) {
    const parts = expected.split(':');
    const iterations = parseInt(parts[1], 10);
    const salt = parts[2], hash = parts[3];
    if (!salt || !hash || !iterations) return false;
    actual = pbkdf2Sync(actual, salt, iterations, 32, 'sha256').toString('base64');
    expected = hash;
  } else if (expected.startsWith('pbkdf2:')) {
    const parts = expected.split(':');
    const salt = parts[1], hash = parts[2];
    if (!salt || !hash) return false;
    actual = pbkdf2Sync(actual, salt, 100000, 32, 'sha256').toString('base64');
    expected = hash;
  }
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const NEW_PAT = process.argv[2];
const NEW_LAB = process.argv[3];
const OLD_PAT = process.env.OLD_PAT || 'testpat123';
const OLD_LAB = process.env.OLD_LAB || 'testlab123';
if (!NEW_PAT || !NEW_LAB) {
  console.error('usage: node vm-rotate-demo.mjs <newPatientPw> <newLabPw>');
  process.exit(2);
}

const rows = await db.prepare("SELECT owner_id, k, v_enc FROM kv_store WHERE k LIKE 'pat_%' OR k LIKE 'lab_%'").all();
let patDone = 0, labDone = 0, skipped = 0;

for (const r of rows) {
  // Same exclusions as the login routes: subs_/tokens_/pat_ sub-keys are not logins.
  const isPatient = /^pat_(?!subs_|tokens_|pat_)/.test(r.k);
  const isLabLogin = /^lab_(?!subs_|tokens_|pat_)/.test(r.k);
  if (!isPatient && !isLabLogin) { skipped++; continue; }
  let rec = null;
  try { rec = decryptPHI(r.v_enc); } catch (e) { skipped++; continue; }
  if (!rec || typeof rec !== 'object') { skipped++; continue; }

  if (isPatient && rec.mrn && rec.pass) {
    const oldOk = verifyUiPassword(OLD_PAT, rec.pass);
    const enc = encryptPHI(rec);
    console.log(r.k + ': v_enc_type=' + typeof r.v_enc + ' len=' + (r.v_enc && r.v_enc.length) +
      ' enc_type=' + typeof enc + ' enc_len=' + (enc && enc.length));
    rec.pass = hashUiPasswordV2(NEW_PAT);
    await db.prepare('UPDATE kv_store SET v_enc = ?, updated_at = ? WHERE owner_id = ? AND k = ?')
      .run(encryptPHI(rec), new Date().toISOString(), r.owner_id, r.k);
    const row2 = await db.prepare('SELECT v_enc FROM kv_store WHERE owner_id = ? AND k = ?').get(r.owner_id, r.k);
    if (!row2 || row2.v_enc === undefined || row2.v_enc === null) {
      console.log(r.k + ': UPDATE_MISS row2=' + JSON.stringify(row2));
      process.exitCode = 1; continue;
    }
    let after = null;
    try { after = decryptPHI(row2.v_enc); } catch (e) { console.log(r.k + ': DECRYPT_ERR ' + e.message); }
    if (!after) {
      console.log(r.k + ': DECRYPT_NULL after_type=' + typeof row2.v_enc + ' len=' + (row2.v_enc && row2.v_enc.length));
      process.exitCode = 1; continue;
    }
    const newOk = verifyUiPassword(NEW_PAT, after.pass);
    const oldRejected = !verifyUiPassword(OLD_PAT, after.pass);
    console.log(r.k + ': oldWasValid=' + oldOk + ' new_ok=' + newOk + ' old_rejected=' + oldRejected);
    if (newOk && oldRejected) patDone++; else process.exitCode = 1;
  } else if (isLabLogin && rec.username && rec.password) {
    const oldOk = verifyUiPassword(OLD_LAB, rec.password);
    rec.password = hashUiPasswordV2(NEW_LAB);
    await db.prepare('UPDATE kv_store SET v_enc = ?, updated_at = ? WHERE owner_id = ? AND k = ?')
      .run(encryptPHI(rec), new Date().toISOString(), r.owner_id, r.k);
    const row2 = await db.prepare('SELECT v_enc FROM kv_store WHERE owner_id = ? AND k = ?').get(r.owner_id, r.k);
    if (!row2 || !row2.v_enc) { console.log(r.k + ': UPDATE_MISS'); process.exitCode = 1; continue; }
    const after = decryptPHI(row2.v_enc);
    if (!after || !after.password) { console.log(r.k + ': DECRYPT_NULL'); process.exitCode = 1; continue; }
    const newOk = verifyUiPassword(NEW_LAB, after.password);
    const oldRejected = !verifyUiPassword(OLD_LAB, after.password);
    console.log(r.k + ' (' + rec.username + '): oldWasValid=' + oldOk + ' new_ok=' + newOk + ' old_rejected=' + oldRejected);
    if (newOk && oldRejected) labDone++; else process.exitCode = 1;
  } else {
    skipped++;
  }
}
console.log('DONE patients=' + patDone + ' labs=' + labDone + ' skipped=' + skipped);
process.exit(process.exitCode || 0);
