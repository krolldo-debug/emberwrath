import { hash2 } from '../../core/math.js';
import { PAL } from '../../gfx/Palette.js';
import { FK, ramp, hxi, D4, clampI, band, darken, chunkCtx, awayFrom, pebble, blade, stroke, fissureDist, waterPrep, waterStamps, waterFine } from './kit.js';

// Feinraster-Boden der Glutsenke (Startdorf im nächtlichen Tal, Palette OUT in sprites/outdoor.js).
// Gras mit Halmen (Mondlicht an den Spitzen) und dunkleren Polstern, Erdwege mit Krumen, Kieseln, Rissen und
// Wagenspuren, der Marktplatz als Kopfsteinpflaster (Steine 12 × 10 Feinpixel, gerundete Ecken, Lichtkante oben
// links, Moos und Halme in den Fugen am Grasrand, einzelne Risse und Abplatzungen). Um die Glutspalten ist der
// Boden versengt. Bach und Weiher fein (ground/kit.js waterFine), die alten Glanzpunkte und die Spalten selbst
// bleiben beim Weltpixel-Shader (-1, mit Leuchtebene).

const GR = FK.GRASS, DI = FK.DIRT, PV = FK.PAVE, FI = FK.FISS;

const P = {
  // Gras (Grundton, 0 = Schatten)
  floor: ramp(['#0b120e', '#0f1713', '#141e18', '#19261e', '#1f2f24', '#273929', '#334833']),
  // dichte Polster: dunkler, satter
  lush: ramp(['#0a120e', '#0e1812', '#121f17', '#17271c', '#1d3022']),
  // zertretenes Gras am Wegrand: gelblicher, heller
  worn: ramp(['#141710', '#1a1f15', '#21261b', '#292e20', '#323626']),
  // Halme (Fuß dunkel → Spitze im Mondlicht)
  blade: ramp(['#0c140f', '#142118', '#1c2d20', '#253a28', '#324d32', '#466741']),
  dirt: ramp(['#120d0c', '#1a1311', '#241a16', '#30231c', '#3d2c22', '#4c392b', '#5e4935', '#725a43']),
  // Kiesel (warmes Grau, passt zu Erde und Gras)
  stone: ramp(['#0f0c0b', '#231e1b', '#2f2824', '#3d352f', '#4d443c', '#61574d', '#7b7064']),
  pave: ramp([...PAL.stone, '#6f667c']),
  mortar: hxi(PAL.mortar),
  dust: ramp(['#1a1418', '#231b1e']),
  moss: ramp(['#0f1712', '#162119', '#1e2d20', '#2a3d2a']),
  // versengt (Glutfelder)
  ash: ramp(['#0c0a0b', '#141112', '#1c1818', '#252020', '#2f2928', '#3b3331']),
  heat: ramp(['#1c0d0a', '#26130e']),
  // Wasser (wie OUT.water: Grundton 3/4 = alter Ton 1/2, 5 = alter Glanz) und Uferböschung
  water: ramp(['#040509', '#070812', '#090b18', '#0a0d1e', '#0f1530', '#172048', '#23306a']),
  bank: ramp(['#0e0b0a', '#17110f', '#221a16', '#2c221c']),
};
const WP = { water: P.water, bank: P.bank, weed: null, bubbles: false };

