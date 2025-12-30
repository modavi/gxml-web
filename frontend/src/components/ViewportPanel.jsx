import { useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '../stores/appStore'
import { useViewportStore } from '../stores/viewportStore'
import { useThreeScene } from '../hooks/useThreeScene'
import OptionsPanel from './OptionsPanel'
import GeometrySpreadsheet from './GeometrySpreadsheet'
import ToolbarButton from './ui/ToolbarButton'
import { IconReset, IconSettings, IconTable } from './ui/Icons'
import './ViewportPanel.css'

function ViewportPanel() {
  const containerRef = useRef(null)
  const { 
    toggleOptionsPanel, 
    toggleSpreadsheet,
    spreadsheetOpen,
  } = useViewportStore()
  
  const geometryData = useAppStore((state) => state.geometryData)
  
  const { resetView } = useThreeScene(containerRef, geometryData)

  // Keyboard shortcut for reset view
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'f' || e.key === 'F') {
        // Don't trigger if typing in editor
        const activeElement = document.activeElement
        if (activeElement?.closest('.editor-panel')) return
        resetView()
      }
    }
    
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [resetView])

  return (
    <div className="viewport-panel">
      <div className="viewport-wrapper">
        <div ref={containerRef} className="viewport-container" />
        
        {/* Toolbar overlay */}
        <div className="viewport-toolbar">
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
          <ToolbarButton
            icon={<IconTable />}
            title="Geometry Spreadsheet"
            onClick={toggleSpreadsheet}
            active={spreadsheetOpen}
          />
        </div>
        
        <OptionsPanel />
      </div>
      
      {spreadsheetOpen && <GeometrySpreadsheet />}
    </div>
  )
}

export default ViewportPanel
