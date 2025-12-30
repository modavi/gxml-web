# GXML Web Viewer

A simple web application for visualizing GXML layouts in 3D.

## Features

- Interactive 3D viewport using Three.js
- XML editor with syntax highlighting (CodeMirror)
- Real-time GXML rendering
- Orbit controls for camera (rotate, pan, zoom)
- Wireframe toggle

## Project Structure

```
gxml-web/
├── README.md
├── LICENSE
├── pyproject.toml
└── src/
    └── gxml_web/
        ├── __init__.py
        ├── app.py                 # FastAPI backend
        ├── json_render_engine.py  # JSON geometry output
        └── static/
            ├── index.html         # Main page
            ├── style.css          # Styles
            └── main.js            # Three.js + editor
```

## Installation

```bash
cd gxml-web

# Create virtual environment (optional but recommended)
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac

# Install dependencies
pip install -e "."
```

## Running the App

```bash
python -m gxml_web.app
```

Then open http://localhost:8000 in your browser.

## Usage

1. Enter your GXML in the editor on the left
2. Click "Render" or press Ctrl+Enter to render
3. Use mouse to orbit/zoom the 3D view:
   - Left-click drag: Rotate
   - Right-click drag: Pan
   - Scroll: Zoom
4. Toggle wireframe mode with the checkbox
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

- **FastAPI** - Web framework for the API
- **Uvicorn** - ASGI server
- **Three.js** - 3D rendering (loaded from CDN)
- **CodeMirror** - XML editor (loaded from CDN)
- **gxml** - Uses sibling gxml project for geometry generation
