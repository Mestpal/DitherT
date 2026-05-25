/* ═══════════════════════════════════════════
   DITHER TOOL — script.js
   Version: 6.0
   ═══════════════════════════════════════════ */

'use strict';

// ─────────────────────────────────────────
// 0.  TRANSLATIONS
// ─────────────────────────────────────────
let LANG = {};

function applyLang() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (LANG[key] !== undefined) el.textContent = LANG[key];
  });
  document.querySelectorAll('[data-i18n-tip]').forEach(el => {
    const key = el.dataset.i18nTip;
    if (LANG[key] !== undefined) el.dataset.tip = LANG[key];
  });
  const hlSel = document.getElementById('hlSelect');
  if (hlSel && LANG.hlLevel) {
    Array.from(hlSel.options).forEach((opt, i) => {
      if (LANG.hlLevel[i]) opt.textContent = LANG.hlLevel[i];
    });
  }
  const modeMap = { ordered:'modeOrdered', floyd:'modeFloyd', threshold:'modeThreshold', random:'modeRandom' };
  const modeSel = document.getElementById('ditherMode');
  if (modeSel) {
    Array.from(modeSel.options).forEach(opt => {
      const k = modeMap[opt.value];
      if (k && LANG[k]) opt.textContent = LANG[k];
    });
  }
  const dropEl = document.getElementById('dropMsgText');
  if (dropEl && LANG.dropMsg) {
    dropEl.innerHTML = LANG.dropMsg
      .replace('{image}', `<span>${LANG.dropMsgImage || 'image'}</span>`)
      .replace('{video}',  `<span>${LANG.dropMsgVideo  || 'video'}</span>`);
  }
}

