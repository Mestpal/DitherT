/* ═══════════════════════════════════════════
   DITHER TOOL — script.js
   Version: 5.0
   ═══════════════════════════════════════════ */

'use strict';

// ─────────────────────────────────────────
// 0.  I18N  — apply LANG strings to the DOM
// ─────────────────────────────────────────
function applyLang() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (LANG[key] !== undefined) el.textContent = LANG[key];
  });
  document.querySelectorAll('[data-i18n-tip]').forEach(el => {
    const key = el.dataset.i18nTip;
    if (LANG[key] !== undefined) el.dataset.tip = LANG[key];
  });
  // Highlight-level select options
  const hlSel = document.getElementById('hlSelect');
  if (hlSel) {
    Array.from(hlSel.options).forEach((opt, i) => {
      if (LANG.hlLevel && LANG.hlLevel[i]) opt.textContent = LANG.hlLevel[i];
    });
  }
  // Dither mode options
  const modeMap = {
    ordered:   'modeOrdered',
    floyd:     'modeFloyd',
    threshold: 'modeThreshold',
    random:    'modeRandom',
  };
  const modeSel = document.getElementById('ditherMode');
  if (modeSel) {
    Array.from(modeSel.options).forEach(opt => {
      const k = modeMap[opt.value];
      if (k && LANG[k]) opt.textContent = LANG[k];
    });
  }
  // Drop message (has colored spans inside)
  const dropEl = document.getElementById('dropMsgText');
  if (dropEl && LANG.dropMsg) {
    dropEl.innerHTML = LANG.dropMsg
      .replace('{image}', `<span>${LANG.dropMsgImage}</span>`)
      .replace('{video}',  `<span>${LANG.dropMsgVideo}</span>`);
  }
}

// Language switcher
function setLanguage(code) {
  // Dynamically load the language file by creating a script tag
  const existing = document.getElementById('langScript');
  if (existing) existing.remove();
  const s = document.createElement('script');
  s.id  = 'langScript';
  s.src = code + '.js';
  s.onload = () => { applyLang(); rebuildDynamicUI(); };
  document.head.appendChild(s);

  document.querySelectorAll('.lang-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.lang === code)
  );
  localStorage.setItem('ditherLang', code);
}

// ─────────────────────────────────────────
// 1.  TOOLTIP
// ─────────────────────────────────────────
const tooltipEl = document.getElementById('tooltip');

function bindTooltips() {
  document.querySelectorAll('.info-icon').forEach(icon => {
    icon.addEventListener('mouseenter', e => {
      tooltipEl.textContent = icon.dataset.tip || '';
      tooltipEl.classList.add('visible');
      positionTooltip(e);
    });
    icon.addEventListener('mousemove', positionTooltip);
    icon.addEventListener('mouseleave', () => tooltipEl.classList.remove('visible'));
  });
}

