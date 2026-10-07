import { PAL } from '../gfx/Palette.js';
import { makeCanvas, flipCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame, Animation } from '../gfx/Sprite.js';
import { hash2 } from '../core/math.js';

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

// Ein gemeinsamer Puffer für alle Frames (spart Speicher-Umschlag beim Bauen);
// reset() leert nur das zuletzt benutzte Hüllrechteck.
class Layers {
  constructor() {
    this.base = new Uint32Array(W * H); this.glow = new Uint8Array(W * H);
    this.x0 = W; this.y0 = H; this.x1 = -1; this.y1 = -1;
  }
  reset() {
    if (this.x1 >= 0) {
      for (let y = this.y0; y <= this.y1; y++) {
        const a = y * W + this.x0, b = y * W + this.x1 + 1;
        this.base.fill(0, a, b); this.glow.fill(0, a, b);
      }
    }
    this.x0 = W; this.y0 = H; this.x1 = -1; this.y1 = -1;
    return this;
  }
  touch(x, y) {
    if (x < this.x0) this.x0 = x; if (x > this.x1) this.x1 = x;
    if (y < this.y0) this.y0 = y; if (y > this.y1) this.y1 = y;
  }
}
let shared = null;
const layers = () => (shared ??= new Layers()).reset();
const SCRATCH = new Uint32Array(W * H);

// Grundbild: deckt darunter liegendes Glühen ab. clip = unterste erlaubte Zeile.
class Pen {
  constructor(L) { this.L = L; this.clip = AY; }
  px(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H || y > this.clip) return;
    const i = y * W + x;
    this.L.base[i] = col(c); this.L.glow[i] = 0; this.L.touch(x, y);
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
    this.L.glow[y * W + x] = Math.min(4, Math.round(i)) + 1; this.L.touch(x, y);
  }
  max(x, y, i) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H || y > this.clip || i < 0) return;
    const k = y * W + x, v = Math.min(4, Math.round(i)) + 1;
    if (this.L.glow[k] < v) { this.L.glow[k] = v; this.L.touch(x, y); }
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

