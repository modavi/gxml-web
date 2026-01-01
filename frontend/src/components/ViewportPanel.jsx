import { useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { useAppStore } from '../stores/appStore'
import { useViewportStore } from '../stores/viewportStore'
import { useThreeScene } from '../hooks/useThreeScene'
import OptionsPanel from './OptionsPanel'
import SelectionModeBar from './SelectionModeBar'
import ToolbarButton from './ui/ToolbarButton'
import { IconReset, IconSettings, IconPencil, IconUndo } from './ui/Icons'
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
        
        {/* Creation mode indicator */}
        {creationMode && (
          <div className={`creation-mode-indicator ${!hasValidSelection ? 'warning' : ''}`}>
            <span>🎨 Creation Mode</span>
            {hasValidSelection ? (
              <span className="creation-hint">Move mouse to preview • Click to create panel • Escape to exit</span>
            ) : (
              <span className="creation-hint warning">⚠️ Select a panel first to extend from its endpoint</span>
            )}
          </div>
        )}
        
        {/* Toolbar overlay */}
        <div className="viewport-toolbar">
          <ToolbarButton
            icon={<IconPencil />}
            title={creationMode ? "Exit Creation Mode (Esc)" : "Enter Creation Mode"}
            onClick={toggleCreationMode}
            active={creationMode}
          />
          <ToolbarButton
            icon={<IconReset />}
            title="Reset View (F)"
            onClick={resetView}
          />
          <ToolbarButton
            icon={<IconSettings />}
            title="View Options"
            onClick={toggleOptionsPanel}
          />
        </div>
        
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
