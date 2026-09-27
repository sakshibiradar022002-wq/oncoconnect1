// ═══════════════════════════════════════════════════════════════════════
// TELEHEALTH / VIDEO CALLS — WebSocket Signaling
// ═══════════════════════════════════════════════════════════════════════
// WebRTC signaling server using WebSocket for real-time peer connection
// negotiation. Room management stays on HTTP; signaling moves to WS.
// Attach the WS server from server.js via `attachTelehealthWs(server)`.

import { Router } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db, writeAudit } from '../db/index.js';
import { config } from '../config.js';
import { randomToken } from '../crypto.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate, asyncHandler } from '../middleware/validate.js';
import { notifySubject } from '../push.js';

export const telehealthRouter = Router();

// ── ICE server configuration for WebRTC ─────────────────────────────
// STUN alone fails behind carrier-grade NAT; a TURN relay fixes mobile calls.
// Configure via env: TURN_URL / TURN_USERNAME / TURN_CREDENTIAL
//   e.g. TURN_URL=turn:turn.myclinic.com:3478 (see DEPLOY.md → coturn)
// Authenticated endpoint — TURN credentials must not be served to anonymous
// callers. Browsers fetch it same-origin, so httpOnly session cookies ride along.
telehealthRouter.get('/ice-servers', authenticate, (req, res) => {
  const ice = [];
  ice.push({ urls: 'stun:stun.l.google.com:19302' });
  const { TURN_URL, TURN_USERNAME, TURN_CREDENTIAL } = process.env;
  if (TURN_URL) {
    ice.push({
      urls: TURN_URL,
      username: TURN_USERNAME || undefined,
      credential: TURN_CREDENTIAL || undefined,
    });
  } else {
    // Free default relay (Open Relay Project, metered.ca): no signup, kept
    // as a fallback so calls connect behind strict NAT out of the box.
    // WebRTC media is DTLS-SRTP end-to-end encrypted — a shared relay only
    // ever forwards ciphertext. Override with TURN_URL for self-hosted coturn.
    ice.push({
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    });
  }
  res.json({ iceServers: ice, turnConfigured: !!TURN_URL });
});

// ═══════════════════════════════════════════════════════════════════
// WebSocket signaling — in-memory, per-room
// ═══════════════════════════════════════════════════════════════════
// Map<roomCode, Map<ws, { role: 'doctor'|'patient', subjectId: string }>>
const rooms = new Map();

/**
 * Attach a WebSocket server to an existing HTTP server.
 * Call from server.js: attachTelehealthWs(server)
 */
export function attachTelehealthWs(server) {
  const wss = new WebSocketServer({ server, path: '/ws/telehealth' });

  wss.on('connection', async (ws, req) => {
    // Authenticate via query param token
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    const roomCode = url.searchParams.get('room');

    if (!token || !roomCode) {
      ws.close(4001, 'Missing token or room parameter');
      return;
    }

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      ws.close(4002, 'Invalid or expired token');
      return;
    }

    const role = payload.role === 'kv-patient' ? 'patient' : 'doctor';
    const subjectId = payload.sub;

    // Verify room exists and user has access
    let room = null;
    try {
      room = await db.prepare(
        'SELECT * FROM telehealth_rooms WHERE id = ? AND status IN (?, ?)'
      ).get(roomCode, 'waiting', 'active');
    } catch {
      ws.close(4003, 'Room lookup failed');
      return;
    }

    if (!room) {
      ws.close(4003, 'Room not found or ended');
      return;
    }

    // Verify user owns this room
    if (role === 'doctor' && room.doctor_id !== subjectId) {
      ws.close(4004, 'Not authorized for this room');
      return;
    }
    if (role === 'patient') {
      const [ownerId, mrn] = subjectId.split('::');
      if (room.doctor_id !== ownerId || room.patient_mrn !== mrn) {
        ws.close(4004, 'Not authorized for this room');
        return;
      }
    }

    // Add to room
    if (!rooms.has(roomCode)) rooms.set(roomCode, new Map());
    const roomClients = rooms.get(roomCode);
    roomClients.set(ws, { role, subjectId });

    // Mark room as active
    await db.prepare("UPDATE telehealth_rooms SET status = 'active' WHERE id = ? AND status = 'waiting'").run(roomCode);

    console.log(`[telehealth] ${role} connected to room ${roomCode} (${roomClients.size} clients)`);

    // Notify other clients in the room
    broadcast(roomCode, { type: 'peer-joined', role, timestamp: Date.now() }, ws);

    // Handle messages
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        handleSignalingMessage(ws, roomCode, role, subjectId, msg);
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    // Handle disconnect
    ws.on('close', () => {
      roomClients.delete(ws);
      console.log(`[telehealth] ${role} disconnected from room ${roomCode} (${roomClients.size} clients)`);

      broadcast(roomCode, { type: 'peer-left', role, timestamp: Date.now() });

      // If room is empty, end it (fire-and-forget async DB update)
      if (roomClients.size === 0) {
        db.prepare("UPDATE telehealth_rooms SET status = 'ended', ended_at = ? WHERE id = ?")
          .run(new Date().toISOString(), roomCode)
          .then(() => {
            rooms.delete(roomCode);
            console.log(`[telehealth] Room ${roomCode} ended (empty)`);
          })
          .catch(err => console.error('[telehealth] Failed to end room:', err.message));
      }
    });

    ws.on('error', (err) => {
      console.error(`[telehealth] WS error in room ${roomCode}:`, err.message);
    });

    // Send connection confirmation
    ws.send(JSON.stringify({
      type: 'connected',
      roomCode,
      role,
      peers: roomClients.size - 1,
      timestamp: Date.now(),
    }));
  });

  console.log('[telehealth] WebSocket signaling server attached at /ws/telehealth');
}

