import { PAL } from '../gfx/Palette.js';
import { makeCanvas, flipCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame, SpriteFrame, Animation, lazyFrame } from '../gfx/Sprite.js';
import { fineRes, outlinePixels, pixelsToCanvas } from '../gfx/Fine.js';
import { hash2 } from '../core/math.js';
import { plate, bar, orb, gem, hornQ, poly, hair, inset, trace, rivet, cloth, strands, dotp } from './bossPaint.js';

// Malgareth, der Aschenfürst – Endboss des Aschethrons (Stufe 40).
//
// Riesenhafter gefallener König aus Asche und Obsidian (rund 84 px bis zur Kronenspitze,
// fast dreimal so groß wie der Held): breite Obsidian-Schulterstücke mit Goldkanten und
// Dornen, polierter Kürass mit Goldwappen und glühendem Herz, karminroter Königsmantel mit
// Goldsaum, aschfahles hageres Gesicht mit weißglühenden Augen, Aschebart, hohe Goldkrone
// mit Glutsteinen und lodernden Flammen, großes Flammberg-Schwert.
//
// Rig mit Zwei-Gelenk-IK (Arme, Beine), Schlüsselposen mit weicher Interpolation.
// Drei Gestalten (form), jede Animation gibt es je Gestalt:
//   1  steht am Boden, Glut gedämpft
//   2  schwebt (hover), Flügel aus Rauch mit Glutrippen, Mantelsaum zerfasert zu Rauch
//   3  volle Gestalt: Flammenflügel, Risse weißglühend, Kronenflammen lodern
// Namen: '<anim>' (Gestalt 1), '<anim>_2', '<anim>_3'. Dazu Einzelanimationen:
//   dormant, awaken (1), ascend (1→2), unleash (2→3), channelUp/channel (3), death (3).
// Leucht-Ebene frame.glow (additiv, ohne Umriss). Randlicht: Oberkanten kühl,
// Vorderkanten glutrot, damit die dunkle Figur auf dunklem Obsidianboden steht.
// Blickrichtung rechts, Anker = Mitte zwischen den Füßen (am Boden, auch wenn er schwebt).
// Animationen werden erst beim ersten Zugriff gebaut (Getter), der Boss wärmt sie vor.
// Frame-Meta: hand, tip, blade, cast, chest, eye, mouth, head, crown, ground.
const W = 340, H = 262, AX = 166, AY = 248;

// Leitfarbe: Aschweiß/Knochengrau (Plattenrüstung aus gebleichtem Knochen und Asche) – bewusst
// anders als das Violett/Gold seiner Thronwachen; hebt sich hell vom dunklen Thronboden ab.
const OBS = ['#1e1918', '#3b3330', '#665b55', '#978b81', '#c6bcb0', '#ede6da'];
const SPEC = '#fffcf2';
const ASH = ['#241e1e', '#3e3634', '#5e5450', '#857a72', '#b0a69a', '#ddd4c6'];
const HAIR = ['#141114', '#262024', '#3c3438', '#6e6670', '#a8a0ac'];
// Haut: aschfahl, leicht warm – hebt sich deutlich von Haar, Krone und Rüstung ab
const SKIN = ['#221a1e', '#42343a', '#6a5c5c', '#8e8078', '#b4a594', '#d6c8b2'];
// Kanten und Beschläge: verkohlt im Schatten, glutorange im Licht (kein Gold – das tragen die Wachen)
const GOLD = ['#140d0b', '#2e201a', '#54392b', '#c4652a', '#f6a457'];
// Krone: glühendes Schmiedeeisen (Glutorange)
const CROWNC = ['#160c09', '#33190f', '#5e2a14', '#c4561c', '#ffab52'];
// Klinge: schwarzes Glas (Kontrast zur hellen Rüstung)
const BLK = ['#0b0909', '#1a1615', '#2c2624', '#463d3a', '#6c625c', '#a0958c'];
const ROBE = ['#1e070c', '#3c0d15', '#5e141d', '#851f25', '#ae3330', '#d0523c'];
const SMOKE = ['#100d0c', '#1e1a18', '#2f2926', '#433b37', '#5b524c', '#776c64'];
const MAG = ['#2a0804', '#5a1206', '#8e2408', '#d8501a', '#ffb048'];
const LEATHER = PAL.leather;
const IRON = ['#141218', '#2a2630', '#46404e', '#6c6476'];
const VOID = '#07040a';
const ASHDUST = ['#3a3430', '#5a524c', '#8a8279', '#b8b0a4', '#d8d0c4'];
// Leucht-Rampen (dunkel -> hell)
const EMB = ['#5a1406', '#a8300a', '#f0661a', '#ffb048', '#fff0c0'];
const INF = ['#8a2a08', '#ff6a14', '#ffc048', '#fff4c8', '#ffffff'];

// Pose-Werte (Pixel) sind für die alte, kleinere Figur notiert und werden mit K skaliert.
// S: Endboss-Maßstab (Phase 1 rund 82 × 122 px mit Mantel, Kragen und Krone), alle Körpermaße skaliert.
const S = 1.3;
const K = 1.15 * S;
const SCALED = ['hipX', 'hipY', 'fFx', 'fFy', 'fBx', 'fBy', 'hFx', 'hFy', 'hBx', 'hBy', 'hover', 'head', 'headY'];
const THIGH = 23, SHIN = 23, SPINE = 36, UPPER = 19, FORE = 19, HIPH = 45;
const BLADE = 70;
// Höchster Punkt (über dem Boden) für Schwertspitze und Schwung-Schleier in Gestalt 3
const FLAT_TOP = 140;

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
const rgbOf = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255];
const pack = (r, g, b) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
const EMBc = EMB.map(col), INFc = INF.map(col);

// Feinraster (docs/STYLE.md „Feinraster“, Stufe B): die Puffer haben RS Texel je Weltpixel (RS = fineRes() beim Bau,
// bei „Niedrig“ 1 = alles wie früher). Rig-Koordinaten bleiben Weltpixel; px setzt einen Weltpixel-Fußabdruck an
// der auf das Feinraster gerundeten Lage (Formen rastern so im Feinraster neu, keine Hochskalierung), Pixelkarten
// (Gesicht) landen auf ganzen Weltpixeln, dot/fline/t* setzen einzelne Texel (Handfein-Details, nur bei RS > 1).
let RS = 1, TW = W, TH = H;
function setRes(r) { RS = r; TW = W * r; TH = H * r; }
// Texel, in dem der Mittelpunkt des Weltpixels (x, y) … (x + 1, y + 1) liegt, bzw. Mitte eines Punkts x
const TX = (x) => Math.floor((x + 0.5) * RS);

// Ein gemeinsamer Puffer für alle Frames (spart Speicher-Umschlag beim Bauen);
// reset() leert nur das zuletzt benutzte Hüllrechteck.
class Layers {
  constructor() {
    this.base = new Uint32Array(TW * TH); this.glow = new Uint8Array(TW * TH);
    this.x0 = TW; this.y0 = TH; this.x1 = -1; this.y1 = -1;
  }
  reset() {
    if (this.x1 >= 0) {
      for (let y = this.y0; y <= this.y1; y++) {
        const a = y * TW + this.x0, b = y * TW + this.x1 + 1;
        this.base.fill(0, a, b); this.glow.fill(0, a, b);
      }
    }
    this.x0 = TW; this.y0 = TH; this.x1 = -1; this.y1 = -1;
    return this;
  }
  touch(x, y) {
    if (x < this.x0) this.x0 = x; if (x > this.x1) this.x1 = x;
    if (y < this.y0) this.y0 = y; if (y > this.y1) this.y1 = y;
  }
}
let shared = null;
const layers = () => (shared && shared.base.length === TW * TH ? shared : (shared = new Layers())).reset();
let SCRATCH = null;

// Grundbild: deckt darunter liegendes Glühen ab. clip = unterste erlaubte Zeile (Weltpixel).
class Pen {
  constructor(L) { this.L = L; this.clip = AY; }
  px(x, y, c) {
    if (RS === 1) {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= W || y >= H || y > this.clip) return;
      const i = y * W + x;
      this.L.base[i] = col(c); this.L.glow[i] = 0; this.L.touch(x, y);
      return;
    }
    this.blk(Math.round(x * RS), Math.round(y * RS), col(c));
  }
  // RS×RS-Block ab Texel (X, Y)
  blk(X, Y, v) {
    const L = this.L, yc = (this.clip + 1) * RS;
    let x0 = X, y0 = Y, x1 = X + RS - 1, y1 = Y + RS - 1;
    if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0; if (x1 >= TW) x1 = TW - 1; if (y1 >= TH) y1 = TH - 1; if (y1 >= yc) y1 = yc - 1;
    if (x1 < x0 || y1 < y0) return;
    const B = L.base, G = L.glow;
    for (let yy = y0; yy <= y1; yy++) for (let i = yy * TW + x0, e = yy * TW + x1; i <= e; i++) { B[i] = v; G[i] = 0; }
    L.touch(x0, y0); L.touch(x1, y1);
  }
  // ein Texel (Farbwert v bzw. Farbe c)
  setv(X, Y, v) {
    if (X < 0 || Y < 0 || X >= TW || Y >= TH || Y >= (this.clip + 1) * RS) return;
    const i = Y * TW + X;
    this.L.base[i] = v; this.L.glow[i] = 0; this.L.touch(X, Y);
  }
  t(X, Y, c) { this.setv(X, Y, col(c)); }
  // Maler für sprites/bossPaint.js: Punkt x entspricht der Mitte des Weltpixels x (wie dot)
  get step() { return 1 / RS; }
  each(x0, y0, x1, y1, fn) {
    const yc = (this.clip + 1) * RS;
    const F0 = Math.max(0, Math.floor((x0 + 0.5) * RS)), F1 = Math.min(TW - 1, Math.ceil((x1 + 0.5) * RS));
    const G0 = Math.max(0, Math.floor((y0 + 0.5) * RS)), G1 = Math.min(Math.min(TH, yc) - 1, Math.ceil((y1 + 0.5) * RS));
    for (let G = G0; G <= G1; G++) for (let F = F0; F <= F1; F++) { const c = fn((F + 0.5) / RS - 0.5, (G + 0.5) / RS - 0.5); if (c) this.setv(F, G, col(c)); }
  }
  pdot(x, y, c) { this.setv(TX(x), TX(y), col(c)); }
  // Feindetails: ein Texel in der Mitte von (x, y), feine Linie (1 Texel) zwischen zwei Punkten
  dot(x, y, c) { this.setv(TX(x), TX(y), col(c)); }
  fline(x0, y0, x1, y1, c) { const v = col(c); bres(TX(x0), TX(y0), TX(x1), TX(y1), (X, Y) => this.setv(X, Y, v)); }
  rect(x, y, w, h, c) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
  }
  line(x0, y0, x1, y1, c) {
    if (RS === 1) { bres(x0, y0, x1, y1, (x, y) => this.px(x, y, c)); return; }
    const v = col(c); bres(x0 * RS, y0 * RS, x1 * RS, y1 * RS, (X, Y) => this.blk(X, Y, v));
  }
  ellipse(cx, cy, rx, ry, c) {
    if (RS === 1) { fillEllipse(cx, cy, rx, ry, (x, y) => this.px(x, y, c)); return; }
    const v = col(c); fillEllipseT(cx, cy, rx, ry, (X, Y) => this.setv(X, Y, v));
  }
}

// Leucht-Ebene: Index 0 (dunkle Glut) … 4 (weiß). px überschreibt, max nur heller. t*/dot/fline: einzelne Texel.
class GlowPen {
  constructor(L) { this.L = L; this.clip = AY; }
  px(x, y, i) {
    if (RS > 1) { this.#blk(Math.round(x * RS), Math.round(y * RS), i, false); return; }
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H || y > this.clip || i < 0) return;
    this.L.glow[y * W + x] = Math.min(4, Math.round(i)) + 1; this.L.touch(x, y);
  }
  max(x, y, i) {
    if (RS > 1) { this.#blk(Math.round(x * RS), Math.round(y * RS), i, true); return; }
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H || y > this.clip || i < 0) return;
    const k = y * W + x, v = Math.min(4, Math.round(i)) + 1;
    if (this.L.glow[k] < v) { this.L.glow[k] = v; this.L.touch(x, y); }
  }
  #blk(X, Y, i, keep) {
    if (i < 0) return;
    for (let j = 0; j < RS; j++) for (let k = 0; k < RS; k++) keep ? this.tmax(X + k, Y + j, i) : this.tset(X + k, Y + j, i);
  }
  tset(X, Y, i) {
    if (X < 0 || Y < 0 || X >= TW || Y >= TH || Y >= (this.clip + 1) * RS || i < 0) return;
    this.L.glow[Y * TW + X] = Math.min(4, Math.round(i)) + 1; this.L.touch(X, Y);
  }
  tmax(X, Y, i) {
    if (X < 0 || Y < 0 || X >= TW || Y >= TH || Y >= (this.clip + 1) * RS || i < 0) return;
    const k = Y * TW + X, v = Math.min(4, Math.round(i)) + 1;
    if (this.L.glow[k] < v) { this.L.glow[k] = v; this.L.touch(X, Y); }
  }
  dot(x, y, i) { this.tmax(TX(x), TX(y), i); }
  fline(x0, y0, x1, y1, i) { bres(TX(x0), TX(y0), TX(x1), TX(y1), (X, Y) => this.tmax(X, Y, i)); }
  line(x0, y0, x1, y1, i) {
    if (RS === 1) { bres(x0, y0, x1, y1, (x, y) => this.max(x, y, i)); return; }
    bres(x0 * RS, y0 * RS, x1 * RS, y1 * RS, (X, Y) => this.#blk(X, Y, i, true));
  }
  ellipse(cx, cy, rx, ry, i) {
    if (RS === 1) { fillEllipse(cx, cy, rx, ry, (x, y) => this.max(x, y, i)); return; }
    fillEllipseT(cx, cy, rx, ry, (X, Y) => this.tmax(X, Y, i));
  }
}

