import { CONFIG } from '../config.js';
import { makeCanvas } from '../gfx/PixelCanvas.js';
import { tr } from '../i18n/index.js';

// Abspielgerät für einen Story-Clip in Spielgrafik. Die Welt läuft weiter (Online-Spiel), der Clip legt nur
// Kamera, Breitbild-Balken, Nahaufnahme, Blitze und Sprechzeilen darüber. Jede Eingabe überspringt ihn.
//
// Ein Clip (clips.js) liefert: duration, start(c), beats: [[t, fn(c)]], camera(c, t) -> {x, y} | null,
// lines: [[t0, t1, sprecher, text]], closeups: [[t0, t1, ziel(c) -> {x, y}]], drawWorld(c, ctx, cam), end(c, skipped).
// c (dieses Objekt) bietet: session, world, hero, t, flash(farbe, bilder), shake(n), state (frei für den Clip).
const BAR = 36;          // Höhe der Breitbild-Balken (Weltpixel)
const BAR_STEP = 6;      // Balken fahren in harten Stufen ein
const TYPE_CPS = 42;     // Schreibgeschwindigkeit der Sprechzeilen
const GRACE = 0.45;      // so lange nach dem Start zählen Eingaben noch nicht als Überspringen
const SKIP_ACTIONS = ['attack', 'dodge', 'skill1', 'skill2', 'skill3', 'skill4', 'potion', 'interact', 'mount', 'pause', 'up', 'down', 'left', 'right'];
const C_TEXT = '#efe2c8', C_NAME = '#f0a03a', C_HINT = '#6e5a5e', C_BAR = '#05020a', C_EDGE = '#2a0c10';

export class Cinematic {
  constructor(session, clip) {
    this.session = session;
    this.world = session.world;
    this.hero = session.world.hero;
    this.clip = clip;
    this.t = 0;
    this.done = false;
    this.skipped = false;
    this.state = {};
    this.flashes = [];
    this.beatIndex = 0;
    this.buf = null;
  }

  start() {
    // Held bleibt stehen; wer danach eine Richtung drückt, überspringt den Clip
    for (const a of ['up', 'down', 'left', 'right']) this.session.input.release(a);
    this.clip.start?.(this);
  }

  flash(color, frames = 1) { this.flashes.push({ color, frames }); }
  shake(n) { this.session.camera?.shake(n); }

  // Eingaben prüfen (vor dem Weltschritt), Zeit vorrücken, Beats auslösen, Kamera setzen
  update(dt) {
    if (this.done) return;
    const inp = this.session.input;
    if (this.t > GRACE && SKIP_ACTIONS.some((a) => inp.pressed(a))) { this.finish(true); return; }
    this.t += dt;
    const beats = this.clip.beats ?? [];
    while (this.beatIndex < beats.length && beats[this.beatIndex][0] <= this.t) beats[this.beatIndex++][1](this);
    this.#voice();
    const f = this.clip.camera?.(this, this.t);
    this.session.cameraFocus = f ?? null;
    if (this.t >= this.clip.duration) this.finish(false);
  }

  finish(skipped) {
    if (this.done) return;
    this.done = true;
    this.skipped = skipped;
    this.session.cameraFocus = null;
    // Übersprungene Beats nachholen, die den Zustand der Welt betreffen (z. B. Boss erwacht)
    this.clip.end?.(this, skipped);
  }

