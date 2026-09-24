// Disable fabric object caching globally to eliminate stroke ghosting/glitches on zoom
fabric.Object.prototype.objectCaching = false;

const canvas = new fabric.Canvas('drawingCanvas', {
  isDrawingMode: true,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#121212',
  selection: false,
  preserveObjectStacking: true, // Prevents re-ordering flicker during undo/redo
  perPixelTargetFind: true,      // Precise hit detection for 1-click stroke erasing
  targetFindTolerance: 10        // Makes targeting small strokes easier
});

let currentColor = '#ffffff';
let currentBgColor = '#121212';
let currentGridType = 'grid';
let currentBrushSize = 3;
let currentMode = 'draw';

// Configure brush
canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
canvas.freeDrawingBrush.color = currentColor;
canvas.freeDrawingBrush.width = currentBrushSize;

// Prevent newly drawn strokes from being selectable by default
canvas.on('path:created', (opt) => {
  if (opt.path) {
    opt.path.set({
      selectable: false,
      evented: false
    });

    // Handle Native Freeform Eraser Path
    if (currentMode === 'erase') {
      opt.path.globalCompositeOperation = 'destination-out';
      opt.path.stroke = 'rgba(0,0,0,1)';
      canvas.requestRenderAll();
    }
  }
});

// Stop UI panel pointer/touch events from drawing onto canvas
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

function pushState() {
  if (isStateChanging) return;
  historyStack.push(JSON.stringify(canvas.toJSON()));
  redoStack = [];
}

pushState();

canvas.on('object:added', pushState);
canvas.on('object:modified', pushState);
canvas.on('object:removed', pushState);

function applyState(jsonString) {
  isStateChanging = true;
  
  canvas.loadFromJSON(jsonString, () => {
    // Re-apply objects' interactability based on current tool mode
    canvas.forEachObject(obj => {
      obj.selectable = (currentMode === 'select');
      obj.evented = (currentMode === 'select' || currentMode === 'strokeErase');
    });

    updateCanvasBackground();
    canvas.renderAll();
    isStateChanging = false;
  });
}

document.getElementById('undoBtn').addEventListener('click', () => {
  if (historyStack.length > 1) {
    redoStack.push(historyStack.pop());
    const prevState = historyStack[historyStack.length - 1];
    applyState(prevState);
  }
});

document.getElementById('redoBtn').addEventListener('click', () => {
  if (redoStack.length > 0) {
    const nextState = redoStack.pop();
    historyStack.push(nextState);
    applyState(nextState);
  }
});

// --- COLOR SELECTION & PICKERS ---
document.querySelectorAll('.stroke-swatch').forEach(swatch => {
  swatch.addEventListener('click', (e) => {
    document.querySelectorAll('.stroke-swatch').forEach(s => s.classList.remove('active'));
    e.currentTarget.classList.add('active');
    
    currentColor = e.currentTarget.getAttribute('data-color');
    if (currentMode === 'draw') {
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush.color = currentColor;
      canvas.freeDrawingBrush.width = currentBrushSize;
    }
    document.getElementById('customColorPicker').value = currentColor;
  });
});

const customColorPicker = document.getElementById('customColorPicker');
['input', 'change'].forEach(evt => {
  customColorPicker.addEventListener(evt, (e) => {
    currentColor = e.target.value;
    if (currentMode === 'draw') {
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush.color = currentColor;
      canvas.freeDrawingBrush.width = currentBrushSize;
    }
    document.querySelectorAll('.stroke-swatch').forEach(s => s.classList.remove('active'));
  });
});

document.querySelectorAll('.bg-swatch').forEach(swatch => {
  swatch.addEventListener('click', (e) => {
    document.querySelectorAll('.bg-swatch').forEach(s => s.classList.remove('active'));
    e.currentTarget.classList.add('active');
    
    currentBgColor = e.currentTarget.getAttribute('data-bg');
    document.getElementById('customBgPicker').value = currentBgColor;
    updateCanvasBackground();

    if (currentMode === 'erase' && (!fabric.EraserBrush)) {
      canvas.freeDrawingBrush.color = currentBgColor;
    }
  });
});

