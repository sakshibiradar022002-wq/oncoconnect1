// ═══════════════════════════════════════════════════════════════════════
// CLINICAL FEATURES — Audit, Safety, Adherence, Protocols, Notes, etc.
// ═══════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { z } from 'zod';
import { db, writeAudit } from '../db/index.js';
import { encryptPHI, decryptPHI, randomToken } from '../crypto.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate, asyncHandler } from '../middleware/validate.js';
import { notifySubject } from '../push.js';
import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

export const clinicalFeaturesRouter = Router();
clinicalFeaturesRouter.use(authenticate);

// High-risk chemotherapy drugs requiring TOTP confirmation
const HIGH_RISK_DRUGS = [
  'temozolomide', 'bevacizumab', 'carboplatin', 'lomustine', 'procarbazine',
  'carmustine', 'irinotecan', 'oxaliplatin', 'cisplatin', 'pemetrexed',
  'vincristine', 'methotrexate', 'etoposide', 'doxorubicin', 'paclitaxel',
  'docetaxel', 'cyclophosphamide', 'ifosfamide', 'bendamustine', 'talazoparib',
];

// ═══════════════════════════════════════════════════════════════════
// 1. CLINICAL AUDIT TRAIL
// ═══════════════════════════════════════════════════════════════════

function writeClinicalAudit({ doctorId, patientMrn, action, category, targetId, detail, ip }) {
  return db.prepare(
    'INSERT INTO clinical_audit_log (id, doctor_id, patient_mrn, action, category, target_id, detail_enc, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(randomToken(12), doctorId, patientMrn, action, category, targetId || null, detail ? encryptPHI(detail) : null, ip || null, new Date().toISOString());
}

// Get audit log for a patient
clinicalFeaturesRouter.get('/audit/:mrn', requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  const mrn = req.params.mrn.toUpperCase();
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const category = req.query.category;

  let query = 'SELECT * FROM clinical_audit_log WHERE patient_mrn = ?';
  const params = [mrn];
  if (category) { query += ' AND category = ?'; params.push(category); }
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const rows = await db.prepare(query).all(...params);
  const total = await db.prepare(`SELECT COUNT(*) as c FROM clinical_audit_log WHERE patient_mrn = ?${category ? ' AND category = ?' : ''}`).get(...(category ? [mrn, category] : [mrn]));

  // Decrypt details for display
  const entries = rows.map(r => ({
    ...r,
    detail: r.detail_enc ? decryptPHI(r.detail_enc) : null,
    detail_enc: undefined,
  }));

  res.json({ ok: true, entries, total: total.c, limit, offset });
}));

// Get doctor's own audit activity
clinicalFeaturesRouter.get('/audit', requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const days = parseInt(req.query.days) || 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const rows = await db.prepare(
    'SELECT * FROM clinical_audit_log WHERE doctor_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT ?'
  ).all(req.auth.subjectId, since, limit);

  const entries = rows.map(r => ({
    ...r,
    detail: r.detail_enc ? decryptPHI(r.detail_enc) : null,
    detail_enc: undefined,
  }));

  res.json({ ok: true, entries });
}));

// ═══════════════════════════════════════════════════════════════════
// 2. HIGH-RISK DRUG TOTP CONFIRMATION
// ═══════════════════════════════════════════════════════════════════

// Generate TOTP code for a high-risk prescription
clinicalFeaturesRouter.post('/rx-totp/generate', requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  const { prescriptionId, patientMrn, medication } = req.body;
  if (!prescriptionId || !patientMrn || !medication) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const medLower = medication.toLowerCase().trim();
  const isHighRisk = HIGH_RISK_DRUGS.some(d => medLower.includes(d));
  if (!isHighRisk) {
    return res.json({ ok: true, required: false, message: 'Drug is not on the high-risk list' });
  }

  // Generate 6-digit TOTP code
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const codeHash = pbkdf2Sync(code, 'veltruvia-totp', 10000, 32, 'sha256').toString('hex');
  const id = randomToken(16);
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 min expiry

  await db.prepare(
    'INSERT INTO rx_totp_confirmations (id, doctor_id, prescription_id, patient_mrn, medication, totp_code, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.auth.subjectId, prescriptionId, patientMrn, medLower, codeHash, 'pending', now, expires);

  // In production, this would be sent via email/SMS. For now, return it.
  res.json({
    ok: true, required: true,
    confirmationId: id,
    code, // In production: send via email, not return in response
    expiresIn: 300,
    message: `⚠️ ${medication} is a high-risk chemotherapy agent. A 6-digit confirmation code has been generated.`,
  });
}));

