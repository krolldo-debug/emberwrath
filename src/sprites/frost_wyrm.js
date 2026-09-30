import { makeCanvas, flipCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame, Animation } from '../gfx/Sprite.js';
import { hash2 } from '../core/math.js';

// Skalvyr, der Frostwurm – Boss der Reifhöhlen (Stufe 37).
//
// Flügelloser Eisdrache mit Schlangenleib: der Körper liegt in einer S-Kurve am
// Boden, der Hals steigt wie bei einer Kobra auf, zwei kurze Vorderklauen stützen
// die Brust. Kristallstacheln laufen den Rücken entlang, Kristallhörner krönen den
// Schädel, im Brustkorb pulsiert ein Frostherz (durch die Bauchplatten sichtbar).
//
// Technik: Die Wirbelsäule ist eine Catmull-Rom-Kurve durch 10 Steuerpunkte
// (x, d = Bodentiefe, h = Höhe). Der Leib wird als Röhre gezeichnet (Scheiben
// entlang der Kurve, Licht von links oben, Schuppenmuster längs der Bogenlänge,
// damit es beim Kriechen mitwandert). Posen sind Parameter-Sätze, Animationen
// Schlüsselposen mit Interpolation. Eingraben folgt einer festen Bahn (der Leib
// „fließt“ ins Loch), Auftauchen hebt den ganzen Leib durch das Eis.
// Tod: bäumt sich auf, erstarrt vom Herz aus zu Eis, reißt und zerspringt in
// Scherben (Voronoi-Zellen des letzten Bildes fallen zu Boden).
//
// Jeder Frame hat zwei Leucht-Ebenen: frame.glow (Phase 1–2, kaltes Türkis) und
// frame.glowEnraged (Phase 3, weißblau, glühende Adern in den Schuppen).
// Blickrichtung rechts, Anker = Boden unter der Leibmitte (16 px hinter der Brust).
// Metadaten (relativ zum Anker): mouth, eye, head, chest (Frostherz), tail (Spitze).
// fx-Marken: step, roar, impact, cast, nova, shatter.

const W = 248, H = 176, AX = 128, AY = 146;
// Anker der fertigen Frames: Leibmitte (16 px hinter der Brust), damit Trefferfläche
// und Wenden zum langen Körper passen. Die Brust liegt bei dx = +16.
export const ANCHOR_DX = -16;

// ---------------------------------------------------------------- Farben

const SCALE = ['#0a1424', '#12263e', '#1b3a58', '#275674', '#3a7892', '#5a9eb4', '#86c4d2'];
const BELLY = ['#26445c', '#40687e', '#6a94aa', '#9cc2d2', '#d2eaf2'];
const CRYS = ['#153a62', '#25649c', '#3f9ccf', '#88d4ef', '#dcf8ff'];
const HORN = ['#1a2638', '#2e4258', '#4c6882', '#7c9cb2', '#bcd6e2'];
const MOUTH = ['#0c0614', '#220c28', '#3c1640', '#5e2452'];
const TEETH = ['#7c9cb2', '#c0dcea', '#f4fcff'];
const FROZEN = ['#3e5c74', '#6a8ea6', '#9cc0d2', '#cfe8f2', '#f4fdff'];
const RIM = '#96d8e6', RIM2 = '#5aa2bc';
const FROSTG = ['#0a3050', '#1670a0', '#34b8e4', '#9aeefc', '#ffffff'];
const FURYG = ['#1c2c80', '#3a6cf0', '#7ec4ff', '#d8f4ff', '#ffffff'];

// Materialien (für Randlicht und Erstarren)
const M_SCALE = 1, M_BELLY = 2, M_CRYS = 3, M_HORN = 4, M_MOUTH = 5, M_CLAW = 6, M_EYE = 7;

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

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
const SCALEc = SCALE.map(col), BELLYc = BELLY.map(col);
const FROSTc = FROSTG.map(col), FURYc = FURYG.map(col), FROZENc = FROZEN.map(col);
// Helligkeit eines Pixels (0..1) -> Eis-Rampe beim Erstarren
function frozenOf(c) {
  const r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255;
  const l = (r * 0.3 + g * 0.5 + b * 0.2) / 255;
  return FROZENc[Math.max(0, Math.min(4, Math.round(l * 5.2 - 0.2)))];
}

// ---------------------------------------------------------------- Ebenen und Stifte

class Layers {
  constructor() {
    this.base = new Uint32Array(W * H);
    this.ga = new Uint32Array(W * H);
    this.gb = new Uint32Array(W * H);
    this.mat = new Uint8Array(W * H);
  }
}

class Pen {
  constructor(L) { this.L = L; this.m = M_SCALE; }
  px(x, y, c, m = this.m) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    this.L.base[i] = col(c); this.L.ga[i] = 0; this.L.gb[i] = 0; this.L.mat[i] = m;
  }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c); }
  ellipse(cx, cy, rx, ry, c) { fillEllipse(cx, cy, rx, ry, (x, y) => this.px(x, y, c)); }
  line(x0, y0, x1, y1, c) { bres(x0, y0, x1, y1, (x, y) => this.px(x, y, c)); }
}

// Leuchtstift: i = Index in die Rampe (0 dunkel … 4 weiß). px beide Ebenen,
// a* nur Phase 1–2, e* nur Phase 3.
class GlowPen {
  constructor(L) { this.L = L; }
  set(buf, ramp, x, y, i) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H || i < 0) return;
    buf[y * W + x] = ramp[Math.min(4, Math.round(i))];
  }
  px(x, y, i) { this.set(this.L.ga, FROSTc, x, y, i); this.set(this.L.gb, FURYc, x, y, i); }
  apx(x, y, i) { this.set(this.L.ga, FROSTc, x, y, i); }
  epx(x, y, i) { this.set(this.L.gb, FURYc, x, y, i); }
  line(x0, y0, x1, y1, i) { bres(x0, y0, x1, y1, (x, y) => this.px(x, y, i)); }
  eline(x0, y0, x1, y1, i) { bres(x0, y0, x1, y1, (x, y) => this.epx(x, y, i)); }
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
// Gefülltes Polygon (Bildschirmkoordinaten), f(x, y) je Pixel
function fillPoly(pts, f) {
  let y0 = Infinity, y1 = -Infinity;
  for (const [, y] of pts) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
    const yc = y + 0.5, xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) f(x, y);
  }
}

// Leucht-Frame (kein Treffer-Blitz nötig); Spiegelbild erst bei Bedarf
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
  // Leib
  len: 1, wave: 3, wph: 0, ox: 0, bulk: 1, chestH: 0,
  tailLift: 3, tailCurl: 0.35, tailSwing: 0, tailUp: 0,
  // Hals und Kopf
  hx: 20, hh: 46, hd: 0, nb: 0, ha: 0.28, jaw: 0.06, eye: 1,
  // Klauen: Fuß vorn (N = nah, F = fern) x-Versatz und Anheben
  fNx: 11, fNy: 0, fFx: 3, fFy: 0,
  // Leuchten
  heart: 1, crest: 0, breath: 0, glint: 0,
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

// Radius je Steuerpunkt (Schwanzspitze … Halsende)
const RAD = [1.3, 2.7, 4.5, 6.2, 7.6, 8.5, 8.9, 7.7, 6.6, 5.9];
const BODY_X = [-68, -57, -45, -32, -19, -7, 3];
const WAVE_AMP = [1, 1, 0.95, 0.85, 0.65, 0.35, 0.1];

// Steuerpunkte der Wirbelsäule aus einer Pose
function spinePoints(P) {
  const pts = [];
  for (let i = 0; i < 7; i++) {
    const x = 3 + (BODY_X[i] - 3) * P.len + P.ox * (0.4 + i * 0.1);
    const d = P.wave * Math.sin(P.wph + i * 1.15) * WAVE_AMP[i];
    const h = RAD[i] * P.bulk + 0.3 + P.chestH * [0, 0, 0, 0, 0.12, 0.5, 1][i];
    pts.push({ x, d, h });
  }
  // Schwanz: schwingt um Punkt 3 in der Bodenebene, hebt sich, rollt sich ein
  const piv = pts[3];
  const sw = [1, 0.8, 0.45];
  for (let i = 0; i < 3; i++) {
    const a = P.tailSwing * sw[i];
    const rx = pts[i].x - piv.x, rd = pts[i].d - piv.d;
    const c = Math.cos(a), s = Math.sin(a);
    pts[i].x = piv.x + rx * c - rd * s * 0.2;
    pts[i].d = piv.d + rx * -s * 0.62 + rd * c;
    pts[i].h += P.tailUp * [22, 13, 5][i] + P.tailLift * [1, 0.35, 0][i];
  }
  pts[0].x += P.tailCurl * 7 * Math.cos(P.tailSwing); pts[0].h += P.tailCurl * 7;
  pts[1].h += P.tailCurl * 2;
  // Hals: S-Kurve von der Brust zum Kopfansatz
  const c = pts[6];
  const hb = { x: P.hx + P.ox, d: P.hd, h: P.hh };
  pts.push({ x: c.x + (hb.x - c.x) * 0.22 - P.nb * 6, d: c.d + (hb.d - c.d) * 0.3, h: c.h + (hb.h - c.h) * 0.42 });
  pts.push({ x: c.x + (hb.x - c.x) * 0.62 + P.nb * 4, d: c.d + (hb.d - c.d) * 0.7, h: c.h + (hb.h - c.h) * 0.82 });
  pts.push(hb);
  return pts;
}

