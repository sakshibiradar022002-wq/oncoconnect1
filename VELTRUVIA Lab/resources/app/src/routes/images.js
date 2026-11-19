// ═══════════════════════════════════════════════════════════════════════
// IMAGING — patient image upload, gallery, profile picture and time-limited
// sharing.
//
// Design notes (mirrors routes/enhancements.js attachments, deliberately):
//   • Uploads are RAW-BODY (no multer): the client sends the image bytes as
//     the request body with x-filename / Content-Type headers.
//   • Files live OUTSIDE the web root under data/images and are only
//     reachable through authenticated routes (or a single-use share token).
//   • Metadata is stored encrypted (PHI key) in kv_store as `img_<id>`, so
//     a stolen DB file leaks no patient names, MRNs or filenames.
//   • Every byte read is verified against the SHA-256 recorded at upload.
//   • Sharing returns an opaque token; the public route serves ONLY bytes —
//     never the MRN, patient name or original filename.
// ═══════════════════════════════════════════════════════════════════════
import { Router } from 'express';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync, statSync } from 'node:fs';
import { join, dirname as _dirname, extname } from 'node:path';
import { db, writeAudit } from '../db/index.js';
import { encryptPHI, decryptPHI, randomToken } from '../crypto.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/validate.js';
import { canAccessMrn } from './enhancements.js';

export const imagesRouter = Router();

const DATA_DIR = _dirname(process.env.DB_PATH || './data/veltruvia.db');
const IMAGE_DIR = join(DATA_DIR, 'images');
try { mkdirSync(IMAGE_DIR, { recursive: true }); } catch {}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB per image
const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.dcm']);
const MIME_BY_EXT = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.dcm': 'application/dicom',
};
const DEFAULT_SHARE_DAYS = 7;
const MAX_SHARE_DAYS = 30;

// ── Storage helpers ───────────────────────────────────────────────
async function readMeta(id) {
  const row = await db.prepare('SELECT owner_id, v_enc FROM kv_store WHERE k = ?').get('img_' + id);
  if (!row) return null;
  try { return JSON.parse(decryptPHI(row.v_enc)); } catch { return null; }
}

async function writeMeta(meta) {
  const v = encryptPHI(JSON.stringify(meta));
  const existing = await db.prepare('SELECT k FROM kv_store WHERE k = ?').get('img_' + meta.id);
  if (existing) {
    await db.prepare('UPDATE kv_store SET v_enc = ?, updated_at = datetime(\'now\') WHERE k = ?')
      .run(v, 'img_' + meta.id);
  } else {
    await db.prepare('INSERT INTO kv_store (owner_id, k, v_enc, updated_at) VALUES (?, ?, ?, datetime(\'now\'))')
      .run(meta.uploadedBy, 'img_' + meta.id, v);
  }
}

function filePath(meta) { return join(IMAGE_DIR, meta.id + meta.ext); }

// Public shape — never expose the on-disk filename or share token in listings.
function publicMeta(m) {
  return {
    id: m.id,
    mrn: m.mrn,
    originalName: m.originalName,
    mimeType: m.mimeType,
    sizeBytes: m.sizeBytes,
    width: m.width ?? null,
    height: m.height ?? null,
    capturedAt: m.capturedAt ?? null,
    note: m.note ?? '',
    url: `/api/images/${m.id}/file`,
    createdAt: m.createdAt,
    sharedUntil: m.share?.expiresAt && Date.parse(m.share.expiresAt) > Date.now()
      ? m.share.expiresAt : null,
  };
}

function sniffImageExt(buf, declared) {
  const declaredExt = String(declared || '').toLowerCase();
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.length >= 6 && buf.subarray(0, 3).toString('latin1') === 'GIF') return '.gif';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF'
      && buf.subarray(8, 12).toString('latin1') === 'WEBP') return '.webp';
  if (buf.length >= 2 && buf.subarray(0, 2).toString('latin1') === 'BM') return '.bmp';
  if (buf.length >= 132 && buf.subarray(128, 132).toString('latin1') === 'DICM') return '.dcm';
  return ALLOWED_EXT.has(declaredExt) ? declaredExt : null;
}