function bres(x0, y0, x1, y1, f) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let n = 0, N = 500 * RS; n < N; n++) {
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
// fein: Texelmitten abtasten (f bekommt Texelkoordinaten). Mitte wie px (x + 0,5), Rand wie das grobe Raster (+0,4)
function fillEllipseT(cx, cy, rx, ry, f) {
  if (rx <= 0 || ry <= 0) return;
  const X = (cx + 0.5) * RS, Y = (cy + 0.5) * RS, ex = (rx + 0.4) * RS, ey = (ry + 0.4) * RS;
  for (let y = Math.floor(Y - ey); y <= Math.ceil(Y + ey); y++) {
    const v = (y + 0.5 - Y) / ey, t = 1 - v * v;
    if (t < 0) continue;
    const h = ex * Math.sqrt(t);
    for (let x = Math.ceil(X - h - 0.5); x + 0.5 <= X + h; x++) f(x, y);
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
  hipX: 0, hipY: 0, lean: 0.04, head: 0, headY: 0, nod: 0, jaw: 0,
  fFx: 7, fFy: 0, fBx: -7, fBy: 0,
  hFx: 9, hFy: 21, hBx: -7, hBy: 21,
  sw: 1.18, grip: 0, cape: 0.25, capeT: 0, cast: 0, eye: 1, core: 1, kneel: 0,
  hover: 0, wing: 0, wingT: 0, wingFire: 0, crack: 0, inferno: 0, crownF: 0, flame: 0,
  ash: 0, crownDrop: 0, robe: 0, spread: 0, hair: 0, noSword: 0,
  // flat: Gestalt 3 bleibt niedrig (Flügel seitlich statt hoch, Schwert nie steil über dem Kopf),
  // damit der Fürst auch bei 480×270 unter der Boss-Leiste ganz im Bild bleibt (Gesamthöhe ≤ FLAT_TOP)
  flat: 0,
};
// Gestalt-Grundwerte (werden auf die Pose addiert)
const FORMS = {
  1: { hover: 0, wing: 0, wingFire: 0, crack: 0.25, inferno: 0, crownF: 0.55, flame: 0.55 },
  2: { hover: 10, wing: 0.72, wingFire: 0.25, crack: 0.6, inferno: 0, crownF: 0.9, flame: 0.85 },
  3: { hover: 4, wing: 1, wingFire: 1, crack: 1, inferno: 1, crownF: 1.05, flame: 1.25, flat: 1 },
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

// Glühender Riss entlang eines Zickzacks (Punkte), Helligkeit nach crack
function crackLine(g, pts, P, base = 1) {
  const i = base + (P.crack > 0.55 ? 1 : 0) + (P.crack > 0.9 ? 1 : 0);
  for (let k = 0; k < pts.length - 1; k++) g.line(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], k === 0 ? i : i - 1);
}

// Feuriger Schwung-Schleier (goldgelb innen, glutrot außen) um einen Drehpunkt.
function smear(p, g, cx, cy, a0, a1, r0, r1, yMin = -1e9) {
  if (Math.abs(a1 - a0) > 1.7) a0 = a1 - Math.sign(a1 - a0) * 1.7;
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1), span = hi - lo || 1;
  // fein: Texel abtasten, Dichte-Zufall aber je Weltpixel (sonst flimmert der Schleier)
  const R1 = Math.ceil(r1) * RS, CX = Math.round(cx * RS), CY = Math.round(cy * RS), V = new Map();
  const cv = (c) => { let v = V.get(c); if (v === undefined) V.set(c, (v = col(c))); return v; };
  let XA = -R1, XB = R1, YA = -R1, YB = R1;
  if (RS > 1) {
    // fein: nur das Hüllrechteck des Ringsektors abtasten
    let mx0 = 0, mx1 = 0, my0 = 0, my1 = 0, first = true;
    for (let q = 0; q <= 16; q++) for (const r of [r0, r1]) {
      const a = lo + (hi - lo) * q / 16, x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (first) { mx0 = mx1 = x; my0 = my1 = y; first = false; }
      if (x < mx0) mx0 = x; if (x > mx1) mx1 = x; if (y < my0) my0 = y; if (y > my1) my1 = y;
    }
    XA = Math.max(XA, Math.floor(mx0 * RS) - 3); XB = Math.min(XB, Math.ceil(mx1 * RS) + 3);
    YA = Math.max(YA, Math.floor(my0 * RS) - 3, Math.floor((yMin - cy) * RS) - 2); YB = Math.min(YB, Math.ceil(my1 * RS) + 3);
  }
  for (let Y = YA; Y <= YB; Y++) for (let X = XA; X <= XB; X++) {
    const xs = (X + 0.5) / RS - 0.5, ys = (Y + 0.5) / RS - 0.5;   // bei RS = 1 genau X, Y
    const x = RS === 1 ? X : Math.floor(X / RS), y = RS === 1 ? Y : Math.floor(Y / RS);
    const d = Math.hypot(xs, ys);
    if (d < r0 || d > r1 || cy + ys < yMin) continue;
    let a = Math.atan2(ys, xs);
    while (a < lo - Math.PI) a += Math.PI * 2;
    while (a > lo + Math.PI) a -= Math.PI * 2;
    if (a < lo || a > hi) continue;
    const fresh = a1 > a0 ? (a - lo) / span : (hi - a) / span;
    const radial = (d - r0) / (r1 - r0);
    const inner = 1 - fresh * 0.75;
    if (radial < inner * 0.9) { if (hash2(x + 99, y + 99, 23) > 0.12 * fresh) continue; }
    else if (radial < inner && hash2(x + 99, y + 99, 23) > 0.5) continue;
    if (fresh < 0.12 && hash2(x, y, 24) > fresh * 6) continue;
    const c = radial > 0.9 ? '#fff0c0' : radial > 0.78 ? '#ffb048' : radial > inner + 0.1 ? '#e0501a' : '#7a200c';
    if (RS === 1) p.px(cx + x, cy + y, c); else p.setv(CX + X, CY + Y, cv(c));
    if (fresh > 0.3 && radial > 0.45) {
      const gi = radial > 0.9 ? 4 : radial > 0.74 ? 3 : fresh > 0.7 ? 2 : 1;
      if (RS === 1) g.max(cx + x, cy + y, gi); else g.tmax(CX + X, CY + Y, gi);
    }
  }
}

// ---------------------------------------------------------------- Figur

// ---------------------------------------------------------------- Figur

function drawFigure(p, g, P0, ex = {}) {
  const P = { ...P0 };
  for (const k of SCALED) P[k] *= K;
  const hov = P.hover > 0.05 ? P.hover + Math.sin(P.capeT) * 1.4 : 0;
  const gy = AY - Math.round(hov);
  const lean = P.lean, sL = Math.sin(lean), cL = Math.cos(lean);
  const hipX = AX + P.hipX, hipY = gy - HIPH + P.hipY + P.kneel * 13 * S;
  const chX = hipX + sL * SPINE, chY = hipY - cL * SPINE;
  const perpX = cL, perpY = sL;
  const along = (s, k) => [hipX + sL * s + perpX * k, hipY - cL * s + perpY * k];
  const meta = {};
  const dang = Math.min(1, hov / (9 * S));

  // Beine: im Schweben hängen die Füße locker, Zehen nach unten
  const fF = { x: AX + P.fFx + (P.fFx * -0.55 + 4) * dang, y: gy - P.fFy - dang * 4 };
  const fB = { x: AX + P.fBx + (P.fBx * -0.4 - 6) * dang, y: gy - P.fBy - dang * 1 };
  const legF = ik(hipX + 4.5, hipY, fF.x, fF.y, THIGH, SHIN, -1);
  const legB = ik(hipX - 4.5, hipY, fB.x, fB.y, THIGH, SHIN, -1);
  if (P.kneel > 0.01) {
    const kx = hipX - 8 - P.kneel * 4, ky = gy - 2;
    legB.jx += (kx - legB.jx) * P.kneel; legB.jy += (ky - legB.jy) * P.kneel;
    legB.ex += (kx - 19 - legB.ex) * P.kneel; legB.ey += (gy - legB.ey) * P.kneel;
  }

  // Schultern, Hände
  const shF = { x: chX + perpX * 5, y: chY + perpY * 5 + 4 };
  const shB = { x: chX - perpX * 6.5, y: chY - perpY * 6.5 + 3 };
  const hF = { x: chX + P.hFx, y: chY + P.hFy };
  const flat = P.flat > 0.5;
  if (flat) {
    // Gestalt 3: Hand höchstens knapp über Kopfhöhe, Klinge flacher statt senkrecht nach oben
    hF.y = Math.max(hF.y, gy - 116);
    const lim = gy - FLAT_TOP + 4;
    if (hF.y + Math.sin(P.sw) * BLADE < lim) {
      const s = Math.max(-1, Math.min(1, (lim - hF.y) / BLADE));
      P.sw = Math.cos(P.sw) >= 0 ? Math.asin(s) : -Math.PI - Math.asin(s);
    }
  }
  const hB = P.grip > 0.5
    ? { x: hF.x - Math.cos(P.sw) * 8, y: hF.y - Math.sin(P.sw) * 8 }
    : { x: chX + P.hBx, y: chY + P.hBy };
  const armF = ik(shF.x, shF.y, hF.x, hF.y, UPPER, FORE, 1);
  const armB = ik(shB.x, shB.y, hB.x, hB.y, UPPER, FORE, 1);

  // Kopf
  const neckX = chX + sL * 4, neckY = chY - cL * 4;
  const hx = neckX - 7.6 * HZ + P.head, hy = neckY - 17.6 * HZ + P.headY;

  // --- 0. Flügel (hinter allem)
  if (P.wing > 0.03) wings(p, g, chX - perpX * 4, chY + 4, P);
  // --- 1. Königsmantel
  cape(p, g, chX - perpX * 5, chY + 1, gy, P, dang);

  // --- 3. hinteres Bein, hinterer Arm
  skirtBack(p, g, hipX, hipY, gy, P);
  leg(p, g, hipX - 4.5, hipY, legB, true, P, dang);
  bar(p, shB.x, shB.y, armB.jx, armB.jy, 6 * S, 5 * S, IRON5);
  bar(p, armB.jx, armB.jy, armB.ex, armB.ey, 5.5 * S, 4.5 * S, OBSD);
  orb(p, armB.jx, armB.jy, 3.4, 3.2, OBSD);
  crackLine(g, [[armB.jx, armB.jy + 1], [(armB.jx + armB.ex) / 2 - 1, (armB.jy + armB.ey) / 2], [armB.ex, armB.ey - 1]], P, 0);
  bracer(p, g, armB, true);
  if (P.grip <= 0.5) chain(p, g, armB.ex, armB.ey, P);
  claw(p, g, armB.ex, armB.ey, [VOID, OBS[1], OBS[2], OBS[3]], P.cast > 0.3 || P.spread > 0.4, false);
  meta.cast = { x: armB.ex, y: armB.ey - 6 };
  pauldron(p, g, shB.x - 1, shB.y - 1, 6 * S, 4.5 * S, false, P);

  if (ex.swordBehind && P.noSword < 0.5) {
    const t = sword(p, g, hF.x, hF.y, P.sw, P);
    meta.tip = { x: t.tipX, y: t.tipY }; meta.blade = { x: t.midX, y: t.midY };
  }

  // --- 4. Rumpf
  torso(p, g, along, P, meta);
  hairBack(p, g, hx, hy, P);
  // --- 5. vorderes Bein, Gürtel, Wappenrock
  leg(p, g, hipX + 4.5, hipY, legF, false, P, dang);
  belt(p, g, hipX, hipY, gy, P, legF, dang);

  // --- 6. Halsberge, Kopf, Krone
  bar(p, neckX - 1, neckY + 2, neckX + 1, neckY - 6, 7, 6, SKIN6, { caps: false });
  plate(p, [[neckX - 9.5, neckY + 3.4], [neckX - 8, neckY - 2.4], [neckX - 1, neckY - 3.4], [neckX + 7.4, neckY - 2.6], [neckX + 9.6, neckY + 2.8], [neckX, neckY + 5.4]], OBS, { edge: 0.8 });
  hair(p, neckX - 8, neckY - 1.8, neckX + 7.4, neckY - 2, TRIM[4]); hair(p, neckX - 9, neckY + 1, neckX + 9, neckY + 0.8, TRIM[2]);
  head(p, g, hx, hy, P, meta);

  // --- 7. Schwung-Schleier
  if (ex.smear) smear(p, g, shF.x, shF.y, ex.smear[0], ex.smear[1], 30 * S, 74 * S, flat ? gy - FLAT_TOP : -1e9);

  // --- 8. vorderer Arm mit Schwert
  bar(p, shF.x, shF.y, armF.jx, armF.jy, 6.5 * S, 5.5 * S, IRON5, { lift: 1 });
  bar(p, armF.jx, armF.jy, armF.ex, armF.ey, 6 * S, 5 * S, ASHR);
  crackLine(g, [[armF.jx, armF.jy + 1], [(armF.jx + armF.ex) / 2 + 1, (armF.jy + armF.ey) / 2], [armF.ex - 1, armF.ey - 2]], P, 1);
  // Ellbogenkachel mit Fächer und Dorn
  { const { Q } = axis(armF.jx, armF.jy, armF.ex, armF.ey);
    plate(p, [Q(-3, -3.6), Q(-4.4, 1.2), Q(-1, 4.6), Q(3.4, 3.6), Q(3.6, -3)], OBS, { edge: 0.8 });
    gem(p, ...Q(-2.4, 3), ...Q(-6.5, 6.5), 2.4, OBS); }
  bracer(p, g, armF, false);
  if (!ex.swordBehind && P.noSword < 0.5) {
    const t = sword(p, g, hF.x, hF.y, P.sw, P);
    meta.tip = { x: t.tipX, y: t.tipY }; meta.blade = { x: t.midX, y: t.midY };
  }
  if (P.noSword >= 0.5) { meta.tip = { x: hF.x, y: hF.y }; meta.blade = { x: hF.x, y: hF.y }; }
  claw(p, g, hF.x, hF.y, [OBS[1], OBS[3], OBS[4], OBS[5]], false, true);
  if (P.grip > 0.5) claw(p, g, hB.x, hB.y, [OBS[1], OBS[3], OBS[4], OBS[5]], false, true);
  pauldron(p, g, shF.x + 0.5, shF.y - 0.5, 8 * S, 5.5 * S, true, P);
  meta.hand = { x: hF.x, y: hF.y };

  // Glut in der Zauberhand
  if (P.cast > 0.05) {
    const r = 1.4 + P.cast * 3.8, { x, y } = meta.cast;
    g.ellipse(x, y, r + 1.5, r + 1.5, 0);
    g.ellipse(x, y, r + 0.5, r + 0.5, 1);
    g.ellipse(x, y - 0.5, r - 0.5, r - 0.5, 2);
    g.ellipse(x, y - 1, Math.max(0.6, r - 1.6), Math.max(0.6, r - 1.6), 3);
    g.max(x, y - 1, 4);
    for (let i = 0; i < 6; i++) {
      const fx = x - r + hash2(i, Math.round(P.capeT * 3), 3) * r * 2;
      g.line(fx, y - r, fx + (hash2(i, 2, 3) - 0.5) * 2, y - r - 2 - hash2(i, Math.round(P.capeT * 2), 5) * 5, 2);
    }
  }
  // Rauchschleier unter dem Schwebenden
  if (dang > 0.05) smokeTrail(p, g, hipX, gy, P, dang);
  meta.ground = { x: AX, y: AY };
  return meta;
}

// ---------------------------------------------------------------- Neuzeichnung (03.11.)
// Formen aus Platten und runden Strängen (sprites/bossPaint.js): dunkle Innenkontur zwischen den Teilen, je Material
// 5–6 harte Stufen mit Lichtkante, Kernschatten auf der abgewandten Seite. Brust und Schultern hell (Knochenasche),
// Bauchschienen und Beinzeug verrußt dunkler, Kanten aus glühendem Schmiedeeisen, Glutrisse sparsam.
const TRIM = ['#140d0b', '#2e201a', '#54392b', '#8a4a24', '#c4652a', '#f6a457'];
const TRIMD = ['#0c0807', '#1c1412', '#2e201a', '#46301e', '#5e3a20'];
const OBSD = ['#0e0b0b', '#1e1918', '#2c2523', '#3b3330', '#4e4440', '#665b55'];
const ASHR = ['#120e0e', ...ASH];
const ROBE6 = ROBE, ROBED = ['#0e0306', '#1e070c', '#2e0a10', '#3c0d15', '#4e1118'];
const SKIN6 = ['#120c0e', ...SKIN.slice(1), '#efe4d0'];
const HAIR6 = ['#0a080a', ...HAIR];
const MAG6 = ['#1a0503', ...MAG];
const IRON5 = ['#0a090c', ...IRON];

function groove(p, pts, dark, light) {
  for (let i = 0; i < pts.length - 1; i++) {
    hair(p, pts[i][0], pts[i][1] + 0.5, pts[i + 1][0], pts[i + 1][1] + 0.5, light);
    hair(p, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], dark);
  }
}
function axis(x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
  let nx = -uy, ny = ux;
  if (nx < 0) { nx = -nx; ny = -ny; }
  return { len, Q: (s, o) => [x0 + ux * s + nx * o, y0 + uy * s + ny * o] };
}
// Glutriss: Malfläche + Leuchtebene, heißer Kern (fein)
function ember(p, g, pts, P, base = 1) {
  const i = base + (P.crack > 0.55 ? 1 : 0) + (P.crack > 0.9 ? 1 : 0);
  for (let k = 0; k < pts.length - 1; k++) {
    const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
    hair(p, x0 + 0.4, y0 + 0.4, x1 + 0.4, y1 + 0.4, MAG[1]);
    hair(p, x0, y0, x1, y1, k === 0 ? MAG[4] : MAG[3]);
    g.fline(x0, y0, x1, y1, Math.max(1, (k === 0 ? i : i - 1) + 1));
    g.line(x0, y0, x1, y1, k === 0 ? i - 1 : i - 2);
  }
}

