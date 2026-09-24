// Disable fabric object caching globally to eliminate stroke ghosting/glitches
fabric.Object.prototype.objectCaching = false;

const canvas = new fabric.Canvas('drawingCanvas', {
  isDrawingMode: true,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#121212',
  selection: false,
  preserveObjectStacking: true,
  perPixelTargetFind: true,
  targetFindTolerance: 10
});

let currentColor = '#ffffff';
let currentBgColor = '#121212';
let currentGridType = 'grid';
let currentBrushSize = 3;
let currentMode = 'draw';

// Configure Brush Setup
function updateBrush() {
  if (currentMode === 'draw') {
    canvas.isDrawingMode = true;
    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    canvas.freeDrawingBrush.color = currentColor;
    canvas.freeDrawingBrush.width = parseInt(currentBrushSize, 10) || 3;
  } else if (currentMode === 'erase') {
    canvas.isDrawingMode = true;
    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    // Erase matching current background color
    canvas.freeDrawingBrush.color = currentBgColor;
    canvas.freeDrawingBrush.width = 20;
  } else {
    canvas.isDrawingMode = false;
  }
}

// Ensure drawn paths remain unselectable by default
canvas.on('path:created', (opt) => {
  if (opt.path) {
    opt.path.set({
      selectable: false,
      evented: false
    });

    if (currentMode === 'erase') {
      // Cuts out drawn paths transparently over custom backgrounds
      opt.path.globalCompositeOperation = 'destination-out';
      opt.path.stroke = 'rgba(0,0,0,1)';
      canvas.requestRenderAll();
    }
  }
});

// Prevent UI panels from intercepting canvas clicks
document.querySelectorAll('.ui-element').forEach(element => {
  const stopEvt = (e) => e.stopPropagation();
  element.addEventListener('pointerdown', stopEvt);
  element.addEventListener('touchstart', stopEvt);
  element.addEventListener('mousedown', stopEvt);
});

// --- UNDO / REDO SYSTEM ---
let historyStack = [];
let redoStack = [];
let isStateChanging = false;

function saveState() {
  if (isStateChanging) return;
  const json = JSON.stringify(canvas.toJSON());
  historyStack.push(json);
  redoStack = [];
}

// Capture Initial State
saveState();

canvas.on('object:added', saveState);
canvas.on('object:modified', saveState);
canvas.on('object:removed', saveState);

function loadCanvasState(jsonString) {
  isStateChanging = true;
  canvas.loadFromJSON(jsonString, () => {
    canvas.forEachObject(obj => {
      obj.selectable = (currentMode === 'select');
      obj.evented = (currentMode === 'select' || currentMode === 'strokeErase');
    });
    updateCanvasBackground();
    canvas.renderAll();
    isStateChanging = false;
  });
}

document.getElementById('undoBtn')?.addEventListener('click', () => {
  if (historyStack.length > 1) {
    redoStack.push(historyStack.pop());
    const prevState = historyStack[historyStack.length - 1];
    loadCanvasState(prevState);
  }
});

document.getElementById('redoBtn')?.addEventListener('click', () => {
  if (redoStack.length > 0) {
    const nextState = redoStack.pop();
    historyStack.push(nextState);
    loadCanvasState(nextState);
  }
});

// --- TOOL SELECTION ---
function setMode(mode) {
  currentMode = mode;
  canvas.selection = (mode === 'select');

  canvas.forEachObject(obj => {
    obj.selectable = (mode === 'select');
    obj.evented = (mode === 'select' || mode === 'strokeErase');
  });

  document.querySelectorAll('#excali-toolbar .tool-btn').forEach(btn => btn.classList.remove('active'));

  if (mode === 'hand') document.getElementById('handBtn')?.classList.add('active');
  if (mode === 'select') document.getElementById('selectBtn')?.classList.add('active');
  if (mode === 'draw') document.getElementById('drawBtn')?.classList.add('active');
  if (mode === 'erase') document.getElementById('eraseBtn')?.classList.add('active');
  if (mode === 'strokeErase') document.getElementById('strokeEraseBtn')?.classList.add('active');

  updateBrush();
  canvas.requestRenderAll();
}

