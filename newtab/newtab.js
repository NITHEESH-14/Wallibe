/**
 * LiveTab — newtab.js
 * Main orchestrator: loads settings, inits wallpaper engine + all widgets.
 * Includes draggable widget positioning + direct resize (activated via settings panel toggle).
 */

'use strict';

// ── Sync early init: set CSS vars from localStorage before first paint ──────
// This prevents FOUC where search bar briefly shows the 1.5rem fallback
try {
  const _pos = JSON.parse(localStorage.getItem('lt_widgetPositions') || '{}');
  const _sp = _pos['search-widget'];
  if (_sp && _sp.height) {
    const _h = +_sp.height;
    const _f = Math.max(0.9, Math.min(1.8, 1.5 * (_h / 52)));
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
    localStorage.setItem('lt_icon_' + domain, canvas.toDataURL('image/png'));
  } catch (e) {}
};

// ─── Helpers ─────────────────────────────────────────────
function lsGet(key, fallback) {
  try { const v = localStorage.getItem('lt_' + key); return v !== null ? JSON.parse(v) : fallback; }
  catch (_) { return fallback; }
}
function lsSet(key, value) {
  try { localStorage.setItem('lt_' + key, JSON.stringify(value)); } catch (_) { }
  if (typeof chrome !== 'undefined' && chrome.storage) chrome.storage.local.set({ [key]: value });
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function getAllSettings() {
  const settings = { ...DEFAULT_SETTINGS };
  if (typeof chrome !== 'undefined' && chrome.storage) {
    const local = await new Promise(res => chrome.storage.local.get(null, res));
    Object.keys(DEFAULT_SETTINGS).forEach(k => {
      if (local[k] !== undefined) settings[k] = local[k];
      else settings[k] = lsGet(k, DEFAULT_SETTINGS[k]);
    });
  } else {
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      if (['staticUrl', 'videoUrl', 'clockFontUrl', 'dateFontUrl', 'othersFontUrl', 'searchLogoUrl'].includes(k)) {
        settings[k] = await window.__IDB.get(k, lsGet(k, DEFAULT_SETTINGS[k]));
      } else {
        settings[k] = lsGet(k, DEFAULT_SETTINGS[k]);
      }
    }
  }
  return settings;
}

window.__IDB = {
  db: null,
  init() {
    return new Promise(resolve => {
      if (this.db) return resolve(this.db);
      const req = indexedDB.open('LiveTabDB', 1);
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
      console.warn('[LiveTab] Failed to load clock font, falling back to default');
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
    if (url) {
      nameEl.textContent = name || 'Custom Font';
      btnEl.classList.add('active');
      clearEl.style.display = 'flex';
    } else {
      nameEl.textContent = 'Import Font';
      btnEl.classList.remove('active');
      clearEl.style.display = 'none';
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
  'clock-widget': { left: 50, top: 31, anchorX: 'center' },
  'date-widget': { left: 50, top: 49, anchorX: 'center' },
  'search-widget': { left: 50, top: 58, anchorX: 'center' }
};

// ─── Positioning ─────────────────────────────────────────
function applyPosition(el, pos, vw, vh, w, h) {
  let x = (pos.left / 100) * vw;
  let y = (pos.top / 100) * vh;

  if (pos.anchorX === 'center') {
    el.style.left = '50%';
    const t = el.style.transform || '';
    el.style.transform = t.includes('translateY')
      ? t.replace(/translateX\([^)]+\)/, '').trim() + ' translateX(-50%)'
      : 'translateX(-50%)';
  } else if (pos.anchorX === 'right') {
    x = vw - w - (pos.left === 0 ? 0 : (1 - pos.left / 100) * vw);
    el.style.left = x + 'px';
    el.style.transform = (el.style.transform || '').replace(/translateX\([^)]+\)/, '').trim();
  } else {
    el.style.left = x + 'px';
    el.style.transform = (el.style.transform || '').replace(/translateX\([^)]+\)/, '').trim();
  }

  if (pos.anchorY === 'center' || pos.anchorY === 'middle') y = Math.round((vh - h) / 2);
  else if (pos.anchorY === 'bottom') y = y - h;

  el.style.top = y + 'px';
}

function layoutWidgets() {
  const saved = lsGet('widgetPositions', {});
  const vw = window.innerWidth;
  const vh = window.innerHeight;
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
            const fSize = Math.max(0.9, Math.min(1.8, 1.5 * (h / 52)));
            root.style.setProperty('--search-font-size', fSize.toFixed(2) + 'rem');
          }
        }
        if (id === 'clock-widget' && s.fontSize) {
          root.style.setProperty('--clock-font-size', s.fontSize + 'rem');
        }
        if (id === 'date-widget' && s.fontSize) {
          root.style.setProperty('--date-font-size', s.fontSize + 'rem');
        }
      }

      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (w === 0 || h === 0) return null;

      return { el, pos: s, w, h };
    }).filter(Boolean);

    measurements.forEach(m => applyPosition(m.el, m.pos, vw, vh, m.w, m.h));

    if (frameCount < 3) { frameCount++; requestAnimationFrame(pass); }
  };

  pass();
}

