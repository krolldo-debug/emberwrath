import { makeCanvas, flipCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame, SpriteFrame, Animation } from '../gfx/Sprite.js';
import { fineRes, outlinePixels, pixelsToCanvas } from '../gfx/Fine.js';
import { hash2 } from '../core/math.js';

// Ulgrim, der Hügelkönig – Boss des Heulenden Hügelgrabs (Stufe 26).
//
// Uralter Grabkönig: hager, ausgedörrte Haut über dem Schädel, Geisterflammen
// in den Augenhöhlen, langer zerzauster Bart. Verrostete Bronze-Rüstung mit
// Grünspan (Muskelpanzer, Schulterschalen, Beinschienen), zerschlissener
// Umhang, Geweihkrone auf einem Bronzereif, großes Runenschwert (Blattklinge).
//
// Rig wie Ignaroth (Zwei-Gelenk-IK für Arme und Beine, Schlüsselposen, weich
// interpoliert). Jeder Frame hat zwei Leucht-Ebenen:
//   frame.glow         Phase 1: kaltes blaugrünes Geisterlicht (Augen, Runen, Saum)
//   frame.glowEnraged  Phase 2: heller, Geisterflammen an Geweih und Augen lodern,
//                      Panzer gesprungen (Rippen leuchten), Schleier um den Körper
// Die Leucht-Ebenen respektieren die Zeichenreihenfolge (Deckendes löscht Glühen
// darunter). Nach dem Zeichnen: Randlicht (kaltes Oberlicht auf den Kanten,
// Geisterschimmer am Rücken), damit die Figur vor dunklem Erdboden lesbar bleibt.
// Blickrichtung rechts, Anker = Mitte zwischen den Füßen.
// Z: Maßstab der Figur (Release-Runde: Ulgrim 35 % größer, Kopf/Gesicht bleibt pixelgenau)
const Z = 1.35;
const W = 260, H = 200, AX = 120, AY = 188;
const CLIP_Y = AY + 1; // unter dem Boden wird nichts gezeichnet (Schwert steckt im Boden)
// Feinraster (docs/STYLE.md „Feinraster“, Stufe B): die Puffer haben RS Texel je Weltpixel (RS = fineRes() beim Bau,
// bei „Niedrig“ 1 = alles wie früher). Die Stifte nehmen weiter Weltkoordinaten und rastern jede Form im Feinraster
// neu (Lage auf halbe Weltpixel genau, keine Hochskalierung). Pixelkarten (Gesicht) setzen ganze Zellen (RS×RS),
// Feindetails (dot/cdot/fline) einzelne Texel und stehen nur in `if (RS > 1)`.
let RS = 1, TW = W, TH = H, YC = CLIP_Y + 1;
function setRes(r) { RS = r; TW = W * r; TH = H * r; YC = (CLIP_Y + 1) * r; }

// Bronze, alt und nachgedunkelt
const BRZ = ['#170f08', '#3a2710', '#634520', '#93702f', '#c49a4a', '#f0d48e'];
// Grünspan
const VER = ['#15302c', '#22504a', '#337564', '#56a088', '#8cc8a8'];
// Ausgedörrte Haut
const SKIN = ['#1c1714', '#3c322a', '#665748', '#958267', '#c6b693'];
// Geweih / Knochen
const ANT = ['#2e261e', '#5a4c3c', '#8a7a62', '#b8a888', '#e2d6b8'];
// Bart und Haar (fahl)
const BEARD = ['#3a3a3a', '#66645e', '#95928a', '#c4c0b4', '#e8e4da'];
// Umhang: modriges Wolltuch, grünlich-grau
const CAPE = ['#0a1014', '#142028', '#1f3440', '#2d4a54', '#45686a'];
// Stoff unter der Rüstung
const CLOTH = ['#120e10', '#221a1c', '#342628', '#48363a'];
const LEATHER = ['#1a0d0b', '#3a1a12', '#5e2e1c', '#8a4828'];
const VOID = '#050608';
const RIM = [176, 226, 214];

// Leucht-Rampen (dunkel -> hell)
const GH = ['#0b3a40', '#127272', '#22b0a4', '#7ef0d6', '#e8fff8'];
const GHX = ['#0e4c5c', '#1c9aa6', '#4ae6d8', '#baffee', '#ffffff'];

const THIGH = 12.5 * Z, SHIN = 13.5 * Z, SPINE = 18 * Z, UPPER = 11.5 * Z, FORE = 11 * Z;
const PXF = ['hipX', 'hipY', 'fFx', 'fFy', 'fBx', 'fBy', 'hFx', 'hFy', 'hBx', 'hBy'];
const scaleP = (P) => { const o = { ...P }; for (const k of PXF) o[k] = P[k] * Z; return o; };

// ---------------------------------------------------------------- Pixelpuffer

