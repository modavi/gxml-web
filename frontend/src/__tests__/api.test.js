import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useAppStore } from '../stores/appStore'

/**
 * API Integration Tests
 * 
 * These tests verify the interaction between the frontend and backend API.
 * They mock fetch to simulate various server responses.
 */

describe('API Integration', () => {
  beforeEach(() => {
    // Reset store
    useAppStore.setState({
      xmlContent: '<root><panel/></root>',
      geometryData: null,
      error: null,
      schema: { tags: {} },
    })
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('/api/render', () => {
    it('should send XML content to render endpoint', async () => {
      const mockResponse = {
        success: true,
        data: {
          panels: [
            {
              id: '0-front',
              points: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]],
            },
          ],
        },
      }
      
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve(mockResponse),
      })

      await useAppStore.getState().renderGXML()

      expect(global.fetch).toHaveBeenCalledWith('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xml: '<root><panel/></root>' }),
      })
    })

    it('should update geometryData on successful render', async () => {
      const mockData = {
        panels: [
          { id: '0-front', points: [[0, 0, 0], [1, 0, 0]] },
          { id: '0-back', points: [[0, 0, -0.25], [1, 0, -0.25]] },
        ],
        vertices: [0, 0, 0, 1, 0, 0],
      }
      
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: mockData }),
      })

      await useAppStore.getState().renderGXML()

      expect(useAppStore.getState().geometryData).toEqual(mockData)
      expect(useAppStore.getState().error).toBeNull()
    })

    it('should set error on parse failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          success: false,
          error: 'XML Parse Error: unexpected token at line 1',
        }),
      })

      await useAppStore.getState().renderGXML()

      expect(useAppStore.getState().error).toBe('XML Parse Error: unexpected token at line 1')
      expect(useAppStore.getState().geometryData).toBeNull()
    })

    it('should set error on server error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          success: false,
          error: 'Internal server error',
        }),
      })

      await useAppStore.getState().renderGXML()

      expect(useAppStore.getState().error).toBe('Internal server error')
    })

    it('should handle network failure', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'))

      await useAppStore.getState().renderGXML()

      expect(useAppStore.getState().error).toContain('Network error')
      expect(useAppStore.getState().error).toContain('Failed to fetch')
    })

    it('should handle connection refused', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'))

      await useAppStore.getState().renderGXML()

      expect(useAppStore.getState().error).toContain('Network error')
    })

    it('should handle timeout', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('timeout'))

      await useAppStore.getState().renderGXML()

      expect(useAppStore.getState().error).toContain('Network error')
    })

    it('should clear previous error on new render', async () => {
      // Set initial error
      useAppStore.setState({ error: 'Previous error' })
      
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: { panels: [] } }),
      })

      await useAppStore.getState().renderGXML()

      expect(useAppStore.getState().error).toBeNull()
    })

    it('should handle empty response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: { panels: [] } }),
      })

      await useAppStore.getState().renderGXML()

      expect(useAppStore.getState().geometryData).toEqual({ panels: [] })
    })

    it('should handle response without data field', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: false }),
      })

      await useAppStore.getState().renderGXML()

      expect(useAppStore.getState().error).toBe('Unknown error occurred')
    })
  })

  describe('/api/schema', () => {
    it('should load schema from endpoint', async () => {
      const mockSchema = {
        tags: {
          root: { attributes: [] },
          panel: { attributes: ['width', 'height', 'thickness'] },
        },
      }
      
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSchema),
      })

      await useAppStore.getState().loadSchema()

      expect(global.fetch).toHaveBeenCalledWith('/api/schema')
      expect(useAppStore.getState().schema).toEqual(mockSchema)
    })

    it('should handle schema load failure gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      })

      // Should not throw
      await useAppStore.getState().loadSchema()

      // Schema should remain at default
      expect(useAppStore.getState().schema).toEqual({ tags: {} })
    })

    it('should handle schema network error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      await useAppStore.getState().loadSchema()

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('complex XML scenarios', () => {
    it('should render XML with multiple panels', async () => {
      useAppStore.setState({
        xmlContent: `<root>
          <panel width="1"/>
          <panel width="2"/>
          <panel width="3"/>
        </root>`,
      })

      const mockData = {
        panels: [
          { id: '0-front', points: [] },
          { id: '0-back', points: [] },
          { id: '1-front', points: [] },
          { id: '1-back', points: [] },
          { id: '2-front', points: [] },
          { id: '2-back', points: [] },
        ],
      }
      
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: mockData }),
      })

      await useAppStore.getState().renderGXML()

      expect(useAppStore.getState().geometryData.panels).toHaveLength(6)
    })

    it('should render XML with nested elements', async () => {
      useAppStore.setState({
        xmlContent: `<root>
          <panel width="1">
            <panel width="0.5"/>
          </panel>
        </root>`,
      })

      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: { panels: [] } }),
      })

      await useAppStore.getState().renderGXML()

      // Verify fetch was called (content is JSON-encoded)
      expect(global.fetch).toHaveBeenCalled()
      const callArgs = global.fetch.mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      expect(body.xml).toContain('<panel width="0.5"/>')
    })

    it('should handle XML with special characters', async () => {
      useAppStore.setState({
        xmlContent: '<root><panel name="Test &amp; Panel"/></root>',
      })

      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: { panels: [] } }),
      })

      await useAppStore.getState().renderGXML()

      expect(global.fetch).toHaveBeenCalled()
    })

    it('should handle malformed XML', async () => {
      useAppStore.setState({
        xmlContent: '<root><panel width="1"',  // Missing closing
      })

      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          success: false,
          error: 'XML parsing error: no closing tag',
        }),
      })

      await useAppStore.getState().renderGXML()

      expect(useAppStore.getState().error).toContain('XML parsing error')
    })
  })

  describe('concurrent requests', () => {
    it('should handle rapid consecutive renders', async () => {
      let callCount = 0
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++
        return Promise.resolve({
          json: () => Promise.resolve({
            success: true,
            data: { panels: [], callNumber: callCount },
          }),
        })
      })

      // Trigger multiple renders rapidly
      const render1 = useAppStore.getState().renderGXML()
      const render2 = useAppStore.getState().renderGXML()
      const render3 = useAppStore.getState().renderGXML()

      await Promise.all([render1, render2, render3])

      // All should complete without error
      expect(global.fetch).toHaveBeenCalledTimes(3)
    })
  })
})
