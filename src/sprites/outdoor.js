import { createHall } from './hall.js';
import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame } from '../gfx/Sprite.js';
import { createRng, hash2 } from '../core/math.js';

// Außenbereich "Glutsenke": nächtliches Tal mit Glutspalten.
// Licht kommt von oben links (Mond), warme Akzente von Laternen und Fenstern.
// Alles prozedural und deterministisch (Seeds), damit die Zone stabil aussieht.

export const OUT = {
  grass: ['#0e1512', '#131d18', '#19261e', '#203024', '#293c2b', '#344a33'],
  dirt: ['#1a1311', '#241a16', '#30231c', '#3d2c22', '#4c392b', '#5e4935'],
  rock: ['#15121b', '#1f1a26', '#2a2332', '#372e40', '#463b4f', '#574b60'],
  wood: ['#1b110e', '#2a1a14', '#3c261b', '#523424', '#6a4530'],
  slate: ['#131320', '#1b1c2b', '#252738', '#313448', '#40445a'],
  plaster: ['#2a2530', '#373140', '#463f50', '#564e60'],
  pine: ['#09110f', '#0f1a16', '#15241d', '#1c3025', '#253d2d', '#324c37'],
  bark: ['#170f10', '#231719', '#312125', '#402d31'],
  water: ['#070812', '#0a0d1e', '#0f1530', '#172048', '#23306a'],
  ember: PAL.ember,
};

// Bodenpaletten der Außengebiete (gleicher Aufbau wie OUT: grass, dirt, water)
export const BIOME_GROUND = {
  ashwood: {
    grass: ['#11130f', '#171a15', '#1e211b', '#262821', '#2f3029', '#3a3a32'],
    dirt: ['#140f0d', '#1c1512', '#261c17', '#30241d', '#3c2e25', '#4a3a2e'],
    water: ['#050a0c', '#081114', '#0c1a1f', '#12272e', '#1c3a44'],
    tufts: false,
  },
  cinder: {
    grass: ['#0f0d12', '#151219', '#1c1821', '#231e29', '#2c2533', '#372e3f'],
    dirt: ['#170c0a', '#21110d', '#2c1611', '#381c14', '#452319', '#552b1e'],
    water: ['#3a0e05', '#7a2208', '#c8420c', '#f07a1c', '#ffb640'],
    lava: true,
    tufts: false,
  },
};

const hexCache = new Map();
function rgb(hex) {
  let v = hexCache.get(hex);
  if (!v) { const n = parseInt(hex.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; hexCache.set(hex, v); }
  return v;
}

// Glatter Wertrauschen-Wert 0..1
export function vnoise(x, y, seed = 0) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed), c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// Pixel-"Shader" für den Boden. Liefert [r,g,b].
export function groundPixel(kind, px, py, pal = OUT) {
  const n = vnoise(px / 9, py / 9, 11) * 0.6 + vnoise(px / 3, py / 3, 12) * 0.4;
  const h = hash2(px, py, 13);
  if (kind === ',') {
    const G = pal.grass;
    let i = 1 + Math.floor(n * 3.2);
    // Grashalme: kurze senkrechte Striche
    const blade = hash2(px, py >> 1, 14);
    if (blade < 0.07) i = Math.min(5, i + 2);
    else if (blade > 0.95) i = 0;
    if (h < 0.015) return rgb(pal.dirt[2]);
    return rgb(G[Math.max(0, Math.min(5, i))]);
  }
  if (kind === '.') {
    const D = pal.dirt;
    let i = 1 + Math.floor(n * 3);
    if (h < 0.05) i = 4; // Kiesel
    else if (h > 0.97) i = 0;
    // Wagenspuren
    if (vnoise(px / 20, py / 20, 15) > 0.72) i = Math.max(0, i - 1);
    return rgb(D[Math.min(5, i)]);
  }
  if (kind === ':') {
    // Pflaster: versetzte Steine 6x5
    const row = Math.floor(py / 5);
    const col = Math.floor((px + (row % 2) * 3) / 6);
    const lx = (px + (row % 2) * 3) % 6, ly = py % 5;
    if (lx === 0 || ly === 0) return rgb(PAL.mortar);
    const s = hash2(col, row, 16);
    const S = PAL.stone;
    let i = s < 0.3 ? 2 : s < 0.8 ? 3 : 4;
    if (ly === 1 && lx > 0) i = Math.min(5, i + 1);
    if (ly === 4 || lx === 5) i = Math.max(1, i - 1);
    if (h < 0.04) i = 1;
    return rgb(S[i]);
  }
  if (kind === '~') {
    const Wt = pal.water;
    const wave = Math.sin(px * 0.35 + Math.sin(py * 0.6) * 2 + py * 0.9);
    let i = 1 + Math.floor(n * 2);
    if (wave > 0.93 && h < 0.5) i = 3;
    return rgb(Wt[i]);
  }
  return rgb(pal.grass[1]);
}

