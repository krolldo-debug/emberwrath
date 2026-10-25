import { CONFIG } from '../config.js';
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
    // pc wird nur zurückgelesen (Pixelpuffer, Umriss), außer er ist selbst das fertige Bild (direkt, ohne Umriss)
    const direct = res === 1 && !finish;
    const pc = new PixelCanvas(w, h, { read: !direct || outline });
    drawFn(pc);
    if (direct) {
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

// Aufgeschobener Frame (Ladezeit beim Zonenwechsel): Sprite-Dateien legen lazyFrame(() => …) statt des fertigen
// Frames in die Frameliste einer Animation. Gezeichnet wird erst, wenn der Frame gebraucht wird (frameAt, frames[i])
// oder wenn ihn die Vorbereitung in Häppchen baut (Animation.warmOne, world/spriteWarm.js). Das Ergebnis ist
// dasselbe wie beim sofortigen Bauen; die Zeichenfunktion darf nur ihre eigenen Argumente lesen.
// Gebaut wird mit der Bildfeinheit (CONFIG.renderScale) von damals, als der Frame angelegt wurde: ein Satz bleibt
// einheitlich, auch wenn die Qualität inzwischen gewechselt hat.
export class LazyFrame {
  #build;
  #value = null;
  #scale;
  constructor(build) { this.#build = build; this.#scale = CONFIG.renderScale; }
  get() {
    if (!this.#value) {
      const keep = CONFIG.renderScale;
      CONFIG.renderScale = this.#scale;
      try {
        let v = this.#build();
        while (v instanceof LazyFrame) v = v.get();
        this.#value = v; this.#build = null;
      } finally { CONFIG.renderScale = keep; }
    }
    return this.#value;
  }
}
export const lazyFrame = (build) => new LazyFrame(build);
export const resolveFrame = (f) => (f instanceof LazyFrame ? f.get() : f);
// n aufgeschobene Frames, die nur gemeinsam entstehen (z. B. Zersplittern aus dem Puffer des letzten Bildes):
// der erste Zugriff baut die ganze Gruppe. build() muss genau n Frames liefern.
export function lazyFrames(n, build) {
  let list = null;
  const at = (i) => {
    if (!list) {
      list = build();
      if (list.length !== n) throw new Error(`lazyFrames: ${list.length} statt ${n} Frames`);
    }
    return list[i];
  };
  return Array.from({ length: n }, (_, i) => new LazyFrame(() => at(i)));
}
const LAZY_FRAMES = {
  get(t, k) {
    const v = t[k];
    if (v instanceof LazyFrame) return (t[k] = v.get());
    return v;
  },
};

// Animation = Frameliste + Timing. Zustand liegt im Animator der Entity.
// Enthält die Liste aufgeschobene Frames (LazyFrame), ist frames eine Hülle, die beim Lesen baut: Außenstehende sehen
// immer fertige Frames (frames[i], length, map, Spread …).
export class Animation {
  #raw = null; // Frameliste mit noch offenen LazyFrames (null = alles fertig)
  constructor(frames, fps = 10, loop = true) {
    this.fps = fps; this.loop = loop;
    if (Array.isArray(frames) && frames.some((f) => f instanceof LazyFrame)) {
      this.#raw = [...frames];
      this.frames = new Proxy(this.#raw, LAZY_FRAMES);
    } else this.frames = frames;
  }
  get duration() { return this.frames.length / this.fps; }
  #index(t) {
    const i = Math.floor(t * this.fps);
    return this.loop ? i % this.frames.length : Math.min(i, this.frames.length - 1);
  }
  // Ist der Frame zur Zeit t schon gebaut? (Frame-Marken ferner, ruhender Figuren nicht erzwingen)
  builtAt(t) { const raw = this.#raw; return !raw || !(raw[this.#index(t)] instanceof LazyFrame); }
  frameAt(t) {
    const i = this.#index(t);
    const raw = this.#raw;
    if (raw) { const f = raw[i]; return f instanceof LazyFrame ? (raw[i] = f.get()) : f; }
    return this.frames[i];
  }
  // Nachbearbeitung je Frame: fn(frame) ändert den fertigen Frame. Aufgeschobene Frames bleiben aufgeschoben (fn läuft
  // nach dem Bau). memo teilen, wenn mehrere Animationen dieselben Frames enthalten: jeder Frame nur einmal.
  eachFrame(fn, memo = new Map()) {
    const list = this.#raw ?? this.frames;
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      let r = memo.get(f);
      if (!r) {
        if (f instanceof LazyFrame) r = new LazyFrame(() => { const v = f.get(); fn(v); return v; });
        else { fn(f); r = f; }
        memo.set(f, r);
      }
      if (r !== f) list[i] = r;
    }
  }
  // Noch nicht gebaute Frames?
  get pending() { return !!this.#raw && this.#raw.some((f) => f instanceof LazyFrame); }
  // Einen offenen Frame bauen (Vorbereitung in Häppchen). false = es war nichts mehr offen.
  warmOne() {
    const raw = this.#raw;
    if (!raw) return false;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] instanceof LazyFrame) { raw[i] = raw[i].get(); return true; }
    }
    this.frames = raw; this.#raw = null; // alles fertig: ab jetzt ohne Hülle
    return false;
  }
}
// Alle schon angelegten Animationen eines Sprite-Satzes (Objekt mit Animation-Werten), z. B. für die Vorbereitung.
// Noch nicht angelegte (Getter, die beim ersten Zugriff bauen, z. B. Heldensätze) bleiben unberührt.
export function animationsOf(set) {
  const out = [];
  if (!set || typeof set !== 'object') return out;
  for (const k of Object.keys(set)) {
    const a = Object.getOwnPropertyDescriptor(set, k)?.value;
    if (a instanceof Animation) out.push(a);
  }
  return out;
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
  get frameReady() { return this.current.builtAt?.(this.time) ?? true; }
  get finished() { return !this.current.loop && this.time >= this.current.duration; }
}
