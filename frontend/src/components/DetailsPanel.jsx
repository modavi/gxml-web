import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '../stores/appStore'
import { useViewportStore } from '../stores/viewportStore'
import './DetailsPanel.css'

/**
 * Parse XML to extract panel attributes by index
 */
function getPanelAttributes(xmlContent, panelIndex) {
  if (panelIndex === null || panelIndex === undefined) return null
  
  const panelRegex = /<panel\b([^>]*?)(\/?>)/gi
  let match
  let currentIndex = 0
  
  while ((match = panelRegex.exec(xmlContent)) !== null) {
    if (currentIndex === panelIndex) {
      const attrString = match[1]
      const attrs = {}
      
      // Parse attributes from the string
      const attrRegex = /(\w+(?:-\w+)*)=["']([^"']*)["']/g
      let attrMatch
      while ((attrMatch = attrRegex.exec(attrString)) !== null) {
        attrs[attrMatch[1]] = attrMatch[2]
      }
      
      return {
        index: panelIndex,
        attributes: attrs,
        fullMatch: match[0],
        startPos: match.index
      }
    }
    currentIndex++
  }
  
  return null
}

/**
 * Update a panel attribute in XML content
 */
function updatePanelAttribute(xmlContent, panelIndex, attrName, attrValue) {
  const panelRegex = /<panel\b([^>]*?)(\/?>)/gi
  let match
  let currentIndex = 0
  
  while ((match = panelRegex.exec(xmlContent)) !== null) {
    if (currentIndex === panelIndex) {
      const attrString = match[1]
      const closing = match[2]
      const startPos = match.index
      
      let newAttrString
      const attrPattern = new RegExp(`(${attrName})=["'][^"']*["']`)
      
      if (attrValue === '' || attrValue === null) {
        // Remove attribute
        newAttrString = attrString.replace(attrPattern, '').replace(/\s+/g, ' ').trim()
      } else if (attrPattern.test(attrString)) {
        // Update existing attribute
        newAttrString = attrString.replace(attrPattern, `${attrName}="${attrValue}"`)
      } else {
        // Add new attribute
        newAttrString = attrString.trim() + ` ${attrName}="${attrValue}"`
      }
      
      const newTag = `<panel${newAttrString ? ' ' + newAttrString.trim() : ''}${closing}`
      return xmlContent.substring(0, startPos) + newTag + xmlContent.substring(startPos + match[0].length)
    }
    currentIndex++
  }
  
  return xmlContent
}

// Panel attribute definitions with types and constraints
const PANEL_ATTRIBUTES = {
  // Dimensions
  width: { type: 'number', label: 'Width', default: 1, step: 0.1 },
  height: { type: 'number', label: 'Height', default: 1, step: 0.1 },
  thickness: { type: 'number', label: 'Thickness', default: 0.25, step: 0.05 },
  
  // Position
  x: { type: 'number', label: 'X Position', default: 0, step: 0.1 },
  y: { type: 'number', label: 'Y Position', default: 0, step: 0.1 },
  z: { type: 'number', label: 'Z Position', default: 0, step: 0.1 },
  
  // Rotation
  rx: { type: 'number', label: 'Rotate X', default: 0, step: 5 },
  ry: { type: 'number', label: 'Rotate Y', default: 0, step: 5 },
  rz: { type: 'number', label: 'Rotate Z', default: 0, step: 5 },
  
  // Layout
  direction: { type: 'select', label: 'Direction', options: ['x', 'y', 'z', '-x', '-y', '-z'], default: 'x' },
  anchor: { type: 'select', label: 'Anchor', options: ['front', 'back', 'center'], default: 'center' },
  align: { type: 'select', label: 'Align', options: ['start', 'center', 'end'], default: 'center' },
  
  // Other
  name: { type: 'text', label: 'Name', default: '' },
}

// Group attributes by category
const ATTRIBUTE_GROUPS = [
  { label: 'Dimensions', attrs: ['width', 'height', 'thickness'] },
  { label: 'Position', attrs: ['x', 'y', 'z'] },
  { label: 'Rotation', attrs: ['rx', 'ry', 'rz'] },
  { label: 'Layout', attrs: ['direction', 'anchor', 'align'] },
  { label: 'Other', attrs: ['name'] },
]