// Confirm TOTP for a prescription
clinicalFeaturesRouter.post('/rx-totp/confirm', requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  const { confirmationId, code } = req.body;
  if (!confirmationId || !code) {
    return res.status(400).json({ error: 'Missing confirmation ID or code' });
  }

  const row = await db.prepare(
    "SELECT * FROM rx_totp_confirmations WHERE id = ? AND doctor_id = ? AND status = 'pending'"
  ).get(confirmationId, req.auth.subjectId);

  if (!row) return res.status(404).json({ error: 'Confirmation not found or already used' });
  if (new Date(row.expires_at) < new Date()) {
    await db.prepare("UPDATE rx_totp_confirmations SET status = 'expired' WHERE id = ?").run(confirmationId);
    return res.status(400).json({ error: 'Code expired. Please regenerate.' });
  }

  const inputHash = pbkdf2Sync(code, 'veltruvia-totp', 10000, 32, 'sha256').toString('hex');
  const match = timingSafeEqual(Buffer.from(inputHash, 'hex'), Buffer.from(row.totp_code, 'hex'));

  if (!match) return res.status(400).json({ error: 'Invalid code' });

  await db.prepare(
    "UPDATE rx_totp_confirmations SET status = 'confirmed', confirmed_at = ? WHERE id = ?"
  ).run(new Date().toISOString(), confirmationId);

  writeClinicalAudit({
    doctorId: req.auth.subjectId, patientMrn: row.patient_mrn,
    action: 'rx.totp_confirmed', category: 'prescription',
    targetId: row.prescription_id, detail: { medication: row.medication }, ip: req.ip,
  });

  res.json({ ok: true, message: '✅ High-risk prescription confirmed' });
}));

// Check if drug requires TOTP
clinicalFeaturesRouter.post('/rx-totp/check', requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  const { medication } = req.body;
  const medLower = (medication || '').toLowerCase().trim();
  const isHighRisk = HIGH_RISK_DRUGS.some(d => medLower.includes(d));
  res.json({ ok: true, requiresTotp: isHighRisk, highRiskDrugs: isHighRisk ? HIGH_RISK_DRUGS : undefined });
}));

// ═══════════════════════════════════════════════════════════════════
// 3. PATIENT MEDICATION ADHERENCE
// ═══════════════════════════════════════════════════════════════════

// Get adherence for a patient
clinicalFeaturesRouter.get('/adherence/:mrn', requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  const mrn = req.params.mrn.toUpperCase();
  const days = parseInt(req.query.days) || 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const rows = await db.prepare(
    'SELECT * FROM medication_adherence WHERE patient_mrn = ? AND scheduled_date >= ? ORDER BY scheduled_date DESC, scheduled_time DESC'
  ).all(mrn, since);

  // Calculate adherence stats
  const total = rows.length;
  const taken = rows.filter(r => r.status === 'taken').length;
  const missed = rows.filter(r => r.status === 'missed').length;
  const late = rows.filter(r => r.status === 'late').length;
  const adherenceRate = total > 0 ? Math.round(((taken + late) / total) * 100) : 0;

  // Group by medication
  const byMed = {};
  rows.forEach(r => {
    if (!byMed[r.medication]) byMed[r.medication] = { total: 0, taken: 0, missed: 0, late: 0 };
    byMed[r.medication].total++;
    if (r.status === 'taken') byMed[r.medication].taken++;
    if (r.status === 'missed') byMed[r.medication].missed++;
    if (r.status === 'late') byMed[r.medication].late++;
  });

  res.json({ ok: true, entries: rows, stats: { total, taken, missed, late, adherenceRate, byMed } });
}));