// Dickes Glied, Licht von links oben. ramp: 4 oder 5 Stufen (dunkel -> hell).
function limb(p, x0, y0, x1, y1, w0, w1, ramp) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len, ny = dx / len;
  if (nx + ny > 0) { nx = -nx; ny = -ny; }
  const steps = Math.ceil(len * 2);
  const n = ramp.length;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, x = x0 + dx * t, y = y0 + dy * t;
    const hw = (w0 + (w1 - w0) * t) / 2;
    for (let k = -hw; k <= hw + 0.01; k += 0.5) {
      const r = (k + hw) / (2 * hw || 1); // 0 = Schattenseite, 1 = Lichtseite
      let c;
      if (n >= 5) c = r > 0.86 ? ramp[4] : r > 0.6 ? ramp[3] : r > 0.32 ? ramp[2] : r > 0.12 ? ramp[1] : ramp[0];
      else c = k > hw - 1 ? ramp[3] : k < -hw + 1 ? ramp[0] : k > 0 ? ramp[2] : ramp[1];
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
  for (let u = -12; u <= 2; u += 0.5) {
    for (let v = -1.5; v <= 1.5; v += 0.5) {
      const lit = v * up > 0.6 ? 3 : v * up < -0.6 ? 0 : 1;
      let c = LEATHER[[0, 1, 2, 3][lit]];
      if (Math.round(u * 2) % 3 === 0) c = LEATHER[0];
      if (u < -10.5 || u > 1) c = OBS[[1, 3, 4, 5][lit]];
      const [x, y] = at(u, v); p.px(x, y, c);
    }
  }
  // Knauf mit Glutstein
  for (let u = -17; u <= -11.5; u += 0.5) for (let v = -3, vv = 3; v <= vv; v += 0.5) {
    if (Math.hypot(u + 14.2, v) > 3.1) continue;
    const [x, y] = at(u, v); p.px(x, y, v * up > 0.9 ? OBS[5] : v * up < -1.2 ? OBS[1] : OBS[3]);
  }
  { const [x, y] = at(-14.2, 0); p.px(x, y, MAG[4]); g.max(x, y, 3); }
  // Parierstange: geschwungen, Enden zur Klinge hin gebogen, Glutstein in der Mitte
  // Parierstange: zwei geschwungene Knochenhörner
  for (let v = -11; v <= 11; v += 0.5) {
    const bend = Math.abs(v) > 4 ? (Math.abs(v) - 4) * 0.55 : 0;
    for (let w = 0; w <= 2.5; w += 0.5) {
      const [x, y] = at(3 + w + bend, v);
      p.px(x, y, w < 0.6 ? (v * up > 0 ? OBS[5] : OBS[4]) : w < 1.6 ? OBS[3] : OBS[1]);
    }
    if (Math.abs(v) > 10.4) { const [x, y] = at(6.5 + bend, v); p.px(x, y, MAG[3]); g.max(x, y, 2); }
  }
  for (let v = -1; v <= 1; v += 0.5) { const [x, y] = at(4, v); p.px(x, y, MAG[3]); }
  { const [x, y] = at(4, 0); p.px(x, y, MAG[4]); g.max(x, y, 4); const [x2, y2] = at(4, up); g.max(x2, y2, 2); }
  // Klinge: gewellt (Flammberg), Obsidian mit glutflüssigen Schneiden, heller Grat
  const L = BLADE;
  const hwAt = (u) => {
    const t = (u - 6) / (L - 6);
    const taper = (t < 0.82 ? 3.2 - t * 1.1 : (1 - t) / 0.18 * 2.3) * 1.25;
    return Math.max(0.4, taper + 0.6 * Math.sin(u * 0.55) * (t < 0.85 ? 1 : 0));
  };
  const heat = P.flame;
  for (let u = 6; u <= L; u += 0.5) {
    const hw = hwAt(u), wob = 0.35 * Math.sin(u * 0.55);
    for (let v = -hw; v <= hw; v += 0.5) {
      const [x, y] = at(u, v + wob);
      const edge = hw - Math.abs(v);
      let c;
      if (edge < 0.6) c = v * up > 0 ? MAG[4] : MAG[3];
      else if (edge < 1.1) c = v * up > 0 ? BLK[5] : MAG[2];
      else c = Math.abs(v) < 0.4 ? BLK[4] : v * up > 0 ? BLK[3] : BLK[1];
      p.px(x, y, c);
      if (edge < 0.6) g.max(x, y, heat > 0.8 ? 3 : 2);
      else if (edge < 1.1 && heat > 0.5) g.max(x, y, 1);
    }
    // Glutrunen in der Hohlkehle
    if (u > 10 && u < L - 9 && Math.round(u * 2) % 7 === 0) { const [x, y] = at(u, wob - 0.6 * up); p.px(x, y, MAG[3]); g.max(x, y, heat > 0.9 ? 3 : 2); }
  }
  // Flammen züngeln an der Oberseite der Klinge empor (nur Leucht-Ebene)
  const seed = Math.round(P.capeT * 3.7 + a * 5);
  for (let u = 9; u <= L - 1; u += 1) {
    const hw = hwAt(u);
    const [bx, by] = at(u, (hw + 0.5) * up);
    const hgt = heat * (1.5 + hash2(Math.round(u), seed, 41) * 5) * (u > L - 7 ? 0.6 : 1);
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
function smear(p, g, cx, cy, a0, a1, r0, r1, yMin = -1e9) {
  if (Math.abs(a1 - a0) > 1.7) a0 = a1 - Math.sign(a1 - a0) * 1.7;
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1), span = hi - lo || 1;
  const R1 = Math.ceil(r1);
  for (let y = -R1; y <= R1; y++) for (let x = -R1; x <= R1; x++) {
    const d = Math.hypot(x, y);
    if (d < r0 || d > r1 || cy + y < yMin) continue;
    let a = Math.atan2(y, x);
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
    p.px(cx + x, cy + y, c);
    if (fresh > 0.3 && radial > 0.45) g.max(cx + x, cy + y, radial > 0.9 ? 4 : radial > 0.74 ? 3 : fresh > 0.7 ? 2 : 1);
  }
}

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
  const hx = Math.round(neckX - 7 + P.head), hy = Math.round(neckY - 19 + P.headY);

  // --- 0. Flügel (hinter allem)
  if (P.wing > 0.03) wings(p, g, chX - perpX * 4, chY + 4, P);
  // --- 1. Königsmantel
  cape(p, g, chX - perpX * 5, chY + 1, gy, P, dang);

  // --- 3. hinteres Bein, hinterer Arm
  skirtBack(p, g, hipX, hipY, gy, P);
  leg(p, g, hipX - 4.5, hipY, legB, true, P, dang);
  const darkA = [VOID, ASH[0], ASH[1], ASH[2]];
  limb(p, shB.x, shB.y, armB.jx, armB.jy, 6 * S, 5 * S, [VOID, OBS[0], OBS[1], OBS[2]]);
  limb(p, armB.jx, armB.jy, armB.ex, armB.ey, 5.5 * S, 4.5 * S, darkA);
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
  p.ellipse(neckX, neckY + 1, 8.5, 5, OBS[1]); p.ellipse(neckX - 0.5, neckY, 7, 3.4, OBS[3]);
  p.ellipse(neckX - 2, neckY - 0.5, 4, 1.7, OBS[4]);
  p.line(neckX - 6, neckY - 2, neckX + 6, neckY - 2, GOLD[3]); p.line(neckX - 8, neckY - 1, neckX + 8, neckY - 1, GOLD[2]);
  p.line(neckX - 8, neckY, neckX + 8, neckY, GOLD[1]);
  p.px(neckX - 4, neckY - 2, GOLD[4]); p.px(neckX - 3, neckY - 2, GOLD[4]);
  head(p, g, hx, hy, P, meta);

  // --- 7. Schwung-Schleier
  if (ex.smear) smear(p, g, shF.x, shF.y, ex.smear[0], ex.smear[1], 30 * S, 74 * S, flat ? gy - FLAT_TOP : -1e9);

  // --- 8. vorderer Arm mit Schwert
  limb(p, shF.x, shF.y, armF.jx, armF.jy, 6.5 * S, 5.5 * S, [OBS[1], OBS[2], OBS[3], OBS[4], OBS[5]]);
  limb(p, armF.jx, armF.jy, armF.ex, armF.ey, 6 * S, 5 * S, [ASH[0], ASH[1], ASH[2], ASH[3], ASH[4]]);
  crackLine(g, [[armF.jx, armF.jy + 1], [(armF.jx + armF.ex) / 2 + 1, (armF.jy + armF.ey) / 2], [armF.ex - 1, armF.ey - 2]], P, 1);
  // Ellbogenkachel (Gold)
  p.ellipse(armF.jx, armF.jy, 3.6, 3.4, GOLD[1]); p.ellipse(armF.jx - 0.5, armF.jy - 0.5, 2.4, 2.2, OBS[4]); p.px(armF.jx - 1, armF.jy - 1, SPEC);
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

// Rumpf: polierter Obsidian-Kürass, Goldbesatz, Wappen, glühendes Herz mit Rissen
function torso(p, g, along, P, meta) {
  for (let s = 0; s <= SPINE + 1; s += 0.5) {
    const t = s / SPINE;
    const sm = t * t * (3 - 2 * t);
    const hwB = (5.5 + 4.5 * sm) * S;
    const hwF = (5 + 5.5 * sm + (t > 0.45 && t < 0.95 ? 2 * Math.sin((t - 0.45) / 0.5 * Math.PI) : 0)) * S;
    const band = t > 0.355 && t < 0.39;
    const lame = t < 0.33 && Math.round(s * 2) % 7 === 0;
    for (let k = -hwB; k <= hwF; k += 0.5) {
      const rel = (k + hwB) / (hwB + hwF);
      // gewölbte Platte: Rücken im Oberlicht, Brust mit eigener Wölbung, Vorderkante im Schatten
      let i = rel < 0.07 ? 3 : rel < 0.3 ? 4 : rel < 0.46 ? 3 : rel < 0.62 ? 2 : rel < 0.84 ? (t > 0.45 ? 3 : 2) : rel < 0.93 ? 1 : 0;
      if (t > 0.5 && t < 0.92 && rel > 0.64 && rel < 0.74) i = 4; // Brustwölbung im Fülllicht
      if (t > 0.82 && rel > 0.14 && rel < 0.5) i = Math.min(5, i + 1); // obere Brust
      const [x, y] = along(s, k);
      if (band) p.px(x, y, rel < 0.3 ? GOLD[4] : rel < 0.75 ? GOLD[3] : GOLD[1]);
      else if (lame) p.px(x, y, rel < 0.85 ? OBS[0] : VOID);
      else p.px(x, y, OBS[i]);
    }
    // Goldkante an der Vorderseite der Brust
    if (t > 0.42 && t < 0.97) { const [x, y] = along(s, hwF - 0.5); p.px(x, y, t > 0.7 ? GOLD[2] : GOLD[1]); }
  }
  // Bauchschienen: Lichtkante unter jeder Fuge
  for (let s = 1; s < SPINE * 0.34; s += 4.5) {
    for (let k = -5.5; k <= 8; k += 0.5) { const [x, y] = along(s - 0.5, k); p.px(x, y, k < 0 ? OBS[5] : OBS[4]); }
  }
  // Goldbesatz am Halsausschnitt
  for (let k = -8; k <= 9; k += 0.5) {
    const [x, y] = along(SPINE - 0.5 - Math.abs(k - 0.5) * 0.4, k);
    p.px(x, y, k < -2 ? GOLD[4] : k < 3 ? GOLD[3] : GOLD[2]);
    const [x2, y2] = along(SPINE - 1.5 - Math.abs(k - 0.5) * 0.4, k);
    p.px(x2, y2, GOLD[1]);
  }
  // Glanzpunkte (Licht von links oben)
  { const [x, y] = along(SPINE - 4.5, -8); p.px(x, y, SPEC); p.px(x + 1, y, OBS[5]); p.px(x, y + 1, OBS[5]); }
  { const [x, y] = along(SPINE * 0.62, -5); p.px(x, y, SPEC); }
  { const [x, y] = along(SPINE * 0.74, 7); p.px(x, y, SPEC); }
  // Kronen-Wappen auf der Brust (Gold)
  const [cx, cy] = along(SPINE * 0.74, 1);
  p.rect(cx - 3, cy, 7, 2, GOLD[2]); p.rect(cx - 3, cy, 7, 1, GOLD[3]);
  p.px(cx - 3, cy - 1, GOLD[3]); p.px(cx - 3, cy - 2, GOLD[4]);
  p.px(cx, cy - 1, GOLD[3]); p.px(cx, cy - 2, GOLD[3]); p.px(cx, cy - 3, GOLD[4]);
  p.px(cx + 3, cy - 1, GOLD[2]); p.px(cx + 3, cy - 2, GOLD[3]);
  p.px(cx - 1, cy + 2, GOLD[1]); p.px(cx + 1, cy + 2, GOLD[1]);
  p.px(cx, cy + 1, MAG[3]); g.max(cx, cy + 1, 2);
  // Herz: glühender Kern im Panzer
  const [kx, ky] = along(SPINE * 0.5, 0.5);
  const r = (1.6 + P.core * 0.6) * S;
  p.ellipse(kx, ky, r + 1.5, r + 1, OBS[0]);
  p.ellipse(kx, ky, r, r * 0.85, MAG[2]);
  p.px(kx, ky, MAG[4]);
  g.ellipse(kx, ky, r + 0.4, r, 1);
  g.ellipse(kx, ky, Math.max(0.5, r - 0.6), Math.max(0.5, r - 0.8), 2 + (P.crack > 0.55 ? 1 : 0));
  g.max(kx, ky, P.core > 1.4 || P.crack > 0.9 ? 4 : 3);
  meta.chest = { x: kx, y: ky };
  // Risse vom Herz durch den Panzer
  const cracks = [
    [[0.5, 0.5], [0.58, -4], [0.66, -4.5], [0.78, -9]],
    [[0.5, 0.5], [0.42, 4.5], [0.3, 3.2], [0.18, 7]],
    [[0.5, 0.5], [0.62, 5], [0.74, 8.5]],
    [[0.5, 0.5], [0.38, -4], [0.26, -6.5]],
  ];
  cracks.forEach((c, n) => {
    if (n > 1 && P.crack < 0.5) return;
    const pts = c.map(([s, k]) => along(s * SPINE, k));
    for (let i = 0; i < pts.length - 1; i++) {
      p.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], i === 0 ? MAG[3] : MAG[2]);
      g.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], (i === 0 ? 2 : 1) + (P.crack > 0.9 ? 1 : 0));
    }
  });
}

