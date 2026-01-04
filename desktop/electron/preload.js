const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Process GXML and get binary geometry directly (no server!)
    processGxml: (xmlContent) => ipcRenderer.invoke('process-gxml', xmlContent),
    
    // Get platform info
    getPlatform: () => ipcRenderer.invoke('get-platform'),
    
    // Check if running in Electron (boolean property, not function)
    isElectron: true,
    
    // API URL - not used in direct mode but kept for compatibility
    getApiUrl: () => Promise.resolve(null),
    
    // Get GXML schema - returns null in Electron mode (schema loaded differently)
    getSchema: () => ipcRenderer.invoke('get-schema'),
    
    // Backend management
    getBackendInfo: () => ipcRenderer.invoke('get-backend-info'),
    setBackend: (backend) => ipcRenderer.invoke('set-backend', backend),
    
    // File dialogs
    showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
    showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
    
    // File I/O
    readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
    writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
});
