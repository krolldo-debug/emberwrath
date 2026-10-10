// Gezeichnete Pixelrahmen und Pixelschrift-Titel für HTML-Tafeln (Todesbildschirm, Gruppenleiste).
// Rahmen als 9-Slice (CSS border-image), schon in der Zielgröße gezeichnet: jede Stufe ein ganzer Bildpunkt,
// nichts wird vom Browser weichgezeichnet.

// 13×13-Vorlage, aus einem Kantenprofil erzeugt (von außen nach innen: Kontur, Kante, Kante dunkel, Innenlinie,
// Innenschatten), oben/links heller. Ecken abgeschrägt, mit einem Glutstein (Kern, Glanz oben links).
const N = 13;
function frameCell(x, y) {
  const dx = Math.min(x, N - 1 - x), dy = Math.min(y, N - 1 - y), d = Math.min(dx, dy);
  if (dx < 5 && dy < 5) {
    if (dx + dy < 2) return null;
    const gx = dx - 2, gy = dy - 2;
    if (Math.abs(gx) <= 1 && Math.abs(gy) <= 1) {
      if (gx === 0 && gy === 0) return 'E';
      return gx === -1 && gy === -1 ? 'w' : 'e'; // Glanz zur Außenecke
    }
    if (d === 0 || dx === 0 || dy === 0 || Math.abs(gx) === 2 || Math.abs(gy) === 2) return 'k';
  }
  if (d >= 5) return 'f';
  const hi = (d === dy ? y < N / 2 : x < N / 2);
  return ['k', hi ? 'R' : 'r', 'r', 'k', 'i'][d];
}

export const FRAME_SLICE = 5; // Bildpunkte der Vorlage je Ecke

const PALETTES = {
  ember: { k: '#14060a', r: '#7a1e1c', R: '#c8382e', i: '#3a0f12', f: '#150b10', e: '#a8301a', E: '#ff6a2a', w: '#ffd890' },
};

const cache = new Map();

// Rahmen als data-URL, jede Vorlagen-Stufe = scale Bildpunkte
export function frameUrl(scale = 2, palette = 'ember') {
  const key = `${palette}:${scale}`;
  if (cache.has(key)) return cache.get(key);
  const P = PALETTES[palette];
  const c = document.createElement('canvas');
  c.width = c.height = N * scale;
  const ctx = c.getContext('2d');
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const ch = frameCell(x, y);
    if (!ch) continue;
    ctx.fillStyle = P[ch];
    ctx.fillRect(x * scale, y * scale, scale, scale);
  }
  const url = c.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

// Titel in der Bitmap-Schrift (ui/PixelFont.js) als Canvas in Originalgröße; Anzeige ganzzahlig per CSS.
// Kontur ringsum, obere zwei Zeilen heller (Glutglanz).
export function pixelTitle(font, text, { color = '#ff5a3c', light = '#ffb27a', outline = '#14060a' } = {}) {
  const w = font.measure(text, 1) + 2, h = 7;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  font.draw(ctx, text, 1, 1, { color, outline: true, shadowColor: outline });
  font.draw(ctx, text, 1, 1, { color });
  // Glanz: nur die Schriftpixel der oberen beiden Zeilen umfärben
  const img = ctx.getImageData(1, 1, w - 2, 2);
  ctx.fillStyle = light;
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < w - 2; x++) {
      const o = (y * (w - 2) + x) * 4;
      if (img.data[o + 3] && img.data[o] > 200) ctx.fillRect(x + 1, y + 1, 1, 1);
    }
  }
  return c;
}
