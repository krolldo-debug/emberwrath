import { createRng, hash2 } from '../core/math.js';
import { mk, fpoly, lump, pal32 } from './decor_ashwood.js';
import { col32 } from '../gfx/Fine.js';
import { prism, createAstralNature } from './decor_astral.js';

// Splitterweiten (45–50): Glasbäume, singende Kristalltürme, das Schürferlager Funkenruh (Zelte, Loren, Erzhaufen,
// Förderkran am Inselrand), Spiegelsteine am Spiegelsee, die Ruine der Sternwarte und das Tor der Gläsernen Hallen.
// Licht von links oben, Kristalle zusätzlich auf der Leuchtebene. Alles Stufe B (fein).

const PEARL = ['#2a2840', '#4a4466', '#605a80', '#7c769c', '#9c97ba', '#c2bed8', '#ecebf8'];
const CRY = ['#0e2a40', '#164660', '#2484a8', '#5ccbea', '#b8f2ff', '#ffffff'];
const LILAC = ['#1e1438', '#3a2a68', '#5a46a0', '#8a74d0', '#c4b4f4', '#f4f0ff'];
const GLASS = ['#1a2a3c', '#2a4a62', '#3e6e8a', '#64a0bc', '#a6d4e6', '#e8f8ff'];
const STONE = ['#161a2a', '#242a3e', '#343c54', '#48526c', '#606c86', '#8490a8', '#b0bacc'];
const WOOD = ['#160e14', '#26181c', '#3a2622', '#54382c', '#6e4c36', '#8a6444'];
const CANVAS = ['#1c2236', '#2a3450', '#3c4a6c', '#566690', '#7a8cb2', '#a6b6d2'];
const BRASS = ['#3a2a10', '#6a4e1c', '#a07a30', '#d0aa50', '#f4e090'];
const IRON = ['#141020', '#241e34', '#3a3250', '#585070'];
const LAMP = ['#3a2614', '#5a3a20', '#d8984a', '#f6c87a', '#fff0c8', '#ffffff'];
const EMBER = ['#3a1408', '#7a2a0c', '#c4501a', '#f08a2c', '#ffc060', '#fff0c0'];
const CRY_LIGHT = [130, 230, 255], LAMP_LIGHT = [255, 210, 150];

const P = pal32(PEARL), Wd = pal32(WOOD);

function footShade(p, cx, cy, rx, ry) {
  const A = [col32('#121626'), col32('#1a1e30')];
  p.scan(cx - rx, cy - ry, cx + rx, cy + ry, (x, y) => {
    const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    return d > 1 ? 0 : d > 0.55 ? A[1] : A[0];
  });
}

// ---------------------------------------------------------------- Natur
// Glasbaum: Stamm aus milchigem Kristall, Krone aus Glasfacetten (blau oder flieder), einzelne Facetten leuchten
function glassTree(v) {
  const W = [46, 40, 52][v], H = [58, 50, 66][v], cx = W / 2, base = H - 3, seed = 3300 + v, rng = createRng(seed);
  const pal = v === 1 ? LILAC : GLASS;
  return mk(W, H, (p, g) => {
    footShade(p, cx, base + 0.5, W * 0.32, 2.4);
    // Stamm und Äste
    const top = H * 0.42;
    fpoly(p, [[cx - 3, base], [cx - 1.6, top], [cx + 1.6, top], [cx + 3, base]], (x) => (x < cx - 1 ? PEARL[6] : x < cx + 1 ? PEARL[5] : PEARL[3]));
    for (const [dx, dy] of [[-10, -9], [9, -11], [-5, -16], [6, -17]]) p.fline(cx, top + 6, cx + dx, top + dy + 6, PEARL[4], 1.2);
    // Facetten: Rauten in Schichten, hinten dunkler
    const facets = [];
    for (let i = 0; i < 26; i++) {
      const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next()) * W * 0.4;
      facets.push([cx + Math.cos(a) * r, top - 2 + Math.sin(a) * r * 0.62, rng.range(3, 5.5)]);
    }
    facets.sort((a, b) => a[1] - b[1]);
    for (const [x, y, r] of facets) {
      const lit = (cx - x) * 0.04 + (top - y) * 0.05;
      const k = lit > 0.35 ? 4 : lit > 0 ? 3 : lit > -0.35 ? 2 : 1;
      fpoly(p, [[x, y - r], [x + r * 0.8, y], [x, y + r * 0.8], [x - r * 0.8, y]], (xx, yy) => pal[xx < x && yy < y ? Math.min(5, k + 1) : xx > x && yy > y ? Math.max(0, k - 1) : k]);
      p.fline(x - r * 0.8, y, x, y - r, pal[5], 0.5);
      if (hash2(Math.floor(x), Math.floor(y), seed) < 0.18) g.oval(x, y, 1.4, 1.4, pal[4]);
    }
    for (let i = 0; i < 5; i++) { const x = cx + rng.range(-W * 0.4, W * 0.4); p.dot(x, base + rng.range(-1, 1), pal[4]); g.dot(x, base, pal[3]); }
  }, { ax: Math.round(cx), ay: H - 2, box: [-3, -3, 3, 1], b: true, light: { dx: 0, dy: -H * 0.55, radius: 50, color: v === 1 ? [190, 170, 255] : CRY_LIGHT, intensity: 0.35 } });
}

