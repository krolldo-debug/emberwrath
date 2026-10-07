import { makeCanvas, outlineCanvas } from '../gfx/PixelCanvas.js';
import { SpriteFrame, Animation } from '../gfx/Sprite.js';
import { hash2 } from '../core/math.js';

// Mutter Fäulnis – Boss des Sporenschlunds (Stufe 32).
//
// Riesige, halb pflanzliche Brutmutter: ein aufgeblähter, geäderter Pilzleib
// sitzt auf einem Teppich aus Wurzelsträngen, trägt leuchtende Sporensäcke,
// kleine Pilze auf dem Rücken und vorn einen gekrümmten, fahlen Oberkörper mit
// schmalem Schädel unter einem breiten Hut (Lamellen, Warzen, Hyphenfäden).
// Zwei lange Ranken-Arme mit Dornen und Wurzelkrallen.
//
// Alles wird als implizite Formen in einen Uint32-Puffer gezeichnet (schnell,
// drehbar), danach Randlicht (oben/links hell, rechts violetter Rückstrahl) und
// die übliche selektive Outline. Schlüsselposen werden weich interpoliert.
// Leucht-Ebenen: `glow` (Säcke/Augen grün, Lamellen/Adern violett) und
// `glowEnraged` für Phase 3 (Säcke/Augen magenta, Lamellen grün).
// Blickrichtung rechts, Anker = Bodenmitte unter dem Leib. Frames sind auf ihren
// Inhalt zugeschnitten (Anker entsprechend versetzt), Leucht-Ebenen ebenso.
//
// meta (relativ zum Anker): head (Hutspitze), eye, mouth, cast (= Maul),
// hand / handB (Rankenhände), chest, sac (großer Rückensack), core (Leibmitte).
// fx: 'roar' | 'impact' | 'cast'.
const W = 196, H = 150, AX = 98, AY = 138, GY = AY;
const TAU = Math.PI * 2;

const hex = (h) => (0xff000000 | (parseInt(h.slice(5, 7), 16) << 16) | (parseInt(h.slice(3, 5), 16) << 8) | parseInt(h.slice(1, 3), 16)) >>> 0;
const R = (a) => a.map(hex);

// Materialrampen (dunkel -> hell)
const FLESH = R(['#140c16', '#261628', '#3c2240', '#583656', '#7a5272', '#a07a90', '#c8a8b2']);
const SKIN = R(['#0e120e', '#1c261e', '#304032', '#4a5c48', '#6a8062', '#94a888', '#c4d2b0']);
const CAP = R(['#0e070f', '#201024', '#361634', '#522046', '#742e54', '#9a4660', '#c2706c']);
const FACE = R(['#181a14', '#343a2c', '#58604a', '#848c70', '#b0b698', '#dadcc0']);
const SPOT = R(['#6a5a46', '#a4927a', '#d6c8a6', '#f4ecd4']);
const GILL = R(['#120c16', '#261c2e', '#3e3048', '#5c4a66', '#84708e', '#b4a2ba']);
const BARK = R(['#0c0a08', '#1a1610', '#2c2618', '#443a24', '#605234', '#847450']);
const MOSS = R(['#0c1a0c', '#183018', '#264a20', '#3a682a', '#5a903a']);
const SAC = R(['#08180c', '#103016', '#1a4e22', '#2e7c30', '#5aae44', '#a2de6c', '#e6ffbe']);
const SLIME = R(['#0c160a', '#162a12', '#24421a', '#3c6426', '#64923a']);
const BONE = R(['#3a3428', '#6a604a', '#a0947a', '#d4caac']);
const RIM_HI = [236, 244, 214], RIM_BIO = [160, 110, 232];

// Leucht-Rampen (5 Stufen) und Zuordnung je Phase
const GL = {
  green: ['#0e4a1c', '#22882e', '#5ad040', '#b4f478', '#f4ffd8'],
  violet: ['#2e0e52', '#6224b0', '#a458f4', '#dea8ff', '#fff2ff'],
  magenta: ['#4a0a40', '#9a1a88', '#ec48c8', '#ffa8ee', '#ffffff'],
};
const K_SAC = 0, K_GILL = 1, K_EYE = 2, K_SPORE = 3, K_VEIN = 4;
const SET_A = [GL.green, GL.violet, GL.green, GL.green, GL.violet].map(R);
const SET_B = [GL.magenta, GL.green, GL.magenta, GL.violet, GL.green].map(R);

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// Index in eine Rampe, sanft gerastert nur an den Stufenkanten
const sidx = (n, v, x, y) => clamp(Math.floor(clamp(v, 0, 1) * (n - 1) + 0.5 + (BAYER[((y & 3) << 2) | (x & 3)] - 0.5) * 0.7), 0, n - 1);
const shade = (ramp, v, x, y) => ramp[sidx(ramp.length, v, x, y)];

// ---------------------------------------------------------------- Zeichenpuffer

class Painter {
  constructor() {
    this.b = new Uint32Array(W * H);
    this.g = new Uint32Array(W * H);
    this.e = new Uint32Array(W * H);
    this.clip = H; this.gk = 1;
  }
  px(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || x >= W || y < 0 || y >= this.clip || y >= H) return;
    const i = y * W + x;
    this.b[i] = c; this.g[i] = 0; this.e[i] = 0;
  }
  has(x, y) { x = Math.round(x); y = Math.round(y); return x >= 0 && x < W && y >= 0 && y < H && this.b[y * W + x] !== 0; }
  // Leuchtpixel (beide Phasen-Ebenen), Stufe 1..4, skaliert mit gk
  gl(x, y, k, lvl) {
    const v = lvl * this.gk;
    if (v < 0.5) return;
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || x >= W || y < 0 || y >= this.clip || y >= H) return;
    const l = Math.min(4, Math.round(v)), i = y * W + x;
    this.g[i] = SET_A[k][l]; this.e[i] = SET_B[k][l];
  }
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      const t = 1 - ((y - cy) * (y - cy)) / (ry * ry);
      if (t < 0) continue;
      const hw = rx * Math.sqrt(t);
      for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) this.px(x, y, c);
    }
  }
  line(x0, y0, x1, y1, c) {
    const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 1.5) || 1;
    for (let i = 0; i <= n; i++) this.px(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
  }
}

function blend(c, rgb, k) {
  const r = c & 255, g = (c >>> 8) & 255, b = (c >>> 16) & 255;
  return (0xff000000 | (Math.round(b + (rgb[2] - b) * k) << 16) | (Math.round(g + (rgb[1] - g) * k) << 8) | Math.round(r + (rgb[0] - r) * k)) >>> 0;
}

// Randlicht: helle Kante oben/links, violetter Rückstrahl rechts – die Figur
// liest sich so auch auf dunklem Pilzboden klar.
function rimPass(pt) {
  const b = pt.b, src = b.slice();
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x, c = src[i];
      if (!c) continue;
      const up = !src[i - W], left = !src[i - 1], right = !src[i + 1], ul = !src[i - W - 1];
      if (up || (left && ul)) b[i] = blend(c, RIM_HI, up && left ? 0.42 : 0.3);
      else if (right && y < GY - 3) b[i] = blend(c, RIM_BIO, 0.38);
      else if (left && y < GY - 3) b[i] = blend(c, RIM_HI, 0.16);
    }
  }
}

// ---------------------------------------------------------------- Geometrie-Helfer

function qbez(p0, c, p1, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, d = t * t;
    out.push({ x: a * p0.x + b * c.x + d * p1.x, y: a * p0.y + b * c.y + d * p1.y, t });
  }
  return out;
}

// Dicker Strang entlang einer Punktfolge. wf(t) = Breite, col(e, t, x, y) -> Farbe
// (e = -1 Schattenseite .. +1 Lichtseite, Licht von links oben).
function tube(pt, pts, wf, col) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len, ny = dx / len;
    if (nx + ny > 0) { nx = -nx; ny = -ny; } // n zeigt zum Licht
    const steps = Math.max(1, Math.ceil(len * 2));
    for (let s = 0; s < steps; s++) {
      const u = s / steps, t = a.t + (b.t - a.t) * u;
      const x = a.x + dx * u, y = a.y + dy * u;
      const hw = wf(t) / 2;
      for (let k = -hw; k <= hw + 0.01; k += 0.5) {
        const px = x + nx * k, py = y + ny * k;
        pt.px(px, py, col(k / (hw || 1), t, Math.round(px), Math.round(py)));
      }
    }
  }
}

// ---------------------------------------------------------------- Pose

