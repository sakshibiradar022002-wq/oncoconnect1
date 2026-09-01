// VELTRUVIA Desktop — Electron main process
// Uses a minimal static file server (Node built-ins only) + optional Express API.

import { app, BrowserWindow, shell, ipcMain, Menu, dialog } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import net from 'node:net';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PUBLIC = join(ROOT, 'public');

let mainWindow = null;
let httpServer = null;
let expressApp = null;   // loaded lazily
let serverPort = 0;

// ── MIME types for static file serving ────────────────────────────
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

// ── Find a free port ──────────────────────────────────────────────
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

// ── Minimal static file server (Node built-ins only) ──────────────
function serveStatic(req, res) {
  const url = new URL(req.url, `http://127.0.0.1:${serverPort}`);
  let pathname = url.pathname;

  // API routes: try the Express app if loaded
  if (pathname.startsWith('/api/')) {
    if (expressApp) {
      expressApp(req, res);
    } else {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'API server still loading, please try again in a moment' }));
    }
    return;
  }

  // Map /patient.html, /lab.html, /admin.html etc.
  if (pathname === '/') pathname = '/index.html';

  const filePath = join(PUBLIC, pathname);

  // Prevent directory traversal
  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(403); res.end('Forbidden');
    return;
  }

  // Check if file exists
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    // SPA fallback: serve index.html for non-API, non-file routes
    const fallback = join(PUBLIC, 'index.html');
    if (existsSync(fallback)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      createReadStream(fallback).pipe(res);
    } else {
      res.writeHead(404); res.end('Not Found');
    }
    return;
  }

  const ext = extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';

  res.writeHead(200, { 'Content-Type': contentType });
  createReadStream(filePath).pipe(res);
}

// ── Try to load the Express app (best-effort, non-blocking) ───────
async function tryLoadExpress(port) {
  try {
    // Set env vars the server expects
    process.env.PORT = String(port);
    if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development';
    process.env.ELECTRON_RUN = '1';

    // Set DB path directly so config.js doesn't need require('electron')
    const { app: electronApp } = await import('electron');
    const userData = electronApp.getPath('userData');
    const { mkdirSync } = await import('node:fs');
    const dataDir = join(userData, 'data');
    try { mkdirSync(dataDir, { recursive: true }); } catch {}
    process.env.DB_PATH = join(dataDir, 'veltruvia.db');

    // Import dotenv (no-op if .env missing)
    await import('dotenv/config').catch(() => {});

    // Import the Express app — this triggers DB init, seeding, etc.
    const mod = await import(pathToFileURL(join(ROOT, 'src', 'app.js')).href);
    expressApp = mod.app;

    // Start background services (non-critical)
    try {
      const { startAppointmentReminders } = await import(pathToFileURL(join(ROOT, 'src', 'push.js')).href);
      const { startReminderScheduler } = await import(pathToFileURL(join(ROOT, 'src', 'reminders.js')).href);
      startAppointmentReminders();
      startReminderScheduler();
    } catch (e) {
      console.warn('[electron] Background services not started:', e.message);
    }

    console.log('[electron] Express API loaded successfully');
  } catch (err) {
    console.error('[electron] Express API failed to load:', err.message);
    console.error('[electron] App will run in offline mode (localStorage only, no API)');
    expressApp = null;
  }
}

