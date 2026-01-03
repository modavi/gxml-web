/**
 * Binary geometry parser for GXML data.
 * 
 * Parses packed binary format from /api/render/binary endpoint directly
 * into typed arrays suitable for Three.js BufferGeometry.
 * 
 * Binary Format:
 *   Header (16 bytes):
 *     - Magic: 4 bytes "GXML"
 *     - Version: uint32 (1)
 *     - Panel count: uint32
 *     - Total vertex count: uint32
 *   
 *   For each panel:
 *     Panel header (20 bytes):
 *       - ID length: uint16
 *       - Vertex count: uint16
 *       - Color RGB: 3x float32
 *       - Reserved: 4 bytes (padding)
 *     Panel ID: variable (ID length bytes, UTF-8, padded to 4-byte alignment)
 *     Vertices: vertex_count * 3 * float32 (x, y, z packed)
 */

const MAGIC = 'GXML';
const SUPPORTED_VERSIONS = [1, 2]; // Support both v1 and v2

/**
 * Parse binary geometry data from ArrayBuffer
 * @param {ArrayBuffer} buffer - Raw binary data from API
 * @returns {Object} Parsed geometry data with panels array
 */
export function parseBinaryGeometry(buffer) {
  const view = new DataView(buffer);
  let offset = 0;
  
  // Read header
  const magic = String.fromCharCode(
    view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)
  );
  offset += 4;
  
  if (magic !== MAGIC) {
    throw new Error(`Invalid magic bytes: expected ${MAGIC}, got ${magic}`);
  }
  
  const version = view.getUint32(offset, true); // little-endian
  offset += 4;
  
  if (!SUPPORTED_VERSIONS.includes(version)) {
    throw new Error(`Unsupported version: ${version}`);
  }
  
  const panelCount = view.getUint32(offset, true);
  offset += 4;
  
  const totalVertices = view.getUint32(offset, true);
  offset += 4;
  
  // Parse panels
  const panels = [];
  
  for (let i = 0; i < panelCount; i++) {
    // Panel header
    const idLength = view.getUint16(offset, true);
    offset += 2;
    
    const vertexCount = view.getUint16(offset, true);
    offset += 2;
    
    const colorR = view.getFloat32(offset, true);
    offset += 4;
    const colorG = view.getFloat32(offset, true);
    offset += 4;
    const colorB = view.getFloat32(offset, true);
    offset += 4;
    
    // Version 2+: has_endpoints flag + reserved
    // Version 1: just reserved bytes
    let hasEndpoints = 0;
    let startPoint = null;
    let endPoint = null;
    
    if (version >= 2) {
      hasEndpoints = view.getUint8(offset);
      offset += 1;
      // Skip 3 reserved bytes
      offset += 3;
      
      // Read endpoint data if present
      if (hasEndpoints) {
        startPoint = [
          view.getFloat32(offset, true),
          view.getFloat32(offset + 4, true),
          view.getFloat32(offset + 8, true)
        ];
        offset += 12;
        
        endPoint = [
          view.getFloat32(offset, true),
          view.getFloat32(offset + 4, true),
          view.getFloat32(offset + 8, true)
        ];
        offset += 12;
      }
    } else {
      // Version 1: skip 4 reserved bytes
      offset += 4;
    }
    
    // Read panel ID (UTF-8 string)
    const idBytes = new Uint8Array(buffer, offset, idLength);
    const id = new TextDecoder().decode(idBytes);
    offset += idLength;
    
    // Skip padding to 4-byte alignment
    const paddingNeeded = (4 - (idLength % 4)) % 4;
    offset += paddingNeeded;
    
    // Read vertices directly as Float32Array view (zero-copy!)
    const floatCount = vertexCount * 3;
    const vertices = new Float32Array(buffer, offset, floatCount);
    offset += floatCount * 4;
    
    // Convert RGB floats to hex color string for compatibility
    const colorHex = '#' + 
      Math.round(colorR * 255).toString(16).padStart(2, '0') +
      Math.round(colorG * 255).toString(16).padStart(2, '0') +
      Math.round(colorB * 255).toString(16).padStart(2, '0');
    
    // Convert vertices to points array for compatibility with existing code
    // This is the "parsing" step we're trying to avoid in the future
    const points = [];
    for (let j = 0; j < vertexCount; j++) {
      const idx = j * 3;
      points.push([vertices[idx], vertices[idx + 1], vertices[idx + 2]]);
    }
    
    const panel = {
      id,
      color: colorHex,
      colorRGB: [colorR, colorG, colorB],
      points,
      // Also expose raw typed array for direct Three.js usage
      vertexBuffer: vertices,
      vertexCount,
    };
    
    // Add endpoint data if present (for snapping)
    if (startPoint) panel.startPoint = startPoint;
    if (endPoint) panel.endPoint = endPoint;
    
    panels.push(panel);
  }
  
  return {
    panels,
    lines: [], // Lines not yet supported in binary format
    _meta: {
      format: 'binary',
      version,
      totalVertices,
    }
  };
}

