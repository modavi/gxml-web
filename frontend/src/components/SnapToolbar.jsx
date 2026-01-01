import { useState, useRef, useEffect } from 'react'
import { useViewportStore } from '../stores/viewportStore'
import { Grid3X3, RotateCw, Magnet } from 'lucide-react'
import { IconChevronDown } from './ui/Icons'
import './SnapToolbar.css'

const GRID_SIZES = [0.1, 0.25, 0.5, 1.0, 2.0, 5.0]
const ROTATION_INCREMENTS = [5, 10, 15, 30, 45, 60, 90, 120]
const WEIGHT_OPTIONS = [0, 0.25, 0.5, 0.75, 1.0]

function SnapToolbar() {
  const {
    gridSnapEnabled,
    gridSnapSize,
    toggleGridSnap,
    setGridSnapSize,
    rotationSnapEnabled,
    rotationSnapIncrement,
    toggleRotationSnap,
    setRotationSnapIncrement,
    wallSnapEnabled,
    wallSnapWeights,
    toggleWallSnap,
    setWallSnapWeight,
  } = useViewportStore()

  const [openDropdown, setOpenDropdown] = useState(null) // 'grid' | 'rotation' | 'wall' | null
  const dropdownRef = useRef(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleDropdown = (name) => {
    setOpenDropdown(openDropdown === name ? null : name)
  }

  return (
    <div className="snap-toolbar" ref={dropdownRef}>
      {/* Grid Snap */}
      <div className="snap-button-group">
        <button
          className={`snap-toggle ${gridSnapEnabled ? 'active' : ''}`}
          onClick={toggleGridSnap}
          title="Toggle Grid Snap"
        >
          <Grid3X3 size={14} />
        </button>
        <button
          className={`snap-dropdown-toggle ${openDropdown === 'grid' ? 'open' : ''}`}
          onClick={() => toggleDropdown('grid')}
          title="Grid Snap Settings"
        >
          <span className="snap-value">{gridSnapSize}</span>
          <IconChevronDown />
        </button>
        {openDropdown === 'grid' && (
          <div className="snap-dropdown">
            <div className="snap-dropdown-title">Grid Size</div>
            {GRID_SIZES.map((size) => (
              <button
                key={size}
                className={`snap-dropdown-item ${gridSnapSize === size ? 'active' : ''}`}
                onClick={() => {
                  setGridSnapSize(size)
                  setOpenDropdown(null)
                }}
              >
                <span className="snap-dropdown-radio" />
                {size}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Rotation Snap */}
      <div className="snap-button-group">
        <button
          className={`snap-toggle ${rotationSnapEnabled ? 'active' : ''}`}
          onClick={toggleRotationSnap}
          title="Toggle Rotation Snap"
        >
          <RotateCw size={14} />
        </button>
        <button
          className={`snap-dropdown-toggle ${openDropdown === 'rotation' ? 'open' : ''}`}
          onClick={() => toggleDropdown('rotation')}
          title="Rotation Snap Settings"
        >
          <span className="snap-value">{rotationSnapIncrement}°</span>
          <IconChevronDown />
        </button>
        {openDropdown === 'rotation' && (
          <div className="snap-dropdown">
            <div className="snap-dropdown-title">Rotation Increment</div>
            {ROTATION_INCREMENTS.map((deg) => (
              <button
                key={deg}
                className={`snap-dropdown-item ${rotationSnapIncrement === deg ? 'active' : ''}`}
                onClick={() => {
                  setRotationSnapIncrement(deg)
                  setOpenDropdown(null)
                }}
              >
                <span className="snap-dropdown-radio" />
                {deg}°
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Wall Snap */}
      <div className="snap-button-group">
        <button
          className={`snap-toggle ${wallSnapEnabled ? 'active' : ''}`}
          onClick={toggleWallSnap}
          title="Toggle Wall Snap"
        >
          <Magnet size={14} />
        </button>
        <button
          className={`snap-dropdown-toggle ${openDropdown === 'wall' ? 'open' : ''}`}
          onClick={() => toggleDropdown('wall')}
          title="Wall Snap Settings"
        >
          <IconChevronDown />
        </button>
        {openDropdown === 'wall' && (
          <div className="snap-dropdown snap-dropdown-wide">
            <div className="snap-dropdown-title">Snap Point Weights</div>
            <div className="snap-weight-row">
              <span className="snap-weight-label">Start (0)</span>
              <div className="snap-weight-options">
                {WEIGHT_OPTIONS.map((w) => (
                  <button
                    key={w}
                    className={`snap-weight-btn ${wallSnapWeights.start === w ? 'active' : ''}`}
                    onClick={() => setWallSnapWeight('start', w)}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
            <div className="snap-weight-row">
              <span className="snap-weight-label">Middle (0.5)</span>
              <div className="snap-weight-options">
                {WEIGHT_OPTIONS.map((w) => (
                  <button
                    key={w}
                    className={`snap-weight-btn ${wallSnapWeights.middle === w ? 'active' : ''}`}
                    onClick={() => setWallSnapWeight('middle', w)}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
            <div className="snap-weight-row">
              <span className="snap-weight-label">End (1)</span>
              <div className="snap-weight-options">
                {WEIGHT_OPTIONS.map((w) => (
                  <button
                    key={w}
                    className={`snap-weight-btn ${wallSnapWeights.end === w ? 'active' : ''}`}
                    onClick={() => setWallSnapWeight('end', w)}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
            <div className="snap-dropdown-hint">
              Hold Ctrl to disable all snapping
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SnapToolbar
