import { PAL } from '../gfx/Palette.js';
import { createRng, hash2 } from '../core/math.js';
import { OUT } from './outdoor.js';
import { mk, poly, drawTent } from './decor_ashwood.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { SpriteFrame } from '../gfx/Sprite.js';

// Frostzinnen: verschneite Gipfel, Nordmänner-Feste, Eishöhlen und die
// Knochen erschlagener Eistrolle. Licht von links oben (Mond), Schnee liegt
// auf allen Oberseiten; Eis leuchtet kalt auf der Glow-Ebene ((W+2)×(H+2)).

// Bodenpalette (Format wie BIOME_GROUND in sprites/outdoor.js):
// grass = Schneedecke, dirt = festgetretener Schnee/Fels (Wege), water = Eis.
export const GROUND_FROST = {
  grass: ['#4c586e', '#5a677e', '#67758e', '#76849e', '#8794ae', '#a2b0c6'],
  dirt: ['#262b37', '#303644', '#3a4152', '#464e60', '#545d70', '#687286'],
  water: ['#2a4660', '#3a5e7e', '#4a7496', '#6490b0', '#9cc6de'],
  tufts: false,
};

const SNOW = ['#2e384b', '#3e4a61', '#53627b', '#6d7f98', '#8fa2ba', '#b6c6d8', '#e2ebf4'];
const ICE = ['#0c2234', '#143e58', '#1e6080', '#3a8cae', '#6cbed8', '#b0e8f4', '#effcff'];
const PINE = ['#060c0e', '#0b1618', '#112120', '#182d2a', '#223b35', '#2f4b43'];
const ROCK = ['#11141d', '#191d29', '#232837', '#2f3546', '#3d4457', '#4f576b', '#666e83'];
const HIDE = ['#1c1511', '#2e2219', '#433225', '#5a4532', '#735c43', '#8d7556'];
const NBLUE = ['#0b1326', '#132142', '#1d3264', '#2b4a8a', '#4668b0', '#7896d0'];
const BONE = ['#3a3730', '#5e5a4e', '#8a8470', '#b4ac92', '#d8d0b6', '#f2ecd8'];
const WOOD = OUT.wood, STONE = PAL.stone, IRON = PAL.steel, EMB = PAL.ember, GOLD = PAL.gold, CRIM = PAL.crimson, LEA = PAL.leather;
const clampI = (i, n) => Math.max(0, Math.min(n - 1, i));

// ------------------------------------------------------------ Helfer
// Schneefleck am Fuß (weich, hell)
function snowPatch(p, cx, cy, rx, ry, seed) {
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
    const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
    if (d > 1) continue;
    const h = hash2(cx + x, cy + y, seed);
    if (d > 0.55 && h < 0.4) continue;
    p.px(cx + x, cy + y, y < 0 && h < 0.35 ? SNOW[5] : h < 0.6 ? SNOW[4] : SNOW[3]);
  }
}

// Maske -> Schneekappe auf allen Oberkanten (Lichtseite links dicker)
function snowOnMask(p, mask, W, H, { depth = 2, seed = 1, left = 0.5, chance = 0.92 } = {}) {
  const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!at(x, y) || at(x, y - 1)) continue;
    if (hash2(x, y, seed) > chance) continue;
    const d = depth + (x < W * left ? 1 : 0) - (hash2(x, y, seed + 1) < 0.3 ? 1 : 0);
    for (let k = 0; k < d; k++) if (at(x, y + k)) p.px(x, y + k, k === 0 ? SNOW[6] : k === 1 ? SNOW[5] : SNOW[4]);
  }
}

// Eiszapfen an einer Kante (y = Unterkante), nach unten spitz
function icicles(p, g, x0, x1, y, seed, maxLen = 5, density = 0.45) {
  for (let x = x0; x <= x1; x++) {
    const h = hash2(x, y, seed);
    if (h > density) continue;
    const len = 1 + Math.floor(hash2(x, 3, seed) * maxLen);
    for (let k = 0; k < len; k++) p.px(x, y + k, k === 0 ? ICE[5] : k < len - 1 ? ICE[4] : ICE[3]);
    if (g && len > 2) g.px(x, y + len - 1, ICE[3]);
  }
}

// Behauene Steinlagen (5 px hoch, versetzt)
function courses(p, pal, x0, y0, w, h, seed, { bw = 8, soot = false } = {}) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const row = Math.floor((y - y0) / 5), off = (row % 2) * (bw >> 1);
    const lx = (x - x0 + off + bw * 4) % bw, ly = (y - y0) % 5;
    const blk = hash2(Math.floor((x - x0 + off + bw * 4) / bw), row, seed);
    let k = blk < 0.3 ? 2 : blk < 0.8 ? 3 : 4;
    if (ly === 0 || lx === 0) k = 1;
    else if (ly === 1 || lx === 1) k += 1;
    else if (ly === 4 || lx === bw - 1) k -= 1;
    if (hash2(x, y, seed + 1) < 0.05) k -= 1;
    if (soot && y > y0 + h - 4 && hash2(x, y, seed + 2) < 0.5) k -= 1;
    p.px(x, y, pal[clampI(k, pal.length)]);
  }
}

// Feldsteine (runde Brocken) für Sockel
function fieldstones(p, x0, y0, w, h, seed) {
  p.rect(x0, y0, w, h, ROCK[1]);
  const rng = createRng(seed);
  for (let y = y0; y < y0 + h; y += 4) {
    for (let x = x0 + ((y - y0) / 4 % 2) * 3 - 2; x < x0 + w; x += rng.int(5, 7)) {
      const rw = rng.range(2.4, 3.4), rh = 2;
      const cx = Math.max(x0 + 1, Math.min(x0 + w - 2, x + 2)), cy = y + 2;
      for (let yy = -2; yy <= 2; yy++) for (let xx = -3; xx <= 3; xx++) {
        const d = (xx * xx) / (rw * rw) + (yy * yy) / (rh * rh);
        const px = cx + xx, py = cy + yy;
        if (d > 1 || px < x0 || px >= x0 + w || py < y0 || py >= y0 + h) continue;
        let k = 3;
        if (xx + yy < -2) k = 5; else if (xx + yy < 0) k = 4; else if (xx + yy > 2) k = 2;
        p.px(px, py, ROCK[k]);
      }
    }
  }
}

// Holzstamm senkrecht (Palisade), 3-4 px breit mit Spitze
function logV(p, x, yTop, yBot, w = 3, seed = 1) {
  for (let y = yTop + 2; y <= yBot; y++) for (let i = 0; i < w; i++) {
    let c = i === 0 ? WOOD[4] : i === w - 1 ? WOOD[1] : WOOD[3];
    if (i > 0 && i < w - 1 && hash2(x + i, y, seed) < 0.15) c = WOOD[2];
    p.px(x + i, y, c);
  }
  p.px(x + (w >> 1), yTop, WOOD[4]);
  for (let i = 0; i < w; i++) p.px(x + i, yTop + 1, i === 0 ? WOOD[4] : i === w - 1 ? WOOD[2] : WOOD[3]);
  // Schneehaube auf der Spitze
  p.px(x + (w >> 1), yTop, SNOW[6]); p.px(x, yTop + 1, SNOW[5]); if (w > 3) p.px(x + 1, yTop + 1, SNOW[6]);
}

// Flamme (statisch) auf Sprite + Glow
function flame(p, g, x, y, h, wide = 1) {
  for (let i = 0; i < h; i++) {
    const t = i / h, half = Math.max(0, Math.round((1 - t) * wide + (i < 2 ? 0.5 : 0)));
    const sway = Math.round(Math.sin(i * 0.9) * (t > 0.4 ? 1 : 0));
    for (let dx = -half; dx <= half; dx++) {
      const edge = Math.abs(dx) === half && half > 0;
      const c = t > 0.75 ? EMB[2] : edge ? EMB[3] : t < 0.35 ? EMB[5] : EMB[4];
      p.px(x + dx + sway, y - i, c);
      g.px(x + dx + sway, y - i, t > 0.75 ? EMB[3] : edge ? EMB[4] : EMB[5]);
    }
  }
}

// ------------------------------------------------------------ Verschneite Tanne
function snowPine(seed, H) {
  const rng = createRng(seed);
  const W = 34, cx = 16, bottom = H - 1;
  return mk(W, H, (p, g) => {
    snowPatch(p, cx, bottom - 1, 11, 2, seed);
    // Stamm
    for (let y = bottom - 9; y <= bottom; y++) { p.px(cx - 1, y, '#3a2a26'); p.px(cx, y, '#2a1c1a'); p.px(cx + 1, y, '#1a1012'); if (y > bottom - 2) { p.px(cx - 2, y, '#2a1c1a'); p.px(cx + 2, y, '#1a1012'); } }
    const mask = new Uint8Array(W * H);
    const tiers = Math.max(4, Math.round((H - 12) / 7.2));
    const span = bottom - 8 - 2;
    for (let t = 0; t < tiers; t++) {
      const k = t / (tiers - 1);
      const baseY = Math.round(bottom - 8 - k * (span - 8));
      const half = 14 - k * 10 + rng.range(-0.6, 0.6);
      const th = Math.round(11 - k * 3);
      for (let dy = 0; dy < th; dy++) {
        const y = baseY - dy;
        const kk = dy / th;
        const hw = Math.max(0, half * (1 - kk) ** 0.9 + rng.range(-0.7, 0.7));
        for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
          if (x < 0 || x >= W || y < 0) continue;
          const rel = (x - cx) / Math.max(1, hw);
          let i = 2 + (rel < -0.35 ? 1 : 0) + (rel > 0.35 ? -1 : 0);
          if (dy < 2) i -= 1; // Unterseite im Schatten
          if (hash2(x, y, seed) < 0.1) i += hash2(x, y, seed + 1) < 0.5 ? 1 : -1;
          p.px(x, y, PINE[clampI(i, 6)]);
          mask[y * W + x] = 1;
        }
        // hängende Zweigspitzen
        if (dy === 0) for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x += 2) if (rng.chance(0.55)) { p.px(x, y + 1, PINE[1]); }
      }
    }
    // Spitze
    p.px(cx, 1, PINE[3]); p.px(cx, 2, PINE[3]); mask[1 * W + cx] = 1; mask[2 * W + cx] = 1;
    // Schnee auf den Etagen: Oberkanten und Zweigenden
    snowOnMask(p, mask, W, H, { depth: 2, seed: seed + 3, left: 0.55, chance: 0.95 });
    // Schneepolster auf den Zweigspitzen (Etagen-Unterkanten, außen)
    for (let t = 0; t < tiers; t++) {
      const k = t / (tiers - 1);
      const baseY = Math.round(bottom - 8 - k * (span - 8));
      const half = 14 - k * 10;
      for (let x = Math.round(cx - half) + 1; x <= Math.round(cx + half) - 1; x++) {
        const rel = (x - cx) / half;
        if (Math.abs(rel) < 0.3) continue;
        if (hash2(x, t, seed + 9) < 0.55) {
          const yy = baseY - 1 - (hash2(x, t, seed + 10) < 0.4 ? 1 : 0);
          p.px(x, yy, rel < 0 ? SNOW[6] : SNOW[4]);
          if (rel < -0.4 && hash2(x, t, seed + 11) < 0.5) p.px(x, yy - 1, SNOW[5]);
        }
      }
    }
    // Rauhreif-Glitzer (sehr dezent)
    for (let i = 0; i < 4; i++) { const x = cx - rng.int(2, 9), y = rng.int(8, bottom - 12); if (mask[y * W + x]) { p.px(x, y, SNOW[6]); g.px(x, y, '#3a5a78'); } }
  }, { ax: cx, box: [-3, -3, 3, 1] });
}

// ------------------------------------------------------------ Gefrorene Felsen
function frozenRock(v) {
  const rng = createRng(710 + v);
  const w = [16, 22, 12][v], h = [11, 14, 9][v];
  const W = w + 6, H = h + 6;
  return mk(W, H, (p, g) => {
    const cx = W / 2 - 0.5, cy = h / 2 + 3;
    const mask = new Uint8Array(W * H);
    const body = (ex, ey, rx, ry, c) => {
      for (let y = Math.floor(ey - ry); y <= Math.ceil(ey + ry); y++) for (let x = Math.floor(ex - rx); x <= Math.ceil(ex + rx); x++) {
        const d = ((x - ex) / rx) ** 2 + ((y - ey) / ry) ** 2;
        if (d <= 1 && x >= 0 && y >= 0 && x < W && y < H) { p.px(x, y, c(x, y, d)); mask[y * W + x] = 1; }
      }
    };
    const shade = (x, y, d) => {
      const lx = (x - cx) / (w / 2), ly = (y - cy) / (h / 2);
      let k = 3 - Math.round(lx * 1.3 + ly * 1.2);
      if (d > 0.8 && lx > 0) k -= 1;
      if (hash2(x, y, 711 + v) < 0.08) k -= 1;
      return ROCK[clampI(k, 7)];
    };
    body(cx, cy, w / 2, h / 2, shade);
    if (v === 1) body(cx + 5, cy - 3, w / 4, h / 3, shade);
    if (v === 0) body(cx - 4, cy + 1, w / 4, h / 3.2, shade);
    // Bruchkante / Facette
    p.line(cx + 1, cy - h / 2 + 2, cx + 3, cy + 1, ROCK[1]); p.line(cx, cy - h / 2 + 3, cx + 2, cy, ROCK[5]);
    if (v === 1) { p.line(cx - 6, cy - 1, cx - 3, cy + 3, ROCK[1]); }
    // Blaues Eis in den Ritzen
    for (let i = 0; i < 3 + v; i++) { const x = Math.round(cx + rng.int(-w / 3, w / 3)), y = Math.round(cy + rng.int(0, h / 3)); if (mask[y * W + x]) { p.px(x, y, ICE[3]); p.px(x + 1, y, ICE[2]); } }
    // Schneekappe
    snowOnMask(p, mask, W, H, { depth: v === 1 ? 3 : 2, seed: 712 + v, left: 0.6, chance: 0.97 });
    // Eiszapfen am rechten Überhang
    const iy = Math.round(cy + h / 2 - 2);
    icicles(p, g, Math.round(cx + 1), Math.round(cx + w / 2 - 2), iy, 713 + v, 3);
    // Schnee am Fuß
    snowPatch(p, Math.round(cx), H - 3, Math.round(w / 2) + 2, 2, 714 + v);
    p.rect(Math.round(cx - w / 2) + 1, H - 2, w - 1, 1, SNOW[2]);
  }, { ax: Math.floor(W / 2), ay: H - 3, box: [-Math.floor(w / 2) + 1, -4, Math.floor(w / 2) - 1, 1] });
}

// ------------------------------------------------------------ Eiskristalle
function iceCrystals(v) {
  const rng = createRng(730 + v);
  const W = 26, H = [30, 24, 36][v];
  const sets = [
    [[13, 2, 3.5, 0], [7, 11, 2.5, -3], [19, 10, 3, 3], [10, 17, 2, -1]],
    [[9, 3, 3, -2], [16, 7, 3.5, 2], [5, 13, 2, -3], [21, 14, 2, 3]],
    [[12, 1, 4, 1], [6, 12, 3, -4], [19, 8, 3, 4], [15, 20, 2, 2], [8, 21, 2, -2]],
  ][v];
  return mk(W, H, (p, g) => {
    const base = H - 3;
    snowPatch(p, 13, H - 3, 11, 2, 730 + v);
    // hintere zuerst (kleinere Spitzen)
    const order = [...sets].sort((a, b) => a[1] - b[1]).reverse();
    for (const [x, tipY, hw, lean] of order) {
      const tx = x + lean;
      const bl = x - hw, br = x + hw + 1;
      // linke Facette (beleuchtet)
      poly(p, [[tx + 0.5, tipY], [bl, base - 1], [bl + 1, base + 1], [x + 0.5, base + 1], [x + 0.5, tipY + 3]], (xx, yy) => {
        const k = (yy - tipY) / (base - tipY);
        return k < 0.2 ? ICE[6] : hash2(xx, yy, 731) < 0.12 ? ICE[4] : ICE[5];
      });
      // rechte Facette
      poly(p, [[tx + 0.5, tipY], [x + 0.5, tipY + 3], [x + 0.5, base + 1], [br - 1, base + 1], [br, base - 1]], (xx, yy) => (hash2(xx, yy, 732) < 0.15 ? ICE[2] : ICE[3]));
      // Grat + innerer Kern
      p.line(tx, tipY + 1, x, base, ICE[6]);
      for (let y = tipY + 4; y < base - 1; y += 2) { const t = (y - tipY) / (base - tipY); const xx = Math.round(tx + (x - tx) * t) + 1; p.px(xx, y, ICE[4]); g.px(xx, y, ICE[3]); }
      g.px(tx, tipY, ICE[6]); g.px(tx, tipY + 1, ICE[5]);
      g.line(tx, tipY + 2, x, base - 1, ICE[2]);
      // dunkle Innenschatten nahe am Fuß
      p.px(x + 1, base - 1, ICE[1]); p.px(x + 2, base, ICE[1]);
    }
    // Schnee um den Fuß und Splitter
    for (let i = 0; i < 6; i++) { const x = rng.int(3, 22), y = base + rng.int(0, 1); p.px(x, y, SNOW[5]); }
    for (let i = 0; i < 3; i++) { const x = rng.int(2, 23); p.px(x, H - 2, ICE[4]); p.px(x, H - 3, ICE[6]); g.px(x, H - 3, ICE[4]); }
  }, { ax: 13, ay: H - 2, box: [-7, -3, 7, 1], light: { dx: 0, dy: -12, radius: 44, color: [120, 200, 255], intensity: 0.55 } });
}

