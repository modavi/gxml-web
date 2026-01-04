const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');

// Configuration
const FRONTEND_DEV_PORTS = [5173, 5174, 5175]; // Try these ports in order
const isDev = process.env.NODE_ENV === 'development';

let mainWindow = null;
let activeFrontendPort = null;

// ============================================================================
// Python Path Detection
// ============================================================================

function getPythonPath() {
    // 1. Check for bundled Python (production)
    const resourcesPath = process.resourcesPath || path.join(__dirname, '..');
    if (process.platform === 'win32') {
        const bundledPython = path.join(resourcesPath, 'python-env', 'python.exe');
        if (fs.existsSync(bundledPython)) return bundledPython;
    } else {
        const bundledPython = path.join(resourcesPath, 'python-env', 'bin', 'python3');
        if (fs.existsSync(bundledPython)) return bundledPython;
    }
    
    // 2. Check for local venv (dev)
    const venvPaths = [
        path.join(__dirname, '..', '..', 'venv'),  // gxml-web/venv
        path.join(__dirname, '..', '..', '.venv'), // gxml-web/.venv
    ];
    
    for (const venvPath of venvPaths) {
        const pythonExe = process.platform === 'win32'
            ? path.join(venvPath, 'Scripts', 'python.exe')
            : path.join(venvPath, 'bin', 'python3');
        if (fs.existsSync(pythonExe)) return pythonExe;
    }
    
    // 3. Fallback to system Python
    return process.platform === 'win32' ? 'python' : 'python3';
}

function getCliScriptPath() {
    // Check for bundled script (in asar or resources)
    const resourcesPath = process.resourcesPath || path.join(__dirname, '..');
    const bundledScript = path.join(resourcesPath, 'python', 'gxml_server.py');
    if (fs.existsSync(bundledScript)) return bundledScript;
    
    // Dev mode: use local script
    return path.join(__dirname, '..', 'python', 'gxml_server.py');
}

function getPythonEnv() {
    const env = { ...process.env };
    
    // Add source paths to PYTHONPATH
    const paths = [];
    
    // gxml-web source
    const gxmlWebSrc = path.join(__dirname, '..', '..', 'src');
    if (fs.existsSync(gxmlWebSrc)) paths.push(gxmlWebSrc);
    
    // gxml source (sibling folder)
    const gxmlSrc = path.join(__dirname, '..', '..', '..', 'gxml', 'src');
    if (fs.existsSync(gxmlSrc)) paths.push(gxmlSrc);
    
    if (paths.length > 0) {
        const sep = process.platform === 'win32' ? ';' : ':';
        env.PYTHONPATH = paths.join(sep) + (env.PYTHONPATH ? sep + env.PYTHONPATH : '');
    }
    
    return env;
}

// ============================================================================
// Dev Server Port Detection
// ============================================================================

function checkPort(port) {
    return new Promise((resolve) => {
        const req = http.request({
            hostname: 'localhost',
            port: port,
            path: '/',
            method: 'GET',
            timeout: 1000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                // Look for Vite-specific markers in response
                const isVite = data.includes('@vite') || data.includes('vite') || 
                              data.includes('GXML') || data.includes('gxml');
                resolve(isVite);
            });
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });
        req.end();
    });
}

async function findDevServerPort() {
    // Check if port is explicitly set via environment variable
    if (process.env.VITE_DEV_PORT) {
        const envPort = parseInt(process.env.VITE_DEV_PORT, 10);
        console.log(`Using VITE_DEV_PORT from environment: ${envPort}`);
        return envPort;
    }
    
    // Check ports in order (prefer higher ports as Vite tries 5173 first then moves up)
    for (const port of FRONTEND_DEV_PORTS) {
        console.log(`Checking port ${port}...`);
        const isViteServer = await checkPort(port);
        if (isViteServer) {
            console.log(`Found Vite dev server on port ${port}`);
            return port;
        }
    }
    throw new Error(`No Vite dev server found on ports: ${FRONTEND_DEV_PORTS.join(', ')}`);
}

// ============================================================================
// Persistent Python Subprocess
// ============================================================================

let pythonProcess = null;
let pythonReady = false;
let pendingRequests = [];
let currentRequest = null;

// Efficient buffer accumulation - avoid O(n²) concat
let responseChunks = [];
let responseLength = 0;

// Backend info from Python server
let pythonBackendInfo = {
    currentBackend: 'cpu',
    availableBackends: { cpu: true, c: false, gpu: false }
};

