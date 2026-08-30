/**
 * OncoConnect Patient — Standalone Electron Desktop App
 *
 * Self-contained app that connects to an OncoConnect server.
 * Shows connection screen on first launch, then loads the Patient portal.
 */

import { app, BrowserWindow, shell, ipcMain, Menu, dialog } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import net from 'node:net';

import { getConnectionHTML, getPortalConfig, getPortalIcon } from './shared-connection.js';
import { installPortalIsolator } from './portal-isolator.js';
import { getServerUrl } from './shared-config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PUBLIC = join(ROOT, 'public');

const PORTAL = 'patient';
const config = getPortalConfig(PORTAL);
const STORAGE_KEY = 'oncoconnect_server_url';

// Check for server URL from shared config (written by Server app)
const SERVER_URL_FROM_CONFIG = getServerUrl();

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
  if (pathname === '/') pathname = '/patient.html'; // Default to patient page
  const filePath = join(PUBLIC, pathname);
  if (!filePath.startsWith(PUBLIC)) { res.writeHead(403); res.end('Forbidden'); return; }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    const fallback = join(PUBLIC, 'patient.html');
    if (existsSync(fallback)) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); createReadStream(fallback).pipe(res); }
    else { res.writeHead(404); res.end('Not Found'); }
    return;
  }
  const ext = join('.', pathname.split('.').pop()).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
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
    console.log('[patient] Express API loaded');
  } catch (err) {
    console.error('[patient] Express failed:', err.message);
    expressApp = null;
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 440,
    height: 780,
    minWidth: 360,
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
    backgroundColor: '#071210',
    show: false,
  });  // Install portal isolation BEFORE loading any content
  installPortalIsolator(mainWindow, 'patient');

  // Skip connection screen — go directly to login page
  const serverUrl = SERVER_URL_FROM_CONFIG || 'http://127.0.0.1:3000';
  console.log(`[patient] Connecting to: ${serverUrl}`);
  mainWindow.loadURL(`${serverUrl}${config.portalPath}?standalone=1`);
  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });

  // Block navigation to other portal pages
  mainWindow.webContents.on('will-navigate', (e, url) => {
    try {
      const u = new URL(url);
      const blocked = ['/lab.html', '/', '/admin.html'];
      if (blocked.includes(u.pathname)) { e.preventDefault(); console.log('[patient] Blocked nav to', u.pathname); }
    } catch(err) {}
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  const template = [
    {
      label: 'OncoConnect Patient',
      submenu: [
        { label: '🔄  Refresh', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.reload() },
        { type: 'separator' },
        { role: 'toggleDevTools', accelerator: 'CmdOrCtrl+Shift+I' },
      ]
    },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:getDBPath', () => join(app.getPath('userData'), 'data'));
ipcMain.handle('app:getPlatform', () => process.platform);
ipcMain.handle('app:getServerUrl', () => SERVER_URL_FROM_CONFIG);

app.whenReady().then(async () => {
  try {
    serverPort = await findFreePort();
    httpServer = createServer(serveStatic);
    await new Promise((resolve, reject) => { httpServer.listen(serverPort, '127.0.0.1', resolve); httpServer.on('error', reject); });
    console.log(`[patient] Local server on port ${serverPort}`);
    createWindow();
    tryLoadExpress(serverPort);
  } catch (err) {
    dialog.showErrorBox('OncoConnect Patient — Error', err.message || String(err));
    app.quit();
  }
});

app.on('window-all-closed', () => { if (httpServer) httpServer.close(); app.quit(); });
app.on('before-quit', () => { if (httpServer) httpServer.close(); });
