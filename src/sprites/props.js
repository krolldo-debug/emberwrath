import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { createRng } from '../core/math.js';
import { buildFine, fmap, stitch } from './npcFine.js';

const S = PAL.stone, E = PAL.ember, B = PAL.bone;

// Feinraster Stufe B (docs/STYLE.md „Feinraster“): alle Objekt-Frames über buildFine – alte Zeichnung bleibt (grob,
// geglättet), Details nur im feinen Durchgang (p.fine). Flammen-Frames, Spinnweben und Runenkreis bleiben Leinwände
// in Weltpixeln, weil ihre Verbraucher (Prop.renderEmissive, Dungeon-Wände, Dekal-Ebene, RuneGlow/ExitPortal) die
// Bildgröße als Weltgröße lesen.

// ---------------------------------------------------------------- Feinwerkzeuge (nur im feinen Durchgang)
// Nagelkopf 2×2 Feinpixel: Glanz oben links, Schatten unten rechts
function nail(p, x, y, M = PAL.steel) { fmap(p, x, y, ['42', '20'], { 4: M[4], 2: M[2], 0: M[0] }); }
// Steinfuge senkrecht: dunkle Feinlinie, rechts daneben Kantenlicht des nächsten Blocks
function joint(p, x, y0, y1, dark, light) { p.rect(x, y0, 0.5, y1 - y0, dark); if (light) p.rect(x + 0.5, y0, 0.5, y1 - y0, light); }
// Riss als feiner Linienzug; die untere Rissflanke fängt Licht (erst Licht, dann Dunkel darüber)
function crack(p, pts, dark, light) {
  if (light) for (let i = 1; i < pts.length; i++) p.fline(pts[i - 1][0] + 0.5, pts[i - 1][1] + 0.5, pts[i][0] + 0.5, pts[i][1] + 0.5, light);
  for (let i = 1; i < pts.length; i++) p.fline(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], dark);
}
// Holzmaserung (wie npcFine.grain) mit Begrenzung auf eine Form: inside(x, y) -> bool
function grainIn(p, x, y, w, h, dark, light, seed, horizontal, inside) {
  const rnd = (i) => { const s = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453; return s - Math.floor(s); };
  const L = horizontal ? w : h, Wd = horizontal ? h : w;
  const lines = Math.max(1, Math.floor(Wd * 2 / 3));
  for (let k = 0; k < lines; k++) {
    const off = (k + 0.5) * Wd / lines + (rnd(k) - 0.5) * 0.5, ph = rnd(k + 9) * 6, len = L * (0.35 + rnd(k + 3) * 0.5), st = rnd(k + 5) * (L - len);
    for (let u = st; u < st + len; u += 0.5) {
      const o = off + Math.sin(u * 0.7 + ph) * 0.35;
      const px = horizontal ? x + u : x + o, py = horizontal ? y + o : y + u;
      if (px < x || py < y || px >= x + w || py >= y + h || (inside && !inside(px, py))) continue;
      p.dot(px, py, k % 3 === 1 && light ? light : dark);
    }
  }
}
// Ellipse wie PixelCanvas.ellipse (Mitte der Zelle cx/cy, Ränder wie die gerundeten Zeilen); FineCanvas.ellipse
// liegt sonst einen halben Weltpixel nach links oben versetzt.
function ell(p, cx, cy, rx, ry, c) { p.ellipse(cx, cy, rx, ry, c); }   // buildFine gleicht die Lage im feinen Durchgang selbst aus
// Moosbüschel (Feinpixel), hängt nach unten aus
function moss(p, x, y, big = false) {
  const M = PAL.moss;
  fmap(p, x, y, big ? ['.22.', '2211', '1.1.'] : ['.2', '21', '1.'], { 2: M[2], 1: M[1] });
}

// Flammen: prozedural pro Frame, damit sie lebendig flackern.
export function createFlameFrames(w, h, count, seed) {
  const rng = createRng(seed);
  const frames = [];
  for (let f = 0; f < count; f++) {
    const p = new PixelCanvas(w, h);
    const cx = (w - 1) / 2;
    for (let y = 0; y < h; y++) {
      const t = y / (h - 1); // 0 oben .. 1 unten
      const sway = Math.sin(f * 1.3 + y * 0.6) * (1 - t) * 1.3;
      const half = Math.max(0, (w / 2) * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.62) - rng.range(0, 0.7));
      for (let x = 0; x < w; x++) {
        const d = Math.abs(x - cx - sway) / Math.max(half, 0.01);
        if (d > 1 || half < 0.4) continue;
        const heat = (1 - d) * 0.65 + t * 0.55 + rng.range(-0.12, 0.12);
        const idx = heat > 1.0 ? 5 : heat > 0.82 ? 4 : heat > 0.62 ? 3 : heat > 0.42 ? 2 : 1;
        p.px(x, y, E[idx]);
      }
    }
    frames.push(p.canvas);
  }
  return frames;
}