function startPythonServer() {
    if (pythonProcess) return;
    
    const pythonPath = getPythonPath();
    const scriptPath = getCliScriptPath();
    const env = getPythonEnv();
    
    console.log(`Starting persistent Python server: ${pythonPath}`);
    console.log(`Script: ${scriptPath}`);
    
    pythonProcess = spawn(pythonPath, [scriptPath], {
        env,
        stdio: ['pipe', 'pipe', 'pipe']
    });
    
    pythonProcess.stderr.on('data', (data) => {
        const text = data.toString();
        if (text.includes('GXML_SERVER_READY')) {
            console.log('Python server ready');
            pythonReady = true;
            
            // Parse backend info from startup message
            // Format: "GXML_SERVER_READY backend=cpu c=True gpu=False"
            const backendMatch = text.match(/backend=(\w+)/);
            const cMatch = text.match(/c=(True|False)/);
            const gpuMatch = text.match(/gpu=(True|False)/);
            
            if (backendMatch) pythonBackendInfo.currentBackend = backendMatch[1];
            if (cMatch) pythonBackendInfo.availableBackends.c = cMatch[1] === 'True';
            if (gpuMatch) pythonBackendInfo.availableBackends.gpu = gpuMatch[1] === 'True';
            
            console.log('Backend info:', pythonBackendInfo);
            
            // Process any queued requests
            processNextRequest();
        } else {
            console.log('Python stderr:', text);
        }
    });
    
    pythonProcess.stdout.on('data', (data) => {
        handlePythonResponse(data);
    });
    
    pythonProcess.on('close', (code) => {
        console.log(`Python server exited with code ${code}`);
        pythonProcess = null;
        pythonReady = false;
        
        // Reject current request if any
        if (currentRequest) {
            currentRequest.reject(new Error('Python server crashed'));
            currentRequest = null;
        }
        
        // Restart the server
        setTimeout(startPythonServer, 100);
    });
    
    pythonProcess.on('error', (err) => {
        console.error('Python server error:', err);
        if (currentRequest) {
            currentRequest.reject(err);
            currentRequest = null;
        }
    });
}

function handlePythonResponse(data) {
    // Accumulate chunks efficiently (avoid O(n²) from repeated Buffer.concat)
    responseChunks.push(data);
    responseLength += data.length;
    
    // Need at least 4 bytes for length prefix
    if (responseLength < 4) return;
    
    // Combine chunks only when we need to read
    let responseBuffer = Buffer.concat(responseChunks);
    responseChunks = [];
    responseLength = 0;
    
    // Try to parse complete responses
    while (responseBuffer.length >= 4) {
        // Read length prefix
        const totalLength = responseBuffer.readUInt32LE(0);
        
        if (responseBuffer.length < 4 + totalLength) {
            // Not enough data yet - store remainder back
            responseChunks.push(responseBuffer);
            responseLength = responseBuffer.length;
            break;
        }
        
        // Extract the complete response
        const responseData = responseBuffer.slice(4, 4 + totalLength);
        responseBuffer = responseBuffer.slice(4 + totalLength);
        
        // Parse the response (JSON timing line + binary data)
        const newlineIndex = responseData.indexOf(0x0A); // \n
        if (newlineIndex === -1) {
            if (currentRequest) {
                currentRequest.reject(new Error('Invalid response format'));
                currentRequest = null;
            }
            continue;
        }
        
        const timingJson = responseData.slice(0, newlineIndex).toString('utf-8');
        const binaryData = responseData.slice(newlineIndex + 1);
        
        let timings;
        try {
            timings = JSON.parse(timingJson);
        } catch (e) {
            if (currentRequest) {
                currentRequest.reject(new Error('Failed to parse timing JSON'));
                currentRequest = null;
            }
            continue;
        }
        
        // Check for error response
        if (timings.error) {
            if (currentRequest) {
                currentRequest.reject(new Error(timings.error));
                currentRequest = null;
            }
            processNextRequest();
            continue;
        }
        
        // Success!
        if (currentRequest) {
            const duration = Date.now() - currentRequest.startTime;
            console.log(`GXML processed in ${duration}ms (server: ${timings.total?.toFixed(1)}ms)`);
            
            currentRequest.resolve({
                buffer: binaryData,
                duration,
                byteLength: binaryData.length,
                serverTimings: timings
            });
            currentRequest = null;
        }
        
        // Process next request in queue
        processNextRequest();
    }
}

function processNextRequest() {
    if (currentRequest || pendingRequests.length === 0 || !pythonReady) {
        return;
    }
    
    currentRequest = pendingRequests.shift();
    
    // Send length-prefixed XML
    const xmlBuffer = Buffer.from(currentRequest.xml, 'utf-8');
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32LE(xmlBuffer.length, 0);
    
    pythonProcess.stdin.write(lengthBuffer);
    pythonProcess.stdin.write(xmlBuffer);
}

