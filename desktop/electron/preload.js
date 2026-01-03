const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Get the local API URL
    getApiUrl: () => ipcRenderer.invoke('get-api-url'),
    
    // Get platform info
    getPlatform: () => ipcRenderer.invoke('get-platform'),
    
    // File dialogs
    showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
    showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
    
    // Check if running in Electron
    isElectron: true
});