export function createTorchBracket() {
  return buildFine(7, 11, 3, 0, (p) => {
    const St = PAL.steel, L = PAL.leather;
    // Holzgriff mit Wicklung, eiserne Halterung mit Nieten
    p.rect(2, 2, 3, 7, L[2]);
    p.rect(2, 2, 1, 7, L[3]);
    p.px(4, 4, L[1]); p.px(4, 6, L[1]);
    p.rect(2, 3, 3, 1, '#6a5a48'); p.rect(2, 5, 3, 1, '#6a5a48');
    p.rect(1, 1, 5, 2, St[2]);
    p.rect(1, 1, 5, 1, St[3]); p.px(1, 1, St[4]);
    p.rect(3, 9, 1, 2, St[1]); p.rect(2, 10, 3, 1, St[2]);
    p.rect(1, 0, 5, 1, '#1a0a05'); p.px(2, 0, E[1]); p.px(4, 0, E[2]);
    if (p.fine) {
      // Griff: Maserung längs, Lederwicklung als schräge Schnur (hell/dunkel im Wechsel)
      for (let y = 6.5; y < 9; y += 0.5) p.dot(3.5 + (y % 2 < 1 ? 0 : 0.5), y, L[1]);
      p.rect(2, 2, 0.5, 7, '#7d5a40'); p.rect(4.5, 2, 0.5, 7, L[0]);
      for (const wy of [3, 5]) {
        fmap(p, 2, wy, ['899889', '988998'], { 8: '#8a7860', 9: '#4a3e30' });
        p.dot(4.5, wy + 0.5, '#3a3024');
      }
      // Halterung: Glanzlinie oben, Unterkante dunkel, zwei Nieten
      p.rect(1.5, 1, 4, 0.5, St[4]); p.dot(1, 1, St[5]); p.rect(1, 2.5, 5, 0.5, St[1]); p.rect(5.5, 1, 0.5, 1.5, St[1]);
      p.dot(2, 2, St[4]); p.dot(2, 2.5, St[0]); p.dot(4.5, 2, St[4]); p.dot(4.5, 2.5, St[0]);
      // Dorn und Fuß
      p.rect(3, 9, 0.5, 1, St[3]); p.rect(2, 10, 3, 0.5, St[3]); p.dot(2, 10, St[4]); p.dot(4.5, 10.5, St[0]);
      // Glut im Becher: Kohle mit heißem Kern
      fmap(p, 1, 0, ['0230440200', '0012532100'], { 0: '#1a0a05', 1: E[1], 2: E[2], 3: E[3], 4: E[4], 5: E[5] });
    }
  });
}

export function createBrazier() {
  return buildFine(18, 20, 9, 18, (p) => {
    const St = PAL.steel;
    // Dreibein mit Klauenfüßen
    p.line(4, 11, 2, 18, St[1]); p.line(5, 11, 3, 18, St[2]);
    p.line(13, 11, 15, 18, St[1]); p.line(12, 11, 14, 18, St[2]);
    p.line(9, 12, 9, 18, St[2]); p.px(9, 13, St[3]);
    p.rect(1, 18, 3, 1, St[2]); p.rect(14, 18, 3, 1, St[2]); p.rect(8, 18, 3, 1, St[3]);
    // Schale: gehämmertes Eisen mit Randwulst
    p.rect(1, 5, 16, 6, St[2]);
    p.rect(2, 11, 14, 1, St[1]);
    p.rect(1, 5, 16, 1, St[4]); p.rect(1, 6, 16, 1, St[3]);
    p.rect(2, 7, 3, 3, St[3]); p.px(3, 7, St[5]);
    if (!p.fine) for (let x = 5; x < 16; x += 3) p.px(x, 8, St[1]);
    p.rect(14, 7, 2, 3, St[1]);
    // Glut mit Kohlen
    p.rect(2, 3, 14, 2, E[1]);
    p.rect(4, 3, 10, 1, E[2]);
    if (!p.fine) {
      p.px(6, 3, E[3]); p.px(9, 4, E[4]); p.px(12, 3, E[3]);
      p.px(5, 4, '#1a0a05'); p.px(11, 4, '#1a0a05');
      // Glutschein auf dem Metall
      p.px(8, 6, PAL.gold[2]); p.px(11, 6, PAL.gold[2]); p.px(6, 6, E[2]);
      return;
    }
    // --- fein: Beine mit Lichtgrat, Klauenzehen
    p.fline(5.5, 11.5, 3.5, 17.5, St[3]); p.fline(12.5, 11.5, 14.5, 17.5, St[3]);
    p.rect(9, 12, 0.5, 6, St[3]); p.dot(9, 13, St[4]);
    for (const fx of [1, 14]) fmap(p, fx, 18, ['344443', '201201'], { 4: St[4], 3: St[3], 2: St[2], 1: St[1], 0: St[0] });
    fmap(p, 8, 18, ['444443', '332332'], { 4: St[4], 3: St[3], 2: St[2] });
    // Randwulst: Glanzlinie mit Glanzpunkt, Schattenfuge unter dem Wulst, Nietenreihe am Boden
    p.rect(2, 5, 8, 0.5, St[5]); p.dot(3, 5, '#ffffff'); p.rect(10, 5, 6, 0.5, St[4]);
    p.rect(1, 6.5, 16, 0.5, St[2]); p.rect(16.5, 5, 0.5, 2, St[2]);
    p.rect(2, 10.5, 14, 0.5, St[1]);
    for (let x = 3.5; x < 15; x += 2.5) { p.dot(x, 10, x < 12 ? St[4] : St[3]); p.dot(x, 10.5, St[0]); }
    // Hammerschläge: wenige flache Mulden (Schattensichel oben links, Licht unten rechts)
    for (const [x, y] of [[7, 7.5], [10.5, 8], [12.5, 7]]) fmap(p, x, y, ['11', '1.3'], { 1: St[1], 3: St[3] });
    // Lichtfleck links gerundet, Glutschein warm auf dem Wulst
    fmap(p, 2, 7, ['4553', '4543', '3443', '.33.'], { 5: St[5], 4: St[4], 3: St[3] });
    for (const [x, c] of [[5.5, E[2]], [6, E[3]], [8, PAL.gold[2]], [8.5, PAL.gold[3]], [11, PAL.gold[2]], [12.5, E[2]]]) p.dot(x, 6, c);
    // Kohlen: dunkle Brocken mit glühenden Rissen, heißer Kern in der Mitte
    fmap(p, 2, 3, [
      '1122332221233332221122.1',
      '2233443321344443322233.1',
      '1003553200300543003550.1',
      '10.0230100.00230.00320.1',
    ], { 0: '#1a0a05', 1: E[1], 2: E[2], 3: E[3], 4: E[4], 5: E[5] });
  });
}

