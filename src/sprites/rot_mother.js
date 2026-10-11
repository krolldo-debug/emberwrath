import { outlineCanvas } from '../gfx/PixelCanvas.js';
import { SpriteFrame, Animation } from '../gfx/Sprite.js';
import { fineRes, outlinePixels, pixelsToCanvas } from '../gfx/Fine.js';
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
//
// Feinraster (docs/STYLE.md „Feinraster“, Stufe B): der Puffer hat RS Texel je Weltpixel (RS = fineRes() beim Bau,
// bei „Niedrig“ 1 = alles wie früher). Flächen (Leib, Säcke, Hut, Schleim) tasten Texelmitten ab, Stränge rastern
// mit Texelschritten; Pixelkarten (Gesicht) setzen RS×RS-Zellen, Feindetails (dot/fline) einzelne Texel.
// Koordinaten, Anker und meta bleiben Weltpixel; Frames tragen res = RS.
const W = 196, H = 150, AX = 98, AY = 138, GY = AY;
const TAU = Math.PI * 2;
let RS = 1, TW = W, TH = H, DITH = 0.7;
function setRes(r) { RS = r; TW = W * r; TH = H * r; DITH = r > 1 ? 0 : 0.7; }   // fein: harte Stufen statt Raster
// Texel, in dem ein Weltpunkt liegt (grob = Math.round wie früher), und Weltkoordinate einer Texelmitte (grob = V)
const TX = (v) => (RS === 1 ? Math.round(v) : Math.floor((v + 0.5) * RS));
const tc = (V) => (V + 0.5) / RS - 0.5;

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
const sidx = (n, v, x, y) => (DITH === 0
  ? (v <= 0 ? 0 : v >= 1 ? n - 1 : Math.floor(v * (n - 1) + 0.5))   // fein: harte Stufen, ohne Raster
  : clamp(Math.floor(clamp(v, 0, 1) * (n - 1) + 0.5 + (BAYER[((y & 3) << 2) | (x & 3)] - 0.5) * DITH), 0, n - 1));
const shade = (ramp, v, x, y) => ramp[sidx(ramp.length, v, x, y)];
// fein (ohne Raster): harte Stufe direkt
const shadeF = (ramp, v) => ramp[v <= 0 ? 0 : v >= 1 ? ramp.length - 1 : Math.floor(v * (ramp.length - 1) + 0.5)];

// ---------------------------------------------------------------- Zeichenpuffer

// Drei Puffer (Grundbild b, Leuchten Phase 1–2 g, Phase 3 e) in Texeln. Ein Satz wird für alle Frames
// wiederverwendet; get() leert nur den zuletzt belegten Bereich (x0..y1, Texel).
// px/gl = ein Weltpixel (RS×RS Texel, Lage texelgenau), dot/gdot/fline = ein Texel, cell = Weltpixel-Zelle
// (Pixelkarten), tex/gtex = Texel direkt.
class Painter {
  static #pool = null;
  static get() {
    const p = Painter.#pool;
    if (!p || p.b.length !== TW * TH) return (Painter.#pool = new Painter());
    const r = p.region();
    if (r.x1 >= 0) for (let y = r.y0; y <= r.y1; y++) {
      const a = y * TW + r.x0, z = y * TW + r.x1 + 1;
      p.b.fill(0, a, z); p.g.fill(0, a, z); p.e.fill(0, a, z);
    }
    p.x0 = TW; p.y0 = TH; p.x1 = -1; p.y1 = -1; p.clip = H; p.gk = 1;
    p.bx0 = TW; p.by0 = TH; p.bx1 = -1; p.by1 = -1;
    return p;
  }
  constructor() {
    this.b = new Uint32Array(TW * TH);
    this.g = new Uint32Array(TW * TH);
    this.e = new Uint32Array(TW * TH);
    this.clip = H; this.gk = 1;
    this.x0 = TW; this.y0 = TH; this.x1 = -1; this.y1 = -1;   // belegter Bereich (Leuchten); Grundbild: bx0..by1
    this.bx0 = TW; this.by0 = TH; this.bx1 = -1; this.by1 = -1;   // = genauer Rahmen von b (tex schreibt nie 0)
  }
  tex(X, Y, c) {
    if (X < 0 || X >= TW || Y < 0 || Y >= this.clip * RS || Y >= TH) return;
    const i = Y * TW + X;
    this.b[i] = c; this.g[i] = 0; this.e[i] = 0;
    if (X < this.bx0) this.bx0 = X; if (X > this.bx1) this.bx1 = X; if (Y < this.by0) this.by0 = Y; if (Y > this.by1) this.by1 = Y;
  }
  // Gesamtbereich (zum Leeren/Absuchen) = Grundbild ∪ Leuchten
  region() {
    return { x0: Math.min(this.x0, this.bx0), y0: Math.min(this.y0, this.by0), x1: Math.max(this.x1, this.bx1), y1: Math.max(this.y1, this.by1) };
  }
  px(x, y, c) {
    if (RS === 1) { this.tex(Math.round(x), Math.round(y), c); return; }
    const X = Math.round(x * RS), Y = Math.round(y * RS);
    for (let j = 0; j < RS; j++) for (let k = 0; k < RS; k++) this.tex(X + k, Y + j, c);
  }
  dot(x, y, c) { this.tex(TX(x), TX(y), c); }
  cell(x, y, c) { for (let j = 0; j < RS; j++) for (let k = 0; k < RS; k++) this.tex(x * RS + k, y * RS + j, c); }
  // feine Linie (1 Texel, Bresenham im Feinraster)
  fline(x0, y0, x1, y1, c) { bres(TX(x0), TX(y0), TX(x1), TX(y1), (X, Y) => this.tex(X, Y, c)); }
  // Leuchttexel (beide Phasen-Ebenen), Stufe 1..4, skaliert mit gk
  gtex(X, Y, k, lvl) {
    const v = lvl * this.gk;
    if (v < 0.5) return;
    if (X < 0 || X >= TW || Y < 0 || Y >= this.clip * RS || Y >= TH) return;
    const l = Math.min(4, Math.round(v)), i = Y * TW + X;
    this.g[i] = SET_A[k][l]; this.e[i] = SET_B[k][l];
    if (X < this.x0) this.x0 = X; if (X > this.x1) this.x1 = X; if (Y < this.y0) this.y0 = Y; if (Y > this.y1) this.y1 = Y;
  }
  gl(x, y, k, lvl) {
    if (RS === 1) { this.gtex(Math.round(x), Math.round(y), k, lvl); return; }
    const X = Math.round(x * RS), Y = Math.round(y * RS);
    for (let j = 0; j < RS; j++) for (let i = 0; i < RS; i++) this.gtex(X + i, Y + j, k, lvl);
  }
  gdot(x, y, k, lvl) { this.gtex(TX(x), TX(y), k, lvl); }
  gcell(x, y, k, lvl) { for (let j = 0; j < RS; j++) for (let i = 0; i < RS; i++) this.gtex(x * RS + i, y * RS + j, k, lvl); }
  gfline(x0, y0, x1, y1, k, lvl) { bres(TX(x0), TX(y0), TX(x1), TX(y1), (X, Y) => this.gtex(X, Y, k, lvl)); }
  ellipse(cx, cy, rx, ry, c) {
    if (RS > 1) {
      // fein: Texelmitten abtasten, Ausdehnung wie das grobe Raster (Rundung gibt dort knapp ½ Pixel mehr)
      const ex = rx + 0.45, ey = ry + 0.45;
      for (let Y = TX(cy - ey); Y <= TX(cy + ey); Y++) {
        const v = (tc(Y) - cy) / ey;
        for (let X = TX(cx - ex); X <= TX(cx + ex); X++) { const u = (tc(X) - cx) / ex; if (u * u + v * v <= 1) this.tex(X, Y, c); }
      }
      return;
    }
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      const t = 1 - ((y - cy) * (y - cy)) / (ry * ry);
      if (t < 0) continue;
      const hw = rx * Math.sqrt(t);
      for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) this.px(x, y, c);
    }
  }
}

