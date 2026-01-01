/**
 * PreviewBrush - Manages the creation mode preview panel visualization
 * 
 * Handles:
 * - Preview mesh creation (fancy holographic or simple solid)
 * - Preview positioning and scaling based on mouse position
 * - Endpoint markers for visual feedback
 * - Cleanup and disposal
 */
import * as THREE from 'three'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2'
import { BLOOM_LAYER, PREVIEW_PANEL } from './constants'

// Inject CSS for spinner animation (only once)
if (typeof document !== 'undefined' && !document.getElementById('preview-brush-spinner-style')) {
  const style = document.createElement('style')
  style.id = 'preview-brush-spinner-style'
  style.textContent = `
    @keyframes preview-brush-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .preview-brush-spinner {
      position: absolute;
      bottom: 20px;
      right: 20px;
      width: 32px;
      height: 32px;
      border: 3px solid rgba(255, 140, 0, 0.5);
      border-top-color: #ff9922;
      border-radius: 50%;
      animation: preview-brush-spin 0.8s linear infinite;
      z-index: 10000;
      pointer-events: none;
    }
  `
  document.head.appendChild(style)
}

/**
 * Creates the holographic shader material for fancy preview mode
 * @returns {THREE.ShaderMaterial}
 */
function createHolographicMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      stripeColor1: { value: new THREE.Color(PREVIEW_PANEL.stripeColor1) },
      stripeColor2: { value: new THREE.Color(PREVIEW_PANEL.stripeColor2) },
      holoTint: { value: new THREE.Color(PREVIEW_PANEL.holoTint) },
      stripeScale: { value: PREVIEW_PANEL.stripeScale },
      scanlineScale: { value: PREVIEW_PANEL.scanlineScale },
      scanlineIntensity: { value: PREVIEW_PANEL.scanlineIntensity },
      gradientStart: { value: PREVIEW_PANEL.gradientStart },
      gradientStrength: { value: PREVIEW_PANEL.gradientStrength },
      opacity: { value: PREVIEW_PANEL.opacity },
      meshScale: { value: new THREE.Vector3(1, 1, 1) }
    },
    vertexShader: `
      uniform vec3 meshScale;
      varying vec3 vWorldPosition;
      varying vec3 vAnchoredPosition;
      varying vec2 vUv;
      varying vec3 vNormal;
      void main() {
        vUv = uv;
        vNormal = normal;
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        vec3 anchored = position + vec3(0.5, 0.5, 0.125);
        vAnchoredPosition = anchored * meshScale;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 stripeColor1;
      uniform vec3 stripeColor2;
      uniform vec3 holoTint;
      uniform float stripeScale;
      uniform float scanlineScale;
      uniform float scanlineIntensity;
      uniform float gradientStart;
      uniform float gradientStrength;
      uniform float opacity;
      varying vec3 vWorldPosition;
      varying vec3 vAnchoredPosition;
      varying vec2 vUv;
      varying vec3 vNormal;
      
      vec3 blendOverlay(vec3 base, vec3 blend) {
        return vec3(
          base.r < 0.5 ? (2.0 * base.r * blend.r) : (1.0 - 2.0 * (1.0 - base.r) * (1.0 - blend.r)),
          base.g < 0.5 ? (2.0 * base.g * blend.g) : (1.0 - 2.0 * (1.0 - base.g) * (1.0 - blend.g)),
          base.b < 0.5 ? (2.0 * base.b * blend.b) : (1.0 - 2.0 * (1.0 - base.b) * (1.0 - blend.b))
        );
      }
      
      void main() {
        float anchoredCoord = vAnchoredPosition.x + vAnchoredPosition.y + vAnchoredPosition.z;
        float stripe = sin(anchoredCoord * stripeScale * 3.14159) * 0.5 + 0.5;
        stripe = step(0.5, stripe);
        vec3 color = mix(stripeColor2, stripeColor1, stripe * 0.7);
        vec3 overlayColor = blendOverlay(color, holoTint);
        float isTopFace = step(0.5, vNormal.y);
        float isBottomFace = step(0.5, -vNormal.y);
        float remappedY = clamp((vUv.y - gradientStart) / (1.0 - gradientStart), 0.0, 1.0);
        float gradientAmount = mix(remappedY * gradientStrength, gradientStrength, isTopFace);
        gradientAmount = mix(gradientAmount, 0.0, isBottomFace);
        color = mix(color, overlayColor, gradientAmount);
        float scanline = sin(vWorldPosition.y * scanlineScale) * 0.5 + 0.5;
        scanline = smoothstep(0.3, 0.7, scanline);
        color = mix(color, color * 0.75, scanline * scanlineIntensity);
        gl_FragColor = vec4(color, opacity);
      }
    `,
    transparent: true,
    side: THREE.FrontSide,
    depthWrite: false
  })
}

/**
 * Creates the thick glowing wireframe for fancy preview mode
 * @param {THREE.Mesh} parentMesh - Mesh to attach wireframe to
 */
