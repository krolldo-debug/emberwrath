import { buildFrame, SpriteFrame, Animation, lazyFrame } from '../gfx/Sprite.js';
import { FineCanvas, fineRes, col32 } from '../gfx/Fine.js';
import { hash2 } from '../core/math.js';
import { plate, bar, orb, gem, hornQ, poly, hair as fl, thick, trace, cloth, strands, dotp } from './bossPaint.js';

// Nerith, die Ertrunkene Priesterin – Boss des Versunkenen Tempels.
//
// Rig wie beim Knochenfürsten: Taille, Wirbelsäule, Kopf, zwei Arme (IK),
// dazu ein Haar-Simulator (Strähnen, die wie unter Wasser treiben), zerfetzte
// Robenbahnen, ein Unterleib aus Wasserschleiern und Tentakeln und ein
// Dreizack-Stab mit leuchtender Perle. Schlüsselposen werden beim Laden weich
// interpoliert. Jeder Frame hat eine Leucht-Ebene in Türkis (`glow`) und für
// Phase 2 („Die Flut steigt“) eine kältere, hellere Variante (`glowEnraged`)
// mit zusätzlichen leuchtenden Haarsträhnen.
// Versinken/Auftauchen: Pose-Parameter `sink` schneidet die Figur an der
// Wasserlinie ab und zeichnet Wellenringe bzw. eine Spritzkrone.
// Blickrichtung rechts, Anker = Wasserpunkt unter der schwebenden Figur.
const W = 156, H = 124, AX = 72, AY = 114;

// Materialrampen (dunkel -> hell)
const SKIN = ['#1c2630', '#33434e', '#546873', '#7f959e', '#aabfc2', '#d6e6e4'];
const ROBE = ['#071a1e', '#0d2d32', '#15474a', '#1f655e', '#32877a', '#54a996'];
const GOLD = ['#2c2412', '#5a4a24', '#8c7a42', '#bea866', '#e4d49a'];
const HAIR = ['#060d10', '#0d1c20', '#15302f', '#204542', '#306058', '#508a7c'];
const WATER = ['#0a192a', '#113352', '#1c5882', '#3886b2', '#76bcdc', '#c6eaf6'];
const CORAL = ['#3a1018', '#6c2228', '#a43c38', '#d4664e', '#f4a07e'];
const BRONZE = ['#0f1b19', '#1d332f', '#2f4f48', '#4a7266', '#78a292'];
const ALGAE = ['#09150d', '#132719', '#203e25', '#315831', '#4a783f'];
const PEARL = ['#5e7e8e', '#a2c4ce', '#dcf2f2', '#ffffff'];
const GLOW = {
  tide: ['#063a48', '#0e7888', '#2ec8cc', '#a0fff0', '#ffffff'],
  flood: ['#0a1c5c', '#2050d0', '#60a8ff', '#c8e6ff', '#ffffff'],
};

const NE_SOCKET = '#101820', NE_MOUTH = '#1e1824';
const NE_EYE = ['#b4fff4', '#34d2d6'];

const SPINE = 16, UPPER = 9, FORE = 9;
const WL = AY - 3; // Wasserlinie im Canvas

// ---------------------------------------------------------------- Pose

const REST = {
  wx: 0, wy: 0, float: 0, lean: 0.05, head: 0, headY: 0, jaw: 0,
  hFx: 9, hFy: 11, hBx: -5, hBy: 14, staff: -1.42,
  cast: 0, eye: 1, pearl: 1, hairT: 0, hairLift: 0.2, hairWild: 0,
  clothT: 0, trail: 0, veil: 0, sink: 0, splash: 0, ripple: 0, open: 0, melt: 0,
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

// ---------------------------------------------------------------- Feinraster-Werkzeuge
// Gezeichnet wird auf FineCanvas (docs/STYLE.md „Feinraster“, Stufe B). Bei res 1 zeichnen diese Helfer exakt wie
// früher PixelCanvas (Bildvergleich bei „Niedrig“); fein tasten sie Feinpixel ab. Handfeine Zusätze in `if (p.fine)`.

// Punkt in Weltkoordinaten: res 1 = gerundeter Weltpixel, fein = nächstgelegenes Feinpixel
const pt = (p, x, y, c) => (p.res === 1 ? p.px(x, y, c) : p.dot(x + p.step / 2, y + p.step / 2, c));
// Gefüllte Ellipse wie PixelCanvas.ellipse, im Feinraster gerechnet (bei res 1 identisch; fein Radius + ½ Feinpixel,
// damit die Fläche so groß bleibt wie früher)
function ell(p, cx, cy, rx, ry, c) {
  if (!c || p.isNull) return;
  const r = p.res, v = col32(c), X = (cx + p.ox) * r, Y = (cy + p.oy) * r, RX = rx * r + (r - 1) / 2, RY = ry * r + (r - 1) / 2, n = Math.ceil(RY);
  for (let y = -n; y <= n; y++) {
    const t = 1 - (y * y) / (RY * RY);
    if (t < 0) continue;
    const hw = Math.round(RX * Math.sqrt(t) - 0.15), F = Math.round(X - hw), G = Math.round(Y + y);
    for (let i = 0; i <= hw * 2; i++) p.put(F + i, G, v);
  }
}
// Linie 1 Weltpixel stark: res 1 Bresenham in Weltpixeln, fein im Feinraster
function ln(p, x0, y0, x1, y1, c) {
  if (p.res === 1) p.line(x0, y0, x1, y1, c);
  else { const h = p.step / 2; p.fline(x0 + h, y0 + h, x1 + h, y1 + h, c, 1); }
}
// Linie 1 Feinpixel (nur fein), gleiche Lage wie pt
const hair = (p, x0, y0, x1, y1, c) => { const h = p.step / 2; p.fline(x0 + h, y0 + h, x1 + h, y1 + h, c); };
const clamp5 = (v) => Math.max(0, Math.min(5, v));

// Zeichenfläche, die nichts zeichnet: für den zweiten Durchlauf, der nur die
// Phase-2-Leuchtebene braucht (spart die Hälfte der Ladezeit).
class NullCanvas {
  constructor(res) { this.res = res; this.step = 1 / res; this.fine = res > 1; this.ox = 0; this.oy = 0; this.isNull = true; }
  put() {} px() {} dot() {} rect() {} line() {} fline() {} each() {}
  translate(dx, dy) { this.ox += dx; this.oy += dy; }
  resetTranslate() { this.ox = 0; this.oy = 0; }
}
// Alles ab Weltzeile y entfernen (Wasserlinie beim Versinken)
function clipBelow(c, y) {
  if (c.isNull) return;
  c.buf.fill(0, y * c.res * c.W);
}

// Dickes Glied mit Licht von links oben (ramp: 4 Stufen dunkel -> hell); fein: Kanten 1 Feinpixel,
// halbe Breite + 0,25 (gleiche Silhouette wie früher)
function limb(p, x0, y0, x1, y1, w0, w1, ramp) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len, ny = dx / len;
  if (nx + ny > 0) { nx = -nx; ny = -ny; }
  const q = p.step, e = Math.max(q, 0.5), steps = Math.ceil(len * 2 / q), grow = (1 - q) / 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, x = x0 + dx * t, y = y0 + dy * t;
    const hw = (w0 + (w1 - w0) * t) / 2 + grow;
    for (let k = -hw; k <= hw + 0.01; k += 0.5 * q) {
      const c = k > hw - e ? ramp[3] : k < -hw + e ? ramp[0] : k > 0 ? ramp[2] : ramp[1];
      pt(p, x + nx * k, y + ny * k, c);
    }
  }
}

// ---------------------------------------------------------------- Haar

// Eine Strähne: treibt wie unter Wasser. Benachbarte Strähnen teilen sich die
// Strömung (Phase hängt stetig von u ab), dadurch verschmelzen sie zu einer
// geschlossenen Haarmasse. Licht nur als wenige durchgehende Glanzbänder.
function strand(p, g, glow, ox, oy, dir, L, w0, j, P, { shade = 1, sheen = false, edge = false, u = 0, glowy = 0 } = {}) {
  let x = ox, y = oy;
  const wild = 1 + P.hairWild * 1.4;
  for (let s = 0; s < L; s += 0.6) {
    const f = s / L;
    const a = dir + Math.sin(P.hairT + s * 0.13 + u * 1.6) * (0.06 + 0.42 * f) * wild
      + Math.sin(P.hairT * 2 + u * 3.1 + s * 0.29) * 0.12 * f * P.hairWild;
    x += Math.cos(a) * 0.6; y += Math.sin(a) * 0.6;
    const hw = Math.max(0.5, w0 * (1 - f * f * 0.9)) / 2;
    const nx = -Math.sin(a), ny = Math.cos(a);
    const sgn = nx + ny > 0 ? -1 : 1; // Kante zum Licht (links oben)
    if (p.fine) {
      // Fein: zwei Abtastreihen je Schritt (lückenlos), Unterlocken mit dunklen Fugen (Strähnen),
      // Glanzband als Glanzlinie 1 Feinpixel mit hellem Saum
      const H = hw + 0.4;   // fein etwas voller (Figur kräftiger)
      for (const b of [0.3, 0]) {
        const cx = x - Math.cos(a) * b, cy = y - Math.sin(a) * b;
        for (let k = -H; k <= H + 0.01; k += 0.25) {
          const ks = k * sgn, ak = Math.abs(k);
          let sh = shade - (f > 0.7 ? 1 : 0);
          if (sheen && f > 0.08 && f < 0.6) { const dd = Math.abs(ks - hw * 0.3); if (dd < 0.13) sh = shade + 2; else if (dd < 0.38) sh = shade + 1; }
          if (edge && ks < -H + 0.4 && f > 0.15) sh = 0;
          pt(p, cx + nx * k, cy + ny * k, HAIR[clamp5(sh)]);
        }
      }
      if (glowy && hash2(j, Math.floor(s * 1.5), 17) < glowy) { g.px(x, y, glow[2]); if (hash2(j, Math.floor(s), 19) < 0.3) pt(g, x, y, glow[3]); }
      continue;
    }
    for (let k = -hw; k <= hw + 0.01; k += 0.5) {
      let sh = shade - (f > 0.7 ? 1 : 0);
      if (sheen && Math.abs(k * sgn - hw * 0.3) < 0.5 && f > 0.08 && f < 0.6) sh = shade + 2;
      if (edge && k * sgn < -hw + 0.6 && f > 0.15) sh = 0; // dunkle Fuge zwischen den Büscheln
      p.px(x + nx * k, y + ny * k, HAIR[Math.max(0, Math.min(5, sh))]);
    }
    if (glowy && hash2(j, Math.floor(s * 1.5), 17) < glowy) g.px(x, y, glow[hash2(j, Math.floor(s), 19) < 0.3 ? 3 : 2]);
  }
  return { x, y };
}

