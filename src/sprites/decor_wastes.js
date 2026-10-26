import { PAL } from '../gfx/Palette.js';
import { createRng, hash2 } from '../core/math.js';
import { OUT, groundPixel, vnoise } from './outdoor.js';
import { mk, poly, drawTent, fpoly, shade, stepOf, lump, trunk, pal32, groundPatch, emberCrack as emberCrackF } from './decor_ashwood.js';
import { createFlameFrames } from './props.js';

// Glutöde: verbrannte Ebene unter Glutregen, schwarze Asche und Obsidian;
// die letzte Bastion der Lebenden und das Tor zum Aschethron.
// Licht von links oben; alles Glühende zusätzlich auf der Glow-Ebene
// ((W+2)×(H+2), 1 px Versatz wegen des Umriss-Rands).

// Bodenpalette (Format wie BIOME_GROUND in sprites/outdoor.js):
// grass = heller Aschesand, dirt = Ocker/verbrannte Erde (Wege), water = Lava.
export const GROUND_WASTES = {
  // Runde 5/2: Asche-Ocker – heller Aschesand (grass), Ocker und verbrannte Erde (dirt), Lava als Akzent
  grass: ['#2e261f', '#3a3027', '#473b30', '#544639', '#625243', '#725f4d'],
  dirt: ['#2a1a10', '#372214', '#472c18', '#58371c', '#6a4321', '#7e5028'],
  water: ['#340c04', '#742008', '#c4400c', '#f07a1c', '#ffbe48'],
  lava: true,
  tufts: false,
  pixel: wastesPixel,
};

// Pflasterränder (Runde 6): Pflaster endet nicht an der Kachelkante, sondern Stein für Stein.
// Je Pflasterstein (6 × 5 px, wie groundPixel) entscheidet ein weiches Feld (bilinear über die
// Kachelmitten + Rauschen), ob er liegt: Ränder fransen aus, Einzelsteine liegen davor,
// Löcher werden rund. Die Kachelraster-Auswertung je Level einmal (WeakMap).
const PAVE = new WeakMap();
const PK = { ',': 1, '.': 2, ':': 3 };
const PTERR = new Set([',', '.', ':', '#', '~', '=']);
let paveLast = null, paveLastInfo = null;
function paveInfo(level) {
  if (level === paveLast) return paveLastInfo;
  let c = PAVE.get(level);
  if (c) { paveLast = level; paveLastInfo = c; return c; }
  const R = level.map, H = R.length, W = R[0].length, n = W * H;
  const k = new Uint8Array(n);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const ch = R[y][x]; k[y * W + x] = PK[ch] ?? (PTERR.has(ch) ? 0 : 255); }
  const K = Uint8Array.from(k);
  // Deko/Mauern: häufigster Boden der Nachbarn (wie TileMap)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (k[y * W + x] !== 255) continue;
    const cnt = [0, 0, 0, 0];
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const xx = x + i, yy = y + j; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const v = k[yy * W + xx]; if (v >= 1 && v <= 3) cnt[v]++; }
    K[y * W + x] = cnt[3] > cnt[1] && cnt[3] > cnt[2] ? 3 : cnt[2] > cnt[1] ? 2 : 1;
  }
  const pav = new Uint8Array(n), near = new Uint8Array(n), base = new Uint8Array(n);
  for (let i = 0; i < n; i++) pav[i] = K[i] === 3 ? 1 : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let a = 0, c1 = 0, c2 = 0;
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
      const xx = x + i, yy = y + j; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const v = K[yy * W + xx];
      if (v === 3 && Math.abs(i) <= 1 && Math.abs(j) <= 1) a = 1;
      if (v === 1) c1++; else if (v === 2) c2++;
    }
    near[y * W + x] = a;
    base[y * W + x] = K[y * W + x] === 1 || K[y * W + x] === 2 ? K[y * W + x] : c2 > c1 ? 2 : 1;
  }
  c = { W, H, pav, near, base, sc: 1e9, sr: 1e9, sv: 0 };
  PAVE.set(level, c);
  paveLast = level; paveLastInfo = c;
  return c;
}
// Pflasterstein wie groundPixel(':'), aber ohne das dort ungenutzte Bodenrauschen (spart zwei vnoise je Pixel)
const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const P_MORTAR = hexRgb(PAL.mortar), P_STONE = PAL.stone.map(hexRgb);
function paveStone(px, py) {
  const row = Math.floor(py / 5);
  const col = Math.floor((px + (row % 2) * 3) / 6);
  const lx = (px + (row % 2) * 3) % 6, ly = py % 5;
  if (lx === 0 || ly === 0) return P_MORTAR;
  const s = hash2(col, row, 16);
  let i = s < 0.3 ? 2 : s < 0.8 ? 3 : 4;
  if (ly === 1 && lx > 0) i = Math.min(5, i + 1);
  if (ly === 4 || lx === 5) i = Math.max(1, i - 1);
  if (hash2(px, py, 13) < 0.04) i = 1;
  return P_STONE[i];
}
function paveField(P, sx, sy) {
  const fx = sx / 16 - 0.5, fy = sy / 16 - 0.5, tx = Math.floor(fx), ty = Math.floor(fy), ax = fx - tx, ay = fy - ty;
  const W = P.W, A = P.pav;
  if (tx < 0 || ty < 0 || tx + 1 >= W || ty + 1 >= P.H) return 0;
  const k = ty * W + tx;
  return (A[k] * (1 - ax) + A[k + 1] * ax) * (1 - ay) + (A[k + W] * (1 - ax) + A[k + W + 1] * ax) * ay;
}
function wastesPixel(kind, px, py, level) {
  if (kind !== ',' && kind !== '.' && kind !== ':') return groundPixel(kind, px, py, GROUND_WASTES);
  const P = paveInfo(level), tx = px >> 4, ty = py >> 4;
  if (tx < 0 || ty < 0 || tx >= P.W || ty >= P.H || !P.near[ty * P.W + tx]) return kind === ':' ? paveStone(px, py) : groundPixel(kind, px, py, GROUND_WASTES);
  const row = Math.floor(py / 5), off = (row & 1) * 3, col = Math.floor((px + off) / 6);
  // Wert je Stein (die Chunks laufen zeilenweise: 6 Pixel nacheinander im selben Stein)
  let v;
  if (P.sc === col && P.sr === row) v = P.sv;
  else {
    const sx = col * 6 - off + 3, sy = row * 5 + 2.5, f = paveField(P, sx, sy);
    // Rand wellig (grob) und zerfranst (fein, je Stein)
    v = f >= 1 ? 9 : f + (vnoise(sx / 19, sy / 19, 431) - 0.5) * 0.75 + (vnoise(sx / 7, sy / 7, 434) - 0.5) * 0.35 + (hash2(col, row, 432) - 0.5) * 0.3;
    P.sc = col; P.sr = row; P.sv = v;
  }
  if (v === 9) return paveStone(px, py);
  const lx = (px + off) % 6, ly = py % 5;
  if (v > 0.5) {
    const c = paveStone(px, py);
    if (v >= 0.62) return c;
    // Randsteine: Ecken abgeschlagen, ausgebrochene Pixel, verrußt
    const corner = (lx === 1 || lx === 5) && (ly === 1 || ly === 4);
    if (!(corner || (lx !== 0 && ly !== 0 && hash2(px, py, 435) < 0.12))) return [c[0] * 0.8, c[1] * 0.76, c[2] * 0.74];
  } else if (v > 0.28 && hash2(col, row, 433) < 0.22 && lx >= 1 && lx <= 4 && ly >= 1 && ly <= 3 && !((lx === 1 || lx === 4) && (ly === 1 || ly === 3) && hash2(col, row, 436) < 0.6)) {
    // Einzelsteine vor dem Rand: kleiner, ohne Fugenraster, Schattenkante unten
    const c = paveStone(px, py);
    return ly === 3 ? [c[0] * 0.55, c[1] * 0.52, c[2] * 0.5] : [c[0] * 0.82, c[1] * 0.78, c[2] * 0.76];
  }
  const b = kind !== ':' ? kind : P.base[ty * P.W + tx] === 2 ? '.' : ',';
  return groundPixel(b, px, py, GROUND_WASTES);
}

const ASHB = ['#16110b', '#221a11', '#2f2518', '#3e3121', '#4f3f2b', '#634f37', '#7b6446'];
const CHAR = ['#0a0708', '#130e0f', '#1c1516', '#281e1f', '#352929', '#44363a'];
const OBS = ['#050306', '#0f0912', '#1c1020', '#2e1834', '#48264e', '#8a4a7c', '#f4c4e0'];
const BST = ['#19140f', '#271f19', '#362c24', '#473b30', '#5b4d3e', '#74634f', '#927e66'];
const SOOT = ['#0c0a0a', '#161212', '#201a19'];
const CANV = ['#1e1a17', '#2f2923', '#443b31', '#5a4e40', '#726350', '#8a7a62'];
const BONE = PAL.bone;
const EMB = PAL.ember, GOLD = PAL.gold, CRIM = PAL.crimson, IRON = PAL.steel, LEA = PAL.leather;
const WOOD = OUT.wood;
const clampI = (i, n) => Math.max(0, Math.min(n - 1, i));

// ------------------------------------------------------------ Helfer
function vnoiseLite(x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed), c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// ------------------------------------------------------------ Feinraster (Stufe B): Glut, Steinschnitt
// Alle Helfer prüfen p.fine: im Feinraster (DecoCanvas) zeichnen sie fein, sonst exakt wie früher in Weltpixeln.
const HOT = EMB[5];
// Glutfunke: heißer Feinpixel-Kern im farbigen Saum, Schein gestuft
function sparkF(f, g, x, y) {
  x = Math.floor(x * 2) / 2; y = Math.floor(y * 2) / 2;
  f.dot(x, y, EMB[4]); f.dot(x + 0.5, y, EMB[2]); f.dot(x, y + 0.5, EMB[2]);
  if (g) { g.dot(x, y, HOT); g.dot(x + 0.5, y, EMB[3]); g.dot(x, y + 0.5, EMB[3]); g.dot(x + 0.5, y + 0.5, EMB[2]); }
}

// Aschefleck mit einzelnen Glutfunken (Funken auch auf der Glow-Ebene)
function ashPatch(p, g, cx, cy, rx, ry, seed, sparks = 0.03) {
  if (p.fine) {
    groundPatch(p, cx + 0.5, cy + 0.5, rx + 0.5, ry + 0.5, seed, [ASHB[1], ASHB[2], ASHB[3]]);
    if (g) {
      const n = Math.round(Math.PI * rx * ry * sparks * 0.5);
      for (let i = 0; i < n; i++) {
        const a = hash2(i, 1, seed) * Math.PI * 2, r = 0.25 + 0.6 * hash2(i, 2, seed);
        sparkF(p, g, cx + 0.5 + Math.cos(a) * rx * r, cy + 0.5 + Math.sin(a) * ry * r);
      }
    }
    return;
  }
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
    const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
    if (d > 1) continue;
    const h = hash2(cx + x, cy + y, seed);
    if (d > 0.6 && h < 0.45) continue;
    p.px(cx + x, cy + y, h < 0.2 ? ASHB[3] : h < 0.7 ? ASHB[2] : ASHB[1]);
    if (g && h > 1 - sparks) { p.px(cx + x, cy + y, EMB[2]); g.px(cx + x, cy + y, EMB[3]); }
  }
}

// Glühender Riss (Zufallspfad); fein: Saum 1 Weltpixel, heißer Kern 1 Feinpixel (gleicher Pfad, gleiche Zufallsfolge)
function crack(p, g, rng, x, y, len, dir = 0) {
  let a = dir;
  for (let i = 0; i < len; i++) {
    const end = i === 0 || i === len - 1;
    const hot = !end && rng.chance(0.25);
    if (p.fine) {
      p.px(x, y, end ? EMB[1] : EMB[2]); g.px(x, y, end ? EMB[2] : EMB[3]);
      const cx = x + (i % 2 ? 0.5 : 0), cy = y + (i % 2 ? 0 : 0.5);
      p.dot(cx, cy, end ? EMB[3] : hot ? HOT : EMB[4]); g.dot(cx, cy, end ? EMB[4] : HOT);
    } else {
      p.px(x, y, end ? EMB[2] : EMB[3]); g.px(x, y, end ? EMB[3] : EMB[4]);
      if (hot) { p.px(x, y, EMB[4]); g.px(x, y, EMB[5]); }
    }
    a += rng.range(-0.8, 0.8);
    x += Math.round(Math.cos(a)); y += Math.round(Math.sin(a) * 0.7);
  }
}

// Feiner Steinschnitt eines Quaders. u, v = Lage im Quader (Weltpixel, von links/oben; die alte 1-px-Fuge liegt bei
// u < 1 bzw. v < 1). Fuge wird 0,5 px schmal + 0,5 px Kantenlicht, Unterkante/rechts 0,5 px Schatten, Abplatzungen an
// einer Ecke, selten ein Haarriss (nur in Quadern, die ganz im Bild liegen). Liefert den Rampenindex (1 = Fuge).
function cutK(u, v, bw, bh, k, hb, inner) {
  if (u < 0.5 || v < 0.5) return 1;
  if (hb < 0.2) { const d = (bw - u) + (v - 0.5); if (d < 1.5) return 1; if (d < 2) return k + 1; }
  else if (hb > 0.86) { const d = (u - 0.5) + (bh - v); if (d < 1.5) return 1; if (d < 2) return k - 1; }
  if (v < 1) return k + 2;
  if (u < 1) return k + 1;
  if (v >= bh - 0.5 || u >= bw - 0.5) return k - 1;
  if ((v >= bh - 1 || u >= bw - 1) && bh > 3) return k - (hb > 0.5 ? 1 : 0);
  if (inner && hb > 0.45 && hb < 0.58 && v < bh - 1) { const cx = 2 + (hb - 0.45) * 25 + (v - 1) * 0.55; if (Math.abs(u - cx) < 0.25) return k - 2; }
  return k;
}
const RST32 = () => (RST32.v ??= pal32(RST));
const ASHT32 = () => (ASHT32.v ??= pal32(ASHT));
const WARM32 = () => (WARM32.v ??= pal32(['#1e100c', '#2a140c', '#3c1c0e', '#552810']));
// Rußgrenze (Weltpixel über der Unterkante) als harte, wellige Linie statt Streupunkten
const sootAt = (x, soot, seed) => soot * (0.4 + 0.6 * vnoiseLite(x / 2.4, 0.5, seed));

// Mauerwerk aus Weltlagen (Fugenraster an der Unterkante ausgerichtet, wie brickK): Farbe (col32) für Feinpixel (x, y).
// o: bw, bh, base, soot, warm, W (Bildbreite für Haarrisse), top (Zeile unter der Krone → Schattenkante)
function brickFine(x, y, bottom, seed, o) {
  const bw = o.bw ?? 8, bh = o.bh ?? 4, P = o.pal ?? RST32();
  const X = Math.floor(x), Y = Math.floor(y), yb = bottom - Y;
  const row = Math.floor(yb / bh), off = (row % 2) * (bw >> 1);
  const lx = (((X + off) % bw) + bw) % bw, ly = ((yb % bh) + bh) % bh;
  const id = Math.floor((X + off + bw * 8) / bw), blk = hash2(id, row, seed);
  let k = (o.base ?? 3) + (blk < 0.25 ? -1 : blk < 0.82 ? 0 : 1);
  const x0 = X - lx, inner = x0 >= 0 && x0 + bw <= (o.W ?? 999);
  k = cutK(lx + (x - X), (bh - 1 - ly) + (y - Y), bw, bh, k, hash2(id, row, seed + 11), inner);
  if (o.top != null && y < o.top + 0.5) k -= 2;
  const ybc = bottom + 1 - y;
  if (o.soot) { const s = sootAt(x, o.soot, seed + 9); if (ybc < s * 0.55) k -= 2; else if (ybc < s) k -= 1; }
  if (o.warm && ybc < o.warm && k >= 1) {
    const W = WARM32();
    if (ly === 0 && y - Y >= 0.5) return W[ybc < 1 ? 3 : 2];       // Unterkante der Quader im Glutschein
    if (ybc < 1) return W[1];
  }
  return P[k < 0 ? 0 : k > P.length - 1 ? P.length - 1 : k];
}

// Quaderlagen (verrußt nach unten); clip(x, y) begrenzt die Fläche (fein und alt)
function courses(p, pal, x0, y0, w, h, seed, { bw = 8, bh = 5, soot = true, clip = null } = {}) {
  if (p.fine) {
    const P = pal32(pal);
    p.scan(x0, y0, x0 + w - 0.5, y0 + h - 0.5, (x, y) => {
      if (clip && !clip(x, y)) return 0;
      const X = Math.floor(x), Y = Math.floor(y);
      const row = Math.floor((Y - y0) / bh), off = (row % 2) * (bw >> 1);
      const lx = (X - x0 + off + bw * 4) % bw, ly = (Y - y0) % bh;
      const id = Math.floor((X - x0 + off + bw * 4) / bw), blk = hash2(id, row, seed);
      const bx = X - lx, inner = bx >= x0 && bx + bw <= x0 + w;
      let k = cutK(lx + x - X, ly + y - Y, bw, bh, blk < 0.42 ? 2 : blk < 0.85 ? 3 : 4, hash2(id, row, seed + 11), inner);
      if (soot) { const s = sootAt(x, 5, seed + 2), yb = y0 + h - y; if (yb < s) k -= 2; else if (yb < s + 0.5) k -= 1; }
      return P[clampI(k, P.length)];
    });
    return;
  }
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    if (clip && !clip(x, y)) continue;
    const row = Math.floor((y - y0) / bh), off = (row % 2) * (bw >> 1);
    const lx = (x - x0 + off + bw * 4) % bw, ly = (y - y0) % bh;
    const blk = hash2(Math.floor((x - x0 + off + bw * 4) / bw), row, seed);
    let k = blk < 0.3 ? 2 : blk < 0.8 ? 3 : 4;
    if (ly === 0 || lx === 0) k = 1;
    else if (ly === 1 || lx === 1) k += 1;
    else if (ly === bh - 1 || lx === bw - 1) k -= 1;
    if (hash2(x, y, seed + 1) < 0.05) k -= 1;
    if (soot && y > y0 + h - 6 && hash2(x, y, seed + 2) < (y - (y0 + h - 6)) / 6) k -= 2;
    p.px(x, y, pal[clampI(k, pal.length)]);
  }
}

// Flamme fein: Tropfenform, weißgelber Kern unten im orangeroten Saum, Spitze dunkelrot
function flameF(p, g, x, y, h, wide = 1) {
  const cx = x + 0.5, y0 = y + 1;
  p.each(cx - wide - 2, y0 - h - 0.5, cx + wide + 2, y0, (px, py) => {
    const t = (y0 - py) / h; if (t < 0 || t > 1) return null;
    const mx = cx + Math.sin(t * 5.2) * 0.7 * t, hw = (wide + 0.75) * Math.pow(1 - t, 0.75) * Math.min(1, 0.55 + t * 3);
    const d = Math.abs(px - mx) / Math.max(0.3, hw); if (d > 1) return null;
    const c = t > 0.78 ? EMB[2] : d > 0.7 ? EMB[3] : t < 0.42 && d < 0.45 ? HOT : EMB[4];
    g.dot(px, py, c === EMB[2] ? EMB[3] : c === EMB[3] ? EMB[4] : HOT);
    return c;
  });
}

// Kohlebecken mit Feuer auf Sprite + Glow
function flame(p, g, x, y, h, wide = 1) {
  if (p.fine) { flameF(p, g, x, y, h, wide); return; }
  for (let i = 0; i < h; i++) {
    const t = i / h, half = Math.max(0, Math.round((1 - t) * wide + (i < 2 ? 0.5 : 0)));
    const sway = Math.round(Math.sin(i * 0.9) * (t > 0.4 ? 1 : 0));
    for (let dx = -half; dx <= half; dx++) {
      const edge = Math.abs(dx) === half && half > 0;
      p.px(x + dx + sway, y - i, t > 0.75 ? EMB[2] : edge ? EMB[3] : t < 0.35 ? EMB[5] : EMB[4]);
      g.px(x + dx + sway, y - i, t > 0.75 ? EMB[3] : edge ? EMB[4] : EMB[5]);
    }
  }
}

function brazier(p, g, x, y) {
  p.rect(x - 4, y, 9, 3, IRON[2]); p.rect(x - 4, y, 9, 1, IRON[4]); p.rect(x + 3, y + 1, 2, 2, IRON[1]);
  p.rect(x - 1, y + 3, 3, 3, IRON[1]); p.rect(x - 3, y + 6, 7, 1, IRON[2]);
  p.rect(x - 3, y - 1, 7, 1, EMB[2]); g.rect(x - 3, y - 1, 7, 1, EMB[4]);
  if (p.fine) {
    // Eisenschale: Glanzlinie oben, Nieten, Glutbett mit heißen Kernen
    p.fline(x - 4, y, x + 4.5, y, IRON[5]); p.fline(x - 4, y + 2.5, x + 4.5, y + 2.5, IRON[1]);
    for (const nx of [-3, 0, 3]) { p.dot(nx + x + 0.5, y + 1, IRON[4]); p.dot(nx + x + 0.5, y + 1.5, IRON[0]); }
    for (let i = 0; i < 7; i++) { p.dot(x - 3 + i + (i % 2) * 0.5, y - 0.5, i % 3 === 1 ? HOT : EMB[3]); g.dot(x - 3 + i + (i % 2) * 0.5, y - 0.5, HOT); }
  }
  flame(p, g, x - 1, y - 1, 5, 1); flame(p, g, x + 1, y - 1, 7, 1);
}

// ------------------------------------------------------------ Verkohlte Ruinen
function charredRuin(v) {
  const rng = createRng(1010 + v);
  const W = [40, 36, 30][v], H = [40, 34, 22][v];
  return mk(W, H, (p, g) => {
    const bottom = H - 1;
    ashPatch(p, g, Math.floor(W / 2), bottom - 1, Math.floor(W / 2) - 1, 2, 1011 + v);
    if (v === 0) {
      // Mauerfragment mit Fensterbogen, gezackte Bruchkante
      const x0 = 3, x1 = 35;
      const topAt = (x) => Math.round(4 + Math.abs(Math.sin(x * 0.31)) * 5 + (x > 24 ? (x - 24) * 1.4 : 0) + hash2(x, 0, 1012) * 2);
      if (p.fine) {
        // verrußtes Mauerwerk mit feinem Steinschnitt, Bruchkante mit Kantenlicht, Rußfahne als dunklere Quaderlage
        const tF = (x) => { const X = Math.floor(x), a = topAt(X), b = topAt(x - X < 0.5 ? X - 1 : X + 1); return Math.abs(a - b) === 1 ? a + (b - a) * 0.5 : a; };
        const DIM = [BST[0], BST[1], BST[1], BST[2], BST[3], BST[4], BST[5]], SOOTP = [SOOT[0], SOOT[0], SOOT[1], SOOT[2], BST[1], BST[2], BST[3]];
        courses(p, DIM, x0, 0, x1 - x0 + 1, bottom - 1, 1013, { bw: 7, clip: (x, y) => y >= tF(x) });
        const wx = 14, wy = 14;
        courses(p, SOOTP, x0, 0, x1 - x0 + 1, bottom - 1, 1013, { bw: 7, soot: false, clip: (x, y) => y >= tF(x) && y < wy - 3 && Math.abs(x - wx - 0.5) < 3.6 - (wy - 4 - y) * 0.18 + 0.7 * Math.sin(y * 1.2 + x * 0.5) });
        p.each(x0, 0, x1 + 0.5, bottom, (x, y) => { const t = tF(x); return y >= t && y < t + 0.5 ? BST[6] : y >= t + 0.5 && y < t + 1 ? BST[4] : x < x0 + 1 && y >= t ? BST[5] : x >= x1 && y >= t && y < bottom - 1 ? BST[1] : x >= x1 - 0.5 && y >= t && y < bottom - 1 ? BST[2] : null; });
        // Fensterbogen: Keilsteinkranz, dunkle Öffnung, Glutbett mit heißem Kern
        archF(p, g, wx + 0.5, wy - 4, wy + 10, 4.5, 4.5, BST);
        p.each(wx - 5.5, wy - 5.5, wx + 6.5, wy + 0.5, (x, y) => { const d = Math.hypot(x - wx - 0.5, y - wy - 0.5); if (d < 4.6 || d > 5.8 || y > wy + 0.5) return null; const a = Math.atan2(y - wy - 0.5, x - wx - 0.5) * 2.6, f = a - Math.floor(a); return f < 0.15 ? BST[1] : d < 5.1 ? (x < wx ? BST[6] : BST[4]) : BST[5]; });
        for (let i = 0; i < 7; i++) { const x = rng.int(1, W - 4), y = bottom - rng.int(1, 3); block(p, x, y, 3, 2, BST, 3); }
      } else
      for (let x = x0; x <= x1; x++) {
        const t = topAt(x);
        const tmp = { px: (xx, yy, c) => { if (yy >= t) p.px(xx, yy, c); } };
        courses(tmp, BST, x, 0, 1, bottom - 1, 1013, { bw: 7 });
        p.px(x, t, BST[5]);
        if (x < x0 + 2) for (let y = t; y < bottom - 1; y++) p.px(x, y, BST[5]);
      }
      if (!p.fine) {
      // rechte Stirnseite (dunkel)
      for (let y = topAt(x1); y < bottom - 1; y++) { p.px(x1, y, BST[1]); p.px(x1 - 1, y, BST[2]); }
      // Fensterbogen
      const wx = 14, wy = 14;
      for (let y = wy - 4; y < wy + 10; y++) for (let x = wx - 4; x <= wx + 4; x++) {
        if (y < wy && ((x - wx) ** 2) / 16 + ((y - wy) ** 2) / 16 > 1) continue;
        p.px(x, y, '#08060a');
      }
      for (let x = wx - 4; x <= wx + 4; x++) p.px(x, wy + 10, BST[5]);
      for (let a = 0; a <= 8; a++) { const t = Math.PI + (a / 8) * Math.PI; p.px(Math.round(wx + Math.cos(t) * 5), Math.round(wy + Math.sin(t) * 5), BST[5]); }
      // Glut im Fenster (Innenraum brennt nach)
      p.rect(wx - 3, wy + 6, 7, 3, EMB[1]); p.rect(wx - 2, wy + 7, 5, 2, EMB[2]); g.rect(wx - 3, wy + 6, 7, 3, EMB[2]); g.rect(wx - 1, wy + 7, 3, 1, EMB[4]);
      // Rußfahnen über dem Fenster
      for (let y = wy - 12; y < wy - 4; y++) for (let x = wx - 3; x <= wx + 3; x++) if (hash2(x, y, 1014) < 0.55 - (wy - 4 - y) * 0.05 && y >= topAt(x)) p.px(x, y, SOOT[1]);
      // Schutt
      for (let i = 0; i < 7; i++) { const x = rng.int(1, W - 4), y = bottom - rng.int(1, 3); p.rect(x, y, 3, 2, BST[3]); p.px(x, y, BST[5]); p.px(x + 2, y + 1, BST[1]); }
      }
    } else if (v === 1) {
      // Hausecke mit verkohltem Balken und Türsturz
      courses(p, BST, 3, 8, 16, bottom - 9, 1015, { bw: 6 });
      for (let x = 3; x < 19; x++) { const t = 8 + Math.round(Math.abs(Math.sin(x * 0.5)) * 3); p.ctx.clearRect(x, 8, 1, t - 8); p.px(x, t, BST[5]); }
      // rechte Wand in die Tiefe (dunkler, kürzer)
      poly(p, [[19, 10], [30, 16], [30, bottom - 1], [19, bottom - 1]], (x, y) => ((x + (Math.floor(y / 5) % 2) * 3) % 6 === 0 || y % 5 === 0 ? BST[0] : BST[2]));
      p.line(19, 10, 30, 16, BST[3]);
      // Türöffnung
      p.rect(8, bottom - 14, 7, 13, '#08060a'); p.rect(7, bottom - 15, 9, 2, CHAR[3]); p.px(7, bottom - 15, CHAR[5]);
      // Schräg liegender Dachbalken, glimmend
      if (p.fine) {
        // Balken fein: Oberkante im Licht, Unterseite dunkel, Glutkerben mit heißem Kern
        p.fline(0.5, 4.5, 26.5, 12.5, CHAR[3], 1.5); p.fline(0.5, 5.5, 26.5, 13.5, CHAR[1], 0.5); p.fline(1, 3.5, 25.5, 11, CHAR[5]); p.fline(1, 4, 25.5, 11.5, CHAR[4]);
        for (let x = 4; x < 25; x += 5) { const y = 4 + (x / 26) * 8; p.fline(x, y, x + 2, y + 0.5, EMB[2], 1); p.fline(x + 0.5, y, x + 1.5, y + 0.5, EMB[4]); p.dot(x + 0.5, y, HOT); g.fline(x - 0.5, y, x + 2.5, y + 0.5, EMB[3], 1); g.fline(x + 0.5, y, x + 1.5, y + 0.5, HOT); }
        p.fline(26.5, 12.5, 33.5, bottom - 1.5, CHAR[2], 1); p.fline(27.5, 12.5, 34.5, bottom - 1.5, CHAR[4]); p.fline(26.5, 13, 33, bottom - 1.5, CHAR[1]);
      } else {
      p.line(0, 4, 26, 12, CHAR[3]); p.line(0, 5, 26, 13, CHAR[1]); p.line(1, 3, 25, 11, CHAR[5]);
      for (let x = 4; x < 25; x += 5) { const y = Math.round(4 + (x / 26) * 8); p.px(x, y, EMB[3]); g.px(x, y, EMB[4]); p.px(x + 1, y + 1, EMB[2]); g.px(x + 1, y + 1, EMB[3]); }
      p.line(26, 12, 33, bottom - 2, CHAR[2]); p.line(27, 12, 34, bottom - 2, CHAR[4]);
      }
      crack(p, g, rng, 22, bottom - 3, 4, 0);
    } else {
      // umgestürzte Säule mit Trommeln und Kapitell
      for (let i = 0; i < 3; i++) {
        const x = 3 + i * 8, y = bottom - 6 + (i === 1 ? 1 : 0);
        p.rect(x, y - 5, 8, 9, BST[3]); p.rect(x, y - 5, 8, 2, BST[5]); p.rect(x, y + 2, 8, 2, BST[1]);
        for (let k = 1; k < 8; k += 2) p.rect(x + k, y - 3, 1, 5, BST[2]);
        p.ellipse(x + 8, y - 0.5, 1.4, 4.5, BST[4]); p.px(x + 8, y - 3, BST[6]);
      }
      p.rect(0, bottom - 16, 10, 5, BST[4]); p.rect(0, bottom - 16, 10, 1, BST[6]); p.rect(1, bottom - 11, 8, 2, BST[2]);
      p.rect(24, bottom - 18, 5, 11, BST[3]); p.rect(24, bottom - 18, 1, 11, BST[5]);
      for (let i = 0; i < 5; i++) p.px(24 + i, bottom - 18 - [1, 2, 0, 1, 0][i], BST[4]);
      if (p.fine) {
        for (let i = 0; i < 3; i++) { const x = 3 + i * 8, y = bottom - 6 + (i === 1 ? 1 : 0); p.fline(x, y - 5, x + 7.5, y - 5, BST[6]); p.fline(x, y + 3.5, x + 7.5, y + 3.5, BST[0]); for (let k = 1; k < 8; k += 2) p.fline(x + k + 0.5, y - 3, x + k + 0.5, y + 1.5, BST[4]); p.dot(x + 8, y - 3.5, BST[6]); }
        p.fline(0, bottom - 16, 9.5, bottom - 16, BST[6]); p.fline(24, bottom - 18, 24, bottom - 7.5, BST[6]); p.fline(28.5, bottom - 17, 28.5, bottom - 7.5, BST[1]);
      }
      crack(p, g, rng, 11, bottom - 7, 5, 0.2);
    }
    // Ascheschleier am Fuß
    if (p.fine) p.scan(1, bottom - 1, W - 1.5, bottom - 0.5, (x, y) => { const n = vnoiseLite(x / 1.8, 0, 1016 + v); return n < 0.3 ? 0 : pal32(ASHB)[n > 0.6 && y < bottom - 0.5 ? 4 : n > 0.5 ? 3 : 2]; });
    else for (let x = 1; x < W - 1; x++) if (hash2(x, 1, 1016 + v) < 0.7) p.px(x, bottom - 1, ASHB[hash2(x, 2, 1016) < 0.5 ? 3 : 2]);
  }, { ax: Math.floor(W / 2), ay: H - 2, box: [-Math.floor(W / 2) + 3, -5, Math.floor(W / 2) - 3, 1], b: true });
}

