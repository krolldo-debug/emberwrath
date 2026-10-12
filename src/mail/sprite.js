import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFine, fmap, grain, tone } from '../sprites/npcFine.js';

// Rabenpost: eisenbeschlagener Briefkasten auf Steinsockel, Schindeldach, Wachssiegel unter dem Schlitz,
// Laterne am Haken (brennt, wenn Post wartet) und ein Rabe auf dem First. Anker = Fußpunkt.
// Feinraster Stufe B (npcFine.buildFine): alter Weg grob, Details im feinen Durchgang (`if (p.fine)`); bei „Niedrig“ nur alt.
// Die Leuchtebene bleibt in Weltpixeln (mail/index.js zeichnet sie direkt).
const W = 28, H = 46, AX = 13, AY = 44;
const S = PAL.stone, G = PAL.gold, ST = PAL.steel, C = PAL.crimson, E = PAL.ember;
const WOOD = ['#1e130c', '#2e1e12', '#43301c', '#5a4228', '#735634'];
const SHINGLE = ['#1a0a10', '#2e1018', '#46161f', '#5e1e28'];
const RAVEN = ['#07050b', '#130e1c', '#221a32', '#3a3258', '#6a5e9a'];
// Feinfassung (Blaukanal ±1): neu gezeichnete Formen gelten im feinen Durchgang ganz (keine Treppen aus der Grobfassung)
const nudge = (c) => '#' + ((parseInt(c.slice(1), 16) ^ 1) >>> 0).toString(16).padStart(6, '0');
const RV = { 4: nudge(RAVEN[4]), 3: nudge(RAVEN[3]), 2: nudge(RAVEN[2]), 1: nudge(RAVEN[1]), 0: nudge(RAVEN[0]) };
const STP = { w: '#ffffff', 5: ST[5], 4: ST[4], 3: ST[3], 2: ST[2], 1: ST[1], 0: ST[0] };
const NAIL = (p, x, y) => { p.dot(x, y, '#8a8a96'); p.dot(x + 0.5, y + 0.5, '#16121a'); };

