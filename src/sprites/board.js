import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { FineCanvas, fineRes } from '../gfx/Fine.js';
import { hash2 } from '../core/math.js';
import { buildFine, fmap, grain, stitch } from './npcFine.js';

// Auftragsbrett (Städte/Lager): Holztafel unter kleinem Schindeldach auf zwei
// Pfosten, angepinnte Zettel und ein Steckbrief, eine Laterne am Dachende.
// Glow-Canvas (W+2)×(H+2) mit 1 px Versatz (wie buildFrame-Umriss); im Feinraster FineCanvas (W+1)×(H+1) mit
// Versatz 0,5 (Texelgröße = Sprite inkl. Umriss, drawGlowLayer zeichnet beides richtig).
// mark/markGlow: leuchtendes Ausrufezeichen (wird vom Code schwebend gezeichnet,
// wenn das Brett etwas anbietet).
// Feinraster Stufe B: buildFine – alte Zeichnung grob, Details (Maserung, Nägel, Schindeln, Handschrift, Laterne) fein.
const WOOD = ['#120a07', '#1f130d', '#2e1d13', '#412a1b', '#573a25', '#714c30', '#8a6040'];
const PAPER = ['#5e523e', '#8a7a5c', '#b8a682', '#d8c8a0', '#efe2bc'];
const IRON = PAL.steel;
const GOLD = PAL.gold;
const FLAME = PAL.ember;
const INK = '#3e3426';

// Leuchtebene passend zum Sprite (W×H Weltpixel): fein (Versatz 0,5) oder alt (Versatz 1). G = Weltpixel, D = Feinpixel.
function glowLayer(w, h) {
  if (fineRes() >= 2) {
    const g = new FineCanvas(w + 1, h + 1, 2);
    return { g, fine: true, G: (x, y, c) => g.px(x + 0.5, y + 0.5, c), D: (x, y, c) => g.dot(x + 0.5, y + 0.5, c) };
  }
  const g = new PixelCanvas(w + 2, h + 2);
  return { g, fine: false, G: (x, y, c) => g.px(x + 1, y + 1, c), D: () => {} };
}
const nail = (p, x, y) => fmap(p, x, y, ['42', '20'], { 4: IRON[4], 2: IRON[2], 0: IRON[0] });

