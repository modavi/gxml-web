"""Binary Render Engine for GXML Web Viewer.

This render engine outputs geometry as packed binary data that can be
loaded directly into WebGL/Three.js Float32Arrays without JSON parsing.

Binary Format:
    Header (16 bytes):
        - Magic: 4 bytes "GXML"
        - Version: uint32 (1)
        - Panel count: uint32
        - Total vertex count: uint32
    
    For each panel:
        Panel header (24 bytes):
            - ID length: uint16
            - Vertex count: uint16
            - Color RGB: 3x float32
            - Reserved: 4 bytes
        Panel ID: variable (ID length bytes, UTF-8)
        Vertices: vertex_count * 3 * float32 (x, y, z packed)
"""

import struct
import sys
from pathlib import Path

# Add gxml src directory to path for imports
GXML_SRC_PATH = Path(__file__).parent.parent.parent.parent / "gxml" / "src" / "gxml"
if str(GXML_SRC_PATH) not in sys.path:
    sys.path.insert(0, str(GXML_SRC_PATH))

from render_engines.base_render_context import BaseRenderContext


def hex_to_rgb(hex_color: str) -> tuple[float, float, float]:
    """Convert hex color string to RGB floats (0-1 range)."""
    hex_color = hex_color.lstrip('#')
    if len(hex_color) == 6:
        r = int(hex_color[0:2], 16) / 255.0
        g = int(hex_color[2:4], 16) / 255.0
        b = int(hex_color[4:6], 16) / 255.0
        return (r, g, b)
    return (0.5, 0.5, 0.5)  # Default gray


