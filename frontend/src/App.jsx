import { useEffect, lazy, Suspense } from 'react'
import { useAppStore } from './stores/appStore'
import ViewportPanel from './components/ViewportPanel'
import Resizer from './components/Resizer'
import './styles/App.css'

// Lazy load heavy components (Monaco Editor, AG Grid)
const EditorPanel = lazy(() => import('./components/EditorPanel'))
const DetailsPanel = lazy(() => import('./components/DetailsPanel'))

// Simple loading placeholder
const LoadingPanel = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#888' }}>
    Loading...
  </div>
)

function App() {
  const loadSchema = useAppStore((state) => state.loadSchema)
  const renderGXML = useAppStore((state) => state.renderGXML)
  const initBrowserBackend = useAppStore((state) => state.initBrowserBackend)

  useEffect(() => {
    // Initialize browser backend (WebGPU check)
    initBrowserBackend()
    loadSchema()
    // Initial render on app load
    renderGXML()
  }, [initBrowserBackend, loadSchema, renderGXML])

  return (
    <div className="app-container">
      <Suspense fallback={<LoadingPanel />}>
        <EditorPanel />
      </Suspense>
      <Resizer side="left" />
      <ViewportPanel />
      <Resizer side="right" />
      <Suspense fallback={<LoadingPanel />}>
        <DetailsPanel />
      </Suspense>
    </div>
  )
}

export default App
