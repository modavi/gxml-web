import { useViewportStore } from '../stores/viewportStore'
import { useAppStore } from '../stores/appStore'
import './PerfStatsHUD.css'

/**
 * Performance statistics HUD overlay.
 * Shows timing breakdown for server-side and client-side rendering.
 */
function PerfStatsHUD() {
  const showPerfStats = useViewportStore((state) => state.showPerfStats)
  const geometryData = useAppStore((state) => state.geometryData)
  const threeJsTimings = useAppStore((state) => state.threeJsTimings)
  
  if (!showPerfStats) return null
  
  const timings = geometryData?.timings
  const server = timings?.server || {}
  
  // Calculate layout total
  const layoutTotal = (server.measure || 0) + (server.prelayout || 0) + 
                      (server.layout || 0) + (server.postlayout || 0)
  
  return (
    <div className="perf-stats-hud">
      <div className="perf-stats-title">⏱ Performance</div>
      
      <div className="perf-stats-section">
        <div className="perf-stats-section-title">Server (Python)</div>
        <PerfRow label="Parse" value={server.parse} />
        <PerfRow label="Measure" value={server.measure} indent />
        <PerfRow label="Pre-layout" value={server.prelayout} indent />
        <PerfRow label="Layout" value={server.layout} indent />
        <PerfRow label="Post-layout" value={server.postlayout} indent />
        <PerfRow label="Layout Total" value={layoutTotal} highlight />
        <PerfRow label="Render/Solve" value={server.render} />
        <PerfRow label="Serialize" value={server.serialize} />
        <PerfRow label="Server Total" value={server.total} total />
      </div>
      
      <div className="perf-stats-section">
        <div className="perf-stats-section-title">Network</div>
        <PerfRow label="Fetch" value={timings?.networkFetch} />
        <PerfRow label="ArrayBuffer" value={timings?.arrayBufferRead} />
        <PerfRow label="Binary Parse" value={timings?.binaryParse} />
      </div>
      
      <div className="perf-stats-section">
        <div className="perf-stats-section-title">Three.js</div>
        <PerfRow label="Meshes" value={threeJsTimings?.meshes} />
        <PerfRow label="Labels" value={threeJsTimings?.labels} />
        <PerfRow label="Vertices" value={threeJsTimings?.vertices} />
        <PerfRow label="Scene Total" value={threeJsTimings?.total} total />
      </div>
      
      <div className="perf-stats-section">
        <div className="perf-stats-section-title">Summary</div>
        <PerfRow label="Panels" value={geometryData?.panels?.length} isCount />
        <PerfRow label="End-to-End" value={
          (timings?.networkFetch || 0) + (threeJsTimings?.total || 0)
        } total />
      </div>
    </div>
  )
}

function PerfRow({ label, value, indent, highlight, total, isCount }) {
  if (value === undefined || value === null) return null
  
  const className = [
    'perf-row',
    indent && 'perf-row-indent',
    highlight && 'perf-row-highlight',
    total && 'perf-row-total',
  ].filter(Boolean).join(' ')
  
  const displayValue = isCount ? value : `${value.toFixed(2)} ms`
  
  return (
    <div className={className}>
      <span className="perf-label">{label}</span>
      <span className="perf-value">{displayValue}</span>
    </div>
  )
}

export default PerfStatsHUD
