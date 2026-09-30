import { PAL } from '../gfx/Palette.js';
import { PixelCanvas, outlineCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame, Animation } from '../gfx/Sprite.js';
import { createRng } from '../core/math.js';

const S = PAL.stone, E = PAL.ember, B = PAL.bone;

// Flammen: prozedural pro Frame, damit sie lebendig flackern.
export function createFlameFrames(w, h, count, seed) {
  const rng = createRng(seed);
  const frames = [];
  for (let f = 0; f < count; f++) {
    const p = new PixelCanvas(w, h);
    const cx = (w - 1) / 2;
    for (let y = 0; y < h; y++) {
      const t = y / (h - 1); // 0 oben .. 1 unten
      const sway = Math.sin(f * 1.3 + y * 0.6) * (1 - t) * 1.3;
      const half = Math.max(0, (w / 2) * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.62) - rng.range(0, 0.7));
      for (let x = 0; x < w; x++) {
        const d = Math.abs(x - cx - sway) / Math.max(half, 0.01);
        if (d > 1 || half < 0.4) continue;
        const heat = (1 - d) * 0.65 + t * 0.55 + rng.range(-0.12, 0.12);
        const idx = heat > 1.0 ? 5 : heat > 0.82 ? 4 : heat > 0.62 ? 3 : heat > 0.42 ? 2 : 1;
        p.px(x, y, E[idx]);
      }
    }
    frames.push(p.canvas);
  }
  return frames;
}

export function createTorchBracket() {
  return buildFrame(7, 11, 3, 0, (p) => {
    // Holzgriff mit Wicklung, eiserne Halterung mit Nieten
    p.rect(2, 2, 3, 7, PAL.leather[2]);
    p.rect(2, 2, 1, 7, PAL.leather[3]);
    p.px(4, 4, PAL.leather[1]); p.px(4, 6, PAL.leather[1]);
    p.rect(2, 3, 3, 1, '#6a5a48'); p.rect(2, 5, 3, 1, '#6a5a48');
    p.rect(1, 1, 5, 2, PAL.steel[2]);
    p.rect(1, 1, 5, 1, PAL.steel[3]); p.px(1, 1, PAL.steel[4]);
    p.rect(3, 9, 1, 2, PAL.steel[1]); p.rect(2, 10, 3, 1, PAL.steel[2]);
    p.rect(1, 0, 5, 1, '#1a0a05'); p.px(2, 0, PAL.ember[1]); p.px(4, 0, PAL.ember[2]);
  });
}

export function createBrazier() {
  return buildFrame(18, 20, 9, 18, (p) => {
    const S = PAL.steel;
    // Dreibein mit Klauenfüßen
    p.line(4, 11, 2, 18, S[1]); p.line(5, 11, 3, 18, S[2]);
    p.line(13, 11, 15, 18, S[1]); p.line(12, 11, 14, 18, S[2]);
    p.line(9, 12, 9, 18, S[2]); p.px(9, 13, S[3]);
    p.rect(1, 18, 3, 1, S[2]); p.rect(14, 18, 3, 1, S[2]); p.rect(8, 18, 3, 1, S[3]);
    // Schale: gehämmertes Eisen mit Randwulst
    p.rect(1, 5, 16, 6, S[2]);
    p.rect(2, 11, 14, 1, S[1]);
    p.rect(1, 5, 16, 1, S[4]); p.rect(1, 6, 16, 1, S[3]);
    p.rect(2, 7, 3, 3, S[3]); p.px(3, 7, S[5]);
    for (let x = 5; x < 16; x += 3) p.px(x, 8, S[1]);
    p.rect(14, 7, 2, 3, S[1]);
    // Glut mit Kohlen
    p.rect(2, 3, 14, 2, PAL.ember[1]);
    p.rect(4, 3, 10, 1, PAL.ember[2]);
    p.px(6, 3, PAL.ember[3]); p.px(9, 4, PAL.ember[4]); p.px(12, 3, PAL.ember[3]);
    p.px(5, 4, '#1a0a05'); p.px(11, 4, '#1a0a05');
    // Glutschein auf dem Metall
    p.px(8, 6, PAL.gold[2]); p.px(11, 6, PAL.gold[2]); p.px(6, 6, PAL.ember[2]);
  });
}

