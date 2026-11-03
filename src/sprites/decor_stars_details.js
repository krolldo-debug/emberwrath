import { hash2 } from '../core/math.js';
import { mk, fpoly, lump, pal32 } from './decor_ashwood.js';

// Kartendetails der Sternenglut (03.11.): Setzstücke, die von Aurels Gärten und der Sternwarte erzählen.
//  - Hängende Terrassen: Pflanzurnen, Rosenlaube mit Bank, Terrassenbrunnen
//  - Wurzelbruch: eingestürzte Laube, umgestürzte Urne, Leerenrisse im Boden (flach, begehbar)
//  - Mondweiher: Kahn am Ufer
//  - Sternwartenberg: Armillarsphäre, Sternkartenpult, umgestürztes Fernrohr
// Licht von links oben, harte Stufen, Leuchtebene nur für Wasser, Sternlicht und Leere.

const PEARL = ['#2a2840', '#4a4466', '#605a80', '#7c769c', '#9c97ba', '#c2bed8', '#ecebf8'];
const GOLD = ['#4a2c10', '#7a4a18', '#a8701e', '#d8a440', '#f6d888', '#fff4c8'];
const ROSE = ['#3a1a30', '#6e2c56', '#9a4474', '#c86a98', '#eca0c0', '#ffd8ea'];
const LEAF = ['#16241e', '#24382c', '#34503a', '#4a6c48', '#6a8c5a', '#94b47a'];
const WOOD = ['#1a1014', '#2c1c1c', '#432a24', '#5e3c2c', '#7c5236', '#a07048'];
const DRY = ['#1c1418', '#2c1e20', '#40302a', '#5a4434', '#76583e'];
const SOIL = ['#140e14', '#21171c', '#2e2026', '#3e2c30', '#523a3a'];
const WATER = ['#0e1c3a', '#16305a', '#244a80', '#3a72aa', '#6aa8d8', '#b8e4ff', '#ffffff'];
const BRASS = ['#3a2410', '#6a4418', '#a0702a', '#d4a444', '#f4d88a', '#fff4c8'];
const VOID = ['#140a24', '#2a1640', '#4a2470', '#7a44b0', '#b48aff', '#e8d8ff'];
const CRY = ['#0e2a40', '#164660', '#2484a8', '#5ccbea', '#b8f2ff', '#ffffff'];
const CRY_LIGHT = [130, 230, 255], VOID_LIGHT = [170, 110, 255], WATER_LIGHT = [150, 200, 255];

// Perlsteinblock mit Kanten: Deckfläche hell, Lichtseite links, Schattenseite rechts
function block(p, x0, y0, x1, y1, top = 1) {
  const P = pal32(PEARL), mid = (x0 + x1) / 2;
  p.scan(x0, y0, x1, y1, (x, y) => {
    if (y < y0 + top) return P[6];
    if (y > y1 - 0.75) return P[1];
    if (x < x0 + 0.75) return P[5];
    if (x > x1 - 1) return P[2];
    return P[x < mid ? 4 : 3];
  });
}

// Blütenbüschel: Blattgrund und einzelne Blüten (pal = GOLD oder ROSE)
function flowers(p, cx, cy, rx, ry, pal, seed) {
  lump(p, cx, cy, rx, ry, LEAF, { lo: 1, hi: 4 });
  // Blüten als kleine Dolden (Kreuz aus 4 Feinpixeln, Mitte hell), oben dichter als unten
  const n = Math.round(rx * ry * 1.1);
  for (let i = 0; i < n; i++) {
    const a = hash2(i, seed, 1) * Math.PI * 2, r = Math.sqrt(hash2(i, seed, 2));
    const x = cx + Math.cos(a) * rx * r * 0.8, y = cy + Math.sin(a) * ry * r * 0.8 - 0.3;
    const lit = y < cy + 0.3 && x < cx + rx * 0.4;
    const c = pal[lit ? 4 : 3];
    p.dot(x, y, c); p.dot(x + 0.5, y, c); p.dot(x, y + 0.5, pal[lit ? 3 : 2]); p.dot(x + 0.5, y + 0.5, pal[2]);
    if (lit && hash2(i, seed, 3) < 0.5) p.dot(x, y - 0.5, pal[5]);
  }
}

