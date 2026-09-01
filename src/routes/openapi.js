// OpenAPI 3.0 documentation for VELTRUVIA API.

import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const openapiRouter = Router();

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'VELTRUVIA API',
    description: 'Secure healthcare API for neuro-oncology clinical workflows. Handles authentication, patient data sync, lab result management, team collaboration, and push notifications.',
    version: '2.0.0',
    contact: { name: 'VELTRUVIA Support', email: 'support@veltruvia.io' },
    license: { name: 'HIPAA Compliant', url: 'https://en.wikipedia.org/wiki/Health_Insurance_Portability_and_Accountability_Act' },
  },
  servers: [
    { url: '/', description: 'Current server' },
    { url: 'https://veltruvia-server.onrender.com', description: 'Production (Render)' },
  ],
  components: {
    securitySchemes: {
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'cc_session',
        description: 'JWT session cookie (httpOnly)',
      },
    },
    schemas: {
      Error: { type: 'object', properties: { error: { type: 'string' } } },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' }, email: { type: 'string', format: 'email' },
          role: { type: 'string', enum: ['doctor', 'admin'] },
          active: { type: 'boolean' }, createdAt: { type: 'string' },
          lastLogin: { type: 'string' }, name: { type: 'string' },
        },
      },
      Patient: {
        type: 'object',
        properties: {
          mrn: { type: 'string' }, name: { type: 'string' }, dob: { type: 'string' },
          diag: { type: 'string' }, phase: { type: 'string' },
          age: { type: 'integer' }, gender: { type: 'string' },
        },
      },
      AuditEntry: {
        type: 'object',
        properties: {
          ts: { type: 'string', format: 'date-time' },
          actorId: { type: 'string' }, actorRole: { type: 'string' },
          action: { type: 'string' }, targetId: { type: 'string' },
          ip: { type: 'string' }, detail: { type: 'object' },
        },
      },
      Dashboard: {
        type: 'object',
        properties: {
          users: { type: 'object', properties: { total: { type: 'integer' }, active: { type: 'integer' } } },
          sessions: { type: 'object', properties: { active: { type: 'integer' } } },
          audit: { type: 'object', properties: { totalEntries: { type: 'integer' }, last7Days: { type: 'integer' } } },
          sync: { type: 'object', properties: { totalKVEntries: { type: 'integer' } } },
          system: { type: 'object', properties: { uptimeSeconds: { type: 'integer' }, memoryMB: { type: 'object' } } },
        },
      },
      SyncKeys: {
        type: 'object',
        properties: { keys: { type: 'object', description: 'Key-value data for the authenticated entity' } },
      },
      LabToken: {
        type: 'object',
        properties: {
          taskId: { type: 'string' }, mrn: { type: 'string' }, desc: { type: 'string' },
          dueDate: { type: 'string' }, priority: { type: 'string' },
          patName: { type: 'string' }, labId: { type: 'string' },
        },
      },
      PushSubscription: {
        type: 'object',
        properties: {
          endpoint: { type: 'string' },
          keys: { type: 'object', properties: { p256dh: { type: 'string' }, auth: { type: 'string' } } },
        },
      },
    },
  },
  security: [{ cookieAuth: [] }],
  paths: {
    '/health': {
      get: {
        summary: 'Health check',
        tags: ['System'],
        parameters: [
          { name: 'deep', in: 'query', schema: { type: 'string', enum: ['0', '1'] } },
        ],
        responses: { 200: { description: 'Server is healthy' }, 503: { description: 'Server is unhealthy' } },
      },
    },
    '/api/auth/register': {
      post: {
        summary: 'Register a new doctor account',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['email', 'password', 'name'], properties: { email: { type: 'string' }, password: { type: 'string', minLength: 8 }, name: { type: 'string' } } } } },
        },
        responses: { 200: { description: 'Registration successful' }, 409: { description: 'Email already registered' } },
      },
    },
    '/api/auth/login': {
      post: {
        summary: 'Sign in (doctor or admin)',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' } } } } },
        },
        responses: { 200: { description: 'Login successful, sets httpOnly session cookie' }, 401: { description: 'Invalid credentials' } },
      },
    },
    '/api/auth/logout': {
      post: {
        summary: 'Sign out (revokes session)',
        tags: ['Auth'],
        responses: { 200: { description: 'Logged out' } },
      },
    },
    '/api/sync/pull': {
      get: {
        summary: 'Pull all sync keys for the authenticated doctor',
        tags: ['Sync'],
        responses: { 200: { description: 'All key-value pairs', content: { 'application/json': { schema: { $ref: '#/components/schemas/SyncKeys' } } } } },
      },
    },
    '/api/sync/push': {
      post: {
        summary: 'Push key-value data to the server',
        tags: ['Sync'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { keys: { type: 'object' } } } } },
        },
        responses: { 200: { description: 'Data merged' } },
      },
    },
    '/api/sync/patient-login': {
      post: {
        summary: 'Patient login (pulls patient keys)',
        tags: ['Sync'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['mrn', 'password'], properties: { mrn: { type: 'string' }, password: { type: 'string' } } } } },
        },
        responses: { 200: { description: 'Patient keys and session cookie' }, 401: { description: 'Invalid credentials' } },
      },
    },
    '/api/sync/lab-login': {
      post: {
        summary: 'Lab portal login (pulls lab tasks + patient list)',
        tags: ['Sync'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['username', 'password'], properties: { username: { type: 'string' }, password: { type: 'string' } } } } },
        },
        responses: { 200: { description: 'Lab keys and session cookie' }, 401: { description: 'Invalid credentials' } },
      },
    },
    '/api/admin/users': {
      get: {
        summary: 'List all user accounts (admin only)',
        tags: ['Admin'],
        responses: { 200: { description: 'User list', content: { 'application/json': { schema: { type: 'object', properties: { users: { type: 'array', items: { $ref: '#/components/schemas/User' } } } } } } } },
      },
    },
    '/api/admin/users/{id}/active': {
      post: {
        summary: 'Approve or deactivate a user (admin only)',
        tags: ['Admin'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['active'], properties: { active: { type: 'boolean' } } } } },
        },
        responses: { 200: { description: 'User status updated' } },
      },
    },
    '/api/admin/audit': {
      get: {
        summary: 'Get audit log entries (admin only)',
        tags: ['Admin'],
        parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } }],
        responses: { 200: { description: 'Audit entries', content: { 'application/json': { schema: { type: 'object', properties: { entries: { type: 'array', items: { $ref: '#/components/schemas/AuditEntry' } } } } } } } },
      },
    },
    '/api/admin/dashboard': {
      get: {
        summary: 'Get dashboard metrics (admin only)',
        tags: ['Admin'],
        responses: { 200: { description: 'Dashboard metrics', content: { 'application/json': { schema: { $ref: '#/components/schemas/Dashboard' } } } } },
      },
    },
    '/api/admin/health': {
      get: {
        summary: 'System health check (admin only)',
        tags: ['Admin'],
        responses: { 200: { description: 'All checks healthy' }, 503: { description: 'One or more checks degraded' } },
      },
    },
    '/api/team/share': {
      post: {
        summary: 'Share a patient with another doctor (team collaboration)',
        tags: ['Team'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['mrn', 'targetDoctorId'], properties: { mrn: { type: 'string' }, targetDoctorId: { type: 'string' } } } } },
        },
        responses: { 200: { description: 'Patient shared' } },
      },
    },
    '/api/email/reminders': {
      get: {
        summary: 'Get appointment reminder status for all upcoming appointments',
        tags: ['Email'],
        responses: { 200: { description: 'Reminder status per appointment' } },
      },
    },
    '/api/email/status': {
      get: {
        summary: 'Check email + SMS configuration status',
        tags: ['Email'],
        responses: { 200: { description: 'Configuration status' } },
      },
    },
    '/api/push/vapid-public-key': {
      get: {
        summary: 'Get VAPID public key for web push subscriptions',
        tags: ['Push'],
        responses: { 200: { description: 'VAPID public key' } },
      },
    },
    '/api/push/subscribe': {
      post: {
        summary: 'Subscribe to push notifications',
        tags: ['Push'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/PushSubscription' } } },
        },
        responses: { 200: { description: 'Subscription saved' } },
      },
    },
    '/api/metrics': {
      get: {
        summary: 'Get request flow metrics (admin only)',
        tags: ['System'],
        responses: { 200: { description: 'Metrics snapshot' } },
      },
    },
  },
  tags: [
    { name: 'System', description: 'Health checks and metrics' },
    { name: 'Auth', description: 'Registration, login, and logout' },
    { name: 'Sync', description: 'Client-server data synchronization' },
    { name: 'Admin', description: 'Admin-only endpoints (user management, audit log, dashboard)' },
    { name: 'Team', description: 'Multi-doctor collaboration' },
    { name: 'Email', description: 'Email/SMS reminders and configuration' },
    { name: 'Push', description: 'Web push notification subscriptions' },
  ],
};

