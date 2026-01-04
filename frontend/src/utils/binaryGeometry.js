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

import { buildApiUrl } from './apiConfig';

const MAGIC = 'GXML';
const MAGIC_FAST = 'GXMF';
const SUPPORTED_VERSIONS = [1, 2]; // Support both v1 and v2

/**
 * Parse binary geometry data from ArrayBuffer
 * Auto-detects format based on magic bytes (GXML = per-panel, GXMF = indexed fast)
 * @param {ArrayBuffer} buffer - Raw binary data from API
 * @returns {Object} Parsed geometry data with panels array or indexed geometry
 */
export function parseBinaryGeometry(buffer) {
  const view = new DataView(buffer);
  
  // Read magic to detect format
  const magic = String.fromCharCode(
    view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)
  );
  
  if (magic === MAGIC_FAST) {
    return parseFastBinaryGeometry(buffer, view);
  } else if (magic === MAGIC) {
    return parsePerPanelBinaryGeometry(buffer, view);
  } else {
    throw new Error(`Invalid magic bytes: expected ${MAGIC} or ${MAGIC_FAST}, got ${magic}`);
  }
}

/**
 * Parse fast indexed binary geometry (GXMF format)
 * @param {ArrayBuffer} buffer - Raw binary data
 * @param {DataView} view - DataView of buffer
 * @returns {Object} Indexed geometry data
 */
function parseFastBinaryGeometry(buffer, view) {
  let offset = 4; // Skip magic
  
  const version = view.getUint32(offset, true);
  offset += 4;
  
  if (version !== 1) {
    throw new Error(`Unsupported fast binary version: ${version}`);
  }
  
  const vertexCount = view.getUint32(offset, true);
  offset += 4;
  
  const indexCount = view.getUint32(offset, true);
  offset += 4;
  
  const quadCount = view.getUint32(offset, true);
  offset += 4;
  
  // Read vertices (float32 * 3 per vertex)
  const vertices = new Float32Array(buffer, offset, vertexCount * 3);
  offset += vertexCount * 3 * 4;
  
  // Read indices (uint32)
  const indices = new Uint32Array(buffer, offset, indexCount);
  offset += indexCount * 4;
  
  // Read panel IDs for each quad
  const panelIds = [];
  for (let i = 0; i < quadCount; i++) {
    const idLength = view.getUint16(offset, true);
    offset += 2;
    
    const idBytes = new Uint8Array(buffer, offset, idLength);
    panelIds.push(new TextDecoder().decode(idBytes));
    offset += idLength;
    
    // Skip padding to 4-byte alignment
    const padding = (4 - ((2 + idLength) % 4)) % 4;
    offset += padding;
  }
  
  // Generate panel colors from IDs (simple hash-based coloring)
  const panelColors = generatePanelColors(panelIds);
  
  return {
    format: 'indexed',
    vertices,
    indices,
    panelIds,
    panelColors,
    quadCount,
    _meta: {
      format: 'fast-binary',
      version,
      vertexCount,
      indexCount,
      quadCount,
    }
  };
}

/**
 * Generate consistent colors for panel IDs
 * @param {string[]} panelIds - Array of panel IDs
 * @returns {Map<string, number[]>} Map of panel ID to [r, g, b]
 */
function generatePanelColors(panelIds) {
  const palette = [
    [0.914, 0.271, 0.376], // #e94560
    [0.059, 0.204, 0.376], // #0f3460
    [0.086, 0.129, 0.243], // #16213e
    [0.325, 0.204, 0.514], // #533483
    [0.102, 0.102, 0.180], // #1a1a2e
    [0.290, 0.306, 0.412], // #4a4e69
    [0.604, 0.549, 0.596], // #9a8c98
    [0.788, 0.678, 0.655], // #c9ada7
    [0.133, 0.133, 0.231], // #22223b
    [0.949, 0.914, 0.894], // #f2e9e4
    [0.263, 0.380, 0.933], // #4361ee
    [0.447, 0.035, 0.718], // #7209b7
  ];
  
  const colorMap = new Map();
  const uniqueIds = [...new Set(panelIds)];
  
  uniqueIds.forEach((id, i) => {
    colorMap.set(id, palette[i % palette.length]);
  });
  
  return colorMap;
}

/**
 * Parse per-panel binary geometry (original GXML format)
 * @param {ArrayBuffer} buffer - Raw binary data
 * @param {DataView} view - DataView of buffer
 * @returns {Object} Parsed geometry data with panels array
 */
