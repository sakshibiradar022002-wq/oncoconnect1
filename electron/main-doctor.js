/**
 * VELTRUVIA Doctor — Standalone Desktop App
 * 
 * Fully self-contained. Runs its own local Express API + SQLite database.
 * Linked to Patient and Lab apps via blockchain.
 * NO server app needed — just open and use.
 */

import { app, BrowserWindow, shell, ipcMain, Menu, dialog } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, extname } from 'node:path';

// Windows compatibility fixes
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync, mkdirSync } from 'node:fs';
import net from 'node:net';
import blockchain from './blockchain.js';

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

  // Static files
  if (pathname === '/') pathname = '/index.html';
  const filePath = join(PUBLIC, pathname);
  if (!filePath.startsWith(PUBLIC)) { res.writeHead(403); res.end('Forbidden'); return; }
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

async function tryLoadExpress(port) {
  try {
    process.env.PORT = String(port);
    if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development';
    process.env.ELECTRON_RUN = '1';
    const { app: electronApp } = await import('electron');
    const userData = electronApp.getPath('userData');
    const dataDir = join(userData, 'data');
    try { mkdirSync(dataDir, { recursive: true }); } catch {}
    process.env.DB_PATH = join(dataDir, 'veltruvia.db');
    await import('dotenv/config').catch(() => {});
    const mod = await import(pathToFileURL(join(ROOT, 'src', 'app.js')).href);
    expressApp = mod.app;
    console.log('[doctor] ✅ Express API loaded');
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
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    backgroundColor: '#080d1a',
    show: false,
  });

  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/?standalone=1`);
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
ipcMain.handle('blockchain:stats', () => blockchain.getStats());
ipcMain.handle('blockchain:verify', () => blockchain.verify());
ipcMain.handle('blockchain:records', (_, mrn) => blockchain.getPatientRecords(mrn));

// App lifecycle
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
