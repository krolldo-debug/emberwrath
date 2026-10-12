import { hash2 } from '../../core/math.js';
import { FK, ramp, D4, clampI, band, darken, chunkCtx, awayFrom, pebble, blade, waterPrep, waterStamps, waterFine } from './kit.js';

// Feinraster-Boden des Faulmarschs (Palette GROUND_MARSH in sprites/decor_marsh.js, hier nachgebaut).
// Moor: Moospolster mit Licht oben links, Seggenbüschel mit fahlen Spitzen, nasse Torfflecken mit Pfützen;
// Dämme und Lehm (Erde) heller als das Moor, mit Trittspuren, Wurzeln und Wasser in den Spuren.
// Sumpfwasser fein: trübe Tonflächen in harten Stufen, Uferböschung (Schlamm hell, darunter Schatten), Entengrütze
// in Ufernähe, kurze Wellenstriche, selten Gasblasen. Die alten Glanzpunkte (mit Leuchtebene) bleiben beim
// Weltpixel-Shader (-1), damit Wasserglanz und Licht genau wie bisher liegen.

const GR = FK.GRASS, DI = FK.DIRT, WA = FK.WATER;

const P = {
  // Moorgras (Grundton)
  floor: ramp(['#090f0b', '#0c120e', '#101811', '#141f16', '#19261a', '#1f2e1f', '#283a26']),
  // Moospolster (Rampe für pebble: dunkel → hell)
  moss: ramp(['#0a110c', '#111a12', '#172418', '#1e2f1e', '#273b25', '#33492d', '#425a36']),
  // nasser Torf
  peat: ramp(['#11120d', '#171711', '#1d1c15', '#24221a']),
  // Segge (Fuß dunkel → Spitze fahl)
  sedge: ramp(['#0f140c', '#17200f', '#202a14', '#2a3519', '#3a4521', '#4f592b']),
  // Schlamm/Lehm der Dämme
  mud: ramp(['#0c0a08', '#110f0b', '#17140f', '#1f1b14', '#28221a', '#312a20', '#3c3327', '#4a3f30']),
  root: ramp(['#120d0a', '#1f1610', '#2e2118', '#3e2e21']),
  stone: ramp(['#0c0e0c', '#1b1f1b', '#252a25', '#30362f', '#3d443b', '#4d5549', '#636b5c']),
  // Sumpfwasser (0 Schatten … 4 Glanz), wie GROUND_MARSH.water
  water: ramp(['#060b0c', '#0a1012', '#0f1a1b', '#142426', '#1d3433', '#2f4b46', '#46685a']),
  // Uferböschung (Schlamm, oben im Licht)
  bank: ramp(['#0d0b09', '#16120e', '#211b15', '#2a221a']),
  // Pfützen (trüb, dunkler als offenes Wasser)
  pool: ramp(['#0f1513', '#151d1b', '#26332f']),
  // Entengrütze
  weed: ramp(['#13211a', '#1a2e1f', '#223b24', '#2d4a2a']),
};

const WP = { water: P.water, bank: P.bank, weed: P.weed, bubbles: true };

