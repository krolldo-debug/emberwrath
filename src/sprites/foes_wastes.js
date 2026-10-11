import { PAL } from '../gfx/Palette.js';
import { buildFrame, SpriteFrame, Animation } from '../gfx/Sprite.js';
import { FineCanvas, fineRes, col32 } from '../gfx/Fine.js';
import { hash2 } from '../core/math.js';

// Gegner der Glutöde (Stufe 36–40): Aschegeist, Schlackenritter,
// Magmaschlange, Glutadept und der Glutkoloss (Elite).
//
// Gleicher Rig-Ansatz wie foes_cinder.js / foes_forge.js: Schlüsselposen,
// weich interpoliert, Licht von links oben, Leucht-Ebene (frame.glow),
// Metadaten (frame.meta) und Ereignismarken (frame.fx).
// Neu: Randlicht. Die Öde hat dunklen Obsidianboden – jede Figur bekommt
// nach dem Zeichnen eine helle Oberkante (Aschelicht von oben links) und
// einen schwachen Glutsaum an der Unterseite/Rückseite auf der Leuchtebene
// (Widerschein des glühenden Bodens). So bleibt die Silhouette lesbar.
// Blickrichtung rechts, Anker = Bodenkontakt.
//
// Feinraster (docs/STYLE.md „Feinraster“, Stufe B): gezeichnet wird auf FineCanvas in Weltpixeln. Die Formen
// (ell, cap, poly, robe, flame, Schwung-Sichel) tasten Feinpixel ab und schreiben direkt in den Pixelpuffer;
// p.px/p.rect setzen ganze Weltpixel. Feindetails (Nieten, Glanzlinien, Glutkerne, Gesichter, Fetzen) stehen in
// `if (p.fine)`. Bei „Niedrig“ (res 1) verhalten sich alle Helfer wie die alten Weltpixel-Helfer aus foes_cinder.js
// (eigene Kopie, damit diese Datei unabhängig davon bleibt).

// ================================================================ Werkzeuge

const GLOW = ['#4a0e06', '#a8280c', '#f0602a', '#ffb070', '#fff4d8'];
// Lava/Flamme auf der Farbebene (dunkel -> hell)
const LAVA = ['#4a1006', '#9a2608', '#dc4e0e', '#ff8c24', '#ffd060', '#fff4c0'];
const OBS = ['#060409', '#0f0a14', '#1a1222', '#281c34', '#3b2c4c', '#5a4a72'];
const OBS_SHINE = '#9a8cc0';
const CHAR = ['#0e0b0c', '#1a1516', '#282122', '#3a3030'];
const VOID = '#0a0508';
const SMEAR = ['#6a7a98', '#b8c8e0', '#f4f8ff'];

const ease = (t) => t * t * (3 - 2 * t);
const linear = (t) => t;
const snap = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function mix(a, b, t) {
  const o = {};
  for (const k in a) o[k] = a[k] + ((b[k] ?? a[k]) - a[k]) * t;
  return o;
}
function sample(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, p0] = keys[i], [t1, p1, e = ease] = keys[i + 1];
    if (t <= t1) return mix(p0, p1, e((t - t0) / (t1 - t0 || 1)));
  }
  return keys[keys.length - 1][1];
}

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

// Lichtrichtung (von links oben, leicht zum Betrachter)
const LX = -0.52, LY = -0.66, LZ = 0.54;
// Materialrauschen im Feinraster gedämpft (harte Stufen, kein Sprenkel)
const NOISE_FINE = 0.45;
// Verdecker: solange gesetzt, löschen ell()/cap() die Glow-Ebene unter sich,
// damit verdeckte Glut (Kern hinter dem Arm) nicht durchscheint.
let OCC = null;
const occlude = (g) => { OCC = g; };

// Tastet die Texel eines Weltbereichs ab und schreibt direkt in den Pixelpuffer der FineCanvas.
// fn(x, y) -> Uint32-Farbe oder 0; x/y = Weltkoordinate der Texelmitte (vor der Verschiebung).
// Bei res 1 sind das genau die Pixelmitten x + 0.5 der alten Helfer.
function scan(p, x0, y0, x1, y1, fn) {
  const r = p.res, W = p.W, H = p.H, buf = p.buf;
  const fo = Math.round(p.ox * r), go = Math.round(p.oy * r);
  const F0 = Math.max(Math.floor(x0 * r), -fo), F1 = Math.min(Math.ceil(x1 * r), W - 1 - fo);
  const G0 = Math.max(Math.floor(y0 * r), -go), G1 = Math.min(Math.ceil(y1 * r), H - 1 - go);
  const occ = OCC ? OCC.buf : null, own = OWN ? OWN.buf : null, ownKey = OWN ? OWN.key : 0;
  for (let G = G0; G <= G1; G++) {
    const y = (G + 0.5) / r, row = (G + go) * W + fo;
    for (let F = F0; F <= F1; F++) {
      const v = fn((F + 0.5) / r, y);
      if (v) { buf[row + F] = v; if (occ) occ[row + F] = 0; if (own) own[row + F] = ownKey; }
    }
  }
  p.dirty = true;
}

const rampCache = new Map();
const ramp32 = (ramp) => {
  let v = rampCache.get(ramp);
  if (!v) { v = ramp.map(col32); rampCache.set(ramp, v); }
  return v;
};

// Schattierte Ellipse (optional gedreht, mit Materialrauschen).
function ell(p, cx, cy, rx, ry, ramp, o = {}) {
  const { rot = 0, noise = 0, seed = 1, bias = 0, clip = null, rim = 0 } = o;
  if (rim) ell(p, cx, cy, rx + rim, ry + rim, [ramp[0]], { rot, clip });
  const c = Math.cos(rot), s = Math.sin(rot);
  const R = Math.ceil(Math.max(rx, ry)) + 1;
  const RC = ramp32(ramp), n = RC.length, nk = p.fine ? noise * NOISE_FINE : noise;
  scan(p, Math.floor(cx - R), Math.floor(cy - R), cx + R, cy + R, (x, y) => {
    const dx = x - cx, dy = y - cy;
    const u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry;
    const d2 = u * u + v * v;
    if (d2 > 1) return 0;
    if (clip && !clip(Math.floor(x), Math.floor(y))) return 0;
    const nz = Math.sqrt(1 - d2);
    const nx = u * c - v * s, ny = u * s + v * c;
    const nn = nk ? (hash2(Math.round(dx) + 64, Math.round(dy) + 64, seed) - 0.5) * nk : 0;
    const t = 0.28 + 0.62 * (nx * LX + ny * LY + nz * LZ) + bias + nn;
    return RC[clamp(Math.floor(t * n), 0, n - 1)];
  });
}

// Schattierte Kapsel (Gliedmaßen): Radius r0 -> r1.
function cap(p, x0, y0, x1, y1, r0, r1, ramp, o = {}) {
  const { noise = 0, seed = 1, bias = 0, rim = 0 } = o;
  if (rim) cap(p, x0, y0, x1, y1, r0 + rim, r1 + rim, [ramp[0]]);
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 0.0001;
  const R = Math.ceil(Math.max(r0, r1)) + 1;
  const RC = ramp32(ramp), n = RC.length, nk = p.fine ? noise * NOISE_FINE : noise;
  scan(p, Math.floor(Math.min(x0, x1) - R), Math.floor(Math.min(y0, y1) - R), Math.ceil(Math.max(x0, x1) + R), Math.ceil(Math.max(y0, y1) + R), (px, py) => {
    const t = clamp(((px - x0) * dx + (py - y0) * dy) / l2, 0, 1);
    const r = r0 + (r1 - r0) * t;
    const ex = px - (x0 + dx * t), ey = py - (y0 + dy * t), d = Math.hypot(ex, ey);
    if (d > r) return 0;
    const nx = ex / (r || 1), ny = ey / (r || 1), nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const nn = nk ? (hash2(Math.round(px - x0) + 64, Math.round(py - y0) + 64, seed) - 0.5) * nk : 0;
    const k = 0.28 + 0.62 * (nx * LX + ny * LY + nz * LZ) + bias + nn;
    return RC[clamp(Math.floor(k * n), 0, n - 1)];
  });
}

// Gefülltes Polygon (Scanline je Feinzeile, ohne Kantenglättung). col: Farbe oder (x,y)=>Farbe
// (x/y = linke obere Ecke des Texels in Weltkoordinaten; bei res 1 ganze Pixel wie früher).
function poly(p, pts, col) {
  let minY = Infinity, maxY = -Infinity;
  for (const q of pts) { minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]); }
  const q = p.step;
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y += q) {
    const yc = y + q / 2, xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + (yc - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.round(xs[k] / q) * q, x1 = Math.round(xs[k + 1] / q) * q;
      if (typeof col === 'function') for (let x = x0; x < x1 - 1e-6; x += q) { const c = col(x, y); if (c) p.rect(x, y, q, q, c); }
      else if (x1 > x0) p.rect(x0, y, x1 - x0, q, col);
    }
  }
}

// Gefüllte Ellipse ohne Schattierung: bei res 1 genau wie PixelCanvas.ellipse (Zeilen), fein abgetastet sonst
function fillEll(p, cx, cy, rx, ry, c) {
  if (p.fine) { p.ellipse(cx + 0.5, cy + 0.5, rx + 0.35, ry + 0.35, c); return; }
  for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
    const t = 1 - (y * y) / (ry * ry);
    if (t < 0) continue;
    const hw = Math.round(rx * Math.sqrt(t) - 0.15);
    p.rect(Math.round(cx - hw), Math.round(cy + y), hw * 2 + 1, 1, c);
  }
}

// Linie: bei res 1 Weltpixel-Bresenham (wie früher), fein als Feinlinie in Stärke w (0 = 1 Feinpixel).
// Lage wie p.px: ein Weltpixel (x, y) bedeckt x … x+1.
function ln(p, x0, y0, x1, y1, c, w = 0) {
  if (!p.fine) { p.line(x0, y0, x1, y1, c); return; }
  const o = w >= 1 ? 0.25 : 0.5;
  p.fline(x0 + o, y0 + o, x1 + o, y1 + o, c, w);
}
// Feinpixel mittig in einem Weltpixel (x, y) – Gegenstück zu p.px für Feindetails
const dotc = (p, x, y, c) => p.dot(x + 0.5, y + 0.5, c);

// Glutlinie mit hellem Kern im farbigen Saum (fein) bzw. einfache Weltpixel-Linie (res 1)
function hotLine(p, g, x0, y0, x1, y1, saum, core, gc, gcore) {
  if (!p.fine) { p.line(x0, y0, x1, y1, saum); if (gc) g.line(x0, y0, x1, y1, gc); return; }
  p.fline(x0 + 0.25, y0 + 0.25, x1 + 0.25, y1 + 0.25, saum, 1);
  p.fline(x0 + 0.25, y0 + 0.25, x1 + 0.25, y1 + 0.25, core);
  if (gc) g.fline(x0 + 0.25, y0 + 0.25, x1 + 0.25, y1 + 0.25, gc, 1);
  if (gcore) g.fline(x0 + 0.25, y0 + 0.25, x1 + 0.25, y1 + 0.25, gcore);
}

// Leuchtpunkt/-fleck auf der Glow-Ebene (konzentrisch)
function glowDot(g, x, y, r, k = 1) {
  if (r <= 0.6) { g.px(x, y, GLOW[Math.min(4, 2 + k)]); return; }
  fillEll(g, x, y, r + 1, r + 1, GLOW[1]);
  fillEll(g, x, y, r, r, GLOW[2]);
  fillEll(g, x, y, Math.max(0.5, r - 1), Math.max(0.5, r - 1), GLOW[3]);
  if (r > 1.5) fillEll(g, x, y, Math.max(0.5, r - 2), Math.max(0.5, r - 2), GLOW[4]);
}

// Glühende Risse innerhalb einer Ellipse (Random Walk, relativ zur Mitte,
// damit sie mit dem Körper mitwandern). heat 0..1.
// Fein: zusammenhängende Risse mit hellem Kern (1 Feinpixel) im farbigen Saum.
function veins(p, g, cx, cy, rx, ry, seed, n, heat = 1, o = {}) {
  const { len = 6, dark = null } = o;
  for (let i = 0; i < n; i++) {
    let x = (hash2(i, 1, seed) - 0.5) * 1.3 * rx, y = (hash2(i, 2, seed) - 0.5) * 1.3 * ry;
    let a = hash2(i, 3, seed) * Math.PI * 2;
    const L = Math.round(len * (0.6 + hash2(i, 4, seed) * 0.8));
    let lx = null, ly = 0;
    for (let s = 0; s < L; s++) {
      if ((x * x) / (rx * rx * 0.8) + (y * y) / (ry * ry * 0.8) > 1) break;
      const mid = 1 - Math.abs(s / L - 0.5) * 2;
      const h = heat * (0.45 + mid * 0.55);
      const X = cx + x, Y = cy + y;
      if (!p.fine) {
        if (h < 0.18) p.px(X, Y, dark || LAVA[0]);
        else {
          p.px(X, Y, h > 0.75 ? LAVA[3] : h > 0.45 ? LAVA[2] : LAVA[1]);
          g.px(X, Y, GLOW[h > 0.75 ? 3 : h > 0.45 ? 2 : 1]);
        }
      } else {
        const ax = lx ?? X, ay = lx == null ? Y : ly;
        if (h < 0.18) ln(p, ax, ay, X, Y, dark || LAVA[0]);
        else {
          const c = h > 0.75 ? 3 : h > 0.45 ? 2 : 1;
          hotLine(p, g, ax, ay, X, Y, LAVA[c - 1], LAVA[c + 1], GLOW[c - 1], GLOW[c]);
        }
        lx = X; ly = Y;
      }
      x += Math.cos(a); y += Math.sin(a) * 0.85;
      a += (hash2(i, s + 7, seed) - 0.5) * 1.5;
    }
  }
}

// Flammenzunge: Basis (x,y), wächst nach oben, neigt sich um lean px je Zeile.
// Fein: Zeilen und Spalten in Feinpixeln, Ausfransen je Weltpixel (flimmert nicht).
function flame(p, g, x, y, h, w, ph, o = {}) {
  const { lean = 0, seed = 3, hot = 1, glowOnly = false } = o;
  const q = p.step;
  for (let j = 0; j < h; j += q) {
    const f = j / h;
    const hw = w * (1 - f * f * 0.85) * (0.82 + 0.28 * Math.sin(ph * 2 + j * 1.3 + seed));
    const off = lean * j + Math.sin(ph + j * 0.8 + seed) * f * 1.4;
    const K = Math.ceil(hw), kq = q === 1 ? 0 : 0.25;
    for (let k = -K - kq; k <= K + kq; k += q) {
      const e = Math.abs(k) / (hw + 0.01);
      if (e > 1) continue;
      if (f > 0.5 && hash2(Math.round(k) + 9, Math.floor(j) + Math.floor(ph * 3), seed) < (f - 0.45) * 1.3) continue;
      const heat = (1 - f * 0.85) * (1 - e * 0.75) * hot;
      const i = heat > 0.72 ? 5 : heat > 0.55 ? 4 : heat > 0.38 ? 3 : heat > 0.22 ? 2 : 1;
      if (q === 1) {
        if (!glowOnly) p.px(x + off + k, y - j, LAVA[i]);
        g.px(x + off + k, y - j, GLOW[Math.min(4, Math.max(1, i - 1))]);
      } else {
        const X = Math.round(x + off) + 0.5 + k, Y = Math.round(y) + 0.75 - j;
        if (!glowOnly) p.dot(X, Y, LAVA[i]);
        g.dot(X, Y, GLOW[Math.min(4, Math.max(1, i - 1))]);
      }
    }
  }
}

// Feuerball (Hand, Stab, Projektil-Auftakt)
function fireball(p, g, x, y, r, ph) {
  if (r < 0.5) return;
  ell(p, x, y, r, r, [LAVA[2], LAVA[3], LAVA[4], LAVA[5]], { bias: 0.1 });
  flame(p, g, x - 0.5, y - r * 0.4, Math.round(r * 2.2), r * 0.7, ph, { lean: -0.25, seed: 5 });
  glowDot(g, x, y, r + 0.5);
  if (p.fine && r > 1) { p.dot(x - r * 0.35, y - r * 0.4, '#ffffff'); p.dot(x - r * 0.35 + 0.5, y - r * 0.4, LAVA[5]); }
}

// Staub-/Funkenkranz am Boden (Einschlag)
function dustRing(p, g, x, y, r, seed, cols, sparks = true) {
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + hash2(i, 1, seed) * 0.3;
    const rr = r * (0.7 + hash2(i, 2, seed) * 0.5);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.4 - (Math.sin(a) < 0 ? hash2(i, 3, seed) * 3 : 0);
    p.px(px, py, cols[i % cols.length]);
    if (hash2(i, 4, seed) < 0.5) p.px(px + 1, py, cols[(i + 1) % cols.length]);
    if (p.fine) dotc(p, px - 0.25, py - 0.25, cols[(i + 2) % cols.length]);   // Bruchkante im Licht
    if (sparks && hash2(i, 5, seed) < 0.35) {
      const sy = py - 2 - hash2(i, 6, seed) * 5;
      if (p.fine) { dotc(p, px, sy, LAVA[5]); dotc(p, px, sy + 0.5, LAVA[3]); g.dot(px + 0.5, sy + 0.5, GLOW[4]); g.dot(px + 0.5, sy + 1, GLOW[2]); }
      else { p.px(px, sy, LAVA[4]); g.px(px, sy, GLOW[3]); }
    }
  }
}

// Robe als Trapez mit ausgefranstem, glimmendem Saum. Fein: Zeilen/Spalten in Feinpixeln,
// Falten als zweifarbige Bahnen (Licht von links), Riss-Saum und Glut je Weltpixel.
function robe(p, g, x, top, bottom, wTop, wBot, lean, hem, ramp, char, seed, embers = 1) {
  const H = bottom - top, q = p.step;
  if (q === 1) {
    for (let j = 0; j <= H; j++) {
      const f = j / H;
      const cx = x + lean * (H - j) * 0.35;
      const hw = wTop + (wBot - wTop) * Math.pow(f, 0.8);
      const sway = Math.sin(hem + f * 2) * f * 1.4;
      for (let k = Math.round(-hw); k <= Math.round(hw); k++) {
        const u = (k + hw) / (2 * hw);
        if (j > H - 3) {
          const tear = hash2(k + 30, 3, seed) * 3;
          if (H - j < tear - 0.5 + Math.sin(hem + k) * 0.6) continue;
        }
        const fold = Math.sin((k - lean * j * 0.2) * 1.3 + sway) * 0.5 + 0.5;
        const t = (1 - u) * 0.55 + fold * 0.35 - f * 0.25 + 0.2;
        let c = ramp[clamp(Math.floor(t * ramp.length), 0, ramp.length - 1)];
        if (f > 0.72) c = char[clamp(Math.floor(t * char.length), 0, char.length - 1)];
        p.px(cx + k + sway, top + j, c);
        if (embers && f > 0.78 && hash2(k + 50, j, seed) < 0.07 * embers) {
          p.px(cx + k + sway, top + j, LAVA[3]); g.px(cx + k + sway, top + j, GLOW[2]);
        }
      }
    }
    return;
  }
  const yTop = Math.round(top);
  for (let j = 0; j < H + 1; j += q) {
    const f = j / H;
    const cx = Math.round(x + lean * (H - Math.floor(j)) * 0.35);
    const hw = wTop + (wBot - wTop) * Math.pow(f, 0.8);
    const sway = Math.sin(hem + f * 2) * f * 1.4;
    const k0 = Math.round(-hw), k1 = Math.round(hw) + 1;
    for (let k = k0; k < k1; k += q) {
      const kw = Math.floor(k);
      const u = (k + 0.25 + hw) / (2 * hw);
      if (j > H - 3) {
        const tear = hash2(kw + 30, 3, seed) * 3;
        if (H - j < tear - 0.5 + Math.sin(hem + kw) * 0.6) continue;
      }
      const fs = Math.sin((k + 0.25 - lean * j * 0.2) * 1.3 + sway);
      const fold = fs * 0.5 + 0.5;
      const t = (1 - u) * 0.55 + fold * 0.35 - f * 0.25 + 0.2;
      const R = f > 0.72 ? char : ramp;
      let ci = clamp(Math.floor(t * R.length), 0, R.length - 1);
      // Faltenkante: am Kamm eine Stufe heller, im Tal eine dunkler (zweifarbige Falten)
      const dfs = Math.cos((k + 0.25 - lean * j * 0.2) * 1.3 + sway);
      if (fs > 0.15 && fs < 0.55 && dfs < 0) ci = Math.min(R.length - 1, ci + 1);
      else if (fs < -0.8) ci = Math.max(0, ci - 1);
      const X = cx + k + Math.round(sway * 2) / 2 + 0.25, Y = yTop + j + 0.25;
      p.dot(X, Y, R[ci]);
      if (embers && f > 0.78 && hash2(kw + 50, Math.floor(j), seed) < 0.07 * embers) {
        p.dot(X, Y, (k - kw) < 0.5 && (j % 1) < 0.5 ? LAVA[5] : LAVA[3]); g.dot(X, Y, GLOW[2]);
      }
    }
  }
}

// Randlicht für dunkle Figuren (Nachbearbeitung fertiger Frames, arbeitet in Texeln): die äußerste
// Materialreihe innerhalb der Kontur bekommt oben (und schwächer an den Seiten) einen hellen Saum –
// auf der Farbebene aufgehellt und zusätzlich auf der Leucht-Ebene. Glühende Stellen bleiben unberührt.
// rim = { top, side, glowTop, glowSide, k }
function rimGlow(anims, rim) {
  const hexc = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const T = hexc(rim.top), Sd = hexc(rim.side ?? rim.top);
  const GT = hexc(rim.glowTop), GS = rim.glowSide ? hexc(rim.glowSide) : null;
  const done = new Set();
  for (const a of Object.values(anims)) for (const f of a.frames) {
    if (done.has(f)) continue;
    done.add(f);
    const k = rim.k ?? 0.45, fine2 = (f.res ?? 1) > 1;
    const c = f.canvas, W = c.width, H = c.height;
    const cx = c.getContext('2d'), img = cx.getImageData(0, 0, W, H), d = img.data;
    const gc = f.glow?.canvas, gW = gc ? gc.width : 0, gH = gc ? gc.height : 0;
    const gx = gc ? gc.getContext('2d') : null, gimg = gx ? gx.getImageData(0, 0, gW, gH) : null, gd = gimg?.data;
    // Glow-Ebene liegt ohne Konturrand: Versatz aus den Ankern (Texel)
    const ox = gc ? Math.round(f.ax - f.glow.ax) : 0, oy = gc ? Math.round(f.ay - f.glow.ay) : 0;
    const A = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) A[i] = d[i * 4 + 3] > 0 ? 1 : 0;
    const op = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? A[y * W + x] : 0);
    const O = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (A[y * W + x] && (!op(x - 1, y) || !op(x + 1, y) || !op(x, y - 1) || !op(x, y + 1))) O[y * W + x] = 1;
    }
    const ring = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? O[y * W + x] : 1);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const m = y * W + x;
      if (!A[m] || O[m]) continue;
      // fein: Saum zwei Feinpixel breit (= ein Weltpixel wie bei res 1), die innere Reihe schwächer
      const up1 = ring(x, y - 1), side1 = ring(x - 1, y) || ring(x + 1, y);
      const inner = fine2 && !up1 && !side1;
      const up = up1 || (fine2 && ring(x, y - 2)), side = side1 || (fine2 && (ring(x - 2, y) || ring(x + 2, y)));
      if (!up && !side) continue;
      const qx = x - ox, qy = y - oy, gi = (qy * gW + qx) * 4;
      const inG = gd && qx >= 0 && qy >= 0 && qx < gW && qy < gH;
      if (inG && gd[gi + 3] > 0) continue; // Glut bleibt Glut
      const i = m * 4, col = up ? T : Sd, f2 = (up ? k : k * 0.6) * (inner ? 0.6 : 1);
      d[i] += (col[0] - d[i]) * f2; d[i + 1] += (col[1] - d[i + 1]) * f2; d[i + 2] += (col[2] - d[i + 2]) * f2;
      const gcol = up ? GT : GS;
      if (inG && gcol) { gd[gi] = gcol[0]; gd[gi + 1] = gcol[1]; gd[gi + 2] = gcol[2]; gd[gi + 3] = 255; }
    }
    cx.putImageData(img, 0, 0);
    if (gx) gx.putImageData(gimg, 0, 0);
  }
  return anims;
}

// Schwung-Schleier als geschlossene Sichel: am frischen Ende breit und hell, zum Anfang spitz auslaufend,
// harte Stufen – keine Rasterkrümel. Fein: Sichel in Feinpixeln abgetastet (glatte Kante, kein Streuen).
function arcSmear(p, g, cx, cy, a0, a1, r0, r1, cols, seed = 13, glowIt = true) {
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1), span = hi - lo || 1;
  const R1 = Math.ceil(r1), q = p.step;
  const bx = p.fine ? Math.round(cx) + 0.25 : cx, by = p.fine ? Math.round(cy) + 0.25 : cy;
  for (let y = -R1; y <= R1; y += q) for (let x = -R1; x <= R1; x += q) {
    const d = Math.hypot(x, y);
    if (d < r0 || d > r1) continue;
    let a = Math.atan2(y, x);
    while (a < lo - Math.PI) a += Math.PI * 2;
    while (a > lo + Math.PI) a -= Math.PI * 2;
    if (a < lo || a > hi) continue;
    const fresh = a1 > a0 ? (a - lo) / span : (hi - a) / span;
    const radial = (d - r0) / (r1 - r0 || 1);
    const th = 0.15 + 0.85 * fresh * fresh;
    if (radial < 1 - th) continue;
    const rr = (radial - (1 - th)) / th;
    const c = rr > 0.7 ? cols[2] : rr > 0.3 ? cols[1] : cols[0];
    const gc = glowIt && fresh > 0.4 && rr > 0.4 ? (rr > 0.7 ? GLOW[3] : GLOW[1]) : null;
    if (q === 1) { p.px(cx + x, cy + y, c); if (gc) g.px(cx + x, cy + y, gc); }
    else { p.dot(bx + x, by + y, c); if (gc) g.dot(bx + x, by + y, gc); }
  }
}


