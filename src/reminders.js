// Appointment reminder scheduler — runs periodically, checks for
// upcoming appointments in the kv_store, and sends email reminders.
//
// Doctors set appointments as appts_<mrn> keys in the doctor's kv_store.
// Each appointment has: { date, time, type, notes, status, reminderSent }
//
// The scheduler:
//   1. Runs every hour
//   2. Finds appointments due in the next 24 hours
//   3. Sends email reminders to the patient (if email is available)
//   4. Marks the appointment as reminded (reminderSent flag)
//   5. Supports 1h, 24h, and 7-day reminder tiers

import { db, writeAudit } from './db/index.js';
import { mailConfigured, sendMail } from './mail.js';
import { smsConfigured, sendAppointmentReminderSms } from './sms.js';
import { notifySubject } from './push.js';
import { decryptPHI } from './crypto.js';

const CHECK_INTERVAL = 60 * 60 * 1000; // Check every hour
let timer = null;

// Reminder tiers: how many hours before the appointment to send
const REMINDER_TIERS = [
  { hours: 24, label: '24h', subject: '📅 Appointment Reminder — Tomorrow', color: '#2563eb' },
  { hours: 1, label: '1h', subject: '⏰ Appointment Starting Soon', color: '#dc2626' },
  { hours: 168, label: '7d', subject: '📋 Upcoming Appointment Next Week', color: '#7c3aed' },
];

function buildReminderHtml(patientName, appointment, tier) {
  const dateStr = new Date(appointment.date).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const timeStr = appointment.time || 'Not specified';
  const notes = appointment.notes || '';

  return `
<div style="font-family:'Segoe UI',system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px;">
  <div style="background:${tier.color};color:#fff;border-radius:10px 10px 0 0;padding:16px 20px;">
    <div style="font-size:22px;margin-bottom:4px;">🧬</div>
    <div style="font-size:18px;font-weight:800;">OncoConnect</div>
    <div style="font-size:12px;opacity:.85;">Neuro-Oncology EMR</div>
  </div>
  <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;padding:20px;">
    <div style="font-size:16px;font-weight:700;color:#1a1a1a;margin-bottom:4px;">
      ${tier.subject.replace(/^[^\s]+\s/, '')}
    </div>
    <div style="font-size:13px;color:#6b7280;margin-bottom:16px;">
      Hello ${patientName}, this is a reminder from your care team.
    </div>

    <div style="background:${tier.color}08;border:1px solid ${tier.color}30;border-radius:8px;padding:14px;margin-bottom:16px;">
      <div style="display:flex;gap:16px;">
        <div>
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#6b7280;">Date</div>
          <div style="font-size:14px;font-weight:700;color:#1a1a1a;margin-top:2px;">${dateStr}</div>
        </div>
        <div>
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#6b7280;">Time</div>
          <div style="font-size:14px;font-weight:700;color:#1a1a1a;margin-top:2px;">${timeStr}</div>
        </div>
        <div>
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#6b7280;">Type</div>
          <div style="font-size:14px;font-weight:700;color:${tier.color};margin-top:2px;">${appointment.type || 'Follow-up'}</div>
        </div>
      </div>
      ${notes ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid #e2e8f0;"><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#6b7280;">Notes</div><div style="font-size:12px;color:#475569;margin-top:2px;">${notes}</div></div>` : ''}
    </div>

    <div style="font-size:12px;color:#6b7280;text-align:center;margin-bottom:8px;">
      Please keep this appointment. If you need to reschedule, contact your doctor.
    </div>

    <div style="border-top:1px solid #e2e8f0;padding-top:12px;text-align:center;">
      <div style="font-size:10px;color:#94a3b8;">OncoConnect Neuro-Oncology EMR · ${new Date().getFullYear()}</div>
    </div>
  </div>
</div>`;
}

function buildReminderText(patientName, appointment, tier) {
  const dateStr = appointment.date;
  const timeStr = appointment.time || 'Not specified';
  return `
OncoConnect — ${tier.subject.replace(/^[^\s]+\s/, '')}

Hello ${patientName},

You have an upcoming appointment:

  Date: ${dateStr}
  Time: ${timeStr}
  Type: ${appointment.type || 'Follow-up'}
  ${appointment.notes ? 'Notes: ' + appointment.notes : ''}

Please keep this appointment. If you need to reschedule, contact your doctor.

