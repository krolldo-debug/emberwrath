import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame, SpriteFrame, Animation } from '../gfx/Sprite.js';
import { TAU } from '../core/math.js';

// Gewandmeisterin (Haus der Spiegel) und ihr Standspiegel: in jeder Wegstein-Stadt, legt gesammeltes Aussehen gegen Gold an.
// Format wie der Auktionator (market/sprite.js): Blick nach rechts, Anker = Fußpunkt, Leuchtendes zusätzlich auf frame.glow.
const W = 40, H = 42, AX = 18, AY = 37;
const G = PAL.gold, S = PAL.steel;
const SKIN = ['#4a3430', '#7a5a4c', '#a07e6a', '#c4a28a'];
const PLUM = ['#12081a', '#1e0e2a', '#2e163e', '#422058', '#5a2e74'];
const HAIR = ['#1a0c0a', '#2e1610', '#4a2216', '#6a321c'];
const LACE = ['#8a7e6c', '#c8bca2', '#ece2c8'];
const CLOTH = ['#2a0810', '#4e0e1c', '#7a1a2a', '#a42a38'];
const TAPE = ['#8a6418', '#d8a830'];
const EYE = '#150c12', LIP = '#6a2a30';

function head(p, hx, hy, talk) {
  // Gesicht schmaler als beim Auktionator, hohe Wangen
  p.rect(hx + 2, hy + 1, 5, 6, SKIN[2]);
  p.rect(hx + 3, hy + 7, 3, 1, SKIN[1]);
  p.px(hx + 7, hy + 3, SKIN[2]); p.px(hx + 7, hy + 4, SKIN[2]); p.px(hx + 7, hy + 5, SKIN[1]);
  p.px(hx + 6, hy + 2, SKIN[3]); p.px(hx + 6, hy + 4, SKIN[3]);
  p.px(hx + 5, hy + 3, EYE); p.px(hx + 5, hy + 2, HAIR[1]);
  p.px(hx + 3, hy + 5, SKIN[1]);
  p.px(hx + 6, hy + 6, talk ? EYE : LIP);
  // Haar: streng zurück, Knoten am Hinterkopf mit goldener Nadel
  p.rect(hx + 1, hy - 1, 6, 2, HAIR[2]); p.rect(hx + 2, hy - 2, 4, 1, HAIR[1]);
  p.px(hx + 6, hy, HAIR[3]); p.px(hx + 4, hy - 1, HAIR[3]);
  p.rect(hx + 1, hy + 1, 2, 5, HAIR[2]); p.px(hx + 1, hy + 1, HAIR[3]); p.px(hx + 2, hy + 6, HAIR[1]);
  p.rect(hx - 2, hy - 1, 3, 3, HAIR[2]); p.px(hx - 2, hy - 1, HAIR[1]); p.px(hx - 1, hy - 1, HAIR[3]); p.px(hx - 2, hy + 1, HAIR[1]);
  p.line(hx - 4, hy - 2, hx + 1, hy + 1, G[3]); p.px(hx - 4, hy - 2, G[4]);
}

