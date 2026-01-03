const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const treeKill = require('tree-kill');

// Configuration
const PYTHON_PORT = 8765;
const FRONTEND_DEV_PORT = 5173;
const isDev = process.env.NODE_ENV === 'development';

let mainWindow = null;
let pythonProcess = null;

// ============================================================================
// Python Server Management
// ============================================================================

function getPythonPath() {
    if (isDev) {
        // In dev mode, use the gxml-web venv which has all dependencies
        const venvPath = path.join(__dirname, '..', '..', 'gxml-web', 'venv');
        if (process.platform === 'win32') {
            return path.join(venvPath, 'Scripts', 'python.exe');
        }
        return path.join(venvPath, 'bin', 'python3');
    }
    
    // In production, use bundled Python
    const resourcesPath = process.resourcesPath;
    if (process.platform === 'darwin') {
        return path.join(resourcesPath, 'python-env', 'bin', 'python3');
    } else if (process.platform === 'win32') {
        return path.join(resourcesPath, 'python-env', 'python.exe');
    }
    return 'python3';
}

function getGxmlWebPath() {
    if (isDev) {
        // In dev mode, point to the local gxml-web source
        return path.join(__dirname, '..', '..', 'gxml-web', 'src');
    }
    // In production, it's bundled in python-env
    return null;
}

async function startPythonServer() {
    return new Promise((resolve, reject) => {
        const pythonPath = getPythonPath();
        const gxmlWebPath = getGxmlWebPath();
        
        console.log(`Starting Python server with: ${pythonPath}`);
        console.log(`GXML-Web path: ${gxmlWebPath || 'bundled'}`);
        
        const env = { ...process.env };
        if (gxmlWebPath) {
            // Add gxml-web to Python path in dev mode
            env.PYTHONPATH = gxmlWebPath + (env.PYTHONPATH ? path.delimiter + env.PYTHONPATH : '');
        }
        
        // Also add gxml to Python path in dev mode
        if (isDev) {
            const gxmlPath = path.join(__dirname, '..', '..', 'gxml', 'src');
            env.PYTHONPATH = gxmlPath + path.delimiter + env.PYTHONPATH;
        }
        
        pythonProcess = spawn(pythonPath, [
            '-m', 'uvicorn',
            'gxml_web.app:app',
            '--host', '127.0.0.1',
            '--port', String(PYTHON_PORT),
            '--log-level', 'info'
        ], {
            env,
            stdio: ['ignore', 'pipe', 'pipe']
        });
        
        pythonProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(`[Python] ${output}`);
            
            // Detect when server is ready
            if (output.includes('Uvicorn running') || output.includes('Application startup complete')) {
                resolve();
            }
        });
        
        pythonProcess.stderr.on('data', (data) => {
            const output = data.toString();
            console.error(`[Python Error] ${output}`);
            
            // Uvicorn logs startup to stderr
            if (output.includes('Uvicorn running') || output.includes('Application startup complete')) {
                resolve();
            }
        });
        
        pythonProcess.on('error', (err) => {
            console.error('Failed to start Python server:', err);
            reject(err);
        });
        
        pythonProcess.on('exit', (code) => {
            console.log(`Python server exited with code ${code}`);
            pythonProcess = null;
        });
        
        // Timeout if server doesn't start
        setTimeout(() => {
            reject(new Error('Python server startup timeout'));
        }, 30000);
    });
}

async function waitForServer(maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            await new Promise((resolve, reject) => {
                const req = http.get(`http://127.0.0.1:${PYTHON_PORT}/health`, (res) => {
                    resolve(res.statusCode === 200);
                });
                req.on('error', reject);
                req.setTimeout(1000, () => {
                    req.destroy();
                    reject(new Error('timeout'));
                });
            });
            console.log('Python server is ready!');
            return true;
        } catch (e) {
            console.log(`Waiting for Python server... (attempt ${i + 1}/${maxAttempts})`);
            await new Promise(r => setTimeout(r, 500));
        }
    }
    return false;
}

function stopPythonServer() {
    if (pythonProcess) {
        console.log('Stopping Python server...');
        treeKill(pythonProcess.pid, 'SIGTERM', (err) => {
            if (err) {
                console.error('Error killing Python process:', err);
                // Force kill if graceful shutdown fails
                treeKill(pythonProcess.pid, 'SIGKILL');
            }
        });
        pythonProcess = null;
    }
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
            sandbox: true
        },
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        show: false // Show when ready
    });
    
    // Load the frontend
    if (isDev) {
        // In dev mode, load from Vite dev server
        mainWindow.loadURL(`http://localhost:${FRONTEND_DEV_PORT}`);
        mainWindow.webContents.openDevTools();
    } else {
        // In production, load the built frontend
        mainWindow.loadFile(path.join(__dirname, '..', 'frontend-dist', 'index.html'));
    }
    
    // Inject the API URL into the page
    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.executeJavaScript(`
            window.GXML_API_URL = 'http://127.0.0.1:${PYTHON_PORT}';
            console.log('GXML Desktop: API URL set to', window.GXML_API_URL);
        `);
    });
    
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

ipcMain.handle('get-api-url', () => {
    return `http://127.0.0.1:${PYTHON_PORT}`;
});

ipcMain.handle('get-platform', () => {
    return process.platform;
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

// ============================================================================
// App Lifecycle
// ============================================================================

app.whenReady().then(async () => {
    console.log('GXML Desktop starting...');
    console.log(`Mode: ${isDev ? 'development' : 'production'}`);
    console.log(`Platform: ${process.platform}`);
    
    try {
        // Start Python server
        await startPythonServer();
        
        // Wait for server to be ready
        const serverReady = await waitForServer();
        if (!serverReady) {
            throw new Error('Python server failed to start');
        }
        
        // Create window
        createWindow();
        
    } catch (err) {
        console.error('Startup error:', err);
        dialog.showErrorBox('Startup Error', 
            `Failed to start GXML Desktop:\n\n${err.message}\n\nMake sure Python and gxml-web are installed.`
        );
        app.quit();
    }
    
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    stopPythonServer();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    stopPythonServer();
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    stopPythonServer();
});