function sendBytes(res, buf, mimeType, filename, { inline = true } = {}) {
  res.setHeader('Content-Type', mimeType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Header-injection guard: quotes, backslashes, CR/LF and control chars out.
  const safeName = String(filename || 'image').replace(/[^\w.\- ()]/g, '_').slice(0, 120);
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${safeName}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(buf);
}

/** Resolve a stored image for `id` and enforce chart access. */
async function loadAuthorized(req, res) {
  const meta = await readMeta(req.params.id);
  if (!meta) { res.status(404).json({ error: 'Image not found' }); return null; }
  if (!(await canAccessMrn(req, meta.mrn))) { res.status(403).json({ error: 'Forbidden' }); return null; }
  return meta;
}

// ═══════════════════════════════════════════════════════════════════
// 0. Share an image — POST /api/images/share  { imageId, expiresInDays }
//    Declared before /:mrn so "share" is not treated as an MRN.
imagesRouter.post('/share', authenticate, requireRole('doctor', 'admin'), asyncHandler(async (req, res) => {
  const parsed = z.object({
    imageId: z.string().min(1),
    expiresInDays: z.number().int().min(1).max(MAX_SHARE_DAYS).optional(),
  }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten() });
  }
  const days = parsed.data.expiresInDays ?? DEFAULT_SHARE_DAYS;
  const meta = await readMeta(parsed.data.imageId);
  if (!meta) return res.status(404).json({ error: 'Image not found' });
  if (!(await canAccessMrn(req, meta.mrn))) return res.status(403).json({ error: 'Forbidden' });

  const token = randomToken(16);
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
  meta.share = { token, expiresAt, createdBy: req.auth.subjectId, createdAt: new Date().toISOString() };
  await writeMeta(meta);
  writeAudit({
    actorId: req.auth.subjectId, actorRole: req.auth.role, action: 'image.shared',
    targetId: meta.mrn, detail: { id: meta.id, expiresAt }, ip: req.ip,
  });

  res.json({ ok: true, shareToken: token, shareUrl: `/api/images/shared/${token}`, expiresAt });
}));

// ═══════════════════════════════════════════════════════════════
// 1. Upload  POST /api/images/:mrn   (raw body, x-filename header)
//    NOTE: declared AFTER /share so the literal segment is never swallowed
//    by the :mrn parameter.
imagesRouter.post('/:mrn', authenticate, requireRole('doctor', 'admin', 'kv-patient'), asyncHandler(async (req, res) => {
  const mrn = String(req.params.mrn || '').toUpperCase();
  if (!(await canAccessMrn(req, mrn))) return res.status(403).json({ error: 'Forbidden' });

  let buf;
  if (Buffer.isBuffer(req.body) && req.body.length) buf = req.body;
  else {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    buf = Buffer.concat(chunks);
  }
  if (!buf.length) return res.status(400).json({ error: 'Empty body — send the image bytes' });

  const declaredName = String(req.headers['x-filename'] || 'image').replace(/[^\w.\- ()]/g, '_').slice(0, 120);
  const ext = sniffImageExt(buf, extname(declaredName));
  if (!ext) return res.status(415).json({ error: 'Unsupported image type (png, jpg, gif, webp, bmp, dcm)' });
  if (buf.length > MAX_IMAGE_BYTES) return res.status(413).json({ error: 'Image too large (max 10 MB)' });

  const id = randomToken(12);
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const meta = {
    id,
    mrn,
    ext,
    originalName: declaredName.toLowerCase().endsWith(ext) ? declaredName : declaredName + ext,
    mimeType: MIME_BY_EXT[ext] || 'application/octet-stream',
    sizeBytes: buf.length,
    sha256,
    note: String(req.headers['x-note'] || '').slice(0, 300),
    capturedAt: req.headers['x-captured-at'] || null,
    uploadedBy: req.auth.subjectId,
    createdAt: new Date().toISOString(),
    share: null,
  };

  writeFileSync(filePath(meta), buf);
  await writeMeta(meta);
  writeAudit({
    actorId: req.auth.subjectId, actorRole: req.auth.role, action: 'image.uploaded',
    targetId: mrn, detail: { id, bytes: buf.length, mimeType: meta.mimeType }, ip: req.ip,
  });

  res.status(201).json({ ok: true, image: publicMeta(meta), sha256 });
}));

// ═══════════════════════════════════════════════════════════════════
// 2. Public share read — GET /api/images/shared/:token
//    MUST be declared before /:id so the literal segment wins.
//    Serves bytes only; no identifiers leave the server.
imagesRouter.get('/shared/:token', asyncHandler(async (req, res) => {
  const token = String(req.params.token || '');
  // randomToken() produces base64url — 16 bytes → 22 chars.
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return res.status(404).json({ error: 'Not found' });

  const rows = await db.prepare("SELECT v_enc FROM kv_store WHERE k LIKE 'img_%'").all();
  for (const r of rows) {
    let m;
    try { m = JSON.parse(decryptPHI(r.v_enc)); } catch { continue; }
    if (!m?.share || m.share.token !== token) continue;
    if (!m.share.expiresAt || Date.parse(m.share.expiresAt) < Date.now()) {
      return res.status(410).json({ error: 'Share link expired' });
    }
    const p = filePath(m);
    if (!existsSync(p)) return res.status(404).json({ error: 'Not found' });
    const buf = readFileSync(p);
    if (createHash('sha256').update(buf).digest('hex') !== m.sha256) {
      return res.status(500).json({ error: 'Integrity check failed — image may be corrupted' });
    }
    return sendBytes(res, buf, m.mimeType, 'shared' + m.ext);
  }
  return res.status(404).json({ error: 'Not found' });
}));