function box(p) {
  const fy = AY;
  // Sockel aus zwei Steinlagen
  p.rect(6, fy - 3, 14, 4, S[1]); p.rect(6, fy - 3, 14, 1, S[3]); p.rect(6, fy - 2, 1, 3, S[2]); p.rect(19, fy - 2, 1, 3, S[0]);
  if (!p.fine) { p.px(12, fy - 2, S[0]); p.px(13, fy - 1, S[0]); p.px(9, fy - 1, S[2]); p.px(16, fy - 2, S[2]); }
  p.rect(8, fy - 5, 10, 2, S[2]); p.rect(8, fy - 5, 10, 1, S[4]);
  if (p.fine) {
    // Stein: Kantenlicht oben, Fugen (dunkel + Lichtkante), Riss, Abplatzer statt Sprenkel
    p.rect(6, fy - 3, 14, 0.5, S[4]); p.rect(6, fy - 2.5, 0.5, 3.5, S[3]); p.rect(6, fy + 0.5, 14, 0.5, S[0]);
    for (const x of [10.5, 15]) { p.rect(x, fy - 2.5, 0.5, 3, S[0]); p.rect(x + 0.5, fy - 2.5, 0.5, 3, S[2]); }
    p.fline(12.5, fy - 2.5, 13, fy - 1.5, S[0]); p.fline(13, fy - 1.5, 12.5, fy - 0.5, S[0]); p.dot(13.5, fy - 1.5, S[2]);
    p.dot(17.5, fy - 2.5, S[3]); p.dot(18, fy - 2.5, S[2]);
    p.rect(8, fy - 5, 10, 0.5, S[5]); p.rect(8, fy - 4.5, 0.5, 1.5, S[3]); p.rect(17.5, fy - 4.5, 0.5, 1.5, S[1]);
    p.rect(13, fy - 4.5, 0.5, 1.5, S[1]); p.rect(13.5, fy - 4.5, 0.5, 1.5, S[3]);
    p.dot(10, fy - 4, S[1]); p.dot(10.5, fy - 4, S[1]); p.dot(10, fy - 4.5, S[3]);
  } else { p.px(17, fy - 4, S[1]); p.px(11, fy - 4, S[1]); }
  // Pfosten
  p.rect(11, fy - 18, 4, 13, WOOD[2]); p.rect(11, fy - 18, 1, 13, WOOD[3]); p.rect(14, fy - 18, 1, 13, WOOD[1]);
  if (p.fine) {
    // Maserung, Lichtkante, Astloch
    grain(p, 11.5, fy - 18, 3, 13, WOOD[1], WOOD[3], 4);
    p.rect(11, fy - 18, 0.5, 13, WOOD[4]); p.rect(14.5, fy - 18, 0.5, 13, WOOD[0]);
    fmap(p, 12, fy - 11, ['.11.', '1001', '.13.'], { 0: WOOD[0], 1: WOOD[1], 3: WOOD[3] });
  } else { p.px(12, fy - 12, WOOD[1]); p.px(13, fy - 9, WOOD[1]); p.px(12, fy - 7, WOOD[4]); }
  // Stützen unter dem Kasten
  p.line(9, fy - 18, 11, fy - 15, WOOD[1]); p.line(16, fy - 18, 14, fy - 15, WOOD[1]);
  if (p.fine) { p.fline(9, fy - 18.5, 11, fy - 15.5, WOOD[3]); p.fline(16.5, fy - 18.5, 14.5, fy - 15.5, WOOD[2]); }
  // Kasten: senkrechte Bohlen, Eisenbänder links/rechts und quer, Nieten
  p.rect(5, fy - 31, 16, 14, WOOD[2]);
  for (let x = 7; x < 20; x += 3) p.rect(x, fy - 30, 1, 12, WOOD[1]);
  p.rect(6, fy - 30, 1, 12, WOOD[3]);
  if (p.fine) {
    // Bohlen: Maserung je Brett, Fuge dunkel mit Lichtkante, Nagelköpfe oben und unten
    for (let x = 7; x < 20; x += 3) {
      grain(p, x + 1, fy - 30, 2, 12, WOOD[1], WOOD[3], x);
      p.rect(x, fy - 30, 0.5, 12, WOOD[0]); p.rect(x + 0.5, fy - 30, 0.5, 12, WOOD[1]); p.rect(x + 1, fy - 30, 0.5, 12, WOOD[3]);
      if (x > 7 && x < 19) { NAIL(p, x + 1.5, fy - 29.5); NAIL(p, x + 1.5, fy - 20); }
    }
  } else { p.px(9, fy - 29, WOOD[3]); p.px(15, fy - 24, WOOD[3]); }
  p.rect(5, fy - 31, 2, 14, ST[1]); p.rect(19, fy - 31, 2, 14, ST[1]); p.rect(5, fy - 31, 1, 14, ST[2]); p.rect(20, fy - 31, 1, 14, ST[0]);
  p.rect(5, fy - 18, 16, 1, ST[0]); p.rect(5, fy - 19, 16, 1, ST[2]);
  if (p.fine) {
    // Eisen 5-stufig mit Glanzlinie (1 Feinpixel), Nieten gewölbt mit Glanzpunkt
    p.rect(5, fy - 31, 0.5, 14, ST[3]); p.rect(5.5, fy - 30.5, 0.5, 9, ST[4]); p.rect(6, fy - 31, 0.5, 14, ST[2]); p.rect(6.5, fy - 31, 0.5, 14, ST[1]);
    p.rect(19, fy - 31, 0.5, 14, ST[2]); p.rect(19.5, fy - 31, 0.5, 14, ST[1]); p.rect(20, fy - 31, 0.5, 14, ST[1]); p.rect(20.5, fy - 31, 0.5, 14, ST[0]);
    p.rect(5, fy - 19, 16, 0.5, ST[3]); p.rect(5, fy - 18.5, 16, 0.5, ST[2]); p.rect(5, fy - 18, 16, 0.5, ST[1]); p.rect(5, fy - 17.5, 16, 0.5, ST[0]);
    p.rect(6, fy - 19, 3, 0.5, ST[4]);
    for (const y of [fy - 29, fy - 21]) { fmap(p, 5.5, y, ['w4', '31'], STP); fmap(p, 19.5, y, ['43', '21'], STP); }
    for (const x of [9, 13, 17]) fmap(p, x, fy - 19, ['43', '21'], STP);
  } else for (const y of [fy - 29, fy - 21]) { p.px(6, y, ST[4]); p.px(19, y, ST[3]); }
  // Einwurfschlitz mit Messinglippe
  p.rect(8, fy - 28, 10, 3, ST[1]); p.rect(9, fy - 27, 8, 1, '#06040a'); p.rect(8, fy - 28, 10, 1, G[2]); p.rect(8, fy - 25, 10, 1, G[1]);
  p.px(8, fy - 27, G[1]); p.px(17, fy - 27, G[1]);
  if (p.fine) {
    // Messinglippe mit Glanzlinie und -punkt, Schlitz mit Tiefe, Unterlippe im Schatten
    p.rect(8, fy - 28, 10, 0.5, G[3]); p.rect(8.5, fy - 28, 3, 0.5, G[4]); p.dot(9, fy - 28, '#fff8d8'); p.rect(8, fy - 27.5, 10, 0.5, G[1]);
    p.rect(9, fy - 26.5, 8, 0.5, '#1a1420'); p.rect(9, fy - 26, 8, 0.5, ST[0]);
    p.rect(8, fy - 25, 10, 0.5, G[2]); p.rect(8, fy - 24.5, 10, 0.5, G[0]); p.dot(8.5, fy - 25, G[3]);
  }
  // Siegel: rotes Wachs mit Goldprägung
  if (p.fine) {
    // Runde Wachsscheibe mit hartem Umriss, Licht oben links, eingeprägte Glutflamme in Gold
    fmap(p, 10, fy - 24, [
      '....oooo....',
      '..oo4443oo..',
      '.o44443332o.',
      '.o4433h322o.',
      'o443h3hg221o',
      'o433hhGg221o',
      'o433hGGg221o',
      'o332hGGg211o',
      '.o322hg221o.',
      '.o32222111o.',
      '..oo2211oo..',
      '....oooo....',
    ], { o: nudge(C[0]), 4: nudge(C[4]), 3: nudge(C[3]), 2: nudge(C[2]), 1: nudge(C[1]), G: G[4], h: G[3], g: G[2] });
  } else {
    p.rect(11, fy - 23, 4, 4, C[3]); p.rect(12, fy - 24, 2, 6, C[3]); p.rect(10, fy - 22, 6, 2, C[3]);
    p.px(11, fy - 23, C[4]); p.px(12, fy - 24, C[4]); p.px(14, fy - 20, C[1]); p.px(15, fy - 21, C[2]); p.px(13, fy - 19, C[2]);
    p.px(12, fy - 22, G[3]); p.px(13, fy - 22, G[3]); p.px(12, fy - 21, G[2]); p.px(13, fy - 21, G[4]);
  }
  // Dach: Schindeln, ein Pixel Überstand, Firstbalken
  for (let i = 0; i < 5; i++) {
    const w = 20 - i * 4, x = 3 + i * 2, y = fy - 32 - i;
    p.rect(x, y, w, 1, SHINGLE[i === 0 ? 1 : 2]);
    if (p.fine) {
      // Schindelreihe: Oberkante im Licht, versetzte Stoßfugen, Enden hell/dunkel
      p.rect(x, y, w, 0.5, SHINGLE[i === 0 ? 2 : 3]); p.rect(x, y + 0.5, w, 0.5, SHINGLE[i === 0 ? 1 : 2]);
      for (let k = x + ((i & 1) ? 0.75 : 1.5); k < x + w - 0.5; k += 1.5) { p.dot(k, y + 0.5, SHINGLE[0]); p.dot(k, y, SHINGLE[1]); p.dot(k + 0.5, y, tone(SHINGLE[3], 0.12)); }
      p.dot(x, y, SHINGLE[2]); p.dot(x, y + 0.5, SHINGLE[1]); p.rect(x + w - 0.5, y, 0.5, 1, SHINGLE[0]);
    } else {
      for (let k = x + (i & 1); k < x + w; k += 3) p.px(k, y, SHINGLE[i === 0 ? 0 : 1]);
      p.px(x, y, SHINGLE[0]); p.px(x + w - 1, y, SHINGLE[3]);
    }
  }
  p.rect(3, fy - 32, 20, 1, SHINGLE[1]); p.rect(4, fy - 31, 18, 1, '#0e060a');
  p.rect(11, fy - 37, 4, 1, WOOD[3]); p.px(11, fy - 37, WOOD[4]);
  if (p.fine) {
    // Traufe mit Lichtkante und Fugen, Firstbalken gemasert mit Stirnholz
    p.rect(3, fy - 32, 20, 0.5, SHINGLE[2]); p.dot(3, fy - 32, SHINGLE[3]);
    for (let k = 4.5; k < 22; k += 1.5) p.dot(k, fy - 31.5, SHINGLE[0]);
    p.rect(11, fy - 37, 4, 0.5, WOOD[4]); p.rect(11, fy - 36.5, 4, 0.5, WOOD[2]); p.dot(12.5, fy - 36.5, WOOD[1]); p.dot(13.5, fy - 37, WOOD[3]);
    p.dot(11, fy - 37, tone(WOOD[4], 0.2));
  }
  // Haken und Laterne (Glas dunkel; brennt über die Leuchtebene)
  p.rect(21, fy - 30, 3, 1, ST[2]); p.px(23, fy - 29, ST[2]);
  p.rect(22, fy - 28, 3, 1, ST[3]); p.rect(22, fy - 27, 3, 4, '#241a1e'); p.px(23, fy - 26, '#3a2a24');
  p.rect(22, fy - 27, 1, 4, ST[1]); p.rect(24, fy - 27, 1, 4, ST[1]); p.rect(22, fy - 23, 3, 1, ST[2]); p.px(23, fy - 22, ST[1]);
  if (p.fine) {
    // Haken mit Glanz, Deckel mit Öse, Streben 2-stufig, Glas mit Glanz und Docht, Boden
    p.rect(21, fy - 30, 3, 0.5, ST[4]); p.rect(21, fy - 29.5, 3, 0.5, ST[1]); p.dot(23.5, fy - 29, ST[3]); p.dot(23, fy - 28.5, ST[3]);
    p.rect(22, fy - 28, 3, 0.5, ST[4]); p.dot(22.5, fy - 28, ST[5]); p.rect(22, fy - 27.5, 3, 0.5, ST[2]);
    p.rect(22, fy - 27, 0.5, 4, ST[3]); p.rect(24.5, fy - 27, 0.5, 4, ST[0]);
    p.dot(23, fy - 26.5, '#5a4a50'); p.dot(23, fy - 26, '#3a2a30'); p.dot(23.5, fy - 24, '#1a1012'); p.dot(23.5, fy - 24.5, '#2a1a14');
    p.rect(22, fy - 23, 3, 0.5, ST[3]); p.rect(22, fy - 22.5, 3, 0.5, ST[1]); p.dot(23.5, fy - 22, ST[2]);
  }
}

