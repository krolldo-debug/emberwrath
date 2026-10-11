import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame } from '../gfx/Sprite.js';

// Rabenpost: eisenbeschlagener Briefkasten auf Steinsockel, Schindeldach, Siegel der Glutwaage unter dem Schlitz,
// Laterne am Haken (brennt, wenn Post wartet) und ein Rabe auf dem First. Anker = Fußpunkt.
const W = 28, H = 46, AX = 13, AY = 44;
const S = PAL.stone, G = PAL.gold, ST = PAL.steel, C = PAL.crimson, E = PAL.ember;
const WOOD = ['#1e130c', '#2e1e12', '#43301c', '#5a4228', '#735634'];
const SHINGLE = ['#1a0a10', '#2e1018', '#46161f', '#5e1e28'];
const RAVEN = ['#07050b', '#130e1c', '#221a32', '#3a3258', '#6a5e9a'];

function box(p) {
  const fy = AY;
  // Sockel aus zwei Steinlagen
  p.rect(6, fy - 3, 14, 4, S[1]); p.rect(6, fy - 3, 14, 1, S[3]); p.rect(6, fy - 2, 1, 3, S[2]); p.rect(19, fy - 2, 1, 3, S[0]);
  p.px(12, fy - 2, S[0]); p.px(13, fy - 1, S[0]); p.px(9, fy - 1, S[2]); p.px(16, fy - 2, S[2]);
  p.rect(8, fy - 5, 10, 2, S[2]); p.rect(8, fy - 5, 10, 1, S[4]); p.px(17, fy - 4, S[1]); p.px(11, fy - 4, S[1]);
  // Pfosten
  p.rect(11, fy - 18, 4, 13, WOOD[2]); p.rect(11, fy - 18, 1, 13, WOOD[3]); p.rect(14, fy - 18, 1, 13, WOOD[1]);
  p.px(12, fy - 12, WOOD[1]); p.px(13, fy - 9, WOOD[1]); p.px(12, fy - 7, WOOD[4]);
  // Stützen unter dem Kasten
  p.line(9, fy - 18, 11, fy - 15, WOOD[1]); p.line(16, fy - 18, 14, fy - 15, WOOD[1]);
  // Kasten: senkrechte Bohlen, Eisenbänder links/rechts und quer, Nieten
  p.rect(5, fy - 31, 16, 14, WOOD[2]);
  for (let x = 7; x < 20; x += 3) p.rect(x, fy - 30, 1, 12, WOOD[1]);
  p.rect(6, fy - 30, 1, 12, WOOD[3]); p.px(9, fy - 29, WOOD[3]); p.px(15, fy - 24, WOOD[3]);
  p.rect(5, fy - 31, 2, 14, ST[1]); p.rect(19, fy - 31, 2, 14, ST[1]); p.rect(5, fy - 31, 1, 14, ST[2]); p.rect(20, fy - 31, 1, 14, ST[0]);
  p.rect(5, fy - 18, 16, 1, ST[0]); p.rect(5, fy - 19, 16, 1, ST[2]);
  for (const y of [fy - 29, fy - 21]) { p.px(6, y, ST[4]); p.px(19, y, ST[3]); }
  // Einwurfschlitz mit Messinglippe
  p.rect(8, fy - 28, 10, 3, ST[1]); p.rect(9, fy - 27, 8, 1, '#06040a'); p.rect(8, fy - 28, 10, 1, G[2]); p.rect(8, fy - 25, 10, 1, G[1]);
  p.px(8, fy - 27, G[1]); p.px(17, fy - 27, G[1]);
  // Siegel der Glutwaage: rotes Wachs mit Goldprägung
  p.rect(11, fy - 23, 4, 4, C[3]); p.rect(12, fy - 24, 2, 6, C[3]); p.rect(10, fy - 22, 6, 2, C[3]);
  p.px(11, fy - 23, C[4]); p.px(12, fy - 24, C[4]); p.px(14, fy - 20, C[1]); p.px(15, fy - 21, C[2]); p.px(13, fy - 19, C[2]);
  p.px(12, fy - 22, G[3]); p.px(13, fy - 22, G[3]); p.px(12, fy - 21, G[2]); p.px(13, fy - 21, G[4]);
  // Dach: Schindeln, ein Pixel Überstand, Firstbalken
  for (let i = 0; i < 5; i++) {
    const w = 20 - i * 4, x = 3 + i * 2, y = fy - 32 - i;
    p.rect(x, y, w, 1, SHINGLE[i === 0 ? 1 : 2]);
    for (let k = x + (i & 1); k < x + w; k += 3) p.px(k, y, SHINGLE[i === 0 ? 0 : 1]);
    p.px(x, y, SHINGLE[0]); p.px(x + w - 1, y, SHINGLE[3]);
  }
  p.rect(3, fy - 32, 20, 1, SHINGLE[1]); p.rect(4, fy - 31, 18, 1, '#0e060a');
  p.rect(11, fy - 37, 4, 1, WOOD[3]); p.px(11, fy - 37, WOOD[4]);
  // Haken und Laterne (Glas dunkel; brennt über die Leuchtebene)
  p.rect(21, fy - 30, 3, 1, ST[2]); p.px(23, fy - 29, ST[2]);
  p.rect(22, fy - 28, 3, 1, ST[3]); p.rect(22, fy - 27, 3, 4, '#241a1e'); p.px(23, fy - 26, '#3a2a24');
  p.rect(22, fy - 27, 1, 4, ST[1]); p.rect(24, fy - 27, 1, 4, ST[1]); p.rect(22, fy - 23, 3, 1, ST[2]); p.px(23, fy - 22, ST[1]);
}