export function createPillar() {
  return buildFine(18, 46, 9, 44, (p) => {
    // Basis (zwei Stufen)
    p.rect(0, 38, 18, 7, S[2]);
    p.rect(0, 38, 18, 1, S[4]); p.rect(0, 39, 18, 1, S[3]);
    p.rect(0, 40, 2, 5, S[1]); p.rect(16, 40, 2, 5, S[3]);
    p.rect(1, 44, 16, 1, S[0]);
    p.rect(1, 35, 16, 3, S[2]); p.rect(1, 35, 16, 1, S[4]); p.rect(15, 36, 2, 2, S[3]);
    // Schaft mit Kanneluren, gerundet schattiert
    p.rect(3, 7, 12, 28, S[2]);
    p.rect(3, 7, 2, 28, S[1]); p.rect(5, 7, 1, 28, S[2]);
    p.rect(12, 7, 3, 28, S[3]); p.rect(13, 8, 1, 26, S[4]);
    for (let x = 6; x < 12; x += 2) { p.rect(x, 8, 1, 26, S[1]); p.rect(x + 1, 8, 1, 26, x > 8 ? S[3] : S[2]); }
    // Abplatzer, Risse, Moos am Fuß
    if (!p.fine) {
      p.px(8, 15, PAL.mortar); p.px(9, 16, PAL.mortar); p.px(9, 17, PAL.mortar); p.px(10, 18, PAL.mortar); p.px(10, 19, S[4]);
      p.rect(12, 24, 2, 2, S[1]); p.px(12, 24, PAL.mortar);
      p.px(4, 32, PAL.moss[1]); p.px(5, 33, PAL.moss[2]); p.px(4, 34, PAL.moss[1]); p.px(13, 33, PAL.moss[1]); p.px(3, 36, PAL.moss[2]);
    }
    // Kapitell mit Profil
    p.rect(0, 0, 18, 7, S[2]);
    p.rect(0, 0, 18, 1, S[4]); p.rect(0, 1, 18, 1, S[3]);
    p.rect(1, 4, 16, 1, S[1]); p.rect(2, 5, 14, 2, S[2]); p.rect(2, 6, 14, 1, S[1]);
    p.rect(15, 1, 2, 3, S[3]); p.rect(0, 2, 2, 2, S[1]);
    if (!p.fine) return;
    const M = PAL.mortar;
    // --- Kanneluren: Tal tief (2 Stufen), Grat mit Kantenlicht, Enden gerundet
    for (let x = 6; x < 12; x += 2) {
      const lit = x > 8;
      p.rect(x + 0.5, 8.5, 0.5, 25, S[0]);
      p.rect(x + 1.5, 8, 0.5, 26, lit ? S[4] : S[3]);
      p.dot(x + 0.5, 8, S[1]); p.dot(x + 0.5, 33.5, S[1]);
    }
    p.rect(3, 7, 0.5, 28, S[0]); p.rect(4.5, 7, 0.5, 28, S[2]);
    p.rect(13, 8, 0.5, 26, S[5]); p.rect(14.5, 7, 0.5, 28, S[2]);
    // Risse mit Lichtflanke, Abplatzer mit Kante
    crack(p, [[8, 14.5], [8.5, 15.5], [9.5, 16.5], [9.5, 17.5], [10.5, 19], [10.5, 20.5]], M, S[4]);
    crack(p, [[9.5, 17], [11, 17.5], [11.5, 18.5]], M, null);
    crack(p, [[4, 26], [5, 27.5], [5, 29]], M, S[3]);
    fmap(p, 12, 24, ['0011', '0113', '1123', '.33.'], { 0: M, 1: S[1], 2: S[2], 3: S[4] });
    // Moos am Fuß
    moss(p, 4, 32, true); moss(p, 13, 33); moss(p, 3, 36); moss(p, 5.5, 34);
    // --- Kapitell: Kantenlicht, Fugen zwischen den Blöcken, Profilkehle
    p.rect(0.5, 0, 12, 0.5, S[5]); p.dot(0, 0, S[5]);
    joint(p, 6, 1, 4, S[1], S[3]); joint(p, 12, 1, 4, S[1], S[4]);
    p.rect(1, 4, 16, 0.5, S[0]); p.rect(2, 5, 14, 0.5, S[3]); p.rect(2, 6.5, 14, 0.5, S[0]);
    crack(p, [[14, 1.5], [14.5, 2.5], [15.5, 3]], M, null);
    // --- Basis: Kantenlicht oben, Fugen, ein Eckabplatzer
    p.rect(1, 35, 10, 0.5, S[5]); p.rect(0, 38, 12, 0.5, S[5]);
    joint(p, 9, 36, 38, S[1], S[3]);
    joint(p, 6, 40, 44, S[1], S[3]); joint(p, 12, 40, 44, S[1], S[3]);
    p.rect(2, 40, 16, 0.5, S[1]);
    crack(p, [[13.5, 41], [14.5, 42], [14.5, 43.5]], M, S[4]);
    fmap(p, 16, 38, ['.001', '0122', '1223'], { 0: S[1], 1: S[2], 2: S[3], 3: S[4] });
  });
}