// Serve the spec as JSON
openapiRouter.get('/openapi.json', (req, res) => {
  res.json(spec);
});

// Serve a built-in Swagger UI (no CDN dependency)
openapiRouter.get('/', (req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VELTRUVIA API Docs</title>
  <style>
    body{font-family:system-ui,sans-serif;background:#fafafa;color:#333;margin:0;padding:20px;}
    h1{color:#1a56db;margin-bottom:4px;}
    .subtitle{color:#666;font-size:14px;margin-bottom:20px;}
    .endpoint{background:#fff;border:1px solid #e0e0e0;border-radius:8px;margin-bottom:12px;overflow:hidden;}
    .endpoint-header{padding:12px 16px;cursor:pointer;display:flex;align-items:center;gap:10px;}
    .endpoint-header:hover{background:#f5f5f5;}
    .method{font-size:11px;font-weight:800;padding:3px 8px;border-radius:4px;color:#fff;min-width:50px;text-align:center;}
    .get{background:#10b981;} .post{background:#3b82f6;} .put{background:#f59e0b;} .delete{background:#ef4444;}
    .path{font-family:monospace;font-size:13px;font-weight:600;}
    .summary{color:#666;font-size:12px;margin-left:auto;}
    .tag{font-size:10px;background:#e5e7eb;padding:2px 6px;border-radius:4px;color:#555;}
    .details{padding:12px 16px;border-top:1px solid #e0e0e0;display:none;font-size:12px;line-height:1.7;}
    .details pre{background:#f5f5f5;padding:10px;border-radius:4px;overflow-x:auto;font-size:11px;}
    .section-title{font-size:13px;font-weight:700;color:#1a56db;margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px;}
  </style>
</head>
<body>
  <h1>🧬 VELTRUVIA API Documentation</h1>
  <div class="subtitle">OpenAPI 3.0 · ${spec.info.version} · <a href="/api/docs/openapi.json">Download JSON Spec</a></div>
  <p style="font-size:12px;color:#888;">All authenticated endpoints require the <code>cc_session</code> httpOnly cookie. Click any endpoint for details.</p>
  ${spec.tags.map(tag => {
    const endpoints = Object.entries(spec.paths)
      .filter(([, methods]) => Object.values(methods).some(m => m.tags?.includes(tag.name)))
      .map(([path, methods]) => {
        const m = Object.entries(methods).find(([, v]) => v.tags?.includes(tag.name));
        return { method: m[0].toUpperCase(), path, ...m[1] };
      });
    if (!endpoints.length) return '';
    return `<div class="section-title">${tag.name} — ${tag.description}</div>` +
      endpoints.map(e => `
        <div class="endpoint">
          <div class="endpoint-header" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
            <span class="method ${e.method.toLowerCase()}">${e.method}</span>
            <span class="path">${e.path}</span>
            <span class="summary">${e.summary}</span>
          </div>
          <div class="details">
            ${e.description ? '<p>' + e.description + '</p>' : ''}
            <pre>${JSON.stringify(e, null, 2).replace(/</g, '&lt;')}</pre>
          </div>
        </div>
      `).join('');
  }).join('\n')}
</body>
</html>`);
});