// ================================================================ Rahmen mit Randlicht

const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

// Randlicht als Nachbearbeitung der Farbebene (in Texeln, direkt im Pixelpuffer): Texel mit freier Oberseite/
// linker Seite werden zur Lichtfarbe gezogen, Texel mit freier Unter-/rechter Seite bekommen auf der Leuchtebene
// einen schwachen Glutsaum. Fein ersetzt es den Feinschliff von buildFrame (finish: false): Lichtkante 1 Feinpixel
// voll + 1 Feinpixel halb (gleiche Breite wie früher ein Weltpixel), Kontaktschatten unten.
function rimLight(p, g, rim) {
  const W = p.W, H = p.H, r = p.res;
  const d = new Uint8ClampedArray(p.buf.buffer), gd = new Uint8ClampedArray(g.buf.buffer);
  const src = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) src[i] = d[i * 4 + 3] > 40 ? 1 : 0;
  const A = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : src[y * W + x]);
  const [hr, hg, hb] = hex(r > 1 && rim.hiFine ? rim.hiFine : rim.hi);
  const back = rim.back ? hex(rim.back) : null;
  const k = (r > 1 && rim.kFine) || (rim.k ?? 0.4);
  const minY = (rim.backFrom ?? 0) * r;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!src[y * W + x]) continue;
    const i = (y * W + x) * 4;
    if (gd[i + 3] > 0 && gd[i] + gd[i + 1] > 260) continue; // glühende Stellen bleiben
    const top = !A(x, y - 1), left = !A(x - 1, y), tl = !A(x - 1, y - 1);
    let f = 0;
    if (top && left) f = k * 1.25; else if (top) f = k; else if (left) f = k * 0.7; else if (tl) f = k * 0.45;
    else if (r > 1 && (!A(x, y - 2) || !A(x - 2, y))) f = k * 0.4;
    if (f > 0) {
      f = Math.min(0.85, f);
      d[i] += (hr - d[i]) * f; d[i + 1] += (hg - d[i + 1]) * f; d[i + 2] += (hb - d[i + 2]) * f;
      continue;
    }
    if (back && y >= minY && (!A(x + 1, y) || !A(x, y + 1)) && gd[i + 3] === 0) {
      gd[i] = back[0]; gd[i + 1] = back[1]; gd[i + 2] = back[2]; gd[i + 3] = 255;
      if (r > 1 && !A(x, y + 1)) { d[i] *= 0.74; d[i + 1] *= 0.74; d[i + 2] *= 0.74; }   // Kontaktschatten
    }
  }
  p.dirty = true; g.dirty = true;
}

// Frame bauen: spec = { W, H, AX, AY, pad?, rim? }; draw(p, g) -> meta (absolut)
function makeFrame(S, draw, fx = null) {
  const pad = S.pad ?? 8, res = fineRes();
  const W2 = S.W + pad * 2, H2 = S.H + pad * 2;
  const g = new FineCanvas(W2, H2, res);
  g.translate(pad, pad);
  let meta = {};
  const f = buildFrame(W2, H2, S.AX + pad, S.AY + pad, (p) => {
    p.translate(pad, pad);
    meta = draw(p, g) || {};
    occlude(null);
    if (S.rim) rimLight(p, g, S.rim);
  }, { fine: true, res, finish: false });
  f.glow = new SpriteFrame(g.canvas, (S.AX + pad) * res, (S.AY + pad) * res, res);
  f.meta = {};
  for (const k in meta) f.meta[k] = { dx: Math.round(meta[k].x - S.AX), dy: Math.round(meta[k].y - S.AY) };
  f.fx = fx;
  return f;
}

// n Frames aus einer Keyframe-Spur (mit Randlicht)
function track(S, keys, n, { loop = false, extras = {} } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = loop ? i / n : n === 1 ? 1 : i / (n - 1);
    const P = sample(keys, t);
    const ex = extras[i] || {};
    out.push(makeFrame(S, (p, g) => S.draw(p, g, P, ex, t), ex.fx ?? null));
  }
  return out;
}
const still = (S, draw, fx = null) => makeFrame(S, draw, fx);

// Loop-Spur aus einer Posenfunktion f(phase 0..2π)
function cycle(f, n) {
  const keys = [];
  for (let i = 0; i <= n; i++) keys.push([i / n, f((i / n) * Math.PI * 2, i), linear]);
  return keys;
}

// Pixel der Farbebene zerfallen lassen (Aschegeist-Tod, Auflösung von oben). Arbeitet in Texeln, entscheidet
// aber je Weltpixel (ruhige Löcher statt Feinpixel-Sprenkel); fallende Flocken fein.
function dissolve(p, g, k, seed, top, bottom, ash) {
  const W = p.W, H = p.H, r = p.res, d = p.buf, gd = g.buf;
  const fall = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if ((d[i] >>> 24) < 40) continue;
    const wx = Math.floor(x / r), wy = Math.floor(y / r);
    const h = 1 - clamp((wy - top) / (bottom - top), 0, 1); // oben = 1
    const rr = hash2(wx, wy, seed);
    if (rr < k * 1.6 - (1 - h) * 0.8) {
      d[i] = 0; gd[i] = 0;
      if (x % r === 0 && y % r === 0 && hash2(wx, wy, seed + 1) < 0.12) fall.push([wx, wy]);
    }
  }
  p.dirty = true; g.dirty = true;
  // fallende Asche und Glutflocken (Koordinaten des ungepolsterten Puffers → Verschiebung herausrechnen)
  const ox = p.ox, oy = p.oy;
  for (const [x, y] of fall) {
    const dy = 2 + hash2(x, y, seed + 2) * 5 * k, dx = (hash2(x, y, seed + 3) - 0.7) * 4;
    const X = x + dx - ox, Y = y + dy - oy;
    if (hash2(x, y, seed + 4) < 0.3) {
      if (p.fine) { dotc(p, X, Y, LAVA[4]); dotc(p, X + 0.5, Y, LAVA[3]); g.dot(X + 0.5, Y + 0.5, GLOW[3]); g.dot(X + 1, Y + 0.5, GLOW[2]); }
      else { p.px(X, Y, LAVA[3]); g.px(X, Y, GLOW[2]); }
    } else {
      const c = ash[1 + Math.floor(hash2(x, y, seed + 5) * (ash.length - 1))];
      if (p.fine) { dotc(p, X, Y, c); dotc(p, X + 0.5, Y + 0.5, c); }
      else p.px(X, Y, c);
    }
  }
}

// ================================================================ Materialien

// Asche (warmes Grau, leicht violett im Schatten)
const ASHW = ['#110e12', '#1d181d', '#2c252a', '#40363a', '#5a4e50', '#7c6f6c'];
const ASHW_D = ['#0d0b0e', '#161217', '#211c21', '#2e272c', '#3d3438'];
const CLAW = ['#171214', '#2b2226', '#473a3c', '#6e5e5c', '#a09088'];
// erkaltete Schlacke (blauschwarz mit rostigem Glanz)
const SLAG = ['#100e14', '#1c1a22', '#2b2733', '#3e3845', '#57505c', '#7a6f78'];
const SLAG_D = ['#09080c', '#111016', '#1a1820', '#25222b', '#322d37'];
const RUST = ['#2a120c', '#4a2014', '#6e341c', '#96502a', '#c07a44'];
// Magmaschlange: Kruste und Bauch
const CRUST = ['#0e0a0c', '#1a1216', '#2a1c1e', '#3e2a26', '#56392e', '#76503a'];
const CRUST_D = ['#0a0709', '#130d10', '#1e1416', '#2a1c1c', '#38251f'];
const BELLY = ['#5a1406', '#9a2608', '#d4480e', '#fc8424', '#ffc450', '#fff0b0'];
// Glutadept: Robe, Maske, Gold
const ROBE = ['#0e080a', '#1a0d10', '#2a1216', '#3e1a1c', '#582622', '#76342a'];
const ROBE_CH = ['#0b090a', '#161213', '#221c1c', '#302826'];
const GOLD = ['#2e1a08', '#5a3610', '#8a5a1a', '#c08a2c', '#e8be52', '#fff0a0'];
const SKIN = ['#2a1612', '#4a2a20', '#6e4030', '#925a40'];
// Koloss: Basaltfels, Obsidiandornen
const ROCK = ['#0f0c0e', '#1b1619', '#2a2226', '#3b3034', '#524448', '#6e5c5c'];
const ROCK_D = ['#0b090b', '#141013', '#1e181b', '#2a2125', '#372c30'];

// fein: kühlere, etwas kräftigere Lichtkante – der Aschegeist liegt farblich nah am dunklen Boden
const RIM_ASH = { hi: '#d9cec6', k: 0.42, back: '#3a0e06', hiFine: '#d4dcf0', kFine: 0.52 };
const RIM_WARM = { hi: '#e8c8a8', k: 0.38, back: '#3a0e06' };

// Klaue: drei gebogene Krallen ab (x,y) in Richtung a, spread 0..1
function claws(p, g, x, y, a, spread, len, ramp, heat, back) {
  for (let i = -1; i <= 1; i++) {
    const aa = a + i * (0.28 + spread * 0.45);
    let cx = x, cy = y;
    for (let s = 0; s < len; s++) {
      const bend = aa + (s / len) * 0.7; // krümmt sich nach unten
      const ox = cx, oy = cy;
      cx += Math.cos(bend); cy += Math.sin(bend);
      const tip = s >= len - 2;
      const c = tip ? ramp[back ? 2 : 4] : ramp[back ? 1 : 2 + (s < 2 ? 1 : 0)];
      if (p.fine) {
        // fein: Kralle verjüngt sich (2 → 1 Feinpixel), Lichtkante oben, helle Spitze
        ln(p, ox, oy, cx, cy, c, tip ? 0 : 1);
        if (!tip && !back && s % 2 === 0) p.dot(cx + 0.25, cy + 0.25, ramp[4]);
        if (tip && heat > 1.05 && !back) { g.dot(cx + 0.5, cy + 0.5, GLOW[heat > 1.3 ? 3 : 1]); if (s === len - 1) p.dot(cx + 0.5, cy + 0.5, heat > 1.3 ? LAVA[4] : ramp[4]); }
        continue;
      }
      p.px(cx, cy, c);
      if (tip && heat > 1.05 && !back) g.px(cx, cy, GLOW[heat > 1.3 ? 3 : 1]);
    }
  }
}

// Rauch-/Aschefahne (nur Farbebene, grau), steigt mit der Phase
function wisps(p, x, y, ph, n, ramp, seed, h = 8) {
  for (let i = 0; i < n; i++) {
    const u = ((ph / (Math.PI * 2)) + hash2(i, 1, seed)) % 1;
    const yy = y - u * h, xx = x + Math.sin(ph + i * 2.1) * 1.5 - u * 2 + (hash2(i, 2, seed) - 0.5) * 4;
    if (u > 0.85) continue;
    if (p.fine) {
      // fein: Aschefaden aus Feinpixeln, oben dünner
      ln(p, xx, yy + 0.5, xx + 1 + (u < 0.5 ? 0.5 : 0), yy - 0.5, ramp[u < 0.3 ? 3 : u < 0.6 ? 2 : 1]);
      if (u < 0.5) dotc(p, xx + 1, yy, ramp[2]);
      continue;
    }
    p.px(xx, yy, ramp[u < 0.3 ? 3 : u < 0.6 ? 2 : 1]);
    if (u < 0.5) p.px(xx + 1, yy, ramp[2]);
  }
}

// Fein: Aschestoff fällt in Fäden – dunkle/helle Strähnen je Feinspalte statt Sprenkel (0 = Grundton, 1 = dunkler)
function ashStrand(x, y, cx, seed) {
  const col = Math.floor(x * 2) + Math.floor((y - cx) * 0.25);
  const h = hash2(col, Math.floor(y / 5), seed);
  return h < 0.22 ? 1 : h > 0.9 ? -1 : 0;
}

// ================================================================ Aschegeist

const AW = { W: 60, H: 62, AX: 26, AY: 57, rim: RIM_ASH };
const AW_REST = {
  x: 0, bob: 0, lean: 0.1, hover: 15, tail: 0, drift: 0.2, head: 0, headY: 0, jaw: 0.1,
  hFx: 8, hFy: 12, hBx: -1, hBy: 13, claw: 0.3, heat: 1, eye: 1, smoke: 0,
};
const awp = (o) => ({ ...AW_REST, ...o });

function drawWraith(p, g, P, ex) {
  const { AX, AY } = AW;
  const meta = {};
  // fein: Körper eine halbe Stufe heller, Mantel/Kapuze im Licht eine Stufe – hebt ihn vom dunklen Boden ab
  const lift = p.fine ? 0.08 : 0, up = p.fine ? 1 : 0;
  const gy = AY;
  const heat = P.heat;
  const waist = { x: AX + P.x, y: gy - P.hover - P.bob };
  const lean = P.lean;
  const ch = { x: waist.x + Math.sin(lean) * 11, y: waist.y - Math.cos(lean) * 11 };
  const shF = { x: ch.x + 3.5, y: ch.y - 4 }, shB = { x: ch.x - 3.5, y: ch.y - 5 };

  const arm = (sh, tx, ty, ramp, back) => {
    const k = ik(sh.x, sh.y, tx, ty, 8, 9, 1);
    cap(p, sh.x, sh.y, k.jx, k.jy, back ? 1.8 : 2.1, 1.5, ramp, { noise: 0.09, seed: back ? 5 : 6 });
    // zerfetzter Ärmel hängt vom Unterarm
    for (let i = 0; i < 4; i++) {
      const u = 0.15 + i * 0.2, sx = k.jx + (k.ex - k.jx) * u, sy = k.jy + (k.ey - k.jy) * u;
      const L = 3 + (i % 2) * 2 + Math.sin(P.tail + i) * 0.8;
      if (p.fine) {
        // fein: Fetzen als zwei Feinfäden (hell/dunkel), ungleich lang
        ln(p, sx, sy + 1, sx - 1 - P.drift * 1.5, sy + L, ramp[back ? 1 : 2 + (i % 2)]);
        ln(p, sx + 0.5, sy + 1, sx - 0.5 - P.drift * 1.5, sy + L - 1 + (i % 2), ramp[back ? 2 : 1 + (i % 2) * 3]);
        continue;
      }
      p.line(sx, sy + 1, sx - 1 - P.drift * 1.5, sy + L, ramp[back ? 1 : 2 + (i % 2)]);
    }
    cap(p, k.jx, k.jy, k.ex, k.ey, 1.4, 1.2, ramp, { noise: 0.09, seed: back ? 7 : 8 });
    // Glutriss im Unterarm
    if (!back) {
      const mx = (k.jx + k.ex) / 2, my = (k.jy + k.ey) / 2;
      p.px(mx, my, LAVA[heat > 1.2 ? 3 : 2]); g.px(mx, my, GLOW[heat > 1.2 ? 2 : 1]);
      p.px(k.jx, k.jy, ramp[4]);
      if (p.fine) { p.dot(mx + 0.25, my + 0.25, LAVA[heat > 1.2 ? 5 : 4]); g.dot(mx + 0.25, my + 0.25, GLOW[4]); p.dot(k.jx + 0.25, k.jy + 0.25, ramp[5] ?? ramp[4]); }
    }
    const a = Math.atan2(k.ey - k.jy, k.ex - k.jx);
    ell(p, k.ex, k.ey, 1.6, 1.4, ramp);
    claws(p, g, k.ex, k.ey, a, P.claw, back ? 5 : 7, CLAW, heat, back);
    return { k, a };
  };

  // --- hinterer Arm
  const bArm = arm(shB, ch.x + P.hBx, ch.y + P.hBy, ASHW_D, true);
  meta.handB = { x: bArm.k.ex, y: bArm.k.ey };

  // --- Schleppe: zerfaserte Aschefahne statt Beinen
  const N = 9;
  let tx = waist.x, ty = waist.y;
  const tail = [];
  for (let i = 1; i <= N; i++) {
    const u = i / N;
    const nx = waist.x - u * (4 + P.drift * 12) + Math.sin(P.tail + u * 4) * u * 2.2;
    const ny = waist.y + Math.sin(u * Math.PI * 0.75) * (P.hover - 8 - P.drift * 3) + Math.sin(P.tail * 0.5 + u * 3) * u * 1.2;
    tail.push([tx, ty, nx, ny, u]);
    tx = nx; ty = ny;
  }
  for (const [x0, y0, x1, y1, u] of tail) cap(p, x0, y0, x1, y1, 5.8 * (1 - u) ** 1.1 + 0.5, 5.8 * (1 - u + 1 / N) ** 1.1 * 0.9 + 0.4, ASHW, { noise: 0.11, seed: 11, bias: lift });
  // Fransen am Ende
  for (let s = 0; s < 3; s++) {
    let fx = tx + 1, fy = ty - 1 + s;
    for (let j = 0; j < 5; j++) {
      const ox = fx, oy = fy;
      fx -= 1; fy += Math.sin(P.tail * 1.3 + s * 2 + j * 0.9) * 0.8 + (s - 1) * 0.3;
      if (p.fine) { ln(p, ox, oy, fx, fy, ASHW[j < 2 ? 3 : 2], j < 2 ? 1 : 0); if (j === 4) dotc(p, fx - 0.5, fy + 0.25 * (s - 1), ASHW[1]); continue; }
      p.px(fx, fy, ASHW[j < 2 ? 3 : 2]);
    }
  }
  // Glutflocken an den Rändern der Schleppe
  for (let i = 0; i < 5; i++) {
    const [x0, y0, , , u] = tail[Math.min(N - 1, 2 + i)];
    const ox = Math.sin(P.tail * 2 + i * 1.7) * 3, oy = 3 + (i % 2) * 2 + Math.cos(P.tail + i) * 1.5;
    if (hash2(i, Math.floor(P.tail * 2), 3) < 0.6) {
      if (p.fine) { dotc(p, x0 + ox, y0 + oy, LAVA[4]); p.dot(x0 + ox + 1, y0 + oy + 0.5, LAVA[2]); g.dot(x0 + ox + 0.5, y0 + oy + 0.5, GLOW[u > 0.5 ? 2 : 3]); g.dot(x0 + ox + 1, y0 + oy + 0.5, GLOW[1]); }
      else { p.px(x0 + ox, y0 + oy, LAVA[3]); g.px(x0 + ox, y0 + oy, GLOW[u > 0.5 ? 1 : 2]); }
    }
  }
  // Glimmende Adern in der Schleppe
  for (let i = 0; i < 3; i++) {
    const [x0, y0, x1, y1] = tail[1 + i * 2];
    const x = (x0 + x1) / 2 + (i - 1), y = (y0 + y1) / 2;
    if (p.fine) { hotLine(p, g, x - 1, y + 0.5, x + 1, y - 1, LAVA[1], heat > 0.9 ? LAVA[3] : LAVA[2], heat > 0.9 ? GLOW[1] : null, heat > 0.9 ? GLOW[2] : null); continue; }
    p.px(x, y, LAVA[1]); if (heat > 0.9) { p.px(x + 1, y - 1, LAVA[2]); g.px(x + 1, y - 1, GLOW[1]); }
  }

  // --- Rumpf: gebeugter Brustkorb aus gebackener Asche, Mantelfetzen
  cap(p, waist.x, waist.y, ch.x, ch.y, 4.6, 6.2, ASHW, { noise: 0.1, seed: 13, bias: lift });
  ell(p, ch.x - 0.5, ch.y, 6.8, 6.4, ASHW, { noise: 0.09, seed: 14, rot: lean, bias: lift });
  // Rippen: kurze helle Bögen, dazwischen Glut
  for (let r = 0; r < 3; r++) {
    const ry = ch.y - 1 + r * 2.4;
    if (p.fine) {
      // fein: Rippe als gebogener Knochenspan (Licht oben, Schatten unten), Glut mit hellem Kern dazwischen
      const rx0 = ch.x + 1 + lean * 2, L = 4 - r * 0.5;
      for (let x = 0; x < L; x += 0.5) {
        const yy = ry + x * 0.3 + x * x * 0.04;
        p.dot(rx0 + x + 0.25, yy + 0.25, x > 2.5 ? ASHW[4] : ASHW[5]); p.dot(rx0 + x + 0.25, yy + 0.75, ASHW[3]);
        p.dot(rx0 + x + 0.25, yy + 1.25, ASHW[1]);
      }
      p.px(rx0, ry + 1, LAVA[heat > 1.1 ? 3 : 2]); p.dot(rx0 + 0.25, ry + 1.25, LAVA[heat > 1.1 ? 5 : 4]);
      g.px(rx0, ry + 1, GLOW[heat > 1.1 ? 2 : 1]); g.dot(rx0 + 0.25, ry + 1.25, GLOW[heat > 1.1 ? 4 : 3]);
      continue;
    }
    for (let x = 0; x < 4 - r * 0.5; x++) p.px(ch.x + 1 + x + lean * 2, ry + x * 0.3, ASHW[5 - (x > 2 ? 1 : 0)]);
    p.px(ch.x + 1 + lean * 2, ry + 1, LAVA[heat > 1.1 ? 3 : 2]); g.px(ch.x + 1 + lean * 2, ry + 1, GLOW[heat > 1.1 ? 2 : 1]);
  }
  // Glutherz hinter den Rippen
  const hcx = ch.x + 0.5 + lean * 2, hcy = ch.y + 1;
  p.px(hcx, hcy, LAVA[4]); p.px(hcx - 1, hcy, LAVA[3]); p.px(hcx, hcy + 1, LAVA[3]);
  glowDot(g, hcx, hcy, 0.8 + heat * 0.9);
  if (p.fine) { p.dot(hcx + 0.25, hcy + 0.25, LAVA[5]); p.dot(hcx + 0.75, hcy + 0.25, LAVA[5]); p.dot(hcx + 0.25, hcy + 0.75, LAVA[5]); p.dot(hcx - 0.75, hcy + 0.75, LAVA[2]); p.dot(hcx + 0.75, hcy + 1.75, LAVA[2]); }
  meta.chest = { x: hcx, y: hcy };
  veins(p, g, waist.x, waist.y - 1, 3.5, 3, 17, 2, heat * 0.7, { len: 4 });

  // Mantelfetzen über Schultern und Rücken (hängen nach hinten)
  poly(p, [[shB.x - 2, shB.y - 1], [shF.x + 2, shF.y - 1], [ch.x - 1, ch.y + 5], [ch.x - 7 - P.drift * 3, ch.y + 7 + Math.sin(P.tail) * 1.5], [ch.x - 6, ch.y]],
    (x, y) => ASHW[(y - ch.y < 0 ? 3 + up : 2) - (p.fine ? ashStrand(x, y, ch.x, 19) : (hash2(x, y, 19) < 0.2 ? 1 : 0))]);
  for (let i = 0; i < 3; i++) {
    const bx = ch.x - 5 - i * 1.5 - P.drift * 2, by = ch.y + 5 + i;
    if (p.fine) { ln(p, bx, by, bx - 1 - P.drift * 2, by + 3 + Math.sin(P.tail + i) * 1, ASHW[2], 1); ln(p, bx + 0.5, by + 1, bx - 0.5 - P.drift * 2, by + 4 + Math.sin(P.tail + i * 2), ASHW[1]); continue; }
    p.line(bx, by, bx - 1 - P.drift * 2, by + 3 + Math.sin(P.tail + i) * 1, ASHW[2]);
  }

  // --- Kopf: Kapuze aus Asche, Schädelmaske, glühende Augen
  const hx = ch.x + 3.5 + lean * 3 + P.head, hy = ch.y - 9.5 + P.headY;
  // Kapuzenzipfel sackt nach hinten
  poly(p, [[hx - 2, hy - 5.5], [hx - 7 - P.drift * 2, hy - 3.5], [hx - 9 - P.drift * 3, hy + 1 + Math.sin(P.tail) * 0.8], [hx - 7 - P.drift * 2, hy + 5], [hx - 3, hy + 4]], (x, y) => ASHW[(y < hy - 2 ? 3 + up : 2) - (p.fine ? ashStrand(x, y, hx, 27) : (hash2(x, y, 27) < 0.15 ? 1 : 0))]);
  ell(p, hx - 0.5, hy, 5.2, 5.4, ASHW, { noise: 0.08, seed: 21, bias: 0.04 + lift });
  // Gesichtsöffnung
  ell(p, hx + 2, hy + 0.8, 3, 3.6, [VOID, '#1a1014']);
  // Schädelmaske (fahles Knochengrau) im Schatten
  const bone = PAL.bone;
  const ec = ex.hurt ? '#ffffff' : P.eye > 1.2 ? LAVA[5] : LAVA[4];
  let jy = hy + 3 + P.jaw * 2;
  if (!p.fine) {
    p.rect(hx + 1, hy - 2, 4, 1, bone[2]); p.px(hx + 1, hy - 2, bone[3]); p.rect(hx + 1, hy - 1, 4, 1, bone[1]);
    p.px(hx + 2, hy, bone[1]); p.px(hx + 4, hy, bone[0]); p.rect(hx + 2, hy + 1, 3, 1, bone[1]); p.px(hx + 3, hy + 1, VOID);
    // Kiefer
    if (P.jaw > 0.3) { p.rect(hx + 2, hy + 2, 3, jy - hy - 2, VOID); g.rect(hx + 2, hy + 2, 3, jy - hy - 2, GLOW[1]); }
    p.rect(hx + 2, jy, 3, 1, bone[1]); p.px(hx + 4, jy, bone[2]); p.px(hx + 2, jy, bone[0]);
    // Augen
    p.px(hx + 1, hy, ec); p.px(hx + 3, hy, ec);
  } else {
    // Handfein: gewölbte Schädelmaske (Licht oben links), tiefe schräge Augenhöhlen mit glühendem Kern,
    // Nasenloch, Wangen, obere und untere Zahnreihe
    const X = Math.round(hx), Y = Math.round(hy), B4 = [bone[0], bone[1], bone[2], bone[3]];
    jy = Math.round(jy * 2) / 2;
    ell(p, X + 3.1, Y - 0.6, 2.3, 1.95, B4, { bias: 0.04 });
    ell(p, X + 3.2, Y + 1.1, 1.75, 1.15, [bone[0], bone[1], bone[2]], { bias: -0.02 });
    p.fline(X + 1.75, Y - 1.75, X + 3.25, Y - 2.25, bone[3]); p.dot(X + 1.75, Y - 1.75, bone[4]);   // Stirnglanz
    if (P.jaw > 0.3) { p.rect(X + 1.5, Y + 2.5, 3.5, jy - Y - 2.5, VOID); g.rect(X + 1.5, Y + 2.5, 3.5, jy - Y - 2.5, GLOW[1]); p.rect(X + 2, jy - 0.5, 2.5, 0.5, LAVA[1]); }
    for (const [e, inner] of [[X + 1, 1], [X + 3, 0]]) {
      p.rect(e, Y - 0.5, 1.5, 1.5, VOID);
      p.dot(e + inner + 0.25, Y - 0.25, bone[1]);                                    // Braue zieht nach innen (zorniger Blick)
      p.dot(e + 0.75, Y + 0.25, ec); p.dot(e + 0.25, Y + 0.25, ex.hurt ? ec : LAVA[3]); p.dot(e + 0.75, Y + 0.75, ex.hurt ? ec : LAVA[2]);
      g.dot(e + 0.75, Y + 0.25, GLOW[4]);
    }
    p.dot(X + 2.75, Y + 0.25, bone[3]);                                                // Nasenrücken im Licht
    p.dot(X + 2.75, Y + 1.25, VOID); p.dot(X + 3.25, Y + 1.25, VOID); p.dot(X + 3.25, Y + 1.75, VOID);   // Nasenloch
    p.dot(X + 4.75, Y + 1.25, bone[0]); p.dot(X + 1.75, Y + 1.25, bone[2]);            // Wangen
    for (let u = 0; u < 3.5; u += 0.5) p.dot(X + 1.75 + u, Y + 2.25, (u * 2) % 2 ? bone[1] : bone[3]);   // obere Zahnreihe
    p.rect(X + 1.5, jy, 3.5, 1, bone[1]);                                             // Unterkiefer
    for (let u = 0; u < 3.5; u += 0.5) p.dot(X + 1.75 + u, jy + 0.25, (u * 2) % 2 ? bone[0] : bone[3]);  // untere Zahnreihe
    p.dot(X + 1.75, jy + 0.75, bone[0]); p.dot(X + 4.75, jy + 0.75, bone[2]);
  }
  g.px(hx + 1, hy, GLOW[4]); g.px(hx + 3, hy, GLOW[4]); g.px(hx + 1, hy + 1, GLOW[1]); g.px(hx + 3, hy + 1, GLOW[1]);
  if (P.eye > 1.2) { g.px(hx + 1, hy - 1, GLOW[2]); g.px(hx + 3, hy - 1, GLOW[2]); g.px(hx + 5, hy, GLOW[2]); }
  meta.eye = { x: hx + 2, y: hy };
  meta.head = { x: hx, y: hy - 5 };
  meta.mouth = { x: hx + 3, y: jy };
  // Asche weht aus der Kapuze
  wisps(p, hx - 2, hy - 4, P.smoke, 4, ASHW, 23, 9);
  if (hash2(Math.floor(P.smoke * 3), 1, 25) < 0.7) {
    const sx = hx - 3 + Math.sin(P.smoke) * 2, sy = hy - 7 - (P.smoke % 1) * 3;
    p.px(sx, sy, LAVA[3]); g.px(sx, sy, GLOW[2]);
    if (p.fine) { p.dot(sx + 0.25, sy + 0.25, LAVA[5]); g.dot(sx + 0.25, sy + 0.25, GLOW[4]); }
  }

  // --- vorderer Arm mit Klaue
  if (ex.smear) arcSmear(p, g, shF.x, shF.y, ex.smear[0], ex.smear[1], 13, 21, SMEAR, 29, false);
  occlude(g);
  const fArm = arm(shF, ch.x + P.hFx, ch.y + P.hFy, ASHW, false);
  occlude(null);
  // Knochige Schulter
  ell(p, shF.x, shF.y, 2.2, 2, ASHW, { bias: 0.1 });
  meta.hand = { x: fArm.k.ex + Math.cos(fArm.a) * 3, y: fArm.k.ey + Math.sin(fArm.a) * 3 };
  if (P.heat > 1.25) glowDot(g, fArm.k.ex, fArm.k.ey, 0.8);
  if (ex.smear2) arcSmear(p, g, shB.x, shB.y, ex.smear2[0], ex.smear2[1], 12, 18, SMEAR, 31, false);
  return meta;
}