function setLanguage(code) {
  const dict = (window.LANGS || {})[code];
  if (!dict) { console.warn('Language not found:', code); return; }
  LANG = dict;
  document.querySelectorAll('.lang-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.lang === code)
  );
  try { localStorage.setItem('ditherLang', code); } catch(e) {}
  applyLang();
  rebuildDynamicUI();
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
  let x = e.clientX + pad, y = e.clientY - 10;
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

let sourceImg    = null;
let dithCanvasSz = 360;  // "long edge" size — height/width computed from ratio
let isVideo      = false;
let vidAnimFrame = null;

// crop / ratio state
let cropRatio    = null;   // null = free, or [rw, rh]
let cropOffX     = 0, cropOffY = 0;
let cropScale    = 1;
let cropDragging = false;
let cropDragStartX = 0, cropDragStartY = 0;
let cropDragOX = 0, cropDragOY = 0;

const RATIOS = { free: null, '1:1':[1,1], '4:5':[4,5], '5:4':[5,4], '16:9':[16,9], '9:16':[9,16] };
const CROP_DISPLAY_SZ = 300;
const ORIG_MAX        = 300;

// ─────────────────────────────────────────
// 3.  DOM REFS
// ─────────────────────────────────────────
const origCanvas   = document.getElementById('origCanvas');
const dithCanvas   = document.getElementById('dithCanvas');
const cropCanvas   = document.getElementById('cropCanvas');
const tempCanvas   = document.getElementById('tempCanvas');
const videoEl      = document.getElementById('videoEl');
const renderLoader = document.getElementById('renderLoader');
const sidebarEl    = document.getElementById('sidebar');

// ─────────────────────────────────────────
// 4.  RENDER — manual only (no auto-debounce)
//     Triggered only by "Render Now" button
//     or first image load.
// ─────────────────────────────────────────
let renderLocked = false;

function lockSidebar(on) {
  renderLocked = on;
  sidebarEl.classList.toggle('locked', on);
}

function showLoader(on, text) {
  renderLoader.classList.toggle('visible', on);
  if (on) {
    const lbl = document.getElementById('loaderLabel');
    if (lbl) lbl.textContent = text || (LANG && LANG.loaderRendering) || 'Rendering…';
  }
}

async function triggerRender() {
  if (!sourceImg || renderLocked) return;
  lockSidebar(true);
  showLoader(true);
  try {
    await render();
  } catch(err) {
    console.error('Render error:', err);
  } finally {
    showLoader(false);
    lockSidebar(false);
  }
}

// ─────────────────────────────────────────
// 5.  SLIDER ↔ NUM-INPUT SYNC
//     Sliders no longer auto-trigger render.
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
// 6.  A ↔ B ANIMATION SYSTEM
// ─────────────────────────────────────────
/*
  Each slider that can animate is listed in ANIMATED_SLIDERS.
  The user enables it via a checkbox.
  When "Start all animations" is pressed:
    1. Read all checked sliders' First/Last/Secs values.
    2. globalDuration = max of all Secs values.
    3. Pre-render ANIM_FRAME_COUNT frames for EACH enabled slider
       (each frame = blend of all enabled sliders at time t).
    4. Play frames in a loop, each frame lasting globalDuration/ANIM_FRAME_COUNT ms.
       Individual sliders with shorter duration loop internally within that window.
*/

const ANIMATED_SLIDERS = [
  { sliderId: 'gridRes',  numId: 'gridResNum'  },
  { sliderId: 'scaleMin', numId: 'scaleMinNum' },
  { sliderId: 'scaleMax', numId: 'scaleMaxNum' },
];

const ANIM_FRAME_COUNT = 24;
let allAnimRunning  = false;
let animPlayTimer   = null;
let animFrames      = [];   // pre-rendered canvases [{canvas}]
let animFrameIdx    = 0;
let animDirection   = 1;
let animMsPerFrame  = 100;

// Read config for one slider from its panel UI
function readSliderAnimConfig(sliderId) {
  const slider  = document.getElementById(sliderId);
  const mn = +slider.min, mx = +slider.max;
  const fEl = document.getElementById('animFirst_' + sliderId);
  const lEl = document.getElementById('animLast_'  + sliderId);
  const sEl = document.getElementById('animSpd_'   + sliderId);
  const cbEl= document.getElementById('animCb_'    + sliderId);
  return {
    enabled:     cbEl  ? cbEl.checked : false,
    valFirst:    fEl   ? Math.min(mx, Math.max(mn, +fEl.value || mn)) : mn,
    valLast:     lEl   ? Math.min(mx, Math.max(mn, +lEl.value || mx)) : mx,
    durationSec: sEl   ? Math.max(0.2, +sEl.value || 2) : 2,
    min: mn, max: mx,
    step: +slider.step || 1,
  };
}

// Given global t in [0,1] and a slider config, return its value at that t
// The slider loops within its own duration if shorter than globalDuration
function sliderValueAtT(cfg, globalT, globalDuration) {
  const localCycles = globalDuration / cfg.durationSec;
  // local t in [0,1], bouncing (ping-pong)
  const raw = (globalT * localCycles) % 2;  // 0→2 repeating
  const localT = raw <= 1 ? raw : 2 - raw;   // ping-pong 0→1→0
  const tv = cfg.valFirst + (cfg.valLast - cfg.valFirst) * localT;
  return Math.min(cfg.max, Math.max(cfg.min,
    Math.round((tv - cfg.min) / cfg.step) * cfg.step + cfg.min));
}

async function startAllAnimations() {
  if (!sourceImg) { alert(LANG.alertNoImage || 'Load an image first.'); return; }

  const configs = {};
  const enabledSliders = [];
  let globalDuration = 0;

  for (const { sliderId, numId } of ANIMATED_SLIDERS) {
    const cfg = readSliderAnimConfig(sliderId);
    cfg.numId = numId;
    configs[sliderId] = cfg;
    if (cfg.enabled) {
      enabledSliders.push(sliderId);
      globalDuration = Math.max(globalDuration, cfg.durationSec);
    }
  }

  if (enabledSliders.length === 0) {
    alert(LANG.alertNoSliders || 'Enable at least one slider animation.');
    return;
  }

  // Update button state
  allAnimRunning = true;
  const btn = document.getElementById('animAllBtn');
  btn.textContent = LANG.animStopAll || '■ Stop all animations';
  btn.classList.add('running');

  // Lock sidebar during pre-render
  lockSidebar(true);

  // Compute dith canvas size with ratio
  const [dW, dH] = getDithDimensions();

  // Pre-render all frames
  animFrames = [];
  for (let fi = 0; fi <= ANIM_FRAME_COUNT; fi++) {
    const globalT = fi / ANIM_FRAME_COUNT;

    showLoader(true,
      (LANG.loaderFrame || 'Frame {n} / {total}')
        .replace('{n}', fi + 1)
        .replace('{total}', ANIM_FRAME_COUNT + 1)
    );

    // Set each enabled slider to its value at this global t
    for (const sliderId of enabledSliders) {
      const cfg   = configs[sliderId];
      const v     = sliderValueAtT(cfg, globalT, globalDuration);
      document.getElementById(sliderId).value = v;
      document.getElementById(cfg.numId).value = v;
    }

    // Render frame
    const offC = document.createElement('canvas');
    offC.width = dW; offC.height = dH;
    await renderToCanvas(offC, getCropSource() || sourceImg, collectParams());
    animFrames.push(offC);
    await new Promise(r => setTimeout(r, 0));
  }

  showLoader(false);
  lockSidebar(false);

  // Mark animating sliders
  for (const sliderId of enabledSliders) {
    document.getElementById(sliderId).classList.add('animating');
  }

  animFrameIdx   = 0;
  animDirection  = 1;
  animMsPerFrame = (globalDuration * 1000) / ANIM_FRAME_COUNT;

  function tick() {
    if (!allAnimRunning) return;
    const frame = animFrames[animFrameIdx];
    dithCanvas.width  = frame.width;
    dithCanvas.height = frame.height;
    dithCanvas.getContext('2d').drawImage(frame, 0, 0);

    animFrameIdx += animDirection;
    if (animFrameIdx >= animFrames.length) {
      animFrameIdx = animFrames.length - 1; animDirection = -1;
    } else if (animFrameIdx < 0) {
      animFrameIdx = 0; animDirection = 1;
    }
    animPlayTimer = setTimeout(tick, animMsPerFrame);
  }
  tick();
}

function stopAllAnimations() {
  allAnimRunning = false;
  clearTimeout(animPlayTimer);
  animFrames = [];

  ANIMATED_SLIDERS.forEach(({ sliderId }) => {
    document.getElementById(sliderId).classList.remove('animating');
  });

  const btn = document.getElementById('animAllBtn');
  btn.textContent = LANG.animStartAll || '▶ Start all animations';
  btn.classList.remove('running');
}

function toggleAllAnimations() {
  if (allAnimRunning) stopAllAnimations();
  else startAllAnimations();
}

// Anim-panel expand/collapse
function toggleAnimPanel(sliderId) {
  const panel = document.getElementById('animPanel_' + sliderId);
  panel.classList.toggle('open');
  const arrow = document.getElementById('animArrow_' + sliderId);
  if (arrow) arrow.textContent = panel.classList.contains('open') ? '▲' : '▼';
}

// ─────────────────────────────────────────
// 7.  HIGHLIGHT COLOURS
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
  buildHlStrip();
}

