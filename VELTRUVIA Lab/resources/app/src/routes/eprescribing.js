// ═══════════════════════════════════════════════════════════════════════
// E-PRESCRIBING MODULE
// ═══════════════════════════════════════════════════════════════════════
// Structured prescription generation, pharmacy routing, and EPCS
// (Electronic Prescribing for Controlled Substances) compliance.

import { Router } from 'express';
import { z } from 'zod';
import { db, writeAudit } from '../db/index.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate, asyncHandler } from '../middleware/validate.js';
import { randomToken } from '../crypto.js';
import { getDrugInfo } from '../db/drug-database.js';

export const eprescribingRouter = Router();

// ── EPCS-controlled substance schedules ────────────────────────────
const CONTROLLED_SCHEDULES = {
  II: { name: 'Schedule II', requiresTwoProviders: true, maxDaysSupply: 90, tamperResistant: true },
  III: { name: 'Schedule III', requiresTwoProviders: false, maxDaysSupply: 180, tamperResistant: false },
  IV: { name: 'Schedule IV', requiresTwoProviders: false, maxDaysSupply: 180, tamperResistant: false },
  V: { name: 'Schedule V', requiresTwoProviders: false, maxDaysSupply: 180, tamperResistant: false },
};

// ── Controlled substance mapping (neuro-oncology relevant) ─────────
const CONTROLLED_DRUGS = {
  'oxycodone': 'II',
  'morphine': 'II',
  'fentanyl': 'II',
  'hydromorphone': 'II',
  'methylphenidate': 'II',
  'amobarbital': 'II',
  'pentobarbital': 'II',
  'phenobarbital': 'III',
  'ketamine': 'III',
  'buprenorphine': 'III',
  'tramadol': 'IV',
  'lorazepam': 'IV',
  'alprazolam': 'IV',
  'clonazepam': 'IV',
  'diazepam': 'IV',
  'midazolam': 'IV',
  'zolpidem': 'IV',
  'pregabalin': 'V',
  'gabapentin': 'V',  // Schedule V in some states
  'carisoprodol': 'IV',
};

// ── Create prescription ────────────────────────────────────────────
const prescriptionSchema = z.object({
  patientMrn: z.string().min(1).max(40),
  medication: z.string().min(1).max(200),
  dosage: z.string().min(1).max(100),
  frequency: z.string().min(1).max(100),
  quantity: z.number().int().positive(),
  daysSupply: z.number().int().positive().max(365),
  refills: z.number().int().min(0).max(11),
  pharmacyNpi: z.string().max(10).optional(),
  pharmacyName: z.string().max(200).optional(),
  pharmacyAddress: z.string().max(500).optional(),
  pharmacyPhone: z.string().max(20).optional(),
  notes: z.string().max(1000).optional(),
  diagnosisCode: z.string().max(10).optional(), // ICD-10
  priorAuthRequired: z.boolean().optional(),
  compoundInstructions: z.string().max(2000).optional(),
  route: z.enum(['oral', 'IV', 'SC', 'IM', 'topical', 'inhaled', 'rectal', 'sublingual', 'transdermal', 'IT']).optional().default('oral'),
});

