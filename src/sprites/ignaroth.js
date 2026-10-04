import { PAL } from '../gfx/Palette.js';
import { makeCanvas, flipCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame, Animation } from '../gfx/Sprite.js';
import { hash2 } from '../core/math.js';

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
const tx = (x) => BAX + (x - AX) * SC, ty = (y) => BAY + (y - AY) * SC;
// Fußabdruck eines Rig-Punkts im Zielpuffer (lückenlos auch bei Ganzzahl-Schleifen)
function foot(x, y, f) {
  const X = tx(x), Y = ty(y);
  const x0 = Math.round(X), y0 = Math.round(Y);
  const x1 = Math.max(x0, Math.round(X + SC) - 1), y1 = Math.max(y0, Math.round(Y + SC) - 1);
  for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) f(xx, yy);
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
  constructor() {
    this.base = new Uint32Array(W * H);
    this.ga = new Uint32Array(W * H);
    this.gb = new Uint32Array(W * H);
    this.nr = new Uint8Array(W * H); // 1 = kein Umriss/Randlicht (Schwung-Schleier, Funken)
  }
}

// Stift für das Grundbild: deckt darunter liegendes Glühen ab.
// px/rect/line/ellipse nehmen Rig-Koordinaten; set schreibt direkt in den Zielpuffer.
class Pen {
  constructor(L) { this.L = L; this.soft = 0; this.fine = 0; }
  set(x, y, c) {
    if (x < 0 || y < 0 || x >= W || y >= H || y > BCLIP) return;
    const i = y * W + x;
    this.L.base[i] = col(c); this.L.ga[i] = 0; this.L.gb[i] = 0; this.L.nr[i] = this.soft;
  }
  // fine = 1: Detailpixel (Gesicht) bleiben einzelne Pixel statt Fußabdruck
  px(x, y, c) {
    if (this.fine) this.set(Math.round(tx(x)), Math.round(ty(y)), c);
    else foot(x, y, (X, Y) => this.set(X, Y, c));
  }
  rect(x, y, w, h, c) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    if (w <= 0 || h <= 0) return;
    const x0 = Math.round(tx(x)), y0 = Math.round(ty(y));
    const x1 = Math.max(x0 + 1, Math.round(tx(x + w))), y1 = Math.max(y0 + 1, Math.round(ty(y + h)));
    for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) this.set(i, j, c);
  }
  line(x0, y0, x1, y1, c) { bres(tx(x0), ty(y0), tx(x1), ty(y1), (x, y) => this.set(x, y, c)); }
  ellipse(cx, cy, rx, ry, c) { fillEllipse(tx(cx), ty(cy), rx * SC, ry * SC, (x, y) => this.set(x, y, c)); }
}

// Stift für die Leucht-Ebenen: Index in die Rampe (0 dunkel … 4 weiß).
// px zeichnet in beide Ebenen, e* nur in die Phase-3-Ebene, a* nur Phase 1–2.
class GlowPen {
  constructor(L) { this.L = L; this.fine = 0; }
  put(buf, ramp, x, y, i) {
    if (x < 0 || y < 0 || x >= W || y >= H || y > BCLIP) return;
    buf[y * W + x] = ramp[Math.max(0, Math.min(4, i))];
  }
  set(buf, ramp, x, y, i) {
    if (this.fine) this.put(buf, ramp, Math.round(tx(x)), Math.round(ty(y)), i);
    else foot(x, y, (X, Y) => this.put(buf, ramp, X, Y, i));
  }
  tpx(X, Y, i) { this.put(this.L.ga, EMBc, X, Y, i); this.put(this.L.gb, INFc, X, Y, i); }
  tepx(X, Y, i) { this.put(this.L.gb, INFc, X, Y, i); }
  tapx(X, Y, i) { this.put(this.L.ga, EMBc, X, Y, i); }
  px(x, y, i) { this.set(this.L.ga, EMBc, x, y, i); this.set(this.L.gb, INFc, x, y, i); }
  epx(x, y, i) { this.set(this.L.gb, INFc, x, y, i); }
  apx(x, y, i) { this.set(this.L.ga, EMBc, x, y, i); }
  rect(x, y, w, h, i) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    if (w <= 0 || h <= 0) return;
    const x0 = Math.round(tx(x)), y0 = Math.round(ty(y));
    const x1 = Math.max(x0 + 1, Math.round(tx(x + w))), y1 = Math.max(y0 + 1, Math.round(ty(y + h)));
    for (let j = y0; j < y1; j++) for (let k = x0; k < x1; k++) this.tpx(k, j, i);
  }
  line(x0, y0, x1, y1, i) { bres(tx(x0), ty(y0), tx(x1), ty(y1), (x, y) => this.tpx(x, y, i)); }
  eline(x0, y0, x1, y1, i) { bres(tx(x0), ty(y0), tx(x1), ty(y1), (x, y) => this.tepx(x, y, i)); }
  ellipse(cx, cy, rx, ry, i) { fillEllipse(tx(cx), ty(cy), rx * SC, ry * SC, (x, y) => this.tpx(x, y, i)); }
  eellipse(cx, cy, rx, ry, i) { fillEllipse(tx(cx), ty(cy), rx * SC, ry * SC, (x, y) => this.tepx(x, y, i)); }
  aellipse(cx, cy, rx, ry, i) { fillEllipse(tx(cx), ty(cy), rx * SC, ry * SC, (x, y) => this.tapx(x, y, i)); }
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
  for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
    const t = 1 - (y * y) / (ry * ry);
    if (t < 0) continue;
    const hw = Math.round(rx * Math.sqrt(t) - 0.15);
    for (let x = -hw; x <= hw; x++) f(Math.round(cx) + x, Math.round(cy) + y);
  }
}