// Hinterer Rock: lange Obsidianschöße, hinter den Beinen
function skirtBack(p, g, hipX, hipY, gy, P) {
  const len = Math.min(33, gy - hipY - 8);
  for (let i = 0; i < 14; i++) {
    const x0 = hipX - 13 + i;
    const L = len - Math.abs(i - 2.5) * 0.8 + (hash2(i, 3, 7) * 2 | 0);
    for (let j = 0; j < L; j++) {
      const v = j / L;
      const x = x0 - v * v * (4 + P.cape * 9) + Math.sin(P.capeT + i * 0.7 + v * 3) * v;
      p.px(x, hipY + j, j > L - 2 ? GOLD[2] : i < 2 ? ROBE[3] : ROBE[i % 3 === 0 ? 1 : 2]);
    }
  }
}

function leg(p, g, hx, hy, L, back, P, dang) {
  const thigh = back ? [VOID, OBS[0], OBS[1], OBS[2]] : [OBS[0], OBS[2], OBS[3], OBS[4], OBS[5]];
  const shin = back ? [VOID, OBS[0], OBS[1], OBS[2]] : [OBS[1], OBS[2], OBS[3], OBS[4], OBS[5]];
  limb(p, hx, hy, L.jx, L.jy, 7.5 * S, 6 * S, thigh);
  limb(p, L.jx, L.jy, L.ex, L.ey - 2, 6 * S, 5 * S, shin);
  // Kniekachel mit Dorn (verkohlter Rand, Knochenkuppel)
  p.ellipse(L.jx, L.jy, 3.9, 3.4, back ? GOLD[0] : GOLD[1]); p.ellipse(L.jx - 0.5, L.jy - 0.5, 2.6, 2.1, back ? OBS[1] : OBS[4]);
  if (!back) { p.px(L.jx - 1, L.jy - 1, SPEC); p.px(L.jx + 4, L.jy, GOLD[2]); p.px(L.jx + 5, L.jy, GOLD[3]); p.px(L.jx + 6, L.jy - 1, GOLD[4]); }
  // Glutnaht an der Schiene
  for (const f of [0.45, 0.62]) {
    const mx = L.jx + (L.ex - L.jx) * f, my = L.jy + (L.ey - 2 - L.jy) * f;
    p.px(mx, my, back ? MAG[1] : MAG[3]); g.max(mx, my, back ? 0 : 1 + (P.crack > 0.6 ? 1 : 0));
  }
  // Sabaton: spitz, im Schweben nach unten gerichtet
  const ex = L.ex, ey = L.ey;
  const s = back ? [VOID, OBS[0], OBS[1], OBS[2]] : [OBS[1], OBS[2], OBS[3], OBS[5]];
  if (dang < 0.5) {
    p.rect(ex - 4, ey - 4, 12, 4, s[1]); p.rect(ex - 4, ey - 4, 12, 1, s[3]); p.rect(ex - 3, ey - 6, 7, 2, s[2]); p.rect(ex - 3, ey - 6, 7, 1, s[3]);
    p.px(ex + 8, ey - 1, s[2]); p.px(ex + 9, ey - 1, back ? s[1] : GOLD[3]); p.px(ex + 8, ey - 2, s[2]);
    p.rect(ex - 4, ey - 1, 1, 1, s[0]);
    if (!back) { p.rect(ex + 1, ey - 3, 4, 1, GOLD[2]); }
  } else {
    p.rect(ex - 3, ey - 7, 6, 7, s[1]); p.rect(ex - 3, ey - 7, 1, 7, s[3]);
    p.px(ex + 1, ey, s[2]); p.px(ex + 1, ey + 1, s[2]); p.px(ex + 2, ey + 2, back ? s[1] : GOLD[3]);
  }
}

