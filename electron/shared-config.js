/**
 * Shared Configuration for VELTRUVIA Desktop Apps
 * 
 * Minimal backend-only mechanism for client apps to discover the server URL.
 * No UI — connection happens silently in the background.
 */

import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { app } from 'electron';

const CONFIG_DIR = join(app.getPath('userData'), 'config');
const CONFIG_FILE = join(CONFIG_DIR, 'server-config.json');

/**
 * Get the server URL from shared config
 * @returns {string|null} The server URL or null if not found
 */
export function getServerUrl() {
  try {
    if (!existsSync(CONFIG_FILE)) return null;
    const data = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
    return data.serverUrl || null;
  } catch (err) {
    console.error('[shared-config] Failed to read config:', err.message);
    return null;
  }
}

/**
 * Save the server URL to shared config
 * @param {string} url - The server URL to save
 */
export function saveServerUrl(url) {
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
    
    let config = {};
    if (existsSync(CONFIG_FILE)) {
      try {
        config = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
      } catch {}
    }
    
    config.serverUrl = url;
    config.updatedAt = new Date().toISOString();
    
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log(`[shared-config] Saved server URL: ${url}`);
  } catch (err) {
    console.error('[shared-config] Failed to save config:', err.message);
  }
}
