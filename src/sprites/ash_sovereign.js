import { PAL } from '../gfx/Palette.js';
import { makeCanvas, flipCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame, Animation } from '../gfx/Sprite.js';
import { hash2 } from '../core/math.js';

// Malgareth, der Aschenfürst – Endboss des Aschethrons (Stufe 40).
//
// Hochgewachsener gefallener König aus Asche und Obsidian: aschgraue Haut mit
// glühenden Rissen, Obsidian-Kürass mit Goldbesatz, Wappenrock, gesprengte
// Kette am Handgelenk, langes aschweißes Haar, Krone aus Gold mit Glutflammen,
// schwebender Umhang aus Rauch und ein großes Flammberg-Schwert.
//
// Rig mit Zwei-Gelenk-IK (Arme, Beine), Schlüsselposen mit weicher Interpolation.
// Drei Gestalten (form), jede Animation gibt es je Gestalt:
//   1  steht am Boden, Glut gedämpft
//   2  schwebt (hover), Flügel aus Rauch mit Glutrippen, Umhang zieht als Rauch nach unten
//   3  volle Gestalt: Flammenflügel, Risse weißglühend, Kronenflammen lodern
// Namen: '<anim>' (Gestalt 1), '<anim>_2', '<anim>_3'. Dazu Einzelanimationen:
//   dormant, awaken (1), ascend (1→2), unleash (2→3), channelUp/channel (3), death (3).
// Leucht-Ebene frame.glow (additiv, ohne Umriss). Randlicht: Oberkanten kühl,
// Vorder-/Unterkanten glutrot, damit die dunkle Figur auf dunklem Boden steht.
// Blickrichtung rechts, Anker = Mitte zwischen den Füßen (am Boden, auch wenn er schwebt).
// Animationen werden erst beim ersten Zugriff gebaut (Getter), der Boss wärmt sie vor.
const W = 260, H = 196, AX = 124, AY = 184;

const OBS = ['#0e0c14', '#1e1a28', '#302a3c', '#484058', '#6a5e80'];
const SPEC = '#b0a4c8';
const ASH = ['#1c1818', '#2e2828', '#48403e', '#665c56', '#8a8078', '#b4aca2'];
const HAIR = ['#2a2624', '#4a4440', '#78706a', '#aaa298', '#d4ccc2'];
const GOLD = PAL.gold;
const ROBE = ['#16060a', '#2a0c12', '#42121a', '#5e1a22', '#7c2a2a'];
const SMOKE = ['#0e0b10', '#1a151c', '#28212a', '#382e38', '#4a3e48'];
const MAG = ['#2a0804', '#5a1206', '#8e2408', '#c8420c'];
const LEATHER = PAL.leather;
const IRON = ['#141218', '#26222c', '#3c3644', '#5c5466'];
const VOID = '#07040a';
const ASHDUST = ['#3a3430', '#5a524c', '#8a8279', '#b8b0a4', '#d8d0c4'];
// Leucht-Rampen (dunkel -> hell)
const EMB = ['#5a1406', '#a8300a', '#f0661a', '#ffb048', '#fff0c0'];
const INF = ['#8a2a08', '#ff6a14', '#ffc048', '#fff4c8', '#ffffff'];

const THIGH = 16, SHIN = 16, SPINE = 24, UPPER = 13, FORE = 13;

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

class Layers {
  constructor() { this.base = new Uint32Array(W * H); this.glow = new Uint8Array(W * H); }
}

// Grundbild: deckt darunter liegendes Glühen ab. clip = unterste erlaubte Zeile.
class Pen {
  constructor(L) { this.L = L; this.clip = AY; }
  px(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H || y > this.clip) return;
    const i = y * W + x;
    this.L.base[i] = col(c); this.L.glow[i] = 0;
  }
  rect(x, y, w, h, c) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
  }
  line(x0, y0, x1, y1, c) { bres(x0, y0, x1, y1, (x, y) => this.px(x, y, c)); }
  ellipse(cx, cy, rx, ry, c) { fillEllipse(cx, cy, rx, ry, (x, y) => this.px(x, y, c)); }
}

// Leucht-Ebene: Index 0 (dunkle Glut) … 4 (weiß). px überschreibt, max nur heller.
class GlowPen {
  constructor(L) { this.L = L; this.clip = AY; }
  px(x, y, i) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H || y > this.clip || i < 0) return;
    this.L.glow[y * W + x] = Math.min(4, Math.round(i)) + 1;
  }
  max(x, y, i) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H || y > this.clip || i < 0) return;
    const k = y * W + x, v = Math.min(4, Math.round(i)) + 1;
    if (this.L.glow[k] < v) this.L.glow[k] = v;
  }
  line(x0, y0, x1, y1, i) { bres(x0, y0, x1, y1, (x, y) => this.max(x, y, i)); }
  ellipse(cx, cy, rx, ry, i) { fillEllipse(cx, cy, rx, ry, (x, y) => this.max(x, y, i)); }
}

function bres(x0, y0, x1, y1, f) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let n = 0; n < 500; n++) {
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
  hipX: 0, hipY: 0, lean: 0.04, head: 0, headY: 0, nod: 0, jaw: 0,
  fFx: 7, fFy: 0, fBx: -7, fBy: 0,
  hFx: 9, hFy: 21, hBx: -7, hBy: 21,
  sw: 1.18, grip: 0, cape: 0.25, capeT: 0, cast: 0, eye: 1, core: 1, kneel: 0,
  hover: 0, wing: 0, wingT: 0, wingFire: 0, crack: 0, inferno: 0, crownF: 0, flame: 0,
  ash: 0, crownDrop: 0, robe: 0, spread: 0, hair: 0, noSword: 0,
};
// Gestalt-Grundwerte (werden auf die Pose addiert)
const FORMS = {
  1: { hover: 0, wing: 0, wingFire: 0, crack: 0.25, inferno: 0, crownF: 0.55, flame: 0.55 },
  2: { hover: 10, wing: 0.72, wingFire: 0.25, crack: 0.6, inferno: 0, crownF: 0.9, flame: 0.85 },
  3: { hover: 13, wing: 1, wingFire: 1, crack: 1, inferno: 1, crownF: 1.35, flame: 1.25 },
};
const pose = (o = {}) => ({ ...REST, ...o });
const ease = (t) => t * t * (3 - 2 * t);
const linear = (t) => t;
const snap = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
const slow = (t) => t * t * t;
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

// Dickes Glied, Licht von links oben (4 Stufen der Rampe).
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

// Glühender Riss entlang eines Zickzacks (Punkte), Helligkeit nach crack
function crackLine(g, pts, P, base = 1) {
  const i = base + (P.crack > 0.55 ? 1 : 0) + (P.crack > 0.9 ? 1 : 0);
  for (let k = 0; k < pts.length - 1; k++) g.line(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], k === 0 ? i : i - 1);
}

// ---------------------------------------------------------------- Flammberg