// Dichte Abtastung (Catmull-Rom) mit Bogenlänge u und Steuerparameter k
function sampleSpine(pts) {
  const n = pts.length;
  const P = (i) => pts[Math.max(0, Math.min(n - 1, i))];
  const ext = (i) => {
    if (i < 0) { const a = pts[0], b = pts[1]; return { x: 2 * a.x - b.x, d: 2 * a.d - b.d, h: 2 * a.h - b.h }; }
    if (i >= n) { const a = pts[n - 1], b = pts[n - 2]; return { x: 2 * a.x - b.x, d: 2 * a.d - b.d, h: 2 * a.h - b.h }; }
    return P(i);
  };
  const out = [];
  let u = 0, prev = null;
  for (let i = 0; i < n - 1; i++) {
    const p0 = ext(i - 1), p1 = P(i), p2 = P(i + 1), p3 = ext(i + 2);
    const segLen = Math.hypot(p2.x - p1.x, p2.d - p1.d, p2.h - p1.h);
    const steps = Math.max(2, Math.ceil(segLen * 1.25));
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      const q = { x: cr(p0.x, p1.x, p2.x, p3.x), d: cr(p0.d, p1.d, p2.d, p3.d), h: cr(p0.h, p1.h, p2.h, p3.h), k: i + t };
      if (prev) u += Math.hypot(q.x - prev.x, q.d - prev.d, q.h - prev.h);
      q.u = u; prev = q;
      out.push(q);
    }
  }
  const last = { ...pts[n - 1], k: n - 1 };
  last.u = u + Math.hypot(last.x - prev.x, last.d - prev.d, last.h - prev.h);
  out.push(last);
  for (const q of out) { q.sx = AX + q.x; q.sy = AY + q.d - q.h; }
  for (let i = 0; i < out.length; i++) {
    const a = out[Math.max(0, i - 2)], b = out[Math.min(out.length - 1, i + 2)];
    let tx = b.sx - a.sx, ty = b.sy - a.sy;
    const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    let nx = -ty, ny = tx;
    if (ny + 0.45 * nx < 0) { nx = -nx; ny = -ny; }
    Object.assign(out[i], { tx, ty, nx, ny });
  }
  return out;
}
const radAt = (k, bulk) => {
  const i = Math.max(0, Math.min(RAD.length - 2, Math.floor(k))), f = Math.min(1, k - i);
  return (RAD[i] + (RAD[i + 1] - RAD[i]) * f) * bulk;
};

// ---------------------------------------------------------------- Leib

const LX = -0.5, LY = -0.72, LZ = 0.48; // Lichtrichtung (links oben, zum Betrachter)

function drawBody(p, g, S, P, o) {
  const L = p.L;
  const heart = o.heartPt;
  let nextSpike = 5;
  for (let si = 0; si < S.length; si++) {
    const q = S[si];
    const r = radAt(q.k, P.bulk) * (q.k > 6.5 ? 1 : 1);
    const gy = AY + Math.round(q.d); // Bodenlinie dieses Stücks (darunter wird abgeschnitten)
    const R = Math.ceil(r + 0.5);
    const slice = si > 2 && si < S.length - 3;
    for (let yy = Math.floor(q.sy) - R; yy <= Math.ceil(q.sy) + R; yy++) {
      if (yy > gy + 1 || yy < 0 || yy >= H) continue;
      for (let xx = Math.floor(q.sx) - R; xx <= Math.ceil(q.sx) + R; xx++) {
        if (xx < 0 || xx >= W) continue;
        const dx = xx - q.sx, dy = yy - q.sy;
        const d2 = dx * dx + dy * dy;
        if (d2 > r * r + 0.6) continue;
        const a = dx * q.tx + dy * q.ty;
        if (slice && (a > 1.3 || a < -1.3)) continue;
        let v = (dx * q.nx + dy * q.ny) / r;
        v = Math.max(-1, Math.min(1, v));
        const U = q.u + a;
        const z = Math.sqrt(Math.max(0, 1 - v * v));
        const lum = (q.nx * v) * LX + (q.ny * v) * LY + z * LZ;
        const dith = (BAYER[(yy & 3) * 4 + (xx & 3)] - 7.5) / 16;
        const i = yy * W + xx;
        let c, m;
        const bellyEdge = q.k > 6.3 ? 0.18 : 0.42; // am Hals ist die Kehle breit sichtbar
        if (v > bellyEdge && r > 2.2) {
          // Bauchplatten: quer gerippt
          let idx = (lum + 0.5) * 3 + dith * 0.5;
          const fr = ((U / 3.1) % 1 + 1) % 1;
          if (fr < 0.26) idx -= 0.9;
          if (v > 0.93) idx -= 1;
          if (yy >= gy - 1 && q.h < r + 2) idx -= 1.5;
          c = BELLYc[Math.max(0, Math.min(4, Math.round(idx)))]; m = M_BELLY;
        } else {
          let idx = (lum + 0.42) * 3.7 + dith * 0.45;
          // Schuppen: versetzte Reihen, dunkle Hinterkante, heller Glanz an der Spitze
          const rows = (v + 1) * r / 2.7;
          const row = Math.floor(rows);
          const cellF = (U + (row & 1) * 1.9) / 3.8;
          const fr = cellF - Math.floor(cellF);
          if (fr < 0.22) idx -= 0.75;
          else if (fr > 0.7 && v < -0.2 && hash2(Math.floor(cellF), row, 7) < 0.5) idx += 0.7;
          if (v < -0.86) idx -= 0.8; // Rückengrat
          if (yy >= gy - 1 && q.h < r + 2) idx -= 1.5; // Bodenschatten
          c = SCALEc[Math.max(0, Math.min(6, Math.round(idx)))]; m = M_SCALE;
        }
        L.base[i] = c; L.mat[i] = m; L.ga[i] = 0; L.gb[i] = 0;
        // Frostherz schimmert durch die Brust (nur Bauchseite)
        if (heart && P.heart > 0.05) {
          const hd = Math.hypot(xx - heart.x, (yy - heart.y) * 1.2);
          const hr = 2.5 + P.heart * 2.2;
          if (hd < hr && v > -0.2) {
            const gi = hd < hr * 0.35 ? 3 : hd < hr * 0.7 ? 2 : 1;
            g.px(xx, yy, Math.min(4, gi + (P.heart > 2 ? 1 : 0)));
          }
        }
        // Phase 3: glühende Adern in den Schuppen
        if (m === M_SCALE && r > 2.5) {
          const vein = ((U * 0.16 + v * 2.3 + 40) % 2.2) - 1.1;
          if (Math.abs(vein) < 0.1 && hash2(Math.floor(U / 5), Math.floor(v * 3 + 5), 31) < 0.55) g.epx(xx, yy, v < 0 ? 2 : 1);
        }
      }
    }
    // Kristallstacheln auf dem Rücken
    if (q.u >= nextSpike && q.k > 0.45 && q.k < 8.6) {
      const sz = q.k > 6.6 ? 0.55 : 1;
      nextSpike = q.u + (q.k > 6.6 ? 5 : 6.3);
      spike(p, g, q, r, P, sz, o);
    }
  }
}

// Kristallstachel am Rücken eines Leibstücks
function spike(p, g, q, r, P, sz, o) {
  const hs = hash2(Math.round(q.u), 3, 91);
  const lean = 0.6 + (hs - 0.5) * 0.25;
  let dx = -q.nx * Math.cos(lean) - q.tx * Math.sin(lean);
  let dy = -q.ny * Math.cos(lean) - q.ty * Math.sin(lean);
  const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
  const flare = 1 + P.crest * 0.45;
  const len = (2.2 + r * 0.95) * (0.78 + hs * 0.45) * flare * sz;
  if (len < 2) return;
  const bw = (1.1 + r * 0.2) * sz;
  const bx = q.sx - q.nx * r * 0.8, by = q.sy - q.ny * r * 0.8;
  const tipx = bx + dx * len, tipy = by + dy * len;
  const b1 = [bx + q.tx * bw, by + q.ty * bw], b2 = [bx - q.tx * bw, by - q.ty * bw];
  // Welche Flanke zeigt zum Licht?
  const px = -dy, py = dx; // Normale zur Stachelachse
  const litSide = px * -0.6 + py * -0.8 > 0 ? 1 : -1;
  const frozen = o.frozen;
  fillPoly([b1, [tipx, tipy], b2], (x, y) => {
    const rx = x + 0.5 - bx, ry = y + 0.5 - by;
    const along = (rx * dx + ry * dy) / len;
    const side = rx * px + ry * py;
    let c;
    if (Math.abs(side) < 0.55) c = CRYS[along > 0.55 ? 4 : 3];
    else if (side * litSide > 0) c = along < 0.22 ? CRYS[1] : CRYS[3];
    else c = along < 0.22 ? CRYS[0] : CRYS[1];
    p.px(x, y, c, M_CRYS);
    if (!frozen) {
      if (Math.abs(side) < 0.8 && along > 0.35) g.px(x, y, along > 0.8 ? 3 : P.crest > 0.5 ? 2 : 1);
      else if (along > 0.25) g.epx(x, y, side * litSide > 0 ? 2 : 1);
    }
  });
  p.px(tipx, tipy, CRYS[4], M_CRYS);
  if (!frozen) { g.px(tipx, tipy, P.crest > 0.3 || P.glint > 0 ? 4 : 3); if (P.crest > 0.8) g.px(tipx + dx, tipy + dy, 2); }
}