export function createCandles() {
  return buildFine(12, 9, 6, 8, (p) => {
    ell(p, 6, 7, 5, 1.5, '#2a2230');
    // Wachslachen
    p.rect(1, 7, 4, 1, B[2]); p.rect(7, 7, 4, 1, B[2]);
    p.rect(2, 3, 2, 5, B[3]); p.rect(2, 3, 1, 5, B[4]); p.px(3, 7, B[1]);
    p.rect(5, 1, 2, 7, B[3]); p.rect(5, 1, 1, 7, B[4]); p.px(6, 4, B[2]); p.px(4, 5, B[3]);
    p.rect(8, 4, 2, 4, B[2]); p.rect(8, 4, 1, 4, B[3]); p.px(10, 6, B[3]);
    if (!p.fine) { p.px(2, 3, '#2a1a10'); p.px(5, 1, '#2a1a10'); p.px(8, 4, '#2a1a10'); return; }
    // fein: geschmolzene Mulde oben mit Docht, Wachsläufer, Lichtkante, Pfütze mit Glanz
    const W = '#2a1a10';
    for (const [x, y, hi, mid, lo] of [[2, 3, B[4], B[3], B[2]], [5, 1, B[4], B[3], B[2]], [8, 4, B[3], B[2], B[1]]]) {
      fmap(p, x, y, ['4224', '4w32'], { 4: hi, 3: mid, 2: lo, w: W });
      p.dot(x + 0.5, y - 0.5, W);
      p.rect(x + 1.5, y + 1, 0.5, 8 - y - 1.5, lo);
    }
    fmap(p, 3.5, 4, ['4', '3', '3', '2'], { 4: B[4], 3: B[3], 2: B[2] });          // Läufer
    fmap(p, 4, 5, ['43', '.2'], { 4: B[4], 3: B[3], 2: B[2] });
    fmap(p, 6, 2, ['.', '3', '3', '2', '2'], { 3: B[3], 2: B[2] });
    fmap(p, 9.5, 5, ['3', '2', '2'], { 3: B[3], 2: B[2] });
    p.rect(1, 7, 4, 0.5, B[3]); p.dot(1.5, 7, B[4]); p.rect(7, 7, 4, 0.5, B[3]); p.dot(9.5, 7, B[4]);
    p.rect(1, 7.5, 1, 0.5, B[1]); p.rect(10, 7.5, 1, 0.5, B[1]);
    p.rect(10, 6, 0.5, 1, B[4]);
  });
}

export function createBonePile(seed) {
  return buildFine(16, 9, 8, 8, (p) => {
    const rng = createRng(seed);       // je Durchgang neu, damit grob und fein dieselben Knochen ziehen
    for (let i = 0; i < 5; i++) {
      const x = rng.int(1, 11), y = rng.int(4, 7);
      const x2 = x + rng.int(3, 5), y2 = y + rng.int(-1, 1), c = rng.pick([B[2], B[3]]);
      p.line(x, y, x2, y2, c);
      if (p.fine) {
        // Schaft: Unterseite im Schatten; Gelenkköpfe an beiden Enden (Knubbel oben hell, unten dunkel)
        const lo = c === B[3] ? B[2] : B[1], hi = c === B[3] ? B[4] : B[3];
        p.fline(x + 1, y + 0.5, x2 - 1, y2 + 0.5, lo);
        for (const [ex, dir] of [[x, -1], [x2, 1]]) {
          const ey = ex === x ? y : y2;
          p.dot(ex + (dir < 0 ? -0.5 : 1), ey, hi); p.dot(ex + (dir < 0 ? -0.5 : 1), ey + 0.5, lo);
          p.dot(ex + 0.5 + dir * 0.5, ey - 0.5, hi);
          p.dot(ex + 0.5 + dir * 0.5, ey + 1, lo);
        }
      }
    }
    // Schädel
    const sx = rng.int(4, 8);
    if (!p.fine) {
      p.rect(sx, 2, 5, 4, B[3]); p.rect(sx + 1, 1, 3, 1, B[3]);
      p.rect(sx + 1, 3, 1, 1, '#140808'); p.rect(sx + 3, 3, 1, 1, '#140808');
      p.px(sx + 1, 2, B[4]);
      return;
    }
    // fein: Schädel mit Stirnwölbung, tiefen Augenhöhlen, Nasenloch, Zahnreihe und Wangenschatten
    fmap(p, sx, 1, [
      '..44433...',
      '.4444333..',
      '4444433332',
      '44kk33kk32',
      '43kk32kk21',
      '332223n221',
      '.2t2t2t21.',
      '.1t1t1t11.',
    ], { 4: B[4], 3: B[3], 2: B[2], 1: B[1], k: '#140808', n: '#140808', t: B[3] });
    p.dot(sx + 1.5, 1.5, '#fffbef');
  });
}

export function createBanner(seed = 3) {
  const C = PAL.crimson, G = PAL.gold;
  return buildFine(10, 22, 5, 0, (p) => {
    const rng = createRng(seed);
    p.rect(0, 0, 10, 1, G[2]);
    p.rect(1, 1, 8, 16, C[2]);
    p.rect(1, 1, 2, 16, C[1]);
    p.rect(7, 1, 2, 16, C[3]);
    // Zackiger Rand
    const tips = [];
    for (let x = 1; x < 9; x++) { const n = rng.int(0, 4); tips.push(n); p.rect(x, 17, 1, n, x % 2 ? C[2] : C[1]); }
    // Emblem: stilisierte Flamme
    if (!p.fine) {
      p.px(5, 5, G[3]); p.rect(4, 6, 3, 2, G[3]); p.rect(4, 8, 3, 2, G[2]);
      p.px(3, 7, G[2]); p.px(7, 7, G[2]); p.rect(3, 10, 5, 1, G[1]);
      return;
    }
    // --- fein: Stange mit Glanzlinie und Knäufen, Stoff mit zweifarbigen Falten, Goldstickerei
    p.rect(0, 0, 10, 0.5, G[3]); p.rect(1, 0, 3, 0.5, G[4]); p.rect(0, 0.5, 10, 0.5, G[1]);
    p.dot(0, 0, G[4]); p.dot(9.5, 0.5, G[0]);
    p.rect(1, 1, 8, 0.5, C[0]);                                        // Schatten unter der Stange
    for (const [x, d, l] of [[3, C[1], C[2]], [5.5, C[1], C[3]], [7.5, C[2], C[4]]]) {
      for (let y = 1.5; y < 17; y += 0.5) {
        const xx = x + (y > 12 ? 0.5 : 0);
        p.dot(xx, y, d); p.dot(xx - 0.5, y, l);
      }
    }
    p.rect(1, 1.5, 0.5, 15.5, C[0]); p.rect(8.5, 1.5, 0.5, 15.5, C[2]);
    // Stickerei: Punktnaht als Bordüre
    stitch(p, 2, 2.5, 2, 15.5, G[1]); stitch(p, 8, 2.5, 8, 15.5, G[2]); stitch(p, 2, 2, 8, 2, G[2]);
    stitch(p, 2, 16, 8, 16, G[1]);
    // Flammen-Emblem fein: Zungen, heller Kern, Sockelbalken mit Stichen
    fmap(p, 3, 4, [
      '....4.....',
      '....43....',
      '...443....',
      '..4.4432..',
      '..444532..',
      '.4345532.2',
      '.33455432.',
      '.23455332.',
      '..234432..',
      '..223322..',
      '...2222...',
      '....11....',
    ], { 5: G[4], 4: G[3], 3: G[2], 2: G[1], 1: G[0] });
    p.rect(3, 10, 5, 1, G[1]); p.rect(3, 10, 5, 0.5, G[2]);
    for (let x = 3.5; x < 8; x += 1) p.dot(x, 10, G[3]);
    // Zacken: Spitzen mit dunkler Kante, Licht am Ansatz
    tips.forEach((n, i) => { if (n > 0) { const x = i + 1; p.rect(x, 17, 1, 0.5, C[3]); p.dot(x + 0.5, 17 + n - 0.5, C[0]); } });
  }, { outline: true });
}

