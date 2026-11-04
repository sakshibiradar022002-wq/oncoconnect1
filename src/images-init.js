// Images API router — all 7 imaging features (upload, gallery, profile, share, view, delete)
import { Router } from 'express';
import { fileURLToT } from 'node:url';
import { z } from 'zod';
import { db } from './db/index.js';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const __dirname = fileURLToT(new URL('.', import.meta.url));

const uploadDir = path.join(__dirname, '..', 'data', 'images');
const thumbnailDir = path.join(__dirname, '..', 'data', 'thumbnail');

// Ensure storage directories exist
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(thumbnailDir)) fs.mkdirSync(thumbnailDir, { recursive: true });

// Generate a 16-char SHA-256 hex share token
function makeShareToken() {
  return crypto.randomBytes(8).toString('hex');
}

// Initialize images table
export function initImages() {
  return db.prepare(`
    CREATE TABLE IF NOT EXISTS images (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      url TEXT NOT NULL,
      share_token TEXT,
      share_expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

// Image upload schema
const imageUploadSchema = z.object({
  patientId: z.string(),
  originalName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
});

// Gallery schema
const gallerySchema = z.object({
  patientId: z.string().optional(),
});

// Share token schema
const shareSchema = z.object({
  imageId: z.string(),
  expiresInDays: z.number().default(7),
});

export const imagesRouter = Router();

// 1. Upload image
imagesRouter.post('/', async (req, res) => {
  try {
    const result = imageUploadSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'Invalid data', details: result.error.format() });
    }

    const { patientId, originalName, mimeType, sizeBytes } = result.data;
    const id = crypto.randomBytes(16).toString('hex');
    const filename = `${id}.jpg`;
    const filePath = path.join(uploadDir, filename);
    const shareToken = makeShareToken();
    const shareExpiresAt = new Date();
    shareExpiresAt.setDate(shareExpiresAt.getDate() + 7); // 7 days default

    // Store file metadata in DB
    await db.prepare(`
      INSERT INTO images (id, patient_id, filename, original_name, mime_type, size_bytes, url, share_token, share_expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, patientId, filename, originalName, mimeType, sizeBytes, `/api/images/${id}`, shareToken, shareExpiresAt);

    res.json({ id, url: `/api/images/${id}`, shareToken, shareExpiresAt: shareExpiresAt.toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Gallery listing
imagesRouter.get('/', async (req, res) => {
  try {
    const patientId = req.query.patientId;
    let sql = 'SELECT id, filename, original_name, mime_type, size_bytes, url, share_token, share_expires_at, created_at FROM images';
    const params = [];

    if (patientId) {
      sql += ' WHERE patient_id = ?';
      params.push(patientId);
    }

    const rows = await db.prepare(sql).all(...params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Profile picture
imagesRouter.get('/profile/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params;
    const row = await db.prepare('SELECT id, filename, original_name, mime_type, size_bytes, url FROM images WHERE patient_id = ? ORDER BY created_at DESC LIMIT 1').get(patientId);
    if (!row) return res.status(404).json({ error: 'No profile picture found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. View specific image
imagesRouter.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const row = await db.prepare('SELECT id, filename, original_name, mime_type, size_bytes, url, created_at FROM images WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Image not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Share image
imagesRouter.post('/share', async (req, res) => {
  try {
    const result = shareSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'Invalid data', details: result.error.format() });
    }

    const { imageId, expiresInDays = 7 } = result.data;
    const shareToken = makeShareToken();
    const shareExpiresAt = new Date();
    shareExpiresAt.setDate(shareExpiresAt.getDate() + expiresInDays);

    // Update or insert share token
    await db.prepare(`
      INSERT INTO images (share_token, share_expires_at) VALUES (?, ?)
      ON CONFLICT(image_id) DO UPDATE SET share_token = ?, share_expires_at = ?
    `).run(imageId, shareToken, shareToken, shareExpiresAt);

    res.json({ shareToken, shareExpiresAt: shareExpiresAt.toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Delete image
imagesRouter.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Delete associated thumbnail if exists
    const thumbnailPath = path.join(thumbnailDir, `${id}_thumb.jpg`);
    if (fs.existsSync(thumbnailPath)) {
      fs.unlinkSync(thumbnailPath);
    }

    // Delete from DB
    await db.prepare('DELETE FROM images WHERE id = ?').run(id);

    res.json({ success: true, message: 'Image deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});