// ------------------------------------------------------------ Klippen-Tiles
// Klippen: Felsfront (upper/lower) und Plateau (top). rock = Felsrampe (6 Stufen, dunkel→hell),
// cap = Bodenrampe der Hochfläche (Gras/Schnee/Asche). Ohne Angaben: Standardfels mit Waldboden.
export function createCliffTiles(count = 6, seed = 31, { rock = OUT.rock, cap = OUT.grass, capEdge = null } = {}) {
  const rng = createRng(seed);
  const R = rock, G = cap, E = capEdge ?? cap;
  const make = (lower) => {
    const p = new PixelCanvas(16, 16);
    p.rect(0, 0, 16, 16, R[2]);
    // Gesteinsschichten mit schrägen Brüchen, Licht von oben links
    for (let y = 0; y < 16; y += rng.int(3, 5)) {
      const off = rng.int(-2, 2);
      for (let x = 0; x < 16; x++) {
        const yy = y + Math.round(Math.sin((x + off) * 0.5) * 0.8);
        p.px(x, yy, R[1]);
        if (rng.chance(0.55)) p.px(x, yy + 1, R[3]);
        if (rng.chance(0.18)) p.px(x, yy + 2, R[4]);
      }
    }
    for (let i = 0; i < 12; i++) p.px(rng.int(0, 15), rng.int(0, 15), rng.pick([R[1], R[3], R[4]]));
    // senkrechte Spalte
    if (rng.chance(0.5)) { const x = rng.int(2, 13); for (let y = rng.int(0, 6); y < 16; y++) if (rng.chance(0.8)) { p.px(x, y, R[0]); if (rng.chance(0.5)) p.px(x - 1, y, R[3]); } }
    if (lower) {
      p.ctx.fillStyle = 'rgba(5,4,10,0.45)'; p.ctx.fillRect(0, 12, 16, 4);
      p.ctx.fillStyle = 'rgba(5,4,10,0.2)'; p.ctx.fillRect(0, 9, 16, 3);
      for (let m = 0; m < 5; m++) p.px(rng.int(0, 15), rng.int(13, 15), rng.pick(G.slice(2, 5)));
    } else {
      // Überhang der Hochfläche an der Kante
      p.rect(0, 0, 16, 1, R[5] ?? R[4]);
      for (let x = 0; x < 16; x++) {
        const len = rng.int(0, 3);
        for (let y = 0; y < len; y++) p.px(x, y, E[4 - Math.min(2, y)]);
      }
    }
    return p.canvas;
  };
  const upper = [], lower = [];
  for (let i = 0; i < count; i++) { upper.push(make(false)); lower.push(make(true)); }
  // Plateau (Draufsicht): erhöhter Boden, etwas heller als die Ebene, mit Felsnasen
  const top = [];
  for (let i = 0; i < 4; i++) {
    const p = new PixelCanvas(16, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const n = hash2((x + i * 16) >> 1, y >> 1, 33) * 0.6 + hash2(x + i * 16, y, 34) * 0.4;
      p.px(x, y, n < 0.3 ? G[1] : n < 0.7 ? G[2] : n < 0.92 ? G[3] : G[4]);
    }
    // Felsnasen
    for (let k = 0; k < 2; k++) if (hash2(i, k, 35) < 0.6) {
      const cx = 3 + Math.floor(hash2(i, k, 36) * 10), cy = 3 + Math.floor(hash2(i, k, 37) * 10);
      p.px(cx, cy, R[4]); p.px(cx + 1, cy, R[3]); p.px(cx, cy + 1, R[2]); p.px(cx + 1, cy + 1, R[1]);
    }
    top.push(p.canvas);
  }
  return { upper, lower, top };
}