  // Sprechzeilen hörbar machen: kurzer Ton beim Start, leises Tippen beim Schreiben (Stimmlage je Sprecher)
  #voice() {
    const ln = this.#line(), sfx = this.session.sfx;
    if (!ln) { this.voiceAt = null; return; }
    const shown = Math.floor(ln.t * TYPE_CPS);
    if (this.voiceAt?.text !== ln.text) { this.voiceAt = { text: ln.text, n: 0 }; sfx?.play?.('dialog'); }
    const len = tr(ln.text).length;
    while (this.voiceAt.n + 3 <= Math.min(shown, len)) { this.voiceAt.n += 3; sfx?.play?.('blip', { freq: this.clip.voice?.[ln.who] ?? 320 }); }
  }

  #bars() {
    const t = this.t, out = this.clip.duration - t;
    const k = Math.min(1, t / 0.3, out / 0.3);
    return Math.round((BAR * Math.max(0, k)) / BAR_STEP) * BAR_STEP;
  }

  #closeup() {
    for (const [t0, t1, target] of this.clip.closeups ?? []) if (this.t >= t0 && this.t < t1) return target(this);
    return null;
  }

  #line() {
    for (const [t0, t1, who, text] of this.clip.lines ?? []) if (this.t >= t0 && this.t < t1) return { t: this.t - t0, who, text };
    return null;
  }

  // Zeichnen über dem fertigen Weltbild: ctx ist auf Weltpixel skaliert (CONFIG.renderScale)
  draw(ctx) {
    if (this.done) return;
    const W = CONFIG.viewWidth, H = CONFIG.viewHeight, k = CONFIG.renderScale;
    const cam = this.session.camera;
    this.clip.drawWorld?.(this, ctx, { x: cam.rx, y: cam.ry });

    // Nahaufnahme: Bildausschnitt ganzzahlig auf das Doppelte vergrößert (Pixelraster bleibt ganzzahlig)
    const cu = this.#closeup();
    if (cu) {
      const zw = Math.floor(W / 2), zh = Math.floor(H / 2);
      const sx = Math.max(0, Math.min(W - zw, Math.round(cu.x - cam.rx - zw / 2)));
      const sy = Math.max(0, Math.min(H - zh, Math.round(cu.y - cam.ry - zh / 2)));
      if (!this.buf || this.buf.width !== zw * k || this.buf.height !== zh * k) this.buf = makeCanvas(zw * k, zh * k);
      const b = this.buf.getContext('2d');
      b.imageSmoothingEnabled = false;
      b.clearRect(0, 0, this.buf.width, this.buf.height);
      b.drawImage(ctx.canvas, sx * k, sy * k, zw * k, zh * k, 0, 0, zw * k, zh * k);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.buf, 0, 0, zw * k, zh * k, 0, 0, zw * 2, zh * 2);
    }

    // Blitz: volle Farbe, einzelne Bilder, kein Alpha
    const fl = this.flashes[0];
    if (fl) {
      ctx.fillStyle = fl.color;
      ctx.fillRect(0, 0, W, H);
      if (--fl.frames <= 0) this.flashes.shift();
    }

    // Breitbild-Balken mit dunkler Glutkante
    const bh = this.#bars();
    if (bh > 0) {
      ctx.fillStyle = C_BAR;
      ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh);
      ctx.fillStyle = C_EDGE;
      ctx.fillRect(0, bh, W, 1); ctx.fillRect(0, H - bh - 1, W, 1);
    }
    const font = this.session.font;
    if (bh >= BAR && this.t > GRACE) font.draw(ctx, 'Überspringen >', W - 8, 8, { color: C_HINT, align: 'right' });

    // Sprechzeile im unteren Balken: Name klein in Glutfarbe, Text in doppelter Größe, Schreibmaschine
    const ln = this.#line();
    if (ln && bh >= BAR) {
      const text = tr(ln.text).toUpperCase();
      const shown = Math.min(text.length, Math.floor(ln.t * TYPE_CPS));
      const lines = wrap(font, text, W - 32, 2);
      const y0 = H - BAR + 5;
      font.draw(ctx, ln.who, 16, y0, { color: C_NAME });
      let n = shown;
      lines.forEach((row, i) => {
        if (n <= 0) return;
        font.draw(ctx, row.slice(0, n), 16, y0 + 9 + i * 13, { color: C_TEXT, scale: 2, raw: true, shadow: true });
        n -= row.length + 1;
      });
    }
  }

  dispose() { this.session.cameraFocus = null; }
}

// Zeilenumbruch nach gemessener Breite (Text ist schon übersetzt und groß geschrieben)
function wrap(font, text, maxW, scale) {
  const out = [];
  let cur = '';
  for (const word of text.split(' ')) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && font.measure(next, scale, true) > maxW) { out.push(cur); cur = word; } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}
