// ═══════════════════════════════════════════════════════════════════════
// TELEHEALTH / VIDEO CALLS
// ═══════════════════════════════════════════════════════════════════════
// WebRTC signaling server for doctor-patient video consultations.
// Uses a simple HTTP-polling signaling approach (no WebSocket dependency).
// For production, swap to a SFU like mediasoup or use Twilio/Agora.

import { Router } from 'express';
import { z } from 'zod';
import { db, writeAudit } from '../db/index.js';
import { randomToken } from '../crypto.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate, asyncHandler } from '../middleware/validate.js';
import { notifySubject } from '../push.js';

export const telehealthRouter = Router();

// In-memory signaling store (resets on server restart — fine for signaling)
const signalingStore = new Map(); // roomCode → { messages: [], participants: Set }
const SIGNAL_EXPIRY_MS = 60 * 60 * 1000; // rooms expire after 1 hour

// ── Generate a short room code ─────────────────────────────────────
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing chars
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ── Doctor: create a telehealth room ───────────────────────────────
const createRoomSchema = z.object({
  patientMrn: z.string().min(1).max(40).transform(s => s.trim().toUpperCase()),
  appointmentId: z.string().optional(),
});

telehealthRouter.post('/rooms', authenticate, requireRole('doctor', 'admin'),
  validate(createRoomSchema),
  asyncHandler(async (req, res) => {
    const { patientMrn, appointmentId } = req.valid;
    const now = new Date().toISOString();
    const roomCode = generateRoomCode();

    await db.prepare(`
      INSERT INTO telehealth_rooms (id, appointment_id, doctor_id, patient_mrn, status, created_at)
      VALUES (?, ?, ?, ?, 'waiting', ?)
    `).run(roomCode, appointmentId || null, req.auth.subjectId, patientMrn, now);

    // Notify patient that a video room is ready
    notifySubject(`${req.auth.subjectId}::${patientMrn}`, {
      title: '📹 Video Call Room Ready',
      body: `Your doctor has opened a video consultation room. Join when ready.`,
      url: '/patient.html',
    }).catch(() => {});

    // Initialize signaling
    signalingStore.set(roomCode, { messages: [], participants: new Set() });

    await writeAudit({
      actorId: req.auth.subjectId, actorRole: 'doctor',
      action: 'telehealth.room_create', targetId: roomCode,
      detail: { mrn: patientMrn }, ip: req.ip,
    });

    res.status(201).json({ ok: true, roomCode, status: 'waiting' });
  })
);

// ── Doctor: list active rooms ──────────────────────────────────────
telehealthRouter.get('/rooms', authenticate, requireRole('doctor', 'admin'),
  asyncHandler(async (req, res) => {
    const rows = await db.prepare(`
      SELECT * FROM telehealth_rooms
      WHERE doctor_id = ? AND status IN ('waiting', 'active')
      ORDER BY created_at DESC
    `).all(req.auth.subjectId);
    res.json({ ok: true, rooms: rows });
  })
);

