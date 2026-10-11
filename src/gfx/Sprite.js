import { PixelCanvas, outlineCanvas, silhouette, flipCanvas } from './PixelCanvas.js';
import { FineCanvas, fineRes, scale2x, finishPixels, outlinePixels, pixelsToCanvas, canvasPixels } from './Fine.js';

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

// Baut einen Frame über eine Zeichenfunktion und versieht ihn mit Outline (1 Feinpixel).
// Feinraster (gfx/Fine.js): fine = true → drawFn bekommt eine FineCanvas (Stufe B, handfein); sonst zeichnet drawFn
// in Weltpixeln und das Ergebnis wird automatisch ×2 hochskaliert (Stufe A). res = fineRes(), bei „Niedrig“ 1.
// Größe und Anker bleiben in Weltpixeln; frame.res sagt, wie viele Texel ein Weltpixel hat. finish = Lichtkante und
// Kontaktschatten (Standard: an, sobald fein). Wer schon fein rastert (Held, Reittiere), übergibt res: 1.
export function buildFrame(w, h, anchorX, anchorY, drawFn, { outline = true, fine = false, res = fineRes(), finish = null } = {}) {
  let d, W, H;
  if (fine) {
    const fc = new FineCanvas(w, h, res);
    drawFn(fc);
    d = fc.pixels(); W = fc.W; H = fc.H;
  } else {
    const pc = new PixelCanvas(w, h);
    drawFn(pc);
    if (res === 1 && !finish) {
      const canvas = outline ? outlineCanvas(pc.canvas) : pc.canvas;
      const pad = outline ? 1 : 0;
      return new SpriteFrame(canvas, anchorX + pad, anchorY + pad);
    }
    d = canvasPixels(pc.canvas); W = w; H = h;
    if (res > 1) { d = scale2x(d, w, h); W = w * 2; H = h * 2; res = 2; }
  }
  if (finish ?? res > 1) finishPixels(d, W, H);
  if (outline) { d = outlinePixels(d, W, H); W += 2; H += 2; }
  const pad = outline ? 1 : 0;
  return new SpriteFrame(pixelsToCanvas(d, W, H), anchorX * res + pad, anchorY * res + pad, res);
}

// Leuchtebene (Canvas) passend zu einem Sprite zeichnen. Alte Leuchtebenen haben Weltauflösung und 1 Weltpixel
// Rand (wie der Umriss von buildFrame); feine haben dieselbe Größe wie sprite.canvas. Liefert nichts zurück.
export function drawGlowLayer(ctx, sprite, g, x, y) {
  const r = sprite.res ?? 1;
  if (r === 1 || g.width === sprite.canvas.width) ctx.drawImage(g, Math.round((x - sprite.ax / r) * r) / r, Math.round((y - sprite.ay / r) * r) / r, g.width / r, g.height / r);
  else ctx.drawImage(g, Math.round(x - (sprite.ax - 1) / r - 1), Math.round(y - (sprite.ay - 1) / r - 1));
}

// Fertigen Frame in Weltgröße in eine andere Zeichnung blitten (Zusammensetzen, z. B. Baumgruppen):
// rechnet frame.res heraus. ctx zeichnet in Weltpixeln (PixelCanvas.ctx oder FineCanvas.ctx).
export function blitFrame(ctx, f, x, y) {
  const r = f.res ?? 1, c = f.canvas;
  ctx.drawImage(c, Math.round(x - f.ax / r), Math.round(y - f.ay / r), c.width / r, c.height / r);
}
// Leinwand für eine Leuchtebene in Weltpixeln passend zu einem fertigen Sprite (1 Weltpixel Rand wie der Umriss).
export function glowCanvasSize(f) {
  const r = f.res ?? 1;
  return [Math.round((f.canvas.width - 2) / r) + 2, Math.round((f.canvas.height - 2) / r) + 2];
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
