// --- FABRIC.JS ENGINE INIT ---
// Disable object caching globally to eliminate stroke ghosting/flickering
fabric.Object.prototype.objectCaching = false;

const canvasEl = document.getElementById('c');
const containerEl = document.getElementById('canvas-container');

const canvas = new fabric.Canvas('c', {
  isDrawingMode: false,
  backgroundColor: '#121212',
  selection: true,
  fireRightClick: true,
  stopContextMenu: true,
});

// Fullscreen Resize Handler
function resizeCanvas() {
  canvas.setWidth(containerEl.clientWidth);
  canvas.setHeight(containerEl.clientHeight);
  canvas.renderAll();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Set default drawing brush
canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
canvas.freeDrawingBrush.color = '#ffffff';
canvas.freeDrawingBrush.width = 3;

// --- STATE MANAGEMENT (UNDO / REDO) ---
let stateStack = [];
let redoStack = [];
let isStateLocked = false;

function saveState() {
  if (isStateLocked) return;
  const json = JSON.stringify(canvas.toJSON());
  stateStack.push(json);
  redoStack = []; // Clear redo tree on new action
}

// Initial state snapshot
saveState();

canvas.on('object:added', saveState);
canvas.on('object:modified', saveState);
canvas.on('object:removed', saveState);

document.getElementById('btn-undo').addEventListener('click', () => {
  if (stateStack.length <= 1) return;
  isStateLocked = true;
  redoStack.push(stateStack.pop());
  const prevState = stateStack[stateStack.length - 1];
  canvas.loadFromJSON(prevState, () => {
    canvas.renderAll();
    isStateLocked = false;
  });
});

document.getElementById('btn-redo').addEventListener('click', () => {
  if (redoStack.length === 0) return;
  isStateLocked = true;
  const nextState = redoStack.pop();
  stateStack.push(nextState);
  canvas.loadFromJSON(nextState, () => {
    canvas.renderAll();
    isStateLocked = false;
  });
});

// --- TOOL SELECTION MODES ---
let currentMode = 'select'; // 'select', 'draw', 'erase-pixel', 'erase-object'

function setMode(mode) {
  currentMode = mode;
  canvas.isDrawingMode = false;
  canvas.selection = false;
  
  // Reset buttons active state
  document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));

  if (mode === 'select') {
    document.getElementById('btn-select').classList.add('active');
    canvas.selection = true;
  } else if (mode === 'draw') {
    document.getElementById('btn-draw').classList.add('active');
    canvas.isDrawingMode = true;
    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    canvas.freeDrawingBrush.color = document.getElementById('color-picker').value;
    canvas.freeDrawingBrush.width = 3;
  } else if (mode === 'erase-pixel') {
    document.getElementById('btn-erase-pixel').classList.add('active');
    canvas.isDrawingMode = true;
    // Native pixel freeform eraser using destination-out composite operation
    const eraserBrush = new fabric.PencilBrush(canvas);
    eraserBrush.width = 20;
    eraserBrush.color = 'rgba(0,0,0,1)';
    canvas.freeDrawingBrush = eraserBrush;
    canvas.freeDrawingBrush.globalCompositeOperation = 'destination-out';
  } else if (mode === 'erase-object') {
    document.getElementById('btn-erase-object').classList.add('active');
  }
}

document.getElementById('btn-select').addEventListener('click', () => setMode('select'));
document.getElementById('btn-draw').addEventListener('click', () => setMode('draw'));
document.getElementById('btn-erase-pixel').addEventListener('click', () => setMode('erase-pixel'));
document.getElementById('btn-erase-object').addEventListener('click', () => setMode('erase-object'));

// Object Eraser Click & Drag Removal
canvas.on('mouse:down', (e) => {
  if (currentMode === 'erase-object' && e.target) {
    canvas.remove(e.target);
    canvas.renderAll();
  }
});
canvas.on('mouse:move', (e) => {
  if (currentMode === 'erase-object' && e.e.buttons === 1 && e.target) {
    canvas.remove(e.target);
    canvas.renderAll();
  }
});

// --- SHAPE & TEXT INSERTION ---
document.getElementById('btn-rect').addEventListener('click', () => {
  const rect = new fabric.Rect({
    left: canvas.width / 2 - 50,
    top: canvas.height / 2 - 50,
    fill: 'transparent',
    stroke: document.getElementById('color-picker').value,
    strokeWidth: 2,
    width: 100,
    height: 100
  });
  canvas.add(rect);
  setMode('select');
});

document.getElementById('btn-circle').addEventListener('click', () => {
  const circle = new fabric.Circle({
    left: canvas.width / 2 - 40,
    top: canvas.height / 2 - 40,
    fill: 'transparent',
    stroke: document.getElementById('color-picker').value,
    strokeWidth: 2,
    radius: 40
  });
  canvas.add(circle);
  setMode('select');
});