// Gürtel mit Goldschnalle, Kettengehänge, Wappenrock vorn (schwingt), Seitenschöße
function belt(p, g, hipX, hipY, gy, P, legF, dang) {
  const sway = (legF.jx - hipX - 6) * 0.25 + Math.sin(P.capeT) * 0.6 + P.robe;
  // Seitenschöße (Obsidianplatten über den Oberschenkeln)
  for (let i = 0; i < 5; i++) {
    const tx = hipX - 12 + i * 4.7, len = 14 - Math.abs(i - 1.5) * 1.6;
    for (let j = 0; j < len; j++) {
      const x = tx + sway * 0.3 * (j / len) * (i / 4);
      p.rect(x, hipY + j, 4, 1, j === 0 ? OBS[5] : j > len - 2 ? GOLD[2] : i === 0 ? OBS[4] : i < 3 ? OBS[3] : OBS[2]);
      p.px(x + 4, hipY + j, OBS[0]);
    }
  }
  // Wappenrock: karminrot mit Goldborte, hängt bis fast zum Boden
  const L = Math.max(8, gy - hipY - 3 - P.kneel * 10);
  for (let j = 0; j < L; j++) {
    const v = j / L;
    const cx = hipX + 2.5 + sway * v * v * 1.6 + (dang > 0.1 ? -v * v * 4 * dang : 0);
    const w = (3 + v * 1.2) * S;
    for (let k = -w; k <= w; k += 0.5) {
      const e = w - Math.abs(k);
      let c = e < 0.6 ? GOLD[k < 0 ? 3 : 2] : k < -w * 0.45 ? ROBE[4] : k < 0 ? ROBE[3] : k > w * 0.45 ? ROBE[1] : ROBE[2];
      if (j > L - 2) c = j === L - 1 ? GOLD[2] : GOLD[3];
      p.px(cx + k, hipY + j, c);
    }
    // gestickte Krone mit Glutflamme
    const cj = Math.round(L * 0.28);
    if (j === cj) {
      p.px(cx - 2, hipY + j, GOLD[3]); p.px(cx, hipY + j, GOLD[3]); p.px(cx + 2, hipY + j, GOLD[2]);
      p.rect(cx - 2, hipY + j + 1, 5, 1, GOLD[2]);
      p.px(cx - 2, hipY + j - 1, GOLD[4]); p.px(cx, hipY + j - 2, GOLD[4]); p.px(cx + 2, hipY + j - 1, GOLD[3]);
      g.max(cx, hipY + j - 3, 1);
    }
  }
  if (dang > 0.1) for (let k = -3; k <= 4; k++) g.max(hipX + 3 + sway * 1.6 - 4 * dang + k, hipY + L, 1);
  // Gürtel
  p.rect(hipX - 13, hipY - 4, 27, 5, OBS[1]); p.rect(hipX - 13, hipY - 4, 27, 1, GOLD[3]); p.rect(hipX - 13, hipY, 27, 1, GOLD[1]);
  p.rect(hipX - 13, hipY - 3, 5, 2, OBS[3]);
  // Schnalle: Knochenschädel mit Glutaugen
  const bx = hipX + 3, by = hipY - 7;
  p.rect(bx - 4, by, 9, 8, GOLD[1]); p.rect(bx - 3, by, 7, 7, OBS[4]); p.rect(bx - 3, by, 7, 1, OBS[5]); p.rect(bx + 3, by + 1, 1, 6, OBS[2]);
  p.rect(bx - 2, by + 5, 5, 2, OBS[3]); p.px(bx - 1, by + 6, VOID); p.px(bx + 1, by + 6, VOID);
  p.px(bx - 1, by + 3, MAG[3]); p.px(bx + 1, by + 3, MAG[3]); g.max(bx - 1, by + 3, 3); g.max(bx + 1, by + 3, 3); g.max(bx, by + 2, 1);
  // Kettengehänge an der Hüfte
  for (let k = 0; k < 10; k++) {
    const x = hipX - 11 + k * 0.95 + Math.sin(P.capeT + k * 0.5) * 0.3, y = hipY + 2 + Math.sin(k / 9 * Math.PI) * 4.5;
    p.px(x, y, k % 2 ? IRON[3] : IRON[2]);
  }
}

