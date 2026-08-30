/**
 * OncoConnect Server — Headless server-only Electron app
 *
 * This is the "linking software" that runs the shared backend.
 * It shows a small window with the server address and status.
 * Doctor / Patient / Lab apps connect to this server.
 *
 * Users: share the server IP address with anyone who has a portal app.
 */

import { app, BrowserWindow, shell, ipcMain, Menu, dialog } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import net from 'node:net';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PUBLIC = join(ROOT, 'public');

let mainWindow = null;
let httpServer = null;
let expressApp = null;
let serverPort = 0;

// ── MIME types ────────────────────────────────────────────────────
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

// ── Static file server ────────────────────────────────────────────
function serveStatic(req, res) {
  const url = new URL(req.url, `http://127.0.0.1:${serverPort}`);
  let pathname = url.pathname;
  if (pathname.startsWith('/api/')) {
    if (expressApp) { expressApp(req, res); }
    else { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'API loading' })); }
    return;
  }
  if (pathname === '/') pathname = '/index.html';
  const filePath = join(PUBLIC, pathname);
  if (!filePath.startsWith(PUBLIC)) { res.writeHead(403); res.end('Forbidden'); return; }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    // Try Express for non-static routes (e.g. /health, /schedule, etc.)
    if (expressApp) { expressApp(req, res); return; }
    // Fallback to index.html for SPA routing
    const fallback = join(PUBLIC, 'index.html');
    if (existsSync(fallback)) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); createReadStream(fallback).pipe(res); }
    else { res.writeHead(404); res.end('Not Found'); }
    return;
  }
  const ext = join('.', pathname.split('.').pop()).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  createReadStream(filePath).pipe(res);
}

// ── Load Express API ──────────────────────────────────────────────
async function tryLoadExpress(port) {
  try {
    process.env.PORT = String(port);
    if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development';
    process.env.ELECTRON_RUN = '1';
    const { app: electronApp } = await import('electron');
    const userData = electronApp.getPath('userData');
    const { mkdirSync } = await import('node:fs');
    const dataDir = join(userData, 'data');
    try { mkdirSync(dataDir, { recursive: true }); } catch {}
    process.env.DB_PATH = join(dataDir, 'oncoconnect.db');
    await import('dotenv/config').catch(() => {});
    const mod = await import(pathToFileURL(join(ROOT, 'src', 'app.js')).href);
    expressApp = mod.app;
    console.log('[server] Express API loaded');
    return true;
  } catch (err) {
    console.error('[server] Express failed:', err.message);
    expressApp = null;
    return false;
  }
}

