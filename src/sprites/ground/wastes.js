import { hash2 } from '../../core/math.js';
import { PAL } from '../../gfx/Palette.js';
import { FK, ramp, hxi, D4, clampI, band, darken, vnoise, field, chunkCtx, pebble, stroke } from './kit.js';

// Feinraster-Boden: Glutöde (level.biome 'wastes'). Weltpixel-Shader: sprites/decor_wastes.js (wastesPixel, nur gelesen).
// ',' Aschesand (Dünenrippel, Krustenplatten mit Rissen, Holzkohle, Basaltkiesel, Obsidiansplitter, Glutkrümel),
// '.' Ocker/Brandboden (Wege: Fahrspuren, Krumen, Risse), ':' Ziegelpflaster (Kante und Randsteine setzt
// world/Outdoor.js). Lava und Glutspalten: Weltpixel-Shader (-1),
// Basaltklippen kommen als Felsmaler-Ebene darüber (level.organicCliffs).

const P = (a) => ramp(a);
const ASH = P(['#221c17', '#2e261f', '#3a3027', '#473b30', '#544639', '#625243', '#725f4d', '#86715c']);   // Aschesand
const OCH = P(['#1f140c', '#2a1a10', '#372214', '#472c18', '#58371c', '#6a4321', '#7e5028', '#925d30']);   // Ocker/Brandboden
const CHAR = P(['#0a0708', '#130e0f', '#1c1516', '#281e1f', '#352929', '#44363a', '#5a4a4c']);             // Holzkohle
const BAS = P(['#0b0809', '#141011', '#1d1718', '#271f1f', '#332827', '#43342f', '#56443a', '#6c5646']);   // Basaltkiesel
const OBS = P(['#050306', '#0f0912', '#1c1020', '#2e1834', '#48264e', '#8a4a7c', '#f4c4e0']);             // Obsidian
const EMB = PAL.ember.map(hxi);
const PAVE = PAL.stone.map(hxi), MORT = hxi(PAL.mortar);

// ------------------------------------------------------------ Vorarbeit je Chunk
function* wastesSetup(x0, y0, cw, ch, K, KW, M, map) {
  const S = chunkCtx(x0, y0, cw, ch, K, KW, M);
  // Rauschfelder (Weltpixel mit Rand): Grundton (zwei Lagen auf einem Gitter), Flecken (Rippel/Kruste, auch Fahrspuren)
  S.tone = field(S.fx0, S.fy0, S.fw, S.fh, 4, (x, y) => vnoise(x / 12, y / 10, 901) * 0.65 + vnoise(x / 4, y / 4, 902) * 0.35, new Float32Array(S.n), false, 1);
  S.patch = S.noise([[4, 23, 17, 903, 1]]);
  S.rut = S.patch;
  yield;
  stamps(S);
  return S;
}

