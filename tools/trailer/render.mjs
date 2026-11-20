// Werbe-Trailer (tools/trailer/film.js) als Video 1080 × 1920 oder als Standbilder.
// Server im Repo-Ordner (python3 -m http.server 8103), dann:
//   [FILM=t1|t2|t3] node tools/trailer/render.mjs ZIEL.mp4 [ton.mp3] [fps=30]
//   node tools/trailer/render.mjs ZIELORDNER bilder 2,8,12.5     (Standbilder zu diesen Sekunden, zum Prüfen)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
const [OUT = '/tmp/trailer.mp4', TON = '', ARG3 = '30'] = process.argv.slice(2);
const BASE = process.env.BASE ?? 'http://localhost:8103';
const SUBS = process.env.SUBS !== '0', WELCHER = process.env.FILM ?? 't1';
const b = await chromium.launch();
const p = await b.newPage();
p.on('pageerror', (e) => console.log('Fehler:', e.message));
p.on('console', (m) => { if (m.type() === 'error') console.log('Konsole:', m.text()); });
await p.route(`${BASE}/__leer`, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' }));
await p.goto(`${BASE}/__leer`);
const total = await p.evaluate(async ({ SUBS, WELCHER }) => {
  const { FILMS, load } = await import('/tools/trailer/film.js');
  const FILM = FILMS[WELCHER];
  for (const [w, f] of [['500', 'inter-latin-400-normal'], ['600', 'inter-latin-600-normal']]) {
    const ff = new FontFace('TrailerText', `url(/site/fonts/${f}.woff2)`, { weight: w }); await ff.load(); document.fonts.add(ff);
  }
  const A = await load(new URL('/tools/trailer/media/', location.href));
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1920;
  const g = c.getContext('2d');
  const cues = FILM.timing();
  const wrap = (text, max) => {
    const words = text.split(' '), lines = [''];
    for (const w of words) { const tryL = (lines.at(-1) + ' ' + w).trim(); if (g.measureText(tryL).width > max && lines.at(-1)) lines.push(w); else lines[lines.length - 1] = tryL; }
    return lines;
  };
  window.__frame = (t) => {
    FILM.draw(g, Math.min(t, FILM.duration), A);
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    FILM.overlay(g, t, A);
    const cue = SUBS && cues.find((q) => t >= q.t0 && t < q.t1);
    if (cue) {
      const a = Math.min(1, (t - cue.t0) / 0.18, (cue.t1 - t) / 0.18);
      g.save(); g.globalAlpha = a; g.textAlign = 'center';
      g.font = '600 54px "TrailerText", sans-serif';
      const lines = wrap(cue.text, 860), y0 = 1385;
      // weiches dunkles Band hinter der Schrift, damit sie auf jedem Bild lesbar bleibt
      const gr = g.createLinearGradient(0, y0 - 150, 0, y0 + 190);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, y0 - 150, 1080, 340);
      g.font = '26px Georgia, serif'; g.fillStyle = '#e8782a';
      if (cue.who) g.fillText(cue.who.toUpperCase().split('').join(' '), 540, y0 - 62);      // Erzähler ohne Namen
      g.font = '600 54px "TrailerText", sans-serif'; g.fillStyle = '#f4e2c8';
      g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 10;
      lines.forEach((l, i) => g.fillText(l, 540, y0 + i * 68));
      g.restore();
    }
    return c.toDataURL('image/png');
  };
  return FILM.duration;
}, { SUBS, WELCHER });
const png = async (t) => Buffer.from((await p.evaluate((t) => window.__frame(t), t)).split(',')[1], 'base64');
if (TON === 'bilder') {
  mkdirSync(OUT, { recursive: true });
  for (const t of ARG3.split(',').map(Number)) { writeFileSync(`${OUT}/t${t.toFixed(1).padStart(5, '0')}.png`, await png(t)); }
  await b.close();
  process.exit(0);
}
const fps = Number(ARG3);
const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-', ...(TON ? ['-i', TON] : []),
  '-map', '0:v', ...(TON ? ['-map', '1:a', '-c:a', 'aac', '-b:a', '192k'] : []), '-c:v', 'libx264', '-preset', 'slow', '-crf', process.env.CRF ?? '19',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-t', String(total), OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
const n = Math.ceil(total * fps);
for (let i = 0; i < n; i++) {
  if (!ff.stdin.write(await png(i / fps))) await new Promise((ok) => ff.stdin.once('drain', ok));
  if (i % 300 === 0) console.log(`${i}/${n}`);
}
ff.stdin.end();
await new Promise((ok) => ff.on('close', ok));
await b.close();
console.log('fertig', OUT);