// Rabe auf dem First, Blick nach links. pose: 0 ruhig, 1 Kopf geneigt, 2 Augen zu, 3 Flügel gelüftet
function raven(p, pose) {
  const fy = AY, x = 9, y = fy - 38;
  if (p.fine) {
    // Federn fein: Schwanzfedern getrennt, Rücken mit Schuppenreihen, Flügel mit Handschwingen, Auge mit Glanz
    fmap(p, x + 7, y + 1, ['33222111', '.0221211', '....2121', '.....1.1'], RV);
    fmap(p, x + 2, y - 3, [
      '..44333322..',
      '.3443333221.',
      '322323232211',
      '212121212111',
      '221211211110',
      '221121121100',
      '211111111100',
      '.11111111000',
      '011111111000',
      '.00000000...',
    ], RV);
    if (pose === 3) fmap(p, x + 3.5, y - 6, ['.......21.', '.....33210', '...3422210', '.34222220.', '3422020...', '.20.......'], RV);
    else fmap(p, x + 4, y - 1.5, ['..44333...', '.3322223..', '3220220233', '.20202020.'], RV);
    const hy = pose === 1 ? y - 4 : y - 5, by = hy + 1 + (pose === 1 ? 1 : 0);
    fmap(p, x, hy, ['.4431.', '432211', '32ew21', '22GG11', '121111', '.1111.'], {
      ...RV, e: pose === 2 ? RV[3] : G[4], w: pose === 2 ? RV[3] : '#ffffff', G: pose === 2 ? RV[1] : G[2],
    });
    fmap(p, x - 2, by, ['1332', '00..'], { 3: '#7a7484', 2: '#5a5460', 1: '#4a4450', 0: '#3a3440' });
    fmap(p, x + 3.5, y + 2, ['0.0..0.0'], { 0: '#3a3440' });
    return;
  }
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
  const frame = (pose) => buildFine(W, H, AX, AY, (p) => { box(p); raven(p, pose); });
  const poses = [0, 1, 2, 3].map(frame);
  const gc = new PixelCanvas(W + 2, H + 2); // gleiche Größe wie die umrandeten Bilder (buildFrame: 1 px Rand)
  gc.ctx.translate(1, 1);
  glow(gc);
  // Ablauf der Rabenposen (4 Bilder je Sekunde): meist ruhig, gelegentlich Kopf neigen, blinzeln, Flügel lüften
  const seq = [0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 3, 3, 0, 0, 0, 0, 0, 1, 1, 0, 0];
  return { poses, seq, fps: 4, glow: gc.canvas, box: [-8, -6, 8, 1] };
}
