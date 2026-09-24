const containerEl = document.getElementById('canvas-container');

const canvas = new fabric.Canvas('drawingCanvas', {
  isDrawingMode: true,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: null
});

let currentColor = '#ffffff';
let currentBrushSize = 3;

// Configure Freehand Brush with smoothing
canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
canvas.freeDrawingBrush.color = currentColor;
canvas.freeDrawingBrush.width = currentBrushSize;
canvas.freeDrawingBrush.decimate = 8;

let currentMode = 'draw';
let eraserType = 'stroke';
let isDragging = false;
let lastPosX = 0, lastPosY = 0;

// Dismiss AI Assistant
document.getElementById('closeAiPanel').addEventListener('click', () => {
  document.getElementById('ai-panel').classList.add('hidden');
});

// Grid Style Switcher
document.querySelectorAll('.grid-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.grid-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    
    const gridStyle = e.target.getAttribute('data-grid');
    containerEl.className = gridStyle;
  });
});

// --- UNDO / REDO ENGINE ---
const stateStack = [];
const redoStack = [];
let isStateLocked = false;

function saveState() {
  if (isStateLocked) return;
  stateStack.push(JSON.stringify(canvas));
  redoStack.length = 0;
}

canvas.on('object:added', saveState);
canvas.on('object:modified', saveState);
canvas.on('object:removed', saveState);

// Ignore accidental micro-strokes
canvas.on('path:created', (e) => {
  const path = e.path;
  if (path && (path.width < 2 && path.height < 2)) {
    canvas.remove(path);
  }
});

document.getElementById('undoBtn').addEventListener('click', () => {
  if (stateStack.length <= 1) return;
  isStateLocked = true;
  redoStack.push(stateStack.pop());
  const prevState = stateStack[stateStack.length - 1];
  canvas.loadFromJSON(prevState, () => {
    canvas.renderAll();
    isStateLocked = false;
  });
});

document.getElementById('redoBtn').addEventListener('click', () => {
  if (redoStack.length === 0) return;
  isStateLocked = true;
  const nextState = redoStack.pop();
  stateStack.push(nextState);
  canvas.loadFromJSON(nextState, () => {
    canvas.renderAll();
    isStateLocked = false;
  });
});

document.getElementById('clearBtn').addEventListener('click', () => {
  canvas.clear();
  canvas.backgroundColor = null;
  saveState();
});

saveState();

// Helper to calculate active viewport center
function getViewportCenter() {
  const vpt = canvas.viewportTransform;
  return {
    x: (canvas.width / 2 - vpt[4]) / vpt[0],
    y: (canvas.height / 2 - vpt[5]) / vpt[3]
  };
}

// Disable/enable object interactions per mode
function updateObjectsSelectableState(selectable) {
  canvas.forEachObject((obj) => {
    obj.selectable = selectable;
    obj.evented = selectable;
  });
}

// --- MODE MANAGER ---
function setMode(mode) {
  currentMode = mode;
  canvas.isDrawingMode = false;
  canvas.selection = false;
  canvas.defaultCursor = 'default';
  canvas.discardActiveObject().renderAll();

  const popover = document.getElementById('eraser-popover');
  if (mode !== 'erase') {
    popover.classList.remove('visible');
  }

  const toolBtns = ['handBtn', 'selectBtn', 'drawBtn', 'eraseBtn', 'rectBtn', 'circleBtn', 'arrowBtn', 'textBtn', 'imgUploadBtn'];
  toolBtns.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });

  if (mode === 'hand') {
    canvas.defaultCursor = 'grab';
    updateObjectsSelectableState(false);
    document.getElementById('handBtn').classList.add('active');
  } else if (mode === 'select') {
    canvas.selection = true;
    updateObjectsSelectableState(true);
    document.getElementById('selectBtn').classList.add('active');
  } else if (mode === 'draw') {
    canvas.isDrawingMode = true;
    updateObjectsSelectableState(false);
    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    canvas.freeDrawingBrush.color = currentColor;
    canvas.freeDrawingBrush.width = currentBrushSize;
    canvas.freeDrawingBrush.decimate = 8;
    document.getElementById('drawBtn').classList.add('active');
  } else if (mode === 'erase') {
    updateObjectsSelectableState(true);
    document.getElementById('eraseBtn').classList.add('active');
    popover.classList.add('visible');
    applyEraserType(eraserType);
  }
}

function applyEraserType(type) {
  eraserType = type;
  document.getElementById('strokeEraserBtn').classList.toggle('active', type === 'stroke');
  document.getElementById('freeEraserBtn').classList.toggle('active', type === 'freeform');

  if (currentMode !== 'erase') return;

  if (type === 'stroke') {
    canvas.isDrawingMode = false;
    canvas.selection = false;
    canvas.defaultCursor = 'crosshair';
  } else if (type === 'freeform') {
    // Native Fabric.js Eraser Brush for clean vector clipping
    canvas.isDrawingMode = true;
    canvas.freeDrawingBrush = new fabric.EraserBrush(canvas);
    canvas.freeDrawingBrush.width = 20;
    canvas.defaultCursor = 'cell';
  }
}

document.getElementById('handBtn').addEventListener('click', () => setMode('hand'));
document.getElementById('selectBtn').addEventListener('click', () => setMode('select'));
document.getElementById('drawBtn').addEventListener('click', () => setMode('draw'));

document.getElementById('eraseBtn').addEventListener('click', () => {
  const popover = document.getElementById('eraser-popover');
  if (currentMode === 'erase') {
    popover.classList.toggle('visible');
  } else {
    setMode('erase');
  }
});