export function createPillar() {
  return buildFrame(18, 46, 9, 44, (p) => {
    // Basis (zwei Stufen)
    p.rect(0, 38, 18, 7, S[2]);
    p.rect(0, 38, 18, 1, S[4]); p.rect(0, 39, 18, 1, S[3]);
    p.rect(0, 40, 2, 5, S[1]); p.rect(16, 40, 2, 5, S[3]);
    p.rect(1, 44, 16, 1, S[0]);
    p.rect(1, 35, 16, 3, S[2]); p.rect(1, 35, 16, 1, S[4]); p.rect(15, 36, 2, 2, S[3]);
    // Schaft mit Kanneluren, gerundet schattiert
    p.rect(3, 7, 12, 28, S[2]);
    p.rect(3, 7, 2, 28, S[1]); p.rect(5, 7, 1, 28, S[2]);
    p.rect(12, 7, 3, 28, S[3]); p.rect(13, 8, 1, 26, S[4]);
    for (let x = 6; x < 12; x += 2) { p.rect(x, 8, 1, 26, S[1]); p.rect(x + 1, 8, 1, 26, x > 8 ? S[3] : S[2]); }
    // Abplatzer, Risse, Moos am Fuß
    p.px(8, 15, PAL.mortar); p.px(9, 16, PAL.mortar); p.px(9, 17, PAL.mortar); p.px(10, 18, PAL.mortar); p.px(10, 19, S[4]);
    p.rect(12, 24, 2, 2, S[1]); p.px(12, 24, PAL.mortar);
    p.px(4, 32, PAL.moss[1]); p.px(5, 33, PAL.moss[2]); p.px(4, 34, PAL.moss[1]); p.px(13, 33, PAL.moss[1]); p.px(3, 36, PAL.moss[2]);
    // Kapitell mit Profil
    p.rect(0, 0, 18, 7, S[2]);
    p.rect(0, 0, 18, 1, S[4]); p.rect(0, 1, 18, 1, S[3]);
    p.rect(1, 4, 16, 1, S[1]); p.rect(2, 5, 14, 2, S[2]); p.rect(2, 6, 14, 1, S[1]);
    p.rect(15, 1, 2, 3, S[3]); p.rect(0, 2, 2, 2, S[1]);
  });
}

export function createCandles() {
  return buildFrame(12, 9, 6, 8, (p) => {
    p.ellipse(6, 7, 5, 1.5, '#2a2230');
    // Wachslachen
    p.rect(1, 7, 4, 1, B[2]); p.rect(7, 7, 4, 1, B[2]);
    p.rect(2, 3, 2, 5, B[3]); p.rect(2, 3, 1, 5, B[4]); p.px(3, 7, B[1]);
    p.rect(5, 1, 2, 7, B[3]); p.rect(5, 1, 1, 7, B[4]); p.px(6, 4, B[2]); p.px(4, 5, B[3]);
    p.rect(8, 4, 2, 4, B[2]); p.rect(8, 4, 1, 4, B[3]); p.px(10, 6, B[3]);
    p.px(2, 3, '#2a1a10'); p.px(5, 1, '#2a1a10'); p.px(8, 4, '#2a1a10');
  });
}

export function createBonePile(seed) {
  const rng = createRng(seed);
  return buildFrame(16, 9, 8, 8, (p) => {
    for (let i = 0; i < 5; i++) {
      const x = rng.int(1, 11), y = rng.int(4, 7);
      p.line(x, y, x + rng.int(3, 5), y + rng.int(-1, 1), rng.pick([B[2], B[3]]));
    }
    // Schädel
    const sx = rng.int(4, 8);
    p.rect(sx, 2, 5, 4, B[3]); p.rect(sx + 1, 1, 3, 1, B[3]);
    p.rect(sx + 1, 3, 1, 1, '#140808'); p.rect(sx + 3, 3, 1, 1, '#140808');
    p.px(sx + 1, 2, B[4]);
  });
}

export function createBanner(seed = 3) {
  const rng = createRng(seed);
  const C = PAL.crimson;
  return buildFrame(10, 22, 5, 0, (p) => {
    p.rect(0, 0, 10, 1, PAL.gold[2]);
    p.rect(1, 1, 8, 16, C[2]);
    p.rect(1, 1, 2, 16, C[1]);
    p.rect(7, 1, 2, 16, C[3]);
    // Zackiger Rand
    for (let x = 1; x < 9; x++) p.rect(x, 17, 1, rng.int(0, 4), x % 2 ? C[2] : C[1]);
    // Emblem: stilisierte Flamme
    p.px(5, 5, PAL.gold[3]); p.rect(4, 6, 3, 2, PAL.gold[3]); p.rect(4, 8, 3, 2, PAL.gold[2]);
    p.px(3, 7, PAL.gold[2]); p.px(7, 7, PAL.gold[2]); p.rect(3, 10, 5, 1, PAL.gold[1]);
  }, { outline: true });
}

