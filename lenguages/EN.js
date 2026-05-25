/* ═══════════════════════════════════════════
   DITHER TOOL — EN.js  (English strings)
   Version: 6.0
   ═══════════════════════════════════════════ */

// Register into global language store (safe for file:// protocol)
window.LANGS = window.LANGS || {};
window.LANGS['EN'] = {
  /* ── Header ── */
  appName:            'Dither Tool',
  tagSvg:             'SVG · IMG · VIDEO',

  /* ── Sections ── */
  secSource:          'Source',
  secDisplay:         'Display',
  secGrid:            'Grid',
  secColours:         'Colours',
  secSvgShapes:       'SVG Shapes (7 slots)',
  secShapeScale:      'Shape Scale',
  secTransform:       'Transform',
  secMode:            'Mode',
  secAnimation:       'A ↔ B Animation',

  /* ── Source ── */
  uploadBtn:          '▲ Image / Video',
  videoPlay:          '▶ Play',
  videoSnap:          '⬡ Snap',

  /* ── Display ── */
  showOriginal:       'Show original',
  canvasSize:         'Canvas size',
  tipCanvasSize:      'Size of the dithered preview in pixels (200–600). Does not affect the original or crop view.',

  /* ── Grid ── */
  resolution:         'Resolution',
  tipResolution:      'Cell size in pixels (4–80). Lower = fine grain, more cells. Higher = chunky blocky look.',

  /* ── Colours ── */
  background:         'Background',
  tipBackground:      'Fill colour used for empty space behind dithered cells.',
  hlLevels:           '7 Highlight levels (shadow → highlight)',
  editLevel:          'Edit level',
  hlLevel:            ['Level 1 (shadow)', 'Level 2', 'Level 3', 'Level 4 (mid)', 'Level 5', 'Level 6', 'Level 7 (highlight)'],

  /* ── SVG Slots ── */
  svgSlotLabel:       'SVG',          // prefix, e.g. "SVG 1"
  shapeColour:        'Shape colour',
  slotLabel:          'slot',         // prefix, e.g. "slot 3"

  /* ── Shape Scale ── */
  minSize:            'Min size',
  tipMinSize:         'Minimum cell size as % of grid size (0–100). Dark pixels use this size.',
  maxSize:            'Max size',
  tipMaxSize:         'Maximum cell size as % of grid size (10–200). Bright pixels use this size. >100 means cells overlap.',

  /* ── Transform ── */
  invertLuminance:    'Invert luminance',
  tipInvert:          'Inverts brightness before dithering: dark areas become bright and vice versa.',
  pixelRotation:      'Pixel rotation (snap 90°)',
  tipRotation:        'Rotates each individual cell/shape. Useful for diagonal or cross-hatched textures.',

  /* ── Mode ── */
  ditherMode:         'Dither',
  tipMode:            'Ordered: classic Bayer matrix. Floyd-Steinberg: error-diffusion for smoother gradients. Threshold: hard 50% cut. Random: noise-based scatter.',
  modeOrdered:        'Ordered (Bayer)',
  modeFloyd:          'Floyd-Steinberg',
  modeThreshold:      'Threshold',
  modeRandom:         'Random noise',
  renderNow:          '⬡ Render Now',

  /* ── A↔B Animation ── */
  animToggleLabel:    'A ↔ B animate',
  animEnable:         'Enable for animation',
  animFirst:          'First',
  animLast:           'Last',
  animSecs:           'Secs',
  animHint:           'Enable sliders above, then press Play.',
  animStartAll:       '▶ Start all animations',
  animStopAll:        '■ Stop all animations',
  animPrerendering:   '⟳ Pre-rendering…',
  alertNoSliders:     'Enable at least one slider animation.',

  /* ── Crop bar ── */
  cropFree:           'Free',
  cropHint:           'Drag to pan · Scroll to zoom crop area',

  /* ── Canvas area ── */
  dropMsg:            'Drop an {image} or {video} here\nor use the upload button',
  dropMsgImage:       'image',
  dropMsgVideo:       'video',
  labelOriginal:      'Original',
  labelDithered:      'Dithered',
  labelCrop:          'Crop',

  /* ── Loader ── */
  loaderRendering:    'Rendering…',
  loaderPrerender:    'Pre-rendering {n} frames…',
  loaderFrame:        'Frame {n} / {total}',

  /* ── Alerts ── */
  alertNoImage:       'Load an image first.',
};
