import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame, SpriteFrame, Animation } from '../gfx/Sprite.js';
import { hash2 } from '../core/math.js';

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

// Dickes Glied mit Licht von links oben (ramp: 4 Stufen dunkel -> hell)
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
    for (let s = 0; s < L; s += 0.5) {
      const v = s / L;
      const curl = tent ? Math.pow(v, 3) * (2.2 + Math.sin(P.clothT + j) * 0.6) * (j === 8 ? 1 : -1) : 0;
      let x = x0 - P.trail * 12 * v * v + Math.sin(P.clothT + u * 2.4 + v * 3.5) * 2.6 * v + (u - 0.5) * 10 * v * P.veil;
      let y = wy + 2 + s;
      if (curl) { x += Math.sin(curl) * 3 * v; y -= (1 - Math.cos(curl)) * 2 * v; }
      // Spitzen laufen spitz zu statt zu zerfasern
      const hw = w0 * (1 - v * v * 0.88) / 2;
      for (let k = -hw; k <= hw + 0.01; k += 0.5) {
        // Licht über die ganze Breite des Wasserleibs (links hell), unten heller Schaum
        const gx = u + (k / 14);
        let i = gx < 0.18 ? 4 : gx < 0.45 ? 3 : gx < 0.78 ? 2 : 1;
        if (v > 0.8) i = Math.min(5, i + 1);
        if (k > hw - 0.6 && j % 3 === 2) i = Math.max(1, i - 1); // Faltenkante
        let c = WATER[i];
        if (v < 0.16) c = ROBE[gx < 0.3 ? 4 : gx < 0.7 ? 3 : 2];
        else if (tent) c = k * 2 < -hw ? WATER[4] : k > hw - 0.6 ? ROBE[1] : WATER[2];
        p.px(x + k, y, c);
      }
      if (tent && Math.floor(s) % 4 === 2 && v > 0.25 && v < 0.85) p.px(x + hw * 0.3, y, WATER[5]); // Saugnäpfe
      // Wasserglitzern (nur Leucht-Ebene)
      if (hash2(j * 7 + Math.floor(s), Math.floor(P.clothT * 3), 53) < (flood ? 0.05 : 0.025)) g.px(x - hw * 0.4, y, glow[v > 0.7 ? 3 : 2]);
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
    for (let s = 0; s < len; s++) {
      const v = s / len;
      const x = x0 - P.trail * 7 * v * v + Math.sin(P.clothT * 1.2 + u * 2.2 + v * 3) * 1.2 * v + (u - 0.5) * 6 * v * P.veil;
      const y = wy + s;
      const wd = s > len - 2 ? 2 : 3; // Bahnen überlappen, Enden spitz
      p.rect(x, y, wd, 1, ROBE[s === 2 ? Math.min(5, sh + 1) : s > len - 3 ? Math.max(1, sh - 1) : sh]);
      if (i % 2 === 1 && s > 3) p.px(x + wd - 1, y, ROBE[Math.max(0, sh - 1)]); // Faltenschatten
      if (s === 3) { p.rect(x, y, wd, 1, GOLD[u < 0.4 ? 3 : 2]); }
      if (s === 6 && i % 3 === 1) { p.px(x, y, ROBE[5]); g.px(x, y, glow[2]); g.px(x, y + 1, glow[1]); }
    }
  }
}

// ---------------------------------------------------------------- Dreizack