// ── Server status window ──────────────────────────────────────────
function createWindow(port, lanIP) {
  const LAN_IP = lanIP || getLocalIP();

  mainWindow = new BrowserWindow({
    width: 520,
    height: 560,
    title: 'OncoConnect Server',
    icon: join(PUBLIC, 'icons', 'doctor-512.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#080d1a',
    show: false,
    resizable: false,
  });

  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getServerHTML(port, LAN_IP))}`);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  // Minimal menu
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'OncoConnect Server', submenu: [
      { label: '🔄  Restart Server', click: () => mainWindow?.webContents.reload() },
      { type: 'separator' },
      { role: 'toggleDevTools', accelerator: 'CmdOrCtrl+Shift+I' },
    ]},
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'close' }] },
  ]));
}

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const iface of nets[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

function getServerHTML(port, lanIP) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OncoConnect Server</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--bg:#080d1a;--surface:#0f1729;--border:#1e2d4a;--text:#e2e8f0;--text-muted:#8494b2;--blue:#2563eb;--blue2:#1d4ed8;--green:#059669;--red:#dc2626;}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;padding:40px 32px;-webkit-app-region:drag;user-select:none;overflow:hidden;}
.drag-bar{position:fixed;top:0;left:0;right:0;height:38px;-webkit-app-region:drag;z-index:10;}
.logo{width:64px;height:64px;border-radius:18px;background:linear-gradient(135deg,var(--blue),var(--blue2));display:inline-flex;align-items:center;justify-content:center;font-size:30px;box-shadow:0 10px 40px rgba(37,99,235,.35);margin-bottom:20px;}
h1{font-size:1.5rem;font-weight:800;letter-spacing:-.4px;margin-bottom:4px;}
.sub{font-size:13px;color:var(--text-muted);margin-bottom:28px;}
.status-badge{display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border-radius:10px;font-size:13px;font-weight:600;margin-bottom:24px;}
.status-badge.online{background:rgba(5,150,105,.1);border:1px solid rgba(5,150,105,.2);color:var(--green);}
.status-badge.offline{background:rgba(220,38,38,.1);border:1px solid rgba(220,38,38,.2);color:var(--red);}
.pulse{width:8px;height:8px;border-radius:50%;background:var(--green);animation:pulse 2s infinite;}
@keyframes pulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(5,150,105,.4)}50%{opacity:.7;box-shadow:0 0 0 8px rgba(5,150,105,0)}}
.address-card{background:var(--surface);border:1.5px solid var(--border);border-radius:16px;padding:20px;margin-bottom:16px;-webkit-app-region:no-drag;}
.address-label{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px;}
.address-value{font-family:'IBM Plex Mono',monospace;font-size:15px;font-weight:700;color:var(--blue);padding:12px 16px;background:var(--bg);border:1px solid var(--border);border-radius:10px;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:space-between;}
.address-value:hover{border-color:var(--blue);box-shadow:0 0 0 3px rgba(37,99,235,.1);}
.copy-hint{font-size:11px;color:var(--text-muted);margin-top:8px;}
.copy-btn{font-size:11px;color:var(--blue);cursor:pointer;font-weight:600;}
.instructions{margin-top:20px;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:18px;-webkit-app-region:no-drag;}
.instructions h3{font-size:12px;font-weight:700;margin-bottom:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;}
.step{display:flex;gap:12px;margin-bottom:12px;align-items:flex-start;}
.step-num{flex-shrink:0;width:24px;height:24px;border-radius:8px;background:linear-gradient(135deg,var(--blue),var(--blue2));display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;}
.step-text{font-size:13px;color:var(--text-muted);line-height:1.5;}
.step-text strong{color:var(--text);}
.launch-section{margin-bottom:20px;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:18px;-webkit-app-region:no-drag;}
.launch-section h3{font-size:12px;font-weight:700;margin-bottom:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;}
.launch-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px;}
.launch-btn{display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px 12px;border-radius:12px;border:1.5px solid var(--border);background:var(--bg);cursor:pointer;transition:all .2s;-webkit-app-region:no-drag;}
.launch-btn:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,.3);}
.launch-btn.doctor:hover{border-color:#3b82f6;box-shadow:0 4px 12px rgba(59,130,246,.2);}
.launch-btn.patient:hover{border-color:#22c55e;box-shadow:0 4px 12px rgba(34,197,94,.2);}
.launch-btn.lab:hover{border-color:#a78bfa;box-shadow:0 4px 12px rgba(167,139,250,.2);}
.launch-icon{font-size:28px;}
.launch-text{font-size:11px;font-weight:600;color:var(--text-muted);}
.launch-hint{text-align:center;font-size:10px;color:var(--text-dim);}
.footer{margin-top:24px;text-align:center;font-size:11px;color:#4a5f82;}
.footer span{color:#34d399;}
</style>
</head>
<body>
<div class="drag-bar"></div>
<div class="logo">🧬</div>
<h1>OncoConnect Server</h1>
<div class="sub">Neuro-oncology EMR — Backend Server</div>
<div class="status-badge online" id="status"><div class="pulse"></div>Server Running</div>

<div class="address-card">
  <div class="address-label">🖥️ This Computer (LAN)</div>
  <div class="address-value" onclick="copyAddr(this)" id="lan-addr">http://${lanIP}:${port} <span class="copy-btn">📋 Copy</span></div>
  <div class="copy-hint">Share this address with Doctor / Patient / Lab apps on your network</div>
</div>

<div class="address-card">
  <div class="address-label">💻 This Computer (Local)</div>
  <div class="address-value" onclick="copyAddr(this)" id="local-addr">http://127.0.0.1:${port} <span class="copy-btn">📋 Copy</span></div>
  <div class="copy-hint">For apps running on this same computer</div>
</div>

<div class="launch-section">
  <h3>🚀 Launch Client Apps</h3>
  <div class="launch-grid">
    <button class="launch-btn doctor" onclick="launchApp('doctor')">
      <span class="launch-icon">👨‍⚕️</span>
      <span class="launch-text">Doctor App</span>
    </button>
    <button class="launch-btn patient" onclick="launchApp('patient')">
      <span class="launch-icon">💚</span>
      <span class="launch-text">Patient App</span>
    </button>
    <button class="launch-btn lab" onclick="launchApp('lab')">
      <span class="launch-icon">🔬</span>
      <span class="launch-text">Lab App</span>
    </button>
  </div>
  <div class="launch-hint">Apps will auto-connect to this server</div>
</div>

<div class="instructions">
  <h3>Or connect manually</h3>
  <div class="step"><div class="step-num">1</div><div class="step-text"><strong>Install</strong> the Doctor, Patient, or Lab app on another computer</div></div>
  <div class="step"><div class="step-num">2</div><div class="step-text"><strong>Enter</strong> this server address when the app asks for it</div></div>
  <div class="step"><div class="step-num">3</div><div class="step-text"><strong>Done!</strong> All data syncs automatically between devices</div></div>
</div>

<div class="footer">🔒 All data encrypted locally · <span>v2.0</span></div>

<script>
function copyAddr(el) {
  const addr = el.textContent.replace('📋 Copy', '').trim();
  navigator.clipboard.writeText(addr).then(() => {
    const btn = el.querySelector('.copy-btn');
    btn.textContent = '✅ Copied!';
    setTimeout(() => btn.textContent = '📋 Copy', 2000);
  });
}
async function launchApp(portal) {
  const btn = document.querySelector('.launch-btn.' + portal);
  if (btn) {
    btn.style.opacity = '0.5';
    btn.style.pointerEvents = 'none';
  }
  try {
    const result = await window.electronAPI?.launchApp(portal);
    if (btn) {
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
    }
  } catch (err) {
    console.error('Failed to launch:', err);
    if (btn) {
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
    }
  }
}
</script>
</body>
</html>`;
}