const customBgPicker = document.getElementById('customBgPicker');
['input', 'change'].forEach(evt => {
  customBgPicker.addEventListener(evt, (e) => {
    currentBgColor = e.target.value;
    document.querySelectorAll('.bg-swatch').forEach(s => s.classList.remove('active'));
    updateCanvasBackground();

    if (currentMode === 'erase' && (!fabric.EraserBrush)) {
      canvas.freeDrawingBrush.color = currentBgColor;
    }
  });
});

// --- ZOOM & PAN ---
let isPanning = false;
let lastPosX = 0, lastPosY = 0;
let lastTouchDistance = 0;

canvas.on('mouse:wheel', (opt) => {
  const delta = opt.e.deltaY;
  let zoom = canvas.getZoom();
  zoom *= 0.999 ** delta;
  zoom = Math.min(Math.max(zoom, 0.2), 10);
  
  canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
  opt.e.preventDefault();
  opt.e.stopPropagation();
});

canvas.on('mouse:down', (opt) => {
  const evt = opt.e;
  if (currentMode === 'hand' || evt.altKey) {
    isPanning = true;
    canvas.isDrawingMode = false;
    lastPosX = evt.clientX || evt.touches?.[0]?.clientX || 0;
    lastPosY = evt.clientY || evt.touches?.[0]?.clientY || 0;
  }
});

canvas.on('mouse:move', (opt) => {
  const evt = opt.e;
  
  if (evt.touches && evt.touches.length === 2) {
    canvas.isDrawingMode = false;
    const touch1 = evt.touches[0];
    const touch2 = evt.touches[1];
    const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
    
    if (lastTouchDistance) {
      const zoomFactor = dist / lastTouchDistance;
      let zoom = canvas.getZoom() * zoomFactor;
      zoom = Math.min(Math.max(zoom, 0.2), 10);
      
      const center = {
        x: (touch1.clientX + touch2.clientX) / 2,
        y: (touch1.clientY + touch2.clientY) / 2
      };
      canvas.zoomToPoint(center, zoom);
    }
    lastTouchDistance = dist;
    return;
  }

  if (isPanning) {
    const currentX = evt.clientX || evt.touches?.[0]?.clientX || 0;
    const currentY = evt.clientY || evt.touches?.[0]?.clientY || 0;
    
    const vpt = canvas.viewportTransform;
    vpt[4] += currentX - lastPosX;
    vpt[5] += currentY - lastPosY;
    canvas.requestRenderAll();
    
    lastPosX = currentX;
    lastPosY = currentY;
  }
});

canvas.on('mouse:up', () => {
  isPanning = false;
  lastTouchDistance = 0;
  if (currentMode === 'draw' || currentMode === 'erase') {
    canvas.isDrawingMode = true;
  }
});

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
  if (currentMode === 'strokeErase') {
    isStrokeErasing = false;
  }
});

// --- SHAPE & TEXT TOOLS ---
function addRectangle() {
  const rect = new fabric.Rect({
    left: canvas.getCenter().left - 50,
    top: canvas.getCenter().top - 50,
    fill: 'transparent',
    stroke: currentColor,
    strokeWidth: 3,
    width: 100,
    height: 100,
    selectable: true,
    evented: true
  });
  canvas.add(rect);
  setMode('select');
}

function addCircle() {
  const circle = new fabric.Circle({
    left: canvas.getCenter().left - 40,
    top: canvas.getCenter().top - 40,
    fill: 'transparent',
    stroke: currentColor,
    strokeWidth: 3,
    radius: 40,
    selectable: true,
    evented: true
  });
  canvas.add(circle);
  setMode('select');
}

function addText() {
  const text = new fabric.IText('Tap to Edit', {
    left: canvas.getCenter().left - 50,
    top: canvas.getCenter().top - 15,
    fill: currentColor,
    fontSize: 24,
    selectable: true,
    evented: true
  });
  canvas.add(text);
  canvas.setActiveObject(text);
  setMode('select');
}

