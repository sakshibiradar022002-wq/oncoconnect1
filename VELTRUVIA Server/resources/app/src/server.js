// VELTRUVIA secure backend — long-lived server entry point.
// Supports optional TLS (set TLS_KEY and TLS_CERT env vars).
// Includes automated database backup on a configurable interval.

import 'dotenv/config';   // load .env before anything else
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { app } from './app.js';
import { config } from './config.js';
import { startAppointmentReminders } from './push.js';
import { startReminderScheduler } from './reminders.js';
import { closeDb, flushDb } from './db/index.js';
import { attachTelehealthWs } from './routes/telehealth.js';
import { startMllpServer, getMllpStatus } from './hl7/mllp.js';
import { mailConfigured } from './mail.js';
import { startBackups, backupDatabase } from './db/backup.js';
import { installErrorHandlers } from './errors.js';
import blockchain from './blockchain/index.js';

// Crash/error capture first so even boot-time failures are recorded.
installErrorHandlers({
  logPath: path.join(process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : '.', 'error-log.jsonl'),
  name: 'veltruvia-server',
});

startAppointmentReminders();
startReminderScheduler();

// Activate the audit chain (Hardhat if deployed, otherwise the shared file
// chain in data/chain.json) so audited actions are recorded tamper-evidently.
blockchain.connect().catch(err => console.warn('[blockchain] init failed:', err.message));

// ── HTTP + optional LAN-HTTPS sidecar ──────────────────────────
// Main listener stays plain HTTP so loopback consumers (desktop apps,
// the cloud tunnel, local tools) are unaffected. When TLS_KEY/TLS_CERT
// point at PEM files, a SECOND listener serves HTTPS on 0.0.0.0 so
// phone/LAN traffic is encrypted. Set TLS_LAN_PORT=0 to disable.
const tlsKeyPath = process.env.TLS_KEY;
const tlsCertPath = process.env.TLS_CERT;
const haveTls = !!(tlsKeyPath && tlsCertPath && fs.existsSync(tlsKeyPath) && fs.existsSync(tlsCertPath));
const server = http.createServer(app);

if (haveTls) {
  const lanPort = parseInt(process.env.TLS_LAN_PORT || '3001', 10);
  if (lanPort > 0) {
    try {
      https.createServer({
        key: fs.readFileSync(tlsKeyPath),
        cert: fs.readFileSync(tlsCertPath),
        minVersion: 'TLSv1.2',
      }, app).listen(lanPort, '0.0.0.0', () => {
        console.log(`  🔒 LAN HTTPS sidecar listening on 0.0.0.0:${lanPort}`);
      });
    } catch (e) {
      console.warn('  ⚠️  LAN HTTPS sidecar failed to start:', e.message);
    }
  }
}

// Attach WebSocket server for telehealth signaling
attachTelehealthWs(server);

// Surface missing mail config early — doctor signup depends on email OTP.
if (!mailConfigured()) {
  console.warn('  ⚠️  Email not configured — doctor signup OTP will be shown on screen only, not sent.');
  console.warn('     Set RESEND_API_KEY (recommended) or GMAIL_USER/GMAIL_APP_PASSWORD or SMTP_HOST/*.');
}

// Start MLLP/TCP server for lab instruments (optional)
if (process.env.MLLP_ENABLED === 'true') {
  startMllpServer();
}

server.listen(config.port, config.host, () => {
  const proto = server instanceof https.Server ? 'https' : 'http';
  console.log(`\n  VELTRUVIA server running on port ${config.port} (${proto})`);
  console.log(`  Environment: ${config.isProd ? 'production' : 'development'}`);
  console.log(`  Health: ${proto}://localhost:${config.port}/health`);
  console.log(`  WebSocket: ${proto}://localhost:${config.port}/ws/telehealth`);
  if (process.env.MLLP_ENABLED === 'true') {
    const mllp = getMllpStatus();
    console.log(`  MLLP/TCP: tcp://localhost:${mllp.port} (lab instruments)`);
  }
  console.log('');
});

// ── Automated database backups ────────────────────────────────────
// Shared implementation (src/db/backup.js) — ON by default every 6 h,
// override with BACKUP_INTERVAL_MS (0 = off).
startBackups();

// ── Graceful shutdown ─────────────────────────────────────────────
function shutdown(signal) {
  console.log(`\n[server] ${signal} received — shutting down gracefully...`);
  flushDb();
  backupDatabase(); // Final backup before exit
  server.close(() => {
    closeDb();
    console.log('[server] Closed. Goodbye.');
    process.exit(0);
  });
  // Force exit after 5 seconds if graceful shutdown stalls
  setTimeout(() => { console.error('[server] Forced exit.'); process.exit(1); }, 5000);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