// Create adherence entry (patient or doctor)
clinicalFeaturesRouter.post('/adherence', asyncHandler(async (req, res) => {
  const { patientMrn, prescriptionId, medication, scheduledDate, scheduledTime, status, notes } = req.body;
  if (!patientMrn || !medication || !scheduledDate) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const id = randomToken(16);
  const now = new Date().toISOString();
  const takenAt = status === 'taken' ? now : null;

  await db.prepare(
    'INSERT INTO medication_adherence (id, patient_mrn, prescription_id, medication, scheduled_date, scheduled_time, status, taken_at, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, patientMrn, prescriptionId || null, medication, scheduledDate, scheduledTime || null, status || 'pending', takenAt, notes || null, now);

  res.status(201).json({ ok: true, id });
}));

// Update adherence status
clinicalFeaturesRouter.patch('/adherence/:id', asyncHandler(async (req, res) => {
  const { status, notes } = req.body;
  const updates = [];
  const params = [];
  if (status) { updates.push('status = ?'); params.push(status); }
  if (status === 'taken') { updates.push('taken_at = ?'); params.push(new Date().toISOString()); }
  if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
  if (!updates.length) return res.json({ ok: true });

  params.push(req.params.id);
  await db.prepare(`UPDATE medication_adherence SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true });
}));

// Bulk create adherence schedule for a prescription
clinicalFeaturesRouter.post('/adherence/schedule', requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  const { patientMrn, prescriptionId, medication, startDate, endDate, times } = req.body;
  if (!patientMrn || !medication || !startDate || !endDate || !times?.length) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  let count = 0;

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    for (const time of times) {
      const id = randomToken(16);
      await db.prepare(
        'INSERT OR IGNORE INTO medication_adherence (id, patient_mrn, prescription_id, medication, scheduled_date, scheduled_time, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(id, patientMrn, prescriptionId || null, medication, dateStr, time, 'pending', new Date().toISOString());
      count++;
    }
  }

  res.json({ ok: true, scheduled: count });
}));

// ═══════════════════════════════════════════════════════════════════
// 4. CHEMOTHERAPY CYCLE TRACKER
// ═══════════════════════════════════════════════════════════════════

clinicalFeaturesRouter.get('/chemo/:mrn', requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  const mrn = req.params.mrn.toUpperCase();
  const rows = await db.prepare(
    'SELECT * FROM chemo_cycles WHERE patient_mrn = ? ORDER BY created_at DESC'
  ).all(mrn);
  res.json({ ok: true, cycles: rows });
}));

clinicalFeaturesRouter.post('/chemo', requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  const { patientMrn, protocolName, regimen, totalCycles, cycleLengthDays, startDate, notes } = req.body;
  if (!patientMrn || !protocolName || !startDate) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const id = randomToken(16);
  const now = new Date().toISOString();
  const nextDate = new Date(new Date(startDate).getTime() + (cycleLengthDays || 28) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  await db.prepare(
    'INSERT INTO chemo_cycles (id, doctor_id, patient_mrn, protocol_name, regimen, total_cycles, current_cycle, cycle_length_days, start_date, next_cycle_date, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.auth.subjectId, patientMrn, protocolName, regimen || null, totalCycles || 6, 1, cycleLengthDays || 28, startDate, nextDate, 'active', notes || null, now, now);

  writeClinicalAudit({
    doctorId: req.auth.subjectId, patientMrn,
    action: 'chemo.start', category: 'prescription',
    targetId: id, detail: { protocol: protocolName, cycles: totalCycles }, ip: req.ip,
  });

  res.status(201).json({ ok: true, id, nextCycleDate: nextDate });
}));

clinicalFeaturesRouter.patch('/chemo/:id', requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  const { currentCycle, status, doseModifications, cumulativeTox, notes } = req.body;
  const updates = ['updated_at = ?'];
  const params = [new Date().toISOString()];

  if (currentCycle !== undefined) { updates.push('current_cycle = ?'); params.push(currentCycle); }
  if (status) { updates.push('status = ?'); params.push(status); }
  if (doseModifications !== undefined) { updates.push('dose_modifications = ?'); params.push(typeof doseModifications === 'string' ? doseModifications : JSON.stringify(doseModifications)); }
  if (cumulativeTox !== undefined) { updates.push('cumulative_tox = ?'); params.push(typeof cumulativeTox === 'string' ? cumulativeTox : JSON.stringify(cumulativeTox)); }
  if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }

  params.push(req.params.id);
  await db.prepare(`UPDATE chemo_cycles SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  writeClinicalAudit({
    doctorId: req.auth.subjectId, patientMrn: req.body.patientMrn || '',
    action: 'chemo.update', category: 'prescription',
    targetId: req.params.id, detail: req.body, ip: req.ip,
  });

  res.json({ ok: true });
}));

// ═══════════════════════════════════════════════════════════════════
// 5. CLINICAL NOTES (SOAP + Templates)
// ═══════════════════════════════════════════════════════════════════

const NOTE_TEMPLATES = {
  progress: { name: 'Progress Note', subjective: '', objective: '', assessment: '', plan: '' },
  soap: { name: 'SOAP Note', subjective: '', objective: '', assessment: '', plan: '' },
  procedure: { name: 'Procedure Note', subjective: 'Procedure: \nIndication: \n', objective: 'Findings: \n', assessment: 'Procedure performed successfully. ', plan: 'Post-procedure: \n' },
  discharge: { name: 'Discharge Summary', subjective: 'Admission diagnosis: \nHospital course: \n', objective: 'Final diagnosis: \nDischarge condition: \n', assessment: 'Summary: ', plan: 'Discharge medications: \nFollow-up: \n' },
  consult: { name: 'Consultation Note', subjective: 'Reason for consult: \n', objective: 'History: \nExamination: \n', assessment: 'Impression: ', plan: 'Recommendations: \n' },
};

clinicalFeaturesRouter.get('/notes/templates', requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  res.json({ ok: true, templates: NOTE_TEMPLATES });
}));