function drawWraithDeath(p, g, P, ex) {
  const meta = drawWraith(p, g, P, ex);
  dissolve(p, g, ex.dis, 41, 0, AW.AY + (AW.pad ?? 8) - 2, ASHW);
  return meta;
}

// Aschehaufen mit glimmender Glut und Krallenresten
function drawWraithAsh(p, g, k) {
  const { AX, AY } = AW;
  const gy = AY;
  const heat = 1 - k;
  if (p.fine) {
    // fein: Aschehaufen als gewölbter Kegel, Licht von links, Schichtlinien
    const RC = ramp32(ASHW);
    scan(p, AX - 13, gy - 6, AX + 12, gy, (x, y) => {
      const j = gy - y, hw = 11.5 * Math.pow(Math.max(0, 1 - j / 5.6), 0.5) + 0.5, u = x - (AX - 0.5);
      if (j < 0 || Math.abs(u) > hw) return 0;
      const ny = j / 5.4, t = 0.35 - u / (2 * hw + 1) * 0.5 + ny * 0.25 + (Math.abs(Math.sin(j * 2.1 + u * 0.35)) < 0.12 ? -0.12 : 0);
      return RC[clamp(Math.floor(t * 6), 1, 5)];
    });
  } else for (let j = 0; j < 5; j++) {
    const hw = 10 - j * 2 + (j === 0 ? 2 : 0);
    for (let x = -hw; x <= hw; x++) {
      if (j > 0 && hash2(x, j, 5) < 0.18) continue;
      const t = 0.3 + (hw - x) / (2 * hw + 1) * 0.45 + (j > 2 ? 0.1 : 0) + (hash2(x, j, 6) - 0.5) * 0.2;
      p.px(AX - 1 + x, gy - 1 - j, ASHW[clamp(Math.floor(t * 6), 1, 5)]);
    }
  }
  // Schädelmaske und Krallen
  const bone = PAL.bone;
  p.rect(AX + 6, gy - 3, 3, 2, bone[1]); p.px(AX + 6, gy - 3, bone[2]); p.px(AX + 7, gy - 2, VOID);
  p.line(AX - 10, gy - 1, AX - 6, gy - 2, CLAW[3]); p.line(AX - 9, gy, AX - 5, gy - 1, CLAW[2]);
  // Glut
  for (let i = 0; i < 7; i++) {
    if (hash2(i, 3, 9) > heat * 1.2) continue;
    const x = AX - 7 + hash2(i, 1, 9) * 14, y = gy - 1 - hash2(i, 2, 9) * 3;
    p.px(x, y, LAVA[heat > 0.5 ? 3 : 2]); g.px(x, y, GLOW[heat > 0.5 ? 2 : 1]);
  }
  if (heat > 0.4) glowDot(g, AX, gy - 2, heat * 1.5);
  if (heat > 0.2) wisps(p, AX, gy - 5, k * 9, 3, ASHW, 7, 8);
  return { eye: { x: AX + 7, y: gy - 3 }, head: { x: AX + 7, y: gy - 6 }, hand: { x: AX - 6, y: gy - 2 }, chest: { x: AX, y: gy - 3 } };
}

function createWraith() {
  const S = { ...AW, draw: drawWraith };
  const idle = cycle((ph) => {
    const s = Math.sin(ph), c = Math.cos(ph);
    return awp({ bob: s * 1.4, tail: ph, smoke: ph, hFy: 12 + s, hBy: 13 + s, hFx: 8 + c * 0.5, claw: 0.3 + Math.max(0, c) * 0.4, heat: 0.9 + s * 0.15, headY: -Math.max(0, s) * 0.6 });
  }, 6);
  const walk = cycle((ph) => {
    const s = Math.sin(ph), c = Math.cos(ph);
    return awp({ bob: s * 1.2, lean: 0.35, drift: 0.9, tail: ph * 2, smoke: ph * 2, hFx: 3 + c, hFy: 11, hBx: -5 - c, hBy: 11, claw: 0.1, head: 0.5, heat: 1 });
  }, 6);
  // Ausholen: aufrichten, Klauen weit nach hinten-oben, Augen lodern
  const w1 = awp({ bob: 2, lean: -0.05, drift: 0.3, hFx: 0, hFy: -4, hBx: -6, hBy: -2, claw: 0.8, jaw: 0.6, heat: 1.2, eye: 1.3, head: -0.5, tail: 1, smoke: 1 });
  const w2 = awp({ bob: 3.5, lean: -0.22, x: -2, drift: 0.4, hFx: -3, hFy: -9, hBx: -8, hBy: -6, claw: 1, jaw: 1, heat: 1.45, eye: 1.5, head: -1, headY: -1, tail: 2, smoke: 2 });
  // Hieb: vorschnellen, beide Klauen reißen schräg nach unten
  const s1 = awp({ bob: 1, lean: 0.55, x: 4, drift: 1, hFx: 13, hFy: -2, hBx: 3, hBy: -6, claw: 1, jaw: 0.8, heat: 1.5, eye: 1.4, tail: 3, smoke: 3 });
  const s2 = awp({ bob: -1, lean: 0.7, x: 6, drift: 1.1, hFx: 12, hFy: 10, hBx: 10, hBy: 0, claw: 0.7, jaw: 0.5, heat: 1.4, eye: 1.3, tail: 3.6, smoke: 3.5 });
  const s3 = awp({ bob: -1, lean: 0.6, x: 6, drift: 0.9, hFx: 8, hFy: 13, hBx: 12, hBy: 9, claw: 0.5, jaw: 0.3, heat: 1.2, tail: 4.2, smoke: 4 });
  const s4 = awp({ bob: 0, lean: 0.25, x: 2, drift: 0.5, hFx: 7, hFy: 10, hBx: 1, hBy: 10, claw: 0.3, heat: 1, tail: 5, smoke: 5 });
  const hurtP = awp({ bob: 2, lean: -0.35, x: -3, drift: 0.1, head: -1.5, headY: -1, hFx: 2, hFy: 4, hBx: -6, hBy: 5, claw: 1, jaw: 0.8, heat: 1.6, tail: 2 });
  const d1 = awp({ bob: 3, lean: -0.4, x: -3, drift: 0, head: -1.5, headY: -1, hFx: 0, hFy: -3, hBx: -7, hBy: -1, claw: 1, jaw: 1, heat: 1.8, eye: 1.6, tail: 3 });
  const d2 = awp({ bob: -4, hover: 7, lean: 0.2, x: -1, drift: 0.1, head: 0.5, headY: 2, hFx: 5, hFy: 12, hBx: 0, hBy: 12, claw: 0.2, jaw: 1, heat: 1.2, tail: 4 });
  const SD = { ...AW, draw: drawWraithDeath };
  return {
    idle: new Animation(track(S, idle, 6, { loop: true }), 6),
    walk: new Animation(track(S, walk, 6, { loop: true }), 10),
    windup: new Animation(track(S, [[0, idle[0][1]], [0.45, w1], [1, w2]], 4), 7, false),
    strike: new Animation(track(S, [[0, s1], [0.25, s2, snap], [0.6, s3], [1, s4]], 5, {
      extras: { 0: { smear: [-2.0, -0.4] }, 1: { fx: 'impact', smear: [-1.3, 1.0], smear2: [-1.6, 0.2] }, 2: { smear2: [-0.8, 1.2] } },
    }), 14, false),
    hurt: new Animation(track(S, [[0, hurtP], [1, awp({ lean: -0.05, heat: 1.2 })]], 2, { extras: { 0: { hurt: true } } }), 9, false),
    death: new Animation([
      ...track(S, [[0, hurtP], [1, d1]], 2, { extras: { 0: { hurt: true } } }),
      ...track(SD, [[0, d1], [1, d2]], 4, { extras: { 0: { dis: 0.12 }, 1: { dis: 0.35 }, 2: { dis: 0.6 }, 3: { dis: 0.85 } } }),
      still(S, (p, g) => drawWraithAsh(p, g, 0), 'impact'),
      still(S, (p, g) => drawWraithAsh(p, g, 0.5)),
      still(S, (p, g) => drawWraithAsh(p, g, 1)),
    ], 8, false),
  };
}


// ================================================================ Schlackenritter

const KN = { W: 70, H: 62, AX: 30, AY: 56, rim: RIM_WARM };
const KN_REST = {
  hipX: 0, hipY: 0, lean: 0.06, head: 0, headY: 0, kneel: 0,
  fFx: 6, fFy: 0, fBx: -6, fBy: 0,
  gx: 9, gy: 10, ma: -1.25, heat: 1, visor: 1, cape: 0,
};
const knp = (o) => ({ ...KN_REST, ...o });

// Glühende Fuge zwischen zwei Schlackenplatten (unterbrochen)
function seam(p, g, x0, y0, x1, y1, heat, seed) {
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0)));
  if (p.fine) {
    // fein: zusammenhängende Fuge, heller Kern (1 Feinpixel) im farbigen Saum, erkaltete Stücke als dunkle Kerbe
    for (let i = 0; i < n; i++) {
      const xa = x0 + (x1 - x0) * (i / n), ya = y0 + (y1 - y0) * (i / n);
      const xb = x0 + (x1 - x0) * ((i + 1) / n), yb = y0 + (y1 - y0) * ((i + 1) / n);
      const r = hash2(i, 1, seed), jy = hash2(i, 2, seed) < 0.2 ? 0.5 : 0;
      if (r < 0.18) { ln(p, xa, ya, xb, yb, SLAG[0], 1); continue; }
      const mid = 1 - Math.abs(i / n - 0.5) * 1.2;
      const h = heat * (0.45 + r * 0.35 + mid * 0.3);
      const c = h > 1.35 ? 4 : h > 0.95 ? 3 : h > 0.55 ? 2 : 1;
      hotLine(p, g, xa, ya + jy, xb, yb + jy, LAVA[c - 1], LAVA[Math.min(5, c + 1)], GLOW[Math.max(0, c - 2)], GLOW[Math.min(4, c)]);
    }
    return;
  }
  for (let i = 0; i <= n; i++) {
    const x = x0 + (x1 - x0) * (i / n), y = y0 + (y1 - y0) * (i / n);
    const r = hash2(i, 1, seed);
    if (r < 0.18) { p.px(x, y, SLAG[0]); continue; }
    const mid = 1 - Math.abs(i / n - 0.5) * 1.2;
    const h = heat * (0.45 + r * 0.35 + mid * 0.3);
    const c = h > 1.35 ? 4 : h > 0.95 ? 3 : h > 0.55 ? 2 : 1;
    p.px(x, y + (hash2(i, 2, seed) < 0.2 ? 1 : 0), LAVA[c]); g.px(x, y, GLOW[Math.max(0, c - 2)]);
  }
}

// Fein: Glanzlinie (1 Feinpixel) auf einer gewölbten Fläche – Bogen um (cx, cy) mit Radien rx/ry von Winkel a0
// bis a1 (Licht oben links ≈ −2,2), dazu ein Glanzpunkt an der hellsten Stelle.
function glint(p, cx, cy, rx, ry, a0, a1, line, point) {
  const n = Math.ceil(Math.abs(a1 - a0) * Math.max(rx, ry) * 2 * p.res) + 1;
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    p.dot(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, line);
  }
  if (point) { const a = (a0 + a1) / 2; p.dot(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, point); }
}
// Fein: Niete (heller Kopf oben links, Schatten unten rechts)
function rivet(p, x, y, hi, lo) { p.dot(x, y, hi); p.dot(x + 0.5, y + 0.5, lo); }
const STEEL_LINE = '#b4a8b2', STEEL_PT = '#f0e8ec', RIVET = '#c8bcc4';

// Streitkolben: Griff (hx,hy), Achse a (zum Kopf). Flanschkopf aus Obsidian mit Glutkern.
function knightMace(p, g, hx, hy, a, heat, back) {
  const c = Math.cos(a), s = Math.sin(a);
  cap(p, hx - c * 7, hy - s * 7, hx + c * 15, hy + s * 15, 1.1, 1.1, SLAG);
  if (p.fine) {
    // fein: Lederwicklung als schräge Bänder, Lichtkante auf dem Schaft
    for (let k = -5.5; k <= 1.5; k += 1) {
      const qx = hx + c * k, qy = hy + s * k;
      p.fline(qx - s * 0.9 - c * 0.3 + 0.25, qy + c * 0.9 - s * 0.3 + 0.25, qx + s * 0.9 + c * 0.3 + 0.25, qy - c * 0.9 + s * 0.3 + 0.25, RUST[2]);
      p.dot(qx + s * 0.6 + 0.25, qy - c * 0.6 + 0.25, RUST[4]);
    }
    p.fline(hx + c * 2.5 + s * 0.5, hy + s * 2.5 - c * 0.5, hx + c * 14 + s * 0.5, hy + s * 14 - c * 0.5, SLAG[5]);
  } else for (let k = -5; k <= 1; k += 2) p.px(hx + c * k, hy + s * k, RUST[2]);
  ell(p, hx - c * 8, hy - s * 8, 1.4, 1.4, RUST);
  if (p.fine) p.dot(hx - c * 8 - 0.5, hy - s * 8 - 0.5, RUST[4]);
  const kx = hx + c * 18, ky = hy + s * 18;
  // vier Flansche (zwei sichtbar seitlich, zwei vorn/hinten)
  const na = a + Math.PI / 2;
  for (const [d, len] of [[1, 5.5], [-1, 5.5]]) {
    const bx = kx + Math.cos(na) * d * 2.5, by = ky + Math.sin(na) * d * 2.5;
    poly(p, [[bx - c * 3.5, by - s * 3.5], [bx + Math.cos(na) * d * len * 0.6 - c * 2, by + Math.sin(na) * d * len * 0.6 - s * 2], [bx + Math.cos(na) * d * len * 0.6 + c * 3, by + Math.sin(na) * d * len * 0.6 + s * 3], [bx + c * 3.5, by + s * 3.5]], OBS[3]);
    ln(p, bx - c * 3, by - s * 3, bx + Math.cos(na) * d * len * 0.6, by + Math.sin(na) * d * len * 0.6, d < 0 ? OBS_SHINE : OBS[4]);
    if (p.fine) ln(p, bx + Math.cos(na) * d * len * 0.6, by + Math.sin(na) * d * len * 0.6, bx + Math.cos(na) * d * len * 0.6 + c * 2.5, by + Math.sin(na) * d * len * 0.6 + s * 2.5, d < 0 ? OBS[5] : OBS[2]);
  }
  ell(p, kx, ky, 3.6, 3.6, OBS, { bias: 0.08 });
  if (p.fine) glint(p, kx, ky, 2.6, 2.6, -2.75, -1.75, OBS_SHINE, '#ece6ff');
  else p.px(kx - 1.5, ky - 2, OBS_SHINE);
  // Glutrisse im Kopf
  const hot = heat > 1.3 ? 4 : heat > 0.9 ? 3 : 2;
  if (p.fine) {
    hotLine(p, back ? p : g, kx - c * 0.5, ky - s * 0.5, kx + c * 1.5, ky + s * 1.5, LAVA[hot - 1], LAVA[hot + 1], null, null);
    hotLine(p, back ? p : g, kx, ky, kx - s * 1.5, ky + c * 1.5, LAVA[hot - 1], LAVA[hot], null, null);
  } else { p.px(kx, ky, LAVA[hot]); p.px(kx + c, ky + s, LAVA[hot - 1]); p.px(kx - s, ky + c, LAVA[hot - 1]); }
  if (!back) { g.px(kx, ky, GLOW[hot]); g.px(kx + c, ky + s, GLOW[hot - 1]); g.px(kx - s, ky + c, GLOW[2]); if (heat > 1.2) glowDot(g, kx, ky, 1.2); }
  // Spitze oben auf dem Kopf
  poly(p, [[kx + c * 3 - s, ky + s * 3 + c], [kx + c * 7, ky + s * 7], [kx + c * 3 + s, ky + s * 3 - c]], OBS[4]);
  if (p.fine) p.fline(kx + c * 3 + s * 0.6, ky + s * 3 - c * 0.6, kx + c * 6.5, ky + s * 6.5, OBS_SHINE);
  return { head: { x: kx, y: ky }, tip: { x: kx + c * 4, y: ky + s * 4 } };
}

