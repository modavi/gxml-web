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
    vertexScale,
    setVertexScale,
    enableInertia,
    setEnableInertia,
    showPerfStats,
    setShowPerfStats,
  } = useViewportStore()
  
  const renderGXML = useAppStore((state) => state.renderGXML)
  const backendMode = useAppStore((state) => state.backendMode)
  const setBackendMode = useAppStore((state) => state.setBackendMode)
  const webGPUAvailable = useAppStore((state) => state.webGPUAvailable)

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

      <OptionSection title="Point Size">
        <Slider
          label="Size"
          value={vertexScale}
          min={0.5}
          max={3}
          step={0.1}
          onChange={setVertexScale}
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

      <OptionSection title="Debug">
        <Toggle
          label="Show Performance Stats"
          checked={showPerfStats}
          onChange={setShowPerfStats}
        />
      </OptionSection>

      <OptionSection title="Backend">
        <ButtonGroup
          options={[
            { value: 'server', label: 'Server' },
            { value: 'browser', label: 'Browser', disabled: !webGPUAvailable },
          ]}
          value={backendMode}
          onChange={(mode) => {
            setBackendMode(mode)
            renderGXML() // Re-render with new backend
          }}
        />
        <div className="option-hint">
          {webGPUAvailable 
            ? '✅ WebGPU available - Browser mode uses local GPU'
            : '⚠️ WebGPU not available - Server mode only'}
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
          className={`option-btn ${value === opt.value ? 'active' : ''} ${opt.disabled ? 'disabled' : ''}`}
          onClick={() => !opt.disabled && onChange(opt.value)}
          disabled={opt.disabled}
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

function Slider({ label, value, min, max, step, onChange }) {
  return (
    <div className="option-slider">
      <span className="option-slider-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="option-slider-value">{value.toFixed(1)}</span>
    </div>
  )
}

export default OptionsPanel