eprescribingRouter.post('/prescriptions', authenticate, requireRole('doctor', 'admin'),
  validate(prescriptionSchema),
  asyncHandler(async (req, res) => {
    const p = req.valid;
    const medLower = p.medication.toLowerCase().trim();
    const id = randomToken(16);

    // Check if drug is controlled
    let controlledSchedule = null;
    for (const [drug, schedule] of Object.entries(CONTROLLED_DRUGS)) {
      if (medLower.includes(drug) || drug.includes(medLower)) {
        controlledSchedule = schedule;
        break;
      }
    }

    // EPCS compliance checks
    const epcsFlags = [];
    if (controlledSchedule) {
      const rules = CONTROLLED_SCHEDULES[controlledSchedule];
      epcsFlags.push({ rule: 'controlled_substance', schedule: controlledSchedule, ...rules });

      if (p.daysSupply > rules.maxDaysSupply) {
        return res.status(400).json({
          error: `Schedule ${controlledSchedule} substances limited to ${rules.maxDaysSupply} days supply`,
          epcsFlags,
        });
      }

      if (rules.requiresTwoProviders) {
        // Check for co-signature (in production, would require second provider)
        epcsFlags.push({
          rule: 'co_signature_required',
          message: 'Schedule II prescriptions require co-signature from a second DEA-registered provider',
        });
      }
    }

    // Drug info: curated database first, NLM label reference as fallback.
    const drugInfo = getDrugInfo(p.medication);
    if (drugInfo) {
      if (drugInfo.blackBox) {
        epcsFlags.push({ rule: 'black_box_warning', message: drugInfo.blackBox });
      }
      if (drugInfo.coverage === 'label-only') {
        epcsFlags.push({
          rule: 'reference_only',
          message: `No structured dosing/interaction data for "${p.medication}" — review the FDA label before signing.`,
          labelUrl: drugInfo.nlmLabel?.url || null,
        });
      }
      if (drugInfo.contraindications?.length) {
        epcsFlags.push({ rule: 'contraindications', drugs: drugInfo.contraindications });
      }
    }

    // Insert prescription
    await db.prepare(`
      INSERT INTO prescriptions (id, patient_mrn, doctor_id, medication, dosage, frequency, route, quantity, refills, instructions, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
    `).run(id, p.patientMrn, req.auth.subjectId, medLower, p.dosage, p.frequency, p.route || 'oral', p.quantity, p.refills, p.notes || null);

    // Generate structured e-prescription (NCPDP SCRIPT format simulation)
    const ePrescription = {
      id,
      version: 'D.0',
      message: 'NewRx',
      ncpdpSchema: {
        segment: 'Header',
        ncpdpId: p.pharmacyNpi || 'UNKNOWN',
        pharmacyName: p.pharmacyName || 'No pharmacy selected',
        pharmacyAddress: p.pharmacyAddress || '',
        pharmacyPhone: p.pharmacyPhone || '',
        // Patient
        patientMrn: p.patientMrn,
        // Prescriber
        prescriberId: req.auth.subjectId,
        prescriberRole: req.auth.role,
        deaNumber: controlledSchedule ? 'DEA-TODO' : null,
        // Prescription
        drugName: drugInfo?.brand || p.medication,
        drugStrength: p.dosage,
        drugForm: drugInfo?.forms?.[0] || 'tablet',
        directions: `${p.dosage} ${p.frequency}`,
        quantity: p.quantity,
        daysSupply: p.daysSupply,
        refills: p.refills,
        dawCode: '0', // Dispense as written
        substitutionAllowed: true,
        // Diagnosis
        diagnosisCode: p.diagnosisCode || null,
        // Controlled substance
        controlledSchedule,
        // Compound
        compound: !!p.compoundInstructions,
        compoundInstructions: p.compoundInstructions || null,
        // Status
        status: 'pending_transmission',
        generatedAt: new Date().toISOString(),
      },
    };

    await writeAudit({
      actorId: req.auth.subjectId, actorRole: 'doctor',
      action: 'eprescribe.create', targetId: id,
      detail: {
        medication: medLower,
        patientMrn: p.patientMrn,
        controlled: !!controlledSchedule,
        pharmacyNpi: p.pharmacyNpi,
      },
      ip: req.ip,
    });

    res.status(201).json({
      ok: true,
      prescription: { id, medication: medLower, status: 'active', controlledSchedule },
      ePrescription,
      epcsFlags,
      transmissionStatus: 'ready',
      message: controlledSchedule
        ? `⚠️ Schedule ${controlledSchedule} prescription created. EPCS compliance required before transmission.`
        : 'Prescription created and ready for pharmacy transmission.',
    });
  })
);

// ── List prescriptions for a patient ───────────────────────────────
eprescribingRouter.get('/prescriptions/:mrn', authenticate, requireRole('doctor', 'admin', 'patient'),
  asyncHandler(async (req, res) => {
    const mrn = req.params.mrn.toUpperCase();
    const prescriptions = await db.prepare(`
      SELECT * FROM prescriptions WHERE patient_mrn = ? ORDER BY created_at DESC
    `).all(mrn);

    // Enrich with drug database info
    const enriched = prescriptions.map(rx => {
      const drugInfo = DRUG_DATABASE[rx.medication?.toLowerCase()];
      const schedule = CONTROLLED_DRUGS[rx.medication?.toLowerCase()];
      return {
        ...rx,
        drugInfo: drugInfo ? {
          brand: drugInfo.brand,
          generic: drugInfo.generic,
          class: drugInfo.class,
          route: drugInfo.route,
          blackBox: drugInfo.blackBox,
          monitoring: drugInfo.monitoring,
        } : null,
        controlledSchedule: schedule || null,
      };
    });

    res.json({ ok: true, prescriptions: enriched });
  })
);