// Fein: Strähnenlinien über der fertigen Haarmasse (gleicher Pfad wie strand): helle Strähne mit harter Lichtkante
// (1 Feinpixel Glanz, daneben ein Mittelton) oder dunkle Mulde. off = Lage quer zur Strähne (-1 Schatten … +1 Licht).
function hairLine(p, ox, oy, dir, L, w0, P, u, shade, off, lit) {
  let x = ox, y = oy;
  const wild = 1 + P.hairWild * 1.4;
  for (let s = 0; s < L; s += 0.6) {
    const f = s / L;
    const a = dir + Math.sin(P.hairT + s * 0.13 + u * 1.6) * (0.06 + 0.42 * f) * wild
      + Math.sin(P.hairT * 2 + u * 3.1 + s * 0.29) * 0.12 * f * P.hairWild;
    const px0 = x, py0 = y;
    x += Math.cos(a) * 0.6; y += Math.sin(a) * 0.6;
    if (f < 0.06 || f > (lit ? 0.82 : 0.68)) continue;
    const hw = Math.max(0.5, w0 * (1 - f * f * 0.9)) / 2;
    const nx = -Math.sin(a), ny = Math.cos(a), sgn = nx + ny > 0 ? -1 : 1;
    const k = off * hw * sgn, kx = nx * k, ky = ny * k;
    if (lit) {
      const top = f < 0.55 ? Math.min(5, shade + 2) : Math.min(5, shade + 1);
      hair(p, px0 + kx, py0 + ky, x + kx, y + ky, HAIR[top]);
      hair(p, px0 + kx - nx * sgn * 0.5, py0 + ky - ny * sgn * 0.5, x + kx - nx * sgn * 0.5, y + ky - ny * sgn * 0.5, HAIR[Math.min(5, shade + 1)]);
    } else {
      hair(p, px0 + kx, py0 + ky, x + kx, y + ky, HAIR[Math.max(0, shade - 2)]);
      hair(p, px0 + kx + nx * sgn * 0.5, py0 + ky + ny * sgn * 0.5, x + kx + nx * sgn * 0.5, y + ky + ny * sgn * 0.5, HAIR[Math.max(1, shade - 1)]);
    }
  }
}

// ---------------------------------------------------------------- Unterleib

function veils(p, g, glow, wx, wy, P, flood) {
  const n = 12;
  const bottom = AY - 2;
  for (let j = 0; j < n; j++) {
    const u = j / (n - 1);
    const tent = j === 2 || j === 8;
    const x0 = wx - 7 + u * 13;
    const L = bottom - wy - 1 + Math.sin(u * 9) * 2 - (tent ? 2 : 0);
    const w0 = tent ? 4 : 4.4;
    const q = p.step, fine = p.fine, grow = (1 - q) / 2;
    for (let s = 0; s < L; s += 0.5 * q) {
      const v = s / L;
      const curl = tent ? Math.pow(v, 3) * (2.2 + Math.sin(P.clothT + j) * 0.6) * (j === 8 ? 1 : -1) : 0;
      let x = x0 - P.trail * 12 * v * v + Math.sin(P.clothT + u * 2.4 + v * 3.5) * 2.6 * v + (u - 0.5) * 10 * v * P.veil;
      let y = wy + 2 + s;
      if (curl) { x += Math.sin(curl) * 3 * v; y -= (1 - Math.cos(curl)) * 2 * v; }
      // Spitzen laufen spitz zu statt zu zerfasern
      const hw = w0 * (1 - v * v * 0.88) / 2 * (fine ? 1.15 : 1) + grow;
      for (let k = -hw; k <= hw + 0.01; k += 0.5 * q) {
        // Licht über die ganze Breite des Wasserleibs (links hell), unten heller Schaum
        const gx = u + (k / 14);
        let i = gx < 0.18 ? 4 : gx < 0.45 ? 3 : gx < 0.78 ? 2 : 1;
        if (v > 0.8) i = Math.min(5, i + 1);
        if (k > hw - 0.6 * q && j % 3 === 2) i = Math.max(1, i - 1); // Faltenkante
        if (fine && v > 0.16 && !tent) {
          // fein: Geisterleib mit hellem Kern je Bahn und harten Kanten (links Licht, rechts dunkle Fuge)
          const ak = Math.abs(k + hw * 0.15);
          if (ak < 0.13 && j >= 3 && j <= 8 && v > 0.2 && v < 0.88) i = 5;
          else if (ak < hw * 0.2 && u < 0.75) i = Math.min(5, i + 1);
          if (k < -hw + 0.3 && j % 2 === 0) i = Math.min(5, i + 1);
          else if (k > hw - 0.3) i = Math.max(0, i - 2);
        }
        let c = WATER[i];
        if (v < 0.16) c = ROBE[gx < 0.3 ? 4 : gx < 0.7 ? 3 : 2];
        else if (tent) c = k * 2 < -hw ? WATER[4] : k > hw - 0.6 * q ? ROBE[1] : WATER[2];
        pt(p, x + k, y, c);
      }
      if (fine && !tent && j >= 3 && j <= 8 && v > 0.2 && v < 0.88) pt(g, x - hw * 0.15, y, glow[j >= 4 && j <= 7 && v < 0.7 ? 1 : 0]); // Geisterkern (Leuchtebene)
      if (tent && Math.floor(s) % 4 === 2 && v > 0.25 && v < 0.85) {
        if (fine) { if (s % 1 < 0.3) { pt(p, x + hw * 0.3, y, WATER[5]); pt(p, x + hw * 0.3 + 0.5, y + 0.5, ROBE[1]); pt(p, x + hw * 0.3, y + 0.5, WATER[3]); } }
        else p.px(x + hw * 0.3, y, WATER[5]); // Saugnäpfe
      }
      // Wasserglitzern (nur Leucht-Ebene)
      if ((!fine || (s * 2) % 1 === 0) && hash2(j * 7 + Math.floor(s), Math.floor(P.clothT * 3), 53) < (flood ? 0.05 : 0.025)) {
        if (fine) { pt(g, x - hw * 0.4, y, glow[v > 0.7 ? 3 : 2]); pt(g, x - hw * 0.4 + 0.5, y, glow[1]); pt(g, x - hw * 0.4, y + 0.5, glow[1]); }
        else g.px(x - hw * 0.4, y, glow[v > 0.7 ? 3 : 2]);
      }
    }
    // fallende Tropfen unter den Spitzen (nur jede dritte Bahn)
    if (j % 3 === 1 && hash2(j, Math.floor(P.clothT * 2), 59) < 0.5) {
      const dy = (hash2(j, 9, 61) * 6 + P.clothT * 3) % 6;
      const dx = x0 - P.trail * 12 + (u - 0.5) * 10 * P.veil;
      p.px(dx, bottom + 2 + dy * 0.3, WATER[4]);
      g.px(dx, bottom + 2 + dy * 0.3, glow[2]);
    }
  }
}

// ---------------------------------------------------------------- Neuzeichnung (03.11.): Rampen mit 6 Stufen
const GOLD6 = ['#16100a', ...GOLD];
const CORAL6 = ['#4a1420', CORAL[1], CORAL[2], CORAL[3], CORAL[4], '#ffd0b4'];
const BRONZE6 = ['#081210', ...BRONZE];
const PEARL6 = ['#22323c', '#3e5a68', ...PEARL];
const SKIND = ['#121a22', '#24323c', '#3c4e58', '#5a6e78', '#7a9098', '#9cb0b4'];
const ROBED = ['#040f12', '#081c20', '#0d2d32', '#15474a', '#1f655e', '#2a7568'];
const LIP = ['#2a1c30', '#4a3652', '#6c5878', '#8e7c98'];

