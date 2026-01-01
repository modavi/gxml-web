/**
 * AttachPointGizmo - A draggable handle along a panel's centerline
 * 
 * Used to:
 * 1. Set where new panels will attach FROM on the selected panel
 * 2. Edit existing panel's attach-point attribute
 * 
 * Visual: A cone/arrow pointing up at the attach point
 * Interaction: Drag along the panel's centerline (constrained to 0-1 range)
 */
import * as THREE from 'three'
import { BLOOM_LAYER } from './constants'

// Gizmo configuration
export const GIZMO_CONFIG = {
  // Colors
  handleColor: 0xff8800,        // Orange handle
  handleHoverColor: 0xffaa44,   // Brighter on hover
  handleDragColor: 0xffcc00,    // Yellow when dragging
  lineColor: 0xff8800,          // Centerline highlight
  
  // Sizes
  handleRadius: 0.05,
  handleHeight: 0.12,
  lineWidth: 0.01,
}

/**
 * AttachPointGizmo class - manages the attach point handle for a panel
 */
export class AttachPointGizmo {
  constructor(scene, camera, renderer, domElement) {
    this.scene = scene
    this.camera = camera
    this.renderer = renderer
    this.domElement = domElement
    
    this.handle = null           // The draggable cone mesh
    this.centerLine = null       // Line showing the panel centerline
    this.panelInfo = null        // { startPoint, endPoint, panelIndex, worldRotation }
    this.attachPoint = 1.0       // Current attach point (0-1), default to end
    
    this.isDragging = false
    this.isHovering = false
    
    // Bind methods (use pointer events to intercept OrbitControls)
    this._onPointerMove = this._onPointerMove.bind(this)
    this._onPointerDown = this._onPointerDown.bind(this)
    this._onPointerUp = this._onPointerUp.bind(this)
    
    // Raycaster for handle interaction
    this.raycaster = new THREE.Raycaster()
    this.mouse = new THREE.Vector2()
    
    // Callbacks
    this.onAttachPointChange = null  // Called when attach point changes during drag
    this.onDragEnd = null            // Called when drag ends (for saving to XML)
  }

  /**
   * Create the gizmo meshes
   * @private
   */
  _createMeshes() {
    if (this.handle) return
    
    // Create cone handle pointing up
    const coneGeometry = new THREE.ConeGeometry(
      GIZMO_CONFIG.handleRadius,
      GIZMO_CONFIG.handleHeight,
      8
    )
    // Rotate so cone points up and pivot is at bottom
    coneGeometry.translate(0, GIZMO_CONFIG.handleHeight / 2, 0)
    
    const coneMaterial = new THREE.MeshBasicMaterial({
      color: GIZMO_CONFIG.handleColor,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    })
    
    this.handle = new THREE.Mesh(coneGeometry, coneMaterial)
    this.handle.renderOrder = 1000
    this.handle.layers.enable(BLOOM_LAYER)
    this.handle.visible = false
    this.handle.userData.isGizmo = true
    this.scene.add(this.handle)
    
    // Create centerline indicator
    const lineGeometry = new THREE.BufferGeometry()
    const lineMaterial = new THREE.LineBasicMaterial({
      color: GIZMO_CONFIG.lineColor,
      transparent: true,
      opacity: 0.5,
      depthTest: false,
    })
    this.centerLine = new THREE.Line(lineGeometry, lineMaterial)
    this.centerLine.renderOrder = 999
    this.centerLine.visible = false
    this.scene.add(this.centerLine)
  }

