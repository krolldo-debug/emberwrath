import { PAL } from '../gfx/Palette.js';
import { makeCanvas, flipCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame, SpriteFrame, Animation, lazyFrame } from '../gfx/Sprite.js';
import { fineRes, outlinePixels, pixelsToCanvas } from '../gfx/Fine.js';
import { hash2 } from '../core/math.js';
import { plate, bar, orb, gem, hornQ, poly, hair, thick, inset, trace, rivet, cloth, dotp } from './bossPaint.js';

// Ignaroth, der Glut-Tyrann – Endboss der Glutschmiede.
//
// Rig wie beim Knochenfürsten (Zwei-Gelenk-IK für Arme und Beine, Keyframe-
// Posen, weich interpoliert), aber deutlich größer und schwerer: Hörnerkrone,
// Obsidian-Plattenrüstung mit Lavanähten, Umhang aus Rauch mit brennendem
// Saum, riesige Großaxt mit glühender Schneide.
//
// Jeder Frame hat zwei Leucht-Ebenen:
//   frame.glow         Phase 1–2: orange Glut (Augen, Nähte, Kern, Schneide)
//   frame.glowEnraged  Phase 3: weißglühend, Rüstung bricht auf (Risse),
//                      Flammenflügel hinter dem Körper
// Die Leucht-Ebenen respektieren die Zeichenreihenfolge: was später deckend
// gezeichnet wird (z. B. das vordere Bein), löscht darunter liegendes Glühen
// (Umhangsaum, Flügel). Gezeichnet wird in Pixelpuffer (schnell), danach wird
// jeder Frame auf seinen Inhalt zugeschnitten (spart Speicher).
// Blickrichtung rechts, Anker = Mitte zwischen den Füßen.
// Rig-Koordinaten (alle Maße und Posen unten sind in diesem Raum angegeben)
const AX = 88, AY = 128;
const CLIP_Y = AY + 1; // unter dem Boden wird nichts gezeichnet (Axt steckt im Boden)
// Rig-Skalierung: die ganze Figur wird um SC um den Fußanker vergrößert. Die
// Stifte rechnen jede Koordinate und jedes Maß (Radien, Rechtecke, Linien)
// in den Zielpuffer um und rastern dort neu – kein Hochskalieren fertiger Pixel.
const SC = 1.25;
const W = 260, H = 176, BAX = 114, BAY = 168; // Zielpuffer und Anker darin
const BCLIP = BAY + 1;
// Feinraster (docs/STYLE.md „Feinraster“, Stufe B): der Zielpuffer hat RS Texel je Zielpixel (RS = fineRes() beim
// Bau, bei „Niedrig“ 1 = alles wie früher). Die Stifte rastern jede Form im Feinraster neu (keine Hochskalierung);
// Pixelkarten (Visier) setzen RS×RS-Zellen, Feindetails (dot/fline) einzelne Texel.
let RS = 1, TW = W, TH = H, KS = SC;
const tx = (x) => (BAX + (x - AX) * SC) * RS, ty = (y) => (BAY + (y - AY) * SC) * RS;
const cx0 = (x) => BAX + (x - AX) * SC, cy0 = (y) => BAY + (y - AY) * SC;   // Zielpixel (grob) für Pixelkarten
function setRes(r) { RS = r; TW = W * r; TH = H * r; KS = SC * r; }
// Fußabdruck eines Rig-Punkts im Zielpuffer (lückenlos auch bei Ganzzahl-Schleifen)
function foot(x, y, f) {
  const X = tx(x), Y = ty(y);
  const x0 = Math.round(X), y0 = Math.round(Y);
  const x1 = Math.max(x0, Math.round(X + KS) - 1), y1 = Math.max(y0, Math.round(Y + KS) - 1);
  for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) f(xx, yy);
}
// Strecke in Rig-Koordinaten: grob Bresenham (wie früher), fein in Texelschritten (glatte Diagonalen, gleiche Stärke)
function seg(x0, y0, x1, y1, f) {
  if (RS === 1) { bres(x0, y0, x1, y1, f); return; }
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * KS));
  for (let i = 0; i <= n; i++) f(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n);
}

// Erkaltete Schlacke: fast schwarz mit warmem Braunstich, Kanten rötlich angeglüht
const OBS = ['#0a0807', '#17110f', '#261c18', '#3a2b24', '#56403a'];
const SPEC = '#b08a70';
// Glutnähte im unbeleuchteten Sprite (schon im Grundbild orange-gelb und lesbar)
const MAG = ['#4a0e04', '#a2300a', '#ec6614', '#ffb23c'];
const HOT = '#ffe08a';
// Basalthaut / Kettengeflecht an Hals und Gelenken
const SKIN = ['#140f10', '#281c1a', '#3e2a24', '#5a3c2e'];
// Hörner: Knochenhorn, an der Wurzel dunkel, zur Spitze elfenbeinhell
const HORN = ['#22160f', '#46301f', '#76563a', '#ab8c64', '#dccaa2'];
const CAPE = ['#140708', '#260b0c', '#3c1210', '#561a14', '#74261a'];
// Messing (Beschläge, Bänder, Krone)
const GOLD = ['#3e2410', '#73481a', '#ac7426', '#dcaa48', '#f8e09a'];
const IRON = ['#121216', '#22232a', '#3a3c46', '#5e626e'];
const FANG = ['#8a7a68', '#c8b8a0', '#efe4cc'];
const EDGE = ['#6a6e78', '#a2a8b4', '#d6dce4', '#f8fbff'];
const VOID = '#060406';
const EYE = ['#c84a10', '#ffa040', '#fff0b0'];
const OUTLINE = '#07050a';
// Leucht-Rampen (dunkel -> hell)
const EMB = ['#5a1406', '#a8300a', '#f0661a', '#ffb048', '#fff0c0'];
const INF = ['#8a2a08', '#ff6a14', '#ffc048', '#fff4c8', '#ffffff'];

const THIGH = 15.5, SHIN = 16.5, SPINE = 27, UPPER = 13, FORE = 13.5;

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
const EMBc = EMB.map(col), INFc = INF.map(col);

// Drei Ebenen: Grundbild, Glut (Phase 1–2), Inferno (Phase 3)
class Layers {
  // Ein Satz Puffer wird für alle Frames wiederverwendet (spart Speicher und Müllabfuhr); get() leert den zuletzt
  // belegten Bereich.
  static #pool = null;
  static get() {
    const L = Layers.#pool;
    if (!L || L.base.length !== TW * TH) return (Layers.#pool = new Layers());
    if (L.x1 >= 0) for (let y = Math.max(0, L.y0 - 1); y <= Math.min(TH - 1, L.y1 + 1); y++) {
      const a = y * TW + Math.max(0, L.x0 - 1), b = y * TW + Math.min(TW - 1, L.x1 + 1) + 1;
      L.base.fill(0, a, b); L.ga.fill(0, a, b); L.gb.fill(0, a, b); L.nr.fill(0, a, b);
    }
    L.x0 = TW; L.y0 = TH; L.x1 = -1; L.y1 = -1;
    return L;
  }
  constructor() {
    this.base = new Uint32Array(TW * TH);
    this.ga = new Uint32Array(TW * TH);
    this.gb = new Uint32Array(TW * TH);
    this.nr = new Uint8Array(TW * TH); // 1 = kein Umriss/Randlicht (Schwung-Schleier, Funken)
    this.x0 = TW; this.y0 = TH; this.x1 = -1; this.y1 = -1;   // belegter Bereich (Randlicht/Zuschnitt nur dort)
  }
  mark(x, y) { if (x < this.x0) this.x0 = x; if (x > this.x1) this.x1 = x; if (y < this.y0) this.y0 = y; if (y > this.y1) this.y1 = y; }
}

// Stift für das Grundbild: deckt darunter liegendes Glühen ab.
// px/rect/line/ellipse nehmen Rig-Koordinaten; set schreibt direkt in den Zielpuffer (Texel), cell eine
// Zielpixel-Zelle (RS×RS Texel), dot/fline Feindetails (ein Texel, nur im Feinraster sichtbar fein).
class Pen {
  constructor(L) { this.L = L; this.soft = 0; this.fine = 0; this.res = RS; }
  set(x, y, c) { this.setv(x, y, col(c)); }
  setv(x, y, v) {
    if (x < 0 || y < 0 || x >= TW || y >= TH || y >= (BCLIP + 1) * RS) return;
    const i = y * TW + x, L = this.L;
    L.base[i] = v; L.ga[i] = 0; L.gb[i] = 0; L.nr[i] = this.soft;
    L.mark(x, y);
  }
  cell(X, Y, c) { for (let j = 0; j < RS; j++) for (let i = 0; i < RS; i++) this.set(X * RS + i, Y * RS + j, c); }
  // fine = 1: Detailpixel (Gesicht) bleiben einzelne Zielpixel statt Fußabdruck
  px(x, y, c) {
    if (this.fine) { this.cell(Math.round(cx0(x)), Math.round(cy0(y)), c); return; }
    // Fußabdruck (wie foot), ohne Hilfsfunktion je Texel
    const X = tx(x), Y = ty(y), v = col(c);
    let x0 = Math.round(X), y0 = Math.round(Y);
    let x1 = Math.max(x0, Math.round(X + KS) - 1), y1 = Math.max(y0, Math.round(Y + KS) - 1);
    if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0; if (x1 >= TW) x1 = TW - 1; if (y1 >= TH) y1 = TH - 1;
    if (y1 >= (BCLIP + 1) * RS) y1 = (BCLIP + 1) * RS - 1;
    if (x1 < x0 || y1 < y0) return;
    const L = this.L, sf = this.soft;
    L.mark(x0, y0); L.mark(x1, y1);
    for (let yy = y0; yy <= y1; yy++) for (let i = yy * TW + x0, e = yy * TW + x1; i <= e; i++) { L.base[i] = v; L.ga[i] = 0; L.gb[i] = 0; L.nr[i] = sf; }
  }
  dot(x, y, c) { this.set(Math.floor(tx(x) + 0.5 * KS), Math.floor(ty(y) + 0.5 * KS), c); }
  // Malwerkzeug (bossPaint.js): Texelmitte → Rig-Punkt (pixelzentriert wie dot), Texel ↔ Rig-Punkt
  get step() { return 1 / KS; }
  each(x0, y0, x1, y1, fn) {
    const yc = (BCLIP + 1) * RS;
    const F0 = Math.max(0, Math.floor(tx(x0) + 0.5 * KS) - 1), F1 = Math.min(TW - 1, Math.floor(tx(x1) + 0.5 * KS) + 1);
    const G0 = Math.max(0, Math.floor(ty(y0) + 0.5 * KS) - 1), G1 = Math.min(Math.min(TH, yc) - 1, Math.floor(ty(y1) + 0.5 * KS) + 1);
    for (let G = G0; G <= G1; G++) {
      const y = AY + ((G + 0.5) / RS - BAY) / SC - 0.5;
      for (let F = F0; F <= F1; F++) { const c = fn(AX + ((F + 0.5) / RS - BAX) / SC - 0.5, y); if (c) this.setv(F, G, col(c)); }
    }
  }
  pdot(x, y, c) { this.dot(x, y, c); }
  fline(x0, y0, x1, y1, c) { bres(tx(x0) + 0.5 * KS, ty(y0) + 0.5 * KS, tx(x1) + 0.5 * KS, ty(y1) + 0.5 * KS, (x, y) => this.set(x, y, c)); }
  rect(x, y, w, h, c) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    if (w <= 0 || h <= 0) return;
    const x0 = Math.round(tx(x)), y0 = Math.round(ty(y));
    const x1 = Math.max(x0 + 1, Math.round(tx(x + w))), y1 = Math.max(y0 + 1, Math.round(ty(y + h)));
    for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) this.set(i, j, c);
  }
  line(x0, y0, x1, y1, c) {
    if (RS === 1) bres(tx(x0), ty(y0), tx(x1), ty(y1), (x, y) => this.set(x, y, c));
    else bres(tx(x0), ty(y0), tx(x1), ty(y1), (x, y) => { for (let j = 0; j < RS; j++) for (let i = 0; i < RS; i++) this.set(x + i, y + j, c); });
  }
  ellipse(cx, cy, rx, ry, c) { fillEllipse(tx(cx), ty(cy), rx * KS, ry * KS, (x, y) => this.set(x, y, c)); }
}