// Schwert entlang Winkel a vom Griffpunkt (hx, hy). u = entlang, v = quer.
function sword(p, g, hx, hy, a, P) {
  const dx = Math.cos(a), dy = Math.sin(a);
  const nx = -dy, ny = dx;
  const at = (u, v) => [hx + dx * u + nx * v, hy + dy * u + ny * v];
  const up = ny < 0 ? 1 : -1; // welche v-Seite nach oben zeigt
  // Griff: Lederwicklung, Goldringe
  for (let u = -7; u <= 2; u += 0.5) {
    for (let v = -1; v <= 1; v += 0.5) {
      const lit = v * up > 0.4 ? 3 : v * up < -0.4 ? 0 : 1;
      let c = LEATHER[[0, 1, 2, 3][lit]];
      if (Math.round(u * 2) % 3 === 0) c = LEATHER[0];
      if (u < -6 || u > 1) c = GOLD[[1, 2, 2, 4][lit]];
      const [x, y] = at(u, v); p.px(x, y, c);
    }
  }
  // Knauf mit Glutstein
  for (let u = -10.5; u <= -7; u += 0.5) for (let v = -2; v <= 2; v += 0.5) {
    if (Math.hypot(u + 8.8, v) > 2.1) continue;
    const [x, y] = at(u, v); p.px(x, y, v * up > 0.5 ? GOLD[4] : v * up < -0.8 ? GOLD[1] : GOLD[2]);
  }
  { const [x, y] = at(-8.8, 0); p.px(x, y, MAG[3]); g.max(x, y, 3); }
  // Parierstange: geschwungen, Enden zur Klinge hin gebogen, Glutstein in der Mitte
  for (let v = -7; v <= 7; v += 0.5) {
    const bend = Math.abs(v) > 3 ? (Math.abs(v) - 3) * 0.45 : 0;
    for (let w = 0; w <= 1.5; w += 0.5) {
      const [x, y] = at(3 + w + bend, v);
      p.px(x, y, w < 0.6 ? (v * up > 0 ? GOLD[4] : GOLD[3]) : GOLD[1]);
    }
    if (Math.abs(v) > 6.4) { const [x, y] = at(4.8 + bend, v); p.px(x, y, GOLD[4]); }
  }
  { const [x, y] = at(4, 0); p.px(x, y, MAG[3]); g.max(x, y, 4); const [x2, y2] = at(4, up); g.max(x2, y2, 2); }
  // Klinge: gewellt (Flammberg), Obsidian mit glutflüssigen Schneiden
  const L = 44;
  const hwAt = (u) => {
    const t = (u - 5) / (L - 5);
    const taper = t < 0.82 ? 2.6 - t * 0.9 : (1 - t) / 0.18 * 1.85;
    return Math.max(0.4, taper + 0.55 * Math.sin(u * 0.62) * (t < 0.85 ? 1 : 0));
  };
  const heat = P.flame;
  for (let u = 5; u <= L; u += 0.5) {
    const hw = hwAt(u), wob = 0.35 * Math.sin(u * 0.62);
    for (let v = -hw; v <= hw; v += 0.5) {
      const [x, y] = at(u, v + wob);
      const edge = hw - Math.abs(v);
      let c;
      if (edge < 0.6) c = MAG[3];
      else if (edge < 1.1) c = v * up > 0 ? OBS[4] : MAG[2];
      else c = Math.abs(v) < 0.4 ? OBS[1] : v * up > 0 ? OBS[3] : OBS[2];
      p.px(x, y, c);
      if (edge < 0.6) g.max(x, y, heat > 0.8 ? 3 : 2);
      else if (edge < 1.1 && heat > 0.5) g.max(x, y, 1);
    }
    // Glutrunen in der Hohlkehle
    if (u > 9 && u < L - 8 && Math.round(u * 2) % 7 === 0) { const [x, y] = at(u, wob); g.max(x, y, heat > 0.9 ? 3 : 2); }
  }
  // Flammen züngeln an der Oberseite der Klinge empor (nur Leucht-Ebene)
  const seed = Math.round(P.capeT * 3.7 + a * 5);
  for (let u = 8; u <= L - 1; u += 1) {
    const hw = hwAt(u);
    const [bx, by] = at(u, (hw + 0.5) * up);
    const hgt = heat * (1.5 + hash2(Math.round(u), seed, 41) * 4.5) * (u > L - 6 ? 0.6 : 1);
    for (let k = 0; k < hgt; k++) {
      const i = k < hgt * 0.3 ? 3 : k < hgt * 0.65 ? 2 : 1;
      g.max(bx + Math.sin(k * 0.9 + u) * 0.5, by - k, i);
    }
  }
  const [tx, ty] = at(L, 0);
  const [mx, my] = at(L * 0.6, 0);
  return { tipX: tx, tipY: ty, midX: mx, midY: my };
}

// Feuriger Schwung-Schleier (goldgelb innen, glutrot außen) um einen Drehpunkt.
function smear(p, g, cx, cy, a0, a1, r0, r1) {
  if (Math.abs(a1 - a0) > 1.7) a0 = a1 - Math.sign(a1 - a0) * 1.7;
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
    // geschlossene Sichel: außen voll, nach innen dünner und je älter desto schmaler
    const inner = 1 - fresh * 0.75;
    if (radial < inner * 0.9) { if (hash2(x + 99, y + 99, 23) > 0.12 * fresh) continue; }
    else if (radial < inner && hash2(x + 99, y + 99, 23) > 0.5) continue;
    if (fresh < 0.12 && hash2(x, y, 24) > fresh * 6) continue;
    const c = radial > 0.9 ? '#fff0c0' : radial > 0.78 ? '#ffb048' : radial > inner + 0.1 ? '#e0501a' : '#7a200c';
    p.px(cx + x, cy + y, c);
    if (fresh > 0.3 && radial > 0.45) g.max(cx + x, cy + y, radial > 0.9 ? 4 : radial > 0.74 ? 3 : fresh > 0.7 ? 2 : 1);
  }
}

// ---------------------------------------------------------------- Figur