// ---------------------------------------------------------------- Flammberg
// Klinge aus schwarzem Glas mit gewellten, glutflüssigen Schneiden; Parierstange aus Schmiedeeisen mit Glutsteinen.
function sword(p, g, hx, hy, a, P) {
  const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
  const at = (u, v) => [hx + dx * u + nx * v, hy + dy * u + ny * v];
  const litSide = nx * -0.6 + ny * -0.8 > 0 ? 1 : -1;
  const heat = P.flame;
  // Griff, Knauf
  bar(p, ...at(-12, 0), ...at(2.5, 0), 3.4, 3.2, LEATHER.length >= 5 ? LEATHER : ['#1a0d0b', ...LEATHER]);
  for (let u = -11; u < 2; u += 1.8) hair(p, ...at(u, -1.6), ...at(u + 0.9, 1.6), '#1a0d0b');
  orb(p, ...at(-15, 0), 3.4, 3.4, OBS);
  { const [x, y] = at(-15, 0); orb(p, x, y, 1.4, 1.4, MAG6, { glint: false }); dotp(p, x - 0.4, y - 0.4, '#fff0c0'); g.dot(x, y, 4); g.max(x, y, 2); }
  // Parierstange: geschwungene Arme mit Glutstein-Enden
  plate(p, [at(2.5, -4), at(6.5, -3.4), at(6.5, 3.4), at(2.5, 4)], TRIM, { edge: 0.7 });
  for (const sd of [-1, 1]) {
    plate(p, [at(3, 3 * sd), at(6, 3 * sd), at(8.6, 11.5 * sd), at(6.6, 12.4 * sd), at(3.4, 6 * sd)], TRIM, { edge: 0.6 });
    const [x, y] = at(7.4, 11.4 * sd); dotp(p, x, y, MAG[4]); g.max(x, y, 2);
  }
  { const [x, y] = at(4.5, 0); orb(p, x, y, 1.8, 1.8, MAG6, { glint: false }); dotp(p, x - 0.5, y - 0.5, '#fff0c0'); g.max(x, y, 4); g.dot(x, y, 4); }
  // Klinge
  const L = BLADE;
  const hwAt = (u) => {
    const t = (u - 6.5) / (L - 6.5);
    const taper = (t < 0.82 ? 3.3 - t * 1.1 : ((1 - t) / 0.18) * 2.4) * 1.25;
    return Math.max(0.3, taper + 0.7 * Math.sin(u * 0.55) * (t < 0.85 ? 1 : 0));
  };
  const mid = [], e1 = [], e2 = [];
  for (let u = 6.5; u <= L + 0.01; u += 0.75) { const w = 0.35 * Math.sin(u * 0.55), h = hwAt(u); mid.push(at(u, w)); e1.push(at(u, w + h)); e2.push(at(u, w - h)); }
  plate(p, [...mid, ...e1.slice().reverse()], BLK, { edge: 0.6, lift: litSide > 0 ? 1 : -1, glint: false, core: 0.6 });
  plate(p, [...mid, ...e2.slice().reverse()], BLK, { edge: 0.6, lift: litSide < 0 ? 1 : -1, glint: false, core: 0.6 });
  // glutflüssige Schneiden, Glanz auf der Lichtfacette, Glutrunen in der Kehle
  for (let u = 7; u <= L - 0.5; u += 0.4) {
    const w = 0.35 * Math.sin(u * 0.55), h = hwAt(u);
    for (const s of [1, -1]) {
      const [x, y] = at(u, w + s * (h - 0.35));
      dotp(p, x, y, s === litSide ? (heat > 0.5 ? '#fff4d0' : MAG[4]) : MAG[3]);
      g.dot(x, y, s === litSide ? (heat > 0.8 ? 4 : 3) : heat > 0.8 ? 3 : 2);
    }
    if (u > 14 && u < L * 0.6) dotp(p, ...at(u, w + litSide * h * 0.45), u > 18 && u < 26 ? '#ffffff' : BLK[5]);
    if (u > 10 && u < L - 9 && Math.round(u * 2) % 9 === 0) { const [x, y] = at(u, w); dotp(p, x, y, MAG[4]); dotp(p, x + 0.5, y, MAG[3]); g.max(x, y, heat > 0.9 ? 3 : 2); }
  }
  const [tx, ty] = at(L, 0), [mx, my] = at(L * 0.55, 0);
  return { tipX: tx, tipY: ty, midX: mx, midY: my };
}

// ---------------------------------------------------------------- Rumpf
// Kürass aus Knochenasche: gewölbte Brustplatte mit Mittelgrat, glutgeränderter Halsausschnitt, drei verrußte
// Bauchschienen, glühendes Herz in einer Eisenfassung, Risse vom Herz durch den Panzer.
function torso(p, g, along, P, meta) {
  const A = (list) => list.map(([s, k]) => along(s, k));
  // Bauchschienen (unten zuerst, die obere überlappt die untere)
  for (let i = 0; i < 3; i++) {
    const s0 = 1 + i * 5.6, w0 = 7.6 + i * 0.6, w1 = 8.4 + i * 0.9;
    const band = A([[s0 - 1, -w0], [s0 - 1.4, w0 + 0.6], [s0 + 6.4, w1 + 1], [s0 + 6.8, -w1]]);
    plate(p, band, ASHR, { edge: 0.7, core: 1.4, lift: -1 });
    hair(p, ...along(s0 - 0.6, -w0 + 0.6), ...along(s0 - 1, w0), TRIM[3]);
    for (const k of [-w0 + 2.4, 0.5, w0 - 1.8]) rivet(p, ...along(s0 + 1, k), TRIM);
  }
  // Brustplatte: zwei gewölbte Hälften mit Mittelgrat, hinten die Rückenplatte
  const back = A([[17.5, -10.5], [17.5, 2], [37, 2], [37.5, -9], [33, -13.5], [24, -13]]);
  plate(p, back, OBSD, { edge: 0.9, core: 2.4 });
  const breast = A([[17, -3], [17.4, 10.6], [22, 13.6], [28, 15.4], [33.6, 13.6], [37, 8], [37.4, 1], [33, -3.5], [24, -4.5]]);
  plate(p, breast, OBS, { edge: 0.9, core: 2.8 });
  groove(p, A([[19, 4.5], [27, 5.6], [35.5, 4.6]]), OBS[1], OBS[5]);
  groove(p, A([[21, 6], [24, 11.6], [27.6, 14.2]]), OBS[2], OBS[4]);
  trace(p, inset(breast, 1.4), TRIM[4], false, TRIM[1]);
  // Glanzbogen und Kratzer
  { const q = A([[33.5, -1.5], [30, 0.5], [27, 1]]); hair(p, ...q[0], ...q[1], SPEC); hair(p, ...q[1], ...q[2], OBS[5]); }
  for (const [s0, k0, s1, k1] of [[30, 9, 28, 11], [21, -8, 19, -6], [25, -11, 23, -10]]) hair(p, ...along(s0, k0), ...along(s1, k1), OBS[2]);
  // Halsausschnitt mit glühendem Eisenrand
  const neck = A([[36.2, -10], [34.6, -4], [35.2, 3], [36.6, 9], [38.4, 9.6], [38.6, -10.6]]);
  plate(p, neck, TRIM, { edge: 0.6 });
  for (let k = -9; k <= 8; k += 1.2) { const [x, y] = along(37.4 - Math.abs(k - 0.5) * 0.12, k); g.max(x, y, k < -2 ? 1 : 0); }
  // Herz: Eisenfassung, Glutkern
  const [kx, ky] = along(SPINE * 0.62, 5.5);
  const r = (1.7 + P.core * 0.6) * S;
  plate(p, [[kx - r - 2.6, ky], [kx, ky - r - 3], [kx + r + 2.6, ky], [kx, ky + r + 3]], TRIM, { edge: 0.7 });
  orb(p, kx, ky, r + 0.6, r * 0.9 + 0.6, ['#07040a', '#1a0503', '#2a0804', '#2a0804', '#5a1206']);
  orb(p, kx, ky, r, r * 0.85, MAG6, { line: false });
  dotp(p, kx - 0.5, ky - 0.5, '#fff8e0'); dotp(p, kx, ky - 0.5, '#fff0c0');
  g.ellipse(kx, ky, r + 0.4, r, 1);
  g.ellipse(kx, ky, Math.max(0.5, r - 0.6), Math.max(0.5, r - 0.8), 2 + (P.crack > 0.55 ? 1 : 0));
  g.max(kx, ky, P.core > 1.4 || P.crack > 0.9 ? 4 : 3); g.dot(kx - 0.5, ky - 0.5, 4);
  meta.chest = { x: kx, y: ky };
  // Risse vom Herz durch den Panzer (ab Gestalt 2 mehr)
  const cracks = [
    [[0.62, 5.5], [0.7, 2], [0.78, 0.5], [0.9, -4]],
    [[0.62, 5.5], [0.52, 9], [0.42, 8], [0.3, 11]],
    [[0.62, 5.5], [0.74, 9.5], [0.86, 12]],
    [[0.62, 5.5], [0.5, 2], [0.4, -2], [0.28, -4.5]],
  ];
  cracks.forEach((c, n) => { if (n > 1 && P.crack < 0.5) return; ember(p, g, c.map(([s, k]) => along(s * SPINE, k)), P, n > 1 ? 1 : 2); });
}

// Rückwärtiger Rock: karminroter Stoff hinter den Beinen mit glühendem Saum
function skirtBack(p, g, hipX, hipY, gy, P) {
  const len = Math.min(33, gy - hipY - 8), sw = 4 + P.cape * 9;
  const pts = [[hipX - 13, hipY - 1], [hipX + 2, hipY - 1], [hipX + 1 - sw * 0.8, hipY + len], [hipX - 6 - sw, hipY + len + 2], [hipX - 13 - sw * 0.9, hipY + len - 1]];
  cloth(p, pts, ROBED, { fold: 3.5, phase: P.capeT * 0.4, hem: 2.5 });
  hair(p, pts[2][0], pts[2][1] - 0.6, pts[3][0], pts[3][1] - 0.6, TRIM[3]); hair(p, pts[3][0], pts[3][1] - 0.6, pts[4][0], pts[4][1] - 0.6, TRIM[3]);
}

// Bein: Diechling (Platte über dem Oberschenkel), Kniebuckel mit Fächer und Dorn, Beinröhre mit Grat und zwei
// Glutschlitzen, spitzer Eisenschuh (im Schweben zeigen die Zehen nach unten)
function leg(p, g, hx, hy, L, back, P, dang) {
  const pl = back ? OBSD : ASHR, tr = back ? TRIMD : TRIM;
  bar(p, hx, hy, L.jx, L.jy, 8.6 * S, 7 * S, back ? OBSD : OBS, { lift: back ? 0 : -1 });
  const { len, Q } = axis(L.jx, L.jy, L.ex, L.ey - 2);
  plate(p, [Q(0.5, -4.6), Q(0.5, 5.2), Q(len * 0.4, 5.6), Q(len, 4), Q(len + 0.8, -3.6), Q(len * 0.45, -4.8)], pl, { edge: 0.8 });
  hair(p, ...Q(2, 2), ...Q(len - 1, 1.5), pl[pl.length - 1]); hair(p, ...Q(2, 2.6), ...Q(len - 1, 2.1), pl[1]);
  for (const f of [0.42, 0.62]) {
    const [x0, y0] = Q(len * f, -0.6), [x1, y1] = Q(len * f + 2.2, -0.9);
    hair(p, x0, y0, x1, y1, back ? MAG[1] : MAG[3]); dotp(p, x0, y0, back ? MAG[2] : MAG[4]);
    g.max(x0, y0, back ? 0 : 1 + (P.crack > 0.6 ? 1 : 0)); if (!back) g.dot(x0, y0, 3);
  }
  // Kniebuckel mit Fächer und kurzem Dorn nach vorn
  plate(p, [Q(-4, -4), Q(-5.6, 1), Q(-2.6, 6.6), Q(3, 7), Q(4.4, 1.6), Q(2, -4)], back ? OBSD : OBS, { edge: 0.8 });
  orb(p, ...Q(-0.4, 1.8), 2.6, 2.4, back ? OBSD : OBS);
  if (!back) gem(p, ...Q(0, 6), ...Q(-2.2, 11.5), 2.6, OBS);
  hair(p, ...Q(-4.6, 0), ...Q(-2.2, 6.2), tr[4]);
  // Eisenschuh
  const ex = L.ex, ey = L.ey;
  if (dang < 0.5) {
    plate(p, [[ex - 5.5, ey - 7.5], [ex + 1, ey - 8.4], [ex + 6, ey - 5.6], [ex + 13, ey - 1.4], [ex + 13.6, ey], [ex - 6, ey]], pl, { edge: 0.7 });
    for (const x of [ex - 1, ex + 3.4, ex + 7.4]) hair(p, x, ey - 6.6 + (x - ex) * 0.32, x + 0.8, ey - 0.6, pl[1]);
    hair(p, ex - 5.6, ey - 0.6, ex + 13, ey - 0.6, tr[3]);
  } else {
    plate(p, [[ex - 4, ey - 9], [ex + 3.4, ey - 8.6], [ex + 3, ey - 1], [ex + 1, ey + 3.4], [ex - 1, ey + 3], [ex - 4.4, ey - 1]], pl, { edge: 0.7 });
    hair(p, ex - 4, ey - 2, ex + 3, ey - 2, tr[3]);
  }
}