document.getElementById('rectBtn').addEventListener('click', addRectangle);
document.getElementById('circleBtn').addEventListener('click', addCircle);
document.getElementById('textBtn').addEventListener('click', addText);

// --- TOOL MODES ---
function setMode(mode) {
  currentMode = mode;
  canvas.isDrawingMode = false;
  canvas.selection = false;

  canvas.forEachObject(obj => {
    obj.selectable = (mode === 'select');
    obj.evented = (mode === 'select' || mode === 'strokeErase');
  });

  document.querySelectorAll('#excali-toolbar .tool-btn').forEach(btn => btn.classList.remove('active'));

  if (mode === 'hand') {
    document.getElementById('handBtn').classList.add('active');
  } else if (mode === 'select') {
    canvas.selection = true;
    document.getElementById('selectBtn').classList.add('active');
  } else if (mode === 'draw') {
    canvas.isDrawingMode = true;
    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    canvas.freeDrawingBrush.color = currentColor;
    canvas.freeDrawingBrush.width = currentBrushSize;
    document.getElementById('drawBtn').classList.add('active');
  } else if (mode === 'erase') {
    canvas.isDrawingMode = true;
    if (fabric.EraserBrush) {
      canvas.freeDrawingBrush = new fabric.EraserBrush(canvas);
    } else {
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      // Matches the live canvas background color dynamically
      canvas.freeDrawingBrush.color = currentBgColor;
    }
    canvas.freeDrawingBrush.width = 20;
    document.getElementById('eraseBtn').classList.add('active');
  } else if (mode === 'strokeErase') {
    document.getElementById('strokeEraseBtn').classList.add('active');
  }

  canvas.requestRenderAll();
}

document.getElementById('handBtn').addEventListener('click', () => setMode('hand'));
document.getElementById('selectBtn').addEventListener('click', () => setMode('select'));
document.getElementById('drawBtn').addEventListener('click', () => setMode('draw'));
document.getElementById('eraseBtn').addEventListener('click', () => setMode('erase'));
document.getElementById('strokeEraseBtn').addEventListener('click', () => setMode('strokeErase'));

// Clear Canvas
document.getElementById('clearBtn').addEventListener('click', () => {
  canvas.clear();
  updateCanvasBackground();
  pushState();
});

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
    canvas.setOverlayColor(pattern, () => {});
  });
}

updateCanvasBackground();

document.querySelectorAll('.grid-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.grid-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentGridType = e.target.getAttribute('data-grid');
    updateCanvasBackground();
    canvas.requestRenderAll();
  });
});

// --- EXPORT & FILES ---
document.getElementById('exportImgBtn').addEventListener('click', () => {
  const dataURL = canvas.toDataURL({ format: 'png', quality: 1 });
  const link = document.createElement('a');
  link.download = 'whiteboard-notes.png';
  link.href = dataURL;
  link.click();
});

document.getElementById('downloadBtn').addEventListener('click', () => {
  const jsonStr = JSON.stringify(canvas.toJSON());
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const link = document.createElement('a');
  link.download = 'whiteboard-session.json';
  link.href = URL.createObjectURL(blob);
  link.click();
});

const hiddenFileInput = document.getElementById('hiddenFileInput');

document.getElementById('loadBtn').addEventListener('click', () => {
  hiddenFileInput.click();
});

hiddenFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    if (file.name.endsWith('.json')) {
      applyState(evt.target.result);
      pushState();
    } else {
      fabric.Image.fromURL(evt.target.result, (img) => {
        img.scaleToWidth(canvas.width * 0.5);
        canvas.add(img);
        canvas.centerObject(img);
        setMode('select');
      });
    }
  };
  reader.readAsText(file);
});

// AI Menu Toggle
const aiMenuTrigger = document.getElementById('aiMenuTrigger');
const aiMenu = document.getElementById('aiMenu');