function savePosition(widgetId) {
  const el = document.getElementById(widgetId);
  if (!el) return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const saved = lsGet('widgetPositions', {});
  const existing = saved[widgetId] || {};

  // Get current pixel offsets
  const rect = el.getBoundingClientRect();

  let leftVal = (rect.left / vw) * 100;
  let topVal = (rect.top / vh) * 100;
  let anchorX = 'left';

  // Handle snapping/centering — check both CSS value and actual pixel position
  const widgetCenter = rect.left + rect.width / 2;
  const viewportCenter = vw / 2;
  if (el.style.left === '50%' || Math.abs(widgetCenter - viewportCenter) < 15) {
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
    height: el.offsetHeight
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
  const linkWidgets = document.querySelectorAll('.single-link-widget');
  const total = linkWidgets.length;
  const vw = window.innerWidth;
  const linkWidth = 72, gap = 20, stride = linkWidth + gap;
  const groupWidth = total * linkWidth + (total - 1) * gap;
  const groupLeftPx = (vw - groupWidth) / 2;
  linkWidgets.forEach((widget, idx) => {
    savedPos[widget.id] = {
      left: ((groupLeftPx + idx * stride) / vw) * 100,
      top: 72,
      anchorX: 'left',
      anchorY: 'top'
    };
  });
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
  const useGrad = s.useGradient !== undefined ? s.useGradient : lsGet('useGradient', false);
  // intensity: 0 = no gradient (all primary), 100 = full gradient to secondary
  const intensity = s.gradientIntensity !== undefined ? s.gradientIntensity : lsGet('gradientIntensity', 50);
  const angle = s.gradientAngle !== undefined ? s.gradientAngle : lsGet('gradientAngle', 135);
  const primary = color || lsGet('accentColor', '#10b981');

  if (useGrad) {
    // Always use the saved secondary colour; NEVER overwrite it from primary
    const c2 = s.accentColor2 || lsGet('accentColor2', adjustColor(primary, 30));
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

// ─── Drag & Resize state (declare first, use below) ──────
let _dragging = null;
let _resizing = null;

// ─── Drag handlers ───────────────────────────────────────────
function _startDrag(el, clientX, clientY) {
  if (!document.body.classList.contains('edit-layout')) return false;
  const rect = el.getBoundingClientRect();

  // KEY FIX: Convert from any transform/percentage state to plain px FIRST.
  // This prevents the one-frame jump when dragging a centered widget.
  el.style.transform = ''; // clear translateX(-50%) etc
  el.style.left = rect.left + 'px';
  el.style.top = rect.top + 'px';
  el.style.transition = 'none';
  el.style.zIndex = '1000';

  _dragging = {
    el,
    offsetX: clientX - rect.left,
    offsetY: clientY - rect.top
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

// ─── Resize handlers ─────────────────────────────────────
function attachResizeHandlers() {
  document.querySelectorAll('.resize-handle').forEach(handle => {
    const startResize = e => {
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
      const vw = window.innerWidth;
      _resizing = {
        el, widgetId,
        startX: clientX, startY: clientY,
        startW: el.offsetWidth, startH: el.offsetHeight,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
        wasCentered: el.style.left === '50%' || Math.abs((rect.left + rect.width / 2) - vw / 2) < 15
      };

      // Detach transform so px positioning works
      el.style.transform = '';
      el.style.left = rect.left + 'px';
      el.style.top = rect.top + 'px';
    };
    handle.addEventListener('mousedown', startResize, { passive: false });
    handle.addEventListener('touchstart', startResize, { passive: false });
  });
}

// ─── Unified event handlers (Mouse + Touch) ─────────────
function handleMove(e) {
  const isTouch = e.type === 'touchmove';
  const clientX = isTouch ? e.touches[0].clientX : e.clientX;
  const clientY = isTouch ? e.touches[0].clientY : e.clientY;

  if (_resizing) {
    if (isTouch) e.preventDefault();
    const dw = clientX - _resizing.startX;
    const dh = clientY - _resizing.startY;
    let minW = 100, minH = 24;
    if (_resizing.widgetId === 'search-widget') { minW = 280; minH = 52; }
    if (_resizing.widgetId === 'date-widget') { minW = 140; }

    const maxW = Math.max(minW, Math.min(_resizing.centerX, window.innerWidth - _resizing.centerX) * 2 - 10);
    const maxH = Math.max(minH, Math.min(_resizing.centerY, window.innerHeight - _resizing.centerY) * 2 - 10);

    let newW = _resizing.startW + dw * 2;
    let newH = _resizing.startH + dh * 2;

    newW = Math.max(minW, Math.min(newW, maxW));
    newH = Math.max(minH, Math.min(newH, maxH));
    const root = document.documentElement;

    // Symmetric resizing
    _resizing.el.style.transform = 'none';
    _resizing.el.style.maxWidth = 'none'; // Clear panel-imposed max-width during visual drag
    _resizing.el.style.width = newW + 'px';
    _resizing.el.style.left = (_resizing.centerX - newW / 2) + 'px';

    if (_resizing.widgetId === 'search-widget') {
      _resizing.el.style.height = newH + 'px';
      _resizing.el.style.top = (_resizing.centerY - newH / 2) + 'px';
      root.style.setProperty('--search-width', newW + 'px');
      root.style.setProperty('--search-height', newH + 'px');
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

  // Simple absolute-coordinate dragging (no transform math needed)
  let left = clientX - _dragging.offsetX;
  let top = clientY - _dragging.offsetY;

  // Optional: snap to horizontal center of screen
  const vw = window.innerWidth;
  const w = _dragging.el.offsetWidth;
  const snapZone = 20;
  if (Math.abs((left + w / 2) - vw / 2) < snapZone) {
    left = vw / 2 - w / 2;  // align exactly to center
  }

  _dragging.el.style.left = left + 'px';
  _dragging.el.style.top = top + 'px';
  _dragging.el.style.transform = ''; // always clear, we use px coords now
}

function handleEnd() {
  if (_dragging) {
    savePosition(_dragging.el.id);
    _dragging.el.style.zIndex = '999';
    _dragging = null;
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
  }
}

document.addEventListener('mousemove', handleMove, { passive: false });
document.addEventListener('touchmove', handleMove, { passive: false });
document.addEventListener('mouseup', handleEnd);
document.addEventListener('touchend', handleEnd);


function setEditLayout(enabled) {
  document.body.classList.toggle('edit-layout', enabled);
  lsSet('editLayout', enabled);
}
window.__setEditLayout = setEditLayout;
window.__layoutWidgets = layoutWidgets;


// ─── Bootstrap ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Prevent any automatic layout resets on new tab load
  if (!lsGet('position_persistence_v6', false)) {
    lsSet('position_persistence_v6', true);
    lsSet('widgetPositions', {});
  }

  // Fast synchronous init for non-IDB settings
  const fastSettings = { ...DEFAULT_SETTINGS };
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith('lt_')) {
      try { fastSettings[k.slice(3)] = JSON.parse(localStorage.getItem(k)); } catch (_) { }
    }
  }
  applyAccentColor(fastSettings.accentColor, fastSettings);
  if (window.__wallpaperEngine) window.__wallpaperEngine.init(fastSettings);

  const settings = await getAllSettings();
  window.__currentSettings = settings;

  // Preload critical assets
  if (settings.wallpaperType === 'video' && settings.videoUrl) {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'video';
    link.href = settings.videoUrl;
    document.head.appendChild(link);
  }

  // Apply IDB updates if needed (e.g. static/video URLs loaded)
  if (window.__wallpaperEngine && (settings.wallpaperType === 'static' || settings.wallpaperType === 'video')) {
    window.__wallpaperEngine.applySettings(settings);
  }

  // Clear instant cache background once real engine has rendered its first frames
  setTimeout(() => {
    document.documentElement.style.backgroundImage = '';
    document.documentElement.style.backgroundSize = '';
    document.documentElement.style.backgroundPosition = '';
  }, 400); // Reduced from 800ms

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
        localStorage.setItem('lt_wallpaper_cache', thumb.toDataURL('image/jpeg', 0.5));
      }
    } catch(e) {}
  }, 1000); // Changed from 2500

  // Load custom fonts from IDB if user uploaded any
  loadCustomFonts(settings);

  window.__clock = new ClockWidget(settings);
  window.__quicklinks = new QuickLinksWidget(settings);
  window.__search = new SearchWidget(settings);

  [window.__clock, window.__quicklinks, window.__search].forEach(w => w.init());

  // Add performance monitoring
  if (performance.timing) {
    window.addEventListener('load', () => {
      setTimeout(() => {
        const loadTime = performance.timing.loadEventEnd - performance.timing.navigationStart;
        console.log('[LiveTab] Page load time:', loadTime, 'ms');
        console.log('[LiveTab] localStorage used:', (JSON.stringify(localStorage).length / 1024).toFixed(2), 'KB');
      }, 100);
    });
  }

  attachDragHandlers();
  attachResizeHandlers();

  // One-time layout adjustment ensure it doesn't clear custom positions
  const runLayout = () => {
    layoutWidgets();
  };

  runLayout(); // Run instantly to prevent visual jump
  setTimeout(runLayout, 300); // Nudge layout after settling
  window.addEventListener('resize', debounce(layoutWidgets, 150));
});
