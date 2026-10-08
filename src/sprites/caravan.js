import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame, Animation } from '../gfx/Sprite.js';
import { hash2 } from '../core/math.js';

// Eskorte und Verteidigen (world/questRuns.js): fahrender Karren mit Maultier, Planwagen mit Ochse
// und Kutscher, Ritualkreis. Blickrichtung rechts, Anker = Fußpunkt (Mitte unter dem Gefährt).
// Je Gefährt: anims { idle, walk } (4 Frames: Speichen drehen sich, Zugtier schreitet) und
// decor { sprite, glow?, box } für das stehende Start-Objekt (level.objects, decor 'cart' | 'caravan').
// riftCircle: flacher Kreis am Boden (Start-Objekt 'rift_circle' und Kreis unter Ysolde), glow = Leuchtrunen.
const WOOD = ['#140c09', '#1f140f', '#2e1d14', '#412a1c', '#573a26', '#714c31', '#8a6040'];
const IRON = PAL.steel;
const CANVAS = ['#2a241c', '#433a2c', '#5e533e', '#7c6f54', '#9c8e6c', '#bcae88', '#d8cca4'];
const MULE = ['#17110f', '#271c18', '#3a2a24', '#4e3a30', '#664c3e', '#80634f'];
const OX = ['#140f0d', '#231a15', '#35271f', '#4a372a', '#614835', '#7a5c43'];
const HORN = PAL.bone;
const CLOTH = ['#2a0a12', '#4a0f1c', '#7a1a26', '#a8283a'];
const SKIN = ['#4a2e28', '#7a5040', '#a8765a', '#c89878'];
const RUNE = PAL.magic, EMB = PAL.ember;
const STONE = PAL.stone;

// Ein Frame mit Glow-Ebene (gleiche Koordinaten, 1 px Rand wie buildFrame-Umriss).
function frame(W, H, ax, ay, draw) {
  const gl = new PixelCanvas(W + 2, H + 2);
  gl.ctx.translate(1, 1);
  let used = false;
  const g = {
    px: (x, y, c) => { used = true; gl.px(x, y, c); },
    rect: (x, y, w, h, c) => { used = true; gl.rect(x, y, w, h, c); },
    ellipse: (x, y, rx, ry, c) => { used = true; gl.ellipse(x, y, rx, ry, c); },
  };
  const f = buildFrame(W, H, ax, ay, (p) => draw(p, g));
  if (used) f.glowCanvas = gl.canvas;
  return f;
}

// Speichenrad: Eisenreif, Felge, 6 Speichen (um phase gedreht), Nabe.
function wheel(p, wx, wy, r, phase) {
  p.ellipse(wx, wy, r, r, IRON[1]);
  p.ellipse(wx, wy, r - 1, r - 1, WOOD[3]);
  p.ellipse(wx, wy, r - 2, r - 2, '#0d0a0c');
  for (let i = 0; i < 6; i++) {
    const a = phase + (i / 6) * Math.PI * 2;
    p.line(wx, wy, wx + Math.cos(a) * (r - 2), wy + Math.sin(a) * (r - 2), i % 2 ? WOOD[3] : WOOD[4]);
  }
  p.ellipse(wx, wy, 1.5, 1.5, WOOD[5]); p.px(wx, wy, IRON[3]);
  for (let i = 0; i < 5; i++) { const a = Math.PI + 0.4 + i * 0.3; p.px(wx + Math.round(Math.cos(a) * r), wy + Math.round(Math.sin(a) * r), IRON[3]); }
}