// ---------------------------------------------------------------- Klauen

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
// Dickes Glied, Licht von links oben
function limb(p, x0, y0, x1, y1, w0, w1, ramp, m = M_SCALE) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len, ny = dx / len;
  if (nx + ny > 0) { nx = -nx; ny = -ny; }
  const steps = Math.ceil(len * 2);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, x = x0 + dx * t, y = y0 + dy * t;
    const hw = (w0 + (w1 - w0) * t) / 2;
    for (let k = -hw; k <= hw + 0.01; k += 0.5) {
      const c = k > hw - 1 ? ramp[3] : k < -hw + 1 ? ramp[0] : k > 0 ? ramp[2] : ramp[1];
      p.px(x + nx * k, y + ny * k, c, m);
    }
  }
}
function foreleg(p, sx, sy, fx, fy, near, lift) {
  const ramp = near ? [SCALE[1], SCALE[3], SCALE[4], SCALE[5]] : [SCALE[0], SCALE[1], SCALE[2], SCALE[3]];
  const j = ik(sx, sy, fx, fy - 2, 8.5, 8, -1);
  limb(p, sx, sy, j.jx, j.jy, 8, 6.5, ramp);
  limb(p, j.jx, j.jy, j.ex, j.ey, 6.5, 4.5, ramp);
  // Ellbogen-Stachel
  const cr = near ? CRYS : [CRYS[0], CRYS[0], CRYS[1], CRYS[2], CRYS[3]];
  p.line(j.jx - 1, j.jy, j.jx - 4, j.jy - 2, cr[2]); p.px(j.jx - 4, j.jy - 2, cr[3]);
  // Fuß mit drei Krallen
  const fxr = Math.round(j.ex), fyr = Math.round(j.ey);
  p.rect(fxr - 2, fyr, 5, 2, ramp[1]); p.rect(fxr - 2, fyr, 4, 1, ramp[2]);
  const cl = near ? HORN : [HORN[0], HORN[0], HORN[1], HORN[2], HORN[3]];
  const claws = lift > 2 ? [[3, 0], [4, 2], [2, 3]] : [[3, 1], [4, 2], [1, 2]];
  for (const [cx, cy] of claws) { p.px(fxr + cx - 1, fyr + cy, cl[2], M_CLAW); p.px(fxr + cx, fyr + cy, cl[3], M_CLAW); p.px(fxr + cx + 1, fyr + cy + (lift > 2 ? 1 : 0), cl[4], M_CLAW); }
}

// ---------------------------------------------------------------- Kopf

// Kopf in lokalen Koordinaten (u nach vorn, v nach unten), gedreht um ha.
function drawHead(p, g, bx, by, P, o) {
  const ca = Math.cos(P.ha), sa = Math.sin(P.ha);
  const HS = 1.28; // Kopf etwas größer als der Leib-Maßstab: lesbares Gesicht
  const T = (u, v) => [bx + (ca * u - sa * v) * HS, by + (sa * u + ca * v) * HS];
  const inv = (x, y) => { const dx = (x + 0.5 - bx) / HS, dy = (y + 0.5 - by) / HS; return [ca * dx + sa * dy, -sa * dx + ca * dy]; };
  const poly = (pts, shade, m) => fillPoly(pts.map(([u, v]) => T(u, v)), (x, y) => { const [u, v] = inv(x, y); const c = shade(u, v, x, y); if (c) p.px(x, y, c, m); });
  const frozen = o.frozen;
  const jawA = P.jaw * 0.78;
  const jc = Math.cos(jawA), js = Math.sin(jawA);
  const hingeU = 1, hingeV = 2.5;
  const J = (u, v) => [hingeU + jc * (u - hingeU) - js * (v - hingeV), hingeV + js * (u - hingeU) + jc * (v - hingeV)];
  const invJ = (u, v) => [hingeU + jc * (u - hingeU) + js * (v - hingeV), hingeV - js * (u - hingeU) + jc * (v - hingeV)];
  const dith = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] - 7.5) / 16;

  // Hintere Hörner (ferne Seite, dunkler)
  hornCurve(p, g, T, [[3, -6], [-5, -12], [-16, -11]], 4, 1, true, P, frozen);

  // Unterkiefer (dreht um das Kiefergelenk)
  const jaw = [[-2, 1], [8, 2.2], [17, 2.4], [22, 2.6], [22.5, 4], [18, 5.3], [9, 6.2], [1, 6.4], [-3, 4.5]];
  poly(jaw.map(([u, v]) => J(u, v)), (u, v, x, y) => {
    const [ju, jv] = invJ(u, v);
    let idx = 3.2 - (jv - 2.2) * 0.75 + dith(x, y) * 0.8;
    if (jv < 3.1 && ju > 3) idx += 0.8;
    if (((ju / 3) % 1) < 0.2 && jv > 4) idx -= 0.7;
    return SCALE[Math.max(1, Math.min(6, Math.round(idx)))];
  }, M_SCALE);
  // Kinnbart aus Eiszapfen
  for (const [u, len] of [[5, 3.5], [9, 4.5], [13, 2.5]]) {
    const [a0, b0] = J(u, 6.2), [a1, b1] = J(u - 1.2, 6.2 + len);
    const [x0, y0] = T(a0, b0), [x1, y1] = T(a1, b1);
    p.line(x0, y0, x1, y1, CRYS[1], M_CRYS); p.px(x1, y1, CRYS[3], M_CRYS);
    if (!frozen) g.px(x1, y1, 1);
  }
  // Untere Zähne
  for (const u of [10, 15, 20]) {
    const [a, b] = J(u, 2.2), [a2, b2] = J(u + 0.3, 0.6);
    const [x0, y0] = T(a, b), [x1, y1] = T(a2, b2);
    p.line(x0, y0, x1, y1, TEETH[1], M_HORN); p.px(x1, y1, TEETH[2], M_HORN);
  }
  // Rachen (sichtbar, wenn der Kiefer offen ist)
  const mouthGlow = [];
  if (P.jaw > 0.12) {
    const top = [[0, 2], [6, 2.1], [14, 2.1], [21, 2]];
    const bot = [[21, 2.4], [14, 2.4], [6, 2.3], [0, 2.3]].map(([u, v]) => J(u, v));
    poly([...top, ...bot], (u, v, x, y) => {
      const depth = (u + 2) / 24;
      const gl = P.breath;
      if (!frozen && gl > 0.05 && hash2(x, y, 13) < 0.25 + gl * 0.4) mouthGlow.push(x, y, Math.max(0, Math.min(3, Math.round(gl * 2.4 - depth * 2.2 + 0.6))));
      return depth < 0.35 ? MOUTH[0] : v > 3 + P.jaw * 4 && depth > 0.3 ? MOUTH[3] : depth < 0.7 ? MOUTH[1] : MOUTH[2];
    }, M_MOUTH);
    for (let i = 0; i < mouthGlow.length; i += 3) g.px(mouthGlow[i], mouthGlow[i + 1], mouthGlow[i + 2]);
  }

  // Schädel und Oberkiefer
  const skull = [[-6, -3], [-4, -7], [1, -9], [7, -9.2], [11, -7.4], [16, -5.8], [21, -4.8], [25, -3.8], [27, -2.2], [27, 0.4], [25, 2.2], [18, 2.4], [9, 2.5], [2, 3.4], [-4, 3.6]];
  poly(skull, (u, v, x, y) => {
    // Oberseite hell, Kiefer dunkler; Brauenwulst, Schnauzenkamm, Wangenplatten
    let idx = 4.3 - (v + 8) * 0.28 + dith(x, y) * 0.9;
    if (v > 0.8) idx -= 1.2;
    if (u > 4 && u < 13 && v < -6.3) idx += 1;            // Brauenwulst
    if (u > 13 && v < -3.6 && v > -5.4 && ((u | 0) % 3 === 0)) idx -= 1; // Schnauzenschuppen
    if (u < 4 && u > -4 && v > -1 && v < 2 && ((((u + v) / 2.5) % 1 + 1) % 1) < 0.3) idx -= 1; // Wangenplatten
    if (u > 21 && v < -1.6 && v > -3.4 && u < 24) idx = 0.5; // Nüster
    return SCALE[Math.max(0, Math.min(6, Math.round(idx)))];
  }, M_SCALE);
  // Brauenkristall über dem Auge
  hornCurve(p, g, T, [[9, -8.5], [5, -12], [0, -13.5]], 2.2, 0.8, false, P, frozen);
  // Obere Fangzähne (Eiszapfen)
  for (const [u, len] of [[9, 1.5], [13, 1.8], [18.5, 3.4], [23, 2]]) {
    const [x0, y0] = T(u, 2.3), [x1, y1] = T(u - 0.4, 2.3 + len);
    p.line(x0, y0, x1, y1, TEETH[1], M_HORN); p.px(x1, y1, TEETH[2], M_HORN);
    if (len > 3) p.px(x0, y0, TEETH[2], M_HORN);
  }
  // Auge
  const [ex, ey] = T(9.2, -4.9);
  const exr = Math.round(ex), eyr = Math.round(ey);
  p.px(exr - 1, eyr, SCALE[0]); p.px(exr, eyr + 1, SCALE[0]); p.px(exr + 1, eyr + 1, SCALE[0]); p.px(exr + 2, eyr, SCALE[0]);
  if (P.eye > 0.4 && !frozen) {
    p.px(exr, eyr, '#dffaff', M_EYE); p.px(exr + 1, eyr, '#8fe6ff', M_EYE);
    g.px(exr, eyr, 4); g.px(exr + 1, eyr, P.eye > 0.8 ? 3 : 2);
    if (P.eye > 0.8) { g.apx(exr - 1, eyr, 1); g.epx(exr - 1, eyr, 2); g.epx(exr + 2, eyr, 1); }
  } else {
    p.px(exr, eyr, SCALE[2]); p.px(exr + 1, eyr, SCALE[1]);
    if (!frozen && P.eye > 0.05) g.px(exr + 1, eyr, 1);
  }
  // Nüsterfrost
  if (!frozen) { const [nx, ny] = T(24, -2.6); g.apx(nx, ny, P.breath > 0.3 ? 2 : 0); g.epx(nx, ny, 1); }
  // Vordere Hörner: langes, zurückgeschwungenes Kristallhorn + kürzeres oberes
  hornCurve(p, g, T, [[1, -6.5], [-8, -14], [-21, -13]], 5, 1.2, false, P, frozen);
  hornCurve(p, g, T, [[4.5, -8], [0, -15], [-6, -19]], 3.6, 1, false, P, frozen);
  // Wangendorn nach hinten unten
  hornCurve(p, g, T, [[-1, 2], [-5, 5], [-8, 9]], 2.6, 1, false, P, frozen, true);

  const mouth = T(24 + P.jaw * 1, 2.5 + P.jaw * 5);
  return {
    mouth: { x: mouth[0], y: mouth[1] }, eye: { x: ex, y: ey },
    head: (([x, y]) => ({ x, y }))(T(8, -8)),
  };
}

