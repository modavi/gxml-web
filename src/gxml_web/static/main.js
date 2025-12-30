/**
 * GXML Web Viewer - Main Application
 */

// ============================================================================
// Global State
// ============================================================================

let editor;
let scene, camera, renderer, controls, labelRenderer;
let geometryGroup;
let labelGroup; // Group for face labels
let vertexGroup; // Group for vertex markers
let viewMode = 'lit'; // 'lit', 'unlit', 'wireframe'
let colorMode = 'random'; // 'random', 'uniform'
let showFaceLabels = false;
let hideOccludedLabels = true;
let showVertices = false;
let hoveredVertex = null;
let isAutoUpdate = false;
let autoUpdateTimeout = null;
let currentGeoData = null; // Store geometry data for spreadsheet
let geoTabMode = 'points'; // 'points' or 'faces'
const AUTO_UPDATE_DELAY = 500; // ms to wait after typing stops

// Default GXML example - simple panels that the system can render
const DEFAULT_GXML = `<root>
    <panel thickness="0.25"/>
</root>`;

// GXML Schema for autocomplete (loaded from XSD via API)
let GXML_SCHEMA = { tags: {} };

// ============================================================================
// Schema Loading
// ============================================================================

async function loadSchema() {
    try {
        const response = await fetch('/api/schema');
        if (response.ok) {
            GXML_SCHEMA = await response.json();
            console.log('Loaded GXML schema from XSD:', Object.keys(GXML_SCHEMA.tags));
        } else {
            console.error('Failed to load schema:', response.statusText);
        }
    } catch (error) {
        console.error('Error loading schema:', error);
    }
}

// ============================================================================
// Monaco Editor Setup
// ============================================================================

