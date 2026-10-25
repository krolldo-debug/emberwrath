import { CONFIG } from '../config.js';
import { makeCanvas } from './PixelCanvas.js';
import { PAL } from './Palette.js';

// Feinraster (Grafikupdate, docs/STYLE.md „Feinraster“). Die Welt bleibt in Weltpixeln (Kachel 16), gezeichnet
// wird jede Grafik mit FINE Feinpixeln je Weltpixel. Zwei Wege führen dorthin:
//   Stufe A (automatisch): alte Zeichnung in Weltpixeln → ×2 mit Pixel-Art-Hochskalierer (keine neuen Farben,
//            glättet Treppen) → Feinschliff (Lichtkante/Kontaktschatten) → Umriss 1 Feinpixel. buildFrame() macht
//            das für alle Sprites ohne Zutun.
//   Stufe B (handfein): Zeichnung direkt auf FineCanvas. Koordinaten bleiben Weltpixel; Formen tasten Feinpixel ab,
//            Details mit dot()/fline() in Feinpixeln. buildFrame(..., { fine: true }).
// Bei Qualität „Niedrig“ (renderScale 1) ist fineRes() 1: alles wie früher, keine zusätzlichen Kosten.
export const FINE = 2;
export function fineRes() { return (CONFIG.renderScale ?? 1) >= FINE ? FINE : 1; }

