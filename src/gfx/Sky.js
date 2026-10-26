import { CONFIG } from '../config.js';
import { hash2 } from '../core/math.js';
import { vnoise } from '../sprites/ground/kit.js';
import { makeCanvas } from './PixelCanvas.js';
import { fineRes } from './Fine.js';

// Himmel unter den Sternenscherben (level.sky): sichtbar überall, wo der Inselboden durchsichtig ist (Abgrund, Spalten
// der Lichtbrücken). Drei Ebenen, alle im Pixelraster ohne weiche Übergänge (Stufen mit 4×4-Dither, docs/STYLE.md):
//   1. fester Hintergrund in Bildschirmkoordinaten – Verlauf, Nebel, Sterne (unendlich fern, wandert nicht mit);
//   2. ferne Inseln, Kachel mit Parallaxe 0,35 (Tiefe beim Laufen);
//   3. Wolkenband am unteren Bildrand, zieht langsam und mit Parallaxe 0,2.
// Die Lightmap (gfx/Lighting.js) multipliziert danach das ganze Bild mit dem Umgebungslicht der Zone; die Farben hier
// sind darum vorab durch das Umgebungslicht geteilt, damit der Himmel so hell bleibt, wie er gemalt ist.

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const ramp = (a) => a.map(hex);
const D4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bay = (x, y) => D4[(y & 3) * 4 + (x & 3)];
const fbm = (x, y, s) => vnoise(x, y, s) * 0.55 + vnoise(x * 2.1, y * 2.1, s + 7) * 0.3 + vnoise(x * 4.3, y * 4.3, s + 13) * 0.15;
// periodisches Rauschen (Kacheln ohne Naht): Gitter in x mit Periode p
function pnoise(x, y, p, s) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const xa = ((x0 % p) + p) % p, xb = (xa + 1) % p;
  const a = hash2(xa, y0, s), b = hash2(xb, y0, s), c = hash2(xa, y0 + 1, s), d = hash2(xb, y0 + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export const SKY_LOOKS = {
  // Morgenschimmer (Treibende Gärten, Sternhafen, Splitterweiten): oben Nacht, unten Morgenrot
  morgen: {
    sky: ramp(['#151638', '#22245a', '#3a3478', '#62458a', '#985a92', '#c87488', '#e89a88', '#f6c294']),
    neb: ramp(['#3c3a82', '#4e4a96']), neb2: ramp(['#7a5aa0', '#9466a8']),
    star: ramp(['#b8b8e8', '#e8e8ff', '#ffffff', '#ffe8d0']),
    far: ramp(['#5a4a8a', '#7a5c96', '#a06e9a']), farLit: hex('#c88aa0'),
    crystal: ramp(['#5ccbea', '#b8f2ff']),
    clouds: ramp(['#c87488', '#e0948e', '#f2b49a', '#fad2b4']),
    starLine: 0.5,
  },
};

const TILE_W = 640, TILE_H = 400;  // Kachel der fernen Inseln (Weltpixel)
const CLOUD_W = 480, CLOUD_H = 110; // Wolkenband (Weltpixel, waagerecht nahtlos)

export class StarSky {
  constructor(look, ambient = [255, 255, 255]) {
    const L = SKY_LOOKS[look] ?? SKY_LOOKS.morgen;
    // Farben vorab durch das Umgebungslicht teilen (Lightmap multipliziert später)
    const k = ambient.map((a) => 255 / Math.max(40, a));
    const comp = (c) => [0, 1, 2].map((i) => Math.min(255, Math.round(c[i] * k[i])));
    const deep = (v) => (Array.isArray(v[0]) ? v.map(comp) : comp(v));
    this.L = Object.fromEntries(Object.entries(L).map(([key, v]) => [key, Array.isArray(v) ? deep(v) : v]));
    this.base = null; this.far = null; this.clouds = null;
    this.key = '';
  }

  // Zeichnet den Himmel in die ganze Sicht (vor dem Boden). ctx in Weltpixeln.
  render(ctx, cx, cy, time) {
    const W = CONFIG.viewWidth, H = CONFIG.viewHeight, r = fineRes();
    const key = `${W}x${H}@${r}`;
    if (key !== this.key) { this.key = key; this.base = this.#bake(W, H, r); this.far ??= {}; this.clouds ??= {}; }
    ctx.drawImage(this.base, 0, 0, W, H);
    // ferne Inseln: nahtlose Kachel, Parallaxe 0,35, ganzzahlig im Feinraster
    const far = (this.far[r] ??= this.#farTile(r));
    const ox = Math.round(cx * 0.35 * r) / r, oy = Math.round(cy * 0.35 * r) / r;
    const fx0 = -(((ox % TILE_W) + TILE_W) % TILE_W), fy0 = -(((oy % TILE_H) + TILE_H) % TILE_H);
    for (let y = fy0; y < H; y += TILE_H) for (let x = fx0; x < W; x += TILE_W) ctx.drawImage(far, x, y, TILE_W, TILE_H);
    // Wolkenband
    const cl = (this.clouds[r] ??= this.#cloudTile(r));
    const wx = Math.round((cx * 0.2 + time * 2.5) * r) / r;
    const cx0 = -(((wx % CLOUD_W) + CLOUD_W) % CLOUD_W), cy0 = H - CLOUD_H;
    for (let x = cx0; x < W; x += CLOUD_W) ctx.drawImage(cl, x, cy0, CLOUD_W, CLOUD_H);
    // funkelnde Sterne (wenige, je 1 Feinpixel Kreuz)
    const tw = Math.floor(time * 3);
    for (let s = 0; s < 14; s++) {
      if (hash2(s, tw, 41) < 0.55) continue;
      const x = Math.floor(hash2(s, 0, 42) * W), y = Math.floor(hash2(s, 1, 42) * H * this.L.starLine);
      ctx.fillStyle = 'rgb(' + this.L.star[2].join(',') + ')';
      ctx.fillRect(x, y, 1 / r, 1 / r);
      ctx.fillRect(x - 1 / r, y, 3 / r, 1 / r); ctx.fillRect(x, y - 1 / r, 1 / r, 3 / r);
    }
    return true;
  }

  // Verlauf, Nebel und Sterne in Bildschirmgröße
  #bake(W, H, r) {
    const L = this.L, c = makeCanvas(W * r, H * r), g = c.getContext('2d');
    const img = g.createImageData(W * r, H * r), d = img.data, FW = W * r;
    const put = (X, Y, col) => { if (X < 0 || Y < 0 || X >= FW || Y >= H * r) return; const i = (Y * FW + X) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; };
    const step = (rm, t, x, y) => rm[Math.max(0, Math.min(rm.length - 1, Math.floor(t * (rm.length - 1) + bay(x, y))))];
    // Nebel wie der Verlauf in Weltpixeln (gröber, ruhiger), Sterne in Feinpixeln
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = y / H;
      let col = step(L.sky, Math.pow(t, 0.85), x, y);
      const n = fbm(x / 90, y / 30, 11) * 0.8 + vnoise(x / 9, y / 7, 12) * 0.2;
      if (n > 0.66 - bay(x, y) * 0.05 && t < 0.8) col = step(L.neb, (n - 0.62) / 0.3, x, y);
      const n2 = fbm(x / 60 + 30, y / 70, 23) * 0.8 + vnoise(x / 8, y / 8, 24) * 0.2;
      if (n2 > 0.7 - bay(x, y) * 0.05 && t < 0.7) col = step(L.neb2, (n2 - 0.67) / 0.25, x, y);
      for (let j = 0; j < r; j++) for (let i = 0; i < r; i++) put(x * r + i, y * r + j, col);
    }
    const count = Math.round(W * H / 310);
    for (let k = 0; k < count; k++) {
      const x = Math.floor(hash2(k, 0, 77) * W), y = Math.floor(hash2(k, 1, 77) * H);
      if (y / H > L.starLine - 0.05 + hash2(k, 3, 7) * 0.15) continue;
      const b = hash2(k, 2, 77), X = x * r + (r > 1 ? k & 1 : 0), Y = y * r + (r > 1 ? (k >> 1) & 1 : 0);
      const col = L.star[b > 0.97 ? 3 : b > 0.85 ? 2 : b > 0.5 ? 1 : 0];
      put(X, Y, col);
      if (b > 0.93) { put(X + 1, Y, col); put(X - 1, Y, L.star[1]); put(X, Y - 1, L.star[1]); put(X, Y + 1, L.star[1]); }
      if (b > 0.985 && r > 1) { put(X + 2, Y, L.star[0]); put(X - 2, Y, L.star[0]); put(X, Y - 2, L.star[0]); put(X, Y + 2, L.star[0]); }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // ferne Inseln: Silhouetten mit heller Oberkante, Kiel nach unten, vereinzelt ein Kristallfunke
  #farTile(r) {
    const L = this.L, FW = TILE_W * r, FH = TILE_H * r, c = makeCanvas(FW, FH), g = c.getContext('2d');
    const img = g.createImageData(FW, FH), d = img.data;
    const putW = (x, y, col) => {
      x = ((x % TILE_W) + TILE_W) % TILE_W; y = ((y % TILE_H) + TILE_H) % TILE_H;
      for (let j = 0; j < r; j++) for (let i = 0; i < r; i++) { const o = ((y * r + j) * FW + x * r + i) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255; }
    };
    const isles = [[90, 60, 34, 9], [380, 150, 22, 6], [560, 300, 40, 10], [200, 320, 14, 4], [500, 40, 12, 3], [300, 250, 9, 3]];
    isles.forEach(([cx, cy, rx, ry], s) => {
      for (let x = Math.floor(cx - rx * 1.3); x < cx + rx * 1.3; x++) {
        let b = -1, top = -1;
        for (let y = Math.floor(cy - ry * 1.3); y < cy + ry * 1.3; y++) {
          const dx = (x - cx) / rx, dy = (y - cy) / ry, a = Math.atan2(dy, dx);
          const wob = 0.12 * Math.sin(a * 3 + s) + 0.07 * Math.sin(a * 7 + s * 2);
          if (dx * dx + dy * dy < (1 + wob) * (1 + wob)) { if (top < 0) top = y; b = y; }
        }
        if (b < 0) continue;
        for (let y = top; y <= b; y++) putW(x, y, y === top ? L.farLit : L.far[2]);
        const e = Math.abs((x - cx) / rx), kd = Math.round(ry * 2.4 * Math.max(0, 1 - e * e) * (0.6 + 0.4 * vnoise(x / 4, 1, s)));
        for (let j = 1; j <= kd; j++) putW(x, b + j, j < 3 ? L.far[1] : L.far[0]);
        if (kd > 6 && hash2(x, 3, s + 50) > 0.9) putW(x, b + Math.floor(kd * 0.6), L.crystal[hash2(x, 4, s) > 0.5 ? 1 : 0]);
      }
    });
    g.putImageData(img, 0, 0);
    return c;
  }

  // Wolken: nach unten dichter, oben ausgefranst; waagerecht nahtlos (Periode CLOUD_W)
  #cloudTile(r) {
    const L = this.L, FW = CLOUD_W * r, FH = CLOUD_H * r, c = makeCanvas(FW, FH), g = c.getContext('2d');
    const img = g.createImageData(FW, FH), d = img.data, P = CLOUD_W / 60;
    for (let y = 0; y < CLOUD_H; y++) for (let x = 0; x < CLOUD_W; x++) {
      const t = y / CLOUD_H;
      const band = Math.sin((x / CLOUD_W) * Math.PI * 2 * 6 + y / 9) * 0.5 + pnoise(x / 60, y / 14, P, 5) * 0.55 + pnoise(x / 30, y / 7, P * 2, 6) * 0.45;
      if (band <= 1.05 - t * 0.75) continue;
      const tt = Math.max(0, Math.min(1, t * 0.8 + (band - 0.8) * 0.5));
      const col = L.clouds[Math.max(0, Math.min(L.clouds.length - 1, Math.floor(tt * (L.clouds.length - 1) + bay(x, y))))];
      for (let j = 0; j < r; j++) for (let i = 0; i < r; i++) { const o = ((y * r + j) * FW + x * r + i) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255; }
    }
    g.putImageData(img, 0, 0);
    return c;
  }
}
