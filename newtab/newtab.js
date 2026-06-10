/**
 * Wallibe — newtab.js
 * Main orchestrator: loads settings, inits wallpaper engine + all widgets.
 * Includes draggable widget positioning + direct resize (activated via settings panel toggle).
 */

'use strict';

// ── Sync early init: set CSS vars from localStorage before first paint ──────
// This prevents FOUC where search bar briefly shows the 1.5rem fallback
try {
  const _pos = JSON.parse(localStorage.getItem('wb_widgetPositions') || '{}');
  const _sp = _pos['search-widget'];
  if (_sp && _sp.height) {
    const _h = +_sp.height;
    const _f = Math.max(0.8, Math.min(1.4, 1.1 * (_h / 52)));
    document.documentElement.style.setProperty('--search-font-size', _f.toFixed(2) + 'rem');
  }
} catch (_) {}

window.__cacheIcon = function(img, domain) {
  if (img.src.startsWith('data:')) return;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 32;
    canvas.height = img.naturalHeight || 32;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    localStorage.setItem('wb_icon_' + domain, canvas.toDataURL('image/png'));
  } catch (e) {}
};

// ─── Helpers ─────────────────────────────────────────────
function lsGet(key, fallback) {
  try { const v = localStorage.getItem('wb_' + key); return v !== null ? JSON.parse(v) : fallback; }
  catch (_) { return fallback; }
}
async function lsSet(key, value) {
  const largeKeys = ['staticUrl', 'videoUrl', 'clockFontUrl', 'dateFontUrl', 'othersFontUrl', 'searchLogoUrl', 'floatCards'];
  if (largeKeys.includes(key)) {
    if (window.__IDB) {
      await window.__IDB.set(key, value);
    } else {
      try { localStorage.setItem('wb_' + key, JSON.stringify(value)); } catch (_) { }
    }
  } else {
    try { localStorage.setItem('wb_' + key, JSON.stringify(value)); } catch (_) { }
    if (typeof chrome !== 'undefined' && chrome.storage) chrome.storage.local.set({ [key]: value });
  }
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function getAllSettings() {
  const settings = { ...DEFAULT_SETTINGS };
  const largeKeys = ['staticUrl', 'videoUrl', 'clockFontUrl', 'dateFontUrl', 'othersFontUrl', 'searchLogoUrl', 'floatCards'];

  // 1. Load small settings from chrome.storage or localStorage
  if (typeof chrome !== 'undefined' && chrome.storage) {
    const local = await new Promise(res => chrome.storage.local.get(null, res));
    Object.keys(DEFAULT_SETTINGS).forEach(k => {
      if (!largeKeys.includes(k)) {
        if (local[k] !== undefined) settings[k] = local[k];
        else settings[k] = lsGet(k, DEFAULT_SETTINGS[k]);
      }
    });
  } else {
    Object.keys(DEFAULT_SETTINGS).forEach(k => {
      if (!largeKeys.includes(k)) {
        settings[k] = lsGet(k, DEFAULT_SETTINGS[k]);
      }
    });
  }

  // 2. Load large keys from IndexedDB
  for (const k of largeKeys) {
    if (window.__IDB) {
      settings[k] = await window.__IDB.get(k, lsGet(k, DEFAULT_SETTINGS[k]));
    } else {
      settings[k] = lsGet(k, DEFAULT_SETTINGS[k]);
    }
  }

  return settings;
}

window.__IDB = {
  db: null,
  init() {
    return new Promise(resolve => {
      if (this.db) return resolve(this.db);
      const req = indexedDB.open('WallibeDB', 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore('settings');
      req.onsuccess = e => { this.db = e.target.result; resolve(this.db); };
      req.onerror = () => resolve(null);
    });
  },
  async get(key, fallback) {
    await this.init();
    if (!this.db) return fallback;
    return new Promise(resolve => {
      try {
        const req = this.db.transaction('settings', 'readonly').objectStore('settings').get(key);
        req.onsuccess = () => resolve(req.result !== undefined ? req.result : fallback);
        req.onerror = () => resolve(fallback);
      } catch (e) { resolve(fallback); }
    });
  },
  async set(key, value) {
    await this.init();
    if (!this.db) return;
    return new Promise(resolve => {
      try {
        const tx = this.db.transaction('settings', 'readwrite');
        tx.objectStore('settings').put(value, key);
        tx.oncomplete = resolve;
      } catch (e) { resolve(); }
    });
  }
};

const DEFAULT_SETTINGS = {
  wallpaperType: 'static',
  webglPreset: 'fluid',
  cssPreset: 'aurora',
  staticUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  videoUrl: '',
  brightness: 100,
  blur: 0,
  accentColor: '#10b981',
  accentColor2: '#34d399',
  useGradient: false,
  gradientIntensity: 50,
  gradientAngle: 135,
  showClock: true,
  clockFormat: '12h',
  showSeconds: true,
  showDate: true,
  showQuickLinks: true,
  showSearch: true,
  searchEngine: 'google',
  searchLogoUrl: '',
  panelLocked: false,
  panelShortcut: 'Alt+S',
  floatCards: [],
  clockFontUrl: '',
  dateFontUrl: '',
  othersFontUrl: '',
  clockFontName: '',
  dateFontName: '',
  othersFontName: '',
  quickLinks: [
    { title: 'YouTube', url: 'https://youtube.com' },
    { title: 'GitHub', url: 'https://github.com' },
    { title: 'Gmail', url: 'https://mail.google.com' },
    { title: 'Maps', url: 'https://maps.google.com' }
  ]
};

// ─── Custom Font Loader ──────────────────────────────────
function loadCustomFonts(settings) {
  // Remove previous custom font style if exists
  let styleEl = document.getElementById('lt-custom-fonts');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'lt-custom-fonts';
    document.head.appendChild(styleEl);
  }
  let css = '';
  const clockUrl = settings.clockFontUrl;
  const dateUrl = settings.dateFontUrl;
  if (clockUrl) {
    css += `@font-face { font-family: 'LT-ClockFont'; src: url('${clockUrl}'); font-display: block; }\n`;
    css += `#clock-time { font-family: 'LT-ClockFont', 'Outfit', sans-serif !important; }\n`;
    // Add error handling
    const font = new FontFace('LT-ClockFont', `url(${clockUrl})`);
    font.load().catch(() => {
      console.warn('[Wallibe] Failed to load clock font, falling back to default');
      const el = document.getElementById('clock-time');
      if (el) el.style.fontFamily = 'Outfit, Inter, sans-serif';
    });
  } else {
    css += `#clock-time { font-family: 'Outfit', 'Inter', sans-serif; }\n`;
  }
  if (dateUrl) {
    css += `@font-face { font-family: 'LT-DateFont'; src: url('${dateUrl}'); font-display: block; }\n`;
    css += `#clock-date { font-family: 'LT-DateFont', 'Outfit', sans-serif !important; }\n`;
  } else {
    css += `#clock-date { font-family: 'Outfit', sans-serif; }\n`;
  }
  const othersUrl = settings.othersFontUrl;
  if (othersUrl) {
    css += `@font-face { font-family: 'LT-OthersFont'; src: url('${othersUrl}'); font-display: block; }\n`;
    // Only target on-page widgets — NOT settings panel (causes blur with custom fonts)
    css += `.quicklink-label, #search-input, #search-input::placeholder { font-family: 'LT-OthersFont', 'Inter', sans-serif !important; }\n`;
    css += `#search-input { line-height: 1 !important; display: flex !important; align-items: center !important; }\n`;
  } else {
    css += `#search-input, #search-input::placeholder { font-family: 'Inter', sans-serif; }\n`;
  }
  styleEl.textContent = css;

  // Update label text in settings panel
  const updateUI = (type, url, name) => {
    const nameEl = document.getElementById(`sp-${type}-font-name`);
    const btnEl = document.getElementById(`sp-${type}-font-btn`);
    const clearEl = document.getElementById(`sp-${type}-font-clear`);
    if (!nameEl || !btnEl || !clearEl) return;

    // Ensure icon exists for font buttons
    if (!btnEl.querySelector('.sp-icon')) {
      btnEl.insertAdjacentHTML('afterbegin', `<svg class="sp-icon" viewBox="0 0 24 24" style="width:14px; height:14px; margin-right:4px; flex-shrink:0;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
    }

    if (url) {
      nameEl.textContent = name || 'Custom Font';
      btnEl.classList.add('active');
      clearEl.style.display = 'flex';
      // Hide icon if uploaded
      const icon = btnEl.querySelector('.sp-icon');
      if (icon) icon.remove();
    } else {
      nameEl.textContent = 'Import Font';
      btnEl.classList.remove('active');
      clearEl.style.display = 'none';
      // Re-add icon if missing
      if (!btnEl.querySelector('.sp-icon')) {
        btnEl.insertAdjacentHTML('afterbegin', `<svg class="sp-icon" viewBox="0 0 24 24" style="width:14px; height:14px; margin-right:4px; flex-shrink:0;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
      }
    }
  };
  updateUI('clock', clockUrl, settings.clockFontName);
  updateUI('date', dateUrl, settings.dateFontName);
  updateUI('others', othersUrl, settings.othersFontName);
}
window.__loadCustomFonts = () => {
  if (window.__currentSettings) loadCustomFonts(window.__currentSettings);
};

/* ── Default widget positions (as % of viewport) ── */
const DEFAULT_POSITIONS = {
  'clock-widget':      { left: 50, top: 31, anchorX: 'center' },
  'date-widget':       { left: 50, top: 49, anchorX: 'center' },
  'search-widget':     { left: 50, top: 58, anchorX: 'center' }
};

// ─── Positioning ─────────────────────────────────────────
function applyPosition(el, pos, vw, vh, w, h) {
  let x = (pos.left / 100) * vw;
  let y = (pos.top / 100) * vh;
  const rotateDeg = pos.rotate || 0;
  const rotateStr = rotateDeg ? `rotate(${rotateDeg}deg)` : '';

  if (pos.anchorX === 'center') {
    el.style.left = '50%';
    el.style.transform = `translateX(-50%) ${rotateStr}`.trim();
  } else {
    if (pos.anchorX === 'right') x = vw - w - (pos.left === 0 ? 0 : (1 - pos.left / 100) * vw);
    el.style.left = x + 'px';
    el.style.transform = `${rotateStr}`.trim() || 'none';
  }

  if (pos.anchorY === 'center' || pos.anchorY === 'middle') y = Math.round((vh - h) / 2);
  else if (pos.anchorY === 'bottom') y = y - h;

  el.style.top = y + 'px';
  el.style.setProperty('--widget-rotate', rotateDeg + 'deg');
}

function layoutWidgets() {
  const saved = lsGet('widgetPositions', {});
  const vw = 1280;
  const vh = 720;
  const root = document.documentElement;

  let frameCount = 0;
  const pass = () => {
    const widgets = Array.from(document.querySelectorAll('.widget'));
    const measurements = widgets.map(el => {
      const id = el.id;
      if (!id || el.style.display === 'none') return null;

      const s = saved[id] || DEFAULT_POSITIONS[id];
      if (!s) return null;

      if (s.width && !isNaN(s.width)) {
        if (id === 'search-widget') {
          root.style.setProperty('--search-width', s.width + 'px');
          if (s.height) {
            root.style.setProperty('--search-height', s.height + 'px');
            // Set font size atomically with height to prevent FOUC
            const h = +s.height;
            const fSize = Math.max(0.8, Math.min(1.4, 1.1 * (h / 52)));
            root.style.setProperty('--search-font-size', fSize.toFixed(2) + 'rem');
          }
        }
        if (id === 'clock-widget' && s.fontSize) {
          root.style.setProperty('--clock-font-size', s.fontSize + 'rem');
        }
        if (id === 'date-widget' && s.fontSize) {
          root.style.setProperty('--date-font-size', s.fontSize + 'rem');
        }
        if (id.startsWith('float-card-widget-')) {
          el.style.width = s.width + 'px';
          if (s.height) el.style.height = s.height + 'px';
        }
      }
      
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (w === 0 || h === 0) return null;

      return { el, pos: s, w, h };
    }).filter(Boolean);

    measurements.forEach(m => applyPosition(m.el, m.pos, vw, vh, m.w, m.h));

    // Reset visibility and styles (ensure they are all visible)
    const collidableHideables = [
      document.getElementById('clock-widget'),
      document.getElementById('date-widget'),
      ...Array.from(document.querySelectorAll('.single-float-card-widget'))
    ];
    collidableHideables.forEach(el => {
      if (!el) return;
      el.style.opacity = '1';
      el.style.visibility = 'visible';
      el.style.pointerEvents = 'all';
    });

    const alwaysKeep = [
      document.getElementById('search-widget'),
      ...Array.from(document.querySelectorAll('.single-link-widget'))
    ];
    alwaysKeep.forEach(el => {
      if (!el) return;
      el.style.opacity = '1';
      el.style.visibility = 'visible';
      el.style.pointerEvents = 'all';
    });

    if (frameCount < 3) { frameCount++; requestAnimationFrame(pass); }
  };

  pass();
}

window.__layerScale = 1;
function applyResponsiveScale() {
  const layer = document.getElementById('widget-layer');
  if (!layer) return;
  const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
  window.__layerScale = scale;
  layer.style.setProperty('--layer-scale', scale);
  layer.style.transform = `translate(-50%, -50%) scale(${scale})`;
}

window.addEventListener('resize', () => {
  applyResponsiveScale();
  const isSmall = window.innerWidth <= 600;
  if (isSmall && document.body.classList.contains('edit-layout')) {
    setEditLayout(false);
  } else if (!isSmall && lsGet('editLayout', false) && !document.body.classList.contains('edit-layout')) {
    setEditLayout(true);
  }
  layoutWidgets(); // Force collision check and position updates on resize
});

function savePosition(widgetId) {
  const el = document.getElementById(widgetId);
  if (!el) return;
  const layer = document.getElementById('widget-layer');
  if (!layer) return;
  const saved = lsGet('widgetPositions', {});
  const existing = saved[widgetId] || {};

  const scale = window.__layerScale || 1;
  let anchorX = 'left';
  let unscaledLeft, unscaledTop;

  // Prefer reading the inline CSS left/top values directly.
  // getBoundingClientRect() on rotated elements returns the axis-aligned
  // bounding box which is larger and shifted — causing position drift.
  if (el.style.left === '50%') {
    // Widget is center-anchored
    anchorX = 'center';
    unscaledLeft = 640 - el.offsetWidth / 2; // virtual center
    unscaledTop = parseFloat(el.style.top) || 0;
  } else if (el.style.left && el.style.left.endsWith('px')) {
    unscaledLeft = parseFloat(el.style.left) || 0;
    unscaledTop = parseFloat(el.style.top) || 0;
  } else {
    // Fallback: use bounding rect (for first-time positioning)
    const layerRect = layer.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    unscaledLeft = (rect.left - layerRect.left) / scale;
    unscaledTop = (rect.top - layerRect.top) / scale;
  }

  let leftVal = (unscaledLeft / 1280) * 100;
  let topVal = (unscaledTop / 720) * 100;

  // Handle snapping/centering (virtual center is 640)
  const widgetWidth = el.offsetWidth;
  const widgetCenter = unscaledLeft + widgetWidth / 2;
  if (anchorX !== 'center' && Math.abs(widgetCenter - 640) < 20) {
    leftVal = 50;
    anchorX = 'center';
  }

  saved[widgetId] = {
    ...existing,
    left: leftVal,
    top: topVal,
    anchorX: anchorX,
    anchorY: 'top',
    width: el.offsetWidth,
    height: el.offsetHeight,
    rotate: parseFloat(el.style.getPropertyValue('--widget-rotate')) || 0
  };
  lsSet('widgetPositions', saved);
}

function resetLayout() {
  lsSet('widgetPositions', {});
  const root = document.documentElement;
  root.style.removeProperty('--search-width');
  root.style.removeProperty('--search-height');
  root.style.removeProperty('--clock-font-size');
  root.style.removeProperty('--date-font-size');

  // Reset inline styles on ALL widgets (including dynamically created link widgets)
  document.querySelectorAll('.widget').forEach(el => {
    el.style.left = '';
    el.style.top = '';
    el.style.width = '';
    el.style.height = '';
    el.style.transform = '';
  });

  // Pre-set link widget default positions (pixel-accurate horizontal row below search bar)
  const savedPos = {};
  const linkWidgets = Array.from(document.querySelectorAll('.single-link-widget'));
  if (linkWidgets.length > 0) {
    const total = linkWidgets.length;
    const vw = 1280;
    const w = linkWidgets[0].offsetWidth || 72;
    const gap = 20;
    const stride = w + gap;
    const groupWidth = total * w + (total - 1) * gap;
    const groupLeftPx = (vw - groupWidth) / 2;
    linkWidgets.forEach((widget, idx) => {
      savedPos[widget.id] = {
        left: ((groupLeftPx + idx * stride) / vw) * 100,
        top: 72,
        anchorX: 'left',
        anchorY: 'top'
      };
    });
  }
  lsSet('widgetPositions', savedPos);

  layoutWidgets();
}
window.__resetLayout = resetLayout;

// ─── Theme ───────────────────────────────────────────────
function adjustColor(hex, amt) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  let r = parseInt(hex.substring(0, 2), 16), g = parseInt(hex.substring(2, 4), 16), b = parseInt(hex.substring(4, 6), 16);
  r = Math.min(255, Math.max(0, r + amt)); g = Math.min(255, Math.max(0, g + amt)); b = Math.min(255, Math.max(0, b + amt));
  const f2h = x => Math.round(x).toString(16).padStart(2, '0');
  return '#' + f2h(r) + f2h(g) + f2h(b);
}

