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

// Import modular utilities from ./three/
import {
  BLOOM_LAYER,
  PREVIEW_PANEL,
  COLORS,
  clearGroup,
  createPolygonMesh,
  createLabels,
  createVertexMarkers,
  applySelectionHighlight,
  applyHoverHighlight,
  resetToBaseColor,
  PreviewBrush,
  SnapHelper,
} from './three'

// ============================================
// useThreeScene Hook
// ============================================
// Main hook for managing the Three.js viewport scene.
// 
// Structure:
// 1. Refs & Store Subscriptions
// 2. Creation Mode Effects
// 3. Scene Initialization (useEffect)
//    - Scene, Camera, Renderer setup
//    - Bloom post-processing pipeline
//    - Controls & event handlers
//    - Animation loop
// 4. Geometry Update Effects
// 5. Selection & Hover Effects
// 6. Exported Methods
// ============================================

export function useThreeScene(containerRef, geometryData) {
  // ============================================
  // Refs
  // ============================================
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
  const previewBrushRef = useRef(null)  // PreviewBrush instance
  const snapHelperRef = useRef(null)    // SnapHelper instance for snapping to panels
  const ctrlKeyRef = useRef(false)      // Track ctrl key state for disabling snap
  const xyPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0))  // XY plane at z=0

  // ============================================
  // Store Subscriptions
  // ============================================
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

  // ============================================
  // Settings Sync Effects
  // ============================================
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
  
  // ============================================
  // Creation Mode Effects
  // ============================================
  // Clean up preview when creation mode is disabled
  useEffect(() => {
    if (!creationMode || panelChain.length === 0) {
      // Dispose preview brush when exiting creation mode
      if (previewBrushRef.current) {
        previewBrushRef.current.dispose()
        previewBrushRef.current = null
      }
      // Clear snap helper visuals
      if (snapHelperRef.current) {
        snapHelperRef.current.clear()
      }
    }
  }, [creationMode, panelChain.length])

  // ============================================
  // Scene Initialization
  // ============================================
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const width = container.clientWidth
    const height = container.clientHeight

    // --------------------------------------------
    // Scene, Camera, Renderer Setup
    // --------------------------------------------
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(COLORS.background)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000)
    camera.position.set(3, 2, 4)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.toneMapping = THREE.ReinhardToneMapping
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // ============================================
    // Selective Bloom Setup with Depth-Aware Compositing
    // Pipeline:
    // 1. Render main scene → capture depth
    // 2. Render bloom objects → capture color + depth  
    // 3. Depth-mask the bloom objects (remove occluded pixels)
    // 4. Apply bloom/glow to the MASKED result
    // 5. Simple additive composite on top of main scene
    // ============================================
    
    // Render target for main scene depth
    const mainRenderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthTexture: new THREE.DepthTexture(width, height),
    })
    mainRenderTarget.depthTexture.format = THREE.DepthFormat
    mainRenderTarget.depthTexture.type = THREE.UnsignedShortType
    
    // Render target for bloom objects (color + depth)
    const bloomObjectsTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthTexture: new THREE.DepthTexture(width, height),
    })
    bloomObjectsTarget.depthTexture.format = THREE.DepthFormat
    bloomObjectsTarget.depthTexture.type = THREE.UnsignedShortType
    
    // Render target for depth-masked bloom objects (before blur)
    const maskedBloomTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    })
    
    // Bloom scene - contains only objects that should glow
    const bloomScene = new THREE.Scene()
    bloomScene.background = new THREE.Color(0x000000)
    
    // Depth masking shader - masks bloom objects by main scene depth
    const depthMaskQuadGeo = new THREE.PlaneGeometry(2, 2)
    const depthMaskQuadMat = new THREE.ShaderMaterial({
      uniforms: {
        bloomColorTexture: { value: null },
        bloomDepthTexture: { value: null },
        mainDepthTexture: { value: null },
        cameraNear: { value: camera.near },
        cameraFar: { value: camera.far },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D bloomColorTexture;
        uniform sampler2D bloomDepthTexture;
        uniform sampler2D mainDepthTexture;
        uniform float cameraNear;
        uniform float cameraFar;
        varying vec2 vUv;
        
        float linearizeDepth(float depth) {
          float z = depth * 2.0 - 1.0;
          return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - z * (cameraFar - cameraNear));
        }
        
        void main() {
          float mainDepth = texture2D(mainDepthTexture, vUv).r;
          float bloomDepth = texture2D(bloomDepthTexture, vUv).r;
          vec4 bloomColor = texture2D(bloomColorTexture, vUv);
          
          // Linearize depths for comparison
          float mainLinear = linearizeDepth(mainDepth);
          float bloomLinear = linearizeDepth(bloomDepth);
          
          // Only show bloom pixels that are in front of main scene
          float visible = step(bloomLinear, mainLinear + 0.01);
          
          gl_FragColor = vec4(bloomColor.rgb * visible, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    })
    const depthMaskQuad = new THREE.Mesh(depthMaskQuadGeo, depthMaskQuadMat)
    const depthMaskScene = new THREE.Scene()
    depthMaskScene.add(depthMaskQuad)
    
    // Bloom composer - applies bloom to the MASKED bloom objects
    const maskedBloomPass = new RenderPass(depthMaskScene, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1))
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      PREVIEW_PANEL.bloomStrength,
      PREVIEW_PANEL.bloomRadius,
      PREVIEW_PANEL.bloomThreshold
    )
    
    const bloomComposer = new EffectComposer(renderer)
    bloomComposer.renderToScreen = false
    bloomComposer.addPass(maskedBloomPass)
    bloomComposer.addPass(bloomPass)
    bloomComposerRef.current = bloomComposer
    
    // Final composite quad - simple additive blend
    const compositeQuadGeo = new THREE.PlaneGeometry(2, 2)
    const compositeQuadMat = new THREE.ShaderMaterial({
      uniforms: { 
        bloomTexture: { value: null },
        opacity: { value: PREVIEW_PANEL.bloomOpacity },
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
          gl_FragColor = vec4(bloom.rgb * opacity, 1.0);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false
    })
    const compositeQuad = new THREE.Mesh(compositeQuadGeo, compositeQuadMat)
    const compositeQuadScene = new THREE.Scene()
    const compositeQuadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    compositeQuadScene.add(compositeQuad)
    
    // Store bloom data on scene
    scene.userData.bloomScene = bloomScene
    scene.userData.bloomComposer = bloomComposer
    scene.userData.depthMaskQuad = depthMaskQuad
    scene.userData.compositeQuad = compositeQuad
    scene.userData.compositeQuadScene = compositeQuadScene
    scene.userData.compositeQuadCamera = compositeQuadCamera
    scene.userData.mainRenderTarget = mainRenderTarget
    scene.userData.bloomObjectsTarget = bloomObjectsTarget
    scene.userData.maskedBloomTarget = maskedBloomTarget

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
    gridHelper.renderOrder = -1  // Render before other objects
    gridHelper.material.depthWrite = false  // Don't write to depth buffer
    scene.add(gridHelper)

    // Axes - smaller, Blender-style
    const axesHelper = new THREE.AxesHelper(0.4)
    scene.add(axesHelper)

    // --------------------------------------------
    // Scene Groups
    // --------------------------------------------
    const geometryGroup = new THREE.Group()
    scene.add(geometryGroup)
    geometryGroupRef.current = geometryGroup

    const labelGroup = new THREE.Group()
    scene.add(labelGroup)
    labelGroupRef.current = labelGroup

    const vertexGroup = new THREE.Group()
    scene.add(vertexGroup)
    vertexGroupRef.current = vertexGroup

    // --------------------------------------------
    // CSS2D Label Renderer
    // --------------------------------------------
    const labelRenderer = new CSS2DRenderer()
    labelRenderer.setSize(width, height)
    labelRenderer.domElement.style.position = 'absolute'
    labelRenderer.domElement.style.top = '0'
    labelRenderer.domElement.style.pointerEvents = 'none'
    container.appendChild(labelRenderer.domElement)
    labelRendererRef.current = labelRenderer

    // --------------------------------------------
    // Label Occlusion Culling
    // --------------------------------------------
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

    // --------------------------------------------
    // Animation Loop
    // --------------------------------------------
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate)
      controls.update()
      
      // Update label occlusion
      if (settingsRef.current.showFaceLabels && settingsRef.current.hideOccludedLabels) {
        updateLabelOcclusion()
      }
      
      // Check if we have any bloom objects (creation mode preview)
      const previewBrush = previewBrushRef.current
      const hasBloomObjects = previewBrush?.visible
      
      if (hasBloomObjects) {
        const { bloomScene, bloomComposer, depthMaskQuad, compositeQuad, compositeQuadScene, compositeQuadCamera, mainRenderTarget, bloomObjectsTarget } = scene.userData
        
        // Step 1: Copy bloom objects to bloom scene
        while (bloomScene.children.length > 0) {
          bloomScene.remove(bloomScene.children[0])
        }
        
        // Clone wireframe and markers with world transforms
        const previewMesh = previewBrush.getMesh()
        if (previewMesh) {
          previewMesh.traverse((child) => {
            if (child.layers.isEnabled(BLOOM_LAYER)) {
              const temp = child.clone()
              if (temp.material) {
                temp.material = temp.material.clone()
                temp.material.depthWrite = true
              }
              child.getWorldPosition(temp.position)
              child.getWorldQuaternion(temp.quaternion)
              child.getWorldScale(temp.scale)
              bloomScene.add(temp)
            }
          })
        }
        
        previewBrush.getMarkers().forEach(marker => {
          if (marker.layers.isEnabled(BLOOM_LAYER)) {
            const temp = marker.clone()
            if (temp.material) {
              temp.material = temp.material.clone()
              temp.material.depthWrite = true
            }
            marker.getWorldPosition(temp.position)
            bloomScene.add(temp)
          }
        })
        
        // Step 2: Render main scene to capture depth
        renderer.setRenderTarget(mainRenderTarget)
        renderer.render(scene, camera)
        
        // Step 3: Render bloom objects to capture color + depth
        renderer.setRenderTarget(bloomObjectsTarget)
        renderer.setClearColor(0x000000, 1)
        renderer.clear()
        renderer.render(bloomScene, camera)
        
        // Step 4: Depth-mask the bloom objects (update uniforms for masking pass)
        depthMaskQuad.material.uniforms.bloomColorTexture.value = bloomObjectsTarget.texture
        depthMaskQuad.material.uniforms.bloomDepthTexture.value = bloomObjectsTarget.depthTexture
        depthMaskQuad.material.uniforms.mainDepthTexture.value = mainRenderTarget.depthTexture
        depthMaskQuad.material.uniforms.cameraNear.value = camera.near
        depthMaskQuad.material.uniforms.cameraFar.value = camera.far
        
        // Step 5: Apply bloom to the masked result (bloom composer reads from depthMaskQuad)
        renderer.setRenderTarget(null)
        bloomComposer.render()
        const bloomTexture = bloomComposer.readBuffer.texture
        
        // Step 6: Render main scene to screen
        renderer.setRenderTarget(null)
        renderer.render(scene, camera)
        
        // Step 7: Simple additive composite of bloomed result
        compositeQuad.material.uniforms.bloomTexture.value = bloomTexture
        
        renderer.autoClear = false
        renderer.render(compositeQuadScene, compositeQuadCamera)
        renderer.autoClear = true
      } else {
        // Normal rendering (no bloom)
        renderer.render(scene, camera)
      }
      
      labelRenderer.render(scene, camera)
    }
    animate()

    // --------------------------------------------
    // Resize Handler
    // --------------------------------------------
    const handleResize = () => {
      const w = container.clientWidth
      const h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
      scene.userData.bloomComposer?.setSize(w, h)
      scene.userData.mainRenderTarget?.setSize(w, h)
      scene.userData.bloomObjectsTarget?.setSize(w, h)
      scene.userData.maskedBloomTarget?.setSize(w, h)
      labelRenderer.setSize(w, h)
      // Update LineMaterial resolution for preview brush
      previewBrushRef.current?.updateResolution(w, h)
    }
    window.addEventListener('resize', handleResize)

    // --------------------------------------------
    // Mouse Event Handlers
    // --------------------------------------------
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
      previewBrushRef.current?.hide()
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
      const endpoint = getSelectedPanelEndpoint()
      const appStore = useAppStore.getState()
      const geometryData = appStore.geometryData
      
      // Must have a selected panel to create from
      if (!endpoint) {
        previewBrushRef.current?.hide()
        snapHelperRef.current?.clear()
        return
      }
      
      // Use XZ plane (floor) for creation - panels rotate around Y axis
      const mousePoint = raycastToXZPlane()
      if (!mousePoint) {
        previewBrushRef.current?.hide()
        snapHelperRef.current?.clear()
        return
      }
      
      // Initialize PreviewBrush if needed
      if (!previewBrushRef.current) {
        previewBrushRef.current = new PreviewBrush(scene, containerRef.current)
      }
      
      // Initialize SnapHelper if needed
      if (!snapHelperRef.current) {
        snapHelperRef.current = new SnapHelper(scene)
      }
      
      // Check for snap target (unless ctrl is held)
      let targetPoint = mousePoint
      if (!ctrlKeyRef.current) {
        const snapResult = snapHelperRef.current.findSnapTarget(
          mousePoint,
          geometryData,
          endpoint.panelIndex  // Exclude the source panel
        )
        
        // Update snap visuals
        snapHelperRef.current.updateVisuals(snapResult, geometryGroupRef.current)
        
        // Use snap point if found
        if (snapResult) {
          targetPoint = snapResult.worldPoint
        }
      } else {
        // Ctrl held - clear snap visuals
        snapHelperRef.current.clear()
      }
      
      // Update preview with current endpoint and target position
      previewBrushRef.current.update(endpoint, targetPoint)
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
        
        // Don't allow new creation while previous is pending
        if (previewBrushRef.current?.isPending) {
          return
        }
        
        // Use XZ plane (floor) for creation
        const clickPoint = raycastToXZPlane()
        if (!clickPoint) return
        
        // Check for snap (unless ctrl is held)
        let targetPoint = clickPoint
        let snapInfo = null
        if (!ctrlKeyRef.current && snapHelperRef.current) {
          const snapResult = snapHelperRef.current.findSnapTarget(
            clickPoint,
            appStore.geometryData,
            endpoint.panelIndex
          )
          if (snapResult) {
            targetPoint = snapResult.worldPoint
            snapInfo = {
              spanId: snapResult.panelIndex,
              spanPoint: snapResult.spanPoint,
            }
          }
        }
        
        // Calculate distance in XZ plane
        const dx = targetPoint.x - endpoint.x
        const dz = targetPoint.z - endpoint.z
        const dist = Math.sqrt(dx * dx + dz * dz)
        
        if (dist >= 0.05) {
          // Lock the preview in place and show spinner
          previewBrushRef.current?.setPending(true)
          
          // Clear snap visuals
          snapHelperRef.current?.clear()
          
          // Create the panel, inserted after the selected panel
          // Start at endpoint, end at target position (use endpoint.y for height)
          const startPoint = { x: endpoint.x, y: endpoint.y, z: endpoint.z }
          const endPointCoord = { x: targetPoint.x, y: endpoint.y, z: targetPoint.z }
          
          // Pass parent's world rotation so the relative rotation is calculated correctly
          // addPanelFromPoints is now async and returns the new panel index
          appStore.addPanelFromPoints(startPoint, endPointCoord, endpoint.panelIndex, 0.25, endpoint.worldRotation, snapInfo)
            .then((newPanelIndex) => {
              // Clear pending state
              previewBrushRef.current?.setPending(false)
              
              if (newPanelIndex !== null) {
                // Clear the preview marker so it gets recreated at new position
                previewBrushRef.current?.clearMarkers()
                
                // Hide the preview mesh until mouse moves again
                previewBrushRef.current?.hide()
                
                // Select the newly created panel - geometry is now ready
                viewportStore.setSelectedElement(newPanelIndex)
                
                // Update preview after a short delay to ensure meshes are built
                setTimeout(() => {
                  updateCreationPreview()
                }, 50)
              }
            })
            .catch((err) => {
              // Clear pending state on error too
              previewBrushRef.current?.setPending(false)
              console.error('Failed to create panel:', err)
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

    // Track ctrl key for snap disable
    const handleKeyDown = (e) => {
      if (e.key === 'Control') {
        ctrlKeyRef.current = true
      }
    }
    
    const handleKeyUp = (e) => {
      if (e.key === 'Control') {
        ctrlKeyRef.current = false
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      renderer.domElement.removeEventListener('mousedown', handleMouseDown)
      renderer.domElement.removeEventListener('mousemove', handleMouseMove)
      renderer.domElement.removeEventListener('mousemove', handleMouseMoveForDrag)
      renderer.domElement.removeEventListener('mouseleave', handleMouseLeave)
      renderer.domElement.removeEventListener('click', handleClick)
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
      renderer.domElement.removeEventListener('pointermove', handlePointerMove)
      renderer.domElement.removeEventListener('pointerup', handlePointerUp)
      
      // Dispose snap helper
      snapHelperRef.current?.dispose()
      snapHelperRef.current = null
      
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
    
    // Skip selection highlighting in creation mode - the orange highlight is distracting
    if (creationMode) return
    
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
  }, [selectedElementId, selectedFaceId, selectedVertexIdx, selectionMode, creationMode])

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
