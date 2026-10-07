import { makeCanvas, flipCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame, Animation } from '../gfx/Sprite.js';
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

class Layers {
  constructor() {
    this.base = new Uint32Array(W * H);
    this.ga = new Uint32Array(W * H);
    this.gb = new Uint32Array(W * H);
  }
}

class Pen {
  constructor(L) { this.L = L; }
  px(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H || y > CLIP_Y) return;
    const i = y * W + x;
    this.L.base[i] = col(c); this.L.ga[i] = 0; this.L.gb[i] = 0;
  }
  rect(x, y, w, h, c) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
  }
  line(x0, y0, x1, y1, c) { bres(x0, y0, x1, y1, (x, y) => this.px(x, y, c)); }
  ellipse(cx, cy, rx, ry, c) { fillEllipse(cx, cy, rx, ry, (x, y) => this.px(x, y, c)); }
}

// px: beide Phasen, epx: nur Phase 2, apx: nur Phase 1
class GlowPen {
  constructor(L) { this.L = L; }
  set(buf, ramp, x, y, i) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H || y > CLIP_Y) return;
    buf[y * W + x] = ramp[Math.max(0, Math.min(4, Math.round(i)))];
  }
  px(x, y, i) { this.set(this.L.ga, GHc, x, y, i); this.set(this.L.gb, GHXc, x, y, i + 0.4); }
  epx(x, y, i) { this.set(this.L.gb, GHXc, x, y, i); }
  apx(x, y, i) { this.set(this.L.ga, GHc, x, y, i); }
  line(x0, y0, x1, y1, i) { bres(x0, y0, x1, y1, (x, y) => this.px(x, y, i)); }
  eline(x0, y0, x1, y1, i) { bres(x0, y0, x1, y1, (x, y) => this.epx(x, y, i)); }
  ellipse(cx, cy, rx, ry, i) { fillEllipse(cx, cy, rx, ry, (x, y) => this.px(x, y, i)); }
  eellipse(cx, cy, rx, ry, i) { fillEllipse(cx, cy, rx, ry, (x, y) => this.epx(x, y, i)); }
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
function bez(x0, y0, x1, y1, x2, y2, t) {
  const u = 1 - t;
  return [u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2];
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
      const hv = hash2(Math.round(u * 2), Math.round(v * 2) + 20, 41);
      if (e < 0.6 && Math.abs(v) >= 0.8 && hv < 0.1) c = hv < 0.03 ? VER[3] : VER[side > 0 ? 2 : 1];
      const [x, y] = at(u, v); p.px(x, y, c);
    }
  }
  // Hohlkehle: durchgehende Geisterlinie, Runen darin heller
  for (let u = B0 + 2; u <= L - 9; u += 0.5) {
    const [x, y] = at(u, 0);
    p.px(x, y, GH[1]);
    g.px(x, y, 1 + power * 0.6);
  }
  const runes = [16, 24, 32, 40];
  for (const u of runes) {
    const [x, y] = at(u, 0); const [x2, y2] = at(u + 1.5, 0); const [x3, y3] = at(u + 0.8, up * 0.9);
    p.px(x, y, GH[3]); p.px(x2, y2, GH[2]);
    g.px(x, y, 3 + power); g.px(x2, y2, 2 + power); g.px(x3, y3, 1);
    g.epx(x, y, 4);
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
function torso(p, g, along, P, meta) {
  for (let s = 0; s <= SPINE + 1; s += 0.5) {
    const t = s / SPINE;
    const sm = t * t * (3 - 2 * t);
    const hwB = (5 + 3.2 * sm) * Z;
    const hwF = (4.5 + 3.6 * sm + (t > 0.45 && t < 0.95 ? 1.6 * Math.sin((t - 0.45) / 0.5 * Math.PI) : 0)) * Z;
    for (let k = -hwB; k <= hwF; k += 0.5) {
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
      const [x, y] = along(s, k);
      const hv = hash2(Math.round(x), Math.round(y), 7);
      // Grünspan sammelt sich in den Vertiefungen und unten
      if (hv < 0.06 + (1 - t) * 0.12 && rel > 0.35 && i < 4) c = VER[Math.min(2, Math.max(0, i - 1))];
      if (t < 0.05) c = BRZ[1];
      p.px(x, y, c);
    }
  }
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
  }
  // Gürtel mit Bronzescheiben
  p.rect(hipX - 12, hipY - 4, 24, 4, LEATHER[1]); p.rect(hipX - 12, hipY - 4, 24, 1, LEATHER[3]); p.rect(hipX - 12, hipY - 1, 24, 1, LEATHER[0]);
  for (let x = hipX - 10; x < hipX + 12; x += 4) { p.px(x, hipY - 3, BRZ[5]); p.px(x + 1, hipY - 3, BRZ[3]); p.px(x, hipY - 2, BRZ[2]); p.px(x + 1, hipY - 2, BRZ[1]); }
  const bx = hipX + 4, by = hipY - 5;
  p.ellipse(bx, by + 2, 3.5, 3, BRZ[1]); p.ellipse(bx - 0.5, by + 1.5, 2.6, 2.2, BRZ[3]); p.px(bx - 1, by, BRZ[5]); p.px(bx - 2, by + 1, BRZ[5]);
  p.px(bx, by + 2, GH[2]); p.px(bx + 1, by + 2, GH[1]); g.px(bx, by + 2, 2); g.px(bx + 1, by + 2, 1);
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
}