function drawKnight(p, g, P, ex) {
  const { AX, AY } = KN;
  const meta = {};
  const gy = AY;
  const heat = P.heat;
  const hip = { x: AX + P.hipX, y: gy - 15 + P.hipY + P.kneel * 6 };
  const lean = P.lean;
  const ch = { x: hip.x + Math.sin(lean) * 13, y: hip.y - Math.cos(lean) * 13 };
  const px = Math.cos(lean), py = Math.sin(lean);
  const shF = { x: ch.x + px * 6, y: ch.y + py * 6 - 3 }, shB = { x: ch.x - px * 6, y: ch.y - py * 6 - 4 };

  const leg = (hx, hy, fx, fy, ramp, back) => {
    let k = ik(hx, hy, fx, fy, 8, 8, -1);
    if (P.kneel > 0.01 && back) {
      const kx = hx - 2, ky = gy - 2;
      k = { jx: k.jx + (kx - k.jx) * P.kneel, jy: k.jy + (ky - k.jy) * P.kneel, ex: k.ex + (kx - 9 - k.ex) * P.kneel, ey: k.ey };
    }
    cap(p, hx, hy, k.jx, k.jy, 3.8, 3.2, ramp, { noise: 0.06, seed: 3 });
    cap(p, k.jx, k.jy, k.ex, k.ey - 3, 3.2, 3.4, ramp, { noise: 0.06, seed: 4 });
    // Sabaton aus Schlackenplatten
    const bx = Math.round(k.ex - 4), by = Math.round(k.ey - 4);
    ell(p, bx + 5, by + 2, 5.5, 2.6, ramp, { bias: 0.04 });
    p.rect(bx, by + 3, 11, 1, ramp[0]);
    if (p.fine) {
      // fein: geschobene Zehenplatten (Kante dunkel, Lichtkante davor), Nieten, Glanz auf dem Rist
      for (const u of [3.5, 6.5, 9]) { p.fline(bx + u, by + 0.75 + (u > 8 ? 0.5 : 0), bx + u + 0.5, by + 3, ramp[0]); p.fline(bx + u - 0.5, by + 1 + (u > 8 ? 0.5 : 0), bx + u, by + 2.75, ramp[ramp.length - 1]); }
      if (!back) { glint(p, bx + 5, by + 2, 4.4, 1.9, -2.6, -1.9, STEEL_LINE, null); rivet(p, bx + 2.25, by + 1.75, RIVET, ramp[0]); }
    }
    // Kniebuckel mit Dorn
    ell(p, k.jx + 1, k.jy, 3, 2.8, ramp, { bias: 0.1 });
    if (p.fine && !back) { glint(p, k.jx + 1, k.jy, 2.1, 2, -2.7, -1.8, STEEL_LINE, STEEL_PT); rivet(p, k.jx + 0.25, k.jy + 1.25, RIVET, ramp[0]); }
    if (!back) {
      poly(p, [[k.jx + 2, k.jy - 1], [k.jx + 6, k.jy - 1], [k.jx + 2, k.jy + 2]], OBS[3]);
      if (p.fine) { p.fline(k.jx + 2.25, k.jy - 0.75, k.jx + 5.75, k.jy - 0.75, OBS_SHINE); p.fline(k.jx + 2.25, k.jy + 1.75, k.jx + 5.25, k.jy - 0.25, OBS[1]); }
      else p.px(k.jx + 3, k.jy - 1, OBS_SHINE);
      seam(p, g, k.jx - 2, k.jy + 3, k.jx + 2, k.jy + 3, heat * 0.9, 5);
      seam(p, g, k.ex - 1, k.ey - 5, k.ex + 3, k.ey - 5, heat * 0.8, 6);
    }
  };

  // Streitkolben liegt beim Ausholen hinter dem Körper
  const behind = ex.maceBehind;
  // Griffpunkte
  const G = { x: ch.x + P.gx, y: ch.y + P.gy };
  const kf = ik(shF.x, shF.y, G.x, G.y, 7, 7.5, 1);
  const ca = Math.cos(P.ma), sa = Math.sin(P.ma);
  const B = { x: kf.ex - ca * 5, y: kf.ey - sa * 5 };
  const kb = ik(shB.x, shB.y, B.x, B.y, 7, 7.5, 1);

  // --- Umhang (zerschlissen, Glutsaum) hinter allem
  const cx0 = shB.x - 1, cy0 = shB.y;
  const clen = 20;
  poly(p, [[cx0 - 1, cy0 - 1], [cx0 + 6, cy0], [hip.x - 2 - P.cape * 4, hip.y + 8], [hip.x - 9 - P.cape * 6, hip.y + 6 + Math.sin(P.cape * 3) ], [cx0 - 5 - P.cape * 3, cy0 + clen * 0.5]],
    (x, y) => CHAR[clamp(2 - Math.floor((y - cy0) / 8) + (p.fine ? -ashStrand(x, y, cx0, 33) : (hash2(x, y, 33) < 0.15 ? -1 : 0)), 0, 3)]);
  for (let i = 0; i < 6; i++) {
    const x = hip.x - 3 - i * 1.3 - P.cape * (4 + i * 0.4), y = hip.y + 7 + ((i * 3) % 2) - i * 0.3;
    if (hash2(i, 2, 35) < 0.6) { p.px(x, y, LAVA[2]); g.px(x, y, GLOW[1]); if (p.fine) { p.dot(x + 0.25, y + 0.25, LAVA[4]); g.dot(x + 0.25, y + 0.25, GLOW[3]); } }
  }

  // --- hinten: Bein, Arm
  leg(hip.x - 3, hip.y, AX + P.fBx, gy - P.fBy, SLAG_D, true);
  let mace;
  if (behind) mace = knightMace(p, g, kf.ex, kf.ey, P.ma, heat, true);
  cap(p, shB.x, shB.y, kb.jx, kb.jy, 2.8, 2.4, SLAG_D);
  cap(p, kb.jx, kb.jy, kb.ex, kb.ey, 2.4, 2.6, SLAG_D);
  ell(p, kb.ex, kb.ey, 2.2, 2.2, SLAG_D.concat(SLAG[4]));

  // --- Rumpf: Schöße, Brustpanzer mit glühenden Fugen
  for (let i = 0; i < 4; i++) {
    const tx = hip.x - 7 + i * 4, ty = hip.y + 1;
    const sw = lean * 2;
    ell(p, tx + 2 + sw * 0.5, ty + 3, 2.4, 3.8 - Math.abs(i - 1.5) * 0.5, i % 2 ? SLAG : SLAG_D.concat(SLAG[4]), { noise: 0.05, seed: 40 + i });
    if (p.fine) { p.fline(tx + 0.75 + sw * 0.5, ty + 1.5, tx + 0.75 + sw * 0.5, ty + 5, i % 2 ? SLAG[5] : SLAG[4]); rivet(p, tx + 1.75 + sw * 0.5, ty + 1.25, RIVET, SLAG[0]); }
  }
  seam(p, g, hip.x - 7, hip.y + 1, hip.x + 7, hip.y + 1, heat * 0.8, 41);
  ell(p, hip.x, hip.y - 1, 7.5, 3.5, SLAG, { noise: 0.05, seed: 42 });
  ell(p, ch.x, ch.y + 1, 9, 9.5, SLAG, { rot: lean, noise: 0.07, seed: 43, bias: 0.05 });
  // Plattenfugen quer und längs
  seam(p, g, ch.x - 8 + px * 0, ch.y - 3 + py * -8, ch.x + 7, ch.y - 4 + py * 7, heat, 44);
  seam(p, g, ch.x - 7, ch.y + 4 - py * 7, ch.x + 7, ch.y + 4 + py * 7, heat * 0.9, 45);
  seam(p, g, ch.x + 1, ch.y - 3, ch.x + 1 + py * 7, ch.y + 4, heat * 1.1, 46);
  // helle Plattenkanten (erkaltete Schlacke glänzt rostig)
  if (p.fine) {
    // Handfein: Plattenkante (Licht oben, Schatten darunter), Nietenreihe, Glanzlinie + Glanzpunkt, Rostspuren
    p.fline(ch.x - 7, ch.y - 5 - py * 7, ch.x + 5, ch.y - 6 + py * 5, SLAG[5]);
    p.fline(ch.x - 7, ch.y - 4.5 - py * 7, ch.x + 5, ch.y - 5.5 + py * 5, SLAG[1]);
    for (let u = 0.12; u < 1; u += 0.22) rivet(p, ch.x - 7 + 12 * u, ch.y - 3.75 - py * 7 + (-1 + py * 12) * u, RIVET, SLAG[0]);
    for (let u = 0.2; u < 1; u += 0.3) rivet(p, ch.x - 6 + 12 * u, ch.y + 5.75 - py * 7 + py * 14 * u, RIVET, SLAG[0]);
    glint(p, ch.x - 2.5, ch.y + 1.5, 3, 2.6, -2.9, -1.8, STEEL_LINE, STEEL_PT);
    p.fline(ch.x - 5, ch.y + 1.5, ch.x - 4, ch.y + 2.5, RUST[3]); p.dot(ch.x - 4.5, ch.y + 2.5, RUST[2]);
    p.fline(ch.x + 4, ch.y + 6, ch.x + 4.5, ch.y + 7, RUST[2]);
  } else {
    p.line(ch.x - 7, ch.y - 5 - py * 7, ch.x + 5, ch.y - 6 + py * 5, SLAG[5]);
    p.px(ch.x - 5, ch.y + 2, RUST[3]); p.px(ch.x + 4, ch.y + 6, RUST[2]);
  }
  // Glutkern hinter der Brustfuge
  const cxx = ch.x + 1, cyy = ch.y + 0.5;
  p.px(cxx, cyy, LAVA[heat > 1.2 ? 5 : 4]); g.px(cxx, cyy, GLOW[4]);
  glowDot(g, cxx, cyy, 0.6 + heat * 0.8);
  if (p.fine) { p.dot(cxx + 0.25, cyy + 0.25, '#ffffff'); p.dot(cxx + 0.75, cyy + 0.75, LAVA[3]); }
  meta.chest = { x: cxx, y: cyy };

  // --- vorderes Bein
  leg(hip.x + 3, hip.y + 1, AX + P.fFx, gy - P.fFy, SLAG, false);

  // --- Helm: Topfhelm aus Schlacke, T-Visier, nach hinten geschwungene Hörner
  const hx = ch.x + px * 2 + P.head, hy = ch.y - 12 + P.headY;
  ell(p, hx - 1, hy + 6, 5, 2.5, SLAG_D.concat(SLAG[4])); // Halsberge
  ell(p, hx, hy - 1.5, 5, 4, SLAG, { bias: 0.08, noise: 0.04, seed: 47 });
  p.rect(hx - 5, hy - 1, 10, 6, SLAG[3]);
  ell(p, hx, hy + 1, 5, 4.5, SLAG, { bias: 0.02, noise: 0.05, seed: 48 });
  // Horn nach hinten
  if (p.fine) {
    // fein: Horn als sich verjüngende Obsidian-Kapsel mit Lichtkante und heller Spitze
    const HP = (i) => [hx - 3 - i * 0.9 + 1, hy - 1 - i * 1.3 + i * i * 0.05 + 0.5];
    for (let i = 0; i < 6; i++) { const [x0, y0] = HP(i), [x1, y1] = HP(i + 1); cap(p, x0, y0, x1, y1, 1.05 - i * 0.12, 0.93 - i * 0.12, [OBS[2], OBS[3], OBS[4], OBS[5]]); }
    for (let i = 0; i < 6; i++) { const [x0, y0] = HP(i), [x1, y1] = HP(i + 1); p.fline(x0 - 0.5 + i * 0.06, y0 - 0.25, x1 - 0.4 + i * 0.06, y1 - 0.25, i < 2 ? OBS[4] : OBS[5]); }
    const [tx, ty] = HP(6.4); p.dot(tx, ty, OBS_SHINE); p.dot(tx - 0.25, ty - 0.5, '#ece6ff');
    // Helmkuppel: Glanzlinie, Glanzpunkt, Nietenband, Sehschlitz-Kante
    glint(p, hx, hy - 1, 4, 3.2, -2.75, -1.75, STEEL_LINE, STEEL_PT);
    p.fline(hx - 4.5, hy + 3.75, hx - 0.25, hy + 4.25, SLAG[1]);
    for (let u = -4; u <= -1; u += 1.5) rivet(p, u + hx + 0.25, hy + 3 + (u + 4) * 0.1, RIVET, SLAG[0]);
    p.fline(hx - 0.25, hy - 0.75, hx + 4.75, hy - 0.75, SLAG[5]);
  } else {
    for (let i = 0; i < 7; i++) { const x = hx - 3 - i * 0.9, y = hy - 1 - i * 1.3 + i * i * 0.05; p.rect(x, y, i < 4 ? 2 : 1, 1, i < 2 ? OBS[3] : OBS[4]); if (i > 2) p.px(x + 1, y + 1, OBS[2]); }
    p.px(hx - 9, hy - 9, OBS_SHINE);
  }
  // Visier
  const vs = P.visor, ec = ex.hurt ? '#ffffff' : LAVA[5];
  p.rect(hx, hy, 5, 1, VOID); p.rect(hx + 2, hy, 1, 4, VOID);
  if (vs > 0.2 && p.fine) {
    // fein: Glut im Sehschlitz – heller Kern (obere Feinzeile), farbiger Saum, Augenpunkte am hellsten
    p.rect(hx + 1, hy, 4, 0.5, vs > 0.8 ? LAVA[4] : LAVA[3]); p.rect(hx + 1, hy + 0.5, 4, 0.5, LAVA[2]);
    p.dot(hx + 2.25, hy + 0.25, vs > 0.8 ? ec : LAVA[4]); p.dot(hx + 3.75, hy + 0.25, vs > 0.8 ? ec : LAVA[4]);
    p.rect(hx + 2, hy + 1, 0.5, 2, LAVA[3]); p.rect(hx + 2.5, hy + 1, 0.5, 2, LAVA[1]);
    g.rect(hx + 1, hy, 4, 1, GLOW[vs > 0.8 ? 3 : 2]); g.px(hx + 2, hy + 1, GLOW[2]); g.px(hx + 2, hy + 2, GLOW[1]);
    if (vs > 1.2) g.rect(hx, hy - 1, 6, 3, GLOW[1]);
    g.rect(hx + 1, hy, 4, 0.5, GLOW[vs > 0.8 ? 4 : 3]);
  } else if (vs > 0.2) {
    p.rect(hx + 1, hy, 4, 1, vs > 0.8 ? ec : LAVA[3]); p.px(hx + 2, hy + 1, LAVA[3]); p.px(hx + 2, hy + 2, LAVA[2]);
    g.rect(hx + 1, hy, 4, 1, GLOW[vs > 0.8 ? 4 : 2]); g.px(hx + 2, hy + 1, GLOW[2]); g.px(hx + 2, hy + 2, GLOW[1]);
    if (vs > 1.2) { g.rect(hx, hy - 1, 6, 3, GLOW[1]); g.rect(hx + 1, hy, 4, 1, GLOW[4]); }
  }
  seam(p, g, hx - 4, hy + 3, hx - 1, hy + 4, heat * 0.7, 49);
  if (!p.fine) { p.px(hx - 3, hy - 4, SLAG[5]); p.px(hx - 2, hy - 5, SLAG[5]); }
  meta.eye = { x: hx + 3, y: hy };
  meta.head = { x: hx, y: hy - 7 };

  // --- Streitkolben vorn + vorderer Arm
  if (ex.smear) arcSmear(p, g, shF.x, shF.y, ex.smear[0], ex.smear[1], 16, 30, SMEAR, 51, false);
  if (!behind) mace = knightMace(p, g, kf.ex, kf.ey, P.ma, heat, false);
  occlude(g);
  cap(p, shF.x, shF.y, kf.jx, kf.jy, 3, 2.6, SLAG, { noise: 0.05, seed: 52 });
  cap(p, kf.jx, kf.jy, kf.ex, kf.ey, 2.6, 2.9, SLAG, { noise: 0.05, seed: 53 });
  ell(p, kf.ex, kf.ey, 2.5, 2.5, SLAG, { bias: 0.1 });
  if (p.fine) { glint(p, kf.ex, kf.ey, 1.6, 1.6, -2.6, -1.9, STEEL_LINE, null); for (let i = 0; i < 3; i++) p.fline(kf.ex - 1 + i, kf.ey - 0.75, kf.ex - 0.5 + i, kf.ey + 1.25, SLAG[1]); }
  occlude(null);
  seam(p, g, kf.jx - 1, kf.jy + 1, kf.jx + 2, kf.jy - 1, heat * 0.9, 54);
  // Schulterplatte: großer Schlackenbuckel mit Obsidiandornen
  occlude(g);
  ell(p, shF.x, shF.y - 1, 6, 4.8, SLAG, { bias: 0.1, noise: 0.06, seed: 55 });
  occlude(null);
  if (p.fine) {
    // Handfein: Glanzlinie + Glanzpunkt auf dem Buckel, Randwulst mit Nieten
    glint(p, shF.x - 0.5, shF.y - 0.5, 3.4, 2.2, -3.0, -2.0, STEEL_LINE, STEEL_PT);
    p.fline(shF.x - 5.25, shF.y + 1.75, shF.x - 1, shF.y + 3, SLAG[1]);
    for (let u = -4; u <= 3; u += 2.3) rivet(p, shF.x + u, shF.y + 0.5 + (u + 4) * 0.08, RIVET, SLAG[0]);
  }
  seam(p, g, shF.x - 5, shF.y + 1, shF.x + 5, shF.y + 2, heat, 56);
  for (const [dx, h] of [[-3, 5], [0, 6], [3, 4]]) {
    poly(p, [[shF.x + dx - 1.2, shF.y - 3], [shF.x + dx - 1 - h * 0.3, shF.y - 3 - h], [shF.x + dx + 1.2, shF.y - 3]], OBS[3]);
    if (p.fine) { p.fline(shF.x + dx - 0.75, shF.y - 3.25, shF.x + dx - 1 - h * 0.3 + 0.25, shF.y - 3 - h + 0.5, dx === 0 ? OBS_SHINE : OBS[5]); p.fline(shF.x + dx + 0.75, shF.y - 3.25, shF.x + dx - 0.75 - h * 0.3 + 0.5, shF.y - 2.5 - h + 0.75, OBS[1]); }
  }
  if (!p.fine) p.line(shF.x - 1, shF.y - 3, shF.x - 2.8, shF.y - 8.5, OBS_SHINE);

  meta.hand = { x: kf.ex, y: kf.ey };
  meta.tip = mace.tip;
  if (ex.impact) {
    dustRing(p, g, mace.head.x, gy - 1, ex.impact, 57, [SLAG[3], SLAG[4], CHAR[3]]);
    for (let i = 0; i < 12; i++) {
      const a = -Math.PI * (0.1 + hash2(i, 1, 58) * 0.8), d = (ex.impact + 3) * (0.4 + hash2(i, 2, 58) * 0.8);
      const x = mace.head.x + Math.cos(a) * d, y = gy - 2 + Math.sin(a) * d * 0.7;
      p.px(x, y, LAVA[4]); g.px(x, y, GLOW[3]);
    }
  }
  return meta;
}

// Zusammengebrochene Rüstung: Platten, Helm, Kolben, erkaltende Fugen
function drawKnightFallen(p, g, k) {
  const { AX, AY } = KN;
  const gy = AY;
  const heat = 1 - k;
  // Umhang am Boden
  poly(p, [[AX - 22, gy], [AX - 16, gy - 4], [AX + 4, gy - 5], [AX + 8, gy]], CHAR[1]);
  // Beine liegen
  cap(p, AX - 18, gy - 3, AX - 8, gy - 4, 3, 3.2, SLAG_D);
  cap(p, AX - 16, gy - 2, AX - 6, gy - 2, 3, 3.2, SLAG);
  // Rumpf auf dem Bauch
  ell(p, AX, gy - 5, 10, 5.5, SLAG, { noise: 0.07, seed: 43 });
  seam(p, g, AX - 8, gy - 6, AX + 8, gy - 7, heat, 44);
  seam(p, g, AX - 2, gy - 9, AX + 1, gy - 2, heat * 0.8, 45);
  ell(p, AX + 5, gy - 8, 5.5, 4, SLAG, { bias: 0.08, noise: 0.06, seed: 55 });
  // Helm abgerollt
  const hx = AX + 15 + k * 3;
  ell(p, hx, gy - 4, 4.6, 4, SLAG, { noise: 0.05, seed: 48 });
  p.rect(hx + 1, gy - 5, 3, 1, heat > 0.3 ? LAVA[3] : VOID); if (heat > 0.3) g.rect(hx + 1, gy - 5, 3, 1, GLOW[2]);
  for (let i = 0; i < 4; i++) p.px(hx - 3 - i, gy - 7 - i * 0.7, OBS[4]);
  // Kolben daneben
  knightMace(p, g, AX - 10, gy - 11, 0.12, heat * 0.9, false);
  if (heat > 0.3) for (let i = 0; i < 3; i++) g.px(AX - 1 + i, gy - 13 - i * 2 - k * 3, GLOW[0]);
  return { eye: { x: hx + 2, y: gy - 5 }, head: { x: hx, y: gy - 9 }, chest: { x: AX, y: gy - 6 }, hand: { x: AX - 10, y: gy - 11 }, tip: { x: AX + 12, y: gy - 9 } };
}

// Zusätzliches Randlicht des Schlackenritters auf der Leuchtebene: die Rüstung ist
// fast schwarz, die Lichtkarte der Öde schluckt das Randlicht der Farbebene.
// Heller Ascheschein oben, Glutsaum an den Seiten – unabhängig von der Beleuchtung.
const KNIGHT_RIM = { top: '#e8c8a8', side: '#a06040', glowTop: '#a08a7a', glowSide: '#7a3418', k: 0.12 };

function createKnight() {
  const S = { ...KN, draw: drawKnight };
  const idle = cycle((ph) => {
    const s = Math.sin(ph);
    return knp({ hipY: Math.max(0, s) * 0.8, lean: 0.06 + s * 0.015, gy: 10 + Math.max(0, s), headY: Math.max(0, s) * 0.8, heat: 0.95 + s * 0.15, cape: s * 0.2 });
  }, 4);
  const walk = cycle((ph) => {
    const s = Math.sin(ph), c = Math.cos(ph);
    return knp({
      hipX: 1, hipY: 1 - Math.abs(c) * 1.6, lean: 0.14 + s * 0.02, head: s * 0.4, headY: Math.abs(c) * 0.8,
      fFx: 2 + s * 7, fFy: Math.max(0, -c) * 3.5, fBx: -3 - s * 7, fBy: Math.max(0, c) * 3.5,
      gx: 9 - s * 1.5, gy: 10 + Math.abs(c), ma: -1.2 - s * 0.08, cape: 0.5 + c * 0.3,
    });
  }, 8);
  // Ausholen: Kolben über die Schulter weit nach hinten
  const w1 = knp({ lean: -0.04, hipX: -1, gx: 2, gy: -8, ma: -2.2, fFx: 8, fBx: -8, heat: 1.2, cape: 0.3 });
  const w2 = knp({ lean: -0.2, hipX: -2, hipY: -1, gx: -2, gy: -12, ma: -2.9, fFx: 9, fBx: -9, fBy: 1, heat: 1.45, visor: 1.3, cape: 0.6 });
  // Schlag: senkrecht in den Boden vor sich
  const s1 = knp({ lean: 0.2, hipX: 2, hipY: 1, gx: 10, gy: -10, ma: -1.1, fFx: 11, fBx: -9, heat: 1.5, visor: 1.3, cape: 0.2 });
  const s2 = knp({ lean: 0.5, hipX: 4, hipY: 5, gx: 13, gy: 8, ma: 0.55, fFx: 12, fBx: -10, heat: 1.6, visor: 1.4, cape: -0.3 });
  const s3 = knp({ lean: 0.47, hipX: 4, hipY: 5, gx: 13, gy: 9, ma: 0.6, fFx: 12, fBx: -10, heat: 1.3, cape: -0.2 });
  const s4 = knp({ lean: 0.18, hipX: 2, hipY: 2, gx: 10, gy: 9, ma: -0.6, fFx: 9, fBx: -8, heat: 1.05, cape: 0 });
  const hurtP = knp({ lean: -0.16, hipX: -3, head: -1.5, headY: -1, gx: 6, gy: 6, ma: -1.6, visor: 1.6, heat: 1.5, cape: 0.6 });
  const d1 = knp({ lean: -0.26, hipX: -3, head: -1.5, headY: -1, gx: 5, gy: 6, ma: -1.8, visor: 1.3, heat: 1.4, cape: 0.8 });
  const d2 = knp({ lean: 0.4, kneel: 1, hipY: 3, head: 1, headY: 2, gx: 12, gy: 12, ma: 0.4, visor: 0.8, heat: 0.9 });
  const d3 = knp({ lean: 0.85, kneel: 1, hipY: 7, head: 2, headY: 4, gx: 14, gy: 12, ma: 0.1, visor: 0.3, heat: 0.6 });
  return rimGlow({
    idle: new Animation(track(S, idle, 4, { loop: true }), 5),
    walk: new Animation(track(S, walk, 8, { loop: true, extras: { 0: { fx: 'step' }, 4: { fx: 'step' } } }), 9),
    windup: new Animation(track(S, [[0, idle[0][1]], [0.45, w1], [1, w2]], 4, { extras: { 2: { maceBehind: true }, 3: { maceBehind: true } } }), 7, false),
    strike: new Animation(track(S, [[0, s1], [0.25, s2, snap], [0.6, s3], [1, s4]], 5, {
      extras: { 0: { smear: [-2.4, -0.9] }, 1: { fx: 'impact', smear: [-1.6, 0.75], impact: 8 }, 2: { impact: 12 } },
    }), 12, false),
    hurt: new Animation(track(S, [[0, hurtP], [1, knp({ lean: 0 })]], 2, { extras: { 0: { hurt: true } } }), 8, false),
    death: new Animation([
      ...track(S, [[0, hurtP], [0.3, d1], [0.65, d2, snap], [1, d3]], 4, { extras: { 0: { hurt: true }, 2: { fx: 'impact' } } }),
      still(S, (p, g) => drawKnightFallen(p, g, 0), 'impact'),
      still(S, (p, g) => drawKnightFallen(p, g, 0.5)),
      still(S, (p, g) => drawKnightFallen(p, g, 1)),
    ], 7, false),
  }, KNIGHT_RIM);
}


// ================================================================ Magmaschlange

const MS = { W: 92, H: 60, AX: 40, AY: 54, rim: RIM_WARM };
const MS_REST = {
  bx: 0, rise: 0.7, coil: 0, nx: 0, ny: 0, head: 0.25, jaw: 0.05, throat: 0.5, wave: 0, amp: 1.5, hood: 0.3, heat: 1, tail: 0,
};
const msp = (o) => ({ ...MS_REST, ...o });

const qbez = (a, c, b, t) => ({ x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x, y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y });

// Wirbelsäule der Schlange als Punktliste mit Radius
function serpentSpine(P, gy, AX) {
  const pts = [];
  const N = 30;
  const cx = AX - 9 + P.bx * 0.5, cy = gy - 7;
  // v: 0 = Halsansatz … 1 = Schwanzspitze. Der Leib liegt in gut einer
  // Windung am Boden (Spirale, zweite Lage etwas höher und enger), die
  // Schwanzspitze läuft nach hinten links aus. d = Tiefe (+1 vorn).
  for (let i = N; i >= 0; i--) {
    const v = i / N;
    const th = v * Math.PI * 2.25 + P.coil;
    const rip = Math.sin(P.wave + v * 9) * P.amp * 0.5;
    let rx = 17 - v * 5 + rip, ry = 6 - v * 1.5;
    let x = cx + Math.cos(th) * rx, y = cy + Math.sin(th) * ry - v * 5;
    // Schwanzspitze: löst sich aus der Windung nach links
    if (v > 0.78) { const k = (v - 0.78) / 0.22; x -= k * k * 10; y += k * 3; }
    pts.push({ x, y, r: 0.8 + 5.6 * (1 - v) ** 0.55 * (v > 0.75 ? 1 - (v - 0.75) * 2.8 : 1), v, d: Math.sin(th) + v * 1.3 });
  }
  const base = pts[pts.length - 1];
  const C = { x: base.x + 6, y: gy - 13 - P.rise * 8 };
  const H = { x: base.x + 5 + P.nx, y: gy - 30 - P.rise * 12 + P.ny };
  const M = 11;
  for (let i = 1; i <= M; i++) {
    const t = i / M, q = qbez(base, C, H, t);
    pts.push({ x: q.x, y: q.y, r: 6 - t * 1.9, neck: t });
  }
  return pts;
}