function bracer(p, g, arm, back) {
  const t0 = 0.42, t1 = 0.86;
  const x0 = arm.jx + (arm.ex - arm.jx) * t0, y0 = arm.jy + (arm.ey - arm.jy) * t0;
  const x1 = arm.jx + (arm.ex - arm.jx) * t1, y1 = arm.jy + (arm.ey - arm.jy) * t1;
  limb(p, x0, y0, x1, y1, 6.5 * S, 6 * S, back ? [VOID, OBS[0], OBS[1], OBS[2]] : [GOLD[1], OBS[2], OBS[3], OBS[4], OBS[5]]);
  if (!back) { const mx = (x0 + x1) / 2, my = (y0 + y1) / 2; p.px(mx, my, MAG[4]); g.max(mx, my, 2); }
}

// Klauenhandschuh (Obsidian)
function claw(p, g, x, y, ramp, open, front = false) {
  p.rect(x - 4, y - 3, 8, 6, ramp[1]); p.rect(x - 4, y - 3, 8, 1, ramp[3]); p.rect(x + 3, y - 2, 1, 5, ramp[0]);
  if (front) { p.px(x - 3, y - 3, ramp[3]); p.px(x - 4, y - 2, ramp[2]); p.rect(x - 3, y + 1, 4, 1, GOLD[2]); }
  if (open) for (let k = -2; k <= 2; k += 2) { p.line(x + k * 0.9, y - 3, x + k * 1.8, y - 8, ramp[2]); p.px(x + k * 1.8, y - 8, GOLD[3]); }
  else { p.px(x + 4, y + 2, GOLD[3]); p.px(x + 4, y + 1, ramp[2]); p.px(x + 4, y + 3, GOLD[2]); }
}

// Gesprengte Kette am hinteren Handgelenk, schwingt nach
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

// Schulterstück: drei Lagen Obsidian mit Goldkante; vorne mit Dornen und Glutstein
function pauldron(p, g, x, y, rx, ry, front, P) {
  if (!front) {
    // geschwungene Dornen hinter dem Kopf (Silhouette)
    // Knochendornen (wie Rippen eines Riesen) ragen über die Schulter
    limb(p, x - 1, y - 2, x - 6, y - 16, 4.5, 2, [OBS[1], OBS[2], OBS[3], OBS[4]]);
    limb(p, x - 6, y - 16, x - 5, y - 24, 2, 0.6, [OBS[2], OBS[3], OBS[4], SPEC]);
    p.px(x - 5, y - 25, MAG[4]); g.max(x - 5, y - 25, 3); g.max(x - 5, y - 26, 1);
    limb(p, x - 5, y - 1, x - 13, y - 11, 3.2, 1.2, [OBS[0], OBS[1], OBS[2], OBS[3]]);
    p.px(x - 13, y - 12, MAG[3]); g.max(x - 13, y - 12, 2);
  }
  const R = front ? [OBS[1], OBS[2], OBS[3], OBS[4], OBS[5]] : [VOID, OBS[0], OBS[1], OBS[2], OBS[2]];
  const G = front ? GOLD : [GOLD[0], GOLD[0], GOLD[1], GOLD[1], GOLD[2]];
  // untere Lage (Lamelle) mit Goldkante, dann die Kuppel mit Goldrand
  {
    const yy = y + 4;
    p.ellipse(x + 0.5, yy, rx - 0.5, ry - 1, G[1]);
    p.ellipse(x + 0.5, yy - 0.5, rx - 1.5, ry - 2, R[1]);
    p.ellipse(x, yy - 1, rx - 2.5, ry - 3, R[2]);
  }
  p.ellipse(x, y, rx, ry, G[1]);
  p.ellipse(x - 0.3, y - 0.3, rx - 1, ry - 1, R[0]);
  p.ellipse(x - 0.6, y - 0.6, rx - 1.6, ry - 1.6, R[1]);
  p.ellipse(x - 1.2, y - 1.2, rx - 2.6, ry - 2.4, R[2]);
  p.ellipse(x - 2, y - 2, rx - 4.2, ry - 3.4, R[3]);
  p.ellipse(x - 2.5, y - 2.6, Math.max(1, rx - 6.2), Math.max(0.8, ry - 4.6), R[4]);
  // Goldrand oben (im Licht), Kamm über der Kuppel
  for (let a = Math.PI * 1.02; a <= Math.PI * 1.75; a += 0.08) p.px(x + Math.cos(a) * (rx - 0.5), y + Math.sin(a) * (ry - 0.5), G[a < Math.PI * 1.4 ? 4 : 3]);
  if (front) {
    p.px(x - rx + 2, y + ry - 1, GOLD[4]); p.px(x - rx + 3, y + ry - 1, GOLD[4]);
    p.px(x - 5, y - ry + 2, SPEC); p.px(x - 4, y - ry + 2, SPEC); p.px(x - 6, y - ry + 3, SPEC);
    // Glutriss quer über die Kuppel
    const cr = [[x - 5, y + 1], [x - 2, y - 1], [x + 1, y + 0.5], [x + 4, y - 1.5]];
    for (let i = 0; i < 3; i++) { p.line(cr[i][0], cr[i][1], cr[i + 1][0], cr[i + 1][1], MAG[2]); g.line(cr[i][0], cr[i][1], cr[i + 1][0], cr[i + 1][1], 1 + (P.crack > 0.55 ? 1 : 0)); }
    // Dorn vorn (Silhouette)
    limb(p, x + 2, y - ry + 2, x + 6, y - ry - 6, 2.4, 0.8, [OBS[2], OBS[3], OBS[4], SPEC]); p.px(x + 6, y - ry - 7, MAG[3]); g.max(x + 6, y - ry - 7, 2);
  }
}

