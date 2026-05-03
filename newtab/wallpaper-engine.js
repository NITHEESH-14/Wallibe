/**
 * LiveTab — Wallpaper Engine (wallpaper-engine.js)
 * Central controller: reads settings, initializes the right renderer,
 * and handles visibility-based pause/resume for zero CPU when hidden.
 */

'use strict';

class WallpaperEngine {
  constructor() {
    this.current = null;       // active renderer instance
    this.settings = {};
    this._bound_onVisibility = this._onVisibility.bind(this);
  }

  async init(settings) {
    this.settings = settings;
    document.addEventListener('visibilitychange', this._bound_onVisibility);
    await this._mount(settings.wallpaperType);
  }

  async applySettings(settings) {
    const typeChanged = settings.wallpaperType !== this.settings.wallpaperType;
    this.settings = settings;
    this._applyOverlay();

    if (typeChanged) {
      this._destroyCurrent();
      await this._mount(settings.wallpaperType);
    } else if (this.current && this.current.applySettings) {
      this.current.applySettings(settings);
    }
  }

  /* ─── Private ──────────────────────────────────────── */

  async _mount(type) {
    this._hideAll();
    switch (type) {
      case 'video':  this.current = new VideoWallpaper(this.settings);  break;
      case 'webgl':  this.current = new WebGLWallpaper(this.settings);  break;
      case 'css':    this.current = new CSSWallpaper(this.settings);    break;
      case 'static': this._mountStatic();                               return;
      default:       this.current = new WebGLWallpaper(this.settings);
    }
    await this.current.mount();
    this._applyOverlay();
  }

  _mountStatic() {
    const img = document.getElementById('static-wallpaper');
    if (this.settings.staticUrl) {
      img.src = this.settings.staticUrl;
      img.style.display = 'block';
    }
    this._applyOverlay();
  }

  _destroyCurrent() {
    if (this.current && this.current.destroy) this.current.destroy();
    this.current = null;
    this._hideAll();
  }

  _hideAll() {
    document.getElementById('video-wallpaper').style.display  = 'none';
    document.getElementById('webgl-canvas').style.display     = 'none';
    document.getElementById('css-wallpaper').style.display    = 'none';
    document.getElementById('static-wallpaper').style.display = 'none';
  }

  _applyOverlay() {
    const overlay = document.getElementById('wallpaper-overlay');
    const b = 100 - (this.settings.brightness ?? 100);
    const blur = this.settings.blur ?? 0;
    overlay.style.background = `rgba(0,0,0,${(b / 100).toFixed(2)})`;
    overlay.style.backdropFilter = blur > 0 ? `blur(${blur}px)` : 'none';
  }

  _onVisibility() {
    if (!this.current) return;
    // Let the browser naturally throttle WebGL (rAF) and CSS animations to preserve the frozen frame.
    // Only manually pause video playback to save battery/CPU.
    if (this.settings.wallpaperType === 'video') {
      if (document.hidden) {
        this.current.pause && this.current.pause();
      } else {
        this.current.resume && this.current.resume();
      }
    }
  }
}

/* ─── Bootstrap ─────────────────────────────────────── */
window.__wallpaperEngine = new WallpaperEngine();