// ─────────────────────────────────────────
// 8.  SVG SLOTS
// ─────────────────────────────────────────
function buildSvgSlots() {
  const cont = document.getElementById('svgSlots'); cont.innerHTML = '';
  for (let i = 0; i < N; i++) {
    const slot = document.createElement('div');
    slot.className = 'svg-slot'; slot.id = `slot_${i}`;
    slot.innerHTML = `<span class="slot-label">${LANG.svgSlotLabel||'SVG'} ${i+1}</span><div class="slot-preview" id="prev_${i}"></div>`;
    slot.onclick = () => selectSlot(i);
    const inp = document.createElement('input');
    inp.type='file'; inp.accept='.svg,image/svg+xml'; inp.className='hidden'; inp.id=`svgInp_${i}`;
    inp.onchange = e => loadSvg(e, i);
    slot.appendChild(inp);
    slot.ondblclick = e => { e.stopPropagation(); inp.click(); };
    cont.appendChild(slot);
  }
}
function selectSlot(i) {
  activeSlot = i;
  document.querySelectorAll('.svg-slot').forEach((s,j) => s.classList.toggle('active', j===i));
  document.getElementById('activeSlotInfo').classList.remove('hidden');
  document.getElementById('svgColorPicker').value = svgColors[i];
  document.getElementById('activeSlotLabel').textContent = `${LANG.slotLabel||'slot'} ${i+1}`;
  if (!svgData[i]) document.getElementById(`svgInp_${i}`).click();
}
function loadSvg(e, i) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = ev => { svgData[i] = ev.target.result; renderSlotPreview(i); };
  r.readAsText(f);
}
function renderSlotPreview(i) {
  if (!svgData[i]) return;
  const colored = recolorSvg(svgData[i], svgColors[i]);
  const blob = new Blob([colored], {type:'image/svg+xml'});
  document.getElementById(`prev_${i}`).innerHTML =
    `<img src="${URL.createObjectURL(blob)}" width="28" height="28" style="display:block">`;
}
function recolorSvg(svgStr, color) {
  return svgStr.replace(/fill="[^"]*"/g, `fill="${color}"`).replace(/fill:[^;}"']*/g, `fill:${color}`);
}
function updateSvgColor(val) {
  if (activeSlot < 0) return;
  svgColors[activeSlot] = val; renderSlotPreview(activeSlot);
}

