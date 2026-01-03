# GXML Cross-Platform Architecture Plan

## 🎯 Goal

Build GXML to run:
1. **Native macOS** - Metal shaders, native C extensions
2. **Native Windows** - DirectX/Vulkan shaders, native C extensions  
3. **Browser (WASM)** - WebGPU shaders, C compiled to WebAssembly
4. **Electron App** - Unified desktop app for Mac/Windows with embedded runtime

## 📊 Current State

### What Exists
| Component | macOS | Windows | Browser |
|-----------|-------|---------|---------|
| C Extension (`_c_solvers.c`) | ✅ Built | ❌ | ❌ |
| C Extension (`_vec3.c`) | ✅ Built | ⚠️ Flags defined | ❌ |
| Metal Shaders | ✅ `metal_geometry.py` | N/A | N/A |
| Taichi (multi-backend) | ✅ | ✅ | ❌ |
| Web Frontend | ✅ React + Three.js | ✅ | ✅ |
| Backend API | ✅ FastAPI | ✅ | ❌ (needs server) |

### Performance Baseline (141 panel spiral)
- Python Processing: 500ms
- Network Latency: 627ms ← **Main bottleneck for web**
- Three.js Rendering: 290ms

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         GXML Cross-Platform                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │
│  │   macOS     │  │   Windows   │  │   Browser   │                │
│  │   Native    │  │   Native    │  │    WASM     │                │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                │
│         │                │                │                        │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐                │
│  │   Metal     │  │  DX12/Vulkan│  │   WebGPU    │                │
│  │   Shaders   │  │   Shaders   │  │   (WGSL)    │                │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                │
│         │                │                │                        │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐                │
│  │ C Solvers   │  │ C Solvers   │  │ WASM Solvers│                │
│  │ (.dylib)    │  │ (.dll)      │  │ (.wasm)     │                │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                │
│         │                │                │                        │
│         └────────────────┴────────────────┘                        │
│                          │                                         │
│                   ┌──────▼──────┐                                  │
│                   │  Unified    │                                  │
│                   │  Frontend   │                                  │
│                   │ React+Three │                                  │
│                   └─────────────┘                                  │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                      Electron App Wrapper                           │
│  (Native: embedded Python | Browser: pure WASM)                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📋 Implementation Plan

### Phase 1: Cross-Platform C Extensions (2-3 days)
**Goal**: Build C solvers for Mac, Windows, and WASM

#### 1.1 Unified Build System
Create `CMakeLists.txt` for cross-platform builds:

```cmake
cmake_minimum_required(VERSION 3.15)
project(gxml_solvers)

# Platform detection
if(EMSCRIPTEN)
    set(BUILD_WASM TRUE)
elseif(WIN32)
    set(BUILD_WINDOWS TRUE)
elseif(APPLE)
    set(BUILD_MACOS TRUE)
endif()

# Sources
set(SOLVER_SOURCES
    src/gxml/elements/solvers/_c_solvers.c
    src/gxml/mathutils/_vec3.c
)

if(BUILD_WASM)
    # WASM build
    add_executable(gxml_solvers ${SOLVER_SOURCES})
    set_target_properties(gxml_solvers PROPERTIES
        SUFFIX ".wasm"
        LINK_FLAGS "-s WASM=1 -s EXPORTED_FUNCTIONS='[_solve_intersections, _build_geometry]'"
    )
else()
    # Native Python extension
    find_package(Python3 REQUIRED COMPONENTS Development NumPy)
    Python3_add_library(gxml_solvers MODULE ${SOLVER_SOURCES})
    target_include_directories(gxml_solvers PRIVATE ${Python3_NumPy_INCLUDE_DIRS})
endif()
```

#### 1.2 File Structure
```
gxml/
├── CMakeLists.txt              # NEW: Cross-platform build
├── setup_c_solvers.py          # Keep for pip install
├── build/
│   ├── macos/
│   │   └── _c_solvers.cpython-312-darwin.so
│   ├── windows/
│   │   └── _c_solvers.cp312-win_amd64.pyd
│   └── wasm/
│       ├── gxml_solvers.wasm
│       └── gxml_solvers.js     # Emscripten glue
```

#### 1.3 WASM-Specific Changes
The C code needs minor modifications for WASM:
- Replace NumPy array handling with raw memory pointers
- Export functions with `EMSCRIPTEN_KEEPALIVE`
- Use typed arrays for JavaScript interop

```c
#ifdef __EMSCRIPTEN__
#include <emscripten.h>

EMSCRIPTEN_KEEPALIVE
int solve_intersections(
    float* starts,      // N*3 floats
    float* ends,        // N*3 floats  
    int num_panels,
    float* out_positions,  // Output buffer
    int* out_indices       // Output buffer
) {
    // Pure C implementation, no Python/NumPy
}
#endif
```

