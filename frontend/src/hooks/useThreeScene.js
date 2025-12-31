import { useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass'
import { Line2 } from 'three/examples/jsm/lines/Line2'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2'
import { useViewportStore } from '../stores/viewportStore'
import { useAppStore } from '../stores/appStore'

// Bloom layer - objects on this layer will glow
const BLOOM_LAYER = 1

// ============================================
// Creation Mode Preview Panel Settings
// ============================================
const PREVIEW_PANEL = {
  // Colors
  stripeColor1: 0xffaa55,      // Light stripe color
  stripeColor2: 0xdd9944,      // Dark stripe color
  holoTint: 0xffffff,          // Holographic cyan tint
  wireframeColor: 0xffaa44,    // Wireframe edge color
  
  // Stripe settings
  stripeScale: 6.0,            // Diagonal stripe density
  
  // Scanline settings
  scanlineScale: 200.0,        // Scanline density (higher = smaller)
  scanlineIntensity: 0.32,     // How visible scanlines are (0-1)
  
  // Holographic settings
  gradientStart: 0.3,          // Where gradient starts (0 = bottom, 1 = top)
  gradientStrength: 0.7,      // Vertical gradient strength (0-1)
  
  // Bloom settings for wireframe glow
  bloomStrength: 0.55,          // Glow intensity
  bloomRadius: 0.1,            // Glow spread
  bloomThreshold: 0.0,         // Brightness threshold
  bloomOpacity: 1.0,           // Bloom overlay opacity (0-1)
  
  // Wireframe settings
  wireframeWidth: 3.0,         // Line width in pixels
  wireframeOpacity: 0.18,       // Wireframe line opacity (0-1)
  
  // Overall
  opacity: 0.55,               // Panel transparency
}

export function useThreeScene(containerRef, geometryData) {
  const sceneRef = useRef(null)
  const cameraRef = useRef(null)
  const rendererRef = useRef(null)
  const bloomComposerRef = useRef(null)
  const controlsRef = useRef(null)
  const labelRendererRef = useRef(null)
  const geometryGroupRef = useRef(null)
  const labelGroupRef = useRef(null)
  const vertexGroupRef = useRef(null)
  const animationFrameRef = useRef(null)
  const raycasterRef = useRef(new THREE.Raycaster())
  const mouseRef = useRef(new THREE.Vector2())
  const hoveredMeshRef = useRef(null)
  const hoveredVertexRef = useRef(null)
  const settingsRef = useRef({ showFaceLabels: false, hideOccludedLabels: true })
  const selectionRef = useRef({ selectedFaceId: null, selectedVertexIdx: null, selectedElementId: null })
  const hoverRef = useRef({ hoveredFaceId: null, hoveredVertexIdx: null, hoveredElementId: null })
  
  // Creation mode refs
  const previewMeshRef = useRef(null)
  const previewPointsRef = useRef([])  // Visual markers for placed points
  const xyPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0))  // XY plane at z=0

  const {
    viewMode,
    colorMode,
    showFaceLabels,
    hideOccludedLabels,
    selectionMode,
    vertexScale,
    enableInertia,
    selectedElementId,
    selectedFaceId,
    selectedVertexIdx,
    setSelectedElement,
    setSelectedFace,
    setSelectedVertex,
    hoveredElementId,
    hoveredFaceId,
    hoveredVertexIdx,
    setHoveredElement,
    setHoveredFace,
    setHoveredVertex,
    clearHover,
  } = useViewportStore()
  
  // Get creation mode state
  const creationMode = useViewportStore((state) => state.creationMode)
  const panelChain = useViewportStore((state) => state.panelChain)

  // Keep settings ref in sync
  useEffect(() => {
    settingsRef.current = { showFaceLabels, hideOccludedLabels }
    
    // Reset label visibility when occlusion is disabled
    if (!hideOccludedLabels && labelGroupRef.current) {
      labelGroupRef.current.children.forEach(label => {
        if (label.element) {
          label.element.style.opacity = '1'
        }
      })
    }
  }, [showFaceLabels, hideOccludedLabels])
  
  // Clean up preview markers when chain changes or creation mode is disabled
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    
    // If creation mode is off or chain is empty, clear preview markers
    if (!creationMode || panelChain.length === 0) {
      // Remove preview mesh
      if (previewMeshRef.current) {
        scene.remove(previewMeshRef.current)
        previewMeshRef.current.geometry?.dispose()
        previewMeshRef.current.material?.dispose()
        previewMeshRef.current = null
      }
      
      // Remove point markers
      previewPointsRef.current.forEach(marker => {
        scene.remove(marker)
        marker.geometry?.dispose()
        marker.material?.dispose()
      })
      previewPointsRef.current = []
    }
    
    // When chain shrinks (undo), remove extra markers
    while (previewPointsRef.current.length > panelChain.length) {
      const marker = previewPointsRef.current.pop()
      scene.remove(marker)
      marker.geometry?.dispose()
      marker.material?.dispose()
    }
  }, [creationMode, panelChain.length])

  // Initialize scene
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const width = container.clientWidth
    const height = container.clientHeight

    // Scene - Blender-style dark gray background
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x282828)
    sceneRef.current = scene

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000)
    camera.position.set(3, 2, 4)
    cameraRef.current = camera

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.toneMapping = THREE.ReinhardToneMapping
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // ============================================
    // Selective Bloom Setup
    // Render scene normally, then overlay glow from bloom-layer objects
    // ============================================
    
    // Bloom scene - a separate scene containing only objects that should glow
    const bloomScene = new THREE.Scene()
    bloomScene.background = null  // Transparent/black
    
    // Bloom composer - renders bloom scene to internal render targets
    const bloomRenderPass = new RenderPass(bloomScene, camera)
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      PREVIEW_PANEL.bloomStrength,
      PREVIEW_PANEL.bloomRadius,
      PREVIEW_PANEL.bloomThreshold
    )
    
    const bloomComposer = new EffectComposer(renderer)
    bloomComposer.renderToScreen = false
    bloomComposer.addPass(bloomRenderPass)
    bloomComposer.addPass(bloomPass)
    bloomComposerRef.current = bloomComposer
    
    // Create a fullscreen quad for additive bloom compositing
    const bloomQuadGeo = new THREE.PlaneGeometry(2, 2)
    const bloomQuadMat = new THREE.ShaderMaterial({
      uniforms: { 
        bloomTexture: { value: null },
        opacity: { value: PREVIEW_PANEL.bloomOpacity }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D bloomTexture;
        uniform float opacity;
        varying vec2 vUv;
        void main() {
          vec4 bloom = texture2D(bloomTexture, vUv);
          gl_FragColor = bloom * opacity;
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false
    })
    const bloomQuad = new THREE.Mesh(bloomQuadGeo, bloomQuadMat)
    const bloomQuadScene = new THREE.Scene()
    const bloomQuadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    bloomQuadScene.add(bloomQuad)
    
    // Store bloom data on scene
    scene.userData.bloomScene = bloomScene
    scene.userData.bloomComposer = bloomComposer
    scene.userData.bloomQuad = bloomQuad
    scene.userData.bloomQuadScene = bloomQuadScene
    scene.userData.bloomQuadCamera = bloomQuadCamera

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = enableInertia
    controls.dampingFactor = 0.05
    controls.target.set(0, 0, 0)
    controlsRef.current = controls

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(500, 500, 500)
    scene.add(directionalLight)

    const backLight = new THREE.DirectionalLight(0xffffff, 0.3)
    backLight.position.set(-500, -200, -500)
    scene.add(backLight)

    // Grid - Blender style subtle grid
    const gridHelper = new THREE.GridHelper(4, 20, 0x3d3d3d, 0x303030)
    scene.add(gridHelper)

    // Axes - smaller, Blender-style
    const axesHelper = new THREE.AxesHelper(0.4)
    scene.add(axesHelper)

    // Groups
    const geometryGroup = new THREE.Group()
    scene.add(geometryGroup)
    geometryGroupRef.current = geometryGroup

    const labelGroup = new THREE.Group()
    scene.add(labelGroup)
    labelGroupRef.current = labelGroup

    const vertexGroup = new THREE.Group()
    scene.add(vertexGroup)
    vertexGroupRef.current = vertexGroup

    // CSS2D Renderer for labels
    const labelRenderer = new CSS2DRenderer()
    labelRenderer.setSize(width, height)
    labelRenderer.domElement.style.position = 'absolute'
    labelRenderer.domElement.style.top = '0'
    labelRenderer.domElement.style.pointerEvents = 'none'
    container.appendChild(labelRenderer.domElement)
    labelRendererRef.current = labelRenderer

    // Occlusion culling for labels
    const updateLabelOcclusion = () => {
      const labelGroup = labelGroupRef.current
      const geometryGroup = geometryGroupRef.current
      if (!labelGroup || !geometryGroup) return

      const raycaster = raycasterRef.current
      
      labelGroup.children.forEach(label => {
        if (!label.element) return
        
        // Get world position of label
        const labelPos = new THREE.Vector3()
        label.getWorldPosition(labelPos)
        
        // Direction from camera to label
        const dir = new THREE.Vector3().subVectors(labelPos, camera.position).normalize()
        const distance = camera.position.distanceTo(labelPos)
        
        // Raycast from camera toward label
        raycaster.set(camera.position, dir)
        raycaster.near = 0
        raycaster.far = distance - 0.01
        
        const intersects = raycaster.intersectObjects(geometryGroup.children, true)
        
        // Check if any mesh is blocking the view
        let isOccluded = false
        for (const hit of intersects) {
          if (hit.object.isMesh && hit.distance < distance - 0.01) {
            isOccluded = true
            break
          }
        }
        
        label.element.style.opacity = isOccluded ? '0' : '1'
      })
    }

    // Animation loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate)
      controls.update()
      
      // Update label occlusion
      if (settingsRef.current.showFaceLabels && settingsRef.current.hideOccludedLabels) {
        updateLabelOcclusion()
      }
      
      // Check if we have any bloom objects (creation mode preview)
      const hasBloomObjects = previewMeshRef.current && previewMeshRef.current.visible
      
      if (hasBloomObjects) {
        const { bloomScene, bloomComposer, bloomQuad, bloomQuadScene, bloomQuadCamera } = scene.userData
        
        // Step 1: Copy bloom objects to bloom scene FIRST
        while (bloomScene.children.length > 0) {
          bloomScene.remove(bloomScene.children[0])
        }
        
        // Clone wireframe and markers with world transforms
        if (previewMeshRef.current) {
          previewMeshRef.current.traverse((child) => {
            if (child.layers.isEnabled(BLOOM_LAYER)) {
              const temp = child.clone()
              child.getWorldPosition(temp.position)
              child.getWorldQuaternion(temp.quaternion)
              child.getWorldScale(temp.scale)
              bloomScene.add(temp)
            }
          })
        }
        
        previewPointsRef.current.forEach(marker => {
          if (marker.layers.isEnabled(BLOOM_LAYER)) {
            const temp = marker.clone()
            marker.getWorldPosition(temp.position)
            bloomScene.add(temp)
          }
        })
        
        // Step 2: Render bloom pass to offscreen buffer
        bloomComposer.render()
        const bloomTexture = bloomComposer.readBuffer.texture
        
        // Step 3: Render main scene to screen (clears the screen)
        renderer.setRenderTarget(null)
        renderer.render(scene, camera)
        
        // Step 4: Composite bloom on top with additive blending
        bloomQuad.material.uniforms.bloomTexture.value = bloomTexture
        renderer.autoClear = false
        renderer.render(bloomQuadScene, bloomQuadCamera)
        renderer.autoClear = true
      } else {
        // Normal rendering (no bloom)
        renderer.render(scene, camera)
      }
      
      labelRenderer.render(scene, camera)
    }
    animate()

    // Handle resize
    const handleResize = () => {
      const w = container.clientWidth
      const h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
      scene.userData.bloomComposer?.setSize(w, h)
      labelRenderer.setSize(w, h)
      // Update LineMaterial resolution for thick lines
      if (previewMeshRef.current) {
        previewMeshRef.current.traverse((child) => {
          if (child.material && child.material.resolution) {
            child.material.resolution.set(w, h)
          }
        })
      }
    }
    window.addEventListener('resize', handleResize)

    // Setup face picking
    const handleMouseMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect()
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      
      const viewportStore = useViewportStore.getState()
      
      // In creation mode, update preview panel
      if (viewportStore.creationMode) {
        updateCreationPreview()
      } else {
        updateHover()
      }
    }
    
    const handleMouseLeave = () => {
      resetHover()
      // Hide preview when mouse leaves
      if (previewMeshRef.current) {
        previewMeshRef.current.visible = false
      }
    }
    
    // Track if user is dragging (rotating/panning) vs clicking
    let isDragging = false
    let mouseDownPos = { x: 0, y: 0 }
    
    const handleMouseDown = (e) => {
      isDragging = false
      mouseDownPos = { x: e.clientX, y: e.clientY }
    }
    
    const handleMouseMoveForDrag = (e) => {
      const dx = e.clientX - mouseDownPos.x
      const dy = e.clientY - mouseDownPos.y
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        isDragging = true
      }
    }
    
    // Helper: Raycast to XY plane (for wall/vertical interactions)
    const raycastToXYPlane = () => {
      const raycaster = raycasterRef.current
      const mouse = mouseRef.current
      const camera = cameraRef.current
      
      raycaster.setFromCamera(mouse, camera)
      
      const intersectPoint = new THREE.Vector3()
      const ray = raycaster.ray
      
      // Intersect with XY plane (z=0)
      if (ray.intersectPlane(xyPlaneRef.current, intersectPoint)) {
        return intersectPoint
      }
      return null
    }
    
    // Helper: Raycast to XZ plane (floor plane, y=0) for creation mode
    const raycastToXZPlane = () => {
      const raycaster = raycasterRef.current
      const mouse = mouseRef.current
      const camera = cameraRef.current
      
      raycaster.setFromCamera(mouse, camera)
      
      const intersectPoint = new THREE.Vector3()
      const ray = raycaster.ray
      
      // Intersect with XZ plane (y=0) - the floor
      const xzPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
      if (ray.intersectPlane(xzPlane, intersectPoint)) {
        return intersectPoint
      }
      return null
    }
    
    // Helper: Get the endpoint of a panel by index from geometry data
    const getSelectedPanelEndpoint = () => {
      const appStore = useAppStore.getState()
      const viewportStore = useViewportStore.getState()
      const geometryData = appStore.geometryData
      const selectedId = viewportStore.selectedElementId
      
      if (!geometryData?.panels || selectedId === null || selectedId === undefined) {
        return null
      }
      
      // Find the first panel face that matches this panel index
      // Panel IDs are like "0-front", "0-back", "1-None", etc.
      // We need to find any panel starting with "{selectedId}-"
      const panelPrefix = `${selectedId}-`
      const panel = geometryData.panels.find(p => p.id && p.id.startsWith(panelPrefix))
      
      if (!panel?.endPoint) {
        return null
      }
      
      // Calculate the panel's world rotation from its start and end points
      // This gives us the cumulative rotation to pass to child panels
      let worldRotation = 0
      if (panel.startPoint && panel.endPoint) {
        const dx = panel.endPoint[0] - panel.startPoint[0]
        const dz = panel.endPoint[2] - panel.startPoint[2]
        worldRotation = -Math.atan2(dz, dx) * (180 / Math.PI)
      }
      
      return {
        x: panel.endPoint[0],
        y: panel.endPoint[1],
        z: panel.endPoint[2] || 0,
        panelIndex: selectedId,
        worldRotation: worldRotation
      }
    }
    
    // Helper: Create or update preview panel (emerges from selected panel endpoint)
    const updateCreationPreview = () => {
      const viewportStore = useViewportStore.getState()
      const endpoint = getSelectedPanelEndpoint()
      
      // Must have a selected panel to create from
      if (!endpoint) {
        if (previewMeshRef.current) previewMeshRef.current.visible = false
        return
      }
      
      // Use XZ plane (floor) for creation - panels rotate around Y axis
      const mousePoint = raycastToXZPlane()
      if (!mousePoint) {
        if (previewMeshRef.current) previewMeshRef.current.visible = false
        return
      }
      
      // Calculate in XZ plane (horizontal floor)
      const dx = mousePoint.x - endpoint.x
      const dz = mousePoint.z - endpoint.z
      const width = Math.sqrt(dx * dx + dz * dz)
      
      // Don't show preview for very short panels
      if (width < 0.05) {
        if (previewMeshRef.current) previewMeshRef.current.visible = false
        return
      }
      
      // Angle in XZ plane - atan2(dz, dx) for rotation around Y
      const angle = Math.atan2(dz, dx)
      
      // Position the panel center offset from the endpoint (pivot point)
      // Panel swings around the endpoint like a hinged door
      // Center is at endpoint + half-width in the direction of the panel
      const cx = endpoint.x + (width / 2) * Math.cos(angle)
      const cz = endpoint.z + (width / 2) * Math.sin(angle)
      
      // Create preview mesh if it doesn't exist
      if (!previewMeshRef.current) {
        // Custom shader material for holographic effect with diagonal stripes
        const holoMaterial = new THREE.ShaderMaterial({
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
              // Get world position for consistent scanlines
              vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
              // Anchor diagonal stripes to start of box
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
            
            // Overlay blend mode (like Photoshop)
            vec3 blendOverlay(vec3 base, vec3 blend) {
              return vec3(
                base.r < 0.5 ? (2.0 * base.r * blend.r) : (1.0 - 2.0 * (1.0 - base.r) * (1.0 - blend.r)),
                base.g < 0.5 ? (2.0 * base.g * blend.g) : (1.0 - 2.0 * (1.0 - base.g) * (1.0 - blend.g)),
                base.b < 0.5 ? (2.0 * base.b * blend.b) : (1.0 - 2.0 * (1.0 - base.b) * (1.0 - blend.b))
              );
            }
            
            void main() {
              // Diagonal stripe pattern anchored to start point
              float anchoredCoord = vAnchoredPosition.x + vAnchoredPosition.y + vAnchoredPosition.z;
              float stripe = sin(anchoredCoord * stripeScale * 3.14159) * 0.5 + 0.5;
              stripe = step(0.5, stripe);
              
              // Base color from stripes
              vec3 color = mix(stripeColor2, stripeColor1, stripe * 0.7);
              
              // Prepare overlay color
              vec3 overlayColor = blendOverlay(color, holoTint);
              
              // Determine face type from normal
              float isTopFace = step(0.5, vNormal.y);      // Top face (normal.y > 0.5)
              float isBottomFace = step(0.5, -vNormal.y);  // Bottom face (normal.y < -0.5)
              
              // Remap UV.y so gradient starts at gradientStart and ends at 1.0
              float remappedY = clamp((vUv.y - gradientStart) / (1.0 - gradientStart), 0.0, 1.0);
              
              // Vertical gradient on front/back/end faces
              // Top face gets full gradient endpoint, bottom face gets no gradient
              float gradientAmount = mix(remappedY * gradientStrength, gradientStrength, isTopFace);
              gradientAmount = mix(gradientAmount, 0.0, isBottomFace);
              color = mix(color, overlayColor, gradientAmount);
              
              // Horizontal scanlines (world space Y for consistency)
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
        
        // BoxGeometry(width, height, depth)
        const previewGeo = new THREE.BoxGeometry(1, 1, 0.25)
        const previewMesh = new THREE.Mesh(previewGeo, holoMaterial)
        
        // Glowing edge outline using thick lines (LineSegments2) for proper antialiasing
        // Box edges as separate line segments (pairs of points)
        // Unit box is 1x1x0.25, centered at origin
        const hw = 0.5, hh = 0.5, hd = 0.125  // half width, height, depth
        const boxEdges = [
          // Bottom face (4 edges)
          -hw, -hh, -hd,  hw, -hh, -hd,
           hw, -hh, -hd,  hw, -hh,  hd,
           hw, -hh,  hd, -hw, -hh,  hd,
          -hw, -hh,  hd, -hw, -hh, -hd,
          // Top face (4 edges)
          -hw,  hh, -hd,  hw,  hh, -hd,
           hw,  hh, -hd,  hw,  hh,  hd,
           hw,  hh,  hd, -hw,  hh,  hd,
          -hw,  hh,  hd, -hw,  hh, -hd,
          // Vertical edges (4 edges)
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
        // LineMaterial needs resolution for proper width calculation
        lineMat.resolution.set(window.innerWidth, window.innerHeight)
        
        const edgeLines = new LineSegments2(lineGeo, lineMat)
        edgeLines.computeLineDistances()
        edgeLines.layers.enable(BLOOM_LAYER)
        previewMesh.add(edgeLines)
        
        previewMeshRef.current = previewMesh
        scene.add(previewMeshRef.current)
      }
      
      // Update preview mesh
      previewMeshRef.current.scale.set(width, 1, 1)
      // Update shader uniform with current scale
      previewMeshRef.current.material.uniforms.meshScale.value.set(width, 1, 1)
      // Position centered on the endpoint (which is already at mid-height)
      previewMeshRef.current.position.set(cx, endpoint.y, cz)
      
      // Rotate around Y axis - panel swings in XZ plane
      // Negate because Three.js Y rotation is counterclockwise when looking down
      previewMeshRef.current.rotation.set(0, -angle, 0)
      previewMeshRef.current.visible = true
      
      // Show a marker at the endpoint we're building from (orange glow)
      if (previewPointsRef.current.length === 0) {
        const markerGeo = new THREE.SphereGeometry(0.06, 16, 16)
        const markerMat = new THREE.MeshBasicMaterial({ 
          color: 0xff8800,
          transparent: true,
          opacity: 0.9
        })
        const marker = new THREE.Mesh(markerGeo, markerMat)
        marker.position.set(endpoint.x, endpoint.y, endpoint.z)
        marker.layers.enable(BLOOM_LAYER)  // Add glow to marker
        scene.add(marker)
        previewPointsRef.current.push(marker)
      } else {
        // Update marker positions in case selection changed
        previewPointsRef.current.forEach(marker => {
          marker.position.set(endpoint.x, endpoint.y, endpoint.z)
        })
      }
    }
    
    // Click handler for selection OR creation
    const handleClick = (e) => {
      // Don't select on alt+click (panning)
      if (e.altKey) return
      
      // Don't select if user was dragging (rotating/panning)
      if (isDragging) return
      
      const viewportStore = useViewportStore.getState()
      const appStore = useAppStore.getState()
      
      // CREATION MODE - create panel from selected panel's endpoint
      if (viewportStore.creationMode) {
        const endpoint = getSelectedPanelEndpoint()
        
        if (!endpoint) {
          console.log('Creation mode: Please select a panel first')
          return
        }
        
        // Use XZ plane (floor) for creation
        const clickPoint = raycastToXZPlane()
        if (!clickPoint) return
        
        // Calculate distance in XZ plane
        const dx = clickPoint.x - endpoint.x
        const dz = clickPoint.z - endpoint.z
        const dist = Math.sqrt(dx * dx + dz * dz)
        
        if (dist >= 0.05) {
          // Create the panel, inserted after the selected panel
          // Start at endpoint, end at click position (use endpoint.y for height)
          const startPoint = { x: endpoint.x, y: endpoint.y, z: endpoint.z }
          const endPointCoord = { x: clickPoint.x, y: endpoint.y, z: clickPoint.z }
          
          // Pass parent's world rotation so the relative rotation is calculated correctly
          // addPanelFromPoints is now async and returns the new panel index
          appStore.addPanelFromPoints(startPoint, endPointCoord, endpoint.panelIndex, 0.25, endpoint.worldRotation)
            .then((newPanelIndex) => {
              if (newPanelIndex !== null) {
                // Clear the preview marker so it gets recreated at new position
                previewPointsRef.current.forEach(m => scene.remove(m))
                previewPointsRef.current = []
                
                // Hide the preview mesh until mouse moves again
                if (previewMeshRef.current) {
                  previewMeshRef.current.visible = false
                }
                
                // Select the newly created panel - geometry is now ready
                viewportStore.setSelectedElement(newPanelIndex)
                
                // Update preview after a short delay to ensure meshes are built
                setTimeout(() => {
                  updateCreationPreview()
                }, 50)
              }
            })
        }
        return
      }
      
      // SELECTION MODE
      const currentSelectionMode = viewportStore.selectionMode
      
      // Point selection mode - check vertices first
      if (currentSelectionMode === 'point' && hoveredVertexRef.current) {
        const vertexIdx = hoveredVertexRef.current.userData.vertexIndex
        if (vertexIdx !== undefined) {
          viewportStore.setSelectedVertex(vertexIdx)
        }
        return
      }
      
      // Face selection mode - select individual face
      if (currentSelectionMode === 'face' && hoveredMeshRef.current) {
        const faceId = hoveredMeshRef.current.userData.faceId
        if (faceId) {
          viewportStore.setSelectedFace(faceId)
        }
        return
      }
      
      // Element selection mode - select entire panel/element
      if (currentSelectionMode === 'element' && hoveredMeshRef.current) {
        const panelId = hoveredMeshRef.current.userData.panelId
        if (panelId !== undefined && panelId !== null) {
          viewportStore.setSelectedElement(panelId)
        }
        return
      }
      
      // Click on nothing - clear selection
      viewportStore.clearSelection()
    }
    
    renderer.domElement.addEventListener('mousedown', handleMouseDown)
    renderer.domElement.addEventListener('mousemove', handleMouseMove)
    renderer.domElement.addEventListener('mousemove', handleMouseMoveForDrag)
    renderer.domElement.addEventListener('mouseleave', handleMouseLeave)
    renderer.domElement.addEventListener('click', handleClick)

    // Setup Alt+LMB panning
    let isPanning = false
    let lastX = 0, lastY = 0

    const handlePointerDown = (e) => {
      if (e.altKey && e.button === 0) {
        isPanning = true
        lastX = e.clientX
        lastY = e.clientY
        controls.enabled = false
        renderer.domElement.setPointerCapture(e.pointerId)
      }
    }

    const handlePointerMove = (e) => {
      if (!isPanning) return
      
      const deltaX = e.clientX - lastX
      const deltaY = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      
      const panSpeed = 0.001
      const offset = new THREE.Vector3()
      
      // Pan horizontally
      offset.setFromMatrixColumn(camera.matrix, 0)
      offset.multiplyScalar(-deltaX * panSpeed * camera.position.length())
      controls.target.add(offset)
      camera.position.add(offset)
      
      // Pan vertically
      offset.setFromMatrixColumn(camera.matrix, 1)
      offset.multiplyScalar(deltaY * panSpeed * camera.position.length())
      controls.target.add(offset)
      camera.position.add(offset)
    }

    const handlePointerUp = (e) => {
      if (isPanning) {
        isPanning = false
        renderer.domElement.releasePointerCapture(e.pointerId)
        controls.enabled = true
      }
    }

    renderer.domElement.addEventListener('pointerdown', handlePointerDown)
    renderer.domElement.addEventListener('pointermove', handlePointerMove)
    renderer.domElement.addEventListener('pointerup', handlePointerUp)

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
      renderer.domElement.removeEventListener('mousedown', handleMouseDown)
      renderer.domElement.removeEventListener('mousemove', handleMouseMove)
      renderer.domElement.removeEventListener('mousemove', handleMouseMoveForDrag)
      renderer.domElement.removeEventListener('mouseleave', handleMouseLeave)
      renderer.domElement.removeEventListener('click', handleClick)
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
      renderer.domElement.removeEventListener('pointermove', handlePointerMove)
      renderer.domElement.removeEventListener('pointerup', handlePointerUp)
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      
      renderer.dispose()
      container.removeChild(renderer.domElement)
      container.removeChild(labelRenderer.domElement)
    }
  }, [])

  // Update inertia when changed
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.enableDamping = enableInertia
    }
  }, [enableInertia])

  // Update hover state
  const updateHover = useCallback(() => {
    const raycaster = raycasterRef.current
    const mouse = mouseRef.current
    const camera = cameraRef.current
    const geometryGroup = geometryGroupRef.current
    const vertexGroup = vertexGroupRef.current
    const renderer = rendererRef.current
    const store = useViewportStore.getState()
    const currentSelectionMode = store.selectionMode
    const showVerts = currentSelectionMode === 'point'  // Show vertices in point mode
    const currentSelectedFaceId = store.selectedFaceId
    const currentSelectedVertexIdx = store.selectedVertexIdx
    const currentSelectedElementId = store.selectedElementId
    
    if (!raycaster || !camera || !geometryGroup || !renderer) return
    
    raycaster.setFromCamera(mouse, camera)
    
    // Check vertices first (only in point mode)
    let newHoveredVertex = null
    if (showVerts && vertexGroup) {
      const vertexIntersects = raycaster.intersectObjects(vertexGroup.children, false)
      if (vertexIntersects.length > 0) {
        newHoveredVertex = vertexIntersects[0].object
      }
    }
    
    // Update vertex hover
    if (hoveredVertexRef.current !== newHoveredVertex) {
      if (hoveredVertexRef.current?.userData.baseColor) {
        // Only reset to base color if not selected
        const prevVertexIdx = hoveredVertexRef.current.userData.vertexIndex
        if (prevVertexIdx !== currentSelectedVertexIdx) {
          hoveredVertexRef.current.material.color.copy(hoveredVertexRef.current.userData.baseColor)
        }
      }
      if (newHoveredVertex) {
        newHoveredVertex.material.color.setHex(0x6090c0)  // Blender-style blue hover
        // Sync to store for spreadsheet highlighting
        const vertexIdx = newHoveredVertex.userData.vertexIndex
        if (vertexIdx !== undefined) {
          store.setHoveredVertex(vertexIdx)
        }
      } else if (hoveredVertexRef.current) {
        // Clear hover in store when leaving vertex
        store.clearHover()
      }
      hoveredVertexRef.current = newHoveredVertex
    }
    
    // Check meshes
    const meshes = []
    geometryGroup.traverse((child) => {
      if (child.isMesh && child.userData.isFill) {
        meshes.push(child)
      }
    })
    
    const intersects = raycaster.intersectObjects(meshes, false)
    let newHovered = null
    if (intersects.length > 0 && !newHoveredVertex) {
      newHovered = intersects[0].object
    }
    
    // Helper to apply selection highlight to a mesh
    const applySelectionHighlight = (mesh) => {
      mesh.material.color.setHSL(0.08, 0.8, 0.5)  // Vibrant orange
      if (mesh.material.emissive) {
        mesh.material.emissive.setHex(0x662800)  // Vibrant orange tint for selection
      }
    }
    
    // Helper to reset mesh to base color
    const resetToBaseColor = (mesh) => {
      if (mesh.userData.baseColor) {
        mesh.material.color.copy(mesh.userData.baseColor)
        if (mesh.material.emissive) {
          mesh.material.emissive.setHex(0x000000)
        }
      }
    }
    
    // Update mesh hover
    if (hoveredMeshRef.current !== newHovered) {
      // Clear previous hover - need to handle element mode specially
      if (hoveredMeshRef.current?.userData.baseColor) {
        const prevPanelId = hoveredMeshRef.current.userData.panelId
        const prevFaceId = hoveredMeshRef.current.userData.faceId
        
        if (currentSelectionMode === 'element' && prevPanelId !== undefined && prevPanelId !== null) {
          // In element mode, reset all faces of the previous element
          const isSelected = prevPanelId === currentSelectedElementId
          geometryGroup.traverse((child) => {
            if (child.isMesh && child.userData.isFill && child.userData.panelId === prevPanelId) {
              if (isSelected) {
                applySelectionHighlight(child)
              } else {
                resetToBaseColor(child)
              }
            }
          })
        } else if (currentSelectionMode === 'face') {
          // Face mode - only reset the single face
          if (prevFaceId === currentSelectedFaceId) {
            applySelectionHighlight(hoveredMeshRef.current)
          } else {
            resetToBaseColor(hoveredMeshRef.current)
          }
        } else {
          // Default - reset to base
          resetToBaseColor(hoveredMeshRef.current)
        }
      }
      
      // Apply new hover
      if (newHovered?.userData.baseColor) {
        const newPanelId = newHovered.userData.panelId
        
        if (currentSelectionMode === 'element' && newPanelId !== undefined && newPanelId !== null) {
          // In element mode, highlight all faces of the element
          geometryGroup.traverse((child) => {
            if (child.isMesh && child.userData.isFill && child.userData.panelId === newPanelId) {
              const baseColor = child.userData.baseColor
              if (baseColor) {
                const hsl = {}
                baseColor.getHSL(hsl)
                child.material.color.setHSL(hsl.h, hsl.s, Math.min(1, hsl.l + 0.2))
              }
              if (child.material.emissive) {
                child.material.emissive.setHex(0x152030)  // Subtle blue tint for hover
              }
            }
          })
          // Sync to store - use element hover
          store.setHoveredElement(newPanelId)
        } else {
          // Face mode - only highlight single face
          const baseColor = newHovered.userData.baseColor
          const hsl = {}
          baseColor.getHSL(hsl)
          newHovered.material.color.setHSL(hsl.h, hsl.s, Math.min(1, hsl.l + 0.2))
          if (newHovered.material.emissive) {
            newHovered.material.emissive.setHex(0x152030)  // Subtle blue tint for hover
          }
          // Sync to store for spreadsheet highlighting
          const faceId = newHovered.userData.faceId
          if (faceId) {
            store.setHoveredFace(faceId)
          }
        }
      } else if (hoveredMeshRef.current && !newHoveredVertex) {
        // Clear hover in store when leaving mesh (and not on vertex)
        store.clearHover()
      }
      
      hoveredMeshRef.current = newHovered
    }
    
    renderer.domElement.style.cursor = (newHoveredVertex || newHovered) ? 'pointer' : ''
  }, [])

  const resetHover = useCallback(() => {
    const renderer = rendererRef.current
    const geometryGroup = geometryGroupRef.current
    const store = useViewportStore.getState()
    const currentSelectionMode = store.selectionMode
    const currentSelectedFaceId = store.selectedFaceId
    const currentSelectedVertexIdx = store.selectedVertexIdx
    const currentSelectedElementId = store.selectedElementId
    
    // Helper to apply selection highlight to a mesh
    const applySelectionHighlight = (mesh) => {
      mesh.material.color.setHSL(0.08, 0.8, 0.5)  // Vibrant orange
      if (mesh.material.emissive) {
        mesh.material.emissive.setHex(0x662800)  // Vibrant orange tint for selection
      }
    }
    
    // Helper to reset mesh to base color
    const resetToBaseColor = (mesh) => {
      if (mesh.userData.baseColor) {
        mesh.material.color.copy(mesh.userData.baseColor)
        if (mesh.material.emissive) {
          mesh.material.emissive.setHex(0x000000)
        }
      }
    }
    
    if (hoveredMeshRef.current?.userData.baseColor) {
      const panelId = hoveredMeshRef.current.userData.panelId
      const faceId = hoveredMeshRef.current.userData.faceId
      
      if (currentSelectionMode === 'element' && panelId !== undefined && panelId !== null && geometryGroup) {
        // In element mode, handle all faces of the hovered element
        const isSelected = panelId === currentSelectedElementId
        geometryGroup.traverse((child) => {
          if (child.isMesh && child.userData.isFill && child.userData.panelId === panelId) {
            if (isSelected) {
              applySelectionHighlight(child)
            } else {
              resetToBaseColor(child)
            }
          }
        })
      } else if (currentSelectionMode === 'face') {
        // Face mode - reset or re-apply selection
        if (faceId === currentSelectedFaceId) {
          applySelectionHighlight(hoveredMeshRef.current)
        } else {
          resetToBaseColor(hoveredMeshRef.current)
        }
      } else {
        resetToBaseColor(hoveredMeshRef.current)
      }
    }
    hoveredMeshRef.current = null
    
    if (hoveredVertexRef.current?.userData.baseColor) {
      // Only reset to base color if not selected
      const vertexIdx = hoveredVertexRef.current.userData.vertexIndex
      if (vertexIdx !== currentSelectedVertexIdx) {
        hoveredVertexRef.current.material.color.copy(hoveredVertexRef.current.userData.baseColor)
      }
    }
    hoveredVertexRef.current = null
    
    if (renderer) {
      renderer.domElement.style.cursor = ''
    }
    
    // Clear store hover state
    store.clearHover()
  }, [])

  // Update geometry when data changes
  useEffect(() => {
    const geometryGroup = geometryGroupRef.current
    const labelGroup = labelGroupRef.current
    const vertexGroup = vertexGroupRef.current
    
    if (!geometryGroup) return
    
    // Clear existing geometry
    clearGroup(geometryGroup)
    clearGroup(labelGroup)
    clearGroup(vertexGroup)
    
    if (!geometryData?.panels?.length) return
    
    // Create meshes
    geometryData.panels.forEach((panel) => {
      const mesh = createPolygonMesh(panel, viewMode, colorMode)
      if (mesh) {
        geometryGroup.add(mesh)
      }
    })
    
    // Create labels
    if (showFaceLabels) {
      createLabels(geometryData, labelGroup)
    }
    
    // Create vertices (always create for selection, visible only in point mode)
    const showVerts = selectionMode === 'point'
    createVertexMarkers(geometryData, vertexGroup, showVerts, vertexScale)
  }, [geometryData, viewMode, colorMode, showFaceLabels, selectionMode, vertexScale])

  // Handle selection highlighting from spreadsheet
  useEffect(() => {
    const geometryGroup = geometryGroupRef.current
    const vertexGroup = vertexGroupRef.current
    if (!geometryGroup) return
    
    const showVerts = selectionMode === 'point'
    
    // Reset all highlights first
    geometryGroup.traverse((child) => {
      if (child.isMesh && child.userData.isFill && child.userData.baseColor) {
        child.material.color.copy(child.userData.baseColor)
        if (child.material.emissive) {
          child.material.emissive.setHex(0x000000)
        }
        // Reset outline
        child.material.wireframe = false
      }
    })
    
    if (vertexGroup) {
      vertexGroup.children.forEach((sphere) => {
        if (sphere.userData.baseColor) {
          sphere.material.color.copy(sphere.userData.baseColor)
          sphere.scale.setScalar(1)
          // Reset visibility based on selection mode
          sphere.visible = showVerts
        }
      })
    }
    
    // Highlight selected element - all faces with matching panelId
    if (selectedElementId !== null && selectedElementId !== undefined) {
      geometryGroup.traverse((child) => {
        if (child.isMesh && child.userData.isFill && child.userData.panelId === selectedElementId) {
          const baseColor = child.userData.baseColor
          if (baseColor) {
            const hsl = {}
            baseColor.getHSL(hsl)
            child.material.color.setHSL(0.08, 0.8, Math.min(0.6, hsl.l + 0.15))  // Orange tinted
          }
          if (child.material.emissive) {
            child.material.emissive.setHex(0x662800)  // Vibrant orange tint
          }
        }
      })
    }
    
    // Highlight selected face - Blender orange tint
    if (selectedFaceId) {
      geometryGroup.traverse((child) => {
        if (child.isMesh && child.userData.faceId === selectedFaceId) {
          const baseColor = child.userData.baseColor
          if (baseColor) {
            const hsl = {}
            baseColor.getHSL(hsl)
            child.material.color.setHSL(0.08, 0.8, Math.min(0.6, hsl.l + 0.15))  // Orange tinted
          }
          if (child.material.emissive) {
            child.material.emissive.setHex(0x662800)  // Vibrant orange tint
          }
        }
      })
    }
    
    // Highlight selected vertex - Blender orange
    if (selectedVertexIdx !== null && vertexGroup) {
      vertexGroup.children.forEach((sphere) => {
        if (sphere.userData.vertexIndex === selectedVertexIdx) {
          sphere.material.color.setHex(0xff8000)  // Orange
          sphere.scale.setScalar(2)
          if (showVerts) {
            sphere.visible = true
          }
        }
      })
    }
  }, [selectedElementId, selectedFaceId, selectedVertexIdx, selectionMode])

  // Handle hover highlighting from spreadsheet
  useEffect(() => {
    const geometryGroup = geometryGroupRef.current
    const vertexGroup = vertexGroupRef.current
    if (!geometryGroup) return
    
    const showVerts = selectionMode === 'point'
    const prevHover = hoverRef.current
    const newHover = { hoveredFaceId, hoveredVertexIdx, hoveredElementId }
    hoverRef.current = newHover
    
    // Only process if hover came from spreadsheet (not from viewport mouse)
    // We detect this by checking if the change was external
    // Skip if we're already tracking this hover in the viewport refs
    const meshHoveredByViewport = hoveredMeshRef.current?.userData.faceId === hoveredFaceId
    const vertexHoveredByViewport = hoveredVertexRef.current?.userData.vertexIndex === hoveredVertexIdx
    
    if (meshHoveredByViewport || vertexHoveredByViewport) return
    
    // Helper to check if a face belongs to an element
    const faceMatchesElement = (faceId, elementId) => {
      if (!elementId || !faceId) return false
      // Face IDs are like "0-front", "0-back", etc. Element ID is "0"
      return faceId.replace(/-(?:front|back|top|bottom|start|end)$/, '') === elementId
    }
    
    // Clear previous hover highlight (if it was from spreadsheet)
    if ((prevHover.hoveredFaceId && prevHover.hoveredFaceId !== hoveredFaceId) ||
        (prevHover.hoveredElementId && prevHover.hoveredElementId !== hoveredElementId)) {
      geometryGroup.traverse((child) => {
        if (child.isMesh && child.userData.baseColor) {
          const wasHoveredByFace = child.userData.faceId === prevHover.hoveredFaceId
          const wasHoveredByElement = faceMatchesElement(child.userData.faceId, prevHover.hoveredElementId)
          if (wasHoveredByFace || wasHoveredByElement) {
            // Check if this face is selected (by face or element)
            const isSelectedFace = child.userData.faceId === selectedFaceId
            const isSelectedElement = faceMatchesElement(child.userData.faceId, selectedElementId)
            
            if (isSelectedFace || isSelectedElement) {
              // Re-apply selection highlight (vibrant orange)
              child.material.color.setHSL(0.08, 0.8, 0.5)
              if (child.material.emissive) {
                child.material.emissive.setHex(0x662800)
              }
            } else {
              // Reset to base color
              child.material.color.copy(child.userData.baseColor)
              if (child.material.emissive) {
                child.material.emissive.setHex(0x000000)
              }
            }
          }
        }
      })
    }
    
    if (prevHover.hoveredVertexIdx !== null && prevHover.hoveredVertexIdx !== hoveredVertexIdx && vertexGroup) {
      vertexGroup.children.forEach((sphere) => {
        if (sphere.userData.vertexIndex === prevHover.hoveredVertexIdx && sphere.userData.baseColor) {
          // Only reset if not selected
          if (sphere.userData.vertexIndex !== selectedVertexIdx) {
            sphere.material.color.copy(sphere.userData.baseColor)
            sphere.scale.setScalar(1)
            sphere.visible = showVerts  // Reset visibility to selection mode setting
          }
        }
      })
    }
    
    // Apply new hover highlight (from spreadsheet) - blue tint
    if (hoveredFaceId || hoveredElementId) {
      geometryGroup.traverse((child) => {
        if (child.isMesh) {
          const isHoveredByFace = child.userData.faceId === hoveredFaceId
          const isHoveredByElement = faceMatchesElement(child.userData.faceId, hoveredElementId)
          if (isHoveredByFace || isHoveredByElement) {
            // Don't override selection highlight with hover highlight
            const isSelectedFace = child.userData.faceId === selectedFaceId
            const isSelectedElement = faceMatchesElement(child.userData.faceId, selectedElementId)
            if (isSelectedFace || isSelectedElement) return
            
            const baseColor = child.userData.baseColor
            if (baseColor) {
              const hsl = {}
              baseColor.getHSL(hsl)
              child.material.color.setHSL(hsl.h, hsl.s, Math.min(1, hsl.l + 0.2))
            }
            if (child.material.emissive) {
              child.material.emissive.setHex(0x152030)  // Blue tint for hover
            }
          }
        }
      })
    }
    
    if (hoveredVertexIdx !== null && vertexGroup) {
      vertexGroup.children.forEach((sphere) => {
        if (sphere.userData.vertexIndex === hoveredVertexIdx) {
          // Don't override selection highlight with hover highlight
          if (sphere.userData.vertexIndex === selectedVertexIdx) return
          sphere.material.color.setHex(0x6090c0)  // Blue hover
          sphere.scale.setScalar(1.5)
          if (showVerts) {
            sphere.visible = true
          }
        }
      })
    }
  }, [hoveredFaceId, hoveredVertexIdx, hoveredElementId, selectedFaceId, selectedVertexIdx, selectedElementId, selectionMode])

  // Reset view
  const resetView = useCallback(() => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls) return
    
    camera.position.set(3, 2, 4)
    controls.target.set(0, 0, 0)
    controls.update()
  }, [])

  return { resetView }
}

