/**
 * LiveTab — Video Wallpaper (video-wallpaper.js)
 * Handles <video> based fullscreen wallpaper with pre-warm decode.
 */

'use strict';

class VideoWallpaper {
  constructor(settings) {
    this.settings = settings;
    this.el = document.getElementById('video-wallpaper');
  }

  async mount() {
    const { videoUrl } = this.settings;
    if (!videoUrl) {
      // Use bundled fallback video
      this.el.src = '../assets/wallpapers/default.mp4';
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
    this.el.style.display = 'none';
  }
}