// Linearly interpolate between two hex colors; t in 0..1
function mixColors(hex1, hex2, t) {
  const parse = h => {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
  };
  const [r1, g1, b1] = parse(hex1);
  const [r2, g2, b2] = parse(hex2);
  const f2h = x => Math.round(x).toString(16).padStart(2, '0');
  return '#' + f2h(r1 + (r2 - r1) * t) + f2h(g1 + (g2 - g1) * t) + f2h(b1 + (b2 - b1) * t);
}

function applyAccentColor(color, s = {}) {
  const root = document.documentElement;
  const current = window.__currentSettings || {};

  const useGrad = s.useGradient !== undefined ? s.useGradient : 
                  (current.useGradient !== undefined ? current.useGradient : lsGet('useGradient', false));
  // intensity: 0 = no gradient (all primary), 100 = full gradient to secondary
  const intensity = s.gradientIntensity !== undefined ? s.gradientIntensity : 
                    (current.gradientIntensity !== undefined ? current.gradientIntensity : lsGet('gradientIntensity', 50));
  const angle = s.gradientAngle !== undefined ? s.gradientAngle : 
                (current.gradientAngle !== undefined ? current.gradientAngle : lsGet('gradientAngle', 135));
  const primary = color || s.accentColor || current.accentColor || lsGet('accentColor', '#10b981');

  if (useGrad) {
    // Always use the saved secondary colour; NEVER overwrite it from primary
    const c2 = s.accentColor2 || current.accentColor2 || lsGet('accentColor2', adjustColor(primary, 30));
    // Blend the secondary toward primary based on intensity (0% = ignore c2, 100% = full c2)
    // We use a slight curve (power of 0.7) to make the secondary color appear faster
    const t = Math.pow(Math.max(0, Math.min(100, +intensity)) / 100, 0.7);
    const blended = mixColors(primary, c2, t);
    const grad = `linear-gradient(${angle}deg, ${primary}, ${blended})`;
    root.style.setProperty('--accent', primary);
    root.style.setProperty('--accent-gradient', grad);
    root.style.setProperty('--sp-accent', primary);
    root.style.setProperty('--sp-accent2', c2);
  } else {
    root.style.setProperty('--accent', primary);
    root.style.setProperty('--accent-gradient', primary);
    root.style.setProperty('--sp-accent', primary);
    root.style.setProperty('--accent2', adjustColor(primary, 20));
    root.style.setProperty('--sp-accent2', adjustColor(primary, 15));
  }
}
window.__applyAccentColor = applyAccentColor;