// Zerfetzte Robenbahnen über dem Wasserleib: eine Stoffbahn mit zackigem Saum, Goldborte, leuchtenden Runen.
function skirt(p, g, glow, wx, wy, P) {
  const N = 14, top = [], bot = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, x0 = wx - 7.5 + u * 16;
    const tongue = i % 2 ? 0 : 3 + Math.sin(u * 7) * 1.5;
    const len = 11 + Math.sin(u * 7) * 2 - Math.abs(u - 0.45) * 5 + tongue;
    const X = (v) => x0 - P.trail * 7 * v * v + Math.sin(P.clothT * 1.2 + u * 2.2 + v * 3) * 1.2 * v + (u - 0.5) * 6 * v * P.veil;
    top.push([X(0), wy - 0.5]); bot.push([X(1), wy + len]);
  }
  cloth(p, [...top, ...bot.slice().reverse()], ROBE, { fold: 2.6, phase: P.clothT * 0.4, hem: 2.5, seed: 3, line: 0.5 });
  // Goldborte
  const band = [], band2 = [];
  for (let i = 0; i <= N; i++) {
    const [ax, ay] = top[i], [bx, by] = bot[i], t = 3.2 / (by - ay);
    band.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
    const t2 = 4.4 / (by - ay); band2.push([ax + (bx - ax) * t2, ay + (by - ay) * t2]);
  }
  poly(p, [...band, ...band2.slice().reverse()], (x) => (x < wx - 2 ? GOLD6[4] : x > wx + 4 ? GOLD6[2] : GOLD6[3]));
  for (let i = 0; i < N; i++) { fl(p, ...band[i], ...band[i + 1], i < 5 ? GOLD6[5] : GOLD6[4]); fl(p, ...band2[i], ...band2[i + 1], GOLD6[1]); }
  // Runen auf den Bahnen
  for (const i of [3, 7, 11]) {
    const [ax, ay] = top[i], [bx, by] = bot[i], x = ax + (bx - ax) * 0.62, y = ay + (by - ay) * 0.62;
    fl(p, x, y - 1, x, y + 1, ROBE[4]); fl(p, x, y - 1, x + 1, y - 1.5, ROBE[4]); dotp(p, x, y - 0.4, ROBE[5]);
    fl(g, x, y - 1, x, y + 1, glow[1]); fl(g, x, y - 1, x + 1, y - 1.5, glow[2]); dotp(g, x, y - 0.4, glow[3]);
  }
}

// ---------------------------------------------------------------- Dreizack
// Bronzeschaft mit Goldringen und Algenwicklung, geschwungener Querbalken, drei Zinken mit Widerhaken, Perle.
function trident(p, g, glow, hx, hy, a, P) {
  const dx = Math.cos(a), dy = Math.sin(a);
  let nx = -dy, ny = dx;
  if (nx + ny > 0) { nx = -nx; ny = -ny; } // n zeigt zum Licht
  const at = (u, v) => [hx + dx * u + nx * v, hy + dy * u + ny * v];
  const q = p.step;
  bar(p, ...at(-17, 0), ...at(29, 0), 2.2, 2, BRONZE6, { line: 0.4 });
  gem(p, ...at(-17, 0), ...at(-20.5, 0), 2, GOLD6);
  for (const r of [-13, 9, 25]) bar(p, ...at(r - 0.6, 0), ...at(r + 0.6, 0), 3, 3, GOLD6, { line: 0.4 });
  // Algenwicklung
  for (let s = 12; s < 21; s += 1.6) fl(p, ...at(s, -1.1), ...at(s + 1, 1.1), ALGAE[3]);
  strands(p, [{ x: at(17, -1.2)[0], y: at(17, -1.2)[1], len: 4.5, a: Math.PI / 2 + 0.3 + Math.sin(P.clothT) * 0.2, w: 1.2, bend: 0.4, lit: 0.6 }], ['#050c07', ...ALGAE]);
  // Querbalken
  const up = [], lo = [];
  for (let k = -7; k <= 7.01; k += 1) { const b = k * k * 0.05; up.push(at(29 + b + 0.9, k)); lo.push(at(29 + b - 0.9, k)); }
  // Zinken
  const prong = (k, len, w) => {
    const b = k * k * 0.05, [x0, y0] = at(29 + b, k);
    const inward = -Math.sign(k) * 0.12;
    const ex = x0 + dx * len + nx * len * inward, ey = y0 + dy * len + ny * len * inward;
    const cx = x0 + dx * len * 0.5 + nx * len * inward * 0.2, cy = y0 + dy * len * 0.5 + ny * len * inward * 0.2;
    hornQ(p, x0, y0, cx, cy, ex, ey, w, 0.7, GOLD6, { n: 5, line: 0.4 });
    const s = Math.sign(k || 1), [bx, by] = [ex - dx * 2.6, ey - dy * 2.6];
    gem(p, bx, by, bx - dx * 1.6 + nx * s * 1.8, by - dy * 1.6 + ny * s * 1.8, 1.2, GOLD6);
    dotp(p, ex, ey, '#fff4c8');
    return { x: ex, y: ey };
  };
  prong(-6.2, 8, 2); prong(6.2, 8, 2);
  const tip = prong(0, 13, 2.6);
  plate(p, [...up, ...lo.reverse()], GOLD6, { edge: 0.5, core: 0.6, line: 0.4 });
  // Perle in der Gabel
  const pr = 1.8 + P.pearl * 0.4 + P.cast * 0.8;
  const [px, py] = at(31.5, 0);
  orb(p, px, py, pr, pr, PEARL6, { line: true });
  dotp(p, px - pr * 0.45, py - pr * 0.45, '#ffffff');
  const gr = pr + 0.8 + P.pearl * 0.6;
  ell(g, px, py, gr + 1.5, gr + 1.5, glow[0]);
  ell(g, px, py, gr + 0.5, gr + 0.5, glow[1]);
  ell(g, px, py, gr - 0.5, gr - 0.5, glow[2]);
  ell(g, px, py, Math.max(0.6, pr - 0.6), Math.max(0.6, pr - 0.6), glow[3]);
  g.px(px, py, glow[4]);
  if (p.fine) ell(g, px - 0.25, py - 0.25, Math.max(0.5, pr - 1.2), Math.max(0.5, pr - 1.2), glow[4]);
  if (P.cast > 0.25) {
    const r = 3 + P.cast * 7;
    for (let s = 2; s < r; s += q) {
      const c = s < r * 0.5 ? (p.fine && s < r * 0.3 ? glow[4] : glow[3]) : glow[2];
      pt(g, px + s, py, c); pt(g, px - s, py, c); pt(g, px, py + s * 0.8, c); pt(g, px, py - s * 1.2, c);
      if (s < r * 0.6) { pt(g, px + s * 0.6, py - s * 0.6, glow[1]); pt(g, px - s * 0.6, py - s * 0.6, glow[1]); pt(g, px + s * 0.6, py + s * 0.5, glow[1]); pt(g, px - s * 0.6, py + s * 0.5, glow[1]); }
    }
  }
  return { tipX: tip.x, tipY: tip.y, pearlX: px, pearlY: py };
}

// Schwung-Schleier: Gischtbogen hinter dem Dreizack.
function smear(p, g, cx, cy, a0, a1, r0, r1, glow) {
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1), span = hi - lo || 1;
  // fein: Form und Farbe je Feinpixel, die Dichte (Zufall) je Weltpixel – sonst flimmert es
  const R1 = Math.ceil(r1), q = p.step;
  for (let y = -R1; y <= R1; y += q) for (let x = -R1; x <= R1; x += q) {
    const d = Math.hypot(x, y);
    if (d < r0 || d > r1) continue;
    let a = Math.atan2(y, x);
    while (a < lo - Math.PI) a += Math.PI * 2;
    while (a > lo + Math.PI) a -= Math.PI * 2;
    if (a < lo || a > hi) continue;
    const fresh = a1 > a0 ? (a - lo) / span : (hi - a) / span;
    const radial = (d - r0) / (r1 - r0);
    const band = Math.max(0, 1 - (1 - radial) * 2.4);
    const dens = fresh * fresh * 0.35 + band * (0.25 + 0.75 * fresh);
    if (hash2(Math.floor(x) + 99, Math.floor(y) + 99, 13) > dens + (p.fine && radial > 0.86 ? 0.3 : 0)) continue;
    const c = radial > 0.86 ? WATER[5] : radial > 0.7 ? WATER[4] : fresh > 0.7 ? WATER[3] : WATER[2];
    pt(p, cx + x, cy + y, c);
    if (fresh > 0.45 && radial > 0.55) pt(g, cx + x, cy + y, radial > 0.85 ? glow[3] : glow[1]);
  }
  // Tropfen am äußeren Rand
  for (let i = 0; i < 14; i++) {
    const a = lo + hash2(i, 1, 77) * span, r = r1 + 1 + hash2(i, 2, 77) * 5;
    p.px(cx + Math.cos(a) * r, cy + Math.sin(a) * r, WATER[4]);
  }
}

// ---------------------------------------------------------------- Figur

