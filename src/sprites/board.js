import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame } from '../gfx/Sprite.js';
import { hash2 } from '../core/math.js';

// Auftragsbrett (Städte/Lager): Holztafel unter kleinem Schindeldach auf zwei
// Pfosten, angepinnte Zettel und ein Steckbrief, eine Laterne am Dachende.
// Glow-Canvas (W+2)×(H+2) mit 1 px Versatz (wie buildFrame-Umriss).
// mark/markGlow: leuchtendes Ausrufezeichen (wird vom Code schwebend gezeichnet,
// wenn das Brett etwas anbietet).
const WOOD = ['#120a07', '#1f130d', '#2e1d13', '#412a1b', '#573a25', '#714c30', '#8a6040'];
const PAPER = ['#5e523e', '#8a7a5c', '#b8a682', '#d8c8a0', '#efe2bc'];
const IRON = PAL.steel;
const GOLD = PAL.gold;
const FLAME = PAL.ember;

export function createBoardSprites() {
  const W = 34, H = 42, cx = 17, bottom = H - 1;
  const g = new PixelCanvas(W + 2, H + 2);
  const G = (x, y, c) => g.px(x + 1, y + 1, c);

  const sprite = buildFrame(W, H, cx, bottom, (p) => {
    // --- Pfosten
    for (const x0 of [4, W - 7]) {
      for (let y = 7; y <= bottom; y++) {
        p.px(x0, y, WOOD[4]); p.px(x0 + 1, y, WOOD[3]); p.px(x0 + 2, y, WOOD[1]);
        if (hash2(x0, y, 3) < 0.12) p.px(x0 + 1, y, WOOD[2]);
      }
      // Erdhügel am Fuß
      p.rect(x0 - 1, bottom, 5, 1, '#2a2018'); p.px(x0 - 1, bottom - 1, '#3a2c20');
    }
    // --- Tafel: waagrechte Bohlen mit Fugen
    const bx0 = 6, bx1 = W - 7, by0 = 11, by1 = 31;
    for (let y = by0; y <= by1; y++) {
      const row = Math.floor((y - by0) / 5), k = (y - by0) % 5;
      for (let x = bx0; x <= bx1; x++) {
        let c = k === 0 ? WOOD[1] : k === 1 ? WOOD[4] : WOOD[3];
        if (k > 1 && hash2(x, row, 7) < 0.15) c = WOOD[2];
        if (k > 1 && hash2(x + 3, y, 8) < 0.04) c = WOOD[5];
        p.px(x, y, c);
      }
    }
    // Rahmen
    for (let x = bx0 - 1; x <= bx1 + 1; x++) { p.px(x, by0 - 1, WOOD[5]); p.px(x, by1 + 1, WOOD[1]); p.px(x, by1 + 2, WOOD[2]); }
    for (let y = by0 - 1; y <= by1 + 1; y++) { p.px(bx0 - 1, y, WOOD[5]); p.px(bx1 + 1, y, WOOD[2]); }
    // --- Dach: Schindeln, leicht überstehend, Firstbalken
    for (let y = 3; y <= 9; y++) {
      const inset = Math.max(0, 3 - (y - 3));
      for (let x = 1 + inset; x <= W - 2 - inset; x++) {
        const row = y - 3;
        const shift = row % 2 ? 2 : 0;
        const seam = (x + shift) % 4 === 0;
        let c = row === 0 ? WOOD[6] : seam ? WOOD[1] : row >= 5 ? WOOD[2] : row % 2 ? WOOD[4] : WOOD[5];
        if (!seam && hash2(x, y, 11) < 0.1) c = WOOD[3];
        p.px(x, y, c);
      }
    }
    for (let x = 0; x <= W - 1; x++) p.px(x, 9, x % 5 === 0 ? WOOD[0] : WOOD[1]); // Traufkante
    // Moos auf dem Dach
    for (let x = 3; x < W - 3; x++) if (hash2(x, 1, 12) < 0.18) p.px(x, 4 + (x % 2), '#3c5236');

    // --- Zettel (Pergament, leicht schief durch versetzte Kanten)
    const note = (x, y, w, h, tone, lines = true, tilt = 0) => {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const xx = x + i + (tilt && j > h / 2 ? tilt : 0);
        let c = PAPER[tone];
        if (j === h - 1 || i === w - 1) c = PAPER[tone - 1];
        if (i === 0 && j === 0) c = PAPER[tone + 1] ?? c;
        if (hash2(xx, y + j, 19) < 0.08) c = PAPER[tone - 1];
        p.px(xx, y + j, c);
      }
      if (lines) for (let j = 2; j < h - 1; j += 2) for (let i = 1; i < w - 2; i++) if (hash2(x + i, y + j, 21) < 0.75) p.px(x + i + (tilt && j > h / 2 ? tilt : 0), y + j, PAPER[0]);
    };
    note(8, 13, 7, 9, 3, true, 0);
    note(9, 24, 6, 6, 2, true, 1);
    note(24, 21, 5, 8, 3, true, 0);
    // Steckbrief: rote Kopfzeile, Gesicht, Kopfgeld
    const sx = 16, sy = 12, sw = 8, sh = 12;
    note(sx, sy, sw, sh, 4, false);
    p.rect(sx + 1, sy + 1, sw - 3, 1, '#8a2018');
    // Gesicht (Kapuze, Augen)
    p.rect(sx + 2, sy + 3, 3, 4, PAPER[1]); p.px(sx + 1, sy + 4, PAPER[1]); p.px(sx + 5, sy + 4, PAPER[1]);
    p.px(sx + 2, sy + 5, '#2a1a10'); p.px(sx + 4, sy + 5, '#2a1a10'); p.rect(sx + 2, sy + 3, 3, 1, PAPER[0]);
    p.rect(sx + 1, sy + 8, 5, 1, PAPER[0]);
    p.px(sx + 2, sy + 10, GOLD[2]); p.px(sx + 3, sy + 10, GOLD[2]); p.px(sx + 4, sy + 10, GOLD[1]);
    // Nadeln (Messing, eine rot)
    for (const [x, y, c] of [[11, 13, GOLD[3]], [19, 12, '#c83a2a'], [11, 24, GOLD[3]], [26, 21, GOLD[3]]]) { p.px(x, y, c); G(x, y, c === GOLD[3] ? 'rgba(255,240,170,0.5)' : 'rgba(255,120,90,0.4)'); }
    // Zerrissener Rest eines alten Zettels
    p.px(21, 27, PAPER[1]); p.px(22, 27, PAPER[2]); p.px(21, 28, PAPER[1]);

    // --- Laterne am rechten Dachende
    const lx = W - 3;
    p.px(lx, 10, IRON[1]); p.px(lx, 11, IRON[2]);
    p.rect(lx - 2, 12, 5, 1, IRON[3]);            // Deckel
    p.rect(lx - 2, 13, 1, 5, IRON[1]); p.rect(lx + 2, 13, 1, 5, IRON[1]);
    p.rect(lx - 1, 13, 3, 5, FLAME[3]);           // Glas mit Flamme
    p.px(lx, 14, FLAME[5]); p.px(lx, 15, FLAME[4]);
    p.rect(lx - 2, 18, 5, 1, IRON[2]);
    for (let y = 13; y <= 17; y++) for (let x = lx - 1; x <= lx + 1; x++) G(x, y, y < 16 && x === lx ? '#fff4d0' : FLAME[4]);
    G(lx, 12, FLAME[3]); G(lx, 18, FLAME[3]);
    // Querriegel zwischen den Pfosten
    for (let x = 6; x <= W - 7; x++) { p.px(x, 35, WOOD[4]); p.px(x, 36, WOOD[2]); }
  });

  // Ausrufezeichen (Angebot)
  const mg = new PixelCanvas(7 + 2, 12 + 2);
  const mark = buildFrame(7, 12, 3, 11, (p) => {
    p.rect(2, 0, 3, 7, GOLD[3]); p.rect(2, 0, 1, 7, GOLD[4]); p.rect(4, 0, 1, 7, GOLD[2]);
    p.rect(2, 9, 3, 3, GOLD[3]); p.px(2, 9, GOLD[4]); p.px(4, 11, GOLD[2]);
    for (let y = 0; y < 7; y++) for (let x = 2; x <= 4; x++) mg.px(x + 1, y + 1, x === 2 ? '#ffffff' : '#fff0a8');
    for (let y = 9; y < 12; y++) for (let x = 2; x <= 4; x++) mg.px(x + 1, y + 1, '#fff0a8');
  });

  return {
    sprite, glow: g.canvas, mark, markGlow: mg.canvas, markY: -H + 1,
    box: [-13, -5, 13, 1],
    lantern: { dx: W - 3 - cx, dy: -H + 16 },
  };
}