export function createChains() {
  const St = PAL.steel;
  return buildFine(8, 16, 4, 0, (p) => {
    if (!p.fine) {
      for (let y = 0; y < 14; y += 2) { p.px(2, y, St[3]); p.px(2, y + 1, St[1]); }
      for (let y = 0; y < 10; y += 2) { p.px(5, y, St[2]); p.px(5, y + 1, St[1]); }
      p.rect(1, 14, 3, 2, St[2]);
      return;
    }
    // fein: Glieder im Wechsel – offenes Ring-Glied (von vorn) und schmales Glied (Kante), das durch das Loch des
    // Rings läuft; Glanz oben links
    const pal = { 5: St[5], 4: St[4], 3: St[3], 2: St[2], 1: St[1], 0: St[0] };
    const chain = (x, y0, n, dim) => {
      for (let k = 1; k < n; k += 2) fmap(p, x, y0 + k * 2 - 0.5, dim ? ['32', '21', '21', '21', '10'] : ['43', '32', '32', '21', '21'], pal);
      for (let k = 0; k < n; k += 2) {
        const y = y0 + k * 2;
        fmap(p, x - 0.5, y, dim ? ['.32.', '3..1', '2..1', '.10.'] : ['.43.', '4..2', '3..1', '.21.'], pal);
        p.dot(x + 0.5, y + 0.5, St[0]); if (k + 1 < n) p.dot(x + 0.5, y + 1, dim ? St[1] : St[2]);
      }
    };
    chain(2, 0, 7, false);
    chain(5, 0, 5, true);
    // Haken unten: dicker Ring mit Glanz
    fmap(p, 1, 14, ['.4443.', '43..21', '3...10', '.2210.'], pal);
  }, { outline: false });
}

export function createCobweb(flipX = false) {
  const p = new PixelCanvas(14, 14);
  const c = 'rgba(200,196,210,0.35)';
  for (let i = 0; i < 14; i++) { p.px(flipX ? 13 - i : i, 0, c); }
  for (let i = 0; i < 12; i++) { const k = i; p.px(flipX ? 13 - k : k, k, c); }
  for (let r = 3; r < 13; r += 4) {
    for (let a = 0; a <= r; a++) p.px(flipX ? 13 - a : a, Math.round(r - a * 0.9 > 0 ? (r - a) * 0.5 + a * 0.5 : 0), c);
  }
  return p.canvas;
}

// Runenkreis als Bodendekal (Grundform) + separates Glüh-Overlay.
export function createRuneCircle(r = 22) {
  const size = r * 2 + 3;
  const base = new PixelCanvas(size, size);
  const glow = new PixelCanvas(size, size);
  const c = r + 1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x - c, y - c);
    const a = Math.atan2(y - c, x - c);
    if (Math.abs(d - r) < 0.7 || Math.abs(d - (r - 4)) < 0.6) {
      base.px(x, y, '#241a33'); glow.px(x, y, PAL.magic[3]);
    }
    // Runen zwischen den Ringen
    const seg = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 12);
    if (d > r - 3.5 && d < r - 0.5 && seg % 2 === 0 && ((x * 7 + y * 3) % 5 === 0)) {
      base.px(x, y, '#2e2040'); glow.px(x, y, PAL.magic[4]);
    }
    // Pentagramm-artige Linien
    for (let k = 0; k < 5; k++) {
      const a1 = (k / 5) * Math.PI * 2 - Math.PI / 2, a2 = ((k + 2) / 5) * Math.PI * 2 - Math.PI / 2;
      const x1 = c + Math.cos(a1) * (r - 4), y1 = c + Math.sin(a1) * (r - 4);
      const x2 = c + Math.cos(a2) * (r - 4), y2 = c + Math.sin(a2) * (r - 4);
      const len = Math.hypot(x2 - x1, y2 - y1);
      const dd = Math.abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1) / len;
      const tt = ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / (len * len);
      if (dd < 0.5 && tt >= 0 && tt <= 1) { base.px(x, y, '#241a33'); glow.px(x, y, PAL.magic[2]); }
    }
  }
  return { base: base.canvas, glow: glow.canvas, r };
}

// --- Zusätzliche Dungeon-Objekte (Thread B kann sie platzieren) -------------
const WOOD = ['#1e120c', '#35221a', '#4f3322', '#6b4a30', '#8a6440'];