function initEditor() {
    return new Promise((resolve) => {
        require.config({ 
            paths: { 
                'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' 
            }
        });

        require(['vs/editor/editor.main'], function() {
            // Register GXML completion provider
            monaco.languages.registerCompletionItemProvider('xml', {
                triggerCharacters: ['<', ' ', '"', '='],
                provideCompletionItems: (model, position) => {
                    const textUntilPosition = model.getValueInRange({
                        startLineNumber: 1,
                        startColumn: 1,
                        endLineNumber: position.lineNumber,
                        endColumn: position.column
                    });
                    
                    const suggestions = [];
                    const word = model.getWordUntilPosition(position);
                    const range = {
                        startLineNumber: position.lineNumber,
                        endLineNumber: position.lineNumber,
                        startColumn: word.startColumn,
                        endColumn: word.endColumn
                    };

                    // Check if we're inside a tag (for attributes)
                    const lineText = model.getLineContent(position.lineNumber);
                    const textBeforeCursor = lineText.substring(0, position.column - 1);
                    
                    // Check if we're typing an attribute value (after ="  or =')
                    const attrValueMatch = textBeforeCursor.match(/(\w+(?:-\w+)*)=["']$/);
                    if (attrValueMatch) {
                        const attrName = attrValueMatch[1];
                        // Find which tag we're in
                        const tagMatch = textBeforeCursor.match(/<(\w+)(?:\s+[^>]*)?$/);
                        if (tagMatch) {
                            const tagName = tagMatch[1].toLowerCase();
                            const tagSchema = GXML_SCHEMA.tags[tagName];
                            if (tagSchema && tagSchema.attributes[attrName]) {
                                const attrDef = tagSchema.attributes[attrName];
                                if (attrDef.values) {
                                    attrDef.values.forEach(value => {
                                        suggestions.push({
                                            label: value,
                                            kind: monaco.languages.CompletionItemKind.Value,
                                            insertText: value,
                                            range: range,
                                            detail: attrDef.description || `Value for ${attrName}`
                                        });
                                    });
                                }
                            }
                        }
                        return { suggestions };
                    }
                    
                    // Check if we're in a tag definition (for attributes)
                    const tagMatch = textBeforeCursor.match(/<(\w+)(?:\s+[^>]*)?$/);
                    if (tagMatch && !textBeforeCursor.endsWith('<')) {
                        const tagName = tagMatch[1].toLowerCase();
                        const tagSchema = GXML_SCHEMA.tags[tagName];
                        if (tagSchema && tagSchema.attributes) {
                            // Get existing attributes in this tag to avoid duplicates
                            const existingAttrs = textBeforeCursor.match(/(\w+(?:-\w+)*)=/g) || [];
                            const existingAttrNames = existingAttrs.map(a => a.replace('=', ''));
                            
                            Object.entries(tagSchema.attributes).forEach(([attrName, attrDef]) => {
                                if (!existingAttrNames.includes(attrName)) {
                                    suggestions.push({
                                        label: attrName,
                                        kind: monaco.languages.CompletionItemKind.Property,
                                        insertText: `${attrName}="$1"`,
                                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                        range: range,
                                        detail: attrDef.type || 'attribute',
                                        documentation: attrDef.description || `Attribute for <${tagName}>`
                                    });
                                }
                            });
                        }
                        return { suggestions };
                    }
                    
                    // Check if we just typed '<' (for tag names)
                    if (textBeforeCursor.endsWith('<')) {
                        // Find parent context to determine valid child elements
                        const parentTag = findParentTag(textUntilPosition);
                        
                        // Check if there's a '>' after the cursor that we should replace
                        const textAfterCursor = lineText.substring(position.column - 1);
                        const hasClosingBracket = textAfterCursor.startsWith('>');
                        
                        // Adjust range to include the '>' if present
                        const insertRange = hasClosingBracket ? {
                            startLineNumber: position.lineNumber,
                            endLineNumber: position.lineNumber,
                            startColumn: word.startColumn,
                            endColumn: position.column + 1
                        } : range;
                        
                        Object.entries(GXML_SCHEMA.tags).forEach(([tagName, tagSchema]) => {
                            // Check if this tag is valid in the current context
                            let isValidChild = true;
                            if (parentTag && GXML_SCHEMA.tags[parentTag]) {
                                const parentSchema = GXML_SCHEMA.tags[parentTag];
                                isValidChild = parentSchema.children.includes(tagName) || parentSchema.children.includes('*');
                            }
                            
                            if (isValidChild) {
                                const attrNames = Object.keys(tagSchema.attributes || {}).join(', ');
                                suggestions.push({
                                    label: tagName,
                                    kind: monaco.languages.CompletionItemKind.Class,
                                    insertText: `${tagName} $1/>`,
                                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                    range: insertRange,
                                    detail: 'GXML element',
                                    documentation: tagSchema.description + (attrNames ? `\n\nAttributes: ${attrNames}` : '')
                                });
                                // Also offer full tag with closing
                                if (tagSchema.children && tagSchema.children.length > 0) {
                                    suggestions.push({
                                        label: `${tagName}...`,
                                        kind: monaco.languages.CompletionItemKind.Class,
                                        insertText: `${tagName}>\n\t$1\n</${tagName}>`,
                                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                        range: insertRange,
                                        detail: 'GXML element with children',
                                        documentation: tagSchema.description
                                    });
                                }
                            }
                        });
                        return { suggestions };
                    }
                    
                    return { suggestions };
                }
            });
            
            // Helper to find the parent tag at current position
            function findParentTag(text) {
                // Simple stack-based parser to find unclosed parent tag
                const tagStack = [];
                const tagRegex = /<\/?(\w+)[^>]*\/?>/g;
                let match;
                
                while ((match = tagRegex.exec(text)) !== null) {
                    const fullMatch = match[0];
                    const tagName = match[1].toLowerCase();
                    
                    if (fullMatch.startsWith('</')) {
                        // Closing tag
                        if (tagStack.length > 0 && tagStack[tagStack.length - 1] === tagName) {
                            tagStack.pop();
                        }
                    } else if (!fullMatch.endsWith('/>')) {
                        // Opening tag (not self-closing)
                        tagStack.push(tagName);
                    }
                }
                
                return tagStack.length > 0 ? tagStack[tagStack.length - 1] : null;
            }

            // Create editor
            editor = monaco.editor.create(document.getElementById('editor-container'), {
                value: DEFAULT_GXML,
                language: 'xml',
                theme: 'vs-dark',
                automaticLayout: true,
                minimap: { enabled: false },
                fontSize: 14,
                fontFamily: "'Fira Code', 'Consolas', monospace",
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                tabSize: 4,
                insertSpaces: true,
                formatOnPaste: true,
                formatOnType: true,
                autoClosingBrackets: 'always',
                autoClosingQuotes: 'always',
                suggestOnTriggerCharacters: true,
                quickSuggestions: {
                    other: true,
                    comments: false,
                    strings: true
                }
            });

            // Ctrl+Enter to render
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
                renderGXML();
            });

            // Auto-update on content change
            editor.onDidChangeModelContent(() => {
                if (isAutoUpdate) {
                    // Debounce: clear previous timeout and set a new one
                    if (autoUpdateTimeout) {
                        clearTimeout(autoUpdateTimeout);
                    }
                    autoUpdateTimeout = setTimeout(() => {
                        renderGXML();
                    }, AUTO_UPDATE_DELAY);
                }
            });

            resolve();
        });
    });
}

