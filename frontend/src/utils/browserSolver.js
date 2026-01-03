/**
 * Browser-based GXML Solver
 * 
 * Processes GXML XML and generates geometry entirely in the browser
 * using WebGPU for acceleration. No server required!
 * 
 * This is a simplified solver that handles basic panel layouts.
 * For full GXML support, use the Python backend.
 */

import { GXMLWebGPU, isWebGPUAvailable } from './webgpuShaders';

/**
 * Parse GXML XML string into panel data
 */
function parseGXML(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');
  
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('XML Parse Error: ' + parseError.textContent);
  }

  const panels = [];
  const panelElements = doc.querySelectorAll('panel');
  
  // Default values
  const defaults = {
    thickness: 0.25,
    height: 1.0,
    color: '#808080'
  };

  // Get root-level defaults
  const root = doc.documentElement;
  if (root.querySelector(':scope > panel')) {
    const rootPanel = root.querySelector(':scope > panel');
    if (rootPanel.hasAttribute('thickness')) {
      defaults.thickness = parseFloat(rootPanel.getAttribute('thickness'));
    }
    if (rootPanel.hasAttribute('height')) {
      defaults.height = parseFloat(rootPanel.getAttribute('height'));
    }
  }

  let panelIndex = 0;
  
  panelElements.forEach((el) => {
    // Skip template panels (direct children of root without position)
    if (el.parentElement === root && !el.hasAttribute('start') && !el.hasAttribute('end')) {
      return;
    }

    const panel = {
      id: el.getAttribute('id') || `panel_${panelIndex}`,
      start: parsePoint(el.getAttribute('start') || '0,0,0'),
      end: parsePoint(el.getAttribute('end') || '1,0,0'),
      thickness: parseFloat(el.getAttribute('thickness')) || defaults.thickness,
      height: parseFloat(el.getAttribute('height')) || defaults.height,
      color: el.getAttribute('color') || defaults.color
    };

    panels.push(panel);
    panelIndex++;
  });

  return { panels, defaults };
}

/**
 * Parse a point string "x,y,z" into [x, y, z]
 */