function trident(p, g, glow, hx, hy, a, P) {
  const dx = Math.cos(a), dy = Math.sin(a);
  let nx = -dy, ny = dx;
  if (nx + ny > 0) { nx = -nx; ny = -ny; } // n zeigt zum Licht
  const bx = hx - dx * 17, by = hy - dy * 17;
  const tx = hx + dx * 29, ty = hy + dy * 29;
  limb(p, bx, by, tx, ty, 2, 2, [BRONZE[1], BRONZE[2], BRONZE[3], BRONZE[4]]);
  // Schaftspitze und Ringe
  p.px(bx - dx, by - dy, GOLD[2]); p.px(bx - dx * 2, by - dy * 2, GOLD[3]);
  for (const r of [-13, 9, 25]) {
    p.px(hx + dx * r + nx, hy + dy * r + ny, GOLD[4]);
    p.px(hx + dx * r, hy + dy * r, GOLD[3]);
    p.px(hx + dx * r - nx, hy + dy * r - ny, GOLD[1]);
  }
  // Wickelband mit Algen am Schaft
  for (let s = 12; s < 22; s += 2) p.px(hx + dx * s - nx * 0.5, hy + dy * s - ny * 0.5, ALGAE[3]);
  p.px(hx + dx * 17 - nx * 2, hy + dy * 17 - ny * 2 + 1, ALGAE[2]); p.px(hx + dx * 17 - nx * 2, hy + dy * 17 - ny * 2 + 2, ALGAE[1]);
  // Querbalken, leicht nach vorn gebogen
  for (let k = -6.5; k <= 6.5; k += 0.5) {
    const bend = k * k * 0.05;
    const x = tx + nx * k + dx * bend, y = ty + ny * k + dy * bend;
    p.px(x, y, k > 4 ? GOLD[4] : k < -4 ? GOLD[1] : GOLD[2]);
    p.px(x - dx, y - dy, k > 0 ? GOLD[2] : GOLD[1]);
  }
  // Zinken
  const prong = (k, len, w) => {
    const bend = k * k * 0.05;
    const x0 = tx + nx * k + dx * bend, y0 = ty + ny * k + dy * bend;
    const inward = -Math.sign(k) * 0.12;
    const ex = x0 + dx * len + nx * len * inward, ey = y0 + dy * len + ny * len * inward;
    limb(p, x0, y0, ex, ey, w, 1, [GOLD[1], GOLD[2], GOLD[3], GOLD[4]]);
    // Widerhaken
    p.px(ex - dx * 2 + nx * Math.sign(k || 1) * 1.5, ey - dy * 2 + ny * Math.sign(k || 1) * 1.5, GOLD[3]);
    p.px(ex + dx * 0.6, ey + dy * 0.6, GOLD[4]);
    return { x: ex, y: ey };
  };
  prong(-6, 8, 2); prong(6, 8, 2);
  const tip = prong(0, 13, 2.5);
  // Perle in der Gabel
  const pr = 1.8 + P.pearl * 0.4 + P.cast * 0.8;
  const px = tx + dx * 2.5, py = ty + dy * 2.5;
  p.ellipse(px, py, pr, pr, PEARL[1]);
  p.ellipse(px - 0.4, py - 0.4, Math.max(0.6, pr - 0.8), Math.max(0.6, pr - 0.8), PEARL[2]);
  p.px(px - pr * 0.5, py - pr * 0.5, PEARL[3]);
  const gr = pr + 0.8 + P.pearl * 0.6;
  g.ellipse(px, py, gr + 1.5, gr + 1.5, glow[0]);
  g.ellipse(px, py, gr + 0.5, gr + 0.5, glow[1]);
  g.ellipse(px, py, gr - 0.5, gr - 0.5, glow[2]);
  g.ellipse(px, py, Math.max(0.6, pr - 0.6), Math.max(0.6, pr - 0.6), glow[3]);
  g.px(px, py, glow[4]);
  if (P.cast > 0.25) {
    // Lodern: Strahlenstern
    const r = 3 + P.cast * 7;
    for (let s = 2; s < r; s++) {
      const c = s < r * 0.5 ? glow[3] : glow[2];
      g.px(px + s, py, c); g.px(px - s, py, c); g.px(px, py + s * 0.8, c); g.px(px, py - s * 1.2, c);
      if (s < r * 0.6) { g.px(px + s * 0.6, py - s * 0.6, glow[1]); g.px(px - s * 0.6, py - s * 0.6, glow[1]); g.px(px + s * 0.6, py + s * 0.5, glow[1]); g.px(px - s * 0.6, py + s * 0.5, glow[1]); }
    }
  }
  return { tipX: tip.x, tipY: tip.y, pearlX: px, pearlY: py };
}