// ------------------------------------------------------------ Schneewehen
function snowDrift(v) {
  const rng = createRng(750 + v);
  const W = v ? 26 : 34, H = v ? 9 : 12;
  return mk(W, H, (p) => {
    const cx = W / 2 - 0.5, cy = H - 4;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const nx = (x - cx) / (W / 2 - 1), ny = (y - cy) / (H / 2 - 0.5);
      // asymmetrische Wehe: Luvseite flach links, Leekante steil rechts
      const hump = ny + 0.35 * nx;
      const d = nx * nx + (ny < 0 ? hump * hump * 1.2 : ny * ny * 3);
      if (d > 1 || y > H - 2) continue;
      let k = 4;
      if (ny < -0.2 && nx < 0.3) k = 5;
      if (ny < -0.55 && nx < 0) k = 6;
      if (nx > 0.45) k = 3;
      if (ny > 0.4) k = 3;
      if (d > 0.85 && ny > 0) k = 2;
      p.px(x, y, SNOW[k]);
    }
    // Windkamm (Grat) und Rippeln
    for (let x = Math.round(W * 0.3); x < W - 5; x++) { const y = Math.round(cy - (H / 2 - 1.5) * (1 - ((x - cx - 3) / (W / 2)) ** 2)); if (hash2(x, 1, 751) < 0.75) p.px(x, y + 2, SNOW[2]); }
    for (let r = 0; r < 2; r++) for (let x = 4 + r * 3; x < W - 8; x++) { const y = cy + r + Math.round(Math.sin(x * 0.55 + r) * 0.6); if (hash2(x, r, 752 + v) < 0.5) p.px(x, y, SNOW[3]); }
    // Steinchen / Zweig
    for (let i = 0; i < 2; i++) { const x = rng.int(W / 2, W - 5), y = H - 3; p.px(x, y, ROCK[2]); p.px(x - 1, y, ROCK[4]); }
    if (v === 0) { p.line(6, H - 5, 3, H - 9, WOOD[1]); p.px(4, H - 8, WOOD[2]); }
  }, { ax: Math.floor(W / 2), ay: H - 2 });
}

// ------------------------------------------------------------ Langhaus
function longhouse() {
  const W = 116, H = 80;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 58;
    const x0 = 10, x1 = 105;
    const wallTop = bottom - 26;
    snowPatch(p, cx, bottom - 1, 56, 3, 801);
    // Sockel aus Feldsteinen
    fieldstones(p, x0 - 1, bottom - 5, x1 - x0 + 3, 6, 802);
    // Stabwand (senkrechte Planken)
    for (let y = wallTop; y < bottom - 5; y++) for (let x = x0; x <= x1; x++) {
      const lx = (x - x0) % 4;
      let k = lx === 0 ? 1 : lx === 1 ? 4 : 3;
      if (hash2(x, y >> 2, 803) < 0.1) k -= 1;
      if (y < wallTop + 3) k -= 1; // Traufschatten
      p.px(x, y, WOOD[clampI(k, 5)]);
    }
    // Eckständer
    for (const xx of [x0, x1 - 2]) { p.rect(xx, wallTop, 3, bottom - 5 - wallTop, WOOD[2]); p.rect(xx, wallTop, 1, bottom - 5 - wallTop, WOOD[4]); }
    // Schwellbalken
    p.rect(x0, bottom - 6, x1 - x0 + 1, 2, WOOD[2]); p.rect(x0, bottom - 6, x1 - x0 + 1, 1, WOOD[3]);
    // Rundschilde an der Wand
    const shields = [[22, NBLUE, 'cross'], [36, CRIM, 'ring'], [80, CRIM, 'split'], [94, NBLUE, 'ring']];
    for (const [sx, pal, kind] of shields) {
      const sy = wallTop + 14;
      p.ellipse(sx, sy, 5, 5, WOOD[1]);
      p.ellipse(sx, sy, 4, 4, pal[2]);
      if (kind === 'cross') { p.rect(sx - 4, sy, 9, 1, BONE[3]); p.rect(sx, sy - 4, 1, 9, BONE[3]); }
      else if (kind === 'split') { for (let y = -4; y <= 4; y++) for (let x = 0; x <= 4; x++) if (x * x + y * y <= 16) p.px(sx + x, sy + y, BONE[3]); }
      else { p.ellipse(sx, sy, 2.5, 2.5, pal[4]); p.ellipse(sx, sy, 1.5, 1.5, pal[2]); }
      p.ellipse(sx - 1, sy - 1, 1.5, 1.5, pal[4]);
      p.px(sx, sy, IRON[4]); p.px(sx - 1, sy - 1, IRON[5]);
      p.px(sx - 4, sy - 2, pal[3]); p.px(sx + 4, sy + 2, pal[1]);
    }
    // Tür mit Vordach
    const dx0 = cx - 8, dx1 = cx + 8;
    p.rect(dx0 - 2, wallTop + 2, dx1 - dx0 + 5, bottom - 6 - wallTop - 2, WOOD[1]);
    p.rect(dx0, wallTop + 6, dx1 - dx0 + 1, bottom - 6 - wallTop - 6, '#1a0e0a');
    // Türflügel halb offen (warmes Licht innen)
    p.rect(dx0 + 1, wallTop + 7, 7, bottom - 6 - wallTop - 7, '#8a4418');
    p.rect(dx0 + 2, wallTop + 9, 5, bottom - 6 - wallTop - 11, '#c0682a');
    p.rect(dx0 + 3, bottom - 12, 2, 5, '#3a1a0c'); p.px(dx0 + 3, bottom - 13, '#3a1a0c');
    g.rect(dx0 + 1, wallTop + 7, 7, bottom - 6 - wallTop - 7, EMB[2]);
    g.rect(dx0 + 2, wallTop + 9, 5, bottom - 6 - wallTop - 11, EMB[3]);
    p.rect(dx0 + 8, wallTop + 6, 8, bottom - 6 - wallTop - 6, WOOD[2]);
    for (let x = dx0 + 9; x < dx1; x += 3) p.rect(x, wallTop + 6, 1, bottom - 6 - wallTop - 6, WOOD[1]);
    for (const y of [wallTop + 9, bottom - 10]) { p.rect(dx0 + 8, y, 8, 1, IRON[1]); p.px(dx0 + 9, y, IRON[3]); }
    p.px(dx0 + 10, wallTop + 14, GOLD[3]);
    // Schwelle
    p.rect(dx0 - 3, bottom - 5, dx1 - dx0 + 7, 2, STONE[3]); p.rect(dx0 - 3, bottom - 5, dx1 - dx0 + 7, 1, SNOW[4]);
    // Türpfosten mit Schnitzwerk
    for (const xx of [dx0 - 2, dx1 + 1]) { p.rect(xx, wallTop + 2, 2, bottom - 6 - wallTop - 2, WOOD[3]); for (let y = wallTop + 4; y < bottom - 7; y += 3) p.px(xx + (y % 2), y, WOOD[1]); }
    // Schmale Fensterluken mit Glut
    for (const wx of [28, 48, 70, 88]) {
      if (wx > dx0 - 4 && wx < dx1 + 4) continue;
      p.rect(wx, wallTop + 7, 4, 2, '#1a0c08'); p.rect(wx + 1, wallTop + 7, 2, 1, EMB[2]);
      g.rect(wx, wallTop + 7, 4, 2, EMB[2]); g.rect(wx + 1, wallTop + 7, 2, 1, EMB[4]);
      p.rect(wx - 1, wallTop + 9, 6, 1, WOOD[4]);
    }
    // Dach: geschwungener First (Enden höher), geschlossene Schneedecke; darunter
    // zeichnen sich die Schindelreihen als weiche Wellen ab, an der Traufe schauen sie heraus.
    const roofTop = 24, eave = wallTop + 2;
    const ridgeAt = (x) => Math.round(roofTop + 2 * (1 - ((x - cx) / 52) ** 2));
    const rx0 = x0 - 7, rx1 = x1 + 7;
    for (let x = rx0; x <= rx1; x++) {
      const top = ridgeAt(x) + Math.max(0, Math.round((Math.abs(x - cx) - 46) * 0.8));
      const bare = 3 + Math.round(vnoiseLite(x / 5, 1, 804) * 5); // freie Schindelreihen an der Traufe
      for (let y = top; y <= eave; y++) {
        const k = (y - top) / Math.max(1, eave - top);
        let c;
        if (eave - y < bare) {
          const row = Math.floor((eave - y) / 3), lx = (x + (row % 2) * 2) % 4;
          c = (eave - y) % 3 === 0 ? WOOD[1] : lx === 0 ? WOOD[1] : WOOD[x < cx - 30 ? 3 : 2];
          if (eave - y === bare - 1) c = SNOW[3];
        } else {
          // Grundton: links hell (Mondlicht), rechts kühler Schatten
          const lat = (x - rx0) / (rx1 - rx0);
          const th = (((x & 1) * 2 + (y & 1) * 3) % 4) / 4 + 0.125;
          const tone = 6.3 - lat * 2.2 - k * 0.5;
          let sI = Math.floor(tone) + (tone - Math.floor(tone) > th ? 1 : 0);
          if (k < 0.1) sI = Math.min(6, sI + 1);
          // Schindelwellen unter dem Schnee
          const wave = (y - top + Math.round(Math.sin(x * 0.25) * 0.6)) % 5;
          if (wave === 4 && hash2(x, y, 805) < 0.75) sI -= 1;
          if (wave === 0 && lat < 0.6 && hash2(x, y, 806) < 0.3) sI = Math.min(6, sI + 1);
          if (hash2(x, y, 807) < 0.015) sI -= 2;
          c = SNOW[clampI(sI, 7)];
        }
        p.px(x, y, c);
      }
      // Giebelkante links/rechts etwas dunkler
      if (x === rx0 || x === rx1) for (let y = top; y <= eave; y++) p.px(x, y, SNOW[2]);
    }
    // Traufkante mit Schneewulst und Eiszapfen
    for (let x = rx0; x <= rx1; x++) { p.px(x, eave + 1, WOOD[0]); p.px(x, eave + 2, WOOD[1]); }
    icicles(p, g, rx0 + 1, rx1 - 1, eave + 3, 806, 5, 0.22);
    // Traufschatten an der Wand
    for (let x = x0; x <= x1; x++) p.px(x, eave + 3, WOOD[0]);
    // Firstbalken
    for (let x = rx0 + 6; x <= rx1 - 6; x++) { const y = ridgeAt(x); p.px(x, y - 1, SNOW[6]); p.px(x, y, SNOW[6]); if (hash2(x, 0, 808) < 0.4) p.px(x, y - 2, SNOW[5]); }
    // Gekreuzte Drachenköpfe an den Giebeln
    const dragon = (bx, by, dir) => {
      p.line(bx, by + 6, bx + dir * 6, by - 4, WOOD[3]); p.line(bx + 1, by + 6, bx + 1 + dir * 6, by - 4, WOOD[2]);
      p.line(bx + dir * 2, by + 6, bx - dir * 3, by - 3, WOOD[2]);
      // Kopf
      const hx = bx + dir * 6, hy = by - 5;
      p.rect(hx - 1, hy - 1, 3, 3, WOOD[3]); p.px(hx + dir * 2, hy, WOOD[3]); p.px(hx + dir * 3, hy + 1, WOOD[2]); p.px(hx + dir * 2, hy + 1, WOOD[2]);
      p.px(hx - dir, hy - 2, WOOD[4]); p.px(hx - dir * 2, hy - 3, WOOD[3]);
      p.px(hx + dir, hy - 1, GOLD[3]);
      p.px(hx, hy - 2, SNOW[6]); p.px(hx - 1, hy - 2, SNOW[5]);
      const tx = bx - dir * 3, ty = by - 4;
      p.px(tx, ty, WOOD[3]); p.px(tx - dir, ty - 1, WOOD[3]); p.px(tx - dir, ty - 2, WOOD[4]); p.px(tx, ty - 1, SNOW[6]);
    };
    dragon(rx0 + 4, ridgeAt(rx0 + 6) + 1, -1);
    dragon(rx1 - 5, ridgeAt(rx1 - 6) + 1, 1);
    // Rauchloch (dunkel, warmer Schimmer)
    const hx = cx + 16, hy = ridgeAt(cx + 16) + 5;
    p.rect(hx - 3, hy, 7, 3, '#140a08'); p.rect(hx - 2, hy + 1, 5, 1, EMB[1]); g.rect(hx - 2, hy + 1, 5, 1, EMB[2]);
    p.rect(hx - 4, hy - 1, 9, 1, SNOW[6]); p.rect(hx - 3, hy + 3, 7, 1, WOOD[1]);
    // Vordach über der Tür (kleiner Giebel)
    poly(p, [[cx + 0.5, wallTop - 8], [dx0 - 5, wallTop + 3], [dx1 + 6, wallTop + 3]], (x, y) => (y < wallTop - 5 ? SNOW[6] : x < cx - 3 ? SNOW[5] : x < cx + 2 ? SNOW[4] : SNOW[3]));
    p.line(dx0 - 5, wallTop + 3, cx, wallTop - 8, WOOD[3]); p.line(cx + 1, wallTop - 8, dx1 + 6, wallTop + 3, WOOD[1]);
    p.rect(dx0 - 5, wallTop + 4, dx1 - dx0 + 12, 1, WOOD[1]);
    icicles(p, g, dx0 - 4, dx1 + 5, wallTop + 5, 808, 3);
    // Geweih über der Tür
    p.line(cx - 1, wallTop - 1, cx - 5, wallTop - 5, BONE[3]); p.line(cx + 1, wallTop - 1, cx + 5, wallTop - 5, BONE[2]);
    p.px(cx - 4, wallTop - 2, BONE[4]); p.px(cx + 4, wallTop - 2, BONE[2]); p.px(cx - 6, wallTop - 4, BONE[3]); p.px(cx + 6, wallTop - 4, BONE[2]);
    p.rect(cx - 1, wallTop - 1, 3, 2, BONE[3]);
    // Laternen neben der Tür
    for (const lx of [dx0 - 6, dx1 + 5]) {
      p.line(lx + 1, wallTop + 4, lx + 1, wallTop + 7, IRON[2]);
      p.rect(lx, wallTop + 8, 3, 4, '#3a2410'); p.px(lx + 1, wallTop + 9, EMB[4]); p.px(lx + 1, wallTop + 10, EMB[3]);
      g.rect(lx, wallTop + 8, 3, 4, EMB[3]); g.px(lx + 1, wallTop + 9, EMB[5]);
      p.rect(lx - 1, wallTop + 12, 5, 1, IRON[1]);
    }
    // Holzstoß an der rechten Wand, Schneehaufen links
    for (let i = 0; i < 3; i++) for (let j = 0; j < 4 - i; j++) {
      const lx = 97 + j * 4 + i * 2, ly = bottom - 3 - i * 3;
      p.ellipse(lx, ly, 2, 1.6, WOOD[1]); p.px(lx, ly, '#8a6a44'); p.px(lx - 1, ly - 1, '#a88452');
    }
    p.rect(98, bottom - 12, 13, 1, SNOW[5]);
    snowPatch(p, 13, bottom - 3, 7, 3, 809);
  }, {
    ax: 58, box: [-50, -18, 50, 1],
    light: { dx: 0, dy: -10, radius: 90, color: [255, 160, 80], intensity: 0.85 },
    extra: { smoke: { dx: 16, dy: -58, rate: 4 }, lights: [{ dx: -14, dy: -20, radius: 40, color: [255, 170, 90], intensity: 0.6 }, { dx: 14, dy: -20, radius: 40, color: [255, 170, 90], intensity: 0.6 }] },
  });
}

// Billiges Wertrauschen für Muster (deterministisch)
function vnoiseLite(x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed), c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// ------------------------------------------------------------ Festungsmauer (Holz auf Steinsockel)
function fortWallH() {
  const W = 16, H = 34;
  return mk(W, H, (p) => {
    const bottom = H - 1, sockTop = bottom - 9;
    // Wehrgang hinter den Stämmen (Bohlen, Schnee)
    // Palisadenstämme
    for (let i = 0; i < 4; i++) {
      const x = i * 4, top = [2, 0, 3, 1][i];
      logV(p, x, top, sockTop, 4, 820 + i);
      p.px(x + 3, sockTop - 1, WOOD[0]);
    }
    // Querriegel mit Eisenklammern
    for (const y of [8, 17]) { p.rect(0, y, 16, 2, WOOD[2]); p.rect(0, y, 16, 1, WOOD[4]); for (let x = 2; x < 16; x += 8) { p.rect(x, y, 2, 2, IRON[2]); p.px(x, y, IRON[4]); } p.px(0, y - 1, SNOW[5]); p.px(5, y - 1, SNOW[6]); p.px(9, y - 1, SNOW[5]); p.px(13, y - 1, SNOW[6]); }
    // Steinsockel mit Schneekante
    fieldstones(p, 0, sockTop, 16, 10, 821);
    for (let x = 0; x < 16; x++) { p.px(x, sockTop, SNOW[hash2(x, 0, 822) < 0.5 ? 6 : 5]); if (hash2(x, 1, 822) < 0.5) p.px(x, sockTop + 1, SNOW[4]); }
    // Schneeverwehung am Fuß
    for (let x = 0; x < 16; x++) { const hh = 1 + Math.round(hash2(x, 2, 823) * 1.4); for (let y = bottom - hh + 1; y <= bottom; y++) p.px(x, y, y === bottom - hh + 1 ? SNOW[5] : SNOW[4]); }
  }, { ax: 8, box: [-8, -4, 8, 1] });
}

