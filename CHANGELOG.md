# Dither Tool — Changelog

---

## v6.0
**Aspect ratio applied consistently across all previews**
- Canvas Dithered now respects the selected aspect ratio with exact pixel dimensions (e.g. 360×203 for 16:9). Previously it always rendered square.
- Original and Crop previews are unaffected by the canvas size slider — they render at their natural size (max 300px).

**Render on demand only**
- Removed the 3-second auto-render debounce. Sliders, toggles and colour pickers no longer trigger a re-render automatically.
- Previews only update when the user clicks **Render Now**, or when a new image/video is loaded.
- This eliminates flashes and lag when making many quick adjustments.

**Animation: checkbox per slider**
- Each slider animation panel now has an **Enable** checkbox. Only checked sliders participate in the global animation.

**Animation: unified global duration**
- The total animation duration equals the longest `Secs` value among all enabled sliders.
- Sliders with a shorter `Secs` loop seamlessly within that window (ping-pong A↔B) without interrupting others.

**Animation: single global Start/Stop button**
- Individual slider Start buttons removed. One **▶ Start all animations** / **■ Stop all animations** button at the bottom of the sidebar controls everything.
- Pressing Start pre-renders all frames first (with a frame counter in the loader), then plays the animation.

**Changelog file added**
- This file (`CHANGELOG.md`) introduced to track changes per version.

---

## v5.1
**Fixed: `LANG is not defined` error**
- Language files (`EN.js`, `ES.js`) now register their strings into `window.LANGS['XX']` instead of declaring a top-level `const LANG`. `script.js` reads from `window.LANGS` after DOM load, avoiding race conditions on `file://` protocol.

**Fixed: infinite spinner after image load**
- `scheduleRender()` now wraps `render()` in `try/finally`, guaranteeing the loader and sidebar lock are always cleared even if an error occurs.

**Fixed: language switching via dynamic `<script>` tag**
- Removed dynamic script injection for language switching (broken on `file://`). Both language files are now loaded as static `<script>` tags in `<head>`, making switching instant and protocol-safe.

---

## v5.0
**Project split into multiple files**
- `index.html` — markup only
- `style.css` — all styles
- `script.js` — all JavaScript logic
- `EN.js` — English strings
- `ES.js` — Spanish strings
- Language selector (EN / ES) added to the header; preference saved in `localStorage`.

**Slider numeric inputs**
- Every slider now has an adjacent number input field. Values are clamped and rounded to the slider's `min`/`max`/`step` on change.

**Tooltips fixed (always on top)**
- Tooltip rendered as a `position:fixed` `<div>` appended to `<body>`, positioned via JS. Never clipped by sidebar overflow. `z-index: 9999`.

**Crop / Aspect ratio system**
- Toolbar with Free, 1:1, 4:5, 5:4, 16:9, 9:16 options above the previews.
- Crop canvas shows a live rule-of-thirds overlay with dimmed areas outside the crop.
- Drag to pan, scroll to zoom the crop area.

**A↔B slider animation (per slider)**
- Each slider has a collapsible panel with First / Last / Secs fields and a Start button.
- Animation pre-renders frames, then plays in a ping-pong loop.

**Render debounce (3 s)**
- Sidebar locked during render; spinner shown over the Dithered canvas.
*(Replaced in v6.0 with manual render-on-demand.)*

**Version tag added to header.**

---

## v4.0
**Tooltip system rebuilt**
- Tooltips moved to a body-level `<div>` to avoid clipping by sidebar `overflow:hidden`.

**Canvas size slider**
- Affects only the Dithered canvas; Original and Crop stay at their natural size.

**A↔B animation (first version)**
- Single Start/Stop button per slider; no pre-rendering.

**Code separated into `index.html`, `style.css`, `script.js`.**

---

## v3.0 (internal)
**GIF Animator removed** (technical limitations with `file://` and Web Workers).

**Numeric fields added next to every slider.**

**Info icons with tooltips** added to all controls.

---

## v2.0
**GIF Animator added** (later removed in v3.0).
- Multi-block configuration with per-block dither settings.
- Abrupt and smooth (interpolated) transitions between blocks.

---

## v1.0
**Initial release.**
- Image and video source support (drag & drop, file picker).
- 7 highlight levels with individual colour pickers.
- 7 SVG shape slots (one per luminance level), with per-slot colour.
- Dither modes: Ordered (Bayer), Floyd-Steinberg, Threshold, Random.
- Shape scale (min / max) and pixel rotation (0°, 90°, 180°, 270°).
- Invert luminance toggle.
- Show / hide original toggle.
- Canvas size slider.
