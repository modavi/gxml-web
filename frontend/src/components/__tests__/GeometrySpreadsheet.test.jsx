import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import GeometrySpreadsheet from '../GeometrySpreadsheet'
import { useAppStore } from '../../stores/appStore'
import { useViewportStore } from '../../stores/viewportStore'

// Mock ag-grid-react since it requires complex setup
vi.mock('ag-grid-react', () => ({
  AgGridReact: ({ rowData, columnDefs, onRowClicked }) => (
    <div data-testid="mock-ag-grid">
      <div data-testid="row-count">{rowData?.length || 0}</div>
      {rowData?.map((row, i) => (
        <div 
          key={i} 
          data-testid={`row-${i}`}
          onClick={() => onRowClicked?.({ data: row })}
        >
          {JSON.stringify(row)}
        </div>
      ))}
    </div>
  ),
}))

describe('GeometrySpreadsheet', () => {
  beforeEach(() => {
    // Reset stores
    useAppStore.setState({
      geometryData: null,
    })
    useViewportStore.setState({
      spreadsheetOpen: true,
      spreadsheetTab: 'points',
      selectedFaceId: null,
      selectedVertexIdx: null,
      hoveredFaceId: null,
      hoveredVertexIdx: null,
      hoveredElementId: null,
    })
  })

  describe('tab switching', () => {
    it('should render tab buttons', () => {
      render(<GeometrySpreadsheet />)
      
      expect(screen.getByText('Elements')).toBeInTheDocument()
      expect(screen.getByText('Faces')).toBeInTheDocument()
      expect(screen.getByText('Points')).toBeInTheDocument()
      expect(screen.getByText('Vertices')).toBeInTheDocument()
    })

    it('should switch tabs on click', () => {
      render(<GeometrySpreadsheet />)
      
      fireEvent.click(screen.getByText('Faces'))
      expect(useViewportStore.getState().spreadsheetTab).toBe('faces')
      
      fireEvent.click(screen.getByText('Vertices'))
      expect(useViewportStore.getState().spreadsheetTab).toBe('vertices')
    })

    it('should highlight active tab', () => {
      useViewportStore.setState({ spreadsheetTab: 'faces' })
      render(<GeometrySpreadsheet />)
      
      const facesTab = screen.getByText('Faces').closest('button')
      expect(facesTab).toHaveClass('active')
    })
  })

  describe('collapse/expand', () => {
    it('should have a collapse button', () => {
      render(<GeometrySpreadsheet />)
      
      // Find the collapse button by title
      const toggleBtn = screen.getByTitle('Collapse Spreadsheet')
      expect(toggleBtn).toBeInTheDocument()
    })
  })

  describe('with geometry data', () => {
    const mockGeometryData = {
      panels: [
        {
          id: '0-front',
          points: [
            [0, 0, 0],
            [1, 0, 0],
            [1, 1, 0],
            [0, 1, 0],
          ],
        },
        {
          id: '0-back',
          points: [
            [0, 0, -0.25],
            [1, 0, -0.25],
            [1, 1, -0.25],
            [0, 1, -0.25],
          ],
        },
      ],
    }

    it('should display data when geometry is available', () => {
      useAppStore.setState({ geometryData: mockGeometryData })
      render(<GeometrySpreadsheet />)
      
      // Should show the grid with data
      expect(screen.getByTestId('mock-ag-grid')).toBeInTheDocument()
    })

    it('should show correct point count', () => {
      useAppStore.setState({ geometryData: mockGeometryData })
      useViewportStore.setState({ spreadsheetTab: 'points' })
      render(<GeometrySpreadsheet />)
      
      // 8 unique points (4 per panel, but they're different z values)
      const rowCount = screen.getByTestId('row-count')
      expect(parseInt(rowCount.textContent)).toBe(8)
    })

    it('should show correct face count', () => {
      useAppStore.setState({ geometryData: mockGeometryData })
      useViewportStore.setState({ spreadsheetTab: 'faces' })
      render(<GeometrySpreadsheet />)
      
      const rowCount = screen.getByTestId('row-count')
      expect(parseInt(rowCount.textContent)).toBe(2)
    })
  })

  describe('empty state', () => {
    it('should handle null geometry data gracefully', () => {
      useAppStore.setState({ geometryData: null })
      render(<GeometrySpreadsheet />)
      
      const rowCount = screen.getByTestId('row-count')
      expect(parseInt(rowCount.textContent)).toBe(0)
    })

    it('should handle empty panels array', () => {
      useAppStore.setState({ geometryData: { panels: [] } })
      render(<GeometrySpreadsheet />)
      
      const rowCount = screen.getByTestId('row-count')
      expect(parseInt(rowCount.textContent)).toBe(0)
    })
  })

  describe('summary counts', () => {
    it('should display summary statistics', () => {
      const mockGeometryData = {
        panels: [
          {
            id: '0-front',
            points: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]],
          },
        ],
      }
      useAppStore.setState({ geometryData: mockGeometryData })
      render(<GeometrySpreadsheet />)
      
      // Should show summary counts in the geo-summary section
      const summary = document.querySelector('.geo-summary')
      expect(summary).toBeInTheDocument()
      expect(summary.textContent).toContain('1')
    })
  })
})