// Langes Haar hinter dem Kopf (fällt über den Rücken, weht mit dem Mantel)
function hairBack(p, g, hx, hy, P) {
  for (let s = 0; s < 10; s++) {
    const x0 = hx + 1 + s * 0.55, y0 = hy + 3 + s * 0.25;
    const L = 19 + (hash2(s, 1, 9) * 8 | 0);
    for (let j = 0; j < L; j++) {
      const v = j / L;
      const x = x0 - v * (6 + P.cape * 7 + P.hair * 9) + Math.sin(P.capeT * 1.2 + v * 4 + s) * v * 1.4;
      const y = y0 + j * (1 - P.hair * 0.5) - v * v * P.hair * 7;
      p.px(x, y, s === 0 || s === 5 ? HAIR[3] : s < 3 ? HAIR[2] : s < 7 ? HAIR[1] : HAIR[0]);
      if (s === 0 && j < L * 0.5) p.px(x - 1, y, HAIR[4]);
      if (j > L - 3 && P.crack > 0.5 && hash2(s, j, 4) < 0.5) g.max(x, y, 0);
    }
  }
}

// Kopf als Pixelkarte (15 × 21), Blick nach rechts, 3/4-Ansicht. Licht von vorn oben:
// Stirn, Nasenrücken und Wangenknochen hell, schwere dunkle Brauen über tiefen Höhlen
// mit weißglühenden Augen, eingefallene Wangen, schmaler harter Mund, Aschebart.
// h/H/L Haar, o Kontur, d/s/S/T/U Haut (dunkel → hell), v Höhle, E/e Augen (Kern/Glut),
// m Mund, b/B Bart, n Nasenspitze
const HEAD = [
  '.....hhhhh.....',
  '...hhHHLLHhh...',
  '..hHHLLLLLHHh..',
  '.hHHLoSSSSSSSo.',
  '.hHHoSTTUUUUUTo',
  'hHHhoSTUUUUUUUo',
  'hHhosSTTUUUUTTo',
  'hHhosdooooSoooo',
  'hHhosvEevTdvEeo',
  'hHhossvvsUTsvvn',
  'hHhhsSTTSUUTSTn',
  'hHhhsdSSSTTdddo',
  'hHhhsddSSTTTSso',
  '.hHhhsdommmmmdo',
  '.hHhhsdSSTTSdo.',
  '..hhhhbBBLBBb..',
  '...hhhbBBLBBb..',
  '....hhbBBLBb...',
  '.....hbBBBb....',
  '......bBBb.....',
  '.......bb......',
];
const MOUTH_ROW = 13;
function head(p, g, hx, hy, P, meta) {
  const j = Math.round(P.jaw * 2);
  const eyeOn = P.eye > 0.1, eyeHot = P.eye > 0.6;
  const C = {
    h: HAIR[0], H: HAIR[1], L: HAIR[3], W: HAIR[4],
    o: SKIN[0], d: SKIN[1], s: SKIN[2], S: SKIN[3], T: SKIN[4], U: SKIN[5], n: SKIN[4],
    v: VOID, m: VOID, b: HAIR[1], B: HAIR[2],
    E: eyeOn ? '#fff0b0' : SKIN[0], e: eyeOn ? MAG[3] : SKIN[0],
  };
  for (let r = 0; r < HEAD.length; r++) {
    const row = HEAD[r];
    const dy = r > MOUTH_ROW ? r + j : r;
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === '.') continue;
      p.px(hx + c, hy + dy, C[ch]);
      if (r === MOUTH_ROW && ch === 'm') for (let q = 1; q <= j; q++) p.px(hx + c, hy + r + q, VOID);
    }
    if (r === MOUTH_ROW && j > 0) for (let q = 1; q <= j; q++) { p.px(hx + 2, hy + r + q, HAIR[1]); p.px(hx + 3, hy + r + q, HAIR[0]); p.px(hx + 4, hy + r + q, HAIR[0]); p.px(hx + 5, hy + r + q, SKIN[1]); p.px(hx + 13, hy + r + q, SKIN[2]); }
  }
  // Augen: glühen weiß-golden
  if (eyeOn) {
    g.px(hx + 6, hy + 8, eyeHot ? 4 : 3); g.px(hx + 7, hy + 8, eyeHot ? 3 : 2);
    g.px(hx + 12, hy + 8, eyeHot ? 4 : 3); g.px(hx + 13, hy + 8, eyeHot ? 3 : 2);
    if (P.eye > 0.8) { g.max(hx + 5, hy + 8, 1); g.max(hx + 8, hy + 8, 1); g.max(hx + 11, hy + 8, 1); g.max(hx + 6, hy + 9, 0); g.max(hx + 12, hy + 9, 0); }
    if (P.crack > 0.9) { g.max(hx + 4, hy + 8, 1); g.max(hx + 3, hy + 7, 0); g.max(hx + 14, hy + 7, 0); }
  }
  meta.eye = { x: hx + 12, y: hy + 8 };
  // Mund: Glutspalt
  if (j) { g.px(hx + 9, hy + MOUTH_ROW, P.jaw > 0.7 ? 3 : 2); g.px(hx + 10, hy + MOUTH_ROW + j - 1, 2); if (j > 1) g.px(hx + 9, hy + MOUTH_ROW + 1, 4); }
  else g.max(hx + 9, hy + MOUTH_ROW, 0);
  meta.mouth = { x: hx + 10, y: hy + MOUTH_ROW };
  // Glutrisse im Gesicht
  // (nur ab Gestalt 2, und an Schläfe und Wange vorbei an Augen und Mund)
  if (P.crack > 0.5) crackLine(g, [[hx + 4, hy + 4], [hx + 5, hy + 7], [hx + 4, hy + 11]], P, 0);
  if (P.crack > 0.9) crackLine(g, [[hx + 11, hy + 10], [hx + 12, hy + 12]], P, 0);
  g.max(hx + 9, hy + 18 + j, 0);
  // Krone
  if (P.crownDrop < 0.02) crown(p, g, hx, hy + 2, 0, P);
  meta.head = { x: hx + 8, y: hy - 2 };
  meta.crown = { x: hx + 8, y: hy - 1 };
}