clinicalFeaturesRouter.get('/notes/:mrn', requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  const mrn = req.params.mrn.toUpperCase();
  const type = req.query.type;
  let query = 'SELECT * FROM clinical_notes WHERE patient_mrn = ?';
  const params = [mrn];
  if (type) { query += ' AND note_type = ?'; params.push(type); }
  query += ' ORDER BY created_at DESC LIMIT 100';

  const rows = await db.prepare(query).all(...params);
  res.json({ ok: true, notes: rows });
}));

clinicalFeaturesRouter.post('/notes', requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  const { patientMrn, noteType, subjective, objective, assessment, plan, freeText, templateName } = req.body;
  if (!patientMrn) return res.status(400).json({ error: 'Patient MRN required' });

  const id = randomToken(16);
  const now = new Date().toISOString();

  await db.prepare(
    'INSERT INTO clinical_notes (id, doctor_id, patient_mrn, note_type, subjective, objective, assessment, plan, free_text, template_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.auth.subjectId, patientMrn, noteType || 'progress', subjective || null, objective || null, assessment || null, plan || null, freeText || null, templateName || null, now, now);

  writeClinicalAudit({
    doctorId: req.auth.subjectId, patientMrn,
    action: 'note.create', category: 'clinical_note',
    targetId: id, detail: { type: noteType || 'progress', template: templateName }, ip: req.ip,
  });

  res.status(201).json({ ok: true, id });
}));

