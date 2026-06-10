/**
 * Wallibe — Wallpaper Engine (wallpaper-engine.js)
 * Central controller: reads settings, initializes the right renderer,
 * and handles visibility-based pause/resume for zero CPU when hidden.
 */

'use strict';

class WallpaperEngine {
  constructor() {
    this.current = null;       // active renderer instance
    this.settings = {};
    this._isPaused = false;
    this._pauseTimeout = null;
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
    this._isPaused = false;
    clearTimeout(this._pauseTimeout);
    // Show loading state for better UX
    document.getElementById('wallpaper-container').classList.add('loading');
    
    switch (type) {
      case 'video':  this.current = new VideoWallpaper(this.settings);  break;
      case 'webgl':  this.current = new WebGLWallpaper(this.settings);  break;
      case 'css':    this.current = new CSSWallpaper(this.settings);    break;
      case 'static': 
        this._mountStatic();
        document.getElementById('wallpaper-container').classList.remove('loading');
        return;
      default:       this.current = new WebGLWallpaper(this.settings);
    }
    await this.current.mount();
    this._applyOverlay();
    
    // Remove loading state
    document.getElementById('wallpaper-container').classList.remove('loading');
  }

  _mountStatic() {
    const img = document.getElementById('static-wallpaper');
    if (this.settings.staticUrl) {
      const onImageLoad = () => {
        this.onFirstFrame();
      };
      if (img.complete && img.src === this.settings.staticUrl) {
        onImageLoad();
      } else {
        img.onload = onImageLoad;
        img.src = this.settings.staticUrl;
      }
      img.style.display = 'block';
    } else {
      this.onFirstFrame();
    }
    this._applyOverlay();
  }

  _destroyCurrent() {
    clearTimeout(this._pauseTimeout);
    this._isPaused = false;
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
    overlay.style.webkitBackdropFilter = blur > 0 ? `blur(${blur}px)` : 'none';
  }

  onFirstFrame() {
    if (typeof window.__clearWallpaperCache === 'function') {
      window.__clearWallpaperCache();
    }
  }

  _onVisibility() {
    if (!this.current) return;
    if (document.hidden) {
      if (this._isPaused) return;
      // Delay pausing to allow browser/OS to capture Alt-Tab thumbnail
      clearTimeout(this._pauseTimeout);
      this._pauseTimeout = setTimeout(() => {
        if (this.current && this.current.pause) {
          this.current.pause();
          this._isPaused = true;
        }
      }, 2000);
    } else {
      clearTimeout(this._pauseTimeout);
      if (this._isPaused) {
        if (this.current.resume) this.current.resume();
        this._isPaused = false;
      }
    }
  }
}

/* ─── Bootstrap ─────────────────────────────────────── */
window.__wallpaperEngine = new WallpaperEngine();