const REST = {
  bx: 0, by: 0, breathe: 0, inflate: 0, crawl: 0,
  lean: 0.3, torsoY: 0, head: 0, headY: 0, jaw: 0.1, eye: 1,
  cap: 0.06, capLift: 0, capSquash: 0, gillOpen: 0,
  hFx: 22, hFy: 52, fCurl: -10, fClaw: 0.6,
  hBx: -60, hBy: 48, bCurl: 16, bClaw: 0.5,
  sacs: 1, pulse: 0, sacGlow: 1, swell: 0, torn: 0,
  rootT: 0, rootWig: 0.15, rootSpread: 1, hyT: 0, spT: 0, spore: 0.5, glow: 1, collapse: 0, plunge: 0,
};
const pose = (o = {}) => ({ ...REST, ...o });
const ease = (t) => t * t * (3 - 2 * t);
const linear = (t) => t;
const snap = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
const mix = (a, b, t) => { const o = {}; for (const k in REST) o[k] = a[k] + (b[k] - a[k]) * t; return o; };
function sample(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, p0] = keys[i], [t1, p1, e = ease] = keys[i + 1];
    if (t <= t1) return mix(p0, p1, e((t - t0) / (t1 - t0 || 1)));
  }
  return keys[keys.length - 1][1];
}

// ---------------------------------------------------------------- Teile

function layout(P) {
  const cx = AX - 6 + P.bx, cy = GY - 25 + P.by + P.collapse * 11;
  const rx = 31 * (1 + 0.045 * P.breathe + P.inflate) * (1 + 0.28 * P.collapse);
  const ry = 23 * (1 - 0.045 * P.breathe + P.inflate) * (1 - 0.5 * P.collapse);
  const B = { x: cx + rx * 0.36 + P.crawl, y: cy - ry * 0.6 };
  const TL = 29 + P.torsoY;
  const N = { x: B.x + Math.sin(P.lean) * TL, y: B.y - Math.cos(P.lean) * TL };
  return { cx, cy, rx, ry, B, N, TL };
}

// Wurzelteppich: Stränge wölben sich aus dem Boden (vorn oder hinten gezeichnet)
function roots(pt, P, L, front) {
  const bx = L.cx + 4, by = GY - 3;
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.15 + hash2(i, 1, 201) * 0.25;
    if ((Math.sin(a) > 0) !== front) continue;
    const L0 = (15 + hash2(i, 2, 201) * 16) * P.rootSpread;
    let x = bx + Math.cos(a) * L.rx * 0.72, y = by + Math.sin(a) * 5;
    const pts = [];
    for (let s = 0; s <= L0; s += 0.8) {
      const f = s / L0;
      const d = a + Math.sin(P.rootT + i * 1.3 + s * 0.22) * P.rootWig * (0.3 + f) + (hash2(i, 3, 201) - 0.5) * 0.5 * f;
      x += Math.cos(d) * 0.8; y += Math.sin(d) * 0.8 * 0.42;
      const hump = Math.sin(Math.min(1, f * 1.4) * Math.PI) * (2.5 + hash2(i, 4, 201) * 2) * (1 - P.collapse * 0.5);
      pts.push({ x, y: y - hump, t: f });
    }
    const w0 = 4.5 + hash2(i, 5, 201) * 2;
    tube(pt, pts, (t) => Math.max(1, w0 * (1 - t * 0.85)), (e, t, px, py) => {
      let v = 0.42 + e * 0.32 - (front ? 0 : 0.14);
      if (hash2(px, py, 203) < 0.06) v -= 0.2;
      if (e > 0.5 && t < 0.6 && hash2(px >> 1, py >> 1, 205) < 0.35) return MOSS[front ? 3 : 2];
      return shade(BARK, v, px, py);
    });
    // Knoten, leuchtende Spitze
    const k = pts[Math.floor(pts.length * 0.45)];
    if (k) { pt.px(k.x - 1, k.y - 1, BARK[4]); pt.px(k.x, k.y - 1, BARK[3]); }
    const tip = pts[pts.length - 1];
    if (tip && hash2(i, 6, 201) < 0.5) {
      pt.px(tip.x, tip.y, SAC[4]);
      pt.gl(tip.x, tip.y, K_SPORE, 2 + (Math.sin(P.pulse + i) > 0.4 ? 1 : 0));
    }
  }
}

function slimePool(pt, P, L) {
  const cx = L.cx + 6, cy = GY - 1;
  const rx = 40 * P.rootSpread + P.collapse * 8, ry = 5.5;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx - 2); x <= Math.ceil(cx + rx + 2); x++) {
      const u = (x - cx) / rx, v = (y - cy) / ry;
      const wob = 1 + 0.12 * Math.sin(u * 7 + 1.3) + 0.06 * Math.sin(u * 17);
      const d = Math.hypot(u, v) / wob;
      if (d > 1) continue;
      let c = d > 0.85 ? SLIME[1] : v < -0.3 ? SLIME[3] : SLIME[2];
      if (hash2(x, y, 211) < 0.05) c = SLIME[4];
      pt.px(x, y, c);
      if (hash2(x, y + Math.floor(P.pulse * 0.6), 213) < 0.025) pt.gl(x, y, K_SAC, 1.3);
    }
  }
}

// Kleine Pilze auf dem Rücken des Leibs
function backShrooms(pt, P, L) {
  const list = [[-0.78, -0.5, 7, -0.5], [-0.48, -0.86, 9, -0.2], [-0.98, -0.02, 5, -0.9], [-0.15, -0.98, 5, 0.15]];
  list.forEach(([u, v, h, tilt], i) => {
    const sx = L.cx + u * L.rx * (1 + 0.2 * v), sy = L.cy + v * L.ry;
    const sw = Math.sin(P.hyT + i * 1.9) * 0.08;
    const a = -Math.PI / 2 + tilt + sw;
    const hh = h * (1 - P.collapse * 0.4);
    const ex = sx + Math.cos(a) * hh, ey = sy + Math.sin(a) * hh;
    // Stiel
    const pts = qbez({ x: sx, y: sy }, { x: sx + Math.cos(a) * hh * 0.5 - tilt * 2, y: sy + Math.sin(a) * hh * 0.5 }, { x: ex, y: ey }, 10);
    tube(pt, pts, (t) => 2.6 - t * 0.6, (e, t, px, py) => shade(SPOT, 0.35 + e * 0.35, px, py));
    // Hut (klein, gedreht)
    const r = 3 + h * 0.28, ca = Math.cos(a + Math.PI / 2), sa = Math.sin(a + Math.PI / 2);
    for (let yy = -r - 2; yy <= r + 2; yy++) {
      for (let xx = -r - 2; xx <= r + 2; xx++) {
        const lx = xx * ca + yy * sa, ly = -xx * sa + yy * ca; // lokal: lx quer, ly entlang Stiel (neg = oben)
        const q = lx / r;
        if (Math.abs(q) >= 1) continue;
        const top = -r * 0.75 * Math.sqrt(1 - q * q), rim = 0.6 + q * q * 0.8;
        if (ly < top || ly > rim + 1) continue;
        const X = ex + xx, Y = ey + yy;
        if (ly > rim) { pt.px(X, Y, GILL[3]); pt.gl(X, Y, K_GILL, 1.5 + 0.5 * Math.sin(P.pulse + i)); continue; }
        const hgt = (rim - ly) / (rim - top + 0.01);
        pt.px(X, Y, shade(CAP, 0.3 + hgt * 0.45 - q * 0.25, X, Y));
        if (hash2(i * 13 + Math.round(lx), Math.round(ly), 221) < 0.12 && hgt > 0.3) pt.px(X, Y, SPOT[2]);
      }
    }
  });
}

const SACS = [
  { u: -0.44, v: -0.7, r: 9.5 },
  { u: -0.82, v: -0.1, r: 7 },
  { u: 0.02, v: -0.92, r: 5.5 },
  { u: -0.64, v: 0.44, r: 6.5 },
  { u: 0.66, v: 0.26, r: 6.5 },
  { u: 0.24, v: 0.52, r: 5 },
  { u: -0.16, v: -0.3, r: 4.5 },
  { u: -0.28, v: 0.3, r: 3.5 },
];

function sacPos(L, s) {
  const x = L.cx + s.u * L.rx * (1 + 0.2 * s.v), y = L.cy + s.v * L.ry;
  return { x: x + s.u * 2.2, y: y + s.v * 2 };
}