function drawFigure(p, g, P, glow, ex, flood) {
  const meta = {};
  const fine = p.fine, q = p.step;
  const wx = AX + P.wx, wy = AY - 28 - P.float + P.wy;
  const lean = P.lean, sl = Math.sin(lean), cl = Math.cos(lean);
  const fx = Math.cos(lean), fy = Math.sin(lean); // "nach vorn" quer zum Rumpf
  const nx = wx + sl * SPINE, ny = wy - cl * SPINE; // Nackenansatz
  const shF = { x: nx + fx * 4, y: ny + fy * 4 + 2 };
  const shB = { x: nx - fx * 4, y: ny - fy * 4 + 1 };
  const hF = { x: nx + P.hFx, y: ny + P.hFy };
  const hB = { x: nx + P.hBx, y: ny + P.hBy };
  const armF = ik(shF.x, shF.y, hF.x, hF.y, UPPER, FORE, 1);
  const armB = ik(shB.x, shB.y, hB.x, hB.y, UPPER, FORE, 1);
  const hcx = Math.round(nx + sl * 3 + P.head + 1), hcy = Math.round(ny - cl * 3 - 6 + P.headY);

  // --- 1. Haar hinten: breite, treibende Masse
  const nH = 18;
  const lift = P.hairLift;
  // von hinten (dunkel, außen) nach vorn (heller) zeichnen, damit die Masse geschlossen bleibt
  for (let jj = nH - 1; jj >= 0; jj--) {
    const j = jj, u = j / (nH - 1);
    const th = -Math.PI / 2 - u * 1.5 - 0.1;
    const ox = hcx - 1 + Math.cos(th) * 4.5, oy = hcy - 1 + Math.sin(th) * 4.5;
    const dir = Math.PI / 2 + 0.35 + u * 0.35 + lift * (0.95 + u * 0.3);
    // vier Strähnenbüschel mit eigener Länge, darin nur kleine Unterschiede
    const cu = Math.min(3.999, u * 4), clump = Math.floor(cu), cl = cu - clump;
    // Büschel laufen spitz zu: die Mitte jedes Büschels ist am längsten
    const L = 32 + [10, 4, 12, 6][clump] + (1 - Math.abs(cl - 0.5) * 2) * 9 - lift * 4 + P.hairWild * 6;
    strand(p, g, glow, ox, oy, dir, L, 7 - u * 1.6, j, P, { u, shade: u < 0.3 ? 4 : u < 0.65 ? 3 : 2, sheen: j === 3 || j === 8 || j === 13, edge: cl < 0.2, glowy: flood ? 0.04 : 0 });
  }
  if (fine) {
    // Haarmasse gliedern: je Büschel 2–3 helle Strähnen mit harter Lichtkante und dunkle Mulden dazwischen
    for (const [j, off, lit] of [[1, 0.45, true], [3, -0.2, false], [4, 0.5, true], [6, 0.3, true], [9, 0.45, true], [11, -0.2, false],
      [12, 0.4, true], [14, 0.35, true], [16, 0.5, true]]) {
      const u = j / (nH - 1), th = -Math.PI / 2 - u * 1.5 - 0.1;
      const ox = hcx - 1 + Math.cos(th) * 4.5, oy = hcy - 1 + Math.sin(th) * 4.5;
      const dir = Math.PI / 2 + 0.35 + u * 0.35 + lift * (0.95 + u * 0.3);
      const cu = Math.min(3.999, u * 4), clump = Math.floor(cu), cl = cu - clump;
      const L = 32 + [10, 4, 12, 6][clump] + (1 - Math.abs(cl - 0.5) * 2) * 9 - lift * 4 + P.hairWild * 6;
      hairLine(p, ox, oy, dir, L, 7 - u * 1.6, P, u, u < 0.3 ? 4 : u < 0.65 ? 3 : 2, off, lit);
    }
  }
  // Zusätzliche, wild peitschende Leuchtsträhnen (nur Leucht-Ebene, Phase 2)
  if (flood) {
    for (let j = 0; j < 4; j++) {
      let x = hcx - 3, y = hcy - 3;
      const dir = Math.PI + 0.4 - j * 0.35 + P.hairWild * 0.3;
      for (let s = 0; s < 26 + j * 5; s += 0.8) {
        const a = dir + Math.sin(P.hairT * 1.7 + s * 0.22 + j * 1.9) * 0.55;
        x += Math.cos(a) * 0.8; y += Math.sin(a) * 0.8;
        if (hash2(j, Math.floor(s * 2), 91) < 0.7) g.px(x, y, glow[s < 8 ? 2 : 1]);
      }
    }
  }

  // --- 2. Hinterer Arm (dunkler): Ärmel, Unterarm, Hand
  bar(p, shB.x, shB.y, armB.jx, armB.jy, 3.8, 3.2, ROBED);
  bar(p, armB.jx, armB.jy, armB.ex, armB.ey, 2.6, 2.1, SKIND);
  if (P.open > 0.3) {
    for (let k = -1; k <= 1; k++) bar(p, armB.ex + k * 0.8, armB.ey - 0.6, armB.ex + k * 1.6, armB.ey - 3.6, 1, 0.7, SKIND, { line: 0.3 });
  }
  orb(p, armB.ex + 0.3, armB.ey, 1.5, 1.3, SKIND);
  meta.cast = { x: armB.ex, y: armB.ey - 3 };
  // zerfetzter Ärmel am hinteren Ellbogen
  {
    const sw = -P.trail * 2, w = Math.sin(P.clothT) * 0.7;
    cloth(p, [[armB.jx - 2, armB.jy - 0.5], [armB.jx + 2, armB.jy], [armB.jx + 1.6 + sw + w, armB.jy + 5.5], [armB.jx + 0.4 + sw, armB.jy + 3.6], [armB.jx - 0.6 + sw + w, armB.jy + 7.5], [armB.jx - 1.6 + sw, armB.jy + 4]], ROBED, { fold: 1.6, phase: P.clothT, line: 0.4 });
  }

  // --- 3. Unterleib aus Wasser, Robenbahnen
  veils(p, g, glow, wx, wy, P, flood);
  skirt(p, g, glow, wx, wy, P);

  // --- 4. Rumpf in Robe: Mieder mit Goldborte, V-Ausschnitt, Schärpe, Gürtel mit Muschel
  const along = (s, k) => [wx + 0.5 + sl * s + fx * k, wy - cl * s + fy * k];
  const M = (list) => list.map(([s, k]) => along(s, k));
  const body = [[-1, -5.2], [6, -5.4], [11, -6.6], [14.2, -7.4], [16, -6.8], [17, -4.2], [17, 3.6], [15.6, 6.8], [13.2, 7.6], [10.6, 6.6], [7, 5.4], [2, 5.2], [-1, 5.6]];
  cloth(p, M(body), ROBE, { fold: 3, phase: P.clothT * 0.3, line: 0.5, seed: 1 });
  // Mieder (vorn, heller), Brustwölbung
  const bod = [[0.4, -3.6], [8, -4.2], [13.6, -3.2], [15.6, 1.2], [15.2, 5.8], [13.2, 7.4], [10.6, 6.4], [7, 5.2], [0.4, 5.2]];
  plate(p, M(bod), ROBE, { edge: 0.6, core: 1.6, flat: 0.8 });
  fl(p, ...along(12.4, 4.4), ...along(11.2, 6.6), ROBE[1]);
  fl(p, ...along(13.2, 0.4), ...along(12.2, 3.8), ROBE[5]);
  trace(p, M([[0.6, -3.4], [8, -4], [13.4, -3]]), GOLD6[4], false, GOLD6[1]);
  for (const s of [3, 6, 9]) dotp(p, ...along(s, 4.6), GOLD6[3]);
  // Ausschnitt: fahle Haut, Schlüsselbeine, Goldsaum
  const vee = [[17.2, -3.4], [17.2, 4], [11.4, 1.2]];
  plate(p, M(vee), SKIN, { edge: 0.6, core: 0.8, line: 0 });
  fl(p, ...along(16, -2.6), ...along(15.4, -0.4), SKIN[5]); fl(p, ...along(15.4, 1.2), ...along(16, 3), SKIN[4]);
  fl(p, ...along(14.2, 0.8), ...along(12.8, 1), SKIN[2]);
  trace(p, M([[17.2, -3.6], [11.2, 1.2], [17.2, 4.2]]), GOLD6[4], false, GOLD6[1]);
  // Schärpe (hintere Schulter -> vordere Hüfte)
  thick(p, shB.x + 1, shB.y + 2.4, wx + 5.5, wy - 0.6, 1.8, GOLD6[3]);
  fl(p, shB.x + 1, shB.y + 1.8, wx + 5.5, wy - 1.2, GOLD6[5]);
  fl(p, shB.x + 1.4, shB.y + 3.1, wx + 5.8, wy + 0.1, GOLD6[1]);
  // Gürtel mit Muschel-Medaillon und Perle
  plate(p, M([[1.2, -5.4], [1.2, 5.6], [-0.6, 5.6], [-0.6, -5.4]]), GOLD6, { edge: 0.5, core: 0.6, line: 0.4 });
  const [mx, my] = along(-0.2, 1.8);
  orb(p, mx, my + 0.6, 2, 1.8, GOLD6);
  for (const t of [-2.4, -1.57, -0.7]) fl(p, mx + Math.cos(t) * 0.4, my + 1.6 + Math.sin(t) * 0.4, mx + Math.cos(t) * 1.7, my + 1.6 + Math.sin(t) * 1.9, GOLD6[1]);
  orb(p, mx, my + 3.4, 0.9, 0.9, PEARL6, { line: false });
  g.px(mx - 0.5, my + 2.9, glow[2]); dotp(g, mx, my + 3.2, glow[4]);
  // Runen auf der Robe
  for (const [k, s] of [[-2, 4], [2, 7], [-1, 10]]) {
    const [x, y] = along(s, k);
    fl(p, x, y - 0.5, x, y + 1.5, ROBE[4]); fl(p, x + 0.5, y - 0.5, x + 1.5, y - 1, ROBE[4]); dotp(p, x, y, ROBE[5]);
    fl(g, x, y - 0.5, x, y + 1.5, glow[1]); fl(g, x + 0.5, y - 0.5, x + 1.5, y - 1, glow[flood ? 2 : 1]); dotp(g, x, y, glow[3]); dotp(g, x, y + 0.5, glow[2]);
  }
  meta.chest = { x: wx + sl * 10, y: wy - cl * 10 };

  // --- 5. Kopf (größer als früher): fahles Gesicht in Dreiviertelansicht, nasses Haar, Korallenkrone
  const HZ = 1.22;
  const J = (u, v) => [hcx - 0.2 + u * HZ, hcy + 7 + (v - 7) * HZ];
  const Jm = (list) => list.map(([u, v]) => J(u, v));
  bar(p, ...J(0.6, 9), ...J(1, 3), 3.6, 3.2, SKIN);
  fl(p, ...J(-0.2, 8.6), ...J(0.2, 4), SKIN[5]);
  // Hinterkopf (nasses Haar)
  orb(p, ...J(-1.6, -0.6), 5.2 * HZ, 5.6 * HZ, HAIR, { glint: false });
  strands(p, [0, 1, 2, 3, 4].map((i) => ({ x: J(-0.5 - i * 1.1, -5 + i * 0.6)[0], y: J(-0.5 - i * 1.1, -5 + i * 0.6)[1], len: (7 + i) * HZ, a: 1.95 + i * 0.12, w: 2.2, bend: 0.5, lit: i < 2 ? 0.8 : 0.45 })), HAIR);
  // Gesicht
  const face = [[-1, -4.4], [2.6, -5.2], [5.6, -4.4], [6.8, -2.2], [6.7, -0.6], [8, 2.3], [6.9, 2.9], [7.2, 3.8], [6.7, 4.5], [7, 5.1], [5.8, 6.7], [3.4, 7], [0.8, 5.4], [-0.6, 2.4]];
  plate(p, Jm(face), SKIN, { edge: 0.8, core: 1.4, flat: 0.8 });
  // Augenhöhlen (Schatten), Wangenknochen
  poly(p, Jm([[3, -0.8], [6.5, -1.3], [6.8, 0.9], [5, 1.4], [3.4, 1]]), SKIN[2]);
  fl(p, ...J(2.2, 2.4), ...J(4.8, 1.9), SKIN[5]); fl(p, ...J(2.4, 3), ...J(4.6, 2.6), SKIN[4]);
  fl(p, ...J(1.6, 4.4), ...J(3.6, 6.4), SKIN[2]);
  // Brauen
  thick(p, ...J(3, -1.5), ...J(6.6, -1.9), 0.7 * HZ, HAIR[1]);
  thick(p, ...J(6.9, -1.4), ...J(7.5, -1.6), 0.6 * HZ, HAIR[1]);
  // Augen
  const lit = P.eye > 0.15;
  if (lit) {
    poly(p, Jm([[3.6, 0.1], [4.9, -0.6], [6.3, 0], [5, 0.7]]), NE_EYE[1]);
    poly(p, Jm([[4.3, 0], [5, -0.4], [5.8, 0], [5, 0.4]]), NE_EYE[0]);
    dotp(p, ...J(4.8, -0.2), '#ffffff');
    poly(p, Jm([[6.9, -0.2], [7.4, -0.5], [7.5, 0.3]]), NE_EYE[1]);
    for (const [u, v, i] of [[5, 0, 4], [4.4, 0, 3], [5.7, 0, 3], [7.2, -0.1, 3]]) dotp(g, ...J(u, v), glow[i]);
    for (const [u, v] of [[3.8, 0.2], [6.2, 0.1]]) g.px(...J(u, v).map((c) => c - 0.5), glow[1]);
    if (P.eye > 0.7) { fl(g, ...J(4.4, 1.2), ...J(4.2, flood ? 4.4 : 3.4), glow[1]); }
  } else {
    fl(p, ...J(3.6, 0.3), ...J(6.2, 0.1), SKIN[0]);
    fl(p, ...J(4, 0.7), ...J(5.8, 0.6), SKIN[1]);
  }
  meta.eye = { x: J(5, 0)[0], y: J(5, 0)[1] };
  // Nase
  fl(p, ...J(6.8, -0.4), ...J(7.8, 2.1), SKIN[5]);
  fl(p, ...J(6.2, 2.9), ...J(7, 2.9), SKIN[1]); dotp(p, ...J(6.9, 2.5), SKIN[2]);
  // Mund (öffnet sich nach unten)
  const jo = P.jaw * 2.4;
  if (jo > 0.2) {
    poly(p, Jm([[5.4, 3.9], [7.1, 3.8], [6.9, 4.6 + jo], [5.6, 4.8 + jo]]), NE_MOUTH);
    fl(p, ...J(5.6, 4), ...J(6.9, 3.9), '#c6d6d2');
    thick(p, ...J(5.6, 5 + jo), ...J(6.8, 4.9 + jo), 0.6 * HZ, LIP[2]);
  } else {
    thick(p, ...J(5.4, 4), ...J(7.1, 3.9), 0.7 * HZ, LIP[1]);
    fl(p, ...J(5.2, 4.5), ...J(7, 4.4), NE_MOUTH);
    thick(p, ...J(5.6, 5), ...J(6.8, 4.9), 0.7 * HZ, LIP[2]);
    dotp(p, ...J(6, 4.9), LIP[3]);
  }
  meta.mouth = { x: J(6.8, 4.4)[0], y: J(6.8, 4.4)[1] };
  // nasse Strähnen an Schläfe und Stirn (rahmen das Gesicht)
  strands(p, [
    { x: J(1.2, -5)[0], y: J(1.2, -5)[1], len: 9 * HZ, a: 1.75, w: 1.8, bend: 0.25, lit: 0.7 },
    { x: J(-0.2, -4.6)[0], y: J(-0.2, -4.6)[1], len: 11 * HZ, a: 1.85, w: 2.2, bend: 0.2, lit: 0.55 },
    { x: J(3.4, -5.2)[0], y: J(3.4, -5.2)[1], len: 3.4 * HZ, a: 0.9, w: 1.4, bend: 0.5, lit: 0.8 },
  ], HAIR);
  if (lit && P.eye > 0.7) dotp(g, ...J(4.2, 2.2), glow[1]);
  // Goldreif mit Perle
  plate(p, Jm([[-2.6, -4.2], [2.6, -5.6], [6.2, -4.8], [6.4, -3.9], [2.6, -4.5], [-2.4, -3.1]]), GOLD6, { edge: 0.5, core: 0.6, line: 0.4 });
  // Korallenkrone: verzweigte Äste mit hellen Spitzen
  const coral = [
    [[-2, -4.4], [-4.2, -8.6], [-5.6, -10.6], 1.7, [[0.5, -1, -1.6]]],
    [[0.2, -4.9], [-0.8, -9.6], [0.2, -13.4], 2, [[0.45, -1.8, -1.2], [0.7, 1.4, -1.4]]],
    [[2.8, -5.3], [3.2, -10], [4.8, -12.6], 1.9, [[0.5, 1.8, -0.8]]],
    [[5.2, -5], [6.8, -7.8], [8.2, -9.4], 1.4, []],
  ];
  for (const [a, c, b, w, br] of coral) {
    for (const [t, ox, oy] of br) {
      const u = 1 - t, sx = u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], sy = u * u * a[1] + 2 * u * t * c[1] + t * t * b[1];
      hornQ(p, ...J(sx, sy), ...J(sx + ox * 0.5, sy + oy * 0.7), ...J(sx + ox, sy + oy - 1.2), 1.3 * HZ, 0.7, CORAL6, { n: 3, line: 0.3 });
      dotp(p, ...J(sx + ox, sy + oy - 1.2), '#ffd8c0');
    }
    hornQ(p, ...J(...a), ...J(...c), ...J(...b), w * 1.25 * HZ, 0.9, CORAL6, { n: 6, line: 0.3 });
    dotp(p, ...J(...b), '#ffd8c0');
    if (flood) dotp(g, ...J(...b), glow[2]);
  }
  orb(p, ...J(2.6, -5.4), 1.1 * HZ, 1.1 * HZ, PEARL6, { line: true });
  dotp(g, ...J(2.6, -5.4), glow[4]); g.px(...J(2.6, -5.4).map((c) => c - 0.5), glow[2]);
  meta.head = { x: J(1, -9)[0], y: J(1, -9)[1] };

  // --- 6. Vorderes Haar über der Schulter
  for (let j = 0; j < 3; j++) {
    const ox = hcx - 3 + j * 0.8, oy = hcy - 1 + j * 1.5;
    const dir = Math.PI / 2 + 0.1 - j * 0.1 + lift * 0.7;
    strand(p, g, glow, ox, oy, dir, 18 + j * 5, 3, 40 + j, P, { u: 0.2 + j * 0.1, shade: 3 - (j > 1 ? 1 : 0), sheen: j === 0 });
  }

  // --- 7. Schwung-Schleier
  if (ex.smear) smear(p, g, shF.x, shF.y, ex.smear[0], ex.smear[1], 12, 12 + FORE + 38, glow);

  // --- 8. Vorderer Arm, Dreizack
  const drawArm = () => {
    bar(p, shF.x, shF.y, armF.jx, armF.jy, 4.2, 3.6, ROBE);
    // weiter Ärmel, zerfetzt
    {
      const sw = -P.trail * 2, w = Math.sin(P.clothT * 1.3) * 0.8;
      cloth(p, [[armF.jx - 2.4, armF.jy - 1], [armF.jx + 2.2, armF.jy - 0.2], [armF.jx + 2 + sw + w, armF.jy + 4.5], [armF.jx + 0.8 + sw, armF.jy + 3.2], [armF.jx - 0.2 + sw + w, armF.jy + 7.5], [armF.jx - 1.4 + sw, armF.jy + 4.6], [armF.jx - 2.6 + sw, armF.jy + 6]], ROBE, { fold: 1.8, phase: P.clothT, line: 0.4 });
      fl(p, armF.jx - 2.2, armF.jy + 0.2, armF.jx + 2, armF.jy + 0.8, GOLD6[4]);
    }
    bar(p, armF.jx, armF.jy, armF.ex, armF.ey, 3, 2.5, SKIN);
    // Armreif
    const bx = armF.jx + (armF.ex - armF.jx) * 0.7, by = armF.jy + (armF.ey - armF.jy) * 0.7;
    const bx2 = armF.jx + (armF.ex - armF.jx) * 0.82, by2 = armF.jy + (armF.ey - armF.jy) * 0.82;
    bar(p, bx, by, bx2, by2, 3.4, 3.2, GOLD6, { line: 0.4 });
    // Muschelspange an der Schulter
    poly(p, [[shF.x - 2.8, shF.y + 0.6], [shF.x - 2.4, shF.y - 1.6], [shF.x - 0.6, shF.y - 2.8], [shF.x + 1.4, shF.y - 2.6], [shF.x + 2.8, shF.y - 1], [shF.x + 2.6, shF.y + 0.8]], GOLD6[0]);
    plate(p, [[shF.x - 2.4, shF.y + 0.4], [shF.x - 2, shF.y - 1.4], [shF.x - 0.5, shF.y - 2.4], [shF.x + 1.3, shF.y - 2.2], [shF.x + 2.4, shF.y - 0.9], [shF.x + 2.2, shF.y + 0.5]], GOLD6, { edge: 0.6, core: 0.5, line: 0 });
    for (const t of [-2.5, -1.9, -1.3, -0.7]) fl(p, shF.x + Math.cos(t) * 0.4, shF.y + 0.5 + Math.sin(t) * 0.4, shF.x + Math.cos(t) * 2.5, shF.y + 0.5 + Math.sin(t) * 2.6, GOLD6[1]);
    orb(p, shF.x + 0.4, shF.y + 0.4, 0.8, 0.8, PEARL6, { line: false });
  };
  let tri;
  if (ex.staffBehind) { tri = trident(p, g, glow, hF.x, hF.y, P.staff, P); drawArm(); }
  else { drawArm(); tri = trident(p, g, glow, hF.x, hF.y, P.staff, P); }
  // Hand umgreift den Schaft
  plate(p, [[hF.x - 1.4, hF.y - 1.2], [hF.x + 1.6, hF.y - 1.4], [hF.x + 2, hF.y + 1], [hF.x + 0.8, hF.y + 2], [hF.x - 1.2, hF.y + 1.6]], SKIN, { edge: 0.5, core: 0.6, line: 0.4 });
  for (const k of [0, 1]) fl(p, hF.x - 0.8, hF.y - 0.2 + k * 0.9, hF.x + 1.4, hF.y - 0.4 + k * 0.9, SKIN[2]);
  meta.hand = { x: hF.x, y: hF.y };
  meta.tip = { x: tri.tipX, y: tri.tipY };
  meta.pearl = { x: tri.pearlX, y: tri.pearlY };

  // Glut an der offenen Hand beim Zaubern
  if (P.cast > 0.05 && P.open > 0.3) {
    const r = 0.8 + P.cast * 2.2;
    ell(g, meta.cast.x, meta.cast.y, r + 1, r + 1, glow[1]);
    ell(g, meta.cast.x, meta.cast.y, r, r, glow[2]);
    ell(g, meta.cast.x, meta.cast.y, Math.max(0.5, r - 1.2), Math.max(0.5, r - 1.2), glow[3]);
    if (fine) { ell(g, meta.cast.x - 0.25, meta.cast.y - 0.25, Math.max(0.5, r - 2.2), Math.max(0.5, r - 2.2), glow[4]); pt(p, meta.cast.x, meta.cast.y, glow[3]); }
  }
  return meta;
}

