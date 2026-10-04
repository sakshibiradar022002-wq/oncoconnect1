/**
 * VELTRUVIA Server — Background tray application
 *
 * Runs the shared backend silently in the system tray. No window is shown;
 * a tray menu offers Status / Open dashboard / Run-at-startup toggle / Quit.
 * Doctor (desktop) connects to this server; Patient and Lab connect as
 * mobile APKs over the network. Everything is linked through this one
 * always-on backend so all data is shared and saved on the server.
 */

import { app, Tray, Menu, shell, ipcMain, dialog, nativeImage } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, extname, relative, isAbsolute } from 'node:path';
import { chdir } from 'node:process';

// Fix Windows sandbox/GPU crash on Electron 33
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('user-data-dir', join(app.getPath('temp'), 'veltruvia-server'));

// Ensure working directory is next to the exe
const exeDir = dirname(app.getPath('exe'));
try { chdir(exeDir); } catch {}
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import { saveServerUrl } from './shared-config.js';
import { setupAutoUpdate } from './updater.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PUBLIC = join(ROOT, 'public');

let tray = null;
let httpServer = null;
let expressApp = null;
let serverPort = 0;
let quitting = false;
let expressOk = false;

// ── Single instance: a second launch just re-shows status ─────────
if (!app.requestSingleInstanceLock()) {
  console.log('[server] Another instance is already running — exiting.');
  app.quit();
} else {
  app.on('second-instance', () => {
    // A user double-launched the exe: no-op (the server is already running).
    // Tray menu → Status confirms it.
  });
}

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
    srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
    srv.on('error', reject);
  });
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://127.0.0.1:${serverPort}`);
  let pathname = url.pathname;
  if (pathname.startsWith('/api/')) {
    if (expressApp) { expressApp(req, res); }
    else { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'API loading' })); }
    return;
  }
  // Security headers for everything this raw server serves itself (the
  // Express app applies Helmet to /api and its own static fallback, but
  // direct file responses here previously went out with no headers).
  const SEC = {
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self' https://api.emailjs.com https://api.github.com; manifest-src 'self'; worker-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; object-src 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Origin-Agent-Cluster': '?1',
  };
  if (pathname === '/') pathname = '/index.html';
  const filePath = join(PUBLIC, pathname);
  const rel = relative(PUBLIC, filePath);
  if (rel.startsWith('..') || isAbsolute(rel)) { res.writeHead(403); res.end('Forbidden'); return; }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    if (expressApp) { expressApp(req, res); return; }
    const fallback = join(PUBLIC, 'index.html');
    if (existsSync(fallback)) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...SEC }); createReadStream(fallback).pipe(res); }
    else { res.writeHead(404, SEC); res.end('Not Found'); }
    return;
  }
  const ext = extname(pathname).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', ...SEC });
  createReadStream(filePath).pipe(res);
}

async function tryLoadExpress(port) {
  try {
    process.env.PORT = String(port);
    process.env.ELECTRON_RUN = '1';
    // NOTE: NODE_ENV must NOT be defaulted to 'development' before .env loads.
    // dotenv never overrides existing vars — pre-setting NODE_ENV here pinned the
    // packaged app to dev mode forever (no Secure cookies, no HSTS, OTP echo).
    // .env is loaded below, after sharedRoot is found; production rules live in src/config.js.
    const { app: electronApp } = await import('electron');
    const userData = electronApp.getPath('userData');
    const { mkdirSync } = await import('node:fs');
    // SHARED database — same path used by all desktop apps
    // ROOT = <install>\VELTRUVIA Server\resources\app → walk up to <install>, then use <install>\data
    // Find shared root dir: walk up until a directory contains two or more VELTRUVIA* app
    // folders (install root). Require directories so "VELTRUVIA Server.exe" doesn't false-positive.
    let sharedRoot = ROOT;
    for (let i = 0; i < 6; i++) {
      sharedRoot = dirname(sharedRoot);
      try {
        const { readdirSync } = await import('node:fs');
        const entries = readdirSync(sharedRoot, { withFileTypes: true });
        if (entries.filter(e => e.isDirectory() && e.name.startsWith('VELTRUVIA')).length >= 2) break;
      } catch {}
    }
    const sharedDataDir = join(sharedRoot, 'data');
    try { mkdirSync(sharedDataDir, { recursive: true }); } catch {}
    process.env.DB_PATH = join(sharedDataDir, 'veltruvia.db');
    // Crash/error capture → data/error-log.jsonl (best-effort, never throws)
    try { const { installErrorHandlers } = await import(pathToFileURL(join(ROOT, 'src', 'errors.js')).href); installErrorHandlers({ logPath: join(sharedDataDir, 'error-log.jsonl'), name: 'veltruvia-server' }); } catch {}
    // Load shared .env from the shared root so all apps use the same PHI_ENCRYPTION_KEY
    try {
      const dotenv = await import('dotenv');
      const envPath = join(sharedRoot, '.env');
      dotenv.config({ path: envPath });
    } catch {}
    const mod = await import(pathToFileURL(join(ROOT, 'src', 'app.js')).href);
    expressApp = mod.app;
    // Automated DB backups (default ON every 6 h, BACKUP_INTERVAL_MS=0 to disable)
    try { const { startBackups } = await import(pathToFileURL(join(ROOT, 'src', 'db', 'backup.js')).href); startBackups(); } catch {}
    console.log('[server] Express API loaded');
    return true;
  } catch (err) {
    console.error('[server] Express failed:', err.message);
    expressApp = null;
    return false;
  }
}

