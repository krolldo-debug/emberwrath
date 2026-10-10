// Titelbild der Startseite „Aufbruch zum Aschethron“ (site/titel.js zeichnet es live auf ein Canvas, Abschnitt .hero):
// Ein Krieger in der Rüstung des Souveräns mit Königsfall steht groß vorn auf erstarrter Lavakruste und blickt über
// die Glutöde zum Aschethron. Alles stammt aus dem Spielcode, im Browser direkt aus src/ geladen:
//   Himmel/Berge: Paletten und Rasterstufen wie in den Spielkacheln; Aschethron aus der Glutöde-Deko (Bastionstürme,
//   Mauern, Obsidiannadeln aus sprites/decor_wastes.js) als Schattenriss, ihre Glut-Ebene (Feuerschalen, Fenster) bleibt;
//   Lavastrom = Lava-Generator des Thronsaals (makeLava, 4 Bilder), Ebene und Vordergrund = derselbe Generator ohne
//   offene Schmelze (Krustenschollen mit glühenden Fugen); Silhouetten am Ufer (Nadeln, Säulen, Bäume, Kolossschwert).
//   Held: echte Spiellogik wie tools/klassen-kampf.mjs (Stufe 40, Ausrüstung angelegt, Tasten gedrückt, 60-Hz-Schritte
//   von Hand), Figuren in Detailstufe 3 (setHeroRes, die feinste Stufe des Spiels), Klingenglut des Spiels eingerechnet.
// Zwei Pixelgrößen: Held und Vordergrund in „Heldenpixeln“ (1 Heldenpixel = 1 Detailpixel der Figur = 1/3 Weltpixel),
// die hinteren Ebenen in halb so großen Pixeln (K = 2) – so wirkt das Land weit, und der Held trägt das Bild.
// Ergebnis in site/img (alles verlustfrei):
//   titel-fern.webp       Himmel, Bergketten, Aschethron (deckend, hintere Pixel)      titel-fern-glut.webp   Glut darauf
//   titel-strom.webp      Lavastrom, 4 Bilder untereinander (hintere Pixel)             titel-strom-glut.webp
//   titel-mitte.webp      Krustenebene mit Silhouetten (hintere Pixel)                  titel-mitte-glut.webp
//   titel-nah.webp        Lavakruste vorn, Schatten des Helden (Heldenpixel)            titel-nah-glut.webp    Fugen nahe beim Helden
//   titel-nah-welle.webp  alle Fugen hell (läuft als Glutwelle über die Kruste)
//   titel-held-ruhe.webp  Ruheschleife 24 Bilder; titel-held-schrei.webp Kriegsschrei (Klinge hoch); titel-held-schlag.webp Erdspalter
//   titel.webp            Standbild (Poster, LCP): alle Ebenen in Ruhe, hintere Pixel
// Maße, Bildzahlen, Trefferbilder und Klingenachsen schreibt das Werkzeug in den Block META von site/titel.js.
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
// Szene in Heldenpixeln: Breite, Höhe, Fußlinie, Standpunkt, Horizont, Aschethron; LH Bilder des Lavastroms; K hintere Pixel je Heldenpixel
const SZ = { W: 640, H: 272, FY: 212, HX: 330, HOR: 146, FX: 378, LH: 4, K: 2 };
const save = (f, url) => writeFileSync(join(TMP, f), Buffer.from(url.split(',')[1], 'base64'));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// ---------------------------------------------------------------------------------------------- 1. Szene
{
  const p = await b.newPage();
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.route(`${BASE}/__leer`, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' }));
  await p.goto(`${BASE}/__leer`);
  const res = await p.evaluate(async (SZ) => {

    const { W, H, FY, HX, HOR, FX, LH, K } = SZ;
    const D = await import('/src/sprites/decor_wastes.js');
    const { createBiomeTiles3 } = await import('/src/sprites/biomes_rime_throne.js');
    const { createRng, hash2 } = await import('/src/core/math.js');
    const { PAL } = await import('/src/gfx/Palette.js');
    const { vnoise, groundPixel } = await import('/src/sprites/outdoor.js');
    const { makeLava } = await import('/src/sprites/biomes.js');
    const deko = D.createWastesDecor(), GW = D.GROUND_WASTES;
    const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255]; };
    const B4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    const bay = (x, y) => (B4[y & 3][x & 3] + 0.5) / 16;
    const buf = (w, h) => {
      const d = new Uint8ClampedArray(w * h * 4);
      const set = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= w || y >= h) return; const v = typeof c === 'string' ? rgb(c) : c; d[(y * w + x) * 4] = v[0]; d[(y * w + x) * 4 + 1] = v[1]; d[(y * w + x) * 4 + 2] = v[2]; d[(y * w + x) * 4 + 3] = v[3] ?? 255; };
      const get = (x, y) => { if (x < 0 || y < 0 || x >= w || y >= h) return [0, 0, 0, 0]; const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
      return { w, h, d, set, get };
    };
    const cache = new Map();
    const pixels = (cv) => { let a = cache.get(cv); if (!a) { a = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height).data; cache.set(cv, a); } return a; };
    const lum = (c) => (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255;
    const mix = (a, c, t) => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t, 255];
    const q6 = (c) => [Math.round(c[0] / 4) * 4, Math.round(c[1] / 4) * 4, Math.round(c[2] / 4) * 4, 255];
    // Sprite stempeln (Fußpunkt fx/fy), map(c, wx, wy) färbt um; Glow-Ebene (1 px Rand) in G
    const stamp = (B, e, fx, fy, { map = null, flip = false, G = null, gmap = null } = {}) => {
      const s = e.sprite ?? e, cv = s.canvas, a = pixels(cv), w = cv.width;
      const ox = fx - (flip ? w - 1 - s.ax : s.ax), oy = fy - s.ay;
      for (let y = 0; y < cv.height; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + (flip ? w - 1 - x : x)) * 4;
        if (a[i + 3] < 128) continue;
        const c = [a[i], a[i + 1], a[i + 2], 255];
        B.set(ox + x, oy + y, map ? map(c, ox + x, oy + y) : c);
      }
      if (G && e.glow) {
        const g = pixels(e.glow), gw = e.glow.width;
        for (let y = 0; y < e.glow.height; y++) for (let x = 0; x < gw; x++) {
          const i = (y * gw + (flip ? gw - 1 - x : x)) * 4;
          if (g[i + 3] < 100) continue;
          const c = [g[i], g[i + 1], g[i + 2], 255];
          G.set(ox + x - 1, oy + y - 1, gmap ? gmap(c) : c);
        }
      }
    };
    const EMB = PAL.ember.map(rgb);
    const back = (W, H, FY, HX, HOR, FX) => {
    const wave = (x, parts) => parts.reduce((s, [a, k, ph]) => s + a * Math.sin((2 * Math.PI * k * x) / W + ph), 0);

    // ================= Ferne: Himmel, zwei Bergketten, Aschethron
    const F = buf(W, H), FG = buf(W, H);
    const SKY = ['#060309', '#08040c', '#0b060f', '#100813', '#160a15', '#1e0c16', '#2a0f17', '#381317', '#4a1816', '#601f14', '#7a2a12', '#963a14'];
    for (let y = 0; y < H; y++) {
      const t = Math.max(0, Math.min(1, (y - 30) / (HOR - 12 - 30)));
      const v = Math.pow(t, 2.1) * (SKY.length - 1);
      for (let x = 0; x < W; x++) { const i0 = Math.floor(v); F.set(x, y, SKY[Math.min(SKY.length - 1, i0 + (v - i0 > bay(x, y) ? 1 : 0))]); }
    }
    // Ascheschleier: zwei flache Wolkenbänder, eine Spur heller als der Himmel, Ränder gerastert
    for (const [cy, seed] of [[HOR - 52, 5], [HOR - 30, 9]]) {
      for (let x = 0; x < W; x++) {
        const th = 1.5 + 2.5 * vnoise(x / 23, seed, seed) - 1.2 * vnoise(x / 7, seed + 3, seed);
        if (th < 1.2) continue;
        const y0 = Math.round(cy - th), y1 = Math.round(cy + th * 0.6);
        for (let y = y0; y <= y1; y++) {
          if ((y === y0 || y === y1) && bay(x, y) < 0.5) continue;
          F.set(x, y, q6(mix(F.get(x, y), rgb('#5a2216'), 0.22 + (y < cy ? 0 : 0.08))));
        }
      }
    }
    const hb = (x) => Math.round(HOR - 26 + wave(x, [[7, 2, 0.6], [4, 5, 2.1], [2, 11, 0.4], [1, 23, 1.3]]));
    const HAZE = ['#3b1518', '#43191a', '#4d1d1b'];
    for (let x = 0; x < W; x++) for (let y = hb(x); y < H; y++) F.set(x, y, y === hb(x) ? HAZE[2] : y - hb(x) < 2 && bay(x, y) < 0.5 ? HAZE[1] : HAZE[0]);
    // Aschethron auf dem Felsdorn: Türme und Mauern als Schattenriss, Glut (Feuerschalen, Fenster) bleibt
    const SIL = [['#0c060a', '#120910', '#190c14', '#200f18'], ['#100709', '#170b0d', '#1f0e10', '#2a1212']];
    const peak = HOR - 26;
    const parts = [
      [deko.obsidianNeedles[1], FX - 44, peak + 20, false, 0], [deko.obsidianNeedles[3], FX + 43, peak + 20, true, 0],
      [deko.bastionWall, FX - 16, peak + 11, false, 0], [deko.bastionWall, FX + 16, peak + 11, false, 0],
      [deko.bastionTower, FX - 30, peak + 17, false, 0], [deko.bastionTower, FX + 30, peak + 17, true, 0],
      [deko.obsidianNeedles[0], FX - 13, peak + 3, false, 1], [deko.obsidianNeedles[2], FX + 13, peak + 3, true, 1],
      [deko.bastionTower, FX, peak, false, 1],
    ];
    for (const [e, x, y, fl, lv] of parts) stamp(F, e, x, y, { flip: fl, G: FG, map: (c, wx, wy) => {
      const j = Math.min(3, Math.floor(lum(c) * 5 + lv * 0.6));
      const warm = HOR - wy < 16 + bay(wx, wy) * 8 ? 1 : 0;
      return rgb(SIL[warm][j]);
    } });

    const FRONT = ['#1a0b10', '#200d12', '#2a1014', '#3a1514'];
    const crag = (x) => 9 * Math.exp(-(((x - FX) / 40) ** 2));
    const hf = (x) => Math.round(HOR - 9 + wave(x, [[4, 3, 2.2], [2.5, 7, 0.7], [1.2, 17, 1.1], [0.5, 37, 0.2]]) - crag(x));
    for (let x = 0; x < W; x++) for (let y = hf(x); y < H; y++) {
      const dy = y - hf(x), fromBase = HOR - y;   // unten von der Lava angestrahlt
      let i = dy === 0 ? 2 : 0;
      if (fromBase < 6 && bay(x, y) < (6 - fromBase) / 6) i = 3; else if (fromBase < 11 && bay(x, y) < (11 - fromBase) / 10) i = Math.max(i, 1);
      F.set(x, y, FRONT[i]);
    }
    // ================= Lavastrom (Spiel-Lava des Thronsaals, 4 Bilder): kommt vom Aschethron und windet sich nach vorn links.
    // Das Lavafeld ist Draufsicht; hier flach gelegt: je Bildzeile mehrere Spielzeilen (hinten mehr, vorn weniger).
    const lava = createBiomeTiles3('throne').liquid;
    const T = 16, LT = HOR - 1, LB = FY + 6;
    const depthOf = (y) => Math.max(0, Math.min(1, (y - HOR) / (FY - HOR)));
    const rcx = (y) => { const t = depthOf(y); return FX - 16 - t * 300 + 26 * Math.sin(t * 5.2 + 0.4) * (0.3 + t); };
    const rw = (y) => { const t = depthOf(y); return 2.5 + t * t * 34 + 1.5 * Math.sin(y * 0.7) * t; };
    const gy = (y) => { let s = 0; for (let k = HOR; k < y; k++) { const t = depthOf(k); s += 4.5 - 3.3 * t; } return Math.round(s); };
    const LAV = [], LAVG = [];
    for (let f = 0; f < LH; f++) {
      const L = buf(W, LB - LT), LG = buf(W, LB - LT);
      const tiles = new Map();
      const at = (wx, wy) => {
        const cx = Math.floor(wx / T), cy = Math.floor(wy / T), k = cx + ',' + cy;
        let t = tiles.get(k);
        if (!t) { t = [pixels(lava.tile(cx, cy, f % 4, 0)), pixels(lava.glowTile(cx, cy, f % 4, 0))]; tiles.set(k, t); }
        const i = ((wy - cy * T) * T + (wx - cx * T)) * 4;
        return [[t[0][i], t[0][i + 1], t[0][i + 2], 255], t[1][i + 3] > 100 ? [t[1][i], t[1][i + 1], t[1][i + 2], 255] : null];
      };
      for (let y = LT; y < LB; y++) {
        const c0 = rcx(y), w = rw(y), wy = 300 + gy(y);
        for (let x = Math.floor(c0 - w - 2); x <= Math.ceil(c0 + w + 2); x++) {
          const d = Math.abs(x - c0) - w + (vnoise(x / 3, y / 2, 61) - 0.5) * 1.6;
          if (d > 0) continue;
          if (d > -1) { L.set(x, y - LT, '#3a1410'); continue; }   // Kruste am Ufer
          const [c, g] = at(x + 500, wy);
          L.set(x, y - LT, c); if (g) LG.set(x, y - LT, g);
        }
      }
      LAV.push(L); LAVG.push(LG);
    }

    // ================= Mitte: Ascheebene, vom Strom angestrahlt; Silhouetten am Ufer
    const M = buf(W, H), MG = buf(W, H);
    const mcrust = makeLava({ seed: 977, crust: ['#000000', '#000000', '#000000', '#000000', '#000000'], emb: PAL.ember, wall: ['#000000', '#000000', '#000000', '#000000', '#000000'], grout: '#000000', cell: 17, open: 0, crack: 0.5 });
    const mct = new Map();
    const mcat = (wx, wy) => {
      const cx = Math.floor(wx / 16), cy = Math.floor(wy / 16), k = cx + ',' + cy;
      let t = mct.get(k);
      if (!t) { t = pixels(mcrust.glowTile(cx, cy, 0, 0)); mct.set(k, t); }
      return t[((wy - cy * 16) * 16 + (wx - cx * 16)) * 4 + 3] > 100;
    };
    const ASH = ['#120b0c', '#181010', '#201512', '#2a1a15', '#362017', '#452818', '#583218'];
    for (let y = HOR - 1; y < H; y++) for (let x = 0; x < W; x++) {
      if (y < hf(x) + 1 && y < HOR) continue;
      const dl = Math.abs(x - rcx(y)) - rw(y);           // Abstand zum Strom
      if (dl < 0) continue;                               // dort liegt die Lava (eigene Ebene)
      const t = depthOf(y), l = lum(groundPixel(',', x, y * 2, GW));
      // Licht: Stufen nach Abstand zum Strom, in der Ferne gedämpft
      let li = dl < 1.5 ? 6 : dl < 4 ? 5 : dl < 9 ? 4 : dl < 18 ? 3 : dl < 34 ? 2 : 1;
      if (y < HOR + 3) li = Math.max(li, 3);              // Dunst am Horizont
      if (bay(x, y) < 0.4 && dl > 1.5 && dl < 36) li = Math.max(1, li - 1);
      if (l > 0.27) li = Math.min(6, li + 1);
      if (l < 0.19) li = Math.max(0, li - 1);
      M.set(x, y, ASH[li]);
      // Erstarrte Kruste auch auf der Ebene: Fugen glimmen, nach hinten schwächer
      if (y > HOR + 2) {
        const g = mcat(x + 900, 200 + gy(y));
        if (g) {
          const lvl = t < 0.25 ? 0 : t < 0.55 ? 1 : 2;
          M.set(x, y, ['#2a120f', '#3e1610', '#5a1e0c'][lvl]);
          if (lvl === 2 && bay(x, y) < 0.5) MG.set(x, y, EMB[1]);
        }
      }
    }
    const mids = [];
    const place = (e, x, y, flip = false) => mids.push({ e, x, y, f: flip });
    const shore = (y, side, off) => Math.round(rcx(y) + side * (rw(y) + off));
    // Gegenlicht-Silhouetten: Nadeln am fernen Ufer, Säulenreste, verkohlte Bäume, links das Schwert des Kolosses
    for (const [y, side, off, e, fl] of [
      [HOR + 8, -1, 4, deko.obsidianNeedles[2], false], [HOR + 10, -1, 12, deko.obsidianNeedles[0], true],
      [HOR + 7, 1, 6, deko.columnStumps[1], false], [HOR + 14, 1, 10, deko.scorchedTrees[1], true],
      [HOR + 26, -1, 8, deko.column[1], false], [HOR + 34, 1, 22, deko.obsidianNeedles[3], true],
      [HOR + 44, -1, 6, deko.scorchedTrees[0], false],
    ]) place(e, shore(y, side, off), y, fl);
    place(deko.colossusRemains[1], 92, HOR + 30);
    mids.sort((a, c) => a.y - c.y);
    for (const o of mids) {
      stamp(M, o.e, o.x, o.y, { flip: o.f, G: MG, map: (c, wx, wy) => {
        const l = lum(c), j = Math.min(4, Math.floor(l * 7));
        const toward = Math.sign(rcx(o.y) - o.x) || 1;      // Kante zum Strom hin warm
        const lit = M.get(wx + toward, wy)[3] === 0 || M.get(wx, wy - 1)[3] === 0;
        return rgb((lit && l > 0.18 ? ['#2a1410', '#3a1a12', '#4a2214', '#5a2a16', '#6a3218'] : ['#0e0809', '#130b0c', '#190e0e', '#211211', '#2a1614'])[j]);
      } });
    }

      return { F, FG, LAV, LAVG, LT, LB, M, MG };
    };
    const near = (W, H, FY, HX) => {
    const wave = (x, parts) => parts.reduce((s, [a, k, ph]) => s + a * Math.sin((2 * Math.PI * k * x) / W + ph), 0);
    // ================= Nah: Felsplateau, Kante warm angestrahlt, Glutadern (Wege der Glutwelle)
    const N = buf(W, H), NG = buf(W, H), NW = buf(W, H);   // NW: alle Fugen hell (Glutwelle)
    const ROCK = ['#0a0608', '#100a0c', '#170f10', '#201413', '#2c1b17', '#3d2419', '#55301a'];
    const top = (x) => Math.round(FY - 3 + wave(x, [[2, 2, 1.2], [1.2, 5, 0.3], [0.6, 13, 2.2]]) + Math.max(0, (x - HX - 70) * 0.05) + Math.max(0, (HX - 90 - x) * 0.05));
    for (let x = 0; x < W; x++) {
      const t0 = top(x);
      for (let y = t0; y < H; y++) {
        const dy = y - t0, n = vnoise(x / 6, y / 2.5, 41) * 0.75 + hash2(x, y, 42) * 0.25;
        let i = dy === 0 ? 6 : dy === 1 ? 5 : dy === 2 ? (n > 0.5 ? 4 : 3) : dy < 6 ? (n > 0.55 ? 3 : 2) : n > 0.62 ? 2 : n > 0.32 ? 1 : 0;
        if (dy > 10 && bay(x, y) < (dy - 10) / 14) i = Math.max(0, i - 1);
        N.set(x, y, ROCK[i]);
      }
    }
    // Erstarrte Lavakruste (Lava-Generator des Spiels, ohne offene Schmelze): Schollen mit glühenden Fugen,
    // flach gelegt (je Bildzeile 2 Spielzeilen). Fugen = Glut-Ebene (Pulsieren und Glutwelle).
    const crust = makeLava({ seed: 4242, crust: ['#0b0709', '#120c0e', '#1a1213', '#241817', '#30201b'], emb: PAL.ember, wall: ROCK, grout: ROCK[0], cell: 15, open: 0, crack: 0.55 });
    const ct = new Map();
    const cat = (wx, wy) => {
      const cx = Math.floor(wx / 16), cy = Math.floor(wy / 16), k = cx + ',' + cy;
      let t = ct.get(k);
      if (!t) { t = [pixels(crust.tile(cx, cy, 0, 0)), pixels(crust.glowTile(cx, cy, 0, 0))]; ct.set(k, t); }
      const i = ((wy - cy * 16) * 16 + (wx - cx * 16)) * 4;
      return [[t[0][i], t[0][i + 1], t[0][i + 2], 255], t[1][i + 3] > 100 ? [t[1][i], t[1][i + 1], t[1][i + 2], 255] : null];
    };
    for (let x = 0; x < W; x++) {
      const t0 = top(x);
      for (let y = t0 + 3; y < H; y++) {
        const dy = y - t0 - 3, [c, g] = cat(x + 64, 64 + Math.round(dy * (1.6 - Math.min(0.6, dy / 40))));
        const fade = dy > 12 ? Math.min(1, (dy - 12) / 18) : 0;   // nach unten dunkler (feste Stufen)
        const k = bay(x, y) < fade ? 0.55 : 1;
        if (g) { const far = Math.abs(x - HX) / 50 + dy / 22; const lv = far < 0.5 ? 0 : far < 1.1 ? 1 : 2; N.set(x, y, lv === 2 ? '#3a1410' : EMB[1]); if (lv < 2) NG.set(x, y, lv === 0 && k === 1 ? g : EMB[2]); NW.set(x, y, k === 1 ? g : EMB[3]); }
        else N.set(x, y, [c[0] * k, c[1] * k, c[2] * k, 255]);
      }
    }

      return { N, NG, NW };
    };
    const { F, FG, LAV, LAVG, LT, LB, M, MG } = back(W * K, H * K, FY * K, HX * K, HOR * K, FX * K);
    const { N, NG, NW } = near(W, H, FY, HX);
    const toUrl = (B) => { const c = document.createElement('canvas'); c.width = B.w; c.height = B.h; c.getContext('2d').putImageData(new ImageData(B.d, B.w, B.h), 0, 0); return c.toDataURL('image/png'); };
    const stack = (arr) => { const h = arr[0].h, c = document.createElement('canvas'); c.width = arr[0].w; c.height = h * arr.length; const x = c.getContext('2d'); arr.forEach((B, i) => x.putImageData(new ImageData(B.d, B.w, B.h), 0, i * h)); return c.toDataURL('image/png'); };
    return { fern: toUrl(F), fernGlut: toUrl(FG), lava: stack(LAV), lavaGlut: stack(LAVG), LH2: LB - LT, mitte: toUrl(M), mitteGlut: toUrl(MG), nah: toUrl(N), nahGlut: toUrl(NG), nahWelle: toUrl(NW), LT };
  }, SZ);
  for (const [k, v] of Object.entries(res)) if (typeof v === 'string') save(`szene-${k}.png`, v);
  Object.assign(SZ, { LT: res.LT, LH2: res.LH2 });
  await p.close();
}

