"""FastAPI backend for GXML Web Viewer."""

import json
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

# Add gxml src directory to path for imports
# This is needed because gxml uses local imports, not package imports
GXML_SRC_PATH = Path(__file__).parent.parent.parent.parent / "gxml" / "src" / "gxml"
if str(GXML_SRC_PATH) not in sys.path:
    sys.path.insert(0, str(GXML_SRC_PATH))

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Import GXML components (now uses local imports from gxml src)
from gxml_parser import GXMLParser
from gxml_layout import GXMLLayout
from gxml_render import GXMLRender

# Import our render engines
from gxml_web.json_render_engine import JSONRenderEngine
from gxml_web.binary_render_engine import BinaryRenderEngine

app = FastAPI(title="GXML Web Viewer")

# Add CORS middleware for Electron support
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Get the static files directories
STATIC_DIR = Path(__file__).parent / "static"
REACT_DIST_DIR = STATIC_DIR / "dist"

# Path to XSD schema
XSD_PATH = Path(__file__).parent.parent.parent.parent / "gxml" / "misc" / "gxml.xsd"

# Check if React build exists (production mode)
USE_REACT_BUILD = REACT_DIST_DIR.exists() and (REACT_DIST_DIR / "index.html").exists()


class GXMLRequest(BaseModel):
    """Request model for GXML rendering."""
    xml: str


class GXMLResponse(BaseModel):
    """Response model for GXML rendering."""
    success: bool
    data: dict[str, Any] | None = None
    error: str | None = None


def parse_xsd_schema() -> dict:
    """Parse XSD schema and return a JSON-friendly structure for autocomplete."""
    tree = ET.parse(XSD_PATH)
    root = tree.getroot()
    
    # XSD namespace
    ns = {'xs': 'http://www.w3.org/2001/XMLSchema'}
    
    schema = {'tags': {}}
    
    # Parse simple types (enums)
    simple_types = {}
    for simple_type in root.findall('.//xs:simpleType', ns):
        type_name = simple_type.get('name')
        if type_name:
            restriction = simple_type.find('xs:restriction', ns)
            if restriction is not None:
                values = [enum.get('value') for enum in restriction.findall('xs:enumeration', ns)]
                if values:
                    simple_types[type_name] = values
    
    # Parse complex types
    complex_types = {}
    for complex_type in root.findall('.//xs:complexType', ns):
        type_name = complex_type.get('name')
        if type_name:
            complex_types[type_name] = parse_complex_type(complex_type, ns, simple_types)
    
    # Parse root element
    for element in root.findall('xs:element', ns):
        elem_name = element.get('name')
        if elem_name:
            complex_type = element.find('xs:complexType', ns)
            if complex_type is not None:
                schema['tags'][elem_name] = parse_complex_type(complex_type, ns, simple_types)
                # Get children from sequence
                sequence = complex_type.find('.//xs:sequence', ns)
                if sequence is not None:
                    children = []
                    for child in sequence.findall('xs:element', ns):
                        child_name = child.get('name')
                        child_type = child.get('type')
                        if child_name:
                            children.append(child_name)
                            # If it has a type reference, use that
                            if child_type and child_type in complex_types:
                                schema['tags'][child_name] = complex_types[child_type].copy()
                    schema['tags'][elem_name]['children'] = children
    
    # Add vars tag (special case - allows any children)
    if 'vars' not in schema['tags']:
        schema['tags']['vars'] = {
            'description': 'Container for variable definitions.',
            'attributes': {},
            'children': ['*']
        }
    
    return schema


def parse_complex_type(complex_type, ns, simple_types) -> dict:
    """Parse a complex type definition into a dict."""
    result = {
        'description': '',
        'attributes': {},
        'children': []
    }
    
    # Get documentation
    doc = complex_type.find('.//xs:documentation', ns)
    if doc is not None and doc.text:
        result['description'] = doc.text.strip()
    
    # Get attributes
    for attr in complex_type.findall('.//xs:attribute', ns):
        attr_name = attr.get('name')
        attr_type = attr.get('type')
        if attr_name:
            attr_def = {'type': 'string'}
            
            # Get attribute documentation
            attr_doc = attr.find('.//xs:documentation', ns)
            if attr_doc is not None and attr_doc.text:
                attr_def['description'] = attr_doc.text.strip()
            
            # Check if type is a known simple type with enum values
            if attr_type:
                # Remove xs: prefix if present
                type_name = attr_type.replace('xs:', '')
                if type_name in simple_types:
                    attr_def['type'] = 'enum'
                    attr_def['values'] = simple_types[type_name]
                elif type_name == 'boolean':
                    attr_def['type'] = 'boolean'
                    attr_def['values'] = ['true', 'false']
            
            result['attributes'][attr_name] = attr_def
    
    # Get child elements from sequence
    sequence = complex_type.find('.//xs:sequence', ns)
    if sequence is not None:
        for child in sequence.findall('xs:element', ns):
            child_name = child.get('name')
            if child_name:
                result['children'].append(child_name)
    
    return result


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


