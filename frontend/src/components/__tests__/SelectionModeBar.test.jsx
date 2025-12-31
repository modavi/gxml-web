import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SelectionModeBar from '../SelectionModeBar'
import { useViewportStore } from '../../stores/viewportStore'

describe('SelectionModeBar', () => {
  beforeEach(() => {
    // Reset store to initial state
    useViewportStore.setState({
      selectionMode: 'element',
    })
  })

  it('should render all three selection mode buttons', () => {
    render(<SelectionModeBar />)
    
    expect(screen.getByText('Element')).toBeInTheDocument()
    expect(screen.getByText('Face')).toBeInTheDocument()
    expect(screen.getByText('Point')).toBeInTheDocument()
  })

  it('should highlight active selection mode', () => {
    render(<SelectionModeBar />)
    
    const elementBtn = screen.getByText('Element').closest('button')
    expect(elementBtn).toHaveClass('active')
  })

  it('should switch to face selection mode on click', () => {
    render(<SelectionModeBar />)
    
    fireEvent.click(screen.getByText('Face'))
    
    expect(useViewportStore.getState().selectionMode).toBe('face')
  })

  it('should switch to point selection mode on click', () => {
    render(<SelectionModeBar />)
    
    fireEvent.click(screen.getByText('Point'))
    
    expect(useViewportStore.getState().selectionMode).toBe('point')
  })

  it('should switch to element selection mode on click', () => {
    useViewportStore.setState({ selectionMode: 'face' })
    render(<SelectionModeBar />)
    
    fireEvent.click(screen.getByText('Element'))
    
    expect(useViewportStore.getState().selectionMode).toBe('element')
  })

  it('should update button highlighting when mode changes', () => {
    const { rerender } = render(<SelectionModeBar />)
    
    // Change selection mode
    useViewportStore.getState().setSelectionMode('face')
    rerender(<SelectionModeBar />)
    
    const faceBtn = screen.getByText('Face').closest('button')
    const elementBtn = screen.getByText('Element').closest('button')
    
    expect(faceBtn).toHaveClass('active')
    expect(elementBtn).not.toHaveClass('active')
  })

  it('should have proper button titles for accessibility', () => {
    render(<SelectionModeBar />)
    
    expect(screen.getByTitle(/Element Selection/)).toBeInTheDocument()
    expect(screen.getByTitle(/Face Selection/)).toBeInTheDocument()
    expect(screen.getByTitle(/Point Selection/)).toBeInTheDocument()
  })
})
