/**
 * Geometry creation utilities - meshes, labels, and vertex markers
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer';
import { mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils';
import { COLORS, VERTEX_BASE_SIZE, VERTEX_SPHERE_SEGMENTS } from './constants';

/**
 * Clears all children from a group and disposes resources
 * @param {THREE.Group} group
 */
export function clearGroup(group) {
  if (!group) return;
  while (group.children.length > 0) {
    const child = group.children[0];
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose());
      } else {
        child.material.dispose();
      }
    }
    if (child.element) {
      child.element.remove();
    }
    group.remove(child);
  }
}

/**
 * Creates meshes from indexed geometry (fast binary format)
 * @param {Object} geometryData - Indexed geometry data with vertices/indices
 * @param {string} viewMode - 'lit', 'unlit', 'xray', 'wireframe'
 * @param {string} colorMode - 'uniform' or 'per-face'
 * @returns {{fillMesh: THREE.Mesh, edgeMesh: THREE.LineSegments, faceMap: Map}}
 */
export function createIndexedMeshes(geometryData, viewMode, colorMode) {
  const { vertices, indices, panelIds, panelColors } = geometryData;
  
  if (!vertices || vertices.length === 0) return null;
  
  // Build vertex colors based on panel ownership
  // Fast format has 4 vertices per quad, 6 indices per quad (2 triangles)
  const quadCount = indices.length / 6;
  const colors = new Float32Array(vertices.length);
  
  // Build face map for raycasting
  const faceMap = new Map();
  
  // Assign colors per-quad
  const uniformColor = colorMode === 'uniform' ? [0.533, 0.533, 0.533] : null;
  
  for (let q = 0; q < quadCount; q++) {
    const panelId = panelIds[q];
    const rgb = uniformColor || panelColors.get(panelId) || [0.533, 0.533, 0.533];
    
    // Each quad uses 4 consecutive vertices
    const baseVertex = q * 4;
    for (let v = 0; v < 4; v++) {
      const idx = (baseVertex + v) * 3;
      colors[idx] = rgb[0];
      colors[idx + 1] = rgb[1];
      colors[idx + 2] = rgb[2];
    }
    
    // Map triangles to panel info (2 triangles per quad)
    const faceColor = new THREE.Color(rgb[0], rgb[1], rgb[2]);
    faceMap.set(q * 2, { panelId, faceId: `${panelId}-quad${q}`, color: faceColor });
    faceMap.set(q * 2 + 1, { panelId, faceId: `${panelId}-quad${q}`, color: faceColor });
  }
  
  // Create fill geometry directly from indexed data
  const fillGeometry = new THREE.BufferGeometry();
  fillGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  fillGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  fillGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
  fillGeometry.computeVertexNormals();
  
  // Create fill material
  let fillMaterial;
  if (viewMode === 'lit') {
    fillMaterial = new THREE.MeshPhongMaterial({
      vertexColors: true,
      flatShading: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
  } else if (viewMode === 'unlit') {
    fillMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
  } else if (viewMode === 'xray') {
    fillMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
  } else {
    fillMaterial = new THREE.MeshBasicMaterial({ visible: false, vertexColors: true });
  }
  
  const fillMesh = new THREE.Mesh(fillGeometry, fillMaterial);
  fillMesh.userData.isBatchedFill = true;
  fillMesh.userData.faceMap = faceMap;
  
  // Create edge geometry from quad boundaries
  // Each quad has 4 edges (but shared edges would be duplicated, which is fine for now)
  const edgePositions = new Float32Array(quadCount * 4 * 2 * 3); // 4 edges * 2 vertices * 3 coords
  const edgeColors = new Float32Array(quadCount * 4 * 2 * 3);
  const edgeColor = viewMode === 'wireframe' ? null : [0.102, 0.102, 0.102]; // #1a1a1a
  
  let edgeOffset = 0;
  for (let q = 0; q < quadCount; q++) {
    const baseVertex = q * 4;
    const ec = edgeColor || panelColors.get(panelIds[q]) || [0.102, 0.102, 0.102];
    
    // 4 edges: 0-1, 1-2, 2-3, 3-0
    const edgePairs = [[0, 1], [1, 2], [2, 3], [3, 0]];
    for (const [a, b] of edgePairs) {
      const i1 = (baseVertex + a) * 3;
      const i2 = (baseVertex + b) * 3;
      
      edgePositions[edgeOffset] = vertices[i1];
      edgePositions[edgeOffset + 1] = vertices[i1 + 1];
      edgePositions[edgeOffset + 2] = vertices[i1 + 2];
      edgeColors[edgeOffset] = ec[0];
      edgeColors[edgeOffset + 1] = ec[1];
      edgeColors[edgeOffset + 2] = ec[2];
      edgeOffset += 3;
      
      edgePositions[edgeOffset] = vertices[i2];
      edgePositions[edgeOffset + 1] = vertices[i2 + 1];
      edgePositions[edgeOffset + 2] = vertices[i2 + 2];
      edgeColors[edgeOffset] = ec[0];
      edgeColors[edgeOffset + 1] = ec[1];
      edgeColors[edgeOffset + 2] = ec[2];
      edgeOffset += 3;
    }
  }
  
  const edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute('position', new THREE.BufferAttribute(edgePositions, 3));
  edgeGeometry.setAttribute('color', new THREE.BufferAttribute(edgeColors, 3));
  
  const edgeOpacity = viewMode === 'xray' ? 0.3 : 1.0;
  const edgeMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    opacity: edgeOpacity,
    transparent: edgeOpacity < 1.0,
  });
  
  const edgeMesh = new THREE.LineSegments(edgeGeometry, edgeMaterial);
  edgeMesh.userData.isBatchedEdge = true;
  
  return { fillMesh, edgeMesh, faceMap };
}

