import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',  // Use relative paths for Electron compatibility
  server: {
    port: 5173,
    allowedHosts: ['dev-gxml.modavi.ca'],
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  // Pre-bundle heavy dependencies to avoid slow on-demand transforms
  optimizeDeps: {
    include: [
      'monaco-editor',
      '@monaco-editor/react',
      'ag-grid-react',
      'ag-grid-community',
      'three',
      'three/examples/jsm/controls/OrbitControls',
      'three/examples/jsm/lines/LineSegmentsGeometry',
      'three/examples/jsm/lines/LineMaterial',
      'three/examples/jsm/lines/LineSegments2',
      'three/examples/jsm/lines/Line2',
      'three/examples/jsm/renderers/CSS2DRenderer',
      'three/examples/jsm/postprocessing/EffectComposer',
      'three/examples/jsm/postprocessing/RenderPass',
      'three/examples/jsm/postprocessing/UnrealBloomPass',
      'three/examples/jsm/postprocessing/ShaderPass',
    ],
  },
  build: {
    outDir: '../src/gxml_web/static/dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // Split heavy dependencies into separate chunks
          'monaco': ['@monaco-editor/react', 'monaco-editor'],
          'ag-grid': ['ag-grid-react', 'ag-grid-community'],
          'three': ['three'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/__tests__/setup.js'],
    include: ['src/**/*.{test,spec}.{js,jsx}'],
  },
})