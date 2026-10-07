import { PAL } from './Palette.js';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return c;
}

// Zeichenhilfe für pixelgenaue Sprite-Erzeugung.
export class PixelCanvas {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.canvas = makeCanvas(w, h);
    this.ctx = this.canvas.getContext('2d');
  }
  px(x, y, c) {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
  rect(x, y, w, h, c) {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  // Bresenham-Linie – rotierte Waffen bleiben pixelgenau.
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    this.ctx.fillStyle = c;
    for (;;) {
      this.ctx.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  // Senkrechter Farbverlauf über eine Palette (Materialschattierung, gerastert).
  vgrad(x, y, w, h, ramp) {
    for (let j = 0; j < h; j++) {
      const t = j / Math.max(1, h - 1) * (ramp.length - 1);
      const k = Math.floor(t), f = t - k;
      for (let i = 0; i < w; i++) {
        // 2×2-Bayer-Dither zwischen benachbarten Stufen
        const th = ((i & 1) * 2 + (j & 1) * 3) % 4 / 4 + 0.125;
        this.px(x + i, y + j, ramp[Math.min(ramp.length - 1, f > th ? k + 1 : k)]);
      }
    }
  }
  // Gefüllte Ellipse (pixelgenau, ohne Anti-Aliasing).
  ellipse(cx, cy, rx, ry, c) {
    this.ctx.fillStyle = c;
    for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
      const t = 1 - (y * y) / (ry * ry);
      if (t < 0) continue;
      const hw = Math.round(rx * Math.sqrt(t) - 0.15);
      this.ctx.fillRect(Math.round(cx - hw), Math.round(cy + y), hw * 2 + 1, 1);
    }
  }
}

// 1px-Outline um alle nicht-transparenten Pixel. Das ist der wichtigste
// Schritt für den "cleanen" Pixel-Art-Look moderner 16-Bit-Spiele.
// Selektiver Umriss (Standard): unten/seitlich fast schwarz, oben leicht in der
// Farbe des angrenzenden Materials getönt – Figuren wirken weniger "ausgestanzt",
// die Silhouette bleibt trotzdem auf dunklem Boden klar lesbar.
export function outlineCanvas(src, color = PAL.outline, { selective = true } = {}) {
  const sw = src.width, sh = src.height;
  const w = sw + 2, h = sh + 2;
  const out = makeCanvas(w, h);
  const sd = src.getContext('2d').getImageData(0, 0, sw, sh).data;
  const octx = out.getContext('2d');
  const img = octx.createImageData(w, h);
  const od = img.data;
  const [r, g, b] = [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)];
  // Deckungsmaske mit 1 px Rand (Ausgabe-Koordinaten): spart die Bereichsprüfung je Nachbar.
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) if (sd[(y * sw + x) * 4 + 3] > 40) mask[(y + 1) * w + x + 1] = 1;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const m = y * w + x, i = m * 4;
      if (mask[m]) {
        const si = ((y - 1) * sw + x - 1) * 4;
        od[i] = sd[si]; od[i + 1] = sd[si + 1]; od[i + 2] = sd[si + 2]; od[i + 3] = 255;
        continue;
      }
      const below = y + 1 < h && mask[m + w] === 1, above = y > 0 && mask[m - w] === 1;
      const left = x > 0 && mask[m - 1] === 1, right = x + 1 < w && mask[m + 1] === 1;
      if (!(below || above || left || right)) continue;
      od[i + 3] = 255;
      // Oberkante (Pixel liegt über dem Material): getönt. Sonst: Grundfarbe.
      if (selective && below && !above) {
        const si = (y * sw + x - 1) * 4;
        od[i] = Math.round(r * 0.62 + sd[si] * 0.3);
        od[i + 1] = Math.round(g * 0.62 + sd[si + 1] * 0.3);
        od[i + 2] = Math.round(b * 0.62 + sd[si + 2] * 0.3);
      } else { od[i] = r; od[i + 1] = g; od[i + 2] = b; }
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

// Einfarbige Silhouette (Treffer-Blitz, Schatten, Spawn-Effekte).
export function silhouette(src, color = '#ffffff') {
  const c = makeCanvas(src.width, src.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

export function flipCanvas(src) {
  const c = makeCanvas(src.width, src.height);
  const ctx = c.getContext('2d');
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return c;
}