// Stift für die Leucht-Ebenen: Index in die Rampe (0 dunkel … 4 weiß).
// px zeichnet in beide Ebenen, e* nur in die Phase-3-Ebene, a* nur Phase 1–2. t* setzt Texel, c* Zielpixel-Zellen.
class GlowPen {
  constructor(L) { this.L = L; this.fine = 0; }
  put(buf, ramp, x, y, i) {
    if (x < 0 || y < 0 || x >= TW || y >= TH || y >= (BCLIP + 1) * RS) return;
    buf[y * TW + x] = ramp[Math.max(0, Math.min(4, i))];
    this.L.mark(x, y);
  }
  set(buf, ramp, x, y, i) {
    if (this.fine) { const X = Math.round(cx0(x)) * RS, Y = Math.round(cy0(y)) * RS; for (let j = 0; j < RS; j++) for (let k = 0; k < RS; k++) this.put(buf, ramp, X + k, Y + j, i); }
    else {
      const X = tx(x), Y = ty(y);
      const x0 = Math.round(X), y0 = Math.round(Y);
      const x1 = Math.max(x0, Math.round(X + KS) - 1), y1 = Math.max(y0, Math.round(Y + KS) - 1);
      for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) this.put(buf, ramp, xx, yy, i);
    }
  }
  tpx(X, Y, i) { this.put(this.L.ga, EMBc, X, Y, i); this.put(this.L.gb, INFc, X, Y, i); }
  tepx(X, Y, i) { this.put(this.L.gb, INFc, X, Y, i); }
  tapx(X, Y, i) { this.put(this.L.ga, EMBc, X, Y, i); }
  cpx(X, Y, i) { for (let j = 0; j < RS; j++) for (let k = 0; k < RS; k++) this.tpx(X * RS + k, Y * RS + j, i); }
  cepx(X, Y, i) { for (let j = 0; j < RS; j++) for (let k = 0; k < RS; k++) this.tepx(X * RS + k, Y * RS + j, i); }
  px(x, y, i) { this.set(this.L.ga, EMBc, x, y, i); this.set(this.L.gb, INFc, x, y, i); }
  epx(x, y, i) { this.set(this.L.gb, INFc, x, y, i); }
  apx(x, y, i) { this.set(this.L.ga, EMBc, x, y, i); }
  // ein Texel (Feindetail): beide Ebenen / nur Phase 3
  dot(x, y, i) { this.tpx(Math.floor(tx(x) + 0.5 * KS), Math.floor(ty(y) + 0.5 * KS), i); }
  edot(x, y, i) { this.tepx(Math.floor(tx(x) + 0.5 * KS), Math.floor(ty(y) + 0.5 * KS), i); }
  fline(x0, y0, x1, y1, i) { bres(tx(x0) + 0.5 * KS, ty(y0) + 0.5 * KS, tx(x1) + 0.5 * KS, ty(y1) + 0.5 * KS, (x, y) => this.tpx(x, y, i)); }
  efline(x0, y0, x1, y1, i) { bres(tx(x0) + 0.5 * KS, ty(y0) + 0.5 * KS, tx(x1) + 0.5 * KS, ty(y1) + 0.5 * KS, (x, y) => this.tepx(x, y, i)); }
  rect(x, y, w, h, i) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    if (w <= 0 || h <= 0) return;
    const x0 = Math.round(tx(x)), y0 = Math.round(ty(y));
    const x1 = Math.max(x0 + 1, Math.round(tx(x + w))), y1 = Math.max(y0 + 1, Math.round(ty(y + h)));
    for (let j = y0; j < y1; j++) for (let k = x0; k < x1; k++) this.tpx(k, j, i);
  }
  #brush(f) { return RS === 1 ? f : (x, y) => { for (let j = 0; j < RS; j++) for (let k = 0; k < RS; k++) f(x + k, y + j); }; }
  line(x0, y0, x1, y1, i) { bres(tx(x0), ty(y0), tx(x1), ty(y1), this.#brush((x, y) => this.tpx(x, y, i))); }
  eline(x0, y0, x1, y1, i) { bres(tx(x0), ty(y0), tx(x1), ty(y1), this.#brush((x, y) => this.tepx(x, y, i))); }
  ellipse(cx, cy, rx, ry, i) { fillEllipse(tx(cx), ty(cy), rx * KS, ry * KS, (x, y) => this.tpx(x, y, i)); }
  eellipse(cx, cy, rx, ry, i) { fillEllipse(tx(cx), ty(cy), rx * KS, ry * KS, (x, y) => this.tepx(x, y, i)); }
  aellipse(cx, cy, rx, ry, i) { fillEllipse(tx(cx), ty(cy), rx * KS, ry * KS, (x, y) => this.tapx(x, y, i)); }
}

function bres(x0, y0, x1, y1, f) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let n = 0; n < 400; n++) {
    f(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
function fillEllipse(cx, cy, rx, ry, f) {
  if (rx <= 0 || ry <= 0) return;
  if (RS > 1) {
    // fein: Texelmitten abtasten; Mitte und Ausdehnung wie das grobe Raster (Mitte des Zielpixels, Rand +0,4)
    const X = cx + RS / 2, Y = cy + RS / 2, ex = rx + 0.4 * RS, ey = ry + 0.4 * RS;
    for (let y = Math.floor(Y - ey); y <= Math.ceil(Y + ey); y++) for (let x = Math.floor(X - ex); x <= Math.ceil(X + ex); x++) {
      const u = (x + 0.5 - X) / ex, v = (y + 0.5 - Y) / ey;
      if (u * u + v * v <= 1) f(x, y);
    }
    return;
  }
  for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
    const t = 1 - (y * y) / (ry * ry);
    if (t < 0) continue;
    const hw = Math.round(rx * Math.sqrt(t) - 0.15);
    for (let x = -hw; x <= hw; x++) f(Math.round(cx) + x, Math.round(cy) + y);
  }
}

// Leucht-Frame ohne Treffer-Blitz-Varianten; Spiegelbild erst bei Bedarf.
// res = Texel je Weltpixel (wie SpriteFrame); canvas/ax/ay in Texeln.
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
  hipX: 0, hipY: 0, lean: 0.06, head: 0, headY: 0, jaw: 0,
  fFx: 10, fFy: 0, fBx: -11, fBy: 0,
  hFx: 11, hFy: 18, hBx: -8, hBy: 19,
  axe: -1.3, grip: 0, cape: 0.2, capeT: 0,
  cast: 0, eye: 1, core: 1, kneel: 0, breath: 0, wing: 1, heat: 0, crown: 0,
};
const pose = (o = {}) => ({ ...REST, ...o });
const ease = (t) => t * t * (3 - 2 * t);
const linear = (t) => t;
const snap = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
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

// Dickes Glied mit Licht von links oben (4 Stufen).
function limb(p, x0, y0, x1, y1, w0, w1, ramp) {
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
// Quadratische Bezierkurve als Horn (Breite w0 -> w1), gerippt
function horn(p, g, x0, y0, x1, y1, x2, y2, w0, w1, ramp, tipGlow) {
  const n = 14;
  let px0 = x0, py0 = y0;
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const x = u * u * x0 + 2 * u * t * x1 + t * t * x2, y = u * u * y0 + 2 * u * t * y1 + t * t * y2;
    const w = w0 + (w1 - w0) * t;
    limb(p, px0, py0, x, y, w, Math.max(1, w - (w0 - w1) / n), i % 3 === 0 ? [ramp[0], ramp[1], ramp[2], ramp[3]] : [ramp[0], ramp[2], ramp[3], ramp[4]]);
    if (t > 0.72 && tipGlow) g.epx(x, y, t > 0.9 ? 3 : 2);
    if (RS > 1 && i < n - 1) {
      // Handfein: Wachstumsringe quer übers Horn, Glanz auf der Lichtseite
      const dl = Math.hypot(x - px0, y - py0) || 1, nx = -(y - py0) / dl, ny = (x - px0) / dl, hw = w / 2 - 0.3;
      if (i % 2 === 0) p.fline(x - nx * hw, y - ny * hw, x + nx * hw, y + ny * hw, ramp[1]);
      const sgn = nx + ny < 0 ? 1 : -1; p.dot(x + nx * hw * 0.6 * sgn, y + ny * hw * 0.6 * sgn, i > n * 0.6 ? '#f4ead0' : ramp[4]);
    }
    if (RS > 1 && i === n) p.dot(x, y, '#fff4dc');
    px0 = x; py0 = y;
  }
}

// ---------------------------------------------------------------- Neuzeichnung (03.11.): Rampen und Helfer
// Je Material 6 harte Stufen (dunkel → hell, [0] = Innenkontur), Licht von links oben (bossPaint.js).
const OB6 = ['#08060a', '#1c1513', '#30241e', '#48372e', '#685044', '#987a66'];   // Obsidianstahl
const OBD = ['#060408', '#110c0c', '#1c1512', '#29201b', '#382b24', '#4c3a30'];   // hintere Teile
const BR6 = ['#1c1006', GOLD[0], GOLD[1], GOLD[2], GOLD[3], GOLD[4]];              // Messing
const BRD = ['#120a04', '#2c1a0c', '#4a2e12', '#6a441a', '#8c6026', '#b08038'];
const SK6 = ['#0a0607', '#1c0f0f', '#2f1916', '#45241c', '#5e3224', '#7c4630'];   // verkohlte Haut
const SKD = ['#070405', '#140a0b', '#22110f', '#321a15', '#44241b', '#583022'];
const HN6 = ['#140c07', HORN[0], HORN[1], HORN[2], HORN[3], HORN[4]];
const HND = ['#0c0805', '#1e130c', '#33231a', '#4c3626', '#6a4e36', '#8a6c4c'];
const CP6 = ['#0a0405', '#1e0a0b', '#341010', '#4c1813', '#68221a', '#8a3420'];
const IR6 = ['#060608', IRON[0], IRON[1], IRON[2], IRON[3], '#8a8e9a'];
const ED6 = ['#1a1c22', '#3c4048', EDGE[0], EDGE[1], EDGE[2], EDGE[3]];
const LT6 = ['#0e0805', PAL.leather[0], PAL.leather[1], PAL.leather[2], PAL.leather[3], '#8a6446'];
const BN6 = ['#140c07', '#36261a', '#5a432f', '#846a4c', '#ae9672', '#d8c6a0'];   // angekohlter Knochen (Schädelvisier)
const FG6 = ['#3a2e24', FANG[0], '#a8987e', FANG[1], FANG[2], '#fbf4e4'];
const MGR = ['#2a0602', MAG[0], MAG[1], MAG[2], MAG[3], HOT];

function groove(p, pts, dark, light) {
  for (let i = 0; i < pts.length - 1; i++) {
    hair(p, pts[i][0], pts[i][1] + 0.5, pts[i + 1][0], pts[i + 1][1] + 0.5, light);
    hair(p, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], dark);
  }
}
// Achse von (x0, y0) nach (x1, y1): Q(s, o) = s entlang, o quer (+o nach rechts/vorn)
function axis(x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
  let nx = -uy, ny = ux;
  if (nx < 0) { nx = -nx; ny = -ny; }
  return { len, Q: (s, o) => [x0 + ux * s + nx * o, y0 + uy * s + ny * o] };
}
// Glutnaht: dunkle Fuge, glühender Kern, Leucht-Ebenen (Phase 3 heller). back = abgedunkelt (hintere Teile)
function ember(p, g, pts, hot = 1, back = false) {
  for (let k = 0; k < pts.length - 1; k++) {
    const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
    thick(p, x0 + 0.3, y0 + 0.35, x1 + 0.3, y1 + 0.35, back ? 1.2 : 1.9, MAG[0]);
    thick(p, x0, y0, x1, y1, back ? 0.8 : 1.4, back ? MAG[1] : MAG[2]);
    thick(p, x0, y0, x1, y1, back ? 0.4 : 0.8, back ? MAG[2] : hot > 1 ? MAG[3] : MAG[2]);
    hair(p, x0, y0, x1, y1, back ? MAG[2] : hot > 1 ? HOT : MAG[3]);
    // breiter Schein (Weltpixel) und heller Kern (Texel); Phase 3 noch heller
    g.line(x0, y0, x1, y1, back ? 0 : Math.min(4, hot));
    g.fline(x0, y0, x1, y1, back ? 1 : Math.min(4, hot + 1 + (k === 0 ? 1 : 0)));
    g.eline(x0, y0, x1, y1, back ? 1 : Math.min(4, hot + 1));
    g.efline(x0, y0, x1, y1, back ? 2 : Math.min(4, hot + 2));
  }
}
// Horn mit Wachstumsringen, glühende Spitze (Phase 3)
function horn2(p, g, a, c, b, w0, w1, ramp, glow) {
  hornQ(p, a[0], a[1], c[0], c[1], b[0], b[1], w0, w1, ramp, { n: 10 });
  const n = ramp.length, at = (t) => {
    const u = 1 - t;
    return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1],
      2 * u * (c[0] - a[0]) + 2 * t * (b[0] - c[0]), 2 * u * (c[1] - a[1]) + 2 * t * (b[1] - c[1])];
  };
  for (let t = 0.14; t < 0.84; t += 0.1) {
    const [x, y, dx, dy] = at(t), L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    const hw = (w0 + (w1 - w0) * t) / 2 - 0.55;
    if (hw < 0.6) continue;
    hair(p, x - nx * hw, y - ny * hw, x + nx * hw, y + ny * hw, ramp[1]);
    hair(p, x - nx * hw + dx / L * 0.5, y - ny * hw + dy / L * 0.5, x + dx / L * 0.5, y + dy / L * 0.5, ramp[n - 2]);
  }
  if (glow) for (let t = 0.78; t <= 1; t += 0.04) { const [x, y] = at(t); g.epx(x, y, t > 0.92 ? 3 : 2); }
  const [ex, ey] = at(1); dotp(p, ex, ey, '#fff4dc');
}

