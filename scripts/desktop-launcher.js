#!/usr/bin/env node
/**
 * VELTRUVIA Desktop Launcher
 * Creates a proper desktop experience by running the server
 * and opening the app in a dedicated browser window.
 */
import { exec } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const portal = process.argv[2] || 'doctor';
const PORT = 3000;

const config = {
  doctor: { path: '/', title: 'VELTRUVIA Doctor' },
  patient: { path: '/patient.html', title: 'VELTRUVIA Patient' },
  lab: { path: '/lab.html', title: 'VELTRUVIA Lab' },
  server: { path: '/', title: 'VELTRUVIA Server' },
};

const c = config[portal] || config.doctor;

console.log(`Starting ${c.title}...`);

// Start the server
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'production';
process.env.DB_PATH = join(ROOT, 'data', 'veltruvia.db');

const { mkdirSync: md } = await import('node:fs');
try { md(join(ROOT, 'data'), { recursive: true }); } catch {}

const mod = await import(join(ROOT, 'src', 'app.js'));
const app = mod.app;

import('node:http').then(({ createServer }) => {
  const server = createServer(app);
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`${c.title} running at http://127.0.0.1:${PORT}${c.path}`);
    // Open in default browser
    const url = `http://127.0.0.1:${PORT}${c.path}?standalone=1`;
    if (process.platform === 'win32') {
      exec(`start "" "${url}"`);
    } else if (process.platform === 'darwin') {
      exec(`open "${url}"`);
    } else {
      exec(`xdg-open "${url}"`);
    }
    console.log('Press Ctrl+C to stop.');
  });
});
