import { create } from 'zustand'

const DEFAULT_GXML = `<root>
    <panel thickness="0.25"/>
</root>`

export const useAppStore = create((set, get) => ({
  // Editor ref for programmatic control
  editorRef: null,
  setEditorRef: (ref) => set({ editorRef: ref }),
  
  // Select panel in editor by index (0-based, can be string or number)
  selectPanelInEditor: (panelIndex) => {
    const { xmlContent, editorRef } = get()
    if (!editorRef || panelIndex === null || panelIndex === undefined) return
    
    // Convert to number if string
    const index = typeof panelIndex === 'string' ? parseInt(panelIndex, 10) : panelIndex
    if (isNaN(index)) return
    
    // Find all <panel tags (case insensitive)
    const panelRegex = /<panel\b/gi
    let match
    let currentIndex = 0
    let startPos = -1
    
    while ((match = panelRegex.exec(xmlContent)) !== null) {
      if (currentIndex === index) {
        startPos = match.index
        break
      }
      currentIndex++
    }
    
    if (startPos === -1) return
    
    // Find the end of this panel tag (either /> or </panel>)
    const afterTag = xmlContent.substring(startPos)
    const selfCloseMatch = afterTag.match(/^<panel[^>]*\/>/)
    const openCloseMatch = afterTag.match(/^<panel[^>]*>[\s\S]*?<\/panel>/)
    
    let endPos
    if (selfCloseMatch) {
      endPos = startPos + selfCloseMatch[0].length
    } else if (openCloseMatch) {
      endPos = startPos + openCloseMatch[0].length
    } else {
      // Just select the opening tag
      const tagEnd = afterTag.indexOf('>')
      endPos = startPos + tagEnd + 1
    }
    
    // Convert character positions to line/column
    const getLineCol = (pos) => {
      const lines = xmlContent.substring(0, pos).split('\n')
      return {
        lineNumber: lines.length,
        column: lines[lines.length - 1].length + 1
      }
    }
    
    const startLC = getLineCol(startPos)
    const endLC = getLineCol(endPos)
    
    // Set selection in Monaco
    editorRef.setSelection({
      startLineNumber: startLC.lineNumber,
      startColumn: startLC.column,
      endLineNumber: endLC.lineNumber,
      endColumn: endLC.column
    })
    
    // Reveal the selection
    editorRef.revealLineInCenter(startLC.lineNumber)
  },
  
  // Add a panel from creation mode - inserted after selectedPanelIndex
  // startPoint and endPoint are in world XZ coordinates (floor plane)
  // parentRotation is the cumulative world rotation of the parent panel (in degrees)
  // snapInfo: optional { spanId, spanPoint } for snapping to another panel
  // Returns: Promise that resolves with the new panel index when rendering is complete
  addPanelFromPoints: async (startPoint, endPoint, afterPanelIndex = null, thickness = 0.25, parentRotation = 0, snapInfo = null) => {
    const { xmlContent, setXmlContent, renderGXML, isAutoUpdate } = get()
    
    // Calculate panel properties from two points in XZ plane
    const dx = endPoint.x - startPoint.x
    const dz = endPoint.z - startPoint.z
    const width = Math.sqrt(dx * dx + dz * dz)
    
    // Calculate world rotation (angle in XZ plane, around Y axis)
    // atan2(dz, dx) gives angle from +X toward +Z
    // Negate for correct direction
    const worldAngle = -Math.atan2(dz, dx) * (180 / Math.PI)
    
    // GXML rotate attribute is relative to parent, so subtract parent's rotation
    const relativeAngle = worldAngle - parentRotation
    
    // Round values for cleaner XML
    const round = (v) => Math.round(v * 1000) / 1000
    
    // Build panel XML - note: position is NOT set because the panel
    // inherits position from the previous panel's endpoint automatically
    const panelAttrs = []
    panelAttrs.push(`width="${round(width)}"`)
    panelAttrs.push(`thickness="${thickness}"`)
    if (round(relativeAngle) !== 0) panelAttrs.push(`rotate="${round(relativeAngle)}"`)
    
    // Add span attributes if snapping to another panel
    if (snapInfo) {
      panelAttrs.push(`span-id="${snapInfo.spanId}"`)
      panelAttrs.push(`span-point="${snapInfo.spanPoint}"`)
    }
    
    const panelXml = `<panel ${panelAttrs.join(' ')}/>`
    
    if (afterPanelIndex !== null) {
      // Insert after the specified panel
      const panelRegex = /<panel\b[^>]*(?:\/>|>[\s\S]*?<\/panel>)/gi
      let match
      let currentIndex = 0
      let insertPos = -1
      
      while ((match = panelRegex.exec(xmlContent)) !== null) {
        if (currentIndex === afterPanelIndex) {
          insertPos = match.index + match[0].length
          break
        }
        currentIndex++
      }
      
      if (insertPos !== -1) {
        const newContent = xmlContent.substring(0, insertPos) + '\n    ' + panelXml + xmlContent.substring(insertPos)
        setXmlContent(newContent)
        
        if (isAutoUpdate) {
          await renderGXML()
        }
        return afterPanelIndex + 1  // Return new panel's index
      }
    }
    
    // Fallback: insert before closing </root> tag
    const closingTagMatch = xmlContent.match(/<\/root>/i)
    if (closingTagMatch) {
      const insertPos = xmlContent.lastIndexOf('</root>')
      const newContent = xmlContent.substring(0, insertPos) + '    ' + panelXml + '\n' + xmlContent.substring(insertPos)
      setXmlContent(newContent)
      
      if (isAutoUpdate) {
        await renderGXML()
      }
      // Count existing panels to determine index
      const panelCount = (xmlContent.match(/<panel\b/gi) || []).length
      return panelCount  // New panel is at the end
    }
    
    return null  // Failed
  },
  
  // Editor state
  xmlContent: DEFAULT_GXML,
  setXmlContent: (content) => set({ xmlContent: content }),
  
  // Schema for autocomplete
  schema: { tags: {} },
  loadSchema: async () => {
    try {
      const response = await fetch('/api/schema')
      if (response.ok) {
        const schema = await response.json()
        set({ schema })
        console.log('Loaded GXML schema:', Object.keys(schema.tags))
      }
    } catch (error) {
      console.error('Error loading schema:', error)
    }
  },
  
  // Render state
  isAutoUpdate: true,
  setAutoUpdate: (value) => set({ isAutoUpdate: value }),
  
  geometryData: null,
  setGeometryData: (data) => set({ geometryData: data }),
  
  error: null,
  setError: (error) => set({ error }),
  
  // Render action
  renderGXML: async () => {
    const { xmlContent, setGeometryData, setError } = get()
    setError(null)
    
    try {
      const response = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xml: xmlContent }),
      })
      
      const result = await response.json()
      
      if (result.success) {
        setGeometryData(result.data)
      } else {
        setError(result.error || 'Unknown error occurred')
      }
    } catch (error) {
      setError(`Network error: ${error.message}`)
    }
  },
}))
