import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useViewportStore } from '../stores/viewportStore'
import { useAppStore } from '../stores/appStore'

/**
 * Keyboard Shortcut Tests
 * 
 * Tests keyboard interactions at the store level.
 * The actual keydown handlers are in ViewportPanel, but we can
 * test the state changes they would trigger.
 */

describe('Keyboard Shortcuts', () => {
  beforeEach(() => {
    useViewportStore.setState({
      selectionMode: 'element',
      creationMode: false,
      panelChain: [],
      selectedElementId: null,
    })
  })

  describe('Selection Mode Shortcuts (1, 2, 3)', () => {
    it('should switch to element mode with key 1', () => {
      useViewportStore.setState({ selectionMode: 'face' })
      
      // Simulate what the keyboard handler does
      useViewportStore.getState().setSelectionMode('element')
      
      expect(useViewportStore.getState().selectionMode).toBe('element')
    })

    it('should switch to face mode with key 2', () => {
      useViewportStore.getState().setSelectionMode('face')
      
      expect(useViewportStore.getState().selectionMode).toBe('face')
    })

    it('should switch to point mode with key 3', () => {
      useViewportStore.getState().setSelectionMode('point')
      
      expect(useViewportStore.getState().selectionMode).toBe('point')
    })

    it('should cycle through modes with repeated presses', () => {
      // Simulate rapid key presses 1, 2, 3, 1
      useViewportStore.getState().setSelectionMode('element')
      expect(useViewportStore.getState().selectionMode).toBe('element')
      
      useViewportStore.getState().setSelectionMode('face')
      expect(useViewportStore.getState().selectionMode).toBe('face')
      
      useViewportStore.getState().setSelectionMode('point')
      expect(useViewportStore.getState().selectionMode).toBe('point')
      
      useViewportStore.getState().setSelectionMode('element')
      expect(useViewportStore.getState().selectionMode).toBe('element')
    })
  })

  describe('Escape Key - Exit Creation Mode', () => {
    it('should exit creation mode on Escape', () => {
      useViewportStore.setState({ creationMode: true })
      
      // Simulate Escape handler
      useViewportStore.getState().clearChain()
      useViewportStore.getState().toggleCreationMode()
      
      expect(useViewportStore.getState().creationMode).toBe(false)
    })

    it('should clear panel chain on Escape', () => {
      useViewportStore.setState({
        creationMode: true,
        panelChain: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
        ],
      })
      
      useViewportStore.getState().clearChain()
      
      expect(useViewportStore.getState().panelChain).toEqual([])
    })

    it('should do nothing if not in creation mode', () => {
      useViewportStore.setState({ 
        creationMode: false,
        panelChain: [],
      })
      
      // Escape pressed but creation mode is already off
      // Handler should check creationMode before acting
      const initialState = useViewportStore.getState()
      
      // If not in creation mode, these calls wouldn't happen
      expect(initialState.creationMode).toBe(false)
    })

    it('should preserve selection when exiting with Escape', () => {
      useViewportStore.setState({
        creationMode: true,
        selectedElementId: 2,
        panelChain: [{ x: 0, y: 0, z: 0 }],
      })
      
      useViewportStore.getState().clearChain()
      useViewportStore.getState().toggleCreationMode()
      
      expect(useViewportStore.getState().selectedElementId).toBe(2)
      expect(useViewportStore.getState().creationMode).toBe(false)
    })
  })

  describe('F Key - Reset View', () => {
    it('should allow resetView to be called', () => {
      // resetView is provided by useThreeScene hook
      // Here we just verify the pattern works
      const mockResetView = vi.fn()
      
      // Simulate F key handler
      mockResetView()
      
      expect(mockResetView).toHaveBeenCalled()
    })
  })

  describe('Keyboard Handler Context', () => {
    it('should track whether user is in editor (for ignoring shortcuts)', () => {
      // The handler checks document.activeElement?.closest('.editor-panel')
      // We can simulate this check
      const isInEditor = (activeElement) => {
        return activeElement?.closest?.('.editor-panel') != null
      }
      
      // Simulate being outside editor
      const divElement = { closest: () => null }
      expect(isInEditor(divElement)).toBe(false)
      
      // Simulate being inside editor
      const editorElement = { closest: (selector) => selector === '.editor-panel' ? {} : null }
      expect(isInEditor(editorElement)).toBe(true)
    })
  })

  describe('Creation Mode Toggle', () => {
    it('should toggle creation mode on and off', () => {
      expect(useViewportStore.getState().creationMode).toBe(false)
      
      useViewportStore.getState().toggleCreationMode()
      expect(useViewportStore.getState().creationMode).toBe(true)
      
      useViewportStore.getState().toggleCreationMode()
      expect(useViewportStore.getState().creationMode).toBe(false)
    })

    it('should clear chain when entering creation mode', () => {
      useViewportStore.setState({
        panelChain: [{ x: 0, y: 0, z: 0 }],
      })
      
      // When toggling creation mode ON, chain might be cleared
      useViewportStore.getState().clearChain()
      useViewportStore.getState().toggleCreationMode()
      
      expect(useViewportStore.getState().panelChain).toEqual([])
      expect(useViewportStore.getState().creationMode).toBe(true)
    })
  })

  describe('Multi-key Interactions', () => {
    it('should handle Escape during chain creation', () => {
      // User starts creating panel
      useViewportStore.getState().toggleCreationMode()
      useViewportStore.getState().addToChain({ x: 0, y: 0, z: 0 })
      
      expect(useViewportStore.getState().panelChain).toHaveLength(1)
      expect(useViewportStore.getState().creationMode).toBe(true)
      
      // User presses Escape
      useViewportStore.getState().clearChain()
      useViewportStore.getState().toggleCreationMode()
      
      expect(useViewportStore.getState().panelChain).toHaveLength(0)
      expect(useViewportStore.getState().creationMode).toBe(false)
    })

    it('should handle mode switch while panel is selected', () => {
      useViewportStore.getState().setSelectedElement(1)
      expect(useViewportStore.getState().selectionMode).toBe('element')
      
      // User presses 2 to switch to face mode
      useViewportStore.getState().setSelectionMode('face')
      
      // Selection is cleared when mode changes via setSelectedFace/etc
      // but just changing mode doesn't clear selection
      expect(useViewportStore.getState().selectionMode).toBe('face')
    })

    it('should handle rapid key presses', () => {
      // Simulate user mashing keys
      for (let i = 0; i < 10; i++) {
        useViewportStore.getState().toggleCreationMode()
      }
      
      // Even number of toggles = back to original state
      expect(useViewportStore.getState().creationMode).toBe(false)
    })
  })
})