const isSand = (S, F, G) => S.kAt(F, G) === FK.GRASS;
// Wegmitte: kein anderer Boden in diesen Abständen (Feinpixel, Paare dx, dy); Steigungen der Risse
const PROBE = [0, -2, 0, 2, -3, 0, 3, 0, 0, -4, 0, 4, -6, 0, 6, 0], SLOPES = [-0.5, 0, 0.34, 0.5];
function stamps(S) {
  const GR = FK.GRASS, DI = FK.DIRT;
  const pathMid = (F, G) => {
    for (let i = 0; i < 16; i += 2) if (S.kAt(F + PROBE[i], G + PROBE[i + 1]) !== DI) return false;
    return true;
  };
  // Krumen und Trittspuren (Brandboden)
  S.cells(6, 5, 2, (cx, cy) => {
    const h = hash2(cx, cy, 970);
    if (h >= 0.32) return;
    const F = cx * 6 + Math.floor(hash2(cx, cy, 971) * 3), G = cy * 5 + 1 + Math.floor(hash2(cx, cy, 972) * 2);
    if (S.kAt(F, G) !== DI) return;
    const w = 2 + (hash2(cx, cy, 973) < 0.4 ? 1 : 0);
    for (let i = 0; i < w; i++) { S.mark(F + i, G, 1); S.mark(F + i, G + 1, -1); }
  });
  S.cells(8, 6, 2, (cx, cy) => {
    if (hash2(cx, cy, 962) >= 0.2) return;
    const F = cx * 8 + 1 + Math.floor(hash2(cx, cy, 963) * 4), G = cy * 6 + 1 + Math.floor(hash2(cx, cy, 964) * 3);
    if (S.kAt(F, G) !== DI || !pathMid(F, G)) return;
    S.mark(F, G, -2); S.mark(F + 1, G, -2); S.mark(F, G + 1, 1); S.mark(F + 1, G + 1, 1);
  });
  // Risse im Brandboden (dunkel, Lichtkante darunter)
  S.cells(16, 12, 8, (cx, cy) => {
    const h = hash2(cx, cy, 940);
    if (h >= 0.26) return;
    const ax = cx * 16 + 2 + Math.floor(hash2(cx, cy, 941) * 6), ay = cy * 12 + 3 + Math.floor(hash2(cx, cy, 942) * 6);
    if (S.kAt(ax, ay) !== DI) return;
    const len = 4 + Math.floor(hash2(cx, cy, 943) * 5), sl = SLOPES[Math.floor(hash2(cx, cy, 944) * 4)];
    stroke(S, ax, ay, len, sl, null, -2, 1);
  });
  // Basaltkiesel (Weg und Asche), Holzkohlebrocken (Asche)
  S.cells(10, 8, 6, (cx, cy) => {
    const h = hash2(cx, cy, 920);
    if (h >= 0.3) return;
    const rx = 1.0 + hash2(cx, cy, 921) * 1.9, ry = rx * (0.62 + hash2(cx, cy, 922) * 0.2);
    const px = cx * 10 + rx + 1 + hash2(cx, cy, 923) * (8 - 2 * rx), py = cy * 8 + ry + 1 + hash2(cx, cy, 924) * (6 - 2 * ry);
    const AF = Math.floor(px), AG = Math.floor(py), k = S.kAt(AF, AG);
    if (k > DI) return;
    const dens = k === DI ? (pathMid(AF, AG) ? 0.07 : 0.15) : 0.045;
    if (h >= dens) return;
    pebble(S, px, py, rx, ry, h < dens * 0.4 && k === GR ? CHAR : BAS, hash2(cx, cy, 925) < 0.3 ? -1 : 0);
  });
  // Obsidiansplitter (Asche): Keil 3–4 Feinpixel, Glanzpunkt oben links, Schatten unten rechts
  S.cells(14, 11, 4, (cx, cy) => {
    const h = hash2(cx, cy, 930);
    if (h >= 0.035) return;
    const F = cx * 14 + 2 + Math.floor(hash2(cx, cy, 931) * 9), G = cy * 11 + 2 + Math.floor(hash2(cx, cy, 932) * 7);
    if (!isSand(S, F, G) || !isSand(S, F + 2, G + 1)) return;
    const flip = hash2(cx, cy, 933) < 0.5;
    S.put(F, G, OBS[5]); S.put(F + 1, G, OBS[4]); S.put(F + (flip ? 2 : -1), G + 1, OBS[2]);
    S.put(F, G + 1, OBS[3]); S.put(F + 1, G + 1, OBS[2]); S.put(F + 1, G + 2, OBS[1]);
    S.mark(F + 2, G + 2, -2); S.mark(F + 2, G + 1, -1); S.mark(F, G + 2, -1);
  });
  // Glutkrümel (Asche, selten): dunkelrot mit heißem Kern
  S.cells(9, 8, 2, (cx, cy) => {
    const h = hash2(cx, cy, 950);
    if (h >= 0.02) return;
    const F = cx * 9 + 1 + Math.floor(hash2(cx, cy, 951) * 6), G = cy * 8 + 1 + Math.floor(hash2(cx, cy, 952) * 6);
    if (!isSand(S, F, G) || S.patch[S.wi(F, G)] > 0.5) return;
    // kleines Glutnest: heißer Kern, roter Saum, dunkle Asche ringsum
    S.put(F, G, EMB[h < 0.008 ? 4 : 3]); S.put(F + 1, G, EMB[2]); S.put(F - 1, G, EMB[1]); S.put(F, G - 1, EMB[1]); S.put(F, G + 1, EMB[0]);
    S.put(F + 1, G + 1, CHAR[2]); S.put(F - 1, G + 1, CHAR[2]);
  });
  // Holzkohlestücke (länglich, 3–5 Feinpixel, Oberkante grau im Licht)
  S.cells(12, 9, 4, (cx, cy) => {
    const h = hash2(cx, cy, 980);
    if (h >= 0.05) return;
    const F = cx * 12 + 1 + Math.floor(hash2(cx, cy, 981) * 8), G = cy * 9 + 2 + Math.floor(hash2(cx, cy, 982) * 6);
    if (!isSand(S, F, G)) return;
    const len = 3 + Math.floor(hash2(cx, cy, 983) * 3);
    for (let i = 0; i < len; i++) { S.put(F + i, G, CHAR[i === 0 ? 5 : 3]); S.put(F + i, G + 1, CHAR[1]); S.mark(F + i + 1, G + 2, -1); }
  });
}

