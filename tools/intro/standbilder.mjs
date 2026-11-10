// Standbilder des Intro-Films (src/intro/film.js) zu festen Zeiten, ohne Spiel drumherum: zum Prüfen der Bilder.
// Server im Repo-Ordner (python3 -m http.server 8102), dann:
//   node tools/intro/standbilder.mjs ZIEL [t1 t2 …]      (Zeiten in Sekunden; ohne Angabe je Einstellung zwei Bilder)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const [OUT = '/tmp/intro-bilder', ...ts] = process.argv.slice(2);
const BASE = process.env.BASE ?? 'http://localhost:8102';
const times = ts.length ? ts.map(Number) : [1.5, 3.8, 5, 11, 14, 17, 19, 24, 26.4, 28, 31.3, 32.6, 34, 35.6, 36.5, 40, 45, 49.8, 52];
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
const p = await b.newPage();
p.on('pageerror', (e) => console.log('Fehler:', e.message));
p.on('console', (m) => { if (m.type() === 'error') console.log('Konsole:', m.text()); });
await p.route(`${BASE}/__leer`, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' }));
await p.goto(`${BASE}/__leer`);
const shots = await p.evaluate(async ({ times, BASE }) => {
  const { CONFIG } = await import('/src/config.js');
  CONFIG.renderScale = 2;
  const { FILM } = await import('/src/intro/film.js');
  const A = await FILM.load(new URL('/src/intro/media/', BASE), null);
  FILM.prepareAll(A);
  const c = document.createElement('canvas'); c.width = FILM.width; c.height = FILM.height;
  const g = c.getContext('2d');
  return times.map((t) => { g.setTransform(1, 0, 0, 1, 0, 0); FILM.draw(g, t, A); return [t, c.toDataURL('image/png')]; });
}, { times, BASE });
for (const [t, url] of shots) writeFileSync(`${OUT}/t${String(t.toFixed(1)).padStart(5, '0')}.png`, Buffer.from(url.split(',')[1], 'base64'));
console.log(shots.length, 'Bilder in', OUT);
await b.close();