// Bruchstein der Weiten: kühler Fels mit Kristalladern
export function shardRock(v) {
  const W = [20, 14, 28][v], H = [14, 10, 18][v], seed = 3320 + v;
  return mk(W, H, (p, g) => {
    const rocks = [[[W / 2, H - 6, W * 0.38, H * 0.42]], [[W / 2, H - 4.5, W * 0.4, H * 0.42]], [[W * 0.38, H - 7, W * 0.3, H * 0.4], [W * 0.72, H - 5, W * 0.22, H * 0.3]]][v];
    for (const [x, y, rx, ry] of rocks) lump(p, x, y, rx, ry, STONE, { lo: 1, hi: 6, bias: 0.05 });
    const rng = createRng(seed);
    for (let k = 0; k < 2 + v; k++) {
      let x = rng.range(W * 0.25, W * 0.7), y = rng.range(H * 0.3, H * 0.6);
      for (let s = 0; s < 6; s++) { p.dot(x, y, CRY[4]); if (s & 1) g.dot(x, y, CRY[3]); x += rng.range(-0.8, 1); y += rng.range(0.2, 0.9); }
    }
  }, { ax: Math.round(W / 2), ay: H - 2, box: [-W * 0.35, -4, W * 0.35, 1], b: true, extra: { low: true } });
}

// Singender Kristallturm (Singende Grate): schlanke Nadel mit Klangringen auf der Leuchtebene
function singingSpire(v) {
  const W = 30, H = [86, 70][v], cx = W / 2, base = H - 3;
  return mk(W, H, (p, g) => {
    lump(p, cx, base + 0.5, 11, 2.6, STONE, { lo: 1, hi: 4 });
    prism(p, g, cx - 6, base, cx - 8, H * 0.6, 2.6, LILAC);
    prism(p, g, cx + 5, base, cx + 7, H * 0.66, 2.4);
    prism(p, g, cx, base, cx + 0.5, 3, 5);
    for (const y of [H * 0.3, H * 0.5]) { g.fline(cx - 6, y, cx + 6, y - 1, CRY[3], 0.5); g.fline(cx - 4, y - 3, cx + 4, y - 4, CRY[4], 0.5); }
  }, { ax: cx, ay: H - 2, box: [-9, -5, 9, 1], b: true, light: { dx: 0, dy: -H * 0.5, radius: 80, color: CRY_LIGHT, intensity: 0.7 } });
}

// Spiegelstein (Spiegelsee): hohe glatte Platte, die den Himmel spiegelt
export function mirrorStone(v) {
  const W = 28, H = [48, 38][v], cx = W / 2, base = H - 3;
  return mk(W, H, (p, g) => {
    lump(p, cx, base, 11, 3, STONE, { lo: 1, hi: 4 });
    const top = 4 + v * 2, lean = v ? -2 : 1.5;
    fpoly(p, [[cx - 7, base - 1], [cx - 6 + lean, top + 3], [cx + lean, top], [cx + 6 + lean, top + 4], [cx + 7, base - 1]], (x, y) => {
      const k = (y - top) / (base - top);
      if (x > cx + 5 + lean * (1 - k)) return STONE[2];
      // gespiegelter Himmel: oben Nacht, unten Morgenrot, ein Lichtstreif
      if (Math.abs((x - cx) + (y - top) * 0.5 - 4) < 1.1) return '#f0f4ff';
      return k < 0.3 ? '#2a3070' : k < 0.55 ? '#5a4a98' : k < 0.8 ? '#b46a98' : '#e89a90';
    });
    p.fline(cx - 6 + lean, top + 3, cx + lean, top, PEARL[6], 0.5);
    g.fline(cx - 2, top + 8, cx + 4, top + 20, '#c8d8ff', 0.5);
  }, { ax: cx, ay: H - 2, box: [-8, -5, 8, 1], b: true });
}

