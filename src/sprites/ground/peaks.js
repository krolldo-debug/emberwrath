import { hash2 } from '../../core/math.js';
import { PAL } from '../../gfx/Palette.js';
import { FK, ramp, hxi, D4, clampI, chunkCtx, pebble, stroke, soilFine, soilAt, paveAt, awayFrom, fineAt, bandW } from './kit.js';

// Feinraster-Boden der Schlackenhöhen (biome 'peaks'). Farben wie GROUND_PEAKS / peaksPixel in sprites/decor_peaks.js
// (dort nur gelesen): Basaltgeröll (Grundton), helle Asche (u), rostige Schlacke (v), Erzadern (o), Schlackenglas (s),
// Schwefel (y), heller Kies (g), Geröll am Wandfuß (r dicht, p locker), Hangwege mit Höhenlinien (h), rostige Erdwege.
// Statt Sprenkeln: flache Tonflächen, Kiesel/Brocken mit Glanzpunkt oben links und Schlagschatten, Risse mit
// Lichtkante, Blasen im Schlackenglas, einzelne Glanzpunkte. Rostwasser und Glutspalten: Weltpixel-Shader (-1).
// Die gemalten Felsen (paintCliffs) kommen als Ebene darüber (world/Outdoor.js).
const C = {
  scree: ramp(['#131519', '#1a1c21', '#22252a', '#2b2e34', '#35383e', '#41444a', '#52555b']),
  ore: ramp(['#1c100b', '#2a170f', '#3a1f13', '#4b2817', '#5e331c', '#723f22', '#8a5230']),
  slag: ramp(['#0b0b0e', '#111116', '#17181e', '#1f2028', '#282a34', '#343846', '#5a6c8c']),
  sulf: ramp(['#1d1a0e', '#2a2512', '#3a3216', '#4c411a', '#5f511f', '#776726', '#958436']),
  grav: ramp(['#161618', '#1d1d1f', '#262628', '#303032', '#3b3a3b', '#474545', '#555251', '#67635f']),
  ash: ramp(['#1c1a18', '#24221f', '#2d2b27', '#383530', '#44403a', '#514c45', '#615b52']),
  rust: ramp(['#1f140c', '#28190f', '#332014', '#40281a', '#4e3120', '#5d3a25', '#6f462c']),
  rub: ramp(['#141518', '#1b1c1f', '#232427', '#2c2d30', '#36363a', '#434245', '#545150']),
  // Basaltbrocken: mehr Licht auf der Oberseite als der Boden (Material liest sich auch im Dunkeln)
  peb: ramp(['#0e0f12', '#1d1e22', '#2a2b30', '#383a3f', '#4a4c52', '#5f6168', '#7a7c83']),
  dirt: ramp(['#150f0b', '#1b130e', '#261a12', '#332316', '#412c1b', '#503621', '#614128', '#734d31']),
  pave: ramp(PAL.stone),
  mortar: hxi(PAL.mortar),
};
// Bodenarten (level.soil, Zeichencode)
const SO = 111, SS = 115, SY = 121, SG = 103, SU = 117, SV = 118, SR = 114, SP = 112, SH = 104;
const GR = FK.GRASS, DI = FK.DIRT;
// Rampe und Grundstufe je Bodenart (Index = Zeichencode)
const RAMP = new Array(128).fill(C.scree);
RAMP[SO] = C.ore; RAMP[SS] = C.slag; RAMP[SY] = C.sulf; RAMP[SG] = C.grav; RAMP[SU] = C.ash; RAMP[SV] = C.rust;
RAMP[SR] = C.rub; RAMP[SP] = C.rub; RAMP[SH] = C.rub;

function* peaksSetup(x0, y0, cw, ch, K, KW, M, map) {
  const S = chunkCtx(x0, y0, cw, ch, K, KW, M);
  S.soil = soilFine(S, map.level.soil, 11, 301, 302, 16);
  const has = S.soilHas;
  yield;
  S.tone = S.noise([[3, 9, 8, 911, 0.6], [2, 3.5, 3, 912, 0.4]]);
  // Erzadern (gestreckt), Asche-Rippen, Höhenlinien der Hangwege
  S.vein = has[SO] ? S.noise([[2, 4, 14, 17, 1]]) : null;
  S.crk = has[SY] ? S.noise([[3, 9, 8, 19, 1]]) : null;
  S.hl = has[SH] ? S.noise([[4, 16, 40, 73, 0.85], [3, 5, 9, 74, 0.15]]) : null;
  yield;
  stamps(S);
  return S;
}