// Leucht-Frame ohne Treffer-Blitz-Varianten; Spiegelbild erst bei Bedarf.
class GlowFrame {
  constructor(canvas, ax, ay) { this.canvas = canvas; this.ax = ax; this.ay = ay; this.flipCache = null; }
  get flipped() { return (this.flipCache ??= flipCanvas(this.canvas)); }
  draw(ctx, x, y, { flip = false, alpha = 1 } = {}) {
    const img = flip ? this.flipped : this.canvas;
    const ax = flip ? this.canvas.width - this.ax : this.ax;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    ctx.drawImage(img, Math.round(x - ax), Math.round(y - this.ay));
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
    px0 = x; py0 = y;
  }
}

// ---------------------------------------------------------------- Großaxt

// Axt entlang Winkel a vom Griffpunkt (hx, hy). u = entlang des Stiels,
// v = quer (+v = Schneide). Die Schneide glüht (heat verstärkt).
function greataxe(p, g, hx, hy, a, heat = 0) {
  const dx = Math.cos(a), dy = Math.sin(a);
  const nx = -dy, ny = dx; // Schneidenseite
  const at = (u, v) => [hx + dx * u + nx * v, hy + dy * u + ny * v];
  // Welche Seite der Axt zeigt nach oben (Licht)?
  const upSide = ny < 0 ? 1 : -1;
  // Stiel: dunkles Eisen, Goldbänder, Lederwicklung am Griff
  for (let u = -11; u <= 47; u += 0.5) {
    const band = (u > -1 && u < 1) || (u > 13 && u < 15) || (u > 26 && u < 28.5);
    const wrap = u > -8 && u < 8 && !band;
    for (let v = -1.5; v <= 1.5; v += 0.5) {
      const lit = v * upSide > 0.6 ? 3 : v * upSide < -0.6 ? 0 : 1;
      let c = band ? GOLD[[1, 2, 2, 4][lit]] : wrap ? PAL.leather[[0, 1, 2, 3][lit]] : IRON[lit];
      if (wrap && (Math.round(u * 2) % 3 === 0)) c = PAL.leather[0];
      const [x, y] = at(u, v); p.px(x, y, c);
    }
  }
  // Knauf mit Glutstein
  for (let v = -2.5; v <= 2.5; v += 0.5) for (let u = -14; u <= -11; u += 0.5) {
    if (Math.abs(v) + (u + 14) * 0.2 > 3.2) continue;
    const [x, y] = at(u, v); p.px(x, y, v * upSide > 0 ? GOLD[3] : GOLD[1]);
  }
  { const [x, y] = at(-12.5, 0); p.px(x, y, MAG[2]); g.px(x, y, 3); }
  // Obere Spitze
  for (let u = 46; u <= 53; u += 0.5) {
    const hw = 1.6 * (1 - (u - 46) / 7);
    for (let v = -hw; v <= hw; v += 0.5) { const [x, y] = at(u, v); p.px(x, y, v * upSide > 0 ? OBS[4] : OBS[2]); }
  }
  // Rückendorn
  for (let u = 32; u <= 40; u += 0.5) {
    const len = 1.5 + 7 * Math.max(0, 1 - Math.abs(u - 36) / 4);
    for (let v = 1.5; v <= len; v += 0.5) {
      const edgeTop = (u < 36) === (upSide < 0);
      const [x, y] = at(u, -v); p.px(x, y, v > len - 1 ? OBS[4] : edgeTop ? OBS[3] : OBS[1]);
    }
  }
  // Blatt: Halbmond, am Stiel schmal, außen ausladend
  const vOut = (u) => -7 + Math.sqrt(Math.max(0, 400 - (u - 36) * (u - 36)));
  const vIn = (u) => Math.max(1.5, 1.5 + (Math.abs(u - 36) - 5) * 1.35);
  const runes = [];
  for (let u = 20; u <= 52; u += 0.5) {
    const vo = vOut(u), vi = vIn(u);
    if (vo <= vi) continue;
    for (let v = vi; v <= vo; v += 0.5) {
      const d = vo - v;
      const [x, y] = at(u, v);
      let c;
      if (d < 1.1) c = EDGE[upSide * (u - 36) < 0 ? 3 : 2];
      else if (d < 2.1) c = EDGE[0];
      else if (d < 3) c = OBS[4];
      else {
        // Facette: obere Hälfte heller (Licht von oben)
        const top = (u - 36) * dy * -1 + (v - 6) * ny * -1 > 0;
        c = OBS[top ? 3 : 2];
        if (v - vi < 1) c = OBS[1];
      }
      p.px(x, y, c);
    }
    if (Math.abs(u - 36) < 7 && Math.round(u * 2) % 5 === 0) runes.push(u);
  }
  // Glühende Schneide und Runen
  for (let u = 20; u <= 52; u += 0.5) {
    const vo = vOut(u), vi = vIn(u);
    if (vo <= vi) continue;
    const [x, y] = at(u, vo - 0.5);
    const mid = 1 - Math.abs(u - 36) / 16;
    g.px(x, y, mid > 0.5 ? 2 + (heat > 0.5 ? 1 : 0) : 1 + (heat > 0.5 ? 1 : 0));
    g.epx(x, y, mid > 0.4 ? 4 : 3);
    if (heat > 0.3 && vo - vi > 2) { const [x2, y2] = at(u, vo - 1.5); g.px(x2, y2, 1); g.epx(x2, y2, 2); }
  }
  for (const u of runes) {
    const [x, y] = at(u, 6 + (Math.round(u) % 2)); p.px(x, y, MAG[1]); g.px(x, y, 2); g.epx(x, y, 3);
  }
  // Riss durch das Blatt (Phase 3)
  { let [x0, y0] = at(33, 3); for (const [u, v] of [[35, 6], [34, 9], [37, 12]]) { const [x1, y1] = at(u, v); g.eline(x0, y0, x1, y1, 2); x0 = x1; y0 = y1; } }
  const [tx, ty] = at(36, vOut(36));
  const [cx, cy] = at(36, 5);
  return { tipX: tx, tipY: ty, headX: cx, headY: cy };
}

