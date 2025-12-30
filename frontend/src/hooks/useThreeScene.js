import { useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer'
import { useViewportStore } from '../stores/viewportStore'

export function useThreeScene(containerRef, geometryData) {
  const sceneRef = useRef(null)
  const cameraRef = useRef(null)
  const rendererRef = useRef(null)
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
  const selectionRef = useRef({ selectedFaceId: null, selectedVertexIdx: null })
  const hoverRef = useRef({ hoveredFaceId: null, hoveredVertexIdx: null })

  const {
    viewMode,
    colorMode,
    showFaceLabels,
    hideOccludedLabels,
    showVertices,
    enableInertia,
    selectedFaceId,
    selectedVertexIdx,
    setSelectedFace,
    setSelectedVertex,
    hoveredFaceId,
    hoveredVertexIdx,
    setHoveredFace,
    setHoveredVertex,
    clearHover,
  } = useViewportStore()

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

  // Initialize scene
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const width = container.clientWidth
    const height = container.clientHeight

    // Scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1a2e)
    sceneRef.current = scene

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000)
    camera.position.set(3, 2, 4)
    cameraRef.current = camera

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(window.devicePixelRatio)
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

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

    // Grid
    const gridHelper = new THREE.GridHelper(4, 20, 0x444444, 0x333333)
    scene.add(gridHelper)

    // Axes
    const axesHelper = new THREE.AxesHelper(0.5)
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
      
      renderer.render(scene, camera)
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
      labelRenderer.setSize(w, h)
    }
    window.addEventListener('resize', handleResize)

    // Setup face picking
    const handleMouseMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect()
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      
      updateHover()
    }
    
    const handleMouseLeave = () => {
      resetHover()
    }
    
    // Click handler for selection
    const handleClick = (e) => {
      // Don't select on alt+click (panning)
      if (e.altKey) return
      
      const store = useViewportStore.getState()
      
      // Check if we have a hovered vertex first
      if (hoveredVertexRef.current) {
        const vertexIdx = hoveredVertexRef.current.userData.vertexIndex
        if (vertexIdx !== undefined) {
          store.setSelectedVertex(vertexIdx)
        }
        return
      }
      
      // Check if we have a hovered mesh
      if (hoveredMeshRef.current) {
        const faceId = hoveredMeshRef.current.userData.faceId
        if (faceId) {
          store.setSelectedFace(faceId)
        }
        return
      }
      
      // Click on nothing - clear selection
      store.clearSelection()
    }
    
    renderer.domElement.addEventListener('mousemove', handleMouseMove)
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
      renderer.domElement.removeEventListener('mousemove', handleMouseMove)
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
    const showVerts = store.showVertices
    const currentSelectedFaceId = store.selectedFaceId
    const currentSelectedVertexIdx = store.selectedVertexIdx
    
    if (!raycaster || !camera || !geometryGroup || !renderer) return
    
    raycaster.setFromCamera(mouse, camera)
    
    // Check vertices first
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
        newHoveredVertex.material.color.setHex(0xffff00)
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
    
    // Update mesh hover
    if (hoveredMeshRef.current !== newHovered) {
      if (hoveredMeshRef.current?.userData.baseColor) {
        // Only reset to base color if not selected
        const prevFaceId = hoveredMeshRef.current.userData.faceId
        if (prevFaceId !== currentSelectedFaceId) {
          hoveredMeshRef.current.material.color.copy(hoveredMeshRef.current.userData.baseColor)
          if (hoveredMeshRef.current.material.emissive) {
            hoveredMeshRef.current.material.emissive.setHex(0x000000)
          }
        }
      }
      
      if (newHovered?.userData.baseColor) {
        const baseColor = newHovered.userData.baseColor
        const hsl = {}
        baseColor.getHSL(hsl)
        newHovered.material.color.setHSL(hsl.h, hsl.s, Math.min(1, hsl.l + 0.3))
        if (newHovered.material.emissive) {
          newHovered.material.emissive.setHex(0x222222)
        }
        // Sync to store for spreadsheet highlighting
        const faceId = newHovered.userData.faceId
        if (faceId) {
          store.setHoveredFace(faceId)
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
    const store = useViewportStore.getState()
    const currentSelectedFaceId = store.selectedFaceId
    const currentSelectedVertexIdx = store.selectedVertexIdx
    
    if (hoveredMeshRef.current?.userData.baseColor) {
      // Only reset to base color if not selected
      const faceId = hoveredMeshRef.current.userData.faceId
      if (faceId !== currentSelectedFaceId) {
        hoveredMeshRef.current.material.color.copy(hoveredMeshRef.current.userData.baseColor)
        if (hoveredMeshRef.current.material.emissive) {
          hoveredMeshRef.current.material.emissive.setHex(0x000000)
        }
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
    
    // Create vertices (always create for selection, but control visibility)
    createVertexMarkers(geometryData, vertexGroup, showVertices)
  }, [geometryData, viewMode, colorMode, showFaceLabels, showVertices])

  // Handle selection highlighting from spreadsheet
  useEffect(() => {
    const geometryGroup = geometryGroupRef.current
    const vertexGroup = vertexGroupRef.current
    if (!geometryGroup) return
    
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
          // Reset visibility based on showVertices setting
          sphere.visible = showVertices
        }
      })
    }
    
    // Highlight selected face
    if (selectedFaceId) {
      geometryGroup.traverse((child) => {
        if (child.isMesh && child.userData.faceId === selectedFaceId) {
          const baseColor = child.userData.baseColor
          if (baseColor) {
            const hsl = {}
            baseColor.getHSL(hsl)
            child.material.color.setHSL(hsl.h, hsl.s, Math.min(1, hsl.l + 0.3))
          }
          if (child.material.emissive) {
            child.material.emissive.setHex(0x333333)
          }
        }
      })
    }
    
    // Highlight selected vertex
    if (selectedVertexIdx !== null && vertexGroup) {
      vertexGroup.children.forEach((sphere) => {
        if (sphere.userData.vertexIndex === selectedVertexIdx) {
          sphere.material.color.setHex(0xffff00)
          sphere.scale.setScalar(2)
          sphere.visible = true  // Show selected vertex even if vertices are hidden
        }
      })
    }
  }, [selectedFaceId, selectedVertexIdx, showVertices])

  // Handle hover highlighting from spreadsheet
  useEffect(() => {
    const geometryGroup = geometryGroupRef.current
    const vertexGroup = vertexGroupRef.current
    if (!geometryGroup) return
    
    const prevHover = hoverRef.current
    const newHover = { hoveredFaceId, hoveredVertexIdx }
    hoverRef.current = newHover
    
    // Only process if hover came from spreadsheet (not from viewport mouse)
    // We detect this by checking if the change was external
    // Skip if we're already tracking this hover in the viewport refs
    const meshHoveredByViewport = hoveredMeshRef.current?.userData.faceId === hoveredFaceId
    const vertexHoveredByViewport = hoveredVertexRef.current?.userData.vertexIndex === hoveredVertexIdx
    
    if (meshHoveredByViewport || vertexHoveredByViewport) return
    
    // Clear previous hover highlight (if it was from spreadsheet)
    if (prevHover.hoveredFaceId && prevHover.hoveredFaceId !== hoveredFaceId) {
      geometryGroup.traverse((child) => {
        if (child.isMesh && child.userData.faceId === prevHover.hoveredFaceId && child.userData.baseColor) {
          // Only reset if not selected
          if (child.userData.faceId !== selectedFaceId) {
            child.material.color.copy(child.userData.baseColor)
            if (child.material.emissive) {
              child.material.emissive.setHex(0x000000)
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
          }
        }
      })
    }
    
    // Apply new hover highlight (from spreadsheet)
    if (hoveredFaceId) {
      geometryGroup.traverse((child) => {
        if (child.isMesh && child.userData.faceId === hoveredFaceId) {
          const baseColor = child.userData.baseColor
          if (baseColor) {
            const hsl = {}
            baseColor.getHSL(hsl)
            child.material.color.setHSL(hsl.h, hsl.s, Math.min(1, hsl.l + 0.3))
          }
          if (child.material.emissive) {
            child.material.emissive.setHex(0x222222)
          }
        }
      })
    }
    
    if (hoveredVertexIdx !== null && vertexGroup) {
      vertexGroup.children.forEach((sphere) => {
        if (sphere.userData.vertexIndex === hoveredVertexIdx) {
          sphere.material.color.setHex(0xffff00)
          sphere.scale.setScalar(1.5)
          sphere.visible = true  // Show hovered vertex even if vertices are hidden
        }
      })
    }
  }, [hoveredFaceId, hoveredVertexIdx, selectedFaceId, selectedVertexIdx])

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
    })
  } else if (viewMode === 'unlit') {
    material = new THREE.MeshBasicMaterial({
      color: materialColor,
      side: THREE.DoubleSide,
    })
  } else if (viewMode === 'xray') {
    material = new THREE.MeshBasicMaterial({
      color: materialColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    })
  } else {
    material = new THREE.MeshBasicMaterial({ visible: false })
  }
  
  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData.isFill = true
  mesh.userData.baseColor = materialColor
  mesh.userData.panelId = id
  mesh.userData.faceId = id
  
  // Edge lines
  const edgeVertices = []
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i]
    const p2 = points[(i + 1) % points.length]
    edgeVertices.push(p1[0], p1[1], p1[2] || 0)
    edgeVertices.push(p2[0], p2[1], p2[2] || 0)
  }
  
  const edgeGeometry = new THREE.BufferGeometry()
  edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edgeVertices, 3))
  
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: viewMode === 'wireframe' ? materialColor : 0x000000,
    opacity: viewMode === 'wireframe' ? 1.0 : 0.5,
    transparent: viewMode !== 'wireframe',
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

function createVertexMarkers(geometryData, vertexGroup, visible = true) {
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
  
  const sphereGeometry = new THREE.SphereGeometry(0.02, 8, 8)
  const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff })
  
  uniqueVertices.forEach((v) => {
    const sphere = new THREE.Mesh(sphereGeometry.clone(), sphereMaterial.clone())
    sphere.position.set(v.x, v.y, v.z)
    sphere.userData.isVertex = true
    sphere.userData.vertexIndex = v.index
    sphere.userData.baseColor = new THREE.Color(0x00ffff)
    sphere.visible = visible  // Control visibility
    vertexGroup.add(sphere)
  })
}
