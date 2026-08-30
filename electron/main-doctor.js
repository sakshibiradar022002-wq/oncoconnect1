/**
 * OncoConnect Doctor — Standalone Electron Desktop App
 *
 * Fully self-contained app with its own local Express server.
 * Goes directly to the login/registration page on launch.
 * Silently connects to shared server if available (backend only).
 */

import { app, BrowserWindow, shell, ipcMain, Menu, dialog } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

// Fix Windows sandbox/GPU crash on Electron 33
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import net from 'node:net';

import { getPortalConfig, getPortalIcon } from './shared-connection.js';
import { installPortalIsolator } from './portal-isolator.js';
import { getServerUrl } from './shared-config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PUBLIC = join(ROOT, 'public');

const PORTAL = 'doctor';
const config = getPortalConfig(PORTAL);

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
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

/**
 * Check if a server is reachable at the given URL
 */
async function isServerReachable(url) {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 2000);
    const r = await fetch(url + '/health', { signal: c.signal, mode: 'cors' });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

// ── Minimal static file server ────────────────────────────────────
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
    const fallback = join(PUBLIC, 'index.html');
    if (existsSync(fallback)) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); createReadStream(fallback).pipe(res); }
    else { res.writeHead(404); res.end('Not Found'); }
    return;
  }
  const ext = join('.', pathname.split('.').pop()).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  createReadStream(filePath).pipe(res);
}

// ── Try loading Express API ───────────────────────────────────────
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
    console.log('[doctor] Express API loaded');
  } catch (err) {
    console.error('[doctor] Express failed:', err.message);
    expressApp = null;
  }
}

// ── Create the window — goes directly to login page ───────────────
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    title: getPortalConfig(PORTAL).title,
    icon: getPortalIcon(PORTAL, PUBLIC),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#080d1a',
    show: false,
  });

  // Install portal isolation BEFORE loading any content
  installPortalIsolator(mainWindow, 'doctor');

  // Go directly to login page — no connection screen
  const serverUrl = `http://127.0.0.1:${serverPort}`;
  console.log(`[doctor] Loading: ${serverUrl}${config.portalPath}`);
  mainWindow.loadURL(`${serverUrl}${config.portalPath}?standalone=1`);

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (e, url) => {
    try {
      const u = new URL(url);
      const blocked = ['/patient.html', '/lab.html', '/admin.html'];
      if (blocked.includes(u.pathname)) {
        e.preventDefault();
        console.log('[doctor] Blocked navigation to', u.pathname);
      }
    } catch(err) {}
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  const template = [
    {
      label: 'OncoConnect Doctor',
      submenu: [
        { label: '🔄  Refresh', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.reload() },
        { type: 'separator' },
        { role: 'toggleDevTools', accelerator: 'CmdOrCtrl+Shift+I' },
      ]
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'togglefullscreen' }, { role: 'close' }]
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── IPC ───────────────────────────────────────────────────────────
ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:getDBPath', () => join(app.getPath('userData'), 'data'));
ipcMain.handle('app:getPlatform', () => process.platform);

// ── App lifecycle ─────────────────────────────────────────────────
app.whenReady().then(async () => {
  try {
    serverPort = await findFreePort();
    httpServer = createServer(serveStatic);
    await new Promise((resolve, reject) => {
      httpServer.listen(serverPort, '127.0.0.1', resolve);
      httpServer.on('error', reject);
    });
    console.log(`[doctor] Local server on port ${serverPort}`);

    await tryLoadExpress(serverPort);
    createWindow();
  } catch (err) {
    dialog.showErrorBox('OncoConnect Doctor — Error', err.message || String(err));
    app.quit();
  }
});

app.on('window-all-closed', () => { if (httpServer) httpServer.close(); app.quit(); });
app.on('before-quit', () => { if (httpServer) httpServer.close(); });
