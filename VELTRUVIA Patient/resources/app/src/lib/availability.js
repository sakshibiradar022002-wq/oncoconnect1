// ═══════════════════════════════════════════════════════════════════════
// SHARED AVAILABILITY RESOLVER
// ═══════════════════════════════════════════════════════════════════════
// One source of truth for "which time blocks does this doctor accept
// bookings for on DATE X". Used by:
//   • /api/schedule/* (booking validation, doctor schedule CRUD)
//   • /api/sync/get-slots* (patient slot picker)
// so the picker can never offer a slot the booker will refuse.
//
// Resolution order (first hit wins):
//   1. doctor_availability DB table (doctor calendar)
//   2. availability-store.json — this doctor's rows
//   3. availability-store.json — any doctor's rows (single-doc clinics)
//   4. seeded defaults (Mon–Fri 9–12 / 14–17) so the system works day one
//
// Row shapes accepted (client sends the camelCase JSON shape):
//   weekly:  { dayOfWeek:0-6, startTime, endTime, slotDuration?, active? }
//   one-off: { date:"YYYY-MM-DD", startTime, endTime, slotDuration?, active? }
// One-off (date) rows live in the shared store only — the DB table is
// weekly-recurring by design.

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { db } from '../db/index.js';

export const AVAIL_STORE_PATH = join(dirname(process.env.DB_PATH || '.'), 'availability-store.json');
try { mkdirSync(dirname(AVAIL_STORE_PATH), { recursive: true }); } catch {}

// MUST stay identical to the seeds that used to live in routes/sync.js and
// routes/scheduling.js — single definition now so they can never diverge.
export const DEFAULT_AVAILABILITY = [
  { dayOfWeek: 1, startTime: '09:00', endTime: '12:00', slotDuration: 30, active: true },
  { dayOfWeek: 1, startTime: '14:00', endTime: '17:00', slotDuration: 30, active: true },
  { dayOfWeek: 2, startTime: '09:00', endTime: '12:00', slotDuration: 30, active: true },
  { dayOfWeek: 2, startTime: '14:00', endTime: '17:00', slotDuration: 30, active: true },
  { dayOfWeek: 3, startTime: '09:00', endTime: '12:00', slotDuration: 30, active: true },
  { dayOfWeek: 3, startTime: '14:00', endTime: '17:00', slotDuration: 30, active: true },
  { dayOfWeek: 4, startTime: '09:00', endTime: '12:00', slotDuration: 30, active: true },
  { dayOfWeek: 4, startTime: '14:00', endTime: '17:00', slotDuration: 30, active: true },
  { dayOfWeek: 5, startTime: '09:00', endTime: '12:00', slotDuration: 30, active: true },
  { dayOfWeek: 5, startTime: '14:00', endTime: '17:00', slotDuration: 30, active: true },
];

export function readAvailStore() {
  try { if (existsSync(AVAIL_STORE_PATH)) return JSON.parse(readFileSync(AVAIL_STORE_PATH, 'utf-8')); } catch {}
  return {};
}

// Normalize any accepted row shape into the DB-row shape that
// generateSlotsForDate understands (day_of_week/start_time/...), plus a
// `date` field for one-off rows.
function normalizeRow(r) {
  return {
    day_of_week: Number.isInteger(r.dayOfWeek) ? r.dayOfWeek : (r.date ? new Date(r.date + 'T00:00:00').getDay() : 1),
    start_time: r.startTime || '09:00',
    end_time: r.endTime || '17:00',
    slot_duration: r.slotDuration || 30,
    appointment_types: null,
    date: r.date || null,
  };
}

function activeRows(entries) {
  return (entries || []).filter(s => s && s.active !== false);
}

// Availability rows in effect for `ownerId` on `dateStr` ("YYYY-MM-DD").
// Date-specific rows are merged ON TOP of weekly rows so a doctor can add
// an extra clinic day (or the weekly row already covers it — overlaps are
// deduped by start time).
export async function effectiveAvailabilityRows(ownerId, dateStr) {
  const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay();
  const out = [];
  const seen = new Set();
  const push = (rows) => {
    for (const r of rows) {
      const n = normalizeRow(r);
      const key = n.date + '|' + n.start_time + '|' + n.end_time;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(n);
    }
  };

  // 1) DB calendar (weekly rows only)
  try {
    const dbRows = await db.prepare(
      'SELECT * FROM doctor_availability WHERE doctor_id = ? AND day_of_week = ? AND active = 1'
    ).all(ownerId, dayOfWeek);
    if (dbRows.length) push(dbRows);
  } catch { /* table missing on very old DBs — store/defaults still work */ }

  // 2 + 3) shared store: own rows first, then any doctor's
  const store = readAvailStore();
  const match = (r) => r.date
    ? r.date === dateStr
    : Number.isInteger(r.dayOfWeek) ? r.dayOfWeek === dayOfWeek : false;
  const own = activeRows(store[ownerId]).filter(match);
  if (own.length) push(own);
  else {
    for (const [key, entries] of Object.entries(store)) {
      if (key === ownerId) continue;
      const active = activeRows(entries).filter(match);
      if (active.length) { push(active); break; }
    }
  }

  // 4) seeded defaults (weekly only)
  if (!out.length) push(DEFAULT_AVAILABILITY.filter(r => r.dayOfWeek === dayOfWeek));
  return out;
}