// Kristallhorn entlang einer quadratischen Kurve (lokale Kopfkoordinaten)
function hornCurve(p, g, T, [[u0, v0], [u1, v1], [u2, v2]], w0, w1, far, P, frozen, dim = false) {
  const n = 16;
  const ramp = far || dim ? [CRYS[0], CRYS[0], CRYS[1], CRYS[2]] : [CRYS[0], CRYS[1], CRYS[2], CRYS[3]];
  let [px0, py0] = T(u0, v0);
  const gl = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n, s = 1 - t;
    const u = s * s * u0 + 2 * s * t * u1 + t * t * u2, v = s * s * v0 + 2 * s * t * v1 + t * t * v2;
    const [x, y] = T(u, v);
    const w = w0 + (w1 - w0) * t;
    limb(p, px0, py0, x, y, w, Math.max(1, w - (w0 - w1) / n), t > 0.8 && !far ? [CRYS[1], CRYS[3], CRYS[4], CRYS[4]] : ramp, M_CRYS);
    if (!frozen) gl.push(x, y, t);
    px0 = x; py0 = y;
  }
  // Leuchten erst nach allen Segmenten (sonst decken spätere Segmente es ab)
  for (let i = 0; i < gl.length; i += 3) {
    const x = gl[i], y = gl[i + 1], t = gl[i + 2];
    if (!far && !dim) {
      if (t > 0.5) g.px(x, y, t > 0.88 ? 4 : t > 0.7 ? 3 : 2);
      else if (t > 0.25) g.epx(x, y, 2);
    } else if (far && t > 0.75) g.px(x, y, 1);
  }
}

// ---------------------------------------------------------------- Figur

// Zeichnet den Wurm aus Steuerpunkten. o: { frozen, hole, holeFront, rubble }
function drawWyrm(L, P, pts, o = {}) {
  const p = new Pen(L), g = new GlowPen(L);
  if (o.hole) drawHole(p, g, o.hole, false);
  const S = sampleSpine(pts);
  // Brust / Frostherz: am Übergang Leib -> Hals
  const hs = S.find((q) => q.k >= 6.25) ?? S[S.length - 1];
  const r6 = radAt(hs.k, P.bulk);
  o.heartPt = { x: hs.sx + hs.nx * r6 * 0.35, y: hs.sy + hs.ny * r6 * 0.35 };
  // Schulterpunkt für die Klauen
  const sh = S.find((q) => q.k >= 5.85) ?? S[0];
  const showLegs = !o.noLegs && sh.h > 2;
  if (showLegs) foreleg(p, sh.sx - 1, sh.sy + 1, AX + P.fFx + P.ox * 0.5, AY - 2 - P.fFy, false, P.fFy);
  drawBody(p, g, S, P, o);
  if (showLegs) foreleg(p, sh.sx + 2, sh.sy + 3, AX + P.fNx + P.ox * 0.5, AY + 2 - P.fNy, true, P.fNy);
  const end = S[S.length - 1];
  let meta = {};
  const headVisible = !o.headBelow;
  if (headVisible) meta = drawHead(p, g, end.sx, end.sy, P, o);
  else meta = { mouth: { x: end.sx, y: end.sy }, eye: { x: end.sx, y: end.sy }, head: { x: end.sx, y: end.sy } };
  if (o.clipHead) clipBelow(L, o.clipHead);
  if (o.hole) drawHole(p, g, o.hole, true);
  meta.chest = o.heartPt;
  meta.tail = { x: S[0].sx, y: S[0].sy };
  rimLight(L);
  return meta;
}

// Alles unterhalb der Bodenlinie im Bereich eines Lochs wegschneiden
function clipBelow(L, { x0, x1, y }) {
  for (let yy = Math.max(0, Math.round(y) + 1); yy < H; yy++) for (let xx = Math.max(0, Math.round(x0)); xx <= Math.min(W - 1, Math.round(x1)); xx++) {
    const i = yy * W + xx; L.base[i] = 0; L.ga[i] = 0; L.gb[i] = 0; L.mat[i] = 0;
  }
}

// Helle Kante oben/links, damit sich der Wurm vom dunklen Boden abhebt
function rimLight(L) {
  const rim = col(RIM), rim2 = col(RIM2);
  const top = [];
  for (let y = 1; y < H; y++) for (let x = 1; x < W; x++) {
    const i = y * W + x, m = L.mat[i];
    if (m !== M_SCALE && m !== M_CLAW && m !== M_BELLY) continue;
    if (!L.base[i - W]) top.push(i, 1);
    else if (!L.base[i - 1]) top.push(i, 2);
  }
  for (let k = 0; k < top.length; k += 2) { const i = top[k]; if (!L.ga[i]) L.base[i] = top[k + 1] === 1 ? rim : rim2; }
}

