// Vorschau-Video des Intro-Films (Bild aus src/intro/film.js, Ton src/intro/media/ton-<sprache>.mp3, Untertitel
// eingebrannt wie im Spiel), z. B. zum Zeigen oder Prüfen. Server im Repo-Ordner (python3 -m http.server 8102), dann:
//   node tools/intro/vorschau.mjs ZIEL.mp4 [sprache=de] [fps=30]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const [OUT = '/tmp/intro.mp4', LANG = 'de', FPS = '30'] = process.argv.slice(2);
const BASE = process.env.BASE ?? 'http://localhost:8102';
const fps = Number(FPS);
const b = await chromium.launch();
const p = await b.newPage();
p.on('pageerror', (e) => console.log('Fehler:', e.message));
await p.route(`${BASE}/__leer`, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' }));
await p.goto(`${BASE}/__leer`);
const total = await p.evaluate(async ({ BASE, LANG }) => {
  const { CONFIG } = await import('/src/config.js');
  CONFIG.renderScale = 2;
  const { FILM } = await import('/src/intro/film.js');
  let dict = {};
  if (LANG !== 'de') { const m = await import(`/src/i18n/${LANG}.js`); dict = Object.values(m)[0]; }
  const A = await FILM.load(new URL('/src/intro/media/', BASE), null);
  FILM.prepareAll(A);
  const c = document.createElement('canvas'); c.width = FILM.width; c.height = FILM.height + Math.round(120 * (FILM.width / 1280) / 2) * 2;
  const K = FILM.width / 1280;
  const g = c.getContext('2d');
  const cues = FILM.timing(LANG);
  const film = document.createElement('canvas'); film.width = FILM.width; film.height = FILM.height;
  const fg = film.getContext('2d');
  window.__frame = (t) => {
    fg.setTransform(1, 0, 0, 1, 0, 0);
    FILM.draw(fg, Math.min(t, FILM.duration), A);
    const over = t - FILM.duration;
    if (over > 0) { fg.fillStyle = `rgba(0,0,0,${Math.min(1, over / 0.9)})`; fg.fillRect(0, 0, film.width, film.height); }
    g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(film, 0, Math.round(60 * K));
    const cue = cues.find((q) => t >= q.t0 && t < q.t1);
    if (cue) {
      const line = dict[cue.text] ?? cue.text;
      g.textAlign = 'center';
      g.font = `${Math.round(15 * K)}px Georgia, serif`; g.fillStyle = '#e8782a';
      g.fillText(cue.who.toUpperCase().split('').join(' '), c.width / 2, c.height - 70 * K);
      g.font = `600 ${Math.round(26 * K)}px Inter, sans-serif`;
      for (const [dx, dy] of [[0, 2], [2, 0], [-2, 0], [0, -1]]) { g.fillStyle = '#000'; g.fillText(line, c.width / 2 + dx, c.height - 36 * K + dy); }
      g.fillStyle = '#f4e2c8'; g.fillText(line, c.width / 2, c.height - 36 * K);
    }
    return c.toDataURL('image/jpeg', 0.92);
  };
  return FILM.duration + 0.9;
}, { BASE, LANG });
const audio = join(HERE, `../../src/intro/media/ton-${LANG}.mp3`);
const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-', '-i', audio,
  '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
  '-vf', 'scale=iw*1:ih*1:flags=neighbor', '-c:a', 'aac', '-b:a', '160k', '-shortest', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
const n = Math.ceil(total * fps);
for (let i = 0; i < n; i++) {
  const url = await p.evaluate((t) => window.__frame(t), i / fps);
  if (!ff.stdin.write(Buffer.from(url.split(',')[1], 'base64'))) await new Promise((ok) => ff.stdin.once('drain', ok));
  if (i % 300 === 0) console.log(`${i}/${n}`);
}
ff.stdin.end();
await new Promise((ok) => ff.on('close', ok));
await b.close();
console.log('fertig', OUT);