// ---------------------------------------------------------------------------------------------- 2. Held
// Krieger (Mensch) mit Souverän-Rüstung und Königsfall, schaut nach rechts zum Aschethron.
// Ruhe: 24 Bilder (2 s, drei Atemzüge). Momente: Kriegsschrei (skill2, Klinge hoch) und Erdspalter (skill4, Schlag auf
// den Boden) – jeweils ab derselben Ruhepose wie Bild 0 der Ruheschleife, bis alles verklungen ist.
// Gezeichnet: Figur, Klingenglut (Hero.renderEmissive) und die Teilchen der Fähigkeit; ohne Schatten (liegt im Boden),
// ohne die Flammenteilchen der Klinge (die erzeugt titel.js live nach demselben Muster) und ohne Schutzring.
const GEAR = ['sovereign_helm', 'sovereign_plate', 'sovereign_gauntlets', 'sovereign_sabatons', 'sovereign_signet', 'kingsbane'];
const RES = 3, FPS = 12, STEPS = 60 / FPS;
const BOX = [34, 62, 44, 10];   // Rahmen um den Fußpunkt in Weltpixeln: links, oben, rechts, unten
// [Name, Taste, Effekt-Objekte zeichnen]: beim Kriegsschrei nicht (Schallring in Weltpixeln reicht weit in den Text)
const MOMENTE = [['schrei', 'skill2', false], ['schlag', 'skill4', false]];
let HELD;
{
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto(`${BASE}/index.html`);
  await p.waitForFunction(() => window.emberfall?.scenes.currentId === 'title', null, { timeout: 30000 });
  await p.evaluate(() => { window.emberfall.prefs.set('quality', 'high'); window.dispatchEvent(new Event('resize')); });
  HELD = await p.evaluate(async ({ GEAR, RES, STEPS, BOX, MOMENTE }) => {
    const g = window.emberfall, wait = (ms) => new Promise((res) => setTimeout(res, ms));
    g.prefs.set('muted', true); g.prefs.set('guidePath', false);
    const acc = g.save.createAccount('Zolva'); g.login(acc.id);
    g.newGame({ character: { name: 'Zolva', raceId: 'human', classId: 'warrior' } });
    await wait(600);
    for (let i = 0; i < 40; i++) g.state.commit('progress:grantXp', { amount: 5e7, source: 'shot' });
    for (const id of GEAR) {
      g.state.commit('inventory:add', { itemId: id, qty: 1 });
      const slot = g.state.slices.inventory.slots.findIndex((s) => s?.itemId === id);
      if (slot >= 0) g.state.commit('inventory:equip', { slot });
    }
    await wait(800);
    const { setHeroRes } = await import('/src/sprites/hero.js');
    const { CONFIG } = await import('/src/config.js');
    setHeroRes(RES);
    const s = g.scenes.current, w = s.world, h = w.hero, inp = g.input;
    h.refreshLook?.();
    for (const e of w.enemies) e.removed = true;
    w.spawner.update = () => {};
    // Umgebungsteilchen aus. Gezeichnet werden nur Teilchen von Held und Fähigkeit, nicht die der Klinge (die zeichnet
    // titel.js selbst), nicht die Teilchenringe (würden weit in den Text reichen; die Glutwelle übernimmt) und nicht
    // die der Deko und Objekte in der Startzone
    for (const k of ['spawn', 'embers']) {
      const f = w.particles[k].bind(w.particles);
      w.particles[k] = (...a) => { const st = new Error().stack; if (st.includes('ambientParticles')) return null; const q = f(...a); if (q) q.__klinge = /weaponFx|ParticleSystem\.ring/.test(st) || !/Hero|abilities|Effect|Projectile|Combat|Feedback/.test(st); return q; };
    }
    g.loop.running = false;
    await new Promise((res) => requestAnimationFrame(res));
    for (let i = 0; i < 30; i++) g.update(1 / 60);
    w.particles.active.splice(0);
    const old = new Set([...w.entities, ...w.effects]);
    const x0 = h.x, y0 = h.y;
    let simT = 0, hit = false;
    const scorch = w.decals.scorch?.bind(w.decals);
    w.decals.scorch = (...a) => { hit = true; return scorch?.(...a); };
    const step = () => {
      simT += 1 / 60;
      h.hp = h.maxHp; h.resource = h.maxResource;
      for (const a of h.abilities ?? []) a.cdLeft = 0;
      inp.pointer.x = x0 + 40 - s.camera.x; inp.pointer.y = y0 - 4 - s.camera.y;
      inp.pointer.active = true; inp.pointer.lastMove = inp.time; inp.usingTouch = false;
      g.update(1 / 60);
      h.x = x0; h.y = y0; h.facing = 1;
      if (h.buffs?.some((bf) => bf.id === 'guard')) { hit = true; h.buffs = h.buffs.filter((bf) => bf.id !== 'guard'); }
    };
    const [bl, bt, br, bb] = BOX, FW = bl + br, FH = bt + bb;
    const pn = performance.now.bind(performance);
    const fx = (e) => !old.has(e) && !/FloatingText|SoulWisp/.test(e.constructor?.name);
    // Teilchen in Heldenpixeln statt in Weltpixeln (Größe 1 = 1 Heldenpixel statt 3): sonst wirken sie
    // neben der großen Figur wie Klötze; Lage auf Heldenpixel genau statt auf ganze Weltpixel gerundet
    const drawP = (x, cx0, cy0, em) => {
      const A = w.particles.active, keep = A.map((q) => [q.x, q.y, q.z, q.size]);
      for (const q of A) { q.x *= RES; q.y *= RES; q.z *= RES; }
      x.save(); x.setTransform(1, 0, 0, 1, 0, 0);
      try { if (em) w.particles.drawEmissive(x, cx0 * RES, cy0 * RES); else w.particles.drawLit(x, cx0 * RES, cy0 * RES); }
      finally { x.restore(); A.forEach((q, i) => { [q.x, q.y, q.z, q.size] = keep[i]; }); }
    };
    const draw = (mitFx, mitObj = mitFx) => {
      const cv = document.createElement('canvas'); cv.width = FW * RES; cv.height = FH * RES;
      const x = cv.getContext('2d'); x.setTransform(RES, 0, 0, RES, 0, 0); x.imageSmoothingEnabled = false;
      const cx0 = x0 - bl, cy0 = y0 - bt, rs = CONFIG.renderScale; CONFIG.renderScale = RES;
      performance.now = () => simT * 1000;
      const all = w.particles.active;
      try {
        const ents = mitObj ? w.entities.filter(fx) : [], eff = mitObj ? w.effects.filter(fx) : [];
        const ds = [...ents, h, ...(mitFx ? w.projectiles : [])].sort((a, c) => a.sortY - c.sortY);
        w.particles.active = mitFx ? all.filter((q) => !q.__klinge) : [];
        for (const d of ds) if (d === h) h.drawSprite(x, cx0, cy0); else d.render(x, cx0, cy0);
        // nur leuchtende Teilchen (Funken, Glut); Staub und Splitter wären neben der großen Figur nur Klötzchen
        for (const d of ds) d.renderEmissive?.(x, cx0, cy0);
        drawP(x, cx0, cy0, true);
        for (const e of eff) e.renderEmissive?.(x, cx0, cy0);
      } finally { performance.now = pn; CONFIG.renderScale = rs; w.particles.active = all; }
      return cv;
    };
    // Klingenachse des aktuellen Bildes in Heldenpixeln ab Fußpunkt (für die Flammenteilchen in titel.js)
    const axis = () => { const a = h.currentFrame()?.weapon; return a && a.tier && !a.back ? [a.x, a.y, a.ang, a.u0, a.u1].map((v, i) => +(i === 2 ? v : v * RES).toFixed(2)) : 0; };
    const tick = () => { for (let k = 0; k < STEPS; k++) step(); };
    const busy = () => h.animator.name !== 'idle' || w.projectiles.length > 0 || w.entities.some(fx) || w.effects.some(fx) || w.particles.active.some((q) => !q.__klinge);
    const settle = () => {
      for (let i = 0; i < 600 && busy(); i++) step();
      w.particles.active.splice(0);
      for (let i = 0; i < 30; i++) step();
      h.animator.play('idle', true);   // Ruhe ab Pose 0 wie Bild 0 der Schleife
    };
    const out = {};
    settle();
    { const fr = [], ax = []; for (let i = 0; i < 24; i++) { tick(); fr.push(draw(false)); ax.push(axis()); } out.ruhe = { fr, ax }; }
    for (const [name, act, obj] of MOMENTE) {
      settle();
      const fr = [], ax = []; let hitAt = -1;
      for (let i = 0; i < 90; i++) {
        hit = false;
        if (i === 1) inp.press(act);
        for (let k = 0; k < STEPS; k++) { step(); if (i === 1 && k === 1) inp.release(act); }
        if (hit && hitAt < 0) hitAt = i;
        fr.push(draw(true, obj)); ax.push(axis());
        if (i > 6 && !busy()) break;
      }
      // Kriegsschrei: Höhepunkt ist das Bild mit der höchsten Klinge (der Ruf selbst fällt aufs Ausholen)
      if (act === 'skill2') hitAt = ax.reduce((m, a, i) => (a && a[1] < (ax[m]?.[1] ?? 1e9) ? i : m), hitAt);
      // Erdspalter: Einschlag = erstes Bild mit nach unten zeigender Klinge (der Spielzeitpunkt liegt beim Absprung)
      if (act === 'skill4') hitAt = Math.max(0, ax.findIndex((a, i) => i > 1 && a && a[2] > 0.6));
      out[name] = { fr, ax, hit: hitAt };
    }
    const toStrip = (fr) => { const st = document.createElement('canvas'); st.width = FW * RES * fr.length; st.height = FH * RES; const sx = st.getContext('2d'); fr.forEach((c, i) => sx.drawImage(c, i * FW * RES, 0)); return st.toDataURL('image/png'); };
    const res = {};
    for (const [k, v] of Object.entries(out)) res[k] = { url: toStrip(v.fr), n: v.fr.length, ax: v.ax, hit: v.hit };
    return { res, w: FW * RES, h: FH * RES, fx: bl * RES, fy: bt * RES };
  }, { GEAR, RES, STEPS, BOX, MOMENTE });
  for (const [k, v] of Object.entries(HELD.res)) { save(`held-${k}.png`, v.url); delete v.url; console.log(`Held ${k}: ${v.n} Bilder${v.hit >= 0 ? `, Treffer bei Bild ${v.hit}` : ''}`); }
  await p.close();
}
await b.close();