---

### Phase 2: Compute Shaders (3-4 days)
**Goal**: GPU acceleration on every platform

#### 2.1 Shader File Structure
```
gxml/
└── src/gxml/shaders/
    ├── intersection_solver.metal    # macOS Metal
    ├── intersection_solver.hlsl     # Windows DirectX 12
    ├── intersection_solver.wgsl     # Browser WebGPU
    └── intersection_solver.glsl     # Fallback Vulkan/OpenGL
```

#### 2.2 Metal Shader (macOS) - Already Exists!
Extend `metal_geometry.py` with compute kernels:

```metal
// intersection_solver.metal
kernel void find_intersections(
    device const float3* starts [[buffer(0)]],
    device const float3* ends [[buffer(1)]],
    device int* intersection_pairs [[buffer(2)]],
    device float* t_values [[buffer(3)]],
    device atomic_uint* count [[buffer(4)]],
    uint2 gid [[thread_position_in_grid]]
) {
    uint i = gid.x;
    uint j = gid.y;
    if (i >= j) return;  // Only check upper triangle
    
    // Line-line intersection test
    float3 p1 = starts[i], d1 = ends[i] - starts[i];
    float3 p2 = starts[j], d2 = ends[j] - starts[j];
    
    // ... intersection math ...
    
    if (intersects) {
        uint idx = atomic_fetch_add_explicit(count, 1, memory_order_relaxed);
        intersection_pairs[idx * 2] = i;
        intersection_pairs[idx * 2 + 1] = j;
        t_values[idx * 2] = t1;
        t_values[idx * 2 + 1] = t2;
    }
}
```

#### 2.3 WebGPU Shader (Browser)
```wgsl
// intersection_solver.wgsl
struct Panel {
    start: vec3f,
    end: vec3f,
}

@group(0) @binding(0) var<storage, read> panels: array<Panel>;
@group(0) @binding(1) var<storage, read_write> intersections: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> count: atomic<u32>;

@compute @workgroup_size(8, 8)
fn find_intersections(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    let j = gid.y;
    if (i >= j) { return; }
    
    let p1 = panels[i].start;
    let d1 = panels[i].end - panels[i].start;
    let p2 = panels[j].start;
    let d2 = panels[j].end - panels[j].start;
    
    // Line-line intersection...
}
```

#### 2.4 DirectX 12 HLSL (Windows)
```hlsl
// intersection_solver.hlsl
StructuredBuffer<float3> starts : register(t0);
StructuredBuffer<float3> ends : register(t1);
RWStructuredBuffer<uint2> intersection_pairs : register(u0);
RWStructuredBuffer<float2> t_values : register(u1);
RWByteAddressBuffer counter : register(u2);

[numthreads(8, 8, 1)]
void find_intersections(uint3 gid : SV_DispatchThreadID) {
    uint i = gid.x;
    uint j = gid.y;
    if (i >= j) return;
    
    float3 p1 = starts[i], d1 = ends[i] - starts[i];
    float3 p2 = starts[j], d2 = ends[j] - starts[j];
    
    // ... intersection math ...
}
```

#### 2.5 Shader Abstraction Layer
```python
# src/gxml/gpu/shader_backend.py
from abc import ABC, abstractmethod
import platform

class ShaderBackend(ABC):
    @abstractmethod
    def find_intersections(self, starts, ends) -> tuple:
        pass
    
    @abstractmethod
    def build_geometry(self, context) -> tuple:
        pass

class MetalBackend(ShaderBackend):
    """macOS Metal compute shaders"""
    pass

class DirectXBackend(ShaderBackend):
    """Windows DirectX 12 compute shaders"""
    pass

class WebGPUBackend(ShaderBackend):
    """Browser WebGPU compute shaders"""
    pass

def get_backend() -> ShaderBackend:
    system = platform.system()
    if system == 'Darwin':
        return MetalBackend()
    elif system == 'Windows':
        return DirectXBackend()
    else:
        # Fallback to CPU
        return CPUBackend()
```

---

### Phase 3: Browser WASM Integration (2-3 days)
**Goal**: Run GXML entirely in the browser

