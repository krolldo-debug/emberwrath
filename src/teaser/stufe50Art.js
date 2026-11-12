import { hash2 } from '../core/math.js';
import { hex } from './art.js';

// Bilder für die Einblendung „Stufe 50 ist da“: Glutziffern „50“, Siegel, Wimpel, Bandzeichen.
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
export function numeral(text = '50', { shadow = '#0a0612', star = true } = {}) {
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
    const { x, y } = zero;
    for (let i = -2; i <= 2; i++) { px(x + i, y, Math.abs(i) < 2 ? CRYSTAL[3] : CRYSTAL[1]); px(x, y + i, Math.abs(i) < 2 ? CRYSTAL[3] : CRYSTAL[1]); }
    px(x, y + 3, CRYSTAL[0]); px(x, y - 3, CRYSTAL[0]);
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

// Entwurf A „Siegel“: Plakette mit Spitzen links und rechts, Glutgoldrand, Kristalle an den Spitzen, „50“ in der Mitte
export function seal() {
  const num = numeral();
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
    if (hash2(x, y, 31) < 0.012 && t < 0.6) px(x, y, '#e8e8ff');
  }
  gem(px, 6, Math.round(cy), 3);
  gem(px, W - 7, Math.round(cy), 3);
  ctx.drawImage(num, Math.round((W - num.width) / 2), Math.round((H - num.height) / 2) + 1);
  return c;
}

// Entwurf B „Wimpel“: Stange mit Glutknäufen, Tuch mit Schwalbenschwanz, Goldborte, Sternsiegel, „50“, Quasten
export function pennant() {
  const num = numeral();
  const W = num.width + 26, H = 100, cx = W / 2 - 0.5;
  const cl = 6, cr = W - 7, top = 5, notch = 82, point = 93;
  const c = canvas(W, H), px = painter(c), ctx = c.getContext('2d');
  const bottom = (x) => notch + (point - notch) * Math.min(1, Math.abs(x - cx) / ((cr - cl) / 2));
  const cloth = (x, y) => x >= cl && x <= cr && y >= top && y <= bottom(x);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!cloth(x, y)) {
      if (cloth(x - 1, y) || cloth(x + 1, y) || cloth(x, y - 1)) px(x, y, INK);
      continue;
    }
    const e = Math.min(x - cl, cr - x, bottom(x) - y);
    if (e < 1) { px(x, y, INK); continue; }
    if (e < 2) { px(x, y, x - cl < 2 ? '#ffd27a' : '#c8822e'); continue; }        // Goldborte
    if (e < 3) { px(x, y, '#7a3a14'); continue; }
    if (e < 4) { px(x, y, INK); continue; }
    // Faltenwurf: senkrechte Bahnen, unten dunkler
    const fold = 0.5 + 0.5 * Math.sin((x - cl) * 0.5 + 0.6) * (0.6 + 0.4 * (y / H));
    const t = Math.max(0, Math.min(1, fold * 0.8 + (1 - y / H) * 0.25));
    px(x, y, night(x, y, 0.02 + t * 0.98));
    // Glut am Saum: harte Funkenpixel, je näher am unteren Rand desto dichter
    const near = bottom(x) - y;
    if (near >= 4 && near < 5) px(x, y, '#ff8a32');
    else if (near >= 5 && near < 6) px(x, y, '#c83414');
    else if (near >= 6 && near < 9 && hash2(x, y, 17) < 0.5 - (near - 6) * 0.15 && ((x + y) & 1)) px(x, y, '#5e150c');
  }
  // Saum oben über der Stange
  for (let x = cl; x <= cr; x++) { px(x, top, '#4e3c80'); px(x, top + 1, '#3a3478'); px(x, top + 2, INK); }
  // Stange und Glutknäufe
  for (let x = 1; x < W - 1; x++) { px(x, 2, '#5c3a3a'); px(x, 3, '#3a2226'); px(x, 4, '#22141a'); px(x, 1, INK); px(x, 5, INK); }
  for (const kx of [2, W - 3]) {
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) {
      const d = Math.abs(x) + Math.abs(y);
      if (d > 3) continue;
      px(kx + x, 3 + y, d === 3 ? INK : d === 0 ? '#ffffff' : (x < 0 || y < 0) ? '#ffbc56' : '#dc4418');
    }
  }
  // Schnüre zur Aufhängung (oben aus dem Bild heraus)
  for (let y = 0; y < 1; y++) { px(Math.round(cx) - 10, y, '#3a2226'); px(Math.round(cx) + 10, y, '#3a2226'); }
  // Sternsiegel oben
  const sy = 14, scx = Math.round(cx);
  for (let i = -6; i <= 6; i++) { const a = Math.abs(i); px(scx + i, sy, a < 2 ? '#ffffff' : a < 4 ? CRYSTAL[2] : CRYSTAL[1]); px(scx, sy + i, a < 2 ? '#ffffff' : a < 4 ? CRYSTAL[2] : CRYSTAL[1]); }
  for (let i = 1; i <= 2; i++) { px(scx + i, sy + i, CRYSTAL[1]); px(scx - i, sy - i, CRYSTAL[1]); px(scx + i, sy - i, CRYSTAL[1]); px(scx - i, sy + i, CRYSTAL[1]); }
  // Zierlinie unter dem Stern
  for (let x = cl + 6; x <= cr - 6; x++) if (Math.abs(x - cx) > 8) { px(x, sy, '#c87488'); px(x, sy + 1, INK); }
  ctx.drawImage(num, Math.round((W - num.width) / 2), 21);
  // Gestickte Zackenborte unter dem Band
  for (let x = cl + 4; x <= cr - 4; x++) {
    const zy = 73 + Math.abs(((x - cl) % 6) - 3) - 1;
    px(x, zy, '#ffd27a'); px(x, zy + 1, '#7a3a14');
  }
  // Quasten an den Spitzen
  for (const qx of [cl + 1, cr - 1]) {
    for (let y = 0; y < 6; y++) { px(qx - 1, point + y - 1, y < 2 ? '#ffd27a' : '#c8822e'); px(qx, point + y - 1, y < 2 ? '#ffe6a8' : '#c8822e'); px(qx + 1, point + y - 1, '#7a3a14'); }
    px(qx, point + 5, '#7a3a14');
  }
  return c;
}

