// ═══════════════════════════════════════════════════════════════════════
// V2.1 ENHANCEMENTS — attachments, lab delta-check, reference ranges,
// instrument status, vitals/lab trends.
//
// Design notes:
//   • Attachments use RAW-BODY upload (no multer): the client sends the
//     file bytes as the request body with x-filename/content-type headers.
//     Files live OUTSIDE the web root under data/attachments and are only
//     reachable through auth-gated routes. Plain-text files are encrypted
//     at rest with the PHI key; binary formats keep their integrity via a
//     SHA-256 recorded in the metadata row (encrypting PDFs adds no real
//     protection once the OS handles them, and breaks in-browser preview).
//   • Delta-check compares each new numeric result against the same
//     biomarker's most recent prior value for that patient and flags
//     clinically significant moves. Rules live in reference_ranges.
//   • Trends read the EXISTING stores: daily logs (logs-store.json via
//     sync.js) for vitals and biomarker_results for labs — no new data
//     duplication.
// ═══════════════════════════════════════════════════════════════════════
import { Router } from 'express';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { mkdirSync as _mkdirSync, writeFileSync as _writeFileSync, readFileSync as _readFileSync, readdirSync as _readdirSync, statSync as _statSync, existsSync as _existsSync, unlinkSync as _unlinkSync } from 'node:fs';
import { join as _join, dirname as _dirname, extname as _extname } from 'node:path';
import { db, writeAudit } from '../db/index.js';
import { encryptPHI, decryptPHI, randomToken } from '../crypto.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate, asyncHandler } from '../middleware/validate.js';

export const enhanceRouter = Router();

const DATA_DIR = _dirname(process.env.DB_PATH || './data/veltruvia.db');
const ATTACH_DIR = _join(DATA_DIR, 'attachments');
try { _mkdirSync(ATTACH_DIR, { recursive: true }); } catch {}

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB per file