#### 3.1 JavaScript Wrapper
```javascript
// frontend/src/utils/gxmlWasm.js
class GXMLWasm {
    constructor() {
        this.module = null;
        this.gpu = null;
    }
    
    async init() {
        // Load WASM module
        this.module = await import('./gxml_solvers.js');
        await this.module.default();
        
        // Initialize WebGPU
        if (navigator.gpu) {
            this.adapter = await navigator.gpu.requestAdapter();
            this.device = await this.adapter.requestDevice();
            await this.initShaders();
        }
    }
    
    async initShaders() {
        const shaderCode = await fetch('/shaders/intersection_solver.wgsl')
            .then(r => r.text());
        
        this.intersectionPipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: this.device.createShaderModule({ code: shaderCode }),
                entryPoint: 'find_intersections'
            }
        });
    }
    
    async processXML(xmlString) {
        // 1. Parse XML (in WASM or JS)
        const panels = this.parseXML(xmlString);
        
        // 2. Run intersection solver (WebGPU if available, else WASM)
        const intersections = navigator.gpu 
            ? await this.gpuSolveIntersections(panels)
            : this.wasmSolveIntersections(panels);
        
        // 3. Build geometry (WebGPU or WASM)
        const geometry = navigator.gpu
            ? await this.gpuBuildGeometry(panels, intersections)
            : this.wasmBuildGeometry(panels, intersections);
        
        return geometry;
    }
}

export const gxmlWasm = new GXMLWasm();
```

#### 3.2 Frontend Integration
```javascript
// frontend/src/hooks/useGXML.js
import { useState, useEffect } from 'react';
import { gxmlWasm } from '../utils/gxmlWasm';

export function useGXML() {
    const [backend, setBackend] = useState('server'); // 'server' | 'wasm'
    const [wasmReady, setWasmReady] = useState(false);
    
    useEffect(() => {
        gxmlWasm.init().then(() => setWasmReady(true));
    }, []);
    
    async function processXML(xml) {
        if (backend === 'wasm' && wasmReady) {
            return gxmlWasm.processXML(xml);
        } else {
            // Fall back to server
            return fetch('/api/geometry', {
                method: 'POST',
                body: JSON.stringify({ xml })
            }).then(r => r.json());
        }
    }
    
    return { processXML, backend, setBackend, wasmReady };
}
```

---

### Phase 4: Electron App (2-3 days)
**Goal**: Native desktop app with embedded GXML runtime

#### 4.1 Electron Project Structure
```
gxml-desktop/
├── package.json
├── electron/
│   ├── main.js           # Main process
│   ├── preload.js        # Bridge to renderer
│   └── pythonBridge.js   # Python subprocess management
├── python/
│   ├── gxml_server.py    # Embedded FastAPI server
│   └── requirements.txt
├── frontend/             # Symlink to gxml-web/frontend
└── resources/
    ├── gxml-macos/       # Bundled Python + GXML for Mac
    └── gxml-windows/     # Bundled Python + GXML for Windows
```

#### 4.2 Main Process
```javascript
// electron/main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let pythonProcess = null;
let mainWindow = null;

function startPythonServer() {
    const pythonPath = process.platform === 'darwin'
        ? path.join(__dirname, '../resources/gxml-macos/bin/python')
        : path.join(__dirname, '../resources/gxml-windows/python.exe');
    
    pythonProcess = spawn(pythonPath, [
        '-m', 'uvicorn',
        'gxml_web.app:app',
        '--host', '127.0.0.1',
        '--port', '8765'
    ], {
        cwd: path.join(__dirname, '../python')
    });
    
    pythonProcess.stdout.on('data', (data) => {
        console.log(`Python: ${data}`);
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true
        }
    });
    
    // Load frontend
    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:5173');
    } else {
        mainWindow.loadFile('frontend/dist/index.html');
    }
}

app.whenReady().then(() => {
    startPythonServer();
    
    // Wait for server to start
    setTimeout(createWindow, 2000);
});

app.on('window-all-closed', () => {
    if (pythonProcess) pythonProcess.kill();
    app.quit();
});
```

#### 4.3 Package.json
```json
{
  "name": "gxml-desktop",
  "version": "1.0.0",
  "main": "electron/main.js",
  "scripts": {
    "start": "electron .",
    "build:mac": "electron-builder --mac",
    "build:win": "electron-builder --win",
    "build:all": "electron-builder --mac --win"
  },
  "build": {
    "appId": "com.gxml.desktop",
    "productName": "GXML",
    "mac": {
      "target": ["dmg", "zip"],
      "icon": "resources/icon.icns",
      "extraResources": ["resources/gxml-macos/**"]
    },
    "win": {
      "target": ["nsis", "portable"],
      "icon": "resources/icon.ico",
      "extraResources": ["resources/gxml-windows/**"]
    }
  },
  "devDependencies": {
    "electron": "^28.0.0",
    "electron-builder": "^24.0.0"
  }
}
```

