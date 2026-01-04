/**
 * Scene Registry - Direct bridge between data source and Three.js
 * 
 * This module allows geometry data to flow directly to Three.js without
 * going through React state/scheduling. This eliminates the 600ms+ delay
 * that React/Zustand adds when processing large state updates.
 * 
 * Flow:
 *   IPC/API response → sceneRegistry.updateScene(data) → Three.js update
 *   
 * Instead of:
 *   IPC/API response → Zustand state → React scheduler → useEffect → Three.js
 */

// The registered scene update function
let sceneUpdateFn = null

// Current geometry data (for consumers that need it synchronously)
let currentGeometryData = null

/**
 * Register the scene update function from useThreeScene.
 * Called once when the Three.js scene is initialized.
 */
export function registerSceneUpdate(fn) {
  sceneUpdateFn = fn
}

/**
 * Unregister the scene update function.
 * Called when the Three.js scene is unmounted.
 */
export function unregisterSceneUpdate() {
  sceneUpdateFn = null
}

/**
 * Update the scene directly with new geometry data.
 * This bypasses React entirely - data goes straight to Three.js.
 * 
 * @param {Object} geometryData - The geometry data to render
 * @returns {boolean} - True if update was delivered, false if no scene registered
 */
export function updateScene(geometryData) {
  currentGeometryData = geometryData
  
  if (sceneUpdateFn) {
    sceneUpdateFn(geometryData)
    return true
  }
  return false
}

/**
 * Get the current geometry data synchronously.
 * Useful for consumers that need data without subscribing to state.
 */
export function getCurrentGeometryData() {
  return currentGeometryData
}

/**
 * Check if a scene is registered.
 */
export function hasRegisteredScene() {
  return sceneUpdateFn !== null
}
