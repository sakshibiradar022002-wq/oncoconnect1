// SMS reminder service — sends appointment reminders via Twilio.
// Configuration:
//   TWILIO_ACCOUNT_SID=ACxxxxx
//   TWILIO_AUTH_TOKEN=xxxxx
//   TWILIO_FROM=+1234567890
//
// Patient phone numbers are stored in the kv_store as pat_<mrn> records.

let twilioClient = null;
let fromNumber = null;

function buildTwilioClient() {
  if (twilioClient) return;
  
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  fromNumber = process.env.TWILIO_FROM;
  
  if (!accountSid || !authToken || !fromNumber) return;
  
  try {
    // Dynamic import to avoid errors when Twilio is not installed
    const twilio = require('twilio');
    twilioClient = twilio(accountSid, authToken);
    console.log('[sms] Twilio client initialized');
  } catch (e) {
    // Twilio not installed — SMS will be skipped
    console.log('[sms] Twilio not available, SMS reminders disabled');
  }
}

export function smsConfigured() {
  buildTwilioClient();
  return !!(twilioClient && fromNumber);
}

// Build SMS text for appointment reminder
function buildReminderSms(patientName, appointment, tier) {
  const dateStr = appointment.date;
  const timeStr = appointment.time || 'TBD';
  const type = appointment.type || 'Follow-up';
  
  const tierMessages = {
    '7d': `📋 Appointment Reminder: You have a ${type} scheduled for ${dateStr} at ${timeStr}. Please keep this appointment.`,
    '24h': `📅 Tomorrow: Your ${type} appointment is on ${dateStr} at ${timeStr}. Please prepare accordingly.`,
    '1h': `⏰ Starting Soon: Your ${type} appointment is in 1 hour at ${timeStr}. Please be ready.`,
  };
  
  return tierMessages[tier] || tierMessages['24h'];
}

// Send SMS to a phone number
export async function sendSms(to, message) {
  if (!smsConfigured()) {
    console.log('[sms] Not configured, skipping SMS to', to);
    return { sent: false, reason: 'not_configured' };
  }
  
  try {
    const result = await twilioClient.messages.create({
      body: message,
      from: fromNumber,
      to: to,
    });
    
    console.log(`[sms] Sent to ${to}: ${result.sid}`);
    return { sent: true, sid: result.sid };
  } catch (err) {
    console.error(`[sms] Failed to send to ${to}:`, err.message);
    return { sent: false, error: err.message };
  }
}

// Send appointment reminder via SMS
export async function sendAppointmentReminderSms(phone, patientName, appointment, tier) {
  const message = buildReminderSms(patientName, appointment, tier);
  return await sendSms(phone, message);
}
