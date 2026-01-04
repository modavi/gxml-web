"""XSD schema parser for GXML editor autocomplete."""

import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any


# Path to XSD schema (from gxml submodule)
XSD_PATH = Path(__file__).parent.parent.parent / "gxml" / "misc" / "gxml.xsd"


def parse_complex_type(complex_type, ns: dict, simple_types: dict) -> dict:
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


def parse_xsd_schema(xsd_path: Path = None) -> dict:
    """Parse XSD schema and return a JSON-friendly structure for autocomplete.
    
    Args:
        xsd_path: Path to XSD file. Defaults to the gxml.xsd in the gxml package.
        
    Returns:
        Dict with 'tags' key containing tag definitions with attributes and children.
    """
    if xsd_path is None:
        xsd_path = XSD_PATH
        
    tree = ET.parse(xsd_path)
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