function fortWallV() {
  const W = 10, H = 42;
  return mk(W, H, (p) => {
    const bottom = H - 1;
    // Stämme von hinten nach vorn
    for (let k = 0; k < 5; k++) {
      const gy = bottom - 16 + k * 4, top = gy - 26 + [1, 0, 2, 0, 1][k];
      logV(p, 3, top, gy - 8, 4, 830 + k);
      p.px(2, top + 3, WOOD[3]); p.px(7, top + 3, WOOD[0]);
    }
    // Steinsockel als Seitenstreifen
    for (let y = bottom - 24; y <= bottom; y++) for (let x = 1; x < 9; x++) {
      const lx = (x + (Math.floor(y / 4) % 2) * 2) % 4;
      let k = x < 3 ? 4 : x < 7 ? 3 : 2;
      if (y % 4 === 0 || lx === 0) k = 1;
      if (y > bottom - 24 && y < bottom - 8) continue; // Sockel nur unten sichtbar
      p.px(x, y, ROCK[clampI(k, 7)]);
    }
    for (let y = bottom - 7; y <= bottom; y++) { p.px(1, y, SNOW[5]); if (y > bottom - 3) p.rect(1, y, 8, 1, SNOW[4]); }
    p.rect(1, bottom - 8, 8, 1, SNOW[6]);
    // Riegel
    for (let y = bottom - 32; y <= bottom - 10; y++) if (y % 9 === 0) { p.rect(2, y, 6, 2, WOOD[2]); p.px(2, y, WOOD[4]); p.px(2, y - 1, SNOW[6]); }
  }, { ax: 5, box: [-4, -16, 4, 1] });
}

// ------------------------------------------------------------ Festungstor
function fortGate() {
  const W = 72, H = 62;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 36;
    snowPatch(p, cx, bottom - 1, 34, 2, 841);
    // Tortürme links/rechts (Stein unten, Holz oben)
    const towerAt = (tx) => {
      const tw = 18, sockTop = bottom - 16;
      fieldstones(p, tx, sockTop, tw, 17, 842 + tx);
      for (let x = tx; x < tx + tw; x++) p.px(x, sockTop, SNOW[x < tx + 6 ? 6 : 5]);
      // Holzaufbau
      for (let y = 20; y < sockTop; y++) for (let x = tx + 1; x < tx + tw - 1; x++) {
        const lx = (x - tx - 1) % 4;
        let k = lx === 0 ? 1 : lx === 1 ? 4 : 3;
        if (x > tx + tw - 5) k -= 1;
        p.px(x, y, WOOD[clampI(k, 5)]);
      }
      // Schießscharte
      p.rect(tx + 8, 27, 2, 6, '#07060a'); p.rect(tx + 7, 26, 4, 1, WOOD[4]);
      // Plattform + Brüstung mit Spitzstämmen
      p.rect(tx - 1, 17, tw + 2, 3, WOOD[2]); p.rect(tx - 1, 17, tw + 2, 1, WOOD[4]); p.rect(tx - 1, 20, tw + 2, 1, WOOD[0]);
      for (let i = 0; i < 5; i++) logV(p, tx - 1 + i * 4, 5 + (i % 2) * 2, 16, 4, 843 + i);
      icicles(p, g, tx, tx + tw - 1, 21, 844 + tx, 4);
    };
    towerAt(1); towerAt(W - 19);
    // Wehrgang über dem Tor
    const gx0 = 19, gx1 = W - 20, lintel = 20;
    for (let i = 0; i < 9; i++) logV(p, gx0 + i * 4, 9 + [1, 0, 2, 1, 0, 2, 1, 0, 1][i], lintel, 4, 850 + i);
    // Sturzbalken mit Schnitzerei (Widderschädel)
    p.rect(gx0 - 1, lintel, gx1 - gx0 + 3, 5, WOOD[2]); p.rect(gx0 - 1, lintel, gx1 - gx0 + 3, 1, WOOD[4]); p.rect(gx0 - 1, lintel + 4, gx1 - gx0 + 3, 1, WOOD[0]);
    for (let x = gx0 + 1; x < gx1; x += 3) p.px(x, lintel + 2, WOOD[1]);
    p.rect(gx0 - 1, lintel - 1, gx1 - gx0 + 3, 1, SNOW[6]);
    // Widderschädel
    p.rect(cx - 3, lintel + 1, 7, 5, BONE[3]); p.rect(cx - 2, lintel + 6, 5, 2, BONE[2]); p.px(cx - 3, lintel + 1, BONE[4]);
    p.px(cx - 2, lintel + 3, '#140c0c'); p.px(cx + 2, lintel + 3, '#140c0c'); p.px(cx, lintel + 6, '#140c0c');
    for (const s of [-1, 1]) { p.line(cx + s * 3, lintel + 2, cx + s * 7, lintel + 1, BONE[3]); p.line(cx + s * 7, lintel + 1, cx + s * 8, lintel + 4, BONE[2]); p.px(cx + s * 7, lintel + 5, BONE[1]); }
    // Toröffnung und offene Flügel
    const ox0 = gx0, ox1 = gx1;
    p.rect(ox0, lintel + 5, ox1 - ox0 + 1, bottom - lintel - 5, '#07070c');
    for (let y = bottom - 9; y <= bottom; y++) for (let x = ox0 + 3; x <= ox1 - 3; x++) if ((x + y) % 2 === 0) p.px(x, y, '#1a1e2a');
    poly(p, [[ox0, lintel + 5], [ox0 + 7, lintel + 8], [ox0 + 7, bottom - 3], [ox0, bottom]], (x, y) => ((y - lintel) % 7 === 0 ? IRON[1] : (x - ox0) % 3 === 0 ? WOOD[1] : WOOD[3]));
    poly(p, [[ox1 + 1, lintel + 5], [ox1 - 6, lintel + 8], [ox1 - 6, bottom - 3], [ox1 + 1, bottom]], (x, y) => ((y - lintel) % 7 === 0 ? IRON[1] : (x - ox1) % 3 === 0 ? WOOD[0] : WOOD[1]));
    // Fackeln an den Türmen
    for (const tx of [15, W - 17]) {
      p.rect(tx, bottom - 24, 2, 6, WOOD[2]); p.rect(tx - 1, bottom - 21, 4, 1, IRON[2]);
      flame(p, g, tx + 1, bottom - 25, 5, 1);
    }
    // Schneebretter auf den Stufen
    p.rect(ox0 - 1, bottom, ox1 - ox0 + 3, 1, SNOW[4]);
  }, {
    ax: 36, light: { dx: 0, dy: -20, radius: 80, color: [255, 160, 80], intensity: 0.7 },
    extra: { boxes: [[-36, -6, -17, 1], [17, -6, 36, 1]], lights: [{ dx: -20, dy: -29, radius: 56, color: [255, 150, 70], intensity: 0.85 }, { dx: 20, dy: -29, radius: 56, color: [255, 150, 70], intensity: 0.85 }], door: { dx: 0, dy: -3 } },
  });
}

// ------------------------------------------------------------ Festungsturm
function fortTower() {
  const W = 42, H = 78;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 21;
    snowPatch(p, cx, bottom - 1, 19, 2, 861);
    // Steinsockel (Anlauf)
    const sockTop = bottom - 13;
    for (let y = sockTop; y <= bottom; y++) {
      const k = (y - sockTop) / 13, hw = 14 + k * 3;
      for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) p.px(x, y, ROCK[1]);
    }
    fieldstones(p, 5, sockTop, 32, 14, 862);
    for (let x = 6; x < 37; x++) { p.px(x, sockTop, SNOW[x < 16 ? 6 : 5]); if (hash2(x, 0, 863) < 0.5) p.px(x, sockTop + 1, SNOW[4]); }
    // Holzschaft (Blockbau, liegende Stämme)
    const bodyTop = 30;
    for (let y = bodyTop; y < sockTop; y++) for (let x = 8; x <= 33; x++) {
      const ly = (y - bodyTop) % 4;
      let k = ly === 0 ? 4 : ly === 3 ? 1 : 3;
      if (x > 29) k -= 1; if (x < 10) k += 1;
      if (hash2(x >> 1, y, 864) < 0.08) k -= 1;
      p.px(x, y, WOOD[clampI(k, 5)]);
    }
    // Überstehende Balkenköpfe an den Ecken
    for (let y = bodyTop; y < sockTop; y += 4) { p.rect(6, y, 3, 3, WOOD[3]); p.px(6, y, '#a88452'); p.rect(33, y, 3, 3, WOOD[2]); p.px(34, y + 1, '#6a4a2c'); }
    // Tür
    const dTop = bottom - 19;
    p.rect(15, dTop - 1, 12, bottom - dTop, ROCK[5]); p.rect(16, dTop, 10, bottom - dTop - 1, WOOD[0]);
    p.rect(17, dTop + 1, 8, bottom - dTop - 2, WOOD[2]); for (let x = 18; x < 25; x += 2) p.rect(x, dTop + 1, 1, bottom - dTop - 2, WOOD[1]);
    p.rect(17, dTop + 4, 8, 1, IRON[2]); p.rect(17, bottom - 5, 8, 1, IRON[2]); p.px(23, dTop + 9, IRON[4]); p.px(17, dTop + 4, IRON[4]);
    p.rect(14, bottom - 1, 14, 1, ROCK[4]); p.rect(14, bottom - 1, 14, 1, SNOW[5]);
    // Schwelle / Fußspuren
    p.px(20, bottom, '#1a2230'); p.px(22, bottom, '#1a2230');
    // Auskragende Wachstube
    const hut = 16;
    p.rect(3, hut, 36, 14, WOOD[2]);
    for (let x = 3; x < 39; x++) for (let y = hut; y < hut + 14; y++) { if ((x - 3) % 4 === 0) p.px(x, y, WOOD[1]); else if ((x - 3) % 4 === 1) p.px(x, y, WOOD[3]); }
    p.rect(3, hut + 13, 36, 2, WOOD[1]);
    for (let x = 5; x < 38; x += 5) { p.line(x, hut + 15, x + 2, bodyTop + 2, WOOD[1]); }
    // Ausguck mit Feuerschein
    p.rect(9, hut + 4, 24, 5, '#140a08'); for (let x = 12; x < 32; x += 6) p.rect(x, hut + 4, 1, 5, WOOD[2]);
    p.rect(10, hut + 7, 22, 2, EMB[1]); g.rect(10, hut + 6, 22, 3, EMB[2]); g.rect(15, hut + 7, 10, 1, EMB[3]);
    // Spitzdach mit Schnee
    for (let y = 0; y <= hut; y++) {
      const k = y / hut, hw = 3 + k * 20;
      for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
        const rel = (x - cx) / hw;
        const sn = vnoiseLite(x / 4, y / 3, 865);
        let c;
        if (sn < 0.95 - k * 0.5) c = SNOW[rel < -0.3 ? 6 : rel < 0.3 ? 5 : 4];
        else c = WOOD[rel < 0 ? 3 : 1];
        if (y % 3 === 0 && WOOD.includes(c)) c = WOOD[0];
        p.px(x, y, c);
      }
    }
    p.line(cx, 0, cx, 3, WOOD[3]);
    for (let x = cx - 23; x <= cx + 23; x++) p.px(x, hut + 1, WOOD[0]);
    icicles(p, g, cx - 22, cx + 22, hut + 2, 866, 4);
    // Wimpel
    p.line(cx, -1 + 1, cx, 5, WOOD[4]);
  }, { ax: 21, box: [-16, -6, 16, 1], light: { dx: 0, dy: -52, radius: 70, color: [255, 150, 70], intensity: 0.7 } });
}

// ------------------------------------------------------------ Fellzelt
function tent() {
  const W = 38, H = 30;
  return mk(W, H, (p, g) => {
    snowPatch(p, 19, H - 2, 17, 2, 871);
    drawTent(p, g, { W, H, pal: HIDE, band: NBLUE, ragged: false, seed: 23 });
    const cx = 19;
    // Schnee auf der linken Dachfläche und am First
    for (let y = 4; y < H - 4; y++) {
      const t = (y - 4) / (H - 8);
      const xl = Math.round(cx - t * (cx - 3));
      for (let x = xl; x < cx; x++) {
        const d = x - xl;
        if (hash2(x, y, 872) < 0.8 - t * 0.6 && d > 0 && d < 6 - t * 4) p.px(x, y, d < 2 ? SNOW[6] : SNOW[5]);
      }
    }
    for (let y = 4; y < 11; y++) { p.px(cx, y, SNOW[6]); if (hash2(y, 2, 873) < 0.6) p.px(cx + 1, y, SNOW[4]); }
    // Gekreuzte Zeltstangen über dem First
    p.line(cx - 3, 0, cx + 2, 5, WOOD[3]); p.line(cx + 3, 0, cx - 2, 5, WOOD[2]);
    // Fellbündel und Axt im Hackklotz
    p.rect(cx + 11, H - 6, 5, 4, WOOD[2]); p.ellipse(cx + 13.5, H - 6, 2.5, 1, '#a88452');
    p.line(cx + 13, H - 7, cx + 15, H - 12, WOOD[3]); p.rect(cx + 14, H - 13, 3, 2, IRON[3]); p.px(cx + 16, H - 13, IRON[5]);
    p.ellipse(cx - 13, H - 4, 3, 2, '#6a5a48'); p.px(cx - 14, H - 5, '#8a7a64'); p.px(cx - 12, H - 5, SNOW[6]);
  }, { ax: 19, box: [-14, -7, 14, 1] });
}

// ------------------------------------------------------------ Bannerstange (Nordmänner)
function bannerPole() {
  const W = 20, H = 44;
  return mk(W, H, (p) => {
    const bottom = H - 1, px0 = 3;
    snowPatch(p, px0 + 1, bottom - 1, 4, 1, 881);
    for (const [x, y] of [[px0 - 2, bottom - 1], [px0 + 3, bottom - 1], [px0, bottom]]) { p.ellipse(x, y, 1.6, 1.1, ROCK[3]); p.px(x - 1, y - 1, SNOW[6]); }
    p.rect(px0, 3, 2, bottom - 4, WOOD[3]); p.rect(px0, 3, 1, bottom - 4, WOOD[4]);
    // Spitze: Rabe (geschmiedet)
    p.rect(px0 - 1, 0, 4, 2, IRON[2]); p.px(px0 + 3, 1, IRON[3]); p.px(px0 - 2, 0, IRON[1]); p.px(px0 + 1, 0, IRON[4]);
    p.rect(px0, 2, 2, 1, IRON[1]);
    // Querholz mit Schnee
    p.rect(px0, 5, 14, 2, WOOD[3]); p.rect(px0, 5, 14, 1, WOOD[4]); p.rect(px0, 4, 14, 1, SNOW[6]);
    // Banner: blau, weißer Saum, Schwalbenschwanz
    const bx0 = px0 + 2, bx1 = px0 + 13, by0 = 7, by1 = 32;
    for (let x = bx0; x <= bx1; x++) {
      const fold = Math.sin((x - bx0) * 0.8);
      const notch = Math.abs(x - (bx0 + bx1) / 2) < 2.2 ? 4 : 0;
      const low = by1 + Math.round(fold) - notch;
      for (let y = by0; y <= low; y++) {
        let i = fold > 0.4 ? 4 : fold < -0.4 ? 2 : 3;
        if (x === bx0) i = 4;
        if (y === by0) i = 1;
        p.px(x, y, NBLUE[i]);
      }
      p.px(x, low, BONE[x % 2 ? 3 : 4]);
      p.px(x, low - 1, BONE[2]);
    }
    for (let y = by0 + 1; y < by1 - 2; y++) { p.px(bx0, y, BONE[4]); }
    // Emblem: weißer Wolfskopf
    const ex = Math.round((bx0 + bx1) / 2), ey = 16;
    const wolf = ['..X...X..', '..XX.XX..', '.XXXXXXX.', '.XOXXXOX.', '..XXXXX..', '...XXX...', '...X.X...', '....X....'];
    wolf.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === 'X') p.px(ex - 4 + i, ey + j, i < 4 ? BONE[5] : BONE[4]); else if (ch === 'O') p.px(ex - 4 + i, ey + j, NBLUE[0]); }));
    // Schnee auf den Falten
    p.px(bx0 + 1, by0 + 1, SNOW[6]); p.px(bx0 + 5, by0 + 1, SNOW[5]); p.px(bx0 + 9, by0 + 1, SNOW[5]);
  }, { ax: 4, box: [-2, -2, 2, 1] });
}

// ------------------------------------------------------------ Großes Lagerfeuer
function campfireBig() {
  const W = 36, H = 30;
  return mk(W, H, (p, g) => {
    const cx = 18, cy = H - 6;
    // Geschmolzener Ring (nasser, dunkler Boden) im Schnee
    snowPatch(p, cx, cy + 1, 17, 4, 891);
    p.ellipse(cx, cy + 1, 13, 3.6, '#1c1a20'); p.ellipse(cx, cy, 11, 3, '#241e20');
    // Glutbett
    p.ellipse(cx, cy, 8, 2.6, '#1a0806');
    for (let i = 0; i < 26; i++) {
      const x = cx + Math.round(Math.cos(i * 2.4) * (i % 7)), y = cy + Math.round(Math.sin(i * 2.4) * (i % 7) * 0.35);
      const c = i % 3 === 0 ? EMB[3] : i % 3 === 1 ? EMB[2] : EMB[1];
      p.px(x, y, c); g.px(x, y, i % 3 === 0 ? EMB[4] : EMB[2]);
    }
    // Trockengestell mit Fischen und Fell (hinten)
    p.line(3, cy - 16, 4, cy + 1, WOOD[3]); p.line(32, cy - 16, 31, cy + 1, WOOD[2]);
    p.line(2, cy - 16, 33, cy - 16, WOOD[3]); p.line(2, cy - 15, 33, cy - 15, WOOD[1]);
    for (const [fx, c] of [[7, '#6a7a88'], [10, '#7a8a98'], [26, '#6a7a88'], [29, '#8a98a4']]) {
      p.line(fx, cy - 15, fx, cy - 13, LEA[2]);
      p.rect(fx - 1, cy - 13, 2, 5, c); p.px(fx - 1, cy - 13, '#aab8c4'); p.px(fx, cy - 8, '#4a5864'); p.px(fx - 1, cy - 7, '#4a5864'); p.px(fx + 1, cy - 7, '#4a5864');
    }
    for (let x = 2; x < 34; x++) if (hash2(x, 0, 892) < 0.6) p.px(x, cy - 17, SNOW[6]);
    // Scheite
    p.line(cx - 8, cy + 2, cx + 5, cy - 3, WOOD[2]); p.line(cx - 8, cy + 1, cx + 5, cy - 4, WOOD[4]);
    p.line(cx + 8, cy + 2, cx - 4, cy - 3, WOOD[1]); p.line(cx + 8, cy + 1, cx - 4, cy - 4, WOOD[3]);
    // Flammen
    flame(p, g, cx - 2, cy - 2, 6, 1);
    flame(p, g, cx + 1, cy - 3, 9, 2);
    flame(p, g, cx + 4, cy - 2, 5, 1);
    // Steinring vorn
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x = cx + Math.cos(a) * 10, y = cy + Math.sin(a) * 3.8;
      if (Math.sin(a) < -0.2) continue;
      p.ellipse(x, y, 2, 1.4, ROCK[3]); p.px(x - 1, y - 1, ROCK[5]); p.px(x, y - 1, SNOW[5]);
    }
    // Sitzstämme mit Schnee
    p.rect(1, cy + 1, 7, 3, WOOD[2]); p.rect(1, cy + 1, 7, 1, SNOW[6]); p.ellipse(1, cy + 2, 1, 1.4, '#a88452');
    p.rect(28, cy + 2, 7, 3, WOOD[1]); p.rect(28, cy + 2, 7, 1, SNOW[5]); p.ellipse(35, cy + 3, 1, 1.4, '#8a6a44');
  }, { ax: 18, ay: H - 3, box: [-9, -4, 9, 2], light: { dx: 0, dy: -8, radius: 120, color: [255, 150, 70], intensity: 1 }, extra: { embers: { dx: 0, dy: -12, rate: 5 } } });
}

