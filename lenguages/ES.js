/* ═══════════════════════════════════════════
   DITHER TOOL — ES.js  (Español)
   Versión: 5.0
   ═══════════════════════════════════════════ */

const LANG = {
  /* ── Cabecera ── */
  appName:            'Dither Tool',
  tagSvg:             'SVG · IMG · VÍDEO',

  /* ── Secciones ── */
  secSource:          'Fuente',
  secDisplay:         'Vista',
  secGrid:            'Cuadrícula',
  secColours:         'Colores',
  secSvgShapes:       'Formas SVG (7 slots)',
  secShapeScale:      'Escala de forma',
  secTransform:       'Transformar',
  secMode:            'Modo',
  secAnimation:       'Animación A ↔ B',

  /* ── Fuente ── */
  uploadBtn:          '▲ Imagen / Vídeo',
  videoPlay:          '▶ Reproducir',
  videoSnap:          '⬡ Capturar',

  /* ── Vista ── */
  showOriginal:       'Mostrar original',
  canvasSize:         'Tamaño lienzo',
  tipCanvasSize:      'Tamaño del lienzo dithered en píxeles (200–600). No afecta a la vista original ni al recorte.',

  /* ── Cuadrícula ── */
  resolution:         'Resolución',
  tipResolution:      'Tamaño de celda en píxeles (4–80). Menor = grano fino con más celdas. Mayor = aspecto más grueso.',

  /* ── Colores ── */
  background:         'Fondo',
  tipBackground:      'Color de relleno del espacio vacío detrás de las celdas.',
  hlLevels:           '7 Niveles de iluminación (sombra → luz)',
  editLevel:          'Editar nivel',
  hlLevel:            ['Nivel 1 (sombra)', 'Nivel 2', 'Nivel 3', 'Nivel 4 (medio)', 'Nivel 5', 'Nivel 6', 'Nivel 7 (luz)'],

  /* ── Slots SVG ── */
  svgSlotLabel:       'SVG',
  shapeColour:        'Color de forma',
  slotLabel:          'slot',

  /* ── Escala de forma ── */
  minSize:            'Tamaño mín.',
  tipMinSize:         'Tamaño mínimo de celda como % del tamaño de cuadrícula (0–100). Los píxeles oscuros usan este tamaño.',
  maxSize:            'Tamaño máx.',
  tipMaxSize:         'Tamaño máximo de celda como % del tamaño de cuadrícula (10–200). Los píxeles claros usan este tamaño. >100 hace que las celdas se solapen.',

  /* ── Transformar ── */
  invertLuminance:    'Invertir luminancia',
  tipInvert:          'Invierte el brillo antes del dithering: las zonas oscuras se vuelven claras y viceversa.',
  pixelRotation:      'Rotación de píxel (salto 90°)',
  tipRotation:        'Rota cada celda o forma individualmente. Útil para texturas diagonales o de sombreado cruzado.',

  /* ── Modo ── */
  ditherMode:         'Dither',
  tipMode:            'Ordenado: matriz Bayer clásica. Floyd-Steinberg: difusión de error para gradientes suaves. Umbral: corte duro al 50%. Aleatorio: dispersión con ruido.',
  modeOrdered:        'Ordenado (Bayer)',
  modeFloyd:          'Floyd-Steinberg',
  modeThreshold:      'Umbral',
  modeRandom:         'Ruido aleatorio',
  renderNow:          '⬡ Renderizar ahora',

  /* ── Animación A↔B ── */
  animToggleLabel:    'Animar A ↔ B',
  animFirst:          'Inicio',
  animLast:           'Fin',
  animSecs:           'Segs',
  animStartAll:       '▶ Iniciar todas las animaciones',
  animStopAll:        '■ Detener todas las animaciones',
  animPrerendering:   '⟳ Pre-renderizando…',

  /* ── Barra de recorte ── */
  cropFree:           'Libre',
  cropHint:           'Arrastra para desplazar · Rueda para hacer zoom',

  /* ── Área de lienzo ── */
  dropMsg:            'Suelta una {image} o un {video} aquí\no usa el botón de carga',
  dropMsgImage:       'imagen',
  dropMsgVideo:       'vídeo',
  labelOriginal:      'Original',
  labelDithered:      'Dithered',
  labelCrop:          'Recorte',

  /* ── Loader ── */
  loaderRendering:    'Renderizando…',
  loaderPrerender:    'Pre-renderizando {n} fotogramas…',
  loaderFrame:        'Fotograma {n} / {total}',

  /* ── Alertas ── */
  alertNoImage:       'Carga una imagen primero.',
};