const colCache = new Map();
function col(hex) {
  let v = colCache.get(hex);
  if (v === undefined) {
    const n = parseInt(hex.slice(1), 16);
    v = ((255 << 24) | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
    colCache.set(hex, v);
  }
  return v;
}
const GHc = GH.map(col), GHXc = GHX.map(col);

// Ein Satz Puffer je Platz wird für alle Frames wiederverwendet (Platz 1 nur für den Zerfall); get() leert den
// zuletzt belegten Bereich. x0..y1 = belegter Bereich in Texeln (Randlicht/Zuschnitt nur dort).
class Layers {
  static #pool = [null, null];
  static get(slot = 0) {
    const L = Layers.#pool[slot];
    if (!L || L.base.length !== TW * TH) return (Layers.#pool[slot] = new Layers());
    if (L.x1 >= 0) for (let y = L.y0; y <= L.y1; y++) {
      const a = y * TW + L.x0, b = y * TW + L.x1 + 1;
      L.base.fill(0, a, b); L.ga.fill(0, a, b); L.gb.fill(0, a, b);
    }
    L.x0 = TW; L.y0 = TH; L.x1 = -1; L.y1 = -1;
    return L;
  }
  constructor() {
    this.base = new Uint32Array(TW * TH);
    this.ga = new Uint32Array(TW * TH);
    this.gb = new Uint32Array(TW * TH);
    this.x0 = TW; this.y0 = TH; this.x1 = -1; this.y1 = -1;
  }
  mark(x, y) { if (x < this.x0) this.x0 = x; if (x > this.x1) this.x1 = x; if (y < this.y0) this.y0 = y; if (y > this.y1) this.y1 = y; }
}

// px/rect/line/ellipse in Weltkoordinaten (ein Weltpixel = RS×RS Texel, Lage auf das Feinraster gerundet).
// setv setzt ein Texel, dot ein Texel an einer Weltkoordinate, cdot in der Mitte eines px(x, y), fline eine
// Texellinie zwischen zwei px-Mitten.
class Pen {
  constructor(L) { this.L = L; }
  setv(X, Y, v) {
    if (X < 0 || Y < 0 || X >= TW || Y >= TH || Y >= YC) return;
    const i = Y * TW + X, L = this.L;
    L.base[i] = v; L.ga[i] = 0; L.gb[i] = 0;
    L.mark(X, Y);
  }
  set(X, Y, c) { this.setv(X, Y, col(c)); }
  px(x, y, c) {
    if (RS === 1) { this.setv(Math.round(x), Math.round(y), col(c)); return; }
    let x0 = Math.round(x * RS), y0 = Math.round(y * RS), x1 = x0 + RS - 1, y1 = y0 + RS - 1;
    if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0; if (x1 >= TW) x1 = TW - 1; if (y1 >= TH) y1 = TH - 1; if (y1 >= YC) y1 = YC - 1;
    if (x1 < x0 || y1 < y0) return;
    const L = this.L, v = col(c);
    L.mark(x0, y0); L.mark(x1, y1);
    for (let yy = y0; yy <= y1; yy++) for (let i = yy * TW + x0, e = yy * TW + x1; i <= e; i++) { L.base[i] = v; L.ga[i] = 0; L.gb[i] = 0; }
  }
  dot(x, y, c) { this.setv(Math.floor(x * RS + 1e-6), Math.floor(y * RS + 1e-6), col(c)); }
  cdot(x, y, c) { this.dot(x + 0.5, y + 0.5, c); }
  // Texel (sx, sy) in der Zelle, die px(x, y) setzen würde
  sub(x, y, sx, sy, c) { this.setv(Math.round(x * RS) + sx, Math.round(y * RS) + sy, col(c)); }
  fline(x0, y0, x1, y1, c) {
    const v = col(c);
    bres(Math.floor((x0 + 0.5) * RS), Math.floor((y0 + 0.5) * RS), Math.floor((x1 + 0.5) * RS), Math.floor((y1 + 0.5) * RS), (X, Y) => this.setv(X, Y, v));
  }
  rect(x, y, w, h, c) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
  }
  line(x0, y0, x1, y1, c) {
    if (RS === 1) bres(x0, y0, x1, y1, (x, y) => this.px(x, y, c));
    else { const v = col(c); bres(x0 * RS, y0 * RS, x1 * RS, y1 * RS, (X, Y) => { for (let j = 0; j < RS; j++) for (let i = 0; i < RS; i++) this.setv(X + i, Y + j, v); }); }
  }
  ellipse(cx, cy, rx, ry, c) {
    if (RS === 1) fillEllipse(cx, cy, rx, ry, (x, y) => this.px(x, y, c));
    else { const v = col(c); fillEllipseFine(cx, cy, rx, ry, (X, Y) => this.setv(X, Y, v)); }
  }
}

// px: beide Phasen, epx: nur Phase 2, apx: nur Phase 1 (Weltkoordinaten); t*: ein Texel, dot/edot/adot: ein Texel
// an einer px-Mitte (wie Pen.cdot).
class GlowPen {
  constructor(L) { this.L = L; }
  put(buf, ramp, X, Y, i) {
    if (X < 0 || Y < 0 || X >= TW || Y >= TH || Y >= YC) return;
    buf[Y * TW + X] = ramp[Math.max(0, Math.min(4, Math.round(i)))];
    this.L.mark(X, Y);
  }
  set(buf, ramp, x, y, i) {
    if (RS === 1) { this.put(buf, ramp, Math.round(x), Math.round(y), i); return; }
    const X = Math.round(x * RS), Y = Math.round(y * RS);
    for (let j = 0; j < RS; j++) for (let k = 0; k < RS; k++) this.put(buf, ramp, X + k, Y + j, i);
  }
  px(x, y, i) { this.set(this.L.ga, GHc, x, y, i); this.set(this.L.gb, GHXc, x, y, i + 0.4); }
  epx(x, y, i) { this.set(this.L.gb, GHXc, x, y, i); }
  apx(x, y, i) { this.set(this.L.ga, GHc, x, y, i); }
  tpx(X, Y, i) { this.put(this.L.ga, GHc, X, Y, i); this.put(this.L.gb, GHXc, X, Y, i + 0.4); }
  tepx(X, Y, i) { this.put(this.L.gb, GHXc, X, Y, i); }
  tapx(X, Y, i) { this.put(this.L.ga, GHc, X, Y, i); }
  sub(x, y, sx, sy, i) { this.tpx(Math.round(x * RS) + sx, Math.round(y * RS) + sy, i); }
  dot(x, y, i) { this.tpx(Math.floor((x + 0.5) * RS + 1e-6), Math.floor((y + 0.5) * RS + 1e-6), i); }
  edot(x, y, i) { this.tepx(Math.floor((x + 0.5) * RS + 1e-6), Math.floor((y + 0.5) * RS + 1e-6), i); }
  adot(x, y, i) { this.tapx(Math.floor((x + 0.5) * RS + 1e-6), Math.floor((y + 0.5) * RS + 1e-6), i); }
  fline(x0, y0, x1, y1, i) { bres(Math.floor((x0 + 0.5) * RS), Math.floor((y0 + 0.5) * RS), Math.floor((x1 + 0.5) * RS), Math.floor((y1 + 0.5) * RS), (X, Y) => this.tpx(X, Y, i)); }
  efline(x0, y0, x1, y1, i) { bres(Math.floor((x0 + 0.5) * RS), Math.floor((y0 + 0.5) * RS), Math.floor((x1 + 0.5) * RS), Math.floor((y1 + 0.5) * RS), (X, Y) => this.tepx(X, Y, i)); }
  #brush(f) { return RS === 1 ? f : (X, Y) => { for (let j = 0; j < RS; j++) for (let k = 0; k < RS; k++) f(X + k, Y + j); }; }
  line(x0, y0, x1, y1, i) {
    if (RS === 1) bres(x0, y0, x1, y1, (x, y) => this.px(x, y, i));
    else bres(x0 * RS, y0 * RS, x1 * RS, y1 * RS, this.#brush((X, Y) => this.tpx(X, Y, i)));
  }
  eline(x0, y0, x1, y1, i) {
    if (RS === 1) bres(x0, y0, x1, y1, (x, y) => this.epx(x, y, i));
    else bres(x0 * RS, y0 * RS, x1 * RS, y1 * RS, this.#brush((X, Y) => this.tepx(X, Y, i)));
  }
  ellipse(cx, cy, rx, ry, i) {
    if (RS === 1) fillEllipse(cx, cy, rx, ry, (x, y) => this.px(x, y, i));
    else fillEllipseFine(cx, cy, rx, ry, (X, Y) => this.tpx(X, Y, i));
  }
  eellipse(cx, cy, rx, ry, i) {
    if (RS === 1) fillEllipse(cx, cy, rx, ry, (x, y) => this.epx(x, y, i));
    else fillEllipseFine(cx, cy, rx, ry, (X, Y) => this.tepx(X, Y, i));
  }
}

function bres(x0, y0, x1, y1, f) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let n = 0; n < 400 * RS; n++) {
    f(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
function fillEllipse(cx, cy, rx, ry, f) {
  if (rx <= 0 || ry <= 0) return;
  for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
    const t = 1 - (y * y) / (ry * ry);
    if (t < 0) continue;
    const hw = Math.round(rx * Math.sqrt(t) - 0.15);
    for (let x = -hw; x <= hw; x++) f(Math.round(cx) + x, Math.round(cy) + y);
  }
}
// fein: Texelmitten abtasten (Weltkoordinaten rein, Texel raus). Mitte und Ausdehnung wie das grobe Raster
// (Mitte des Pixels, Rand +0,35); unter einem Weltpixel Radius bleibt es eine Zelle wie grob.
function fillEllipseFine(cx, cy, rx, ry, f) {
  if (rx <= 0 || ry <= 0) return;
  const X = (cx + 0.5) * RS, Y = (cy + 0.5) * RS;
  const ex = (rx < 1 ? 0.5 : rx + 0.35) * RS, ey = (ry < 1 ? 0.5 : ry + 0.35) * RS;
  for (let y = Math.floor(Y - ey); y <= Math.ceil(Y + ey); y++) {
    const v = (y + 0.5 - Y) / ey;
    if (v * v > 1) continue;
    const hw = ex * Math.sqrt(1 - v * v);
    for (let x = Math.ceil(X - hw - 0.5); x + 0.5 <= X + hw; x++) f(x, y);
  }
}

// Leucht-Frame; res = Texel je Weltpixel (wie SpriteFrame), canvas/ax/ay in Texeln.
class GlowFrame {
  constructor(canvas, ax, ay, res = 1) { this.canvas = canvas; this.ax = ax; this.ay = ay; this.res = res; this.flipCache = null; }
  get flipped() { return (this.flipCache ??= flipCanvas(this.canvas)); }
  draw(ctx, x, y, { flip = false, alpha = 1 } = {}) {
    const img = flip ? this.flipped : this.canvas;
    const ax = flip ? this.canvas.width - this.ax : this.ax, r = this.res;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    if (r === 1) ctx.drawImage(img, Math.round(x - ax), Math.round(y - this.ay));
    else ctx.drawImage(img, Math.round(x * r - ax) / r, Math.round(y * r - this.ay) / r, img.width / r, img.height / r);
    if (alpha !== 1) ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- Pose

const REST = {
  hipX: 0, hipY: 0, lean: 0.07, head: 0, headY: 0, bow: 0, jaw: 0,
  fFx: 8, fFy: 0, fBx: -8, fBy: 0,
  hFx: 10, hFy: 16, hBx: 4, hBy: 17,
  sw: 0.5, grip: 1, cape: 0.2, capeT: 0, beard: 0,
  cast: 0, eye: 1, kneel: 0, crown: 0, spirit: 0,
};
const pose = (o = {}) => ({ ...REST, ...o });
const ease = (t) => t * t * (3 - 2 * t);
const linear = (t) => t;
const snap = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
const slow = (t) => t * t;
const mix = (a, b, t) => {
  const o = {};
  for (const k in REST) o[k] = a[k] + (b[k] - a[k]) * t;
  return o;
};
function sample(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, p0] = keys[i], [t1, p1, e = ease] = keys[i + 1];
    if (t <= t1) return mix(p0, p1, e((t - t0) / (t1 - t0 || 1)));
  }
  return keys[keys.length - 1][1];
}

// ---------------------------------------------------------------- Geometrie

function ik(ax, ay, tx, ty, l1, l2, bend) {
  let dx = tx - ax, dy = ty - ay;
  let d = Math.hypot(dx, dy) || 0.001;
  const max = l1 + l2 - 0.05;
  if (d > max) { dx *= max / d; dy *= max / d; d = max; }
  const ux = dx / d, uy = dy / d;
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  return { jx: ax + ux * a - uy * h * bend, jy: ay + uy * a + ux * h * bend, ex: ax + dx, ey: ay + dy };
}

// Dickes Glied, Licht von links oben (4 Stufen)
function limb(p, x0, y0, x1, y1, w0, w1, ramp) {
  if (RS > 1) { limbFine(p, x0, y0, x1, y1, w0, w1, ramp); return; }
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len, ny = dx / len;
  if (nx + ny > 0) { nx = -nx; ny = -ny; }
  const steps = Math.ceil(len * 2);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, x = x0 + dx * t, y = y0 + dy * t;
    const hw = (w0 + (w1 - w0) * t) / 2;
    for (let k = -hw; k <= hw + 0.01; k += 0.5) {
      const c = k > hw - 1 ? ramp[3] : k < -hw + 1 ? ramp[0] : k > 0 ? ramp[2] : ramp[1];
      p.px(x + nx * k, y + ny * k, c);
    }
  }
}
// fein: jedes Texel einmal, Band (Licht/Grund/Schatten) aus dem Abstand zur Mittellinie. Bezug wie grob: ein px(x, y)
// deckt [x, x + 1), daher Texelmitte − 0,5; Bandgrenzen so, dass die Breiten wie im groben Bild wirken.
const limbV = [0, 0, 0, 0];
function limbFine(p, x0, y0, x1, y1, w0, w1, ramp) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  let nx = -uy, ny = ux;
  if (nx + ny > 0) { nx = -nx; ny = -ny; }
  const m = Math.max(w0, w1) / 2 + 1, e = 0.55;
  for (let i = 0; i < 4; i++) limbV[i] = col(ramp[i]);
  const v0 = limbV[0], v1 = limbV[1], v2 = limbV[2], v3 = limbV[3];
  const X0 = Math.floor((Math.min(x0, x1) - m) * RS), X1 = Math.ceil((Math.max(x0, x1) + m + 1) * RS);
  const Y0 = Math.floor((Math.min(y0, y1) - m) * RS), Y1 = Math.ceil((Math.max(y0, y1) + m + 1) * RS);
  for (let Y = Y0; Y <= Y1; Y++) {
    const qy = (Y + 0.5) / RS - 0.5 - y0;
    for (let X = X0; X <= X1; X++) {
      const qx = (X + 0.5) / RS - 0.5 - x0;
      const a = qx * ux + qy * uy;
      if (a < -e || a > len + e) continue;
      const t = a <= 0 ? 0 : a >= len ? 1 : a / len;
      const hw = (w0 + (w1 - w0) * t) / 2, k = qx * nx + qy * ny;
      if (k < -hw - e || k > hw + e) continue;
      p.setv(X, Y, k > hw - 1.4 ? v3 : k < -hw + 0.6 ? v0 : k > -0.2 ? v2 : v1);   // grob überdeckt die Lichtseite zuletzt
    }
  }
}
function bez(x0, y0, x1, y1, x2, y2, t) {
  const u = 1 - t;
  return [u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2];
}

// Niete (fein, ein Weltpixel um den Punkt): Glanzpunkt oben links, Schatten unten rechts
function rivet(p, x, y, dark = false) {
  const X = Math.floor((x + 0.5) * RS) - 1, Y = Math.floor((y + 0.5) * RS) - 1;
  p.set(X, Y, dark ? BRZ[3] : '#fff4d0'); p.set(X + 1, Y, dark ? BRZ[2] : BRZ[4]); p.set(X, Y + 1, dark ? BRZ[2] : BRZ[4]); p.set(X + 1, Y + 1, BRZ[0]);
}
// Oben-links-Normale einer Strecke (Lichtseite)
function litNormal(dx, dy) {
  const l = Math.hypot(dx, dy) || 1;
  let nx = -dy / l, ny = dx / l;
  if (nx + ny > 0) { nx = -nx; ny = -ny; }
  return [nx, ny];
}

// ---------------------------------------------------------------- Runenschwert

// Schwert entlang Winkel a vom Griffpunkt (hx, hy). u = entlang, v = quer.
// Blattklinge aus Bronze mit Grünspan, Hohlkehle mit leuchtenden Runen.
function runeSword(p, g, hx, hy, a, power = 0) {
  const dx = Math.cos(a), dy = Math.sin(a);
  const nx = -dy, ny = dx;
  const at = (u, v) => [hx + dx * u + nx * v, hy + dy * u + ny * v];
  const up = ny < 0 ? 1 : -1; // welche Querseite zeigt nach oben (Licht)
  // Griff: Lederwicklung, Bronzeknauf mit Geisterstein
  for (let u = -10; u <= 5; u += 0.5) {
    for (let v = -1.5; v <= 1.5; v += 0.5) {
      const lit = v * up > 0.6 ? 3 : v * up < -0.6 ? 0 : 1;
      let c = LEATHER[lit];
      if (Math.round(u * 2) % 4 === 0) c = LEATHER[Math.max(0, lit - 1)];
      const [x, y] = at(u, v); p.px(x, y, c);
    }
  }
  for (let u = -16; u <= -9; u += 0.5) for (let v = -3.5; v <= 3.5; v += 0.5) {
    const r = Math.hypot((u + 12.5) / 3, v / 3.3);
    if (r > 1) continue;
    const [x, y] = at(u, v);
    p.px(x, y, r > 0.82 ? BRZ[0] : r < 0.45 ? BRZ[2] : v * up > 0.3 ? BRZ[4] : BRZ[2]);
  }
  { const [x, y] = at(-12.5, 0); const [x2, y2] = at(-12.5, up); p.px(x, y, GH[3]); p.px(x2, y2, GH[2]); g.px(x, y, 4); g.px(x2, y2, 2); }
  // Parierstange: geschwungene Enden (Widderhörner)
  for (let v = -8.5; v <= 8.5; v += 0.5) {
    const curl = Math.max(0, Math.abs(v) - 6) * 0.9;
    for (let u = 5.5; u <= 8; u += 0.5) {
      const [x, y] = at(u - curl, v);
      const lit = (u > 7.4 ? 1 : 0) + (v * up > 0 ? 1 : 0);
      p.px(x, y, u < 6 ? BRZ[0] : [BRZ[1], BRZ[3], BRZ[5]][lit]);
    }
  }
  { const [x, y] = at(6.8, 0); p.px(x, y, GH[2]); g.px(x, y, 3); }
  // Klinge: Blattform, am Ansatz schmal, bei 70 % am breitesten
  const L = 60, B0 = 9; // Spitze bleibt nah am Angriffsbogen (r 60)
  const half = (u) => {
    const t = (u - B0) / (L - B0);
    if (t < 0 || t > 1) return 0;
    const leaf = t < 0.72 ? 2.9 + 2 * Math.sin((t / 0.72) * Math.PI * 0.5) : 4.9 * Math.sqrt(Math.max(0, (1 - t) / 0.28));
    return leaf;
  };
  for (let u = B0; u <= L; u += 0.5) {
    const hw = half(u);
    for (let v = -hw; v <= hw; v += 0.5) {
      const e = Math.abs(v) / (hw || 1);
      const side = v * up; // > 0 = Oberseite
      let c;
      if (e > 0.82) c = side > 0 ? '#f0dcaa' : BRZ[1]; // geschliffene Schneide
      else if (e > 0.64) c = side > 0 ? BRZ[5] : BRZ[3];
      else if (Math.abs(v) < 0.8) c = VOID; // Hohlkehle (leuchtet)
      else c = side > 0 ? BRZ[4] : BRZ[2];
      // Grünspan-Flecken auf der Fläche
      const hv = RS > 1 ? hash2(Math.round(u / 1.5), Math.round(v) + 20, 41) : hash2(Math.round(u * 2), Math.round(v * 2) + 20, 41);   // fein: längliche Patina statt Sprenkel
      if (e < 0.6 && Math.abs(v) >= 0.8 && hv < 0.1) c = hv < 0.03 ? VER[3] : VER[side > 0 ? 2 : 1];
      const [x, y] = at(u, v); p.px(x, y, c);
    }
  }
  // Hohlkehle: durchgehende Geisterlinie, Runen darin heller
  for (let u = B0 + 2; u <= L - 9; u += 0.5) {
    const [x, y] = at(u, 0);
    p.px(x, y, RS > 1 ? GH[2] : GH[1]);
    g.px(x, y, 1 + power * 0.6);
  }
  if (RS > 1) for (let u = B0 + 2.5; u <= L - 9.5; u += 0.25) {
    // fein: heller Frostkern in der Geisterlinie
    const [x, y] = at(u, 0); p.cdot(x, y, '#c4fbee'); g.dot(x, y, 2 + power);
  }
  const runes = [16, 24, 32, 40];
  for (const u of runes) {
    const [x, y] = at(u, 0); const [x2, y2] = at(u + 1.5, 0); const [x3, y3] = at(u + 0.8, up * 0.9);
    p.px(x, y, GH[3]); p.px(x2, y2, GH[2]);
    g.px(x, y, 3 + power); g.px(x2, y2, 2 + power); g.px(x3, y3, 1);
    g.epx(x, y, 4);
  }
  if (RS > 1) {
    // Handfein: Lederwicklung mit Naht (Punktlinie), Knauf und Parier mit Glanz, Schneide mit Glanzlinie und
    // Wate, Hohlkehle mit Lichtkante unten und Schattenkante oben, Runen mit weißem Kern, Kratzer, Glanz an der Spitze
    for (let u = -9.5; u <= 4.5; u += 1) { const [x, y] = at(u, -up * 0.4); p.cdot(x, y, LEATHER[3]); }
    { const [x, y] = at(-14.2, up * 1.6); p.cdot(x, y, '#fff4d0'); const [x2, y2] = at(-13.6, up * 2.2); p.cdot(x2, y2, BRZ[5]); }
    { const [x, y] = at(-12.5, 0); p.cdot(x, y, '#ffffff'); g.dot(x, y, 4); }
    for (let v = 1; v <= 6; v += 0.5) { const curl = Math.max(0, v - 6) * 0.9, [x, y] = at(7.8 - curl, v * up); p.cdot(x, y, v < 4 ? '#fffaf0' : BRZ[5]); }
    for (let u = B0 + 1; u <= L - 1.5; u += 0.25) {
      const hw = half(u);
      if (hw < 1.2) continue;
      let [x, y] = at(u, up * (hw - 0.35)); p.cdot(x, y, u > 16 && u < 48 ? '#fffaf0' : '#f0dcaa');
      [x, y] = at(u, up * hw * 0.68); p.cdot(x, y, BRZ[3]);
      [x, y] = at(u, -up * (hw - 0.35)); p.cdot(x, y, BRZ[0]);
      [x, y] = at(u, -up * hw * 0.68); p.cdot(x, y, BRZ[2]);
      if (u >= B0 + 2 && u <= L - 9) {
        [x, y] = at(u, -up * 0.95); p.cdot(x, y, BRZ[4]);
        [x, y] = at(u, up * 0.95); p.cdot(x, y, BRZ[1]);
      }
    }
    for (const u of runes) {
      const [a0, b0] = at(u - 0.2, -up * 0.6), [a1, b1] = at(u + 1.2, up * 0.6), [cx, cy] = at(u + 0.5, 0);
      p.fline(a0, b0, a1, b1, GH[3]); p.cdot(cx, cy, '#ffffff');
      g.fline(a0, b0, a1, b1, 3 + power); g.dot(cx, cy, 4);
    }
    for (const [u0, v0, u1, v1, c] of [[27, 1.6, 30.5, 2.6, BRZ[2]], [37, 1.4, 39, 2.2, BRZ[2]], [44, -1.4, 46.5, -2.5, BRZ[4]]]) {
      const [a0, b0] = at(u0, v0 * up), [a1, b1] = at(u1, v1 * up); p.fline(a0, b0, a1, b1, c);
    }
    { const [x, y] = at(L - 2.5, up * half(L - 2.5) * 0.6); p.cdot(x, y, '#ffffff'); }
  }
  // Schneide glänzt (Geisterlicht) bei Schlägen
  if (power > 0) {
    for (let u = 18; u <= L - 1; u += 1) {
      const hw = half(u);
      const [x, y] = at(u, hw * (up > 0 ? 1 : -1) * 0.9);
      g.px(x, y, u > L - 14 ? 2 : 1);
    }
  }
  const [tx, ty] = at(L, 0);
  const [mx, my] = at(36, 0);
  return { tipX: tx, tipY: ty, midX: mx, midY: my };
}

// Geisterschleier eines Schwungs (fast nur Leucht-Ebene)
function smear(p, g, cx, cy, a0, a1, r0, r1, rev = false, flat = 1) {
  if (Math.abs(a1 - a0) > 1.8) a0 = a1 - Math.sign(a1 - a0) * 1.8;
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1), span = hi - lo || 1;
  const R1 = Math.ceil(r1);
  if (RS > 1) { smearFine(p, g, cx, cy, a0, a1, r0, r1, rev, flat, lo, hi, span, R1); return; }
  for (let y = -R1; y <= R1; y++) for (let x = -R1; x <= R1; x++) {
    const yy = y * 1.15 / flat;
    const d = Math.hypot(x, yy);
    if (d < r0 || d > r1) continue;
    let a = Math.atan2(yy, x);
    while (a < lo - Math.PI) a += Math.PI * 2;
    while (a > lo + Math.PI) a -= Math.PI * 2;
    if (a < lo || a > hi) continue;
    const fresh = a1 > a0 ? (a - lo) / span : (hi - a) / span;
    const radial = (d - r0) / (r1 - r0);
    const band = Math.max(0, 1 - (1 - radial) * 2.2);
    const dens = (fresh * fresh * 0.3 + band * (0.2 + 0.8 * fresh)) * (radial > 0.5 ? 1 : 0.45);
    if (hash2(x + 131, y + 77, rev ? 23 : 19) > dens) continue;
    const i = radial > 0.9 ? 4 : radial > 0.76 ? 3 : fresh > 0.6 ? 2 : 1;
    if (radial > 0.84 && fresh > 0.45) p.px(cx + x, cy + y, '#c8f4e8');
    g.px(cx + x, cy + y, fresh < 0.25 ? Math.min(i, 1) : i);
  }
}
// fein: Form je Texel (glatte Bogenkanten), Dichte-Zufall je Weltpixel (sonst flimmert es)
function smearFine(p, g, cx, cy, a0, a1, r0, r1, rev, flat, lo, hi, span, R1) {
  const CX = Math.round(cx * RS), CY = Math.round(cy * RS), hi4 = col('#c8f4e8');
  const r0q = r0 * r0, r1q = r1 * r1;
  for (let Y = -R1 * RS; Y < (R1 + 1) * RS; Y++) {
    const y = (Y + 0.5) / RS - 0.5, yy = y * 1.15 / flat, hy = Math.floor(Y / RS) + 77;
    for (let X = -R1 * RS; X < (R1 + 1) * RS; X++) {
      const x = (X + 0.5) / RS - 0.5, d2 = x * x + yy * yy;
      if (d2 < r0q || d2 > r1q) continue;
      const d = Math.sqrt(d2);
      let a = Math.atan2(yy, x);
      while (a < lo - Math.PI) a += Math.PI * 2;
      while (a > lo + Math.PI) a -= Math.PI * 2;
      if (a < lo || a > hi) continue;
      const fresh = a1 > a0 ? (a - lo) / span : (hi - a) / span;
      const radial = (d - r0) / (r1 - r0);
      const band = Math.max(0, 1 - (1 - radial) * 2.2);
      const dens = (fresh * fresh * 0.3 + band * (0.2 + 0.8 * fresh)) * (radial > 0.5 ? 1 : 0.45);
      if (hash2(Math.floor(X / RS) + 131, hy, rev ? 23 : 19) > dens + (radial > 0.84 ? 0.15 : 0)) continue;
      const i = radial > 0.9 ? 4 : radial > 0.76 ? 3 : fresh > 0.6 ? 2 : 1;
      if (radial > 0.84 && fresh > 0.45) p.setv(CX + X, CY + Y, hi4);
      g.tpx(CX + X, CY + Y, fresh < 0.25 ? Math.min(i, 1) : i);
    }
  }
}

