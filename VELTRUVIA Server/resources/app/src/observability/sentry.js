// Sentry error tracking integration for VELTRUVIA.
// Optional dependency: if @sentry/node not installed, gracefully disables.

import { config } from '../config.js';

let Sentry = null;
let sentryEnabled = false;

try {
  // Try to load Sentry; if not installed, continue without it
  Sentry = await import('@sentry/node');
  sentryEnabled = config.isProd && process.env.SENTRY_DSN;
} catch (e) {
  // Package not installed; that's ok
}

export function initSentry() {
  if (!sentryEnabled || !Sentry) {
    if (config.isProd && process.env.SENTRY_DSN) {
      console.warn('[sentry] @sentry/node not installed — install via: npm install @sentry/node');
    } else if (config.isProd) {
      console.warn('[sentry] SENTRY_DSN not set — error tracking disabled');
    }
    return null;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: 'production',
    tracesSampleRate: 0.1,
    attachStacktrace: true,
    maxBreadcrumbs: 50,
    // PHI guard: strip anything that could carry patient identifiers before
    // an event leaves the server. Errors report the failing CODE, never the
    // data passing through it.
    beforeSend(event) {
      try {
        if (event.request) {
          delete event.request.data;                                   // bodies
          if (event.request.query_string != null) event.request.query_string = '[filtered]';
          if (event.request.cookies != null) event.request.cookies = '[filtered]';
          if (typeof event.request.url === 'string') event.request.url = event.request.url.split('?')[0];
        }
        for (const v of event.exception?.values || []) {
          if (typeof v.value === 'string') {
            v.value = v.value
              .replace(/MRN-[A-Z0-9]+/gi, 'MRN-[REDACTED]')
              .replace(/\b(pat_|lab_)[a-z0-9]+/gi, '$1[REDACTED]')
              .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[EMAIL REDACTED]');
          }
        }
        for (const b of event.breadcrumbs || []) {
          if (typeof b.message === 'string') {
            b.message = b.message
              .replace(/MRN-[A-Z0-9]+/gi, 'MRN-[REDACTED]')
              .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[EMAIL REDACTED]');
          }
        }
      } catch { /* never let scrubbing break error reporting */ }
      return event;
    },
  });

  console.log('[sentry] initialized');
  return Sentry;
}

export function sentryErrorHandler() {
  return sentryEnabled && Sentry ? Sentry.Handlers.errorHandler() : (err, req, res, next) => next(err);
}

export function sentryRequestHandler() {
  return sentryEnabled && Sentry ? Sentry.Handlers.requestHandler() : (req, res, next) => next();
}

export function captureException(error, context = {}) {
  if (!sentryEnabled || !Sentry) return;
  Sentry.captureException(error, { contexts: { app: context } });
}

export function captureMessage(message, level = 'info') {
  if (!sentryEnabled || !Sentry) return;
  Sentry.captureMessage(message, level);
}