function drawFigure(p, g, P, ex = {}) {
  const hov = P.hover > 0.05 ? P.hover + Math.sin(P.capeT) * 1.2 : 0;
  const gy = AY - Math.round(hov);
  const lean = P.lean, sL = Math.sin(lean), cL = Math.cos(lean);
  const hipX = AX + P.hipX, hipY = gy - 31 + P.hipY + P.kneel * 11;
  const chX = hipX + sL * SPINE, chY = hipY - cL * SPINE;
  const perpX = cL, perpY = sL;
  const along = (s, k) => [hipX + sL * s + perpX * k, hipY - cL * s + perpY * k];
  const meta = {};
  const dang = Math.min(1, hov / 8);

  // Beine: im Schweben hängen die Füße locker, Zehen nach unten
  const fF = { x: AX + P.fFx + (P.fFx * -0.55 + 3) * dang, y: gy - P.fFy - dang * 3 };
  const fB = { x: AX + P.fBx + (P.fBx * -0.4 - 4) * dang, y: gy - P.fBy - dang * 1 };
  const legF = ik(hipX + 3, hipY, fF.x, fF.y, THIGH, SHIN, -1);
  const legB = ik(hipX - 3, hipY, fB.x, fB.y, THIGH, SHIN, -1);
  if (P.kneel > 0.01) {
    const kx = hipX - 5 - P.kneel * 3, ky = gy - 2;
    legB.jx += (kx - legB.jx) * P.kneel; legB.jy += (ky - legB.jy) * P.kneel;
    legB.ex += (kx - 13 - legB.ex) * P.kneel; legB.ey += (gy - legB.ey) * P.kneel;
  }

  // Schultern, Hände
  const shF = { x: chX + perpX * 2.5, y: chY + perpY * 2.5 + 2 };
  const shB = { x: chX - perpX * 3.5, y: chY - perpY * 3.5 + 1 };
  const hF = { x: chX + P.hFx, y: chY + P.hFy };
  const hB = P.grip > 0.5
    ? { x: hF.x - Math.cos(P.sw) * 5, y: hF.y - Math.sin(P.sw) * 5 }
    : { x: chX + P.hBx, y: chY + P.hBy };
  const armF = ik(shF.x, shF.y, hF.x, hF.y, UPPER, FORE, 1);
  const armB = ik(shB.x, shB.y, hB.x, hB.y, UPPER, FORE, 1);

  // Kopf
  const neckX = chX + sL * 3, neckY = chY - cL * 3;
  const hx = Math.round(neckX - 5 + P.head), hy = Math.round(neckY - 13 + P.headY);

  // --- 0. Flügel (hinter allem)
  if (P.wing > 0.03) wings(p, g, chX - perpX * 3, chY + 2, P);
  // --- 1. Umhang aus Rauch (schwebt)
  cape(p, g, chX - perpX * 4, chY, gy, P);

  // --- 3. hinteres Bein, hinterer Arm
  const darkO = [VOID, OBS[0], OBS[1], OBS[2]];
  const litO = [OBS[1], OBS[2], OBS[3], OBS[4]];
  const darkA = [VOID, ASH[0], ASH[1], ASH[2]];
  const litA = [ASH[1], ASH[2], ASH[3], ASH[4]];
  skirtBack(p, g, hipX, hipY, gy, P);
  leg(p, g, hipX - 3, hipY, legB, darkO, true, P, dang);
  limb(p, shB.x, shB.y, armB.jx, armB.jy, 4.5, 4, darkA);
  limb(p, armB.jx, armB.jy, armB.ex, armB.ey, 4.5, 4, darkA);
  crackLine(g, [[armB.jx, armB.jy], [(armB.jx + armB.ex) / 2 - 1, (armB.jy + armB.ey) / 2], [armB.ex, armB.ey - 1]], P, 0);
  bracer(p, g, armB, true);
  if (P.grip <= 0.5) chain(p, g, armB.ex, armB.ey, P, true);
  claw(p, g, armB.ex, armB.ey, darkO, P.cast > 0.3 || P.spread > 0.4);
  meta.cast = { x: armB.ex + (P.cast > 0.3 ? 0 : 0), y: armB.ey - 5 };
  pauldron(p, g, shB.x - 1, shB.y - 1, 4.5, 3.5, darkO, false);

  if (ex.swordBehind && P.noSword < 0.5) {
    const t = sword(p, g, hF.x, hF.y, P.sw, P);
    meta.tip = { x: t.tipX, y: t.tipY }; meta.blade = { x: t.midX, y: t.midY };
  }

  // --- 4. Rumpf
  torso(p, g, along, P, meta);
  hairBack(p, g, hx, hy, P);
  // --- 5. vorderes Bein, Gürtel, Wappenrock
  leg(p, g, hipX + 3, hipY, legF, litO, false, P, dang);
  belt(p, g, hipX, hipY, gy, P, legF, legB, dang);

  // --- 6. Halsberge, Kopf, Krone
  p.ellipse(neckX, neckY + 1, 5.5, 3.5, OBS[1]); p.ellipse(neckX - 0.5, neckY, 4.5, 2.2, OBS[2]);
  p.line(neckX - 4, neckY - 2, neckX + 4, neckY - 2, GOLD[3]); p.line(neckX - 5, neckY - 1, neckX + 5, neckY - 1, GOLD[1]);
  p.px(neckX - 3, neckY - 2, GOLD[4]);
  p.rect(neckX - 1, neckY - 5, 4, 3, ASH[2]); p.px(neckX - 1, neckY - 5, ASH[3]);
  g.max(neckX + 1, neckY - 4, P.crack > 0.5 ? 2 : 1);
  head(p, g, hx, hy, P, meta, gy);

  // --- 7. Schwung-Schleier
  if (ex.smear) smear(p, g, shF.x, shF.y, ex.smear[0], ex.smear[1], 26, 62);

  // --- 8. vorderer Arm mit Schwert
  const drawArm = () => {
    limb(p, shF.x, shF.y, armF.jx, armF.jy, 5, 4.5, litA);
    limb(p, armF.jx, armF.jy, armF.ex, armF.ey, 5, 4.5, litA);
    crackLine(g, [[shF.x + 1, shF.y + 3], [armF.jx - 1, armF.jy - 1], [armF.jx + 1, armF.jy + 2]], P, 1);
    crackLine(g, [[armF.jx, armF.jy + 1], [(armF.jx + armF.ex) / 2 + 1, (armF.jy + armF.ey) / 2], [armF.ex - 1, armF.ey - 2]], P, 1);
    p.ellipse(armF.jx, armF.jy, 2.2, 2.2, ASH[3]); p.px(armF.jx - 1, armF.jy - 1, ASH[4]);
    bracer(p, g, armF, false);
  };
  drawArm();
  if (!ex.swordBehind && P.noSword < 0.5) {
    const t = sword(p, g, hF.x, hF.y, P.sw, P);
    meta.tip = { x: t.tipX, y: t.tipY }; meta.blade = { x: t.midX, y: t.midY };
  }
  if (P.noSword >= 0.5) { meta.tip = { x: hF.x, y: hF.y }; meta.blade = { x: hF.x, y: hF.y }; }
  claw(p, g, hF.x, hF.y, litO, false, true);
  if (P.grip > 0.5) claw(p, g, hB.x, hB.y, litO, false, true);
  pauldron(p, g, shF.x + 0.5, shF.y - 2, 6.5, 5, litO, true);
  meta.hand = { x: hF.x, y: hF.y };

  // Glut in der Zauberhand
  if (P.cast > 0.05) {
    const r = 1.2 + P.cast * 3.2, { x, y } = meta.cast;
    g.ellipse(x, y, r + 1.5, r + 1.5, 0);
    g.ellipse(x, y, r + 0.5, r + 0.5, 1);
    g.ellipse(x, y - 0.5, r - 0.5, r - 0.5, 2);
    g.ellipse(x, y - 1, Math.max(0.6, r - 1.6), Math.max(0.6, r - 1.6), 3);
    g.max(x, y - 1, 4);
    for (let i = 0; i < 5; i++) {
      const fx = x - r + hash2(i, Math.round(P.capeT * 3), 3) * r * 2;
      g.line(fx, y - r, fx + (hash2(i, 2, 3) - 0.5) * 2, y - r - 2 - hash2(i, Math.round(P.capeT * 2), 5) * 4, 2);
    }
  }
  // Rauchschleier unter dem Schwebenden
  if (dang > 0.05) smokeTrail(p, g, hipX, gy, P, dang);
  meta.ground = { x: AX, y: AY };
  return meta;
}

