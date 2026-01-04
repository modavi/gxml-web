# GXML-Web Copilot Instructions

## ⚠️ CRITICAL: Use Dev Mode During Development

**NEVER rebuild the Electron app for every code change!** Use dev mode instead:

### Starting Development Environment (Windows)

```powershell
# RECOMMENDED: Use the dev script (handles everything)
cd e:\Development\LocalProjects\gxml\gxml-web\desktop
.\dev.ps1
```

The dev script automatically:
1. Kills any existing GXML and Vite processes on ports 5173/5174
2. Starts the Vite dev server for frontend hot reload
3. Waits for Vite to be ready
4. Starts Electron in dev mode pointing to the correct Vite port

### What Dev Mode Provides:
- **Frontend hot reload**: Edit React/JS/CSS files → changes appear instantly (Vite HMR)
- **Python live changes**: The Python server uses source files directly (restart Electron for Python changes)
- **DevTools open**: Electron opens with DevTools for debugging
- **C Extension available**: Uses the dev machine's compiled C extension

### Checking Changes
- **Frontend (JS/JSX/CSS)**: Save file → changes appear instantly via hot reload
- **Python (gxml, gxml_server.py)**: Restart Electron (Ctrl+C, run `.\dev.ps1` again)
- **Electron main process**: Restart Electron

### When to Rebuild (Production Build)
Only rebuild the Electron app when:
- Testing the production build specifically
- Creating a release
- Testing bundled Python environment

```powershell
# Production build (ONLY when needed)
cd e:\Development\LocalProjects\gxml\gxml-web\desktop
npx electron-builder --win
```

### Troubleshooting Dev Mode
If dev mode isn't working:
```powershell
# Manually kill all related processes
Get-Process -Name "GXML","node" -ErrorAction SilentlyContinue | Stop-Process -Force

# Then run dev script again
.\dev.ps1
```

---

## Dev Server Management (macOS/Linux)

To start or restart the dev servers, run:
```bash
cd /Users/morgan/Projects/gxml-web && ./dev.sh
```

This script will:
- Kill any existing vite and uvicorn processes
- Start the backend (uvicorn) on port 8000
- Start the frontend (vite) on port 5173
- Run both in a tmux session called `gxml-dev`

To view logs: `tmux attach -t gxml-dev`
To stop: `tmux kill-session -t gxml-dev`

---

## Project Overview

GXML-Web is a web interface for GXML (the geometric XML layout library). It consists of:
- **Backend**: FastAPI server (`src/gxml_web/`) that wraps the GXML library
- **Frontend**: React + Three.js app (`frontend/`) for visualization and editing

The frontend uses:
- **Monaco Editor** for XML editing
- **Three.js** for 3D viewport rendering
- **AG Grid** for geometry data spreadsheet
- **Zustand** for state management

---

## Project Structure

```
gxml-web/
├── dev.sh              # Start dev servers (use this!)
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/     # React components
│   │   ├── hooks/          # Custom hooks (useThreeScene, etc.)
│   │   │   └── three/      # Three.js modules (PreviewBrush, etc.)
│   │   ├── stores/         # Zustand stores
│   │   └── styles/         # CSS files
│   └── vite.config.js
└── src/
    └── gxml_web/
        ├── app.py              # FastAPI app
        └── json_render_engine.py
```

---

## Code Conventions

- Heavy dependencies (Monaco, AG Grid, Three.js) are pre-bundled via Vite's `optimizeDeps`
- Three.js visualization logic is modularized in `hooks/three/`
- State is managed via Zustand stores (`appStore.js`, `viewportStore.js`)
