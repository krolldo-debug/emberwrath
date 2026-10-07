import { PixelCanvas, outlineCanvas, silhouette, flipCanvas } from './PixelCanvas.js';

// Ein fertiger Animations-Frame inkl. vorberechneter Varianten
// (gespiegelt, Treffer-Blitz). Anker = Fußpunkt der Figur.
export class SpriteFrame {
  // Gespiegelte und weiße Varianten entstehen erst beim ersten Gebrauch: spart beim
  // Zonenaufbau Zeit und auf dem Handy drei Viertel des Grafikspeichers je Frame.
  #flipped = null; #flash = null; #flashFlipped = null;
  // res = Texel je Weltpixel (INTEGRATION §11.12). canvas, ax, ay sind in Texeln; gezeichnet wird in Weltpixeln.
  constructor(canvas, anchorX, anchorY, res = 1) {
    this.canvas = canvas;
    this.ax = anchorX; this.ay = anchorY;
    this.res = res;
  }
  get flipped() { return this.#flipped ??= flipCanvas(this.canvas); }
  get flash() { return this.#flash ??= silhouette(this.canvas, '#ffffff'); }
  get flashFlipped() { return this.#flashFlipped ??= flipCanvas(this.flash); }
  draw(ctx, x, y, { flip = false, flash = false, alpha = 1 } = {}) {
    const img = flash ? (flip ? this.flashFlipped : this.flash) : flip ? this.flipped : this.canvas;
    const ax = flip ? this.canvas.width - this.ax : this.ax;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    const r = this.res;
    if (r === 1) ctx.drawImage(img, Math.round(x - ax), Math.round(y - this.ay));
    else ctx.drawImage(img, Math.round(x * r - ax) / r, Math.round(y * r - this.ay) / r, img.width / r, img.height / r);
    if (alpha !== 1) ctx.globalAlpha = 1;
  }
}

// Baut einen Frame über eine Zeichenfunktion und versieht ihn mit Outline.
export function buildFrame(w, h, anchorX, anchorY, drawFn, { outline = true, keepAlpha = false } = {}) {
  const pc = new PixelCanvas(w, h);
  drawFn(pc);
  const canvas = outline ? outlineCanvas(pc.canvas, undefined, { keepAlpha }) : pc.canvas;
  const pad = outline ? 1 : 0;
  return new SpriteFrame(canvas, anchorX + pad, anchorY + pad);
}

// Animation = Frameliste + Timing. Zustand liegt im Animator der Entity.
export class Animation {
  constructor(frames, fps = 10, loop = true) {
    this.frames = frames; this.fps = fps; this.loop = loop;
  }
  get duration() { return this.frames.length / this.fps; }
  frameAt(t) {
    let i = Math.floor(t * this.fps);
    if (this.loop) i %= this.frames.length;
    else i = Math.min(i, this.frames.length - 1);
    return this.frames[i];
  }
}

export class Animator {
  constructor(anims) {
    this.anims = anims;
    this.current = null;
    this.name = '';
    this.time = 0;
  }
  play(name, restart = false) {
    if (this.name === name && !restart) return;
    this.name = name;
    this.current = this.anims[name];
    this.time = 0;
  }
  update(dt) { this.time += dt; }
  get frame() { return this.current.frameAt(this.time); }
  get finished() { return !this.current.loop && this.time >= this.current.duration; }
}