// ============================================================================
// Three.js Setup
// ============================================================================

function initViewport() {
    const container = document.getElementById('viewport-container');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    
    // Camera
    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000);
    camera.position.set(3, 2, 4);
    
    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    
    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0, 0);
    
    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(500, 500, 500);
    scene.add(directionalLight);
    
    const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
    backLight.position.set(-500, -200, -500);
    scene.add(backLight);
    
    // Grid helper (5 grid spaces per unit)
    const gridHelper = new THREE.GridHelper(4, 20, 0x444444, 0x333333);
    scene.add(gridHelper);
    
    // Axes helper
    const axesHelper = new THREE.AxesHelper(0.5);
    scene.add(axesHelper);
    
    // Group for geometry
    geometryGroup = new THREE.Group();
    scene.add(geometryGroup);
    
    // Group for labels
    labelGroup = new THREE.Group();
    scene.add(labelGroup);
    
    // Group for vertex markers
    vertexGroup = new THREE.Group();
    scene.add(vertexGroup);
    
    // CSS2D Renderer for labels
    labelRenderer = new THREE.CSS2DRenderer();
    labelRenderer.setSize(width, height);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0';
    labelRenderer.domElement.style.pointerEvents = 'none';
    container.appendChild(labelRenderer.domElement);
    
    // Handle resize
    window.addEventListener('resize', onWindowResize);
    
    // Start render loop
    animate();
}

function onWindowResize() {
    const container = document.getElementById('viewport-container');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    if (labelRenderer) {
        labelRenderer.setSize(width, height);
    }
}

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let hoveredMesh = null;

// Configure raycaster to hit both sides of faces
raycaster.params.Mesh = { threshold: 0 };
raycaster.params.Line = { threshold: 0.1 };

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
    if (labelRenderer) {
        // Update label occlusion
        if (showFaceLabels && hideOccludedLabels) {
            updateLabelOcclusion();
        }
        labelRenderer.render(scene, camera);
    }
}

function updateLabelOcclusion() {
    labelGroup.children.forEach(label => {
        if (!label.element) return;
        
        // Get world position of label
        const labelPos = new THREE.Vector3();
        label.getWorldPosition(labelPos);
        
        // Direction from camera to label
        const dir = new THREE.Vector3().subVectors(labelPos, camera.position).normalize();
        const distance = camera.position.distanceTo(labelPos);
        
        // Raycast from camera toward label
        raycaster.set(camera.position, dir);
        raycaster.near = 0;
        raycaster.far = distance - 0.01;
        
        const intersects = raycaster.intersectObjects(geometryGroup.children, true);
        
        // Check if any mesh is blocking the view
        let isOccluded = false;
        for (const hit of intersects) {
            if (hit.object.isMesh && hit.distance < distance - 0.01) {
                isOccluded = true;
                break;
            }
        }
        
        if (isOccluded) {
            label.element.style.opacity = '0';
        } else {
            label.element.style.opacity = '1';
        }
    });
}

// ============================================================================
// Geometry Creation
// ============================================================================

function clearGeometry() {
    while (geometryGroup.children.length > 0) {
        const child = geometryGroup.children[0];
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) {
                child.material.forEach(m => m.dispose());
            } else {
                child.material.dispose();
            }
        }
        geometryGroup.remove(child);
    }
}