// ---------------------------------------------------------------- Hängende Terrassen
// Pflanzurne auf Sockel: v0 Goldblumen, v1 Rosen, die über den Rand hängen
function urnPlanter(v) {
  const W = 16, H = 24, cx = 8, base = H - 2;
  return mk(W, H, (p) => {
    const P = pal32(PEARL);
    block(p, cx - 4.5, base - 4, cx + 4.5, base, 1);
    // Urnenkörper: Fuß, Bauch, Lippe
    p.scan(cx - 1.5, base - 7, cx + 1.5, base - 4, (x) => P[x < cx ? 4 : 2]);
    p.scan(cx - 5, base - 13, cx + 5, base - 7, (x, y) => {
      const w = 5 - Math.max(0, (y - (base - 10)) * 0.9);
      if (Math.abs(x - cx) > w) return null;
      const t = (x - cx) / w;
      return P[y > base - 8 ? 1 : t < -0.5 ? 5 : t < 0.15 ? 4 : t < 0.65 ? 3 : 2];
    });
    p.scan(cx - 6, base - 14.5, cx + 6, base - 13, (x, y) => P[y < base - 14 ? 6 : x > cx + 3 ? 3 : 5]);
    p.fline(cx - 4, base - 10.5, cx + 4, base - 10.5, PEARL[2], 0.5);
    // Bepflanzung
    flowers(p, cx, base - 16.5, 5.5, 3.2, v ? ROSE : GOLD, 40 + v);
    if (v) for (const s of [-1, 1]) for (let y = base - 14; y < base - 8; y += 1) { p.dot(cx + s * (5.5 + (y - base + 14) * 0.15), y, LEAF[3]); if ((y | 0) % 2) p.dot(cx + s * (5.8 + (y - base + 14) * 0.15), y, ROSE[4]); }
  }, { ax: cx, ay: base, box: [-4, -3, 4, 1], b: true });
}

// Rosenlaube mit Steinbank: zwei Perlsteinsäulen, Holzgitter oben, Rosenranken
function pergolaBench() {
  const W = 36, H = 38, base = H - 2;
  return mk(W, H, (p) => {
    const P = pal32(PEARL);
    // Säulen
    for (const x of [5, 30]) {
      p.scan(x - 2, 10, x + 2, base - 2, (px) => P[px < x - 1 ? 5 : px < x + 0.5 ? 4 : 2]);
      block(p, x - 3, base - 2.5, x + 3, base, 0.75);
      block(p, x - 3, 8.5, x + 3, 10.5, 0.75);
    }
    // Querbalken und Gitterlatten
    p.scan(2, 6, 34, 8.5, (x, y) => pal32(WOOD)[y < 6.75 ? 5 : y > 7.75 ? 1 : 3]);
    for (let x = 4; x <= 32; x += 4) p.fline(x, 3, x + 1, 6, WOOD[x % 8 ? 3 : 4], 0.75);
    // Steinbank
    block(p, 10, base - 6, 26, base - 4, 1);
    for (const x of [12, 23]) block(p, x, base - 4, x + 2, base, 0.5);
    // Laubdach auf dem Balken (Blattballen, oben hell), darin Rosen
    for (let x = 3; x <= 33; x += 3.4) lump(p, x, 5.2 + Math.sin(x * 1.3) * 0.8, 2.6, 2, LEAF, { lo: 1, hi: 5 });
    // Ranken über Balken und Säulen
    for (let x = 2; x < 34; x += 0.7) {
      const y = 5.5 + Math.sin(x * 0.7) * 1.4 + Math.sin(x * 0.23) * 1;
      p.dot(x, y, LEAF[hash2(Math.floor(x * 2), 1, 61) < 0.5 ? 3 : 4]);
      if (hash2(Math.floor(x * 2), 2, 61) < 0.4) { p.dot(x, y + 0.5, ROSE[3]); p.dot(x + 0.5, y + 0.5, ROSE[2]); p.dot(x, y, ROSE[4]); p.dot(x + 0.5, y, ROSE[4]); p.dot(x, y - 0.5, ROSE[5]); }
    }
    for (const x0 of [5, 30]) for (let y = 9; y < base - 4; y += 0.7) {
      const x = x0 + Math.sin(y * 0.8 + x0) * 2.2;
      p.dot(x, y, LEAF[y % 3 < 1.5 ? 2 : 3]);
      if (hash2(Math.floor(y * 2), x0, 62) < 0.3) { p.dot(x + 0.5, y, ROSE[4]); p.dot(x + 1, y, ROSE[3]); p.dot(x + 0.5, y + 0.5, ROSE[2]); }
    }
    // herabhängende Ranken in der Mitte
    for (const x0 of [11, 18, 25]) for (let y = 8; y < 8 + 3 + (x0 % 3); y += 0.7) p.dot(x0 + Math.sin(y) * 0.6, y, LEAF[3]);
    flowers(p, 8, base - 1, 3, 1.6, ROSE, 63);
  }, { ax: W / 2, ay: base, b: true, extra: { boxes: [[-16, -3, -10, 1], [10, -3, 16, 1], [-8, -4, 8, 0]] } });
}