// ─────────────────────────────────────────
// 9.  UI TOGGLES
// ─────────────────────────────────────────
function toggleOrig(el) {
  el.classList.toggle('on'); showOrig = el.classList.contains('on');
  document.getElementById('origBox').style.display = showOrig ? '' : 'none';
}
function toggleInvert(el) {
  el.classList.toggle('on'); inverted = el.classList.contains('on');
}
function setRot(deg, btn) {
  rotation = deg;
  document.querySelectorAll('.rot-btn').forEach(b => b.classList.remove('active-rot'));
  btn.classList.add('active-rot');
}
function updateCanvasSize(v) {
  dithCanvasSz = +v;
}

// ─────────────────────────────────────────
// 10. MEDIA LOADING
// ─────────────────────────────────────────
function loadMedia(inp) {
  const f = inp.files[0]; if (!f) return;
  const url = URL.createObjectURL(f);
  if (f.type.startsWith('video/')) {
    isVideo = true; videoEl.src = url;
    videoEl.onloadeddata = () => {
      document.getElementById('videoCtrl').classList.remove('hidden');
      grabVideoFrame(); showPreviews(); triggerRender();
    };
    videoEl.load();
  } else {
    isVideo = false; document.getElementById('videoCtrl').classList.add('hidden');
    const img = new Image();
    img.onload = () => { sourceImg = img; resetCrop(); showPreviews(); triggerRender(); };
    img.src = url;
  }
}
function showPreviews() {
  document.getElementById('dropZone').style.display = 'none';
  document.getElementById('previewWrapper').style.display = 'flex';
  document.getElementById('cropBar').classList.add('visible');
}
function togglePlay() {
  if (videoEl.paused) { videoEl.play(); liveLoop(); }
  else { videoEl.pause(); cancelAnimationFrame(vidAnimFrame); }
}
function liveLoop() { grabVideoFrame(); render(); vidAnimFrame = requestAnimationFrame(liveLoop); }
function captureFrame() { videoEl.pause(); cancelAnimationFrame(vidAnimFrame); grabVideoFrame(); triggerRender(); }
function grabVideoFrame() {
  const w = videoEl.videoWidth||640, h = videoEl.videoHeight||360;
  tempCanvas.width=w; tempCanvas.height=h;
  tempCanvas.getContext('2d').drawImage(videoEl,0,0);
  const img=new Image(); img.src=tempCanvas.toDataURL(); sourceImg=img;
}

// ─────────────────────────────────────────
// 11. CROP / ASPECT RATIO
// ─────────────────────────────────────────
function resetCrop() { cropOffX=0; cropOffY=0; cropScale=1; }