// ---------------------------------------------------------------- Großaxt

// Axt entlang Winkel a vom Griffpunkt (hx, hy). u = entlang des Stiels, v = quer (+v = Schneide).
// Halbmondblatt aus Obsidianstahl mit geschliffenem Stahlband, glühende Schneide (heat verstärkt), Glutrune.
function greataxe(p, g, hx, hy, a, heat = 0) {
  const dx = Math.cos(a), dy = Math.sin(a);
  const nx = -dy, ny = dx; // Schneidenseite
  const at = (u, v) => [hx + dx * u + nx * v, hy + dy * u + ny * v];
  const A = (list) => list.map(([u, v]) => at(u, v));
  // Stiel: Schmiedeeisen, Lederwicklung am Griff, Messingbänder
  bar(p, ...at(-11, 0), ...at(47, 0), 3.2, 2.8, IR6);
  bar(p, ...at(-8.5, 0), ...at(8.5, 0), 3.7, 3.7, LT6);
  for (let u = -8; u < 8; u += 1.7) hair(p, ...at(u, -1.6), ...at(u + 1.2, 1.6), LT6[0]);
  for (const u of [-9.6, 9.6, 14, 27.5]) plate(p, A([[u - 0.9, -2.1], [u + 0.9, -2.1], [u + 0.9, 2.1], [u - 0.9, 2.1]]), BR6, { edge: 0.5, core: 0.6, glint: false });
  // Knauf mit Glutstein
  plate(p, A([[-10.6, -2.6], [-10.6, 2.6], [-14, 1.6], [-15.6, 0], [-14, -1.6]]), BR6, { edge: 0.6, core: 1 });
  { const [x, y] = at(-12.8, 0); orb(p, x, y, 1.3, 1.3, MGR, { line: false }); g.px(x, y, 3); }
  // Spitze und Rückendorn
  gem(p, ...at(46.5, 0), ...at(55, 0), 3.6, OB6);
  gem(p, ...at(35.5, -1.2), ...at(38.5, -10), 6.5, OB6);
  // Blatt: Halbmond, am Stiel schmal, außen ausladend
  const vOut = (u) => -7 + Math.sqrt(Math.max(0, 400 - (u - 36) * (u - 36)));
  const vIn = (u) => Math.max(1.5, 1.5 + (Math.abs(u - 36) - 5) * 1.35);
  let u0 = 36, u1 = 36;
  while (u0 > 18 && vOut(u0 - 0.1) > vIn(u0 - 0.1)) u0 -= 0.1;
  while (u1 < 54 && vOut(u1 + 0.1) > vIn(u1 + 0.1)) u1 += 0.1;
  const us = []; for (let k = 0; k <= 24; k++) us.push(u0 + (u1 - u0) * k / 24);
  const blade = [...us.map((u) => at(u, vOut(u))), ...us.slice().reverse().map((u) => at(u, vIn(u)))];
  plate(p, blade, OB6, { edge: 0.8, core: 2.2 });
  const bev = [...us.map((u) => at(u, vOut(u))), ...us.slice().reverse().map((u) => at(u, Math.max(vIn(u), vOut(u) - 2.7)))];
  plate(p, bev, ED6, { edge: 0.5, core: 0.7, line: 0.4 });
  // Glanzlinie auf der Schneide, Scharten
  for (let k = 1; k < us.length - 2; k++) {
    const ua = us[k], ub = us[k + 1];
    hair(p, ...at(ua, vOut(ua) - 0.5), ...at(ub, vOut(ub) - 0.5), (ua - 36) * (ny < 0 ? 1 : -1) < 0 ? '#ffffff' : EDGE[3]);
  }
  for (const u of [27, 41.5, 46]) if (u > u0 && u < u1) dotp(p, ...at(u, vOut(u) - 0.4), OB6[1]);
  // Nieten, mit denen das Blatt am Stiel sitzt
  for (const u of [33, 39]) rivet(p, ...at(u, 2.6), BR6);
  // Glühende Schneide
  for (let k = 0; k <= 40; k++) {
    const u = u0 + 0.4 + (u1 - u0 - 0.8) * k / 40, [x, y] = at(u, vOut(u) - 0.5);
    const mid = 1 - Math.abs(u - 36) / 16;
    g.px(x, y, mid > 0.5 ? 2 + (heat > 0.5 ? 1 : 0) : 1 + (heat > 0.5 ? 1 : 0));
    g.epx(x, y, mid > 0.4 ? 4 : 3);
    if (heat > 0.3 && vOut(u) - vIn(u) > 2) { const [x2, y2] = at(u, vOut(u) - 1.6); g.px(x2, y2, 1); g.epx(x2, y2, 2); }
  }
  // Glutrune quer übers Blatt
  ember(p, g, A([[31, 6], [33.5, 7.6], [36, 6.4], [38.5, 8], [41, 6.4]]), 2);
  // Riss durch das Blatt (Phase 3)
  { let [x0, y0] = at(33, 3); for (const [u, v] of [[35, 6], [34, 9], [37, 12]]) { const [x1, y1] = at(u, v); g.eline(x0, y0, x1, y1, 2); x0 = x1; y0 = y1; } }
  const [tX, tY] = at(36, vOut(36));
  const [cX, cY] = at(36, 5);
  return { tipX: tX, tipY: tY, headX: cX, headY: cY };
}

// Feuriger Schwung-Schleier zwischen zwei Axtwinkeln um einen Drehpunkt.
function smear(p, g, cx, cy, a0, a1, r0, r1) {
  p.soft = 1;
  // im Zielpuffer rastern (feines Rauschen statt Doppelpixel)
  const CX = Math.round(tx(cx)), CY = Math.round(ty(cy));
  r0 *= KS; r1 *= KS;
  // nur das letzte Stück des Schwungs zeigen, sonst verdeckt der Schleier die Figur
  if (Math.abs(a1 - a0) > 1.5) a0 = a1 - Math.sign(a1 - a0) * 1.5;
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1), span = hi - lo || 1;
  const R1 = Math.ceil(r1);
  for (let y = -R1; y <= R1; y++) for (let x = -R1; x <= R1; x++) {
    const d = Math.hypot(x, y);
    if (d < r0 || d > r1) continue;
    let a = Math.atan2(y, x);
    while (a < lo - Math.PI) a += Math.PI * 2;
    while (a > lo + Math.PI) a -= Math.PI * 2;
    if (a < lo || a > hi) continue;
    const fresh = a1 > a0 ? (a - lo) / span : (hi - a) / span;
    const radial = (d - r0) / (r1 - r0);
    const band = Math.max(0, 1 - (1 - radial) * 2.4);
    const dens = (fresh * fresh * 0.25 + band * (0.15 + 0.8 * fresh)) * (radial > 0.55 ? 1 : 0.5);
    if (hash2(Math.floor(x / RS) + 99, Math.floor(y / RS) + 99, 17) > dens + (RS > 1 && radial > 0.72 ? 0.2 : 0)) continue;   // Dichte je Zielpixel, fein nur an der Kante dichter
    const c = radial > 0.88 ? '#ffe0a0' : radial > 0.72 ? '#f0a050' : fresh > 0.7 ? '#c8420c' : '#6a1a0c';
    p.set(CX + x, CY + y, c);
    if (fresh > 0.35 && radial > 0.5) {
      const i = radial > 0.88 ? 4 : radial > 0.75 ? 3 : fresh > 0.7 ? 2 : 1;
      g.tpx(CX + x, CY + y, i);
    }
  }
  p.soft = 0;
}

// ---------------------------------------------------------------- Figur

function drawIgnaroth(p, g, P, extra = {}) {
  const gy = AY;
  const lean = P.lean, sL = Math.sin(lean), cL = Math.cos(lean);
  const hipX = AX + P.hipX, hipY = gy - 31 + P.hipY + P.kneel * 11;
  const chX = hipX + sL * SPINE, chY = hipY - cL * SPINE;
  const perpX = cL, perpY = sL; // "nach vorn" quer zum Rumpf
  const along = (s, k) => [hipX + sL * s + perpX * k, hipY - cL * s + perpY * k];
  const meta = {};

  // Beine (IK), Knie nach vorn
  const fF = { x: AX + P.fFx, y: gy - P.fFy };
  const fB = { x: AX + P.fBx, y: gy - P.fBy };
  const legF = ik(hipX + 4, hipY, fF.x, fF.y, THIGH, SHIN, -1);
  const legB = ik(hipX - 4, hipY, fB.x, fB.y, THIGH, SHIN, -1);
  if (P.kneel > 0.01) {
    const kx = hipX - 6 - P.kneel * 3, ky = gy - 2;
    legB.jx += (kx - legB.jx) * P.kneel; legB.jy += (ky - legB.jy) * P.kneel;
    legB.ex += (kx - 12 - legB.ex) * P.kneel; legB.ey += (gy - legB.ey) * P.kneel;
  }

  // Schultern, Hände
  const shF = { x: chX + perpX * 12, y: chY + perpY * 12 + 3 };
  const shB = { x: chX - perpX * 9.5, y: chY - perpY * 9.5 + 2 };
  const hF = { x: chX + P.hFx, y: chY + P.hFy };
  const aa = P.axe;
  const hB = P.grip > 0.5
    ? { x: hF.x - Math.cos(aa) * 7, y: hF.y - Math.sin(aa) * 7 }
    : { x: chX + P.hBx, y: chY + P.hBy };
  const armF = ik(shF.x, shF.y, hF.x, hF.y, UPPER, FORE, 1);
  const armB = ik(shB.x, shB.y, hB.x, hB.y, UPPER, FORE, 1);

  // Kopf
  const neckX = chX + sL * 2, neckY = chY - cL * 2;
  const hx = Math.round(neckX - 5 + P.head), hy = Math.round(neckY - 17 + P.headY);

  // --- 0. Flammenflügel (nur Phase 3, hinter allem)
  if (P.wing > 0.05) wings(g, chX - perpX * 4, chY + 3, P);

  // --- 1. Umhang aus Rauch mit brennendem Saum
  cape(p, g, chX - perpX * 3, chY + 1, gy, P);

  // --- 2. Hinteres Bein, hinterer Arm, hintere Schulter (dunkler)
  leg(p, g, hipX - 4, hipY, legB, true, P);
  bar(p, shB.x, shB.y, armB.jx, armB.jy, 6, 5.5, SKD);
  { const { Q, len } = axis(armB.jx, armB.jy, armB.ex, armB.ey);
    plate(p, [Q(-0.5, -4), Q(len * 0.5, -3.6), Q(len + 0.4, -3), Q(len + 0.4, 3), Q(len * 0.5, 3.6), Q(-0.5, 4)], OBD, { edge: 0.7, core: 1.4 });
    bar(p, ...Q(len * 0.8, 0), ...Q(len * 0.9, 0), 7.4, 7.2, BRD); }
  plate(p, [[armB.jx - 3, armB.jy - 0.4], [armB.jx - 1.2, armB.jy - 3], [armB.jx + 2, armB.jy - 2.6], [armB.jx + 3, armB.jy + 0.6], [armB.jx + 1, armB.jy + 2.8], [armB.jx - 2.2, armB.jy + 2.2]], OBD, { edge: 0.7, core: 1 });
  fist(p, g, armB.ex, armB.ey, false, P.cast > 0.3);
  meta.cast = { x: armB.ex, y: armB.ey - 4 };
  pauldron(p, g, shB.x - 2, shB.y - 2, 8, 6, false, P);

  if (extra.axeBehind) {
    const t = greataxe(p, g, hF.x, hF.y, aa, P.heat);
    meta.tip = { x: t.tipX, y: t.tipY }; meta.axe = { x: t.headX, y: t.headY };
  }

  // --- 3. Rumpf
  torso(p, g, along, P, meta);

  // --- 4. Vorderes Bein, Tassetten, Gürtel
  leg(p, g, hipX + 4, hipY, legF, false, P);
  belt(p, g, hipX, hipY, P, legF, legB);

  // --- 5. Halsberge und Kopf mit Hörnerkrone
  bar(p, neckX, neckY - 1.5, neckX + 0.8, neckY - 8, 5.5, 5, SK6);
  const gor = [[neckX - 6.4, neckY + 1.6], [neckX - 5.6, neckY - 2.6], [neckX - 1, neckY - 4.4], [neckX + 4.6, neckY - 3.4], [neckX + 6.6, neckY + 0.4], [neckX + 5, neckY + 2.2]];
  plate(p, gor, OB6, { edge: 0.8, core: 1.2 });
  trace(p, inset(gor, 1).slice(1, 5), BR6[4], false, BR6[1]);
  ember(p, g, [[neckX - 4, neckY + 1.4], [neckX + 4.4, neckY + 1.2]], 1);
  head(p, g, hx, hy, P, meta, gy);

  // --- 6. Schwung-Schleier
  if (extra.smear) smear(p, g, shF.x, shF.y, extra.smear[0], extra.smear[1], 30, 64);

  // --- 7. Vorderer Arm mit Axt
  const drawArm = () => {
    bar(p, shF.x, shF.y, armF.jx, armF.jy, 6.5, 6, SK6);
    const ex = armF.jx - (armF.ex - armF.jx) * 0.34, ey = armF.jy - (armF.ey - armF.jy) * 0.34;
    gem(p, armF.jx, armF.jy, ex, ey, 3.4, OB6);
    { // Armschiene: kantig, zum Ellbogen ausgestellt, Grat auf der Lichtseite
      const { Q, len } = axis(armF.jx, armF.jy, armF.ex, armF.ey);
      plate(p, [Q(0.5, -4.6), Q(len * 0.5, -4), Q(len + 0.4, -3.3), Q(len + 0.4, 3.3), Q(len * 0.5, 3.9), Q(0.5, 4.4)], OB6, { edge: 0.8, core: 1.6 });
      hair(p, ...Q(1.2, -1.2), ...Q(len - 0.6, -1), OB6[5]);
      hair(p, ...Q(1.2, -0.6), ...Q(len - 0.6, -0.5), OB6[1]);
    }
    // Armschiene: Messingband am Handgelenk, Lavanaht
    const fx = (t, o = 0) => armF.jx + (armF.ex - armF.jx) * t + o, fy = (t) => armF.jy + (armF.ey - armF.jy) * t;
    ember(p, g, [[fx(0.3), fy(0.3)], [fx(0.55, 0.6), fy(0.55)], [fx(0.75), fy(0.75)]], 1);
    bar(p, fx(0.8), fy(0.8), fx(0.9), fy(0.9), 8.2, 8, BR6, { caps: true });
    // Ellbogenkachel (kantig) mit Dorn nach hinten
    const jx = armF.jx, jy = armF.jy;
    plate(p, [[jx - 3.6, jy - 0.4], [jx - 1.6, jy - 3.4], [jx + 2.4, jy - 3], [jx + 3.6, jy + 0.6], [jx + 1.4, jy + 3.2], [jx - 2.6, jy + 2.6]], OB6, { edge: 0.9, lift: 0.5, core: 1.2 });
    rivet(p, armF.jx - 0.6, armF.jy - 0.6, BR6);
  };
  if (!extra.axeBehind) {
    drawArm();
    const t = greataxe(p, g, hF.x, hF.y, aa, P.heat);
    meta.tip = { x: t.tipX, y: t.tipY }; meta.axe = { x: t.headX, y: t.headY };
    fist(p, g, hF.x, hF.y, true, false);
  } else { drawArm(); fist(p, g, hF.x, hF.y, true, false); }
  pauldron(p, g, shF.x + 4, shF.y + 1, 9, 7, true, P);
  meta.hand = { x: hF.x, y: hF.y };

  // Feuer in der Zauberhand
  if (P.cast > 0.05) {
    const r = 1.5 + P.cast * 3.5, { x, y } = meta.cast;
    g.ellipse(x, y, r + 1.5, r + 1.5, 1);
    g.ellipse(x, y - 0.5, r, r, 2);
    g.ellipse(x, y - 1, Math.max(0.6, r - 1.8), Math.max(0.6, r - 1.8), 3);
    g.px(x, y - 1, 4);
    for (let i = 0; i < 5; i++) {
      const fx = x - r + hash2(i, Math.round(P.cast * 7), 3) * r * 2;
      g.line(fx, y - r, fx + (hash2(i, 2, 3) - 0.5) * 2, y - r - 2 - hash2(i, 5, 3) * 4, 2);
    }
  }
  return meta;
}