clinicalFeaturesRouter.patch('/notes/:id', requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  const { subjective, objective, assessment, plan, freeText, signed } = req.body;
  const updates = ['updated_at = ?'];
  const params = [new Date().toISOString()];

  if (subjective !== undefined) { updates.push('subjective = ?'); params.push(subjective); }
  if (objective !== undefined) { updates.push('objective = ?'); params.push(objective); }
  if (assessment !== undefined) { updates.push('assessment = ?'); params.push(assessment); }
  if (plan !== undefined) { updates.push('plan = ?'); params.push(plan); }
  if (freeText !== undefined) { updates.push('free_text = ?'); params.push(freeText); }
  if (signed) { updates.push('signed = 1'); updates.push('signed_at = ?'); params.push(new Date().toISOString()); }

  params.push(req.params.id);
  await db.prepare(`UPDATE clinical_notes SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true });
}));

clinicalFeaturesRouter.delete('/notes/:id', requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  await db.prepare('DELETE FROM clinical_notes WHERE id = ? AND doctor_id = ?').run(req.params.id, req.auth.subjectId);
  res.json({ ok: true });
}));

// ═══════════════════════════════════════════════════════════════════
// 6. REFERRAL MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

clinicalFeaturesRouter.get('/referrals/:mrn', requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  const mrn = req.params.mrn.toUpperCase();
  const rows = await db.prepare(
    'SELECT * FROM referrals WHERE patient_mrn = ? ORDER BY created_at DESC'
  ).all(mrn);
  res.json({ ok: true, referrals: rows });
}));

clinicalFeaturesRouter.post('/referrals', requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  const { patientMrn, toSpecialty, toProvider, reason, urgency, clinicalSummary, notes } = req.body;
  if (!patientMrn || !toSpecialty || !reason) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const id = randomToken(16);
  const now = new Date().toISOString();

  await db.prepare(
    'INSERT INTO referrals (id, doctor_id, patient_mrn, to_specialty, to_provider, reason, urgency, status, clinical_summary, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.auth.subjectId, patientMrn, toSpecialty, toProvider || null, reason, urgency || 'routine', 'pending', clinicalSummary || null, notes || null, now, now);

  writeClinicalAudit({
    doctorId: req.auth.subjectId, patientMrn,
    action: 'referral.create', category: 'referral',
    targetId: id, detail: { specialty: toSpecialty, urgency }, ip: req.ip,
  });

  res.status(201).json({ ok: true, id });
}));

clinicalFeaturesRouter.patch('/referrals/:id', requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  const { status, notes } = req.body;
  const updates = ['updated_at = ?'];
  const params = [new Date().toISOString()];
  if (status) { updates.push('status = ?'); params.push(status); }
  if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
  params.push(req.params.id);
  await db.prepare(`UPDATE referrals SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true });
}));

// ═══════════════════════════════════════════════════════════════════
// 7. TREATMENT PROTOCOL TEMPLATES
// ═══════════════════════════════════════════════════════════════════

clinicalFeaturesRouter.get('/protocols', requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  const rows = await db.prepare('SELECT * FROM treatment_protocols ORDER BY name').all();
  res.json({ ok: true, protocols: rows });
}));

clinicalFeaturesRouter.post('/protocols', requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  const { name, category, description, drugs, cycles, cycleLength, indications, contraindications } = req.body;
  if (!name || !category || !description || !drugs) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const id = randomToken(16);
  await db.prepare(
    'INSERT INTO treatment_protocols (id, name, category, description, drugs, cycles, cycle_length, indications, contraindications, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, name, category, description, typeof drugs === 'string' ? drugs : JSON.stringify(drugs), cycles || null, cycleLength || null, indications ? JSON.stringify(indications) : null, contraindications ? JSON.stringify(contraindications) : null, req.auth.subjectId, new Date().toISOString());
  res.status(201).json({ ok: true, id });
}));