/**
 * Fetch and parse binary geometry from API
 * @param {string} xml - GXML content
 * @returns {Promise<Object>} Parsed geometry data with timing info
 */
export async function fetchBinaryGeometry(xml) {
  const timings = {};
  const t0 = performance.now();
  
  const response = await fetch('/api/render/binary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ xml }),
  });
  
  timings.networkFetch = performance.now() - t0;
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Binary render failed');
  }
  
  // Extract server-side timings from headers
  timings.server = {
    parse: parseFloat(response.headers.get('X-Timing-Parse') || '0'),
    layout: parseFloat(response.headers.get('X-Timing-Layout') || '0'),
    render: parseFloat(response.headers.get('X-Timing-Render') || '0'),
    serialize: parseFloat(response.headers.get('X-Timing-Serialize') || '0'),
    total: parseFloat(response.headers.get('X-Timing-Total') || '0'),
  };
  
  const t1 = performance.now();
  const buffer = await response.arrayBuffer();
  timings.arrayBufferRead = performance.now() - t1;
  
  const t2 = performance.now();
  const result = parseBinaryGeometry(buffer);
  timings.binaryParse = performance.now() - t2;
  
  timings.totalFrontend = performance.now() - t0;
  
  // Log timing summary
  console.group('🕐 GXML Render Timings');
  console.log(`📡 Server (Python):`);
  console.log(`   Parse XML:      ${timings.server.parse.toFixed(2)} ms`);
  console.log(`   Layout:         ${timings.server.layout.toFixed(2)} ms`);
  console.log(`   Render/Solve:   ${timings.server.render.toFixed(2)} ms`);
  console.log(`   Serialize:      ${timings.server.serialize.toFixed(2)} ms`);
  console.log(`   Total Server:   ${timings.server.total.toFixed(2)} ms`);
  console.log(`🌐 Network + Client:`);
  console.log(`   Network fetch:  ${timings.networkFetch.toFixed(2)} ms`);
  console.log(`   ArrayBuffer:    ${timings.arrayBufferRead.toFixed(2)} ms`);
  console.log(`   Binary parse:   ${timings.binaryParse.toFixed(2)} ms`);
  console.log(`   Total Client:   ${timings.totalFrontend.toFixed(2)} ms`);
  console.log(`📊 Summary:`);
  console.log(`   Panels:         ${result.panels.length}`);
  console.log(`   Vertices:       ${result._meta?.totalVertices || 'N/A'}`);
  console.log(`   Payload:        ${(buffer.byteLength / 1024).toFixed(1)} KB`);
  console.groupEnd();
  
  // Attach timings to result for display
  result.timings = timings;
  
  return result;
}

/**
 * Create Three.js BufferGeometry directly from binary panel data
 * This is the optimal path - no intermediate parsing
 * @param {Object} panel - Panel with vertexBuffer
 * @returns {THREE.BufferGeometry}
 */
export function createBufferGeometryFromBinaryPanel(panel) {
  // Import THREE dynamically to avoid issues if this module is loaded before Three.js
  const THREE = window.THREE;
  if (!THREE) {
    throw new Error('Three.js not loaded');
  }
  
  const geometry = new THREE.BufferGeometry();
  
  // Use the Float32Array directly - no copying!
  geometry.setAttribute('position', new THREE.BufferAttribute(panel.vertexBuffer, 3));
  
  // Generate indices for triangle fan
  const vertexCount = panel.vertexCount;
  const indices = [];
  for (let i = 1; i < vertexCount - 1; i++) {
    indices.push(0, i, i + 1);
    indices.push(0, i + 1, i); // Back face
  }
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  
  return geometry;
}
