import { makeCanvas, flipCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame, SpriteFrame, Animation, lazyFrame } from '../gfx/Sprite.js';
import { fineRes, outlinePixels, pixelsToCanvas } from '../gfx/Fine.js';
import { hash2 } from '../core/math.js';
import { plate, bar, orb, gem, hornQ, poly, hair, inset, trace, rivet, cloth, strands, dotp } from './bossPaint.js';

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
  // Maler für sprites/bossPaint.js: Texelmitten in Weltkoordinaten abtasten, Texel am Weltpunkt setzen
  get step() { return 1 / RS; }
  each(x0, y0, x1, y1, fn) {
    const F0 = Math.max(0, Math.floor(x0 * RS)), F1 = Math.min(TW - 1, Math.ceil(x1 * RS));
    const G0 = Math.max(0, Math.floor(y0 * RS)), G1 = Math.min(YC - 1, Math.ceil(y1 * RS));
    for (let G = G0; G <= G1; G++) for (let F = F0; F <= F1; F++) { const c = fn((F + 0.5) / RS, (G + 0.5) / RS); if (c) this.setv(F, G, col(c)); }
  }
  pdot(x, y, c) { this.setv(Math.floor(x * RS), Math.floor(y * RS), col(c)); }
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

function bez(x0, y0, x1, y1, x2, y2, t) {
  const u = 1 - t;
  return [u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2];
}

// ---------------------------------------------------------------- Neuzeichnung (03.11.)
// Formen aus Platten und runden Strängen (sprites/bossPaint.js): dunkle Innenkontur zwischen den Teilen, je Material
// 5–6 harte Stufen mit Lichtkante, Kernschatten auf der abgewandten Seite, Grünspan nur an Kanten und in Mulden.

const MUMMY = ['#131118', '#2e2522', '#4f3f33', '#7e6850', '#ac9572'];
const MUMMY_HI = '#c9b38c';
const BRZD = ['#0a0705', '#1a1109', '#2e200f', '#463218', '#5e4624', '#7c6034'];
const SKN = ['#0e0b0d', '#2e2522', '#4f3f33', '#7e6850', '#ac9572', MUMMY_HI];
const SKND = ['#08070a', '#1c1716', '#2e2520', '#463a30', '#5e4e3e'];
const CLO = ['#070506', '#120e10', '#221a1c', '#342628', '#48363a'];
const CLOD = ['#040304', '#0a0809', '#140f11', '#1e1719', '#2a2022'];
const LTH = ['#0a0504', '#1a0d0b', '#3a1a12', '#5e2e1c', '#8a4828', '#ab6234'];
const LTHD = ['#060303', '#120908', '#24110c', '#3a1d12', '#56301c'];
const ANT6 = ['#120d09', '#2e261e', '#5a4c3c', '#8a7a62', '#b8a888', '#e8dec4'];
const ANTD = ['#08060a', '#1a1510', '#2e261e', '#463c30', '#5e5244'];
const BRD = ['#161512', '#403e37', '#69655b', '#938d80', '#c4bead', '#ece8de'];
const BRDB = ['#100f0d', '#2a2824', '#403e37', '#5c5950', '#787469'];
const CAP6 = ['#05080a', ...CAPE];
const GOLD = ['#2a1a08', '#6e4c18', '#b48a3a', '#e2c070', '#fff0c0'];
const GLD = ['#150c04', '#3e2a0e', '#6e4c18', '#b48a3a', '#e2c070', '#fff0c0'];
const EYE_PT = '#e6f1ff';

// Rille: dunkle Linie mit Lichtkante darunter (geprägt)
function groove(p, pts, dark, light) {
  for (let i = 0; i < pts.length - 1; i++) {
    hair(p, pts[i][0], pts[i][1] + 0.5, pts[i + 1][0], pts[i + 1][1] + 0.5, light);
    hair(p, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], dark);
  }
}
// Achsen eines Glieds: Q(s, o) = s entlang, o quer (o > 0 = zur Vorderseite rechts)
function axis(x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
  let nx = -uy, ny = ux;
  if (nx < 0) { nx = -nx; ny = -ny; }
  return { len, Q: (s, o) => [x0 + ux * s + nx * o, y0 + uy * s + ny * o] };
}

