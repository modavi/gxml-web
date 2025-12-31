import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DetailsPanel from '../DetailsPanel'
import { useAppStore } from '../../stores/appStore'
import { useViewportStore } from '../../stores/viewportStore'

describe('DetailsPanel', () => {
  beforeEach(() => {
    // Reset stores
    useAppStore.setState({
      xmlContent: `<root>
    <panel width="1" height="1" thickness="0.25"/>
</root>`,
      isAutoUpdate: false,
      renderGXML: vi.fn(),
    })
    useViewportStore.setState({
      selectionMode: 'element',
      selectedElementId: null,
    })
  })

  describe('empty state', () => {
    it('should show placeholder when nothing is selected', () => {
      render(<DetailsPanel />)
      
      expect(screen.getByText(/Select an element/i)).toBeInTheDocument()
    })

    it('should show placeholder when in face selection mode', () => {
      useViewportStore.setState({ selectionMode: 'face' })
      render(<DetailsPanel />)
      
      expect(screen.getByText(/Select an element/i)).toBeInTheDocument()
    })
  })

  describe('with selected panel', () => {
    beforeEach(() => {
      useViewportStore.setState({
        selectionMode: 'element',
        selectedElementId: 0,
      })
    })

    it('should show panel header with index', () => {
      render(<DetailsPanel />)
      
      expect(screen.getByText('Panel 0')).toBeInTheDocument()
    })

    it('should show dimension inputs', () => {
      render(<DetailsPanel />)
      
      expect(screen.getByLabelText('Width')).toBeInTheDocument()
      expect(screen.getByLabelText('Height')).toBeInTheDocument()
      expect(screen.getByLabelText('Thickness')).toBeInTheDocument()
    })

    it('should populate inputs with panel attributes', () => {
      render(<DetailsPanel />)
      
      const widthInput = screen.getByLabelText('Width')
      expect(widthInput.value).toBe('1')
      
      const thicknessInput = screen.getByLabelText('Thickness')
      expect(thicknessInput.value).toBe('0.25')
    })

    it('should show position inputs', () => {
      render(<DetailsPanel />)
      
      expect(screen.getByLabelText('X Position')).toBeInTheDocument()
      expect(screen.getByLabelText('Y Position')).toBeInTheDocument()
      expect(screen.getByLabelText('Z Position')).toBeInTheDocument()
    })

    it('should show rotation inputs', () => {
      render(<DetailsPanel />)
      
      expect(screen.getByLabelText('Rotate X')).toBeInTheDocument()
      expect(screen.getByLabelText('Rotate Y')).toBeInTheDocument()
      expect(screen.getByLabelText('Rotate Z')).toBeInTheDocument()
    })

    it('should show layout selects', () => {
      render(<DetailsPanel />)
      
      expect(screen.getByLabelText('Direction')).toBeInTheDocument()
      expect(screen.getByLabelText('Anchor')).toBeInTheDocument()
      expect(screen.getByLabelText('Align')).toBeInTheDocument()
    })

    it('should show attribute groups', () => {
      render(<DetailsPanel />)
      
      expect(screen.getByText('Dimensions')).toBeInTheDocument()
      expect(screen.getByText('Position')).toBeInTheDocument()
      expect(screen.getByText('Rotation')).toBeInTheDocument()
      expect(screen.getByText('Layout')).toBeInTheDocument()
    })
  })

  describe('attribute editing', () => {
    beforeEach(() => {
      useViewportStore.setState({
        selectionMode: 'element',
        selectedElementId: 0,
      })
    })

    it('should update XML when changing width', async () => {
      const user = userEvent.setup()
      render(<DetailsPanel />)
      
      const widthInput = screen.getByLabelText('Width')
      await user.clear(widthInput)
      await user.type(widthInput, '2')
      
      const xml = useAppStore.getState().xmlContent
      expect(xml).toContain('width="2"')
    })

    it('should update XML when changing thickness', async () => {
      const user = userEvent.setup()
      render(<DetailsPanel />)
      
      const thicknessInput = screen.getByLabelText('Thickness')
      await user.clear(thicknessInput)
      await user.type(thicknessInput, '0.5')
      
      const xml = useAppStore.getState().xmlContent
      expect(xml).toContain('thickness="0.5"')
    })

    it('should handle spinner buttons for number inputs', async () => {
      render(<DetailsPanel />)
      
      // Find spinner buttons (up arrow)
      const spinnerUps = screen.getAllByText('▲')
      expect(spinnerUps.length).toBeGreaterThan(0)
      
      // Click the first spinner up (for Width)
      fireEvent.click(spinnerUps[0])
      
      // Width should increase by step (0.1 by default)
      const xml = useAppStore.getState().xmlContent
      expect(xml).toContain('width="1.1"')
    })

    it('should handle spinner down buttons', async () => {
      render(<DetailsPanel />)
      
      const spinnerDowns = screen.getAllByText('▼')
      fireEvent.click(spinnerDowns[0])
      
      // Width should decrease by step (0.1)
      const xml = useAppStore.getState().xmlContent
      expect(xml).toContain('width="0.9"')
    })
  })

  describe('select inputs', () => {
    beforeEach(() => {
      useViewportStore.setState({
        selectionMode: 'element',
        selectedElementId: 0,
      })
    })

    it('should show direction options', () => {
      render(<DetailsPanel />)
      
      const directionSelect = screen.getByLabelText('Direction')
      
      // Check that options are available
      expect(directionSelect.querySelector('option[value="x"]')).toBeInTheDocument()
      expect(directionSelect.querySelector('option[value="y"]')).toBeInTheDocument()
      expect(directionSelect.querySelector('option[value="z"]')).toBeInTheDocument()
    })

    it('should update XML when selecting direction', async () => {
      const user = userEvent.setup()
      render(<DetailsPanel />)
      
      const directionSelect = screen.getByLabelText('Direction')
      await user.selectOptions(directionSelect, 'y')
      
      const xml = useAppStore.getState().xmlContent
      expect(xml).toContain('direction="y"')
    })

    it('should show anchor options', () => {
      render(<DetailsPanel />)
      
      const anchorSelect = screen.getByLabelText('Anchor')
      
      expect(anchorSelect.querySelector('option[value="front"]')).toBeInTheDocument()
      expect(anchorSelect.querySelector('option[value="back"]')).toBeInTheDocument()
      expect(anchorSelect.querySelector('option[value="center"]')).toBeInTheDocument()
    })
  })

  describe('multi-panel XML', () => {
    beforeEach(() => {
      useAppStore.setState({
        xmlContent: `<root>
    <panel width="1" height="1"/>
    <panel width="2" height="2"/>
    <panel width="3" height="3"/>
</root>`,
      })
    })

    it('should edit correct panel when selecting second panel', async () => {
      useViewportStore.setState({ selectedElementId: 1 })
      const user = userEvent.setup()
      render(<DetailsPanel />)
      
      const widthInput = screen.getByLabelText('Width')
      expect(widthInput.value).toBe('2')
      
      await user.clear(widthInput)
      await user.type(widthInput, '5')
      
      const xml = useAppStore.getState().xmlContent
      // First panel should still have width="1"
      expect(xml).toContain('width="1"')
      // Second panel should now have width="5"
      expect(xml).toContain('width="5"')
      // Third panel should still have width="3"
      expect(xml).toContain('width="3"')
    })

    it('should show correct header for selected panel', () => {
      useViewportStore.setState({ selectedElementId: 2 })
      render(<DetailsPanel />)
      
      expect(screen.getByText('Panel 2')).toBeInTheDocument()
    })
  })

  describe('auto-update', () => {
    beforeEach(() => {
      useViewportStore.setState({
        selectionMode: 'element',
        selectedElementId: 0,
      })
    })

    it('should call renderGXML when isAutoUpdate is true', async () => {
      const mockRender = vi.fn()
      useAppStore.setState({
        isAutoUpdate: true,
        renderGXML: mockRender,
      })
      
      const user = userEvent.setup()
      render(<DetailsPanel />)
      
      const widthInput = screen.getByLabelText('Width')
      await user.clear(widthInput)
      await user.type(widthInput, '2')
      
      // Wait for debounced render
      await waitFor(() => {
        expect(mockRender).toHaveBeenCalled()
      }, { timeout: 500 })
    })

    it('should not call renderGXML when isAutoUpdate is false', async () => {
      const mockRender = vi.fn()
      useAppStore.setState({
        isAutoUpdate: false,
        renderGXML: mockRender,
      })
      
      const user = userEvent.setup()
      render(<DetailsPanel />)
      
      const widthInput = screen.getByLabelText('Width')
      await user.clear(widthInput)
      await user.type(widthInput, '2')
      
      // Wait a bit to make sure it doesn't get called
      await new Promise(resolve => setTimeout(resolve, 400))
      expect(mockRender).not.toHaveBeenCalled()
    })
  })
})

