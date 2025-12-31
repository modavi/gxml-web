import { describe, it, expect, beforeEach } from 'vitest'
import { useViewportStore } from '../viewportStore'

describe('viewportStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useViewportStore.setState({
      viewMode: 'lit',
      colorMode: 'uniform',
      selectionMode: 'element',
      creationMode: false,
      panelChain: [],
      showFaceLabels: false,
      hideOccludedLabels: true,
      vertexScale: 1.0,
      enableInertia: false,
      optionsPanelOpen: false,
      spreadsheetOpen: true,
      spreadsheetTab: 'points',
      selectedElementId: null,
      selectedFaceId: null,
      selectedVertexIdx: null,
      hoveredElementId: null,
      hoveredFaceId: null,
      hoveredVertexIdx: null,
    })
  })

  describe('viewMode', () => {
    it('should set view mode', () => {
      useViewportStore.getState().setViewMode('wireframe')
      expect(useViewportStore.getState().viewMode).toBe('wireframe')
    })

    it('should accept all valid view modes', () => {
      const modes = ['lit', 'unlit', 'wireframe', 'xray']
      modes.forEach(mode => {
        useViewportStore.getState().setViewMode(mode)
        expect(useViewportStore.getState().viewMode).toBe(mode)
      })
    })
  })

  describe('colorMode', () => {
    it('should set color mode', () => {
      useViewportStore.getState().setColorMode('random')
      expect(useViewportStore.getState().colorMode).toBe('random')
    })
  })

  describe('selectionMode', () => {
    it('should set selection mode', () => {
      useViewportStore.getState().setSelectionMode('face')
      expect(useViewportStore.getState().selectionMode).toBe('face')
      
      useViewportStore.getState().setSelectionMode('point')
      expect(useViewportStore.getState().selectionMode).toBe('point')
    })

    it('should accept all valid selection modes', () => {
      const modes = ['element', 'face', 'point']
      modes.forEach(mode => {
        useViewportStore.getState().setSelectionMode(mode)
        expect(useViewportStore.getState().selectionMode).toBe(mode)
      })
    })
  })

  describe('creationMode', () => {
    it('should enable creation mode', () => {
      useViewportStore.getState().setCreationMode(true)
      expect(useViewportStore.getState().creationMode).toBe(true)
    })

    it('should disable creation mode', () => {
      useViewportStore.setState({ creationMode: true })
      useViewportStore.getState().setCreationMode(false)
      expect(useViewportStore.getState().creationMode).toBe(false)
    })

    it('should toggle creation mode', () => {
      expect(useViewportStore.getState().creationMode).toBe(false)
      
      useViewportStore.getState().toggleCreationMode()
      expect(useViewportStore.getState().creationMode).toBe(true)
      
      useViewportStore.getState().toggleCreationMode()
      expect(useViewportStore.getState().creationMode).toBe(false)
    })
  })

  describe('panelChain', () => {
    it('should add points to chain', () => {
      useViewportStore.getState().addToChain({ x: 1, y: 2, z: 3 })
      expect(useViewportStore.getState().panelChain).toHaveLength(1)
      expect(useViewportStore.getState().panelChain[0]).toEqual({ x: 1, y: 2, z: 3 })
    })

    it('should add multiple points to chain', () => {
      useViewportStore.getState().addToChain({ x: 0, y: 0, z: 0 })
      useViewportStore.getState().addToChain({ x: 1, y: 0, z: 0 })
      useViewportStore.getState().addToChain({ x: 1, y: 0, z: 1 })
      
      expect(useViewportStore.getState().panelChain).toHaveLength(3)
    })

    it('should clear chain', () => {
      useViewportStore.getState().addToChain({ x: 1, y: 2, z: 3 })
      useViewportStore.getState().addToChain({ x: 4, y: 5, z: 6 })
      
      useViewportStore.getState().clearChain()
      
      expect(useViewportStore.getState().panelChain).toHaveLength(0)
    })

    it('should undo last chain point', () => {
      useViewportStore.getState().addToChain({ x: 1, y: 0, z: 0 })
      useViewportStore.getState().addToChain({ x: 2, y: 0, z: 0 })
      useViewportStore.getState().addToChain({ x: 3, y: 0, z: 0 })
      
      useViewportStore.getState().undoLastChain()
      
      expect(useViewportStore.getState().panelChain).toHaveLength(2)
      expect(useViewportStore.getState().panelChain[1]).toEqual({ x: 2, y: 0, z: 0 })
    })

    it('should handle undo on empty chain', () => {
      useViewportStore.getState().undoLastChain()
      expect(useViewportStore.getState().panelChain).toHaveLength(0)
    })
  })

  describe('element selection', () => {
    it('should select element and clear other selections', () => {
      useViewportStore.setState({
        selectedFaceId: 'face-1',
        selectedVertexIdx: 5,
      })

      useViewportStore.getState().setSelectedElement(2)

      expect(useViewportStore.getState().selectedElementId).toBe(2)
      expect(useViewportStore.getState().selectedFaceId).toBeNull()
      expect(useViewportStore.getState().selectedVertexIdx).toBeNull()
      expect(useViewportStore.getState().selectionMode).toBe('element')
    })

    it('should handle element ID 0', () => {
      useViewportStore.getState().setSelectedElement(0)
      expect(useViewportStore.getState().selectedElementId).toBe(0)
    })
  })

  describe('face selection', () => {
    it('should select face and clear other selections', () => {
      useViewportStore.setState({
        selectedElementId: 1,
        selectedVertexIdx: 5,
      })

      useViewportStore.getState().setSelectedFace('0-front')

      expect(useViewportStore.getState().selectedFaceId).toBe('0-front')
      expect(useViewportStore.getState().selectedElementId).toBeNull()
      expect(useViewportStore.getState().selectedVertexIdx).toBeNull()
      expect(useViewportStore.getState().selectionMode).toBe('face')
    })
  })

  describe('vertex selection', () => {
    it('should select vertex and clear other selections', () => {
      useViewportStore.setState({
        selectedElementId: 1,
        selectedFaceId: 'face-1',
      })

      useViewportStore.getState().setSelectedVertex(7)

      expect(useViewportStore.getState().selectedVertexIdx).toBe(7)
      expect(useViewportStore.getState().selectedElementId).toBeNull()
      expect(useViewportStore.getState().selectedFaceId).toBeNull()
      expect(useViewportStore.getState().selectionMode).toBe('point')
    })

    it('should handle vertex index 0', () => {
      useViewportStore.getState().setSelectedVertex(0)
      expect(useViewportStore.getState().selectedVertexIdx).toBe(0)
    })
  })

  describe('clearSelection', () => {
    it('should clear all selections', () => {
      useViewportStore.setState({
        selectedElementId: 1,
        selectedFaceId: 'face-1',
        selectedVertexIdx: 5,
      })

      useViewportStore.getState().clearSelection()

      expect(useViewportStore.getState().selectedElementId).toBeNull()
      expect(useViewportStore.getState().selectedFaceId).toBeNull()
      expect(useViewportStore.getState().selectedVertexIdx).toBeNull()
    })
  })

  describe('hover state', () => {
    it('should set hovered element and clear other hovers', () => {
      useViewportStore.setState({
        hoveredFaceId: 'face-1',
        hoveredVertexIdx: 5,
      })

      useViewportStore.getState().setHoveredElement(2)

      expect(useViewportStore.getState().hoveredElementId).toBe(2)
      expect(useViewportStore.getState().hoveredFaceId).toBeNull()
      expect(useViewportStore.getState().hoveredVertexIdx).toBeNull()
    })

    it('should set hovered face', () => {
      useViewportStore.getState().setHoveredFace('1-back')
      expect(useViewportStore.getState().hoveredFaceId).toBe('1-back')
    })

    it('should set hovered vertex', () => {
      useViewportStore.getState().setHoveredVertex(10)
      expect(useViewportStore.getState().hoveredVertexIdx).toBe(10)
    })

    it('should clear hover state', () => {
      useViewportStore.setState({
        hoveredElementId: 1,
        hoveredFaceId: 'face-1',
        hoveredVertexIdx: 5,
      })

      useViewportStore.getState().clearHover()

      expect(useViewportStore.getState().hoveredElementId).toBeNull()
      expect(useViewportStore.getState().hoveredFaceId).toBeNull()
      expect(useViewportStore.getState().hoveredVertexIdx).toBeNull()
    })
  })

  describe('UI state', () => {
    it('should toggle options panel', () => {
      expect(useViewportStore.getState().optionsPanelOpen).toBe(false)
      
      useViewportStore.getState().toggleOptionsPanel()
      expect(useViewportStore.getState().optionsPanelOpen).toBe(true)
      
      useViewportStore.getState().toggleOptionsPanel()
      expect(useViewportStore.getState().optionsPanelOpen).toBe(false)
    })

    it('should set options panel open state directly', () => {
      useViewportStore.getState().setOptionsPanelOpen(true)
      expect(useViewportStore.getState().optionsPanelOpen).toBe(true)
    })

    it('should toggle spreadsheet', () => {
      expect(useViewportStore.getState().spreadsheetOpen).toBe(true)
      
      useViewportStore.getState().toggleSpreadsheet()
      expect(useViewportStore.getState().spreadsheetOpen).toBe(false)
    })

    it('should set spreadsheet tab', () => {
      useViewportStore.getState().setSpreadsheetTab('faces')
      expect(useViewportStore.getState().spreadsheetTab).toBe('faces')
    })
  })

  describe('display options', () => {
    it('should toggle face labels', () => {
      useViewportStore.getState().setShowFaceLabels(true)
      expect(useViewportStore.getState().showFaceLabels).toBe(true)
    })

    it('should toggle occluded labels', () => {
      useViewportStore.getState().setHideOccludedLabels(false)
      expect(useViewportStore.getState().hideOccludedLabels).toBe(false)
    })

    it('should set vertex scale', () => {
      useViewportStore.getState().setVertexScale(2.0)
      expect(useViewportStore.getState().vertexScale).toBe(2.0)
    })

    it('should toggle inertia', () => {
      useViewportStore.getState().setEnableInertia(true)
      expect(useViewportStore.getState().enableInertia).toBe(true)
    })
  })
})
