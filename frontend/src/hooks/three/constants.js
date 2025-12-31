/**
 * Constants and configuration for Three.js scene
 */

// Bloom layer - objects on this layer will glow
export const BLOOM_LAYER = 1;

// Camera defaults
export const DEFAULT_CAMERA_POSITION = { x: 3, y: 2, z: 4 };
export const DEFAULT_CAMERA_FOV = 45;

// Grid settings
export const GRID_SIZE = 10;
export const GRID_DIVISIONS = 10;

// Scene colors
export const COLORS = {
  background: 0x282828,
  vertexDefault: 0x00ffff,
  vertexHover: 0xffff00,
  vertexSelected: 0xff4444,
  hover: 0xffff00,
  selected: 0xff4444,
};

// Vertex settings
export const VERTEX_SPHERE_SEGMENTS = 8;
export const VERTEX_BASE_SIZE = 0.02;

// ============================================
// Creation Mode Preview Panel Settings
// ============================================
export const PREVIEW_PANEL = {
  // Style toggle - set to false for simple solid orange preview
  fancyPreview: true,
  
  // Simple style settings (when fancyPreview = false)
  simpleColor: 0xff8844,
  simpleOpacity: 0.4,
  simpleWireframeColor: 0xffaa00,
  
  // Fancy style settings (when fancyPreview = true)
  stripeColor1: 0xffaa55,
  stripeColor2: 0xdd9944,
  holoTint: 0xffffff,
  wireframeColor: 0xffaa44,
  
  // Stripe settings
  stripeScale: 6.0,
  
  // Scanline settings
  scanlineScale: 200.0,
  scanlineIntensity: 0.32,
  
  // Holographic settings
  gradientStart: 0.3,
  gradientStrength: 0.7,
  
  // Bloom settings
  bloomStrength: 0.55,
  bloomRadius: 0.1,
  bloomThreshold: 0.0,
  bloomOpacity: 1.0,
  
  // Wireframe settings
  wireframeWidth: 3.0,
  wireframeOpacity: 0.2,
  
  // Overall
  opacity: 0.55,
};
