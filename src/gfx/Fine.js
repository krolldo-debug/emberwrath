import { CONFIG } from '../config.js';
import { makeCanvas } from './PixelCanvas.js';

// Feinraster (Grafikupdate, docs/STYLE.md „Feinraster“). Die Welt bleibt in Weltpixeln (Kachel 16), gezeichnet
// wird jede Grafik mit FINE Feinpixeln je Weltpixel. Zwei Wege führen dorthin:
//   Stufe A (automatisch): alte Zeichnung in Weltpixeln → upscale2x() (Pixel-Art-Hochskalierer, keine neuen Farben,
//            glättet Treppen) → Umriss 1 Feinpixel. buildFrame() macht das für alle Sprites ohne Zutun.
//   Stufe B (handfein): Zeichnung direkt auf FineCanvas. Koordinaten bleiben Weltpixel; Formen tasten Feinpixel ab,
//            Details mit dot()/fline() in Feinpixeln. buildFrame(..., { fine: true }).
// Bei Qualität „Niedrig“ (renderScale 1) ist fineRes() 1: alles wie früher, keine zusätzlichen Kosten.
export const FINE = 2;
export function fineRes() { return (CONFIG.renderScale ?? 1) >= FINE ? FINE : 1; }

// Zeichenfläche mit res Feinpixeln je Weltpixel. API wie PixelCanvas (px/rect/line/ellipse/vgrad in Weltpixeln,
// ein Weltpixel = res×res Feinpixel), dazu feine Werkzeuge (dot, fline, each). ctx ist auf Weltpixel skaliert:
// direkte ctx-Aufrufe (fillRect, drawImage, translate) zeichnen wie bisher in Weltpixeln. getImageData/putImageData
// arbeiten wie immer in Texeln (canvas.width = w × res).
export class FineCanvas {
  constructor(w, h, res = fineRes()) {
    this.w = w; this.h = h; this.res = res; this.step = 1 / res;
    this.canvas = makeCanvas(w * res, h * res);
    this.ctx = this.canvas.getContext('2d');
    this.ctx.setTransform(res, 0, 0, res, 0, 0);
    this.fine = res > 1;
  }
  // auf das Feinraster runden
  snap(v) { return Math.round(v * this.res) / this.res; }
  // ein Weltpixel; Lage auf das Feinraster gerundet (ganze Koordinaten = genau wie PixelCanvas)
  px(x, y, c) {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(this.snap(x), this.snap(y), 1, 1);
  }
  // ein Feinpixel (der, in dem die Weltkoordinate liegt)
  dot(x, y, c) {
    const r = this.res;
    this.ctx.fillStyle = c;
    this.ctx.fillRect(Math.floor(x * r + 1e-6) / r, Math.floor(y * r + 1e-6) / r, 1 / r, 1 / r);
  }
  rect(x, y, w, h, c) {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(this.snap(x), this.snap(y), this.snap(w), this.snap(h));
  }
  // Linie in Weltpixeln (1 Weltpixel stark, wie PixelCanvas.line)
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
  // feine Linie: Bresenham im Feinraster, Stärke w Weltpixel (0 = ein Feinpixel)
  fline(x0, y0, x1, y1, c, w = 0) {
    const r = this.res, f = (v) => Math.floor(v * r + 1e-6);
    let a = f(x0), b = f(y0);
    const a1 = f(x1), b1 = f(y1);
    const dx = Math.abs(a1 - a), dy = -Math.abs(b1 - b), sx = a < a1 ? 1 : -1, sy = b < b1 ? 1 : -1;
    const k = Math.max(1, Math.round(w * r)), o = (k - 1) >> 1;
    let err = dx + dy;
    this.ctx.fillStyle = c;
    for (;;) {
      this.ctx.fillRect((a - o) / r, (b - o) / r, k / r, k / r);
      if (a === a1 && b === b1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; a += sx; }
      if (e2 <= dx) { err += dx; b += sy; }
    }
  }
  // Schleife über alle Feinpixel eines Weltbereichs: fn(x, y) -> Farbe|null, x/y = Weltkoordinate der Feinpixelmitte.
  // Ohne Begrenzung auf die Fläche (Aufrufer mit translate zeichnen auch außerhalb).
  each(x0, y0, x1, y1, fn) {
    const r = this.res, ctx = this.ctx, q = 1 / r;
    const F0 = Math.floor(x0 * r), F1 = Math.ceil(x1 * r), G0 = Math.floor(y0 * r), G1 = Math.ceil(y1 * r);
    for (let G = G0; G <= G1; G++) {
      const y = (G + 0.5) / r;
      for (let F = F0; F <= F1; F++) {
        const c = fn((F + 0.5) / r, y);
        if (c) { ctx.fillStyle = c; ctx.fillRect(F * q, G * q, q, q); }
      }
    }
  }
  // gefüllte Ellipse, fein abgetastet; c = Farbe oder fn(nx, ny, d) -> Farbe
  ellipse(cx, cy, rx, ry, c) {
    this.each(cx - rx - 1, cy - ry - 1, cx + rx + 1, cy + ry + 1, (x, y) => {
      const nx = (x - cx) / rx, ny = (y - cy) / ry, d = nx * nx + ny * ny;
      if (d > 1) return null;
      return typeof c === 'function' ? c(nx, ny, d) : c;
    });
  }
  vgrad(x, y, w, h, ramp) {
    const r = this.res, H = h * r, W = w * r, x0 = this.snap(x), y0 = this.snap(y);
    for (let j = 0; j < H; j++) {
      const t = j / Math.max(1, H - 1) * (ramp.length - 1);
      const k = Math.floor(t), f = t - k;
      for (let i = 0; i < W; i++) {
        const th = ((i & 1) * 2 + (j & 1) * 3) % 4 / 4 + 0.125;
        this.ctx.fillStyle = ramp[Math.min(ramp.length - 1, f > th ? k + 1 : k)];
        this.ctx.fillRect(x0 + i / r, y0 + j / r, 1 / r, 1 / r);
      }
    }
  }
}

