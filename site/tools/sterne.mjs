// „Bald“-Abschnitt der Startseite: Sternenglut, Stufe 40–50 (index.html .sterne, sterne.js zeichnet live).
// Bühne aus der Ankündigung im Spiel (src/teaser/art.js: Morgenschimmer, treibende Inseln, Sternhafen), davor die drei
// neuen Bosse als Schattenrisse; sterne.js enthüllt reihum je einen mit einem Lichtstreif.
//   1. Browser: Bühne (vistaStage, Weltraster ×2 = Feinraster), Schriftzug STERNENGLUT, Ruhe-Bilder der drei Bosse (Feinraster)
//   2. Python (sterne.py): Bossstreifen in drei Fassungen (hell, Schatten mit Randlicht, Lichtkante), Standbild teaser.webp
//   3. Maße in den Block META von site/sterne.js
// Aufruf (Server im Repo-Ordner, z. B. python3 -m http.server 8102): node site/tools/sterne.mjs [URL]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const [BASE = 'http://localhost:8102'] = process.argv.slice(2);
const IMG = join(HERE, '../img'), JS = join(HERE, '../sterne.js');
const TMP = join(process.env.ZWISCHEN ?? '/tmp', 'sterne');
mkdirSync(TMP, { recursive: true });
const BOSSE = ['createYsgarnSprites', 'createKaldrisSprites', 'createYsmeineSprites'];

const b = await chromium.launch();
const p = await b.newPage();
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.route(`${BASE}/__leer`, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' }));
await p.goto(`${BASE}/__leer`);
const res = await p.evaluate(async (BOSSE) => {
  const A = await import('/src/teaser/art.js');
  const M = await import('/src/sprites/star_bosses.js');
  const url = (c) => (c.canvas ?? c).toDataURL('image/png');
  const S = 640, AX = 320, AY = 520, RES = 2;
  const render = (fr) => {
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.setTransform(RES, 0, 0, RES, 0, 0);
    fr.draw(x, AX / RES, AY / RES, {}); x.setTransform(1, 0, 0, 1, 0, 0);
    const id = x.getImageData(0, 0, S, S); for (let i = 3; i < id.data.length; i += 4) id.data[i] = id.data[i] < 128 ? 0 : 255;
    x.putImageData(id, 0, 0); return c;
  };
  const bosse = BOSSE.map((fn) => {
    const idle = M[fn]().idle, cs = idle.frames.map(render);
    let x0 = S, y0 = S, x1 = -1, y1 = -1;
    for (const c of cs) { const d = c.getContext('2d').getImageData(0, 0, S, S).data; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (d[(y * S + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }
    x0 -= x0 & 1; y0 -= y0 & 1; const w = ((x1 - x0 + 2) >> 1) << 1, h = ((y1 - y0 + 2) >> 1) << 1;
    const sh = document.createElement('canvas'); sh.width = w * cs.length; sh.height = h;
    cs.forEach((c, i) => sh.getContext('2d').drawImage(c, x0, y0, w, h, i * w, 0, w, h));
    return { png: url(sh), w, h, n: cs.length, fps: idle.fps ?? 6, ax: AX - x0, ay: AY - y0 };
  });
  return { vista: url(A.vistaStage(640, 220, 9)), wort: url(A.wordmark('STERNENGLUT')), bosse };
}, BOSSE);
await b.close();
writeFileSync(join(TMP, 'vista.png'), Buffer.from(res.vista.split(',')[1], 'base64'));
writeFileSync(join(TMP, 'wort.png'), Buffer.from(res.wort.split(',')[1], 'base64'));
res.bosse.forEach((o, i) => writeFileSync(join(TMP, `boss${i}.png`), Buffer.from(o.png.split(',')[1], 'base64')));
writeFileSync(join(TMP, 'bosse.json'), JSON.stringify(res.bosse.map(({ png, ...m }) => m)));

const out = JSON.parse(execFileSync('python3', [join(HERE, 'sterne.py'), TMP, IMG], { cwd: HERE, maxBuffer: 1 << 26 }).toString());
const h = createHash('sha256');
for (const f of Object.keys(out.sizes).sort()) h.update(readFileSync(join(IMG, f)));
out.meta.v = h.digest('hex').slice(0, 10);
for (const [f, n] of Object.entries(out.sizes)) console.log(`${f.padEnd(22)} ${(n / 1024).toFixed(1).padStart(7)} KB`);
const src = readFileSync(JS, 'utf8');
const block = `  // <sterne.mjs> – von tools/sterne.mjs geschrieben, nicht von Hand ändern\n  const META = ${JSON.stringify(out.meta)};\n  // </sterne.mjs>`;
const next = src.replace(/  \/\/ <sterne\.mjs>[\s\S]*?\/\/ <\/sterne\.mjs>/, block);
if (next === src && !src.includes(block)) throw new Error('META-Block in sterne.js nicht gefunden');
writeFileSync(JS, next);
