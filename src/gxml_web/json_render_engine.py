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
        
        # For panels, get endpoint info (where the next panel would attach)
        if hasattr(element, 'transform_point'):
            try:
                # Get start and end points in world space
                # Use (0, 0.5, 0) for start center and (1, 0.5, 0) for end center
                # X: 0=start, 1=end of panel length
                # Y: 0.5 = middle height
                # Z: 0 = center of thickness (thickness is symmetric around Z=0)
                start_pt = element.transform_point((0, 0.5, 0))
                end_pt = element.transform_point((1, 0.5, 0))
                
                self._panel_data['startPoint'] = [float(start_pt[0]), float(start_pt[1]), float(start_pt[2]) if len(start_pt) > 2 else 0.0]
                self._panel_data['endPoint'] = [float(end_pt[0]), float(end_pt[1]), float(end_pt[2]) if len(end_pt) > 2 else 0.0]
                
                # Also get rotation info
                if hasattr(element, 'rotation'):
                    self._panel_data['rotation'] = [float(element.rotation[0]), float(element.rotation[1]), float(element.rotation[2])]
            except Exception as e:
                pass  # Skip if transform fails
    
    def create_poly(self, id, points, geoKey=None):
        """Create a polygon from points.
        
        Args:
            id: Identifier for the polygon
            points: List of 3D points [(x,y,z), ...]
            geoKey: Optional geometry group key
        """
        # Convert points to list format - optimized for common tuple case
        point_list = []
        min_x = min_y = min_z = float('inf')
        max_x = max_y = max_z = float('-inf')
        
        for p in points:
            # Fast path for tuples/lists (most common)
            try:
                x, y, z = float(p[0]), float(p[1]), float(p[2]) if len(p) > 2 else 0.0
            except (TypeError, KeyError):
                # Slow path for Vec3 objects
                if hasattr(p, 'x'):
                    x, y, z = float(p.x), float(p.y), float(p.z)
                else:
                    x, y, z = float(p[0]), float(p[1]), 0.0
            
            point_list.append([x, y, z])
            
            # Track bounding box inline
            if x < min_x: min_x = x
            if x > max_x: max_x = x
            if y < min_y: min_y = y
            if y > max_y: max_y = y
            if z < min_z: min_z = z
            if z > max_z: max_z = z
        
        # Calculate center and size from tracked bounds
        if point_list:
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
            'startPoint': self._panel_data.get('startPoint'),
            'endPoint': self._panel_data.get('endPoint'),
            'rotation': self._panel_data.get('rotation'),
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
