import { useViewportStore } from '../stores/viewportStore'
import { useAppStore } from '../stores/appStore'
import './OptionsPanel.css'

function OptionsPanel() {
  const {
    optionsPanelOpen,
    setOptionsPanelOpen,
    viewMode,
    setViewMode,
    colorMode,
    setColorMode,
    showFaceLabels,
    setShowFaceLabels,
    hideOccludedLabels,
    setHideOccludedLabels,
    showVertices,
    setShowVertices,
    enableInertia,
    setEnableInertia,
  } = useViewportStore()
  
  const renderGXML = useAppStore((state) => state.renderGXML)

  if (!optionsPanelOpen) return null

  const handleColorModeChange = (mode) => {
    setColorMode(mode)
    renderGXML() // Re-render to apply new colors
  }

  return (
    <div className="options-panel">
      <div className="options-header">
        <span>View Options</span>
        <button className="options-close" onClick={() => setOptionsPanelOpen(false)}>
          ×
        </button>
      </div>

      <OptionSection title="View Mode">
        <ButtonGroup
          options={[
            { value: 'lit', label: 'Lit' },
            { value: 'unlit', label: 'Unlit' },
            { value: 'wireframe', label: 'Wire' },
            { value: 'xray', label: 'X-ray' },
          ]}
          value={viewMode}
          onChange={setViewMode}
        />
      </OptionSection>

      <OptionSection title="Panel Colors">
        <ButtonGroup
          options={[
            { value: 'random', label: 'Random' },
            { value: 'uniform', label: 'Uniform' },
          ]}
          value={colorMode}
          onChange={handleColorModeChange}
        />
      </OptionSection>

      <OptionSection title="Labels">
        <Toggle
          label="Show Face IDs"
          checked={showFaceLabels}
          onChange={setShowFaceLabels}
        />
        <Toggle
          label="Hide Occluded"
          checked={hideOccludedLabels}
          onChange={setHideOccludedLabels}
        />
      </OptionSection>

      <OptionSection title="Vertices">
        <Toggle
          label="Show Vertices"
          checked={showVertices}
          onChange={setShowVertices}
        />
      </OptionSection>

      <OptionSection title="Camera">
        <Toggle
          label="Inertia / Damping"
          checked={enableInertia}
          onChange={setEnableInertia}
        />
        <div className="option-hint">
          LMB: Rotate, RMB/Alt+LMB: Pan, Scroll: Zoom
        </div>
      </OptionSection>
    </div>
  )
}

function OptionSection({ title, children }) {
  return (
    <div className="option-section">
      <div className="option-section-title">{title}</div>
      {children}
    </div>
  )
}

function ButtonGroup({ options, value, onChange }) {
  return (
    <div className="option-buttons">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={`option-btn ${value === opt.value ? 'active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="option-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  )
}

export default OptionsPanel
