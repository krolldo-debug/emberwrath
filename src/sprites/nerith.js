import { buildFrame, SpriteFrame, Animation, lazyFrame } from '../gfx/Sprite.js';
import { FineCanvas, fineRes, col32 } from '../gfx/Fine.js';
import { hash2 } from '../core/math.js';

// Nerith, die Ertrunkene Priesterin – Boss des Versunkenen Tempels.
// Gestalt „Tiefseepriesterin“: Quallenglocke als Kopfschmuck mit Nesselfäden, Robe in Tiefseeblau mit Perlmutt,
// Hirtenstab aus Treibholz, dessen Schnecke die Perle hält.
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
const SKIN = ['#1c1e2e', '#343850', '#565c78', '#8088a4', '#acb4cc', '#dadfec'];
const ROBE = ['#07081a', '#0f1434', '#192352', '#253571', '#354c92', '#4f6ab2'];
const GOLD = ['#262636', '#4c5068', '#7c86a2', '#b6c0d6', '#e8eef8'];   // Perlmutt
const HAIR = ['#04050c', '#090d1a', '#10172c', '#1a2440', '#273658', '#3b5078'];
const WATER = ['#0a192a', '#113352', '#1c5882', '#3886b2', '#76bcdc', '#c6eaf6'];
const JELLY = ['#141c3c', '#243466', '#3e5c96', '#6c94c4', '#a8d0ea', '#e4f6ff'];   // Quallenglocke
const BRONZE = ['#0b0c14', '#191b28', '#2a2d40', '#424760', '#666d8c'];   // Treibholz, dunkel
const ALGAE = ['#09150d', '#132719', '#203e25', '#315831', '#4a783f'];
const PEARL = ['#5e7e8e', '#a2c4ce', '#dcf2f2', '#ffffff'];
const GLOW = {
  tide: ['#063a48', '#0e7888', '#2ec8cc', '#a0fff0', '#ffffff'],
  flood: ['#0a1c5c', '#2050d0', '#60a8ff', '#c8e6ff', '#ffffff'],
};

// Gesicht (11 × 12), Ursprung (hcx − 3, hcy − 4). Siehe Kopf in drawNerith.
// 3/4 nach rechts, Licht von links oben: nahe Wange und Stirn hell (4/5), Seite hinter
// dem Nasenrücken im Schatten (2/3). b Brauen, k Augenhöhle, E/e Auge (Kern/Rand),
// m Mund, h/H Haar, o Kontur.
const NE_FACE = [
  'hH4555543o.',
  'hH45555432o',
  'h3bbbb5bb2o',
  'h4kEek5Ek2o',
  'h443345222o',
  'h454444522o',
  'h344444353o',
  'h34444311o.',
  'h2344mmm2o.',
  '.h3334432o.',
  '..ho3332o..',
  '....ooo....',
];

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
  put() {} px() {} dot() {} rect() {} line() {} fline() {}
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

// Zerfetzte Robenbahnen über dem Wasserleib, mit Goldsaum und Runen.
function skirt(p, g, glow, wx, wy, P) {
  const n = 8;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const x0 = wx - 7 + i * 2;
    const len = 13 + Math.sin(u * 7) * 2.5 - Math.abs(u - 0.45) * 5;
    const sh = u < 0.2 ? 4 : u < 0.5 ? 3 : u < 0.8 ? 2 : 1;
    const q = p.step, fine = p.fine;
    for (let s = 0; s < len; s += q) {
      // fein: halbe Zeilen, die Bahn folgt der Welle feiner; Falten zweifarbig (helle Kante links, Schatten rechts)
      const S = Math.floor(s), v = s / len;
      const x = x0 - P.trail * 7 * v * v + Math.sin(P.clothT * 1.2 + u * 2.2 + v * 3) * 1.2 * v + (u - 0.5) * 6 * v * P.veil;
      const y = wy + s;
      const wd = (s > len - 2 ? 2 : 3) + (fine ? 0.5 : 0); // Bahnen überlappen, Enden spitz (fein etwas breiter)
      p.rect(x, y, wd, q, ROBE[S === 2 ? Math.min(5, sh + 1) : s > len - 3 ? Math.max(1, sh - 1) : sh]);
      if (i % 2 === 1 && s > 3) {
        if (fine) p.rect(x + wd - 0.5, y, 0.5, q, ROBE[Math.max(0, sh - 1)]);
        else p.px(x + wd - 1, y, ROBE[Math.max(0, sh - 1)]); // Faltenschatten
      }
      if (fine && i % 2 === 0 && s > 3.5 && s < len - 1.5) p.rect(x, y, 0.5, q, ROBE[Math.min(5, sh + 1)]);
      if (S === 3) {
        p.rect(x, y, wd, q, GOLD[u < 0.4 ? 3 : 2]);
        if (fine) { if (s === S) { pt(p, x, y, GOLD[4]); pt(p, x + 0.5, y, GOLD[u < 0.4 ? 4 : 3]); } else p.rect(x + 1.5, y, wd - 1.5, q, GOLD[1]); }
      }
      if (S === 6 && s === S && i % 3 === 1) {
        p.px(x, y, ROBE[5]); g.px(x, y, glow[2]); g.px(x, y + 1, glow[1]);
        if (fine) { pt(p, x + 0.5, y + 0.5, ROBE[3]); pt(g, x, y, glow[3]); pt(p, x, y + 1, ROBE[4]); }
      }
    }
  }
}

