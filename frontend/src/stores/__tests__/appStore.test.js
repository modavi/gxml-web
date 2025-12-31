import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAppStore } from '../appStore'

describe('appStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useAppStore.setState({
      editorRef: null,
      xmlContent: `<root>
    <panel thickness="0.25"/>
</root>`,
      schema: { tags: {} },
      isAutoUpdate: true,
      geometryData: null,
      error: null,
    })
  })

  describe('xmlContent', () => {
    it('should set xml content', () => {
      const newContent = '<root><panel width="2"/></root>'
      useAppStore.getState().setXmlContent(newContent)
      expect(useAppStore.getState().xmlContent).toBe(newContent)
    })

    it('should have default GXML content', () => {
      expect(useAppStore.getState().xmlContent).toContain('<root>')
      expect(useAppStore.getState().xmlContent).toContain('<panel')
    })
  })

  describe('addPanelFromPoints', () => {
    it('should calculate correct width from two points', async () => {
      // Mock renderGXML to not make actual API calls
      useAppStore.setState({
        renderGXML: vi.fn(),
        isAutoUpdate: false,
      })

      const startPoint = { x: 0, y: 0, z: 0 }
      const endPoint = { x: 3, y: 0, z: 4 } // 3-4-5 triangle, width should be 5
      
      await useAppStore.getState().addPanelFromPoints(startPoint, endPoint, 0)
      
      const xml = useAppStore.getState().xmlContent
      expect(xml).toContain('width="5"')
    })

    it('should calculate correct rotation for horizontal panel', async () => {
      useAppStore.setState({
        renderGXML: vi.fn(),
        isAutoUpdate: false,
      })

      // Panel going in +X direction (0 degrees)
      const startPoint = { x: 0, y: 0, z: 0 }
      const endPoint = { x: 1, y: 0, z: 0 }
      
      await useAppStore.getState().addPanelFromPoints(startPoint, endPoint, 0)
      
      const xml = useAppStore.getState().xmlContent
      // No rotation attribute means 0 degrees (or rotate="0" which gets omitted)
      expect(xml).not.toContain('rotate=')
    })

    it('should calculate 90 degree rotation for panel going in -Z direction', async () => {
      useAppStore.setState({
        renderGXML: vi.fn(),
        isAutoUpdate: false,
      })

      // Panel going in -Z direction (90 degrees from +X)
      const startPoint = { x: 0, y: 0, z: 0 }
      const endPoint = { x: 0, y: 0, z: -1 }
      
      await useAppStore.getState().addPanelFromPoints(startPoint, endPoint, 0)
      
      const xml = useAppStore.getState().xmlContent
      expect(xml).toContain('rotate="90"')
    })

    it('should calculate relative rotation based on parent rotation', async () => {
      useAppStore.setState({
        renderGXML: vi.fn(),
        isAutoUpdate: false,
      })

      // Panel going in +X direction (world angle = 0), but parent is at 45 degrees
      const startPoint = { x: 0, y: 0, z: 0 }
      const endPoint = { x: 1, y: 0, z: 0 }
      
      await useAppStore.getState().addPanelFromPoints(startPoint, endPoint, 0, 0.25, 45)
      
      const xml = useAppStore.getState().xmlContent
      // Relative angle = 0 - 45 = -45
      expect(xml).toContain('rotate="-45"')
    })

    it('should insert panel after specified index', async () => {
      useAppStore.setState({
        xmlContent: `<root>
    <panel width="1"/>
    <panel width="2"/>
</root>`,
        renderGXML: vi.fn(),
        isAutoUpdate: false,
      })

      const startPoint = { x: 0, y: 0, z: 0 }
      const endPoint = { x: 1, y: 0, z: 0 }
      
      await useAppStore.getState().addPanelFromPoints(startPoint, endPoint, 0)
      
      const xml = useAppStore.getState().xmlContent
      // New panel should be between first and second
      const firstPanelPos = xml.indexOf('width="1"')
      const newPanelPos = xml.indexOf('thickness="0.25"')
      const secondPanelPos = xml.indexOf('width="2"')
      
      expect(newPanelPos).toBeGreaterThan(firstPanelPos)
      expect(newPanelPos).toBeLessThan(secondPanelPos)
    })

    it('should return new panel index after insertion', async () => {
      useAppStore.setState({
        renderGXML: vi.fn(),
        isAutoUpdate: false,
      })

      const startPoint = { x: 0, y: 0, z: 0 }
      const endPoint = { x: 1, y: 0, z: 0 }
      
      const newIndex = await useAppStore.getState().addPanelFromPoints(startPoint, endPoint, 0)
      
      expect(newIndex).toBe(1) // Inserted after panel 0
    })

    it('should call renderGXML when isAutoUpdate is true', async () => {
      const mockRender = vi.fn()
      useAppStore.setState({
        renderGXML: mockRender,
        isAutoUpdate: true,
      })

      const startPoint = { x: 0, y: 0, z: 0 }
      const endPoint = { x: 1, y: 0, z: 0 }
      
      await useAppStore.getState().addPanelFromPoints(startPoint, endPoint, 0)
      
      expect(mockRender).toHaveBeenCalled()
    })

    it('should not call renderGXML when isAutoUpdate is false', async () => {
      const mockRender = vi.fn()
      useAppStore.setState({
        renderGXML: mockRender,
        isAutoUpdate: false,
      })

      const startPoint = { x: 0, y: 0, z: 0 }
      const endPoint = { x: 1, y: 0, z: 0 }
      
      await useAppStore.getState().addPanelFromPoints(startPoint, endPoint, 0)
      
      expect(mockRender).not.toHaveBeenCalled()
    })

    it('should use specified thickness', async () => {
      useAppStore.setState({
        renderGXML: vi.fn(),
        isAutoUpdate: false,
      })

      const startPoint = { x: 0, y: 0, z: 0 }
      const endPoint = { x: 1, y: 0, z: 0 }
      
      await useAppStore.getState().addPanelFromPoints(startPoint, endPoint, 0, 0.5)
      
      const xml = useAppStore.getState().xmlContent
      expect(xml).toContain('thickness="0.5"')
    })
  })

  describe('selectPanelInEditor', () => {
    it('should not crash when editorRef is null', () => {
      useAppStore.setState({ editorRef: null })
      // Should not throw
      useAppStore.getState().selectPanelInEditor(0)
    })

    it('should not crash with invalid panel index', () => {
      const mockEditor = {
        setSelection: vi.fn(),
        revealLineInCenter: vi.fn(),
      }
      useAppStore.setState({ editorRef: mockEditor })
      
      // Should not throw with index that doesn't exist
      useAppStore.getState().selectPanelInEditor(999)
      expect(mockEditor.setSelection).not.toHaveBeenCalled()
    })

    it('should call editor methods for valid panel index', () => {
      const mockEditor = {
        setSelection: vi.fn(),
        revealLineInCenter: vi.fn(),
      }
      useAppStore.setState({ 
        editorRef: mockEditor,
        xmlContent: '<root><panel width="1"/></root>'
      })
      
      useAppStore.getState().selectPanelInEditor(0)
      
      expect(mockEditor.setSelection).toHaveBeenCalled()
      expect(mockEditor.revealLineInCenter).toHaveBeenCalled()
    })

    it('should handle string panel index', () => {
      const mockEditor = {
        setSelection: vi.fn(),
        revealLineInCenter: vi.fn(),
      }
      useAppStore.setState({ 
        editorRef: mockEditor,
        xmlContent: '<root><panel width="1"/></root>'
      })
      
      useAppStore.getState().selectPanelInEditor('0')
      
      expect(mockEditor.setSelection).toHaveBeenCalled()
    })
  })

  describe('renderGXML', () => {
    // Note: More comprehensive renderGXML tests are in src/test/api.test.js
    // These tests verify basic store integration
    
    it('should be an async function', () => {
      const renderGXML = useAppStore.getState().renderGXML
      expect(typeof renderGXML).toBe('function')
    })
  })

  describe('isAutoUpdate', () => {
    it('should toggle auto update', () => {
      useAppStore.getState().setAutoUpdate(false)
      expect(useAppStore.getState().isAutoUpdate).toBe(false)
      
      useAppStore.getState().setAutoUpdate(true)
      expect(useAppStore.getState().isAutoUpdate).toBe(true)
    })
  })

  describe('error handling', () => {
    it('should set and clear errors', () => {
      useAppStore.getState().setError('Test error')
      expect(useAppStore.getState().error).toBe('Test error')
      
      useAppStore.getState().setError(null)
      expect(useAppStore.getState().error).toBeNull()
    })
  })
})