// ─── Drag, Resize & Rotate state (declare first, use below) ──────
let _dragging = null;
let _resizing = null;
let _rotating = null;

// ─── Drag handlers ───────────────────────────────────────────
function _startDrag(el, clientX, clientY) {
  if (window.innerWidth <= 600) return false;
  if (!document.body.classList.contains('edit-layout')) return false;

  const layer = document.getElementById('widget-layer');
  if (!layer) return false;
  const layerRect = layer.getBoundingClientRect();
  const scale = window.__layerScale || 1;

  const rotateDeg = parseFloat(el.style.getPropertyValue('--widget-rotate')) || 0;
  const rotateStr = rotateDeg ? `rotate(${rotateDeg}deg)` : '';

  // Read position from CSS values directly instead of getBoundingClientRect().
  // For rotated elements, getBoundingClientRect() returns the axis-aligned
  // bounding box which is larger/shifted — causing upward drift on click.
  let unscaledLeft, unscaledTop;

  if (el.style.left === '50%') {
    // Center-anchored: compute pixel left from center
    unscaledLeft = 640 - el.offsetWidth / 2;
    unscaledTop = parseFloat(el.style.top) || 0;
  } else if (el.style.left && el.style.left.endsWith('px')) {
    unscaledLeft = parseFloat(el.style.left) || 0;
    unscaledTop = parseFloat(el.style.top) || 0;
  } else {
    // Fallback: use bounding rect (only for unpositioned widgets)
    const rect = el.getBoundingClientRect();
    unscaledLeft = (rect.left - layerRect.left) / scale;
    unscaledTop = (rect.top - layerRect.top) / scale;
  }

  // Set pixel position and remove translateX(-50%) before dragging
  el.style.left = unscaledLeft + 'px';
  el.style.top = unscaledTop + 'px';
  el.style.transform = rotateStr || 'none';
  el.style.transition = 'none';
  el.style.zIndex = '1000';

  // Mouse position in unscaled virtual space relative to layer
  const unscaledMouseX = (clientX - layerRect.left) / scale;
  const unscaledMouseY = (clientY - layerRect.top) / scale;

  _dragging = {
    el,
    offsetX: unscaledMouseX - unscaledLeft,
    offsetY: unscaledMouseY - unscaledTop,
    rotateStr: rotateStr
  };
  return true;
}