// ---------------------------------------------------------------- Dreizack

function trident(p, g, glow, hx, hy, a, P) {
  // Hirtenstab: Treibholzschaft mit Perlmuttringen, oben eine Schnecke nach vorn, die Perle hängt in ihrer Mitte.
  const dx = Math.cos(a), dy = Math.sin(a);
  let nx = -dy, ny = dx;
  if (nx + ny > 0) { nx = -nx; ny = -ny; } // n zeigt zum Licht
  const mx = -nx, my = -ny;               // nach vorn
  const bx = hx - dx * 17, by = hy - dy * 17;
  const tx = hx + dx * 25, ty = hy + dy * 25;
  const fine = p.fine;
  limb(p, bx, by, tx, ty, 2.3, 2.1, [BRONZE[1], BRONZE[2], BRONZE[3], BRONZE[4]]);
  if (fine) {
    hair(p, hx + dx * -15 + nx * 0.6, hy + dy * -15 + ny * 0.6, hx + dx * 23 + nx * 0.6, hy + dy * 23 + ny * 0.6, BRONZE[4]);
    for (const s of [-9, 4, 15]) { pt(p, hx + dx * s, hy + dy * s, BRONZE[0]); pt(p, hx + dx * (s + 0.5) + nx * 0.5, hy + dy * (s + 0.5) + ny * 0.5, BRONZE[1]); }
  }
  p.px(bx - dx, by - dy, GOLD[2]); p.px(bx - dx * 2, by - dy * 2, GOLD[3]);
  for (const r of [-13, 9, 22]) {
    p.px(hx + dx * r + nx, hy + dy * r + ny, GOLD[4]);
    p.px(hx + dx * r, hy + dy * r, GOLD[3]);
    p.px(hx + dx * r - nx, hy + dy * r - ny, GOLD[1]);
    if (fine) { pt(p, hx + dx * r + nx * 1.2, hy + dy * r + ny * 1.2, '#ffffff'); pt(p, hx + dx * (r + 0.6), hy + dy * (r + 0.6), GOLD[1]); }
  }
  // Seetang um den Schaft
  for (let s = 11; s < 20; s += 1.5) p.px(hx + dx * s - nx * 0.5, hy + dy * s - ny * 0.5, ALGAE[3]);
  for (let s = 0; s < 6; s += 1) p.px(hx + dx * (15 - s * 0.2) - nx * (1.5 + s * 0.2), hy + dy * (15 - s * 0.2) - ny * (1.5 + s * 0.2) + s, ALGAE[s < 3 ? 2 : 1]);
  // Schnecke
  const R0 = 6.5, cx = tx + mx * R0, cy = ty + my * R0, T1 = Math.PI * 1.75;
  const at = (t) => { const r = R0 - t * 0.95; return [cx + r * (Math.cos(t) * -mx + Math.sin(t) * dx), cy + r * (Math.cos(t) * -my + Math.sin(t) * dy)]; };
  let [qx, qy] = at(0), top = { x: qx, y: qy, d: 1e9 };
  for (let t = 0.12; t <= T1 + 0.001; t += 0.12) {
    const [x, y] = at(t), w = 3.4 - t * 0.33;
    limb(p, qx, qy, x, y, w, w - 0.1, [GOLD[1], GOLD[2], GOLD[3], GOLD[4]]);
    if (fine && Math.round(t / 0.12) % 3 === 0) { const ox = (x - qx), oy = (y - qy), l = Math.hypot(ox, oy) || 1; hair(p, x - oy / l * w * 0.5, y + ox / l * w * 0.5, x + oy / l * w * 0.5, y - ox / l * w * 0.5, GOLD[1]); }
    const d = x * dx + y * dy; if (d < top.d) top = { x, y, d };
    qx = x; qy = y;
  }
  // Perle in der Schnecke
  const pr = 1.8 + P.pearl * 0.4 + P.cast * 0.8;
  const px = cx + dx * 0.6, py = cy + dy * 0.6;
  ell(p, px, py, pr, pr, PEARL[1]);
  ell(p, px - 0.4, py - 0.4, Math.max(0.6, pr - 0.8), Math.max(0.6, pr - 0.8), PEARL[2]);
  p.px(px - pr * 0.5, py - pr * 0.5, PEARL[3]);
  if (fine) { pt(p, px - pr * 0.5, py - pr * 0.5, '#ffffff'); pt(p, px + pr * 0.45, py + pr * 0.45, PEARL[0]); }
  const gr = pr + 0.8 + P.pearl * 0.6, q = p.step;
  ell(g, px, py, gr + 1.5, gr + 1.5, glow[0]);
  ell(g, px, py, gr + 0.5, gr + 0.5, glow[1]);
  ell(g, px, py, gr - 0.5, gr - 0.5, glow[2]);
  ell(g, px, py, Math.max(0.6, pr - 0.6), Math.max(0.6, pr - 0.6), glow[3]);
  g.px(px, py, glow[4]);
  if (fine) ell(g, px - 0.25, py - 0.25, Math.max(0.5, pr - 1.2), Math.max(0.5, pr - 1.2), glow[4]);
  if (P.cast > 0.25) {
    const r = 3 + P.cast * 7;
    for (let s = 2; s < r; s += q) {
      const c = s < r * 0.5 ? (fine && s < r * 0.3 ? glow[4] : glow[3]) : glow[2];
      pt(g, px + s, py, c); pt(g, px - s, py, c); pt(g, px, py + s * 0.8, c); pt(g, px, py - s * 1.2, c);
      if (s < r * 0.6) { pt(g, px + s * 0.6, py - s * 0.6, glow[1]); pt(g, px - s * 0.6, py - s * 0.6, glow[1]); pt(g, px + s * 0.6, py + s * 0.5, glow[1]); pt(g, px - s * 0.6, py + s * 0.5, glow[1]); }
    }
  }
  return { tipX: top.x, tipY: top.y, pearlX: px, pearlY: py };
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

// ---------------------------------------------------------------- Gesicht fein
// Veredelt die als 2×2-Zellen gestempelte Pixelkarte NE_FACE mit Feinpixeln: Augen mit Kern, Glanzpunkt und Lid,
// geschwungene Brauen, Nasenrücken-Licht und Nasenflügel, Lippen mit Mundwinkeln, Wangen- und Kinnlicht.
// X/Y = Feinpixel relativ zur Kartenecke (fx0, fy0 ganzzahlig).
const LIP = ['#3a2c40', '#5c4864', '#806c88', '#a493a8'];
function faceFine(p, g, fx0, fy0, lit, eye, jaw, glow) {
  const T = (X, Y, c) => p.dot(fx0 + (X + 0.5) / 2, fy0 + (Y + 0.5) / 2, c);
  const TG = (X, Y, c) => g.dot(fx0 + (X + 0.5) / 2, fy0 + (Y + 0.5) / 2, c);
  // Stirn und Wange: Lichtkanten
  T(6, 1, SKIN[5]); T(7, 1, SKIN[5]); T(8, 0, SKIN[5]);
  T(4, 9, SKIN[5]); T(5, 9, SKIN[5]); T(4, 10, SKIN[4]); T(3, 12, SKIN[3]);
  // Brauen: 1 Feinpixel stark, geschwungen (nahe Braue fällt zur Nase leicht ab), darüber Hautlicht
  for (const [X, Y, c] of [[4, 4, SKIN[4]], [4, 5, HAIR[1]], [5, 4, HAIR[1]], [5, 5, HAIR[2]], [6, 4, HAIR[1]], [7, 4, HAIR[1]], [8, 4, HAIR[1]],
    [6, 5, SKIN[3]], [7, 5, SKIN[3]], [8, 5, SKIN[3]], [9, 4, SKIN[4]], [9, 5, HAIR[1]], [10, 5, HAIR[1]], [10, 4, SKIN[5]], [11, 4, SKIN[5]], [11, 5, SKIN[3]],
    [14, 4, HAIR[1]], [15, 4, HAIR[1]], [16, 4, HAIR[1]], [14, 5, SKIN[3]], [15, 5, SKIN[2]], [16, 5, SKIN[2]], [17, 4, SKIN[2]]]) T(X, Y, c);
  // Augen
  if (lit) {
    // nah: Iris türkis, heller Kern, Glanzpunkt oben links, Pupille, Unterlid dunkel
    for (const [X, Y, c] of [[6, 6, NE_EYE[1]], [7, 6, '#ffffff'], [8, 6, NE_EYE[0]], [9, 6, NE_EYE[1]], [6, 7, NE_SOCKET], [7, 7, NE_EYE[0]], [8, 7, '#0e5a60'], [9, 7, NE_EYE[1]],
      [14, 6, '#ffffff'], [15, 6, NE_EYE[1]], [14, 7, NE_EYE[1]], [15, 7, NE_SOCKET]]) T(X, Y, c);
    for (const [X, Y, k] of [[7, 6, 4], [8, 6, 4], [7, 7, 3], [14, 6, 4], [9, 6, 2], [6, 6, 2]]) TG(X, Y, glow[k]);
    if (eye > 0.7) { TG(6, 9, glow[2]); TG(7, 10, glow[1]); }
  } else {
    // geschlossen: Lidstrich mit Wimpern
    for (const X of [6, 7, 8, 9]) T(X, 7, SKIN[0]);
    T(5, 7, SKIN[1]); T(10, 6, SKIN[1]); T(14, 7, SKIN[0]); T(15, 7, SKIN[0]); T(7, 6, SKIN[3]); T(8, 6, SKIN[3]);
  }
  // Nase: Nasenrücken-Licht als Feinlinie, Spitze hell, Nasenflügel dunkel
  for (const [X, Y] of [[12, 6], [12, 7], [12, 8], [13, 9], [13, 10], [14, 11]]) T(X, Y, SKIN[5]);
  T(13, 8, SKIN[4]); T(13, 6, SKIN[4]); T(15, 12, SKIN[5]); T(16, 12, SKIN[4]); T(14, 13, SKIN[2]); T(15, 14, SKIN[0]); T(16, 13, SKIN[3]);
  // Mund: Oberlippe dunkel, Mundspalt, Unterlippe mit Glanz, Mundwinkel
  if (!jaw) {
    for (const [X, Y, c] of [[11, 15, LIP[1]], [12, 15, LIP[1]], [13, 15, LIP[2]], [14, 15, LIP[1]],
      [10, 16, NE_MOUTH], [11, 16, NE_MOUTH], [12, 16, NE_MOUTH], [13, 16, NE_MOUTH], [14, 16, NE_MOUTH], [15, 16, LIP[0]],
      [10, 17, SKIN[2]], [11, 17, LIP[2]], [12, 17, LIP[3]], [13, 17, LIP[2]], [14, 17, LIP[1]], [15, 17, SKIN[2]], [9, 16, SKIN[2]]]) T(X, Y, c);
  } else {
    // offener Mund: Zahnreihe oben, Mundwinkel
    for (const X of [11, 12, 13, 14]) T(X, 16, X % 2 ? '#c6d6d2' : '#9fb4b2');
    T(10, 16, LIP[0]);
  }
  // Kinn: Licht unten links, Schatten am Kieferwinkel
  T(8, 19, SKIN[4]); T(9, 20, SKIN[4]); T(16, 18, SKIN[1]);
}

// ---------------------------------------------------------------- Figur

// Quallenglocke als Kopfschmuck: durchscheinende Kuppel mit Leuchtkanälen, gewellter Saum. (bx, by) = Mitte des Saums.
function jellyBell(p, g, glow, bx, by, P, flood) {
  const H = 8.5, Wd = 10, q = p.step, fine = p.fine;
  const pulse = Math.sin(P.hairT * 1.3) * 0.5;
  for (let y = by - H; y <= by + 0.01; y += q) {
    const t = (y - (by - H)) / H, w = (Wd + pulse) * Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
    for (let x = bx - w; x <= bx + w + 0.01; x += q) {
      const u = (x - bx) / (w || 1);
      let i = u < -0.7 ? 4 : u < -0.2 ? 3 : u < 0.55 ? 2 : 1;
      if (t < 0.18 && u < 0.3) i = Math.min(5, i + 1);
      if (Math.abs(u) > 0.9 || t < 0.06) i = u < 0 ? 5 : 1;    // Rand: Licht links, Schatten rechts
      pt(p, x, y, JELLY[i]);
      if (i >= 2 && i <= 3) pt(g, x, y, glow[0]);
    }
  }
  // Durchscheinend: der Kopf zeichnet sich in der Glocke ab
  ell(p, bx - 0.5, by - 2, 5, 3.6, JELLY[1]); ell(p, bx - 1.5, by - 3, 3, 2, JELLY[2]);
  // Leuchtkanäle vom Scheitel zum Saum
  for (const k of [-0.45, 0.35]) {
    let qx = bx, qy = by - H + 1;
    for (let t = 0.1; t <= 1.001; t += 0.1) {
      const y = by - H + 1 + (H - 1.5) * t, w = Wd * Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t))), x = bx + k * w;
      if (fine) hair(p, qx, qy, x, y, JELLY[k < 0 ? 4 : 3]); else ln(p, qx, qy, x, y, JELLY[3]);
      if (fine) hair(g, qx, qy, x, y, glow[t > 0.5 ? 2 : 1]); else g.px(x, y, glow[1]);
      qx = x; qy = y;
    }
  }
  // gewellter Saum mit Leuchtpunkten
  for (let x = bx - Wd - pulse; x <= bx + Wd + pulse; x += 1) {
    const k = Math.round(x - bx), dn = 1 + Math.sin(k * 1.4 + P.hairT * 2) * 1;
    ln(p, x, by, x, by + dn, JELLY[x < bx ? 4 : 2]);
    if (fine) pt(p, x, by + dn + 0.5, JELLY[x < bx ? 5 : 3]);
    if (k % 3 === 0) { g.px(x, by + dn, glow[flood ? 3 : 2]); if (fine) pt(p, x, by + dn, JELLY[5]); }
  }
  if (fine) {
    // Glanz auf der Kuppel
    hair(p, bx - 5, by - H + 3, bx - 3, by - H + 1.5, JELLY[5]); pt(p, bx - 5.5, by - H + 4, JELLY[5]);
    pt(p, bx - 1, by - H + 0.5, '#ffffff');
  }
}