document.getElementById('strokeEraserBtn').addEventListener('click', () => applyEraserType('stroke'));
document.getElementById('freeEraserBtn').addEventListener('click', () => applyEraserType('freeform'));

// Object Stroke Eraser
canvas.on('mouse:down', function(opt) {
  if (currentMode === 'erase' && eraserType === 'stroke' && opt.target) {
    canvas.remove(opt.target);
    canvas.renderAll();
  }
});

// Color Selection Handlers
function updateStrokeColor(color) {
  currentColor = color;
  if (currentMode === 'draw') {
    canvas.freeDrawingBrush.color = currentColor;
  }
}

document.querySelectorAll('.swatch').forEach(swatch => {
  swatch.addEventListener('click', (e) => {
    document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
    e.target.classList.add('active');
    updateStrokeColor(e.target.getAttribute('data-color'));
  });
});

document.getElementById('customColorPicker').addEventListener('input', (e) => {
  document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
  updateStrokeColor(e.target.value);
});

// --- PANNING & ZOOMING ENGINE ---
canvas.on('mouse:wheel', function(opt) {
  if (currentMode !== 'hand') return;
  
  const delta = opt.e.deltaY;
  let zoom = canvas.getZoom();
  zoom *= 0.999 ** delta;
  
  if (zoom > 5) zoom = 5;
  if (zoom < 0.2) zoom = 0.2;

  canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
  opt.e.preventDefault();
  opt.e.stopPropagation();
  
  const vpt = canvas.viewportTransform;
  containerEl.style.backgroundPosition = `${vpt[4]}px ${vpt[5]}px`;
  containerEl.style.backgroundSize = `${24 * zoom}px ${24 * zoom}px`;
});

canvas.on('mouse:down', function(opt) {
  if (currentMode === 'hand') {
    const evt = opt.e;
    isDragging = true;
    canvas.defaultCursor = 'grabbing';
    lastPosX = evt.clientX || (evt.touches && evt.touches[0].clientX);
    lastPosY = evt.clientY || (evt.touches && evt.touches[0].clientY);
  }
});

canvas.on('mouse:move', function(opt) {
  if (isDragging && currentMode === 'hand') {
    const evt = opt.e;
    const clientX = evt.clientX || (evt.touches && evt.touches[0].clientX);
    const clientY = evt.clientY || (evt.touches && evt.touches[0].clientY);
    
    const deltaX = clientX - lastPosX;
    const deltaY = clientY - lastPosY;

    const vpt = canvas.viewportTransform;
    vpt[4] += deltaX;
    vpt[5] += deltaY;
    canvas.requestRenderAll();

    containerEl.style.backgroundPosition = `${vpt[4]}px ${vpt[5]}px`;

    lastPosX = clientX;
    lastPosY = clientY;
  }
});

canvas.on('mouse:up', function() {
  if (currentMode === 'hand') {
    isDragging = false;
    canvas.defaultCursor = 'grab';
  }
});

// --- VECTOR SHAPES & TEXT TOOLS ---

document.getElementById('rectBtn').addEventListener('click', () => {
  const center = getViewportCenter();
  const rect = new fabric.Rect({
    left: center.x - 60,
    top: center.y - 40,
    width: 120,
    height: 80,
    fill: 'transparent',
    stroke: currentColor,
    strokeWidth: 2,
    rx: 4,
    ry: 4
  });

  canvas.add(rect);
  setMode('select');
  canvas.setActiveObject(rect);
});

document.getElementById('circleBtn').addEventListener('click', () => {
  const center = getViewportCenter();
  const circle = new fabric.Circle({
    left: center.x - 45,
    top: center.y - 45,
    radius: 45,
    fill: 'transparent',
    stroke: currentColor,
    strokeWidth: 2
  });

  canvas.add(circle);
  setMode('select');
  canvas.setActiveObject(circle);
});

document.getElementById('arrowBtn').addEventListener('click', () => {
  const center = getViewportCenter();
  
  const line = new fabric.Line([-60, 0, 50, 0], {
    stroke: currentColor,
    strokeWidth: 2,
    originX: 'center',
    originY: 'center'
  });

  const head = new fabric.Triangle({
    left: 50,
    top: 0,
    width: 14,
    height: 14,
    fill: currentColor,
    angle: 90,
    originX: 'center',
    originY: 'center'
  });

  const arrow = new fabric.Group([line, head], {
    left: center.x - 60,
    top: center.y - 7
  });

  canvas.add(arrow);
  setMode('select');
  canvas.setActiveObject(arrow);
});

document.getElementById('textBtn').addEventListener('click', () => {
  const center = getViewportCenter();
  const text = new fabric.IText('Type here...', {
    left: center.x - 50,
    top: center.y - 12,
    fontSize: 22,
    fontFamily: 'Inter, sans-serif',
    fill: currentColor
  });

  canvas.add(text);
  setMode('select');
  canvas.setActiveObject(text);
  text.enterEditing();
  text.selectAll();
});

document.getElementById('imgUploadBtn').addEventListener('click', () => {
  document.getElementById('imageLoader').click();
});

document.getElementById('imageLoader').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (f) => {
    fabric.Image.fromURL(f.target.result, (img) => {
      const center = getViewportCenter();
      img.scaleToWidth(250);
      img.set({ left: center.x - 125, top: center.y - 125 });
      canvas.add(img);
      canvas.setActiveObject(img);
      setMode('select');
    });
  };
  reader.readAsDataURL(file);
});

window.addEventListener('resize', () => {
  canvas.setWidth(window.innerWidth);
  canvas.setHeight(window.innerHeight);
  canvas.renderAll();
});

