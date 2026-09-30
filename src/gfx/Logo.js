import { makeCanvas } from './PixelCanvas.js';

// Emberwrath-Schriftzug als Pixel-Art: eigene Großbuchstaben (12 px hoch),
// Glut-Verlauf von weißgelb (oben) zu tiefrot (unten), Fasen-Licht oben links,
// dunkle Kontur, weicher Glutsaum, herabtropfende Glut und eine
// Zierlinie mit Raute darunter. logoCanvas() ist gecacht; logoUrl() für CSS/HTML.
const GLYPHS = {
  E: ['XXXXXXXXX', 'XXXXXXXXX', '.XXX...XX', '.XXX....X', '.XXX.X...', '.XXXXX...', '.XXXXX...', '.XXX.X...', '.XXX....X', '.XXX...XX', 'XXXXXXXXX', 'XXXXXXXXX'],
  M: ['XXXX.....XXXX', '.XXXX...XXXX.', '.XXXXX.XXXXX.', '.XXX.XXX.XXX.', '.XXX..X..XXX.', '.XXX.....XXX.', '.XXX.....XXX.', '.XXX.....XXX.', '.XXX.....XXX.', '.XXX.....XXX.', 'XXXXX...XXXXX', 'XXXXX...XXXXX'],
  B: ['XXXXXXXX..', 'XXXXXXXXX.', '.XXX...XXX', '.XXX...XXX', '.XXX..XXX.', '.XXXXXXX..', '.XXXXXXXX.', '.XXX...XXX', '.XXX...XXX', '.XXX...XXX', 'XXXXXXXXX.', 'XXXXXXXX..'],
  R: ['XXXXXXXX..', 'XXXXXXXXX.', '.XXX...XXX', '.XXX...XXX', '.XXX..XXX.', '.XXXXXXX..', '.XXXXXX...', '.XXX.XXX..', '.XXX..XXX.', '.XXX..XXX.', 'XXXXX..XXX', 'XXXXX...XX'],
  F: ['XXXXXXXXX', 'XXXXXXXXX', '.XXX...XX', '.XXX....X', '.XXX.X...', '.XXXXX...', '.XXXXX...', '.XXX.X...', '.XXX.....', '.XXX.....', 'XXXXX....', 'XXXXX....'],
  A: ['....XXX....', '...XXXXX...', '...XXXXX...', '..XXX.XXX..', '..XXX.XXX..', '.XXX...XXX.', '.XXXXXXXXX.', '.XXXXXXXXX.', 'XXX.....XXX', 'XXX.....XXX', 'XXXX...XXXX', 'XXXX...XXXX'],
  L: ['XXXXX....', 'XXXXX....', '.XXX.....', '.XXX.....', '.XXX.....', '.XXX.....', '.XXX.....', '.XXX.....', '.XXX....X', '.XXX...XX', 'XXXXXXXXX', 'XXXXXXXXX'],
  W: ['XXXXX...XXXXX', 'XXXXX...XXXXX', '.XXX.....XXX.', '.XXX.....XXX.', '.XXX.....XXX.', '.XXX.....XXX.', '.XXX..X..XXX.', '.XXX.XXX.XXX.', '.XXXXX.XXXXX.', '.XXXX...XXXX.', '.XXX.....XXX.', '..XX.....XX..'],
  T: ['XXXXXXXXXXX', 'XXXXXXXXXXX', 'XX..XXX..XX', 'X...XXX...X', '....XXX....', '....XXX....', '....XXX....', '....XXX....', '....XXX....', '....XXX....', '...XXXXX...', '...XXXXX...'],
  H: ['XXXXX.XXXXX', 'XXXXX.XXXXX', '.XXX...XXX.', '.XXX...XXX.', '.XXX...XXX.', '.XXXXXXXXX.', '.XXXXXXXXX.', '.XXX...XXX.', '.XXX...XXX.', '.XXX...XXX.', 'XXXXX.XXXXX', 'XXXXX.XXXXX'],
};
const GLYPH_H = 12;
// Glutverlauf je Zeile (oben -> unten)
const RAMP = ['#fff8d8', '#ffeaa0', '#ffd46a', '#ffbc48', '#ffa030', '#f78424', '#ef6a1c', '#dc5016', '#c83c12', '#b02e10', '#94220e', '#7a180c'];
const OUTLINE = '#1a0604';
const SHADE = '#5a1008';