const ALLOWED_EXT = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.txt', '.csv', '.json', '.dcm', '.xml', '.hl7']);
const TEXT_EXT = new Set(['.txt', '.csv', '.json', '.xml', '.hl7']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']);

// ── Lab reference ranges (age/sex aware, admin-editable) ──────────
// ages: [minYears, maxYears] (999 = no upper bound), sex: any|male|female
const DEFAULT_RANGES = [
  { biomarker: 'hemoglobin',   unit: 'g/dL',  sex: 'male',   min: 13.5, max: 17.5, ageMin: 0, ageMax: 999 },
  { biomarker: 'hemoglobin',   unit: 'g/dL',  sex: 'female', min: 12.0, max: 15.5, ageMin: 0, ageMax: 999 },
  { biomarker: 'wbc',          unit: '/µL',   sex: 'any',    min: 4000, max: 11000, ageMin: 0, ageMax: 999 },
  { biomarker: 'platelets',    unit: '/µL',   sex: 'any',    min: 150000, max: 450000, ageMin: 0, ageMax: 999 },
  { biomarker: 'glucose',      unit: 'mg/dL', sex: 'any',    min: 70, max: 99, ageMin: 0, ageMax: 999 },
  { biomarker: 'hba1c',        unit: '%',     sex: 'any',    min: 4.0, max: 5.6, ageMin: 0, ageMax: 999 },
  { biomarker: 'creatinine',   unit: 'mg/dL', sex: 'male',   min: 0.7, max: 1.3, ageMin: 0, ageMax: 999 },
  { biomarker: 'creatinine',   unit: 'mg/dL', sex: 'female', min: 0.6, max: 1.1, ageMin: 0, ageMax: 999 },
  { biomarker: 'sodium',       unit: 'mmol/L', sex: 'any',   min: 135, max: 145, ageMin: 0, ageMax: 999 },
  { biomarker: 'potassium',    unit: 'mmol/L', sex: 'any',   min: 3.5, max: 5.1, ageMin: 0, ageMax: 999 },
  { biomarker: 'alt',          unit: 'U/L',   sex: 'any',    min: 7, max: 56, ageMin: 0, ageMax: 999 },
  { biomarker: 'ast',          unit: 'U/L',   sex: 'any',    min: 10, max: 40, ageMin: 0, ageMax: 999 },
  { biomarker: 'crp',          unit: 'mg/L',  sex: 'any',    min: 0, max: 5, ageMin: 0, ageMax: 999 },
  { biomarker: 'ldh',          unit: 'U/L',   sex: 'any',    min: 140, max: 280, ageMin: 0, ageMax: 999 },
];

// ═══════════════════════════════════════════════════════════════════
// Delta-check engine
// ═══════════════════════════════════════════════════════════════════
// Normalizes biomarker names so "Hemoglobin", "HGB" and "hgb" match.
const NAME_ALIASES = {
  hgb: 'hemoglobin', hb: 'hemoglobin', haemoglobin: 'hemoglobin',
  wbc: 'wbc', 'white blood cell': 'wbc', leukocytes: 'wbc',
  plt: 'platelets', platelet: 'platelets',
  'fasting glucose': 'glucose', 'fasting blood sugar': 'glucose', fbs: 'glucose', glucose_fasting: 'glucose',
  a1c: 'hba1c', 'glycated hemoglobin': 'hba1c',
  cr: 'creatinine', 'serum creatinine': 'creatinine',
  na: 'sodium', k: 'potassium', sgpt: 'alt', 'alt (sgpt)': 'alt', sgot: 'ast', 'ast (sgot)': 'ast',
};

function canonName(name) {
  const key = String(name || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  return NAME_ALIASES[key] || key;
}

// Relative + absolute change thresholds that warrant attention. Tuned to
// standard delta-check practice (e.g. hemoglobin ±20%, potassium ±0.5 mmol/L).
const DELTA_RULES = {
  hemoglobin: { relPct: 20, abs: 1.5 },
  wbc: { relPct: 50, abs: 4000 },
  platelets: { relPct: 30, abs: 50000 },
  glucose: { relPct: 40, abs: 40 },
  hba1c: { relPct: 15, abs: 0.5 },
  creatinine: { relPct: 30, abs: 0.3 },
  sodium: { relPct: 4, abs: 4 },
  potassium: { relPct: 15, abs: 0.5 },
  alt: { relPct: 50, abs: 30 },
  ast: { relPct: 50, abs: 30 },
  crp: { relPct: 100, abs: 10 },
  ldh: { relPct: 30, abs: 80 },
};

export async function computeDeltaCheck({ patientMrn, biomarker, numericValue, reportDate, excludeId }) {
  if (numericValue == null || Number.isNaN(Number(numericValue))) return null;
  const canon = canonName(biomarker);
  // excludeId skips the row we JUST inserted (both call sites insert first).
  // Never filter on created_at vs datetime('now') — SQLite's datetime format
  // differs from our ISO strings and the comparison silently excludes all rows.
  const prior = await db.prepare(`
    SELECT numeric_value, report_date, result FROM biomarker_results
    WHERE patient_mrn = ? AND id != COALESCE(?, '')
      AND lower(biomarker) LIKE ?
    ORDER BY created_at DESC LIMIT 1
  `).get(patientMrn, excludeId || '', `%${canon.slice(0, Math.max(4, canon.length - 1))}%`);

  if (!prior || prior.numeric_value == null) return null;
  const prev = Number(prior.numeric_value);
  const curr = Number(numericValue);
  if (!Number.isFinite(prev) || prev === 0) return null;

  const relChange = ((curr - prev) / Math.abs(prev)) * 100;
  const absChange = curr - prev;
  const rule = DELTA_RULES[canon];

  let flag = null;
  if (rule) {
    if (Math.abs(relChange) >= rule.relPct || Math.abs(absChange) >= rule.abs) {
      flag = {
        type: 'delta',
        direction: curr > prev ? 'up' : 'down',
        prevValue: prev,
        prevDate: prior.report_date,
        relChangePct: Math.round(relChange * 10) / 10,
        absChange: Math.round(absChange * 100) / 100,
        severity: Math.abs(relChange) >= rule.relPct * 2 ? 'critical' : 'warning',
        message: `${biomarker} ${curr > prev ? '▲' : '▼'} ${Math.abs(Math.round(relChange))}% vs ${String(prior.report_date || '').slice(0, 10)} (${prev}→${curr})`,
      };
    }
  }

  // Range check (age/sex aware when DOB is known). Patient data may live in
  // kv_store (encrypted) or the JSON patient store — decrypt failures or a
  // missing record must NOT kill the whole range check, only disable the
  // age/sex refinement.
  let rangeFlag = null;
  try {
    let dob = null, sex = 'any';
    try {
      const patRow = await db.prepare("SELECT v_enc FROM kv_store WHERE k = ?").get('pat_' + patientMrn);
      if (patRow?.v_enc) {
        const pat = JSON.parse(decryptPHI(patRow.v_enc));
        dob = pat.dob || pat.dateOfBirth || null;
        sex = String(pat.sex || pat.gender || 'any').toLowerCase().startsWith('f') ? 'female'
            : String(pat.sex || pat.gender || 'any').toLowerCase().startsWith('m') ? 'male' : 'any';
      }
    } catch { /* fall back to sex=any, no age filter */ }
    let age = null;
    if (dob) age = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86400000));
    const rows = await db.prepare(`SELECT * FROM reference_ranges WHERE lower(biomarker) = ?`).all(canon);
    const candidates = rows.filter(r =>
      (r.sex === 'any' || r.sex === sex)
      && (age == null || (age >= (r.age_min ?? 0) && age <= (r.age_max ?? 120))));
    const band = candidates.find(r => r.sex === sex) || candidates.find(r => r.sex === 'any');
    if (band && curr < band.min) {
      rangeFlag = { type: 'range', direction: 'low', min: band.min, max: band.max, unit: band.unit, severity: 'warning', message: `Below range (${band.min}–${band.max} ${band.unit || ''})` };
    } else if (band && curr > band.max) {
      rangeFlag = { type: 'range', direction: 'high', min: band.min, max: band.max, unit: band.unit, severity: 'warning', message: `Above range (${band.min}–${band.max} ${band.unit || ''})` };
    }
  } catch { /* range check is best-effort */ }

  const flags = [flag, rangeFlag].filter(Boolean);
  return flags.length ? { flags, critical: flags.some(f => f.severity === 'critical') } : null;
}