— OncoConnect Neuro-Oncology EMR
  `.trim();
}

// Find all doctor owners in the system
async function getAllDoctorIds() {
  const rows = await db.prepare('SELECT id FROM users WHERE role = ?').all('doctor');
  return rows.map(r => r.id);
}

// Find all appointments in a doctor's kv_store that match appts_<mrn> keys
async function findUpcomingAppointments(ownerId) {
  const rows = await db.prepare(
    "SELECT k, v_enc FROM kv_store WHERE owner_id = ? AND k LIKE 'appts_%'"
  ).all(ownerId);

  const now = new Date();
  const appointments = [];

  for (const row of rows) {
    try {
      const appts = decryptPHI(row.v_enc);
      if (!Array.isArray(appts)) continue;

      // Extract MRN from key: appts_<mrn>
      const mrn = row.k.replace('appts_', '');

      for (const appt of appts) {
        if (!appt.date || appt.status === 'Cancelled' || appt.status === 'Completed') continue;

        const apptDate = new Date(appt.date + (appt.time ? 'T' + appt.time : 'T09:00:00'));
        const hoursUntil = (apptDate - now) / (1000 * 60 * 60);

        if (hoursUntil > 0 && hoursUntil <= 168) { // Within 7 days
          appointments.push({
            mrn,
            ownerId,
            appointment: appt,
            hoursUntil,
            apptDate,
          });
        }
      }
    } catch {
      // Skip corrupted entries
    }
  }

  return appointments;
}

// Get patient info for a given MRN and owner
async function getPatientInfo(ownerId, mrn) {
  const key = 'pat_' + mrn;
  const row = await db.prepare(
    'SELECT v_enc FROM kv_store WHERE owner_id = ? AND k = ?'
  ).get(ownerId, key);

  if (!row) return null;
  try {
    return decryptPHI(row.v_enc);
  } catch {
    return null;
  }
}

// Check if a reminder has already been sent for this appointment
function hasReminderSent(appointment, tierLabel) {
  if (!appointment.reminderSent) return false;
  if (Array.isArray(appointment.reminderSent)) {
    return appointment.reminderSent.includes(tierLabel);
  }
  return false;
}

// Mark a reminder as sent in the appointment data
async function markReminderSent(ownerId, mrn, appointmentIndex, tierLabel) {
  const key = 'appts_' + mrn;
  const row = await db.prepare(
    'SELECT v_enc FROM kv_store WHERE owner_id = ? AND k = ?'
  ).get(ownerId, key);

  if (!row) return;

  try {
    const appts = decryptPHI(row.v_enc);
    if (!Array.isArray(appts) || !appts[appointmentIndex]) return;

    if (!appts[appointmentIndex].reminderSent) {
      appts[appointmentIndex].reminderSent = [];
    }
    if (!appts[appointmentIndex].reminderSent.includes(tierLabel)) {
      appts[appointmentIndex].reminderSent.push(tierLabel);
    }

    // Re-encrypt and store
    const { encryptPHI } = await import('./crypto.js');
    const { randomToken } = await import('./crypto.js');
    await db.prepare(
      'UPDATE kv_store SET v_enc = ?, updated_at = ? WHERE owner_id = ? AND k = ?'
    ).run(encryptPHI(appts), new Date().toISOString(), ownerId, key);
  } catch {
    // Skip on error
  }
}

// Main check function — called periodically
async function checkAndSendReminders() {
  const emailReady = mailConfigured();
  const smsReady = await smsConfigured();
  
  if (!emailReady && !smsReady) {
    // No email or SMS configured — skip silently
    return;
  }

  try {
    const doctorIds = await getAllDoctorIds();
    let sentCount = 0;

    for (const ownerId of doctorIds) {
      const appointments = await findUpcomingAppointments(ownerId);

      for (const { mrn, appointment, hoursUntil } of appointments) {
        // Find the matching tier
        for (const tier of REMINDER_TIERS) {
          // Send if within the tier window and not already sent
          const tierRanges = {
            '7d': { min: 48, max: 168 },
            '24h': { min: 12, max: 48 },
            '1h': { min: 0.5, max: 12 },
          };
          const range = tierRanges[tier.label];
          if (!range) continue;

          if (hoursUntil < range.min || hoursUntil > range.max) continue;
          if (hasReminderSent(appointment, tier.label)) continue;

          // Get patient info
          const patient = await getPatientInfo(ownerId, mrn);
          if (!patient) continue;

          // Send email reminder
          if (emailReady && patient.email) {
            try {
              await sendMail({
                to: patient.email,
                subject: `${tier.subject} — ${appointment.type || 'Follow-up'}`,
                text: buildReminderText(patient.name || 'Patient', appointment, tier),
                html: buildReminderHtml(patient.name || 'Patient', appointment, tier),
              });
            } catch (err) {
              console.error(`[reminder] Email failed for ${patient.email}:`, err.message);
            }
          }

          // Send SMS reminder
          if (smsReady && patient.phone) {
            try {
              const smsResult = await sendAppointmentReminderSms(
                patient.phone,
                patient.name || 'Patient',
                appointment,
                tier.label
              );
              if (smsResult.sent) console.log(`[reminder] SMS sent to ${patient.phone}`);
            } catch (err) {
              console.error(`[reminder] SMS failed for ${patient.phone}:`, err.message);
            }
          }

          // Send push notification
          try {
            await notifySubject('%::' + mrn, {
              title: tier.subject,
              body: `${appointment.type || 'Appointment'} on ${appointment.date}${appointment.time ? ' at ' + appointment.time : ''}`,
              url: '/patient.html',
            });
          } catch (err) {
            // Push is best-effort
          }

          // Mark reminder as sent and write audit
          try {
            // Find the appointment index to mark as sent
            const apptKey = 'appts_' + mrn;
            const apptRow = await db.prepare(
              'SELECT v_enc FROM kv_store WHERE owner_id = ? AND k = ?'
            ).get(ownerId, apptKey);

            if (apptRow) {
              const appts = decryptPHI(apptRow.v_enc);
              if (Array.isArray(appts)) {
                const idx = appts.indexOf(appointment);
                if (idx !== -1) {
                  await markReminderSent(ownerId, mrn, idx, tier.label);
                }
              }
            }

            await writeAudit({
              actorId: ownerId,
              actorRole: 'system',
              action: 'reminder.sent',
              detail: { mrn, patient: patient.name, tier: tier.label, date: appointment.date },
              ip: 'internal',
            });

            sentCount++;
            console.log(`[reminder] Sent ${tier.label} reminder to ${patient.email || patient.phone || 'unknown'} for ${patient.name} (${mrn}) — ${appointment.date}`);
          } catch (err) {
            console.error(`[reminder] Failed to mark reminder:`, err.message);
          }
        }
      }
    }

    if (sentCount > 0) {
      console.log(`[reminder] Sent ${sentCount} appointment reminder(s)`);
    }
  } catch (err) {
    console.error('[reminder] Scheduler error:', err.message);
  }
}

// Start the reminder scheduler
export function startReminderScheduler() {
  console.log('[reminder] Starting appointment reminder scheduler (checks every hour)');

  // Run immediately on startup (after a short delay to let the server settle)
  setTimeout(checkAndSendReminders, 30 * 1000);

  // Then check every hour
  timer = setInterval(checkAndSendReminders, CHECK_INTERVAL);

  // Cleanup on shutdown
  process.on('SIGINT', () => {
    if (timer) clearInterval(timer);
  });
  process.on('SIGTERM', () => {
    if (timer) clearInterval(timer);
  });
}

// Manual trigger (for testing or admin action)
export async function triggerReminderCheck() {
  await checkAndSendReminders();
}

// Get reminder status for the doctor app
export async function getReminderStatus(ownerId) {
  const appointments = await findUpcomingAppointments(ownerId);
  const now = new Date();

  return appointments.map(({ mrn, appointment, hoursUntil }) => {
    const nextTier = REMINDER_TIERS.find(tier => {
      if (hasReminderSent(appointment, tier.label)) return false;
      const tierRanges = { '7d': { min: 48, max: 168 }, '24h': { min: 12, max: 48 }, '1h': { min: 0.5, max: 12 } };
      const range = tierRanges[tier.label];
      return range && hoursUntil >= range.min && hoursUntil <= range.max;
    });

    return {
      mrn,
      date: appointment.date,
      time: appointment.time,
      type: appointment.type,
      status: appointment.status,
      hoursUntil: Math.round(hoursUntil),
      remindersSent: appointment.reminderSent || [],
      nextReminder: nextTier ? nextTier.label : null,
    };
  });
}