// Gürtel, Beintaschen und Wappenrock: breiter Eisengürtel mit Kronenschnalle (Glutaugen), fünf Beintaschen aus
// Knochenasche, karminroter Wappenrock bis fast zum Boden mit Glutsaum und Kronenwappen, Kette über der Hüfte
function belt(p, g, hipX, hipY, gy, P, legF, dang) {
  const sway = (legF.jx - hipX - 6) * 0.25 + Math.sin(P.capeT) * 0.6 + P.robe;
  // Wappenrock
  const L = Math.max(8, gy - hipY - 3 - P.kneel * 10);
  const tab = [];
  for (let j = 0; j <= 10; j++) { const v = j / 10, cx = hipX + 2.5 + sway * v * v * 1.6 + (dang > 0.1 ? -v * v * 4 * dang : 0), w = (3 + v * 1.4) * S; tab.push([cx - w, hipY + L * v], [cx + w, hipY + L * v]); }
  const left = tab.filter((_, i) => i % 2 === 0), right = tab.filter((_, i) => i % 2 === 1);
  const hemL = left[left.length - 1], hemR = right[right.length - 1];
  const tabPoly = [...left, [(hemL[0] + hemR[0]) / 2, hemL[1] + 2.5], ...right.slice().reverse()];
  cloth(p, tabPoly, ROBE6, { fold: 2.6, phase: P.capeT * 0.3, hem: 3 });
  trace(p, inset(tabPoly, 0.8), TRIM[3], true);
  hair(p, hemL[0], hemL[1] - 1.4, (hemL[0] + hemR[0]) / 2, hemL[1] + 1, TRIM[4]); hair(p, (hemL[0] + hemR[0]) / 2, hemL[1] + 1, hemR[0], hemR[1] - 1.4, TRIM[3]);
  { // Kronenwappen
    const v = 0.3, cx = hipX + 2.5 + sway * v * v * 1.6, cy = hipY + L * v;
    for (const [ox, h] of [[-2.2, 2.6], [0, 3.6], [2.2, 2.6]]) gem(p, cx + ox, cy, cx + ox + 0.2, cy - h, 1.8, TRIM);
    plate(p, [[cx - 3.2, cy - 0.4], [cx + 3.2, cy - 0.4], [cx + 2.6, cy + 1.8], [cx - 2.6, cy + 1.8]], TRIM, { edge: 0.5 });
    dotp(p, cx, cy + 0.6, MAG[4]); g.max(cx, cy - 2, 1);
  }
  if (dang > 0.1) for (let k = -3; k <= 4; k++) g.max(hipX + 3 + sway * 1.6 - 4 * dang + k, hipY + L, 1);
  // Beintaschen
  for (let i = 4; i >= 0; i--) {
    const tx = hipX - 12.5 + i * 4.8, len = 14 - Math.abs(i - 1.5) * 1.6, sw = sway * 0.3 * (i / 4);
    plate(p, [[tx, hipY - 0.5], [tx + 5.2, hipY - 0.5], [tx + 5.6 + sw, hipY + len - 1.5], [tx + 2.8 + sw, hipY + len + 0.4], [tx - 0.2 + sw, hipY + len - 1.5]], i < 3 ? OBS : OBSD, { edge: 0.7, lift: i === 0 ? 0 : -1 });
    hair(p, tx - 0.1 + sw, hipY + len - 2.2, tx + 5.5 + sw, hipY + len - 2.2, TRIM[3]);
  }
  // Gürtel
  plate(p, [[hipX - 13.5, hipY - 5], [hipX + 14, hipY - 5.4], [hipX + 14.2, hipY + 0.6], [hipX - 13.7, hipY + 1]], OBSD, { edge: 0.7 });
  hair(p, hipX - 13, hipY - 4.4, hipX + 13.6, hipY - 4.8, TRIM[4]); hair(p, hipX - 13, hipY + 0.2, hipX + 13.6, hipY - 0.2, TRIM[2]);
  for (let x = hipX - 11; x < hipX + 13; x += 3.4) rivet(p, x, hipY - 2.2, TRIM);
  // Kette quer über die Hüfte
  for (let k = 0; k < 10; k++) {
    const x = hipX - 11 + k * 1.9 + Math.sin(P.capeT + k * 0.5) * 0.3, y = hipY + 2 + Math.sin((k / 9) * Math.PI) * 4.5;
    orb(p, x, y, 1.1, k % 2 ? 0.7 : 1.1, IRON5, { glint: false });
  }
  // Kronenschnalle mit Glutaugen
  const bx = hipX + 3, by = hipY - 3;
  plate(p, [[bx - 4.6, by - 4.6], [bx - 1.6, by - 2.6], [bx, by - 5.2], [bx + 1.6, by - 2.6], [bx + 4.6, by - 4.6], [bx + 4, by + 3.4], [bx, by + 5], [bx - 4, by + 3.4]], TRIM, { edge: 0.7 });
  plate(p, [[bx - 3, by - 1.6], [bx + 3, by - 1.6], [bx + 2.6, by + 2.6], [bx, by + 3.6], [bx - 2.6, by + 2.6]], OBS, { edge: 0.6 });
  for (const dx of [-1.1, 1.1]) { dotp(p, bx + dx, by + 0.4, MAG[4]); dotp(p, bx + dx + 0.5, by + 0.4, MAG[3]); g.max(bx + dx, by + 0.4, 3); g.dot(bx + dx, by + 0.4, 4); }
}

// Armschiene mit Glutstein
function bracer(p, g, arm, back) {
  const { len, Q } = axis(arm.jx, arm.jy, arm.ex, arm.ey);
  const pl = back ? OBSD : OBS, tr = back ? TRIMD : TRIM;
  plate(p, [Q(len * 0.36, -4.6), Q(len * 0.36, 4.6), Q(len * 0.9, 4.2), Q(len * 0.95, -4.4)], pl, { edge: 0.7 });
  hair(p, ...Q(len * 0.38, -4.2), ...Q(len * 0.38, 4.2), tr[4]); hair(p, ...Q(len * 0.88, -4), ...Q(len * 0.88, 4), tr[3]);
  if (!back) { const [mx, my] = Q(len * 0.63, 0.4); orb(p, mx, my, 1.4, 1.6, MAG6, { glint: false }); dotp(p, mx - 0.4, my - 0.5, '#fff4d0'); g.max(mx, my, 2); g.dot(mx, my, 4); }
}

// Panzerhandschuh mit Krallen (offen = gespreizt)
function claw(p, g, x, y, ramp, open, front = false) {
  const pl = front ? OBS : OBSD;
  if (open) for (let k = -1; k <= 1; k++) { bar(p, x + k * 1.6, y - 2.4, x + k * 2.6, y - 7.5, 2, 1.4, pl); gem(p, x + k * 2.6, y - 7.4, x + k * 3, y - 10, 1.4, front ? TRIM : TRIMD); }
  plate(p, [[x - 4.4, y - 3.6], [x + 3.4, y - 3.8], [x + 4.6, y - 0.4], [x + 3.6, y + 3.6], [x - 4, y + 3.4]], pl, { edge: 0.7 });
  hair(p, x - 3.8, y - 0.6, x + 3.8, y - 0.8, pl[1]);
  for (let i = 0; i < 3; i++) dotp(p, x - 2.4 + i * 2.2, y - 2.6, pl[pl.length - 1]);
  if (!open) for (let i = 0; i < 3; i++) gem(p, x + 3.6, y - 1.6 + i * 1.8, x + 6.2, y - 0.6 + i * 2.2, 1.4, front ? TRIM : TRIMD);
}

// Schulterstück: kantige Kuppel mit Grat und Glutrand, darunter zwei Schienen; hinten zusätzlich zwei große
// Hornzacken, vorn drei kurze Dornen nach hinten oben
function pauldron(p, g, x, y, rx, ry, front, P) {
  const pl = front ? OBS : OBSD, tr = front ? TRIM : TRIMD;
  if (!front) {
    hornQ(p, x - 1, y - 2, x - 7, y - 12, x - 5, y - 25, 5, 1, OBSD, { n: 8 });
    hornQ(p, x - 5, y - 1, x - 11, y - 6, x - 14, y - 12.5, 3.6, 1, OBSD, { n: 6 });
    dotp(p, x - 5, y - 25, MAG[4]); g.max(x - 5, y - 25, 3); g.max(x - 5, y - 26, 1);
    dotp(p, x - 14, y - 12.6, MAG[3]); g.max(x - 14, y - 12.6, 2);
  } else {
    for (const [ox, len, ang] of [[-6, 7, -2.5], [-2.5, 9, -2.25], [1.5, 6.5, -2.0]]) gem(p, x + ox, y - ry * 0.7, x + ox + Math.cos(ang) * len, y - ry * 0.7 + Math.sin(ang) * len, 3, OBS);
    const tx = x - 2.5 + Math.cos(-2.25) * 9, ty = y - ry * 0.7 + Math.sin(-2.25) * 9;
    dotp(p, tx, ty, '#fff0c0'); g.max(tx, ty, 2); g.dot(tx, ty, 4);
  }
  for (let i = 2; i >= 1; i--) {
    const yy = y + i * 3.4, rr = rx * (1 - i * 0.07);
    plate(p, [[x - rr, yy], [x - rr * 0.4, yy - 2], [x + rr * 0.8, yy - 1.4], [x + rr * 1.02, yy + 2.6], [x + rr * 0.5, yy + ry * 0.55], [x - rr * 0.8, yy + ry * 0.45]], pl, { edge: 0.7, lift: -1 });
    hair(p, x - rr * 0.8, yy + ry * 0.4, x + rr * 0.5, yy + ry * 0.5, tr[3]);
  }
  const dome = [[x - rx * 1.02, y + 2], [x - rx * 0.8, y - ry * 0.5], [x - rx * 0.2, y - ry * 0.95], [x + rx * 0.55, y - ry * 0.75], [x + rx, y - ry * 0.1], [x + rx * 1.04, y + ry * 0.55], [x + rx * 0.3, y + ry * 0.75], [x - rx * 0.7, y + ry * 0.6]];
  plate(p, dome, pl, { edge: 1, core: 2.2 });
  trace(p, inset(dome, 1.3).slice(0, 6), tr[4], false, tr[1]);
  groove(p, [[x - rx * 0.6, y - ry * 0.35], [x + rx * 0.1, y - ry * 0.2], [x + rx * 0.85, y + ry * 0.2]], pl[1], pl[pl.length - 1]);
  if (front) {
    ember(p, g, [[x - 3, y + 2], [x - 0.5, y + 0.6], [x + 2, y + 1.8]], P, 0);
    dotp(p, x - rx * 0.62, y - ry * 0.42, '#ffffff'); hair(p, x - rx * 0.6, y - ry * 0.44, x - rx * 0.1, y - ry * 0.82, SPEC);
  }
}

// Haar hinten: lange schwarze Strähnen, die im Wind nach hinten fallen
function hairBack(p, g, hx, hy, P) {
  const list = [];
  for (let s = 0; s < 7; s++) {
    list.push({ x: hx + 2 + s * 0.8, y: hy + 3 + s * 0.6, len: 21 + hash2(s, 1, 9) * 8, a: Math.PI * 0.62 + P.hair * -0.5 + Math.sin(P.capeT * 1.2 + s) * 0.04, w: 3, bend: -0.25 - P.cape * 0.35 - P.hair * 0.3, lit: s < 2 ? 0.55 : 0.3 });
  }
  strands(p, list, HAIR6);
  if (P.crack > 0.5) for (const s of list) { const e = [s.x + Math.cos(s.a + s.bend) * s.len, s.y + Math.sin(s.a + s.bend) * s.len]; g.max(e[0], e[1], 0); }
}

// Kopf: aschfahles, hageres Gesicht in Dreiviertelansicht (Blick nach rechts): hohe Stirn, schwere Brauen über
// weißglühenden Augen, scharfe Nase, hohe Wangenknochen, harter Mund, kurzer spitzer Aschebart, Haar seitlich.
const MOUTH_ROW = 14;
const HZ = 1.25;   // Kopf größer als die alte Pixelkarte, damit das Gesicht lesbar bleibt
function head(p, g, hx, hy, P, meta) {
  const j = P.jaw * 2.2, eyeOn = P.eye > 0.1, eyeHot = P.eye > 0.6;
  const H = (u, v) => [hx + u * HZ, hy + v * HZ];
  const HL = (list) => list.map(([u, v]) => H(u, v));
  // Gesicht
  plate(p, HL([[4.6, 3], [13.4, 2.6], [15, 4.6], [15.3, 7], [15, 8], [17, 11.3], [15.8, 12.2], [15.6, 13.6 + j * 0.3], [15, 15.6 + j], [11.2, 17 + j], [7.6, 16.2 + j], [5.4, 13.6], [4.4, 9.6]]), SKIN6, { edge: 0.8, core: 2.4 });
  // Schläfe, Wangenmulde, Wangenknochen
  poly(p, HL([[5, 5.4], [7, 5.6], [7, 9.6], [5.4, 9.2]]), SKIN6[2]);
  poly(p, HL([[7.6, 11.6], [12.6, 11.6], [12.2, 14], [8.4, 14.6]]), SKIN6[2]);
  poly(p, HL([[9.6, 10], [13.8, 9.8], [13.4, 11.2], [10, 11.4]]), SKIN6[5]);
  hair(p, ...H(9.8, 10), ...H(13.6, 9.8), SKIN6[6]);
  // Stirn im Licht
  poly(p, HL([[7.4, 3.4], [12.6, 3.2], [14, 5.6], [8, 5.8]]), SKIN6[5]);
  hair(p, ...H(8.2, 3.6), ...H(12.4, 3.4), SKIN6[6]);
  // Brauen und Augen
  poly(p, HL([[6.8, 6.6], [15.4, 6.2], [15.4, 9.4], [11.6, 9.8], [7.4, 9.6]]), SKIN6[1]);
  poly(p, HL([[7.4, 7.4], [10, 7.2], [10.2, 9.2], [7.8, 9.4]]), VOID);
  poly(p, HL([[11.8, 7.2], [14.8, 7], [14.6, 9], [12, 9.2]]), VOID);
  poly(p, HL([[6.6, 5.8], [10.4, 6.6], [10.4, 7.6], [6.6, 7]]), HAIR6[2]);
  poly(p, HL([[11.4, 6.6], [15.6, 5.8], [15.6, 6.8], [11.4, 7.6]]), HAIR6[2]);
  hair(p, ...H(6.8, 5.8), ...H(10.2, 6.6), HAIR6[4]); hair(p, ...H(11.6, 6.6), ...H(15.4, 5.8), HAIR6[4]);
  for (const [u, v] of [[8.8, 8.2], [13.4, 8.1]]) {
    const [x, y] = H(u, v);
    dotp(p, x, y, eyeOn ? '#ffffff' : SKIN6[1]); dotp(p, x + 0.5, y, eyeOn ? '#fff0b0' : SKIN6[1]); dotp(p, x - 0.5, y, eyeOn ? MAG[3] : VOID); dotp(p, x, y + 0.5, eyeOn ? MAG[4] : VOID);
    if (eyeOn) { g.max(x, y, eyeHot ? 4 : 3); g.dot(x, y, 4); g.dot(x + 0.5, y, 4); if (P.eye > 0.8) { g.max(x - 1, y, 1); g.max(x + 1, y, 1); } }
  }
  if (eyeOn && P.crack > 0.9) { g.max(...H(5, 8), 1); g.max(...H(4, 7), 0); g.max(...H(14, 7), 0); }
  { const [x, y] = H(13.4, 8.1); meta.eye = { x, y }; }
  // Nase
  poly(p, HL([[14.6, 7.4], [15.4, 7.4], [17, 11.3], [16, 12.1], [14.6, 11.8], [14, 10]]), SKIN6[4]);
  poly(p, HL([[14, 10], [14.8, 10.2], [15, 12], [14.2, 12]]), SKIN6[2]);
  hair(p, ...H(15.3, 7.6), ...H(16.8, 11), SKIN6[6]); hair(p, ...H(14.6, 12.4), ...H(16.4, 12.2), SKIN6[1]); dotp(p, ...H(15.4, 11.8), VOID);
  // Mund: harte Linie, offen ein Glutspalt
  const [mx0, my0] = H(10.6, MOUTH_ROW), [mx1, my1] = H(15.2, MOUTH_ROW - 0.3);
  if (j > 0.3) {
    poly(p, HL([[10.6, MOUTH_ROW - 0.4], [15.2, MOUTH_ROW - 0.7], [15, MOUTH_ROW + j], [11, MOUTH_ROW + j]]), VOID);
    const [cx, cy] = H(12.6, MOUTH_ROW + j * 0.5);
    g.max(cx, cy, P.jaw > 0.7 ? 3 : 2); if (j > 1) g.dot(cx, cy, 4);
  } else { hair(p, mx0, my0, mx1, my1, SKIN6[0]); hair(p, mx0, my0 + 0.5, mx1, my1 + 0.5, SKIN6[3]); g.max(...H(12, MOUTH_ROW), 0); }
  { const [x, y] = H(12.6, MOUTH_ROW); meta.mouth = { x, y }; }
  // Kurzer spitzer Aschebart
  strands(p, [0, 1, 2, 3, 4].map((i) => {
    const u = 8.4 + i * 1.6, v = 15 + j - Math.abs(i - 2) * 0.3;
    const [x, y] = H(u, v);
    return { x, y, len: (7.5 - Math.abs(i - 2) * 1.6) * HZ, a: Math.PI / 2 + (2 - i) * 0.14 + 0.06, w: 2.6 * HZ, bend: -0.1, lit: 0.6 - i * 0.06 };
  }), ['#120e10', HAIR[1], HAIR[2], HAIR[3], '#8a828c', HAIR[4]]);
  // Haar seitlich (verdeckt Ohr und Hinterkopf)
  plate(p, HL([[1.4, 3.6], [5.2, 1.2], [7.4, 2.4], [5.8, 5.4], [5.2, 12], [6.2, 16.6], [3.4, 18.6], [1.6, 12]]), HAIR6, { edge: 0.8, glint: false });
  hair(p, ...H(5.6, 2.6), ...H(4.6, 10), HAIR6[4]); hair(p, ...H(3.4, 4.6), ...H(2.8, 14), HAIR6[1]);
  // Glutrisse im Gesicht (ab Gestalt 2)
  if (P.crack > 0.5) ember(p, g, HL([[5.6, 4.6], [6.4, 7], [5.8, 11.4]]), P, 0);
  if (P.crack > 0.9) ember(p, g, HL([[10.2, 11.6], [11.2, 13.2]]), P, 0);
  g.max(...H(10, 19 + j), 0);
  if (P.crownDrop < 0.02) crown(p, g, ...H(0.6, 2.6), 0, P, true, HZ);
  { const [x, y] = H(8, -2); meta.head = { x, y }; }
  { const [x, y] = H(8, -1); meta.crown = { x, y }; }
}