// Eisloch im Boden (hinterer Teil vor dem Leib, vorderer Rand danach)
function drawHole(p, g, h, front) {
  const { x, y, r, crack = 1, ry = 0.42 } = h;
  const nS = Math.max(9, Math.round(r * 0.6));
  if (!front) {
    p.ellipse(x, y, r + 2, (r + 2) * ry, '#1b3246');
    p.ellipse(x, y, r, r * ry * 0.95, '#060a12');
    p.ellipse(x - 1, y - 1, r - 2, (r - 2) * ry * 0.8, '#03050a');
    for (let i = 0; i < nS; i++) {
      const a = Math.PI + (i / (nS - 1)) * Math.PI;
      const cx = x + Math.cos(a) * (r + 1), cy = y + Math.sin(a) * (r + 1) * ry;
      const hgt = 1 + hash2(i, 5, 71) * 3.5 * crack;
      if (hash2(i, 4, 71) < 0.8) slab(p, g, cx, cy, 1.5 + hash2(i, 6, 71) * 2.5, hgt, hash2(i, 7, 71));
    }
    return;
  }
  for (let i = 0; i < nS; i++) {
    const a = (i / (nS - 1)) * Math.PI;
    const cx = x + Math.cos(a) * (r + 1), cy = y + Math.sin(a) * (r + 1) * ry;
    const hgt = 1 + hash2(i, 8, 71) * 4.5 * crack;
    if (hash2(i, 11, 71) < 0.85) slab(p, g, cx, cy, 1.5 + hash2(i, 9, 71) * 3, hgt, hash2(i, 10, 71));
  }
}
// Hochgestellte Eisplatte (Trümmer)
function slab(p, g, x, y, w, h, s) {
  const tilt = (s - 0.5) * 2.4;
  fillPoly([[x - w, y + 0.5], [x - w + tilt, y - h], [x + w * 0.4 + tilt, y - h - 1 + s * 2], [x + w, y + 0.5]], (xx, yy) => {
    const t = (y - yy) / Math.max(1, h);
    const left = xx < x - w * 0.2 + tilt * t;
    p.px(xx, yy, left ? (t > 0.7 ? CRYS[4] : CRYS[2]) : t > 0.7 ? CRYS[2] : CRYS[1], M_CRYS);
  });
  if (s > 0.5) g.px(x + tilt - w * 0.5, y - h + 0.5, 1);
}

// ---------------------------------------------------------------- Rahmen

function finish(L, fx, meta) {
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
  const ox = AX + ANCHOR_DX;
  const f = buildFrame(cw, ch, ox - x0, AY - y0, (pc) => pc.ctx.drawImage(baseC, 0, 0));
  f.glow = new GlowFrame(toCanvas(L.ga), ox - x0, AY - y0);
  f.glowEnraged = new GlowFrame(toCanvas(L.gb), ox - x0, AY - y0);
  f.meta = {};
  for (const k in meta) if (meta[k]) f.meta[k] = { dx: Math.round(meta[k].x - ox), dy: Math.round(meta[k].y - AY) };
  f.fx = fx ?? null;
  return f;
}

function frame(P, extra = {}) {
  const L = new Layers();
  const meta = drawWyrm(L, P, extra.pts ?? spinePoints(P), extra);
  if (extra.smear) tailSmear(L, extra.smear);
  if (extra.post) extra.post(L, meta);
  return finish(L, extra.fx, meta);
}

function track(keys, n, { loop = false, extras = {}, fn = null } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = loop ? i / n : n === 1 ? 1 : i / (n - 1);
    const P = sample(keys, t);
    out.push(frame(P, { ...(fn ? fn(P, t, i) : {}), ...(extras[i] ?? {}) }));
  }
  return out;
}

// Frost-Schleier hinter der Schwanzspitze (Schwanzfeger)
function tailSmear(L, { P0, P1, n = 6 }) {
  const p = new Pen(L), g = new GlowPen(L);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const S = sampleSpine(spinePoints(mix(P0, P1, t)));
    pts.push([S[0].sx, S[0].sy, S[4]?.sx ?? S[0].sx, S[4]?.sy ?? S[0].sy]);
  }
  for (let i = 0; i < n; i++) {
    const [ax, ay, bx, by] = pts[i], [cx, cy, dx, dy] = pts[i + 1];
    const fresh = (i + 1) / n;
    fillPoly([[ax, ay], [cx, cy], [dx, dy], [bx, by]], (x, y) => {
      const i2 = y * W + x;
      if (x < 0 || y < 0 || x >= W || y >= H || L.base[i2]) return;
      if (hash2(x, y, 5) > 0.3 + fresh * 0.55) return;
      p.px(x, y, fresh > 0.7 ? '#e8faff' : fresh > 0.4 ? '#a8dcee' : '#5a9ab8', M_CRYS);
      if (fresh > 0.45) g.px(x, y, fresh > 0.8 ? 3 : 2);
    });
  }
}

// Zuschnappen: helle Bissbögen vor dem Maul (Trefferframe)
function snapFx(L, meta) {
  const p = new Pen(L), g = new GlowPen(L);
  const m = meta.mouth;
  for (const [r, a0, a1] of [[7, -1.1, 0.2], [10, -0.9, 0.5], [7, 0.5, 1.5]]) {
    for (let a = a0; a <= a1; a += 0.12) {
      const x = m.x + 2 + Math.cos(a) * r, y = m.y + Math.sin(a) * r * 0.8;
      const i = Math.round(y) * W + Math.round(x);
      if (L.base[i]) continue;
      p.px(x, y, r > 8 ? '#9ae4f8' : '#ffffff', M_CRYS);
      g.px(x, y, r > 8 ? 2 : 3);
    }
  }
}

// ---------------------------------------------------------------- Eingraben / Auftauchen

// Eingraben: der Leib fließt entlang einer festen Bahn ins Loch vor ihm.
const HOLE_DX = 34;
function burrowFrames(P0, n) {
  const emerge = false;
  const base = spinePoints(P0);
  const hb = base[base.length - 1];
  const hole = { x: AX + HOLE_DX, y: AY + 3, r: 11 };
  const path = [...base,
    { x: hb.x + 9, d: 1, h: hb.h + 2 },
    { x: HOLE_DX - 1, d: 2.5, h: 22 },
    { x: HOLE_DX, d: 3, h: 4 },
    { x: HOLE_DX, d: 3, h: -30 },
    { x: HOLE_DX, d: 3, h: -400 },
  ];
  const S = sampleSpine(path);
  const uAt = (k) => S.find((q) => q.k >= k - 1e-6)?.u ?? 0;
  const uCtl = base.map((_, i) => uAt(i));
  const posAt = (u) => {
    let lo = 0, hi = S.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m].u < u) lo = m; else hi = m; }
    const a = S[lo], b = S[hi], t = (u - a.u) / Math.max(1e-6, b.u - a.u);
    return { x: a.x + (b.x - a.x) * t, d: a.d + (b.d - a.d) * t, h: a.h + (b.h - a.h) * t };
  };
  const uHole = S.find((q) => q.k > base.length && q.h <= 0)?.u ?? uCtl[uCtl.length - 1] + 60;
  const total = uHole + 6;
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    // Eingraben: langsam anfangen, dann hineinrauschen. Auftauchen: explosiv heraus, dann auslaufen.
    const k = emerge ? 1 - Math.pow(1 - t, 2.6) : t * t * 0.55 + t * 0.45;
    const off = emerge ? total * (1 - k) : total * k * 1.02;
    const pts = uCtl.map((u) => posAt(u + off));
    const a = posAt(uCtl[uCtl.length - 1] + off - 3), b = posAt(uCtl[uCtl.length - 1] + off + 3);
    let ha = Math.atan2((b.d - b.h) - (a.d - a.h), b.x - a.x);
    // Auftauchen: Kopf zeigt beim Durchbrechen steil nach oben, dreht sich dann in die Ruhepose
    if (emerge) { const w = ease(Math.max(0, Math.min(1, (k - 0.5) / 0.5))); ha = -1.25 + (P0.ha + 0.1 + 1.25) * w; }
    const q = emerge ? 1 - k : t;
    const P = { ...P0, ha: Math.max(-1.6, Math.min(1.65, ha - 0.1)), jaw: emerge ? 0.3 + 0.7 * Math.min(1, (1 - q) * 1.4) * (q > 0.05 ? 1 : 0.4) : 0.35 * (1 - t), fNy: q > 0.3 ? 6 : 0, heart: 1 + q, crest: emerge ? 0.6 : P0.crest };
    const headBelow = pts[pts.length - 1].h < -6;
    const L = new Layers();
    const crack = emerge ? 1.6 - t * 0.6 : 0.6 + t;
    const meta = drawWyrm(L, P, pts, { hole: { ...hole, crack }, headBelow, noLegs: q > 0.35, clipHead: { x0: hole.x - 14, x1: hole.x + 14, y: hole.y } });
    if (emerge) { if (t < 0.6) burst(L, hole.x, hole.y, t / 0.6); }
    else if (t > 0.15 && t < 0.9) spray(L, hole.x, hole.y, t, 11 + i);
    const fx = emerge ? (i === 0 ? 'impact' : i === 4 ? 'roar' : null) : i === 3 ? 'impact' : null;
    out.push(finish(L, fx, { ...meta, hole: { x: hole.x, y: hole.y } }));
  }
  return out;
}

