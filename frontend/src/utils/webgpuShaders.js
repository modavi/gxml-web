/**
 * WebGPU Compute Shaders for GXML
 * 
 * Provides GPU-accelerated intersection solving and geometry building
 * directly in the browser using WebGPU compute shaders.
 * 
 * Usage:
 *   import { GXMLWebGPU } from './webgpuShaders';
 *   
 *   const gpu = new GXMLWebGPU();
 *   await gpu.init();
 *   
 *   const intersections = await gpu.findIntersections(panels);
 */

// WGSL Shader source (embedded for single-file deployment)
const INTERSECTION_SHADER = `
// Panel data structure
struct Panel {
    start: vec3f,
    _pad0: f32,
    end: vec3f,
    _pad1: f32,
}

struct IntersectionResult {
    panel_i: u32,
    panel_j: u32,
    t_i: f32,
    t_j: f32,
    position: vec3f,
    valid: u32,
}

struct Uniforms {
    num_panels: u32,
    tolerance: f32,
    _pad: vec2f,
}

@group(0) @binding(0) var<storage, read> panels: array<Panel>;
@group(0) @binding(1) var<storage, read_write> results: array<IntersectionResult>;
@group(0) @binding(2) var<storage, read_write> result_count: atomic<u32>;
@group(0) @binding(3) var<uniform> uniforms: Uniforms;

fn vec3_cross(a: vec3f, b: vec3f) -> vec3f {
    return vec3f(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x
    );
}

@compute @workgroup_size(8, 8, 1)
fn find_intersections(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    let j = gid.y;
    
    if (i >= j || j >= uniforms.num_panels) {
        return;
    }
    
    let panel_i = panels[i];
    let panel_j = panels[j];
    
    let p1 = panel_i.start;
    let p2 = panel_i.end;
    let p3 = panel_j.start;
    let p4 = panel_j.end;
    
    let d1 = p2 - p1;
    let d2 = p4 - p3;
    let w = p3 - p1;
    
    let cross_d = vec3_cross(d1, d2);
    let denom = dot(cross_d, cross_d);
    
    let tol = uniforms.tolerance;
    let tol_sq = tol * tol;
    
    if (denom < tol_sq) {
        return;
    }
    
    let wcd2 = vec3_cross(w, d2);
    let t1 = dot(wcd2, cross_d) / denom;
    if (t1 < -tol || t1 > 1.0 + tol) {
        return;
    }
    
    let wcd1 = vec3_cross(w, d1);
    let t2 = dot(wcd1, cross_d) / denom;
    if (t2 < -tol || t2 > 1.0 + tol) {
        return;
    }
    
    let i1 = mix(p1, p2, t1);
    let i2 = mix(p3, p4, t2);
    let diff = i1 - i2;
    if (dot(diff, diff) >= tol_sq) {
        return;
    }
    
    let idx = atomicAdd(&result_count, 1u);
    
    results[idx].panel_i = i;
    results[idx].panel_j = j;
    results[idx].t_i = t1;
    results[idx].t_j = t2;
    results[idx].position = i1;
    results[idx].valid = 1u;
}
`;

const TRANSFORM_SHADER = `
struct TransformInput {
    matrix: mat4x4f,
    point: vec4f,
}

@group(0) @binding(0) var<storage, read> inputs: array<TransformInput>;
@group(0) @binding(1) var<storage, read_write> outputs: array<vec4f>;

@compute @workgroup_size(64, 1, 1)
fn transform_points(@builtin(global_invocation_id) gid: vec3u) {
    let idx = gid.x;
    let input = inputs[idx];
    outputs[idx] = input.matrix * input.point;
}
`;

/**
 * Check if WebGPU is available in this browser
 */