// Krone aus glühendem Schmiedeeisen: Reif mit drei Glutsteinen, fünf Zacken (die mittlere am höchsten), lodernde
// Flammen (crownF). tilt dreht um (x, y); lit = false ohne Flammen.
function crown(p, g, x, y, tilt, P, lit = true, sc = 1) {
  const pt = (dx, dy) => [x + (dx * Math.cos(tilt) - dy * Math.sin(tilt)) * sc, y + (dx * Math.sin(tilt) + dy * Math.cos(tilt)) * sc];
  const spikes = [[1, 6], [4.5, 9], [8, 13], [11.5, 9.5], [15, 6.5]];
  const flames = [];
  for (const [dx, h] of spikes) {
    gem(p, ...pt(dx, 0), ...pt(dx + 0.2, -h), 3.2, TRIM);
    flames.push([...pt(dx + 0.2, -h - 1), h]);
  }
  plate(p, [pt(-0.8, -1.4), pt(16.4, -1.6), pt(16.4, 2), pt(-0.8, 2.2)], TRIM, { edge: 0.7 });
  hair(p, ...pt(-0.4, -0.9), ...pt(16, -1.1), '#ffd8a0'); hair(p, ...pt(-0.4, 1.4), ...pt(16, 1.2), TRIM[1]);
  for (const dx of [4, 8, 12]) {
    const [cx, cy] = pt(dx, 0.3);
    orb(p, cx, cy, 1.25, 1.25, MAG6, { glint: false }); dotp(p, cx - 0.4, cy - 0.4, '#ffffff');
    g.max(cx, cy, dx === 8 ? 4 : 3); g.dot(cx - 0.4, cy - 0.4, 4);
  }
  for (let i = 0; i <= 15; i += 1) { const [px, py] = pt(i, -0.5); g.max(px, py, i % 2 ? 1 : 0); }
  for (const [dx, h] of spikes) for (let k = h - 3; k <= h; k += 1) { const [px, py] = pt(dx, -k); g.max(px, py, k > h - 1.5 ? 3 : 1); }
  if (!lit || P.crownF < 0.05) return;
  const seed = Math.round(P.capeT * 4.1);
  flames.forEach(([fx, fy, h], n) => {
    const hgt = P.crownF * (3 + h * 0.6 + hash2(n, seed, 31) * 4);
    for (let k = 0; k < hgt; k++) {
      const t = k / hgt, wob = Math.sin(k * 0.7 + n + seed) * t * 1.2;
      const i = t < 0.25 ? 4 : t < 0.5 ? 3 : t < 0.8 ? 2 : 1;
      g.max(fx + wob, fy - k, i);
      if (t < 0.45 && P.crownF > 0.8) { g.max(fx + wob - 1, fy - k, i - 2); g.max(fx + wob + 1, fy - k, i - 2); }
      if (RS > 1 && t < 0.6) { g.dot(fx + wob, fy - k, 4); if (t < 0.3) g.dot(fx + wob, fy - k - 0.5, 4); }
    }
  });
}

// Königsmantel: karminrote Bahn mit breiten Falten und Glutsaum, ab Gestalt 2 zerfasert der Saum zu Rauch;
// hoher Stehkragen hinter dem Kopf
function cape(p, g, tx, ty, gy, P, dang) {
  const lift = 0.4 + P.hover / 29, smoke = Math.min(1, P.wing * 1.2), fray = 0.9 - smoke * 0.32;
  const N = 30, top = [], bot = [], cols = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, sx = tx - 13 + u * 31, tp = ty + Math.abs(u - 0.5) * 4;
    const len = Math.min(84, gy - ty + 10) - Math.abs(u - 0.35) * 20 + hash2(i, 1, 13) * 5;
    const X = (v) => sx - P.cape * 29 * v * v - (1 - u) * 12 * v - v * 6 + Math.sin(P.capeT * 1.3 + v * 4.5 + u * 15) * 3 * v;
    const Y = (v) => tp + len * v * (1 - lift * v * 0.55);
    const vEnd = smoke > 0 ? fray - hash2(i, Math.round(P.capeT * 2), 11) * 0.12 * smoke : 1;
    top.push([X(0), Y(0)]); bot.push([X(vEnd), Y(vEnd)]); cols.push({ X, Y, vEnd });
  }
  const poly2 = [...top, ...bot.slice().reverse()];
  cloth(p, poly2, ROBE6, { fold: 6, phase: -P.capeT * 0.5, hem: 3, seed: 5 });
  // Glutsaum (ohne Rauch) bzw. glimmende Fasern
  for (let i = 0; i < N; i++) {
    const [x0, y0] = bot[i], [x1, y1] = bot[i + 1];
    hair(p, x0, y0 - 0.8, x1, y1 - 0.8, smoke > 0.3 ? MAG[2] : TRIM[4]); hair(p, x0, y0 - 1.6, x1, y1 - 1.6, smoke > 0.3 ? ROBE6[1] : TRIM[3]);
    if (smoke > 0.3 || P.crack > 0.2) g.max(x0, y0 - 1, smoke > 0.3 ? 1 : 0);
  }
  // Rauch unter dem zerfaserten Saum
  if (smoke > 0) for (let i = 0; i <= N; i++) {
    const c = cols[i];
    for (let v = c.vEnd; v < 1; v += 0.012) {
      if (hash2(i * 97 + Math.round(v * 80), Math.round(P.capeT * 2), 21) < (v - c.vEnd) * 3) continue;
      const x = c.X(v), y = c.Y(v);
      p.px(x, y, SMOKE[Math.min(5, 1 + (hash2(i, Math.round(v * 80), 23) * 3 | 0))]);
      if (hash2(i, Math.round(v * 80), 19) < 0.05) g.max(x, y, 1);
    }
  }
  // Glutkante an der Vorderbahn
  for (let v = 0; v < 0.8; v += 0.01) { const c = cols[0], x = c.X(v) + 0.6, y = c.Y(v) + 1.5; if (v > c.vEnd || y > gy - 4) break; dotp(p, x, y, v < 0.4 ? TRIM[4] : TRIM[3]); }
  // Stehkragen: Innenseite karminrot, Außenrand aus Knochenasche mit Glutkante
  const col = [[tx - 7, ty + 3], [tx - 10, ty - 9], [tx - 7.5, ty - 17], [tx - 1, ty - 19], [tx + 4, ty - 16], [tx + 6, ty - 9], [tx + 6, ty + 3]];
  plate(p, col, OBS, { edge: 0.8, lift: -1 });
  cloth(p, inset(col, 2.2), ROBED, { fold: 2.4, hem: 0 });
  trace(p, inset(col, 1.1).slice(1, 6), TRIM[4], false, TRIM[1]);
  if (P.crack > 0.2) for (const [x, y] of col.slice(1, 6)) g.max(x, y + 1, 1);
}

function chain(p, g, x, y, P) {
  const n = 8;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const cx = x - 1 - t * 2 - P.cape * 3 * t + Math.sin(P.capeT + t * 2) * 1.2 * t, cy = y + 1 + i * 1.5 * S;
    if (i % 2) { p.px(cx, cy, IRON[2]); p.px(cx + 1, cy, IRON[1]); p.px(cx, cy - 1, IRON[3]); }
    else p.px(cx, cy, IRON[3]);
  }
  const ex = x - 3 - P.cape * 3 + Math.sin(P.capeT + 2) * 1.2, ey = y + 1 + n * 1.5 * S + 1;
  p.px(ex, ey, MAG[3]); g.max(ex, ey, 2);
}

// Flügel aus Rauch mit glühenden Rippen (form 2); form 3: Flammenzungen am Rand
function wings(p, g, rx, ry, P) {
  const s = P.wing;
  const flap = Math.sin(P.wingT) * 0.12 + P.spread * 0.25;
  // Gestalt 3 (flat): Schwingen weit zur Seite gespreizt und flach gestaucht statt steil nach oben
  const fl = Math.max(0, Math.min(1, P.flat));
  const sq = 0.95 - 0.37 * fl;
  const sets = [
    { a0: -2.6 - 0.2 * fl, a1: -1.45 - 0.35 * fl, n: 4, L: 56 * S * (1 + 0.22 * fl), ox: 8, oy: -5, far: true },
    { a0: -3.1 - 0.22 * fl, a1: -1.65 - 0.3 * fl, n: 5, L: 80 * S * (1 + 0.2 * fl), ox: 0, oy: 0, far: false },
  ];
  for (const w of sets) {
    const pts = [];
    for (let f = 0; f < w.n; f++) {
      const a = w.a0 + ((w.a1 - w.a0) * f) / (w.n - 1) - flap * (w.far ? 0.7 : 1);
      const L = w.L * s * (f === w.n - 1 ? 0.78 : f === 0 ? 0.62 : 1 - Math.abs(f - 2.5) * 0.05);
      pts.push({ a, L });
    }
    const ox = rx + w.ox, oy = ry + w.oy;
    // Membran: Rauch zwischen den Rippen, Rand gezackt (pixelweise über das Hüllrechteck)
    const Lmax = Math.max(...pts.map((q) => q.L));
    const bx0 = Math.floor(ox - Lmax - 1), bx1 = Math.ceil(ox + Lmax * 0.22 + 1);
    const by0 = Math.floor(oy - Lmax - 1), by1 = Math.ceil(oy + Lmax * 0.5 + 1);
    const aLo = pts[0].a, aHi = pts[w.n - 1].a;
    if (RS > 1) membraneFine(p, g, P, w, pts, ox, oy, sq, Lmax);
    else for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
      const qx = x - ox, qy = (y - oy) / sq;
      const d = Math.hypot(qx, qy);
      if (d < 3 || d > Lmax) continue;
      let a = Math.atan2(qy, qx);
      if (a > 0) a -= Math.PI * 2;
      if (a < aLo || a > aHi) continue;
      let f = 0;
      while (f < w.n - 2 && a > pts[f + 1].a) f++;
      const A = pts[f], B = pts[f + 1];
      const t = (a - A.a) / (B.a - A.a || 1);
      const Lr = (A.L + (B.L - A.L) * t) * (0.7 + 0.3 * Math.pow(Math.abs(t - 0.5) * 2, 1.5));
      if (d >= Lr) continue;
      const v = d / Lr;
      if (v > 0.9 && hash2(x, y, 5 + f) < (v - 0.9) * 6) continue;
      const fold = t < 0.16 || t > 0.84;
      const c = w.far ? SMOKE[v < 0.4 ? 2 : 1] : SMOKE[Math.min(5, (v < 0.3 ? 3 : v < 0.65 ? 2 : 1) + (fold ? 2 : 0))];
      p.px(x, y, c);
      if (P.wingFire > 0.5 && v > 0.8 && hash2(x, y, 9) < 0.35) g.max(x, y, 1);
      else if (!w.far && v > 0.55 && hash2(x, y, 13) < 0.04) g.max(x, y, 0);
    }
    // Rippen: dunkler Knochen mit Glutader, Spitzen brennen
    for (const { a, L } of pts) {
      for (let d = 0; d < L; d += 0.5) {
        const x = ox + Math.cos(a) * d, y = oy + Math.sin(a) * d * sq;
        const t = d / L;
        p.px(x, y, w.far ? OBS[2] : t < 0.3 ? OBS[4] : OBS[3]);
        if (!w.far && t < 0.7) p.px(x, y + 1, OBS[1]);
        if (!w.far || P.wingFire > 0.5) g.max(x, y, (t < 0.45 ? 0 : t < 0.85 ? 1 : 2) + (P.wingFire > 0.5 ? 1 : 0));
        if (RS > 1) {
          // Rippe: Lichtgrat oben, Glutader mit hellem Kern
          if (!w.far && t < 0.55) p.dot(x - 0.25, y - 0.25, t < 0.3 ? OBS[5] : OBS[4]);
          if ((!w.far || P.wingFire > 0.5) && t > 0.3) g.dot(x, y, (t < 0.85 ? 2 : 3) + (P.wingFire > 0.5 ? 1 : 0));
        }
      }
      // Flammenzunge an der Spitze
      const hgt = (2 + P.wingFire * 8) * s;
      const tx = ox + Math.cos(a) * L, ty = oy + Math.sin(a) * L * sq;
      for (let k = 0; k < hgt; k++) {
        const kk = k / hgt;
        const fx = tx + Math.cos(a) * k * 0.6 + Math.sin(k + P.wingT * 3) * 0.6, fy = ty + Math.sin(a) * k * 0.6 - k * 0.5;
        g.max(fx, fy, kk < 0.3 ? 4 : kk < 0.6 ? 3 : 2);
        if (RS > 1 && kk < 0.6) g.dot(fx, fy, 4);   // harter weißer Kern
      }
    }
    // Form 3: Feuerkante entlang des Membranrandes
    if (P.wingFire > 0.5) {
      for (let f = 0; f < w.n - 1; f++) {
        const A = pts[f], B = pts[f + 1];
        for (let t = 0; t <= 1; t += 0.04) {
          const a = A.a + (B.a - A.a) * t;
          const Lr = (A.L + (B.L - A.L) * t) * (0.7 + 0.3 * Math.pow(Math.abs(t - 0.5) * 2, 1.5)) * 0.9;
          const x = ox + Math.cos(a) * Lr, y = oy + Math.sin(a) * Lr * sq;
          const hh = 1 + hash2(f * 20 + Math.round(t * 25), Math.round(P.wingT * 3), 3) * 3.5 * P.wingFire;
          for (let k = 0; k < hh; k++) g.max(x, y - k, k < 1 ? 3 : 2);
          if (RS > 1) g.dot(x, y, 4);
        }
      }
    }
  }
}