// ------------------------------------------------------------ Obsidiansplitter
// Obsidiankeil fein: Lichtseite in zwei Facetten mit Glanzgrat, Schattenseite mit Facettenlinie und warmem Bodenreflex
const OBS_WARM = ['#3a1414', '#4e1c12'];
function shardF(p, g, x, tipY, hw, lean, base, { glint = 0.3, bright = 0, ember = 0, seed = 0 } = {}) {
  const tx = x + lean + 0.5, bx = x + 0.5, by = base + 1, L = x - hw, Rr = x + hw + 1, H = by - tipY;
  const warm = hash2(Math.round(x * 2), tipY, seed + 1039) < 0.35;
  fpoly(p, [[tx, tipY], [L, by], [Rr, by]], (px, py) => {
    const t = (py - tipY) / H, rx = tx + (bx - tx) * t;
    if (px < rx) {
      // Lichtseite: u = 0 am Grat, 1 an der linken Außenkante (dort Glanzkante)
      const lx = tx + (L - tx) * t, w = rx - lx, u = (rx - px) / Math.max(0.01, w);
      if (t < 0.12 + bright * 0.04) return OBS[u > 0.35 ? 6 : 5];
      if ((1 - u) * w < 0.5) return t < glint + 0.2 ? OBS[6] : OBS[5];
      if (u * w < 0.5) return OBS[3];
      if (Math.abs(u - 0.55) * w < 0.25 && t > 0.2) return OBS[5];
      return OBS[4 + (bright && t < 0.4 && u > 0.5 ? 1 : 0)];
    }
    // Schattenseite: dunkel, dunkelste Stufe an der rechten Schattenkante
    const rr = tx + (Rr - tx) * t, w = rr - rx, u = (px - rx) / Math.max(0.01, w);
    if ((1 - u) * w < 0.5) return OBS[0];
    if (warm && t > 0.9 && u > 0.25 && u < 0.8) return OBS_WARM[0];
    if (Math.abs(u - 0.4) * w < 0.25 && t > 0.25) return OBS[2];
    return OBS[1];
  });
  // Glanzpunkt auf der linken Kante, Spitzlicht
  const gy = tipY + H * glint, gx = tx + (L - tx) * glint + 0.5;
  p.dot(gx, gy, '#ffffff'); p.dot(gx, gy + 0.5, OBS[6]); p.dot(tx - 0.5, tipY + 0.5, OBS[6]);
  g.dot(gx, gy, '#7a3a6a'); g.dot(gx, gy + 0.5, '#4a2040');
  // Glutreflex nur bei einzelnen Spitzen, Lage gestreut: heißer Punkt im roten Saum
  if (ember) {
    const r = hash2(Math.round(x * 2), tipY, seed + 1038);
    const ex = x + 0.5 + Math.round((r * 1.6 - 0.3) * hw * 2) / 2, ey = base - 0.5 - Math.round(r * 7) / 2;
    p.dot(ex, ey, EMB[4]); p.dot(ex + 0.5, ey, EMB[2]); p.dot(ex, ey + 0.5, EMB[1]); g.dot(ex, ey, EMB[5]); g.dot(ex + 0.5, ey, EMB[2]);
  }
}
function obsidianShards(v) {
  const rng = createRng(1030 + v);
  const W = 28, H = [34, 26, 40][v];
  const shards = [
    [[14, 2, 4, 2], [7, 13, 3, -3], [21, 11, 3.5, 4], [11, 20, 2, 0]],
    [[10, 4, 4, -2], [19, 9, 3, 3], [5, 15, 2, -2], [23, 16, 2, 2]],
    [[15, 1, 4.5, -1], [7, 12, 3, -4], [22, 9, 3, 3], [12, 22, 2.5, 1]],
  ][v];
  return mk(W, H, (p, g) => {
    const base = H - 3;
    ashPatch(p, g, 14, H - 3, 12, 2, 1031 + v);
    const order = [...shards].sort((a, b) => a[1] - b[1]);
    if (p.fine) {
      for (const [x, tipY, hw, lean] of order) shardF(p, g, x, tipY, hw, lean, base, { seed: 1030 + v, ember: hash2(x, tipY, 1037 + v) < 0.3 });
      for (let i = 0; i < 5; i++) { const x = rng.int(3, 24); p.dot(x, H - 2, OBS[3]); p.dot(x + 0.5, H - 2, OBS[1]); p.dot(x, H - 2.5, OBS[5]); }
      return;
    }
    for (const [x, tipY, hw, lean] of order) {
      const tx = x + lean;
      poly(p, [[tx + 0.5, tipY], [x - hw, base + 1], [x + 0.5, base + 1]], (xx, yy) => {
        const k = (yy - tipY) / (base - tipY);
        return k < 0.15 ? OBS[5] : hash2(xx, yy, 1032) < 0.1 ? OBS[3] : OBS[4];
      });
      poly(p, [[tx + 0.5, tipY], [x + 0.5, base + 1], [x + hw + 1, base + 1]], (xx, yy) => {
        const k = (yy - tipY) / (base - tipY);
        // warmer Widerschein vom Boden (unten rötlich)
        return k > 0.75 && hash2(xx, yy, 1033) < 0.5 ? '#3a1414' : hash2(xx, yy, 1034) < 0.15 ? OBS[2] : OBS[1];
      });
      p.line(tx, tipY + 1, x, base, OBS[5]);
      // Glanzkante und Lichtpunkt
      const gy = tipY + Math.round((base - tipY) * 0.3), gx = Math.round(tx + (x - tx) * 0.3) - 1;
      p.px(gx, gy, OBS[6]); p.px(gx, gy + 1, OBS[5]); p.px(tx, tipY, OBS[6]);
      g.px(gx, gy, '#5a2a50'); g.px(tx, tipY, '#4a2040');
      // Glutreflex unten rechts
      p.px(x + Math.round(hw) - 1, base - 1, EMB[1]); g.px(x + Math.round(hw) - 1, base - 1, EMB[2]);
    }
    for (let i = 0; i < 5; i++) { const x = rng.int(3, 24); p.px(x, H - 2, OBS[3]); p.px(x, H - 3, OBS[5]); }
  }, { ax: 14, ay: H - 2, box: [-7, -3, 7, 1], b: true });
}

// ------------------------------------------------------------ Aschedünen
function ashDune(v) {
  const rng = createRng(1050 + v);
  const W = v ? 30 : 40, H = v ? 10 : 13;
  return mk(W, H, (p, g) => {
    const cx = W / 2 - 0.5, cy = H - 4;
    if (p.fine) {
      // Düne fein: gleiche Form, harte Lichtstufen, Windrippeln als feine Wellenlinien (Licht/Schatten), Glutfunken mit Kern
      const A = pal32(ASHB);
      p.scan(0, 0, W - 0.5, H - 1.5, (x, y) => {
        const nx = (x - 0.5 - cx) / (W / 2 - 1), ny = (y - 0.5 - cy) / (H / 2 - 0.5), hump = ny - 0.35 * nx;
        const d = nx * nx + (ny < 0 ? hump * hump * 1.2 : ny * ny * 3);
        if (d > 1) return 0;
        let k = 3;
        if (ny < -0.2 && nx < 0.2) k = 4;
        if (ny < -0.55 && nx < -0.1) k = 5;
        if (nx > 0.35) k = 2;
        if (d > 0.85 && ny > 0) k = 1;
        const w = Math.sin(x * 0.5 + y * 0.9) + Math.sin(x * 0.23) * 0.6;
        if (d < 0.8 && Math.abs(nx) < 0.75) { if (w > 1.25) k += 1; else if (w > 1.05) k -= 1; }
        return A[clampI(k, 7)];
      });
      for (let i = 0; i < 5; i++) { const x = rng.int(4, W - 5), y = rng.int(cy - 1, H - 3); p.dot(x, y + 0.5, EMB[1]); sparkF(p, g, x + 0.5, y); }
      if (v === 0) {
        p.fline(W - 11.5, H - 4.5, W - 6.5, H - 10.5, IRON[2], 1); p.fline(W - 12, H - 4.5, W - 7, H - 10.5, IRON[5]); p.fline(W - 10.5, H - 4.5, W - 5.5, H - 10.5, IRON[1]);
        p.fline(W - 14, H - 5, W - 10.5, H - 5, GOLD[3]); p.fline(W - 14, H - 4.5, W - 10.5, H - 4.5, GOLD[1]); p.dot(W - 14, H - 5, GOLD[4]);
        p.fline(W - 13, H - 3.5, W - 9, H - 3.5, ASHB[4]);
      }
      return;
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const nx = (x - cx) / (W / 2 - 1), ny = (y - cy) / (H / 2 - 0.5);
      const hump = ny - 0.35 * nx;
      const d = nx * nx + (ny < 0 ? hump * hump * 1.2 : ny * ny * 3);
      if (d > 1 || y > H - 2) continue;
      let k = 3;
      if (ny < -0.2 && nx < 0.2) k = 4;
      if (ny < -0.55 && nx < -0.1) k = 5;
      if (nx > 0.35) k = 2;
      if (d > 0.85 && ny > 0) k = 1;
      p.px(x, y, ASHB[k]);
    }
    // Windrippeln
    for (let r = 0; r < 3; r++) for (let x = 4 + r * 3; x < W - 6; x++) { const y = cy - 2 + r * 2 + Math.round(Math.sin(x * 0.5 + r) * 0.7); if (hash2(x, r, 1051 + v) < 0.55 && y >= 0) p.px(x, y, r === 0 ? ASHB[5] : ASHB[1]); }
    // Glutfunken in der Asche
    for (let i = 0; i < 5; i++) { const x = rng.int(4, W - 5), y = rng.int(cy - 1, H - 3); p.px(x, y, EMB[2]); g.px(x, y, EMB[3]); }
    // halb verschüttete Klinge
    if (v === 0) { p.line(W - 12, H - 5, W - 7, H - 11, IRON[3]); p.line(W - 11, H - 5, W - 6, H - 11, IRON[1]); p.rect(W - 14, H - 5, 4, 1, GOLD[1]); }
  }, { ax: Math.floor(W / 2), ay: H - 2, b: true });
}

// ------------------------------------------------------------ Glutgeysire
function emberGeyser(v) {
  const rng = createRng(1070 + v);
  const W = v ? 34 : 26, H = v ? 26 : 18;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = Math.floor(W / 2);
    const coneTop = v ? 8 : 7, rimHW = v ? 5 : 4, baseHW = v ? 15 : 11;
    if (p.fine) {
      // Schlackekegel: Licht von links in harten Stufen, Schichtbänder, Rinnsale mit heißem Kern, glühender Krater
      const C = pal32(CHAR), hwAt = (y) => rimHW + (baseHW - rimHW) * Math.max(0, (y - coneTop) / (bottom - 1 - coneTop)) ** 0.8 + 0.5;
      p.scan(cx - baseHW - 1, coneTop, cx + baseHW + 1.5, bottom - 0.5, (x, y) => {
        const hw = hwAt(y), rel = (x - cx - 0.5) / hw;
        if (Math.abs(rel) > 1) return 0;
        let k = rel < -0.55 ? 4 : rel < -0.05 ? 3 : rel < 0.5 ? 2 : 1;
        if (rel < -0.92) k = 5;
        const band = (y - coneTop + vnoiseLite(x / 2.5, 0, 1071 + v) * 2.5) % 3.5;
        if (band < 0.5 && rel > -0.85) k -= 1;
        if (y > bottom - 1.5) k -= 1;
        return C[clampI(k, 6)];
      });
      for (let s2 = -1; s2 <= 1; s2 += 2) {
        let x = cx + 0.5 + s2 * rimHW, y = coneTop + 1;
        const pts = [[x, y]];
        while (y < bottom - 2) { y++; if (hash2(Math.round(x), y, 1072) < 0.5) x += s2 * 0.75; pts.push([x, y]); }
        for (let i = 0; i + 1 < pts.length; i++) { const [a, b] = pts[i], [c, d] = pts[i + 1], t = i / pts.length; p.fline(a - 0.25, b, c - 0.25, d, t > 0.7 ? EMB[1] : EMB[2], 1); g.fline(a - 0.25, b, c - 0.25, d, EMB[2], 1); }
        for (let i = 0; i + 1 < pts.length * 0.75; i++) { const [a, b] = pts[i], [c, d] = pts[i + 1]; p.fline(a - 0.25, b, c - 0.25, d, i < 3 ? HOT : EMB[4]); g.fline(a - 0.25, b, c - 0.25, d, HOT); }
      }
      p.oval(cx + 0.5, coneTop + 0.5, rimHW + 1.5, 2.4, CHAR[3]); p.oval(cx + 0.2, coneTop + 0.2, rimHW + 1.2, 2, CHAR[5]);
      p.oval(cx + 0.5, coneTop + 0.6, rimHW, 1.5, EMB[2]); p.oval(cx + 0.5, coneTop + 0.7, rimHW - 1, 1, EMB[4]); p.oval(cx + 0.5, coneTop + 0.7, rimHW - 2.5, 0.6, HOT);
      g.oval(cx + 0.5, coneTop + 0.6, rimHW, 1.5, EMB[3]); g.oval(cx + 0.5, coneTop + 0.7, rimHW - 1, 1, HOT);
      // Glutfontäne (statisch, Partikel übernehmen die Bewegung)
      flameF(p, g, cx, coneTop, v ? 8 : 6, 0.6);
      for (let i = 0; i < 6; i++) { const x = cx + rng.int(-5, 5), y = rng.int(0, coneTop - 3); sparkF(p, g, x + 0.5, y + 0.5); }
      for (const [x, y] of [[2, bottom - 1], [W - 4, bottom], [5, bottom], [W - 7, bottom - 1]]) lump(p, x + 1, y + 1, 1.3, 1.1, CHAR, { lo: 1, hi: 5 });
      return;
    }
    // Kegel aus Schlacke
    for (let y = coneTop; y <= bottom - 1; y++) {
      const t = (y - coneTop) / (bottom - 1 - coneTop);
      const hw = rimHW + (baseHW - rimHW) * t ** 0.8;
      for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
        const rel = (x - cx) / hw;
        let k = rel < -0.5 ? 4 : rel < 0 ? 3 : rel < 0.5 ? 2 : 1;
        if (hash2(x, y, 1071 + v) < 0.12) k -= 1;
        if ((x + y * 2) % 7 === 0) k += 1;
        p.px(x, y, CHAR[clampI(k, 6)]);
      }
    }
    // Glühende Rinnsale am Kegel
    for (let s = -1; s <= 1; s += 2) {
      let x = cx + s * rimHW, y = coneTop + 1;
      while (y < bottom - 2) { p.px(x, y, EMB[3]); g.px(x, y, EMB[4]); y++; if (hash2(x, y, 1072) < 0.5) x += s; }
    }
    // Krater mit Glut
    p.ellipse(cx, coneTop, rimHW + 1, 2, CHAR[5]);
    p.ellipse(cx, coneTop, rimHW - 0.5, 1.2, EMB[3]); p.px(cx, coneTop, EMB[5]); p.px(cx - 1, coneTop, EMB[4]);
    g.ellipse(cx, coneTop, rimHW - 0.5, 1.2, EMB[4]); g.px(cx, coneTop, EMB[5]);
    // Glutfontäne (statisch, Partikel übernimmt die Bewegung)
    for (let i = 0; i < (v ? 7 : 5); i++) {
      const y = coneTop - 1 - i, x = cx + Math.round(Math.sin(i * 1.3) * (i > 2 ? 1 : 0));
      p.px(x, y, i < 2 ? EMB[5] : EMB[4]); g.px(x, y, EMB[5]);
      if (i < 3) { p.px(x - 1, y, EMB[3]); g.px(x - 1, y, EMB[4]); }
    }
    for (let i = 0; i < 6; i++) { const x = cx + rng.int(-5, 5), y = rng.int(0, coneTop - 3); g.px(x, y, EMB[3]); p.px(x, y, EMB[3]); }
    // Ascheflecken und Schlackebrocken am Fuß
    for (const [x, y] of [[2, bottom - 1], [W - 4, bottom], [5, bottom], [W - 7, bottom - 1]]) { p.rect(x, y, 2, 2, CHAR[3]); p.px(x, y, CHAR[5]); }
  }, {
    ax: Math.floor(W / 2), ay: H - 2, box: v ? [-10, -4, 10, 1] : [-7, -3, 7, 1],
    light: { dx: 0, dy: v ? -18 : -12, radius: v ? 70 : 54, color: [255, 120, 50], intensity: 0.8 },
    extra: { embers: { dx: 0, dy: v ? -20 : -12, rate: v ? 8 : 5 } }, b: true,
  });
}

// ------------------------------------------------------------ Verbrannte Bäume
function scorchedTree(v) {
  const rng = createRng(1090 + v);
  const W = 40, H = v ? 56 : 48;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 20, fine = p.fine;
    ashPatch(p, g, cx, bottom - 1, 12, 2, 1091 + v, 0.05);
    const tips = [];
    const segs = [];
    const branch = (x, y, a, len, th, depth) => {
      const steps = Math.ceil(len);
      let px = x, py = y, aa = a;
      for (let i = 0; i < steps; i++) {
        aa += rng.range(-0.18, 0.18);
        const nx = px + Math.cos(aa), ny = py + Math.sin(aa);
        if (fine) segs.push([px, py, nx, ny, th, i, Math.cos(aa)]);
        else {
          for (let k = 0; k < th; k++) p.px(Math.round(nx) + k, Math.round(ny), k === 0 ? CHAR[5] : k === th - 1 ? CHAR[1] : CHAR[3]);
          if (i % 3 === 1 && Math.cos(aa) < 0.3) p.px(Math.round(nx), Math.round(ny) - 1, ASHB[5]);
        }
        px = nx; py = ny;
      }
      if (depth <= 0 || len < 3) { tips.push([Math.round(px), Math.round(py)]); return; }
      const n = rng.int(2, 3);
      for (let k = 0; k < n; k++) branch(px, py, aa + rng.range(-0.8, 0.8), len * rng.range(0.5, 0.72), Math.max(1, th - 1), depth - 1);
    };
    const trunkTop = v ? 22 : 20;
    if (fine) {
      // Wurzeln: fein auslaufend, Oberseite im Licht
      p.fline(cx - 1.5, bottom - 1, cx - 8.5, bottom + 0.5, CHAR[3], 1); p.fline(cx - 2, bottom - 1.5, cx - 8, bottom, CHAR[5]);
      p.fline(cx + 2, bottom - 1, cx + 7.5, bottom + 0.5, CHAR[1], 1); p.fline(cx + 2, bottom - 1.5, cx + 7, bottom, CHAR[2]);
      p.fline(cx, bottom - 1, cx - 3.5, bottom + 0.5, CHAR[4]);
      // Stamm: Rinde mit Rillen, Lichtseite links; gespaltener Glutspalt im unteren Drittel
      const xm = (y) => cx + 0.5 + Math.sin(Math.floor(y) * 0.25 + v) * 1.2;
      const wm = (y) => 5 + 4 * Math.max(0, (y - trunkTop) / (bottom - trunkTop)) ** 1.3;
      trunk(p, trunkTop, bottom + 0.5, xm, wm, CHAR, 1092 + v, { lo: 1, hi: 4, groove: 1.3 });
      for (let y = trunkTop + 1; y < bottom - 1; y += 1.5) if (hash2(1, Math.floor(y * 2), 1093 + v) < 0.4) p.dot(xm(y) - wm(y) / 2 + 0.25, y, ASHB[5]);
      const pts = [];
      for (let y = bottom - 15; y < bottom - 2; y += 1) pts.push([xm(y) + 0.25 + (Math.floor(y) % 3 === 0 ? 0.5 : 0), y]);
      for (let i = 0; i + 1 < pts.length; i++) { p.fline(pts[i][0] - 0.5, pts[i][1], pts[i + 1][0] - 0.5, pts[i + 1][1], '#1a0806', 1); }
      for (let i = 0; i + 1 < pts.length; i++) { const [a1, b1] = pts[i], [a2, b2] = pts[i + 1]; p.fline(a1, b1, a2, b2, EMB[2]); p.fline(a1 - 0.5, b1 + 0.5, a2 - 0.5, b2, i % 4 === 1 ? HOT : EMB[4]); g.fline(a1 - 0.5, b1, a2, b2, EMB[3], 1); g.fline(a1 - 0.5, b1 + 0.5, a2 - 0.5, b2, HOT); }
    } else {
      // Wurzeln
      p.line(cx - 2, bottom - 1, cx - 8, bottom, CHAR[4]); p.line(cx + 2, bottom - 1, cx + 7, bottom, CHAR[1]); p.line(cx, bottom - 1, cx - 3, bottom, CHAR[3]);
      // gespaltener Stamm (zwei Hälften, dazwischen Glut)
      for (let y = trunkTop; y < bottom; y++) {
        const k = (y - trunkTop) / (bottom - trunkTop);
        const s = Math.round(Math.sin(y * 0.25 + v) * 1.2);
        const hw = 2 + k * 2;
        for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
          const rel = (x - (cx - hw)) / (2 * hw);
          let i = rel < 0.25 ? 5 : rel < 0.55 ? 3 : rel < 0.8 ? 2 : 1;
          if (hash2(x, y, 1092) < 0.1) i -= 1;
          p.px(x + s, y, CHAR[clampI(i, 6)]);
        }
        // Glutspalt im Stamm (unteres Drittel)
        if (y > bottom - 16 && y < bottom - 3) { const gx = cx + s + (y % 3 === 0 ? 1 : 0); p.px(gx, y, EMB[3]); g.px(gx, y, y % 2 ? EMB[4] : EMB[5]); }
      }
    }
    branch(cx, trunkTop + 1, -Math.PI / 2 + rng.range(-0.2, 0.2), v ? 14 : 12, 3, 3);
    branch(cx - 1, trunkTop + 6, -Math.PI / 2 - 0.9, 10, 2, 2);
    branch(cx + 1, trunkTop + 4, -Math.PI / 2 + 0.85, 11, 2, 2);
    if (fine) {
      // Äste fein: Stärke je Ordnung, dunkle Unterseite, Lichtkante oben links, Asche auf flachen Stücken
      const TH = [0, 0.5, 1, 2];
      for (const [x0, y0, x1, y1, th] of segs) p.fline(x0 + 0.5, y0 + 0.75, x1 + 0.5, y1 + 0.75, CHAR[1], TH[th]);
      for (const [x0, y0, x1, y1, th] of segs) p.fline(x0 + 0.5, y0 + 0.5, x1 + 0.5, y1 + 0.5, CHAR[th > 1 ? 3 : 2], TH[th]);
      for (const [x0, y0, x1, y1, th, i, c] of segs) {
        if (th > 1) p.fline(x0 + 0.25, y0 + 0.25 - th * 0.15, x1 + 0.25, y1 + 0.25 - th * 0.15, CHAR[5]);
        if (i % 3 === 1 && c < 0.3 && th > 1) p.dot(x1 + 0.25, y1 - 0.25 - th * 0.15, ASHB[5]);
      }
    }
    for (const [x, y] of tips) if (rng.chance(0.4)) { if (fine) { p.dot(x + 0.5, y + 0.5, EMB[2]); sparkF(p, g, x + 0.5, y); } else { p.px(x, y, EMB[3]); g.px(x, y, EMB[4]); } }
    // Knothöhle mit Glut
    if (fine) {
      p.oval(cx - 0.25, bottom - 7.5, 1.1, 1.6, '#1a0806'); p.dot(cx - 0.5, bottom - 8.5, CHAR[0]);
      p.dot(cx - 0.5, bottom - 7, EMB[3]); p.dot(cx, bottom - 6.5, EMB[2]); g.dot(cx - 0.5, bottom - 7, HOT); g.dot(cx, bottom - 6.5, EMB[3]);
      p.fline(cx - 1, bottom - 5.5, cx + 0.5, bottom - 5.5, CHAR[5]);
    } else { p.rect(cx - 1, bottom - 9, 2, 3, '#1a0806'); p.px(cx - 1, bottom - 8, EMB[2]); g.px(cx - 1, bottom - 8, EMB[3]); }
  }, { ax: 20, box: [-3, -3, 3, 1], extra: { embers: { dx: 0, dy: -10, rate: 0.6 } }, b: true });
}

// ------------------------------------------------------------ Bastionsmauer
function bastionWallH() {
  const W = 16, H = 38;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, faceTop = 11;
    // Wehrgang (Oberseite)
    for (let y = 5; y < faceTop; y++) for (let x = 0; x < 16; x++) p.px(x, y, (x + (y % 2) * 4) % 8 === 0 ? BST[2] : BST[y === 5 ? 3 : 4]);
    courses(p, BST, 0, faceTop, 16, bottom - faceTop + 1, 1101, { bw: 8 });
    // Zinnen mit Eisenkappen
    for (const x0 of [1, 9]) {
      courses(p, BST, x0, 2, 6, 9, 1102, { bw: 6, soot: false });
      p.rect(x0, 1, 6, 2, IRON[2]); p.rect(x0, 1, 6, 1, IRON[4]); p.rect(x0 + 5, 2, 1, 9, BST[1]);
    }
    p.rect(0, faceTop, 16, 1, BST[1]);
    // Goldenes Band (Zierfries)
    p.rect(0, faceTop + 2, 16, 1, GOLD[1]); for (let x = 1; x < 16; x += 4) p.px(x, faceTop + 2, GOLD[3]);
    // Brandspuren/Ruß von unten, Glutfunken am Fuß
    for (let x = 0; x < 16; x++) if (hash2(x, 9, 1103) < 0.6) p.px(x, bottom, ASHB[hash2(x, 8, 1103) < 0.5 ? 2 : 3]);
    p.px(5, bottom, EMB[2]); g.px(5, bottom, EMB[3]);
    // Schießscharte
    p.rect(12, 19, 1, 6, '#06050a'); p.px(11, 19, BST[1]);
    if (p.fine) {
      for (const x0 of [1, 9]) { p.fline(x0, 1, x0 + 5.5, 1, IRON[5]); p.dot(x0, 1.5, IRON[4]); p.fline(x0, 2.5, x0 + 5.5, 2.5, IRON[0]); p.dot(x0 + 1, 1.5, IRON[3]); p.dot(x0 + 4.5, 1.5, IRON[3]); }
      p.fline(0, faceTop + 2, 15.5, faceTop + 2, GOLD[2]); p.fline(0, faceTop + 2.5, 15.5, faceTop + 2.5, GOLD[0]);
      for (let x = 1; x < 16; x += 4) { p.dot(x, faceTop + 2, GOLD[4]); p.dot(x + 0.5, faceTop + 2.5, GOLD[1]); }
      p.fline(12.5, 19, 12.5, 24.5, BST[3]); p.fline(11.5, 25, 13.5, 25, BST[5]);
      p.px(5, bottom, EMB[1]); sparkF(p, g, 5, bottom);
    }
  }, { ax: 8, box: [-8, -4, 8, 1], b: true });
}

function bastionWallV() {
  const W = 12, H = 44;
  return mk(W, H, (p) => {
    const bottom = H - 1, faceH = 24, stripTop = bottom - 16 - faceH + 1;
    for (let y = stripTop; y < bottom - faceH + 1; y++) for (let x = 1; x < 11; x++) {
      let k = x < 3 ? 5 : x < 9 ? 4 : 2;
      if ((y + (x > 5 ? 3 : 0)) % 6 === 0) k = 2;
      p.px(x, y, BST[k]);
    }
    for (let y = stripTop; y < bottom - faceH - 1; y += 6) { p.rect(0, y - 3, 3, 4, BST[5]); p.rect(0, y - 3, 3, 1, IRON[4]); p.rect(0, y + 1, 3, 2, BST[3]); }
    courses(p, BST, 1, bottom - faceH + 1, 10, faceH, 1111, { bw: 5 });
    p.rect(1, bottom - faceH + 1, 10, 1, BST[1]);
    p.rect(1, bottom - faceH + 3, 10, 1, GOLD[1]);
    for (let x = 1; x < 11; x++) if (hash2(x, 3, 1112) < 0.6) p.px(x, bottom, ASHB[2]);
    if (p.fine) {
      for (let y = stripTop; y < bottom - faceH - 1; y += 6) { p.fline(0, y - 3, 2.5, y - 3, IRON[5]); p.fline(2.5, y - 2.5, 2.5, y, BST[2]); }
      p.fline(1, bottom - faceH + 3, 10.5, bottom - faceH + 3, GOLD[2]); p.fline(1, bottom - faceH + 3.5, 10.5, bottom - faceH + 3.5, GOLD[0]);
      for (let x = 2; x < 11; x += 4) p.dot(x, bottom - faceH + 3, GOLD[4]);
    }
  }, { ax: 6, box: [-5, -16, 5, 1], b: true });
}

// Banner fein (über die alte Bahn gelegt): Faltengrate mit Licht links, Rillen, Goldkante mit Glanz, Glutfunke im Emblem
function bannerFine(p, g, bx, by, w, h, s0 = 0, s1 = 0) {
  for (let f = bx + 2, i = 0; f < bx + w - 1; f += 2.5, i++) for (const [a, b] of s1 ? [[by + 1.5, s0 - 0.5], [s1, by + h - 1]] : [[by + 1.5, by + h - 1]]) { if (i === 0) p.fline(f - 0.5, a + 1, f - 0.5, b - 1, CRIM[4]); p.fline(f, a + 0.5, f, b + 0.5, CRIM[1]); }
  p.fline(bx, by, bx + w - 0.5, by, GOLD[4]); p.fline(bx, by + 0.5, bx + w - 0.5, by + 0.5, GOLD[1]);
  p.fline(bx + w - 0.5, by + 1, bx + w - 0.5, by + h - 0.5, CRIM[0]);
}

// ------------------------------------------------------------ Bastionstor
function bastionGate() {
  const W = 68, H = 60;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 34;
    courses(p, BST, 4, 16, 60, bottom - 15, 1121);
    p.rect(4, 12, 60, 4, BST[4]); p.rect(4, 12, 60, 1, BST[5]); p.rect(4, 15, 60, 1, BST[1]);
    for (let x = 4; x < 64; x += 7) { courses(p, BST, x, 4, 5, 9, 1122, { bw: 5, soot: false }); p.rect(x, 3, 5, 2, IRON[2]); p.rect(x, 3, 5, 1, IRON[4]); p.rect(x + 4, 5, 1, 7, BST[1]); }
    // Pfeiler
    for (const x0 of [0, 54]) {
      courses(p, BST, x0, 14, 14, bottom - 13, 1123);
      p.rect(x0, 12, 14, 3, BST[5]); p.rect(x0, 12, 14, 1, BST[6]); p.rect(x0 + 13, 14, 1, bottom - 13, BST[1]); p.rect(x0, 14, 1, bottom - 13, BST[5]);
      // Kohlebecken obenauf
      brazier(p, g, x0 + 7, 6);
    }
    // Torbogen (spitz)
    const ox0 = 17, ox1 = 50, otop = 24;
    const inArch = (x, y) => { if (y >= otop) return x >= ox0 && x <= ox1; const t = Math.abs(x - cx) / ((ox1 - ox0) / 2 + 0.5); return y >= otop - (1 - t) * 11 - (1 - t * t) * 0 && t <= 1; };
    const gateBot = bottom - 12;
    if (p.fine) {
      // Spitzbogen fein: glatte Laibung, Keilsteinkranz mit Fugen, Fallgatter mit Glanzkanten, gestufter Glutschein aus dem Hof
      const cc = cx + 0.5, inA = (x, y, e = 0) => { const d = Math.abs(x - cc); if (d >= 17 + e) return false; return y >= otop - e || y >= otop - e - (1 - d / (17.5 + e)) * (11 + e * 0.6); };
      p.each(ox0 - 2, otop - 15, ox1 + 3, bottom + 0.5, (x, y) => {
        if (inA(x, y)) {
          const d = bottom + 1 - y;
          if (y > gateBot + 1.5) { if (d < 4) g.dot(x, y, d < 1.5 ? EMB[2] : EMB[1]); return d < 1 ? '#4a220c' : d < 2.5 ? '#3a1a0a' : d < 5 ? '#2a1408' : '#170a06'; }
          const bx = (x - ox0 - 1) % 3, by = (y - otop + 4) % 5;
          if (y >= otop - 8 && bx >= 0 && bx < 1 && x < ox1) return bx < 0.5 ? IRON[3] : IRON[1];
          if (y >= otop - 4 && by >= 0 && by < 1 && x > ox0 + 1 && x < ox1) return by < 0.5 ? IRON[3] : IRON[1];
          if (y > gateBot + 1 && y <= gateBot + 1.5 && bx < 1) return IRON[4];
          if (!inA(x - 0.5, y)) return BST[1];
          return '#07050a';
        }
        if (y > otop + 1 || !inA(x, y, 2.2)) return null;
        const a = Math.atan2(y - otop - 3, x - cc), f = a * 4.2 - Math.floor(a * 4.2);
        if (f < 0.12) return BST[1];
        if (!inA(x - 0.5, y - 0.5, 2.2)) return BST[6];
        if (f < 0.22) return x < cc ? BST[6] : BST[4];
        return x < cc ? BST[5] : BST[3];
      });
    }
    if (!p.fine) for (let y = otop - 12; y <= bottom; y++) for (let x = ox0; x <= ox1; x++) if (inArch(x, y)) p.px(x, y, '#07050a');
    // Keilsteine
    if (!p.fine) for (let x = ox0 - 1; x <= ox1 + 1; x++) for (let y = otop - 14; y < otop + 1; y++) {
      if (inArch(x, y)) continue;
      if (inArch(x, y + 2) || inArch(x - 2, y + 1) || inArch(x + 2, y + 1)) p.px(x, y, (x + y) % 5 === 0 ? BST[1] : x < cx ? BST[5] : BST[3]);
    }
    // Fallgatter halb herab
    if (!p.fine) for (let x = ox0 + 1; x < ox1; x += 3) { for (let y = otop - 8; y <= gateBot; y++) if (inArch(x, y)) p.px(x, y, IRON[1]); p.px(x, gateBot + 1, IRON[3]); }
    if (!p.fine) for (let y = otop - 4; y <= gateBot; y += 5) for (let x = ox0 + 1; x < ox1; x++) if (inArch(x, y)) p.px(x, y, IRON[2]);
    // Licht aus dem Hof unter dem Gatter
    if (!p.fine) for (let y = gateBot + 2; y <= bottom; y++) for (let x = ox0 + 1; x < ox1; x++) if ((x + y) % 2 === 0) { p.px(x, y, '#2a1408'); if (y > bottom - 5) g.px(x, y, EMB[1]); }
    // Wappenschild: Sonne über Flamme (die Bastion)
    p.rect(cx - 5, 14, 11, 7, CRIM[3]); p.rect(cx - 4, 21, 9, 2, CRIM[2]); p.rect(cx - 2, 23, 5, 1, CRIM[1]);
    p.rect(cx - 5, 14, 11, 1, GOLD[3]);
    p.ellipse(cx, 17, 2, 2, GOLD[3]); p.px(cx, 17, GOLD[4]); for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [-2, -2], [2, -2]]) p.px(cx + dx, 17 + dy, GOLD[2]);
    g.px(cx, 17, GOLD[4]);
    // Banner an den Pfeilern
    for (const bx of [4, 57]) {
      p.rect(bx, 20, 7, 20, CRIM[3]); p.rect(bx, 20, 1, 20, CRIM[4]); p.rect(bx + 6, 20, 1, 20, CRIM[1]);
      p.px(bx + 1, 40, CRIM[3]); p.px(bx + 3, 41, CRIM[3]); p.px(bx + 5, 40, CRIM[2]);
      p.rect(bx, 20, 7, 1, GOLD[3]); p.rect(bx + 2, 26, 3, 5, GOLD[2]); p.px(bx + 3, 25, GOLD[4]); p.px(bx + 3, 27, EMB[4]);
      if (p.fine) { bannerFine(p, g, bx, 20, 7, 20, 25, 31); p.dot(bx + 2.5, 26, GOLD[4]); p.dot(bx + 3, 27, HOT); g.dot(bx + 3, 27, HOT); }
    }
    p.rect(ox0 - 1, bottom, ox1 - ox0 + 3, 1, BST[4]);
    if (p.fine) {
      p.fline(4, 12, 63.5, 12, BST[6]); p.fline(4, 15.5, 63.5, 15.5, BST[0]);
      for (let x = 4; x < 64; x += 7) { p.fline(x, 3, x + 4.5, 3, IRON[5]); p.fline(x, 4.5, x + 4.5, 4.5, IRON[1]); }
      for (const x0 of [0, 54]) { p.fline(x0, 12, x0 + 13.5, 12, BST[6]); p.fline(x0 + 0.5, 14, x0 + 0.5, bottom, BST[6]); }
      // Wappenschild: Sonne fein
      p.oval(cx + 0.5, 17.5, 2.2, 2.2, GOLD[2]); p.oval(cx + 0.2, 17.2, 1.5, 1.5, GOLD[3]); p.dot(cx - 0.5, 16.5, GOLD[4]); g.dot(cx, 17, GOLD[4]);
      p.fline(cx - 4.5, 14, cx + 5.5, 14, GOLD[4]); p.fline(cx - 5, 14.5, cx + 5.5, 14.5, GOLD[2]);
    }
  }, { b: true,
    ax: 34, light: { dx: 0, dy: -12, radius: 80, color: [255, 150, 70], intensity: 0.7 },
    extra: { boxes: [[-34, -6, -17, 1], [17, -6, 34, 1]], lights: [{ dx: -27, dy: -54, radius: 60, color: [255, 150, 70], intensity: 0.9 }, { dx: 27, dy: -54, radius: 60, color: [255, 150, 70], intensity: 0.9 }], door: { dx: 0, dy: -3 }, embers: { dx: 0, dy: -50, rate: 1 } },
  });
}