function body(pt, P, L) {
  const { cx, cy, rx, ry } = L;
  const pores = [];
  for (let y = Math.floor(cy - ry * 1.12); y <= GY - 1; y++) {
    const v = (y - cy) / ry;
    const wid = 1 + 0.2 * clamp(v, -1, 1);
    for (let x = Math.floor(cx - rx * 1.3); x <= Math.ceil(cx + rx * 1.3); x++) {
      const u = (x - cx) / (rx * wid);
      const a = Math.atan2(v, u);
      const lump = 1 + 0.05 * Math.sin(a * 5 + 0.7) + 0.03 * Math.sin(a * 9 + 2.1) + (v > 0.6 ? (v - 0.6) * 0.5 : 0);
      const d = Math.hypot(u, v) / lump;
      if (d > 1) continue;
      const nz = Math.sqrt(Math.max(0, 1 - d * d)), nx = u / lump, ny = v / lump;
      let lam = 0.52 + (-0.5 * nx - 0.62 * ny) * 0.5 + nz * 0.18;
      if (v > 0.3) lam -= (v - 0.3) * 0.55;
      if (v > 0.15) lam += Math.sin(u * 11 + 0.5 + v * 2) * 0.09 * (v - 0.15); // Hängefalten
      lam -= P.collapse * 0.12;
      let i = sidx(7, lam, x, y);
      // Adern
      const vn = Math.abs(Math.sin(u * 5.2 + Math.sin(v * 4.3 + 1.1) * 1.6 + 0.4));
      const vein = vn < 0.065 && d < 0.94 && v < 0.62;
      if (vein) i = Math.max(1, i - 2);
      pt.px(x, y, FLESH[i]);
      if (vein) {
        if (i >= 2 && hash2(x, y, 231) < 0.5) pt.px(x, y, blend(FLESH[i], [120, 70, 170], 0.35));
        if (hash2(x >> 1, y >> 1, 233) < 0.3) pt.gl(x, y, K_VEIN, 1 + (Math.sin(P.pulse + u * 3 + v * 2) > 0.4 ? 1 : 0));
      }
      if (!vein && d < 0.9 && hash2(x >> 1, y >> 1, 235) < 0.018 && (x & 1) === 0 && (y & 1) === 0) pores.push([x, y]);
    }
  }
  // Poren (Loch mit hellem Rand unten)
  for (const [x, y] of pores) { pt.px(x, y, FLESH[1]); pt.px(x, y + 1, FLESH[5]); }
  // Schleimfäden unten am Leib
  for (let j = 0; j < 7; j++) {
    const x = cx - rx * 0.8 + j * rx * 0.27 + hash2(j, 1, 237) * 4;
    const len = 2 + hash2(j, 2, 237) * 4 + ((P.pulse * 0.5 + j) % 3);
    for (let s = 0; s < len; s++) pt.px(x, GY - 6 + s * 0.8 - (j % 2) * 2, s > len - 2 ? SLIME[4] : SLIME[3]);
  }
}

function sac(pt, P, L, s, i) {
  const c = sacPos(L, s);
  const pul = 1 + 0.13 * Math.sin(P.pulse + i * 1.7);
  const rr = s.r * P.sacs * pul * (1 + P.swell * 0.55) * (1 - P.collapse * 0.25);
  if (rr < 1.2) return;
  const gp = P.sacGlow * (0.8 + 0.25 * Math.sin(P.pulse + i * 1.7)) * (1 + P.swell * 0.6);
  const torn = P.torn > 0.5;
  // Fleischkragen
  for (let a = 0; a < TAU; a += 0.08) {
    if (Math.sin(a) < -0.35) continue;
    const x = c.x + Math.cos(a) * (rr + 1), y = c.y + Math.sin(a) * (rr + 1) * 0.9;
    pt.px(x, y, Math.cos(a) < 0 ? FLESH[5] : FLESH[3]);
    pt.px(c.x + Math.cos(a) * (rr + 1.8), c.y + Math.sin(a) * (rr + 1.8) * 0.9, FLESH[2]);
  }
  const R2 = Math.ceil(rr);
  const dim = clamp(P.sacGlow, 0, 1.2);
  for (let dy = -R2; dy <= R2; dy++) {
    for (let dx = -R2; dx <= R2; dx++) {
      const d = Math.hypot(dx, dy) / rr;
      if (d > 1) continue;
      const x = Math.round(c.x + dx), y = Math.round(c.y + dy);
      if (torn) {
        const ang = Math.atan2(dy, dx);
        if (d < 0.72) {
          pt.px(x, y, d < 0.45 ? SAC[0] : FLESH[1]);
          if (d < 0.4 && hash2(dx + 40, dy + 40, 241 + i) < 0.35) pt.gl(x, y, K_SAC, 1.2 * gp);
        } else if (hash2(Math.floor((ang + 4) * 3.2), i, 243) < 0.6) pt.px(x, y, d > 0.9 ? FLESH[3] : FLESH[4]);
        continue;
      }
      const nz = Math.sqrt(1 - d * d), nx = dx / rr, ny = dy / rr;
      const lam = 0.3 + (-0.5 * nx - 0.6 * ny) * 0.35 + nz * 0.25 + (dim - 0.6) * 0.3;
      let col = shade(SAC, clamp(lam, 0, 0.86), x, y);
      const spk = hash2(dx + 20 * i + 50, dy + 50, 245) < 0.07 && d < 0.75 && ((dx + dy) & 1) === 0;
      if (spk) col = SAC[1];
      if (d > 0.86) col = SAC[dim > 0.5 ? 2 : 1];
      pt.px(x, y, col);
      if (!spk && d < 0.78) pt.gl(x, y, K_SAC, (0.78 - d) * 3.6 * gp + 0.3 * gp);
    }
  }
  if (!torn) {
    // Glanzlicht und Membranader
    pt.px(c.x - rr * 0.42, c.y - rr * 0.48, SAC[6]);
    if (rr > 4) { pt.px(c.x - rr * 0.42 + 1, c.y - rr * 0.48, SAC[5]); pt.px(c.x - rr * 0.42, c.y - rr * 0.48 + 1, SAC[5]); }
    if (rr > 5) for (let k = -0.6; k <= 0.6; k += 0.15) pt.px(c.x + k * rr, c.y + Math.sin(k * 3 + i) * rr * 0.25 + rr * 0.1, SAC[2]);
  }
}

const torsoW = (t) => t < 0.25 ? 16 - t * 12 : t < 0.68 ? 13 + (t - 0.25) * 14 : 19 - (t - 0.68) * 30;
function torso(pt, P, L) {
  const { B, N } = L;
  const ca = Math.cos(P.lean), sa = Math.sin(P.lean);
  const mid = { x: (B.x + N.x) / 2 - ca * 4, y: (B.y + N.y) / 2 - sa * 4 };
  const pts = qbez(B, mid, N, 24);
  const wf = torsoW;
  // Kragen aus Leibfleisch, wo der Rumpf austritt
  pt.ellipse(B.x - 1, B.y + 2, 11, 4.5, FLESH[3]);
  pt.ellipse(B.x - 2, B.y + 1, 9, 3, FLESH[4]);
  for (let k = -8; k <= 8; k += 2) pt.px(B.x + k, B.y + 3 + Math.abs(k) * 0.12, FLESH[2]);
  tube(pt, pts, wf, (e, t, x, y) => {
    let v = 0.42 + e * 0.36 + t * 0.08;
    // Rippen auf der Vorderseite
    if (t > 0.3 && t < 0.78 && e < 0.1 && e > -0.85 && Math.abs(((t - 0.3) * 11) % 1 - 0.5) < 0.13) v -= 0.3;
    return shade(SKIN, v, x, y);
  });
  // Wirbelknoten auf dem Rücken
  for (let t = 0.12; t < 0.95; t += 0.11) {
    const p = pts[Math.round(t * 24)], hw = wf(t) / 2;
    const bx = p.x - ca * hw, by = p.y - sa * hw;
    pt.px(bx - ca, by - sa, BONE[2]); pt.px(bx - ca * 2, by - sa * 2, BONE[3]); pt.px(bx, by + 1, BONE[1]);
  }
  // Konsolenpilze am Rücken, mit leuchtenden Lamellen
  for (const [t, w] of [[0.42, 6], [0.66, 4]]) {
    const p = pts[Math.round(t * 24)], hw = wf(t) / 2;
    const x0 = p.x - ca * hw, y0 = p.y - sa * hw;
    for (let k = 0; k < w; k++) {
      const x = x0 - ca * k * 0.9, y = y0 - sa * k * 0.9 + k * 0.15;
      pt.px(x, y - 1, CAP[5 - Math.min(3, k >> 1)]); pt.px(x, y, CAP[3]);
      pt.px(x, y + 1, GILL[3]); pt.gl(x, y + 1, K_GILL, 2);
    }
  }
  return pts;
}


