import { create } from 'zustand'
import { fetchBinaryGeometry } from '../utils/binaryGeometry'
import { buildApiUrl } from '../utils/apiConfig'
import { getBrowserSolver } from '../utils/browserSolver'
import { isWebGPUAvailable } from '../utils/webgpuShaders'
import { updateScene } from '../utils/sceneRegistry'

const DEFAULT_GXML = `<root>
    <panel thickness="0.25"/>
</root>`

export const useAppStore = create((set, get) => ({
  // Editor ref for programmatic control
  editorRef: null,
  setEditorRef: (ref) => set({ editorRef: ref }),
  
  // Hover decorations for editor
  hoverDecorations: [],
  setHoverDecorations: (decorations) => set({ hoverDecorations: decorations }),
  
  // Highlight panel in editor on hover (from viewport)
  highlightPanelInEditor: (panelIndex) => {
    const { xmlContent, editorRef, hoverDecorations } = get()
    if (!editorRef) return
    
    // Clear existing hover decorations
    if (panelIndex === null || panelIndex === undefined) {
      const newDecorations = editorRef.deltaDecorations(hoverDecorations, [])
      set({ hoverDecorations: newDecorations })
      return
    }
    
    // Convert to number if string
    const index = typeof panelIndex === 'string' ? parseInt(panelIndex, 10) : panelIndex
    if (isNaN(index)) return
    
    // Find the panel tag
    const panelRegex = /<panel\b[^>]*(?:\/>|>[\s\S]*?<\/panel>)/gi
    let match
    let currentIndex = 0
    
    while ((match = panelRegex.exec(xmlContent)) !== null) {
      if (currentIndex === index) {
        // Convert character positions to line/column
        const getLineCol = (pos) => {
          const lines = xmlContent.substring(0, pos).split('\n')
          return {
            lineNumber: lines.length,
            column: lines[lines.length - 1].length + 1
          }
        }
        
        const startLC = getLineCol(match.index)
        const endLC = getLineCol(match.index + match[0].length)
        
        // Create hover decoration
        const newDecorations = editorRef.deltaDecorations(hoverDecorations, [{
          range: {
            startLineNumber: startLC.lineNumber,
            startColumn: startLC.column,
            endLineNumber: endLC.lineNumber,
            endColumn: endLC.column
          },
          options: {
            className: 'xml-panel-viewport-hover',
            isWholeLine: false,
          }
        }])
        set({ hoverDecorations: newDecorations })
        return
      }
      currentIndex++
    }
  },
  
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
  
  // Add a panel from creation mode
  // startPoint and endPoint are in world XZ coordinates (floor plane)
  // parentRotation is the cumulative world rotation of the parent panel (in degrees)
  // snapInfo: optional { spanId, spanPoint } for snapping to another panel
  // attachInfo: optional { attachId, attachPoint } for attaching to a specific panel at a specific point
  // Generates shorthand: attach="id:point" and span="id:point"
  //   When provided, the panel is always appended to the end and uses attach-id/attach-point
  // Returns: Promise that resolves with the new panel index when rendering is complete
  addPanelFromPoints: async (startPoint, endPoint, afterPanelIndex = null, thickness = 0.25, parentRotation = 0, snapInfo = null, attachInfo = null) => {
    const { xmlContent, setXmlContent, renderGXML, isAutoUpdate } = get()
    const userStart = get().userActionStartTime
    if (userStart) console.log(`[TIMER] addPanelFromPoints entered at: ${(performance.now() - userStart).toFixed(2)}ms`)
    
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
    
    // Add span attribute if snapping to another panel (shorthand format "id:point")
    if (snapInfo) {
      panelAttrs.push(`span="${snapInfo.spanId}:${snapInfo.spanPoint}"`)
    }
    
    // Add attach attribute if attaching to a non-sequential panel (shorthand format "id:point")
    if (attachInfo) {
      const attachPoint = attachInfo.attachPoint !== undefined ? round(attachInfo.attachPoint) : 1
      panelAttrs.push(`attach="${attachInfo.attachId}:${attachPoint}"`)
    }
    
    const panelXml = `<panel ${panelAttrs.join(' ')}/>`
    
    // When attachInfo is provided, always append to end of panel list
    // This allows attaching to any panel regardless of position
    if (attachInfo) {
      const closingTagMatch = xmlContent.match(/<\/root>/i)
      if (closingTagMatch) {
        const insertPos = xmlContent.lastIndexOf('</root>')
        const newContent = xmlContent.substring(0, insertPos) + '    ' + panelXml + '\n' + xmlContent.substring(insertPos)
        
        const userStart = get().userActionStartTime
        if (userStart) console.log(`[TIMER] Before setXmlContent at: ${(performance.now() - userStart).toFixed(2)}ms`)
        setXmlContent(newContent)
        if (userStart) console.log(`[TIMER] After setXmlContent at: ${(performance.now() - userStart).toFixed(2)}ms`)
        
        if (isAutoUpdate) {
          if (userStart) console.log(`[TIMER] Before renderGXML at: ${(performance.now() - userStart).toFixed(2)}ms`)
          await renderGXML()
          if (userStart) console.log(`[TIMER] After renderGXML (awaited) at: ${(performance.now() - userStart).toFixed(2)}ms`)
        }
        // Count existing panels to determine index
        const panelCount = (xmlContent.match(/<panel\b/gi) || []).length
        return panelCount  // New panel is at the end
      }
    } else if (afterPanelIndex !== null) {
      // Legacy behavior: Insert after the specified panel (when no attachInfo)
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
  
  // Update an attribute on an existing panel
  // panelIndex: which panel to update (0-indexed)
  // attribute: the attribute name (e.g., 'attach-point')
  // value: the new value (null to remove the attribute)
  // Returns: Promise that resolves when complete
  updatePanelAttribute: async (panelIndex, attribute, value) => {
    const { xmlContent, setXmlContent, renderGXML, isAutoUpdate } = get()
    
    const panelRegex = /<panel\b[^>]*(?:\/>|>[\s\S]*?<\/panel>)/gi
    let match
    let currentIndex = 0
    
    while ((match = panelRegex.exec(xmlContent)) !== null) {
      if (currentIndex === panelIndex) {
        const panelTag = match[0]
        let newPanelTag
        
        // Check if attribute already exists
        const attrRegex = new RegExp(`\\b${attribute}="[^"]*"`)
        const hasAttr = attrRegex.test(panelTag)
        
        const round = (v) => Math.round(v * 1000) / 1000
        const roundedValue = typeof value === 'number' ? round(value) : value
        
        if (value === null) {
          // Remove the attribute
          newPanelTag = panelTag.replace(attrRegex, '').replace(/\s+/g, ' ').replace(' />', '/>')
        } else if (hasAttr) {
          // Update existing attribute
          newPanelTag = panelTag.replace(attrRegex, `${attribute}="${roundedValue}"`)
        } else {
          // Add new attribute (before the closing />)
          if (panelTag.endsWith('/>')) {
            newPanelTag = panelTag.replace('/>', ` ${attribute}="${roundedValue}"/>`)
          } else {
            // Has closing tag - add before >
            newPanelTag = panelTag.replace(/>/, ` ${attribute}="${roundedValue}">`)
          }
        }
        
        const newContent = xmlContent.substring(0, match.index) + newPanelTag + xmlContent.substring(match.index + panelTag.length)
        setXmlContent(newContent)
        
        if (isAutoUpdate) {
          await renderGXML()
        }
        return true
      }
      currentIndex++
    }
    
    return false  // Panel not found
  },
  
  // Editor state
  xmlContent: DEFAULT_GXML,
  setXmlContent: (content) => set({ xmlContent: content }),
  
  // Schema for autocomplete
  schema: { tags: {} },
  loadSchema: async () => {
    try {
      const apiUrl = await buildApiUrl('/api/schema')
      const response = await fetch(apiUrl)
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
  
  // Backend mode: 'server' (Python), 'browser' (WebGPU/JS), 'auto' (browser if available)
  // In Electron: 'cpu', 'c', 'gpu' for Python solver backend selection
  backendMode: 'server',
  setBackendMode: (mode) => set({ backendMode: mode }),
  
  // Python solver backend (Electron only): 'cpu', 'c', 'gpu'
  pythonBackend: 'cpu',
  setPythonBackend: (backend) => set({ pythonBackend: backend }),
  
  // Available Python backends (set by Electron on init)
  availablePythonBackends: { cpu: true, c: false, gpu: false },
  setAvailablePythonBackends: (backends) => set({ availablePythonBackends: backends }),
  
  // WebGPU availability (set on init)
  webGPUAvailable: false,
  setWebGPUAvailable: (value) => set({ webGPUAvailable: value }),
  
  // Initialize browser solver on startup
  initBrowserBackend: async () => {
    // Check for Electron and get Python backend info
    if (window.electronAPI?.isElectron) {
      try {
        const info = await window.electronAPI.getBackendInfo();
        set({ 
          availablePythonBackends: info.availableBackends,
          pythonBackend: info.currentBackend,
          backendMode: 'electron'  // Special mode for Electron
        });
        console.log('✅ Electron Python backend info:', info);
      } catch (e) {
        console.warn('Failed to get Electron backend info:', e);
      }
    }
    
    // Also check WebGPU for browser mode
    const available = isWebGPUAvailable();
    set({ webGPUAvailable: available });
    if (available) {
      try {
        await getBrowserSolver()
        console.log('✅ Browser GXML solver ready (WebGPU available)')
      } catch (e) {
        console.warn('Browser solver init failed:', e)
        set({ webGPUAvailable: false })
      }
    } else {
      console.log('ℹ️ WebGPU not available, using server backend')
    }
  },
  
  geometryData: null,
  setGeometryData: (data) => {
    // Update scene DIRECTLY, bypassing React scheduling
    // This eliminates ~600ms of React overhead for large scenes
    const delivered = updateScene(data)
    if (delivered) {
      console.log('[TIMER] Geometry delivered directly to Three.js (bypassing React)')
    }
    // Also update state for other consumers (spreadsheet, etc.)
    set({ geometryData: data })
  },
  
  // Three.js scene build timings (set by useThreeScene)
  threeJsTimings: null,
  setThreeJsTimings: (timings) => set({ threeJsTimings: timings }),
  
  // True end-to-end timing: starts at renderGXML, ends when Three.js scene is built
  renderStartTime: null,
  setRenderStartTime: (time) => set({ renderStartTime: time }),
  trueEndToEnd: null,
  setTrueEndToEnd: (time) => set({ trueEndToEnd: time }),
  
  // User action start time - set this when user initiates an action (click, keypress, etc.)
  userActionStartTime: null,
  setUserActionStartTime: (time) => set({ userActionStartTime: time }),
  userActionEndToEnd: null,
  setUserActionEndToEnd: (time) => set({ userActionEndToEnd: time }),
  
  error: null,
  setError: (error) => set({ error }),
  
  // Render action
  renderGXML: async () => {
    const { xmlContent, setGeometryData, setError, backendMode, webGPUAvailable, setRenderStartTime } = get()
    setError(null)
    
    // Start true end-to-end timer
    const renderStart = performance.now()
    setRenderStartTime(renderStart)
    console.log(`[TIMER] renderGXML started at: ${renderStart.toFixed(2)}`)
    
    // Determine if we should use browser backend
    const useBrowser = backendMode === 'browser' || 
                       (backendMode === 'auto' && webGPUAvailable)
    
    try {
      if (useBrowser) {
        // Browser-based solver (WebGPU accelerated)
        const solver = await getBrowserSolver()
        const data = await solver.solve(xmlContent)
        console.log(`[TIMER] setGeometryData (browser) at: ${(performance.now() - renderStart).toFixed(2)}ms from renderStart`)
        setGeometryData(data)
      } else {
        // Server binary protocol
        const data = await fetchBinaryGeometry(xmlContent)
        console.log(`[TIMER] setGeometryData (binary) at: ${(performance.now() - renderStart).toFixed(2)}ms from renderStart`)
        setGeometryData(data)
      }
    } catch (error) {
      setError(`Render error: ${error.message}`)
    }
  },
}))
