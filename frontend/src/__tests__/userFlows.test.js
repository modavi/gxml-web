import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useViewportStore } from '../stores/viewportStore'
import { useAppStore } from '../stores/appStore'

/**
 * User Flow Integration Tests
 * 
 * These tests simulate realistic user workflows to catch
 * bugs that might only appear during actual usage patterns.
 */

describe('User Flow: Panel Creation', () => {
  beforeEach(() => {
    useViewportStore.setState({
      selectionMode: 'element',
      creationMode: false,
      selectedElementId: null,
      selectedFaceId: null,
      selectedVertexIdx: null,
      panelChain: [],
    })
    useAppStore.setState({
      xmlContent: '<root>\n</root>',
      geometryData: { panels: [] },
      isAutoUpdate: true,
      renderGXML: vi.fn().mockResolvedValue(undefined),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should complete full panel creation flow', async () => {
    // 1. User enables creation mode
    useViewportStore.getState().setCreationMode(true)
    expect(useViewportStore.getState().creationMode).toBe(true)
    
    // 2. User clicks first point
    useViewportStore.getState().addToChain({ x: 0, y: 0, z: 0 })
    expect(useViewportStore.getState().panelChain).toHaveLength(1)
    
    // 3. User clicks second point
    useViewportStore.getState().addToChain({ x: 2, y: 0, z: 0 })
    expect(useViewportStore.getState().panelChain).toHaveLength(2)
    
    // 4. Panel is created
    const startPoint = useViewportStore.getState().panelChain[0]
    const endPoint = useViewportStore.getState().panelChain[1]
    
    const newIndex = await useAppStore.getState().addPanelFromPoints(startPoint, endPoint, 0)
    
    // 5. Chain is cleared for next panel
    useViewportStore.getState().clearChain()
    expect(useViewportStore.getState().panelChain).toHaveLength(0)
    
    // 6. New panel is selected
    useViewportStore.getState().setSelectedElement(newIndex)
    expect(useViewportStore.getState().selectedElementId).toBe(newIndex)
    
    // 7. Creation mode is still active for next panel
    expect(useViewportStore.getState().creationMode).toBe(true)
  })

  it('should handle canceling creation mid-flow', () => {
    // Start creating
    useViewportStore.getState().setCreationMode(true)
    useViewportStore.getState().addToChain({ x: 0, y: 0, z: 0 })
    
    // Cancel (user presses Escape)
    useViewportStore.getState().clearChain()
    useViewportStore.getState().setCreationMode(false)
    
    expect(useViewportStore.getState().panelChain).toHaveLength(0)
    expect(useViewportStore.getState().creationMode).toBe(false)
  })

  it('should allow continuing chain for connected panels', async () => {
    useViewportStore.getState().setCreationMode(true)
    
    // First panel: (0,0,0) -> (2,0,0)
    useViewportStore.getState().addToChain({ x: 0, y: 0, z: 0 })
    useViewportStore.getState().addToChain({ x: 2, y: 0, z: 0 })
    
    // Create first panel
    await useAppStore.getState().addPanelFromPoints(
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      0
    )
    
    // Clear and continue from last point for connected panel
    useViewportStore.getState().clearChain()
    useViewportStore.getState().addToChain({ x: 2, y: 0, z: 0 })
    useViewportStore.getState().addToChain({ x: 2, y: 2, z: 0 })
    
    // Should be able to create second connected panel
    expect(useViewportStore.getState().panelChain).toHaveLength(2)
    expect(useViewportStore.getState().panelChain[0]).toEqual({ x: 2, y: 0, z: 0 })
  })
})

describe('User Flow: Selection and Inspection', () => {
  beforeEach(() => {
    useViewportStore.setState({
      selectionMode: 'element',
      selectedElementId: null,
      selectedFaceId: null,
      selectedVertexIdx: null,
      hoveredElementId: null,
    })
    useAppStore.setState({
      xmlContent: `<root>
    <panel width="1" height="2" depth="0.25"/>
    <panel width="2" height="2" depth="0.25"/>
    <panel width="1.5" height="2" depth="0.25"/>
</root>`,
      geometryData: {
        panels: [
          { id: '0-front', points: [[0,0,0], [1,0,0], [1,2,0], [0,2,0]] },
          { id: '0-back', points: [[0,0,-0.25], [1,0,-0.25], [1,2,-0.25], [0,2,-0.25]] },
          { id: '1-front', points: [[1,0,0], [3,0,0], [3,2,0], [1,2,0]] },
          { id: '1-back', points: [[1,0,-0.25], [3,0,-0.25], [3,2,-0.25], [1,2,-0.25]] },
          { id: '2-front', points: [[0,0,0], [0,0,1.5], [0,2,1.5], [0,2,0]] },
          { id: '2-back', points: [[0.25,0,0], [0.25,0,1.5], [0.25,2,1.5], [0.25,2,0]] },
        ],
      },
    })
  })

  it('should complete element → face → vertex inspection flow', () => {
    // 1. User clicks on panel in viewport (element mode)
    useViewportStore.getState().setSelectedElement(1)
    expect(useViewportStore.getState().selectedElementId).toBe(1)
    expect(useViewportStore.getState().selectionMode).toBe('element')
    
    // 2. User switches to face mode to inspect faces
    useViewportStore.getState().setSelectionMode('face')
    expect(useViewportStore.getState().selectionMode).toBe('face')
    
    // 3. User clicks on a face
    useViewportStore.getState().setSelectedFace('1-front')
    expect(useViewportStore.getState().selectedFaceId).toBe('1-front')
    expect(useViewportStore.getState().selectedElementId).toBeNull()  // cleared
    
    // 4. User switches to point mode
    useViewportStore.getState().setSelectionMode('point')
    
    // 5. User clicks on a vertex
    useViewportStore.getState().setSelectedVertex(0)
    expect(useViewportStore.getState().selectedVertexIdx).toBe(0)
    expect(useViewportStore.getState().selectedFaceId).toBeNull()  // cleared
    
    // 6. User goes back to element mode
    useViewportStore.getState().setSelectedElement(2)
    expect(useViewportStore.getState().selectedElementId).toBe(2)
    expect(useViewportStore.getState().selectedVertexIdx).toBeNull()
    expect(useViewportStore.getState().selectionMode).toBe('element')
  })

  it('should handle hover preview while item is selected', () => {
    // Select panel 0
    useViewportStore.getState().setSelectedElement(0)
    
    // Hover over panel 1 (preview in Details panel)
    useViewportStore.getState().setHoveredElement(1)
    
    // Both states should coexist
    expect(useViewportStore.getState().selectedElementId).toBe(0)
    expect(useViewportStore.getState().hoveredElementId).toBe(1)
    
    // Move to panel 2
    useViewportStore.getState().setHoveredElement(2)
    expect(useViewportStore.getState().hoveredElementId).toBe(2)
    expect(useViewportStore.getState().selectedElementId).toBe(0)  // still selected
    
    // Clear hover (mouse leaves viewport)
    useViewportStore.getState().clearHover()
    expect(useViewportStore.getState().hoveredElementId).toBeNull()
    expect(useViewportStore.getState().selectedElementId).toBe(0)  // still selected
  })

  it('should select first panel (index 0) correctly', () => {
    // This is a regression test for falsy value bugs
    useViewportStore.getState().setSelectedElement(0)
    
    // Verify it's properly selected
    expect(useViewportStore.getState().selectedElementId).toBe(0)
    expect(useViewportStore.getState().selectedElementId !== null).toBe(true)
    
    // User can clear and reselect
    useViewportStore.getState().clearSelection()
    expect(useViewportStore.getState().selectedElementId).toBeNull()
    
    useViewportStore.getState().setSelectedElement(0)
    expect(useViewportStore.getState().selectedElementId).toBe(0)
  })
})

describe('User Flow: XML Editing', () => {
  let mockRenderGXML
  
  beforeEach(() => {
    mockRenderGXML = vi.fn().mockResolvedValue(undefined)
    
    useViewportStore.setState({
      selectionMode: 'element',
      selectedElementId: null,
    })
    useAppStore.setState({
      xmlContent: `<root>
    <panel width="1"/>
    <panel width="2"/>
</root>`,
      isAutoUpdate: true,
      renderGXML: mockRenderGXML,
    })
  })

  it('should handle user editing XML while panel is selected', () => {
    // Select panel 1
    useViewportStore.getState().setSelectedElement(1)
    
    // User edits XML content
    useAppStore.getState().setXmlContent(`<root>
    <panel width="1"/>
    <panel width="3"/>
</root>`)
    
    // Selection should persist (panel still exists at same index)
    expect(useViewportStore.getState().selectedElementId).toBe(1)
  })

  it('should handle XML edit that removes selected panel', () => {
    // Select panel 1
    useViewportStore.getState().setSelectedElement(1)
    
    // User removes the panel from XML
    useAppStore.getState().setXmlContent(`<root>
    <panel width="1"/>
</root>`)
    
    // Selection index is now invalid, but store doesn't auto-validate
    // This is expected - the viewport rendering will handle this
    expect(useViewportStore.getState().selectedElementId).toBe(1)
  })

  it('should handle user typing incrementally', () => {
    // Simulate user typing in editor
    const baseXml = '<root>\n    <panel width="'
    
    useAppStore.getState().setXmlContent(baseXml + '1')
    useAppStore.getState().setXmlContent(baseXml + '12')
    useAppStore.getState().setXmlContent(baseXml + '123')
    useAppStore.getState().setXmlContent(baseXml + '123"/>\n</root>')
    
    expect(useAppStore.getState().xmlContent).toContain('width="123"')
  })
})

describe('User Flow: Mode Switching', () => {
  beforeEach(() => {
    useViewportStore.setState({
      selectionMode: 'element',
      creationMode: false,
      selectedElementId: null,
      selectedFaceId: null,
      selectedVertexIdx: null,
    })
  })

  it('should handle toolbar mode button clicks', () => {
    // User clicks Element button
    useViewportStore.getState().setSelectionMode('element')
    expect(useViewportStore.getState().selectionMode).toBe('element')
    
    // User clicks Face button
    useViewportStore.getState().setSelectionMode('face')
    expect(useViewportStore.getState().selectionMode).toBe('face')
    
    // User clicks Point button
    useViewportStore.getState().setSelectionMode('point')
    expect(useViewportStore.getState().selectionMode).toBe('point')
    
    // User clicks back to Element
    useViewportStore.getState().setSelectionMode('element')
    expect(useViewportStore.getState().selectionMode).toBe('element')
  })

  it('should handle keyboard shortcuts for mode switching', () => {
    // Simulate keyboard handler setting modes
    // 1 = element, 2 = face, 3 = point
    const modes = { 1: 'element', 2: 'face', 3: 'point' }
    
    useViewportStore.getState().setSelectionMode(modes[2])
    expect(useViewportStore.getState().selectionMode).toBe('face')
    
    useViewportStore.getState().setSelectionMode(modes[3])
    expect(useViewportStore.getState().selectionMode).toBe('point')
    
    useViewportStore.getState().setSelectionMode(modes[1])
    expect(useViewportStore.getState().selectionMode).toBe('element')
  })

  it('should toggle creation mode on/off', () => {
    expect(useViewportStore.getState().creationMode).toBe(false)
    
    // User clicks Create button
    useViewportStore.getState().toggleCreationMode()
    expect(useViewportStore.getState().creationMode).toBe(true)
    
    // User clicks Create button again
    useViewportStore.getState().toggleCreationMode()
    expect(useViewportStore.getState().creationMode).toBe(false)
  })

  it('should handle rapid mode toggling', () => {
    // User accidentally double-clicks
    useViewportStore.getState().toggleCreationMode()
    useViewportStore.getState().toggleCreationMode()
    
    // Should end up off
    expect(useViewportStore.getState().creationMode).toBe(false)
    
    // Single click
    useViewportStore.getState().toggleCreationMode()
    expect(useViewportStore.getState().creationMode).toBe(true)
  })
})

describe('User Flow: Spreadsheet Selection', () => {
  beforeEach(() => {
    useViewportStore.setState({
      selectionMode: 'element',
      selectedElementId: null,
      selectedFaceId: null,
      selectedVertexIdx: null,
    })
    useAppStore.setState({
      geometryData: {
        panels: [
          { id: '0-front', points: [[0,0,0], [1,0,0], [1,1,0], [0,1,0]] },
          { id: '0-back', points: [[0,0,-0.25], [1,0,-0.25], [1,1,-0.25], [0,1,-0.25]] },
          { id: '1-front', points: [[1,0,0], [2,0,0], [2,1,0], [1,1,0]] },
          { id: '1-back', points: [[1,0,-0.25], [2,0,-0.25], [2,1,-0.25], [1,1,-0.25]] },
        ],
        vertices: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
          { x: 1, y: 1, z: 0 },
          { x: 0, y: 1, z: 0 },
        ],
      },
    })
  })

  it('should select element from Panels tab', () => {
    // User clicks row in Panels tab
    useViewportStore.getState().setSelectedElement(0)
    
    expect(useViewportStore.getState().selectedElementId).toBe(0)
    expect(useViewportStore.getState().selectionMode).toBe('element')
  })

  it('should select face from Faces tab', () => {
    // User clicks row in Faces tab
    useViewportStore.getState().setSelectedFace('1-front')
    
    expect(useViewportStore.getState().selectedFaceId).toBe('1-front')
    expect(useViewportStore.getState().selectionMode).toBe('face')
  })

  it('should select vertex from Vertices tab', () => {
    // User clicks row in Vertices tab
    useViewportStore.getState().setSelectedVertex(2)
    
    expect(useViewportStore.getState().selectedVertexIdx).toBe(2)
    expect(useViewportStore.getState().selectionMode).toBe('point')
  })

  it('should sync selection between viewport click and spreadsheet row', () => {
    // User clicks panel in viewport
    useViewportStore.getState().setSelectedElement(0)
    
    // Spreadsheet should show this as selected (via state)
    expect(useViewportStore.getState().selectedElementId).toBe(0)
    
    // User clicks different row in spreadsheet
    useViewportStore.getState().setSelectedElement(1)
    
    // State updates, viewport rendering will highlight the new one
    expect(useViewportStore.getState().selectedElementId).toBe(1)
  })

  it('should handle clicking row 0 in spreadsheet', () => {
    // This tests the falsy value edge case from spreadsheet context
    useViewportStore.getState().setSelectedElement(0)
    
    const state = useViewportStore.getState()
    expect(state.selectedElementId === 0).toBe(true)
    expect(state.selectedElementId !== null).toBe(true)
  })
})