function handleSignalingMessage(ws, roomCode, role, subjectId, msg) {
  const { type, data } = msg;

  // Forward WebRTC signaling to the other peer
  if (['offer', 'answer', 'candidate'].includes(type)) {
    broadcast(roomCode, {
      type,
      data,
      sender: role,
      senderId: subjectId,
      timestamp: Date.now(),
    }, ws); // exclude sender
    return;
  }

  // Chat messages
  if (type === 'chat') {
    broadcast(roomCode, {
      type: 'chat',
      data: { text: data?.text?.slice(0, 2000) || '', sender: role },
      sender: role,
      timestamp: Date.now(),
    }); // include sender so they see their own message confirmed
    return;
  }

  // Mute/unmute status
  if (type === 'status') {
    broadcast(roomCode, {
      type: 'status',
      data: { muted: data?.muted, videoOff: data?.videoOff },
      sender: role,
      timestamp: Date.now(),
    }, ws);
    return;
  }

  // Unknown message type
  ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${type}` }));
}

function broadcast(roomCode, message, excludeWs = null) {
  const roomClients = rooms.get(roomCode);
  if (!roomClients) return;
  const payload = JSON.stringify(message);
  for (const [client] of roomClients) {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// HTTP ROUTES — Room management only (signaling is via WebSocket)
// ═══════════════════════════════════════════════════════════════════

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

    // Notify patient
    notifySubject(`${req.auth.subjectId}::${patientMrn}`, {
      title: '📹 Video Call Room Ready',
      body: `Your doctor has opened a video consultation room. Join when ready.`,
      url: '/patient.html',
    }).catch(() => {});

    await writeAudit({
      actorId: req.auth.subjectId, actorRole: 'doctor',
      action: 'telehealth.room_create', targetId: roomCode,
      detail: { mrn: patientMrn }, ip: req.ip,
    });

    res.status(201).json({ ok: true, roomCode, status: 'waiting' });
  })
);

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

telehealthRouter.post('/rooms/:code/end', authenticate, requireRole('doctor', 'admin'),
  asyncHandler(async (req, res) => {
    const code = req.params.code.toUpperCase();
    const now = new Date().toISOString();

    const result = await db.prepare(`
      UPDATE telehealth_rooms SET status = 'ended', ended_at = ?
      WHERE id = ? AND doctor_id = ? AND status != 'ended'
    `).run(now, code, req.auth.subjectId);

    if (result.changes === 0) return res.status(404).json({ error: 'Room not found' });

    // Close all WebSocket connections in this room
    const roomClients = rooms.get(code);
    if (roomClients) {
      for (const [client] of roomClients) {
        client.close(4010, 'Room ended by doctor');
      }
      rooms.delete(code);
    }

    await writeAudit({
      actorId: req.auth.subjectId, actorRole: 'doctor',
      action: 'telehealth.room_end', targetId: code, ip: req.ip,
    });

    res.json({ ok: true, message: 'Call ended' });
  })
);

// ── Patient routes ──

function patientScope(req, res, next) {
  const [ownerId, mrn] = String(req.auth.subjectId).split('::');
  if (!ownerId || !mrn) return res.status(401).json({ error: 'Invalid session' });
  req.patientScope = { ownerId, mrn };
  next();
}

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

telehealthRouter.post('/rooms/:code/join', authenticate, requireRole('kv-patient'), patientScope,
  asyncHandler(async (req, res) => {
    const code = req.params.code.toUpperCase();
    const { ownerId, mrn } = req.patientScope;

    const room = await db.prepare(`
      SELECT * FROM telehealth_rooms
      WHERE id = ? AND doctor_id = ? AND patient_mrn = ? AND status IN ('waiting', 'active')
    `).get(code, ownerId, mrn);

    if (!room) return res.status(404).json({ error: 'No active video room found' });

    await db.prepare("UPDATE telehealth_rooms SET status = 'active' WHERE id = ?").run(code);

    await writeAudit({
      actorId: mrn, actorRole: 'kv-patient',
      action: 'telehealth.room_join', targetId: code, ip: req.ip,
    });

    // Patient connects via WebSocket separately — this just marks the room
    res.json({ ok: true, roomCode: code, status: 'active' });
  })
);

// ── Cleanup expired rooms ──
const SIGNAL_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

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
  }, 10 * 60 * 1000);
}

// ── Room code generator ──
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