// Terrassenbrunnen: zwei Perlsteinschalen, Wasser fällt in Stufen, Schimmer auf der Leuchtebene
function terraceFountain() {
  const W = 36, H = 34, cx = 18, base = H - 2;
  return mk(W, H, (p, g) => {
    const P = pal32(PEARL), Wa = pal32(WATER);
    // untere Schale (Ellipse mit Rand)
    p.scan(cx - 15, base - 9, cx + 15, base, (x, y) => {
      const nx = (x - cx) / 15, ny = (y - base + 5) / 5;
      const d = nx * nx + ny * ny;
      if (d > 1 && y < base - 4) return null;
      if (y >= base - 4) { if (Math.abs(x - cx) > 14 - (y - base + 4) * 0.6) return null; return P[y > base - 0.75 ? 1 : nx < -0.6 ? 5 : nx < 0.4 ? 3 : 2]; }
      if (d > 0.72) return P[ny < 0 ? 6 : 4];
      return Wa[ny < -0.3 ? 4 : hash2(Math.floor(x), Math.floor(y), 71) < 0.12 ? 5 : 3];
    });
    // Säule und obere Schale
    p.scan(cx - 2, base - 18, cx + 2, base - 6, (x) => P[x < cx - 1 ? 5 : x < cx + 0.5 ? 4 : 2]);
    p.scan(cx - 8, base - 22, cx + 8, base - 17, (x, y) => {
      const nx = (x - cx) / 8, ny = (y - base + 20) / 2.5;
      if (y > base - 19.5) { if (Math.abs(x - cx) > 8 - (y - base + 19.5) * 2.2) return null; return P[nx < -0.5 ? 5 : nx < 0.3 ? 3 : 2]; }
      const d = nx * nx + ny * ny;
      if (d > 1) return null;
      return d > 0.6 ? P[6] : Wa[4];
    });
    // Knauf und Wasserstrahl
    lump(p, cx, base - 24.5, 1.6, 1.8, PEARL, { lo: 3, hi: 6 });
    for (const s of [-1, 1]) {
      for (let t = 0; t <= 1; t += 0.08) { const x = cx + s * (7.5 + t * 3), y = base - 19 + t * t * 13; p.dot(x, y, WATER[t < 0.5 ? 5 : 4]); g.dot(x, y, WATER[4]); }
    }
    g.oval(cx, base - 20, 4, 1, WATER[4]);
    for (const [x, y] of [[cx - 9, base - 6], [cx + 6, base - 4], [cx - 2, base - 7.5], [cx + 11, base - 6.5]]) { p.dot(x, y, WATER[6]); g.dot(x, y, WATER[5]); }
  }, { ax: cx, ay: base, box: [-14, -8, 14, 1], b: true, light: { dx: 0, dy: -14, radius: 46, color: WATER_LIGHT, intensity: 0.35 } });
}