function createFancyWireframe(parentMesh) {
  const hw = 0.5, hh = 0.5, hd = 0.125
  const boxEdges = [
    -hw, -hh, -hd,  hw, -hh, -hd,
     hw, -hh, -hd,  hw, -hh,  hd,
     hw, -hh,  hd, -hw, -hh,  hd,
    -hw, -hh,  hd, -hw, -hh, -hd,
    -hw,  hh, -hd,  hw,  hh, -hd,
     hw,  hh, -hd,  hw,  hh,  hd,
     hw,  hh,  hd, -hw,  hh,  hd,
    -hw,  hh,  hd, -hw,  hh, -hd,
    -hw, -hh, -hd, -hw,  hh, -hd,
     hw, -hh, -hd,  hw,  hh, -hd,
     hw, -hh,  hd,  hw,  hh,  hd,
    -hw, -hh,  hd, -hw,  hh,  hd,
  ]
  
  const lineGeo = new LineSegmentsGeometry()
  lineGeo.setPositions(boxEdges)
  
  const lineMat = new LineMaterial({
    color: new THREE.Color(PREVIEW_PANEL.wireframeColor).multiplyScalar(2.0),
    linewidth: PREVIEW_PANEL.wireframeWidth,
    opacity: PREVIEW_PANEL.wireframeOpacity,
    toneMapped: false,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  })
  lineMat.resolution.set(window.innerWidth, window.innerHeight)
  
  const edgeLines = new LineSegments2(lineGeo, lineMat)
  edgeLines.computeLineDistances()
  edgeLines.layers.enable(BLOOM_LAYER)
  parentMesh.add(edgeLines)
}

/**
 * Creates a simple wireframe for basic preview mode
 * @param {THREE.Mesh} parentMesh - Mesh to attach wireframe to
 * @param {THREE.BufferGeometry} geometry - Geometry to create edges from
 */
function createSimpleWireframe(parentMesh, geometry) {
  const edgesGeo = new THREE.EdgesGeometry(geometry)
  const edgesMat = new THREE.LineBasicMaterial({
    color: PREVIEW_PANEL.simpleWireframeColor,
    transparent: true,
    opacity: 0.8
  })
  const edgeLines = new THREE.LineSegments(edgesGeo, edgesMat)
  parentMesh.add(edgeLines)
}

/**
 * PreviewBrush class - manages creation mode preview visualization
 */
export class PreviewBrush {
  constructor(scene, container) {
    this.scene = scene
    this.container = container  // DOM container for spinner positioning
    this.mesh = null
    this.markers = []
    this.useFancyMode = PREVIEW_PANEL.fancyPreview
    this.pending = false  // When true, position is locked waiting for panel creation
    this.spinnerElement = null  // DOM spinner element
  }

  /**
   * Create the preview mesh if it doesn't exist
   * @private
   */
  _createMesh() {
    if (this.mesh) return

    const geometry = new THREE.BoxGeometry(1, 1, 0.25)

    if (this.useFancyMode) {
      // Fancy holographic mode
      const material = createHolographicMaterial()
      this.mesh = new THREE.Mesh(geometry, material)
      createFancyWireframe(this.mesh)
    } else {
      // Simple solid mode
      const material = new THREE.MeshBasicMaterial({
        color: PREVIEW_PANEL.simpleColor,
        transparent: true,
        opacity: PREVIEW_PANEL.simpleOpacity,
        side: THREE.FrontSide,
        depthWrite: false
      })
      this.mesh = new THREE.Mesh(geometry, material)
      createSimpleWireframe(this.mesh, geometry)
    }

    this.mesh.visible = false
    this.scene.add(this.mesh)
  }

  /**
   * Create an endpoint marker sphere
   * @param {Object} position - {x, y, z} position
   * @returns {THREE.Mesh}
   * @private
   */
  _createMarker(position) {
    const geometry = new THREE.SphereGeometry(0.06, 16, 16)
    const material = new THREE.MeshBasicMaterial({
      color: 0xff8800,
      transparent: true,
      opacity: 0.9
    })
    const marker = new THREE.Mesh(geometry, material)
    marker.position.set(position.x, position.y, position.z)
    
    if (this.useFancyMode) {
      marker.layers.enable(BLOOM_LAYER)
    }
    
    this.scene.add(marker)
    return marker
  }

  /**
   * Create the DOM spinner element
   * @private
   */
  _createSpinner() {
    if (this.spinnerElement) return
    if (!this.container) return
    
    // Ensure container has relative positioning for absolute child
    if (getComputedStyle(this.container).position === 'static') {
      this.container.style.position = 'relative'
    }
    
    this.spinnerElement = document.createElement('div')
    this.spinnerElement.className = 'preview-brush-spinner'
    this.spinnerElement.style.display = 'none'
    this.container.appendChild(this.spinnerElement)
  }

