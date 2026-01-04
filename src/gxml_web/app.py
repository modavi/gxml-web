"""FastAPI backend for GXML Web Viewer."""

import sys
import time
from pathlib import Path

# Add gxml submodule to path
GXML_SRC = Path(__file__).parent.parent.parent / "gxml" / "src"
GXML_PKG = GXML_SRC / "gxml"

for p in [GXML_SRC, GXML_PKG]:
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Import GXML components from submodule
from gxml_engine import run as gxml_run, format_timings_for_web

# Import XSD parser
from gxml_web.xsd_parser import parse_xsd_schema

app = FastAPI(title="GXML Web Viewer")

# Add CORS middleware for Electron support
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Get the React build directory
REACT_DIST_DIR = Path(__file__).parent / "static" / "dist"


class GXMLRequest(BaseModel):
    """Request model for GXML rendering."""
    xml: str


@app.get("/health")
async def health_check():
    """Health check endpoint for Electron server startup detection."""
    return {"status": "healthy", "service": "gxml-web"}


@app.get("/api/schema")
async def get_schema():
    """Return the GXML schema parsed from XSD for editor autocomplete."""
    try:
        schema = parse_xsd_schema()
        return schema
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=f"Failed to parse XSD: {str(e)}")


@app.post("/api/render")
async def render_gxml(request: GXMLRequest) -> Response:
    """Render GXML and return geometry as packed binary data.
    
    Returns binary data that can be loaded directly into WebGL Float32Arrays.
    See binary_render_engine.py for format documentation.
    
    Uses gxml_engine profiling to capture timing from instrumented code sections.
    """
    try:
        t0 = time.perf_counter()
        
        # Run the full pipeline with profiling enabled
        result = gxml_run(
            request.xml,
            backend='c',  # Use C extension for best performance
            output_format='binary',
            profile=True,
        )
        
        # result.output is already bytes for binary format
        binary_data = result.output
        
        # Use shared timing extraction helper
        timings = format_timings_for_web(result.timings)
        timings['total'] = (time.perf_counter() - t0) * 1000
        
        # Get panel count from stats
        panel_count = result.stats.get('panel_count', 0) if result.stats else 0
        
        return Response(
            content=binary_data,
            media_type="application/octet-stream",
            headers={
                "X-Panel-Count": str(panel_count),
                "X-Timing-Parse": f"{timings['parse']:.2f}",
                "X-Timing-Measure": f"{timings['measure']:.2f}",
                "X-Timing-Prelayout": f"{timings['prelayout']:.2f}",
                "X-Timing-Layout": f"{timings['layout']:.2f}",
                "X-Timing-Postlayout": f"{timings['postlayout']:.2f}",
                "X-Timing-Render": f"{timings['render']:.2f}",
                "X-Timing-Intersection": f"{timings['intersection']:.2f}",
                "X-Timing-Face": f"{timings['face']:.2f}",
                "X-Timing-Geometry": f"{timings['geometry']:.2f}",
                "X-Timing-Total": f"{timings['total']:.2f}",
            }
        )
    
    except Exception as e:
        # Return error as JSON even for binary endpoint
        error_msg = str(e)
        if 'ParseError' in type(e).__name__ or 'xml.etree' in str(type(e)):
            error_msg = f"XML Parse Error: {error_msg}"
        raise HTTPException(status_code=400, detail=error_msg)


@app.get("/")
async def root():
    """Serve the React app."""
    index_path = REACT_DIST_DIR / "index.html"
    if not index_path.exists():
        raise HTTPException(status_code=500, detail="React build not found. Run 'npm run build' in frontend/")
    return FileResponse(index_path)


# Mount React build assets
if REACT_DIST_DIR.exists() and (REACT_DIST_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=REACT_DIST_DIR / "assets"), name="assets")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