@app.post("/api/render", response_model=GXMLResponse)
async def render_gxml(request: GXMLRequest) -> GXMLResponse:
    """Render GXML and return geometry data as JSON."""
    try:
        # Parse the GXML
        root_element = GXMLParser.parse(request.xml)
        
        # Apply layout
        GXMLLayout.layout(root_element)
        
        # Create JSON render engine and render
        render_engine = JSONRenderEngine()
        GXMLRender.render(root_element, render_engine)
        
        # Get the result as dict
        result = render_engine.to_dict()
        
        return GXMLResponse(success=True, data=result)
    
    except Exception as e:
        # For XML parse errors, extract just the message
        error_msg = str(e)
        if 'ParseError' in type(e).__name__ or 'xml.etree' in str(type(e)):
            # Clean up XML parse errors
            error_msg = f"XML Parse Error: {error_msg}"
        return GXMLResponse(success=False, error=error_msg)


@app.post("/api/render/binary")
async def render_gxml_binary(request: GXMLRequest) -> Response:
    """Render GXML and return geometry as packed binary data.
    
    Returns binary data that can be loaded directly into WebGL Float32Arrays.
    See binary_render_engine.py for format documentation.
    """
    try:
        timings = {}
        t0 = time.perf_counter()
        
        # Parse the GXML
        t_start = time.perf_counter()
        root_element = GXMLParser.parse(request.xml)
        timings['parse'] = (time.perf_counter() - t_start) * 1000
        
        # Apply layout with granular timing
        t_start = time.perf_counter()
        GXMLLayout.measure_pass(root_element)
        timings['measure'] = (time.perf_counter() - t_start) * 1000
        
        t_start = time.perf_counter()
        GXMLLayout.pre_layout_pass(root_element)
        timings['prelayout'] = (time.perf_counter() - t_start) * 1000
        
        t_start = time.perf_counter()
        GXMLLayout.layout_pass(root_element)
        timings['layout'] = (time.perf_counter() - t_start) * 1000
        
        t_start = time.perf_counter()
        GXMLLayout.post_layout_pass(root_element)
        timings['postlayout'] = (time.perf_counter() - t_start) * 1000
        
        # Create binary render engine and render
        t_start = time.perf_counter()
        render_engine = BinaryRenderEngine()
        GXMLRender.render(root_element, render_engine)
        timings['render'] = (time.perf_counter() - t_start) * 1000
        
        # Get binary data
        t_start = time.perf_counter()
        binary_data = render_engine.to_bytes()
        timings['serialize'] = (time.perf_counter() - t_start) * 1000
        
        timings['total'] = (time.perf_counter() - t0) * 1000
        
        return Response(
            content=binary_data,
            media_type="application/octet-stream",
            headers={
                "X-Panel-Count": str(len(render_engine.panels)),
                "X-Timing-Parse": f"{timings['parse']:.2f}",
                "X-Timing-Measure": f"{timings['measure']:.2f}",
                "X-Timing-Prelayout": f"{timings['prelayout']:.2f}",
                "X-Timing-Layout": f"{timings['layout']:.2f}",
                "X-Timing-Postlayout": f"{timings['postlayout']:.2f}",
                "X-Timing-Render": f"{timings['render']:.2f}",
                "X-Timing-Serialize": f"{timings['serialize']:.2f}",
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
    """Serve the main HTML page."""
    if USE_REACT_BUILD:
        return FileResponse(REACT_DIST_DIR / "index.html")
    return FileResponse(STATIC_DIR / "index.html")


# Mount static files
if USE_REACT_BUILD:
    # Serve React build assets
    app.mount("/assets", StaticFiles(directory=REACT_DIST_DIR / "assets"), name="assets")
else:
    # Serve legacy static files
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