// Vierbeiniges Zugtier (Maultier/Ochse) nach rechts. step 0..3: Beinpaare im Wechsel.
function beast(p, x, y, { body, big = false, horns = false, step = 0 }) {
  const C = body, bw = big ? 9 : 7, bh = big ? 5 : 4;
  const legs = big ? [[-6, 0], [-3, 1], [4, 0], [7, 1]] : [[-5, 0], [-3, 1], [3, 0], [5, 1]];
  legs.forEach(([lx, pair], i) => {
    const swing = (step + pair * 2) % 4;
    const off = swing === 1 ? 1 : swing === 3 ? -1 : 0;
    const top = y + bh - 1, len = big ? 6 : 6;
    p.line(x + lx, top, x + lx + off, top + len, i < 2 ? C[1] : C[2]);
    p.px(x + lx + off, top + len, C[0]);
  });
  p.ellipse(x, y, bw, bh, C[2]);
  p.ellipse(x - 1, y - 1, bw - 1, bh - 2, C[3]);
  p.rect(x - bw + 2, y - bh + 1, bw * 2 - 4, 1, C[4]);
  // Schweif
  p.line(x - bw, y - 1, x - bw - 2, y + 3, C[1]); p.px(x - bw - 2, y + 4, C[0]);
  // Hals und Kopf
  const hx = x + bw - 1, hy = y - (big ? 3 : 4);
  p.rect(hx - 1, hy, 4, 4, C[3]);
  if (big) {
    p.rect(hx + 2, hy, 5, 5, C[3]); p.rect(hx + 2, hy, 5, 1, C[4]); p.rect(hx + 5, hy + 3, 2, 2, C[2]);
    p.px(hx + 4, hy + 1, '#0b0710');
    if (horns) { p.line(hx + 2, hy - 1, hx, hy - 3, HORN[3]); p.px(hx - 1, hy - 3, HORN[4]); p.line(hx + 5, hy - 1, hx + 6, hy - 3, HORN[2]); }
  } else {
    p.rect(hx + 2, hy - 2, 4, 4, C[3]); p.rect(hx + 5, hy, 2, 2, C[2]); p.rect(hx + 2, hy - 2, 4, 1, C[4]);
    p.px(hx + 4, hy - 1, '#0b0710');
    p.line(hx + 2, hy - 3, hx + 1, hy - 6, C[3]); p.line(hx + 3, hy - 3, hx + 3, hy - 6, C[4]); // lange Ohren
  }
  // Geschirr
  p.rect(hx - 1, hy + 1, 1, 3, WOOD[2]); p.px(hx - 1, hy + 1, IRON[3]);
}

// ------------------------------------------------------------ Karren mit Maultier (Vesks Händler Tamm)
function cartFrame(step) {
  const W = 58, H = 30, ax = 26, ay = H - 2;
  return frame(W, H, ax, ay, (p) => {
    const phase = step * (Math.PI / 12);
    // Deichsel zum Maultier
    p.line(30, 18, 40, 17, WOOD[2]); p.line(30, 19, 40, 18, WOOD[1]);
    beast(p, 41, 14, { body: MULE, step });
    // Ladefläche
    p.rect(3, 11, 28, 8, WOOD[3]);
    for (let x = 3; x < 31; x += 5) p.rect(x, 11, 1, 8, WOOD[1]);
    p.rect(3, 11, 28, 1, WOOD[5]); p.rect(3, 15, 28, 1, WOOD[2]); p.rect(3, 18, 28, 1, WOOD[0]);
    p.rect(3, 11, 1, 8, WOOD[5]);
    // Ladung: Säcke unter Plane, Kiste, Fass
    p.ellipse(11, 9, 7, 3.5, CANVAS[3]); p.ellipse(10, 8, 5, 2.5, CANVAS[4]); p.px(8, 6, CANVAS[5]); p.px(10, 6, CANVAS[5]);
    p.line(5, 11, 17, 10, CANVAS[1]);
    p.rect(19, 4, 9, 7, WOOD[4]); p.rect(19, 4, 9, 1, WOOD[5]); p.rect(19, 4, 1, 7, WOOD[5]); p.rect(27, 5, 1, 6, WOOD[2]); p.rect(19, 7, 9, 1, IRON[1]);
    p.px(23, 6, '#c8a040');
    // Rad (vorn, dreht sich)
    wheel(p, 15, 21, 7, phase);
    // Staub am Rad
    if (step % 2) p.px(8 + step, 28, '#4a4038');
  });
}