export function createBarrel() {
  return buildFine(12, 15, 6, 14, (p) => {
    const St = PAL.steel;
    ell(p, 6, 7, 5.5, 7, WOOD[2]);
    p.rect(1, 3, 2, 9, WOOD[1]); p.rect(9, 3, 2, 9, WOOD[3]);
    if (!p.fine) for (const x of [4, 7]) p.rect(x, 1, 1, 13, WOOD[1]);
    p.rect(10, 4, 1, 7, WOOD[4]);
    for (const y of [3, 11]) { p.rect(1, y, 10, 1, St[1]); p.rect(2, y, 8, 1, St[2]); p.px(9, y, St[4]); }
    ell(p, 6, 1, 4, 1, WOOD[3]); p.rect(3, 1, 6, 1, WOOD[4]);
    if (!p.fine) return;
    // fein: fünf Dauben mit vier geraden Fugen (dunkel + Lichtkante), Licht von links oben, Reifen mit Glanz und Nägeln,
    // Deckel mit Spund
    const DAUBE = [2, 3, 3, 2, 1];
    p.each(0.5, 2, 11.5, 14, (x, y) => {
      if (((x - 6) / 5.5) ** 2 + ((y - 7) / 7) ** 2 >= 1) return null;
      if ((y >= 3 && y < 4) || (y >= 11 && y < 12)) return null;
      const r = Math.max(0, Math.min(9.99, x - 1)), d = Math.floor(r / 2), q = r - d * 2;
      let i = DAUBE[d];
      if (d > 0 && q < 0.5) return WOOD[Math.max(0, i - 2)];
      if (d > 0 && d < 3 && q < 1) i += 1;
      if (y >= 12.5) i -= 1;
      return WOOD[Math.max(0, Math.min(4, i))];
    });
    for (const y of [3, 11]) {
      p.rect(1.5, y, 9, 0.5, St[3]); p.rect(5, y, 4, 0.5, St[4]); p.dot(9, y, St[5]);
      p.rect(1.5, y + 0.5, 9, 0.5, St[1]); p.dot(1, y + 0.5, St[0]);
      for (const nx of [3, 6, 8.5]) { p.dot(nx, y + 0.5, St[4]); }
    }
    // Deckel: Ring, Brettfuge, Spundloch
    p.rect(3, 0, 6, 0.5, WOOD[4]); p.rect(2.5, 1.5, 7, 0.5, WOOD[2]);
    p.rect(6, 0.5, 0.5, 1, WOOD[2]); p.dot(4, 1, WOOD[0]); p.dot(4.5, 1, WOOD[1]); p.dot(4, 0.5, '#a8805a');
  });
}

export function createCrate() {
  return buildFine(14, 14, 7, 13, (p) => {
    p.rect(0, 3, 14, 11, WOOD[2]);
    p.rect(0, 0, 14, 4, WOOD[3]); p.rect(0, 0, 14, 1, WOOD[4]);
    if (!p.fine) for (const y of [5, 8, 11]) p.rect(1, y, 12, 1, WOOD[1]);
    p.line(1, 12, 12, 4, WOOD[3]); p.line(1, 13, 12, 5, WOOD[1]);
    p.rect(0, 3, 1, 11, WOOD[1]); p.rect(13, 3, 1, 11, WOOD[1]);
    if (!p.fine) { for (const [x, y] of [[1, 4], [12, 4], [1, 12], [12, 12]]) p.px(x, y, PAL.steel[3]); return; }
    // fein: Bretter mit Fugen und Maserung, Strebe mit Lichtkante, Nagelköpfe, Deckel aus Brettern
    for (const y of [5.5, 8.5, 11.5]) { p.rect(1, y, 12, 0.5, WOOD[1]); p.rect(1, y + 0.5, 12, 0.5, WOOD[3]); }
    for (const [y, h, s] of [[4, 1.5, 1], [6, 2.5, 2], [9, 2.5, 3], [12, 2, 4]]) grainIn(p, 1, y, 12, h, WOOD[1], WOOD[3], s, true, (x, yy) => Math.abs(yy - (12.5 - (x - 1) * 8 / 11)) > 1.4);
    p.fline(1.5, 11.5, 12, 3.5, WOOD[4]);
    p.rect(0.5, 3, 0.5, 11, WOOD[2]); p.rect(13, 3, 0.5, 11, WOOD[0]);
    // Deckel
    for (const x of [4.5, 9]) { p.rect(x, 0.5, 0.5, 3, WOOD[1]); p.rect(x + 0.5, 0.5, 0.5, 3, WOOD[4]); }
    grainIn(p, 0.5, 1, 13, 2.5, WOOD[2], null, 6, true, (x) => Math.abs(x - 4.75) > 0.6 && Math.abs(x - 9.25) > 0.6);
    p.rect(0, 3.5, 14, 0.5, WOOD[1]);
    for (const [x, y] of [[1, 4], [12, 4], [1, 12], [12, 12], [6.5, 1.5], [2, 1.5], [11, 1.5]]) nail(p, x, y);
  });
}

