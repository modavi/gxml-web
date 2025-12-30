# GXML Web Frontend

React-based frontend for the GXML Web Viewer.

## Development

```bash
# Install dependencies
npm install

# Start dev server (with API proxy to backend)
npm run dev
```

The dev server runs on http://localhost:5173 and proxies API requests to the FastAPI backend on port 8000.

**Make sure the backend is running:**
```bash
cd ../src/gxml_web
python -m uvicorn app:app --reload --port 8000
```

## Production Build

```bash
npm run build
```

This outputs the build to `../src/gxml_web/static/dist/`, which the FastAPI backend will serve automatically when it exists.

## Project Structure

```
frontend/
├── src/
│   ├── components/          # React components
│   │   ├── EditorPanel.jsx  # Monaco editor panel
│   │   ├── ViewportPanel.jsx # Three.js viewport
│   │   ├── OptionsPanel.jsx  # View options overlay
│   │   ├── GeometrySpreadsheet.jsx # Data table
│   │   ├── Resizer.jsx      # Drag-to-resize divider
│   │   └── ui/              # Reusable UI components
│   │       ├── ToolbarButton.jsx
│   │       └── Icons.jsx
│   ├── hooks/
│   │   └── useThreeScene.js # Three.js scene management
│   ├── stores/
│   │   ├── appStore.js      # Main app state (editor, API)
│   │   └── viewportStore.js # Viewport state (view mode, etc)
│   ├── styles/
│   │   ├── index.css        # Global styles & CSS variables
│   │   └── App.css          # App layout styles
│   ├── App.jsx              # Root component
│   └── main.jsx             # Entry point
├── index.html
├── package.json
└── vite.config.js
```

## Technologies

- **React 18** - UI framework
- **Vite** - Build tool & dev server
- **Three.js** - 3D rendering
- **Monaco Editor** - Code editor (via @monaco-editor/react)
- **Zustand** - State management