// Umhang aus Myzel über den Schultern: Kapuzenkragen und hängende Fransen
function mantle(pt, P, L) {
  const { B, N } = L;
  const lc = Math.cos(P.lean), ls = Math.sin(P.lean);
  const t0 = 0.97;
  const ox = B.x + (N.x - B.x) * t0, oy = B.y + (N.y - B.y) * t0;
  for (let k = -13; k <= 8; k += 0.5) {
    const e = (k + 13) / 21; // 0 hinten .. 1 vorn
    const x0 = ox + lc * k, y0 = oy + ls * k + Math.pow(Math.abs(k + 2) / 11, 2) * 3;
    const len = (5 + 5 * Math.sin(e * Math.PI) + hash2(Math.round(k * 2), 1, 311) * 3) * (1 - P.collapse * 0.3);
    let x = x0, y = y0;
    for (let st = 0; st < len; st++) {
      const f = st / len;
      x += Math.sin(P.hyT + k * 0.7 + st * 0.35) * 0.18 * f - (P.lean - 0.3) * 0.25; y += 1;
      if (f > 0.7 && hash2(Math.round(k * 2), st, 313) < (f - 0.7) * 2.2) continue;
      const lit = e < 0.35 ? 1 : e > 0.8 ? -1 : 0;
      let c = st < 2 ? CAP[3 + (lit > 0 ? 1 : 0)] : f < 0.5 ? GILL[3 + (lit > 0 ? 1 : 0) - (lit < 0 ? 1 : 0)] : GILL[2 + (lit > 0 ? 1 : 0)];
      if (Math.round(k * 2) % 3 === 0 && st >= 2) c = GILL[1];
      pt.px(x, y, c);
      if (f > 0.55 && Math.round(k * 2) % 5 === 1) pt.gl(x, y, K_GILL, 1 + f);
    }
  }
  // Kragenwulst
  for (let k = -12; k <= 7; k += 0.5) {
    const x = ox + lc * k, y = oy + ls * k + Math.pow(Math.abs(k + 2) / 11, 2) * 3 - 1;
    pt.px(x, y - 1, CAP[5]); pt.px(x, y, CAP[4]); pt.px(x, y + 1, CAP[2]);
    if (hash2(Math.round(k * 2), 5, 315) < 0.25) pt.px(x, y - 1, SPOT[2]);
  }
}

// Kopf: hageres Pilzweib als Pixelkarte (aufrecht, saubere Kanten, flache Töne).
// Runder, leicht schiefer Schädel, Licht von links oben; eingefallene Wangen und
// Schläfen mit violetten und braunen Fäulnisschatten. Schräge, mandelförmige
// Leuchtaugen unter einem schiefen Knochenwulst, kleines drittes Auge auf der Stirn,
// lange Hakennase, schiefes Maul mit ungleichen Fängen, spitzes Kinn.
// o Kontur, 1–5 Haut (Schatten → Glanz), p/q Fäulnisschatten (violett/braun),
// B/b Knochenwulst, k Höhle, E/e Auge (Kern/Rand), n Nasenloch, M Maul, T/t Fänge
const RM_FACE = [
  '.......oooooo.......',
  '....ooo44444333o....',
  '...o44444444333q1o..',
  '..o44544444k333q211o',
  '..o4454444kEek32211o',
  '.o445544444kk332211o',
  '.o4BBb444444332bb21o',
  '.o44BBBb4444bBBb221o',
  'o44kkk3bb43bbkkk1p1o',
  'o4kEEek3543kEEek2p1o',
  'o44kkeek543keekkp11o',
  'o553kkk35433kkk2pp1o',
  'o45333335433322q1p1o',
  'o45pp333543332qpp1po',
  '.o4pp33355433222pp1o',
  '.o4qp333n2n33222p1o.',
  '.o33p33ooooooo2p21o.',
  '.o3p3oMTMMTTMo22p1o.',
  '.o33poMTMMMTMMo2p1o.',
  '.o33p3oMtMMMtMMo21o.',
  '..o33poMMtMMtMo1o...',
  '..o333pooooooo21o...',
  '...o333223322qp1o...',
  '....oo3333222poo....',
  '......oo432poo......',
  '........oooo........',
];
const RM_SPLIT = 19; // ab dieser Zeile (untere Fänge) klappt der Unterkiefer nach unten
const RM_MAW_X0 = 6, RM_MAW_X1 = 13; // Maulspalte (Spalten)
// kräftig gesättigtes Grün: bleibt unter dem violetten Umgebungslicht des Sporenschlunds grün
const RM_SKIN = R(['#140a12', '#182c14', '#284a1c', '#3f7024', '#5a922e', '#82bc40']);
const RM_ROT = R(['#3c2042', '#4e3424']);
const RM_EYE = R(['#f4ffc0', '#8fe03a']), RM_EYE_OFF = R(['#2a3420', '#1c2416']);
const RM_MAW = hex('#1c0812'), RM_FANG = R(['#e6dab2', '#a8946a']), RM_BROW = R(['#cbb98c', '#8c7650']);
function headPos(P, L) {
  const { N } = L, ca = Math.cos(P.lean), sa = Math.sin(P.lean);
  return { x: N.x + ca * 6 + sa * 4 + P.head, y: N.y - ca * 4 + sa * 3 + P.headY };
}
function head(pt, P, L, meta) {
  const { N } = L;
  const { x: hx, y: hy } = headPos(P, L);
  const ox = Math.round(hx) - 9, oy = Math.round(hy) - 11;
  // Hals mit Sehnen
  const nk = qbez({ x: N.x, y: N.y + 2 }, { x: (N.x + hx) / 2, y: (N.y + hy) / 2 + 3 }, { x: ox + 9, y: oy + 21 }, 8);
  tube(pt, nk, () => 7, (e) => e > 0.35 ? RM_SKIN[3] : e < -0.35 ? RM_ROT[0] : RM_SKIN[2]);
  const j = Math.round(P.jaw * 7);
  const lit = P.eye > 0.15;
  const C = {
    o: RM_SKIN[0], 1: RM_SKIN[1], 2: RM_SKIN[2], 3: RM_SKIN[3], 4: RM_SKIN[4], 5: RM_SKIN[5],
    p: RM_ROT[0], q: RM_ROT[1], B: RM_BROW[0], b: RM_BROW[1], k: RM_SKIN[0], n: RM_SKIN[0],
    M: RM_MAW, T: RM_FANG[0], t: RM_FANG[1],
    E: lit ? RM_EYE[0] : RM_EYE_OFF[0], e: lit ? RM_EYE[1] : RM_EYE_OFF[1],
  };
  const glowAt = (ch, x, y) => {
    if (!lit) return;
    if (ch === 'E') pt.gl(x, y, K_EYE, 2.8 + P.eye * 0.9);
    else if (ch === 'e') pt.gl(x, y, K_EYE, 1.6 + P.eye * 0.6);
  };
  const row = (r, y) => {
    const s = RM_FACE[r];
    for (let x = 0; x < s.length; x++) if (s[x] !== '.') { pt.px(ox + x, y, C[s[x]]); glowAt(s[x], ox + x, y); }
  };
  for (let r = 0; r < RM_SPLIT; r++) row(r, oy + r);
  // offenes Maul: Wangen strecken sich, dazwischen der dunkle Schlund (glimmt grün)
  for (let k = 0; k < j; k++) {
    const y = oy + RM_SPLIT + k, s = RM_FACE[RM_SPLIT - 1];
    for (let x = 0; x < s.length; x++) {
      if (s[x] === '.') continue;
      const inMaw = x >= RM_MAW_X0 && x <= RM_MAW_X1;
      pt.px(ox + x, y, inMaw ? RM_MAW : C[s[x]]);
      if (inMaw && x > RM_MAW_X0 && x < RM_MAW_X1 && j >= 2) pt.gl(ox + x, y, K_EYE, 0.6 + (k / j) * 1.6 * Math.min(1.3, P.eye));
    }
  }
  for (let r = RM_SPLIT; r < RM_FACE.length; r++) row(r, oy + r + j);
  // Konsolenpilze am Hinterkopf (auf der Kontur, nicht im Gesicht)
  for (let k = 0; k < 3; k++) {
    const x = ox - 1, y = oy + 10 + k * 3;
    pt.px(x - 1, y, CAP[5]); pt.px(x, y, CAP[4]); pt.px(x - 1, y + 1, GILL[3]); pt.gl(x - 1, y + 1, K_GILL, 1.8);
  }
  meta.eye = { x: ox + 8, y: oy + 9 };
  meta.mouth = { x: ox + 10, y: oy + 18 + j * 0.5 };
  // Kinnfäden
  for (let k = 0; k < 4; k++) {
    let x = ox + 7 + k * 2, y = oy + 23 + j - (k === 0 || k === 3 ? 1 : 0);
    const len = 3 + k * 1.1 + hash2(k, 1, 251) * 3;
    for (let st = 0; st < len; st++) {
      x += Math.sin(P.hyT * 1.3 + k * 2 + st * 0.4) * 0.35 + (P.lean - 0.3) * 0.3; y += 0.9;
      pt.px(x, y, st > len - 2 ? GILL[4] : RM_SKIN[2]);
    }
    if (k === 1 || k === 3) pt.gl(x, y, K_SPORE, 2);
  }
}

