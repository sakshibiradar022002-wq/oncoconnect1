/**
 * VELTRUVIA Doctor — Standalone Desktop App
 * 
 * Fully self-contained. Runs its own local Express API + SQLite database.
 * Linked to Patient and Lab apps via blockchain.
 * NO server app needed — just open and use.
 */

import { app, BrowserWindow, shell, ipcMain, Menu, dialog, safeStorage } from 'electron';
import { setupAutoUpdate } from './updater.js';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, extname, relative, isAbsolute } from 'node:path';

// Windows compatibility fixes
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

import { createServer } from 'node:http';
import https from 'node:https';
import { createReadStream, existsSync, readFileSync, writeFileSync, statSync, mkdirSync } from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import blockchain from './blockchain.js';
import { getServerUrl } from './shared-config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PUBLIC = join(ROOT, 'public');

let mainWindow = null;
let httpServer = null;
let centralServerUrl = null;
let expressApp = null;
let serverPort = 0;
let dbInfo = { readOnly: false, impl: 'unknown' };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.wasm': 'application/wasm',
};

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://127.0.0.1:${serverPort}`);
  let pathname = url.pathname;

  // API routes → Express
  if (pathname.startsWith('/api/')) {
    if (expressApp) { expressApp(req, res); }
    else { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'API loading' })); }
    return;
  }

  // Blockchain API
  if (pathname === '/api/blockchain/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(blockchain.getStats()));
    return;
  }
  if (pathname === '/api/blockchain/verify') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(blockchain.verify()));
    return;
  }

  // Static files — NO Content-Disposition header (avoids Electron download dialogs)
  if (pathname === '/') pathname = '/index.html';
  const filePath = join(PUBLIC, pathname);
  const rel = relative(PUBLIC, filePath);
  if (rel.startsWith('..') || isAbsolute(rel)) { res.writeHead(403); res.end('Forbidden'); return; }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    const fallback = join(PUBLIC, 'index.html');
    if (existsSync(fallback)) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); createReadStream(fallback).pipe(res); }
    else { res.writeHead(404); res.end('Not Found'); }
    return;
  }
  const ext = extname(pathname).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  createReadStream(filePath).pipe(res);
}