// Zerfließen: Spalten tropfen nach unten, Pixel werden zu Wasser. Arbeitet auf dem Feinpixel-Puffer;
// Zufall und Versatz je Weltpixel (alle Feinpixel eines Weltpixels fallen gemeinsam), Farbe je Feinpixel.
const WATER32 = WATER.map(col32);
function meltPass(pc, k, recolor) {
  if (k <= 0 || pc.isNull) return;
  const r = pc.res, WW = pc.W, HH = pc.H, d = pc.buf, o = new Uint32Array(d.length);
  const bottom = AY - 1;
  for (let X = 0; X < WW; X++) {
    const x = (X / r) | 0;
    const shift = Math.round(k * k * (5 + hash2(x, 1, 77) * 18));
    for (let Y = 0; Y < HH; Y++) {
      const v = d[Y * WW + X];
      if ((v >>> 24) < 40) continue;
      const y = (Y / r) | 0;
      const hsh = hash2(x, y, 79);
      if (hsh < k * 0.45) continue; // löst sich auf
      const ny = Math.min(bottom - Math.floor(hash2(x, y, 81) * 3 * k), y + shift);
      let c = (v | 0xff000000) >>> 0;
      if (recolor && hash2(x, y, 83) < k * 1.1) {
        const lum = ((v & 255) * 0.3 + ((v >>> 8) & 255) * 0.5 + ((v >>> 16) & 255) * 0.2) / 255;
        c = WATER32[Math.max(1, Math.min(5, Math.round(lum * 5 + 1)))];
      }
      o[(ny * r + Y - y * r) * WW + X] = c;
    }
  }
  d.set(o);
  pc.dirty = true;
}