function onDragStart(e) {
  if (e.target.classList.contains('resize-handle')) return;
  if (['INPUT', 'BUTTON'].includes(e.target.tagName) || e.target.closest('button')) return; // Allow normal clicks on interactive elements
  e.preventDefault();
  _startDrag(e.currentTarget, e.clientX, e.clientY);
}

function onTouchStart(e) {
  if (e.target.classList.contains('resize-handle')) return;
  if (['INPUT', 'BUTTON'].includes(e.target.tagName) || e.target.closest('button')) return;
  const touch = e.touches[0];
  if (_startDrag(e.currentTarget, touch.clientX, touch.clientY)) {
    e.preventDefault();
  }
}

function attachDragHandlers() {
  document.querySelectorAll('.draggable-widget').forEach(el => {
    // Skip if already has drag listeners
    if (el._hasDragHandlers) return;
    el._hasDragHandlers = true;

    el.addEventListener('mousedown', onDragStart, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: false });

    // Double-click to snap back to center
    el.addEventListener('dblclick', () => {
      if (!document.body.classList.contains('edit-layout')) return;
      const vw = window.innerWidth;
      el.style.left = (vw / 2 - el.offsetWidth / 2) + 'px';
      el.style.transform = '';
      savePosition(el.id);
    });
  });
}
window.__attachDragHandlers = attachDragHandlers;