function* marshSetup(x0, y0, cw, ch, K, KW, M) {
  const S = chunkCtx(x0, y0, cw, ch, K, KW, M);
  S.tone = S.noise([[4, 11, 11, 901, 0.65], [2, 4, 4, 902, 0.35]]);
  S.patch = S.noise([[4, 17, 14, 903, 1]]);
  S.wet = S.noise([[4, 11, 11, 905, 1]]);
  yield;
  waterPrep(S, x0, y0, cw, ch, K, KW, WP);
  yield;
  const { kAt, put, mark } = S;
  const wAt = (F, G) => S.wi(F, G);
  const mid = (F, G) => awayFrom(S, F, G, GR) && awayFrom(S, F, G, WA);
  // Damm: Trittspuren und Krumen
  S.cells(8, 6, 2, (cx, cy) => {
    if (hash2(cx, cy, 962) >= 0.24) return;
    const F = cx * 8 + 1 + Math.floor(hash2(cx, cy, 963) * 4), G = cy * 6 + 1 + Math.floor(hash2(cx, cy, 964) * 3);
    if (kAt(F, G) !== DI || !mid(F, G)) return;
    mark(F, G, -2); mark(F + 1, G, -2); mark(F, G + 1, 1); mark(F + 1, G + 1, 1);
  });
  S.cells(6, 5, 2, (cx, cy) => {
    const h = hash2(cx, cy, 970);
    if (h >= 0.3) return;
    const F = cx * 6 + Math.floor(hash2(cx, cy, 971) * 3), G = cy * 5 + 1 + Math.floor(hash2(cx, cy, 972) * 2);
    if (kAt(F, G) !== DI) return;
    const w = 2 + (hash2(cx, cy, 973) < 0.4 ? 1 : 0);
    for (let i = 0; i < w; i++) { mark(F + i, G, 1); mark(F + i, G + 1, -1); }
  });
  yield;
  // Wurzeln/Zweige (Damm und Moor): Strich mit hellem Anfang, Schatten darunter
  S.cells(16, 12, 8, (cx, cy) => {
    const h = hash2(cx, cy, 940);
    if (h >= 0.16) return;
    const ax = cx * 16 + 2 + Math.floor(hash2(cx, cy, 941) * 6), ay = cy * 12 + 3 + Math.floor(hash2(cx, cy, 942) * 6);
    const k = kAt(ax, ay);
    if (k !== DI && k !== GR) return;
    const len = 4 + Math.floor(hash2(cx, cy, 943) * 5), s = [-0.5, -0.25, 0.25, 0.5][Math.floor(hash2(cx, cy, 944) * 4)];
    for (let i = 0; i < len; i++) {
      const F = ax + i, G = ay + Math.round(i * s);
      if (kAt(F, G) === WA) break;
      put(F, G, P.root[i === 0 ? 3 : i < 3 ? 2 : 1]);
      if (i < len - 1) mark(F, G + 1, -2);
    }
  });
  // Moospolster: Hügel mit Licht oben links, Schlagschatten
  S.cells(9, 7, 6, (cx, cy) => {
    const h = hash2(cx, cy, 920);
    if (h >= 0.5) return;
    const rx = 1.8 + hash2(cx, cy, 921) * 2.2, ry = rx * (0.6 + hash2(cx, cy, 922) * 0.2);
    const px = cx * 9 + rx + 1 + hash2(cx, cy, 923) * (7 - 2 * rx), py = cy * 7 + ry + 1 + hash2(cx, cy, 924) * (5 - 2 * ry);
    const AF = Math.floor(px), AG = Math.floor(py);
    if (kAt(AF, AG) !== GR || kAt(AF - 3, AG) !== GR || kAt(AF + 3, AG) !== GR || kAt(AF, AG + 3) !== GR) return;
    const p = S.patch[wAt(AF, AG)];
    if (h >= (p > 0.62 ? 0.3 : p > 0.55 ? 0.06 : 0.01)) return;
    pebble(S, px, py, rx, ry, P.moss, hash2(cx, cy, 925) < 0.35 ? -1 : 0);
  });
  yield;
  // Steine (selten, Damm)
  S.cells(12, 9, 6, (cx, cy) => {
    const h = hash2(cx, cy, 930);
    if (h >= 0.05) return;
    const rx = 1.1 + hash2(cx, cy, 931) * 1.6, ry = rx * 0.7;
    const px = cx * 12 + 3 + hash2(cx, cy, 933) * 6, py = cy * 9 + 3 + hash2(cx, cy, 934) * 3;
    if (kAt(Math.floor(px), Math.floor(py)) !== DI) return;
    pebble(S, px, py, rx, ry, P.stone, 0);
  });
  // Seggenbüschel: gefächert, Spitzen fahl; dichter am Ufer und auf Polsterflächen
  S.cells(8, 7, 7, (cx, cy) => {
    const h = hash2(cx, cy, 950);
    if (h >= 0.5) return;
    const F = cx * 8 + 2 + Math.floor(hash2(cx, cy, 951) * 4), G = cy * 7 + 4 + Math.floor(hash2(cx, cy, 952) * 3);
    if (kAt(F, G) !== GR || kAt(F - 2, G) !== GR || kAt(F + 2, G) !== GR) return;
    const shore = kAt(F, G + 4) === WA || kAt(F, G - 3) === WA || kAt(F - 4, G) === WA || kAt(F + 4, G) === WA;
    const p = S.patch[wAt(F, G)];
    if (h >= (shore ? 0.32 : p > 0.55 ? 0.08 : 0.025)) return;
    const n = 3 + Math.floor(hash2(cx, cy, 953) * 3), hh = 4 + Math.floor(hash2(cx, cy, 954) * 3);
    for (let i = 0; i < n; i++) {
      const dx = i - (n >> 1), lean = dx < 0 ? -1 : dx > 0 ? 1 : 0;
      blade(S, F + dx, G, Math.max(2, hh - Math.abs(dx) - (hash2(cx + i, cy, 955) < 0.4 ? 1 : 0)), lean, P.sedge);
    }
    for (let i = -(n >> 1) - 1; i <= (n >> 1) + 1; i++) S.markMin(F + i + 1, G + 1, -1);
  });
  yield;
  // Einzelhalme im Moor
  const F0 = S.F0, G0 = S.G0, W2 = S.W2, H2 = S.H2;
  for (let cx = Math.floor((F0 - 3) / 3); cx <= Math.floor((F0 + W2 + 3) / 3); cx++) {
    const oy = Math.floor(hash2(cx, 3, 910) * 7);
    for (let cy = Math.floor((G0 - 7 + oy) / 7); cy <= Math.floor((G0 + H2 + 7 + oy) / 7); cy++) {
      const h = hash2(cx, cy, 911);
      if (h >= 0.3) continue;
      const bx = Math.floor(hash2(cx, cy, 912) * 3), F = cx * 3 + bx, G = cy * 7 - oy + 6;
      if (kAt(F, G) !== GR) continue;
      const edge = kAt(F, G + 2) === DI || kAt(F, G + 3) === DI;
      if (h >= (edge ? 0.3 : S.patch[wAt(F, G)] > 0.55 ? 0.06 : 0.02)) continue;
      const hh = 2 + Math.floor(hash2(cx, cy, 913) * 3), l = hash2(cx, cy, 914);
      let lean = l < 0.2 ? -1 : l < 0.4 ? 1 : 0;
      if (bx + lean < 0 || bx + lean > 2) lean = 0;
      blade(S, F, G, hh, lean, P.sedge);
    }
  }
  yield;
  waterStamps(S, WP);
  return S;
}