class BinaryRenderEngine(BaseRenderContext):
    """Render engine that outputs geometry as packed binary data."""
    
    MAGIC = b'GXML'
    VERSION = 1
    
    def __init__(self):
        self.panels = []  # List of (id, color_rgb, vertices_flat)
        self.current_element = None
        self._panel_data = {}
        self._color_palette = [
            '#e94560', '#0f3460', '#16213e', '#533483', 
            '#1a1a2e', '#4a4e69', '#9a8c98', '#c9ada7',
            '#22223b', '#f2e9e4', '#4361ee', '#7209b7',
        ]
        self._color_index = 0
        
    def _get_next_color(self) -> str:
        """Get the next color from the palette."""
        color = self._color_palette[self._color_index % len(self._color_palette)]
        self._color_index += 1
        return color
        
    def pre_render(self, element):
        """Called before rendering an element."""
        self.current_element = element
        
        self._panel_data = {
            'id': getattr(element, 'id', None) or '',
            'startPoint': None,
            'endPoint': None,
        }
        
        # Get color
        if hasattr(element, 'color') and element.color:
            self._panel_data['color'] = element.color
        else:
            self._panel_data['color'] = self._get_next_color()
        
        # For panels, get endpoint info (where the next panel would attach)
        if hasattr(element, 'transform_point'):
            try:
                # Get start and end points in world space
                start_pt = element.transform_point((0, 0.5, 0))
                end_pt = element.transform_point((1, 0.5, 0))
                
                self._panel_data['startPoint'] = (float(start_pt[0]), float(start_pt[1]), float(start_pt[2]) if len(start_pt) > 2 else 0.0)
                self._panel_data['endPoint'] = (float(end_pt[0]), float(end_pt[1]), float(end_pt[2]) if len(end_pt) > 2 else 0.0)
            except Exception:
                pass  # Skip if transform fails
        
    def create_poly(self, id: str, points, geoKey=None):
        """Create a polygon from points.
        
        Args:
            id: Identifier for the polygon
            points: List of 3D points [(x,y,z), ...]
            geoKey: Optional geometry group key
        """
        # Flatten points to [x0, y0, z0, x1, y1, z1, ...]
        vertices_flat = []
        for p in points:
            try:
                x, y = float(p[0]), float(p[1])
                z = float(p[2]) if len(p) > 2 else 0.0
            except (TypeError, KeyError):
                if hasattr(p, 'x'):
                    x, y, z = float(p.x), float(p.y), float(p.z)
                else:
                    x, y, z = float(p[0]), float(p[1]), 0.0
            vertices_flat.extend([x, y, z])
        
        color_rgb = hex_to_rgb(self._panel_data.get('color', '#888888'))
        panel_id = id or ''
        start_point = self._panel_data.get('startPoint')
        end_point = self._panel_data.get('endPoint')
        
        self.panels.append((panel_id, color_rgb, vertices_flat, start_point, end_point))
    
    def create_line(self, id, points, geoKey=None):
        """Create a line from points - currently not included in binary output."""
        pass  # Lines not supported in binary format yet
    
    def get_or_create_geo(self, key):
        """For binary export, we just return self."""
        return self
    
    def combine_all_geo(self):
        """No-op for binary export."""
        pass
    
    def to_bytes(self) -> bytes:
        """Convert collected geometry to binary format.
        
        Binary Format v2:
            Header (16 bytes):
                - Magic: 4 bytes "GXML"
                - Version: uint32 (2)
                - Panel count: uint32
                - Total vertex count: uint32
            
            For each panel:
                Panel header (44 bytes):
                    - ID length: uint16
                    - Vertex count: uint16
                    - Color RGB: 3x float32 (12 bytes)
                    - Has endpoints: uint8 (1 = yes, 0 = no)
                    - Reserved: 3 bytes
                    - Start point: 3x float32 (12 bytes) - only if has_endpoints
                    - End point: 3x float32 (12 bytes) - only if has_endpoints
                Panel ID: variable (ID length bytes, UTF-8, padded to 4-byte alignment)
                Vertices: vertex_count * 3 * float32
        
        Returns:
            Packed binary data
        """
        parts = []
        
        # Calculate total vertex count
        total_vertices = sum(len(v) // 3 for _, _, v, _, _ in self.panels)
        
        # Header: magic (4) + version (4) + panel_count (4) + total_vertices (4)
        header = struct.pack('<4sIII', 
            self.MAGIC,
            2,  # Version 2 includes endpoint data
            len(self.panels),
            total_vertices
        )
        parts.append(header)
        
        # Each panel
        for panel_id, color_rgb, vertices_flat, start_point, end_point in self.panels:
            id_bytes = panel_id.encode('utf-8')
            vertex_count = len(vertices_flat) // 3
            has_endpoints = 1 if (start_point and end_point) else 0
            
            # Panel header: id_len (2) + vertex_count (2) + color RGB (12) + has_endpoints (1) + reserved (3)
            panel_header = struct.pack('<HH3fB3x',
                len(id_bytes),
                vertex_count,
                color_rgb[0], color_rgb[1], color_rgb[2],
                has_endpoints
            )
            parts.append(panel_header)
            
            # Endpoint data (if present)
            if has_endpoints:
                endpoints = struct.pack('<6f',
                    start_point[0], start_point[1], start_point[2],
                    end_point[0], end_point[1], end_point[2]
                )
                parts.append(endpoints)
            
            # Panel ID (variable length)
            parts.append(id_bytes)
            
            # Pad to 4-byte alignment for float array
            padding_needed = (4 - (len(id_bytes) % 4)) % 4
            if padding_needed:
                parts.append(b'\x00' * padding_needed)
            
            # Vertices as float32 array
            vertices_packed = struct.pack(f'<{len(vertices_flat)}f', *vertices_flat)
            parts.append(vertices_packed)
        
        return b''.join(parts)
    
    def to_dict(self) -> dict:
        """Also support dict output for compatibility."""
        panels = []
        for panel_id, color_rgb, vertices_flat, start_point, end_point in self.panels:
            # Convert flat vertices back to point list
            points = []
            for i in range(0, len(vertices_flat), 3):
                points.append([vertices_flat[i], vertices_flat[i+1], vertices_flat[i+2]])
            
            # Convert RGB to hex
            r, g, b = color_rgb
            color_hex = f'#{int(r*255):02x}{int(g*255):02x}{int(b*255):02x}'
            
            panel_dict = {
                'id': panel_id,
                'points': points,
                'color': color_hex,
            }
            
            if start_point:
                panel_dict['startPoint'] = list(start_point)
            if end_point:
                panel_dict['endPoint'] = list(end_point)
            
            panels.append(panel_dict)
        
        return {'panels': panels, 'lines': []}