// ------------------------------------------------------------ Feinpixel
function wastesFine(kind, F, G, K, ki, KW, S) {
  if (kind > FK.PAVE) return -1;                         // Lava, Glutspalten: Weltpixel-Shader
  const f = F - S.F0, g = G - S.G0, o = g * S.W2 + f;
  const dt = D4[(G & 3) * 4 + (F & 3)] / 16, wi = ((g >> 1) + S.m) * S.fw + (f >> 1) + S.m;
  // Pflaster: Kante und Randsteine kommen aus dem Terrain (world/Outdoor.js #fineKinds/#fineRows)
  if (kind === FK.PAVE) return paveCol(F, G);
  return groundCol(kind, K, ki, KW, S, F, G, o, dt, wi);
}
// Platz der Glutöde: Ziegel unterschiedlich lang (Reihen 10 Feinpixel hoch, je 24 Feinpixel ein oder zwei Ziegel von 8–16,
// selten einer über die ganze Länge, Stoßfugen je Reihe versetzt), Licht oben links: Kante oben/links eine Stufe heller,
// Eckpixel oben links am hellsten, Kante unten/rechts dunkler. -1 = Fuge (1 Feinpixel).
function brickIdx(F, G) {
  const row = Math.floor(G / 10), ly = G - row * 10;
  if (ly === 0) return -1;
  const u = F + Math.floor(hash2(row, 0, 451) * 24), cell = Math.floor(u / 24), lu = u - cell * 24;
  const split = hash2(cell, row, 452) < 0.85 ? 8 + Math.floor(hash2(cell, row, 453) * 9) : 24;
  const first = lu < split, b = cell * 2 + (first ? 0 : 1), lx = first ? lu : lu - split, len = first ? split : 24 - split;
  if (lx === 0) return -1;
  const s = hash2(b, row, 16), e = hash2(b, row, 454);
  if (e > 0.88 && lx === len - 1 && ly === 9) return -1;              // abgeschlagene Ecke unten rechts
  if (lx === 1 && ly === 1) return 5;                                 // Lichtkantenpixel
  let i = s < 0.3 ? 2 : s < 0.8 ? 3 : 4;
  if (ly === 1 || lx === 1) i = Math.min(4, i + 1);
  else if (ly === 9 || lx === len - 1) i -= 1;
  return i;
}
function paveCol(F, G) {
  const i = brickIdx(F, G);
  return i < 0 ? MORT : PAVE[clampI(i, 1, 5)];
}

function groundCol(kind, K, ki, KW, S, F, G, o, dt, wi) {
  const a = S.abs[o], rel = S.rel[o], t = S.tone[wi], GR = FK.GRASS;
  if (kind === FK.DIRT) {
    // Brandboden/Weg: Rand zur Asche dunkel, Fahrspuren als dunkle Bänder, Krumen/Risse als Relief
    if (K[ki - KW] === GR) return OCH[1];
    if (a >= 0) return a;
    const near = K[ki - 2 * KW] === GR || K[ki + KW] === GR || K[ki + 2 * KW] === GR || K[ki - 1] === GR || K[ki + 1] === GR || K[ki - 2] === GR || K[ki + 2] === GR;
    let i = 4 + clampI(band(t, 1.8, dt), 0, 1) + (near ? -1 : 0);   // ruhig: zwei Tonstufen
    const r = S.rut[wi];
    if (r > 0.74 || (r > 0.7 && dt < (r - 0.7) / 0.04)) i -= 1;
    return OCH[clampI(i + rel, 0, 7)];
  }
  // Aschesand: Grundton in Stufen; Dünenrippel (Kamm hell, Lee dunkel) und Krustenplatten mit Rissen je nach Fleck
  if (K[ki - KW] === FK.DIRT || K[ki - KW] === FK.PAVE) return ASH[5];
  if (a >= 0) return a;
  const p = S.patch[wi];
  let i = 3 + clampI(band(t, 1.8, dt), 0, 1);   // ruhig: zwei Tonstufen (vier ergaben Tarnflecken)
  if (p < 0.42) {
    const ph = F * 0.15 + G * 0.21 + p * 9, q = ph / 6.2832 - Math.floor(ph / 6.2832);
    if (q < 0.05) i += 1; else if (q < 0.08) i += dt < 0.5 ? 1 : 0; else if (q < 0.17) i -= 1;
  } else if (p > 0.6) {
    const px = F / 2, py = G / 2;
    if (crust(px, py)) return ASH[1];
    if (crust(px, py - 0.5)) i += 1;
  }
  const c = ASH[clampI(i, 0, 7)];
  return rel < 0 ? darken(c, 0.62) : c;
}

// Krustenrisse im Aschesand (Netz aus zwei Rauschlinien)
function crust(x, y) {
  return Math.abs(vnoise(x / 8, y / 7, 905) - 0.5) < 0.022 || Math.abs(vnoise(x / 13, y / 10, 906) - 0.5) < 0.016;
}

export const FINE_WASTES = { finePixel: wastesFine, fineSetup: wastesSetup, fineTufts: false };
