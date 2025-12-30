import { useRef, useEffect, useCallback } from 'react'
import './Resizer.css'

function Resizer() {
  const resizerRef = useRef(null)
  const isDraggingRef = useRef(false)

  const handleMouseMove = useCallback((e) => {
    if (!isDraggingRef.current) return
    
    // Check if mouse button is still pressed (handles missed mouseup events)
    if (e.buttons === 0) {
      isDraggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      resizerRef.current?.classList.remove('dragging')
      return
    }
    
    const container = document.querySelector('.app-container')
    const editorPanel = document.querySelector('.editor-panel')
    if (!container || !editorPanel) return
    
    const containerRect = container.getBoundingClientRect()
    const newWidth = e.clientX - containerRect.left
    const minWidth = 250
    const maxWidth = containerRect.width - 300
    const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth))
    
    editorPanel.style.width = `${clampedWidth}px`
    
    // Dispatch resize event for Three.js canvas
    window.dispatchEvent(new Event('resize'))
  }, [])

  const handleMouseUp = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      resizerRef.current?.classList.remove('dragging')
    }
  }, [])

  const handleMouseDown = useCallback((e) => {
    isDraggingRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    resizerRef.current?.classList.add('dragging')
    e.preventDefault()
  }, [])

  useEffect(() => {
    const handleMouseLeave = (e) => {
      // Stop dragging if mouse leaves the document
      if (e.buttons === 0 && isDraggingRef.current) {
        handleMouseUp()
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('mouseleave', handleMouseLeave)
    // Also handle blur (when window loses focus)
    window.addEventListener('blur', handleMouseUp)
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('mouseleave', handleMouseLeave)
      window.removeEventListener('blur', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  return (
    <div
      ref={resizerRef}
      className="resizer"
      onMouseDown={handleMouseDown}
    />
  )
}

export default Resizer