// ─── Rotate handlers ─────────────────────────────────────
function attachRotateHandlers() {
  document.querySelectorAll('.draggable-widget').forEach(el => {
    if (!el.id) return;
    if (!el.querySelector('.rotate-handle')) {
      const h = document.createElement('div');
      h.className = 'rotate-handle';
      h.dataset.widget = el.id;
      el.appendChild(h);
    }
  });

  document.querySelectorAll('.rotate-handle').forEach(handle => {
    // Prevent duplicate listeners
    if (handle._hasRotateListener) return;
    handle._hasRotateListener = true;
    
    const startRotate = e => {
      if (window.innerWidth <= 600) return;
      if (!document.body.classList.contains('edit-layout')) return;
      e.preventDefault();
      e.stopPropagation();
      const isTouch = e.type === 'touchstart';
      const clientX = isTouch ? e.touches[0].clientX : e.clientX;
      const clientY = isTouch ? e.touches[0].clientY : e.clientY;
      const widgetId = handle.dataset.widget;
      const el = document.getElementById(widgetId);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      const startAngle = Math.atan2(clientY - centerY, clientX - centerX);
      const currentRotate = parseFloat(el.style.getPropertyValue('--widget-rotate')) || 0;
      
      _rotating = {
        el, widgetId, centerX, centerY, startAngle, currentRotate
      };
      el.style.transition = 'none';
    };
    handle.addEventListener('mousedown', startRotate, { passive: false });
    handle.addEventListener('touchstart', startRotate, { passive: false });
  });
}
window.__attachRotateHandlers = attachRotateHandlers;