// Vorarbeit je Chunk (Generator): Rauschfelder, Abstand zu den Glutspalten, Kleinteile als Stempel.
function* outdoorSetup(x0, y0, cw, ch, K, KW, M) {
  const S = chunkCtx(x0, y0, cw, ch, K, KW, M);
  S.tone = S.noise([[4, 11, 11, 801, 0.65], [2, 4, 4, 802, 0.35]]);
  S.patch = S.noise([[4, 19, 15, 803, 0.8], [2, 6, 6, 804, 0.2]]);
  S.rut = S.noise([[4, 20, 20, 15, 1]]);
  waterPrep(S, x0, y0, cw, ch, K, KW, WP);
  yield;
  // Abstand (Feinpixel × 3) zu Glutspalten im Terrainraster (null = keine in Reichweite)
  S.fd = fissureDist(K, KW, FI);
  const { kAt, put, mark } = S;
  const wAt = (F, G) => S.wi(F, G);
  const scorched = (F, G) => S.fd && S.fd[S.wi(F, G)] < 36;
  const mid = (F, G) => awayFrom(S, F, G, GR);
  // Erdkrumen (Weg): Oberseite hell, darunter dunkel
  S.cells(6, 5, 2, (cx, cy) => {
    const h = hash2(cx, cy, 870);
    if (h >= 0.4) return;
    const F = cx * 6 + Math.floor(hash2(cx, cy, 871) * 3), G = cy * 5 + 1 + Math.floor(hash2(cx, cy, 872) * 2);
    if (kAt(F, G) !== DI || h >= (mid(F, G) ? 0.2 : 0.36)) return;
    const w = 2 + (hash2(cx, cy, 873) < 0.4 ? 1 : 0);
    for (let i = 0; i < w; i++) { mark(F + i, G, 1); mark(F + i, G + 1, -1); }
  });
  // Trittspuren (Wegmitte): Mulde dunkel, Unterkante hell
  S.cells(8, 6, 2, (cx, cy) => {
    if (hash2(cx, cy, 862) >= 0.22) return;
    const F = cx * 8 + 1 + Math.floor(hash2(cx, cy, 863) * 4), G = cy * 6 + 1 + Math.floor(hash2(cx, cy, 864) * 3);
    if (kAt(F, G) !== DI || !mid(F, G)) return;
    mark(F, G, -2); mark(F + 1, G, -2); mark(F, G + 1, 1); mark(F + 1, G + 1, 1);
  });
  yield;
  // Risse im Weg (Lichtkante darunter)
  S.cells(16, 12, 8, (cx, cy) => {
    if (hash2(cx, cy, 840) >= 0.2) return;
    const ax = cx * 16 + 2 + Math.floor(hash2(cx, cy, 841) * 6), ay = cy * 12 + 3 + Math.floor(hash2(cx, cy, 842) * 6);
    if (kAt(ax, ay) !== DI || !mid(ax, ay)) return;
    const len = 4 + Math.floor(hash2(cx, cy, 843) * 4), s = [-0.5, 0, 0.34, 0.5][Math.floor(hash2(cx, cy, 844) * 4)];
    stroke(S, ax, ay, len, s, null, -2, 1);
  });
  yield;
  // Kiesel: auf dem Weg (am Rand mehr), im Gras selten
  S.cells(10, 8, 6, (cx, cy) => {
    const h = hash2(cx, cy, 820);
    if (h >= 0.3) return;
    const rx = 1.1 + hash2(cx, cy, 821) * 2, ry = rx * (0.62 + hash2(cx, cy, 822) * 0.2);
    const px = cx * 10 + rx + 1 + hash2(cx, cy, 823) * (8 - 2 * rx), py = cy * 8 + ry + 1 + hash2(cx, cy, 824) * (6 - 2 * ry);
    const AF = Math.floor(px), AG = Math.floor(py), k = kAt(AF, AG);
    const dens = k === DI ? (mid(AF, AG) ? 0.035 : 0.09) : k === GR ? 0.012 : 0;
    if (h >= dens) return;
    pebble(S, px, py, rx, ry, P.stone, hash2(cx, cy, 825) < 0.3 ? -1 : 0);
  });
  yield;
  // Grasbüschel: 3–5 Halme gefächert, Fuß im Schatten (Gras, nicht versengt; dichter in Polstern)
  S.cells(9, 8, 6, (cx, cy) => {
    const h = hash2(cx, cy, 830);
    if (h >= 0.4) return;
    const F = cx * 9 + 2 + Math.floor(hash2(cx, cy, 831) * 5), G = cy * 8 + 4 + Math.floor(hash2(cx, cy, 832) * 4);
    if (kAt(F, G) !== GR || kAt(F - 2, G) !== GR || kAt(F + 2, G) !== GR || scorched(F, G)) return;
    const p = S.patch[wAt(F, G)];
    if (h >= (p > 0.6 ? 0.4 : p < 0.3 ? 0.04 : 0.14)) return;
    const n = 3 + Math.floor(hash2(cx, cy, 833) * 3), hh = 3 + Math.floor(hash2(cx, cy, 834) * 3);
    for (let i = 0; i < n; i++) {
      const dx = i - (n >> 1), lean = dx < 0 ? -1 : dx > 0 ? 1 : 0;
      blade(S, F + dx, G, Math.max(2, hh - Math.abs(dx) - (hash2(cx + i, cy, 835) < 0.4 ? 1 : 0)), lean, P.blade);
    }
    for (let i = -(n >> 1) - 1; i <= (n >> 1) + 1; i++) S.markMin(F + i + 1, G + 1, -1);
  });
  yield;
  // Halme: Zellen 3 × 7 (Spalten versetzt), dicht in Polstern und als Saum über dem Weg, nicht im Versengten
  const F0 = S.F0, G0 = S.G0, W2 = S.W2, H2 = S.H2;
  for (let cx = Math.floor((F0 - 3) / 3); cx <= Math.floor((F0 + W2 + 3) / 3); cx++) {
    const oy = Math.floor(hash2(cx, 3, 810) * 7);
    for (let cy = Math.floor((G0 - 7 + oy) / 7); cy <= Math.floor((G0 + H2 + 7 + oy) / 7); cy++) {
      const h = hash2(cx, cy, 811);
      if (h >= 0.62) continue;
      const bx = Math.floor(hash2(cx, cy, 812) * 3), F = cx * 3 + bx, G = cy * 7 - oy + 6;
      const k = kAt(F, G);
      if (k !== GR) {
        continue;
      } else {
        if (scorched(F, G)) continue;
        const p = S.patch[wAt(F, G)];
        const edge = kAt(F, G + 2) !== GR || kAt(F, G + 3) !== GR;
        if (h >= (p > 0.62 ? 0.45 : edge ? 0.5 : p > 0.5 ? 0.08 : p < 0.3 ? 0.01 : 0.025)) continue;
      }
      const hh = 2 + Math.floor(hash2(cx, cy, 813) * 4), l = hash2(cx, cy, 814);
      let lean = l < 0.17 ? -1 : l < 0.35 ? 1 : 0;
      if (bx + lean < 0 || bx + lean > 2) lean = 0;
      blade(S, F, G, hh, lean, P.blade);
    }
  }
  waterStamps(S, WP);
  return S;
}