// Rumpf: Obsidian-Kürass mit Goldbesatz, glühender Riss über der Brust
function torso(p, g, along, P, meta) {
  for (let s = 0; s <= SPINE + 1; s += 0.5) {
    const t = s / SPINE;
    const sm = t * t * (3 - 2 * t);
    const hwB = 4.5 + 3.5 * sm;
    const hwF = 4 + 4.5 * sm + (t > 0.45 && t < 0.95 ? 1.6 * Math.sin((t - 0.45) / 0.5 * Math.PI) : 0);
    const rim = (t > 0.36 && t < 0.4);
    for (let k = -hwB; k <= hwF; k += 0.5) {
      const rel = (k + hwB) / (hwB + hwF);
      let i = rel < 0.12 ? 3 : rel < 0.4 ? 2 : rel < 0.82 ? 1 : 0;
      if (t > 0.45 && Math.abs(k - hwF * 0.25) < 0.5) i = Math.min(4, i + 1); // Brustgrat
      const [x, y] = along(s, k);
      if (rim) p.px(x, y, rel < 0.3 ? GOLD[3] : rel < 0.8 ? GOLD[2] : GOLD[1]);
      else if (t < 0.36 && rel > 0.1 && rel < 0.9 && (Math.round(s * 2) % 6 === 0)) p.px(x, y, OBS[0]); // Schuppen
      else p.px(x, y, OBS[i]);
    }
  }
  // Goldbesatz am Halsausschnitt
  for (let k = -5; k <= 6; k += 0.5) {
    const [x, y] = along(SPINE - 0.5 - Math.abs(k - 0.5) * 0.35, k);
    p.px(x, y, k < -2 ? GOLD[4] : k < 3 ? GOLD[3] : GOLD[2]);
  }
  // Glanzpunkte (Licht von links oben)
  { const [x, y] = along(SPINE - 3, -6); p.px(x, y, SPEC); p.px(x + 1, y, OBS[4]); }
  { const [x, y] = along(SPINE * 0.55, -3.5); p.px(x, y, OBS[4]); }
  // Kronen-Wappen auf der Brust (Gold), darunter ein Glutriss mit Herz
  const [cx, cy] = along(SPINE * 0.7, 1);
  p.rect(cx - 2, cy - 1, 5, 1, GOLD[2]); p.px(cx - 2, cy - 2, GOLD[3]); p.px(cx, cy - 3, GOLD[4]); p.px(cx + 2, cy - 2, GOLD[3]);
  p.px(cx, cy - 2, GOLD[3]);
  const [kx, ky] = along(SPINE * 0.5, 0.5);
  const r = 1.2 + P.core * 0.6;
  p.ellipse(kx, ky, r + 0.8, r + 0.4, OBS[0]);
  p.ellipse(kx, ky, r, r * 0.8, MAG[1]);
  g.ellipse(kx, ky, r + 0.3, r, 1);
  g.ellipse(kx, ky, Math.max(0.5, r - 0.6), Math.max(0.5, r - 0.8), 2 + (P.crack > 0.55 ? 1 : 0));
  g.max(kx, ky, P.core > 1.4 || P.crack > 0.9 ? 4 : 3);
  meta.chest = { x: kx, y: ky };
  // Risse vom Herz durch den Panzer
  const cracks = [
    [[0.5, 0.5], [0.58, -2.5], [0.66, -3], [0.78, -6]],
    [[0.5, 0.5], [0.42, 3], [0.3, 2], [0.2, 4.5]],
    [[0.5, 0.5], [0.62, 3.5], [0.74, 5.5]],
    [[0.5, 0.5], [0.38, -2.5], [0.28, -4]],
  ];
  cracks.forEach((c, n) => {
    if (n > 1 && P.crack < 0.5) return;
    const pts = c.map(([s, k]) => along(s * SPINE, k));
    for (let i = 0; i < pts.length - 1; i++) {
      p.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], MAG[1]);
      g.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], (i === 0 ? 2 : 1) + (P.crack > 0.9 ? 1 : 0));
    }
  });
}

// Hinterer Rock: lange Obsidianschöße, hinter den Beinen
function skirtBack(p, g, hipX, hipY, gy, P) {
  const len = Math.min(22, gy - hipY - 6);
  for (let i = 0; i < 9; i++) {
    const x0 = hipX - 8 + i;
    const L = len - Math.abs(i - 2) * 0.8 + (hash2(i, 3, 7) * 2 | 0);
    for (let j = 0; j < L; j++) {
      const v = j / L;
      const x = x0 - v * v * (3 + P.cape * 6) + Math.sin(P.capeT + i * 0.7 + v * 3) * 0.8 * v;
      p.px(x, hipY + j, j > L - 2 ? GOLD[1] : i < 2 ? ROBE[2] : ROBE[i % 3 === 0 ? 0 : 1]);
    }
  }
}

function leg(p, g, hx, hy, L, ramp, back, P, dang) {
  limb(p, hx, hy, L.jx, L.jy, 6, 5, back ? [VOID, OBS[0], OBS[1], OBS[1]] : [OBS[0], OBS[1], OBS[2], OBS[3]]);
  limb(p, L.jx, L.jy, L.ex, L.ey - 2, 5, 4.5, ramp);
  // Goldene Kniekachel
  p.ellipse(L.jx, L.jy, 2.5, 2.2, back ? GOLD[0] : GOLD[1]); p.ellipse(L.jx - 0.5, L.jy - 0.5, 1.5, 1.2, back ? GOLD[1] : GOLD[3]);
  if (!back) p.px(L.jx - 1, L.jy - 1, GOLD[4]);
  // Glutnaht an der Schiene
  const mx = L.jx + (L.ex - L.jx) * 0.55, my = L.jy + (L.ey - 2 - L.jy) * 0.55;
  p.px(mx, my, MAG[2]); g.max(mx, my, back ? 0 : 1 + (P.crack > 0.6 ? 1 : 0));
  // Sabaton: spitz, im Schweben nach unten gerichtet
  const ex = L.ex, ey = L.ey;
  if (dang < 0.5) {
    p.rect(ex - 3, ey - 3, 8, 3, ramp[1]); p.rect(ex - 3, ey - 3, 8, 1, ramp[3]); p.rect(ex - 2, ey - 4, 4, 1, ramp[2]);
    p.px(ex + 5, ey - 1, ramp[2]); p.px(ex + 6, ey - 1, back ? ramp[1] : GOLD[2]);
    p.px(ex - 3, ey - 1, ramp[0]);
  } else {
    p.rect(ex - 2, ey - 4, 4, 4, ramp[1]); p.rect(ex - 2, ey - 4, 1, 4, ramp[3]);
    p.px(ex + 1, ey, ramp[2]); p.px(ex + 2, ey + 1, back ? ramp[1] : GOLD[2]);
  }
}