// ═══════════════════════════════════════════════════════════════════
// Reference-range admin endpoints
// ═══════════════════════════════════════════════════════════════════
const rangeSchema = z.object({
  biomarker: z.string().min(1).max(80),
  unit: z.string().max(24).optional().nullable(),
  sex: z.enum(['any', 'male', 'female']).default('any'),
  min: z.number(),
  max: z.number(),
  ageMin: z.number().min(0).max(120).default(0),
  ageMax: z.number().min(0).max(120).default(120),
});

enhanceRouter.get('/lab/ranges', authenticate, requireRole('doctor', 'admin', 'lab'), asyncHandler(async (req, res) => {
  const rows = await db.prepare('SELECT * FROM reference_ranges ORDER BY biomarker, sex, age_min').all();
  // Seed defaults on first read so the admin sees something useful
  if (!rows.length) {
    for (const r of DEFAULT_RANGES) {
      await db.prepare(`INSERT INTO reference_ranges (id, biomarker, unit, sex, min, max, age_min, age_max, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`).run(randomToken(12), r.biomarker, r.unit, r.sex, r.min, r.max, r.ageMin, r.ageMax === 999 ? 120 : r.ageMax);
    }
    const seeded = await db.prepare('SELECT * FROM reference_ranges ORDER BY biomarker, sex, age_min').all();
    return res.json({ ranges: seeded });
  }
  res.json({ ranges: rows });
}));

