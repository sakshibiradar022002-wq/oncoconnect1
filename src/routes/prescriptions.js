// ═══════════════════════════════════════════════════════════════════════
// E-PRESCRIBING API
// ═══════════════════════════════════════════════════════════════════════
// Full prescription lifecycle: create, view, modify, cancel.
// Includes allergy/interaction checks before prescribing.

import { Router } from 'express';
import { z } from 'zod';
import { db, writeAudit } from '../db/index.js';
import { encryptPHI, decryptPHI, randomToken } from '../crypto.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate, asyncHandler } from '../middleware/validate.js';
import { notifySubject } from '../push.js';

export const prescriptionRouter = Router();

// ═══════════════════════════════════════════════════════════════════
// DOCTOR ROUTES
// ═══════════════════════════════════════════════════════════════════

// ── Create a new prescription ──────────────────────────────────────
const createRxSchema = z.object({
  patientMrn: z.string().min(1).max(40).transform(s => s.trim().toUpperCase()),
  medication: z.string().min(1).max(200),
  genericName: z.string().max(200).optional(),
  dosage: z.string().min(1).max(100),
  frequency: z.string().min(1).max(100),
  route: z.enum(['oral', 'iv', 'im', 'subcutaneous', 'topical', 'intrathecal', 'rectal', 'other']).optional().default('oral'),
  duration: z.string().max(100).optional(),
  quantity: z.number().positive().optional(),
  refills: z.number().min(0).max(12).optional().default(0),
  pharmacy: z.string().max(300).optional(),
  instructions: z.string().max(1000).optional(),
});

prescriptionRouter.post('/', authenticate, requireRole('doctor', 'admin'),
  validate(createRxSchema),
  asyncHandler(async (req, res) => {
    const rx = req.valid;
    const now = new Date().toISOString();

    // Pre-prescribe safety checks
    const warnings = [];

    // 1. Check allergies
    const allergies = await db.prepare(
      'SELECT * FROM patient_allergies WHERE patient_mrn = ?'
    ).all(rx.patientMrn);

    const medLower = rx.medication.toLowerCase();
    for (const allergy of allergies) {
      if (medLower.includes(allergy.drug_name) || allergy.drug_name.includes(medLower)) {
        warnings.push({
          type: 'allergy',
          severity: allergy.severity,
          message: `⚠️ PATIENT ALLERGY: ${allergy.drug_name} (reaction: ${allergy.reaction || 'unknown'})`,
        });
      }
    }

    // 2. Check interactions with active prescriptions
    const activeRxs = await db.prepare(
      "SELECT medication FROM prescriptions WHERE patient_mrn = ? AND status = 'active'"
    ).all(rx.patientMrn);

    for (const activeRx of activeRxs) {
      const otherMed = activeRx.medication?.toLowerCase();
      if (!otherMed) continue;

      const interactions = await db.prepare(`
        SELECT * FROM drug_interactions
        WHERE (drug_a = ? AND drug_b = ?) OR (drug_a = ? AND drug_b = ?)
      `).all(medLower, otherMed, otherMed, medLower);

      for (const inter of interactions) {
        warnings.push({
          type: 'interaction',
          severity: inter.severity,
          message: `⚠️ DRUG INTERACTION (${inter.severity}): ${rx.medication} + ${activeRx.medication} — ${inter.description}`,
          recommendation: inter.recommendation,
        });
      }
    }

    // If there are SEVERE warnings, return them but don't block (doctor decides)
    const severeWarnings = warnings.filter(w => w.severity === 'severe');

    const id = randomToken(16);
    await db.prepare(`
      INSERT INTO prescriptions (id, doctor_id, patient_mrn, medication, generic_name,
        dosage, frequency, route, duration, quantity, refills, pharmacy,
        status, instructions, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `).run(
      id, req.auth.subjectId, rx.patientMrn,
      rx.medication, rx.genericName || null,
      rx.dosage, rx.frequency, rx.route,
      rx.duration || null, rx.quantity || null, rx.refills || 0,
      rx.pharmacy || null, rx.instructions || null,
      now, now
    );

    // Sync to patient's kv_store so patient app can see prescriptions
    const rxKey = `rx_${rx.patientMrn}`;
    const existing = await db.prepare('SELECT v_enc FROM kv_store WHERE owner_id = ? AND k = ?')
      .get(req.auth.subjectId, rxKey);
    const rxs = existing ? (decryptPHI(existing.v_enc) || []) : [];
    rxs.push({
      id, medication: rx.medication, genericName: rx.genericName,
      dosage: rx.dosage, frequency: rx.frequency, route: rx.route,
      duration: rx.duration, refills: rx.refills, pharmacy: rx.pharmacy,
      instructions: rx.instructions, status: 'active',
      prescribedDate: now.split('T')[0],
    });
    await db.prepare(`
      INSERT INTO kv_store (owner_id, k, v_enc, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(owner_id, k) DO UPDATE SET v_enc = excluded.v_enc, updated_at = excluded.updated_at
    `).run(req.auth.subjectId, rxKey, encryptPHI(rxs), now);

    // Notify patient
    notifySubject(`${req.auth.subjectId}::${rx.patientMrn}`, {
      title: '💊 New Prescription',
      body: `${rx.medication} ${rx.dosage} ${rx.frequency} prescribed by your doctor.`,
      url: '/patient.html',
    }).catch(() => {});

    await writeAudit({
      actorId: req.auth.subjectId, actorRole: 'doctor',
      action: 'rx.create', targetId: id,
      detail: { mrn: rx.patientMrn, med: rx.medication, warnings: warnings.length }, ip: req.ip,
    });

    res.status(201).json({
      ok: true,
      prescription: { id, medication: rx.medication, dosage: rx.dosage, frequency: rx.frequency, status: 'active' },
      warnings: warnings.length > 0 ? warnings : undefined,
      blocked: false, // Always allow doctor to override
    });
  })
);