#### 4.4 Bundling Python Runtime
```bash
# Mac: Create standalone Python with GXML
python -m venv resources/gxml-macos
source resources/gxml-macos/bin/activate
pip install ../gxml ../gxml-web numpy

# Windows: Use pyinstaller or embedded Python
# Download python-3.12-embed-amd64.zip
# Extract to resources/gxml-windows/
# pip install into resources/gxml-windows/Lib/site-packages/
```

---

### Phase 5: CI/CD Build Pipeline (1-2 days)
**Goal**: Automated builds for all platforms

#### 5.1 GitHub Actions Workflow
```yaml
# .github/workflows/build.yml
name: Cross-Platform Build

on:
  push:
    branches: [main]
  release:
    types: [created]

jobs:
  build-c-extensions:
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
        python: ['3.11', '3.12']
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: ${{ matrix.python }}
      - run: pip install numpy setuptools
      - run: python setup_c_solvers.py build_ext --inplace
      - uses: actions/upload-artifact@v4
        with:
          name: c-solvers-${{ matrix.os }}-py${{ matrix.python }}
          path: src/gxml/**/*.so src/gxml/**/*.pyd

  build-wasm:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: mymindstorm/setup-emsdk@v12
      - run: emcc src/gxml/elements/solvers/_c_solvers.c -O3 -o build/wasm/gxml_solvers.js -s WASM=1 -s EXPORTED_FUNCTIONS="['_solve_intersections']"
      - uses: actions/upload-artifact@v4
        with:
          name: wasm-build
          path: build/wasm/

  build-electron:
    needs: [build-c-extensions, build-wasm]
    strategy:
      matrix:
        os: [macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install
        working-directory: gxml-desktop
      - run: npm run build:${{ matrix.os == 'macos-latest' && 'mac' || 'win' }}
        working-directory: gxml-desktop
      - uses: actions/upload-artifact@v4
        with:
          name: electron-${{ matrix.os }}
          path: gxml-desktop/dist/
```

---

## 📁 Final Project Structure

```
gxml/
├── CMakeLists.txt                    # Cross-platform build
├── setup_c_solvers.py                # Python extension build
├── src/gxml/
│   ├── elements/solvers/
│   │   ├── _c_solvers.c              # Core C solvers
│   │   ├── _c_solvers_wasm.c         # WASM-specific wrapper
│   │   └── ...
│   ├── gpu/
│   │   ├── shader_backend.py         # Abstraction layer
│   │   ├── metal_backend.py          # macOS Metal
│   │   ├── dx12_backend.py           # Windows DirectX 12
│   │   └── webgpu_backend.py         # Browser WebGPU
│   └── shaders/
│       ├── intersection_solver.metal
│       ├── intersection_solver.hlsl
│       ├── intersection_solver.wgsl
│       └── geometry_builder.wgsl
├── build/
│   ├── macos/
│   ├── windows/
│   └── wasm/

gxml-web/
├── frontend/
│   └── src/
│       └── utils/
│           ├── gxmlWasm.js           # WASM integration
│           └── webgpuShaders.js      # WebGPU wrapper

gxml-desktop/                          # NEW: Electron app
├── package.json
├── electron/
│   ├── main.js
│   └── preload.js
├── python/
└── resources/
```

---

## ⏱️ Timeline Summary

| Phase | Task | Effort |
|-------|------|--------|
| 1 | Cross-Platform C Extensions | 2-3 days |
| 2 | Compute Shaders (Metal/DX12/WebGPU) | 3-4 days |
| 3 | Browser WASM Integration | 2-3 days |
| 4 | Electron Desktop App | 2-3 days |
| 5 | CI/CD Pipeline | 1-2 days |
| **Total** | | **10-15 days** |

---

## 🚀 Quick Start: What to Build First

**Recommended order for maximum value:**

1. **Phase 4 (Electron)** - Get local native app working NOW
   - Embeds existing Python backend
   - Zero network latency immediately
   - Effort: 2-3 days

2. **Phase 1 (Windows C Extensions)** - Expand user base
   - Windows users can run natively
   - Same C code, different compiler flags
   - Effort: 1 day

3. **Phase 3 (WASM)** - Browser without server
   - True offline web app
   - No Python server needed
   - Effort: 2-3 days

4. **Phase 2 (Shaders)** - Performance boost
   - GPU acceleration on all platforms
   - Biggest impact for complex layouts
   - Effort: 3-4 days

---

## 🎬 Ready to Start?

I recommend starting with **Phase 4 (Electron)** since it gives you the fastest path to local execution with zero network latency. Want me to create the Electron app scaffolding now?