// ---------------------------------------------------------------- Schürferlager Funkenruh
function prospectorTent(v) {
  const W = 48, H = 40, cx = 24, base = H - 2;
  const pal = v ? ['#24182a', '#3a2840', '#54385a', '#704c76', '#906894', '#b08ab2'] : CANVAS;
  return mk(W, H, (p, g) => {
    footShade(p, cx, base, 22, 2.5);
    // Zeltbahn: Satteldach von vorn, Mittelnaht, Eingang offen mit Licht
    fpoly(p, [[cx, 4], [cx - 21, base - 1], [cx + 21, base - 1]], (x, y) => {
      const k = (y - 4) / (base - 5);
      if (Math.abs(x - cx) < 0.6) return CANVAS[1];
      const fold = Math.floor((x - cx + 40) / 5) & 1;
      let i = x < cx ? 4 : 2;
      if (fold) i -= 1;
      if (k > 0.94) i = 1;
      return pal[Math.max(0, i)];
    });
    fpoly(p, [[cx, 16], [cx - 7, base - 1], [cx + 7, base - 1]], (x, y) => (y > base - 6 ? LAMP[3] : y > base - 12 ? LAMP[2] : '#2a1a14'));
    g.each(cx - 7, base - 10, cx + 7, base - 1, (x, y) => (Math.abs(x - cx) < (y - 16) * 0.3 ? LAMP[3] : null));
    // Stangen und Leinen
    p.fline(cx, 1, cx, 6, WOOD[4], 1);
    p.fline(cx - 21, base - 1, cx - 24, base, WOOD[2], 0.5); p.fline(cx + 21, base - 1, cx + 24, base, WOOD[2], 0.5);
    // Laterne am Eingang
    p.scan(cx + 9, base - 15, cx + 12, base - 11, (x, y) => (y < base - 14.5 ? col32(IRON[2]) : col32(LAMP[x < cx + 10.5 ? 4 : 3])));
    g.oval(cx + 10.5, base - 13, 1.8, 2.2, LAMP[4]);
  }, { ax: cx, ay: base, b: true, box: [-20, -10, 20, 1], light: { dx: 0, dy: -8, radius: 60, color: LAMP_LIGHT, intensity: 0.6 } });
}

function mineCart() {
  const W = 34, H = 24, cx = 17, base = H - 3;
  return mk(W, H, (p, g) => {
    // Schienen
    p.scan(1, base - 1, W - 1, base + 0.5, (x, y) => (y < base - 0.5 ? col32(IRON[3]) : col32(IRON[1])));
    for (let x = 3; x < W - 2; x += 5) p.scan(x, base - 0.5, x + 2, base + 1.5, () => Wd[2]);
    // Lore
    p.scan(6, base - 11, W - 6, base - 3, (x, y) => (y < base - 10.5 ? col32(IRON[3]) : x > W - 8 ? col32(IRON[1]) : (Math.floor(x) % 6 === 0 ? col32(IRON[1]) : col32(IRON[2]))));
    for (const wx of [10, W - 10]) { p.oval(wx, base - 2, 2.6, 2.6, IRON[1]); p.oval(wx - 0.4, base - 2.4, 1.2, 1.2, IRON[3]); }
    // Kristalle in der Lore
    for (const [x, t] of [[10, 4], [14, 2], [18, 5], [22, 3], [25, 6]]) prism(p, g, x, base - 10, x + 0.5, base - 12 - t, 1.6);
  }, { ax: cx, ay: base, b: true, box: [-12, -6, 12, 1], light: { dx: 0, dy: -14, radius: 36, color: CRY_LIGHT, intensity: 0.4 } });
}

function oreHeap(v) {
  const W = [28, 22][v], H = [18, 14][v], cx = W / 2, base = H - 2, rng = createRng(3340 + v);
  return mk(W, H, (p, g) => {
    lump(p, cx, base - 3, W * 0.42, H * 0.36, STONE, { lo: 1, hi: 5 });
    for (let i = 0; i < 6 + v * 2; i++) {
      const x = cx + rng.range(-W * 0.32, W * 0.32), y = base - rng.range(2, H * 0.55);
      prism(p, g, x, y + 1.5, x + rng.range(-0.5, 0.5), y - rng.range(1.5, 3.5), 1.2);
    }
  }, { ax: Math.round(cx), ay: base, b: true, box: [-W * 0.38, -4, W * 0.38, 1], extra: { low: true }, light: { dx: 0, dy: -6, radius: 34, color: CRY_LIGHT, intensity: 0.4 } });
}

