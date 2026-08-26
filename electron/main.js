// OncoConnect Desktop — Electron main process
// Starts the Express server locally and opens a BrowserWindow.

import { app, BrowserWindow, shell, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

let mainWindow = null;
let serverProcess = null;
let serverPort = 0;

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

// ── Start the Express server as a child process ───────────────────
async function startServer() {
  serverPort = await findFreePort();

  serverProcess = spawn(process.execPath, [join(ROOT, 'src', 'server.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(serverPort),
      NODE_ENV: 'production',
      ELECTRON_RUN: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout.on('data', (d) => console.log('[server]', d.toString().trim()));
  serverProcess.stderr.on('data', (d) => console.error('[server]', d.toString().trim()));

  // Wait for the server to be accepting connections
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server start timed out')), 15000);
    const check = () => {
      const sock = net.createConnection({ port: serverPort, host: '127.0.0.1' });
      sock.on('connect', () => { clearTimeout(timeout); sock.destroy(); resolve(); });
      sock.on('error', () => { setTimeout(check, 300); });
    };
    check();
  });
}

// ── Create the main window ────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'OncoConnect Pro',
    icon: join(ROOT, 'public', 'icons', 'doctor-192.png'),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    titleBarStyle: 'hiddenInset', // macOS frameless with traffic lights
    backgroundColor: '#0d1117',
  });

  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`);

  // Open external links in the system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── IPC handlers (called from preload.js) ─────────────────────────
ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:getDBPath', () => join(app.getPath('userData'), 'data'));
ipcMain.handle('app:getPlatform', () => process.platform);

// ── App lifecycle ─────────────────────────────────────────────────
app.whenReady().then(async () => {
  try {
    console.log('[electron] Starting OncoConnect server...');
    await startServer();
    console.log(`[electron] Server running on port ${serverPort}`);
    createWindow();
  } catch (err) {
    console.error('[electron] Failed to start:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  app.quit();
});

app.on('before-quit', () => {
  if (serverProcess) serverProcess.kill();
});