export function createBoardSprites() {
  const W = 34, H = 42, cx = 17, bottom = H - 1;
  const GL = glowLayer(W, H), G = GL.G, D = GL.D;
  // Leuchtebene nur einmal beschreiben: alter Weg im groben Durchgang, feiner im feinen
  const glowHere = (p) => (GL.fine ? p.fine : true);

  const sprite = buildFine(W, H, cx, bottom, (p) => {
    const fine = p.fine;
    // --- Pfosten
    for (const x0 of [4, W - 7]) {
      for (let y = 7; y <= bottom; y++) {
        p.px(x0, y, WOOD[4]); p.px(x0 + 1, y, WOOD[3]); p.px(x0 + 2, y, WOOD[1]);
        if (!fine && hash2(x0, y, 3) < 0.12) p.px(x0 + 1, y, WOOD[2]);
      }
      // Erdhügel am Fuß
      p.rect(x0 - 1, bottom, 5, 1, '#2a2018'); p.px(x0 - 1, bottom - 1, '#3a2c20');
      if (fine) {
        // Lichtkante, Maserung längs, ein Astloch, Kerbe am Fuß, Kiesel im Erdhügel
        p.rect(x0, 7, 0.5, bottom - 7, WOOD[5]); p.rect(x0 + 2.5, 7, 0.5, bottom - 7, WOOD[0]);
        grain(p, x0 + 0.5, 7, 2, bottom - 8, WOOD[2], WOOD[5], x0, false);
        fmap(p, x0 + 0.5, x0 < 10 ? 24 : 28, ['.22.', '2102', '.23.'], { 0: WOOD[0], 1: WOOD[1], 2: WOOD[2], 3: WOOD[5] });
        p.rect(x0, bottom - 1.5, 3, 0.5, WOOD[2]);
        fmap(p, x0 - 1, bottom - 1, ['54....', '4.....', '.33.42'], { 5: '#5a4a38', 4: '#3a2c20', 3: '#4a3a2a', 2: '#1e160f' });
      }
    }
    // --- Tafel: waagrechte Bohlen mit Fugen
    const bx0 = 6, bx1 = W - 7, by0 = 11, by1 = 31;
    for (let y = by0; y <= by1; y++) {
      const row = Math.floor((y - by0) / 5), k = (y - by0) % 5;
      for (let x = bx0; x <= bx1; x++) {
        let c = k === 0 ? WOOD[1] : k === 1 ? WOOD[4] : WOOD[3];
        if (!fine && k > 1 && hash2(x, row, 7) < 0.15) c = WOOD[2];
        if (!fine && k > 1 && hash2(x + 3, y, 8) < 0.04) c = WOOD[5];
        p.px(x, y, c);
      }
    }
    if (fine) {
      // Bohlen: tiefe Fuge, Kantenlicht, Maserung quer, Nägel an den Enden
      for (let r = 0; r * 5 + by0 <= by1; r++) {
        const y = by0 + r * 5, bw = bx1 - bx0 + 1;
        p.rect(bx0, y, bw, 0.5, WOOD[0]); p.rect(bx0, y + 1, bw, 0.5, WOOD[5]);
        if (y + 2 <= by1) grain(p, bx0, y + 2, bw, Math.min(3, by1 - y - 1), WOOD[2], WOOD[4], r + 3, true);
        if (y + 2 <= by1) { nail(p, bx0 + 0.5, y + 2); nail(p, bx1 - 0.5, y + 2); }
      }
    }
    // Rahmen
    for (let x = bx0 - 1; x <= bx1 + 1; x++) { p.px(x, by0 - 1, WOOD[5]); p.px(x, by1 + 1, WOOD[1]); p.px(x, by1 + 2, WOOD[2]); }
    for (let y = by0 - 1; y <= by1 + 1; y++) { p.px(bx0 - 1, y, WOOD[5]); p.px(bx1 + 1, y, WOOD[2]); }
    if (fine) {
      p.rect(bx0 - 1, by0 - 1, bx1 - bx0 + 3, 0.5, WOOD[6]); p.rect(bx0 - 1, by0 - 1, 0.5, by1 - by0 + 3, WOOD[6]);
      p.rect(bx0, by0 - 0.5, bx1 - bx0 + 1, 0.5, WOOD[3]); p.rect(bx1 + 1.5, by0 - 1, 0.5, by1 - by0 + 3, WOOD[1]);
      p.rect(bx0 - 1, by1 + 2.5, bx1 - bx0 + 3, 0.5, WOOD[1]);
      for (const [x, y] of [[bx0 - 1, by0 - 1], [bx1 + 1, by0 - 1], [bx0 - 1, by1 + 1], [bx1 + 1, by1 + 1]]) p.dot(x + 0.5, y + 0.5, WOOD[1]);
    }
    // --- Dach: Schindeln, leicht überstehend, Firstbalken
    for (let y = 3; y <= 9; y++) {
      const inset = Math.max(0, 3 - (y - 3));
      for (let x = 1 + inset; x <= W - 2 - inset; x++) {
        const row = y - 3;
        const shift = row % 2 ? 2 : 0;
        const seam = (x + shift) % 4 === 0;
        let c = row === 0 ? WOOD[6] : seam ? WOOD[1] : row >= 5 ? WOOD[2] : row % 2 ? WOOD[4] : WOOD[5];
        if (!fine && !seam && hash2(x, y, 11) < 0.1) c = WOOD[3];
        p.px(x, y, c);
        if (!fine || row === 0) continue;
        // fein: Schindel unten im Schatten der nächsten Reihe, Fuge schmal mit Lichtkante, Spitzen abgenutzt
        const base = row >= 5 ? 2 : row % 2 ? 4 : 5;
        if (seam) { p.rect(x, y, 0.5, 1, WOOD[0]); p.rect(x + 0.5, y, 0.5, 1, WOOD[base + 1] ?? WOOD[6]); }
        else {
          p.dot(x, y + 0.5, WOOD[base - 1]); p.dot(x + 0.5, y + 0.5, WOOD[base - 1]);
          if ((x + shift) % 4 === 1) p.dot(x, y, WOOD[base + 1] ?? WOOD[6]);
          if ((x + shift) % 4 === 3 && hash2(x, row, 13) < 0.5) p.dot(x + 0.5, y + 0.5, WOOD[base - 2]);
        }
      }
    }
    for (let x = 0; x <= W - 1; x++) p.px(x, 9, x % 5 === 0 ? WOOD[0] : WOOD[1]); // Traufkante
    if (fine) {
      p.rect(4, 3, W - 8, 0.5, '#a07850');                                         // First mit Glanz
      p.rect(0, 9, W, 0.5, WOOD[2]);
      for (let x = 0; x <= W - 1; x += 5) fmap(p, x, 9, ['43', '21'], { 4: WOOD[4], 3: WOOD[3], 2: WOOD[2], 1: WOOD[0] }); // Sparrenköpfe
      // Moos in Polstern auf den unteren Schindeln
      for (const [x, y, big] of [[5, 6, true], [12, 7, false], [20, 5, true], [27, 7, false], [24, 6, false]]) {
        fmap(p, x, y, big ? ['.122.', '12221', '.1.1.'] : ['.12', '121', '1..'], { 1: '#2c3d28', 2: '#4a6440' });
      }
    } else {
      // Moos auf dem Dach
      for (let x = 3; x < W - 3; x++) if (hash2(x, 1, 12) < 0.18) p.px(x, 4 + (x % 2), '#3c5236');
    }

    // --- Zettel (Pergament, leicht schief durch versetzte Kanten)
    const note = (x, y, w, h, tone, lines = true, tilt = 0) => {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const xx = x + i + (tilt && j > h / 2 ? tilt : 0);
        let c = PAPER[tone];
        if (!fine && (j === h - 1 || i === w - 1)) c = PAPER[tone - 1];
        if (i === 0 && j === 0) c = PAPER[tone + 1] ?? c;
        if (!fine && hash2(xx, y + j, 19) < 0.08) c = PAPER[tone - 1];
        p.px(xx, y + j, c);
      }
      if (!fine) {
        if (lines) for (let j = 2; j < h - 1; j += 2) for (let i = 1; i < w - 2; i++) if (hash2(x + i, y + j, 21) < 0.75) p.px(x + i + (tilt && j > h / 2 ? tilt : 0), y + j, PAPER[0]);
        return;
      }
      // fein: Kanten schmal und dunkler, Eselsohr unten rechts, Handschrift als feine Wortreihen
      for (let j = 0; j < h; j++) {
        const xx = x + (tilt && j > h / 2 ? tilt : 0);
        p.dot(xx + w - 0.5, y + j, PAPER[tone - 1]); p.dot(xx + w - 0.5, y + j + 0.5, PAPER[tone - 1]);
        if (j === h - 1) p.rect(xx, y + j + 0.5, w, 0.5, PAPER[tone - 1]);
      }
      const ex = x + w - 1 + (tilt && h - 1 > h / 2 ? tilt : 0), ey = y + h - 1;
      fmap(p, ex, ey, ['32', '2.'], { 3: PAPER[tone + 1] ?? PAPER[tone], 2: PAPER[tone - 1] });
      if (!lines) return;
      for (let j = 1.5; j < h - 1; j += 1.5) {
        const xx = x + (tilt && j > h / 2 ? tilt : 0);
        let u = 0.5;
        while (u < w - 1.5) {
          const len = 0.5 + Math.floor(hash2(x * 7 + Math.round(u * 2), Math.round(j * 2), 23) * 4) * 0.5;
          for (let v = 0; v < len && u + v < w - 1; v += 0.5) p.dot(xx + u + v, y + j, INK);
          if (hash2(x + Math.round(u * 2), y + Math.round(j * 2), 29) < 0.2) p.dot(xx + u, y + j - 0.5, INK);
          u += len + 0.5;
        }
      }
    };
    note(8, 13, 7, 9, 3, true, 0);
    note(9, 24, 6, 6, 2, true, 1);
    note(24, 21, 5, 8, 3, true, 0);
    // Steckbrief: rote Kopfzeile, Gesicht, Kopfgeld
    const sx = 16, sy = 12, sw = 8, sh = 12;
    note(sx, sy, sw, sh, 4, false);
    p.rect(sx + 1, sy + 1, sw - 3, 1, '#8a2018');
    if (!fine) {
      // Gesicht (Kapuze, Augen)
      p.rect(sx + 2, sy + 3, 3, 4, PAPER[1]); p.px(sx + 1, sy + 4, PAPER[1]); p.px(sx + 5, sy + 4, PAPER[1]);
      p.px(sx + 2, sy + 5, '#2a1a10'); p.px(sx + 4, sy + 5, '#2a1a10'); p.rect(sx + 2, sy + 3, 3, 1, PAPER[0]);
      p.rect(sx + 1, sy + 8, 5, 1, PAPER[0]);
      p.px(sx + 2, sy + 10, GOLD[2]); p.px(sx + 3, sy + 10, GOLD[2]); p.px(sx + 4, sy + 10, GOLD[1]);
    } else {
      // Kopfzeile als Schrift in Rot, Kohlezeichnung des Gesuchten unter der Kapuze, Kopfgeld-Zeile und Münzen
      p.rect(sx + 1, sy + 1.5, sw - 3, 0.5, PAPER[4]);
      fmap(p, sx + 1, sy + 1.5, ['r.rr.r.rr.'], { r: '#a83024' });
      fmap(p, sx + 1, sy + 2.5, [
        '...0000...',
        '..011110..',
        '.01122110.',
        '.0123321..',
        '.01k33k1..',
        '.0123321..',
        '..01331...',
        '..011110..',
        '.00111100.',
        '0011111100',
      ], { 0: INK, 1: PAPER[1], 2: PAPER[2], 3: PAPER[3], k: '#1e140c' });
      p.rect(sx + 1, sy + 8, 3, 0.5, INK); p.rect(sx + 4.5, sy + 8, 1.5, 0.5, INK);
      fmap(p, sx + 2, sy + 9.5, ['.43..43..', '4321432.', '.21..21..'], { 4: GOLD[4], 3: GOLD[3], 2: GOLD[2], 1: GOLD[1] });
      p.rect(sx + 5.5, sy + 10, 1, 0.5, INK);
    }
    // Nadeln (Messing, eine rot)
    const pins = [[11, 13, GOLD[3]], [19, 12, '#c83a2a'], [11, 24, GOLD[3]], [26, 21, GOLD[3]]];
    for (const [x, y, c] of pins) {
      const brass = c === GOLD[3];
      if (!fine) p.px(x, y, c);
      else {
        fmap(p, x, y, ['43', '32'], brass ? { 4: GOLD[4], 3: GOLD[3], 2: GOLD[1] } : { 4: '#ff8a70', 3: '#c83a2a', 2: '#7a1a10' });
        p.dot(x + 1, y + 1, PAPER[0]);                                     // Schatten der Nadel
      }
      if (glowHere(p)) { G(x, y, brass ? 'rgba(255,240,170,0.5)' : 'rgba(255,120,90,0.4)'); D(x, y, brass ? '#fff6d0' : '#ffb8a0'); }
    }
    // Zerrissener Rest eines alten Zettels
    p.px(21, 27, PAPER[1]); p.px(22, 27, PAPER[2]); p.px(21, 28, PAPER[1]);
    if (fine) { p.dot(22.5, 27.5, PAPER[1]); p.dot(21.5, 28.5, PAPER[0]); p.dot(21, 27, PAPER[2]); }

    // --- Laterne am rechten Dachende
    const lx = W - 3;
    p.px(lx, 10, IRON[1]); p.px(lx, 11, IRON[2]);
    p.rect(lx - 2, 12, 5, 1, IRON[3]);            // Deckel
    p.rect(lx - 2, 13, 1, 5, IRON[1]); p.rect(lx + 2, 13, 1, 5, IRON[1]);
    p.rect(lx - 1, 13, 3, 5, FLAME[3]);           // Glas mit Flamme
    p.px(lx, 14, FLAME[5]); p.px(lx, 15, FLAME[4]);
    p.rect(lx - 2, 18, 5, 1, IRON[2]);
    if (fine) {
      // Haken als Ring, Deckel mit Glanzlinie, Streben mit Lichtkante, Flamme mit heißem Kern, Glasglanz
      fmap(p, lx - 0.5, 10, ['.31', '2.0', '.21', '.32'], { 3: IRON[3], 2: IRON[2], 1: IRON[1], 0: IRON[0] });
      fmap(p, lx - 2, 12, ['.45444432.', '3332222110'], { 5: IRON[5], 4: IRON[4], 3: IRON[3], 2: IRON[2], 1: IRON[1], 0: IRON[0] });
      for (const fx of [lx - 2, lx + 2]) { p.rect(fx, 13, 0.5, 5, fx < lx ? IRON[3] : IRON[2]); p.rect(fx + 0.5, 13, 0.5, 5, IRON[0]); }
      fmap(p, lx - 1, 13, [
        '333333',
        '33w433',
        '334543',
        '345543',
        '345543',
        '334543',
        '333433',
        '332223',
        '322122',
        '222222',
      ], { w: '#fff6d8', 5: FLAME[5], 4: FLAME[4], 3: FLAME[3], 2: FLAME[2], 1: '#3a1a0a' });
      p.dot(lx - 1, 13, '#ffe8b0');
      fmap(p, lx - 2, 18, ['3333332', '1111100'], { 3: IRON[3], 2: IRON[2], 1: IRON[1], 0: IRON[0] });
      p.dot(lx + 2.5, 18.5, IRON[0]);
    }
    if (glowHere(p)) {
      if (!GL.fine) {
        for (let y = 13; y <= 17; y++) for (let x = lx - 1; x <= lx + 1; x++) G(x, y, y < 16 && x === lx ? '#fff4d0' : FLAME[4]);
        G(lx, 12, FLAME[3]); G(lx, 18, FLAME[3]);
      } else {
        // fein: Glas im warmen Saum, Flamme als heißer heller Kern, Licht auf Deckel und Boden nur als Feinkante
        fmap(GL.g, lx - 0.5, 13.5, [
          '444444',
          '44w544',
          '445w54',
          '45ww54',
          '45ww54',
          '445w54',
          '444544',
          '444444',
          '443344',
          '433334',
        ], { w: '#fff8e0', 5: '#fff0b0', 4: FLAME[4], 3: FLAME[3] });
        GL.g.rect(lx - 0.5, 13, 3, 0.5, FLAME[3]); GL.g.rect(lx - 0.5, 18.5, 3, 0.5, FLAME[3]);
      }
    }
    // Querriegel zwischen den Pfosten
    for (let x = 6; x <= W - 7; x++) { p.px(x, 35, WOOD[4]); p.px(x, 36, WOOD[2]); }
    if (fine) {
      p.rect(6, 35, W - 12, 0.5, WOOD[5]); p.rect(6, 36.5, W - 12, 0.5, WOOD[1]);
      grain(p, 7, 35.5, W - 14, 1, WOOD[3], null, 9, true);
      nail(p, 6.5, 35.5); nail(p, W - 7.5, 35.5);
    }
  });

  // Ausrufezeichen (Angebot)
  const MG = glowLayer(7, 12);
  const MARK_BAR = [
    '.4433.',
    '455332',
    '455332',
    '455332',
    '455321',
    '.45321',
    '.4532.',
    '.4532.',
    '.4432.',
    '.4321.',
    '..321.',
    '..32..',
    '..21..',
    '..21..',
  ];
  const MARK_DOT = ['.4433.', '455432', '454332', '433321', '433221', '.2211.'];
  const mark = buildFine(7, 12, 3, 11, (p) => {
    if (!p.fine) {
      p.rect(2, 0, 3, 7, GOLD[3]); p.rect(2, 0, 1, 7, GOLD[4]); p.rect(4, 0, 1, 7, GOLD[2]);
      p.rect(2, 9, 3, 3, GOLD[3]); p.px(2, 9, GOLD[4]); p.px(4, 11, GOLD[2]);
    } else {
      const pal = { 5: '#fffbe6', 4: GOLD[4], 3: GOLD[3], 2: GOLD[2], 1: GOLD[1] };
      fmap(p, 2, 0, MARK_BAR, pal); fmap(p, 2, 9, MARK_DOT, pal);
    }
    if (!MG.fine) {
      if (!p.fine) {
        for (let y = 0; y < 7; y++) for (let x = 2; x <= 4; x++) MG.g.px(x + 1, y + 1, x === 2 ? '#ffffff' : '#fff0a8');
        for (let y = 9; y < 12; y++) for (let x = 2; x <= 4; x++) MG.g.px(x + 1, y + 1, '#fff0a8');
      }
    } else if (p.fine) {
      // fein: heißer weißer Kern in der Mitte, goldgelber Saum
      const gp = { 5: '#ffffff', 4: '#fff8d8', 3: '#fff0a8', 2: '#ffe27a', 1: '#f0c050' };
      fmap(MG.g, 2.5, 0.5, MARK_BAR, gp); fmap(MG.g, 2.5, 9.5, MARK_DOT, gp);
    }
  });

  return {
    sprite, glow: GL.g.canvas, mark, markGlow: MG.g.canvas, markY: -H + 1,
    box: [-13, -5, 13, 1],
    lantern: { dx: W - 3 - cx, dy: -H + 16 },
  };
}
