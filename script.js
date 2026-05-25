/* ═══════════════════════════════════════════
   DITHER TOOL — script.js
   ═══════════════════════════════════════════ */

'use strict';

// ─────────────────────────────────────────
// 1.  TOOLTIP (body-level, never clipped)
// ─────────────────────────────────────────
const tooltipEl = document.getElementById('tooltip');

document.querySelectorAll('.info-icon').forEach(icon => {
  icon.addEventListener('mouseenter', e => {
    tooltipEl.textContent = icon.dataset.tip;
    tooltipEl.classList.add('visible');
    positionTooltip(e);
  });
  icon.addEventListener('mousemove', positionTooltip);
  icon.addEventListener('mouseleave', () => tooltipEl.classList.remove('visible'));
});

function positionTooltip(e) {
  const pad = 12;
  let x = e.clientX + pad;
  let y = e.clientY - 10;
  // keep inside viewport
  if (x + 180 > window.innerWidth)  x = e.clientX - 180 - pad;
  if (y + 80  > window.innerHeight) y = window.innerHeight - 90;
  tooltipEl.style.left = x + 'px';
  tooltipEl.style.top  = y + 'px';
}

// ─────────────────────────────────────────
// 2.  GLOBAL STATE
// ─────────────────────────────────────────
const N = 7;
let hlColors  = ['#111111','#2d2d2d','#555555','#808080','#aaaaaa','#d4d4d4','#ffffff'];
let svgData   = Array(N).fill(null);
let svgColors = ['#ffffff','#e0ff4f','#ff4f9b','#4fffff','#ff9f4f','#9f4fff','#4fff9f'];
let activeSlot = -1;
let rotation   = 0;
let inverted   = false;
let showOrig   = true;

let sourceImg  = null;   // original Image object
let canvasSz   = 360;
let isVideo    = false;
let animFrame  = null;

// crop state
let cropRatio   = null;   // null = free / [w,h] tuple
let cropOffX    = 0;
let cropOffY    = 0;
let cropScale   = 1;      // how much to scale the source into the crop rect
let cropDragging= false;
let cropDragStartX = 0, cropDragStartY = 0;
let cropDragOX = 0, cropDragOY = 0;

// debounce render
let renderDebounceTimer = null;
const RENDER_DEBOUNCE_MS = 3000;

// ─────────────────────────────────────────
// 3.  DOM REFS
// ─────────────────────────────────────────
const origCanvas  = document.getElementById('origCanvas');
const dithCanvas  = document.getElementById('dithCanvas');
const cropCanvas  = document.getElementById('cropCanvas');
const tempCanvas  = document.getElementById('tempCanvas');
const videoEl     = document.getElementById('videoEl');
const renderLoader= document.getElementById('renderLoader');

// ─────────────────────────────────────────
// 4.  SLIDER ↔ NUM-INPUT SYNC
// ─────────────────────────────────────────
/**
 * Call after a range input changes.
 * sliderId → numId are the element ids.
 */
function syncSlider(sliderId, numId) {
  const v = +document.getElementById(sliderId).value;
  document.getElementById(numId).value = v;
}

/**
 * Call after a number input changes.
 * Clamps to the slider's own min/max and writes back both elements.
 */
function syncNum(numId, sliderId) {
  const slider = document.getElementById(sliderId);
  const mn = +slider.min, mx = +slider.max, st = +slider.step || 1;
  let v = parseFloat(document.getElementById(numId).value);
  if (isNaN(v)) v = mn;
  // round to step
  v = Math.round((v - mn) / st) * st + mn;
  v = Math.min(mx, Math.max(mn, v));
  document.getElementById(numId).value = v;
  slider.value = v;
}

// ─────────────────────────────────────────
// 5.  DEBOUNCED RENDER
// ─────────────────────────────────────────
function scheduleRender() {
  clearTimeout(renderDebounceTimer);
  showLoader(true);
  renderDebounceTimer = setTimeout(() => {
    render().then(() => showLoader(false));
  }, RENDER_DEBOUNCE_MS);
}

function showLoader(on) {
  renderLoader.classList.toggle('visible', on);
}