function draw(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 18, b = Math.sin(t * TAU) > 0.2 ? 1 : 0, sw = Math.sin(t * TAU);
  const ty = 19 - b, hy = 10 - b;
  // Langes Kleid aus Pflaumensamt, unten weit, goldene Borte am Saum
  for (let y = ty + 8; y <= fy; y++) {
    const k = (y - ty - 8) / (fy - ty - 8), hw = 3 + k * 5, s = Math.round(-sw * k * 0.6);
    for (let x = Math.round(cx - hw) + s; x <= Math.round(cx + 1 + hw) + s; x++) {
      const rel = (x - s - (cx - hw)) / (2 * hw + 1);
      let i = rel < 0.2 ? 4 : rel < 0.55 ? 3 : rel < 0.85 ? 2 : 1;
      if ((x - s + (y >> 2)) % 4 === 0 && k > 0.2) i = Math.max(1, i - 1);   // Faltenwurf
      p.px(x, y, y >= fy - 1 ? G[y === fy ? 1 : 2] : PLUM[i]);
    }
  }
  // Mieder mit Schnürung, Spitzenkragen
  p.rect(cx - 3, ty, 7, 9, PLUM[3]); p.rect(cx - 3, ty, 2, 9, PLUM[4]); p.rect(cx + 3, ty, 1, 9, PLUM[2]);
  for (let y = ty + 2; y < ty + 8; y += 2) { p.px(cx, y, LACE[1]); p.px(cx + 1, y + 1, LACE[0]); }
  p.rect(cx - 4, ty + 8, 9, 1, G[1]); p.px(cx, ty + 8, G[3]);
  p.rect(cx - 3, ty - 1, 7, 2, LACE[2]); p.px(cx - 3, ty, LACE[1]); p.px(cx + 3, ty, LACE[1]); p.px(cx, ty + 1, LACE[1]);
  // Maßband über den Schultern, hängt vorn herunter
  p.line(cx - 2, ty + 1, cx - 2, ty + 9, TAPE[1]); p.line(cx + 3, ty + 1, cx + 3, ty + 7, TAPE[1]);
  for (let y = ty + 2; y <= ty + 8; y += 2) { p.px(cx - 2, y, TAPE[0]); if (y <= ty + 6) p.px(cx + 3, y, TAPE[0]); }
  // Kopf
  const hx = cx - 3;
  head(p, hx, hy, talk);
  // hinterer Arm: Stoffballen unter dem Arm (Glutrot)
  p.rect(cx - 6, ty + 1, 2, 7, PLUM[2]); p.px(cx - 6, ty + 1, PLUM[3]);
  p.rect(cx - 9, ty + 5, 5, 7, CLOTH[2]); p.rect(cx - 9, ty + 5, 5, 1, CLOTH[3]); p.rect(cx - 9, ty + 6, 1, 6, CLOTH[1]);
  p.px(cx - 7, ty + 8, CLOTH[3]); p.px(cx - 6, ty + 10, CLOTH[1]); p.rect(cx - 9, ty + 12, 5, 1, CLOTH[0]);
  p.rect(cx - 5, ty + 8, 2, 2, SKIN[2]);
  // vorderer Arm mit Schere; beim Sprechen erhoben, die Schere schnappt
  const ax = cx + 6, ay = ty + 6 - (gest ? 2 + gest * 2 : 0);
  p.rect(cx + 4, ty, 2, 3, PLUM[4]); p.px(cx + 5, ty + 2, PLUM[3]);
  p.line(cx + 5, ty + 3, ax - 1, ay - 1, PLUM[3]); p.line(cx + 6, ty + 3, ax, ay - 1, PLUM[2]);
  p.px(ax - 1, ay, LACE[1]); p.px(ax, ay, LACE[1]);
  p.rect(ax - 1, ay + 1, 3, 2, SKIN[2]); p.px(ax + 1, ay + 1, SKIN[3]);
  // Schere: zwei Griffringe in der Hand, Klingen nach oben vorn
  const sx = ax + 1, sy = ay;
  const open = gest === 2 ? 1 : 0;
  p.px(sx - 1, sy + 2, G[2]); p.px(sx + 1, sy + 3, G[2]); p.px(sx, sy + 3, G[1]);
  p.line(sx + 1, sy, sx + 4, sy - 4, S[4]); p.line(sx + 2, sy + 1, sx + 5 + open, sy - 3 + open, S[3]);
  p.px(sx + 4, sy - 4, S[5]); p.px(sx + 2, sy - 1, G[3]);
  g.px(sx + 4, sy - 4, S[5]);
  return { head: { dx: 0, dy: hy - AY } };
}

function mkFrame(fn) {
  const gc = new PixelCanvas(W, H);
  let used = false;
  const g = new Proxy(gc, { get(tg, k) { if (k === 'px' || k === 'rect' || k === 'line' || k === 'ellipse') used = true; const v = tg[k]; return typeof v === 'function' ? v.bind(tg) : v; } });
  let meta = null;
  const f = buildFrame(W, H, AX, AY, (p) => { meta = fn(p, g); });
  if (used) f.glow = new SpriteFrame(gc.canvas, AX, AY);
  if (meta) f.meta = meta;
  return f;
}

