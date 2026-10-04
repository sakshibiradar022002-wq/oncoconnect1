// VELTRUVIA secure backend — the Express app.
//
// Exported without .listen() so the same app runs everywhere:
//   - src/server.js  starts a normal long-lived server (local, Docker, Render)
//   - api/index.js   exposes it as a serverless function (Vercel free tier)

import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { config } from './config.js';

// Server version, reported by /health (download page badge shows it).
const APP_VERSION = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8')).version;

import { initSchema, initTestData } from './db/index.js';
import { errorHandler } from './middleware/validate.js';
import { authenticate } from './middleware/auth.js';
import { securityMiddleware, sqlInjectionGuard, pathTraversalGuard, methodGuard, requestTimeout } from './middleware/security.js';
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
import { enhanceRouter } from './routes/enhancements.js';
import { initPush } from './push.js';
import { observability, metricsSnapshot } from './observability.js';
import { initSentry, sentryRequestHandler, sentryErrorHandler } from './observability/sentry.js';
import { blockchainRouter } from './routes/blockchain.js';
import { hl7Router } from './routes/hl7.js';
import { eprescribingRouter } from './routes/eprescribing.js';
import { fhirRouter } from './routes/fhir.js';
import { consentRouter } from './routes/hipaa-consent.js';
import { breachRouter } from './routes/breach-notification.js';
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

// Blockchain is now handled by electron/blockchain.js (shared chain)

const app = express();
app.set('trust proxy', 1); // needed for correct req.ip behind cloud proxies

// ── Error tracking (Sentry) ────────────────────────────────────────
app.use(sentryRequestHandler()); // Capture request metadata

// ── Security headers ──────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // All page scripts are external files (js/, js/page/) — no inline
      // scripts, no inline event handlers. Both unsafe-inline vectors are gone.
      scriptSrc: ["'self'"],
      // Fonts are self-hosted under /fonts/ (no third-party CDN dependency).
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'"],
      // All QR codes (2FA otpauth, download-page pairing) are rendered
      // LOCALLY via the vendored qrcode-generator lib (js/vendor/) — a
      // remote QR service would receive the server address and, worse,
      // the TOTP secret. No third-party QR host in the CSP anymore.
      imgSrc: ["'self'", 'data:', 'blob:'],
      // api.emailjs.com: the EmailJS fallback sender XHRs there — without
      // this entry the browser silently blocks every EmailJS send.
      // api.github.com: the download page's "latest release" badge.
      connectSrc: ["'self'", 'https://api.emailjs.com', 'https://api.github.com'],
      manifestSrc: ["'self'"],
      workerSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(observability); // correlation IDs + structured logs + flow metrics
app.use('/api/x/attachments', express.raw({ limit: '10mb', type: () => true })); // v2.1: raw file bytes
app.use(express.json({ limit: '8mb' })); // lab file uploads (base64) can be large
app.use(cookieParser());

// ── Security middleware (defense-in-depth) ──
app.use(methodGuard);           // Reject non-standard HTTP methods
app.use(sqlInjectionGuard);     // SQL injection pattern scanning
app.use(pathTraversalGuard);    // Prevent directory traversal
app.use(requestTimeout(30000)); // 30s request timeout

// ── Native mobile app origins (Capacitor WebView) ────────────────
// The Android/iOS APKs load their UI from the app bundle itself, so their
// fetch() calls carry an Origin of https://localhost (Android WebView) or
// capacitor://localhost (iOS) — which is NOT this server's host and would
// otherwise trip the CSRF guard below. These apps authenticate with Bearer
// tokens instead of cookies. Override with CAPACITOR_ORIGINS (empty to disable).
const CAPACITOR_ORIGINS = new Set(
  (process.env.CAPACITOR_ORIGINS ?? 'https://localhost,capacitor://localhost')
    .split(',').map(s => s.trim()).filter(Boolean)
);

// ── CSRF guard: state-changing API calls must come from our own origin ──
// (Hosting proxies may rewrite the session cookie to SameSite=None, which
// would otherwise let cross-site pages fire authenticated writes.)
// NOTE: Electron desktop app and same-host browser UIs are allowed through.
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const origin = req.headers.origin;
  if (!origin) return next(); // non-browser clients (curl, tests, Electron) send no Origin
  // Allow file:// protocol (Electron desktop app)
  if (origin.startsWith('file://')) return next();
  // Allow native mobile app origins (Capacitor APKs — Bearer-token auth)
  if (CAPACITOR_ORIGINS.has(origin)) return next();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  try {
    if (new URL(origin).host !== host) {
      return res.status(403).json({ error: 'Cross-origin request rejected' });
    }
  } catch { return res.status(403).json({ error: 'Invalid Origin header' }); }
  next();
});

// ── Security Headers: Additional hardening beyond Helmet ──
app.use((req, res, next) => {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Control referrer information leakage
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Feature policy - disable unnecessary browser features
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=()');
  // HSTS with includeSubDomains and preload (for production)
  if (config.isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  next();
});

// ── CORS (production API access) ─────────────────────────────────
if (config.isProd) {
  app.use('/api', (req, res, next) => {
    const allowedOrigins = [
      ...(process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
      ...CAPACITOR_ORIGINS,
    ];
    const origin = req.headers.origin;
    if (origin && allowedOrigins.length > 0 && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Veltruvia-Native');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
}

// ── Rate limiting ─────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,                    // 30 auth attempts per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later' },
});
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 300 });
const storeLimiter = rateLimit({ windowMs: 60 * 1000, max: 60 }); // Stricter for shared stores

// ── Health check (for cloud hosts) ────────────────────────────────
// Shallow by default (fast, for load-balancer pings); ?deep=1 also checks
// the database so a broken DB surfaces as unhealthy instead of silently 200.
app.get('/health', async (req, res) => {
  const health = { ok: true, ts: new Date().toISOString(), version: APP_VERSION };
  
  if (req.query.deep === '1') {
    // Check database
    try {
      await db.prepare('SELECT 1 AS ok').get();
      health.db = true;
    } catch (e) {
      health.db = false;
      health.ok = false;
    }
    
    // Blockchain status
    health.blockchain = 'electron-module';
    
    if (!health.ok) {
      return res.status(503).json(health);
    }
  }
  
  res.json(health);
});

// Alias /api/health for Electron client apps
app.get('/api/health', async (req, res) => {
  try {
    await db.prepare('SELECT 1 AS ok').get();
    res.json({ ok: true, ts: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ ok: false, error: e.message });
  }
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
// Shared store endpoints get stricter rate limiting
const syncStoreLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many store requests' } });
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
app.use('/api/blockchain', apiLimiter, blockchainRouter);
app.use('/api/hl7', apiLimiter, hl7Router);
app.use('/api/eprescribe', apiLimiter, eprescribingRouter);
app.use('/api/fhir', apiLimiter, fhirRouter);
app.use('/api/hipaa', apiLimiter, consentRouter);
app.use('/api/breach', apiLimiter, breachRouter);
app.use('/api/x', apiLimiter, enhanceRouter);

// Billing router has its own auth middleware — mount under /api
app.use('/api', apiLimiter, billingNccnHipaaRouter);

// ── 404 for unknown API routes ──────────────────────────────────
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.originalUrl });
});

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