function updateViewMode() {
    geometryGroup.traverse((child) => {
        // Update fill material
        if (child.isMesh && child.userData.isFill) {
            const baseColor = child.userData.baseColor;
            
            if (viewMode === 'wireframe') {
                child.material.visible = false;
            } else if (viewMode === 'unlit') {
                child.material.dispose();
                child.material = new THREE.MeshBasicMaterial({
                    color: baseColor,
                    side: THREE.DoubleSide,
                });
            } else if (viewMode === 'xray') {
                child.material.dispose();
                child.material = new THREE.MeshBasicMaterial({
                    color: baseColor,
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 0.3,
                    depthWrite: false,
                });
            } else { // lit
                child.material.dispose();
                child.material = new THREE.MeshPhongMaterial({
                    color: baseColor,
                    flatShading: true,
                    side: THREE.DoubleSide,
                });
            }
            child.userData.baseColor = baseColor;
        }
        
        // Update edge appearance
        if (child.isLineSegments && child.userData.isEdge) {
            if (viewMode === 'wireframe') {
                child.material.color = child.userData.baseColor;
                child.material.opacity = 1.0;
                child.material.transparent = false;
            } else if (viewMode === 'xray') {
                child.material.color = child.userData.baseColor;
                child.material.opacity = 0.6;
                child.material.transparent = true;
            } else {
                child.material.color = new THREE.Color(0x000000);
                child.material.opacity = 0.5;
                child.material.transparent = true;
            }
        }
    });
}

function createPolygonMesh(panel) {
    // Extract panel data - these are quads/polygons with points
    const { points, color, id } = panel;
    
    if (!points || points.length < 3) {
        console.warn('Invalid panel points:', panel);
        return null;
    }
    
    // Create geometry from polygon points
    const geometry = new THREE.BufferGeometry();
    
    // Convert points to flat array for Three.js
    const vertices = [];
    for (const p of points) {
        vertices.push(p[0], p[1], p[2] || 0);
    }
    
    // Create triangulated faces (fan triangulation for convex polygons)
    // Add both windings so raycasting works from both sides
    const indices = [];
    for (let i = 1; i < points.length - 1; i++) {
        // Front face
        indices.push(0, i, i + 1);
        // Back face (reversed winding)
        indices.push(0, i + 1, i);
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    
    // Determine color based on color mode
    let materialColor;
    if (colorMode === 'uniform') {
        materialColor = new THREE.Color(0x888888);
    } else {
        // Random - use provided color or fallback
        materialColor = color ? new THREE.Color(color) : new THREE.Color(0x888888);
    }
    
    // Create material based on view mode
    let material;
    
    if (viewMode === 'lit') {
        material = new THREE.MeshPhongMaterial({
            color: materialColor,
            flatShading: true,
            side: THREE.DoubleSide,
        });
    } else if (viewMode === 'unlit') {
        material = new THREE.MeshBasicMaterial({
            color: materialColor,
            side: THREE.DoubleSide,
        });
    } else {
        // Wireframe - invisible fill
        material = new THREE.MeshBasicMaterial({
            visible: false,
        });
    }
    
    // Create mesh
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.isFill = true;
    mesh.userData.baseColor = materialColor;
    
    // Create edge lines (outline of quad, not triangles)
    const edgeVertices = [];
    for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        edgeVertices.push(p1[0], p1[1], p1[2] || 0);
        edgeVertices.push(p2[0], p2[1], p2[2] || 0);
    }
    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edgeVertices, 3));
    
    const edgeMaterial = new THREE.LineBasicMaterial({ 
        color: viewMode === 'wireframe' ? materialColor : 0x000000, 
        opacity: viewMode === 'wireframe' ? 1.0 : 0.5, 
        transparent: viewMode !== 'wireframe',
        linewidth: 1,
    });
    const edgeLines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    edgeLines.userData.isEdge = true;
    edgeLines.userData.baseColor = materialColor;
    mesh.add(edgeLines);
    
    return mesh;
}