function stamps(S) {
  const { kAt } = S;
  const sAt = (F, G) => soilAt(S, F, G);
  // Kiesel und Brocken (Licht oben links, Schlagschatten): Dichte und Größe je Bodenart
  S.cells(9, 7, 6, (cx, cy) => {
    const h = hash2(cx, cy, 920);
    if (h >= 0.7) return;
    const AF0 = cx * 9 + 4, AG0 = cy * 7 + 3, k = kAt(AF0, AG0), s = sAt(AF0, AG0);
    let dens, big;
    if (k === GR) {
      dens = s === SR ? 0.7 : s === SP ? 0.34 : s === SH ? 0.16 : s === SG ? 0.5 : s === SV ? 0.26 : s === SU ? 0.05 : s === SS || s === SY || s === SO ? 0.06 : 0.16;
      big = s === SR ? 1.2 : s === SG ? -0.6 : 0;
    } else if (k === DI) {
      dens = s === SR ? 0.3 : s === SG ? 0.4 : s === SP || s === SH ? 0.14 : awayFrom(S, AF0, AG0, GR) ? 0.05 : 0.12; big = s === SG ? -0.7 : -0.5;
    } else return;
    if (h >= dens) return;
    const rx = Math.max(0.9, 1.1 + big + hash2(cx, cy, 921) * 2), ry = rx * (0.6 + hash2(cx, cy, 922) * 0.2);
    const px = cx * 9 + rx + 1 + hash2(cx, cy, 923) * Math.max(0, 7 - 2 * rx), py = cy * 7 + ry + 1 + hash2(cx, cy, 924) * Math.max(0, 5 - 2 * ry);
    const St = s === SG ? C.grav : s === SV ? C.rust : s === SU ? C.ash : C.peb;
    pebble(S, px, py, rx, ry, St, hash2(cx, cy, 925) < 0.3 ? -1 : 0, -2);
  });
  // Risse im Basalt und in der Asche: dunkle Linie mit Lichtkante darunter
  S.cells(18, 14, 8, (cx, cy) => {
    if (hash2(cx, cy, 930) >= 0.22) return;
    const ax = cx * 18 + 2 + Math.floor(hash2(cx, cy, 931) * 10), ay = cy * 14 + 3 + Math.floor(hash2(cx, cy, 932) * 8);
    const s = sAt(ax, ay);
    if (kAt(ax, ay) !== GR || !(s === 32 || s === SU || s === SV)) return;
    const len = 4 + Math.floor(hash2(cx, cy, 933) * 6), sl = [-0.5, -0.25, 0.25, 0.5][Math.floor(hash2(cx, cy, 934) * 4)];
    stroke(S, ax, ay, len, sl, null, -2, 1);
    if (len > 7) stroke(S, ax + 4, ay + Math.round(4 * sl), 3, -sl, null, -2, 1);
  });
  // Schlackenglas: Blasen (Innenwand oben links dunkel, unten rechts hell) und kalte Glanzpunkte
  S.cells(6, 5, 2, (cx, cy) => {
    const h = hash2(cx, cy, 940);
    if (h >= 0.4) return;
    const F = cx * 6 + 1 + Math.floor(hash2(cx, cy, 941) * 4), G = cy * 5 + 1 + Math.floor(hash2(cx, cy, 942) * 3);
    if (kAt(F, G) !== GR || sAt(F, G) !== SS) return;
    if (h < 0.09) { S.put(F, G, C.slag[6]); return; }
    S.mark(F, G, -2); S.mark(F + 1, G, -1); S.mark(F, G + 1, -1); S.mark(F + 1, G + 1, 1);
  });
  // Schwefel: Kristalle (ein heller Feinpixel über einem dunklen) und Krustenränder
  S.cells(7, 6, 2, (cx, cy) => {
    const h = hash2(cx, cy, 950);
    if (h >= 0.3) return;
    const F = cx * 7 + 1 + Math.floor(hash2(cx, cy, 951) * 5), G = cy * 6 + 1 + Math.floor(hash2(cx, cy, 952) * 4);
    if (kAt(F, G) !== GR || sAt(F, G) !== SY) return;
    if (h < 0.12) { S.put(F, G, C.sulf[6]); S.put(F, G + 1, C.sulf[4]); S.markMin(F + 1, G + 1, -1); return; }
    for (let i = 0; i < 3; i++) { S.mark(F + i, G, 1); S.mark(F + i, G + 1, -1); }
  });
  // Erz: einzelne Rostglanzpunkte in den Adern
  S.cells(10, 8, 0, (cx, cy) => {
    if (hash2(cx, cy, 960) >= 0.22) return;
    const F = cx * 10 + 1 + Math.floor(hash2(cx, cy, 961) * 8), G = cy * 8 + 1 + Math.floor(hash2(cx, cy, 962) * 6);
    if (kAt(F, G) !== GR || sAt(F, G) !== SO || fineAt(S.vein, S, F, G) < 0.6) return;
    S.put(F, G, C.ore[6]); S.markMin(F + 1, G + 1, -1);
  });
  // Wege: Erdkrumen (oben hell, darunter dunkel) und Fahrrillen-Stücke in der Wegmitte
  S.cells(6, 5, 2, (cx, cy) => {
    const h = hash2(cx, cy, 970);
    if (h >= 0.14) return;
    const F = cx * 6 + Math.floor(hash2(cx, cy, 971) * 3), G = cy * 5 + 1 + Math.floor(hash2(cx, cy, 972) * 2);
    if (kAt(F, G) !== DI) return;
    const w = 2 + (hash2(cx, cy, 973) < 0.4 ? 1 : 0);
    for (let i = 0; i < w; i++) { S.mark(F + i, G, 1); S.mark(F + i, G + 1, -1); }
  });
}