// ---------------------------------------------------------------- Figur

function drawUlgrim(p, g, P0, extra = {}) {
  const P = scaleP(P0);
  const gy = AY;
  const lean = P.lean, sL = Math.sin(lean), cL = Math.cos(lean);
  const hipX = AX + P.hipX, hipY = gy - 25 * Z + P.hipY + P.kneel * 9 * Z;
  const chX = hipX + sL * SPINE, chY = hipY - cL * SPINE;
  const perpX = cL, perpY = sL;
  const along = (s, k) => [hipX + sL * s + perpX * k, hipY - cL * s + perpY * k];
  const meta = {};

  // Beine
  const fF = { x: AX + P.fFx, y: gy - P.fFy };
  const fB = { x: AX + P.fBx, y: gy - P.fBy };
  const legF = ik(hipX + 4, hipY, fF.x, fF.y, THIGH, SHIN, -1);
  const legB = ik(hipX - 4, hipY, fB.x, fB.y, THIGH, SHIN, -1);
  if (P.kneel > 0.01) {
    // hinteres Knie auf dem Boden
    const kx = hipX - 7 - P.kneel * 3, ky = gy - 3;
    legB.jx += (kx - legB.jx) * P.kneel; legB.jy += (ky - legB.jy) * P.kneel;
    legB.ex += (kx - 15 - legB.ex) * P.kneel; legB.ey += (gy - legB.ey) * P.kneel;
  }

  // Schultern, Hände
  const shF = { x: chX + perpX * 9.5, y: chY + perpY * 9.5 + 3 };
  const shB = { x: chX - perpX * 8, y: chY - perpY * 8 + 1 };
  const hF = { x: chX + P.hFx, y: chY + P.hFy };
  const sa = P.sw;
  const hB = P.grip > 0.5
    ? { x: hF.x - Math.cos(sa) * 7, y: hF.y - Math.sin(sa) * 7 }
    : { x: chX + P.hBx, y: chY + P.hBy };
  const armF = ik(shF.x, shF.y, hF.x, hF.y, UPPER, FORE, 1);
  const armB = ik(shB.x, shB.y, hB.x, hB.y, UPPER, FORE, 1);

  const neckX = chX + sL * 3 + 1, neckY = chY - cL * 3;
  const hx = Math.round(neckX - 6 + P.head), hy = Math.round(neckY - 13 + P.headY + P.bow * 2);

  // --- 0. Geisterschleier (nur Phase 2, hinter allem)
  if (P.spirit >= 0) aura(g, chX, chY, gy, P);

  // --- 1. Umhang
  cape(p, g, chX - perpX * 3, chY + 1, gy, P);

  // --- 2. Hinteres Bein, hinterer Arm (dunkler)
  const darkB = [VOID, BRZ[0], BRZ[1], BRZ[2]];
  const litB = [BRZ[1], BRZ[2], BRZ[3], BRZ[4]];
  leg(p, g, hipX - 4, hipY, legB, true, P);
  limb(p, shB.x, shB.y, armB.jx, armB.jy, 6, 5.5, [VOID, CLOTH[0], CLOTH[1], CLOTH[2]]);
  limb(p, armB.jx, armB.jy, armB.ex, armB.ey, 6.5, 6, darkB);
  p.ellipse(armB.jx, armB.jy, 2.6, 2.6, BRZ[1]);
  hand(p, armB.ex, armB.ey, true, P.cast > 0.3);
  meta.cast = { x: armB.ex, y: armB.ey - 3 };
  pauldron(p, g, shB.x - 1, shB.y - 1, 6, 5.2, darkB, false);

  if (extra.swordBehind) {
    const t = runeSword(p, g, hF.x, hF.y, sa, extra.power ?? 0);
    meta.tip = { x: t.tipX, y: t.tipY }; meta.blade = { x: t.midX, y: t.midY };
  }

  // --- 3. Rumpf
  torso(p, g, along, P, meta);

  // --- 4. Vorderes Bein, Gürtel mit Lederstreifen
  leg(p, g, hipX + 4, hipY, legF, false, P);
  belt(p, g, hipX, hipY, P, legF);

  // --- 5. Hals, Kopf, Bart, Geweihkrone
  p.rect(neckX - 3, neckY - 5, 6, 6, SKIN[1]); p.px(neckX - 3, neckY - 5, SKIN[2]);
  p.line(neckX - 1, neckY - 4, neckX + 2, neckY - 1, SKIN[0]);
  const beard = head(p, g, hx, hy, P, meta, gy);

  // --- 6. Schwung-Schleier
  if (extra.smear) smear(p, g, shF.x, shF.y + (extra.flat ? 8 : 2), extra.smear[0], extra.smear[1], 34, 80, extra.rev, extra.flat ?? 1);

  // --- 7. Vorderer Arm mit Schwert
  const drawArm = () => {
    limb(p, shF.x, shF.y, armF.jx, armF.jy, 6.5, 6, [CLOTH[0], CLOTH[1], CLOTH[2], CLOTH[3]]);
    limb(p, armF.jx, armF.jy, armF.ex, armF.ey, 7.5, 6.5, litB);
    // Armschiene: Grünspan-Band, Kante
    const mx = armF.jx + (armF.ex - armF.jx) * 0.35, my = armF.jy + (armF.ey - armF.jy) * 0.35;
    p.px(mx, my, VER[2]); p.px(mx + 1, my, VER[1]); p.px(mx, my + 1, VER[1]);
    p.ellipse(armF.jx, armF.jy, 2.8, 2.8, BRZ[2]); p.px(armF.jx - 1, armF.jy - 1, BRZ[4]);
    if (RS > 1) {
      // Handfein: Glanzlinie auf der Armschiene, Ellbogenkachel mit Lichtbogen und Glanzpunkt, Niete
      const [nx, ny] = litNormal(armF.ex - armF.jx, armF.ey - armF.jy);
      const lx = (t, k) => [armF.jx + (armF.ex - armF.jx) * t + nx * k, armF.jy + (armF.ey - armF.jy) * t + ny * k];
      const [a, b] = lx(0.3, 2.2), [c, d] = lx(0.85, 1.9); p.fline(a, b, c, d, BRZ[5]); p.cdot(a, b, '#fff4d0');
      for (let t = 3.5; t < 4.7; t += 0.25) p.cdot(armF.jx + Math.cos(t) * 2, armF.jy + Math.sin(t) * 2, BRZ[4]);
      p.cdot(armF.jx - 1.2, armF.jy - 1.2, '#fff4d0');
      const [rx, ry] = lx(0.55, -1.6); rivet(p, rx, ry, true);
    }
  };
  drawArm();
  if (!extra.swordBehind) {
    const t = runeSword(p, g, hF.x, hF.y, sa, extra.power ?? 0);
    meta.tip = { x: t.tipX, y: t.tipY }; meta.blade = { x: t.midX, y: t.midY };
  }
  hand(p, hF.x, hF.y, false, false);
  if (P.grip > 0.5) hand(p, hB.x, hB.y, false, false);
  pauldron(p, g, shF.x, shF.y, 7.4, 6, litB, true);
  beard();
  // Hände liegen vor dem Bart
  hand(p, hF.x, hF.y, false, false);
  if (P.grip > 0.5) hand(p, hB.x, hB.y, false, false);
  meta.hand = { x: hF.x, y: hF.y };

  // Geisterfeuer in der Zauberhand
  if (P.cast > 0.05) {
    const r = 1 + P.cast * 4, { x, y } = meta.cast;
    g.ellipse(x, y, r + 1.5, r + 1.5, 1);
    g.ellipse(x, y - 0.5, r, r, 2);
    g.ellipse(x, y - 1, Math.max(0.6, r - 1.6), Math.max(0.6, r - 1.6), 3);
    g.px(x, y - 1, 4);
    for (let i = 0; i < 5; i++) {
      const fx = x - r + hash2(i, Math.round(P.cast * 7 + P.capeT * 3), 3) * r * 2;
      g.line(fx, y - r, fx + (hash2(i, 2, 3) - 0.5) * 2, y - r - 2 - hash2(i, 5 + Math.round(P.capeT * 2), 3) * 5, 2);
    }
  }
  return meta;
}

