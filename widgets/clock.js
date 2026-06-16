/**
 * Wallibe — Clock Widget (clock.js)
 * Uses setTimeout chain (not setInterval) for better accuracy.
 * Supports 12h / 24h from settings.
 * Supports showSeconds (hide/show :ss) and showDate (hide/show date line).
 */

'use strict';

class ClockWidget {
  constructor(settings) {
    this.settings  = settings;
    this.timeEl    = document.getElementById('clock-time');
    this.dateEl    = document.getElementById('clock-date');
    this.container = document.getElementById('clock-widget');
    this.dateContainer = document.getElementById('date-widget');
    this._timer    = null;
  }

  init() {
    this._updateVisibilities();
    this._tick();
  }

  _tick() {
    const now  = new Date();
    const h24  = now.getHours();
    const min  = String(now.getMinutes()).padStart(2, '0');
    const sec  = String(now.getSeconds()).padStart(2, '0');
    const showSec = this.settings.showSeconds !== false; // default true

    let timeStr;
    if (this.settings.clockFormat === '24h') {
      const hStr = String(h24).padStart(2, '0');
      timeStr = showSec ? `${hStr}:${min}:${sec}` : `${hStr}:${min}`;
    } else {
      const h12  = h24 % 12 || 12;
      const ampm = h24 < 12 ? 'AM' : 'PM';
      const hStr = String(h12);
      const suffix = `<span class="clock-ampm">${ampm}</span>`;
      timeStr = showSec
        ? `${hStr}:${min}:${sec}${suffix}`
        : `${hStr}:${min}${suffix}`;
    }
    this.timeEl.innerHTML = timeStr;

    // Date line
    if (this.settings.showDate !== false) {
      const dayEl   = this.dateEl.querySelector('.date-day');
      const numEl   = this.dateEl.querySelector('.date-num');
      const monthEl = this.dateEl.querySelector('.date-month');

      const dayStr   = now.toLocaleDateString(undefined, { weekday: 'long' }) + ',';
      const numStr   = now.getDate();
      const monthStr = now.toLocaleDateString(undefined, { month: 'long' });

      if (dayEl)   dayEl.textContent = dayStr;
      if (numEl)   numEl.textContent = numStr;
      if (monthEl) monthEl.textContent = monthStr;
    }

    // Schedule next tick
    let delay;
    if (showSec) {
      delay = 1000 - now.getMilliseconds();
    } else {
      const msUntilNextMin = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
      delay = msUntilNextMin;
    }
    this._timer = setTimeout(() => this._tick(), delay);
  }

  _updateVisibilities() {
    if (this.container) {
      this.container.style.display = this.settings.showClock ? 'flex' : 'none';
    }
    if (this.dateContainer) {
      this.dateContainer.style.display = (this.settings.showClock && this.settings.showDate !== false) ? 'flex' : 'none';
    }
  }

  applySettings(s) {
    this.settings = { ...this.settings, ...s };
    this._updateVisibilities();
    // Re-tick immediately so changes apply at once
    clearTimeout(this._timer);
    this._timer = null;
    this._tick();
  }

  destroy() { clearTimeout(this._timer); }
}