async function processGxml(xmlContent) {
    return new Promise((resolve, reject) => {
        const request = {
            xml: xmlContent,
            resolve,
            reject,
            startTime: Date.now()
        };
        
        pendingRequests.push(request);
        
        // Start server if not running
        if (!pythonProcess) {
            startPythonServer();
        } else {
            processNextRequest();
        }
    });
}

async function sendPythonCommand(command) {
    return new Promise((resolve, reject) => {
        const request = {
            xml: JSON.stringify(command),
            resolve: (result) => {
                // For commands, the result comes back as JSON in serverTimings
                resolve(result.serverTimings || result);
            },
            reject,
            startTime: Date.now(),
            isCommand: true
        };
        
        pendingRequests.push(request);
        
        // Start server if not running
        if (!pythonProcess) {
            startPythonServer();
        } else {
            processNextRequest();
        }
    });
}

// ============================================================================
// Window Management
// ============================================================================

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false  // Need this for IPC with binary data
        },
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        show: false
    });
    
    // Load the frontend
    if (isDev) {
        // Find which port Vite is running on
        findDevServerPort().then(port => {
            activeFrontendPort = port;
            console.log(`Loading dev frontend from port ${port}`);
            mainWindow.loadURL(`http://localhost:${port}`);
            mainWindow.webContents.openDevTools();
        }).catch(err => {
            console.error('Failed to find dev server:', err);
            console.log('Make sure Vite is running: cd frontend && npm run dev');
        });
    } else {
        mainWindow.loadFile(path.join(__dirname, '..', 'frontend-dist', 'index.html'));
    }
    
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });
    
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ============================================================================
// IPC Handlers
// ============================================================================

// Main handler: process GXML and return binary geometry
ipcMain.handle('process-gxml', async (event, xmlContent) => {
    try {
        const result = await processGxml(xmlContent);
        // Return Uint8Array - Electron's structured clone handles this efficiently
        // The buffer from Python is already a Node Buffer, convert once
        return {
            success: true,
            buffer: new Uint8Array(result.buffer),
            duration: result.duration,
            byteLength: result.byteLength,
            serverTimings: result.serverTimings
        };
    } catch (err) {
        return {
            success: false,
            error: err.message
        };
    }
});

ipcMain.handle('get-platform', () => {
    return process.platform;
});

ipcMain.handle('is-electron', () => {
    return true;
});

// Backend management
ipcMain.handle('get-backend-info', async () => {
    if (pythonReady) {
        try {
            const result = await sendPythonCommand({ command: 'get_backend_info' });
            if (result.success) {
                pythonBackendInfo.currentBackend = result.current_backend;
                pythonBackendInfo.availableBackends = result.available_backends;
            }
        } catch (err) {
            console.error('Error getting backend info:', err);
        }
    }
    return pythonBackendInfo;
});

ipcMain.handle('set-backend', async (event, backend) => {
    try {
        const result = await sendPythonCommand({ command: 'set_backend', backend });
        if (result.success) {
            pythonBackendInfo.currentBackend = result.backend;
            console.log(`Backend changed to: ${result.backend}`);
        }
        return result;
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('get-schema', async () => {
    // Return null - schema validation is optional in Electron mode
    // Could load from bundled XSD file if needed in the future
    return null;
});

ipcMain.handle('show-open-dialog', async (event, options) => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: 'GXML Files', extensions: ['gxml', 'xml'] },
            { name: 'All Files', extensions: ['*'] }
        ],
        ...options
    });
    return result;
});

ipcMain.handle('show-save-dialog', async (event, options) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        filters: [
            { name: 'GXML Files', extensions: ['gxml', 'xml'] },
            { name: 'All Files', extensions: ['*'] }
        ],
        ...options
    });
    return result;
});

ipcMain.handle('read-file', async (event, filePath) => {
    try {
        const content = await fs.promises.readFile(filePath, 'utf8');
        return { success: true, content };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('write-file', async (event, filePath, content) => {
    try {
        await fs.promises.writeFile(filePath, content, 'utf8');
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// ============================================================================
// App Lifecycle
// ============================================================================

function shutdownPythonServer() {
    if (pythonProcess) {
        console.log('Shutting down Python server...');
        pythonProcess.stdin.end();
        pythonProcess.kill();
        pythonProcess = null;
        pythonReady = false;
    }
}

app.whenReady().then(async () => {
    console.log('GXML Desktop starting...');
    console.log(`Mode: ${isDev ? 'development' : 'production'}`);
    console.log(`Platform: ${process.platform}`);
    console.log(`Python: ${getPythonPath()}`);
    console.log(`Server Script: ${getCliScriptPath()}`);
    
    // Start Python server immediately
    startPythonServer();
    
    createWindow();
    
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    shutdownPythonServer();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    shutdownPythonServer();
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
});
