import { makeCanvas } from './PixelCanvas.js';
import { PAL } from './Palette.js';
import { rand, randInt, pick } from '../core/math.js';

// Persistente Bodenspuren (Blut, Knochensplitter, Brandflecken).
// Werden einmal in eine weltgroße Leinwand gestempelt – kostenlos pro Frame.
export class Decals {
  constructor(w, h) {
    this.canvas = makeCanvas(w, h);
    this.ctx = this.canvas.getContext('2d');
  }
  pixel(x, y, color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
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
    const ctx = this.ctx;
    for (let i = 0; i < radius * 5; i++) {
      const a = rand(0, Math.PI * 2), r = Math.pow(Math.random(), 0.8) * radius;
      ctx.fillStyle = `rgba(5,3,8,${rand(0.15, 0.35)})`;
      ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.6), randInt(1, 2), 1);
    }
  }
  stamp(canvas, x, y, alpha = 1) {
    this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(canvas, Math.round(x - canvas.width / 2), Math.round(y - canvas.height / 2));
    this.ctx.globalAlpha = 1;
  }

  // Stempelt einen Sprite-Frame (z. B. Leiche) am Fußpunkt in die Dekal-Ebene.
  stampFrame(frame, x, y, flip, alpha = 1) {
    const img = flip ? frame.flipped : frame.canvas;
    const ax = flip ? frame.canvas.width - frame.ax : frame.ax;
    const r = frame.res ?? 1; // Dekal-Ebene hat Weltauflösung: feine Frames werden verkleinert (§11.12)
    this.ctx.globalAlpha = alpha;
    this.ctx.imageSmoothingEnabled = r !== 1;
    this.ctx.drawImage(img, Math.round(x - ax / r), Math.round(y - frame.ay / r), Math.round(img.width / r), Math.round(img.height / r));
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.globalAlpha = 1;
  }
}