function getLocalIP() {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(nets)) {
    for (const iface of nets[name]) {
      if (iface.family === 'IPv4' && !iface.internal) candidates.push(iface.address);
    }
  }
  // Prefer real LAN ranges over virtual adapters (WSL/Docker use 172.x).
  const score = (ip) =>
    ip.startsWith('192.168.') ? 3 :
    ip.startsWith('10.') ? 2 :
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 1 : 0;
  return candidates.sort((a, b) => score(b) - score(a))[0] || '127.0.0.1';
}

// ── Tray ──────────────────────────────────────────────────────────
function loadTrayIcon() {
  // 256×256 PNG scales cleanly to the small tray size on Windows.
  const iconPath = join(PUBLIC, 'icons', 'server-512.png');
  try {
    if (existsSync(iconPath)) return nativeImage.createFromPath(iconPath);
  } catch {}
  return nativeImage.createEmpty();
}

function statusText() {
  const url = `http://127.0.0.1:${serverPort}`;
  return expressOk
    ? `VELTRUVIA Server is running\nAPI:  ${url}/health\nLocal: http://${getLocalIP()}:${serverPort}`
    : `VELTRUVIA Server is starting…`;
}

function showStatusDialog() {
  dialog.showMessageBox({
    type: 'info',
    title: 'VELTRUVIA Server',
    message: expressOk ? '✅ Server is running' : '⏳ Server is starting…',
    detail: statusText(),
    buttons: ['OK'],
  });
}

function buildTray() {
  tray = new Tray(loadTrayIcon());
  tray.setToolTip('VELTRUVIA Server — running in background');
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: expressOk ? '● Server running' : '○ Server starting…', enabled: false },
    { label: `Port ${serverPort || '—'} · 127.0.0.1` + (expressOk ? ` · LAN http://${getLocalIP()}:${serverPort}` : ''), enabled: false },
    { type: 'separator' },
    { label: 'Show status', click: showStatusDialog },
    { label: 'Open dashboard in browser', click: () => {
        shell.openExternal(`http://127.0.0.1:${serverPort}/`);
      } },
    { type: 'separator' },
    { label: 'Run at Windows startup', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked, path: process.execPath });
        console.log(`[server] openAtLogin → ${item.checked}`);
      } },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

// ── IPC (kept for compatibility with scripts that query it) ───────
ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:getDBPath', () => join(app.getPath('userData'), 'data'));
ipcMain.handle('app:getPlatform', () => process.platform);
ipcMain.handle('server:status', () => ({ ok: expressOk, port: serverPort }));