enhanceRouter.post('/lab/ranges', authenticate, requireRole('admin'), validate(rangeSchema), asyncHandler(async (req, res) => {
  const { biomarker, unit, sex, min, max, ageMin, ageMax } = req.body;
  await db.prepare(`INSERT INTO reference_ranges (id, biomarker, unit, sex, min, max, age_min, age_max, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`).run(
    randomToken(12), canonName(biomarker), unit || null, sex, min, max, ageMin, ageMax);
  writeAudit({ userId: req.auth.subjectId, action: 'range_upserted', category: 'clinical', details: { biomarker } });
  res.json({ ok: true });
}));

enhanceRouter.delete('/lab/ranges/:id', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const row = await db.prepare('SELECT biomarker FROM reference_ranges WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Range not found' });
  await db.prepare('DELETE FROM reference_ranges WHERE id = ?').run(req.params.id);
  writeAudit({ userId: req.auth.subjectId, action: 'range_deleted', category: 'clinical', details: { id: req.params.id, biomarker: row.biomarker } });
  res.json({ ok: true });
}));

// ═══════════════════════════════════════════════════════ enhancements.js (continued)
// ═══════════════════════════════════════════════════════════════════
// Vitals & lab trends — reads existing stores, no duplication
// ═══════════════════════════════════════════════════════════════════
function readLogsStore() {
  const p = _join(DATA_DIR, 'logs-store.json');
  try { if (_existsSync(p)) return JSON.parse(_readFileSync(p, 'utf-8')); } catch {}
  return {};
}

enhanceRouter.get('/trends/vitals/:mrn', authenticate, requireRole('doctor', 'admin', 'kv-patient'), asyncHandler(async (req, res) => {
  const mrn = String(req.params.mrn || '').toUpperCase();
  // Patients may only read their own chart
  if (req.auth.role === 'kv-patient' && req.auth.subjectId !== 'pat_' + mrn) {
    // fall through to ownership check via kv_store owner
    const row = await db.prepare('SELECT owner_id FROM kv_store WHERE k = ?').get('pat_' + mrn);
    if (!row || row.owner_id !== req.auth.subjectId) return res.status(403).json({ error: 'Forbidden' });
  }
  const logs = readLogsStore()[mrn] || [];
  const points = logs
    .map(l => ({
      date: l.date || (l.savedAt || '').slice(0, 10),
      bp: l.bp || null,             // "120/80"
      sys: l.bp ? Number(String(l.bp).split('/')[0]) : null,
      dia: l.bp ? Number(String(l.bp).split('/')[1]) : null,
      weight: l.weight != null && l.weight !== '' ? Number(l.weight) : null,
      temp: l.temp != null && l.temp !== '' ? Number(l.temp) : null,
      pulse: l.pulse != null && l.pulse !== '' ? Number(l.pulse) : null,
      spo2: l.spo2 != null && l.spo2 !== '' ? Number(l.spo2) : null,
      glucose: l.glucose != null && l.glucose !== '' ? Number(l.glucose) : null,
      headache: l.headache ?? null,
      fatigue: l.fatigue ?? null,
      mood: l.mood ?? null,
    }))
    .filter(p => p.date && (p.sys || p.weight || p.temp || p.pulse || p.spo2 || p.glucose))
    .sort((a, b) => a.date.localeCompare(b.date));
  res.json({ mrn, points });
}));