// ------------------------------------------------------------ Frostfeuer (Schrein)
function frostBeacon(on) {
  const W = 26, H = 50;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 13;
    snowPatch(p, cx, bottom - 1, 11, 2, 901);
    // Sockelstufe
    p.rect(3, bottom - 5, 20, 5, ROCK[3]); p.rect(3, bottom - 5, 20, 1, ROCK[5]); p.rect(3, bottom - 5, 2, 5, ROCK[4]); p.rect(21, bottom - 4, 2, 4, ROCK[1]);
    p.rect(3, bottom - 6, 20, 1, SNOW[6]); p.px(5, bottom - 5, SNOW[5]);
    // Säule (behauen, Runenband)
    for (let y = 19; y < bottom - 5; y++) for (let x = 7; x <= 18; x++) {
      const rel = (x - 7) / 11;
      let k = rel < 0.15 ? 5 : rel < 0.45 ? 4 : rel < 0.8 ? 3 : 2;
      if ((y - 19) % 8 === 0) k = 1;
      if (hash2(x, y, 902) < 0.06) k -= 1;
      p.px(x, y, ROCK[clampI(k, 7)]);
    }
    // Knotenrunen
    const RUNE = on ? '#ffd08a' : ROCK[1];
    const glyphs = [[[10, 23], [11, 24], [12, 25], [13, 24], [14, 23], [12, 26], [12, 27]], [[10, 31], [10, 32], [10, 33], [11, 32], [12, 31], [13, 32], [14, 33], [14, 32], [14, 31]], [[11, 39], [12, 38], [13, 39], [12, 40], [11, 41], [13, 41]]];
    for (const gl of glyphs) for (const [x, y] of gl) { p.px(x, y, RUNE); if (on) g.px(x, y, (x + y) % 2 ? EMB[4] : EMB[3]); }
    if (!on) for (const gl of glyphs) { const [x, y] = gl[0]; p.px(x - 1, y - 1, ROCK[5]); }
    // Kapitell
    p.rect(5, 16, 16, 3, ROCK[4]); p.rect(5, 16, 16, 1, ROCK[6]); p.rect(19, 17, 2, 2, ROCK[2]);
    // Feuerschale aus Eisen
    p.ellipse(cx, 13, 9, 3, IRON[1]);
    p.rect(5, 11, 17, 4, IRON[2]); p.rect(5, 11, 17, 1, IRON[4]); p.rect(5, 11, 3, 4, IRON[3]); p.rect(19, 12, 3, 3, IRON[1]);
    for (let x = 6; x < 21; x += 4) p.px(x, 13, IRON[5]);
    p.rect(8, 15, 11, 1, IRON[1]);
    if (on) {
      // Glutbett und Flammen
      p.ellipse(cx, 11, 7, 1.5, EMB[2]); g.ellipse(cx, 11, 7, 1.5, EMB[4]);
      flame(p, g, cx - 3, 10, 6, 1);
      flame(p, g, cx, 10, 10, 2);
      flame(p, g, cx + 3, 10, 7, 1);
      // Schmelzwasser tropft, Eiszapfen weg
      p.px(6, 16, ICE[3]); p.px(19, 16, ICE[3]);
      g.ctx.fillStyle = 'rgba(255,150,60,0.28)'; g.ctx.fillRect(4, 16, 18, 3);
    } else {
      // Schale voller Schnee, Eiszapfen am Rand
      p.ellipse(cx, 10, 7, 2, SNOW[5]); p.ellipse(cx - 1, 9, 5, 1.4, SNOW[6]); p.px(cx + 4, 11, SNOW[3]);
      p.px(cx - 2, 10, '#1a1210'); p.px(cx + 1, 11, '#1a1210');
      icicles(p, null, 6, 20, 15, 903, 4);
      for (let x = 5; x < 21; x++) if (hash2(x, 4, 904) < 0.5) p.px(x, 16, SNOW[6]);
    }
    // Schneekappe auf dem Sockel
    p.px(7, 18, SNOW[5]); p.px(8, 18, SNOW[6]);
  }, {
    ax: 13, box: [-9, -4, 9, 1],
    light: on ? { dx: 0, dy: -40, radius: 100, color: [255, 150, 60], intensity: 1 } : undefined,
    extra: on ? { embers: { dx: 0, dy: -44, rate: 5 } } : undefined,
  });
}

// ------------------------------------------------------------ Reifhöhlen-Eingang
function rimeGate() {
  const W = 88, H = 70;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 44;
    const rng = createRng(911);
    // Felswand mit unregelmäßiger Oberkante
    const topAt = (x) => Math.round(4 + Math.abs(Math.sin(x * 0.09)) * 6 + Math.abs(x - cx) * 0.1 + hash2(x >> 2, 0, 912) * 3);
    const mask = new Uint8Array(W * H);
    for (let x = 0; x < W; x++) for (let y = topAt(x); y <= bottom; y++) {
      const facet = Math.floor((x + y * 0.6) / 8);
      let k = hash2(facet, Math.floor(y / 10), 913) < 0.5 ? 3 : 2;
      const lx = (x + y * 0.6) % 8;
      if (lx < 1.2) k = 5; else if (lx > 6.5) k = 1;
      if (hash2(x, y, 914) < 0.05) k -= 1;
      p.px(x, y, ROCK[clampI(k, 7)]);
      mask[y * W + x] = 1;
    }
    // Schnee auf Kanten und Simsen
    snowOnMask(p, mask, W, H, { depth: 3, seed: 915, left: 0.5, chance: 0.98 });
    for (let i = 0; i < 7; i++) { const x = rng.int(2, W - 12), y = rng.int(18, bottom - 14); if (Math.abs(x - cx) < 24) continue; p.rect(x, y, rng.int(4, 8), 1, SNOW[5]); p.px(x, y - 1, SNOW[6]); }
    // Eisbogen: Öffnung mit Eisrahmen
    const ox = 18, otop = 22, obot = bottom;
    const inside = (x, y) => { const dy = y - (otop + ox * 0.6); if (y < otop) return false; if (dy < 0) { const t = (x - cx) / ox; return (otop + ox * 0.6 - y) <= Math.sqrt(Math.max(0, 1 - t * t)) * ox * 0.6 && Math.abs(x - cx) <= ox; } return Math.abs(x - cx) <= ox - (y > obot - 3 ? 0 : 0); };
    // Rahmen (Eis, 4 px)
    for (let y = otop - 5; y <= bottom; y++) for (let x = cx - ox - 5; x <= cx + ox + 5; x++) {
      if (inside(x, y)) continue;
      let near = false;
      for (let r = 1; r <= 4 && !near; r++) if (inside(x + r, y) || inside(x - r, y) || inside(x, y + r) || inside(x + r, y + r) || inside(x - r, y + r)) near = true;
      if (!near) continue;
      const k = x < cx ? (hash2(x, y, 916) < 0.2 ? 6 : 5) : (hash2(x, y, 916) < 0.2 ? 4 : 3);
      p.px(x, y, ICE[k]);
      if (hash2(x, y, 917) < 0.25) g.px(x, y, ICE[3]);
    }
    // Innen: tiefes Blau, nach hinten dunkler, Eiskristalle im Dunkel
    for (let y = otop; y <= bottom; y++) for (let x = cx - ox; x <= cx + ox; x++) {
      if (!inside(x, y)) continue;
      const d = (y - otop) / (bottom - otop);
      let c = d < 0.25 ? '#0b1a2a' : d < 0.6 ? '#07111e' : '#050b14';
      if (Math.abs(x - cx) < 6 && d > 0.3 && (x + y) % 2 === 0) c = '#0e2438';
      p.px(x, y, c);
    }
    // Kalter Schein aus der Tiefe
    for (let y = bottom - 16; y <= bottom; y++) for (let x = cx - 10; x <= cx + 10; x++) if ((x + y) % 2 === 0 && inside(x, y)) { const k = 1 - Math.abs(x - cx) / 11; if (hash2(x, y, 918) < k) { p.px(x, y, ICE[1]); g.px(x, y, ICE[2]); } }
    // Eiszapfen als Zähne am Bogen
    for (let x = cx - ox + 2; x <= cx + ox - 2; x += 2) {
      let y = otop; while (y < bottom && !inside(x, y)) y++;
      const len = 3 + Math.floor(hash2(x, 0, 919) * (Math.abs(x - cx) < 10 ? 7 : 4));
      for (let k = 0; k < len; k++) { p.px(x, y + k, k < len - 2 ? ICE[5] : ICE[4]); if (k === len - 1) g.px(x, y + k, ICE[4]); }
      p.px(x + 1, y, ICE[3]);
    }
    // Große Eiskristalle seitlich des Eingangs
    const spike = (x, tipY, hw, lean) => {
      const base = bottom - 1, tx = x + lean;
      poly(p, [[tx + 0.5, tipY], [x - hw, base + 1], [x + 0.5, base + 1]], (xx, yy) => ((yy - tipY) < 4 ? ICE[6] : ICE[5]));
      poly(p, [[tx + 0.5, tipY], [x + 0.5, base + 1], [x + hw + 1, base + 1]], ICE[3]);
      p.line(tx, tipY + 1, x, base, ICE[6]);
      g.px(tx, tipY, ICE[6]); g.line(tx, tipY + 2, x, base - 2, ICE[3]);
    };
    spike(14, 34, 4, -3); spike(8, 46, 3, -2); spike(21, 48, 2, 0);
    spike(74, 32, 4, 3); spike(81, 46, 3, 2); spike(67, 50, 2, 1);
    // Runenstein über dem Bogen (Troll-Warnzeichen)
    p.rect(cx - 5, otop - 13, 11, 7, ROCK[4]); p.rect(cx - 5, otop - 13, 11, 1, SNOW[6]); p.rect(cx + 5, otop - 12, 1, 6, ROCK[2]);
    for (const [x, y] of [[cx - 3, otop - 11], [cx - 2, otop - 10], [cx - 1, otop - 9], [cx, otop - 10], [cx + 1, otop - 11], [cx + 2, otop - 10], [cx + 3, otop - 9]]) { p.px(x, y, ICE[4]); g.px(x, y, ICE[5]); }
    // Schnee vor dem Eingang, Fußspuren
    for (let x = cx - ox - 6; x <= cx + ox + 6; x++) p.px(x, bottom, SNOW[4]);
    for (let i = 0; i < 4; i++) { p.px(cx - 4 + i * 3, bottom - 1 - (i % 2), '#1a2230'); }
  }, {
    ax: 44, light: { dx: 0, dy: -14, radius: 96, color: [110, 190, 255], intensity: 0.8 },
    extra: { boxes: [[-44, -8, -20, 1], [20, -8, 44, 1]], door: { dx: 0, dy: -3 } },
  });
}

// ------------------------------------------------------------ Trollknochen
function trollBones(v) {
  const rng = createRng(930 + v);
  const W = v ? 50 : 40, H = v ? 34 : 30;
  return mk(W, H, (p, g) => {
    const bottom = H - 1;
    snowPatch(p, Math.floor(W / 2), bottom - 2, Math.floor(W / 2) - 2, 3, 931 + v);
    if (v === 0) {
      // Riesenschädel mit Hauern, halb im Schnee
      const cx = 20, cy = 15;
      p.ellipse(cx, cy, 13, 10, BONE[2]);
      p.ellipse(cx - 2, cy - 2, 11, 8, BONE[3]);
      p.ellipse(cx - 5, cy - 5, 5, 3, BONE[4]);
      p.px(cx - 7, cy - 7, BONE[5]); p.px(cx - 6, cy - 7, BONE[5]);
      // Stirnwulst
      p.rect(cx - 10, cy - 1, 20, 2, BONE[4]); p.rect(cx - 10, cy + 1, 20, 1, BONE[1]);
      // Augenhöhlen
      p.ellipse(cx - 5, cy + 3, 3, 2.4, '#0c0a0e'); p.ellipse(cx + 5, cy + 3, 3, 2.4, '#0c0a0e');
      p.px(cx - 6, cy + 2, '#1a2638'); p.px(cx + 4, cy + 2, '#1a2638');
      // Nasenloch und Kiefer
      p.rect(cx - 1, cy + 6, 3, 2, '#0c0a0e');
      p.rect(cx - 8, cy + 9, 17, 3, BONE[2]); for (let x = cx - 7; x < cx + 9; x += 2) p.px(x, cy + 9, BONE[4]);
      // Hauer
      for (const s of [-1, 1]) {
        const bx = cx + s * 7, by = cy + 9;
        p.line(bx, by, bx + s * 2, by - 7, BONE[4]); p.line(bx + s, by, bx + s * 3, by - 6, BONE[2]); p.px(bx + s * 2, by - 8, BONE[5]);
      }
      // Hörner: dick, nach außen geschwungen (rechts abgebrochen)
      for (const s of [-1, 1]) {
        const len = s < 0 ? 12 : 7;
        for (let i = 0; i <= len; i++) {
          const t = i / 12, th = Math.max(1, Math.round(3 - t * 2.6));
          const hx = cx + s * (9 + Math.sin(t * 2.2) * 7), hy = cy - 5 - t * 12 + t * t * 4;
          for (let k = 0; k < th; k++) p.px(Math.round(hx) + k * s * -1 + (s > 0 ? 0 : 0), Math.round(hy) + k, k === 0 ? (s < 0 ? BONE[5] : BONE[3]) : BONE[s < 0 ? 3 : 1]);
        }
        if (s > 0) { const hx = Math.round(cx + 9 + Math.sin(7 / 12 * 2.2) * 7), hy = Math.round(cy - 5 - 7); p.px(hx, hy - 1, BONE[1]); p.px(hx + 1, hy, BONE[2]); }
      }
      // Risse
      p.line(cx + 2, cy - 7, cx + 4, cy - 2, BONE[1]); p.px(cx + 5, cy - 1, BONE[1]);
      // Schnee auf dem Schädel
      for (let x = cx - 11; x <= cx + 6; x++) { const y = Math.round(cy - 2 - 8 * Math.sqrt(Math.max(0, 1 - ((x - cx + 2) / 11) ** 2))); if (hash2(x, 0, 932) < 0.85) { p.px(x, y, SNOW[6]); p.px(x, y + 1, SNOW[5]); } }
      // Verweht unten
      for (let x = 4; x < 36; x++) { const hh = 2 + Math.round(hash2(x, 1, 933) * 2 + Math.sin(x * 0.3)); for (let y = bottom - hh; y <= bottom - 1; y++) p.px(x, y, y === bottom - hh ? SNOW[6] : SNOW[4]); }
      // Frostschimmer in den Augen
      g.px(cx - 6, cy + 3, '#2a5a88'); g.px(cx + 4, cy + 3, '#2a5a88');
    } else {
      // Rippenbögen und Wirbelsäule, Keule
      const spineY = bottom - 5;
      for (let x = 4; x < 46; x += 3) { p.ellipse(x, spineY - Math.round(Math.sin(x * 0.12) * 2), 1.6, 1.4, BONE[3]); p.px(x - 1, spineY - 1 - Math.round(Math.sin(x * 0.12) * 2), BONE[5]); }
      const ribs = [11, 18, 25, 32];
      // Rippenbögen ragen als Bögen aus dem Schnee (hinterer Schenkel dunkel, vorderer hell)
      for (const [i, rx] of [...ribs.entries()].reverse()) {
        const hgt = 22 - Math.abs(i - 1) * 3, hw = 6 - (i === 3 ? 1 : 0);
        const sy = spineY + 1;
        for (let t = 0; t <= Math.PI; t += 0.03) {
          const x = rx - Math.cos(t) * hw + Math.sin(t * 2) * 1.2;
          const y = sy - Math.sin(t) ** 0.8 * hgt;
          const xx = Math.round(x), yy = Math.round(y);
          if (t < Math.PI / 2) { p.px(xx, yy, BONE[4]); p.px(xx + 1, yy, BONE[3]); p.px(xx - 1, yy, BONE[5]); }
          else { p.px(xx, yy, BONE[2]); p.px(xx + 1, yy, BONE[1]); }
        }
        // Scheitel mit Schneehaube, Bruchstelle am hinteren Rippenpaar
        const ty = Math.round(sy - hgt);
        p.px(rx - 1, ty - 1, SNOW[6]); p.px(rx, ty - 1, SNOW[6]); p.px(rx + 1, ty - 1, SNOW[5]); p.px(rx - 2, ty, SNOW[5]);
      }
      // Beckenknochen hinten
      p.ellipse(40, spineY - 3, 4, 3, BONE[2]); p.ellipse(39, spineY - 4, 2.5, 2, BONE[4]); p.px(40, spineY - 3, '#0c0a0e');
      // Knochenkeule im Schnee
      p.line(38, bottom - 3, 46, bottom - 14, WOOD[2]); p.line(39, bottom - 3, 47, bottom - 14, WOOD[1]);
      p.ellipse(46, bottom - 16, 3, 3.5, BONE[3]); p.px(45, bottom - 18, BONE[5]); p.px(48, bottom - 15, BONE[1]);
      p.px(44, bottom - 19, SNOW[6]); p.px(45, bottom - 19, SNOW[6]);
      // Schneeverwehung über der Wirbelsäule
      for (let x = 2; x < 48; x++) { const hh = 2 + Math.round(hash2(x, 1, 934) * 2); for (let y = bottom - hh; y <= bottom - 1; y++) p.px(x, y, y === bottom - hh ? SNOW[6] : SNOW[4]); }
      // Blutige Reste? nein – nur Frost
      for (let i = 0; i < 4; i++) { const x = rng.int(8, 36), y = rng.int(bottom - 16, bottom - 6); p.px(x, y, ICE[4]); }
    }
  }, { ax: v ? 25 : 20, ay: H - 2, box: v ? [-18, -5, 18, 1] : [-12, -6, 12, 1] });
}