// ------------------------------------------------------------ Vegetation
export function createPine(seed) {
  const rng = createRng(seed);
  const Pn = OUT.pine, B = OUT.bark;
  const w = 30, h = 46;
  return buildFrame(w, h, 15, 44, (p) => {
    // Stamm
    p.rect(13, 34, 4, 11, B[1]);
    p.rect(13, 34, 1, 11, B[2]);
    p.rect(16, 34, 1, 11, B[0]);
    p.px(12, 44, B[1]); p.px(17, 44, B[0]);
    // Etagen von unten nach oben
    const tiers = 5;
    for (let t = 0; t < tiers; t++) {
      const baseY = 38 - t * 7.2;
      const half = 13 - t * 2.3;
      const height = 11;
      for (let dy = 0; dy < height; dy++) {
        const y = Math.round(baseY - dy);
        const k = dy / height;
        const hw = Math.max(0, half * (1 - k) + rng.range(-0.8, 0.8));
        for (let x = Math.round(15 - hw); x <= Math.round(15 + hw); x++) {
          const rel = (x - 15) / Math.max(1, hw);
          let i = 2 + (rel < -0.2 ? 1 : 0) + (rel > 0.4 ? -1 : 0) + (dy < 2 ? -1 : 0);
          if (rng.chance(0.12)) i += rng.chance(0.5) ? 1 : -1;
          p.px(x, y, Pn[Math.max(0, Math.min(5, i))]);
        }
        // hängende Zweigspitzen
        if (dy === 0) for (let x = Math.round(15 - hw); x <= Math.round(15 + hw); x += 2) if (rng.chance(0.6)) p.px(x, y + 1, Pn[1]);
      }
      // Mondlicht-Kante links oben
      for (let dy = 2; dy < height - 1; dy++) {
        const y = Math.round(baseY - dy);
        const hw = half * (1 - dy / height);
        if (rng.chance(0.7)) p.px(Math.round(15 - hw) + 1, y, Pn[4]);
      }
    }
    p.px(15, 2, Pn[3]); p.px(15, 1, Pn[4]);
  });
}

export function createDeadTree(seed) {
  const rng = createRng(seed);
  const B = OUT.bark;
  return buildFrame(34, 40, 17, 38, (p) => {
    const branch = (x, y, a, len, th, depth) => {
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      for (let i = 0; i < th; i++) p.line(x + i, y, x2 + i * 0.5, y2, i === 0 ? B[3] : B[1]);
      if (depth <= 0 || len < 3) return;
      const n = rng.int(1, 2);
      for (let k = 0; k < n; k++) branch(x2, y2, a + rng.range(-0.8, 0.8), len * rng.range(0.55, 0.75), Math.max(1, th - 1), depth - 1);
    };
    // Wurzeln
    p.line(14, 38, 10, 39, B[1]); p.line(19, 38, 23, 39, B[1]);
    p.rect(15, 26, 4, 13, B[1]); p.rect(15, 26, 1, 13, B[3]); p.rect(18, 26, 1, 13, B[0]);
    branch(16, 27, -Math.PI / 2 + rng.range(-0.2, 0.2), 10, 3, 4);
    branch(16, 30, -Math.PI / 2 - 0.9, 8, 2, 3);
    branch(17, 29, -Math.PI / 2 + 0.9, 8, 2, 3);
    // Astloch
    p.px(16, 32, '#07050a'); p.px(16, 33, '#07050a');
  });
}

export function createRock(seed) {
  const rng = createRng(seed);
  const R = OUT.rock;
  const w = rng.int(12, 16), h = rng.int(9, 11);
  return buildFrame(w + 2, h + 2, (w + 2) / 2, h, (p) => {
    const cx = (w + 1) / 2, cy = h / 2 + 1;
    p.ellipse(cx, cy, w / 2, h / 2, R[2]);
    p.ellipse(cx - 1, cy - 1, w / 2 - 2, h / 2 - 2, R[3]);
    p.ellipse(cx - 2, cy - 2, w / 4, h / 4, R[4]);
    p.rect(1, h - 1, w, 1, R[1]);
    for (let i = 0; i < 4; i++) p.px(cx + rng.int(-4, 4), cy + rng.int(-2, 2), R[1]);
    for (let i = 0; i < 3; i++) p.px(cx + rng.int(-4, 4), cy - h / 2 + 1 + rng.int(0, 1), OUT.grass[3]);
  });
}