// Hut: Kuppel mit Warzen, darunter Lamellen, Hyphen hängen vom Rand
const SPOTS = [[-0.62, 0.38, 3.2], [-0.25, 0.72, 3.6], [0.18, 0.62, 2.8], [0.52, 0.34, 2.6], [-0.05, 0.3, 2], [-0.8, 0.12, 2], [0.72, 0.1, 1.8], [0.35, 0.86, 1.8], [-0.45, 0.14, 1.6]];
function capGeom(P) {
  const Rr = 31 * (1 + P.capSquash * 0.1), Hd = 15 * (1 - P.capSquash * 0.22);
  const gm = 1 + Math.max(0, -P.cap) * 2.2 + P.gillOpen;
  const rimY = (lx) => { const q = lx / Rr; return 1 + 3.4 * q * q + 0.7 * Math.sin(lx * 0.8 + 1.3) * (Math.abs(q) > 0.5 ? 1 : 0.35); };
  return { Rr, Hd, gm, rimY };
}
function capPass(pt, P, K, part) {
  const { Rr, Hd, gm, rimY } = capGeom(P);
  const th = P.cap, c = Math.cos(th), s = Math.sin(th);
  const OFF = -4; // Hutmitte etwas hinter dem Kopf
  const spots = SPOTS.map(([q, h, r]) => { const lx = q * Rr; return { lx, ly: rimY(lx) - h * Hd * Math.sqrt(1 - q * q), r }; });
  for (let y = Math.floor(K.y - 40); y <= Math.ceil(K.y + 26); y++) {
    for (let x = Math.floor(K.x - 42); x <= Math.ceil(K.x + 42); x++) {
      const dx = x - K.x, dy = y - K.y;
      const lx = dx * c + dy * s - OFF, ly = -dx * s + dy * c;
      const q = lx / Rr;
      if (Math.abs(q) >= 1) continue;
      const sq = Math.sqrt(1 - q * q);
      const rim = rimY(lx);
      const top = rim - Hd * sq * (1 + 0.05 * Math.sin(q * 7 + 1));
      if (part === 'dome' && ly >= top && ly <= rim) {
        // Ausgefranster Rand
        if (ly > rim - 1.2 && Math.abs(q) > 0.3 && hash2(Math.round(lx), 3, 261) < 0.18) continue;
        const hgt = (rim - ly) / (rim - top + 0.01);
        let v = 0.28 + hgt * 0.42 - q * 0.26 + (hgt > 0.55 && q < 0.1 ? 0.14 : 0);
        if (ly > rim - 1.5) v -= 0.16;
        if (hgt > 0.2 && Math.abs(Math.sin(q * 9 + hgt * 2)) < 0.06) v -= 0.12; // Runzeln
        let col = shade(CAP, v, x, y);
        for (const sp of spots) {
          const dd = Math.hypot(lx - sp.lx, (ly - sp.ly) * 1.35);
          if (dd < sp.r) { const lit = (lx - sp.lx) + (ly - sp.ly) < -0.5; col = dd > sp.r - 0.9 ? SPOT[lit ? 2 : 0] : SPOT[lit ? 3 : 2]; break; }
        }
        pt.px(x, y, col);
      } else if (part === 'gills' && ly > rim && ly <= rim + (2.4 + 2.6 * sq) * gm) {
        const depth = (ly - rim) / ((2.4 + 2.6 * sq) * gm);
        const gx = lx * (1 - depth * 0.45);
        const line = ((gx / 2.4) % 1 + 1) % 1 < 0.38;
        const col = Math.abs(lx) < 4 && depth > 0.5 ? GILL[0] : line ? GILL[1] : depth > 0.6 ? GILL[2] : GILL[3];
        pt.px(x, y, col);
        if (!line && Math.abs(lx) > 3) {
          const lam = Math.floor((gx / 2.4) + 100);
          const hot = (lam % 2 === 0) ? 1.6 : 0.9;
          pt.gl(x, y, K_GILL, (hot + 0.6 * Math.sin(P.pulse + lam * 0.7)) * (1 - depth * 0.5) * (1 + P.gillOpen * 0.5));
        }
      }
    }
  }
  const toW = (lx, ly) => ({ x: K.x + (lx + OFF) * c - ly * s, y: K.y + (lx + OFF) * s + ly * c });
  return { toW, rimY, Rr, Hd };
}
function hyphae(pt, P, cg) {
  for (let j = 0; j < 11; j++) {
    const q = -0.94 + j * 0.188;
    if (q > -0.3 && q < 0.72) continue;
    const lx = q * cg.Rr;
    const p = cg.toW(lx, cg.rimY(lx) + 0.5);
    let x = p.x, y = p.y;
    const len = 4 + hash2(j, 1, 271) * 12 * (1 + P.gillOpen * 0.3);
    for (let s = 0; s < len; s++) {
      x += Math.sin(P.hyT + j * 1.3 + s * 0.3) * 0.3 * (s / len) + (P.cap - 0.06) * 0.4; y += 0.95;
      pt.px(x, y, s < 2 ? GILL[3] : (s & 1) ? GILL[2] : GILL[4]);
    }
    if (hash2(j, 2, 271) < 0.55) { pt.px(x, y + 1, SAC[4]); pt.gl(x, y + 1, K_SPORE, 2 + (Math.sin(P.pulse + j) > 0 ? 1 : 0)); }
  }
}

// Ranken-Arm: Bezier-Strang mit Dornen, Moos, Knoten, Wurzelkrallen
function vineArm(pt, P, S, E, curl, claw, back, seed, meta, key) {
  const dx = E.x - S.x, dy = E.y - S.y, len = Math.hypot(dx, dy) || 1;
  const px = -dy / len, py = dx / len;
  const C = { x: (S.x + E.x) / 2 + px * curl, y: (S.y + E.y) / 2 + py * curl };
  const n = Math.max(16, Math.round(len * 1.2));
  const pts = qbez(S, C, E, n);
  const clipping = P.plunge > 0.3;
  if (clipping) pt.clip = GY - 1;
  const sh = back ? -0.16 : 0;
  const wf = (t) => (8.6 - t * 5.4) + Math.max(0, 1.3 - Math.abs(t - 0.32) * 12) + Math.max(0, 1 - Math.abs(t - 0.64) * 12);
  tube(pt, pts, wf, (e, t, x, y) => {
    if (e > 0.45 && t < 0.8 && hash2(x >> 1, y >> 1, 281 + seed) < 0.4) return MOSS[back ? 2 : 3 + (e > 0.8 ? 1 : 0)];
    let v = 0.4 + e * 0.38 + sh;
    if (Math.abs(((t * 9 + seed) % 1) - 0.5) < 0.05) v -= 0.25; // Rindenringe
    return shade(BARK, v, x, y);
  });
  // Dornen auf der Außenseite
  for (let i = 3; i < pts.length - 3; i += 4) {
    const a = pts[i], b = pts[i + 1];
    const tx = b.x - a.x, ty = b.y - a.y, tl = Math.hypot(tx, ty) || 1;
    const side = (i >> 2) % 2 ? 1 : -1;
    const nx = (-ty / tl) * side, ny = (tx / tl) * side;
    const hw = wf(a.t) / 2;
    const L0 = 2 + (hash2(i, seed, 283) * 2) * (1 - a.t * 0.5);
    for (let k = 0; k <= L0; k += 0.5) {
      const x = a.x + nx * (hw + k) + (tx / tl) * k * 0.5, y = a.y + ny * (hw + k) + (ty / tl) * k * 0.5;
      pt.px(x, y, k > L0 - 1 ? BONE[back ? 2 : 3] : BARK[back ? 2 : 3]);
    }
  }
  // Leuchtknoten
  for (const t of [0.46, 0.78]) {
    const p = pts[Math.round(t * n)];
    pt.px(p.x, p.y, GILL[4]); pt.px(p.x + 1, p.y, GILL[3]);
    pt.gl(p.x, p.y, K_VEIN, back ? 1.6 : 2.4); pt.gl(p.x + 1, p.y, K_VEIN, 1.4);
  }
  // Wurzelkrallen
  const a = pts[pts.length - 3], b = pts[pts.length - 1];
  const base = Math.atan2(b.y - a.y, b.x - a.x);
  for (let f = 0; f < 4; f++) {
    const fa = base + (f - 1.5) * (0.28 + claw * 0.38);
    const fl = 7 + hash2(f, seed, 285) * 3;
    const fp = [];
    let x = b.x, y = b.y, ang = fa;
    for (let s = 0; s <= fl; s += 1) {
      fp.push({ x, y, t: s / fl });
      ang += (1 - claw) * 0.16 * (f < 2 ? 1 : -1) + 0.02;
      x += Math.cos(ang); y += Math.sin(ang);
    }
    tube(pt, fp, (t) => 2.4 - t * 1.4, (e, t, X, Y) => t > 0.75 ? BONE[e > 0 ? 3 : 2] : shade(BARK, 0.45 + e * 0.35 + sh, X, Y));
  }
  meta[key] = { x: b.x, y: b.y };
  pt.clip = H;
  if (clipping) {
    // Erdkrone, wo der Arm im Boden steckt
    let cross = null;
    for (const p of pts) if (p.y >= GY - 2) { cross = p; break; }
    if (cross) {
      for (let k = -6; k <= 6; k++) {
        const hgt = Math.max(0, 3 - Math.abs(k) * 0.45) + hash2(k + 9, seed, 287) * 1.5;
        for (let yy = 0; yy < hgt; yy++) pt.px(cross.x + k, GY - 1 - yy, yy === Math.floor(hgt - 1) ? BARK[4] : BARK[2]);
      }
      pt.px(cross.x - 7, GY - 3, BARK[3]); pt.px(cross.x + 8, GY - 4, BARK[4]); pt.px(cross.x + 5, GY - 6, BARK[3]);
      meta[key] = { x: cross.x, y: GY - 1 };
    }
  }
}

