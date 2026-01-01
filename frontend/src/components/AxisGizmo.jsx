import { useRef, useEffect, useCallback } from 'react'
import * as THREE from 'three'
import './AxisGizmo.css'

// Camera positions for each axis view
const AXIS_VIEWS = {
  '+X': { position: [5, 0, 0], up: [0, 1, 0] },
  '-X': { position: [-5, 0, 0], up: [0, 1, 0] },
  '+Y': { position: [0, 5, 0], up: [0, 0, -1] },
  '-Y': { position: [0, -5, 0], up: [0, 0, 1] },
  '+Z': { position: [0, 0, 5], up: [0, 1, 0] },
  '-Z': { position: [0, 0, -5], up: [0, 1, 0] },
}

function AxisGizmo({ camera, controls, onViewChange }) {
  const containerRef = useRef(null)
  const rendererRef = useRef(null)
  const sceneRef = useRef(null)
  const gizmoCameraRef = useRef(null)
  const axisGroupRef = useRef(null)
  const raycasterRef = useRef(new THREE.Raycaster())
  const mouseRef = useRef(new THREE.Vector2())

  // Initialize the gizmo scene
  useEffect(() => {
    if (!containerRef.current) return

    const container = containerRef.current
    const size = 140

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true 
    })
    renderer.setSize(size, size)
    renderer.setPixelRatio(window.devicePixelRatio)
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Create scene
    const scene = new THREE.Scene()
    sceneRef.current = scene

    // Create orthographic camera for gizmo
    const gizmoCamera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 100)
    gizmoCamera.position.set(5, 5, 5)
    gizmoCamera.lookAt(0, 0, 0)
    gizmoCameraRef.current = gizmoCamera

    // Create axis group
    const axisGroup = new THREE.Group()
    axisGroupRef.current = axisGroup
    scene.add(axisGroup)

    // Create axis lines
    const lineLength = 0.8
    const lineMaterial = (color) => new THREE.LineBasicMaterial({ color })

    // X axis (red)
    const xGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(lineLength, 0, 0)
    ])
    axisGroup.add(new THREE.Line(xGeom, lineMaterial(0xff4444)))

    // Y axis (green)
    const yGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, lineLength, 0)
    ])
    axisGroup.add(new THREE.Line(yGeom, lineMaterial(0x44ff44)))

    // Z axis (blue)
    const zGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, lineLength)
    ])
    axisGroup.add(new THREE.Line(zGeom, lineMaterial(0x4488ff)))

    // Create clickable spheres at axis ends
    const sphereRadius = 0.22
    const sphereGeom = new THREE.SphereGeometry(sphereRadius, 16, 16)

    // X+ sphere (red)
    const xPosSphere = new THREE.Mesh(sphereGeom, new THREE.MeshBasicMaterial({ color: 0xff4444 }))
    xPosSphere.position.set(lineLength + sphereRadius, 0, 0)
    xPosSphere.userData.axis = '+X'
    axisGroup.add(xPosSphere)

    // X- sphere (red, transparent with outline)
    const xNegSphere = new THREE.Mesh(sphereGeom, new THREE.MeshBasicMaterial({ 
      color: 0xff4444, 
      transparent: true, 
      opacity: 0.4 
    }))
    xNegSphere.position.set(-(lineLength + sphereRadius), 0, 0)
    xNegSphere.userData.axis = '-X'
    axisGroup.add(xNegSphere)
    
    // X- outline ring (will be oriented in animation loop)
    const xNegRing = new THREE.Mesh(
      new THREE.RingGeometry(sphereRadius * 0.85, sphereRadius, 32),
      new THREE.MeshBasicMaterial({ color: 0xff4444, side: THREE.DoubleSide, depthTest: false })
    )
    xNegRing.position.copy(xNegSphere.position)
    xNegRing.userData.isRing = true
    xNegRing.renderOrder = 1
    axisGroup.add(xNegRing)

    // Y+ sphere (green)
    const yPosSphere = new THREE.Mesh(sphereGeom, new THREE.MeshBasicMaterial({ color: 0x44ff44 }))
    yPosSphere.position.set(0, lineLength + sphereRadius, 0)
    yPosSphere.userData.axis = '+Y'
    axisGroup.add(yPosSphere)

    // Y- sphere (green, transparent with outline)
    const yNegSphere = new THREE.Mesh(sphereGeom, new THREE.MeshBasicMaterial({ 
      color: 0x44ff44, 
      transparent: true, 
      opacity: 0.4 
    }))
    yNegSphere.position.set(0, -(lineLength + sphereRadius), 0)
    yNegSphere.userData.axis = '-Y'
    axisGroup.add(yNegSphere)
    
    // Y- outline ring (will be oriented in animation loop)
    const yNegRing = new THREE.Mesh(
      new THREE.RingGeometry(sphereRadius * 0.85, sphereRadius, 32),
      new THREE.MeshBasicMaterial({ color: 0x44ff44, side: THREE.DoubleSide, depthTest: false })
    )
    yNegRing.position.copy(yNegSphere.position)
    yNegRing.userData.isRing = true
    yNegRing.renderOrder = 1
    axisGroup.add(yNegRing)

    // Z+ sphere (blue)
    const zPosSphere = new THREE.Mesh(sphereGeom, new THREE.MeshBasicMaterial({ color: 0x4488ff }))
    zPosSphere.position.set(0, 0, lineLength + sphereRadius)
    zPosSphere.userData.axis = '+Z'
    axisGroup.add(zPosSphere)

    // Z- sphere (blue, transparent with outline)
    const zNegSphere = new THREE.Mesh(sphereGeom, new THREE.MeshBasicMaterial({ 
      color: 0x4488ff, 
      transparent: true, 
      opacity: 0.4 
    }))
    zNegSphere.position.set(0, 0, -(lineLength + sphereRadius))
    zNegSphere.userData.axis = '-Z'
    axisGroup.add(zNegSphere)
    
    // Z- outline ring (will be oriented in animation loop)
    const zNegRing = new THREE.Mesh(
      new THREE.RingGeometry(sphereRadius * 0.85, sphereRadius, 32),
      new THREE.MeshBasicMaterial({ color: 0x4488ff, side: THREE.DoubleSide, depthTest: false })
    )
    zNegRing.position.copy(zNegSphere.position)
    zNegRing.userData.isRing = true
    zNegRing.renderOrder = 1
    axisGroup.add(zNegRing)

    // Add axis labels (dark text for visibility on colored spheres)
    const createLabel = (text, position) => {
      const canvas = document.createElement('canvas')
      canvas.width = 64
      canvas.height = 64
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#000000'
      ctx.font = 'bold 48px Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, 32, 35)  // Shift down a few pixels

      const texture = new THREE.CanvasTexture(canvas)
      const spriteMaterial = new THREE.SpriteMaterial({ 
        map: texture,
        depthTest: false,
        depthWrite: false
      })
      const sprite = new THREE.Sprite(spriteMaterial)
      sprite.position.copy(position)
      sprite.scale.setScalar(0.4)
      sprite.renderOrder = 999
      return sprite
    }

    axisGroup.add(createLabel('X', new THREE.Vector3(lineLength + sphereRadius, 0, 0)))
    axisGroup.add(createLabel('Y', new THREE.Vector3(0, lineLength + sphereRadius, 0)))
    axisGroup.add(createLabel('Z', new THREE.Vector3(0, 0, lineLength + sphereRadius)))

    // Cleanup
    return () => {
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [])

  // Sync gizmo orientation with main camera
  useEffect(() => {
    if (!camera || !gizmoCameraRef.current || !rendererRef.current || !sceneRef.current) return

    let animationId

    const animate = () => {
      animationId = requestAnimationFrame(animate)

      // Copy rotation from main camera to gizmo camera
      const gizmoCamera = gizmoCameraRef.current
      
      // Position gizmo camera based on main camera's orientation
      const direction = new THREE.Vector3()
      camera.getWorldDirection(direction)
      
      // Position gizmo camera opposite to where main camera is looking
      gizmoCamera.position.copy(direction).multiplyScalar(-5)
      gizmoCamera.up.copy(camera.up)
      gizmoCamera.lookAt(0, 0, 0)
      
      // Make rings face the camera (billboard)
      if (axisGroupRef.current) {
        axisGroupRef.current.traverse((child) => {
          if (child.userData.isRing) {
            child.lookAt(gizmoCamera.position)
          }
        })
      }

      rendererRef.current.render(sceneRef.current, gizmoCamera)
    }

    animate()

    return () => {
      cancelAnimationFrame(animationId)
    }
  }, [camera])

  // Handle click on axis spheres
  const handleClick = useCallback((e) => {
    if (!containerRef.current || !gizmoCameraRef.current || !axisGroupRef.current) return

    const rect = containerRef.current.getBoundingClientRect()
    mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

    raycasterRef.current.setFromCamera(mouseRef.current, gizmoCameraRef.current)
    
    const intersects = raycasterRef.current.intersectObjects(axisGroupRef.current.children, false)
    
    for (const intersect of intersects) {
      if (intersect.object.userData.axis) {
        const axis = intersect.object.userData.axis
        const view = AXIS_VIEWS[axis]
        
        if (view && camera && controls) {
          // Animate to new view
          animateToView(view.position, view.up)
        }
        break
      }
    }
  }, [camera, controls])

  // Animate camera to new position
  const animateToView = useCallback((targetPos, targetUp) => {
    if (!camera || !controls) return

    const startPos = camera.position.clone()
    const startUp = camera.up.clone()
    const target = controls.target.clone()
    
    // Calculate distance from target
    const distance = startPos.distanceTo(target)
    
    // New position at same distance
    const endPos = new THREE.Vector3(...targetPos).normalize().multiplyScalar(distance).add(target)
    const endUp = new THREE.Vector3(...targetUp)

    const duration = 300
    const startTime = Date.now()

    const animate = () => {
      const elapsed = Date.now() - startTime
      const t = Math.min(elapsed / duration, 1)
      
      // Ease out cubic
      const easeT = 1 - Math.pow(1 - t, 3)

      camera.position.lerpVectors(startPos, endPos, easeT)
      camera.up.lerpVectors(startUp, endUp, easeT).normalize()
      camera.lookAt(target)
      controls.update()

      if (t < 1) {
        requestAnimationFrame(animate)
      }
    }

    animate()
  }, [camera, controls])

  return (
    <div 
      ref={containerRef} 
      className="axis-gizmo"
      onClick={handleClick}
    />
  )
}

export default AxisGizmo