document.getElementById('handBtn')?.addEventListener('click', () => setMode('hand'));
document.getElementById('selectBtn')?.addEventListener('click', () => setMode('select'));
document.getElementById('drawBtn')?.addEventListener('click', () => setMode('draw'));
document.getElementById('eraseBtn')?.addEventListener('click', () => setMode('erase'));
document.getElementById('strokeEraseBtn')?.addEventListener('click', () => setMode('strokeErase'));

// --- COLOR SELECTION & BACKGROUNDS ---
document.querySelectorAll('.stroke-swatch').forEach(swatch => {
  swatch.addEventListener('click', (e) => {
    document.querySelectorAll('.stroke-swatch').forEach(s => s.classList.remove('active'));
    e.currentTarget.classList.add('active');
    currentColor = e.currentTarget.getAttribute('data-color');
    if (currentMode === 'draw') updateBrush();
  });
});

const customColorPicker = document.getElementById('customColorPicker');
if (customColorPicker) {
  ['input', 'change'].forEach(evt => {
    customColorPicker.addEventListener(evt, (e) => {
      currentColor = e.target.value;
      if (currentMode === 'draw') updateBrush();
    });
  });
}

document.querySelectorAll('.bg-swatch').forEach(swatch => {
  swatch.addEventListener('click', (e) => {
    document.querySelectorAll('.bg-swatch').forEach(s => s.classList.remove('active'));
    e.currentTarget.classList.add('active');
    currentBgColor = e.currentTarget.getAttribute('data-bg');
    updateCanvasBackground();
    if (currentMode === 'erase') updateBrush();
  });
});

const customBgPicker = document.getElementById('customBgPicker');
if (customBgPicker) {
  ['input', 'change'].forEach(evt => {
    customBgPicker.addEventListener(evt, (e) => {
      currentBgColor = e.target.value;
      updateCanvasBackground();
      if (currentMode === 'erase') updateBrush();
    });
  });
}

// --- PAPER PATTERNS ---
function createPatternOverlay(type, strokeColor) {
  if (type === 'none') return null;

  const patternCanvas = document.createElement('canvas');
  const ctx = patternCanvas.getContext('2d');

  if (type === 'grid') {
    patternCanvas.width = 30;
    patternCanvas.height = 30;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 30); ctx.lineTo(30, 30);
    ctx.moveTo(30, 0); ctx.lineTo(30, 30);
    ctx.stroke();
  } else if (type === 'ruled') {
    patternCanvas.width = 40;
    patternCanvas.height = 32;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 32); ctx.lineTo(40, 32);
    ctx.stroke();
  } else if (type === 'dots') {
    patternCanvas.width = 24;
    patternCanvas.height = 24;
    ctx.fillStyle = strokeColor;
    ctx.beginPath();
    ctx.arc(12, 12, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  return new fabric.Pattern({ source: patternCanvas, repeat: 'repeat' });
}

function updateCanvasBackground() {
  const isDark = currentBgColor === '#121212' || currentBgColor === '#1e1e24';
  const gridLineColor = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.15)';
  const pattern = createPatternOverlay(currentGridType, gridLineColor);

  canvas.setBackgroundColor(currentBgColor, () => {
    canvas.setOverlayColor(pattern, () => {
      canvas.renderAll();
    });
  });
}

// --- STROKE-BY-STROKE ERASER ---
let isStrokeErasing = false;

function eraseTargetStroke(opt) {
  if (currentMode !== 'strokeErase') return;
  const target = opt.target || canvas.findTarget(opt.e, false);
  if (target) {
    canvas.remove(target);
    canvas.requestRenderAll();
  }
}

canvas.on('mouse:down', (opt) => {
  if (currentMode === 'strokeErase') {
    isStrokeErasing = true;
    eraseTargetStroke(opt);
  }
});

canvas.on('mouse:move', (opt) => {
  if (currentMode === 'strokeErase' && isStrokeErasing) {
    eraseTargetStroke(opt);
  }
});

canvas.on('mouse:up', () => {
  isStrokeErasing = false;
});

// Clear Canvas
document.getElementById('clearBtn')?.addEventListener('click', () => {
  canvas.clear();
  updateCanvasBackground();
  saveState();
});

// Initialize Defaults
setMode('draw');
updateCanvasBackground();

// Handle Window Resize
window.addEventListener('resize', () => {
  canvas.setWidth(window.innerWidth);
  canvas.setHeight(window.innerHeight);
  canvas.renderAll();
});