// Wischer hinter dem peitschenden Arm: drei dünne Bögen, frisch am Ende hell
function smear(pt, S, a0, a1, r0, r1) {
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1), span = hi - lo || 1;
  for (let a = lo; a <= hi; a += 0.5 / r1) {
    const fresh = a1 > a0 ? (a - lo) / span : (hi - a) / span;
    for (let j = 0; j < 4; j++) {
      const r = r1 - j * 2.2;
      if (hash2(Math.round(a * 60), j, 291) > fresh * (1.1 - j * 0.22)) continue;
      const X = S.x + Math.cos(a) * r, Y = S.y + Math.sin(a) * r;
      if (Y >= GY - 1) continue;
      pt.px(X, Y, j === 0 ? SKIN[6] : j === 1 ? MOSS[4] : MOSS[3]);
      if (j < 2 && fresh > 0.4) pt.gl(X, Y, K_SPORE, j === 0 ? 2.4 : 1.4);
    }
  }
}

// Schwebende Sporenfunken (nur Leucht-Ebene), schleifenfest über spT
function spores(pt, P, L) {
  const n = Math.round(22 * P.spore);
  for (let i = 0; i < n; i++) {
    const f = (hash2(i, 1, 301) + P.spT / TAU * (0.5 + (i % 3) * 0.5)) % 1;
    const x = L.cx + 4 + (hash2(i, 2, 301) - 0.5) * 96 + Math.sin(P.spT * 2 + i) * 3;
    const y = GY - 8 - f * 92;
    const lvl = (f < 0.15 ? f / 0.15 : f > 0.75 ? (1 - f) / 0.25 : 1) * (2 + (i % 4 === 0 ? 1.5 : 0));
    pt.gl(x, y, K_SPORE, lvl);
  }
}

// ---------------------------------------------------------------- Figur

function drawMother(pt, P, ex) {
  const meta = {};
  pt.gk = P.glow;
  const L = layout(P);
  const { N } = L;
  const lc = Math.cos(P.lean), ls = Math.sin(P.lean);
  const at = (t, k) => ({ x: L.B.x + (N.x - L.B.x) * t + lc * k, y: L.B.y + (N.y - L.B.y) * t + ls * k });
  const SF = at(0.7, 6), SB = at(0.74, -7);
  const EF = { x: SF.x + P.hFx + 1, y: SF.y + P.hFy - 3 };
  const EB = { x: SB.x + P.hBx, y: SB.y + P.hBy };

  slimePool(pt, P, L);
  roots(pt, P, L, false);
  vineArm(pt, P, SB, EB, P.bCurl, P.bClaw, true, 7, meta, 'handB');
  backShrooms(pt, P, L);
  body(pt, P, L);
  const order = SACS.map((s, i) => [s, i]).sort((a, b) => a[0].v - b[0].v);
  for (const [s, i] of order) sac(pt, P, L, s, i);
  meta.sac = sacPos(L, SACS[0]);
  meta.core = { x: L.cx, y: L.cy };
  roots(pt, P, L, true);
  torso(pt, P, L);
  mantle(pt, P, L);
  meta.chest = { x: (L.B.x + N.x) / 2 + 2, y: (L.B.y + N.y) / 2 };
  // Hutbefestigung über dem Kopf
  const hp = headPos(P, L);
  const K = { x: hp.x - 2 - Math.sin(P.cap) * 2, y: hp.y - 10 - P.capLift };
  const armFront = P.hFy < 12; // erhobener Arm liegt vor Hut und Kopf
  if (ex.smear) smear(pt, SF, ex.smear[0], ex.smear[1], 14, Math.hypot(P.hFx, P.hFy) + 6);
  if (!armFront) vineArm(pt, P, SF, EF, P.fCurl, P.fClaw, false, 3, meta, 'hand');
  capPass(pt, P, K, 'gills');
  head(pt, P, L, meta);
  const cg = capPass(pt, P, K, 'dome');
  hyphae(pt, P, cg);
  const top = cg.toW(0, cg.rimY(0) - cg.Hd);
  meta.head = { x: top.x, y: top.y };
  if (armFront) vineArm(pt, P, SF, EF, P.fCurl, P.fClaw, false, 3, meta, 'hand');
  spores(pt, P, L);
  meta.cast = meta.mouth;
  return meta;
}

// ---------------------------------------------------------------- Frames

function bbox(d) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!d[y * W + x]) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? { x0: 0, y0: 0, x1: 0, y1: 0 } : { x0, y0, x1, y1 };
}
function crop(d, bb) {
  const w = bb.x1 - bb.x0 + 1, h = bb.y1 - bb.y0 + 1;
  const c = makeCanvas(w, h), ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h), o = new Uint32Array(img.data.buffer);
  for (let y = 0; y < h; y++) o.set(d.subarray((y + bb.y0) * W + bb.x0, (y + bb.y0) * W + bb.x0 + w), y * w);
  ctx.putImageData(img, 0, 0);
  return c;
}

function frame(P, ex = {}) {
  const pt = new Painter();
  const meta = drawMother(pt, P, ex);
  rimPass(pt);
  const bb = bbox(pt.b);
  const base = new SpriteFrame(outlineCanvas(crop(pt.b, bb)), AX - bb.x0 + 1, AY - bb.y0 + 1);
  const gb = bbox(pt.g);
  base.glow = new SpriteFrame(crop(pt.g, gb), AX - gb.x0, AY - gb.y0);
  base.glowEnraged = new SpriteFrame(crop(pt.e, gb), AX - gb.x0, AY - gb.y0);
  base.meta = {};
  for (const k in meta) base.meta[k] = { dx: Math.round(meta[k].x - AX), dy: Math.round(meta[k].y - AY) };
  base.fx = ex.fx ?? null;
  return base;
}

function track(keys, n, { loop = false, extras = {} } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = loop ? i / n : n === 1 ? 1 : i / (n - 1);
    out.push(frame(sample(keys, t), extras[i] ?? {}));
  }
  return out;
}

// Schleife: Posen-Funktion über die Phase ph (0..2π)
function cycle(n, fn) {
  const keys = [];
  for (let i = 0; i <= n; i++) keys.push([i / n, pose(fn((i / n) * TAU)), linear]);
  return keys;
}