function parsePerPanelBinaryGeometry(buffer, view) {
  let offset = 4; // Skip magic already read
  
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
 * Check if running in Electron with direct Python support
 */
function hasElectronAPI() {
  return typeof window !== 'undefined' && 
         window.electronAPI && 
         typeof window.electronAPI.processGxml === 'function';
}

/**
 * Process GXML via Electron IPC (direct Python call, no server)
 * @param {string} xml - GXML content
 * @returns {Promise<Object>} Parsed geometry data with timing info
 */
async function processGxmlViaElectron(xml) {
  const timings = {};
  const t0 = performance.now();
  
  const result = await window.electronAPI.processGxml(xml);
  timings.ipcCall = performance.now() - t0;
  
  if (!result.success) {
    throw new Error(result.error || 'GXML processing failed');
  }
  
  timings.pythonDuration = result.duration;
  
  // Store server-side timing breakdown (from Python)
  if (result.serverTimings) {
    timings.server = result.serverTimings;
  }
  
  const t1 = performance.now();
  // Get ArrayBuffer from Uint8Array - use the underlying buffer directly when possible
  // to avoid extra copy
  let buffer;
  if (result.buffer instanceof Uint8Array) {
    // If the Uint8Array covers the whole ArrayBuffer, use it directly
    if (result.buffer.byteOffset === 0 && result.buffer.byteLength === result.buffer.buffer.byteLength) {
      buffer = result.buffer.buffer;
    } else {
      // Otherwise we need to slice
      buffer = result.buffer.buffer.slice(
        result.buffer.byteOffset,
        result.buffer.byteOffset + result.buffer.byteLength
      );
    }
  } else if (result.buffer instanceof ArrayBuffer) {
    buffer = result.buffer;
  } else {
    throw new Error('Unexpected buffer format from Electron');
  }
  const data = parseBinaryGeometry(buffer);
  timings.binaryParse = performance.now() - t1;
  
  timings.totalFrontend = performance.now() - t0;
  
  // Log timing summary
  console.group('🕐 GXML Render Timings (Electron Direct)');
  if (timings.server) {
    console.log(`📝 Parse:     ${timings.server.parse?.toFixed(2)} ms`);
    console.log(`📐 Measure:   ${timings.server.measure?.toFixed(2)} ms`);
    console.log(`📐 Prelayout: ${timings.server.prelayout?.toFixed(2)} ms`);
    console.log(`📐 Layout:    ${timings.server.layout?.toFixed(2)} ms`);
    console.log(`📐 Postlayout:${timings.server.postlayout?.toFixed(2)} ms`);
    if (timings.server.intersection > 0 || timings.server.face > 0 || timings.server.geometry > 0) {
      console.log(`     ├─ Intersection: ${timings.server.intersection?.toFixed(2)} ms`);
      console.log(`     ├─ Face Solver:  ${timings.server.face?.toFixed(2)} ms`);
      console.log(`     └─ Geometry:     ${timings.server.geometry?.toFixed(2)} ms`);
    }
    console.log(`🔧 Render:    ${timings.server.render?.toFixed(2)} ms`);
    console.log(`🐍 Total:     ${timings.server.total?.toFixed(2)} ms`);
  }
  console.log(`📡 IPC call total:    ${timings.ipcCall.toFixed(2)} ms`);
  console.log(`📦 Binary parse:      ${timings.binaryParse.toFixed(2)} ms`);
  console.log(`⏱️  Total:            ${timings.totalFrontend.toFixed(2)} ms`);
  console.log(`📊 Panels: ${data.panels.length}, Payload: ${(result.byteLength / 1024).toFixed(1)} KB`);
  console.groupEnd();
  
  data.timings = timings;
  return data;
}

/**
 * Fetch and parse binary geometry from API
 * @param {string} xml - GXML content
 * @returns {Promise<Object>} Parsed geometry data with timing info
 */
export async function fetchBinaryGeometry(xml) {
  // Use Electron IPC if available (much faster, no HTTP overhead)
  if (hasElectronAPI()) {
    return processGxmlViaElectron(xml);
  }
  
  // Fall back to HTTP API for web browser
  const timings = {};
  const t0 = performance.now();
  
  const apiUrl = await buildApiUrl('/api/render');
  const response = await fetch(apiUrl, {
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
    measure: parseFloat(response.headers.get('X-Timing-Measure') || '0'),
    prelayout: parseFloat(response.headers.get('X-Timing-Prelayout') || '0'),
    layout: parseFloat(response.headers.get('X-Timing-Layout') || '0'),
    postlayout: parseFloat(response.headers.get('X-Timing-Postlayout') || '0'),
    render: parseFloat(response.headers.get('X-Timing-Render') || '0'),
    // Solver breakdown (nested within post-layout)
    intersection: parseFloat(response.headers.get('X-Timing-Intersection') || '0'),
    face: parseFloat(response.headers.get('X-Timing-Face') || '0'),
    geometry: parseFloat(response.headers.get('X-Timing-Geometry') || '0'),
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
  console.log(`   Parse:          ${timings.server.parse.toFixed(2)} ms`);
  console.log(`   Measure:        ${timings.server.measure.toFixed(2)} ms`);
  console.log(`   Pre-layout:     ${timings.server.prelayout.toFixed(2)} ms`);
  console.log(`   Layout:         ${timings.server.layout.toFixed(2)} ms`);
  console.log(`   Post-layout:    ${timings.server.postlayout.toFixed(2)} ms`);
  if (timings.server.intersection > 0 || timings.server.face > 0 || timings.server.geometry > 0) {
    console.log(`     ├─ Intersection: ${timings.server.intersection.toFixed(2)} ms`);
    console.log(`     ├─ Face Solver:  ${timings.server.face.toFixed(2)} ms`);
    console.log(`     └─ Geometry:     ${timings.server.geometry.toFixed(2)} ms`);
  }
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
