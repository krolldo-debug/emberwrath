// Titelbild der Startseite „Aufbruch zum Aschethron“ (site/titel.js zeichnet es live auf ein Canvas, Abschnitt .hero):
// Ein Krieger in der Rüstung des Aschenfürsten mit Königsfall steht vorn auf erstarrter Lavakruste und blickt über die
// Glutöde zum Aschethron.
// Eine Pixelgröße für alles: Szene 640 × 272 Szenenpixel, jede Ebene und der Held 1:1 darin (titel.js vergrößert
// ganzzahlig). Keine Ebene wird skaliert oder perspektivisch verzerrt.
//   Ferne: Himmel in Farbbändern (Übergänge im Schachbrettraster), Dunst, Bergkette, Aschethron als Schattenriss
//   (hier gezeichnet: Mauern, Türme, Thronspitze, Obsidiannadeln; Feuerschalen und Fenster in der Glut-Ebene).
//   Lavastrom: Lava des Thronsaals aus dem Spiel (createBiomeTiles3('throne'), 4 Bilder) 1:1 als Band, das in ganzen
//   Pixelstufen vom Aschethron nach vorn links läuft. Ebene und Vordergrund: Lava-Generator des Spiels (makeLava)
//   ohne offene Schmelze, 1:1 – Krustenschollen mit glühenden Fugen, hinten feiner, vorn gröber.
//   Held: eigene Pixel-Art (tools/titel-held.py), Farben und Ausrüstung nach Harnisch, Krone, Stulpen und Sabatons
//   des Aschenfürsten und dem Zweihänder Königsfall aus dem Spiel (character/gearLook.js).
// Ergebnis in site/img (alles verlustfrei), Maße und Bildfolgen im Block META von site/titel.js.
// Aufruf (Server im Repo-Ordner, z. B. python3 -m http.server 8123): node site/tools/titel-held.mjs [URL]
// Zwischenbilder und Vorschau nach $ZWISCHEN/titel-held (Standard /tmp).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const [BASE = 'http://localhost:8123'] = process.argv.slice(2);
const IMG = join(HERE, '../img'), JS = join(HERE, '../titel.js');
const TMP = join(process.env.ZWISCHEN ?? '/tmp', 'titel-held');
mkdirSync(TMP, { recursive: true });
// Szene: Breite, Höhe, Fußlinie des Helden, Standpunkt, Horizont, Aschethron (x); LH Bilder des Lavastroms
const SZ = { W: 640, H: 272, FY: 212, HX: 330, HOR: 146, FX: 384, LH: 4 };
const save = (f, url) => writeFileSync(join(TMP, f), Buffer.from(url.split(',')[1], 'base64'));