// ---------------------------------------------------------------- Runenschwert
// Blattklinge aus Bronze (zwei Facetten, die zum Licht gewandte heller), Hohlkehle mit Geisterlicht und vier Runen,
// Parierstange mit Widderhörnern, lederumwickelter Griff, Knauf mit Geisterstein.
function runeSword(p, g, hx, hy, a, power = 0) {
  const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
  const at = (u, v) => [hx + dx * u + nx * v, hy + dy * u + ny * v];
  const litSide = nx * -0.6 + ny * -0.8 > 0 ? 1 : -1;   // Seite v > 0 zum Licht?
  bar(p, ...at(-10, 0), ...at(5, 0), 3.4, 3.1, LTH);
  for (let u = -9; u < 4.5; u += 1.7) hair(p, ...at(u, -1.6), ...at(u + 0.9, 1.6), LTH[0]);
  orb(p, ...at(-12.6, 0), 3.4, 3.4, BRZ);
  { const [x, y] = at(-12.6, 0); orb(p, x, y, 1.4, 1.4, GH); g.dot(x - 0.5, y - 0.5, 4); g.ellipse(x - 0.5, y - 0.5, 1.2, 1.2, 2); }
  // Parierstange mit Widderhörnern
  hornQ(p, ...at(6.5, -3), ...at(3.5, -8.5), ...at(8.5, -10), 2.8, 1.2, BRZ, { n: 6 });
  hornQ(p, ...at(6.5, 3), ...at(3.5, 8.5), ...at(8.5, 10), 2.8, 1.2, BRZ, { n: 6 });
  plate(p, [at(4.6, -4.6), at(8.6, -3.6), at(8.6, 3.6), at(4.6, 4.6)], BRZ, { edge: 0.7 });
  { const [x, y] = at(6.6, 0); orb(p, x, y, 1.3, 1.3, GH); g.dot(x - 0.5, y - 0.5, 3); }
  // Klinge
  const L = 60, B0 = 8.5;
  const half = (u) => {
    const t = (u - B0) / (L - B0);
    if (t < 0 || t > 1) return 0;
    return t < 0.72 ? 2.9 + 2.1 * Math.sin((t / 0.72) * Math.PI * 0.5) : 5 * Math.sqrt(Math.max(0, (1 - t) / 0.28));
  };
  const mid = [], e1 = [], e2 = [];
  for (let u = B0; u <= L + 0.01; u += 1.5) { mid.push(at(u, 0)); e1.push(at(u, half(u))); e2.push(at(u, -half(u))); }
  e1.push(at(L, 0)); e2.push(at(L, 0));
  plate(p, [...mid, ...e1.slice().reverse()], BRZ, { edge: 0.8, lift: litSide > 0 ? 1 : -1, glint: false });
  plate(p, [...mid, ...e2.slice().reverse()], BRZ, { edge: 0.8, lift: litSide < 0 ? 1 : -1, glint: false });
  // geschliffene Schneide (Wate) auf der Lichtseite, Grünspan auf der Fläche
  for (let u = B0 + 1; u <= L - 2; u += 0.5) {
    const h = half(u);
    dotp(p, ...at(u, litSide * (h - 0.9)), u > 18 && u < 46 ? '#fff4d8' : BRZ[5]);
    if (hash2(Math.round(u / 2.5), 3, 41) < 0.22) dotp(p, ...at(u, -litSide * h * 0.55), VER[1 + (hash2(Math.round(u), 4, 41) < 0.4 ? 1 : 0)]);
  }
  // Hohlkehle mit Geisterlicht und Runen
  for (let u = B0 + 2; u <= L - 9; u += 0.5) {
    const [x, y] = at(u, 0);
    dotp(p, x, y, GH[1]); dotp(p, ...at(u, -litSide * 0.6), VOID); dotp(p, ...at(u, litSide * 0.6), BRZ[4]);
    g.dot(x - 0.5, y - 0.5, 1 + power * 0.6);
  }
  for (const u of [16, 24, 32, 40]) {
    const [x0, y0] = at(u - 0.4, -0.9), [x1, y1] = at(u + 1.3, 0.9), [cx, cy] = at(u + 0.45, 0);
    hair(p, x0, y0, x1, y1, GH[3]); dotp(p, cx, cy, '#ffffff');
    g.fline(x0 - 0.5, y0 - 0.5, x1 - 0.5, y1 - 0.5, 3 + power); g.dot(cx - 0.5, cy - 0.5, 4); g.edot(cx - 0.5, cy - 0.5, 4);
  }
  if (power > 0) for (let u = 18; u <= L - 1; u += 1) { const [x, y] = at(u, litSide * half(u) * 0.9); g.dot(x - 0.5, y - 0.5, u > L - 14 ? 2 : 1); }
  const [tx, ty] = at(L, 0), [mx, my] = at(36, 0);
  return { tipX: tx, tipY: ty, midX: mx, midY: my };
}

// ---------------------------------------------------------------- Rumpf
// Muskelpanzer: gewölbte Bronzeschale mit Zierrand, Brust- und Bauchfurchen, Grünspan in den Mulden, Runensiegel.
// A(s, k) in ungeschalteten Rig-Maßen (s ab Hüfte, k quer, vorn positiv).
function torso(p, g, along, P, meta) {
  const A = (list) => list.map(([s, k]) => along(s * Z, k * Z));
  const shell = A([[0, -6.6], [0, 6.2], [4, 6.9], [9, 8.6], [13, 9.9], [16.4, 9.2], [18.8, 6.4], [19.6, -1], [18.8, -7], [14.5, -8.4], [7, -7.3]]);
  plate(p, shell, BRZ, { edge: 0.9, core: 3, lift: -1 });
  trace(p, inset(shell, 1.4), BRZ[4], true, BRZ[1]);
  // Brustbogen und Mittelfurche, zwei Bauchfurchen
  groove(p, A([[12.6, -4.5], [11.4, -1], [11, 2.5], [11.6, 5.5], [12.8, 8]]), BRZ[1], BRZ[4]);
  groove(p, A([[18, 1.2], [14.5, 1.6], [11.2, 1.8]]), BRZ[1], BRZ[4]);
  groove(p, A([[8.2, -4.8], [8, 1.5], [8.4, 7.2]]), BRZ[1], BRZ[3]);
  groove(p, A([[5, -5], [4.8, 1.5], [5.2, 6.4]]), BRZ[1], BRZ[3]);
  // Glanzbogen auf der Brust (Licht von links oben)
  { const q = A([[17.6, -5.6], [16.6, -3.2], [15.2, -2.4]]); hair(p, ...q[0], ...q[1], '#fff4d0'); hair(p, ...q[1], ...q[2], BRZ[5]); }
  // Grünspan: in den Furchen und an der Unterkante
  for (let i = 0; i < 26; i++) {
    const s = 1 + hash2(i, 1, 23) * 9, k = -5 + hash2(i, 2, 23) * 12;
    const [x, y] = along(s * Z, k * Z);
    if (hash2(i, 3, 23) < 0.55) { dotp(p, x, y, VER[2]); dotp(p, x + 0.5, y, VER[1]); if (hash2(i, 4, 23) < 0.3) dotp(p, x, y - 0.5, VER[3]); }
  }
  // Runensiegel auf der Brust
  const [cx, cy] = along(SPINE * 0.62, 3.2 * Z);
  orb(p, cx, cy, 3.4, 3.4, BRZ);
  orb(p, cx + 0.2, cy + 0.2, 2.2, 2.2, VER.concat(['#c4fbee']), { glint: false });
  const pulse = P.eye;
  for (const [ox, oy] of [[0, -1.2], [-1, 0.6], [1, 0.6], [0, 0]]) { dotp(p, cx + ox, cy + oy, GH[3]); g.dot(cx + ox - 0.5, cy + oy - 0.5, 1 + 2 * pulse); }
  g.eellipse(cx - 0.5, cy - 0.5, 2.2, 2.2, 2); g.edot(cx - 0.5, cy - 0.5, 4);
  meta.chest = { x: cx, y: cy };
  // Phase 2: Risse vom Siegel, dahinter leuchten die Rippen
  const cracks = [[[0.62, 3.2], [0.72, 5], [0.82, 3.6], [0.95, 6.4]], [[0.62, 3.2], [0.46, 0], [0.34, 1]], [[0.62, 3.2], [0.74, -1.4], [0.86, -4]]];
  for (const c of cracks) for (let i = 0; i < c.length - 1; i++) {
    const [x0, y0] = along(c[i][0] * SPINE, c[i][1] * Z), [x1, y1] = along(c[i + 1][0] * SPINE, c[i + 1][1] * Z);
    g.eline(x0, y0, x1, y1, i === 0 ? 3 : 2);
    if (RS > 1) g.efline(x0 - 0.5, y0 - 0.5, x1 - 0.5, y1 - 0.5, i === 0 ? 4 : 3);
  }
}