// ── End a room ─────────────────────────────────────────────────────
telehealthRouter.post('/rooms/:code/end', authenticate, requireRole('doctor', 'admin'),
  asyncHandler(async (req, res) => {
    const code = req.params.code.toUpperCase();
    const now = new Date().toISOString();

    const result = await db.prepare(`
      UPDATE telehealth_rooms SET status = 'ended', ended_at = ?
      WHERE id = ? AND doctor_id = ? AND status != 'ended'
    `).run(now, code, req.auth.subjectId);

    if (result.changes === 0) return res.status(404).json({ error: 'Room not found' });

    signalingStore.delete(code);

    await writeAudit({
      actorId: req.auth.subjectId, actorRole: 'doctor',
      action: 'telehealth.room_end', targetId: code, ip: req.ip,
    });

    res.json({ ok: true, message: 'Call ended' });
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

// ── Patient: check for available rooms ─────────────────────────────
telehealthRouter.get('/my-rooms', authenticate, requireRole('kv-patient'), patientScope,
  asyncHandler(async (req, res) => {
    const { ownerId, mrn } = req.patientScope;
    const rows = await db.prepare(`
      SELECT * FROM telehealth_rooms
      WHERE doctor_id = ? AND patient_mrn = ? AND status IN ('waiting', 'active')
      ORDER BY created_at DESC
    `).all(ownerId, mrn);
    res.json({ ok: true, rooms: rows });
  })
);

// ── Patient: join a room ───────────────────────────────────────────
telehealthRouter.post('/rooms/:code/join', authenticate, requireRole('kv-patient'), patientScope,
  asyncHandler(async (req, res) => {
    const code = req.params.code.toUpperCase();
    const { ownerId, mrn } = req.patientScope;

    const room = await db.prepare(`
      SELECT * FROM telehealth_rooms
      WHERE id = ? AND doctor_id = ? AND patient_mrn = ? AND status IN ('waiting', 'active')
    `).get(code, ownerId, mrn);

    if (!room) return res.status(404).json({ error: 'No active video room found' });

    // Mark as active
    await db.prepare("UPDATE telehealth_rooms SET status = 'active' WHERE id = ?").run(code);

    // Initialize signaling store if needed
    if (!signalingStore.has(code)) {
      signalingStore.set(code, { messages: [], participants: new Set() });
    }

    await writeAudit({
      actorId: mrn, actorRole: 'kv-patient',
      action: 'telehealth.room_join', targetId: code, ip: req.ip,
    });

    res.json({ ok: true, roomCode: code, status: 'active' });
  })
);

// ═══════════════════════════════════════════════════════════════════
// WEBRTC SIGNALING (HTTP long-poll)
// ═══════════════════════════════════════════════════════════════════

// ── Post a signaling message (offer/answer/candidate) ──────────────
const signalSchema = z.object({
  type: z.enum(['offer', 'answer', 'candidate', 'join', 'leave', 'chat']),
  data: z.any(),
});

telehealthRouter.post('/signal/:code', authenticate, validate(signalSchema),
  asyncHandler(async (req, res) => {
    const code = req.params.code.toUpperCase();
    const { type, data } = req.valid;
    const senderType = req.auth.role === 'kv-patient' ? 'patient' : 'doctor';

    let store = signalingStore.get(code);
    if (!store) {
      store = { messages: [], participants: new Set() };
      signalingStore.set(code, store);
    }

    store.messages.push({
      type,
      data,
      sender: senderType,
      senderId: req.auth.subjectId,
      timestamp: Date.now(),
    });

    // Keep only last 100 messages
    if (store.messages.length > 100) {
      store.messages = store.messages.slice(-100);
    }

    res.json({ ok: true });
  })
);

// ── Poll for signaling messages (long-poll) ───────────────────────
telehealthRouter.get('/signal/:code', authenticate,
  asyncHandler(async (req, res) => {
    const code = req.params.code.toUpperCase();
    const since = parseInt(req.query.since || '0', 10);
    const timeout = parseInt(req.query.timeout || '15000', 10); // max 15s

    const store = signalingStore.get(code);
    if (!store) return res.json({ ok: true, messages: [] });

    // Wait for new messages (long-poll)
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const newMsgs = store.messages.filter(m => m.timestamp > since);
      if (newMsgs.length > 0) {
        return res.json({ ok: true, messages: newMsgs });
      }
      await new Promise(r => setTimeout(r, 500));
    }

    // Timeout — return empty
    res.json({ ok: true, messages: [] });
  })
);

// ── Cleanup expired rooms (called periodically) ────────────────────
export function startTelehealthCleanup() {
  setInterval(async () => {
    const cutoff = new Date(Date.now() - SIGNAL_EXPIRY_MS).toISOString();
    const result = await db.prepare(`
      UPDATE telehealth_rooms SET status = 'ended', ended_at = ?
      WHERE status IN ('waiting', 'active') AND created_at < ?
    `).run(new Date().toISOString(), cutoff);

    if (result.changes > 0) {
      console.log(`[Telehealth] Cleaned up ${result.changes} expired rooms`);
    }
  }, 10 * 60 * 1000); // every 10 minutes
}