// ---------------------------------------------------------------------------------------------- 1. Szene (Browser)
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.route(`${BASE}/__leer`, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' }));
await p.goto(`${BASE}/__leer`);
const res = await p.evaluate(async (SZ) => {
  const { W, H, FY, HX, HOR, FX, LH } = SZ;
  const D = await import('/src/sprites/decor_wastes.js');
  const { createBiomeTiles3 } = await import('/src/sprites/biomes_rime_throne.js');
  const { hash2 } = await import('/src/core/math.js');
  const { PAL } = await import('/src/gfx/Palette.js');
  const { vnoise, groundPixel } = await import('/src/sprites/outdoor.js');
  const { makeLava } = await import('/src/sprites/biomes.js');
  const deko = D.createWastesDecor(), GW = D.GROUND_WASTES;
  const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255]; };
  const chk = (x, y) => (x + y) & 1;                       // Schachbrett für Übergänge
  const buf = (w, h) => {
    const d = new Uint8ClampedArray(w * h * 4);
    const set = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= w || y >= h) return; const v = typeof c === 'string' ? rgb(c) : c; d.set([v[0], v[1], v[2], v[3] ?? 255], (y * w + x) * 4); };
    const get = (x, y) => { if (x < 0 || y < 0 || x >= w || y >= h) return [0, 0, 0, 0]; const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
    return { w, h, d, set, get };
  };
  const cache = new Map();
  const pixels = (cv) => { let a = cache.get(cv); if (!a) { a = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height).data; cache.set(cv, a); } return a; };
  const lum = (c) => (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255;
  const EMB = PAL.ember.map(rgb);
  const wave = (x, parts) => parts.reduce((s, [a, k, ph]) => s + a * Math.sin((2 * Math.PI * k * x) / W + ph), 0);
  // Sprite 1:1 stempeln (Fußpunkt), Farben umgefärbt
  const stamp = (B, e, fx, fy, { map, flip = false, G = null }) => {
    const s = e.sprite ?? e, cv = s.canvas, a = pixels(cv), w = cv.width;
    const ox = fx - (flip ? w - 1 - s.ax : s.ax), oy = fy - s.ay;
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + (flip ? w - 1 - x : x)) * 4;
      if (a[i + 3] < 128) continue;
      B.set(ox + x, oy + y, map([a[i], a[i + 1], a[i + 2], 255], ox + x, oy + y));
    }
    if (G && e.glow) {
      const g = pixels(e.glow), gw = e.glow.width;
      for (let y = 0; y < e.glow.height; y++) for (let x = 0; x < gw; x++) {
        const i = (y * gw + (flip ? gw - 1 - x : x)) * 4;
        if (g[i + 3] >= 100 && B.get(ox + x - 1, oy + y - 1)[3]) G.set(ox + x - 1, oy + y - 1, EMB[3]);
      }
    }
    return { x0: ox, y0: oy, w, h: cv.height };
  };
  // Krustentextur aus dem Lava-Generator: (Farbe, Fuge?) je Szenenpixel
  const crustAt = (opts) => {
    const L = makeLava(opts), T = new Map();
    return (wx, wy) => {
      const cx = Math.floor(wx / 16), cy = Math.floor(wy / 16), k = cx + ',' + cy;
      let t = T.get(k);
      if (!t) { t = [pixels(L.tile(cx, cy, 0, 0)), pixels(L.glowTile(cx, cy, 0, 0))]; T.set(k, t); }
      const i = ((wy - cy * 16) * 16 + (wx - cx * 16)) * 4;
      return [[t[0][i], t[0][i + 1], t[0][i + 2], 255], t[1][i + 3] > 100];
    };
  };
  const BLACK5 = ['#000000', '#000000', '#000000', '#000000', '#000000'];

  // ================= Ferne: Himmel, Ascheschleier, Bergkette, Aschethron, vordere Kette
  const F = buf(W, H), FG = buf(W, H);
  const SKY = ['#060309', '#09040c', '#0d0610', '#130814', '#1b0a15', '#250d16', '#331117', '#441616', '#581c15', '#702514', '#8c3214'];
  const skyTop = 40, skyBot = HOR - 14;
  for (let y = 0; y < H; y++) {
    const t = Math.max(0, Math.min(1, (y - skyTop) / (skyBot - skyTop)));
    const v = Math.pow(t, 2) * (SKY.length - 1), i0 = Math.floor(v), fr = v - i0;
    for (let x = 0; x < W; x++) {
      const up = fr > 0.7 || (fr > 0.4 && chk(x, y));
      F.set(x, y, SKY[Math.min(SKY.length - 1, i0 + (up ? 1 : 0))]);
    }
  }
  // Ascheschleier: flache Bänder, eine Stufe heller, Ränder im Schachbrett
  for (const [cy, seed, col] of [[HOR - 29, 9, '#4e1c16']]) {
    for (let x = 0; x < W; x++) {
      const th = 1.2 + 2.6 * vnoise(x / 34, seed, seed) - 0.8 * vnoise(x / 11, seed + 3, seed);
      if (th < 1.5) continue;
      const y0 = Math.round(cy - th), y1 = Math.round(cy + th * 0.5);
      for (let y = y0; y <= y1; y++) if (y !== y0 || chk(x, y)) F.set(x, y, col);
    }
  }
  // ferne Bergkette im Dunst
  const hb = (x) => Math.round(HOR - 19 + wave(x, [[5, 2, 0.6], [3, 5, 2.1], [1.5, 11, 0.4], [0.7, 23, 1.3]]));
  for (let x = 0; x < W; x++) for (let y = hb(x); y < H; y++) F.set(x, y, y === hb(x) ? '#4d1d1b' : y === hb(x) + 1 && chk(x, y) ? '#43191a' : '#3b1518');
  // Aschethron: Schattenriss in Szenenpixeln, Fuß bei yb (von der vorderen Kette verdeckt)
  const yb = HOR - 3;
  const SIL = ['#0d0609', '#140a0d', '#1c0e10', '#2a1412'];   // Körper, Kante rechts, Glutsaum unten
  const fort = buf(W, H);
  const rect = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) fort.set(FX + x, yb - y, SIL[0]); };
  const crenel = (x0, x1, top) => { for (let x = x0; x <= x1; x++) if (((x - x0) % 3) !== 2) { fort.set(FX + x, yb - top - 1, SIL[0]); fort.set(FX + x, yb - top - 2, SIL[0]); } };
  const spike = (cx, w, h0, h1) => { for (let y = h0; y <= h1; y++) { const k = (h1 - y) / (h1 - h0), hw = Math.round(w * k); for (let x = -hw; x <= hw; x++) fort.set(FX + cx + x, yb - y, SIL[0]); } };
  rect(-36, 0, 36, 12); crenel(-36, 36, 12);              // Ringmauer
  rect(-32, 0, -24, 28); crenel(-32, -24, 28);            // Seitentürme
  rect(24, 0, 32, 25); crenel(24, 32, 25);
  rect(-15, 0, 15, 34); crenel(-15, 15, 34);              // Halle
  rect(-7, 0, 7, 46);                                      // Thronturm, oben die Lehne mit zwei Hörnern
  spike(0, 4, 46, 58); spike(-7, 2, 46, 53); spike(7, 2, 46, 53);
  spike(-44, 3, 0, 34); spike(-49, 1, 0, 20); spike(45, 3, 0, 28); spike(50, 1, 0, 16);   // Obsidiannadeln
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!fort.get(x, y)[3]) continue;
    const edge = !fort.get(x + 1, y)[3];
    const warm = yb - y < 7 && (yb - y < 4 || chk(x, y));
    F.set(x, y, warm ? SIL[3] : edge ? SIL[2] : SIL[0]);
  }
  // Fenster und Feuerschalen (Glut-Ebene, flackert in titel.js)
  for (const [x, y] of [[-28, 20], [-28, 19], [28, 17], [28, 16], [-9, 24], [-9, 23], [9, 24], [9, 23], [0, 38], [0, 37], [-3, 30], [3, 30], [-20, 7], [20, 7]]) FG.set(FX + x, yb - y, EMB[3]);
  for (const [cx, top] of [[-28, 30], [28, 27], [0, 59]]) {
    for (let x = -1; x <= 1; x++) F.set(FX + cx + x, yb - top, '#2a1412');
    FG.set(FX + cx, yb - top - 1, EMB[4]); FG.set(FX + cx - 1, yb - top - 1, EMB[3]); FG.set(FX + cx + 1, yb - top - 1, EMB[3]);
    FG.set(FX + cx, yb - top - 2, EMB[3]); FG.set(FX + cx, yb - top - 3, EMB[2]);
  }
  // vordere Kette: dunkler, unten vom Lavalicht angestrahlt (Stufen im Schachbrett)
  const FRONT = ['#1a0b10', '#220e12', '#2c1114', '#3c1614'];
  const crag = (x) => 6 * Math.exp(-(((x - FX) / 36) ** 2));
  const hf = (x) => Math.round(HOR - 6 + wave(x, [[3, 3, 2.2], [2, 7, 0.7], [1, 17, 1.1], [0.5, 37, 0.2]]) - crag(x));
  for (let x = 0; x < W; x++) for (let y = hf(x); y < H; y++) {
    const fromBase = HOR - y;
    let i = y === hf(x) ? 2 : 0;
    if (fromBase < 3 || (fromBase < 5 && chk(x, y))) i = 3; else if (fromBase < 7 || (fromBase < 9 && chk(x, y))) i = Math.max(i, 1);
    F.set(x, y, FRONT[i]);
  }

  // ================= Lavastrom: Band in ganzen Pixelstufen vom Fuß des Aschethrons nach vorn links, 1:1 aus der Spiel-Lava
  const lava = createBiomeTiles3('throne').liquid;
  // Mittellinie je Spalte: alle `run` Pixel eine Zeile tiefer; Dicke wächst in Stufen
  const river = new Map();   // x -> [yTop, yBot]
  {
    let x = FX - 8, y = HOR - 1, n = 0;
    const steps = [[7, 2], [7, 2], [6, 3], [6, 3], [6, 4], [5, 4], [5, 5], [5, 5], [4, 6], [4, 6], [5, 7], [4, 7], [4, 8], [3, 8], [4, 9], [3, 9], [4, 10], [3, 10], [3, 11]];
    while (x > -10) {
      const [run, th] = steps[Math.min(steps.length - 1, Math.floor(n / 4))];
      for (let k = 0; k < run; k++) { river.set(x, [y, y + th - 1]); x--; }
      y++; n++;
    }
  }
  const LT = HOR - 2, LB = FY + 8;
  const LAV = [], LAVG = [];
  for (let f = 0; f < LH; f++) {
    const L = buf(W, LB - LT), LG = buf(W, LB - LT), tiles = new Map();
    const at = (wx, wy) => {
      const cx = Math.floor(wx / 16), cy = Math.floor(wy / 16), k = cx + ',' + cy;
      let t = tiles.get(k);
      if (!t) { t = [pixels(lava.tile(cx, cy, f % 4, 0)), pixels(lava.glowTile(cx, cy, f % 4, 0))]; tiles.set(k, t); }
      const i = ((wy - cy * 16) * 16 + (wx - cx * 16)) * 4;
      return [[t[0][i], t[0][i + 1], t[0][i + 2], 255], t[1][i + 3] > 100 ? [t[1][i], t[1][i + 1], t[1][i + 2], 255] : null];
    };
    for (const [x, [y0, y1]] of river) {
      if (x < 0 || x >= W) continue;
      L.set(x, y0 - 1 - LT, '#3a1410'); L.set(x, y1 + 1 - LT, '#2a100e');   // Krustensaum
      for (let y = y0; y <= y1; y++) { const [c, g] = at(x + 512, y + 300); L.set(x, y - LT, c); if (g) LG.set(x, y - LT, g); }
    }
    LAV.push(L); LAVG.push(LG);
  }

  // ================= Mitte: Ascheebene, vom Strom angestrahlt, feine Kruste; wenige Silhouetten
  const M = buf(W, H), MG = buf(W, H);
  const mcrust = crustAt({ seed: 977, crust: BLACK5, emb: PAL.ember, wall: BLACK5, grout: '#000000', cell: 9, open: 0, crack: 0.5 });
  const ASH = ['#120b0c', '#181010', '#201512', '#2a1a15', '#362017', '#452818', '#583218'];
  const dist = (x, y) => { const r = river.get(x); if (!r) return 99; return y < r[0] ? r[0] - y : y > r[1] ? y - r[1] : 0; };
  for (let y = HOR - 1; y < H; y++) for (let x = 0; x < W; x++) {
    if (y < hf(x) + 1 && y < HOR) continue;
    const dl = dist(x, y);
    if (dl === 0) continue;
    const l = lum(groundPixel(',', x, y * 2, GW));
    let li = dl <= 1 ? 6 : dl <= 2 ? 5 : dl <= 4 ? 4 : dl <= 7 ? 3 : dl <= 12 ? 2 : 1;
    if (dl > 1 && dl <= 12 && chk(x, y) && (dl === 3 || dl === 5 || dl === 8 || dl === 12)) li--;
    if (y < HOR + 2) li = Math.max(li, 3);
    if (l > 0.27 && li < 6) li++;
    if (l < 0.19 && li > 0) li--;
    M.set(x, y, ASH[li]);
    if (y > HOR + 3 && dl > 1) {
      const [, seam] = mcrust(x + 900, y + 200);
      if (seam) {
        const t = (y - HOR) / (FY - HOR), lvl = t < 0.25 ? -1 : t < 0.6 ? 0 : t < 0.85 ? 1 : 2;
        if (lvl >= 0) M.set(x, y, ['#21100e', '#30130f', '#481a0e'][lvl]);
        if (lvl === 2 && chk(x, y)) MG.set(x, y, EMB[1]);
      }
    }
  }
  // Silhouetten (Spiel-Deko 1:1): Obsidiannadeln und ein Säulenstumpf am Ufer
  const mids = [];
  const shore = (x, off) => { const r = river.get(x); return r ? r[0] - off : HOR + 6; };
  for (const [x, off, e, fl] of [[470, 3, deko.obsidianNeedles[2], false], [150, 5, deko.obsidianNeedles[0], true], [214, 4, deko.columnStumps[1], false]]) mids.push({ e, x, y: shore(x, off), f: fl });
  mids.sort((a, c) => a.y - c.y);
  const sil = [];
  for (const o of mids) {
    const r = stamp(M, o.e, o.x, o.y, { flip: o.f, G: MG, map: (c, wx, wy) => {
      const l = lum(c), j = Math.min(4, Math.floor(l * 7));
      const lit = M.get(wx + 1, wy)[3] === 0 || M.get(wx, wy - 1)[3] === 0;
      return rgb((lit && l > 0.18 ? ['#2a1410', '#3a1a12', '#4a2214', '#5a2a16', '#6a3218'] : ['#0e0809', '#130b0c', '#190e0e', '#211211', '#2a1614'])[j]);
    } });
    sil.push(r);
  }

  // ================= Nah: Felsplateau, Kante warm angestrahlt, Kruste 1:1 mit Glutfugen
  const N = buf(W, H), NG = buf(W, H);
  const ROCK = ['#0a0608', '#100a0c', '#170f10', '#201413', '#2c1b17', '#3d2419', '#55301a'];
  const top = (x) => {
    const flat = Math.max(0, Math.min(1, (Math.abs(x - HX - 20) - 70) / 40));
    return Math.round(FY - 3 + flat * wave(x, [[2, 2, 1.2], [1.2, 5, 0.3], [0.6, 13, 2.2]]) + Math.max(0, (x - HX - 110) * 0.06) + Math.max(0, (HX - 120 - x) * 0.05));
  };
  const crust = crustAt({ seed: 4242, crust: ['#0b0709', '#120c0e', '#1a1213', '#241817', '#30201b'], emb: PAL.ember, wall: ROCK, grout: ROCK[0], cell: 13, open: 0, crack: 0.55 });
  const tops = [];
  for (let x = 0; x < W; x++) {
    const t0 = top(x); tops.push(t0);
    for (let y = t0; y < H; y++) {
      const dy = y - t0;
      if (dy < 3) {
        // Kante: angestrahlt, aber gebrochen (Kerben, wo Fugen der Kruste die Kante erreichen)
        const notch = crust(x + 64, t0 + 3 + 64)[1] || crust(x + 64, t0 + 4 + 64)[1];
        const lv = dy === 0 ? (notch ? 3 : hash2(x, 7, 5) < 0.18 ? 5 : 6) : dy === 1 ? (notch ? 2 : 4) : chk(x, y) ? 3 : 2;
        N.set(x, y, ROCK[lv]); continue;
      }
      const [c, seam] = crust(x + 64, y + 64);
      const deep = dy > 22 || (dy > 16 && chk(x, y));
      if (seam) {
        const far = Math.abs(x - HX) / 60 + dy / 26;
        const lv = far < 0.6 ? 0 : far < 1.3 ? 1 : 2;
        N.set(x, y, lv === 2 || deep ? '#3a1410' : EMB[1]);
        if (lv < 2 && !deep) NG.set(x, y, lv === 0 ? EMB[3] : EMB[2]);
      } else N.set(x, y, deep ? [c[0] * 0.6, c[1] * 0.6, c[2] * 0.6, 255] : c);
    }
  }

  const toUrl = (B) => { const c = document.createElement('canvas'); c.width = B.w; c.height = B.h; c.getContext('2d').putImageData(new ImageData(B.d, B.w, B.h), 0, 0); return c.toDataURL('image/png'); };
  const stack = (arr) => { const h = arr[0].h, c = document.createElement('canvas'); c.width = arr[0].w; c.height = h * arr.length; const x = c.getContext('2d'); arr.forEach((B, i) => x.putImageData(new ImageData(B.d, B.w, B.h), 0, i * h)); return c.toDataURL('image/png'); };
  return { fern: toUrl(F), fernGlut: toUrl(FG), lava: stack(LAV), lavaGlut: stack(LAVG), mitte: toUrl(M), mitteGlut: toUrl(MG), nah: toUrl(N), nahGlut: toUrl(NG), LT, LH2: LB - LT, tops, beacons: [] };
}, SZ);
for (const [k, v] of Object.entries(res)) if (typeof v === 'string') save(`szene-${k}.png`, v);
Object.assign(SZ, { LT: res.LT, LH2: res.LH2 });
writeFileSync(join(TMP, 'szene.json'), JSON.stringify({ SZ, tops: res.tops }));
await b.close();
if (process.env.NURSZENE) process.exit(0);

// ---------------------------------------------------------------------------------------------- 2. Held, Riss, Standbild (Python)
const out = JSON.parse(execFileSync('python3', [join(HERE, 'titel-held.py'), TMP, IMG], { maxBuffer: 1 << 26 }).toString());
let total = 0;
for (const [f, n] of Object.entries(out.sizes)) { total += n; console.log(`${f.padEnd(26)} ${(n / 1024).toFixed(1).padStart(7)} KB`); }
console.log(`zusammen ${(total / 1024).toFixed(1)} KB; Vorschau ${join(TMP, 'vorschau.png')}`);

// ---------------------------------------------------------------------------------------------- 3. Maße nach titel.js
const src = readFileSync(JS, 'utf8');
const block = `  // <titel-held.mjs> – von tools/titel-held.mjs geschrieben, nicht von Hand ändern\n  const META = ${JSON.stringify(out.meta)};\n  // </titel-held.mjs>`;
const next = src.replace(/  \/\/ <titel-held\.mjs>[\s\S]*?\/\/ <\/titel-held\.mjs>/, block);
if (next === src && !src.includes(block)) throw new Error('META-Block in titel.js nicht gefunden');
writeFileSync(JS, next);