// Test helper functions (getPanelAttributes, updatePanelAttribute)
describe('XML utility functions', () => {
  describe('panel attribute parsing', () => {
    it('should parse self-closing panel tags', () => {
      const xml = '<root><panel width="1" height="2"/></root>'
      useAppStore.setState({ xmlContent: xml })
      useViewportStore.setState({ selectionMode: 'element', selectedElementId: 0 })
      
      render(<DetailsPanel />)
      
      expect(screen.getByLabelText('Width').value).toBe('1')
      expect(screen.getByLabelText('Height').value).toBe('2')
    })

    it('should handle panel with no attributes', () => {
      const xml = '<root><panel/></root>'
      useAppStore.setState({ xmlContent: xml })
      useViewportStore.setState({ selectionMode: 'element', selectedElementId: 0 })
      
      render(<DetailsPanel />)
      
      // Should render without error, inputs should be empty
      expect(screen.getByLabelText('Width').value).toBe('')
    })

    it('should handle case-insensitive panel tags', () => {
      const xml = '<root><Panel Width="5"/></root>'
      useAppStore.setState({ xmlContent: xml })
      useViewportStore.setState({ selectionMode: 'element', selectedElementId: 0 })
      
      render(<DetailsPanel />)
      
      // Note: regex is case-insensitive, so it should find the panel
      // but attribute parsing might be case-sensitive
      expect(screen.getByText('Panel 0')).toBeInTheDocument()
    })
  })
})