// Lederschurz (Pteryges) über dem Tunikasaum, Gürtel mit Bronzeplatten und Geisterstein-Schnalle
function belt(p, g, hipX, hipY, P, legF) {
  const swing = (legF.jx - hipX - 5) * 0.12;
  cloth(p, [[hipX - 9, hipY - 1], [hipX + 10, hipY - 1], [hipX + 11 + swing, hipY + 11], [hipX + 1 + swing, hipY + 13], [hipX - 9.5 + swing, hipY + 11.5]], CLO, { fold: 3, phase: P.capeT * 0.3, hem: 2 });
  for (let i = 0; i < 6; i++) {
    const x0 = hipX - 10.2 + i * 3.6, len = 10 + Math.sin(i * 2.1) * 1.4 - Math.abs(i - 2.5) * 0.5;
    const sw = swing * (0.5 + i / 10) + Math.sin(P.capeT + i * 1.3) * 0.4, fan = (i - 2.5) * 0.35;
    const ramp = i < 4 ? LTH : LTHD;
    plate(p, [[x0, hipY - 0.5], [x0 + 3.4, hipY - 0.5], [x0 + 3.8 + sw + fan, hipY + len - 1.4], [x0 + 1.9 + sw + fan, hipY + len], [x0 - 0.2 + sw + fan, hipY + len - 1.4]], ramp, { edge: 0.6, glint: false, lift: i < 2 ? 1 : i > 3 ? -1 : 0 });
    hair(p, x0 + 1.7, hipY + 1, x0 + 1.8 + (sw + fan) * 0.8, hipY + len - 3, ramp[1]);
    if (i % 2 === 0) orb(p, x0 + 1.8 + sw + fan, hipY + len - 2.4, 1.3, 1.2, BRZ);
  }
  // Gürtel
  plate(p, [[hipX - 11.5, hipY - 4.4], [hipX + 11.5, hipY - 5], [hipX + 11.7, hipY - 0.8], [hipX - 11.7, hipY - 0.2]], LTH, { edge: 0.7, glint: false });
  for (const dx of [-8, -2.5]) {
    const x = hipX + dx, y = hipY - 4 - (dx + 11.5) * 0.026;
    plate(p, [[x - 1.6, y], [x + 1.6, y - 0.1], [x + 1.6, y + 3], [x - 1.6, y + 3.1]], BRZ, { edge: 0.6 });
  }
  const bx = hipX + 4.5, by = hipY - 2.8;
  orb(p, bx, by, 3.6, 3.2, BRZ);
  orb(p, bx + 0.2, by + 0.1, 1.6, 1.4, GH, { glint: false });
  dotp(p, bx - 0.4, by - 0.4, '#ffffff'); g.dot(bx - 0.9, by - 0.9, 4); g.ellipse(bx - 0.5, by - 0.5, 1.4, 1.2, 2);
}

