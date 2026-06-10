/**
 * Wallibe — popup.js
 * Settings interactivity: tabs, segmented controls, toggles, sliders, file upload, save.
 */

'use strict';

/* ─── Storage helpers ─────────────────────────────────── */
const IDB = {
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

function saveSettings(s) {
  const largeKeys = ['staticUrl', 'videoUrl', 'clockFontUrl', 'dateFontUrl', 'othersFontUrl', 'searchLogoUrl', 'floatCards'];
  return new Promise(async (res) => {
    // 1. Save large keys to IndexedDB
    for (const key of largeKeys) {
      if (s[key] !== undefined) {
        await IDB.set(key, s[key]);
      }
    }

    // 2. Prepare small settings object
    const smallSettings = { ...s };
    largeKeys.forEach(key => delete smallSettings[key]);

    // 3. Save small settings to storage
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set(smallSettings, res);
    } else {
      Object.entries(smallSettings).forEach(([k, v]) => {
        try { localStorage.setItem('wb_' + k, JSON.stringify(v)); } catch(e){}
      });
      res();
    }
  });
}

function loadSettings() {
  const largeKeys = ['staticUrl', 'videoUrl', 'clockFontUrl', 'dateFontUrl', 'othersFontUrl', 'searchLogoUrl', 'floatCards'];
  return new Promise(async (res) => {
    const out = {};
    
    // 1. Load small settings
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const local = await new Promise(resolve => chrome.storage.local.get(null, resolve));
      Object.assign(out, local);
    } else {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith('wb_')) {
          try { out[k.slice(3)] = JSON.parse(localStorage.getItem(k)); } catch (_) {}
        }
      }
    }

    // 2. Load large keys from IndexedDB
    for (const key of largeKeys) {
      out[key] = await IDB.get(key, out[key] || '');
    }

    res(out);
  });
}

function notifyTab(settings) {
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((t) => {
        chrome.tabs.sendMessage(t.id, { type: 'SETTINGS_UPDATED', settings }).catch(() => {});
      });
    });
  }
}

/* ─── UI helpers ──────────────────────────────────────── */
function activateSeg(group, value) {
  group.querySelectorAll('.seg-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.value === value);
  });
}

function activateEngineBtn(value) {
  document.querySelectorAll('.engine-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.value === value);
  });
}

