/**
 * Wallibe — CSS Wallpaper (css-wallpaper.js)
 * Animated gradient wallpapers using pure CSS @keyframes.
 * Zero JS RAF — 100% GPU animated.
 */

'use strict';

class CSSWallpaper {
  constructor(settings) {
    this.settings = settings;
    this.el = document.getElementById('css-wallpaper');
  }

  mount() {
    this.el.style.display = 'block';
    this._apply(this.settings.cssPreset || 'aurora');
    return Promise.resolve();
  }

  _apply(preset) {
    const presets = {
      aurora: {
        background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e, #1a1a4e, #7c6af7, #a78bfa, #302b63)',
        animation:  'aurora 12s ease infinite',
        backgroundSize: '400% 400%'
      },
      sunset: {
        background: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364, #e96c6c, #f7971e, #ffd200)',
        animation:  'sunset 14s ease infinite',
        backgroundSize: '400% 400%'
      },
      ocean: {
        background: 'linear-gradient(135deg, #000428, #004e92, #009ffd, #2af598, #004e92, #000428)',
        animation:  'ocean 16s ease infinite',
        backgroundSize: '400% 400%'
      },
      forest: {
        background: 'linear-gradient(135deg, #0a3d0a, #1a5c1a, #2e8b2e, #56ab2f, #a8e063, #2e8b2e, #0a3d0a)',
        animation:  'aurora 18s ease infinite',
        backgroundSize: '400% 400%'
      },
      fire: {
        background: 'linear-gradient(135deg, #200122, #6f0000, #cc0000, #e65c00, #f9d423, #e65c00, #6f0000)',
        animation:  'sunset 10s ease infinite',
        backgroundSize: '400% 400%'
      }
    };

    const p = presets[preset] || presets.aurora;
    Object.assign(this.el.style, p);
  }

  applySettings(s) {
    this.settings = s;
    this._apply(s.cssPreset || 'aurora');
  }

  // CSS animations cannot truly pause without pausing the whole page;
  // we just freeze them with animation-play-state.
  pause()   { this.el.style.animationPlayState = 'paused'; }
  resume()  { this.el.style.animationPlayState = 'running'; }
  destroy() {
    this.el.style.display     = 'none';
    this.el.style.background  = '';
    this.el.style.animation   = '';
  }
}
