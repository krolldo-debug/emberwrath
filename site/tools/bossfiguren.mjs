// Bossfiguren für die Dungeon-Marken auf /welt (site/img/tor-*.png): erstes Ruhebild der Spielfigur, zugeschnitten, 1:1.
// node site/tools/bossfiguren.mjs [OUT=site/img] [URL=http://localhost:8102/index.html]   (Server im Repo-Ordner)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';

const [OUT = 'site/img', URL = 'http://localhost:8102/index.html'] = process.argv.slice(2);
const BOSSE = [
  ['varkhul', '/src/sprites/bonelord.js', 'createBonelordSprites'],
  ['nerith', '/src/sprites/nerith.js', 'createNerithSprites'],
  ['ulgrim', '/src/sprites/barrow_king.js', 'createUlgrimSprites'],
  ['skalvyr', '/src/sprites/frost_wyrm.js', 'createSkalvyrSprites'],
];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('Fehler:', e.message));
await p.goto(URL);
await p.waitForFunction(() => window.emberfall?.scenes?.currentId, null, { timeout: 60000 });
const files = await p.evaluate(async (bosse) => {
  const trim = (src, pad = 1) => {
    const d = src.getContext('2d').getImageData(0, 0, src.width, src.height).data;
    let x0 = src.width, y0 = src.height, x1 = -1, y1 = -1;
    for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) if (d[(y * src.width + x) * 4 + 3] > 8) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const c = document.createElement('canvas'); c.width = x1 - x0 + 1 + pad * 2; c.height = y1 - y0 + 1 + pad * 2;
    c.getContext('2d').drawImage(src, x0 - pad, y0 - pad, c.width, c.height, 0, 0, c.width, c.height);
    return c;
  };
  const out = {};
  for (const [n, path, fn] of bosse) {
    const set = (await import(path))[fn]();
    const idle = typeof set.idle === 'function' ? set.idle() : set.idle;
    out[`tor-${n}.png`] = trim(idle.frames[0].canvas).toDataURL('image/png');
  }
  return out;
}, BOSSE);
for (const [f, url] of Object.entries(files)) writeFileSync(`${OUT}/${f}`, Buffer.from(url.split(',')[1], 'base64'));
console.log(Object.keys(files).join(' '));
await b.close();