// Bein: Hosenbein aus Leinen, Bronzebeinschiene mit Grat, Kniekachel, umwickelter Lederschuh mit Bronzekappe
function leg(p, g, hx, hy, L, back, P) {
  const cl = back ? CLOD : CLO, br = back ? BRZD : BRZ, lt = back ? LTHD : LTH;
  bar(p, hx, hy, L.jx, L.jy, 10, 8.5, cl);
  const { len, Q } = axis(L.jx, L.jy, L.ex, L.ey - 4);
  plate(p, [Q(0.5, -3.4), Q(0.5, 4), Q(len * 0.35, 4.6), Q(len, 3.2), Q(len + 0.6, -3), Q(len * 0.42, -4)], br, { edge: 0.8 });
  hair(p, ...Q(2, 1.7), ...Q(len - 1, 1.2), br[br.length - 1]); hair(p, ...Q(2, 2.3), ...Q(len - 1, 1.8), br[1]);
  if (!back) { for (let s = len * 0.55; s < len - 0.5; s += 0.5) { const w = Math.sin((s / len) * 9) * 0.6 + 1.2; dotp(p, ...Q(s, -3.1 + w * 0.3), VER[2]); dotp(p, ...Q(s, -2.6 + w * 0.3), VER[1]); } }
  rivet(p, ...Q(len * 0.3, -2.3), br); rivet(p, ...Q(len * 0.78, -2.1), br);
  // Kniekachel mit Flügel
  plate(p, [Q(-3.2, -3), Q(-4.6, 1), Q(-2.2, 5.2), Q(2.6, 5.6), Q(3.6, 1.6), Q(1.6, -3.2)], br, { edge: 0.8 });
  orb(p, ...Q(-0.4, 1.8), 2.1, 1.9, br);
  // Schuh
  const fx = L.ex, fy = L.ey;
  plate(p, [[fx - 5, fy - 5.2], [fx + 1, fy - 6], [fx + 6, fy - 4.2], [fx + 10, fy - 1.6], [fx + 10.6, fy], [fx - 5.6, fy]], lt, { edge: 0.6, glint: false });
  for (const x of [fx - 3.4, fx - 1, fx + 1.4]) hair(p, x, fy - 5.4, x + 1.4, fy - 0.6, lt[0]);
  plate(p, [[fx + 3, fy - 4.8], [fx + 6, fy - 4.1], [fx + 10, fy - 1.6], [fx + 10.6, fy], [fx + 3, fy]], br, { edge: 0.7 });
}

// Arm: Leinenärmel, Bronzearmschiene mit Band, Ellbogenkachel
function arm(p, sh, A, back) {
  const cl = back ? CLOD : CLO, br = back ? BRZD : BRZ;
  bar(p, sh.x, sh.y, A.jx, A.jy, 7.6, 6.6, cl);
  const { len, Q } = axis(A.jx, A.jy, A.ex, A.ey);
  plate(p, [Q(1.5, -3.6), Q(1.5, 3.6), Q(len - 2.4, 3.2), Q(len - 1.4, -3.3)], br, { edge: 0.7 });
  hair(p, ...Q(len * 0.36, -3.3), ...Q(len * 0.36, 3.3), br[1]); hair(p, ...Q(len * 0.36 + 0.5, -3.3), ...Q(len * 0.36 + 0.5, 3.3), br[br.length - 2]);
  if (!back) for (let s = len * 0.5; s < len - 2.5; s += 0.5) dotp(p, ...Q(s, -2.8), VER[2]);
  orb(p, A.jx, A.jy, 3.3, 3.1, br);
}

// Hand im Bronzehandschuh: Handrücken mit Knöchelplatten; offen = gespreizte Finger
function hand(p, x, y, back, open) {
  const br = back ? BRZD : BRZ;
  if (open) for (let k = -1; k <= 1; k++) bar(p, x + k * 1.3, y - 1.5, x + k * 2.2, y - 7, 1.8, 1.2, br);
  orb(p, x, y, 3.2, 2.9, br);
  hair(p, x - 2.4, y - 0.4, x + 2, y - 0.8, br[1]);
  for (let i = 0; i < 3; i++) dotp(p, x - 1.6 + i * 1.4, y - 1.4, br[br.length - 1]);
  hair(p, x - 2.2, y + 1, x + 1.8, y + 0.7, br[1]);
}

// Schulterschale: drei gestaffelte Schienen, die oberste am größten, Grünspan an den Unterkanten
function pauldron(p, g, x, y, front) {
  const br = front ? BRZ : BRZD, r = front ? 8.4 : 7.2;
  for (let i = 2; i >= 0; i--) {
    const yy = y + i * 3, rr = r * (1 - i * 0.1);
    plate(p, [[x - rr, yy + 1.6], [x - rr * 0.78, yy - rr * 0.46], [x, yy - rr * 0.66], [x + rr * 0.82, yy - rr * 0.42], [x + rr, yy + 1.6], [x + rr * 0.56, yy + rr * 0.44], [x - rr * 0.6, yy + rr * 0.44]], br, { edge: 0.8 });
    if (front) for (let t = -0.75; t <= 0.75; t += 0.06) {
      const vx = x + t * rr * 0.8, vy = yy + rr * 0.36 - Math.abs(t) * 1.4, h = hash2(Math.round(vx * 2), i, 17);
      if (h < 0.55) dotp(p, vx, vy, VER[h < 0.18 ? 3 : 2]);
    }
    rivet(p, x - rr * 0.55, yy + rr * 0.1, br); if (front) rivet(p, x + rr * 0.48, yy + rr * 0.1, br);
  }
}