// ------------------------------------------------------------ Bastionsturm
function bastionTower() {
  const W = 40, H = 76;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, x0 = 5, x1 = 34, bodyTop = 20;
    ashPatch(p, g, 20, bottom - 1, 18, 2, 1131);
    courses(p, BST, x0 - 2, bottom - 9, x1 - x0 + 5, 10, 1132);
    courses(p, BST, x0, bodyTop, x1 - x0 + 1, bottom - 9 - bodyTop, 1133);
    p.rect(x0, bodyTop, 1, bottom - 9 - bodyTop, BST[5]);
    for (let y = bodyTop; y < bottom - 9; y++) { p.px(x1, y, BST[1]); p.px(x1 - 1, y, BST[2]); }
    // Auskragung mit Konsolen
    p.rect(x0 - 3, bodyTop - 4, x1 - x0 + 7, 4, BST[4]); p.rect(x0 - 3, bodyTop - 4, x1 - x0 + 7, 1, BST[6]); p.rect(x0 - 3, bodyTop - 1, x1 - x0 + 7, 1, BST[1]);
    p.rect(x0 - 3, bodyTop - 2, x1 - x0 + 7, 1, GOLD[1]);
    for (let x = x0 - 2; x < x1 + 3; x += 4) { p.rect(x, bodyTop, 2, 2, BST[3]); p.px(x, bodyTop + 2, BST[2]); }
    // Zinnen
    for (let x = x0 - 3; x < x1 + 4; x += 6) { courses(p, BST, x, 8, 4, 8, 1134, { bw: 4, soot: false }); p.rect(x, 7, 4, 2, IRON[2]); p.rect(x, 7, 4, 1, IRON[4]); p.rect(x + 3, 9, 1, 7, BST[1]); }
    // Signalfeuer auf dem Turm
    p.rect(14, 3, 12, 5, IRON[1]); p.rect(14, 3, 12, 1, IRON[3]); p.rect(15, 2, 10, 1, EMB[2]); g.rect(15, 2, 10, 1, EMB[4]);
    flame(p, g, 17, 2, 6, 1); flame(p, g, 20, 2, 9, 2); flame(p, g, 23, 2, 5, 1);
    // Schießscharten mit Glut
    for (const [x, y, lit] of [[18, 28, true], [11, 40, false], [26, 42, true]]) {
      p.rect(x, y, 2, 7, '#07050a'); p.rect(x - 1, y - 1, 4, 1, BST[5]); p.rect(x - 1, y + 7, 4, 1, BST[2]);
      if (lit) { p.px(x, y + 3, EMB[2]); p.px(x, y + 4, EMB[3]); g.px(x, y + 3, EMB[3]); g.px(x, y + 4, EMB[4]); }
    }
    // Tür mit Eisenbeschlag
    p.rect(15, bottom - 17, 10, 15, BST[1]); p.rect(16, bottom - 16, 8, 14, WOOD[1]); p.rect(16, bottom - 16, 8, 1, WOOD[3]);
    for (let x = 17; x < 24; x += 2) p.rect(x, bottom - 15, 1, 13, WOOD[0]);
    p.rect(16, bottom - 12, 8, 1, IRON[2]); p.rect(16, bottom - 6, 8, 1, IRON[2]); p.px(22, bottom - 9, GOLD[3]);
    // Banner
    p.rect(6, bodyTop + 3, 6, 17, CRIM[3]); p.rect(6, bodyTop + 3, 1, 17, CRIM[4]); p.rect(11, bodyTop + 3, 1, 17, CRIM[1]);
    p.rect(6, bodyTop + 3, 6, 1, GOLD[3]); p.px(8, bodyTop + 9, GOLD[4]); p.rect(7, bodyTop + 8, 4, 3, GOLD[2]); p.px(8, bodyTop + 9, GOLD[4]);
    p.px(6, bodyTop + 20, CRIM[2]); p.px(8, bodyTop + 21, CRIM[3]); p.px(10, bodyTop + 20, CRIM[2]);
    if (p.fine) {
      bannerFine(p, g, 6, bodyTop + 3, 6, 17, bodyTop + 8, bodyTop + 11); p.dot(7.5, bodyTop + 8.5, GOLD[4]);
      for (let x = x0 - 3; x < x1 + 4; x += 6) { p.fline(x, 7, x + 3.5, 7, IRON[5]); p.fline(x, 8.5, x + 3.5, 8.5, IRON[1]); }
      p.fline(x0 - 3, bodyTop - 4, x1 + 3.5, bodyTop - 4, BST[6]); p.fline(x0 - 3, bodyTop - 2, x1 + 3.5, bodyTop - 2, GOLD[2]);
      for (let x = x0 - 2; x < x1 + 3; x += 3) p.dot(x, bodyTop - 2, GOLD[4]);
      p.fline(x0 + 0.5, bodyTop, x0 + 0.5, bottom - 10, BST[6]);
      p.fline(14, 3, 25.5, 3, IRON[4]); p.fline(14, 7.5, 25.5, 7.5, IRON[0]);
      for (const [x, y, lit] of [[18, 28, true], [11, 40, false], [26, 42, true]]) { p.fline(x - 1, y - 1, x + 2.5, y - 1, BST[6]); p.fline(x + 1.5, y, x + 1.5, y + 6.5, BST[2]); if (lit) { p.dot(x + 0.5, y + 3.5, HOT); p.dot(x + 1, y + 4, EMB[4]); g.dot(x + 0.5, y + 3.5, HOT); g.dot(x + 1, y + 4, HOT); } }
      for (let x = 17; x < 24; x += 2) p.fline(x + 0.5, bottom - 15, x + 0.5, bottom - 2.5, WOOD[2]);
      for (const y of [bottom - 12, bottom - 6]) { p.fline(16, y, 23.5, y, IRON[4]); for (let x = 16.5; x < 24; x += 2.5) p.dot(x, y + 0.5, IRON[5]); }
      p.dot(22, bottom - 9, GOLD[4]); p.dot(22.5, bottom - 8.5, GOLD[1]);
    }
  }, { ax: 20, box: [-15, -6, 15, 1], b: true, light: { dx: 0, dy: -70, radius: 90, color: [255, 150, 70], intensity: 0.9 }, extra: { embers: { dx: 0, dy: -72, rate: 2 } } });
}

// ------------------------------------------------------------ Bastionszelt
function tent() {
  const W = 38, H = 30;
  return mk(W, H, (p, g) => {
    ashPatch(p, g, 19, H - 2, 17, 2, 1141);
    drawTent(p, g, { W, H, pal: CANV, band: CRIM, ragged: false, seed: 29 });
    const cx = 19;
    if (p.fine) {
      // Asche auf der Dachfläche als kurze Wehen, Brandloch mit glühendem Rand, Wimpel, Schild und Trog fein
      for (let i = 0; i < 13; i++) { const y = 5 + (i * 7) % 18 + 0.5, x = cx - 2 - ((y - 4) / 22) * 13 + (i * 5) % 7; p.fline(x, y, x + 1.5, y + 0.5, ASHB[5]); p.dot(x + 0.5, y + 0.5, ASHB[4]); }
      p.oval(cx + 9, 16, 1.2, 1.1, '#0b080a'); p.dot(cx + 10, 16.5, EMB[4]); p.dot(cx + 10, 15.5, EMB[2]); p.dot(cx + 8, 17, EMB[1]); g.dot(cx + 10, 16.5, HOT); g.dot(cx + 10, 15.5, EMB[3]);
      p.fline(cx + 0.5, 0.5, cx + 0.5, 4.5, IRON[3]); p.dot(cx, 0.5, IRON[5]); p.dot(cx + 0.5, 0, GOLD[4]);
      fpoly(p, [[cx + 1, 1], [cx + 7, 1.5], [cx + 5.5, 2.3], [cx + 7, 3], [cx + 1, 3]], (x, y) => (y < 1.5 ? CRIM[4] : y < 2.5 ? CRIM[3] : CRIM[2]));
      lump(p, cx + 13.5, H - 6.5, 3, 3.5, CRIM, { lo: 1, hi: 4 }); p.oval(cx + 13.5, H - 6.5, 1, 1, GOLD[2]); p.dot(cx + 13, H - 7, GOLD[4]);
      p.rect(cx - 17, H - 6, 7, 3, WOOD[2]); p.fline(cx - 17, H - 6, cx - 10.5, H - 6, WOOD[4]); p.fline(cx - 16, H - 5.5, cx - 11.5, H - 5.5, '#1a2a3a'); p.fline(cx - 15.5, H - 5.5, cx - 14.5, H - 5.5, '#4a7088');
      p.fline(cx - 17, H - 3.5, cx - 10.5, H - 3.5, WOOD[0]); p.fline(cx - 14, H - 5, cx - 14, H - 3.5, WOOD[1]);
      return;
    }
    // Aschestaub auf der Dachfläche (grau, gesprenkelt), Brandloch
    for (let i = 0; i < 26; i++) { const y = 5 + (i * 7) % 18, x = cx - 2 - Math.round(((y - 4) / 22) * 13) + (i * 5) % 7; p.px(x, y, ASHB[5]); }
    p.rect(cx + 8, 15, 2, 2, '#0b080a'); p.px(cx + 10, 16, EMB[2]); g.px(cx + 10, 16, EMB[3]);
    // Stange mit Wimpel
    p.line(cx, 0, cx, 4, IRON[3]); p.px(cx, 0, GOLD[4]);
    p.rect(cx + 1, 1, 5, 2, CRIM[3]); p.px(cx + 6, 1, CRIM[3]); p.px(cx + 1, 1, CRIM[4]); p.rect(cx + 2, 2, 4, 1, CRIM[2]);
    // Schildstapel und Wassertrog
    p.ellipse(cx + 13, H - 7, 3, 3.5, CRIM[2]); p.ellipse(cx + 12, H - 8, 2, 2.5, CRIM[3]); p.px(cx + 13, H - 7, GOLD[3]);
    p.rect(cx - 17, H - 6, 7, 3, WOOD[2]); p.rect(cx - 16, H - 6, 5, 1, '#1a2a3a'); p.px(cx - 15, H - 6, '#3a5a70');
  }, { ax: 19, box: [-14, -7, 14, 1], b: true });
}

// ------------------------------------------------------------ Bannerstange (Bastion)
function bannerPole() {
  const W = 18, H = 44;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, px0 = 3;
    p.ellipse(px0 + 1, bottom - 1, 4, 1.6, BST[2]); p.ellipse(px0, bottom - 2, 3, 1.2, BST[4]); p.px(px0 - 1, bottom - 2, BST[5]);
    p.rect(px0, 4, 2, bottom - 5, IRON[1]); p.rect(px0, 4, 1, bottom - 5, IRON[3]);
    // Spitze: kleine Feuerschale
    p.rect(px0 - 1, 2, 4, 2, GOLD[2]); p.px(px0 - 1, 2, GOLD[4]);
    p.px(px0, 1, EMB[4]); p.px(px0 + 1, 1, EMB[3]); p.px(px0, 0, EMB[5]);
    g.px(px0, 1, EMB[5]); g.px(px0 + 1, 1, EMB[4]); g.px(px0, 0, EMB[4]);
    p.rect(px0, 6, 13, 2, IRON[2]); p.rect(px0, 6, 13, 1, IRON[4]); p.px(px0 + 13, 6, GOLD[3]);
    const bx0 = px0 + 2, bx1 = px0 + 12, by0 = 8, by1 = 32;
    for (let x = bx0; x <= bx1; x++) {
      const fold = Math.sin((x - bx0) * 0.9);
      const tip = 3 - Math.min(3, Math.round(Math.abs(x - (bx0 + bx1) / 2)));
      const low = by1 + Math.round(fold) + tip - (x % 3 === 0 && x > bx0 + 2 ? 1 : 0); // angesengter Saum
      for (let y = by0; y <= low; y++) {
        let i = fold > 0.4 ? 4 : fold < -0.4 ? 2 : 3;
        if (x === bx0) i = 4;
        if (y === by0) i = 1;
        p.px(x, y, CRIM[i]);
      }
      p.px(x, low, x % 3 === 0 ? CHAR[3] : GOLD[x % 2 ? 2 : 3]);
    }
    // Emblem: Sonne über Flamme
    const ex = Math.round((bx0 + bx1) / 2), ey = 17;
    p.ellipse(ex, ey, 2.2, 2.2, GOLD[3]); p.px(ex - 1, ey - 1, GOLD[4]);
    for (const [dx, dy] of [[-4, 0], [4, 0], [0, -4], [-3, -3], [3, -3], [-3, 3], [3, 3]]) p.px(ex + dx, ey + dy, GOLD[2]);
    p.px(ex, ey + 5, GOLD[3]); p.px(ex - 1, ey + 6, GOLD[3]); p.px(ex + 1, ey + 6, GOLD[2]); p.px(ex, ey + 7, GOLD[3]); p.px(ex, ey + 8, GOLD[2]);
  }, {
    ax: 4, box: [-2, -2, 2, 1], light: { dx: 0, dy: -42, radius: 30, color: [255, 150, 70], intensity: 0.5 },
    // fein: Glanzlinie am Mast, heißer Kern in der Feuerschale, Goldglanz am Saum und an der Sonne
    fine: (f, g) => {
      f.fline(3, 4, 3, 41.5, IRON[4]); f.fline(4.5, 5, 4.5, 41.5, IRON[0]); f.fline(3, 6, 15.5, 6, IRON[5]);
      f.dot(3, 0.5, HOT); f.dot(3.5, 1, HOT); g.dot(3, 0.5, HOT); g.dot(3.5, 1, HOT); f.dot(2, 2, GOLD[4]); f.dot(16, 6, GOLD[4]);
      f.dot(9, 16, GOLD[4]); f.dot(9.5, 16.5, '#ffffff');
      for (let x = 5.5; x < 16; x += 2) f.dot(x, 8.5, CRIM[0]);
    },
  });
}

// ------------------------------------------------------------ Feldschmiede
function forge() {
  const W = 44, H = 32;
  return mk(W, H, (p, g) => {
    const bottom = H - 1;
    ashPatch(p, g, 22, bottom - 1, 20, 2, 1151);
    // Waffengestell hinten rechts
    p.rect(30, 6, 12, 2, WOOD[3]); p.rect(30, 6, 12, 1, WOOD[4]); p.line(31, 8, 31, bottom - 3, WOOD[2]); p.line(41, 8, 41, bottom - 3, WOOD[1]);
    for (const x of [33, 36, 39]) { p.line(x, 3, x, 16, IRON[3]); p.px(x, 2, IRON[5]); p.rect(x - 1, 16, 3, 1, GOLD[1]); p.rect(x, 17, 1, 3, LEA[2]); }
    // Blasebalg
    poly(p, [[1, 15], [8, 13], [8, 21], [1, 19]], (x, y) => (y < 16 ? LEA[3] : (y % 2 ? LEA[2] : LEA[1])));
    p.rect(0, 14, 2, 7, WOOD[3]); p.line(8, 17, 11, 17, IRON[2]);
    // Esse
    courses(p, BST, 10, 14, 17, bottom - 14, 1152, { bw: 6 });
    p.rect(9, 11, 19, 4, BST[4]); p.rect(9, 11, 19, 1, BST[6]); p.rect(9, 11, 1, 4, BST[5]);
    p.rect(11, 11, 15, 2, '#1a0806');
    for (let x = 11; x < 26; x++) { const h = hash2(x, 1, 1153); p.px(x, 11, h < 0.3 ? EMB[4] : h < 0.7 ? EMB[3] : EMB[2]); g.px(x, 11, h < 0.3 ? EMB[5] : EMB[4]); if (h < 0.5) { p.px(x, 12, EMB[2]); g.px(x, 12, EMB[3]); } }
    // Rauchfang
    p.rect(13, 2, 11, 3, BST[3]); p.rect(13, 2, 11, 1, BST[5]); p.rect(15, 5, 7, 1, BST[1]);
    p.line(12, 5, 11, 11, IRON[2]); p.line(25, 5, 26, 11, IRON[1]);
    // Glühende Klinge auf dem Amboss
    p.rect(26, 21, 7, 9, CHAR[3]); p.rect(26, 21, 2, 9, CHAR[5]);
    p.rect(24, 17, 11, 3, IRON[2]); p.rect(24, 17, 11, 1, IRON[4]); p.rect(22, 18, 2, 1, IRON[2]); p.rect(27, 20, 5, 1, IRON[1]); p.px(25, 17, IRON[5]);
    p.line(24, 16, 31, 16, EMB[4]); g.line(24, 16, 31, 16, EMB[5]); p.rect(32, 16, 3, 1, LEA[2]);
    p.line(22, 12, 26, 8, IRON[3]);
    // Löschtrog
    p.rect(2, 24, 8, 5, WOOD[2]); p.rect(2, 24, 1, 5, WOOD[4]); p.rect(3, 24, 6, 1, '#2a1a14'); p.px(5, 24, '#5a3a24');
    p.rect(14, 20, 9, 3, '#1a0806'); p.rect(15, 21, 7, 1, EMB[2]); g.rect(15, 21, 7, 1, EMB[3]);
  }, {
    ax: 22, box: [-12, -5, 20, 1], light: { dx: -4, dy: -18, radius: 90, color: [255, 140, 60], intensity: 1 }, extra: { embers: { dx: -4, dy: -22, rate: 3 } },
    // fein: Kohlebett mit heißen Kernen, weißglühende Klinge, Metallglanz an Waffen und Amboss
    fine: (f, g) => {
      for (let x = 11; x < 26; x++) { const h = hash2(x, 1, 1153); if (h < 0.3) { f.dot(x + 0.25, 11, HOT); g.dot(x + 0.25, 11, HOT); } else if (h < 0.7) f.dot(x + 0.5, 11, EMB[4]); }
      f.fline(24, 16, 31.5, 16, HOT); f.fline(25, 16.5, 31.5, 16.5, EMB[3]); g.fline(24, 16, 31.5, 16, HOT);
      for (const x of [33, 36, 39]) { f.fline(x, 3, x, 15.5, IRON[5]); f.dot(x, 2, '#ffffff'); f.dot(x + 0.5, 16, GOLD[3]); }
      f.fline(24, 17, 34.5, 17, IRON[5]); f.dot(25, 17, '#ffffff'); f.fline(13, 2, 23.5, 2, BST[6]);
      for (let x = 15.5; x < 22; x += 1.5) { f.dot(x, 21, HOT); g.dot(x, 21, HOT); }
      f.dot(5, 24.5, '#7a9ab0');
    },
  });
}

// ------------------------------------------------------------ Kisten
function crates(v) {
  const W = 26, H = 22;
  return mk(W, H, (p, g) => {
    const bottom = H - 1;
    const crate = (x, y, w, h, burnt) => {
      p.rect(x, y, w, h, WOOD[2]); p.rect(x, y, w, 2, WOOD[3]); p.rect(x, y, w, 1, WOOD[4]); p.rect(x, y, 1, h, WOOD[4]);
      p.rect(x + w - 1, y, 1, h, WOOD[1]); p.rect(x, y + h - 1, w, 1, WOOD[1]);
      p.line(x + 1, y + 3, x + w - 2, y + h - 2, WOOD[3]); p.line(x + 1, y + h - 2, x + w - 2, y + 3, WOOD[1]);
      p.px(x + 1, y + 2, IRON[3]); p.px(x + w - 2, y + 2, IRON[2]);
      if (burnt) for (let yy = y + h - 5; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (hash2(xx, yy, 1161) < (yy - (y + h - 5)) / 5) p.px(xx, yy, CHAR[2]);
    };
    if (v === 0) { crate(1, 9, 13, 12, true); crate(12, 11, 12, 10, false); crate(5, 0, 11, 10, false); p.px(3, 20, EMB[2]); g.px(3, 20, EMB[3]); }
    else if (v === 1) {
      // Fässer (Lampenöl) + Sack
      for (const [bx, by] of [[3, 4], [13, 7]]) {
        p.rect(bx, by, 11, bottom - by - 1, WOOD[2]); p.rect(bx, by, 3, bottom - by - 1, WOOD[3]); p.rect(bx + 9, by, 2, bottom - by - 1, WOOD[1]);
        for (const y of [by + 2, bottom - 4]) { p.rect(bx - 1, y, 13, 2, IRON[1]); p.rect(bx - 1, y, 13, 1, IRON[3]); }
        p.ellipse(bx + 5, by, 5.5, 1.8, WOOD[3]); p.ellipse(bx + 5, by, 4, 1, WOOD[1]); p.px(bx + 2, by - 1, WOOD[4]);
      }
      p.rect(6, 10, 5, 4, CRIM[2]); p.px(8, 11, GOLD[3]); // Warnzeichen
      p.ellipse(22, 18, 4, 3, '#4a3e2c'); p.px(21, 16, '#6a5a3e');
    } else {
      // Truhe mit Pfeilbündeln
      p.rect(3, 9, 20, 11, WOOD[2]); p.rect(3, 6, 20, 4, WOOD[3]); p.rect(3, 6, 20, 1, WOOD[4]);
      for (const x of [3, 12, 21]) { p.rect(x, 6, 2, 14, IRON[1]); p.px(x, 6, IRON[4]); }
      p.rect(12, 11, 2, 3, GOLD[2]); p.px(12, 11, GOLD[4]); p.rect(3, 19, 20, 1, WOOD[1]);
      for (let i = 0; i < 5; i++) { p.line(16 + i, 5, 17 + i, 0, WOOD[4]); p.px(17 + i, 0, CRIM[3]); }
      p.rect(15, 3, 7, 1, LEA[2]);
    }
    p.rect(0, bottom, W, 1, ASHB[2]);
  }, { ax: 13, box: [-10, -4, 10, 1] });
}

// ------------------------------------------------------------ Glutobelisk (Schrein)
function emberObelisk(on) {
  const W = 26, H = 50;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 13;
    ashPatch(p, g, cx, bottom - 1, 11, 2, 1171, on ? 0.08 : 0.02);
    if (p.fine) {
      // Sockel mit Kantenlicht, Obelisk aus Obsidian: Lichtfacette links, Grat, Goldkante, Glutrunen mit heißem Kern
      slabF(p, 2, bottom - 4, 22, 4, { top: BST[5], lip: BST[4], body: BST[3], bot: BST[1], right: BST[1], rw: 2, left: BST[4] });
      slabF(p, 5, bottom - 7, 16, 3, { top: BST[6], lip: BST[5], body: BST[4], bot: BST[2], right: BST[2], rw: 2, left: BST[5] });
      fpoly(p, [[8, bottom - 7], [10, 7], [13.5, 2], [17, 7], [19, bottom - 7]], (x, y) => {
        const mid = 13.5, half = y < 7 ? (y - 2) / 5 * 3.5 : 3.5 + (y - 7) / (bottom - 14) * 2;
        const u = (x - mid) / Math.max(0.5, half);
        if (u < -0.82) return OBS[5];
        if (u < -0.1) return y < 9 ? OBS[5] : OBS[4];
        if (u < 0.08) return OBS[5];
        return u > 0.8 ? OBS[0] : OBS[1];
      });
      p.fline(8, bottom - 8, 10, 7, GOLD[2]); p.fline(10, 7, 13.5, 2, GOLD[3]); p.dot(13.5, 1.5, GOLD[4]); p.dot(13, 2, GOLD[4]);
      p.fline(17, 7, 18.5, bottom - 8, GOLD[0]);
      p.dot(11, 8.5, '#ffffff'); p.dot(11, 9, OBS[6]); p.dot(11.5, 9.5, OBS[5]);
      const glyph = [[12, 12], [11, 13], [12, 14], [13, 15], [12, 20], [11, 21], [13, 21], [12, 22], [11, 27], [12, 28], [13, 27], [12, 29], [12, 34], [11, 35], [12, 36], [13, 37]];
      for (const [x, y] of glyph) {
        if (on) { p.px(x, y, EMB[3]); p.dot(x + 0.25, y + 0.25, HOT); p.dot(x + 0.75, y + 0.75, EMB[2]); g.px(x, y, EMB[4]); g.dot(x + 0.25, y + 0.25, HOT); }
        else { p.px(x, y, EMB[0]); if (y % 7 === 0) p.dot(x + 0.25, y + 0.25, EMB[2]); }
      }
      p.fline(7, bottom - 5, 8.5, bottom - 6.5, on ? EMB[3] : CHAR[1]); if (on) { p.dot(7.5, bottom - 5.5, HOT); g.fline(7, bottom - 5, 8.5, bottom - 6.5, EMB[4]); }
      if (on) {
        for (let a = 0; a < 32; a++) {
          const t = (a / 32) * Math.PI * 2, x = cx + 0.5 + Math.cos(t) * 9, y = 20.5 + Math.sin(t) * 2.5;
          if (Math.sin(t) < 0 && Math.abs(x - cx - 0.5) < 4) continue;
          if (a % 4 === 0) { p.dot(x, y, HOT); p.dot(x + 0.5, y, EMB[3]); g.dot(x, y, HOT); g.dot(x + 0.5, y, EMB[4]); } else if (a % 4 === 2) { p.dot(x, y, EMB[3]); g.dot(x, y, EMB[3]); }
        }
        g.dot(13.5, 1, HOT); g.dot(13.5, 0, EMB[4]); g.dot(12.5, 2, EMB[4]); g.dot(14.5, 2, EMB[4]);
        g.ctx.fillStyle = 'rgba(255,120,40,0.22)'; g.ctx.fillRect(5, bottom - 8, 16, 3);
      }
      return;
    }
    // Stufensockel
    p.rect(2, bottom - 4, 22, 4, BST[3]); p.rect(2, bottom - 4, 22, 1, BST[5]); p.rect(22, bottom - 3, 2, 3, BST[1]);
    p.rect(5, bottom - 7, 16, 3, BST[4]); p.rect(5, bottom - 7, 16, 1, BST[6]); p.rect(19, bottom - 6, 2, 2, BST[2]);
    // Obelisk (verjüngt) aus Obsidian mit Goldkanten
    poly(p, [[8, bottom - 7], [10, 7], [13, 2], [16, 7], [18, bottom - 7]], (x, y) => {
      const rel = (x - 8) / 10;
      let k = rel < 0.45 ? 4 : rel < 0.55 ? 3 : 1;
      if (hash2(x, y, 1172) < 0.05) k += 1;
      return OBS[k];
    });
    p.line(13, 2, 13, bottom - 8, OBS[5]);
    p.line(8, bottom - 8, 10, 7, GOLD[1]); p.line(10, 7, 13, 2, GOLD[2]); p.px(13, 1, GOLD[4]);
    p.px(11, 8, OBS[6]); p.px(11, 9, OBS[5]);
    // Glutrunen entlang der Mittelachse
    const R = on ? EMB[4] : EMB[0];
    const glyph = [[12, 12], [11, 13], [12, 14], [13, 15], [12, 20], [11, 21], [13, 21], [12, 22], [11, 27], [12, 28], [13, 27], [12, 29], [12, 34], [11, 35], [12, 36], [13, 37]];
    for (const [x, y] of glyph) { p.px(x, y, R); if (on) g.px(x, y, (x + y) % 2 ? EMB[5] : EMB[4]); }
    if (!on) for (const [x, y] of glyph) if (y % 7 === 0) p.px(x, y, EMB[1]);
    // Risse im Sockel
    p.px(7, bottom - 5, on ? EMB[3] : CHAR[1]); p.px(8, bottom - 6, on ? EMB[3] : CHAR[1]);
    if (on) {
      g.px(7, bottom - 5, EMB[4]); g.px(8, bottom - 6, EMB[4]);
      // schwebender Glutring + Krone
      for (let a = 0; a < 16; a++) {
        const t = (a / 16) * Math.PI * 2, x = Math.round(cx + Math.cos(t) * 9), y = Math.round(20 + Math.sin(t) * 2.5);
        if (Math.sin(t) < 0 && Math.abs(x - cx) < 4) continue;
        if (a % 2) { p.px(x, y, EMB[3]); g.px(x, y, EMB[4]); }
      }
      g.px(13, 1, EMB[5]); g.px(13, 0, EMB[4]); g.px(12, 2, EMB[4]); g.px(14, 2, EMB[4]);
      g.ctx.fillStyle = 'rgba(255,120,40,0.22)'; g.ctx.fillRect(5, bottom - 8, 16, 3);
    }
  }, {
    ax: 13, box: [-9, -4, 9, 1],
    light: on ? { dx: 0, dy: -26, radius: 90, color: [255, 130, 50], intensity: 1 } : undefined,
    extra: on ? { embers: { dx: 0, dy: -30, rate: 4 } } : undefined, b: true,
  });
}

