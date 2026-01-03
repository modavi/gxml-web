# Options for Running Full GXML in Browser

## Background

The performance HUD revealed that network latency (~627ms) is a major bottleneck, larger than the Python processing time (~500ms). Pyodide (Python in WebAssembly) was attempted but cannot run C extensions or GPU code.

## Current Performance (141 panel spiral)

- Server Python: 500ms (Parse 12ms, Layout 440ms, Render 28ms, Serialize 21ms)
- Network Fetch: 627ms ← BIGGEST BOTTLENECK
- Three.js: 290ms
- End-to-End: ~1670ms

## Options

### 1. WebSocket Streaming (Recommended - Easy)
Instead of HTTP request/response, keep a persistent WebSocket connection:
- Eliminates connection overhead (~100-200ms per request)
- Can stream incremental updates as user types
- Server still handles C extensions + GPU
- **Effort: 1-2 hours**

### 2. Service Worker Caching (Easy)
Cache geometry results for identical XML inputs:
- Instant response for repeated queries
- Good for demos/tutorials with known content
- **Effort: 1 hour**

### 3. Edge Deployment (Medium)
Deploy backend closer to users:
- Cloudflare Workers, Vercel Edge Functions, AWS Lambda@Edge
- Reduces network latency to <50ms globally
- C extensions need special handling (Docker containers on Fly.io, Railway, etc.)
- **Effort: Half day to set up**

### 4. WebGPU Compute (Hard - Future)
Rewrite solvers in WGSL (WebGPU shader language):
- True browser-native GPU acceleration
- No server needed at all
- Major rewrite of intersection/geometry solvers
- WebGPU still not universally supported
- **Effort: Weeks**

### 5. Compile C to WASM (Medium-Hard)
Use Emscripten to compile C solvers to WebAssembly:
- Runs in browser at near-native speed
- No GPU acceleration, but C solvers are already fast
- Requires recompiling all C code with Emscripten
- Would need to port numpy dependencies or use numpy.js
- **Effort: Several days**

### 6. Hybrid Approach
Combine multiple strategies:
- WebSocket for low latency connection
- Service Worker for caching
- Edge deployment for global performance
- **Effort: 1-2 days total**

## Recommendation

Start with **WebSocket streaming** - it's the biggest win for minimal effort. The current HTTP request/response pattern has inherent overhead that WebSockets eliminate.

## Files Modified in This Session

### Added Performance HUD
- `frontend/src/components/PerfStatsHUD.jsx` - HUD overlay component
- `frontend/src/components/PerfStatsHUD.css` - HUD styling
- `frontend/src/stores/viewportStore.js` - Added showPerfStats setting

### Backend Timing Instrumentation
- `src/gxml_web/app.py` - Added granular timing headers (parse, measure, prelayout, layout, postlayout, render, serialize)

### Frontend Timing
- `frontend/src/utils/binaryGeometry.js` - Parse timing headers from response
- `frontend/src/hooks/useThreeScene.js` - Track Three.js mesh creation timing
- `frontend/src/stores/appStore.js` - Store threeJsTimings

### Options Panel
- `frontend/src/components/OptionsPanel.jsx` - Added "Show Performance Stats" toggle

## Removed (Pyodide)
- `frontend/src/utils/pyodideEngine.js` - Deleted (couldn't run C extensions/GPU)