export function createBush(seed) {
  const rng = createRng(seed);
  const G = OUT.pine;
  return buildFrame(16, 12, 8, 11, (p) => {
    for (let i = 0; i < 6; i++) p.ellipse(4 + rng.int(0, 8), 5 + rng.int(0, 3), rng.int(3, 4), 3, G[rng.int(1, 3)]);
    for (let i = 0; i < 10; i++) p.px(rng.int(2, 13), rng.int(2, 8), G[4]);
    if (rng.chance(0.6)) for (let i = 0; i < 3; i++) p.px(rng.int(3, 12), rng.int(4, 9), PAL.crimson[3]);
  });
}

// Grasbüschel, Blumen, Pilze – werden in den Boden gestempelt
export function createTufts() {
  const out = [];
  const G = OUT.grass;
  for (let s = 0; s < 6; s++) {
    const rng = createRng(90 + s);
    const p = new PixelCanvas(7, 5);
    for (let i = 0; i < 4; i++) {
      const x = rng.int(0, 6), hh = rng.int(2, 4);
      for (let y = 0; y < hh; y++) p.px(x + (y === hh - 1 && rng.chance(0.5) ? 1 : 0), 4 - y, G[3 + (y > 1 ? 1 : 0) + (rng.chance(0.3) ? 1 : 0)]);
    }
    out.push(p.canvas);
  }
  const flower = (c1, c2) => { const p = new PixelCanvas(3, 3); p.px(1, 0, c1); p.px(0, 1, c1); p.px(2, 1, c1); p.px(1, 1, c2); p.px(1, 2, G[3]); return p.canvas; };
  out.push(flower('#6a5aa0', '#e8c25a'), flower('#9a4a6a', '#f0e0a0'));
  const shroom = new PixelCanvas(3, 3); shroom.rect(0, 0, 3, 1, '#7a2a2a'); shroom.px(1, 0, '#c86a5a'); shroom.px(1, 1, '#bcae8e'); shroom.px(1, 2, '#80755c');
  out.push(shroom.canvas);
  return out;
}

// ------------------------------------------------------------ Dorf
export function createFence(vertical = false) {
  const W = OUT.wood;
  if (vertical) {
    return buildFrame(6, 22, 3, 20, (p) => {
      p.rect(2, 0, 3, 21, W[2]); p.rect(2, 0, 1, 21, W[3]); p.px(3, 0, W[4]);
      p.rect(1, 6, 4, 1, W[1]); p.rect(1, 13, 4, 1, W[1]);
    });
  }
  return buildFrame(16, 14, 8, 13, (p) => {
    p.rect(1, 1, 3, 13, W[2]); p.rect(1, 1, 1, 13, W[3]); p.px(2, 0, W[3]);
    p.rect(0, 4, 16, 2, W[3]); p.rect(0, 5, 16, 1, W[1]);
    p.rect(0, 9, 16, 2, W[2]); p.rect(0, 10, 16, 1, W[1]);
    p.px(9, 4, W[4]); p.px(12, 9, W[3]);
  });
}

export function createGrave(seed) {
  const rng = createRng(seed);
  const S = PAL.stone;
  const cross = rng.chance(0.35);
  return buildFrame(12, 16, 6, 15, (p) => {
    p.ellipse(6, 14, 5, 1.5, '#0c0a12');
    if (cross) {
      p.rect(5, 1, 3, 13, S[3]); p.rect(2, 4, 9, 3, S[3]);
      p.rect(5, 1, 1, 13, S[4]); p.rect(2, 4, 9, 1, S[4]);
      p.rect(7, 2, 1, 12, S[2]);
    } else {
      p.rect(2, 3, 8, 11, S[3]); p.rect(3, 2, 6, 1, S[3]); p.rect(4, 1, 4, 1, S[3]);
      p.rect(2, 3, 1, 11, S[4]); p.rect(3, 2, 2, 1, S[4]);
      p.rect(9, 3, 1, 11, S[2]);
      p.rect(4, 6, 4, 1, S[2]); p.rect(4, 8, 3, 1, S[2]);
    }
    for (let i = 0; i < 4; i++) p.px(rng.int(2, 9), rng.int(10, 13), PAL.moss[rng.int(1, 2)]);
    if (rng.chance(0.5)) { p.px(8, 5, PAL.mortar); p.px(7, 6, PAL.mortar); }
  });
}