function createGeometryFromData(data) {
    clearGeometry();
    
    // Store data for spreadsheet
    currentGeoData = data;
    updateGeoSpreadsheet();
    
    if (!data || !data.panels || data.panels.length === 0) {
        console.warn('No panel data in response');
        return;
    }
    
    console.log('Rendering', data.panels.length, 'panels');
    
    // Create meshes for each panel (no centering - panels are positioned as-is from GXML)
    data.panels.forEach(panel => {
        const mesh = createPolygonMesh(panel);
        if (mesh) {
            geometryGroup.add(mesh);
        }
    });
    
    // Render any lines as well
    if (data.lines && data.lines.length > 0) {
        data.lines.forEach(line => {
            if (line.points && line.points.length >= 2) {
                const lineGeom = new THREE.BufferGeometry();
                const vertices = [];
                line.points.forEach(p => {
                    vertices.push(p[0], p[1], p[2] || 0);
                });
                lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
                const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
                const lineMesh = new THREE.Line(lineGeom, lineMat);
                geometryGroup.add(lineMesh);
            }
        });
    }
    
    // Create face labels
    updateFaceLabels();
    
    // Create vertex markers
    updateVertexMarkers();
    
    controls.update();
}

function clearLabels() {
    while (labelGroup.children.length > 0) {
        const label = labelGroup.children[0];
        if (label.element) {
            label.element.remove();
        }
        labelGroup.remove(label);
    }
}

function updateFaceLabels() {
    clearLabels();
    
    if (!showFaceLabels || !currentGeoData || !currentGeoData.panels) {
        return;
    }
    
    currentGeoData.panels.forEach((panel, idx) => {
        if (!panel.points || panel.points.length < 3) return;
        
        // Calculate center of the face
        let cx = 0, cy = 0, cz = 0;
        panel.points.forEach(p => {
            cx += p[0];
            cy += p[1];
            cz += p[2] || 0;
        });
        cx /= panel.points.length;
        cy /= panel.points.length;
        cz /= panel.points.length;
        
        // Create label
        const labelDiv = document.createElement('div');
        labelDiv.className = 'face-label';
        labelDiv.textContent = panel.id || `face_${idx}`;
        
        const label = new THREE.CSS2DObject(labelDiv);
        label.position.set(cx, cy, cz);
        labelGroup.add(label);
    });
}

function clearVertices() {
    while (vertexGroup.children.length > 0) {
        const child = vertexGroup.children[0];
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
        vertexGroup.remove(child);
    }
}

function updateVertexMarkers() {
    clearVertices();
    
    if (!showVertices || !currentGeoData || !currentGeoData.panels) {
        return;
    }
    
    // Collect unique vertices with a tolerance
    const uniqueVertices = [];
    const vertexMap = new Map(); // For deduplication
    const TOLERANCE = 0.0001;
    
    function hashVertex(x, y, z) {
        const rx = Math.round(x / TOLERANCE) * TOLERANCE;
        const ry = Math.round(y / TOLERANCE) * TOLERANCE;
        const rz = Math.round(z / TOLERANCE) * TOLERANCE;
        return `${rx.toFixed(4)},${ry.toFixed(4)},${rz.toFixed(4)}`;
    }
    
    // Global vertex index
    let globalVertIdx = 0;
    
    currentGeoData.panels.forEach((panel) => {
        if (!panel.points) return;
        
        panel.points.forEach((p) => {
            const x = p[0];
            const y = p[1];
            const z = p[2] || 0;
            const hash = hashVertex(x, y, z);
            
            if (!vertexMap.has(hash)) {
                vertexMap.set(hash, globalVertIdx);
                uniqueVertices.push({ x, y, z, index: globalVertIdx });
                globalVertIdx++;
            }
        });
    });
    
    // Create spheres for each unique vertex
    const sphereGeometry = new THREE.SphereGeometry(0.02, 8, 8);
    const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    
    uniqueVertices.forEach((v) => {
        const sphere = new THREE.Mesh(sphereGeometry.clone(), sphereMaterial.clone());
        sphere.position.set(v.x, v.y, v.z);
        sphere.userData.isVertex = true;
        sphere.userData.vertexIndex = v.index;
        sphere.userData.baseColor = new THREE.Color(0x00ffff);
        vertexGroup.add(sphere);
    });
}

// ============================================================================
// API Communication
// ============================================================================