// ---------------------------------------------------------------- Wurzelbruch
// Eingestürzte Laube: eine Säule steht, die andere liegt quer, Balken gebrochen, Ranken verdorrt, Leere im Spalt
function brokenPergola() {
  const W = 38, H = 32, base = H - 2;
  return mk(W, H, (p, g) => {
    const P = pal32(PEARL), Wd = pal32(WOOD);
    // Riss im Boden mit Leerenglimmen
    fpoly(p, [[14, base - 1], [20, base - 2.5], [27, base - 1.5], [31, base], [24, base + 0.5], [18, base + 0.5]], VOID[1]);
    p.fline(16, base - 0.5, 29, base - 0.5, VOID[3], 0.5);
    g.fline(17, base - 0.8, 28, base - 0.8, VOID[3], 1);
    // stehende Säule (abgebrochen)
    p.scan(4, 9, 8, base - 2, (x, y) => (y < 9 + Math.max(0, (x - 4) * 0.9) ? null : P[x < 5 ? 5 : x < 6.5 ? 4 : 2]));
    block(p, 3, base - 2.5, 9, base, 0.75);
    // Balkenrest an der Säule, schräg gebrochen
    p.fline(3, 9.5, 17, 14, WOOD[3], 1.6); p.fline(3, 8.8, 16.5, 13.2, WOOD[5], 0.5);
    p.fline(17, 14, 18.5, 12.5, WOOD[1], 0.6);
    // liegende Säule mit Bruchstücken
    p.scan(12, base - 5, 34, base - 1, (x, y) => (y < base - 4.25 ? P[6] : y > base - 1.75 ? P[1] : P[(Math.floor(x / 5) & 1) ? 4 : 3]));
    p.fline(22.5, base - 5, 23, base - 1, PEARL[1], 0.5);
    block(p, 33, base - 6, 36, base, 0.75);
    lump(p, 10, base - 1, 1.6, 1.2, PEARL, { lo: 2, hi: 5 });
    // dürre Ranken
    for (let y = 10; y < base - 3; y += 0.8) p.dot(6 + Math.sin(y * 0.9) * 2, y, DRY[hash2(Math.floor(y * 2), 3, 81) < 0.5 ? 3 : 2]);
    for (let x = 13; x < 33; x += 0.9) p.dot(x, base - 5.5 + Math.sin(x * 0.8) * 0.8, DRY[3]);
    for (const [x, y] of [[5, 13], [7, 19], [20, base - 6], [28, base - 6]]) p.dot(x, y, ROSE[1]);
    // Wurzelreste aus dem Spalt
    p.fline(24, base, 27, base - 3, DRY[2], 0.8);
    g.dot(22, base - 1, VOID[4]);
  }, { ax: W / 2, ay: base, b: true, extra: { boxes: [[-16, -3, -10, 1], [-7, -4, 17, 0]] }, light: { dx: 4, dy: -2, radius: 30, color: VOID_LIGHT, intensity: 0.3 } });
}

// Umgestürzte Urne: liegt zerbrochen auf der Seite, Erde und welke Blüten fallen heraus
function toppledUrn() {
  const W = 22, H = 14, base = H - 2;
  return mk(W, H, (p) => {
    const P = pal32(PEARL);
    lump(p, 15, base - 1, 6, 2, SOIL, { lo: 1, hi: 4 });
    for (let i = 0; i < 7; i++) p.dot(12 + hash2(i, 1, 91) * 9, base - 2 + hash2(i, 2, 91) * 2.5, i % 3 ? DRY[3] : GOLD[1]);
    // Körper liegend: Mündung rechts, Fuß links
    p.scan(2, base - 7, 13, base, (x, y) => {
      const w = 3.6 - Math.abs(x - 8) * 0.12 - (x < 4 ? (4 - x) * 0.8 : 0);
      const cy = base - 3.6, t = (y - cy) / w;
      if (Math.abs(t) > 1) return null;
      return P[t < -0.55 ? 6 : t < -0.1 ? 5 : t < 0.45 ? 3 : 2];
    });
    p.scan(12.5, base - 8, 14, base + 0.5, (x, y) => P[y < base - 6 ? 6 : 4]);
    p.fline(6, base - 7, 8, base - 2, PEARL[1], 0.5);        // Sprung
    lump(p, 4, base - 0.5, 1.4, 0.9, PEARL, { lo: 2, hi: 5 });  // Scherbe
  }, { ax: W / 2, ay: base, box: [-8, -3, 4, 1], b: true });
}