export function createLamp() {
  const I = PAL.steel;
  return buildFrame(9, 28, 4, 27, (p) => {
    p.rect(2, 25, 5, 2, I[1]);
    p.rect(3, 6, 2, 20, I[1]); p.rect(3, 6, 1, 20, I[2]);
    p.rect(1, 4, 7, 1, I[2]); p.rect(2, 0, 5, 1, I[2]);
    p.rect(2, 1, 5, 4, '#3a2410');
    p.rect(3, 1, 3, 3, PAL.ember[3]); p.px(4, 2, PAL.ember[5]);
  });
}

export function createLampGlow() {
  const p = new PixelCanvas(9, 28);
  p.rect(3, 2, 3, 3, PAL.ember[4]); p.px(4, 3, PAL.ember[5]);
  return p.canvas;
}

export function createCampfire() {
  const S = PAL.stone, W = OUT.wood;
  return buildFrame(20, 10, 10, 8, (p) => {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const x = 10 + Math.cos(a) * 8, y = 5 + Math.sin(a) * 3.5;
      p.ellipse(x, y, 1.6, 1.2, i < 4 ? S[2] : S[3]);
    }
    p.line(5, 6, 14, 4, W[2]); p.line(6, 3, 14, 7, W[3]);
    p.rect(8, 4, 5, 2, PAL.ember[1]); p.px(10, 4, PAL.ember[3]);
  });
}

export function createWell() {
  const S = PAL.stone, W = OUT.wood;
  return buildFrame(24, 34, 12, 32, (p) => {
    // Dach
    p.rect(3, 0, 18, 3, OUT.slate[2]); p.rect(3, 0, 18, 1, OUT.slate[3]); p.rect(1, 3, 22, 2, OUT.slate[1]);
    p.rect(4, 5, 2, 17, W[2]); p.rect(18, 5, 2, 17, W[1]);
    p.rect(6, 8, 12, 1, W[3]); p.rect(11, 9, 2, 4, W[1]); p.rect(10, 12, 4, 3, W[2]);
    // Brunnenring
    p.ellipse(12, 22, 11, 4, S[2]);
    p.ellipse(12, 22, 8, 2.5, '#05060c');
    p.rect(1, 22, 22, 9, S[2]);
    for (let r = 0; r < 3; r++) for (let x = (r % 2) * 3; x < 22; x += 6) { p.rect(1 + x, 23 + r * 3, 5, 2, S[3]); p.px(1 + x, 23 + r * 3, S[4]); }
    p.ellipse(12, 31, 11, 1.5, S[1]);
  });
}

export function createCrate(seed) {
  const W = OUT.wood;
  if (seed % 2) {
    return buildFrame(12, 14, 6, 13, (p) => {
      p.rect(1, 1, 10, 13, W[2]); p.rect(0, 3, 12, 9, W[2]);
      p.rect(1, 1, 3, 13, W[3]); p.rect(9, 2, 2, 12, W[1]);
      p.rect(0, 4, 12, 1, PAL.steel[1]); p.rect(0, 10, 12, 1, PAL.steel[1]);
      p.ellipse(6, 1.5, 4.5, 1.2, W[4]);
    });
  }
  return buildFrame(14, 14, 7, 13, (p) => {
    p.rect(0, 2, 14, 12, W[2]); p.rect(0, 0, 14, 3, W[3]);
    p.rect(0, 2, 14, 1, W[1]); p.rect(0, 13, 14, 1, W[1]);
    p.line(1, 3, 12, 12, W[3]); p.line(1, 12, 12, 3, W[1]);
    p.rect(0, 2, 1, 12, W[3]); p.rect(13, 2, 1, 12, W[1]);
  });
}