// Weg (rostige Erde): heller als das Geröll, Böschung oben dunkel, Unterkante zum Geröll hell
// Auf Erz, Schlacke, Schwefel und Kies nimmt der Weg die Farbe des Bodens an (eine Stufe heller, wie peaksPixel)
function roadPx(K, ki, KW, S, dt, a, o, F, G) {
  const s = S.soil[ki], own = s === SO || s === SS || s === SY || s === SG, D = own ? RAMP[s] : C.dirt;
  if (K[ki - KW] === GR) return D[1];
  if (a >= 0) return a;
  let i = 2 + bandW(fineAt(S.tone, S, F, G), 2.4, dt, 0.12);
  if (own) { const m = soilMod(s, S, F, G, dt, i); return m < 0 ? D[0] : D[clampI(m + S.rel[o], 0, 5)]; }
  if (K[ki - 2 * KW] === GR || K[ki - 1] === GR) i = Math.min(i, 2);
  else if (K[ki + KW] === GR || K[ki + 1] === GR) i = Math.max(i, 4);
  return D[clampI(i + S.rel[o], 0, 7)];
}

// Zeichnung der Bodenart auf der Stufe k: Erzadern heller, Schwefel mit Trockenrissen (-1 = Rissfarbe)
function soilMod(s, S, F, G, dt, k) {
  if (s === SO) return fineAt(S.vein, S, F, G) > 0.8 + (dt - 0.5) * 0.02 ? k + 1 : k;
  if (s === SY) {
    // Netz aus Trockenrissen: Linie dunkel, Kante darunter hell
    if (Math.abs(fineAt(S.crk, S, F, G) - 0.5) < 0.022) return -1;
    if (Math.abs(fineAt(S.crk, S, F, G - 1) - 0.5) < 0.022) return k + 1;
  }
  return k;
}

function peaksFine(kind, F, G, K, ki, KW, S) {
  if (kind > FK.PAVE) return -1;   // Rostwasser, Glutspalten: Weltpixel-Shader
  if (kind === FK.PAVE) { const i = paveAt(F, G); return i < 0 ? C.mortar : C.pave[i]; }
  const o = (G - S.G0) * S.W2 + (F - S.F0), a = S.abs[o], dt = D4[(G & 3) * 4 + (F & 3)] / 16;
  if (kind === DI) return roadPx(K, ki, KW, S, dt, a, o, F, G);
  if (a >= 0) return a;
  const s = S.soil[ki], R = RAMP[s & 127];
  // Kante über dem Weg: Geröllsaum im Licht
  if (K[ki + KW] === DI) return R[4];
  let k = soilMod(s, S, F, G, dt, 1 + bandW(fineAt(S.tone, S, F, G), 2.4, dt, 0.12));
  if (k < 0) return R[0];
  if (s === SH) {
    // Höhenlinien: gewellte, waagrechte Absätze (heller Grat, dunkle Stufe darunter), je 1 Feinpixel
    const c = G / 2 + (fineAt(S.hl, S, F, G) - 0.5) * 14, b = ((c % 7) + 7) % 7;
    if (b < 0.5) k++; else if (b < 1) k--;
  }
  return R[clampI(k + S.rel[o], 0, 5)];
}

export const FINE_PEAKS = { finePixel: peaksFine, fineSetup: peaksSetup, fineTufts: false };