// Flügelmembran fein: Texel abtasten (glatter Rand, Faltenstufen texelgenau), Zacken- und Funken-Zufall je
// Weltpixel. Engeres Hüllrechteck aus dem tatsächlichen Umriss, Abstandstest vor atan2.
const SMOKEc = SMOKE.map(col);
function membraneFine(p, g, P, w, pts, ox, oy, sq, Lmax) {
  const n = w.n, aLo = pts[0].a, aHi = pts[n - 1].a;
  const rAt = (f, t) => { const A = pts[f], B = pts[f + 1], m = Math.abs(t - 0.5) * 2; return (A.L + (B.L - A.L) * t) * (0.7 + 0.3 * m * Math.sqrt(m)); };
  let x0 = ox, x1 = ox, y0 = oy, y1 = oy;
  for (let f = 0; f < n - 1; f++) for (let t = 0; t <= 1; t += 0.125) {
    const a = pts[f].a + (pts[f + 1].a - pts[f].a) * t, r = rAt(f, t);
    const x = ox + Math.cos(a) * r, y = oy + Math.sin(a) * r * sq;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const X0 = Math.floor((x0 - 3) * RS), X1 = Math.ceil((x1 + 3) * RS), Y0 = Math.floor((y0 - 3) * RS), Y1 = Math.ceil((y1 + 3) * RS);
  const L2 = Lmax * Lmax, isq = 1 / sq, fire = P.wingFire > 0.5, far = w.far;
  // Zeilenspanne: Keil zwischen den Randrippen (sin(a − aLo) ≥ 0, sin(aHi − a) ≥ 0) und Kreis Lmax, je Zeile linear in qx
  const cLo = Math.cos(aLo), sLo = Math.sin(aLo), cHi = Math.cos(aHi), sHi = Math.sin(aHi);
  const half = (al, be, lo, hi) => { if (Math.abs(al) < 1e-9) return be >= 0 ? [lo, hi] : [1, 0]; const r = -be / al; return al > 0 ? [Math.max(lo, r), hi] : [lo, Math.min(hi, r)]; };
  for (let Y = Y0; Y <= Y1; Y++) {
    const qy = ((Y + 0.5) / RS - 0.5 - oy) * isq, y = Math.floor(Y / RS), qy2 = qy * qy;
    if (qy2 > L2) continue;
    const cr = Math.sqrt(L2 - qy2);
    let [lo, hi] = half(-sLo, cLo * qy, -cr, cr);
    [lo, hi] = half(sHi, -cHi * qy, lo, hi);
    if (lo > hi + 0.5) continue;
    const XA = Math.max(X0, Math.floor((lo + ox + 0.5) * RS - 0.5) - 1), XB = Math.min(X1, Math.ceil((hi + ox + 0.5) * RS - 0.5) + 1);
    for (let X = XA; X <= XB; X++) {
      const qx = (X + 0.5) / RS - 0.5 - ox, d2 = qx * qx + qy2;
      if (d2 < 9 || d2 > L2) continue;
      let a = Math.atan2(qy, qx);
      if (a > 0) a -= Math.PI * 2;
      if (a < aLo || a > aHi) continue;
      let f = 0;
      while (f < n - 2 && a > pts[f + 1].a) f++;
      const t = (a - pts[f].a) / (pts[f + 1].a - pts[f].a || 1);
      const Lr = rAt(f, t), d = Math.sqrt(d2);
      if (d >= Lr) continue;
      const v = d / Lr, x = Math.floor(X / RS);
      if (v > 0.9 && hash2(x, y, 5 + f) < (v - 0.9) * 6) continue;
      const fold = t < 0.16 || t > 0.84;
      p.setv(X, Y, far ? SMOKEc[v < 0.4 ? 2 : 1] : SMOKEc[Math.min(5, (v < 0.3 ? 3 : v < 0.65 ? 2 : 1) + (fold ? 2 : 0))]);
      if (fire && v > 0.8 && hash2(x, y, 9) < 0.35) g.tmax(X, Y, 1);
      else if (!far && v > 0.55 && hash2(x, y, 13) < 0.04) g.tmax(X, Y, 0);
    }
  }
}

// Rauchschwaden unter dem Schwebenden bis zum Boden
function smokeTrail(p, g, hipX, gy, P, dang) {
  const top = gy - 4, bottom = AY;
  for (let i = 0; i < 13; i++) {
    const x0 = hipX - 7 + i * 1.3;
    for (let y = top; y <= bottom; y++) {
      const v = (y - top) / Math.max(1, bottom - top);
      const x = x0 - v * 6 + Math.sin(P.capeT * 1.4 + v * 5 + i) * (1 + v * 2);
      if (hash2(i * 31 + y, Math.round(P.capeT * 3), 29) < 0.25 + v * 0.7) continue;
      p.px(x, y, SMOKE[v < 0.3 ? 3 : 2]);
      if (hash2(i, y, 37) < 0.06 * dang) g.max(x, y, 1);
    }
  }
}

// ---------------------------------------------------------------- Tod: Zerfall zu Asche

// Zerfallsfront läuft von oben nach unten: darüber ist nichts mehr, im Band glüht
// die Kante und die Figur wird zu heller Asche.
function dissolve(L, k, yTop, yBot) {
  if (k <= 0) return;
  const front = yTop + (yBot - yTop + 8) * k;
  // fein: Rauschen je Weltpixel, Front texelgenau (glatte, aber nicht gesprenkelte Kante)
  for (let Y = L.y0; Y <= L.y1; Y++) for (let X = L.x0; X <= L.x1; X++) {
    const i = Y * TW + X;
    if (!L.base[i] && !L.glow[i]) continue;
    const x = RS === 1 ? X : Math.floor(X / RS), y = RS === 1 ? Y : Math.floor(Y / RS);
    const n = hash2(x, y, 57) * 5 + hash2(x >> 2, y >> 2, 58) * 4;
    const d = (Y + 0.5) / RS - 0.5 + n - front;
    if (d < 0) { L.base[i] = 0; L.glow[i] = 0; continue; }
    if (d < 3) { L.base[i] = col(ASHDUST[d < 1.2 ? 4 : 3]); L.glow[i] = d < 1.6 ? 5 : 4; }
    else if (d < 7) { if (L.base[i]) L.base[i] = col(ASHDUST[d < 5 ? 2 : 1]); L.glow[i] = Math.max(L.glow[i], d < 5 ? 3 : 2); }
    else if (d < 12 && L.base[i] && hash2(x, y, 59) < 0.5) L.base[i] = col(ASHDUST[0]);
  }
}

function ashPile(p, g, k, cx, gy) {
  if (k <= 0) return;
  const rx = 6 + k * 16, ry = 1 + k * 8;
  if (RS > 1) {
    // fein: Texel abtasten, Körnung je Weltpixel; Kamm mit hellem Grat
    const CX = Math.round(cx * RS), GY = Math.round(gy * RS);
    for (let Y = -Math.ceil(ry) * RS; Y < RS; Y++) {
      const ys = (Y + 0.5) / RS - 0.5, y = Math.floor(Y / RS);
      const t = 1 - (ys * ys) / (ry * ry);
      if (t < 0) continue;
      const hw = rx * Math.sqrt(t) + 0.35;
      for (let X = Math.floor(-hw * RS); X <= Math.ceil(hw * RS); X++) {
        const xs = (X + 0.5) / RS - 0.5, x = Math.floor(X / RS);
        if (Math.abs(xs) > hw) continue;
        const h = hash2(x + 50, y + 50, 71);
        const top = -Math.sqrt(Math.max(0, 1 - (xs * xs) / (rx * rx))) * ry + (hash2(x, 3, 72) - 0.5) * 1.5;
        if (ys < top) continue;
        const c = ys < top + 0.5 ? (xs < 0 ? '#ece6da' : ASHDUST[4]) : ys < top + 1.2 ? (xs < 0 ? ASHDUST[4] : ASHDUST[3]) : xs < -hw * 0.3 ? ASHDUST[2] : xs > hw * 0.5 ? ASHDUST[0] : h < 0.3 ? ASHDUST[1] : ASHDUST[2];
        p.t(CX + X, GY + Y, c);
        if (h < 0.05 + (1 - k) * 0.1) g.tmax(CX + X, GY + Y, h < 0.02 ? 3 : 1);
      }
    }
    return;
  }
  for (let y = -Math.ceil(ry); y <= 0; y++) {
    const t = 1 - (y * y) / (ry * ry);
    const hw = Math.round(rx * Math.sqrt(Math.max(0, t)));
    for (let x = -hw; x <= hw; x++) {
      const h = hash2(x + 50, y + 50, 71);
      const top = -Math.sqrt(Math.max(0, 1 - (x * x) / (rx * rx))) * ry;
      if (y < top + (hash2(x, 3, 72) - 0.5) * 1.5) continue;
      const c = y < top + 1.2 ? (x < 0 ? ASHDUST[4] : ASHDUST[3]) : x < -hw * 0.3 ? ASHDUST[2] : x > hw * 0.5 ? ASHDUST[0] : h < 0.3 ? ASHDUST[1] : ASHDUST[2];
      p.px(cx + x, gy + y, c);
      if (h < 0.05 + (1 - k) * 0.1) g.max(cx + x, gy + y, h < 0.02 ? 3 : 1);
    }
  }
}

// ---------------------------------------------------------------- Frames

// Randlicht: Oberkanten kühl aufhellen, Vorderkanten glutrot
// fein: gleiche Regeln je Texel (Kante 1 Texel), Deckmaske einmal vorab (Puffer wiederverwendet), an Ort und Stelle
let RIM_M = null;
function rimLightFine(L, x0, y0, x1, y1) {
  const B = L.base, G = L.glow, W = TW;
  const mw = x1 - x0 + 7, n = mw * (y1 - y0 + 7);
  if (!RIM_M || RIM_M.length < n) RIM_M = new Uint8Array(n * 1.25 | 0);
  const M = RIM_M; M.fill(0, 0, n);
  for (let y = y0; y <= y1; y++) for (let i = y * W + x0, m = (y - y0 + 3) * mw + 3, e = i + x1 - x0; i <= e; i++, m++) if (B[i]) M[m] = 1;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0, i = y * W + x0, m = (y - y0 + 3) * mw + 3; x <= x1; x++, i++, m++) {
      if (!M[m]) continue;
      const up = !M[m - mw], left = !M[m - 1], right = !M[m + 1], down = !M[m + mw];
      if (!(up || left || right || down)) {
        if (!M[m - 2 * mw] || !M[m - 2]) {
          const v = B[i], r = v & 255, g = (v >> 8) & 255, b = (v >> 16) & 255;
          B[i] = pack(Math.min(255, r * 0.8 + 236 * 0.2) | 0, Math.min(255, g * 0.8 + 226 * 0.2) | 0, Math.min(255, b * 0.8 + 210 * 0.2) | 0);
        }
        continue;
      }
      if (up + left + right + down >= 3) continue;
      const v = B[i], r = v & 255, g = (v >> 8) & 255, b = (v >> 16) & 255;
      if (up || left) B[i] = pack(Math.min(255, r * 0.4 + 250 * 0.6) | 0, Math.min(255, g * 0.4 + 240 * 0.6) | 0, Math.min(255, b * 0.4 + 222 * 0.6) | 0);
      else if (right) {
        B[i] = pack(Math.min(255, r * 0.6 + 236 * 0.4) | 0, Math.min(255, g * 0.68 + 104 * 0.32) | 0, Math.min(255, b * 0.75 + 48 * 0.25) | 0);
        if (!G[i] && !M[m + 2] && !M[m + 3] && !M[m + 2 - mw] && (((x / RS) | 0) + ((y / RS) | 0)) % 2 === 0) G[i] = 1;
      }
    }
  }
}

function rimLight(L, x0, y0, x1, y1) {
  if (RS > 1) { rimLightFine(L, x0, y0, x1, y1); return; }
  const B = L.base, G = L.glow, W = TW, H = TH;
  const opaque = (x, y) => x >= 0 && y >= 0 && x < W && y < H && B[y * W + x] !== 0;
  if (!SCRATCH || SCRATCH.length !== W * H) SCRATCH = new Uint32Array(W * H);
  const out = SCRATCH;
  for (let y = y0; y <= y1; y++) out.set(B.subarray(y * W + x0, y * W + x1 + 1), y * W + x0);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * W + x;
    if (!B[i]) continue;
    const up = !opaque(x, y - 1), left = !opaque(x - 1, y);
    const right = !opaque(x + 1, y), down = !opaque(x, y + 1);
    if (!(up || left || right || down)) {
      // zweite, schwächere Lichtreihe unter Oberkanten
      if (!opaque(x, y - 2) || !opaque(x - 2, y)) {
        const [r, g, b] = rgbOf(B[i]);
        out[i] = pack(Math.min(255, r * 0.8 + 236 * 0.2) | 0, Math.min(255, g * 0.8 + 226 * 0.2) | 0, Math.min(255, b * 0.8 + 210 * 0.2) | 0);
      }
      continue;
    }
    if (up + left + right + down >= 3) continue;
    const [r, g, b] = rgbOf(B[i]);
    if (up || left) {
      // kühles Oberlicht (Licht von links oben): hebt die Silhouette vom dunklen Boden ab
      out[i] = pack(Math.min(255, r * 0.4 + 250 * 0.6) | 0, Math.min(255, g * 0.4 + 240 * 0.6) | 0, Math.min(255, b * 0.4 + 222 * 0.6) | 0);
    } else if (right) {
      // Glutkante vorn (Widerschein der Glut am Boden)
      out[i] = pack(Math.min(255, r * 0.6 + 236 * 0.4) | 0, Math.min(255, g * 0.68 + 104 * 0.32) | 0, Math.min(255, b * 0.75 + 48 * 0.25) | 0);
      if (!G[i] && !opaque(x + 2, y) && !opaque(x + 3, y) && !opaque(x + 2, y - 1) && (x + y) % 2 === 0) G[i] = 1;
    }
  }
  for (let y = y0; y <= y1; y++) B.set(out.subarray(y * W + x0, y * W + x1 + 1), y * W + x0);
}