// Seed built-in protocols
async function seedProtocols() {
  const count = await db.prepare('SELECT COUNT(*) as n FROM treatment_protocols').get();
  if (count.n > 0) return;

  const protocols = [
    {
      name: 'Stupp Protocol (GBM)', category: 'combined',
      description: 'Standard of care for newly diagnosed glioblastoma: concurrent temozolomide + RT, then adjuvant TMZ.',
      drugs: JSON.stringify([
        { name: 'Temozolomide', dose: '75 mg/m²', frequency: 'Daily during RT', route: 'oral', duration: '42 days concurrent' },
        { name: 'RT', dose: '60 Gy / 30 fractions', frequency: 'Daily Mon-Fri', route: 'radiation', duration: '6 weeks' },
        { name: 'Temozolomide (adjuvant)', dose: '150-200 mg/m²', frequency: 'Days 1-5 of 28-day cycle', route: 'oral', duration: '6 cycles' },
      ]),
      cycles: 6, cycleLength: 28,
      indications: JSON.stringify(['Glioblastoma (IDH-wildtype)', 'GBM Grade IV']),
      contraindications: JSON.stringify(['ANC < 1.5', 'Platelets < 100', 'Severe hepatic impairment']),
    },
    {
      name: 'PCV Regimen', category: 'chemo',
      description: 'Procarbazine, CCNU, Vincristine — for oligodendrogliomas and low-grade gliomas.',
      drugs: JSON.stringify([
        { name: 'Procarbazine', dose: '60 mg/m²', frequency: 'Days 8-21', route: 'oral', duration: '28-day cycle' },
        { name: 'Lomustine (CCNU)', dose: '110 mg/m²', frequency: 'Day 1', route: 'oral', duration: 'every 8 weeks' },
        { name: 'Vincristine', dose: '1.4 mg/m² (max 2mg)', frequency: 'Days 8 & 29', route: 'IV', duration: '6-12 cycles' },
      ]),
      cycles: 12, cycleLength: 42,
      indications: JSON.stringify(['Oligodendroglioma', 'Low-grade glioma', 'Anaplastic oligodendroglioma']),
      contraindications: JSON.stringify(['MAO inhibitors', 'Live vaccines', 'Severe myelosuppression']),
    },
    {
      name: 'Bevacizumab + Irinotecan', category: 'chemo',
      description: 'Anti-VEGF + topoisomerase inhibitor for recurrent GBM.',
      drugs: JSON.stringify([
        { name: 'Bevacizumab', dose: '10 mg/kg', frequency: 'Every 2 weeks', route: 'IV', duration: 'until progression' },
        { name: 'Irinotecan', dose: '125 mg/m²', frequency: 'Every 2 weeks', route: 'IV', duration: 'until progression' },
      ]),
      cycles: null, cycleLength: 14,
      indications: JSON.stringify(['Recurrent glioblastoma', 'Progressive high-grade glioma']),
      contraindications: JSON.stringify(['GI perforation', 'Recent hemorrhage', 'Wound healing issues']),
    },
    {
      name: 'Temozolomide Monotherapy (HGG)', category: 'chemo',
      description: 'Dose-dense temozolomide for recurrent high-grade gliomas.',
      drugs: JSON.stringify([
        { name: 'Temozolomide', dose: '150-200 mg/m²', frequency: 'Days 1-5 of 28-day cycle', route: 'oral', duration: '6-12 cycles' },
      ]),
      cycles: 12, cycleLength: 28,
      indications: JSON.stringify(['Recurrent high-grade glioma', 'Progressive astrocytoma']),
      contraindications: JSON.stringify(['ANC < 1.5', 'Platelets < 100']),
    },
  ];

  const now = new Date().toISOString();
  for (const p of protocols) {
    await db.prepare(
      'INSERT INTO treatment_protocols (id, name, category, description, drugs, cycles, cycle_length, indications, contraindications, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(randomToken(12), p.name, p.category, p.description, p.drugs, p.cycles, p.cycleLength, p.indications, p.contraindications, now);
  }
  console.log('[features] Seeded', protocols.length, 'treatment protocols');
}

// ═══════════════════════════════════════════════════════════════════
// 8. DOCUMENT UPLOAD
// ═══════════════════════════════════════════════════════════════════

clinicalFeaturesRouter.get('/documents/:mrn', requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  const mrn = req.params.mrn.toUpperCase();
  const rows = await db.prepare(
    'SELECT id, doctor_id, patient_mrn, doc_type, filename, content_type, file_size, description, created_at FROM patient_documents WHERE patient_mrn = ? ORDER BY created_at DESC'
  ).all(mrn);
  res.json({ ok: true, documents: rows });
}));

clinicalFeaturesRouter.post('/documents', requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  const { patientMrn, docType, filename, contentType, contentB64, description } = req.body;
  if (!patientMrn || !filename || !contentB64) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const id = randomToken(16);
  const now = new Date().toISOString();
  const fileSize = Math.round((contentB64.length * 3) / 4); // approximate decoded size

  await db.prepare(
    'INSERT INTO patient_documents (id, doctor_id, patient_mrn, doc_type, filename, content_type, file_size, content_b64, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.auth.subjectId, patientMrn, docType || 'other', filename, contentType || null, fileSize, contentB64, description || null, now);

  writeClinicalAudit({
    doctorId: req.auth.subjectId, patientMrn,
    action: 'document.upload', category: 'imaging',
    targetId: id, detail: { filename, type: docType }, ip: req.ip,
  });

  res.status(201).json({ ok: true, id, filename, fileSize });
}));

