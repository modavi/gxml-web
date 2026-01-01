/**
 * SnapHelper - Handles snapping to existing panels in creation mode
 * 
 * Features:
 * - Snap to any point along a panel's centerline
 * - Weighted snap points at 0 (start), 0.5 (middle), 1.0 (end)
 * - Visual feedback on snapped panel
 * - Returns span-id and span-point for the new panel
 */
import * as THREE from 'three'
import { BLOOM_LAYER } from './constants'

// Snap configuration
export const SNAP_CONFIG = {
  // Maximum distance to snap (in world units)
  snapRadius: 0.3,
  
  // Extra weight for special points (lower = higher priority)
  // These are multipliers for the effective distance
  weightedPoints: {
    0.0: 0.5,   // Start point - half the distance = higher priority
    0.5: 0.6,   // Midpoint - slightly higher priority
    1.0: 0.5,   // End point - half the distance = higher priority
  },
  
  // Visual feedback colors - cyan for general snaps
  snapHighlightColor: 0x00ffff,
  snapHighlightEmissive: 0x00aaaa,
  
  // Golden/yellow for weighted snap points (start, mid, end)
  weightedSnapColor: 0xffcc00,
  weightedSnapEmissive: 0xaa8800,
}

/**
 * Calculate the closest point on a line segment to a given point
 * @param {THREE.Vector3} point - The point to find closest to
 * @param {THREE.Vector3} lineStart - Start of line segment
 * @param {THREE.Vector3} lineEnd - End of line segment
 * @returns {{ point: THREE.Vector3, t: number }} - Closest point and parameter t (0-1)
 */
function closestPointOnSegment(point, lineStart, lineEnd) {
  const line = new THREE.Vector3().subVectors(lineEnd, lineStart)
  const lineLength = line.length()
  
  if (lineLength < 0.0001) {
    // Degenerate line segment
    return { point: lineStart.clone(), t: 0 }
  }
  
  const lineDir = line.clone().normalize()
  const toPoint = new THREE.Vector3().subVectors(point, lineStart)
  
  // Project point onto line
  let t = toPoint.dot(lineDir) / lineLength
  
  // Clamp to segment
  t = Math.max(0, Math.min(1, t))
  
  const closestPoint = lineStart.clone().add(lineDir.multiplyScalar(t * lineLength))
  
  return { point: closestPoint, t }
}

/**
 * SnapHelper class - manages snapping during creation mode
 */
export class SnapHelper {
  constructor(scene) {
    this.scene = scene
    this.highlightedMeshes = []  // Meshes we've modified for snap highlight
    this.originalMaterials = new Map()  // Store original materials for restoration
    this.snapIndicator = null  // Visual indicator at snap point (general)
    this.snapRing = null       // Ring around snap point for better visibility
    this.weightedIndicator = null  // Diamond indicator for weighted snap points
    this.currentSnap = null  // Current snap result
  }

