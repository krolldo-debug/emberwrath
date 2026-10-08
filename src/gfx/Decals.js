import { makeCanvas } from './PixelCanvas.js';
import { PAL } from './Palette.js';
import { rand, randInt, pick } from '../core/math.js';

// Persistente Bodenspuren (Blut, Knochensplitter, Brandflecken).
// Kachelweise Leinwände (TILE×TILE Weltpixel), angelegt erst beim ersten Fleck in der Kachel:
// große Außenkarten (bis 2560×1664 px) brauchen so keine weltgroße Leinwand mehr.
// Höchstens MAX_TILES Kacheln; darüber wird die am längsten nicht mehr bemalte verworfen
// (ihre Spuren verblassen). Zeichnen: render(ctx, cx, cy, w, h).
const TILE = 256;
const MAX_TILES = 48;

export class Decals {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.cols = Math.ceil(w / TILE);
    this.tiles = new Map(); // key -> { c, ctx, x0, y0, used }
    this.stamp_ = 0;
  }

  #tile(ix, iy) {
    const key = iy * this.cols + ix;
    let t = this.tiles.get(key);
    if (!t) {
      const x0 = ix * TILE, y0 = iy * TILE;
      const c = makeCanvas(Math.min(TILE, this.w - x0), Math.min(TILE, this.h - y0));
      t = { c, ctx: c.getContext('2d'), x0, y0, used: 0 };
      this.tiles.set(key, t);
      if (this.tiles.size > MAX_TILES) {
        let old = null;
        for (const [k, o] of this.tiles) if (o !== t && (!old || o.used < old[1].used)) old = [k, o];
        if (old) this.tiles.delete(old[0]);
      }
    }
    t.used = ++this.stamp_;
    return t;
  }

  // fn(ctx) für jede Kachel, die das Weltrechteck [x0,x1)×[y0,y1) berührt; ctx in Weltkoordinaten.
  #each(x0, y0, x1, y1, fn) {
    const a0 = Math.max(0, Math.floor(x0 / TILE)), b0 = Math.max(0, Math.floor(y0 / TILE));
    const a1 = Math.min(this.cols - 1, Math.floor((x1 - 1) / TILE)), b1 = Math.min(Math.ceil(this.h / TILE) - 1, Math.floor((y1 - 1) / TILE));
    for (let iy = b0; iy <= b1; iy++) for (let ix = a0; ix <= a1; ix++) {
      const t = this.#tile(ix, iy);
      t.ctx.setTransform(1, 0, 0, 1, -t.x0, -t.y0);
      fn(t.ctx);
      t.ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  }

  #rect(x, y, w, h, style) {
    if (x >= this.w || y >= this.h || x + w <= 0 || y + h <= 0) return;
    this.#each(x, y, x + w, y + h, (ctx) => { ctx.fillStyle = style; ctx.fillRect(x, y, w, h); });
  }

  pixel(x, y, color) {
    this.#rect(Math.round(x), Math.round(y), 1, 1, color);
  }
  splat(x, y, palette = PAL.blood, size = 5) {
    const n = size * 4;
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), r = Math.pow(Math.random(), 1.6) * size;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * 0.6;
      this.pixel(px, py, r < size * 0.4 ? palette[1] : pick(palette.slice(0, 3)));
    }
    this.pixel(x, y, palette[2]);
  }
  scorch(x, y, radius = 10) {
    for (let i = 0; i < radius * 5; i++) {
      const a = rand(0, Math.PI * 2), r = Math.pow(Math.random(), 0.8) * radius;
      const style = `rgba(5,3,8,${rand(0.15, 0.35)})`;
      this.#rect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.6), randInt(1, 2), 1, style);
    }
  }
  stamp(canvas, x, y, alpha = 1) {
    const dx = Math.round(x - canvas.width / 2), dy = Math.round(y - canvas.height / 2);
    this.#each(dx, dy, dx + canvas.width, dy + canvas.height, (ctx) => {
      ctx.globalAlpha = alpha;
      ctx.drawImage(canvas, dx, dy);
      ctx.globalAlpha = 1;
    });
  }

  // Stempelt einen Sprite-Frame (z. B. Leiche) am Fußpunkt in die Dekal-Ebene.
  stampFrame(frame, x, y, flip, alpha = 1) {
    const img = flip ? frame.flipped : frame.canvas;
    const ax = flip ? frame.canvas.width - frame.ax : frame.ax;
    const r = frame.res ?? 1; // Dekal-Ebene hat Weltauflösung: feine Frames werden verkleinert (§11.12)
    const dx = Math.round(x - ax / r), dy = Math.round(y - frame.ay / r), dw = Math.round(img.width / r), dh = Math.round(img.height / r);
    this.#each(dx, dy, dx + dw, dy + dh, (ctx) => {
      ctx.globalAlpha = alpha;
      ctx.imageSmoothingEnabled = r !== 1;
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = 1;
    });
  }

  // Sichtbaren Ausschnitt zeichnen (ersetzt drawImage(decals.canvas, cx, cy, w, h, 0, 0, w, h)).
  render(ctx, cx, cy, w, h) {
    const x = Math.round(cx), y = Math.round(cy);
    for (const t of this.tiles.values()) {
      if (t.x0 >= x + w || t.y0 >= y + h || t.x0 + t.c.width <= x || t.y0 + t.c.height <= y) continue;
      ctx.drawImage(t.c, t.x0 - x, t.y0 - y);
    }
  }
}
