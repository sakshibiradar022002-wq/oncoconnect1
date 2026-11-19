// Security middleware for request validation and protection against common attacks.
// This module provides additional security layers beyond Helmet and basic rate limiting.

import { config } from '../config.js';

// ── Request body size limiter (defense-in-depth) ──
// While Express already has a limit, this provides an additional layer
// for specific content types that might bypass the default limit.
export function bodySizeGuard(maxSizeMb = 8) {
  const maxBytes = maxSizeMb * 1024 * 1024;
  return (req, res, next) => {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength > maxBytes) {
      return res.status(413).json({ error: 'Request body too large' });
    }
    next();
  };
}

// ── SQL injection prevention middleware ──
// Additional layer beyond parameterized queries - scans for common SQL
// patterns. Patterns are deliberately HIGH-CONFIDENCE: the old version
// rejected any bare `;` or `--`, which are ordinary punctuation in clinical
// free text ("BP 120/80; continue current dose", "no pain -- ambulating"),
// so clinicians got 400s on legitimate searches. Comment/statement-separator
// tricks are still caught, but only in combination with a real SQL verb.
const SUSPICIOUS_PATTERNS = [
  /\bunion\s+(all\s+)?select\b/i,                        // UNION SELECT
  /\b(select|insert\s+into|update|delete\s+from|drop\s+(table|database|index)|alter\s+table|truncate\s+table)\b[\s\S]{0,80}?\b(from|set|table|where|values)\b/i,
  /\b(or|and)\b\s+['"]?\d+['"]?\s*=\s*['"]?\d+/i,          // ' OR 1=1
  /\b(xp_cmdshell|sp_executesql|exec\s*\()/i,
  /\b(sleep|benchmark|pg_sleep)\s*\(/i,                    // time-based blind
  /;\s*(drop|alter|delete|truncate|update|insert|exec)\b/i, // stacked statements
  /\b(0x[0-9a-f]{8,})\b/i,                                  // long hex literal
  /\/\*[\s\S]{0,40}?\*\//,                                  // inline SQL comment
];

function looksSuspicious(value) {
  return SUSPICIOUS_PATTERNS.some((pattern) => pattern.test(value));
}

export function sqlInjectionGuard(req, res, next) {
  // Query parameters only. Bodies are JSON payloads validated by zod on
  // every route, and scanning clinical free text there produced false
  // positives without adding protection (queries are parameterized).
  for (const [key, value] of Object.entries(req.query)) {
    const values = Array.isArray(value) ? value : [value];
    for (const v of values) {
      if (typeof v === 'string' && looksSuspicious(v)) {
        console.warn(`[security] Suspicious query parameter detected: ${key}=${v.substring(0, 50)}`);
        return res.status(400).json({ error: 'Invalid request parameters' });
      }
    }
  }

  // Path only (no query string — already covered above).
  const path = String(req.originalUrl || req.url).split('?')[0];
  if (looksSuspicious(path)) {
    console.warn(`[security] Suspicious URL path detected: ${path.substring(0, 100)}`);
    return res.status(400).json({ error: 'Invalid request path' });
  }

  next();
}

// ── Path traversal prevention ──
export function pathTraversalGuard(req, res, next) {
  let path;
  try {
    // decodeURIComponent throws on a malformed escape ("%zz") — that used to
    // escape the guard as a 500. Treat it as the bad request it is.
    path = decodeURIComponent(req.originalUrl || req.url);
  } catch {
    return res.status(400).json({ error: 'Invalid path encoding' });
  }

  // Run against the raw form too, so double-encoded payloads are caught.
  const candidates = [path, String(req.originalUrl || req.url)];
  const traversalPatterns = [
    /\.\.\//,                    // ../
    /\.\.\\/,                    // ..\ (Windows)
    /%2e%2e%2f/i,                // %2e%2e%2f
    /%2e%2e%5c/i,                // %2e%2e%5c
    /(^|[\\/])\.\.([\\/]|$)/,    // bare ".." segment
  ];

  for (const candidate of candidates) {
    for (const pattern of traversalPatterns) {
      if (pattern.test(candidate)) {
        console.warn(`[security] Path traversal attempt detected: ${candidate.substring(0, 100)}`);
        return res.status(400).json({ error: 'Invalid path' });
      }
    }
  }

  next();
}

// ── Request method validation ──
// Only allow standard HTTP methods
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);

export function methodGuard(req, res, next) {
  if (!ALLOWED_METHODS.has(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  next();
}

// ── Request timeout middleware ──
// Prevent long-running requests from exhausting server resources
export function requestTimeout(timeoutMs = 30000) {
  return (req, res, next) => {
    let settled = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      if (!res.headersSent) res.status(408).json({ error: 'Request timeout' });
      // Previously this only wrote 408 and left the handler running, so a
      // slow query kept consuming the DB/CPU for a client that had already
      // gone away. Flush the 408, then tear down the socket: closing it is
      // what actually aborts the work (further writes are dropped).
      if (res.writableEnded) req.socket?.destroy();
      else res.once('finish', () => req.socket?.destroy());
    }, timeoutMs);
    timer.unref?.();

    const settle = () => { settled = true; clearTimeout(timer); };
    res.on('finish', settle);
    res.on('close', settle);

    next();
  };
}

// ── IP-based blocking (in-memory, for development) ──
// In production, use a proper firewall or WAF
const blockedIPs = new Map(); // ip -> { blockedUntil, reason }

export function ipBlockGuard(req, res, next) {
  const clientIP = req.ip || req.connection?.remoteAddress;
  if (!clientIP) return next();

  const blocked = blockedIPs.get(clientIP);
  if (blocked) {
    if (Date.now() < blocked.blockedUntil) {
      console.warn(`[security] Blocked IP ${clientIP} (until ${new Date(blocked.blockedUntil).toISOString()})`);
      return res.status(403).json({ error: 'Access denied' });
    }
    // Block expired, remove it
    blockedIPs.delete(clientIP);
  }

  next();
}

// ── Block an IP (used by brute-force protection) ──
export function blockIP(ip, durationMs = 15 * 60 * 1000, reason = 'Too many failed attempts') {
  blockedIPs.set(ip, {
    blockedUntil: Date.now() + durationMs,
    reason,
  });
  console.warn(`[security] Blocked IP ${ip} for ${durationMs / 1000}s: ${reason}`);
}

// ── Security audit logging ──
export function securityAuditLog(req, action, details = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    ip: req.ip || req.connection?.remoteAddress,
    method: req.method,
    path: req.originalUrl || req.url,
    userAgent: req.headers['user-agent']?.substring(0, 100),
    action,
    ...details,
  };

  // In production, send to SIEM/audit system
  if (config.isProd) {
    // TODO: Send to external audit system
    console.log('[security-audit]', JSON.stringify(logEntry));
  } else {
    console.log('[security-audit]', JSON.stringify(logEntry));
  }
}

// ── Combine all security middleware ──
export function securityMiddleware() {
  return [
    methodGuard,
    sqlInjectionGuard,
    pathTraversalGuard,
    ipBlockGuard,
    bodySizeGuard(8), // 8MB limit
    requestTimeout(30000), // 30 second timeout
  ];
}