  /**
   * Show the gizmo for a specific panel
   * @param {Object} panelInfo - { startPoint: [x,y,z], endPoint: [x,y,z], panelIndex, worldRotation }
   * @param {number} initialAttachPoint - Initial attach point (0-1)
   */
  show(panelInfo, initialAttachPoint = 1.0) {
    this._createMeshes()
    
    this.panelInfo = panelInfo
    this.attachPoint = initialAttachPoint
    
    // Update centerline geometry
    const start = new THREE.Vector3(panelInfo.startPoint[0], panelInfo.startPoint[1], panelInfo.startPoint[2])
    const end = new THREE.Vector3(panelInfo.endPoint[0], panelInfo.endPoint[1], panelInfo.endPoint[2])
    
    this.centerLine.geometry.dispose()
    this.centerLine.geometry = new THREE.BufferGeometry().setFromPoints([start, end])
    this.centerLine.visible = true
    
    // Position handle
    this._updateHandlePosition()
    this.handle.visible = true
    
    // Add event listeners (capture phase to intercept before OrbitControls)
    this.domElement.addEventListener('pointermove', this._onPointerMove, true)
    this.domElement.addEventListener('pointerdown', this._onPointerDown, true)
    this.domElement.addEventListener('pointerup', this._onPointerUp, true)
  }

  /**
   * Hide the gizmo
   */
  hide() {
    if (this.handle) {
      this.handle.visible = false
    }
    if (this.centerLine) {
      this.centerLine.visible = false
    }
    
    this.panelInfo = null
    this.isDragging = false
    this.isHovering = false
    
    // Remove event listeners
    this.domElement.removeEventListener('pointermove', this._onPointerMove, true)
    this.domElement.removeEventListener('pointerdown', this._onPointerDown, true)
    this.domElement.removeEventListener('pointerup', this._onPointerUp, true)
  }

  /**
   * Update the handle position based on current attach point
   * @private
   */
  _updateHandlePosition() {
    if (!this.panelInfo || !this.handle) return
    
    const start = new THREE.Vector3(
      this.panelInfo.startPoint[0],
      this.panelInfo.startPoint[1],
      this.panelInfo.startPoint[2]
    )
    const end = new THREE.Vector3(
      this.panelInfo.endPoint[0],
      this.panelInfo.endPoint[1],
      this.panelInfo.endPoint[2]
    )
    
    // Lerp between start and end
    const position = start.clone().lerp(end, this.attachPoint)
    this.handle.position.copy(position)
  }

  /**
   * Get the world position of the current attach point
   * @returns {THREE.Vector3|null}
   */
  getAttachWorldPosition() {
    if (!this.panelInfo) return null
    
    const start = new THREE.Vector3(
      this.panelInfo.startPoint[0],
      this.panelInfo.startPoint[1],
      this.panelInfo.startPoint[2]
    )
    const end = new THREE.Vector3(
      this.panelInfo.endPoint[0],
      this.panelInfo.endPoint[1],
      this.panelInfo.endPoint[2]
    )
    
    return start.clone().lerp(end, this.attachPoint)
  }

  /**
   * Get current attach point value
   * @returns {number}
   */
  getAttachPoint() {
    return this.attachPoint
  }

  /**
   * Set attach point programmatically
   * @param {number} value - 0-1 value
   */
  setAttachPoint(value) {
    this.attachPoint = Math.max(0, Math.min(1, value))
    this._updateHandlePosition()
  }

  /**
   * Check if a point is near the gizmo handle
   * @private
   */
  _isOverHandle(event) {
    if (!this.handle?.visible) return false
    
    const rect = this.domElement.getBoundingClientRect()
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    
    this.raycaster.setFromCamera(this.mouse, this.camera)
    
    const intersects = this.raycaster.intersectObject(this.handle)
    return intersects.length > 0
  }

  /**
   * Project mouse position onto the panel centerline
   * @private
   * @returns {number|null} - t value (0-1) along centerline, or null if invalid
   */
  _projectMouseToCenterline(event) {
    if (!this.panelInfo) return null
    
    const rect = this.domElement.getBoundingClientRect()
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    
    this.raycaster.setFromCamera(this.mouse, this.camera)
    
    // Get mouse ray intersection with XZ plane at panel Y
    const panelY = this.panelInfo.startPoint[1]
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -panelY)
    const intersectPoint = new THREE.Vector3()
    