// ── IPC ───────────────────────────────────────────────────────────
ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:getDBPath', () => join(app.getPath('userData'), 'data'));
ipcMain.handle('app:getPlatform', () => process.platform);

// Launch a client app (Doctor/Patient/Lab) connected to this server
ipcMain.handle('server:launchApp', async (event, portal) => {
  const serverUrl = `http://127.0.0.1:${serverPort}`;
  const exePath = app.getPath('exe');
  const appDir = dirname(exePath);
  
  // Find the client app executable
  const appNames = {
    doctor: 'OncoConnect Doctor',
    patient: 'OncoConnect Patient',
    lab: 'OncoConnect Lab'
  };
  
  const appName = appNames[portal];
  if (!appName) return { ok: false, error: 'Unknown portal' };
  
  // Try to find and launch the app
  let targetPath;
  
  if (process.platform === 'win32') {
    targetPath = join(appDir, `${appName}.exe`);
  } else if (process.platform === 'darwin') {
    targetPath = join(dirname(appDir), 'MacOS', appName);
  } else {
    targetPath = join(dirname(appDir), appName.toLowerCase());
  }
  
  // If not found as separate app, try launching with current executable + args
  if (!existsSync(targetPath)) {
    targetPath = exePath;
  }
  
  try {
    const child = spawn(targetPath, [`--server=${serverUrl}`, `--portal=${portal}`], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    console.log(`[server] Launched ${portal} app: ${targetPath}`);
    return { ok: true, portal, url: serverUrl };
  } catch (err) {
    console.error(`[server] Failed to launch ${portal}:`, err.message);
    return { ok: false, error: err.message };
  }
});

// ── App lifecycle ─────────────────────────────────────────────────
app.whenReady().then(async () => {
  try {
    // Use port 3000 by default; fall back to a free port if busy
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
    await new Promise((resolve, reject) => { httpServer.listen(serverPort, '0.0.0.0', resolve); httpServer.on('error', reject); });
    console.log(`[server] Listening on port ${serverPort}`);

    // Load Express in background
    tryLoadExpress(serverPort).then(ok => {
      if (mainWindow && ok) {
        mainWindow.webContents.executeJavaScript(`
          document.getElementById('status').className = 'status-badge online';
          document.getElementById('status').innerHTML = '<div class="pulse"></div>Server Running';
        `);
      }
    });

    const lanIP = getLocalIP();
    createWindow(serverPort, lanIP);
  } catch (err) {
    dialog.showErrorBox('OncoConnect Server — Error', err.message || String(err));
    app.quit();
  }
});

app.on('window-all-closed', () => { if (httpServer) httpServer.close(); app.quit(); });
app.on('before-quit', () => { if (httpServer) httpServer.close(); });