clinicalFeaturesRouter.get('/documents/:id/download', requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  const row = await db.prepare(
    'SELECT * FROM patient_documents WHERE id = ? AND doctor_id = ?'
  ).get(req.params.id, req.auth.subjectId);
  if (!row) return res.status(404).json({ error: 'Document not found' });
  res.json({ ok: true, document: row });
}));

clinicalFeaturesRouter.delete('/documents/:id', requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  await db.prepare('DELETE FROM patient_documents WHERE id = ? AND doctor_id = ?').run(req.params.id, req.auth.subjectId);
  res.json({ ok: true });
}));

// ═══════════════════════════════════════════════════════════════════
// 9. APPOINTMENT REMINDERS
// ═══════════════════════════════════════════════════════════════════

clinicalFeaturesRouter.get('/reminders/:appointmentId', requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  const rows = await db.prepare(
    'SELECT * FROM appointment_reminders WHERE appointment_id = ? ORDER BY send_at'
  ).all(req.params.appointmentId);
  res.json({ ok: true, reminders: rows });
}));

clinicalFeaturesRouter.post('/reminders', requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  const { appointmentId, reminderType, sendAt, message } = req.body;
  if (!appointmentId || !reminderType || !sendAt) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const id = randomToken(16);
  await db.prepare(
    'INSERT INTO appointment_reminders (id, appointment_id, reminder_type, send_at, message, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, appointmentId, reminderType, sendAt, message || null, new Date().toISOString());

  res.status(201).json({ ok: true, id });
}));

// Auto-create reminders when appointment is booked
async function createRemindersForAppointment(appointmentId, patientMrn, doctorId, date, startTime, type) {
  const apptDateTime = new Date(`${date}T${startTime}`);
  const reminders = [
    { hours: 24, message: `Reminder: You have a ${type} appointment tomorrow at ${startTime}` },
    { hours: 2, message: `Your ${type} appointment is in 2 hours` },
  ];

  for (const r of reminders) {
    const sendAt = new Date(apptDateTime.getTime() - r.hours * 60 * 60 * 1000);
    if (sendAt > new Date()) {
      const id = randomToken(16);
      await db.prepare(
        'INSERT INTO appointment_reminders (id, appointment_id, reminder_type, send_at, message, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(id, appointmentId, 'push', sendAt.toISOString(), r.message, new Date().toISOString());
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// 10. PATIENT OUTCOME TRACKING
// ═══════════════════════════════════════════════════════════════════

clinicalFeaturesRouter.get('/outcomes/:mrn', requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  const mrn = req.params.mrn.toUpperCase();
  const type = req.query.type;
  let query = 'SELECT * FROM patient_outcomes WHERE patient_mrn = ?';
  const params = [mrn];
  if (type) { query += ' AND outcome_type = ?'; params.push(type); }
  query += ' ORDER BY date DESC LIMIT 100';

  const rows = await db.prepare(query).all(...params);
  res.json({ ok: true, outcomes: rows });
}));

clinicalFeaturesRouter.post('/outcomes', requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  const { patientMrn, outcomeType, date, value, notes } = req.body;
  if (!patientMrn || !outcomeType || !date || !value) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const id = randomToken(16);
  await db.prepare(
    'INSERT INTO patient_outcomes (id, doctor_id, patient_mrn, outcome_type, date, value, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.auth.subjectId, patientMrn, outcomeType, date, typeof value === 'string' ? value : JSON.stringify(value), notes || null, new Date().toISOString());

  writeClinicalAudit({
    doctorId: req.auth.subjectId, patientMrn,
    action: 'outcome.record', category: 'clinical_note',
    targetId: id, detail: { type: outcomeType, date }, ip: req.ip,
  });

  res.status(201).json({ ok: true, id });
}));

clinicalFeaturesRouter.delete('/outcomes/:id', requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  await db.prepare('DELETE FROM patient_outcomes WHERE id = ? AND doctor_id = ?').run(req.params.id, req.auth.subjectId);
  res.json({ ok: true });
}));

// Export seed function
export { seedProtocols, createRemindersForAppointment, HIGH_RISK_DRUGS };