// ============================================================ Runde 5: neue Frostzinnen
// Flache Teile (Eisrisse, Spalten, Brücken, Eiszapfen) ohne Umriss; aufrechte
// Objekte mit mk(). Begehbare Bodendecals ('iceCracks', 'snowBridge') liegen
// unter dem Anker (ay = 0) bzw. sind in der Mitte durchsichtig, damit sie den
// Helden nie überdecken.
function flat(W, H, ax, ay, draw, extra = null) {
  const p = new PixelCanvas(W, H), gl = new PixelCanvas(W, H);
  let used = false;
  const g = { px: (x, y, c) => { used = true; gl.px(x, y, c); }, rect: (x, y, w, h, c) => { used = true; gl.rect(x, y, w, h, c); }, ctx: gl.ctx };
  draw(p, g);
  const e = { sprite: new SpriteFrame(p.canvas, ax, ay) };
  if (used) e.glow = gl.canvas;
  if (extra) Object.assign(e, extra);
  return e;
}
const rgba = (r, g, b, a) => `rgba(${r},${g},${b},${a})`;
const DEEP = ['#03070d', '#060e18', '#0a1724', '#0f2234'];

// ------------------------------------------------------------ Eisrisse auf dem See
function iceCracks(v) {
  const rng = createRng(1500 + v * 17);
  return flat(18, 16, 9, 0, (p, g) => {
    // Glanzstreifen (Mondlicht auf blankem Eis)
    if (v !== 2) for (let i = 0; i < 7; i++) { const x = 3 + i + v * 2, y = 2 + i; if (x < 18 && y < 16) p.ctx.fillStyle = rgba(200, 236, 255, 0.10), p.ctx.fillRect(x, y, 3, 1); }
    // Risse: Hauptlinie mit Verästelungen, dunkler Kern und heller Rand
    const branches = [[rng.range(1, 4), rng.range(2, 13), rng.range(-0.5, 0.5), 14]];
    const pts = [];
    while (branches.length) {
      let [x, y, a, n] = branches.pop();
      for (let i = 0; i < n; i++) {
        const xi = Math.round(x), yi = Math.round(y);
        if (xi < 0 || yi < 0 || xi >= 18 || yi >= 16) break;
        pts.push([xi, yi]);
        if (rng.chance(0.12) && n > 4) branches.push([x, y, a + rng.range(-1.4, 1.4), Math.floor(n * 0.45)]);
        a += rng.range(-0.45, 0.45); x += Math.cos(a); y += Math.sin(a) * 0.8;
      }
    }
    for (const [x, y] of pts) { p.px(x, y - 1, rgba(220, 245, 255, 0.55)); }
    for (const [x, y] of pts) { p.px(x, y, '#1a3e58'); }
    for (const [x, y] of pts) if (hash2(x, y, 1501 + v) < 0.3) g.px(x, y, '#2a6a90');
    // Eingeschlossene Luftblasen
    for (let i = 0; i < 3 + v; i++) { const x = rng.int(1, 16), y = rng.int(1, 14); p.px(x, y, rgba(230, 248, 255, 0.7)); if (rng.chance(0.4)) p.px(x + 1, y, rgba(200, 236, 255, 0.4)); }
  });
}

// ------------------------------------------------------------ Eisloch mit Angelstock
function iceHole(v) {
  const W = 28, H = 20;
  return flat(W, H, 14, 14, (p, g) => {
    const cx = 14, cy = 10, rx = 7.5 + v, ry = 4.2;
    // aufgeworfener Eisrand (dicke Schollen)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = ((x - cx) / (rx + 3.2)) ** 2 + ((y - cy) / (ry + 2.4)) ** 2;
      if (d > 1 || hash2(x, y, 1510 + v) < (d > 0.8 ? 0.5 : 0)) continue;
      const lit = (x - cx) + (y - cy) * 1.4 < 0;
      p.px(x, y, lit ? ICE[5] : ICE[4]);
    }
    // Schnee auf dem Rand
    for (let x = 2; x < W - 2; x++) if (hash2(x, 0, 1511 + v) < 0.55) { const y = Math.round(cy - ry - 1.4 - hash2(x, 1, 1512) * 1.4); p.px(x, y, SNOW[6]); }
    // offenes Wasser
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d > 1) continue;
      const k = y < cy - ry * 0.4 ? 0 : d > 0.6 ? 2 : 1;
      p.px(x, y, DEEP[k + 1]);
    }
    // Kante der Eisdecke (innen, Wasser spiegelt den Rand)
    for (let x = Math.ceil(cx - rx + 1); x <= cx + rx - 1; x++) p.px(x, Math.round(cy - ry * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2))) + 1, ICE[2]);
    // Schwimmende Splitter und Lichtglanz
    p.px(cx - 2, cy + 1, ICE[5]); p.px(cx - 1, cy + 1, ICE[4]); p.px(cx + 3, cy - 1, ICE[4]);
    g.px(cx + 1, cy + 2, '#1a4a6a'); g.px(cx - 3, cy, '#123850');
    // Angelstock aus Holz mit Schnur (nur Variante 0)
    if (v === 0) {
      p.line(W - 5, H - 3, W - 9, 2, WOOD[3]); p.line(W - 4, H - 3, W - 8, 2, WOOD[1]);
      p.line(W - 9, 2, cx + 2, cy, '#8a96a4');
      p.px(W - 5, H - 2, SNOW[6]); p.px(W - 4, H - 2, SNOW[5]);
    } else {
      // abgelegter Fisch
      p.rect(3, H - 4, 5, 2, '#6a7a88'); p.px(3, H - 4, '#aab8c4'); p.px(8, H - 4, '#4a5864'); p.px(8, H - 3, '#4a5864');
    }
  });
}

// ------------------------------------------------------------ Eisfischerhütte auf Kufen
function fishHut() {
  const W = 34, H = 38;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, x0 = 6, x1 = 27, wallTop = 14, wallBot = bottom - 5;
    snowPatch(p, 17, bottom - 1, 15, 2, 1520);
    // Kufen
    p.rect(x0 - 2, bottom - 3, x1 - x0 + 5, 2, WOOD[1]); p.rect(x0 - 2, bottom - 3, x1 - x0 + 5, 1, WOOD[3]);
    p.px(x0 - 3, bottom - 4, WOOD[3]); p.px(x1 + 3, bottom - 4, WOOD[2]);
    // Bretterwand
    for (let y = wallTop; y <= wallBot; y++) for (let x = x0; x <= x1; x++) {
      const lx = (x - x0) % 4;
      let k = lx === 0 ? 1 : lx === 1 ? 4 : 3;
      if (hash2(x, y >> 1, 1521) < 0.1) k -= 1;
      if (x > x1 - 5) k -= 1;
      p.px(x, y, WOOD[clampI(k, 5)]);
    }
    // Tür, Fenster mit warmem Licht
    p.rect(9, wallTop + 6, 6, wallBot - wallTop - 5, WOOD[0]); p.rect(10, wallTop + 7, 4, wallBot - wallTop - 7, WOOD[2]); p.px(13, wallTop + 13, IRON[4]);
    p.rect(19, wallTop + 6, 5, 4, '#1a0e0a'); p.rect(20, wallTop + 7, 3, 2, EMB[4]); g.rect(20, wallTop + 7, 3, 2, EMB[4]);
    p.rect(19, wallTop + 10, 5, 1, SNOW[5]);
    // Pultdach mit dicker Schneedecke und Eiszapfen
    for (let x = x0 - 2; x <= x1 + 2; x++) {
      const top = Math.round(wallTop - 6 + (x - x0) * 0.18);
      for (let y = top; y < wallTop; y++) p.px(x, y, y < top + 3 ? (y === top ? SNOW[6] : SNOW[5]) : y === wallTop - 1 ? WOOD[0] : SNOW[3]);
    }
    icicles(p, g, x0 - 1, x1 + 1, wallTop, 1522, 4);
    // Ofenrohr
    p.rect(23, 1, 3, 10, IRON[2]); p.rect(23, 1, 1, 10, IRON[4]); p.rect(22, 0, 5, 2, IRON[1]);
    // Schnee an der Wand, Werkzeug
    for (let x = x0; x <= x1; x++) if (hash2(x, 2, 1523) < 0.6) p.px(x, wallBot, SNOW[5]);
    p.line(29, bottom - 4, 31, wallTop + 2, WOOD[3]); p.rect(30, wallTop, 3, 2, IRON[3]);
  }, { ax: 17, ay: H - 2, box: [-11, -6, 11, 1], light: { dx: 4, dy: -16, radius: 46, color: [255, 170, 90], intensity: 0.6 }, extra: { smoke: { dx: 7, dy: -36, rate: 2 } } });
}

// ------------------------------------------------------------ Eingefrorenes Boot
function frozenBoat() {
  const W = 44, H = 24;
  return mk(W, H, (p, g) => {
    const bottom = H - 1;
    // Eisschollen um den Rumpf
    for (let x = 1; x < W - 1; x++) { const hh = 2 + Math.round(hash2(x, 0, 1530) * 2); for (let y = bottom - hh; y <= bottom - 1; y++) p.px(x, y, y === bottom - hh ? ICE[6] : ICE[4]); }
    // Rumpf schräg, Planken
    const rim = (x) => 9 + Math.round((x - 6) * 0.12 + Math.sin((x - 6) / 32 * Math.PI) * -3);
    for (let x = 6; x < 39; x++) {
      const top = rim(x), keel = bottom - 3 + Math.round(Math.abs(x - 22) * -0.05);
      for (let y = top; y < keel; y++) {
        const row = Math.floor((y - top) / 3);
        let k = row % 2 ? 2 : 3;
        if ((y - top) % 3 === 0) k = 1;
        if (x < 9 || x > 35) k -= 1;
        p.px(x, y, WOOD[clampI(k, 5)]);
      }
      p.px(x, top, WOOD[4]); p.px(x, top - 1, SNOW[hash2(x, 1, 1531) < 0.7 ? 6 : 5]);
    }
    // Bug hoch, Heck gebrochen
    p.line(38, rim(38), 41, 4, WOOD[3]); p.line(39, rim(38), 42, 4, WOOD[2]); p.px(41, 3, SNOW[6]);
    for (let y = 12; y < 18; y++) p.px(6 + (y % 2), y, '#0a0806');
    // Mast-Stumpf, Ruder im Eis
    p.rect(21, 1, 2, rim(21) - 1, WOOD[3]); p.px(21, 0, SNOW[6]); p.px(22, 0, SNOW[5]); p.line(23, 2, 25, 0, WOOD[2]);
    p.line(30, bottom - 2, 34, 6, WOOD[2]); p.rect(33, 4, 3, 4, WOOD[3]); p.px(33, 3, SNOW[6]);
    // Eiszapfen an der Bordwand
    icicles(p, g, 10, 34, rim(22) + 1, 1532, 3, 0.3);
  }, { ax: 22, ay: H - 2, box: [-15, -5, 15, 1] });
}

// ------------------------------------------------------------ Gletscherspalten
// Eine Zelle je Kartenspalte; l/r = Verlauf zum Nachbarn: 'S' gleiche Zeile,
// 'U' eine Zeile höher, 'D' tiefer, 'N' kein Nachbar (spitzes Ende). Die
// Mittellinie trifft die Zellkante links bei S = Zellmitte, U = Oberkante,
// D = Unterkante, so setzen Nachbarzellen nahtlos fort.
// Sprite 20 × 30: Kachel bei x 2..17, y 7..22; Anker = Kachel-Oberkante + 14.
const smooth = (t) => t * t * (3 - 2 * t);
function crevasseLR(l, r, v) {
  const W = 20, H = 30, oy = 7;
  const lvl = (s) => (s === 'U' ? 0 : s === 'D' ? 16 : 8);
  return flat(W, H, 10, oy + 14, (p, g) => {
    for (let x = 0; x < W; x++) {
      const t = Math.max(0, Math.min(1, (x - 2 + 0.5) / 16));
      const yc = oy + (t < 0.5 ? lvl(l) + (8 - lvl(l)) * smooth(t / 0.5) : 8 + (lvl(r) - 8) * smooth((t - 0.5) / 0.5));
      // Breite: Rauschen, an offenen Enden spitz
      let k = 1;
      if (l === 'N') k = Math.min(k, Math.max(0, (t - 0.12) / 0.45));
      if (r === 'N') k = Math.min(k, Math.max(0, (0.88 - t) / 0.45));
      if ((l === 'N' && x < 2) || (r === 'N' && x > W - 3)) continue;
      const n1 = hash2(x + v * 23, 0, 1540), n2 = hash2(x + v * 23, 1, 1541);
      const ht = (5 + n1 * 1.8) * k, hb = (3.4 + n2 * 1.6) * k;
      if (ht + hb < 1.2) continue;
      const y0 = Math.round(yc - ht), y1 = Math.round(yc + hb);
      for (let y = y0; y <= y1; y++) {
        const d = y - y0;
        let c = d === 0 ? ICE[5] : d === 1 ? ICE[4] : d === 2 ? ICE[3] : d === 3 && k > 0.6 ? ICE[1] : hash2(x, y, 1543 + v) < 0.07 ? DEEP[2] : DEEP[0];
        if (y === y1 && y1 - y0 > 2) c = DEEP[2];
        p.px(x, y, c);
      }
      // Schneelippen: oben hell (Mondlicht), unten Überhang mit Schatten
      p.px(x, y0 - 1, SNOW[6]); if (n1 < 0.45) p.px(x, y0 - 2, SNOW[5]);
      p.px(x, y1 + 1, SNOW[6]); if (n2 > 0.55) p.px(x, y1 + 2, SNOW[4]);
      if (k > 0.6 && hash2(x, 3, 1545 + v) < 0.25) { p.px(x, y0 + 2, ICE[4]); p.px(x, y0 + 3, ICE[3]); g.px(x, y0 + 3, '#1a5070'); }
      if (k > 0.8 && x % 4 === v % 4) g.px(x, Math.round(yc + 1), '#0e3048');
    }
  });
}

// Schneebrücke: begehbar, in der Mitte durchsichtig. 'L'/'R': auf dieser Seite
// läuft die Spalte unter den Brückenbogen (dunkle Kehle unter Schneelippe).
function snowBridge(side, v) {
  const W = 20, H = 30, oy = 7;
  return flat(W, H, 10, oy + 14, (p) => {
    if (side !== 'M') {
      for (let i = 0; i < 6; i++) {
        const x = side === 'L' ? i : W - 1 - i, k = 1 - i / 6;
        const ht = Math.round(5.6 * k), hb = Math.round(4 * k), yc = oy + 8;
        for (let y = yc - ht; y <= yc + hb; y++) p.px(x, y, y === yc - ht ? ICE[4] : DEEP[1]);
        p.px(x, yc - ht - 1, SNOW[6]); p.px(x, yc + hb + 1, SNOW[6]);
      }
      // Bogenschatten unter der Brücke
      const ax = side === 'L' ? 6 : W - 7;
      for (let y = oy + 5; y <= oy + 11; y++) p.px(ax + (side === 'L' ? Math.round(Math.abs(y - oy - 8) * 0.4) : -Math.round(Math.abs(y - oy - 8) * 0.4)), y, rgba(40, 80, 120, 0.45));
    }
    // Durchhang und Trittspuren
    for (let x = 0; x < W; x++) if (hash2(x, v, 1550) < 0.5) { p.px(x, oy + 3, rgba(40, 80, 120, 0.25)); p.px(x, oy + 13, rgba(40, 80, 120, 0.3)); }
    for (let y = oy + 1; y < oy + 16; y += 4) { const x = 9 + ((y >> 2) % 2) * 2; p.px(x, y, rgba(60, 80, 110, 0.35)); }
  });
}

// ------------------------------------------------------------ Eiszapfenvorhang an Höhlenwänden
function icicleCurtain(v) {
  const W = 20, H = 26;
  return flat(W, H, 10, 24, (p, g) => {
    // vereiste Wandfläche oberhalb der Zelle
    for (let x = 0; x < W; x++) {
      const t = 3 + Math.round(hash2(x, 0, 1560 + v) * 4);
      for (let y = t; y < 11; y++) p.px(x, y, (x + y) % 5 === 0 ? ICE[4] : y < t + 2 ? ICE[5] : ICE[3]);
    }
    // Zapfen
    for (let x = 0; x < W; x++) {
      const h = hash2(x, 1, 1561 + v);
      if (h > 0.62) continue;
      const len = 3 + Math.floor(hash2(x, 2, 1562 + v) * (v === 2 ? 14 : 10));
      for (let k = 0; k < len; k++) {
        const y = 11 + k;
        p.px(x, y, k === len - 1 ? ICE[6] : x % 2 ? ICE[3] : ICE[4]);
        if (k > len - 3) g.px(x, y, ICE[3]);
      }
    }
    // Frosthauch
    for (let i = 0; i < 4; i++) { const x = 2 + i * 5, y = 6 + (i % 2); g.px(x, y, '#2a6a90'); }
  });
}