function bres(x0, y0, x1, y1, f) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    f(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

function blend(c, rgb, k) {
  const r = c & 255, g = (c >>> 8) & 255, b = (c >>> 16) & 255;
  return (0xff000000 | (Math.round(b + (rgb[2] - b) * k) << 16) | (Math.round(g + (rgb[1] - g) * k) << 8) | Math.round(r + (rgb[0] - r) * k)) >>> 0;
}

// Randlicht: helle Kante oben/links, violetter Rückstrahl rechts – die Figur
// liest sich so auch auf dunklem Pilzboden klar.
// An Ort und Stelle (liest nur, ob Nachbarn belegt sind; blend gibt nie 0) und nur im belegten Bereich.
// Fein ist die Kante 1 Texel stark.
function rimPass(pt) {
  const b = pt.b, src = b, Wd = TW, YG = (GY - 3) * RS;
  const X0 = Math.max(1, pt.bx0), X1 = Math.min(TW - 2, pt.bx1), Y0 = Math.max(1, pt.by0), Y1 = Math.min(TH - 2, pt.by1);
  for (let y = Y0; y <= Y1; y++) {
    for (let x = X0; x <= X1; x++) {
      const i = y * Wd + x, c = src[i];
      if (!c) continue;
      const up = !src[i - Wd], left = !src[i - 1], right = !src[i + 1], ul = !src[i - Wd - 1];
      if (up || (left && ul)) b[i] = blend(c, RIM_HI, up && left ? 0.42 : 0.3);
      else if (right && y < YG) b[i] = blend(c, RIM_BIO, 0.38);
      else if (left && y < YG) b[i] = blend(c, RIM_HI, 0.16);
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
  const B = pt.b, G = pt.g, E = pt.e, YC = Math.min(TH, pt.clip * RS);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len, ny = dx / len;
    if (nx + ny > 0) { nx = -nx; ny = -ny; } // n zeigt zum Licht
    // fein: Abtastabstand 0,35 Weltpixel (< Texel/√2, lückenlos) längs und quer
    const steps = Math.max(1, Math.ceil(RS === 1 ? len * 2 : len / 0.35));
    for (let s = 0; s < steps; s++) {
      const u = s / steps, t = a.t + (b.t - a.t) * u;
      const x = a.x + dx * u, y = a.y + dy * u;
      const hw = wf(t) / 2;
      if (RS === 1) {
        for (let k = -hw; k <= hw + 0.01; k += 0.5) {
          const px = x + nx * k, py = y + ny * k;
          pt.px(px, py, col(k / (hw || 1), t, Math.round(px), Math.round(py)));
        }
        continue;
      }
      // fein: Texel abtasten; Rand um ¼ Pixel weiter, damit die Stärke dem groben Raster entspricht
      const h2 = hw + 0.25, ih = 1 / (hw || 1), n2 = Math.max(1, Math.ceil(2 * h2 / 0.35)), st = 2 * h2 / n2;
      for (let q = 0; q <= n2; q++) {
        const k = -h2 + q * st, e = k * ih;
        const X = Math.floor((x + nx * k + 0.5) * RS), Y = Math.floor((y + ny * k + 0.5) * RS);
        if (X < 0 || X >= TW || Y < 0 || Y >= YC) continue;
        const i = Y * TW + X;
        B[i] = col(e < -1 ? -1 : e > 1 ? 1 : e, t, 0, 0); G[i] = 0; E[i] = 0;
        if (X < pt.bx0) pt.bx0 = X; if (X > pt.bx1) pt.bx1 = X; if (Y < pt.by0) pt.by0 = Y; if (Y > pt.by1) pt.by1 = Y;
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
    const fine = RS > 1, gs = i * 2.3;
    let lt = NaN, moss = false, g1 = 0, ring = false;   // je Abtastschritt (t) nur einmal rechnen
    tube(pt, pts, (t) => Math.max(1, w0 * (1 - t * 0.85)), fine ? (e, t) => {
      // fein: Rindenmaserung als Längsrillen mit Lichtgrat, Moos in weichen Polstern auf der Lichtseite
      if (t !== lt) { lt = t; moss = t < 0.6 && Math.sin(t * 19 + gs) + Math.sin(t * 7.3 + gs * 1.7) > 0.35; g1 = 0.1 - 0.08 * Math.sin(t * 13 + gs); ring = ((t * 6 + gs) % 1) < 0.72; }
      let v = 0.42 + e * 0.32 - (front ? 0 : 0.14);
      if (moss && e > 0.45) return MOSS[front ? (e > 0.82 ? 4 : 3) : 2];
      if (ring && (Math.abs(e - g1) < 0.09 || Math.abs(e + 0.5) < 0.08)) v -= 0.22;
      else if (Math.abs(e - 0.3) < 0.07 && t < 0.8) v += 0.12;
      return BARK[v <= 0 ? 0 : v >= 1 ? 5 : (v * 5 + 0.5) | 0];
    } : (e, t, px, py) => {
      let v = 0.42 + e * 0.32 - (front ? 0 : 0.14);
      if (hash2(px, py, 203) < 0.06) v -= 0.2;
      if (e > 0.5 && t < 0.6 && hash2(px >> 1, py >> 1, 205) < 0.35) return MOSS[front ? 3 : 2];
      return shade(BARK, v, px, py);
    });
    // Knoten, leuchtende Spitze
    const k = pts[Math.floor(pts.length * 0.45)];
    if (k) {
      pt.px(k.x - 1, k.y - 1, BARK[4]); pt.px(k.x, k.y - 1, BARK[3]);
      if (fine) { pt.dot(k.x - 1.25, k.y - 1.25, BARK[5]); pt.dot(k.x + 0.25, k.y - 0.75, BARK[1]); }
    }
    const tip = pts[pts.length - 1];
    if (tip && hash2(i, 6, 201) < 0.5) {
      pt.px(tip.x, tip.y, SAC[4]);
      pt.gl(tip.x, tip.y, K_SPORE, 2 + (Math.sin(P.pulse + i) > 0.4 ? 1 : 0));
      if (fine) { pt.dot(tip.x - 0.25, tip.y - 0.25, SAC[6]); pt.gdot(tip.x - 0.25, tip.y - 0.25, K_SPORE, 4); }
    }
  }
}

function slimePool(pt, P, L) {
  const cx = L.cx + 6, cy = GY - 1;
  const rx = 40 * P.rootSpread + P.collapse * 8, ry = 5.5;
  if (RS > 1) { slimeFine(pt, P, cx, cy, rx, ry); return; }
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
// Schleimlache fein: dunkler Saum, Lichtseite oben, harte Glanzsicheln und Blasen mit hellem Punkt statt Sprenkeln
const SLIME_HI = hex('#b4dc78'), SLIME_SPEC = hex('#eaffc8');
function slimeFine(pt, P, cx, cy, rx, ry) {
  const ex = 0.45 / ry;   // Rand wie das grobe Raster
  // Spaltenwerte (Wellung des Rands, Glanzsicheln) einmal je Spalte
  const XA = TX(cx - rx - 2), XB = TX(cx + rx + 2), nW = XB - XA + 1;
  const WOB = new Float32Array(nW), GLS = new Uint8Array(nW);
  for (let X = XA; X <= XB; X++) {
    const u = (tc(X) - cx) / rx;
    WOB[X - XA] = 1 + 0.12 * Math.sin(u * 7 + 1.3) + 0.06 * Math.sin(u * 17);
    GLS[X - XA] = Math.sin(u * 9.5 + 0.8) > 0.55 ? 1 : 0;
  }
  for (let Y = TX(cy - ry - 0.5); Y <= TX(cy + ry + 0.5); Y++) {
    const y = tc(Y), v = (y - cy) / ry;
    for (let X = XA; X <= XB; X++) {
      const x = tc(X), u = (x - cx) / rx;
      const d = Math.sqrt(u * u + v * v) / WOB[X - XA];
      if (d > 1 + ex) continue;
      let c = d > 0.87 ? SLIME[1] : v < -0.3 ? SLIME[3] : SLIME[2];
      // Glanzsicheln an der Oberkante (wie Licht auf einer nassen Wölbung)
      if (d <= 0.87 && v < -0.3 && d > 0.62 && GLS[X - XA]) c = d > 0.74 ? SLIME[4] : SLIME_HI;
      else if (d > 0.87 && v > 0.45) c = SLIME[0];
      pt.tex(X, Y, c);
      const wx = Math.floor(X / RS), wy = Math.floor(Y / RS);
      if (hash2(wx, wy + Math.floor(P.pulse * 0.6), 213) < 0.025) pt.gtex(X, Y, K_SAC, X % RS || Y % RS ? 1.3 : 2.4);
    }
  }
  // Blasen: Ring mit Glanzpunkt oben links
  for (let j = 0; j < 7; j++) {
    const bu = -0.85 + j * 0.27 + hash2(j, 3, 215) * 0.1, bv = -0.15 + hash2(j, 4, 215) * 0.5;
    const bx = cx + bu * rx * 0.92, by = cy + bv * ry, r = 0.6 + hash2(j, 5, 215) * 0.7 + (Math.sin(P.pulse * 0.5 + j) > 0.6 ? 0.4 : 0);
    if (Math.hypot(bu, bv) > 0.82) continue;
    for (let a = 0; a < TAU; a += 0.35) pt.dot(bx + Math.cos(a) * r, by + Math.sin(a) * r * 0.8, a > 3.4 && a < 5.2 ? SLIME[4] : SLIME[1]);
    pt.dot(bx - r * 0.45, by - r * 0.45, SLIME_SPEC);
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
    if (RS > 1) { shroomCapFine(pt, P, i, ex, ey, r, ca, sa); return; }
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
// Rückenpilz-Hut fein: Kuppel in harten Stufen, Lichtkante oben links, zwei runde Tupfen mit Glanz,
// darunter Lamellen als Texelrillen (leuchten violett)
function shroomCapFine(pt, P, i, ex, ey, r, ca, sa) {
  const R2 = r + 2.5, sp = [[-0.42, 0.55], [0.3, 0.35]];
  for (let Y = TX(ey - R2); Y <= TX(ey + R2); Y++) {
    const yy = tc(Y) - ey;
    for (let X = TX(ex - R2); X <= TX(ex + R2); X++) {
      const xx = tc(X) - ex;
      const lx = xx * ca + yy * sa, ly = -xx * sa + yy * ca;
      const q = lx / (r + 0.4);
      if (Math.abs(q) >= 1) continue;
      const top = -(r + 0.4) * 0.75 * Math.sqrt(1 - q * q) - 0.2, rim = 0.6 + q * q * 0.8;
      if (ly < top || ly > rim + 1.3) continue;
      if (ly > rim) {
        pt.tex(X, Y, ((lx * 1.4 + 9.5) % 1) < 0.34 ? GILL[1] : ly > rim + 0.8 ? GILL[2] : GILL[3]);
        pt.gtex(X, Y, K_GILL, 1.5 + 0.5 * Math.sin(P.pulse + i));
        continue;
      }
      const hgt = (rim - ly) / (rim - top + 0.01);
      let c = shadeF(CAP, 0.3 + hgt * 0.45 - q * 0.25);
      if (ly > rim - 0.5) c = CAP[2];
      else if (ly - top < 0.55 && q < 0.15) c = q < -0.35 ? CAP[6] : CAP[5];   // Lichtkante
      for (const [su, sv] of sp) {
        const dd = Math.hypot(q - su, (ly - (top + (rim - top) * sv)) / (r * 0.75));
        if (dd < 0.2) { c = dd < 0.1 && q < su ? SPOT[3] : SPOT[2]; break; }
      }
      pt.tex(X, Y, c);
    }
  }
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
  if (RS > 1) { bodyFine(pt, P, L); return; }
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

// Leib fein: Texelmitten, harte Stufen; Adern schmaler (Rille) mit Lichtkante darunter, violett ohne Sprenkel,
// Leuchten folgt der feinen Ader (heller Kern); Poren rund mit Lichtlippe; Schleimfäden 1 Texel mit Tropfen.
// Schnell: Zeilenwerte vorab, Beulen (sin 5a, sin 9a) über Tschebyschow-Polynome statt atan2, direkt in die Puffer.
const C07 = Math.cos(0.7), S07 = Math.sin(0.7), C21 = Math.cos(2.1), S21 = Math.sin(2.1);
const FLESH_VT = FLESH.map((c) => blend(c, [120, 70, 170], 0.35));
function bodyFine(pt, P, L) {
  const { cx, cy, rx, ry } = L;
  const pores = [];
  const EXP = 0.018, VW = 0.045, b = pt.b, gA = pt.g, gB = pt.e, gk = pt.gk;
  const VA = SET_A[K_VEIN], VB = SET_B[K_VEIN], col = P.collapse * 0.12;
  const X0 = Math.max(0, Math.floor(cx - rx * 1.3) * RS), X1 = Math.min(TW - 1, Math.ceil(cx + rx * 1.3) * RS + RS - 1);
  const YE = Math.min(GY * RS - 1, TH - 1, pt.clip * RS - 1);
  for (let Y = Math.max(0, Math.floor(cy - ry * 1.12) * RS); Y <= YE; Y++) {
    const y = tc(Y), v = (y - cy) / ry;
    const wid = 1 + 0.2 * clamp(v, -1, 1), rxw = rx * wid;
    const ext = v > 0.6 ? (v - 0.6) * 0.5 : 0;
    const lmax = (1.08 + ext) * (1 + EXP) + 1e-6;
    if (v * v > lmax * lmax) continue;
    const reach = rxw * Math.sqrt(lmax * lmax - v * v);
    const xa = Math.max(X0, Math.floor((cx - reach) * RS) - RS), xb = Math.min(X1, Math.ceil((cx + reach) * RS) + RS);
    const rowV = Math.sin(v * 4.3 + 1.1) * 1.6 + 0.4, rowU = Math.sin(((tc(Y - 1) - cy) / ry) * 4.3 + 1.1) * 1.6 + 0.4;
    const lamRow = 0.52 - (v > 0.3 ? (v - 0.3) * 0.55 : 0) - col, hk = v > 0.15 ? 0.09 * (v - 0.15) : 0, hv = 0.5 + v * 2;
    const veinRow = v < 0.62, wy = Math.floor(Y / RS), row = Y * TW;
    let mx0 = TW, mx1 = -1, gw = false;
    // u wächst je Texel gleichmäßig: Ader- und Faltenwellen über Drehschritte statt sin je Texel
    const du = 1 / (RS * rxw), ua = (tc(xa) - cx) / rxw;
    const cdV = Math.cos(5.2 * du), sdV = Math.sin(5.2 * du), cdH = Math.cos(11 * du), sdH = Math.sin(11 * du);
    let sV = Math.sin(ua * 5.2 + rowV), cV = Math.cos(ua * 5.2 + rowV), sU = Math.sin(ua * 5.2 + rowU), cU = Math.cos(ua * 5.2 + rowU);
    let sH = Math.sin(ua * 11 + hv), cH = Math.cos(ua * 11 + hv), q;
    for (let X = xa; X <= xb; X++, q = sV * cdV + cV * sdV, cV = cV * cdV - sV * sdV, sV = q,
      q = sU * cdV + cU * sdV, cU = cU * cdV - sU * sdV, sU = q, q = sH * cdH + cH * sdH, cH = cH * cdH - sH * sdH, sH = q) {
      const u = ua + (X - xa) * du;
      const r = Math.sqrt(u * u + v * v);
      if (r > lmax) continue;
      let ca = 1, sa = 0;
      if (r > 0) { ca = u / r; sa = v / r; }
      const c2 = ca * ca, c4 = c2 * c2, c6 = c4 * c2, c8 = c4 * c4;
      const s5 = sa * (16 * c4 - 12 * c2 + 1), k5 = ca * (16 * c4 - 20 * c2 + 5);
      const s9 = sa * (256 * c8 - 448 * c6 + 240 * c4 - 40 * c2 + 1), k9 = ca * (256 * c8 - 576 * c6 + 432 * c4 - 120 * c2 + 9);
      const lump = 1 + 0.05 * (s5 * C07 + k5 * S07) + 0.03 * (s9 * C21 + k9 * S21) + ext;
      const d = r / lump;
      if (d > 1 + EXP) continue;
      const nz = Math.sqrt(Math.max(0, 1 - d * d)), nx = u / lump, ny = v / lump;
      let lam = lamRow + (-0.5 * nx - 0.62 * ny) * 0.5 + nz * 0.18;
      if (hk) lam += sH * hk; // Hängefalten
      let i = lam <= 0 ? 0 : lam >= 1 ? 6 : Math.floor(lam * 6 + 0.5);
      const vn = Math.abs(sV);
      const vein = vn < VW && d < 0.94 && veinRow;
      const k = row + X;
      if (vein) {
        i = Math.max(1, i - 2);
        b[k] = i >= 2 ? FLESH_VT[i] : vn < 0.02 ? VEIN_DEEP : FLESH[i];
        gA[k] = 0; gB[k] = 0;
        if (hash2(Math.floor(X / RS) >> 1, wy >> 1, 233) < 0.3) {
          const lv = (1 + (Math.sin(P.pulse + u * 3 + v * 2) > 0.4 ? 1 : 0) + (vn < 0.015 ? 1 : 0)) * gk;
          if (lv >= 0.5) { const l = Math.min(4, Math.round(lv)); gA[k] = VA[l]; gB[k] = VB[l]; gw = true; }
        }
      } else {
        // Lichtkante unter der Rille: liegt die Ader eine Texelzeile höher?
        b[k] = vn < 0.11 && d < 0.94 && veinRow && i < 6 && Math.abs(sU) < VW ? FLESH[i + 1] : FLESH[i];
        gA[k] = 0; gB[k] = 0;
        if (d < 0.9 && X % RS === 0 && Y % RS === 0) {
          const wx = X / RS;
          if ((wx & 1) === 0 && (wy & 1) === 0 && hash2(wx >> 1, wy >> 1, 235) < 0.018) pores.push([wx, wy]);
        }
      }
      if (X < mx0) mx0 = X; if (X > mx1) mx1 = X;
    }
    if (mx1 >= 0) { if (mx0 < pt.bx0) pt.bx0 = mx0; if (mx1 > pt.bx1) pt.bx1 = mx1; if (Y < pt.by0) pt.by0 = Y; if (Y > pt.by1) pt.by1 = Y; }
    if (gw) { if (mx0 < pt.x0) pt.x0 = mx0; if (mx1 > pt.x1) pt.x1 = mx1; if (Y < pt.y0) pt.y0 = Y; if (Y > pt.y1) pt.y1 = Y; }
  }
  for (const [x, y] of pores) {
    const X = x * RS, Y = y * RS;
    pt.tex(X, Y, FLESH[1]); pt.tex(X + 1, Y, FLESH[0]); pt.tex(X, Y + 1, FLESH[0]); pt.tex(X + 1, Y + 1, FLESH[1]);
    pt.tex(X - 1, Y, FLESH[2]); pt.tex(X, Y + 2, FLESH[5]); pt.tex(X + 1, Y + 2, FLESH[5]); pt.tex(X + 2, Y + 1, FLESH[4]);
  }
  for (let j = 0; j < 7; j++) {
    const x = cx - rx * 0.8 + j * rx * 0.27 + hash2(j, 1, 237) * 4;
    const len = 2 + hash2(j, 2, 237) * 4 + ((P.pulse * 0.5 + j) % 3);
    const y0 = GY - 6 - (j % 2) * 2, y1 = y0 + (len - 1) * 0.8;
    pt.px(x, y0, SLIME[3]);
    pt.fline(x, y0, x + 0.1, y1 - 0.4, SLIME[3]); pt.fline(x + 0.5, y0, x + 0.5, y0 + (len - 1) * 0.35, SLIME[2]);
    pt.px(x, y1, SLIME[4]); pt.dot(x - 0.25, y1 - 0.25, SLIME_SPEC); pt.dot(x + 0.25, y1 + 0.25, SLIME[3]);
  }
}
const VEIN_DEEP = hex('#2a1640');

function sac(pt, P, L, s, i) {
  const c = sacPos(L, s);
  const pul = 1 + 0.13 * Math.sin(P.pulse + i * 1.7);
  const rr = s.r * P.sacs * pul * (1 + P.swell * 0.55) * (1 - P.collapse * 0.25);
  if (rr < 1.2) return;
  const gp = P.sacGlow * (0.8 + 0.25 * Math.sin(P.pulse + i * 1.7)) * (1 + P.swell * 0.6);
  const torn = P.torn > 0.5;
  if (RS > 1) { sacFine(pt, P, c, rr, gp, torn, i); return; }
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
// Sporensack fein: Fleischkragen mit Lichtkante, Membran in harten Stufen, feine Adern (verzweigt, matt
// leuchtend), Glanzpunkt mit weißem Kern und Gegenlicht unten rechts; Leuchten mit heißem Kern.
const SAC_SPEC = hex('#ffffff');
function sacFine(pt, P, c, rr, gp, torn, i) {
  for (let a = 0; a < TAU; a += 0.06) {
    if (Math.sin(a) < -0.35) continue;
    const ca = Math.cos(a), sa = Math.sin(a);
    pt.px(c.x + ca * (rr + 1), c.y + sa * (rr + 1) * 0.9, ca < 0 ? FLESH[5] : FLESH[3]);
    pt.px(c.x + ca * (rr + 1.8), c.y + sa * (rr + 1.8) * 0.9, FLESH[2]);
  }
  // Lippe des Kragens: Lichtkante oben links, Schattenfalte rechts
  for (let a = Math.PI * 0.9; a < Math.PI * 1.65; a += 0.03) pt.dot(c.x + Math.cos(a) * (rr + 2.1), c.y + Math.sin(a) * (rr + 2.1) * 0.9, FLESH[6]);
  for (let a = -0.3; a < 1.1; a += 0.04) pt.dot(c.x + Math.cos(a) * (rr + 0.55), c.y + Math.sin(a) * (rr + 0.55) * 0.9, FLESH[1]);
  const dim = clamp(P.sacGlow, 0, 1.2), rf = rr + 0.35;
  for (let Y = TX(c.y - rf - 0.5); Y <= TX(c.y + rf + 0.5); Y++) {
    const dy = tc(Y) - c.y;
    for (let X = TX(c.x - rf - 0.5); X <= TX(c.x + rf + 0.5); X++) {
      const dx = tc(X) - c.x, d2 = dx * dx + dy * dy;
      if (d2 > rf * rf) continue;
      const d = Math.sqrt(d2) / rf;
      if (torn) {
        const ang = Math.atan2(dy, dx);
        if (d < 0.72) {
          pt.tex(X, Y, d < 0.45 ? SAC[0] : d < 0.52 ? FLESH[0] : FLESH[1]);
          if (d < 0.4 && hash2(Math.round(dx) + 40, Math.round(dy) + 40, 241 + i) < 0.35) pt.gtex(X, Y, K_SAC, 1.2 * gp);
        } else if (hash2(Math.floor((ang + 4) * 3.2), i, 243) < 0.6) pt.tex(X, Y, d > 0.9 ? FLESH[3] : d < 0.78 && dy < 0 ? FLESH[5] : FLESH[4]);
        continue;
      }
      const nz = Math.sqrt(1 - d * d), nx = dx / rf, ny = dy / rf;
      const lam = 0.3 + (-0.5 * nx - 0.6 * ny) * 0.35 + nz * 0.25 + (dim - 0.6) * 0.3;
      let col = shadeF(SAC, clamp(lam, 0, 0.86));
      if (d > 0.88) col = SAC[dim > 0.5 ? 2 : 1];
      pt.tex(X, Y, col);
      if (d < 0.8) pt.gtex(X, Y, K_SAC, (0.8 - d) * 3.6 * gp + 0.3 * gp + (d < 0.2 ? 0.6 : 0));
    }
  }
  if (torn) return;
  // Membranadern: vom Rand nach innen, mit kurzer Gabel
  if (rr > 3.2) {
    const nv = rr > 6 ? 4 : 2;
    for (let k = 0; k < nv; k++) {
      const a0 = 0.6 + (k / nv) * TAU * 0.8 + hash2(i, k, 247) * 0.6 + (i % 2) * 0.5;
      let a = a0, prev = null;
      for (let f = 0.92; f >= 0.35; f -= 0.06) {
        a += Math.sin(f * 9 + k + i) * 0.07;
        const p = { x: c.x + Math.cos(a) * rr * f, y: c.y + Math.sin(a) * rr * f };
        if (prev) { pt.fline(prev.x, prev.y, p.x, p.y, SAC[2]); pt.gfline(prev.x, prev.y, p.x, p.y, K_SAC, 1); }
        if (Math.abs(f - 0.62) < 0.03 && rr > 5) {
          const b = a + 0.5, q = { x: p.x + Math.cos(b) * rr * 0.22, y: p.y + Math.sin(b) * rr * 0.22 };
          pt.fline(p.x, p.y, q.x, q.y, SAC[2]); pt.gfline(p.x, p.y, q.x, q.y, K_SAC, 1);
        }
        prev = p;
      }
    }
  }
  // Glanzpunkt oben links (weißer Kern), Gegenlicht unten rechts
  const gx = c.x - rr * 0.42, gy = c.y - rr * 0.48;
  if (rr > 4) {
    pt.dot(gx - 0.5, gy, SAC[5]); pt.dot(gx + 0.5, gy, SAC[5]); pt.dot(gx + 1, gy + 0.5, SAC[5]); pt.dot(gx - 0.5, gy + 0.5, SAC[5]);
    pt.dot(gx, gy, SAC[6]); pt.dot(gx, gy + 0.5, SAC[6]); pt.dot(gx + 0.5, gy + 0.5, SAC[6]);
    pt.dot(gx, gy, SAC_SPEC);
    if (rr > 6) { pt.dot(gx + 1.5, gy - 0.5, SAC[5]); pt.dot(gx + 2, gy - 0.5, SAC[5]); }
    for (let a = 0.35; a < 1.25; a += 0.12) pt.dot(c.x + Math.cos(a) * rr * 0.8, c.y + Math.sin(a) * rr * 0.8, SAC[4]);
  } else { pt.dot(gx, gy, SAC[6]); pt.dot(gx + 0.5, gy, SAC[5]); }
  pt.gdot(gx, gy, K_SAC, 4);
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
  const fine = RS > 1;
  tube(pt, pts, wf, fine ? (e, t) => {
    // fein: schmale Rippenrillen mit Lichtgrat darunter, Sehne an der Flanke
    let v = 0.42 + e * 0.36 + t * 0.08;
    if (t > 0.3 && t < 0.78 && e < 0.1 && e > -0.85) {
      const f = ((t - 0.3) * 11) % 1 - 0.5;
      if (Math.abs(f) < 0.08) v -= 0.32;
      else if (f > 0.08 && f < 0.2) v += 0.14;
    }
    if (t > 0.2 && t < 0.9 && Math.abs(e - 0.55) < 0.07) v += 0.12;
    return shadeF(SKIN, v);
  } : (e, t, x, y) => {
    let v = 0.42 + e * 0.36 + t * 0.08;
    // Rippen auf der Vorderseite
    if (t > 0.3 && t < 0.78 && e < 0.1 && e > -0.85 && Math.abs(((t - 0.3) * 11) % 1 - 0.5) < 0.13) v -= 0.3;
    return shade(SKIN, v, x, y);
  });
  // Wirbelknoten auf dem Rücken (fein: Glanzpunkt oben, Schattenkerbe unten)
  for (let t = 0.12; t < 0.95; t += 0.11) {
    const p = pts[Math.round(t * 24)], hw = wf(t) / 2;
    const bx = p.x - ca * hw, by = p.y - sa * hw;
    pt.px(bx - ca, by - sa, BONE[2]); pt.px(bx - ca * 2, by - sa * 2, BONE[3]); pt.px(bx, by + 1, BONE[1]);
    if (fine) { pt.dot(bx - ca * 2 - 0.25, by - sa * 2 - 0.25, SPOT[3]); pt.dot(bx + 0.25, by + 1.25, BONE[0]); }
  }
  // Konsolenpilze am Rücken, mit leuchtenden Lamellen (fein: Lichtkante oben, Lamellenrillen)
  for (const [t, w] of [[0.42, 6], [0.66, 4]]) {
    const p = pts[Math.round(t * 24)], hw = wf(t) / 2;
    const x0 = p.x - ca * hw, y0 = p.y - sa * hw;
    for (let k = 0; k < w; k++) {
      const x = x0 - ca * k * 0.9, y = y0 - sa * k * 0.9 + k * 0.15;
      pt.px(x, y - 1, CAP[5 - Math.min(3, k >> 1)]); pt.px(x, y, CAP[3]);
      pt.px(x, y + 1, GILL[3]); pt.gl(x, y + 1, K_GILL, 2);
      if (fine) {
        pt.dot(x - 0.25, y - 1.25, k < 2 ? CAP[6] : CAP[5]); pt.dot(x + 0.25, y + 0.25, CAP[1]);
        if (k & 1) { pt.dot(x, y + 1.25, GILL[1]); pt.gdot(x - 0.5, y + 1.25, K_GILL, 3); }
      }
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
    if (RS > 1) { if (k < 1) pt.dot(x, y - 1.25, CAP[6]); pt.dot(x, y + 1.25, CAP[1]); }
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
  const fine = RS > 1;
  tube(pt, nk, () => 7, fine
    ? (e) => e > 0.35 ? (e > 0.8 ? RM_SKIN[4] : RM_SKIN[3]) : e < -0.35 ? RM_ROT[0] : Math.abs(e - 0.02) < 0.08 || Math.abs(e + 0.22) < 0.06 ? RM_SKIN[3] : RM_SKIN[2]
    : (e) => e > 0.35 ? RM_SKIN[3] : e < -0.35 ? RM_ROT[0] : RM_SKIN[2]);
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
  if (fine) faceFine(pt, P, ox, oy, j, lit, C);
  // Konsolenpilze am Hinterkopf (auf der Kontur, nicht im Gesicht)
  for (let k = 0; k < 3; k++) {
    const x = ox - 1, y = oy + 10 + k * 3;
    pt.px(x - 1, y, CAP[5]); pt.px(x, y, CAP[4]); pt.px(x - 1, y + 1, GILL[3]); pt.gl(x - 1, y + 1, K_GILL, 1.8);
    if (fine) { pt.dot(x - 1.25, y - 0.25, CAP[6]); pt.dot(x - 0.75, y + 1.25, GILL[1]); pt.gdot(x - 1.25, y + 1.25, K_GILL, 3); }
  }
  meta.eye = { x: ox + 8, y: oy + 9 };
  meta.mouth = { x: ox + 10, y: oy + 18 + j * 0.5 };
  // Kinnfäden
  for (let k = 0; k < 4; k++) {
    let x = ox + 7 + k * 2, y = oy + 23 + j - (k === 0 || k === 3 ? 1 : 0);
    const len = 3 + k * 1.1 + hash2(k, 1, 251) * 3;
    for (let st = 0; st < len; st++) {
      const px0 = x, py0 = y;
      x += Math.sin(P.hyT * 1.3 + k * 2 + st * 0.4) * 0.35 + (P.lean - 0.3) * 0.3; y += 0.9;
      // fein: Faden 1 Texel (am Ansatz voll), Spitze als Tropfen
      if (fine && st >= 1 && st <= len - 2) pt.fline(px0, py0, x, y, RM_SKIN[st < 3 ? 3 : 2]);
      else pt.px(x, y, st > len - 2 ? GILL[4] : RM_SKIN[2]);
    }
    if (fine) pt.dot(x - 0.25, y - 0.25, GILL[5]);
    if (k === 1 || k === 3) { pt.gl(x, y, K_SPORE, 2); if (fine) pt.gdot(x - 0.25, y - 0.25, K_SPORE, 4); }
  }
}

// Gesicht fein (Pixelkarte als RS×RS-Zellen, dann Texel-Details): Außenkontur 1 Texel, Brauenwulst mit Lichtkante
// und harter Unterkante, Augen mit Glanzpunkt und Schlitzpupille (geschlossen: Lidlinie), Nasenrücken-Licht,
// Nasenflügel, Lippenkanten im Licht, Mundwinkel, spitze Fänge mit Glanz.
const FACE_HI = hex('#b2e464'), BROW_HI = hex('#ece0b4'), BROW_LO = hex('#5c4a30');
const FANG_HI = hex('#fffbe8'), PUPIL = hex('#142008'), EYE_SPEC = hex('#ffffff'), IRIS = hex('#a8e448');
function faceFine(pt, P, ox, oy, j, lit, C) {
  const S = RS - 1, NR = RM_FACE.length;
  const rowY = (r) => oy + r + (r >= RM_SPLIT ? j : 0);
  const at = (c, r) => (r < 0 || r >= NR || c < 0 || c >= RM_FACE[r].length ? '.' : RM_FACE[r][c]);
  const fp = (c, r, sx, sy, col) => pt.tex((ox + c) * RS + sx, rowY(r) * RS + sy, col);
  const fill = (c, r, side, col) => {   // eine Texelreihe/-spalte einer Zelle: 'l' 'r' 't' 'b'
    for (let k = 0; k <= S; k++) {
      if (side === 'l') fp(c, r, 0, k, col); else if (side === 'r') fp(c, r, S, k, col);
      else if (side === 't') fp(c, r, k, 0, col); else fp(c, r, k, S, col);
    }
  };
  const skin = (ch) => ch !== '.' && ch !== 'o' && C[ch] !== undefined;
  for (let r = 0; r < NR; r++) for (let c = 0; c < RM_FACE[r].length; c++) {
    const ch = RM_FACE[r][c];
    if (ch === 'o') {
      // Außenkontur auf 1 Texel: die Innenhälfte nimmt die Farbe der Nachbarzelle an
      const l = at(c - 1, r), rr = at(c + 1, r), u = at(c, r - 1), d = at(c, r + 1);
      if (l === '.' && skin(rr)) fill(c, r, 'r', C[rr]);
      else if (rr === '.' && skin(l)) fill(c, r, 'l', C[l]);
      if (u === '.' && skin(d) && d !== 'M') fill(c, r, 'b', C[d]);
      else if (d === '.' && skin(u) && u !== 'M') fill(c, r, 't', C[u]);
    } else if (ch === '5') fp(c, r, 0, 0, FACE_HI);
    else if (ch === 'B' || ch === 'b') {
      const brow = (x) => x === 'B' || x === 'b';
      if (!brow(at(c, r - 1))) fill(c, r, 't', ch === 'B' ? BROW_HI : RM_BROW[0]);
      if (!brow(at(c, r + 1))) fill(c, r, 'b', ch === 'B' ? RM_BROW[1] : BROW_LO);
    } else if (ch === 'T') {
      // Fang oben: Glanz oben links, Schatten rechts, spitz nach unten
      if (at(c, r - 1) !== 'T') fp(c, r, 0, 0, FANG_HI);
      fill(c, r, 'r', RM_FANG[1]);
      if (at(c, r + 1) !== 'T') { fp(c, r, S, S, RM_MAW); fp(c, r, 0, S, RM_FANG[0]); }
    } else if (ch === 't') {
      // Fang unten: spitz nach oben, Spitze im Licht
      fill(c, r, 'l', RM_FANG[0]);
      if (at(c, r - 1) !== 't') { fp(c, r, 0, 0, RM_MAW); fp(c, r, S, 0, FANG_HI); }
    } else if (ch === 'n') { fill(c, r, 'b', RM_SKIN[0]); fp(c, r, 0, 0, RM_SKIN[3]); }
  }
  // gedehnte Zeilen des offenen Mauls: Außenkontur ebenso 1 Texel
  const sr = RM_FACE[RM_SPLIT - 1];
  for (let k = 0; k < j; k++) for (let c = 0; c < sr.length; c++) {
    if (sr[c] !== 'o') continue;
    const l = sr[c - 1] ?? '.', rr = sr[c + 1] ?? '.', Y = (oy + RM_SPLIT + k) * RS;
    const side = l === '.' && skin(rr) ? [S, C[rr]] : rr === '.' && skin(l) ? [0, C[l]] : null;
    if (side) for (let sy = 0; sy <= S; sy++) pt.tex((ox + c) * RS + side[0], Y + sy, side[1]);
  }
  // Nasenrücken im Licht (Spalte 8), Schattenflanke daneben
  for (let r = 9; r <= 13; r++) { fill(8, r, 'l', FACE_HI); fp(9, r, S, 0, RM_SKIN[3]); fp(9, r, S, S, RM_SKIN[3]); }
  fp(8, 14, 0, 0, FACE_HI); fp(9, 14, S, S, RM_SKIN[3]);
  // Oberlippe: Lichtkante über der Maulkontur; Unterlippe/Kinn im Licht; Mundwinkel mit Falte
  for (const c of [7, 9, 11, 12]) fill(c, 15, 'b', RM_SKIN[4]);
  for (let c = 5; c <= 9; c++) fp(c, 22, 0, 0, RM_SKIN[4]), fp(c, 22, S, 0, RM_SKIN[4]);
  fp(5, 16, 0, S, RM_SKIN[4]); fp(4, 18, S, S, RM_SKIN[0]); fp(5, 19, 0, 0, RM_SKIN[0]); fp(4, 19, S, S, RM_ROT[0]);
  // Augen: helles Weiß, grüne Iris, Schlitzpupille, Glanzpunkt oben links an der Pupille; geschlossen: Lidlinie
  for (const [c0, r, small] of [[3, 9, false], [12, 9, false], [11, 4, true]]) {
    const X = (ox + c0) * RS, Y = rowY(r) * RS;
    if (lit) {
      if (small) {
        pt.tex(X, Y, EYE_SPEC); pt.tex(X + 1, Y, PUPIL); pt.tex(X, Y + 1, IRIS); pt.tex(X + 1, Y + 1, PUPIL);
        pt.gtex(X, Y, K_EYE, 4); pt.gtex(X, Y + 1, K_EYE, 3);
      } else {
        pt.tex(X + 1, Y, EYE_SPEC); pt.tex(X + 2, Y, PUPIL); pt.tex(X + 3, Y, IRIS);
        pt.tex(X + 1, Y + 1, IRIS); pt.tex(X + 2, Y + 1, PUPIL); pt.tex(X + 3, Y + 1, RM_EYE[1]);
        pt.gtex(X + 1, Y, K_EYE, 4); pt.gtex(X + 3, Y, K_EYE, 3.4); pt.gtex(X + 1, Y + 1, K_EYE, 3.4);
      }
    } else {
      const n = small ? 2 : 3;
      for (let c = 0; c < n * RS; c++) { pt.tex(X + c, Y, RM_SKIN[3]); pt.tex(X + c, Y + RS - 1, RM_SKIN[0]); }
    }
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
// Fein: Texelmitten, harte Stufen, Lichtkante oben links (2 Texel) und dunkle Lippe am Hutrand, Warzen mit
// schmalem Ring und Glanzpunkt, schmale Lamellen (1 Texel) mit hellem Grat zum Rand hin; Leuchten je Lamelle.
const SPOT_HI = hex('#fffaf0');
function capPass(pt, P, K, part) {
  const { Rr, Hd, gm, rimY } = capGeom(P);
  const th = P.cap, c = Math.cos(th), s = Math.sin(th);
  const OFF = -4; // Hutmitte etwas hinter dem Kopf
  const spots = SPOTS.map(([q, h, r]) => { const lx = q * Rr; return { lx, ly: rimY(lx) - h * Hd * Math.sqrt(1 - q * q), r }; });
  const fine = RS > 1, dome = part === 'dome';
  // ly-Bereich, den die Teile überhaupt erreichen (rimY liegt in [0,3; 5,1]): spart rimY je Pixel, Ergebnis gleich
  const lyLo = dome ? 0.3 - Hd * 1.05 - 0.01 : 0.29, lyHi = dome ? 5.11 : 5.11 + 5 * gm;
  const ex = fine ? 0.25 : 0;   // fein: Rand wie das grobe Raster
  const XL = Math.floor(K.x - 42) * RS, XR = Math.ceil(K.x + 42) * RS + RS - 1, Rx = Rr + ex;
  // fein: Randlinie und Kuppelhöhe hängen nur von lx ab – als Tafel (Schritt 0,1 Weltpixel) statt sin je Texel;
  // Lamellen-Puls je Lamelle einmal
  let RIMT = null, TOPT = null, SQT = null;
  const TS = 10, TN = Math.ceil(2 * Rx * TS) + 1, LPULSE = fine ? new Float32Array(240).fill(NaN) : null;
  if (fine) {
    RIMT = new Float32Array(TN); TOPT = new Float32Array(TN); SQT = new Float32Array(TN);
    for (let k = 0; k < TN; k++) {
      const lx = k / TS - Rx, q = Math.max(-1, Math.min(1, lx / Rx)), sq = Math.sqrt(1 - q * q);
      RIMT[k] = rimY(lx); SQT[k] = sq; TOPT[k] = Hd * sq * (1 + 0.05 * Math.sin(q * 7 + 1));
    }
  }
  for (let Y = Math.floor(K.y - 40) * RS; Y <= Math.ceil(K.y + 26) * RS + RS - 1; Y++) {
    const y = tc(Y), dy = y - K.y;
    // Spalten dieser Zeile, in denen lx und ly überhaupt passen können (beide linear in dx), mit Rand: Ergebnis gleich
    let d0 = (-Rx + OFF - dy * s) / c, d1 = (Rx + OFF - dy * s) / c;
    if (s > 1e-9 || s < -1e-9) {
      const e0 = (dy * c - (lyHi + ex)) / s, e1 = (dy * c - (lyLo - ex)) / s;
      d0 = Math.max(d0, Math.min(e0, e1)); d1 = Math.min(d1, Math.max(e0, e1));
    }
    if (d1 < d0) continue;
    const xs = Math.max(XL, Math.floor((K.x + d0 + 0.5) * RS - 0.5) - 2), xe = Math.min(XR, Math.ceil((K.x + d1 + 0.5) * RS - 0.5) + 2);
    const dx0 = tc(xs) - K.x, ddx = 1 / RS;
    for (let X = xs; X <= xe; X++) {
      const dx = fine ? dx0 + (X - xs) * ddx : X - K.x;
      const lx = dx * c + dy * s - OFF, ly = -dx * s + dy * c;
      if (ly < lyLo - ex || ly > lyHi + ex) continue;
      const q = lx / (Rr + ex);
      if (Math.abs(q) >= 1) continue;
      let sq, rim, top;
      if (fine) { const k = Math.round((lx + Rx) * TS); sq = SQT[k]; rim = RIMT[k]; top = rim - TOPT[k] - ex; }
      else {
        sq = Math.sqrt(1 - q * q);
        rim = rimY(lx);
        top = rim - Hd * sq * (1 + 0.05 * Math.sin(q * 7 + 1)) - ex;
      }
      if (dome && ly >= top && ly <= rim + ex) {
        // Ausgefranster Rand
        if (ly > rim - 1.2 && Math.abs(q) > 0.3 && hash2(Math.round(lx), 3, 261) < 0.18) continue;
        const hgt = (rim - ly) / (rim - top + 0.01);
        let v = 0.28 + hgt * 0.42 - q * 0.26 + (hgt > 0.55 && q < 0.1 ? 0.14 : 0);
        if (ly > rim - 1.5) v -= 0.16;
        if (!fine && hgt > 0.2 && Math.abs(Math.sin(q * 9 + hgt * 2)) < 0.06) v -= 0.12; // Runzeln (fein: Falten am Rand, s. u.)
        let col = fine ? shadeF(CAP, v) : shade(CAP, v, X, Y);
        if (fine) {
          if (ly > rim - 0.5) col = CAP[1];                                   // dunkle Lippe am Rand
          else if (ly > rim - 1 && q < -0.1) col = CAP[4];                    // Lichtsaum über der Lippe
          else if (ly - top < 0.55 && q < 0.25) col = q < -0.3 ? CAP[6] : CAP[5];   // Lichtkante oben
          else if (ly - top < 1.05 && q < -0.45) col = CAP[5];
        }
        for (const sp of spots) {
          if (Math.abs(lx - sp.lx) >= sp.r || Math.abs(ly - sp.ly) * 1.35 >= sp.r) continue;
          const dd = Math.hypot(lx - sp.lx, (ly - sp.ly) * 1.35);
          if (dd < sp.r) {
            const lit = (lx - sp.lx) + (ly - sp.ly) < -0.5;
            if (!fine) col = dd > sp.r - 0.9 ? SPOT[lit ? 2 : 0] : SPOT[lit ? 3 : 2];
            else {
              col = dd > sp.r - 0.55 ? SPOT[lit ? 1 : 0] : SPOT[lit ? 3 : 2];
              if (sp.r > 2.2 && Math.hypot(lx - sp.lx + sp.r * 0.38, (ly - sp.ly) * 1.35 + sp.r * 0.38) < 0.5) col = SPOT_HI;
              else if (!lit && dd > sp.r - 1.1 && dd <= sp.r - 0.55) col = SPOT[1];
            }
            break;
          }
        }
        pt.tex(X, Y, col);
      } else if (!dome && ly > rim && ly <= rim + (2.4 + 2.6 * sq) * gm) {
        const depth = (ly - rim) / ((2.4 + 2.6 * sq) * gm);
        const gx = lx * (1 - depth * 0.45);
        if (!fine) {
          const line = ((gx / 2.4) % 1 + 1) % 1 < 0.38;
          const col = Math.abs(lx) < 4 && depth > 0.5 ? GILL[0] : line ? GILL[1] : depth > 0.6 ? GILL[2] : GILL[3];
          pt.tex(X, Y, col);
          if (!line && Math.abs(lx) > 3) {
            const lam = Math.floor((gx / 2.4) + 100);
            const hot = (lam % 2 === 0) ? 1.6 : 0.9;
            pt.gl(X, Y, K_GILL, (hot + 0.6 * Math.sin(P.pulse + lam * 0.7)) * (1 - depth * 0.5) * (1 + P.gillOpen * 0.5));
          }
          continue;
        }
        const f = ((gx / 2.4) % 1 + 1) % 1, line = f < 0.2;
        let col = Math.abs(lx) < 4 && depth > 0.5 ? GILL[0] : line ? GILL[1] : f < 0.36 && depth < 0.55 ? GILL[4] : depth > 0.6 ? GILL[2] : GILL[3];
        if (depth < 0.1 && !line) col = GILL[2];   // Schatten direkt unter dem Hutrand
        pt.tex(X, Y, col);
        if (!line && Math.abs(lx) > 3) {
          const lam = Math.floor((gx / 2.4) + 100);
          let pu = LPULSE[lam];
          if (pu !== pu) pu = LPULSE[lam] = ((lam % 2 === 0) ? 1.6 : 0.9) + 0.6 * Math.sin(P.pulse + lam * 0.7);
          pt.gtex(X, Y, K_GILL, pu * (1 - depth * 0.5) * (1 + P.gillOpen * 0.5) + (f < 0.42 ? 0.7 : 0));
        }
      }
    }
  }
  const toW = (lx, ly) => ({ x: K.x + (lx + OFF) * c - ly * s, y: K.y + (lx + OFF) * s + ly * c });
  if (fine && dome) {
    // Falten am Hutrand: kurze Kerben vom Rand nach oben, Lichtseite links daneben (statt Runzel-Sprenkeln)
    for (let q = -0.86; q <= 0.86; q += 0.155) {
      const lx = q * Rr, rim = rimY(lx), h = 1.4 + 1.4 * Math.abs(Math.sin(q * 5.3 + 0.4));
      if (spots.some((sp) => Math.abs(lx - sp.lx) < sp.r + 0.6 && rim - h - 0.6 < sp.ly + sp.r)) continue;
      const a = toW(lx, rim - 0.7), b = toW(lx * 0.97, rim - 0.7 - h), a2 = toW(lx - 0.5, rim - 0.7), b2 = toW(lx * 0.97 - 0.5, rim - 0.7 - h * 0.7);
      if (q < 0.1) pt.fline(a2.x, a2.y, b2.x, b2.y, CAP[4]);
      pt.fline(a.x, a.y, b.x, b.y, CAP[1]);
    }
  }
  return { toW, rimY, Rr, Hd };
}
// Hyphen vom Hutrand; fein: Fäden als Texellinien mit Perlen, dazwischen feinere Nebenfäden, Sporenperle mit Glanz
function hyphae(pt, P, cg) {
  const fine = RS > 1;
  for (let j = 0; j < 11; j++) {
    const q = -0.94 + j * 0.188;
    if (q > -0.3 && q < 0.72) continue;
    const lx = q * cg.Rr;
    const p = cg.toW(lx, cg.rimY(lx) + 0.5);
    let x = p.x, y = p.y;
    const len = 4 + hash2(j, 1, 271) * 12 * (1 + P.gillOpen * 0.3);
    for (let s = 0; s < len; s++) {
      const x0 = x, y0 = y;
      x += Math.sin(P.hyT + j * 1.3 + s * 0.3) * 0.3 * (s / len) + (P.cap - 0.06) * 0.4; y += 0.95;
      if (!fine || s < 2) pt.px(x, y, s < 2 ? GILL[3] : (s & 1) ? GILL[2] : GILL[4]);
      else { pt.fline(x0, y0, x, y, GILL[3]); if (s % 3 === 0) { pt.dot(x - 0.5, y, GILL[4]); pt.dot(x, y, GILL[5]); } }
    }
    if (hash2(j, 2, 271) < 0.55) {
      pt.px(x, y + 1, SAC[4]); pt.gl(x, y + 1, K_SPORE, 2 + (Math.sin(P.pulse + j) > 0 ? 1 : 0));
      if (fine) { pt.dot(x - 0.25, y + 0.75, SAC[6]); pt.gdot(x - 0.25, y + 0.75, K_SPORE, 4); }
    }
    if (fine && q + 0.094 < 1) {
      // Nebenfaden (1 Texel) zwischen den Hauptfäden
      const lx2 = (q + 0.094) * cg.Rr, p2 = cg.toW(lx2, cg.rimY(lx2) + 0.4);
      let x2 = p2.x, y2 = p2.y;
      const l2 = 3 + hash2(j, 3, 271) * 7;
      for (let s = 0; s < l2; s++) {
        const a = x2, b = y2;
        x2 += Math.sin(P.hyT * 1.2 + j * 2.1 + s * 0.4) * 0.25 + (P.cap - 0.06) * 0.4; y2 += 0.95;
        pt.fline(a, b, x2, y2, s < 2 ? GILL[3] : GILL[2]);
      }
      pt.dot(x2, y2 + 0.5, GILL[5]); pt.gdot(x2, y2 + 0.5, K_GILL, 2.5);
    }
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
  const fine = RS > 1;
  let lt = NaN, moss = false, r = 0, ga = 0, gb = 0, gon = false;   // je Abtastschritt (t) nur einmal rechnen
  tube(pt, pts, wf, fine ? (e, t) => {
    // fein: Moospolster mit Lichtkante, Rindenringe als Kerbe mit hellem Wulst, Längsrillen (Borke)
    if (t !== lt) {
      lt = t; moss = t < 0.8 && Math.sin(t * 31 + seed) + Math.sin(t * 13 + seed * 2.7) > 0.2; r = ((t * 9 + seed) % 1) - 0.5;
      ga = -0.35 - 0.06 * Math.sin(t * 40 + seed); gb = 0.2 - 0.05 * Math.sin(t * 29 + seed); gon = ((t * 23 + seed) % 1) < 0.7;
    }
    if (moss && e > 0.45) return MOSS[back ? 2 : e > 0.82 ? 4 : 3];
    let v = 0.4 + e * 0.38 + sh;
    if (Math.abs(r) < 0.03) v -= 0.3;
    else if (r > 0.03 && r < 0.07) v += 0.16;
    else if (gon && (Math.abs(e - ga) < 0.07 || Math.abs(e - gb) < 0.07)) v -= 0.2;
    return BARK[v <= 0 ? 0 : v >= 1 ? 5 : (v * 5 + 0.5) | 0];
  } : (e, t, x, y) => {
    if (e > 0.45 && t < 0.8 && hash2(x >> 1, y >> 1, 281 + seed) < 0.4) return MOSS[back ? 2 : 3 + (e > 0.8 ? 1 : 0)];
    let v = 0.4 + e * 0.38 + sh;
    if (Math.abs(((t * 9 + seed) % 1) - 0.5) < 0.05) v -= 0.25; // Rindenringe
    return shade(BARK, v, x, y);
  });
  // Dornen auf der Außenseite (fein: am Fuß breit, zur Spitze 1 Texel, Knochenspitze mit Glanz)
  for (let i = 3; i < pts.length - 3; i += 4) {
    const a = pts[i], b = pts[i + 1];
    const tx = b.x - a.x, ty = b.y - a.y, tl = Math.hypot(tx, ty) || 1;
    const side = (i >> 2) % 2 ? 1 : -1;
    const nx = (-ty / tl) * side, ny = (tx / tl) * side;
    const hw = wf(a.t) / 2;
    const L0 = 2 + (hash2(i, seed, 283) * 2) * (1 - a.t * 0.5);
    if (!fine) {
      for (let k = 0; k <= L0; k += 0.5) {
        const x = a.x + nx * (hw + k) + (tx / tl) * k * 0.5, y = a.y + ny * (hw + k) + (ty / tl) * k * 0.5;
        pt.px(x, y, k > L0 - 1 ? BONE[back ? 2 : 3] : BARK[back ? 2 : 3]);
      }
      continue;
    }
    const lit = nx + ny < 0;   // Dorn zeigt zum Licht (oben links)
    for (let k = -0.5; k <= L0 + 0.25; k += 0.25) {
      const x = a.x + nx * (hw + k) + (tx / tl) * k * 0.5, y = a.y + ny * (hw + k) + (ty / tl) * k * 0.5;
      const w = Math.max(0, (1 - (k + 0.5) / (L0 + 0.75)) * 1.1);
      const tip = k > L0 - 1;
      const cMid = tip ? BONE[back ? 2 : 3] : BARK[back ? 2 : 3];
      pt.dot(x, y, cMid);
      for (let o = 0.25; o <= w; o += 0.25) {
        pt.dot(x + (tx / tl) * o, y + (ty / tl) * o, tip ? BONE[back ? 1 : 2] : BARK[back ? 1 : lit ? 4 : 2]);
        pt.dot(x - (tx / tl) * o, y - (ty / tl) * o, tip ? BONE[back ? 2 : 3] : BARK[back ? 2 : lit ? 3 : 1]);
      }
    }
    if (!back) { const k = L0 - 0.75; pt.dot(a.x + nx * (hw + k) + (tx / tl) * k * 0.5 - 0.25, a.y + ny * (hw + k) + (ty / tl) * k * 0.5 - 0.25, SPOT[3]); }
  }
  // Leuchtknoten (fein: heißer Kern, dunkler Ring)
  for (const t of [0.46, 0.78]) {
    const p = pts[Math.round(t * n)];
    pt.px(p.x, p.y, GILL[4]); pt.px(p.x + 1, p.y, GILL[3]);
    pt.gl(p.x, p.y, K_VEIN, back ? 1.6 : 2.4); pt.gl(p.x + 1, p.y, K_VEIN, 1.4);
    if (fine) {
      pt.dot(p.x - 0.25, p.y - 0.25, GILL[5]); pt.dot(p.x + 1.25, p.y + 0.25, GILL[2]); pt.dot(p.x - 0.75, p.y + 0.25, BARK[1]);
      pt.gdot(p.x - 0.25, p.y - 0.25, K_VEIN, back ? 3 : 4);
    }
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
    if (fine) {
      // Krallenspitze: Glanzpunkt, Gelenkkerbe
      const q = fp[fp.length - 2], m = fp[Math.round(fp.length * 0.45)];
      if (q) pt.dot(q.x - 0.25, q.y - 0.25, back ? BONE[3] : SPOT[3]);
      if (m) pt.dot(m.x, m.y, BARK[1]);
    }
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
    if (RS > 1 && lvl >= 1.5) pt.gtex(Math.round(x * RS), Math.round(y * RS), K_SPORE, lvl + 1.2);   // heller Kern
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

function cut(d, bb) {
  const w = bb.x1 - bb.x0 + 1, h = bb.y1 - bb.y0 + 1, o = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) o.set(d.subarray((y + bb.y0) * TW + bb.x0, (y + bb.y0) * TW + bb.x0 + w), y * w);
  return o;
}
function crop(d, bb) { return pixelsToCanvas(cut(d, bb), bb.x1 - bb.x0 + 1, bb.y1 - bb.y0 + 1); }
function lazyFrame(o, key, pos, val, w, h, ax, ay, res) {
  let f = null;
  Object.defineProperty(o, key, {
    get() {
      if (!f) {
        const d = new Uint32Array(w * h);
        for (let k = 0; k < pos.length; k++) d[pos[k]] = val[k];
        f = new SpriteFrame(pixelsToCanvas(d, w, h), ax, ay, res); pos = val = null;
      }
      return f;
    },
    set(v) { f = v; pos = val = null; },
    enumerable: true, configurable: true,
  });
}
// Belegte Leuchttexel: Rahmen (wie früher bbox(g)) und Lage im Ausschnitt mit den Farben beider Ebenen
let GPOS = new Int32Array(0);
function glowTexels(pt) {
  const r = pt, g = pt.g;   // x0..y1 = Bereich aller Leuchtschreibungen
  let x0 = TW, y0 = TH, x1 = -1, y1 = -1, n = 0;
  if (GPOS.length < TW * TH) GPOS = new Int32Array(TW * TH);
  for (let y = Math.max(0, r.y0); y <= r.y1; y++) for (let x = Math.max(0, r.x0), i = y * TW + x; x <= r.x1; x++, i++) {
    if (!g[i]) continue;
    GPOS[n++] = i;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const bb = x1 < 0 ? { x0: 0, y0: 0, x1: 0, y1: 0 } : { x0, y0, x1, y1 };
  const w = bb.x1 - bb.x0 + 1, pos = new Int32Array(n), ga = new Uint32Array(n), gb = new Uint32Array(n);
  for (let k = 0; k < n; k++) {
    const i = GPOS[k], y = (i / TW) | 0, x = i - y * TW;
    pos[k] = (y - bb.y0) * w + (x - bb.x0); ga[k] = g[i]; gb[k] = pt.e[i];
  }
  return { bb, pos, ga, gb };
}

function frame(P, ex = {}) {
  const pt = Painter.get();
  const meta = drawMother(pt, P, ex);
  rimPass(pt);
  const bb = pt.bx1 < 0 ? { x0: 0, y0: 0, x1: 0, y1: 0 } : { x0: pt.bx0, y0: pt.by0, x1: pt.bx1, y1: pt.by1 };
  let base;
  if (RS === 1) base = new SpriteFrame(outlineCanvas(crop(pt.b, bb)), AX - bb.x0 + 1, AY - bb.y0 + 1);
  else {
    // fein: Umriss 1 Texel (Oberkante im Materialton) wie buildFrame
    const w = bb.x1 - bb.x0 + 1, h = bb.y1 - bb.y0 + 1;
    base = new SpriteFrame(pixelsToCanvas(outlinePixels(cut(pt.b, bb), w, h), w + 2, h + 2), AX * RS - bb.x0 + 1, AY * RS - bb.y0 + 1, RS);
  }
  // Leuchtebenen: Pixel jetzt ausschneiden, Leinwand erst beim ersten Gebrauch (wie flipped/flash im SpriteFrame);
  // Phase 3 wird oft nie gezeigt, und der Zonenaufbau spart so zwei Leinwände je Frame.
  // Gespeichert werden nur die belegten Leuchttexel (Lage + Farbe beider Phasen): spart Speicher und Müllabfuhr.
  const gl = glowTexels(pt), gb = gl.bb, gw = gb.x1 - gb.x0 + 1, gh = gb.y1 - gb.y0 + 1, gax = AX * RS - gb.x0, gay = AY * RS - gb.y0, rs = RS;
  lazyFrame(base, 'glow', gl.pos, gl.ga, gw, gh, gax, gay, rs);
  lazyFrame(base, 'glowEnraged', gl.pos, gl.gb, gw, gh, gax, gay, rs);
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
  setRes(fineRes());
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
