/**
 * Wallibe — Quick Links Widget (quicklinks.js)
 * Renders each link as its own independently draggable widget.
 * Supports: custom uploaded logo image, custom emoji, or Google favicon fallback.
 */

'use strict';

class QuickLinksWidget {
  constructor(settings) {
    this.settings = settings;
  }

  init() {
    this._render(this.settings.quickLinks || []);
  }

  _render(links) {
    // Track which link widget IDs already existed (to suppress re-animation)
    const existingIds = new Set(
      Array.from(document.querySelectorAll('.single-link-widget')).map(el => el.id)
    );

    // Remove any previously injected link widgets
    document.querySelectorAll('.single-link-widget').forEach(el => el.remove());

    if (!this.settings.showQuickLinks || !links.length) return;

    const layer = document.getElementById('widget-layer');
    if (!layer) return;

    links.forEach((link, i) => {
      const widgetId = 'link-widget-' + i;

      const widget = document.createElement('div');
      widget.id = widgetId;
      widget.className = 'widget draggable-widget single-link-widget';
      // Suppress animation for widgets that were already on screen
      if (existingIds.has(widgetId)) widget.classList.add('no-animate');

      const a = document.createElement('a');
      a.className = 'quicklink-item';
      a.href = link.url;
      a.title = link.title;
      a.innerHTML = `<div class="quicklink-icon-wrap">${this._buildIcon(link)}</div><span class="quicklink-label">${link.title}</span>`;

      widget.appendChild(a);
      const rotateHandle = document.createElement('div');
      rotateHandle.className = 'rotate-handle';
      rotateHandle.dataset.widget = widgetId;
      widget.appendChild(rotateHandle);
      layer.appendChild(widget);

      // Set default position — pixel-accurate centering of the entire group
      try {
        const saved = JSON.parse(localStorage.getItem('wb_widgetPositions') || '{}');
        if (!saved[widgetId]) {
          const total = links.length;
          const linkWidth = 72;  // px — matches .quicklink-item width
          const gap = 20;        // px gap between each link
          const stride = linkWidth + gap;
          const groupWidth = total * linkWidth + (total - 1) * gap;
          const vw = 1280;
          const groupLeftPx = (vw - groupWidth) / 2;
          saved[widgetId] = {
            left: ((groupLeftPx + i * stride) / vw) * 100,
            top: 72,
            anchorX: 'left',
            anchorY: 'top'
          };
          localStorage.setItem('wb_widgetPositions', JSON.stringify(saved));
        }
      } catch (e) { /* ignore */ }
    });

    // Re-attach drag handlers and re-layout to position the new widgets
    if (window.__attachDragHandlers) window.__attachDragHandlers();
    if (window.__layoutWidgets) window.__layoutWidgets();
  }

  /**
   * Returns the inner HTML for a quick link icon.
   * Priority: 1) custom uploaded logo (base64/blob), 2) emoji/text, 3) Google favicon
   */
  _buildIcon(link) {
    // 1) Custom uploaded image (data URL or blob URL)
    if (link.logo && link.logo.length > 0) {
      return `<img class="quicklink-favicon" src="${link.logo}" alt="${link.title}" loading="lazy" />`;
    }

    // 2) Custom emoji / text logo
    if (link.emoji && link.emoji.trim().length > 0) {
      return `<span style="font-size:1.5rem;display:flex;align-items:center;justify-content:center;width:100%;height:100%">${link.emoji}</span>`;
    }

    // 3) Google favicon with inline emoji fallback
    const domain     = this._getDomain(link.url);
    const cacheKey   = 'wb_icon_' + domain;
    const cached     = localStorage.getItem(cacheKey);
    const faviconUrl = cached || `https://icon.horse/icon/${domain}`;

    return `
      <img class="quicklink-favicon"
           crossorigin="anonymous"
           src="${faviconUrl}"
           alt="${link.title}"
           loading="lazy"
           onload="window.__cacheIcon && window.__cacheIcon(this, '${domain}')"
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
      />
      <span class="quicklink-emoji-fb" style="display:none;font-size:1.5rem;align-items:center;justify-content:center;width:100%;height:100%">
        ${this._emojiForUrl(link.url)}
      </span>`;
  }

  _getDomain(url) {
    try { return new URL(url).hostname; } catch (_) { return url; }
  }

  _emojiForUrl(url) {
    const u = url.toLowerCase();
    if (u.includes('youtube'))  return '▶️';
    if (u.includes('github'))   return '🐙';
    if (u.includes('gmail') || u.includes('mail')) return '📧';
    if (u.includes('maps'))     return '🗺️';
    if (u.includes('twitter') || u.includes('x.com')) return '𝕏';
    if (u.includes('reddit'))   return '🤖';
    if (u.includes('netflix'))  return '🎬';
    if (u.includes('spotify'))  return '🎵';
    if (u.includes('discord'))  return '💬';
    if (u.includes('linkedin')) return '💼';
    return '🔗';
  }

  applySettings(s) {
    if (s.showQuickLinks !== undefined && s.showQuickLinks !== this.settings.showQuickLinks) {
      this.settings = { ...this.settings, ...s };
      if (!this.settings.showQuickLinks) {
        document.querySelectorAll('.single-link-widget').forEach(el => el.remove());
      } else {
        this._render(this.settings.quickLinks || []);
      }
      return;
    }

    const oldLinks = this.settings.quickLinks || [];
    const newLinks = s.quickLinks || [];

    // Check if only titles/urls changed (no logo changes, same count) — do targeted DOM update
    let needsFullRender = oldLinks.length !== newLinks.length;
    if (!needsFullRender) {
      for (let i = 0; i < newLinks.length; i++) {
        if ((oldLinks[i]?.logo || '') !== (newLinks[i]?.logo || '')) { needsFullRender = true; break; }
      }
    }

    this.settings = { ...this.settings, ...s };

    if (needsFullRender) {
      this._render(this.settings.quickLinks || []);
    } else {
      // Targeted update: only patch label and href
      newLinks.forEach((link, i) => {
        const widget = document.getElementById('link-widget-' + i);
        if (!widget) return;
        const label = widget.querySelector('.quicklink-label');
        const anchor = widget.querySelector('.quicklink-item');
        if (label && label.textContent !== link.title) label.textContent = link.title;
        if (anchor) { anchor.href = link.url; anchor.title = link.title; }
      });
    }
  }
}