// ---------------------------------------------------------------- Farben → Uint32 (RGBA little endian)
const colCache = new Map();
let probe = null;
export function col32(c) {
  let v = colCache.get(c);
  if (v !== undefined) return v;
  if (typeof c === 'string' && c[0] === '#' && (c.length === 7 || c.length === 4)) {
    const h = c.length === 4 ? c[1] + c[1] + c[2] + c[2] + c[3] + c[3] : c.slice(1);
    const n = parseInt(h, 16);
    v = (0xff000000 | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
  } else {
    probe ??= makeCanvas(1, 1, { willReadFrequently: true }).getContext('2d');
    probe.clearRect(0, 0, 1, 1); probe.fillStyle = c; probe.fillRect(0, 0, 1, 1);
    const d = probe.getImageData(0, 0, 1, 1).data;
    v = ((d[3] << 24) | (d[2] << 16) | (d[1] << 8) | d[0]) >>> 0;
  }
  colCache.set(c, v);
  return v;
}

// Zeichenfläche mit res Feinpixeln je Weltpixel. API wie PixelCanvas (px/rect/line/ellipse/vgrad in Weltpixeln,
// ein Weltpixel = res×res Feinpixel), dazu feine Werkzeuge (dot, fline, each) und translate(). Gezeichnet wird in
// einen Pixelpuffer (schnell); ctx (auf Weltpixel skaliert) bleibt für drawImage/clearRect/Verläufe nutzbar – der
// Puffer wird vorher automatisch eingeblendet. Verschiebungen nur über p.translate(dx, dy), nicht über ctx.translate.
export class FineCanvas {
  constructor(w, h, res = fineRes()) {
    this.w = w; this.h = h; this.res = res; this.step = 1 / res;
    this.W = w * res; this.H = h * res;
    this.buf = new Uint32Array(this.W * this.H);
    this.dirty = false;
    this.ox = 0; this.oy = 0;
    this.fine = res > 1;
    this._canvas = null; this._ctx = null;
  }
  // Leinwand erst bei Bedarf (direkte ctx-Nutzung oder Abschluss)
  get ctx() { this.#flush(); return this._ctx; }
  get canvas() { this.#flush(); return this._canvas; }
  #ensure() {
    if (this._canvas) return;
    // Bau-Leinwand: wird bei jedem Abschluss zurückgelesen (ohne willReadFrequently ein Rücklesen aus der Grafikkarte)
    this._canvas = makeCanvas(this.W, this.H, { willReadFrequently: true });
    this._ctx = this._canvas.getContext('2d');
    this._ctx.setTransform(this.res, 0, 0, this.res, this.ox * this.res, this.oy * this.res);
  }
  #flush() {
    this.#ensure();
    if (!this.dirty) return;
    const c = this._ctx, img = c.getImageData(0, 0, this.W, this.H), d = new Uint32Array(img.data.buffer), b = this.buf;
    for (let i = 0; i < b.length; i++) if (b[i]) { d[i] = b[i]; b[i] = 0; }
    c.putImageData(img, 0, 0);
    this.dirty = false;
  }
  // Fertiges Bild als Pixelpuffer (Puffer + ctx-Zeichnungen); für buildFrame
  pixels() {
    if (!this._canvas) return this.buf;
    this.#flush();
    return new Uint32Array(this._ctx.getImageData(0, 0, this.W, this.H).data.buffer);
  }
  translate(dx, dy) {
    this.ox += dx; this.oy += dy;
    if (this._ctx) this._ctx.translate(dx, dy);
  }
  resetTranslate() { this.translate(-this.ox, -this.oy); }
  // Feinpixel setzen (Texelkoordinaten, ohne Verschiebung)
  put(F, G, v) {
    if (F < 0 || G < 0 || F >= this.W || G >= this.H) return;
    if (v >>> 24 === 255) this.buf[G * this.W + F] = v;
    else if (v >>> 24) {   // halbdurchsichtig: über den Puffer legen (selten)
      const i = G * this.W + F, o = this.buf[i], a = (v >>> 24) / 255;
      if (!o) { this.buf[i] = v; } else {
        const mix = (s) => Math.round(((v >>> s) & 255) * a + ((o >>> s) & 255) * (1 - a));
        this.buf[i] = (0xff000000 | (mix(16) << 16) | (mix(8) << 8) | mix(0)) >>> 0;
      }
    }
    this.dirty = true;
  }
  #fill(F, G, n, m, v) { for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) this.put(F + i, G + j, v); }
  F(x) { return Math.floor((x + this.ox) * this.res + 1e-6); }
  G(y) { return Math.floor((y + this.oy) * this.res + 1e-6); }
  // auf das Feinraster runden
  snap(v) { return Math.round(v * this.res) / this.res; }
  // ein Weltpixel; Lage auf das Feinraster gerundet (ganze Koordinaten = genau wie PixelCanvas)
  px(x, y, c) { if (c) this.#fill(Math.round((x + this.ox) * this.res), Math.round((y + this.oy) * this.res), this.res, this.res, col32(c)); }
  // ein Feinpixel (der, in dem die Weltkoordinate liegt)
  dot(x, y, c) { if (c) this.put(this.F(x), this.G(y), col32(c)); }
  rect(x, y, w, h, c) {
    if (!c) return;
    const r = this.res, F = Math.round((x + this.ox) * r), G = Math.round((y + this.oy) * r);
    this.#fill(F, G, Math.round(w * r), Math.round(h * r), col32(c));
  }
  // Linie in Weltpixeln (1 Weltpixel stark, wie PixelCanvas.line)
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  // feine Linie: Bresenham im Feinraster, Stärke w Weltpixel (0 = ein Feinpixel)
  fline(x0, y0, x1, y1, c, w = 0) {
    if (!c) return;
    const r = this.res, v = col32(c);
    let a = this.F(x0), b = this.G(y0);
    const a1 = this.F(x1), b1 = this.G(y1);
    const dx = Math.abs(a1 - a), dy = -Math.abs(b1 - b), sx = a < a1 ? 1 : -1, sy = b < b1 ? 1 : -1;
    const k = Math.max(1, Math.round(w * r)), o = (k - 1) >> 1;
    let err = dx + dy;
    for (;;) {
      this.#fill(a - o, b - o, k, k, v);
      if (a === a1 && b === b1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; a += sx; }
      if (e2 <= dx) { err += dx; b += sy; }
    }
  }
  // Schleife über alle Feinpixel eines Weltbereichs: fn(x, y) -> Farbe|null, x/y = Weltkoordinate der Feinpixelmitte
  each(x0, y0, x1, y1, fn) {
    const r = this.res;
    const F0 = Math.floor(x0 * r), F1 = Math.ceil(x1 * r), G0 = Math.floor(y0 * r), G1 = Math.ceil(y1 * r);
    const fo = Math.round(this.ox * r), go = Math.round(this.oy * r);
    for (let G = G0; G <= G1; G++) {
      const y = (G + 0.5) / r;
      for (let F = F0; F <= F1; F++) {
        const c = fn((F + 0.5) / r, y);
        if (c) this.put(F + fo, G + go, col32(c));
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
    const r = this.res, H = h * r, W = w * r, F0 = Math.round((x + this.ox) * r), G0 = Math.round((y + this.oy) * r);
    for (let j = 0; j < H; j++) {
      const t = j / Math.max(1, H - 1) * (ramp.length - 1);
      const k = Math.floor(t), f = t - k;
      for (let i = 0; i < W; i++) {
        const th = ((i & 1) * 2 + (j & 1) * 3) % 4 / 4 + 0.125;
        this.put(F0 + i, G0 + j, col32(ramp[Math.min(ramp.length - 1, f > th ? k + 1 : k)]));
      }
    }
  }
}

// ---------------------------------------------------------------- Pixelpuffer-Werkzeuge (ein Durchgang je Frame)
// Pixel-Art-Hochskalierer ×2 (Scale2x/EPX): jede Quelle wird zu 2×2 Feinpixeln; an Treppen übernimmt ein Feinpixel
// die Farbe der Nachbarn, so werden Diagonalen und Rundungen glatter. Keine neuen Farben, keine Halbtransparenz.
export function scale2x(sd, w, h) {
  const od = new Uint32Array(w * h * 4), W2 = w * 2;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : ((sd[y * w + x] >>> 24) > 40 ? sd[y * w + x] : 0));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const E = sd[y * w + x];
      let e0 = E, e1 = E, e2 = E, e3 = E;
      const B = at(x, y - 1), D = at(x - 1, y), F = at(x + 1, y), H = at(x, y + 1);
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
  return od;
}

// Feinschliff: Mondlicht-Kante oben (1 Feinpixel heller, leicht kühl) und Kontaktschatten unten (1 Feinpixel dunkler).
// Gibt Figuren auf dunklem Boden Volumen und Kontur, ohne weichen Schein. Ändert die Silhouette nicht.
export function finishPixels(d, w, h, { rim = 0.3, shade = 0.26 } = {}) {
  // Gleiches Ergebnis wie je Pixel mit Nachbarprüfung, aber zeilenweise ohne Hilfsfunktion (Ladezeit)
  const kr = 1 - shade, last = h - 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const m = row + x, v = d[m];
      if ((v >>> 24) <= 40) continue;
      const up = y === 0 || (d[m - w] >>> 24) <= 40, down = y === last || (d[m + w] >>> 24) <= 40;
      if (up === down) continue;
      let r = v & 255, g = (v >>> 8) & 255, b = (v >>> 16) & 255;
      if (up) { r += (216 - r) * rim; g += (220 - g) * rim; b += (255 - b) * rim; }
      else { r *= kr; g *= kr; b *= kr; }
      d[m] = ((v & 0xff000000) | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r)) >>> 0;
    }
  }
  return d;
}