// Krone: Goldreif, fünf Zacken (vorn höher), Glutsteine, Flammen über den Spitzen.
// tilt kippt die Krone (Sturz), lit=false: keine Flammen mehr
function crown(p, g, x, y, tilt, P, lit = true) {
  const pt = (dx, dy) => [x + dx * Math.cos(tilt) - dy * Math.sin(tilt), y + dx * Math.sin(tilt) + dy * Math.cos(tilt)];
  for (let i = 0; i <= 15; i += 0.5) {
    for (let r = -0.5; r <= 1.5; r += 0.5) {
      const [px, py] = pt(i, r);
      p.px(px, py, r < 0 ? (i < 6 ? CROWNC[4] : CROWNC[3]) : r < 1 ? (i < 4 ? CROWNC[3] : CROWNC[2]) : CROWNC[1]);
    }
  }
  const spikes = [[1, 6], [4.5, 9], [8, 13], [11.5, 9.5], [15, 6.5]];
  const flames = [];
  for (const [dx, h] of spikes) {
    for (let k = 1; k <= h; k += 0.5) {
      const w = k < h - 1.5 ? 1 : k < h - 0.5 ? 0.5 : 0;
      for (let q = -w; q <= w; q += 0.5) {
        const [px, py] = pt(dx + q, -k);
        p.px(px, py, k >= h - 0.5 ? CROWNC[4] : q < 0 ? CROWNC[4] : q > 0.4 ? CROWNC[2] : CROWNC[3]);
      }
    }
    const [tx, ty] = pt(dx, -h - 1);
    flames.push([tx, ty, h]);
  }
  // Glutsteine im Reif
  for (const dx of [4, 8, 12]) {
    const [px, py] = pt(dx, 0.5); p.px(px, py, MAG[4]); g.max(px, py, dx === 8 ? 4 : 3);
    if (dx === 8) { const [qx, qy] = pt(dx, -1.5); p.px(qx, qy, MAG[4]); g.max(qx, qy, 3); const [rx, ry] = pt(dx, -3.5); p.px(rx, ry, MAG[3]); g.max(rx, ry, 2); }
  }
  // Krone glüht selbst (Schmiedeglut): Reif und Zacken auf der Leucht-Ebene
  for (let i = 0; i <= 15; i += 1) { const [px, py] = pt(i, -0.5); g.max(px, py, i % 2 ? 1 : 0); }
  for (const [dx, h] of spikes) for (let k = h - 3; k <= h; k += 1) { const [px, py] = pt(dx, -k); g.max(px, py, k > h - 1.5 ? 3 : 1); }
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

// Königsmantel: an den Schultern befestigt, weht nach hinten. Außen dunkles Karmin mit
// Faltenlicht, Goldsaum; in Gestalt 2/3 zerfasert der untere Teil zu Rauch mit Glut.
function cape(p, g, tx, ty, gy, P, dang) {
  const N = 62;
  const lift = 0.4 + P.hover / 29;
  const smoke = Math.min(1, P.wing * 1.2);
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const sx = tx - 13 + i * 0.5;
    const top = ty + Math.abs(u - 0.5) * 4;
    const len = Math.min(84, gy - ty + 10) - Math.abs(u - 0.35) * 20 + (hash2(i, 1, 13) * 7 | 0);
    for (let j = 0; j < len; j++) {
      const v = j / len;
      const x = sx - P.cape * 29 * v * v - (1 - u) * 12 * v - v * 6 + Math.sin(P.capeT * 1.3 + v * 4.5 + i * 0.5) * 3 * v;
      const y = top + j * (1 - lift * v * 0.55);
      // Ende zerfasert (in Gestalt 2/3 deutlich stärker)
      const fray = 0.86 - smoke * 0.3;
      if (v > fray && hash2((i >> 1) * 7 + j, Math.round(P.capeT * 2), 11) < (v - fray) * 3.2) continue;
      const fold = Math.sin(i * 0.5 + v * 2 - P.capeT * 0.5);
      let shade = u < 0.08 ? 4 : u > 0.9 ? 0 : (fold > 0.4 ? 3 : fold < -0.4 ? 1 : 2) - (v > 0.7 ? 1 : 0);
      shade = Math.max(0, Math.min(5, shade));
      let c;
      const smokeV = smoke > 0 ? (v - (0.72 - smoke * 0.2)) / 0.2 : -1;
      if (smokeV > 0 && hash2(i, j, 21) < smokeV) c = SMOKE[Math.min(5, shade + 1)];
      else if (j >= len - 2 - (hash2(i, 5, 3) * 1.5 | 0) && v <= fray) c = j === Math.floor(len) - 1 ? GOLD[1] : GOLD[shade > 2 ? 3 : 2];
      else c = ROBE[shade];
      p.px(x, y, c);
      if (v > 0.25 && u > 0.05) p.px(x - 1, y, c);
      // Glutfunken im Stoff
      if (v > 0.65 && hash2(i, j, 17) < 0.02 + P.crack * 0.03 + smoke * 0.03) g.max(x, y, hash2(i, j, 19) < 0.4 ? 2 : 1);
    }
  }
  // Goldene Mantelborte an der Außenkante
  for (let j = 0; j < 62; j += 0.5) {
    const v = j / 70;
    const x = tx - 13 - P.cape * 29 * v * v - 12 * v - v * 6 + Math.sin(P.capeT * 1.3 + v * 4.5) * 3 * v;
    const y = ty + 1.5 + j * (1 - (0.4 + P.hover / 29) * v * 0.55);
    if (y > gy - 4 || (smoke > 0 && v > 0.6)) break;
    p.px(x, y, v < 0.4 ? GOLD[3] : GOLD[2]);
  }
  // Hoher Stehkragen hinter dem Kopf: Knochenplatten, nach oben aufgefächert, Glutkante –
  // rahmt Kopf und Krone und macht die Silhouette deutlich höher
  for (let i = 0; i < 17; i++) {
    const u = i / 16;
    const flare = (u - 0.35) * 5;
    const top = ty - 20 - Math.sin(u * Math.PI) * 4 + Math.abs(u - 0.3) * 6;
    for (let y = top; y < ty + 3; y++) {
      const v = (y - top) / (ty + 3 - top);
      const x = tx - 6 + i * 1.05 + flare * (1 - v);
      let c = i < 2 ? OBS[4] : i < 4 ? OBS[3] : i < 9 ? ROBE[2] : ROBE[1];
      if (i % 4 === 0 && i > 0) c = OBS[2];
      if (y < top + 1) c = GOLD[3]; else if (y < top + 2) c = i < 6 ? OBS[5] : OBS[3];
      p.px(x, y, c);
      if (y < top + 1 && P.crack > 0.2) g.max(x, y, i < 8 ? 1 : 0);
    }
  }
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
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
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
      }
      // Flammenzunge an der Spitze
      const hgt = (2 + P.wingFire * 8) * s;
      const tx = ox + Math.cos(a) * L, ty = oy + Math.sin(a) * L * sq;
      for (let k = 0; k < hgt; k++) {
        const kk = k / hgt;
        g.max(tx + Math.cos(a) * k * 0.6 + Math.sin(k + P.wingT * 3) * 0.6, ty + Math.sin(a) * k * 0.6 - k * 0.5, kk < 0.3 ? 4 : kk < 0.6 ? 3 : 2);
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
        }
      }
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
  for (let y = L.y0; y <= L.y1; y++) for (let x = L.x0; x <= L.x1; x++) {
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
  const rx = 6 + k * 16, ry = 1 + k * 8;
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
function rimLight(L, x0, y0, x1, y1) {
  const B = L.base, G = L.glow;
  const opaque = (x, y) => x >= 0 && y >= 0 && x < W && y < H && B[y * W + x] !== 0;
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

function finish(L, fx, meta, inferno, rim = true) {
  let { x0, y0, x1, y1 } = L;
  if (x1 < 0) { x0 = y0 = 0; x1 = y1 = 1; }
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W - 1, x1); y1 = Math.min(H - 1, y1);
  if (rim) rimLight(L, x0, y0, x1, y1);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const ramp = inferno ? INFc : EMBc;
  const toCanvas = (glow) => {
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
  const baseC = toCanvas(false);
  const f = buildFrame(cw, ch, AX - x0, AY - y0, (pc) => pc.ctx.drawImage(baseC, 0, 0));
  f.glow = new GlowFrame(toCanvas(true), AX - x0, AY - y0);
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
function deathFrame(P, form, fx) {
  const Q = withForm(P, form);
  const L = layers();
  const p = new Pen(L), g = new GlowPen(L);
  const meta = drawFigure(p, g, { ...Q, noSword: 1, crownDrop: Math.max(Q.crownDrop, Q.ash > 0 ? 0.03 : 0) }, {});
  // Körper-Grenzen für die Zerfallsfront
  let yTop = H, yBot = 0;
  for (let y = L.y0; y <= L.y1; y++) for (let x = L.x0; x <= L.x1; x++) if (L.base[y * W + x]) { if (y < yTop) yTop = y; if (y > yBot) yBot = y; }
  dissolve(L, Q.ash, yTop, yBot);
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