export function createUrn(seed = 1) {
  const rng = createRng(seed);
  const tint = [PAL.rust, ['#1e1a2a', '#2e2840', '#463c5e', '#5e5478'], ['#1a2420', '#26382e', '#3a5242', '#567060']][seed % 3];
  rng.next();
  const G = PAL.gold;
  return buildFine(10, 14, 5, 13, (p) => {
    ell(p, 5, 8, 4.5, 5, tint[1]); ell(p, 4, 7, 3, 3.5, tint[2]); p.px(3, 5, tint[3]);
    p.rect(3, 1, 4, 3, tint[1]); p.rect(2, 1, 6, 1, tint[2]);
    p.rect(1, 8, 8, 1, G[1]); p.px(3, 8, G[3]);
    p.rect(3, 12, 4, 1, tint[0]);
    if (!p.fine) return;
    // fein: Glasur mit Glanzbogen und Glanzpunkt, Lippe mit Öffnung, Goldband mit Punzmuster, Haarriss
    const hi = tint[3], gl = '#e8e0d0';
    for (const [x, y] of [[2, 6.5], [2, 6], [2.5, 5.5], [2.5, 5], [3, 4.5], [1.5, 7], [1.5, 7.5]]) p.dot(x, y, hi);
    p.dot(3, 5, gl); p.dot(3.5, 4.5, hi);
    p.rect(7.5, 6, 0.5, 2, tint[0]); p.rect(7.5, 9.5, 0.5, 1.5, tint[0]);
    p.rect(3, 2, 0.5, 2, tint[2]); p.rect(6.5, 2, 0.5, 2, tint[0]);
    p.rect(2, 1, 6, 0.5, hi); p.rect(3, 1.5, 4, 0.5, '#0e0a10'); p.dot(2, 1.5, tint[1]); p.dot(7.5, 1.5, tint[1]);
    p.rect(1, 8, 8, 0.5, G[2]); p.rect(1, 8.5, 8, 0.5, G[0]);
    for (let x = 1.5; x < 8.5; x += 1) p.dot(x, 8 + ((x * 2) % 2 ? 0 : 0.5), x < 4 ? G[4] : G[3]);
    p.dot(2.5, 8, G[4]);
    crack(p, [[6, 9], [5.5, 10], [6, 10.5]], tint[0], null);
    p.rect(3, 12, 4, 0.5, tint[1]); p.dot(3, 12, tint[2]);
  });
}

export function createSarcophagus() {
  return buildFine(30, 18, 15, 17, (p) => {
    p.rect(0, 6, 30, 12, S[1]); p.rect(0, 6, 30, 1, S[3]);
    p.rect(1, 1, 28, 7, S[3]); p.rect(1, 1, 28, 1, S[5]); p.rect(1, 7, 28, 1, S[1]);
    // Liegende Figur auf dem Deckel
    ell(p, 6, 4, 2.5, 2, S[4]); p.rect(9, 3, 16, 3, S[4]); p.rect(9, 3, 16, 1, S[5]);
    p.rect(14, 2, 3, 1, S[4]); p.rect(25, 3, 3, 2, S[4]);
    for (let x = 3; x < 28; x += 4) p.rect(x, 10, 2, 5, S[0]);
    p.rect(0, 16, 30, 2, S[0]);
    if (!p.fine) { p.px(20, 5, PAL.moss[2]); p.px(21, 5, PAL.moss[1]); return; }
    const M = PAL.mortar;
    // fein: Deckelkante gefast, Gesicht mit geschlossenen Augen, Gewandfalten längs, Schwert mit Parierstange,
    // gefaltete Hände, Nischen mit Bogen und Kantenlicht, Risse, Moos
    p.rect(1, 1.5, 28, 0.5, S[4]); p.rect(1, 7.5, 28, 0.5, S[0]); p.rect(28.5, 1.5, 0.5, 6, S[2]);
    p.rect(0, 6, 1, 0.5, S[4]);
    // Gesicht: Haube, geschlossene Lider, Nasenrücken
    p.fline(4, 2.5, 4, 5, S[3]); p.dot(4.5, 2, S[5]); p.rect(5, 2, 2, 0.5, S[5]);
    p.rect(6, 3.5, 1, 0.5, S[2]); p.rect(6, 4.5, 1, 0.5, S[2]); p.dot(7.5, 4, S[5]); p.dot(8, 4, S[3]);
    p.dot(5, 5.5, S[3]); p.rect(5.5, 5.5, 2, 0.5, S[3]);
    // Gewand: Lichtkante oben, Falten zum Fußende, Schatten unten
    p.rect(9, 5.5, 16, 0.5, S[3]);
    p.fline(10, 4.5, 13, 5, S[3]); p.fline(18, 5, 24.5, 5, S[3]); p.fline(18, 4.5, 24.5, 4.5, S[4]);
    // Schwert: Klinge mit Glanzlinie, Parierstange, Knauf; Hände darüber gefaltet
    p.rect(17.5, 3.5, 7, 0.5, S[5]); p.rect(17.5, 4, 7, 0.5, S[2]); p.dot(24.5, 3.5, S[4]);
    p.rect(17, 2.5, 0.5, 2.5, S[5]); p.rect(17.5, 2.5, 0.5, 2.5, S[2]);
    p.dot(13.5, 3.5, S[5]); p.dot(13.5, 4, S[2]);
    fmap(p, 14, 2, ['.4554.', '453443', '.3333.'], { 5: S[5], 4: S[4], 3: S[3] });
    fmap(p, 25, 3, ['545', '444', '333'], { 5: S[5], 4: S[4], 3: S[3] });
    p.dot(27, 3, S[5]); p.dot(27, 4, S[3]);
    for (let x = 3; x < 28; x += 4) {
      p.dot(x, 10, S[1]); p.dot(x + 1.5, 10, S[1]);
      p.rect(x + 2, 10.5, 0.5, 4.5, S[2]); p.rect(x, 15, 2.5, 0.5, S[3]);
    }
    crack(p, [[22, 1.5], [21.5, 2.5], [22.5, 4.5], [22, 6], [22.5, 7]], M, S[4]);
    crack(p, [[26, 8], [26.5, 9.5], [26, 10]], M, null);
    crack(p, [[13.5, 15.5], [14, 14], [13.5, 12.5]], M, S[2]);
    moss(p, 20, 5, true); moss(p, 1, 8); moss(p, 29, 14);
    p.rect(0, 16, 30, 0.5, S[1]);
  });
}

