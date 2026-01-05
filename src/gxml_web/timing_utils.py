"""Timing utilities for GXML web responses."""

from typing import Any, Dict, Optional


def format_timings_for_web(profile_results: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Format GXML profile results into web-friendly timing dict.
    
    Extracts timing data from gxml_engine profile markers and maps them
    to web-friendly names for HTTP headers or JSON responses.
    
    Args:
        profile_results: Raw timing dict from gxml_engine result.timings
        
    Returns:
        Dict with:
        - Legacy flattened keys for backward compatibility
        - 'markers': Raw marker data with parent info for hierarchical display
    """
    if not profile_results:
        return {}
    
    def ms(name: str) -> float:
        return profile_results.get(name, {}).get('total_ms', 0.0)
    
    # Legacy flat format for backward compatibility
    result = {
        'parse': ms('parse'),
        'measure': ms('measure_pass'),
        'prelayout': ms('pre_layout_pass'),
        'layout': ms('layout_pass'),
        'postlayout': ms('post_layout_pass'),
        'render': ms('render'),
        # Solver breakdown (nested within post-layout, or standalone for indexed)
        'intersection': ms('intersection_solver'),
        'face': ms('face_solver'),
        'geometry': ms('geometry_builder'),
        # FastMeshBuilder (indexed pipeline only)
        'fastmesh': ms('fast_mesh_builder'),
        'serialize': ms('serialize'),
    }
    
    # Include raw markers for hierarchical display
    # Each marker has: total_ms, count, avg_ms, min_ms, max_ms, parents
    result['markers'] = profile_results
    
    return result