// Gürtel mit Goldschnalle, Kettengehänge, Wappenrock vorn (schwingt), Seitenschöße
function belt(p, g, hipX, hipY, gy, P, legF, legB, dang) {
  const sway = (legF.jx - hipX - 5) * 0.25 + Math.sin(P.capeT) * 0.6 + P.robe;
  // Seitenschöße (Obsidianplatten über den Oberschenkeln)
  for (let i = 0; i < 4; i++) {
    const tx = hipX - 7 + i * 3.5, len = 9 - Math.abs(i - 1.5) * 1.3;
    for (let j = 0; j < len; j++) {
      const x = tx + sway * 0.3 * (j / len) * (i / 3);
      p.rect(x, hipY + j, 3, 1, j === 0 ? OBS[4] : j > len - 2 ? GOLD[1] : i === 0 ? OBS[3] : OBS[2]);
    }
  }
  // Wappenrock: karminrot mit Goldborte, hängt bis fast zum Boden
  const L = Math.max(8, gy - hipY - 3 - P.kneel * 9);
  const tw = 2;
  for (let j = 0; j < L; j++) {
    const v = j / L;
    const cx = hipX + 2 + sway * v * v * 1.6 + (dang > 0.1 ? -v * v * 4 * dang : 0);
    const w = tw + v * 1.0;
    for (let k = -w; k <= w; k += 0.5) {
      const e = w - Math.abs(k);
      let c = e < 0.6 ? GOLD[k < 0 ? 2 : 1] : k < -w * 0.4 ? ROBE[2] : k > w * 0.3 ? ROBE[0] : ROBE[1];
      if (j > L - 2) c = GOLD[2];
      p.px(cx + k, hipY + j, c);
    }
    // gestickte Krone mit Glutflamme
    if (j === Math.round(L * 0.3)) { p.px(cx - 1, hipY + j, GOLD[3]); p.px(cx + 1, hipY + j, GOLD[3]); p.px(cx, hipY + j - 1, GOLD[4]); p.px(cx, hipY + j + 1, GOLD[2]); g.max(cx, hipY + j - 2, 1); }
  }
  // Fransen / Glutsaum im Schweben
  if (dang > 0.1) for (let k = -3; k <= 4; k++) g.max(hipX + 3 + sway * 1.6 - 4 * dang + k, hipY + L, 1);
  // Gürtel
  p.rect(hipX - 8, hipY - 3, 17, 3, OBS[1]); p.rect(hipX - 8, hipY - 3, 17, 1, GOLD[2]); p.rect(hipX - 8, hipY - 1, 17, 1, GOLD[1]);
  const bx = hipX + 2, by = hipY - 4;
  p.rect(bx - 2, by, 5, 5, GOLD[2]); p.rect(bx - 2, by, 5, 1, GOLD[4]); p.rect(bx + 2, by, 1, 5, GOLD[1]);
  p.px(bx, by + 2, MAG[3]); g.max(bx, by + 2, 3);
  // Kettengehänge an der Hüfte
  for (let k = 0; k < 6; k++) {
    const x = hipX - 6 + k * 0.9 + Math.sin(P.capeT + k * 0.5) * 0.3, y = hipY + 1 + Math.sin(k / 5 * Math.PI) * 3;
    p.px(x, y, k % 2 ? IRON[3] : IRON[2]);
  }
}

function bracer(p, g, arm, back) {
  const t0 = 0.45, t1 = 0.85;
  const x0 = arm.jx + (arm.ex - arm.jx) * t0, y0 = arm.jy + (arm.ey - arm.jy) * t0;
  const x1 = arm.jx + (arm.ex - arm.jx) * t1, y1 = arm.jy + (arm.ey - arm.jy) * t1;
  limb(p, x0, y0, x1, y1, 5.5, 5, back ? [GOLD[0], GOLD[0], GOLD[1], GOLD[1]] : [GOLD[1], GOLD[2], GOLD[3], GOLD[4]]);
  if (!back) { const mx = (x0 + x1) / 2, my = (y0 + y1) / 2; p.px(mx, my, MAG[3]); g.max(mx, my, 2); }
}

// Klauenhandschuh (Obsidian)
function claw(p, g, x, y, ramp, open, front = false) {
  p.rect(x - 2, y - 2, 5, 4, ramp[1]); p.rect(x - 2, y - 2, 5, 1, ramp[3]); p.rect(x + 2, y - 1, 1, 3, ramp[0]);
  if (front) { p.px(x - 1, y - 2, ramp[3]); p.px(x - 2, y - 1, ramp[2]); }
  if (open) for (let k = -2; k <= 2; k += 2) { p.line(x + k * 0.6, y - 2, x + k * 1.2, y - 5, ramp[2]); p.px(x + k * 1.2, y - 5, GOLD[3]); }
  else { p.px(x + 3, y + 1, GOLD[2]); }
}

// Gesprengte Kette am hinteren Handgelenk, schwingt nach
function chain(p, g, x, y, P, back) {
  const n = 7;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const cx = x - 1 - t * 2 - P.cape * 3 * t + Math.sin(P.capeT + t * 2) * 1.2 * t, cy = y + 1 + i * 1.4;
    if (i % 2) { p.px(cx, cy, IRON[2]); p.px(cx + 1, cy, IRON[1]); p.px(cx, cy - 1, IRON[3]); }
    else p.px(cx, cy, IRON[3]);
  }
  // glühendes Bruchende
  const ex = x - 3 - P.cape * 3 + Math.sin(P.capeT + 2) * 1.2, ey = y + 1 + n * 1.4 + 1;
  p.px(ex, ey, MAG[2]); g.max(ex, ey, 2);
}

function pauldron(p, g, x, y, rx, ry, ramp, front) {
  // Rückseite: geschwungener Kragenflügel (Gold-Spitze)
  if (front) {
    limb(p, x - 4, y - 2, x - 6, y - 9, 3.5, 1, [OBS[1], OBS[2], OBS[4], SPEC]);
    p.px(x - 6, y - 10, GOLD[4]); g.max(x - 6, y - 11, 1);
  }
  p.ellipse(x, y, rx, ry, ramp[0]);
  p.ellipse(x - 0.5, y - 0.5, rx - 1, ry - 1, ramp[1]);
  p.ellipse(x - 1.5, y - 1.5, rx - 2.5, ry - 2.2, ramp[2]);
  p.ellipse(x - 2, y - 2.5, rx - 4.5, ry - 3.6, ramp[3]);
  // zweite, tiefere Lage mit Goldkante
  p.line(x - rx + 1, y + ry - 1, x + rx - 1, y + ry - 1, front ? GOLD[2] : GOLD[0]);
  p.line(x - rx + 2, y + ry, x + rx - 2, y + ry, front ? GOLD[1] : GOLD[0]);
  if (front) {
    p.px(x - rx + 2, y + ry - 1, GOLD[4]);
    p.px(x - 3, y - ry + 2, SPEC);
    p.px(x + 1, y, MAG[3]); g.max(x + 1, y, 2);
  }
}

// Langes Haar hinter dem Kopf (fällt über den Rücken, weht mit dem Umhang)
function hairBack(p, g, hx, hy, P) {
  for (let s = 0; s < 8; s++) {
    const x0 = hx + 1 + s * 0.6, y0 = hy + 2 + s * 0.2;
    const L = 12 + (hash2(s, 1, 9) * 5 | 0);
    for (let j = 0; j < L; j++) {
      const v = j / L;
      const x = x0 - v * (5 + P.cape * 6 + P.hair * 8) + Math.sin(P.capeT * 1.2 + v * 4 + s) * v * 1.2;
      const y = y0 + j * (1 - P.hair * 0.5) - v * v * P.hair * 6;
      p.px(x, y, s < 2 ? HAIR[3] : s < 5 ? HAIR[2] : HAIR[1]);
      if (j > L - 3 && P.crack > 0.5 && hash2(s, j, 4) < 0.5) g.max(x, y, 0);
    }
  }
}