// ---------------------------------------------------------------------------------------------- 3. Bilder (Pillow)
// Heldenstreifen auf den gemeinsamen sichtbaren Rahmen zuschneiden, alles verlustfrei nach WebP, Standbild zusammensetzen.
const py = `
import sys, json, os
from PIL import Image
TMP, IMG, cfg = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
SZ, H = cfg['SZ'], cfg['HELD']; K = SZ['K']
L = lambda n: Image.open(os.path.join(TMP, n)).convert('RGBA')
out = {}
def webp(im, name, opaque=False):
    p = os.path.join(IMG, name); (im.convert('RGB') if opaque else im).save(p, 'WEBP', lossless=True, quality=100, method=6); out[name] = os.path.getsize(p)
# Schatten des Helden in die Kruste (feste Stufen, kein Verlauf)
nah = L('szene-nah.png'); px = nah.load()
for dy, hw, k in [(-1, 15, 0.55), (0, 19, 0.45), (1, 17, 0.5), (2, 12, 0.62)]:
    y = SZ['FY'] + dy
    for x in range(SZ['HX'] - hw, SZ['HX'] + hw + 1):
        r, g, b, a = px[x, y]
        if a: px[x, y] = (int(r * k), int(g * k), int(b * k), a)
ng = L('szene-nahGlut.png'); gp = ng.load()
for dy, hw in [(-1, 15), (0, 19), (1, 17), (2, 12)]:
    for x in range(SZ['HX'] - hw, SZ['HX'] + hw + 1): gp[x, SZ['FY'] + dy] = (0, 0, 0, 0)
# Vordergrund erst ab seiner Oberkante speichern (darüber durchsichtig)
top = min(y for y in range(nah.height) if any(px[x, y][3] for x in range(nah.width)))
SZ['NT'] = top
webp(nah.crop((0, top, nah.width, nah.height)), 'titel-nah.webp'); webp(ng.crop((0, top, ng.width, ng.height)), 'titel-nah-glut.webp')
nw = L('szene-nahWelle.png'); wp = nw.load()
for dy, hw in [(-1, 15), (0, 19), (1, 17), (2, 12)]:
    for x in range(SZ['HX'] - hw, SZ['HX'] + hw + 1): wp[x, SZ['FY'] + dy] = (0, 0, 0, 0)
webp(nw.crop((0, top, nw.width, nw.height)), 'titel-nah-welle.webp')
# Hintere Ebenen nur bis knapp unter die Oberkante des Vordergrunds
cut = (SZ['FY'] + 10) * K
fern = L('szene-fern.png').crop((0, 0, SZ['W'] * K, cut)); webp(fern, 'titel-fern.webp', True)
webp(L('szene-fernGlut.png').crop((0, 0, SZ['W'] * K, cut)), 'titel-fern-glut.webp')
webp(L('szene-mitte.png').crop((0, 0, SZ['W'] * K, cut)), 'titel-mitte.webp'); webp(L('szene-mitteGlut.png').crop((0, 0, SZ['W'] * K, cut)), 'titel-mitte-glut.webp')
webp(L('szene-lava.png'), 'titel-strom.webp'); webp(L('szene-lavaGlut.png'), 'titel-strom-glut.webp')
# Held: gemeinsamer Rahmen über alle Bilder aller Streifen
fw, fh = H['w'], H['h']; strips = {k: L('held-%s.png' % k) for k in H['res']}
x0, y0, x1, y1 = fw, fh, 0, 0
for k, im in strips.items():
    for i in range(H['res'][k]['n']):
        bb = im.crop((i * fw, 0, i * fw + fw, fh)).getbbox()
        if bb: x0, y0, x1, y1 = min(x0, bb[0]), min(y0, bb[1]), max(x1, bb[2]), max(y1, bb[3])
w, h = x1 - x0, y1 - y0
for k, im in strips.items():
    n = H['res'][k]['n']; st = Image.new('RGBA', (w * n, h))
    for i in range(n): st.paste(im.crop((i * fw + x0, y0, i * fw + x1, y1)), (i * w, 0))
    webp(st, 'titel-held-%s.webp' % k)
H.update({'w': w, 'h': h, 'fx': H['fx'] - x0, 'fy': H['fy'] - y0})
# Standbild in hinteren Pixeln: Ebenen in Ruhe (Lavabild 0, volle Glut), Held Bild 0
up = lambda im: im.resize((im.width * K, im.height * K), Image.NEAREST)
po = L('szene-fern.png').crop((0, 0, SZ['W'] * K, SZ['H'] * K)); po.alpha_composite(L('szene-fernGlut.png').crop((0, 0, SZ['W'] * K, SZ['H'] * K)))
lv, lg = L('szene-lava.png'), L('szene-lavaGlut.png')
po.alpha_composite(lv.crop((0, 0, lv.width, SZ['LH2'])), (0, SZ['LT'])); po.alpha_composite(lg.crop((0, 0, lg.width, SZ['LH2'])), (0, SZ['LT']))
po.alpha_composite(L('szene-mitte.png')); po.alpha_composite(L('szene-mitteGlut.png'))
po.alpha_composite(up(nah), (0, 0)); po.alpha_composite(up(ng), (0, 0))
held = strips['ruhe'].crop((x0, y0, x1, y1))
po.alpha_composite(up(held), ((SZ['HX'] - H['fx']) * K, (SZ['FY'] - H['fy']) * K))
p = os.path.join(IMG, 'titel.webp'); po.convert('RGB').save(p, 'WEBP', lossless=True, quality=100, method=6); out['titel.webp'] = os.path.getsize(p)
po.convert('RGB').save(os.path.join(TMP, 'vorschau.png'))
print(json.dumps({'SZ': SZ, 'HELD': H, 'sizes': out}))
`;
if (process.env.NURHELD) process.exit(0);
const r = JSON.parse(execFileSync('python3', ['-c', py, TMP, IMG, JSON.stringify({ SZ, HELD })]).toString());
let total = 0;
for (const [f, n] of Object.entries(r.sizes)) { total += n; console.log(`${f.padEnd(26)} ${(n / 1024).toFixed(1).padStart(7)} KB`); }
console.log(`zusammen ${(total / 1024).toFixed(1)} KB; Vorschau ${join(TMP, 'vorschau.png')}`);

// ---------------------------------------------------------------------------------------------- 4. Maße nach titel.js
const META = { szene: r.SZ, held: { w: r.HELD.w, h: r.HELD.h, fx: r.HELD.fx, fy: r.HELD.fy, ...r.HELD.res } };
const src = readFileSync(JS, 'utf8');
const block = `  // <titel-held.mjs> – von tools/titel-held.mjs geschrieben, nicht von Hand ändern\n  const META = ${JSON.stringify(META)};\n  // </titel-held.mjs>`;
const next = src.replace(/  \/\/ <titel-held\.mjs>[\s\S]*?\/\/ <\/titel-held\.mjs>/, block);
if (next === src && !src.includes(block)) console.log('Hinweis: Block <titel-held.mjs> in site/titel.js nicht gefunden – META nicht geschrieben');
else writeFileSync(JS, next);