// ─── Resize handlers ─────────────────────────────────────
function attachResizeHandlers() {
  document.querySelectorAll('.resize-handle').forEach(handle => {
    if (handle._hasResizeListener) return;
    handle._hasResizeListener = true;
    
    const startResize = e => {
      if (window.innerWidth <= 600) return;
      if (!document.body.classList.contains('edit-layout')) return;
      e.preventDefault();
      e.stopPropagation();
      const isTouch = e.type === 'touchstart';
      const clientX = isTouch ? e.touches[0].clientX : e.clientX;
      const clientY = isTouch ? e.touches[0].clientY : e.clientY;
      const widgetId = handle.dataset.widget;
      const el = document.getElementById(widgetId);
      if (!el) return;
      
      const layer = document.getElementById('widget-layer');
      if (!layer) return;
      const layerRect = layer.getBoundingClientRect();
      const scale = window.__layerScale || 1;
      const rect = el.getBoundingClientRect();

      const unscaledLeft = (rect.left - layerRect.left) / scale;
      const unscaledTop = (rect.top - layerRect.top) / scale;

      const unscaledMouseX = (clientX - layerRect.left) / scale;
      const unscaledMouseY = (clientY - layerRect.top) / scale;

      _resizing = {
        el, widgetId,
        startX: unscaledMouseX, startY: unscaledMouseY,
        startW: el.offsetWidth, startH: el.offsetHeight,
        centerX: unscaledLeft + el.offsetWidth / 2,
        centerY: unscaledTop + el.offsetHeight / 2,
        wasCentered: el.style.left === '50%' || Math.abs((unscaledLeft + el.offsetWidth / 2) - 640) < 20
      };

      const currentRotate = el.style.getPropertyValue('--widget-rotate') || '0deg';
      if (_resizing.wasCentered) {
        el.style.transform = `translateX(-50%) ${currentRotate}`.trim();
        el.style.left = '50%';
      } else {
        el.style.transform = currentRotate;
        el.style.left = unscaledLeft + 'px';
      }
      el.style.top = unscaledTop + 'px';
    };
    handle.addEventListener('mousedown', startResize, { passive: false });
    handle.addEventListener('touchstart', startResize, { passive: false });
  });
}
window.__attachResizeHandlers = attachResizeHandlers;

// ─── Unified event handlers (Mouse + Touch) ─────────────
function handleMove(e) {
  const isTouch = e.type === 'touchmove';
  const clientX = isTouch ? e.touches[0].clientX : e.clientX;
  const clientY = isTouch ? e.touches[0].clientY : e.clientY;

  if (_rotating) {
    if (isTouch) e.preventDefault();
    const angle = Math.atan2(clientY - _rotating.centerY, clientX - _rotating.centerX);
    const deg = (angle - _rotating.startAngle) * (180 / Math.PI);
    let finalDeg = _rotating.currentRotate + deg;
    
    // Snap to 45 degree increments if close
    if (Math.abs(finalDeg % 45) < 5 || Math.abs(finalDeg % 45) > 40) {
      finalDeg = Math.round(finalDeg / 45) * 45;
    }
    
    const rotateStr = finalDeg ? `rotate(${finalDeg}deg)` : '';
    const currentTransform = _rotating.el.style.transform || '';
    if (currentTransform.includes('translateX(-50%)')) {
      _rotating.el.style.transform = `translateX(-50%) ${rotateStr}`;
    } else {
      _rotating.el.style.transform = rotateStr;
    }
    _rotating.el.style.setProperty('--widget-rotate', finalDeg + 'deg'); // Keep for savePosition
    return;
  }

  const layer = document.getElementById('widget-layer');
  if (!layer) return;
  const layerRect = layer.getBoundingClientRect();
  const scale = window.__layerScale || 1;

  if (_resizing) {
    if (isTouch) e.preventDefault();
    const unscaledMouseX = (clientX - layerRect.left) / scale;
    const unscaledMouseY = (clientY - layerRect.top) / scale;
    const dw = unscaledMouseX - _resizing.startX;
    const dh = unscaledMouseY - _resizing.startY;
    const isCard = _resizing.widgetId.startsWith('float-card-widget-');
    let minW = isCard ? 30 : 100, minH = isCard ? 30 : 24;
    if (_resizing.widgetId === 'search-widget') { minW = 280; minH = 52; }
    if (_resizing.widgetId === 'date-widget') { minW = 140; }

    const maxW = Math.max(minW, Math.min(_resizing.centerX, 1280 - _resizing.centerX) * 2 - 10);
    const maxH = Math.max(minH, Math.min(_resizing.centerY, 720 - _resizing.centerY) * 2 - 10);

    let newW = _resizing.startW + dw * 2;
    let newH = _resizing.startH + dh * 2;

    const maxSafeW = Math.min(maxW, _resizing.centerX * 2, (1280 - _resizing.centerX) * 2);
    const maxSafeH = Math.min(maxH, _resizing.centerY * 2, (720 - _resizing.centerY) * 2);

    newW = Math.max(minW, Math.min(newW, maxSafeW));
    newH = Math.max(minH, Math.min(newH, maxSafeH));
    const root = document.documentElement;

    // Symmetric resizing
    const currentRotate = _resizing.el.style.getPropertyValue('--widget-rotate') || '0deg';
    if (_resizing.wasCentered) {
      _resizing.el.style.transform = `translateX(-50%) ${currentRotate}`.trim();
    } else {
      _resizing.el.style.transform = currentRotate;
      _resizing.el.style.left = (_resizing.centerX - newW / 2) + 'px';
    }
    _resizing.el.style.maxWidth = 'none'; // Clear panel-imposed max-width during visual drag
    _resizing.el.style.width = newW + 'px';

    if (_resizing.widgetId === 'search-widget') {
      _resizing.el.style.height = newH + 'px';
      _resizing.el.style.top = (_resizing.centerY - newH / 2) + 'px';
      root.style.setProperty('--search-width', newW + 'px');
      root.style.setProperty('--search-height', newH + 'px');
    } else if (_resizing.widgetId.startsWith('float-card-widget-')) {
      _resizing.el.style.height = newH + 'px';
      _resizing.el.style.top = (_resizing.centerY - newH / 2) + 'px';
    } else if (_resizing.widgetId === 'clock-widget') {
      const fontSize = Math.max(1.5, Math.min(10, newW / 65));
      root.style.setProperty('--clock-font-size', fontSize + 'rem');
    } else if (_resizing.widgetId === 'date-widget') {
      const fontSize = Math.max(0.7, Math.min(3, newW / 150));
      root.style.setProperty('--date-font-size', fontSize + 'rem');
    }
    return;
  }

  if (!_dragging) return;
  if (isTouch) e.preventDefault();

  const unscaledMouseX = (clientX - layerRect.left) / scale;
  const unscaledMouseY = (clientY - layerRect.top) / scale;

  let left = unscaledMouseX - _dragging.offsetX;
  let top = unscaledMouseY - _dragging.offsetY;

  const w = _dragging.el.offsetWidth;
  const h = _dragging.el.offsetHeight;

  // Calculate actual viewport bounds in virtual (unscaled) coordinates
  // so widgets can reach the real screen edges, not just the 1280x720 layer
  const vpLeft = -layerRect.left / scale;
  const vpTop = -layerRect.top / scale;
  const vpRight = vpLeft + window.innerWidth / scale;
  const vpBottom = vpTop + window.innerHeight / scale;

  left = Math.max(vpLeft, Math.min(left, vpRight - w));
  top = Math.max(vpTop, Math.min(top, vpBottom - h));

  // Snap to horizontal center of virtual screen
  const snapZone = 20;
  if (Math.abs((left + w / 2) - 640) < snapZone) {
    left = 640 - w / 2;
  }

  _dragging.el.style.left = left + 'px';
  _dragging.el.style.top = top + 'px';
  _dragging.el.style.transform = _dragging.rotateStr;
}