function parsePoint(str) {
  const parts = str.split(',').map(s => parseFloat(s.trim()));
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

/**
 * Generate box geometry for a panel (simplified, no mitering)
 */
function generatePanelGeometry(panel) {
  const { start, end, thickness, height } = panel;
  const halfT = thickness / 2;

  // Direction vector
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const dz = end[2] - start[2];
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  
  if (len < 1e-6) return { vertices: [], color: panel.color };

  // Normalize direction
  const dirX = dx / len;
  const dirY = dy / len;
  const dirZ = dz / len;

  // Perpendicular in XZ plane (assuming Y is up)
  const perpX = -dirZ;
  const perpZ = dirX;

  // 8 corners of the box
  const corners = [
    // Bottom face (y = start[1])
    [start[0] + perpX * halfT, start[1], start[2] + perpZ * halfT],
    [start[0] - perpX * halfT, start[1], start[2] - perpZ * halfT],
    [end[0] - perpX * halfT, end[1], end[2] - perpZ * halfT],
    [end[0] + perpX * halfT, end[1], end[2] + perpZ * halfT],
    // Top face (y = start[1] + height)
    [start[0] + perpX * halfT, start[1] + height, start[2] + perpZ * halfT],
    [start[0] - perpX * halfT, start[1] + height, start[2] - perpZ * halfT],
    [end[0] - perpX * halfT, end[1] + height, end[2] - perpZ * halfT],
    [end[0] + perpX * halfT, end[1] + height, end[2] + perpZ * halfT],
  ];

  // 6 faces, each as 2 triangles (36 vertices total for indexed, or we can use triangle strip)
  // Using simple triangle list for clarity
  const faceIndices = [
    // Bottom (y=0)
    [0, 1, 2], [0, 2, 3],
    // Top (y=height)
    [4, 6, 5], [4, 7, 6],
    // Front (positive perp)
    [0, 3, 7], [0, 7, 4],
    // Back (negative perp)
    [1, 5, 6], [1, 6, 2],
    // Start cap
    [0, 4, 5], [0, 5, 1],
    // End cap
    [3, 2, 6], [3, 6, 7],
  ];

  const vertices = [];
  for (const face of faceIndices) {
    for (const idx of face) {
      vertices.push(...corners[idx]);
    }
  }

  return {
    vertices: new Float32Array(vertices),
    color: panel.color
  };
}

/**
 * Browser-based GXML solver
 */
export class BrowserGXMLSolver {
  constructor() {
    this.gpu = null;
    this.gpuAvailable = false;
  }

  /**
   * Initialize the solver (loads WebGPU if available)
   */
  async init() {
    if (isWebGPUAvailable()) {
      try {
        this.gpu = new GXMLWebGPU();
        this.gpuAvailable = await this.gpu.init();
        console.log(`Browser GXML Solver initialized (WebGPU: ${this.gpuAvailable ? 'enabled' : 'disabled'})`);
      } catch (e) {
        console.warn('WebGPU initialization failed:', e);
        this.gpuAvailable = false;
      }
    } else {
      console.log('Browser GXML Solver initialized (WebGPU: not available)');
    }
    return this;
  }

  /**
   * Process GXML and return geometry data
   * 
   * @param {string} xmlString - GXML XML content
   * @returns {Object} Geometry data compatible with Three.js renderer
   */
  async solve(xmlString) {
    const t0 = performance.now();
    const timings = { parse: 0, intersections: 0, geometry: 0, total: 0 };

    // Parse XML
    const parseStart = performance.now();
    const { panels } = parseGXML(xmlString);
    timings.parse = performance.now() - parseStart;

    if (panels.length === 0) {
      return { panels: [], lines: [], timings };
    }

    // Find intersections (GPU accelerated if available)
    const intersectStart = performance.now();
    let intersections = [];
    
    if (this.gpuAvailable && panels.length > 1) {
      try {
        const panelData = panels.map(p => ({
          start: p.start,
          end: p.end
        }));
        intersections = await this.gpu.findIntersections(panelData);
      } catch (e) {
        console.warn('GPU intersection failed, using CPU:', e);
        intersections = this.cpuFindIntersections(panels);
      }
    } else if (panels.length > 1) {
      intersections = this.cpuFindIntersections(panels);
    }
    timings.intersections = performance.now() - intersectStart;

    // Generate geometry for each panel
    const geoStart = performance.now();
    const geometryPanels = panels.map((panel, index) => {
      const geo = generatePanelGeometry(panel);
      return {
        id: panel.id,
        panelIndex: index,
        vertices: geo.vertices,
        vertexCount: geo.vertices.length / 3,
        color: geo.color,
        colorRGB: hexToRGB(geo.color),
        // For Three.js BufferGeometry
        vertexBuffer: geo.vertices
      };
    });
    timings.geometry = performance.now() - geoStart;

    timings.total = performance.now() - t0;

    // Log timing summary
    console.group('🖥️ Browser GXML Solver');
    console.log(`📋 Parse:         ${timings.parse.toFixed(2)} ms`);
    console.log(`🔀 Intersections: ${timings.intersections.toFixed(2)} ms (${intersections.length} found, ${this.gpuAvailable ? 'GPU' : 'CPU'})`);
    console.log(`📐 Geometry:      ${timings.geometry.toFixed(2)} ms`);
    console.log(`⏱️ Total:         ${timings.total.toFixed(2)} ms`);
    console.log(`📊 Panels:        ${panels.length}`);
    console.groupEnd();

    return {
      panels: geometryPanels,
      lines: [],
      intersections,
      timings,
      _meta: {
        format: 'browser',
        gpuAccelerated: this.gpuAvailable,
        panelCount: panels.length,
        intersectionCount: intersections.length
      }
    };
  }

  /**
   * CPU fallback for intersection finding
   */
  cpuFindIntersections(panels) {
    const results = [];
    const tolerance = 1e-6;
    const tolSq = tolerance * tolerance;

    for (let i = 0; i < panels.length; i++) {
      for (let j = i + 1; j < panels.length; j++) {
        const p1 = panels[i].start;
        const p2 = panels[i].end;
        const p3 = panels[j].start;
        const p4 = panels[j].end;

        const d1 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
        const d2 = [p4[0] - p3[0], p4[1] - p3[1], p4[2] - p3[2]];
        const w = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]];

        const crossD = cross(d1, d2);
        const denom = dot(crossD, crossD);

        if (denom < tolSq) continue;

        const wcd2 = cross(w, d2);
        const t1 = dot(wcd2, crossD) / denom;
        if (t1 < -tolerance || t1 > 1 + tolerance) continue;

        const wcd1 = cross(w, d1);
        const t2 = dot(wcd1, crossD) / denom;
        if (t2 < -tolerance || t2 > 1 + tolerance) continue;

        const i1 = lerp3(p1, p2, t1);
        const i2 = lerp3(p3, p4, t2);
        const diff = [i1[0] - i2[0], i1[1] - i2[1], i1[2] - i2[2]];
        if (dot(diff, diff) >= tolSq) continue;

        results.push({
          panelI: i,
          panelJ: j,
          tI: t1,
          tJ: t2,
          position: i1,
          valid: 1
        });
      }
    }

    return results;
  }
}

// Vector math helpers
function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function lerp3(a, b, t) {
  return [
    a[0] + t * (b[0] - a[0]),
    a[1] + t * (b[1] - a[1]),
    a[2] + t * (b[2] - a[2])
  ];
}

function hexToRGB(hex) {
  if (!hex || hex[0] !== '#') return [0.5, 0.5, 0.5];
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
}

// Singleton instance
let solverInstance = null;

/**
 * Get the shared browser solver instance
 */
export async function getBrowserSolver() {
  if (!solverInstance) {
    solverInstance = new BrowserGXMLSolver();
    await solverInstance.init();
  }
  return solverInstance;
}

export default BrowserGXMLSolver;
