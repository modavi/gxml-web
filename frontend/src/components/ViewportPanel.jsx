import { useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { useAppStore } from '../stores/appStore'
import { useViewportStore } from '../stores/viewportStore'
import { useThreeScene } from '../hooks/useThreeScene'
import OptionsPanel from './OptionsPanel'
import SelectionModeBar from './SelectionModeBar'
import SnapToolbar from './SnapToolbar'
import { IconPencil, IconChevronDown } from './ui/Icons'
import { Settings } from 'lucide-react'
import './ViewportPanel.css'

// Lazy load heavy AG Grid component
const GeometrySpreadsheet = lazy(() => import('./GeometrySpreadsheet'))

function ViewportPanel() {
  const containerRef = useRef(null)
  const { 
    toggleOptionsPanel, 
    spreadsheetOpen,
    creationMode,
    toggleCreationMode,
    panelChain,
    undoLastChain,
    clearChain,
    selectedElementId,
  } = useViewportStore()
  
  const geometryData = useAppStore((state) => state.geometryData)
  
  const { resetView } = useThreeScene(containerRef, geometryData)
  
  // Check if we have a valid selected panel with endpoint
  const hasValidSelection = geometryData?.panels?.[selectedElementId]?.endPoint != null

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger if typing in editor
      const activeElement = document.activeElement
      if (activeElement?.closest('.editor-panel')) return
      
      if (e.key === 'f' || e.key === 'F') {
        resetView()
      }
      
      // Escape to exit creation mode
      if (e.key === 'Escape' && creationMode) {
        clearChain()
        toggleCreationMode()
      }
    }
    
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [resetView, creationMode, toggleCreationMode, clearChain])

  return (
    <div className="viewport-panel">
      <div className="viewport-wrapper">
        <div ref={containerRef} className="viewport-container" />
        
        {/* Selection mode bar - centered at top (hidden in creation mode) */}
        {!creationMode && <SelectionModeBar />}
        
        {/* Creation mode indicator - centered when active */}
        {creationMode && (
          <div className={`creation-mode-indicator ${!hasValidSelection ? 'warning' : ''}`}>
            <span>✏️ Creation Mode</span>
            {hasValidSelection ? (
              <span className="creation-hint">Click to place • Ctrl disables all snapping • Esc to exit</span>
            ) : (
              <span className="creation-hint warning">⚠️ Select a panel first to extend from</span>
            )}
          </div>
        )}
        
        {/* Top-left toolbar: creation toggle + snap buttons */}
        <div className="viewport-left-toolbar">
          <button
            className={`viewport-toolbar-btn creation-mode-toggle ${creationMode ? 'active' : ''}`}
            onClick={toggleCreationMode}
            title={creationMode ? "Exit Creation Mode (Esc)" : "Enter Creation Mode"}
          >
            <IconPencil />
          </button>
          <SnapToolbar />
        </div>
        
        {/* Options dropdown button - top right */}
        <button
          className="viewport-toolbar-btn viewport-options-btn"
          onClick={toggleOptionsPanel}
          title="View Options"
        >
          <Settings size={14} />
          <span>Options</span>
          <IconChevronDown />
        </button>
        
        <OptionsPanel />
      </div>
      
      {spreadsheetOpen && (
        <Suspense fallback={<div style={{ padding: '1rem', color: '#888' }}>Loading spreadsheet...</div>}>
          <GeometrySpreadsheet />
        </Suspense>
      )}
    </div>
  )
}

export default ViewportPanel