export function createChains() {
  return buildFrame(8, 16, 4, 0, (p) => {
    for (let y = 0; y < 14; y += 2) { p.px(2, y, PAL.steel[3]); p.px(2, y + 1, PAL.steel[1]); }
    for (let y = 0; y < 10; y += 2) { p.px(5, y, PAL.steel[2]); p.px(5, y + 1, PAL.steel[1]); }
    p.rect(1, 14, 3, 2, PAL.steel[2]);
  }, { outline: false });
}

export function createCobweb(flipX = false) {
  const p = new PixelCanvas(14, 14);
  const c = 'rgba(200,196,210,0.35)';
  for (let i = 0; i < 14; i++) { p.px(flipX ? 13 - i : i, 0, c); }
  for (let i = 0; i < 12; i++) { const k = i; p.px(flipX ? 13 - k : k, k, c); }
  for (let r = 3; r < 13; r += 4) {
    for (let a = 0; a <= r; a++) p.px(flipX ? 13 - a : a, Math.round(r - a * 0.9 > 0 ? (r - a) * 0.5 + a * 0.5 : 0), c);
  }
  return p.canvas;
}

// Runenkreis als Bodendekal (Grundform) + separates Glüh-Overlay.
export function createRuneCircle(r = 22) {
  const size = r * 2 + 3;
  const base = new PixelCanvas(size, size);
  const glow = new PixelCanvas(size, size);
  const c = r + 1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x - c, y - c);
    const a = Math.atan2(y - c, x - c);
    if (Math.abs(d - r) < 0.7 || Math.abs(d - (r - 4)) < 0.6) {
      base.px(x, y, '#241a33'); glow.px(x, y, PAL.magic[3]);
    }
    // Runen zwischen den Ringen
    const seg = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 12);
    if (d > r - 3.5 && d < r - 0.5 && seg % 2 === 0 && ((x * 7 + y * 3) % 5 === 0)) {
      base.px(x, y, '#2e2040'); glow.px(x, y, PAL.magic[4]);
    }
    // Pentagramm-artige Linien
    for (let k = 0; k < 5; k++) {
      const a1 = (k / 5) * Math.PI * 2 - Math.PI / 2, a2 = ((k + 2) / 5) * Math.PI * 2 - Math.PI / 2;
      const x1 = c + Math.cos(a1) * (r - 4), y1 = c + Math.sin(a1) * (r - 4);
      const x2 = c + Math.cos(a2) * (r - 4), y2 = c + Math.sin(a2) * (r - 4);
      const len = Math.hypot(x2 - x1, y2 - y1);
      const dd = Math.abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1) / len;
      const tt = ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / (len * len);
      if (dd < 0.5 && tt >= 0 && tt <= 1) { base.px(x, y, '#241a33'); glow.px(x, y, PAL.magic[2]); }
    }
  }
  return { base: base.canvas, glow: glow.canvas, r };
}

// --- Zusätzliche Dungeon-Objekte (Thread B kann sie platzieren) -------------
const WOOD = ['#1e120c', '#35221a', '#4f3322', '#6b4a30', '#8a6440'];