// Wasseroberfläche: Wellenringe, Spritzkrone
function surface(p, g, P, glow) {
  const cx = AX + P.wx, fine = p.fine, q = p.step;
  const rings = P.sink > 0.02 ? 2 : 1;
  for (let r = 0; r < rings; r++) {
    const rx = 11 + r * 7 + P.ripple * 8 + P.splash * 6, ry = rx * 0.32;
    for (let a = 0; a < Math.PI * 2; a += 0.04 * q) {
      const x = cx + Math.cos(a) * rx, y = WL + Math.sin(a) * ry;
      if (hash2(Math.round(a * 20), r, 101) < 0.25 * r) continue;
      const top = Math.sin(a) < 0;
      if (fine) {
        // Wellenring: Lichtkamm 1 Feinpixel, darunter Wasserton
        pt(p, x, y, top ? WATER[3] : WATER[5]); pt(p, x, y + 0.5, top ? WATER[2] : WATER[4]);
        if (!top && r === 0) { pt(g, x, y, glow[2]); pt(g, x, y + 0.5, glow[1]); }
        continue;
      }
      p.px(x, y, top ? WATER[3] : WATER[4]);
      if (!top && r === 0) g.px(x, y, glow[1]);
    }
  }
  if (P.sink > 0.02) {
    // dunkle Öffnung, wo sie eintaucht
    ell(p, cx, WL + 1, 9, 2.4, WATER[1]);
    ell(p, cx - 1, WL + 1, 6, 1.4, WATER[2]);
    for (let i = 0; i < 6; i++) {
      p.px(cx - 7 + i * 2.6, WL + 1 + (i % 2), WATER[4]);
      if (fine) pt(p, cx - 7 + i * 2.6, WL + 1 + (i % 2), WATER[5]);
    }
  }
  if (P.splash > 0.02) {
    const k = P.splash;
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const rr = 7 + k * 10 + hash2(i, 3, 103) * 4;
      const h = Math.sin(Math.min(1, k * 1.2) * Math.PI) * (10 + hash2(i, 4, 103) * 16) * (Math.sin(a) > 0 ? 0.7 : 1);
      const x = cx + Math.cos(a) * rr, y0 = WL + Math.sin(a) * rr * 0.32;
      for (let s = 0; s < h; s += q) {
        if (s > h * 0.55 && hash2(i, Math.floor(s), 105) < 0.5) continue;
        const c = s > h - 3 ? WATER[5] : WATER[s > h * 0.5 ? 4 : 3];
        if (fine) { pt(p, x + Math.cos(a) * s * 0.15, y0 - s, s > h - 3 ? '#ffffff' : WATER[s > h * 0.5 ? 5 : 4]); pt(p, x + Math.cos(a) * s * 0.15 + 0.5, y0 - s, c); }
        else p.px(x + Math.cos(a) * s * 0.15, y0 - s, c);
      }
      g.px(x + Math.cos(a) * h * 0.15, y0 - h, glow[3]);
      if (fine) pt(g, x + Math.cos(a) * h * 0.15, y0 - h, glow[4]);
      // abgerissene Tropfen
      if (hash2(i, 6, 107) < 0.5) { p.px(x + Math.cos(a) * 4, y0 - h - 3, WATER[5]); g.px(x + Math.cos(a) * 4, y0 - h - 3, glow[2]); }
    }
  }
}

function drawNerith(p, g, P, glow, ex = {}, flood = false) {
  const off = Math.round(P.sink * 72);
  const clip = off > 0;
  // Figur um off nach unten versetzt zeichnen und an der Wasserlinie abschneiden
  p.translate(0, off); g.translate(0, off);
  const meta = drawFigure(p, g, P, glow, ex, flood);
  p.resetTranslate(); g.resetTranslate();
  if (clip) { clipBelow(p, WL); clipBelow(g, WL); }
  if (P.melt > 0) { meltPass(p, P.melt, true); meltPass(g, P.melt, false); }
  if (P.sink > 0.02 || P.splash > 0.02 || P.ripple > 0.02) surface(p, g, P, glow);
  for (const k in meta) meta[k].y += off;
  return meta;
}