// ─────────────────────────────────────────
// 6.  A↔B ANIMATION SYSTEM
// ─────────────────────────────────────────
/*
  Each animated slider has an entry in animState:
    {
      sliderId, numId,
      valA, valB, durationSec,
      running: bool,
      rafId: null | int,
      startTime: null | DOMHighResTimeStamp,
      direction: 1 | -1   (1 = A→B, -1 = B→A)
      frames: [ {imageData, t} ] | null  — pre-rendered frames
      frameIdx: int
      prerendering: bool
    }
*/
const animState = {};

function getAnimState(sliderId) {
  if (!animState[sliderId]) {
    const slider = document.getElementById(sliderId);
    animState[sliderId] = {
      sliderId,
      valA: +slider.min,
      valB: +slider.max,
      durationSec: 2,
      running: false,
      rafId: null,
      startTime: null,
      direction: 1,
      frames: null,
      frameIdx: 0,
      prerendering: false,
    };
  }
  return animState[sliderId];
}

async function startAnimation(sliderId, numId) {
  const st = getAnimState(sliderId);
  if (st.running || st.prerendering) return;
  if (!sourceImg) { alert('Load an image first.'); return; }

  st.prerendering = true;
  const btn = document.getElementById('animBtn_' + sliderId);
  if (btn) { btn.textContent = '⟳ Pre-rendering…'; btn.classList.add('running'); }

  // Pre-render frames
  const slider  = document.getElementById(sliderId);
  const mn = +slider.min, mx = +slider.max, step = +slider.step || 1;
  const frameCount = 20; // fixed number of interpolation frames
  const gifSz  = canvasSz;

  const frames = [];
  for (let fi = 0; fi <= frameCount; fi++) {
    const t  = fi / frameCount;
    const tv = st.valA + (st.valB - st.valA) * t;
    const v  = Math.min(mx, Math.max(mn, Math.round((tv - mn) / step) * step + mn));

    // Temporarily set slider value for render
    slider.value = v;
    document.getElementById(numId).value = v;

    const offC = document.createElement('canvas');
    offC.width = gifSz; offC.height = gifSz;

    const params = collectParams();
    await renderToCanvas(offC, getCropSource(), params);

    frames.push({ canvas: offC, value: v, t });
    await new Promise(r => setTimeout(r, 0)); // yield
  }

  st.frames     = frames;
  st.frameIdx   = 0;
  st.direction  = 1;
  st.prerendering = false;
  st.running    = true;

  if (btn) { btn.textContent = '■ Stop'; }

  const msPerFrame = (st.durationSec * 1000) / frameCount;

  function tick() {
    if (!st.running) return;

    const f = st.frames[st.frameIdx];
    // Display pre-rendered frame on dithCanvas
    const ctx = dithCanvas.getContext('2d');
    dithCanvas.width  = f.canvas.width;
    dithCanvas.height = f.canvas.height;
    ctx.drawImage(f.canvas, 0, 0);

    // Update slider UI
    slider.value = f.value;
    document.getElementById(numId).value = f.value;

    // Advance
    st.frameIdx += st.direction;
    if (st.frameIdx >= st.frames.length) {
      st.frameIdx = st.frames.length - 1;
      st.direction = -1;
    } else if (st.frameIdx < 0) {
      st.frameIdx = 0;
      st.direction = 1;
    }

    st.rafId = setTimeout(tick, msPerFrame);
  }

  tick();

  // Mark slider as animating
  const rangeEl = document.getElementById(sliderId);
  rangeEl.classList.add('animating');
}

function stopAnimation(sliderId, numId) {
  const st = animState[sliderId];
  if (!st) return;
  st.running = false;
  clearTimeout(st.rafId);
  st.frames = null;

  const rangeEl = document.getElementById(sliderId);
  if (rangeEl) rangeEl.classList.remove('animating');

  const btn = document.getElementById('animBtn_' + sliderId);
  if (btn) { btn.textContent = '▶ Start'; btn.classList.remove('running'); }
}

function toggleAnimation(sliderId, numId) {
  const st = getAnimState(sliderId);
  if (st.running || st.prerendering) {
    stopAnimation(sliderId, numId);
  } else {
    startAnimation(sliderId, numId);
  }
}

// Read A/B/speed from the panel inputs and store in state
function updateAnimParam(sliderId, param, inputId) {
  const st = getAnimState(sliderId);
  const v = parseFloat(document.getElementById(inputId).value);
  if (!isNaN(v)) {
    const slider = document.getElementById(sliderId);
    const mn = +slider.min, mx = +slider.max;
    if (param === 'valA') st.valA = Math.min(mx, Math.max(mn, v));
    if (param === 'valB') st.valB = Math.min(mx, Math.max(mn, v));
    if (param === 'durationSec') st.durationSec = Math.max(0.2, v);
  }
}