export function crateStack() {
  const W = 30, H = 26, cx = 15, base = H - 2;
  return mk(W, H, (p) => {
    const crate = (x, y, w, h) => {
      p.scan(x, y, x + w, y + h, (xx, yy) => (yy < y + 0.5 ? Wd[5] : xx < x + 0.5 ? Wd[4] : xx > x + w - 0.6 || yy > y + h - 0.6 ? Wd[1] : (Math.abs((xx - x) - (yy - y) * (w / h)) < 0.6 ? Wd[4] : Wd[3])));
      p.scan(x, y + h * 0.5 - 0.3, x + w, y + h * 0.5 + 0.3, () => Wd[2]);
    };
    crate(2, base - 10, 12, 10); crate(15, base - 9, 11, 9); crate(7, base - 19, 11, 9);
    // Fass
    p.scan(23, base - 14, 28, base - 9, (x, y) => (Math.abs(y - (base - 11.5)) < 0.4 ? col32(IRON[2]) : x < 25 ? Wd[4] : Wd[2]));
  }, { ax: cx, ay: base, b: true, box: [-13, -6, 13, 1], extra: { low: true } });
}

// Förderkran am Inselrand: Holzgerüst, Ausleger über den Abgrund, Seil mit Erzkübel
function derrick() {
  const W = 56, H = 76, cx = 18, base = H - 3;
  return mk(W, H, (p) => {
    footShade(p, cx, base, 14, 2.4);
    for (const [x0, x1] of [[cx - 10, cx - 3], [cx + 10, cx + 3]]) p.fline(x0, base, x1, 10, WOOD[x0 < cx ? 4 : 2], 1.4);
    for (const y of [base - 12, base - 28, base - 44]) { const k = (base - y) / (base - 10); p.fline(cx - 10 + 7 * k, y, cx + 10 - 7 * k, y, WOOD[3], 1); }
    p.fline(cx - 9, base - 2, cx + 7, base - 26, WOOD[2], 0.6); p.fline(cx + 9, base - 2, cx - 7, base - 26, WOOD[2], 0.6);
    // Ausleger
    p.fline(cx - 4, 12, W - 4, 8, WOOD[4], 1.6); p.fline(cx - 4, 13.5, W - 4, 9.5, WOOD[1], 0.5);
    p.oval(W - 5, 9, 1.8, 1.8, IRON[2]);
    // Seil und Kübel
    p.fline(W - 5, 10, W - 5, 40, '#b0a080', 0.5);
    p.scan(W - 9, 40, W - 1, 47, (x, y) => (y < 40.5 ? col32(IRON[3]) : x > W - 2.5 ? col32(IRON[1]) : col32(IRON[2])));
    for (const x of [W - 7.5, W - 5, W - 3]) { p.dot(x, 39.5, CRY[4]); }
    // Winde
    p.oval(cx, base - 6, 3.2, 3.2, WOOD[2]); p.oval(cx - 0.6, base - 6.6, 1.4, 1.4, WOOD[4]);
  }, { ax: cx, ay: base, b: true, box: [-10, -4, 10, 1] });
}

// Lagerfeuer der Schürfer: Steinring, Glut (Leuchtebene), Funken
function campfire() {
  const W = 26, H = 16, cx = 13, base = H - 3;
  return mk(W, H, (p, g) => {
    for (let a = 0; a < Math.PI * 2; a += 0.6) { const x = cx + Math.cos(a) * 8, y = base - 2 + Math.sin(a) * 3; lump(p, x, y, 2, 1.5, STONE, { lo: 2, hi: 5 }); }
    p.fline(cx - 5, base - 1, cx + 4, base - 4, WOOD[3], 1.2); p.fline(cx + 5, base - 1, cx - 4, base - 4, WOOD[2], 1.2);
    fpoly(p, [[cx - 3.5, base - 2], [cx - 1, base - 9], [cx + 0.5, base - 5], [cx + 2, base - 10], [cx + 3.5, base - 2]], (x, y) => (y > base - 4 ? EMBER[3] : y > base - 6.5 ? EMBER[4] : EMBER[5]));
    g.each(cx - 4, base - 11, cx + 4, base - 1, (x, y) => (Math.abs(x - cx) < (y - (base - 11)) * 0.45 ? EMBER[4] : null));
  }, { ax: cx, ay: base, b: true, box: [-8, -4, 8, 1], extra: { low: true, embers: { dx: 0, dy: -10, rate: 4 } }, light: { dx: 0, dy: -8, radius: 110, color: [255, 160, 80], intensity: 0.95 } });
}