function hash(x, y) { let n = x * 374761393 + y * 668265263; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }

let cache = null;
let urlCache = null;

export function logoCanvas(text = 'EMBERWRATH') {
  if (cache && text === 'EMBERWRATH') return cache;
  const gap = 3, padX = 6, padTop = 5, padBottom = 13;
  const glyphs = [...text].map((ch) => GLYPHS[ch] ?? GLYPHS.E);
  const textW = glyphs.reduce((s, g) => s + g[0].length, 0) + gap * (glyphs.length - 1);
  const W = textW + padX * 2, H = GLYPH_H + padTop + padBottom;
  // Maske der Buchstaben
  const mask = new Uint8Array(W * H);
  let x0 = padX;
  for (const g of glyphs) {
    for (let y = 0; y < GLYPH_H; y++) for (let x = 0; x < g[y].length; x++) if (g[y][x] === 'X') mask[(padTop + y) * W + x0 + x] = 1;
    x0 += g[0].length + gap;
  }
  const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? mask[y * W + x] : 0);
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const px = (x, y, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); };

  // Schlagschatten (der weiche Glutsaum kommt per CSS-Filter)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x - 1, y - 2) && !at(x, y)) px(x, y, 'rgba(10,2,4,0.8)');
  // Kontur
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (at(x, y)) continue;
    if (at(x + 1, y) || at(x - 1, y) || at(x, y + 1) || at(x, y - 1)) px(x, y, OUTLINE);
  }
  // Füllung mit Verlauf, Fasen, Glutadern
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!at(x, y)) continue;
    const row = y - padTop;
    let col = RAMP[Math.max(0, Math.min(RAMP.length - 1, row))];
    if (!at(x, y - 1)) col = '#fffcec';                    // Oberkante: Licht
    else if (!at(x - 1, y) && row < 8) col = RAMP[Math.max(0, row - 3)]; // linke Fase heller
    else if (!at(x + 1, y) || !at(x, y + 1)) col = SHADE;  // rechte/untere Fase dunkel
    else if (hash(x, y) < 0.06 && row > 3 && row < 10) col = '#fff4c0'; // Glutfunke im Metall
    px(x, y, col);
  }
  // Tropfende Glut unter einigen Buchstabenfüßen
  for (let x = 0; x < W; x++) {
    const baseY = padTop + GLYPH_H - 1;
    if (!at(x, baseY) || at(x + 1, baseY + 1)) continue;
    if (hash(x, 7) < 0.14) {
      const len = 2 + Math.floor(hash(x, 11) * 4);
      for (let i = 1; i <= len; i++) px(x, baseY + i, i === len ? '#ffd46a' : i > len - 2 ? '#ef6a1c' : '#b02e10');
      px(x, baseY + len + 1, 'rgba(255,160,60,0.5)');
    }
  }
  // Zierlinie mit Raute
  const ly = H - 4, cx = Math.floor(W / 2);
  for (let x = padX + 4; x < W - padX - 4; x++) {
    const d = Math.abs(x - cx);
    if (d < 5) continue;
    const fade = 1 - d / (W / 2 - padX);
    px(x, ly, `rgba(232,180,90,${(0.25 + fade * 0.75).toFixed(2)})`);
    if (d < 20) px(x, ly + 1, 'rgba(90,30,10,0.6)');
  }
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (Math.abs(dx) + Math.abs(dy) > 2) continue;
    px(cx + dx, ly + dy, Math.abs(dx) + Math.abs(dy) === 2 ? OUTLINE : dy < 0 || (dy === 0 && dx < 0) ? '#ffe08a' : '#c87a20');
  }
  px(cx, ly, '#fff8d8');
  if (text === 'EMBERWRATH') cache = c;
  return c;
}

export function logoUrl() {
  if (!urlCache) urlCache = logoCanvas().toDataURL();
  return urlCache;
}

// Setzt --ef-logo (url) und --ef-logo-ratio (Breite/Höhe) auf <html>, damit CSS den Schriftzug nutzen kann.
export function installLogoCss() {
  const c = logoCanvas();
  const rs = document.documentElement.style;
  rs.setProperty('--ef-logo', `url(${logoUrl()})`);
  rs.setProperty('--ef-logo-ratio', String(c.width / c.height));
}
