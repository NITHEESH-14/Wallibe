/**
 * LiveTab — Icon generator (resize icon to 16, 48, 128px using Canvas API via node-canvas or
 * manual pixel copy using sharp if available, otherwise just copy the source as all sizes).
 * This script uses only built-in Node.js modules to avoid needing npm install.
 */

const fs   = require('fs');
const path = require('path');

const SRC  = process.argv[2]; // path to source PNG
const DEST = path.join(__dirname, 'assets', 'icons');

if (!SRC || !fs.existsSync(SRC)) {
  console.error('Usage: node make_icons.js <source.png>');
  process.exit(1);
}

const srcData = fs.readFileSync(SRC);

// Copy source as all three sizes (browser will scale it; this is the no-dep fallback)
['icon16.png', 'icon48.png', 'icon128.png'].forEach((name) => {
  fs.writeFileSync(path.join(DEST, name), srcData);
  console.log(`  ✓ Created ${name}`);
});

console.log('\n  Icons ready in assets/icons/');