function positionTooltip(e) {
  const pad = 14;
  let x = e.clientX + pad;
  let y = e.clientY - 10;
  if (x + 185 > window.innerWidth)  x = e.clientX - 185 - pad;
  if (y + 90  > window.innerHeight) y = window.innerHeight - 95;
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

let sourceImg  = null;
let dithCanvasSz = 360;   // ONLY the dithered canvas — original/crop stay at their own size
let isVideo    = false;
let vidAnimFrame = null;

// crop state
let cropRatio    = null;
let cropOffX     = 0, cropOffY = 0;
let cropScale    = 1;
let cropDragging = false;
let cropDragStartX = 0, cropDragStartY = 0;
let cropDragOX = 0, cropDragOY = 0;

// ─────────────────────────────────────────
// 3.  DEBOUNCED RENDER
//     While the timer is running, all sliders
//     are disabled (pointer-events blocked).
// ─────────────────────────────────────────
let renderDebounceTimer = null;
const RENDER_DEBOUNCE_MS = 3000;
let renderLocked = false;

const origCanvas   = document.getElementById('origCanvas');
const dithCanvas   = document.getElementById('dithCanvas');
const cropCanvas   = document.getElementById('cropCanvas');
const tempCanvas   = document.getElementById('tempCanvas');
const videoEl      = document.getElementById('videoEl');
const renderLoader = document.getElementById('renderLoader');
const sidebarEl    = document.getElementById('sidebar');

function lockSidebar(on) {
  renderLocked = on;
  sidebarEl.classList.toggle('locked', on);
}

function scheduleRender() {
  if (renderLocked) return;
  clearTimeout(renderDebounceTimer);
  showLoader(true);
  lockSidebar(true);
  renderDebounceTimer = setTimeout(async () => {
    await render();
    showLoader(false);
    lockSidebar(false);
  }, RENDER_DEBOUNCE_MS);
}

function showLoader(on) {
  renderLoader.classList.toggle('visible', on);
  const lbl = document.getElementById('loaderLabel');
  if (lbl) lbl.textContent = LANG.loaderRendering || 'Rendering…';
}

function setLoaderText(txt) {
  const lbl = document.getElementById('loaderLabel');
  if (lbl) lbl.textContent = txt;
}

// ─────────────────────────────────────────
// 4.  SLIDER ↔ NUM-INPUT SYNC
// ─────────────────────────────────────────
function syncSlider(sliderId, numId) {
  document.getElementById(numId).value = document.getElementById(sliderId).value;
}

function syncNum(numId, sliderId) {
  const slider = document.getElementById(sliderId);
  const mn = +slider.min, mx = +slider.max, st = +slider.step || 1;
  let v = parseFloat(document.getElementById(numId).value);
  if (isNaN(v)) v = mn;
  v = Math.round((v - mn) / st) * st + mn;
  v = Math.min(mx, Math.max(mn, v));
  document.getElementById(numId).value = v;
  slider.value = v;
}

// ─────────────────────────────────────────
// 5.  A ↔ B ANIMATION SYSTEM
// ─────────────────────────────────────────
/*
  animState[sliderId] = {
    sliderId, numId,
    valFirst, valLast, durationSec,
    running, prerendering,
    rafId, direction, frames, frameIdx
  }
*/
const animState = {};
const ANIM_FRAME_COUNT = 20;

// Sliders that participate in global animate-all
const ANIMATED_SLIDERS = [
  { sliderId: 'gridRes',  numId: 'gridResNum'  },
  { sliderId: 'scaleMin', numId: 'scaleMinNum' },
  { sliderId: 'scaleMax', numId: 'scaleMaxNum' },
];

function getAnimState(sliderId, numId) {
  if (!animState[sliderId]) {
    const slider = document.getElementById(sliderId);
    animState[sliderId] = {
      sliderId, numId: numId || sliderId + 'Num',
      valFirst: +slider.min,
      valLast:  +slider.max,
      durationSec: 2,
      running: false, prerendering: false,
      rafId: null, direction: 1,
      frames: null, frameIdx: 0,
    };
  }
  return animState[sliderId];
}

async function startAnimation(sliderId, numId) {
  const st = getAnimState(sliderId, numId);
  if (st.running || st.prerendering) return;
  if (!sourceImg) { alert(LANG.alertNoImage || 'Load an image first.'); return; }

  st.prerendering = true;
  lockSidebar(true);
  renderLoader.classList.add('visible');

  const slider = document.getElementById(sliderId);
  const mn = +slider.min, mx = +slider.max, step = +slider.step || 1;
  const frames = [];

  for (let fi = 0; fi <= ANIM_FRAME_COUNT; fi++) {
    const t  = fi / ANIM_FRAME_COUNT;
    const tv = st.valFirst + (st.valLast - st.valFirst) * t;
    const v  = Math.min(mx, Math.max(mn, Math.round((tv - mn) / step) * step + mn));

    slider.value = v;
    document.getElementById(numId).value = v;

    const txt = (LANG.loaderFrame || 'Frame {n} / {total}')
      .replace('{n}', fi + 1).replace('{total}', ANIM_FRAME_COUNT + 1);
    setLoaderText(txt);

    const offC = document.createElement('canvas');
    offC.width = dithCanvasSz; offC.height = dithCanvasSz;
    await renderToCanvas(offC, getCropSource() || sourceImg, collectParams());
    frames.push({ canvas: offC, value: v });
    await new Promise(r => setTimeout(r, 0));
  }

  st.frames      = frames;
  st.frameIdx    = 0;
  st.direction   = 1;
  st.prerendering = false;
  st.running     = true;

  renderLoader.classList.remove('visible');
  lockSidebar(false);

  slider.classList.add('animating');

  const msPerFrame = (st.durationSec * 1000) / ANIM_FRAME_COUNT;

  function tick() {
    if (!st.running) return;
    const f = st.frames[st.frameIdx];
    dithCanvas.width  = f.canvas.width;
    dithCanvas.height = f.canvas.height;
    dithCanvas.getContext('2d').drawImage(f.canvas, 0, 0);
    slider.value = f.value;
    document.getElementById(numId).value = f.value;

    st.frameIdx += st.direction;
    if (st.frameIdx >= st.frames.length)  { st.frameIdx = st.frames.length - 1; st.direction = -1; }
    else if (st.frameIdx < 0)             { st.frameIdx = 0;                     st.direction =  1; }

    st.rafId = setTimeout(tick, msPerFrame);
  }
  tick();
}

function stopAnimation(sliderId) {
  const st = animState[sliderId];
  if (!st) return;
  st.running = false;
  clearTimeout(st.rafId);
  st.frames = null;
  document.getElementById(sliderId)?.classList.remove('animating');
}

// ── Global Start / Stop All ──────────────────
let allAnimRunning = false;

async function toggleAllAnimations() {
  const btn = document.getElementById('animAllBtn');

  if (allAnimRunning) {
    // Stop everything
    ANIMATED_SLIDERS.forEach(s => stopAnimation(s.sliderId));
    allAnimRunning = false;
    btn.textContent = LANG.animStartAll || '▶ Start all animations';
    btn.classList.remove('running');
  } else {
    allAnimRunning = true;
    btn.textContent = LANG.animStopAll || '■ Stop all animations';
    btn.classList.add('running');

    // Read panel values into state before starting
    ANIMATED_SLIDERS.forEach(({ sliderId, numId }) => {
      const st = getAnimState(sliderId, numId);
      const fEl = document.getElementById('animFirst_' + sliderId);
      const lEl = document.getElementById('animLast_'  + sliderId);
      const sEl = document.getElementById('animSpd_'   + sliderId);
      const slider = document.getElementById(sliderId);
      const mn = +slider.min, mx = +slider.max;
      if (fEl) st.valFirst     = Math.min(mx, Math.max(mn, +fEl.value || mn));
      if (lEl) st.valLast      = Math.min(mx, Math.max(mn, +lEl.value || mx));
      if (sEl) st.durationSec  = Math.max(0.2, +sEl.value || 2);
    });

    // Start all in parallel
    await Promise.all(ANIMATED_SLIDERS.map(({ sliderId, numId }) => startAnimation(sliderId, numId)));
  }
}

// ── Anim-panel expand/collapse ───────────────
function toggleAnimPanel(sliderId) {
  const panel = document.getElementById('animPanel_' + sliderId);
  panel.classList.toggle('open');
  const arrow = document.getElementById('animArrow_' + sliderId);
  if (arrow) arrow.textContent = panel.classList.contains('open') ? '▲' : '▼';
}

// ─────────────────────────────────────────
// 6.  HIGHLIGHT COLOURS
// ─────────────────────────────────────────
function buildHlStrip() {
  const strip = document.getElementById('highlightStrip');
  strip.innerHTML = '';
  hlColors.forEach((c, i) => {
    const s = document.createElement('div');
    s.className = 'highlight-swatch'; s.style.background = c;
    s.title = (LANG.hlLevel && LANG.hlLevel[i]) || `Level ${i+1}`;
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
// 7.  SVG SLOTS
// ─────────────────────────────────────────
function buildSvgSlots() {
  const cont = document.getElementById('svgSlots'); cont.innerHTML = '';
  for (let i = 0; i < N; i++) {
    const slot = document.createElement('div');
    slot.className = 'svg-slot'; slot.id = `slot_${i}`;
    slot.innerHTML = `<span class="slot-label">${(LANG.svgSlotLabel||'SVG')} ${i+1}</span><div class="slot-preview" id="prev_${i}"></div>`;
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
  document.getElementById('activeSlotLabel').textContent = `${LANG.slotLabel||'slot'} ${i+1}`;
  if (!svgData[i]) document.getElementById(`svgInp_${i}`).click();
}
function loadSvg(e, i) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = ev => { svgData[i] = ev.target.result; renderSlotPreview(i); scheduleRender(); };
  r.readAsText(f);
}
function renderSlotPreview(i) {
  if (!svgData[i]) return;
  const colored = recolorSvg(svgData[i], svgColors[i]);
  const blob = new Blob([colored], { type: 'image/svg+xml' });
  document.getElementById(`prev_${i}`).innerHTML =
    `<img src="${URL.createObjectURL(blob)}" width="28" height="28" style="display:block">`;
}
function recolorSvg(svgStr, color) {
  return svgStr.replace(/fill="[^"]*"/g, `fill="${color}"`).replace(/fill:[^;}"']*/g, `fill:${color}`);
}
function updateSvgColor(val) {
  if (activeSlot < 0) return;
  svgColors[activeSlot] = val; renderSlotPreview(activeSlot); scheduleRender();
}

// ─────────────────────────────────────────
// 8.  UI TOGGLES
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

// canvasSize only resizes the DITHERED canvas
function updateCanvasSize(v) {
  dithCanvasSz = +v;
  if (sourceImg) scheduleRender();
}

// ─────────────────────────────────────────
// 9.  MEDIA LOADING
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
  document.getElementById('dropZone').style.display   = 'none';
  document.getElementById('previewWrapper').style.display = 'flex';
  document.getElementById('cropBar').classList.add('visible');
}
function togglePlay() {
  if (videoEl.paused) { videoEl.play(); liveLoop(); }
  else { videoEl.pause(); cancelAnimationFrame(vidAnimFrame); }
}
function liveLoop() { grabVideoFrame(); render(); vidAnimFrame = requestAnimationFrame(liveLoop); }
function captureFrame() { videoEl.pause(); cancelAnimationFrame(vidAnimFrame); grabVideoFrame(); scheduleRender(); }
function grabVideoFrame() {
  const w = videoEl.videoWidth || 640, h = videoEl.videoHeight || 360;
  tempCanvas.width = w; tempCanvas.height = h;
  tempCanvas.getContext('2d').drawImage(videoEl, 0, 0);
  const img = new Image(); img.src = tempCanvas.toDataURL(); sourceImg = img;
}

// ─────────────────────────────────────────
// 10. CROP / ASPECT RATIO
// ─────────────────────────────────────────
const RATIOS = { free: null, '1:1': [1,1], '4:5': [4,5], '5:4': [5,4], '16:9': [16,9], '9:16': [9,16] };
const CROP_DISPLAY_SZ = 320;  // crop canvas is always fixed — independent of canvasSize

function resetCrop() { cropOffX = 0; cropOffY = 0; cropScale = 1; }

function setRatio(key, btn) {
  document.querySelectorAll('.ratio-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  cropRatio = RATIOS[key];
  resetCrop();
  document.getElementById('cropBox').style.display = key === 'free' ? 'none' : '';
  drawCropCanvas();
  scheduleRender();
}

function getCropSource() {
  if (!sourceImg || !cropRatio) return sourceImg;
  const [rw, rh] = cropRatio;
  const iw = sourceImg.naturalWidth  || sourceImg.width;
  const ih = sourceImg.naturalHeight || sourceImg.height;
  let cw, ch;
  if (iw / ih > rw / rh) { ch = ih * cropScale; cw = ch * (rw / rh); }
  else                    { cw = iw * cropScale; ch = cw * (rh / rw); }
  cw = Math.round(cw); ch = Math.round(ch);
  const offX = Math.round((iw - cw) / 2 + cropOffX);
  const offY = Math.round((ih - ch) / 2 + cropOffY);
  const oc = document.createElement('canvas');
  oc.width = cw; oc.height = ch;
  oc.getContext('2d').drawImage(sourceImg, offX, offY, cw, ch, 0, 0, cw, ch);
  return oc;
}

function drawCropCanvas() {
  if (!sourceImg) return;
  const sz = CROP_DISPLAY_SZ;
  cropCanvas.width = sz; cropCanvas.height = sz;
  const ctx = cropCanvas.getContext('2d');
  ctx.clearRect(0, 0, sz, sz);
  const iw = sourceImg.naturalWidth  || sourceImg.width;
  const ih = sourceImg.naturalHeight || sourceImg.height;

  if (!cropRatio) { ctx.drawImage(sourceImg, 0, 0, sz, sz); return; }

  const [rw, rh] = cropRatio;
  let rectW, rectH;
  if (rw >= rh) { rectW = sz; rectH = sz * (rh / rw); }
  else          { rectH = sz; rectW = sz * (rw / rh); }
  const rectX = (sz - rectW) / 2, rectY = (sz - rectH) / 2;

  const scaleImg = (iw / ih > rw / rh) ? ih / rectH * cropScale : iw / rectW * cropScale;
  const srcW = rectW * scaleImg, srcH = rectH * scaleImg;
  const srcX = (iw - srcW) / 2 - cropOffX * scaleImg;
  const srcY = (ih - srcH) / 2 - cropOffY * scaleImg;

  // dimmed full image behind
  ctx.globalAlpha = 0.3;
  const fs = Math.min(sz / iw, sz / ih);
  ctx.drawImage(sourceImg, (sz - iw*fs)/2, (sz - ih*fs)/2, iw*fs, ih*fs);
  ctx.globalAlpha = 1;

  // bright crop area
  ctx.save();
  ctx.beginPath(); ctx.rect(rectX, rectY, rectW, rectH); ctx.clip();
  ctx.drawImage(sourceImg, srcX, srcY, srcW, srcH, rectX, rectY, rectW, rectH);
  ctx.restore();

  // border
  ctx.strokeStyle = 'rgba(224,255,79,0.8)'; ctx.lineWidth = 1;
  ctx.strokeRect(rectX+.5, rectY+.5, rectW-1, rectH-1);

  // rule-of-thirds
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = .5;
  for (let i = 1; i < 3; i++) {
    ctx.beginPath(); ctx.moveTo(rectX+rectW*i/3, rectY); ctx.lineTo(rectX+rectW*i/3, rectY+rectH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rectX, rectY+rectH*i/3); ctx.lineTo(rectX+rectW, rectY+rectH*i/3); ctx.stroke();
  }
}

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
cropCanvas.addEventListener('wheel', e => {
  if (!cropRatio) return;
  e.preventDefault();
  cropScale = Math.max(0.2, Math.min(3, cropScale - e.deltaY * 0.001));
  drawCropCanvas(); scheduleRender();
}, { passive: false });

// ─────────────────────────────────────────
// 11. COLLECT PARAMS
// ─────────────────────────────────────────
function collectParams() {
  return {
    grid:     +document.getElementById('gridRes').value,
    mode:     document.getElementById('ditherMode').value,
    bgColor:  document.getElementById('bgColor').value,
    scaleMin: +document.getElementById('scaleMin').value / 100,
    scaleMax: +document.getElementById('scaleMax').value / 100,
    rotation, inverted,
    hlColors: [...hlColors],
  };
}

// ─────────────────────────────────────────
// 12. RENDER ENGINE
// ─────────────────────────────────────────
const BAYER4 = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];

async function getSvgImg(idx) {
  return new Promise(resolve => {
    if (!svgData[idx]) { resolve(null); return; }
    const colored = recolorSvg(svgData[idx], svgColors[idx]);
    const blob = new Blob([colored], { type: 'image/svg+xml' });
    const img  = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(blob);
  });
}

async function renderToCanvas(canvas, srcImg, params) {
  const { grid, mode, bgColor, scaleMin, scaleMax, rotation: rot, inverted: inv, hlColors: colors } = params;
  const sz = canvas.width;
  const cols = Math.ceil(sz / grid), rows = Math.ceil(sz / grid);

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
      const px = col*grid, py = row*grid;
      const cx = Math.min(px + Math.floor(grid/2), sz-1);
      const cy = Math.min(py + Math.floor(grid/2), sz-1);
      let L = lumCopy[cy*sz+cx];

      if (mode === 'threshold') { L = L > 128 ? 255 : 0; }
      else if (mode === 'random')  { L = Math.min(255, Math.max(0, L+(Math.random()-.5)*64)); }
      else if (mode === 'ordered') { const bv=BAYER4[row%4][col%4]/16; L=Math.min(255,Math.max(0,L+(bv-.5)*80)); }

      if (inv) L = 255 - L;
      const hlIdx   = Math.min(6, Math.floor(L / (256/7)));
      const t       = L / 255;
      const scaledT = scaleMin + t * (scaleMax - scaleMin);
      const cellSz  = grid * Math.min(scaleMax, Math.max(scaleMin, scaledT));

      dctx.save();
      dctx.translate(px+grid/2, py+grid/2);
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
  const cropSrc = getCropSource() || sourceImg;

  // Original canvas: natural size of the cropped source, not affected by canvasSize slider
  const srcW = cropSrc.naturalWidth  || cropSrc.width  || 640;
  const srcH = cropSrc.naturalHeight || cropSrc.height || 480;
  const ORIG_MAX = 320;
  const origScale = Math.min(1, ORIG_MAX / Math.max(srcW, srcH));
  origCanvas.width  = Math.round(srcW * origScale);
  origCanvas.height = Math.round(srcH * origScale);
  origCanvas.getContext('2d').drawImage(cropSrc, 0, 0, origCanvas.width, origCanvas.height);

  // Dithered canvas: uses dithCanvasSz (from canvasSize slider)
  dithCanvas.width  = dithCanvasSz;
  dithCanvas.height = dithCanvasSz;
  await renderToCanvas(dithCanvas, cropSrc, collectParams());

  drawCropCanvas();
}

// ─────────────────────────────────────────
// 13. DRAG & DROP
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
// 14. REBUILD DYNAMIC UI (after lang change)
// ─────────────────────────────────────────
function rebuildDynamicUI() {
  buildHlStrip();
  buildSvgSlots();
  updateHlPicker();
  bindTooltips();
}

// ─────────────────────────────────────────
// 15. INIT
// ─────────────────────────────────────────
(function init() {
  const saved = localStorage.getItem('ditherLang') || 'EN';
  // Language file is already loaded via <script> in HTML (default EN).
  // If saved preference differs, reload it.
  if (saved !== 'EN') {
    setLanguage(saved);
  } else {
    applyLang();
    rebuildDynamicUI();
  }
})();