// Muskelpanzer aus Bronze, Grünspan, Runensiegel. Phase 2: Riss, Rippen leuchten.
const torsoHwB = (t) => { const sm = t * t * (3 - 2 * t); return (5 + 3.2 * sm) * Z; };
const torsoHwF = (t) => { const sm = t * t * (3 - 2 * t); return (4.5 + 3.6 * sm + (t > 0.45 && t < 0.95 ? 1.6 * Math.sin((t - 0.45) / 0.5 * Math.PI) : 0)) * Z; };
function torso(p, g, along, P, meta) {
  if (RS > 1) torsoFine(p, along);
  else for (let s = 0; s <= SPINE + 1; s += 0.5) {
    const t = s / SPINE;
    const hwB = torsoHwB(t), hwF = torsoHwF(t);
    for (let k = -hwB; k <= hwF; k += 0.5) {
      const [x, y] = along(s, k);
      p.px(x, y, torsoCol(t, k, hwB, hwF, x, y));
    }
  }
  torsoDetail(p, g, along, P, meta);
}
// Farbe des Muskelpanzers an (t, k); x, y = Weltlage für die Grünspan-Flecken
function torsoCol(t, k, hwB, hwF, x, y) {
  {
    {
      const rel = (k + hwB) / (hwB + hwF);
      let i = rel < 0.08 ? 5 : rel < 0.24 ? 4 : rel < 0.46 ? 3 : rel < 0.76 ? 2 : 1;
      if (rel > 0.92) i = 0;
      if (t < 0.32 && i > 1 && rel > 0.2) i -= 1;
      // Brustmuskel: oben heller, darunter Schattenkante
      const pec = 0.6 + (rel - 0.6) * (rel - 0.6) * 0.5;
      if (t > pec + 0.02 && t < pec + 0.16 && rel > 0.28 && rel < 0.8) i = Math.min(5, i + 1);
      if (Math.abs(t - pec) < 0.025 && rel > 0.3 && rel < 0.95) i = 1;
      // Bauchplatten
      if (t > 0.12 && t < 0.56 && Math.abs(rel - 0.55) < 0.025) i = Math.max(1, i - 1);
      if ((Math.abs(t - 0.28) < 0.02 || Math.abs(t - 0.42) < 0.02) && rel > 0.35 && rel < 0.9) i = Math.max(1, i - 1);
      if (t < 0.1 && rel > 0.12) i = Math.max(1, i - 1);
      let c = BRZ[i];
      const hv = hash2(Math.round(x), Math.round(y), 7);
      // Grünspan sammelt sich in den Vertiefungen und unten
      if (hv < 0.06 + (1 - t) * 0.12 && rel > 0.35 && i < 4) c = VER[Math.min(2, Math.max(0, i - 1))];
      if (t < 0.05) c = BRZ[1];
      return c;
    }
  }
}
// fein: jedes Texel einmal, (s, k) durch Rückdrehung; Grünspan je Weltpixel
function torsoFine(p, along) {
  const [hx, hy] = along(0, 0), [ax, ay] = along(1, 0);
  const sx = ax - hx, sy = ay - hy;   // Rumpfachse (sin, −cos); quer dazu (cos, sin)
  const S1 = SPINE + 1, e = 0.3, m = Math.max(torsoHwB(1), torsoHwF(0.7)) + 2;
  const X0 = Math.floor((Math.min(hx, hx + sx * S1) - m) * RS), X1 = Math.ceil((Math.max(hx, hx + sx * S1) + m + 1) * RS);
  const Y0 = Math.floor((Math.min(hy, hy + sy * S1) - m) * RS), Y1 = Math.ceil((Math.max(hy, hy + sy * S1) + m + 1) * RS);
  for (let Y = Y0; Y <= Y1; Y++) {
    const qy = (Y + 0.5) / RS - 0.5 - hy;
    for (let X = X0; X <= X1; X++) {
      const qx = (X + 0.5) / RS - 0.5 - hx;
      const s = sx * qx + sy * qy;
      if (s < -e || s > S1 - 0.3 + e) continue;
      const k = -sy * qx + sx * qy;
      const t = Math.max(0, Math.min(S1 - 0.3, s)) / SPINE, hwB = torsoHwB(t), hwF = torsoHwF(t);
      if (k < -hwB - e || k > hwF + e) continue;
      p.set(X, Y, torsoCol(t, Math.max(-hwB, Math.min(hwF, k)), hwB, hwF, (X + 0.5) / RS - 0.5, (Y + 0.5) / RS - 0.5));
    }
  }
}
function torsoDetail(p, g, along, P, meta) {
  // Glanz (Licht von links oben)
  { const [x, y] = along(SPINE - 2, -7); p.px(x, y, BRZ[5]); p.px(x + 1, y, BRZ[5]); p.px(x + 2, y + 1, BRZ[4]); }
  { const [x, y] = along(SPINE * 0.7, -2); p.px(x, y, BRZ[5]); p.px(x, y + 1, BRZ[4]); }
  // Runensiegel auf der Brust
  const [cx, cy] = along(SPINE * 0.45, 3);
  p.ellipse(cx, cy, 3, 3, BRZ[0]); p.ellipse(cx, cy, 2.2, 2.2, BRZ[1]);
  p.px(cx, cy - 1, VER[1]); p.px(cx - 1, cy + 1, VER[1]); p.px(cx + 1, cy + 1, VER[1]); p.px(cx, cy, VER[1]);
  const pulse = P.eye;
  g.px(cx, cy - 1, 1 + 2 * pulse); g.px(cx - 1, cy + 1, 1 + pulse); g.px(cx + 1, cy + 1, 1 + pulse); g.px(cx, cy, 1 + pulse);
  g.eellipse(cx, cy, 2.2, 2.2, 2); g.epx(cx, cy, 4); g.epx(cx, cy - 1, 4);
  meta.chest = { x: cx, y: cy };
  // Phase 2: Risse vom Siegel, dahinter leuchten die Rippen
  const cracks = [[[0.45, 2], [0.56, 4], [0.66, 3], [0.8, 6]], [[0.45, 2], [0.32, -1], [0.22, 0]], [[0.45, 2], [0.58, -2], [0.7, -4]]];
  for (const c of cracks) for (let i = 0; i < c.length - 1; i++) {
    const [x0, y0] = along(c[i][0] * SPINE, c[i][1] * Z), [x1, y1] = along(c[i + 1][0] * SPINE, c[i + 1][1] * Z);
    g.eline(x0, y0, x1, y1, i === 0 ? 3 : 2);
    if (RS > 1) g.efline(x0, y0, x1, y1, i === 0 ? 4 : 3);   // fein: heller Kern im Saum
  }
  if (RS > 1) {
    // Handfein: Glanzlinie über Brust und Flanke, Glanzpunkt, Nieten am Unterrand, Kratzer, Siegelring im Licht
    for (let s = SPINE * 0.42; s <= SPINE * 0.94; s += 0.25) {
      const t = s / SPINE, hwB = torsoHwB(t), hwF = torsoHwF(t);
      const [x, y] = along(s, -hwB + 0.15 * (hwB + hwF)); p.cdot(x, y, t > 0.6 ? '#fff0c0' : BRZ[5]);
    }
    { const [x, y] = along(SPINE - 2, -7); p.cdot(x - 0.5, y - 0.5, '#ffffff'); p.cdot(x, y - 0.5, '#fff4d0'); }
    { const [x, y] = along(SPINE * 0.7, -2); p.cdot(x - 0.5, y - 0.5, '#fff4d0'); }
    for (let k = -torsoHwB(0) + 2; k < torsoHwF(0) - 1; k += 3.2) { const [x, y] = along(SPINE * 0.05, k); rivet(p, x, y, k > 2); }
    for (const [s0, k0, s1, k1, c] of [[0.78, -4, 0.72, -2.5, BRZ[2]], [0.62, 1, 0.57, 3, BRZ[1]], [0.3, 5, 0.26, 7, BRZ[3]]]) {
      const [a, b] = along(s0 * SPINE, k0 * Z), [c2, d] = along(s1 * SPINE, k1 * Z); p.fline(a, b, c2, d, c);
    }
    for (let a = 3.3; a < 4.9; a += 0.25) p.cdot(cx + Math.cos(a) * 2.6, cy + Math.sin(a) * 2.6, BRZ[3]);
    p.cdot(cx, cy - 1, VER[3]); g.dot(cx, cy - 1, 2 + 2 * pulse); g.edot(cx, cy, 4);
  }
}

function belt(p, g, hipX, hipY, P, legF) {
  // Tunika-Saum darunter, darüber Lederstreifen (Pteryges) mit Bronzebeschlägen
  const swing = (legF.jx - hipX - 5) * 0.12;
  for (let x = hipX - 10; x <= hipX + 11; x++) {
    const len = 8 + (hash2(x, 2, 9) * 2 | 0);
    for (let j = 0; j < len; j++) p.px(x + swing * (j / len), hipY + j, j > len - 2 ? CLOTH[0] : CLOTH[x < hipX - 4 ? 2 : 1]);
  }
  for (let i = 0; i < 7; i++) {
    const tx = hipX - 10 + i * 3.2, ty = hipY;
    const len = 10 - Math.abs(i - 3) * 0.9 + (hash2(i, 3, 9) * 2 | 0);
    const sw = swing * (0.5 + i / 10) + Math.sin(P.capeT + i * 1.3) * 0.4;
    for (let j = 0; j < len; j++) {
      const x = tx + sw * (j / len);
      const lit = i < 2 ? 3 : i < 5 ? 2 : 1;
      p.px(x, ty + j, LEATHER[j === 0 ? 3 : lit]); p.px(x + 1, ty + j, LEATHER[Math.max(0, lit - 1)]); p.px(x + 2, ty + j, LEATHER[0]);
    }
    const ex = tx + sw;
    p.px(ex, ty + len - 1, BRZ[4]); p.px(ex + 1, ty + len - 1, BRZ[2]);
    if (RS > 1) {
      // Handfein: Naht als Punktlinie die Lasche hinab, Beschlag mit Glanzpunkt
      for (let j = 1; j < len - 2; j++) p.sub(tx + sw * (j / len) + 1, ty + j, 0, 0, i < 2 ? LEATHER[3] : LEATHER[2]);
      p.sub(ex, ty + len - 1, 0, 0, '#fff4d0'); p.sub(ex + 1, ty + len - 1, 1, 1, BRZ[0]);
    }
  }
  // Gürtel mit Bronzescheiben
  p.rect(hipX - 12, hipY - 4, 24, 4, LEATHER[1]); p.rect(hipX - 12, hipY - 4, 24, 1, LEATHER[3]); p.rect(hipX - 12, hipY - 1, 24, 1, LEATHER[0]);
  for (let x = hipX - 10; x < hipX + 12; x += 4) { p.px(x, hipY - 3, BRZ[5]); p.px(x + 1, hipY - 3, BRZ[3]); p.px(x, hipY - 2, BRZ[2]); p.px(x + 1, hipY - 2, BRZ[1]); }
  const bx = hipX + 4, by = hipY - 5;
  p.ellipse(bx, by + 2, 3.5, 3, BRZ[1]); p.ellipse(bx - 0.5, by + 1.5, 2.6, 2.2, BRZ[3]); p.px(bx - 1, by, BRZ[5]); p.px(bx - 2, by + 1, BRZ[5]);
  p.px(bx, by + 2, GH[2]); p.px(bx + 1, by + 2, GH[1]); g.px(bx, by + 2, 2); g.px(bx + 1, by + 2, 1);
  if (RS > 1) {
    // Handfein: Naht unter der Oberkante, Scheiben mit Glanzpunkt, Schnalle mit Glanz und Steinkern
    for (let x = hipX - 12; x < hipX + 12; x++) p.sub(x, hipY - 4, 0, 1, LEATHER[2]);
    for (let x = hipX - 10; x < hipX + 12; x += 4) { p.sub(x, hipY - 3, 0, 0, '#fff4d0'); p.sub(x + 1, hipY - 2, 1, 1, BRZ[0]); }
    p.sub(bx - 2, by + 1, 0, 0, '#fff4d0'); p.sub(bx - 1, by, 0, 0, '#ffffff');
    p.sub(bx, by + 2, 0, 0, GH[4]); g.sub(bx, by + 2, 0, 0, 4);
  }
}

function leg(p, g, hx, hy, L, back, P) {
  const cloth = back ? [VOID, CLOTH[0], CLOTH[1], CLOTH[2]] : [CLOTH[0], CLOTH[1], CLOTH[2], CLOTH[3]];
  const ramp = back ? [VOID, BRZ[0], BRZ[1], BRZ[2]] : [BRZ[1], BRZ[2], BRZ[3], BRZ[4]];
  limb(p, hx, hy, L.jx, L.jy, 8, 7, cloth);
  // Beinschiene (Bronze, Grünspan-Kante)
  limb(p, L.jx, L.jy, L.ex, L.ey - 4, 7.5, 6, ramp);
  const mx = L.jx + (L.ex - L.jx) * 0.6, my = L.jy + (L.ey - 4 - L.jy) * 0.6;
  p.px(mx, my, back ? VER[0] : VER[2]); p.px(mx + 1, my + 1, back ? VER[0] : VER[1]);
  // Schuh: umwickeltes Leder, Bronzekappe
  const ex = L.ex, ey = L.ey;
  p.rect(ex - 4, ey - 4, 10, 4, back ? LEATHER[0] : LEATHER[1]); p.rect(ex - 4, ey - 4, 10, 1, back ? LEATHER[1] : LEATHER[3]);
  p.rect(ex + 4, ey - 4, 4, 4, ramp[1]); p.rect(ex + 4, ey - 4, 3, 1, ramp[3]); p.px(ex + 7, ey - 1, ramp[0]);
  p.px(ex - 1, ey - 3, back ? VOID : LEATHER[0]); p.px(ex + 1, ey - 2, back ? VOID : LEATHER[0]);
  // Kniekachel
  p.ellipse(L.jx, L.jy, 3.4, 3.1, ramp[0]); p.ellipse(L.jx - 0.3, L.jy - 0.3, 2.7, 2.4, ramp[1]); p.ellipse(L.jx - 0.8, L.jy - 0.8, 1.6, 1.4, ramp[2]); p.px(L.jx - 1, L.jy - 1, ramp[3]);
  if (RS > 1) {
    // Handfein: Glanzlinie auf der Beinschiene, Nieten am Rand, Kniekachel mit Glanzpunkt und Lichtbogen,
    // Schuhwicklung mit Naht als Punktlinie, Glanz auf der Bronzekappe
    const [nx, ny] = litNormal(L.ex - L.jx, L.ey - 4 - L.jy);
    const ax = L.jx + (L.ex - L.jx) * 0.22, ay = L.jy + (L.ey - 4 - L.jy) * 0.22, bx = L.jx + (L.ex - L.jx) * 0.9, by = L.jy + (L.ey - 4 - L.jy) * 0.9;
    const hw = 3.3;
    p.fline(ax + nx * (hw - 1.3), ay + ny * (hw - 1.3), bx + nx * (hw - 1.6), by + ny * (hw - 1.6), back ? ramp[3] : BRZ[5]);
    if (!back) p.cdot(ax + nx * (hw - 1.3), ay + ny * (hw - 1.3), '#fff4d0');
    for (const t of [0.35, 0.75]) rivet(p, L.jx + (L.ex - L.jx) * t - nx * (hw - 1.2), L.jy + (L.ey - 4 - L.jy) * t - ny * (hw - 1.2), back);
    for (let a = 3.5; a < 4.7; a += 0.2) p.cdot(L.jx - 0.3 + Math.cos(a) * 2.2, L.jy - 0.3 + Math.sin(a) * 1.9, ramp[3]);
    p.cdot(L.jx - 1.3, L.jy - 1.3, back ? ramp[3] : '#fff4d0');
    for (let x = ex - 3; x <= ex + 3; x++) p.sub(x, ey - 2, 0, 0, back ? LEATHER[1] : LEATHER[3]);
    p.sub(ex + 4, ey - 4, 0, 0, back ? ramp[3] : '#fff4d0'); p.sub(ex + 6, ey - 1, 1, 1, VOID);
  }
}

function hand(p, x, y, back, open) {
  const s = back ? [VOID, SKIN[0], SKIN[1], SKIN[2]] : [SKIN[1], SKIN[2], SKIN[3], SKIN[4]];
  p.rect(x - 3, y - 2, 5, 5, s[1]); p.rect(x - 3, y - 2, 5, 1, s[3]); p.px(x + 1, y + 2, s[0]); p.px(x - 3, y + 2, s[0]);
  p.px(x - 1, y - 2, s[2]); p.line(x - 2, y, x + 1, y, s[0]);
  if (RS > 1) {
    // Handfein: Knöchel mit Glanz, Fingerfugen
    p.sub(x - 3, y - 2, 0, 0, back ? s[3] : MUMMY_HI); p.sub(x - 1, y - 2, 0, 0, back ? s[3] : MUMMY_HI);
    for (const fx of [x - 3, x - 2, x - 1]) p.sub(fx, y - 1, 1, 0, s[0]);
    p.sub(x + 1, y - 2, 1, 1, s[0]);
  }
  if (open) for (let k = -2; k <= 2; k += 2) { p.line(x + k * 0.6, y - 2, x + k * 1.1, y - 6, s[2]); p.px(x + k * 1.1, y - 6, s[3]); }
}

