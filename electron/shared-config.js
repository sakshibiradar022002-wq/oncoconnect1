/**
 * Shared Configuration for OncoConnect Desktop Apps
 * 
 * Provides a reliable way for client apps to discover the server URL.
 * Uses a config file in the user's app data directory.
 */

import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { app } from 'electron';

const CONFIG_DIR = join(app.getPath('userData'), 'config');
const CONFIG_FILE = join(CONFIG_DIR, 'server-config.json');

/**
 * Get the path to the shared config file
 */
export function getConfigPath() {
  return CONFIG_FILE;
}

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
    
    // Read existing config or create new
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

/**
 * Clear the server URL from shared config
 */
export function clearServerUrl() {
  try {
    if (!existsSync(CONFIG_DIR)) return;
    
    let config = {};
    if (existsSync(CONFIG_FILE)) {
      try {
        config = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
      } catch {}
    }
    
    delete config.serverUrl;
    config.updatedAt = new Date().toISOString();
    
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log('[shared-config] Cleared server URL');
  } catch (err) {
    console.error('[shared-config] Failed to clear config:', err.message);
  }
}

/**
 * Get all config values
 */
export function getConfig() {
  try {
    if (!existsSync(CONFIG_FILE)) return {};
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}