// Schwung-Schleier: Gischtbogen hinter dem Dreizack.
function smear(p, g, cx, cy, a0, a1, r0, r1, glow) {
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
    const dens = fresh * fresh * 0.35 + band * (0.25 + 0.75 * fresh);
    if (hash2(x + 99, y + 99, 13) > dens) continue;
    const c = radial > 0.86 ? WATER[5] : radial > 0.7 ? WATER[4] : fresh > 0.7 ? WATER[3] : WATER[2];
    p.px(cx + x, cy + y, c);
    if (fresh > 0.45 && radial > 0.55) g.px(cx + x, cy + y, radial > 0.85 ? glow[3] : glow[1]);
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

  // --- 2. Hinterer Arm (dunkler)
  const skinD = [SKIN[0], SKIN[1], SKIN[2], SKIN[3]];
  limb(p, shB.x, shB.y, armB.jx, armB.jy, 3.5, 3, [ROBE[0], ROBE[1], ROBE[1], ROBE[2]]);
  limb(p, armB.jx, armB.jy, armB.ex, armB.ey, 2.5, 2, skinD);
  // Hand: offen beim Zaubern, sonst geschlossen
  p.rect(armB.ex - 1, armB.ey - 1, 3, 2, SKIN[2]);
  if (P.open > 0.3) {
    for (let k = -1; k <= 1; k++) p.line(armB.ex + k, armB.ey - 1, armB.ex + k * 1.6, armB.ey - 3.5, SKIN[3]);
    p.px(armB.ex + 2, armB.ey, SKIN[3]);
  }
  meta.cast = { x: armB.ex, y: armB.ey - 3 };
  // zerfetzter Ärmel am hinteren Ellbogen
  for (let i = 0; i < 3; i++) {
    const L = 5 + i * 1.5;
    for (let s = 0; s < L; s++) p.px(armB.jx - 1 + i - P.trail * 2 * s / L + Math.sin(P.clothT + i + s * 0.4) * 0.7, armB.jy + 1 + s, ROBE[i === 0 ? 2 : 1]);
  }

  // --- 3. Unterleib aus Wasser, Robenbahnen
  veils(p, g, glow, wx, wy, P, flood);
  skirt(p, g, glow, wx, wy, P);

  // --- 4. Rumpf in Robe
  for (let s = -1; s <= SPINE + 0.5; s += 0.5) {
    const f = Math.max(0, s) / SPINE;
    const hw = 4.6 + f * 2 + (f > 0.78 ? 0.8 : 0) - (f > 0.95 ? 1.8 : 0);
    const cx = wx + sl * s, cy = wy - cl * s;
    for (let k = -hw; k <= hw + 0.01; k += 0.5) {
      const e = (k + hw) / (2 * hw);
      let c = e < 0.14 ? ROBE[4] : e < 0.4 ? ROBE[3] : e < 0.78 ? ROBE[2] : ROBE[1];
      // Falten
      if (f < 0.55 && Math.abs(k - 1.5 - Math.sin(P.clothT + s * 0.3) * 0.4) < 0.3) c = ROBE[1];
      if (f < 0.5 && Math.abs(k + 2.5) < 0.3) c = ROBE[2];
      p.px(cx + fx * k, cy + fy * k, c);
    }
  }
  // Ausschnitt: fahle Haut, Schlüsselbein
  const vx = nx + fx * 1.5, vy = ny + 1;
  for (let r = 0; r < 6; r++) {
    const hw = (6 - r) * 0.55;
    for (let k = -hw; k <= hw; k += 0.5) p.px(vx + fx * k + sl * -r, vy + fy * k + cl * r, r < 2 ? SKIN[4] : SKIN[3]);
  }
  p.px(vx - 2, vy + 1, SKIN[5]); p.px(vx + 1, vy + 2, SKIN[2]);
  // Goldsaum am Ausschnitt
  for (let r = 0; r < 7; r++) {
    const hw = (6 - r) * 0.55 + 0.8;
    p.px(vx - fx * hw + sl * -r, vy - fy * hw + cl * r, GOLD[3]);
    p.px(vx + fx * hw + sl * -r, vy + fy * hw + cl * r, GOLD[2]);
  }
  // Schärpe (hintere Schulter -> vordere Hüfte)
  for (let t = 0; t <= 1; t += 0.04) {
    const x = (shB.x + 1) + (wx + 5 - shB.x - 1) * t, y = shB.y + 2 + (wy - 1 - shB.y - 2) * t;
    p.px(x, y, GOLD[t < 0.3 ? 3 : 2]); p.px(x + 0.5, y + 1, GOLD[1]);
  }
  // Gürtel mit Muschel-Medaillon
  for (let k = -5.5; k <= 5.5; k += 0.5) {
    p.px(wx + fx * k, wy - 1 + fy * k, k < -3 ? GOLD[3] : k > 3 ? GOLD[1] : GOLD[2]);
    p.px(wx + fx * k, wy + fy * k, GOLD[1]);
  }
  p.ellipse(wx + fx * 1.5, wy + 1, 1.5, 1.5, GOLD[3]); p.px(wx + fx * 1.5 - 0.5, wy + 0.5, GOLD[4]);
  p.px(wx + fx * 1.5, wy + 3, PEARL[2]); g.px(wx + fx * 1.5, wy + 3, glow[2]);
  // Runen auf der Robe
  const runes = [[-2, 4], [2, 7], [-1, 10]];
  for (const [k, s] of runes) {
    const x = wx + sl * s + fx * k, y = wy - cl * s + fy * k;
    p.px(x, y, ROBE[5]); p.px(x, y + 1, ROBE[4]); p.px(x + 1, y - 1, ROBE[4]);
    g.px(x, y, glow[2]); g.px(x, y + 1, glow[1]); g.px(x + 1, y - 1, glow[flood ? 2 : 1]);
  }
  meta.chest = { x: wx + sl * 10, y: wy - cl * 10 };

  // --- 5. Kopf: fahles Gesicht, nasses Haar, Korallenkrone
  // Hals
  p.rect(hcx - 1, hcy + 3, 3, 4, SKIN[3]); p.px(hcx - 1, hcy + 4, SKIN[4]); p.px(hcx + 1, hcy + 5, SKIN[2]);
  // Hinterkopf (Haar)
  p.ellipse(hcx - 2, hcy - 0.5, 4.5, 5, HAIR[2]);
  p.ellipse(hcx - 2.5, hcy - 2, 3.2, 3, HAIR[3]);
  p.px(hcx - 4, hcy - 3, HAIR[4]); p.px(hcx - 3, hcy - 4, HAIR[4]); p.px(hcx - 5, hcy - 1, HAIR[4]);
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
  // Scheitel und nasse Strähne hinter der Schläfe (verdeckt das Gesicht nicht)
  p.rect(hcx - 3, hcy - 5, 6, 1, HAIR[4]); p.rect(hcx - 4, hcy - 4, 2, 1, HAIR[3]); p.px(hcx + 3, hcy - 4, HAIR[3]);
  p.line(hcx - 3, hcy - 2, hcx - 3, hcy + 5, HAIR[2]); p.px(hcx - 3, hcy + 6, HAIR[3]);
  // Korallenkrone: Goldreif mit verzweigten Korallen
  for (let k = -4; k <= 4; k++) {
    const y = hcy - 5 + Math.round(k * k * 0.06);
    p.px(hcx + k, y - 1, k < -1 ? GOLD[3] : k > 2 ? GOLD[1] : GOLD[2]);
  }
  p.px(hcx, hcy - 7, GOLD[4]); p.px(hcx + 1, hcy - 7, PEARL[2]); g.px(hcx + 1, hcy - 7, glow[3]);
  const coral = [[-4, 4, -0.7], [-2, 7, -0.3], [0, 9, 0.05], [2, 6, 0.35], [4, 4, 0.7]];
  for (let i = 0; i < coral.length; i++) {
    const [cx, h, sp] = coral[i];
    const bx = hcx + cx, by = hcy - 7;
    let x = bx, y = by;
    for (let s = 0; s < h; s++) {
      x += sp * 0.6 + Math.sin(s * 1.3 + i) * 0.35; y -= 1;
      p.px(x, y, s > h - 2 ? CORAL[4] : s > h * 0.5 ? CORAL[3] : CORAL[2]);
      if (s < h * 0.4 && cx <= 0) p.px(x - 1, y, CORAL[3]);
      else if (s < h * 0.4) p.px(x + 1, y, CORAL[1]);
      // Seitenzweige
      if (s === Math.floor(h * 0.5)) {
        const side = i < 2 ? -1 : 1;
        p.px(x + side, y - 1, CORAL[3]); p.px(x + side * 2, y - 2, CORAL[4]);
      }
    }
    if (flood && i % 2 === 0) g.px(x, y, glow[2]);
  }
  meta.head = { x: hcx, y: hcy - 8 };
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
      for (let s = 0; s < L; s++) {
        p.px(armF.jx - 1 + i * 1.2 - P.trail * 2 * s / L + Math.sin(P.clothT * 1.3 + i + s * 0.5) * 0.8, armF.jy + 1 + s, ROBE[i === 0 ? 3 : 2]);
      }
      p.px(armF.jx - 1 + i * 1.2, armF.jy + 1, GOLD[2]);
    }
    limb(p, armF.jx, armF.jy, armF.ex, armF.ey, 3, 2.5, [SKIN[2], SKIN[3], SKIN[4], SKIN[5]]);
    // Goldsaum am Ärmel, Muschelspange an der Schulter
    p.px(armF.jx - 2, armF.jy + 1, GOLD[3]); p.px(armF.jx + 1, armF.jy + 2, GOLD[2]);
    p.ellipse(shF.x, shF.y - 1, 2.5, 1.8, GOLD[2]); p.px(shF.x - 1, shF.y - 2, GOLD[4]); p.px(shF.x + 1, shF.y, GOLD[1]);
    p.px(shF.x, shF.y - 1, PEARL[2]);
    // Armreif
    const bx = armF.jx + (armF.ex - armF.jx) * 0.7, by = armF.jy + (armF.ey - armF.jy) * 0.7;
    p.rect(bx - 1, by - 1, 3, 2, GOLD[2]); p.px(bx - 1, by - 1, GOLD[4]);
  };
  let tri;
  if (ex.staffBehind) { tri = trident(p, g, glow, hF.x, hF.y, P.staff, P); drawArm(); }
  else { drawArm(); tri = trident(p, g, glow, hF.x, hF.y, P.staff, P); }
  // Hand umgreift den Schaft
  p.rect(hF.x - 1, hF.y - 1, 3, 3, SKIN[3]); p.px(hF.x - 1, hF.y - 1, SKIN[5]); p.px(hF.x + 1, hF.y + 1, SKIN[2]);
  meta.hand = { x: hF.x, y: hF.y };
  meta.tip = { x: tri.tipX, y: tri.tipY };
  meta.pearl = { x: tri.pearlX, y: tri.pearlY };

  // Glut an der offenen Hand beim Zaubern
  if (P.cast > 0.05 && P.open > 0.3) {
    const r = 0.8 + P.cast * 2.2;
    g.ellipse(meta.cast.x, meta.cast.y, r + 1, r + 1, glow[1]);
    g.ellipse(meta.cast.x, meta.cast.y, r, r, glow[2]);
    g.ellipse(meta.cast.x, meta.cast.y, Math.max(0.5, r - 1.2), Math.max(0.5, r - 1.2), glow[3]);
  }
  return meta;
}

