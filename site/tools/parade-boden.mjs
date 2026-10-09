// Boden der Reittier-Parade (Startseite): zwei nahtlos waagerecht kachelbare Streifen in Spielpixeln, 2 Bildpunkte je
// Weltpixel (RES 2 wie die Reittier-Streifen, tools/reittiere-gang.mjs).
//   parade-nah.webp  512 × 40 Weltpixel: Laufboden. Zeile 0–3 hinterer Grasrand, 4–13 Wegspur (festgetretene Erde, Kies,
//                    Steine), Lauflinie (Hufe setzen auf) = Zeile LAUF (10); darunter Gras-Kacheln mit Steinen und Büscheln.
//   parade-fern.webp 512 × 28 Weltpixel: Hügelkette mit Büscheln und Felsen, oben transparent, dunkel und kontrastarm.
//                    Liegt hinter dem Laufboden: Unterkante fern = Oberkante nah + UEBERLAPP (4) Weltpixel; scrollt langsamer.
// Bausteine sind die Spielgrafiken selbst, im Browser direkt aus src/ geladen (kein Spielstart nötig):
// Paletten der Aschensteppe (GROUND_STEPPE, Erde, Gestein, Stroh), Steppen-Deko (Grasbüschel steppeGrass, Findlinge
// boulders, Dornbüsche thornShrubs aus sprites/decor_steppe.js), deren Felsschattierung shadeLump und Halme blade.
// Das Spiel hat für Außenflächen keine gemalten Kacheln, sondern einen Pixel-Shader (Rauschen, Halmstriche) – daher baut
// das Werkzeug daraus echte 16×16-Kacheln (Wegkachel, Graskachel, je 4 Varianten) in ruhiger 16-Bit-Machart.
// Nahtlos: Kachelraster 16 px, Hügel aus Sinuswellen mit ganzzahligen Perioden je Streifenbreite, Deko wird
// um die Breite umgebrochen gestempelt. Ferne-Farben: feste Abbildung der Deko-Helligkeit auf eine dunkle Rampe.
// Aufruf: node parade-boden.mjs [ZIELORDNER] [URL]; Standard site/img, Server :8104 = Repo-Wurzel.
// Vorschau (2×, Hintergrund #0a0510, beide Ebenen je 2× nebeneinander) nach $ZWISCHEN/parade-boden/vorschau.png.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const [OUTDIR = join(HERE, '../img'), BASE = 'http://localhost:8104'] = process.argv.slice(2);
const TMP = join(process.env.ZWISCHEN ?? '/tmp', 'parade-boden');
mkdirSync(TMP, { recursive: true });
const RES = 2, W = 512, NH = 40, FH = 28, LAUF = 10, UEBERLAPP = 4;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.route(`${BASE}/__leer`, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' }));
await p.goto(`${BASE}/__leer`);
const res = await p.evaluate(async ({ W, NH, FH }) => {
  const S = await import('/src/sprites/decor_steppe.js');
  const { createRng, hash2 } = await import('/src/core/math.js');
  const deko = S.createSteppeDecor();
  const GR = S.GROUND_STEPPE.grass, DI = S.GROUND_STEPPE.dirt;      // Steppengras, Steppenerde (je 6 Stufen)
  const SST = ['#141217', '#1d1a1e', '#282426', '#35302f', '#453e3a', '#574e47', '#6f655a', '#8a7f70']; // Gestein (decor_steppe)
  const STRAW = ['#1c160c', '#2b2212', '#3f3219', '#554422', '#6d592d', '#88713c', '#a68f55'];
  const DRYG = ['#17180f', '#232415', '#30301b', '#3f3e22', '#504d2a', '#645f34'];
  const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255]; };

  // Pixelpuffer mit waagerechtem Umbruch (nahtlos)
  const buf = (w, h) => {
    const d = new Uint8ClampedArray(w * h * 4);
    const set = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (y < 0 || y >= h) return; x = ((x % w) + w) % w; const v = typeof c === 'string' ? rgb(c) : c; d.set(v, (y * w + x) * 4); };
    const get = (x, y) => { x = ((x % w) + w) % w; const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
    return { w, h, d, set, get, px: set };
  };
  // PixelCanvas-ähnliche Hülle für die Spielhelfer (shadeLump, blade) über einem Puffer
  const pc = (B, ox = 0, oy = 0) => ({ px: (x, y, c) => B.set(x + ox, y + oy, c) });
  // Sprite (Canvas) mit Fußpunkt (fx, fy) stempeln; map ersetzt Farben (Ferne)
  const pixels = (cv) => { const x = cv.getContext('2d', { willReadFrequently: true }); return x.getImageData(0, 0, cv.width, cv.height).data; };
  const stamp = (B, e, fx, fy, map = null, flip = false) => {
    const s = e.sprite ?? e, cv = s.canvas, a = pixels(cv);
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
      const sx = flip ? cv.width - 1 - x : x, i = (y * cv.width + sx) * 4;
      if (a[i + 3] < 128) continue;
      const c = [a[i], a[i + 1], a[i + 2], 255];
      B.set(fx - s.ax + x, fy - s.ay + y, map ? map(c) : c);
    }
  };

  // ---------------------------------------------------------------- Kacheln 16×16
  // Grasbüschel-Glyphen: L Licht, M Mitte, D dunkel, S Schatten darunter (Licht von links oben wie im Spiel)
  const TUFTS = [
    ['.L...L.', 'LML.LM.', 'MMDLMMD', '.SSSSS.'],
    ['L.L', 'MLM', 'SSS'],
    ['..L.L..', '.LM.ML.', 'LMMDMMD', 'SSSSSS.'],
    ['.L..', 'LMLM', 'MDMD', '.SS.'],
  ];
  const glyph = (set, g, x0, y0, pal) => g.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') set(x0 + i, y0 + j, pal[ch]); }));
  const tile = (fn) => { const t = buf(16, 16); fn(t); return t; };
  // Graskachel: Grundton, weiche waagerechte Flecken, Büschel-Glyphen, vereinzelt Erdkrümel
  const grassTile = (seed, dark = 0) => tile((t) => {
    const rng = createRng(seed), g = (i) => GR[Math.max(0, i - dark)];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) t.set(x, y, g(2));
    // weiche, flache Flecken (heller/dunkler) mit geordnetem Rasterrand – kein Rauschen
    for (let k = 0; k < 2; k++) {
      const cx = rng.int(0, 15), cy = rng.int(2, 13), rx = rng.range(3.5, 6), ry = rng.range(1.6, 2.6), c = k ? g(1) : g(3);
      for (let y = -3; y <= 3; y++) for (let x = -6; x <= 6; x++) {
        const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
        if (d <= 0.55 || (d <= 1 && S.bayer(cx + x, cy + y) < 0.5)) t.set(((cx + x) % 16 + 16) % 16, ((cy + y) % 16 + 16) % 16, c);
      }
    }
    const pal = { L: g(4), M: g(3), D: g(3), S: g(1) };
    for (let k = 0; k < 3; k++) {
      const gl = TUFTS[rng.int(0, TUFTS.length - 1)], y0 = rng.int(1, 15 - gl.length), x0 = rng.int(0, 15);
      const straw = rng.chance(0.3);
      gl.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') t.set((x0 + i) % 16, y0 + j, straw && ch === 'L' ? STRAW[4 - dark] : pal[ch]); }));
    }
    if (rng.chance(0.5)) { const x = rng.int(0, 14), y = rng.int(3, 14); t.set(x, y, DI[3]); t.set(x + 1, y, DI[2]); t.set(x, y + 1, g(1)); t.set(x + 1, y + 1, g(1)); }
  });
  // Wegkachel (16 hoch = Zeile 0–15 des nahen Streifens): hinterer Grasrand 0–3, Wegspur 4–13, Böschung 14–15
  const pathTile = (seed) => tile((t) => {
    const rng = createRng(seed);
    const back = [];
    for (let x = 0; x < 16; x++) back.push(x === 0 || x === 15 ? 3 : 3 + (hash2(x >> 1, 1, seed) < 0.3 ? -1 : 0) + (hash2(x >> 2, 2, seed) < 0.25 ? 1 : 0));
    for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) {
      let c;
      if (y < back[x]) c = y === 0 ? GR[3] : GR[2];                       // hinterer Grasrand
      else if (y === back[x]) c = DI[1];                                  // Schattenkante auf dem Weg
      else if (y >= 14) c = y === 14 ? DI[1] : DI[0];                     // Böschung zur Wiese
      else if (y >= 7 && y <= 11) c = DI[3];                             // festgetretene Laufmitte
      else if (y === 6 || y === 12) c = S.bayer(x, y) < 0.5 ? DI[3] : DI[2]; // gerasterter Übergang
      else c = y === 13 ? DI[2] : DI[2];
      t.set(x, y, c);
    }
    // Rillen der Fahrspur vorn und hinten, lange Striche
    for (const ry of [5, 13]) { let x = rng.int(0, 5); while (x < 16) { const l = rng.int(4, 8); for (let i = 0; i < l && x + i < 16; i++) t.set(x + i, ry, DI[1]); x += l + rng.int(3, 6); } }
    // Kiesel: 2 px hell mit Schatten darunter
    for (let k = 0, n = rng.int(1, 2); k < n; k++) {
      const x = rng.int(0, 14), y = rng.pick([6, 9, 11]) + rng.int(-1, 1), hi = k === 1 ? SST[5] : DI[5];
      t.set(x, y, hi); t.set(x + 1, y, k === 1 ? SST[4] : DI[4]); t.set(x, y + 1, DI[1]); t.set(x + 1, y + 1, DI[1]);
    }
    // helle Abriebstriche in der Laufmitte
    { const x = rng.int(0, 10), y = rng.int(8, 10); for (let i = 0; i < rng.int(3, 5); i++) t.set(x + i, y, DI[4]); }
  });
  const PATH = [11, 23, 37, 41].map(pathTile), GRASS = [3, 17, 29, 43].map((s) => grassTile(s)), DEEP = [5, 19, 31, 47].map((s) => grassTile(s, 1));
  // Kachelfolge ohne direkte Wiederholung, auch über die Naht (letzte ≠ erste)
  const order = (n, k, seed) => { const o = []; for (let i = 0; i < n; i++) { let v, a = 0; do v = Math.floor(hash2(i, k, seed + 7 * a++) * 4); while (o.length && v === o[o.length - 1] || (i === n - 1 && v === o[0])); o.push(v); } return o; };

  // ---------------------------------------------------------------- naher Streifen
  const N = buf(W, NH);
  const lay = (set, row, y0) => order(W / 16, y0, 900 + y0).forEach((v, i) => { const t = set[v]; for (let y = 0; y < 16 && y0 + y < NH; y++) for (let x = 0; x < 16; x++) N.set(i * 16 + x, y0 + y, t.get(x, y)); });
  lay(PATH, 0, 0); lay(GRASS, 1, 16); lay(DEEP, 2, 32);
  const rng = createRng(4242);
  // Steine im Weg (Felsschattierung des Spiels, Licht links oben), nicht auf der Lauflinie
  for (let i = 0; i < 9; i++) {
    const x = Math.round((i + 0.3 + rng.next() * 0.4) * W / 9), behind = i % 3 === 1;
    const cy = behind ? 5 : 12, rx = behind ? 2.2 : rng.range(2.4, 3.4), ry = behind ? 1.4 : 1.8;
    for (let j = -Math.ceil(rx); j <= Math.ceil(rx); j++) if (Math.abs(j) < rx) N.set(x + j + 1, cy + Math.round(ry), DI[0]); // Schlagschatten
    S.shadeLump(pc(N), x, cy, rx, ry, SST.slice(2, 7), 3100 + i, { rough: 0.1, flat: 0.2 });
  }
  // Grasfransen über der Böschung (Zeile 13–16) und vereinzelt am hinteren Rand, unregelmäßige Abstände
  const FR = [['.L.L.', 'LMLML', 'MMMMM'], ['L..L', 'MLLM', 'MMMM'], ['.L.', 'LML', 'MMM']];
  for (let x = 0; x < W; x += rng.int(4, 12)) {
    const gl = FR[rng.int(0, 2)], straw = rng.chance(0.25);
    glyph(N.set, gl, x, 14 - gl.length + 2 + rng.int(0, 1), { L: straw ? STRAW[4] : GR[4], M: GR[3] });
  }
  for (let x = 0; x < W; x += rng.int(10, 22)) glyph(N.set, FR[2], x, 2, { L: GR[3], M: GR[2] });
  // Deko in der Wiese, nach Fußpunkt sortiert: Grasbüschel, kleine Findlinge
  const items = [];
  for (let i = 0; i < 8; i++) items.push({ e: deko.steppeGrass[i % 3 === 0 ? 0 : 2], x: Math.round((i + 0.2 + rng.next() * 0.6) * W / 8), y: 25 + rng.int(0, 7), f: rng.chance(0.5) });
  for (let i = 0; i < 4; i++) items.push({ e: deko.boulders[i === 2 ? 0 : 2], x: Math.round((i + 0.55 + rng.next() * 0.3) * W / 4), y: i === 2 ? 39 : 30 + rng.int(0, 5), f: i % 2 === 1 });
  // Findlinge fest abgedunkelt (heller Kalkstein stäche auf der dunklen Seite heraus)
  const dim = (k) => (c) => [c[0] * k, c[1] * k, c[2] * k, 255];
  items.sort((a, c) => a.y - c.y).forEach((o) => stamp(N, o.e, o.x, o.y, o.e === deko.steppeGrass[0] || o.e === deko.steppeGrass[2] ? dim(0.92) : dim(0.72), o.f));
  // Unterkante zur dunklen Seite hin abdunkeln: feste Stufen mit geordnetem Raster (keine Filter)
  for (let y = 30; y < NH; y++) for (let x = 0; x < W; x++) {
    const t = (y - 29) / 11, k = 1 - 0.55 * t + (S.bayer(x, y) - 0.5) * 0.12, q = Math.round(k * 8) / 8, c = N.get(x, y);
    const bg = [10, 5, 16];
    N.set(x, y, [bg[0] + (c[0] - bg[0]) * q, bg[1] + (c[1] - bg[1]) * q, bg[2] + (c[2] - bg[2]) * q, 255]);
  }

  // ---------------------------------------------------------------- ferner Streifen
  const F = buf(W, FH);
  const FAR = ['#110d15', '#16121a', '#1b171e', '#211c22', '#272226', '#2e2829'];  // dunkel, leicht violett, wenig Kontrast
  const FAR2 = ['#0f0b13', '#131017', '#18141b', '#1d181f'];
  const wave = (x, parts) => parts.reduce((s, [a, k, ph]) => s + a * Math.sin(2 * Math.PI * k * x / W + ph), 0);
  for (let x = 0; x < W; x++) {
    const hb = Math.round(9 + wave(x, [[4, 2, 0.4], [2.2, 5, 1.9], [0.9, 13, 0.3]]));   // hintere Kette
    const hf = Math.round(17 + wave(x, [[3, 3, 2.2], [1.6, 7, 0.7], [0.7, 17, 1.1]])); // vordere Kette
    for (let y = Math.max(0, hb); y < FH; y++) F.set(x, y, y === hb ? FAR2[3] : FAR2[y - hb < 4 ? 2 : 1]);
    for (let y = Math.max(0, hf); y < FH; y++) {
      const dy = y - hf;
      const c = dy === 0 ? FAR[4] : dy === 1 ? FAR[3] : dy < 5 ? (S.bayer(x, y) < 0.5 ? FAR[3] : FAR[2]) : dy < 8 ? FAR[2] : FAR[1];
      F.set(x, y, c);
    }
  }
  // Deko der Ferne: Helligkeit fest auf die dunkle Rampe abgebildet
  const farMap = (c) => { const l = (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255; return rgb(FAR[Math.min(5, Math.floor(l * 9))]); };
  const hfAt = (x) => Math.round(17 + wave(x, [[3, 3, 2.2], [1.6, 7, 0.7], [0.7, 17, 1.1]]));
  const hbAt = (x) => Math.round(9 + wave(x, [[4, 2, 0.4], [2.2, 5, 1.9], [0.9, 13, 0.3]]));
  const fr = createRng(777), far = [];
  for (let i = 0; i < 5; i++) { const x = Math.round((i + 0.5) * W / 5 + fr.int(-20, 20)); far.push({ e: deko.boulders[i % 2 ? 1 : 2], x, y: hfAt(x) + 3, map: farMap }); }
  for (let i = 0; i < 2; i++) { const x = Math.round((i + 0.15) * W / 2 + fr.int(-10, 10)); far.push({ e: deko.thornShrubs[0], x, y: hfAt(x) + 2, map: farMap }); }
  for (let i = 0; i < 12; i++) { const x = Math.round((i + fr.next()) * W / 12); far.push({ e: deko.steppeGrass[i % 3], x, y: hfAt(x) + 2, map: farMap }); }
  // kleine Silhouetten auf der hinteren Kette (noch dunkler)
  const backMap = (c) => rgb(FAR2[(0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) > 90 ? 3 : 2]);
  for (let i = 0; i < 6; i++) { const x = Math.round((i + fr.next()) * W / 6); far.unshift({ e: deko.steppeGrass[2], x, y: hbAt(x) + 2, map: backMap }); }
  far.sort((a, c) => (a.map === backMap) - (c.map === backMap) || a.y - c.y);
  far.filter((o) => o.map === backMap).concat(far.filter((o) => o.map !== backMap)).forEach((o) => stamp(F, o.e, o.x, o.y, o.map));

  const toUrl = (B) => { const c = document.createElement('canvas'); c.width = B.w; c.height = B.h; c.getContext('2d').putImageData(new ImageData(B.d, B.w, B.h), 0, 0); return c.toDataURL('image/png'); };
  return { nah: toUrl(N), fern: toUrl(F) };
}, { W, NH, FH });
await b.close();