// Ein Leibsegment: Kruste, glühende Bauchnaht, Magmaringe zwischen den Schuppenringen
function serpentSeg(p, g, a, b, i, crust, heat, thr) {
  cap(p, a.x, a.y, b.x, b.y, a.r, b.r, crust, { noise: 0.09, seed: 60 + (i % 5) });
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
  let nx = -dy / d, ny = dx / d; if (ny < 0) { nx = -nx; ny = -ny; }
  const hh = heat * (b.neck != null ? 0.8 + thr * 0.45 : 0.85);
  const c = hh > 1.2 ? 4 : hh > 0.8 ? 3 : hh > 0.4 ? 2 : 1;
  for (let t = 0; t < 1; t += 0.5) {
    const r = a.r + (b.r - a.r) * t;
    if (r < 1.5) continue;
    const x = a.x + dx * t + nx * (r - 1), y = a.y + dy * t + ny * (r - 1);
    p.px(x, y, BELLY[c]); p.px(x - nx, y - ny, BELLY[c - 1]);
    if (heat > 0.25) { g.px(x, y, GLOW[Math.min(4, c - 1)]); if (c > 2) g.px(x - nx, y - ny, GLOW[c - 3]); }
  }
  // Krustenrisse (unregelmäßig, Schuppenfugen)
  if (a.r > 2.4 && hash2(i, 5, 62) < 0.7) {
    const cc = heat > 1.15 ? 3 : heat > 0.5 ? 2 : 0;
    const k0 = (hash2(i, 6, 62) - 0.7) * a.r;
    const x = a.x + nx * k0, y = a.y + ny * k0;
    const L = 2 + Math.floor(hash2(i, 7, 62) * 2);
    for (let s = 0; s < L; s++) {
      const qx = x + dx / d * s * 0.8 + nx * (s % 2) * 0.6, qy = y + dy / d * s * 0.8 + ny * (s % 2) * 0.6;
      p.px(qx, qy, cc ? LAVA[cc - (s === 0 ? 1 : 0)] : CRUST[0]);
      if (cc) g.px(qx, qy, GLOW[Math.max(0, cc - 2)]);
    }
  }
}

// Fein: Details der Leibsegmente werden nach allen Windungen gezeichnet (sonst übermalt das nächste, stark
// überlappende Segment sie) – aber nur auf Texeln, die nicht von einer weiter vorn liegenden Windung stammen
// (Besitzer-Tiefe je Texel aus scan(), OWN). So bleiben Nähte zusammenhängend und scheinen nicht durch.
let OWN = null;
const OWN_EPS = 0.35;
// Feine Linie im Texelraster mit Tiefenprüfung; w >= 1 → 2×2-Pinsel (wie fline mit Stärke 1)
function oline(p, g, x0, y0, x1, y1, c, gc, w, key, own) {
  const r = p.res, W = p.W, H = p.H, pb = p.buf, gb = g.buf;
  const v = c ? col32(c) : 0, gv = gc ? col32(gc) : 0, k = w >= 1 ? 2 : 1, lim = key + OWN_EPS;
  let a = Math.floor((x0 + p.ox) * r + 1e-6), b = Math.floor((y0 + p.oy) * r + 1e-6);
  const a1 = Math.floor((x1 + p.ox) * r + 1e-6), b1 = Math.floor((y1 + p.oy) * r + 1e-6);
  const dx = Math.abs(a1 - a), dy = -Math.abs(b1 - b), sx = a < a1 ? 1 : -1, sy = b < b1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) {
      const X = a + i, Y = b + j;
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const idx = Y * W + X;
      if (own[idx] > lim) continue;
      if (v) pb[idx] = v;
      if (gv) gb[idx] = gv;
    }
    if (a === a1 && b === b1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; a += sx; }
    if (e2 <= dx) { err += dx; b += sy; }
  }
  p.dirty = true; g.dirty = true;
}
// Glutlinie (Saum 2 Feinpixel + Kern 1 Feinpixel) mit Tiefenprüfung – wie hotLine
function ohot(p, g, x0, y0, x1, y1, saum, core, gc, gcore, key, own) {
  oline(p, g, x0 + 0.25, y0 + 0.25, x1 + 0.25, y1 + 0.25, saum, gc, 1, key, own);
  oline(p, g, x0 + 0.25, y0 + 0.25, x1 + 0.25, y1 + 0.25, core, gcore, 0, key, own);
}

// Bauchnaht mit heißem Kern, Krustenplatten mit dunkler Fuge und Lichtkante (jede sechste Lage; volle Glut nur
// auf der Oberseite), seltene gerade Krustenrisse.
function serpentSegFine(p, g, a, b, i, crust, heat, thr, key, own) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
  let nx = -dy / d, ny = dx / d; if (ny < 0) { nx = -nx; ny = -ny; }
  const hh = heat * (b.neck != null ? 0.8 + thr * 0.45 : 0.85);
  const c = hh > 1.2 ? 4 : hh > 0.8 ? 3 : hh > 0.4 ? 2 : 1;
  const ux = dx / d, uy = dy / d;
  if (Math.max(a.r, b.r) >= 1.5) {
    const ra = Math.max(a.r, 1.5), rb = Math.max(b.r, 1.5);
    const lines = [[0.25, BELLY[c], heat > 0.25 ? GLOW[Math.min(4, c - 1)] : null], [0.75, BELLY[Math.min(5, c + 1)], heat > 0.25 ? GLOW[Math.min(4, c)] : null]];
    if (a.r > 3) lines.push([1.25, BELLY[c - 1], null]);
    const nearHead = b.neck != null && b.neck > 0.8;   // der Kopf deckt das ab – dort keine Glut durchscheinen lassen
    for (const [k, col, gc] of lines) oline(p, g, a.x + nx * (ra - k), a.y + ny * (ra - k), b.x + nx * (rb - k), b.y + ny * (rb - k), col, nearHead ? null : gc, 0, key, own);
  }
  if (a.r > 2 && i % 6 === 3) {
    const r = a.r, x0 = a.x - nx * (r - 0.4), y0 = a.y - ny * (r - 0.4), x1 = a.x + nx * (r - 1.7), y1 = a.y + ny * (r - 1.7);
    const xm = a.x + nx * r * 0.1, ym = a.y + ny * r * 0.1;
    if (heat > 0.6) {
      const cc = heat > 1.15 ? 3 : 2;
      ohot(p, g, x0 - 0.25 + nx * 0.5, y0 - 0.25 + ny * 0.5, xm - 0.25, ym - 0.25, LAVA[cc - 1], LAVA[cc + 1], GLOW[cc - 2], GLOW[cc], key, own);
      oline(p, g, xm, ym, x1, y1, LAVA[1], null, 0, key, own);
      oline(p, g, xm + ux * 0.5, ym + uy * 0.5, x1 + ux * 0.5, y1 + uy * 0.5, LAVA[0], null, 0, key, own);
    } else oline(p, g, x0, y0, x1, y1, crust[0], null, 0, key, own);
    oline(p, g, x0 + ux * 0.5, y0 + uy * 0.5, (x0 + xm) / 2 + ux * 0.5, (y0 + ym) / 2 + uy * 0.5, crust[5] ?? crust[4], null, 0, key, own);
  }
  if (a.r > 2.4 && hash2(i, 5, 62) < 0.12) {
    const k0 = (hash2(i, 6, 62) - 0.7) * a.r;
    const top = k0 < 0, cc = heat > 1.15 ? 3 : heat > 0.5 ? 2 : 0;
    const x = a.x + nx * k0, y = a.y + ny * k0, L = 1.5 + hash2(i, 7, 62) * 1.2;
    if (cc && top) ohot(p, g, x - 0.25, y - 0.25, x + ux * L - 0.25, y + uy * L - 0.25, LAVA[cc - 1], LAVA[cc + 1], GLOW[Math.max(0, cc - 2)], GLOW[cc], key, own);
    else oline(p, g, x, y, x + ux * L, y + uy * L, cc ? LAVA[0] : CRUST[0], null, 0, key, own);
  }
}

function drawSerpent(p, g, P, ex) {
  const { AX, AY } = MS;
  const meta = {};
  const gy = AY;
  const heat = P.heat, thr = P.throat;
  const pts = serpentSpine(P, gy, AX);
  const cool = clamp(1 - heat, 0, 1); // 1 = erkaltet (Tod)
  const crust = cool > 0.5 ? CRUST_D : CRUST;
  // Reihenfolge: Windungen nach Tiefe (hinten zuerst), Hals zuletzt
  const order = [];
  for (let i = 0; i < pts.length - 1; i++) order.push(i);
  const key = (i) => (pts[i + 1].neck != null ? 99 : (pts[i].d + pts[i + 1].d) / 2);
  order.sort((x, y) => key(x) - key(y));
  if (p.fine) {
    // fein: erst alle Windungen (Tiefe je Texel merken), dann die Details mit Tiefenprüfung
    const own = new Float32Array(p.W * p.H).fill(-Infinity);
    OWN = { buf: own, key: 0 };
    for (const i of order) { const a = pts[i], b = pts[i + 1]; OWN.key = key(i); cap(p, a.x, a.y, b.x, b.y, a.r, b.r, crust, { noise: 0.09, seed: 60 + (i % 5) }); }
    OWN = null;
    for (const i of order) serpentSegFine(p, g, pts[i], pts[i + 1], i, crust, heat, thr, key(i), own);
  } else for (const i of order) serpentSeg(p, g, pts[i], pts[i + 1], i, crust, heat, thr);
  // Rückenplatten aus Obsidian entlang des Rückens
  for (let i = 0; i < pts.length - 2; i += 3) {
    const a = pts[i], b = pts[i + 1];
    if (a.neck == null) continue;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    let nx = -dy / d, ny = dx / d; if (ny > 0) { nx = -nx; ny = -ny; }
    const h = 1.5 + a.r * 0.3;
    const bx = a.x + nx * (a.r - 1), by = a.y + ny * (a.r - 1);
    poly(p, [[bx - dx / d * 1.5, by - dy / d * 1.5], [bx + nx * h - dx / d * 1.5, by + ny * h - dy / d * 1.5], [bx + dx / d * 1.5, by + dy / d * 1.5]], OBS[3]);
    if (p.fine) p.fline(bx - dx / d * 1.2, by - dy / d * 1.2, bx + nx * (h - 0.5) - dx / d * 1.2, by + ny * (h - 0.5) - dy / d * 1.2, OBS_SHINE);
    else p.px(bx + nx * (h - 1) - dx / d, by + ny * (h - 1) - dy / d, OBS_SHINE);
  }
  // Tropfendes Magma unter dem Bauch
  for (let i = 0; i < 3 && heat > 0.5; i++) {
    const a = pts[7 + i * 3];
    if (a.y + a.r < gy - 3) continue;
    if (p.fine) { p.dot(a.x, a.y + a.r, LAVA[4]); p.dot(a.x, a.y + a.r + 0.5, LAVA[3]); p.dot(a.x + 0.5, a.y + a.r, LAVA[2]); g.dot(a.x, a.y + a.r, GLOW[3]); g.dot(a.x, a.y + a.r + 0.5, GLOW[2]); continue; }
    p.px(a.x, a.y + a.r, LAVA[3]); g.px(a.x, a.y + a.r, GLOW[2]); p.px(a.x + 1, a.y + a.r, LAVA[2]);
  }
  const neckMid = pts[pts.length - 6];
  meta.throat = { x: neckMid.x + 3, y: neckMid.y + 3 };
  if (thr > 0.9) glowDot(g, neckMid.x + 2, neckMid.y + 3, thr * 1.4);

  // --- Kopf
  const H = pts[pts.length - 1];
  const ha = P.head;
  const hc = Math.cos(ha), hs = Math.sin(ha);
  const T = (u, v) => [H.x + (u * hc - v * hs) * 1.25, H.y + (u * hs + v * hc) * 1.25];
  // Kragen (Kobra-Haube): breite Krustenplatte hinter dem Kopf, gespreizt
  // durch hood; innen glühende Zeichnung
  const hood = P.hood;
  const nk = pts[pts.length - 4];
  const hw = 2 + hood * 3, hh = 5.5 + hood * 2.8;
  const hcx = (nk.x + H.x) / 2 - 1.5, hcy = (nk.y + H.y) / 2 + 0.5;
  const hr = Math.atan2(H.y - nk.y, H.x - nk.x) + Math.PI / 2;
  ell(p, hcx - 1, hcy, hw + 1, hh, crust, { rot: hr, noise: 0.07, seed: 72, bias: 0.1 });
  if (hood > 0.2) {
    // Innenhaut der Haube: dunkelrote Membran mit Glutadern
    const iw = hw - 0.6, ih = hh - 1.6;
    ell(p, hcx, hcy + 0.5, iw, ih, heat > 0.3 ? [BELLY[0], BELLY[0], BELLY[1]] : CRUST_D, { rot: hr, bias: -0.1 });
    if (heat > 0.3) {
      const hotc = thr > 1 ? 4 : 3;
      for (const sgn of [-1, 1]) {
        const qx = hcx + 0.5, qy = hcy + sgn * ih * 0.45;
        p.px(qx, qy, LAVA[hotc]); p.px(qx - 1, qy, LAVA[hotc - 1]); g.px(qx, qy, GLOW[hotc]); g.px(qx - 1, qy, GLOW[2]);
        if (p.fine) { p.dot(qx + 0.25, qy + 0.25, LAVA[5]); g.dot(qx + 0.25, qy + 0.25, GLOW[4]); }
      }
      if (p.fine) {
        // fein: Aderngeflecht der Haubenmembran (feine Glutlinien, verzweigt)
        for (let j = -ih + 1; j <= ih - 1; j += 1.5) {
          const sg = Math.sign(j) || 1, w = hash2(2, Math.round(j * 2), 73);
          p.fline(hcx - 0.25, hcy + j, hcx + (w - 0.5) * iw * 0.9, hcy + j + sg * 1.2, LAVA[1]);
          g.dot(hcx - 0.25, hcy + j, GLOW[0]);
        }
        p.fline(hcx, hcy - ih + 1, hcx, hcy + ih - 1, LAVA[2]); g.fline(hcx, hcy - ih + 1, hcx, hcy + ih - 1, GLOW[0]);
      } else for (let j = -ih + 1; j <= ih - 1; j += 1) if (hash2(1, Math.round(j), 73) < 0.6) { p.px(hcx - 0.5, hcy + j, LAVA[1]); g.px(hcx - 0.5, hcy + j, GLOW[0]); }
      fillEll(g, hcx, hcy, iw, ih, GLOW[0]);
    }
  }
  ln(p, hcx - hw - 1, hcy - hh + 2, hcx - hw, hcy + hh - 2, OBS[3], 1);
  ell(p, H.x, H.y, 5.2, 4.6, crust, { noise: 0.07, seed: 70, bias: 0.05 });
  // Oberkiefer: breiter Keil
  poly(p, [T(-1, -3.4), T(5, -2.6), T(9.5, -0.8), T(9.5, 0.8), T(0, 1.2)], (x, y) => (y < T(4, -1.5)[1] ? crust[4] : crust[3]));
  if (p.fine) {
    // fein: Lichtkante des Oberkiefers, Schuppenreihe, Nüster als Kerbe
    p.fline(...T(-0.5, -3.1), ...T(6.5, -2.3), crust[5]); p.fline(...T(6.5, -2.3), ...T(9.2, -0.7), crust[4]);
    p.fline(...T(1, -1.6), ...T(8.5, 0.1), crust[2]);
    for (let u = 1.5; u < 8; u += 1.6) { const q = T(u, -2.2); p.dot(q[0], q[1], crust[2]); }
    const nos = T(8.4, -0.9); p.dot(nos[0], nos[1], VOID); p.dot(nos[0] + 0.5, nos[1], VOID); p.dot(nos[0], nos[1] - 0.5, crust[5]);
  } else {
    p.line(...T(0, -3.2), ...T(6, -2.4), crust[5]);
    const nos = T(8.5, -0.8); p.px(nos[0], nos[1], VOID);
  }
  // Maul
  const ja = P.jaw * 0.75;
  const jc = Math.cos(ha + ja), js = Math.sin(ha + ja);
  const J = (u, v) => [H.x + (u * jc - v * js) * 1.25, H.y + 1.7 + (u * js + v * jc) * 1.25];
  if (P.jaw > 0.1) {
    poly(p, [T(1, 1.2), T(9, 0.8), J(8.5, 0), J(1, 0)], LAVA[3]);
    poly(p, [T(2, 1.2), T(7, 1), J(6, -0.3)], LAVA[5]);
    for (let u = 1; u < 9; u++) { const q = J(u, -0.4); g.px(q[0], q[1], GLOW[3]); const q2 = T(u, 1.3); g.px(q2[0], q2[1], GLOW[u < 6 ? 4 : 2]); }
  }
  poly(p, [J(0, 0), J(8.5, 0), J(8, 1.8), J(0, 2.2)], crust[2]);
  const jl = J(1, 2); const jr = J(7, 1.6);
  if (p.fine) hotLine(p, g, jl[0], jl[1], jr[0], jr[1], BELLY[heat > 0.5 ? 1 : 0], BELLY[heat > 0.5 ? 3 : 1], heat > 0.5 ? GLOW[1] : null, heat > 0.5 ? GLOW[2] : null);
  else { p.line(jl[0], jl[1], jr[0], jr[1], BELLY[heat > 0.5 ? 2 : 0]); if (heat > 0.5) g.line(jl[0], jl[1], jr[0], jr[1], GLOW[1]); }
  // Giftzähne
  if (p.fine) {
    // fein: Fangzahn oben (3 Feinpixel, Spitze hell) und kleine Zahnreihe
    const bn = PAL.bone;
    for (const u of [7.5]) { const a = T(u, 1.2), b = J(u, 0); p.dot(a[0], a[1] + 0.5, bn[2]); p.dot(a[0], a[1] + 1, bn[3]); p.dot(a[0], a[1] + 1.5, bn[4]); p.dot(b[0], b[1] - 0.5, bn[2]); p.dot(b[0], b[1] - 1, bn[3]); }
    for (let u = 3; u < 7; u += 1) { const a = T(u, 1.25); p.dot(a[0], a[1] + 0.5, bn[2]); }
  } else for (const u of [7.5]) { const a = T(u, 1.2), b = J(u, 0); p.px(a[0], a[1] + 1, PAL.bone[3]); p.px(b[0], b[1] - 1, PAL.bone[2]); }
  // Magmatropfen vom Kinn
  if (heat > 0.6) {
    const d = J(3, 2.4); const L = 1 + Math.floor(((P.wave * 0.8) % 1) * 3);
    if (p.fine) { for (let k = 0; k < L; k += 0.5) { p.dot(d[0] + 0.5, d[1] + k, k + 0.5 >= L ? LAVA[5] : LAVA[3]); p.dot(d[0], d[1] + k, LAVA[2]); g.dot(d[0] + 0.5, d[1] + k, GLOW[3]); } }
    else for (let k = 0; k < L; k++) { p.px(d[0], d[1] + k, LAVA[4 - (k > 1 ? 1 : 0)]); g.px(d[0], d[1] + k, GLOW[2]); }
  }
  const m = T(10, 1 + P.jaw * 2.5);
  meta.mouth = { x: m[0], y: m[1] };
  // Auge mit Brauenwulst
  const e = T(3, -1.8);
  const ec = ex.hurt ? '#ffffff' : heat < 0.3 ? CRUST[1] : LAVA[5];
  p.rect(e[0] - 1, e[1] - 1, 4, 3, VOID);                                   // Augenhöhle
  if (p.fine) {
    // Handfein: mandelförmiges Glutauge mit senkrechter Schlitzpupille und Glanzpunkt
    const E0 = Math.round(e[0]), E1 = Math.round(e[1]), cold = heat < 0.3;
    const row = cold ? [CRUST[1], CRUST[1], CRUST[2], CRUST[2], CRUST[1], CRUST[1]] : [LAVA[2], LAVA[3], LAVA[4], ec, LAVA[4], LAVA[3]];
    for (let k = 0; k < 6; k++) p.dot(E0 - 1 + k * 0.5 + 0.25, E1 + 0.25, row[k]);
    for (let k = 1; k < 5; k++) p.dot(E0 - 1 + k * 0.5 + 0.25, E1 + 0.75, cold ? CRUST[1] : LAVA[k === 2 || k === 3 ? 3 : 2]);
    p.dot(E0 + 0.75, E1 - 0.25, cold ? CRUST[1] : LAVA[2]);
    if (!cold) { p.dot(E0 + 0.75, E1 + 0.25, VOID); p.dot(E0 + 0.75, E1 + 0.75, VOID); p.dot(E0 + 0.25, E1 + 0.25, '#ffffff'); }
  } else { p.px(e[0], e[1], ec); p.px(e[0] + 1, e[1], heat < 0.3 ? CRUST[1] : LAVA[4]); p.px(e[0] - 1, e[1], heat < 0.3 ? CRUST[1] : LAVA[2]); }
  if (heat >= 0.3) { g.px(e[0], e[1], GLOW[4]); g.px(e[0] + 1, e[1], GLOW[3]); g.px(e[0] - 1, e[1], GLOW[1]); g.px(e[0], e[1] + 1, GLOW[1]); }
  const br = T(1.5, -3.4);
  if (p.fine) {
    // fein: Brauenwulst als Obsidiankante mit Glanzlinie, Schädelschuppen mit Lichtkante und Schattenfuge
    p.fline(br[0], br[1] + 0.5, br[0] + 4.5 * hc, br[1] + 4.5 * hs + 0.5, OBS[3], 1);
    p.fline(br[0], br[1], br[0] + 3.5 * hc, br[1] + 3.5 * hs, OBS[5]); p.dot(br[0] + 0.5, br[1] - 0.5, OBS_SHINE);
    for (const u of [-1.5, 1, 3.5]) { const q = T(u, -4); p.fline(q[0], q[1], q[0] + 1.5, q[1] + 0.25, crust[5]); p.fline(q[0], q[1] + 0.5, q[0] + 1.5, q[1] + 0.75, crust[1]); p.dot(q[0], q[1], crust[5]); }
  } else {
    p.line(br[0], br[1], br[0] + 4 * hc, br[1] + 4 * hs, OBS[4]);
    p.line(br[0], br[1] - 1, br[0] + 3 * hc, br[1] + 3 * hs - 1, OBS[5] ?? OBS_SHINE);
    // Schuppenplatten auf dem Schädel (helle Kanten oben)
    for (const u of [-1.5, 1, 3.5]) { const q = T(u, -4); p.px(q[0], q[1], crust[5]); p.px(q[0] + 1, q[1], crust[4]); }
  }
  meta.eye = { x: e[0], y: e[1] };
  meta.head = { x: H.x, y: H.y - 7 };

  if (ex.smear) arcSmear(p, g, H.x - 6, H.y + 2, ex.smear[0], ex.smear[1], 8, 15, SMEAR, 71, false);
  if (ex.breath) {
    const k = ex.breath;
    for (let i = 0; i < 4; i++) {
      const r = 0.9 + i * 0.55;
      const x = m[0] + Math.cos(ha + 0.25) * (1 + i * 2.4), y = m[1] + Math.sin(ha + 0.25) * (1 + i * 2.4) + Math.sin(k * 2 + i * 1.7) * 0.8;
      ell(p, x, y, r, r * 0.8, [LAVA[2], LAVA[3], LAVA[4], LAVA[5]], { bias: 0.15 });
      glowDot(g, x, y, r);
    }
  }
  return meta;
}

// Erkaltete Schlange: flach am Boden, Kruste grau, Glut erlischt
function drawSerpentDead(p, g, k) {
  const P = msp({ rise: -0.6, nx: 6, ny: 13, head: 0.05, jaw: 0.5, throat: 0.3 * (1 - k), heat: 0.9 - k * 0.85, amp: 2, wave: 1.3, hood: 0 });
  return drawSerpent(p, g, P, {});
}

function createSerpent() {
  const S = { ...MS, draw: drawSerpent };
  const idle = cycle((ph) => {
    const s = Math.sin(ph), c = Math.cos(ph);
    return msp({ rise: 0.5 + s * 0.06, nx: c * 1.2, ny: -s * 0.8, head: 0.25 + s * 0.05, wave: ph * 0.5, tail: ph, amp: 1.5, throat: 0.5 + Math.max(0, s) * 0.4, jaw: Math.max(0, -s) * 0.25, hood: 0.3 + Math.max(0, s) * 0.15 });
  }, 6);
  const walk = cycle((ph) => {
    const s = Math.sin(ph);
    return msp({ rise: 0.3, nx: 2 + s * 1.5, ny: 2 + Math.cos(ph * 2) * 0.6, head: 0.2, wave: ph * 2, amp: 2.6, throat: 0.6, hood: 0.15, bx: s * 1 });
  }, 8);
  // Ausholen: aufrichten, Kragen spreizen, Kehle glüht
  const w1 = msp({ rise: 0.9, nx: -3, ny: -2, head: 0.05, jaw: 0.35, throat: 1.1, hood: 0.8, amp: 1.2, wave: 0.6, bx: -1 });
  const w2 = msp({ rise: 1.2, nx: -6, ny: -3, head: -0.15, jaw: 0.6, throat: 1.5, hood: 1.2, amp: 1, wave: 1, bx: -2 });
  // Biss: nach vorn schnellen
  const s1 = msp({ rise: 0.5, nx: 10, ny: 3, head: 0.35, jaw: 1.1, throat: 1.2, hood: 0.9, wave: 1.3, bx: 3 });
  const s2 = msp({ rise: 0.2, nx: 15, ny: 8, head: 0.5, jaw: 0.1, throat: 1, hood: 0.6, wave: 1.5, bx: 5 });
  const s3 = msp({ rise: 0.35, nx: 8, ny: 4, head: 0.3, jaw: 0.25, throat: 0.8, hood: 0.4, wave: 1.8, bx: 2 });
  // Feueratem (Loop): Kopf vor, Maul weit offen
  const breath = cycle((ph) => {
    const s = Math.sin(ph);
    return msp({ rise: 0.55, nx: 7, ny: 3 + s * 0.4, head: 0.3 + s * 0.03, jaw: 1 + s * 0.1, throat: 1.6 + s * 0.2, hood: 1 + s * 0.1, wave: ph * 0.5, amp: 1.2, bx: 2 });
  }, 4);
  const hurtP = msp({ rise: 0.9, nx: -6, ny: -1, head: -0.35, jaw: 0.9, throat: 1.3, hood: 1, wave: 0.4, bx: -3 });
  const d1 = msp({ rise: 1.1, nx: -7, ny: -3, head: -0.5, jaw: 1, throat: 1.2, hood: 1.1, wave: 0.8, bx: -3 });
  const d2 = msp({ rise: -0.2, nx: 4, ny: 9, head: 0.2, jaw: 0.7, throat: 0.6, hood: 0.3, wave: 1.2, amp: 2, heat: 0.95 });
  return {
    idle: new Animation(track(S, idle, 6, { loop: true }), 6),
    walk: new Animation(track(S, walk, 8, { loop: true }), 11),
    windup: new Animation(track(S, [[0, idle[0][1]], [0.5, w1], [1, w2]], 4), 7, false),
    strike: new Animation(track(S, [[0, s1], [0.3, s2, snap], [1, s3]], 4, {
      extras: { 0: { smear: [-1.4, 0.2] }, 1: { fx: 'impact', smear: [-0.8, 0.9] } },
    }), 13, false),
    breath: new Animation(track(S, breath, 4, { loop: true, extras: { 0: { breath: 1 }, 1: { breath: 2 }, 2: { breath: 3 }, 3: { breath: 4 } } }), 10),
    hurt: new Animation(track(S, [[0, hurtP], [1, msp({ rise: 0.6, nx: -2, jaw: 0.3 })]], 2, { extras: { 0: { hurt: true } } }), 10, false),
    death: new Animation([
      ...track(S, [[0, hurtP], [0.4, d1], [1, d2]], 3, { extras: { 0: { hurt: true } } }),
      still(S, (p, g) => drawSerpentDead(p, g, 0), 'impact'),
      still(S, (p, g) => drawSerpentDead(p, g, 0.5)),
      still(S, (p, g) => drawSerpentDead(p, g, 1)),
    ], 8, false),
  };
}