// Rumpf: gestaffelte Bauchschienen (eine Glutfuge), darüber ein schwerer Brustharnisch mit Mittelgrat und
// zwei Facetten, gotische Bauchplatte mit Messingrand, mittig der Glutkern in Messingfassung mit Krallen.
function torso(p, g, along, P, meta) {
  const sm = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  const top = (t, a) => (t > 0.9 ? a + (1 - a) * Math.sqrt(Math.max(0, 1 - ((t - 0.9) / 0.17) ** 2)) : 1);
  const hwB = (s) => { const t = s / SPINE; return (7 + 3.5 * sm(t)) * 1.16 * top(t, 0.55); };
  const hwF = (s) => { const t = s / SPINE; return (7 + 4.5 * sm(t) + (t > 0.48 && t < 0.98 ? 2 * Math.sin((t - 0.48) / 0.5 * Math.PI) : 0)) * 1.16 * top(t, 0.5); };
  const M = (list) => list.map(([s, k]) => along(s, k));
  const ST = SPINE + 1.5;
  // Grundform (Rückenplatte, Unterkleid)
  const base = [];
  for (let s = 0; s <= ST + 0.01; s += 2.25) base.push([s, -hwB(s)]);
  for (let s = ST; s >= -0.01; s -= 2.25) base.push([s, hwF(s)]);
  plate(p, M(base), OBD, { edge: 0.7, core: 2 });
  // Bauchschienen (von unten nach oben, obere überlappt untere)
  for (let i = 0; i < 3; i++) {
    const s0 = i * 4 - 0.4, s1 = i * 4 + 4.8;
    plate(p, M([[s0 + 0.9, -hwB(s0) + 0.6], [s1, -hwB(s1) + 0.3], [s1 + 0.5, 2], [s1, hwF(s1) - 0.2], [s0 + 0.8, hwF(s0) - 0.6], [s0, 2]]), OB6, { edge: 0.7, lift: i - 1.5, core: 1.4 });
    for (const k of [-5.5, 6]) rivet(p, ...along(s0 + 1.5, k), BR6);
    if (i === 1) ember(p, g, M([[7.9, -7.5], [6.9, 2], [7.7, 11]]), 2);
  }
  // Brustharnisch
  const bp = [[12.4, -hwB(12.4) + 1.2], [10.6, 1.6], [12.2, hwF(12.2) - 0.4], [16, hwF(16) + 0.2], [20.5, hwF(20.5) + 0.3], [24.5, hwF(24.5)], [27.6, hwF(27.6) - 1.2],
    [28.9, 5], [28.7, -2], [27.4, -hwB(27.4) + 2.4], [23, -hwB(23) + 1.4], [17, -hwB(17) + 1.2]];
  plate(p, M(bp), OB6, { edge: 1, core: 2.4, lift: 0.5 });
  // vordere Facette (vom Licht abgewandt) hinter dem Mittelgrat
  const fr = [[11.6, 3.2], [12.2, hwF(12.2) - 0.4], [16, hwF(16) + 0.2], [20.5, hwF(20.5) + 0.3], [24.5, hwF(24.5)], [27.6, hwF(27.6) - 1.2], [28.9, 5], [28.8, 3.2]];
  plate(p, M(fr), OB6, { edge: 0.4, core: 1.8, lift: -1.2, line: 0 });
  hair(p, ...along(12, 2.8), ...along(28.6, 2.8), OB6[5]);
  hair(p, ...along(12, 3.3), ...along(28.6, 3.3), OB6[0]);
  // Brustwölbung: Kante unter der Brust
  groove(p, M([[18.5, -8], [19.6, -3], [19.4, 2.4]]), OB6[1], OB6[4]);
  groove(p, M([[19.4, 3.6], [20.2, 9], [19.4, 13]]), OB6[0], OB6[3]);
  // gotische Bauchplatte, Spitze nach oben, Messingrand
  const pk = [[12.4, -hwB(12.4) + 1.2], [10.6, 1.6], [12.2, hwF(12.2) - 0.4], [15.2, hwF(15.2) - 0.2], [17.6, 3.2], [15, -hwB(15) + 1.2]];
  plate(p, M(pk), OB6, { edge: 0.8, core: 1.4 });
  trace(p, M([[15, -hwB(15) + 1.8], [17.2, 3.2], [15.2, hwF(15.2) - 0.8]]), BR6[4], false, BR6[1]);
  trace(p, M([[12.5, -hwB(12.5) + 1.8], [11.2, 1.6], [12.6, hwF(12.6) - 1]]), BR6[3], false, BR6[0]);
  // Halsausschnitt mit Messingrand und Nieten
  trace(p, M([[27.2, -hwB(27.2) + 3], [28.3, -2], [28.4, 5], [27.2, hwF(27.2) - 2]]), BR6[4], false, BR6[1]);
  for (const k of [-6, -1, 6]) rivet(p, ...along(27.4, k), BR6);
  // Kratzer
  for (const [s0, k0, s1, k1] of [[25.5, -5, 24, -2.5], [22.5, 7, 21.6, 9.4], [23.6, -8, 22.2, -6.4]]) hair(p, ...along(s0, k0), ...along(s1, k1), OB6[5]);
  // Glutrisse vom Kern durch die Platten (Phase 3 weißglühend)
  for (const c of [[[22, -4], [24.6, -5.4], [26.2, -7.6], [27.6, -9.4]], [[22, -4], [19.4, -6.4], [16.8, -7.4], [14.6, -5.6]], [[22, -4], [19.6, -1.6], [17.4, 0.8], [15.4, 0.2]]]) ember(p, g, M(c), 3);
  ember(p, g, M([[22, -4], [23.4, -0.6], [22.6, 2.6], [24, 5.4]]), 2);
  ember(p, g, M([[0.72 * SPINE, -9], [0.82 * SPINE, -7.2], [0.95 * SPINE, -9]]), 1);
  // Glutkern in Messingfassung
  const [cx, cy] = along(22, -4);
  const r = 2.2 + P.core * 0.7;
  for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) gem(p, cx + ox * (r + 3.2), cy + oy * (r + 2.9), cx + ox * (r + 1.1), cy + oy * (r + 1), 2, BR6);
  orb(p, cx, cy, r + 2.1, r + 1.9, BR6);
  orb(p, cx, cy, r + 1, r + 1, [VOID, VOID, OB6[0], OB6[1], OB6[1], OB6[2]], { glint: false });
  orb(p, cx, cy, r, r, MGR, { line: false });
  dotp(p, cx - r * 0.45, cy - r * 0.5, '#fffbea'); dotp(p, cx - r * 0.45 + 0.4, cy - r * 0.5, '#fffbea');
  g.ellipse(cx, cy, r + 2.6, r + 2.4, 0);
  g.ellipse(cx, cy, r + 0.5, r + 0.5, 1);
  g.ellipse(cx, cy, r - 0.3, r - 0.3, 2);
  g.ellipse(cx, cy - 0.3, Math.max(0.6, r - 1.4), Math.max(0.6, r - 1.4), 3);
  g.px(cx, cy - 0.5, 4);
  g.eellipse(cx, cy, r + 1.5, r + 1.2, 2);
  g.eellipse(cx, cy, r, r, 3);
  g.eellipse(cx, cy, Math.max(0.6, r - 1), Math.max(0.6, r - 1), 4);
  meta.chest = { x: cx, y: cy };
}

// Tassetten (Lamelle + hängende Platte, folgen den Oberschenkeln), Ledergürtel mit Messingnieten,
// Schnalle als Dämonenfratze mit Hörnern und glühenden Augen.
function belt(p, g, hipX, hipY, P, legF, legB) {
  const tas = [
    { x: hipX - 9, w: 6, len: 8, pl: OBD, br: BRD, sw: (legB.jx - hipX + 4) * 0.25 },
    { x: hipX - 3, w: 7, len: 10, pl: OB6, br: BR6, sw: 0 },
    { x: hipX + 4, w: 7, len: 10, pl: OB6, br: BR6, sw: (legF.jx - hipX - 4) * 0.3 },
  ];
  for (const t of tas) {
    const bx = t.x + t.sw + Math.sin(P.capeT + t.x) * 0.4, y0 = hipY - 0.5;
    plate(p, [[t.x - 0.2, y0 + 3], [t.x + t.w + 0.2, y0 + 3], [bx + t.w + 0.6, y0 + t.len - 1.6], [bx + t.w * 0.55, y0 + t.len + 0.4], [bx - 0.4, y0 + t.len - 1.4]], t.pl, { edge: 0.7, core: 1.2 });
    const lm = [[t.x - 0.5, y0], [t.x + t.w + 0.5, y0], [t.x + t.w + 0.7 + t.sw * 0.35, y0 + 4.4], [t.x - 0.6 + t.sw * 0.35, y0 + 4.4]];
    plate(p, lm, t.pl, { edge: 0.7, lift: 1, core: 1 });
    hair(p, t.x + t.sw * 0.35, y0 + 3.6, t.x + t.w + t.sw * 0.35, y0 + 3.6, t.br[4]);
    rivet(p, t.x + t.w * 0.5 + t.sw * 0.6, y0 + t.len - 2.6, t.br);
  }
  // Gürtel aus Leder mit Messingnieten
  plate(p, [[hipX - 11.6, hipY - 3.4], [hipX + 12.6, hipY - 3.9], [hipX + 12.6, hipY + 0.9], [hipX - 11.6, hipY + 1.1]], LT6, { edge: 0.6, core: 1 });
  for (let x = hipX - 10; x < hipX + 12; x += 3) rivet(p, x, hipY - 1.4, BR6);
  // Schnalle: Dämonenfratze
  const bx = hipX + 4, by = hipY - 2.5;
  gem(p, bx - 3, by - 3, bx - 5.6, by - 6.4, 2.2, BR6);
  gem(p, bx + 3, by - 3, bx + 5.6, by - 6.4, 2.2, BR6);
  plate(p, [[bx - 3.9, by - 3.7], [bx + 3.9, by - 3.7], [bx + 4.3, by + 0.6], [bx, by + 4.5], [bx - 4.3, by + 0.6]], BR6, { edge: 0.8, core: 1.1 });
  hair(p, bx - 3, by - 1.9, bx - 0.4, by - 0.9, BR6[5]); hair(p, bx + 0.4, by - 0.9, bx + 3, by - 1.9, BR6[4]);
  poly(p, [[bx - 2.6, by - 1.2], [bx - 0.6, by - 0.4], [bx - 1, by + 0.5], [bx - 2.4, by + 0.1]], VOID);
  poly(p, [[bx + 2.6, by - 1.2], [bx + 0.6, by - 0.4], [bx + 1, by + 0.5], [bx + 2.4, by + 0.1]], VOID);
  dotp(p, bx - 1.5, by - 0.2, EYE[1]); dotp(p, bx + 1.5, by - 0.2, EYE[1]);
  g.px(bx - 1.5, by - 0.2, 3); g.px(bx + 1.5, by - 0.2, 3);
  hair(p, bx - 1.8, by + 1.9, bx + 1.8, by + 1.9, VOID);
  for (const x of [-1.2, 1.2]) dotp(p, bx + x, by + 1.5, FANG[2]);
  g.px(bx, by + 1.9, 1);
}

