import { Entity } from './Entity.js';
import { getSlashFrame, getEnemySlashFrame, SLASH_FRAMES } from '../sprites/effects.js';
import { makeCanvas } from '../gfx/PixelCanvas.js';
import { fineRes } from '../gfx/Fine.js';

// Kurzlebige visuelle Objekte. Sie leben in world.effects und werden
// (größtenteils) im Emissive-Pass gezeichnet – also nicht abgedunkelt.
//
// Feinraster (docs/STYLE.md „Feinraster“ §5): Effekte rechnen in Weltkoordinaten, gezeichnet wird auf Feinpixel
// gerundet (q = fineRes(), 2 Feinpixel je Weltpixel; bei Qualität „Niedrig“ 1 = wie früher in Weltpixeln). Harte
// Kanten, heller heißer Kern im farbigen Saum, Schein nur als gestufte Pixelringe oder Dither, Durchsicht in höchstens
// drei Stufen (A3). Effekte mit vielen Pixeln (Flammenring) werden als Bildfolge vorgerechnet und nur noch geblittet.
const sn = (v, q) => Math.round(v * q) / q;
const A3 = (v) => (v > 0.66 ? 1 : v > 0.33 ? 0.66 : v > 0.04 ? 0.33 : 0);
const rgbStr = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const dark = (c, m) => [Math.round(c[0] * m), Math.round(c[1] * m), Math.round(c[2] * m)];
const hot = (c, m) => [Math.round(c[0] + (255 - c[0]) * m), Math.round(c[1] + (255 - c[1]) * m), Math.round(c[2] + (255 - c[2]) * m)];
function hexRgb(h) {
  if (h[0] !== '#') { const m = h.match(/\d+/g); return m ? m.slice(0, 3).map(Number) : [255, 255, 255]; }
  const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Punktliste (Texel) → Rechtecke: waagrecht benachbarte Punkte einer Zeile werden zu einem Streifen, einzelne
// Punkte, die in einer Spalte direkt untereinander liegen, zu einem senkrechten. So kostet ein großer Ring einige
// Dutzend statt hunderter fillRect-Aufrufe. pts = flaches Array [x0, y0, x1, y1, …]; Ergebnis Int16Array [x, y, w, h, …].
export function pixelRuns(pts) {
  const n = pts.length / 2, idx = Array.from({ length: n }, (_, i) => i);
  idx.sort((a, b) => pts[2 * a + 1] - pts[2 * b + 1] || pts[2 * a] - pts[2 * b]);
  const rows = [];
  for (let k = 0; k < n;) {
    const x = pts[2 * idx[k]], y = pts[2 * idx[k] + 1];
    let w = 1;
    while (k + w < n && pts[2 * idx[k + w] + 1] === y && pts[2 * idx[k + w]] === x + w) w++;
    rows.push([x, y, w, 1]);
    k += w;
  }
  // einzelne Punkte senkrecht zusammenfassen
  const singles = new Map(), out = [];
  for (const r of rows) if (r[2] === 1) singles.set(r[0] * 65536 + r[1], r); else out.push(r);
  const used = new Set();
  for (const r of [...singles.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const key = r[0] * 65536 + r[1];
    if (used.has(key)) continue;
    let h = 1;
    while (singles.has(r[0] * 65536 + r[1] + h)) { used.add(r[0] * 65536 + r[1] + h); h++; }
    out.push([r[0], r[1], 1, h]);
  }
  return Int16Array.from(out.flat());
}
export function drawRuns(ctx, X, Y, runs, P) {
  for (let i = 0; i < runs.length; i += 4) ctx.fillRect(X + runs[i] * P, Y + runs[i + 1] * P, runs[i + 2] * P, runs[i + 3] * P);
}

// Ellipsen-Umriss als Feinpixel (Versätze in Texeln zur Mitte), lückenlos und ohne Doppelpunkte; dazu je Punkt der
// Winkelanteil 0..1 (für Striche/Lauflichter) und die zusammengefassten Rechtecke (runs) für volle Ringe.
// Gecacht nach Radien in Feinpixeln.
const ELL = new Map();
export function ellipsePts(rx, ry, q) {
  const RX = Math.max(1, Math.round(rx * q)), RY = Math.max(1, Math.round(ry * q)), key = RX * 4096 + RY;
  let e = ELL.get(key);
  if (e) return e;
  if (ELL.size > 600) ELL.clear();
  const seen = new Set(), xy = [], u = [];
  const n = Math.ceil(Math.PI * 2 * Math.max(RX, RY) * 1.6);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, x = Math.round(Math.cos(a) * RX), y = Math.round(Math.sin(a) * RY), k = (x + 2048) * 4096 + y + 2048;
    if (seen.has(k)) continue;
    seen.add(k); xy.push(x, y); u.push(i / n);
  }
  e = { xy: Int16Array.from(xy), u: Float32Array.from(u), n: u.length, runs: pixelRuns(xy) };
  ELL.set(key, e);
  return e;
}
// Punkte einer Ellipse zeichnen; pick(u, i) → true/false wählt aus (Striche, Dither). Farbe vorher setzen.
function ring(ctx, X, Y, e, P, pick = null) {
  if (!pick) { drawRuns(ctx, X, Y, e.runs, P); return; }
  const xy = e.xy;
  for (let i = 0; i < e.n; i++) if (pick(e.u[i], i)) ctx.fillRect(X + xy[2 * i] * P, Y + xy[2 * i + 1] * P, P, P);
}

export class SlashEffect extends Entity {
  constructor(owner, angle, style, reverse, duration, enemy = false) {
    super(owner.x, owner.y);
    this.owner = owner; this.angle = angle; this.style = style;
    this.reverse = reverse; this.duration = duration; this.t = 0; this.enemy = enemy;
    const push = 3 + (style?.push ?? 0);
    this.offX = Math.cos(angle) * push; this.offY = -8 + Math.sin(angle) * push;
  }
  update(dt) {
    this.t += dt;
    this.x = this.owner.x + this.offX; this.y = this.owner.y + this.offY;
    if (this.t >= this.duration) this.removed = true;
  }
  renderEmissive(ctx, cx, cy) {
    const f = Math.min(SLASH_FRAMES - 1, Math.floor((this.t / this.duration) * SLASH_FRAMES));
    const fr = this.enemy ? getEnemySlashFrame(this.angle, f) : getSlashFrame(this.style, this.angle, f, this.reverse);
    const r = fr.res, c = fr.canvas;
    // Mitte des vollen Quadrats auf den Effektpunkt, Ecke auf das Feinraster
    const left = Math.round((this.x - cx - fr.size / 2) * r) / r, top = Math.round((this.y - cy - fr.size / 2) * r) / r;
    ctx.drawImage(c, left + fr.ox / r, top + fr.oy / r, c.width / r, c.height / r);
  }
}

export class Afterimage extends Entity {
  constructor(frame, x, y, flip) {
    super(x, y);
    this.frame = frame; this.flip = flip; this.life = this.max = 0.22;
  }
  update(dt) { this.life -= dt; if (this.life <= 0) this.removed = true; }
  renderEmissive(ctx, cx, cy) {
    if (fineRes() === 1) { COARSE.Afterimage.call(this, ctx, cx, cy); return; }
    ctx.globalCompositeOperation = 'lighter';
    // zwei harte Stufen statt stetigem Ausblenden
    ctx.globalAlpha = this.life / this.max > 0.5 ? 0.33 : 0.16;
    const img = this.flip ? this.frame.flashFlipped : this.frame.flash;
    const ax = this.flip ? this.frame.canvas.width - this.frame.ax : this.frame.ax;
    const r = this.frame.res ?? 1; // Texel je Weltpixel (§11.12)
    ctx.drawImage(img, Math.round((this.x - cx) * r - ax) / r, Math.round((this.y - cy) * r - this.frame.ay) / r, img.width / r, img.height / r);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

// Beschwörungszeichen: kündigt einen Gegner-Spawn an (Telegraphing). Zwei gegenläufige Punktkreise in Feinpixeln,
// die sich zusammenziehen, innen ein Runenkreuz, das zum Ende heller wird.
export class SpawnMarker extends Entity {
  constructor(x, y, duration, onDone) {
    super(x, y);
    this.t = 0; this.duration = duration; this.onDone = onDone;
  }
  update(dt, world) {
    this.t += dt;
    if (Math.random() < 0.6) world.particles.magic(this.x, this.y, 1, 9 * (this.t / this.duration));
    if (this.t >= this.duration) { this.removed = true; this.onDone(); }
  }
  renderEmissive(ctx, cx, cy) {
    if (fineRes() === 1) { COARSE.SpawnMarker.call(this, ctx, cx, cy); return; }
    const q = fineRes(), P = 1 / q;
    const k = Math.min(1, this.t / this.duration);
    const r = 3 + k * 9;
    const X = sn(this.x - cx, q), Y = sn(this.y - cy, q);
    const n = 14 * q;
    ctx.globalAlpha = A3(0.4 + k * 0.6);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.t * 5;
      ctx.fillStyle = i % q ? '#6a2cb0' : '#a060f0';
      ctx.fillRect(sn(X + Math.cos(a) * r, q), sn(Y + Math.sin(a) * r * 0.55, q), P, P);
    }
    if (q > 1) {
      ctx.fillStyle = '#a060f0';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 - this.t * 3;
        ctx.fillRect(sn(X + Math.cos(a) * r * 0.6, q), sn(Y + Math.sin(a) * r * 0.33, q), P, P);
      }
    }
    ctx.globalAlpha = A3(k);
    if (ctx.globalAlpha) {
      ctx.fillStyle = '#e0b8ff';
      ctx.fillRect(X - P, Y, 3 * P, P); ctx.fillRect(X, Y - P, P, 3 * P);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(X, Y, P, P);
    }
    ctx.globalAlpha = 1;
  }
}

// Schadenszahlen – "Pop" beim Erscheinen, dann Aufsteigen und Ausblenden.
export class FloatingText extends Entity {
  constructor(x, y, text, { color = '#ffffff', scale = 1, life = 0.8, font }) {
    super(x, y);
    this.text = text; this.color = color; this.scale = scale; this.life = this.max = life; this.font = font;
    this.vy = -38; this.vx = (Math.random() - 0.5) * 20;
  }
  update(dt) {
    this.life -= dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.vy *= Math.exp(-dt * 4);
    if (this.life <= 0) this.removed = true;
  }
  renderEmissive(ctx, cx, cy) {
    const age = this.max - this.life;
    const pop = age < 0.08 ? this.scale + 1 : this.scale;
    ctx.globalAlpha = Math.min(1, this.life / (this.max * 0.4));
    this.font.draw(ctx, this.text, Math.round(this.x - cx), Math.round(this.y - cy), { color: this.color, scale: pop, align: 'center', outline: true });
    ctx.globalAlpha = 1;
  }
}

// Pulsierender Runenkreis in der Raummitte (Helligkeit in drei Stufen).
export class RuneGlow extends Entity {
  constructor(x, y, rune) {
    super(x, y);
    this.rune = rune; this.t = 0; this.surge = 0;
  }
  update(dt) { this.t += dt; this.surge = Math.max(0, this.surge - dt); }
  renderEmissive(ctx, cx, cy) {
    if (fineRes() === 1) { COARSE.RuneGlow.call(this, ctx, cx, cy); return; }
    const g = this.rune.glow;
    const v = 0.25 + 0.2 * Math.sin(this.t * 1.7) + this.surge;
    ctx.globalAlpha = Math.min(1, v > 0.8 ? 1 : v > 0.36 ? 0.45 : 0.25);
    ctx.drawImage(g, Math.round(this.x - cx - g.width / 2), Math.round(this.y - cy - g.height / 2));
    ctx.globalAlpha = 1;
  }
}

// Sich ausbreitender Ring (Einschlag, Aura, Stufenaufstieg). Pixelgenau als Ellipse in Bodenperspektive:
// außen ein Feinpixel-Ring (am Anfang weiß glühend, dann in der Farbe), innen ein zweiter in der Farbe und ein
// gedünnter dunkler Nachlauf. Ausblenden in drei Stufen.
export class Shockwave extends Entity {
  constructor(x, y, { radius = 24, color = '#ffffff', life = 0.4 } = {}) {
    super(x, y);
    this.radius = radius; this.color = color; this.life = this.max = life;
    this.rgb = hexRgb(color);
    this.cols = [rgbStr(hot(this.rgb, 0.6)), color, rgbStr(dark(this.rgb, 0.6))];
    // Schatten/Fluch: keine Linie, sondern eine flächige Leerenpfütze (siehe voidPool)
    this.void = VOID_COLORS.has(color);
    // Kleine Trefferringe (Krit, Treffer am Fuß) im Feinraster ein Drittel kleiner und kürzer
    this.small = !this.void && radius <= 16 && fineRes() > 1;
    if (this.small) { this.radius = radius * 0.67; this.life = this.max = life * 0.67; }
  }
  update(dt) { this.life -= dt; if (this.life <= 0) this.removed = true; }
  renderEmissive(ctx, cx, cy) {
    if (fineRes() === 1) { COARSE.Shockwave.call(this, ctx, cx, cy); return; }
    const q = fineRes(), P = 1 / q;
    const k = 1 - this.life / this.max;
    if (this.void && q > 1) { voidPool(ctx, this.x - cx, this.y - cy, this.radius, k, q); return; }
    const al = A3((1 - k) * 1.15);
    if (!al) return;
    const r = 2 + this.radius * (1 - Math.pow(1 - k, 3));
    const X = sn(this.x - cx, q), Y = sn(this.y - cy, q);
    ctx.globalAlpha = al;
    if (this.small) {
      // hinterer Bogen bleibt hinter der Figur offen (Ring liegt um die Füße, nicht über dem Körper)
      const e = ellipsePts(r, r * 0.5, q), cut = 6 * q, back = (u, i) => u < 0.5 || Math.abs(e.xy[2 * i]) > cut;
      ctx.fillStyle = k < 0.3 ? this.cols[0] : this.color;
      ring(ctx, X, Y, e, P, back);
      ctx.globalAlpha = 1;
      return;
    }
    ctx.fillStyle = k < 0.2 ? this.cols[0] : this.color;
    ring(ctx, X, Y, ellipsePts(r, r * 0.5, q), P);
    if (k < 0.6) { ctx.fillStyle = k < 0.2 ? this.color : this.cols[2]; ring(ctx, X, Y, ellipsePts(r - 1, (r - 1) * 0.5, q), P); }
    if (q > 1 && k < 0.4 && r > 4) { ctx.fillStyle = this.cols[2]; ring(ctx, X, Y, ellipsePts(r - 2, (r - 2) * 0.5, q), P, (u, i) => i % 2 === 0); }
    ctx.globalAlpha = 1;
  }
}

// Leerenpfütze (Schatten-/Fluch-Einschlag): flächige Ellipse, Kern fast schwarz-violett, darum gesättigtes
// Violett in drei harten Stufen, oben links ein heller Saum (Licht von oben links). Wächst schnell auf, steht,
// zieht sich dann in Stufen zusammen. Deckend gezeichnet (source-over): dunkel bleibt dunkel, auch auf dunklem Boden.
const VOID = ['#f0d8ff', '#b070ff', '#7a30e0', '#4a148e', '#12041e'];
const VOID_COLORS = new Set(['#c890ff', '#d090f0']);   // ELEMENTS.shadow/curse colors[1] (gfx/Particles.js)
export function fillEllipse(ctx, X, Y, rx, ry, q, P) {
  const RY = Math.max(1, Math.round(ry * q));
  for (let j = -RY; j <= RY; j++) {
    const w = Math.round(rx * q * Math.sqrt(Math.max(0, 1 - (j / RY) ** 2)));
    if (w > 0) ctx.fillRect(X - w * P, Y + j * P, (2 * w + 1) * P, P);
  }
}
export function voidPool(ctx, x, y, radius, k, q) {
  const P = 1 / q, X = sn(x, q), Y = sn(y, q);
  const grow = k < 0.2 ? 0.55 + k * 2.25 : k < 0.7 ? 1 : 1 - (k - 0.7) * 1.6;
  const r = Math.max(2, Math.round((radius * 0.75 + 4) * grow * q) / q);
  if (r < 2) return;
  ctx.globalAlpha = 1;
  ctx.fillStyle = VOID[2]; fillEllipse(ctx, X, Y, r + 1, (r + 1) * 0.5, q, P);
  ctx.fillStyle = VOID[3]; fillEllipse(ctx, X, Y, r, r * 0.5, q, P);
  ctx.fillStyle = VOID[4]; fillEllipse(ctx, X, Y + P, r - 2, (r - 2) * 0.5, q, P);
  // heller Saum oben links und Glutpunkte am Rand (wandern)
  const e = ellipsePts(r + 1, (r + 1) * 0.5, q), xy = e.xy;
  ctx.fillStyle = k < 0.5 ? VOID[0] : VOID[1];
  for (let i = 0; i < e.n; i++) { const u = e.u[i]; if (u > 0.55 && u < 0.8) ctx.fillRect(X + xy[2 * i] * P, Y + xy[2 * i + 1] * P, P, P); }
  ctx.fillStyle = VOID[1];
  for (let i = 0; i < e.n; i++) { const u = (e.u[i] + k * 0.5) % 1; if ((u * 9) % 1 < 0.12) ctx.fillRect(X + xy[2 * i] * P, Y + xy[2 * i + 1] * P - P, P, P); }
}

// Lichtsäule (Stufenaufstieg, Boss besiegt): senkrechter Strahl aus harten Spalten – weißer Kern, Farbband,
// geditherter Saum; Breite und Helligkeit in Stufen.
export class LightPillar extends Entity {
  constructor(x, y, { color = '#ffd66a', life = 1.2, follow = null, height = 90 } = {}) {
    super(x, y);
    this.color = color; this.life = this.max = life; this.follow = follow; this.height = height;
    this.rgb = hexRgb(color); this.deep = rgbStr(dark(this.rgb, 0.55));
  }
  update(dt) {
    this.life -= dt;
    if (this.follow) { this.x = this.follow.x; this.y = this.follow.y; }
    if (this.life <= 0) this.removed = true;
  }
  renderEmissive(ctx, cx, cy) {
    if (fineRes() === 1) { COARSE.LightPillar.call(this, ctx, cx, cy); return; }
    const q = fineRes(), P = 1 / q;
    const k = 1 - this.life / this.max;
    const grow = Math.min(1, k * 6), fade = Math.min(1, (this.life / this.max) * 2.5);
    const X = sn(this.x - cx, q), Y = sn(this.y - cy, q);
    const half = Math.max(1, Math.round(5 * grow * fade * q));   // halbe Breite in Feinpixeln
    ctx.globalCompositeOperation = 'lighter';
    for (let i = -half; i <= half; i++) {
      const edge = Math.abs(i) / half;
      const al = A3((1 - edge * 0.8) * 0.75 * fade);
      if (!al) continue;
      ctx.globalAlpha = al;
      ctx.fillStyle = edge < 0.25 ? '#ffffff' : edge < 0.7 ? this.color : this.deep;
      const hgt = sn(this.height * grow * (1 - edge * 0.3), q);
      if (edge >= 0.7 && q > 1) { for (let j = (i & 1) * P; j < hgt; j += 2 * P) ctx.fillRect(X + i * P, Y - j, P, P); continue; }
      ctx.fillRect(X + i * P, Y - hgt, P, hgt + P);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

// ---------------------------------------------------------------------------
// Runde 2: Kampf- und Magieeffekte. Alle pixelgenau, im Emissive-Pass, additiv.

// Treffer-Stern: kurzer Kreuz-/Sternblitz am Einschlagpunkt, dreht leicht. Strahlen in Feinpixeln: innen weiß,
// dann Farbe, Spitzen dunkler; Kern 2×2 bzw. 3×3 Feinpixel.
export class ImpactStar extends Entity {
  constructor(x, y, { size = 7, color = '#ffe8a0', life = 0.14, rays = 4, angle = 0 } = {}) {
    super(x, y);
    // Feinraster: Treffersterne ein Drittel kleiner und kürzer, Mitte offen (die getroffene Figur bleibt sichtbar)
    this.fine = fineRes() > 1 && size <= 10;
    if (this.fine) { size *= 0.67; life *= 0.75; }
    this.size = size; this.rgb = hexRgb(color); this.life = this.max = life; this.rays = rays; this.angle = angle;
    this.cols = ['#ffffff', rgbStr(this.rgb), rgbStr(dark(this.rgb, 0.6))];
  }
  update(dt) { this.life -= dt; if (this.life <= 0) this.removed = true; }
  renderEmissive(ctx, cx, cy) {
    if (fineRes() === 1) { COARSE.ImpactStar.call(this, ctx, cx, cy); return; }
    const q = fineRes(), P = 1 / q;
    const k = 1 - this.life / this.max;
    const al = A3(1.2 - k);
    if (!al) return;
    const len = this.size * (k < 0.3 ? 0.5 + k * 1.7 : 1.1 - (k - 0.3) * 0.6);
    const X = sn(this.x - cx, q), Y = sn(this.y - cy, q), hole = this.fine ? 2 : -1;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = al;
    // je Farbstufe ein Durchgang (wenige fillStyle-Wechsel)
    for (let band = 2; band >= 0; band--) {
      ctx.fillStyle = this.cols[band];
      for (let r = 0; r < this.rays; r++) {
        const a = this.angle + (r / this.rays) * Math.PI + k * 0.6, ca = Math.cos(a), sa = Math.sin(a);
        const l = r % 2 ? len * 0.6 : len;
        for (let i = -l; i <= l; i += P) {
          if (Math.abs(i) < hole) continue;
          const f = 1 - Math.abs(i) / (l + 1), b = f > 0.7 ? 0 : f > 0.35 ? 1 : 2;
          if (b === band) ctx.fillRect(sn(X + ca * i, q), sn(Y + sa * i, q), P, P);
        }
      }
    }
    if (!this.fine || k < 0.3) {
      const core = this.fine ? 1 : Math.max(1, Math.round(3 * (1 - k)));
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sn(X - (core * P) / 2, q), sn(Y - (core * P) / 2, q), core * P + (q > 1 ? P : 0), core * P + (q > 1 ? P : 0));
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

// Flammen-/Elementring am Boden: breites, gefülltes Band mit züngelnden Spitzen, innen verglühend.
// colors: [dunkel, mittel, hell, weiß]. Vorgerechnet als Bildfolge (NOVA_FRAMES Bilder, 4 Zungenmuster) im
// Feinraster – das alte Zeichnen Pixel für Pixel kostete pro Bild einige tausend fillRect-Aufrufe.
const NOVA_FRAMES = 14;
const novaCache = new Map();
function novaFrame(radius, cols, tongues, seed, f, q) {
  const key = `${radius}|${cols.join()}|${tongues}|${seed}|${f}|${q}`;
  let c = novaCache.get(key);
  if (c) return c;
  if (novaCache.size > 240) novaCache.clear();
  const k = (f + 0.5) / NOVA_FRAMES;
  const R = 3 + radius * (1 - Math.pow(1 - Math.min(1, k * 1.6), 3));
  const band = Math.max(2, radius * 0.35 * (1 - k));
  const fade = 1 - k * k;
  const r0 = Math.max(0, R - band), n = Math.ceil(R + 6);
  const W = (2 * n + 1) * q, H = (n + 2) * q;   // Höhe: Ellipse 2:1
  const canvas = makeCanvas(W, H), ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H), d = img.data;
  const rgb = cols.map(hexRgb);
  for (let Y = 0; Y < H; Y++) {
    for (let X = 0; X < W; X++) {
      const dx = (X + 0.5) / q - (n + 0.5), dy = ((Y + 0.5) / q - H / q / 2) * 2;
      const dd = Math.hypot(dx, dy);
      if (dd > R + 5 || dd < r0 - 4) continue;
      const a = Math.atan2(dy, dx);
      const tongue = Math.max(0, Math.sin(a * tongues * 0.5 + seed + k * 6)) * 4 * (1 - k);
      let idx, al;
      if (dd <= R + tongue && dd >= r0) {
        const t = (dd - r0) / Math.max(1, R + tongue - r0); // 0 innen … 1 außen
        idx = t > 0.92 ? 3 : t > 0.7 ? 2 : t > 0.35 ? 1 : 0;
        al = fade * (idx === 0 ? 0.35 : idx === 1 ? 0.6 : 0.85);
        // Feinraster: innerste Stufe als Dither statt durchscheinend
        if (q > 1 && idx === 0 && (X + Y) & 1) continue;
      } else if (k < 0.5 && dd < Math.max(0, r0 - 2) && dd > r0 - 4 && q > 1 && (X + Y) % 2 === 0) {
        idx = 1; al = 0.5 - k;   // Nachglühen innen: gedünnte Linie
      } else continue;
      const A = A3(al);
      if (!A) continue;
      const i = (Y * W + X) * 4, col = rgb[idx];
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = Math.round(A * 255);
    }
  }
  // Innenglut (erstes Drittel): kein durchscheinender Fleck, sondern harter Kern und gedünnter Saum, deckend
  if (k < 0.34) {
    const rr = 5 * (1 - k * 1.5);
    for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
      const dx = (X + 0.5) / q - (n + 0.5), dy = ((Y + 0.5) / q - H / q / 2) * 2, dd = Math.hypot(dx, dy) / rr;
      if (dd > 1) continue;
      const i = (Y * W + X) * 4;
      if (d[i + 3]) continue;
      if (dd > 0.45 && (X + Y) & 1) continue;
      const col = rgb[dd < 0.45 ? 3 : 2];
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  c = { canvas, w: W / q, h: H / q };
  novaCache.set(key, c);
  return c;
}
export class NovaBurst extends Entity {
  constructor(x, y, { radius = 38, colors = ['#7a2208', '#f07a1c', '#ffb640', '#fff0b0'], life = 0.5, tongues = 18 } = {}) {
    super(x, y);
    this.radius = radius; this.colors = colors; this.life = this.max = life; this.tongues = tongues;
    const r = Math.random();
    this.seed = Math.floor(r * 4) * 1.7;   // Feinraster: 4 Zungenmuster (Bildfolge gecacht)
    this.seedCoarse = r * 100;             // „Niedrig“: wie früher
    this.cols = colors.map(hexRgb);
  }
  update(dt) { this.life -= dt; if (this.life <= 0) this.removed = true; }
  renderEmissive(ctx, cx, cy) {
    const q = fineRes();
    if (q === 1) { this.#renderCoarse(ctx, cx, cy); return; }
    const k = 1 - this.life / this.max;
    const f = Math.max(0, Math.min(NOVA_FRAMES - 1, Math.floor(k * NOVA_FRAMES)));
    const img = novaFrame(this.radius, this.colors, this.tongues, this.seed, f, q);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(img.canvas, sn(this.x - cx - img.w / 2, q), sn(this.y - cy - img.h / 2, q), img.w, img.h);
    ctx.globalCompositeOperation = 'source-over';
  }
  // „Niedrig“: der Ring vor dem Feinraster, unverändert
  #renderCoarse(ctx, cx, cy) {
    const k = 1 - this.life / this.max;
    const R = 3 + this.radius * (1 - Math.pow(1 - Math.min(1, k * 1.6), 3));
    const band = Math.max(2, this.radius * 0.35 * (1 - k));
    const x0 = this.x - cx, y0 = this.y - cy;
    const fade = 1 - k * k;
    ctx.globalCompositeOperation = 'lighter';
    const r0 = Math.max(0, R - band), n = Math.ceil(R + 8);
    for (let dy = -Math.ceil(n * 0.5); dy <= Math.ceil(n * 0.5); dy++) {
      for (let dx = -n; dx <= n; dx++) {
        const d = Math.hypot(dx, dy * 2);
        const a = Math.atan2(dy * 2, dx);
        const tongue = Math.max(0, Math.sin(a * this.tongues * 0.5 + this.seedCoarse + k * 6)) * 4 * (1 - k);
        if (d > R + tongue || d < r0) continue;
        const t = (d - r0) / Math.max(1, R + tongue - r0);
        const idx = t > 0.92 ? 3 : t > 0.7 ? 2 : t > 0.35 ? 1 : 0;
        const alpha = fade * (idx === 0 ? 0.35 : idx === 1 ? 0.6 : 0.85);
        ctx.fillStyle = rgbStr(this.cols[idx], alpha);
        ctx.fillRect(Math.round(x0 + dx), Math.round(y0 + dy), 1, 1);
      }
    }
    if (k < 0.5) {
      ctx.fillStyle = rgbStr(this.cols[2], (0.5 - k) * 0.6);
      for (let dy = -3; dy <= 3; dy++) { const w = Math.round(Math.sqrt(9 - dy * dy) * 2); ctx.fillRect(Math.round(x0 - w), Math.round(y0 + dy), w * 2 + 1, 1); }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

// Wirbel um den Helden (Wirbelsturm): drei Sichelarme am Boden. Kopf 2 Feinpixel stark und weiß, dann Farbe,
// der Schweif eine Stufe dunkler und dünner.
export class SpinVortex extends Entity {
  constructor(follow, { radius = 26, color = '#ffc050', life = 0.5 } = {}) {
    super(follow.x, follow.y);
    this.follow = follow; this.radius = radius; this.rgb = hexRgb(color); this.life = this.max = life;
    this.cols = ['#ffffff', rgbStr(this.rgb), rgbStr(dark(this.rgb, 0.6))];
  }
  update(dt) { this.life -= dt; this.x = this.follow.x; this.y = this.follow.y; if (this.life <= 0) this.removed = true; }
  renderEmissive(ctx, cx, cy) {
    if (fineRes() === 1) { COARSE.SpinVortex.call(this, ctx, cx, cy); return; }
    const q = fineRes(), P = 1 / q;
    const k = 1 - this.life / this.max, fade = Math.min(1, (1 - k) * 2.5);
    const X = this.x - cx, Y = this.y - cy - 2;
    const n = 26 * q;
    ctx.globalCompositeOperation = 'lighter';
    for (let arm = 0; arm < 3; arm++) {
      const base = k * 22 + arm * (Math.PI * 2 / 3);
      for (let i = 0; i < n; i++) {
        const t = i / n, a = base - t * 2.2;
        const al = A3((1 - t) * fade * 1.2);
        if (!al) break;
        const r = this.radius * (0.55 + 0.45 * (1 - t)), ca = Math.cos(a), sa = Math.sin(a);
        ctx.globalAlpha = al;
        ctx.fillStyle = this.cols[t < 0.12 ? 0 : t < 0.5 ? 1 : 2];
        // Feinraster: jeder Bahnpunkt mindestens 1 Weltpixel breit (dünner zerfasert der Bogen auf dem Handy)
        const S = q > 1 ? 1 : P;
        ctx.fillRect(sn(X + ca * r - S / 2, q), sn(Y + sa * r * 0.5 - S / 2, q), S, S);
        if (t < 0.5) ctx.fillRect(sn(X + ca * (r - 1) - S / 2, q), sn(Y + sa * (r - 1) * 0.5 - S / 2, q), S, S);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

// Riss / Portalblitz (Blinzeln, Schattenschritt): senkrechter Spalt, der aufreißt und sich schließt. Feinraster:
// weißer Kern (1 Feinpixel, offen 2), helle Ränder, Innenfläche gedithert statt durchscheinend, Splitter am Rand.
export class RiftFlash extends Entity {
  constructor(x, y, { color = '#b884ff', life = 0.35, height = 22 } = {}) {
    super(x, y);
    this.rgb = hexRgb(color); this.life = this.max = life; this.height = height;
    this.cols = [rgbStr(hot(this.rgb, 0.45)), rgbStr(this.rgb), rgbStr(dark(this.rgb, 0.55))];
  }
  update(dt) { this.life -= dt; if (this.life <= 0) this.removed = true; }
  renderEmissive(ctx, cx, cy) {
    if (fineRes() === 1) { COARSE.RiftFlash.call(this, ctx, cx, cy); return; }
    const q = fineRes();
    // Feinraster: Riss in die Leere – Kern fast schwarz-violett, darum gesättigtes Violett in harten Stufen, außen
    // ein heller Saum (links heller: Licht von oben links), Splitter nach außen; am Fuß eine Leerenpfütze.
    // Deckend (source-over), damit der dunkle Kern auf jedem Boden steht.
    const P = 1 / q, k = 1 - this.life / this.max;
    const open = k < 0.25 ? k / 0.25 : 1 - (k - 0.25) / 0.75;
    if (open <= 0.12) return;
    const X = sn(this.x - cx, q), Y = sn(this.y - cy, q);
    voidPool(ctx, this.x - cx, this.y - cy, 10, Math.min(0.69, k * 1.2), q);
    const w = Math.max(1, Math.round(4 * open * q)), rows = Math.round(this.height * (0.6 + 0.4 * open) * q);
    const rim = this.cols[0], sat = this.cols[1], deep = VOID[3], core = VOID[4];
    for (let i = 0; i < rows; i++) {
      const t = i / rows, ww = Math.max(1, Math.round(w * Math.sin(t * Math.PI))), y = Y - (i + 2) * P;
      const zig = ((i * 5) % 7 < 2 ? 1 : 0) * P;   // ausgefranster Rand, je Zeile fest (kein Flimmern)
      ctx.fillStyle = sat; ctx.fillRect(X - (ww + 1) * P - zig, y, (2 * ww + 3) * P + zig, P);
      if (ww > 1) { ctx.fillStyle = deep; ctx.fillRect(X - (ww - 1) * P, y, (2 * ww - 1) * P, P); }
      if (ww > 2) { ctx.fillStyle = core; ctx.fillRect(X - (ww - 2) * P, y, (2 * ww - 3) * P, P); }
      ctx.fillStyle = rim; ctx.fillRect(X - (ww + 1) * P - zig, y, P, P);
      if (ww > 2 && (i * 7) % 11 === 0) { ctx.fillStyle = rim; ctx.fillRect(X + (i & 2 ? ww + 2 : -ww - 3) * P, y, P, P); }
    }
    // Spitzen oben und unten weiß
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(X, Y - (rows + 2) * P, P, 2 * P);
  }

}

// Aufladen (Durchschuss, Zauber): Lichtpunkte ziehen spiralförmig zur Hand. Feinraster: jeder Punkt mit Schweif,
// die Ladung in der Hand wächst als Raute mit weißem Kern.
export class ChargeGlow extends Entity {
  constructor(follow, { color = '#a8ff90', life = 0.3, offY = -12, reach = 14 } = {}) {
    super(follow.x, follow.y);
    this.follow = follow; this.rgb = hexRgb(color); this.life = this.max = life; this.offY = offY; this.reach = reach + 4;
    this.cols = ['#ffffff', rgbStr(hot(this.rgb, 0.3)), rgbStr(this.rgb), rgbStr(dark(this.rgb, 0.6))];
  }
  update(dt) { this.life -= dt; this.x = this.follow.x + (this.follow.facing ?? 1) * 7; this.y = this.follow.y + this.offY; if (this.life <= 0) this.removed = true; }
  renderEmissive(ctx, cx, cy) {
    if (fineRes() === 1) { COARSE.ChargeGlow.call(this, ctx, cx, cy); return; }
    const q = fineRes(), P = 1 / q;
    const k = 1 - this.life / this.max;
    const X = sn(this.x - cx, q), Y = sn(this.y - cy, q);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 16; i++) {
      const ph = (i / 16 + k * 1.5) % 1;
      const r = this.reach * (1 - ph), a = i * 2.4 + ph * 4;
      ctx.globalAlpha = A3(0.3 + ph * 0.8);
      ctx.fillStyle = this.cols[ph > 0.6 ? 1 : 2];
      ctx.fillRect(sn(X + Math.cos(a) * r, q), sn(Y + Math.sin(a) * r * 0.7, q), P, P);
      ctx.fillStyle = this.cols[3];
      if (ph > 0.3) ctx.fillRect(sn(X + Math.cos(a - 0.3) * (r + 1.5), q), sn(Y + Math.sin(a - 0.3) * (r + 1.5) * 0.7, q), P, P);
    }
    // Ladung: Raute, wächst in Feinpixeln
    const c = Math.round((1 + k * 3) * q);
    ctx.globalAlpha = 0.66; ctx.fillStyle = this.cols[2];
    for (let j = -c; j <= c; j++) { const ww = c - Math.abs(j); ctx.fillRect(X - ww * P, Y + (j * P) / 2, (2 * ww + 1) * P, P); }
    ctx.globalAlpha = 1; ctx.fillStyle = this.cols[1];
    ctx.fillRect(X - P, Y, 3 * P, P); ctx.fillRect(X, Y - P, P, 3 * P);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(X, Y, P, P);
    ctx.globalCompositeOperation = 'source-over';
  }
}

// Seelenlicht beim Tod eines Gegners: kleines Irrlicht steigt schlingernd auf. Feinraster: Flämmchen mit weißem Kern
// und Farbsaum, darunter ein geschwungener Feinpixel-Schweif.
export class SoulWisp extends Entity {
  constructor(x, y, { color = '#c6a8ff', life = 1.1 } = {}) {
    super(x, y);
    this.rgb = hexRgb(color); this.life = this.max = life; this.ph = Math.random() * 6;
    this.cols = [rgbStr(hot(this.rgb, 0.5)), rgbStr(this.rgb), rgbStr(dark(this.rgb, 0.6))];
  }
  update(dt) { this.life -= dt; this.y -= dt * 22; if (this.life <= 0) this.removed = true; }
  renderEmissive(ctx, cx, cy) {
    if (fineRes() === 1) { COARSE.SoulWisp.call(this, ctx, cx, cy); return; }
    const q = fineRes(), P = 1 / q;
    const k = 1 - this.life / this.max, a = Math.min(1, (1 - k) * 1.6) * Math.min(1, k * 8);
    const al = A3(a);
    if (!al) return;
    const X = sn(this.x - cx + Math.sin(this.ph + k * 9) * 3, q), Y = sn(this.y - cy, q);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = al * 0.66;
    ctx.fillStyle = this.cols[2];
    ctx.fillRect(X - 2, Y - 1, 5, 3); ctx.fillRect(X - 1, Y - 2, 3, 5);
    ctx.globalAlpha = al;
    if (q > 1) {
      ctx.fillStyle = this.cols[1]; ctx.fillRect(X - 1, Y - P, 2 + P, 2 * P + P); ctx.fillRect(X - P, Y - 1 - P, 2 * P + P, 3);
      ctx.fillStyle = this.cols[0]; ctx.fillRect(X - P, Y - P, 2 * P, 2 * P);
    }
    for (let i = 1; i < 6 * q; i++) {
      const j = i / q;
      ctx.globalAlpha = A3(a * (1 - j / 6) * 0.9);
      ctx.fillStyle = this.cols[j < 2 ? 1 : 2];
      ctx.fillRect(sn(X - Math.sin(this.ph + k * 9 - j * 0.5) * 2, q), Y + j + 1, P, P);
    }
    ctx.globalAlpha = al; ctx.fillStyle = '#ffffff'; ctx.fillRect(X, Y, P, P);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

// ---------------------------------------------------------------------------
// Belohnungsrunde (10.10.): Effekte, die Treffer, Kills, Beute und Aufstiege
// belohnend machen. Alle additiv im Emissive-Pass, pixelgenau, ganzzahlig skaliert.

// Schadenszahl: springt im Bogen zur Seite, „ploppt“ beim Erscheinen. Krit: Ziffern
// 2× groß, nur 3 Bilder lang weiß, dann gold mit kurzem Zittern; 1-px-Kontur dunkelbraun.
// kind: 'normal' | 'crit' | 'kill'. side/lane (Feedback): Richtung und Abstand, damit sich
// mehrere Zahlen am selben Ziel nicht senkrecht stapeln. add(n) fasst weitere Treffer zusammen.
const NUM_EDGE = '#2a1206';
const EDGE8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
export class DamageNumber extends Entity {
  constructor(x, y, value, { font, kind = 'normal', color, side = 1, lane = 0 } = {}) {
    super(x, y);
    this.value = value; this.text = String(value); this.font = font; this.kind = kind;
    this.crit = kind === 'crit';
    this.color = color ?? (this.crit ? '#ffd23a' : kind === 'kill' ? '#ffc890' : '#ffffff');
    this.max = this.crit ? 0.95 : 0.8;
    this.vx = side * (20 + lane * 16 + Math.random() * 10);
    this.vy = -72 + lane * 8;
    this.age = 0;   // seit dem Erscheinen (Lebensdauer)
    this.pop = 0;   // seit dem letzten Treffer (Aufploppen)
  }
  get life() { return this.max - this.age; }
  // weiterer Treffer am selben Ziel: Zahl wächst, ploppt kurz auf, lebt etwas länger (gedeckelt)
  add(n, crit = false) {
    this.value += n; this.text = String(this.value); this.pop = 0.02;
    if (crit && !this.crit) { this.crit = true; this.color = '#ffd23a'; }
    this.max = Math.min(this.crit ? 1.2 : 1, Math.max(this.max, this.age + 0.5));
  }
  // läuft in Echtzeit: Hitstop und Zeitlupe würden die Zahlen sonst sekundenlang stehen lassen
  update() {
    const now = performance.now(), dt = Math.min(0.25, (now - (this.last ?? now)) / 1000);
    this.last = now;
    this.age += dt; this.pop += dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.vy += 150 * dt;                 // Bogen: steigt, wird langsamer, sinkt leicht
    this.vx *= Math.exp(-dt * 2.5);
    if (this.age >= this.max) this.removed = true;
  }
  renderEmissive(ctx, cx, cy) {
    let scale = this.crit ? 2 : 1, color = this.color, jx = 0, jy = 0;
    if (this.crit) {
      if (this.age < 0.05) color = '#ffffff';
      else if (this.pop < 0.14) { jx = Math.round((Math.random() - 0.5) * 2); jy = Math.round((Math.random() - 0.5) * 2); }
    } else if (this.pop < 0.05) scale = 2;
    ctx.globalAlpha = Math.max(0, Math.min(1, this.life / 0.3));
    const x = Math.round(this.x - cx) + jx, y = Math.round(this.y - cy) + jy;
    // Kontur 1 px (unabhängig von der Schriftgröße), dann die Ziffern
    for (const [ox, oy] of EDGE8) this.font.draw(ctx, this.text, x + ox, y + oy, { color: NUM_EDGE, scale, align: 'center' });
    this.font.draw(ctx, this.text, x, y, { color, scale, align: 'center' });
    ctx.globalAlpha = 1;
  }
}

// Seelenfunke (EP): springt aus dem besiegten Gegner und fliegt nach kurzem Zögern
// beschleunigt in den Helden (gesamt etwa 0,4–0,6 s). Glutfarben, 2×2 Weltpixel: im Feinraster
// abgerundet mit heißem Kern und Glanzpunkt oben links, Schweif in Feinpixeln.
// onAbsorb() beim Ankommen (Klang, Funken). XpOrb.live zählt aktive Funken (Deckel im Feedback).
export class XpOrb extends Entity {
  static live = 0;
  constructor(x, y, target, { delay = 0.1, onAbsorb = null } = {}) {
    super(x, y);
    this.target = target; this.onAbsorb = onAbsorb;
    const a = Math.random() * Math.PI * 2, s = 24 + Math.random() * 30;
    this.vx = Math.cos(a) * s; this.vy = Math.sin(a) * s * 0.6;
    this.z = 4; this.vz = 40 + Math.random() * 30;
    this.t = 0; this.delay = delay + Math.random() * 0.06; this.speed = 60;
    this.trail = [];
    this.ph = Math.random() * 6;
    XpOrb.live++;
  }
  #end() { if (!this.removed) { this.removed = true; XpOrb.live--; } }
  update(dt) {
    this.t += dt;
    const h = this.target;
    if (!h || h.removed || h.dead || this.t > 1.5) { this.#end(); return; }
    this.trail.unshift([this.x, this.y - this.z]); if (this.trail.length > 3) this.trail.pop();
    if (this.t < this.delay) {
      this.vz -= 220 * dt; this.z = Math.max(0, this.z + this.vz * dt);
      this.x += this.vx * dt; this.y += this.vy * dt;
      return;
    }
    const tx = h.x, ty = h.y - (h.bodyHeight ?? 16) * 0.55;
    const dx = tx - this.x, dy = ty - (this.y - this.z), d = Math.hypot(dx, dy);
    this.speed = Math.min(560, this.speed + 1700 * dt);
    if (d < 5 + this.speed * dt) { this.#end(); this.onAbsorb?.(this); return; }
    const k = Math.min(1, dt * 14);
    this.vx += ((dx / d) * this.speed - this.vx) * k;
    this.vy += ((dy / d) * this.speed - this.vy) * k;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.z = Math.max(0, this.z - dt * 40);
  }
  renderEmissive(ctx, cx, cy) {
    if (fineRes() === 1) { COARSE.XpOrb.call(this, ctx, cx, cy); return; }
    const q = fineRes(), P = 1 / q;
    const x = sn(this.x - cx, q), y = sn(this.y - this.z - cy, q);
    const hotNow = Math.sin(this.t * 22 + this.ph) > 0;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i < this.trail.length; i++) {
      const [tx, ty] = this.trail[i];
      ctx.fillStyle = i === 1 ? 'rgba(240,122,28,0.66)' : 'rgba(200,66,12,0.33)';
      ctx.fillRect(sn(tx - cx + 0.5, q), sn(ty - cy + 0.5, q), q > 1 && i === 1 ? 2 * P : 1, q > 1 && i === 1 ? 2 * P : 1);
    }
    ctx.fillStyle = 'rgba(240,122,28,0.66)';
    ctx.fillRect(x - 1, y, 1, 2); ctx.fillRect(x + 2, y, 1, 2); ctx.fillRect(x, y - 1, 2, 1); ctx.fillRect(x, y + 2, 2, 1);
    ctx.fillStyle = hotNow ? '#fff0b0' : '#ffb640';
    ctx.fillRect(x, y, 2, 2);
    if (q > 1) {
      ctx.fillStyle = '#f07a1c'; ctx.fillRect(x + 2 - P, y + 2 - P, P, P);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, P, P);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

// Örtlicher Pixel-Blitz (Stufenaufstieg, legendäre Beute): vierzackiger Stern, der in
// wenigen festen Stufen aufgeht und verglüht – statt eines Schleiers über dem ganzen Bild.
// Feinraster: Strahlen innen 1 Weltpixel stark, außen 1 Feinpixel; Diagonalen in Feinpixeln.
export class PixelFlash extends Entity {
  constructor(x, y, { color = '#ffd66a', size = 22, life = 0.24, follow = null, offY = 0 } = {}) {
    super(x, y);
    this.rgb = hexRgb(color); this.size = size; this.life = this.max = life; this.follow = follow; this.offY = offY;
  }
  update(dt) {
    this.life -= dt;
    if (this.follow) { this.x = this.follow.x; this.y = this.follow.y; }
    if (this.life <= 0) this.removed = true;
  }
  renderEmissive(ctx, cx, cy) {
    if (fineRes() === 1) { COARSE.PixelFlash.call(this, ctx, cx, cy); return; }
    const q = fineRes(), P = 1 / q;
    const k = 1 - this.life / this.max;
    const step = Math.min(3, Math.floor(k * 4));               // 4 feste Stufen
    const len = Math.round(this.size * [0.45, 1, 0.8, 0.5][step]);
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy + this.offY);
    const col = step === 0 ? '#ffffff' : rgbStr(this.rgb, [1, 1, 0.66, 0.33][step]);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = col;
    if (q > 1) {
      const inner = Math.round(len * 0.4);
      ctx.fillRect(x - len, y + P / 2, len * 2 + 1, P); ctx.fillRect(x + P / 2, y - len, P, len * 2 + 1);   // dünn bis in die Spitzen
      ctx.fillRect(x - inner, y, inner * 2 + 1, 1); ctx.fillRect(x, y - inner, 1, inner * 2 + 1);            // innen voll
      const d = Math.round(len * 0.45 * q);
      for (let i = 1; i <= d; i++) { const o = i * P; ctx.fillRect(x + 0.5 + o, y + 0.5 + o, P, P); ctx.fillRect(x + 0.5 - o, y + 0.5 + o, P, P); ctx.fillRect(x + 0.5 + o, y + 0.5 - o, P, P); ctx.fillRect(x + 0.5 - o, y + 0.5 - o, P, P); }
    } else {
      ctx.fillRect(x - len, y, len * 2 + 1, 1);
      ctx.fillRect(x, y - len, 1, len * 2 + 1);
      const d = Math.round(len * 0.45);
      for (let i = 1; i <= d; i++) { ctx.fillRect(x + i, y + i, 1, 1); ctx.fillRect(x - i, y + i, 1, 1); ctx.fillRect(x + i, y - i, 1, 1); ctx.fillRect(x - i, y - i, 1, 1); }
    }
    const c = step < 2 ? 2 : 1;                                  // heller Kern
    ctx.fillStyle = step < 2 ? '#ffffff' : rgbStr(this.rgb, 0.66);
    ctx.fillRect(x - c, y - c, c * 2 + 1, c * 2 + 1);
    if (q > 1 && step < 2) { ctx.fillStyle = rgbStr(this.rgb); ctx.fillRect(x - c - P, y, P, 1); ctx.fillRect(x + c + 1, y, P, 1); ctx.fillRect(x, y - c - P, 1, P); ctx.fillRect(x, y + c + 1, 1, P); }
    ctx.globalCompositeOperation = 'source-over';
  }
}

// Stufenaufstieg: Runenkreis am Boden dehnt sich und dreht, Lichtstrahlen steigen
// rundherum auf, Funken wirbeln nach oben. Helligkeit in festen Stufen (Pixel-Look).
const q3 = (v) => Math.ceil(Math.max(0, v) * 3) / 3;
export class LevelUpBurst extends Entity {
  constructor(hero, { color = '#ffd66a', life = 1.8 } = {}) {
    super(hero.x, hero.y);
    this.hero = hero; this.rgb = hexRgb(color); this.life = this.max = life;
    this.rays = Array.from({ length: 10 }, (_, i) => ({ a: (i / 10) * Math.PI * 2 + Math.random() * 0.3, h: 30 + Math.random() * 40, d: Math.random() * 0.35 }));
  }
  update(dt) {
    this.life -= dt;
    this.x = this.hero.x; this.y = this.hero.y;
    if (this.life <= 0) this.removed = true;
  }
  renderEmissive(ctx, cx, cy) {
    if (fineRes() === 1) { COARSE.LevelUpBurst.call(this, ctx, cx, cy); return; }
    const q = fineRes(), P = 1 / q;
    const k = 1 - this.life / this.max;
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    const fade = q3(Math.min(1, (this.life / this.max) * 3));
    const open = 1 - Math.pow(1 - Math.min(1, k * 3), 3);
    ctx.globalCompositeOperation = 'lighter';
    const r = 8 + open * 22, spin = k * 2.4;
    // zwei Ringe: außen voll in Feinpixeln, innen gestrichelt und gegenläufig
    ctx.fillStyle = rgbStr(this.rgb, 0.66 * fade);
    ring(ctx, x, y, ellipsePts(r, r * 0.45, q), P);
    ctx.fillStyle = rgbStr(this.rgb, 0.33 * fade + 0.33);
    ring(ctx, x, y, ellipsePts(r * 0.72, r * 0.72 * 0.45, q), P, (u) => ((u + spin * 0.1) * 24) % 1 < 0.5);
    for (let i = 0; i < 8; i++) {
      const a = spin + (i / 8) * Math.PI * 2, rr = r * 0.86;
      const px = sn(x + Math.cos(a) * rr, q), py = sn(y + Math.sin(a) * rr * 0.45, q);
      ctx.fillStyle = `rgba(255,240,176,${fade})`;
      ctx.fillRect(px, py - 1, P, 2 + P); if (i % 2) ctx.fillRect(px - 1, py, 2 + P, P);
      if (q > 1) { ctx.fillStyle = '#ffffff'; ctx.fillRect(px, py, P, P); }
    }
    // aufsteigende Lichtstrahlen am Kreisrand, in drei Helligkeitsstufen, Kopf weiß
    for (const ray of this.rays) {
      const t = Math.max(0, Math.min(1, (k - ray.d) * 2.2));
      if (t <= 0 || t >= 1) continue;
      const px = sn(x + Math.cos(ray.a + spin * 0.5) * r * 0.9, q), py = sn(y + Math.sin(ray.a + spin * 0.5) * r * 0.4, q);
      const hgt = Math.round(ray.h * Math.sin(t * Math.PI));
      for (let j = 0; j < hgt; j++) {
        const f = q3(1 - j / hgt);
        ctx.fillStyle = j < 2 ? `rgba(255,240,176,${0.66 + 0.33 * f})` : rgbStr(this.rgb, 0.66 * f);
        ctx.fillRect(px, py - j, P, 1);
        if (q > 1 && j < hgt * 0.4) ctx.fillRect(px + P, py - j, P, 1);
      }
      if (q > 1) { ctx.fillStyle = '#ffffff'; ctx.fillRect(px, py - hgt, 2 * P, P); }
    }
    for (let i = 0; i < 14; i++) {
      const ph = (k * 1.4 + i / 14) % 1;
      const a = i * 2.4 + ph * 7, rr = (1 - ph) * r * 0.8;
      ctx.fillStyle = rgbStr(this.rgb, q3(1 - ph) * fade);
      const sx = sn(x + Math.cos(a) * rr, q), sy = sn(y - 4 - ph * 46 + Math.sin(a) * rr * 0.4, q);
      ctx.fillRect(sx, sy, q > 1 && ph < 0.5 ? 2 * P : 1, q > 1 && ph < 0.5 ? 2 * P : 1);
      if (q > 1 && ph < 0.5) { ctx.fillStyle = '#fff0b0'; ctx.fillRect(sx, sy, P, P); }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

// Beute-Strahl: Für seltene, epische und legendäre Beute schlägt eine Lichtsäule in
// Seltenheitsfarbe vom Himmel ein und folgt dem Beutestück (über dropId gesucht, C spawnt
// es nach dem Ereignis). Pixel-Säule: Kern, Seltenheitsfarbe, geditherter Rand, nach oben
// in festen Stufen ausblendend; am Boden kreisen Pixelfunken. onLand() beim Einschlag.
// Staffel (Feinraster): selten = schlichte Säule; episch = zusätzlich zwei Funkenbänder, die sich um die Säule
// winden; legendär = breitere Säule mit Flammenzungen am Fuß, aufsteigenden Runenringen und doppeltem Bodenring –
// legendär soll sich auf den ersten Blick von episch abheben.
const BEAM_BANDS = [1, 1, 0.66, 0.66, 0.66, 0.33, 0.33, 0.33];
export class LootBeam extends Entity {
  constructor(x, y, { dropId, rgb = [255, 214, 106], tier = 1, onLand = null } = {}) {
    super(x, y);
    this.dropId = dropId; this.rgb = rgb; this.tier = tier; this.onLand = onLand;
    this.drop = null; this.t = 0; this.landed = false;
    this.fall = 0.14;                         // Zeit, bis die Säule den Boden erreicht
    this.max = 1.1 + tier * 0.55;
    this.motes = Array.from({ length: 4 + tier * 3 }, () => ({ o: Math.random(), s: 0.5 + Math.random(), dx: Math.floor(Math.random() * 3) - 1 }));
    this.cols = { core: 'rgba(255,248,220,A)', mid: `rgba(${rgb.join(',')},A)`, deep: `rgba(${dark(rgb, 0.6).join(',')},A)`, hot: `rgba(${hot(rgb, 0.5).join(',')},A)` };
  }
  update(dt, world) {
    this.t += dt;
    if (!this.drop && this.dropId) this.drop = world?.entities?.find((e) => e.drop?.dropId === this.dropId) ?? null;
    if (this.drop) {
      if (this.drop.removed) this.t = Math.max(this.t, this.max - 0.2);
      this.x = this.drop.x; this.y = this.drop.y;
    }
    if (!this.landed && this.t >= this.fall) { this.landed = true; this.onLand?.(this); }
    if (this.t >= this.max) this.removed = true;
  }
  #c(name, a) { return this.cols[name].replace('A', a.toFixed(2)); }
  renderEmissive(ctx, cx, cy) {
    if (fineRes() === 1) { COARSE.LootBeam.call(this, ctx, cx, cy); return; }
    const q = fineRes(), P = 1 / q, legend = this.tier >= 3;
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    const fallK = Math.min(1, this.t / this.fall);
    const yBottom = Math.round(-10 + (y + 10) * fallK);
    const after = Math.max(0, this.t - this.fall) / (this.max - this.fall);
    const fade = after < 0.6 ? 1 : after < 0.8 ? 0.66 : 0.33;      // Ausblenden in Stufen
    // Breite in Stufen: Aufblitzen beim Einschlag, dann ruhige Säule, zum Ende schmaler
    const flare = this.landed && after < 0.08 ? 1 : 0;
    const shrink = after > 0.8 ? 1 : 0;
    const core = Math.max(0, this.tier - 1 + flare - shrink);     // halbe Breiten
    const mid = core + 1 + this.tier + flare - shrink + (legend ? 1 : 0);
    const outer = mid + 2;
    ctx.globalCompositeOperation = 'lighter';
    const band = 22;
    for (let j = 0; yBottom - j > 0; j += 2) {
      const bi = Math.floor(j / band);
      if (bi >= BEAM_BANDS.length) break;
      const a = BEAM_BANDS[bi] * fade, row = yBottom - j - 2;
      ctx.fillStyle = this.#c('mid', a * 0.66);
      ctx.fillRect(x - mid, row, mid * 2 + 1, 2);
      ctx.fillStyle = this.#c('core', a);
      ctx.fillRect(x - core, row, core * 2 + 1, 2);
      if (q > 1) {
        // Feinraster: heller Saum zwischen Kern und Farbe, dunkle Kante außen an der Farbe
        ctx.fillStyle = this.#c('hot', a); ctx.fillRect(x - core - P, row, P, 2); ctx.fillRect(x + core + 1, row, P, 2);
        ctx.fillStyle = this.#c('deep', a); ctx.fillRect(x - mid, row, P, 2); ctx.fillRect(x + mid + 1 - P, row, P, 2);
      }
      // geditherter Rand: jedes zweite Pixel, versetzt je Zeile (im Feinraster je Feinzeile)
      ctx.fillStyle = this.#c('mid', a * 0.33);
      for (let i = mid + 1; i <= outer; i++) {
        if (q > 1) {
          for (let s = 0; s < 4; s++) { const o = ((i + s + (j >> 1)) & 1) * P; ctx.fillRect(x - i + o, row + s * P, P, P); ctx.fillRect(x + i + P - o, row + s * P, P, P); }
        } else {
          const o = ((i + (j >> 1)) & 1);
          ctx.fillRect(x - i, row + o, 1, 1); ctx.fillRect(x + i, row + 1 - o, 1, 1);
        }
      }
    }
    if (this.landed) {
      // Funken steigen in der Säule auf
      ctx.fillStyle = this.#c('core', fade);
      for (const m of this.motes) {
        const p = (m.o + this.t * m.s) % 1;
        ctx.fillRect(x + m.dx * (core + 1), sn(y - 4 - p * 70, q), q > 1 ? P : 1, q > 1 ? 2 * P : 1);
      }
      // Episch: zwei Funkenbänder winden sich um die Säule (vorne hell, hinten dunkel)
      if (this.tier === 2 && q > 1) {
        for (let s = 0; s < 2; s++) for (let j = 0; j < 46; j += P) {
          const a = this.t * 5 + j * 0.22 + s * Math.PI, front = Math.sin(a) > 0;
          if (((j * q) | 0) % 3 === 2) continue;
          ctx.fillStyle = front ? this.#c('hot', fade) : this.#c('deep', fade * 0.66);
          ctx.fillRect(sn(x + 0.5 + Math.cos(a) * (mid + 1.5), q), sn(y - 3 - j, q), P, P);
        }
      }
      // Legendär: Runenringe steigen auf, Flammenzungen am Fuß
      if (legend) {
        for (let s = 0; s < 3; s++) {
          const p = (this.t * 0.7 + s / 3) % 1, ry = y - 4 - p * 64, rr = mid + 4 - p * 2;
          ctx.fillStyle = this.#c(p < 0.35 ? 'core' : p < 0.7 ? 'hot' : 'mid', fade * (p < 0.7 ? 1 : 0.66));
          ring(ctx, x + 0.5, sn(ry, q), ellipsePts(rr, 1.5, q), P, (u) => u < 0.5 || ((u * 10) % 1) < 0.5);
        }
        if (q > 1) for (let i = -mid - 2; i <= mid + 2; i++) {
          const h = Math.max(0, Math.sin(this.t * 14 + i * 1.7) * 2.5 + 2.5 - Math.abs(i) * 0.25);
          for (let j = 0; j < h * q; j++) {
            ctx.fillStyle = this.#c(j < h * q * 0.4 ? 'hot' : 'mid', fade);
            ctx.fillRect(x + i + (i & 1) * P, y - j * P, P, P);
          }
        }
      }
      // Bodenring aus kreisenden Pixelfunken, beim Einschlag kurz weiter
      const rr = 6 + this.tier * 3 + (after < 0.15 ? Math.round((0.15 - after) * 60) : 0);
      const n = (10 + this.tier * 4) * (q > 1 ? 2 : 1);
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + this.t * 2.2;
        const on = (i + Math.floor(this.t * 12)) % 3 !== 0;
        if (!on) continue;
        ctx.fillStyle = i % 2 ? this.#c('core', fade) : this.#c('mid', fade);
        ctx.fillRect(sn(x + Math.cos(ang) * rr, q), sn(y + Math.sin(ang) * rr * 0.4, q), q > 1 ? P : 1, q > 1 ? P : 1);
      }
      if (legend) {
        ctx.fillStyle = this.#c('deep', fade);
        ring(ctx, x + 0.5, y, ellipsePts(rr + 3, (rr + 3) * 0.4, q), P, (u) => ((u * 16 - this.t * 2) % 1 + 1) % 1 < 0.6);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

// Goldfontäne (Quest abgeschlossen, große Goldfunde): Münzen springen im Bogen
// aus dem Boden und blitzen beim Drehen auf. Feinraster: Münze mit Rand, Prägung und Glanzpunkt.
export class CoinFountain extends Entity {
  constructor(x, y, { count = 14, life = 1.1, spread = 1 } = {}) {
    super(x, y);
    this.life = this.max = life;
    this.coins = Array.from({ length: count }, () => {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6 * spread, s = 50 + Math.random() * 60;
      return { x: 0, y: 0, z: 0, vx: Math.cos(a) * s * 0.7, vy: (Math.random() - 0.5) * 12, vz: -Math.sin(a) * s + 30, ph: Math.random() * 6, d: Math.random() * 0.2 };
    });
  }
  update(dt) {
    this.life -= dt;
    const age = this.max - this.life;
    for (const c of this.coins) {
      if (age < c.d) continue;
      c.vz -= 260 * dt; c.z += c.vz * dt; c.x += c.vx * dt; c.y += c.vy * dt;
      if (c.z < 0) { c.z = 0; c.vz = Math.abs(c.vz) > 30 ? -c.vz * 0.35 : 0; c.vx *= 0.6; }
    }
    if (this.life <= 0) this.removed = true;
  }
  renderEmissive(ctx, cx, cy) {
    if (fineRes() === 1) { COARSE.CoinFountain.call(this, ctx, cx, cy); return; }
    const q = fineRes(), P = 1 / q;
    const age = this.max - this.life;
    ctx.globalAlpha = A3(Math.min(1, (this.life / this.max) * 3));
    for (const c of this.coins) {
      if (age < c.d) continue;
      const x = Math.round(this.x + c.x - cx), y = Math.round(this.y + c.y - c.z - cy);
      const spin = Math.abs(Math.sin(age * 12 + c.ph));
      const w = spin > 0.66 ? 3 : spin > 0.25 ? 2 : 1;
      const x0 = x - (w >> 1);
      ctx.fillStyle = '#b8862a'; ctx.fillRect(x0, y - 1, w, 3);
      ctx.fillStyle = spin > 0.9 ? '#ffffff' : '#ffd66a'; ctx.fillRect(x0, y - 1, Math.max(1, w - 1), 2);
      if (q > 1) {
        // Ecken abrunden, Lichtkante oben links, Prägung als dunkler Feinpixel
        ctx.fillStyle = '#8a5a18';
        if (w > 1) { ctx.fillRect(x0 + w - P, y + 2 - P, P, P); ctx.fillRect(x0 + P, y + 2 - P, w - 2 * P, P); }
        ctx.fillStyle = '#fff0b0'; ctx.fillRect(x0, y - 1, P, P);
        if (w === 3 && spin <= 0.9) { ctx.fillStyle = '#b8862a'; ctx.fillRect(x0 + 1 + P, y, P, P); }
      }
    }
    ctx.globalAlpha = 1;
  }
}

// „Niedrig“ (fineRes 1): die Zeichnung vor dem Feinraster, unverändert übernommen. Jede Effektklasse ruft bei
// q = 1 ihre Fassung hier auf, damit die sparsame Qualitätsstufe genau so aussieht wie früher.
const BEAM_BANDS_COARSE = [1, 0.85, 0.7, 0.55, 0.42, 0.3, 0.2, 0.12];
const COARSE = {
  Afterimage(ctx, cx, cy) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (this.life / this.max) * 0.35;
      const img = this.flip ? this.frame.flashFlipped : this.frame.flash;
      const ax = this.flip ? this.frame.canvas.width - this.frame.ax : this.frame.ax;
      const r = this.frame.res ?? 1; // Texel je Weltpixel (§11.12)
      ctx.drawImage(img, Math.round((this.x - cx) * r - ax) / r, Math.round((this.y - cy) * r - this.frame.ay) / r, img.width / r, img.height / r);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
  },
  SpawnMarker(ctx, cx, cy) {
      const k = this.t / this.duration;
      const r = 3 + k * 9;
      const x = this.x - cx, y = this.y - cy;
      ctx.fillStyle = `rgba(160,96,240,${0.25 + k * 0.5})`;
      const n = 14;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + this.t * 5;
        ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.55), 1, 1);
      }
      ctx.fillStyle = `rgba(224,184,255,${k})`;
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  },
  RuneGlow(ctx, cx, cy) {
      const g = this.rune.glow;
      ctx.globalAlpha = 0.25 + 0.2 * Math.sin(this.t * 1.7) + this.surge;
      ctx.drawImage(g, Math.round(this.x - cx - g.width / 2), Math.round(this.y - cy - g.height / 2));
      ctx.globalAlpha = 1;
  },
  Shockwave(ctx, cx, cy) {
      const k = 1 - this.life / this.max;
      const r = 2 + this.radius * (1 - Math.pow(1 - k, 3));
      const x = this.x - cx, y = this.y - cy;
      const n = Math.max(12, Math.round(r * 3));
      ctx.fillStyle = this.color;
      ctx.globalAlpha = (1 - k) * 0.9;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const px = Math.round(x + Math.cos(a) * r), py = Math.round(y + Math.sin(a) * r * 0.5);
        ctx.fillRect(px, py, 1, 1);
        if (k < 0.5) ctx.fillRect(Math.round(x + Math.cos(a) * (r - 1)), Math.round(y + Math.sin(a) * (r - 1) * 0.5), 1, 1);
      }
      ctx.globalAlpha = 1;
  },
  LightPillar(ctx, cx, cy) {
      const k = 1 - this.life / this.max;
      const grow = Math.min(1, k * 6), fade = Math.min(1, (this.life / this.max) * 2.5);
      const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
      const w = Math.max(1, Math.round(10 * grow * fade));
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < w; i++) {
        const edge = Math.abs(i - (w - 1) / 2) / Math.max(1, w / 2);
        ctx.globalAlpha = (1 - edge) * 0.5 * fade;
        ctx.fillStyle = edge < 0.3 ? '#ffffff' : this.color;
        const hgt = Math.round(this.height * grow * (1 - edge * 0.3));
        ctx.fillRect(x - Math.floor(w / 2) + i, y - hgt, 1, hgt + 1);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
  },
  ImpactStar(ctx, cx, cy) {
      const k = 1 - this.life / this.max;
      const len = this.size * (k < 0.3 ? 0.5 + k * 1.7 : 1.1 - (k - 0.3) * 0.6);
      const x = this.x - cx, y = this.y - cy;
      ctx.globalCompositeOperation = 'lighter';
      for (let r = 0; r < this.rays; r++) {
        const a = this.angle + (r / this.rays) * Math.PI + k * 0.6;
        const l = r % 2 ? len * 0.6 : len;
        for (let i = -l; i <= l; i++) {
          const f = 1 - Math.abs(i) / (l + 1);
          ctx.fillStyle = f > 0.7 ? `rgba(255,255,255,${(1 - k) * f})` : rgbStr(this.rgb, (1 - k) * f);
          ctx.fillRect(Math.round(x + Math.cos(a) * i), Math.round(y + Math.sin(a) * i), 1, 1);
        }
      }
      const core = Math.max(1, Math.round(3 * (1 - k)));
      ctx.fillStyle = `rgba(255,255,255,${1 - k})`;
      ctx.fillRect(Math.round(x - core / 2), Math.round(y - core / 2), core, core);
      ctx.globalCompositeOperation = 'source-over';
  },
  SpinVortex(ctx, cx, cy) {
      const k = 1 - this.life / this.max, fade = Math.min(1, (1 - k) * 2.5);
      const x = this.x - cx, y = this.y - cy - 2;
      ctx.globalCompositeOperation = 'lighter';
      for (let arm = 0; arm < 3; arm++) {
        const base = k * 22 + arm * (Math.PI * 2 / 3);
        for (let i = 0; i < 26; i++) {
          const t = i / 26, a = base - t * 2.2;
          const r = this.radius * (0.55 + 0.45 * (1 - t));
          const al = (1 - t) * fade;
          ctx.fillStyle = t < 0.15 ? `rgba(255,255,255,${al})` : rgbStr(this.rgb, al * 0.8);
          ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.5), 1, 1);
          if (t < 0.5) ctx.fillRect(Math.round(x + Math.cos(a) * (r - 1)), Math.round(y + Math.sin(a) * (r - 1) * 0.5), 1, 1);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
  },
  RiftFlash(ctx, cx, cy) {
      const k = 1 - this.life / this.max;
      const open = k < 0.3 ? k / 0.3 : 1 - (k - 0.3) / 0.7;
      const w = Math.max(1, Math.round(3 * open)), hgt = Math.round(this.height * (0.6 + 0.4 * open));
      const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < hgt; i++) {
        const t = i / hgt, ww = Math.max(1, Math.round(w * Math.sin(t * Math.PI)));
        ctx.fillStyle = rgbStr(this.rgb, 0.28 * open);
        ctx.fillRect(x - ww, y - i, ww * 2 + 1, 1);
        if (ww > 1) { ctx.fillStyle = rgbStr(this.rgb, 0.6 * open); ctx.fillRect(x - ww, y - i, 1, 1); ctx.fillRect(x + ww, y - i, 1, 1); }
        ctx.fillStyle = `rgba(255,255,255,${0.9 * open})`;
        ctx.fillRect(x, y - i, 1, 1);
      }
      // Bodenellipse
      ctx.fillStyle = rgbStr(this.rgb, 0.6 * open);
      for (let a = 0; a < 20; a++) { const an = a / 20 * Math.PI * 2; ctx.fillRect(Math.round(x + Math.cos(an) * (5 + 6 * k)), Math.round(y + Math.sin(an) * (2.5 + 3 * k)), 1, 1); }
      ctx.globalCompositeOperation = 'source-over';
  },
  ChargeGlow(ctx, cx, cy) {
      const k = 1 - this.life / this.max;
      const x = this.x - cx, y = this.y - cy;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 16; i++) {
        const ph = (i / 16 + k * 1.5) % 1;
        const r = this.reach * (1 - ph), a = i * 2.4 + ph * 4;
        ctx.fillStyle = rgbStr(this.rgb, 0.3 + ph * 0.7);
        ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.7), 1, 1);
        if (ph > 0.6) ctx.fillRect(Math.round(x + Math.cos(a - 0.3) * (r + 1.5)), Math.round(y + Math.sin(a - 0.3) * (r + 1.5) * 0.7), 1, 1);
      }
      const c = Math.round(1 + k * 3);
      ctx.fillStyle = rgbStr(this.rgb, 0.5); ctx.fillRect(Math.round(x - c), Math.round(y - c / 2), c * 2 + 1, c + 1);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      ctx.globalCompositeOperation = 'source-over';
  },
  SoulWisp(ctx, cx, cy) {
      const k = 1 - this.life / this.max, a = Math.min(1, (1 - k) * 1.6) * Math.min(1, k * 8);
      const x = Math.round(this.x - cx + Math.sin(this.ph + k * 9) * 3), y = Math.round(this.y - cy);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgbStr(this.rgb, a * 0.35);
      ctx.fillRect(x - 2, y - 1, 5, 3); ctx.fillRect(x - 1, y - 2, 3, 5);
      for (let i = 1; i < 6; i++) { ctx.fillStyle = rgbStr(this.rgb, a * (1 - i / 6) * 0.6); ctx.fillRect(Math.round(x - Math.sin(this.ph + k * 9 - i * 0.5) * 2), y + i + 1, 1, 1); }
      ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fillRect(x, y, 1, 1);
      ctx.globalCompositeOperation = 'source-over';
  },
  XpOrb(ctx, cx, cy) {
      const x = Math.round(this.x - cx), y = Math.round(this.y - this.z - cy);
      const hot = Math.sin(this.t * 22 + this.ph) > 0;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 1; i < this.trail.length; i++) {
        const [tx, ty] = this.trail[i];
        ctx.fillStyle = i === 1 ? 'rgba(240,122,28,0.7)' : 'rgba(200,66,12,0.45)';
        ctx.fillRect(Math.round(tx - cx), Math.round(ty - cy), 1, 1);
      }
      ctx.fillStyle = 'rgba(240,122,28,0.55)';
      ctx.fillRect(x - 1, y, 1, 2); ctx.fillRect(x + 2, y, 1, 2); ctx.fillRect(x, y - 1, 2, 1); ctx.fillRect(x, y + 2, 2, 1);
      ctx.fillStyle = hot ? '#fff0b0' : '#ffb640';
      ctx.fillRect(x, y, 2, 2);
      ctx.globalCompositeOperation = 'source-over';
  },
  PixelFlash(ctx, cx, cy) {
      const k = 1 - this.life / this.max;
      const step = Math.min(3, Math.floor(k * 4));               // 4 feste Stufen
      const len = Math.round(this.size * [0.45, 1, 0.8, 0.5][step]);
      const x = Math.round(this.x - cx), y = Math.round(this.y - cy + this.offY);
      const col = step === 0 ? 'rgba(255,255,255,1)' : rgbStr(this.rgb, [1, 0.95, 0.7, 0.4][step]);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = col;
      ctx.fillRect(x - len, y, len * 2 + 1, 1);                   // waagrecht
      ctx.fillRect(x, y - len, 1, len * 2 + 1);                   // senkrecht
      const d = Math.round(len * 0.45);                           // kurze Diagonalen
      for (let i = 1; i <= d; i++) { ctx.fillRect(x + i, y + i, 1, 1); ctx.fillRect(x - i, y + i, 1, 1); ctx.fillRect(x + i, y - i, 1, 1); ctx.fillRect(x - i, y - i, 1, 1); }
      const c = step < 2 ? 2 : 1;                                  // heller Kern
      ctx.fillStyle = step < 2 ? '#ffffff' : rgbStr(this.rgb, 0.8);
      ctx.fillRect(x - c, y - c, c * 2 + 1, c * 2 + 1);
      ctx.globalCompositeOperation = 'source-over';
  },
  LevelUpBurst(ctx, cx, cy) {
      const k = 1 - this.life / this.max;
      const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
      const fade = q3(Math.min(1, (this.life / this.max) * 3));
      const open = 1 - Math.pow(1 - Math.min(1, k * 3), 3);
      ctx.globalCompositeOperation = 'lighter';
      const r = 8 + open * 22, spin = k * 2.4;
      for (const [rr, a0, n] of [[r, 0.8, 40], [r * 0.72, 0.5, 28]]) {
        ctx.fillStyle = rgbStr(this.rgb, a0 * fade);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          ctx.fillRect(Math.round(x + Math.cos(a) * rr), Math.round(y + Math.sin(a) * rr * 0.45), 1, 1);
        }
      }
      for (let i = 0; i < 8; i++) {
        const a = spin + (i / 8) * Math.PI * 2, rr = r * 0.86;
        const px = Math.round(x + Math.cos(a) * rr), py = Math.round(y + Math.sin(a) * rr * 0.45);
        ctx.fillStyle = `rgba(255,240,176,${0.9 * fade})`;
        ctx.fillRect(px, py - 1, 1, 3); if (i % 2) ctx.fillRect(px - 1, py, 3, 1);
      }
      // aufsteigende Lichtstrahlen am Kreisrand, in drei Helligkeitsstufen
      for (const ray of this.rays) {
        const t = Math.max(0, Math.min(1, (k - ray.d) * 2.2));
        if (t <= 0 || t >= 1) continue;
        const px = Math.round(x + Math.cos(ray.a + spin * 0.5) * r * 0.9), py = Math.round(y + Math.sin(ray.a + spin * 0.5) * r * 0.4);
        const hgt = Math.round(ray.h * Math.sin(t * Math.PI));
        for (let j = 0; j < hgt; j++) {
          const f = q3(1 - j / hgt);
          ctx.fillStyle = j < 2 ? `rgba(255,240,176,${0.8 * f})` : rgbStr(this.rgb, 0.55 * f);
          ctx.fillRect(px, py - j, 1, 1);
        }
      }
      for (let i = 0; i < 14; i++) {
        const ph = (k * 1.4 + i / 14) % 1;
        const a = i * 2.4 + ph * 7, rr = (1 - ph) * r * 0.8;
        ctx.fillStyle = rgbStr(this.rgb, q3(1 - ph) * fade);
        ctx.fillRect(Math.round(x + Math.cos(a) * rr), Math.round(y - 4 - ph * 46 + Math.sin(a) * rr * 0.4), 1, 1);
      }
      ctx.globalCompositeOperation = 'source-over';
  },
  LootBeam(ctx, cx, cy) {
      const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
      const fallK = Math.min(1, this.t / this.fall);
      const yBottom = Math.round(-10 + (y + 10) * fallK);
      const after = Math.max(0, this.t - this.fall) / (this.max - this.fall);
      const fade = after < 0.6 ? 1 : after < 0.8 ? 0.6 : 0.3;      // Ausblenden in Stufen
      // Breite in Stufen: Aufblitzen beim Einschlag, dann ruhige Säule, zum Ende schmaler
      const flare = this.landed && after < 0.08 ? 1 : 0;
      const shrink = after > 0.8 ? 1 : 0;
      const core = Math.max(0, this.tier - 1 + flare - shrink);     // halbe Breiten
      const mid = core + 1 + this.tier + flare - shrink;
      const outer = mid + 2;
      const [r, g, b] = this.rgb;
      ctx.globalCompositeOperation = 'lighter';
      const band = 22;
      for (let j = 0; yBottom - j > 0; j += 2) {
        const bi = Math.floor(j / band);
        if (bi >= BEAM_BANDS_COARSE.length) break;
        const a = BEAM_BANDS_COARSE[bi] * fade, row = yBottom - j - 2;
        ctx.fillStyle = `rgba(${r},${g},${b},${(a * 0.75).toFixed(2)})`;
        ctx.fillRect(x - mid, row, mid * 2 + 1, 2);
        ctx.fillStyle = `rgba(255,248,220,${a.toFixed(2)})`;
        ctx.fillRect(x - core, row, core * 2 + 1, 2);
        // geditherter Rand: jedes zweite Pixel, versetzt je Zeile
        ctx.fillStyle = `rgba(${r},${g},${b},${(a * 0.45).toFixed(2)})`;
        for (let i = mid + 1; i <= outer; i++) {
          const o = ((i + (j >> 1)) & 1);
          ctx.fillRect(x - i, row + o, 1, 1); ctx.fillRect(x + i, row + 1 - o, 1, 1);
        }
      }
      if (this.landed) {
        // Funken steigen in der Säule auf
        ctx.fillStyle = `rgba(255,248,220,${fade})`;
        for (const m of this.motes) {
          const p = (m.o + this.t * m.s) % 1;
          ctx.fillRect(x + m.dx * (core + 1), Math.round(y - 4 - p * 70), 1, 1);
        }
        // Bodenring aus kreisenden Pixelfunken, beim Einschlag kurz weiter
        const rr = 6 + this.tier * 3 + (after < 0.15 ? Math.round((0.15 - after) * 60) : 0);
        const n = 10 + this.tier * 4;
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2 + this.t * 2.2;
          const on = (i + Math.floor(this.t * 12)) % 3 !== 0;
          if (!on) continue;
          ctx.fillStyle = i % 2 ? `rgba(255,248,220,${fade})` : `rgba(${r},${g},${b},${fade})`;
          ctx.fillRect(Math.round(x + Math.cos(ang) * rr), Math.round(y + Math.sin(ang) * rr * 0.4), 1, 1);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
  },
  CoinFountain(ctx, cx, cy) {
      const age = this.max - this.life, fade = Math.min(1, (this.life / this.max) * 3);
      ctx.globalAlpha = fade;
      for (const c of this.coins) {
        if (age < c.d) continue;
        const x = Math.round(this.x + c.x - cx), y = Math.round(this.y + c.y - c.z - cy);
        const spin = Math.abs(Math.sin(age * 12 + c.ph));
        const w = spin > 0.66 ? 3 : spin > 0.25 ? 2 : 1;
        ctx.fillStyle = '#b8862a'; ctx.fillRect(x - (w >> 1), y - 1, w, 3);
        ctx.fillStyle = spin > 0.9 ? '#ffffff' : '#ffd66a'; ctx.fillRect(x - (w >> 1), y - 1, Math.max(1, w - 1), 2);
      }
      ctx.globalAlpha = 1;
  },
};
