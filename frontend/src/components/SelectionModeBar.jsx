import { useViewportStore } from '../stores/viewportStore'
import { IconElement, IconFace, IconPoint } from './ui/Icons'
import './SelectionModeBar.css'

function SelectionModeBar() {
  const { selectionMode, setSelectionMode } = useViewportStore()

  return (
    <div className="selection-mode-bar">
      <button
        className={`selection-mode-btn ${selectionMode === 'element' ? 'active' : ''}`}
        onClick={() => setSelectionMode('element')}
        title="Element Selection - Select entire panels"
      >
        <IconElement /> Element
      </button>
      <button
        className={`selection-mode-btn ${selectionMode === 'face' ? 'active' : ''}`}
        onClick={() => setSelectionMode('face')}
        title="Face Selection - Select individual faces"
      >
        <IconFace /> Face
      </button>
      <button
        className={`selection-mode-btn ${selectionMode === 'point' ? 'active' : ''}`}
        onClick={() => setSelectionMode('point')}
        title="Point Selection - Select vertices"
      >
        <IconPoint /> Point
      </button>
    </div>
  )
}

export default SelectionModeBar