// ================================================================ Glutadept

const AD = { W: 52, H: 50, AX: 24, AY: 45, rim: RIM_WARM };
const AD_REST = {
  bob: 0, lean: 0, hem: 0, stepA: 0, stepB: 0, head: 0, headY: 0,
  hFx: 7, hFy: 7, hBx: -5, hBy: 8, ball: 1.2, orb: 0, halo: 1, eye: 1, glyph: 0, sleeve: 0,
};
const adp = (o) => ({ ...AD_REST, ...o });

// Fein: Goldsaum am Ärmelende – Doppellinie quer zum Unterarm (a → b), Breite r
function goldCuff(p, ax, ay, bx, by, r, hi, lo) {
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, nx = -uy, ny = ux;
  const cx = bx - ux * 0.6, cy = by - uy * 0.6;
  p.fline(cx - nx * r, cy - ny * r, cx + nx * r, cy + ny * r, hi);
  p.fline(cx - nx * r + ux * 0.5, cy - ny * r + uy * 0.5, cx + nx * r + ux * 0.5, cy + ny * r + uy * 0.5, lo);
  p.dot(cx - nx * r * (ny < 0 ? -1 : 1) * 0.6, cy - ny * r * (ny < 0 ? -1 : 1) * 0.6, GOLD[5]);
}

function drawAdept(p, g, P, ex) {
  const { AX, AY } = AD;
  const meta = {};
  const gy = AY;
  const top = gy - 20 + P.bob;
  const x = AX + P.lean * 2;
  const sh = { x: x + 1 + P.lean * 3, y: top + 1 };
  const hx = sh.x + 1 + P.head, hy = top - 5 + P.headY;

  // Bodenglyphe (Glutfeld-Beschwörung)
  if (P.glyph > 0.05) {
    const r = 6 + P.glyph * 9;
    if (p.fine) {
      // fein: Glutring als geschlossene Feinlinie mit Lücken je Bogenstück, innen heller Kern
      for (let a = 0; a < Math.PI * 2; a += 0.03) {
        if (hash2(Math.round(a * 30 / 4), 1, 81) < 0.25) continue;
        const qx = AX + 6.5 + Math.cos(a) * r, qy = gy + 0.5 + Math.sin(a) * r * 0.45;
        p.dot(qx, qy, LAVA[P.glyph > 0.7 ? 3 : 2]); g.dot(qx, qy, GLOW[P.glyph > 0.7 ? 3 : 2]);
        const ix = AX + 6.5 + Math.cos(a) * (r - 0.6), iy = gy + 0.5 + Math.sin(a) * (r - 0.6) * 0.45;
        p.dot(ix, iy, LAVA[P.glyph > 0.7 ? 5 : 4]); g.dot(ix, iy, GLOW[4]);
      }
    } else for (let a = 0; a < Math.PI * 2; a += 0.09) {
      const qx = AX + 6 + Math.cos(a) * r, qy = gy + Math.sin(a) * r * 0.45;
      if (hash2(Math.round(a * 30), 1, 81) < 0.25) continue;
      p.px(qx, qy, LAVA[P.glyph > 0.7 ? 4 : 3]); g.px(qx, qy, GLOW[P.glyph > 0.7 ? 3 : 2]);
    }
    for (let k = 0; k < 5; k++) {
      const a = k * 1.2566 + P.glyph, qx = AX + 6 + Math.cos(a) * r * 0.6, qy = gy + Math.sin(a) * r * 0.27;
      p.px(qx, qy, LAVA[4]); g.px(qx, qy, GLOW[3]);
    }
  }

  // Schwebendes Glutbuch hinter der Schulter (aufgeschlagen, Seiten glühen,
  // Funken steigen auf). Hebt sich beim Wirken (halo) und wippt mit orb.
  const book = () => {
    const bx0 = Math.round(sh.x - 17 - P.lean * 2), by0 = Math.round(top - 7 + Math.sin(P.orb) * 1.5 - (P.halo - 1) * 4);
    const hot = P.halo > 1.3;
    // Glutschein unter dem Buch
    for (let i = 0; i < 3; i++) g.px(bx0 + 3 + i, by0 + 5 + (i === 1 ? 1 : 0), GLOW[1]);
    // Einband (Leder, Goldecken), Unterseite
    p.rect(bx0, by0 + 2, 9, 2, ROBE[3]); p.rect(bx0, by0 + 3, 9, 1, ROBE[1]);
    p.px(bx0, by0 + 2, GOLD[3]); p.px(bx0 + 8, by0 + 2, GOLD[3]); p.px(bx0 + 4, by0 + 3, GOLD[4]);
    // Seiten als flaches V (Mittelfalz tiefer)
    for (let i = 1; i <= 7; i++) {
      const d = Math.abs(i - 4), yt = by0 + (d === 0 ? 2 : d === 1 ? 1 : 0);
      for (let yy = yt; yy <= by0 + 1 + (d === 0 ? 1 : 0); yy++) p.px(bx0 + i, yy, d === 0 ? '#8a6a40' : i < 4 ? '#e8d4a8' : '#f4e6c0');
    }
    if (p.fine) {
      // fein: Schriftzeilen, Seitenkante, Goldecken mit Glanz
      for (let i = 1.5; i < 7.5; i += 1) if (Math.abs(i - 4) > 0.6) for (let yy = 0.25; yy < 1.5; yy += 0.5) if (hash2(Math.floor(i * 2), Math.floor(yy * 2), 92) < 0.55) p.dot(bx0 + i + 0.25, by0 + yy + (Math.abs(i - 4) < 1.6 ? 0.5 : 0), '#8a6a40');
      p.fline(bx0 + 4.25, by0 + 1.25, bx0 + 4.25, by0 + 2.75, '#5a3a20');
      p.dot(bx0 + 0.25, by0 + 2.25, GOLD[5]); p.dot(bx0 + 8.25, by0 + 2.25, GOLD[4]); p.fline(bx0 + 0.25, by0 + 3.75, bx0 + 8.75, by0 + 3.75, ROBE[0]);
    }
    // Glutrunen auf den Seiten
    for (const [i, yy] of [[2, 1], [6, 0], [3, 0]]) {
      if (p.fine) { p.dot(bx0 + i + 0.25, by0 + yy + 0.25, LAVA[hot ? 5 : 4]); p.dot(bx0 + i + 0.75, by0 + yy + 0.25, LAVA[3]); p.dot(bx0 + i + 0.25, by0 + yy + 0.75, LAVA[2]); g.dot(bx0 + i + 0.25, by0 + yy + 0.25, GLOW[hot ? 4 : 3]); g.dot(bx0 + i + 0.75, by0 + yy + 0.25, GLOW[2]); continue; }
      p.px(bx0 + i, by0 + yy, LAVA[hot ? 5 : 4]); g.px(bx0 + i, by0 + yy, GLOW[hot ? 4 : 3]);
    }
    // Lesebändchen
    p.px(bx0 + 6, by0 + 4, LAVA[2]); p.px(bx0 + 6, by0 + 5, LAVA[1]);
    // Flämmchen und Funken aus dem Falz
    flame(p, g, bx0 + 4, by0 + 1, 2 + Math.round(P.halo * 1.5), 0.8 + (P.halo - 1) * 0.6, P.orb * 2, { lean: -0.2, seed: 91, hot: 0.6 });
    for (let i = 0; i < 3; i++) {
      const f = ((P.orb / (Math.PI * 2)) * 2 + i / 3) % 1;
      const qx = bx0 + 3 + i * 1.5 + Math.sin(P.orb * 2 + i) * 1.2, qy = by0 - 2 - f * 7;
      if (f < 0.85) { p.px(qx, qy, LAVA[f < 0.4 ? 5 : 3]); g.px(qx, qy, GLOW[f < 0.4 ? 4 : 2]); }
    }
    if (hot) glowDot(g, bx0 + 4, by0, 2);
  };
  book();

  // Füße
  p.rect(AX - 3 + P.stepB, gy - 2, 4, 2, ROBE_CH[1]);
  // hinterer Arm (weiter Ärmel)
  const hB = { x: sh.x + P.hBx, y: sh.y + P.hBy };
  cap(p, sh.x - 3, sh.y + 1, hB.x, hB.y, 2, 2.8 + P.sleeve * 0.5, ROBE.slice(0, 4));
  if (p.fine) goldCuff(p, sh.x - 3, sh.y + 1, hB.x, hB.y, 2.6 + P.sleeve * 0.5, GOLD[3], GOLD[1]);
  p.rect(hB.x - 1, hB.y + 2, 2, 2, SKIN[1]);
  flame(p, g, hB.x, hB.y + 1, 3 + Math.round(P.halo), 1, P.orb * 2, { lean: -0.2, seed: 83, hot: 0.7 });

  // Robe: dunkles Rot, Saum verkohlt, Goldborte
  robe(p, g, x, top, gy - 1, 4.5, 8, P.lean, P.hem, ROBE, ROBE_CH, 85, 0.8);
  p.rect(AX + 1 + P.stepA, gy - 2, 4, 2, ROBE_CH[2]);
  if (p.fine) {
    // Handfein: Robenfalten – vom Gürtel fallende Faltenzüge, Kamm im Licht, Tal dunkel (zweifarbig)
    for (const [ox, spread] of [[-3, -1.6], [-0.5, -0.4], [1.8, 0.9]]) {
      const x0 = x + ox + P.lean * 1.2, y0 = top + 10, x1 = x + ox + spread * 2.4 + Math.sin(P.hem + ox) * 0.6, y1 = gy - 4;
      p.fline(x0, y0, x1, y1, ROBE[1]); p.fline(x0 - 0.5, y0 + 0.5, x1 - 0.5, y1, ROBE[4]);
    }
    p.fline(x - 4 + P.lean * 3, top + 2.5, x - 2 + P.lean * 3, top + 7.5, ROBE[1]);
  }
  // Goldborte vorn + Runen
  if (p.fine) for (let j = 0; j < 18; j += 0.5) {
    // fein: Goldsaum zweifarbig (Licht links), Ziernaht als Punktreihe, Runen mit glühendem Kern
    const yy = top + 2 + j, xx = x + 3 + P.lean * (1.5 - j * 0.12) + j * 0.12;
    if (yy > gy - 3) break;
    p.dot(xx + 0.25, yy + 0.25, j % 2 === 0 ? GOLD[5] : GOLD[4]); p.dot(xx + 0.75, yy + 0.25, GOLD[2]); p.dot(xx + 1.25, yy + 0.25, GOLD[1]);
    if (j === 6 || j === 11 || j === 15) {
      p.dot(xx - 1.75, yy + 0.25, LAVA[4]); p.dot(xx - 1.25, yy + 0.25, LAVA[2]); p.dot(xx - 1.75, yy + 0.75, LAVA[3]); p.dot(xx - 1.25, yy + 1.25, LAVA[2]); p.dot(xx - 1.75, yy + 1.25, LAVA[5]);
      g.dot(xx - 1.75, yy + 0.25, GLOW[3]); g.dot(xx - 1.75, yy + 1.25, GLOW[4]); g.dot(xx - 1.25, yy + 0.75, GLOW[1]);
    }
  } else for (let j = 0; j < 18; j++) {
    const yy = top + 2 + j, xx = x + 3 + P.lean * (1.5 - j * 0.12) + j * 0.12;
    if (yy > gy - 3) break;
    p.px(xx, yy, j % 4 === 0 ? GOLD[4] : GOLD[2]);
    if (j === 6 || j === 11 || j === 15) { p.px(xx - 2, yy, LAVA[3]); p.px(xx - 2, yy + 1, LAVA[2]); g.px(xx - 2, yy, GLOW[2]); }
  }
  // Gürtel mit Goldschnalle
  const by = top + 8;
  for (let k = -5; k <= 5; k++) p.px(x + k + P.lean * 1.5, by, k < -2 ? GOLD[1] : GOLD[2]);
  p.rect(x + 1 + P.lean * 1.5, by - 1, 2, 3, GOLD[4]); p.px(x + 1 + P.lean * 1.5, by, LAVA[4]); g.px(x + 1 + P.lean * 1.5, by, GLOW[3]);
  if (p.fine) {
    // fein: Gürtel mit Oberkante im Licht und Punktnaht, Schnalle mit Rahmen und Glanzpunkt
    const bx = Math.round((x + P.lean * 1.5) * 2) / 2;
    p.fline(bx - 4.75, by + 0.25, bx + 0.75, by + 0.25, GOLD[3]); p.fline(bx - 4.75, by + 0.75, bx + 5.75, by + 0.75, GOLD[1]);
    for (let k = -4.5; k < 5; k += 1) if (k < 0.5 || k > 3) p.dot(bx + k + 0.25, by + 0.25, GOLD[4]);
    const bk = Math.round((x + 1 + P.lean * 1.5) * 2) / 2;
    p.dot(bk + 0.25, by - 0.75, GOLD[5]); p.dot(bk + 1.75, by + 1.75, GOLD[2]); p.dot(bk + 1.75, by - 0.75, GOLD[3]);
    p.dot(bk + 0.75, by + 0.25, LAVA[5]); p.dot(bk + 0.75, by + 0.75, LAVA[3]); p.dot(bk + 1.25, by + 0.25, LAVA[3]); g.dot(bk + 0.75, by + 0.25, GLOW[4]);
  }

  // Mantel mit Obsidian-Schulterdornen
  poly(p, [[sh.x - 6, sh.y - 1], [sh.x + 4, sh.y - 1], [sh.x + 5, sh.y + 4], [sh.x - 7, sh.y + 6]], (px2, py2) => ROBE[py2 < sh.y + 1 ? 4 : 3]);
  for (const [dx, h] of [[-5, 4], [-2, 5], [2, 3]]) {
    poly(p, [[sh.x + dx - 1, sh.y], [sh.x + dx - 1.5, sh.y - h], [sh.x + dx + 1, sh.y]], OBS[3]);
    if (p.fine) { p.fline(sh.x + dx - 0.75, sh.y - 0.25, sh.x + dx - 1.25, sh.y - h + 0.75, OBS[5]); p.dot(sh.x + dx - 1.25, sh.y - h + 0.75, OBS_SHINE); }
    else p.px(sh.x + dx - 1, sh.y - h + 1, OBS_SHINE);
  }

  // Kapuze: weit und rund, darauf eine Zackenkrone aus Gold (Rang des Adepten)
  poly(p, [[hx - 5, hy + 4], [hx - 6.5, hy], [hx - 5.5, hy - 4], [hx - 2, hy - 6], [hx + 2, hy - 5], [hx + 4, hy - 1], [hx + 4, hy + 2], [hx + 3, hy + 5]],
    (px2, py2) => ROBE[clamp(4 - Math.floor((px2 - (hx - 6)) / 4) - (py2 > hy + 2 ? 1 : 0), 1, 5)]);
  ln(p, hx - 5.5, hy - 3, hx - 2, hy - 5.5, ROBE[5]);
  if (p.fine) {
    // fein: Kapuzenfalten (Kamm hell, Tal dunkel) und Goldsaum an der Kapuzenöffnung
    p.fline(hx - 5.25, hy - 1, hx - 4, hy + 3.5, ROBE[2]); p.fline(hx - 4.75, hy - 1.5, hx - 3.5, hy + 3, ROBE[5]);
    p.fline(hx - 3, hy - 3.5, hx - 2.25, hy + 4.25, ROBE[2]);
    for (let a = -1.9; a <= 1.6; a += 0.09) { const qx = hx + 0.8 + Math.cos(a) * 3.65 - 0.25, qy = hy + 0.6 + Math.sin(a) * 4.15; if (qx < hx + 1.2) p.dot(qx, qy, a < -0.6 ? GOLD[4] : GOLD[2]); }
  }
  // Kronreif
  const cy0 = hy - 5;
  if (p.fine) for (let k = -5; k < 4; k += 0.5) {
    // fein: Kronreif mit Lichtkante oben, Schattenkante unten, Zierpunkte
    const yy = cy0 + Math.abs(k + 1) * 0.12;
    p.dot(hx + k + 0.25, yy + 0.25, k < -2 ? GOLD[3] : GOLD[4]); p.dot(hx + k + 0.25, yy + 0.75, k < -2 ? GOLD[2] : GOLD[3]);
    p.dot(hx + k + 0.25, yy + 1.25, GOLD[1]); p.dot(hx + k + 0.25, yy + 1.75, GOLD[0]);
    if ((k * 2) % 3 === 0) p.dot(hx + k + 0.25, yy + 0.75, GOLD[5]);
  } else for (let k = -5; k <= 3; k++) { p.px(hx + k, cy0 + Math.abs(k + 1) * 0.12, k < -2 ? GOLD[2] : GOLD[3]); p.px(hx + k, cy0 + 1 + Math.abs(k + 1) * 0.12, GOLD[1]); }
  // Zacken (hinten dunkler, vorn höher), Spitzen glühen
  if (p.fine) for (const [dx, h, c] of [[-4.5, 3, 2], [-1.5, 5, 4], [1.5, 4, 3]]) {
    // fein: Zacke verjüngt sich (Licht links, Schatten rechts), Spitze mit heißem Kern
    for (let j = 0.5; j <= h; j += 0.5) {
      const xx = hx + dx - j * 0.15, w = j < h - 1.5 ? 2 : j < h - 0.5 ? 1 : 0;
      p.dot(xx + 0.25, cy0 - j + 0.25, GOLD[Math.min(5, c + 1)]);
      if (w >= 1) p.dot(xx + 0.75, cy0 - j + 0.25, GOLD[c]);
      if (w >= 2) p.dot(xx + 1.25, cy0 - j + 0.25, GOLD[Math.max(1, c - 2)]);
    }
    const tx = hx + dx - h * 0.15, ty = cy0 - h - 1;
    p.dot(tx + 0.25, ty + 0.25, LAVA[5]); p.dot(tx + 0.25, ty + 0.75, LAVA[4]); p.dot(tx + 0.75, ty + 0.75, LAVA[3]);
    g.dot(tx + 0.25, ty + 0.25, GLOW[4]); g.px(tx, ty, GLOW[c > 3 ? 3 : 2]);
  } else for (const [dx, h, c] of [[-4.5, 3, 2], [-1.5, 5, 4], [1.5, 4, 3]]) {
    for (let j = 1; j <= h; j++) {
      const w = j < h - 1 ? 1 : 0;
      p.px(hx + dx - j * 0.15, cy0 - j, GOLD[c]);
      if (w) p.px(hx + dx - j * 0.15 + 1, cy0 - j, GOLD[Math.max(1, c - 2)]);
    }
    p.px(hx + dx - h * 0.15, cy0 - h - 1, LAVA[5]); g.px(hx + dx - h * 0.15, cy0 - h - 1, GLOW[c > 3 ? 4 : 3]);
  }
  // Glutstein in der Krone
  p.px(hx - 1.5, cy0, LAVA[4]); g.px(hx - 1.5, cy0, GLOW[4]); g.px(hx - 1.5, cy0 - 1, GLOW[2]);
  if (p.fine) { const sx = Math.round(hx - 1.5), sy = Math.round(cy0); p.dot(sx + 0.25, sy + 0.25, '#ffffff'); p.dot(sx + 0.75, sy + 0.75, LAVA[2]); p.dot(sx - 0.25, sy + 0.25, GOLD[5]); p.dot(sx + 1.25, sy + 0.75, GOLD[1]); }
  // Goldmaske mit Glutriss und V-Augenschlitzen
  // Kapuzenschatten rahmt die Maske (Kontrast), Maske selbst gedämpftes Gold
  ell(p, hx + 0.8, hy + 0.6, 3.4, 3.9, [VOID, ROBE[0]]);
  ell(p, hx + 1.2, hy + 0.5, 2.6, 3.2, GOLD.slice(0, 5), { bias: 0.02 });
  const ec = ex.hurt ? '#ffffff' : LAVA[4];
  if (p.fine) {
    // Handfein: Goldmaske – Stirnglanz, Nasengrat mit Schattenseite, V-Augenschlitze mit glühendem Kern,
    // Wangenschatten, Mundschlitz mit Lippenkante, Glutriss mit hellem Kern
    const X = Math.round(hx), Y = Math.round(hy);
    p.fline(X + 0.25, Y - 2.25, X + 1.25, Y - 2.75, GOLD[4]); p.dot(X + 0.25, Y - 1.75, GOLD[5]);
    p.fline(X + 2.25, Y - 1.75, X + 2.25, Y + 0.75, GOLD[4]); p.dot(X + 2.25, Y - 1.75, GOLD[5]);
    p.fline(X + 2.75, Y - 0.75, X + 2.75, Y + 1.25, GOLD[1]); p.dot(X + 2.75, Y + 1.25, GOLD[0]);
    p.fline(X + 2.75, Y + 2.25, X + 3.25, Y + 3.25, GOLD[1]); p.dot(X + 3.75, Y + 1.75, GOLD[1]); p.dot(X + 3.25, Y + 1.75, GOLD[2]);
    const lit = P.eye > 0.3;
    for (const [rows, inner] of [[[[0, -1], [0.5, -0.5], [1, 0], [1, 0.5]], 1], [[[4, -1], [3.5, -0.5], [3, 0], [3, 0.5]], -1]]) {
      rows.forEach(([u, v], k) => {
        const glowX = inner > 0 ? u + 0.5 : u;
        p.dot(X + u + 0.25, Y + v + 0.25, VOID); p.dot(X + u + 0.75, Y + v + 0.25, VOID);
        if (lit && k < 3) { p.dot(X + glowX + 0.25, Y + v + 0.25, k === 2 ? ec : k === 1 ? LAVA[3] : LAVA[2]); g.dot(X + glowX + 0.25, Y + v + 0.25, GLOW[k === 2 ? 4 : 2]); }
        if (lit && k === 2) { const ox = inner > 0 ? u : u + 0.5; p.dot(X + ox + 0.25, Y + v + 0.25, LAVA[3]); g.dot(X + ox + 0.25, Y + v + 0.25, GLOW[3]); }
      });
      if (lit && !ex.hurt) p.dot(X + (inner > 0 ? 1.25 : 3.25), Y + 0.25, LAVA[5]);
    }
    if (lit) {
      g.px(hx + 1, hy, GLOW[3]); g.px(hx + 3, hy, GLOW[3]);
      if (P.halo > 1.3) { g.px(hx + 5, hy, GLOW[2]); g.px(hx + 1, hy - 1, GLOW[1]); }
    }
    p.fline(X + 1.75, Y + 2.75, X + 3.25, Y + 2.75, VOID); p.fline(X + 2.25, Y + 3.25, X + 2.75, Y + 3.25, GOLD[4]);
    p.fline(X + 1.25, Y + 1.25, X + 1.75, Y + 2.75, LAVA[3]); p.fline(X + 1.75, Y + 1.25, X + 2.25, Y + 2.75, LAVA[1]); g.fline(X + 1.25, Y + 1.25, X + 1.75, Y + 2.75, GLOW[2]);
  } else {
  p.px(hx + 2.5, hy + 3, GOLD[1]); p.px(hx + 3, hy + 2, GOLD[1]);
  // V-Augenschlitze: dunkle Kerbe, innen tiefer (zorniger Blick), glühender Kern
  p.px(hx, hy - 1, VOID); p.px(hx + 1, hy, VOID); p.px(hx + 3, hy, VOID); p.px(hx + 4, hy - 1, VOID);
  p.px(hx + 2, hy - 1, GOLD[4]);                                  // Nasengrat im Licht
  if (P.eye > 0.3) {
    p.px(hx + 1, hy, ec); p.px(hx + 3, hy, ec); p.px(hx, hy - 1, LAVA[2]); p.px(hx + 4, hy - 1, LAVA[2]);
    g.px(hx + 1, hy, GLOW[4]); g.px(hx + 3, hy, GLOW[4]); g.px(hx, hy - 1, GLOW[2]); g.px(hx + 4, hy - 1, GLOW[2]);
    if (P.halo > 1.3) { g.px(hx + 5, hy, GLOW[2]); g.px(hx + 1, hy - 1, GLOW[1]); }
  }
  // Glutriss quer über die Maske, schmaler Mundschlitz
  p.line(hx + 1, hy + 1.5, hx + 2, hy + 3, LAVA[2]); g.px(hx + 1, hy + 2, GLOW[1]);
  p.line(hx + 2, hy + 2.5, hx + 3, hy + 2.5, VOID);
  p.px(hx, hy - 2, GOLD[5]);
  }
  meta.eye = { x: hx + 2, y: hy };
  meta.head = { x: hx - 1, y: hy - 11 };


  // vorderer Arm, Hand mit Feuerkugel
  const hF = { x: sh.x + P.hFx, y: sh.y + P.hFy };
  const k = ik(sh.x + 1, sh.y + 1, hF.x, hF.y, 5, 5.5, P.hFy < 3 ? -1 : 1);
  if (ex.smear) arcSmear(p, g, sh.x, sh.y, ex.smear[0], ex.smear[1], 8, 14, [LAVA[1], LAVA[3], LAVA[5]], 87, true);
  cap(p, sh.x + 1, sh.y + 1, k.jx, k.jy, 2.2, 2.2, ROBE, { bias: 0.12 });
  cap(p, k.jx, k.jy, k.ex, k.ey, 2.2, 3 + P.sleeve * 0.6, ROBE, { bias: 0.12 });
  p.px(k.ex + 1, k.ey + 2, GOLD[3]);
  if (p.fine) goldCuff(p, k.jx, k.jy, k.ex, k.ey, 2.6 + P.sleeve * 0.6, GOLD[4], GOLD[2]);
  p.rect(k.ex, k.ey - 1, 2, 2, SKIN[2]); p.px(k.ex + 1, k.ey - 1, SKIN[3]);
  if (p.fine) {
    // fein: Finger (Knöchel im Licht, Fugen dunkel), Daumen
    const fx = Math.round(k.ex), fy = Math.round(k.ey);
    p.dot(fx + 1.75, fy - 0.75, SKIN[3]); p.dot(fx + 1.75, fy - 0.25, SKIN[2]); p.dot(fx + 0.25, fy - 0.75, SKIN[3]);
    p.dot(fx + 0.75, fy + 0.25, SKIN[0]); p.dot(fx + 1.25, fy + 0.25, SKIN[1]); p.dot(fx + 1.75, fy + 0.75, SKIN[1]); p.dot(fx + 0.25, fy + 0.75, SKIN[1]);
  }
  const bx = k.ex + 2.5, bY = k.ey - 2 - P.ball;
  if (P.ball > 0.4) fireball(p, g, bx, bY, P.ball, P.orb * 3 + P.ball);
  meta.hand = { x: bx, y: bY };
  if (ex.flash) { glowDot(g, bx + 2, bY, 3); for (let i = 0; i < 6; i++) { const a = i * 1.047, qx = bx + 2 + Math.cos(a) * 5, qy = bY + Math.sin(a) * 4; p.px(qx, qy, LAVA[4]); g.px(qx, qy, GLOW[3]); } }
  return meta;
}

