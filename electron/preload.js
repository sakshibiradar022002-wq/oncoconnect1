// OncoConnect Desktop — preload script
// Exposes safe APIs to the renderer process via contextBridge.

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('app', {
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getDBPath: () => ipcRenderer.invoke('app:getDBPath'),
  getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
  isElectron: true,
});
