// Wallibe — Service Worker (background.js)
// Handles install defaults and alarm-based cache invalidation

const DEFAULT_SETTINGS = {
  wallpaperType: 'static',
  webglPreset: 'fluid',
  cssPreset: 'aurora',
  staticUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  videoUrl: '',
  brightness: 100,
  blur: 0,
  accentColor: '#10b981',
  accentColor2: '#34d399',
  useGradient: false,
  gradientIntensity: 20,
  gradientAngle: 135,
  showClock: true,
  clockFormat: '12h',
  showSeconds: true,
  showDate: true,
  showQuickLinks: true,
  showSearch: true,
  searchEngine: 'google',
  searchLogoUrl: '',
  panelLocked: false,
  panelShortcut: 'Alt+S',
  quickLinks: [
    { title: 'YouTube', url: 'https://youtube.com' },
    { title: 'GitHub', url: 'https://github.com' },
    { title: 'Gmail', url: 'https://mail.google.com' },
    { title: 'Maps', url: 'https://maps.google.com' }
  ]
};

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.storage.local.set(DEFAULT_SETTINGS);
    console.log('[Wallibe] Default settings applied to local storage.');
  }
});