function drawAdeptCorpse(p, g, k) {
  const { AX, AY } = AD;
  const gy = AY - 1;
  if (p.fine) {
    // fein: zusammengesunkene Robe mit Faltenwülsten (zweifarbig), verkohlter Saum unten, Goldsaum
    const RA = ramp32(ROBE), RC = ramp32(ROBE_CH);
    scan(p, AX - 14, gy - 5, AX + 10, gy + 1, (X, Y) => {
      const j = gy + 1 - Y, hw = 11.5 - j * 1.8, u = X - (AX - 1.5);
      if (j < 0 || Math.abs(u) > hw) return 0;
      const fold = Math.sin(u * 1.1 + j * 0.8);
      const t = 0.3 + (hw - u) / (2 * hw) * 0.5 + (fold > 0.6 ? 0.18 : fold < -0.7 ? -0.15 : 0);
      return (j < 2 ? RC : RA)[clamp(Math.floor(t * 4), 0, 3)];
    });
    p.fline(AX - 9.5, gy - 2.75, AX + 4.5, gy - 3.75, GOLD[3]); p.fline(AX - 9.5, gy - 2.25, AX + 4.5, gy - 3.25, GOLD[1]);
    for (let u = -9; u < 4; u += 2) p.dot(AX + u, gy - 2.75 - (u + 9) / 14, GOLD[5]);
  } else {
    for (let j = 0; j < 5; j++) {
      const hw = 11 - j * 1.8;
      for (let x = -hw; x <= hw; x++) {
        const t = 0.3 + (hw - x) / (2 * hw) * 0.5;
        p.px(AX - 2 + x, gy - j, (j < 2 ? ROBE_CH : ROBE)[clamp(Math.floor(t * 4), 0, 3)]);
      }
    }
    p.line(AX - 10, gy - 3, AX + 4, gy - 4, GOLD[2]);
  }
  // Maske liegt daneben
  ell(p, AX + 11, gy - 1.5, 2.6, 2, GOLD, { bias: 0.05 });
  p.px(AX + 10, gy - 2, VOID); p.px(AX + 12, gy - 2, VOID);
  if (p.fine) { p.dot(AX + 9.75, gy - 3.25, GOLD[5]); p.fline(AX + 11.25, gy - 3.25, AX + 11.25, gy - 1.25, GOLD[4]); p.fline(AX + 10.25, gy - 0.75, AX + 11.75, gy - 0.75, VOID); }
  // Glutmotten sinken und erlöschen
  for (let i = 0; i < 3; i++) {
    const x = AX - 6 + i * 6, y = gy - 6 + k * 5 - i;
    if (k < 0.9) { p.px(x, y, LAVA[k < 0.5 ? 4 : 2]); g.px(x, y, GLOW[k < 0.5 ? 3 : 1]); }
  }
  if (k < 0.7) flame(p, g, AX + 5, gy, Math.round(4 * (1 - k)) + 1, 1.2 * (1 - k) + 0.4, k * 7, { seed: 9 });
  return { eye: { x: AX + 11, y: gy - 2 }, head: { x: AX + 11, y: gy - 5 }, hand: { x: AX + 5, y: gy - 3 } };
}

function createAdept() {
  const S = { ...AD, draw: drawAdept };
  const idle = cycle((ph) => {
    const s = Math.sin(ph);
    return adp({ bob: Math.max(0, s) * 0.8, hem: ph, orb: ph, hFy: 7 + Math.max(0, s), ball: 1.2 + s * 0.2, halo: 1 + s * 0.1 });
  }, 6);
  const walk = cycle((ph) => {
    const s = Math.sin(ph), c = Math.cos(ph);
    return adp({ bob: 1 - Math.abs(c), lean: 0.3, hem: ph * 2, stepA: s * 3, stepB: -s * 3, hFx: 6, hFy: 8 + Math.max(0, s), hBx: -6 - s, orb: ph, ball: 1, head: 0.5 });
  }, 6);
  // Ausholen: Kugel sammeln, Glut lodert, Motten beschleunigen
  const w1 = adp({ lean: -0.2, hFx: 4, hFy: 2, hBx: 3, hBy: 4, ball: 1.8, halo: 1.3, orb: 1.5, head: -0.5, sleeve: 0.5 });
  const w2 = adp({ lean: -0.35, hFx: 2, hFy: -3, hBx: 4, hBy: 1, ball: 2.6, halo: 1.6, orb: 3, head: -1, headY: -0.5, sleeve: 1 });
  // Wurf: Hand nach vorn, Kugel löst sich (Projektil vom Spiel)
  const s1 = adp({ lean: 0.5, hFx: 11, hFy: 3, hBx: -6, hBy: 6, ball: 0.3, halo: 1.5, orb: 4, stepA: 3, sleeve: 0.8 });
  const s2 = adp({ lean: 0.55, hFx: 12, hFy: 4, hBx: -7, hBy: 7, ball: 0, halo: 1.2, orb: 4.8, stepA: 3.5, sleeve: 0.5 });
  const s3 = adp({ lean: 0.2, hFx: 8, hFy: 6, hBx: -5, hBy: 8, ball: 0.7, halo: 1, orb: 5.6, stepA: 1 });
  // Glutfeld: Arme hoch, dann beide Hände zum Boden – Glyphe flammt auf
  const c1 = adp({ lean: -0.3, hFx: 3, hFy: -8, hBx: -2, hBy: -7, ball: 1.5, halo: 1.5, orb: 1, headY: -1, sleeve: 1 });
  const c2 = adp({ lean: -0.35, hFx: 4, hFy: -10, hBx: -1, hBy: -9, ball: 2.4, halo: 1.9, orb: 2.5, headY: -1.5, sleeve: 1, glyph: 0.2 });
  const c3 = adp({ lean: 0.5, bob: 3, hFx: 9, hFy: 14, hBx: 5, hBy: 14, ball: 0.2, halo: 1.6, orb: 4, head: 1, headY: 1, glyph: 0.9 });
  const c4 = adp({ lean: 0.45, bob: 3, hFx: 9, hFy: 14, hBx: 5, hBy: 14, ball: 0, halo: 1.2, orb: 5, head: 1, headY: 1, glyph: 1 });
  const c5 = adp({ lean: 0.1, bob: 1, hFx: 7, hFy: 8, hBx: -4, hBy: 8, ball: 0.8, halo: 1, orb: 6, glyph: 0.5 });
  const hurtP = adp({ lean: -0.6, head: -1.5, hFx: 3, hFy: 4, hBx: -7, hBy: 4, ball: 0.4, halo: 0.6, eye: 0 });
  const d1 = adp({ lean: -0.8, bob: 1, head: -1.5, hFx: 2, hFy: 1, hBx: -7, hBy: 2, ball: 0, halo: 0.5, eye: 0 });
  const d2 = adp({ lean: 0.9, bob: 7, head: 1.5, headY: 2, hFx: 9, hFy: 10, hBx: 3, hBy: 12, ball: 0, halo: 0.3, eye: 0 });
  return {
    idle: new Animation(track(S, idle, 6, { loop: true }), 6),
    walk: new Animation(track(S, walk, 6, { loop: true }), 10),
    windup: new Animation(track(S, [[0, idle[0][1]], [0.5, w1], [1, w2]], 5), 8, false),
    strike: new Animation(track(S, [[0, s1], [0.35, s2, snap], [1, s3]], 4, {
      extras: { 0: { fx: 'impact', flash: true, smear: [-1.6, -0.2] } },
    }), 12, false),
    // 10 Frames bei 9 fps: Hände schlagen in Frame 8 auf (≈ 0,9–1,0 s = windup des Glutfelds)
    cast: new Animation(track(S, [[0, idle[0][1]], [0.25, c1], [0.72, c2], [0.86, c3, snap], [0.93, c4], [1, c5]], 10, {
      extras: { 8: { fx: 'impact' } },
    }), 9, false),
    hurt: new Animation(track(S, [[0, hurtP], [1, adp({ lean: -0.2 })]], 2, { extras: { 0: { hurt: true } } }), 10, false),
    death: new Animation([
      ...track(S, [[0, hurtP], [0.4, d1], [1, d2]], 3, { extras: { 0: { hurt: true } } }),
      still(S, (p, g) => drawAdeptCorpse(p, g, 0), 'impact'),
      still(S, (p, g) => drawAdeptCorpse(p, g, 0.45)),
      still(S, (p, g) => drawAdeptCorpse(p, g, 1)),
    ], 8, false),
  };
}


// ================================================================ Der Glutkoloss (Elite)

const CO = { W: 132, H: 106, AX: 60, AY: 97, pad: 14, rim: { hi: '#f0d0b0', k: 0.36, back: '#3a0e06' } };
const CO_REST = {
  hipX: 0, hipY: 0, lean: 0.12, head: 0, headY: 0, jaw: 0.1, core: 1, vent: 0.4, kneel: 0,
  fFx: 10, fFy: 0, fBx: -10, fBy: 0,
  hFx: 17, hFy: 22, hBx: -13, hBy: 21, fist: 0, trail: 0,
};
const cop = (o) => ({ ...CO_REST, ...o });

// Fels mit Facetten, Rauschen und Glutrissen
function boulder(p, g, x, y, rx, ry, ramp, seed, heat, cracks = 2, o = {}) {
  ell(p, x, y, rx, ry, ramp, { noise: 0.09, seed, ...o });
  // Facettenkanten oben links
  const n = Math.max(2, Math.round(rx / 2));
  for (let i = 0; i < n; i++) {
    const a = -2.4 + (i / n) * 1.3 + (hash2(i, 1, seed) - 0.5) * 0.3;
    const fx = x + Math.cos(a) * rx * 0.72, fy = y + Math.sin(a) * ry * 0.72;
    if (p.fine) {
      // fein: Facettenkante als Bruchlinie – Lichtkante (1 Feinpixel), Schattenfuge darunter
      let tx = -Math.sin(a) * rx, ty = Math.cos(a) * ry;
      const tl = Math.hypot(tx, ty) || 1, L = Math.min(2.2, 0.5 + rx * 0.25) * (0.7 + hash2(i, 2, seed) * 0.6);
      tx = tx / tl * L; ty = ty / tl * L;
      const kx = (hash2(i, 3, seed) - 0.5) * 0.8, ky = Math.abs(kx) * 0.5;   // geknickte Kante
      p.fline(fx - tx, fy - ty, fx + kx, fy - ky, ramp[ramp.length - 1]); p.fline(fx + kx, fy - ky, fx + tx, fy + ty, ramp[ramp.length - 2]);
      p.fline(fx - tx + 0.5, fy - ty + 0.5, fx + tx + 0.5, fy + ty + 0.5, ramp[Math.max(0, ramp.length - 4)]);
      continue;
    }
    p.px(fx, fy, ramp[ramp.length - 1]); p.px(fx + 1, fy + 1, ramp[ramp.length - 3]);
  }
  if (cracks && rx > 3) veins(p, g, x, y, rx, ry, seed + 7, cracks, heat, { len: Math.round((rx + ry) * 0.55) });
}

// Obsidiandorn (Kristall), Basis (bx,by), Winkel a
function shard(p, g, bx, by, a, h, w, heat) {
  const tx = bx + Math.cos(a) * h, ty = by + Math.sin(a) * h;
  const nx = -Math.sin(a) * w, ny = Math.cos(a) * w;
  poly(p, [[bx - nx, by - ny], [tx, ty], [bx + nx, by + ny]], (x, y) => ((x - bx) * -Math.sin(a) + (y - by) * Math.cos(a) < 0 ? OBS[4] : OBS[2]));
  if (p.fine) {
    // fein: Kristallgrat als Glanzlinie, Glanzpunkt an der Spitze, Schattenkante, Glut am Fuß mit Kern
    p.fline(bx - nx * 0.35, by - ny * 0.35, tx, ty, OBS_SHINE); p.fline(bx + nx * 0.6, by + ny * 0.6, tx, ty, OBS[1]);
    p.dot(tx - Math.cos(a) * 0.7, ty - Math.sin(a) * 0.7, '#e4dcff');
    if (heat > 0.5) { p.px(bx, by, LAVA[3]); p.dot(bx + 0.25, by + 0.25, LAVA[5]); g.px(bx, by, GLOW[2]); g.dot(bx + 0.25, by + 0.25, GLOW[4]); }
    return;
  }
  p.line(bx - nx * 0.4, by - ny * 0.4, tx, ty, OBS_SHINE);
  if (heat > 0.5) { p.px(bx, by, LAVA[3]); g.px(bx, by, GLOW[2]); }
}