function pauldron(p, g, x, y, rx, ry, ramp, front) {
  // Kuppel und drei gestaffelte Schienen darunter
  for (let l = 2; l >= 0; l--) {
    const cy = y + 1 + l * 2.6, r = rx - l * 0.7;
    p.ellipse(x + l * 0.3, cy, r, 2.6, ramp[0]);
    p.ellipse(x + l * 0.3 - 0.3, cy - 0.6, r - 0.8, 1.7, ramp[l === 0 ? 2 : 1]);
    p.line(x - r + 1.5 + l * 0.3, cy - 1, x + r - 1.5, cy - 1, ramp[3]);
    if (front && hash2(l, 1, 3) < 0.6) p.px(x + r - 2, cy, VER[2]);
  }
  p.ellipse(x, y - 1, rx - 0.5, ry - 1.8, ramp[1]);
  p.ellipse(x - 0.8, y - 1.6, rx - 2, ry - 2.8, ramp[2]);
  p.ellipse(x - 1.6, y - 2.2, Math.max(0.6, rx - 4), Math.max(0.6, ry - 3.8), ramp[3]);
  if (front) { p.px(x - 2, y - ry + 1, BRZ[5]); p.px(x - 1, y - ry + 1, BRZ[5]); p.px(x + 2, y - 1, VER[2]); }
  if (RS > 1) {
    // Handfein: Glanzbogen auf der Kuppel, Glanzpunkt, Nieten an den Schienen, Kratzer, Grünspan mit hellem Rand
    // (die Kuppel liegt vorn halb unter dem Bart: Glanzbogen reicht bis oben rechts, Nieten an beiden Enden)
    for (let a = 3.3; a < 5.3; a += 0.07) p.cdot(x - 1 + Math.cos(a) * (rx - 2.2), y - 1.8 + Math.sin(a) * (ry - 2.4), front ? (a > 3.9 && a < 4.9 ? '#fff4d0' : BRZ[5]) : ramp[3]);
    p.cdot(x - 2.5, y - ry + 1.5, front ? '#ffffff' : ramp[3]);
    for (let l = 0; l <= 2; l++) { rivet(p, x - rx + 2.2 + l * 0.6, y + 1 + l * 2.6, !front); if (front) rivet(p, x + rx - 3.4 - l * 0.4, y + 0.6 + l * 2.6, true); }
    if (front) {
      p.fline(x + 1, y - 2.5, x + 3, y - 1.5, BRZ[2]); p.fline(x - 3.5, y - 0.5, x - 2, y + 0.5, BRZ[2]);
      p.cdot(x + 2, y - 1, VER[4]);
    }
  }
}

// Kopf: ausgedörrter Schädel in Dreiviertelansicht, Blick nach rechts. Klare Formen statt
// Rauschen: heller Brauenwulst mit tiefem Schatten darunter, zwei Augenhöhlen mit
// Geisterlicht, Nasenrücken und Wangenknochen im Licht, eingefallene Wange, Zahnreihe.
// o = dunkle Kontur, 0–4 Haut (dunkel → hell), V Höhle, G/F Geisterauge (Kern/Rand), T/t Zähne.
// Gibt eine Funktion zurück, die den Bart zeichnet (kommt vor Brust und Schulter).
// Mumienhaut nur fürs Gesicht: dunkles, warmes Grau-Braun wie altes Leder, kühle Schatten.
// Lesbar über Helligkeit (Stirn und Wangenknochen im Licht, Höhlen schwarz), nicht über Farbe.
const MUMMY = ['#131118', '#2e2522', '#4f3f33', '#7e6850', '#ac9572'];
const FACE = [
  //            0123456789ABCDEF
  [0, '...o122221o...'],
  [1, '..o12233332o..'],
  [2, '.o1223344433o.'],
  [3, 'o122334444443o'],
  [4, 'o1223344444443'],
  [5, 'o1223444444444'],
  [6, 'o122100003400o'],
  [7, 'o122VVGVV34VGo'],
  [8, 'o122VVVVV34VV3o'],
  [9, 'o12344412344443o'],
  [10, 'o1122111oooooo'],
  [11, '.o11oTtTtTo..'],
  [12, '..o1oooooo...'],
];
const EYE_PT = '#e6f1ff';
const JAW = [
  [0, '..o12tTtTt1o..'],
  [1, '...o122221o...'],
  [2, '....o1111o....'],
];
function head(p, g, hx, hy, P, meta, gy) {
  const j = Math.round(P.jaw * 3);
  const t = P.capeT;
  const lit = P.eye > 0.1;
  // Hinteres Geweih (dunkler)
  if (P.crown < 0.02) antler(p, g, hx + 3, hy + 1, -1, P, false);
  // Haar: drei weiche Strähnenbüschel hinter dem Kopf, gebogen und verjüngt
  const hairC = [
    { x: hx + 1.5, y: hy + 4, len: 17, w: 2.2, bend: -5 - P.cape * 3, ph: 0.3 },
    { x: hx + 3, y: hy + 5, len: 14, w: 2, bend: -4 - P.cape * 3, ph: 1.7 },
    { x: hx + 4.5, y: hy + 6, len: 11, w: 1.8, bend: -3 - P.cape * 2, ph: 2.9 },
  ];
  for (const c of hairC) clump(p, c, t, 0, HAIR_OUT, true);
  for (const c of hairC) clump(p, c, t, 0, HAIR_T, false);
  const put = (rows, oy) => {
    for (const [y, s] of rows) for (let x = 0; x < s.length; x++) {
      const ch = s[x];
      if (ch === '.') continue;
      let c;
      if (ch >= '0' && ch <= '4') c = MUMMY[+ch];
      else if (ch === 'o' || ch === 'V') c = VOID;
      else if (ch === 'T') c = ANT[3];
      else if (ch === 't') c = ANT[2];
      else if (ch === 'G') c = lit ? EYE_PT : MUMMY[1];
      p.px(hx + x, hy + oy + y, c);
    }
  };
  put(FACE, 0);
  // Mund: Kiefer klappt auf, dahinter Schwärze mit Geisterlicht
  if (j) {
    for (let k = 0; k < j; k++) { p.rect(hx + 4, hy + 13 + k, 7, 1, VOID); p.px(hx + 3, hy + 13 + k, SKIN[1]); p.px(hx + 11, hy + 13 + k, VOID); }
    g.px(hx + 8, hy + 13 + Math.floor(j / 2), P.jaw > 0.6 ? 2 : 1);
    g.epx(hx + 8, hy + 13, 3); if (j > 1) g.epx(hx + 7, hy + 14, 3);
  }
  put(JAW, 13 + j);
  if (RS > 1) faceFine(p, g, hx, hy, j, lit);
  const ly = hy + 14 + j;
  if (lit) {
    const e = P.eye;
    // Leuchthof um beide Höhlen (dunkel, damit der Kern hell heraussticht)
    // Augen: blasse weißblaue Punkte (im Grundbild). Leuchten nur als schwacher weißer
    // Schein auf dem Punkt selbst (kein türkiser Hof); Phase 2: kalter Hof in der Höhle.
    g.apx(hx + 6, hy + 7, 4); g.apx(hx + 12, hy + 7, 4);
    g.epx(hx + 6, hy + 7, 4); g.epx(hx + 12, hy + 7, 4); g.epx(hx + 5, hy + 7, 1); g.epx(hx + 7, hy + 7, 1); g.epx(hx + 11, hy + 7, 1);
    // Phase 2: lange Flammenfahne nach hinten
    for (let k = 1; k <= 8; k++) {
      const x = hx + 5 - k * 1.2 - P.cape * k * 0.2, y = hy + 6 - k * 0.7 + Math.sin(t * 2 + k * 0.8) * 0.7;
      g.epx(x, y, k < 3 ? 4 : k < 6 ? 3 : 2);
      if (k < 5) g.epx(x, y + 1, 2);
    }
  }
  meta.eye = { x: hx + 6, y: hy + 7 };
  meta.mouth = { x: hx + 9, y: hy + 13 + Math.floor(j / 2) };
  // Bronzereif mit Geweih
  if (P.crown < 0.02) {
    crownBand(p, g, hx, hy + 1, 0);
    antler(p, g, hx + 8, hy + 1, 1, P, true);
  } else {
    const cx = hx + P.crown * 10, cy = hy + 1 + (gy - 3 - hy - 1) * Math.min(1, P.crown * P.crown);
    crownBand(p, g, cx, cy, P.crown);
  }
  meta.head = { x: hx + 6, y: hy - 8 };
  // Bart: sechs gebogene Büschel unterschiedlicher Länge, die sich überlappen und zur Spitze
  // verjüngen; gemeinsame dunkle Außenkontur, innen nur weiche Rillen (drei Töne).
  return () => {
    const y0 = ly - 1, bl = P.beard;
    const C = [
      { x: hx + 11, y: y0, len: 11, w: 1.8, bend: -2 - bl * 3, arc: 1.6, ph: 2.0, back: true },
      { x: hx + 3.5, y: y0, len: 14, w: 1.9, bend: -1 - bl * 4, arc: -2, ph: 0.5, back: true },
      { x: hx + 12, y: y0 - 1, len: 7, w: 1.4, bend: -1 - bl * 2, arc: 1.2, ph: 3.1 },
      { x: hx + 9.5, y: y0, len: 16, w: 2.3, bend: -4 - bl * 5, arc: 1.8, ph: 1.4 },
      { x: hx + 5, y: y0, len: 17, w: 2.3, bend: -1 - bl * 5, arc: -1.6, ph: 0.8 },
      { x: hx + 7.5, y: y0, len: 20, w: 2.6, bend: -3 - bl * 6, arc: 0.9, ph: 0.1 },
    ];
    for (const c of C) clump(p, c, t, 1, BEARD_OUT, true);
    for (const c of C) clump(p, c, t, 1, c.back ? BEARD_BK : BEARD_FR, false);
    // Bartspange aus Bronze auf dem langen Mittelbüschel
    const m = C[5], k = 5, cx = Math.round(m.x + clumpX(m, t, 1, k)), cy = m.y + k;
    p.rect(cx - 2, cy, 4, 2, BRZ[3]); p.px(cx - 2, cy, BRZ[5]); p.px(cx + 1, cy + 1, BRZ[1]); p.px(cx - 3, cy, BRZ[0]); p.px(cx + 2, cy, BRZ[0]); p.px(cx - 3, cy + 1, BRZ[0]); p.px(cx + 2, cy + 1, BRZ[0]);
  };
}

// Handfein (Feinraster): das Gesicht bleibt die Pixelkarte (ganze Zellen), einzelne Texel veredeln es:
// harte Brauenkante über tiefem Schatten, Augen mit weißem Kern und Glanzpunkt, Nasenrücken-Licht und Nasenloch,
// Wangenknochen im Licht, Lippenkante und Mundwinkel, spitze Zähne mit Glanz, Kinnlicht.
const MUMMY_HI = '#c9b38c';
function faceFine(p, g, hx, hy, j, lit) {
  const fp = (c, r, sx, sy, cl) => p.set((hx + c) * RS + sx, (hy + r) * RS + sy, cl);
  // Brauenkante (nah und fern), darunter Schatten
  for (let c = 4; c <= 8; c++) { fp(c, 5, 0, 1, c === 4 ? MUMMY[4] : MUMMY_HI); fp(c, 5, 1, 1, MUMMY_HI); fp(c, 6, 0, 0, VOID); fp(c, 6, 1, 0, VOID); }
  fp(11, 5, 0, 1, MUMMY_HI); fp(11, 5, 1, 1, MUMMY_HI); fp(12, 5, 0, 1, MUMMY[4]);
  // Stirnfalte unter dem Reif
  for (let c = 7; c <= 9; c++) { fp(c, 4, 1, 1, MUMMY[3]); if (c < 9) fp(c + 1, 4, 0, 1, MUMMY[3]); }
  // Augen: größer und heller als die alte Zelle – Frostkern (ganze Zelle hell, Glanzpunkt oben links) mit blassblauem
  // Frostsaum rundum in der Höhle; Höhlenboden als dunkle Lidkante
  for (let c = 4; c <= 8; c++) { fp(c, 8, 0, 1, MUMMY[1]); fp(c, 8, 1, 1, MUMMY[1]); }
  if (lit) {
    const CORE = '#e4f6ff', FR1 = '#a8caee', FR2 = '#7aa2d2';
    fp(6, 7, 0, 0, '#ffffff'); fp(6, 7, 1, 0, CORE); fp(6, 7, 0, 1, CORE); fp(6, 7, 1, 1, EYE_PT);
    fp(5, 7, 1, 0, FR1); fp(5, 7, 1, 1, FR2); fp(7, 7, 0, 0, FR1); fp(7, 7, 0, 1, FR2);
    fp(6, 8, 0, 0, FR2); fp(6, 8, 1, 0, FR2); fp(6, 6, 0, 1, '#3c5470'); fp(6, 6, 1, 1, '#3c5470');
    fp(12, 7, 0, 0, '#ffffff'); fp(12, 7, 1, 0, CORE); fp(12, 7, 0, 1, CORE); fp(12, 7, 1, 1, FR1);
    fp(11, 7, 1, 0, FR1); fp(11, 7, 1, 1, FR2); fp(12, 8, 0, 0, FR2);
    g.tapx((hx + 6) * RS, (hy + 7) * RS, 4); g.tepx((hx + 6) * RS, (hy + 7) * RS, 4);
  }
  // Nasenrücken-Licht, Nasenspitze, Nasenloch
  for (let r = 6; r <= 8; r++) { fp(10, r, 0, 0, MUMMY_HI); fp(10, r, 0, 1, MUMMY_HI); fp(10, r, 1, 1, MUMMY[3]); }
  fp(10, 9, 0, 0, MUMMY_HI); fp(10, 9, 1, 1, MUMMY[1]); fp(9, 9, 1, 1, MUMMY[2]);
  // Wangenknochen im Licht
  fp(4, 9, 1, 0, MUMMY_HI); fp(5, 9, 0, 0, MUMMY_HI); fp(5, 9, 1, 0, MUMMY_HI); fp(6, 9, 0, 0, MUMMY_HI);
  fp(11, 9, 0, 0, MUMMY_HI); fp(11, 9, 1, 0, MUMMY_HI); fp(12, 9, 0, 0, MUMMY_HI);
  // Lippenkante (eingetrocknet, über den Zähnen) und Mundwinkel
  for (let c = 5; c <= 7; c++) { fp(c, 10, 0, 0, MUMMY[2]); fp(c, 10, 1, 0, MUMMY[2]); }
  fp(4, 10, 1, 1, VOID); fp(3, 11, 1, 0, VOID);
  // Zähne oben: geschlossene Reihe, nur die kleinen Zähne laufen spitz zu (Lücke unten rechts), Glanz auf den großen
  for (let c = 5; c <= 9; c++) {
    const big = (c - 5) % 2 === 0;
    fp(c, 11, 0, 0, big ? '#ece0c0' : ANT[3]); fp(c, 11, 1, 0, big ? ANT[3] : ANT[2]);
    fp(c, 11, 0, 1, big ? ANT[3] : ANT[2]); fp(c, 11, 1, 1, big ? ANT[2] : VOID);
  }
  // Zähne unten: nach oben spitz
  const jr = 13 + j;
  for (let c = 5; c <= 9; c++) {
    const big = (c - 5) % 2 === 1;
    fp(c, jr, 0, 0, big ? '#f2e8cc' : ANT[2]); fp(c, jr, 1, 0, VOID);
    fp(c, jr, 0, 1, big ? ANT[3] : ANT[2]); fp(c, jr, 1, 1, big ? ANT[2] : ANT[1]);
  }
  // Kinnlicht
  for (let c = 5; c <= 7; c++) fp(c, jr + 1, c === 5 ? 1 : 0, 0, MUMMY[3]);
  fp(6, jr + 1, 1, 0, MUMMY[3]);
}