// ---------------------------------------------------------------- Kopf
// Ausgedörrter Königskopf in Dreiviertelansicht (Blick nach rechts): Schädelplatte, heller Brauenwulst über tiefen
// Höhlen mit Geisterlicht, Hakennase, Wangenknochen im Licht, eingefallene Wange, Ohr. Langes Haar hinten, darüber
// Bronzereif mit Geweih. Gezeichnet in Kopfmaßen (u, v) mit Maßstab HZ ab (hx, hy).
// Gibt eine Funktion zurück, die den Bart zeichnet (kommt vor Brust und Schulter).
const HZ = 1.2;
function head(p, g, hx, hy, P, meta, gy) {
  const S = HZ, j = P.jaw * 2.4, t = P.capeT, lit = P.eye > 0.1;
  const H = (u, v) => [hx + u * S, hy + v * S];
  const HL = (list) => list.map(([u, v]) => H(u, v));
  const st = (u, v, len, a, w, bend, l) => { const [x, y] = H(u, v); return { x, y, len: len * S, a, w: w * S, bend, lit: l }; };
  if (P.crown < 0.02) antler(p, g, ...H(3.6, 0.4), -1, P, false, S);
  // Haar hinter dem Kopf
  strands(p, [
    st(2.5, 2.5, 18, Math.PI * 0.62, 2.4, -0.25 - P.cape * 0.3, 0.35),
    st(1.8, 6, 16, Math.PI * 0.6, 2.4, -0.2 - P.cape * 0.3, 0.5),
    st(3, 9, 13, Math.PI * 0.56, 2.2, -0.15 - P.cape * 0.25, 0.6),
    st(4.6, 11, 9, Math.PI * 0.52, 2, -0.1, 0.45),
  ].map((s) => ({ ...s, a: s.a + Math.sin(t + s.y) * 0.04 })), BRDB);
  // Schädel und Gesicht: hohe Stirn, Hakennase, langes Kinn (unter dem Bart)
  plate(p, HL([[1.4, 3], [3, 0.2], [6.4, -1], [10.4, -0.6], [13.4, 1], [14.8, 3.6], [15.2, 5.8], [15, 6.8], [16.2, 8.4], [18.2, 10.8], [17.6, 11.5], [15.8, 11.6], [15.2, 12.8], [14.4, 15.8 + j], [11.6, 17 + j], [8.4, 15.8 + j], [5.8, 13.6], [3.6, 11.2], [1.6, 8]]), SKN, { edge: 0.8, core: 2.6, lift: -1 });
  // Ohr
  plate(p, HL([[3.8, 7.2], [5.8, 6.8], [6.2, 10.4], [4.4, 10.9]]), SKN, { edge: 0.5, glint: false, lift: -1 });
  hair(p, ...H(4.8, 8), ...H(5.1, 10), SKN[1]);
  // Stirn im Licht, Falten, Schläfenmulde
  poly(p, HL([[7.4, 1.4], [11.6, 1.2], [14.2, 3], [14.4, 4.8], [8, 5]]), SKN[4]);
  hair(p, ...H(8.2, 2.6), ...H(13.2, 2.6), SKN[3]); hair(p, ...H(8.8, 3.8), ...H(13.8, 3.9), SKN[3]);
  hair(p, ...H(8.4, 1.6), ...H(11.6, 1.5), SKN[5]);
  poly(p, HL([[6.2, 4.6], [7.8, 5], [7.6, 8.8], [6.4, 8.4]]), SKN[1]);
  // Schattenband unter dem Brauenwulst, darin die Höhlen
  poly(p, HL([[7.6, 5.6], [15.2, 5.6], [15.6, 6.8], [15.2, 9], [12, 9.2], [8.2, 9.4], [7.4, 8]]), SKN[1]);
  poly(p, HL([[8.4, 6.6], [10.8, 6.4], [11, 8.6], [8.8, 8.8]]), SKN[0]);
  poly(p, HL([[12, 6.5], [14.8, 6.6], [14.5, 8.6], [12.3, 8.8]]), SKN[0]);
  hair(p, ...H(7.6, 5.2), ...H(15.2, 5.2), SKN[5]); hair(p, ...H(7.8, 5.6), ...H(15.3, 5.6), SKN[3]);
  // Hakennase: Rücken im Licht, Flanke im Schatten, Nasenloch
  poly(p, HL([[14.6, 6.8], [15.6, 6.8], [18, 10.7], [17.4, 11.3], [15.2, 11.3], [14.2, 9.6]]), SKN[3]);
  poly(p, HL([[14.4, 9.4], [15.4, 9.4], [15.6, 11.3], [14.6, 11.2]]), SKN[2]);
  hair(p, ...H(15.6, 7), ...H(17.8, 10.6), SKN[5]); hair(p, ...H(15.4, 7.4), ...H(17.2, 10.4), SKN[4]);
  hair(p, ...H(15.2, 11.6), ...H(17.6, 11.5), SKN[0]); dotp(p, ...H(16, 11), SKN[0]);
  // Wangenknochen im Licht, darunter die eingefallene Wange
  poly(p, HL([[10.4, 9.6], [14, 9.4], [13.6, 10.5], [10.8, 10.7]]), SKN[4]);
  hair(p, ...H(10.6, 9.6), ...H(13.8, 9.4), SKN[5]);
  poly(p, HL([[8.8, 10.9], [13.4, 10.9], [13, 12.6], [9.4, 13]]), SKN[1]);
  if (j > 0.3) {
    poly(p, HL([[11, 12.6], [15.4, 12.4], [15, 12.8 + j], [11.4, 13 + j]]), VOID);
    for (let u = 11.6; u < 15; u += 1.1) { dotp(p, ...H(u, 12.8), ANT[4]); dotp(p, ...H(u + 0.2, 12.4 + j), ANT[3]); }
    const [mx, my] = H(13, 12.6 + j / 2);
    g.dot(mx - 0.5, my - 0.5, P.jaw > 0.6 ? 2 : 1); g.edot(mx - 0.5, my - 1, 3);
  }
  // Augen: blasse Punkte mit Geisterlicht
  if (lit) {
    for (const [u, v] of [[9.7, 7.5], [13.4, 7.5]]) {
      const [x, y] = H(u, v);
      dotp(p, x, y, EYE_PT); dotp(p, x + 0.5, y, EYE_PT); dotp(p, x, y + 0.5, GH[2]); dotp(p, x - 0.5, y, GH[1]);
      g.adot(x - 0.5, y - 0.5, 4); g.edot(x - 0.5, y - 0.5, 4); g.edot(x - 1, y - 0.5, 2); g.edot(x, y - 0.5, 2);
    }
    for (let k = 1; k <= 8; k++) {
      const [x0, y0] = H(9, 7);
      const x = x0 - k * 1.2 - P.cape * k * 0.2, y = y0 - k * 0.7 + Math.sin(t * 2 + k * 0.8) * 0.7;
      g.epx(x, y, k < 3 ? 4 : k < 6 ? 3 : 2); if (k < 5) g.epx(x, y + 1, 2);
    }
  } else { dotp(p, ...H(9.7, 7.7), SKN[2]); dotp(p, ...H(13.4, 7.7), SKN[2]); }
  { const [x, y] = H(13.4, 7.5); meta.eye = { x, y }; }
  { const [x, y] = H(12.5, 13 + j / 2); meta.mouth = { x, y }; }
  if (P.crown < 0.02) { crownBand(p, g, ...H(0.2, 0.2), 0, S); antler(p, g, ...H(10, -0.4), 1, P, true, S); }
  else { const [cx0, cy0] = H(0, 1); crownBand(p, g, cx0 + P.crown * 10, cy0 + (gy - 3 - cy0) * Math.min(1, P.crown * P.crown), P.crown, S); }
  { const [x, y] = H(7, -8); meta.head = { x, y }; }
  // Bart: viele Strähnen, hinten dunkler, vorn heller, Bronzespange auf der langen Mittelsträhne
  return () => {
    const bl = P.beard, sw = Math.sin(t) * 0.04;
    const back = [], front = [];
    // Ansatz entlang der Kieferlinie vom Ohr bis unter die Nase; Mitte am längsten (spitzer Bart)
    for (let i = 0; i < 8; i++) {
      const q = i / 7, u = 5.4 + q * 10, v = 10.6 + Math.sin(q * Math.PI * 0.5) * 2 + j * q, c = 1 - Math.abs(q - 0.55) / 0.6;
      back.push(st(u - 0.8, v + 0.4, 11 + c * 9, Math.PI / 2 + 0.3 - q * 0.12 + sw, 2.8, -0.12 - bl * 0.35, 0.28));
      front.push(st(u, v + 1.2, 8 + c * 11, Math.PI / 2 + 0.22 - q * 0.16 + sw, 2.5, -0.18 - bl * 0.45, 0.4 + c * 0.4));
    }
    strands(p, back, BRDB);
    strands(p, front, BRD);
    // Schnurrbart (hängt an den Mundwinkeln)
    strands(p, [st(15.8, 11.8, 6.5, Math.PI / 2 + 0.05, 2, -0.3, 0.9), st(14.6, 12, 6.5, Math.PI / 2 + 0.55, 2, -0.25, 0.7)], BRD);
    const m = front[4], k = m.len * 0.5;
    const cx = m.x + Math.cos(m.a + m.bend * 0.42) * k, cy = m.y + Math.sin(m.a + m.bend * 0.42) * k;
    plate(p, [[cx - 2.3, cy - 1.3], [cx + 2.3, cy - 1.5], [cx + 2.2, cy + 1.5], [cx - 2.2, cy + 1.6]], GLD, { edge: 0.5 });
    hair(p, cx - 1.8, cy, cx + 1.8, cy - 0.1, GLD[2]);
  };
}

