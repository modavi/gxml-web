# GXML Web Viewer

A web-based 3D viewer and XML editor for GXML - geometric XML layout.

![React](https://img.shields.io/badge/React-18-blue) ![Three.js](https://img.shields.io/badge/Three.js-0.160-green) ![FastAPI](https://img.shields.io/badge/FastAPI-0.104-teal)

## Features

- **Monaco Editor** - Full-featured XML editor with GXML autocomplete from XSD schema
- **3D Viewport** - Real-time Three.js rendering with multiple view modes
- **Face/Vertex Picking** - Interactive geometry selection with labels
- **Geometry Spreadsheet** - Tabular view of points and faces
- **Auto-update** - Optional live preview as you type

## Quick Start

### Development Mode

1. **Start the backend:**
   ```bash
   cd src/gxml_web
   python -m uvicorn app:app --reload --port 8000
   ```

2. **Start the frontend dev server:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. Open http://localhost:5173

### Production Mode

1. **Build the frontend:**
   ```bash
   cd frontend
   npm run build
   ```

2. **Run the backend:**
   ```bash
   cd src/gxml_web
   python -m uvicorn app:app --port 8000
   ```

3. Open http://localhost:8000

## Project Structure

```
gxml-web/
├── frontend/               # React frontend (Vite)
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── hooks/          # Custom hooks (Three.js)
│   │   ├── stores/         # Zustand state stores
│   │   └── styles/         # CSS files
│   └── package.json
├── src/
│   └── gxml_web/           # FastAPI backend
│       ├── app.py
│       ├── json_render_engine.py
│       └── static/         # Built frontend output
└── pyproject.toml
```

## View Modes

- **Lit** - Phong shading with lighting
- **Unlit** - Flat colors without shading
- **Wireframe** - Edges only
- **X-ray** - Transparent with depth

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+Enter` | Render GXML |
| `F` | Reset camera view |

## Usage

1. Enter your GXML in the editor on the left
2. Click "Render" or press Ctrl+Enter to render
3. Use mouse to orbit/zoom the 3D view:
   - Left-click drag: Rotate
   - Right-click drag: Pan
   - Scroll: Zoom
4. Use the options panel (gear icon) to change view settings
5. Click "Reset View" to return to default camera position

## Example GXML

```xml
<Root width="800" height="600">
    <Panel width="200" height="400" thickness="20" />
    <Panel width="300" height="300" thickness="20" />
    <Panel width="150" height="350" thickness="20" />
</Root>
```

## Dependencies

### Frontend
- **React 18** - UI framework
- **Vite** - Build tool & dev server
- **Three.js** - 3D rendering
- **Monaco Editor** - Code editor
- **Zustand** - State management

### Backend
- **FastAPI** - Web framework for the API
- **Uvicorn** - ASGI server
- **gxml** - Sibling project for geometry generation