async function probeServer(url, timeout = 2000) {
  // fetch handles both http:// (clinic PC) and https:// (cloud VM) and follows redirects.
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    const res = await fetch(`${url}/api/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok ? url : null;
  } catch { return null; }
}

async function tryLoadExpress(port) {
  // 0) Explicit override wins (cloud deployments): VELTRUVIA_SERVER_URL env var
  let serverUrl = (process.env.VELTRUVIA_SERVER_URL || '').replace(/\/+$/, '') || null;
  if (serverUrl) {
    const ok = await probeServer(serverUrl);
    if (ok) { serverUrl = ok; console.log(`[doctor] Using VELTRUVIA_SERVER_URL: ${ok}`); }
    else { console.warn(`[doctor] VELTRUVIA_SERVER_URL unreachable: ${serverUrl}`); serverUrl = null; }
  }
  // 1) Try shared config file next
  if (!serverUrl) {
    serverUrl = getServerUrl();
    if (serverUrl) {
      const ok = await probeServer(serverUrl);
      if (ok) { serverUrl = ok; } else { serverUrl = null; }
    }
  }

  // 2) If config didn't work, scan common ports for the Server
  if (!serverUrl) {
    const candidates = [3000, 3001, 3002, 3003, 4000, 5000, 8080];
    console.log('[doctor] Scanning common ports for central Server...');
    for (const p of candidates) {
      const found = await probeServer(`http://127.0.0.1:${p}`);
      if (found) { serverUrl = found; console.log(`[doctor] Found Server on port ${p}`); break; }
    }
  }

  if (serverUrl) {
    centralServerUrl = serverUrl;
    console.log(`[doctor] ✅ Connected to central Server at ${serverUrl}`);
    // Proxy all API calls to the central Server
    expressApp = (req, res) => {
      const proxyUrl = new URL(req.url, serverUrl);
      const transport = proxyUrl.protocol === 'https:' ? https : http;
      const options = {
        hostname: proxyUrl.hostname,
        port: proxyUrl.port || (proxyUrl.protocol === 'https:' ? 443 : 80),
        path: proxyUrl.pathname + proxyUrl.search,
        method: req.method,
        headers: { ...req.headers, host: proxyUrl.host, origin: proxyUrl.origin },
      };
      const proxyReq = transport.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      });
      proxyReq.on('error', (err) => {
        console.error('[doctor] Proxy error:', err.message);
        res.writeHead(502);
        res.end(JSON.stringify({ error: 'Server unavailable' }));
      });
      req.pipe(proxyReq);
    };
    return;
  }

  // Fallback: run standalone with local Express + SQLite
  try {
    process.env.PORT = String(port);
    if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development';
    process.env.ELECTRON_RUN = '1';
    const { app: electronApp } = await import('electron');
    const userData = electronApp.getPath('userData');
    const dataDir = join(userData, 'data');
    try { mkdirSync(dataDir, { recursive: true }); } catch {}
    // SHARED database — all apps use the same one so data is shared even without the central Server
    // ROOT = VELTRUVIA Doctor/resources/app → go up 3 levels to E:\ve\data
    const sharedDataDir = join(ROOT, '..', '..', '..', 'data');
    try { mkdirSync(sharedDataDir, { recursive: true }); } catch {}
    // Crash/error capture → data/error-log.jsonl (best-effort, never throws)
    try { const { installErrorHandlers } = await import(pathToFileURL(join(ROOT, 'src', 'errors.js')).href); installErrorHandlers({ logPath: join(sharedDataDir, 'error-log.jsonl'), name: 'veltruvia-doctor' }); } catch {}
    process.env.DB_PATH = join(sharedDataDir, 'veltruvia.db');
    // Load shared .env from E:\ve so all apps use the same PHI_ENCRYPTION_KEY
    try {
      const dotenv = await import('dotenv');
      const envPath = join(ROOT, '..', '..', '..', '.env');
      dotenv.config({ path: envPath });
    } catch {}
    const mod = await import(pathToFileURL(join(ROOT, 'src', 'app.js')).href);
    expressApp = mod.app;
    // Capture DB mode for the read-only banner (same module instance app.js uses)
    try {
      const dbmod = await import(pathToFileURL(join(ROOT, 'src', 'db', 'index.js')).href);
      dbInfo = { readOnly: !!dbmod.db?.readOnly, impl: dbmod.activeImpl() };
      console.log(`[doctor] DB mode: ${dbInfo.impl} readOnly=${dbInfo.readOnly}`);
    } catch { dbInfo = { readOnly: false, impl: 'unknown' }; }
    // Shared backup scheduler (no-op if the central Server already started it)
    try { const { startBackups } = await import(pathToFileURL(join(ROOT, 'src', 'db', 'backup.js')).href); startBackups(); } catch {}
    console.log('[doctor] ✅ Local Express API loaded');
  } catch (err) {
    console.error('[doctor] ⚠️ Express failed:', err.message);
    expressApp = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    title: 'VELTRUVIA Doctor',
    icon: join(PUBLIC, 'icons', 'doctor-512.png'),
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    backgroundColor: '#080d1a',
    show: false,
  });

  // Robust download prevention — cancel any download that sneaks through
  mainWindow.webContents.session.on('will-download', (event, item) => {
    item.cancel();
    event.preventDefault();
    console.log('[doctor] Download blocked');
  });

  // Strip Content-Disposition headers from all local responses
  mainWindow.webContents.session.webRequest.onHeadersReceived(
    { urls: ['http://127.0.0.1/*', 'http://localhost/*'] },
    (details, callback) => {
      const headers = { ...details.responseHeaders };
      delete headers['content-disposition'];
      delete headers['Content-Disposition'];
      callback({ responseHeaders: headers });
    }
  );

  // Load HTML via HTTP server so fetch('/api/...') routes correctly
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`);

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  mainWindow.on('closed', () => { mainWindow = null; });

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'VELTRUVIA Doctor', submenu: [
      { label: '🔄 Refresh', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.reload() },
      { type: 'separator' },
      { role: 'toggleDevTools', accelerator: 'CmdOrCtrl+Shift+I' },
    ]},
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'close' }] },
  ]));
}

// IPC
ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:getPlatform', () => process.platform);
// Read-only DB mode (fallback when the central Server owns the database)
ipcMain.handle('app:getDbMode', () => dbInfo);
// ── safeStorage bridge: OS-protected wrapping for the client-side PHI key ──
ipcMain.handle('app:safeStorageIsAvailable', () => {
  try { return safeStorage.isEncryptionAvailable(); } catch { return false; }
});
ipcMain.handle('app:safeStorageEncrypt', (_, text) => {
  try { return safeStorage.encryptString(String(text)).toString('base64'); } catch { return null; }
});
ipcMain.handle('app:safeStorageDecrypt', (_, b64) => {
  try { return safeStorage.decryptString(Buffer.from(String(b64), 'base64')); } catch { return null; }
});
ipcMain.handle('blockchain:stats', () => blockchain.getStats());
ipcMain.handle('blockchain:verify', () => blockchain.verify());
ipcMain.handle('blockchain:records', (_, mrn) => blockchain.getPatientRecords(mrn));

// App lifecycle
app.whenReady().then(async () => {
  try {
    // Auto-update via GitHub Releases (no-op in dev / before first release)
    try { setupAutoUpdate({ channel: 'latest-doctor' }); } catch {}

    serverPort = await findFreePort();
    httpServer = createServer(serveStatic);
    await new Promise((resolve, reject) => {
      httpServer.listen(serverPort, '127.0.0.1', resolve);
      httpServer.on('error', reject);
    });
    console.log(`[doctor] Local server on port ${serverPort}`);

    // Forward WebSocket upgrades (telehealth signaling) to the central Server.
    // Registered unconditionally: centralServerUrl is resolved by tryLoadExpress
    // moments after boot; later WS clients resolve it at request time.
    httpServer.on('upgrade', (req, socket, head) => {
      if (!centralServerUrl) { try { socket.destroy(); } catch {} return; }
      const target = new URL(req.url, centralServerUrl);
      const transport = target.protocol === 'https:' ? https : http;
      const upstream = transport.request({
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        path: target.pathname + target.search,
        method: req.method,
        headers: { ...req.headers, host: target.host },
      });
      upstream.on('upgrade', (upRes, upSocket, upHead) => {
        const lines = ['HTTP/1.1 101 Switching Protocols'];
        for (const [k, v] of Object.entries(upRes.headers)) lines.push(k + ': ' + v);
        socket.write(lines.join('\r\n') + '\r\n\r\n');
        if (upHead && upHead.length) socket.write(upHead);
        upSocket.pipe(socket);
        socket.pipe(upSocket);
      });
      upstream.on('response', (r2) => {
        socket.write('HTTP/1.1 ' + r2.statusCode + '\r\n\r\n');
        socket.end();
      });
      upstream.on('error', () => { try { socket.end(); } catch {} });
      upstream.end(head);
    });
    console.log('[doctor] WS upgrade forwarding ready');

    await tryLoadExpress(serverPort);
    
    // Record startup on blockchain
    blockchain.recordAudit('app_started', { app: 'doctor', port: serverPort }, 'doctor');
    console.log('[doctor] 🔗 Blockchain audit recorded');

    createWindow();
  } catch (err) {
    dialog.showErrorBox('VELTRUVIA Doctor — Error', err.message || String(err));
    app.quit();
  }
});

app.on('window-all-closed', () => { if (httpServer) httpServer.close(); app.quit(); });
app.on('before-quit', () => { if (httpServer) httpServer.close(); });