const fN = join(TMP, 'nah-1x.png'), fF = join(TMP, 'fern-1x.png'), VOR = join(TMP, 'vorschau.png');
writeFileSync(fN, Buffer.from(res.nah.split(',')[1], 'base64'));
writeFileSync(fF, Buffer.from(res.fern.split(',')[1], 'base64'));
const outN = join(OUTDIR, 'parade-nah.webp'), outF = join(OUTDIR, 'parade-fern.webp');
// Hochskalieren (nächster Nachbar, RES), verlustfrei speichern, Vorschau: fern 2× über nah 2×, Überlappung wie auf der Seite
const py = `
import sys, json
from PIL import Image
fN, fF, outN, outF, vor, RES, UE = json.loads(sys.argv[1])
n = Image.open(fN).convert('RGBA'); f = Image.open(fF).convert('RGBA')
N = n.resize((n.width * RES, n.height * RES), Image.NEAREST); Fm = f.resize((f.width * RES, f.height * RES), Image.NEAREST)
N.convert('RGB').save(outN, 'WEBP', lossless=True, quality=100, method=6)
Fm.save(outF, 'WEBP', lossless=True, quality=100, method=6)
w = N.width * 2; top = 24 * RES; fy = top; ny = fy + Fm.height - UE * RES
pv = Image.new('RGBA', (w, ny + N.height + 24 * RES), (10, 5, 16, 255))
for i in range(2):
    pv.alpha_composite(Fm, (i * Fm.width, fy)); pv.alpha_composite(N, (i * N.width, ny))
pv = pv.resize((pv.width * 2, pv.height * 2), Image.NEAREST); pv.convert('RGB').save(vor)
print(json.dumps([N.size, Fm.size]))
`;
const sizes = JSON.parse(execFileSync('python3', ['-c', py, JSON.stringify([fN, fF, outN, outF, VOR, RES, UEBERLAPP])]).toString());
console.log(`nah  ${W}×${NH} Weltpixel (${sizes[0].join('×')} px), Lauflinie Zeile ${LAUF}: ${outN} ${(statSync(outN).size / 1024).toFixed(1)} KB`);
console.log(`fern ${W}×${FH} Weltpixel (${sizes[1].join('×')} px), Unterkante = Oberkante nah + ${UEBERLAPP}: ${outF} ${(statSync(outF).size / 1024).toFixed(1)} KB`);
console.log(`Vorschau: ${VOR}`);
