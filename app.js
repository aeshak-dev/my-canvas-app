// Disable fabric object caching globally to eliminate stroke ghosting/glitches on zoom
fabric.Object.prototype.objectCaching = false;

const canvas = new fabric.Canvas('drawingCanvas', {
  isDrawingMode: true,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#121212',
  selection: false
});

let currentColor = '#ffffff';
let currentBgColor = '#121212';
let currentGridType = 'grid';
let currentBrushSize = 3;
let currentMode = 'draw';

// Configure initial brush
canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
canvas.freeDrawingBrush.color = currentColor;
canvas.freeDrawingBrush.width = currentBrushSize;

// Track paths created for blending eraser correctly
canvas.on('path:created', (opt) => {
  if (opt.path) {
    if (currentMode === 'erase') {
      opt.path.isEraserStroke = true;
      opt.path.set({
        stroke: currentBgColor,
        strokeWidth: 24,
        selectable: false,
        evented: false
      });
    } else {
      opt.path.set({
        selectable: false,
        evented: false
      });
    }
  }
});

// Stop UI panel pointer/touch events from drawing onto canvas
document.querySelectorAll('.ui-element, .modal-card').forEach(element => {
  const stopEvt = (e) => e.stopPropagation();
  element.addEventListener('pointerdown', stopEvt);
  element.addEventListener('touchstart', stopEvt);
  element.addEventListener('mousedown', stopEvt);
});

// --- UNDO / REDO ---
let historyStack = [];
let redoStack = [];
let isStateChanging = false;

function pushState() {
  if (isStateChanging) return;
  historyStack.push(canvas.toJSON(['isEraserStroke']));
  redoStack = [];
}

pushState();

canvas.on('object:added', pushState);
canvas.on('object:modified', pushState);
canvas.on('object:removed', pushState);

document.getElementById('undoBtn').addEventListener('click', () => {
  if (historyStack.length > 1) {
    isStateChanging = true;
    redoStack.push(historyStack.pop());
    const prevState = historyStack[historyStack.length - 1];
    
    canvas.loadFromJSON(prevState, () => {
      canvas.renderAll();
      updateCanvasBackground();
      isStateChanging = false;
    });
  }
});

document.getElementById('redoBtn').addEventListener('click', () => {
  if (redoStack.length > 0) {
    isStateChanging = true;
    const nextState = redoStack.pop();
    historyStack.push(nextState);
    
    canvas.loadFromJSON(nextState, () => {
      canvas.renderAll();
      updateCanvasBackground();
      isStateChanging = false;
    });
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
    updateCanvasBackground();
  });
});

// --- CLEAN ZOOM & PAN CONTROLS ---
let isPanning = false;
let lastPosX = 0, lastPosY = 0;
let lastTouchDistance = 0;

function updateZoomDisplay() {
  const zoom = Math.round(canvas.getZoom() * 100);
  document.getElementById('zoomDisplay').innerText = `${zoom}%`;
}

function setZoom(newZoom, point) {
  let zoom = Math.min(Math.max(newZoom, 0.2), 10);
  const zoomPoint = point || { x: canvas.width / 2, y: canvas.height / 2 };
  canvas.zoomToPoint(zoomPoint, zoom);
  updateZoomDisplay();
}

document.getElementById('zoomInBtn').addEventListener('click', () => setZoom(canvas.getZoom() * 1.2));
document.getElementById('zoomOutBtn').addEventListener('click', () => setZoom(canvas.getZoom() / 1.2));
document.getElementById('zoomResetBtn').addEventListener('click', () => {
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
  updateZoomDisplay();
});