// Wiederverwendete, geleerte Pixelpuffer (Canvas-Übergabe kopiert, danach ist der Puffer frei): weniger Müllabfuhr
const POOL = [null, null];
function pooled(k, n) {
  let b = POOL[k];
  if (!b || b.length < n) b = POOL[k] = new Uint32Array(Math.ceil(n * 1.25));
  else b.fill(0, 0, n);
  return b.subarray(0, n);
}
// Umriss wie Fine.outlinePixels (gleiches Ergebnis), aber direkt aus dem Puffer ohne Zwischenkopie und Maske
const OUTc = col(PAL.outline);
function outlineFine(B, x0, y0, cw, ch) {
  if (x0 < 2 || y0 < 2 || x0 + cw > TW - 2 || y0 + ch > TH - 2) {
    const d = new Uint32Array(cw * ch);
    for (let y = 0; y < ch; y++) d.set(B.subarray((y + y0) * TW + x0, (y + y0) * TW + x0 + cw), y * cw);
    return outlinePixels(d, cw, ch);
  }
  const w = cw + 2, h = ch + 2, W = TW, od = pooled(0, w * h);
  const or = OUTc & 255, og = (OUTc >>> 8) & 255, ob = (OUTc >>> 16) & 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0, i = (y0 - 1 + y) * W + x0 - 1, m = y * w; x < w; x++, i++, m++) {
      const v = B[i];
      if (v) { od[m] = v; continue; }
      const below = B[i + W], above = B[i - W];
      if (!(below || above || B[i - 1] || B[i + 1])) continue;
      if (below && !above) {
        od[m] = (0xff000000 | (Math.round(ob * 0.62 + ((below >>> 16) & 255) * 0.3) << 16) | (Math.round(og * 0.62 + ((below >>> 8) & 255) * 0.3) << 8) | Math.round(or * 0.62 + (below & 255) * 0.3)) >>> 0;
      } else od[m] = OUTc;
    }
  }
  return od;
}

function finish(L, fx, meta, inferno, rim = true) {
  let { x0, y0, x1, y1 } = L;
  if (x1 < 0) { x0 = y0 = 0; x1 = y1 = 1; }
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(TW - 1, x1); y1 = Math.min(TH - 1, y1);
  const W = TW;
  if (rim) rimLight(L, x0, y0, x1, y1);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const ramp = inferno ? INFc : EMBc;
  const toCanvas = (glow) => {
    if (RS > 1 && glow) {
      const d = pooled(1, cw * ch), G = L.glow;
      for (let y = 0; y < ch; y++) for (let x = 0, i = (y + y0) * W + x0, m = y * cw; x < cw; x++, i++, m++) { const v = G[i]; if (v) d[m] = ramp[v - 1]; }
      return pixelsToCanvas(d, cw, ch);
    }
    const c = makeCanvas(cw, ch), ctx = c.getContext('2d');
    const img = ctx.createImageData(cw, ch), d = new Uint32Array(img.data.buffer);
    for (let y = 0; y < ch; y++) {
      const src = (y + y0) * W + x0, dst = y * cw;
      if (!glow) { d.set(L.base.subarray(src, src + cw), dst); continue; }
      for (let x = 0; x < cw; x++) { const v = L.glow[src + x]; if (v) d[dst + x] = ramp[v - 1]; }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  };
  let f;
  if (RS === 1) {
    const baseC = toCanvas(false);
    f = buildFrame(cw, ch, AX - x0, AY - y0, (pc) => pc.ctx.drawImage(baseC, 0, 0), { res: 1 });
  } else {
    // fein: Umriss 1 Texel (Oberkante im Materialton) wie buildFrame, ohne Hochskalieren
    f = new SpriteFrame(pixelsToCanvas(outlineFine(L.base, x0, y0, cw, ch), cw + 2, ch + 2), AX * RS - x0 + 1, AY * RS - y0 + 1, RS);
  }
  f.glow = new GlowFrame(toCanvas(true), AX * RS - x0, AY * RS - y0, RS);
  f.meta = {};
  for (const k in meta) f.meta[k] = { dx: Math.round(meta[k].x - AX), dy: Math.round(meta[k].y - AY) };
  f.fx = fx ?? null;
  return f;
}

function withForm(P, form) {
  const F = FORMS[form];
  const o = { ...P };
  for (const k in F) o[k] = (P[k] ?? 0) + F[k];
  return o;
}

// Aufgeschoben (gfx/Sprite.js LazyFrame): gezeichnet wird erst, wenn die Animation den Frame braucht – der Zonenaufbau
// baut den Boss nicht mehr am Stück. atRes(fn) hält die Bildfeinheit (RS) vom Anlegen für den späteren Bau fest.
function atRes(fn) { const rs = RS; return () => { if (RS !== rs) setRes(rs); return fn(); }; }
function frame(...a) { return lazyFrame(atRes(() => frameNow(...a))); }
function frameNow(P, form, extra = {}) {
  const Q = withForm(P, form);
  const L = layers();
  const p = new Pen(L), g = new GlowPen(L);
  const meta = drawFigure(p, g, Q, extra);
  return finish(L, extra.fx, meta, Q.inferno > 0.5);
}

function track(keys, n, form, { loop = false, extras = {} } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = loop ? i / n : n === 1 ? 1 : i / (n - 1);
    out.push(frame(sample(keys, t), form, extras[i] ?? {}));
  }
  return out;
}

// Todesframe: Figur (ohne Krone und ohne Schwert) zerfällt, Schwert steckt im Boden,
// die Krone fällt, prallt auf und bleibt schräg liegen.
function deathFrame(...a) { return lazyFrame(atRes(() => deathFrameNow(...a))); }
function deathFrameNow(P, form, fx) {
  const Q = withForm(P, form);
  const L = layers();
  const p = new Pen(L), g = new GlowPen(L);
  const meta = drawFigure(p, g, { ...Q, noSword: 1, crownDrop: Math.max(Q.crownDrop, Q.ash > 0 ? 0.03 : 0) }, {});
  // Körper-Grenzen für die Zerfallsfront
  let yTop = TH, yBot = 0;
  for (let y = L.y0; y <= L.y1; y++) for (let x = L.x0; x <= L.x1; x++) if (L.base[y * TW + x]) { if (y < yTop) yTop = y; if (y > yBot) yBot = y; }
  dissolve(L, Q.ash, (yTop + 0.5) / RS - 0.5, (yBot + 0.5) / RS - 0.5);
  // Schwert: senkrecht im Boden, Klinge glimmt nach
  const sx = meta.hand.x, sy = meta.hand.y;
  sword(p, g, sx, sy, Math.PI / 2 - 0.08, { ...Q, flame: Math.max(0, 0.9 - Q.ash * 0.8), capeT: Q.capeT });
  ashPile(p, g, Math.min(1, Q.ash * 1.15), AX + 1, AY);
  // Krone
  if (Q.crownDrop > 0.02) {
    const k = Q.crownDrop;
    const hx = meta.crown.x - 8, hy = meta.crown.y + 1;
    // Fall mit Aufprall bei 0.6, kleiner Sprung, liegt bei 1
    const gx = AX + 34, gyC = AY - 2;
    let x, y, tilt;
    if (k < 0.6) { const t = k / 0.6; x = hx + (gx - 4 - hx) * t; y = hy + (gyC - hy) * t * t; tilt = t * 1.4; }
    else if (k < 0.85) { const t = (k - 0.6) / 0.25; x = gx - 4 + t * 4; y = gyC - Math.sin(t * Math.PI) * 6; tilt = 1.4 + t * 1.2; }
    else { x = gx; y = gyC; tilt = 2.75; }
    crown(p, g, x, y, tilt - (k >= 0.85 ? 2.4 : 0), { ...Q, crownF: Math.max(0, 1 - k * 1.5) }, k < 0.66);
    meta.crown = { x, y };
  }
  return finish(L, fx, meta, Q.inferno > 0.5);
}

// Animationen gleich anlegen: ihre Frames entstehen aufgeschoben (frame/deathFrame → LazyFrame), das Anlegen kostet
// fast nichts. So sieht die Vorbereitung (world/spriteWarm.js) alle Animationen des Bosses.
function lazy(defs) {
  const o = {};
  for (const [k, fn] of Object.entries(defs)) o[k] = fn();
  return o;
}