export function isWebGPUAvailable() {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

/**
 * WebGPU-accelerated GXML solver
 */
export class GXMLWebGPU {
  constructor() {
    this.device = null;
    this.adapter = null;
    this.intersectionPipeline = null;
    this.transformPipeline = null;
    this.initialized = false;
  }

  /**
   * Initialize WebGPU device and compile shaders
   */
  async init() {
    if (this.initialized) return true;
    
    if (!isWebGPUAvailable()) {
      console.warn('WebGPU is not available in this browser');
      return false;
    }

    try {
      // Request adapter with high performance preference
      this.adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance'
      });
      
      if (!this.adapter) {
        console.warn('No WebGPU adapter found');
        return false;
      }

      // Request device
      this.device = await this.adapter.requestDevice({
        requiredLimits: {
          maxStorageBufferBindingSize: 128 * 1024 * 1024, // 128MB
          maxBufferSize: 256 * 1024 * 1024, // 256MB
        }
      });

      // Compile intersection shader
      const intersectionModule = this.device.createShaderModule({
        code: INTERSECTION_SHADER,
        label: 'GXML Intersection Shader'
      });

      this.intersectionPipeline = this.device.createComputePipeline({
        layout: 'auto',
        compute: {
          module: intersectionModule,
          entryPoint: 'find_intersections'
        },
        label: 'GXML Intersection Pipeline'
      });

      // Compile transform shader
      const transformModule = this.device.createShaderModule({
        code: TRANSFORM_SHADER,
        label: 'GXML Transform Shader'
      });

      this.transformPipeline = this.device.createComputePipeline({
        layout: 'auto',
        compute: {
          module: transformModule,
          entryPoint: 'transform_points'
        },
        label: 'GXML Transform Pipeline'
      });

      this.initialized = true;
      console.log('WebGPU initialized successfully');
      console.log(`Adapter: ${this.adapter.info?.device || 'Unknown'}`);
      
      return true;
    } catch (error) {
      console.error('WebGPU initialization failed:', error);
      return false;
    }
  }

  /**
   * Find intersections between panel centerlines using GPU
   * 
   * @param {Array} panels - Array of {start: [x,y,z], end: [x,y,z]}
   * @param {number} tolerance - Intersection tolerance (default 1e-6)
   * @returns {Promise<Array>} Array of intersection results
   */
  async findIntersections(panels, tolerance = 1e-6) {
    if (!this.initialized) {
      throw new Error('WebGPU not initialized. Call init() first.');
    }

    const numPanels = panels.length;
    if (numPanels < 2) return [];

    const maxIntersections = (numPanels * (numPanels - 1)) / 2;
    
    // Create panel data buffer (32 bytes per panel: 2x vec3f + 2x padding)
    const panelData = new Float32Array(numPanels * 8);
    for (let i = 0; i < numPanels; i++) {
      const p = panels[i];
      const offset = i * 8;
      panelData[offset + 0] = p.start[0];
      panelData[offset + 1] = p.start[1];
      panelData[offset + 2] = p.start[2];
      panelData[offset + 3] = 0; // padding
      panelData[offset + 4] = p.end[0];
      panelData[offset + 5] = p.end[1];
      panelData[offset + 6] = p.end[2];
      panelData[offset + 7] = 0; // padding
    }

    // Create GPU buffers
    const panelBuffer = this.device.createBuffer({
      size: panelData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      label: 'Panel Buffer'
    });
    this.device.queue.writeBuffer(panelBuffer, 0, panelData);

    // Results buffer (32 bytes per result)
    const resultBufferSize = maxIntersections * 32;
    const resultBuffer = this.device.createBuffer({
      size: resultBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      label: 'Result Buffer'
    });

    // Counter buffer (atomic u32)
    const counterBuffer = this.device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      label: 'Counter Buffer'
    });
    this.device.queue.writeBuffer(counterBuffer, 0, new Uint32Array([0]));

    // Uniforms buffer
    const uniformData = new ArrayBuffer(16);
    new Uint32Array(uniformData, 0, 1)[0] = numPanels;
    new Float32Array(uniformData, 4, 1)[0] = tolerance;
    
    const uniformBuffer = this.device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'Uniform Buffer'
    });
    this.device.queue.writeBuffer(uniformBuffer, 0, new Uint8Array(uniformData));

    // Create bind group
    const bindGroup = this.device.createBindGroup({
      layout: this.intersectionPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: panelBuffer } },
        { binding: 1, resource: { buffer: resultBuffer } },
        { binding: 2, resource: { buffer: counterBuffer } },
        { binding: 3, resource: { buffer: uniformBuffer } },
      ],
      label: 'Intersection Bind Group'
    });

    // Create staging buffers for readback
    const counterStagingBuffer = this.device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      label: 'Counter Staging Buffer'
    });

    // Dispatch compute
    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(this.intersectionPipeline);
    passEncoder.setBindGroup(0, bindGroup);
    
    // Dispatch enough workgroups to cover all pairs
    const workgroupsX = Math.ceil(numPanels / 8);
    const workgroupsY = Math.ceil(numPanels / 8);
    passEncoder.dispatchWorkgroups(workgroupsX, workgroupsY, 1);
    passEncoder.end();

    // Copy counter to staging
    commandEncoder.copyBufferToBuffer(counterBuffer, 0, counterStagingBuffer, 0, 4);
    
    this.device.queue.submit([commandEncoder.finish()]);

    // Read back counter
    await counterStagingBuffer.mapAsync(GPUMapMode.READ);
    const counterData = new Uint32Array(counterStagingBuffer.getMappedRange());
    const numIntersections = counterData[0];
    counterStagingBuffer.unmap();

    if (numIntersections === 0) {
      // Clean up
      panelBuffer.destroy();
      resultBuffer.destroy();
      counterBuffer.destroy();
      uniformBuffer.destroy();
      counterStagingBuffer.destroy();
      return [];
    }

    // Read back results
    const resultStagingBuffer = this.device.createBuffer({
      size: numIntersections * 32,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      label: 'Result Staging Buffer'
    });

    const readEncoder = this.device.createCommandEncoder();
    readEncoder.copyBufferToBuffer(resultBuffer, 0, resultStagingBuffer, 0, numIntersections * 32);
    this.device.queue.submit([readEncoder.finish()]);

    await resultStagingBuffer.mapAsync(GPUMapMode.READ);
    const resultData = new Uint32Array(resultStagingBuffer.getMappedRange());
    
    // Parse results
    const intersections = [];
    for (let i = 0; i < numIntersections; i++) {
      const offset = i * 8; // 8 u32s per result
      const floatView = new Float32Array(resultData.buffer, resultData.byteOffset + i * 32, 8);
      
      intersections.push({
        panelI: resultData[offset + 0],
        panelJ: resultData[offset + 1],
        tI: floatView[2],
        tJ: floatView[3],
        position: [floatView[4], floatView[5], floatView[6]],
        valid: resultData[offset + 7]
      });
    }
    
    resultStagingBuffer.unmap();

    // Clean up
    panelBuffer.destroy();
    resultBuffer.destroy();
    counterBuffer.destroy();
    uniformBuffer.destroy();
    counterStagingBuffer.destroy();
    resultStagingBuffer.destroy();

    return intersections;
  }

  /**
   * Batch transform points by matrices using GPU
   * 
   * @param {Array} transforms - Array of {matrix: Float32Array(16), point: [x,y,z,w]}
   * @returns {Promise<Float32Array>} Transformed points (N x 4)
   */
  async transformPoints(transforms) {
    if (!this.initialized) {
      throw new Error('WebGPU not initialized. Call init() first.');
    }

    const numTransforms = transforms.length;
    if (numTransforms === 0) return new Float32Array(0);

    // Create input buffer (80 bytes per transform: mat4x4 + vec4)
    const inputData = new Float32Array(numTransforms * 20);
    for (let i = 0; i < numTransforms; i++) {
      const t = transforms[i];
      const offset = i * 20;
      
      // Copy matrix (16 floats)
      for (let j = 0; j < 16; j++) {
        inputData[offset + j] = t.matrix[j];
      }
      
      // Copy point (4 floats)
      inputData[offset + 16] = t.point[0];
      inputData[offset + 17] = t.point[1];
      inputData[offset + 18] = t.point[2];
      inputData[offset + 19] = t.point[3] ?? 1.0;
    }

    const inputBuffer = this.device.createBuffer({
      size: inputData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      label: 'Transform Input Buffer'
    });
    this.device.queue.writeBuffer(inputBuffer, 0, inputData);

    const outputBuffer = this.device.createBuffer({
      size: numTransforms * 16, // vec4 per output
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      label: 'Transform Output Buffer'
    });

    const bindGroup = this.device.createBindGroup({
      layout: this.transformPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: inputBuffer } },
        { binding: 1, resource: { buffer: outputBuffer } },
      ],
      label: 'Transform Bind Group'
    });

    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(this.transformPipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(Math.ceil(numTransforms / 64), 1, 1);
    passEncoder.end();

    const stagingBuffer = this.device.createBuffer({
      size: numTransforms * 16,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      label: 'Transform Staging Buffer'
    });

    commandEncoder.copyBufferToBuffer(outputBuffer, 0, stagingBuffer, 0, numTransforms * 16);
    this.device.queue.submit([commandEncoder.finish()]);

    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const resultData = new Float32Array(stagingBuffer.getMappedRange().slice(0));
    stagingBuffer.unmap();

    inputBuffer.destroy();
    outputBuffer.destroy();
    stagingBuffer.destroy();

    return resultData;
  }

  /**
   * Clean up GPU resources
   */
  destroy() {
    // WebGPU handles cleanup automatically, but we can clear references
    this.device = null;
    this.adapter = null;
    this.intersectionPipeline = null;
    this.transformPipeline = null;
    this.initialized = false;
  }
}

// Singleton instance
let gpuInstance = null;

/**
 * Get the shared WebGPU instance
 */
export async function getWebGPU() {
  if (!gpuInstance) {
    gpuInstance = new GXMLWebGPU();
    await gpuInstance.init();
  }
  return gpuInstance;
}

export default GXMLWebGPU;
