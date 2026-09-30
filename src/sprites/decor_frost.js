import { PAL } from '../gfx/Palette.js';
import { createRng, hash2 } from '../core/math.js';
import { OUT } from './outdoor.js';
import { mk, poly, drawTent } from './decor_ashwood.js';

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
  };
}