// Leerenriss im Boden: flach und begehbar, aufgeworfene Erdschollen am Rand, violettes Glimmen aus der Tiefe
function voidCrack(v) {
  const W = 36, H = 14, base = H - 4, cx = 18;
  return mk(W, H, (p, g) => {
    const pts = v
      ? [[3, base + 0.5], [9, base - 2], [14, base - 1], [19, base - 3.5], [27, base - 2.5], [33, base - 0.5], [26, base + 0.5], [20, base + 2], [13, base + 1.5], [8, base + 1.5]]
      : [[4, base - 1.5], [11, base - 3], [17, base - 1], [24, base - 1.5], [32, base + 1.5], [24, base + 1.5], [17, base + 2.5], [10, base + 0.5]];
    const inner = (k) => pts.map(([x, y]) => [x + (cx - x) * k, y + (base - y) * k * 1.6]);
    // Erdschollen am Rand (Licht oben links), dann der dunkle Spalt und die glimmende Tiefe
    for (let i = 0; i < pts.length; i += 2) { const [x, y] = pts[i]; lump(p, x + (y < base ? 0 : 0.5), y + (y < base ? -0.8 : 0.6), 2.2, 1.2, SOIL, { lo: 1, hi: 4 }); }
    fpoly(p, pts, SOIL[0]);
    fpoly(p, inner(0.22), VOID[1]);
    fpoly(p, inner(0.5), VOID[2]);
    const core = inner(0.72);
    for (let i = 0; i < core.length - 1; i++) { p.fline(...core[i], ...core[i + 1], VOID[3], 0.5); g.fline(...core[i], ...core[i + 1], VOID[3], 1); }
    g.oval(cx, base, 5, 1, VOID[3]); g.dot(cx - 2, base - 0.5, VOID[5]); g.dot(cx + 5, base, VOID[4]);
    // Funken der Leere über dem Spalt
    for (const [x, y] of [[cx - 6, base - 4], [cx + 3, base - 6], [cx + 9, base - 3.5]]) { p.dot(x, y, VOID[4]); g.dot(x, y, VOID[4]); }
  }, { ax: cx, ay: base, b: true, extra: { sortOffset: -10000, shadow: 0 }, light: { dx: 0, dy: -2, radius: 40, color: VOID_LIGHT, intensity: 0.5 } });
}