// Bein: Oberschenkel verkohlte Haut mit Glutader, Beinschiene mit Mittelgrat (zwei Facetten) und Glutnaht,
// kantige Kniekachel mit Dorn, gestaffelter Sabaton mit Messingkappe und Hornkrallen.
function leg(p, g, hx, hy, L, back, P) {
  const pl = back ? OBD : OB6, sk = back ? SKD : SK6, br = back ? BRD : BR6, hn = back ? HND : HN6;
  bar(p, hx, hy, L.jx, L.jy, 9, 7.5, sk);
  const { Q, len } = axis(L.jx, L.jy, L.ex, L.ey - 4);
  plate(p, [Q(0.5, -4), Q(len * 0.4, -4.1), Q(len, -3.2), Q(len, 3.4), Q(len * 0.3, 4.4), Q(0.5, 4)], pl, { edge: 0.8, core: 1.6 });
  plate(p, [Q(0.8, 0.5), Q(0.6, 3.9), Q(len * 0.3, 4.3), Q(len - 0.3, 3.3), Q(len - 0.3, 0.4)], pl, { edge: 0.3, lift: -1, line: 0, core: 1.2 });
  hair(p, ...Q(1.2, 0.1), ...Q(len - 0.6, 0.1), pl[5]);
  ember(p, g, [Q(len * 0.6, -3.4), Q(len * 0.63, 0.2), Q(len * 0.58, 3.8)], 2, back);
  ember(p, g, [Q(len * 0.18, 1.6), Q(len * 0.36, 2.4), Q(len * 0.5, 1.8)], 1, back);
  {
    // Glutader im verkohlten Oberschenkel
    const a = axis(hx, hy, L.jx, L.jy);
    ember(p, g, [a.Q(a.len * 0.25, 1.2), a.Q(a.len * 0.5, 0.2), a.Q(a.len * 0.75, 1.4)], 1, back);
  }
  // Sabaton
  const ex = Math.round(L.ex), ey = Math.round(L.ey);
  gem(p, ex + 6.6, ey - 1.8, ex + 9.8, ey - 0.4, 2, hn);
  gem(p, ex + 5.8, ey - 0.6, ex + 9, ey + 0.6, 1.8, hn);
  plate(p, [[ex - 5.6, ey - 4.4], [ex + 2.6, ey - 5.6], [ex + 6.8, ey - 3.6], [ex + 7.6, ey + 0.6], [ex - 5.8, ey + 0.6]], pl, { edge: 0.8, core: 1.2 });
  plate(p, [[ex - 4.8, ey - 8], [ex + 2.6, ey - 8], [ex + 3.8, ey - 4.8], [ex - 0.5, ey - 3.8], [ex - 5.2, ey - 4.2]], pl, { edge: 0.8, lift: 1, core: 1 });
  plate(p, [[ex + 3.2, ey - 5.2], [ex + 6.4, ey - 3.7], [ex + 7.2, ey - 1.2], [ex + 4.2, ey - 2.2]], br, { edge: 0.5, core: 0.6 });
  hair(p, ex - 4.6, ey - 1.6, ex + 3.4, ey - 2.2, pl[1]);
  // Kniekachel mit Dorn
  gem(p, L.jx + 2, L.jy - 0.8, L.jx + 7.4, L.jy - 3, 3, pl);
  const kc = [[L.jx - 4.2, L.jy - 0.4], [L.jx - 2.4, L.jy - 3.8], [L.jx + 1.6, L.jy - 4.2], [L.jx + 4.4, L.jy - 1], [L.jx + 3.2, L.jy + 3.2], [L.jx - 2.6, L.jy + 3.6]];
  plate(p, kc, pl, { edge: 0.9, core: 1.4, lift: 0.5 });
  for (const [ox, oy] of [[-2.6, 1.6], [2.2, 1.8]]) rivet(p, L.jx + ox, L.jy + oy, br);
}

// Panzerhandschuh: Stulpe, Knöchelplatten, Messingnieten; offen = Hornkrallen nach oben (Zauber)
function fist(p, g, x, y, front, open) {
  const pl = front ? OB6 : OBD, br = front ? BR6 : BRD;
  if (open) for (const k of [-2, 0, 2]) hornQ(p, x + k * 0.8, y - 2.5, x + k * 1.1, y - 6, x + k * 1.5 + 0.6, y - 7.8, 1.6, 0.6, front ? HN6 : HND, { n: 4 });
  plate(p, [[x - 4.2, y - 3.2], [x + 3.2, y - 3.8], [x + 4.4, y - 0.5], [x + 3.6, y + 3], [x - 3.4, y + 3.2], [x - 4.6, y + 0.2]], pl, { edge: 0.7, core: 1.2 });
  if (!open) for (const k of [-2.6, 0, 2.6]) orb(p, x + k * 0.9 - 0.2, y - 3.1 - k * 0.12, 1.4, 1.1, pl);
  hair(p, x - 3.2, y + 0.4, x + 3.6, y - 0.2, pl[1]);
  hair(p, x - 3.2, y + 1.9, x + 3.4, y + 1.4, pl[1]);
  rivet(p, x - 2, y - 1, br); rivet(p, x + 1.2, y - 1.2, br);
}

// Schulterstück: kantige Kuppel mit Grat, zwei hängende Schienen (eine Glutfuge), Messingrand, nach hinten
// oben gebogene Obsidiandornen; vorn ein Glutriss in der Kuppel.
function pauldron(p, g, x, y, rx, ry, front, P) {
  const pl = front ? OB6 : OBD, br = front ? BR6 : BRD;
  const sp = front ? [[-5, 8.5, -2.4], [-1, 11, -2.1], [3, 7.5, -1.85]] : [[-3, 9.5, -2.25], [1, 6.5, -1.95]];
  for (const [ox, len, ang] of sp) {
    const bx = x + ox, by = y - ry * 0.55, tX = bx + Math.cos(ang) * len, tY = by + Math.sin(ang) * len;
    gem(p, bx, by, tX, tY, 3.6, pl);
    g.epx(tX, tY, 2);
  }
  for (let i = 2; i >= 1; i--) {
    const yy = y + ry - 2.5 + i * 2.6, rr = rx * (1 - i * 0.08), xx = x + i * 0.6;
    plate(p, [[xx - rr, yy - 1.5], [xx - rr * 0.3, yy - 2.2], [xx + rr * 0.9, yy - 1.6], [xx + rr, yy + 1], [xx + rr * 0.4, yy + 2.6], [xx - rr * 0.8, yy + 2.2]], pl, { edge: 0.6, lift: -1, core: 1 });
    hair(p, xx - rr * 0.75, yy + 1.5, xx + rr * 0.4, yy + 1.9, br[4]);
    if (front && i === 2) ember(p, g, [[xx - rr * 0.6, yy - 1.9], [xx + rr * 0.75, yy - 1.4]], 2);
  }
  const dome = [[x - rx * 1.02, y + 2], [x - rx * 0.8, y - ry * 0.5], [x - rx * 0.2, y - ry * 0.95], [x + rx * 0.55, y - ry * 0.75], [x + rx, y - ry * 0.1], [x + rx * 1.04, y + ry * 0.55], [x + rx * 0.3, y + ry * 0.75], [x - rx * 0.7, y + ry * 0.6]];
  plate(p, dome, pl, { edge: 1, core: 2.2 });
  const ins = inset(dome, 1.1);
  trace(p, [ins[5], ins[6], ins[7], ins[0]], br[4], false, br[1]);
  groove(p, [[x - rx * 0.6, y - ry * 0.35], [x + rx * 0.1, y - ry * 0.2], [x + rx * 0.85, y + ry * 0.2]], pl[1], pl[5]);
  for (const t of [0.15, 0.5, 0.85]) rivet(p, ins[7][0] + (ins[5][0] - ins[7][0]) * t, ins[7][1] + (ins[5][1] - ins[7][1]) * t - 0.9, br);
  if (front) {
    ember(p, g, [[x - 2.4, y - 2.4], [x + 1.6, y + 0.4], [x + 0.8, y + 3.6]], 3);
    ember(p, g, [[x + 1.6, y + 0.4], [x + 4.6, y - 1.6]], 2);
    dotp(p, x - rx * 0.62, y - ry * 0.42, '#fff0d8'); hair(p, x - rx * 0.6, y - ry * 0.44, x - rx * 0.1, y - ry * 0.82, SPEC);
  } else ember(p, g, [[x - 1, y - 1], [x + 2, y + 2]], 1, true);
}

// Flammenmähne: Feuerzungen wehen vom Helmrücken nach hinten oben.
// Im Grundbild deckend (gelber Kern, oranger Körper, rote Spitzen), dazu Glut.
function flameMane(p, g, hx, hy, P) {
  const n = 5;
  for (let f = 0; f < n; f++) {
    const rx = hx + 3.5 - f * 1.9, ry = hy + 3 + f * 1.8;
    const a = -2.05 - f * 0.24 - P.cape * 0.15;
    const L = (17 - Math.abs(f - 1.5) * 2 + Math.sin(P.capeT * 1.7 + f * 1.9) * 1.8) * (P.crown > 0.5 ? 0.4 : 1);
    for (let d = 0; d < L; d += 0.5) {
      const t = d / L;
      const wob = Math.sin(d * 0.45 + P.capeT * 2 + f * 1.3) * t * 2.2;
      const cx = rx + Math.cos(a) * d - Math.sin(a) * wob, cy = ry + Math.sin(a) * d + Math.cos(a) * wob;
      const hw = (1 - t) * 2.4 + 0.5;
      for (let k = -hw; k <= hw; k += 0.5) {
        const x = cx - Math.sin(a) * k, y = cy + Math.cos(a) * k;
        const e = Math.abs(k) / hw;
        const c = t > 0.78 ? MAG[1] : e > 0.7 ? MAG[2] : t < 0.35 && e < 0.4 ? HOT : MAG[3];
        p.px(x, y, c);
        const i = t > 0.78 ? 1 : e > 0.7 ? 2 : t < 0.35 && e < 0.4 ? 4 : 3;
        if (i > 1) g.apx(x, y, i - 2); g.epx(x, y, Math.min(4, i + 1));
      }
    }
    if (RS > 1) {
      // fein: gelbweißer Kern entlang der Flammenmitte, harte dunkelrote Spitze
      for (let d = 0; d < L * 0.7; d += 0.2) {
        const t = d / L, wob = Math.sin(d * 0.45 + P.capeT * 2 + f * 1.3) * t * 2.2;
        const x = rx + Math.cos(a) * d - Math.sin(a) * wob, y = ry + Math.sin(a) * d + Math.cos(a) * wob;
        const hw = ((1 - t) * 2.4 + 0.5) * (t < 0.3 ? 0.45 : 0.25);
        for (let k = -hw; k <= hw; k += 0.2) {
          const cx = x - Math.sin(a) * k, cy = y + Math.cos(a) * k;
          p.dot(cx, cy, t < 0.35 ? '#fffbe6' : HOT); g.dot(cx, cy, 4);
        }
      }
    }
  }
}