// ── Cancel prescription ────────────────────────────────────────────
eprescribingRouter.post('/prescriptions/:id/cancel', authenticate, requireRole('doctor', 'admin'),
  asyncHandler(async (req, res) => {
    const result = await db.prepare(`
      UPDATE prescriptions SET status = 'cancelled', updated_at = datetime('now')
      WHERE id = ?
    `).run(req.params.id);

    if (result.changes === 0) return res.status(404).json({ error: 'Prescription not found' });

    await writeAudit({
      actorId: req.auth.subjectId, actorRole: 'doctor',
      action: 'eprescribe.cancel', targetId: req.params.id,
      detail: { reason: req.body.reason || 'No reason provided' },
      ip: req.ip,
    });

    res.json({ ok: true, message: 'Prescription cancelled' });
  })
);

// ── Pharmacy lookup ────────────────────────────────────────────────
eprescribingRouter.get('/pharmacies', authenticate, requireRole('doctor', 'admin'),
  asyncHandler(async (req, res) => {
    const q = (req.query.q || '').toLowerCase();

    // In production, this would query NCPDP pharmacy database
    // For now, return mock pharmacies
    const pharmacies = [
      { npi: '1234567890', name: 'Walgreens Pharmacy #12345', address: '123 Main St', phone: '555-0101', chain: 'Walgreens' },
      { npi: '2345678901', name: 'CVS Pharmacy #6789', address: '456 Oak Ave', phone: '555-0102', chain: 'CVS' },
      { npi: '3456789012', name: 'Rite Aid Pharmacy #1111', address: '789 Elm Blvd', phone: '555-0103', chain: 'Rite Aid' },
      { npi: '4567890123', name: 'Specialty Oncology Pharmacy', address: '321 Hospital Dr', phone: '555-0104', chain: 'Specialty' },
      { npi: '5678901234', name: 'Hospital Inpatient Pharmacy', address: '999 Medical Center', phone: '555-0105', chain: 'Hospital' },
      { npi: '6789012345', name: 'Mail Order Pharmacy Plus', address: '1000 Delivery Way', phone: '555-0106', chain: 'Mail Order' },
    ];

    const filtered = q
      ? pharmacies.filter(p => p.name.toLowerCase().includes(q) || p.chain.toLowerCase().includes(q))
      : pharmacies;

    res.json({ ok: true, pharmacies: filtered });
  })
);

// ── Prescription drug search (autocomplete) ────────────────────────
eprescribingRouter.get('/drug-search', authenticate, requireRole('doctor', 'admin'),
  asyncHandler(async (req, res) => {
    const q = (req.query.q || '').toLowerCase().trim();
    if (q.length < 2) return res.json({ ok: true, drugs: [] });

    const matches = [];
    for (const [key, drug] of Object.entries(DRUG_DATABASE)) {
      if (key.includes(q) ||
          (drug.brand || '').toLowerCase().includes(q) ||
          (drug.generic || '').toLowerCase().includes(q) ||
          (drug.class || '').toLowerCase().includes(q)) {
        const schedule = CONTROLLED_DRUGS[key];
        matches.push({
          generic: drug.generic,
          brand: drug.brand,
          class: drug.class,
          route: drug.route,
          forms: drug.forms,
          dosing: drug.dosing,
          controlledSchedule: schedule || null,
          rxnormCui: drug.rxnormCui,
        });
      }
    }

    // Limit to 20 results
    res.json({ ok: true, drugs: matches.slice(0, 20) });
  })
);

// ── Check EPCS compliance for a provider ───────────────────────────
eprescribingRouter.get('/epcs/status', authenticate, requireRole('doctor', 'admin'),
  asyncHandler(async (req, res) => {
    // In production, this would check:
    // 1. DEA registration
    // 2. EPCS enrollment status
    // 3. Two-factor authentication setup
    // 4. Identity proofing completion
    res.json({
      ok: true,
      epcs: {
        enrolled: false,
        deaRegistered: false,
        twoFactorEnabled: false,
        identityProofed: false,
        status: 'Not enrolled — required for Schedule II prescriptions',
        enrollmentSteps: [
          'Register with your state PDMP (Prescription Drug Monitoring Program)',
          'Complete DEA EPCS enrollment',
          'Set up two-factor authentication (token + biometric)',
          'Complete identity proofing through certified vendor',
          'Enable EPCS in your EMR settings',
        ],
      },
    });
  })
);