// Haar-/Bartbüschel: Mittellinie biegt sich zur Seite (bend), bauscht sich (arc), schwingt leicht,
// Breite schwillt in Wellen an und läuft spitz aus. outline = nur dunkle Kontur (1 px breiter),
// sonst flache Töne [Rille, Grund, Licht]: Licht links, Rille rechts, Spitze im Grundton.
const BEARD_OUT = '#24221d';
// [Rille, Grund, Licht, Lichtsträhne (nur fein)]
const BEARD_FR = ['#5c5950', '#938d80', '#c4bead', '#e2ddcf'];
const BEARD_BK = ['#403e37', '#69655b', '#8c877b', '#a9a497'];
const HAIR_OUT = '#171614';
const HAIR_T = ['#33322d', '#4f4d46', '#77736a', '#918c81'];
function clumpX(c, t, sway, k) {
  const u = k / c.len;
  return c.bend * u * u + (c.arc ?? 0) * Math.sin(u * Math.PI) + Math.sin(t * 1.3 + k * 0.35 + c.ph) * 0.6 * u * sway;
}
function clump(p, c, t, sway, ramp, outline) {
  if (RS > 1) { clumpFine(p, c, t, sway, ramp, outline); return; }
  for (let k = 0; k <= c.len; k++) {
    const u = k / c.len;
    const w = c.w * (1 - u * u) * (1 + 0.22 * Math.sin(k * 0.7 + c.ph * 2)) + 0.35;
    const cx = c.x + clumpX(c, t, sway, k), y = c.y + k;
    const xl = Math.round(cx - w), xr = Math.max(xl, Math.round(cx + w));
    if (outline) { for (let x = xl - 1; x <= xr + 1; x++) p.px(x, y, ramp); if (k === c.len) p.px(Math.round(cx), y + 1, ramp); continue; }
    const lw = Math.max(1, Math.round((xr - xl) * 0.35));
    for (let x = xl; x <= xr; x++) {
      let col = ramp[1];
      if (u < 0.8 && x < xl + lw) col = ramp[2];
      if (x === xr && xr - xl >= 2) col = ramp[0];
      p.px(x, y, col);
    }
  }
}
// fein: Breite und Biegung je Texelzeile (glatte Ränder, spitz auslaufend), Kontur 1 Texel, dazu Strähnen:
// eine Rille in der Mitte und eine helle Strähne im Licht, die der Biegung folgen.
function clumpFine(p, c, t, sway, ramp, outline) {
  const Y0 = Math.round(c.y * RS), N = (c.len + 1) * RS;
  const v = outline ? col(ramp) : 0;
  const v0 = outline ? 0 : col(ramp[0]), v1 = outline ? 0 : col(ramp[1]), v2 = outline ? 0 : col(ramp[2]), v3 = outline ? 0 : col(ramp[3]);
  const gp = 0.56 + 0.08 * Math.sin(c.ph * 3);
  let cx = c.x;
  for (let r = 0; r < N; r++) {
    const k = Math.max(0, Math.min(c.len, (r + 0.5) / RS - 0.5)), u = k / c.len;
    const w = c.w * (1 - u * u) * (1 + 0.22 * Math.sin(k * 0.7 + c.ph * 2)) + 0.35;
    cx = c.x + clumpX(c, t, sway, k);
    const L = Math.round((cx - w) * RS), R = Math.max(L, Math.round((cx + w + 1) * RS) - 1), Y = Y0 + r;
    if (outline) { for (let X = L - 1; X <= R + 1; X++) p.setv(X, Y, v); continue; }
    const n = R - L, lw = Math.max(1, Math.round(n * 0.35));
    const gx = n >= 5 && u < 0.88 ? L + Math.round(n * gp) : -1, hx = n >= 6 && u < 0.7 ? L + Math.max(1, Math.round(n * 0.18)) : -1;
    for (let X = L; X <= R; X++) {
      let q = u < 0.8 && X < L + lw ? v2 : v1;
      if (X === R && n >= 2 * RS) q = v0;
      if (X === gx) q = v0;
      else if (X === hx) q = v3;
      p.setv(X, Y, q);
    }
  }
  if (outline) p.setv(Math.round((cx + 0.5) * RS), Y0 + N, v);
}

// Krone: Bronzereif mit hellem Goldglanz und dunkler Unterkante, drei hohe Zacken.
const GOLD = ['#2a1a08', '#6e4c18', '#b48a3a', '#e2c070', '#fff0c0'];
function crownBand(p, g, x, y, fall) {
  const tilt = fall * 0.45;
  for (let i = -1; i < 14; i++) {
    const yy = y + Math.round(i * tilt) + (i < 3 ? -1 : 0);
    p.px(x + i, yy - 2, GOLD[0]);
    p.px(x + i, yy - 1, i < 6 ? GOLD[4] : GOLD[3]);
    p.px(x + i, yy, i < 5 ? GOLD[3] : GOLD[2]);
    p.px(x + i, yy + 1, GOLD[1]); p.px(x + i, yy + 2, GOLD[0]);
    if (i % 4 === 2) p.px(x + i, yy, VER[2]);
    if (RS > 1) {
      // Handfein: Glanzlinie oben auf dem Reif, Perlschnur auf der Unterkante, Grünspan mit hellem Rand
      p.sub(x + i, yy - 1, 0, 0, i < 6 ? '#fffbe6' : GOLD[4]); p.sub(x + i, yy - 1, 1, 0, i < 4 ? '#fffbe6' : GOLD[4]);
      p.sub(x + i, yy + 1, 0, 0, GOLD[2]);
      if (i % 4 === 2) { p.sub(x + i, yy, 0, 0, VER[4]); p.sub(x + i, yy, 1, 1, VER[0]); }
      if (i === 0 || i === 7 || i === 13) { p.sub(x + i, yy, 0, 0, '#fff4c8'); p.sub(x + i, yy, 1, 0, GOLD[4]); p.sub(x + i, yy, 1, 1, GOLD[0]); }
    }
  }
  // Zacken (3 px hoch, links hell, rechts Schatten)
  for (const dx of [1, 5, 9, 12]) {
    const by = y - 2 + Math.round(dx * tilt) + (dx < 3 ? -1 : 0);
    const h = dx === 5 || dx === 9 ? 3 : 2;
    for (let k = 1; k <= h; k++) { p.px(x + dx, by - k, k === h ? GOLD[4] : GOLD[3]); p.px(x + dx + 1, by - k + 1, GOLD[1]); }
    p.px(x + dx - 1, by, GOLD[0]);
    // Handfein: Zacken spitz zulaufend, Glanzpunkt an der Spitze, Lichtkante links
    if (RS > 1) { p.sub(x + dx, by - h, 1, 0, GOLD[1]); p.sub(x + dx, by - h, 0, 0, '#fffbe6'); for (let k = 1; k < h; k++) p.sub(x + dx, by - k, 0, 0, GOLD[4]); }
  }
  const gx = x + 9, gyy = y + Math.round(9 * tilt);
  p.px(gx, gyy, GH[3]); p.px(gx, gyy - 1, GH[4]); p.px(gx + 1, gyy, GH[2]);
  g.px(gx, gyy, fall > 0.9 ? 1 : 3); g.px(gx, gyy - 1, fall > 0.9 ? 1 : 4); g.px(gx + 1, gyy, fall > 0.9 ? 0 : 2); g.epx(gx, gyy - 2, 3);
  if (RS > 1) {
    // Geisterstein: Fassung, Facette, weißer Kern mit Glanzpunkt
    p.sub(gx, gyy - 1, 0, 0, '#ffffff'); p.sub(gx, gyy - 1, 1, 1, GH[3]); p.sub(gx, gyy, 1, 1, GH[1]); p.sub(gx + 1, gyy, 1, 1, GH[0]);
    p.sub(gx - 1, gyy, 1, 0, GOLD[4]); p.sub(gx - 1, gyy - 1, 1, 1, GOLD[3]);
    if (fall <= 0.9) g.sub(gx, gyy - 1, 0, 0, 4);
  }
  if (fall > 0.3) {
    // gefallene Krone: Geweihstümpfe
    for (const [dx, h] of [[2, 5], [9, 7]]) for (let k = 1; k <= h; k++) { p.px(x + dx - k * 0.4, y - 2 + Math.round(dx * tilt) - k, ANT[k === h ? 4 : 2]); p.px(x + dx + 1 - k * 0.4, y - 2 + Math.round(dx * tilt) - k, ANT[0]); }
  }
}

// Geweih: kräftige Stange mit dunkler Kante und hellem Grat, schwingt nach außen und oben.
function antler(p, g, x, y, dir, P, front) {
  const R = front ? [ANT[0], ANT[2], ANT[3], '#f8f2e0'] : [VOID, ANT[0], ANT[1], ANT[2]];
  const beam = front ? [x, y, x + 9, y - 6, x + 7, y - 23] : [x, y, x - 10, y - 6, x - 8, y - 21];
  const n = 16;
  let px0 = beam[0], py0 = beam[1];
  for (let i = 1; i <= n; i++) {
    const [bx, by] = bez(...beam, i / n);
    const w = 3.6 - (i / n) * 1.9;
    limb(p, px0, py0, bx, by, w, w, R);
    px0 = bx; py0 = by;
  }
  if (RS > 1) {
    // Handfein: Rose (Perlkranz) über dem Reif, Ringe quer über die Stange, Glanzlinie auf der Lichtseite
    let gx0 = null, gy0 = null;
    for (let i = 1; i <= n; i++) {
      const [ax, ay] = bez(...beam, (i - 1) / n), [bx, by] = bez(...beam, i / n);
      const dl = Math.hypot(bx - ax, by - ay) || 1;
      let nx = -(by - ay) / dl, ny = (bx - ax) / dl;
      if (nx + ny > 0) { nx = -nx; ny = -ny; }
      const hw = (3.6 - (i / n) * 1.9) / 2;
      if (i === 2) {
        p.fline(bx - nx * (hw + 0.6), by - ny * (hw + 0.6), bx + nx * (hw + 0.6), by + ny * (hw + 0.6), R[2]);
        for (const k of [-hw - 0.6, -hw * 0.3, hw * 0.4, hw + 0.6]) p.cdot(bx + nx * k, by + ny * k, k > 0 ? R[3] : R[0]);
      } else if (i % 2 === 1 && i > 2 && i < n * 0.8) {
        p.fline(bx - nx * (hw - 0.6), by - ny * (hw - 0.6), bx + nx * (hw - 1.1), by + ny * (hw - 1.1), R[1]);
      }
      const gx = bx + nx * (hw - 0.7), gy = by + ny * (hw - 0.7);
      if (gx0 !== null && i > 2 && i < n) p.fline(gx0, gy0, gx, gy, front ? (i < n * 0.6 ? '#ffffff' : R[3]) : R[3]);
      gx0 = gx; gy0 = gy;
    }
  }
  const tines = front ? [[0.3, 7, -2.3], [0.56, 7, -2.0], [0.8, 5, -1.25]] : [[0.36, 6, -0.95], [0.64, 6, -1.25], [0.86, 4, -1.9]];
  for (const [tt, len, a] of tines) {
    const [bx, by] = bez(...beam, tt);
    const ex = bx + Math.cos(a) * len, ey = by + Math.sin(a) * len;
    limb(p, bx, by, ex, ey, 2, 1.2, R);
    p.px(ex, ey, R[3]);
    if (RS > 1) { p.cdot(ex, ey, front ? '#ffffff' : R[3]); p.fline(bx + (ex - bx) * 0.25, by + (ey - by) * 0.25, ex - (ex - bx) * 0.15 - 0.3, ey - (ey - by) * 0.15, front ? '#ffffff' : R[3]); }
    if (front) {
      g.apx(ex, ey, 0);
      const fl = 2 + Math.round((Math.sin(P.capeT * 2 + tt * 9) * 0.5 + 0.5) * 2);
      for (let k = 1; k <= fl; k++) g.epx(ex - k * 0.3, ey - k, k === 1 ? 4 : k < fl ? 3 : 1);
    } else g.epx(ex, ey - 1, 2);
  }
  const [tx, ty] = bez(...beam, 1);
  p.px(tx, ty, R[3]);
  if (RS > 1) p.cdot(tx, ty, front ? '#ffffff' : R[3]);
  const fl = front ? 4 : 2;
  for (let k = 1; k <= fl; k++) g.epx(tx - k * 0.3, ty - k, k < 2 ? 4 : k < 4 ? 3 : 1);
}