// Auftauchen: der ganze Leib bricht wie ein Wal durch die Eisdecke (Kopf zuerst,
// weil er am höchsten liegt), dann senkt er sich in die Ruhepose.
function emergeFrames(Pb, Pend, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const k = Math.min(1, t / 0.42);
    const sink = 78 * Math.pow(1 - snap(k), 1.2);
    const P = t < 0.42 ? { ...Pb } : mix(Pb, Pend, ease((t - 0.42) / 0.58));
    const pts = spinePoints(P).map((q) => ({ ...q, h: q.h - sink }));
    const L = new Layers();
    const rift = { x: AX - 20, y: AY + 1, r: 50, ry: 0.2, crack: 1.5 - t * 0.7 };
    const meta = drawWyrm(L, P, pts, { noLegs: sink > 5, hole: t < 0.95 ? { ...rift, r: t < 0.55 ? rift.r : rift.r * (1 - (t - 0.55) * 1.9) } : null, clipHead: sink > 0.5 ? { x0: 0, x1: W - 1, y: AY + 1 } : null });
    if (t < 0.62) burst(L, AX + 6, AY + 1, t / 0.62);
    out.push(finish(L, i === 0 ? 'impact' : i === 3 ? 'roar' : null, meta));
  }
  return out;
}

// Splitter, die aus einem Loch fliegen (im Bild)
function spray(L, x, y, t, seed) {
  const p = new Pen(L), g = new GlowPen(L);
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI * (0.15 + 0.7 * hash2(i, seed, 41)), s = 10 + hash2(i, seed, 42) * 18;
    const px = x + Math.cos(a) * s, py = y + Math.sin(a) * s * 0.8;
    p.px(px, py, i % 3 ? CRYS[3] : CRYS[4], M_CRYS);
    if (i % 2) p.px(px + 1, py, CRYS[2], M_CRYS);
    if (i % 3 === 0) g.px(px, py, 2);
  }
}
function burst(L, x, y, t) {
  const p = new Pen(L), g = new GlowPen(L);
  for (let i = 0; i < 22; i++) {
    const a = -Math.PI * hash2(i, 1, 43), sp = 20 + hash2(i, 2, 43) * 50;
    const tt = t * 1.4;
    const px = x + Math.cos(a) * sp * tt * 1.3, py = y + (Math.sin(a) * sp * tt - 0 + 140 * tt * tt) * 0.7;
    if (py > y + 4 || tt > 1) continue;
    const s = 1 + (hash2(i, 3, 43) * 2.5 | 0);
    for (let k = 0; k < s; k++) { p.px(px + k, py, k ? CRYS[2] : CRYS[4], M_CRYS); p.px(px + k, py + 1, CRYS[1], M_CRYS); }
    if (i % 3 === 0) g.px(px, py, 3);
  }
}

// ---------------------------------------------------------------- Tod: erstarren und zerspringen

// Voronoi-Zellen (Scherben) über dem Bild
function cellOf(x, y) {
  const S = 8;
  const gx = Math.floor(x / S), gy = Math.floor(y / S);
  let best = 1e9, id = 0, cx = 0, cy = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const X = gx + i, Y = gy + j;
    const sx = (X + 0.15 + hash2(X, Y, 61) * 0.7) * S, sy = (Y + 0.15 + hash2(X, Y, 62) * 0.7) * S;
    const d = (sx - x) * (sx - x) + (sy - y) * (sy - y);
    if (d < best) { best = d; id = (X + 500) * 1000 + (Y + 500); cx = sx; cy = sy; }
  }
  return { id, cx, cy };
}

// Erstarren: Eis breitet sich vom Herz aus (f 0..1), dann Risse (crack 0..1)
function freezeFrame(P, f, crack, fx) {
  const L = new Layers();
  const meta = drawWyrm(L, P, spinePoints(P), {});
  const hx = meta.chest.x, hy = meta.chest.y;
  const reach = f * 150;
  const cells = new Int32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!L.base[i]) continue;
    const d = Math.hypot(x - hx, (y - hy) * 1.1) + hash2(x >> 2, y >> 2, 63) * 10;
    if (d < reach) {
      L.base[i] = frozenOf(L.base[i]);
      L.ga[i] = 0; L.gb[i] = 0;
      if (d > reach - 5) { L.ga[i] = FROSTc[3]; L.gb[i] = FURYc[3]; } // Frostfront
    }
    if (crack > 0) cells[i] = cellOf(x, y).id;
  }
  if (crack > 0) {
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!L.base[i]) continue;
      if (cells[i] !== cells[i + 1] || cells[i] !== cells[i + W]) {
        if (hash2(cells[i] % 997, 1, 64) < crack * 1.1) {
          L.base[i] = FROZENc[4];
          const gi = crack > 0.7 ? 4 : crack > 0.35 ? 3 : 2;
          L.ga[i] = FROSTc[gi]; L.gb[i] = FURYc[gi];
        }
      }
    }
  }
  return { L, meta, frame: finish(L, fx, meta) };
}

// Zerspringen: Zellen des gefrorenen Bildes fliegen auseinander und fallen
function shatterFrames(src, meta, n) {
  const hx = meta.chest.x;
  const cells = new Map();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!src.base[i]) continue;
    const c = cellOf(x, y);
    let e = cells.get(c.id);
    if (!e) { e = { id: c.id, px: [], maxY: 0, cx: c.cx, cy: c.cy }; cells.set(c.id, e); }
    e.px.push(i);
    e.maxY = Math.max(e.maxY, y);
  }
  const out = [];
  for (let f = 0; f < n; f++) {
    const t = (f + 1) / n;
    const L = new Layers();
    for (const e of cells.values()) {
      const h1 = hash2(e.id % 1009, 1, 65), h2 = hash2(e.id % 1013, 2, 65), h3 = hash2(e.id % 1019, 3, 65);
      const vx = (e.cx - hx) * (0.25 + h1 * 0.35) + (h2 - 0.5) * 20;
      const vy = -(8 + h3 * 22);
      const tt = t * 1.25;
      let dx = vx * tt, dy = vy * tt + 150 * tt * tt;
      // Boden: jede Scherbe landet etwas vor/hinter der Grundlinie
      const ground = AY + 1 + Math.round((h2 - 0.5) * 12);
      const fall = ground - e.maxY;
      let landed = false;
      if (dy > fall) { dy = fall; landed = true; dx = vx * Math.min(tt, 0.9); }
      const flat = landed ? 0.5 : 1;
      for (const i of e.px) {
        const x = i % W, y = (i / W) | 0;
        const ny = landed ? Math.round(e.maxY + dy - (e.maxY - y) * flat) : Math.round(y + dy);
        const nx = Math.round(x + dx);
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        L.base[j] = src.base[i]; L.mat[j] = M_CRYS;
        const fade = t < 0.4 ? 1 : 0;
        if (src.ga[i] && fade) { L.ga[j] = src.ga[i]; L.gb[j] = src.gb[i]; }
        else if (!landed && ((x + y) & 7) === 0) { L.ga[j] = FROSTc[1]; L.gb[j] = FURYc[1]; }
      }
    }
    out.push(finish(L, f === 0 ? 'shatter' : f === n - 1 ? 'impact' : null, { chest: { x: hx, y: AY - 6 }, head: { x: hx + 10, y: AY - 10 } }));
  }
  return out;
}

// ---------------------------------------------------------------- Zusatzgrafik (Säulen, Eiszapfen, Riss)

function pillarFrame(h, broken = 0) {
  const PW = 22, PH = 48, ax = 11, ay = 44;
  const L = { base: new Uint32Array(PW * PH), glow: new Uint32Array(PW * PH) };
  const put = (buf, x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < PW && y < PH) buf[y * PW + x] = c; };
  // Säule aus 3 Kristallen (Mitte hoch, Seiten niedriger), h = 0..1 Wachstum
  const shards = [[0, 7, 38], [-6, 4.5, 24], [6, 4, 20], [-2, 3, 30]];
  for (const [ox, w, hh] of shards) {
    const top = ay - hh * h;
    for (let y = Math.floor(top); y <= ay; y++) {
      const t = (ay - y) / Math.max(1, hh * h);
      const hw = w * (t > 0.78 ? (1 - t) / 0.22 : 1) * 0.5 + 0.5;
      for (let x = -hw; x <= hw; x += 1) {
        const xx = ax + ox + x + (t > 0.78 ? ox * 0.1 : 0);
        if (broken && hash2(Math.round(xx), y, 81) < broken * 0.9 * (t + 0.2)) continue;
        const e = x / hw;
        const c = e < -0.45 ? CRYS[3] : e < 0.05 ? CRYS[2] : e < 0.55 ? CRYS[1] : CRYS[0];
        put(L.base, xx, y, col(t > 0.85 && e < 0 ? CRYS[4] : c));
        if (Math.abs(e) < 0.2 && t > 0.2) put(L.glow, xx, y, FROSTc[t > 0.8 ? 3 : 1]);
      }
    }
  }
  // Frostsockel
  for (let x = -9; x <= 9; x++) { put(L.base, ax + x, ay + 1, col(CRYS[1])); if (Math.abs(x) < 7) put(L.base, ax + x, ay, col(CRYS[3])); }
  const toC = (buf) => { const c = makeCanvas(PW, PH), ctx = c.getContext('2d'); const img = ctx.createImageData(PW, PH); new Uint32Array(img.data.buffer).set(buf); ctx.putImageData(img, 0, 0); return c; };
  const baseC = toC(L.base);
  const f = buildFrame(PW, PH, ax, ay, (pc) => pc.ctx.drawImage(baseC, 0, 0));
  f.glow = new GlowFrame(toC(L.glow), ax, ay);
  return f;
}