// ── List prescriptions for a patient ───────────────────────────────
prescriptionRouter.get('/patient/:mrn', authenticate, requireRole('doctor', 'admin'),
  asyncHandler(async (req, res) => {
    const mrn = req.params.mrn.toUpperCase();
    const status = req.query.status; // optional filter

    let query = 'SELECT * FROM prescriptions WHERE doctor_id = ? AND patient_mrn = ?';
    const params = [req.auth.subjectId, mrn];
    if (status) { query += ' AND status = ?'; params.push(status); }
    query += ' ORDER BY created_at DESC';

    const rows = await db.prepare(query).all(...params);
    res.json({ ok: true, prescriptions: rows });
  })
);

// ── List all active prescriptions (doctor's practice) ──────────────
prescriptionRouter.get('/active', authenticate, requireRole('doctor', 'admin'),
  asyncHandler(async (req, res) => {
    const rows = await db.prepare(`
      SELECT * FROM prescriptions
      WHERE doctor_id = ? AND status = 'active'
      ORDER BY patient_mrn, medication
    `).all(req.auth.subjectId);
    res.json({ ok: true, prescriptions: rows });
  })
);

// ── Update prescription status ─────────────────────────────────────
const updateRxSchema = z.object({
  prescriptionId: z.string().min(1),
  status: z.enum(['completed', 'cancelled', 'expired', 'pending-refill']).optional(),
  dosage: z.string().max(100).optional(),
  frequency: z.string().max(100).optional(),
  instructions: z.string().max(1000).optional(),
  refills: z.number().min(0).max(12).optional(),
});