// ------------------------------------------------------------ Eissäule
function icePillar(v) {
  const W = 18, H = 42;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 9;
    snowPatch(p, cx, bottom - 1, 7, 1, 1570 + v);
    for (let y = 0; y < bottom - 1; y++) {
      const w = 3.6 + Math.sin(y * 0.22 + v) * 0.8 + (y > bottom - 8 ? (y - bottom + 8) * 0.5 : 0) + (y < 6 ? (6 - y) * 0.4 : 0);
      for (let x = Math.round(cx - w); x <= Math.round(cx + w); x++) {
        const rel = (x - (cx - w)) / (2 * w);
        let c = rel < 0.2 ? ICE[6] : rel < 0.45 ? ICE[5] : rel < 0.75 ? ICE[4] : ICE[2];
        if (hash2(x, y >> 1, 1571 + v) < 0.06) c = ICE[1];
        p.px(x, y, c);
      }
      if (y % 3 === 0) g.px(cx - 1, y, ICE[4]);
    }
    // eingeschlossene Luftblasen / Knochen
    for (let i = 0; i < 5; i++) p.px(cx - 1 + (i % 3), 8 + i * 6, ICE[6]);
    if (v === 1) { p.line(cx - 2, 20, cx + 2, 24, BONE[3]); p.px(cx - 2, 19, BONE[4]); }
    // Fuß: Eisgeröll
    for (const dx of [-6, -4, 4, 6]) { p.px(cx + dx, bottom - 1, ICE[4]); p.px(cx + dx, bottom - 2, ICE[6]); }
  }, { ax: 9, ay: H - 2, box: [-4, -4, 4, 1], light: { dx: 0, dy: -18, radius: 50, color: [110, 190, 255], intensity: 0.5 } });
}

// ------------------------------------------------------------ Höhlenmünder (begehbare Bögen)
// Fels-/Eisbogen über einem Gang; Pfeiler stehen auf den Felszellen links
// und rechts, die Öffnung ist durchsichtig (nur ein Schatten unter dem Sturz).
function caveArch(troll) {
  const W = 72, H = 60;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 36, ow = 20, otop = 18;
    const mask = new Uint8Array(W * H);
    const openAt = (x, y) => { const t = (x - cx) / ow; if (Math.abs(t) > 1) return false; const arch = otop + (1 - Math.sqrt(1 - t * t)) * 14; return y >= arch; };
    for (let y = 2; y <= bottom; y++) for (let x = 0; x < W; x++) {
      const outer = Math.abs(x - cx) <= 33 - Math.max(0, (14 - y)) * 0.9 - hash2(x >> 1, y >> 2, 1580) * 2;
      if (!outer || openAt(x, y)) continue;
      const facet = Math.floor((x + y * 0.7) / 7);
      let k = hash2(facet, Math.floor(y / 9), 1581) < 0.5 ? 3 : 2;
      const lx = (x + y * 0.7) % 7;
      if (lx < 1.1) k = 5; else if (lx > 5.8) k = 1;
      if (x > cx + 10) k -= 1;
      p.px(x, y, ROCK[clampI(k, 7)]);
      mask[y * W + x] = 1;
    }
    snowOnMask(p, mask, W, H, { depth: 2, seed: 1582, left: 0.5, chance: 0.95 });
    // Schatten im Durchgang (halbdurchsichtig, Held bleibt sichtbar)
    for (let y = otop; y < otop + 22; y++) for (let x = cx - ow; x <= cx + ow; x++) {
      if (!openAt(x, y)) continue;
      const a = Math.max(0, 0.55 - (y - otop) * 0.028);
      p.px(x, y, rgba(4, 6, 12, a));
    }
    if (troll) {
      // Schädel und Hauer am Sturz, Knochen am Fuß
      for (const [sx, sy] of [[cx - 9, otop - 2], [cx, otop - 4], [cx + 9, otop - 2]]) {
        p.ellipse(sx, sy, 3, 2.6, BONE[4]); p.ellipse(sx - 1, sy - 1, 1.6, 1.2, BONE[5]); p.px(sx - 1, sy, '#0c0a0e'); p.px(sx + 1, sy, '#0c0a0e'); p.rect(sx - 1, sy + 2, 3, 1, BONE[2]);
      }
      for (const s of [-1, 1]) { const bx = cx + s * (ow + 2); p.line(bx, otop + 2, bx + s * 4, otop - 8, BONE[4]); p.line(bx + s, otop + 2, bx + s * 5, otop - 8, BONE[2]); p.px(bx + s * 5, otop - 9, BONE[5]); }
      for (const [bx, by] of [[cx - 26, bottom - 3], [cx + 24, bottom - 2], [cx - 18, bottom - 1]]) { p.line(bx, by, bx + 6, by - 2, BONE[4]); p.px(bx - 1, by, BONE[5]); p.px(bx + 7, by - 3, BONE[5]); }
      // Krallenspuren
      for (let i = 0; i < 3; i++) p.line(cx - 28 + i * 2, 28, cx - 25 + i * 2, 36, ROCK[0]);
      g.px(cx - 10, otop - 2, '#5a2a10'); g.px(cx + 8, otop - 2, '#5a2a10');
    } else {
      // Eisrahmen und Zapfen am Sturz, blaues Leuchten aus dem Gang
      for (let x = cx - ow; x <= cx + ow; x++) {
        const t = (x - cx) / ow; const y = Math.round(otop + (1 - Math.sqrt(Math.max(0, 1 - t * t))) * 14);
        p.px(x, y - 1, ICE[5]); p.px(x, y - 2, ICE[4]);
        if (hash2(x, 0, 1583) < 0.5) { const len = 2 + Math.floor(hash2(x, 1, 1584) * 6); for (let k = 0; k < len; k++) p.px(x, y + k, k === len - 1 ? ICE[6] : ICE[4]); g.px(x, y + len - 1, ICE[3]); }
      }
      for (let y = otop + 4; y < otop + 16; y++) for (let x = cx - 12; x <= cx + 12; x += 2) if (hash2(x, y, 1585) < 0.12) g.px(x, y, '#1a4a70');
    }
  }, { ax: 36, ay: H - 3, light: troll ? undefined : { dx: 0, dy: -24, radius: 64, color: [110, 190, 255], intensity: 0.55 }, extra: { occlude: [-34, -58, 34, 0] } });
}

// ------------------------------------------------------------ Höhlenfeuer der Trolle
function caveFire() {
  const W = 28, H = 24;
  return mk(W, H, (p, g) => {
    const cx = 14, cy = H - 6;
    p.ellipse(cx, cy + 1, 11, 3.4, '#15100e');
    for (let i = 0; i < 18; i++) { const x = cx + Math.round(Math.cos(i * 2.4) * (i % 6)), y = cy + Math.round(Math.sin(i * 2.4) * (i % 6) * 0.35); p.px(x, y, i % 3 ? EMB[2] : EMB[3]); g.px(x, y, EMB[3]); }
    // Knochenspieß mit Keule
    p.line(2, cy - 14, 4, cy + 2, BONE[3]); p.line(26, cy - 14, 24, cy + 2, BONE[2]); p.line(1, cy - 13, 27, cy - 13, WOOD[2]);
    p.ellipse(cx, cy - 13, 5, 2.4, '#6a3a24'); p.ellipse(cx - 1, cy - 14, 3, 1.2, '#8a5434');
    // Steine statt Ring: Schädel
    for (const [x, y] of [[cx - 9, cy + 1], [cx + 9, cy + 1], [cx - 5, cy + 3], [cx + 5, cy + 3]]) { p.ellipse(x, y, 2, 1.6, BONE[3]); p.px(x - 1, y - 1, BONE[5]); p.px(x, y, '#0c0a0e'); }
    flame(p, g, cx - 2, cy - 1, 6, 1); flame(p, g, cx + 1, cy - 2, 9, 2); flame(p, g, cx + 4, cy - 1, 5, 1);
  }, { ax: 14, ay: H - 3, box: [-7, -4, 7, 1], light: { dx: 0, dy: -8, radius: 96, color: [255, 140, 60], intensity: 0.95 }, extra: { embers: { dx: 0, dy: -10, rate: 4 } } });
}

// ------------------------------------------------------------ Sigruns Jagdhütte
function huntLodge() {
  const W = 84, H = 70;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 42, x0 = 10, x1 = 73, wallTop = 30, wallBot = bottom - 5;
    snowPatch(p, cx, bottom - 1, 40, 3, 1590);
    fieldstones(p, x0 - 1, wallBot, x1 - x0 + 3, 5, 1591);
    // Blockbohlen (liegende Stämme, runde Enden an den Ecken)
    for (let y = wallTop; y < wallBot; y++) {
      const row = Math.floor((y - wallTop) / 4), ly = (y - wallTop) % 4;
      for (let x = x0; x <= x1; x++) {
        let k = ly === 0 ? 4 : ly === 3 ? 1 : ly === 1 ? 3 : 2;
        if (hash2(x >> 2, row, 1592) < 0.15 && ly > 0) k -= 1;
        p.px(x, y, WOOD[clampI(k, 5)]);
      }
      if (ly === 1) for (const ex of [x0 - 2, x1 + 2]) { p.ellipse(ex, y + 0.5, 2.2, 1.8, '#8a6a44'); p.px(ex, y, '#5a4228'); }
    }
    // Tür mit Geweih darüber
    p.rect(cx - 6, wallTop + 8, 12, wallBot - wallTop - 8, WOOD[0]);
    p.rect(cx - 5, wallTop + 9, 10, wallBot - wallTop - 9, WOOD[2]);
    for (let y = wallTop + 9; y < wallBot; y += 3) p.rect(cx - 5, y, 10, 1, WOOD[1]);
    p.px(cx + 3, wallTop + 17, IRON[4]);
    for (const s of [-1, 1]) {
      p.line(cx, wallTop + 4, cx + s * 9, wallTop - 3, BONE[4]);
      for (const t of [3, 6, 8]) p.line(cx + s * t, wallTop + 4 - t * 0.8, cx + s * (t + 1), wallTop - 2 - t * 0.6, BONE[3]);
    }
    p.ellipse(cx, wallTop + 5, 2.4, 2, BONE[5]); p.px(cx - 1, wallTop + 5, '#0c0a0e'); p.px(cx + 1, wallTop + 5, '#0c0a0e');
    // Fenster mit warmem Licht
    for (const wx of [18, 58]) {
      p.rect(wx - 1, wallTop + 7, 10, 9, WOOD[0]); p.rect(wx, wallTop + 8, 8, 7, EMB[3]); p.rect(wx, wallTop + 8, 8, 2, EMB[4]);
      g.rect(wx, wallTop + 8, 8, 7, EMB[4]); p.rect(wx + 3, wallTop + 8, 1, 7, WOOD[1]); p.rect(wx, wallTop + 11, 8, 1, WOOD[1]);
      p.rect(wx - 2, wallTop + 16, 12, 1, SNOW[6]);
    }
    // Felle an der Wand
    for (const [fx, c] of [[30, HIDE[3]], [52, BONE[3]]]) { p.ellipse(fx, wallTop + 14, 4, 6, c); p.ellipse(fx - 1, wallTop + 12, 2, 2.5, c === HIDE[3] ? HIDE[4] : BONE[4]); p.px(fx, wallTop + 7, IRON[3]); }
    // Satteldach mit Schnee (Giebel vorn)
    for (let y = 4; y < wallTop; y++) {
      const half = (y - 4) * 1.32 + 6;
      for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
        if (x < x0 - 6 || x > x1 + 6) continue;
        const edge = Math.abs(x - cx) > half - 2;
        let c = (y - 4) < 4 ? SNOW[6] : edge ? SNOW[3] : (x < cx ? SNOW[5] : SNOW[4]);
        if (!edge && hash2(x, y, 1593) < 0.05) c = SNOW[3];
        p.px(x, y, c);
      }
    }
    for (let x = x0 - 6; x <= x1 + 6; x++) { p.px(x, wallTop, WOOD[0]); p.px(x, wallTop - 1, SNOW[3]); }
    icicles(p, g, x0 - 5, x1 + 5, wallTop + 1, 1594, 5, 0.35);
    // Steinkamin rechts
    fieldstones(p, 60, 0, 8, 14, 1595); p.rect(60, 0, 8, 1, SNOW[6]);
    // Geweihgiebelzier
    p.line(cx, 4, cx - 3, 0, WOOD[3]); p.line(cx, 4, cx + 3, 0, WOOD[3]);
  }, { ax: 42, ay: H - 2, box: [-34, -16, 34, 1], light: { dx: 0, dy: -20, radius: 86, color: [255, 170, 90], intensity: 0.75 }, extra: { smoke: { dx: 22, dy: -70, rate: 3 }, occlude: [-40, -70, 40, -16] } });
}

// ------------------------------------------------------------ Fellgestell, Holzstapel, Steinmann
function peltRack() {
  const W = 30, H = 30;
  return mk(W, H, (p) => {
    const bottom = H - 1;
    snowPatch(p, 15, bottom - 1, 13, 1, 1600);
    p.line(3, bottom - 1, 5, 3, WOOD[3]); p.line(26, bottom - 1, 24, 3, WOOD[2]);
    p.rect(2, 4, 26, 2, WOOD[3]); p.rect(2, 4, 26, 1, WOOD[4]); p.rect(2, 3, 26, 1, SNOW[6]);
    // gespannte Felle: Wolf (grau), Bär (braun)
    const hide = (x0, w, pal) => {
      for (let y = 7; y < 24; y++) {
        const half = w / 2 - Math.abs(Math.sin((y - 7) / 17 * Math.PI)) * -1.2 - (y > 20 ? (y - 20) : 0);
        for (let x = Math.round(x0 + w / 2 - half); x <= Math.round(x0 + w / 2 + half); x++) p.px(x, y, pal[hash2(x, y, 1601) < 0.2 ? 1 : x < x0 + w / 2 ? 3 : 2]);
      }
      p.line(x0 + 1, 6, x0 + w - 1, 6, LEA[1]);
    };
    hide(6, 8, ['#2a2e36', '#4a505a', '#6a707a', '#8a909a']);
    hide(16, 9, HIDE.slice(1));
  }, { ax: 15, ay: H - 2, box: [-11, -4, 11, 1] });
}

function woodPile() {
  const W = 28, H = 20;
  return mk(W, H, (p) => {
    const bottom = H - 1;
    snowPatch(p, 14, bottom - 1, 13, 1, 1610);
    for (let row = 0; row < 3; row++) for (let i = 0; i < 5 - row; i++) {
      const x = 4 + i * 5 + row * 2.5, y = bottom - 4 - row * 4;
      p.ellipse(x, y, 2.6, 2.2, WOOD[1]); p.ellipse(x, y, 1.8, 1.5, '#8a6a44'); p.px(x, y, '#5a4228'); p.px(x - 1, y - 1, '#a88452');
    }
    for (let x = 3; x < 26; x++) if (hash2(x, 0, 1611) < 0.7) p.px(x, bottom - 14 + Math.round(Math.abs(x - 14) * 0.45), SNOW[6]);
    p.line(22, bottom - 2, 26, bottom - 9, WOOD[3]); p.rect(25, bottom - 11, 2, 3, IRON[3]);
  }, { ax: 14, ay: H - 2, box: [-11, -4, 11, 1] });
}

function cairn() {
  const W = 16, H = 26;
  return mk(W, H, (p) => {
    const bottom = H - 1;
    snowPatch(p, 8, bottom - 1, 7, 1, 1620);
    const stones = [[8, bottom - 3, 6, 2.6], [7, bottom - 8, 5, 2.4], [9, bottom - 12, 4, 2.2], [8, bottom - 16, 3, 2], [8, bottom - 19, 2, 1.4]];
    for (const [x, y, rx, ry] of stones) { p.ellipse(x, y, rx, ry, ROCK[3]); p.ellipse(x - 1, y - 0.6, rx - 1, ry - 1, ROCK[4]); p.rect(Math.round(x - rx + 1), Math.round(y - ry), Math.round(rx), 1, SNOW[6]); }
    // Wimpel
    p.line(10, bottom - 20, 10, 2, WOOD[3]); p.rect(11, 2, 4, 3, CRIM[3]); p.px(14, 4, CRIM[1]);
  }, { ax: 8, ay: H - 2, box: [-5, -3, 5, 1] });
}

// ------------------------------------------------------------ Eisfall an einer Felswand
function iceFall(v) {
  const W = 36, H = 54;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 18;
    // Felsnische
    for (let y = 0; y < bottom - 6; y++) for (let x = 0; x < W; x++) {
      const half = 16 - y * 0.05;
      if (Math.abs(x - cx) > half) continue;
      p.px(x, y, ROCK[(x + (y >> 2)) % 7 === 0 ? 3 : 2]);
    }
    // Eiskaskade: senkrechte Säulen
    for (let x = 6; x < 30; x++) {
      const len = bottom - 6 - Math.round(hash2(x, 0, 1630 + v) * 10);
      const start = Math.round(hash2(x, 1, 1631 + v) * 4);
      for (let y = start; y < len; y++) {
        const lane = (x + Math.floor(y / 9)) % 3;
        let c = lane === 0 ? ICE[6] : lane === 1 ? ICE[4] : ICE[3];
        if (x > 24) c = lane === 0 ? ICE[4] : ICE[2];
        p.px(x, y, c);
        if (lane === 0 && y % 4 === 0) g.px(x, y, ICE[4]);
      }
    }
    // Becken unten
    p.ellipse(cx, bottom - 4, 16, 4, ICE[4]); p.ellipse(cx - 2, bottom - 5, 11, 2.4, ICE[5]); p.ellipse(cx, bottom - 3, 14, 1.5, ICE[3]);
    for (let i = 0; i < 6; i++) { const x = 4 + i * 5; p.px(x, bottom - 2, SNOW[6]); }
  }, { ax: 18, ay: H - 2, box: [-14, -6, 14, 1], light: { dx: 0, dy: -20, radius: 64, color: [120, 200, 255], intensity: 0.55 } });
}

