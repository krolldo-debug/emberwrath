import { hash2 } from '../core/math.js';
import { hex } from './art.js';

// Bild für die Einblendung „Stufe 50 ist da“ (vom Nutzer gewählter Entwurf A „Siegel“): Plakette mit Spitzen links und
// rechts, Goldglutrand, Kristalle an den Spitzen, Nachthimmel, darin die glühende „50“ mit einem Stern in der Null.
// 1 Bildpunkt = 1 Kunstpixel; die Anzeige vergrößert ganzzahlig auf Gerätepixel (stufe50.js, --u).

// Ziffern 13×16, Strich 4 breit, Querbalken 2 hoch, abgeschrägte Ecken
const DIGITS = {
  5: [
    '.XXXXXXXXXXXX', '.XXXXXXXXXXXX', '.XXXX....XXXX', '.XXXX.....XXX', '.XXXX......XX', '.XXXX........',
    '.XXXXXXXXX...', '.XXXXXXXXXXX.', '.......XXXXXX', '.........XXXX', '.........XXXX', 'XX.......XXXX',
    'XXX......XXXX', 'XXXX....XXXXX', '.XXXXXXXXXXX.', '..XXXXXXXXX..',
  ],
  0: [
    '...XXXXXXX...', '..XXXXXXXXX..', '.XXXX...XXXX.', 'XXXX.....XXXX', 'XXXX.....XXXX', 'XXXX.....XXXX',
    'XXXX.....XXXX', 'XXXX.....XXXX', 'XXXX.....XXXX', 'XXXX.....XXXX', 'XXXX.....XXXX', 'XXXX.....XXXX',
    'XXXX.....XXXX', '.XXXX...XXXX.', '..XXXXXXXXX..', '...XXXXXXX...',
  ],
};
const DH = 16;
// Glut von weißglühend (oben) bis dunkelrot (unten), je Zeile eine Stufe
const EMBER = ['#ffffff', '#fff4d6', '#ffe6a8', '#ffd27a', '#ffbc56', '#ffa242', '#ff8a32', '#f87026', '#ec581e', '#dc4418',
  '#c83414', '#b02a12', '#962210', '#7c1c0e', '#64170c', '#4e120a'];
const INK = '#120610';
const CRYSTAL = ['#2484a8', '#5ccbea', '#b8f2ff', '#ffffff'];

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function painter(c) {
  const ctx = c.getContext('2d');
  return (x, y, col) => { if (!col) return; ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); };
}

// „50“ als Maske; Kontur, harter Schatten nach unten, Glutverlauf, Stern im Innern der Null
function numeral(text = '50', { shadow = '#0a0612', star = true, twinkle = 0 } = {}) {
  const gap = 2, pad = 3;
  const gl = [...text].map((d) => DIGITS[d]);
  const W = gl.reduce((s, g) => s + g[0].length, 0) + gap * (gl.length - 1) + pad * 2, H = DH + pad * 2 + 2;
  const m = new Uint8Array(W * H);
  let x0 = pad, zero = null;
  for (const [i, g] of gl.entries()) {
    for (let y = 0; y < DH; y++) for (let x = 0; x < g[y].length; x++) if (g[y][x] === 'X') m[(pad + y) * W + x0 + x] = 1;
    if (text[i] === '0') zero = { x: x0 + 6, y: pad + 7 };
    x0 += g[0].length + gap;
  }
  const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? m[y * W + x] : 0);
  const c = canvas(W, H), px = painter(c);
  // harter Schatten zwei Pixel nach unten, dann Kontur (auch diagonal: harte Ecken)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!at(x, y) && (at(x, y - 2) || at(x - 1, y - 2) || at(x, y - 3))) px(x, y, shadow);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (at(x, y)) continue;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) n += at(x + dx, y + dy);
    if (n) px(x, y, INK);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!at(x, y)) continue;
    const row = y - pad;
    let col = EMBER[row];
    if (!at(x, y - 1)) col = row < 3 ? '#ffffff' : EMBER[Math.max(0, row - 5)];          // Glanzkante oben
    else if (!at(x - 1, y)) col = EMBER[Math.max(0, row - 3)];                            // Licht von links
    else if (!at(x + 1, y) || !at(x, y + 1)) col = EMBER[Math.min(EMBER.length - 1, row + 3)]; // Schattenkante
    else if (hash2(x, y, 9) < 0.06 && row > 4 && row < 13) col = '#fff4d6';                // Funken im Glutkern
    px(x, y, col);
  }
  // Stern in der Null
  if (star && zero) {
    // twinkle 0..2: Strahlen kurz, mittel, lang (Funkeln in der Ruhe-Animation)
    const { x, y } = zero, arm = [1, 2, 2][twinkle], tail = twinkle === 2;
    for (let i = -arm; i <= arm; i++) { px(x + i, y, Math.abs(i) < 2 ? CRYSTAL[3] : CRYSTAL[1]); px(x, y + i, Math.abs(i) < 2 ? CRYSTAL[3] : CRYSTAL[1]); }
    if (arm > 1 || tail) { px(x, y + 3, CRYSTAL[0]); px(x, y - 3, CRYSTAL[0]); }
    if (tail) { px(x, y + 4, CRYSTAL[0]); px(x, y - 4, CRYSTAL[0]); }
  }
  return c;
}

