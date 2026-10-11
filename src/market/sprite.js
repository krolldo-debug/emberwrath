import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame, SpriteFrame, Animation } from '../gfx/Sprite.js';
import { TAU } from '../core/math.js';

// Auktionator der Gilde der Glutwaage und sein Pult (Auktionshaus in jeder Stadt).
// Format wie die NPCs in sprites/npcs3.js: Blick nach rechts, Anker = Fußpunkt, Leuchtendes zusätzlich auf frame.glow.
const W = 40, H = 42, AX = 18, AY = 37;
const G = PAL.gold, L = PAL.leather;
const SKIN = ['#4a3430', '#7a5a4c', '#a07e6a', '#bc9c86'];
const WINE = ['#1a070c', '#2e0c16', '#4a1424', '#6a1e32', '#8a2c40'];
const NIGHT = ['#0e0a14', '#18121e', '#241a2c', '#32263c'];
const GREY = ['#4a4448', '#787074', '#a49ca0', '#cec8ca'];
const WOOD = ['#1e130c', '#2e1e12', '#43301c', '#5a4228', '#735634'];
const PAGE = ['#7a6e5a', '#b8aa8a', '#e2d6b6'];
const EYE = '#150c12', MOUTH = '#2a0e10';

function head(p, hx, hy, talk) {
  const S = SKIN;
  p.rect(hx + 1, hy + 1, 6, 6, S[2]);
  p.rect(hx + 2, hy + 7, 4, 1, S[1]);
  p.rect(hx + 5, hy + 2, 2, 1, S[3]);
  p.px(hx + 7, hy + 4, S[2]); p.px(hx + 7, hy + 5, S[1]);
  p.px(hx + 5, hy + 4, EYE);
  p.px(hx + 4, hy + 3, GREY[1]); p.px(hx + 5, hy + 3, GREY[1]);
  p.px(hx + 3, hy + 4, S[1]); p.px(hx + 3, hy + 5, S[0]);
  p.px(hx + 6, hy + 5, S[3]); p.px(hx + 6, hy + 3, S[3]); p.px(hx + 4, hy + 5, S[3]);
  p.px(hx + 1, hy + 5, S[1]); p.px(hx + 1, hy + 6, S[1]);
  // gepflegter grauer Spitzbart und Schnurrbart
  p.rect(hx + 3, hy + 6, 4, 1, GREY[2]); p.px(hx + 7, hy + 6, GREY[1]);
  p.rect(hx + 3, hy + 7, 4, 1, GREY[1]); p.rect(hx + 4, hy + 8, 3, 1, GREY[2]); p.px(hx + 5, hy + 9, GREY[1]);
  p.px(hx + 6, hy + 6, talk ? MOUTH : GREY[3]);
  if (talk) p.px(hx + 5, hy + 7, MOUTH);
  // Schläfen grau
  p.rect(hx + 1, hy + 2, 2, 4, GREY[1]); p.px(hx + 1, hy + 2, GREY[2]);
}

// Barett aus Samt mit Goldborte und kurzer Glutfeder
function cap(p, hx, hy, sw) {
  p.rect(hx - 1, hy - 1, 9, 2, NIGHT[2]); p.rect(hx, hy - 2, 7, 1, NIGHT[3]); p.rect(hx + 1, hy - 3, 4, 1, NIGHT[2]);
  p.px(hx - 1, hy, NIGHT[1]); p.px(hx - 2, hy, NIGHT[1]);
  p.rect(hx, hy + 1, 8, 1, G[2]); p.px(hx + 6, hy + 1, G[3]); p.px(hx + 2, hy + 1, G[1]);
  const fx = hx + 1 - Math.round(sw * 0.6);
  p.px(fx, hy - 4, PAL.ember[3]); p.px(fx - 1, hy - 5, PAL.ember[4]); p.px(fx - 2, hy - 5, PAL.ember[3]); p.px(fx - 3, hy - 4, PAL.ember[2]);
}

