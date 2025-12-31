import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import OptionsPanel from '../OptionsPanel'
import { useViewportStore } from '../../stores/viewportStore'
import { useAppStore } from '../../stores/appStore'

describe('OptionsPanel', () => {
  let mockRenderGXML

  beforeEach(() => {
    mockRenderGXML = vi.fn()
    
    useViewportStore.setState({
      optionsPanelOpen: true,
      viewMode: 'lit',
      colorMode: 'uniform',
      showFaceLabels: false,
      hideOccludedLabels: true,
      vertexScale: 1.0,
      enableInertia: true,
    })
    
    useAppStore.setState({
      renderGXML: mockRenderGXML,
    })
  })

  describe('visibility', () => {
    it('should render when optionsPanelOpen is true', () => {
      render(<OptionsPanel />)
      expect(screen.getByText('View Options')).toBeInTheDocument()
    })

    it('should not render when optionsPanelOpen is false', () => {
      useViewportStore.setState({ optionsPanelOpen: false })
      const { container } = render(<OptionsPanel />)
      expect(container).toBeEmptyDOMElement()
    })

    it('should close panel when X button is clicked', () => {
      render(<OptionsPanel />)
      
      fireEvent.click(screen.getByText('×'))
      
      expect(useViewportStore.getState().optionsPanelOpen).toBe(false)
    })
  })

  describe('View Mode', () => {
    it('should render all view mode buttons', () => {
      render(<OptionsPanel />)
      
      expect(screen.getByText('Lit')).toBeInTheDocument()
      expect(screen.getByText('Unlit')).toBeInTheDocument()
      expect(screen.getByText('Wire')).toBeInTheDocument()
      expect(screen.getByText('X-ray')).toBeInTheDocument()
    })

    it('should highlight active view mode', () => {
      render(<OptionsPanel />)
      
      const litButton = screen.getByText('Lit')
      expect(litButton).toHaveClass('active')
    })

    it('should change view mode when button is clicked', () => {
      render(<OptionsPanel />)
      
      fireEvent.click(screen.getByText('Wire'))
      
      expect(useViewportStore.getState().viewMode).toBe('wireframe')
    })

    it('should update button highlighting when mode changes', () => {
      const { rerender } = render(<OptionsPanel />)
      
      fireEvent.click(screen.getByText('X-ray'))
      rerender(<OptionsPanel />)
      
      expect(screen.getByText('X-ray')).toHaveClass('active')
      expect(screen.getByText('Lit')).not.toHaveClass('active')
    })
  })

  describe('Panel Colors', () => {
    it('should render color mode buttons', () => {
      render(<OptionsPanel />)
      
      expect(screen.getByText('Random')).toBeInTheDocument()
      expect(screen.getByText('Uniform')).toBeInTheDocument()
    })

    it('should highlight active color mode', () => {
      render(<OptionsPanel />)
      
      expect(screen.getByText('Uniform')).toHaveClass('active')
    })

    it('should change color mode and trigger re-render', () => {
      render(<OptionsPanel />)
      
      fireEvent.click(screen.getByText('Random'))
      
      expect(useViewportStore.getState().colorMode).toBe('random')
      expect(mockRenderGXML).toHaveBeenCalled()
    })

    it('should call renderGXML when switching to uniform', () => {
      useViewportStore.setState({ colorMode: 'random' })
      render(<OptionsPanel />)
      
      fireEvent.click(screen.getByText('Uniform'))
      
      expect(mockRenderGXML).toHaveBeenCalled()
    })
  })

  describe('Labels', () => {
    it('should render label toggle options', () => {
      render(<OptionsPanel />)
      
      expect(screen.getByText('Show Face IDs')).toBeInTheDocument()
      expect(screen.getByText('Hide Occluded')).toBeInTheDocument()
    })

    it('should toggle show face labels', () => {
      render(<OptionsPanel />)
      
      const checkbox = screen.getByText('Show Face IDs').previousSibling
      fireEvent.click(checkbox)
      
      expect(useViewportStore.getState().showFaceLabels).toBe(true)
    })

    it('should toggle hide occluded labels', () => {
      render(<OptionsPanel />)
      
      const checkbox = screen.getByText('Hide Occluded').previousSibling
      fireEvent.click(checkbox)
      
      expect(useViewportStore.getState().hideOccludedLabels).toBe(false)
    })

    it('should reflect current toggle states', () => {
      useViewportStore.setState({ 
        showFaceLabels: true,
        hideOccludedLabels: false,
      })
      render(<OptionsPanel />)
      
      const showLabelsCheckbox = screen.getByText('Show Face IDs').previousSibling
      const hideOccludedCheckbox = screen.getByText('Hide Occluded').previousSibling
      
      expect(showLabelsCheckbox).toBeChecked()
      expect(hideOccludedCheckbox).not.toBeChecked()
    })
  })

  describe('Point Size', () => {
    it('should render point size slider', () => {
      render(<OptionsPanel />)
      
      expect(screen.getByText('Size')).toBeInTheDocument()
      expect(screen.getByRole('slider')).toBeInTheDocument()
    })

    it('should display current vertex scale value', () => {
      render(<OptionsPanel />)
      
      expect(screen.getByText('1.0')).toBeInTheDocument()
    })

    it('should update vertex scale when slider changes', () => {
      render(<OptionsPanel />)
      
      const slider = screen.getByRole('slider')
      fireEvent.change(slider, { target: { value: '2.5' } })
      
      expect(useViewportStore.getState().vertexScale).toBe(2.5)
    })

    it('should have correct min/max/step attributes', () => {
      render(<OptionsPanel />)
      
      const slider = screen.getByRole('slider')
      expect(slider).toHaveAttribute('min', '0.5')
      expect(slider).toHaveAttribute('max', '3')
      expect(slider).toHaveAttribute('step', '0.1')
    })
  })

  describe('Camera', () => {
    it('should render inertia toggle', () => {
      render(<OptionsPanel />)
      
      expect(screen.getByText('Inertia / Damping')).toBeInTheDocument()
    })

    it('should toggle inertia setting', () => {
      render(<OptionsPanel />)
      
      const checkbox = screen.getByText('Inertia / Damping').previousSibling
      fireEvent.click(checkbox)
      
      expect(useViewportStore.getState().enableInertia).toBe(false)
    })

    it('should display camera control hints', () => {
      render(<OptionsPanel />)
      
      expect(screen.getByText(/LMB: Rotate/)).toBeInTheDocument()
    })
  })

  describe('section headers', () => {
    it('should render all section headers', () => {
      render(<OptionsPanel />)
      
      expect(screen.getByText('View Mode')).toBeInTheDocument()
      expect(screen.getByText('Panel Colors')).toBeInTheDocument()
      expect(screen.getByText('Labels')).toBeInTheDocument()
      expect(screen.getByText('Point Size')).toBeInTheDocument()
      expect(screen.getByText('Camera')).toBeInTheDocument()
    })
  })
})