// Rabe auf dem First, Blick nach links. pose: 0 ruhig, 1 Kopf geneigt, 2 Augen zu, 3 Flügel gelüftet
function raven(p, pose) {
  const fy = AY, x = 9, y = fy - 38;
  // Schwanz nach rechts über den First
  p.rect(x + 7, y + 1, 3, 1, RAVEN[1]); p.px(x + 10, y + 2, RAVEN[1]); p.px(x + 9, y + 2, RAVEN[2]);
  // Körper
  p.rect(x + 2, y - 2, 6, 4, RAVEN[1]); p.rect(x + 3, y - 3, 4, 1, RAVEN[1]);
  p.rect(x + 3, y - 2, 4, 1, RAVEN[3]); p.px(x + 4, y - 3, RAVEN[4]); p.px(x + 2, y, RAVEN[2]);
  // Flügel
  if (pose === 3) { p.rect(x + 4, y - 5, 4, 2, RAVEN[2]); p.px(x + 7, y - 6, RAVEN[1]); p.px(x + 5, y - 5, RAVEN[4]); }
  else { p.rect(x + 4, y - 1, 4, 2, RAVEN[2]); p.px(x + 5, y - 1, RAVEN[3]); }
  // Kopf und Schnabel
  const hy = pose === 1 ? y - 4 : y - 5;
  p.rect(x, hy, 3, 3, RAVEN[1]); p.px(x + 1, hy, RAVEN[3]); p.px(x + 2, hy + 2, RAVEN[1]);
  p.rect(x - 2, hy + 1 + (pose === 1 ? 1 : 0), 2, 1, '#5a5460'); p.px(x - 2, hy + 2 + (pose === 1 ? 1 : 0), '#3a3440');
  p.px(x + 1, hy + 1, pose === 2 ? RAVEN[2] : G[4]);
  // Krallen am First
  p.px(x + 4, y + 2, '#3a3440'); p.px(x + 6, y + 2, '#3a3440');
}

// Leuchtebene: brennende Laterne und warmes Glimmen im Schlitz (Post wartet)
function glow(g) {
  const fy = AY;
  g.rect(22, fy - 27, 3, 4, E[3]); g.px(23, fy - 26, E[5]); g.px(23, fy - 25, E[4]); g.px(22, fy - 24, E[2]); g.px(24, fy - 24, E[2]);
  g.rect(10, fy - 27, 6, 1, E[2]); g.px(12, fy - 27, E[3]); g.px(13, fy - 27, E[4]);
}

export function createMailboxSprites() {
  const frame = (pose) => buildFrame(W, H, AX, AY, (p) => { box(p); raven(p, pose); });
  const poses = [0, 1, 2, 3].map(frame);
  const gc = new PixelCanvas(W + 2, H + 2); // gleiche Größe wie die umrandeten Bilder (buildFrame: 1 px Rand)
  gc.ctx.translate(1, 1);
  glow(gc);
  // Ablauf der Rabenposen (4 Bilder je Sekunde): meist ruhig, gelegentlich Kopf neigen, blinzeln, Flügel lüften
  const seq = [0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 3, 3, 0, 0, 0, 0, 0, 1, 1, 0, 0];
  return { poses, seq, fps: 4, glow: gc.canvas, box: [-8, -6, 8, 1] };
}