aiMenuTrigger.addEventListener('click', (e) => {
  e.stopPropagation();
  aiMenu.classList.toggle('open');
});

window.addEventListener('click', () => {
  aiMenu.classList.remove('open');
});

window.addEventListener('resize', () => {
  canvas.setWidth(window.innerWidth);
  canvas.setHeight(window.innerHeight);
  canvas.renderAll();
});      opt.path.stroke = 'rgba(0,0,0,1)';
      canvas.requestRenderAll();
    }
  }
});

// Stop UI panel pointer/touch events from drawing onto canvas
document.querySelectorAll('.ui-element').forEach(element => {
  const stopEvt = (e) => e.stopPropagation();
  element.addEventListener('pointerdown', stopEvt);
  element.addEventListener('touchstart', stopEvt);
  element.addEventListener('mousedown', stopEvt);
});

// --- SEAMLESS UNDO / REDO ---
let historyStack = [];
let redoStack = [];
let isStateChanging = false;

function pushState() {
  if (isStateChanging) return;
  historyStack.push(canvas.toDatalessJSON());
  redoStack = [];
}

pushState();

canvas.on('object:added', pushState);
canvas.on('object:modified', pushState);
canvas.on('object:removed', pushState);

function applyStateSeamlessly(jsonState) {
  isStateChanging = true;
  
  // Parse state silently without triggering instant re-renders to prevent screen flash
  canvas.loadFromJSONObject(jsonState, () => {
    // Re-apply objects' clickability/editability based on current tool mode
    canvas.forEachObject(obj => {
      obj.selectable = (currentMode === 'select');
      obj.evented = (currentMode === 'select' || currentMode === 'strokeErase');
    });

    updateCanvasBackground();
    canvas.renderAll();
    isStateChanging = false;
  });
}

document.getElementById('undoBtn').addEventListener('click', () => {
  if (historyStack.length > 1) {
    redoStack.push(historyStack.pop());
    const prevState = historyStack[historyStack.length - 1];
    applyStateSeamlessly(prevState);
  }
});

document.getElementById('redoBtn').addEventListener('click', () => {
  if (redoStack.length > 0) {
    const nextState = redoStack.pop();
    historyStack.push(nextState);
    applyStateSeamlessly(nextState);
  }
});

// --- COLOR SELECTION & PICKERS ---
document.querySelectorAll('.stroke-swatch').forEach(swatch => {
  swatch.addEventListener('click', (e) => {
    document.querySelectorAll('.stroke-swatch').forEach(s => s.classList.remove('active'));
    e.currentTarget.classList.add('active');
    
    currentColor = e.currentTarget.getAttribute('data-color');
    if (currentMode === 'draw') {
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush.color = currentColor;
      canvas.freeDrawingBrush.width = currentBrushSize;
    }
    document.getElementById('customColorPicker').value = currentColor;
  });
});

const customColorPicker = document.getElementById('customColorPicker');
['input', 'change'].forEach(evt => {
  customColorPicker.addEventListener(evt, (e) => {
    currentColor = e.target.value;
    if (currentMode === 'draw') {
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush.color = currentColor;
      canvas.freeDrawingBrush.width = currentBrushSize;
    }
    document.querySelectorAll('.stroke-swatch').forEach(s => s.classList.remove('active'));
  });
});

document.querySelectorAll('.bg-swatch').forEach(swatch => {
  swatch.addEventListener('click', (e) => {
    document.querySelectorAll('.bg-swatch').forEach(s => s.classList.remove('active'));
    e.currentTarget.classList.add('active');
    
    currentBgColor = e.currentTarget.getAttribute('data-bg');
    document.getElementById('customBgPicker').value = currentBgColor;
    updateCanvasBackground();

    if (currentMode === 'erase') {
      canvas.freeDrawingBrush.color = currentBgColor;
    }
  });
});