// Helper functions
function clearGroup(group) {
  if (!group) return
  while (group.children.length > 0) {
    const child = group.children[0]
    if (child.geometry) child.geometry.dispose()
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose())
      } else {
        child.material.dispose()
      }
    }
    if (child.element) {
      child.element.remove()
    }
    group.remove(child)
  }
}

function createPolygonMesh(panel, viewMode, colorMode) {
  const { points, color, id } = panel
  
  if (!points || points.length < 3) return null
  
  // Extract panel index from face id (e.g., "0-front" -> "0", "1-None" -> "1")
  // Keep as string for consistent comparison with store's selectedElementId
  const panelId = id ? id.split('-')[0] : null
  
  const geometry = new THREE.BufferGeometry()
  
  const vertices = []
  for (const p of points) {
    vertices.push(p[0], p[1], p[2] || 0)
  }
  
  const indices = []
  for (let i = 1; i < points.length - 1; i++) {
    indices.push(0, i, i + 1)
    indices.push(0, i + 1, i)
  }
  
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  
  let materialColor
  if (colorMode === 'uniform') {
    materialColor = new THREE.Color(0x888888)
  } else {
    materialColor = color ? new THREE.Color(color) : new THREE.Color(0x888888)
  }
  
  let material
  if (viewMode === 'lit') {
    material = new THREE.MeshPhongMaterial({
      color: materialColor,
      flatShading: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    })
  } else if (viewMode === 'unlit') {
    material = new THREE.MeshBasicMaterial({
      color: materialColor,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    })
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
    })
  } else {
    material = new THREE.MeshBasicMaterial({ visible: false })
  }
  
  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData.isFill = true
  mesh.userData.baseColor = materialColor
  mesh.userData.panelId = panelId  // Numeric panel index for element selection
  mesh.userData.faceId = id        // Full face ID (e.g., "0-front")
  
  // Edge lines - visible outline on all faces
  const edgeVertices = []
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i]
    const p2 = points[(i + 1) % points.length]
    edgeVertices.push(p1[0], p1[1], p1[2] || 0)
    edgeVertices.push(p2[0], p2[1], p2[2] || 0)
  }
  
  const edgeGeometry = new THREE.BufferGeometry()
  edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edgeVertices, 3))
  
  let edgeColor, edgeOpacity
  if (viewMode === 'wireframe') {
    edgeColor = materialColor
    edgeOpacity = 1.0
  } else if (viewMode === 'xray') {
    edgeColor = 0x000000
    edgeOpacity = 0.3
  } else {
    // Lit/Unlit - show dark edges for face boundaries
    edgeColor = 0x1a1a1a
    edgeOpacity = 1.0
  }
  
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: edgeColor,
    opacity: edgeOpacity,
    transparent: edgeOpacity < 1.0,
  })
  
  const edgeLines = new THREE.LineSegments(edgeGeometry, edgeMaterial)
  edgeLines.userData.isEdge = true
  edgeLines.userData.baseColor = materialColor
  mesh.add(edgeLines)
  
  return mesh
}

