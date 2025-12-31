/**
 * Geometry creation utilities - meshes, labels, and vertex markers
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer';
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
  
  const baseSize = VERTEX_BASE_SIZE * scale;
  const sphereGeometry = new THREE.SphereGeometry(baseSize, VERTEX_SPHERE_SEGMENTS, VERTEX_SPHERE_SEGMENTS);
  const sphereMaterial = new THREE.MeshBasicMaterial({ color: COLORS.vertexDefault });
  
  uniqueVertices.forEach((v) => {
    const sphere = new THREE.Mesh(sphereGeometry.clone(), sphereMaterial.clone());
    sphere.position.set(v.x, v.y, v.z);
    sphere.userData.isVertex = true;
    sphere.userData.vertexIndex = v.index;
    sphere.userData.baseColor = new THREE.Color(COLORS.vertexDefault);
    sphere.userData.baseScale = scale;
    sphere.visible = visible;
    vertexGroup.add(sphere);
  });
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