canvas.on('mouse:wheel', (opt) => {
  const delta = opt.e.deltaY;
  let zoom = canvas.getZoom();
  zoom *= 0.999 ** delta;
  setZoom(zoom, { x: opt.e.offsetX, y: opt.e.offsetY });
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
      const center = {
        x: (touch1.clientX + touch2.clientX) / 2,
        y: (touch1.clientY + touch2.clientY) / 2
      };
      setZoom(canvas.getZoom() * zoomFactor, center);
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

// --- STROKE-BY-STROKE ERASER HANDLER ---
let isStrokeErasing = false;

canvas.on('mouse:down', (opt) => {
  if (currentMode === 'strokeErase') {
    isStrokeErasing = true;
    if (opt.target) {
      canvas.remove(opt.target);
      canvas.requestRenderAll();
    }
  }
});

canvas.on('mouse:move', (opt) => {
  if (currentMode === 'strokeErase' && isStrokeErasing) {
    if (opt.target) {
      canvas.remove(opt.target);
      canvas.requestRenderAll();
    }
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
    canvas.freeDrawingBrush.width = 24;
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

// --- PAPER PATTERNS & BACKGROUND COLOR UPDATER ---
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
  
  // Re-color all past eraser strokes so they blend seamlessly into the new background color
  canvas.forEachObject(obj => {
    if (obj.isEraserStroke) {
      obj.set('stroke', currentBgColor);
    }
  });

  if (currentMode === 'erase') {
    canvas.freeDrawingBrush.color = currentBgColor;
  }

  const pattern = createPatternOverlay(currentGridType, gridLineColor);
  canvas.setBackgroundColor(currentBgColor, () => {
    canvas.setOverlayColor(pattern, canvas.renderAll.bind(canvas));
  });
}

updateCanvasBackground();

document.querySelectorAll('.grid-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.grid-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentGridType = e.target.getAttribute('data-grid');
    updateCanvasBackground();
  });
});

// --- AI TEXT-TO-DIAGRAM GENERATOR ---
const diagramModal = document.getElementById('diagramModal');
const diagramInput = document.getElementById('diagramInput');

document.getElementById('aiDiagramBtn').addEventListener('click', () => {
  aiMenu.classList.remove('open');
  diagramModal.classList.add('open');
});

document.getElementById('closeDiagramModal').addEventListener('click', () => {
  diagramModal.classList.remove('open');
});

document.getElementById('generateDiagramBtn').addEventListener('click', () => {
  const text = diagramInput.value.trim();
  if (!text) return;

  const steps = text.split(/->|\n/).map(s => s.trim()).filter(Boolean);
  if (steps.length === 0) return;

  const startX = canvas.getCenter().left - (steps.length * 75);
  const startY = canvas.getCenter().top - 30;
  const isDark = currentBgColor === '#121212' || currentBgColor === '#1e1e24';
  const strokeColor = isDark ? '#ffffff' : '#000000';

  steps.forEach((step, idx) => {
    const x = startX + idx * 160;
    const y = startY;

    // Node Box
    const rect = new fabric.Rect({
      left: x,
      top: y,
      width: 110,
      height: 50,
      fill: isDark ? '#27272a' : '#e4e4e7',
      stroke: strokeColor,
      strokeWidth: 2,
      rx: 8,
      ry: 8
    });

    // Node Label
    const label = new fabric.Text(step, {
      left: x + 55,
      top: y + 25,
      fontSize: 12,
      fill: isDark ? '#ffffff' : '#000000',
      originX: 'center',
      originY: 'center'
    });

    const group = new fabric.Group([rect, label], {
      selectable: true,
      evented: true
    });

    canvas.add(group);

    // Connector Arrow
    if (idx < steps.length - 1) {
      const line = new fabric.Line([x + 110, y + 25, x + 160, y + 25], {
        stroke: strokeColor,
        strokeWidth: 2
      });

      const arrowHead = new fabric.Triangle({
        left: x + 160,
        top: y + 25,
        angle: 90,
        width: 8,
        height: 10,
        fill: strokeColor,
        originX: 'center',
        originY: 'center'
      });

      canvas.add(line);
      canvas.add(arrowHead);
    }
  });

  diagramModal.classList.remove('open');
  diagramInput.value = '';
  setMode('select');
  pushState();
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
  const jsonStr = JSON.stringify(canvas.toJSON(['isEraserStroke']));
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
      canvas.loadFromJSON(evt.target.result, () => {
        canvas.renderAll();
        updateCanvasBackground();
        pushState();
      });
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