// Umriss 1 Texel um alle deckenden Pixel (wie PixelCanvas.outlineCanvas: Oberkante getönt), Ergebnis (w+2)×(h+2).
const OUT = col32(PAL.outline);
export function outlinePixels(sd, sw, sh) {
  const w = sw + 2, h = sh + 2, od = new Uint32Array(w * h);
  const or = OUT & 255, og = (OUT >>> 8) & 255, ob = (OUT >>> 16) & 255;
  const mask = new Uint8Array(w * h);
  // Belegter Spaltenbereich je Maskenzeile: Ausgabezeilen werden nur dort abgesucht, wo Zeile darüber, selbst oder
  // darunter etwas hat (Figuren füllen ihren Rahmen selten; Ergebnis gleich).
  const lo = new Int32Array(h).fill(w), hi = new Int32Array(h).fill(-1);
  for (let y = 0; y < sh; y++) {
    const so = y * sw, mo = (y + 1) * w + 1;
    let a = -1, b = -1;
    for (let x = 0; x < sw; x++) if ((sd[so + x] >>> 24) > 40) { mask[mo + x] = 1; if (a < 0) a = x; b = x; }
    if (a >= 0) { lo[y + 1] = a + 1; hi[y + 1] = b + 1; }
  }
  for (let y = 0; y < h; y++) {
    let x0 = lo[y], x1 = hi[y];
    if (y > 0) { if (lo[y - 1] < x0) x0 = lo[y - 1]; if (hi[y - 1] > x1) x1 = hi[y - 1]; }
    if (y + 1 < h) { if (lo[y + 1] < x0) x0 = lo[y + 1]; if (hi[y + 1] > x1) x1 = hi[y + 1]; }
    if (x1 < 0) continue;
    if (x0 > 0) x0--;
    if (x1 < w - 1) x1++;
    const row = y * w;
    for (let x = x0; x <= x1; x++) {
      const m = row + x;
      if (mask[m]) { od[m] = (sd[(y - 1) * sw + x - 1] | 0xff000000) >>> 0; continue; }
      const below = y + 1 < h && mask[m + w] === 1, above = y > 0 && mask[m - w] === 1;
      if (!(below || above || (x > 0 && mask[m - 1] === 1) || (x + 1 < w && mask[m + 1] === 1))) continue;
      if (below && !above) {
        const s = sd[y * sw + x - 1];
        od[m] = (0xff000000 | (Math.round(ob * 0.62 + ((s >>> 16) & 255) * 0.3) << 16) | (Math.round(og * 0.62 + ((s >>> 8) & 255) * 0.3) << 8) | Math.round(or * 0.62 + (s & 255) * 0.3)) >>> 0;
      } else od[m] = OUT;
    }
  }
  return od;
}

export function pixelsToCanvas(d, w, h) {
  const c = makeCanvas(w, h);
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(d.buffer, d.byteOffset, w * h * 4), w, h), 0, 0);
  return c;
}
export function canvasPixels(c) {
  return new Uint32Array(c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data.buffer);
}

// Bequeme Hüllen für Canvas-Nutzer (Icons, Einzelbilder)
export function upscale2x(src) { return pixelsToCanvas(scale2x(canvasPixels(src), src.width, src.height), src.width * 2, src.height * 2); }
export function finishFine(canvas, opts) {
  const d = finishPixels(canvasPixels(canvas), canvas.width, canvas.height, opts);
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(d.buffer), canvas.width, canvas.height), 0, 0);
  return canvas;
}