// Standspiegel: ovales Glas im vergoldeten Rahmen auf Klauenfüßen, oben ein Glutstein.
// Glas nachtblau mit einem harten hellen Streif (kein Verlauf), der Stein leuchtet auf der Glow-Ebene.
const MW = 22, MH = 40, MAX = 11, MAY = 38;
const GLASS = ['#0c1424', '#14223a', '#1e3252', '#2c4a70'];
function drawMirror(p, g) {
  const fy = MAY, cx = 11, top = 4, bot = fy - 8;
  const rx = 7, ry = (bot - top) / 2, cy = top + ry;
  // Füße und Fuß des Ständers
  p.rect(cx - 6, fy - 1, 3, 2, G[1]); p.rect(cx + 4, fy - 1, 3, 2, G[1]); p.px(cx - 6, fy - 1, G[2]); p.px(cx + 6, fy - 1, G[2]);
  p.rect(cx - 5, fy - 3, 11, 2, G[1]); p.rect(cx - 5, fy - 3, 11, 1, G[2]);
  p.rect(cx - 1, bot, 3, fy - 3 - bot, G[2]); p.px(cx - 1, bot + 2, G[3]); p.px(cx + 1, bot + 3, G[1]);
  // Rahmen (Oval, 2 px Gold) und Glas
  for (let y = top - 1; y <= bot + 1; y++) for (let x = cx - rx - 1; x <= cx + rx + 1; x++) {
    const dx = (x - cx) / (rx + 1.2), dy = (y - cy) / (ry + 1.2), d = dx * dx + dy * dy;
    if (d > 1) continue;
    const ix = (x - cx) / (rx - 0.6), iy = (y - cy) / (ry - 0.6), inner = ix * ix + iy * iy <= 1;
    if (!inner) p.px(x, y, x < cx ? (y < cy ? G[3] : G[2]) : y < cy ? G[2] : G[1]);
    else p.px(x, y, GLASS[x < cx - 2 ? 2 : x < cx + 3 ? 1 : 0]);
  }
  // Spiegelung: harter heller Streif schräg, ein paar Glanzpunkte
  for (let i = 0; i < 8; i++) { p.px(cx - 4 + (i >> 2), top + 5 + i, GLASS[3]); if (i < 5) p.px(cx - 3 + (i >> 2), top + 5 + i, '#5a7aa4'); }
  p.px(cx + 3, top + 4, GLASS[3]); p.px(cx + 4, bot - 6, GLASS[2]);
  // Krone mit Glutstein
  p.rect(cx - 2, top - 3, 5, 2, G[2]); p.px(cx - 3, top - 2, G[1]); p.px(cx + 3, top - 2, G[1]); p.px(cx, top - 4, G[3]);
  p.px(cx, top - 2, PAL.ember[4]); g.px(cx, top - 2, PAL.ember[4]); g.px(cx, top - 3, PAL.ember[3]);
  p.px(cx - rx - 1, cy, PAL.ember[3]); p.px(cx + rx + 1, cy, PAL.ember[3]); g.px(cx - rx - 1, cy, PAL.ember[3]); g.px(cx + rx + 1, cy, PAL.ember[3]);
}

export function createTransmogSprites() {
  const phases = (n) => [...Array(n)].map((_, i) => i / n);
  const idle = new Animation(phases(6).map((t) => mkFrame((p, g) => draw(p, g, { t }))), 6);
  const talk = new Animation([
    mkFrame((p, g) => draw(p, g, { t: 0.1, talk: 1, gest: 1 })),
    mkFrame((p, g) => draw(p, g, { t: 0.25, talk: 0, gest: 2 })),
    mkFrame((p, g) => draw(p, g, { t: 0.4, talk: 1, gest: 1 })),
    mkFrame((p, g) => draw(p, g, { t: 0.55, talk: 0, gest: 0 })),
  ], 6);
  const gc = new PixelCanvas(MW, MH);
  const mirror = buildFrame(MW, MH, MAX, MAY, (p) => drawMirror(p, gc));
  return { idle, talk, mirror, mirrorGlow: gc.canvas };
}
