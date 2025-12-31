import { useMemo, useCallback, useRef, useEffect, useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'
import { useAppStore } from '../stores/appStore'
import { useViewportStore } from '../stores/viewportStore'
import { IconPoint, IconVertex, IconFace, IconElement, IconTable, IconChevronDown, IconChevronUp } from './ui/Icons'
import './GeometrySpreadsheet.css'

function GeometrySpreadsheet() {
  const geometryData = useAppStore((state) => state.geometryData)
  const {
    spreadsheetTab,
    setSpreadsheetTab,
    spreadsheetOpen,
    toggleSpreadsheet,
    selectedFaceId,
    selectedVertexIdx,
    setSelectedElement,
    setSelectedFace,
    setSelectedVertex,
    hoveredFaceId,
    hoveredVertexIdx,
    hoveredElementId,
    setHoveredFace,
    setHoveredVertex,
    setHoveredElement,
    clearHover,
  } = useViewportStore()

  const pointsGridRef = useRef(null)
  const verticesGridRef = useRef(null)
  const facesGridRef = useRef(null)
  const elementsGridRef = useRef(null)
  const containerRef = useRef(null)
  const [height, setHeight] = useState(350)
  const isDraggingRef = useRef(false)

  // Handle resize drag
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingRef.current || !containerRef.current) return
      
      const viewportPanel = containerRef.current.closest('.viewport-panel')
      if (!viewportPanel) return
      
      const panelRect = viewportPanel.getBoundingClientRect()
      const newHeight = panelRect.bottom - e.clientY
      const clampedHeight = Math.max(150, Math.min(panelRect.height - 100, newHeight))
      setHeight(clampedHeight)
    }

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const handleResizeStart = useCallback((e) => {
    isDraggingRef.current = true
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    e.preventDefault()
  }, [])

  const { allPoints, allVertices, allFaces, allElements } = useMemo(() => {
    const points = []
    const vertices = []  // Raw vertices (with duplicates)
    const faces = []
    const elements = []  // Panels grouped by element
    
    if (!geometryData?.panels) {
      return { allPoints: points, allVertices: vertices, allFaces: faces, allElements: elements }
    }
    
    // Use same deduplication logic as viewport's createVertexMarkers
    const vertexMap = new Map()
    const TOLERANCE = 0.0001
    
    const hashVertex = (x, y, z) => {
      const rx = Math.round(x / TOLERANCE) * TOLERANCE
      const ry = Math.round(y / TOLERANCE) * TOLERANCE
      const rz = Math.round(z / TOLERANCE) * TOLERANCE
      return `${rx.toFixed(4)},${ry.toFixed(4)},${rz.toFixed(4)}`
    }
    
    const getOrCreateVertexIdx = (x, y, z) => {
      const hash = hashVertex(x, y, z)
      if (vertexMap.has(hash)) {
        return vertexMap.get(hash)
      }
      const idx = points.length
      vertexMap.set(hash, idx)
      points.push({
        idx,
        x,
        y,
        z,
        faceIds: [],
      })
      return idx
    }
    
    let globalVertIdx = 0
    geometryData.panels.forEach((panel, panelIdx) => {
      if (!panel.points) return
      
      const faceId = panel.id || `face_${panelIdx}`
      const pointIndices = []
      
      panel.points.forEach((p, localIdx) => {
        const x = p[0]
        const y = p[1]
        const z = p[2] || 0
        const pointIdx = getOrCreateVertexIdx(x, y, z)
        pointIndices.push(pointIdx)
        
        // Track which faces use this point
        if (!points[pointIdx].faceIds.includes(faceId)) {
          points[pointIdx].faceIds.push(faceId)
        }
        
        // Add raw vertex (with duplicates)
        vertices.push({
          idx: globalVertIdx,
          localIdx,
          x,
          y,
          z,
          faceId,
          pointIdx,  // Reference to deduplicated point
        })
        globalVertIdx++
      })
      
      faces.push({
        idx: panelIdx,
        id: faceId,
        vertices: pointIndices,
        vertexCount: pointIndices.length,
        vertexList: [...new Set(pointIndices)].join(', '), // Unique indices
      })
    })
    
    // Convert faceIds array to string for display
    points.forEach(p => {
      p.faceId = p.faceIds.join(', ')
      delete p.faceIds
    })
    
    // Build elements from panels (group by element ID - strip face suffix)
    const elementMap = new Map()
    geometryData.panels.forEach((panel) => {
      const panelId = panel.id || ''
      // Extract element ID by removing face suffix (e.g., "1-front", "1-top", "1-start" -> "1")
      const elementId = panelId.replace(/-(?:front|back|top|bottom|start|end)$/, '')
      
      if (!elementMap.has(elementId)) {
        elementMap.set(elementId, {
          idx: elementMap.size,
          id: elementId,
          faces: [],
          faceCount: 0,
        })
      }
      const element = elementMap.get(elementId)
      element.faces.push(panelId)
      element.faceCount++
    })
    
    // Convert to array and add face list string
    elementMap.forEach((element) => {
      element.faceList = element.faces.join(', ')
      elements.push(element)
    })
    
    return { allPoints: points, allVertices: vertices, allFaces: faces, allElements: elements }
  }, [geometryData])

  // Point columns
  const pointColumns = useMemo(() => [
    {
      field: 'idx',
      headerName: '#',
      width: 70,
      filter: 'agNumberColumnFilter',
      sortable: true,
      cellClass: 'geo-cell-index',
    },
    {
      field: 'x',
      headerName: 'X',
      width: 100,
      filter: 'agNumberColumnFilter',
      sortable: true,
      valueFormatter: (params) => params.value?.toFixed(4),
    },
    {
      field: 'y',
      headerName: 'Y',
      width: 100,
      filter: 'agNumberColumnFilter',
      sortable: true,
      valueFormatter: (params) => params.value?.toFixed(4),
    },
    {
      field: 'z',
      headerName: 'Z',
      width: 100,
      filter: 'agNumberColumnFilter',
      sortable: true,
      valueFormatter: (params) => params.value?.toFixed(4),
    },
    {
      field: 'faceId',
      headerName: 'Faces',
      flex: 1,
      minWidth: 120,
      filter: 'agTextColumnFilter',
      sortable: true,
    },
  ], [])

  // Vertex columns (raw vertices with duplicates)
  const vertexColumns = useMemo(() => [
    {
      field: 'idx',
      headerName: '#',
      width: 70,
      filter: 'agNumberColumnFilter',
      sortable: true,
      cellClass: 'geo-cell-index',
    },
    {
      field: 'x',
      headerName: 'X',
      width: 100,
      filter: 'agNumberColumnFilter',
      sortable: true,
      valueFormatter: (params) => params.value?.toFixed(4),
    },
    {
      field: 'y',
      headerName: 'Y',
      width: 100,
      filter: 'agNumberColumnFilter',
      sortable: true,
      valueFormatter: (params) => params.value?.toFixed(4),
    },
    {
      field: 'z',
      headerName: 'Z',
      width: 100,
      filter: 'agNumberColumnFilter',
      sortable: true,
      valueFormatter: (params) => params.value?.toFixed(4),
    },
    {
      field: 'faceId',
      headerName: 'Face',
      width: 120,
      filter: 'agTextColumnFilter',
      sortable: true,
    },
    {
      field: 'pointIdx',
      headerName: 'Point',
      width: 80,
      filter: 'agNumberColumnFilter',
      sortable: true,
    },
  ], [])

  // Face columns
  const faceColumns = useMemo(() => [
    {
      field: 'idx',
      headerName: '#',
      width: 70,
      filter: 'agNumberColumnFilter',
      sortable: true,
      cellClass: 'geo-cell-index',
    },
    {
      field: 'id',
      headerName: 'ID',
      width: 160,
      filter: 'agTextColumnFilter',
      sortable: true,
    },
    {
      field: 'vertexCount',
      headerName: 'Verts',
      width: 80,
      filter: 'agNumberColumnFilter',
      sortable: true,
    },
    {
      field: 'vertexList',
      headerName: 'Point Indices',
      flex: 1,
      minWidth: 150,
      filter: 'agTextColumnFilter',
      sortable: true,
    },
  ], [])

  // Element columns
  const elementColumns = useMemo(() => [
    {
      field: 'idx',
      headerName: '#',
      width: 70,
      filter: 'agNumberColumnFilter',
      sortable: true,
      cellClass: 'geo-cell-index',
    },
    {
      field: 'id',
      headerName: 'ID',
      width: 120,
      filter: 'agTextColumnFilter',
      sortable: true,
    },
    {
      field: 'faceCount',
      headerName: 'Faces',
      width: 80,
      filter: 'agNumberColumnFilter',
      sortable: true,
    },
    {
      field: 'faceList',
      headerName: 'Face IDs',
      flex: 1,
      minWidth: 150,
      filter: 'agTextColumnFilter',
      sortable: true,
    },
  ], [])

  // Grid options
  const defaultColDef = useMemo(() => ({
    resizable: true,
    suppressMovable: true,
  }), [])

  // Row class for hover highlighting from viewport
  const getPointRowClass = useCallback((params) => {
    if (params.data?.idx === hoveredVertexIdx) {
      return 'geo-row-hovered'
    }
    return ''
  }, [hoveredVertexIdx])

  const getVertexRowClass = useCallback((params) => {
    if (params.data?.pointIdx === hoveredVertexIdx) {
      return 'geo-row-hovered'
    }
    return ''
  }, [hoveredVertexIdx])

  const getFaceRowClass = useCallback((params) => {
    if (params.data?.id === hoveredFaceId) {
      return 'geo-row-hovered'
    }
    return ''
  }, [hoveredFaceId])

  const getElementRowClass = useCallback((params) => {
    // Highlight if this element is hovered
    if (hoveredElementId && params.data?.id === hoveredElementId) {
      return 'geo-row-hovered'
    }
    // Also highlight if any of this element's faces are hovered
    if (hoveredFaceId && params.data?.faces?.some(f => f === hoveredFaceId)) {
      return 'geo-row-hovered'
    }
    return ''
  }, [hoveredElementId, hoveredFaceId])

  // Handle point selection from grid
  const onPointSelectionChanged = useCallback(() => {
    const gridApi = pointsGridRef.current?.api
    if (!gridApi) return
    
    const selectedRows = gridApi.getSelectedRows()
    if (selectedRows.length > 0) {
      setSelectedVertex(selectedRows[0].idx)
    }
  }, [setSelectedVertex])

  // Handle vertex selection from grid (selects the corresponding deduplicated point)
  const onVertexSelectionChanged = useCallback(() => {
    const gridApi = verticesGridRef.current?.api
    if (!gridApi) return
    
    const selectedRows = gridApi.getSelectedRows()
    if (selectedRows.length > 0) {
      // Use pointIdx to select the deduplicated point in viewport
      setSelectedVertex(selectedRows[0].pointIdx)
    }
  }, [setSelectedVertex])

  // Handle face selection from grid
  const onFaceSelectionChanged = useCallback(() => {
    const gridApi = facesGridRef.current?.api
    if (!gridApi) return
    
    const selectedRows = gridApi.getSelectedRows()
    if (selectedRows.length > 0) {
      setSelectedFace(selectedRows[0].id)
    }
  }, [setSelectedFace])

  // Handle element selection from grid
  const onElementSelectionChanged = useCallback(() => {
    const gridApi = elementsGridRef.current?.api
    if (!gridApi) return
    
    const selectedRows = gridApi.getSelectedRows()
    if (selectedRows.length > 0) {
      setSelectedElement(selectedRows[0].id)
    }
  }, [setSelectedElement])

  // Handle row hover for points grid
  const onPointRowMouseOver = useCallback((event) => {
    if (event.data) {
      setHoveredVertex(event.data.idx)
    }
  }, [setHoveredVertex])

  // Handle row hover for vertices grid
  const onVertexRowMouseOver = useCallback((event) => {
    if (event.data) {
      setHoveredVertex(event.data.pointIdx)
    }
  }, [setHoveredVertex])

  // Handle row hover for faces grid
  const onFaceRowMouseOver = useCallback((event) => {
    if (event.data) {
      setHoveredFace(event.data.id)
    }
  }, [setHoveredFace])

  // Handle row hover for elements grid (hover whole element)
  const onElementRowMouseOver = useCallback((event) => {
    if (event.data?.id) {
      setHoveredElement(event.data.id)
    }
  }, [setHoveredElement])

  // Handle mouse leave from grid
  const onRowMouseOut = useCallback(() => {
    clearHover()
  }, [clearHover])

  // Sync selection from viewport to grid (points)
  useEffect(() => {
    const gridApi = pointsGridRef.current?.api
    if (!gridApi || spreadsheetTab !== 'points') return
    
    gridApi.deselectAll()
    if (selectedVertexIdx !== null) {
      gridApi.forEachNode((node) => {
        if (node.data?.idx === selectedVertexIdx) {
          node.setSelected(true)
          gridApi.ensureNodeVisible(node, 'middle')
        }
      })
    }
  }, [selectedVertexIdx, spreadsheetTab, allPoints])

  // Sync selection from viewport to grid (vertices)
  useEffect(() => {
    const gridApi = verticesGridRef.current?.api
    if (!gridApi || spreadsheetTab !== 'vertices') return
    
    gridApi.deselectAll()
    if (selectedVertexIdx !== null) {
      // Select all vertices that map to this point
      gridApi.forEachNode((node) => {
        if (node.data?.pointIdx === selectedVertexIdx) {
          node.setSelected(true)
          gridApi.ensureNodeVisible(node, 'middle')
        }
      })
    }
  }, [selectedVertexIdx, spreadsheetTab, allVertices])

  // Sync selection from viewport to grid (faces)
  useEffect(() => {
    const gridApi = facesGridRef.current?.api
    if (!gridApi || spreadsheetTab !== 'faces') return
    
    gridApi.deselectAll()
    if (selectedFaceId !== null) {
      gridApi.forEachNode((node) => {
        if (node.data?.id === selectedFaceId) {
          node.setSelected(true)
          gridApi.ensureNodeVisible(node, 'middle')
        }
      })
    }
  }, [selectedFaceId, spreadsheetTab, allFaces])

  return (
    <div className={`geo-spreadsheet ${spreadsheetOpen ? '' : 'collapsed'}`} ref={containerRef} style={{ height: spreadsheetOpen ? height : 'auto' }}>
      {spreadsheetOpen && (
        <div 
          className="geo-resize-handle"
          onMouseDown={handleResizeStart}
        />
      )}
      <div className="geo-spreadsheet-header">
        <button
          className="geo-toggle-btn"
          onClick={toggleSpreadsheet}
          title={spreadsheetOpen ? 'Collapse Spreadsheet' : 'Expand Spreadsheet'}
        >
          {spreadsheetOpen ? <IconChevronDown /> : <IconChevronUp />}
          <IconTable />
        </button>
        {spreadsheetOpen && (
          <>
            <div className="geo-tabs">
              <button
                className={`geo-tab ${spreadsheetTab === 'elements' ? 'active' : ''}`}
                onClick={() => setSpreadsheetTab('elements')}
                title="Elements (panels)"
              >
                <IconElement /> Elements
              </button>
              <button
                className={`geo-tab ${spreadsheetTab === 'faces' ? 'active' : ''}`}
                onClick={() => setSpreadsheetTab('faces')}
                title="Faces"
              >
                <IconFace /> Faces
              </button>
              <button
                className={`geo-tab ${spreadsheetTab === 'points' ? 'active' : ''}`}
                onClick={() => setSpreadsheetTab('points')}
                title="Points (deduplicated vertices)"
              >
                <IconPoint /> Points
              </button>
              <button
                className={`geo-tab ${spreadsheetTab === 'vertices' ? 'active' : ''}`}
                onClick={() => setSpreadsheetTab('vertices')}
                title="Vertices (per-face, with duplicates)"
              >
                <IconVertex /> Vertices
              </button>
            </div>
            <div className="geo-summary">
              <span>{allElements.length} elements</span>
              <span>{allFaces.length} faces</span>
              <span>{allPoints.length} points</span>
              <span>{allVertices.length} verts</span>
            </div>
          </>
        )}
        {!spreadsheetOpen && (
          <div className="geo-summary-collapsed">
            <span>{allElements.length} elems</span>
            <span>{allFaces.length} faces</span>
            <span>{allPoints.length} pts</span>
          </div>
        )}
      </div>
      
      {spreadsheetOpen && (
        <div 
          className="geo-content ag-theme-alpine-dark"
          onMouseLeave={onRowMouseOut}
        >
        {spreadsheetTab === 'points' && (
          <AgGridReact
            key="points-grid"
            ref={pointsGridRef}
            rowData={allPoints}
            columnDefs={pointColumns}
            defaultColDef={defaultColDef}
            rowSelection="single"
            onSelectionChanged={onPointSelectionChanged}
            onCellMouseOver={onPointRowMouseOver}
            getRowClass={getPointRowClass}
            animateRows={false}
            headerHeight={24}
            rowHeight={28}
            suppressCellFocus={true}
            getRowId={(params) => String(params.data.idx)}
          />
        )}
        {spreadsheetTab === 'vertices' && (
          <AgGridReact
            key="vertices-grid"
            ref={verticesGridRef}
            rowData={allVertices}
            columnDefs={vertexColumns}
            defaultColDef={defaultColDef}
            rowSelection="multiple"
            onSelectionChanged={onVertexSelectionChanged}
            onCellMouseOver={onVertexRowMouseOver}
            getRowClass={getVertexRowClass}
            animateRows={false}
            headerHeight={24}
            rowHeight={28}
            suppressCellFocus={true}
            getRowId={(params) => String(params.data.idx)}
          />
        )}
        {spreadsheetTab === 'faces' && (
          <AgGridReact
            key="faces-grid"
            ref={facesGridRef}
            rowData={allFaces}
            columnDefs={faceColumns}
            defaultColDef={defaultColDef}
            rowSelection="single"
            onSelectionChanged={onFaceSelectionChanged}
            onCellMouseOver={onFaceRowMouseOver}
            getRowClass={getFaceRowClass}
            animateRows={false}
            headerHeight={24}
            rowHeight={28}
            suppressCellFocus={true}
            getRowId={(params) => params.data.id}
          />
        )}
        {spreadsheetTab === 'elements' && (
          <AgGridReact
            key="elements-grid"
            ref={elementsGridRef}
            rowData={allElements}
            columnDefs={elementColumns}
            defaultColDef={defaultColDef}
            rowSelection="single"
            onSelectionChanged={onElementSelectionChanged}
            onCellMouseOver={onElementRowMouseOver}
            getRowClass={getElementRowClass}
            animateRows={false}
            headerHeight={24}
            rowHeight={28}
            suppressCellFocus={true}
            getRowId={(params) => params.data.id}
          />
        )}
        </div>
      )}
    </div>
  )
}

export default GeometrySpreadsheet