enhanceRouter.get('/trends/labs/:mrn', authenticate, requireRole('doctor', 'admin', 'kv-patient'), asyncHandler(async (req, res) => {
  const mrn = String(req.params.mrn || '').toUpperCase();
  if (req.auth.role === 'kv-patient' && req.auth.subjectId !== 'pat_' + mrn) {
    const row = await db.prepare('SELECT owner_id FROM kv_store WHERE kv_store.k = ?').get('pat_' + mrn);
    if (!row || row.owner_id !== req.auth.subjectId) return res.status(403).json({ error: 'Forbidden' });
  }
  const rows = await db.prepare(`
    SELECT biomarker, result, numeric_value, report_date, created_at FROM biomarker_results
    WHERE patient_mrn = ? AND numeric_value IS NOT NULL
    ORDER BY created_at ASC LIMIT 500
  `).all(mrn);
  const series = {};
  for (const r of rows) {
    const key = canonName(r.biomarker);
    (series[key] = series[key] || []).push({
      date: (r.report_date || r.created_at || '').slice(0, 10),
      value: Number(r.numeric_value),
    });
  }
  res.json({ mrn, series });
}));

// ═══════════════════════════════════════════════════════════════════
// Instrument / MLLP status for the Lab dashboard
// ═══════════════ port augmented below
enhanceRouter.get('/instrument-status', authenticate, requireRole('lab', 'admin', 'doctor'), asyncHandler(async (req, res) => {
  let mllp = { enabled: false };
  try {
    const { getMllpStatus } = await import('../hl7/mllp.js');
    mllp = getMllpStatus();
  } catch {}
  const last24 = await db.prepare(`
    SELECT COUNT(*) AS n FROM biomarker_results WHERE created_at >= datetime('now', '-1 day')
  `).get();
  const byLab = await db.prepare(`
    SELECT lab_name, COUNT(*) AS n FROM biomarker_results
    WHERE created_at >= datetime('now', '-7 day') GROUP BY lab_name ORDER BY n DESC LIMIT 5
  `).all();
  res.json({
    mllp,
    resultsLast24h: last24?.n || 0,
    topLabs7d: byLab || [],
    serverTime: new Date().toISOString(),
  });
}));

// ═══════════════════════════════════════════════════════════════════
// Attachments — raw-body upload, auth-gated download
enhanceRouter.post('/attachments/:mrn', authenticate, requireRole('doctor', 'admin', 'kv-patient'), asyncHandler(async (req, res) => {
  const mrn = String(req.params.mrn || '').toUpperCase();
  const kind = (req.headers['x-kind'] || 'document');
  const note = req.headers['x-note'] || '';
  // Patients can upload only to their own chart
  if (req.auth.role === 'kv-patient') {
    const row = await db.prepare('SELECT owner_id FROM kv_store WHERE k = ?').get('pat_' + mrn);
    if (!row || row.owner_id !== req.auth.subjectId) return res.status(403).json({ error: 'Forbidden' });
  }
  // Body arrives via express.raw (Buffer) when mounted; fall back to
  // streaming for direct node boots without the raw parser.
  let buf;
  if (Buffer.isBuffer(req.body) && req.body.length) {
    buf = req.body;
  } else {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    buf = Buffer.concat(chunks);
  }
  if (!buf.length) return res.status(400).json({ error: 'Empty body — send the file bytes' });
  if (buf.length > MAX_ATTACHMENT_BYTES) return res.status(413).json({ error: 'File too large (max 10 MB)' });
  const filename = String(req.headers['x-filename'] || 'file.bin').replace(/[^\w.\- ()]/g, '_').slice(0, 120);
  const ext = _extname(filename).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return res.status(415).json({ error: `Extension ${ext || '(none)'} not allowed` });

  const id = randomToken(12);
  const encName = `${id}${ext}`;
  const TEXT_EXT = new Set(['.txt', '.csv', '.json', '.xml', '.hl7']);
  let stored;
  if (TEXT_EXT.has(ext)) {
    stored = encryptPHI(buf.toString('utf8')); // encrypted at rest
  } else {
    stored = buf.toString('binary'); // binary passthrough; SHA-256 pins integrity
  }
  _writeFileSync(_join(ATTACH_DIR, encName), stored, 'binary');

  const sha = createHash('sha256').update(buf).digest('hex');
  const meta = {
    id, mrn, filename, ext, kind, note,
    bytes: buf.length,
    sha256: sha,
    uploadedBy: req.auth.subjectId,
    uploadedAt: new Date().toISOString(),
  };
  await db.prepare(`INSERT INTO kv_store (owner_id, k, v_enc, updated_at) VALUES (?, ?, ?, datetime('now'))`)
    .run(req.auth.subjectId, 'att_' + id, encryptPHI(JSON.stringify(meta)));

  writeAudit({ userId: req.auth.subjectId, action: 'attachment_uploaded', category: 'clinical', details: { mrn, filename, bytes: buf.length }, patientMrn: mrn });
  res.json({ ok: true, id, filename, bytes: buf.length, sha256: sha });
}));

