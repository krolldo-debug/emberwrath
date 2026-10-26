import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFine } from '../sprites/npcFine.js';
import { DAWN } from './art.js';

// Ankündigungstafeln „Sternenglut“ für die Städte. Drei Entwürfe (Vorschau), Anker = Fußpunkt, Licht oben links.
// Feinraster Stufe B wie der Briefkasten (mail/sprite.js): grob gezeichnet, Glanz und Details im feinen Durchgang.
// Leuchtebene in Weltpixeln (W+2)×(H+2) mit 1 px Versatz (gleiche Größe wie das umrandete Bild).
// Muster in Weltpixeln (ein Zeichen = ein Weltpixel), '.' = frei
const pmap = (p, x, y, rows, pal) => rows.forEach((r, j) => [...r].forEach((ch, i) => { if (pal[ch]) p.px(x + i, y + j, pal[ch]); }));
const hx = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
const S = DAWN.stone.map(hx), C = DAWN.crystal.map(hx), SKY = DAWN.sky.map(hx), LF = DAWN.leaf.map(hx), RF = DAWN.roof.map(hx);
const CL = DAWN.cliff.map(hx), LN = DAWN.lantern.map(hx);
const WOOD = ['#1a1420', '#2a2030', '#3c2e42', '#524058', '#6a5470'];
const GOLD = ['#5a3a20', '#a8742e', '#e0b052', '#fff0a8'];
const CLOTH = ['#1a1238', '#26195a', '#34227a', '#46309a'];

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

// --- B: Herold-Staffelei (Holzgestell, gerahmtes Bild, Rosen-Wimpel und Laterne)
const B = { W: 30, H: 54, AX: 15, AY: 52 };
function easelB(p) {
  const fy = B.AY;
  // Beine (A-Gestell) und Hinterbein
  p.line(7, fy, 11, fy - 42, WOOD[2]); p.line(8, fy, 12, fy - 42, WOOD[3]);
  p.line(23, fy, 19, fy - 42, WOOD[1]); p.line(22, fy, 18, fy - 42, WOOD[2]);
  p.line(15, fy - 2, 15, fy - 34, WOOD[1]);
  p.rect(6, fy - 14, 18, 2, WOOD[2]); p.rect(6, fy - 14, 18, 1, WOOD[3]);
  // Rahmen und Bild
  p.rect(3, fy - 42, 24, 28, GOLD[1]); p.rect(3, fy - 42, 24, 1, GOLD[2]); p.rect(3, fy - 42, 1, 28, GOLD[2]); p.rect(26, fy - 42, 1, 28, GOLD[0]); p.rect(3, fy - 15, 24, 1, GOLD[0]);
  poster(p, 5, fy - 40, 20, 24);
  // Wimpel oben mit Stern
  p.rect(11, fy - 47, 8, 5, LF[3]); p.rect(11, fy - 47, 8, 1, LF[4]); for (const x of [11, 13, 16, 18]) p.px(x, fy - 42, LF[2]);
  p.px(15, fy - 45, LN[4]); p.px(14, fy - 45, LN[2]); p.px(16, fy - 45, LN[2]);
  if (p.fine) {
    p.rect(3.5, fy - 41.5, 23, 0.5, GOLD[3]); p.dot(3.5, fy - 41.5, '#ffffff'); p.rect(3.5, fy - 41.5, 0.5, 8, GOLD[3]);
    p.rect(11, fy - 47, 8, 0.5, LF[5]);
    p.fline(8.5, fy - 1, 12, fy - 41, WOOD[4]);
  }
}
function glowB(g) {
  const fy = B.AY;
  g.px(15, fy - 45, LN[4]);
}