// Kristall (Raute), Größe r: Glanz oben links, Kontur
function gem(px, cx, cy, r) {
  for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) {
    const d = Math.abs(x) + Math.abs(y);
    if (d === r + 1) px(cx + x, cy + y, INK);
    else if (d <= r) px(cx + x, cy + y, d === r ? (x < 0 || y < 0 ? CRYSTAL[1] : CRYSTAL[0]) : (x <= 0 && y <= 0 && d < r - 0 ? CRYSTAL[2] : CRYSTAL[1]));
  }
  px(cx - 1, cy - 1, '#ffffff');
}

// Nachthimmel-Füllung mit Morgenschimmer unten, Bayer-Dither, vereinzelte Sterne
const NIGHT = ['#0e0b1e', '#151638', '#1c1c46', '#22245a', '#2e2b6a', '#3a3478', '#4e3c80'].map(hex);
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const rgb = (v) => `rgb(${v[0]},${v[1]},${v[2]})`;
function night(x, y, t) {
  const i = Math.max(0, Math.min(NIGHT.length - 1, Math.floor(t * (NIGHT.length - 1) + BAY[(y & 3) * 4 + (x & 3)])));
  return rgb(NIGHT[i]);
}

// Siegel; frame 0..3 = Bilder der Ruhe-Animation (Sterne im Himmel und der Stern in der Null funkeln)
export const SEAL_FRAMES = 4;
export function seal(frame = 0) {
  const num = numeral('50', { twinkle: [1, 2, 1, 0][frame % SEAL_FRAMES] });
  const W = num.width + 56, H = 44, cy = H / 2 - 0.5, tip = 14;
  const c = canvas(W, H), px = painter(c), ctx = c.getContext('2d');
  // Form: Rechteck mit spitzen Enden (Sechseck), Abstand d zum Rand
  const inside = (x, y, d) => {
    const dy = Math.abs(y - cy), half = H / 2 - 3 - d;
    if (dy > half) return false;
    const left = 4 + d + (dy / half) * (tip - d * 0.4), right = W - 5 - d - (dy / half) * (tip - d * 0.4);
    return x >= left && x <= right;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inside(x, y, -1)) continue;
    if (!inside(x, y, 0)) { px(x, y, INK); continue; }
    if (!inside(x, y, 1)) { px(x, y, y < cy ? '#ffd27a' : '#c8822e'); continue; }    // Goldkante, oben heller
    if (!inside(x, y, 2)) { px(x, y, y < cy ? '#c8822e' : '#7a3a14'); continue; }
    if (!inside(x, y, 3)) { px(x, y, INK); continue; }
    if (!inside(x, y, 4)) { px(x, y, '#3a3478'); continue; }                          // Innenlinie violett
    const t = (y - 4) / (H - 8);
    px(x, y, night(x, y, 0.15 + t * 0.85));
    // Sterne: ein Teil leuchtet je Bild heller oder verlischt kurz
    const st = hash2(x, y, 31);
    if (st < 0.012 && t < 0.6) {
      const ph = Math.floor(hash2(x, y, 32) * SEAL_FRAMES);
      px(x, y, ph === frame % SEAL_FRAMES ? '#ffffff' : (ph + 2) % SEAL_FRAMES === frame % SEAL_FRAMES ? '#62458a' : '#b8b8e8');
    }
  }
  gem(px, 6, Math.round(cy), 3);
  gem(px, W - 7, Math.round(cy), 3);
  ctx.drawImage(num, Math.round((W - num.width) / 2), Math.round((H - num.height) / 2) + 1);
  return c;
}
