/**
 * Wallibe — Dev Server (server.js)
 * Simple Node.js static file server for localhost preview.
 * Run: node server.js
 * Then open: http://localhost:3000
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = 3001;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'text/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.ico':  'image/x-icon',
  '.glsl': 'text/plain',
  '.woff2':'font/woff2',
};

const server = http.createServer((req, res) => {
  // Normalize URL — strip query string
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(ROOT, urlPath);

  // Security: prevent directory traversal
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(`404 Not Found: ${urlPath}`);
      } else {
        res.writeHead(500); res.end('Server error');
      }
      return;
    }

    const ext      = path.extname(filePath).toLowerCase();
    const mimeType = MIME[ext] || 'application/octet-stream';

    // CORS headers (needed for some font/fetch calls)
    res.writeHead(200, {
      'Content-Type':              mimeType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control':             'no-cache'
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n  🌌 Wallibe Dev Server running!\n`);
  console.log(`  → Local:   http://localhost:${PORT}`);
  console.log(`  → Popup:   http://localhost:${PORT}/popup/popup.html`);
  console.log(`\n  Press Ctrl+C to stop.\n`);
});