// Entwurf C „Glutband“: kleines Zeichen links im Band – „50“ auf einem Stern-Kristall
export function badge() {
  const num = numeral('50', { star: true });
  const W = num.width + 16, H = num.height + 12;
  const c = canvas(W, H), px = painter(c), ctx = c.getContext('2d');
  // Raute hinter der Zahl, oben und unten über die Zahl hinaus
  const cx = W / 2 - 0.5, cy = H / 2 - 0.5;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.abs(x - cx) / (W / 2) + Math.abs(y - cy) / (H / 2);
    if (d > 1) continue;
    px(x, y, d > 0.93 ? INK : d > 0.84 ? (y < cy ? '#5ccbea' : '#2484a8') : d > 0.78 ? INK : night(x, y, 0.2 + (y / H) * 0.7));
  }
  ctx.drawImage(num, Math.round((W - num.width) / 2), Math.round((H - num.height) / 2) + 1);
  return c;
}

// Glutfunken für die Ruhe-Animation: n Bilder, jeweils ein paar harte Pixel, die nach oben steigen
export function embers(w, h, frame, seed = 1) {
  const c = canvas(w, h), px = painter(c);
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(hash2(i, seed, 2) * w), speed = 1 + Math.floor(hash2(i, seed, 3) * 2);
    const y = h - 1 - ((Math.floor(hash2(i, seed, 4) * h) + frame * speed) % h);
    px(x, y, hash2(i, seed, 5) < 0.35 ? '#ffe6a8' : '#ff8a32');
    if (hash2(i, seed, 6) < 0.4) px(x, y + 1, '#c83414');
  }
  return c;
}