function createLabels(geometryData, labelGroup) {
  geometryData.panels.forEach((panel, idx) => {
    if (!panel.points || panel.points.length < 3) return
    
    let cx = 0, cy = 0, cz = 0
    panel.points.forEach((p) => {
      cx += p[0]
      cy += p[1]
      cz += p[2] || 0
    })
    cx /= panel.points.length
    cy /= panel.points.length
    cz /= panel.points.length
    
    const labelDiv = document.createElement('div')
    labelDiv.className = 'face-label'
    labelDiv.textContent = panel.id || `face_${idx}`
    
    const label = new CSS2DObject(labelDiv)
    label.position.set(cx, cy, cz)
    labelGroup.add(label)
  })
}

function createVertexMarkers(geometryData, vertexGroup, visible = true, scale = 1.0) {
  const uniqueVertices = []
  const vertexMap = new Map()
  const TOLERANCE = 0.0001
  
  const hashVertex = (x, y, z) => {
    const rx = Math.round(x / TOLERANCE) * TOLERANCE
    const ry = Math.round(y / TOLERANCE) * TOLERANCE
    const rz = Math.round(z / TOLERANCE) * TOLERANCE
    return `${rx.toFixed(4)},${ry.toFixed(4)},${rz.toFixed(4)}`
  }
  
  let globalIdx = 0
  geometryData.panels.forEach((panel) => {
    if (!panel.points) return
    panel.points.forEach((p) => {
      const hash = hashVertex(p[0], p[1], p[2] || 0)
      if (!vertexMap.has(hash)) {
        vertexMap.set(hash, globalIdx)
        uniqueVertices.push({ x: p[0], y: p[1], z: p[2] || 0, index: globalIdx })
        globalIdx++
      }
    })
  })
  
  const baseSize = 0.02 * scale
  const sphereGeometry = new THREE.SphereGeometry(baseSize, 8, 8)
  const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff })
  
  uniqueVertices.forEach((v) => {
    const sphere = new THREE.Mesh(sphereGeometry.clone(), sphereMaterial.clone())
    sphere.position.set(v.x, v.y, v.z)
    sphere.userData.isVertex = true
    sphere.userData.vertexIndex = v.index
    sphere.userData.baseColor = new THREE.Color(0x00ffff)
    sphere.userData.baseScale = scale  // Store base scale for selection/hover
    sphere.visible = visible  // Control visibility
    vertexGroup.add(sphere)
  })
}
