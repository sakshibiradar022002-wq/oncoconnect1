// ═══════════════════════════════════════════════════════════════════════
// APPOINTMENTS / SELF-SCHEDULING API
// ═══════════════════════════════════════════════════════════════════════
// Doctors configure recurring availability. Patients see open slots and
// book directly. Server-side slot management prevents double-booking.

import { Router } from 'express';
import { z } from 'zod';
import { db, writeAudit } from '../db/index.js';
import { encryptPHI, decryptPHI, randomToken } from '../crypto.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate, asyncHandler } from '../middleware/validate.js';
import { notifySubject } from '../push.js';

export const scheduleRouter = Router();

// ── Helpers ────────────────────────────────────────────────────────
function dateRange(days = 30) {
  const start = new Date();
  const end = new Date();
  end.setDate(start.getDate() + days);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function generateSlotsForDate(availRow, dateStr) {
  // expand a single availability row into concrete time slots for a given date
  const d = new Date(dateStr + 'T00:00:00');
  if (d.getDay() !== availRow.day_of_week) return [];

  const [sh, sm] = availRow.start_time.split(':').map(Number);
  const [eh, em] = availRow.end_time.split(':').map(Number);
  const dur = availRow.slot_duration || 30;
  const types = availRow.appointment_types
    ? JSON.parse(availRow.appointment_types)
    : ['Follow-up', 'MRI Review', 'Lab Review', 'Treatment Planning', 'Teleconsult'];

  const slots = [];
  let mins = sh * 60 + sm;
  const endMins = eh * 60 + em;

  while (mins + dur <= endMins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    slots.push({
      time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      endTime: `${String(Math.floor((mins + dur) / 60)).padStart(2, '0')}:${String((mins + dur) % 60).padStart(2, '0')}`,
      duration: dur,
      types,
    });
    mins += dur;
  }
  return slots;
}

// ═══════════════════════════════════════════════════════════════════
// DOCTOR ROUTES
// ═══════════════════════════════════════════════════════════════════

// ── Get my availability schedule ──────────────────────────────────
scheduleRouter.get('/availability', authenticate, requireRole('doctor', 'admin'),
  asyncHandler(async (req, res) => {
    const rows = await db.prepare(
      'SELECT * FROM doctor_availability WHERE doctor_id = ? AND active = 1 ORDER BY day_of_week, start_time'
    ).all(req.auth.subjectId);
    res.json({ ok: true, availability: rows });
  })
);

// ── Set/replace my availability schedule ───────────────────────────
const availSchema = z.object({
  slots: z.array(z.object({
    dayOfWeek: z.number().min(0).max(6),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    slotDuration: z.number().min(10).max(120).optional().default(30),
    appointmentTypes: z.array(z.string()).optional(),
  })),
});

scheduleRouter.put('/availability', authenticate, requireRole('doctor', 'admin'),
  validate(availSchema),
  asyncHandler(async (req, res) => {
    const { slots } = req.valid;
    const now = new Date().toISOString();

    // Deactivate old ones
    await db.prepare('UPDATE doctor_availability SET active = 0 WHERE doctor_id = ?')
      .run(req.auth.subjectId);

    // Insert new
    const ins = await db.prepare(`
      INSERT INTO doctor_availability (id, doctor_id, day_of_week, start_time, end_time,
        slot_duration, appointment_types, active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `);

    for (const s of slots) {
      await ins.run(
        randomToken(16), req.auth.subjectId,
        s.dayOfWeek, s.startTime, s.endTime,
        s.slotDuration || 30,
        s.appointmentTypes ? JSON.stringify(s.appointmentTypes) : null,
        now
      );
    }

    await writeAudit({
      actorId: req.auth.subjectId, actorRole: 'doctor',
      action: 'schedule.availability_update',
      detail: { count: slots.length }, ip: req.ip,
    });

    res.json({ ok: true, message: `Set ${slots.length} availability blocks` });
  })
);

// ── Get all my appointments (doctor view) ──────────────────────────
scheduleRouter.get('/appointments', authenticate, requireRole('doctor', 'admin'),
  asyncHandler(async (req, res) => {
    const { start, end } = dateRange(90);
    const dateFrom = req.query.from || start;
    const dateTo = req.query.to || end;

    const rows = await db.prepare(`
      SELECT * FROM appointments
      WHERE doctor_id = ? AND date >= ? AND date <= ?
      ORDER BY date, start_time
    `).all(req.auth.subjectId, dateFrom, dateTo);

    res.json({ ok: true, appointments: rows });
  })
);

// ── Doctor: create an appointment directly ─────────────────────────
const createApptSchema = z.object({
  patientMrn: z.string().min(1).max(40).transform(s => s.trim().toUpperCase()),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  type: z.string().max(60).optional().default('Follow-up'),
  notes: z.string().max(2000).optional(),
});

scheduleRouter.post('/appointments', authenticate, requireRole('doctor', 'admin'),
  validate(createApptSchema),
  asyncHandler(async (req, res) => {
    const { patientMrn, date, startTime, endTime, type, notes } = req.valid;
    const now = new Date().toISOString();

    // Check for conflicts
    const conflict = await db.prepare(`
      SELECT id FROM appointments
      WHERE doctor_id = ? AND date = ? AND status NOT IN ('cancelled')
        AND NOT (end_time <= ? OR start_time >= ?)
    `).get(req.auth.subjectId, date, startTime, endTime);

    if (conflict) {
      return res.status(409).json({ error: 'Time slot conflicts with an existing appointment' });
    }

    const id = randomToken(16);
    await db.prepare(`
      INSERT INTO appointments (id, doctor_id, patient_mrn, date, start_time, end_time,
        type, status, notes, booked_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, 'doctor', ?, ?)
    `).run(id, req.auth.subjectId, patientMrn, date, startTime, endTime, type,
      notes || null, now, now);

    // Sync to doctor's kv_store for backward compat
    const apptKey = `appts_${patientMrn}`;
    const existing = await db.prepare('SELECT v_enc FROM kv_store WHERE owner_id = ? AND k = ?')
      .get(req.auth.subjectId, apptKey);
    const appts = existing ? (decryptPHI(existing.v_enc) || []) : [];
    appts.push({ id, date, time: startTime, endTime, type, notes, status: 'confirmed', bookedBy: 'doctor' });
    // Write back encrypted
    const { encryptPHI: enc } = await import('../crypto.js');
    await db.prepare(`
      INSERT INTO kv_store (owner_id, k, v_enc, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(owner_id, k) DO UPDATE SET v_enc = excluded.v_enc, updated_at = excluded.updated_at
    `).run(req.auth.subjectId, apptKey, enc(appts), now);

    // Notify patient
    notifySubject(`${req.auth.subjectId}::${patientMrn}`, {
      title: '📅 Appointment Scheduled',
      body: `You have a ${type} on ${date} at ${startTime}.`,
      url: '/patient.html',
    }).catch(() => {});

    await writeAudit({
      actorId: req.auth.subjectId, actorRole: 'doctor',
      action: 'schedule.appointment_create', targetId: id,
      detail: { mrn: patientMrn, date, time: startTime }, ip: req.ip,
    });

    res.status(201).json({ ok: true, appointment: { id, date, startTime, endTime, type, status: 'confirmed' } });
  })
);

// ── Doctor: update appointment status ──────────────────────────────
const updateApptSchema = z.object({
  appointmentId: z.string().min(1),
  status: z.enum(['confirmed', 'cancelled', 'completed', 'no-show']).optional(),
  notes: z.string().max(2000).optional(),
});

scheduleRouter.patch('/appointments', authenticate, requireRole('doctor', 'admin'),
  validate(updateApptSchema),
  asyncHandler(async (req, res) => {
    const { appointmentId, status, notes } = req.valid;
    const now = new Date().toISOString();

    const appt = await db.prepare(
      'SELECT * FROM appointments WHERE id = ? AND doctor_id = ?'
    ).get(appointmentId, req.auth.subjectId);

    if (!appt) return res.status(404).json({ error: 'Appointment not found' });

    const updates = [];
    const params = [];
    if (status) { updates.push('status = ?'); params.push(status); }
    if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
    updates.push('updated_at = ?'); params.push(now);
    params.push(appointmentId);

    await db.prepare(`UPDATE appointments SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    // Notify patient of status change
    if (status) {
      notifySubject(`${req.auth.subjectId}::${appt.patient_mrn}`, {
        title: `📅 Appointment ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        body: `Your ${appt.type} on ${appt.date} has been ${status}.`,
        url: '/patient.html',
      }).catch(() => {});
    }

    await writeAudit({
      actorId: req.auth.subjectId, actorRole: 'doctor',
      action: 'schedule.appointment_update', targetId: appointmentId,
      detail: { status, notes }, ip: req.ip,
    });

    res.json({ ok: true, message: 'Appointment updated' });
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

// ── Get available slots for booking ────────────────────────────────
scheduleRouter.get('/slots', authenticate, requireRole('kv-patient'), patientScope,
  asyncHandler(async (req, res) => {
    const { ownerId } = req.patientScope;
    const days = parseInt(req.query.days || '30', 10);
    const { start, end } = dateRange(days);

    // Get doctor's availability
    const avail = await db.prepare(
      'SELECT * FROM doctor_availability WHERE doctor_id = ? AND active = 1'
    ).all(ownerId);

    // Get existing appointments
    const existingAppts = await db.prepare(`
      SELECT date, start_time, end_time FROM appointments
      WHERE doctor_id = ? AND date >= ? AND date <= ? AND status NOT IN ('cancelled')
    `).all(ownerId, start, end);

    // Generate available slots for each day
    const slotsByDate = {};
    const current = new Date(start + 'T00:00:00');
    const endDate = new Date(end + 'T23:59:59');

    while (current <= endDate) {
      const dateStr = current.toISOString().slice(0, 10);
      const daySlots = [];

      for (const a of avail) {
        const rawSlots = generateSlotsForDate(a, dateStr);
        for (const slot of rawSlots) {
          // Check if slot conflicts with existing appointment
          const taken = existingAppts.some(
            e => e.date === dateStr &&
              !(e.end_time <= slot.time || e.start_time >= slot.endTime)
          );
          if (!taken) {
            daySlots.push(slot);
          }
        }
      }

      if (daySlots.length > 0) {
        slotsByDate[dateStr] = daySlots;
      }
      current.setDate(current.getDate() + 1);
    }

    res.json({ ok: true, slots: slotsByDate });
  })
);

// ── Patient: book an appointment ───────────────────────────────────
const bookApptSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  type: z.string().max(60).optional().default('Follow-up'),
  notes: z.string().max(2000).optional(),
});