// ------------------------------------------------------------ Planwagen mit Ochse und Kutscher (Imras Karawane)
function caravanFrame(step) {
  const W = 78, H = 44, ax = 34, ay = H - 2;
  return frame(W, H, ax, ay, (p, g) => {
    const phase = step * (Math.PI / 14);
    const bob = step % 2;
    // Deichsel
    p.line(42, 28, 52, 27, WOOD[2]); p.line(42, 29, 52, 28, WOOD[1]);
    beast(p, 55, 23, { body: OX, big: true, horns: true, step });
    // hinteres Rad (dahinter)
    wheel(p, 36, 33, 7, phase + 0.3);
    // Wagenkasten
    p.rect(2, 22, 42, 9, WOOD[3]);
    for (let x = 2; x < 44; x += 6) p.rect(x, 22, 1, 9, WOOD[1]);
    p.rect(2, 22, 42, 1, WOOD[5]); p.rect(2, 26, 42, 1, WOOD[2]); p.rect(2, 30, 42, 1, WOOD[0]);
    // Plane: Bogen über Reifen, helle Leinwand mit Flicken
    for (let x = 3; x <= 40; x++) {
      const t = (x - 3) / 37;
      const top = 6 + Math.round(Math.pow(Math.abs(t - 0.5) * 2, 2.2) * 5);
      for (let y = top; y < 22; y++) {
        let i = y < top + 2 ? 5 : y > 18 ? 2 : 4;
        if ((x - 3) % 9 === 0) i = 1; // Reifen
        else if (hash2(x, y, 71) < 0.08) i--;
        p.px(x, y, CANVAS[i]);
      }
    }
    p.rect(14, 12, 5, 4, CANVAS[2]); p.rect(14, 12, 5, 1, CANVAS[3]); p.px(16, 13, CANVAS[1]); // Flicken
    p.rect(27, 15, 4, 3, CLOTH[2]); p.px(27, 15, CLOTH[3]);
    // Öffnung vorn mit dunklem Inneren
    p.rect(38, 9, 3, 13, '#120c0a'); p.rect(37, 8, 1, 14, CANVAS[1]);
    // Kutscher auf dem Bock
    const kx = 42, ky = 13 + bob * 0;
    p.rect(kx - 1, ky + 4, 5, 6, CLOTH[1]); p.rect(kx - 1, ky + 4, 5, 1, CLOTH[2]); p.rect(kx, ky + 5, 1, 4, CLOTH[2]);
    p.rect(kx, ky, 4, 4, SKIN[2]); p.px(kx + 2, ky + 1, '#150c12'); p.rect(kx, ky + 3, 4, 1, SKIN[1]);
    p.rect(kx - 1, ky - 1, 6, 2, '#3a2a1a'); p.rect(kx, ky - 2, 4, 1, '#4e3a24'); // Hut
    p.line(kx + 4, ky + 6, 51, 24, '#2a1c12'); // Zügel
    // Laterne am Bug
    p.px(44, 6, IRON[2]); p.rect(43, 7, 3, 4, EMB[3]); p.px(44, 8, EMB[5]);
    g.rect(43, 7, 3, 4, EMB[4]); g.px(44, 8, '#fff4d0');
    // Vorderrad (dreht sich)
    wheel(p, 12, 33, 8, phase);
    if (step % 2) p.px(4 + step, 42, '#4a4038');
  });
}

// ------------------------------------------------------------ Ritualkreis (Schlackenhöhen)
function riftCircle() {
  const W = 52, H = 24, ax = 26, ay = 15;
  return frame(W, H, ax, ay, (p, g) => {
    const cx = 26, cy = 12;
    // Ascheboden und Steinring
    p.ellipse(cx, cy, 25, 11, '#1a1418');
    p.ellipse(cx, cy, 22, 9, '#241c20');
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(a) * 23), y = Math.round(cy + Math.sin(a) * 10);
      p.ellipse(x, y, 2, 1.3, STONE[3]); p.px(x - 1, y - 1, STONE[5]);
    }
    // Runenring (leuchtet)
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(a) * 17), y = Math.round(cy + Math.sin(a) * 7);
      p.px(x, y, RUNE[2]);
      if (i % 2 === 0) g.px(x, y, RUNE[3]);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const x = Math.round(cx + Math.cos(a) * 12), y = Math.round(cy + Math.sin(a) * 5);
      p.rect(x - 1, y - 1, 3, 2, RUNE[3]); p.px(x, y - 1, RUNE[4]);
      g.rect(x - 1, y - 1, 3, 2, RUNE[4]); g.px(x, y - 1, '#ffffff');
    }
    // Glutkern
    p.ellipse(cx, cy, 4, 2, EMB[2]); p.ellipse(cx, cy, 2, 1, EMB[4]);
    g.ellipse(cx, cy, 4, 2, EMB[3]); g.px(cx, cy, EMB[5]);
  });
}

const deco = (f, box) => ({ sprite: f, glow: f.glowCanvas ?? null, box });

export function createCaravanSprites() {
  const cartFrames = [0, 1, 2, 3].map(cartFrame);
  const carFrames = [0, 1, 2, 3].map(caravanFrame);
  const circle = riftCircle();
  return {
    cartAnims: { idle: new Animation([cartFrames[0]], 1), walk: new Animation(cartFrames, 8) },
    caravanAnims: { idle: new Animation([carFrames[0]], 1), walk: new Animation(carFrames, 7) },
    // decor-Einträge für level.objects (Fallback in placeObjects, wenn der Deko-Satz der Zone sie nicht hat)
    cart: deco(cartFrames[0], [-16, -5, 16, 1]),
    caravan: deco(carFrames[0], [-22, -6, 24, 1]),
    riftCircle: { sprite: circle, glow: circle.glowCanvas ?? null, box: [-2, -1, 2, 0], light: { dx: 0, dy: -4, radius: 70, color: [170, 100, 255], intensity: 0.7 } },
  };
}
