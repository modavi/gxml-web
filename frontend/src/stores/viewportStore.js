import { create } from 'zustand'

export const useViewportStore = create((set) => ({
  // View modes
  viewMode: 'lit', // 'lit', 'unlit', 'wireframe', 'xray'
  setViewMode: (mode) => set({ viewMode: mode }),
  
  colorMode: 'random', // 'random', 'uniform'
  setColorMode: (mode) => set({ colorMode: mode }),
  
  // Labels
  showFaceLabels: false,
  setShowFaceLabels: (show) => set({ showFaceLabels: show }),
  
  hideOccludedLabels: true,
  setHideOccludedLabels: (hide) => set({ hideOccludedLabels: hide }),
  
  // Vertices
  showVertices: false,
  setShowVertices: (show) => set({ showVertices: show }),
  
  // Camera
  enableInertia: false,
  setEnableInertia: (enable) => set({ enableInertia: enable }),
  
  // Options panel
  optionsPanelOpen: false,
  setOptionsPanelOpen: (open) => set({ optionsPanelOpen: open }),
  toggleOptionsPanel: () => set((state) => ({ optionsPanelOpen: !state.optionsPanelOpen })),
  
  // Spreadsheet
  spreadsheetOpen: false,
  setSpreadsheetOpen: (open) => set({ spreadsheetOpen: open }),
  toggleSpreadsheet: () => set((state) => ({ spreadsheetOpen: !state.spreadsheetOpen })),
  
  spreadsheetTab: 'points', // 'points' | 'vertices' | 'faces'
  setSpreadsheetTab: (tab) => set({ spreadsheetTab: tab }),
  
  // Selection (bi-directional sync between viewport and spreadsheet)
  selectedFaceId: null,
  selectedVertexIdx: null,
  setSelectedFace: (faceId) => set({ selectedFaceId: faceId, selectedVertexIdx: null }),
  setSelectedVertex: (idx) => set({ selectedVertexIdx: idx, selectedFaceId: null }),
  clearSelection: () => set({ selectedFaceId: null, selectedVertexIdx: null }),
  
  // Hover highlight (bi-directional sync between viewport and spreadsheet)
  hoveredFaceId: null,
  hoveredVertexIdx: null,
  setHoveredFace: (faceId) => set({ hoveredFaceId: faceId, hoveredVertexIdx: null }),
  setHoveredVertex: (idx) => set({ hoveredVertexIdx: idx, hoveredFaceId: null }),
  clearHover: () => set({ hoveredFaceId: null, hoveredVertexIdx: null }),
}))