// Kopf: gehörnter Schmiedehelm mit Dämonenmaske in Dreiviertelansicht (Blick nach rechts): Helmglocke mit
// Messingband und Nackenschutz, schwerer Brauenwulst über tiefen Höhlen mit glühenden Schlitzaugen, Nasengrat,
// Wangenplatte, Maul mit Reißzähnen, beweglicher Unterkiefer mit Hauer. Zwei mächtige geriffelte Hörner (das nahe
// schwingt nach hinten, das ferne nach vorn) geben die Halbmond-Silhouette, dazwischen die Messingkrone.
const HZ = 1.25;   // Kopf etwas größer als die alte Pixelkarte, damit das Gesicht lesbar bleibt
function head(p, g, hx, hy, P, meta, gy) {
  const jo = P.jaw * 3;
  const J = (x, y) => [hx + 8 + (x - 8) * HZ, hy + 12 + (y - 12) * HZ];
  const M = (list) => list.map(([x, y]) => J(x, y));
  const lit = P.eye > 0.15, hot = P.eye > 0.6;
  flameMane(p, g, hx, hy, P);
  // Fernes Horn (dunkler), schwingt nach vorn oben
  horn2(p, g, J(9, 3), J(21, 1), J(19, -11), 4.5 * HZ, 1.2, HND, true);
  // Nackenschutz (gestaffelt)
  for (let i = 1; i >= 0; i--) plate(p, M([[-0.4 + i, 8.6 + i * 2.4], [5.6 + i, 8 + i * 2.4], [6.2 + i, 10.8 + i * 2.4], [0.2 + i, 11.4 + i * 2.4]]), OBD, { edge: 0.6, lift: 0.5 - i * 0.5, core: 0.8 });
  // Helmglocke mit Kamm und Messingband
  const dome = M([[0.4, 9.5], [0, 4.5], [2.4, 0.6], [7, -1], [11.6, 0.2], [14.2, 2.6], [14.6, 6.5], [10, 8.5], [5, 11], [1.5, 11.4]]);
  plate(p, dome, OB6, { edge: 1, core: 2 });
  groove(p, M([[2.6, 1.6], [7, 0], [11.4, 1.2]]), OB6[1], OB6[5]);
  plate(p, M([[0.2, 6.6], [10.8, 4.6], [11.2, 6.4], [0.5, 8.6]]), BR6, { edge: 0.5, core: 0.7 });
  for (const x of [2.4, 6.2, 9.6]) rivet(p, ...J(x, 7.4 - x * 0.19), BR6);
  ember(p, g, M([[5, 3.8], [6, 2.2], [7.2, 0.6]]), 2);
  // Schädelvisier aus angekohltem Knochen
  plate(p, M([[8.4, 2.2], [13, 1.2], [16.8, 2.4], [18.6, 4.6], [18.4, 7.4], [19.3, 9.2], [18.9, 10.9], [13, 11.3], [9.2, 10.9], [8, 7]]), BN6, { edge: 0.8, core: 1.6 });
  // Augenhöhlen, Nasenhöhle
  poly(p, M([[10.6, 5.2], [14.8, 5], [14.6, 8.1], [12.8, 8.9], [11.2, 8.3]]), VOID);
  poly(p, M([[16, 5], [18.2, 4.8], [17.9, 7.7], [16.4, 7.9]]), VOID);
  poly(p, M([[16.9, 8.4], [18.3, 8.6], [18, 10], [16.6, 9.8]]), VOID);
  hair(p, ...J(15.4, 5.6), ...J(15.6, 8.2), BN6[5]);
  // Brauenwulst (Licht)
  plate(p, M([[8.6, 3.2], [12.4, 2], [17.2, 3], [18.9, 4.4], [16, 5.6], [14.6, 5.5], [11.6, 5.8], [9, 6.2]]), BN6, { edge: 0.9, lift: 1.5, core: 1 });
  // Augen: glühende Schlitze, Kern weiß
  if (lit) {
    thick(p, ...J(11.9, 7.1), ...J(13.7, 6.6), 0.9 * HZ, EYE[0]);
    thick(p, ...J(12.2, 7), ...J(13.5, 6.6), 0.7 * HZ, hot ? HOT : EYE[1]);
    hair(p, ...J(12.4, 6.9), ...J(13.3, 6.6), hot ? '#fffbea' : EYE[2]);
    thick(p, ...J(16.6, 6.6), ...J(17.5, 6.4), 0.7 * HZ, hot ? HOT : EYE[1]);
    dotp(p, ...J(17, 6.5), '#fffbea');
    for (const [x, y, i] of [[12.8, 6.8, 4], [12.2, 7, 3], [13.5, 6.6, 3], [17, 6.5, 4]]) g.px(...J(x, y), i);
    for (const [x, y] of [[12.4, 7.6], [17, 7]]) g.px(...J(x, y), 2);
    if (P.eye > 0.7) for (const [x, y] of [[10.4, 6.8], [15, 6.2], [18.4, 6.2]]) g.px(...J(x, y), 1);
    g.epx(...J(9.6, 6.6), 2); g.epx(...J(8.8, 6.6), 1);
  } else { dotp(p, ...J(12.6, 6.6), EYE[0]); dotp(p, ...J(17, 6.2), EYE[0]); }
  // Jochbein mit Riss und Glutnaht
  plate(p, M([[9.4, 8.7], [12.8, 9], [15.6, 9.6], [14.6, 10.9], [10, 10.7]]), BN6, { edge: 0.8, lift: 0.5, core: 0.8 });
  hair(p, ...J(14.6, 3.2), ...J(13.8, 4.6), BN6[1]); hair(p, ...J(13.8, 4.6), ...J(14.3, 5.1), BN6[1]);
  ember(p, g, M([[9.3, 8.6], [10.4, 10.8]]), 2);
  // Maul: Schlund zwischen den Zahnreihen (Glut/Feueratem)
  poly(p, M([[10.4, 10.7], [19, 10.5], [19, 12 + jo], [10.4, 12.2 + jo]]), VOID);
  if (jo > 0.3) for (let x = 11; x <= 18.5; x += 0.5) for (let y = 11; y <= 11.4 + jo; y += 0.5) {
    const i = P.breath > 0.3 ? (x > 14 ? 4 : 3) : 1 + (x > 15 && P.jaw > 0.6 ? 1 : 0);
    g.px(...J(x, y), i);
  }
  for (const [x, w, l] of [[11.6, 1, 1.2], [12.9, 1.2, 1.6], [14.6, 1.6, 2.5], [16.3, 1.1, 1.4], [17.6, 1.2, 1.9]]) gem(p, ...J(x, 10.5), ...J(x + 0.2, 10.5 + l), w * HZ, FG6);
  // Unterkiefer mit Hauer
  plate(p, M([[9.6, 12.1 + jo], [18.9, 11.7 + jo], [18.4, 14 + jo], [15.4, 15.6 + jo], [11.4, 15.2 + jo], [9.3, 13.9 + jo]]), BN6, { edge: 0.7, lift: -1, core: 1.2 });
  for (const [x, l] of [[12.2, 1.2], [13.6, 1.6], [16.2, 1.4]]) gem(p, ...J(x, 12.3 + jo), ...J(x + 0.1, 12.3 + jo - l), 1.1 * HZ, FG6);
  hornQ(p, ...J(17.8, 12.9 + jo), ...J(20.3, 12.5 + jo), ...J(20.5, 9.2 + jo), 1.9 * HZ, 0.6, FG6, { n: 5 });
  rivet(p, ...J(10.6, 12.9 + jo), BR6);
  meta.eye = { x: J(12.7, 6)[0], y: J(12.7, 6)[1] };
  { const [x, y] = J(19.5, 11.4 + jo / 2); meta.mouth = { x, y }; }
  // Nahes Horn: mächtig, schwingt nach hinten und hoch
  horn2(p, g, J(5, 4), J(-9, 3), J(-7, -12), 6 * HZ, 1.2, HN6, true);
  // Krone aus Messing zwischen den Hörnern
  const [kx, ky] = J(2, 0);
  if (P.crown < 0.02) crownAt(p, g, kx, ky, 0, HZ);
  else {
    const cx = kx + P.crown * 12, cy = ky + (gy - 4 - ky) * Math.min(1, P.crown * P.crown);
    crownAt(p, g, cx, cy, P.crown, HZ);
  }
  { const [x, y] = J(8, -4); meta.head = { x, y }; }
}

// Messingkrone: Reif mit vier Zacken (glühende Spitzen), Glutstein in der Mitte; fall kippt sie (Tod/Sturz)
function crownAt(p, g, x, y, fall, s = 1) {
  const tilt = fall * 0.5, Y = (dx) => y + dx * s * tilt;
  for (const [dx, h] of [[1, 3], [4, 5], [7, 6.2], [10, 4]]) {
    const bx = x + dx * s, by = Y(dx) - 1.6 * s, lean = dx > 6 ? 0.8 : dx < 3 ? -0.4 : 0;
    const tX = bx + lean * s, tY = by - h * s;
    gem(p, bx, by + 0.3, tX, tY, 2.4 * s, BR6);
    if (fall < 0.9) { g.px(tX, tY, 3); g.epx(tX, tY - 1, 3); }
  }
  plate(p, [[x - 0.6, Y(0) - 2.2 * s], [x + 12.4 * s, Y(12) - 2.2 * s], [x + 12.4 * s, Y(12) + 0.8], [x - 0.6, Y(0) + 0.8]], BR6, { edge: 0.6, core: 0.8 });
  for (const dx of [2.5, 5.5, 9.5]) rivet(p, x + dx * s, Y(dx) - 0.7 * s, BR6);
  const gx = x + 7 * s, gyy = Y(7) - 0.7 * s;
  orb(p, gx, gyy, 1.3 * s, 1.2 * s, MGR, { line: true });
  g.px(gx, gyy, fall > 0.9 ? 1 : 3);
  g.epx(gx, gyy - 1, 2);
}

// Umhang: Rauchstoff mit Falten, hinten lang, Saum verkohlt und brennt (Glut in der Leucht-Ebene).
function cape(p, g, tx, ty, gy, P) {
  const len0 = Math.min(46, gy - ty - 3) - P.kneel * 6;
  const N = 30, top = [], bot = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, sx = tx - 10 + u * 20, tt = ty + Math.abs(u - 0.45) * 4;
    const fray = (hash2(i, 3, 27) - 0.5) * 3 * (i % 2 ? 1 : 0.4);
    const len = len0 - Math.abs(u - 0.4) * 10 + Math.sin(P.capeT + u * 4) * 2.5 + Math.sin(u * 23) * 1.5 + fray;
    const X = (v) => sx - P.cape * 18 * v * v - (1 - u) * 5 * v + Math.sin(P.capeT * 1.3 + v * 4 + u * 6) * 1.6 * v;
    top.push([X(0), tt]); bot.push([X(1), tt + len]);
  }
  cloth(p, [...top, ...bot.slice().reverse()], CP6, { fold: 4.6, phase: P.capeT * 0.3, hem: 4, seed: 5 });
  // verkohlter Saum, darüber Glut und Flammenzungen
  for (let i = 0; i < bot.length - 1; i++) {
    const [x0, y0] = bot[i], [x1, y1] = bot[i + 1];
    thick(p, x0, y0 - 1.4, x1, y1 - 1.4, 1.8, MAG[0]);
    hair(p, x0, y0 - 0.9, x1, y1 - 0.9, MAG[2]);
    hair(p, x0, y0 - 0.4, x1, y1 - 0.4, i % 3 === 0 ? MAG[3] : MAG[1]);
    g.px(x0, y0 - 1, 2); g.epx(x0, y0 - 1, 3);
    if (i % 2 === 0) {
      const fl = 2 + Math.round((Math.sin(P.capeT * 2 + i * 1.7) * 0.5 + 0.5) * 3 + hash2(i, 7, 5) * 2);
      for (let k = 0; k < fl; k++) {
        const idx = k === 0 ? 3 : k < fl / 2 ? 2 : 1;
        g.px(x0 + Math.sin(k * 0.8 + i) * 0.6, y0 - 1.5 - k, idx);
        g.epx(x0, y0 - 1.5 - k, idx + 1);
      }
      if (hash2(i, 9, 5) < 0.3) g.px(x0 - 1, y0 - fl - 3 - (hash2(i, 3, 5) * 4 | 0), 2);
    }
  }
  // Hoher Kragen hinter dem Kopf
  const kr = [[tx - 4.6, ty + 3], [tx - 4.8, ty - 6.6], [tx - 2.6, ty - 8.4], [tx + 1, ty - 7], [tx + 5, ty - 3.6], [tx + 5.6, ty + 3]];
  plate(p, kr, CP6, { edge: 0.8, lift: 1, core: 1.4 });
  for (const u of [-2.6, 0.6]) hair(p, tx + u, ty - 6.6, tx + u + 0.6, ty + 2, CP6[1]);
  hair(p, tx - 4.4, ty - 6.4, tx - 2.6, ty - 8, MAG[2]);
  for (let i = 0; i < 4; i++) g.epx(tx - 4.6 + i * 0.6, ty - 6.6 - i * 0.45, 2);
}

