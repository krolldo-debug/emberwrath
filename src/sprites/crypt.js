import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame } from '../gfx/Sprite.js';
import { createRng } from '../core/math.js';

// Zusätzliche Katakomben-Objekte: Treppe, Netze, Kokons, Sarkophage,
// Knochenthron, Truhe, Knochentor.
const S = PAL.stone, Bn = PAL.bone, St = PAL.steel, G = PAL.gold, L = PAL.leather;

function createStairs() {
  const p = new PixelCanvas(32, 30);
  // Öffnung in der Wand, Stufen führen nach oben ins Dunkel
  p.rect(2, 0, 28, 30, '#07050c');
  for (let i = 0; i < 6; i++) {
    const y = 27 - i * 5, inset = i * 2;
    p.rect(3 + inset, y, 26 - inset * 2, 3, S[Math.max(1, 4 - Math.floor(i * 0.7))]);
    p.rect(3 + inset, y, 26 - inset * 2, 1, S[Math.max(2, 5 - Math.floor(i * 0.7))]);
    p.ctx.fillStyle = `rgba(7,5,12,${Math.min(0.9, i * 0.16)})`;
    p.ctx.fillRect(3 + inset, y, 26 - inset * 2, 3);
  }
  // Türrahmen
  p.rect(0, 0, 3, 30, S[3]); p.rect(29, 0, 3, 30, S[2]);
  p.rect(0, 0, 32, 3, S[3]); p.rect(0, 0, 32, 1, S[4]);
  p.px(1, 4, S[4]); p.px(30, 8, S[1]);
  return p.canvas;
}

function createWeb(seed) {
  const rng = createRng(seed);
  const p = new PixelCanvas(26, 22);
  const c = 'rgba(210,205,225,0.32)', c2 = 'rgba(210,205,225,0.18)';
  const cx = 13 + rng.int(-2, 2), cy = 11 + rng.int(-2, 2);
  const spokes = 7;
  const ends = [];
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const ex = cx + Math.cos(a) * 12, ey = cy + Math.sin(a) * 10;
    ends.push([a]);
    p.line(cx, cy, ex, ey, c);
  }
  for (let r = 3; r < 11; r += 2.5) {
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      if (rng.chance(0.2)) continue;
      p.px(cx + Math.cos(a) * r * 1.1, cy + Math.sin(a) * r * 0.9, c2);
    }
  }
  return p.canvas;
}

function createCocoon(seed) {
  const rng = createRng(seed);
  return buildFrame(12, 18, 6, 17, (p) => {
    p.line(6, 0, 6, 4, 'rgba(210,205,225,0.5)');
    p.ellipse(6, 10, 4.5, 7, '#b8b0c4');
    p.ellipse(5, 9, 3, 5.5, '#d8d2e0');
    for (let y = 4; y < 17; y += 2) p.line(2, y + rng.int(0, 1), 10, y + rng.int(-1, 1), '#8a8298');
    p.px(6, 8, '#5a3040'); p.px(5, 12, '#4a2030');
  });
}

function createSarcophagus(seed) {
  const rng = createRng(seed);
  return buildFrame(18, 32, 9, 31, (p) => {
    // Seitenwand + Deckel (3/4-Ansicht)
    p.rect(1, 6, 16, 25, S[2]);
    p.rect(1, 24, 16, 7, S[1]);
    p.rect(0, 2, 18, 22, S[3]);
    p.rect(0, 2, 18, 1, S[4]); p.rect(0, 2, 1, 22, S[4]);
    // Relief: liegende Figur
    p.ellipse(9, 6, 3, 2.5, S[4]); p.rect(6, 9, 6, 11, S[4]); p.rect(7, 9, 4, 11, S[3]);
    p.rect(8, 10, 2, 6, S[5]); p.px(9, 6, S[5]);
    p.line(5, 12, 8, 15, S[4]); p.line(13, 12, 10, 15, S[4]);
    // Risse und Moos
    for (let i = 0; i < 3; i++) p.px(rng.int(2, 15), rng.int(4, 22), PAL.mortar);
    for (let i = 0; i < 4; i++) p.px(rng.int(1, 16), rng.int(26, 30), PAL.moss[rng.int(0, 2)]);
    if (rng.chance(0.5)) { p.rect(12, 20, 5, 2, S[1]); p.px(13, 21, '#07050a'); }
  });
}