// ---------------------------------------------------------------- Landmarken und Eingänge
// Ruine der Sternwarte (Sternwartenberg): halb eingestürzte Kuppel auf Perlsteintrommel, großes Fernrohr, Tor in die
// Sternwarte (Dungeon 49–50) unten in der Mitte
function observatory() {
  const W = 160, H = 132, cx = 80, base = H - 3, seed = 3400;
  return mk(W, H, (p, g) => {
    footShade(p, cx, base, 74, 4);
    // Trommel (Zylinder) aus Perlstein
    const x0 = cx - 60, x1 = cx + 60, top = base - 56;
    p.scan(x0, top, x1, base - 3, (x, y) => {
      const rel = (x - cx) / 60, row = Math.floor((y - top) / 4), ly = (y - top) - row * 4;
      const u = Math.asin(Math.max(-1, Math.min(1, rel))) * 12 + (row & 1) * 0.5, seg = Math.floor(u);
      let i = rel < -0.55 ? 5 : rel < 0.35 ? 4 : rel < 0.8 ? 3 : 2;
      if (ly > 3.5 || u - seg < 0.06) i -= 1; else if (ly < 0.5 && rel < 0.5) i += 1;
      if (hash2(seg, row, seed) < 0.08) i -= 1;
      // Risse und ausgebrochene Steine rechts oben
      if (x > cx + 20 && y < top + 12 + Math.sin(x * 0.4) * 4) return 0;
      return P[Math.max(0, Math.min(6, i))];
    });
    p.scan(x0 - 2, base - 4, x1 + 2, base, (x, y) => (y < base - 3.5 ? col32(BRASS[3]) : x > x1 - 6 ? P[2] : P[3]));
    p.scan(x0, top - 1, cx + 22, top + 2, (x, y) => (y < top ? col32(BRASS[4]) : col32(BRASS[2])));
    // Kuppel: linke Hälfte erhalten (Schiefer mit Messingrippen), rechts nur Rippen
    p.scan(x0 + 2, top - 46, x1 - 2, top, (x, y) => {
      const nx = (x - cx) / 58, ny = (y - top) / 46, d = nx * nx + ny * ny;
      if (d > 1 || y > top) return 0;
      const rib = Math.abs(((Math.atan2(-ny, nx) / Math.PI) * 12) % 1) < 0.08;
      if (nx > 0.25) return d > 0.88 && Math.sin(Math.atan2(-ny, nx) * 9) > -0.2 ? col32(BRASS[2]) : 0;
      if (rib) return col32(BRASS[3]);
      const l = -nx * 0.6 - ny * 0.5;
      return col32(['#1c2840', '#283a5a', '#364e74', '#48658e', '#6482a8'][Math.max(0, Math.min(4, Math.floor(1.6 + l * 3)))]);
    });
    // großes Fernrohr durch die offene Kuppel
    p.fline(cx - 6, top - 6, cx + 46, top - 56, BRASS[3], 6); p.fline(cx - 6, top - 9, cx + 46, top - 59, BRASS[4], 1);
    p.oval(cx + 47, top - 57, 4, 4, BRASS[2]); p.oval(cx + 47, top - 57, 2.6, 2.6, CRY[3]); g.oval(cx + 47, top - 57, 2.8, 2.8, CRY[4]);
    p.fline(cx - 6, top, cx + 4, top - 14, IRON[2], 2);
    // Tor (Dungeon) mit Sternbogen
    const dw = 22, dh = 32, dx0 = cx - dw / 2;
    p.scan(dx0 - 4, base - dh - 6, dx0 + dw + 4, base - 3, (x, y) => {
      const ar = Math.hypot(x - cx, y - (base - dh + dw / 2 - 4));
      if (y < base - dh + dw / 2 - 4 && ar > dw / 2 + 4) return 0;
      const inner = y >= base - dh + dw / 2 - 4 ? Math.abs(x - cx) < dw / 2 : ar < dw / 2;
      if (inner) return col32(y > base - 8 ? '#2a3a6a' : '#141a3a');
      return x < cx ? P[6] : P[4];
    });
    for (let k = 0; k < 9; k++) { const a = Math.PI + (k / 8) * Math.PI, x = cx + Math.cos(a) * (dw / 2 + 2), y = base - dh + dw / 2 - 4 + Math.sin(a) * (dw / 2 + 2); p.dot(x, y, CRY[4]); g.dot(x, y, CRY[3]); }
    // Sternenlicht im Tor
    const rng = createRng(seed + 1);
    for (let i = 0; i < 14; i++) { const x = cx + rng.range(-dw / 2 + 2, dw / 2 - 2), y = rng.range(base - dh, base - 6); p.dot(x, y, '#e8f0ff'); g.dot(x, y, '#c8d8ff'); }
    // Trümmer
    for (const [x, y, r] of [[cx + 50, base - 2, 5], [cx + 62, base - 1, 3.5], [cx - 66, base - 1, 3]]) lump(p, x, y, r, r * 0.6, PEARL, { lo: 2, hi: 6 });
  }, { ax: cx, ay: base, b: true, extra: { boxes: [[-62, -24, -14, 1], [14, -24, 62, 1]] }, light: { dx: 0, dy: -18, radius: 70, color: [170, 190, 255], intensity: 0.7 } });
}