// Kopf: hageres Aschegesicht, glühende Augen, spitzer Bart, Krone mit Glutflammen
function head(p, g, hx, hy, P, meta, gy) {
  const j = Math.round(P.jaw * 2);
  // Schädel
  p.ellipse(hx + 5, hy + 5, 4.5, 5.2, ASH[2]);
  p.ellipse(hx + 4.5, hy + 4, 3.2, 3.5, ASH[3]);
  p.px(hx + 3, hy + 2, ASH[4]);
  // Haarkappe (unter der Krone, Schläfe)
  p.rect(hx + 1, hy + 1, 5, 3, HAIR[3]); p.rect(hx + 1, hy + 3, 3, 4, HAIR[2]); p.px(hx + 2, hy + 1, HAIR[4]);
  // Gesicht (hager, lang)
  p.rect(hx + 6, hy + 3, 4, 7, ASH[3]);
  p.rect(hx + 9, hy + 5, 2, 3, ASH[3]); p.px(hx + 10, hy + 7, ASH[2]); // Nase
  p.rect(hx + 6, hy + 3, 5, 1, ASH[4]); // Stirn
  p.px(hx + 7, hy + 7, ASH[1]); p.px(hx + 7, hy + 8, ASH[2]); // Wangenschatten
  p.rect(hx + 6, hy + 9 + j, 4, 1, ASH[2]); // Kinn
  // Augen: tiefe Höhlen mit Glut
  p.rect(hx + 7, hy + 5, 2, 1, VOID); p.px(hx + 10, hy + 5, VOID);
  if (P.eye > 0.1) {
    const e = P.eye > 0.6 ? 1 : 0;
    g.px(hx + 8, hy + 5, 3 + e); g.px(hx + 7, hy + 5, 2 + e); g.px(hx + 10, hy + 5, 2 + e);
    if (P.eye > 0.8) { g.max(hx + 6, hy + 5, 1); g.max(hx + 8, hy + 4, 1); }
    if (P.crack > 0.9) { g.max(hx + 5, hy + 5, 1); g.max(hx + 4, hy + 5, 0); }
  }
  meta.eye = { x: hx + 8, y: hy + 5 };
  // Mund: Glutspalt
  p.rect(hx + 7, hy + 8, 3, 1 + j, VOID);
  if (j) { g.px(hx + 8, hy + 8, P.jaw > 0.7 ? 3 : 2); g.px(hx + 9, hy + 8 + j - 1, 2); if (j > 1) g.px(hx + 8, hy + 9, 4); }
  else g.max(hx + 8, hy + 8, 0);
  meta.mouth = { x: hx + 9, y: hy + 8 };
  // Glutrisse im Gesicht
  crackLine(g, [[hx + 5, hy + 2], [hx + 6, hy + 5], [hx + 6, hy + 7]], P, 0);
  if (P.crack > 0.5) crackLine(g, [[hx + 9, hy + 9], [hx + 8, hy + 10]], P, 0);
  // Spitzbart aus Asche, glimmt
  for (let k = 0; k < 5; k++) {
    const y = hy + 10 + j + k, w = k < 2 ? 3 : k < 4 ? 2 : 1;
    p.rect(hx + 7 - (k > 2 ? 0 : 1) + Math.round(k * 0.3), y, w, 1, k < 1 ? HAIR[2] : k < 3 ? HAIR[1] : HAIR[0]);
  }
  g.max(hx + 7, hy + 14 + j, 0);
  // Krone
  if (P.crownDrop < 0.02) crown(p, g, hx, hy + 1, 0, P);
  meta.head = { x: hx + 6, y: hy - 2 };
  meta.crown = { x: hx + 6, y: hy - 1 };
}

// Krone: Goldreif, fünf Zacken (vorn höher), Glutsteine, Flammen über den Spitzen.
// tilt kippt die Krone (Sturz), lit=false: keine Flammen mehr
function crown(p, g, x, y, tilt, P, lit = true) {
  const pt = (dx, dy) => [x + dx * Math.cos(tilt) - dy * Math.sin(tilt), y + dx * Math.sin(tilt) + dy * Math.cos(tilt)];
  for (let i = 0; i <= 11; i++) {
    for (let r = 0; r < 2; r++) {
      const [px, py] = pt(i, r);
      p.px(px, py, r === 0 ? (i < 5 ? GOLD[4] : GOLD[3]) : GOLD[1]);
    }
  }
  const spikes = [[1, 3], [3.5, 5], [6, 7], [8.5, 5], [11, 4]];
  const flames = [];
  for (const [dx, h] of spikes) {
    for (let k = 1; k <= h; k++) {
      const w = k < h - 1 ? 1 : 0;
      for (let q = -w * 0.5; q <= w * 0.5; q += 0.5) {
        const [px, py] = pt(dx + q, -k);
        p.px(px, py, k === h ? GOLD[4] : dx < 5 ? GOLD[3] : GOLD[2]);
      }
    }
    const [tx, ty] = pt(dx, -h - 1);
    flames.push([tx, ty, h]);
  }
  // Glutsteine im Reif
  for (const dx of [3.5, 6, 8.5]) { const [px, py] = pt(dx, 0.5); p.px(px, py, MAG[3]); g.max(px, py, dx === 6 ? 4 : 3); }
  if (!lit || P.crownF < 0.05) return;
  // Flammen: steigen senkrecht, flackern (Seed aus capeT)
  const seed = Math.round(P.capeT * 4.1);
  flames.forEach(([fx, fy, h], n) => {
    const hgt = P.crownF * (3 + h * 0.6 + hash2(n, seed, 31) * 4);
    for (let k = 0; k < hgt; k++) {
      const t = k / hgt, wob = Math.sin(k * 0.7 + n + seed) * t * 1.2;
      const i = t < 0.25 ? 4 : t < 0.5 ? 3 : t < 0.8 ? 2 : 1;
      g.max(fx + wob, fy - k, i);
      if (t < 0.45 && P.crownF > 0.8) { g.max(fx + wob - 1, fy - k, i - 2); g.max(fx + wob + 1, fy - k, i - 2); }
    }
  });
}