// Kopfsteinpflaster: Steine 12 × 10 Feinpixel (wie das alte 6 × 5), 1 Feinpixel Fuge, Ecken gerundet,
// Lichtkante oben links, Kante unten rechts dunkel; je Stein ein Grundton (wie bisher), selten Riss/Abplatzung.
// Hashes je Stein (benachbarte Feinpixel liegen fast immer im selben Stein)
let pvCol = NaN, pvRow = NaN, pvS = 0, pvU = 0, pvC = 0;
function paveFine(F, G, K, ki, KW) {
  const row = Math.floor(G / 10), sh = (row & 1) * 6, col = Math.floor((F + sh) / 12);
  if (col !== pvCol || row !== pvRow) { pvCol = col; pvRow = row; pvS = hash2(col, row, 16); pvU = hash2(col, row, 892); pvC = hash2(col, row, 893); }
  const lx = F + sh - col * 12, ly = G - row * 10;
  const Pv = P.pave;
  if (lx === 0 || ly === 0) {
    // Fuge: am Grasrand Moos (und hier und da ein Halm), am Weg Staub
    const nG = K[ki - 4] === GR || K[ki + 4] === GR || K[ki - 4 * KW] === GR || K[ki + 4 * KW] === GR;
    if (nG) {
      const s = hash2(lx === 0 ? col : F >> 2, lx === 0 ? G >> 2 : row, 890);
      if (s < 0.55) return P.moss[ly === 0 && (F & 3) === 1 && s < 0.12 ? 3 : 1 + (s < 0.25 ? 1 : 0)];
    }
    const nD = K[ki - 4] === DI || K[ki + 4] === DI || K[ki - 4 * KW] === DI || K[ki + 4 * KW] === DI;
    return nD ? P.dust[hash2(col, row, 891) < 0.5 ? 1 : 0] : P.mortar;
  }
  const s = pvS, u = pvU;
  // gerundete Ecken
  if ((lx === 1 || lx === 11) && (ly === 1 || ly === 9)) return lx === 1 && ly === 1 ? Pv[1] : P.mortar;
  let i = s < 0.3 ? 2 : s < 0.8 ? 3 : 4;
  // Abplatzung oben rechts (Kerbe dunkel, Bruchkante unten hell)
  if (u < 0.1 && lx >= 8 && ly <= 3 && lx - 8 >= ly - 1) return lx - 8 === ly - 1 ? Pv[clampI(i + 1, 1, 6)] : Pv[1];
  if (ly === 1 || lx === 1) i += 1;
  else if (ly === 9 || lx === 11) i -= 1;
  // Glanzpunkt auf hellen Steinen
  else if (s >= 0.8 && lx === 2 && ly === 2) i += 1;
  // gewölbte Steine: Ecke unten rechts eine Stufe dunkler
  else if (lx + ly * 1.3 > 15.5) i -= 1;
  // Riss: schräg durch den Stein, Lichtkante darunter
  if (u > 0.88 && ly >= 2 && ly <= 8) {
    const cxr = 3 + Math.floor(pvC * 5) + ((ly * (u > 0.94 ? 1 : -1)) >> 1);
    if (lx === cxr) return Pv[1];
    if (lx === cxr + 1) i += 1;
  }
  // Rand des Platzes: Lichtkante oben/links, unten/rechts Schatten
  const up = K[ki - KW], lf = K[ki - 1], dn = K[ki + KW], rt = K[ki + 1];
  if (up !== PV || lf !== PV) i += 1;
  else if (dn !== PV || rt !== PV) i -= 2;
  return Pv[clampI(i, 1, 6)];
}