// Flammenflügel (nur Phase 3): Zungen aus Feuer, von der Schulter nach hinten oben.
function wings(g, rx, ry, P) {
  const s = P.wing;
  const sets = [
    { a0: -3.0, a1: -1.95, n: 6, L: 40, ox: -2, oy: 0 },
    { a0: -2.35, a1: -1.35, n: 5, L: 34, ox: 3, oy: -2 },
  ];
  for (const w of sets) {
    for (let f = 0; f < w.n; f++) {
      const a = w.a0 + ((w.a1 - w.a0) * f) / (w.n - 1);
      const L = w.L * s * (0.75 + 0.25 * Math.sin(f * 1.9 + 1)) * (f === 0 || f === w.n - 1 ? 0.8 : 1);
      for (let d = 0; d < L; d += 0.5) {
        const t = d / L;
        const wob = Math.sin(d * 0.35 + P.capeT * 2 + f * 1.3) * t * 3;
        const cx = rx + w.ox + Math.cos(a) * d - Math.sin(a) * wob, cy = ry + w.oy + Math.sin(a) * d * 0.95 + Math.cos(a) * wob;
        const hw = (1 - t) * 3 + 0.6;
        for (let k = -hw; k <= hw; k += 0.5) {
          const x = cx - Math.sin(a) * k, y = cy + Math.cos(a) * k;
          if (t > 0.6 && hash2(Math.round(x), Math.round(y), f + 3) < (t - 0.6) * 1.8) continue;
          const edge = Math.abs(k) / hw;
          const i = t < 0.18 ? 3 : t < 0.45 ? (edge > 0.6 ? 1 : 2) : t < 0.75 ? (edge > 0.5 ? 0 : 1) : 0;
          g.epx(x, y, i);
        }
      }
    }
  }
}

// ---------------------------------------------------------------- Tod

// Zerfall: die Rüstung bricht auseinander, Lava ergießt sich, die Krone rollt fort.
function drawCollapse(p, g, k) {
  const gy = AY, cx = AX + 2;
  // Lavalache, wächst und erkaltet am Rand
  const pr = 14 + k * 16;
  p.ellipse(cx, gy - 2, pr + 2, (pr + 2) * 0.32, MAG[0]);
  p.ellipse(cx, gy - 2, pr, pr * 0.3, MAG[1]);
  g.aellipse(cx, gy - 2, pr * 0.85, pr * 0.26, 1);
  g.aellipse(cx - 2, gy - 2, pr * 0.6, pr * 0.18, 2);
  g.aellipse(cx - 3, gy - 2, pr * 0.3, pr * 0.08, 3);
  g.eellipse(cx, gy - 2, pr * 0.85, pr * 0.24, 1);
  g.eellipse(cx - 2, gy - 2, pr * 0.55, pr * 0.15, 2);
  for (let i = 0; i < 16; i++) {
    const a = hash2(i, 1, 21) * Math.PI * 2, r = hash2(i, 2, 21) * pr * 0.8;
    g.px(cx + Math.cos(a) * r, gy - 2 + Math.sin(a) * r * 0.28, 3);
  }
  // Umhangfetzen
  p.ellipse(cx - 12, gy - 3, 10, 2.5, CAPE[1]); p.ellipse(cx - 14, gy - 4, 6, 1.5, CAPE[2]);
  // Axt liegt quer in der Lache
  greataxe(p, g, cx + 10, gy - 2, Math.PI + 0.1, 0);
  // Rüstungstrümmer
  const chunks = 13;
  for (let i = 0; i < chunks; i++) {
    const a = hash2(i, 3, 21) * Math.PI - Math.PI, r = 3 + hash2(i, 4, 21) * (10 + k * 14);
    const x = cx + Math.cos(a) * r * 1.2, y = gy - 3 + Math.sin(a) * r * 0.25 - (1 - k) * hash2(i, 5, 21) * 8;
    const w = 2 + hash2(i, 6, 21) * 3, h = 1.5 + hash2(i, 7, 21) * 2;
    p.ellipse(x, y, w, h, OBS[1]); p.ellipse(x - 0.5, y - 0.5, w - 1, h - 0.8, OBS[2]); p.px(x - w + 1.5, y - h + 1, OBS[4]);
    if (i % 3 === 0) { p.px(x + 1, y, MAG[2]); g.px(x + 1, y, 1); }
  }
  // Brustpanzer, aufgeplatzt, Kern verglimmt
  p.ellipse(cx - 2, gy - 6 + k * 2, 9, 5 - k, OBS[1]); p.ellipse(cx - 3, gy - 7 + k * 2, 7, 3.5 - k, OBS[2]);
  p.px(cx - 7, gy - 9 + k * 2, SPEC);
  p.ellipse(cx, gy - 6 + k * 2, 2.5, 2, MAG[1]);
  g.ellipse(cx, gy - 6 + k * 2, 2.5 - k, 2 - k, k < 0.6 ? 3 : 1);
  g.line(cx, gy - 6 + k * 2, cx - 6, gy - 9 + k * 2, 2); g.line(cx, gy - 6 + k * 2, cx + 5, gy - 3, 2);
  // Schulterplatten
  p.ellipse(cx - 16, gy - 4, 6, 3.5, OBS[1]); p.ellipse(cx - 17, gy - 5, 4, 2, OBS[3]);
  limb(p, cx - 18, gy - 7, cx - 21, gy - 12, 3, 1, [HORN[1], HORN[2], HORN[3], HORN[4]]);
  // Helm mit Hörnern liegt auf der Seite
  const hx = cx + 10, hy = gy - 12 + k * 3;
  p.ellipse(hx + 5, hy + 5, 6, 5, OBS[1]); p.ellipse(hx + 4.5, hy + 4.5, 4.5, 3.5, OBS[2]); p.px(hx + 2, hy + 2, SPEC);
  p.rect(hx + 7, hy + 6, 5, 3, OBS[2]); p.rect(hx + 8, hy + 7, 3, 1, VOID);
  if (k < 0.7) g.px(hx + 9, hy + 7, k < 0.3 ? 3 : 1);
  horn(p, g, hx + 2, hy + 3, hx - 6, hy - 2, hx - 7, hy - 10 + k * 3, 3.5, 1, HORN, false);
  horn(p, g, hx + 8, hy + 3, hx + 14, hy - 3, hx + 20, hy - 1 + k * 2, 3.5, 1, HORN, false);
  // Krone rollt weg
  crownAt(p, g, cx + 24 + k * 10, gy - 3, 1);
}

// ---------------------------------------------------------------- Frames

// Zeichnet einen Frame in Pixelpuffer, schneidet zu, baut Umriss + Leucht-Ebenen.
// Randlicht und Umriss: Oberkanten hell (Licht der Esse von oben), Seitenkanten
// etwas heller, danach ein dunkler 1-px-Umriss – die Figur hebt sich so klar vom
// dunklen Schmiedeboden ab.
function lighten(c, k, tr, tg, tb) {
  const r = c & 255, gg = (c >> 8) & 255, b = (c >> 16) & 255;
  return ((255 << 24) | (Math.round(b + (tb - b) * k) << 16) | (Math.round(gg + (tg - gg) * k) << 8) | Math.round(r + (tr - r) * k)) >>> 0;
}
function rimAndOutline(L) {
  const { base, ga, gb, nr } = L, W = TW;
  const out = base;   // an Ort und Stelle: Randlicht liest nur M und das eigene Pixel
  // nur im belegten Bereich (+1 für den Umriss); außerhalb ist alles leer. M = deckend, mit 2 Pixel Rand
  const X0 = Math.max(0, L.x0 - 1), X1 = Math.min(W - 1, L.x1 + 1), Y0 = Math.max(0, L.y0 - 1), Y1 = Math.min(TH - 1, L.y1 + 1);
  if (X1 < X0 || Y1 < Y0) return;
  const mw = X1 - X0 + 5, M = new Uint8Array(mw * (Y1 - Y0 + 5));
  for (let y = Y0; y <= Y1; y++) for (let x = X0, i = y * W + X0, m = (y - Y0 + 2) * mw + 2; x <= X1; x++, i++, m++) M[m] = base[i] !== 0 && !nr[i] ? 1 : 0;
  for (let y = Y0; y <= Y1; y++) for (let x = X0, i = y * W + X0, m = (y - Y0 + 2) * mw + 2; x <= X1; x++, i++, m++) {
    if (!base[i] || nr[i]) continue;
    const up = !M[m - mw], up2 = !M[m - 2 * mw];
    const lf = !M[m - 1], rt = !M[m + 1];
    if (up) out[i] = lighten(base[i], 0.45, 240, 190, 140);
    else if (up2 && (lf || rt)) out[i] = lighten(base[i], 0.3, 240, 190, 140);
    else if (rt) out[i] = lighten(base[i], 0.3, 255, 150, 80);   // Gegenlicht der Glut
    else if (lf) out[i] = lighten(base[i], 0.2, 200, 200, 214);
  }
  const O = col(OUTLINE), YC = (BCLIP + 1) * RS;
  for (let y = Y0; y <= Math.min(Y1, YC - 1); y++) for (let x = X0, i = y * W + X0, m = (y - Y0 + 2) * mw + 2; x <= X1; x++, i++, m++) {
    if (base[i] || ga[i] || gb[i]) continue;
    if (M[m - 1] || M[m + 1] || M[m - mw] || M[m + mw]) out[i] = O;
  }
}

function finish(L, fx, meta) {
  rimAndOutline(L);
  const W = TW, H = TH;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = Math.max(0, L.y0 - 1); y <= Math.min(H - 1, L.y1 + 1); y++) for (let x = Math.max(0, L.x0 - 1); x <= Math.min(W - 1, L.x1 + 1); x++) {
    const i = y * W + x;
    if (L.base[i] || L.ga[i] || L.gb[i]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) { x0 = y0 = 0; x1 = y1 = 1; }
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const toCanvas = (buf) => {
    const c = makeCanvas(cw, ch), ctx = c.getContext('2d');
    const img = ctx.createImageData(cw, ch), d = new Uint32Array(img.data.buffer);
    for (let y = 0; y < ch; y++) d.set(buf.subarray((y + y0) * W + x0, (y + y0) * W + x0 + cw), y * cw);
    ctx.putImageData(img, 0, 0);
    return c;
  };
  let f;
  if (RS === 1) {
    const baseC = toCanvas(L.base);
    f = buildFrame(cw, ch, BAX - x0, BAY - y0, (pc) => pc.ctx.drawImage(baseC, 0, 0), { res: 1 });
  } else {
    // fein: zweiter Umriss (1 Texel, Oberkante im Materialton) wie buildFrame, ohne Hochskalieren
    const d = new Uint32Array(cw * ch);
    for (let y = 0; y < ch; y++) d.set(L.base.subarray((y + y0) * W + x0, (y + y0) * W + x0 + cw), y * cw);
    f = new SpriteFrame(pixelsToCanvas(outlinePixels(d, cw, ch), cw + 2, ch + 2), BAX * RS - x0 + 1, BAY * RS - y0 + 1, RS);
  }
  f.glow = new GlowFrame(toCanvas(L.ga), BAX * RS - x0, BAY * RS - y0, RS);
  f.glowEnraged = new GlowFrame(toCanvas(L.gb), BAX * RS - x0, BAY * RS - y0, RS);
  f.meta = {};
  for (const k in meta) f.meta[k] = { dx: Math.round((meta[k].x - AX) * SC), dy: Math.round((meta[k].y - AY) * SC) };
  f.fx = fx ?? null;
  return f;
}

// Aufgeschoben (gfx/Sprite.js LazyFrame): gezeichnet wird erst, wenn die Animation den Frame braucht – der Zonenaufbau
// baut den Boss nicht mehr am Stück. atRes(fn) hält die Bildfeinheit (RS) vom Anlegen für den späteren Bau fest.
function atRes(fn) { const rs = RS; return () => { if (RS !== rs) setRes(rs); return fn(); }; }
function frame(...a) { return lazyFrame(atRes(() => frameNow(...a))); }
function frameNow(P, extra = {}) {
  const L = Layers.get();
  const meta = drawIgnaroth(new Pen(L), new GlowPen(L), P, extra);
  return finish(L, extra.fx, meta);
}

function collapseFrame(...a) { return lazyFrame(atRes(() => collapseFrameNow(...a))); }
function collapseFrameNow(k) {
  const L = Layers.get();
  drawCollapse(new Pen(L), new GlowPen(L), k);
  return finish(L, null, {
    head: { x: AX + 14, y: AY - 14 }, chest: { x: AX + 2, y: AY - 6 }, hand: { x: AX - 20, y: AY - 4 },
    tip: { x: AX - 4, y: AY - 14 }, eye: { x: AX + 19, y: AY - 5 }, mouth: { x: AX + 20, y: AY - 4 },
    cast: { x: AX, y: AY - 6 }, axe: { x: AX - 2, y: AY - 8 },
  });
}

function track(keys, n, { loop = false, extras = {} } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = loop ? i / n : n === 1 ? 1 : i / (n - 1);
    out.push(frame(sample(keys, t), extras[i] ?? {}));
  }
  return out;
}

