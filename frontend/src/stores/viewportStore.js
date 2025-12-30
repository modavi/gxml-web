import { create } from 'zustand'

export const useViewportStore = create((set, get) => ({
  // View modes
  viewMode: 'lit', // 'lit', 'unlit', 'wireframe', 'xray'
  setViewMode: (mode) => set({ viewMode: mode }),
  
  colorMode: 'uniform', // 'random', 'uniform'
  setColorMode: (mode) => set({ colorMode: mode }),
  
  // Selection mode
  selectionMode: 'element', // 'element', 'face', 'point'
  setSelectionMode: (mode) => set({ selectionMode: mode }),
  
  // Creation mode - for interactively adding panels
  creationMode: false,
  setCreationMode: (enabled) => set({ creationMode: enabled }),
  toggleCreationMode: () => set((state) => ({ creationMode: !state.creationMode })),
  
  // Panel chain for creation mode - stores endpoints of created panels
  panelChain: [], // Array of { x, y, z } positions
  addToChain: (point) => set((state) => ({ panelChain: [...state.panelChain, point] })),
  clearChain: () => set({ panelChain: [] }),
  undoLastChain: () => set((state) => ({ panelChain: state.panelChain.slice(0, -1) })),
  
  // Labels
  showFaceLabels: false,
  setShowFaceLabels: (show) => set({ showFaceLabels: show }),
  
  hideOccludedLabels: true,
  setHideOccludedLabels: (hide) => set({ hideOccludedLabels: hide }),
  
  // Vertices (show when in point selection mode)
  vertexScale: 1.0,
  setVertexScale: (scale) => set({ vertexScale: scale }),
  
  // Camera
  enableInertia: false,
  setEnableInertia: (enable) => set({ enableInertia: enable }),
  
  // Options panel
  optionsPanelOpen: false,
  setOptionsPanelOpen: (open) => set({ optionsPanelOpen: open }),
  toggleOptionsPanel: () => set((state) => ({ optionsPanelOpen: !state.optionsPanelOpen })),
  
  // Spreadsheet
  spreadsheetOpen: true,
  setSpreadsheetOpen: (open) => set({ spreadsheetOpen: open }),
  toggleSpreadsheet: () => set((state) => ({ spreadsheetOpen: !state.spreadsheetOpen })),
  
  spreadsheetTab: 'points', // 'points' | 'vertices' | 'faces'
  setSpreadsheetTab: (tab) => set({ spreadsheetTab: tab }),
  
  // Selection (bi-directional sync between viewport and spreadsheet)
  selectedElementId: null,  // For element selection mode (panel id)
  selectedFaceId: null,
  selectedVertexIdx: null,
  setSelectedElement: (elementId) => set({ selectedElementId: elementId, selectedFaceId: null, selectedVertexIdx: null }),
  setSelectedFace: (faceId) => set({ selectedFaceId: faceId, selectedElementId: null, selectedVertexIdx: null }),
  setSelectedVertex: (idx) => set({ selectedVertexIdx: idx, selectedElementId: null, selectedFaceId: null }),
  clearSelection: () => set({ selectedElementId: null, selectedFaceId: null, selectedVertexIdx: null }),
  
  // Hover highlight (bi-directional sync between viewport and spreadsheet)
  hoveredElementId: null,
  hoveredFaceId: null,
  hoveredVertexIdx: null,
  setHoveredElement: (elementId) => set({ hoveredElementId: elementId, hoveredFaceId: null, hoveredVertexIdx: null }),
  setHoveredFace: (faceId) => set({ hoveredFaceId: faceId, hoveredElementId: null, hoveredVertexIdx: null }),
  setHoveredVertex: (idx) => set({ hoveredVertexIdx: idx, hoveredElementId: null, hoveredFaceId: null }),
  clearHover: () => set({ hoveredElementId: null, hoveredFaceId: null, hoveredVertexIdx: null }),
}))