// ------------------------------------------------------------ Tor zum Aschethron
function throneGate() {
  const W = 112, H = 92;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 56;
    const rng = createRng(1181);
    // Obsidianmassiv im Hintergrund, zerklüftete Oberkante
    const topAt = (x) => Math.round(8 + Math.abs(Math.sin(x * 0.07)) * 8 + Math.abs(x - cx) * 0.08 + hash2(x >> 2, 0, 1182) * 4);
    if (p.fine) {
      // Obsidianmassiv fein: schräge Facetten mit 1-Feinpixel-Glanzkante, dunkle Fuge, Oberkante im Licht
      const O = pal32(OBS);
      p.scan(0, 0, W - 0.5, bottom + 0.5, (x, y) => {
        const t = topAt(Math.floor(x)); if (y < t) return 0;
        const q = x - y * 0.5, facet = Math.floor(q / 9), lx = ((q % 9) + 9) % 9;
        let k = hash2(facet, Math.floor(y / 11), 1183) < 0.5 ? 2 : 1;
        if (lx < 0.5) k = 5; else if (lx < 1) k = 3; else if (lx > 8.5) k = 0;
        if (y < t + 0.5) k = 4; else if (y < t + 1) k = Math.max(k, 3);
        return O[k];
      });
    } else
    for (let x = 0; x < W; x++) for (let y = topAt(x); y <= bottom; y++) {
      const facet = Math.floor((x - y * 0.5) / 9);
      let k = hash2(facet, Math.floor(y / 11), 1183) < 0.5 ? 2 : 1;
      const lx = ((x - y * 0.5) % 9 + 9) % 9;
      if (lx < 1) k = 4; else if (lx > 7.5) k = 0;
      if (y === topAt(x)) k = 4;
      p.px(x, y, OBS[clampI(k, 7)]);
    }
    // Gewaltiger Rahmen: zwei Wächterstatuen (Aschekönige mit Schwertern) + Sturz
    const statue = (sx, dir) => {
      const top = 22;
      // Sockel
      courses(p, BST, sx - 10, bottom - 12, 21, 13, 1184 + sx, { bw: 7 });
      p.rect(sx - 11, bottom - 13, 23, 2, BST[5]); p.rect(sx - 11, bottom - 13, 23, 1, BST[6]);
      if (p.fine) {
        slabF(p, sx - 11, bottom - 13, 23, 2, { top: BST[6], body: BST[5], bot: BST[2], right: BST[3], rw: 2, left: BST[6] });
        statueBodyFine(p, g, sx, top - 2, bottom - 14, 1184 + sx, 'king');
        crack(p, g, rng, sx + dir * 4, top + 22, 6, 1.4);
        return;
      }
      // Mantel (Trapez)
      poly(p, [[sx - 4, top + 12], [sx + 5, top + 12], [sx + 9, bottom - 13], [sx - 8, bottom - 13]], (x, y) => {
        const rel = (x - (sx - 8)) / 17;
        let k = rel < 0.25 ? 5 : rel < 0.5 ? 4 : rel < 0.8 ? 3 : 2;
        if ((x - sx + 40) % 4 === 0 && y > top + 16) k -= 1; // Falten
        return BST[clampI(k, 7)];
      });
      // Schultern (breit, Schulterstücke) + behelmter Kopf mit Krone
      p.rect(sx - 9, top + 8, 19, 5, BST[4]); p.rect(sx - 9, top + 8, 19, 1, BST[6]); p.rect(sx + 7, top + 9, 3, 4, BST[2]);
      p.ellipse(sx - 7, top + 10, 3, 2.4, BST[5]); p.ellipse(sx + 7, top + 10, 3, 2.4, BST[3]); p.px(sx - 8, top + 9, BST[6]);
      p.rect(sx - 4, top - 1, 9, 10, BST[4]); p.rect(sx - 4, top - 1, 2, 10, BST[5]); p.rect(sx + 3, top, 2, 9, BST[2]);
      p.rect(sx - 4, top + 3, 9, 1, BST[1]); // Visierschlitz
      p.px(sx - 2, top + 3, EMB[3]); p.px(sx + 2, top + 3, EMB[3]); g.px(sx - 2, top + 3, EMB[4]); g.px(sx + 2, top + 3, EMB[4]);
      p.rect(sx - 3, top + 6, 7, 3, BST[3]); for (let x = sx - 3; x <= sx + 3; x += 2) p.px(x, top + 8, BST[2]); // Bart
      for (let i = 0; i < 9; i++) p.px(sx - 4 + i, top - 2 - (i % 2 ? 0 : 2), GOLD[i < 4 ? 3 : 2]);
      p.px(sx - 4, top - 4, GOLD[4]); p.px(sx, top - 4, GOLD[4]);
      p.rect(sx - 4, top - 2, 9, 1, GOLD[2]);
      // Schwert (Spitze nach unten), Hände auf dem Knauf
      p.rect(sx, top + 13, 2, 2, GOLD[3]);
      p.rect(sx - 3, top + 14, 3, 3, BST[5]); p.rect(sx + 2, top + 14, 3, 3, BST[3]); p.px(sx - 3, top + 14, BST[6]);
      p.rect(sx - 4, top + 17, 10, 1, GOLD[2]); p.px(sx - 4, top + 17, GOLD[4]); p.px(sx + 5, top + 17, GOLD[1]);
      for (let y = top + 18; y < bottom - 14; y++) { p.px(sx, y, IRON[4]); p.px(sx + 1, y, IRON[2]); }
      p.px(sx, bottom - 14, IRON[3]);
      // Glutrisse im Mantel
      crack(p, g, rng, sx + dir * 4, top + 22, 6, 1.4);
    };
    statue(16, -1); statue(W - 17, 1);
    // Portal: Spitzbogen mit gestufter Rahmung (Stein, Obsidian, Gold), darin das Tor
    const ptop = 18, spring = 40;
    const inside = (x, y, inset) => {
      const hw = 25 - inset, apex = ptop + inset * 1.3;
      if (y < apex) return false;
      if (y >= spring) return Math.abs(x - cx) <= hw;
      const t = (spring - y) / (spring - apex);
      return Math.abs(x - cx) <= hw * (1 - t ** 1.6) ** 0.9 + 0.3;
    };
    if (p.fine) {
      // Portal fein: Keilsteine mit Fugen und Kantenlicht, Obsidian- und Goldrahmung, Torflügel mit Goldbändern,
      // glühender Mittelspalt (heißer Kern im roten Saum)
      const c0 = cx + 0.5, ins = (x, y, i) => inside(x - 0.5, y - 0.5, i);
      p.each(cx - 27, ptop - 2, cx + 28, bottom + 0.5, (x, y) => {
        if (!ins(x, y, 0)) return null;
        if (!ins(x, y, 4)) {
          const a = Math.atan2(y - spring, x - c0) * 5 + (y > spring ? Math.floor(y / 6) * 0.999 : 0), f = a - Math.floor(a);
          if (y <= spring && f < 0.1) return BST[1];
          if (y > spring && (y % 6) < 0.5) return BST[1];
          let c = hash2(Math.floor(a), 0, 1185) < 0.5 ? BST[4] : BST[3];
          if (x < c0 && !ins(x - 0.5, y, 0)) c = BST[6];
          if (!ins(x, y - 0.5, 0)) c = BST[6];
          if (ins(x + 0.5, y + 0.5, 4)) c = BST[1];
          return c;
        }
        if (!ins(x, y, 7)) return !ins(x, y - 0.5, 4) || (x < c0 && !ins(x - 0.5, y, 4)) ? OBS[5] : x < c0 ? OBS[4] : OBS[2];
        if (!ins(x, y, 8)) { g.dot(x, y, GOLD[1]); return !ins(x, y - 0.5, 7) ? GOLD[4] : x < c0 ? GOLD[3] : GOLD[2]; }
        const dx = x - c0;
        if (Math.abs(dx) < 0.5) { g.dot(x, y, HOT); return HOT; }
        if (Math.abs(dx) < 1) { g.dot(x, y, EMB[4]); return EMB[3]; }
        if (Math.abs(dx) < 1.5) { g.dot(x, y, EMB[2]); return EMB[1]; }
        const leaf = x < c0 ? x - (cx - 17) : (cx + 17) - x, ly = (y - spring + 140) % 14;
        if (y > ptop + 14 && ly < 0.5) return x < c0 ? GOLD[3] : GOLD[2];
        if (y > ptop + 14 && ly < 1) return x < c0 ? GOLD[1] : GOLD[0];
        if (y > ptop + 14 && ly < 1.5) return OBS[1];
        if (Math.abs(leaf - 5.5) < 0.75 && Math.abs(ly - 7.25) < 0.75) return ly < 7 ? GOLD[4] : GOLD[2];
        let c = x < c0 ? (leaf < 2 ? OBS[4] : OBS[3]) : OBS[2];
        if (x < c0 && leaf < 0.5) c = OBS[5];
        if (vnoiseLite(x / 2.5, y / 4, 1186) > 0.7) c = x < c0 ? OBS[4] : OBS[1];
        return c;
      });
    } else
    for (let y = ptop - 2; y <= bottom; y++) for (let x = cx - 27; x <= cx + 27; x++) {
      if (!inside(x, y, 0)) continue;
      let c;
      if (!inside(x, y, 4)) {
        // Keilsteine
        const seg = Math.floor(Math.atan2(y - spring, x - cx) * 5) + (y > spring ? Math.floor(y / 6) : 0);
        c = hash2(seg, 0, 1185) < 0.5 ? BST[4] : BST[3];
        if (x < cx && !inside(x - 1, y, 0)) c = BST[6];
        if (!inside(x, y - 1, 0)) c = BST[5];
        if (inside(x + 1, y + 1, 4) && !inside(x, y, 4)) c = BST[1];
      } else if (!inside(x, y, 7)) c = x < cx ? OBS[4] : OBS[2];
      else if (!inside(x, y, 8)) { c = x < cx ? GOLD[3] : GOLD[2]; g.px(x, y, GOLD[1]); }
      else {
        // Torflügel
        const leaf = x < cx ? x - (cx - 17) : (cx + 17) - x;
        c = x < cx ? (leaf < 2 ? OBS[4] : OBS[3]) : OBS[2];
        if (hash2(x >> 1, y >> 2, 1186) < 0.12) c = OBS[x < cx ? 4 : 1];
        if ((y - spring) % 14 === 0 && y > ptop + 14) c = x < cx ? GOLD[2] : GOLD[1];
        if ((y - spring) % 14 === 1 && y > ptop + 14) c = OBS[1];
        if (leaf === 5 && (y - spring) % 14 === 7) { c = GOLD[3]; p.px(x, y - 1, GOLD[2]); }
        if (Math.abs(x - cx) === 1) { c = EMB[2]; g.px(x, y, EMB[3]); }
        if (x === cx) { c = EMB[4]; g.px(x, y, EMB[5]); }
      }
      p.px(x, y, c);
    }
    // Aschekönigsmaske am Scheitel des Tors
    const my = spring - 8;
    p.rect(cx - 4, my, 9, 7, GOLD[2]); p.rect(cx - 4, my, 9, 1, GOLD[4]); p.rect(cx - 3, my + 7, 7, 2, GOLD[1]);
    p.px(cx - 2, my + 3, '#0a0506'); p.px(cx + 2, my + 3, '#0a0506'); p.px(cx - 2, my + 3, EMB[4]); p.px(cx + 2, my + 3, EMB[4]);
    g.px(cx - 2, my + 3, EMB[5]); g.px(cx + 2, my + 3, EMB[5]);
    p.rect(cx - 1, my + 6, 3, 1, '#0a0506');
    const ix0 = cx - 17, ix1 = cx + 17, px0 = cx - 25, px1 = cx + 25;
    // Emblem: Aschekrone über dem Tor
    const ey = ptop - 5;
    p.rect(cx - 8, ey + 4, 17, 3, GOLD[2]); p.rect(cx - 8, ey + 4, 17, 1, GOLD[4]);
    for (let i = 0; i < 5; i++) { const x = cx - 8 + i * 4; p.rect(x, ey + (i % 2 ? 1 : -1), 1, 5 - (i % 2 ? 1 : -1), GOLD[3]); p.px(x, ey - (i % 2 ? -1 : 1) - 1, EMB[4]); g.px(x, ey - (i % 2 ? -1 : 1) - 1, EMB[5]); }
    g.rect(cx - 7, ey + 5, 15, 1, EMB[2]);
    // Glutrinnen am Fuß des Portals und Glutbecken vorn
    if (p.fine) {
      // Maske: Augen mit heißem Kern; Krone: Glanzkante; Glutrinne mit Kern; Becken fein; Ketten aus Gliedern
      p.fline(cx - 4, my + 0.5, cx + 4.5, my + 0.5, GOLD[3]); p.fline(cx + 4.5, my + 1, cx + 4.5, my + 6.5, GOLD[1]); p.fline(cx - 4, my + 1, cx - 4, my + 6.5, GOLD[3]);
      eyeF(p, g, cx - 2, my + 3); eyeF(p, g, cx + 2, my + 3); p.fline(cx, my + 4, cx, my + 5, GOLD[1]);
      p.fline(cx - 8, ey + 4, cx + 8.5, ey + 4, GOLD[4]); p.fline(cx - 8, ey + 6.5, cx + 8.5, ey + 6.5, GOLD[1]);
      for (let x = ix0; x <= ix1; x += 0.5) { const hot = Math.abs(x - cx) < 6; p.dot(x, bottom, EMB[2]); p.dot(x, bottom + 0.5, hot ? HOT : EMB[3]); g.dot(x, bottom + 0.5, hot ? HOT : EMB[3]); }
      for (const bx of [px0 - 2, px1 + 2]) {
        p.oval(bx + 0.5, bottom - 0.5, 4.2, 1.9, CHAR[1]); p.oval(bx + 0.3, bottom - 0.8, 4, 1.5, CHAR[3]); p.oval(bx + 0.5, bottom - 0.5, 2.8, 1.05, EMB[2]); p.oval(bx + 0.5, bottom - 0.5, 1.8, 0.6, EMB[4]); p.oval(bx + 0.5, bottom - 0.5, 0.9, 0.35, HOT);
        g.oval(bx + 0.5, bottom - 0.5, 2.8, 1.05, EMB[3]); g.oval(bx + 0.5, bottom - 0.5, 1.8, 0.6, HOT);
      }
      for (const [a, b] of [[[px0 + 2, spring - 6], [22, 34]], [[px1 - 2, spring - 6], [W - 23, 34]]]) {
        for (let t = 0, i = 0; t <= 1; t += 0.035, i++) { const x = a[0] + 0.5 + (b[0] - a[0]) * t, y = a[1] + 0.5 + (b[1] - a[1]) * t + Math.sin(t * Math.PI) * 5; if (i % 2) { p.dot(x, y, IRON[4]); p.dot(x, y + 0.5, IRON[1]); } else { p.dot(x - 0.5, y, IRON[3]); p.dot(x, y, IRON[2]); p.dot(x + 0.5, y, IRON[1]); } }
      }
      for (let i = 0; i < 10; i++) { const x = rng.int(2, W - 3), y = rng.int(20, bottom - 16); if (x > 5 && x < W - 5 && Math.abs(x - cx) < 40) continue; p.px(x, y, EMB[1]); sparkF(p, g, x, y); }
      return;
    }
    for (let x = ix0; x <= ix1; x++) { p.px(x, bottom, EMB[2]); g.px(x, bottom, Math.abs(x - cx) < 6 ? EMB[4] : EMB[2]); }
    for (const bx of [px0 - 2, px1 + 2]) {
      p.ellipse(bx, bottom - 1, 4, 1.8, CHAR[1]); p.ellipse(bx, bottom - 1, 2.8, 1, EMB[3]); p.px(bx, bottom - 1, EMB[5]);
      g.ellipse(bx, bottom - 1, 2.8, 1, EMB[4]); g.px(bx, bottom - 1, EMB[5]);
    }
    // Ketten vom Sturz zu den Statuen
    for (const [a, b] of [[[px0 + 2, spring - 6], [22, 34]], [[px1 - 2, spring - 6], [W - 23, 34]]]) {
      for (let t = 0; t <= 1; t += 0.06) { const x = Math.round(a[0] + (b[0] - a[0]) * t), y = Math.round(a[1] + (b[1] - a[1]) * t + Math.sin(t * Math.PI) * 5); p.px(x, y, (t * 16 | 0) % 2 ? IRON[3] : IRON[1]); }
    }
    // Glutpunkte im Fels
    for (let i = 0; i < 10; i++) { const x = rng.int(2, W - 3), y = rng.int(20, bottom - 16); if (x > 5 && x < W - 5 && Math.abs(x - cx) < 40) continue; p.px(x, y, EMB[1]); g.px(x, y, EMB[2]); }
  }, { b: true,
    ax: 56, light: { dx: 0, dy: -24, radius: 120, color: [255, 110, 40], intensity: 1 },
    extra: { boxes: [[-56, -10, -22, 1], [22, -10, 56, 1]], door: { dx: 0, dy: -3 }, embers: { dx: 0, dy: -8, rate: 3 } },
  });
}

// ------------------------------------------------------------ Knochenhaufen
function bonePile(v) {
  const rng = createRng(1200 + v);
  const W = v ? 30 : 24, H = v ? 18 : 15;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = Math.floor(W / 2);
    ashPatch(p, g, cx, bottom - 1, cx - 1, 2, 1201 + v, 0.06);
    const B = BONE;
    const bone = (x0, y0, x1, y1) => {
      p.line(x0, y0, x1, y1, B[2]); p.line(x0, y0 - 1, x1, y1 - 1, B[3]);
      p.rect(x0 - 1, y0 - 2, 2, 3, B[3]); p.px(x0 - 1, y0 - 2, B[4]); p.rect(x1, y1 - 2, 2, 3, B[2]);
      // verkohlte Enden
      p.px(x1 + 1, y1, CHAR[2]);
    };
    for (let i = 0; i < (v ? 9 : 6); i++) {
      const x = rng.int(3, W - 8), y = rng.int(bottom - 8, bottom - 2), len = rng.int(4, 7), a = rng.range(-0.5, 0.5);
      bone(x, y, x + Math.round(Math.cos(a) * len), y + Math.round(Math.sin(a) * len * 0.5));
    }
    // Schädel
    const skull = (sx, sy, lit) => {
      p.ellipse(sx, sy, 3, 2.6, B[3]); p.ellipse(sx - 1, sy - 1, 2, 1.6, B[4]);
      p.rect(sx - 2, sy + 1, 5, 2, B[2]);
      p.px(sx - 1, sy, '#140808'); p.px(sx + 1, sy, '#140808');
      if (lit) { p.px(sx - 1, sy, EMB[3]); p.px(sx + 1, sy, EMB[3]); g.px(sx - 1, sy, EMB[4]); g.px(sx + 1, sy, EMB[4]); }
      p.px(sx - 1, sy + 2, '#140808'); p.px(sx + 1, sy + 2, '#140808');
    };
    skull(cx - 2, bottom - 7, v === 1);
    if (v) { skull(cx + 7, bottom - 4, false); p.line(cx + 4, bottom - 12, cx + 9, bottom - 2, IRON[2]); p.px(cx + 4, bottom - 13, IRON[4]); }
    // Rippenbogen
    for (let t = 0; t < Math.PI; t += 0.15) p.px(Math.round(cx + 4 + Math.cos(t) * 4), Math.round(bottom - 3 - Math.sin(t) * 5), t < 1.5 ? B[3] : B[2]);
    // Glut zwischen den Knochen
    for (let i = 0; i < 3; i++) { const x = rng.int(4, W - 5), y = bottom - rng.int(1, 3); p.px(x, y, EMB[2]); g.px(x, y, EMB[3]); }
  }, { ax: Math.floor(W / 2), ay: H - 2, box: [-Math.floor(W / 2) + 3, -4, Math.floor(W / 2) - 3, 1] });
}

// ============================================================ Runde 5: Ruinenstadt Altglut
// Kühler, violettgrauer Altstadtstein (hebt sich vom warmen Bastionsstein ab),
// Asche auf allen Oberseiten, Glutschein von unten. Mauerteile kacheln:
// gleiche Kantenhöhe links/rechts, Fugenraster an der Unterkante ausgerichtet.
const RST = ['#0e0c0b', '#181412', '#221d1a', '#2d2622', '#39302b', '#463b35', '#564940', '#6a5b4f', '#857363'];
const ASHT = ['#2a231c', '#372e25', '#453a2e', '#554839', '#685846'];
const BAS = ['#0c0a0b', '#151112', '#1e1819', '#282021', '#332a2a', '#403434', '#4f4140'];
const DARK = '#07050a';
const FER = ['#0e0a0a', '#1a1312', '#281d1a', '#382823', '#4a352c', '#644838'];

// Fugenbild: Index in RST für Pixel (x, y), y von unten gezählt
function brickK(x, yb, seed, { bw = 8, bh = 4, base = 3 } = {}) {
  const row = Math.floor(yb / bh), off = (row % 2) * (bw >> 1);
  const lx = (((x + off) % bw) + bw) % bw, ly = yb % bh;
  const blk = hash2(Math.floor((x + off + bw * 8) / bw), row, seed);
  let k = base + (blk < 0.25 ? -1 : blk < 0.82 ? 0 : 1);
  if (ly === bh - 1 || lx === 0) return 1;            // Fuge
  if (ly === bh - 2) k += 1;                          // Oberkante des Steins im Licht
  else if (lx === bw - 1 || ly === 0) k -= 1;
  if (hash2(x, yb, seed + 7) < 0.06) k -= 1;
  return k;
}

// Mauerkrone: Ascheoberseite mit Lichtkante vorn
function crownK(x, y, t, T, seed) {
  const r = y - t;
  if (r === T - 1) return { c: RST[7 + (hash2(x, y, seed) < 0.2 ? 1 : 0)] };
  if (r === 0) return { c: RST[4] };
  const h = hash2(x, y, seed + 3);
  return { c: h < 0.55 ? ASHT[2 + (h < 0.2 ? 1 : 0)] : h < 0.85 ? RST[5] : ASHT[1] };
}

// Mauerfront mit Profil tops[x]: Krone (T Zeilen) und Front bis zur Unterkante
function wallFace(p, g, tops, T, bottom, seed, { base = 3, soot = 7, warm = 3 } = {}) {
  if (p.fine) { wallFaceFine(p, tops, T, bottom, seed, { base, soot, warm }); return; }
  for (let x = 0; x < tops.length; x++) {
    const t = tops[x];
    for (let y = t; y < t + T && y <= bottom; y++) p.px(x, y, crownK(x, y, t, T, seed).c);
    for (let y = t + T; y <= bottom; y++) {
      const yb = bottom - y;
      let k = brickK(x, yb, seed, { base });
      if (y === t + T) k -= 1;                                   // Schatten unter der Krone
      if (yb < soot && hash2(x, y, seed + 9) < (soot - yb) / (soot + 2)) k -= 2; // Ruß am Fuß
      let c = RST[Math.max(0, Math.min(8, k))];
      if (yb < warm && k >= 2 && (x + y) % 2 === 0) c = yb === 0 ? '#2a130c' : '#22120e';   // Glutschein vom Boden
      p.px(x, y, c);
    }
    // Stufenkante, wenn die Krone links höher liegt (Licht von links)
    if (x > 0 && tops[x - 1] > t) for (let y = t + T; y < Math.min(bottom, tops[x - 1] + T); y++) p.px(x, y, RST[6]);
    if (x > 0 && tops[x - 1] < t) for (let y = tops[x - 1] + T; y < t + T && y <= bottom; y++) p.px(x - 1, y, RST[2]);
  }
}

// Mauerkrone fein: Asche in Wehen (glatte Formen, harte Stufen) auf Stein, Hinterkante dunkel, Vorderkante im Licht
function crownFine(x, y, r, T, seed) {
  const P = RST32(), A = ASHT32();
  if (r >= T - 0.5) return P[hash2(Math.floor(x / 2), 7, seed) < 0.25 ? 8 : 7];
  if (r >= T - 1) return P[5];
  if (r < 0.5) return P[3];
  const n = vnoiseLite(x / 2.6, y / 1.4, seed);
  return n > 0.64 ? A[3] : n > 0.44 ? A[2] : n > 0.3 ? P[5] : P[4];
}
// Kronenhöhe je Feinspalte: Einzelstufen (1 px) werden zur halben Stufe geglättet, große Sprünge bleiben Kanten
function topFine(tops, x) {
  const X = Math.floor(x), t = tops[X], n = tops[x - X < 0.5 ? X - 1 : X + 1];
  return n !== undefined && Math.abs(n - t) === 1 ? t + (n - t) * 0.5 : t;
}
function wallFaceFine(p, tops, T, bottom, seed, { base, soot, warm }) {
  const P = RST32(), W = tops.length;
  p.scan(0, Math.min(...tops) - 1, W - 0.5, bottom + 0.5, (x, y) => {
    const X = Math.floor(x), t = Math.round(topFine(tops, x) * 2) / 2;
    if (y < t) return 0;
    if (y < t + T) return crownFine(x, y, y - t, T, seed);
    // Seitenflächen an Kronenstufen: links höher → Lichtfläche, rechts höher → Schatten
    const l = tops[X - 1], r = tops[X + 1];
    if (l !== undefined && l - tops[X] > 1 && y < l + T) return x - X < 0.5 ? P[7] : P[6];
    if (r !== undefined && r - tops[X] > 1 && y < r + T && x - X >= 0.5) return P[1];
    return brickFine(x, y, bottom, seed, { base, soot, warm, W, top: t + T });
  });
}

// Glühender Riss in einer Fläche
function emberCrack(p, g, x, y, len, seed, dirY = 1) {
  if (p.fine) {
    // gleicher Pfad wie früher, fein: Saum 2 Feinpixel, heißer Kern 1 Feinpixel, Enden erkaltet
    const pts = [];
    for (let i = 0; i < len; i++) { pts.push([x + 0.25, y + 0.25]); y += dirY; x += hash2(i, seed, 5) < 0.35 ? 1 : hash2(i, seed, 6) < 0.3 ? -1 : 0; }
    for (let i = 0; i + 1 < pts.length; i++) { const [a, b] = pts[i], [c, d] = pts[i + 1]; p.fline(a, b, c, d, EMB[i === 0 || i === pts.length - 2 ? 1 : 2], 1); g.fline(a, b, c, d, EMB[2], 1); }
    for (let i = 0; i + 1 < pts.length; i++) {
      const [a, b] = pts[i], [c, d] = pts[i + 1], end = i === 0 || i === pts.length - 2;
      p.fline(a, b + (end ? 0.5 : 0), c, d, end ? EMB[3] : hash2(i, seed, 3) < 0.4 ? HOT : EMB[4]); g.fline(a, b, c, d, end ? EMB[4] : HOT);
    }
    return;
  }
  for (let i = 0; i < len; i++) {
    const c = i === 0 || i === len - 1 ? EMB[1] : hash2(i, seed, 3) < 0.3 ? EMB[3] : EMB[2];
    p.px(x, y, c); g.px(x, y, i === 0 || i === len - 1 ? EMB[2] : EMB[3]);
    y += dirY; x += hash2(i, seed, 5) < 0.35 ? 1 : hash2(i, seed, 6) < 0.3 ? -1 : 0;
  }
}

// Feiner Glutkern für einen alten Weltpixel-Riss (gleicher Pfad wie emberCrack ohne Feinraster): im fine-Haken
function crackCore(f, g, x, y, len, seed) {
  for (let i = 0; i < len; i++) {
    if (i > 0 && i < len - 1) { const c = hash2(i, seed, 3) < 0.3 ? HOT : EMB[4]; f.dot(x + 0.25, y + 0.25, c); f.dot(x + 0.25, y + 0.75, EMB[4]); g.dot(x + 0.25, y + 0.25, HOT); g.dot(x + 0.25, y + 0.75, HOT); }
    y += 1; x += hash2(i, seed, 5) < 0.35 ? 1 : hash2(i, seed, 6) < 0.3 ? -1 : 0;
  }
}

// Stein mit Lichtkante (Schutt, Trommeln)
function block(p, x, y, w, h, pal, k = 3) {
  if (p.fine) {
    // fein: Kantenlicht oben/links, Schatten unten/rechts je 1 Feinpixel, obere rechte Ecke abgeschlagen
    const P = pal32(pal), c = (i) => P[clampI(i, P.length)], x1 = x + w, y1 = y + h;
    p.scan(x, y, x1 - 0.5, y1 - 0.5, (px, py) => {
      if (px > x1 - 0.5 && py < y + 0.5) return 0;
      if (py < y + 0.5) return c(k + 2);
      if (py > y1 - 0.5) return c(k - 2);
      if (px > x1 - 0.5) return c(k - 1);
      if (px < x + 0.5 || py < y + 1) return c(k + 1);
      return c(k);
    });
    return;
  }
  p.rect(x, y, w, h, pal[k]); p.rect(x, y, w, 1, pal[k + 2] ?? pal[k + 1]); p.rect(x, y, 1, h, pal[k + 1]);
  p.rect(x + w - 1, y + 1, 1, h - 1, pal[k - 1]); p.rect(x + 1, y + h - 1, w - 1, 1, pal[k - 2] ?? pal[0]);
}

// Ausgebrochenes Loch im Mauerwerk (fein): dunkler Grund, Lichtkante an der Unterlippe, Schattenkante oben
function holeF(p, x, y, w, h) {
  p.each(x - 0.5, y - 0.5, x + w, y + h, (px, py) => {
    const nx = (px - x - w / 2) / (w / 2 + 0.2), ny = (py - y - h / 2) / (h / 2 + 0.2), d = nx * nx + ny * ny;
    if (d > 1) return null;
    if (d > 0.55 && ny > 0.2) return RST[6];
    return d > 0.55 && ny < -0.2 ? RST[1] : DARK;
  });
}
// Spitzbogenöffnung (fein) mit Glutschein im ausgebrannten Raum: Laibung rechts im Licht, Sohlbank hell
function archF(p, g, cx, y0, y1, hw, rise, S = RST) {
  const inside = (x, y) => { if (y < y0 || y >= y1) return false; const k = y - y0; const w = k < rise ? hw * Math.sqrt(1 - ((rise - k) / rise) ** 2) * 1.05 : hw; return Math.abs(x - cx) < w; };
  p.each(cx - hw - 1, y0, cx + hw + 1, y1 + 1, (x, y) => {
    if (y >= y1) return Math.abs(x - cx) < hw + 1 ? (y < y1 + 0.5 ? S[S.length - 1] : S[S.length - 3]) : null;
    if (!inside(x, y)) return null;
    const hot = y1 - y;
    if (hot < 1.5) { const c = hot < 0.5 ? (Math.abs(x - cx) < 1 ? HOT : EMB[3]) : Math.abs(x - cx) < 1.5 ? EMB[2] : EMB[1]; g.dot(x, y, hot < 0.5 ? HOT : EMB[3]); return c; }
    if (hot < 2.5) { g.dot(x, y, EMB[1]); return '#2a1008'; }
    if (!inside(x + 0.5, y)) return S[S.length - 4];          // Laibung rechts (im Licht von links)
    if (!inside(x, y - 0.5)) return S[1];
    return DARK;
  });
}

// ------------------------------------------------------------ Hausmauer (Nordseite, Front nach Süden)
function ruinWall(v) {
  const W = 16, H = 36, T = 5, F = 21, E = H - F - T; // E = Kronenhöhe an beiden Kanten
  const tops = [];
  for (let x = 0; x < W; x++) {
    let t = E;
    if (v === 1) { const d = Math.max(0, 6 - Math.abs(x - 8)); t = E + Math.min(10, Math.round(d * 1.7 + hash2(x, 3, 1301) * 2)); }
    if (v === 3 && x >= 2 && x <= 7) t = E - 7 + (x === 2 || x === 7 ? 3 : 0) + Math.round(hash2(x, 1, 1302));
    if (v === 4 && x >= 3 && x <= 12) t = E + 11 + Math.round(hash2(x, 5, 1303) * 3) - (x === 3 || x === 12 ? 5 : x === 4 || x === 11 ? 2 : 0);
    tops.push(t);
  }
  return mk(W, H, (p, g) => {
    const bottom = H - 1;
    wallFace(p, g, tops, T, bottom, 1310 + v);
    if (v === 0) {
      emberCrack(p, g, 11, E + T + 5, 7, 1311);
      if (p.fine) { holeF(p, 4, E + T + 9, 2, 1.5); } else { p.px(4, E + T + 9, DARK); p.px(5, E + T + 9, DARK); p.px(4, E + T + 10, RST[2]); }
    }
    if (v === 2 && p.fine) {
      const wy0 = E + T + 3, wy1 = bottom - 5, cx = 8;
      // Rußfahne über dem Fenster (harte, wellige Kante)
      const so = { base: 1, W, top: E + T };
      p.scan(3, E + T, 12.5, wy0 + 1, (x, y) => (Math.abs(x - cx) < 3.3 - (wy0 - y) * 0.3 + 0.6 * Math.sin(y * 1.3 + x * 0.7) ? brickFine(x, y, bottom, 1312, so) : 0));
      archF(p, g, cx, wy0, wy1 + 1, 3, 3);
    } else if (v === 2) {
      // Spitzbogenfenster mit Glut im ausgebrannten Raum dahinter
      const wx0 = 5, wx1 = 10, wy0 = E + T + 3, wy1 = bottom - 5;
      for (let y = wy0; y <= wy1; y++) for (let x = wx0; x <= wx1; x++) {
        const k = (y - wy0);
        if (k < 3 && Math.abs(x - 7.5) > 1 + k) continue;
        p.px(x, y, DARK);
      }
      p.rect(wx0, wy1 - 1, 6, 2, EMB[1]); p.rect(wx0 + 1, wy1, 4, 1, EMB[2]); g.rect(wx0, wy1 - 1, 6, 2, EMB[2]); g.rect(wx0 + 2, wy1, 2, 1, EMB[4]);
      p.rect(wx0 - 1, wy1 + 1, 8, 1, RST[7]);
      for (let y = wy0 - 6; y < wy0; y++) for (let x = wx0; x <= wx1; x++) if (hash2(x, y, 1312) < 0.5 - (wy0 - y) * 0.07) p.px(x, y, SOOT[1]);
    }
    if (v === 3) {
      if (p.fine) { holeF(p, 4, E + 1, 2, 3); p.fline(4.25, E + 3.75, 5.75, E + 3.25, BONE[2]); p.dot(4.25, E + 3.25, BONE[3]); p.dot(5.75, E + 3.25, BONE[4]); }
      else { p.rect(4, E + 1, 2, 3, DARK); p.px(4, E + 3, BONE[2]); p.px(5, E + 3, BONE[3]); }
    }
    if (v === 4) {
      // Bresche: Füllmauerwerk und herabgefallene Steine
      if (p.fine) p.each(4, Math.min(...tops), 11.5, bottom, (x, y) => { const t = tops[Math.floor(x)] + T; return y >= t && y < t + 3 && vnoiseLite(x / 1.3, y / 1.1, 1313) < 0.42 ? (vnoiseLite(x / 1.3, y / 1.1 - 0.4, 1313) < 0.42 ? RST[2] : RST[4]) : null; });
      else for (let x = 4; x <= 11; x++) for (let y = tops[x] + T; y < tops[x] + T + 3; y++) if (hash2(x, y, 1313) < 0.5) p.px(x, y, RST[2]);
      block(p, 2, bottom - 3, 5, 3, RST, 4); block(p, 9, bottom - 2, 4, 3, RST, 3); p.px(7, bottom - 1, EMB[2]); g.px(7, bottom - 1, EMB[3]);
    }
  }, { ax: 8, ay: H - 2, b: true });
}

// ------------------------------------------------------------ Niedrige Mauer (Südseite)
function ruinWallLow(v) {
  const W = 16, H = 20, T = 4, F = 9, E = H - F - T;
  const tops = [];
  for (let x = 0; x < W; x++) {
    let t = E;
    if (v === 1) { const d = Math.max(0, 5 - Math.abs(x - 8)); t = E + Math.min(5, Math.round(d * 1.2 + hash2(x, 3, 1321) * 1.5)); }
    if (v === 2 && x >= 9) t = E - 3 + (x === 9 ? 2 : 0);
    tops.push(t);
  }
  return mk(W, H, (p, g) => {
    const bottom = H - 1;
    wallFace(p, g, tops, T, bottom, 1325 + v, { soot: 4, warm: 2 });
    if (v === 1) { block(p, 6, bottom - 2, 4, 3, RST, 4); p.px(11, bottom, RST[5]); }
    if (v === 2) { if (p.fine) { p.px(3, E + T + 3, EMB[1]); sparkF(p, g, 3, E + T + 3); } else { p.px(3, E + T + 3, EMB[2]); g.px(3, E + T + 3, EMB[3]); } }
  }, { ax: 8, ay: H - 2, b: true });
}

// ------------------------------------------------------------ Seitenmauer (Nord-Süd-Lauf)
// Jede Kachel zeichnet die Krone über ihrer Grundfläche und darunter die Stirnseite;
// die nächste Kachel südlich überdeckt diese Stirn mit ihrer Krone.
function ruinWallV(v) {
  const W = 16, F = 20, H = 16 + F + 1;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, s0 = bottom - F - 15, s1 = bottom - F; // Krone s0..s1
    if (p.fine) {
      // Krone: Deckplatten mit schmalen Fugen und Kantenlicht, Asche in Wehen; Stirn mit feinem Steinschnitt
      const P = RST32(), A = ASHT32(), so = { bw: 5, soot: 5, W, top: s1 + 1 };
      p.scan(3, s0, 12.5, bottom + 0.5, (x, y) => {
        const X = Math.floor(x), Y = Math.floor(y), fx = x - X;
        if (Y > s1) return X <= 12 ? brickFine(x, y, bottom, 1335 + v, so) : 0;
        const xa = 3 + (hash2(1, Y >> 1, 1331 + v) < 0.3 ? 1 : 0), xb = 12 - (hash2(2, Y >> 1, 1331 + v) < 0.3 ? 1 : 0);
        if (X < xa || X > xb) return 0;
        if (X === xa) return P[fx < 0.5 ? 7 : 6];
        if (X === xb) return P[fx < 0.5 ? 3 : 2];
        const half = X < 8 ? 0 : 1, q = (Y - s0 + half * 2) % 5 + (y - Y), row = Math.floor((Y - s0 + half * 2) / 5);
        if (X === 8 && fx < 0.5) return P[2];
        if (q < 0.5) return P[2];
        if (q < 1 || X === 8) return P[6];
        if (q >= 4.5) return P[3];
        const n = vnoiseLite(x / 2.2, y / 1.8, 1333 + v);
        return n > 0.56 ? A[3] : n > 0.34 ? A[2] : P[hash2(row, half, 1334 + v) < 0.12 ? 4 : 5];
      });
      if (v === 1) {
        p.scan(5, s0 + 4, 10.5, s0 + 9.5, (x, y) => P[vnoiseLite(x / 1.2, y / 1.1, 1337) < 0.45 ? 2 : vnoiseLite(x / 1.2, y / 1.1 - 0.5, 1337) < 0.45 ? 4 : 3]);
        block(p, 6, s0 + 6, 3, 2, RST, 4); p.px(9, s0 + 8, EMB[1]); sparkF(p, g, 9, s0 + 8);
      }
      if (v === 2) emberCrack(p, g, 5, s0 + 7, 3, 1338);
      return;
    }
    for (let y = s0; y <= s1; y++) {
      const jitL = hash2(1, y >> 1, 1331 + v) < 0.3 ? 1 : 0, jitR = hash2(2, y >> 1, 1331 + v) < 0.3 ? 1 : 0;
      const xa = 3 + jitL, xb = 12 - jitR;
      for (let x = xa; x <= xb; x++) {
        const half = x < 8 ? 0 : 1, row = Math.floor((y - s0 + half * 2) / 5);
        const joint = (y - s0 + half * 2) % 5 === 0 || x === 8;
        const h = hash2(x, y, 1333 + v);
        let c = joint ? RST[3] : h < 0.5 ? ASHT[2] : h < 0.8 ? RST[5] : ASHT[3];
        if (x === xa) c = RST[7]; else if (x === xb) c = RST[3];
        if (hash2(row, half, 1334 + v) < 0.12 && !joint) c = RST[4];
        p.px(x, y, c);
      }
    }
    // Stirnseite (nur unten sichtbar)
    for (let y = s1 + 1; y <= bottom; y++) for (let x = 3; x <= 12; x++) {
      const yb = bottom - y;
      let k = brickK(x, yb, 1335 + v, { bw: 5 });
      if (y === s1 + 1) k -= 1;
      if (yb < 5 && hash2(x, y, 1336) < (5 - yb) / 7) k -= 2;
      p.px(x, y, RST[Math.max(0, Math.min(8, k))]);
    }
    if (v === 1) {
      // eingebrochene Krone: Lücke mit Schutt
      for (let y = s0 + 4; y < s0 + 10; y++) for (let x = 5; x <= 10; x++) p.px(x, y, hash2(x, y, 1337) < 0.5 ? RST[2] : RST[3]);
      block(p, 6, s0 + 6, 3, 2, RST, 4); p.px(9, s0 + 8, EMB[2]); g.px(9, s0 + 8, EMB[3]);
    }
    if (v === 2) { p.px(5, s0 + 7, EMB[2]); p.px(6, s0 + 8, EMB[3]); p.px(6, s0 + 9, EMB[2]); g.px(6, s0 + 8, EMB[4]); g.px(5, s0 + 7, EMB[3]); }
  }, { ax: 8, ay: H - 2, b: true });
}