function handleEnd() {
  if (_dragging) {
    savePosition(_dragging.el.id);
    _dragging.el.style.zIndex = '';
    _dragging = null;
    layoutWidgets();
  }
  if (_resizing) {
    // Save the current pixel position first
    savePosition(_resizing.widgetId);

    // Now read back the freshly saved data and merge width/height/fontSize
    const s = lsGet('widgetPositions', {});
    const root = document.documentElement;
    const cs = getComputedStyle(root);
    s[_resizing.widgetId] = {
      ...s[_resizing.widgetId],
      width: _resizing.el.offsetWidth,
      height: _resizing.el.offsetHeight
    };
    if (_resizing.widgetId === 'clock-widget') {
      s[_resizing.widgetId].fontSize = parseFloat(cs.getPropertyValue('--clock-font-size')) || 6;
    }
    if (_resizing.widgetId === 'date-widget') {
      s[_resizing.widgetId].fontSize = parseFloat(cs.getPropertyValue('--date-font-size')) || 1.25;
    }
    lsSet('widgetPositions', s);
    _resizing = null;
    layoutWidgets();
  }
  if (_rotating) {
    savePosition(_rotating.widgetId);
    _rotating = null;
    layoutWidgets();
  }
}

document.addEventListener('mousemove', handleMove, { passive: false });
document.addEventListener('touchmove', handleMove, { passive: false });
document.addEventListener('mouseup', handleEnd);
document.addEventListener('touchend', handleEnd);


function setEditLayout(enabled) {
  const isSmall = window.innerWidth <= 600;
  const targetEnabled = isSmall ? false : enabled;
  document.body.classList.toggle('edit-layout', targetEnabled);
  lsSet('editLayout', enabled);
}
window.__setEditLayout = setEditLayout;
window.__layoutWidgets = layoutWidgets;


