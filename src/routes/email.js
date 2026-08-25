// Email endpoints: doctor notifications (authenticated) and appointment
// reminders. No OTP or pre-auth email flows — registration is direct.

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { db, writeAudit } from '../db/index.js';
import { mailConfigured, mailProvider, sendMail, verifyMail } from '../mail.js';
import { authenticate } from '../middleware/auth.js';
import { validate, asyncHandler } from '../middleware/validate.js';
import { getReminderStatus, triggerReminderCheck } from '../reminders.js';

export const emailRouter = Router();

const sendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30, // 30 outbound mails / hour / IP for authenticated senders
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Email rate limit reached, please try again later' },
});

// ── Status: lets the UI show whether server email is live ─────────
import { smsConfigured } from '../sms.js';

emailRouter.get('/status', asyncHandler(async (req, res) => {
  if (req.query.verify === '1') return res.json(await verifyMail());
  res.json({ 
    configured: mailConfigured(), 
    provider: mailProvider(), 
    sms: await smsConfigured(),
  });
}));

// ── Authenticated outbound mail (appointment reminders, tests) ────
const sendSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(200),
  text: z.string().min(1).max(5000),
});

emailRouter.post('/send', authenticate, sendLimiter, validate(sendSchema), asyncHandler(async (req, res) => {
  if (!mailConfigured()) {
    return res.status(503).json({ error: 'Email is not configured on this server. Set GMAIL_USER and GMAIL_APP_PASSWORD.' });
  }
  const { to, subject, text } = req.valid;
  await sendMail({ to, subject, text });
  await writeAudit({
    actorId: req.auth.subjectId, actorRole: req.auth.role,
    action: 'email.send', detail: { to, subject }, ip: req.ip,
  });
  res.json({ ok: true });
}));

// ── Appointment reminders ────────────────────────────────────────
emailRouter.get('/reminders', authenticate, asyncHandler(async (req, res) => {
  const status = await getReminderStatus(req.auth.subjectId);
  res.json({ ok: true, reminders: status, emailConfigured: mailConfigured() });
}));

emailRouter.post('/reminders/check', authenticate, asyncHandler(async (req, res) => {
  if (req.auth.role !== 'admin') {
    const first = await db.prepare('SELECT id FROM users ORDER BY created_at ASC LIMIT 1').get();
    if (!first || first.id !== req.auth.subjectId) return res.status(403).json({ error: 'Admin access required' });
  }
  await triggerReminderCheck();
  res.json({ ok: true, message: 'Reminder check triggered' });
}));

// ═══════════════════════════════════════════════════════════════════
// Bulk email broadcast — send emails to all registered doctors/patients
// ═══════════════════════════════════════════════════════════════════
import { decryptPHI } from '../crypto.js';

async function requireAdminOrFirstDoctor(req, res, next) {
  if (req.auth.role === 'admin') return next();
  const first = await db.prepare('SELECT id FROM users ORDER BY created_at ASC LIMIT 1').get();
  if (first && first.id === req.auth.subjectId) return next();
  res.status(403).json({ error: 'Admin access required for broadcast' });
}

// GET /api/email/contacts — list all registered doctors and patients with emails
emailRouter.get('/contacts', authenticate, requireAdminOrFirstDoctor, asyncHandler(async (req, res) => {
  const filter = req.query.filter; // 'doctors', 'patients', or undefined (all)
  const contacts = [];

  // Doctors from the users table (email is plaintext)
  if (!filter || filter === 'doctors') {
    const doctors = await db.prepare(
      "SELECT id, email, name_enc FROM users WHERE email IS NOT NULL AND role IN ('doctor','admin')"
    ).all();
    for (const d of doctors) {
      contacts.push({
        type: 'doctor',
        email: d.email,
        name: decryptPHI(d.name_enc) || 'Doctor',
      });
    }
  }

  // Patients from kv_store (encrypted, key = pat_<MRN>)
  if (!filter || filter === 'patients') {
    const rows = await db.prepare("SELECT v_enc FROM kv_store WHERE k LIKE 'pat_%'").all();
    for (const r of rows) {
      try {
        const pat = decryptPHI(r.v_enc);
        if (pat && pat.email) {
          contacts.push({
            type: 'patient',
            email: pat.email,
            name: pat.name || 'Patient',
            mrn: pat.mrn || '—',
          });
        }
      } catch { /* skip corrupted entries */ }
    }
  }

  res.json({ ok: true, count: contacts.length, contacts });
}));

