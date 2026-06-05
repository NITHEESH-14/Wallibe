/**
 * Wallibe — Search Widget (search.js)
 * Multi-engine search bar with / keyboard shortcut.
 */

'use strict';

class SearchWidget {
  constructor(settings) {
    this.settings    = settings;
    this.container   = document.getElementById('search-widget');
    this.input       = document.getElementById('search-input');
    this.actionsGrp  = document.getElementById('search-actions-group');
    this.clearBtn    = document.getElementById('search-clear-btn');
    this.searchBtn   = document.getElementById('search-btn');
    this.engineIcon  = document.getElementById('search-engine-icon');
  }

  init() {
    if (!this.settings.showSearch) return;
    this.container.style.display = 'block';
    this._applyEngine(this.settings.searchEngine || 'google', this.settings.searchLogoUrl);
    this._applyAccentColor();
    this._bindEvents();
    // Initial sync with small delay to handle browser autofill
    setTimeout(() => this._checkVisibility(), 50);
  }

  /** Read --accent from :root and apply it to the search icon button */
  _applyAccentColor() {
    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent').trim();
    if (accent && this.searchBtn) {
      this.searchBtn.style.color = accent;
    }
  }

  _bindEvents() {
    this.searchBtn.addEventListener('click', () => this._doSearch());
    this.clearBtn.addEventListener('click', () => {
      this.input.value = '';
      this.input.focus();
      this._checkVisibility();
    });

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._doSearch();
      if (e.key === 'Escape') this.input.blur();
    });

    this.input.addEventListener('input', () => this._checkVisibility());

    // Global "/" shortcut
    this._onKeyDown = (e) => {
      if (e.key === '/' && document.activeElement !== this.input) {
        e.preventDefault();
        this.input.focus();
        this.input.select();
      }
    };
    document.addEventListener('keydown', this._onKeyDown);

    // Watch for accent color changes (when user changes it in settings)
    this._accentObserver = new MutationObserver(() => this._applyAccentColor());
    this._accentObserver.observe(document.documentElement, {
      attributes: true, attributeFilter: ['style']
    });
  }

  _checkVisibility() {
    const hasText = this.input.value.trim().length > 0;
    if (this.actionsGrp) {
      // Toggle the visible class — CSS handles the display logic
      this.actionsGrp.classList.toggle('visible', hasText);
    }
  }

  destroy() {
    if (this._onKeyDown) document.removeEventListener('keydown', this._onKeyDown);
    if (this._accentObserver) this._accentObserver.disconnect();
  }

  _doSearch() {
    const q = this.input.value.trim();
    if (!q) return;
    const engines = {
      google:     `https://www.google.com/search?q=`,
      bing:       `https://www.bing.com/search?q=`,
      duckduckgo: `https://duckduckgo.com/?q=`,
      brave:      `https://search.brave.com/search?q=`
    };
    const base = engines[this.settings.searchEngine] || engines.google;
    window.location.href = base + encodeURIComponent(q);
  }

  _applyEngine(engine, customLogoUrl) {
    const svgs = {
      google: `<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>`,
      bing:   `<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#008373" d="M3.9 0L3 1.1v17l5.9 5.9L18 20.1V6.9l-9 8.2v-6z"/></svg>`,
      duckduckgo: `<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#DE5833" d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm-2.015 16.273c-.911 0-1.65-.74-1.65-1.65 0-.911.739-1.65 1.65-1.65.912 0 1.651.739 1.651 1.65 0 .91-.739 1.65-1.651 1.65zm5.565 0c-.911 0-1.65-.74-1.65-1.65 0-.911.739-1.65 1.65-1.65.912 0 1.651.739 1.651 1.65 0 .91-.739 1.65-1.651 1.65z"/><path fill="#FFF" d="M9.985 14.623c.911 0 1.65-.739 1.65-1.65 0-.912-.739-1.651-1.65-1.651-.912 0-1.651.739-1.651 1.651 0 .911.739 1.65 1.651 1.65zm5.565 0c.912 0 1.651-.739 1.651-1.65 0-.912-.739-1.651-1.651-1.651-.911 0-1.65.739-1.65 1.651 0 .911.739 1.65 1.65 1.65z"/></svg>`,
      brave: `<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#FB542B" d="M22 6.5l-10-6-10 6 2 11h16l2-11zm-10 13c-3 0-6-1.5-7.5-3.5 1-.5 2-1 3.5-1.5 1 2 2.5 3 4 3s3-1 4-3c1.5.5 2.5 1 3.5 1.5-1.5 2-4.5 3.5-7.5 3.5z"/></svg>`,
    };

    if (customLogoUrl) {
      this.engineIcon.innerHTML = `<img src="${customLogoUrl}" style="height:18px;width:18px;display:block;border-radius:3px;" />`;
    } else {
      this.engineIcon.innerHTML = svgs[engine] || svgs.google;
    }

    this.input.placeholder = `Search`;
  }

  applySettings(s) {
    this.settings = { ...this.settings, ...s };
    if (!this.settings.showSearch) {
      this.container.style.display = 'none';
    } else {
      this.container.style.display = 'block';
      this._applyEngine(this.settings.searchEngine || 'google', this.settings.searchLogoUrl);
      this._applyAccentColor();
    }
  }
}
