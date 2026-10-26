import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFine } from '../sprites/npcFine.js';
import { DAWN } from './art.js';

// Sternentafel für die Städte: heller Stein mit eingelassenem Morgenbild, goldener Stern auf dem Giebel.
// Anker = Fußpunkt, Licht oben links.
// Feinraster Stufe B wie der Briefkasten (mail/sprite.js): grob gezeichnet, Glanz und Details im feinen Durchgang.
// Leuchtebene in Weltpixeln (W+2)×(H+2) mit 1 px Versatz (gleiche Größe wie das umrandete Bild).

// Muster in Weltpixeln (ein Zeichen = ein Weltpixel), '.' = frei
const pmap = (p, x, y, rows, pal) => rows.forEach((r, j) => [...r].forEach((ch, i) => { if (pal[ch]) p.px(x + i, y + j, pal[ch]); }));
const hx = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
const S = DAWN.stone.map(hx), C = DAWN.crystal.map(hx), SKY = DAWN.sky.map(hx), RF = DAWN.roof.map(hx);
const CL = DAWN.cliff.map(hx), LN = DAWN.lantern.map(hx);
const GOLD = ['#5a3a20', '#a8742e', '#e0b052', '#fff0a8'];

// Kleines Morgenbild (Himmel, Insel mit Turm, Stern) als Plakat, x/y = obere linke Ecke, w×h Weltpixel
function poster(p, x, y, w, h) {
  const band = [SKY[1], SKY[2], SKY[3], SKY[4], SKY[5], SKY[6], SKY[7]];
  for (let j = 0; j < h; j++) p.rect(x, y + j, w, 1, band[Math.min(band.length - 1, Math.floor(j / h * band.length))]);
  // Insel mit Kiel
  const cx = x + Math.floor(w / 2), iy = y + Math.floor(h * 0.62);
  p.rect(cx - 5, iy, 11, 1, '#507468'); p.rect(cx - 4, iy + 1, 9, 1, CL[3]); p.rect(cx - 3, iy + 2, 7, 1, CL[2]); p.rect(cx - 1, iy + 3, 3, 1, CL[1]);
  p.px(cx, iy + 4, C[3]);
  // Turm mit Stern und Häuser
  p.rect(cx, iy - 7, 1, 7, S[4]); p.rect(cx - 3, iy - 2, 2, 2, S[3]); p.rect(cx + 2, iy - 3, 2, 3, S[3]);
  p.px(cx - 3, iy - 3, RF[3]); p.px(cx - 2, iy - 3, RF[2]); p.rect(cx + 2, iy - 4, 2, 1, RF[3]);
  p.px(cx, iy - 9, LN[4]); p.px(cx - 1, iy - 9, LN[2]); p.px(cx + 1, iy - 9, LN[2]); p.px(cx, iy - 10, LN[2]); p.px(cx, iy - 8, LN[2]);
  p.px(x + 2, y + 2, '#ffffff'); p.px(x + w - 3, y + 4, '#e8e8ff');
  if (p.fine) {
    p.dot(x + 1.5, y + 5, '#e8e8ff'); p.dot(x + w - 2, y + 1.5, '#ffffff');
    p.rect(cx - 5, iy, 5, 0.5, '#97b896'); p.dot(cx - 0.5, iy - 7, S[5]);
    p.dot(x + 1, iy + 2.5, SKY[3]); p.dot(x + w - 2, iy - 1, SKY[3]);
  }
}

// --- A: Sternentafel aus hellem Stein (eingelassenes Plakat, goldener Stern als Bekrönung, Inschrift)
const A = { W: 24, H: 50, AX: 12, AY: 48 };
function steleA(p) {
  const fy = A.AY;
  // Sockel zwei Lagen
  p.rect(2, fy - 3, 20, 4, S[1]); p.rect(2, fy - 3, 20, 1, S[3]); p.rect(2, fy - 2, 1, 3, S[2]); p.rect(21, fy - 2, 1, 3, S[0]);
  p.rect(4, fy - 6, 16, 3, S[2]); p.rect(4, fy - 6, 16, 1, S[4]); p.rect(19, fy - 5, 1, 2, S[1]);
  // Platte mit Giebel
  p.rect(4, fy - 36, 16, 30, S[3]); p.rect(4, fy - 36, 1, 30, S[4]); p.rect(19, fy - 36, 1, 30, S[1]); p.rect(18, fy - 36, 1, 30, S[2]);
  for (let i = 0; i < 4; i++) p.rect(5 + i * 2, fy - 37 - i, 14 - i * 4, 1, i === 3 ? S[4] : S[3]);
  p.rect(4, fy - 37, 16, 1, S[2]);
  // Rahmen (Gold) und Plakat
  p.rect(5, fy - 33, 14, 20, GOLD[1]); p.rect(5, fy - 33, 14, 1, GOLD[2]); p.rect(5, fy - 33, 1, 20, GOLD[2]); p.rect(18, fy - 33, 1, 20, GOLD[0]); p.rect(5, fy - 14, 14, 1, GOLD[0]);
  poster(p, 6, fy - 32, 12, 18);
  // Inschrift
  p.rect(7, fy - 11, 10, 1, S[1]); p.rect(8, fy - 9, 8, 1, S[1]);
  // goldener Stern auf dem Giebel
  pmap(p, 9, fy - 47, ['...3...', '...3...', '..323..', '3322211', '..211..', '...1...', '...1...'], { 3: GOLD[3], 2: GOLD[2], 1: GOLD[1] });
  if (p.fine) {
    p.rect(4, fy - 36, 0.5, 30, S[5]); p.rect(2, fy - 3, 20, 0.5, S[4]); p.rect(4, fy - 6, 16, 0.5, S[5]);
    for (const x of [8, 15]) p.rect(x, fy - 2.5, 0.5, 3, S[0]);
    p.rect(5.5, fy - 32.5, 13, 0.5, GOLD[3]); p.dot(5.5, fy - 32.5, '#ffffff');
    p.dot(12, fy - 44, '#ffffff'); p.dot(11.5, fy - 44.5, GOLD[3]);
    p.dot(17, fy - 22, S[1]); p.dot(6, fy - 8, S[2]);
  }
}
function glowA(g) {
  const fy = A.AY;
  g.rect(11, fy - 45, 3, 3, GOLD[3]); g.px(12, fy - 47, GOLD[2]); g.px(12, fy - 41, GOLD[2]);
}

function glowCanvas(d, draw) {
  const gc = new PixelCanvas(d.W + 2, d.H + 2);
  gc.ctx.translate(1, 1);
  draw(gc);
  return gc.canvas;
}

// Liefert { frame, glow, box, light, top } (top = Höhe für die Interaktionsanzeige)
export function createBoardSprites() {
  return { frame: buildFine(A.W, A.H, A.AX, A.AY, (p) => steleA(p)), glow: glowCanvas(A, glowA), box: [-9, -5, 9, 1], light: { dx: 0, dy: -44, radius: 30, color: [255, 220, 150] }, top: 52 };
}