  /**
   * Show the spinner
   * @private
   */
  _showSpinner() {
    this._createSpinner()
    if (this.spinnerElement) {
      this.spinnerElement.style.display = 'block'
    }
  }

  /**
   * Hide the spinner
   * @private
   */
  _hideSpinner() {
    if (this.spinnerElement) {
      this.spinnerElement.style.display = 'none'
    }
  }

  /**
   * Update the preview based on endpoint and mouse position
   * @param {Object|null} endpoint - Start endpoint {x, y, z, panelIndex, worldRotation}
   * @param {THREE.Vector3|null} mousePoint - Mouse position in world space (XZ plane)
   */
  update(endpoint, mousePoint) {
    // Don't update position when pending (waiting for panel creation)
    if (this.pending) return
    
    // Hide if no valid endpoint or mouse position
    if (!endpoint || !mousePoint) {
      this.hide()
      return
    }

    // Calculate panel dimensions in XZ plane
    const dx = mousePoint.x - endpoint.x
    const dz = mousePoint.z - endpoint.z
    const width = Math.sqrt(dx * dx + dz * dz)

    // Don't show preview for very short panels
    if (width < 0.05) {
      this.hide()
      return
    }

    // Create mesh if needed
    this._createMesh()

    // Calculate angle and center position
    const angle = Math.atan2(dz, dx)
    const cx = endpoint.x + (width / 2) * Math.cos(angle)
    const cz = endpoint.z + (width / 2) * Math.sin(angle)

    // Update mesh transform
    this.mesh.scale.set(width, 1, 1)
    this.mesh.position.set(cx, endpoint.y, cz)
    this.mesh.rotation.set(0, -angle, 0)
    this.mesh.visible = true

    // Update shader uniform for fancy mode
    if (this.useFancyMode && this.mesh.material.uniforms) {
      this.mesh.material.uniforms.meshScale.value.set(width, 1, 1)
    }

    // Update or create endpoint marker
    if (this.markers.length === 0) {
      const marker = this._createMarker(endpoint)
      this.markers.push(marker)
    } else {
      // Update existing marker position
      this.markers.forEach(marker => {
        marker.position.set(endpoint.x, endpoint.y, endpoint.z)
      })
    }
  }

  /**
   * Hide the preview mesh (but don't dispose)
   */
  hide() {
    if (this.mesh) {
      this.mesh.visible = false
    }
  }

  /**
   * Check if preview mesh is visible
   * @returns {boolean}
   */
  get visible() {
    return this.mesh?.visible ?? false
  }

  /**
   * Get the preview mesh for bloom rendering
   * @returns {THREE.Mesh|null}
   */
  getMesh() {
    return this.mesh
  }

  /**
   * Get all markers for bloom rendering
   * @returns {THREE.Mesh[]}
   */
  getMarkers() {
    return this.markers
  }

  /**
   * Clear markers (e.g., after creating a panel)
   */
  clearMarkers() {
    this.markers.forEach(marker => {
      this.scene.remove(marker)
      marker.geometry?.dispose()
      marker.material?.dispose()
    })
    this.markers = []
  }

  /**
   * Set pending state - locks preview position and shows spinner
   */
  setPending(isPending) {
    this.pending = isPending
    
    if (isPending && this.mesh?.visible) {
      // Show fixed-position spinner
      this._showSpinner()
      
      // Reduce opacity of preview to indicate it's "pending"
      if (this.mesh.material.uniforms?.opacity) {
        this.mesh.material.uniforms.opacity.value = PREVIEW_PANEL.opacity * 0.6
      } else if (this.mesh.material.opacity !== undefined) {
        this.mesh.material.opacity = PREVIEW_PANEL.simpleOpacity * 0.6
      }
    } else {
      // Hide spinner
      this._hideSpinner()
      
      // Restore opacity
      if (this.mesh?.material.uniforms?.opacity) {
        this.mesh.material.uniforms.opacity.value = PREVIEW_PANEL.opacity
      } else if (this.mesh?.material.opacity !== undefined) {
        this.mesh.material.opacity = PREVIEW_PANEL.simpleOpacity
      }
    }
  }

  /**
   * Check if in pending state
   * @returns {boolean}
   */
  get isPending() {
    return this.pending
  }

  /**
   * Update line material resolution on resize
   * @param {number} width
   * @param {number} height
   */
  updateResolution(width, height) {
    if (this.mesh) {
      this.mesh.traverse(child => {
        if (child.material?.resolution) {
          child.material.resolution.set(width, height)
        }
      })
    }
  }

  /**
   * Dispose all resources
   */
  dispose() {
    // Remove DOM spinner
    if (this.spinnerElement) {
      this.spinnerElement.remove()
      this.spinnerElement = null
    }
    
    if (this.mesh) {
      this.scene.remove(this.mesh)
      this.mesh.traverse(child => {
        child.geometry?.dispose()
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose())
          } else {
            child.material.dispose()
          }
        }
      })
      this.mesh = null
    }

    this.clearMarkers()
    this.pending = false
  }
}
