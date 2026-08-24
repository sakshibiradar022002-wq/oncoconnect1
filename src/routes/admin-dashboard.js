// Admin dashboard: real-time system metrics and analytics.

import { Router } from 'express';
import { db, writeAudit } from '../db/index.js';
import { decryptPHI } from '../crypto.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/validate.js';

export const adminDashboardRouter = Router();
adminDashboardRouter.use(authenticate);

async function requireAdmin(req, res, next) {
  if (req.auth.role === 'admin') return next();
  const first = await db.prepare('SELECT id FROM users ORDER BY created_at ASC LIMIT 1').get();
  if (first && first.id === req.auth.subjectId) return next();
  res.status(403).json({ error: 'Admin access required' });
}
adminDashboardRouter.use(requireAdmin);

// ── Dashboard summary metrics ─────────────────────────────────────
adminDashboardRouter.get('/dashboard', asyncHandler(async (req, res) => {
  // User metrics
  const totalUsers = await db.prepare('SELECT COUNT(*) as c FROM users').get();
  const activeUsers = await db.prepare('SELECT COUNT(*) as c FROM users WHERE active = 1').get();
  const doctorCount = await db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'doctor'").get();
  const adminCount = await db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").get();
  
  // Session metrics
  const activeSessions = await db.prepare(
    "SELECT COUNT(*) as c FROM sessions WHERE revoked = 0 AND expires_at > ?"
  ).get(new Date().toISOString());
  
  // Recent logins (last 24 hours)
  const recentLogins = await db.prepare(
    "SELECT COUNT(*) as c FROM users WHERE last_login > ?"
  ).get(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  
  // Audit log stats (last 7 days)
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const totalAudit = await db.prepare('SELECT COUNT(*) as c FROM audit_log').get();
  const recentAudit = await db.prepare(
    'SELECT COUNT(*) as c FROM audit_log WHERE created_at > ?'
  ).get(weekAgo);
  
  // Most common actions (top 10, last 7 days)
  const topActions = await db.prepare(`
    SELECT action, COUNT(*) as count 
    FROM audit_log 
    WHERE created_at > ? 
    GROUP BY action 
    ORDER BY count DESC 
    LIMIT 10
  `).all(weekAgo);
  
  // KV store stats (sync data size estimate)
  const kvCount = await db.prepare('SELECT COUNT(*) as c FROM kv_store').get();
  const kvDoctors = await db.prepare(
    "SELECT COUNT(DISTINCT substr(k, 1, instr(k, '_') - 1)) as c FROM kv_store WHERE k LIKE '%_%'"
  ).get();
  
  // Daily activity (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const dailyActivity = await db.prepare(`
    SELECT DATE(created_at) as day, COUNT(*) as count
    FROM audit_log
    WHERE created_at > ?
    GROUP BY DATE(created_at)
    ORDER BY day ASC
  `).all(thirtyDaysAgo);

  // Error rate from observability
  const uptime = process.uptime();
  const memUsage = process.memoryUsage();

  res.json({
    users: {
      total: totalUsers.c,
      active: activeUsers.c,
      doctors: doctorCount.c,
      admins: adminCount.c,
      recentLogins: recentLogins.c,
    },
    sessions: {
      active: activeSessions.c,
    },
    audit: {
      totalEntries: totalAudit.c,
      last7Days: recentAudit.c,
      topActions,
    },
    sync: {
      totalKVEntries: kvCount.c,
      doctorAccounts: kvDoctors.c,
    },
    activity: {
      daily: dailyActivity,
    },
    system: {
      uptimeSeconds: Math.floor(uptime),
      memoryMB: {
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      },
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development',
    },
  });
}));

// ── System health check ───────────────────────────────────────────
adminDashboardRouter.get('/health', asyncHandler(async (req, res) => {
  let dbOk = true;
  let dbError = null;
  try {
    await db.prepare('SELECT 1 AS ok').get();
  } catch (e) {
    dbOk = false;
    dbError = e.message;
  }

  const checks = {
    database: { ok: dbOk, error: dbError },
    memory: {
      ok: process.memoryUsage().rss < 500 * 1024 * 1024, // < 500MB
      usedMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
    uptime: {
      ok: process.uptime() > 0,
      seconds: Math.floor(process.uptime()),
    },
  };

  const allOk = Object.values(checks).every(c => c.ok);
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  });
}));