// Umhang als geschlossene Fläche: weicher Verlauf (Licht links), zwei, drei
// breite Falten, wenige lange Fetzen am Saum. Der Saum geht in Geisterlicht über.
const CAPE_HEM = ['#10282c', '#1a4044', '#2a6460'];
function cape(p, g, tx, ty, gy, P) {
  const N = 27;
  const len0 = Math.min(58, gy - ty - 5) - P.kneel * 10;
  const tongue = (u) => {
    let t = 0;
    for (const [c, w, d] of [[0.16, 0.07, 7], [0.47, 0.06, 9], [0.8, 0.06, 6]]) t += Math.max(0, 1 - Math.abs(u - c) / w) * d;
    for (const [c, w, d] of [[0.31, 0.05, 6], [0.64, 0.05, 7]]) t -= Math.max(0, 1 - Math.abs(u - c) / w) * d;
    return t;
  };
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const sx = tx - 12 + i * 0.95;
    const top = ty + Math.abs(u - 0.45) * 4;
    const len = len0 - Math.abs(u - 0.4) * 10 + Math.sin(P.capeT + u * 3) * 2 + tongue(u);
    let lx = sx;
    for (let j = 0; j < len; j++) {
      const v = j / len;
      const x = sx - P.cape * 20 * v * v - (1 - u) * 5 * v + Math.sin(P.capeT * 1.3 + v * 3.5 + u * 2.5) * 1.6 * v;
      // Grundton: Licht von links, nach rechts und unten dunkler
      let sh = u < 0.08 ? 3.4 : 3 - u * 2.2 - v * 0.5;
      // breite Falten
      const f = Math.sin(u * Math.PI * 3.2 + v * 1.4 + P.capeT * 0.25);
      if (f > 0.72) sh += 1; else if (f < -0.78) sh -= 0.9;
      let c = CAPE[Math.max(0, Math.min(4, Math.round(sh)))];
      if (v < 0.06 && u < 0.7) c = CAPE[4];
      if (u > 0.94) c = CAPE[0];
      const hemD = len - j;
      if (hemD <= 1) c = RS > 1 ? '#3a8478' : CAPE_HEM[2];   // fein: Frostsaum heller
      else if (hemD <= 3 && v > 0.6) c = CAPE_HEM[1];
      else if (hemD <= 6 && v > 0.6) c = sh > 1.8 ? CAPE_HEM[1] : CAPE_HEM[0];
      p.px(x, top + j, c);
      if (i < N - 1) p.px(x + 1, top + j, c);   // keine Lücken zwischen den Bahnen
      lx = x;
    }
    // Geisterschimmer am Saum
    const by = top + len;
    g.apx(lx, by - 1, 1); if (i % 2 === 0) g.apx(lx, by - 2, 0);
    if (RS > 1) {
      // fein: Frostkante – heller Rand unten am Saum, Eisglitzer an jeder zweiten Bahn
      p.sub(lx, by - 1, 0, 1, '#7ad8c4'); p.sub(lx, by - 1, 1, 1, '#5cbcaa'); g.sub(lx, by - 1, 0, 1, 2);
      if (i % 2 === 1) { p.sub(lx, by - 2, 0, 1, '#4fa898'); g.sub(lx, by - 2, 0, 1, 1); }
      if (i % 4 === 2) { p.sub(lx, by - 1, 0, 0, '#c8fff0'); g.sub(lx, by - 1, 0, 0, 3); }
    }
    g.epx(lx, by - 1, 2);
    if (i % 3 === 0) {
      const fl = 1 + Math.round((Math.sin(P.capeT * 2 + i * 1.7) * 0.5 + 0.5) * 3 + hash2(i, 7, 5) * 2);
      for (let k = 0; k < fl; k++) g.epx(lx + Math.sin(k * 0.8 + i) * 0.6, by - 1 - k, k === 0 ? 3 : k < fl / 2 ? 2 : 1);
    }
  }
  if (RS > 1) {
    // Handfein: zweifarbige Falten – Lichtkante links am Faltengrat, Schattenkante rechts, dunkle Mulde. Die Linien
    // folgen den breiten Falten (gleiche Formel wie oben), Bahn u stetig.
    const at = (u, j) => {
      const len = len0 - Math.abs(u - 0.4) * 10 + Math.sin(P.capeT + u * 3) * 2 + tongue(u);
      if (j >= len - 6) return null;
      const v = j / len, sx = tx - 12 + u * (N - 1) * 0.95;
      return [sx - P.cape * 20 * v * v - (1 - u) * 5 * v + Math.sin(P.capeT * 1.3 + v * 3.5 + u * 2.5) * 1.6 * v, ty + Math.abs(u - 0.45) * 4 + j, v];
    };
    for (let j = 3; j < len0; j += 0.5) {
      for (let m = -1; m <= 2; m++) {
        for (const [ph, c] of [[0.86, CAPE[4]], [2.28, CAPE[1]], [4.71, CAPE[0]]]) {
          const vv = j / len0, u = (ph + 2 * Math.PI * m - vv * 1.4 - P.capeT * 0.25) / (Math.PI * 3.2);
          if (u < 0.06 || u > 0.9) continue;
          const q = at(u, j);
          if (!q || q[2] < 0.08) continue;
          p.cdot(q[0] + 0.25, q[1], c);
        }
      }
    }
  }
  // Kragen: Pelz / Stoffwulst über den Schultern
  for (let i = 0; i < 15; i++) {
    const x = tx - 6 + i * 0.95, top = ty - 4 + Math.abs(i - 4) * 0.5;
    for (let y = top; y < ty + 4; y++) p.px(x, y, CAPE[i < 3 ? 4 : i < 8 ? 3 : 2]);
    p.px(x, ty + 4, CAPE[1]);
    if (hash2(i, 2, 7) < 0.5) p.px(x, top - 1, CAPE[3]);
  }
}

// Phase 2: Geisterschleier, der vom Körper aufsteigt (nur Phase-2-Ebene)
function aura(g, chX, chY, gy, P) {
  const s = P.spirit;
  for (let i = 0; i < 9; i++) {
    const bx = chX - 16 + i * 4 + Math.sin(P.capeT + i) * 1.5;
    const by = gy - 8 - hash2(i, 3, 29) * 40;
    const L = (11 + hash2(i, 5, 29) * 16) * (0.6 + s * 0.6);
    for (let k = 0; k < L; k += 1) {
      const x = bx - k * 0.35 + Math.sin(P.capeT * 2 + k * 0.4 + i) * 1.2, y = by - k;
      const idx = k < L * 0.3 ? 1 : 0;
      if (hash2(i, Math.round(k), 31) < 0.75) g.epx(x, y, idx + (s > 1 ? 1 : 0));
    }
  }
}

// ---------------------------------------------------------------- Tod

// Rüstungshaufen: Schwert steckt im Boden, Umhang liegt zusammengesunken,
// Brustpanzer, Schulterschalen, Krone.
function drawPile(p, g, k) {
  const gy = AY, cx = AX + 1;
  // Maßstab-Hilfen (Z): Ellipse und Glied relativ zu (cx, gy)
  const E = (dx, dy, rx, ry, c) => p.ellipse(cx + dx * Z, gy + dy * Z, rx * Z, ry * Z, c);
  const X = (dx) => cx + dx * Z, Y = (dy) => gy + dy * Z;
  // Umhang zusammengesackt
  E(-4, -3, 15, 3.5, CAPE[1]); E(-6, -4, 10, 2.5, CAPE[2]); E(-9, -5, 4, 1.2, CAPE[3]);
  for (let i = 0; i < 10; i++) g.px(X(-16 + i * 3.2), gy - 1, hash2(i, 1, 3) < 0.5 ? 1 : 0);
  // Beinschienen
  limb(p, X(3), Y(-2), X(13), Y(-3), 5.5, 4.5, [BRZ[1], BRZ[2], BRZ[3], BRZ[4]]);
  limb(p, X(-15), Y(-2), X(-7), Y(-1), 4.5, 4, [VOID, BRZ[1], BRZ[2], BRZ[3]]);
  // Brustpanzer (liegt schräg)
  E(-1, -6, 7, 4.5, BRZ[1]); E(-1.5, -7, 6, 3.5, BRZ[2]); E(-3, -8, 3.5, 1.8, BRZ[3]);
  p.px(X(-5), Y(-9), BRZ[5]); p.px(X(2), Y(-6), VER[2]); p.px(X(3), Y(-7), VER[1]); p.px(X(-2), Y(-4), VER[2]);
  // Siegel verglimmt
  p.px(X(0), Y(-7), VER[1]); g.px(X(0), Y(-7), k < 0.5 ? 3 : 1);
  // Schulterschalen
  E(-9, -4, 4, 2.5, BRZ[2]); E(-10, -5, 2.5, 1.2, BRZ[4]);
  E(8, -4, 4, 2.5, BRZ[1]); E(7, -5, 2.5, 1.2, BRZ[3]);
  // Knochenreste / Schädel
  E(5, -9, 2.5, 2.2, SKIN[2]); p.px(X(6), Y(-9), VOID); p.px(X(4), Y(-10), SKIN[3]);
  // Schwert steckt vor dem Haufen im Boden
  runeSword(p, g, X(17), gy - 28, Math.PI / 2 + 0.08, 0);
  // Krone ist heruntergefallen
  crownBand(p, g, X(20), gy - 3, 1);
}

// ---------------------------------------------------------------- Frames

// Randlicht: kaltes Oberlicht auf den oberen/hinteren Kanten, Geisterschimmer am Rücken.
function rimLight(L) {
  const { base, ga, gb } = L, W = TW;
  // an Ort und Stelle: gelesen wird nur, ob Nachbarn leer sind (das ändert sich nicht), und das eigene Pixel.
  // Nur im belegten Bereich; außerhalb ist alles leer.
  const X0 = Math.max(1, L.x0), X1 = Math.min(W - 2, L.x1), Y0 = Math.max(1, L.y0), Y1 = Math.min(TH - 2, L.y1);
  const XS = (AX + 4) * RS, R2 = 2 * RS;
  for (let y = Y0; y <= Y1; y++) for (let x = X0, i = y * W + X0; x <= X1; x++, i++) {
    const v = base[i];
    if (!v) continue;
    const up = !base[i - W], left = !base[i - 1], right = !base[i + 1];
    if (!(up || left)) continue;
    const r = v & 255, gg = (v >> 8) & 255, b = (v >> 16) & 255;
    const lum = (r * 0.3 + gg * 0.55 + b * 0.15);
    const k = up && left ? 0.5 : up ? 0.38 : 0.3;
    const kk = lum > 150 ? k * 0.4 : k;
    const nr = Math.round(r + (RIM[0] - r) * kk), ng = Math.round(gg + (RIM[1] - gg) * kk), nb = Math.round(b + (RIM[2] - b) * kk);
    base[i] = ((255 << 24) | (nb << 16) | (ng << 8) | nr) >>> 0;
    // Geisterschimmer: Rückenkante (links), nur wo kein eigenes Glühen liegt
    if (left && x < XS && !base[i - R2] && base[i + 1] && base[i + R2] && !ga[i]) {
      ga[i] = GHc[0]; gb[i] = GHXc[0];
      if (RS > 1 && !ga[i + 1]) { ga[i + 1] = GHc[0]; gb[i + 1] = GHXc[0]; }   // fein: Schimmer ein Weltpixel breit
    }
  }
}

let finishScratch = null;
function finish(L, fx, meta, rim = true) {
  if (rim) rimLight(L); // dunkle Kontur setzt buildFrame
  const W = TW;
  // belegter Bereich = Hülle aller gesetzten Pixel (jeder Schreibzugriff markiert, keiner schreibt 0 über das Letzte)
  let x0 = L.x0, y0 = L.y0, x1 = L.x1, y1 = L.y1;
  if (x1 < 0) { x0 = y0 = 0; x1 = y1 = 1; }
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  // Zuschnitt über einen wiederverwendeten Zwischenpuffer (putImageData kopiert ohnehin)
  const n = cw * ch;
  if (!finishScratch || finishScratch.length < n) finishScratch = new Uint32Array(Math.max(n, (finishScratch?.length ?? 0) * 1.25 | 0));
  const crop = (buf) => {
    const d = finishScratch;
    for (let y = 0; y < ch; y++) d.set(buf.subarray((y + y0) * W + x0, (y + y0) * W + x0 + cw), y * cw);
    return d.subarray(0, n);
  };
  const toCanvas = (buf) => {
    const c = makeCanvas(cw, ch), d = crop(buf);
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(d.buffer, 0, n * 4), cw, ch), 0, 0);
    return c;
  };
  let f;
  if (RS === 1) {
    const baseC = toCanvas(L.base);
    f = buildFrame(cw, ch, AX - x0, AY - y0, (pc) => pc.ctx.drawImage(baseC, 0, 0), { res: 1 });
  } else {
    // fein: Umriss 1 Texel (Oberkante im Materialton) wie buildFrame, ohne Hochskalieren
    f = new SpriteFrame(pixelsToCanvas(outlinePixels(crop(L.base), cw, ch), cw + 2, ch + 2), AX * RS - x0 + 1, AY * RS - y0 + 1, RS);
  }
  f.glow = new GlowFrame(toCanvas(L.ga), AX * RS - x0, AY * RS - y0, RS);
  f.glowEnraged = new GlowFrame(toCanvas(L.gb), AX * RS - x0, AY * RS - y0, RS);
  f.meta = {};
  for (const k in meta) f.meta[k] = { dx: Math.round(meta[k].x - AX), dy: Math.round(meta[k].y - AY) };
  f.fx = fx ?? null;
  return f;
}

function frame(P, extra = {}) {
  const L = Layers.get();
  const meta = drawUlgrim(new Pen(L), new GlowPen(L), P, extra);
  return finish(L, extra.fx, meta);
}

// Zerfall zu Staub: der kniende Körper löst sich von oben nach unten auf,
// Staub steigt auf, zurück bleiben Rüstung, Schwert und Krone.
function dissolveFrame(P, k) {
  const Lb = Layers.get(1);
  drawUlgrim(new Pen(Lb), new GlowPen(Lb), P, {});
  rimLight(Lb);
  const L = Layers.get(0);
  const pile = Math.min(1, k * 1.6);
  if (pile > 0.05) drawPile(new Pen(L), new GlowPen(L), k);
  const top = 95, W = TW;
  // Zerfall je Weltpixel (fein: ganze Zellen zerfallen/fliegen, kein Sprenkel je Texel)
  for (let y = Lb.y0; y <= Lb.y1; y++) for (let x = Lb.x0; x <= Lb.x1; x++) {
    const i = y * W + x;
    const v = Lb.base[i];
    if (!v && !Lb.ga[i]) continue;
    const wx = RS === 1 ? x : Math.floor(x / RS), wy = RS === 1 ? y : Math.floor(y / RS);
    const h = Math.max(0, Math.min(1, (AY - wy) / top));
    const thr = (1 - h) * 0.72 + hash2(wx, wy, 51) * 0.28;
    if (k < thr) {
      // noch da; knapp vor der Zerfallskante hell glimmend
      if (v) L.base[i] = v;
      L.ga[i] = Lb.ga[i]; L.gb[i] = Lb.gb[i];
      if (k > thr - 0.07 && v) { L.ga[i] = GHc[hash2(wx, wy, 5) < 0.5 ? 1 : 2]; L.gb[i] = GHXc[2]; }
      L.mark(x, y);
    } else if (v && k - thr < 0.3 && hash2(wx, wy, 52) < 0.35) {
      // Staubkorn steigt auf und treibt nach hinten
      const age = (k - thr) / 0.3;
      const nx = Math.round(wx - age * (4 + hash2(wx, wy, 53) * 10)), ny = Math.round(wy - age * (8 + hash2(wx, wy, 54) * 16));
      if (nx < 0 || ny < 0 || nx >= W / RS || ny >= TH / RS) continue;
      const X = nx * RS + x - wx * RS, Y = ny * RS + y - wy * RS, j = Y * W + X;
      const c = age < 0.4 ? '#a89c86' : age < 0.7 ? '#6e665a' : '#48443e';
      if (!L.base[j]) L.base[j] = col(c);
      if (hash2(wx, wy, 55) < 0.4) { L.ga[j] = GHc[age < 0.5 ? 2 : 1]; L.gb[j] = GHXc[age < 0.5 ? 3 : 1]; }
      L.mark(X, Y);
    }
  }
  return finish(L, null, {
    head: { x: AX + 5, y: AY - 40 }, chest: { x: AX, y: AY - 11 }, hand: { x: AX + 19, y: AY - 27 },
    tip: { x: AX + 24, y: AY }, eye: { x: AX + 8, y: AY - 13 }, mouth: { x: AX + 8, y: AY - 12 },
    cast: { x: AX, y: AY - 13 }, blade: { x: AX + 24, y: AY - 13 },
  }, false);
}