function icicleFrame() {
  const PW = 9, PH = 22, ax = 4, ay = 21;
  const base = new Uint32Array(PW * PH), glow = new Uint32Array(PW * PH);
  for (let y = 0; y < PH; y++) {
    const t = y / (PH - 1);
    const hw = Math.max(0, 3.4 * (1 - t) + 0.3);
    for (let x = -hw; x <= hw; x += 1) {
      const xx = Math.round(ax + x); if (xx < 0 || xx >= PW) continue;
      const e = x / (hw || 1);
      base[y * PW + xx] = col(e < -0.4 ? CRYS[4] : e < 0.2 ? CRYS[3] : CRYS[1]);
      if (Math.abs(e) < 0.3) glow[y * PW + xx] = FROSTc[t > 0.7 ? 4 : 2];
    }
  }
  const toC = (buf) => { const c = makeCanvas(PW, PH), ctx = c.getContext('2d'); const img = ctx.createImageData(PW, PH); new Uint32Array(img.data.buffer).set(buf); ctx.putImageData(img, 0, 0); return c; };
  const baseC = toC(base);
  const f = buildFrame(PW, PH, ax, ay, (pc) => pc.ctx.drawImage(baseC, 0, 0));
  f.glow = new GlowFrame(toC(glow), ax, ay);
  return f;
}