// ─────────────────────────────────────────
// 7.  ANIM-PANEL TOGGLE (expand/collapse)
// ─────────────────────────────────────────
function toggleAnimPanel(sliderId) {
  const panel = document.getElementById('animPanel_' + sliderId);
  panel.classList.toggle('open');
  const arrow = document.getElementById('animArrow_' + sliderId);
  if (arrow) arrow.textContent = panel.classList.contains('open') ? '▲' : '▼';
}

// ─────────────────────────────────────────
// 8.  HIGHLIGHT COLOURS
// ─────────────────────────────────────────
function buildHlStrip() {
  const strip = document.getElementById('highlightStrip');
  strip.innerHTML = '';
  hlColors.forEach((c, i) => {
    const s = document.createElement('div');
    s.className = 'highlight-swatch'; s.style.background = c; s.title = `Level ${i+1}`;
    s.onclick = () => { document.getElementById('hlSelect').value = i; updateHlPicker(); };
    strip.appendChild(s);
  });
}
function updateHlPicker() {
  document.getElementById('hlPicker').value = hlColors[+document.getElementById('hlSelect').value];
}
function setHlColor(val) {
  hlColors[+document.getElementById('hlSelect').value] = val;
  buildHlStrip(); scheduleRender();
}

// ─────────────────────────────────────────
// 9.  SVG SLOTS
// ─────────────────────────────────────────
function buildSvgSlots() {
  const cont = document.getElementById('svgSlots'); cont.innerHTML = '';
  for (let i = 0; i < N; i++) {
    const slot = document.createElement('div');
    slot.className = 'svg-slot'; slot.id = `slot_${i}`;
    slot.innerHTML = `<span class="slot-label">SVG ${i+1}</span><div class="slot-preview" id="prev_${i}"></div>`;
    slot.onclick = () => selectSlot(i);
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.svg,image/svg+xml'; inp.className = 'hidden'; inp.id = `svgInp_${i}`;
    inp.onchange = e => loadSvg(e, i);
    slot.appendChild(inp);
    slot.ondblclick = e => { e.stopPropagation(); inp.click(); };
    cont.appendChild(slot);
  }
}
function selectSlot(i) {
  activeSlot = i;
  document.querySelectorAll('.svg-slot').forEach((s, j) => s.classList.toggle('active', j === i));
  document.getElementById('activeSlotInfo').classList.remove('hidden');
  document.getElementById('svgColorPicker').value = svgColors[i];
  document.getElementById('activeSlotLabel').textContent = `slot ${i+1}`;
  if (!svgData[i]) document.getElementById(`svgInp_${i}`).click();
}
function loadSvg(e, i) {
  const f = e.target.files[0]; if (!f) return;
  const reader = new FileReader();
  reader.onload = ev => { svgData[i] = ev.target.result; renderSlotPreview(i); scheduleRender(); };
  reader.readAsText(f);
}
function renderSlotPreview(i) {
  if (!svgData[i]) return;
  const colored = recolorSvg(svgData[i], svgColors[i]);
  const blob = new Blob([colored], { type: 'image/svg+xml' });
  document.getElementById(`prev_${i}`).innerHTML =
    `<img src="${URL.createObjectURL(blob)}" width="28" height="28" style="display:block">`;
}
function recolorSvg(svgStr, color) {
  return svgStr
    .replace(/fill="[^"]*"/g, `fill="${color}"`)
    .replace(/fill:[^;}"']*/g, `fill:${color}`);
}
function updateSvgColor(val) {
  if (activeSlot < 0) return;
  svgColors[activeSlot] = val; renderSlotPreview(activeSlot); scheduleRender();
}

// ─────────────────────────────────────────
// 10. UI TOGGLES
// ─────────────────────────────────────────
function toggleOrig(el) {
  el.classList.toggle('on'); showOrig = el.classList.contains('on');
  document.getElementById('origBox').style.display = showOrig ? '' : 'none';
}
function toggleInvert(el) {
  el.classList.toggle('on'); inverted = el.classList.contains('on'); scheduleRender();
}
function setRot(deg, btn) {
  rotation = deg;
  document.querySelectorAll('.rot-btn').forEach(b => b.classList.remove('active-rot'));
  btn.classList.add('active-rot'); scheduleRender();
}
function updateCanvasSize(v) {
  canvasSz = +v; if (sourceImg) scheduleRender();
}

// ─────────────────────────────────────────
// 11. MEDIA LOADING
// ─────────────────────────────────────────
function loadMedia(inp) {
  const f = inp.files[0]; if (!f) return;
  const url = URL.createObjectURL(f);
  if (f.type.startsWith('video/')) {
    isVideo = true; videoEl.src = url;
    videoEl.onloadeddata = () => {
      document.getElementById('videoCtrl').classList.remove('hidden');
      grabVideoFrame(); showPreviews();
    };
    videoEl.load();
  } else {
    isVideo = false; document.getElementById('videoCtrl').classList.add('hidden');
    const img = new Image();
    img.onload = () => { sourceImg = img; resetCrop(); showPreviews(); scheduleRender(); };
    img.src = url;
  }
}
function showPreviews() {
  document.getElementById('dropZone').style.display  = 'none';
  document.getElementById('previewWrapper').style.display = 'flex';
  document.getElementById('cropBar').classList.add('visible');
}
function togglePlay() {
  if (videoEl.paused) { videoEl.play(); liveLoop(); }
  else { videoEl.pause(); cancelAnimationFrame(animFrame); }
}
function liveLoop() { grabVideoFrame(); render(); animFrame = requestAnimationFrame(liveLoop); }
function captureFrame() { videoEl.pause(); cancelAnimationFrame(animFrame); grabVideoFrame(); scheduleRender(); }
function grabVideoFrame() {
  const w = videoEl.videoWidth || 640, h = videoEl.videoHeight || 360;
  tempCanvas.width = w; tempCanvas.height = h;
  tempCanvas.getContext('2d').drawImage(videoEl, 0, 0);
  const img = new Image(); img.src = tempCanvas.toDataURL(); sourceImg = img;
}

// ─────────────────────────────────────────
// 12. CROP / ASPECT RATIO SYSTEM
// ─────────────────────────────────────────
const RATIOS = {
  'free':  null,
  '1:1':   [1, 1],
  '4:5':   [4, 5],
  '5:4':   [5, 4],
  '16:9':  [16, 9],
  '9:16':  [9, 16],
};

function resetCrop() {
  cropOffX = 0; cropOffY = 0; cropScale = 1;
}

function setRatio(key, btn) {
  document.querySelectorAll('.ratio-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  cropRatio = RATIOS[key];
  resetCrop();
  drawCropCanvas();
}

// Returns an ImageBitmap or OffscreenCanvas cropped/scaled from sourceImg
// according to current cropRatio, cropOffX/Y, cropScale.
function getCropSource() {
  if (!sourceImg) return null;
  if (!cropRatio) return sourceImg;   // free = use full image

  const [rw, rh] = cropRatio;
  const iw = sourceImg.naturalWidth  || sourceImg.width;
  const ih = sourceImg.naturalHeight || sourceImg.height;

  // Compute crop rect in image-space
  let cw, ch;
  if (iw / ih > rw / rh) {
    ch = ih * cropScale;
    cw = ch * (rw / rh);
  } else {
    cw = iw * cropScale;
    ch = cw * (rh / rw);
  }
  cw = Math.round(cw); ch = Math.round(ch);

  const offX = Math.round((iw - cw) / 2 + cropOffX);
  const offY = Math.round((ih - ch) / 2 + cropOffY);

  const oc = document.createElement('canvas');
  oc.width  = cw; oc.height = ch;
  oc.getContext('2d').drawImage(sourceImg, offX, offY, cw, ch, 0, 0, cw, ch);
  return oc;
}

// Draw the crop preview in the cropCanvas
function drawCropCanvas() {
  if (!sourceImg) return;

  const displaySz = canvasSz;
  cropCanvas.width  = displaySz;
  cropCanvas.height = displaySz;
  const ctx = cropCanvas.getContext('2d');
  ctx.clearRect(0, 0, displaySz, displaySz);

  const iw = sourceImg.naturalWidth  || sourceImg.width;
  const ih = sourceImg.naturalHeight || sourceImg.height;

  if (!cropRatio) {
    // Draw full image stretched to canvas
    ctx.drawImage(sourceImg, 0, 0, displaySz, displaySz);
    return;
  }

  const [rw, rh] = cropRatio;

  // How big is the crop rect on screen?
  let rectW, rectH;
  if (rw >= rh) { rectW = displaySz; rectH = displaySz * (rh / rw); }
  else          { rectH = displaySz; rectW = displaySz * (rw / rh); }
  const rectX = (displaySz - rectW) / 2;
  const rectY = (displaySz - rectH) / 2;

  // Scale factor: image pixels per screen pixel
  const scaleImg = (iw / ih > rw / rh)
    ? ih / rectH * cropScale
    : iw / rectW * cropScale;

  // Source rect
  const srcW = rectW * scaleImg;
  const srcH = rectH * scaleImg;
  const srcX = (iw - srcW) / 2 - cropOffX * scaleImg;
  const srcY = (ih - srcH) / 2 - cropOffY * scaleImg;

  // Darken outside crop area — draw full image dimmed
  ctx.globalAlpha = 0.3;
  const fitScale = Math.min(displaySz / iw, displaySz / ih);
  const fitW = iw * fitScale, fitH = ih * fitScale;
  ctx.drawImage(sourceImg, (displaySz-fitW)/2, (displaySz-fitH)/2, fitW, fitH);
  ctx.globalAlpha = 1;

  // Draw crop area bright
  ctx.save();
  ctx.beginPath();
  ctx.rect(rectX, rectY, rectW, rectH);
  ctx.clip();
  ctx.drawImage(sourceImg, srcX, srcY, srcW, srcH, rectX, rectY, rectW, rectH);
  ctx.restore();

  // Crop border
  ctx.strokeStyle = 'rgba(224,255,79,0.8)';
  ctx.lineWidth   = 1;
  ctx.strokeRect(rectX + 0.5, rectY + 0.5, rectW - 1, rectH - 1);

  // Rule-of-thirds grid
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 0.5;
  for (let i = 1; i < 3; i++) {
    ctx.beginPath(); ctx.moveTo(rectX + rectW*i/3, rectY); ctx.lineTo(rectX + rectW*i/3, rectY+rectH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rectX, rectY + rectH*i/3); ctx.lineTo(rectX+rectW, rectY + rectH*i/3); ctx.stroke();
  }
}

// Drag to pan
cropCanvas.addEventListener('mousedown', e => {
  if (!cropRatio) return;
  cropDragging = true;
  cropDragStartX = e.clientX; cropDragStartY = e.clientY;
  cropDragOX = cropOffX; cropDragOY = cropOffY;
});
window.addEventListener('mousemove', e => {
  if (!cropDragging) return;
  cropOffX = cropDragOX + (e.clientX - cropDragStartX);
  cropOffY = cropDragOY + (e.clientY - cropDragStartY);
  drawCropCanvas();
});
window.addEventListener('mouseup', () => {
  if (cropDragging) { cropDragging = false; scheduleRender(); }
});

// Pinch/scroll to zoom crop
cropCanvas.addEventListener('wheel', e => {
  if (!cropRatio) return;
  e.preventDefault();
  cropScale = Math.max(0.2, Math.min(3, cropScale - e.deltaY * 0.001));
  drawCropCanvas(); scheduleRender();
}, { passive: false });

// ─────────────────────────────────────────
// 13. COLLECT PARAMS HELPER
// ─────────────────────────────────────────
function collectParams() {
  return {
    grid:     +document.getElementById('gridRes').value,
    mode:     document.getElementById('ditherMode').value,
    bgColor:  document.getElementById('bgColor').value,
    scaleMin: +document.getElementById('scaleMin').value / 100,
    scaleMax: +document.getElementById('scaleMax').value / 100,
    rotation,
    inverted,
    hlColors: [...hlColors],
  };
}

// ─────────────────────────────────────────
// 14. RENDER ENGINE
// ─────────────────────────────────────────
const BAYER4 = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];

async function getSvgImg(idx) {
  return new Promise(resolve => {
    if (!svgData[idx]) { resolve(null); return; }
    const colored = recolorSvg(svgData[idx], svgColors[idx]);
    const blob    = new Blob([colored], { type: 'image/svg+xml' });
    const img     = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(blob);
  });
}

async function renderToCanvas(canvas, srcImg, params) {
  const { grid, mode, bgColor, scaleMin, scaleMax, rotation: rot, inverted: inv, hlColors: colors } = params;
  const sz   = canvas.width;
  const cols = Math.ceil(sz / grid);
  const rows = Math.ceil(sz / grid);

  // sample luminance from source
  const tc = document.createElement('canvas'); tc.width = sz; tc.height = sz;
  const tctx = tc.getContext('2d'); tctx.drawImage(srcImg, 0, 0, sz, sz);
  const pd  = tctx.getImageData(0, 0, sz, sz).data;
  const lum = new Float32Array(sz * sz);
  for (let i = 0; i < sz * sz; i++)
    lum[i] = 0.299*pd[i*4] + 0.587*pd[i*4+1] + 0.114*pd[i*4+2];

  const dctx = canvas.getContext('2d');
  dctx.fillStyle = bgColor; dctx.fillRect(0, 0, sz, sz);

  const svgImgs = await Promise.all(Array.from({ length: N }, (_, i) => getSvgImg(i)));
  const anySvg  = svgImgs.some(Boolean);
  const lumCopy = Float32Array.from(lum);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const px = col * grid, py = row * grid;
      const cx = Math.min(px + Math.floor(grid / 2), sz - 1);
      const cy = Math.min(py + Math.floor(grid / 2), sz - 1);
      let L = lumCopy[cy * sz + cx];

      if (mode === 'threshold') { L = L > 128 ? 255 : 0; }
      else if (mode === 'random')   { L = Math.min(255, Math.max(0, L + (Math.random()-0.5)*64)); }
      else if (mode === 'ordered')  { const bv = BAYER4[row%4][col%4]/16; L = Math.min(255, Math.max(0, L+(bv-0.5)*80)); }

      if (inv) L = 255 - L;
      const hlIdx   = Math.min(6, Math.floor(L / (256/7)));
      const t       = L / 255;
      const scaledT = scaleMin + t * (scaleMax - scaleMin);
      const cellSz  = grid * Math.min(scaleMax, Math.max(scaleMin, scaledT));

      dctx.save();
      dctx.translate(px + grid/2, py + grid/2);
      dctx.rotate(rot * Math.PI / 180);
      dctx.translate(-cellSz/2, -cellSz/2);

      if (anySvg && svgImgs[hlIdx]) { dctx.drawImage(svgImgs[hlIdx], 0, 0, cellSz, cellSz); }
      else { dctx.fillStyle = colors[hlIdx]; dctx.fillRect(0, 0, cellSz, cellSz); }
      dctx.restore();

      if (mode === 'floyd') {
        const qL  = Math.min(6, Math.floor(L/(256/7))) * (255/6);
        const err = (L - qL) / 16;
        for (const [dc, dr, w] of [[1,0,7],[1,1,5],[-1,1,3],[0,1,1]]) {
          const nc = col+dc, nr = row+dr;
          if (nc>=0 && nc<cols && nr>=0 && nr<rows) {
            const ni = (py+dr*grid)*sz + (px+dc*grid);
            if (ni>=0 && ni<lumCopy.length) lumCopy[ni] = Math.min(255, Math.max(0, lumCopy[ni]+err*w));
          }
        }
      }
    }
  }
}