function track(keys, n, { loop = false, extras = {} } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = loop ? i / n : n === 1 ? 1 : i / (n - 1);
    out.push(frame(sample(keys, t), extras[i] ?? {}));
  }
  return out;
}

export function createUlgrimSprites() {
  setRes(fineRes());
  // --- Grundposen: Schwert in beiden Händen, Spitze schräg nach vorn unten
  const idleA = pose({ capeT: 0, sw: 0.32 });
  const idleB = pose({ hipY: 1, lean: 0.1, hFy: 17, sw: 0.36, capeT: Math.PI, headY: 1, jaw: 0.15, beard: 0.15, eye: 0.8 });

  // Gehen: schwere, schleppende Schritte eines alten Königs
  const walkKeys = [];
  for (let i = 0; i <= 10; i++) {
    const ph = (i / 10) * Math.PI * 2, s = Math.sin(ph), c = Math.cos(ph);
    walkKeys.push([i / 10, pose({
      hipX: 1, hipY: Math.abs(c) * -1.4 + 1.2, lean: 0.13 + Math.abs(s) * 0.03,
      fFx: 3 + s * 8, fFy: Math.max(0, -c) * 3, fBx: -4 - s * 8, fBy: Math.max(0, c) * 3,
      hFx: 10 + s * 1.2, hFy: 15 - Math.abs(s) * 0.8, sw: 0.5 + s * 0.05,
      cape: 0.5, capeT: ph, head: s * 0.4, headY: Math.abs(c) * 0.7, beard: 0.3,
    }), linear]);
  }

  // Schlafend: gebeugt, beide Hände auf dem Knauf, Klinge im Boden
  const dorm = pose({ lean: 0.2, hipY: 1, bow: 1.5, head: 1.5, headY: 2, hFx: 11, hFy: 11, sw: Math.PI / 2 - 0.05, eye: 0.15, cape: 0, beard: 0, jaw: 0 });
  const rise = pose({ lean: 0.02, hipY: 0, hFx: 12, hFy: 9, sw: Math.PI / 2 - 0.3, eye: 1, head: 0, headY: -1, beard: 0.2, cape: 0.3 });
  const roarP = pose({ lean: -0.22, hipY: 1, hFx: 13, hFy: -12, sw: -1.3, grip: 0, hBx: -14, hBy: -4, cast: 0.6, jaw: 1, head: -1, headY: -2, cape: 0.9, capeT: 2, beard: 0.9, fFx: 10, fBx: -10, spirit: 1.4 });

  // Schwungschlag: weit hinter die Schulter ausholen, flacher Bogen nach vorn
  const sw1 = pose({ lean: -0.06, hipX: -1, hFx: -2, hFy: -2, sw: -2.3, jaw: 0.3, fFx: 9, fBx: -9, cape: 0.3, beard: 0.2 });
  const sw2 = pose({ lean: -0.2, hipX: -2, hipY: 2, hFx: -7, hFy: -6, sw: -2.8, jaw: 0.7, fFx: 10, fBx: -10, cape: 0.4, beard: 0.3, eye: 1.2 });
  const sl1 = pose({ lean: 0.18, hipX: 2, hipY: 2, hFx: 15, hFy: -2, sw: -0.55, jaw: 1, fFx: 12, fBx: -11, cape: 0.8, capeT: 1, beard: 0.6 });
  const sl2 = pose({ lean: 0.38, hipX: 4, hipY: 4, hFx: 17, hFy: 10, sw: 0.6, jaw: 1, fFx: 13, fBx: -12, cape: 1, capeT: 2, beard: 0.8 });
  const sl3 = pose({ lean: 0.34, hipX: 3, hipY: 4, hFx: 13, hFy: 15, sw: 1.1, jaw: 0.5, fFx: 13, fBx: -12, cape: 0.6, capeT: 3, beard: 0.5 });
  const sl4 = pose({ lean: 0.12, hipX: 1, hipY: 1, hFx: 10, hFy: 16, sw: 0.45, jaw: 0.1, fFx: 10, fBx: -9, cape: 0.3, capeT: 4, beard: 0.2 });

  // Rückhand (Kombo): Schwung zurück von unten vorn nach hinten oben
  const bk1 = pose({ lean: 0.3, hipX: 3, hipY: 4, hFx: 12, hFy: 16, sw: 1.2, fFx: 13, fBx: -12, cape: 0.5, beard: 0.4 });
  const bk2 = pose({ lean: 0.05, hipX: 1, hipY: 1, hFx: 8, hFy: 2, sw: -0.4, jaw: 0.9, fFx: 11, fBx: -10, cape: 0.9, capeT: 2, beard: 0.7 });
  const bk3 = pose({ lean: -0.16, hipX: -1, hipY: 1, hFx: 1, hFy: -8, sw: -1.9, jaw: 0.6, fFx: 10, fBx: -10, cape: 0.8, capeT: 3, beard: 0.6 });
  const bk4 = pose({ lean: -0.08, hipY: 1, hFx: 4, hFy: -4, sw: -1.6, jaw: 0.3, fFx: 9, fBx: -9, cape: 0.4, capeT: 4, beard: 0.3 });

  // Grabspalter: Schwert über den Kopf, senkrecht nach vorn in den Boden
  const ch1 = pose({ lean: -0.1, hFx: 3, hFy: -14, sw: -1.9, jaw: 0.4, fFx: 9, fBx: -9, beard: 0.2 });
  const ch2 = pose({ lean: -0.24, hipY: -1, hFx: 0, hFy: -18, sw: -2.4, jaw: 0.9, fFx: 10, fBx: -10, fBy: 1, cape: 0.3, beard: 0.4, eye: 1.2 });
  const cl1 = pose({ lean: 0.28, hipY: 3, hFx: 16, hFy: -4, sw: -0.5, jaw: 1, fFx: 12, fBx: -11, cape: 0.9, beard: 0.7 });
  const cl2 = pose({ lean: 0.5, hipY: 8, hFx: 18, hFy: 11, sw: 0.95, jaw: 1, fFx: 13, fBx: -12, cape: 1, capeT: 1, beard: 0.9 });
  const cl3 = pose({ lean: 0.46, hipY: 7, hFx: 17, hFy: 12, sw: 1.0, jaw: 0.6, fFx: 13, fBx: -12, cape: 0.5, capeT: 2, beard: 0.5 });
  const cl4 = pose({ lean: 0.2, hipY: 3, hFx: 12, hFy: 15, sw: 0.7, jaw: 0.2, fFx: 11, fBx: -10, cape: 0.2, capeT: 3 });

  // Sprung-Stampfer: tief in die Knie, hoch, Schwert mit der Spitze voran in den Boden
  const lp1 = pose({ lean: 0.35, hipY: 7, hFx: 6, hFy: 12, sw: 2.2, fFx: 10, fBx: -10, cape: 0.2, beard: 0.1, jaw: 0.5 });
  const lp2 = pose({ lean: 0.42, hipY: 9, hFx: 2, hFy: 14, sw: 2.5, fFx: 11, fBx: -11, cape: 0.1, jaw: 0.8, eye: 1.2 });
  const air = pose({ lean: -0.05, hipY: -3, hFx: 6, hFy: -15, sw: -1.7, fFx: 5, fFy: 6, fBx: -9, fBy: 9, cape: 1.2, capeT: 1, beard: 1, jaw: 1 });
  const airB = pose({ ...air, capeT: 3, hFy: -16, sw: -1.75, beard: 1.1 });
  const ld1 = pose({ lean: 0.45, hipY: 9, hFx: 15, hFy: 12, sw: Math.PI / 2 - 0.1, fFx: 12, fBx: -12, cape: 0.8, capeT: 2, jaw: 1, beard: 0.6 });
  const ld2 = pose({ lean: 0.52, hipY: 10, hFx: 14, hFy: 14, sw: Math.PI / 2 - 0.05, fFx: 12, fBx: -12, cape: 0.3, capeT: 3, jaw: 0.6, beard: 0.3 });
  const ld3 = pose({ lean: 0.24, hipY: 3, hFx: 12, hFy: 14, sw: 1.1, fFx: 10, fBx: -10, cape: 0.2, capeT: 4, jaw: 0.2 });

  // Beschwörung: Schwert in den Boden, freie Hand gen Himmel
  const su1 = pose({ lean: 0.08, hFx: 12, hFy: 12, sw: Math.PI / 2 - 0.1, grip: 0, hBx: -8, hBy: -4, cast: 0.5, jaw: 0.4, cape: 0.3 });
  const su2 = pose({ lean: -0.14, hipY: -1, hFx: 12, hFy: 11, sw: Math.PI / 2 - 0.1, grip: 0, hBx: -6, hBy: -20, cast: 1, jaw: 1, head: -1, headY: -1, cape: 0.6, capeT: 2, beard: 0.4, eye: 1.3 });
  const su3 = pose({ ...su2, hipY: 2, lean: 0.12, hBx: 2, hBy: 6, cast: 0.8, capeT: 3, jaw: 0.8 });

  // Geisterheulen: Kopf zurück, Kiefer weit auf, Arme ausgebreitet
  const hw1 = pose({ lean: 0.2, hipY: 2, hFx: 8, hFy: 18, sw: 0.9, grip: 0, hBx: 0, hBy: 14, jaw: 0.3, head: 1, headY: 1, cape: 0.2 });
  const hw2 = pose({ lean: -0.3, hipY: 1, hFx: 15, hFy: 3, sw: 1.3, grip: 0, hBx: -15, hBy: 0, jaw: 1, head: -2, headY: -2, cape: 1, capeT: 2, beard: 1, spirit: 1.6, eye: 1.3 });
  const hw3 = pose({ ...hw2, capeT: 4, beard: 1.2, hFy: 3, hBy: 1 });

  const hurtP = pose({ lean: -0.18, hipX: -2, head: -2, headY: -1, jaw: 0.8, hFx: 7, hFy: 13, sw: 0.1, cape: 0.5, beard: 0.5 });

  // Tod: taumelt, stützt sich auf das Schwert, sinkt auf die Knie
  const d1 = pose({ lean: -0.3, hipX: -2, jaw: 1, head: -2, headY: -2, sw: -0.3, hFx: 8, hFy: 10, cape: 0.6, beard: 0.6 });
  const d2 = pose({ kneel: 0.7, lean: 0.25, jaw: 1, head: 1, hFx: 14, hFy: 10, sw: Math.PI / 2 - 0.1, eye: 0.8, beard: 0.3 });
  const d3 = pose({ kneel: 1, lean: 0.35, hipY: 1, jaw: 0.6, bow: 1.5, head: 2, headY: 3, hFx: 14, hFy: 12, sw: Math.PI / 2 - 0.08, eye: 0.3, beard: 0, cape: 0 });
  const dEnd = pose({ ...d3, eye: 0.1, jaw: 0.4 });

  const S = (a, b, rev = false) => ({ smear: [a, b], rev, power: 1 });
  const F = (a, b, rev = false) => ({ smear: [a, b], rev, power: 1, flat: 0.5 });

  return {
    idle: new Animation(track([[0, idleA], [0.5, idleB], [1, idleA]], 8, { loop: true }), 6),
    walk: new Animation(track(walkKeys, 10, { loop: true, extras: { 0: { fx: 'step' }, 5: { fx: 'step' } } }), 9),
    dormant: new Animation(track([[0, dorm], [0.5, { ...dorm, eye: 0.35, capeT: 2, headY: 2.5 }], [1, dorm]], 6, { loop: true }), 3),
    awaken: new Animation(track([
      [0, dorm], [0.18, { ...dorm, eye: 1 }], [0.42, rise], [0.6, pose({ ...roarP, jaw: 0.3, spirit: 0.6 })], [0.74, roarP, snap], [1, { ...roarP, capeT: 4 }],
    ], 16, { extras: { 11: { fx: 'roar' } } }), 8.5, false),
    roar: new Animation(track([[0, idleA], [0.3, roarP, snap], [0.8, { ...roarP, capeT: 5 }], [1, roarP]], 10, { extras: { 3: { fx: 'roar' } } }), 7.5, false),
    sweepWindup: new Animation(track([[0, idleA], [0.45, sw1], [1, sw2]], 7, { extras: { 4: { swordBehind: true }, 5: { swordBehind: true }, 6: { swordBehind: true } } }), 9, false),
    sweep: new Animation(track([[0, sl1], [0.2, sl2, snap], [0.45, sl3], [1, sl4]], 8, {
      extras: { 0: F(-2.7, -0.55), 1: { ...F(-1.6, 0.6), fx: 'impact' }, 2: F(-0.2, 1.1), 3: F(0.6, 1.15) },
    }), 15, false),
    backsweep: new Animation(track([[0, bk1], [0.22, bk2, snap], [0.45, bk3], [0.7, bk4], [1, idleA]], 9, {
      extras: { 1: { ...F(1.2, -0.4, true), fx: 'impact' }, 2: F(0.2, -1.9, true), 3: F(-0.8, -1.95, true) },
    }), 15, false),
    chopWindup: new Animation(track([[0, idleA], [0.4, ch1], [1, ch2]], 7), 9, false),
    chop: new Animation(track([[0, cl1], [0.18, cl2, snap], [0.55, cl3], [1, cl4]], 8, {
      extras: { 0: S(-2.4, -0.45), 1: { ...S(-1.2, 0.95), fx: 'impact' }, 2: S(0.2, 1.0) },
    }), 13, false),
    leapWindup: new Animation(track([[0, idleA], [0.5, lp1], [1, lp2]], 6), 10, false),
    leapAir: new Animation(track([[0, air], [0.5, airB], [1, air]], 4, { loop: true }), 8),
    leapLand: new Animation(track([[0, air], [0.12, ld1, snap], [0.4, ld2], [1, ld3]], 8, { extras: { 1: { fx: 'impact', power: 1 } } }), 12, false),
    cast: new Animation(track([[0, idleA], [0.3, su1], [0.65, su2], [1, su3]], 10, { extras: { 6: { fx: 'cast' } } }), 9, false),
    howlWindup: new Animation(track([[0, idleA], [0.6, hw1], [1, { ...hw1, hipY: 3, jaw: 0.5 }]], 6), 8, false),
    howl: new Animation(track([[0, hw1], [0.25, hw2, snap], [0.7, hw3], [1, hw2]], 8, { extras: { 2: { fx: 'roar' } } }), 10, false),
    hurt: new Animation(track([[0, hurtP], [1, idleA]], 4), 14, false),
    death: new Animation([
      ...track([[0, hurtP], [0.2, d1], [0.55, d2, snap], [0.8, d3], [1, dEnd]], 10, { extras: { 5: { fx: 'impact' } } }),
      ...[0.08, 0.18, 0.3, 0.42, 0.54, 0.66, 0.78, 0.9, 1.02, 1.2].map((k) => dissolveFrame(dEnd, k)),
    ], 7, false),
  };
}