// Pfütze (wet über thr): Oberkante 1 Feinpixel dunkel, Spiegel, kurze Glanzstriche; -1 = keine Pfütze
function puddle(F, G, S, wi, w, dt, thr) {
  if (!(w > thr + 0.02 || (w > thr && dt < (w - thr) / 0.02))) return -1;
  if (!(G & 1) && S.wet[wi - S.fw] <= thr) return P.mud[1];
  return !(G & 1) && hash2(F >> 2, G, 977) < 0.08 ? P.pool[2] : P.pool[(G & 1) && S.wet[wi - S.fw] <= thr ? 0 : 1];
}

function marshFine(kind, F, G, K, ki, KW, S) {
  if (kind > WA) return -1;
  const o = (G - S.G0) * S.W2 + (F - S.F0);
  const dt = D4[(G & 3) * 4 + (F & 3)] / 16;
  if (kind === WA) return waterFine(F, G, K, ki, KW, S, o, dt, WP);
  if (kind === FK.PAVE) kind = DI;
  const a = S.abs[o], up = K[ki - KW];
  const wi = (((G - S.G0) >> 1) + S.m) * S.fw + ((F - S.F0) >> 1) + S.m;
  const t = S.tone[wi], w = S.wet[wi];
  // Oberkante am Wasser: nasser Saum hell (Licht oben links)
  if (up === WA) return kind === DI ? P.mud[5] : P.floor[5];
  if (K[ki - 2 * KW] === WA) return kind === DI ? P.mud[2] : P.peat[1];
  if (kind === DI) {
    const D = P.mud;
    if (up === GR) return D[1];   // Grasnarbe wirft eine Kante
    if (a >= 0) return a;
    // Wasser in Spuren und Mulden: dunkler Spiegel, Unterkante hell, Glanzstrich
    const pud = puddle(F, G, S, wi, w, dt, 0.83);
    if (pud >= 0) return pud;
    if (!(G & 1) && S.wet[wi - S.fw] > 0.83) return D[6];   // Unterkante im Licht
    const near = K[ki + KW] === GR || K[ki + 2 * KW] === GR || K[ki - 2 * KW] === GR || K[ki - 1] === GR || K[ki + 1] === GR || K[ki - 2] === GR || K[ki + 2] === GR;
    let i = 3 + clampI(band(t, 2.8, dt), 0, 2) + (near ? -1 : 0);
    if (K[ki + KW] === GR || K[ki + 2 * KW] === GR) {
      const e = K[ki + KW] === GR ? 1 : 2, hb = hash2(F, G + e, 960);
      const hh = hb < 0.45 ? 1 + Math.floor(hb * 6) : 0;
      if (e <= hh) return P.sedge[e === hh ? 5 : 3];
    }
    return D[clampI(i + S.rel[o], 0, 7)];
  }
  if (a >= 0) return a;
  if (up === DI) return P.floor[6];
  // Moor: nasser Torf / Grundton / Polsterflächen
  const p = S.patch[wi];
  if (w > 0.74 || (w > 0.7 && dt < (w - 0.7) / 0.04)) {
    // Torf mit kleinen Pfützen
    const pud = puddle(F, G, S, wi, w, dt, 0.85);
    if (pud >= 0) return pud;
    if (!(G & 1) && S.wet[wi - S.fw] > 0.85) return P.peat[3];
    return P.peat[1 + clampI(band(t, 2, dt), 0, 2)];
  }
  const lush = p > 0.6 || (p > 0.55 && dt < (p - 0.55) / 0.05);
  const base = lush ? P.moss[1 + clampI(band(t, 3, dt), 0, 2)] : P.floor[1 + clampI(band(t, 4, dt), 0, 4)];
  return S.rel[o] < 0 ? darken(base, 0.6) : base;
}

export const FINE_MARSH = { finePixel: marshFine, fineSetup: marshSetup, fineTufts: false };