// ---------------------------------------------------------------- Mondweiher
// Kahn am Ufer: halb ans Land gezogen, Bug im Wasser, Ruderbank und Riemen, Pflock mit Leine
function shoreBoat() {
  const W = 40, H = 22, base = H - 3, cx = 20, cy = 10;
  return mk(W, H, (p, g) => {
    const Wd = pal32(WOOD);
    // Wellen am Bug (links im Wasser)
    for (const [x, y, r] of [[5, cy + 5, 3.5], [3, cy - 1, 2.5]]) { p.fline(x - r, y, x + r, y, WATER[5], 0.5); g.fline(x - r + 0.5, y, x + r - 0.5, y, WATER[4], 0.5); }
    // Rumpf: Spindel, Bordwand außen (hell oben, dunkel unten), innen dunkel mit Planken
    const half = (x) => { const t = (x - cx) / 16; return Math.abs(t) > 1 ? -1 : 5.6 * Math.sqrt(1 - t * t) * (t < 0 ? 1 - Math.abs(t) * 0.15 : 1); };
    p.scan(cx - 16, cy - 7, cx + 16, cy + 8, (x, y) => {
      const h = half(x); if (h < 0) return null;
      const v = (y - cy) / h;
      if (v < -1 || v > 1.3) return null;
      if (v > 1) return Wd[1];                                 // Bordwand unten im Schatten
      if (v < -0.72) return Wd[5];                              // Dollbord oben im Licht
      if (v > 0.62) return Wd[4];
      return Wd[Math.abs(((x - cx) % 3 + 3) % 3) < 0.5 ? 1 : 2];   // Innenraum mit Spanten
    });
    for (const x of [cx - 5, cx + 4]) p.scan(x - 0.75, cy - 4.5, x + 0.75, cy + 4, (px) => Wd[px < x ? 5 : 3]);   // Ruderbänke
    // Riemen über der Bank, Blatt im Wasser
    p.fline(cx - 2, cy - 3, cx - 15, cy + 6, WOOD[4], 0.8); p.fline(cx - 15, cy + 6, cx - 18, cy + 8, WOOD[3], 1.6);
    // Pflock am Ufer mit Leine zum Heck
    p.scan(W - 4.5, base - 7, W - 2.5, base, (x) => Wd[x < W - 3.5 ? 4 : 1]);
    p.fline(cx + 15, cy + 1, W - 3.5, base - 6, '#a8a090', 0.5);
  }, { ax: cx + 6, ay: base, box: [-10, -6, 12, 1], b: true });
}

// ---------------------------------------------------------------- Sternwartenberg
// Armillarsphäre auf Perlsteinsockel: Messingringe um eine Kristallkugel, ein Ring gebrochen und abgesackt
function armillary() {
  const W = 26, H = 40, cx = 13, base = H - 2, cy = 14;
  return mk(W, H, (p, g) => {
    block(p, cx - 6, base - 5, cx + 6, base, 1);
    block(p, cx - 2, base - 13, cx + 2, base - 5, 0.75);
    block(p, cx - 4, base - 14.5, cx + 4, base - 12.5, 0.75);
    lump(p, cx, cy, 3.2, 3.2, CRY, { lo: 1, hi: 4 });
    g.oval(cx, cy, 2.4, 2.4, CRY[3]); g.dot(cx - 1, cy - 1, CRY[5]);
    const ring = (rx, ry, rot, c0, c1, cut = null) => {
      for (let a = 0; a < Math.PI * 2; a += 0.04) {
        if (cut && a > cut[0] && a < cut[1]) continue;
        const x0 = Math.cos(a) * rx, y0 = Math.sin(a) * ry;
        const x = cx + x0 * Math.cos(rot) - y0 * Math.sin(rot), y = cy + x0 * Math.sin(rot) + y0 * Math.cos(rot);
        p.dot(x, y, Math.sin(a) < 0 ? c0 : c1);
      }
    };
    ring(9, 9, 0, BRASS[4], BRASS[2]);
    ring(9, 3, -0.4, BRASS[3], BRASS[2]);
    ring(3, 9, 0.5, BRASS[3], BRASS[1], [2.2, 3.6]);
    // abgesackter Bruchring am Sockel
    p.fline(cx + 4, base - 13, cx + 9, base - 6, BRASS[2], 0.6);
    p.fline(cx - 0.5, cy + 9, cx - 0.5, base - 14.5, BRASS[2], 0.8);
    p.dot(cx - 9, cy - 0.5, BRASS[5]);
  }, { ax: cx, ay: base, box: [-5, -3, 5, 1], b: true, light: { dx: 0, dy: -24, radius: 40, color: CRY_LIGHT, intensity: 0.4 } });
}