// ------------------------------------------------------------ Eckpfeiler mit Quadern
function ruinPier(v) {
  const W = 16, T = 6, F = 26, H = F + T + 6;
  return mk(W, H, (p, g) => {
    const bottom = H - 1;
    const tops = [];
    for (let x = 0; x < W; x++) tops.push(v ? 6 + Math.round(Math.abs(Math.sin(x * 0.8)) * 4 + (x > 9 ? (x - 9) * 1.2 : 0)) : 4);
    wallFace(p, g, tops, T, bottom, 1340 + v, { base: 4 });
    // Eckquader (abwechselnd breit/schmal)
    for (let yb = 0; yb < bottom - tops[0] - T; yb += 6) {
      const wide = (yb / 6) % 2 === 0, w = wide ? 7 : 4, y = bottom - yb - 5;
      if (y <= tops[0] + T) break;
      block(p, 0, y, w, 6, RST, 5); block(p, W - w, y, w, 6, RST, 4);
    }
    if (!v) {
      p.rect(0, 3, 16, 2, RST[7]); p.rect(0, 5, 16, 1, RST[2]); p.px(0, 3, RST[8]);
      if (p.fine) { p.fline(0, 3, 15.5, 3, RST[8]); p.fline(0, 4.5, 15.5, 4.5, RST[6]); p.fline(0, 5.5, 15.5, 5.5, RST[1]); for (let x = 3.5; x < 16; x += 6) { p.fline(x, 3.5, x, 4.5, RST[4]); } }
    } else emberCrack(p, g, 9, 16, 6, 1341);
  }, { ax: 8, ay: H - 2, b: true });
}

// ------------------------------------------------------------ Schutt
function rubble(v) {
  const rng = createRng(1350 + v);
  const W = 20, H = 13;
  return mk(W, H, (p, g) => {
    const bottom = H - 1;
    ashPatch(p, g, 10, bottom - 1, 9, 2, 1351 + v, 0.04);
    const n = [6, 8, 5][v];
    const stones = [];
    for (let i = 0; i < n; i++) stones.push([rng.int(1, W - 7), rng.int(bottom - 8, bottom - 3), rng.int(3, 6), rng.int(2, 4)]);
    stones.sort((a, b) => a[1] - b[1]);
    for (const [x, y, w, h] of stones) block(p, x, y, w, h, RST, rng.int(3, 5));
    if (v === 2 && p.fine) {
      p.fline(2.5, bottom - 1.5, 16.5, bottom - 6.5, CHAR[3], 1); p.fline(2.5, bottom - 0.5, 16.5, bottom - 5.5, CHAR[1]); p.fline(2.5, bottom - 2, 16.5, bottom - 7, CHAR[5]);
      for (const x of [5, 10, 14]) { const y = bottom - 1.5 - (x - 2) * 0.36; p.dot(x, y, EMB[2]); p.dot(x + 0.5, y, HOT); p.dot(x + 1, y - 0.5, EMB[3]); g.dot(x + 0.5, y, HOT); g.dot(x, y, EMB[3]); g.dot(x + 1, y - 0.5, EMB[3]); }
    } else if (v === 2) { p.line(2, bottom - 2, 16, bottom - 7, CHAR[3]); p.line(2, bottom - 1, 16, bottom - 6, CHAR[1]); for (const x of [5, 10, 14]) { const y = Math.round(bottom - 2 - (x - 2) * 0.36); p.px(x, y, EMB[3]); g.px(x, y, EMB[4]); } }
    if (v === 1 && p.fine) { p.px(8, bottom - 2, EMB[1]); sparkF(p, g, 8, bottom - 2); p.fline(13, bottom - 0.5, 14.5, bottom - 1, BONE[2]); p.dot(13, bottom - 1, BONE[3]); p.dot(14.5, bottom - 1.5, BONE[4]); }
    else if (v === 1) { p.px(8, bottom - 2, EMB[2]); g.px(8, bottom - 2, EMB[3]); p.px(13, bottom - 1, BONE[2]); p.px(14, bottom - 1, BONE[3]); }
  }, { ax: 10, ay: H - 3, b: true });
}

// ------------------------------------------------------------ Säulen
// Kannelierter Schaft (Licht von links), Basis, Kapitell oder Bruchkante
// Platte/Stufe fein: Kantenlicht oben (und links), Schatten unten, rechte Stirn dunkel, Ecken 1 Feinpixel gerundet
function slabF(p, x, y, w, h, { top, lip = null, body, bot, left = null, right = null, rw = 1 }) {
  const x1 = x + w, y1 = y + h;
  p.each(x, y, x1 - 0.5, y1 - 0.5, (px, py) => {
    if ((px < x + 0.5 || px > x1 - 0.5) && (py < y + 0.5 || py > y1 - 0.5)) return null;
    if (py < y + 0.5) return top;
    if (lip && py < y + 1) return lip;
    if (py > y1 - 0.5) return bot;
    if (right && px > x1 - rw) return right;
    if (left && px < x + 0.5) return left;
    return body;
  });
}

// Säulenschaft fein: Zylinder mit hartem Licht von links, Kanneluren als Rille + Lichtgrat (zum Rand hin enger),
// Trommelfugen mit Kantenlicht, Abplatzungen, Ruß am Fuß als wellige Grenze, Bruchkante mit Asche
function columnShaftFine(p, g, cx, yTop, yBot, r, seed, { capital, broken }) {
  const P = RST32(), A = ASHT32(), ccx = cx + 0.5, R = r + 0.5, flutes = r + 1;
  const brk = (X) => broken ? Math.round(hash2(X, 1, seed) * 4 + Math.sin(X * 1.3) * 1.5) : 0;
  const joints = []; for (let y = yBot - 9; y > yTop + 3; y -= 10) joints.push(y);
  p.scan(cx - r, yTop - 0.5, cx + r + 0.5, yBot + 0.5, (x, y) => {
    const X = Math.floor(x), top = yTop + brk(X);
    if (y < top) return 0;
    const nx = (x - ccx) / R;
    if (broken && y < top + 0.5) return hash2(X, 2, seed) < 0.3 ? A[3] : P[nx < 0 ? 8 : 6];
    const l = shade(nx, -0.22);
    let k = 2 + Math.floor((l - 0.25) * 9);
    const ph = (Math.asin(Math.max(-1, Math.min(1, nx))) / Math.PI + 0.5) * flutes * 2, f = ph - Math.floor(ph);
    if (Math.abs(nx) < 0.93) { if (f < 0.2) k -= 2; else if (f < 0.4 && nx < 0.4) k += 1; }
    for (const jy of joints) { if (y >= jy && y < jy + 0.5) k = 1; else if (y >= jy + 0.5 && y < jy + 1) k += 1; }
    // Abplatzungen: kleine Ausbrüche mit Schattenkante oben und Licht unten
    const cy = Math.floor(y / 5), ch = hash2(cy, X >> 1, seed + 2);
    if (ch < 0.05) { const fy = y / 5 - cy; if (fy > 0.3 && fy < 0.6) k = fy < 0.4 ? 1 : 3; }
    const sb = yBot + 1 - y, st = sootAt(x, 5, seed + 1); if (sb < st * 0.5) k -= 3; else if (sb < st) k -= 1;
    return P[k < 0 ? 0 : k > 8 ? 8 : k];
  });
  // Basis: Wulst und Plinthe
  slabF(p, cx - r - 2, yBot + 1, 2 * r + 5, 2, { top: RST[8], lip: RST[7], body: RST[5], bot: RST[3], right: RST[3], rw: 1.5, left: RST[7] });
  slabF(p, cx - r - 3, yBot + 3, 2 * r + 7, 3, { top: RST[7], body: RST[4], bot: RST[2], right: RST[2], rw: 2, left: RST[6] });
  if (capital) {
    slabF(p, cx - r - 1, yTop - 3, 2 * r + 3, 3, { top: RST[8], lip: RST[7], body: RST[6], bot: RST[2], right: RST[3], rw: 2, left: RST[7] });
    slabF(p, cx - r - 3, yTop - 6, 2 * r + 7, 3, { top: ASHT[4], lip: RST[6], body: RST[5], bot: RST[2], right: RST[2], rw: 2, left: RST[7] });
    for (let x = cx - r - 2.5; x < cx + r + 3; x += 1.5) p.dot(x, yTop - 5.5, hash2(Math.floor(x * 2), 4, seed) < 0.5 ? ASHT[3] : ASHT[4]);
  }
}

function columnShaft(p, g, cx, yTop, yBot, r, seed, { capital = false, broken = false } = {}) {
  if (p.fine) { columnShaftFine(p, g, cx, yTop, yBot, r, seed, { capital, broken }); return; }
  const ramp = [RST[7], RST[6], RST[6], RST[5], RST[5], RST[4], RST[4], RST[3], RST[2]];
  const brk = (x) => broken ? Math.round(hash2(x, 1, seed) * 4 + Math.sin(x * 1.3) * 1.5) : 0;
  for (let x = cx - r; x <= cx + r; x++) {
    const rel = (x - (cx - r)) / (2 * r);
    const top = yTop + brk(x);
    for (let y = top; y <= yBot; y++) {
      let k = Math.floor(rel * (ramp.length - 1));
      if ((x - cx + r) % 2 === 1 && x > cx - r && x < cx + r) k = Math.min(ramp.length - 1, k + 2); // Kanneluren
      let c = ramp[k];
      if (yBot - y < 6 && hash2(x, y, seed + 1) < (6 - (yBot - y)) / 8) c = RST[1];
      if (hash2(x >> 1, y >> 2, seed + 2) < 0.04) c = RST[2];
      p.px(x, y, c);
    }
    if (broken) { p.px(x, top, rel < 0.5 ? RST[8] : RST[6]); if (hash2(x, 2, seed) < 0.3) p.px(x, top, ASHT[3]); }
  }
  // Trommelfugen
  for (let y = yBot - 9; y > yTop + 3; y -= 10) for (let x = cx - r; x <= cx + r; x++) p.px(x, y, RST[2]);
  // Basis
  p.rect(cx - r - 2, yBot + 1, 2 * r + 5, 2, RST[5]); p.rect(cx - r - 2, yBot + 1, 2 * r + 5, 1, RST[7]);
  p.rect(cx - r - 3, yBot + 3, 2 * r + 7, 3, RST[4]); p.rect(cx - r - 3, yBot + 3, 2 * r + 7, 1, RST[6]); p.rect(cx + r + 2, yBot + 4, 2, 2, RST[2]);
  if (capital) {
    p.rect(cx - r - 1, yTop - 3, 2 * r + 3, 3, RST[6]); p.rect(cx - r - 1, yTop - 3, 2 * r + 3, 1, RST[8]); p.rect(cx + r, yTop - 2, 2, 2, RST[3]);
    p.rect(cx - r - 3, yTop - 6, 2 * r + 7, 3, RST[5]); p.rect(cx - r - 3, yTop - 6, 2 * r + 7, 1, ASHT[4]); p.rect(cx + r + 2, yTop - 5, 2, 2, RST[2]);
    p.px(cx - r - 2, yTop - 2, RST[6]); p.px(cx + r + 2, yTop - 2, RST[3]);
  }
}

function columnStump(v) {
  const W = 20, H = [18, 32, 52][v];
  return mk(W, H, (p, g) => {
    const bottom = H - 1;
    ashPatch(p, g, 10, bottom - 1, 9, 2, 1361 + v, 0.03);
    if (v === 0) columnShaft(p, g, 10, bottom - 13, bottom - 6, 4, 1362, { broken: true });
    if (v === 1) { columnShaft(p, g, 10, bottom - 27, bottom - 6, 4, 1363, { broken: true }); emberCrack(p, g, 9, bottom - 20, 5, 1364); }
    if (v === 2) columnShaft(p, g, 10, bottom - 44, bottom - 6, 4, 1365, { capital: true });
  }, { ax: 10, ay: H - 3, box: [-5, -3, 5, 1], b: true });
}

function column(v) {
  const W = 24, H = v ? 46 : 64;
  return mk(W, H, (p, g) => {
    const bottom = H - 1;
    ashPatch(p, g, 12, bottom - 1, 11, 2, 1371 + v, 0.03);
    if (v === 0) columnShaft(p, g, 12, bottom - 56, bottom - 6, 5, 1372, { capital: true });
    else {
      columnShaft(p, g, 12, bottom - 34, bottom - 6, 5, 1373, { broken: true });
      // abgestürzte Trommel vor dem Schaft
      if (p.fine) {
        lump(p, 19.5, bottom - 1.5, 3.4, 2.9, RST, { lo: 1, hi: 5 });
        p.oval(18.6, bottom - 2.4, 2.1, 1.7, RST[6]); p.oval(18.4, bottom - 2.6, 1.3, 1, RST[7]); p.dot(17.5, bottom - 3.5, RST[8]);
        p.fline(19.5, bottom - 3, 20.5, bottom - 1.5, RST[3]);
      } else { p.ellipse(19, bottom - 2, 3, 2.6, RST[4]); p.ellipse(18, bottom - 3, 2, 1.6, RST[6]); p.px(17, bottom - 4, RST[7]); }
      emberCrack(p, g, 11, bottom - 26, 6, 1374);
    }
  }, { ax: 12, ay: H - 3, box: [-6, -3, 6, 1], b: true });
}

// ------------------------------------------------------------ Statuen (Prozessionsweg)
// Sockel mit zwei Stufen, darauf eine Gestalt aus dunklem Basalt (Licht von links).
// Glühendes Auge: Glutsaum (1 Weltpixel) mit heißem Feinpixel-Kern
function eyeF(p, g, x, y) { p.px(x, y, EMB[2]); p.dot(x + 0.25, y + 0.25, HOT); p.dot(x + 0.75, y + 0.25, EMB[4]); g.px(x, y, EMB[3]); g.dot(x + 0.25, y + 0.25, HOT); g.dot(x + 0.75, y + 0.25, HOT); }

// Statue fein: Basalt mit harten Lichtstufen, Faltenwurf als Grat + Rille, Gold 5-stufig mit Glanzpunkt, Klinge mit Mittelgrat
function statueBodyFine(p, g, cx, top, base, seed, kind) {
  const S = BST, mTop = top + 12, c0 = cx + 0.5;
  const L = (y) => cx - 5 + (cx - 8 - (cx - 5)) * (y - mTop) / (base - mTop), R = (y) => cx + 7 + (cx + 10 - (cx + 7)) * (y - mTop) / (base - mTop);
  p.each(cx - 9, mTop, cx + 10, base + 0.5, (x, y) => {
    const l = L(y), r = R(y); if (x < l || x >= r) return null;
    if (y >= base) return S[y < base + 0.5 ? 2 : 1];
    const u = (x - l) / (r - l);
    let k = u < 0.2 ? 6 : u < 0.48 ? 5 : u < 0.78 ? 4 : 3;
    if (x < l + 0.5) k = 6;
    if (x >= r - 0.5) k = 2;
    // Falten: fünf Bahnen, die nach unten auffächern; Rille mit Lichtgrat links daneben
    const depth = (y - mTop) / (base - mTop), w = (r - l) / 5, f = (x - l) / w, j = Math.round(f), d = (f - j) * w;
    if (j >= 1 && j <= 4 && depth > 0.18 + 0.12 * ((j * 7) % 3)) { if (d >= 0 && d < 0.5) k -= 2; else if (d >= -0.5 && d < 0) k += 1; }
    return S[Math.max(0, Math.min(6, k))];
  });
  // Saum mit Bruchkerben
  for (let x = cx - 7; x < cx + 9; x += 3.5) p.dot(x, base - 0.5, S[1]);
  // Schultern: Querbalken und gewölbte Schulterstücke
  slabF(p, cx - 8, mTop - 3, 17, 4, { top: S[6], lip: S[5], body: S[4], bot: S[2], right: S[2], rw: 3, left: S[5] });
  lump(p, cx - 5.5, mTop - 0.6, 2.9, 2.1, S, { lo: 3, hi: 6, bias: 0.05 });
  lump(p, cx + 6.5, mTop - 0.6, 2.9, 2.1, S, { lo: 2, hi: 4, bias: -0.15 });
  if (kind === 'king' || kind === 'headless') {
    if (kind === 'king') {
      // Helm: gerundet, Lichtseite links, Visierschlitz mit glühenden Augen, Nasenschutz
      p.each(cx - 3, top + 1.5, cx + 4, top + 10, (x, y) => {
        const dx = x - c0, hw = 3.5 - (y < top + 3 ? (top + 3 - y) * 0.6 : 0);
        if (Math.abs(dx) > hw || y < top + 2) return null;
        if (y >= top + 5 && y < top + 6) return S[1];
        const k = dx < -hw + 0.5 ? 6 : dx < -1.5 ? 5 : dx < 1.5 ? 4 : dx < hw - 0.5 ? 3 : 2;
        return S[k];
      });
      eyeF(p, g, cx - 1, top + 5); eyeF(p, g, cx + 2, top + 5);
      p.fline(c0, top + 6, c0, top + 8.5, S[5]); p.fline(c0 + 0.5, top + 6, c0 + 0.5, top + 8.5, S[2]);
      p.fline(cx - 2.5, top + 9.5, cx + 3.5, top + 9.5, S[1]);
      // Krone: Reif mit fünf Zacken, Gold 5-stufig, Glanzpunkt links, Rubin in der Mitte
      p.each(cx - 3, top + 0.5, cx + 4, top + 2, (x, y) => (y < top + 1 ? GOLD[3] : y < top + 1.5 ? GOLD[2] : y < top + 2 ? GOLD[1] : null));
      for (const [dx, hgt] of [[-3, 1.5], [-1.5, 2], [0.5, 3], [2, 2], [3.5, 1.5]]) {
        fpoly(p, [[cx + dx - 0.5, top + 1], [cx + dx + 0.5, top + 1 - hgt], [cx + dx + 1.5, top + 1]], (x) => (x < cx + dx + 0.5 ? GOLD[3] : GOLD[2]));
        p.dot(cx + dx + 0.5, top + 1 - hgt, GOLD[4]);
      }
      p.dot(cx - 2.5, top + 1, GOLD[4]); p.dot(c0, top + 1, CRIM[4]); p.dot(c0 + 0.5, top + 1, CRIM[2]);
      g.dot(c0, top - 2, GOLD[3]); g.dot(cx - 2.5, top + 1, GOLD[2]);
    } else {
      // abgeschlagener Kopf: schräge Bruchfläche mit Lichtkante, Glutriss im Mantel
      fpoly(p, [[cx - 2, top + 10], [cx - 2, top + 7.5], [cx - 0.5, top + 7], [cx + 1, top + 8], [cx + 2.5, top + 7.5], [cx + 3, top + 10]], (x, y) => (y < top + 8.2 ? S[6] : x > cx + 2 ? S[1] : S[3]));
      p.dot(cx - 1.5, top + 7.5, S[6]); p.dot(cx + 0.5, top + 8.5, S[2]);
      emberCrack(p, g, cx + 1, mTop + 2, 9, seed + 3);
      holeF(p, cx - 9, mTop - 2, 3, 6);
    }
    // Schwert: Knauf, Hände, Parierstange, Klinge mit Mittelgrat und Glanz
    const by0 = mTop + 6, by1 = base - 1;
    p.each(cx, by0, cx + 2, by1, (x, y) => {
      const t = by1 - y, hw = t < 1.5 ? 0.5 + t * 0.35 : 1, dx = x - (cx + 1);
      if (Math.abs(dx) > hw) return null;
      return dx < -0.5 ? IRON[4] : dx < 0 ? IRON[5] : dx < 0.5 ? IRON[2] : IRON[1];
    });
    p.dot(cx + 0.5, by0 + 1, '#ffffff'); p.dot(cx, by0 + 2, IRON[5]);
    p.oval(cx + 1, mTop + 1.8, 1.1, 1, GOLD[2]); p.dot(cx + 0.5, mTop + 1, GOLD[4]); p.dot(cx + 1.5, mTop + 2.5, GOLD[1]);
    lump(p, cx - 1.4, mTop + 3.5, 1.7, 1.6, S, { lo: 3, hi: 6 }); lump(p, cx + 3.4, mTop + 3.5, 1.7, 1.6, S, { lo: 2, hi: 4, bias: -0.15 });
    for (const fx of [-2, -1, 3, 4]) p.dot(cx + fx + 0.5, mTop + 4, S[fx < 0 ? 3 : 1]);
    p.each(cx - 4, mTop + 5, cx + 6, mTop + 6, (x, y) => (x < cx - 3.5 ? GOLD[4] : x >= cx + 5.5 ? GOLD[1] : y < mTop + 5.5 ? GOLD[3] : GOLD[1]));
    p.dot(c0 + 0.5, mTop + 5, CRIM[4]); p.dot(c0 + 0.5, mTop + 5.5, CRIM[2]); p.dot(cx - 3.5, mTop + 5, '#ffffff');
  } else {
    // Verhüllte Priesterin: Kapuze, Glut im Gesicht, erhobene Arme, Goldschale mit Glutbett
    fpoly(p, [[cx - 4, top + 12], [c0, top + 4], [cx + 5, top + 12]], (x, y) => { const u = (x - c0) / Math.max(0.5, (y - top - 4) * 0.56); return S[u < -0.7 ? 6 : u < -0.1 ? 5 : u < 0.55 ? 4 : 3]; });
    p.each(cx - 2, top + 8, cx + 2, top + 11, (x, y) => (Math.abs(x - c0 + 0.5) < 1.6 - (y < top + 9 ? (top + 9 - y) * 1.2 : 0) ? DARK : null));
    p.dot(cx - 1, top + 9.5, EMB[3]); p.dot(cx + 0.5, top + 9.5, EMB[2]); g.dot(cx - 1, top + 9.5, EMB[4]); g.dot(cx + 0.5, top + 9.5, EMB[3]);
    p.fline(cx - 4.5, mTop - 1, cx - 5.5, top - 0.5, S[5], 1); p.fline(cx - 5, mTop - 1, cx - 6, top - 0.5, S[6]);
    p.fline(cx + 5.5, mTop - 1, cx + 6.5, top - 0.5, S[2], 1); p.fline(cx + 5.5, mTop - 1, cx + 6.5, top - 0.5, S[3]);
    p.each(cx - 7, top - 3, cx + 8, top + 1, (x, y) => {
      const dy = y - (top - 3), hw = 7.5 - dy * 0.75, dx = x - c0;
      if (Math.abs(dx) > hw) return null;
      if (dy >= 3) return Math.abs(dx) < 5 ? (dy < 3.5 ? FER[3] : FER[1]) : null;
      if (dy < 0.5) return GOLD[3];
      return dx < -hw + 0.5 ? GOLD[3] : dx < -2 ? GOLD[2] : dx < hw - 1 ? GOLD[1] : GOLD[0];
    });
    p.dot(cx - 5.5, top - 3, GOLD[4]); p.dot(cx - 5, top - 3, GOLD[4]);
    p.each(cx - 6, top - 4, cx + 7, top - 3, (x, y) => { const h = hash2(Math.floor(x * 2), 1, seed); const c = y < top - 3.5 ? (h < 0.35 ? EMB[4] : EMB[3]) : (h < 0.25 ? HOT : EMB[2]); g.dot(x, y, h < 0.35 ? HOT : EMB[4]); return c; });
    for (let x = cx - 5; x <= cx + 5; x += 2) sparkF(p, g, x + 0.5, top - 4.5);
    for (let x = cx - 6; x < cx + 8; x += 1) { p.dot(x, mTop + 8, (x - cx) % 2 ? GOLD[1] : GOLD[3]); p.dot(x + 0.5, mTop + 8.5, GOLD[0]); }
  }
}

function statueBody(p, g, cx, top, base, seed, kind) {
  if (p.fine) { statueBodyFine(p, g, cx, top, base, seed, kind); return; }
  const shade = (x, x0, x1) => { const rel = (x - x0) / Math.max(1, x1 - x0); return rel < 0.22 ? 6 : rel < 0.5 ? 5 : rel < 0.78 ? 4 : 3; };
  const S = BST;
  // Mantel (Trapez) mit Falten
  const mTop = top + 12;
  poly(p, [[cx - 5, mTop], [cx + 6, mTop], [cx + 9, base], [cx - 8, base]], (x, y) => {
    let k = shade(x, cx - 8, cx + 9);
    if ((x - cx + 40) % 4 === 0 && y > mTop + 5) k -= 1;
    if (hash2(x, y, seed) < 0.04) k -= 1;
    return S[Math.max(0, Math.min(6, k))];
  });
  for (let x = cx - 8; x <= cx + 9; x++) p.px(x, base, S[2]);
  // Schultern
  p.rect(cx - 8, mTop - 3, 17, 4, S[4]); p.rect(cx - 8, mTop - 3, 17, 1, S[6]); p.rect(cx + 6, mTop - 2, 3, 3, S[2]);
  p.ellipse(cx - 6, mTop - 1, 2.6, 2, S[5]); p.ellipse(cx + 6, mTop - 1, 2.6, 2, S[3]);
  if (kind === 'king' || kind === 'headless') {
    if (kind === 'king') {
      // Kopf mit Helm und Krone, glühende Augen
      p.rect(cx - 3, top + 2, 7, 8, S[4]); p.rect(cx - 3, top + 2, 2, 8, S[5]); p.rect(cx + 2, top + 3, 2, 7, S[2]);
      p.rect(cx - 3, top + 5, 7, 1, S[1]); p.px(cx - 1, top + 5, EMB[3]); p.px(cx + 2, top + 5, EMB[3]); g.px(cx - 1, top + 5, EMB[4]); g.px(cx + 2, top + 5, EMB[4]);
      for (let i = 0; i < 7; i++) p.px(cx - 3 + i, top + (i % 2 ? 1 : 0), GOLD[i < 3 ? 3 : 2]);
      p.rect(cx - 3, top + 1, 7, 1, GOLD[1]); p.px(cx - 3, top - 1, GOLD[4]); p.px(cx + 3, top - 1, GOLD[2]); p.px(cx, top - 1, GOLD[4]);
      g.px(cx, top - 1, GOLD[2]);
    } else {
      // abgeschlagener Kopf: Bruchfläche
      p.rect(cx - 2, top + 7, 5, 3, S[3]); p.rect(cx - 2, top + 7, 5, 1, S[6]); p.px(cx + 2, top + 8, S[1]);
      emberCrack(p, g, cx + 1, mTop + 2, 9, seed + 3);
    }
    // Schwert, Spitze nach unten, Hände auf dem Knauf
    p.rect(cx, mTop + 1, 2, 2, GOLD[3]);
    p.rect(cx - 3, mTop + 2, 3, 3, S[5]); p.rect(cx + 2, mTop + 2, 3, 3, S[3]); p.px(cx - 3, mTop + 2, S[6]);
    p.rect(cx - 4, mTop + 5, 10, 1, GOLD[2]); p.px(cx - 4, mTop + 5, GOLD[4]); p.px(cx + 5, mTop + 5, GOLD[1]);
    for (let y = mTop + 6; y < base - 1; y++) { p.px(cx, y, IRON[4]); p.px(cx + 1, y, IRON[2]); }
    if (kind === 'headless') { p.rect(cx - 9, mTop - 2, 3, 6, DARK); p.px(cx - 9, mTop + 4, S[5]); }
  } else {
    // Verhüllte Priesterin, hält eine Glutschale über den Kopf
    poly(p, [[cx - 4, top + 12], [cx, top + 4], [cx + 4, top + 12]], (x) => S[shade(x, cx - 4, cx + 4)]);
    p.rect(cx - 2, top + 8, 4, 3, DARK); p.px(cx - 1, top + 9, EMB[2]); g.px(cx - 1, top + 9, EMB[2]);
    // Arme hoch
    p.line(cx - 5, mTop - 1, cx - 6, top - 1, S[5]); p.line(cx - 4, mTop - 1, cx - 5, top - 1, S[4]);
    p.line(cx + 5, mTop - 1, cx + 6, top - 1, S[3]); p.line(cx + 6, mTop - 1, cx + 7, top - 1, S[2]);
    // Schale
    p.rect(cx - 7, top - 3, 15, 3, GOLD[1]); p.rect(cx - 7, top - 3, 15, 1, GOLD[2]); p.rect(cx - 5, top, 11, 1, FER[2]);
    p.rect(cx - 6, top - 4, 13, 1, EMB[2]); g.rect(cx - 6, top - 4, 13, 1, EMB[4]);
    for (let x = cx - 5; x <= cx + 5; x += 2) { p.px(x, top - 5, EMB[3]); g.px(x, top - 5, EMB[4]); }
    // Gürtel mit Goldkette
    p.rect(cx - 6, mTop + 8, 14, 1, GOLD[1]); for (let x = cx - 6; x < cx + 8; x += 3) p.px(x, mTop + 8, GOLD[3]);
  }
}

function statue(v) {
  const W = 32, H = 70;
  const kind = ['king', 'headless', 'priestess'][v];
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 16;
    ashPatch(p, g, cx, bottom - 1, 15, 2, 1381 + v, 0.04);
    if (p.fine) {
      // Sockel fein: Stufen mit Kantenlicht, vertiefte Inschrift-Tafel mit Goldrunen, Abplatzungen, Rußkante
      slabF(p, 2, bottom - 5, 28, 5, { top: RST[7], lip: RST[6], body: RST[4], bot: RST[2], right: RST[2], rw: 2, left: RST[6] });
      slabF(p, 5, bottom - 15, 22, 10, { top: RST[8], lip: RST[6], body: RST[5], bot: RST[2], right: RST[3], rw: 2, left: RST[7] });
      p.each(9, bottom - 12, 22.5, bottom - 7.5, (x, y) => (y < bottom - 11.5 ? RST[1] : y >= bottom - 8 ? RST[6] : x < 9.5 ? RST[2] : x >= 22.5 ? RST[5] : RST[3]));
      for (let x = 10; x < 22; x += 2) { const y = bottom - 10.5 + (x % 4 ? 0.5 : 0); p.fline(x + 0.5, y - 0.5, x + 0.5, y + 0.5, GOLD[2]); p.dot(x, y + 0.5, GOLD[1]); p.dot(x + 1, y - 0.5, GOLD[1]); p.dot(x + 0.5, y - 0.5, GOLD[3]); }
      p.scan(5.5, bottom - 6, 25, bottom - 5.5, (x) => (vnoiseLite(x / 1.6, 0, 1383) < 0.42 ? pal32(SOOT)[1] : 0));
      for (const [x, y] of [[8, bottom - 15], [19.5, bottom - 15], [14, bottom - 5]]) { p.dot(x, y, RST[2]); p.dot(x + 0.5, y, RST[2]); p.dot(x, y + 0.5, RST[6]); }
    } else {
    p.rect(2, bottom - 5, 28, 5, RST[4]); p.rect(2, bottom - 5, 28, 1, RST[7]); p.rect(28, bottom - 4, 2, 4, RST[2]); p.rect(2, bottom - 1, 28, 1, RST[2]);
    p.rect(5, bottom - 15, 22, 10, RST[5]); p.rect(5, bottom - 15, 22, 1, RST[8]); p.rect(5, bottom - 15, 1, 10, RST[6]); p.rect(25, bottom - 14, 2, 9, RST[3]);
    p.rect(9, bottom - 12, 14, 5, RST[3]); p.rect(9, bottom - 12, 14, 1, RST[2]);
    for (let x = 10; x < 22; x += 2) p.px(x, bottom - 10 + (x % 4 ? 1 : 0), GOLD[1]);
    for (let x = 5; x < 27; x++) if (hash2(x, 4, 1383) < 0.3) p.px(x, bottom - 6, SOOT[1]);
    }
    statueBody(p, g, cx, kind === 'priestess' ? 12 : 8, bottom - 16, 1384 + v, kind);
    if (v === 1) { block(p, 23, bottom - 3, 5, 3, BST, 3); if (p.fine) lump(p, 27.5, bottom - 1.5, 2.6, 1.8, BST, { lo: 2, hi: 5 }); else p.ellipse(27, bottom - 2, 2.4, 1.6, BST[4]); }
  }, {
    ax: 16, ay: H - 3, box: [-11, -5, 11, 1], b: true,
    light: v === 2 ? { dx: 0, dy: -60, radius: 72, color: [255, 140, 60], intensity: 0.85 } : undefined,
    extra: v === 2 ? { flames: createFlameFrames(11, 13, 6, 1389), flameAt: { dx: -5, dy: -73 }, embers: { dx: 0, dy: -62, rate: 2 } } : undefined,
  });
}

// ------------------------------------------------------------ Umgestürzte Statue
function fallenStatue(v) {
  const W = 60, H = 28;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, S = BST, cy = bottom - 8;
    ashPatch(p, g, 30, bottom - 2, 28, 3, 1391 + v, 0.03);
    // Liegende Gestalt im Profil: Kopf links, Schultern, Mantel bis zu den Füßen (rechts)
    const r = (x) => {
      if (x < 6) return 0;
      if (x < 15) return v ? 0 : Math.sqrt(Math.max(0, 20 - (x - 10.5) ** 2));      // Kopf
      if (x < 17) return v ? 0 : 2.5;                                                // Hals
      if (x < 31) return 7 - Math.abs(x - 22) * 0.12;                                // Brust/Schultern
      if (x < 33) return 0;                                                          // Bruchfuge
      if (x < 51) return 6 - (x - 33) * 0.12;                                        // Mantel
      if (x < 56) return 3.2;                                                        // Füße
      return 0;
    };
    for (let x = 0; x < W; x++) {
      const rr = r(x);
      if (rr <= 0) continue;
      const top = Math.round(cy - rr), bot = Math.round(cy + rr * 0.55);
      for (let y = top; y <= bot; y++) {
        const rel = (y - top) / Math.max(1, bot - top);
        let k = rel < 0.18 ? 6 : rel < 0.42 ? 5 : rel < 0.7 ? 4 : rel < 0.9 ? 3 : 2;
        if (x >= 33 && x < 51 && (x + y) % 5 === 0 && rel > 0.25) k -= 1;              // Faltenwurf
        if (hash2(x, y, 1392 + v) < 0.04) k -= 1;
        p.px(x, y, S[Math.max(0, Math.min(6, k))]);
      }
      if (hash2(x, 7, 1393) < 0.5) p.px(x, top, ASHT[3]);                              // Asche auf der Oberseite
    }
    // Bruchflächen mit Glut
    for (const bx of [30, 33]) for (let y = cy - 6; y <= cy + 3; y++) { p.px(bx, y, y % 3 === 0 ? EMB[2] : S[3]); if (y % 3 === 0) g.px(bx, y, EMB[3]); }
    block(p, 30, bottom - 3, 3, 2, S, 4);
    if (!v) {
      // Gesicht im Profil (nach oben), Krone nach links
      p.px(10, cy - 5, S[6]); p.px(11, cy - 6, S[6]); p.px(9, cy - 2, DARK); p.px(12, cy - 3, S[2]);
      for (let i = 0; i < 4; i++) { p.px(5 - (i % 2), cy - 3 + i * 2, GOLD[3]); p.px(6, cy - 3 + i * 2, GOLD[2]); }
      p.rect(6, cy - 4, 1, 8, GOLD[1]);
      p.px(9, cy - 1, EMB[3]); g.px(9, cy - 1, EMB[4]);
      // Arme über der Brust, Schwert längs des Körpers
      p.rect(18, cy - 7, 8, 2, S[6]); p.rect(18, cy - 5, 8, 1, S[3]);
      p.rect(26, cy - 8, 2, 3, GOLD[2]); p.px(26, cy - 8, GOLD[4]);
      p.line(28, cy - 7, 29, cy - 7, IRON[3]); p.line(34, cy - 6, 50, cy - 5, IRON[4]); p.line(34, cy - 5, 50, cy - 4, IRON[2]);
    } else {
      // kopflos: Kopf ist weggerollt (rechts), Schulterbruch
      p.ellipse(16, cy - 1, 1.6, 4, S[3]); p.px(16, cy - 1, EMB[2]); g.px(16, cy - 1, EMB[3]);
      p.ellipse(56, bottom - 6, 3.6, 3.4, S[4]); p.ellipse(55, bottom - 7, 2.4, 2, S[5]); p.px(54, bottom - 8, S[6]);
      p.px(55, bottom - 6, DARK); p.px(57, bottom - 6, DARK); p.px(55, bottom - 6, EMB[3]); g.px(55, bottom - 6, EMB[3]);
      for (let i = 0; i < 4; i++) p.px(53 + i * 2, bottom - 10 + (i % 2), GOLD[i % 2 ? 2 : 3]);
      p.rect(19, cy - 8, 9, 3, S[5]); p.rect(19, cy - 8, 9, 1, S[6]);
    }
    // Sockelbrocken bei den Füßen
    block(p, 52, bottom - 4, 6, 4, RST, 4);
    for (let x = 52; x < 58; x += 2) p.px(x, bottom - 2, GOLD[1]);
  }, { ax: 30, ay: H - 3, box: [-24, -7, 26, 1] });
}