const customBgPicker = document.getElementById('customBgPicker');
['input', 'change'].forEach(evt => {
  customBgPicker.addEventListener(evt, (e) => {
    currentBgColor = e.target.value;
    document.querySelectorAll('.bg-swatch').forEach(s => s.classList.remove('active'));
    updateCanvasBackground();

    if (currentMode === 'erase') {
      canvas.freeDrawingBrush.color = currentBgColor;
    }
  });
});

// --- CLEAN ZOOM & PAN ---
let isPanning = false;
let lastPosX = 0, lastPosY = 0;
let lastTouchDistance = 0;

canvas.on('mouse:wheel', (opt) => {
  const delta = opt.e.deltaY;
  let zoom = canvas.getZoom();
  zoom *= 0.999 ** delta;
  zoom = Math.min(Math.max(zoom, 0.2), 10);
  
  canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
  opt.e.preventDefault();
  opt.e.stopPropagation();
});

canvas.on('mouse:down', (opt) => {
  const evt = opt.e;
  if (currentMode === 'hand' || evt.altKey) {
    isPanning = true;
    canvas.isDrawingMode = false;
    lastPosX = evt.clientX || evt.touches?.[0]?.clientX || 0;
    lastPosY = evt.clientY || evt.touches?.[0]?.clientY || 0;
  }
});

canvas.on('mouse:move', (opt) => {
  const evt = opt.e;
  
  if (evt.touches && evt.touches.length === 2) {
    canvas.isDrawingMode = false;
    const touch1 = evt.touches[0];
    const touch2 = evt.touches[1];
    const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
    
    if (lastTouchDistance) {
      const zoomFactor = dist / lastTouchDistance;
      let zoom = canvas.getZoom() * zoomFactor;
      zoom = Math.min(Math.max(zoom, 0.2), 10);
      
      const center = {
        x: (touch1.clientX + touch2.clientX) / 2,
        y: (touch1.clientY + touch2.clientY) / 2
      };
      canvas.zoomToPoint(center, zoom);
    }
    lastTouchDistance = dist;
    return;
  }

  if (isPanning) {
    const currentX = evt.clientX || evt.touches?.[0]?.clientX || 0;
    const currentY = evt.clientY || evt.touches?.[0]?.clientY || 0;
    
    const vpt = canvas.viewportTransform;
    vpt[4] += currentX - lastPosX;
    vpt[5] += currentY - lastPosY;
    canvas.requestRenderAll();
    
    lastPosX = currentX;
    lastPosY = currentY;
  }
});

canvas.on('mouse:up', () => {
  isPanning = false;
  lastTouchDistance = 0;
  if (currentMode === 'draw' || currentMode === 'erase') {
    canvas.isDrawingMode = true;
  }
});

// --- HIGH-RESPONSIVENESS STROKE-BY-STROKE ERASER ---
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
  if (currentMode === 'strokeErase') {
    isStrokeErasing = false;
  }
});

// --- SHAPE & TEXT TOOLS ---
function addRectangle() {
  const rect = new fabric.Rect({
    left: canvas.getCenter().left - 50,
    top: canvas.getCenter().top - 50,
    fill: 'transparent',
    stroke: currentColor,
    strokeWidth: 3,
    width: 100,
    height: 100,
    selectable: true,
    evented: true
  });
  canvas.add(rect);
  setMode('select');
}

function addCircle() {
  const circle = new fabric.Circle({
    left: canvas.getCenter().left - 40,
    top: canvas.getCenter().top - 40,
    fill: 'transparent',
    stroke: currentColor,
    strokeWidth: 3,
    radius: 40,
    selectable: true,
    evented: true
  });
  canvas.add(circle);
  setMode('select');
}

function addText() {
  const text = new fabric.IText('Tap to Edit', {
    left: canvas.getCenter().left - 50,
    top: canvas.getCenter().top - 15,
    fill: currentColor,
    fontSize: 24,
    selectable: true,
    evented: true
  });
  canvas.add(text);
  canvas.setActiveObject(text);
  setMode('select');
}

document.getElementById('rectBtn').addEventListener('click', addRectangle);
document.getElementById('circleBtn').addEventListener('click', addCircle);
document.getElementById('textBtn').addEventListener('click', addText);