export function createIgnarothSprites() {
  setRes(fineRes());
  // --- Grundposen
  const idleA = pose({ capeT: 0 });
  const idleB = pose({ hipY: 1, lean: 0.09, hFy: 19, hBy: 20, axe: -1.27, capeT: Math.PI, jaw: 0.25, core: 1.4, headY: 1 });

  // Gehen: schwere, stampfende Schritte, Oberkörper sackt beim Aufsetzen ein
  const walkKeys = [];
  for (let i = 0; i <= 8; i++) {
    const ph = (i / 8) * Math.PI * 2, s = Math.sin(ph), c = Math.cos(ph);
    walkKeys.push([i / 8, pose({
      hipX: 1, hipY: Math.abs(c) * -1.5 + 1.2, lean: 0.12 + Math.abs(s) * 0.04,
      fFx: 3 + s * 9, fFy: Math.max(0, -c) * 3.5, fBx: -5 - s * 9, fBy: Math.max(0, c) * 3.5,
      hFx: 11 + s * 1.5, hFy: 17 - Math.abs(s), hBx: -6 - s * 3, hBy: 18,
      axe: -1.22 + s * 0.06, cape: 0.5, capeT: ph, head: s * 0.5, headY: Math.abs(c) * 0.8,
    }), linear]);
  }

  // Schlafend: kniet auf dem Podest, die Axt vor sich in den Boden gerammt
  const kneel = pose({
    kneel: 1, lean: 0.3, fFx: 9, fBx: -12, hFx: 14, hFy: 9, grip: 1, axe: Math.PI / 2 - 0.06,
    head: 2, headY: 2, jaw: 0, eye: 0.3, core: 0.4, cape: 0, wing: 0.4,
  });
  const rise = pose({ kneel: 0.35, lean: 0.14, hipY: 2, fFx: 9, fBx: -11, hFx: 14, hFy: 11, grip: 1, axe: 1.35, head: 1, eye: 1, core: 1.2, cape: 0.3, wing: 0.8 });
  const roar = pose({ lean: -0.24, hipY: 1, hFx: 14, hFy: -14, axe: -1.95, hBx: -17, hBy: -3, jaw: 1, head: -1, headY: -1, core: 2, cape: 0.9, capeT: 2, cast: 0.5, fFx: 10, fBx: -11, wing: 1.25, heat: 1 });

  // Axthieb: weit hinter die Schulter ausholen, dann flacher Querschlag
  const cw1 = pose({ lean: -0.08, hipX: -1, hFx: -2, hFy: -6, grip: 1, axe: -2.45, jaw: 0.3, fFx: 10, fBx: -10, cape: 0.3 });
  const cw2 = pose({ lean: -0.22, hipX: -2, hipY: 2, hFx: -7, hFy: -9, grip: 1, axe: -2.85, jaw: 0.8, fFx: 11, fBx: -11, cape: 0.4, core: 1.5, heat: 1 });
  const cl1 = pose({ lean: 0.2, hipX: 2, hipY: 3, hFx: 17, hFy: -3, grip: 1, axe: -0.6, jaw: 1, fFx: 13, fBx: -12, cape: 0.8, capeT: 1, heat: 1 });
  const cl2 = pose({ lean: 0.42, hipX: 4, hipY: 5, hFx: 19, hFy: 12, grip: 1, axe: 0.55, jaw: 1, fFx: 14, fBx: -13, cape: 1, capeT: 2, heat: 1 });
  const cl3 = pose({ lean: 0.38, hipX: 3, hipY: 5, hFx: 15, hFy: 17, grip: 1, axe: 1.05, jaw: 0.5, fFx: 14, fBx: -13, cape: 0.6, capeT: 3, heat: 0.5 });
  const cl4 = pose({ lean: 0.18, hipX: 2, hipY: 3, hFx: 13, hFy: 17, grip: 0, axe: 0.2, jaw: 0.2, fFx: 12, fBx: -12, cape: 0.3, capeT: 4 });

  // Beben: Axt beidhändig über den Kopf, dann mit ganzem Gewicht in den Boden
  const sw1 = pose({ lean: -0.05, hFx: 5, hFy: -16, grip: 1, axe: -1.75, jaw: 0.5, fFx: 9, fBx: -10 });
  const sw2 = pose({ lean: -0.26, hipY: -2, hFx: 1, hFy: -21, grip: 1, axe: -2.3, jaw: 1, fFx: 10, fBx: -11, fBy: 2, core: 1.7, cape: 0.2, heat: 1 });
  const sl1 = pose({ lean: 0.3, hipY: 3, hFx: 18, hFy: -6, grip: 1, axe: -0.45, jaw: 1, fFx: 12, fBx: -11, cape: 0.9, heat: 1 });
  const sl2 = pose({ lean: 0.55, hipY: 9, hFx: 20, hFy: 13, grip: 1, axe: 1.2, jaw: 1, fFx: 13, fBx: -13, cape: 1, capeT: 1, core: 1.6, heat: 1 });
  const sl3 = pose({ lean: 0.5, hipY: 8, hFx: 19, hFy: 14, grip: 1, axe: 1.22, jaw: 0.6, fFx: 13, fBx: -13, cape: 0.5, capeT: 2, heat: 0.6 });
  const sl4 = pose({ lean: 0.2, hipY: 3, hFx: 14, hFy: 12, grip: 1, axe: 0.6, jaw: 0.2, fFx: 11, fBx: -11, cape: 0.2, capeT: 3 });

  // Feuerstoß: Luft holen (Kern schwillt an), dann vorbeugen und speien
  const bw1 = pose({ lean: -0.18, headY: -2, head: -1, jaw: 0.4, core: 1.8, hFx: 13, hFy: 19, axe: -1.0, hBx: -10, hBy: 14, cape: 0.3 });
  const bw2 = pose({ lean: -0.3, hipY: 1, headY: -3, head: -2, jaw: 0.7, core: 2.4, hFx: 12, hFy: 20, axe: -0.95, hBx: -12, hBy: 10, cape: 0.4, breath: 0.2 });
  const br1 = pose({ lean: 0.26, hipY: 3, head: 2, headY: 1, jaw: 1, breath: 1, core: 1.6, hFx: 14, hFy: 20, axe: -0.9, hBx: -9, hBy: 18, fFx: 11, fBx: -11, cape: 0.8, capeT: 0 });
  const br2 = pose({ ...br1, hipY: 4, lean: 0.29, headY: 2, core: 1.9, capeT: 2 });

  // Beschwörung: Klaue gen Himmel, Feuer sammelt sich
  const ca1 = pose({ lean: -0.1, hBx: -12, hBy: -12, cast: 0.6, jaw: 0.5, core: 1.5, axe: -1.1, hFy: 19, cape: 0.4 });
  const ca2 = pose({ lean: -0.2, hipY: -1, hBx: -15, hBy: -23, cast: 1, jaw: 1, core: 2, axe: -1.05, hFy: 19, head: -1, headY: -1, cape: 0.6, capeT: 2 });
  const ca3 = pose({ ...ca2, hipY: 2, lean: 0.1, hBx: -10, hBy: -20, cast: 0.8, capeT: 3 });

  // Ansturm: Schulter voran, Axt schleift hinterher
  const chW = pose({ lean: 0.48, hipY: 6, hFx: 3, hFy: 21, grip: 0, axe: 2.65, fFx: 12, fBx: -14, jaw: 1, cape: 0.5, core: 1.5, hBx: 10, hBy: 6 });
  const runKeys = [];
  for (let i = 0; i <= 6; i++) {
    const ph = (i / 6) * Math.PI * 2, s = Math.sin(ph), c = Math.cos(ph);
    runKeys.push([i / 6, pose({
      lean: 0.55, hipX: 3, hipY: 4 - Math.abs(c) * 2,
      fFx: 6 + s * 12, fFy: Math.max(0, -c) * 5, fBx: -4 - s * 12, fBy: Math.max(0, c) * 5,
      hFx: 1, hFy: 22, axe: 2.8 + s * 0.05, hBx: 10, hBy: 7, jaw: 1, cape: 1.1, capeT: ph * 2, core: 1.7, head: 1,
    }), linear]);
  }

  // Benommen: gebückt, Axt im Boden, Kopf wankt
  const stA = pose({ lean: 0.5, hipY: 7, hFx: 15, hFy: 18, axe: 1.42, head: 2, jaw: 1, eye: 0.3, core: 0.5, fFx: 9, fBx: -11, hBx: -1, hBy: 23 });
  const stB = pose({ ...stA, hipY: 8, lean: 0.46, head: -1, headY: 1, jaw: 0.6, eye: 0.6, core: 0.7, capeT: 2 });

  const hurtP = pose({ lean: -0.2, hipX: -2, head: -2, headY: -1, jaw: 0.8, hFx: 8, hFy: 15, axe: -1.6, core: 2, cape: 0.5 });

  // Tod: taumelt zurück, fällt auf die Knie, die Krone rutscht, kippt vornüber
  const d1 = pose({ lean: -0.32, hipX: -2, jaw: 1, head: -2, headY: -2, axe: -1.7, hFx: 9, hFy: 12, core: 2.6, cape: 0.6, heat: 1 });
  const d2 = pose({ kneel: 0.8, lean: 0.3, jaw: 1, head: 2, axe: 1.5, hFx: 15, hFy: 18, core: 1.4, eye: 0.6, hBx: 2, hBy: 22, crown: 0.25, wing: 0.5 });
  const d3 = pose({ kneel: 1, lean: 0.8, hipY: 4, jaw: 1, head: 4, headY: 2, axe: 0.15, hFx: 22, hFy: 24, core: 0.5, eye: 0.1, hBx: 12, hBy: 24, crown: 1, wing: 0 });

  const sweep = (a, b) => ({ smear: [a, b] });

  return {
    idle: new Animation(track([[0, idleA], [0.5, idleB], [1, idleA]], 6, { loop: true }), 6),
    walk: new Animation(track(walkKeys, 8, { loop: true, extras: { 0: { fx: 'step' }, 4: { fx: 'step' } } }), 8),
    dormant: new Animation(track([[0, kneel], [0.5, { ...kneel, core: 0.8, eye: 0.5, capeT: 2 }], [1, kneel]], 4, { loop: true }), 2.5),
    awaken: new Animation(track([
      [0, kneel], [0.2, { ...kneel, eye: 1, core: 1 }], [0.45, rise], [0.62, pose({ ...roar, jaw: 0.3, core: 1.4 })], [0.78, roar, snap], [1, { ...roar, capeT: 4 }],
    ], 13, { extras: { 10: { fx: 'roar' } } }), 7.2, false),
    roar: new Animation(track([[0, idleA], [0.3, roar, snap], [0.8, { ...roar, capeT: 5 }], [1, roar]], 8, { extras: { 2: { fx: 'roar' } } }), 6.5, false),
    cleaveWindup: new Animation(track([[0, idleA], [0.45, cw1], [1, cw2]], 5, { extras: { 3: { axeBehind: true }, 4: { axeBehind: true } } }), 8, false),
    cleave: new Animation(track([[0, cl1], [0.2, cl2, snap], [0.45, cl3], [1, cl4]], 6, {
      extras: { 0: sweep(-2.7, -0.6), 1: { ...sweep(-1.5, 0.55), fx: 'impact' }, 2: sweep(0.1, 1.05) },
    }), 14, false),
    slamWindup: new Animation(track([[0, idleA], [0.4, sw1], [1, sw2]], 6), 8, false),
    slam: new Animation(track([[0, sl1], [0.16, sl2, snap], [0.55, sl3], [1, sl4]], 7, {
      extras: { 0: sweep(-2.4, -0.45), 1: { ...sweep(-1.1, 1.2), fx: 'impact' } },
    }), 12, false),
    breathWindup: new Animation(track([[0, idleA], [0.5, bw1], [1, bw2]], 5), 7, false),
    breath: new Animation(track([[0, br1], [0.5, br2], [1, br1]], 4, { loop: true }), 10),
    cast: new Animation(track([[0, idleA], [0.35, ca1], [0.7, ca2], [1, ca3]], 7, { extras: { 4: { fx: 'cast' } } }), 8, false),
    chargeWindup: new Animation(track([[0, idleA], [0.5, pose({ ...chW, lean: 0.3, hipY: 3 })], [1, chW]], 5, { extras: { 4: { fx: 'step' } } }), 7, false),
    charge: new Animation(track(runKeys, 6, { loop: true, extras: { 0: { fx: 'step' }, 3: { fx: 'step' } } }), 13),
    stagger: new Animation(track([[0, stA], [0.5, stB], [1, stA]], 4, { loop: true }), 5),
    hurt: new Animation(track([[0, hurtP], [1, idleA]], 3), 12, false),
    death: new Animation([
      ...track([[0, hurtP], [0.25, d1], [0.6, d2, snap], [1, d3]], 8, { extras: { 4: { fx: 'impact' }, 7: { fx: 'impact' } } }),
      collapseFrame(0), collapseFrame(0.35), collapseFrame(0.7), collapseFrame(1),
    ], 6.5, false),
  };
}