export function createSign() {
  const W = OUT.wood;
  return buildFrame(20, 22, 7, 21, (p) => {
    p.rect(6, 4, 2, 18, W[2]); p.rect(6, 4, 1, 18, W[3]);
    p.rect(2, 4, 15, 5, W[3]); p.px(17, 6, W[3]); p.rect(16, 5, 2, 3, W[3]); p.px(18, 6, W[3]);
    p.rect(2, 8, 15, 1, W[1]);
    p.rect(4, 6, 10, 1, W[1]); // eingeritzte Schrift
    p.rect(3, 11, 11, 4, W[2]); p.rect(1, 12, 2, 2, W[2]); p.rect(3, 14, 11, 1, W[1]);
    p.rect(5, 12, 7, 1, W[1]);
  });
}

// ------------------------------------------------------------ Gebäude
// Fachwerkhaus in 3/4-Ansicht. footprint w×h Tiles; das Sprite reicht mit dem
// Dach über die Grundfläche hinaus nach oben.
function drawHouse(p, W, H, opts) {
  const { wallH = 30, roofH = 30, doorX = 0.5, windows = [0.22, 0.78], chimney = 0.8, smithy = false } = opts;
  const Wd = OUT.wood, Pl = OUT.plaster, Sl = OUT.slate, S = PAL.stone;
  const bottom = H - 1;
  const wallTop = bottom - wallH;
  const x0 = 2, x1 = W - 3;
  // Sockel
  p.rect(x0, bottom - 4, x1 - x0 + 1, 5, S[2]);
  for (let x = x0; x < x1; x += 5) { p.rect(x, bottom - 4, 4, 2, S[3]); p.px(x, bottom - 4, S[4]); }
  // Wand
  if (!smithy) {
    p.rect(x0, wallTop, x1 - x0 + 1, wallH - 4, Pl[1]);
    for (let i = 0; i < 40; i++) p.px(x0 + ((i * 37) % (x1 - x0)), wallTop + ((i * 13) % (wallH - 5)), Pl[i % 3 === 0 ? 2 : 0]);
    // Fachwerk
    for (let x = x0; x <= x1; x += 14) p.rect(x, wallTop, 2, wallH - 4, Wd[2]);
    p.rect(x0, wallTop, x1 - x0 + 1, 2, Wd[3]);
    p.rect(x0, wallTop + Math.floor(wallH / 2) - 2, x1 - x0 + 1, 2, Wd[2]);
    for (let x = x0; x + 14 <= x1; x += 28) p.line(x + 2, wallTop + wallH - 5, x + 13, wallTop + 2, Wd[1]);
    // Fenster (Glas glüht separat)
    for (const f of windows) {
      const wx = Math.round(x0 + (x1 - x0) * f) - 4;
      p.rect(wx - 1, wallTop + 6, 10, 10, Wd[1]);
      p.rect(wx, wallTop + 7, 8, 8, '#3a1c0c');
      p.rect(wx + 3, wallTop + 7, 1, 8, Wd[1]); p.rect(wx, wallTop + 10, 8, 1, Wd[1]);
      p.rect(wx - 1, wallTop + 16, 10, 1, Wd[3]);
    }
    // Tür
    const dx = Math.round(x0 + (x1 - x0) * doorX) - 5;
    p.rect(dx - 1, bottom - 20, 12, 17, Wd[1]);
    p.rect(dx, bottom - 19, 10, 16, Wd[2]);
    for (let x = dx + 2; x < dx + 10; x += 3) p.rect(x, bottom - 19, 1, 16, Wd[1]);
    p.px(dx + 8, bottom - 11, PAL.gold[3]);
    p.rect(dx - 2, bottom - 3, 14, 3, S[3]); p.rect(dx - 2, bottom - 3, 14, 1, S[4]);
  } else {
    // Schmiede: offene Front mit Esse
    p.rect(x0, wallTop, x1 - x0 + 1, wallH - 4, '#120d10');
    p.rect(x0 + 2, wallTop + 2, x1 - x0 - 3, 6, '#1a1216');
    // Esse (Steinblock mit Glut)
    const ex = x0 + 6;
    p.rect(ex, bottom - 20, 22, 16, S[2]); p.rect(ex, bottom - 20, 22, 2, S[4]); p.rect(ex, bottom - 20, 2, 16, S[3]);
    p.rect(ex + 4, bottom - 18, 14, 4, '#2a0a04'); p.rect(ex + 5, bottom - 17, 12, 2, PAL.ember[2]);
    p.rect(ex + 8, wallTop, 6, bottom - 20 - wallTop, S[1]); // Rauchfang
    // Werkzeug an der Rückwand
    p.line(x1 - 20, wallTop + 6, x1 - 20, wallTop + 14, PAL.steel[3]); p.rect(x1 - 22, wallTop + 5, 5, 2, PAL.steel[2]);
    p.line(x1 - 12, wallTop + 6, x1 - 14, wallTop + 15, PAL.steel[3]);
    // Pfosten
    for (const x of [x0, Math.round((x0 + x1) / 2), x1 - 2]) { p.rect(x, wallTop, 3, wallH - 4, Wd[2]); p.rect(x, wallTop, 1, wallH - 4, Wd[3]); }
    p.rect(x0, wallTop, x1 - x0 + 1, 3, Wd[3]);
  }
  // Dach (Schiefer, Schindelreihen), Traufe wirft Schatten
  const roofBottom = wallTop + 1, roofTop = roofBottom - roofH;
  for (let y = roofTop; y <= roofBottom; y++) {
    const k = (y - roofTop) / roofH;
    const inset = Math.round((1 - k) * 6);
    const row = Math.floor((y - roofTop) / 4);
    for (let x = x0 - 2 + inset; x <= x1 + 2 - inset; x++) {
      const lx = (x + (row % 2) * 3) % 6;
      let c = Sl[2];
      if ((y - roofTop) % 4 === 3) c = Sl[0];
      else if (lx === 0) c = Sl[1];
      else if ((y - roofTop) % 4 === 0) c = Sl[3];
      if (x < x0 + 4 + inset) c = Sl[Math.min(4, Sl.indexOf(c) + 1)];
      if (hash2(x, y, 44) < 0.05) c = Sl[0];
      p.px(x, y, c);
    }
  }
  p.rect(x0 - 2, roofBottom, x1 - x0 + 5, 2, Sl[0]);
  // First
  p.rect(x0 + 4, roofTop, x1 - x0 - 7, 2, Wd[2]);
  p.rect(x0 + 4, roofTop, x1 - x0 - 7, 1, Wd[3]);
  // Schornstein
  if (chimney != null) {
    const cx = Math.round(x0 + (x1 - x0) * chimney);
    p.rect(cx, roofTop - 8, 7, 14, S[2]); p.rect(cx, roofTop - 8, 7, 2, S[4]); p.rect(cx, roofTop - 8, 2, 14, S[3]);
    p.rect(cx + 1, roofTop - 8, 5, 1, '#07050a');
  }
}