// ------------------------------------------------------------ Brunnen (Brunnenplatz)
function fountain() {
  const W = 80, H = 60;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 40, cy = bottom - 13, rx = 34, ry = 11;
    ashPatch(p, g, cx, bottom - 2, 38, 3, 1401, 0.02);
    if (p.fine) { fountainFine(p, g, cx, cy, rx, ry, bottom); return; }
    // Beckeninhalt: Lava mit Kruste
    for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) {
      const d = ((x - cx) / (rx - 3)) ** 2 + ((y - cy) / (ry - 2)) ** 2;
      if (d > 1) continue;
      const n = vnoiseLite(x / 4, y / 2.5, 1402);
      // überwiegend erkaltete Kruste, glühende Adern und zwei heiße Stellen unter den Rinnsalen
      const hot = Math.min(Math.hypot((x - cx + 10) / 5, (y - cy) / 2.5), Math.hypot((x - cx - 9) / 5, (y - cy) / 2.5));
      if (hot < 1) { const k = hot < 0.5 ? 4 : 3; p.px(x, y, EMB[k]); g.px(x, y, EMB[k]); }
      else if (n > 0.47 && n < 0.53) { p.px(x, y, EMB[2]); g.px(x, y, EMB[2]); }
      else p.px(x, y, n > 0.7 ? CHAR[4] : n > 0.35 ? CHAR[3] : CHAR[2]);
    }
    // Beckenrand (Oberseite) als Ring, hinten dunkler
    for (let a = 0; a < 360; a += 1) {
      const t = (a * Math.PI) / 180;
      for (let w = 0; w < 3; w++) {
        const x = Math.round(cx + Math.cos(t) * (rx - w)), y = Math.round(cy + Math.sin(t) * (ry - w * 0.4));
        p.px(x, y, w === 0 ? (Math.sin(t) < 0 ? RST[5] : RST[7]) : w === 1 ? ASHT[3] : RST[4]);
      }
    }
    // Beckenwand vorn (Achteck-Andeutung: senkrechte Fugen)
    for (let x = cx - rx; x <= cx + rx; x++) {
      const t = Math.acos(Math.max(-1, Math.min(1, (x - cx) / rx)));
      const yTop = Math.round(cy + Math.sin(t) * ry) + 1;
      for (let y = yTop; y < yTop + 7; y++) {
        const facet = Math.floor((x - cx + rx) / 10);
        let k = (x - cx) / rx < -0.3 ? 6 : (x - cx) / rx < 0.3 ? 5 : 3;
        if ((x - cx + rx) % 10 === 0) k = 2;
        if (y === yTop) k += 1;
        if (y > yTop + 4 && hash2(x, y, 1403) < 0.5) k -= 2;
        if (hash2(facet, y >> 1, 1404) < 0.06) k -= 1;
        p.px(x, y, RST[Math.max(0, Math.min(8, k))]);
      }
    }
    // Mittelsäule mit Schale und gebrochener Figur
    p.rect(cx - 4, cy - 18, 9, 18, RST[5]); p.rect(cx - 4, cy - 18, 2, 18, RST[7]); p.rect(cx + 3, cy - 18, 2, 18, RST[3]);
    p.ellipse(cx, cy - 18, 12, 3.4, RST[4]); p.ellipse(cx, cy - 19, 11, 2.6, RST[6]); p.ellipse(cx, cy - 19, 8.5, 1.8, EMB[3]);
    g.ellipse(cx, cy - 19, 8.5, 1.8, EMB[4]); p.ellipse(cx, cy - 19, 5, 1, EMB[4]); g.ellipse(cx, cy - 19, 5, 1, EMB[5]);
    p.rect(cx - 12, cy - 18, 24, 2, RST[3]); p.rect(cx - 12, cy - 16, 24, 1, RST[2]);
    // Glutrinnsale von der Schale ins Becken
    for (const sx of [cx - 10, cx + 9]) for (let y = cy - 16; y < cy - 2; y++) { const xx = sx + (y % 5 === 0 ? (sx < cx ? -1 : 1) : 0); p.px(xx, y, EMB[3]); g.px(xx, y, EMB[4]); }
    // Figur: Rumpf einer Wassergöttin, Kopf abgebrochen, Krug im Arm
    p.rect(cx - 3, cy - 34, 7, 14, BST[4]); p.rect(cx - 3, cy - 34, 2, 14, BST[6]); p.rect(cx + 2, cy - 33, 2, 13, BST[2]);
    p.rect(cx - 4, cy - 36, 9, 3, BST[5]); p.rect(cx - 4, cy - 36, 9, 1, BST[6]);
    p.rect(cx - 1, cy - 38, 3, 2, BST[3]); p.px(cx, cy - 38, BST[6]);
    p.ellipse(cx + 5, cy - 30, 3, 3.5, BST[3]); p.ellipse(cx + 4, cy - 31, 2, 2, BST[5]); p.px(cx + 7, cy - 32, EMB[3]); g.px(cx + 7, cy - 32, EMB[4]);
    emberCrack(p, g, cx - 1, cy - 32, 10, 1405);
  }, {
    ax: 40, ay: H - 3, box: [-32, -22, 32, 1],
    light: { dx: 0, dy: -18, radius: 96, color: [255, 120, 46], intensity: 0.9 },
    extra: { embers: { dx: 0, dy: -36, rate: 2 } }, b: true,
  });
}

// Brunnen fein: Lavakruste in gewölbten Schollen mit glühenden Adern (heißer Kern), Beckenrand als Ring mit Kantenlicht,
// Beckenwand in Facetten mit Fugen, Mittelsäule und Schale gerundet, Göttinnenrumpf mit Faltenkanten
function fountainFine(p, g, cx, cy, rx, ry, bottom) {
  const C = pal32(CHAR), E = pal32(EMB), R = RST32(), c0 = cx + 0.5, cy0 = cy + 0.5;
  p.scan(cx - rx, cy - ry, cx + rx + 0.5, cy + ry + 0.5, (x, y) => {
    const nx = (x - c0) / (rx - 2.5), ny = (y - cy0) / (ry - 1.5);
    if (nx * nx + ny * ny > 1) return 0;
    const hot = Math.min(Math.hypot((x - c0 + 10) / 5, (y - cy0) / 2.5), Math.hypot((x - c0 - 9) / 5, (y - cy0) / 2.5));
    if (hot < 1) { const k = hot < 0.35 ? 5 : hot < 0.7 ? 4 : 3; g.dot(x, y, k > 3 ? HOT : EMB[3]); return E[k]; }
    const n = vnoiseLite(x / 4, y / 2.5, 1402);
    if (Math.abs(n - 0.5) < 0.016) { const h = vnoiseLite(x / 3, y / 3, 1407) > 0.62; g.dot(x, y, h ? HOT : EMB[3]); return E[h ? 4 : 3]; }
    if (Math.abs(n - 0.5) < 0.04) { g.dot(x, y, EMB[1]); return E[1]; }
    const m = vnoiseLite((x - 0.6) / 4, (y - 0.5) / 2.5, 1402);
    return C[n > 0.7 ? 4 : n > 0.35 ? (m < n - 0.03 ? 4 : 3) : 2];
  });
  // Beckenrand: Ring (hinten dunkler), Lichtkante innen vorn, Asche obenauf
  p.scan(cx - rx - 0.5, cy - ry - 0.5, cx + rx + 1, cy + ry + 1, (x, y) => {
    const dx = (x - c0) / (rx + 0.3), dy = (y - cy0) / (ry + 0.3), d = Math.sqrt(dx * dx + dy * dy);
    const w = (1 - d) * (rx + 0.3);
    if (d > 1 || w > 2.6) return 0;
    if (w < 0.5) return R[dy < 0 ? 4 : 6];
    if (w < 1.6) return dy < 0 ? R[5] : vnoiseLite(x / 2, y, 1406) > 0.55 ? ASHT32()[3] : R[7];
    return w < 2.1 ? R[dy < 0 ? 3 : 4] : R[2];
  });
  // Beckenwand vorn: Facetten mit Fugen, Licht links, Ruß unten
  p.scan(cx - rx, cy, cx + rx + 0.5, cy + ry + 8, (x, y) => {
    const u = (x - c0) / (rx + 0.3); if (Math.abs(u) > 1) return 0;
    const yTop = cy0 + Math.sqrt(1 - u * u) * (ry + 0.3) + 0.3;
    if (y < yTop || y > yTop + 7) return 0;
    const fx = (x - cx + rx) / 10, f = fx - Math.floor(fx);
    let k = u < -0.3 ? 6 : u < 0.3 ? 5 : 3;
    if (f < 0.05) k = 1; else if (f < 0.1) k += 1;
    if (y < yTop + 0.5) k += 2; else if (y < yTop + 1) k += 1;
    if (y > yTop + 7 - sootAt(x, 3.5, 1403)) k -= 2;
    return R[Math.max(0, Math.min(8, k))];
  });
  // Mittelsäule
  p.scan(cx - 4, cy - 18, cx + 5 - 0.5, cy - 0.5, (x) => { const u = (x - c0) / 4.5; return R[u < -0.7 ? 7 : u < -0.2 ? 6 : u < 0.4 ? 5 : u < 0.75 ? 4 : 3]; });
  for (const y of [cy - 10, cy - 5]) { p.fline(cx - 4, y, cx + 4.5, y, RST[2]); p.fline(cx - 4, y + 0.5, cx + 4.5, y + 0.5, RST[6]); }
  // Schale: Unterseite, Rand, Glutbecken mit heißem Kern
  p.oval(c0, cy - 17, 12.3, 3.2, RST[3]); p.oval(c0, cy - 17.6, 12, 2.8, RST[5]); p.oval(c0 - 0.3, cy - 18.6, 11.4, 2.4, RST[7]);
  p.oval(c0, cy - 18.4, 9.6, 1.9, RST[2]); p.oval(c0, cy - 18.2, 8.8, 1.6, EMB[2]); p.oval(c0, cy - 18.2, 7, 1.15, EMB[4]); p.oval(c0, cy - 18.2, 4.5, 0.7, HOT);
  g.oval(c0, cy - 18.2, 8.8, 1.6, EMB[3]); g.oval(c0, cy - 18.2, 6, 1, HOT);
  // Glutrinnsale von der Schale ins Becken
  for (const sx of [cx - 10, cx + 9]) {
    const d = sx < cx ? -1 : 1, pts = [];
    for (let y = cy - 16; y < cy - 2; y++) pts.push([sx + 0.5 + (y % 5 === 0 ? d * 0.5 : 0), y]);
    for (let i = 0; i + 1 < pts.length; i++) { const [a, b] = pts[i], [c, e] = pts[i + 1]; p.fline(a - 0.25, b, c - 0.25, e, EMB[2], 1); g.fline(a - 0.25, b, c - 0.25, e, EMB[3], 1); p.fline(a, b, c, e, i % 3 ? EMB[4] : HOT); g.fline(a, b, c, e, HOT); }
  }
  // Figur: Rumpf einer Wassergöttin, Kopf abgebrochen, Krug im Arm
  p.scan(cx - 3, cy - 34, cx + 4 - 0.5, cy - 20.5, (x, y) => { const u = (x - c0) / 3.5; let k = u < -0.6 ? 6 : u < -0.1 ? 5 : u < 0.45 ? 4 : 2; if (((x - cx + 3) * 2 | 0) % 3 === 2 && y > cy - 30 && k > 2) k -= 1; return pal32(BST)[k]; });
  slabF(p, cx - 4, cy - 36, 9, 3, { top: BST[6], body: BST[5], bot: BST[2], right: BST[2], rw: 2, left: BST[6] });
  fpoly(p, [[cx - 1, cy - 36], [cx - 1, cy - 37.5], [cx, cy - 38.5], [cx + 1.5, cy - 37.5], [cx + 2, cy - 36]], (x, y) => (y < cy - 37.5 ? BST[6] : x < cx + 0.5 ? BST[4] : BST[2]));
  lump(p, cx + 5.5, cy - 29.5, 3, 3.5, BST, { lo: 2, hi: 5 }); p.oval(cx + 4.5, cy - 31.5, 1.6, 1, BST[5]);
  p.dot(cx + 7, cy - 32, EMB[3]); p.dot(cx + 7.5, cy - 32, HOT); g.dot(cx + 7.5, cy - 32, HOT); g.dot(cx + 7, cy - 32, EMB[4]);
  emberCrack(p, g, cx - 1, cy - 32, 10, 1405);
}

// ------------------------------------------------------------ Obsidiannadeln (Labyrinthwände)
function obsidianNeedle(v) {
  const H = [44, 56, 38, 50][v], W = 20;
  const spires = [
    [[10, 2, 4.5, 0], [4, 18, 3, -1], [16, 22, 3, 1]],
    [[9, 1, 4, -1], [15, 12, 3.5, 2], [4, 24, 2.5, -1]],
    [[11, 4, 5, 1], [5, 16, 3, -2]],
    [[7, 3, 4, -1], [14, 8, 4, 1], [10, 26, 3, 0]],
  ][v];
  return mk(W, H, (p, g) => {
    const bottom = H - 1, base = bottom - 6;
    if (p.fine) {
      // Sockel aus Obsidiangrus: Brocken mit hellen Oberkanten (gleiche Kontur wie früher)
      const O = pal32(OBS);
      p.scan(0, base - 2, W - 0.5, bottom + 0.5, (x, y) => {
        const X = Math.floor(x), Y = Math.floor(y), e = Math.abs(X - 9.5) - 9;
        if (Y < base + 1 && (X < 2 || X > 17) && hash2(X, Y, 1411) < 0.6) return 0;
        if (e > 0 && hash2(X, Y, 1412) < 0.5) return 0;
        if (Y === bottom) return O[1];
        const n = vnoiseLite(x / 1.7, y / 1.2, 1413 + v), m = vnoiseLite(x / 1.7, (y - 0.5) / 1.2, 1413 + v);
        return n > 0.5 && m <= 0.5 ? O[5] : n > 0.62 ? O[4] : n > 0.4 ? O[3] : n > 0.25 ? O[2] : O[1];
      });
      const order = [...spires].sort((a, b) => a[1] - b[1]);
      for (const [x, tipY, hw, lean] of order) shardF(p, g, x, tipY, hw, lean, base, { glint: 0.25, bright: 1, seed: 1410 + v, ember: hash2(x, tipY, 1417 + v) < 0.25 });
      return;
    }
    // Sockel aus Obsidiangrus (deckt die Kachel)
    for (let y = base - 2; y <= bottom; y++) for (let x = 0; x < W; x++) {
      const e = Math.abs(x - 9.5) - 9 + (bottom - y) * 0.0;
      if (y < base + 1 && (x < 2 || x > 17) && hash2(x, y, 1411) < 0.6) continue;
      if (e > 0 && hash2(x, y, 1412) < 0.5) continue;
      const h = hash2(x, y, 1413 + v);
      p.px(x, y, y === bottom ? OBS[1] : h < 0.15 ? OBS[4] : h < 0.5 ? OBS[2] : OBS[3]);
    }
    const order = [...spires].sort((a, b) => a[1] - b[1]);
    for (const [x, tipY, hw, lean] of order) {
      const tx = x + lean;
      poly(p, [[tx + 0.5, tipY], [x - hw, base + 1], [x + 0.5, base + 1]], (xx, yy) => {
        const k = (yy - tipY) / (base - tipY);
        return k < 0.12 ? OBS[6] : hash2(xx, yy, 1414) < 0.08 ? OBS[3] : k < 0.5 ? OBS[5] : OBS[4];
      });
      poly(p, [[tx + 0.5, tipY], [x + 0.5, base + 1], [x + hw + 1, base + 1]], (xx, yy) => {
        const k = (yy - tipY) / (base - tipY);
        return k > 0.8 && hash2(xx, yy, 1415) < 0.5 ? '#3a1414' : hash2(xx, yy, 1416) < 0.12 ? OBS[2] : OBS[1];
      });
      p.line(tx, tipY + 1, x, base, OBS[5]);
      // Glanzlicht und schwacher Glutkern
      const gy = tipY + Math.round((base - tipY) * 0.25), gx = Math.round(tx + (x - tx) * 0.25) - 1;
      p.px(gx, gy, OBS[6]); p.px(gx, gy + 1, OBS[6]); p.px(gx, gy + 2, OBS[5]); p.px(tx, tipY, OBS[6]);
      g.px(gx, gy, '#4a2040'); g.px(tx, tipY, '#3a1838');
      const ey = base - Math.round((base - tipY) * 0.2);
      p.px(x + 1, ey, EMB[1]); g.px(x + 1, ey, EMB[2]);
    }
  }, { ax: 10, ay: H - 2, b: true });
}

// ------------------------------------------------------------ Kohlebecken auf Dreibein
const BRAZIER_FLAMES = () => createFlameFrames(9, 12, 6, 1421);
function brazierStand() {
  const W = 16, H = 26;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 8, by = 9;
    p.ellipse(cx, bottom - 1, 6, 1.4, ASHB[2]);
    // Beine
    p.line(cx - 1, by + 3, cx - 5, bottom - 1, FER[2]); p.line(cx, by + 3, cx - 4, bottom - 1, FER[3]);
    p.line(cx + 1, by + 3, cx + 5, bottom - 1, FER[1]); p.line(cx, by + 4, cx, bottom - 2, FER[1]);
    p.rect(cx - 3, by + 9, 7, 1, FER[2]);
    // Schale mit Glut
    p.rect(cx - 5, by, 11, 3, FER[2]); p.rect(cx - 5, by, 11, 1, FER[4]); p.rect(cx - 4, by + 3, 9, 1, FER[1]); p.px(cx + 5, by + 1, FER[1]);
    p.px(cx - 5, by - 1, FER[4]); p.px(cx + 5, by - 1, FER[3]);
    p.rect(cx - 4, by - 1, 9, 1, EMB[2]); g.rect(cx - 4, by - 1, 9, 1, EMB[4]); p.px(cx, by - 1, EMB[4]); g.px(cx, by - 1, EMB[5]);
  }, {
    ax: 8, ay: H - 3, box: [-4, -3, 4, 1],
    light: { dx: 0, dy: -18, radius: 66, color: [255, 140, 60], intensity: 0.85 },
    extra: { flames: BRAZIER_FLAMES(), flameAt: { dx: -4, dy: -32 }, embers: { dx: 0, dy: -24, rate: 1.2 } },
  });
}

// ------------------------------------------------------------ Brückenteile
// Brüstung (Ost-West-Brücke): Kachel ganz bedeckt (Brückenrand), Brüstungsmauer mit Pfosten
function bridgeRail() {
  const W = 16, H = 20;
  return mk(W, H, (p, g) => {
    const bottom = H - 1;
    // Brückenrand von oben (Deckplatten)
    if (p.fine) p.scan(0, 2, W - 0.5, 8.5, (x, y) => { const P = RST32(), u = x % 8; return y < 2.5 || u < 0.5 ? P[3] : y < 3 || u < 1 ? P[6] : u >= 7.5 ? P[3] : P[vnoiseLite(x / 2.5, y / 1.5, 1431) < 0.5 ? 5 : 4]; });
    else for (let y = 2; y < 9; y++) for (let x = 0; x < W; x++) p.px(x, y, (x % 8 === 0 || y === 2) ? RST[3] : hash2(x, y, 1431) < 0.5 ? RST[5] : RST[4]);
    // Brüstung: Krone + Front
    const tops = Array(W).fill(6);
    wallFace(p, g, tops, 3, bottom, 1432, { base: 4, soot: 3, warm: 4 });
    // Pfosten mit Kappe
    p.rect(0, 3, 4, bottom - 2, RST[5]); p.rect(0, 3, 4, 1, RST[8]); p.rect(0, 4, 1, bottom - 3, RST[7]); p.rect(3, 4, 1, bottom - 3, RST[3]);
    p.rect(0, 2, 4, 1, RST[6]);
    if (p.fine) { p.fline(0, 2, 3.5, 2, RST[8]); p.fline(0.5, 4, 0.5, bottom, RST[8]); p.fline(3.5, 4, 3.5, bottom, RST[2]); p.fline(0, 3.5, 3.5, 3.5, RST[6]); for (let y = 8; y < bottom; y += 5) p.fline(1, y, 3, y, RST[3]); }
    // Glutschein von unten (Lava neben der Brücke)
    if (p.fine) p.scan(0, bottom, W - 0.5, bottom + 0.5, (x, y) => { const n = vnoiseLite(x / 2, 0, 1433); if (n < 0.45) return 0; g.dot(x, y, n > 0.6 && y > bottom + 0.4 ? EMB[3] : EMB[2]); return pal32(EMB)[n > 0.62 && y > bottom + 0.4 ? 3 : n > 0.55 ? 2 : 1]; });
    else for (let x = 0; x < W; x++) if (hash2(x, 9, 1433) < 0.5) { p.px(x, bottom, EMB[1]); g.px(x, bottom, EMB[2]); }
  }, { ax: 8, ay: H - 4, b: true });
}

function bridgeRailV() {
  const W = 16, H = 22;
  return mk(W, H, (p, g) => {
    const bottom = H - 1;
    // Brückenflanke von oben, schmale Brüstung in der Mitte
    if (p.fine) {
      const P = RST32();
      p.scan(1, 2, 14.5, bottom - 3.5, (x, y) => { const v6 = (y + 4) % 6, u = x - 8; return v6 < 0.5 || (u >= 0 && u < 0.5) ? P[2] : v6 < 1 || (u >= 0.5 && u < 1) ? P[6] : x < 1.5 ? P[6] : x >= 14.5 ? P[2] : P[vnoiseLite(x / 2.5, y / 2, 1441) < 0.5 ? 5 : 4]; });
      p.scan(6, 0, 9.5, bottom - 5.5, (x) => (x < 6.5 ? P[8] : x < 7 ? P[7] : x < 8 ? ASHT32()[3] : x < 9 ? P[5] : P[3]));
      p.scan(6, bottom - 5, 9.5, bottom + 0.5, (x, y) => brickFine(x, y, bottom, 1442, { bw: 4, W: 16 }));
      p.scan(1, bottom - 3, 14.5, bottom - 2.5, (x, y) => { const n = vnoiseLite(x / 1.8, 3, 1443); if (n < 0.5) return 0; g.dot(x, y, n > 0.62 ? EMB[3] : EMB[2]); return pal32(EMB)[n > 0.65 && y > bottom - 2.75 ? 4 : n > 0.58 ? 2 : 1]; });
      return;
    }
    for (let y = 2; y <= bottom - 4; y++) for (let x = 1; x < 15; x++) p.px(x, y, (y % 6 === 2 || x === 8) ? RST[3] : hash2(x, y, 1441) < 0.5 ? RST[5] : RST[4]);
    for (let y = 0; y <= bottom - 6; y++) { p.px(6, y, RST[7]); p.px(7, y, ASHT[3]); p.px(8, y, RST[6]); p.px(9, y, RST[4]); }
    for (let y = bottom - 5; y <= bottom; y++) for (let x = 6; x <= 9; x++) p.px(x, y, RST[brickK(x, bottom - y, 1442, { bw: 4 })]);
    for (let x = 1; x < 15; x++) if (hash2(x, 3, 1443) < 0.4) { p.px(x, bottom - 3, EMB[1]); g.px(x, bottom - 3, EMB[2]); }
  }, { ax: 8, ay: H - 6, b: true });
}

// Pfeilerfront unter der Südbrüstung: Bogen über der Lava oder Strompfeiler
function bridgePier(v) {
  const W = 16, H = 20;
  return mk(W, H, (p, g) => {
    const bottom = H - 1;
    if (p.fine) {
      // Mauerwerk mit feinem Steinschnitt, Bogen glatt mit Keilsteinkranz, Lava unten mit heißem Kern
      p.scan(0, 0, W - 0.5, bottom - 1.5, (x, y) => brickFine(x, y, bottom, 1451, { base: y > bottom - 6.5 ? 2 : 3, W, warm: 4 }));
      if (v === 1) {
        p.each(1, 3, 15, bottom - 1.5, (x, y) => {
          const r = Math.hypot((x - 8) / 6, (Math.min(y, 10) - 10) / 5);
          if (r > 1) { const ro = Math.hypot((x - 8) / 7.2, (Math.min(y, 10) - 10) / 6.2); if (ro > 1 || y > 10) return null; const a = Math.atan2(10 - y, x - 8) * 2.6, f = a - Math.floor(a); return f < 0.12 ? RST[1] : ro > 0.93 ? RST[7] : x < 8 ? RST[6] : RST[4]; }
          const hb = bottom - 1 - y;
          if (hb < 3) { const n = vnoiseLite(x / 1.6, 0, 1453); const hot = hb < 1 && n > 0.6; g.dot(x, y, hot ? EMB[3] : EMB[2]); return hot ? EMB[4] : hb < 2 ? EMB[3] : EMB[2]; }
          if (hb < 5) return '#3a1408';
          return Math.hypot((x - 7.5) / 6, (Math.min(y, 10) - 10) / 5) > 1 ? RST[3] : DARK;
        });
      } else {
        slabF(p, 5, 2, 6, bottom - 3, { top: RST[8], body: RST[5], bot: RST[3], left: RST[7], right: RST[3] });
        fpoly(p, [[4, bottom - 6], [12, bottom - 6], [8, bottom]], (x) => (x < 8 ? RST[5] : RST[3]));
        p.fline(4, bottom - 6, 8, bottom, RST[7]); p.fline(4, bottom - 6, 11.5, bottom - 6, RST[6]);
      }
      p.scan(0, bottom - 1, W - 0.5, bottom + 0.5, (x, y) => { const n = vnoiseLite(x / 2, 0, 1452); const low = y >= bottom - 0.25, hot = low && n > 0.58; g.dot(x, y, hot ? EMB[3] : EMB[2]); return hot ? pal32(EMB)[n > 0.74 ? 5 : 4] : pal32(EMB)[y < bottom - 0.5 ? 1 : low ? 3 : 2]; });
      return;
    }
    for (let y = 0; y <= bottom - 2; y++) for (let x = 0; x < W; x++) {
      let k = brickK(x, bottom - y, 1451, { base: 3 });
      if (y > bottom - 7) k -= 1;
      p.px(x, y, RST[Math.max(0, Math.min(8, k))]);
    }
    if (v === 1) {
      // Bogenöffnung: dunkel, unten Glut der Lava
      for (let y = 5; y <= bottom - 2; y++) for (let x = 2; x <= 13; x++) {
        if (y < 10 && ((x - 7.5) ** 2) / 36 + ((y - 10) ** 2) / 25 > 1) continue;
        p.px(x, y, y > bottom - 5 ? EMB[2] : y > bottom - 7 ? '#3a1408' : DARK);
        if (y > bottom - 5) g.px(x, y, EMB[3]);
      }
      for (let a = 0; a <= 10; a++) { const t = Math.PI + (a / 10) * Math.PI; p.px(Math.round(7.5 + Math.cos(t) * 7), Math.round(10 + Math.sin(t) * 6), RST[6]); }
    } else {
      // Strompfeiler mit Wellenbrecher
      p.rect(5, 2, 6, bottom - 3, RST[5]); p.rect(5, 2, 1, bottom - 3, RST[7]); p.rect(10, 3, 1, bottom - 4, RST[3]);
      poly(p, [[4, bottom - 6], [12, bottom - 6], [8, bottom]], RST[4]);
      p.line(4, bottom - 6, 8, bottom, RST[6]);
    }
    for (let x = 0; x < W; x++) { p.px(x, bottom - 1, EMB[2]); g.px(x, bottom - 1, EMB[3]); if (hash2(x, 1, 1452) < 0.5) { p.px(x, bottom, EMB[3]); g.px(x, bottom, EMB[4]); } }
  }, { ax: 8, ay: H - 5, b: true });
}