// Nesselfäden: hängen vom hinteren Saum der Glocke und treiben wie das Haar nach hinten.
function jellyTendrils(p, g, glow, bx, by, P) {
  const fine = p.fine;
  for (let j = 0; j < 7; j++) {
    let x = bx - 7.5 + j * 1.6, y = by + 1;
    const L = 16 + hash2(j, 1, 131) * 14 - j * 1.2;
    const dir = Math.PI / 2 + 0.55 + P.hairLift * 0.9 - j * 0.06;
    for (let s = 0; s < L; s += 0.6) {
      const f = s / L, a = dir + Math.sin(P.hairT * 1.2 + s * 0.2 + j * 1.3) * (0.12 + 0.4 * f);
      x += Math.cos(a) * 0.6; y += Math.sin(a) * 0.6;
      pt(p, x, y, JELLY[f < 0.5 ? (j < 3 ? 4 : 3) : 2]);
      if (fine && j % 2 === 0) pt(p, x + 0.5, y, JELLY[1]);
      if (Math.floor(s / 0.6) % 13 === 6) pt(g, x, y, glow[f < 0.6 ? 2 : 1]);
    }
  }
}

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
    strand(p, g, glow, ox, oy, dir, L, 7 - u * 1.6, j, P, { u, shade: u < 0.3 ? 4 : u < 0.65 ? 3 : 2, sheen: j === 3 || j === 8 || j === 13, edge: cl < 0.2, glowy: flood ? 0.04 : 0.004 });
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

  jellyTendrils(p, g, glow, hcx - 0.5, hcy - 3.5, P);

  // --- 2. Hinterer Arm (dunkler)
  const skinD = [SKIN[0], SKIN[1], SKIN[2], SKIN[3]];
  limb(p, shB.x, shB.y, armB.jx, armB.jy, 3.5, 3, [ROBE[0], ROBE[1], ROBE[1], ROBE[2]]);
  limb(p, armB.jx, armB.jy, armB.ex, armB.ey, 2.5, 2, skinD);
  // Hand: offen beim Zaubern, sonst geschlossen
  p.rect(armB.ex - 1, armB.ey - 1, 3, 2, SKIN[2]);
  if (P.open > 0.3) {
    for (let k = -1; k <= 1; k++) ln(p, armB.ex + k, armB.ey - 1, armB.ex + k * 1.6, armB.ey - 3.5, SKIN[3]);
    p.px(armB.ex + 2, armB.ey, SKIN[3]);
    if (fine) for (let k = -1; k <= 1; k++) pt(p, armB.ex + k * 1.6, armB.ey - 3.5, SKIN[4]);
  }
  meta.cast = { x: armB.ex, y: armB.ey - 3 };
  // zerfetzter Ärmel am hinteren Ellbogen
  for (let i = 0; i < 3; i++) {
    const L = 5 + i * 1.5;
    for (let s = 0; s < L; s += q) {
      const x = armB.jx - 1 + i - P.trail * 2 * s / L + Math.sin(P.clothT + i + s * 0.4) * 0.7;
      if (fine) { pt(p, x, armB.jy + 1 + s, ROBE[i === 0 ? 3 : 2]); pt(p, x + 0.5, armB.jy + 1 + s, ROBE[i === 0 ? 2 : 1]); }
      else p.px(x, armB.jy + 1 + s, ROBE[i === 0 ? 2 : 1]);
    }
  }

  // --- 3. Unterleib aus Wasser, Robenbahnen
  veils(p, g, glow, wx, wy, P, flood);
  skirt(p, g, glow, wx, wy, P);

  // --- 4. Rumpf in Robe
  const grow = (1 - q) / 2;
  for (let s = -1; s <= SPINE + 0.5; s += 0.5 * q) {
    const f = Math.max(0, s) / SPINE;
    const hw = 4.6 + f * 2 + (f > 0.78 ? 0.8 : 0) - (f > 0.95 ? 1.8 : 0) + grow + (fine ? 0.4 : 0);
    const cx = wx + sl * s, cy = wy - cl * s;
    for (let k = -hw; k <= hw + 0.01; k += 0.5 * q) {
      const e = (k + hw) / (2 * hw);
      let c = e < 0.14 ? ROBE[4] : e < 0.4 ? ROBE[3] : e < 0.78 ? ROBE[2] : ROBE[1];
      // Falten (fein zweifarbig: dunkle Faltenlinie 1 Feinpixel, helle Kante zum Licht daneben)
      const d1 = k - 1.5 - Math.sin(P.clothT + s * 0.3) * 0.4, d2 = k + 2.5;
      if (f < 0.55 && Math.abs(d1) < 0.3 * q) c = ROBE[1];
      else if (fine && f < 0.55 && d1 < 0 && d1 > -0.4) c = ROBE[4];
      if (f < 0.5 && Math.abs(d2) < 0.3 * q) c = ROBE[2];
      else if (fine && f < 0.5 && d2 < 0 && d2 > -0.4) c = ROBE[4];
      pt(p, cx + fx * k, cy + fy * k, c);
    }
  }
  // Ausschnitt: fahle Haut, Schlüsselbein
  const vx = nx + fx * 1.5, vy = ny + 1;
  for (let r = 0; r < 6; r += q) {
    const hw = (6 - r) * 0.55 + grow;
    for (let k = -hw; k <= hw; k += 0.5 * q) pt(p, vx + fx * k + sl * -r, vy + fy * k + cl * r, r < 2 ? SKIN[4] : SKIN[3]);
  }
  p.px(vx - 2, vy + 1, SKIN[5]); p.px(vx + 1, vy + 2, SKIN[2]);
  if (fine) {
    // Schlüsselbeine als feine Lichtkanten, Brustbein-Schatten
    hair(p, vx - 2.5, vy + 0.5, vx - 0.5, vy + 1, SKIN[5]); hair(p, vx + 0.5, vy + 1, vx + 2, vy + 0.5, SKIN[4]);
    hair(p, vx, vy + 2, vx, vy + 3.5, SKIN[2]);
  }
  // Goldsaum am Ausschnitt
  for (let r = 0; r < 7; r += q) {
    const hw = (6 - r) * 0.55 + 0.8;
    pt(p, vx - fx * hw + sl * -r, vy - fy * hw + cl * r, GOLD[3]);
    pt(p, vx + fx * hw + sl * -r, vy + fy * hw + cl * r, GOLD[2]);
    if (fine) { pt(p, vx - fx * (hw - 0.5) + sl * -r, vy - fy * (hw - 0.5) + cl * r, r < 2 ? GOLD[4] : GOLD[3]); pt(p, vx + fx * (hw + 0.5) + sl * -r, vy + fy * (hw + 0.5) + cl * r, GOLD[1]); }
  }
  // Schärpe (hintere Schulter -> vordere Hüfte)
  for (let t = 0; t <= 1; t += 0.04 * q) {
    const x = (shB.x + 1) + (wx + 5 - shB.x - 1) * t, y = shB.y + 2 + (wy - 1 - shB.y - 2) * t;
    if (fine) {
      // Schärpe: Glanzlinie oben, Mittelton, dunkle Unterkante – je 1 Feinpixel
      pt(p, x, y, t > 0.08 && t < 0.3 ? GOLD[4] : GOLD[3]); pt(p, x, y + 0.5, GOLD[t < 0.3 ? 3 : 2]);
      pt(p, x + 0.5, y + 1, GOLD[2]); pt(p, x + 0.5, y + 1.5, GOLD[0]);
    } else { p.px(x, y, GOLD[t < 0.3 ? 3 : 2]); p.px(x + 0.5, y + 1, GOLD[1]); }
  }
  // Gürtel mit Muschel-Medaillon
  for (let k = -5.5; k <= 5.5; k += 0.5 * q) {
    pt(p, wx + fx * k, wy - 1 + fy * k, k < -3 ? GOLD[3] : k > 3 ? GOLD[1] : GOLD[2]);
    pt(p, wx + fx * k, wy + fy * k, GOLD[1]);
    if (fine) { pt(p, wx + fx * k, wy - 1 + fy * k, k < -3.5 ? GOLD[4] : k > 3 ? GOLD[2] : GOLD[3]); pt(p, wx + fx * k, wy - 0.5 + fy * k, k > 3 ? GOLD[1] : GOLD[2]); pt(p, wx + fx * k, wy + 0.5 + fy * k, GOLD[0]); }
  }
  ell(p, wx + fx * 1.5, wy + 1, 1.5, 1.5, GOLD[3]); p.px(wx + fx * 1.5 - 0.5, wy + 0.5, GOLD[4]);
  if (fine) {
    // Muschel-Medaillon: Rippen strahlenförmig, Glanzpunkt
    const mx = wx + fx * 1.5, my = wy + 1;
    for (const a of [-2.4, -1.57, -0.7]) hair(p, mx + Math.cos(a) * 0.4, my + 1 + Math.sin(a) * 0.4, mx + Math.cos(a) * 1.6, my + 1 + Math.sin(a) * 1.8, GOLD[1]);
    pt(p, mx - 0.5, my - 0.5, '#fff4c8'); pt(p, mx + 1, my + 1, GOLD[0]);
  }
  p.px(wx + fx * 1.5, wy + 3, PEARL[2]); g.px(wx + fx * 1.5, wy + 3, glow[2]);
  if (fine) { pt(p, wx + fx * 1.5, wy + 3, '#ffffff'); pt(p, wx + fx * 1.5 + 0.5, wy + 3.5, PEARL[0]); pt(g, wx + fx * 1.5, wy + 3, glow[4]); }
  // Runen auf der Robe
  const runes = [[-2, 4], [2, 7], [-1, 10]];
  for (const [k, s] of runes) {
    const x = wx + sl * s + fx * k, y = wy - cl * s + fy * k;
    if (fine) {
      // Rune als feine Glyphe: heller Kern, farbiger Saum (Grundbild und Leuchtebene)
      hair(p, x, y - 0.5, x, y + 1.5, ROBE[4]); hair(p, x + 0.5, y - 0.5, x + 1.5, y - 1, ROBE[4]); pt(p, x, y, ROBE[5]); pt(p, x - 0.5, y + 1, ROBE[4]);
      hair(g, x, y - 0.5, x, y + 1.5, glow[1]); hair(g, x + 0.5, y - 0.5, x + 1.5, y - 1, glow[flood ? 2 : 1]); pt(g, x, y, glow[3]); pt(g, x, y + 0.5, glow[2]);
      continue;
    }
    p.px(x, y, ROBE[5]); p.px(x, y + 1, ROBE[4]); p.px(x + 1, y - 1, ROBE[4]);
    g.px(x, y, glow[2]); g.px(x, y + 1, glow[1]); g.px(x + 1, y - 1, glow[flood ? 2 : 1]);
  }
  meta.chest = { x: wx + sl * 10, y: wy - cl * 10 };

  // --- 5. Kopf: fahles Gesicht, nasses Haar, Korallenkrone
  // Hals
  p.rect(hcx - 1, hcy + 3, 3, 4, SKIN[3]); p.px(hcx - 1, hcy + 4, SKIN[4]); p.px(hcx + 1, hcy + 5, SKIN[2]);
  // Hinterkopf (Haar)
  ell(p, hcx - 2, hcy - 0.5, 4.5, 5, HAIR[2]);
  ell(p, hcx - 2.5, hcy - 2, 3.2, 3, HAIR[3]);
  p.px(hcx - 4, hcy - 3, HAIR[4]); p.px(hcx - 3, hcy - 4, HAIR[4]); p.px(hcx - 5, hcy - 1, HAIR[4]);
  if (fine) {
    // Nasses Haar am Hinterkopf: gebogene Strähnen (hell/dunkel im Wechsel), Glanzpunkte auf der Wölbung
    for (let i = 0; i < 6; i++) {
      const x0 = hcx - 1.5 - i * 0.8, y0 = hcy - 4.8 + i * 0.35, x1 = hcx - 4.5 - i * 0.45, y1 = hcy + 1.5 + i * 0.6;
      hair(p, x0, y0, (x0 + x1) / 2 - 0.8, (y0 + y1) / 2, i % 2 ? HAIR[1] : HAIR[4]);
      hair(p, (x0 + x1) / 2 - 0.8, (y0 + y1) / 2, x1, y1, i % 2 ? HAIR[1] : HAIR[3]);
    }
    pt(p, hcx - 3.5, hcy - 3.5, HAIR[5]); pt(p, hcx - 3, hcy - 4, HAIR[5]); pt(p, hcx - 5, hcy - 1.5, HAIR[5]);
  }
  // Gesicht als Pixelkarte (3/4 nach rechts): flache Töne, helle nahe Gesichtshälfte vor
  // dunklem Haar, Schattenseite hinter dem Nasenrücken, dunkle Brauen über leuchtend
  // türkisen Augen in dunklen Höhlen, Nasenrücken und -spitze, Mund, Kinn.
  const lit = P.eye > 0.15;
  const FC = {
    o: SKIN[0], 1: SKIN[1], 2: SKIN[2], 3: SKIN[3], 4: SKIN[4], 5: SKIN[5], h: HAIR[2], H: HAIR[3],
    b: HAIR[1], k: NE_SOCKET, m: NE_MOUTH,
    E: lit ? NE_EYE[0] : SKIN[2], e: lit ? NE_EYE[1] : SKIN[1],
  };
  const fx0 = hcx - 3, fy0 = hcy - 4;
  for (let r = 0; r < NE_FACE.length; r++) for (let c = 0; c < NE_FACE[r].length; c++) {
    const ch = NE_FACE[r][c];
    if (ch !== '.') p.px(fx0 + c, fy0 + r, FC[ch]);
  }
  // Augen: nahes Auge (2 px) und fernes Auge (1 px) in Zeile 3
  const ey = fy0 + 3;
  if (lit) {
    g.px(fx0 + 3, ey, glow[4]); g.px(fx0 + 4, ey, glow[4]); g.px(fx0 + 7, ey, glow[4]);
    if (P.eye > 0.7) {
      g.px(fx0 + 2, ey, glow[1]); g.px(fx0 + 5, ey, glow[1]); g.px(fx0 + 8, ey, glow[1]);
      // Leuchtende Tränenspur (Wasser) unter dem nahen Auge
      g.px(fx0 + 3, ey + 2, glow[1]); g.px(fx0 + 3, ey + 3, glow[1]); if (flood) g.px(fx0 + 3, ey + 4, glow[1]);
    }
  }
  meta.eye = { x: fx0 + 4, y: ey };
  // Mund: öffnet sich nach unten, Unterlippe wandert mit
  const jaw = Math.round(P.jaw * 2.4);
  if (jaw) {
    p.rect(fx0 + 5, fy0 + 8, 3, jaw + 1, NE_MOUTH);
    p.rect(fx0 + 5, fy0 + 9 + jaw, 3, 1, SKIN[4]); p.px(fx0 + 7, fy0 + 9 + jaw, SKIN[3]);
    p.rect(fx0 + 4, fy0 + 10 + jaw, 4, 1, SKIN[3]); p.px(fx0 + 8, fy0 + 9 + jaw, SKIN[0]); p.rect(fx0 + 4, fy0 + 11 + jaw, 4, 1, SKIN[0]);
  }
  if (fine) faceFine(p, g, fx0, fy0, lit, P.eye, jaw, glow);
  // Scheitel und nasse Strähne hinter der Schläfe (verdeckt das Gesicht nicht)
  p.rect(hcx - 3, hcy - 5, 6, 1, HAIR[4]); p.rect(hcx - 4, hcy - 4, 2, 1, HAIR[3]); p.px(hcx + 3, hcy - 4, HAIR[3]);
  ln(p, hcx - 3, hcy - 2, hcx - 3, hcy + 5, HAIR[2]); p.px(hcx - 3, hcy + 6, HAIR[3]);
  if (fine) {
    // Scheitel mit Glanzlinie, nasse Strähne mit heller Kante
    hair(p, hcx - 2.5, hcy - 5, hcx + 1, hcy - 5, HAIR[5]); pt(p, hcx - 1, hcy - 4.5, HAIR[2]); pt(p, hcx + 1.5, hcy - 4.5, HAIR[2]);
    hair(p, hcx - 3, hcy - 2, hcx - 3, hcy + 4, HAIR[3]); pt(p, hcx - 3, hcy - 1, HAIR[5]); pt(p, hcx - 2.5, hcy + 5.5, HAIR[1]);
  }
  jellyBell(p, g, glow, hcx - 0.5, hcy - 3.5, P, flood);
  meta.head = { x: hcx, y: hcy - 13 };
  meta.mouth = { x: hcx + 3, y: hcy + 4 };

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
    limb(p, shF.x, shF.y, armF.jx, armF.jy, 4, 3.5, [ROBE[1], ROBE[2], ROBE[3], ROBE[4]]);
    // Ärmelfetzen
    for (let i = 0; i < 3; i++) {
      const L = 4 + i * 2 + (i === 1 ? 1 : 0);
      for (let s = 0; s < L; s += q) {
        const x = armF.jx - 1 + i * 1.2 - P.trail * 2 * s / L + Math.sin(P.clothT * 1.3 + i + s * 0.5) * 0.8;
        if (fine) { pt(p, x, armF.jy + 1 + s, ROBE[i === 0 ? 4 : 3]); pt(p, x + 0.5, armF.jy + 1 + s, ROBE[i === 0 ? 3 : 1]); }
        else p.px(x, armF.jy + 1 + s, ROBE[i === 0 ? 3 : 2]);
      }
      p.px(armF.jx - 1 + i * 1.2, armF.jy + 1, GOLD[2]);
    }
    limb(p, armF.jx, armF.jy, armF.ex, armF.ey, 3, 2.5, [SKIN[2], SKIN[3], SKIN[4], SKIN[5]]);
    // Goldsaum am Ärmel, Muschelspange an der Schulter
    p.px(armF.jx - 2, armF.jy + 1, GOLD[3]); p.px(armF.jx + 1, armF.jy + 2, GOLD[2]);
    ell(p, shF.x, shF.y - 1, 2.5, 1.8, GOLD[2]); p.px(shF.x - 1, shF.y - 2, GOLD[4]); p.px(shF.x + 1, shF.y, GOLD[1]);
    p.px(shF.x, shF.y - 1, PEARL[2]);
    // Armreif
    const bx = armF.jx + (armF.ex - armF.jx) * 0.7, by = armF.jy + (armF.ey - armF.jy) * 0.7;
    p.rect(bx - 1, by - 1, 3, 2, GOLD[2]); p.px(bx - 1, by - 1, GOLD[4]);
    if (fine) {
      // Muschelspange mit Rippen und Perlglanz, Armreif mit Glanzlinie, Unterarm-Licht
      hair(p, shF.x - 2, shF.y - 1, shF.x + 0.5, shF.y - 2.5, GOLD[3]); hair(p, shF.x - 1, shF.y, shF.x + 1, shF.y - 1.5, GOLD[1]);
      pt(p, shF.x, shF.y - 1, '#ffffff'); pt(p, shF.x + 0.5, shF.y - 0.5, PEARL[0]);
      hair(p, bx - 1, by - 1, bx + 1.5, by - 1, GOLD[4]); pt(p, bx - 1, by - 1, '#fff4c8'); hair(p, bx - 1, by + 0.5, bx + 1.5, by + 0.5, GOLD[0]);
      hair(p, armF.jx + (armF.ex - armF.jx) * 0.15 - 0.8, armF.jy + (armF.ey - armF.jy) * 0.15, bx - 1.5, by - 1, SKIN[5]);
    }
  };
  let tri;
  if (ex.staffBehind) { tri = trident(p, g, glow, hF.x, hF.y, P.staff, P); drawArm(); }
  else { drawArm(); tri = trident(p, g, glow, hF.x, hF.y, P.staff, P); }
  // Hand umgreift den Schaft
  p.rect(hF.x - 1, hF.y - 1, 3, 3, SKIN[3]); p.px(hF.x - 1, hF.y - 1, SKIN[5]); p.px(hF.x + 1, hF.y + 1, SKIN[2]);
  if (fine) { for (let k = 0; k < 3; k++) pt(p, hF.x - 1 + k, hF.y - 1, k % 2 ? SKIN[4] : SKIN[5]); hair(p, hF.x - 0.5, hF.y + 0.5, hF.x + 1.5, hF.y + 0.5, SKIN[2]); pt(p, hF.x - 1, hF.y - 1, '#eef8f6'); }
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
  // Hirtenstab quer, Schnecke am Ende
  const tx = cx - 26, ty = gy - 5;
  limb(p, tx, ty, tx + 40, ty - 2, 2, 2, [BRONZE[1], BRONZE[2], BRONZE[3], BRONZE[4]]);
  for (let t = 0; t < Math.PI * 1.6; t += 0.15) {
    const r = 4.5 - t * 0.7, x = tx + 44 + Math.cos(t + Math.PI) * r, y = ty - 2 - Math.sin(t + Math.PI) * r * -1 - 4;
    ell(p, x, y, 1.1, 1.1, GOLD[t < 2 ? 3 : 2]);
  }
  // Perle erlischt
  ell(p, tx + 42, ty - 2, 1.8, 1.8, PEARL[1]); p.px(tx + 41, ty - 3, PEARL[3]);
  if (p.fine) { pt(p, tx + 41, ty - 3, '#ffffff'); pt(p, tx + 42.5, ty - 1.5, PEARL[0]); hair(p, tx + 2, ty - 0.5, tx + 40, ty - 2.3, BRONZE[4]); }
  if (k < 0.9) {
    const r = 3 * (1 - k);
    ell(g, tx + 42, ty - 2, r + 1, r + 1, glow[k > 0.5 ? 0 : 1]);
    ell(g, tx + 42, ty - 2, Math.max(0.6, r * 0.6), Math.max(0.6, r * 0.6), glow[k > 0.5 ? 1 : 2]);
  }
  // Quallenglocke sinkt in sich zusammen
  const kx = cx - 36 - k * 3;
  ell(p, kx, gy - 3, 6, 2.5 * (1 - k * 0.5) + 0.5, JELLY[2]); ell(p, kx - 1.5, gy - 3.5, 3, 1.2, JELLY[4]);
  for (let i = 0; i < 4; i++) ln(p, kx - 4 + i * 2.5, gy - 2, kx - 6 + i * 2.5, gy, JELLY[3]);
  if (k < 0.7) g.px(kx, gy - 3, glow[1]);
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