// Glutsenke je Feinpixel (Signatur siehe ground/kit.js)
function outdoorFine(kind, F, G, K, ki, KW, S) {
  if (kind === FI) return -1;   // Glutspalten: Weltpixel-Shader (mit Leuchtebene)
  if (kind === PV) return paveFine(F, G, K, ki, KW);
  const o = (G - S.G0) * S.W2 + (F - S.F0), a = S.abs[o];
  const dt = D4[(G & 3) * 4 + (F & 3)] / 16;
  if (kind === FK.WATER) return waterFine(F, G, K, ki, KW, S, o, dt, WP);
  const wi = (((G - S.G0) >> 1) + S.m) * S.fw + ((F - S.F0) >> 1) + S.m;
  const t = S.tone[wi];
  // Schlagschatten des Pflasters (Platz liegt etwas höher)
  const pvShadow = K[ki - KW] === PV || K[ki - KW - 1] === PV || K[ki - 1] === PV;
  // versengt: Abstand zur Spalte mit Rauschen, harte Stufen
  let burn = 99;
  if (S.fd) {
    const fd = S.fd, d0 = fd[wi];
    if (d0 < 66) {
      // Abstand bilinear auf das Feinpixel (das Feld liegt in Weltpixeln)
      const ix = F & 1 ? 1 : -1, iy = G & 1 ? S.fw : -S.fw;
      const d = 0.5625 * d0 + 0.1875 * (fd[wi + ix] + fd[wi + iy]) + 0.0625 * fd[wi + ix + iy];
      burn = d / 3 + (t - 0.5) * 8 + (dt - 0.5) * 1.5;
    }
  }
  if (kind === DI) {
    const D = P.dirt;
    if (K[ki - KW] === GR) return burn < 9 ? P.ash[0] : D[0];   // Grasnarbe wirft eine Kante
    if (K[ki - KW] === FK.WATER) return D[6];                   // Uferkante im Licht
    if (a >= 0) return a;
    if (burn < 13) {
      // nah an der Spalte glühend heiß gebrannt (rotbraun), dann Asche
      if (burn < 4) return P.heat[burn < 2 ? 0 : 1];
      const A = P.ash;
      const j = burn < 7 ? 1 + clampI(band(t, 2, dt), 0, 1) : 2 + clampI(band(t, 2.4, dt), 0, 2);
      return A[clampI(j + (S.rel[o] < 0 ? -1 : S.rel[o] > 0 ? 1 : 0), 0, 5)];
    }
    const up2 = K[ki - 2 * KW] === GR, dn1 = K[ki + KW] === GR, dn2 = K[ki + 2 * KW] === GR, dn3 = K[ki + 3 * KW] === GR;
    const near = up2 || dn1 || dn2 || K[ki - 1] === GR || K[ki + 1] === GR || K[ki - 2] === GR || K[ki + 2] === GR;
    let i = 3 + clampI(band(t, 2.2, dt), 0, 2) + (near ? -1 : 0);
    if (up2) i = Math.min(i, 3);
    // Wagenspuren: Mulde eine Stufe dunkler, Unterkante hell
    const r = S.rut[wi];
    const inRut = r > 0.74 || (r > 0.7 && dt < (r - 0.7) / 0.04);
    if (inRut) i -= 1;
    else if (!(G & 1) && S.rut[wi - S.fw] > 0.74) i += 1;
    // Halme der Grasnarbe darunter wachsen in den Weg
    if (dn1 || dn2 || dn3) {
      const e = dn1 ? 1 : dn2 ? 2 : 3, hb = hash2(F, G + e, 860);
      const hh = hb < 0.5 ? 1 + Math.floor(hb * 6) : 0;
      if (e <= hh) return P.blade[e === hh ? 5 : 3];
    }
    if (pvShadow) i -= 2;
    return D[clampI(i + S.rel[o], 0, 7)];
  }
  if (a >= 0) return a;
  // Gras: Polster / Grundton / zertreten (Grenzen geordnet gerastert); Oberkante am Weg hell
  const p = S.patch[wi];
  if (burn < 11) {
    const A = P.ash, j = burn < 4 ? 1 : burn < 8 ? 2 : 3;
    return S.rel[o] < 0 ? A[j - 1] : A[j];
  }
  const lush = p > 0.62 || (p > 0.56 && dt < (p - 0.56) / 0.06);
  const worn = !lush && (p < 0.3 || (p < 0.36 && dt < (0.36 - p) / 0.06));
  const up = K[ki - KW];
  if (up === DI || up === FK.WATER) return lush ? P.floor[5] : P.floor[6];
  let base = lush ? P.lush[1 + clampI(band(t, 3, dt), 0, 3)] : worn ? P.worn[1 + clampI(band(t, 3, dt), 0, 3)] : P.floor[1 + clampI(band(t, 4, dt), 0, 4)];
  // Übergang zur Versengung: verdorrtes Gras
  if (burn < 16 && dt < (16 - burn) / 5) base = P.worn[clampI(band(t, 2, dt), 0, 2)];
  if (pvShadow) return darken(base, 0.55);
  return S.rel[o] < 0 ? darken(base, 0.62) : base;
}

export const FINE_OUTDOOR = { finePixel: outdoorFine, fineSetup: outdoorSetup, fineTufts: false };
