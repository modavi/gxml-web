"""JSON Render Engine for GXML Web Viewer.

This render engine collects geometry data and outputs it as JSON
for consumption by the web frontend.
"""

import sys
from pathlib import Path

# Add gxml src directory to path for imports
GXML_SRC_PATH = Path(__file__).parent.parent.parent.parent / "gxml" / "src" / "gxml"
if str(GXML_SRC_PATH) not in sys.path:
    sys.path.insert(0, str(GXML_SRC_PATH))

from render_engines.base_render_context import BaseRenderContext


class JSONRenderEngine(BaseRenderContext):
    """Render engine that collects geometry data as JSON."""
    
    def __init__(self):
        self.panels = []
        self.lines = []
        self.current_element = None
        self._panel_data = {}
        self._color_palette = [
            '#e94560', '#0f3460', '#16213e', '#533483', 
            '#1a1a2e', '#4a4e69', '#9a8c98', '#c9ada7',
            '#22223b', '#f2e9e4', '#4361ee', '#7209b7',
        ]
        self._color_index = 0
        
    def _get_next_color(self):
        """Get the next color from the palette."""
        color = self._color_palette[self._color_index % len(self._color_palette)]
        self._color_index += 1
        return color
        
    def pre_render(self, element):
        """Called before rendering an element."""
        self.current_element = element
        
        # Store current element info for polygon creation
        self._panel_data = {
            'id': getattr(element, 'id', None),
            'subId': getattr(element, 'subId', None),
        }
        
        # Try to get color from element attributes if available
        if hasattr(element, 'color') and element.color:
            self._panel_data['color'] = element.color
        else:
            # Assign a color based on element id
            self._panel_data['color'] = self._get_next_color()
    
    def create_poly(self, id, points, geoKey=None):
        """Create a polygon from points.
        
        Args:
            id: Identifier for the polygon
            points: List of 3D points [(x,y,z), ...]
            geoKey: Optional geometry group key
        """
        # Convert points to list format
        point_list = []
        for p in points:
            if hasattr(p, '__iter__'):
                point_list.append([float(p[0]), float(p[1]), float(p[2]) if len(p) > 2 else 0.0])
            else:
                point_list.append([float(p[0]), float(p[1]), 0.0])
        
        # Calculate bounding box to determine size
        if point_list:
            xs = [p[0] for p in point_list]
            ys = [p[1] for p in point_list]
            zs = [p[2] for p in point_list]
            
            min_x, max_x = min(xs), max(xs)
            min_y, max_y = min(ys), max(ys)
            min_z, max_z = min(zs), max(zs)
            
            center = [
                (min_x + max_x) / 2,
                (min_y + max_y) / 2,
                (min_z + max_z) / 2,
            ]
            
            size = [
                max_x - min_x,
                max_y - min_y,
                max_z - min_z,
            ]
        else:
            center = [0, 0, 0]
            size = [0, 0, 0]
        
        panel_info = {
            'id': id,
            'points': point_list,
            'position': center,
            'size': size,
            'color': self._panel_data.get('color'),
            'geoKey': geoKey,
        }
        
        self.panels.append(panel_info)
    
    def create_line(self, id, points, geoKey=None):
        """Create a line from points.
        
        Args:
            id: Identifier for the line
            points: List of 3D points [(x,y,z), ...]
            geoKey: Optional geometry group key
        """
        point_list = []
        for p in points:
            if hasattr(p, '__iter__'):
                point_list.append([float(p[0]), float(p[1]), float(p[2]) if len(p) > 2 else 0.0])
            else:
                point_list.append([float(p[0]), float(p[1]), 0.0])
        
        self.lines.append({
            'id': id,
            'points': point_list,
            'geoKey': geoKey,
        })
    
    def get_or_create_geo(self, key):
        """For JSON export, we just return self as we collect all geometry."""
        return self
    
    def combine_all_geo(self):
        """No-op for JSON export - all geometry is already collected."""
        pass
    
    def to_dict(self):
        """Convert collected geometry to a dictionary.
        
        Returns:
            Dictionary with panels and lines data
        """
        return {
            'panels': self.panels,
            'lines': self.lines,
        }