// Bronzereif mit Zacken und Geisterstein; fall > 0: heruntergefallen (gekippt, mit Geweihstümpfen); s = Maßstab
function crownBand(p, g, x, y, fall, s = 1) {
  const tilt = fall * 0.45, ca = Math.cos(tilt) * s, sa = Math.sin(tilt) * s;
  const R = (u, v) => [x + u * ca - v * sa, y + u * sa + v * ca];
  for (const [u, h] of [[1.2, 2.6], [5, 3.4], [9.4, 3.8], [13.6, 2.6]]) gem(p, ...R(u, -0.6), ...R(u + 0.3, -0.6 - h), 2.4 * s, GLD);
  plate(p, [R(-0.8, 0.5), R(7, -0.8), R(15.4, 0), R(15.4, 2.8), R(7, 2.1), R(-0.8, 3.2)], GLD, { edge: 0.6 });
  hair(p, ...R(-0.4, 2.4), ...R(15, 2.1), GLD[1]);
  for (let u = 0.5; u < 15; u += 1.2) dotp(p, ...R(u, 2.6), GLD[3]);
  const [gx, gy] = R(9.4, 1);
  orb(p, gx, gy, 1.1 * s, 1.1 * s, GH, { glint: false }); dotp(p, gx - 0.4, gy - 0.4, '#ffffff');
  g.dot(gx - 0.5, gy - 0.5, fall > 0.9 ? 1 : 4); g.ellipse(gx - 0.5, gy - 0.5, 1.4, 1.4, fall > 0.9 ? 0 : 2); g.edot(gx - 0.5, gy - 2, 3);
  if (fall > 0.3) for (const [u, h] of [[2.5, 6], [10, 8]]) hornQ(p, ...R(u, -0.5), ...R(u - 1, -h * 0.6), ...R(u - 2.2, -h), 2.6 * s, 1.6 * s, ANT6, { n: 4 });
}

