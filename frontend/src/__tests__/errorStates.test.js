import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useAppStore } from '../stores/appStore'
import { useViewportStore } from '../stores/viewportStore'

/**
 * Error State Tests
 * 
 * Tests for error handling across the application:
 * - Invalid XML errors
 * - Server/network errors
 * - Malformed geometry data
 * - Error recovery
 */

describe('Error States', () => {
  let originalFetch

  beforeEach(() => {
    originalFetch = global.fetch
    
    useAppStore.setState({
      xmlContent: '<root>\n    <panel width="1"/>\n</root>',
      geometryData: null,
      error: null,
      isAutoUpdate: false,
    })
    
    useViewportStore.setState({
      selectedElementId: null,
      selectedFaceId: null,
      selectedVertexIdx: null,
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  describe('XML Parsing Errors', () => {
    it('should set error for malformed XML', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: false,
          error: 'XML parsing error: unclosed tag at line 2',
        }),
      })

      useAppStore.setState({
        xmlContent: '<root>\n    <panel width="1"\n</root>',
      })

      await useAppStore.getState().renderGXML()

      expect(useAppStore.getState().error).toBe('XML parsing error: unclosed tag at line 2')
      expect(useAppStore.getState().geometryData).toBeNull()
    })

    it('should set error for invalid element', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: false,
          error: "Unknown element 'invalid_element'",
        }),
      })

      await useAppStore.getState().renderGXML()

      expect(useAppStore.getState().error).toContain('Unknown element')
    })

    it('should set error for missing required attribute', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: false,
          error: "Missing required attribute 'width' on panel",
        }),
      })

      await useAppStore.getState().renderGXML()

      expect(useAppStore.getState().error).toContain('Missing required attribute')
    })

    it('should set error for invalid attribute value', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: false,
          error: "Invalid value 'abc' for attribute 'width' (expected number)",
        }),
      })

      await useAppStore.getState().renderGXML()

      expect(useAppStore.getState().error).toContain('Invalid value')
    })
  })

  describe('Network Errors', () => {
    it('should handle fetch failure', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'))

      await useAppStore.getState().renderGXML()

      expect(useAppStore.getState().error).toBe('Network error: Failed to fetch')
    })

    it('should handle timeout', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Request timeout'))

      await useAppStore.getState().renderGXML()

      expect(useAppStore.getState().error).toBe('Network error: Request timeout')
    })

    it('should handle connection refused', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'))

      await useAppStore.getState().renderGXML()

      expect(useAppStore.getState().error).toContain('Connection refused')
    })
  })

  describe('Server Errors', () => {
    it('should handle 500 internal server error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: false,
          error: 'Internal server error',
        }),
      })

      await useAppStore.getState().renderGXML()

      expect(useAppStore.getState().error).toBe('Internal server error')
    })

    it('should handle empty error message', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: false,
          error: '',
        }),
      })

      await useAppStore.getState().renderGXML()

      expect(useAppStore.getState().error).toBe('Unknown error occurred')
    })

    it('should handle null error message', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: false,
          error: null,
        }),
      })

      await useAppStore.getState().renderGXML()

      expect(useAppStore.getState().error).toBe('Unknown error occurred')
    })
  })

  describe('Error Recovery', () => {
    it('should clear error on successful render', async () => {
      // Start with an error
      useAppStore.setState({ error: 'Previous error' })

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { panels: [] },
        }),
      })

      await useAppStore.getState().renderGXML()

      expect(useAppStore.getState().error).toBeNull()
    })

    it('should clear error before making request', async () => {
      useAppStore.setState({ error: 'Old error' })
      
      let errorDuringRequest = null
      global.fetch = vi.fn().mockImplementation(() => {
        errorDuringRequest = useAppStore.getState().error
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: { panels: [] } }),
        })
      })

      await useAppStore.getState().renderGXML()

      expect(errorDuringRequest).toBeNull()
    })

    it('should allow retry after error', async () => {
      // First call fails
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: false, error: 'First error' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, data: { panels: [{ id: '0-front' }] } }),
        })

      await useAppStore.getState().renderGXML()
      expect(useAppStore.getState().error).toBe('First error')

      await useAppStore.getState().renderGXML()
      expect(useAppStore.getState().error).toBeNull()
      expect(useAppStore.getState().geometryData.panels).toHaveLength(1)
    })
  })

  describe('Error and Selection Interaction', () => {
    it('should preserve selection when error occurs', async () => {
      useViewportStore.setState({ selectedElementId: 1 })

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: false, error: 'Some error' }),
      })

      await useAppStore.getState().renderGXML()

      // Selection should remain (user might want to keep their place)
      expect(useViewportStore.getState().selectedElementId).toBe(1)
    })

    it('should preserve geometry data when error occurs', async () => {
      const existingData = { panels: [{ id: '0-front' }] }
      useAppStore.setState({ geometryData: existingData })

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: false, error: 'Some error' }),
      })

      await useAppStore.getState().renderGXML()

      // Geometry should remain (don't wipe viewport on error)
      expect(useAppStore.getState().geometryData).toEqual(existingData)
    })
  })

  describe('setError direct calls', () => {
    it('should set error message directly', () => {
      useAppStore.getState().setError('Custom error message')
      
      expect(useAppStore.getState().error).toBe('Custom error message')
    })

    it('should clear error with null', () => {
      useAppStore.setState({ error: 'Some error' })
      
      useAppStore.getState().setError(null)
      
      expect(useAppStore.getState().error).toBeNull()
    })
  })

  describe('Schema Loading Errors', () => {
    it('should handle schema fetch failure gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      global.fetch = vi.fn().mockRejectedValue(new Error('Schema not found'))

      await useAppStore.getState().loadSchema()

      // Should log error but not crash
      expect(consoleSpy).toHaveBeenCalledWith('Error loading schema:', expect.any(Error))
      
      consoleSpy.mockRestore()
    })
  })
})

describe('Geometry Data Validation', () => {
  beforeEach(() => {
    useAppStore.setState({
      geometryData: null,
      error: null,
    })
    useViewportStore.setState({
      selectedElementId: null,
    })
  })

  it('should handle empty panels array', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: { panels: [] },
      }),
    })

    await useAppStore.getState().renderGXML()

    expect(useAppStore.getState().geometryData.panels).toEqual([])
    expect(useAppStore.getState().error).toBeNull()
  })

  it('should handle null geometry data', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: null,
      }),
    })

    await useAppStore.getState().renderGXML()

    expect(useAppStore.getState().geometryData).toBeNull()
  })

  it('should handle missing panels property', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: {},
      }),
    })

    await useAppStore.getState().renderGXML()

    expect(useAppStore.getState().geometryData).toEqual({})
    // No error - just empty data
    expect(useAppStore.getState().error).toBeNull()
  })

  it('should handle panel with missing id', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: {
          panels: [{ points: [[0,0,0], [1,0,0]] }],
        },
      }),
    })

    await useAppStore.getState().renderGXML()

    // Should accept the data (validation happens in rendering)
    expect(useAppStore.getState().geometryData.panels).toHaveLength(1)
  })

  it('should handle panel with empty points', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: {
          panels: [{ id: '0-front', points: [] }],
        },
      }),
    })

    await useAppStore.getState().renderGXML()

    expect(useAppStore.getState().geometryData.panels[0].points).toEqual([])
  })
})
