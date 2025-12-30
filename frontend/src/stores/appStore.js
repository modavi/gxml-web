import { create } from 'zustand'

const DEFAULT_GXML = `<root>
    <panel thickness="0.25"/>
</root>`

export const useAppStore = create((set, get) => ({
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