async function renderGXML() {
    const xml = editor.getValue();
    const errorDisplay = document.getElementById('error-display');
    
    // Hide previous errors
    errorDisplay.classList.remove('visible');
    errorDisplay.textContent = '';
    
    try {
        const response = await fetch('/api/render', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ xml }),
        });
        
        const result = await response.json();
        
        if (result.success) {
            createGeometryFromData(result.data);
        } else {
            showError(result.error || 'Unknown error occurred');
        }
    } catch (error) {
        showError(`Network error: ${error.message}`);
    }
}

function showError(message) {
    const errorDisplay = document.getElementById('error-display');
    errorDisplay.textContent = message;
    errorDisplay.classList.add('visible');
}

// ============================================================================
// UI Event Handlers
// ============================================================================

function initEventHandlers() {
    // Render button
    document.getElementById('render-btn').addEventListener('click', renderGXML);
    
    // Auto-update toggle
    document.getElementById('auto-update-toggle').addEventListener('change', (e) => {
        isAutoUpdate = e.target.checked;
        if (isAutoUpdate) {
            // Render immediately when enabling
            renderGXML();
        }
    });

    // Options panel toggle
    const optionsBtn = document.getElementById('options-btn');
    const optionsPanel = document.getElementById('options-panel');
    const optionsClose = document.getElementById('options-close');
    
    optionsBtn.addEventListener('click', () => {
        optionsPanel.classList.toggle('visible');
    });
    
    optionsClose.addEventListener('click', () => {
        optionsPanel.classList.remove('visible');
    });
    
    // Reset view button + keyboard shortcut
    document.getElementById('reset-view-btn').addEventListener('click', resetView);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'f' || e.key === 'F') {
            // Don't trigger if typing in editor
            if (document.activeElement.closest('#editor-container')) return;
            resetView();
        }
    });
    
    // View mode buttons
    document.querySelectorAll('[data-view-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-view-mode]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            viewMode = btn.dataset.viewMode;
            updateViewMode();
        });
    });
    
    // Color mode buttons
    document.querySelectorAll('[data-color-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-color-mode]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            colorMode = btn.dataset.colorMode;
            // Re-render to apply new colors
            renderGXML();
        });
    });
    
    // Camera inertia toggle
    document.getElementById('inertia-toggle').addEventListener('change', (e) => {
        controls.enableDamping = e.target.checked;
    });
    
    // Face labels toggle
    document.getElementById('face-labels-toggle').addEventListener('change', (e) => {
        showFaceLabels = e.target.checked;
        updateFaceLabels();
    });
    
    // Hide occluded labels toggle
    document.getElementById('hide-occluded-toggle').addEventListener('change', (e) => {
        hideOccludedLabels = e.target.checked;
        // Reset all labels to visible when unchecking
        if (!hideOccludedLabels) {
            labelGroup.children.forEach(label => {
                if (label.element) {
                    label.element.style.opacity = '1';
                }
            });
        }
    });
    
    // Show vertices toggle
    document.getElementById('show-vertices-toggle').addEventListener('change', (e) => {
        showVertices = e.target.checked;
        updateVertexMarkers();
    });
    
    // Geometry spreadsheet toggle
    const geoToggleBtn = document.getElementById('geo-toggle-btn');
    const geoSpreadsheet = document.getElementById('geo-spreadsheet');
    
    if (geoToggleBtn && geoSpreadsheet) {
        geoToggleBtn.addEventListener('click', () => {
            if (geoSpreadsheet.style.display === 'flex') {
                geoSpreadsheet.style.display = 'none';
            } else {
                geoSpreadsheet.style.display = 'flex';
            }
            // Trigger viewport resize when toggling
            setTimeout(onWindowResize, 250);
        });
    } else {
        console.error('Could not find geo-toggle-btn or geo-spreadsheet elements');
    }
    
    // Geometry spreadsheet tabs
    document.querySelectorAll('[data-geo-tab]').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('[data-geo-tab]').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            geoTabMode = tab.dataset.geoTab;
            updateGeoSpreadsheet();
        });
    });
    
    // Alt+LMB for panning (trackpad friendly)
    setupAltPan();
    
    // Resizable panes
    setupResizer();
    
    // Face picking/hovering
    setupFacePicking();
}