export function createBuilding(kind, wTiles, hTiles) {
  const W = wTiles * 16 + 6;
  const wallH = kind === 'smithy' ? 32 : 30;
  const roofH = hTiles * 16 + (kind === 'hall' ? 18 : 12);
  const H = wallH + roofH + 10;
  const opts = kind === 'hall'
    ? { wallH, roofH, doorX: 0.5, windows: [0.2, 0.8], chimney: 0.72 }
    : { wallH, roofH, smithy: true, chimney: 0.28 };
  const sprite = buildFrame(W, H, W / 2, H - 1, (p) => drawHouse(p, W, H, opts));
  // Leuchtende Fenster/Glut als eigene Ebene (Emissive-Pass)
  const glow = new PixelCanvas(W + 2, H + 2);
  const x0 = 2, x1 = W - 3, bottom = H - 1, wallTop = bottom - wallH;
  if (kind === 'hall') {
    for (const f of opts.windows) {
      const wx = Math.round(x0 + (x1 - x0) * f) - 4 + 1;
      glow.rect(wx, wallTop + 8, 3, 3, PAL.ember[4]); glow.rect(wx + 4, wallTop + 8, 4, 3, PAL.ember[3]);
      glow.rect(wx, wallTop + 12, 3, 3, PAL.ember[3]); glow.rect(wx + 4, wallTop + 12, 4, 3, PAL.ember[4]);
    }
  } else {
    glow.rect(x0 + 6 + 6, bottom - 16, 12, 2, PAL.ember[4]); glow.px(x0 + 6 + 9, bottom - 16, PAL.ember[5]);
  }
  const chimneyX = Math.round(x0 + (x1 - x0) * opts.chimney) + 3 + 1;
  return { sprite, glow: glow.canvas, chimney: { x: chimneyX - W / 2 - 1, y: -(H - 1) + (wallTop + 1 - roofH) - 8 }, forge: kind === 'smithy' ? { x: x0 + 17 - W / 2, y: -16 } : null, height: H, width: W };
}

