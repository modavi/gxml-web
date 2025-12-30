import { useEffect } from 'react'
import { useAppStore } from './stores/appStore'
import EditorPanel from './components/EditorPanel'
import ViewportPanel from './components/ViewportPanel'
import DetailsPanel from './components/DetailsPanel'
import Resizer from './components/Resizer'
import './styles/App.css'

function App() {
  const loadSchema = useAppStore((state) => state.loadSchema)
  const renderGXML = useAppStore((state) => state.renderGXML)

  useEffect(() => {
    loadSchema()
    // Initial render on app load
    renderGXML()
  }, [loadSchema, renderGXML])

  return (
    <div className="app-container">
      <EditorPanel />
      <Resizer side="left" />
      <ViewportPanel />
      <Resizer side="right" />
      <DetailsPanel />
    </div>
  )
}

export default App