prescriptionRouter.patch('/', authenticate, requireRole('doctor', 'admin'),
  validate(updateRxSchema),
  asyncHandler(async (req, res) => {
    const { prescriptionId, ...updates } = req.valid;
    const now = new Date().toISOString();

    const rx = await db.prepare(
      'SELECT * FROM prescriptions WHERE id = ? AND doctor_id = ?'
    ).get(prescriptionId, req.auth.subjectId);

    if (!rx) return res.status(404).json({ error: 'Prescription not found' });

    const setClauses = [];
    const params = [];
    if (updates.status) { setClauses.push('status = ?'); params.push(updates.status); }
    if (updates.dosage) { setClauses.push('dosage = ?'); params.push(updates.dosage); }
    if (updates.frequency) { setClauses.push('frequency = ?'); params.push(updates.frequency); }
    if (updates.instructions !== undefined) { setClauses.push('instructions = ?'); params.push(updates.instructions); }
    if (updates.refills !== undefined) { setClauses.push('refills = ?'); params.push(updates.refills); }
    setClauses.push('updated_at = ?'); params.push(now);
    params.push(prescriptionId);

    await db.prepare(`UPDATE prescriptions SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);

    // Notify patient
    if (updates.status) {
      notifySubject(`${req.auth.subjectId}::${rx.patient_mrn}`, {
        title: updates.status === 'cancelled' ? '❌ Prescription Cancelled' : '💊 Prescription Updated',
        body: `${rx.medication} has been ${updates.status}.`,
        url: '/patient.html',
      }).catch(() => {});
    }

    await writeAudit({
      actorId: req.auth.subjectId, actorRole: 'doctor',
      action: 'rx.update', targetId: prescriptionId,
      detail: updates, ip: req.ip,
    });

    res.json({ ok: true, message: 'Prescription updated' });
  })
);

// ── Get prescription labels (for printing) ─────────────────────────
prescriptionRouter.get('/:id/label', authenticate, requireRole('doctor', 'admin'),
  asyncHandler(async (req, res) => {
    const rx = await db.prepare(
      'SELECT * FROM prescriptions WHERE id = ? AND doctor_id = ?'
    ).get(req.params.id, req.auth.subjectId);

    if (!rx) return res.status(404).json({ error: 'Not found' });

    // Get patient info
    const patRow = await db.prepare('SELECT v_enc FROM kv_store WHERE owner_id = ? AND k = ?')
      .get(req.auth.subjectId, 'pat_' + rx.patient_mrn);
    const patient = patRow ? decryptPHI(patRow.v_enc) : {};

    res.json({
      ok: true,
      label: {
        doctor: decryptPHI(
          (await db.prepare('SELECT name_enc, meta_enc FROM users WHERE id = ?').get(req.auth.subjectId))?.name_enc
        ),
        institution: decryptPHI(
          (await db.prepare('SELECT meta_enc FROM users WHERE id = ?').get(req.auth.subjectId))?.meta_enc
        )?.institution || '',
        patient: { name: patient.name, mrn: rx.patient_mrn, dob: patient.dob },
        medication: rx.medication,
        genericName: rx.generic_name,
        dosage: rx.dosage,
        frequency: rx.frequency,
        route: rx.route,
        duration: rx.duration,
        quantity: rx.quantity,
        refills: rx.refills,
        instructions: rx.instructions,
        pharmacy: rx.pharmacy,
        date: rx.created_at?.split('T')[0],
      },
    });
  })
);

// ═══════════════════════════════════════════════════════════════════
// PATIENT ROUTES
// ═══════════════════════════════════════════════════════════════════

function patientScope(req, res, next) {
  const [ownerId, mrn] = String(req.auth.subjectId).split('::');
  if (!ownerId || !mrn) return res.status(401).json({ error: 'Invalid session' });
  req.patientScope = { ownerId, mrn };
  next();
}

// ── Patient: view their prescriptions ──────────────────────────────
prescriptionRouter.get('/my', authenticate, requireRole('kv-patient'), patientScope,
  asyncHandler(async (req, res) => {
    const { ownerId, mrn } = req.patientScope;
    const rows = await db.prepare(`
      SELECT * FROM prescriptions WHERE doctor_id = ? AND patient_mrn = ?
      ORDER BY created_at DESC
    `).all(ownerId, mrn);

    // Strip sensitive doctor info
    res.json({
      ok: true,
      prescriptions: rows.map(r => ({
        id: r.id,
        medication: r.medication,
        genericName: r.generic_name,
        dosage: r.dosage,
        frequency: r.frequency,
        route: r.route,
        duration: r.duration,
        refills: r.refills,
        pharmacy: r.pharmacy,
        instructions: r.instructions,
        status: r.status,
        prescribedDate: r.created_at?.split('T')[0],
      })),
    });
  })
);

// ── Patient: request refill ────────────────────────────────────────
prescriptionRouter.post('/refill-request', authenticate, requireRole('kv-patient'), patientScope,
  validate(z.object({ prescriptionId: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const { ownerId, mrn } = req.patientScope;
    const { prescriptionId } = req.valid;

    const rx = await db.prepare(
      "SELECT * FROM prescriptions WHERE id = ? AND doctor_id = ? AND patient_mrn = ? AND status IN ('active','pending-refill')"
    ).get(prescriptionId, ownerId, mrn);

    if (!rx) return res.status(404).json({ error: 'Active prescription not found' });

    await db.prepare(
      "UPDATE prescriptions SET status = 'pending-refill', updated_at = ? WHERE id = ?"
    ).run(new Date().toISOString(), prescriptionId);

    // Notify doctor
    notifySubject(ownerId, {
      title: '💊 Refill Request',
      body: `Patient ${mrn} requested a refill for ${rx.medication}.`,
      url: '/',
    }).catch(() => {});

    await writeAudit({
      actorId: mrn, actorRole: 'kv-patient',
      action: 'rx.refill_request', targetId: prescriptionId, ip: req.ip,
    });

    res.json({ ok: true, message: 'Refill request sent to your doctor' });
  })
);