// --- C: Bannerständer (zwei Messingstangen, langes Sternenbanner mit Morgenkante, Kristall auf dem Querholz)
const Cc = { W: 22, H: 50, AX: 11, AY: 48 };
function bannerC(p) {
  const fy = Cc.AY;
  // Steinfüße
  p.rect(2, fy - 3, 5, 4, S[2]); p.rect(2, fy - 3, 5, 1, S[4]); p.rect(15, fy - 3, 5, 4, S[2]); p.rect(15, fy - 3, 5, 1, S[4]);
  // Stangen
  p.rect(4, fy - 42, 1, 39, GOLD[1]); p.rect(5, fy - 42, 1, 39, GOLD[0]); p.rect(17, fy - 42, 1, 39, GOLD[1]); p.rect(18, fy - 42, 1, 39, GOLD[0]);
  p.rect(3, fy - 42, 17, 2, WOOD[3]); p.rect(3, fy - 42, 17, 1, WOOD[4]);
  // Banner
  p.rect(6, fy - 40, 11, 30, CLOTH[2]); p.rect(6, fy - 40, 1, 30, CLOTH[3]); p.rect(16, fy - 40, 1, 30, CLOTH[0]);
  for (let i = 0; i < 11; i++) { const d = [0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0][i]; p.rect(6 + i, fy - 10, 1, d, CLOTH[1]); p.px(6 + i, fy - 10 + d, SKY[6]); }
  // Morgenband und Stern
  p.rect(6, fy - 18, 11, 2, SKY[5]); p.rect(6, fy - 16, 11, 1, SKY[6]); p.rect(6, fy - 15, 11, 1, SKY[7]);
  pmap(p, 8, fy - 34, ['...3...', '...3...', '..343..', '3344433', '..343..', '...3...', '...3...'], { 4: '#ffffff', 3: GOLD[2] });
  p.rect(7, fy - 24, 9, 1, GOLD[1]); p.rect(8, fy - 22, 7, 1, GOLD[1]);
  // Kristall oben
  pmap(p, 9, fy - 47, ['..3..', '.343.', '.342.', '33421', '.221.'], { 4: C[4], 3: C[3], 2: C[2], 1: C[1] });
  if (p.fine) {
    p.rect(4, fy - 42, 0.5, 39, GOLD[3]); p.rect(17, fy - 42, 0.5, 39, GOLD[3]);
    p.rect(6.5, fy - 40, 0.5, 30, '#5a40b0');
    for (let y = fy - 39; y < fy - 19; y += 3) p.dot(14.5, y, CLOTH[3]);
    p.dot(9.5, fy - 38, '#e8e8ff'); p.dot(14, fy - 28, '#e8e8ff');
  }
}
function glowC(g) {
  const fy = Cc.AY;
  g.rect(10, fy - 46, 2, 3, C[3]); g.px(10, fy - 45, '#ffffff');
  g.px(11, fy - 31, '#fff0c8');
}

function glowCanvas(d, draw) {
  const gc = new PixelCanvas(d.W + 2, d.H + 2);
  gc.ctx.translate(1, 1);
  draw(gc);
  return gc.canvas;
}

// Liefert { frames, seq, fps, glow(i), box, light, prompt } je Entwurf
export function createBoardSprites(variant = 'A') {
  if (variant === 'B') {
    const f = buildFine(B.W, B.H, B.AX, B.AY, (p) => easelB(p));
    return { frames: [f], seq: [0], fps: 1, glows: [glowCanvas(B, glowB)], box: [-9, -4, 9, 1], light: { dx: 0, dy: -45, radius: 30, color: [255, 200, 150] }, top: 56 };
  }
  if (variant === 'C') {
    const f = buildFine(Cc.W, Cc.H, Cc.AX, Cc.AY, (p) => bannerC(p));
    return { frames: [f], seq: [0], fps: 1, glows: [glowCanvas(Cc, glowC)], box: [-9, -4, 9, 1], light: { dx: 0, dy: -45, radius: 34, color: [130, 230, 255] }, top: 52 };
  }
  const f = buildFine(A.W, A.H, A.AX, A.AY, (p) => steleA(p));
  return { frames: [f], seq: [0], fps: 1, glows: [glowCanvas(A, glowA)], box: [-9, -5, 9, 1], light: { dx: 0, dy: -44, radius: 30, color: [255, 220, 150] }, top: 52 };
}