function createThrone() {
  return buildFrame(40, 48, 20, 46, (p) => {
    // Sockel
    p.rect(2, 38, 36, 8, S[2]); p.rect(2, 38, 36, 1, S[4]); p.rect(4, 44, 32, 2, S[1]);
    // Rückenlehne aus Knochen
    for (let i = 0; i < 9; i++) {
      const x = 5 + i * 3.6, top = 4 + Math.abs(i - 4) * 3;
      p.rect(x, top, 3, 36 - top, i % 2 ? Bn[2] : Bn[3]);
      p.rect(x, top, 1, 36 - top, Bn[4]);
      p.ellipse(x + 1.5, top, 2.5, 2, Bn[3]);
    }
    // Schädel oben
    for (const [x, y] of [[20, 3], [9, 10], [31, 10]]) {
      p.rect(x - 3, y - 2, 7, 6, Bn[3]); p.rect(x - 2, y, 2, 2, '#140808'); p.rect(x + 1, y, 2, 2, '#140808');
      p.rect(x - 2, y + 4, 5, 1, Bn[2]);
    }
    // Sitzfläche mit zerschlissenem Samt
    p.rect(6, 30, 28, 8, PAL.magic[1]); p.rect(6, 30, 28, 2, PAL.magic[2]);
    p.rect(3, 26, 5, 12, Bn[2]); p.rect(32, 26, 5, 12, Bn[2]);
    p.rect(3, 26, 5, 2, Bn[4]); p.rect(32, 26, 5, 2, Bn[4]);
  });
}

function createChest(open) {
  return buildFrame(16, 16, 8, 15, (p) => {
    p.ellipse(8, 14, 7, 1.5, '#07050a');
    // Korpus
    p.rect(1, 7, 14, 8, L[2]); p.rect(1, 7, 14, 1, L[3]);
    p.rect(1, 7, 1, 8, L[3]); p.rect(14, 7, 1, 8, L[1]);
    p.rect(1, 10, 14, 1, St[2]); p.rect(4, 7, 1, 8, St[2]); p.rect(11, 7, 1, 8, St[2]);
    if (!open) {
      p.rect(1, 3, 14, 5, L[3]); p.rect(2, 2, 12, 1, L[3]); p.rect(1, 3, 14, 1, PAL.leather[3]);
      p.rect(4, 2, 1, 6, St[3]); p.rect(11, 2, 1, 6, St[3]);
      p.rect(7, 6, 2, 3, G[3]); p.px(7, 6, G[4]);
    } else {
      // Deckel aufgeklappt, Inneres dunkel mit Goldschimmer
      p.rect(1, 0, 14, 4, L[1]); p.rect(1, 0, 14, 1, L[2]);
      p.rect(2, 5, 12, 3, '#0b0710'); p.px(5, 6, G[2]); p.px(9, 7, G[3]);
      p.rect(4, 0, 1, 4, St[2]); p.rect(11, 0, 1, 4, St[2]);
    }
  });
}

function createBoneGate() {
  const W = 66, H = 42;
  return buildFrame(W, H, W / 2, H - 1, (p) => {
    // Querbalken aus Eisen
    p.rect(0, 2, W, 4, St[1]); p.rect(0, 2, W, 1, St[3]);
    p.rect(0, H - 8, W, 3, St[1]);
    // Stäbe aus Knochen mit Spitzen
    for (let x = 3; x < W - 2; x += 6) {
      p.rect(x, 0, 3, H - 1, Bn[2]); p.rect(x, 0, 1, H - 1, Bn[3]);
      p.px(x + 1, 0, Bn[4]);
      p.rect(x - 1, 10 + ((x / 6) % 2) * 12, 5, 2, Bn[3]);
    }
    // Schädel in der Mitte
    p.rect(W / 2 - 5, 12, 10, 9, Bn[3]); p.rect(W / 2 - 3, 15, 2, 3, '#140808'); p.rect(W / 2 + 1, 15, 2, 3, '#140808');
    p.rect(W / 2 - 3, 21, 6, 2, Bn[2]);
  });
}

export function createCryptSprites() {
  return {
    stairs: createStairs(),
    webs: [1, 2, 3].map((s) => createWeb(s * 17)),
    cocoons: [1, 2].map((s) => createCocoon(s * 5)),
    sarcophagi: [1, 2, 3].map((s) => createSarcophagus(s * 11)),
    throne: createThrone(),
    chest: createChest(false),
    chestOpen: createChest(true),
    boneGate: createBoneGate(),
  };
}