// Umhang aus Rauch: an den Schultern befestigt, weht nach hinten, schwebt, zerfasert
function cape(p, g, tx, ty, gy, P) {
  const N = 34;
  const lift = 0.4 + P.hover / 20;
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const sx = tx - 8 + i * 0.5;
    const top = ty + Math.abs(u - 0.5) * 3;
    const len = Math.min(52, gy - ty + 8) - Math.abs(u - 0.35) * 14 + (hash2(i, 1, 13) * 6 | 0);
    for (let j = 0; j < len; j++) {
      const v = j / len;
      const x = sx - P.cape * 20 * v * v - (1 - u) * 7 * v - v * 4 + Math.sin(P.capeT * 1.3 + v * 4.5 + i * 0.5) * 2.2 * v;
      const y = top + j * (1 - lift * v * 0.55);
      // zerfaserndes Ende: nach unten immer lückenhafter
      if (v > 0.8 && hash2((i >> 1) * 7 + j, Math.round(P.capeT * 2), 11) < (v - 0.8) * 3) continue;
      const fold = Math.sin(i * 0.55 + v * 2 - P.capeT * 0.5);
      const shade = u < 0.12 ? 4 : u > 0.88 ? 0 : (fold > 0.35 ? 3 : fold < -0.35 ? 1 : 2) - (v > 0.65 ? 1 : 0);
      const sc = SMOKE[Math.max(0, Math.min(4, shade - (v > 0.7 ? 1 : 0)))];
      p.px(x, y, sc);
      if (v > 0.25 && u > 0.05) p.px(x - 1, y, sc);
      // Glutfunken im Stoff
      if (v > 0.7 && hash2(i, j, 17) < 0.03 + P.crack * 0.03) g.max(x, y, hash2(i, j, 19) < 0.4 ? 2 : 1);
    }
  }
  // Stehkragen hinter dem Kopf (Gold gesäumt)
  for (let i = 0; i < 9; i++) {
    const x = tx - 3 + i * 0.9, top = ty - 9 + Math.abs(i - 2.5) * 0.9;
    for (let y = top; y < ty + 2; y++) p.px(x, y, y === top ? GOLD[2] : SMOKE[i < 2 ? 4 : i < 5 ? 3 : 2]);
  }
}

// Flügel aus Rauch mit glühenden Rippen (form 2); form 3: Flammenzungen am Rand
function wings(p, g, rx, ry, P) {
  const s = P.wing;
  const flap = Math.sin(P.wingT) * 0.12 + P.spread * 0.25;
  const sets = [
    { a0: -2.7, a1: -1.5, n: 4, L: 42, ox: 5, oy: -3, far: true },
    { a0: -3.1, a1: -1.7, n: 5, L: 60, ox: 0, oy: 0, far: false },
  ];
  for (const w of sets) {
    const pts = [];
    for (let f = 0; f < w.n; f++) {
      const a = w.a0 + ((w.a1 - w.a0) * f) / (w.n - 1) - flap * (w.far ? 0.7 : 1);
      const L = w.L * s * (f === w.n - 1 ? 0.78 : f === 0 ? 0.62 : 1 - Math.abs(f - 2.5) * 0.05);
      pts.push({ a, L });
    }
    const ox = rx + w.ox, oy = ry + w.oy;
    // Membran: Rauch zwischen den Rippen, Rand gezackt
    for (let f = 0; f < w.n - 1; f++) {
      const A = pts[f], B = pts[f + 1];
      for (let t = 0; t <= 1; t += 0.02) {
        const a = A.a + (B.a - A.a) * t;
        const Lr = (A.L + (B.L - A.L) * t) * (0.7 + 0.3 * Math.pow(Math.abs(t - 0.5) * 2, 1.5));
        for (let d = 3; d < Lr; d += 0.5) {
          const x = ox + Math.cos(a) * d, y = oy + Math.sin(a) * d * 0.95;
          const v = d / Lr;
          if (v > 0.9 && hash2(Math.round(x), Math.round(y), 5 + f) < (v - 0.9) * 6) continue;
          const fold = t < 0.18 || t > 0.82;
          const c = w.far ? SMOKE[v < 0.4 ? 1 : 0] : SMOKE[Math.min(4, (v < 0.3 ? 3 : v < 0.65 ? 2 : 1) + (fold ? 1 : 0))];
          p.px(x, y, c);
          if (P.wingFire > 0.5 && v > 0.8 && hash2(Math.round(x), Math.round(y), 9) < 0.35) g.max(x, y, 1);
        }
      }
    }
    // Rippen: dunkler Knochen mit Glutader, Spitzen brennen
    for (const { a, L } of pts) {
      for (let d = 0; d < L; d += 0.5) {
        const x = ox + Math.cos(a) * d, y = oy + Math.sin(a) * d * 0.95;
        const t = d / L;
        p.px(x, y, w.far ? OBS[1] : t < 0.3 ? OBS[3] : OBS[2]);
        if (!w.far || P.wingFire > 0.5) g.max(x, y, (t < 0.45 ? 0 : t < 0.85 ? 1 : 2) + (P.wingFire > 0.5 ? 1 : 0));
      }
      // Flammenzunge an der Spitze
      const hgt = (2 + P.wingFire * 7) * s;
      const tx = ox + Math.cos(a) * L, ty = oy + Math.sin(a) * L * 0.95;
      for (let k = 0; k < hgt; k++) {
        const kk = k / hgt;
        g.max(tx + Math.cos(a) * k * 0.6 + Math.sin(k + P.wingT * 3) * 0.6, ty + Math.sin(a) * k * 0.6 - k * 0.5, kk < 0.3 ? 4 : kk < 0.6 ? 3 : 2);
      }
    }
    // Form 3: Feuerkante entlang des Membranrandes
    if (P.wingFire > 0.5) {
      for (let f = 0; f < w.n - 1; f++) {
        const A = pts[f], B = pts[f + 1];
        for (let t = 0; t <= 1; t += 0.05) {
          const a = A.a + (B.a - A.a) * t;
          const Lr = (A.L + (B.L - A.L) * t) * (0.7 + 0.3 * Math.pow(Math.abs(t - 0.5) * 2, 1.5)) * 0.9;
          const x = ox + Math.cos(a) * Lr, y = oy + Math.sin(a) * Lr * 0.95;
          const hh = 1 + hash2(f * 20 + Math.round(t * 20), Math.round(P.wingT * 3), 3) * 3 * P.wingFire;
          for (let k = 0; k < hh; k++) g.max(x, y - k, k < 1 ? 3 : 2);
        }
      }
    }
  }
}

// Rauchschwaden unter dem Schwebenden bis zum Boden
function smokeTrail(p, g, hipX, gy, P, dang) {
  const top = gy - 4, bottom = AY;
  for (let i = 0; i < 9; i++) {
    const x0 = hipX - 4 + i * 1.2;
    for (let y = top; y <= bottom; y++) {
      const v = (y - top) / Math.max(1, bottom - top);
      const x = x0 - v * 5 + Math.sin(P.capeT * 1.4 + v * 5 + i) * (1 + v * 2);
      if (hash2(i * 31 + y, Math.round(P.capeT * 3), 29) < 0.25 + v * 0.7) continue;
      p.px(x, y, SMOKE[v < 0.3 ? 2 : 1]);
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
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!L.base[i] && !L.glow[i]) continue;
    const n = hash2(x, y, 57) * 5 + hash2(x >> 2, y >> 2, 58) * 4;
    const d = y + n - front;
    if (d < 0) { L.base[i] = 0; L.glow[i] = 0; continue; }
    if (d < 3) { L.base[i] = col(ASHDUST[d < 1.2 ? 4 : 3]); L.glow[i] = d < 1.6 ? 5 : 4; }
    else if (d < 7) { if (L.base[i]) L.base[i] = col(ASHDUST[d < 5 ? 2 : 1]); L.glow[i] = Math.max(L.glow[i], d < 5 ? 3 : 2); }
    else if (d < 12 && L.base[i] && hash2(x, y, 59) < 0.5) L.base[i] = col(ASHDUST[0]);
  }
}