// Pfütze aus Wasser und Algen, Robe, Korallenkrone, Dreizack.
function drawRemains(p, g, k, glow) {
  const gy = AY, cx = AX;
  ell(p, cx, gy - 2, 20 + k * 8, 4.5 + k, WATER[1]);
  ell(p, cx - 2, gy - 3, 15 + k * 6, 3 + k * 0.6, WATER[2]);
  for (let a = Math.PI * 1.05; a < Math.PI * 1.7; a += 0.05) p.px(cx + Math.cos(a) * (19 + k * 8), gy - 2 + Math.sin(a) * (4.5 + k), WATER[4]);
  // Robenbündel mit Algen und Haar, sinkt langsam ein
  const rh = 10 * (1 - k * 0.45);
  ell(p, cx - 3, gy - 3 - rh * 0.35, 11, Math.max(2, rh * 0.55), ROBE[1]);
  ell(p, cx - 5, gy - 4 - rh * 0.45, 8, Math.max(1.5, rh * 0.42), ROBE[2]);
  ell(p, cx - 7, gy - 5 - rh * 0.5, 4, Math.max(1, rh * 0.28), ROBE[3]);
  for (let i = 0; i < 6; i++) p.px(cx - 11 + i * 3, gy - 3 - rh * 0.2 - (i % 2), GOLD[i % 2 ? 2 : 3]);
  // nasses Haar über dem Bündel
  for (let j = 0; j < 7; j++) {
    let x = cx - 9 + j * 2, y = gy - 3 - rh * 0.7 + hash2(j, 7, 115) * 2;
    for (let s2 = 0; s2 < 6 + j % 3 * 2; s2++) { x += 0.8 + Math.sin(s2 * 0.8 + j) * 0.4; y += 0.45; p.px(x, y, HAIR[j % 2 ? 3 : 2]); if (s2 % 4 === 1) p.px(x, y - 1, HAIR[4]); }
  }
  // Knochenhand ragt heraus
  p.rect(cx + 5, gy - 5 - rh * 0.2, 3, 2, SKIN[3]); p.px(cx + 8, gy - 6 - rh * 0.2, SKIN[4]); p.px(cx + 8, gy - 4 - rh * 0.2, SKIN[2]);
  for (let i = 0; i < 5; i++) if (hash2(i, 3, 117) < 0.8 - k * 0.5) g.px(cx - 8 + i * 3, gy - 4 - rh * 0.4, glow[1]);
  // Algen und Haarsträhnen
  for (let j = 0; j < 9; j++) {
    let x = cx - 18 + hash2(j, 1, 111) * 30, y = gy - 3 + hash2(j, 2, 111) * 3;
    const L = 8 + hash2(j, 3, 111) * 10, dir = hash2(j, 4, 111) < 0.5 ? 0 : Math.PI;
    for (let s = 0; s < L; s++) {
      x += Math.cos(dir) * 1; y += Math.sin(s * 0.7 + j) * 0.35;
      p.px(x, y, j % 3 === 0 ? HAIR[3] : ALGAE[1 + (s % 3 === 0 ? 2 : 1)]);
    }
  }
  // Dreizack quer
  const tx = cx - 26, ty = gy - 5;
  limb(p, tx, ty, tx + 44, ty - 2, 2, 2, [BRONZE[1], BRONZE[2], BRONZE[3], BRONZE[4]]);
  for (const [dy, len] of [[-4, 7], [0, 10], [3, 7]]) limb(p, tx + 44, ty - 2 + dy, tx + 44 + len, ty - 2 + dy - 0.5, 2, 1, [GOLD[1], GOLD[2], GOLD[3], GOLD[4]]);
  ln(p, tx + 44, ty - 6, tx + 44, ty + 1, GOLD[2]); p.px(tx + 44, ty - 6, GOLD[4]);
  // Perle erlischt
  ell(p, tx + 42, ty - 2, 1.8, 1.8, PEARL[1]); p.px(tx + 41, ty - 3, PEARL[3]);
  if (p.fine) { pt(p, tx + 41, ty - 3, '#ffffff'); pt(p, tx + 42.5, ty - 1.5, PEARL[0]); hair(p, tx + 2, ty - 0.5, tx + 40, ty - 2.3, BRONZE[4]); }
  if (k < 0.9) {
    const r = 3 * (1 - k);
    ell(g, tx + 42, ty - 2, r + 1, r + 1, glow[k > 0.5 ? 0 : 1]);
    ell(g, tx + 42, ty - 2, Math.max(0.6, r * 0.6), Math.max(0.6, r * 0.6), glow[k > 0.5 ? 1 : 2]);
  }
  // Korallenkrone (zerbrochen)
  const kx = cx - 38 - k * 3;
  p.rect(kx, gy - 4, 8, 1, GOLD[2]); p.px(kx, gy - 4, GOLD[4]);
  for (let i = 0; i < 4; i++) limb(p, kx + i * 2 + 1, gy - 4, kx + i * 2 + 1 + (i - 1.5) * 0.8, gy - 6 - [3, 5, 4, 2][i], 1.5, 1, [CORAL[1], CORAL[2], CORAL[3], CORAL[4]]);
  // Glitzern im Wasser
  for (let i = 0; i < 8; i++) if (hash2(i, Math.round(k * 4), 113) < 0.6 - k * 0.4) g.px(cx - 16 + hash2(i, 1, 113) * 32, gy - 3 + hash2(i, 2, 113) * 3, glow[2]);
}

// ---------------------------------------------------------------- Frames

// Leuchtebenen in Feinauflösung wie das Sprite (kein Umriss, Anker in Feinpixeln)
const glowFrame = (g, res) => new SpriteFrame(g.canvas, AX * res, AY * res, res);

// Aufgeschoben (gfx/Sprite.js LazyFrame): gezeichnet wird erst, wenn die Animation den Frame braucht – der Zonenaufbau
// baut den Boss nicht mehr am Stück.
function frame(...a) { return lazyFrame(() => frameNow(...a)); }
function frameNow(P, extra = {}) {
  const res = fineRes(), g = new FineCanvas(W, H, res), g2 = new FineCanvas(W, H, res);
  let meta;
  const base = buildFrame(W, H, AX, AY, (p) => { meta = drawNerith(p, g, P, GLOW.tide, extra, false); }, { fine: true, res });
  // zweiter Durchlauf nur für die Phase-2-Leuchtebene (mehr Leuchtsträhnen und Glitzern)
  drawNerith(new NullCanvas(res), g2, P, GLOW.flood, extra, true);
  base.glow = glowFrame(g, res);
  base.glowEnraged = glowFrame(g2, res);
  base.meta = {};
  for (const k in meta) base.meta[k] = { dx: meta[k].x - AX, dy: meta[k].y - AY };
  base.fx = extra.fx ?? null;
  return base;
}