enhanceRouter.get('/attachments/:mrn', authenticate, requireRole('doctor', 'admin', 'kv-patient'), asyncHandler(async (req, res) => {
  const mrn = String(req.params.mrn || '').toUpperCase();
  const rows = await db.prepare("SELECT k, v_enc FROM kv_store WHERE k LIKE 'att_%'").all();
  const list = [];
  for (const r of rows) {
    try {
      const m = JSON.parse(decryptPHI(r.v_enc));
      if (m.mrn === mrn) list.push(m);
    } catch {}
  }
  list.sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''));
  res.json({ attachments: list });
}));

enhanceRouter.get('/attachments/:mrn/:id', authenticate, requireRole('doctor', 'admin', 'kv-patient'), asyncHandler(async (req, res) => {
  const mrn = String(req.params.mrn || '').toUpperCase();
  const { id } = req.params;
  const row = await db.prepare("SELECT owner_id, v_enc FROM kv_store WHERE k = ?").get('att_' + id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const m = JSON.parse(decryptPHI(row.v_enc));
  if (req.auth.role === 'kv-patient') {
    const prow = await db.prepare('SELECT owner_id FROM kv_store WHERE k = ?').get('pat_' + mrn);
    if (!prow || prow.owner_id !== req.auth.subjectId) return res.status(403).json({ error: 'Forbidden' });
  }
  if (m.mrn !== mrn) return res.status(404).json({ error: 'Not found' });
  const p = _join(ATTACH_DIR, m.id + m.ext);
  if (!_existsSync(p)) return res.status(404).json({ error: 'File missing' });
  const raw = _readFileSync(p, 'binary');
  const TEXT_EXT = new Set(['.txt', '.csv', '.json', '.xml', '.hl7']);
  let body;
  try {
    body = TEXT_EXT.has(m.ext) ? Buffer.from(decryptPHI(raw), 'utf8') : Buffer.from(raw, 'binary');
  } catch (e) {
    // Tampered ciphertext usually fails GCM auth here — surface as integrity error
    return res.status(500).json({ error: 'Integrity check failed — file may be corrupted (decrypt error)' });
  }
  const sha = createHash('sha256').update(body).digest('hex');
  if (sha !== m.sha256) {
    return res.status(500).json({ error: 'Integrity check failed — file may be corrupted', expected: m.sha256, got: sha });
  }
  res.setHeader('Content-Type', m.ext === '.pdf' ? 'application/pdf'
    : ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(m.ext) ? `image/${m.ext.slice(1).replace('jpg', 'jpeg')}`
    : 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${m.filename}"`);
  res.send(body);
}));

enhanceRouter.delete('/attachments/:mrn/:id', authenticate, requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const row = await db.prepare("SELECT v_enc FROM kv_store WHERE k = ?").get('att_' + id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const m = JSON.parse(decryptPHI(row.v_enc));
  await db.prepare("DELETE FROM kv_store WHERE k = ?").run('att_' + id);
  try { _unlinkSync(_join(ATTACH_DIR, m.id + m.ext)); } catch {}
  writeAudit({ userId: req.auth.subjectId, action: 'attachment_deleted', category: 'clinical', details: { id }, patientMrn: m.mrn });
  res.json({ ok: true });
}));