export function createBarrel() {
  return buildFrame(12, 15, 6, 14, (p) => {
    p.ellipse(6, 7, 5.5, 7, WOOD[2]);
    p.rect(1, 3, 2, 9, WOOD[1]); p.rect(9, 3, 2, 9, WOOD[3]);
    for (const x of [4, 7]) p.rect(x, 1, 1, 13, WOOD[1]);
    p.rect(10, 4, 1, 7, WOOD[4]);
    for (const y of [3, 11]) { p.rect(1, y, 10, 1, PAL.steel[1]); p.rect(2, y, 8, 1, PAL.steel[2]); p.px(9, y, PAL.steel[4]); }
    p.ellipse(6, 1, 4, 1, WOOD[3]); p.rect(3, 1, 6, 1, WOOD[4]);
  });
}
export function createCrate() {
  return buildFrame(14, 14, 7, 13, (p) => {
    p.rect(0, 3, 14, 11, WOOD[2]);
    p.rect(0, 0, 14, 4, WOOD[3]); p.rect(0, 0, 14, 1, WOOD[4]);
    for (const y of [5, 8, 11]) p.rect(1, y, 12, 1, WOOD[1]);
    p.line(1, 12, 12, 4, WOOD[3]); p.line(1, 13, 12, 5, WOOD[1]);
    p.rect(0, 3, 1, 11, WOOD[1]); p.rect(13, 3, 1, 11, WOOD[1]);
    for (const [x, y] of [[1, 4], [12, 4], [1, 12], [12, 12]]) p.px(x, y, PAL.steel[3]);
  });
}
export function createUrn(seed = 1) {
  const rng = createRng(seed);
  const tint = [PAL.rust, ['#1e1a2a', '#2e2840', '#463c5e', '#5e5478'], ['#1a2420', '#26382e', '#3a5242', '#567060']][seed % 3];
  rng.next();
  return buildFrame(10, 14, 5, 13, (p) => {
    p.ellipse(5, 8, 4.5, 5, tint[1]); p.ellipse(4, 7, 3, 3.5, tint[2]); p.px(3, 5, tint[3]);
    p.rect(3, 1, 4, 3, tint[1]); p.rect(2, 1, 6, 1, tint[2]);
    p.rect(1, 8, 8, 1, PAL.gold[1]); p.px(3, 8, PAL.gold[3]);
    p.rect(3, 12, 4, 1, tint[0]);
  });
}
export function createSarcophagus() {
  return buildFrame(30, 18, 15, 17, (p) => {
    p.rect(0, 6, 30, 12, S[1]); p.rect(0, 6, 30, 1, S[3]);
    p.rect(1, 1, 28, 7, S[3]); p.rect(1, 1, 28, 1, S[5]); p.rect(1, 7, 28, 1, S[1]);
    // Liegende Figur auf dem Deckel
    p.ellipse(6, 4, 2.5, 2, S[4]); p.rect(9, 3, 16, 3, S[4]); p.rect(9, 3, 16, 1, S[5]);
    p.rect(14, 2, 3, 1, S[4]); p.rect(25, 3, 3, 2, S[4]);
    for (let x = 3; x < 28; x += 4) p.rect(x, 10, 2, 5, S[0]);
    p.rect(0, 16, 30, 2, S[0]);
    p.px(20, 5, PAL.moss[2]); p.px(21, 5, PAL.moss[1]);
  });
}
// Truhe: [geschlossen, offen]
export function createChestFrames() {
  const G = PAL.gold;
  const body = (p) => {
    p.rect(0, 6, 16, 8, WOOD[2]); p.rect(0, 6, 16, 1, WOOD[3]); p.rect(0, 13, 16, 1, WOOD[0]);
    p.rect(2, 6, 2, 8, G[1]); p.rect(12, 6, 2, 8, G[1]); p.px(2, 7, G[3]); p.px(12, 7, G[3]);
  };
  return [
    buildFrame(16, 14, 8, 13, (p) => {
      body(p);
      p.rect(0, 1, 16, 6, WOOD[3]); p.rect(1, 0, 14, 1, WOOD[4]); p.rect(0, 6, 16, 1, WOOD[1]);
      p.rect(2, 0, 2, 7, G[2]); p.rect(12, 0, 2, 7, G[2]); p.px(2, 1, G[4]);
      p.rect(7, 5, 3, 4, G[2]); p.px(8, 7, '#1a0a05'); p.px(7, 5, G[4]);
    }),
    buildFrame(16, 16, 8, 15, (p) => {
      p.ctx.translate(0, 2); body(p); p.ctx.translate(0, -2);
      p.rect(0, 0, 16, 4, WOOD[1]); p.rect(1, 1, 14, 2, WOOD[0]);
      p.rect(2, 0, 2, 4, G[1]); p.rect(12, 0, 2, 4, G[1]);
      p.rect(2, 7, 12, 2, '#0e0806'); p.px(5, 7, G[4]); p.px(9, 8, G[3]); p.px(11, 7, G[4]);
    }),
  ];
}

export function createPropSprites() {
  return {
    torchFlame: createFlameFrames(5, 9, 6, 11),
    brazierFlame: createFlameFrames(11, 14, 6, 17),
    candleFlame: createFlameFrames(3, 4, 4, 23),
    torchBracket: createTorchBracket(),
    brazier: createBrazier(),
    pillar: createPillar(),
    candles: createCandles(),
    bonePiles: [1, 2, 3, 4].map((s) => createBonePile(s * 13)),
    banner: createBanner(),
    chains: createChains(),
    cobwebL: createCobweb(false),
    cobwebR: createCobweb(true),
    rune: createRuneCircle(22),
    barrel: createBarrel(),
    crate: createCrate(),
    urns: [0, 1, 2].map((k) => createUrn(k)),
    sarcophagus: createSarcophagus(),
    chest: createChestFrames(),
  };
}