function setRatio(key, btn) {
  document.querySelectorAll('.ratio-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  cropRatio = RATIOS[key];
  resetCrop();
  document.getElementById('cropBox').style.display = key==='free' ? 'none' : '';
  drawCropCanvas();
  // Do NOT auto-render — user clicks Render Now
}

// Returns the cropped source canvas (or raw sourceImg for "free")
function getCropSource() {
  if (!sourceImg || !cropRatio) return sourceImg;
  const [rw,rh] = cropRatio;
  const iw = sourceImg.naturalWidth  || sourceImg.width;
  const ih = sourceImg.naturalHeight || sourceImg.height;
  let cw, ch;
  if (iw/ih > rw/rh) { ch=ih*cropScale; cw=ch*(rw/rh); }
  else               { cw=iw*cropScale; ch=cw*(rh/rw); }
  cw=Math.round(cw); ch=Math.round(ch);
  const offX=Math.round((iw-cw)/2+cropOffX);
  const offY=Math.round((ih-ch)/2+cropOffY);
  const oc=document.createElement('canvas');
  oc.width=cw; oc.height=ch;
  oc.getContext('2d').drawImage(sourceImg,offX,offY,cw,ch,0,0,cw,ch);
  return oc;
}

// Compute dithered canvas pixel dimensions respecting ratio
function getDithDimensions() {
  const sz = dithCanvasSz;
  if (!cropRatio) return [sz, sz];
  const [rw, rh] = cropRatio;
  if (rw >= rh) return [sz, Math.round(sz * rh / rw)];
  return [Math.round(sz * rw / rh), sz];
}

function drawCropCanvas() {
  if (!sourceImg) return;
  const sz = CROP_DISPLAY_SZ;
  cropCanvas.width=sz; cropCanvas.height=sz;
  const ctx=cropCanvas.getContext('2d');
  ctx.clearRect(0,0,sz,sz);
  const iw=sourceImg.naturalWidth||sourceImg.width;
  const ih=sourceImg.naturalHeight||sourceImg.height;

  if (!cropRatio) { ctx.drawImage(sourceImg,0,0,sz,sz); return; }

  const [rw,rh]=cropRatio;
  let rectW,rectH;
  if (rw>=rh) { rectW=sz; rectH=sz*(rh/rw); }
  else        { rectH=sz; rectW=sz*(rw/rh); }
  const rectX=(sz-rectW)/2, rectY=(sz-rectH)/2;

  const scaleImg=(iw/ih>rw/rh) ? ih/rectH*cropScale : iw/rectW*cropScale;
  const srcW=rectW*scaleImg, srcH=rectH*scaleImg;
  const srcX=(iw-srcW)/2-cropOffX*scaleImg;
  const srcY=(ih-srcH)/2-cropOffY*scaleImg;

  ctx.globalAlpha=0.3;
  const fs=Math.min(sz/iw,sz/ih);
  ctx.drawImage(sourceImg,(sz-iw*fs)/2,(sz-ih*fs)/2,iw*fs,ih*fs);
  ctx.globalAlpha=1;

  ctx.save();
  ctx.beginPath(); ctx.rect(rectX,rectY,rectW,rectH); ctx.clip();
  ctx.drawImage(sourceImg,srcX,srcY,srcW,srcH,rectX,rectY,rectW,rectH);
  ctx.restore();

  ctx.strokeStyle='rgba(224,255,79,0.8)'; ctx.lineWidth=1;
  ctx.strokeRect(rectX+.5,rectY+.5,rectW-1,rectH-1);

  ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.lineWidth=.5;
  for (let i=1;i<3;i++) {
    ctx.beginPath(); ctx.moveTo(rectX+rectW*i/3,rectY); ctx.lineTo(rectX+rectW*i/3,rectY+rectH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rectX,rectY+rectH*i/3); ctx.lineTo(rectX+rectW,rectY+rectH*i/3); ctx.stroke();
  }
}

cropCanvas.addEventListener('mousedown', e => {
  if (!cropRatio) return;
  cropDragging=true;
  cropDragStartX=e.clientX; cropDragStartY=e.clientY;
  cropDragOX=cropOffX; cropDragOY=cropOffY;
});
window.addEventListener('mousemove', e => {
  if (!cropDragging) return;
  cropOffX=cropDragOX+(e.clientX-cropDragStartX);
  cropOffY=cropDragOY+(e.clientY-cropDragStartY);
  drawCropCanvas();
});
window.addEventListener('mouseup', () => { cropDragging=false; });
cropCanvas.addEventListener('wheel', e => {
  if (!cropRatio) return;
  e.preventDefault();
  cropScale=Math.max(0.2,Math.min(3,cropScale-e.deltaY*0.001));
  drawCropCanvas();
}, {passive:false});

// ─────────────────────────────────────────
// 12. COLLECT PARAMS
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
// 13. RENDER ENGINE
// ─────────────────────────────────────────
const BAYER4=[[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];

async function getSvgImg(idx) {
  return new Promise(resolve => {
    if (!svgData[idx]) { resolve(null); return; }
    const colored=recolorSvg(svgData[idx],svgColors[idx]);
    const blob=new Blob([colored],{type:'image/svg+xml'});
    const img=new Image();
    img.onload=()=>resolve(img); img.onerror=()=>resolve(null);
    img.src=URL.createObjectURL(blob);
  });
}

async function renderToCanvas(canvas, srcImg, params) {
  const {grid,mode,bgColor,scaleMin,scaleMax,rotation:rot,inverted:inv,hlColors:colors}=params;
  const w=canvas.width, h=canvas.height;
  const cols=Math.ceil(w/grid), rows=Math.ceil(h/grid);

  // Sample source into canvas dimensions
  const tc=document.createElement('canvas'); tc.width=w; tc.height=h;
  const tctx=tc.getContext('2d'); tctx.drawImage(srcImg,0,0,w,h);
  const pd=tctx.getImageData(0,0,w,h).data;
  const lum=new Float32Array(w*h);
  for (let i=0;i<w*h;i++) lum[i]=0.299*pd[i*4]+0.587*pd[i*4+1]+0.114*pd[i*4+2];

  const dctx=canvas.getContext('2d');
  dctx.fillStyle=bgColor; dctx.fillRect(0,0,w,h);

  const svgImgs=await Promise.all(Array.from({length:N},(_,i)=>getSvgImg(i)));
  const anySvg=svgImgs.some(Boolean);
  const lumCopy=Float32Array.from(lum);

  for (let row=0;row<rows;row++) {
    for (let col=0;col<cols;col++) {
      const px=col*grid, py=row*grid;
      const cx=Math.min(px+Math.floor(grid/2),w-1);
      const cy=Math.min(py+Math.floor(grid/2),h-1);
      let L=lumCopy[cy*w+cx];

      if (mode==='threshold') { L=L>128?255:0; }
      else if (mode==='random')  { L=Math.min(255,Math.max(0,L+(Math.random()-.5)*64)); }
      else if (mode==='ordered') { const bv=BAYER4[row%4][col%4]/16; L=Math.min(255,Math.max(0,L+(bv-.5)*80)); }

      if (inv) L=255-L;
      const hlIdx=Math.min(6,Math.floor(L/(256/7)));
      const t=L/255;
      const scaledT=scaleMin+t*(scaleMax-scaleMin);
      const cellSz=grid*Math.min(scaleMax,Math.max(scaleMin,scaledT));

      dctx.save();
      dctx.translate(px+grid/2,py+grid/2);
      dctx.rotate(rot*Math.PI/180);
      dctx.translate(-cellSz/2,-cellSz/2);
      if (anySvg&&svgImgs[hlIdx]) { dctx.drawImage(svgImgs[hlIdx],0,0,cellSz,cellSz); }
      else { dctx.fillStyle=colors[hlIdx]; dctx.fillRect(0,0,cellSz,cellSz); }
      dctx.restore();

      if (mode==='floyd') {
        const qL=Math.min(6,Math.floor(L/(256/7)))*(255/6);
        const err=(L-qL)/16;
        for (const [dc,dr,w2] of [[1,0,7],[1,1,5],[-1,1,3],[0,1,1]]) {
          const nc=col+dc,nr=row+dr;
          if (nc>=0&&nc<cols&&nr>=0&&nr<rows) {
            const ni=(py+dr*grid)*w+(px+dc*grid);
            if (ni>=0&&ni<lumCopy.length) lumCopy[ni]=Math.min(255,Math.max(0,lumCopy[ni]+err*w2));
          }
        }
      }
    }
  }
}

async function render() {
  if (!sourceImg) return;
  const cropSrc = getCropSource() || sourceImg;

  // Original: fit within ORIG_MAX preserving actual aspect ratio
  const srcW = cropSrc.naturalWidth  || cropSrc.width  || 640;
  const srcH = cropSrc.naturalHeight || cropSrc.height || 480;
  const origScale = Math.min(1, ORIG_MAX / Math.max(srcW, srcH));
  origCanvas.width  = Math.round(srcW * origScale);
  origCanvas.height = Math.round(srcH * origScale);
  origCanvas.getContext('2d').drawImage(cropSrc, 0, 0, origCanvas.width, origCanvas.height);

  // Dithered: size from slider + ratio
  const [dW, dH] = getDithDimensions();
  dithCanvas.width  = dW;
  dithCanvas.height = dH;
  await renderToCanvas(dithCanvas, cropSrc, collectParams());

  drawCropCanvas();
}

// ─────────────────────────────────────────
// 14. DRAG & DROP
// ─────────────────────────────────────────
const ca=document.getElementById('canvasArea');
ca.addEventListener('dragover',  e=>{e.preventDefault();ca.classList.add('drop-over');});
ca.addEventListener('dragleave', ()=>ca.classList.remove('drop-over'));
ca.addEventListener('drop', e=>{
  e.preventDefault(); ca.classList.remove('drop-over');
  const f=e.dataTransfer.files[0];
  if(f){const inp=document.getElementById('imgInput');const dt=new DataTransfer();dt.items.add(f);inp.files=dt.files;loadMedia(inp);}
});

// ─────────────────────────────────────────
// 15. REBUILD DYNAMIC UI
// ─────────────────────────────────────────
function rebuildDynamicUI() {
  buildHlStrip();
  buildSvgSlots();
  updateHlPicker();
  bindTooltips();
}

// ─────────────────────────────────────────
// 16. INIT
// ─────────────────────────────────────────
(function init() {
  let saved = 'EN';
  try { saved = localStorage.getItem('ditherLang') || 'EN'; } catch(e) {}
  setLanguage(saved);
})();