// Tor der Gläsernen Hallen (Singende Grate): Bogen aus gewachsenem Kristall, innen tiefes Blau
function glassGate() {
  const W = 72, H = 78, cx = 36, base = H - 3;
  return mk(W, H, (p, g) => {
    footShade(p, cx, base, 32, 3);
    // Öffnung
    p.scan(cx - 14, 20, cx + 14, base - 1, (x, y) => (y < 34 && Math.hypot(x - cx, y - 34) > 14 ? 0 : col32(y > base - 6 ? '#1e3c5a' : '#0c1a2e')));
    g.each(cx - 12, 30, cx + 12, base - 2, (x, y) => (hash2(Math.floor(x * 2), Math.floor(y * 2), 3501) < 0.03 ? CRY[3] : null));
    // Kristallpfeiler und Bogen aus Prismen
    for (const s of [-1, 1]) {
      prism(p, g, cx + s * 20, base, cx + s * 18, 18, 6);
      prism(p, g, cx + s * 28, base, cx + s * 31, 34, 4);
      prism(p, g, cx + s * 13, base, cx + s * 12, 46, 3, LILAC);
    }
    prism(p, g, cx, 26, cx, 2, 6);
    for (const s of [-1, 1]) prism(p, g, cx + s * 8, 26, cx + s * 11, 8, 4);
  }, { ax: cx, ay: base, b: true, extra: { boxes: [[-34, -8, -14, 1], [14, -8, 34, 1]] }, light: { dx: 0, dy: -36, radius: 100, color: CRY_LIGHT, intensity: 0.8 } });
}

// Messinglinse auf dem Dreibein (Sternwartenberg)
export function lensStand() {
  const W = 26, H = 40, cx = 13, base = H - 2;
  return mk(W, H, (p, g) => {
    for (const dx of [-8, 0, 8]) p.fline(cx, 14, cx + dx, base, dx < 0 ? BRASS[3] : BRASS[2], 0.8);
    p.oval(cx, 10, 7, 7, BRASS[2]); p.oval(cx, 10, 5.6, 5.6, CRY[2]);
    p.oval(cx - 1.5, 8.5, 2.4, 2.4, CRY[4]); p.dot(cx - 2.5, 7.5, CRY[5]);
    g.oval(cx, 10, 5, 5, CRY[3]);
  }, { ax: cx, ay: base, b: true, box: [-6, -3, 6, 1], light: { dx: 0, dy: -30, radius: 44, color: CRY_LIGHT, intensity: 0.5 } });
}

export function createShardDecor() {
  return {
    glassTrees: [0, 1, 2].map(glassTree),
    shardRocks: [0, 1, 2].map(shardRock),
    singingSpires: [0, 1].map(singingSpire),
    mirrorStones: [0, 1].map(mirrorStone),
    prospectorTents: [0, 1].map(prospectorTent),
    mineCart: mineCart(),
    oreHeaps: [0, 1].map(oreHeap),
    crateStack: crateStack(),
    derrick: derrick(),
    shardCampfire: campfire(),
    observatory: observatory(),
    glassGate: glassGate(),
    lensStand: lensStand(),
  };
}

// Deko-Satz der Splitterweiten (level.decorSet 'decor_shards')
export function createShardSet() { return { ...createAstralNature(), ...createShardDecor() }; }