// Pixel-Art-Hochskalierer ×2 (Scale2x/EPX mit Deckungsprüfung): jede Quelle wird zu 2×2 Feinpixeln; an Treppen
// übernimmt ein Feinpixel die Farbe der Nachbarn, so werden Diagonalen und Rundungen glatter. Keine neuen
// Farben, keine Halbtransparenz. Liefert ein neues Canvas (2w × 2h).
export function upscale2x(src) {
  const w = src.width, h = src.height;
  const sd = new Uint32Array(src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data.buffer);
  const out = makeCanvas(w * 2, h * 2);
  const octx = out.getContext('2d');
  const img = octx.createImageData(w * 2, h * 2);
  const od = new Uint32Array(img.data.buffer);
  const W2 = w * 2;
  // fast durchsichtige Pixel gelten als leer (wie outlineCanvas)
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : ((sd[y * w + x] >>> 24) > 40 ? sd[y * w + x] : 0));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const E = sd[y * w + x];
      const B = at(x, y - 1), D = at(x - 1, y), F = at(x + 1, y), H = at(x, y + 1);
      let e0 = E, e1 = E, e2 = E, e3 = E;
      if (B !== H && D !== F) {
        if (D === B) e0 = D;
        if (B === F) e1 = F;
        if (D === H) e2 = D;
        if (H === F) e3 = F;
      }
      const o = y * 2 * W2 + x * 2;
      od[o] = e0; od[o + 1] = e1; od[o + W2] = e2; od[o + W2 + 1] = e3;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

// Feinschliff (alle Feinraster-Sprites): Mondlicht-Kante oben (1 Feinpixel heller, leicht kühl) und Kontaktschatten
// unten (1 Feinpixel dunkler). Gibt Figuren auf dunklem Boden Volumen und Kontur, ohne weichen Schein.
// Wirkt nur auf deckende Pixel, ändert die Silhouette nicht. rim/shade = Stärke 0..1.
export function finishFine(canvas, { rim = 0.32, shade = 0.28 } = {}) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  const a = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = d[i * 4 + 3] > 40 ? 1 : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const m = y * w + x;
      if (!a[m]) continue;
      const up = y === 0 || !a[m - w], down = y === h - 1 || !a[m + w];
      if (up === down) continue;
      const i = m * 4;
      if (up) {   // Kante zum Himmel: heller, Richtung Mondlicht (#d8dcff)
        d[i] += (216 - d[i]) * rim; d[i + 1] += (220 - d[i + 1]) * rim; d[i + 2] += (255 - d[i + 2]) * rim;
      } else {    // Unterkante: dunkler
        d[i] *= 1 - shade; d[i + 1] *= 1 - shade; d[i + 2] *= 1 - shade;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