function remainsFrame(...a) { return lazyFrame(() => remainsFrameNow(...a)); }
function remainsFrameNow(k) {
  const res = fineRes(), g = new FineCanvas(W, H, res), g2 = new FineCanvas(W, H, res);
  const base = buildFrame(W, H, AX, AY, (p) => drawRemains(p, g, k, GLOW.tide), { fine: true, res });
  drawRemains(new NullCanvas(res), g2, k, GLOW.flood);
  base.glow = glowFrame(g, res);
  base.glowEnraged = glowFrame(g2, res);
  const m = (dx, dy) => ({ dx, dy });
  base.meta = { head: m(14, -8), eye: m(12, -6), chest: m(-4, -6), hand: m(-10, -5), tip: m(30, -7), pearl: m(20, -7), cast: m(0, -6), mouth: m(12, -5) };
  base.fx = null;
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

export function createNerithSprites() {
  const T = Math.PI * 2;
  // --- Schweben: Wippen, Haar und Stoff treiben phasenversetzt
  const idleKeys = [];
  for (let i = 0; i <= 8; i++) {
    const ph = (i / 8) * T;
    idleKeys.push([i / 8, pose({
      float: 1 + Math.sin(ph) * 1.5, lean: 0.05 + Math.sin(ph + 1) * 0.02,
      hFy: 11 - Math.sin(ph) * 0.8, hBy: 14 + Math.sin(ph + 0.6), hBx: -5 + Math.cos(ph) * 0.6,
      staff: -1.42 + Math.sin(ph) * 0.03, hairT: ph, clothT: ph, pearl: 1 + Math.sin(ph) * 0.4, head: Math.sin(ph) * 0.4,
    }), linear]);
  }
  // --- Gleiten: vorgebeugt, Schleier und Haar strömen nach hinten
  const walkKeys = [];
  for (let i = 0; i <= 8; i++) {
    const ph = (i / 8) * T;
    walkKeys.push([i / 8, pose({
      float: 2 + Math.sin(ph * 2) * 1, lean: 0.22, wx: 1, trail: 0.9, hairLift: 0.75,
      hFx: 10, hFy: 10, staff: -1.2 + Math.sin(ph) * 0.05, hBx: -8, hBy: 12,
      hairT: ph, clothT: ph * 2, pearl: 1.2, head: 1,
    }), linear]);
  }
  // --- Betend, halb versunken
  const pray = pose({
    sink: 0.3, float: -2, lean: 0.28, head: 1.5, headY: 1.5, eye: 0, pearl: 0.3,
    hFx: 6, hFy: 6, hBx: 4, hBy: 7, staff: -1.62, hairLift: 0, hairWild: 0, ripple: 0.2,
  });
  const dormKeys = [[0, pray], [0.5, { ...pray, hairT: Math.PI, clothT: Math.PI, pearl: 0.6, headY: 1 }], [1, { ...pray, hairT: T, clothT: T }]];
  // --- Aufsteigen und Schrei
  const rise1 = pose({ sink: 0.18, lean: 0.12, head: 1, eye: 0.6, pearl: 0.8, hFx: 8, hFy: 7, hBx: -2, hBy: 10, staff: -1.55, hairLift: 0.4, hairT: 1.2, clothT: 1, splash: 0.35, ripple: 0.4 });
  const rise2 = pose({ sink: 0, float: 6, lean: -0.05, eye: 1, pearl: 1.4, hFx: 12, hFy: 2, hBx: -12, hBy: 2, staff: -1.35, hairLift: 0.9, hairT: 2.2, clothT: 2, veil: 0.6, splash: 0.9, ripple: 0.8, open: 1 });
  const scream = pose({ float: 8, lean: -0.2, headY: -1, head: -1, jaw: 1, eye: 1, pearl: 2, cast: 0.8, hFx: 14, hFy: -4, hBx: -14, hBy: -6, staff: -1.25, hairLift: 1.3, hairWild: 1, hairT: 3.4, clothT: 3.5, veil: 1, open: 1, ripple: 0.6 });
  // --- Zauber: Stab hoch, Perle lodert
  const ca1 = pose({ float: 3, lean: -0.05, hFx: 8, hFy: -6, staff: -1.6, hBx: -9, hBy: 4, open: 1, cast: 0.4, pearl: 1.5, hairLift: 0.5, hairT: 1, clothT: 1, veil: 0.3 });
  const ca2 = pose({ float: 5, lean: -0.14, hFx: 6, hFy: -12, staff: -1.66, hBx: -11, hBy: -4, open: 1, cast: 1, pearl: 2.2, jaw: 0.6, headY: -1, hairLift: 0.9, hairWild: 0.4, hairT: 2.2, clothT: 2.2, veil: 0.7 });
  // --- Dreizack-Schwung: ausholen über die hintere Schulter, dann Bogen nach vorn unten
  const sw1 = pose({ float: 2, lean: -0.1, wx: -1, hFx: 2, hFy: -8, staff: -2.4, hBx: -2, hBy: 8, hairLift: 0.4, hairT: 1, clothT: 1, pearl: 1.4 });
  const sw2 = pose({ float: 3, lean: -0.24, wx: -3, hFx: -5, hFy: -10, staff: -2.85, hBx: 3, hBy: 6, jaw: 0.4, hairLift: 0.6, hairT: 1.6, clothT: 1.6, pearl: 1.8, veil: 0.3 });
  const sl1 = pose({ float: 1, lean: 0.2, wx: 2, hFx: 14, hFy: -4, staff: -0.7, hBx: -10, hBy: 6, jaw: 1, hairLift: 1.1, hairWild: 0.6, hairT: 2.2, clothT: 2.4, trail: 0.5, veil: 0.5 });
  const sl2 = pose({ float: 0, lean: 0.38, wx: 4, hFx: 16, hFy: 10, staff: 0.55, hBx: -11, hBy: 5, jaw: 1, hairLift: 1.2, hairWild: 0.8, hairT: 2.8, clothT: 3, trail: 0.8, veil: 0.6 });
  const sl3 = pose({ float: 0, lean: 0.34, wx: 4, hFx: 13, hFy: 14, staff: 1.0, hBx: -9, hBy: 8, jaw: 0.4, hairLift: 0.7, hairWild: 0.3, hairT: 3.4, clothT: 3.6, trail: 0.5, veil: 0.3 });
  const sl4 = pose({ float: 1, lean: 0.14, wx: 2, hFx: 10, hFy: 12, staff: -0.6, hBx: -6, hBy: 12, hairLift: 0.3, hairT: 4.2, clothT: 4.4 });
  // --- Abtauchen / Auftauchen
  const dv1 = pose({ float: 6, lean: -0.1, hFx: 8, hFy: -2, staff: -1.5, hBx: -8, hBy: -2, open: 1, hairLift: 0.8, hairT: 1, clothT: 1, veil: 0.5, pearl: 1.5 });
  const dv2 = pose({ sink: 0.45, float: 0, lean: 0.1, hFx: 6, hFy: -8, staff: -1.58, hBx: -2, hBy: -8, hairLift: 1.3, hairWild: 0.5, hairT: 2, clothT: 2, splash: 0.5, ripple: 0.4, pearl: 1.5 });
  const dv3 = pose({ sink: 1, lean: 0.1, hFx: 6, hFy: -12, staff: -1.58, hBx: -2, hBy: -12, hairLift: 1.5, hairWild: 0.8, hairT: 3, clothT: 3, splash: 1, ripple: 1, pearl: 1 });
  const em0 = pose({ sink: 1, lean: -0.1, hFx: 6, hFy: -14, staff: -1.6, hBx: -6, hBy: -14, hairLift: 1.5, hairWild: 1, hairT: 0, clothT: 0, ripple: 0.2, pearl: 2, cast: 0.6, open: 1 });
  const em1 = pose({ sink: 0.35, float: 4, lean: -0.2, headY: -1, jaw: 1, hFx: 12, hFy: -10, staff: -1.4, hBx: -12, hBy: -8, hairLift: 1.4, hairWild: 1, hairT: 1, clothT: 1, splash: 0.6, ripple: 0.6, pearl: 2.2, cast: 1, open: 1, veil: 1 });
  const em2 = pose({ float: 7, lean: -0.12, jaw: 0.6, hFx: 13, hFy: 0, staff: -1.35, hBx: -13, hBy: 0, hairLift: 1.1, hairWild: 0.6, hairT: 2, clothT: 2, splash: 1, ripple: 1, pearl: 1.6, open: 1, veil: 0.8 });
  const em3 = pose({ float: 2, hairLift: 0.4, hairT: 3, clothT: 3, pearl: 1.2 });
  // --- Brüllen (Phasenwechsel)
  const ro1 = pose({ float: 4, lean: 0.15, head: 1, headY: 1, hFx: 7, hFy: 8, hBx: 0, hBy: 8, staff: -1.5, hairLift: 0.2, hairT: 0.5, clothT: 0.5, pearl: 0.8 });
  // --- Treffer
  const hurtP = pose({ float: 0, lean: -0.2, wx: -2, head: -1.5, jaw: 0.6, hFx: 7, hFy: 12, staff: -1.2, hBx: -8, hBy: 10, hairLift: 0.9, hairWild: 0.5, hairT: 1.5, clothT: 1.5, pearl: 2 });
  // --- Tod: aufbäumen, sinken, zerfließen
  const d1 = pose({ float: 5, lean: -0.3, headY: -1, head: -1, jaw: 1, hFx: 12, hFy: 0, hBx: -12, hBy: -2, staff: -1.1, hairLift: 1.2, hairWild: 1, hairT: 1, clothT: 1, pearl: 2.4, cast: 0.5, open: 1, veil: 1 });
  const d2 = pose({ float: 0, lean: 0.35, head: 2, headY: 2, jaw: 0.4, hFx: 10, hFy: 14, hBx: 0, hBy: 16, staff: -0.4, hairLift: 0.3, hairT: 2, clothT: 2, pearl: 1, eye: 0.6, melt: 0.2 });
  const d3 = pose({ float: -4, lean: 0.5, head: 2, headY: 3, hFx: 12, hFy: 18, hBx: 4, hBy: 18, staff: 0.1, hairLift: 0, hairT: 3, clothT: 3, pearl: 0.5, eye: 0.2, melt: 0.55, ripple: 0.4 });
  const d4 = pose({ float: -8, lean: 0.6, head: 2, headY: 3, hFx: 12, hFy: 20, hBx: 5, hBy: 20, staff: 0.1, hairLift: 0, hairT: 3.5, clothT: 3.5, pearl: 0.3, eye: 0, melt: 1, ripple: 0.9 });

  const sweepF = (a, b) => ({ smear: [a, b] });

  return {
    idle: new Animation(track(idleKeys, 8, { loop: true }), 6),
    walk: new Animation(track(walkKeys, 8, { loop: true }), 10),
    dormant: new Animation(track(dormKeys, 6, { loop: true }), 3),
    awaken: new Animation(track([
      [0, pray], [0.3, rise1], [0.6, rise2], [0.7, scream, snap], [1, { ...scream, hairT: 5.5, clothT: 5.5 }],
    ], 12, { extras: { 8: { fx: 'roar' } } }), 7.5, false),
    cast: new Animation(track([[0, pose({ float: 1 })], [0.45, ca1], [1, ca2]], 7, { extras: { 6: { fx: 'cast' } } }), 9, false),
    sweepWindup: new Animation(track([[0, pose({ float: 1 })], [0.45, sw1], [1, sw2]], 6, { extras: { 3: { staffBehind: true }, 4: { staffBehind: true }, 5: { staffBehind: true } } }), 9, false),
    sweep: new Animation(track([[0, sl1], [0.2, sl2, snap], [0.45, sl3], [1, sl4]], 7, {
      extras: { 0: sweepF(-2.8, -0.7), 1: { ...sweepF(-1.9, 0.55), fx: 'impact' }, 2: sweepF(-0.2, 1.0) },
    }), 16, false),
    dive: new Animation(track([[0, pose({ float: 1 })], [0.3, dv1], [0.65, dv2], [1, dv3]], 8), 10, false),
    emerge: new Animation(track([[0, em0], [0.25, em1, snap], [0.5, em2], [1, em3]], 8, { extras: { 2: { fx: 'impact' } } }), 12, false),
    roar: new Animation(track([[0, ro1], [0.28, scream, snap], [0.8, { ...scream, hairT: 5, clothT: 5 }], [1, { ...scream, hairT: 6, clothT: 6 }]], 9, { extras: { 2: { fx: 'roar' } } }), 7, false),
    hurt: new Animation(track([[0, hurtP], [1, pose({ float: 1, hairT: 2, clothT: 2 })]], 3), 12, false),
    death: new Animation([
      ...track([[0, hurtP], [0.25, d1], [0.55, d2], [0.8, d3], [1, d4]], 9, { extras: { 3: { fx: 'roar' }, 7: { fx: 'impact' } } }),
      remainsFrame(0), remainsFrame(0.35), remainsFrame(0.7), remainsFrame(1),
    ], 7, false),
  };
}
