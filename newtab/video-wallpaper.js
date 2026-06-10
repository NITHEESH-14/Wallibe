/**
 * Wallibe — Video Wallpaper (video-wallpaper.js)
 * Handles <video> based fullscreen wallpaper with pre-warm decode.
 */

'use strict';

class VideoWallpaper {
  constructor(settings) {
    this.settings = settings;
    this.el = document.getElementById('video-wallpaper');
    this.objectUrl = null;
  }

  async mount() {
    const { videoUrl } = this.settings;
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }

    if (!videoUrl) {
      // Use bundled fallback video
      this.el.src = '../assets/wallpapers/default.mp4';
    } else if (videoUrl instanceof Blob) {
      this.objectUrl = URL.createObjectURL(videoUrl);
      this.el.src = this.objectUrl;
    } else {
      this.el.src = videoUrl;
    }
    this.el.style.display = 'block';

    // Pre-warm decode for smooth first frame
    try { await this.el.decode?.(); } catch (_) {}

    await this.el.play().catch(() => {
      // Autoplay may be blocked — try muted workaround
      this.el.muted = true;
      return this.el.play();
    });

    if (window.__wallpaperEngine && window.__wallpaperEngine.onFirstFrame) {
      window.__wallpaperEngine.onFirstFrame();
    }
  }

  applySettings(s) {
    if (s.videoUrl !== this.settings.videoUrl) {
      this.settings = s;
      this.mount(); // Re-mount to update src and play
    }
    this.settings = s;
  }

  pause()  { this.el.pause(); }
  resume() { this.el.play().catch(() => {}); }
  destroy() {
    this.el.pause();
    this.el.src = '';
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.el.style.display = 'none';
  }
}