/**
 * Creates a single merged mesh from all panels - MUCH faster GPU upload
 * Uses vertex colors for per-face coloring, single draw call
 * @param {Object} geometryData - Geometry data with panels array
 * @param {string} viewMode - 'lit', 'unlit', 'xray', 'wireframe'
 * @param {string} colorMode - 'uniform' or 'per-face'
 * @returns {{fillMesh: THREE.Mesh, edgeMesh: THREE.LineSegments, faceMap: Map}}
 */
export function createBatchedMeshes(geometryData, viewMode, colorMode) {
  // Check if this is indexed geometry (fast format)
  if (geometryData.format === 'indexed') {
    return createIndexedMeshes(geometryData, viewMode, colorMode);
  }
  
  const panels = geometryData.panels;
  if (!panels || panels.length === 0) return null;
  
  // Pre-calculate total sizes for single allocation
  let totalVertices = 0;
  let totalIndices = 0;
  let totalEdgeVertices = 0;
  
  for (const panel of panels) {
    if (!panel.points || panel.points.length < 3) continue;
    const n = panel.points.length;
    totalVertices += n;
    totalIndices += (n - 2) * 6; // 2 triangles per fan segment, double-sided
    totalEdgeVertices += n * 2; // 2 vertices per edge
  }
  
  // Pre-allocate typed arrays
  const positions = new Float32Array(totalVertices * 3);
  const colors = new Float32Array(totalVertices * 3);
  const indices = new Uint32Array(totalIndices);
  const edgePositions = new Float32Array(totalEdgeVertices * 3);
  const edgeColors = new Float32Array(totalEdgeVertices * 3);
  
  // Map from triangle index to face data for raycasting
  const faceMap = new Map(); // triangleIndex -> {panelId, faceId}
  
  let vertexOffset = 0;
  let indexOffset = 0;
  let edgeVertexOffset = 0;
  let triangleIndex = 0;
  
  const uniformColor = colorMode === 'uniform' ? new THREE.Color(0x888888) : null;
  
  for (const panel of panels) {
    const { points, color, id } = panel;
    if (!points || points.length < 3) continue;
    
    const panelId = id ? id.split('-')[0] : null;
    const faceColor = uniformColor || (color ? new THREE.Color(color) : new THREE.Color(0x888888));
    
    // Add vertices with colors
    const baseVertex = vertexOffset / 3;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      positions[vertexOffset] = p[0];
      positions[vertexOffset + 1] = p[1];
      positions[vertexOffset + 2] = p[2] || 0;
      colors[vertexOffset] = faceColor.r;
      colors[vertexOffset + 1] = faceColor.g;
      colors[vertexOffset + 2] = faceColor.b;
      vertexOffset += 3;
    }
    
    // Add triangle indices (fan triangulation, double-sided)
    for (let i = 1; i < points.length - 1; i++) {
      // Front face
      indices[indexOffset++] = baseVertex;
      indices[indexOffset++] = baseVertex + i;
      indices[indexOffset++] = baseVertex + i + 1;
      // Store face mapping for this triangle
      faceMap.set(triangleIndex++, { panelId, faceId: id, color: faceColor });
      
      // Back face
      indices[indexOffset++] = baseVertex;
      indices[indexOffset++] = baseVertex + i + 1;
      indices[indexOffset++] = baseVertex + i;
      faceMap.set(triangleIndex++, { panelId, faceId: id, color: faceColor });
    }
    
    // Add edge vertices
    const edgeColor = viewMode === 'wireframe' ? faceColor : new THREE.Color(0x1a1a1a);
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      
      edgePositions[edgeVertexOffset] = p1[0];
      edgePositions[edgeVertexOffset + 1] = p1[1];
      edgePositions[edgeVertexOffset + 2] = p1[2] || 0;
      edgeColors[edgeVertexOffset] = edgeColor.r;
      edgeColors[edgeVertexOffset + 1] = edgeColor.g;
      edgeColors[edgeVertexOffset + 2] = edgeColor.b;
      edgeVertexOffset += 3;
      
      edgePositions[edgeVertexOffset] = p2[0];
      edgePositions[edgeVertexOffset + 1] = p2[1];
      edgePositions[edgeVertexOffset + 2] = p2[2] || 0;
      edgeColors[edgeVertexOffset] = edgeColor.r;
      edgeColors[edgeVertexOffset + 1] = edgeColor.g;
      edgeColors[edgeVertexOffset + 2] = edgeColor.b;
      edgeVertexOffset += 3;
    }
  }
  
  // Create fill geometry
  const fillGeometry = new THREE.BufferGeometry();
  fillGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  fillGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  fillGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
  fillGeometry.computeVertexNormals();
  
  // Create fill material with vertex colors
  let fillMaterial;
  if (viewMode === 'lit') {
    fillMaterial = new THREE.MeshPhongMaterial({
      vertexColors: true,
      flatShading: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
  } else if (viewMode === 'unlit') {
    fillMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
  } else if (viewMode === 'xray') {
    fillMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
  } else {
    fillMaterial = new THREE.MeshBasicMaterial({ visible: false, vertexColors: true });
  }
  
  const fillMesh = new THREE.Mesh(fillGeometry, fillMaterial);
  fillMesh.userData.isBatchedFill = true;
  fillMesh.userData.faceMap = faceMap;
  
  // Create edge geometry
  const edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute('position', new THREE.BufferAttribute(edgePositions, 3));
  edgeGeometry.setAttribute('color', new THREE.BufferAttribute(edgeColors, 3));
  
  const edgeOpacity = viewMode === 'xray' ? 0.3 : 1.0;
  const edgeMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    opacity: edgeOpacity,
    transparent: edgeOpacity < 1.0,
  });
  
  const edgeMesh = new THREE.LineSegments(edgeGeometry, edgeMaterial);
  edgeMesh.userData.isBatchedEdge = true;
  
  return { fillMesh, edgeMesh, faceMap };
}