async function render() {
  if (!sourceImg) return;
  const sz     = canvasSz;
  const cropSrc = getCropSource() || sourceImg;
  const params = collectParams();

  origCanvas.width  = sz; origCanvas.height = sz;
  dithCanvas.width  = sz; dithCanvas.height = sz;

  origCanvas.getContext('2d').drawImage(cropSrc, 0, 0, sz, sz);

  await renderToCanvas(dithCanvas, cropSrc, params);

  // keep crop canvas in sync
  drawCropCanvas();
}

// ─────────────────────────────────────────
// 15. DRAG & DROP
// ─────────────────────────────────────────
const ca = document.getElementById('canvasArea');
ca.addEventListener('dragover',  e => { e.preventDefault(); ca.classList.add('drop-over'); });
ca.addEventListener('dragleave', () => ca.classList.remove('drop-over'));
ca.addEventListener('drop', e => {
  e.preventDefault(); ca.classList.remove('drop-over');
  const f = e.dataTransfer.files[0];
  if (f) { const inp = document.getElementById('imgInput'); const dt = new DataTransfer(); dt.items.add(f); inp.files = dt.files; loadMedia(inp); }
});

// ─────────────────────────────────────────
// 16. INIT
// ─────────────────────────────────────────
buildHlStrip();
buildSvgSlots();
updateHlPicker();