  /**
   * Create a visual snap indicator (small sphere at snap point)
   * @private
   */
  _createSnapIndicator() {
    if (this.snapIndicator) return
    
    // Main indicator sphere - larger and brighter
    const geometry = new THREE.SphereGeometry(0.06, 16, 16)
    const material = new THREE.MeshBasicMaterial({
      color: SNAP_CONFIG.snapHighlightColor,
      transparent: true,
      opacity: 1.0,
      depthTest: false,  // Always render on top
    })
    this.snapIndicator = new THREE.Mesh(geometry, material)
    this.snapIndicator.renderOrder = 999  // Render last
    this.snapIndicator.layers.enable(BLOOM_LAYER)  // Add glow
    this.snapIndicator.visible = false
    this.scene.add(this.snapIndicator)
    
    // Ring indicator for better visibility (general snap)
    const ringGeometry = new THREE.RingGeometry(0.08, 0.12, 32)
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: SNAP_CONFIG.snapHighlightColor,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthTest: false,  // Always render on top
    })
    this.snapRing = new THREE.Mesh(ringGeometry, ringMaterial)
    this.snapRing.rotation.x = -Math.PI / 2  // Lay flat on XZ plane
    this.snapRing.renderOrder = 998
    this.snapRing.layers.enable(BLOOM_LAYER)  // Add glow
    this.snapRing.visible = false
    this.scene.add(this.snapRing)
    
    // Diamond indicator for weighted snap points (start, mid, end)
    // Create an octahedron (diamond shape) for special snap points
    const diamondGeometry = new THREE.OctahedronGeometry(0.08, 0)
    const diamondMaterial = new THREE.MeshBasicMaterial({
      color: SNAP_CONFIG.weightedSnapColor,
      transparent: true,
      opacity: 1.0,
      depthTest: false,
    })
    this.weightedIndicator = new THREE.Mesh(diamondGeometry, diamondMaterial)
    this.weightedIndicator.renderOrder = 1000
    this.weightedIndicator.layers.enable(BLOOM_LAYER)
    this.weightedIndicator.visible = false
    this.scene.add(this.weightedIndicator)
  }

  /**
   * Find the best snap target for a given mouse position
   * @param {THREE.Vector3} mousePoint - Mouse position in world space (XZ plane)
   * @param {Object} geometryData - The geometry data with panel info
   * @param {number|null} excludePanelIndex - Panel index to exclude (the source panel)
   * @returns {Object|null} - Snap result { panelIndex, spanPoint, worldPoint, distance }
   */
  findSnapTarget(mousePoint, geometryData, excludePanelIndex = null) {
    if (!geometryData?.panels) return null
    
    let bestSnap = null
    let bestEffectiveDistance = Infinity
    
    // Group panels by their numeric index (before the dash)
    const panelsByIndex = new Map()
    for (const panel of geometryData.panels) {
      if (!panel.startPoint || !panel.endPoint) continue
      
      // Extract panel index from id (e.g., "0-front" -> 0)
      const match = panel.id?.match(/^(\d+)-/)
      if (!match) continue
      
      const panelIndex = parseInt(match[1], 10)
      
      // Skip the excluded panel (source panel)
      if (panelIndex === excludePanelIndex) continue
      
      // Only store one entry per panel index (they all have same start/end points)
      if (!panelsByIndex.has(panelIndex)) {
        panelsByIndex.set(panelIndex, {
          index: panelIndex,
          startPoint: new THREE.Vector3(panel.startPoint[0], panel.startPoint[1], panel.startPoint[2]),
          endPoint: new THREE.Vector3(panel.endPoint[0], panel.endPoint[1], panel.endPoint[2]),
        })
      }
    }
    
    // Check each panel
    for (const [panelIndex, panelInfo] of panelsByIndex) {
      const { startPoint, endPoint } = panelInfo
      
      // Project mouse point to the Y level of the panel for fair comparison
      const mouseAtPanelY = new THREE.Vector3(mousePoint.x, startPoint.y, mousePoint.z)
      
      // Find closest point on panel centerline
      const { point: closestPoint, t } = closestPointOnSegment(mouseAtPanelY, startPoint, endPoint)
      
      // Calculate distance in XZ plane (ignore Y difference for snapping)
      const dx = mousePoint.x - closestPoint.x
      const dz = mousePoint.z - closestPoint.z
      const distance = Math.sqrt(dx * dx + dz * dz)
      
      // Skip if outside snap radius
      if (distance > SNAP_CONFIG.snapRadius) continue
      
      // Calculate effective distance with weighting for special points
      let effectiveDistance = distance
      let snappedT = t
      
      // Check if we're close to a weighted point
      for (const [weightT, weightMultiplier] of Object.entries(SNAP_CONFIG.weightedPoints)) {
        const targetT = parseFloat(weightT)
        const tDistance = Math.abs(t - targetT)
        
        // If within 15% of a weighted point, snap to it
        if (tDistance < 0.15) {
          // Calculate world distance to this weighted point
          const weightedPoint = startPoint.clone().lerp(endPoint, targetT)
          const wdx = mousePoint.x - weightedPoint.x
          const wdz = mousePoint.z - weightedPoint.z
          const weightedDistance = Math.sqrt(wdx * wdx + wdz * wdz)
          
          // Only use weighted snap if it's still within snap radius
          if (weightedDistance <= SNAP_CONFIG.snapRadius) {
            const weightedEffective = weightedDistance * weightMultiplier
            if (weightedEffective < effectiveDistance) {
              effectiveDistance = weightedEffective
              snappedT = targetT
            }
          }
        }
      }
      
      // Check if this is the best snap so far
      if (effectiveDistance < bestEffectiveDistance) {
        bestEffectiveDistance = effectiveDistance
        
        // Calculate the actual world point at snapped T
        const worldPoint = startPoint.clone().lerp(endPoint, snappedT)
        
        // Check if snapped to a weighted point
        const isWeighted = Object.keys(SNAP_CONFIG.weightedPoints)
          .map(parseFloat)
          .includes(snappedT)
        
        bestSnap = {
          panelIndex,
          spanPoint: Math.round(snappedT * 1000) / 1000,  // Round to 3 decimal places
          worldPoint,
          distance: effectiveDistance,
          isWeighted,
        }
      }
    }
    
    return bestSnap
  }

  /**
   * Update visual feedback based on snap result
   * @param {Object|null} snapResult - Result from findSnapTarget
   * @param {THREE.Group} geometryGroup - The geometry group containing panel meshes
   */
  updateVisuals(snapResult, geometryGroup) {
    // Restore any previously highlighted meshes
    this._restoreHighlights()
    
    // Hide all snap indicators if no snap
    if (!snapResult) {
      if (this.snapIndicator) {
        this.snapIndicator.visible = false
      }
      if (this.snapRing) {
        this.snapRing.visible = false
      }
      if (this.weightedIndicator) {
        this.weightedIndicator.visible = false
      }
      this.currentSnap = null
      return
    }
    
    this.currentSnap = snapResult
    
    // Create indicators if needed
    this._createSnapIndicator()
    
    // Show different indicator based on whether it's a weighted snap point
    if (snapResult.isWeighted) {
      // Show golden diamond for weighted points (start, mid, end)
      this.weightedIndicator.position.copy(snapResult.worldPoint)
      this.weightedIndicator.visible = true
      this.snapIndicator.visible = false
      this.snapRing.visible = false
    } else {
      // Show cyan sphere + ring for arbitrary points along centerline
      this.snapIndicator.position.copy(snapResult.worldPoint)
      this.snapIndicator.visible = true
      this.snapRing.position.copy(snapResult.worldPoint)
      this.snapRing.visible = true
      this.weightedIndicator.visible = false
    }
    
    // Find and highlight the panel meshes
    if (geometryGroup) {
      const targetPanelId = String(snapResult.panelIndex)
      
      geometryGroup.traverse((child) => {
        if (child.isMesh && child.userData.panelId !== undefined) {
          // panelId is stored as just the number (e.g., "0" not "0-front")
          const childPanelId = String(child.userData.panelId)
          if (childPanelId === targetPanelId) {
            this._highlightMesh(child)
          }
        }
      })
    }
  }

  /**
   * Highlight a mesh to show it's a snap target
   * @private
   */
  _highlightMesh(mesh) {
    if (!mesh.material) return
    
    // Store original material
    this.originalMaterials.set(mesh, mesh.material.clone())
    this.highlightedMeshes.push(mesh)
    
    // Modify material for highlight
    if (mesh.material.emissive) {
      mesh.material.emissive.setHex(SNAP_CONFIG.snapHighlightEmissive)
      mesh.material.emissiveIntensity = 0.3
    }
    
    // Add slight tint
    if (mesh.material.color) {
      const originalColor = mesh.material.color.clone()
      const highlightColor = new THREE.Color(SNAP_CONFIG.snapHighlightColor)
      mesh.material.color.lerp(highlightColor, 0.2)
    }
  }

  /**
   * Restore all highlighted meshes to their original materials
   * @private
   */
  _restoreHighlights() {
    for (const mesh of this.highlightedMeshes) {
      const original = this.originalMaterials.get(mesh)
      if (original && mesh.material) {
        // Restore original properties
        if (mesh.material.emissive && original.emissive) {
          mesh.material.emissive.copy(original.emissive)
          mesh.material.emissiveIntensity = original.emissiveIntensity || 0
        }
        if (mesh.material.color && original.color) {
          mesh.material.color.copy(original.color)
        }
      }
    }
    
    this.highlightedMeshes = []
    this.originalMaterials.clear()
  }

  /**
   * Get the current snap result
   * @returns {Object|null}
   */
  getSnap() {
    return this.currentSnap
  }

  /**
   * Clear all snap state and visuals
   */
  clear() {
    this._restoreHighlights()
    if (this.snapIndicator) {
      this.snapIndicator.visible = false
    }
    if (this.snapRing) {
      this.snapRing.visible = false
    }
    if (this.weightedIndicator) {
      this.weightedIndicator.visible = false
    }
    this.currentSnap = null
  }

  /**
   * Dispose of all resources
   */
  dispose() {
    this.clear()
    
    if (this.snapIndicator) {
      this.scene.remove(this.snapIndicator)
      this.snapIndicator.geometry?.dispose()
      this.snapIndicator.material?.dispose()
      this.snapIndicator = null
    }
    
    if (this.snapRing) {
      this.scene.remove(this.snapRing)
      this.snapRing.geometry?.dispose()
      this.snapRing.material?.dispose()
      this.snapRing = null
    }
    
    if (this.weightedIndicator) {
      this.scene.remove(this.weightedIndicator)
      this.weightedIndicator.geometry?.dispose()
      this.weightedIndicator.material?.dispose()
      this.weightedIndicator = null
    }
  }
}