// ── App lifecycle ─────────────────────────────────────────────────
app.whenReady().then(async () => {
  try {
    // Auto-update via GitHub Releases (no-op in dev / before first release)
    try { setupAutoUpdate({ channel: 'latest-server' }); } catch {}

    // Auto-start with Windows on first run (user can disable via tray menu).
    try {
      if (!app.getLoginItemSettings().wasOpenedAtLogin && !app.getLoginItemSettings().openAtLogin) {
        app.setLoginItemSettings({ openAtLogin: true, path: process.execPath });
        console.log('[server] Registered for Windows startup');
      }
    } catch {}

    const PREFERRED_PORT = 3000;
    try {
      const testSrv = net.createServer();
      await new Promise((res, rej) => { testSrv.listen(PREFERRED_PORT, '0.0.0.0', res); testSrv.on('error', rej); });
      testSrv.close();
      serverPort = PREFERRED_PORT;
    } catch (e) {
      serverPort = await findFreePort();
    }

    httpServer = createServer(serveStatic);
    await new Promise((resolve, reject) => {
      httpServer.listen(serverPort, '0.0.0.0', resolve);
      httpServer.on('error', reject);
    });
    console.log(`[server] Listening on port ${serverPort}`);

    // Save server URL for desktop client apps to discover
    saveServerUrl(`http://127.0.0.1:${serverPort}`);

    buildTray();

    // Load Express in background with a watchdog: a silent import failure
    // (observed in the packaged exe) used to leave the API stuck at
    // "API loading" forever. Retry twice, then self-heal the known cause
    // (corrupt DB at boot: quarantine it and restore from backups/).
    const loadWithWatchdog = async (attempt = 1) => {
      const ok = await tryLoadExpress(serverPort);
      expressOk = ok;
      rebuildTrayMenu();
      if (ok) return true;
      if (attempt < 3) {
        console.error(`[server] Express load attempt ${attempt} failed — retrying in 3 s`);
        await new Promise(r => setTimeout(r, 3000));
        return loadWithWatchdog(attempt + 1);
      }
      try {
        const dataDir = dirname(process.env.DB_PATH || '');
        const { repairCorruptDb } = await import(pathToFileURL(join(ROOT, 'src', 'db', 'repair.js')).href);
        repairCorruptDb(process.env.DB_PATH, dataDir);
      } catch (e) { console.error('[server] corrupt-DB self-heal failed:', e.message); }
      console.error('[server] Express load failed after retries and self-heal — run Launch Server.bat again');
      try { dialog.showErrorBox('VELTRUVIA Server', 'The API failed to load after several attempts.\n\nA corrupt database was detected and restored from the newest backup if one existed.\nStart the server again — if this keeps happening, see data/error-log.jsonl.'); } catch {}
      return false;
    };
    loadWithWatchdog().then(ok => {
      if (ok) {
        // ── LAN HTTPS sidecar (mirrors src/server.js) ────────────────
        // Main listener stays plain HTTP so loopback consumers (desktop
        // apps, the cloud tunnel) are unaffected. When TLS_KEY/TLS_CERT
        // point at PEM files (loaded from the shared .env during Express
        // load — that's why this lives AFTER loadWithWatchdog), a SECOND
        // listener serves HTTPS on 0.0.0.0 so phone/LAN traffic is
        // encrypted. TLS_LAN_PORT=0 disables.
        try {
          const tlsKeyPath = process.env.TLS_KEY;
          const tlsCertPath = process.env.TLS_CERT;
          const lanPort = parseInt(process.env.TLS_LAN_PORT || '3001', 10);
          if (tlsKeyPath && tlsCertPath && lanPort > 0
              && existsSync(tlsKeyPath) && existsSync(tlsCertPath)) {
            Promise.all([import('node:https'), import('node:fs')])
              .then(([{ createServer: createHttpsServer }, fsMod]) => {
                const httpsSrv = createHttpsServer({
                  key: fsMod.readFileSync(tlsKeyPath),
                  cert: fsMod.readFileSync(tlsCertPath),
                  minVersion: 'TLSv1.2',
                }, serveStatic);
                httpsSrv.on('error', (e) => console.warn('[server] LAN HTTPS sidecar error:', e.message));
                httpsSrv.listen(lanPort, '0.0.0.0', () => {
                  console.log(`[server] LAN HTTPS sidecar listening on 0.0.0.0:${lanPort}`);
                });
              })
              .catch((e) => console.warn('[server] LAN HTTPS sidecar failed to start:', e.message));
          }
        } catch (e) {
          console.warn('[server] LAN HTTPS sidecar failed to start:', e.message);
        }

        // Attach the telehealth WebSocket signaling to the same HTTP server.
        // (src/server.js does this for node boots; without it here the exe's
        // WebRTC signaling endpoint silently 404s on upgrade.)
        import(pathToFileURL(join(ROOT, 'src', 'routes', 'telehealth.js')).href)
          .then(({ attachTelehealthWs }) => {
            attachTelehealthWs(httpServer);
            console.log('[server] Telehealth WebSocket attached at /ws/telehealth');
          })
          .catch(err => console.error('[server] Telehealth WS attach failed:', err.message));
      }
    });

    console.log(`[server] Ready — LAN: http://${getLocalIP()}:${serverPort}`);
  } catch (err) {
    dialog.showErrorBox('VELTRUVIA Server — Error', err.message || String(err));
    app.quit();
  }
});

// Keep running when the tray is destroyed by explorer.exe restarts etc.;
// quitting only via the tray menu's Quit.
app.on('window-all-closed', (e) => { /* tray app: stay alive */ });
app.on('before-quit', () => { quitting = true; if (httpServer) httpServer.close(); });
app.on('quit', () => { if (httpServer) httpServer.close(); });