// ═══════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════
// 4. Profile picture — GET /api/images/profile/:patientId (latest image)
imagesRouter.get('/profile/:patientId', authenticate, requireRole('doctor', 'admin', 'kv-patient'), asyncHandler(async (req, res) => {
  const mrn = String(req.params.patientId || '').toUpperCase();
  if (!(await canAccessMrn(req, mrn))) return res.status(403).json({ error: 'Forbidden' });
  const rows = await db.prepare("SELECT v_enc FROM kv_store WHERE k LIKE 'img_%'").all();
  let latest = null;
  for (const r of rows) {
    let m;
    try { m = JSON.parse(decryptPHI(r.v_enc)); } catch { continue; }
    if (m?.mrn !== mrn) continue;
    if (!latest || String(m.createdAt) > String(latest.createdAt)) latest = m;
  }
  if (!latest) return res.status(404).json({ error: 'No profile picture found' });
  res.json({ image: publicMeta(latest) });
}));

// ═══════════════════════════════════════════════════════════════════
// 5. Gallery — GET /api/images?mrn=ABC123
imagesRouter.get('/', authenticate, requireRole('doctor', 'admin', 'kv-patient', 'lab'), asyncHandler(async (req, res) => {
  const mrn = String(req.query.mrn || '').toUpperCase();
  if (!mrn) return res.status(400).json({ error: 'mrn query parameter is required' });
  if (!(await canAccessMrn(req, mrn))) return res.status(403).json({ error: 'Forbidden' });

  const rows = await db.prepare("SELECT v_enc FROM kv_store WHERE k LIKE 'img_%'").all();
  const images = [];
  for (const r of rows) {
    let m;
    try { m = JSON.parse(decryptPHI(r.v_enc)); } catch { continue; }
    if (m?.mrn === mrn) images.push(publicMeta(m));
  }
  images.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json({ images });
}));

// ═══════════════════════════════════════════════════════════════════
// 6. Metadata — GET /api/images/:id
imagesRouter.get('/:id', authenticate, requireRole('doctor', 'admin', 'kv-patient', 'lab'), asyncHandler(async (req, res) => {
  const meta = await loadAuthorized(req, res);
  if (!meta) return;
  res.json({ image: publicMeta(meta) });
}));

// 7. Bytes — GET /api/images/:id/file
imagesRouter.get('/:id/file', authenticate, requireRole('doctor', 'admin', 'kv-patient', 'lab'), asyncHandler(async (req, res) => {
  const meta = await loadAuthorized(req, res);
  if (!meta) return;
  const p = filePath(meta);
  if (!existsSync(p)) return res.status(404).json({ error: 'File missing' });
  let buf;
  try { buf = readFileSync(p); } catch { return res.status(500).json({ error: 'Read failed' }); }
  if (createHash('sha256').update(buf).digest('hex') !== meta.sha256) {
    return res.status(500).json({ error: 'Integrity check failed — image may be corrupted' });
  }
  sendBytes(res, buf, meta.mimeType, meta.originalName);
}));

// ═══════════════════════════════════════════════════════════════════
// 8. Delete — DELETE /api/images/:id
imagesRouter.delete('/:id', authenticate, requireRole('doctor', 'admin', 'kv-patient'), asyncHandler(async (req, res) => {
  const meta = await loadAuthorized(req, res);
  if (!meta) return;
  // A patient may delete only images they uploaded themselves.
  if (req.auth.role === 'kv-patient' && meta.uploadedBy !== req.auth.subjectId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try { if (statSync(filePath(meta)).isFile()) unlinkSync(filePath(meta)); } catch {}
  await db.prepare('DELETE FROM kv_store WHERE k = ?').run('img_' + meta.id);
  writeAudit({
    actorId: req.auth.subjectId, actorRole: req.auth.role, action: 'image.deleted',
    targetId: meta.mrn, detail: { id: meta.id }, ip: req.ip,
  });
  res.json({ ok: true, message: 'Image deleted' });
}));