// Geweih: kräftige Stange, Rose am Reif, drei Enden; Phase 2 lodern Geisterflammen an den Spitzen; s = Maßstab
function antler(p, g, x, y, dir, P, front, s = 1) {
  const R = front ? ANT6 : ANTD;
  const B = (dx, dy) => [x + dx * s, y + dy * s];
  const beam = front ? [x, y, ...B(9.5, -6), ...B(7, -24)] : [x, y, ...B(-10, -6), ...B(-8, -21.5)];
  const tines = front ? [[0.3, 7.5, -2.35], [0.56, 7.5, -2.0], [0.8, 5.5, -1.25]] : [[0.36, 6.5, -0.95], [0.64, 6.5, -1.25], [0.86, 4.5, -1.9]];
  for (const [tt, len0, a] of tines) {
    const len = len0 * s, [bx, by] = bez(...beam, tt), ex = bx + Math.cos(a) * len, ey = by + Math.sin(a) * len;
    hornQ(p, bx, by, bx + Math.cos(a + 0.3 * dir) * len * 0.55, by + Math.sin(a + 0.3 * dir) * len * 0.55, ex, ey, 2.6 * s, 1.1, R, { n: 4 });
    if (front) {
      g.apx(ex, ey, 0);
      const fl = 2 + Math.round((Math.sin(P.capeT * 2 + tt * 9) * 0.5 + 0.5) * 2);
      for (let k = 1; k <= fl; k++) g.epx(ex - k * 0.3, ey - k, k === 1 ? 4 : k < fl ? 3 : 1);
    } else g.epx(ex, ey - 1, 2);
  }
  hornQ(p, ...beam, 4 * s, 1.8, R, { n: 10 });
  for (let i = 0; i < 5; i++) { const a = Math.PI * 1.1 + i * 0.5; dotp(p, x + Math.cos(a) * 1.8 * s, y + Math.sin(a) * 1.2 * s, R[R.length - 1]); }
  const [tx, ty] = bez(...beam, 1);
  const fl = front ? 4 : 2;
  for (let k = 1; k <= fl; k++) g.epx(tx - k * 0.3, ty - k, k < 2 ? 4 : k < 4 ? 3 : 1);
}

// Umhang: schwere Bahn mit breiten Falten und zerfetztem Saum, der in Geisterlicht übergeht; Stoffwulst als Kragen
function cape(p, g, tx, ty, gy, P) {
  const len0 = Math.min(60, gy - ty - 4) - P.kneel * 10;
  const tongue = (u) => {
    let t = 0;
    for (const [c, w, d] of [[0.16, 0.07, 7], [0.47, 0.06, 9], [0.8, 0.06, 6]]) t += Math.max(0, 1 - Math.abs(u - c) / w) * d;
    for (const [c, w, d] of [[0.31, 0.05, 6], [0.64, 0.05, 7]]) t -= Math.max(0, 1 - Math.abs(u - c) / w) * d;
    return t;
  };
  const N = 40, top = [], bot = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, sx = tx - 13 + u * 26, tt = ty + Math.abs(u - 0.45) * 4;
    const fray = (hash2(i, 3, 27) - 0.5) * 3 * (i % 2 ? 1 : 0.4);
    const len = len0 - Math.abs(u - 0.4) * 10 + Math.sin(P.capeT + u * 3) * 2 + tongue(u) + fray;
    const X = (v) => sx - P.cape * 20 * v * v - (1 - u) * 5 * v + Math.sin(P.capeT * 1.3 + v * 3.5 + u * 2.5) * 1.6 * v;
    top.push([X(0), tt]); bot.push([X(1), tt + len]);
  }
  cloth(p, [...top, ...bot.slice().reverse()], CAP6, { fold: 5.2, phase: P.capeT * 0.25, hem: 4, seed: 2 });
  // Frostsaum und Geisterschimmer
  for (let i = 0; i < bot.length - 1; i++) {
    const [x0, y0] = bot[i], [x1, y1] = bot[i + 1];
    hair(p, x0, y0 - 0.8, x1, y1 - 0.8, i % 3 === 0 ? '#7ad8c4' : '#3a8478');
    g.apx(x0, y0 - 1.5, 1); if (i % 2 === 0) g.apx(x0, y0 - 2.5, 0);
    g.epx(x0, y0 - 1.5, 2);
    if (i % 4 === 0) {
      const fl = 1 + Math.round((Math.sin(P.capeT * 2 + i * 1.7) * 0.5 + 0.5) * 3 + hash2(i, 7, 5) * 2);
      for (let k = 0; k < fl; k++) g.epx(x0 + Math.sin(k * 0.8 + i) * 0.6, y0 - 1.5 - k, k === 0 ? 3 : k < fl / 2 ? 2 : 1);
    }
  }
  // Kragen: Stoffwulst über den Schultern
  plate(p, [[tx - 8, ty + 3], [tx - 6, ty - 3.5], [tx + 1, ty - 5], [tx + 8, ty - 3], [tx + 9, ty + 2.5], [tx + 1, ty + 4.5]], CAP6, { edge: 0.8 });
  for (const u of [-3.5, 0.5, 4.5]) hair(p, tx + u, ty - 3.8, tx + u + 1, ty + 3, CAP6[1]);
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
  const hx = neckX - 8 * HZ + P.head, hy = neckY - 14.2 * HZ + P.headY + P.bow * 2;

  // --- 0. Geisterschleier (nur Phase 2, hinter allem)
  if (P.spirit >= 0) aura(g, chX, chY, gy, P);

  // --- 1. Umhang
  cape(p, g, chX - perpX * 3, chY + 1, gy, P);

  // --- 2. Hinteres Bein, hinterer Arm (dunkler)
  leg(p, g, hipX - 4, hipY, legB, true, P);
  arm(p, shB, armB, true);
  hand(p, armB.ex, armB.ey, true, P.cast > 0.3);
  meta.cast = { x: armB.ex, y: armB.ey - 3 };
  pauldron(p, g, shB.x - 1, shB.y - 1.5, false);

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
  bar(p, neckX - 0.5, neckY + 1.5, neckX + 0.5, neckY - 5.5, 6.5, 5.5, SKN, { caps: false });
  hair(p, neckX - 1, neckY - 4, neckX + 2, neckY - 0.5, SKN[1]);
  const beard = head(p, g, hx, hy, P, meta, gy);

  // --- 6. Schwung-Schleier
  if (extra.smear) smear(p, g, shF.x, shF.y + (extra.flat ? 8 : 2), extra.smear[0], extra.smear[1], 34, 80, extra.rev, extra.flat ?? 1);

  // --- 7. Vorderer Arm mit Schwert, Schulter, Bart, Hände vor dem Bart
  arm(p, shF, armF, false);
  if (!extra.swordBehind) {
    const t = runeSword(p, g, hF.x, hF.y, sa, extra.power ?? 0);
    meta.tip = { x: t.tipX, y: t.tipY }; meta.blade = { x: t.midX, y: t.midY };
  }
  pauldron(p, g, shF.x, shF.y - 0.5, true);
  beard();
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
  const X = (dx) => cx + dx * Z, Y = (dy) => gy + dy * Z;
  // Umhang zusammengesackt
  cloth(p, [[X(-20), Y(-0.2)], [X(-15), Y(-5)], [X(-4), Y(-7)], [X(8), Y(-4.5)], [X(11), Y(-0.2)]], CAP6, { fold: 4, hem: 1.5 });
  for (let i = 0; i < 10; i++) g.px(X(-16 + i * 3.2), gy - 1, hash2(i, 1, 3) < 0.5 ? 1 : 0);
  // Beinschienen
  bar(p, X(3), Y(-2.2), X(13), Y(-3), 5.6, 4.6, BRZ);
  bar(p, X(-15), Y(-2), X(-7), Y(-1.2), 4.8, 4, BRZD);
  // Brustpanzer (liegt schräg) mit verglimmendem Siegel
  plate(p, [[X(-8), Y(-4)], [X(-5), Y(-10)], [X(3), Y(-10.5)], [X(7), Y(-6)], [X(5), Y(-1)], [X(-6), Y(-0.8)]], BRZ, { edge: 0.8 });
  trace(p, inset([[X(-8), Y(-4)], [X(-5), Y(-10)], [X(3), Y(-10.5)], [X(7), Y(-6)], [X(5), Y(-1)], [X(-6), Y(-0.8)]], 1.3), BRZ[4], true, BRZ[1]);
  for (const [dx, dy] of [[2, -6], [3, -7], [-2, -4], [-4, -3]]) dotp(p, X(dx), Y(dy), VER[2]);
  orb(p, X(0), Y(-6.5), 1.6, 1.6, GH, { glint: false }); g.dot(X(0) - 0.5, Y(-6.5) - 0.5, k < 0.5 ? 3 : 1);
  // Schulterschalen
  plate(p, [[X(-13), Y(-2)], [X(-11), Y(-6)], [X(-6), Y(-6.5)], [X(-5), Y(-2)]], BRZ, { edge: 0.7 });
  plate(p, [[X(5), Y(-2)], [X(7), Y(-6)], [X(11), Y(-6.2)], [X(12), Y(-2)]], BRZD, { edge: 0.7 });
  // Schädelrest
  orb(p, X(5), Y(-9.5), 3, 2.6, SKN); dotp(p, X(6), Y(-9.5), VOID); dotp(p, X(6.5), Y(-9.5), VOID);
  // Schwert steckt vor dem Haufen im Boden, Krone ist heruntergefallen
  runeSword(p, g, X(17), gy - 28, Math.PI / 2 + 0.08, 0);
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