function hand(p, x, y, back, open) {
  const s = back ? [VOID, SKIN[0], SKIN[1], SKIN[2]] : [SKIN[1], SKIN[2], SKIN[3], SKIN[4]];
  p.rect(x - 3, y - 2, 5, 5, s[1]); p.rect(x - 3, y - 2, 5, 1, s[3]); p.px(x + 1, y + 2, s[0]); p.px(x - 3, y + 2, s[0]);
  p.px(x - 1, y - 2, s[2]); p.line(x - 2, y, x + 1, y, s[0]);
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
}

// Kopf: ausgedörrter Schädel in Dreiviertelansicht, Blick nach rechts. Klare Formen statt
// Rauschen: heller Brauenwulst mit tiefem Schatten darunter, zwei Augenhöhlen mit
// Geisterlicht, Nasenrücken und Wangenknochen im Licht, eingefallene Wange, Zahnreihe.
// o = dunkle Kontur, 0–4 Haut (dunkel → hell), V Höhle, G/F Geisterauge (Kern/Rand), T/t Zähne.
// Gibt eine Funktion zurück, die den Bart zeichnet (kommt vor Brust und Schulter).
const FACE = [
  //            0123456789ABCD
  [0, '...o123321o...'],
  [1, '..o12333332o..'],
  [2, '.o1233333333o.'],
  [3, 'o123333333333o'],
  [4, 'o1233333333333'],
  [5, 'o1234444444444'],
  [6, 'o122000003400o'],
  [7, 'o12VVGFV024VGo'],
  [8, 'o12VFGVV124VFo'],
  [9, 'o122VVV024443o'],
  [10, 'o11234421ooo..'],
  [11, '.o11oTtTtTto..'],
  [12, '..o1oVVVVVo...'],
];
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
  // Haar: dünne Strähnen hinter dem Kopf
  for (let i = 0; i < 8; i++) {
    const x0 = hx + 1 + i * 0.6, y0 = hy + 3 + i * 0.5;
    const len = 14 + (hash2(i, 1, 13) * 7 | 0);
    let px0 = x0, py0 = y0;
    for (let k = 1; k <= len; k++) {
      const x = x0 - 1 - k * 0.4 - P.cape * k * 0.25 + Math.sin(t + k * 0.4 + i) * 0.5 * (k / len), y = y0 + k;
      const hc = BEARD[i % 3 === 0 ? 1 : i % 3 === 1 ? 2 : 3];
      p.line(px0, py0, x, y, hc); p.px(x + 1, y, i < 2 ? BEARD[1] : hc);
      px0 = x; py0 = y;
    }
  }
  const put = (rows, oy) => {
    for (const [y, s] of rows) for (let x = 0; x < s.length; x++) {
      const ch = s[x];
      if (ch === '.') continue;
      let c;
      if (ch >= '0' && ch <= '4') c = SKIN[+ch];
      else if (ch === 'o' || ch === 'V') c = VOID;
      else if (ch === 'T') c = ANT[4];
      else if (ch === 't') c = ANT[2];
      else if (ch === 'G') c = lit ? GH[4] : SKIN[1];
      else if (ch === 'F') c = lit ? GH[2] : VOID;
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
  const ly = hy + 14 + j;
  if (lit) {
    const e = P.eye;
    // Leuchthof um beide Höhlen (dunkel, damit der Kern hell heraussticht)
    for (let yy = 6; yy <= 9; yy++) for (let xx = 3; xx <= 13; xx++) if (Math.abs(yy - 7.5) + Math.abs(xx - (xx < 9 ? 5.5 : 12)) <= 2) g.px(hx + xx, hy + yy, 0.4 * e);
    // nahe Augenhöhle: heller Kern, Flammenkranz
    g.px(hx + 5, hy + 7, 3 + 1.5 * e); g.px(hx + 5, hy + 8, 2 + 1.2 * e); g.px(hx + 6, hy + 7, 2 + e); g.px(hx + 4, hy + 8, 1 + e);
    g.px(hx + 6, hy + 8, 1 + e); g.px(hx + 4, hy + 7, 0.5 + e);
    // ferne Augenhöhle
    g.px(hx + 12, hy + 7, 2.5 + 1.5 * e); g.px(hx + 12, hy + 8, 1.5 + e); g.px(hx + 11, hy + 7, 0.5 + e);
    // Geisterflamme züngelt aus der Höhle nach oben
    const fl = Math.round(1 + e * 1.5 + (Math.sin(t * 2.3) * 0.5 + 0.5) * 1.5);
    for (let k = 1; k <= fl; k++) g.px(hx + 4 - k * 0.5 + Math.sin(t * 3 + k) * 0.4, hy + 6 - k, k === 1 ? 3 : k < fl ? 2 : 1);
    // Phase 2: lange Flammenfahne nach hinten
    for (let k = 1; k <= 8; k++) {
      const x = hx + 4 - k * 1.2 - P.cape * k * 0.2, y = hy + 6 - k * 0.7 + Math.sin(t * 2 + k * 0.8) * 0.7;
      g.epx(x, y, k < 3 ? 4 : k < 6 ? 3 : 2);
      if (k < 5) g.epx(x, y + 1, 2);
    }
  }
  meta.eye = { x: hx + 5, y: hy + 7 };
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
  // Bart: lange, zerzauste Strähnen vom Kinn, fällt über die Brust
  return () => {
    for (let i = 0; i < 11; i++) {
      const x0 = hx + 3 + i * 0.75, y0 = ly - 1 + Math.abs(i - 5) * 0.25;
      const len = 15 + (hash2(i, 7, 13) * 6 | 0) - Math.abs(i - 5) * 1.3;
      let px0 = x0, py0 = y0;
      for (let k = 1; k <= len; k++) {
        const x = x0 - k * 0.2 - P.beard * k * 0.35 + Math.sin(t * 1.3 + k * 0.5 + i * 0.7) * 0.45 * (k / len), y = y0 + k;
        const c = i >= 9 ? BEARD[1] : i > 6 ? BEARD[k < 4 ? 3 : 2] : i < 2 ? BEARD[2] : BEARD[k < 4 ? 4 : 3];
        p.line(px0, py0, x, y, k > len - 2 ? BEARD[1] : (i % 3 === 1 && k > 3 ? BEARD[2] : c));
        px0 = x; py0 = y;
      }
    }
    // Bartspange aus Bronze
    const cy = ly + 4;
    p.rect(hx + 5, cy, 3, 2, BRZ[3]); p.px(hx + 5, cy, BRZ[5]); p.px(hx + 7, cy + 1, BRZ[1]);
  };
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
  }
  // Zacken (3 px hoch, links hell, rechts Schatten)
  for (const dx of [1, 5, 9, 12]) {
    const by = y - 2 + Math.round(dx * tilt) + (dx < 3 ? -1 : 0);
    const h = dx === 5 || dx === 9 ? 3 : 2;
    for (let k = 1; k <= h; k++) { p.px(x + dx, by - k, k === h ? GOLD[4] : GOLD[3]); p.px(x + dx + 1, by - k + 1, GOLD[1]); }
    p.px(x + dx - 1, by, GOLD[0]);
  }
  const gx = x + 9, gyy = y + Math.round(9 * tilt);
  p.px(gx, gyy, GH[3]); p.px(gx, gyy - 1, GH[4]); p.px(gx + 1, gyy, GH[2]);
  g.px(gx, gyy, fall > 0.9 ? 1 : 3); g.px(gx, gyy - 1, fall > 0.9 ? 1 : 4); g.px(gx + 1, gyy, fall > 0.9 ? 0 : 2); g.epx(gx, gyy - 2, 3);
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
  const tines = front ? [[0.3, 7, -2.3], [0.56, 7, -2.0], [0.8, 5, -1.25]] : [[0.36, 6, -0.95], [0.64, 6, -1.25], [0.86, 4, -1.9]];
  for (const [tt, len, a] of tines) {
    const [bx, by] = bez(...beam, tt);
    const ex = bx + Math.cos(a) * len, ey = by + Math.sin(a) * len;
    limb(p, bx, by, ex, ey, 2, 1.2, R);
    p.px(ex, ey, R[3]);
    if (front) {
      g.apx(ex, ey, 0);
      const fl = 2 + Math.round((Math.sin(P.capeT * 2 + tt * 9) * 0.5 + 0.5) * 2);
      for (let k = 1; k <= fl; k++) g.epx(ex - k * 0.3, ey - k, k === 1 ? 4 : k < fl ? 3 : 1);
    } else g.epx(ex, ey - 1, 2);
  }
  const [tx, ty] = bez(...beam, 1);
  p.px(tx, ty, R[3]);
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
      if (hemD <= 1) c = CAPE_HEM[2];
      else if (hemD <= 3 && v > 0.6) c = CAPE_HEM[1];
      else if (hemD <= 6 && v > 0.6) c = sh > 1.8 ? CAPE_HEM[1] : CAPE_HEM[0];
      p.px(x, top + j, c);
      if (i < N - 1) p.px(x + 1, top + j, c);   // keine Lücken zwischen den Bahnen
      lx = x;
    }
    // Geisterschimmer am Saum
    const by = top + len;
    g.apx(lx, by - 1, 1); if (i % 2 === 0) g.apx(lx, by - 2, 0);
    g.epx(lx, by - 1, 2);
    if (i % 3 === 0) {
      const fl = 1 + Math.round((Math.sin(P.capeT * 2 + i * 1.7) * 0.5 + 0.5) * 3 + hash2(i, 7, 5) * 2);
      for (let k = 0; k < fl; k++) g.epx(lx + Math.sin(k * 0.8 + i) * 0.6, by - 1 - k, k === 0 ? 3 : k < fl / 2 ? 2 : 1);
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
  const { base, ga, gb } = L;
  const out = base.slice();
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    const v = base[i];
    if (!v) continue;
    const up = !base[i - W], left = !base[i - 1], right = !base[i + 1];
    if (!(up || left)) continue;
    const r = v & 255, gg = (v >> 8) & 255, b = (v >> 16) & 255;
    const lum = (r * 0.3 + gg * 0.55 + b * 0.15);
    const k = up && left ? 0.5 : up ? 0.38 : 0.3;
    const kk = lum > 150 ? k * 0.4 : k;
    const nr = Math.round(r + (RIM[0] - r) * kk), ng = Math.round(gg + (RIM[1] - gg) * kk), nb = Math.round(b + (RIM[2] - b) * kk);
    out[i] = ((255 << 24) | (nb << 16) | (ng << 8) | nr) >>> 0;
    // Geisterschimmer: Rückenkante (links), nur wo kein eigenes Glühen liegt
    if (left && x < AX + 4 && !base[i - 2] && base[i + 1] && base[i + 2] && !ga[i]) { ga[i] = GHc[0]; gb[i] = GHXc[0]; }
  }
  L.base = out;
}