// ------------------------------------------------------------ Abgestorbene Kiefer
function deadPine(v) {
  const W = 30, H = 50;
  return mk(W, H, (p) => {
    const bottom = H - 1, cx = 15;
    snowPatch(p, cx, bottom - 1, 9, 1, 1640 + v);
    for (let y = 4 + v * 6; y < bottom; y++) { const w = 1 + Math.floor((y - 4) / 16); for (let x = cx - w; x <= cx + w; x++) p.px(x, y, x === cx - w ? '#5a4a3c' : x === cx + w ? '#1e1814' : '#3a2e24'); }
    const rng = createRng(1641 + v);
    for (let y = 10 + v * 6; y < bottom - 10; y += rng.int(4, 7)) {
      const s = rng.chance(0.5) ? 1 : -1, len = rng.int(4, 10 - Math.floor(y / 12));
      p.line(cx, y, cx + s * len, y - Math.round(len * 0.4), '#3a2e24');
      p.px(cx + s * len, y - Math.round(len * 0.4) - 1, SNOW[6]);
      for (let k = 1; k < len; k += 2) p.px(cx + s * k, y - Math.round(k * 0.4) - 1, SNOW[5]);
    }
    if (v === 1) { p.line(cx + 1, 10, cx + 5, 6, '#3a2e24'); }
    p.px(cx, 3 + v * 6, SNOW[6]); p.px(cx - 1, 4 + v * 6, SNOW[5]);
  }, { ax: 15, ay: H - 2, box: [-3, -3, 3, 1], extra: { occlude: [-10, -46, 10, -6] } });
}

// ------------------------------------------------------------ Wühlerbau (Questobjekt)
function burrowHole(on) {
  const W = 38, H = 26;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 19, cy = bottom - 8;
    // Aufgeworfener Schneehügel mit Erdbrocken
    for (let y = 2; y <= bottom; y++) for (let x = 0; x < W; x++) {
      const d = ((x - cx) / 17) ** 2 + ((y - cy - 2) / 9) ** 2;
      if (d > 1 || (d > 0.85 && hash2(x, y, 1650) < 0.5)) continue;
      const lit = (x - cx) * 0.8 + (y - cy) < -2;
      p.px(x, y, lit ? SNOW[6] : d > 0.6 ? SNOW[4] : SNOW[5]);
    }
    for (let i = 0; i < 14; i++) { const a = i * 0.9, r = 9 + (i % 5) * 1.6; const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + 2 + Math.sin(a) * r * 0.45); p.px(x, y, i % 2 ? '#3a2a20' : '#2a1e16'); }
    if (!on) {
      // dunkles Loch mit Krallenspuren und Knochen
      p.ellipse(cx, cy, 7, 4, '#05070c'); p.ellipse(cx, cy - 1, 6, 2.6, '#0a0e16');
      for (let x = cx - 6; x <= cx + 6; x++) p.px(x, Math.round(cy - 4 * Math.sqrt(Math.max(0, 1 - ((x - cx) / 7) ** 2))), SNOW[3]);
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) p.line(cx + s * (9 + i * 2), cy - 3, cx + s * (11 + i * 2), cy + 3, SNOW[2]);
      p.line(cx + 9, bottom - 3, cx + 14, bottom - 5, BONE[4]); p.px(cx + 15, bottom - 6, BONE[5]); p.px(cx + 8, bottom - 3, BONE[5]);
      g.px(cx - 2, cy, '#3a5a20'); g.px(cx + 2, cy, '#3a5a20');   // Augen in der Tiefe
    } else {
      // eingestürzt: Rußstern, Brocken, Rauch
      for (let i = 0; i < 40; i++) { const a = i * 0.7, r = (i % 9) * 1.2; p.px(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.5), i % 3 ? '#18141a' : '#2a2226'); }
      for (const [x, y] of [[cx - 5, cy - 1], [cx + 4, cy], [cx, cy + 2], [cx - 2, cy - 2]]) { p.ellipse(x, y, 2.4, 1.6, ROCK[2]); p.px(x - 1, y - 1, ROCK[4]); p.px(x, y - 1, SNOW[5]); }
      for (let i = 0; i < 4; i++) { p.px(cx - 3 + i * 2, cy - 1 + (i % 2), EMB[2]); g.px(cx - 3 + i * 2, cy - 1 + (i % 2), EMB[3]); }
    }
  }, { ax: 19, ay: H - 3, box: [-10, -5, 10, 1], extra: on ? { smoke: { dx: 0, dy: -10, rate: 3 } } : undefined });
}

// ------------------------------------------------------------ Feste: Vorräte, Schlitten, Waffengestell
function supplies() {
  const W = 30, H = 26;
  return mk(W, H, (p) => {
    const bottom = H - 1;
    snowPatch(p, 15, bottom - 1, 14, 1, 1660);
    // Fässer
    for (const [bx, by] of [[7, bottom - 2], [14, bottom - 1]]) {
      p.rect(bx - 3, by - 10, 7, 10, WOOD[2]); p.rect(bx - 3, by - 10, 2, 10, WOOD[3]); p.rect(bx + 3, by - 10, 1, 10, WOOD[1]);
      for (const y of [by - 8, by - 3]) p.rect(bx - 3, y, 7, 1, IRON[2]);
      p.ellipse(bx, by - 10, 3.5, 1.2, WOOD[3]); p.rect(bx - 2, by - 11, 5, 1, SNOW[6]);
    }
    // Kiste mit Plane
    p.rect(18, bottom - 12, 10, 11, WOOD[2]); p.rect(18, bottom - 12, 10, 1, WOOD[4]); p.rect(18, bottom - 7, 10, 1, WOOD[1]); p.rect(18, bottom - 12, 1, 11, WOOD[3]);
    p.rect(17, bottom - 14, 12, 3, HIDE[3]); p.rect(17, bottom - 14, 12, 1, SNOW[6]); p.px(28, bottom - 11, HIDE[1]);
  }, { ax: 15, ay: H - 2, box: [-12, -4, 12, 1] });
}

function sled() {
  const W = 34, H = 20;
  return mk(W, H, (p) => {
    const bottom = H - 1;
    p.rect(3, bottom - 3, 28, 1, WOOD[3]); p.line(30, bottom - 3, 33, bottom - 7, WOOD[3]); p.rect(3, bottom - 2, 28, 1, WOOD[1]);
    for (const x of [6, 14, 22, 28]) p.rect(x, bottom - 6, 1, 3, WOOD[2]);
    p.rect(4, bottom - 7, 26, 2, WOOD[3]); p.rect(4, bottom - 7, 26, 1, WOOD[4]);
    // Bündel und Felle
    p.ellipse(11, bottom - 10, 6, 3.4, HIDE[3]); p.ellipse(10, bottom - 11, 4, 2, HIDE[4]);
    p.ellipse(22, bottom - 10, 5, 3, '#4a505a'); p.ellipse(21, bottom - 11, 3, 1.6, '#6a707a');
    p.line(6, bottom - 13, 27, bottom - 8, LEA[2]);
    p.rect(8, bottom - 14, 6, 1, SNOW[6]); p.rect(19, bottom - 13, 5, 1, SNOW[6]);
  }, { ax: 17, ay: H - 2, box: [-13, -4, 13, 1] });
}

function weaponRack() {
  const W = 26, H = 30;
  return mk(W, H, (p) => {
    const bottom = H - 1;
    snowPatch(p, 13, bottom - 1, 11, 1, 1670);
    p.rect(3, 8, 2, bottom - 8, WOOD[3]); p.rect(21, 8, 2, bottom - 8, WOOD[2]);
    p.rect(2, 10, 22, 2, WOOD[3]); p.rect(2, bottom - 6, 22, 2, WOOD[2]); p.rect(2, 9, 22, 1, SNOW[6]);
    // Speere, Axt, Rundschild
    for (const x of [7, 10]) { p.rect(x, 2, 1, bottom - 3, WOOD[4]); p.px(x, 1, IRON[4]); p.px(x, 0, IRON[5]); p.px(x - 1, 2, IRON[3]); p.px(x + 1, 2, IRON[3]); }
    p.rect(14, 6, 1, bottom - 7, WOOD[3]); p.rect(15, 6, 4, 5, IRON[3]); p.rect(15, 6, 4, 1, IRON[5]); p.px(19, 8, IRON[2]);
    p.ellipse(19, 18, 4, 4, WOOD[1]); p.ellipse(19, 18, 3, 3, NBLUE[3]); p.rect(16, 18, 7, 1, BONE[3]); p.px(19, 18, IRON[4]);
  }, { ax: 13, ay: H - 2, box: [-10, -3, 10, 1] });
}

// ============================================================ Runde 5/2: Gebirge und Points of Interest
// Felsband/Schneeterrasse im Massiv: deckt eine feste Zelle ohne Fels (die Wand darüber
// zeichnet der Boden-Renderer). Anker = Zellmitte unten (Zelle reicht -14..+2).
function ledgeSnow(v) {
  const W = 24, H = 24, ax = 12, ay = 18, G = GROUND_FROST.grass;
  return flat(W, H, ax, ay, (p) => {
    const s = 2900 + v * 13;
    for (let x = 0; x < W; x++) {
      // Ränder laufen an den Sprite-Seiten auf gleiche Höhe aus (nahtlos nebeneinander)
      const edge = Math.min(x, W - 1 - x) / 6, e = Math.min(1, edge);
      const top = 2 + Math.round(vnoiseLite(x / 5, v, s) * 2.4 * e);
      const bot = H - 4 - Math.round(vnoiseLite(x / 4, v + 3, s + 1) * 2 * e);
      for (let y = top; y <= bot; y++) {
        const t = (y - top) / Math.max(1, bot - top);
        let k = t < 0.2 ? 1 : t < 0.5 ? 3 : t < 0.85 ? 2 : 4;
        if (hash2(x, y, s + 2) < 0.06) k += 1;
        p.px(x, y, G[clampI(k, 6)]);
      }
      p.px(x, bot + 1, G[0]); if (hash2(x, 0, s + 3) < 0.5) p.px(x, bot + 2, rgba(6, 10, 20, 0.35));
    }
    // Geröll, das durch den Schnee stößt
    for (let k = 0; k < 2; k++) {
      const x = 4 + Math.floor(hash2(k, v, s + 4) * 15), y = 8 + Math.floor(hash2(k, v, s + 5) * 7);
      p.px(x, y, ROCK[3]); p.px(x + 1, y, ROCK[2]); p.px(x, y - 1, G[5]);
    }
    if (v === 2) { for (let y = 5; y < 15; y++) p.px(16, y, PINE[3]); for (let i = 0; i < 5; i++) { p.rect(14 - (i >> 1), 6 + i * 2, 5 + (i & ~1), 1, PINE[2 + (i & 1)]); p.px(14 - (i >> 1), 6 + i * 2, SNOW[5]); } }
  });
}

// Bergspitze: verschneiter Felsgipfel mit Graten und Rinnen (auf Schneeterrassen im Massiv)
function mountainPeak(v) {
  const W = [76, 58, 92][v], H = [88, 66, 104][v];
  const rng = createRng(2950 + v);
  return mk(W, H, (p, g) => {
    const base = H - 6, mask = new Uint8Array(W * H);
    // Kammlinie: ein bis zwei Gipfel, gezackt
    const peaks = v === 2 ? [[W * 0.38, 4], [W * 0.7, 18]] : v === 1 ? [[W * 0.46, 6]] : [[W * 0.42, 3], [W * 0.74, 24]];
    const ridge = (x) => {
      let y = base;
      for (const [px, py] of peaks) { const slope = (base - py) / (W * 0.5); y = Math.min(y, py + Math.abs(x - px) * slope * (x < px ? 1.05 : 0.95)); }
      return y + (vnoiseLite(x / 3, v, 2951) - 0.5) * 5 + (hash2(x, v, 2952) < 0.12 ? 2 : 0);
    };
    const tops = [];
    for (let x = 0; x < W; x++) {
      const t = Math.max(1, Math.round(ridge(x)));
      tops.push(t);
      for (let y = t; y <= base + 3; y++) if (y < H) mask[y * W + x] = 1;
    }
    // Grate (helle/dunkle Facetten) – je Gipfel eine Hauptkante nach unten rechts versetzt
    const crest = (x, y) => {
      let best = 1e9;
      for (const [px, py] of peaks) best = Math.min(best, x - (px + (y - py) * 0.32 + (vnoiseLite(y / 6, px, 2953) - 0.5) * 6));
      return best;
    };
    const snowLine = (x) => base - (H * 0.42) + (vnoiseLite(x / 6, v, 2954) - 0.5) * 18;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!mask[y * W + x]) continue;
      const c = crest(x, y);
      let k = c < 0 ? 5 : 2;                                                 // links Licht, rechts Schatten
      if (c < 0 && c > -3) k = 6;                                            // Gratkante
      const band = Math.floor((y + x * 0.3 + vnoiseLite(x / 8, y / 12, 2955) * 6) / 6);
      if (((y + x * 0.3 + vnoiseLite(x / 8, y / 12, 2955) * 6) % 6) < 1) k -= 1; // Schichtung
      if (hash2(x, band, 2956) < 0.04) k -= 2;                                // Risse
      let col = ROCK[clampI(k, 7)];
      // Schnee: oberhalb der Schneegrenze auf der Lichtseite fast ganz, im Schatten in Rinnen
      const sl = snowLine(x), gully = vnoiseLite(x / 2.6, y / 14, 2957);
      if (y < sl) {
        if (c < 0) col = gully > 0.28 ? (c > -3 ? SNOW[6] : SNOW[5]) : ROCK[4];
        else col = gully > 0.55 ? SNOW[3] : gully > 0.42 ? SNOW[2] : ROCK[clampI(k, 7)];
      } else if (gully > 0.74 && hash2(x, y >> 1, 2958) < 0.8) col = c < 0 ? SNOW[4] : SNOW[2];
      if (y - tops[x] < 2) col = c < 0 ? SNOW[6] : SNOW[4];                  // Firn auf dem Kamm
      p.px(x, y, col);
    }
    // Eis in einer Rinne
    for (let i = 0; i < 4; i++) { const x = Math.round(peaks[0][0] + 6 + i * 3), y = Math.round(base - H * 0.3 + i * 4); if (mask[y * W + x]) { p.px(x, y, ICE[4]); p.px(x, y + 1, ICE[3]); g.px(x, y, ICE[3]); } }
    // Fuß: Geröll und Schneewehe
    for (let x = 2; x < W - 2; x++) for (let y = base - 2; y <= base + 3; y++) {
      if (!mask[y * W + x]) continue;
      const h = hash2(x, y, 2959);
      if (y >= base + 1 || h < 0.35) p.px(x, y, h < 0.25 ? ROCK[3] : y === base + 3 ? SNOW[3] : SNOW[4]);
    }
    for (let i = 0; i < 5; i++) { const x = rng.int(4, W - 6), y = base - rng.int(0, 2); p.px(x, y, ROCK[5]); p.px(x + 1, y, ROCK[3]); p.px(x, y - 1, SNOW[6]); }
  }, { ax: Math.floor(W / 2), ay: H - 4, extra: { occlude: [-W / 2 + 6, -H + 8, W / 2 - 6, -10] } });
}

// Felsnadel: freistehender, schlanker Zacken auf den Schneefeldern
function rockSpire(v) {
  const W = [32, 42, 26][v], H = [70, 88, 54][v];
  return mk(W, H, (p, g) => {
    const bottom = H - 3, cx = W / 2;
    const mask = new Uint8Array(W * H);
    const needles = v === 1 ? [[cx - 6, 4, 9], [cx + 8, 26, 6]] : v === 0 ? [[cx, 2, 9]] : [[cx - 1, 3, 7], [cx + 6, 22, 4]];
    for (const [nx, top, half] of needles) {
      for (let y = top; y <= bottom; y++) {
        const t = (y - top) / (bottom - top);
        const hw = 1 + half * Math.pow(t, 0.7) + (vnoiseLite(y / 4, nx, 2960) - 0.5) * 2.4;
        const lean = (1 - t) * (v === 2 ? -3 : 2);
        for (let x = Math.floor(nx + lean - hw); x <= Math.ceil(nx + lean + hw); x++) {
          if (x < 0 || x >= W) continue;
          mask[y * W + x] = 1;
          const rel = (x - (nx + lean - hw)) / (2 * hw);
          let k = rel < 0.3 ? 5 : rel < 0.55 ? 4 : rel < 0.8 ? 3 : 2;
          const strata = (y + Math.round(x * 0.5)) % 7;
          if (strata === 0) k -= 1;
          if (hash2(x, y >> 2, 2961 + v) < 0.05) k -= 2;
          p.px(x, y, ROCK[clampI(k, 7)]);
        }
      }
    }
    // Schnee auf allen Absätzen, Eis in Spalten
    snowOnMask(p, mask, W, H, { depth: 2, seed: 2962 + v, left: 0.55, chance: 0.95 });
    for (let y = 8; y < bottom; y += 9) { const x = Math.round(needles[0][0] + 1), on = mask[y * W + x]; if (on) { p.px(x, y, ICE[4]); p.px(x, y + 1, ICE[3]); p.px(x, y + 2, ICE[2]); g.px(x, y, ICE[3]); } }
    for (const [nx, top] of needles) { p.px(Math.round(nx), top, SNOW[6]); p.px(Math.round(nx) - 1, top + 1, SNOW[6]); }
    snowPatch(p, Math.round(cx), bottom, Math.round(W / 2) - 1, 2, 2963 + v);
    for (let i = 0; i < 3; i++) { const x = 3 + Math.floor(hash2(i, v, 2964) * (W - 6)); p.px(x, bottom + 1, ROCK[3]); p.px(x + 1, bottom + 1, ROCK[2]); }
  }, { ax: Math.floor(W / 2), ay: H - 3, box: [-Math.floor(W / 2) + 4, -6, Math.floor(W / 2) - 4, 2], extra: { occlude: [-W / 2 + 2, -H + 6, W / 2 - 2, -10] } });
}

