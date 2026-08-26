// OncoConnect secure backend — the Express app.
//
// Exported without .listen() so the same app runs everywhere:
//   - src/server.js  starts a normal long-lived server (local, Docker, Render)
//   - api/index.js   exposes it as a serverless function (Vercel free tier)

import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { initSchema, initTestData } from './db/index.js';
import { errorHandler } from './middleware/validate.js';
import { authenticate } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { syncRouter } from './routes/sync.js';
import { adminRouter } from './routes/admin.js';
import { adminDashboardRouter } from './routes/admin-dashboard.js';
import { openapiRouter } from './routes/openapi.js';
import { teamRouter } from './routes/team.js';
import { pushRouter } from './routes/push.js';
import { emailRouter } from './routes/email.js';
import { scheduleRouter } from './routes/scheduling.js';
import { clinicalRouter, seedDrugInteractions } from './routes/clinical-support.js';
import { prescriptionRouter } from './routes/prescriptions.js';
import { clinicalFeaturesRouter, seedProtocols } from './routes/clinical-features.js';
import { telehealthRouter, startTelehealthCleanup } from './routes/telehealth.js';
import { emailOtpRouter } from './routes/email-otp.js';
import billingNccnHipaaRouter from './routes/billing-nccn-hipaa.js';
import { initPush } from './push.js';
import { observability, metricsSnapshot } from './observability.js';
import { initSentry, sentryRequestHandler, sentryErrorHandler } from './observability/sentry.js';
import { db } from './db/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Ensure DB & tables exist before serving.
await initSchema();
await initTestData(); // Auto-populate test data if using ephemeral DB
await initPush();
await seedDrugInteractions();
await seedProtocols();
startTelehealthCleanup();
initSentry(); // Initialize error tracking (no-op if SENTRY_DSN not set)

const app = express();
app.set('trust proxy', 1); // needed for correct req.ip behind cloud proxies

// ── Error tracking (Sentry) ────────────────────────────────────────
app.use(sentryRequestHandler()); // Capture request metadata

// ── Security headers ──────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net'],
      // The prototype UIs use inline onclick= handlers; helmet defaults
      // script-src-attr to 'none', which silently breaks every button.
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      // api.emailjs.com: the EmailJS fallback sender XHRs there — without
      // this entry the browser silently blocks every EmailJS send.
      connectSrc: ["'self'", 'https://api.emailjs.com', 'https://api.qrserver.com'],
      manifestSrc: ["'self'"],
      workerSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(observability); // correlation IDs + structured logs + flow metrics
app.use(express.json({ limit: '8mb' })); // lab file uploads (base64) can be large
app.use(cookieParser());

// ── CSRF guard: state-changing API calls must come from our own origin ──
// (Hosting proxies may rewrite the session cookie to SameSite=None, which
// would otherwise let cross-site pages fire authenticated writes.)
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const origin = req.headers.origin;
  if (!origin) return next(); // non-browser clients (curl, tests) send no Origin
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  try {
    if (new URL(origin).host !== host) {
      return res.status(403).json({ error: 'Cross-origin request rejected' });
    }
  } catch { return res.status(403).json({ error: 'Invalid Origin header' }); }
  next();
});

// ── Rate limiting ─────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,                    // 30 auth attempts per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later' },
});
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 300 });

// ── Health check (for cloud hosts) ────────────────────────────────
// Shallow by default (fast, for load-balancer pings); ?deep=1 also checks
// the database so a broken DB surfaces as unhealthy instead of silently 200.
app.get('/health', async (req, res) => {
  if (req.query.deep === '1') {
    try {
      await db.prepare('SELECT 1 AS ok').get();
    } catch (e) {
      return res.status(503).json({ ok: false, db: false, error: 'database unreachable' });
    }
    return res.json({ ok: true, db: true, ts: new Date().toISOString() });
  }
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ── Metrics (admin-only): per-flow count / error rate / latency ───
app.get('/api/metrics', apiLimiter, authenticate, async (req, res) => {
  if (req.auth.role !== 'admin') {
    const first = await db.prepare('SELECT id FROM users ORDER BY created_at ASC LIMIT 1').get();
    if (!first || first.id !== req.auth.subjectId) return res.status(403).json({ error: 'Admin access required' });
  }
  res.json(metricsSnapshot());
});

// ── API routes ────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/sync', apiLimiter, syncRouter);
app.use('/api/team', apiLimiter, teamRouter);
app.use('/api/admin', apiLimiter, adminRouter);
app.use('/api/admin', apiLimiter, adminDashboardRouter);
app.use('/api/docs', openapiRouter);
app.use('/api/push', apiLimiter, pushRouter);
app.use('/api/email', emailRouter); // has its own per-route limiters
app.use('/api/schedule', apiLimiter, scheduleRouter);
app.use('/api/cds', apiLimiter, clinicalRouter);
app.use('/api/rx', apiLimiter, prescriptionRouter);
app.use('/api/features', apiLimiter, clinicalFeaturesRouter);
app.use('/api/telehealth', apiLimiter, telehealthRouter);
app.use('/api/auth/otp', authLimiter, emailOtpRouter);
app.use(apiLimiter, billingNccnHipaaRouter);

// ── Serve the frontend (built HTML apps) ──────────────────────────
app.use(express.static(join(__dirname, '..', 'public')));

// SPA-ish fallback: send the doctor app for unknown non-API GETs.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(join(__dirname, '..', 'public', 'index.html'));
});

// ── Error handlers (order matters: Sentry before custom) ────────────
app.use(sentryErrorHandler()); // Sentry error handler
app.use(errorHandler);         // Custom error handler

export { app };