// Katakomben-Eingang in der Klippe: Bogen mit Schädel-Schlussstein.
export function createCryptGate() {
  const S = PAL.stone, Bn = PAL.bone;
  const W = 56, H = 50;
  const sprite = buildFrame(W, H, W / 2, H - 1, (p) => {
    // Rahmen
    p.rect(4, 12, 48, 38, S[2]);
    p.ellipse(28, 16, 24, 14, S[2]);
    // Quader
    for (let y = 16; y < 48; y += 5) for (let x = 4 + ((y / 5) % 2) * 4; x < 52; x += 8) { p.rect(x, y, 7, 4, S[3]); p.px(x, y, S[4]); }
    // Öffnung
    p.rect(14, 20, 28, 30, '#030205');
    p.ellipse(28, 21, 14, 9, '#030205');
    for (let y = 24; y < 50; y++) { const a = (y - 24) / 26; p.ctx.fillStyle = `rgba(40,20,70,${0.25 * a})`; p.ctx.fillRect(14, y, 28, 1); }
    // Stufen
    p.rect(12, 46, 32, 2, S[3]); p.rect(10, 48, 36, 2, S[2]); p.rect(12, 46, 32, 1, S[4]);
    // Säulen
    for (const x of [8, 44]) { p.rect(x, 18, 5, 30, S[3]); p.rect(x, 18, 1, 30, S[4]); p.rect(x - 1, 16, 7, 3, S[4]); }
    // Schädel-Schlussstein
    p.rect(24, 4, 9, 8, Bn[3]); p.rect(25, 3, 7, 1, Bn[3]); p.rect(25, 12, 7, 2, Bn[2]);
    p.rect(25, 6, 2, 3, '#140808'); p.rect(30, 6, 2, 3, '#140808'); p.px(28, 9, '#140808');
    p.px(26, 12, '#140808'); p.px(28, 12, '#140808'); p.px(30, 12, '#140808');
    p.rect(25, 4, 2, 1, Bn[4]);
    // Runen im Bogen
    for (let i = 0; i < 7; i++) { const a = Math.PI + (i + 0.5) * (Math.PI / 7); p.px(28 + Math.cos(a) * 18, 18 + Math.sin(a) * 11, '#2e2040'); }
  });
  const glow = new PixelCanvas(W + 2, H + 2);
  glow.px(27, 8, PAL.magic[3]); glow.px(32, 8, PAL.magic[3]);
  for (let i = 0; i < 7; i++) { const a = Math.PI + (i + 0.5) * (Math.PI / 7); glow.px(29 + Math.cos(a) * 18, 19 + Math.sin(a) * 11, PAL.magic[3]); }
  return { sprite, glow: glow.canvas };
}

// Glutspalte: Riss im Boden, Kern wird im Emissive-Pass nachgezeichnet
export const FISSURE = { crust: ['#0a0506', '#140808', '#24100a'], core: PAL.ember };

// Alle Außen-Grafiken gebündelt (einmal beim Start erzeugt).
export function createOutdoorSprites() {
  return {
    cliff: createCliffTiles(),
    tufts: createTufts(),
    pines: [3, 7, 11, 19].map(createPine),
    deadTrees: [5, 9, 13].map(createDeadTree),
    rocks: [2, 4, 6, 8].map(createRock),
    bushes: [1, 2, 3].map(createBush),
    fenceH: createFence(false),
    fenceV: createFence(true),
    graves: [1, 2, 3, 4].map(createGrave),
    lamp: createLamp(),
    lampGlow: createLampGlow(),
    campfire: createCampfire(),
    well: createWell(),
    crates: [0, 1].map(createCrate),
    sign: createSign(),
    buildings: { hall: createHall(), smithy: createBuilding('smithy', 6, 3) },
    cryptGate: createCryptGate(),
  };
}
