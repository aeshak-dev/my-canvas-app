// Initialize Fabric.js Canvas
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

// App State (Default color white for dark background visibility)
let currentColor = '#ffffff';
let currentBgColor = '#121212';
let currentGridType = 'none';
let currentBrushSize = 3;
let currentMode = 'draw';

// Sync Drawing Brush State
function updateBrush() {
  if (currentMode === 'draw') {
    canvas.isDrawingMode = true;
    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    canvas.freeDrawingBrush.color = currentColor;
    canvas.freeDrawingBrush.width = parseInt(currentBrushSize, 10) || 3;
  } else if (currentMode === 'erase') {
    canvas.isDrawingMode = true;
    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    // Dynamic Eraser matching active sheet color
    canvas.freeDrawingBrush.color = currentBgColor;
    canvas.freeDrawingBrush.width = 20;
  } else {
    canvas.isDrawingMode = false;
  }
}

// Make drawn paths unselectable
canvas.on('path:created', (opt) => {
  if (opt.path) {
    opt.path.set({
      selectable: false,
      evented: false
    });
  }
});

// Stop UI panel events from triggering canvas actions
document.querySelectorAll('.excali-island, .excali-card, .ui-element').forEach(element => {
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

  document.querySelectorAll('#toolbar .tool-btn').forEach(btn => btn.classList.remove('active'));

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

// --- COLOR SELECTION (Black, Gray, White) ---
document.querySelectorAll('#sidebar .swatch').forEach(swatch => {
  swatch.addEventListener('click', (e) => {
    document.querySelectorAll('#sidebar .swatch').forEach(s => s.classList.remove('active'));
    e.currentTarget.classList.add('active');
    
    const selectedColor = e.currentTarget.getAttribute('data-color');
    if (selectedColor) {
      if (currentMode === 'erase') {
        // If erasing, update background color & brush eraser color together
        currentBgColor = selectedColor;
        updateCanvasBackground();
      } else {
        currentColor = selectedColor;
      }
      updateBrush();
    }
  });
});

// --- STROKE THICKNESS PICKER ---
document.querySelectorAll('.thick-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.thick-btn').forEach(b => b.classList.remove('active'));
    const target = e.currentTarget;
    target.classList.add('active');

    if (target.querySelector('.line-s')) currentBrushSize = 2;
    if (target.querySelector('.line-m')) currentBrushSize = 5;
    if (target.querySelector('.line-l')) currentBrushSize = 10;

    if (currentMode === 'draw') updateBrush();
  });
});

// --- CANVAS BACKGROUND & PATTERNS ---
function createPatternOverlay(type, strokeColor) {
  if (!type || type === 'none') return null;

  const patternCanvas = document.createElement('canvas');
  const ctx = patternCanvas.getContext('2d');

  if (type === 'grid') {
    patternCanvas.width = 20;
    patternCanvas.height = 20;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 20); ctx.lineTo(20, 20);
    ctx.moveTo(20, 0); ctx.lineTo(20, 20);
    ctx.stroke();
  } else if (type === 'dots') {
    patternCanvas.width = 20;
    patternCanvas.height = 20;
    ctx.fillStyle = strokeColor;
    ctx.beginPath();
    ctx.arc(10, 10, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  return new fabric.Pattern({ source: patternCanvas, repeat: 'repeat' });
}

function updateCanvasBackground() {
  const isDark = currentBgColor === '#121212' || currentBgColor === '#000000';
  const gridLineColor = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)';
  const pattern = createPatternOverlay(currentGridType, gridLineColor);

  canvas.setBackgroundColor(currentBgColor, () => {
    canvas.setOverlayColor(pattern, () => {
      canvas.renderAll();
    });
  });
}

const gridSelect = document.querySelector('.grid-picker select');
if (gridSelect) {
  gridSelect.addEventListener('change', (e) => {
    currentGridType = e.target.value.toLowerCase();
    updateCanvasBackground();
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

// Initialize
setMode('draw');
updateCanvasBackground();

// Window Resize
window.addEventListener('resize', () => {
  canvas.setWidth(window.innerWidth);
  canvas.setHeight(window.innerHeight);
  canvas.renderAll();
});
