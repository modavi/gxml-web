# GXML Desktop

Native desktop application for GXML - the geometric XML layout editor.

## Development

### Prerequisites

1. **Node.js 18+** - For Electron
2. **Python 3.10+** - For the backend server
3. **gxml** and **gxml-web** packages installed

### Quick Start

```bash
# Install dependencies
npm install

# Make sure gxml and gxml-web are installed
cd ../gxml && pip install -e .
cd ../gxml-web && pip install -e .

# Start in development mode
npm run dev
```

This will:
1. Start the Python backend on `localhost:8765`
2. Open Electron pointing to the Vite dev server at `localhost:5173`

### Development Workflow

Run the frontend dev server separately for hot reload:

```bash
# Terminal 1: Frontend dev server
cd ../gxml-web/frontend && npm run dev

# Terminal 2: Electron
npm run dev
```

### Building for Production

```bash
# Build for macOS
npm run build:mac

# Build for Windows
npm run build:win
```

## Architecture

```
┌──────────────────────────────────────────────┐
│             Electron Main Process            │
│  ┌────────────────┐  ┌────────────────────┐  │
│  │  Python Server │  │  Window Management │  │
│  │  (uvicorn)     │  │  (BrowserWindow)   │  │
│  └───────┬────────┘  └─────────┬──────────┘  │
│          │                     │             │
│          │   localhost:8765    │             │
│          │◄────────────────────┤             │
│          │                     │             │
└──────────┼─────────────────────┼─────────────┘
           │                     │
           ▼                     ▼
┌──────────────────────────────────────────────┐
│          Renderer Process (Chromium)         │
│  ┌────────────────────────────────────────┐  │
│  │  React Frontend (Three.js, Monaco)     │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

## Files

- `electron/main.js` - Main process, manages Python server and windows
- `electron/preload.js` - Secure bridge between main and renderer
- `frontend-dist/` - Built React app (created by `npm run build:frontend`)
- `resources/` - Icons and bundled Python environment (for distribution)