    if (!this.raycaster.ray.intersectPlane(plane, intersectPoint)) {
      return null
    }
    
    // Project intersection point onto centerline
    const start = new THREE.Vector3(
      this.panelInfo.startPoint[0],
      this.panelInfo.startPoint[1],
      this.panelInfo.startPoint[2]
    )
    const end = new THREE.Vector3(
      this.panelInfo.endPoint[0],
      this.panelInfo.endPoint[1],
      this.panelInfo.endPoint[2]
    )
    
    const line = new THREE.Vector3().subVectors(end, start)
    const lineLength = line.length()
    
    if (lineLength < 0.0001) return null
    
    const lineDir = line.clone().normalize()
    const toPoint = new THREE.Vector3().subVectors(intersectPoint, start)
    
    let t = toPoint.dot(lineDir) / lineLength
    
    // Clamp to 0-1 range
    t = Math.max(0, Math.min(1, t))
    
    return t
  }

  /**
   * Pointer move handler
   * @private
   */
  _onPointerMove(event) {
    if (this.isDragging) {
      // Stop event during drag to prevent orbit controls
      event.stopPropagation()
      
      // Update attach point based on pointer position
      const t = this._projectMouseToCenterline(event)
      if (t !== null) {
        this.attachPoint = t
        this._updateHandlePosition()
        
        // Notify callback
        if (this.onAttachPointChange) {
          this.onAttachPointChange(this.attachPoint)
        }
      }
    } else {
      // Check for hover
      const wasHovering = this.isHovering
      this.isHovering = this._isOverHandle(event)
      
      if (this.isHovering !== wasHovering && this.handle) {
        this.handle.material.color.setHex(
          this.isHovering ? GIZMO_CONFIG.handleHoverColor : GIZMO_CONFIG.handleColor
        )
        this.domElement.style.cursor = this.isHovering ? 'grab' : ''
      }
    }
  }

  /**
   * Pointer down handler
   * @private
   */
  _onPointerDown(event) {
    if (event.button !== 0) return // Left click only
    
    if (this.isHovering) {
      this.isDragging = true
      this.handle.material.color.setHex(GIZMO_CONFIG.handleDragColor)
      this.domElement.style.cursor = 'grabbing'
      
      // Capture pointer and prevent orbit controls
      this.domElement.setPointerCapture(event.pointerId)
      event.stopPropagation()
      event.preventDefault()
    }
  }

  /**
   * Pointer up handler
   * @private
   */
  _onPointerUp(event) {
    if (this.isDragging) {
      this.isDragging = false
      this.handle.material.color.setHex(
        this.isHovering ? GIZMO_CONFIG.handleHoverColor : GIZMO_CONFIG.handleColor
      )
      this.domElement.style.cursor = this.isHovering ? 'grab' : ''
      
      // Release pointer capture
      this.domElement.releasePointerCapture(event.pointerId)
      event.stopPropagation()
      
      // Notify callback that drag ended
      if (this.onDragEnd) {
        this.onDragEnd(this.attachPoint)
      }
    }
  }

  /**
   * Check if gizmo is currently being dragged
   * @returns {boolean}
   */
  get dragging() {
    return this.isDragging
  }

  /**
   * Check if gizmo is visible
   * @returns {boolean}
   */
  get visible() {
    return this.handle?.visible ?? false
  }

  /**
   * Dispose of all resources
   */
  dispose() {
    this.hide()
    
    if (this.handle) {
      this.scene.remove(this.handle)
      this.handle.geometry?.dispose()
      this.handle.material?.dispose()
      this.handle = null
    }
    
    if (this.centerLine) {
      this.scene.remove(this.centerLine)
      this.centerLine.geometry?.dispose()
      this.centerLine.material?.dispose()
      this.centerLine = null
    }
  }
}
