/**
 * Three.js scene initialization utilities
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer';
import { COLORS, DEFAULT_CAMERA_POSITION, DEFAULT_CAMERA_FOV, GRID_SIZE, GRID_DIVISIONS } from './constants';

/**
 * Creates the main Three.js scene
 * @returns {THREE.Scene}
 */
export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.background);
  return scene;
}

/**
 * Creates a perspective camera
 * @param {number} aspect - Aspect ratio (width/height)
 * @returns {THREE.PerspectiveCamera}
 */
export function createCamera(aspect) {
  const camera = new THREE.PerspectiveCamera(DEFAULT_CAMERA_FOV, aspect, 0.1, 10000);
  camera.position.set(
    DEFAULT_CAMERA_POSITION.x,
    DEFAULT_CAMERA_POSITION.y,
    DEFAULT_CAMERA_POSITION.z
  );
  return camera;
}

/**
 * Creates the WebGL renderer
 * @param {number} width
 * @param {number} height
 * @returns {THREE.WebGLRenderer}
 */
export function createRenderer(width, height) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.toneMapping = THREE.ReinhardToneMapping;
  return renderer;
}

/**
 * Creates a CSS2D label renderer
 * @param {number} width
 * @param {number} height
 * @returns {CSS2DRenderer}
 */
export function createLabelRenderer(width, height) {
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(width, height);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0';
  labelRenderer.domElement.style.left = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  return labelRenderer;
}

/**
 * Creates OrbitControls
 * @param {THREE.Camera} camera
 * @param {HTMLElement} domElement
 * @param {boolean} enableInertia
 * @returns {OrbitControls}
 */
export function createControls(camera, domElement, enableInertia = true) {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = enableInertia;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = true;
  controls.minDistance = 0.1;
  controls.maxDistance = 1000;
  return controls;
}

/**
 * Creates scene lighting
 * @param {THREE.Scene} scene
 */
export function setupLighting(scene) {
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);

  const directional = new THREE.DirectionalLight(0xffffff, 0.8);
  directional.position.set(5, 10, 7.5);
  scene.add(directional);
}

/**
 * Creates a grid helper
 * @returns {THREE.GridHelper}
 */
export function createGrid() {
  return new THREE.GridHelper(GRID_SIZE, GRID_DIVISIONS, 0x444444, 0x333333);
}

/**
 * Handles viewport resize
 * @param {Object} refs - Object containing renderer, camera, labelRenderer, etc.
 * @param {number} width
 * @param {number} height
 */
export function handleResize(refs, width, height) {
  const { camera, renderer, labelRenderer, bloomComposer, mainRenderTarget, bloomDepthTarget } = refs;
  
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  
  if (bloomComposer) {
    bloomComposer.setSize(width, height);
  }
  if (mainRenderTarget) {
    mainRenderTarget.setSize(width, height);
  }
  if (bloomDepthTarget) {
    bloomDepthTarget.setSize(width, height);
  }
  if (labelRenderer) {
    labelRenderer.setSize(width, height);
  }
}