// Gefrorener Teich (begehbar, Bodendecal unter dem Anker)
function frozenPond(v) {
  const W = [80, 56][v], H = [44, 32][v], rx = W / 2 - 4, ry = H / 2 - 4, cx = W / 2, cy = H / 2;
  return flat(W, H, Math.floor(W / 2), 0, (p, g) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + (vnoiseLite(x / 6, y / 6, 2970 + v) - 0.5) * 0.35;
      if (e > 1.22) continue;
      if (e > 1) { p.px(x, y, hash2(x, y, 2971) < 0.5 ? SNOW[5] : SNOW[4]); continue; }      // Schneewall am Ufer
      const depth = 1 - e;
      let col = depth > 0.55 ? ICE[2] : depth > 0.25 ? ICE[3] : ICE[4];
      const streak = Math.sin((x * 0.35 - y * 0.9) + vnoiseLite(x / 9, y / 9, 2972) * 4);
      if (streak > 0.93) col = ICE[5];
      if (e > 0.82 && hash2(x, y, 2973) < 0.5) col = SNOW[4];                             // Schneeanflug am Rand
      if (vnoiseLite(x / 7, y / 5, 2974 + v) > 0.72 && depth < 0.7) col = hash2(x, y, 2975) < 0.6 ? SNOW[5] : SNOW[4]; // Schneeflecken
      p.px(x, y, col);
      if (col === ICE[5]) g.px(x, y, ICE[2]);
    }
    // Risse
    const rng = createRng(2976 + v);
    for (let k = 0; k < 3; k++) {
      let x = cx + rng.int(-rx / 2, rx / 2), y = cy + rng.int(-ry / 2, ry / 2);
      for (let i = 0; i < 14; i++) { p.px(Math.round(x), Math.round(y), ICE[1]); p.px(Math.round(x) + 1, Math.round(y) - 1, ICE[6]); x += rng.range(-1.6, 1.6); y += rng.range(-0.8, 0.8); }
    }
    // eingefrorenes Schilf und Steine am Rand
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + v, x = Math.round(cx + Math.cos(a) * rx * 0.95), y = Math.round(cy + Math.sin(a) * ry * 0.95);
      if (k % 2) { for (let i = 0; i < 4; i++) p.px(x + (i & 1), y - i, i === 3 ? SNOW[6] : '#5a5a44'); }
      else { p.px(x, y, ROCK[4]); p.px(x + 1, y, ROCK[3]); p.px(x, y - 1, SNOW[6]); }
    }
  });
}

// Spuren im Schnee (begehbar): Wolf, Schlitten mit Stiefeln, Troll
function tracks(v) {
  const W = 56, H = 22;
  return flat(W, H, 28, 0, (p) => {
    const dent = (x, y, c = SNOW[2], c2 = SNOW[5]) => { p.px(x, y, c); p.px(x, y + 1, c2); };
    if (v === 0) {
      for (let i = 0; i < 9; i++) {
        const x = 3 + i * 6, y = 4 + Math.round(Math.sin(i * 0.8) * 3) + (i % 2) * 4;
        dent(x, y); dent(x + 1, y); p.px(x - 1, y - 1, SNOW[2]); p.px(x + 2, y - 1, SNOW[2]); p.px(x, y - 2, SNOW[2]);
      }
    } else if (v === 1) {
      for (let x = 2; x < W - 2; x++) {
        const y = 7 + Math.round(Math.sin(x / 12) * 2);
        p.px(x, y, SNOW[2]); p.px(x, y + 1, SNOW[5]); p.px(x, y + 6, SNOW[2]); p.px(x, y + 7, SNOW[5]);
        if (x % 7 === 0) { p.rect(x + 1, y + 3, 2, 1, SNOW[2]); p.px(x + 1, y + 4, SNOW[5]); }
      }
    } else {
      for (let i = 0; i < 5; i++) {
        const x = 4 + i * 11, y = 4 + (i % 2) * 7;
        p.ellipse(x + 2, y + 3, 3, 2.2, SNOW[2]); p.rect(x, y + 5, 5, 1, SNOW[5]);
        for (let t = 0; t < 3; t++) { p.px(x + t * 2, y, SNOW[1]); p.px(x + t * 2, y + 1, SNOW[2]); }
      }
    }
  });
}

// Verfallener Wachturm (Ruine)
function ruinTower() {
  const W = 52, H = 76;
  return mk(W, H, (p, g) => {
    const bottom = H - 2, x0 = 10, x1 = 41;
    const topAt = (x) => 14 + Math.round(Math.abs(Math.sin(x * 0.7)) * 4) + (x > 28 ? Math.round((x - 28) * 1.3) : 0) + (hash2(x, 0, 2980) < 0.3 ? 3 : 0);
    for (let x = x0; x <= x1; x++) {
      const t = topAt(x);
      for (let y = t; y < bottom - 2; y++) {
        const row = Math.floor(y / 5), off = (row % 2) * 4, lx = (x + off) % 8, ly = y % 5;
        let k = x < x0 + 6 ? 5 : x < x0 + 18 ? 4 : x < x1 - 5 ? 3 : 2;
        if (ly === 0 || lx === 0) k -= 2; else if (ly === 1) k += 1;
        if (hash2(x >> 3, row, 2981) < 0.15) k -= 1;
        p.px(x, y, STONE[clampI(k, STONE.length)]);
      }
      p.px(x, t, SNOW[6]); p.px(x, t + 1, SNOW[5]);
    }
    // Schießscharte und Bresche
    p.rect(22, 30, 3, 8, '#06080e'); p.px(22, 30, STONE[1]);
    for (let y = 46; y < bottom - 2; y++) for (let x = 27; x < 36; x++) if (Math.abs(x - 31) < (y - 44) * 0.45) p.px(x, y, '#05070c');
    // Trümmer davor, Eiszapfen an der Krone
    for (let i = 0; i < 6; i++) { const x = 6 + i * 7, y = bottom - 1 - (i % 2); p.ellipse(x, y, 3, 2, STONE[2]); p.px(x - 1, y - 2, SNOW[6]); p.px(x, y - 2, SNOW[5]); }
    icicles(p, g, 12, 26, 19, 2982, 4, 0.4);
    snowPatch(p, 26, bottom - 1, 22, 2, 2983);
  }, { ax: 26, ay: H - 3, box: [-15, -8, 15, 1], extra: { occlude: [-20, -66, 20, -10] } });
}
function ruinWall(v) {
  const W = 46, H = 34;
  return mk(W, H, (p) => {
    const bottom = H - 2;
    for (let x = 2; x < W - 2; x++) {
      const t = 5 + Math.round(vnoiseLite(x / 5, v, 2984) * 14) + (x > W - 12 ? (x - (W - 12)) * 1.2 | 0 : 0) + (hash2(x, v, 2985) < 0.2 ? 2 : 0);
      for (let y = t; y < bottom - 1; y++) {
        const row = Math.floor(y / 5), lx = (x + (row % 2) * 4) % 8, ly = y % 5;
        let k = 4 - (x > W * 0.6 ? 1 : 0);
        if (ly === 0 || lx === 0) k -= 2; else if (ly === 1) k += 1;
        p.px(x, y, STONE[clampI(k, STONE.length)]);
      }
      p.px(x, t, SNOW[6]); if (hash2(x, 1, 2986) < 0.6) p.px(x, t + 1, SNOW[5]);
    }
    snowPatch(p, 23, bottom - 1, 21, 2, 2987 + v);
  }, { ax: 23, ay: H - 3, box: [-20, -6, 20, 1] });
}
// Runenstein (Thingkreis), Runen glimmen kalt
function runeStone(v) {
  const W = 18, H = [36, 28][v];
  return mk(W, H, (p, g) => {
    const bottom = H - 2, top = 2;
    for (let y = top; y < bottom; y++) {
      const t = (y - top) / (bottom - top), hw = 4 + t * 2 + (y < top + 3 ? -1.5 : 0);
      for (let x = Math.round(9 - hw); x <= Math.round(9 + hw); x++) {
        const rel = (x - (9 - hw)) / (2 * hw);
        let k = rel < 0.3 ? 5 : rel < 0.7 ? 4 : 2;
        if (hash2(x, y, 2990 + v) < 0.08) k -= 1;
        p.px(x, y, ROCK[clampI(k, 7)]);
      }
    }
    p.rect(7, top, 4, 1, SNOW[6]); p.px(6, top + 1, SNOW[5]); p.px(11, top + 1, SNOW[4]);
    const runes = [[8, 8], [9, 13], [8, 18], [9, 23]].slice(0, v ? 3 : 4);
    for (const [x, y] of runes) { p.px(x, y, NBLUE[5]); p.px(x, y + 1, NBLUE[4]); p.px(x + 1, y + 2, NBLUE[4]); p.px(x - 1, y + 2, NBLUE[4]); g.px(x, y, NBLUE[4]); g.px(x, y + 1, NBLUE[4]); }
    snowPatch(p, 9, bottom, 7, 1, 2991 + v);
  }, { ax: 9, ay: H - 2, box: [-5, -4, 5, 1] });
}
// Grassodenhaus: niedrige Feldsteinwand, dickes Sodendach unter Schnee
function sodHut(v) {
  const W = 72, H = 56;
  return mk(W, H, (p, g) => {
    const bottom = H - 2, x0 = 8, x1 = 63, wallTop = bottom - 16;
    snowPatch(p, 36, bottom, 34, 2, 2995 + v);
    fieldstones(p, x0, wallTop, x1 - x0, bottom - wallTop - 1, 2996 + v);
    // Tür (Fellvorhang) und Fensterluke mit Licht
    const dx = v ? 44 : 22;
    p.rect(dx, wallTop + 3, 9, bottom - wallTop - 4, '#120a06'); p.rect(dx, wallTop + 3, 9, 1, WOOD[3]); p.rect(dx + 1, wallTop + 4, 4, bottom - wallTop - 6, HIDE[2]);
    const wx = v ? 18 : 48; p.rect(wx, wallTop + 5, 6, 4, '#2a1406'); p.rect(wx + 1, wallTop + 6, 4, 2, EMB[3]); g.rect(wx + 1, wallTop + 6, 4, 2, EMB[4]);
    // Sodendach: gewölbt, Schnee oben, Grasbüschel an der Traufe
    for (let x = x0 - 4; x <= x1 + 4; x++) {
      const t = (x - (x0 - 4)) / (x1 - x0 + 8), top = 6 + Math.round(Math.pow(Math.abs(t - 0.45) * 2, 2) * 12);
      for (let y = top; y <= wallTop + 1; y++) {
        const snowy = y < top + 9 + Math.round(hash2(x, 0, 2997) * 4);
        let col = snowy ? (t < 0.45 ? SNOW[6] : SNOW[5]) : (y > wallTop - 2 ? '#2a3020' : '#3a4230');
        if (!snowy && hash2(x, y, 2998) < 0.15) col = '#4a5238';
        if (snowy && t > 0.7) col = SNOW[4];
        p.px(x, y, col);
      }
      if (hash2(x, 2, 2999) < 0.35) p.px(x, wallTop + 2, '#4a5238');
    }
    icicles(p, g, x0, x1, wallTop + 2, 3000 + v, 3, 0.3);
    // Rauchloch
    p.rect(v ? 26 : 42, 8, 4, 2, ROCK[1]);
  }, { ax: 36, ay: H - 3, box: [-28, -10, 28, 1], extra: { smoke: { dx: (v ? 26 : 42) - 34, dy: -48, rate: 1 }, occlude: [-30, -50, 30, -12] } });
}
// Wegstange mit Lappen (markiert Pass und Wege)
function markerPole(v) {
  const W = 14, H = 40;
  return mk(W, H, (p) => {
    const bottom = H - 2;
    for (let y = 4; y < bottom; y++) { p.px(6, y, WOOD[4]); p.px(7, y, WOOD[2]); }
    p.px(6, 3, SNOW[6]); p.px(7, 3, SNOW[5]);
    const C = v ? NBLUE : CRIM;
    for (let y = 7; y < 12; y++) for (let x = 8; x < 8 + 4 - ((y - 7) >> 1); x++) p.px(x, y, C[(x + y) % 2 ? 3 : 2]);
    p.px(11, 12, C[1]);
    for (let y = 14; y < bottom - 2; y += 6) p.px(5, y, SNOW[5]);
    p.rect(3, bottom - 1, 8, 1, SNOW[4]); p.px(4, bottom - 2, SNOW[5]); p.px(9, bottom - 2, SNOW[3]);
  }, { ax: 6, ay: H - 2, box: [-2, -3, 2, 1] });
}
// Kalte Feuerstelle eines verlassenen Lagers
function coldFire() {
  const W = 26, H = 14;
  return mk(W, H, (p) => {
    snowPatch(p, 13, 8, 12, 4, 3010);
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, x = Math.round(13 + Math.cos(a) * 8), y = Math.round(7 + Math.sin(a) * 3.4); p.ellipse(x, y, 1.6, 1.2, ROCK[3]); p.px(x - 1, y - 1, SNOW[6]); }
    p.ellipse(13, 7, 5, 2, '#1a1612'); p.line(9, 6, 17, 8, '#2a2018'); p.line(10, 8, 16, 5, '#3a2c20'); p.px(12, 6, SNOW[5]); p.px(15, 7, SNOW[6]);
  }, { ax: 13, ay: 10, box: [-9, -4, 9, 2] });
}
// Großer gefrorener Wasserfall an einer Felswand
function frozenCascade(v) {
  const W = 54, H = 92;
  return mk(W, H, (p, g) => {
    const bottom = H - 1, cx = 27;
    for (let y = 0; y < bottom - 8; y++) {
      const half = 12 + y * 0.12 + (vnoiseLite(y / 9, v, 3020) - 0.5) * 4;
      for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
        if (x < 0 || x >= W) continue;
        const lane = (x + Math.floor(y / (7 + (x % 3)))) % 4;
        let c = lane === 0 ? ICE[6] : lane === 1 ? ICE[4] : lane === 2 ? ICE[3] : ICE[5];
        if (x > cx + half - 5) c = lane === 0 ? ICE[4] : ICE[2];
        if (x < cx - half + 2) c = ICE[5];
        if (hash2(x, y >> 3, 3021 + v) < 0.06) c = ICE[2];
        p.px(x, y, c);
        if (lane === 0 && y % 5 === 0) g.px(x, y, ICE[4]);
      }
    }
    // Zapfenvorhang und Becken
    for (let x = 4; x < W - 4; x++) { const len = Math.round(hash2(x, 3, 3022 + v) * 10); for (let k = 0; k < len; k++) p.px(x, bottom - 12 + k, k < len - 2 ? ICE[4] : ICE[5]); }
    p.ellipse(cx, bottom - 4, 25, 4.4, ICE[4]); p.ellipse(cx - 3, bottom - 5, 17, 2.4, ICE[5]); p.ellipse(cx, bottom - 2, 23, 1.6, SNOW[5]);
  }, { ax: 27, ay: H - 2, box: [-22, -7, 22, 1], light: { dx: 0, dy: -36, radius: 84, color: [120, 200, 255], intensity: 0.6 }, extra: { occlude: [-24, -86, 24, -12] } });
}

export function createFrostDecor() {
  return {
    snowPines: [snowPine(701, 50), snowPine(705, 58), snowPine(709, 42)],
    frozenRocks: [0, 1, 2].map(frozenRock),
    iceCrystals: [0, 1, 2].map(iceCrystals),
    snowDrifts: [0, 1].map(snowDrift),
    longhouse: longhouse(),
    fortWall: fortWallH(),
    fortWallV: fortWallV(),
    fortGate: fortGate(),
    fortTower: fortTower(),
    tent: tent(),
    bannerPole: bannerPole(),
    campfireBig: campfireBig(),
    frostBeacon: { off: frostBeacon(false), on: frostBeacon(true) },
    rimeGate: rimeGate(),
    trollBones: [0, 1].map(trollBones),
    // Runde 5
    iceCracks: [0, 1, 2, 3].map(iceCracks),
    iceHole: [0, 1].map(iceHole),
    fishHut: fishHut(),
    frozenBoat: frozenBoat(),
    // Gletscherspalten: crevSS, crevSU, … crevNN (l, r ∈ S U D N)
    ...Object.fromEntries(['S', 'U', 'D', 'N'].flatMap((l) => ['S', 'U', 'D', 'N'].map((r) => [`crev${l}${r}`, [0, 1].map((v) => crevasseLR(l, r, v))]))),
    snowBridge: [0, 1].map((v) => snowBridge('M', v)),
    snowBridgeL: [0, 1].map((v) => snowBridge('L', v)),
    snowBridgeR: [0, 1].map((v) => snowBridge('R', v)),
    icicleCurtain: [0, 1, 2].map(icicleCurtain),
    icePillar: [0, 1].map(icePillar),
    trollCave: caveArch(true),
    grottoMouth: caveArch(false),
    caveFire: caveFire(),
    huntLodge: huntLodge(),
    peltRack: peltRack(),
    woodPile: woodPile(),
    cairn: cairn(),
    iceFall: [0, 1].map(iceFall),
    deadPine: [0, 1].map(deadPine),
    burrowHole: { off: burrowHole(false), on: burrowHole(true) },
    supplies: supplies(),
    sled: sled(),
    weaponRack: weaponRack(),
    // Runde 5/2: Gebirge und Points of Interest
    ledgeSnow: [0, 1, 0, 1, 2].map(ledgeSnow),
    mountainPeak: [0, 1, 2].map(mountainPeak),
    rockSpire: [0, 1, 2].map(rockSpire),
    frozenPond: [0, 1].map(frozenPond),
    frozenPondSmall: frozenPond(1),
    tracks: [0, 1, 2].map(tracks),
    ruinTower: ruinTower(),
    ruinWall: [0, 1].map(ruinWall),
    runeStone: [0, 1].map(runeStone),
    sodHut: [0, 1].map(sodHut),
    markerPole: [0, 1].map(markerPole),
    coldFire: coldFire(),
    frozenCascade: [0, 1].map(frozenCascade),
  };
}