// ------------------------------------------------------------ Erkaltete Lavakruste (Furt)
function lavaCrust(v) {
  const W = 18, H = 14;
  const rng = createRng(1460 + v);
  const cells = [];
  for (let i = 0; i < 6; i++) cells.push([rng.range(1, 17), rng.range(2, 12)]);
  return mk(W, H, (p, g) => {
    if (p.fine) {
      // Krustenschollen gewölbt (Licht oben links), Fugen glühend: heißer Kern in der Fugenmitte, roter Saum
      const C = pal32(CHAR), E = pal32(EMB);
      p.scan(0, 1, W - 0.5, H - 1.5, (x, y) => {
        const ex = ((x - 9) / 9) ** 2 + ((y - 7) / 6) ** 2;
        if (ex > 1 - 0.12 * vnoiseLite(x / 1.5, y / 1.5, 1460 + v)) return 0;
        let d1 = 99, d2 = 99, bx = 0, by = 0, sx = 0, sy = 0;
        for (const [cx, cy] of cells) {
          const d = Math.hypot(x - cx - 0.5, (y - cy - 0.5) * 1.3);
          if (d < d1) { d2 = d1; sx = bx; sy = by; d1 = d; bx = cx + 0.5; by = cy + 0.5; } else if (d < d2) { d2 = d; sx = cx + 0.5; sy = cy + 0.5; }
        }
        const gap = (d2 * d2 - d1 * d1) / (2 * Math.max(0.5, Math.hypot(bx - sx, (by - sy) * 1.3)));
        if (gap < 0.25) { const n = vnoiseLite(x / 2, y / 2, 1461 + v); g.dot(x, y, n > 0.6 ? HOT : EMB[3]); return E[n > 0.68 ? 5 : n > 0.45 ? 4 : 3]; }
        if (gap < 0.5) { g.dot(x, y, EMB[1]); return E[2]; }
        if (gap < 0.75) return E[1];
        const l = shade((x - bx) / 3, (y - by) / 2.4);
        return C[stepOf(l - 0.15, 1, 4) + (gap > 2.5 && l > 0.75 ? 1 : 0)];
      });
      return;
    }
    for (let y = 1; y < H - 1; y++) for (let x = 0; x < W; x++) {
      if (((x - 8.5) / 9) ** 2 + ((y - 6.5) / 6) ** 2 > 1 - hash2(x, y, 1460 + v) * 0.15) continue;
      let d1 = 99, d2 = 99;
      for (const [cx, cy] of cells) { const d = Math.hypot(x - cx, (y - cy) * 1.3); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
      if (d2 - d1 < 0.7) { const hot = hash2(x, y, 1461 + v) < 0.3; p.px(x, y, hot ? EMB[2] : EMB[1]); if (hot) g.px(x, y, EMB[2]); continue; }
      const h = hash2(x, y, 1462 + v);
      p.px(x, y, d1 < 1.6 ? CHAR[4] : h < 0.3 ? CHAR[3] : CHAR[2]);
      if (d1 < 1 && h < 0.4) p.px(x, y, CHAR[5]);
    }
  }, { ax: 9, ay: H - 4, b: true });
}

// ------------------------------------------------------------ Kolossreste (Kolossfeld)
function colossusRemains(v) {
  const rng = createRng(1470 + v);
  if (v === 0) {
    // Riesiges Kronhelm-Haupt, bis zum Kinn in der Asche versunken; ein Auge glimmt noch
    const W = 80, H = 60;
    return mk(W, H, (p, g) => {
      const bottom = H - 1, cx = 40, cy = 32, rx = 25, ry = 24;
      const missing = (x, y) => x > cx + 9 && y < cy - 8 && (x - cx - 9) * 0.9 + (cy - 8 - y) > 6 + hash2(x >> 1, y >> 1, 1477) * 5;
      for (let y = cy - ry; y <= bottom - 6; y++) for (let x = cx - rx; x <= cx + rx; x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d > 1 || missing(x, y)) continue;
        const lit = (cx - x) * 0.55 + (cy - y) * 0.7;
        let k = lit > 13 ? 6 : lit > 5 ? 5 : lit > -4 ? 4 : lit > -12 ? 3 : 2;
        if (d > 0.9) k -= 1;
        if (hash2(x >> 1, y >> 1, 1472) < 0.05) k -= 1;
        p.px(x, y, BAS[Math.max(0, Math.min(6, k))]);
      }
      // Bruchkante oben rechts: Hohlraum mit Glut
      for (let y = cy - ry; y < cy - 6; y++) for (let x = cx + 8; x <= cx + rx; x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d > 0.97 || !missing(x, y)) continue;
        if (!missing(x - 1, y + 1) || !missing(x - 2, y + 2)) { p.px(x, y, BAS[1]); if (hash2(x, y, 1478) < 0.3) { p.px(x, y, EMB[2]); g.px(x, y, EMB[3]); } }
      }
      // Helmkamm
      for (let y = cy - ry + 1; y < cy - 4; y++) { p.px(cx - 1, y, BAS[6]); p.px(cx, y, BAS[5]); p.px(cx + 1, y, BAS[2]); }
      // Kronreif mit Zacken (zwei abgebrochen)
      for (let x = cx - 22; x <= cx + 8; x++) { const y = Math.round(cy - 12 + ((x - cx) / rx) ** 2 * 6); p.px(x, y, GOLD[2]); p.px(x, y + 1, GOLD[1]); if ((x - cx) % 3 === 0) p.px(x, y, GOLD[3]); }
      for (const [sx, len] of [[-20, 6], [-13, 9], [-6, 3], [1, 10], [7, 2]]) {
        const x = cx + sx, y = Math.round(cy - 12 + (sx / rx) ** 2 * 6);
        for (let i = 1; i <= len; i++) { p.px(x, y - i, i === len ? GOLD[4] : GOLD[3]); if (i < len - 2) p.px(x + 1, y - i, GOLD[1]); }
      }
      // Gesichtsplatte mit T-Visier
      for (let y = cy - 4; y <= bottom - 6; y++) for (let x = cx - 16; x <= cx + 16; x++) {
        const edge = Math.abs(x - cx) > 15 - Math.max(0, y - (cy + 10)) * 0.6;
        if (edge) continue;
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1) continue;
        const k = x < cx - 6 ? 5 : x < cx + 4 ? 4 : 3;
        p.px(x, y, BAS[k - ((x + y) % 9 === 0 ? 1 : 0)]);
      }
      p.rect(cx - 14, cy + 1, 29, 3, DARK); p.rect(cx - 1, cy + 1, 3, 15, DARK);
      p.rect(cx - 14, cy + 4, 13, 1, BAS[6]); p.rect(cx + 2, cy + 4, 13, 1, BAS[3]);
      // Augenglut (links hell, rechts erloschen)
      p.rect(cx - 11, cy + 2, 6, 1, EMB[4]); p.rect(cx - 10, cy + 1, 4, 1, EMB[3]); g.rect(cx - 11, cy + 1, 6, 2, EMB[5]);
      p.px(cx + 8, cy + 2, EMB[1]); g.px(cx + 8, cy + 2, EMB[2]);
      // Risse
      emberCrack(p, g, cx - 9, cy - 20, 9, 1473); emberCrack(p, g, cx + 6, cy + 6, 8, 1474); emberCrack(p, g, cx - 20, cy - 2, 6, 1479);
      // Asche angeweht oben und als Hügel vorn (verschluckt das Kinn)
      for (let i = 0; i < 50; i++) { const x = cx - 18 + rng.int(0, 24), y = cy - ry + 2 + rng.int(0, 6); if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 0.9 && !missing(x, y)) p.px(x, y, ASHT[rng.int(2, 4)]); }
      for (let y = bottom - 12; y <= bottom; y++) for (let x = 2; x < W - 2; x++) {
        const hgt = bottom - 1 - (11 - Math.abs(x - cx) * 0.3 + Math.sin(x * 0.25) * 1.5);
        if (y < hgt) continue;
        const h = hash2(x, y, 1480);
        p.px(x, y, y === Math.ceil(hgt) ? ASHT[3] : h < 0.3 ? ASHB[3] : h < 0.8 ? ASHB[2] : ASHB[1]);
        if (h > 0.985) { p.px(x, y, EMB[2]); g.px(x, y, EMB[3]); }
      }
      block(p, 5, bottom - 5, 6, 4, BAS, 4); block(p, 68, bottom - 4, 7, 4, BAS, 3);
    }, {
      ax: 40, ay: H - 3, box: [-27, -12, 27, 1], light: { dx: -8, dy: -26, radius: 54, color: [255, 120, 40], intensity: 0.65 },
      // fein: glimmendes Auge mit weißem Kern, Risse mit heißem Kern, Glanz auf Kronreif und Helmkamm
      fine: (f, g) => {
        const cx = 40, cy = 32;
        f.fline(cx - 10.5, cy + 2, cx - 6, cy + 2, HOT); f.fline(cx - 9.5, cy + 1.5, cx - 7, cy + 1.5, EMB[4]); g.fline(cx - 11, cy + 2, cx - 5.5, cy + 2, HOT);
        f.fline(cx - 14, cy + 4, cx - 1.5, cy + 4, BAS[6]); f.fline(cx - 14, cy + 0.5, cx - 1.5, cy + 0.5, BAS[0]);
        crackCore(f, g, cx - 9, cy - 20, 9, 1473); crackCore(f, g, cx + 6, cy + 6, 8, 1474); crackCore(f, g, cx - 20, cy - 2, 6, 1479);
        for (const [sx, len] of [[-20, 6], [-13, 9], [-6, 3], [1, 10], [7, 2]]) { const x = cx + sx, y = Math.round(cy - 12 + (sx / 25) ** 2 * 6); f.dot(x, y - len, '#ffffff'); f.fline(x, y - len + 0.5, x, y - 1, GOLD[4]); }
        f.fline(cx - 1, cy - 23, cx - 1, cy - 5, BAS[6]);
      },
    });
  }
  // Riesenfaust im Panzerhandschuh ragt aus der Asche, das Schwert senkrecht in den Boden gerammt
  const W = 66, H = 72;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, gx = 34;
    ashPatch(p, g, 33, bottom - 3, 31, 4, 1475, 0.04);
    // Klinge vom Parier abwärts in den Boden
    for (let y = 36; y <= bottom - 4; y++) {
      const hw = 3 - (y > bottom - 12 ? 1 : 0);
      for (let x = gx - hw; x <= gx + hw + 1; x++) p.px(x, y, x <= gx ? IRON[x === gx - hw ? 4 : 3] : IRON[x === gx + hw + 1 ? 1 : 2]);
      p.px(gx, y, IRON[5]);
    }
    for (let i = 0; i < 5; i++) { const y = 42 + i * 5; p.px(gx + 1, y, EMB[3]); g.px(gx + 1, y, EMB[4]); }
    p.rect(gx - 2, bottom - 5, 7, 2, ASHB[3]);
    // Unterarm schräg aus der Asche (links unten -> Faust)
    poly(p, [[4, bottom - 3], [20, bottom - 2], [30, 30], [16, 24]], (x, y) => {
      const lit = (30 - x) * 0.45 - (y - 24) * 0.12;
      return BAS[lit > 7 ? 5 : lit > 3 ? 4 : 3];
    });
    for (let i = 0; i < 5; i++) { const t = i / 5, x0 = 6 + t * 12, y0 = bottom - 6 - t * 38; p.line(x0, y0, x0 + 14, y0 + 1, GOLD[1]); p.line(x0, y0 + 1, x0 + 14, y0 + 2, BAS[2]); }
    // Faust (Knöchel zum Betrachter), Griff läuft hindurch
    p.ellipse(gx, 25, 13, 9, BAS[3]); p.ellipse(gx - 2, 23, 10, 6, BAS[4]); p.ellipse(gx - 5, 21, 5, 3, BAS[5]);
    for (let i = 0; i < 4; i++) { const fx = gx - 10 + i * 5; p.rect(fx, 22, 5, 8, BAS[i < 2 ? 4 : 3]); p.rect(fx, 22, 5, 1, BAS[6]); p.rect(fx + 4, 23, 1, 7, BAS[1]); p.px(fx + 1, 24, GOLD[2]); }
    p.rect(gx - 12, 26, 6, 6, BAS[5]); p.rect(gx - 12, 26, 6, 1, BAS[6]); // Daumen
    // Griff, Knauf oben, Parierstange unten
    p.rect(gx - 1, 10, 3, 12, LEA[2]); p.px(gx - 1, 12, LEA[3]); p.px(gx - 1, 16, LEA[3]);
    p.ellipse(gx, 8, 3, 2.6, GOLD[2]); p.px(gx - 1, 7, GOLD[4]); p.px(gx, 8, EMB[4]); g.px(gx, 8, EMB[5]);
    p.rect(gx - 13, 32, 28, 3, GOLD[2]); p.rect(gx - 13, 32, 28, 1, GOLD[4]); p.rect(gx - 13, 34, 28, 1, GOLD[1]);
    p.px(gx - 14, 33, GOLD[3]); p.px(gx + 15, 33, GOLD[1]);
    emberCrack(p, g, 14, bottom - 26, 9, 1476); emberCrack(p, g, gx + 6, 20, 5, 1481);
    block(p, 50, bottom - 5, 6, 4, BAS, 4); block(p, 56, bottom - 3, 4, 3, BAS, 3);
  }, {
    ax: 33, ay: H - 3, box: [-26, -8, 22, 1], light: { dx: 1, dy: -63, radius: 40, color: [255, 120, 40], intensity: 0.5 },
    // fein: Glutrunen auf der Klinge und Knaufstein mit heißem Kern, Klingenglanz, Risse mit Kern, Goldkanten
    fine: (f, g) => {
      const gx = 34, bottom = H - 1;
      for (let i = 0; i < 5; i++) { const y = 42 + i * 5; f.dot(gx + 1.25, y + 0.25, HOT); g.dot(gx + 1.25, y + 0.25, HOT); }
      f.dot(gx, 8, HOT); f.dot(gx + 0.5, 8.5, EMB[4]); g.dot(gx, 8, HOT); f.dot(gx - 1.5, 7, '#ffffff');
      f.fline(gx - 2.5, 37, gx - 2.5, bottom - 6, IRON[5]); f.dot(gx - 2.5, 38, '#ffffff');
      f.fline(gx - 13, 32, gx + 14.5, 32, GOLD[4]); f.dot(gx - 13, 32, '#ffffff');
      crackCore(f, g, 14, bottom - 26, 9, 1476); crackCore(f, g, gx + 6, 20, 5, 1481);
      for (let i = 0; i < 4; i++) { const fx = gx - 10 + i * 5; f.fline(fx, 22, fx + 4.5, 22, BAS[6]); f.dot(fx + 1, 24, GOLD[4]); }
    },
  });
}

// ------------------------------------------------------------ Torpfeiler der Stadtmauer
function gatePylon() {
  const W = 24, H = 62;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, x0 = 2, x1 = 21;
    if (p.fine) {
      // Schaft fein (Steinschnitt, Lichtkante links, Schattenseite rechts), Gesims, Bruchkrone, Relief, Banner, Feuerschale
      const P = RST32();
      p.scan(x0, 12, x1 + 0.5, bottom + 0.5, (x, y) => (x < x0 + 0.5 ? P[7] : x < x0 + 1 ? P[6] : x >= x1 ? P[1] : x >= x1 - 1 ? P[2] : brickFine(x, y, bottom, 1481, { bw: 6, base: 4, soot: 6, W: 24 })));
      slabF(p, x0 - 2, 10, x1 - x0 + 5, 3, { top: RST[8], lip: RST[7], body: RST[6], bot: RST[2], right: RST[3], rw: 2, left: RST[7] });
      p.scan(x0, 2, x1 + 0.5, 9.5, (x, y) => { const X = Math.floor(x), t = 3 + Math.round(Math.abs(Math.sin(X * 0.7)) * 3 + (X > 14 ? (X - 14) * 0.8 : 0)); if (y < t || y >= 10) return 0; return y < t + 0.5 ? ASHT32()[3] : y < t + 1 ? P[6] : brickFine(x, 40 - y + 9, 40 + 9 - 0, 1483, { W: 24 }); });
      p.oval(12, 24.5, 5, 5, RST[3]); p.oval(12, 24.5, 4.2, 4.2, RST[5]); p.oval(11.6, 24.1, 3.4, 3.4, RST[6]); p.oval(12.2, 24.7, 2.6, 2.6, RST[5]);
      fpoly(p, [[12, 19], [14.5, 25.5], [12, 28.5], [9.5, 25.5]], (x, y) => (x < 12 && y < 26 ? RST[2] : RST[3])); p.fline(12, 19.5, 14.5, 25.5, RST[6]); p.dot(11, 21, RST[7]);
      p.fline(5, 32, 18.5, 32, IRON[4]); p.fline(5, 32.5, 18.5, 32.5, IRON[1]);
      for (let x = 6; x <= 17; x++) { const len = 10 + Math.round(Math.sin(x * 1.7) * 3 + hash2(x, 1, 1484) * 5); p.fline(x, 33, x, 33 + len - 0.5, x === 6 ? CRIM[4] : x > 14 ? CRIM[1] : x % 3 === 0 ? CRIM[3] : CRIM[2]); p.fline(x + 0.5, 33, x + 0.5, 33 + len - 0.5, x > 14 ? CRIM[0] : x % 3 === 2 ? CRIM[1] : CRIM[2]); p.dot(x, 33 + len, x % 2 ? CHAR[3] : EMB[2]); p.dot(x + 0.5, 33 + len, x % 2 ? CHAR[2] : EMB[4]); if (x % 2 === 0) g.dot(x + 0.5, 33 + len, EMB[4]); }
      p.oval(11.5, 37, 1.6, 1.6, GOLD[2]); p.dot(11, 36.5, GOLD[4]); p.dot(12, 37.5, GOLD[1]);
      slabF(p, 7, 4, 10, 3, { top: IRON[5], body: IRON[2], bot: IRON[0], right: IRON[1], left: IRON[3] });
      p.fline(8, 3, 15.5, 3, EMB[2]); p.fline(8.5, 3.5, 15, 3.5, EMB[3]); for (let x = 8.5; x < 16; x += 1.5) { p.dot(x, 3, HOT); g.dot(x, 3, HOT); }
      g.rect(8, 3, 8, 1, EMB[4]);
      return;
    }
    // Schaft
    for (let y = 12; y <= bottom; y++) for (let x = x0; x <= x1; x++) {
      let k = brickK(x, bottom - y, 1481, { bw: 6, base: 4 });
      if (x === x0) k = Math.max(k, 6); else if (x >= x1 - 1) k = Math.min(k, 2);
      if (bottom - y < 6 && hash2(x, y, 1482) < (6 - (bottom - y)) / 8) k -= 2;
      p.px(x, y, RST[Math.max(0, Math.min(8, k))]);
    }
    // Gesims und gebrochene Krone
    p.rect(x0 - 2, 10, x1 - x0 + 5, 3, RST[6]); p.rect(x0 - 2, 10, x1 - x0 + 5, 1, RST[8]); p.rect(x0 - 2, 12, x1 - x0 + 5, 1, RST[2]);
    for (let x = x0; x <= x1; x++) { const t = 3 + Math.round(Math.abs(Math.sin(x * 0.7)) * 3 + (x > 14 ? (x - 14) * 0.8 : 0)); for (let y = t; y < 10; y++) p.px(x, y, y === t ? ASHT[3] : RST[brickK(x, 40 - y, 1483)]); }
    // Wappen-Relief: Flamme in Kreis, verrußt
    p.ellipse(11.5, 24, 5, 5, RST[3]); p.ellipse(11.5, 24, 4, 4, RST[5]); p.ellipse(11, 23, 3, 3, RST[6]);
    poly(p, [[11.5, 19], [14, 25], [11.5, 28], [9, 25]], RST[3]); p.px(11, 21, RST[7]);
    // zerrissenes Banner am Haken
    p.rect(5, 32, 14, 1, IRON[3]);
    for (let x = 6; x <= 17; x++) { const len = 10 + Math.round(Math.sin(x * 1.7) * 3 + hash2(x, 1, 1484) * 5); for (let y = 33; y < 33 + len; y++) p.px(x, y, x === 6 ? CRIM[3] : x > 14 ? CRIM[1] : CRIM[2]); p.px(x, 33 + len, x % 2 ? CHAR[3] : EMB[1]); }
    p.px(10, 37, GOLD[2]); p.px(11, 36, GOLD[3]); p.px(12, 37, GOLD[2]); p.px(11, 38, GOLD[1]);
    // Feuerschale auf dem Pfeiler
    p.rect(7, 4, 10, 3, IRON[2]); p.rect(7, 4, 10, 1, IRON[4]); p.rect(8, 3, 8, 1, EMB[2]); g.rect(8, 3, 8, 1, EMB[4]);
  }, {
    ax: 12, ay: H - 2,
    light: { dx: 0, dy: -60, radius: 70, color: [255, 140, 60], intensity: 0.8 },
    extra: { flames: BRAZIER_FLAMES(), flameAt: { dx: -4, dy: -71 }, embers: { dx: 0, dy: -62, rate: 1 } }, b: true,
  });
}

// ------------------------------------------------------------ Marktstände (verbrannt)
function marketStall(v) {
  const W = 36, H = 32;
  return mk(W, H, (p, g) => {
    const bottom = H - 1;
    ashPatch(p, g, 18, bottom - 1, 17, 2, 1491 + v, 0.04);
    // Pfosten
    for (const x of [3, 31]) { p.rect(x, 6, 2, bottom - 7, CHAR[3]); p.rect(x, 6, 1, bottom - 7, CHAR[5]); }
    // Markise: verkohlter Stoff, angesengte Kante
    const cloth = v ? CANV : ['#2a1214', '#3a181a', '#4e2024', '#642a2c', '#7a3434', '#8e4040'];
    for (let x = 2; x <= 33; x++) {
      const burnt = v ? x > 20 : x < 10;
      const len = burnt ? 2 + Math.round(hash2(x, 1, 1492 + v) * 3) : 7 + Math.round(Math.sin(x * 0.9) * 1.2);
      for (let y = 4; y < 4 + len; y++) p.px(x, y, (x >> 2) % 2 ? cloth[3] : cloth[2]);
      p.px(x, 4, cloth[4]);
      p.px(x, 4 + len, burnt ? EMB[2] : CHAR[2]); if (burnt) g.px(x, 4 + len, EMB[3]);
    }
    // Ladentisch
    p.rect(4, bottom - 10, 28, 3, WOOD[3]); p.rect(4, bottom - 10, 28, 1, WOOD[4]); p.rect(5, bottom - 7, 26, 6, WOOD[1]);
    for (let x = 6; x < 30; x += 5) p.rect(x, bottom - 7, 1, 6, WOOD[0]);
    for (let y = bottom - 7; y < bottom - 1; y++) for (let x = 5; x < 31; x++) if (hash2(x, y, 1493) < (y - (bottom - 8)) / 8) p.px(x, y, CHAR[2]);
    // Waren: Krüge, zerbrochene Schalen, Barren
    if (!v) { p.ellipse(10, bottom - 12, 2, 2.5, '#5a3424'); p.px(9, bottom - 14, '#7a4a30'); p.ellipse(15, bottom - 12, 2.5, 2, '#4a2a1e'); p.rect(21, bottom - 12, 6, 2, GOLD[1]); p.px(21, bottom - 12, GOLD[3]); }
    else { p.rect(8, bottom - 12, 5, 2, IRON[2]); p.px(8, bottom - 12, IRON[4]); p.rect(16, bottom - 13, 3, 3, BONE[2]); p.px(16, bottom - 13, BONE[3]); p.rect(23, bottom - 12, 4, 2, '#3a5a2a'); }
  }, { ax: 18, ay: H - 3, box: [-15, -5, 15, 1] });
}

// ------------------------------------------------------------ Tempel der Ersten Flamme: Vorhalle
function templeFacade() {
  const W = 176, H = 112;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 88;
    const rng = createRng(1501);
    if (p.fine) { templeFine(p, g, rng, bottom, cx); return; }
    // Cella-Wand hinter den Säulen
    for (let y = 30; y <= bottom - 10; y++) for (let x = 14; x <= 161; x++) {
      let k = brickK(x, bottom - y, 1502, { bw: 10, bh: 5, base: 2 });
      if (y > bottom - 18) k -= 1;
      p.px(x, y, RST[Math.max(0, Math.min(8, k))]);
    }
    // Portal mit Altarfeuer
    for (let y = 46; y <= bottom - 10; y++) for (let x = cx - 14; x <= cx + 14; x++) {
      if (y < 60 && ((x - cx) / 14) ** 2 + ((y - 60) / 14) ** 2 > 1) continue;
      const depth = (y - 46) / (bottom - 56);
      p.px(x, y, depth > 0.75 ? '#2a0e06' : DARK);
    }
    for (let a = 0; a <= 28; a++) { const t = Math.PI + (a / 28) * Math.PI; p.px(Math.round(cx + Math.cos(t) * 15), Math.round(60 + Math.sin(t) * 15), RST[7]); p.px(Math.round(cx + Math.cos(t) * 16), Math.round(60 + Math.sin(t) * 16), RST[5]); }
    // Altar mit Flamme im Portal
    p.rect(cx - 8, bottom - 18, 17, 6, RST[4]); p.rect(cx - 8, bottom - 18, 17, 1, RST[6]);
    p.rect(cx - 6, bottom - 19, 13, 1, EMB[3]); g.rect(cx - 6, bottom - 19, 13, 1, EMB[4]);
    for (const [fx, fh] of [[cx - 4, 8], [cx, 14], [cx + 4, 9]]) for (let i = 0; i < fh; i++) {
      const t = i / fh, hw = Math.round((1 - t) * 2);
      for (let dx = -hw; dx <= hw; dx++) { p.px(fx + dx + Math.round(Math.sin(i * 0.8) * (t > 0.4 ? 1 : 0)), bottom - 20 - i, t > 0.7 ? EMB[3] : t < 0.3 ? EMB[5] : EMB[4]); g.px(fx + dx + Math.round(Math.sin(i * 0.8) * (t > 0.4 ? 1 : 0)), bottom - 20 - i, EMB[5]); }
    }
    // Stufen
    for (let s = 0; s < 3; s++) {
      const y = bottom - 9 + s * 3, x0 = 8 - s * 3, x1 = 167 + s * 3;
      p.rect(x0, y, x1 - x0, 3, RST[5 - s]); p.rect(x0, y, x1 - x0, 1, RST[7 - s]);
      for (let x = x0; x < x1; x += 13) p.px(x, y + 1, RST[2]);
    }
    // Säulen (6), zwei gebrochen
    const cols = [22, 50, 74, 102, 126, 154];
    const broken = [false, true, false, false, true, false];
    cols.forEach((x, i) => {
      if (broken[i]) {
        columnShaft(p, g, x, 40 + rng.int(4, 18), bottom - 16, 6, 1503 + i, { broken: true });
        block(p, x + 5, bottom - 14, 8, 5, RST, 4); block(p, x - 12, bottom - 13, 6, 4, RST, 3);
      } else columnShaft(p, g, x, 30, bottom - 16, 6, 1503 + i, { capital: true });
    });
    // Gebälk (Architrav + Fries mit Glutrunen + Gesims), rechts eingestürzt
    const beamEnd = (x) => x < 120 ? 0 : (x - 120) * 0.6 + hash2(x >> 2, 1, 1509) * 6;
    for (let x = 6; x <= 169; x++) {
      const cut = beamEnd(x);
      for (let y = 14; y <= 24; y++) {
        if (y < 14 + cut) continue;
        let c;
        if (y <= 16) c = y === 14 ? RST[8] : RST[6];                    // Gesims
        else if (y <= 20) c = (x % 12 < 2) ? RST[3] : RST[5];          // Fries mit Triglyphen
        else c = y === 24 ? RST[2] : RST[4];                             // Architrav
        if (hash2(x, y, 1510) < 0.04) c = RST[2];
        p.px(x, y, c);
      }
      if (x % 12 === 6 && x < 118) { p.px(x, 18, EMB[3]); p.px(x + 1, 19, EMB[2]); g.px(x, 18, EMB[4]); g.px(x + 1, 19, EMB[3]); }
    }
    // Giebel (links erhalten, rechts weggebrochen)
    for (let y = 0; y < 14; y++) for (let x = 6; x <= 169; x++) {
      const half = ((y + 1) / 14) * 82;
      if (Math.abs(x - cx) > half) continue;
      if (x > cx + 6 + (13 - y) * 2 + hash2(x >> 1, y, 1511) * 4) continue;
      let c = Math.abs(x - cx) > half - 1.5 ? RST[8] : y === 13 ? RST[3] : RST[5];
      if ((x + y * 3) % 17 === 0) c = RST[4];
      p.px(x, y, c);
    }
    // Giebelrelief: Sonnenscheibe mit Flammenkrone
    p.ellipse(cx - 6, 9, 4, 3, GOLD[1]); p.ellipse(cx - 6, 9, 2.5, 2, GOLD[2]); p.px(cx - 7, 8, GOLD[4]); g.px(cx - 6, 9, GOLD[2]);
    // herabgestürzte Gebälkblöcke rechts
    block(p, 140, bottom - 16, 12, 6, RST, 4); block(p, 150, bottom - 12, 9, 5, RST, 3); block(p, 132, bottom - 13, 7, 4, RST, 5);
    emberCrack(p, g, 64, 34, 12, 1512); emberCrack(p, g, 112, 38, 10, 1513);
  }, {
    ax: 88, ay: H - 3, box: [-84, -12, 84, 1],
    light: { dx: 0, dy: -30, radius: 110, color: [255, 130, 50], intensity: 0.9 },
    extra: { embers: { dx: 0, dy: -40, rate: 2 } }, b: true,
  });
}

// Tempelvorhalle fein: Cella mit feinem Steinschnitt, Rundbogenportal mit Keilsteinkranz und Glut im Inneren,
// Altarfeuer mit heißem Kern, Stufen mit Kantenlicht, Säulen (columnShaft fein), Gebälk mit Profilkanten, Giebel mit glatter Schräge
function templeFine(p, g, rng, bottom, cx) {
  const R = RST32(), c0 = cx + 0.5;
  p.scan(14, 30, 161.5, bottom - 9.5, (x, y) => brickFine(x, y, bottom, 1502, { bw: 10, bh: 5, base: y > bottom - 18 ? 1 : 2, W: 999 }));
  // Portal
  p.each(cx - 17, 43, cx + 18, bottom - 9.5, (x, y) => {
    const dx = x - c0, r = Math.hypot(dx, Math.max(0, 60.5 - y));
    if (Math.abs(dx) > 16.5 || (y < 60.5 && r > 16.5)) return null;
    if (Math.abs(dx) > 14.5 || (y < 60.5 && r > 14.5)) {
      if (y >= 60.5) return Math.abs(dx) < 15.5 ? (dx < 0 ? RST[7] : RST[4]) : (dx < 0 ? RST[5] : RST[3]);
      const a = Math.atan2(60.5 - y, dx) * 3, f = a - Math.floor(a);
      if (f < 0.1) return RST[2];
      return r < 15.5 ? (dx < 0 ? RST[7] : RST[5]) : r < 16 ? RST[6] : RST[4];
    }
    const depth = (y - 46) / (bottom - 56);
    if (depth > 0.75) return depth > 0.9 ? '#3a1408' : '#2a0e06';
    return !(Math.abs(dx + 0.5) <= 14.5 && (y >= 60.5 || Math.hypot(dx + 0.5, 60.5 - y) <= 14.5)) ? RST[1] : DARK;
  });
  // Altar mit Flamme
  slabF(p, cx - 8, bottom - 18, 17, 6, { top: RST[7], lip: RST[6], body: RST[4], bot: RST[2], right: RST[2], rw: 2, left: RST[6] });
  p.fline(cx - 6, bottom - 19, cx + 6.5, bottom - 19, EMB[3]); p.fline(cx - 5, bottom - 18.5, cx + 5.5, bottom - 18.5, EMB[2]);
  for (let x = cx - 5.5; x < cx + 6.5; x += 1.5) { p.dot(x, bottom - 19, HOT); g.dot(x, bottom - 19, HOT); }
  g.fline(cx - 6, bottom - 19, cx + 6.5, bottom - 19, EMB[4]);
  for (const [fx, fh] of [[cx - 4, 8], [cx, 14], [cx + 4, 9]]) flameF(p, g, fx, bottom - 20, fh, 2);
  // Stufen
  for (let s2 = 0; s2 < 3; s2++) {
    const y = bottom - 9 + s2 * 3, x0 = 8 - s2 * 3, x1 = 167 + s2 * 3;
    slabF(p, x0, y, x1 - x0, 3, { top: RST[7 - s2], lip: RST[6 - s2], body: RST[5 - s2], bot: RST[2], left: RST[6 - s2] });
    for (let x = x0 + 13; x < x1; x += 13) { p.fline(x, y + 1, x, y + 2.5, RST[1]); p.fline(x + 0.5, y + 1, x + 0.5, y + 2.5, RST[6 - s2]); }
  }
  // Säulen (6), zwei gebrochen
  const cols = [22, 50, 74, 102, 126, 154], broken = [false, true, false, false, true, false];
  cols.forEach((x, i) => {
    if (broken[i]) {
      columnShaft(p, g, x, 40 + rng.int(4, 18), bottom - 16, 6, 1503 + i, { broken: true });
      block(p, x + 5, bottom - 14, 8, 5, RST, 4); block(p, x - 12, bottom - 13, 6, 4, RST, 3);
    } else columnShaft(p, g, x, 30, bottom - 16, 6, 1503 + i, { capital: true });
  });
  // Gebälk: Gesims, Fries mit Triglyphen und Glutrunen, Architrav; rechts eingestürzt
  const beamEnd = (x) => x < 120 ? 0 : (x - 120) * 0.6 + hash2(Math.floor(x) >> 2, 1, 1509) * 6;
  p.scan(6, 14, 169.5, 24.5, (x, y) => {
    const cut = beamEnd(x); if (y < 14 + cut) return 0;
    if (y < 14 + cut + 0.5 && cut > 0) return ASHT32()[3];
    if (y < 14.5) return R[8];
    if (y < 16.5) return y < 15 ? R[7] : y >= 16 ? R[3] : R[6];
    if (y < 20.5) { const t = x % 12; return t < 0.5 ? R[2] : t < 2 ? (t < 1 ? R[4] : R[3]) : y < 17.5 ? R[6] : R[5]; }
    if (y < 21) return R[6];
    return y >= 24 ? R[1] : y >= 23.5 ? R[3] : R[4];
  });
  for (let x = 6; x < 118; x += 12) { emberGlyph(p, g, x, 18); }
  // Giebel (links erhalten, rechts weggebrochen)
  p.scan(6, 0, 169.5, 13.5, (x, y) => {
    const half = ((y + 0.5) / 14) * 82, dx = Math.abs(x - c0);
    if (dx > half) return 0;
    if (x > cx + 6 + (13 - y) * 2 + vnoiseLite(x / 2, y, 1511) * 4) return 0;
    if (dx > half - 1) return R[8];
    if (dx > half - 1.5) return R[6];
    if (y > 13) return R[3];
    const f = (x + y * 3) / 17; return f - Math.floor(f) < 0.04 ? R[4] : R[5];
  });
  p.each(cx - 2, 0, cx + 30, 14, (x, y) => { const e = cx + 6 + (13 - y) * 2 + vnoiseLite(x / 2, y, 1511) * 4; return x <= e && x > e - 0.6 && Math.abs(x - c0) <= ((y + 0.5) / 14) * 82 ? RST[2] : null; });
  // Giebelrelief: Sonnenscheibe
  p.oval(cx - 5.5, 9.5, 4, 3, GOLD[1]); p.oval(cx - 5.8, 9.2, 2.6, 2, GOLD[2]); p.oval(cx - 6.2, 8.8, 1.2, 0.9, GOLD[3]); p.dot(cx - 7, 8, GOLD[4]); g.dot(cx - 5.5, 9.5, GOLD[2]);
  block(p, 140, bottom - 16, 12, 6, RST, 4); block(p, 150, bottom - 12, 9, 5, RST, 3); block(p, 132, bottom - 13, 7, 4, RST, 5);
  emberCrack(p, g, 64, 34, 12, 1512); emberCrack(p, g, 112, 38, 10, 1513);
}
// Glutrune im Fries: Saum 1 Weltpixel, heißer Kern
function emberGlyph(p, g, x, y) {
  p.fline(x + 0.5, y, x + 1.5, y + 1.5, EMB[2], 0.5); p.dot(x + 0.5, y, HOT); p.dot(x + 1, y + 1, EMB[4]);
  g.fline(x, y, x + 1.5, y + 1.5, EMB[3], 0.5); g.dot(x + 0.5, y, HOT); g.dot(x + 1, y + 1, HOT);
}

// ------------------------------------------------------------ Phasenanker (Questobjekt, Phasengeister)
// off = aktiver Anker (schwebender Obsidiankristall, violettes Leuchten), on = zerschlagen/erloschen
const VIO = ['#1a0c2a', '#341a54', '#5a2e8a', '#8a52c8', '#b98cf0', '#ece0ff'];
function phaseAnchor(broken) {
  const W = 24, H = 44;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 12;
    ashPatch(p, g, cx, bottom - 1, 11, 2, 1521, 0.02);
    // Runenstein-Sockel
    p.rect(3, bottom - 9, 18, 8, RST[4]); p.rect(3, bottom - 9, 18, 1, RST[7]); p.rect(3, bottom - 9, 1, 8, RST[6]); p.rect(19, bottom - 8, 2, 7, RST[2]);
    p.rect(5, bottom - 12, 14, 3, RST[5]); p.rect(5, bottom - 12, 14, 1, RST[8]); p.rect(17, bottom - 11, 2, 2, RST[3]);
    const rc = broken ? RST[2] : VIO[4];
    for (const [x, y] of [[6, -6], [7, -5], [9, -7], [10, -5], [13, -6], [14, -7], [16, -5], [17, -6]]) { p.px(x, bottom + y, rc); if (!broken) g.px(x, bottom + y, VIO[3]); }
    if (!broken) {
      // schwebender Kristall (Raute), Splitter im Orbit
      poly(p, [[cx, 4], [cx + 6, 15], [cx, 28], [cx - 6, 15]], (x, y) => (x < cx ? (y < 15 ? VIO[3] : VIO[2]) : (y < 15 ? VIO[2] : VIO[1])));
      p.line(cx, 4, cx, 28, VIO[4]); p.line(cx - 6, 15, cx + 6, 15, VIO[1]);
      p.px(cx - 2, 10, VIO[5]); p.px(cx - 2, 11, VIO[4]); p.px(cx - 3, 13, VIO[4]);
      g.line(cx, 6, cx, 26, VIO[3]); g.px(cx - 2, 10, VIO[5]); g.ellipse(cx, 15, 2, 4, VIO[2]);
      for (const [x, y] of [[3, 12], [20, 18], [5, 24], [19, 8]]) { p.px(x, y, VIO[4]); p.px(x + 1, y, VIO[2]); g.px(x, y, VIO[4]); }
      // Lichtfaden zum Sockel
      for (let y = 29; y < bottom - 12; y += 2) { p.px(cx, y, VIO[3]); g.px(cx, y, VIO[4]); }
    } else {
      // zerbrochener Kristall auf dem Sockel
      poly(p, [[cx - 4, bottom - 12], [cx - 1, bottom - 22], [cx + 1, bottom - 12]], OBS[3]);
      poly(p, [[cx + 1, bottom - 12], [cx + 4, bottom - 18], [cx + 6, bottom - 12]], OBS[2]);
      p.px(cx - 1, bottom - 20, OBS[5]); p.px(cx + 4, bottom - 17, OBS[4]);
      block(p, 1, bottom - 3, 3, 2, OBS, 2); block(p, 20, bottom - 2, 3, 2, OBS, 3);
    }
  }, {
    ax: 12, ay: H - 3, box: [-9, -4, 9, 1],
    light: broken ? undefined : { dx: 0, dy: -26, radius: 70, color: [170, 110, 255], intensity: 0.9 },
    extra: broken ? undefined : { embers: { dx: 0, dy: -24, rate: 1 } },
  });
}

// ------------------------------------------------------------ Kronschrein am Thronweg (Questobjekt)
function crownShrine(lit) {
  const W = 32, H = 40;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 16;
    ashPatch(p, g, cx, bottom - 1, 15, 2, 1531, lit ? 0.06 : 0.02);
    // Stufenaltar
    p.rect(1, bottom - 5, 30, 5, RST[4]); p.rect(1, bottom - 5, 30, 1, RST[7]); p.rect(29, bottom - 4, 2, 4, RST[2]);
    p.rect(5, bottom - 14, 22, 9, RST[5]); p.rect(5, bottom - 14, 22, 1, RST[8]); p.rect(5, bottom - 14, 1, 9, RST[6]); p.rect(25, bottom - 13, 2, 8, RST[3]);
    // Relief: Aschekrone
    p.rect(10, bottom - 10, 12, 3, RST[3]);
    for (let i = 0; i < 4; i++) { p.px(11 + i * 3, bottom - 12, GOLD[lit ? 3 : 1]); p.px(11 + i * 3, bottom - 11, GOLD[lit ? 2 : 1]); }
    p.rect(10, bottom - 10, 12, 1, GOLD[lit ? 2 : 1]);
    // Rückwand mit Spitzbogennische
    p.rect(8, 6, 16, bottom - 20, RST[3]); p.rect(8, 6, 16, 1, RST[6]); p.rect(8, 6, 1, bottom - 20, RST[5]);
    for (let y = 2; y < 6; y++) for (let x = 8; x < 24; x++) if (Math.abs(x - 15.5) < (y - 1) * 2) p.px(x, y, y === 2 ? RST[7] : RST[4]);
    for (let y = 9; y < bottom - 15; y++) for (let x = 11; x <= 20; x++) { if (y < 13 && Math.abs(x - 15.5) > (y - 8) * 1.6) continue; p.px(x, y, DARK); }
    // Kissen mit (leerer oder erglühender) Krone
    p.rect(12, bottom - 18, 8, 3, CRIM[2]); p.rect(12, bottom - 18, 8, 1, CRIM[3]);
    for (let i = 0; i < 4; i++) { const x = 12 + i * 2 + (i > 1 ? 1 : 0); p.px(x, bottom - 21, GOLD[lit ? 4 : 2]); p.px(x, bottom - 20, GOLD[lit ? 3 : 1]); }
    p.rect(12, bottom - 19, 8, 1, GOLD[lit ? 3 : 1]);
    if (lit) { g.rect(11, bottom - 22, 10, 4, GOLD[1]); g.px(15, bottom - 21, GOLD[4]); }
    // Kerzen
    for (const x of [3, 28]) { p.rect(x, bottom - 9, 2, 4, BONE[3]); p.px(x, bottom - 9, BONE[4]); if (lit) { p.px(x, bottom - 10, EMB[4]); p.px(x, bottom - 11, EMB[3]); g.px(x, bottom - 10, EMB[5]); g.px(x, bottom - 11, EMB[4]); } }
  }, {
    ax: 16, ay: H - 3, box: [-14, -5, 14, 1],
    light: lit ? { dx: 0, dy: -20, radius: 80, color: [255, 200, 110], intensity: 0.9 } : { dx: 0, dy: -20, radius: 34, color: [255, 140, 60], intensity: 0.4 },
    extra: lit ? { embers: { dx: 0, dy: -22, rate: 2 } } : undefined,
  });
}