// ─── Bootstrap ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Prevent any automatic layout resets on new tab load
  if (!lsGet('position_persistence_wb', false)) {
    lsSet('position_persistence_wb', true);
    lsSet('widgetPositions', {});
  }

  // Fast synchronous init for non-IDB settings
  const fastSettings = { ...DEFAULT_SETTINGS };
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith('wb_')) {
      try { fastSettings[k.slice(3)] = JSON.parse(localStorage.getItem(k)); } catch (_) { }
    }
  }
  applyAccentColor(fastSettings.accentColor, fastSettings);
  if (window.__wallpaperEngine) window.__wallpaperEngine.init(fastSettings);

  const settings = await getAllSettings();
  window.__currentSettings = settings;
  applyAccentColor(settings.accentColor, settings);

  applyResponsiveScale();

  // Preload critical assets
  if (settings.wallpaperType === 'video' && settings.videoUrl && typeof settings.videoUrl === 'string') {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'video';
    link.href = settings.videoUrl;
    document.head.appendChild(link);
  }

  // Apply IDB updates
  if (window.__wallpaperEngine) {
    window.__wallpaperEngine.applySettings(settings);
  }

  // Clear instant cache background once real engine has rendered its first frames
  window.__clearWallpaperCache = function() {
    if (window.__wallpaperCacheCleared) return;
    window.__wallpaperCacheCleared = true;
    document.documentElement.style.backgroundImage = '';
    document.documentElement.style.backgroundSize = '';
    document.documentElement.style.backgroundPosition = '';
    document.documentElement.style.background = '';
  };

  // Safety fallback to clear cache background after 3.5 seconds if first frame event didn't fire
  setTimeout(() => {
    if (typeof window.__clearWallpaperCache === 'function') {
      window.__clearWallpaperCache();
    }
  }, 3500);

  // Generate lightweight thumbnail cache for lightning-fast loading on next tab open
  setTimeout(() => {
    try {
      if (settings.wallpaperType === 'css' || settings.wallpaperType === 'webgl') return;
      const c = document.getElementById('wallpaper-container');
      const target = c.querySelector('video') || c.querySelector('img');
      if (target) {
        const thumb = document.createElement('canvas');
        thumb.width = Math.max(1, (target.videoWidth || target.width || target.naturalWidth || window.innerWidth) / 4);
        thumb.height = Math.max(1, (target.videoHeight || target.height || target.naturalHeight || window.innerHeight) / 4);
        thumb.getContext('2d').drawImage(target, 0, 0, thumb.width, thumb.height);
        localStorage.setItem('wb_wallpaper_cache', thumb.toDataURL('image/jpeg', 0.5));
      }
    } catch(e) {}
  }, 1000); // Changed from 2500

  // Load custom fonts from IDB if user uploaded any
  loadCustomFonts(settings);

  window.__clock = new ClockWidget(settings);
  window.__quicklinks = new QuickLinksWidget(settings);
  window.__search = new SearchWidget(settings);

  [window.__clock, window.__quicklinks, window.__search].forEach(w => w.init());

  // ── Float Cards Widget init ──────────────────────────────
  class FloatCardsWidget {
    constructor(s) { this.settings = s; }
    init() { 
      let cards = this.settings.floatCards;
      if (!Array.isArray(cards)) cards = [];
      this._render(cards); 
    }
    _render(cards) {
      const existingIds = new Set(Array.from(document.querySelectorAll('.single-float-card-widget')).map(el => el.id));
      document.querySelectorAll('.single-float-card-widget').forEach(el => el.remove());
      const layer = document.getElementById('widget-layer');
      if (!layer) return;
      
      cards.forEach((card, i) => {
        const widgetId = 'float-card-widget-' + i;
        const widget = document.createElement('div');
        widget.id = widgetId;
        widget.className = 'widget draggable-widget single-float-card-widget' + (!card.url ? ' float-card-glass' : ' has-content');
        if (existingIds.has(widgetId)) widget.classList.add('no-animate');
        
        if (card.url) {
          const isVideo = card.type === 'video' || card.url.startsWith('data:video/') || card.url.toLowerCase().endsWith('.gif');
          if (isVideo) {
            widget.innerHTML = `
              <video class="float-card-img" src="${card.url}" autoplay loop muted playsinline style="width:100%; height:100%; object-fit:cover;"></video>
              <div class="rotate-handle" data-widget="${widgetId}"></div>
              <div class="resize-handle" data-widget="${widgetId}"></div>
            `;
          } else {
            widget.innerHTML = `
              <img class="float-card-img" src="${card.url}" alt="" />
              ${card.caption ? `<div class="float-card-caption" style="position:absolute; top:100%; left:0; width:100%; text-align:center; padding:8px 0; color:var(--text); font-size:0.85rem; text-shadow:0 1px 4px rgba(0,0,0,0.5);">${card.caption}</div>` : ''}
              <div class="rotate-handle" data-widget="${widgetId}"></div>
              <div class="resize-handle" data-widget="${widgetId}"></div>
            `;
          }
        } else {
          widget.innerHTML = `
            <div class="rotate-handle" data-widget="${widgetId}"></div>
            <div class="resize-handle" data-widget="${widgetId}"></div>
          `;
        }
        layer.appendChild(widget);
        
        try {
          const saved = JSON.parse(localStorage.getItem('wb_widgetPositions') || '{}');
          if (!saved[widgetId]) {
            // Stack below each other: start at 15%, then add 20% height + 2% gap for each
            // This ensures they don't overlap by default and stay within screen longer
            // Move cards to the far right to avoid hitting search bar, and make them smaller
            saved[widgetId] = { left: 82, top: 15 + (i * 20), anchorX: 'left', width: 180, height: 130, rotate: 0 };
            localStorage.setItem('wb_widgetPositions', JSON.stringify(saved));
          }
        } catch (e) {}
      });
      
      if (window.__attachDragHandlers) window.__attachDragHandlers();
      if (window.__attachResizeHandlers) window.__attachResizeHandlers();
      if (window.__attachRotateHandlers) window.__attachRotateHandlers();
      if (window.__layoutWidgets) window.__layoutWidgets();
    }
    applySettings(s) {
      this.settings = { ...this.settings, ...s };
      let cards = this.settings.floatCards;
      if (!Array.isArray(cards)) cards = [];
      this._render(cards);
    }
  }
  window.__floatCards = new FloatCardsWidget(settings);
  window.__floatCards.init();

  // Add performance monitoring
  if (performance.timing) {
    window.addEventListener('load', () => {
      setTimeout(() => {
        const loadTime = performance.timing.loadEventEnd - performance.timing.navigationStart;
        console.log('[Wallibe] Page load time:', loadTime, 'ms');
        console.log('[Wallibe] localStorage used:', (JSON.stringify(localStorage).length / 1024).toFixed(2), 'KB');
      }, 100);
    });
  }

  attachDragHandlers();
  attachResizeHandlers();
  attachRotateHandlers();

  // One-time layout adjustment ensure it doesn't clear custom positions
  const runLayout = () => {
    layoutWidgets();
  };

  runLayout(); // Run instantly to prevent visual jump
  setTimeout(runLayout, 300); // Nudge layout after settling
  window.addEventListener('resize', debounce(layoutWidgets, 150));
});