function draw(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 18, b = Math.sin(t * TAU) > 0.2 ? 1 : 0, sw = Math.sin(t * TAU);
  const ty = 19 - b, hy = 10 - b;
  // Beine und Schnallenschuhe
  p.rect(cx - 3, 31, 3, fy - 33, NIGHT[1]); p.rect(cx + 1, 31, 3, fy - 33, NIGHT[2]);
  p.rect(cx - 4, fy - 2, 4, 3, L[0]); p.rect(cx + 1, fy - 2, 5, 3, L[1]); p.px(cx + 3, fy - 2, G[3]); p.px(cx - 2, fy - 2, G[2]);
  // langer Weinrotmantel mit Goldsaum, Schöße offen
  for (let y = ty + 2; y <= fy - 3; y++) {
    const k = (y - ty - 2) / (fy - 3 - ty - 2), hw = 4 + k * 3, s = Math.round(-sw * k * 0.8);
    for (let x = Math.round(cx - hw) + s; x <= Math.round(cx + 1 + hw) + s; x++) {
      const rel = (x - s - (cx - hw)) / (2 * hw + 1);
      if (rel > 0.42 && rel < 0.62 && y > ty + 9) continue; // offener Schoß: Beine sichtbar
      let i = rel < 0.25 ? 4 : rel < 0.6 ? 3 : 2;
      if ((x - s) % 3 === 0 && k > 0.3) i -= 1;
      p.px(x, y, WINE[y === fy - 3 ? 1 : i]);
    }
  }
  for (let y = ty + 10; y <= fy - 3; y++) { p.px(cx - 1 + Math.round(-sw * ((y - ty) / 18) * 0.8), y, G[2]); p.px(cx + 3 + Math.round(-sw * ((y - ty) / 18) * 0.8), y, G[1]); }
  for (let x = cx - 6; x <= cx + 7; x++) if (x < cx - 1 || x > cx + 3) p.px(x + Math.round(-sw * 0.8), fy - 3, G[2]);
  // dunkles Wams, Gürtel mit Geldbeutel
  p.rect(cx - 3, ty, 7, 10, NIGHT[2]); p.rect(cx - 3, ty, 2, 10, NIGHT[3]); p.rect(cx + 3, ty, 1, 10, NIGHT[1]);
  for (let y = ty + 2; y < ty + 9; y += 2) p.px(cx + 1, y, G[3]);
  p.rect(cx - 4, ty + 8, 9, 1, L[0]); p.px(cx, ty + 8, G[3]);
  p.rect(cx + 3, ty + 9, 3, 3, L[2]); p.px(cx + 3, ty + 9, L[3]); p.px(cx + 4, ty + 12, L[1]); p.px(cx + 4, ty + 10, G[3]);
  // Mantelschultern + Pelzkragen
  p.rect(cx - 5, ty - 1, 11, 3, WINE[3]); p.rect(cx - 5, ty - 1, 11, 1, WINE[4]); p.px(cx - 5, ty + 1, WINE[2]); p.px(cx + 5, ty + 1, WINE[2]);
  p.rect(cx - 4, ty - 2, 9, 2, GREY[1]); p.rect(cx - 3, ty - 2, 7, 1, GREY[2]); p.px(cx + 3, ty - 2, GREY[3]);
  // Amtskette mit der Glutwaage
  p.line(cx - 3, ty, cx, ty + 4, G[2]); p.line(cx + 4, ty, cx + 1, ty + 4, G[1]);
  p.px(cx - 2, ty + 1, G[4]); p.px(cx + 3, ty + 1, G[3]);
  p.rect(cx - 1, ty + 4, 3, 3, G[2]); p.px(cx, ty + 4, G[4]); p.px(cx - 1, ty + 6, G[1]);
  g.px(cx, ty + 5, PAL.ember[4]); g.px(cx, ty + 4, PAL.ember[3]);
  // Kopf
  const hx = cx - 3;
  head(p, hx, hy, talk);
  cap(p, hx, hy, sw);
  // hinterer Arm: Kontobuch unter dem Arm
  p.rect(cx - 6, ty + 1, 2, 7, WINE[2]); p.px(cx - 6, ty + 1, WINE[3]);
  p.rect(cx - 8, ty + 5, 5, 6, L[1]); p.rect(cx - 8, ty + 5, 5, 1, L[3]); p.rect(cx - 8, ty + 6, 1, 5, PAGE[1]); p.px(cx - 6, ty + 7, G[3]);
  p.rect(cx - 5, ty + 8, 2, 2, SKIN[2]);
  // vorderer Arm mit Hammer; beim Sprechen erhoben
  const ax = cx + 6, ay = ty + 6 - (gest ? 3 + gest * 2 : 0);
  p.rect(cx + 4, ty, 3, 3, WINE[3]); p.px(cx + 6, ty + 2, WINE[2]);
  p.line(cx + 5, ty + 3, ax - 1, ay - 1, WINE[3]); p.line(cx + 6, ty + 3, ax, ay - 1, WINE[2]);
  p.px(ax - 1, ay, G[2]); p.px(ax, ay, G[2]); // Ärmelborte
  p.rect(ax - 1, ay + 1, 3, 2, SKIN[2]); p.px(ax + 1, ay + 1, SKIN[3]);
  // Auktionshammer: Stiel schräg nach oben, Kopf aus dunklem Holz mit Messingband
  const hx2 = ax + 1, hy2 = ay + 1;
  p.line(hx2, hy2, hx2 + 3, hy2 - 4, WOOD[3]); p.px(hx2 + 1, hy2 - 1, WOOD[4]);
  p.rect(hx2 + 2, hy2 - 7, 3, 4, WOOD[2]); p.rect(hx2 + 2, hy2 - 7, 3, 1, WOOD[4]); p.rect(hx2 + 2, hy2 - 5, 3, 1, G[2]); p.px(hx2 + 4, hy2 - 6, WOOD[1]);
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

// Pult aus dunklem Holz mit Messing-Waage und aufgeschlagenem Auktionsbuch, Kerze oben links.
const LW = 26, LH = 30, LAX = 13, LAY = 28;
function drawLectern(p, g) {
  const fy = LAY;
  // Sockel und Korpus (leicht nach vorn geneigt)
  p.rect(5, fy - 2, 17, 3, WOOD[1]); p.rect(5, fy - 2, 17, 1, WOOD[2]);
  p.rect(7, fy - 16, 13, 14, WOOD[2]); p.rect(7, fy - 16, 3, 14, WOOD[3]); p.rect(18, fy - 16, 2, 14, WOOD[1]);
  for (let y = fy - 14; y < fy - 2; y += 4) p.rect(10, y, 8, 1, WOOD[1]);
  // Messingbeschlag: Glutwaage
  p.rect(12, fy - 13, 3, 1, G[3]); p.px(13, fy - 14, G[4]); p.line(13, fy - 13, 13, fy - 6, G[2]);
  p.line(10, fy - 12, 16, fy - 12, G[2]); p.px(10, fy - 11, G[2]); p.px(16, fy - 11, G[2]);
  p.rect(9, fy - 10, 3, 1, G[3]); p.rect(15, fy - 10, 3, 1, G[3]); p.rect(12, fy - 6, 3, 1, G[1]);
  g.px(13, fy - 14, PAL.ember[4]);
  // schräge Pultplatte
  for (let i = 0; i < 4; i++) p.rect(5 + i, fy - 20 + i, 17 - i, 1, WOOD[3 - (i >> 1)]);
  p.rect(5, fy - 20, 17, 1, WOOD[4]);
  // aufgeschlagenes Buch
  p.rect(9, fy - 22, 4, 3, PAGE[2]); p.rect(13, fy - 22, 4, 3, PAGE[1]); p.px(13, fy - 22, PAGE[0]);
  p.px(10, fy - 21, PAGE[0]); p.px(11, fy - 21, PAGE[0]); p.px(14, fy - 21, PAGE[0]); p.px(15, fy - 20, PAGE[0]);
  p.rect(9, fy - 19, 8, 1, WINE[2]);
  // Kerze in Messinghalter
  p.rect(6, fy - 22, 2, 2, G[2]); p.rect(6, fy - 26, 2, 4, '#e8dcc0'); p.px(6, fy - 26, '#fffbef');
  p.px(6, fy - 27, PAL.ember[4]); p.px(7, fy - 28, PAL.ember[5]);
  g.px(6, fy - 27, PAL.ember[4]); g.px(7, fy - 28, PAL.ember[5]); g.px(7, fy - 27, PAL.ember[3]);
}

export function createAuctioneerSprites() {
  const phases = (n) => [...Array(n)].map((_, i) => i / n);
  const idle = new Animation(phases(6).map((t) => mkFrame((p, g) => draw(p, g, { t }))), 6);
  const talk = new Animation([
    mkFrame((p, g) => draw(p, g, { t: 0.1, talk: 1, gest: 1 })),
    mkFrame((p, g) => draw(p, g, { t: 0.25, talk: 0, gest: 2 })),
    mkFrame((p, g) => draw(p, g, { t: 0.4, talk: 1, gest: 2 })),
    mkFrame((p, g) => draw(p, g, { t: 0.55, talk: 0, gest: 0 })),
  ], 6);
  const gc = new PixelCanvas(LW, LH);
  const lectern = buildFrame(LW, LH, LAX, LAY, (p) => drawLectern(p, gc));
  return { idle, talk, lectern, lecternGlow: gc.canvas };
}
