/**
 * LiveTab — sidepanel.js (v3.2)
 * Right-edge settings panel.
 *
 * Changes:
 * - Auto-save: all changes persist immediately.
 * - Gradient controls binding.
 * - Quick links: smart favicon fetching + clickable logo for custom upload.
 * - Async storage loading: supports chrome.storage.local for large assets.
 */
'use strict';

(function () {

  const DEFAULT_SETTINGS = {
    wallpaperType: 'static',
    webglPreset: 'fluid',
    cssPreset: 'aurora',
    // One-time nudge resets - Bumped to v5 to avoid clearing current user fixes
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
    searchWidth: 640,
    searchHeight: 48,
    panelLocked: false,
    panelShortcut: 'Alt+S',
    clockFontUrl: '',
    dateFontUrl: '',
    othersFontUrl: '',
    clockFontName: '',
    dateFontName: '',
    othersFontName: '',
    quickLinks: [
      { title: 'YouTube', url: 'https://youtube.com', logo: '' },
      { title: 'GitHub', url: 'https://github.com', logo: '' },
      { title: 'Gmail', url: 'https://mail.google.com', logo: '' },
      { title: 'Maps', url: 'https://maps.google.com', logo: '' }
    ],
    floatCards: [],
    editLayout: false
  };

  /* ─── Storage helpers ─────────────────────────────── */
  function getS(key, fallback) {
    try { const v = localStorage.getItem('lt_' + key); return v !== null ? JSON.parse(v) : fallback; }
    catch (_) { return fallback; }
  }

  async function getAllSettings() {
    const s = { ...DEFAULT_SETTINGS };
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const local = await new Promise(res => chrome.storage.local.get(null, res));
      Object.keys(DEFAULT_SETTINGS).forEach(k => {
        if (local[k] !== undefined) s[k] = local[k];
        else s[k] = getS(k, DEFAULT_SETTINGS[k]);
      });
    } else {
      for (const k of Object.keys(DEFAULT_SETTINGS)) {
        if (['staticUrl', 'videoUrl', 'clockFontUrl', 'dateFontUrl', 'othersFontUrl', 'searchLogoUrl'].includes(k) && window.__IDB) {
          s[k] = await window.__IDB.get(k, getS(k, DEFAULT_SETTINGS[k]));
        } else {
          s[k] = getS(k, DEFAULT_SETTINGS[k]);
        }
      }
    }
    return s;
  }

  async function setS(key, value) {
    try { 
      localStorage.setItem('lt_' + key, JSON.stringify(value)); 
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
        console.warn('[LiveTab] localStorage quota exceeded, falling back to chrome.storage/IDB');
      }
    }
    if (['staticUrl', 'videoUrl', 'clockFontUrl', 'dateFontUrl', 'othersFontUrl', 'searchLogoUrl'].includes(key) && window.__IDB) {
      await window.__IDB.set(key, value);
    }
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ [key]: value });
    }
  }

  function mergeSettings(partial) {
    window.__currentSettings = { ...(window.__currentSettings || {}), ...partial };
    Object.entries(partial).forEach(([k, v]) => setS(k, v));
    return window.__currentSettings;
  }

  function throttle(fn, ms) {
    let last = 0;
    return (...args) => {
      const now = Date.now();
      if (now - last >= ms) {
        last = now;
        fn.apply(this, args);
      }
    };
  }

  function applyWallpaper(settings) {
    if (window.__wallpaperEngine) { window.__wallpaperEngine.applySettings(settings); return; }
    let n = 0;
    const t = setInterval(() => {
      n++;
      if (window.__wallpaperEngine) { clearInterval(t); window.__wallpaperEngine.applySettings(settings); }
      else if (n > 25) { clearInterval(t); console.warn('[LiveTab] engine timeout'); }
    }, 100);
  }

  /* ─── Panel open/close ─────────────────────────────── */
  const panel   = document.getElementById('settings-panel');
  const trigger = document.getElementById('panel-trigger');
  let hideTimer;
  let msgTimer;
  let isBusy = false;

  window.addEventListener('focus', () => { 
    isBusy = false; 
    setTimeout(() => {
      if (!panel.matches(':hover') && !trigger.matches(':hover')) closePanel();
    }, 50);
  }, true);
  const markBusy = () => { isBusy = true; };

  function openPanel()  { clearTimeout(hideTimer); panel.classList.add('open'); document.body.classList.add('panel-open'); }
  function closePanel() { 
    if (isBusy) return;
    hideTimer = setTimeout(() => { panel.classList.remove('open'); document.body.classList.remove('panel-open'); }, 180); 
  }

  function showLockMessage() {
    const lockMsg = document.getElementById('panel-lock-message');
    const lockKey = document.getElementById('panel-lock-key');
    if (!lockMsg) return;
    if (lockKey) lockKey.textContent = window.__currentSettings.panelShortcut || 'Alt+S';
    lockMsg.style.display = 'block';
    void lockMsg.offsetWidth; // trigger reflow
    lockMsg.style.opacity = '1';
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => {
      lockMsg.style.opacity = '0';
      setTimeout(() => { lockMsg.style.display = 'none'; }, 300);
    }, 2000);
  }

  trigger.addEventListener('mouseenter', () => {
    if (window.__currentSettings && window.__currentSettings.panelLocked) showLockMessage();
    else openPanel();
  });
  trigger.addEventListener('mouseleave', e => { 
    if (e.clientX >= window.innerWidth - 25) return;
    if (!panel.contains(e.relatedTarget)) closePanel(); 
  });
  panel.addEventListener('mouseenter',   () => clearTimeout(hideTimer));
  panel.addEventListener('mouseleave',   e => { 
    if (e.clientX >= window.innerWidth - 25) return;
    if (!trigger.contains(e.relatedTarget)) closePanel(); 
  });

  document.addEventListener('keydown', (e) => {
    if (e.repeat || !window.__currentSettings || !window.__currentSettings.panelLocked) return;
    // Don't intercept if user is typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    const shortcut = window.__currentSettings.panelShortcut || 'Alt+S';
    const parts = shortcut.split('+');
    const key = parts[parts.length - 1].toLowerCase();
    const needsAlt = parts.includes('Alt');
    const needsCtrl = parts.includes('Ctrl');
    const needsShift = parts.includes('Shift');
    
    if (e.key.toLowerCase() === key && e.altKey === needsAlt && e.ctrlKey === needsCtrl && e.shiftKey === needsShift) {
      e.preventDefault();
      if (panel.classList.contains('open')) closePanel();
      else openPanel();
    }
  });

  document.querySelectorAll('input[type="file"], input[type="color"]').forEach(inp => {
    inp.addEventListener('click', markBusy);
  });

  /* ─── Edit Layout ─────────────────────────────────── */
  function initEditLayout(settings) {
    const editLayoutToggle = document.getElementById('sp-edit-layout');
    if (!editLayoutToggle) return;
    editLayoutToggle.checked = !!settings.editLayout;
    if (editLayoutToggle.checked && window.__setEditLayout) window.__setEditLayout(true);
    editLayoutToggle.addEventListener('change', () => {
      if (window.__setEditLayout) window.__setEditLayout(editLayoutToggle.checked);
      setS('editLayout', editLayoutToggle.checked);
    });
  }

  /* ─── Reset Layout ────────────────────────────────── */
  const resetBtn = document.getElementById('sp-reset-layout-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (confirm('Reset all widget positions to default?')) {
        localStorage.removeItem('lt_widgetPositions');
        location.reload();
      }
      resetBtn.innerHTML = '<span style="color:var(--sp-accent)">✓ Reset!</span>';
      setTimeout(() => { 
        resetBtn.innerHTML = '<svg class="sp-icon" viewBox="0 0 24 24"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" stroke="currentColor" stroke-width="2" fill="none"/></svg><span>Reset Layout to Default</span>'; 
      }, 1500);
    });
  }

  const searchClear = document.getElementById('sp-search-logo-clear');
  if (searchClear) {
    searchClear.addEventListener('click', () => {
      const s = mergeSettings({ searchLogoUrl: '', searchLogoName: '' });
      if (window.__search) window.__search.applySettings({ searchLogoUrl: '', searchEngine: s.searchEngine });
      searchClear.style.display = 'none';
      const nameEl = document.getElementById('sp-search-logo-name');
      if (nameEl) nameEl.textContent = 'Upload Logo';
      const btnEl = document.getElementById('sp-search-logo-btn');
      if (btnEl) btnEl.classList.remove('active');
    });
  }

  /* ─── Wallpaper Selection ──────────────────────────── */
  function updateWallpaperUI() {
    if (!window.__currentSettings) return;
    const type   = window.__currentSettings.wallpaperType;
    const preset = (type === 'webgl') ? window.__currentSettings.webglPreset : window.__currentSettings.cssPreset;
    document.querySelectorAll('.sp-wp-card').forEach(card => {
      const active = (card.dataset.type === type && card.dataset.preset === preset);
      card.classList.toggle('active', active);
    });
  }

  document.querySelectorAll('.sp-wp-card').forEach(card => {
    card.addEventListener('click', () => {
      const type = card.dataset.type;
      const preset = card.dataset.preset;
      const update = { wallpaperType: type };
      if (type === 'webgl') update.webglPreset = preset;
      if (type === 'css')   update.cssPreset   = preset;
      const s = mergeSettings(update);
      applyWallpaper(s);
      updateWallpaperUI();
    });
  });

  const wpUpload = document.getElementById('sp-wp-upload');
  if (wpUpload) {
    wpUpload.addEventListener('change', e => {
      const file = e.target.files[0]; if (!file) return;
      const type = file.type.startsWith('video/') ? 'video' : 'static';
      const reader = new FileReader();
      reader.onload = ev => {
        const url = ev.target.result;
        const update = { wallpaperType: type };
        if (type === 'video') update.videoUrl = url;
        else update.staticUrl = url;
        const s = mergeSettings(update);
        applyWallpaper(s);
        updateWallpaperUI();
      };
      reader.readAsDataURL(file);
    });
  }

  const setupFontUpload = (type) => {
    const upload = document.getElementById(`sp-${type}-font-upload`);
    const clear = document.getElementById(`sp-${type}-font-clear`);
    if (upload) {
      upload.addEventListener('change', e => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
          const url = ev.target.result;
          const fontKey = `${type}FontUrl`;
          const nameKey = `${type}FontName`;
          // Update __currentSettings FIRST so __loadCustomFonts reads new value
          if (window.__currentSettings) {
            window.__currentSettings[fontKey] = url;
            window.__currentSettings[nameKey] = file.name;
          }
          mergeSettings({ [fontKey]: url, [nameKey]: file.name });
          if (window.__loadCustomFonts) window.__loadCustomFonts();
        };
        reader.readAsDataURL(file);
        e.target.value = ''; // Reset input to allow re-uploading the same file
      });
    }
    if (clear) {
      clear.addEventListener('click', () => {
        const fontKey = `${type}FontUrl`;
        const nameKey = `${type}FontName`;
        if (window.__currentSettings) {
          window.__currentSettings[fontKey] = '';
          window.__currentSettings[nameKey] = '';
        }
        mergeSettings({ [fontKey]: '', [nameKey]: '' });
        if (window.__loadCustomFonts) window.__loadCustomFonts();
      });
    }
  };
  setupFontUpload('clock');
  setupFontUpload('date');
  setupFontUpload('others');

  const searchLogoUpload = document.getElementById('sp-search-logo-upload');
  if (searchLogoUpload) {
    searchLogoUpload.addEventListener('change', e => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        const url = ev.target.result;
        mergeSettings({ searchLogoUrl: url, searchLogoName: file.name });
        if (window.__search) window.__search.applySettings({ searchLogoUrl: url });
        
        // Update UI
        const nameEl = document.getElementById('sp-search-logo-name');
        if (nameEl) nameEl.textContent = file.name;
        const btnEl = document.getElementById('sp-search-logo-btn');
        if (btnEl) {
          btnEl.classList.add('active');
          const oldIcon = btnEl.querySelector('.sp-icon');
          if (oldIcon) oldIcon.remove();
        }
        const clearBtn = document.getElementById('sp-search-logo-clear');
        if (clearBtn) clearBtn.style.display = 'flex';
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    });
  }

  const defaultsToggle = document.getElementById('sp-defaults-toggle');
  const defaultsList   = document.getElementById('sp-defaults-list');
  if (defaultsToggle && defaultsList) {
    defaultsToggle.addEventListener('click', () => {
      const isHidden = defaultsList.style.display === 'none';
      defaultsList.style.display = isHidden ? 'block' : 'none';
      defaultsToggle.classList.toggle('open', isHidden);
    });
  }

  /* ─── Float Cards ──────────────────────────────── */
  const floatCardsContainer = document.getElementById('sp-float-cards-list');
  function renderFloatCards(cards) {
    if (!floatCardsContainer) return;
    floatCardsContainer.innerHTML = '';
    cards.forEach((card, i) => {
      const item = document.createElement('div');
      item.className = 'sp-link-item';
      item.dataset.cardIndex = i;
      item.style.marginBottom = '12px'; // Tighter spacing for buttons
      
      item.innerHTML = `
        <div class="sp-link-row1">
          <label class="sp-font-upload ${card.url ? 'active' : ''}" style="flex:1; height:32px; font-size:0.75rem;">
            ${card.url ? '' : `<svg class="sp-icon" viewBox="0 0 24 24" style="width:14px; height:14px; flex-shrink:0;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`}
            <span class="sp-card-filename">${card.filename || 'Upload Image/GIF'}</span>
            <input type="file" accept="image/*,video/*" class="sp-card-file" hidden />
          </label>
          <button class="sp-link-remove sp-card-remove" title="Delete Card" style="height:32px; width:32px; flex-shrink:0;">✕</button>
        </div>
      `;

      item.querySelector('.sp-card-file').addEventListener('change', e => {
        const file = e.target.files[0]; if (!file) return;
        const type = file.type.startsWith('video/') ? 'video' : 'image';
        const reader = new FileReader();
        reader.onload = ev => {
          cards[i].url = ev.target.result;
          cards[i].filename = file.name;
          cards[i].type = type;
          updateFloatCards(cards);
          renderFloatCards(cards);
        };
        reader.readAsDataURL(file);
        e.target.value = '';
      });

      item.querySelector('.sp-card-remove').addEventListener('click', () => {
        cleanStoredPositions('float-card-widget-', i, cards.length);
        cards.splice(i, 1);
        updateFloatCards(cards);
        renderFloatCards(cards);
      });

      floatCardsContainer.appendChild(item);
    });
  }

  function cleanStoredPositions(prefix, deletedIndex, totalCount) {
    try {
      const saved = JSON.parse(localStorage.getItem('lt_widgetPositions') || '{}');
      // Shift all subsequent positions up by one index
      for (let j = deletedIndex; j < totalCount - 1; j++) {
        const nextId = prefix + (j + 1);
        const currId = prefix + j;
        if (saved[nextId]) saved[currId] = saved[nextId];
        else delete saved[currId];
      }
      // Delete the last one
      delete saved[prefix + (totalCount - 1)];
      localStorage.setItem('lt_widgetPositions', JSON.stringify(saved));
    } catch (e) {}
  }

  function updateFloatCards(cards) {
    const s = mergeSettings({ floatCards: [...cards] });
    window.__floatCards?.applySettings(s);
  }

  const addFloatCardBtn = document.getElementById('sp-add-float-card-btn');
  if (addFloatCardBtn) {
    addFloatCardBtn.addEventListener('click', () => {
      let cards = window.__currentSettings?.floatCards;
      if (!Array.isArray(cards)) cards = [];
      cards = [...cards];
      cards.push({ url: '' });
      renderFloatCards(cards);
      updateFloatCards(cards);
    });
  }

  /* ─── Color Picker ────────────────────────────────── */
  const colorCard     = document.getElementById('sp-color-card');
  const colorToggle   = document.getElementById('sp-color-toggle');
  const colorClose    = document.getElementById('sp-color-close');
  const satField      = document.getElementById('sp-picker-sat-field');
  const satCursor     = document.getElementById('sp-picker-cursor');
  const hueSlider     = document.getElementById('sp-picker-hue-slider');
  const hexInput      = document.getElementById('sp-picker-hex-input');
  const colorPreview  = document.getElementById('sp-picker-color-preview');
  const mainColor2Preview = document.getElementById('sp-main-color2-preview');
  const cardTitle     = document.getElementById('sp-card-title');

  let currentPickerTarget = 'primary';
  let h = 0, s = 0, v = 0;

  function adjustColor(hex, amt) {
    hex = hex.replace('#','');
    if (hex.length === 3) hex = hex.split('').map(c => c+c).join('');
    let r = parseInt(hex.substring(0,2),16), g = parseInt(hex.substring(2,4),16), b = parseInt(hex.substring(4,6),16);
    r = Math.min(255, Math.max(0, r + amt)); g = Math.min(255, Math.max(0, g + amt)); b = Math.min(255, Math.max(0, b + amt));
    const f2h = x => Math.round(x).toString(16).padStart(2,'0');
    return '#' + f2h(r) + f2h(g) + f2h(b);
  }

  function hsv2hex(h, s, v) {
    let r, g, b, i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    switch (i % 6) {
      case 0: r = v, g = t, b = p; break; case 1: r = q, g = v, b = p; break; case 2: r = p, g = v, b = t; break;
      case 3: r = p, g = q, b = v; break; case 4: r = t, g = p, b = v; break; case 5: r = v, g = p, b = q; break;
    }
    const f2h = x => Math.round(x*255).toString(16).padStart(2,'0');
    return `#${f2h(r)}${f2h(g)}${f2h(b)}`.toUpperCase();
  }

  function hex2hsv(hex) {
    hex = hex.replace('#','');
    if (hex.length === 3) hex = hex.split('').map(c => c+c).join('');
    let r = parseInt(hex.substring(0,2),16)/255, g = parseInt(hex.substring(2,4),16)/255, b = parseInt(hex.substring(4,6),16)/255;
    let max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min, h, s = (max === 0 ? 0 : d / max), v = max;
    if (max === min) h = 0; else {
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return { h: (isNaN(h) ? 0 : h), s, v };
  }

  function updatePickerUI(silent = false) {
    const hex = hsv2hex(h, s, v);
    if (satField) satField.style.backgroundColor = hsv2hex(h, 1, 1);
    if (satCursor) { satCursor.style.left = (s * 100) + '%'; satCursor.style.top = ((1 - v) * 100) + '%'; }
    if (hueSlider) hueSlider.value = h * 360;
    if (hexInput) hexInput.value = hex;
    if (colorPreview) colorPreview.style.backgroundColor = hex;
    if (!silent) {
      const key = currentPickerTarget === 'primary' ? 'accentColor' : 'accentColor2';
      const s_update = mergeSettings({ [key]: hex });
      if (currentPickerTarget === 'primary' && colorToggle) colorToggle.style.background = hex;
      if (currentPickerTarget === 'secondary' && mainColor2Preview) mainColor2Preview.style.background = hex;
      if (window.__applyAccentColor) window.__applyAccentColor(window.__currentSettings.accentColor, s_update);
    }
  }

  function handleSatMove(e) {
    const rect = satField.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    s = x; v = 1 - y; updatePickerUI();
  }
  const throttledSatMove = throttle(handleSatMove, 30);

  if (satField) {
    satField.addEventListener('mousedown', e => { 
      markBusy(); throttledSatMove(e); 
      const move = ev => throttledSatMove(ev); 
      const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); }; 
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', up); 
    });
  }
  if (hueSlider) hueSlider.addEventListener('input', () => { h = hueSlider.value / 360; updatePickerUI(); });
  if (hexInput) { hexInput.addEventListener('change', () => { try { const res = hex2hsv(hexInput.value); h = res.h; s = res.s; v = res.v; updatePickerUI(); } catch(_) {} }); }

  function openPicker(target) {
    currentPickerTarget = target;
    colorCard.style.display = 'block'; isBusy = true;
    if (cardTitle) cardTitle.textContent = target === 'primary' ? 'Primary Accent' : 'Secondary Accent';
    const initialHex = window.__currentSettings[target === 'primary' ? 'accentColor' : 'accentColor2'] || '#10b981';
    const res = hex2hsv(initialHex); h = res.h; s = res.s; v = res.v;
    updatePickerUI(true);
  }
  if (colorToggle) colorToggle.addEventListener('click', () => openPicker('primary'));
  if (mainColor2Preview) mainColor2Preview.addEventListener('click', () => openPicker('secondary'));
  if (colorClose) colorClose.addEventListener('click', () => { colorCard.style.display = 'none'; isBusy = false; });

  /* ─── Sliders & Toggles ────────────────────────────── */
  function bindSlider(id, valId, suffix, key, onInput) {
    const el = document.getElementById(id); if (!el) return;
    const valEl = document.getElementById(valId); if (!valEl) return;
    el.value = window.__currentSettings[key];
    valEl.textContent = el.value + suffix;
    const throttledMerge = throttle((val) => {
      const s = mergeSettings({ [key]: val });
      if (['brightness', 'blur', 'fpsLimit'].includes(key)) applyWallpaper(s);
      if (['searchWidth', 'searchHeight'].includes(key)) applySearchSize(s);
      if (onInput) onInput(val, s);
    }, 40);

    el.addEventListener('input', () => {
      valEl.textContent = el.value + suffix;
      const val = isNaN(+el.value) ? el.value : +el.value;
      throttledMerge(val);
    });
  }

  function bindToggle(id, key, onToggle) {
    const el = document.getElementById(id); if (!el) return;
    el.checked = !!window.__currentSettings[key];
    if (onToggle) onToggle(el.checked);
    el.addEventListener('change', () => {
      const s = mergeSettings({ [key]: el.checked });
      if (onToggle) onToggle(el.checked);
      window.__clock?.applySettings(s);
      window.__quicklinks?.applySettings(s);
      window.__search?.applySettings(s);
      if (key === 'useGradient') if (window.__applyAccentColor) window.__applyAccentColor(window.__currentSettings.accentColor, window.__currentSettings);
    });
  }

  function applySearchSize(s) {
    const sw = document.getElementById('search-widget');
    const si = document.getElementById('search-input');
    const btn = document.getElementById('search-btn');
    if (!sw) return;
    const w = s.searchWidth || 640;
    const h = s.searchHeight || 52;
    sw.style.maxWidth = w + 'px';
    if (si && btn) {
      si.style.height = h + 'px';
      // Drive font size via CSS variable so it's consistent with layoutWidgets
      const scaledRem = Math.max(0.8, Math.min(1.4, 1.1 * (h / 52)));
      document.documentElement.style.setProperty('--search-font-size', scaledRem.toFixed(2) + 'rem');
      si.style.fontSize = ''; // Clear any previously set inline style
      const btnSize = Math.max(28, h - 8);
      btn.style.height = btnSize + 'px'; btn.style.width = btnSize + 'px';
    }
    if (window.__layoutWidgets) window.__layoutWidgets();
  }

  /* ─── Quick Links ─────────────────────────────────── */
  const linksContainer = document.getElementById('sp-links-list');
  function getFavicon(url) {
    try { const domain = new URL(url).hostname; return `https://icon.horse/icon/${domain}`; }
    catch (_) { return ''; }
  }
  function renderLinks(links) {
    if (!linksContainer) return;
    linksContainer.innerHTML = '';
    links.forEach((link, i) => {
      const item = document.createElement('div');
      item.className = 'sp-link-item';
      item.dataset.linkIndex = i;
      const hasCustomLogo = !!link.logo;
      const favicon = link.logo || getFavicon(link.url);
      item.innerHTML = `
        <div class="sp-link-row1">
          <div class="sp-logo-wrap" style="position:relative;">
            <label class="sp-logo-btn">
              ${favicon ? `<img src="${favicon}" class="sp-logo-img" />` : '<span class="sp-logo-emoji">🔗</span>'}
              <input type="file" accept="image/*" class="sp-logo-file" hidden />
            </label>
            <button class="sp-logo-clear" title="Remove custom logo" style="position:absolute;top:-5px;right:-5px;width:16px;height:16px;border-radius:50%;background:rgba(255,80,80,0.9);border:none;color:#fff;cursor:pointer;font-size:0.6rem;${hasCustomLogo ? 'display:flex' : 'display:none'};align-items:center;justify-content:center;line-height:1;z-index:2;">✕</button>
          </div>
          <input class="sp-link-name-input" type="text" value="${link.title.replace(/"/g,'&quot;')}" />
          <button class="sp-link-remove">✕</button>
        </div>
        <input class="sp-link-url-input" type="url" value="${link.url}" />
      `;

      // ── Logo upload: targeted patch of this item only ──
      item.querySelector('.sp-logo-file').addEventListener('change', e => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
          links[i].logo = ev.target.result;
          // Patch this item's icon without full re-render
          const logoWrap = item.querySelector('.sp-logo-btn');
          let img = item.querySelector('.sp-logo-img');
          const emojiEl = item.querySelector('.sp-logo-emoji');
          if (emojiEl) emojiEl.remove();
          if (!img) {
            img = document.createElement('img');
            img.className = 'sp-logo-img';
            logoWrap.prepend(img);
          }
          img.src = ev.target.result;
          // Show clear button
          item.querySelector('.sp-logo-clear').style.display = 'flex';
          // Update the actual widget on screen via QuickLinks
          updateLinks(links);
        };
        reader.readAsDataURL(file);
        e.target.value = '';
      });

      // ── Logo clear: patch only this item ──
      item.querySelector('.sp-logo-clear').addEventListener('click', (e) => {
        e.stopPropagation();
        links[i].logo = '';
        const logoWrap = item.querySelector('.sp-logo-btn');
        // Remove existing icon
        item.querySelectorAll('.sp-logo-img, .sp-logo-emoji').forEach(el => el.remove());
        // Show emoji immediately as placeholder
        const placeholder = document.createElement('span');
        placeholder.className = 'sp-logo-emoji';
        placeholder.textContent = '🔗';
        logoWrap.prepend(placeholder);
        item.querySelector('.sp-logo-clear').style.display = 'none';
        // Then try to load favicon in background — swap if successful
        const faviconUrl = getFavicon(links[i].url);
        if (faviconUrl) {
          const testImg = new Image();
          testImg.onload = () => {
            placeholder.remove();
            const img = document.createElement('img');
            img.className = 'sp-logo-img';
            img.src = faviconUrl;
            logoWrap.prepend(img);
          };
          // If favicon fails, the emoji placeholder stays
          testImg.src = faviconUrl;
        }
        updateLinks(links);
      });

      // Immediate URL update; debounced name update to avoid flicker on re-render
      item.querySelector('.sp-link-url-input').addEventListener('input', e => { links[i].url = e.target.value; updateLinks(links); });
      const nameInput = item.querySelector('.sp-link-name-input');
      let _nameTimer;
      nameInput.addEventListener('input', e => {
        links[i].title = e.target.value;
        clearTimeout(_nameTimer);
        _nameTimer = setTimeout(() => updateLinks(links), 400);
      });
      nameInput.addEventListener('blur', e => { links[i].title = e.target.value; updateLinks(links); });
      item.querySelector('.sp-link-remove').addEventListener('click', () => {
        cleanStoredPositions('link-widget-', i, links.length);
        links.splice(i, 1);
        renderLinks(links);
        updateLinks(links);
      });
      linksContainer.appendChild(item);
    });
  }
  function updateLinks(links) {
    const s = mergeSettings({ quickLinks: [...links] });
    window.__quicklinks?.applySettings(s);
  }

  /* ─── Start ───────────────────────────────────────── */
  (async function init() {
    const s = await getAllSettings();
    window.__currentSettings = s;

    updateWallpaperUI();
    initEditLayout(s);

    bindSlider('sp-brightness', 'sp-brightness-val', '%', 'brightness');
    bindSlider('sp-blur',       'sp-blur-val',       'px', 'blur');

    bindSlider('sp-gradient-intensity', 'sp-gr-i-val', '%', 'gradientIntensity', () => {
      // intensity only controls the blend — never touch accentColor2
      const full = window.__currentSettings;
      if (window.__applyAccentColor) window.__applyAccentColor(full.accentColor || '#10b981', full);
    });
    bindSlider('sp-gradient-angle', 'sp-gr-a-val', '°', 'gradientAngle', () => {
      const full = window.__currentSettings;
      if (window.__applyAccentColor) window.__applyAccentColor(full.accentColor || '#10b981', full);
    });

    bindToggle('sp-clock',  'showClock');
    bindToggle('sp-links',  'showQuickLinks');
    bindToggle('sp-search', 'showSearch', (val) => {
      const row = document.getElementById('sp-engine-row');
      if (row) row.style.display = val ? 'grid' : 'none';
    });
    bindToggle('sp-show-seconds', 'showSeconds');
    bindToggle('sp-show-date',    'showDate');

    const fmtBtns = document.querySelectorAll('.sp-fmt-btn');
    if (fmtBtns.length) {
      fmtBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.val === s.clockFormat);
        btn.addEventListener('click', () => {
          fmtBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const merged = mergeSettings({ clockFormat: btn.dataset.val });
          window.__clock?.applySettings(merged);
        });
      });
    }

    const engineBtns = document.querySelectorAll('.sp-engine-btn');
    if (engineBtns.length) {
      engineBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.val === s.searchEngine);
        btn.addEventListener('click', () => {
          engineBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const merged = mergeSettings({ searchEngine: btn.dataset.val });
          window.__search?.applySettings(merged);
        });
      });
    }
    
    const gradControls = document.getElementById('sp-gradient-controls');
    bindToggle('sp-accent-gradient', 'useGradient', (val) => {
      if (gradControls) gradControls.style.display = val ? 'block' : 'none';
    });

    bindToggle('sp-lock-panel', 'panelLocked', (val) => {
      const row = document.getElementById('sp-shortcut-row');
      if (row) row.style.display = val ? 'flex' : 'none';
    });

    const shortcutInput = document.getElementById('sp-panel-shortcut');
    if (shortcutInput) {
      shortcutInput.value = s.panelShortcut || 'Alt+S';
      shortcutInput.addEventListener('keydown', (e) => {
        e.preventDefault();
        if (e.key === 'Escape') { shortcutInput.blur(); return; }
        if (['Alt','Control','Shift','Meta','Dead'].includes(e.key)) return;
        
        let keys = [];
        if (e.ctrlKey) keys.push('Ctrl');
        if (e.altKey) keys.push('Alt');
        if (e.shiftKey) keys.push('Shift');
        let keyChar = e.key.length === 1 ? e.key.toUpperCase() : e.key;
        if (keyChar === ' ') keyChar = 'Space';
        keys.push(keyChar);
        
        const combo = keys.join('+');
        shortcutInput.value = combo;
        mergeSettings({ panelShortcut: combo });
      });
    }


    renderLinks(s.quickLinks || []);
    document.getElementById('sp-add-link-btn').addEventListener('click', () => {
      // Spread into new array to prevent shared reference with widget's internal state
      const links = [...(window.__currentSettings.quickLinks || [])];
      links.push({ title:'New Link', url:'https://', logo:'' });
      renderLinks(links);
      updateLinks(links);
    });

    let fc = s.floatCards;
    if (!Array.isArray(fc)) fc = [];
    renderFloatCards(fc);

    applySearchSize(s);
    if (colorToggle) colorToggle.style.background = s.accentColor;
    if (mainColor2Preview) mainColor2Preview.style.background = s.accentColor2;

    const searchClear = document.getElementById('sp-search-logo-clear');
    if (searchClear) searchClear.style.display = s.searchLogoUrl ? 'flex' : 'none';
    const searchLogoName = document.getElementById('sp-search-logo-name');
    if (searchLogoName && s.searchLogoUrl) searchLogoName.textContent = s.searchLogoName || 'Custom Logo';
    const searchLogoBtn = document.getElementById('sp-search-logo-btn');
    if (searchLogoBtn) {
      if (s.searchLogoUrl) {
        searchLogoBtn.classList.add('active');
        const icon = searchLogoBtn.querySelector('.sp-icon');
        if (icon) icon.remove();
      } else {
        searchLogoBtn.classList.remove('active');
        if (!searchLogoBtn.querySelector('.sp-icon')) {
          searchLogoBtn.insertAdjacentHTML('afterbegin', `<svg class="sp-icon" viewBox="0 0 24 24" style="width:14px; height:14px; margin-right:4px; flex-shrink:0;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
        }
      }
    }
  })();

})();