// Truhe: [geschlossen, offen]
export function createChestFrames() {
  const G = PAL.gold;
  const GP = { 4: G[4], 3: G[3], 2: G[2], 1: G[1], 0: G[0], k: '#1a0a05' };
  const body = (p, oy = 0) => {
    p.rect(0, 6 + oy, 16, 8, WOOD[2]); p.rect(0, 6 + oy, 16, 1, WOOD[3]); p.rect(0, 13 + oy, 16, 1, WOOD[0]);
    p.rect(2, 6 + oy, 2, 8, G[1]); p.rect(12, 6 + oy, 2, 8, G[1]); p.px(2, 7 + oy, G[3]); p.px(12, 7 + oy, G[3]);
    if (!p.fine) return;
    // Bretter: Fuge mit Lichtkante, Maserung quer, Beschläge mit Lichtkante, Nieten
    p.rect(0, 9.5 + oy, 16, 0.5, WOOD[0]); p.rect(0, 10 + oy, 16, 0.5, WOOD[3]);
    for (const [x0, w, s] of [[0, 2, 1], [4, 8, 2], [14, 2, 3]]) {
      grainIn(p, x0, 7 + oy, w, 2.5, WOOD[1], WOOD[3], s, true);
      grainIn(p, x0, 10.5 + oy, w, 2.5, WOOD[1], null, s + 4, true);
    }
    for (const bx of [2, 12]) {
      p.rect(bx, 7 + oy, 0.5, 6, G[2]); p.rect(bx + 1.5, 6 + oy, 0.5, 7, G[0]);
      for (const ry of [8.5, 11.5]) { p.dot(bx + 0.5, ry + oy, G[4]); p.dot(bx + 1, ry + 0.5 + oy, G[0]); }
    }
    p.rect(0, 13 + oy, 16, 0.5, WOOD[1]);
  };
  return [
    buildFine(16, 14, 8, 13, (p) => {
      body(p);
      p.rect(0, 1, 16, 6, WOOD[3]); p.rect(1, 0, 14, 1, WOOD[4]); p.rect(0, 6, 16, 1, WOOD[1]);
      p.rect(2, 0, 2, 7, G[2]); p.rect(12, 0, 2, 7, G[2]); p.px(2, 1, G[4]);
      p.rect(7, 5, 3, 4, G[2]); p.px(8, 7, '#1a0a05'); p.px(7, 5, G[4]);
      if (!p.fine) return;
      // Deckel: gewölbte Bretter mit Fugen und Maserung, Lichtkante oben, Schattenfuge zum Korpus
      for (const y of [2.5, 4.5]) { p.rect(0, y, 16, 0.5, WOOD[2]); p.rect(0, y + 0.5, 16, 0.5, WOOD[4]); }
      for (const [x0, w, s] of [[0, 2, 5], [4, 3, 6], [10, 2, 7], [14, 2, 8]]) grainIn(p, x0, 1, w, 1.5, WOOD[2], null, s, true);
      grainIn(p, 4, 3, 8, 1.5, WOOD[2], null, 9, true, (x) => x < 7 || x >= 10);
      p.rect(1, 0, 14, 0.5, '#a07a50'); p.rect(0, 6.5, 16, 0.5, WOOD[0]);
      // Beschläge: 5 Stufen, Glanzlinie, Glanzpunkt, Nieten
      for (const bx of [2, 12]) {
        p.rect(bx, 0, 0.5, 6.5, G[3]); p.rect(bx + 1.5, 0, 0.5, 6.5, G[1]); p.rect(bx + 0.5, 0.5, 0.5, 2.5, G[4]);
        for (const ry of [2, 4.5]) { p.dot(bx + 1, ry, G[4]); p.dot(bx + 1.5, ry + 0.5, G[0]); }
      }
      p.dot(2, 0, '#ffffff');
      // Schloss: Platte mit Fase, Schlüsselloch, Glanz
      fmap(p, 7, 5, [
        '443332',
        '432221',
        '32kk21',
        '32kk11',
        '322k11',
        '322k11',
        '221110',
        '211100',
      ], GP);
    }),
    buildFine(16, 16, 8, 15, (p) => {
      body(p, 2);
      p.rect(0, 0, 16, 4, WOOD[1]); p.rect(1, 1, 14, 2, WOOD[0]);
      p.rect(2, 0, 2, 4, G[1]); p.rect(12, 0, 2, 4, G[1]);
      p.rect(2, 7, 12, 2, '#0e0806');
      if (!p.fine) { p.px(5, 7, G[4]); p.px(9, 8, G[3]); p.px(11, 7, G[4]); return; }
      // Deckel innen: Bretter mit Maserung, Beschläge mit Nieten, Kante oben im Licht
      p.rect(0, 0, 16, 0.5, WOOD[3]); p.rect(0, 3.5, 16, 0.5, WOOD[0]);
      grainIn(p, 4, 1, 8, 2, WOOD[1], null, 11, true);
      for (const bx of [2, 12]) { p.rect(bx, 0, 0.5, 4, G[2]); p.rect(bx + 1.5, 0, 0.5, 4, G[0]); p.dot(bx + 1, 1.5, G[3]); }
      // Inhalt: Münzhaufen mit Glanz, ein Rubin
      fmap(p, 2, 7, [
        '..43...42..43.4...32....',
        '.4321.4322.43221.4322.4.',
        '432214322r432214322143k2',
        '1k21k11k21k11k21k11k21k1',
      ], { ...GP, r: '#d0454a' });
      p.dot(6.5, 7, '#ffffff'); p.dot(20 / 2, 7.5, '#ffffff');
    }),
  ];
}

export function createPropSprites() {
  return {
    torchFlame: createFlameFrames(5, 9, 6, 11),
    brazierFlame: createFlameFrames(11, 14, 6, 17),
    candleFlame: createFlameFrames(3, 4, 4, 23),
    torchBracket: createTorchBracket(),
    brazier: createBrazier(),
    pillar: createPillar(),
    candles: createCandles(),
    bonePiles: [1, 2, 3, 4].map((s) => createBonePile(s * 13)),
    banner: createBanner(),
    chains: createChains(),
    cobwebL: createCobweb(false),
    cobwebR: createCobweb(true),
    rune: createRuneCircle(22),
    barrel: createBarrel(),
    crate: createCrate(),
    urns: [0, 1, 2].map((k) => createUrn(k)),
    sarcophagus: createSarcophagus(),
    chest: createChestFrames(),
  };
}