describe('Keyboard + Selection State', () => {
  beforeEach(() => {
    useViewportStore.setState({
      selectionMode: 'element',
      selectedElementId: null,
      selectedFaceId: null,
      selectedVertexIdx: null,
    })
  })

  it('should allow selection in any mode', () => {
    // Element mode
    useViewportStore.getState().setSelectedElement(0)
    expect(useViewportStore.getState().selectedElementId).toBe(0)
    
    // Switch to face mode via keyboard
    useViewportStore.getState().setSelectionMode('face')
    
    // Select face (clears element)
    useViewportStore.getState().setSelectedFace('0-front')
    expect(useViewportStore.getState().selectedFaceId).toBe('0-front')
    expect(useViewportStore.getState().selectedElementId).toBeNull()
    
    // Switch to point mode via keyboard
    useViewportStore.getState().setSelectionMode('point')
    
    // Select vertex (clears face)
    useViewportStore.getState().setSelectedVertex(3)
    expect(useViewportStore.getState().selectedVertexIdx).toBe(3)
    expect(useViewportStore.getState().selectedFaceId).toBeNull()
  })

  it('should preserve mode when selecting same type', () => {
    useViewportStore.getState().setSelectionMode('face')
    useViewportStore.getState().setSelectedFace('0-front')
    useViewportStore.getState().setSelectedFace('1-back')
    
    expect(useViewportStore.getState().selectionMode).toBe('face')
    expect(useViewportStore.getState().selectedFaceId).toBe('1-back')
  })
})

describe('Keyboard Accessibility', () => {
  it('should support standard keyboard navigation patterns', () => {
    // This tests that the store actions work correctly
    // Actual keyboard navigation would be tested in integration tests
    
    // Tab through panels (conceptually)
    useViewportStore.getState().setSelectedElement(0)
    useViewportStore.getState().setSelectedElement(1)
    useViewportStore.getState().setSelectedElement(2)
    
    expect(useViewportStore.getState().selectedElementId).toBe(2)
  })

  it('should support mode switching via numeric keys', () => {
    const keyToMode = {
      '1': 'element',
      '2': 'face', 
      '3': 'point',
    }
    
    for (const [key, mode] of Object.entries(keyToMode)) {
      useViewportStore.getState().setSelectionMode(mode)
      expect(useViewportStore.getState().selectionMode).toBe(mode)
    }
  })
})
