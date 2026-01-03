import { describe, it, expect } from 'vitest'
import { parseBinaryGeometry } from '../utils/binaryGeometry'

// Create a test binary buffer matching the Python format
function createTestBuffer() {
  // Header: 'GXML' + version(1) + panelCount(1) + totalVerts(4)
  const header = new ArrayBuffer(16)
  const headerView = new DataView(header)
  
  // Magic
  headerView.setUint8(0, 'G'.charCodeAt(0))
  headerView.setUint8(1, 'X'.charCodeAt(0))
  headerView.setUint8(2, 'M'.charCodeAt(0))
  headerView.setUint8(3, 'L'.charCodeAt(0))
  
  // Version (little-endian)
  headerView.setUint32(4, 1, true)
  
  // Panel count
  headerView.setUint32(8, 1, true)
  
  // Total vertices
  headerView.setUint32(12, 4, true)
  
  // Panel header: id_len(2) + vertex_count(2) + color RGB(12) + reserved(4) = 20 bytes
  const panelHeader = new ArrayBuffer(20)
  const panelView = new DataView(panelHeader)
  
  // ID length
  panelView.setUint16(0, 6, true) // "0-test"
  
  // Vertex count
  panelView.setUint16(2, 4, true)
  
  // Color RGB
  panelView.setFloat32(4, 0.9, true)  // R
  panelView.setFloat32(8, 0.2, true)  // G
  panelView.setFloat32(12, 0.3, true) // B
  
  // Reserved (4 bytes) - already zeros
  
  // Panel ID: "0-test" (6 bytes + 2 padding)
  const idBytes = new TextEncoder().encode('0-test')
  const idBuffer = new Uint8Array(8) // padded to 4-byte alignment
  idBuffer.set(idBytes)
  
  // Vertices: 4 points * 3 floats = 12 floats = 48 bytes
  const vertices = new Float32Array([
    0, 0, 0,    // point 0
    1, 0, 0,    // point 1
    1, 1, 0,    // point 2
    0, 1, 0,    // point 3
  ])
  
  // Combine all parts
  const totalLength = header.byteLength + panelHeader.byteLength + idBuffer.byteLength + vertices.byteLength
  const combined = new ArrayBuffer(totalLength)
  const combinedView = new Uint8Array(combined)
  
  let offset = 0
  combinedView.set(new Uint8Array(header), offset)
  offset += header.byteLength
  
  combinedView.set(new Uint8Array(panelHeader), offset)
  offset += panelHeader.byteLength
  
  combinedView.set(idBuffer, offset)
  offset += idBuffer.byteLength
  
  combinedView.set(new Uint8Array(vertices.buffer), offset)
  
  return combined
}

describe('binaryGeometry', () => {
  describe('parseBinaryGeometry', () => {
    it('should parse valid binary data', () => {
      const buffer = createTestBuffer()
      const result = parseBinaryGeometry(buffer)
      
      expect(result.panels).toHaveLength(1)
      expect(result.panels[0].id).toBe('0-test')
      expect(result.panels[0].vertexCount).toBe(4)
      expect(result.panels[0].points).toHaveLength(4)
      expect(result.panels[0].points[0]).toEqual([0, 0, 0])
      expect(result.panels[0].points[1]).toEqual([1, 0, 0])
      expect(result.panels[0].colorRGB).toEqual([
        expect.closeTo(0.9, 5),
        expect.closeTo(0.2, 5),
        expect.closeTo(0.3, 5),
      ])
    })
    
    it('should reject invalid magic bytes', () => {
      const buffer = new ArrayBuffer(16)
      const view = new DataView(buffer)
      view.setUint8(0, 'B'.charCodeAt(0))
      view.setUint8(1, 'A'.charCodeAt(0))
      view.setUint8(2, 'D'.charCodeAt(0))
      view.setUint8(3, '!'.charCodeAt(0))
      
      expect(() => parseBinaryGeometry(buffer)).toThrow('Invalid magic bytes')
    })
    
    it('should expose vertexBuffer for direct Three.js usage', () => {
      const buffer = createTestBuffer()
      const result = parseBinaryGeometry(buffer)
      
      expect(result.panels[0].vertexBuffer).toBeInstanceOf(Float32Array)
      expect(result.panels[0].vertexBuffer.length).toBe(12) // 4 verts * 3 components
    })
  })
})