// ------------------------------------------------------------ Aschewehen (weiche Dünen)
function ashDrift(v) {
  const W = [52, 40, 30][v], H = [16, 13, 10][v];
  return mk(W, H, (p, g) => {
    const cx = W / 2 - 0.5, base = H - 2;
    if (p.fine) {
      const A = pal32(ASHB);
      p.scan(0, 0, W - 0.5, base + 0.5, (x, y) => {
        const nx = (x - 0.5 - cx) / (W / 2 - 1);
        const crest = base - (H - 3) * Math.max(0, 1 - nx * nx) ** 0.8 * (1 - 0.25 * nx);
        if (y < crest) return 0;
        const ridgeX = cx + 0.5 - W * 0.08 + (y - crest) * 0.3;
        let k = x < ridgeX ? 4 : 2;
        if (y - crest < 0.5) k = x < ridgeX ? 6 : 3; else if (y - crest < 1) k = x < ridgeX ? 5 : 3;
        if (y > base) k = 1;
        else if (x >= ridgeX && x < ridgeX + 0.5) k = 1;
        const w = Math.sin(x * 0.6 + y * 1.7);
        if (x < ridgeX && y - crest > 1) { if (w > 0.9) k += 1; else if (w > 0.75) k -= 1; }
        return A[clampI(k, 7)];
      });
      for (let i = 0; i < 3 + v; i++) { const x = Math.floor(hash2(i, 1, 1542 + v) * (W - 6)) + 3; p.dot(x, base - 0.5, EMB[1]); sparkF(p, g, x + 0.5, base - 1); }
      return;
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const nx = (x - cx) / (W / 2 - 1);
      const crest = base - (H - 3) * Math.max(0, 1 - nx * nx) ** 0.8 * (1 - 0.25 * nx);
      if (y < crest || y > base) continue;
      const ridgeX = cx - W * 0.08 + (y - crest) * 0.3;
      let k = x < ridgeX ? 4 : 2;                              // Luvseite hell, Lee im Schatten
      if (y - crest < 1) k = x < ridgeX ? 5 : 3;
      if (y > base - 1) k = 1;
      if (Math.sin(x * 0.6 + y * 1.7) > 0.85 && x < ridgeX) k += 1;  // Windrippeln
      if (hash2(x, y, 1541 + v) < 0.05) k -= 1;
      p.px(x, y, ASHB[Math.max(0, Math.min(6, k))]);
    }
    for (let i = 0; i < 3 + v; i++) { const x = Math.floor(hash2(i, 1, 1542 + v) * (W - 6)) + 3, y = base - 1; p.px(x, y, EMB[2]); g.px(x, y, EMB[3]); }
  }, { ax: Math.floor(W / 2), ay: H - 3, b: true });
}

// ------------------------------------------------------------ Runde 5/2: Wegmarken, Barrikaden, Grabstelen
// Steinmann (Wegmarke in den Dünen): gestapelte Basaltbrocken, oben ein Ascheband,
// v 2 mit kleiner Glutschale als Nachtlicht der Pilger.
function cairn(v) {
  const W = 18, H = [22, 26, 28][v];
  const rng = createRng(1700 + v);
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 9;
    ashPatch(p, g, cx, bottom - 1, 8, 2, 1701 + v, 0.02);
    const n = [4, 5, 4][v];
    let y = bottom - 3;
    for (let i = 0; i < n; i++) {
      const w = Math.max(4, 11 - i * 2 + rng.int(-1, 1)), h = i === 0 ? 5 : rng.int(3, 4);
      const x = cx - Math.floor(w / 2) + rng.int(-1, 1);
      if (p.fine) {
        // Basaltbrocken gewölbt (Licht oben links), Asche auf der Oberseite
        lump(p, x + w / 2, y - h / 2 + 1, w / 2 + 0.25, h / 2 + 0.25, BAS, { lo: 1, hi: 5, bias: 0.05 });
        if (hash2(i, v, 1703) < 0.5) { p.fline(x + 1.5, y - h + 1.25, x + 3, y - h + 1.25, ASHT[4]); p.dot(x + 2, y - h + 1.75, ASHT[3]); }
        y -= h - 1;
        continue;
      }
      p.ellipse(x + w / 2 - 0.5, y - h / 2 + 0.5, w / 2, h / 2, BAS[3]);
      p.rect(x + 1, y - h + 1, w - 2, 1, BAS[5]); p.px(x, y - h + 2, BAS[5]);
      p.rect(x + 1, y, w - 2, 1, BAS[1]); p.px(x + w - 1, y - 1, BAS[2]);
      if (hash2(i, v, 1703) < 0.5) p.px(x + 2, y - h + 1, ASHT[4]);
      y -= h - 1;
    }
    if (v === 2 && p.fine) {
      slabF(p, cx - 3, y - 1, 7, 2, { top: FER[5], body: FER[3], bot: FER[1], right: FER[2] });
      flameF(p, g, cx, y - 2, 3.5, 1);
    } else if (v === 2) {
      p.rect(cx - 3, y - 1, 7, 2, FER[3]); p.rect(cx - 3, y - 1, 7, 1, FER[5]);
      for (const [dx, c] of [[-1, EMB[3]], [0, EMB[4]], [1, EMB[3]]]) { p.px(cx + dx, y - 2, c); g.px(cx + dx, y - 2, EMB[4]); }
      p.px(cx, y - 3, EMB[5]); g.px(cx, y - 3, EMB[5]);
    } else {
      // Pilgerband im Wind
      if (p.fine) { fpoly(p, [[cx + 2, y + 2], [cx + 7.5, y + 4.5], [cx + 7, y + 5.5], [cx + 5, y + 4.5], [cx + 2, y + 3]], (xx, yy) => (yy < y + 3.2 + (xx - cx - 2) * 0.45 ? CRIM[4] : CRIM[2])); }
      else { p.line(cx + 2, y + 2, cx + 6, y + 4, CRIM[3]); p.px(cx + 7, y + 5, CRIM[2]); }
    }
  }, { ax: 9, ay: H - 3, box: [-5, -3, 5, 1], light: v === 2 ? { dx: 0, dy: -H + 6, radius: 34, color: [255, 150, 70], intensity: 0.45 } : undefined, b: true });
}

// Barrikade aus Tempeltrümmern, Balken und Schilden (schließt Breschen der Bastion)
function barricade(v) {
  const W = 16, H = 26;
  const rng = createRng(1710 + v);
  return mk(W, H, (p, g) => {
    const bottom = H - 1;
    ashPatch(p, g, 8, bottom - 1, 8, 2, 1711 + v, 0.02);
    // Steinfuß
    for (let i = 0; i < 4; i++) block(p, rng.int(0, 9), bottom - 7 + rng.int(0, 2), rng.int(5, 7), rng.int(4, 5), RST, rng.int(3, 5));
    // Spitze Pfähle (schräg nach außen)
    for (const [x0, len] of [[2, 15], [6, 18], [10, 16], [14, 13]]) {
      const x1 = x0 + (v ? -2 : 2);
      p.line(x0, bottom - 4, x1, bottom - 4 - len, WOOD[2]); p.line(x0 + 1, bottom - 4, x1 + 1, bottom - 4 - len, WOOD[3]);
      p.px(x1, bottom - 5 - len, IRON[4]);
    }
    // Querbalken mit Seil
    p.line(0, bottom - 11, 15, bottom - 13, WOOD[1]); p.line(0, bottom - 12, 15, bottom - 14, WOOD[3]);
    p.px(6, bottom - 12, LEA[3]); p.px(11, bottom - 13, LEA[3]);
    // Schild mit Bastionsfarbe
    const sx = v ? 4 : 10;
    p.ellipse(sx, bottom - 8, 3, 3.5, CRIM[2]); p.ellipse(sx - 0.5, bottom - 8.5, 2, 2.5, CRIM[3]); p.px(sx, bottom - 8, GOLD[3]);
  }, { ax: 8, ay: H - 2, box: [-8, -4, 8, 1] });
}

// Grabstele (Aschefriedhof der Vorstadt): verwitterter Stein, teils geborsten
function stele(v) {
  const W = 14, H = [20, 18, 14][v];
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 7;
    ashPatch(p, g, cx, bottom - 1, 6, 1.5, 1721 + v, 0.01);
    const top = v === 2 ? bottom - 7 : bottom - H + 4;
    if (p.fine) {
      // Stele fein: gerundete Schultern, Kantenlicht links/oben, vertieftes Kreuz (Schatten oben links, Licht unten rechts), Verwitterungsnarben
      p.each(cx - 3, top, cx + 4 - 0.5, bottom - 1.5, (x, y) => {
        const dx = x - cx - 0.5;
        if (y < top + 1 && Math.abs(dx) > 2.5 + (y - top) * 1.5) return null;
        if (v === 2 && y < top + 2 && vnoiseLite(x / 0.9, 1, 1722) < 0.5 - (y - top) * 0.2) return null;
        if (y < top + 0.5) return RST[7];
        if (dx < -3) return RST[7];
        if (dx < -2.5) return RST[6];
        if (dx > 3) return RST[2];
        if (dx > 2.5) return RST[3];
        const pit = hash2(Math.floor(x), Math.floor(y / 2), 1723 + v) < 0.07 && y - Math.floor(y) < 0.5;
        return pit ? RST[3] : RST[5];
      });
      if (v !== 2) {
        p.each(cx - 1, top + 2, cx + 1.5, top + 4.5, (x, y) => { const inC = (x >= cx - 1 && x < cx + 2 && y >= top + 3 && y < top + 4) || (x >= cx && x < cx + 1 && y >= top + 2 && y < top + 5); if (!inC) return null; const l = !((x - 0.5 >= cx - 1 && x - 0.5 < cx + 2 && y >= top + 3 && y < top + 4) || (x - 0.5 >= cx && x - 0.5 < cx + 1 && y >= top + 2 && y < top + 5)), u = !((x >= cx - 1 && x < cx + 2 && y - 0.5 >= top + 3 && y - 0.5 < top + 4) || (x >= cx && x < cx + 1 && y - 0.5 >= top + 2 && y - 0.5 < top + 5)); return l || u ? RST[1] : RST[3]; });
      }
      if (v === 1) { p.fline(cx + 1.5, top + 1, cx - 0.5, bottom - 3.5, RST[1]); p.fline(cx + 2, top + 1.5, cx, bottom - 3.5, RST[6]); }
      slabF(p, cx - 4, bottom - 1, 9, 2, { top: RST[6], body: RST[4], bot: RST[2], right: RST[2], left: RST[5] });
      if (v === 0) { p.fline(cx - 1, bottom - 1.5, cx - 0.5, bottom - 1.5, BONE[3]); p.dot(cx - 1, bottom - 2, BONE[4]); p.px(cx + 2, bottom - 2, EMB[1]); sparkF(p, g, cx + 2, bottom - 2); }
      return;
    }
    for (let y = top; y <= bottom - 2; y++) for (let x = cx - 3; x <= cx + 3; x++) {
      if (y === top && (x === cx - 3 || x === cx + 3)) continue;
      if (v === 2 && y < top + 2 && hash2(x, 1, 1722) < 0.5) continue;
      let k = x === cx - 3 ? 6 : x === cx + 3 ? 3 : 5;
      if (y === top) k = 7;
      if (hash2(x, y, 1723 + v) < 0.08) k -= 2;
      p.px(x, y, RST[k]);
    }
    if (v !== 2) { p.rect(cx - 1, top + 3, 3, 1, RST[2]); p.rect(cx, top + 2, 1, 3, RST[2]); }
    if (v === 1) { p.line(cx + 1, top + 1, cx - 1, bottom - 4, RST[1]); }
    p.rect(cx - 4, bottom - 1, 9, 2, RST[4]); p.rect(cx - 4, bottom - 1, 9, 1, RST[6]);
    if (v === 0) { p.px(cx - 1, bottom - 2, BONE[3]); p.px(cx + 2, bottom - 2, EMB[2]); g.px(cx + 2, bottom - 2, EMB[3]); }
  }, { ax: 7, ay: H - 3, box: [-4, -2, 4, 1], b: true });
}

// ============================================================ Runde 6: verfallene Stadt (Schutt, Säulen, Turm)
// Schuttkegel: aufgehäufte Quader an eingestürzten Mauern, Asche auf den Oberseiten, v0 mit Balken
function rubbleHeap(v) {
  const rng = createRng(1601 + v);
  const W = 36, H = 24;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 18 + (v ? 2 : -1), hw = 16;
    ashPatch(p, null, cx, bottom - 1, 16, 2, 1602 + v);
    const hgt = (x) => Math.max(0, 15 * Math.pow(Math.max(0, 1 - Math.abs(x - cx) / hw), 0.75));
    const stones = [];
    for (let i = 0; i < 26; i++) {
      const x = rng.int(2, W - 7), w = rng.int(3, 7), h = rng.int(2, 4);
      const top = bottom - 1 - h - Math.floor(rng.range(0, 1) * hgt(x + w / 2));
      if (bottom - top > hgt(x + w / 2) + 4) continue;
      stones.push([x, top, w, h]);
    }
    stones.sort((a, b) => a[1] + a[3] - (b[1] + b[3]));
    if (p.fine) {
      // Füllmasse in Brocken (glatte Formen, harte Stufen), Asche auf der Kuppe; Balken und Quader fein
      p.scan(1, 0, W - 1.5, bottom - 0.5, (x, y) => {
        const t = bottom - hgt(x) + 1; if (y < t) return 0;
        if (y < t + 0.5) return vnoiseLite(x / 1.5, 3, 1604 + v) < 0.6 ? ASHT32()[2] : RST32()[4];
        const n = vnoiseLite(x / 1.6, y / 1.2, 1603 + v), m = vnoiseLite((x + 0.5) / 1.6, (y + 0.5) / 1.2, 1603 + v);
        return RST32()[n > 0.55 ? (m < n - 0.04 ? 4 : 3) : n > 0.35 ? 2 : 1];
      });
      if (!v) { p.fline(8, bottom - 14, 27.5, bottom - 5.5, CHAR[2], 1.5); p.fline(8, bottom - 15, 27.5, bottom - 6.5, CHAR[4]); p.fline(8, bottom - 13, 27.5, bottom - 4.5, CHAR[1]); p.dot(8, bottom - 14.5, EMB[3]); p.dot(8, bottom - 14, HOT); g.dot(8, bottom - 14, HOT); g.dot(8, bottom - 14.5, EMB[3]); }
      for (const [x, y, w, h] of stones) {
        block(p, x, y, w, h, RST, 3 + (hash2(x, y, 1605) < 0.4 ? 1 : 0) + (hash2(x, y, 1606) < 0.15 ? 1 : 0));
        const a = hash2(x, y, 1607 + v); p.fline(x + 0.5, y, x + 0.5 + Math.max(1, w * (0.3 + a * 0.5)), y, ASHT[3]); p.dot(x + 1, y + 0.5, ASHT[2]);
      }
      if (v) { block(p, 25, bottom - 6, 8, 5, RST, 5); p.fline(26, bottom - 4, 31.5, bottom - 4, RST[3]); p.fline(26, bottom - 3.5, 31.5, bottom - 3.5, RST[7]); }
      return;
    }
    // Füllmasse (Bruch, Mörtel) unter den Quadern
    for (let x = 1; x < W - 1; x++) {
      const t = Math.round(bottom - hgt(x) + 1);
      for (let y = t; y < bottom; y++) p.px(x, y, hash2(x, y, 1603 + v) < 0.5 ? RST[2] : RST[3]);
      if (t < bottom) p.px(x, t, hash2(x, 3, 1604 + v) < 0.6 ? ASHT[2] : RST[4]);
    }
    if (!v) {
      // verkohlter Dachbalken schräg aus dem Haufen
      for (let i = 0; i < 20; i++) { const x = 8 + i, y = bottom - 15 + Math.round(i * 0.45); p.px(x, y, CHAR[4]); p.px(x, y + 1, CHAR[2]); p.px(x, y + 2, CHAR[1]); }
      p.px(8, bottom - 15, EMB[2]); p.px(9, bottom - 15, CHAR[5]);
    }
    for (const [x, y, w, h] of stones) {
      block(p, x, y, w, h, RST, 3 + (hash2(x, y, 1605) < 0.4 ? 1 : 0) + (hash2(x, y, 1606) < 0.15 ? 1 : 0));
      for (let i = 0; i < w; i++) if (hash2(x + i, y, 1607 + v) < 0.45) p.px(x + i, y, ASHT[3]);
    }
    if (v) { block(p, 25, bottom - 6, 8, 5, RST, 5); p.rect(26, bottom - 4, 6, 1, RST[3]); p.px(28, bottom - 4, RST[7]); }
  }, { ax: 18, ay: H - 3, box: [-9, -5, 9, 1], extra: { low: true }, b: true });
}

// Umgestürzte Säule: liegende Trommeln mit Kanneluren (Licht von oben links), Bruchfläche links
function fallenColumn(v) {
  const W = 56, H = 22;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cy = bottom - 8, r = 6;
    ashPatch(p, null, 28, bottom - 2, 26, 3, 1611 + v);
    // Trommeln: [x0, x1, dy]
    const drums = v ? [[4, 20, 0], [22, 35, 0], [39, 50, 2]] : [[3, 17, 0], [18, 31, 0], [32, 44, 0]];
    if (p.fine) {
      // liegende Trommeln: Zylinder (Licht oben), Kanneluren als Rille + Grat, Stoßfugen, Asche als Wehen, Abplatzungen
      const R = RST32(), A = ASHT32();
      for (const [x0, x1, dy] of drums) {
        const top = cy - r + dy, bot = cy + Math.round(r * 0.6) + dy + 1;
        p.scan(x0, top, x1 + 0.5, bot + 0.5, (x, y) => {
          if (y >= bot) return R[1];
          const rel = (y - top) / (bot - top);
          if (y < top + 0.5 && vnoiseLite(x / 2.2, 0, 1613 + v) < 0.55) return A[3];
          let k = rel < 0.15 ? 7 : rel < 0.35 ? 6 : rel < 0.6 ? 5 : rel < 0.82 ? 4 : 3;
          const f = ((y - top) / 1.5) % 1;
          if (rel > 0.1 && rel < 0.9) { if (f < 0.34) k -= 1; else if (f < 0.67 && rel < 0.5) k += 1; }
          if (x < x0 + 0.5) k = 2; else if (x >= x1 + 0.5) k = 3; else if (x < x0 + 1) k = Math.min(k + 1, 8);
          if (hash2(Math.floor(x), Math.floor((y - top) * 2), 1612 + v) < 0.035) k = 2;
          return R[Math.max(0, Math.min(8, k))];
        });
      }
      p.each(1, cy - r, 3, cy + 3.5, (x, y) => (x >= 2 ? RST[6] : vnoiseLite(1, y / 1.2, 1614) < 0.5 ? RST[5] : null));
      if (!v) {
        slabF(p, 45, cy - r - 2, 7, r * 2 + 1, { top: RST[7], body: RST[5], bot: RST[2], right: RST[3], left: RST[6] });
        slabF(p, 47, cy - r - 4, 3, 2, { top: RST[7], body: RST[6], bot: RST[4] });
        slabF(p, 44, cy + r - 1, 9, 2, { top: RST[4], body: RST[3], bot: RST[1], right: RST[2] });
      } else { block(p, 52, bottom - 4, 3, 3, RST, 4); block(p, 37, bottom - 3, 2, 2, RST, 5); }
      return;
    }
    for (const [x0, x1, dy] of drums) {
      for (let x = x0; x <= x1; x++) {
        const top = cy - r + dy, bot = cy + Math.round(r * 0.6) + dy;
        for (let y = top; y <= bot; y++) {
          const rel = (y - top) / (bot - top);
          let k = rel < 0.15 ? 7 : rel < 0.35 ? 6 : rel < 0.6 ? 5 : rel < 0.82 ? 4 : 3;
          if ((y - top) % 3 === 1 && rel > 0.1 && rel < 0.9) k -= 1;                  // Kanneluren längs
          if (hash2(x, y, 1612 + v) < 0.05) k -= 1;
          p.px(x, y, RST[Math.max(0, Math.min(8, k))]);
        }
        if (hash2(x, 4, 1613 + v) < 0.55) p.px(x, top, ASHT[3]);
        p.px(x, bot + 1, RST[1]);
      }
      // Stirnfläche der Trommel (Ellipse, rechts im Schatten)
      for (let y = cy - r + dy; y <= cy + Math.round(r * 0.6) + dy; y++) { p.px(x0, y, RST[2]); p.px(x1, y, RST[3]); }
    }
    // Bruchfläche links: rauer Querschnitt
    for (let y = cy - r; y <= cy + 3; y++) { p.px(2, y, RST[6]); if (hash2(1, y, 1614) < 0.5) p.px(1, y, RST[5]); }
    if (!v) {
      // Kapitell am Kopfende
      p.rect(45, cy - r - 2, 7, r * 2 + 1, RST[5]); p.rect(45, cy - r - 2, 7, 1, RST[7]); p.rect(51, cy - r - 1, 1, r * 2, RST[3]);
      p.rect(47, cy - r - 4, 3, 2, RST[6]); p.rect(44, cy + r - 1, 9, 2, RST[3]);
    } else {
      // abgesprungene Trommel schräg daneben, Splitter
      block(p, 52, bottom - 4, 3, 3, RST, 4); block(p, 37, bottom - 3, 2, 2, RST, 5);
    }
  }, { ax: 28, ay: H - 3, box: [-22, -6, 22, 1], extra: { low: true }, b: true });
}

// Geborstener Rundturm: gemauerter Zylinder, Krone nach rechts abgebrochen, Innenwand sichtbar,
// Schießscharte, Torbogen mit Schutt (Landmarke der Altstadt)
function towerStump() {
  const W = 64, H = 84;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 32, r = 24, ry = 7, base = bottom - 8;
    ashPatch(p, null, cx, bottom - 3, 30, 5, 1621);
    const front = (x) => { const s = (x - cx) / r; return Math.round(46 - Math.max(0, s + 0.1) * 30 + Math.sin(x * 1.7) * 2 + hash2(x >> 1, 1, 1622) * 3); };
    const back = (x) => Math.round(62 - Math.max(0, (x - cx) / r + 0.4) * 14 + hash2(x >> 1, 2, 1623) * 3);
    if (p.fine) {
      // Rundturm fein: Lagen folgen der Rundung (Stoßfugen zum Rand hin enger), schmale Fugen mit Kantenlicht,
      // Innenwand dunkel, Bruchkrone mit Asche, Torbogen glatt mit Glut, Ruß als wellige Grenze
      const R = RST32(), A = ASHT32();
      p.scan(cx - r, 0, cx + r + 0.5, base + ry + 0.5, (x, y) => {
        const X = Math.floor(x), s = (x - cx - 0.5) / (r + 0.5), e = Math.sqrt(Math.max(0, 1 - s * s)) * ry;
        const yF = base + 0.5 + e, yB = base + 0.5 - e, fTop = Math.round((yF - front(X)) * 2) / 2, bTop = Math.round((yB - back(X)) * 2) / 2;
        if (y >= yF + 0.5) return 0;
        const ang = Math.asin(Math.max(-1, Math.min(1, s))) * r;
        if (y >= fTop) {
          const rr = y - fTop;
          if (rr < 0.5) return A[hash2(X, 5, 1626) < 0.3 ? 4 : 3];
          if (rr < 1.5) return R[6];
          if (rr < 2.5) return R[3];
          const yb = yF - y, row = Math.floor(yb / 5), vb = yb - row * 5, u = (((ang + (row % 2) * 4 + 64) % 8) + 8) % 8;
          let k = s < -0.6 ? 6 : s < -0.2 ? 5 : s < 0.3 ? 4 : s < 0.7 ? 3 : 2;
          if (vb >= 4.5 || u < 0.5) k -= 2; else if (vb >= 4) k += 1; else if (u < 1 && s < 0.5) k += 1; else if (vb < 0.5) k -= 1;
          if (hash2(Math.floor((ang + (row % 2) * 4 + 64) / 8), row, 1624) < 0.12 && vb > 1 && vb < 3 && u > 2 && u < 3) k -= 1;
          if (yb < sootAt(x, 8, 1625) * 0.6) k -= 2; else if (yb < sootAt(x, 8, 1625)) k -= 1;
          if (s < -0.985) k = 7; else if (s > 0.985) k = 1;
          return R[Math.max(0, Math.min(8, k))];
        }
        if (y >= bTop) {
          if (y < bTop + 0.5) return A[2];
          if (y < bTop + 1) return R[4];
          const yb = yB - y, row = Math.floor(yb / 5), u = (((-ang + (row % 2) * 4 + 64) % 8) + 8) % 8, vb = yb - row * 5;
          let k = s > 0.3 ? 3 : s > -0.3 ? 2 : 1;
          if (vb < 0.5 || u < 0.5) k -= 1; else if (vb < 1 && k > 1) k += 1;
          return R[Math.max(0, k)];
        }
        return 0;
      });
      for (const [sx, sy] of [[cx - 12, base - 32], [cx + 4, base - 22]]) { p.rect(sx, sy, 2, 7, DARK); p.fline(sx - 1, sy - 1, sx + 2.5, sy - 1, RST[6]); p.fline(sx - 1, sy + 7, sx + 2.5, sy + 7, RST[7]); p.fline(sx + 1.5, sy, sx + 1.5, sy + 6.5, RST[2]); }
      const dTop = base - 17, dc = cx - 0.5 + 0.5;
      p.each(cx - 8, dTop - 2, cx + 7, base + ry - 0.5, (x, y) => {
        const dx = Math.abs(x - dc), k = y - dTop, w = k < 4.5 ? Math.sqrt(Math.max(0, 1 - ((4.5 - k) / 4.5) ** 2)) * 6 : 6;
        if (k >= 0 && dx < w) { const hb = base + ry - y; if (hb < 3.5 && hb > 1) { if (hb < 2.5) g.dot(x, y, dx < 3 ? EMB[3] : EMB[2]); return hb < 2.5 ? (dx < 2 ? EMB[3] : EMB[1]) : '#2a1008'; } return x - dc > w - 0.5 ? RST[3] : DARK; }
        if (k >= -1 && dx < w + 1.2 && k < 5) return k < -0.5 ? RST[8] : RST[6];
        return null;
      });
      block(p, cx - 9, bottom - 6, 6, 4, RST, 4); block(p, cx - 2, bottom - 4, 5, 3, RST, 5); block(p, cx + 5, bottom - 5, 4, 3, RST, 3);
      block(p, cx + 18, bottom - 7, 7, 5, RST, 4); block(p, cx + 24, bottom - 4, 5, 3, RST, 3); block(p, cx - 26, bottom - 5, 5, 3, RST, 4);
      const pts = []; for (let i = 0; i < 14; i++) pts.push([cx + 14.5 + Math.sin(i * 0.9), base - 26 + i]);
      for (let i = 0; i + 1 < pts.length; i++) { p.fline(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], RST[0]); p.fline(pts[i][0] + 0.5, pts[i][1], pts[i + 1][0] + 0.5, pts[i + 1][1], RST[5]); }
      return;
    }
    for (let x = cx - r; x <= cx + r; x++) {
      const s = (x - cx) / r, e = Math.sqrt(Math.max(0, 1 - s * s)) * ry;
      const yF = Math.round(base + e), yB = Math.round(base - e);
      const fTop = yF - front(x), bTop = yB - back(x);
      // Innenwand (Rückseite, von innen gesehen: rechts beleuchtet)
      for (let y = bTop; y < fTop; y++) {
        const yb = yB - y, row = Math.floor(yb / 5), lx = (x + (row % 2) * 4 + 64) % 8;
        let k = s > 0.3 ? 3 : s > -0.3 ? 2 : 1;
        if (yb % 5 === 0 || lx === 0) k -= 1;
        p.px(x, y, RST[Math.max(0, k)]);
      }
      if (bTop < fTop) { p.px(x, bTop, ASHT[2]); p.px(x, bTop + 1, RST[4]); }
      // Außenwand: Lagen folgen der Rundung
      for (let y = fTop; y <= yF; y++) {
        const yb = yF - y, row = Math.floor(yb / 5), lx = (x + (row % 2) * 4 + 64) % 8;
        let k = s < -0.6 ? 6 : s < -0.2 ? 5 : s < 0.3 ? 4 : s < 0.7 ? 3 : 2;
        if (yb % 5 === 4 || lx === 0) k -= 2;
        else if (yb % 5 === 3) k += 1;
        if (hash2(x, y, 1624) < 0.05) k -= 1;
        if (yb < 8 && hash2(x, y, 1625) < (8 - yb) / 10) k -= 2;              // Ruß am Fuß
        p.px(x, y, RST[Math.max(0, Math.min(8, k))]);
      }
      // Mauerkrone (Bruchkante mit Asche)
      for (let y = fTop; y < fTop + 3; y++) p.px(x, y, y === fTop ? ASHT[3 + (hash2(x, 5, 1626) < 0.3 ? 1 : 0)] : y === fTop + 1 ? RST[6] : RST[3]);
    }
    // Umriss-Kanten: linke Lichtkante, rechte Schattenkante
    for (let y = base - front(cx - r) + 1; y <= base; y++) p.px(cx - r, y, RST[7]);
    for (let y = base - front(cx + r) + 1; y <= base; y++) p.px(cx + r, y, RST[1]);
    // Schießscharten
    for (const [sx, sy] of [[cx - 12, base - 32], [cx + 4, base - 22]]) { p.rect(sx, sy, 2, 7, DARK); p.px(sx - 1, sy - 1, RST[6]); p.rect(sx - 1, sy + 7, 4, 1, RST[6]); }
    // Torbogen mit Glut im Inneren, Schutt davor
    const dx0 = cx - 6, dx1 = cx + 5, dTop = base - 17;
    for (let y = dTop; y <= base + ry - 1; y++) for (let x = dx0; x <= dx1; x++) {
      const k = y - dTop;
      if (k < 4 && Math.abs(x - (cx - 0.5)) > 2 + k * 1.2) continue;
      p.px(x, y, DARK);
    }
    p.rect(dx0 + 1, base + ry - 4, dx1 - dx0 - 1, 2, EMB[1]); g.rect(dx0 + 2, base + ry - 4, dx1 - dx0 - 3, 1, EMB[2]);
    for (let x = dx0 - 1; x <= dx1 + 1; x++) p.px(x, dTop - 1 + Math.round(Math.abs(x - (cx - 0.5)) * 0.4), RST[7]);
    block(p, cx - 9, bottom - 6, 6, 4, RST, 4); block(p, cx - 2, bottom - 4, 5, 3, RST, 5); block(p, cx + 5, bottom - 5, 4, 3, RST, 3);
    block(p, cx + 18, bottom - 7, 7, 5, RST, 4); block(p, cx + 24, bottom - 4, 5, 3, RST, 3); block(p, cx - 26, bottom - 5, 5, 3, RST, 4);
    // Risse
    for (let i = 0; i < 14; i++) { const x = cx + 14 + Math.round(Math.sin(i * 0.9)), y = base - 26 + i; p.px(x, y, RST[0]); }
  }, { ax: 32, ay: H - 5, box: [-23, -12, 23, 3], b: true });
}

export function createWastesDecor() {
  return {
    charredRuins: [0, 1, 2].map(charredRuin),
    obsidianShards: [0, 1, 2].map(obsidianShards),
    ashDunes: [0, 1].map(ashDune),
    emberGeysers: [0, 1].map(emberGeyser),
    scorchedTrees: [0, 1].map(scorchedTree),
    bastionWall: bastionWallH(),
    bastionWallV: bastionWallV(),
    bastionGate: bastionGate(),
    bastionTower: bastionTower(),
    tent: tent(),
    bannerPole: bannerPole(),
    forge: forge(),
    crates: [0, 1, 2].map(crates),
    emberObelisk: { off: emberObelisk(false), on: emberObelisk(true) },
    throneGate: throneGate(),
    bonePiles: [0, 1].map(bonePile),
    // Runde 5: Ruinenstadt, Labyrinth, Brücken, Prozessionsweg
    ruinWall: [0, 1, 2, 3, 4].map(ruinWall),
    ruinWallLow: [0, 1, 2].map(ruinWallLow),
    ruinWallV: [0, 1, 2].map(ruinWallV),
    ruinPier: [0, 1].map(ruinPier),
    rubble: [0, 1, 2].map(rubble),
    columnStumps: [0, 1, 2].map(columnStump),
    column: [0, 1].map(column),
    statues: [0, 1, 2].map(statue),
    fallenStatues: [0, 1].map(fallenStatue),
    fountain: fountain(),
    obsidianNeedles: [0, 1, 2, 3].map(obsidianNeedle),
    brazier: brazierStand(),
    bridgeRail: bridgeRail(),
    bridgeRailV: bridgeRailV(),
    bridgePier: [0, 1].map(bridgePier),
    lavaCrust: [0, 1, 2].map(lavaCrust),
    colossusRemains: [0, 1].map(colossusRemains),
    templeFacade: templeFacade(),
    gatePylon: gatePylon(),
    marketStalls: [0, 1].map(marketStall),
    phaseAnchor: { off: phaseAnchor(false), on: phaseAnchor(true) },
    crownShrine: { off: crownShrine(false), on: crownShrine(true) },
    ashDrifts: [0, 1, 2].map(ashDrift),
    // Runde 5/2: Wegmarken, Barrikaden, Grabstelen
    cairns: [0, 1, 2].map(cairn),
    barricades: [0, 1].map(barricade),
    steles: [0, 1, 2].map(stele),
    // Runde 6: Schuttkegel, umgestürzte Säulen, geborstener Turm
    rubbleHeaps: [0, 1].map(rubbleHeap),
    fallenColumns: [0, 1].map(fallenColumn),
    towerStump: towerStump(),
  };
}