// --- TOOL MODES ---
function setMode(mode) {
  currentMode = mode;
  canvas.isDrawingMode = false;
  canvas.selection = false;

  canvas.forEachObject(obj => {
    obj.selectable = (mode === 'select');
    obj.evented = (mode === 'select' || mode === 'strokeErase');
  });

  document.querySelectorAll('#excali-toolbar .tool-btn').forEach(btn => btn.classList.remove('active'));

  if (mode === 'hand') {
    document.getElementById('handBtn').classList.add('active');
  } else if (mode === 'select') {
    canvas.selection = true;
    document.getElementById('selectBtn').classList.add('active');
  } else if (mode === 'draw') {
    canvas.isDrawingMode = true;
    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    canvas.freeDrawingBrush.color = currentColor;
    canvas.freeDrawingBrush.width = currentBrushSize;
    document.getElementById('drawBtn').classList.add('active');
  } else if (mode === 'erase') {
    canvas.isDrawingMode = true;
    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    canvas.freeDrawingBrush.width = 18;
    // Matching live brush color to background prevents black preview rendering
    canvas.freeDrawingBrush.color = currentBgColor;
    document.getElementById('eraseBtn').classList.add('active');
  } else if (mode === 'strokeErase') {
    document.getElementById('strokeEraseBtn').classList.add('active');
  }

  canvas.requestRenderAll();
}

document.getElementById('handBtn').addEventListener('click', () => setMode('hand'));
document.getElementById('selectBtn').addEventListener('click', () => setMode('select'));
document.getElementById('drawBtn').addEventListener('click', () => setMode('draw'));
document.getElementById('eraseBtn').addEventListener('click', () => setMode('erase'));
document.getElementById('strokeEraseBtn').addEventListener('click', () => setMode('strokeErase'));

// Clear Canvas
document.getElementById('clearBtn').addEventListener('click', () => {
  canvas.clear();
  updateCanvasBackground();
  pushState();
});

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
    canvas.setOverlayColor(pattern, () => {});
  });
}

updateCanvasBackground();

document.querySelectorAll('.grid-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.grid-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentGridType = e.target.getAttribute('data-grid');
    updateCanvasBackground();
    canvas.requestRenderAll();
  });
});

// --- EXPORT & FILES ---
document.getElementById('exportImgBtn').addEventListener('click', () => {
  const dataURL = canvas.toDataURL({ format: 'png', quality: 1 });
  const link = document.createElement('a');
  link.download = 'whiteboard-notes.png';
  link.href = dataURL;
  link.click();
});

document.getElementById('downloadBtn').addEventListener('click', () => {
  const jsonStr = JSON.stringify(canvas.toDatalessJSON());
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const link = document.createElement('a');
  link.download = 'whiteboard-session.json';
  link.href = URL.createObjectURL(blob);
  link.click();
});

const hiddenFileInput = document.getElementById('hiddenFileInput');

document.getElementById('loadBtn').addEventListener('click', () => {
  hiddenFileInput.click();
});

hiddenFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    if (file.name.endsWith('.json')) {
      const parsed = JSON.parse(evt.target.result);
      applyStateSeamlessly(parsed);
      pushState();
    } else {
      fabric.Image.fromURL(evt.target.result, (img) => {
        img.scaleToWidth(canvas.width * 0.5);
        canvas.add(img);
        canvas.centerObject(img);
        setMode('select');
      });
    }
  };
  reader.readAsText(file);
});

// AI Menu Toggle
const aiMenuTrigger = document.getElementById('aiMenuTrigger');
const aiMenu = document.getElementById('aiMenu');

aiMenuTrigger.addEventListener('click', (e) => {
  e.stopPropagation();
  aiMenu.classList.toggle('open');
});

window.addEventListener('click', () => {
  aiMenu.classList.remove('open');
});

window.addEventListener('resize', () => {
  canvas.setWidth(window.innerWidth);
  canvas.setHeight(window.innerHeight);
  canvas.renderAll();
});