scheduleRouter.post('/book', authenticate, requireRole('kv-patient'), patientScope,
  validate(bookApptSchema),
  asyncHandler(async (req, res) => {
    const { ownerId, mrn } = req.patientScope;
    const { date, startTime, type, notes } = req.valid;
    const now = new Date().toISOString();

    // Find the matching availability to compute end_time
    const d = new Date(date + 'T00:00:00');
    const avail = await db.prepare(
      'SELECT * FROM doctor_availability WHERE doctor_id = ? AND day_of_week = ? AND active = 1'
    ).all(ownerId, d.getDay());

    let matched = null;
    for (const a of avail) {
      const slots = generateSlotsForDate(a, date);
      matched = slots.find(s => s.time === startTime);
      if (matched) break;
    }

    if (!matched) {
      return res.status(400).json({ error: 'This time slot is not available' });
    }

    // Check for conflicts
    const conflict = await db.prepare(`
      SELECT id FROM appointments
      WHERE doctor_id = ? AND date = ? AND status NOT IN ('cancelled')
        AND NOT (end_time <= ? OR start_time >= ?)
    `).get(ownerId, date, startTime, matched.endTime);

    if (conflict) {
      return res.status(409).json({ error: 'This slot was just taken. Please choose another.' });
    }

    const id = randomToken(16);
    await db.prepare(`
      INSERT INTO appointments (id, doctor_id, patient_mrn, date, start_time, end_time,
        type, status, notes, booked_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, 'patient', ?, ?)
    `).run(id, ownerId, mrn, date, startTime, matched.endTime, type, notes || null, now, now);

    // Notify doctor
    notifySubject(ownerId, {
      title: '📅 New Appointment Request',
      body: `Patient ${mrn} requested a ${type} on ${date} at ${startTime}.`,
      url: '/',
    }).catch(() => {});

    await writeAudit({
      actorId: mrn, actorRole: 'kv-patient',
      action: 'schedule.appointment_request', targetId: id,
      detail: { date, time: startTime, type }, ip: req.ip,
    });

    res.status(201).json({
      ok: true,
      message: 'Appointment request submitted. Your doctor will confirm shortly.',
      appointment: { id, date, startTime, endTime: matched.endTime, type, status: 'pending' },
    });
  })
);