// Aufgeschoben (gfx/Sprite.js LazyFrame): gezeichnet wird erst, wenn die Animation den Frame braucht – der Zonenaufbau
// baut den Boss nicht mehr am Stück. atRes(fn) hält die Bildfeinheit (RS) vom Anlegen für den späteren Bau fest.
function atRes(fn) { const rs = RS; return () => { if (RS !== rs) setRes(rs); return fn(); }; }
function frame(...a) { return lazyFrame(atRes(() => frameNow(...a))); }
function frameNow(P, extra = {}) {
  const L = Layers.get();
  const meta = drawUlgrim(new Pen(L), new GlowPen(L), P, extra);
  return finish(L, extra.fx, meta);
}

// Zerfall zu Staub: der kniende Körper löst sich von oben nach unten auf,
// Staub steigt auf, zurück bleiben Rüstung, Schwert und Krone.
function dissolveFrame(...a) { return lazyFrame(atRes(() => dissolveFrameNow(...a))); }
function dissolveFrameNow(P, k) {
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
  // --- Grundposen: Schwert in beiden Händen, Spitze ruht vor ihm am Boden (nicht auf den Helden gerichtet)
  const idleA = pose({ capeT: 0, sw: 0.86 });
  const idleB = pose({ hipY: 1, lean: 0.1, hFy: 17, sw: 0.9, capeT: Math.PI, headY: 1, jaw: 0.15, beard: 0.15, eye: 0.8 });

  // Gehen: schwere, schleppende Schritte eines alten Königs
  const walkKeys = [];
  for (let i = 0; i <= 10; i++) {
    const ph = (i / 10) * Math.PI * 2, s = Math.sin(ph), c = Math.cos(ph);
    walkKeys.push([i / 10, pose({
      hipX: 1, hipY: Math.abs(c) * -1.4 + 1.2, lean: 0.13 + Math.abs(s) * 0.03,
      fFx: 3 + s * 8, fFy: Math.max(0, -c) * 3, fBx: -4 - s * 8, fBy: Math.max(0, c) * 3,
      hFx: 10 + s * 1.2, hFy: 15 - Math.abs(s) * 0.8, sw: 0.8 + s * 0.05,
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