function setupResizer() {
    const resizer = document.getElementById('resizer');
    const editorPanel = document.querySelector('.editor-panel');
    const container = document.querySelector('.container');
    
    let isResizing = false;
    
    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizer.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        
        const containerRect = container.getBoundingClientRect();
        const newWidth = e.clientX - containerRect.left;
        const containerWidth = containerRect.width;
        
        // Clamp between min and max
        const minWidth = 200;
        const maxWidth = containerWidth - 200 - 6; // 6 for resizer width
        const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
        
        editorPanel.style.width = clampedWidth + 'px';
        
        // Trigger viewport resize
        onWindowResize();
    });
    
    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizer.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
}

function resetView() {
    camera.position.set(3, 2, 4);
    controls.target.set(0, 0, 0);
    controls.update();
}

function setupAltPan() {
    // OrbitControls attaches to renderer.domElement (the canvas)
    const canvas = renderer.domElement;
    let isPanning = false;
    let lastX = 0, lastY = 0;
    
    canvas.addEventListener('pointerdown', (e) => {
        // Alt+LMB for panning
        if (e.altKey && e.button === 0) {
            isPanning = true;
            lastX = e.clientX;
            lastY = e.clientY;
            // Disable OrbitControls completely during Alt+drag
            controls.enabled = false;
            canvas.setPointerCapture(e.pointerId);
        }
    });
    
    canvas.addEventListener('pointermove', (e) => {
        if (!isPanning) return;
        
        const deltaX = e.clientX - lastX;
        const deltaY = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        
        // Pan the camera
        const panSpeed = 0.001;
        const offset = new THREE.Vector3();
        
        // Pan horizontally
        offset.setFromMatrixColumn(camera.matrix, 0);
        offset.multiplyScalar(-deltaX * panSpeed * camera.position.length());
        controls.target.add(offset);
        camera.position.add(offset);
        
        // Pan vertically
        offset.setFromMatrixColumn(camera.matrix, 1);
        offset.multiplyScalar(deltaY * panSpeed * camera.position.length());
        controls.target.add(offset);
        camera.position.add(offset);
    });
    
    canvas.addEventListener('pointerup', (e) => {
        if (isPanning) {
            isPanning = false;
            canvas.releasePointerCapture(e.pointerId);
            // Re-enable OrbitControls
            controls.enabled = true;
        }
    });
}

function setupFacePicking() {
    const canvas = renderer.domElement;
    
    canvas.addEventListener('mousemove', (e) => {
        // Calculate mouse position in normalized device coordinates
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        
        // Update the picking ray
        raycaster.setFromCamera(mouse, camera);
        
        // First check for vertex intersections (they take priority when visible)
        let newHoveredVertex = null;
        if (showVertices) {
            const vertexIntersects = raycaster.intersectObjects(vertexGroup.children, false);
            if (vertexIntersects.length > 0) {
                newHoveredVertex = vertexIntersects[0].object;
            }
        }
        
        // Update vertex hover state
        if (hoveredVertex !== newHoveredVertex) {
            // Restore previous vertex color
            if (hoveredVertex && hoveredVertex.userData.baseColor) {
                hoveredVertex.material.color.copy(hoveredVertex.userData.baseColor);
            }
            
            // Highlight new vertex
            if (newHoveredVertex) {
                newHoveredVertex.material.color.setHex(0xffff00); // Yellow highlight
            }
            
            hoveredVertex = newHoveredVertex;
        }
        
        // Find intersections with geometry - get all meshes recursively
        const meshes = [];
        geometryGroup.traverse((child) => {
            if (child.isMesh && child.userData.isFill) {
                meshes.push(child);
            }
        });
        
        const intersects = raycaster.intersectObjects(meshes, false);
        
        // Find first mesh intersection (but only if no vertex is hovered)
        let newHovered = null;
        if (intersects.length > 0 && !newHoveredVertex) {
            newHovered = intersects[0].object;
        }
        
        // Update hover state
        if (hoveredMesh !== newHovered) {
            // Restore previous mesh color
            if (hoveredMesh && hoveredMesh.userData.baseColor) {
                hoveredMesh.material.color.copy(hoveredMesh.userData.baseColor);
                if (hoveredMesh.material.emissive) {
                    hoveredMesh.material.emissive.setHex(0x000000);
                }
            }
            
            // Highlight new mesh
            if (newHovered && newHovered.userData.baseColor) {
                const baseColor = newHovered.userData.baseColor;
                // Brighten the color
                const hsl = {};
                baseColor.getHSL(hsl);
                newHovered.material.color.setHSL(hsl.h, hsl.s, Math.min(1, hsl.l + 0.3));
                if (newHovered.material.emissive) {
                    newHovered.material.emissive.setHex(0x222222);
                }
            }
            
            hoveredMesh = newHovered;
        }
        
        // Set cursor based on what's hovered (vertex takes priority)
        canvas.style.cursor = (newHoveredVertex || newHovered) ? 'pointer' : '';
    });
    
    canvas.addEventListener('mouseleave', () => {
        // Restore hovered mesh when leaving canvas
        if (hoveredMesh && hoveredMesh.userData.baseColor) {
            hoveredMesh.material.color.copy(hoveredMesh.userData.baseColor);
            if (hoveredMesh.material.emissive) {
                hoveredMesh.material.emissive.setHex(0x000000);
            }
        }
        hoveredMesh = null;
        
        // Restore hovered vertex
        if (hoveredVertex && hoveredVertex.userData.baseColor) {
            hoveredVertex.material.color.copy(hoveredVertex.userData.baseColor);
        }
        hoveredVertex = null;
        
        canvas.style.cursor = '';
    });
}

