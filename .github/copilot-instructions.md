# GXML-Web Copilot Instructions

## Dev Server Management

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
