/**
 * OncoConnect Server — Headless server-only Electron app
 *
 * Runs the shared backend. Shows a simple status window.
 * Doctor / Patient / Lab apps run fully self-contained now.
 */

import { app, BrowserWindow, shell, ipcMain, Menu, dialog } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { chdir } from 'node:process';

// Fix Windows sandbox/GPU crash on Electron 33
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('user-data-dir', join(app.getPath('temp'), 'oncoconnect-server'));

// Ensure working directory is next to the exe
const exeDir = dirname(app.getPath('exe'));
try { chdir(exeDir); } catch {}
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import { saveServerUrl } from './shared-config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PUBLIC = join(ROOT, 'public');

let mainWindow = null;
let httpServer = null;
let expressApp = null;
let serverPort = 0;

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
  if (pathname === '/') pathname = '/index.html';
  const filePath = join(PUBLIC, pathname);
  if (!filePath.startsWith(PUBLIC)) { res.writeHead(403); res.end('Forbidden'); return; }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    if (expressApp) { expressApp(req, res); return; }
    const fallback = join(PUBLIC, 'index.html');
    if (existsSync(fallback)) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); createReadStream(fallback).pipe(res); }
    else { res.writeHead(404); res.end('Not Found'); }
    return;
  }
  const ext = join('.', pathname.split('.').pop()).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  createReadStream(filePath).pipe(res);
}

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

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const iface of nets[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

function createWindow(port, lanIP) {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 400,
    title: 'OncoConnect Server',
    icon: join(PUBLIC, 'icons', 'doctor-512.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#080d1a',
    show: false,
    resizable: false,
  });

  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getServerHTML(port, lanIP))}`);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'OncoConnect Server', submenu: [
      { label: '🔄  Restart Server', click: () => mainWindow?.webContents.reload() },
      { type: 'separator' },
      { role: 'toggleDevTools', accelerator: 'CmdOrCtrl+Shift+I' },
    ]},
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'close' }] },
  ]));
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
body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;padding:40px 32px;display:flex;flex-direction:column;align-items:center;justify-content:center;-webkit-app-region:drag;user-select:none;overflow:hidden;}
.drag-bar{position:fixed;top:0;left:0;right:0;height:38px;-webkit-app-region:drag;z-index:10;}
.logo{width:64px;height:64px;border-radius:18px;background:linear-gradient(135deg,var(--blue),var(--blue2));display:inline-flex;align-items:center;justify-content:center;font-size:30px;box-shadow:0 10px 40px rgba(37,99,235,.35);margin-bottom:20px;}
h1{font-size:1.5rem;font-weight:800;letter-spacing:-.4px;margin-bottom:4px;}
.sub{font-size:13px;color:var(--text-muted);margin-bottom:28px;}
.status-badge{display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border-radius:10px;font-size:13px;font-weight:600;margin-bottom:16px;}
.status-badge.online{background:rgba(5,150,105,.1);border:1px solid rgba(5,150,105,.2);color:var(--green);}
.pulse{width:8px;height:8px;border-radius:50%;background:var(--green);animation:pulse 2s infinite;}
@keyframes pulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(5,150,105,.4)}50%{opacity:.7;box-shadow:0 0 0 8px rgba(5,150,105,0)}}
.info{font-size:12px;color:var(--text-muted);text-align:center;line-height:1.6;max-width:340px;}
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
<div class="info">All client apps (Doctor, Patient, Lab) are now fully self-contained and run their own local servers. No manual connection needed.</div>
<div class="footer">🔒 All data encrypted locally · <span>v2.0</span></div>
</body>
</html>`;
}

// ── IPC ───────────────────────────────────────────────────────────
ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:getDBPath', () => join(app.getPath('userData'), 'data'));
ipcMain.handle('app:getPlatform', () => process.platform);

// ── App lifecycle ─────────────────────────────────────────────────
app.whenReady().then(async () => {
  try {
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
    
    // Save server URL for client apps to discover
    const serverUrl = `http://127.0.0.1:${serverPort}`;
    saveServerUrl(serverUrl);

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