function ashPile(p, g, k, cx, gy) {
  if (k <= 0) return;
  const rx = 4 + k * 10, ry = 1 + k * 5;
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

// Randlicht: Oberkanten kühl aufhellen, Vorder- und Unterkanten glutrot
function rimLight(L, x0, y0, x1, y1) {
  const B = L.base, G = L.glow;
  const opaque = (x, y) => x >= 0 && y >= 0 && x < W && y < H && B[y * W + x] !== 0;
  const out = new Uint32Array(B);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * W + x;
    if (!B[i]) continue;
    const up = !opaque(x, y - 1), left = !opaque(x - 1, y);
    const right = !opaque(x + 1, y), down = !opaque(x, y + 1);
    if (!(up || left || right || down)) continue;
    if (up + left + right + down >= 3) continue;
    const [r, g, b] = rgbOf(B[i]);
    if (up || left) {
      // kühles Oberlicht (Licht von links oben): hebt die Silhouette vom dunklen Boden ab
      out[i] = pack(Math.min(255, r * 0.55 + 196 * 0.45) | 0, Math.min(255, g * 0.55 + 186 * 0.45) | 0, Math.min(255, b * 0.55 + 214 * 0.45) | 0);
    } else if (right) {
      // schwache Glutkante vorn
      out[i] = pack(Math.min(255, r * 0.75 + 220 * 0.25) | 0, Math.min(255, g * 0.78 + 96 * 0.22) | 0, Math.min(255, b * 0.8 + 50 * 0.2) | 0);
      if (!G[i] && !opaque(x + 2, y) && !opaque(x + 3, y) && !opaque(x + 2, y - 1) && (x + y) % 2 === 0) G[i] = 1;
    }
  }
  B.set(out);
}

function finish(L, fx, meta, inferno, rim = true) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (L.base[i] || L.glow[i]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) { x0 = y0 = 0; x1 = y1 = 1; }
  if (rim) rimLight(L, x0, y0, x1, y1);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const ramp = inferno ? INFc : EMBc;
  const toCanvas = (fill) => {
    const c = makeCanvas(cw, ch), ctx = c.getContext('2d');
    const img = ctx.createImageData(cw, ch), d = new Uint32Array(img.data.buffer);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) d[y * cw + x] = fill((y + y0) * W + x + x0);
    ctx.putImageData(img, 0, 0);
    return c;
  };
  const baseC = toCanvas((i) => L.base[i]);
  const f = buildFrame(cw, ch, AX - x0, AY - y0, (pc) => pc.ctx.drawImage(baseC, 0, 0));
  f.glow = new GlowFrame(toCanvas((i) => (L.glow[i] ? ramp[L.glow[i] - 1] : 0)), AX - x0, AY - y0);
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

function frame(P, form, extra = {}) {
  const Q = withForm(P, form);
  const L = new Layers();
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
function deathFrame(P, form, fx) {
  const Q = withForm(P, form);
  const L = new Layers();
  const p = new Pen(L), g = new GlowPen(L);
  const meta = drawFigure(p, g, { ...Q, noSword: 1, crownDrop: Math.max(Q.crownDrop, Q.ash > 0 ? 0.03 : 0) }, {});
  // Körper-Grenzen für die Zerfallsfront
  let yTop = H, yBot = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (L.base[y * W + x]) { if (y < yTop) yTop = y; if (y > yBot) yBot = y; }
  dissolve(L, Q.ash, yTop, yBot);
  // Schwert: senkrecht im Boden, Klinge glimmt nach
  const sx = meta.hand.x, sy = meta.hand.y;
  sword(p, g, sx, sy, Math.PI / 2 - 0.08, { ...Q, flame: Math.max(0, 0.9 - Q.ash * 0.8), capeT: Q.capeT });
  ashPile(p, g, Math.min(1, Q.ash * 1.15), AX + 1, AY);
  // Krone
  if (Q.crownDrop > 0.02) {
    const k = Q.crownDrop;
    const hx = meta.crown.x - 6, hy = meta.crown.y + 1;
    // Fall mit Aufprall bei 0.6, kleiner Sprung, liegt bei 1
    const gx = AX + 22, gyC = AY - 2;
    let x, y, tilt;
    if (k < 0.6) { const t = k / 0.6; x = hx + (gx - 4 - hx) * t; y = hy + (gyC - hy) * t * t; tilt = t * 1.4; }
    else if (k < 0.85) { const t = (k - 0.6) / 0.25; x = gx - 4 + t * 4; y = gyC - Math.sin(t * Math.PI) * 5; tilt = 1.4 + t * 1.2; }
    else { x = gx; y = gyC; tilt = 2.75; }
    crown(p, g, x, y, tilt - (k >= 0.85 ? 2.4 : 0), { ...Q, crownF: Math.max(0, 1 - k * 1.5) }, k < 0.66);
    meta.crown = { x, y };
  }
  return finish(L, fx, meta, Q.inferno > 0.5);
}

// Animationen erst bei Bedarf bauen
function lazy(defs) {
  const o = {};
  for (const [k, fn] of Object.entries(defs)) {
    Object.defineProperty(o, k, {
      configurable: true, enumerable: true,
      get() { const v = fn(); Object.defineProperty(o, k, { value: v, writable: true, enumerable: true, configurable: true }); return v; },
    });
  }
  return o;
}

export function createMalgarethSprites() {
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
  const un1 = pose({ lean: 0.34, hipY: 5, head: 1.5, headY: 3, sw: 1.3, hFx: 6, hFy: 12, hBx: 2, hBy: 10, wing: -0.3, wingT: 0, cape: 0.1, core: 2, crack: 0.2, eye: 1.2 });
  const un2 = pose({ ...un1, capeT: 1, crack: 0.35, core: 2.5, wing: -0.35, hipY: 6 });
  const un3 = pose({ lean: -0.3, hipY: -2, head: -1.5, headY: -2, jaw: 1, sw: -1.9, hFx: 4, hFy: -18, hBx: -16, hBy: -8, spread: 1, cast: 1, wing: 0.3, wingFire: 0.75, wingT: 1, hover: 2, crack: 0.4, inferno: 1, crownF: 0.8, flame: 0.8, cape: 1.2, capeT: 2, core: 3, hair: 1 });
  const un4 = pose({ ...un3, capeT: 4, wingT: 3 });
  const un5 = pose({ lean: 0.04, sw: 1.6, hFx: 9, hFy: 20, hBx: -7, hBy: 20, wing: 0.28, wingFire: 0.75, hover: 3, crack: 0.4, inferno: 1, crownF: 0.45, flame: 0.4, cape: 0.3, capeT: 6, wingT: 5 });

  // Kanal (Form 3): hoch erhoben, Arme ausgebreitet, Schwert über dem Kopf
  const chA = pose({ hover: 10, lean: -0.12, sw: -1.57, hFx: 5, hFy: -24, hBx: -16, hBy: -10, spread: 1, cast: 1, jaw: 0.6, head: -1, headY: -2, cape: 1, capeT: 0, wingT: 0, core: 2.5, crownF: 0.4, flame: 0.6, hair: 0.6 });
  const chB = pose({ ...chA, hover: 11, capeT: Math.PI, wingT: Math.PI, core: 3, jaw: 0.9, hBy: -12 });

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