export function createMalgarethSprites() {
  setRes(fineRes());
  // --- Grundposen
  const idleA = pose({ capeT: 0 });
  const idleB = pose({ hipY: 1, lean: 0.06, hFy: 22, hBy: 22, sw: 1.2, capeT: Math.PI, headY: 1, core: 1.3, wingT: Math.PI });

  const walkKeys = [];
  for (let i = 0; i <= 8; i++) {
    const ph = (i / 8) * Math.PI * 2, s = Math.sin(ph), c = Math.cos(ph);
    walkKeys.push([i / 8, pose({
      hipX: 1, hipY: Math.abs(c) * -1.2 + 1, lean: 0.09 + Math.abs(s) * 0.02,
      fFx: 2 + s * 8, fFy: Math.max(0, -c) * 3, fBx: -3 - s * 8, fBy: Math.max(0, c) * 3,
      hFx: 10 + s * 1.2, hFy: 18 - Math.abs(s), sw: 0.72 + s * 0.05, hBx: -5 - s * 3, hBy: 20,
      cape: 0.55, capeT: ph, head: s * 0.3, headY: Math.abs(c) * 0.6, robe: -s * 0.8, wingT: ph,
    }), linear]);
  }
  // Gleiten (schwebend): leichte Vorlage, Umhang und Haar strömen nach
  const glideKeys = [];
  for (let i = 0; i <= 6; i++) {
    const ph = (i / 6) * Math.PI * 2, s = Math.sin(ph);
    glideKeys.push([i / 6, pose({
      lean: 0.2, hipY: s * 0.5, fFx: 3, fBx: -6, fFy: 1, hFx: 7, hFy: 20, sw: 2.3, hBx: -6, hBy: 19,
      cape: 1.1, capeT: ph, hair: 0.4, robe: -2, wingT: ph, head: 0.5,
    }), linear]);
  }

  // Ruhend: Schwert vor sich in den Boden gestoßen, Hände auf dem Knauf, Kopf gesenkt
  const rest = pose({ sw: Math.PI / 2 - 0.04, hFx: 7, hFy: 12, grip: 1, head: 1, headY: 2, nod: 1, eye: 0.15, core: 0.5, cape: 0.05, lean: 0.08, crownF: -0.5, flame: -0.5 });
  const lookUp = pose({ ...rest, head: 0, headY: 0, eye: 1.2, core: 1.4, crownF: 0 });
  const draw1 = pose({ sw: -1.2, hFx: 6, hFy: -8, grip: 0, hBx: -9, hBy: 12, lean: -0.08, hipY: -1, cape: 0.5, capeT: 2, core: 1.6, eye: 1.2, jaw: 0.5, flame: 0.4 });
  const draw2 = pose({ sw: -2.0, hFx: 2, hFy: -16, hBx: -12, hBy: 4, spread: 0.3, lean: -0.14, hipY: -1, cape: 0.8, capeT: 3, core: 2, eye: 1.2, jaw: 1, crownF: 0.5, flame: 0.7 });
  const point = pose({ sw: 0.05, hFx: 18, hFy: 2, hBx: -9, hBy: 16, lean: 0.06, cape: 0.5, capeT: 5, core: 1.4, jaw: 0.2, crownF: 0.2, flame: 0.4 });

  // Hieb A (Vorhand, schräg von oben hinten nach unten vorn)
  const aW1 = pose({ sw: -1.9, hFx: 0, hFy: -6, lean: -0.05, hBx: -10, hBy: 14, fFx: 8, fBx: -8, cape: 0.35, capeT: 1 });
  const aW2 = pose({ sw: -2.55, hFx: -4, hFy: -10, lean: -0.14, hipX: -1, hipY: 1, hBx: -12, hBy: 10, fFx: 9, fBx: -9, cape: 0.45, capeT: 2, core: 1.5, flame: 0.4 });
  const aS1 = pose({ sw: -0.6, hFx: 16, hFy: -2, lean: 0.18, hipX: 2, hipY: 2, hBx: -12, hBy: 16, fFx: 12, fBx: -9, cape: 0.8, capeT: 3, flame: 0.5 });
  const aS2 = pose({ sw: 0.75, hFx: 18, hFy: 12, lean: 0.34, hipX: 3, hipY: 4, hBx: -11, hBy: 18, fFx: 13, fBx: -10, cape: 1, capeT: 4, flame: 0.5 });
  const aS3 = pose({ sw: 1.15, hFx: 14, hFy: 17, lean: 0.26, hipX: 2, hipY: 3, hBx: -8, hBy: 20, fFx: 12, fBx: -10, cape: 0.6, capeT: 5 });
  // Hieb B (Rückhand, aufsteigend)
  const bW1 = pose({ sw: 1.55, hFx: 12, hFy: 18, lean: 0.3, hipY: 4, hipX: 2, fFx: 12, fBx: -10, hBx: -9, hBy: 17, cape: 0.5, capeT: 1, flame: 0.4 });
  const bS1 = pose({ sw: 0.1, hFx: 19, hFy: 4, lean: 0.12, hipY: 2, hipX: 3, fFx: 13, fBx: -9, hBx: -12, hBy: 12, cape: 0.9, capeT: 2, flame: 0.5 });
  const bS2 = pose({ sw: -1.25, hFx: 12, hFy: -12, lean: -0.1, hipY: 0, hipX: 2, fFx: 12, fBx: -9, hBx: -13, hBy: 10, cape: 1.1, capeT: 3, flame: 0.5 });
  const bS3 = pose({ sw: -1.5, hFx: 8, hFy: -10, lean: -0.08, hipY: 0, hipX: 1, fFx: 10, fBx: -9, hBx: -10, hBy: 14, cape: 0.6, capeT: 4 });
  // Stoß (Linie)
  const tW1 = pose({ sw: 0.02, hFx: -4, hFy: 8, lean: -0.1, hipX: -2, hBx: 6, hBy: 6, fFx: 9, fBx: -10, cape: 0.3, capeT: 1, flame: 0.3 });
  const tW2 = pose({ sw: 0.0, hFx: -9, hFy: 6, lean: -0.2, hipX: -3, hipY: 2, hBx: 9, hBy: 4, spread: 0, fFx: 10, fBx: -11, cape: 0.4, capeT: 2, core: 1.5, flame: 0.6 });
  const tS1 = pose({ sw: 0.04, hFx: 24, hFy: 6, lean: 0.36, hipX: 6, hipY: 3, hBx: -14, hBy: 8, fFx: 18, fBx: -10, cape: 1.2, capeT: 3, flame: 0.7 });
  const tS2 = pose({ sw: 0.1, hFx: 22, hFy: 8, lean: 0.32, hipX: 6, hipY: 3, hBx: -12, hBy: 12, fFx: 18, fBx: -10, cape: 0.8, capeT: 4, flame: 0.4 });
  const tS3 = pose({ sw: 0.6, hFx: 15, hFy: 14, lean: 0.14, hipX: 3, hipY: 1, hBx: -8, hBy: 18, fFx: 12, fBx: -9, cape: 0.4, capeT: 5 });
  // Aschenwelle: beidhändig über den Kopf, dann in den Boden
  const wW1 = pose({ sw: -1.7, hFx: 5, hFy: -14, grip: 1, lean: -0.06, fFx: 8, fBx: -9, cape: 0.3, capeT: 1, jaw: 0.3, flame: 0.4 });
  const wW2 = pose({ sw: -2.35, hFx: 1, hFy: -20, grip: 1, lean: -0.2, hipY: -2, fFx: 9, fBx: -10, fBy: 2, cape: 0.4, capeT: 2, jaw: 1, core: 1.8, flame: 0.9, crownF: 0.3 });
  const wS1 = pose({ sw: -0.4, hFx: 18, hFy: -4, grip: 1, lean: 0.3, hipY: 3, fFx: 12, fBx: -10, cape: 0.9, capeT: 3, jaw: 1, flame: 0.9 });
  const wS2 = pose({ sw: 1.3, hFx: 19, hFy: 16, grip: 1, lean: 0.55, hipY: 9, fFx: 13, fBx: -12, cape: 1.1, capeT: 4, jaw: 0.8, core: 1.6, flame: 0.9 });
  const wS3 = pose({ sw: 1.33, hFx: 18, hFy: 17, grip: 1, lean: 0.5, hipY: 8, fFx: 13, fBx: -12, cape: 0.6, capeT: 5, jaw: 0.4, flame: 0.6 });
  const wS4 = pose({ sw: 1.0, hFx: 13, hFy: 17, grip: 0, lean: 0.2, hipY: 3, fFx: 10, fBx: -9, hBx: -8, hBy: 19, cape: 0.3, capeT: 6 });
  // Glutspeere: Zauberhand erhoben
  const cW1 = pose({ hBx: -2, hBy: -6, cast: 0.5, sw: 1.1, hFx: 10, hFy: 20, lean: -0.04, cape: 0.4, capeT: 1, core: 1.3, head: -0.5 });
  const cW2 = pose({ hBx: 6, hBy: -16, cast: 1, sw: 1.05, hFx: 10, hFy: 21, lean: -0.1, hipY: -1, cape: 0.6, capeT: 2, core: 1.8, jaw: 0.5, head: -1, headY: -1 });
  const cS1 = pose({ hBx: 16, hBy: -2, cast: 0.8, spread: 0.2, sw: 1.1, hFx: 9, hFy: 21, lean: 0.14, hipY: 1, cape: 0.8, capeT: 3, jaw: 0.3 });
  const cS2 = pose({ hBx: 12, hBy: 6, cast: 0.2, sw: 1.15, hFx: 9, hFy: 21, lean: 0.08, cape: 0.4, capeT: 4 });
  // Anrufung: Schwert gen Himmel (Meteore, Säulen, Beschwörung)
  const iW1 = pose({ sw: -1.45, hFx: 5, hFy: -12, hBx: -12, hBy: 2, spread: 0.4, cast: 0.4, lean: -0.08, cape: 0.5, capeT: 1, core: 1.4, head: -0.5, headY: -1, flame: 0.4 });
  const iW2 = pose({ sw: -1.57, hFx: 4, hFy: -22, hBx: -15, hBy: -4, spread: 0.9, cast: 0.9, lean: -0.16, hipY: -1, cape: 0.8, capeT: 2, core: 2, jaw: 0.8, head: -1, headY: -2, flame: 1, crownF: 0.5 });
  const iW3 = pose({ ...iW2, capeT: 3.5, hFy: -23, core: 2.2, cast: 1 });
  const iS1 = pose({ sw: -1.0, hFx: 12, hFy: -8, hBx: -12, hBy: 8, spread: 0.3, cast: 0.3, lean: 0.06, cape: 0.5, capeT: 4.5, core: 1.4, jaw: 0.3 });

  const hurtP = pose({ lean: -0.16, hipX: -2, head: -1.5, headY: -1, jaw: 0.7, hFx: 7, hFy: 16, sw: 0.7, core: 1.8, cape: 0.5, hBx: -9, hBy: 16 });

  // Aufstieg (1→2): sammelt sich, steigt empor, Rauchflügel entfalten sich, Schrei
  const as1 = pose({ lean: 0.22, hipY: 4, head: 1, headY: 2, sw: 1.3, hFx: 12, hFy: 18, hBx: -4, hBy: 18, cape: 0.1, core: 1.5, crack: 0.2 });
  const as2 = pose({ lean: 0.1, hipY: 2, sw: 1.2, hFx: 12, hFy: 16, hBx: -6, hBy: 16, hover: 4, wing: 0.25, cape: 0.4, capeT: 1, core: 1.8, crack: 0.3, eye: 1.3 });
  const as3 = pose({ lean: -0.26, hipY: -2, sw: -1.7, hFx: 6, hFy: -18, hBx: -16, hBy: -6, spread: 1, cast: 0.7, hover: 10, wing: 0.85, wingT: 1, jaw: 1, head: -1.5, headY: -2, cape: 1.1, capeT: 2, core: 2.4, crack: 0.45, crownF: 0.5, flame: 0.6, hair: 0.8 });
  const as4 = pose({ ...as3, capeT: 4, wingT: 3, hover: 11 });
  const as5 = pose({ lean: 0.04, sw: 1.6, hFx: 9, hFy: 20, hBx: -7, hBy: 20, hover: 10, wing: 0.72, wingFire: 0.25, crack: 0.35, crownF: 0.35, flame: 0.3, cape: 0.3, capeT: 6, wingT: 5 });

  // Entfesselung (2→3): krümmt sich, Risse brechen auf, Flügel lodern, Schrei
  const un1 = pose({ flat: 1, lean: 0.34, hipY: 5, head: 1.5, headY: 3, sw: 1.3, hFx: 6, hFy: 12, hBx: 2, hBy: 10, wing: -0.3, wingT: 0, cape: 0.1, core: 2, crack: 0.2, eye: 1.2 });
  const un2 = pose({ ...un1, capeT: 1, crack: 0.35, core: 2.5, wing: -0.35, hipY: 6 });
  const un3 = pose({ lean: -0.3, hipY: -2, head: -1.5, headY: -2, jaw: 1, sw: -1.9, hFx: 4, hFy: -18, hBx: -16, hBy: -8, spread: 1, cast: 1, wing: 0.3, wingFire: 0.75, wingT: 1, hover: 2, flat: 1, crack: 0.4, inferno: 1, crownF: 0.8, flame: 0.8, cape: 1.2, capeT: 2, core: 3, hair: 1 });
  const un4 = pose({ ...un3, capeT: 4, wingT: 3 });
  const un5 = pose({ flat: 1, lean: 0.04, sw: 1.6, hFx: 9, hFy: 20, hBx: -7, hBy: 20, wing: 0.28, wingFire: 0.75, hover: 3, crack: 0.4, inferno: 1, crownF: 0.45, flame: 0.4, cape: 0.3, capeT: 6, wingT: 5 });

  // Kanal (Form 3): hoch erhoben, Arme ausgebreitet, Schwert über dem Kopf
  const chA = pose({ hover: 3, lean: -0.12, sw: -1.57, hFx: 5, hFy: -24, hBx: -16, hBy: -10, spread: 1, cast: 1, jaw: 0.6, head: -1, headY: -2, cape: 1, capeT: 0, wingT: 0, core: 2.5, crownF: 0.4, flame: 0.6, hair: 0.6 });
  const chB = pose({ ...chA, hover: 4, capeT: Math.PI, wingT: Math.PI, core: 3, jaw: 0.9, hBy: -12 });

  // Tod (aus Form 3): Aufschrei, stürzt aus der Luft, kniet, Schwert in den Boden, zerfällt
  const dA = pose({ lean: -0.3, hipX: -2, head: -2, headY: -2, jaw: 1, sw: -0.9, hFx: 10, hFy: -6, hBx: -14, hBy: -6, spread: 1, core: 3, cape: 1, capeT: 1, hair: 0.8, wingT: 1 });
  const dB = pose({ lean: 0.12, hover: -8, wing: -0.4, wingFire: -0.6, kneel: 0.4, hipY: 2, head: 1, jaw: 0.6, sw: 1.2, hFx: 12, hFy: 16, hBx: -6, hBy: 16, core: 2, cape: 0.4, capeT: 2 });
  const dC = pose({ lean: 0.22, hover: -13, wing: -1, wingFire: -1, kneel: 1, hipY: 0, head: 1.5, headY: 2, jaw: 0.3, sw: Math.PI / 2 - 0.08, grip: 1, hFx: 8, hFy: 11, noSword: 1, core: 1.6, cape: 0.1, capeT: 3, crownF: -0.4, flame: -0.3 });
  const dD = pose({ ...dC, head: -0.5, headY: 0, jaw: 0.8, core: 2.4, capeT: 4, crack: 0.3, eye: 1.2 });
  const dE = pose({ ...dD, ash: 0.2, crownDrop: 0.2, capeT: 5, crownF: -1.3 });
  const dF = pose({ ...dD, ash: 0.55, crownDrop: 0.75, capeT: 6, crownF: -1.3 });
  const dG = pose({ ...dD, ash: 0.95, crownDrop: 1, capeT: 7, crownF: -1.3 });
  const dH = pose({ ...dD, ash: 1.02, crownDrop: 1, capeT: 8, crownF: -1.3 });

  const sweep = (a, b) => ({ smear: [a, b] });

  // Kampfanimationen je Gestalt
  const combat = (f) => {
    const sfx = f === 1 ? '' : '_' + f;
    const moveKeys = f === 1 ? walkKeys : glideKeys;
    return {
      ['idle' + sfx]: () => new Animation(track([[0, idleA], [0.5, idleB], [1, idleA]], 8, f, { loop: true }), 7),
      ['walk' + sfx]: () => new Animation(track(moveKeys, f === 1 ? 8 : 6, f, { loop: true, extras: f === 1 ? { 0: { fx: 'step' }, 4: { fx: 'step' } } : {} }), f === 1 ? 9 : 8),
      ['slashWindup' + sfx]: () => new Animation(track([[0, idleA], [0.5, aW1], [1, aW2]], 6, f, { extras: { 4: { swordBehind: true }, 5: { swordBehind: true } } }), 10, false),
      ['slash' + sfx]: () => new Animation(track([[0, aS1], [0.22, aS2, snap], [0.5, aS3], [1, pose({ ...aS3, capeT: 6, cape: 0.3 })]], 7, f, {
        extras: { 0: sweep(-2.6, -0.6), 1: { ...sweep(-1.7, 0.75), fx: 'impact' }, 2: sweep(-0.2, 1.1) },
      }), 16, false),
      ['slash2Windup' + sfx]: () => new Animation(track([[0, aS3], [1, bW1]], 3, f), 12, false),
      ['slash2' + sfx]: () => new Animation(track([[0, bS1], [0.25, bS2, snap], [0.55, bS3], [1, pose({ ...bS3, capeT: 5, cape: 0.3 })]], 7, f, {
        extras: { 0: sweep(1.5, 0.1), 1: { ...sweep(1.0, -1.25), fx: 'impact' }, 2: sweep(-0.4, -1.5) },
      }), 16, false),
      ['thrustWindup' + sfx]: () => new Animation(track([[0, idleA], [0.5, tW1], [1, tW2]], 5, f), 9, false),
      ['thrust' + sfx]: () => new Animation(track([[0, tS1, snap], [0.3, tS2], [1, tS3]], 6, f, { extras: { 0: { fx: 'impact' } } }), 14, false),
      ['waveWindup' + sfx]: () => new Animation(track([[0, idleA], [0.45, wW1], [1, wW2]], 7, f, { extras: { 6: { swordBehind: true } } }), 9, false),
      ['wave' + sfx]: () => new Animation(track([[0, wS1], [0.18, wS2, snap], [0.5, wS3], [1, wS4]], 8, f, {
        extras: { 0: sweep(-2.3, -0.4), 1: { ...sweep(-1.2, 1.3), fx: 'impact' } },
      }), 13, false),
      ['cast' + sfx]: () => new Animation(track([[0, idleA], [0.3, cW1], [0.55, cW2], [0.75, cS1, snap], [1, cS2]], 9, f, { extras: { 6: { fx: 'cast' } } }), 10, false),
      ['invoke' + sfx]: () => new Animation(track([[0, idleA], [0.3, iW1], [0.55, iW2], [0.8, iW3], [1, iS1]], 10, f, { extras: { 5: { fx: 'cast' } } }), 9, false),
      ['hurt' + sfx]: () => new Animation(track([[0, hurtP], [1, idleA]], 3, f), 12, false),
    };
  };

  return lazy({
    ...combat(1), ...combat(2), ...combat(3),
    dormant: () => new Animation(track([[0, rest], [0.5, { ...rest, core: 0.8, eye: 0.35, capeT: Math.PI, headY: 2.5 }], [1, rest]], 6, 1, { loop: true }), 3),
    awaken: () => new Animation(track([
      [0, rest], [0.14, { ...rest, eye: 0.6 }], [0.28, lookUp], [0.45, draw1], [0.62, draw2, snap], [0.78, { ...draw2, capeT: 4 }], [1, point],
    ], 18, 1, { extras: { 10: { fx: 'roar' }, 7: { swordBehind: true } } }), 9, false),
    ascend: () => new Animation(track([
      [0, idleA], [0.15, as1], [0.35, as2], [0.55, as3, snap], [0.78, as4], [1, as5],
    ], 20, 1, { extras: { 11: { fx: 'roar' } } }), 9, false),
    unleash: () => new Animation(track([
      [0, pose({ ...idleA })], [0.2, un1], [0.4, un2], [0.55, un3, snap], [0.8, un4], [1, un5],
    ], 18, 2, { extras: { 10: { fx: 'roar' } } }), 9, false),
    channelUp: () => new Animation(track([[0, idleA], [0.5, pose({ ...iW1, hover: 5 })], [1, chA]], 6, 3), 9, false),
    channel: () => new Animation(track([[0, chA], [0.5, chB], [1, chA]], 6, 3, { loop: true }), 8),
    death: () => {
      const f = 3;
      const fall = track([[0, hurtP], [0.25, dA, snap], [0.5, pose({ ...dA, capeT: 2, hover: -2 })], [0.8, dB], [1, pose({ ...dC, noSword: 0 })]], 10, f, { extras: { 2: { fx: 'roar' }, 9: { fx: 'impact' } } });
      const keys = [[0, dC], [0.18, dD], [0.3, dD], [0.42, dE, linear], [0.72, dF, linear], [0.9, dG, linear], [1, dH]];
      const n = 22;
      const rest2 = [];
      for (let i = 0; i < n; i++) {
        const P = sample(keys, i / (n - 1));
        const fx = i === 1 ? 'impact' : (P.crownDrop > 0.58 && sample(keys, (i - 1) / (n - 1)).crownDrop <= 0.58) ? 'crown' : i === 7 ? 'ash' : null;
        rest2.push(deathFrame(P, f, fx));
      }
      return new Animation([...fall, ...rest2], 8, false);
    },
  });
}

// Maße für die Gegnerdefinition (Anker = Boden)
export const MALGARETH_SIZE = { w: W, h: H, ax: AX, ay: AY };