export function createRotMotherSprites() {
  const S = Math.sin, C = Math.cos;
  // --- Atmen: Leib hebt und senkt sich, Säcke pulsieren versetzt, Hut wippt nach
  const idleKeys = cycle(12, (ph) => ({
    breathe: S(ph), by: S(ph) * 0.8, lean: 0.3 + S(ph + 0.6) * 0.035, torsoY: S(ph + 0.4) * 0.8,
    head: S(ph + 1) * 0.6, headY: S(ph + 1.2) * 0.5, jaw: 0.1 + 0.14 * (0.5 + 0.5 * S(ph + 2)),
    cap: 0.06 + S(ph + 1.4) * 0.035, capSquash: 0.12 * S(ph + 2),
    hFx: 22 + S(ph) * 1.2, fCurl: -10 + S(ph + 0.5) * 2, fClaw: 0.6 + 0.1 * S(ph * 2),
    hBx: -60 + C(ph), bCurl: 16 + S(ph + 2) * 2,
    pulse: ph * 2, rootT: ph, hyT: ph, spT: ph,
  }));
  // --- Kriechen: Ranken ziehen den Leib abwechselnd nach vorn, Wurzeln winden sich
  const walkKeys = cycle(10, (ph) => ({
    bx: S(ph) * 2.5, crawl: S(ph), breathe: C(ph) * 0.7, by: -Math.abs(S(ph)) * 1.2,
    lean: 0.4 + S(ph) * 0.06, headY: S(ph * 2) * 0.6, jaw: 0.2, cap: 0.1 + S(ph) * 0.04,
    hFx: 30 + S(ph) * 9, hFy: 50 - Math.max(0, C(ph)) * 7, fCurl: -12 - C(ph) * 3,
    hBx: -54 - S(ph) * 8, hBy: 48 - Math.max(0, -C(ph)) * 7, bCurl: 12 + C(ph) * 3,
    rootT: ph, rootWig: 0.45, rootSpread: 1 + 0.08 * S(ph), pulse: ph * 2, hyT: ph, spT: ph,
  }));
  // --- Schlafend: zusammengesunken, Hut tief, Säcke glimmen matt
  const dormKeys = cycle(8, (ph) => ({
    lean: 0.95, torsoY: -6, cap: 0.34 + S(ph) * 0.02, capLift: -4, head: 1, headY: 2, eye: 0, jaw: 0,
    sacGlow: 0.35 + 0.15 * S(ph), pulse: ph, breathe: 0.6 * S(ph), hFx: 14, hFy: 46, fCurl: -4, fClaw: 0.1,
    hBx: -44, hBy: 46, bCurl: 8, bClaw: 0.1, glow: 0.75, spore: 0.2, rootSpread: 0.85, collapse: 0.15,
    hyT: ph, spT: ph, rootT: ph,
  }));
  const dorm = dormKeys[0][1];
  // --- Aufwachen und Schrei
  const rise1 = pose({ lean: 0.55, torsoY: -2, cap: 0.2, capLift: -1, eye: 0.6, sacGlow: 0.8, hFx: 18, hFy: 36, fCurl: -2, hBx: -18, hBy: 38, breathe: -0.5, hyT: 1, spT: 0.8, pulse: 1.2, jaw: 0.2 });
  const rise2 = pose({ lean: 0.05, torsoY: 4, cap: -0.25, capLift: 3, eye: 1.2, jaw: 0.6, hFx: 16, hFy: -20, fCurl: 14, fClaw: 1, hBx: -34, hBy: -12, bCurl: -12, bClaw: 1, sacGlow: 1.4, swell: 0.25, breathe: -1, gillOpen: 0.6, hyT: 2.2, spT: 1.6, pulse: 2.6, spore: 0.8 });
  const scream = pose({ lean: -0.06, torsoY: 5, cap: -0.36, capLift: 4, jaw: 1, eye: 1.5, hFx: 32, hFy: -26, fCurl: 12, fClaw: 1, hBx: -44, hBy: -18, bCurl: -10, bClaw: 1, sacGlow: 1.35, swell: 0.3, spore: 1, breathe: -1, capSquash: -0.25, gillOpen: 0.8, hyT: 3.4, spT: 2.4, pulse: 4 });
  const screamEnd = { ...scream, hyT: 5.6, spT: 4.2, pulse: 7.4, hFx: 34, hFy: -24, cap: -0.3, swell: 0.3 };
  // --- Rankenhieb
  const lw = pose({ lean: 0.04, torsoY: 2, head: -1, cap: -0.12, capLift: 1, jaw: 0.5, eye: 1.3, hFx: -8, hFy: -34, fCurl: 16, fClaw: 1, hBx: -40, hBy: 46, bCurl: 10, breathe: -0.6, bx: -2, sacGlow: 1.2, hyT: 1.5, pulse: 2, spT: 1 });
  const lwEnd = { ...lw, hFx: -10, hFy: -35, lean: 0.02, hyT: 2.2, pulse: 3, spT: 1.5 };
  const l1 = pose({ hFx: 40, hFy: -8, fCurl: -8, fClaw: 1, lean: 0.36, jaw: 0.9, bx: 1, cap: 0.1, eye: 1.3, hBx: -40, hBy: 46, hyT: 2.6, pulse: 3.4, spT: 1.8 });
  const l2 = pose({ hFx: 62, hFy: 50, fCurl: -4, fClaw: 1, lean: 0.62, jaw: 1, head: 1, cap: 0.3, bx: 3, eye: 1.3, hBx: -42, hBy: 46, breathe: 0.6, hyT: 3, pulse: 3.8, spT: 2.1 });
  const l3 = pose({ hFx: 56, hFy: 52, fCurl: -6, fClaw: 0.3, lean: 0.55, jaw: 0.5, cap: 0.22, bx: 2, hBx: -40, hBy: 47, hyT: 3.6, pulse: 4.4, spT: 2.6 });
  const lEnd = pose({ hyT: 4.6, pulse: 5.6, spT: 3.2 });
  // --- Sporen spucken
  const sw = pose({ lean: 0, torsoY: 3, head: -1.5, headY: -1, cap: -0.3, capLift: 2, gillOpen: 0.7, jaw: 0.75, eye: 1.3, sacGlow: 1.5, swell: 0.2, breathe: -1, hFx: 26, hBx: -40, hBy: 46, fClaw: 0.9, hyT: 1.5, pulse: 2.4, spT: 1 });
  const swEnd = { ...sw, jaw: 0.85, swell: 0.28, hyT: 2.2, pulse: 3.6, spT: 1.5, cap: -0.33 };
  const sp1 = pose({ lean: 0.58, torsoY: 1, head: 1.5, headY: 1, cap: 0.22, jaw: 1, eye: 1.4, sacGlow: 1.8, breathe: 0.8, bx: 2, hFx: 28, hyT: 2.8, pulse: 4, spT: 1.9, spore: 0.9 });
  const sp2 = pose({ lean: 0.5, jaw: 0.8, sacGlow: 1.3, bx: 1, cap: 0.14, hyT: 3.4, pulse: 4.6, spT: 2.3, spore: 0.7 });
  const spEnd = pose({ hyT: 4.4, pulse: 5.6, spT: 3 });
  // --- Sporen ausstoßen (Wolken)
  const pw = pose({ inflate: 0.12, swell: 0.5, sacGlow: 1.7, lean: 0.14, cap: -0.12, capLift: 1, jaw: 0.35, hFx: 26, hBx: -30, breathe: -0.8, hyT: 1.2, pulse: 2, spT: 1 });
  const pwEnd = { ...pw, inflate: 0.14, swell: 0.6, hyT: 1.8, pulse: 3, spT: 1.4 };
  const pf1 = pose({ inflate: -0.09, sacs: 0.72, swell: 0, sacGlow: 2.1, jaw: 0.65, cap: 0.16, lean: 0.36, spore: 1, breathe: 1, hyT: 2.4, pulse: 3.6, spT: 1.8 });
  const pf2 = pose({ inflate: -0.04, sacs: 0.88, sacGlow: 1.3, jaw: 0.3, cap: 0.1, spore: 0.8, hyT: 3, pulse: 4.4, spT: 2.2 });
  const pfEnd = pose({ hyT: 4, pulse: 5.4, spT: 2.8 });
  // --- Brut ausspeien
  const bw = pose({ lean: -0.05, torsoY: 4, cap: -0.26, capLift: 2, jaw: 0.4, inflate: 0.1, breathe: -1, bx: -2, hFx: 30, hFy: 48, hBx: -34, eye: 1.2, sacGlow: 1.3, hyT: 1.2, pulse: 2, spT: 1 });
  const bwEnd = { ...bw, inflate: 0.12, torsoY: 4.5, hyT: 1.8, pulse: 3, spT: 1.4 };
  const br1 = pose({ lean: 0.85, torsoY: -3, head: 2, headY: 3, cap: 0.36, jaw: 1, inflate: -0.06, breathe: 1, bx: 3, hFx: 36, hFy: 52, eye: 1.3, hyT: 2.4, pulse: 3.6, spT: 1.8 });
  const br2 = pose({ lean: 0.88, torsoY: -3.5, head: 2, headY: 3.5, cap: 0.38, jaw: 1, bx: 3, hFx: 36, hFy: 52, sacGlow: 1.2, hyT: 3, pulse: 4.2, spT: 2.2 });
  const br3 = pose({ lean: 0.6, torsoY: -1, jaw: 0.6, cap: 0.2, bx: 1, hyT: 3.6, pulse: 4.8, spT: 2.6 });
  const brEnd = pose({ hyT: 4.4, pulse: 5.6, spT: 3.2 });
  // --- Wurzeln rufen (Phase 2): Arme hoch, dann tief in den Boden
  const pl0 = pose({ lean: -0.1, torsoY: 5, cap: -0.3, capLift: 3, gillOpen: 0.5, jaw: 0.8, eye: 1.3, hFx: 12, hFy: -36, fCurl: 14, fClaw: 1, hBx: -22, hBy: -32, bCurl: -14, bClaw: 1, sacGlow: 1.3, breathe: -1, bx: -1, hyT: 1.4, pulse: 2.2, spT: 1 });
  const pl0End = { ...pl0, hFy: -38, hBy: -34, torsoY: 5.5, hyT: 2, pulse: 3.2, spT: 1.4 };
  const plA = pose({ lean: 0.56, torsoY: -2, cap: 0.26, jaw: 1, eye: 1.4, hFx: 46, hFy: 68, fCurl: -10, fClaw: 1, hBx: -66, hBy: 64, bCurl: 16, bClaw: 1, plunge: 1, bx: 2, breathe: 1, rootWig: 0.5, sacGlow: 1.4, hyT: 2.6, pulse: 3.8, spT: 1.8 });
  const plB = { ...plA, lean: 0.5, torsoY: -1, head: 0.6, jaw: 0.85, rootT: 1.5, hyT: 3.2, pulse: 4.6, spT: 2.2, bx: 1.5 };
  const plC = { ...plA, lean: 0.54, torsoY: -2, head: -0.3, jaw: 1, rootT: 3, hyT: 3.8, pulse: 5.4, spT: 2.6, bx: 2.2 };
  const plOut = pose({ lean: 0.4, hFx: 30, hFy: 44, fCurl: -12, hBx: -44, hBy: 42, bCurl: 12, jaw: 0.4, hyT: 4.4, pulse: 6.2, spT: 3, rootT: 4 });
  const plEnd = pose({ hyT: 5, pulse: 6.8, spT: 3.4, rootT: 4.6 });
  // --- Säcke platzen (Phase 3)
  const bu = pose({ swell: 0.9, sacGlow: 2, inflate: 0.1, lean: 0.1, cap: -0.2, capLift: 2, jaw: 0.8, eye: 1.4, breathe: -1, hFx: 30, hBx: -34, fClaw: 1, bClaw: 1, spore: 0.9, hyT: 1, pulse: 1.5, spT: 0.8 });
  const buKeys = [[0, pose({ swell: 0.1 })], [0.4, { ...bu, bx: -1 }], [0.6, { ...bu, bx: 1, swell: 0.95, hyT: 1.6, pulse: 2.6 }], [0.8, { ...bu, bx: -1, swell: 1, hyT: 2, pulse: 3.4 }], [1, { ...bu, bx: 1, swell: 1.05, hyT: 2.4, pulse: 4.2 }]];
  const b1 = pose({ torn: 1, swell: 0, sacGlow: 0.9, inflate: -0.08, jaw: 1, lean: 0.38, cap: 0.26, spore: 1, breathe: 1, eye: 1.4, hFx: 30, hBx: -34, hyT: 2.8, pulse: 4.6, spT: 1.6 });
  const b2 = { ...b1, lean: 0.34, jaw: 0.7, hyT: 3.4, pulse: 5.2, spT: 2.1, inflate: -0.05 };
  const b3 = pose({ torn: 0, sacs: 0.25, sacGlow: 0.6, lean: 0.32, jaw: 0.3, hyT: 4, pulse: 5.8, spT: 2.6 });
  const b4 = pose({ sacs: 0.85, hyT: 4.6, pulse: 6.4, spT: 3 });
  // --- Phasenschrei
  const ro1 = pose({ lean: 0.7, torsoY: -3, cap: 0.3, capLift: -1, jaw: 0, hFx: 20, hFy: 50, fClaw: 0.2, eye: 0.8, hyT: 0.5, pulse: 0.5 });
  // --- Treffer
  const hurtP = pose({ lean: 0.08, bx: -3, head: -1.5, cap: -0.16, jaw: 0.6, breathe: -0.8, sacGlow: 1.4, hFx: 16, hFy: 44, fCurl: -4, eye: 1.3, hyT: 1, pulse: 1 });
  // --- Tod: aufbäumen, Säcke reißen, fällt in sich zusammen, Sporen verglimmen
  const d1 = pose({ lean: -0.1, torsoY: 5, cap: -0.36, capLift: 4, jaw: 1, eye: 1.5, hFx: 26, hFy: -24, fCurl: 12, fClaw: 1, hBx: -36, hBy: -18, bCurl: -10, bClaw: 1, sacGlow: 2, swell: 0.45, breathe: -1, gillOpen: 0.8, spore: 1, hyT: 1.5, pulse: 2, spT: 1 });
  const d2 = pose({ torn: 1, swell: 0, sacGlow: 0.9, lean: 0.5, torsoY: 0, cap: 0.3, jaw: 0.8, hFx: 36, hFy: 40, fCurl: -6, hBx: -38, hBy: 36, bCurl: 6, collapse: 0.25, eye: 0.8, spore: 1, hyT: 2.6, pulse: 3.4, spT: 1.8 });
  const d3 = pose({ collapse: 0.7, lean: 1.0, torsoY: -8, head: 1, headY: 2, cap: 0.62, capLift: -6, jaw: 0.4, eye: 0.3, hFx: 40, hFy: 56, fCurl: -2, fClaw: 0.2, hBx: -40, hBy: 54, bCurl: 2, bClaw: 0.2, sacGlow: 0.4, sacs: 0.6, torn: 1, glow: 0.85, spore: 0.7, rootWig: 0.3, hyT: 3.6, pulse: 4.4, spT: 2.6 });
  const d4 = pose({ collapse: 1, lean: 1.22, torsoY: -13, head: 2, headY: 3, cap: 0.86, capLift: -9, jaw: 0.2, eye: 0, hFx: 44, hFy: 60, fCurl: 0, fClaw: 0, hBx: -44, hBy: 58, bCurl: 0, bClaw: 0, sacs: 0.5, sacGlow: 0.2, torn: 1, glow: 0.65, spore: 0.45, rootSpread: 1.08, hyT: 4.4, pulse: 5, spT: 3.4 });
  const remains = (k) => frame({ ...d4, glow: 0.65 * (1 - k), spore: 0.45 * (1 - k), spT: 3.4 + k * 3, sacGlow: 0.2 * (1 - k), hyT: 4.4 + k }, {});

  const sm = (a, b, o = {}) => ({ smear: [a, b], ...o });

  return {
    idle: new Animation(track(idleKeys, 12, { loop: true }), 7),
    walk: new Animation(track(walkKeys, 10, { loop: true }), 8),
    dormant: new Animation(track(dormKeys, 8, { loop: true }), 3),
    awaken: new Animation(track([[0, dorm], [0.3, rise1], [0.55, rise2], [0.62, scream, snap], [1, screamEnd]], 18, { extras: { 11: { fx: 'roar' } } }), 9, false),
    lashWindup: new Animation(track([[0, pose()], [0.7, lw], [1, lwEnd]], 7), 10, false),
    lash: new Animation(track([[0, l1], [0.16, l2, snap], [0.42, l3], [1, lEnd]], 9, {
      extras: { 0: sm(-1.75, -0.2), 1: sm(-0.4, 0.7, { fx: 'impact' }), 2: sm(0.3, 0.72) },
    }), 16, false),
    spitWindup: new Animation(track([[0, pose()], [0.7, sw], [1, swEnd]], 7), 10, false),
    spit: new Animation(track([[0, sp1], [0.3, sp2], [1, spEnd]], 8, { extras: { 1: { fx: 'cast' } } }), 14, false),
    puffWindup: new Animation(track([[0, pose()], [0.7, pw], [1, pwEnd]], 7), 10, false),
    puff: new Animation(track([[0, pf1], [0.35, pf2], [1, pfEnd]], 8, { extras: { 1: { fx: 'cast' } } }), 13, false),
    broodWindup: new Animation(track([[0, pose()], [0.7, bw], [1, bwEnd]], 7), 9, false),
    brood: new Animation(track([[0, br1], [0.25, br2], [0.6, br3], [1, brEnd]], 10, { extras: { 1: { fx: 'cast' } } }), 11, false),
    plungeWindup: new Animation(track([[0, pose()], [0.7, pl0], [1, pl0End]], 7), 10, false),
    plunge: new Animation(track([[0, plA], [0.35, plB], [0.62, plC], [0.8, plOut], [1, plEnd]], 12, { extras: { 0: { fx: 'impact' } } }), 10, false),
    burstWindup: new Animation(track(buKeys, 9), 10, false),
    burst: new Animation(track([[0, b1], [0.35, b2], [0.6, b3], [1, b4]], 10, { extras: { 0: { fx: 'impact' } } }), 12, false),
    roar: new Animation(track([[0, ro1], [0.25, scream, snap], [0.8, screamEnd], [1, { ...screamEnd, hyT: 6.2, pulse: 8.4 }]], 12, { extras: { 3: { fx: 'roar' } } }), 8, false),
    hurt: new Animation(track([[0, hurtP], [1, pose({ hyT: 2, pulse: 2 })]], 4), 12, false),
    death: new Animation([
      ...track([[0, hurtP], [0.18, d1], [0.4, d2], [0.72, d3], [1, d4]], 18, { extras: { 3: { fx: 'roar' }, 8: { fx: 'impact' }, 14: { fx: 'impact' } } }),
      remains(0.25), remains(0.5), remains(0.75), remains(1),
    ], 7, false),
  };
}