// Gefrorener Riss im Boden (Dekal nach Einschlägen/Auftauchen)
export function createFrostCrack(size = 56) {
  const S = size, Hh = Math.round(size * 0.55);
  const c = makeCanvas(S, Hh), ctx = c.getContext('2d');
  const img = ctx.createImageData(S, Hh), d = new Uint32Array(img.data.buffer);
  const put = (x, y, hex) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < S && y < Hh) d[y * S + x] = col(hex); };
  const cx = S / 2, cy = Hh / 2;
  for (let y = 0; y < Hh; y++) for (let x = 0; x < S; x++) {
    const e = Math.hypot((x - cx) / (S * 0.36), (y - cy) / (Hh * 0.36));
    if (e < 1 && hash2(x, y, 83) < 0.55 * (1 - e)) put(x, y, e < 0.4 ? '#a8d4e4' : '#6a9cb4');
  }
  for (let i = 0; i < 10; i++) {
    let x = cx, y = cy;
    const a = (i / 10) * Math.PI * 2 + hash2(i, 1, 84) * 0.5;
    const len = S * (0.2 + hash2(i, 2, 84) * 0.25);
    for (let s = 0; s < len; s++) {
      x += Math.cos(a + (hash2(i, s, 85) - 0.5) * 0.9);
      y += Math.sin(a + (hash2(i, s, 86) - 0.5) * 0.9) * 0.55;
      put(x, y, s < len * 0.5 ? '#0c1826' : '#1e3448');
      if (s < len * 0.6) put(x, y - 1, '#d8f2fa');
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ---------------------------------------------------------------- Animationen

export function createSkalvyrSprites() {
  // --- Grundposen
  const idleA = pose();
  const idleB = pose({ bulk: 1.035, chestH: 1.2, hh: 47.5, hx: 19, ha: 0.24, jaw: 0.12, wph: 0.35, tailCurl: 0.55, heart: 1.5, nb: 0.15 });

  // Kriechen: Wellen laufen den Leib entlang, die Klauen greifen abwechselnd
  const walkKeys = [];
  for (let i = 0; i <= 10; i++) {
    const ph = (i / 10) * Math.PI * 2, s = Math.sin(ph), c = Math.cos(ph);
    walkKeys.push([i / 10, pose({
      wave: 5.5, wph: -ph, ox: s * 1.2, chestH: Math.max(0, c) * 1.5,
      hx: 22 + s * 1.5, hh: 43 + Math.abs(c) * 2, ha: 0.32 + s * 0.05, nb: 0.25 + c * 0.15,
      fNx: 7 + s * 7, fNy: Math.max(0, c) * 4, fFx: 1 - s * 7, fFy: Math.max(0, -c) * 4,
      tailCurl: 0.2, tailSwing: s * 0.18, tailLift: 2, jaw: 0.1,
    }), linear]);
  }

  // Schlaf: eingerollt, der Kopf liegt flach vor der Brust, Augen zu
  const coil = pose({
    len: 0.74, wave: 8, wph: 0.6, hx: 26, hh: 9, hd: 3, ha: 0.08, nb: -0.3, jaw: 0, eye: 0,
    tailSwing: 1.35, tailCurl: 0.1, tailLift: 1, heart: 0.5, crest: -0.35, chestH: -1, fNx: 16, fFx: 10,
  });
  const coilB = { ...coil, bulk: 1.03, heart: 0.8, chestH: -0.4 };
  const rise = pose({ len: 0.85, wave: 6, wph: 0.3, hx: 18, hh: 34, ha: 0.1, nb: 0.4, jaw: 0.1, eye: 1, heart: 1.5, tailSwing: 0.7, chestH: 2 });
  const roarP = pose({ chestH: 11, hx: 11, hh: 72, ha: -0.62, nb: 0.6, jaw: 1, crest: 1, heart: 2.8, fNx: 14, fNy: 4, fFx: 6, fFy: 2, tailCurl: 0.9, tailLift: 7, bulk: 1.06, glint: 1 });
  const roarP2 = { ...roarP, hh: 74, ha: -0.7, hx: 10, jaw: 0.92, heart: 3, tailCurl: 1 };

  // Biss: Kopf zurückziehen (S-Kurve), dann vorschnellen und zuschnappen
  const bw1 = pose({ hx: 8, hh: 52, ha: -0.05, nb: 0.9, jaw: 0.25, chestH: 2, ox: -3, fNx: 9, tailCurl: 0.6 });
  const bw2 = pose({ hx: 4, hh: 54, ha: -0.18, nb: 1.2, jaw: 0.7, chestH: 3, ox: -5, fNx: 8, tailCurl: 0.7, crest: 0.3 });
  const bs1 = pose({ hx: 44, hh: 22, ha: 0.55, nb: -0.3, jaw: 1, chestH: 1, ox: 5, fNx: 15, fFx: 7, tailCurl: 0.3 });
  const bs2 = pose({ hx: 50, hh: 15, ha: 0.62, nb: -0.4, jaw: 0.05, chestH: 0, ox: 7, fNx: 16, fFx: 8, tailCurl: 0.2 });
  const bs3 = pose({ hx: 36, hh: 26, ha: 0.45, nb: -0.1, jaw: 0.15, chestH: 0.5, ox: 4, fNx: 14, fFx: 6 });

  // Schwanzfeger: Schwanz hoch und nach hinten weg, dann in weitem Bogen herum
  const tw1 = pose({ tailSwing: -0.5, tailUp: 0.7, tailCurl: 0.9, hx: 15, hh: 44, ha: 0.35, nb: 0.4, jaw: 0.3, crest: 0.4, chestH: 2 });
  const tw2 = pose({ tailSwing: -0.85, tailUp: 1.05, tailCurl: 1.2, hx: 13, hh: 46, ha: 0.3, nb: 0.5, jaw: 0.45, crest: 0.6, chestH: 3, wave: 5, wph: 0.8 });
  const ts1 = pose({ tailSwing: 0.6, tailUp: 0.5, tailCurl: 0.2, hx: 22, hh: 40, ha: 0.4, nb: 0.1, jaw: 0.6, crest: 0.6, chestH: 1, wave: 5, wph: -0.5 });
  const ts2 = pose({ tailSwing: 1.75, tailUp: 0.15, tailCurl: -0.1, hx: 24, hh: 40, ha: 0.42, nb: 0, jaw: 0.3, crest: 0.5, wave: 6, wph: -1.2 });
  const ts3 = pose({ tailSwing: 1.25, tailUp: 0.05, tailCurl: 0.1, hx: 22, hh: 43, ha: 0.35, jaw: 0.15, crest: 0.2, wave: 4, wph: -0.8 });

  // Frostatem: einatmen (Brust schwillt, Rachen glüht), dann Kopf vor und speien
  const aw1 = pose({ hx: 10, hh: 60, ha: -0.3, nb: 0.5, jaw: 0.35, chestH: 6, bulk: 1.07, heart: 2.4, breath: 0.4, fNx: 12, fNy: 2 });
  const aw2 = pose({ hx: 8, hh: 64, ha: -0.42, nb: 0.6, jaw: 0.55, chestH: 8, bulk: 1.1, heart: 3, breath: 0.75, fNx: 12, fNy: 3, crest: 0.5 });
  const br1 = pose({ hx: 30, hh: 36, ha: 0.46, nb: -0.2, jaw: 1, chestH: 3, heart: 2.5, breath: 1, fNx: 15, fFx: 7, crest: 0.6 });
  const br2 = { ...br1, hx: 31, hh: 35, ha: 0.49, jaw: 0.94, heart: 2.2, wph: 0.3, bulk: 0.98 };

  // Eissplitter-Ruf: aufbäumen, zur Decke brüllen
  const cw1 = pose({ chestH: 7, hx: 12, hh: 64, ha: -0.5, nb: 0.5, jaw: 0.5, heart: 2, crest: 0.6, fNy: 3 });
  const cw2 = pose({ chestH: 12, hx: 9, hh: 76, ha: -0.95, nb: 0.7, jaw: 1, heart: 3, crest: 1.2, fNy: 6, fFy: 3, tailCurl: 1, tailLift: 8, glint: 1 });

  // Stampfen (Eiswände): hoch aufrichten, Klauen heben, auf den Boden krachen
  const sw1 = pose({ chestH: 14, hx: 10, hh: 66, ha: -0.35, nb: 0.4, jaw: 0.6, heart: 2.2, fNx: 12, fNy: 14, fFx: 6, fFy: 12, crest: 0.7, tailCurl: 0.8 });
  const sw2 = pose({ chestH: 19, hx: 7, hh: 72, ha: -0.5, nb: 0.5, jaw: 0.9, heart: 2.8, fNx: 11, fNy: 18, fFx: 5, fFy: 16, crest: 1, tailCurl: 1, tailLift: 6 });
  const sl1 = pose({ chestH: -1, hx: 30, hh: 24, ha: 0.6, nb: -0.2, jaw: 1, heart: 2.5, fNx: 19, fFx: 12, crest: 1, bulk: 0.97 });
  const sl2 = pose({ chestH: -1.5, hx: 32, hh: 22, ha: 0.62, nb: -0.3, jaw: 0.7, heart: 2, fNx: 19, fFx: 12, crest: 0.8, bulk: 0.96, ox: 2 });

  // Frostnova: eng einrollen, Stacheln aufstellen, dann explosiv aufrichten
  const nw1 = pose({ len: 0.8, wave: 6, wph: 0.5, hx: 16, hh: 30, ha: 0.45, nb: 0.3, jaw: 0.25, heart: 2.6, crest: 1.1, tailSwing: 0.8, bulk: 1.05, chestH: -1 });
  const nw2 = { ...nw1, hh: 28, heart: 3.2, crest: 1.45, bulk: 1.09, jaw: 0.35, glint: 1 };
  const nr1 = pose({ len: 0.95, chestH: 10, hx: 12, hh: 70, ha: -0.6, nb: 0.6, jaw: 1, heart: 3.5, crest: 1.8, bulk: 1.08, tailSwing: 0.3, tailCurl: 1, glint: 1 });

  const hurtP = pose({ hx: 12, hh: 52, ha: -0.2, nb: 0.6, jaw: 0.65, eye: 0.5, chestH: 3, ox: -3, crest: 0.2, tailCurl: 0.8 });

  // Tod: zurückzucken, klagend aufbäumen – dann Erstarrung und Zersplittern
  const d1 = pose({ hx: 10, hh: 58, ha: -0.35, nb: 0.8, jaw: 0.9, eye: 0.6, chestH: 5, ox: -4, heart: 2.5, tailCurl: 1 });
  const d2 = pose({ hx: 16, hh: 70, ha: -0.75, nb: 0.4, jaw: 1, eye: 0.3, chestH: 11, ox: -2, heart: 3.2, fNy: 5, tailCurl: 1.1, tailLift: 7, crest: 0.8 });


  const idle = new Animation(track([[0, idleA], [0.5, idleB], [1, idleA]], 10, { loop: true }), 7);
  const walk = new Animation(track(walkKeys, 10, { loop: true, extras: { 0: { fx: 'step' }, 5: { fx: 'step' } } }), 11);

  const anims = {
    idle,
    walk,
    dormant: new Animation(track([[0, coil], [0.5, coilB], [1, coil]], 6, { loop: true }), 2.5),
    awaken: new Animation(track([
      [0, coil], [0.14, { ...coil, eye: 1, heart: 1.2 }], [0.36, rise], [0.56, pose({ ...roarP, jaw: 0.3, crest: 0.4 })],
      [0.66, roarP, snap], [0.86, roarP2], [1, mix(roarP2, idleA, 0.55)],
    ], 16, { extras: { 10: { fx: 'roar' } } }), 8, false),
    roar: new Animation(track([[0, idleA], [0.28, roarP, snap], [0.75, roarP2], [1, mix(roarP2, idleA, 0.5)]], 12, { extras: { 3: { fx: 'roar' } } }), 8, false),
    biteWindup: new Animation(track([[0, idleA], [0.5, bw1], [1, bw2]], 5), 10, false),
    bite: new Animation(track([[0, bw2], [0.18, bs1, snap], [0.36, bs2, snap], [0.7, bs3], [1, idleA]], 8, { extras: { 2: { fx: 'impact', post: snapFx }, 3: { post: snapFx } } }), 15, false),
    tailWindup: new Animation(track([[0, idleA], [0.5, tw1], [1, tw2]], 6), 9, false),
    tail: new Animation(track([[0, tw2], [0.2, ts1, snap], [0.42, ts2, snap], [0.7, ts3], [1, idleA]], 9, {
      extras: { 1: { smear: { P0: tw2, P1: ts1 } }, 2: { smear: { P0: ts1, P1: ts2 }, fx: 'impact' }, 3: { smear: { P0: mix(ts1, ts2, 0.5), P1: ts2, n: 4 } } },
    }), 15, false),
    breathWindup: new Animation(track([[0, idleA], [0.45, aw1], [1, aw2]], 7), 8, false),
    breath: new Animation(track([[0, br1], [0.5, br2], [1, br1]], 6, { loop: true }), 12),
    callWindup: new Animation(track([[0, idleA], [0.45, cw1], [0.85, cw2, snap], [1, cw2]], 8, { extras: { 6: { fx: 'cast' } } }), 8, false),
    slamWindup: new Animation(track([[0, idleA], [0.5, sw1], [1, sw2]], 7), 8, false),
    slam: new Animation(track([[0, sw2], [0.2, sl1, snap], [0.55, sl2], [1, idleA]], 8, { extras: { 1: { fx: 'impact' } } }), 13, false),
    novaWindup: new Animation(track([[0, idleA], [0.5, nw1], [1, nw2]], 8), 7, false),
    nova: new Animation(track([[0, nw2], [0.25, nr1, snap], [0.6, { ...nr1, hh: 68, crest: 1.4 }], [1, idleA]], 8, { extras: { 1: { fx: 'nova' } } }), 12, false),
    burrow: new Animation([
      ...track([[0, idleA], [1, pose({ hx: 16, hh: 50, ha: -0.15, nb: 0.4, jaw: 0.4, chestH: 3, crest: 0.4 })]], 3),
      ...burrowFrames(pose({ hx: 16, hh: 50, ha: -0.15, nb: 0.4, jaw: 0.4, chestH: 3, crest: 0.4 }), 12),
    ], 14, false),
    emerge: new Animation(emergeFrames(pose({ ...roarP, hh: 66, ha: -0.8, jaw: 1 }), idleA, 13), 13, false),
    hurt: new Animation(track([[0, idleA], [0.35, hurtP, snap], [1, idleA]], 4), 14, false),
  };

  // Tod: Posen, dann Erstarren (Eis breitet sich vom Herz aus), Risse, Zersplittern
  const deathPose = track([[0, hurtP], [0.35, d1], [1, d2]], 5, { extras: { 0: {}, 4: { fx: 'roar' } } });
  const ice = [];
  for (let i = 0; i < 6; i++) ice.push(freezeFrame({ ...d2, heart: 3.2 - i * 0.4 }, (i + 1) / 6, 0, i === 0 ? 'freeze' : null).frame);
  ice.push(freezeFrame({ ...d2, heart: 0 }, 1, 0.35, null).frame);
  const last = freezeFrame({ ...d2, heart: 0 }, 1, 1, 'crack');
  ice.push(last.frame, last.frame);
  const shards = shatterFrames(last.L, last.meta, 10);
  anims.death = new Animation([...deathPose, ...ice, ...shards], 9, false);

  // Zusatzgrafik für die Logik (nicht aufzählbar, damit Werkzeuge nur Animationen sehen)
  const pillar = [0.15, 0.35, 0.6, 0.85, 1].map((h) => pillarFrame(h));
  const pillarBreak = [0.25, 0.5, 0.75, 0.95].map((b) => pillarFrame(1 - b * 0.35, b));
  Object.defineProperty(anims, 'fx', { value: { pillar, pillarBreak, icicle: icicleFrame(), crack: createFrostCrack(56), crackSmall: createFrostCrack(34) }, enumerable: false });
  return anims;
}