// Zerfließen: Spalten tropfen nach unten, Pixel werden zu Wasser.
function meltPass(pc, k, recolor) {
  if (k <= 0 || pc.isNull) return;
  const ctx = pc.ctx;
  const src = ctx.getImageData(0, 0, W, H), d = src.data;
  const out = ctx.createImageData(W, H), o = out.data;
  const bottom = AY - 1;
  const wr = WATER.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  for (let x = 0; x < W; x++) {
    const shift = Math.round(k * k * (5 + hash2(x, 1, 77) * 18));
    for (let y = 0; y < H; y++) {
      const i = (y * W + x) * 4;
      if (d[i + 3] < 40) continue;
      const hsh = hash2(x, y, 79);
      if (hsh < k * 0.45) continue; // löst sich auf
      const ny = Math.min(bottom - Math.floor(hash2(x, y, 81) * 3 * k), y + shift);
      const j = (ny * W + x) * 4;
      let r = d[i], g = d[i + 1], b = d[i + 2];
      if (recolor && hash2(x, y, 83) < k * 1.1) {
        const lum = (r * 0.3 + g * 0.5 + b * 0.2) / 255;
        const c = wr[Math.max(1, Math.min(5, Math.round(lum * 5 + 1)))];
        r = c[0]; g = c[1]; b = c[2];
      }
      o[j] = r; o[j + 1] = g; o[j + 2] = b; o[j + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
}

// Wasseroberfläche: Wellenringe, Spritzkrone
function surface(p, g, P, glow) {
  const cx = AX + P.wx;
  const rings = P.sink > 0.02 ? 2 : 1;
  for (let r = 0; r < rings; r++) {
    const rx = 11 + r * 7 + P.ripple * 8 + P.splash * 6, ry = rx * 0.32;
    for (let a = 0; a < Math.PI * 2; a += 0.04) {
      const x = cx + Math.cos(a) * rx, y = WL + Math.sin(a) * ry;
      if (hash2(Math.round(a * 20), r, 101) < 0.25 * r) continue;
      const top = Math.sin(a) < 0;
      p.px(x, y, top ? WATER[3] : WATER[4]);
      if (!top && r === 0) g.px(x, y, glow[1]);
    }
  }
  if (P.sink > 0.02) {
    // dunkle Öffnung, wo sie eintaucht
    p.ellipse(cx, WL + 1, 9, 2.4, WATER[1]);
    p.ellipse(cx - 1, WL + 1, 6, 1.4, WATER[2]);
    for (let i = 0; i < 6; i++) p.px(cx - 7 + i * 2.6, WL + 1 + (i % 2), WATER[4]);
  }
  if (P.splash > 0.02) {
    const k = P.splash;
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const rr = 7 + k * 10 + hash2(i, 3, 103) * 4;
      const h = Math.sin(Math.min(1, k * 1.2) * Math.PI) * (10 + hash2(i, 4, 103) * 16) * (Math.sin(a) > 0 ? 0.7 : 1);
      const x = cx + Math.cos(a) * rr, y0 = WL + Math.sin(a) * rr * 0.32;
      for (let s = 0; s < h; s++) {
        if (s > h * 0.55 && hash2(i, s, 105) < 0.5) continue;
        p.px(x + Math.cos(a) * s * 0.15, y0 - s, s > h - 3 ? WATER[5] : WATER[s > h * 0.5 ? 4 : 3]);
      }
      g.px(x + Math.cos(a) * h * 0.15, y0 - h, glow[3]);
      // abgerissene Tropfen
      if (hash2(i, 6, 107) < 0.5) { p.px(x + Math.cos(a) * 4, y0 - h - 3, WATER[5]); g.px(x + Math.cos(a) * 4, y0 - h - 3, glow[2]); }
    }
  }
}

function drawNerith(p, g, P, glow, ex = {}, flood = false) {
  const off = Math.round(P.sink * 72);
  const clip = off > 0;
  for (const c of [p.ctx, g.ctx]) {
    c.save();
    if (clip) { c.beginPath(); c.rect(0, 0, W, WL); c.clip(); }
    c.translate(0, off);
  }
  const meta = drawFigure(p, g, P, glow, ex, flood);
  for (const c of [p.ctx, g.ctx]) c.restore();
  if (P.melt > 0) { meltPass(p, P.melt, true); meltPass(g, P.melt, false); }
  if (P.sink > 0.02 || P.splash > 0.02 || P.ripple > 0.02) surface(p, g, P, glow);
  for (const k in meta) meta[k].y += off;
  return meta;
}

// Pfütze aus Wasser und Algen, Robe, Korallenkrone, Dreizack.
function drawRemains(p, g, k, glow) {
  const gy = AY, cx = AX;
  p.ellipse(cx, gy - 2, 20 + k * 8, 4.5 + k, WATER[1]);
  p.ellipse(cx - 2, gy - 3, 15 + k * 6, 3 + k * 0.6, WATER[2]);
  for (let a = Math.PI * 1.05; a < Math.PI * 1.7; a += 0.05) p.px(cx + Math.cos(a) * (19 + k * 8), gy - 2 + Math.sin(a) * (4.5 + k), WATER[4]);
  // Robenbündel mit Algen und Haar, sinkt langsam ein
  const rh = 10 * (1 - k * 0.45);
  p.ellipse(cx - 3, gy - 3 - rh * 0.35, 11, Math.max(2, rh * 0.55), ROBE[1]);
  p.ellipse(cx - 5, gy - 4 - rh * 0.45, 8, Math.max(1.5, rh * 0.42), ROBE[2]);
  p.ellipse(cx - 7, gy - 5 - rh * 0.5, 4, Math.max(1, rh * 0.28), ROBE[3]);
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
  p.line(tx + 44, ty - 6, tx + 44, ty + 1, GOLD[2]); p.px(tx + 44, ty - 6, GOLD[4]);
  // Perle erlischt
  p.ellipse(tx + 42, ty - 2, 1.8, 1.8, PEARL[1]); p.px(tx + 41, ty - 3, PEARL[3]);
  if (k < 0.9) {
    const r = 3 * (1 - k);
    g.ellipse(tx + 42, ty - 2, r + 1, r + 1, glow[k > 0.5 ? 0 : 1]);
    g.ellipse(tx + 42, ty - 2, Math.max(0.6, r * 0.6), Math.max(0.6, r * 0.6), glow[k > 0.5 ? 1 : 2]);
  }
  // Korallenkrone (zerbrochen)
  const kx = cx - 38 - k * 3;
  p.rect(kx, gy - 4, 8, 1, GOLD[2]); p.px(kx, gy - 4, GOLD[4]);
  for (let i = 0; i < 4; i++) limb(p, kx + i * 2 + 1, gy - 4, kx + i * 2 + 1 + (i - 1.5) * 0.8, gy - 6 - [3, 5, 4, 2][i], 1.5, 1, [CORAL[1], CORAL[2], CORAL[3], CORAL[4]]);
  // Glitzern im Wasser
  for (let i = 0; i < 8; i++) if (hash2(i, Math.round(k * 4), 113) < 0.6 - k * 0.4) g.px(cx - 16 + hash2(i, 1, 113) * 32, gy - 3 + hash2(i, 2, 113) * 3, glow[2]);
}

// ---------------------------------------------------------------- Frames

// Zeichenfläche, die nichts zeichnet: für den zweiten Durchlauf, der nur die
// Phase-2-Leuchtebene braucht (spart die Hälfte der Ladezeit).
const nullCtx = { save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, translate() {} };
const NULL_CANVAS = { isNull: true, ctx: nullCtx, px() {}, rect() {}, line() {}, ellipse() {} };

function frame(P, extra = {}) {
  const g = new PixelCanvas(W, H), g2 = new PixelCanvas(W, H);
  let meta;
  const base = buildFrame(W, H, AX, AY, (p) => { meta = drawNerith(p, g, P, GLOW.tide, extra, false); });
  drawNerith(NULL_CANVAS, g2, P, GLOW.flood, extra, true);
  base.glow = new SpriteFrame(g.canvas, AX, AY);
  base.glowEnraged = new SpriteFrame(g2.canvas, AX, AY);
  base.meta = {};
  for (const k in meta) base.meta[k] = { dx: meta[k].x - AX, dy: meta[k].y - AY };
  base.fx = extra.fx ?? null;
  return base;
}

function remainsFrame(k) {
  const g = new PixelCanvas(W, H), g2 = new PixelCanvas(W, H);
  const base = buildFrame(W, H, AX, AY, (p) => drawRemains(p, g, k, GLOW.tide));
  drawRemains(NULL_CANVAS, g2, k, GLOW.flood);
  base.glow = new SpriteFrame(g.canvas, AX, AY);
  base.glowEnraged = new SpriteFrame(g2.canvas, AX, AY);
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