// ── Portal chooser HTML ───────────────────────────────────────────
function getLauncherHTML(port) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VELTRUVIA Pro — Choose Portal</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--bg:#080d1a;--surface:#0f1729;--border:#1e2d4a;--text:#e2e8f0;--text-muted:#8494b2;--blue:#4a90e2;--blue2:#2563eb;--green:#059669;--green2:#34d399;--purple:#7c3aed;}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;background:var(--bg);color:var(--text);display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;overflow:hidden;-webkit-app-region:drag;user-select:none;}
.drag-bar{position:fixed;top:0;left:0;right:0;height:38px;-webkit-app-region:drag;z-index:10;}
.container{text-align:center;padding:40px;max-width:700px;}
.logo{width:80px;height:80px;border-radius:22px;background:linear-gradient(135deg,var(--blue),var(--blue2));display:inline-flex;align-items:center;justify-content:center;font-size:38px;box-shadow:0 12px 48px rgba(37,99,235,.35);margin-bottom:20px;}
h1{font-size:1.8rem;font-weight:800;letter-spacing:-.5px;margin-bottom:4px;}
.sub{font-size:14px;color:var(--text-muted);margin-bottom:36px;}
.portals{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;}
.portal{-webkit-app-region:no-drag;background:var(--surface);border:1.5px solid var(--border);border-radius:20px;padding:28px 20px;cursor:pointer;transition:all .3s cubic-bezier(.4,0,.2,1);text-align:center;text-decoration:none;color:var(--text);}
.portal:hover{transform:translateY(-6px);box-shadow:0 16px 48px rgba(0,0,0,.3);}
.portal.doctor:hover{border-color:var(--blue);box-shadow:0 16px 48px rgba(37,99,235,.2);}
.portal.patient:hover{border-color:var(--green);box-shadow:0 16px 48px rgba(5,150,105,.2);}
.portal.lab:hover{border-color:var(--purple);box-shadow:0 16px 48px rgba(124,58,234,.2);}
.portal-icon{font-size:40px;margin-bottom:14px;}
.portal-title{font-weight:700;font-size:16px;margin-bottom:4px;}
.portal-sub{font-size:12px;color:var(--text-muted);}
.footer{margin-top:36px;font-size:11px;color:#4a5f82;}
.footer span{color:var(--green2);}
#status{margin-top:20px;font-size:12px;color:var(--text-muted);}
</style>
</head>
<body>
<div class="drag-bar"></div>
<div class="container">
  <div class="logo">🧬</div>
  <h1>VELTRUVIA Pro</h1>
  <div class="sub">Neuro-oncology EMR — Choose your portal</div>
  <div class="portals">
    <a class="portal doctor" href="http://127.0.0.1:${port}/">
      <div class="portal-icon">👨‍⚕️</div>
      <div class="portal-title">Doctor Software</div>
      <div class="portal-sub">EMR & Patient Management</div>
    </a>
    <a class="portal patient" href="http://127.0.0.1:${port}/patient.html">
      <div class="portal-icon">📱</div>
      <div class="portal-title">Patient App</div>
      <div class="portal-sub">Symptom Tracker & Care</div>
    </a>
    <a class="portal lab" href="http://127.0.0.1:${port}/lab.html">
      <div class="portal-icon">🔬</div>
      <div class="portal-title">Lab Portal</div>
      <div class="portal-sub">Test Management</div>
    </a>
  </div>
  <div id="status"></div>
  <div class="footer">🔒 All data stored locally on this device · <span>v2.0</span></div>
</div>
<script>
// Poll the server health to show when API is ready
async function checkAPI(){
  for(let i=0;i<30;i++){
    try{
      const r=await fetch('http://127.0.0.1:${port}/health');
      if(r.ok){document.getElementById('status').textContent='✅ API server ready';document.getElementById('status').style.color='#34d399';return;}
    }catch{}
    await new Promise(r=>setTimeout(r,1000));
  }
  document.getElementById('status').textContent='⚠️ Running in offline mode (localStorage only)';
  document.getElementById('status').style.color='#fbbf24';
}
checkAPI();
</script>
</body>
</html>`;
}

// ── Create the main window ────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    title: 'VELTRUVIA Pro',
    icon: join(ROOT, 'public', 'icons', 'doctor-512.png'),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#080d1a',
    show: false,
    roundedCorners: true,
  });

  // Load the portal-chooser launcher
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getLauncherHTML(serverPort))}`);

  mainWindow.once('ready-to-show', () => { mainWindow.show(); });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  // Native menu with portal shortcuts
  const template = [
    {
      label: 'Portals',
      submenu: [
        { label: '👨‍⚕️  Doctor Software', accelerator: 'CmdOrCtrl+1', click: () => mainWindow?.loadURL(`http://127.0.0.1:${serverPort}/`) },
        { label: '📱  Patient App', accelerator: 'CmdOrCtrl+2', click: () => mainWindow?.loadURL(`http://127.0.0.1:${serverPort}/patient.html`) },
        { label: '🔬  Lab Portal', accelerator: 'CmdOrCtrl+3', click: () => mainWindow?.loadURL(`http://127.0.0.1:${serverPort}/lab.html`) },
        { type: 'separator' },
        { label: '🔄  Reload', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.webContents.reload() },
        { role: 'toggleDevTools', accelerator: 'CmdOrCtrl+Shift+I' },
      ]
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'togglefullscreen' }, { role: 'close' }]
    },
    {
      label: 'Help',
      submenu: [{ label: 'About VELTRUVIA Pro', click: () => shell.openExternal('https://github.com') }]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── IPC handlers ──────────────────────────────────────────────────
ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:getDBPath', () => join(app.getPath('userData'), 'data'));
ipcMain.handle('app:getPlatform', () => process.platform);

// ── App lifecycle ─────────────────────────────────────────────────
app.whenReady().then(async () => {
  try {
    // 1. Find a port
    serverPort = await findFreePort();

    // 2. Start the minimal static file server immediately
    httpServer = createServer(serveStatic);
    await new Promise((resolve, reject) => {
      httpServer.listen(serverPort, '127.0.0.1', resolve);
      httpServer.on('error', reject);
    });
    console.log(`[electron] Static server on port ${serverPort}`);

    // 3. Create the window (shows launcher immediately)
    createWindow();

    // 4. Load Express API in the background (non-blocking)
    //    The launcher polls /health and shows status when ready
    tryLoadExpress(serverPort);

  } catch (err) {
    console.error('[electron] Failed to start:', err);
    dialog.showErrorBox('VELTRUVIA Pro — Startup Error', err.message || String(err));
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (httpServer) httpServer.close();
  app.quit();
});

app.on('before-quit', () => {
  if (httpServer) httpServer.close();
});