document.getElementById('btn-text').addEventListener('click', () => {
  const text = new fabric.IText('Type here...', {
    left: canvas.width / 2 - 50,
    top: canvas.height / 2 - 10,
    fill: document.getElementById('color-picker').value,
    fontSize: 20
  });
  canvas.add(text);
  setMode('select');
});

// Color Picker Dynamic Sync
document.getElementById('color-picker').addEventListener('input', (e) => {
  const color = e.target.value;
  if (currentMode === 'draw') {
    canvas.freeDrawingBrush.color = color;
  }
  const activeObj = canvas.getActiveObject();
  if (activeObj) {
    if (activeObj.type === 'i-text') {
      activeObj.set('fill', color);
    } else {
      activeObj.set('stroke', color);
    }
    canvas.renderAll();
  }
});

// --- MULTI-TOUCH PAN & PINCH ZOOM ---
let isPanning = false;
let lastPosX = 0;
let lastPosY = 0;

canvas.on('mouse:down', (opt) => {
  const evt = opt.e;
  if (currentMode === 'select' && (!opt.target || evt.altKey)) {
    isPanning = true;
    lastPosX = evt.clientX || evt.touches?.[0]?.clientX;
    lastPosY = evt.clientY || evt.touches?.[0]?.clientY;
  }
});

canvas.on('mouse:move', (opt) => {
  if (isPanning) {
    const evt = opt.e;
    const clientX = evt.clientX || evt.touches?.[0]?.clientX;
    const clientY = evt.clientY || evt.touches?.[0]?.clientY;
    const deltaX = clientX - lastPosX;
    const deltaY = clientY - lastPosY;
    canvas.relativePan(new fabric.Point(deltaX, deltaY));
    lastPosX = clientX;
    lastPosY = clientY;
  }
});

canvas.on('mouse:up', () => { isPanning = false; });

canvas.on('mouse:wheel', (opt) => {
  const delta = opt.e.deltaY;
  let zoom = canvas.getZoom();
  zoom *= 0.999 ** delta;
  if (zoom > 20) zoom = 20;
  if (zoom < 0.01) zoom = 0.01;
  canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
  opt.e.preventDefault();
  opt.e.stopPropagation();
});

// Double Tap Canvas Focus / Zen Mode
canvas.on('mouse:dblclick', (opt) => {
  if (!opt.target) {
    document.body.classList.toggle('zen-mode');
  }
});

// --- CROPPED EXPORT & JSON SAVE ---
document.getElementById('btn-export').addEventListener('click', () => {
  const objects = canvas.getObjects();
  if (objects.length === 0) return alert('Canvas is empty!');

  // Calculate bounding box encompassing all written notes
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  objects.forEach(obj => {
    const bbox = obj.getBoundingRect();
    minX = Math.min(minX, bbox.left);
    minY = Math.min(minY, bbox.top);
    maxX = Math.max(maxX, bbox.left + bbox.width);
    maxY = Math.max(maxY, bbox.top + bbox.height);
  });

  const padding = 20;
  const dataURL = canvas.toDataURL({
    left: minX - padding,
    top: minY - padding,
    width: (maxX - minX) + (padding * 2),
    height: (maxY - minY) + (padding * 2),
    format: 'png'
  });

  const a = document.createElement('a');
  a.href = dataURL;
  a.download = 'whiteboard-note.png';
  a.click();
});

document.getElementById('btn-save').addEventListener('click', () => {
  const jsonStr = JSON.stringify(canvas.toJSON());
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'whiteboard-state.json';
  a.click();
});

// --- WORKER AI BACKEND INTEGRATION ---
const WORKER_URL = 'https://your-cloudflare-worker-url.workers.dev'; // Replace with deployed Cloudflare Worker URL

document.getElementById('ai-tool-select').addEventListener('change', async (e) => {
  const action = e.target.value;
  e.target.value = ''; // Reset dropdown selection

  if (action === 'diagram') {
    const prompt = window.prompt('Describe the diagram you want to generate:');
    if (!prompt) return;

    try {
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'diagram', prompt })
      });
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (content) {
        const text = new fabric.IText(content, { left: 100, top: 100, fill: '#ffffff', fontSize: 16 });
        canvas.add(text);
      }
    } catch (err) {
      alert('AI Request failed: ' + err.message);
    }

  } else if (action === 'vision') {
    const dataURL = canvas.toDataURL({ format: 'png' });
    try {
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'vision', image: dataURL, prompt: 'Analyze this whiteboard drawing.' })
      });
      const data = await res.json();
      const summary = data?.choices?.[0]?.message?.content;
      alert(summary || 'Analysis complete.');
    } catch (err) {
      alert('AI Vision Request failed: ' + err.message);
    }
  }
});