// Broadcast email schema
const broadcastSchema = z.object({
  to: z.enum(['all', 'doctors', 'patients']),
  subject: z.string().min(1).max(200),
  text: z.string().min(1).max(10000),
  html: z.string().max(50000).optional(),
});

// POST /api/email/broadcast — send email to all/filtered registered users
const broadcastLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5, // 5 broadcasts per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Broadcast rate limit reached (5/hour). Please try again later.' },
});

emailRouter.post('/broadcast', authenticate, requireAdminOrFirstDoctor, broadcastLimiter, validate(broadcastSchema), asyncHandler(async (req, res) => {
  if (!mailConfigured()) {
    return res.status(503).json({
      error: 'Email is not configured. Set RESEND_API_KEY (free at resend.com) or GMAIL_USER + GMAIL_APP_PASSWORD.',
    });
  }

  const { to, subject, text, html } = req.valid;

  // Collect recipient emails
  const recipients = [];
  const seen = new Set(); // deduplicate emails

  if (to === 'all' || to === 'doctors') {
    const doctors = await db.prepare(
      "SELECT email, name_enc FROM users WHERE email IS NOT NULL AND role IN ('doctor','admin')"
    ).all();
    for (const d of doctors) {
      const email = d.email.toLowerCase();
      if (!seen.has(email)) {
        seen.add(email);
        recipients.push({ email, name: decryptPHI(d.name_enc) || 'Doctor', type: 'doctor' });
      }
    }
  }

  if (to === 'all' || to === 'patients') {
    const rows = await db.prepare("SELECT v_enc FROM kv_store WHERE k LIKE 'pat_%'").all();
    for (const r of rows) {
      try {
        const pat = decryptPHI(r.v_enc);
        if (pat && pat.email) {
          const email = pat.email.toLowerCase();
          if (!seen.has(email)) {
            seen.add(email);
            recipients.push({ email, name: pat.name || 'Patient', type: 'patient' });
          }
        }
      } catch { /* skip corrupted entries */ }
    }
  }

  if (recipients.length === 0) {
    return res.json({ ok: true, sent: 0, failed: 0, total: 0, message: 'No recipients with email addresses found.' });
  }

  // Send emails sequentially with a small delay between them
  // (avoids hitting provider rate limits and is polite to SMTP servers)
  let sent = 0;
  let failed = 0;
  const errors = [];
  const SEND_DELAY_MS = 200; // 200ms between sends

  for (const recipient of recipients) {
    try {
      // Personalize the greeting if possible
      const personalizedText = text.replace(/\{name\}/gi, recipient.name);
      const personalizedHtml = html
        ? html.replace(/\{name\}/gi, recipient.name)
        : `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
            <h2 style="color:#2C5EAD;margin:0 0 6px;">OncoConnect</h2>
            <p>Hello ${recipient.name},</p>
            <div style="white-space:pre-wrap;line-height:1.6;">${personalizedText}</div>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">
            <p style="color:#94a3b8;font-size:11px;">This message was sent via OncoConnect Neuro-Oncology EMR.</p>
          </div>`;

      await sendMail({
        to: recipient.email,
        subject,
        text: personalizedText,
        html: personalizedHtml,
      });
      sent++;
    } catch (err) {
      failed++;
      errors.push({ email: recipient.email, error: err.message });
    }
    // Small delay between sends to respect rate limits
    if (sent + failed < recipients.length) {
      await new Promise(r => setTimeout(r, SEND_DELAY_MS));
    }
  }

  await writeAudit({
    actorId: req.auth.subjectId,
    actorRole: req.auth.role,
    action: 'email.broadcast',
    detail: { to, subject, sent, failed, total: recipients.length },
    ip: req.ip,
  });

  res.json({
    ok: true,
    sent,
    failed,
    total: recipients.length,
    message: failed > 0
      ? `Sent ${sent} of ${recipients.length} emails (${failed} failed). Check errors for details.`
      : `Successfully sent ${sent} email(s) to all ${to === 'all' ? 'doctors and patients' : to}.`,
    errors: errors.length > 0 ? errors : undefined,
  });
}));