/**
 * Creates a mesh from polygon panel data
 * @param {Object} panel - Panel data with points, color, id
 * @param {string} viewMode - 'lit', 'unlit', 'xray', 'wireframe'
 * @param {string} colorMode - 'uniform' or 'per-face'
 * @returns {THREE.Mesh|null}
 */
export function createPolygonMesh(panel, viewMode, colorMode) {
  const { points, color, id } = panel;
  
  if (!points || points.length < 3) return null;
  
  // Extract panel index from face id (e.g., "0-front" -> "0")
  const panelId = id ? id.split('-')[0] : null;
  
  const geometry = new THREE.BufferGeometry();
  
  const vertices = [];
  for (const p of points) {
    vertices.push(p[0], p[1], p[2] || 0);
  }
  
  const indices = [];
  for (let i = 1; i < points.length - 1; i++) {
    indices.push(0, i, i + 1);
    indices.push(0, i + 1, i);
  }
  
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  
  let materialColor;
  if (colorMode === 'uniform') {
    materialColor = new THREE.Color(0x888888);
  } else {
    materialColor = color ? new THREE.Color(color) : new THREE.Color(0x888888);
  }
  
  let material;
  if (viewMode === 'lit') {
    material = new THREE.MeshPhongMaterial({
      color: materialColor,
      flatShading: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
  } else if (viewMode === 'unlit') {
    material = new THREE.MeshBasicMaterial({
      color: materialColor,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
  } else if (viewMode === 'xray') {
    material = new THREE.MeshBasicMaterial({
      color: materialColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
  } else {
    material = new THREE.MeshBasicMaterial({ visible: false });
  }
  
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.isFill = true;
  mesh.userData.baseColor = materialColor;
  mesh.userData.panelId = panelId;
  mesh.userData.faceId = id;
  
  // Create edge lines
  const edgeLines = createEdgeLines(points, viewMode, materialColor);
  mesh.add(edgeLines);
  
  return mesh;
}

/**
 * Creates edge lines for a polygon
 * @param {Array} points - Array of [x, y, z] points
 * @param {string} viewMode
 * @param {THREE.Color} materialColor
 * @returns {THREE.LineSegments}
 */
export function createEdgeLines(points, viewMode, materialColor) {
  const edgeVertices = [];
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    edgeVertices.push(p1[0], p1[1], p1[2] || 0);
    edgeVertices.push(p2[0], p2[1], p2[2] || 0);
  }
  
  const edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edgeVertices, 3));
  
  let edgeColor, edgeOpacity;
  if (viewMode === 'wireframe') {
    edgeColor = materialColor;
    edgeOpacity = 1.0;
  } else if (viewMode === 'xray') {
    edgeColor = 0x000000;
    edgeOpacity = 0.3;
  } else {
    edgeColor = 0x1a1a1a;
    edgeOpacity = 1.0;
  }
  
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: edgeColor,
    opacity: edgeOpacity,
    transparent: edgeOpacity < 1.0,
  });
  
  const edgeLines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
  edgeLines.userData.isEdge = true;
  edgeLines.userData.baseColor = materialColor;
  
  return edgeLines;
}

/**
 * Creates CSS2D labels for panels
 * @param {Object} geometryData - Geometry data with panels array
 * @param {THREE.Group} labelGroup - Group to add labels to
 */
export function createLabels(geometryData, labelGroup) {
  geometryData.panels.forEach((panel, idx) => {
    if (!panel.points || panel.points.length < 3) return;
    
    // Calculate centroid
    let cx = 0, cy = 0, cz = 0;
    panel.points.forEach((p) => {
      cx += p[0];
      cy += p[1];
      cz += p[2] || 0;
    });
    cx /= panel.points.length;
    cy /= panel.points.length;
    cz /= panel.points.length;
    
    const labelDiv = document.createElement('div');
    labelDiv.className = 'face-label';
    labelDiv.textContent = panel.id || `face_${idx}`;
    
    const label = new CSS2DObject(labelDiv);
    label.position.set(cx, cy, cz);
    labelGroup.add(label);
  });
}

/**
 * Creates vertex marker spheres
 * @param {Object} geometryData - Geometry data with panels array
 * @param {THREE.Group} vertexGroup - Group to add markers to
 * @param {boolean} visible - Initial visibility
 * @param {number} scale - Size scale
 */
export function createVertexMarkers(geometryData, vertexGroup, visible = true, scale = 1.0) {
  const uniqueVertices = [];
  const vertexMap = new Map();
  const TOLERANCE = 0.0001;
  
  const hashVertex = (x, y, z) => {
    const rx = Math.round(x / TOLERANCE) * TOLERANCE;
    const ry = Math.round(y / TOLERANCE) * TOLERANCE;
    const rz = Math.round(z / TOLERANCE) * TOLERANCE;
    return `${rx.toFixed(4)},${ry.toFixed(4)},${rz.toFixed(4)}`;
  };
  
  let globalIdx = 0;
  geometryData.panels.forEach((panel) => {
    if (!panel.points) return;
    panel.points.forEach((p) => {
      const hash = hashVertex(p[0], p[1], p[2] || 0);
      if (!vertexMap.has(hash)) {
        vertexMap.set(hash, globalIdx);
        uniqueVertices.push({ x: p[0], y: p[1], z: p[2] || 0, index: globalIdx });
        globalIdx++;
      }
    });
  });
  
  if (uniqueVertices.length === 0) return;
  
  // Use InstancedMesh for much better performance (single draw call)
  const baseSize = VERTEX_BASE_SIZE * scale;
  const sphereGeometry = new THREE.SphereGeometry(baseSize, VERTEX_SPHERE_SEGMENTS, VERTEX_SPHERE_SEGMENTS);
  const sphereMaterial = new THREE.MeshBasicMaterial({ color: COLORS.vertexDefault });
  
  const instancedMesh = new THREE.InstancedMesh(sphereGeometry, sphereMaterial, uniqueVertices.length);
  instancedMesh.userData.isVertexInstanced = true;
  instancedMesh.userData.vertexPositions = uniqueVertices; // Store for raycasting
  instancedMesh.userData.baseScale = scale;
  instancedMesh.visible = visible;
  
  const matrix = new THREE.Matrix4();
  uniqueVertices.forEach((v, i) => {
    matrix.setPosition(v.x, v.y, v.z);
    instancedMesh.setMatrixAt(i, matrix);
  });
  instancedMesh.instanceMatrix.needsUpdate = true;
  
  vertexGroup.add(instancedMesh);
  
  // Store vertex data on the group for selection lookup
  vertexGroup.userData.vertexMap = vertexMap;
  vertexGroup.userData.uniqueVertices = uniqueVertices;
}

/**
 * Applies selection highlight to a mesh
 * @param {THREE.Mesh} mesh
 */
export function applySelectionHighlight(mesh) {
  mesh.material.color.setHSL(0.08, 0.8, 0.5); // Vibrant orange
  if (mesh.material.emissive) {
    mesh.material.emissive.setHex(0x662800);
  }
}

/**
 * Applies hover highlight to a mesh
 * @param {THREE.Mesh} mesh
 */
export function applyHoverHighlight(mesh) {
  const baseColor = mesh.userData.baseColor;
  if (baseColor) {
    const hsl = {};
    baseColor.getHSL(hsl);
    mesh.material.color.setHSL(hsl.h, hsl.s, Math.min(1, hsl.l + 0.2));
  }
  if (mesh.material.emissive) {
    mesh.material.emissive.setHex(0x152030); // Blue tint
  }
}

/**
 * Resets mesh to base color
 * @param {THREE.Mesh} mesh
 */
export function resetToBaseColor(mesh) {
  if (mesh.userData.baseColor) {
    mesh.material.color.copy(mesh.userData.baseColor);
    if (mesh.material.emissive) {
      mesh.material.emissive.setHex(0x000000);
    }
  }
}