// Feuriger Schwung-Schleier zwischen zwei Axtwinkeln um einen Drehpunkt.
function smear(p, g, cx, cy, a0, a1, r0, r1) {
  p.soft = 1;
  // im Zielpuffer rastern (feines Rauschen statt Doppelpixel)
  const CX = Math.round(tx(cx)), CY = Math.round(ty(cy));
  r0 *= SC; r1 *= SC;
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
    if (hash2(x + 99, y + 99, 17) > dens) continue;
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
  const darkO = [OBS[0], OBS[1], OBS[2], OBS[3]];
  const litO = [OBS[1], OBS[2], OBS[3], OBS[4]];
  leg(p, g, hipX - 4, hipY, legB, darkO, true, P);
  limb(p, shB.x, shB.y, armB.jx, armB.jy, 6, 5.5, darkO);
  limb(p, armB.jx, armB.jy, armB.ex, armB.ey, 7.5, 6.5, darkO);
  p.ellipse(armB.jx, armB.jy, 2.5, 2.5, OBS[1]);
  fist(p, g, armB.ex, armB.ey, darkO, P.cast > 0.3);
  meta.cast = { x: armB.ex, y: armB.ey - 4 };
  pauldron(p, g, shB.x - 2, shB.y - 2, 8, 6, darkO, [[-2, 8, -2]], false);

  if (extra.axeBehind) {
    const t = greataxe(p, g, hF.x, hF.y, aa, P.heat);
    meta.tip = { x: t.tipX, y: t.tipY }; meta.axe = { x: t.headX, y: t.headY };
  }

  // --- 3. Rumpf
  torso(p, g, along, P, meta);

  // --- 4. Vorderes Bein, Tassetten, Gürtel
  leg(p, g, hipX + 4, hipY, legF, litO, false, P);
  belt(p, g, hipX, hipY, P, legF, legB);

  // --- 5. Halsberge und Kopf mit Hörnerkrone
  p.ellipse(neckX, neckY - 1, 6, 4, OBS[1]); p.ellipse(neckX - 0.5, neckY - 2, 5, 2.5, OBS[2]);
  p.line(neckX - 5, neckY - 3, neckX + 3, neckY - 4, OBS[3]);
  p.rect(neckX - 2, neckY - 6, 5, 3, SKIN[1]); p.px(neckX - 2, neckY - 6, SKIN[3]);
  p.line(neckX - 4, neckY + 1, neckX + 5, neckY + 1, MAG[1]); g.line(neckX - 3, neckY + 1, neckX + 4, neckY + 1, 1);
  head(p, g, hx, hy, P, meta, gy);

  // --- 6. Schwung-Schleier
  if (extra.smear) smear(p, g, shF.x, shF.y, extra.smear[0], extra.smear[1], 30, 64);

  // --- 7. Vorderer Arm mit Axt
  const drawArm = () => {
    limb(p, shF.x, shF.y, armF.jx, armF.jy, 6.5, 6, [SKIN[0], SKIN[1], SKIN[2], SKIN[3]]);
    limb(p, armF.jx, armF.jy, armF.ex, armF.ey, 8, 7, litO);
    // Lavanaht am Unterarm
    const mx = (armF.jx + armF.ex) / 2, my = (armF.jy + armF.ey) / 2;
    p.line(armF.jx + (mx - armF.jx) * 0.4, armF.jy + (my - armF.jy) * 0.4, mx + (armF.ex - mx) * 0.6, my + (armF.ey - my) * 0.6, MAG[3]);
    g.line(armF.jx + (mx - armF.jx) * 0.4, armF.jy + (my - armF.jy) * 0.4, mx + (armF.ex - mx) * 0.6, my + (armF.ey - my) * 0.6, 2);
    // Ellbogen mit Dorn
    p.ellipse(armF.jx, armF.jy, 3, 3, OBS[2]); p.px(armF.jx - 1, armF.jy - 1, OBS[4]);
    const ex = armF.jx - (armF.ex - armF.jx) * 0.3, ey = armF.jy - (armF.ey - armF.jy) * 0.3;
    limb(p, armF.jx, armF.jy, ex, ey, 2.5, 1, [OBS[1], OBS[2], OBS[4], SPEC]);
  };
  if (!extra.axeBehind) {
    drawArm();
    const t = greataxe(p, g, hF.x, hF.y, aa, P.heat);
    meta.tip = { x: t.tipX, y: t.tipY }; meta.axe = { x: t.headX, y: t.headY };
    fist(p, g, hF.x, hF.y, litO, false);
  } else { drawArm(); fist(p, g, hF.x, hF.y, litO, false); }
  pauldron(p, g, shF.x + 4, shF.y + 1, 9, 7, litO, [[-1, 7, 1], [4, 5, 4]], true);
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

// Rumpf: breiter Brustharnisch aus Schmiedestahl (V-Form), darunter gestaffelte
// Bauchschienen mit Glutnähten, mittig der Glutkern in Messingfassung.
function torso(p, g, along, P, meta) {
  const LAME = 3.4;
  for (let s = 0; s <= SPINE + 1.5; s += 0.5) {
    const t = s / SPINE;
    const sm = t * t * (3 - 2 * t);
    let hwB = (7 + 3.5 * sm) * 1.16;
    let hwF = (7 + 4.5 * sm + (t > 0.48 && t < 0.98 ? 2 * Math.sin((t - 0.48) / 0.5 * Math.PI) : 0)) * 1.16;
    if (t > 0.9) { const r = Math.sqrt(Math.max(0, 1 - ((t - 0.9) / 0.17) ** 2)); hwB *= 0.55 + 0.45 * r; hwF *= 0.5 + 0.5 * r; }
    const chest = t >= 0.5;
    const f = (s % LAME) / LAME;
    const seam = !chest && s > 1 && f < 0.17;
    const lip = !chest && f > 0.78;
    for (let k = -hwB; k <= hwF; k += 0.5) {
      const rel = (k + hwB) / (hwB + hwF);
      let i = rel < 0.08 ? 1 : rel < 0.3 ? 2 : rel < 0.62 ? 3 : rel < 0.86 ? 2 : 1;
      const [x, y] = along(s, k);
      if (seam) {
        if (rel > 0.05 && rel < 0.95) { p.px(x, y, rel > 0.25 && rel < 0.75 ? MAG[3] : MAG[2]); if (rel > 0.15 && rel < 0.85) g.px(x, y, rel > 0.3 && rel < 0.7 ? 2 : 1); }
        else p.px(x, y, OBS[0]);
        continue;
      }
      if (lip) i = Math.min(4, i + 1);
      if (chest) {
        // Unterkante des Harnischs: dunkle Schattenkante
        if (t < 0.55) i = Math.max(0, i - 1);
        // Mittelgrat und Brustplatten
        const ridge = hwF * 0.18;
        if (Math.abs(k - ridge) < 0.5) i = 4;
        else if (k > ridge && k < ridge + 1.2) i = 1;
        if (t > 0.86 && rel > 0.2 && rel < 0.7) i = Math.min(4, i + 1);
      }
      p.px(x, y, OBS[i]);
    }
    // Messingkante am unteren Harnischrand
    if (chest && t < 0.53) for (let k = -hwB + 1; k <= hwF - 1; k += 0.5) { const [x, y] = along(s, k); p.px(x, y, (k * 2 | 0) % 4 === 0 ? GOLD[4] : GOLD[2]); }
  }
  // Glanzpunkte
  { const [x, y] = along(SPINE - 2, -3); p.px(x, y, SPEC); p.px(x + 1, y, OBS[4]); }
  { const [x, y] = along(SPINE * 0.8, 6); p.px(x, y, OBS[4]); }
  // Risse laufen vom Kern durch die Platten
  const cracks = [
    [[0.66, -1.5], [0.82, -2], [0.9, -4], [1.0, -7]],
    [[0.66, -1.5], [0.58, -3], [0.44, -5], [0.3, -2], [0.2, -6]],
  ];
  // Glutrisse durch die Schlacke (immer sichtbar, Phase 3 weißglühend)
  for (const c of cracks) {
    for (let i = 0; i < c.length - 1; i++) {
      const [x0, y0] = along(c[i][0] * SPINE, c[i][1] * 1.16), [x1, y1] = along(c[i + 1][0] * SPINE, c[i + 1][1] * 1.16);
      bres(x0, y0, x1, y1, (x, y) => { p.px(x, y, i === 0 ? MAG[3] : MAG[2]); g.apx(x, y, i === 0 ? 2 : 1); g.epx(x, y, i === 0 ? 4 : 3); });
    }
  }
  // Rückenseitiger Glutriss am Harnisch
  for (const [a, b] of [[[0.72, -9], [0.82, -7]], [[0.82, -7], [0.95, -9]]]) {
    const [x0, y0] = along(a[0] * SPINE, a[1]), [x1, y1] = along(b[0] * SPINE, b[1]);
    bres(x0, y0, x1, y1, (x, y) => { p.px(x, y, MAG[2]); g.px(x, y, 2); });
  }
  // Glutkern in Messingfassung
  const [cx, cy] = along(SPINE * 0.66, -1.5);
  const r = 2.4 + P.core * 0.8;
  p.ellipse(cx, cy, r + 2.5, r + 2.2, GOLD[1]);
  p.ellipse(cx - 0.5, cy - 0.5, r + 1.6, r + 1.4, GOLD[3]);
  p.ellipse(cx, cy, r + 1, r + 1, OBS[0]);
  p.ellipse(cx, cy, r, r, MAG[2]);
  p.ellipse(cx - 0.3, cy - 0.3, Math.max(0.6, r - 1.3), Math.max(0.6, r - 1.3), MAG[3]);
  p.px(cx - 1, cy - 1, '#ffd890');
  // Krallen der Fassung
  for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.px(cx + ox * (r + 2.5), cy + oy * (r + 2), GOLD[ox < 0 && oy < 0 ? 4 : 3]);
  g.ellipse(cx, cy, r + 0.5, r + 0.5, 1);
  g.ellipse(cx, cy, r - 0.3, r - 0.3, 2);
  g.ellipse(cx, cy - 0.3, Math.max(0.6, r - 1.4), Math.max(0.6, r - 1.4), 3);
  g.px(cx, cy - 0.5, 4);
  g.eellipse(cx, cy, r + 1.5, r + 1.2, 2);
  g.eellipse(cx, cy, r, r, 3);
  g.eellipse(cx, cy, Math.max(0.6, r - 1), Math.max(0.6, r - 1), 4);
  meta.chest = { x: cx, y: cy };
}

function belt(p, g, hipX, hipY, P, legF, legB) {
  // Tassetten: drei schwere Platten, folgen den Oberschenkeln
  const plates = [
    { x: hipX - 9, w: 6, len: 8, ramp: [OBS[0], OBS[1], OBS[2], OBS[3]], sw: (legB.jx - hipX + 4) * 0.25 },
    { x: hipX - 3, w: 7, len: 10, ramp: [OBS[1], OBS[2], OBS[3], OBS[4]], sw: 0 },
    { x: hipX + 4, w: 7, len: 10, ramp: [OBS[1], OBS[2], OBS[3], OBS[4]], sw: (legF.jx - hipX - 4) * 0.3 },
  ];
  for (const pl of plates) {
    for (let j = 0; j < pl.len; j++) {
      const v = j / pl.len, x = pl.x + pl.sw * v + Math.sin(P.capeT + pl.x) * 0.4 * v;
      const wj = pl.w - (j > pl.len - 3 ? (j - pl.len + 3) : 0);
      for (let i = 0; i < wj; i++) {
        let c = pl.ramp[i === 0 ? 3 : i < wj * 0.5 ? 2 : i < wj - 1 ? 1 : 0];
        if (j === 0) c = pl.ramp[3];
        if (j === 4) c = pl.ramp[0];
        if (j === 5) c = pl.ramp[3];
        p.px(x + i + (j > pl.len - 3 ? (j - pl.len + 3) * 0.5 : 0), hipY + j, c);
      }
      if (j === 4) { p.px(x + 2, hipY + j, MAG[1]); p.px(x + 3, hipY + j, MAG[1]); g.px(x + 2, hipY + j, 1); }
    }
    p.px(pl.x + 1, hipY + 2, GOLD[3]);
  }
  // Gürtel aus Messing und Leder
  p.rect(hipX - 11, hipY - 3, 23, 4, PAL.leather[0]); p.rect(hipX - 11, hipY - 3, 23, 1, PAL.leather[2]);
  for (let x = hipX - 10; x < hipX + 12; x += 3) p.px(x, hipY - 1, GOLD[3]);
  // Schnalle: Dämonenfratze
  const bx = hipX + 3, by = hipY - 6;
  p.rect(bx - 3, by, 8, 7, GOLD[1]); p.rect(bx - 2, by, 6, 6, GOLD[2]); p.rect(bx - 2, by, 6, 1, GOLD[4]); p.rect(bx - 2, by + 1, 1, 4, GOLD[3]);
  p.px(bx - 4, by - 1, GOLD[3]); p.px(bx + 5, by - 1, GOLD[3]); p.px(bx - 4, by - 2, GOLD[4]); p.px(bx + 5, by - 2, GOLD[2]);
  p.px(bx - 1, by + 2, VOID); p.px(bx + 2, by + 2, VOID); p.rect(bx - 1, by + 4, 4, 1, VOID);
  g.px(bx - 1, by + 2, 3); g.px(bx + 2, by + 2, 3); g.px(bx, by + 4, 1); g.px(bx + 1, by + 4, 1);
}

function leg(p, g, hx, hy, L, ramp, back, P) {
  // Oberschenkel: dunkles Kettengeflecht
  const mail = back ? [OBS[0], SKIN[0], SKIN[1], SKIN[2]] : [SKIN[0], SKIN[1], SKIN[2], SKIN[3]];
  limb(p, hx, hy, L.jx, L.jy, 9, 7.5, mail);
  // Beinschiene: breit oben, schmaler zum Knöchel, Mittelgrat
  limb(p, L.jx, L.jy, L.ex, L.ey - 4, 8, 6.5, ramp);
  const dx = L.ex - L.jx, dy = L.ey - 4 - L.jy, len = Math.hypot(dx, dy) || 1;
  for (let t = 0.15; t < 0.95; t += 0.05) p.px(L.jx + dx * t + 1, L.jy + dy * t, ramp[3]);
  // Glutnaht quer über die Schiene
  const mx = L.jx + dx * 0.6, my = L.jy + dy * 0.6;
  p.line(mx - 3, my, mx + 3, my + 0.5, back ? MAG[1] : MAG[3]); g.line(mx - 2, my, mx + 2, my + 0.5, back ? 1 : 2);
  bres(L.jx + 0.5, L.jy + 3, mx, my, (x, y) => { p.px(x, y, back ? MAG[1] : MAG[2]); g.apx(x, y, back ? 0 : 1); g.epx(x, y, back ? 1 : 3); });
  // Sabaton: breit, gestaffelt, Messingkappe, Krallen
  const ex = Math.round(L.ex), ey = Math.round(L.ey);
  p.rect(ex - 5, ey - 5, 12, 5, ramp[1]);
  p.rect(ex - 5, ey - 5, 12, 1, ramp[3]);
  p.rect(ex - 4, ey - 7, 7, 2, ramp[2]); p.rect(ex - 4, ey - 7, 7, 1, ramp[3]);
  p.rect(ex + 3, ey - 3, 4, 1, ramp[2]);
  p.rect(ex - 5, ey - 1, 12, 1, ramp[0]);
  p.rect(ex + 4, ey - 5, 3, 1, back ? GOLD[1] : GOLD[3]);
  const cl = back ? [HORN[1], HORN[2]] : [HORN[3], HORN[4]];
  p.px(ex + 7, ey - 2, cl[0]); p.px(ex + 8, ey - 1, cl[1]); p.px(ex + 7, ey - 1, cl[0]); p.px(ex + 8, ey - 3, cl[0]);
  p.px(ex, ey - 3, MAG[3]); p.px(ex + 1, ey - 3, MAG[2]); g.px(ex, ey - 3, back ? 1 : 3); g.px(ex + 1, ey - 3, back ? 0 : 2);
  // Kniekachel mit Dorn
  p.ellipse(L.jx, L.jy, 4, 3.6, ramp[0]);
  p.ellipse(L.jx - 0.3, L.jy - 0.3, 3.2, 2.8, ramp[1]);
  p.ellipse(L.jx - 0.8, L.jy - 0.8, 2, 1.6, ramp[2]); p.px(L.jx - 1.5, L.jy - 1.5, ramp[3]);
  limb(p, L.jx + 2, L.jy - 0.5, L.jx + 6.5, L.jy - 2.5, 3, 1, back ? [VOID, OBS[0], OBS[1], OBS[2]] : [OBS[1], OBS[2], OBS[4], SPEC]);
}

function fist(p, g, x, y, ramp, open) {
  // Panzerhandschuh: Stulpe, Knöchel mit Messingnieten
  p.rect(x - 4, y - 3, 8, 6, ramp[0]);
  p.rect(x - 3, y - 3, 6, 5, ramp[1]); p.rect(x - 3, y - 3, 6, 1, ramp[3]); p.rect(x + 2, y - 2, 1, 4, ramp[0]);
  p.px(x - 2, y - 4, ramp[2]); p.px(x, y - 4, ramp[2]); p.px(x + 2, y - 4, ramp[2]);
  p.px(x - 2, y - 1, GOLD[3]); p.px(x + 1, y - 1, GOLD[2]);
  if (open) for (let k = -2; k <= 2; k += 2) { p.line(x + k * 0.7, y - 3, x + k * 1.3, y - 7, ramp[2]); p.px(x + k * 1.3, y - 7, HORN[4]); }
}

function pauldron(p, g, x, y, rx, ry, ramp, spikes, front) {
  // zwei hängende Schienen unter der Kuppel
  for (let l = 2; l >= 1; l--) {
    const ly = y + ry - 2 + l * 2.6, lx = x + l * 0.6, lr = rx - 1 - l * 0.8;
    p.ellipse(lx, ly, lr, 2.6, ramp[0]);
    p.ellipse(lx - 0.3, ly - 0.6, lr - 0.8, 1.6, ramp[2]);
    p.line(lx - lr + 1.5, ly - 2, lx + lr - 1.5, ly - 2, ramp[3]);
    p.line(lx - lr + 2, ly + 1, lx + lr - 2, ly + 1, front ? MAG[2] : MAG[1]);
    for (let k = -lr + 3; k < lr - 2; k++) g.px(lx + k, ly + 1, front ? (k % 3 === 0 ? 3 : 2) : 1);
  }
  // Kuppel
  p.ellipse(x, y, rx, ry, ramp[0]);
  p.ellipse(x - 0.5, y - 0.5, rx - 1, ry - 1, ramp[1]);
  p.ellipse(x - 1.5, y - 1.5, rx - 2.5, ry - 2.3, ramp[2]);
  p.ellipse(x - 2.5, y - 2.6, Math.max(0.6, rx - 5.2), Math.max(0.6, ry - 4.2), ramp[3]);
  // Messingrand an der Unterkante
  for (let k = -rx + 1.5; k <= rx - 1.5; k += 0.5) {
    const yy = y + ry * Math.sqrt(Math.max(0, 1 - (k * k) / (rx * rx))) - 1;
    p.px(x + k, yy, front ? (k < 0 ? GOLD[3] : GOLD[2]) : GOLD[1]);
  }
  if (front) {
    p.px(x - 3, y - ry + 2, SPEC); p.px(x - 2, y - ry + 2, ramp[3]);
    for (const [a, b, c, d] of [[x - 2, y - 2, x + 2, y + 1], [x + 2, y + 1, x + 1, y + 4], [x + 2, y + 1, x + 5, y]]) bres(a, b, c, d, (px, py) => { p.px(px, py, MAG[3]); g.apx(px, py, 3); g.epx(px, py, 4); });
  } else {
    bres(x - 1, y - 1, x + 2, y + 2, (px, py) => { p.px(px, py, MAG[1]); g.px(px, py, 1); });
  }
  for (const [sx, h, lx] of spikes) {
    limb(p, x + sx, y - ry + 2, x + sx + lx, y - ry + 2 - h, 4, 1, front ? [OBS[1], OBS[2], OBS[4], SPEC] : [VOID, OBS[0], OBS[1], OBS[3]]);
    g.epx(x + sx + lx, y - ry + 2 - h, 2);
  }
}

// Kopf: gehörnter Schmiedehelm mit Schädelvisier, schwerer Brauenwulst,
// glühende Augen, Reißzähne. Zwei mächtige Knochenhörner (das nahe schwingt
// nach hinten, das ferne nach vorn) geben die Halbmond-Silhouette, dazwischen
// eine Messingkrone.
// Flammenmähne: Feuerzungen wehen vom Helmrücken nach hinten oben.
// Im Grundbild deckend (gelber Kern, oranger Körper, rote Spitzen), dazu Glut.
function flameMane(p, g, hx, hy, P) {
  const n = 5;
  for (let f = 0; f < n; f++) {
    const rx = hx + 6 - f * 1.8, ry = hy + 2 + f * 1.7;
    const a = -1.95 - f * 0.22 - P.cape * 0.15;
    const L = (13 - Math.abs(f - 1.5) * 1.8 + Math.sin(P.capeT * 1.7 + f * 1.9) * 1.8) * (P.crown > 0.5 ? 0.4 : 1);
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
  }
}

function head(p, g, hx, hy, P, meta, gy) {
  const j = Math.round(P.jaw * 3);
  flameMane(p, g, hx, hy, P);
  // Fernes Horn (dunkler), schwingt nach vorn oben
  horn(p, g, hx + 9, hy + 3, hx + 21, hy + 1, hx + 19, hy - 11, 4.5, 1.2, [VOID, HORN[0], HORN[1], HORN[2], HORN[3]], true);
  // Nackenschutz (gestaffelt)
  for (let i = 0; i < 3; i++) { p.rect(hx - 1 + i, hy + 7 + i * 2, 6, 2, OBS[i === 0 ? 2 : 1]); p.rect(hx - 1 + i, hy + 7 + i * 2, 6, 1, OBS[3]); }
  // Helmkalotte
  p.ellipse(hx + 7, hy + 6, 7, 6.5, OBS[1]);
  p.ellipse(hx + 6.5, hy + 5.5, 6, 5.5, OBS[2]);
  p.ellipse(hx + 5.5, hy + 3.8, 4, 2.8, OBS[3]);
  p.px(hx + 4, hy + 2, SPEC); p.px(hx + 5, hy + 2, OBS[4]); p.px(hx + 6, hy + 2, OBS[4]);
  // Messingband um den Helm
  p.line(hx + 1, hy + 8, hx + 9, hy + 7, GOLD[2]); p.px(hx + 4, hy + 8, GOLD[4]);
  // Visier: Schädelgesicht, nach vorn gewölbt
  p.rect(hx + 9, hy + 4, 7, 7, OBS[2]);
  p.rect(hx + 15, hy + 6, 1, 4, OBS[1]);
  p.rect(hx + 10, hy + 8, 4, 2, OBS[3]); // Wangenplatte
  p.px(hx + 14, hy + 8, OBS[4]); p.px(hx + 16, hy + 7, OBS[2]); p.px(hx + 16, hy + 8, OBS[1]); // Nasengrat
  // Brauenwulst, schräg nach vorn abfallend (zorniger Blick)
  p.rect(hx + 8, hy + 3, 9, 2, OBS[3]); p.rect(hx + 9, hy + 3, 7, 1, OBS[4]); p.px(hx + 17, hy + 4, OBS[3]);
  p.px(hx + 8, hy + 2, OBS[3]);
  // Augenhöhlen und glühende Augen (schon im Grundbild hell)
  p.rect(hx + 10, hy + 5, 3, 2, VOID); p.rect(hx + 14, hy + 5, 2, 2, VOID);
  if (P.eye > 0.15) {
    const e = P.eye > 0.6 ? 2 : 1;
    p.px(hx + 11, hy + 5, EYE[e]); p.px(hx + 12, hy + 5, EYE[e - 1]); p.px(hx + 14, hy + 5, EYE[e]); p.px(hx + 15, hy + 5, EYE[0]);
    p.px(hx + 11, hy + 6, EYE[0]); p.px(hx + 14, hy + 6, EYE[0]);
    g.px(hx + 11, hy + 5, 4); g.px(hx + 12, hy + 5, 3); g.px(hx + 10, hy + 5, 2);
    g.px(hx + 14, hy + 5, 4); g.px(hx + 15, hy + 5, 3);
    if (P.eye > 0.7) { g.px(hx + 9, hy + 5, 1); g.px(hx + 11, hy + 6, 2); g.px(hx + 14, hy + 6, 2); }
    g.epx(hx + 9, hy + 4, 2); g.epx(hx + 8, hy + 4, 1);
  }
  meta.eye = { x: hx + 13, y: hy + 5 };
  // Wangennaht (Glut)
  p.line(hx + 7, hy + 7, hx + 9, hy + 10, MAG[3]); g.line(hx + 7, hy + 7, hx + 9, hy + 10, 2);
  bres(hx + 5, hy + 3, hx + 7, hy + 0, (x, y) => { p.px(x, y, MAG[2]); g.apx(x, y, 2); g.epx(x, y, 3); }); // Glutriss im Helm
  // Maul
  p.rect(hx + 9, hy + 10, 7, 1, OBS[1]);
  if (j) {
    p.rect(hx + 9, hy + 11, 7, j, VOID);
    const i = P.breath > 0.3 ? 3 : 1;
    g.rect(hx + 10, hy + 11, 6, j, i);
    if (P.breath > 0.3) g.rect(hx + 12, hy + 11, 4, Math.max(1, j - 1), 4);
    else if (P.jaw > 0.6) g.rect(hx + 12, hy + 11, 3, 1, 2);
  }
  // obere Reißzähne
  p.px(hx + 10, hy + 11, FANG[2]); p.px(hx + 13, hy + 11, FANG[2]); p.px(hx + 15, hy + 11, FANG[1]);
  // Unterkiefer mit Hauern
  const ly = hy + 11 + j;
  p.rect(hx + 7, ly, 9, 3, OBS[1]); p.rect(hx + 8, ly, 8, 1, OBS[3]); p.px(hx + 15, ly + 1, OBS[2]);
  p.px(hx + 11, ly - 1, FANG[1]); p.px(hx + 14, ly - 1, FANG[2]);
  p.px(hx + 16, ly - 1, FANG[1]); p.px(hx + 16, ly - 2, FANG[2]); // Hauer
  for (const [dx, h] of [[8, 2], [10, 3], [12, 3], [14, 2]]) p.line(hx + dx, ly + 3, hx + dx - 1, ly + 2 + h, dx === 12 ? OBS[2] : OBS[1]);
  meta.mouth = { x: hx + 16, y: hy + 11 + Math.floor(j / 2) };
  // Nahes Horn: mächtig, schwingt nach hinten und hoch
  horn(p, g, hx + 5, hy + 4, hx - 9, hy + 3, hx - 7, hy - 12, 6, 1.2, HORN, true);
  // Krone aus Messing zwischen den Hörnern
  if (P.crown < 0.02) crownAt(p, g, hx + 2, hy, 0);
  else {
    const cx = hx + 2 + P.crown * 12, cy = hy + (gy - 4 - hy) * Math.min(1, P.crown * P.crown);
    crownAt(p, g, cx, cy, P.crown);
  }
  meta.head = { x: hx + 8, y: hy - 4 };
}

function crownAt(p, g, x, y, fall) {
  const tilt = fall * 0.5;
  for (let i = 0; i < 12; i++) {
    const yy = y + Math.round(i * tilt);
    p.px(x + i, yy, GOLD[1]); p.px(x + i, yy - 1, i < 5 ? GOLD[4] : GOLD[3]);
  }
  const spikes = [[1, 3], [4, 5], [7, 6], [10, 4]];
  for (const [dx, h] of spikes) {
    const yy = y - 1 + Math.round(dx * tilt);
    for (let k = 1; k <= h; k++) p.px(x + dx + (k > h - 2 ? 1 : 0) * (dx > 6 ? 1 : 0), yy - k, k === h ? GOLD[4] : dx < 5 ? GOLD[3] : GOLD[2]);
    // glühende Zackenspitzen
    if (fall < 0.9) { const tx = x + dx + (dx > 6 ? 1 : 0); g.px(tx, yy - h, 3); g.px(tx, yy - h + 1, 1); g.epx(tx, yy - h - 1, 3); }
  }
  p.px(x + 7, y - 1 + Math.round(7 * tilt), MAG[2]);
  g.px(x + 7, y - 1 + Math.round(7 * tilt), fall > 0.9 ? 1 : 3);
  g.epx(x + 7, y - 2 + Math.round(7 * tilt), 2);
}

// Umhang: Rauchstoff, hinten lang, Saum brennt (Glut in der Leucht-Ebene).
function cape(p, g, tx, ty, gy, P) {
  const N = 22;
  const len0 = Math.min(46, gy - ty - 3) - P.kneel * 6;
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const sx = tx - 10 + i * 0.95;
    const top = ty + Math.abs(u - 0.45) * 4;
    const len = len0 - Math.abs(u - 0.4) * 10 + Math.sin(P.capeT + u * 4) * 2.5 + Math.sin(u * 23) * 1.5;
    let lx = sx;
    for (let j = 0; j < len; j++) {
      const v = j / len;
      const x = sx - P.cape * 18 * v * v - (1 - u) * 5 * v + Math.sin(P.capeT * 1.3 + v * 4 + i * 0.4) * 1.6 * v;
      let sh = u < 0.1 ? 3.3 : 2.9 - u * 2.2 - v * 0.6;
      const fold = Math.sin(u * Math.PI * 3 + v * 1.5 + P.capeT * 0.3);
      if (fold > 0.75) sh += 0.9; else if (fold < -0.8) sh -= 0.9;
      const shade = Math.max(0, Math.min(4, Math.round(sh)));
      let c = CAPE[u > 0.9 ? 0 : shade];
      if (v < 0.08 && shade > 1) c = CAPE[4];
      if (j > len - 4) c = j > len - 2 ? MAG[3] : j > len - 3 ? MAG[2] : MAG[1];
      p.px(x, top + j, c); p.px(x + 1, top + j, c);
      lx = x;
    }
    // brennender Saum: Flammenzungen steigen am Stoff hoch
    const by = top + len;
    const fl = 2 + Math.round((Math.sin(P.capeT * 2 + i * 1.7) * 0.5 + 0.5) * 3 + hash2(i, 7, 5) * 2);
    for (let k = 0; k < fl; k++) {
      const idx = k === 0 ? 3 : k < fl / 2 ? 2 : 1;
      g.px(lx + Math.sin(k * 0.8 + i) * 0.6, by - 1 - k, idx);
      g.epx(lx, by - 1 - k, idx + 1);
    }
    if (hash2(i, 9, 5) < 0.3) g.px(lx - 1, by - fl - 2 - (hash2(i, 3, 5) * 4 | 0), 2);
  }
  // Hoher Kragen hinter dem Kopf
  for (let i = 0; i < 10; i++) {
    const x = tx - 4 + i * 0.9, top = ty - 8 + Math.abs(i - 2) * 0.8;
    for (let y = top; y < ty + 3; y++) p.px(x, y, CAPE[i < 2 ? 4 : i < 5 ? 3 : 2]);
    g.epx(x, top, 2);
  }
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
  const { base, ga, gb, nr } = L;
  const solid = (x, y) => x >= 0 && y >= 0 && x < W && y < H && base[y * W + x] !== 0 && !nr[y * W + x];
  const out = base.slice();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!base[i] || nr[i]) continue;
    const up = !solid(x, y - 1), up2 = !solid(x, y - 2);
    const lf = !solid(x - 1, y), rt = !solid(x + 1, y);
    if (up) out[i] = lighten(base[i], 0.45, 240, 190, 140);
    else if (up2 && (lf || rt)) out[i] = lighten(base[i], 0.3, 240, 190, 140);
    else if (rt) out[i] = lighten(base[i], 0.3, 255, 150, 80);   // Gegenlicht der Glut
    else if (lf) out[i] = lighten(base[i], 0.2, 200, 200, 214);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (base[i] || ga[i] || gb[i] || y > BCLIP) continue;
    if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) out[i] = col(OUTLINE);
  }
  L.base = out;
}

function finish(L, fx, meta) {
  rimAndOutline(L);
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
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
  const baseC = toCanvas(L.base);
  const f = buildFrame(cw, ch, BAX - x0, BAY - y0, (pc) => pc.ctx.drawImage(baseC, 0, 0));
  f.glow = new GlowFrame(toCanvas(L.ga), BAX - x0, BAY - y0);
  f.glowEnraged = new GlowFrame(toCanvas(L.gb), BAX - x0, BAY - y0);
  f.meta = {};
  for (const k in meta) f.meta[k] = { dx: Math.round((meta[k].x - AX) * SC), dy: Math.round((meta[k].y - AY) * SC) };
  f.fx = fx ?? null;
  return f;
}

function frame(P, extra = {}) {
  const L = new Layers();
  const meta = drawIgnaroth(new Pen(L), new GlowPen(L), P, extra);
  return finish(L, extra.fx, meta);
}

function collapseFrame(k) {
  const L = new Layers();
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