function DetailsPanel() {
  const xmlContent = useAppStore((state) => state.xmlContent)
  const setXmlContent = useAppStore((state) => state.setXmlContent)
  const renderGXML = useAppStore((state) => state.renderGXML)
  const isAutoUpdate = useAppStore((state) => state.isAutoUpdate)
  
  const selectedElementId = useViewportStore((state) => state.selectedElementId)
  const selectionMode = useViewportStore((state) => state.selectionMode)
  
  const [panelData, setPanelData] = useState(null)
  const [localValues, setLocalValues] = useState({})
  
  // Parse panel data when selection changes
  useEffect(() => {
    if (selectionMode === 'element' && selectedElementId !== null) {
      const data = getPanelAttributes(xmlContent, selectedElementId)
      setPanelData(data)
      setLocalValues(data?.attributes || {})
    } else {
      setPanelData(null)
      setLocalValues({})
    }
  }, [selectedElementId, selectionMode, xmlContent])
  
  const handleAttributeChange = useCallback((attrName, value) => {
    // Update local state immediately for responsive UI
    setLocalValues(prev => ({ ...prev, [attrName]: value }))
    
    // Update XML
    const newXml = updatePanelAttribute(xmlContent, selectedElementId, attrName, value)
    setXmlContent(newXml)
    
    // Trigger render if auto-update is on
    if (isAutoUpdate) {
      // Debounce render for number inputs
      clearTimeout(window._detailsPanelRenderTimeout)
      window._detailsPanelRenderTimeout = setTimeout(() => {
        renderGXML()
      }, 300)
    }
  }, [xmlContent, selectedElementId, setXmlContent, renderGXML, isAutoUpdate])
  
  const handleNumberStep = useCallback((attrName, direction) => {
    const def = PANEL_ATTRIBUTES[attrName]
    const currentValue = parseFloat(localValues[attrName]) || def.default || 0
    const step = def.step || 1
    const newValue = direction === 'up' ? currentValue + step : currentValue - step
    // Round to avoid floating point issues
    const rounded = Math.round(newValue * 1000) / 1000
    handleAttributeChange(attrName, rounded.toString())
  }, [localValues, handleAttributeChange])
  
  const renderAttribute = (attrName) => {
    const def = PANEL_ATTRIBUTES[attrName]
    if (!def) return null
    
    const value = localValues[attrName] ?? ''
    const id = `attr-${attrName}`
    
    switch (def.type) {
      case 'number':
        return (
          <div className="attribute-row" key={attrName}>
            <label htmlFor={id}>{def.label}</label>
            <div className="number-input-wrapper">
              <input
                id={id}
                type="number"
                value={value}
                step={def.step}
                placeholder={def.default?.toString()}
                onChange={(e) => handleAttributeChange(attrName, e.target.value)}
              />
              <div className="number-spinners">
                <button 
                  type="button" 
                  className="spinner-btn spinner-up"
                  onClick={() => handleNumberStep(attrName, 'up')}
                  tabIndex={-1}
                >
                  ▲
                </button>
                <button 
                  type="button" 
                  className="spinner-btn spinner-down"
                  onClick={() => handleNumberStep(attrName, 'down')}
                  tabIndex={-1}
                >
                  ▼
                </button>
              </div>
            </div>
          </div>
        )
      
      case 'select':
        return (
          <div className="attribute-row" key={attrName}>
            <label htmlFor={id}>{def.label}</label>
            <select
              id={id}
              value={value}
              onChange={(e) => handleAttributeChange(attrName, e.target.value)}
            >
              <option value="">Default</option>
              {def.options.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        )
      
      case 'text':
      default:
        return (
          <div className="attribute-row" key={attrName}>
            <label htmlFor={id}>{def.label}</label>
            <input
              id={id}
              type="text"
              value={value}
              placeholder={def.default?.toString() || ''}
              onChange={(e) => handleAttributeChange(attrName, e.target.value)}
            />
          </div>
        )
    }
  }
  
  // Show placeholder when nothing selected
  if (!panelData) {
    return (
      <div className="details-panel">
        <div className="details-header">
          <h3>Details</h3>
        </div>
        <div className="details-empty">
          <p>Select an element to edit its properties</p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="details-panel">
      <div className="details-header">
        <h3>Panel {selectedElementId}</h3>
      </div>
      
      <div className="details-content">
        {ATTRIBUTE_GROUPS.map(group => (
          <div className="attribute-group" key={group.label}>
            <div className="attribute-group-header">{group.label}</div>
            {group.attrs.map(attr => renderAttribute(attr))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default DetailsPanel