// Sternkartenpult: schräge Steintafel mit eingelegten Sternen, die schwach leuchten
function starChart() {
  const W = 20, H = 24, cx = 10, base = H - 2;
  return mk(W, H, (p, g) => {
    const P = pal32(PEARL);
    block(p, cx - 2.5, base - 9, cx + 2.5, base - 1, 0.75);
    block(p, cx - 4.5, base - 1.5, cx + 4.5, base, 0.5);
    // schräge Tafel
    fpoly(p, [[cx - 8, base - 13], [cx + 8, base - 15], [cx + 8.5, base - 9.5], [cx - 8.5, base - 8]], (x, y) => (y > base - 9.4 + (x - cx) * -0.09 ? P[2] : P[1]));
    fpoly(p, [[cx - 7, base - 12.6], [cx + 7, base - 14.4], [cx + 7.3, base - 10.6], [cx - 7.4, base - 9.2]], '#1a1840');
    p.fline(cx - 8, base - 13, cx + 8, base - 15, PEARL[6], 0.5);
    const stars = [[cx - 5, base - 11.5], [cx - 2, base - 12.5], [cx + 1, base - 11], [cx + 4, base - 13], [cx + 5.5, base - 11.2]];
    for (let i = 0; i < stars.length - 1; i++) p.fline(...stars[i], ...stars[i + 1], '#3a3a7a', 0.5);
    for (const [x, y] of stars) { p.dot(x, y, CRY[4]); g.dot(x, y, CRY[3]); }
  }, { ax: cx, ay: base, box: [-4, -3, 4, 1], b: true, light: { dx: 0, dy: -12, radius: 26, color: CRY_LIGHT, intensity: 0.3 } });
}

// Umgestürztes Fernrohr: langes Messingrohr schräg auf dem gebrochenen Holzbock, Linse glänzt
function fallenTelescope() {
  const W = 46, H = 22, base = H - 2;
  return mk(W, H, (p, g) => {
    const B = pal32(BRASS);
    // gebrochener Bock
    p.fline(8, base, 12, base - 9, WOOD[3], 1.4); p.fline(16, base, 12, base - 9, WOOD[2], 1.4);
    p.fline(20, base, 23, base - 4, WOOD[2], 1.2); p.fline(23, base - 4, 25, base - 3, WOOD[1], 0.6);
    // Rohr in drei Stufen (dick → dünn), von links oben nach rechts unten
    const tube = (x0, y0, x1, y1, r) => {
      const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
      fpoly(p, [[x0 + nx * r, y0 + ny * r], [x1 + nx * r, y1 + ny * r], [x1 - nx * r, y1 - ny * r], [x0 - nx * r, y0 - ny * r]], (x, y) => {
        const o = ((x - x0) * nx + (y - y0) * ny) / r;
        return o > 0.55 ? BRASS[1] : o > 0 ? BRASS[2] : o > -0.6 ? BRASS[3] : BRASS[4];
      });
    };
    tube(5, base - 12, 20, base - 6, 3.2);
    tube(20, base - 6, 32, base - 2.5, 2.4);
    tube(32, base - 2.5, 41, base - 0.5, 1.7);
    for (const [x, y, r] of [[20, base - 6, 3.4], [32, base - 2.5, 2.6]]) p.fline(x, y - r, x + 0.6, y + r, BRASS[5], 0.5);
    // Objektiv mit Glanz
    p.scan(2.5, base - 16, 6, base - 8, (x, y) => (Math.hypot((x - 4.5) * 1.4, y - base + 12) > 3.6 ? null : B[x < 4 ? 4 : 2]));
    p.oval(4.2, base - 12, 1.6, 2.8, CRY[2]); p.dot(3.8, base - 13, CRY[5]);
    g.oval(4.2, base - 12, 1.2, 2.2, CRY[3]);
    for (let i = 0; i < 4; i++) p.dot(26 + i * 4, base + 0.5, SOIL[3]);
  }, { ax: 22, ay: base, b: true, extra: { boxes: [[-18, -6, -4, 1], [-4, -4, 12, 1]] }, light: { dx: -18, dy: -12, radius: 24, color: CRY_LIGHT, intensity: 0.3 } });
}

export function createStarDetailDecor() {
  return {
    urnPlanters: [0, 1].map(urnPlanter),
    pergolaBench: pergolaBench(),
    terraceFountain: terraceFountain(),
    brokenPergola: brokenPergola(),
    toppledUrn: toppledUrn(),
    voidCracks: [0, 1].map(voidCrack),
    shoreBoat: shoreBoat(),
    armillary: armillary(),
    starChart: starChart(),
    fallenTelescope: fallenTelescope(),
  };
}