/* ─── Main ────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  const raw = await loadSettings();
  const s = {
    wallpaperType: 'webgl', wallpaperPreset: 'fluid', webglPreset: 'fluid',
    cssPreset: 'aurora', staticUrl: '', videoUrl: '',
    brightness: 100, blur: 0,
    showClock: true, clockFormat: '12h',
    showQuickLinks: true, showSearch: true,
    searchEngine: 'google',
    quickLinks: [
      { title: 'YouTube', url: 'https://youtube.com' },
      { title: 'GitHub',  url: 'https://github.com' },
      { title: 'Gmail',   url: 'https://mail.google.com' },
      { title: 'Maps',    url: 'https://maps.google.com' }
    ],
    ...raw
  };

  /* ── Tab switching ─────────────────────────────── */
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
  });

  /* ── Wallpaper type ─────────────────────────────── */
  const typeSeg  = document.getElementById('wallpaper-type-seg');
  const panels   = { webgl:'panel-webgl', css:'panel-css', video:'panel-video', static:'panel-static' };

  function showPanel(type) {
    Object.values(panels).forEach(id => document.getElementById(id).classList.add('hidden'));
    if (panels[type]) document.getElementById(panels[type]).classList.remove('hidden');
  }

  activateSeg(typeSeg, s.wallpaperType);
  showPanel(s.wallpaperType);

  typeSeg.querySelectorAll('.seg-btn').forEach((b) => {
    b.addEventListener('click', () => {
      s.wallpaperType = b.dataset.value;
      activateSeg(typeSeg, b.dataset.value);
      showPanel(b.dataset.value);
    });
  });

  /* ── WebGL preset ───────────────────────────────── */
  const webglSeg = document.getElementById('webgl-preset-seg');
  activateSeg(webglSeg, s.webglPreset || s.wallpaperPreset || 'fluid');
  webglSeg.querySelectorAll('.seg-btn').forEach((b) => {
    b.addEventListener('click', () => { s.webglPreset = b.dataset.value; activateSeg(webglSeg, b.dataset.value); });
  });

  /* ── CSS preset ─────────────────────────────────── */
  const cssSeg = document.getElementById('css-preset-seg');
  activateSeg(cssSeg, s.cssPreset || 'aurora');
  cssSeg.querySelectorAll('.seg-btn').forEach((b) => {
    b.addEventListener('click', () => { s.cssPreset = b.dataset.value; activateSeg(cssSeg, b.dataset.value); });
  });

  /* ── Video URL ──────────────────────────────────── */
  const videoUrlEl = document.getElementById('video-url');
  videoUrlEl.value = s.videoUrl || '';
  videoUrlEl.addEventListener('change', () => { s.videoUrl = videoUrlEl.value.trim(); });

  document.getElementById('video-file').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    s.videoUrl = file;
    videoUrlEl.value = file.name;
  });

  /* ── Static URL ─────────────────────────────────── */
  const staticUrlEl = document.getElementById('static-url');
  staticUrlEl.value = s.staticUrl && typeof s.staticUrl === 'string' ? s.staticUrl : '';
  staticUrlEl.addEventListener('change', () => { s.staticUrl = staticUrlEl.value.trim(); });

  document.getElementById('static-file').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      s.staticUrl = ev.target.result;
      staticUrlEl.value = 'Base64 Image';
    };
    reader.readAsDataURL(file);
  });

  /* ── Brightness slider ──────────────────────────── */
  const brightEl  = document.getElementById('brightness');
  const brightVal = document.getElementById('brightness-val');
  brightEl.value  = s.brightness;
  brightVal.textContent = s.brightness + '%';
  brightEl.addEventListener('input', () => { s.brightness = +brightEl.value; brightVal.textContent = s.brightness + '%'; });

  /* ── Blur slider ─────────────────────────────────── */
  const blurEl  = document.getElementById('blur');
  const blurVal = document.getElementById('blur-val');
  blurEl.value  = s.blur;
  blurVal.textContent = s.blur + 'px';
  blurEl.addEventListener('input', () => { s.blur = +blurEl.value; blurVal.textContent = s.blur + 'px'; });

  /* ── Clock toggle + format ──────────────────────── */
  const showClockEl = document.getElementById('show-clock');
  const clockOpts   = document.getElementById('clock-options');
  showClockEl.checked = s.showClock;
  clockOpts.classList.toggle('hidden', !s.showClock);
  showClockEl.addEventListener('change', () => {
    s.showClock = showClockEl.checked;
    clockOpts.classList.toggle('hidden', !s.showClock);
  });

  document.querySelectorAll('[data-group="clock-fmt"]').forEach((b) => {
    b.classList.toggle('active', b.dataset.value === s.clockFormat);
    b.addEventListener('click', () => {
      s.clockFormat = b.dataset.value;
      document.querySelectorAll('[data-group="clock-fmt"]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    });
  });


  /* ── Quick links toggle ─────────────────────────── */
  const showQLEl = document.getElementById('show-quick-links');
  showQLEl.checked = s.showQuickLinks;
  showQLEl.addEventListener('change', () => { s.showQuickLinks = showQLEl.checked; });

  /* ── Search toggle ──────────────────────────────── */
  const showSearchEl = document.getElementById('show-search');
  showSearchEl.checked = s.showSearch;
  showSearchEl.addEventListener('change', () => { s.showSearch = showSearchEl.checked; });

  /* ── Search engine ──────────────────────────────── */
  activateEngineBtn(s.searchEngine);
  document.querySelectorAll('.engine-btn').forEach((b) => {
    b.addEventListener('click', () => {
      s.searchEngine = b.dataset.value;
      activateEngineBtn(b.dataset.value);
    });
  });

  /* ── Quick links editor ─────────────────────────── */
  const linksList = document.getElementById('links-list');

  function renderLinks() {
    linksList.innerHTML = '';
    s.quickLinks.forEach((link, i) => {
      const row = document.createElement('div');
      row.className = 'link-row';
      row.innerHTML = `
        <input class="text-input" type="text"  value="${link.title}" placeholder="Title" />
        <input class="text-input" type="url"   value="${link.url}"   placeholder="https://…" />
        <button class="remove-btn" title="Remove">✕</button>
      `;
      row.querySelectorAll('input')[0].addEventListener('input', (e) => { link.title = e.target.value; });
      row.querySelectorAll('input')[1].addEventListener('input', (e) => { link.url   = e.target.value; });
      row.querySelector('.remove-btn').addEventListener('click', () => {
        s.quickLinks.splice(i, 1); renderLinks();
      });
      linksList.appendChild(row);
    });
  }

  renderLinks();

  document.getElementById('add-link-btn').addEventListener('click', () => {
    s.quickLinks.push({ title: 'New', url: 'https://' });
    renderLinks();
  });

  /* ── Save ────────────────────────────────────────── */
  const saveBtn = document.getElementById('save-btn');
  saveBtn.addEventListener('click', async () => {
    await saveSettings(s);
    notifyTab(s);
    saveBtn.textContent = '✓ Saved!';
    saveBtn.classList.add('saved');
    setTimeout(() => { saveBtn.textContent = '✓ Save & Apply'; saveBtn.classList.remove('saved'); }, 1800);
  });
});