// ── Patient: view their appointments ───────────────────────────────
scheduleRouter.get('/my-appointments', authenticate, requireRole('kv-patient'), patientScope,
  asyncHandler(async (req, res) => {
    const { ownerId, mrn } = req.patientScope;
    const rows = await db.prepare(`
      SELECT * FROM appointments
      WHERE doctor_id = ? AND patient_mrn = ? AND date >= ?
      ORDER BY date, start_time
    `).all(ownerId, mrn, new Date().toISOString().slice(0, 10));

    res.json({ ok: true, appointments: rows });
  })
);

// ── Patient: cancel an appointment ─────────────────────────────────
scheduleRouter.post('/cancel', authenticate, requireRole('kv-patient'), patientScope,
  validate(z.object({ appointmentId: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const { ownerId, mrn } = req.patientScope;
    const { appointmentId } = req.valid;
    const now = new Date().toISOString();

    const appt = await db.prepare(
      "SELECT * FROM appointments WHERE id = ? AND doctor_id = ? AND patient_mrn = ? AND status NOT IN ('cancelled','completed')"
    ).get(appointmentId, ownerId, mrn);

    if (!appt) return res.status(404).json({ error: 'Appointment not found' });

    await db.prepare("UPDATE appointments SET status = 'cancelled', updated_at = ? WHERE id = ?")
      .run(now, appointmentId);

    // Notify doctor
    notifySubject(ownerId, {
      title: '📅 Appointment Cancelled',
      body: `Patient ${mrn} cancelled their ${appt.type} on ${appt.date}.`,
      url: '/',
    }).catch(() => {});

    await writeAudit({
      actorId: mrn, actorRole: 'kv-patient',
      action: 'schedule.appointment_cancel', targetId: appointmentId, ip: req.ip,
    });

    res.json({ ok: true, message: 'Appointment cancelled' });
  })
);
