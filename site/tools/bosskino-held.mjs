// Held im Bosskino (Gegner der Bosse, site/tools/bosskino.py): die echte Heldenfigur des Spiels im Feinraster
// (getHeroSprites, RES 2 = 2 Feinpixel je Weltpixel = je Szenenpixel des Bosskinos), Krieger in Ritterharnisch mit „Emberwrath, Klinge der Könige“.
// Bilder: Ruhe (Kampfhaltung des Spiels) und Treffer (Zurückweichen). Leuchtpunkte und Kanten hart wie in render-sets.mjs.
// Ergebnis: site/tools/bosskino-held.png (alle Bilder nebeneinander, gleicher Rahmen und Fußpunkt) und bosskino-held.json
// (Bildmaße und Fußpunkt in Feinpixeln, Bildfolgen). bosskino.py liest beides; danach node site/tools/bosskino.mjs.
//   python3 -m http.server 8102   (Module direkt aus dem Projektordner; EW_URL für einen anderen Stand)
//   node site/tools/bosskino-held.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.EW_URL ?? 'http://localhost:8102';
const LOOK = ['human', 'warrior', process.env.HELD_GEAR?.split(',') ?? ['knight_plate', 'iron_helm', 'borderwatch_gauntlets', 'ironshod_boots', 'crown_of_embers_blade']];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto(`${BASE}/index.html`);
await p.waitForFunction(() => window.emberfall?.scenes?.currentId, null, { timeout: 60000 });
const res = await p.evaluate(async ([raceId, classId, gear]) => {
  const g = window.emberfall;
  const { resolveGear } = await import('/src/character/gearLook.js');
  const { getHeroSprites } = await import('/src/sprites/hero.js');
  const log = [];
  const S = 200, AX = 100, AY = 160, RES = 2;
  const equipment = {};
  for (const id of gear) { const d = g.content.get('item', id); if (d) equipment[d.slot] = id; else log.push(`fehlt ${id}`); }
  const set = getHeroSprites(raceId, classId, 0, resolveGear(equipment, g.content), null, RES);
  const hex = (c) => { const m = /^#?([0-9a-f]{6})$/i.exec(c); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null; };
  const render = (fr) => {
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    x.setTransform(RES, 0, 0, RES, 0, 0);
    fr.draw(x, AX / RES, AY / RES, {});
    x.setTransform(1, 0, 0, 1, 0, 0);
    const id = x.getImageData(0, 0, S, S), D = id.data;
    // Leuchtpunkte hart: Kreuz mit Radius r mischt die Glutfarbe in deckende Bildpunkte, Mittelpunkt voll
    for (const gl of fr.glows ?? []) {
      if (gl.orbit || gl.emit || fr.emit) continue;
      const col = hex(gl.color); if (!col) continue;
      const gx = Math.round(AX / RES + gl.x) * RES, gy = Math.round(AY / RES + gl.y) * RES, r = Math.max(1, Math.min(2, Math.round(gl.r)));
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const dd = Math.abs(dx) + Math.abs(dy); if (dd > r) continue;
        const k = dd === 0 ? 1 : 0.4 / dd;
        for (let py = 0; py < RES; py++) for (let px = 0; px < RES; px++) {
          const i = ((gy + dy * RES + py) * S + gx + dx * RES + px) * 4;
          if (dd > 0 && D[i + 3] < 128) continue;
          for (let q = 0; q < 3; q++) D[i + q] = Math.round(D[i + q] * (1 - k) + col[q] * k);
          D[i + 3] = 255;
        }
      }
    }
    for (let i = 3; i < D.length; i += 4) D[i] = D[i] < 128 ? 0 : 255;
    x.putImageData(id, 0, 0);
    return c;
  };
  const seqs = { ruhe: set.idle.frames, treffer: set.hurt.frames };
  const list = [], names = {};
  for (const [n, frs] of Object.entries(seqs)) { names[n] = frs.map((_, i) => list.length + i); list.push(...frs.map(render)); }
  // gemeinsamer Rahmen in ganzen Weltpixeln (= Szenenpixeln), Fußpunkt auf einem Weltpixel
  let x0 = S, y0 = S, x1 = -1, y1 = -1;
  for (const c of list) {
    const d = c.getContext('2d').getImageData(0, 0, S, S).data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (d[(y * S + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  const pad = 2;
  x0 = AX - Math.ceil((AX - x0 + pad) / RES) * RES; y0 = AY - Math.ceil((AY - y0 + pad) / RES) * RES;
  x1 = AX + Math.ceil((x1 + 1 - AX + pad) / RES) * RES; y1 = AY + Math.max(1, Math.ceil((y1 + 1 - AY) / RES)) * RES;
  const w = x1 - x0, h = y1 - y0;
  const sheet = document.createElement('canvas'); sheet.width = w * list.length; sheet.height = h;
  const sx = sheet.getContext('2d'); sx.imageSmoothingEnabled = false;
  list.forEach((c, i) => sx.drawImage(c, x0, y0, w, h, i * w, 0, w, h));
  return { png: sheet.toDataURL('image/png'), meta: { res: RES, w, h, fx: AX - x0, fy: AY - y0, n: list.length, seq: names, fps: { ruhe: set.idle.fps, treffer: set.hurt.fps }, look: { raceId, classId, gear } }, log };
}, LOOK);
const OUT = process.env.HELD_OUT ?? HERE;
writeFileSync(join(OUT, 'bosskino-held.png'), Buffer.from(res.png.split(',')[1], 'base64'));
writeFileSync(join(OUT, 'bosskino-held.json'), JSON.stringify(res.meta, null, 1) + '\n');
if (res.log.length) console.log(res.log.join('\n'));
console.log(JSON.stringify(res.meta));
await b.close();