function finish(L, fx, meta, rim = true) {
  if (rim) rimLight(L); // dunkle Kontur setzt buildFrame
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
  const f = buildFrame(cw, ch, AX - x0, AY - y0, (pc) => pc.ctx.drawImage(baseC, 0, 0));
  f.glow = new GlowFrame(toCanvas(L.ga), AX - x0, AY - y0);
  f.glowEnraged = new GlowFrame(toCanvas(L.gb), AX - x0, AY - y0);
  f.meta = {};
  for (const k in meta) f.meta[k] = { dx: Math.round(meta[k].x - AX), dy: Math.round(meta[k].y - AY) };
  f.fx = fx ?? null;
  return f;
}

function frame(P, extra = {}) {
  const L = new Layers();
  const meta = drawUlgrim(new Pen(L), new GlowPen(L), P, extra);
  return finish(L, extra.fx, meta);
}

// Zerfall zu Staub: der kniende Körper löst sich von oben nach unten auf,
// Staub steigt auf, zurück bleiben Rüstung, Schwert und Krone.
function dissolveFrame(P, k) {
  const Lb = new Layers();
  drawUlgrim(new Pen(Lb), new GlowPen(Lb), P, {});
  rimLight(Lb);
  const L = new Layers();
  const pile = Math.min(1, k * 1.6);
  if (pile > 0.05) drawPile(new Pen(L), new GlowPen(L), k);
  const top = 95;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const v = Lb.base[i];
    if (!v && !Lb.ga[i]) continue;
    const h = Math.max(0, Math.min(1, (AY - y) / top));
    const thr = (1 - h) * 0.72 + hash2(x, y, 51) * 0.28;
    if (k < thr) {
      // noch da; knapp vor der Zerfallskante hell glimmend
      if (v) L.base[i] = v;
      L.ga[i] = Lb.ga[i]; L.gb[i] = Lb.gb[i];
      if (k > thr - 0.07 && v) { L.ga[i] = GHc[hash2(x, y, 5) < 0.5 ? 1 : 2]; L.gb[i] = GHXc[2]; }
    } else if (v && k - thr < 0.3 && hash2(x, y, 52) < 0.35) {
      // Staubkorn steigt auf und treibt nach hinten
      const age = (k - thr) / 0.3;
      const nx = Math.round(x - age * (4 + hash2(x, y, 53) * 10)), ny = Math.round(y - age * (8 + hash2(x, y, 54) * 16));
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      const c = age < 0.4 ? '#a89c86' : age < 0.7 ? '#6e665a' : '#48443e';
      if (!L.base[j]) L.base[j] = col(c);
      if (hash2(x, y, 55) < 0.4) { L.ga[j] = GHc[age < 0.5 ? 2 : 1]; L.gb[j] = GHXc[age < 0.5 ? 3 : 1]; }
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