// ============================================================================
// Geometry Spreadsheet
// ============================================================================

function updateGeoSpreadsheet() {
    const thead = document.getElementById('geo-table-head');
    const tbody = document.getElementById('geo-table-body');
    const pointCountEl = document.getElementById('geo-point-count');
    const faceCountEl = document.getElementById('geo-face-count');
    
    // Clear existing
    thead.innerHTML = '';
    tbody.innerHTML = '';
    
    if (!currentGeoData || !currentGeoData.panels || currentGeoData.panels.length === 0) {
        pointCountEl.textContent = '0 points';
        faceCountEl.textContent = '0 faces';
        return;
    }
    
    // Collect all points and faces from panels
    const allPoints = [];
    const allFaces = [];
    
    currentGeoData.panels.forEach((panel, panelIdx) => {
        if (panel.points) {
            const faceId = panel.id || `face_${panelIdx}`;
            const pointIndices = [];
            
            panel.points.forEach((p, ptIdx) => {
                const globalIdx = allPoints.length;
                pointIndices.push(globalIdx);
                allPoints.push({
                    idx: globalIdx,
                    x: p[0],
                    y: p[1],
                    z: p[2] || 0,
                    faceId: faceId
                });
            });
            
            allFaces.push({
                idx: panelIdx,
                id: faceId,
                vertices: pointIndices,
                vertexCount: pointIndices.length
            });
        }
    });
    
    // Update counts
    pointCountEl.textContent = `${allPoints.length} points`;
    faceCountEl.textContent = `${allFaces.length} faces`;
    
    if (geoTabMode === 'points') {
        // Points table
        thead.innerHTML = `
            <tr>
                <th style="width: 60px">#</th>
                <th style="width: 100px">X</th>
                <th style="width: 100px">Y</th>
                <th style="width: 100px">Z</th>
                <th>Face</th>
            </tr>
        `;
        
        allPoints.forEach(pt => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="num">${pt.idx}</td>
                <td class="num">${pt.x.toFixed(4)}</td>
                <td class="num">${pt.y.toFixed(4)}</td>
                <td class="num">${pt.z.toFixed(4)}</td>
                <td class="id">${pt.faceId}</td>
            `;
            tbody.appendChild(row);
        });
    } else {
        // Faces table
        thead.innerHTML = `
            <tr>
                <th style="width: 60px">#</th>
                <th style="width: 150px">ID</th>
                <th style="width: 80px">Vertices</th>
                <th>Point Indices</th>
            </tr>
        `;
        
        allFaces.forEach(face => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="num">${face.idx}</td>
                <td class="id">${face.id}</td>
                <td class="num">${face.vertexCount}</td>
                <td>${face.vertices.join(', ')}</td>
            `;
            tbody.appendChild(row);
        });
    }
}

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    // Load schema from XSD first (for autocomplete)
    await loadSchema();
    
    await initEditor();
    initViewport();
    initEventHandlers();
    
    // Initial render
    setTimeout(renderGXML, 500);
});