function drawColossus(p, g, P, ex) {
  const { AX, AY } = CO;
  const meta = {};
  const gy = AY;
  const core = P.core;
  const heat = 0.55 + core * 0.3;
  const hip = { x: AX + P.hipX, y: gy - 26 + P.hipY + P.kneel * 9 };
  const lean = P.lean;
  const ch = { x: hip.x + Math.sin(lean) * 22, y: hip.y - Math.cos(lean) * 22 };
  const px = Math.cos(lean), py = Math.sin(lean);
  const shF = { x: ch.x + px * 13, y: ch.y + py * 13 - 7 }, shB = { x: ch.x - px * 12, y: ch.y - py * 12 - 9 };

  const leg = (hx, hy, fx, fy, ramp, back, seed) => {
    let k = ik(hx, hy, fx, fy, 12, 12, -1);
    if (P.kneel > 0.01 && !back) {
      const kx = hx + 6, ky = gy - 3;
      k = { jx: k.jx + (kx - k.jx) * P.kneel, jy: k.jy + (ky - k.jy) * P.kneel, ex: k.ex + (kx - 12 - k.ex) * P.kneel, ey: k.ey };
    }
    cap(p, hx, hy, k.jx, k.jy, 6.5, 5.6, ramp, { noise: 0.08, seed });
    cap(p, k.jx, k.jy, k.ex, k.ey - 4, 5.4, 6, ramp, { noise: 0.08, seed: seed + 1 });
    boulder(p, g, k.jx + 1, k.jy, 5, 4.4, ramp, seed + 2, heat * (back ? 0.5 : 0.9), back ? 0 : 1);
    // Fuß: flacher Felsblock
    boulder(p, g, k.ex + 3, k.ey - 3, 8.5, 3.8, ramp, seed + 3, heat * 0.6, back ? 0 : 1);
    if (!back) { p.px(k.ex + 10, k.ey - 2, OBS[4]); p.px(k.ex + 11, k.ey - 1, OBS[3]); }
  };
  const arm = (sh, tx, ty, ramp, back, seed) => {
    const k = ik(sh.x, sh.y, tx, ty, 15, 16, 1);
    cap(p, sh.x, sh.y, k.jx, k.jy, 6, 5, ramp, { noise: 0.08, seed, rim: back ? 0 : 1 });
    boulder(p, g, (sh.x + k.jx) / 2, (sh.y + k.jy) / 2, 5.5, 5, ramp, seed + 1, heat * (back ? 0.4 : 0.9), back ? 0 : 1);
    cap(p, k.jx, k.jy, k.ex, k.ey, 5.2, 6.2, ramp, { noise: 0.08, seed: seed + 2, rim: back ? 0 : 1 });
    boulder(p, g, k.jx, k.jy, 4.4, 4.4, ramp, seed + 3, heat * 0.8, back ? 0 : 1);
    // Faust
    const fr = 7.5 + P.fist * 0.8;
    const fx = k.ex + (back ? 0 : 1), fy = k.ey + 2;
    boulder(p, g, fx, fy, fr, fr * 0.88, ramp, seed + 4, heat * (back ? 0.7 : 1.15), back ? 1 : 3, { rim: back ? 0 : 1 });
    // glühende Knöchel
    const a = Math.atan2(k.ey - k.jy, k.ex - k.jx);
    for (let i = -1; i <= 1; i++) {
      const qx = fx + Math.cos(a + i * 0.5) * (fr - 1.5), qy = fy + Math.sin(a + i * 0.5) * (fr - 1.5);
      const c = heat > 1.2 ? 4 : 3;
      p.px(qx, qy, LAVA[back ? c - 1 : c]); g.px(qx, qy, GLOW[back ? 1 : c - 1]);
      if (p.fine && !back) { p.dot(qx + 0.25, qy + 0.25, LAVA[5]); p.dot(qx + 0.75, qy + 0.75, LAVA[2]); g.dot(qx + 0.25, qy + 0.25, GLOW[4]); }
    }
    // Magma tropft von der Faust
    if (!back && heat > 0.9) {
      const L = 1 + Math.floor(((ex.t ?? 0) * 3 + seed) % 3);
      if (p.fine) for (let j = 0; j < L; j += 0.5) { const yy = fy + fr * 0.85 + j; p.dot(fx + 1.25, yy + 0.25, j + 0.5 >= L ? LAVA[5] : LAVA[4]); p.dot(fx + 1.75, yy + 0.25, LAVA[2]); g.dot(fx + 1.25, yy + 0.25, GLOW[3]); }
      else for (let j = 0; j < L; j++) { p.px(fx + 1, fy + fr * 0.85 + j, LAVA[j === L - 1 ? 4 : 3]); g.px(fx + 1, fy + fr * 0.85 + j, GLOW[2]); }
    }
    return { k, fx, fy, fr };
  };

  // --- hinten: Bein, Arm, Schulterfels
  leg(hip.x - 5, hip.y, AX + P.fBx, gy - P.fBy, ROCK_D, true, 100);
  const bA = arm(shB, ch.x + P.hBx, ch.y + P.hBy, ROCK_D, true, 110);
  meta.handB = { x: bA.fx, y: bA.fy };
  boulder(p, g, shB.x, shB.y, 8, 7, ROCK_D, 120, heat * 0.5, 1);
  shard(p, g, shB.x - 3, shB.y - 4, -2.0, 9, 2.2, heat);
  shard(p, g, shB.x + 1, shB.y - 5, -1.75, 7, 1.8, heat);

  // --- Rückenkamm: Obsidiankristalle, Rauch und Glut aus Spalten
  for (let i = 0; i < 4; i++) {
    const u = i / 3;
    const bx = hip.x - 10 + (ch.x - hip.x - 8) * u - py * 3, by = hip.y - 6 + (ch.y - hip.y - 6) * u - 2;
    shard(p, g, bx, by, -2.3 + u * 0.4 + lean * 0.4, 6 + u * 5, 1.8 + u * 0.4, heat);
    const ph = P.vent + i * 1.3;
    for (let k = 0; k < 3; k++) {
      const yy = by - 6 - k * 3 - ((ph * 2) % 1) * 3, xx = bx - 2 + Math.sin(ph * 3 + k) * 1.2 - k;
      if (k === 0) { p.px(xx, yy, LAVA[4]); g.px(xx, yy, GLOW[3]); if (p.fine) { p.dot(xx + 0.25, yy + 0.25, LAVA[5]); g.dot(xx + 0.25, yy + 0.25, GLOW[4]); } }
      else if (p.fine) { g.dot(xx + 0.25, yy + 0.25, GLOW[k === 1 ? 2 : 1]); g.dot(xx + 0.75, yy + 0.75, GLOW[0]); }
      else g.px(xx, yy, GLOW[k === 1 ? 1 : 0]);
    }
  }

  // --- Becken und Rumpf
  boulder(p, g, hip.x, hip.y, 11, 6.5, ROCK, 130, heat * 0.8, 2);
  boulder(p, g, ch.x - 2 + py * 4, ch.y + 9, 13, 9, ROCK, 131, heat * 0.8, 2, { rot: lean });
  boulder(p, g, ch.x, ch.y, 17, 14, ROCK, 132, heat, 3, { rot: lean, bias: 0.04 });
  // Magmakern: Spalt in der Brust, von Felsplatten eingefasst
  const kx = ch.x + px * 4, ky = ch.y + 2;
  const kr = 4.5 + core * 1.2;
  if (p.fine) {
    // fein: Magmakern je Feinpixel – heller Kern, gestufter Saum, ausgefranster Rand je Weltpixel
    const L32 = ramp32(LAVA), G32 = ramp32(GLOW), gb = g.buf, r2 = p.res;
    const fo = Math.round(p.ox * r2), go = Math.round(p.oy * r2);
    scan(p, kx - kr - 1, ky - kr - 1, kx + kr + 1, ky + kr + 1, (x, y) => {
      const i = x - kx - 0.5, j = y - ky - 0.5, d = Math.hypot(i / 0.8, j) / kr;
      if (d > 1 || hash2(Math.round(i), Math.round(j), 133) < d * 0.35) return 0;
      const hot = (1 - d) * 0.75 + (j > 0 ? 0.1 : 0) + hash2(Math.round(i), Math.round(j), 134) * 0.12 + (core - 1) * 0.35;
      const c = hot > 0.72 ? 5 : hot > 0.52 ? 4 : hot > 0.32 ? 3 : 2;
      gb[(Math.floor(y * r2) + go) * g.W + Math.floor(x * r2) + fo] = G32[Math.min(4, c - 1)];
      return L32[c];
    });
    g.dirty = true;
  } else for (let j = -Math.ceil(kr); j <= kr; j++) for (let i = -Math.ceil(kr * 0.8); i <= kr * 0.8; i++) {
    const d = Math.hypot(i / 0.8, j) / kr;
    if (d > 1 || hash2(i, j, 133) < d * 0.35) continue;
    const hot = (1 - d) * 0.7 + (j > 0 ? 0.1 : 0) + hash2(i, j, 134) * 0.2 + (core - 1) * 0.35;
    const c = hot > 0.72 ? 5 : hot > 0.52 ? 4 : hot > 0.32 ? 3 : 2;
    p.px(kx + i, ky + j, LAVA[c]); g.px(kx + i, ky + j, GLOW[Math.min(4, c - 1)]);
  }
  if (core > 1.25) fillEll(g, kx, ky, kr + (core - 1.25) * 4, kr + (core - 1.25) * 4, GLOW[0]);
  glowDot(g, kx, ky, 0.5 + core * 1.6);
  // Felsplatten, die den Kern halb verdecken
  poly(p, [[kx - 7, ky - 7], [kx + 1, ky - 5 - core], [kx - 1, ky - 1], [kx - 6, ky]], (x, y) => ROCK[y < ky - 4 ? 5 : 3]);
  poly(p, [[kx + 2, ky + 3 + core * 0.5], [kx + 8, ky + 1], [kx + 7, ky + 7], [kx + 1, ky + 7]], ROCK[2]);
  ln(p, kx - 7, ky - 7, kx + 1, ky - 6 - core, ROCK[5]);
  if (p.fine) { p.fline(kx - 6.5, ky - 6, kx + 0.5, ky - 5 - core, ROCK[4]); p.fline(kx + 2.5, ky + 3.5 + core * 0.5, kx + 8, ky + 1.5, ROCK[4]); p.fline(kx - 1.5, ky - 1, kx - 6, ky + 0.5, ROCK[1]); }
  // Strahlen: Risse vom Kern nach außen
  for (let i = 0; i < 5; i++) {
    const a = -2.6 + i * 1.2 + hash2(i, 1, 135) * 0.4;
    if (p.fine) {
      // fein: Strahlriss mit hellem Kern, nach außen schmaler und dunkler
      let lx = kx + Math.cos(a + kr * 0.05) * kr, ly = ky + Math.sin(a + kr * 0.05) * kr;
      for (let r = kr + 1; r < kr + 5 + core * 3; r++) {
        const x = kx + Math.cos(a + r * 0.05) * r, y = ky + Math.sin(a + r * 0.05) * r;
        if (r < kr + 3) hotLine(p, g, lx, ly, x, y, LAVA[2], LAVA[4], GLOW[2], GLOW[3]);
        else { ln(p, lx, ly, x, y, LAVA[2]); g.fline(lx + 0.5, ly + 0.5, x + 0.5, y + 0.5, GLOW[1]); }
        lx = x; ly = y;
      }
      continue;
    }
    for (let r = kr; r < kr + 5 + core * 3; r++) {
      const x = kx + Math.cos(a + r * 0.05) * r, y = ky + Math.sin(a + r * 0.05) * r;
      const c = r < kr + 3 ? 3 : 2;
      p.px(x, y, LAVA[c]); g.px(x, y, GLOW[c - 1]);
    }
  }
  meta.chest = { x: kx, y: ky };

  // --- vorderes Bein
  leg(hip.x + 5, hip.y + 1, AX + P.fFx, gy - P.fFy, ROCK, false, 140);

  // --- vorderer Arm, Schulterfels mit Kristallen
  if (ex.smear) arcSmear(p, g, shF.x, shF.y, ex.smear[0], ex.smear[1], 20, 36, SMEAR, 161, false);
  occlude(g);
  const fA = arm(shF, ch.x + P.hFx, ch.y + P.hFy, ROCK, false, 170);
  occlude(null);
  // Glut der Faust nach dem Verdecken wieder aufsetzen
  for (let i = -1; i <= 1; i++) {
    const a = Math.atan2(fA.k.ey - fA.k.jy, fA.k.ex - fA.k.jx);
    const qx = fA.fx + Math.cos(a + i * 0.5) * (fA.fr - 1.5), qy = fA.fy + Math.sin(a + i * 0.5) * (fA.fr - 1.5);
    g.px(qx, qy, GLOW[heat > 1.2 ? 3 : 2]);
  }
  if (heat > 1.1) glowDot(g, fA.fx + 1, fA.fy + 1, 1 + (heat - 1.1) * 3);
  occlude(g);
  boulder(p, g, shF.x, shF.y, 9, 7.5, ROCK, 180, heat, 2, { rim: 1, bias: 0.05 });
  occlude(null);
  shard(p, g, shF.x - 4, shF.y - 5, -1.95, 11, 2.4, heat);
  shard(p, g, shF.x + 1, shF.y - 6, -1.6, 8, 2, heat);
  shard(p, g, shF.x + 5, shF.y - 4, -1.2, 5, 1.5, heat);
  // --- Kopf: klein, tief zwischen den Schultern, schwerer Stirnwulst
  const hx = ch.x + px * 5 + py * 8 + P.head, hy = ch.y - 16 + py * 5 + P.headY;
  boulder(p, g, hx, hy, 6.5, 5.5, ROCK, 150, heat * 0.7, 1, { rim: 1 });
  // Stirnwulst mit Obsidianhörnern
  p.rect(hx - 5, hy - 3, 11, 2, ROCK[4]); p.rect(hx - 4, hy - 3, 9, 1, ROCK[5]);
  shard(p, g, hx - 3, hy - 3, -2.2, 6, 1.6, heat);
  shard(p, g, hx + 1, hy - 4, -1.9, 4, 1.3, heat);
  // Augen
  const ec = ex.hurt ? '#ffffff' : LAVA[5];
  p.rect(hx, hy - 1, 7, 2, VOID);                                              // Schattenband unter dem Wulst
  p.px(hx + 1, hy - 1, LAVA[3]); p.px(hx + 2, hy, ec); p.px(hx + 4, hy, ec); p.px(hx + 5, hy - 1, LAVA[3]);
  p.px(hx + 2, hy - 1, LAVA[4]); p.px(hx + 4, hy - 1, LAVA[4]);
  g.px(hx + 2, hy, GLOW[4]); g.px(hx + 4, hy, GLOW[4]); g.px(hx + 2, hy - 1, GLOW[3]); g.px(hx + 4, hy - 1, GLOW[3]);
  g.px(hx + 1, hy - 1, GLOW[2]); g.px(hx + 5, hy - 1, GLOW[2]);
  g.rect(hx, hy - 2, 7, 3, GLOW[0]);
  p.px(hx + 3, hy, ROCK[3]); p.px(hx + 3, hy + 1, ROCK[4]);                    // Nasenrücken
  p.px(hx - 3, hy, ROCK[5]); p.px(hx - 2, hy + 1, ROCK[4]);                    // Wangenkante im Licht
  // Maul: glühender Spalt, öffnet sich beim Brüllen
  const jo = Math.round(P.jaw * 4);
  p.rect(hx, hy + 2, 6, 1 + jo, VOID);
  if (jo > 0) {
    p.rect(hx + 1, hy + 2, 4, jo, LAVA[3]); p.rect(hx + 2, hy + 2, 2, jo, LAVA[5]); g.rect(hx + 1, hy + 2, 4, jo, GLOW[3]);
    // Steinzähne oben und unten
    p.px(hx + 1, hy + 2, ROCK[5]); p.px(hx + 4, hy + 2, ROCK[5]); p.px(hx + 2, hy + 1 + jo, ROCK[4]); p.px(hx + 5, hy + 1 + jo, ROCK[4]);
  }
  else { p.rect(hx + 1, hy + 2, 4, 1, LAVA[2]); g.rect(hx + 1, hy + 2, 4, 1, GLOW[1]); }
  p.rect(hx - 1, hy + 3 + jo, 8, 2, ROCK[2]); p.px(hx + 6, hy + 3 + jo, ROCK[3]);
  if (p.fine) {
    // Handfein: Stirnwulst mit Bruchkanten und Schattenunterseite, weißglühende Augenkerne, Steinzähne,
    // Kinnkante im Licht
    p.fline(hx - 4.75, hy - 1.25, hx + 5.75, hy - 1.25, ROCK[1]);
    p.dot(hx - 4.75, hy - 2.75, '#9a8682'); p.dot(hx - 4.25, hy - 2.75, '#9a8682');
    for (const u of [-2, 1.5, 4]) { p.dot(hx + u + 0.25, hy - 2.75, ROCK[3]); p.dot(hx + u + 0.75, hy - 2.25, ROCK[2]); }
    if (!ex.hurt) for (const u of [2, 4]) { p.dot(hx + u + 0.25, hy + 0.25, '#ffffff'); p.dot(hx + u + 0.75, hy + 0.75, LAVA[3]); g.dot(hx + u + 0.25, hy + 0.25, GLOW[4]); }
    p.dot(hx + 3.25, hy + 0.75, ROCK[5]); p.dot(hx + 3.75, hy + 1.75, ROCK[2]);
    if (jo > 0) {
      for (const u of [1, 4]) { p.dot(hx + u + 0.25, hy + 2.25, ROCK[5]); p.dot(hx + u + 0.75, hy + 2.75, ROCK[3]); }
      for (const u of [2, 5]) { p.dot(hx + u + 0.25, hy + 1.75 + jo, ROCK[4]); p.dot(hx + u + 0.75, hy + 1.25 + jo, ROCK[3]); }
      p.dot(hx + 2.75, hy + 2.25, LAVA[5]); p.dot(hx + 3.25, hy + 2.25, LAVA[5]);
    } else { p.fline(hx + 1.25, hy + 2.25, hx + 4.75, hy + 2.25, LAVA[4]); g.fline(hx + 1.25, hy + 2.25, hx + 4.75, hy + 2.25, GLOW[2]); }
    p.fline(hx - 0.75, hy + 3.25 + jo, hx + 6.25, hy + 3.25 + jo, ROCK[4]); p.fline(hx - 0.75, hy + 4.75 + jo, hx + 6.75, hy + 4.75 + jo, ROCK[1]);
  }
  meta.eye = { x: hx + 3, y: hy - 1 };
  meta.head = { x: hx, y: hy - 10 };
  meta.mouth = { x: hx + 5, y: hy + 3 };

  meta.hand = { x: fA.fx, y: fA.fy };
  meta.tip = { x: fA.fx + fA.fr, y: fA.fy };

  if (ex.trail) {
    // Glutschweif beim Ansturm (hinter dem Koloss)
    for (let i = 0; i < 16; i++) {
      const x = hip.x - 16 - hash2(i, 1, 190) * 22, y = gy - 4 - hash2(i, 2, 190) * 40;
      const c = hash2(i, 3, 190) < 0.4 ? 4 : 3;
      if (p.fine) { p.dot(x + 0.25, y + 0.25, LAVA[c + 1]); p.dot(x + 0.75, y + 0.25, LAVA[c]); p.dot(x + 0.25, y + 0.75, LAVA[c - 1]); g.px(x, y, GLOW[c - 1]); g.dot(x + 0.25, y + 0.25, GLOW[4]); if (i % 3 === 0) { p.fline(x - 1.25, y + 0.25, x - 0.25, y + 0.25, LAVA[2]); g.dot(x - 0.75, y + 0.25, GLOW[1]); } continue; }
      p.px(x, y, LAVA[c]); g.px(x, y, GLOW[c - 1]); if (i % 3 === 0) { p.px(x - 1, y, LAVA[2]); g.px(x - 1, y, GLOW[1]); }
    }
    dustRing(p, g, AX + P.fBx, gy - 1, 6, 191, [ROCK[3], ROCK[4], CHAR[3]], false);
  }
  if (ex.impact) {
    const ix = ex.impactX === 'both' ? (fA.fx + bA.fx) / 2 : fA.fx;
    dustRing(p, g, ix, gy - 1, ex.impact, 193, [ROCK[3], ROCK[4], CHAR[3]]);
    for (let i = 0; i < 20; i++) {
      const a = -Math.PI * (0.08 + hash2(i, 1, 194) * 0.84), d = (ex.impact + 4) * (0.35 + hash2(i, 2, 194) * 0.8);
      const x = ix + Math.cos(a) * d, y = gy - 2 + Math.sin(a) * d * 0.75;
      if (p.fine) { p.dot(x + 0.25, y + 0.25, LAVA[5]); p.dot(x + 0.75, y + 0.25, LAVA[3]); p.dot(x + 0.25, y + 0.75, LAVA[hash2(i, 3, 194) < 0.4 ? 4 : 2]); g.dot(x + 0.25, y + 0.25, GLOW[4]); g.dot(x + 0.75, y + 0.75, GLOW[2]); }
      else p.px(x, y, LAVA[hash2(i, 3, 194) < 0.4 ? 5 : 4]); g.px(x, y, GLOW[3]);
      if (i % 4 === 0) { p.px(x, y + 1, ROCK[3]); if (p.fine) p.dot(x + 0.25, y + 1.25, ROCK[5]); }
    }
    if (ex.crack) {
      // Glutrisse im Boden
      for (let s2 = 0; s2 < 5; s2++) {
        let cx2 = ix, cy2 = gy - 1, a = -Math.PI + s2 * 0.8 + hash2(s2, 1, 195) * 0.4;
        for (let st = 0; st < ex.crack; st++) {
          const ox = cx2, oy = cy2;
          cx2 += Math.cos(a); cy2 += Math.sin(a) * 0.4; a += (hash2(s2, st, 196) - 0.5) * 0.9;
          if (p.fine) { hotLine(p, g, ox, oy, cx2, cy2, LAVA[st < 4 ? 3 : 2], LAVA[st < 4 ? 5 : 4], GLOW[st < 4 ? 3 : 2], GLOW[4]); continue; }
          p.px(cx2, cy2, LAVA[st < 4 ? 4 : 3]); g.px(cx2, cy2, GLOW[st < 4 ? 3 : 2]);
        }
      }
    }
  }
  if (ex.roarFx) {
    for (let r = 6; r < 22; r += 5) for (let a = -0.9; a <= 0.9; a += 0.1) {
      const x = meta.mouth.x + 3 + Math.cos(a) * (r + ex.roarFx * 4), y = meta.mouth.y + Math.sin(a) * (r + ex.roarFx * 4);
      if (hash2(Math.round(a * 20), r, 197) < 0.5) g.px(x, y, GLOW[r < 11 ? 2 : 1]);
    }
  }
  return meta;
}

// Trümmerhaufen: Felsen, Kristalle, erkaltender Kern
function drawColossusRubble(p, g, k) {
  const { AX, AY } = CO;
  const gy = AY;
  const heat = 1.1 * (1 - k);
  const rocks = [[-30, 4, 6, 1], [-20, 6, 8, 0], [-8, 8, 10, 1], [6, 9, 11, 0], [20, 6, 8, 1], [31, 4, 6, 0], [-14, 15 - k * 3, 7, 0], [2, 17 - k * 4, 8, 1], [16, 13 - k * 3, 6, 0], [40, 2, 4, 1]];
  rocks.forEach(([x, h, r, d], i) => boulder(p, g, AX + x, gy - h + (k * (i % 3)), r, r * 0.85, d ? ROCK : ROCK_D, 200 + i, heat, r > 6 ? 2 : 1));
  // Kristalle ragen heraus
  shard(p, g, AX - 16, gy - 12, -2.1, 9, 2.2, heat);
  shard(p, g, AX + 12, gy - 16, -1.4, 11, 2.4, heat);
  shard(p, g, AX + 26, gy - 8, -0.9, 7, 1.8, heat);
  // Kern: glüht nach, erlischt
  const kx = AX + 3, ky = gy - 12 - (1 - k) * 4;
  if (heat > 0.1) {
    ell(p, kx, ky, 4, 3.4, heat > 0.6 ? [LAVA[2], LAVA[3], LAVA[4], LAVA[5]] : [LAVA[0], LAVA[1], LAVA[2], LAVA[3]]);
    glowDot(g, kx, ky, 1 + heat * 2.5);
  } else ell(p, kx, ky, 4, 3.4, ROCK_D);
  // Kopf liegt vorn
  const hx = AX + 30, hy = gy - 5;
  boulder(p, g, hx, hy, 5.5, 4.6, ROCK, 220, heat * 0.5, 0);
  p.rect(hx + 1, hy - 1, 2, 1, heat > 0.3 ? LAVA[3] : VOID); if (heat > 0.3) g.rect(hx + 1, hy - 1, 2, 1, GLOW[2]);
  for (let i = 0; i < 5; i++) if (heat > 0.2) g.px(kx - 2 + i, ky - 8 - i * 2 - k * 5, GLOW[0]);
  return { eye: { x: hx + 2, y: hy - 1 }, head: { x: hx, y: hy - 6 }, chest: { x: kx, y: ky }, hand: { x: AX + 20, y: gy - 6 }, handB: { x: AX - 20, y: gy - 6 }, mouth: { x: hx + 4, y: hy + 1 }, tip: { x: AX + 26, y: gy - 6 } };
}

function createColossus() {
  const S = { ...CO, draw: (p, g, P, ex, t) => drawColossus(p, g, P, { ...ex, t }) };
  const idle = cycle((ph) => {
    const s = Math.sin(ph);
    return cop({ hipY: Math.max(0, s) * 1.2, lean: 0.12 + s * 0.015, hFy: 22 + Math.max(0, s) * 1.5, hBy: 21 + Math.max(0, s) * 1.5, headY: Math.max(0, s), core: 0.95 + s * 0.2, vent: ph / 3 });
  }, 6);
  const walk = cycle((ph) => {
    const s = Math.sin(ph), c = Math.cos(ph);
    return cop({
      hipX: 1, hipY: 1.5 - Math.abs(c) * 2.5, lean: 0.2 + s * 0.03, head: s * 0.8, headY: Math.abs(c) * 1.2,
      fFx: 5 + s * 11, fFy: Math.max(0, -c) * 5, fBx: -5 - s * 11, fBy: Math.max(0, c) * 5,
      hFx: 17 - s * 5, hFy: 22 - Math.max(0, -s) * 2, hBx: -13 + s * 5, hBy: 21 - Math.max(0, s) * 2, core: 1, vent: ph / 2,
    });
  }, 8);
  // Hieb: Faust weit zurück und hoch, dann schräger Schwinger nach vorn-unten
  const w1 = cop({ lean: 0.02, hipX: -2, hFx: 2, hFy: -6, hBx: -8, hBy: 16, fFx: 13, fBx: -11, core: 1.2, fist: 0.6, vent: 0.5 });
  const w2 = cop({ lean: -0.14, hipX: -4, hipY: -1, hFx: -8, hFy: -18, hBx: -4, hBy: 12, fFx: 14, fBx: -12, core: 1.45, fist: 1, headY: -1, jaw: 0.3, vent: 1 });
  const s1 = cop({ lean: 0.25, hipX: 2, hipY: 2, hFx: 24, hFy: -8, hBx: -15, hBy: 16, fFx: 16, fBx: -12, core: 1.5, fist: 1, jaw: 0.5, vent: 1.3 });
  const s2 = cop({ lean: 0.45, hipX: 5, hipY: 6, hFx: 28, hFy: 26, hBx: -16, hBy: 18, fFx: 17, fBx: -13, core: 1.55, fist: 1, jaw: 0.4, vent: 1.5 });
  const s3 = cop({ lean: 0.42, hipX: 5, hipY: 6, hFx: 27, hFy: 27, hBx: -15, hBy: 19, fFx: 17, fBx: -13, core: 1.3, fist: 0.8, vent: 1.7 });
  const s4 = cop({ lean: 0.2, hipX: 2, hipY: 2, hFx: 19, hFy: 22, hBx: -13, hBy: 21, fFx: 13, fBx: -11, core: 1.05, vent: 2 });
  // Brüllen: Arme auseinander, Brust auf, Kern lodert
  const r1 = cop({ lean: -0.05, hFx: 22, hFy: 4, hBx: -22, hBy: 4, headY: -2, jaw: 0.6, core: 1.5, fist: 0.5, vent: 1 });
  const r2 = cop({ lean: -0.22, hipY: -1, hFx: 25, hFy: -8, hBx: -24, hBy: -8, headY: -4, head: -1, jaw: 1, core: 2, fist: 1, vent: 2 });
  // Bodenschlag: beide Fäuste über den Kopf, lange halten (Telegraph), dann hinunter
  const sl1 = cop({ lean: 0, hipY: -1, hFx: 10, hFy: -22, hBx: 2, hBy: -20, headY: -1, jaw: 0.3, core: 1.3, fist: 0.8, vent: 1 });
  const sl2 = cop({ lean: -0.15, hipY: -2, hFx: 6, hFy: -30, hBx: -2, hBy: -28, headY: -2, jaw: 0.5, core: 1.6, fist: 1, fBy: 1, vent: 1.5 });
  const sl2b = cop({ lean: -0.17, hipY: -2, hFx: 5, hFy: -31, hBx: -3, hBy: -29, headY: -2, jaw: 0.6, core: 1.95, fist: 1, fBy: 1, vent: 2.5 });
  const sl3 = cop({ lean: 0.55, hipX: 4, hipY: 9, hFx: 26, hFy: 34, hBx: 18, hBy: 34, headY: 2, jaw: 0.8, core: 2, fist: 1, fFx: 15, fBx: -12, vent: 3 });
  const sl4 = cop({ lean: 0.52, hipX: 4, hipY: 9, hFx: 26, hFy: 34, hBx: 18, hBy: 34, headY: 2, jaw: 0.4, core: 1.6, fist: 1, fFx: 15, fBx: -12, vent: 3.5 });
  const sl5 = cop({ lean: 0.25, hipX: 2, hipY: 3, hFx: 20, hFy: 24, hBx: -6, hBy: 24, core: 1.2, fFx: 13, fBx: -11, vent: 4 });
  // Ansturm vorbereiten: Schulter senken, mit dem Fuß scharren
  const b1 = cop({ lean: 0.45, hipY: 4, hFx: 14, hFy: 26, hBx: -18, hBy: 18, headY: 3, fFx: 14, fBx: -16, core: 1.3, jaw: 0.3, vent: 1 });
  const b2 = cop({ lean: 0.55, hipY: 5, hFx: 13, hFy: 28, hBx: -20, hBy: 16, headY: 4, fFx: 15, fBx: -20, fBy: 3, core: 1.6, jaw: 0.5, vent: 2 });
  const charge = cycle((ph) => {
    const s = Math.sin(ph), c = Math.cos(ph);
    return cop({
      lean: 0.6 + s * 0.03, hipX: 3, hipY: 4 - Math.abs(c) * 2.5, headY: 4, head: 1,
      fFx: 8 + s * 14, fFy: Math.max(0, -c) * 6, fBx: -6 - s * 14, fBy: Math.max(0, c) * 6,
      hFx: 16 + s * 3, hFy: 18, hBx: -24 - s * 3, hBy: 12, core: 1.6, jaw: 0.5, fist: 1, vent: ph,
    });
  }, 6);
  const hurtP = cop({ lean: -0.12, hipX: -4, head: -2, headY: -1, hFx: 12, hFy: 16, hBx: -16, hBy: 16, jaw: 0.6, core: 1.8 });
  const d1 = cop({ lean: -0.2, hipX: -4, head: -2, headY: -2, hFx: 10, hFy: 12, hBx: -17, hBy: 13, jaw: 1, core: 2 });
  const d2 = cop({ lean: 0.45, kneel: 1, hipY: 3, head: 1, headY: 3, hFx: 22, hFy: 30, hBx: -8, hBy: 30, jaw: 0.5, core: 1.4 });
  const d3 = cop({ lean: 0.8, kneel: 1, hipY: 7, head: 2, headY: 5, hFx: 26, hFy: 26, hBx: 8, hBy: 28, jaw: 0.3, core: 1 });
  return {
    idle: new Animation(track(S, idle, 6, { loop: true }), 5),
    walk: new Animation(track(S, walk, 8, { loop: true, extras: { 0: { fx: 'step' }, 4: { fx: 'step' } } }), 7),
    windup: new Animation(track(S, [[0, idle[0][1]], [0.45, w1], [1, w2]], 5), 8, false),
    strike: new Animation(track(S, [[0, s1], [0.25, s2, snap], [0.6, s3], [1, s4]], 5, {
      extras: { 0: { smear: [-2.2, -0.5] }, 1: { fx: 'impact', smear: [-1.5, 0.95], impact: 10 }, 2: { impact: 15 } },
    }), 12, false),
    roar: new Animation(track(S, [[0, idle[0][1]], [0.3, r1], [0.5, r2, snap], [0.85, { ...r2, core: 2.2 }], [1, cop({ ...r1, jaw: 0.4, core: 1.3 })]], 7, {
      extras: { 3: { fx: 'roar', roarFx: 1 }, 4: { roarFx: 2 }, 5: { roarFx: 3 } },
    }), 6, false),
    // 12 Frames bei 9 fps: Einschlag in Frame 9 (≈ 1,0–1,1 s = windup des Spezialangriffs)
    slam: new Animation(track(S, [[0, idle[0][1]], [0.18, sl1], [0.36, sl2], [0.7, sl2b], [0.8, sl3, snap], [0.9, sl4], [1, sl5]], 12, {
      extras: { 8: { smear: [-2.4, 1.2] }, 9: { fx: 'impact', impact: 16, impactX: 'both', crack: 6 }, 10: { impact: 23, impactX: 'both', crack: 10 }, 11: { impactX: 'both', crack: 12, impact: 0.01 } },
    }), 9, false),
    brace: new Animation(track(S, [[0, idle[0][1]], [0.4, b1], [0.7, b2], [1, { ...b1, core: 1.7 }]], 5, { extras: { 2: { fx: 'step' }, 4: { fx: 'step' } } }), 6, false),
    charge: new Animation(track(S, charge, 6, { loop: true, extras: { 0: { fx: 'step', trail: 1 }, 1: { trail: 1 }, 2: { trail: 1 }, 3: { fx: 'step', trail: 1 }, 4: { trail: 1 }, 5: { trail: 1 } } }), 12),
    hurt: new Animation(track(S, [[0, hurtP], [1, cop({ lean: 0.08 })]], 2, { extras: { 0: { hurt: true } } }), 8, false),
    death: new Animation([
      ...track(S, [[0, hurtP], [0.3, d1], [0.65, d2, snap], [1, d3]], 4, { extras: { 0: { hurt: true }, 2: { fx: 'impact' } } }),
      still(S, (p, g) => drawColossusRubble(p, g, 0), 'impact'),
      still(S, (p, g) => drawColossusRubble(p, g, 0.4)),
      still(S, (p, g) => drawColossusRubble(p, g, 1)),
    ], 6, false),
  };
}

// ================================================================ Export

const WASTES = {
  ash_wraith: createWraith,
  cinder_knight: createKnight,
  magma_serpent: createSerpent,
  ember_cultist_adept: createAdept,
  waste_colossus: createColossus,
};

// only (optional): nur eine Figur erzeugen (Vorschau/Werkzeuge).
// Jede Figur wird erst beim ersten Zugriff gezeichnet und dann gecacht.
export function createWastesFoes(only) {
  const out = {};
  for (const k in WASTES) {
    if (only && only !== k) continue;
    Object.defineProperty(out, k, {
      configurable: true, enumerable: true,
      get() {
        const v = WASTES[k]();
        Object.defineProperty(out, k, { value: v, writable: true, configurable: true, enumerable: true });
        return v;
      },
    });
  }
  return out;
}
