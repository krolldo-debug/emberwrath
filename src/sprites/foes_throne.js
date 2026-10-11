import { PAL } from '../gfx/Palette.js';
import { buildFrame, SpriteFrame, Animation } from '../gfx/Sprite.js';
import { FineCanvas, fineRes, col32, pixelsToCanvas } from '../gfx/Fine.js';
import { hash2 } from '../core/math.js';

// Gegner des Aschethrons (Obsidianpalast, Stufe 38–40): Thronwache,
// Aschepriester, Glut-Höllenhund und der Wächter des Throns (Elite).
// Unterscheidung: Thronwache = kleiner Hellebardier mit Turmschild, Schaller-Helm, roter Rosshaarbusch;
// Wächter = Koloss mit Zweihänder (beidhändig), gehörntem Großhelm und Flammenbanner auf dem Rücken.
//
// Gleicher Ansatz wie foes_rime.js / foes_cinder.js: Rigs mit Schlüsselposen,
// weich interpoliert; Obsidian + Gold, Glut auf der Leucht-Ebene (frame.glow),
// warmes Randlicht (Gold) oben links und Glut-Gegenlicht rechts für eine klare
// Silhouette auf dunklem Palastboden. Blickrichtung rechts, Anker = Bodenkontakt.
//
// Feinraster (docs/STYLE.md „Feinraster“, Stufe B): gezeichnet wird auf FineCanvas in Weltpixeln. Der Werkzeugkasten
// unten ist eine eigene Kopie der früher aus foes_cinder.js (FK) / foes_rime.js (RK) geliehenen Helfer: Formen
// (ell, cap, poly, flame, robe, Schleier) tasten Feinpixel ab, Details (Visiere, Filigran, Fell, Risse) stehen in
// `if (p.fine)`. Bei res 1 („Niedrig“) zeichnen alle Helfer genau wie die alten Weltpixel-Fassungen.

// ================================================================ Kit (Mathe, Farben)

const GLOW = ['#4a0e06', '#a8280c', '#f0602a', '#ffb070', '#fff4d8'];
const LAVA = ['#4a1006', '#9a2608', '#dc4e0e', '#ff8c24', '#ffd060', '#fff4c0'];
const CHAR = ['#0e0b0c', '#1a1516', '#282122', '#3a3030'];
const VOID = '#0a0508';
const TAU = Math.PI * 2;

const ease = (t) => t * t * (3 - 2 * t);
const linear = (t) => t;
const snap = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function mixP(a, b, t) { const o = {}; for (const k in a) o[k] = a[k] + ((b[k] ?? a[k]) - a[k]) * t; return o; }
function sample(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, p0] = keys[i], [t1, p1, e = ease] = keys[i + 1];
    if (t <= t1) return mixP(p0, p1, e((t - t0) / (t1 - t0 || 1)));
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
function rig(P, D, AX, AY) {
  const hip = { x: AX + P.hipX, y: AY - D.legH + P.hipY };
  const sL = Math.sin(P.lean), cL = Math.cos(P.lean);
  const pt = (u, k) => ({ x: hip.x + sL * u + cL * k, y: hip.y - cL * u + sL * k });
  const chest = pt(D.spine, 0);
  const fF = { x: AX + P.fFx, y: AY - P.fFy }, fB = { x: AX + P.fBx, y: AY - P.fBy };
  const legF = ik(hip.x + D.hipW, hip.y, fF.x, fF.y, D.thigh, D.shin, -1);
  const legB = ik(hip.x - D.hipW, hip.y, fB.x, fB.y, D.thigh, D.shin, -1);
  const shF = pt(D.spine - 1, D.sh), shB = pt(D.spine - 1, -D.sh);
  return { hip, chest, pt, sL, cL, legF, legB, shF, shB };
}

// ================================================================ Kit (Zeichnen, feinraster-fähig)

// Lichtrichtung (von links oben, leicht zum Betrachter)
const LX = -0.52, LY = -0.66, LZ = 0.54;
// Verdecker: solange gesetzt, löschen ell()/cap() die Leucht-Ebene unter sich,
// damit verdeckte Glut (Kern hinter dem Arm) nicht durchscheint.
let OCC = null;
const occlude = (g) => { OCC = g; };
function unglow(g, F, G) {
  if (F < 0 || G < 0 || F >= g.W || G >= g.H) return;
  g.buf[G * g.W + F] = 0;
  if (g._canvas) { const c = g._ctx; c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(F, G, 1, 1); c.restore(); }
}
// Abtastung über Feinpixelmitten (wie FineCanvas.each); fn(x, y) -> Farbe als Uint32 (0 = leer).
function scan(p, x0, y0, x1, y1, fn) {
  const r = p.res, fo = Math.round(p.ox * r), go = Math.round(p.oy * r), W = p.W, buf = p.buf;
  // auf die Leinwand begrenzen (spart Arbeit an den Rändern)
  const F0 = Math.max(Math.floor(x0 * r), -fo), F1 = Math.min(Math.ceil(x1 * r), W - 1 - fo);
  const G0 = Math.max(Math.floor(y0 * r), -go), G1 = Math.min(Math.ceil(y1 * r), p.H - 1 - go);
  const oc = OCC && OCC.res === r ? OCC : null, oF = oc ? Math.round(oc.ox * r) : 0, oG = oc ? Math.round(oc.oy * r) : 0;
  for (let G = G0; G <= G1; G++) {
    const y = (G + 0.5) / r, row = (G + go) * W + fo;
    for (let F = F0; F <= F1; F++) {
      const v = fn((F + 0.5) / r, y);
      if (!v) continue;
      buf[row + F] = v;   // Farben des Kits sind deckend
      if (oc) unglow(oc, F + oF, G + oG);
    }
  }
  p.dirty = true;
}
// Weltpixel (res 1) bzw. Feinpixel (fein) setzen
const dot = (p, x, y, c) => (p.fine ? p.dot(x, y, c) : p.px(x, y, c));
// Linie: res 1 wie PixelCanvas.line, fein als Feinlinie in Weltpixelstärke (glatte Diagonalen)
const L = (p, x0, y0, x1, y1, c) => (p.fine ? p.fline(x0, y0, x1, y1, c, 1) : p.line(x0, y0, x1, y1, c));
// Gefüllte Ellipse: res 1 genau wie PixelCanvas.ellipse (Zeilen), fein abgetastet
function oval(c, cx, cy, rx, ry, col) {
  if (c.fine) { c.ellipse(cx, cy, rx, ry, col); return; }
  for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
    const t = 1 - (y * y) / (ry * ry);
    if (t < 0) continue;
    const hw = Math.round(rx * Math.sqrt(t) - 0.15);
    c.rect(Math.round(cx - hw), Math.round(cy + y), hw * 2 + 1, 1, col);
  }
}
// Alles ab Weltzeile y abwärts löschen (ersetzt ctx.clearRect über die volle Breite)
function clearBelow(c, y) {
  if (c._canvas) c.ctx.clearRect(-c.ox, y, c.w, c.h);
  c.buf.fill(0, clamp(Math.round((y + c.oy) * c.res), 0, c.H) * c.W);
}

function toneI(n, nx, ny, nz, bias, noise) {
  const t = 0.28 + 0.62 * (nx * LX + ny * LY + nz * LZ) + bias + noise;
  return clamp(Math.floor(t * n), 0, n - 1);
}

// Schattierte Ellipse (optional gedreht). Materialrauschen nur bei res 1 (fein: keine Sprenkel).
function ell(p, cx, cy, rx, ry, ramp, o = {}) {
  const { rot = 0, seed = 1, bias = 0, rim = 0 } = o, noise = p.fine ? 0 : (o.noise ?? 0);
  if (rim) ell(p, cx, cy, rx + rim, ry + rim, [ramp[0]], { rot });
  const c = Math.cos(rot), s = Math.sin(rot);
  const R = Math.ceil(Math.max(rx, ry)) + 1;
  const rp = ramp.map(col32), n = rp.length;
  scan(p, Math.floor(cx - R), Math.floor(cy - R), cx + R, cy + R, (x, y) => {
    const dx = x - cx, dy = y - cy;
    const u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry;
    const d2 = u * u + v * v;
    if (d2 > 1) return 0;
    const nz = Math.sqrt(1 - d2), nx = u * c - v * s, ny = u * s + v * c;
    const nn = noise ? (hash2(Math.round(dx) + 64, Math.round(dy) + 64, seed) - 0.5) * noise : 0;
    return rp[toneI(n, nx, ny, nz, bias, nn)];
  });
}

// Schattierte Kapsel (Gliedmaßen): Radius r0 -> r1.
function cap(p, x0, y0, x1, y1, r0, r1, ramp, o = {}) {
  const { seed = 1, bias = 0, rim = 0 } = o, noise = p.fine ? 0 : (o.noise ?? 0);
  if (rim) cap(p, x0, y0, x1, y1, r0 + rim, r1 + rim, [ramp[0]]);
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 0.0001;
  const R = Math.ceil(Math.max(r0, r1)) + 1;
  const rp = ramp.map(col32), n = rp.length;
  scan(p, Math.floor(Math.min(x0, x1) - R), Math.floor(Math.min(y0, y1) - R), Math.ceil(Math.max(x0, x1) + R), Math.ceil(Math.max(y0, y1) + R), (px, py) => {
    const t = clamp(((px - x0) * dx + (py - y0) * dy) / l2, 0, 1);
    const r = r0 + (r1 - r0) * t;
    const ex = px - (x0 + dx * t), ey = py - (y0 + dy * t);
    if (ex * ex + ey * ey > r * r) return 0;
    const nx = ex / (r || 1), ny = ey / (r || 1), nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const nn = noise ? (hash2(Math.round(px - x0) + 64, Math.round(py - y0) + 64, seed) - 0.5) * noise : 0;
    return rp[toneI(n, nx, ny, nz, bias, nn)];
  });
}

// Gefülltes Polygon (Scanline im Feinraster, ohne Kantenglättung). col: Farbe oder (x,y)=>Farbe.
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

// Leuchtpunkt/-fleck auf der Glow-Ebene (konzentrisch; fein: Ringe in Feinpixeln)
function glowDot(g, x, y, r, k = 1) {
  if (r <= 0.6) { g.px(x, y, GLOW[Math.min(4, 2 + k)]); return; }
  oval(g, x, y, r + 1, r + 1, GLOW[1]);
  oval(g, x, y, r, r, GLOW[2]);
  oval(g, x, y, Math.max(0.5, r - 1), Math.max(0.5, r - 1), GLOW[3]);
  if (r > 1.5) oval(g, x, y, Math.max(0.5, r - 2), Math.max(0.5, r - 2), GLOW[4]);
}

// Glühende Risse innerhalb einer Ellipse (Random Walk, relativ zur Mitte). heat 0..1.
// Fein: Riss als Linie, farbiger Saum (Weltpixelstärke) mit hellem Kern (1 Feinpixel), Leucht-Ebene ebenso.
function veins(p, g, cx, cy, rx, ry, seed, n, heat = 1, o = {}) {
  const { len = 6, dark = null } = o;
  for (let i = 0; i < n; i++) {
    let x = (hash2(i, 1, seed) - 0.5) * 1.3 * rx, y = (hash2(i, 2, seed) - 0.5) * 1.3 * ry;
    let a = hash2(i, 3, seed) * Math.PI * 2;
    const Ln = Math.round(len * (0.6 + hash2(i, 4, seed) * 0.8));
    let lx = x, ly = y;
    for (let s = 0; s < Ln; s++) {
      if ((x * x) / (rx * rx * 0.8) + (y * y) / (ry * ry * 0.8) > 1) break;
      const mid = 1 - Math.abs(s / Ln - 0.5) * 2;
      const h = heat * (0.45 + mid * 0.55);
      if (!p.fine) {
        if (h < 0.18) p.px(cx + x, cy + y, dark || LAVA[0]);
        else {
          p.px(cx + x, cy + y, h > 0.75 ? LAVA[3] : h > 0.45 ? LAVA[2] : LAVA[1]);
          g.px(cx + x, cy + y, GLOW[h > 0.75 ? 3 : h > 0.45 ? 2 : 1]);
        }
      } else {
        const x0 = cx + lx, y0 = cy + ly, x1 = cx + x, y1 = cy + y;
        if (h < 0.18) p.fline(x0, y0, x1, y1, dark || LAVA[0]);
        else {
          p.fline(x0, y0, x1, y1, h > 0.75 ? LAVA[2] : LAVA[1], 1);
          p.fline(x0 + 0.25, y0 + 0.25, x1 + 0.25, y1 + 0.25, h > 0.75 ? LAVA[5] : h > 0.45 ? LAVA[4] : LAVA[3]);
          g.fline(x0, y0, x1, y1, GLOW[h > 0.75 ? 2 : 1], 1);
          g.fline(x0 + 0.25, y0 + 0.25, x1 + 0.25, y1 + 0.25, GLOW[h > 0.75 ? 4 : h > 0.45 ? 3 : 2]);
        }
      }
      lx = x; ly = y;
      x += Math.cos(a); y += Math.sin(a) * 0.85;
      a += (hash2(i, s + 7, seed) - 0.5) * 1.5;
    }
  }
}

// Flammenzunge: Basis (x,y), wächst nach oben, neigt sich um lean px je Zeile.
// Fein: Zeilen/Spalten in Feinpixeln (weicher Umriss, heißer heller Kern), Ausfransen je Weltpixel (kein Flimmern).
function flame(p, g, x, y, h, w, ph, o = {}) {
  const { lean = 0, seed = 3, hot = 1, glowOnly = false } = o;
  const q = p.step, fine = p.fine;
  for (let j = 0; j < h; j += q) {
    const f = j / h;
    const hw = w * (1 - f * f * 0.85) * (0.82 + 0.28 * Math.sin(ph * 2 + j * 1.3 + seed));
    const off = lean * j + Math.sin(ph + j * 0.8 + seed) * f * 1.4;
    const K = Math.ceil(hw);
    for (let k = -K; k <= K; k += q) {
      const e = Math.abs(k) / (hw + 0.01);
      if (e > 1) continue;
      if (f > 0.5 && hash2(Math.floor(k) + 9, Math.floor(j) + Math.floor(ph * 3), seed) < (f - 0.45) * 1.3) continue;
      const heat = (1 - f * 0.85) * (1 - e * 0.75) * hot;
      const i = heat > 0.72 ? 5 : heat > 0.55 ? 4 : heat > 0.38 ? 3 : heat > 0.22 ? 2 : 1;
      const gi = Math.min(4, Math.max(1, i - 1));
      if (fine) {
        const X = x + off + k + 0.25, Y = y - j + 0.5;
        if (!glowOnly) p.dot(X, Y, LAVA[i]);
        g.dot(X, Y, GLOW[gi]);
      } else {
        if (!glowOnly) p.px(x + off + k, y - j, LAVA[i]);
        g.px(x + off + k, y - j, GLOW[gi]);
      }
    }
  }
}

// Feuerball (Hand, Projektil-Auftakt)
function fireball(p, g, x, y, r, ph) {
  if (r < 0.5) return;
  ell(p, x, y, r, r, [LAVA[2], LAVA[3], LAVA[4], LAVA[5]], { bias: 0.1 });
  flame(p, g, x - 0.5, y - r * 0.4, Math.round(r * 2.2), r * 0.7, ph, { lean: -0.25, seed: 5 });
  glowDot(g, x, y, r + 0.5);
  if (p.fine) { p.dot(x - r * 0.35, y - r * 0.35, '#ffffff'); p.dot(x - r * 0.35 + 0.5, y - r * 0.35, LAVA[5]); }
}

// Staub-/Funkenkranz am Boden (Einschlag)
function dustRing(p, g, x, y, r, seed, cols, sparks = true) {
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + hash2(i, 1, seed) * 0.3;
    const rr = r * (0.7 + hash2(i, 2, seed) * 0.5);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.4 - (Math.sin(a) < 0 ? hash2(i, 3, seed) * 3 : 0);
    p.px(px, py, cols[i % cols.length]);
    if (hash2(i, 4, seed) < 0.5) p.px(px + 1, py, cols[(i + 1) % cols.length]);
    if (sparks && hash2(i, 5, seed) < 0.35) {
      const sy = py - 2 - hash2(i, 6, seed) * 5;
      p.px(px, sy, LAVA[4]); g.px(px, sy, GLOW[3]);
      if (p.fine) { p.dot(px, sy, LAVA[5]); g.dot(px, sy, GLOW[4]); }
    }
  }
}

// Robe: Falten (Licht von links), zerfetzter Saum, glimmende Funken. Fein: zweifarbige Faltenkanten
// (heller Grat, dunkle Kehle), Saum und Funken je Weltpixel (kein Sprenkel).
function robe(p, g, x, top, bottom, wTop, wBot, lean, hem, ramp, char, seed, embers = 1) {
  const H = bottom - top, fine = p.fine, q = p.step;
  const n = ramp.length;
  const jEnd = fine ? Math.floor(H) + 0.5 : H;
  for (let j = 0; j <= jEnd; j += q) {
    const f = j / H;
    const cx = x + lean * (H - j) * 0.35;
    const hw = wTop + (wBot - wTop) * Math.pow(Math.min(f, 1.04), 0.8);
    const sway = Math.sin(hem + f * 2) * f * 1.4;
    const k0 = fine ? Math.round(-hw) - 0.25 : Math.round(-hw), k1 = fine ? Math.round(hw) + 0.25 : Math.round(hw);
    for (let k = k0; k <= k1; k += q) {
      const kr = Math.round(k), jr = Math.floor(j);
      const u = (k + hw) / (2 * hw);
      if (jr > H - 3) {
        const tear = hash2(kr + 30, 3, seed) * 3;
        if (H - jr < tear - 0.5 + Math.sin(hem + kr) * 0.6) continue;
      }
      const fold = Math.sin((k - lean * j * 0.2) * 1.3 + sway) * 0.5 + 0.5;
      const t = (1 - u) * 0.55 + fold * 0.35 - f * 0.25 + 0.2;
      let ci = clamp(Math.floor(t * n), 0, n - 1);
      let c = ramp[ci];
      if (f > 0.72) c = char[clamp(Math.floor(t * char.length), 0, char.length - 1)];
      else if (fine) {
        if (fold > 0.93) c = ramp[Math.min(n - 1, ci + 1)];
        else if (fold < 0.06) c = ramp[Math.max(0, ci - 1)];
      }
      if (fine) {
        const X = cx + k + sway, Y = top + j;
        p.dot(X, Y, c);
        if (embers && f > 0.78 && j === jr && hash2(kr + 50, jr, seed) < 0.07 * embers) {
          // Funke: heißer Kern (1 Feinpixel) mit glühendem Saum daneben
          const core = k - kr < 0;
          p.dot(X, Y, core ? LAVA[4] : LAVA[2]); g.dot(X, Y, GLOW[core ? 3 : 1]);
        }
      } else {
        p.px(cx + k + sway, top + j, c);
        if (embers && f > 0.78 && hash2(k + 50, j, seed) < 0.07 * embers) {
          p.px(cx + k + sway, top + j, LAVA[3]); g.px(cx + k + sway, top + j, GLOW[2]);
        }
      }
    }
  }
}

// Kristall-/Obsidiansplitter: Basis (x,y), Richtung a, Länge len, halbe Breite w. Zwei Facetten,
// heller Grat, weiße Spitze. ramp mind. 5 Stufen. gl: Leuchtfarben für innere Glut (optional).
function shard(p, g, x, y, a, len, w, ramp, o = {}) {
  const { gl = null, tipW = 0, spark = true, base = 0.35 } = o;
  const ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
  const lightN = nx * -0.6 + ny * -0.8 > 0 ? 1 : -1;
  const S = (s, k) => [x + ux * s + nx * k, y + uy * s + ny * k];
  const mid = len * base;
  const Lp = [S(0, -w * 0.7), S(mid, -w), S(len, -tipW)], Rp = [S(0, w * 0.7), S(mid, w), S(len, tipW)];
  const n = ramp.length;
  const light = lightN > 0 ? Rp : Lp, dark = lightN > 0 ? Lp : Rp;
  poly(p, [S(0, 0), dark[0], dark[1], dark[2], S(len, 0)], ramp[Math.max(0, Math.floor(n * 0.3))]);
  poly(p, [S(0, 0), light[0], light[1], light[2], S(len, 0)], ramp[Math.floor(n * 0.62)]);
  const a0 = S(len * 0.15, 0), a1 = S(len * 0.95, 0);
  if (p.fine) {
    // Grat als Glanzlinie (1 Feinpixel), Kanten fein
    p.fline(a0[0], a0[1], a1[0], a1[1], ramp[n - 2]);
    p.fline(light[1][0], light[1][1], light[2][0], light[2][1], ramp[n - 1]);
    p.fline(dark[1][0], dark[1][1], dark[2][0], dark[2][1], ramp[0]);
    const m = S(len * 0.5, lightN * w * 0.35); p.dot(m[0], m[1], ramp[n - 1]);
    if (spark) { const t = S(len - 0.4, 0); p.dot(t[0], t[1], '#ffffff'); }
  } else {
    p.line(a0[0], a0[1], a1[0], a1[1], ramp[n - 2]);
    p.line(light[1][0], light[1][1], light[2][0], light[2][1], ramp[n - 1]);
    p.line(dark[1][0], dark[1][1], dark[2][0], dark[2][1], ramp[0]);
    if (spark) { const t = S(len - 0.5, 0); p.px(t[0], t[1], '#ffffff'); }
  }
  if (gl) {
    const c = S(len * 0.35, 0);
    g.px(c[0], c[1], gl[1]); const c2 = S(len * 0.55, 0); g.px(c2[0], c2[1], gl[0]);
  }
  return { tip: { x: S(len, 0)[0], y: S(len, 0)[1] } };
}

// Schwung-Schleier: geschlossene Sichel von a0 nach a1 um (cx,cy), am frischen Ende breit und hell.
// Dicht je Feinpixel (keine Streuung → kein Flimmern). sy staucht senkrecht.
function smearArc(p, g, cx, cy, a0, a1, r0, r1, cols, gcols, sy = 1) {
  const q = p.step, R = 1 / q, fine = p.fine;
  const n = Math.ceil(Math.abs(a1 - a0) * r1 * 2 * R) + 2;
  for (let i = 0; i <= n; i++) {
    const f = i / n, a = a0 + (a1 - a0) * f;
    const th = (r1 - r0) * (0.12 + 0.75 * f * f);
    for (let r = r1 - th; r <= r1; r += 0.5 * q) {
      const radial = (r - (r1 - th)) / (th || 1);
      const x = Math.round((cx + Math.cos(a) * r) * R) * q, y = Math.round((cy + Math.sin(a) * r * sy) * R) * q;
      const c = radial > 0.72 ? cols[2] : radial > 0.3 ? cols[1] : cols[0];
      if (fine) p.dot(x, y, c); else p.px(x, y, c);
      if (g && gcols && f > 0.35 && radial > 0.4) { const gc = radial > 0.72 ? gcols[1] : gcols[0]; if (fine) g.dot(x, y, gc); else g.px(x, y, gc); }
    }
  }
}

// Schwung-Schleier als geschlossene Sichel um (cx,cy) in Pixelabständen: am frischen Ende breit und hell,
// zum Anfang spitz auslaufend, harte Stufen. Fein: im Feinraster abgetastet.
function arcSmear(p, g, cx, cy, a0, a1, r0, r1, cols, seed = 13, glowIt = true) {
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1), span = hi - lo || 1;
  const R1 = Math.ceil(r1), q = p.step, fine = p.fine;
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
    if (fine) { p.dot(cx + x, cy + y, c); if (gc) g.dot(cx + x, cy + y, gc); }
    else { p.px(cx + x, cy + y, c); if (gc) g.px(cx + x, cy + y, gc); }
  }
}

// Randlicht (Nachbearbeitung im Pixelpuffer, in Texeln): Texel mit freier Oberkante/linker Kante werden zur
// Lichtfarbe gezogen, freie rechte Kanten schwach zur Gegenlichtfarbe. Fein wirkt es auf die äußersten zwei
// Feinpixel (innen schwächer), damit die Silhouette so kräftig bleibt wie vorher; buildFrame gibt danach nur
// noch den Kontaktschatten (FINISH), keine zweite (kühle) Lichtkante.
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rim(p, key, keyK = 0.42, back = null, backK = 0.3) {
  const W = p.W, H = p.H;
  let img = null, d;
  if (p._canvas) { img = p.ctx.getImageData(0, 0, W, H); d = img.data; } else d = new Uint8ClampedArray(p.buf.buffer);
  // Deckmaske mit 2 Texeln Rand (keine Grenzprüfung nötig)
  const MW = W + 4, A = new Uint8Array(MW * (H + 4));
  for (let y = 0; y < H; y++) for (let x = 0, i = y * W, m = (y + 2) * MW + 2; x < W; x++, i++, m++) if (d[i * 4 + 3] > 40) A[m] = 1;
  const k = hexRgb(key), b = back ? hexRgb(back) : null;
  const deep = p.fine;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const m = (y + 2) * MW + x + 2;
    if (!A[m]) continue;
    const i = (y * W + x) * 4;
    const up = !A[m - MW], lf = !A[m - 1], ul = !A[m - MW - 1];
    let t = 0, c = null;
    if (up || lf) { t = keyK * (up && lf ? 1.15 : up ? 1 : 0.75); c = k; }
    else if (ul) { t = keyK * 0.45; c = k; }
    else if (b && (!A[m + 1] || !A[m - MW + 1])) { t = backK; c = b; }
    else if (deep) {
      // zweites Feinpixel: schwächer
      const up2 = !A[m - 2 * MW], lf2 = !A[m - 2];
      if (up2 || lf2) { t = keyK * 0.4 * (up2 ? 1 : 0.75); c = k; }
      else if (b && !A[m + 2]) { t = backK * 0.5; c = b; }
    }
    if (c) {
      t = Math.min(0.8, t);
      d[i] += (c[0] - d[i]) * t; d[i + 1] += (c[1] - d[i + 1]) * t; d[i + 2] += (c[2] - d[i + 2]) * t;
    }
    // fein: Kontaktschatten unten (1 Feinpixel), wie der Feinschliff von buildFrame
    if (deep && !up && !A[m + MW]) { d[i] *= 0.74; d[i + 1] *= 0.74; d[i + 2] *= 0.74; }
  }
  if (img) p.ctx.putImageData(img, 0, 0);
}

// Feinschliff von buildFrame: nur Kontaktschatten (das warme Randlicht übernimmt rim)
const FINISH = false;

// Rahmen-Bau: draw(p, g) -> meta mit absoluten Koordinaten. pad = Rand um die Zeichenfläche.
function makeFrame(W, H, AX, AY, draw, fx = null, pad = 0) {
  const W2 = W + pad * 2, H2 = H + pad * 2, res = fineRes();
  const g = new FineCanvas(W2, H2, res);
  g.translate(pad, pad);
  let meta = {};
  const f = buildFrame(W2, H2, AX + pad, AY + pad, (p) => { p.translate(pad, pad); meta = draw(p, g) || {}; OCC = null; }, { fine: true, res, finish: FINISH });
  f.glow = new SpriteFrame(g._canvas ? g.canvas : pixelsToCanvas(g.buf, g.W, g.H), (AX + pad) * res, (AY + pad) * res, res);
  f.meta = {};
  for (const k in meta) f.meta[k] = { dx: Math.round(meta[k].x - AX), dy: Math.round(meta[k].y - AY) };
  f.fx = fx;
  return f;
}
// n Frames aus einer Keyframe-Spur. spec = { W, H, AX, AY, pad?, draw(p, g, P, extra, t) }
function track(spec, keys, n, { loop = false, extras = {} } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = loop ? i / n : n === 1 ? 1 : i / (n - 1);
    const P = sample(keys, t);
    const ex = extras[i] || {};
    out.push(makeFrame(spec.W, spec.H, spec.AX, spec.AY, (p, g) => spec.draw(p, g, P, ex, t), ex.fx ?? null, spec.pad ?? 8));
  }
  return out;
}
const still = (spec, draw, fx = null) => makeFrame(spec.W, spec.H, spec.AX, spec.AY, draw, fx, spec.pad ?? 8);
// Frame-Spezifikation mit Randlicht-Durchgang
function spec(base, draw, rimKey, rimBack) {
  return { ...base, draw: (p, g, P, ex, t) => { const m = draw(p, g, P, ex, t); rim(p, rimKey, 0.34, rimBack, 0.28); return m; } };
}
function stillR(S, draw, fx, rimKey, rimBack) {
  return still(S, (p, g) => { const m = draw(p, g); rim(p, rimKey, 0.42, rimBack, 0.28); return m; }, fx);
}


// ================================================================ Materialien

const OBS = ['#07050b', '#110b17', '#1c1325', '#2a1d36', '#3c2b4c', '#554266', '#7a6690'];
const OBS_D = ['#050308', '#0b0710', '#140e1b', '#1e1627', '#2a1f35'];
const GOLD = ['#3a2208', '#6a4210', '#a06a1c', '#d49a32', '#f2c85a', '#fff0a8'];
const CRIM = ['#1e0508', '#3a0a10', '#5e1218', '#861c20', '#b02c26'];
const ASHR = ['#1e1a1b', '#2e2929', '#403a39', '#554d4a', '#6c625d', '#8a7f78'];
const HIDE = ['#080405', '#110709', '#1b0c0d', '#291313', '#3b1c18', '#54281e'];
const RIM_GOLD = '#ffe0a0', BACK_EMBER = '#ff7a30';
const SMEAR_W = [GOLD[2], GOLD[4], '#fff4d0'];

// Glanzlinie: fein 1 Feinpixel, bei res 1 eine Weltpixel-Linie wie bisher
const GL = (p, x0, y0, x1, y1, c) => (p.fine ? p.fline(x0, y0, x1, y1, c) : p.line(x0, y0, x1, y1, c));
// Niete (nur fein): Glanzpunkt oben links, Schatten unten rechts
function rivet(p, x, y, hi = GOLD[5], lo = GOLD[1]) { p.dot(x, y, hi); p.dot(x + 0.5, y + 0.5, lo); }

// Gold-Filigran: kleine Rankenlinie auf einer Fläche (fein: Feinpixel-Ranke mit Gravurschatten, Einrollungen, Glanz)
function filigree(p, x, y, w, seed) {
  if (p.fine) {
    for (let i = 0; i < w; i += 0.5) {
      const yy = y + 0.25 + Math.sin(i * 1.3 + seed) * 0.8;
      p.dot(x + i + 0.25, yy + 0.5, GOLD[1]);
      p.dot(x + i + 0.25, yy, i % 1.5 === 0 ? GOLD[4] : GOLD[3]);
    }
    for (let i = 1; i < w - 0.5; i += 2.5) {
      const yy = y + 0.25 + Math.sin(i * 1.3 + seed) * 0.8, up = Math.cos(i * 1.3 + seed) > 0 ? 1 : -1;
      p.dot(x + i + 0.75, yy + up * 0.5, GOLD[3]); p.dot(x + i + 1.25, yy + up, GOLD[4]); p.dot(x + i + 0.75, yy + up * 1.5, GOLD[2]);
    }
    p.dot(x + 0.25, y + 0.25 + Math.sin(seed) * 0.8, GOLD[5]);
    return;
  }
  for (let i = 0; i < w; i++) {
    const yy = y + Math.round(Math.sin(i * 1.3 + seed) * 0.8);
    p.px(x + i, yy, i % 3 === 0 ? GOLD[4] : GOLD[3]);
  }
}

// ================================================================ Thronwache

const TG = { W: 80, H: 64, AX: 34, AY: 56, pad: 10 };
const GD = { legH: 12, thigh: 6.5, shin: 7, spine: 11, upper: 5, fore: 5.5, sh: 1.5, hipW: 1.2 };
const TG_REST = {
  hipX: 0, hipY: 0, lean: 0.05, head: 0, headY: 0, fFx: 4, fFy: 0, fBx: -4, fBy: 0,
  hFx: 5, hFy: 6, hBx: 5, hBy: 4, ha: -1.35, grip: 8, shT: 0, cape: 0.1, capeT: 0, eye: 1, kneel: 0,
};
const tgp = (o) => ({ ...TG_REST, ...o });
const HAL_L = 36; // lange Hellebarde: überragt die Wache deutlich (Silhouette des Hellebardiers)

// Hellebarde: Hand bei (hx,hy), Achse a, grip = Abstand Hand–Schaftende.
function halberd(p, g, hx, hy, a, grip, heat) {
  const c = Math.cos(a), s = Math.sin(a), nx = -s, ny = c;
  const b0 = -grip, b1 = HAL_L - grip;
  // Schaft: dunkles Holz mit Goldringen
  cap(p, hx + c * b0, hy + s * b0, hx + c * b1, hy + s * b1, 0.9, 0.9, ['#140a08', '#24140c', '#3a2214', '#553420']);
  for (const t of [b0 + 1, b1 - 8, b1 - 11]) { p.px(hx + c * t, hy + s * t, GOLD[4]); p.px(hx + c * t + nx * 0.8, hy + s * t + ny * 0.8, GOLD[2]); }
  // Kopf: Axtblatt (Mondsichel) auf der Schlagseite, Haken hinten, Stoßspitze oben
  const hc = { x: hx + c * (b1 - 4), y: hy + s * (b1 - 4) };
  // Blattseite = die Seite, deren Normale nach vorn (rechts) zeigt
  const side = nx > 0 ? 1 : -1;
  // fein: Blatt in Feinpixeln (schmale Schneide, Fase, Glanz), sonst Weltpixel wie bisher
  const fq = p.fine ? 0.25 : 0.5, fe = p.fine ? 0.4 : 0.6, fb = p.fine ? 1.3 : 1.6;
  for (let t = -4; t <= 3; t += fq) {
    const f = (t + 4) / 7;
    const reach = 2 + Math.sin(f * Math.PI) * 4.5 + (f > 0.85 ? (f - 0.85) * 10 : 0);
    for (let k = 0.5; k <= reach; k += fq) {
      const x = hc.x + c * t + nx * side * k, y = hc.y + s * t + ny * side * k;
      const edge = k > reach - fe;
      const col = edge ? (t < 0 ? '#fff0c8' : GOLD[4]) : k < 1.5 ? GOLD[2] : k > reach - fb ? OBS[6] : t < -0.5 ? OBS[5] : OBS[4];
      dot(p, x, y, col);
      if (edge && heat > 0.3) dot(g, x, y, GLOW[heat > 0.8 ? 3 : 1]);
    }
  }
  // Glutrune im Blatt
  const rx = hc.x + nx * side * 3, ry = hc.y + ny * side * 3;
  p.px(rx, ry, LAVA[3]); g.px(rx, ry, GLOW[3]); p.px(rx + c, ry + s, LAVA[2]); g.px(rx + c, ry + s, GLOW[2]);
  // Haken hinten
  L(p, hc.x - nx * side, hc.y - ny * side, hc.x - nx * side * 4 + c * 1.5, hc.y - ny * side * 4 + s * 1.5, OBS[4]);
  p.px(hc.x - nx * side * 4 + c * 1.5, hc.y - ny * side * 4 + s * 1.5, GOLD[4]);
  // Spitze
  const tip = { x: hx + c * (b1 + 5), y: hy + s * (b1 + 5) };
  shard(p, g, hx + c * (b1 - 1), hy + s * (b1 - 1), a, 6, 1.4, OBS, { base: 0.3 });
  // Tülle gold
  cap(p, hc.x - c * 4.5, hc.y - s * 4.5, hc.x + c * 3, hc.y + s * 3, 1.3, 1.3, GOLD.slice(1, 5));
  if (p.fine) {
    // Glanzpunkt auf dem Blatt, Gravurlinie, heißer Runenkern, Ringe der Tülle, Holzmaserung am Schaft
    const B = (t, k) => [hc.x + c * t + nx * side * k, hc.y + s * t + ny * side * k];
    const gp = B(-2.5, 4.2); p.dot(gp[0], gp[1], '#ffffff');
    const e0 = B(-2.5, 2), e1 = B(1.5, 2.4); p.fline(e0[0], e0[1], e1[0], e1[1], OBS[3]);
    p.dot(rx, ry, LAVA[5]); g.dot(rx, ry, GLOW[4]);
    for (const t of [-4, -1.5, 1.5]) { const a0 = [hc.x + c * t - nx * 1.2, hc.y + s * t - ny * 1.2]; p.fline(a0[0], a0[1], a0[0] + nx * 2.4, a0[1] + ny * 2.4, GOLD[1]); }
    const tl = [hc.x - c * 4 - nx * 0.6, hc.y - s * 4 - ny * 0.6]; p.fline(tl[0], tl[1], tl[0] + c * 6, tl[1] + s * 6, GOLD[5]);
    for (let t = b0 + 2; t < b1 - 12; t += 2.5) p.dot(hx + c * t - nx * 0.4, hy + s * t - ny * 0.4, '#6a4428');
  }
  return { tip, blade: { x: hc.x + nx * side * 6, y: hc.y + ny * side * 6 } };
}

// Turmschild: Obsidian mit Goldrand und glühender Sonnenscheibe
function towerShield(p, g, x, y, tilt, heat) {
  const w = 4.5 - tilt * 1.5, h = 9;
  const pts = [[x - w, y - h], [x + w, y - h], [x + w, y + h - 3], [x, y + h], [x - w, y + h - 3]];
  poly(p, pts.map(([a, b]) => [a - 1, b - 1]), GOLD[2]);
  poly(p, pts.map(([a, b]) => [a + 1, b + 1]), GOLD[1]);
  poly(p, pts, OBS[3]);
  poly(p, [[x - w + 1, y - h + 1], [x, y - h + 1], [x, y + h - 1], [x - w + 1, y + h - 4]], OBS[4]);
  L(p, x - w, y - h, x + w, y - h, GOLD[5]); L(p, x - w, y - h, x - w, y + h - 3, GOLD[4]);
  L(p, x + w, y - h + 1, x + w, y + h - 3, GOLD[2]); L(p, x - w, y + h - 3, x, y + h, GOLD[3]); L(p, x, y + h, x + w, y + h - 3, GOLD[1]);
  // Sonnenscheibe
  ell(p, x, y - 1, 2.2, 2.2, [LAVA[2], LAVA[3], LAVA[4], LAVA[5]], { bias: 0.1 });
  if (p.fine) {
    // Fein: Strahlenkranz als Feinpixel-Strahlen, heller Glutkern, Nieten im Rand, Gravur und Glanzkante
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8, ca = Math.cos(a), sa = Math.sin(a);
      p.fline(x + ca * 2.9, y - 1 + sa * 2.9, x + ca * 3.9, y - 1 + sa * 3.9, i < 4 ? GOLD[3] : GOLD[4]);
      p.dot(x + ca * 3.9, y - 1 + sa * 3.9, GOLD[5]);
    }
    p.dot(x - 0.5, y - 1.5, '#ffffff'); p.dot(x, y - 1.5, LAVA[5]); p.dot(x - 0.5, y - 1, LAVA[5]);
    g.dot(x - 0.5, y - 1.5, GLOW[4]); g.dot(x, y - 1, GLOW[4]);
    for (let j = 0; j < 4; j++) { rivet(p, x - w + 0.5, y - h + 1.5 + j * 3.6); rivet(p, x + w - 1, y - h + 1.5 + j * 3.6, GOLD[4]); }
    p.fline(x - w + 0.5, y - h + 0.5, x + w - 0.5, y - h + 0.5, GOLD[5]);
    p.fline(x - w + 1.5, y + h - 4.5, x - 0.5, y + h - 2, OBS[5]); p.fline(x + w - 1.5, y - h + 2.5, x + 2.5, y - 3.5, OBS[2]);
  } else for (let i = 0; i < 8; i++) { const a = i * TAU / 8; p.px(x + Math.cos(a) * 3.4, y - 1 + Math.sin(a) * 3.4, GOLD[4]); }
  if (heat > 0.2) glowDot(g, x, y - 1, 1.5 + heat * 0.8);
}

function drawThroneGuard(p, g, P, ex) {
  const { AX, AY } = TG;
  const K = P.kneel;
  const R = rig({ ...P, hipY: P.hipY + K * 5 }, GD, AX, AY);
  const { hip, chest, pt, legF, legB, shF, shB } = R;
  const meta = {};
  if (K > 0.01) {
    const kx = hip.x - 2 - K * 2, ky = AY - 2;
    legB.jx += (kx - legB.jx) * K; legB.jy += (ky - legB.jy) * K;
    legB.ex += (kx - 7 - legB.ex) * K; legB.ey += (AY - legB.ey) * K;
  }
  const hF = { x: chest.x + P.hFx, y: chest.y + P.hFy }, hB = { x: chest.x + P.hBx, y: chest.y + P.hBy };
  const armF = ik(shF.x, shF.y, hF.x, hF.y, GD.upper, GD.fore, 1);
  const armB = ik(shB.x, shB.y, hB.x, hB.y, GD.upper, GD.fore, 1);
  const heat = 1;

  // --- 1. Umhang (karminrot, Goldsaum)
  const ct = pt(GD.spine, -2);
  if (p.fine) {
    // Fein: Umhang aus halben Bahnen (Feinpixel), zweifarbige Falten (heller Grat, dunkle Kehle), Goldsaum mit Glanz
    for (let s2 = 0; s2 < 14; s2++) {
      const i = s2 / 2, ii = Math.floor(i);
      const len = 14 - K * 4 + (hash2(ii, 2, 7) * 2 | 0) - i * 0.3;
      const fold = s2 % 4;
      for (let j = 0; j < len + 0.5; j += 0.5) {
        const v = j / len;
        const x = ct.x - 0.75 - i * 0.8 - P.cape * 8 * v * v + Math.sin(P.capeT + v * 3 + i * 0.6) * 0.8 * v;
        const y = ct.y + j + i * 0.15;
        const c = j >= len - 1.5 ? (j >= len - 0.5 ? GOLD[1] : s2 % 3 === 0 ? GOLD[4] : GOLD[2])
          : i < 1 ? CRIM[4] : i < 2 ? CRIM[3] : fold === 1 ? CRIM[3] : fold === 3 ? CRIM[0] : ii % 3 === 0 ? CRIM[1] : CRIM[2];
        p.dot(x, y, c); p.dot(x + 0.5, y, c);
      }
    }
  } else for (let i = 0; i < 7; i++) {
    const len = 14 - K * 4 + (hash2(i, 2, 7) * 2 | 0) - i * 0.3;
    for (let j = 0; j < len; j++) {
      const v = j / len;
      const x = ct.x - 1 - i * 0.8 - P.cape * 8 * v * v + Math.sin(P.capeT + v * 3 + i * 0.6) * 0.8 * v;
      const y = ct.y + j + i * 0.15;
      p.px(x, y, j >= len - 1.5 ? GOLD[2] : i < 2 ? CRIM[3] : i % 3 === 0 ? CRIM[1] : CRIM[2]);
    }
  }
  // --- Hellebarde hinter dem Körper (Ausholen)
  let hal = null;
  const smear = () => { if (ex.smear) smearArc(p, g, shF.x, shF.y + 1, ex.smear[0], ex.smear[1], HAL_L - P.grip - 4, HAL_L - P.grip + 5, SMEAR_W, [GLOW[1], GLOW[3]], 1); };
  if (ex.halBehind) { smear(); hal = halberd(p, g, hF.x, hF.y, P.ha, P.grip, heat); }

  // --- 2. hinteres Bein
  const RB = OBS_D;
  cap(p, hip.x - 1, hip.y, legB.jx, legB.jy, 2.6, 2.3, RB);
  cap(p, legB.jx, legB.jy, legB.ex, legB.ey - 2, 2.3, 2.2, RB);
  poly(p, [[legB.ex - 2, legB.ey], [legB.ex - 2, legB.ey - 2], [legB.ex + 2, legB.ey - 2], [legB.ex + 4, legB.ey]], OBS[2]);
  p.px(legB.jx + 1, legB.jy, GOLD[2]);
  // --- 3. hinterer Arm (Schildarm) – Arm hinter dem Rumpf, Schild davor
  cap(p, shB.x, shB.y, armB.jx, armB.jy, 2.2, 2, RB);
  cap(p, armB.jx, armB.jy, armB.ex, armB.ey, 2, 2.2, RB);

  // --- Schild (hintere Hand): steht hinter dem Rumpf, ragt vorn heraus
  towerShield(p, g, armB.ex + 1, armB.ey + 1, P.shT, heat);
  meta.shield = { x: armB.ex + 1, y: armB.ey };

  // --- 4. Rumpf: Obsidianküraß, Goldkante, Waffenrock
  // Waffenrock (Tabard) vorn/hinten zwischen den Beinen
  for (let j = 0; j < 8 - K * 2; j++) {
    const a = pt(-j * 0.9, 0.6);
    p.rect(a.x - 2.5 + j * P.lean, a.y, 5, 1, j > 5 ? GOLD[2] : j % 3 === 0 ? CRIM[2] : CRIM[3]);
    p.px(a.x - 2.5 + j * P.lean, a.y, CRIM[4]);
    if (p.fine) {
      // Waffenrock: zweifarbige Falte (Grat hell, Kehle dunkel), Goldborte mit Glanz
      const x0 = a.x - 2.5 + j * P.lean;
      if (j <= 5) { p.dot(x0 + 1.5, a.y, CRIM[4]); p.dot(x0 + 1.5, a.y + 0.5, CRIM[4]); p.dot(x0 + 2, a.y, CRIM[1]); p.dot(x0 + 2, a.y + 0.5, CRIM[1]); p.dot(x0 + 3.5, a.y + 0.5, CRIM[1]); }
      else { p.dot(x0 + 0.5, a.y, GOLD[4]); p.dot(x0 + 2.5, a.y, GOLD[5]); p.fline(x0, a.y + 0.5, x0 + 4.5, a.y + 0.5, GOLD[1]); }
    }
  }
  // Tassetten
  for (let i = 0; i < 4; i++) {
    const a = pt(0, -4 + i * 2.6);
    poly(p, [[a.x, a.y], [a.x + 2.5, a.y], [a.x + 2.8, a.y + 4], [a.x - 0.2, a.y + 4]], OBS[i % 2 ? 3 : 4]);
    p.px(a.x + 1, a.y + 4, GOLD[3]);
    if (p.fine) { p.fline(a.x, a.y, a.x - 0.2, a.y + 3.5, OBS[5]); p.fline(a.x + 2.5, a.y + 0.5, a.x + 2.8, a.y + 3.5, OBS[1]); rivet(p, a.x + 1, a.y + 0.5, GOLD[4]); }
  }
  const hp = pt(0.5, 0.3), cp = pt(GD.spine - 1, 0.5);
  cap(p, hp.x, hp.y, cp.x, cp.y, 4.2, 5.6, OBS);
  ell(p, cp.x + 0.5, cp.y + 0.8, 5.5, 4.5, OBS, { rot: P.lean, bias: 0.06 });
  const q = (u, k, c) => { const o = pt(u, k); p.px(o.x, o.y, c); };
  for (let k = -4.5; k <= 4.5; k += 0.5) { q(1.2, k, GOLD[2]); q(1.7, k, GOLD[k < 0 ? 4 : 3]); }  // Gürtel
  for (let u = 3; u <= GD.spine; u += 0.5) q(u, 1.8, GOLD[4]);                                   // Brustgrat
  if (p.fine) {
    // Küraß: Glanzlinie auf der gewölbten Brust (oben links), Glanzpunkt, Kante der Bauchplatte
    for (let a = -2.75; a <= -1.55; a += 0.12) p.dot(cp.x + 0.5 + Math.cos(a + P.lean) * 3.9, cp.y + 0.8 + Math.sin(a + P.lean) * 3.1, OBS[6]);
    p.dot(cp.x - 2, cp.y - 2, '#b4a2cc'); p.dot(cp.x - 1.5, cp.y - 2, OBS[6]);
    const b0 = pt(3.5, -3.5), b1 = pt(3.5, 3.5); p.fline(b0.x, b0.y, b1.x, b1.y, OBS[2]);
    const b2 = pt(4, -3.5), b3 = pt(4, 0); p.fline(b2.x, b2.y, b3.x, b3.y, OBS[5]);
  }
  const sun = pt(GD.spine - 3, -0.5);
  p.px(sun.x, sun.y, LAVA[3]); p.px(sun.x + 1, sun.y, LAVA[2]); p.px(sun.x, sun.y + 1, LAVA[2]);
  g.px(sun.x, sun.y, GLOW[3]); g.px(sun.x + 1, sun.y, GLOW[1]); g.px(sun.x, sun.y + 1, GLOW[1]);
  if (p.fine) { p.dot(sun.x, sun.y, LAVA[5]); p.dot(sun.x + 0.5, sun.y + 0.5, LAVA[4]); g.dot(sun.x, sun.y, GLOW[4]); }
  filigree(p, sun.x - 4, sun.y + 3, 8, 1);
  // Glutrisse im Obsidian
  const vc = pt(4, -1.5);
  veins(p, g, vc.x, vc.y, 3, 3, 71, 2, 0.8, { len: 4 });

  // --- 5. vorderes Bein
  occlude(g);
  cap(p, hip.x + 1.5, hip.y, legF.jx, legF.jy, 2.9, 2.6, OBS);
  cap(p, legF.jx, legF.jy, legF.ex, legF.ey - 2, 2.6, 2.4, OBS);
  GL(p, legF.jx + 1.5, legF.jy + 1, legF.ex + 1.5, legF.ey - 3, OBS[6]);
  poly(p, [[legF.ex - 2, legF.ey], [legF.ex - 2, legF.ey - 2.5], [legF.ex + 2, legF.ey - 2.5], [legF.ex + 5, legF.ey]], OBS[4]);
  L(p, legF.ex - 2, legF.ey - 2.5, legF.ex + 2, legF.ey - 2.5, GOLD[3]);
  ell(p, legF.jx + 0.5, legF.jy, 2, 2, GOLD.slice(1), { bias: 0.1 });
  if (p.fine) {
    // Beinschiene: zweite Glanzlinie (Grat), Kniebuckel mit Glanzpunkt, Schuhplatten-Fugen
    p.fline(legF.jx + 0.5, legF.jy + 1.5, legF.ex + 0.5, legF.ey - 3, OBS[2]);
    p.dot(legF.jx - 0.5, legF.jy - 1, '#fff6c8'); p.dot(legF.jx + 1.5, legF.jy + 1, GOLD[1]);
    p.fline(legF.ex + 1, legF.ey - 2, legF.ex + 2.5, legF.ey - 0.5, OBS[2]); p.fline(legF.ex - 1.5, legF.ey - 2, legF.ex + 1, legF.ey - 2, OBS[6]);
  }
  occlude(null);


  // --- 7. Helm: spitzer Schaller-Helm (Obsidian), T-Visier mit Glut, karminroter Rosshaarbusch
  // (bewusst anders als der gehörnte Großhelm des Wächters und die Glutkrone des Fürsten)
  const neck = pt(GD.spine + 2, 0.8);
  const hx = Math.round(neck.x + P.head), hy = Math.round(neck.y - 4 + P.headY);
  // Rosshaarbusch: steigt aus der Helmspitze und fällt nach hinten über den Nacken
  const PLUME = ['#ff7a5a', '#e0483a', '#b02c26', '#861c20', '#5e1218'];
  if (p.fine) {
    // Fein: Rosshaar in Feinpixel-Strähnen; jede Strähne oben im Licht, unten im Schatten, einzelne helle Haare
    for (let s2 = 0; s2 < 16; s2++) {
      const i = s2 / 2, Ln = 11 + i * 0.7;
      for (let j = 0; j < Ln + 0.5; j += 0.5) {
        const v = j / Ln;
        const x = hx + 1.25 - i * 0.3 - v * (6 + P.cape * 3) + Math.sin(P.capeT + v * 3 + i) * 0.6 * v;
        const y = hy - 7.75 + i * 0.3 - Math.sin(v * Math.PI) * 3.5 + v * 8;
        const ci = Math.min(4, (Math.floor(i) >> 1) + (v > 0.75 ? 1 : 0));
        const hl = s2 % 5 === 1 && v > 0.1 && v < 0.7;
        p.dot(x, y + 0.5, PLUME[Math.min(4, ci + 1)]);
        p.dot(x, y, j < 1 ? (j < 0.5 ? GOLD[5] : GOLD[3]) : hl ? PLUME[Math.max(0, ci - 1)] : PLUME[ci]);
      }
    }
  } else for (let i = 0; i < 8; i++) {
    const L = 11 + i * 0.7;
    for (let j = 0; j < L; j++) {
      const v = j / L;
      const x = hx + 1 - i * 0.3 - v * (6 + P.cape * 3) + Math.sin(P.capeT + v * 3 + i) * 0.6 * v;
      const y = hy - 8 + i * 0.3 - Math.sin(v * Math.PI) * 3.5 + v * 8;
      p.px(x, y, j === 0 ? GOLD[4] : PLUME[Math.min(4, (i >> 1) + (v > 0.75 ? 1 : 0))]);
    }
  }
  ell(p, hx, hy, 3.8, 4.4, OBS, { bias: 0.1 });
  // Helmspitze (Schaller) und Nackenschirm
  poly(p, [[hx - 2.5, hy - 3], [hx + 0.5, hy - 7.5], [hx + 2.5, hy - 3]], OBS[4]);
  L(p, hx - 2, hy - 3.5, hx + 0.5, hy - 7.5, OBS[6]); p.px(hx + 0.5, hy - 8, GOLD[5]);
  poly(p, [[hx - 3.5, hy + 1], [hx - 6, hy + 4], [hx - 3, hy + 4]], OBS[3]); L(p, hx - 6, hy + 4, hx - 3, hy + 4, GOLD[2]);
  poly(p, [[hx - 3.5, hy], [hx + 4, hy - 1], [hx + 4.5, hy + 3], [hx + 1, hy + 5], [hx - 3, hy + 4]], OBS[3]);
  L(p, hx - 3, hy - 1, hx + 4, hy - 2, GOLD[4]);                    // Stirnreif
  p.px(hx + 1, hy - 2, LAVA[3]); g.px(hx + 1, hy - 2, GLOW[2]);
  // T-Visier
  const ec = ex.hurt ? '#ffffff' : LAVA[5];
  L(p, hx - 1, hy - 1, hx + 4, hy - 1, OBS[6]);                       // Visierkante im Licht
  p.rect(hx - 1, hy, 6, 1, VOID); p.rect(hx + 2, hy, 1, 3, VOID);
  p.px(hx + 3, hy + 2, OBS[1]); p.px(hx + 4, hy + 1, OBS[5]);           // Kinnplatte, Atemloch
  if (P.eye > 0.3) {
    p.px(hx, hy, LAVA[3]); p.px(hx + 1, hy, ec); p.px(hx + 3, hy, ec); p.px(hx + 4, hy, LAVA[3]); p.px(hx + 2, hy + 1, LAVA[2]);
    g.px(hx + 1, hy, GLOW[4]); g.px(hx + 3, hy, GLOW[4]); g.px(hx, hy, GLOW[2]); g.px(hx + 4, hy, GLOW[2]); g.px(hx + 2, hy + 1, GLOW[2]);
    if (P.eye > 1.2) g.rect(hx, hy, 5, 1, GLOW[3]);
  }
  p.px(hx - 2, hy - 3, OBS[6]);
  if (p.fine) {
    // Fein: Helmglanz (Bogen + Punkt), Glanzlinie der Visierkante mit Schatten darunter, Nieten am Stirnreif,
    // Augenschlitze: weißglühender Kern (1 Feinpixel) im orangefarbenen Saum, Atemlöcher
    for (let a = -2.7; a <= -1.7; a += 0.1) p.dot(hx + Math.cos(a) * 3, hy + Math.sin(a) * 3.6, OBS[6]);
    p.dot(hx - 1.5, hy - 2.5, '#c4b4dc');
    p.fline(hx - 1, hy - 1, hx + 4.5, hy - 1, OBS[6]); p.fline(hx - 1, hy - 0.5, hx + 4.5, hy - 0.5, OBS[1]);
    rivet(p, hx - 2.5, hy - 1, GOLD[5], GOLD[2]); rivet(p, hx + 3, hy - 2, GOLD[5], GOLD[2]);
    p.dot(hx + 3.5, hy + 3, VOID); p.dot(hx + 2.5, hy + 3.5, VOID); p.dot(hx + 4, hy + 2, OBS[6]);
    if (P.eye > 0.3) {
      for (const e of [hx + 1, hx + 3]) {
        p.dot(e, hy, LAVA[4]); p.dot(e + 0.5, hy, LAVA[4]); p.dot(e, hy + 0.5, LAVA[2]); p.dot(e + 0.5, hy + 0.5, LAVA[3]);
        p.dot(e + (e < hx + 2 ? 0.5 : 0), hy, ec); g.dot(e + (e < hx + 2 ? 0.5 : 0), hy, GLOW[4]);
      }
      p.dot(hx, hy + 0.5, LAVA[1]); p.dot(hx + 4.5, hy + 0.5, LAVA[1]);
    }
  }
  meta.eye = { x: hx + 2, y: hy };
  meta.head = { x: hx, y: hy - 12 };
  meta.mouth = { x: hx + 3, y: hy + 2 };

  // --- 8. vorderer Arm + Hellebarde + Schulterplatte
  const arm = () => {
    occlude(g);
    cap(p, shF.x, shF.y, armF.jx, armF.jy, 2.4, 2.2, OBS);
    cap(p, armF.jx, armF.jy, armF.ex, armF.ey, 2.2, 2.4, OBS);
    p.rect(armF.ex - 1.5, armF.ey - 1.5, 3, 3, OBS[4]); p.px(armF.ex - 1.5, armF.ey - 1.5, GOLD[4]);
    if (p.fine) { p.dot(armF.jx - 1, armF.jy - 1, OBS[6]); p.dot(armF.jx - 0.5, armF.jy - 1.5, '#b4a2cc'); }
    occlude(null);
  };
  const fist = () => {
    p.rect(hF.x - 1.5, hF.y - 1.5, 3, 3, OBS[4]); p.px(hF.x - 1.5, hF.y - 1.5, GOLD[4]);
    if (p.fine) { for (let k = 0; k < 3; k++) p.dot(hF.x - 1 + k, hF.y - 1.5 + k * 0.5, OBS[6]); p.fline(hF.x - 1.5, hF.y + 1, hF.x + 1, hF.y + 1, OBS[2]); p.dot(hF.x - 1.5, hF.y - 1.5, GOLD[5]); }
  };
  if (!ex.halBehind) { smear(); arm(); hal = halberd(p, g, hF.x, hF.y, P.ha, P.grip, heat); fist(); }
  else arm();
  occlude(g);
  ell(p, shF.x + 0.5, shF.y - 0.5, 3.8, 3, OBS, { bias: 0.1 });
  occlude(null);
  L(p, shF.x - 3, shF.y + 1.5, shF.x + 4, shF.y + 1.5, GOLD[3]);
  poly(p, [[shF.x - 1, shF.y - 2.5], [shF.x - 2, shF.y - 6], [shF.x + 1.5, shF.y - 2.5]], GOLD[3]);
  GL(p, shF.x - 1, shF.y - 3, shF.x - 2, shF.y - 6, GOLD[5]);
  if (p.fine) {
    // Schulterplatte: Glanzbogen, Glanzpunkt, Nieten auf der Goldkante, Schatten unter dem Dorn
    for (let a = -2.6; a <= -1.2; a += 0.12) p.dot(shF.x + 0.5 + Math.cos(a) * 2.9, shF.y - 0.5 + Math.sin(a) * 2.2, OBS[6]);
    p.dot(shF.x - 1, shF.y - 1.5, '#c4b4dc');
    for (let k = -2; k <= 3; k += 2.5) rivet(p, shF.x + k, shF.y + 1.5);
    p.fline(shF.x + 0.5, shF.y - 2.5, shF.x + 1.5, shF.y - 2.5, GOLD[1]);
  }
  meta.hand = { x: hF.x, y: hF.y };
  meta.tip = hal.tip;
  clearBelow(p, AY + 1); clearBelow(g, AY + 1);
  return meta;
}

// Gefallene Wache: liegende Rüstung, Schild, Hellebarde (k 0..1)
function drawGuardFallen(p, g, k) {
  const { AX, AY } = TG;
  const gy = AY;
  const cx = AX - 2;
  halberd(p, g, cx - 6, gy - 2, 0.05, 6, 1 - k);
  for (let i = 0; i < 12; i++) p.px(cx - 18 + i, gy - 1 - (i % 3 === 0 ? 1 : 0), i % 2 ? CRIM[2] : CRIM[1]);
  cap(p, cx - 12, gy - 3, cx - 20, gy - 2, 2.4, 2.2, OBS_D);
  ell(p, cx - 3, gy - 4, 7.5, 3.8, OBS, { bias: 0.08 });
  L(p, cx - 9, gy - 6, cx + 3, gy - 7, GOLD[4]);
  const hx = cx + 8;
  ell(p, hx, gy - 4, 3.6, 3.6, OBS, { bias: 0.1 });
  for (let i = 0; i < 5; i++) L(p, hx - 1, gy - 5, hx - 5 + i * 0.5, gy - 9 + i * 0.3, GOLD[3 + (i % 2)]);
  p.rect(hx, gy - 4, 3, 1, k < 0.6 ? LAVA[3] : VOID);
  if (k < 0.6) g.rect(hx, gy - 4, 3, 1, GLOW[2]);
  towerShield(p, g, cx + 16, gy - 8, 1.2, (1 - k) * 0.8);
  return { eye: { x: hx + 1, y: gy - 4 }, head: { x: hx, y: gy - 9 }, hand: { x: cx - 6, y: gy - 2 }, shield: { x: cx + 16, y: gy - 9 }, tip: { x: cx + 28, y: gy - 1 } };
}

function createThroneGuard() {
  const S = spec(TG, drawThroneGuard, RIM_GOLD, BACK_EMBER);
  const idleA = tgp({ hFx: 5, hFy: 7, ha: -1.4, grip: 9 });
  const idleB = tgp({ hFx: 5, hFy: 8, ha: -1.36, grip: 9, hipY: 1, lean: 0.08, hBy: 5, headY: 1, capeT: Math.PI });
  const idle = [];
  for (let i = 0; i < 6; i++) idle.push(mixP(idleA, idleB, (1 - Math.cos(i / 6 * TAU)) / 2));
  const walk = [];
  for (let i = 0; i <= 8; i++) {
    const ph = (i / 8) * TAU, sn = Math.sin(ph), c = Math.cos(ph);
    walk.push([i / 8, tgp({
      hipY: -Math.abs(c) * 1 + 0.5, lean: 0.1, fFx: 1 + sn * 4.5, fFy: Math.max(0, -c) * 2, fBx: -1 - sn * 4.5, fBy: Math.max(0, c) * 2,
      hFx: 5 + sn * 0.8, hFy: 7, ha: -1.3 + sn * 0.05, grip: 9, hBx: 5 - sn, cape: 0.4, capeT: ph, head: sn * 0.3,
    }), linear]);
  }
  // Ausholen: Hellebarde hoch über die Schulter nach hinten, Schild vor
  const w1 = tgp({ lean: -0.05, hipX: -1, hFx: 1, hFy: -4, ha: -2.2, grip: 10, hBx: 6, hBy: 3, shT: 0.5, fFx: 5, fBx: -5, eye: 1.3 });
  const w2 = tgp({ lean: -0.18, hipX: -1.5, hipY: 1, hFx: -2, hFy: -6, ha: -2.75, grip: 11, hBx: 7, hBy: 2, shT: 0.8, fFx: 6, fBx: -6, cape: 0.3, capeT: 1, eye: 1.5 });
  // Hieb: schräg von oben nach vorn-unten, Klinge fegt durch
  const s1 = tgp({ lean: 0.18, hipX: 1.5, hipY: 1, hFx: 7, hFy: -2, ha: -0.9, grip: 10, hBx: 2, hBy: 5, fFx: 7, fBx: -6, cape: 0.6, capeT: 2, eye: 1.5 });
  const s2 = tgp({ lean: 0.32, hipX: 3, hipY: 2, hFx: 10, hFy: 5, ha: 0.25, grip: 10, hBx: 0, hBy: 6, fFx: 8, fBx: -6, cape: 0.8, capeT: 3, eye: 1.3 });
  const s3 = tgp({ lean: 0.28, hipX: 2.5, hipY: 2, hFx: 10, hFy: 6, ha: 0.45, grip: 10, hBx: 1, hBy: 6, fFx: 8, fBx: -6, cape: 0.5, capeT: 4 });
  const s4 = tgp({ lean: 0.12, hipX: 1, hipY: 1, hFx: 7, hFy: 6, ha: -0.5, grip: 9, fFx: 6, fBx: -5, capeT: 5 });
  const hurtP = tgp({ lean: -0.2, hipX: -1.5, head: -1, headY: -1, hFx: 3, hFy: 6, ha: -1.7, hBx: 3, hBy: 3, shT: 1, eye: 1.4, cape: 0.3 });
  const d1 = tgp({ lean: -0.3, hipX: -2, head: -1.5, hFx: 3, hFy: 7, ha: -1.9, hBx: 2, hBy: 5, eye: 1.2 });
  const d2 = tgp({ kneel: 1, lean: 0.2, head: 1, headY: 1, hFx: 8, hFy: 10, ha: -0.4, hBx: 4, hBy: 9, eye: 0.7, fFx: 5, fBx: -7 });
  const d3 = tgp({ kneel: 1, lean: 0.45, head: 2, headY: 2, hFx: 10, hFy: 12, ha: 0.2, hBx: 6, hBy: 11, eye: 0.35, fFx: 5, fBx: -7 });
  return {
    idle: new Animation(idle.map((P) => track(S, [[0, P], [1, P]], 1)[0]), 6),
    walk: new Animation(track(S, walk, 8, { loop: true }), 10),
    windup: new Animation(track(S, [[0, idleA], [0.5, w1], [1, w2]], 4, { extras: { 3: { halBehind: true } } }), 8, false),
    strike: new Animation(track(S, [[0, s1], [0.3, s2, snap], [0.65, s3], [1, s4]], 4, {
      extras: { 0: { smear: [-2.1, -0.9] }, 1: { fx: 'impact', smear: [-1.2, 0.3] }, 2: { smear: [0, 0.5] } },
    }), 14, false),
    hurt: new Animation(track(S, [[0, hurtP], [1, idleA]], 2, { extras: { 0: { hurt: true } } }), 10, false),
    death: new Animation([
      ...track(S, [[0, hurtP], [0.35, d1], [0.7, d2, snap], [1, d3]], 4, { extras: { 0: { hurt: true }, 2: { fx: 'impact' } } }),
      stillR(S, (p, g) => drawGuardFallen(p, g, 0), 'impact', RIM_GOLD, BACK_EMBER),
      stillR(S, (p, g) => drawGuardFallen(p, g, 0.5), null, RIM_GOLD, BACK_EMBER),
      stillR(S, (p, g) => drawGuardFallen(p, g, 1), null, RIM_GOLD, BACK_EMBER),
    ], 8, false),
  };
}


// ================================================================ Glut-Höllenhund

const HH = { W: 66, H: 44, AX: 28, AY: 38, pad: 10 };
const HH_REST = {
  bx: 0, by: 0, pitch: 0, head: 0, jaw: 0.15, tail: 0, heat: 0.8, breath: 0, fl: 0, mane: 1, howl: 0,
  fAx: 0, fAy: 0, fBx: 0, fBy: 0, hAx: 0, hAy: 0, hBx: 0, hBy: 0,
};
const hhp = (o) => ({ ...HH_REST, ...o });

// Fell in Feinpixel-Strähnen entlang einer Achse (nur fein): Striche nach hinten gekämmt, oben im Licht hell,
// unten dunkel. Lage relativ zur Achse, damit die Strähnen mit dem Körper wandern (kein Flimmern).
function furStrands(p, x0, y0, x1, y1, r, n, seed, ramp, len = 1.6) {
  const dx = x1 - x0, dy = y1 - y0;
  for (let i = 0; i < n; i++) {
    const t = hash2(i, 1, seed), v = hash2(i, 2, seed) * 2 - 1;
    const cx = x0 + dx * t, cy = y0 + dy * t + v * r * 0.78;
    const c = v < -0.5 ? (i % 3 ? ramp[5] : ramp[4]) : v > 0.35 ? (i % 2 ? ramp[1] : ramp[0]) : (i % 2 ? ramp[2] : ramp[4]);
    p.fline(cx, cy, cx - len, cy + 0.4 + v * 0.4, c);
  }
}

function hellHead(p, g, nx, ny, P, ex, meta) {
  const jaw = P.jaw, up = P.howl;
  const ra = -up * 1.1;                               // Kopf nach oben drehen (Heulen)
  const c = Math.cos(ra), s = Math.sin(ra);
  const R = (u, v) => [nx + u * c - v * s, ny + u * s + v * c];
  // Schädel
  ell(p, nx, ny, 4.8, 4, HIDE, { noise: 0.09, seed: 31 });
  // Schnauze (lang, flach)
  poly(p, [R(1, -2.2), R(8.5, -0.8), R(9, 1.4), R(1, 2)], (x, y) => (y < ny + 0 ? HIDE[4] : HIDE[3]));
  const ln = [R(2, -2.2), R(8, -1)]; L(p, ln[0][0], ln[0][1], ln[1][0], ln[1][1], HIDE[5]);
  const nose = R(9, -0.4); p.px(nose[0], nose[1], '#0a0406');
  if (p.fine) {
    // Schädel-Fell in Strähnen, Schnauzenrücken als Glanzlinie, nasser Glanz auf der Nase, Lefzenkante
    furStrands(p, nx - 3, ny - 1, nx + 2, ny - 1.5, 3.2, 14, 33, HIDE, 1.3);
    const g0 = R(2.5, -1.9), g1 = R(8, -0.9); p.fline(g0[0], g0[1], g1[0], g1[1], '#6e3a2a');
    p.dot(nose[0] - 0.5, nose[1] - 0.5, '#8a6a64'); p.dot(nose[0] + 0.5, nose[1] + 0.5, '#2a1416');
    const l0 = R(1.5, 1.6), l1 = R(8.5, 1.3); p.fline(l0[0], l0[1], l1[0], l1[1], HIDE[1]);
  }
  // Kiefer (öffnet), Glutrachen
  const ja = jaw * 0.8;
  const J = (u, v) => { const a = ra + ja; return [nx + 0.5 + u * Math.cos(a) - (v + 2) * Math.sin(a), ny + u * Math.sin(a) + (v + 2) * Math.cos(a)]; };
  if (jaw > 0.12) {
    poly(p, [R(1, 1.6), R(8.5, 1.4), J(8, 0), J(1, 0)], LAVA[2]);
    poly(p, [R(1.5, 2), R(6, 2), J(5, -0.3)], LAVA[4]);
    for (let u = 2; u < 8; u++) { const q = R(u, 2); g.px(q[0], q[1], GLOW[3]); const q2 = J(u, -0.3); g.px(q2[0], q2[1], GLOW[2]); }
    const inn = R(3, 3); glowDot(g, inn[0], inn[1], 1 + jaw);
  }
  poly(p, [J(0, -0.5), J(8, -0.5), J(7.5, 1.5), J(0, 1.6)], HIDE[2]);
  // Zähne
  if (p.fine) {
    // Zähne in Feinpixeln: Reihe kleiner Zähne, lange Fangzähne vorn, Licht oben (Knochen 5 Stufen)
    for (let u = 2.5; u <= 8; u += 0.9) {
      const fang = u > 6.9, t = R(u, 1.6), t2 = R(u, 2.1), t3 = R(u, 2.6);
      p.dot(t[0], t[1], PAL.bone[4]); p.dot(t2[0], t2[1], PAL.bone[3]);
      if (fang) p.dot(t3[0], t3[1], PAL.bone[2]);
      const b = J(u - 0.5, -0.6), b2 = J(u - 0.5, -1.1), b3 = J(u - 0.5, -1.6);
      p.dot(b[0], b[1], PAL.bone[2]); p.dot(b2[0], b2[1], PAL.bone[3]);
      if (fang) p.dot(b3[0], b3[1], PAL.bone[4]);
    }
  } else for (const u of [3, 5, 7.5]) { const t = R(u, 1.8); p.px(t[0], t[1], PAL.bone[3]); const b = J(u - 0.5, -0.8); p.px(b[0], b[1], PAL.bone[2]); }
  meta.mouth = { x: R(9, 1.5 + jaw * 2)[0], y: R(9, 1.5 + jaw * 2)[1] };
  // Hörner nach hinten
  const h0 = R(-1, -3);
  if (p.fine) {
    // Horn fein: verjüngt, Rillen, Licht oben, helle Spitze
    for (let i = 0; i <= 4.5; i += 0.25) {
      const x = h0[0] - i * 1.1, y = h0[1] - 1.2 * i + i * i * 0.28, w = Math.max(0.5, 2 - i * 0.33);
      const groove = (i * 4) % 4 === 2 && i < 3.5;
      p.rect(Math.round(x * 2) / 2, Math.round(y * 2) / 2, Math.round(w * 2) / 2, 0.5, groove ? PAL.bone[0] : i < 2 ? PAL.bone[1] : PAL.bone[2 + (i > 3.5 ? 1 : 0)]);
      p.dot(x + 0.25, y - 0.25, i > 3.8 ? PAL.bone[4] : groove ? PAL.bone[1] : PAL.bone[i < 2 ? 2 : 3]);
    }
  } else for (let i = 0; i < 5; i++) { const x = h0[0] - i * 1.1, y = h0[1] - 1.2 * i + i * i * 0.28; p.rect(x, y, 2 - (i > 2 ? 1 : 0), 1, i < 2 ? PAL.bone[1] : PAL.bone[2 + (i > 3 ? 1 : 0)]); }
  // Ohr
  const e0 = R(-2, -2); poly(p, [e0, [e0[0] - 4, e0[1] - 2], [e0[0] + 1, e0[1] - 1]], HIDE[3]);
  if (p.fine) { p.fline(e0[0] - 0.5, e0[1] - 0.5, e0[0] - 3.5, e0[1] - 2, HIDE[5]); p.fline(e0[0] - 0.5, e0[1], e0[0] - 2.5, e0[1] - 1, HIDE[1]); }
  // Augen: Glut
  const ey = R(2, -1.3), ec = ex.hurt ? '#ffffff' : LAVA[5];
  p.rect(ey[0] - 1, ey[1] - 1, 4, 3, VOID);
  const bw = R(0.5, -3); L(p, bw[0], bw[1], bw[0] + 4 * c, bw[1] + 4 * s, HIDE[5]);   // Brauenwulst im Licht
  p.px(ey[0] - 1, ey[1], LAVA[2]);
  p.px(ey[0], ey[1], ec); p.px(ey[0] + 1, ey[1], LAVA[3]);
  g.px(ey[0], ey[1], GLOW[4]); g.px(ey[0] + 1, ey[1], GLOW[3]); g.px(ey[0] - 1, ey[1], GLOW[1]); g.px(ey[0] + 2, ey[1], GLOW[1]);
  if (p.fine) {
    // Auge fein: glühende Iris mit weißheißem Kern, schmale Schlitzpupille, Brauenwulst mit Schattenkante
    p.dot(ey[0] - 0.5, ey[1], LAVA[3]); p.dot(ey[0], ey[1], LAVA[4]); p.dot(ey[0] + 0.5, ey[1], ec); p.dot(ey[0] + 1, ey[1], VOID); p.dot(ey[0] + 1.5, ey[1], LAVA[4]);
    p.dot(ey[0] - 0.5, ey[1] + 0.5, LAVA[1]); p.dot(ey[0], ey[1] + 0.5, LAVA[2]); p.dot(ey[0] + 0.5, ey[1] + 0.5, LAVA[3]); p.dot(ey[0] + 1, ey[1] + 0.5, VOID); p.dot(ey[0] + 1.5, ey[1] + 0.5, LAVA[2]);
    g.dot(ey[0] + 0.5, ey[1], GLOW[4]); g.dot(ey[0] + 1, ey[1], GLOW[2]);
    p.fline(bw[0], bw[1] + 0.5, bw[0] + 4 * c, bw[1] + 4 * s + 0.5, HIDE[1]);
    p.fline(bw[0] + 0.5, bw[1] - 0.5, bw[0] + 3.5 * c, bw[1] + 3.5 * s - 0.5, '#7a3c28');
  }
  meta.eye = { x: ey[0], y: ey[1] };
  meta.head = { x: nx, y: ny - 5 };
}

function drawHellhound(p, g, P, ex) {
  const { AX, AY } = HH;
  const meta = {};
  const gy = AY;
  const hip = { x: AX - 9 + P.bx, y: gy - 15 + P.by + Math.sin(P.pitch) * 8 };
  const sh = { x: AX + 8 + P.bx, y: gy - 17 + P.by - Math.sin(P.pitch) * 8 };
  const heat = P.heat;

  const leg = (bx, by, fx, fy, l1, l2, bend, ramp, far) => {
    const k = ik(bx, by, fx, fy, l1, l2, bend);
    cap(p, bx, by, k.jx, k.jy, far ? 2.4 : 2.9, 1.7, ramp);
    cap(p, k.jx, k.jy, k.ex, k.ey - 1, 1.6, 1.3, ramp);
    p.rect(k.ex - 1, k.ey - 1, 4, 1, ramp[far ? 1 : 3]);
    p.px(k.ex + 3, k.ey - 1, PAL.bone[far ? 1 : 3]);       // Krallen
    if (!far && heat > 0.3) { p.px(k.jx, k.jy, LAVA[2]); g.px(k.jx, k.jy, GLOW[1]); }
    if (p.fine) {
      // Pfote: Zehenfugen, zwei Krallen mit Glanz; Fellsträhnen am Oberschenkel; Glutkern im Gelenk
      p.dot(k.ex + 0.5, k.ey - 1, ramp[0]); p.dot(k.ex + 1.5, k.ey - 1, ramp[0]);
      p.dot(k.ex + 3.5, k.ey - 0.5, PAL.bone[far ? 0 : 2]); p.dot(k.ex + 3, k.ey - 1, PAL.bone[far ? 2 : 4]);
      p.dot(k.ex + 2, k.ey - 0.5, PAL.bone[far ? 1 : 3]);
      if (!far) furStrands(p, bx, by, k.jx, k.jy, 2, 5, Math.round(bx * 7) & 63, ramp.length > 5 ? ramp : HIDE, 1.2);
      if (!far && heat > 0.3) { p.dot(k.jx, k.jy, LAVA[4]); g.dot(k.jx, k.jy, GLOW[3]); }
    }
  };
  const farR = HIDE.slice(0, 4), nearR = HIDE.slice(1, 6);
  leg(hip.x + 1, hip.y + 1, AX - 10 + P.hBx, gy - P.hBy, 8, 8.5, 1, farR, true);
  leg(sh.x - 1, sh.y + 1, AX + 6 + P.fBx, gy - P.fBy, 8, 8, -1, farR, true);

  // Schwanz mit Flammenquaste
  let tx = hip.x - 4, ty = hip.y - 2;
  for (let i = 0; i < 6; i++) {
    const a = Math.PI + 0.5 - i * 0.2 + Math.sin(P.tail + i * 0.7) * 0.3;
    const nx = tx + Math.cos(a) * 2, ny = ty - Math.sin(a) * 2;
    cap(p, tx, ty, nx, ny, 1.7 - i * 0.2, 1.4 - i * 0.2, HIDE);
    tx = nx; ty = ny;
  }
  flame(p, g, tx, ty + 1, Math.round(5 + heat * 2), 1.6, P.fl, { lean: -0.5, seed: 9, hot: 0.7 + heat * 0.3 });

  // Rumpf: hager, Rippen glühen durch die verkohlte Haut
  cap(p, hip.x, hip.y, sh.x, sh.y, 4.4, 5.4, HIDE, { noise: 0.09, seed: 11 });
  ell(p, hip.x - 0.5, hip.y, 5, 4.6, HIDE, { noise: 0.09, seed: 12 });
  ell(p, sh.x, sh.y + 0.5 - P.breath * 0.5, 6, 5.8 + P.breath * 0.5, HIDE, { noise: 0.09, seed: 13 });
  if (p.fine) {
    // Fell: Feinpixel-Strähnen über Rumpf und Brust, nach hinten gekämmt
    furStrands(p, hip.x - 3, hip.y, sh.x + 3, sh.y, 5, 54, 41, HIDE);
    furStrands(p, sh.x - 1, sh.y + 2, sh.x + 4, sh.y + 3, 3, 10, 43, HIDE, 1.2);
  }
  // Rippen (fein: glühende Risse, farbiger Saum mit weißheißem Kern)
  for (let i = 0; i < 4; i++) {
    const u = 0.35 + i * 0.15, x = hip.x + (sh.x - hip.x) * u, y = hip.y + (sh.y - hip.y) * u;
    if (p.fine) {
      const hot = heat * (0.6 + P.breath * 0.4), x0 = x + 0.5, y0 = y - 1, x1 = x + 1.55, y1 = y + 2.5;
      p.fline(x0, y0, x1, y1, hot > 0.6 ? LAVA[2] : LAVA[1], 1);
      p.fline(x0 + 0.5, y0 + 0.5, x1, y1 - 0.5, hot > 0.85 ? LAVA[5] : hot > 0.6 ? LAVA[4] : LAVA[3]);
      g.fline(x0, y0, x1, y1, GLOW[hot > 0.8 ? 2 : 1], 1);
      g.fline(x0 + 0.5, y0 + 0.5, x1, y1 - 0.5, GLOW[hot > 0.8 ? 4 : 3]);
      continue;
    }
    for (let j = 0; j < 4; j++) {
      const px_ = x + j * 0.35 + 0.5, py_ = y - 1 + j;
      const hot = heat * (0.6 + P.breath * 0.4);
      p.px(px_, py_, hot > 0.6 ? LAVA[3] : LAVA[1]); g.px(px_, py_, GLOW[hot > 0.8 ? 3 : 2]);
    }
  }
  const mid = { x: (hip.x + sh.x) / 2, y: (hip.y + sh.y) / 2 };
  veins(p, g, hip.x - 1, hip.y, 4, 3.5, 47, 2, heat, { len: 5 });

  // nahe Beine
  leg(hip.x, hip.y + 2, AX - 8 + P.hAx, gy - P.hAy, 8, 8.5, 1, nearR, false);
  leg(sh.x + 1, sh.y + 2, AX + 9 + P.fAx, gy - P.fAy, 8, 8, -1, nearR, false);

  // Brennende Mähne entlang Rücken und Nacken
  for (let i = 0; i < 7; i++) {
    const u = i / 6, x = hip.x + 1 + (sh.x + 3 - hip.x) * u, y = hip.y - 4 + (sh.y - 5 - hip.y + 4) * u - Math.sin(u * Math.PI) * 0.8;
    const h = Math.round((2 + u * 5 + (hash2(i, 1, 5) * 2 | 0)) * P.mane * (0.8 + heat * 0.3));
    flame(p, g, x, y, h, 1.3 + u * 0.8, P.fl + i * 0.9, { lean: -0.45 - Math.max(0, P.bx) * 0.05 - P.howl * 0.2, seed: 20 + i, hot: 0.6 + heat * 0.4 });
  }

  // Hals + goldenes Stachelhalsband
  const na = -0.55 + P.head - P.pitch * 0.3 - P.howl * 0.9;
  const nx = sh.x + 4 + Math.cos(na) * 4, ny = sh.y - 2 + Math.sin(na) * 4;
  cap(p, sh.x + 2, sh.y - 1, nx, ny, 4, 3.2, HIDE, { noise: 0.09, seed: 14 });
  const cx = sh.x + 3 + Math.cos(na) * 2, cy = sh.y - 1.5 + Math.sin(na) * 2;
  if (p.fine) furStrands(p, sh.x + 1, sh.y - 1, nx, ny, 3, 14, 44, HIDE, 1.3);
  for (let k = -3; k <= 3; k++) {
    const x = cx + Math.cos(na + Math.PI / 2) * k, y = cy + Math.sin(na + Math.PI / 2) * k;
    p.px(x, y, k < 0 ? GOLD[4] : GOLD[2]); p.px(x + Math.cos(na) * 0.8, y + Math.sin(na) * 0.8, GOLD[3]);
    if (k % 2 === 0) {
      if (p.fine) {
        // Stachel: spitzer Dorn aus Feinpixeln, Glanz oben, Schattenkante
        const ux = -Math.cos(na), uy = -Math.sin(na);
        p.fline(x, y, x + ux * 2, y + uy * 2, GOLD[3]); p.dot(x + ux * 2, y + uy * 2, GOLD[5]); p.dot(x + ux * 0.8 - 0.25, y + uy * 0.8 - 0.25, GOLD[5]);
      } else p.px(x - Math.cos(na) * 1.3, y - Math.sin(na) * 1.3, GOLD[5]);
    }
  }
  if (p.fine) { const ux = Math.cos(na + Math.PI / 2), uy = Math.sin(na + Math.PI / 2); p.fline(cx - ux * 3 + Math.cos(na) * 1.2, cy - uy * 3 + Math.sin(na) * 1.2, cx + ux * 3 + Math.cos(na) * 1.2, cy + uy * 3 + Math.sin(na) * 1.2, GOLD[1]); }
  hellHead(p, g, nx + 2, ny, P, ex, meta);
  if (ex.smear) smearArc(p, g, nx + 2, ny + 2, ex.smear[0], ex.smear[1], 6, 12, SMEAR_W, [GLOW[1], GLOW[2]], 1);
  return meta;
}

function drawHellhoundCorpse(p, g, k) {
  const { AX, AY } = HH;
  const cx = AX - 1, cy = AY - 4;
  for (const [x, a] of [[-8, 0.3], [-4, 0.6], [6, 0.2], [9, 0.5]]) cap(p, cx + x, cy + 2, cx + x + 4 + a * 3, cy + 4, 1.5, 1.2, HIDE.slice(0, 4));
  ell(p, cx, cy, 11, 4.4, HIDE, { noise: 0.09, seed: 12 });
  if (p.fine) {
    // Kadaver fein: Fell in Strähnen, Rippenrisse mit (verglimmendem) hellem Kern
    furStrands(p, cx - 10, cy - 1, cx + 9, cy - 1, 4, 40, 45, HIDE);
    for (let i = 0; i < 4; i++) {
      const x0 = cx - 3 + i * 2.5, y0 = cy - 1, x1 = x0 + 0.6, y1 = cy + 1.5;
      if ((1 - k) > 0.2) {
        p.fline(x0, y0, x1, y1, LAVA[k < 0.5 ? 2 : 1], 1); p.fline(x0 + 0.5, y0 + 0.5, x1, y1 - 0.5, k < 0.5 ? LAVA[5] : LAVA[3]);
        g.fline(x0, y0, x1, y1, GLOW[1], 1); g.fline(x0 + 0.5, y0 + 0.5, x1, y1 - 0.5, GLOW[k < 0.5 ? 3 : 2]);
      } else p.fline(x0, y0, x1, y1, HIDE[0], 1);
    }
  } else for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { const x = cx - 3 + i * 2.5 + j * 0.3, y = cy - 1 + j; if ((1 - k) > 0.2) { p.px(x, y, LAVA[k < 0.5 ? 3 : 1]); g.px(x, y, GLOW[k < 0.5 ? 2 : 1]); } else p.px(x, y, HIDE[0]); }
  ell(p, cx + 12, cy + 1, 3.8, 3, HIDE, { noise: 0.09, seed: 31 });
  poly(p, [[cx + 13, cy], [cx + 20, cy + 1], [cx + 20, cy + 3], [cx + 13, cy + 3]], HIDE[3]);
  for (let i = 0; i < 4; i++) p.px(cx + 10 - i, cy - 3 - i * 0.6, PAL.bone[2]);
  const ember = 1 - k;
  for (let i = 0; i < 6; i++) { const x = cx - 8 + i * 3.5, y = cy - 4; if (ember > 0.15) flame(p, g, x, y, Math.round(1 + ember * 4 * hash2(i, 1, 3)), 1, k * 8 + i, { seed: 50 + i, hot: ember }); }
  return { eye: { x: cx + 13, y: cy }, mouth: { x: cx + 19, y: cy + 2 }, head: { x: cx + 12, y: cy - 3 } };
}

function createHellhound() {
  const S = spec(HH, drawHellhound, RIM_GOLD, BACK_EMBER);
  const idle = [];
  for (let i = 0; i <= 6; i++) {
    const ph = (i / 6) * TAU, sn = Math.sin(ph);
    idle.push([i / 6, hhp({ by: sn * 0.6, breath: (sn + 1) / 2, jaw: 0.2 + Math.max(0, sn) * 0.35, tail: ph, heat: 0.75 + sn * 0.2, head: sn * 0.05, fl: ph * 1.5 }), linear]);
  }
  // Galopp (Rudeljäger): Paare gemeinsam
  const walk = [];
  for (let i = 0; i <= 6; i++) {
    const ph = (i / 6) * TAU, sn = Math.sin(ph), c = Math.cos(ph);
    walk.push([i / 6, hhp({
      by: -Math.abs(c) * 1.4 + 0.7, pitch: sn * 0.07, head: -sn * 0.08, jaw: 0.4, tail: ph * 2, heat: 0.9, fl: ph * 2, mane: 1.1,
      fAx: sn * 5, fAy: Math.max(0, c) * 3.5, fBx: sn * 4, fBy: Math.max(0, c) * 3,
      hAx: -sn * 5, hAy: Math.max(0, -c) * 3.5, hBx: -sn * 4, hBy: Math.max(0, -c) * 3,
    }), linear]);
  }
  const w1 = hhp({ by: 2, pitch: -0.08, head: 0.3, jaw: 0.7, heat: 1, fAx: 2, fBx: 1, hAx: 1, hBx: 1, fl: 1, mane: 1.3 });
  const w2 = hhp({ by: 4, bx: -2, pitch: -0.14, head: 0.45, jaw: 1, heat: 1.2, fAx: 4, fBx: 3, hAx: 2, hBx: 2, tail: 2, breath: 1, fl: 2, mane: 1.5 });
  const s1 = hhp({ by: -4, bx: 7, pitch: 0.28, head: -0.2, jaw: 1.2, heat: 1.2, fAx: 10, fAy: 6, fBx: 8, fBy: 5, hAx: -5, hAy: 1, hBx: -6, tail: 3, fl: 3, mane: 1.4 });
  const s2 = hhp({ by: -2, bx: 10, pitch: 0.12, head: 0.15, jaw: 0.1, heat: 1.2, fAx: 11, fAy: 3, fBx: 9, fBy: 2, hAx: -2, hAy: 3, hBx: -3, hBy: 2, tail: 4, fl: 4, mane: 1.2 });
  const s3 = hhp({ by: 1, bx: 6, pitch: -0.04, head: 0.1, jaw: 0.3, heat: 0.9, fAx: 5, fBx: 4, hAx: 2, hBx: 1, tail: 5, fl: 5 });
  const s4 = hhp({ bx: 3, jaw: 0.3, heat: 0.8, fAx: 2, fBx: 1, tail: 6, fl: 6 });
  // Heulen: Kopf in den Nacken, Mähne lodert auf
  const h1 = hhp({ by: 1, howl: 0.6, head: -0.2, jaw: 0.5, heat: 1.1, mane: 1.4, fl: 1, fAx: 1, pitch: -0.08 });
  const h2 = hhp({ by: 2, howl: 1, head: -0.4, jaw: 1, heat: 1.4, mane: 1.9, fl: 2, fAx: 1, pitch: -0.14, breath: 1 });
  const hurtP = hhp({ by: 1, bx: -2, pitch: 0.16, head: -0.45, jaw: 1, heat: 1.3, fAx: -1, fAy: 2, tail: 1, fl: 1, mane: 1.3 });
  const d1 = hhp({ by: 2, bx: -2, pitch: 0.22, head: -0.5, jaw: 1, heat: 1, fAx: 1, fAy: 3, fBy: 2, fl: 2, mane: 1 });
  const d2 = hhp({ by: 7, bx: -1, pitch: -0.12, head: 0.5, jaw: 0.8, heat: 0.7, fAx: 5, fBx: 4, hAx: -3, hBx: -2, fl: 3, mane: 0.6 });
  return {
    idle: new Animation(track(S, idle, 6, { loop: true }), 7),
    walk: new Animation(track(S, walk, 6, { loop: true, extras: { 0: { fx: 'step' }, 3: { fx: 'step' } } }), 13),
    windup: new Animation(track(S, [[0, idle[0][1]], [0.5, w1], [1, w2]], 4), 10, false),
    strike: new Animation(track(S, [[0, s1], [0.25, s2, snap], [0.6, s3], [1, s4]], 4, {
      extras: { 0: { smear: [-1.1, 0.5] }, 1: { fx: 'impact', smear: [-0.3, 1.1] } },
    }), 14, false),
    howl: new Animation([...track(S, [[0, idle[0][1]], [0.35, h1], [0.6, h2, snap], [0.85, { ...h2, fl: 4 }], [1, { ...h2, fl: 6, jaw: 0.8 }]], 7, { extras: { 3: { fx: 'roar' } } })], 8, false),
    hurt: new Animation(track(S, [[0, hurtP], [1, hhp({ bx: -1, head: -0.2, jaw: 0.5 })]], 2, { extras: { 0: { hurt: true } } }), 10, false),
    death: new Animation([
      ...track(S, [[0, hurtP], [0.5, d1], [1, d2]], 3, { extras: { 0: { hurt: true } } }),
      stillR(S, (p, g) => drawHellhoundCorpse(p, g, 0), 'impact', RIM_GOLD, BACK_EMBER),
      stillR(S, (p, g) => drawHellhoundCorpse(p, g, 0.45), null, RIM_GOLD, BACK_EMBER),
      stillR(S, (p, g) => drawHellhoundCorpse(p, g, 1), null, RIM_GOLD, BACK_EMBER),
    ], 8, false),
  };
}


// ================================================================ Aschepriester

const AP = { W: 60, H: 62, AX: 28, AY: 54, pad: 10 };
const AP_REST = {
  bob: 0, lean: 0, hem: 0, head: 0, hFx: 5, hFy: 9, hBx: -5, hBy: 3, ball: 0, fl: 0, cens: 0, eye: 1, cast: 0, stepA: 0, stepB: 0, wind: 0, hB2: 0,
};
const app = (o) => ({ ...AP_REST, ...o });

// Weihrauchfass an einer Kette, glimmend, mit Rauch
function censer(p, g, hx, hy, ang, fl) {
  const L = 7, x = hx + Math.sin(ang) * L, y = hy + Math.cos(ang) * L;
  if (p.fine) {
    // Kette aus Feinpixel-Gliedern (heller Ring, dunkle Fuge)
    for (let i = 0.5; i < L; i += 0.5) { const t = i / L; p.dot(hx + (x - hx) * t, hy + (y - hy) * t, (i * 2) % 2 ? GOLD[1] : (i * 2) % 4 ? GOLD[3] : GOLD[4]); }
  } else for (let i = 1; i < L; i++) { const t = i / L; p.px(hx + (x - hx) * t, hy + (y - hy) * t, i % 2 ? GOLD[2] : GOLD[3]); }
  ell(p, x, y + 1.5, 2.2, 2, GOLD.slice(1), { bias: 0.1 });
  p.px(x - 1, y + 1, LAVA[3]); p.px(x + 1, y + 2, LAVA[2]); p.px(x, y + 2, LAVA[4]);
  glowDot(g, x, y + 1.5, 1.4);
  poly(p, [[x - 1, y - 0.5], [x, y - 2], [x + 1, y - 0.5]], GOLD[4]);
  if (p.fine) {
    // Räucherfass fein: Glanzpunkt und Glanzbogen auf dem Gold, Zierband, Glutschlitze mit heißem Kern, Deckelknauf
    p.dot(x - 1.5, y + 0.5, '#fffbe0'); p.dot(x - 1, y, GOLD[5]); p.dot(x - 1.5, y + 1, GOLD[5]);
    p.fline(x - 2, y + 2.5, x + 2, y + 2.5, GOLD[1]); p.dot(x - 1.5, y + 2.5, GOLD[4]); p.dot(x + 0.5, y + 2.5, GOLD[4]);
    p.fline(x - 1, y + 0.5, x + 1.5, y + 0.5, GOLD[1]);
    for (const [ox, oy, c] of [[-1, 1, LAVA[3]], [0, 1.5, LAVA[4]], [1, 1.5, LAVA[3]], [0.5, 2, LAVA[2]]]) p.dot(x + ox, y + oy, c);
    p.dot(x - 0.5, y + 1.5, LAVA[5]); p.dot(x, y + 1, LAVA[5]); g.dot(x, y + 1.5, GLOW[4]); g.dot(x - 0.5, y + 1.5, GLOW[4]);
    p.dot(x, y - 2.5, GOLD[5]); p.dot(x - 0.5, y - 1, GOLD[5]); p.dot(x + 0.5, y - 1, GOLD[2]);
  }
  // Rauch steigt auf (Ascheflocken + Funken); fein: zarte Rauchfäden aus Feinpixeln, Funken mit hellem Kern
  for (let i = 0; i < 6; i++) {
    const yy = y - 2 - i * 1.6 - ((fl * 2) % 1.6), xx = x + Math.sin(fl + i * 0.9) * (0.5 + i * 0.35) - i * 0.3;
    if (p.fine) {
      const c = i < 2 ? ASHR[5] : i < 4 ? ASHR[4] : ASHR[3];
      p.dot(xx, yy, c); p.dot(xx + 0.5, yy - 0.5, c); if (i < 4) p.dot(xx - 0.5, yy + 0.5, ASHR[3]);
      if (i % 3 === 1) { p.dot(xx + 1, yy, LAVA[5]); p.dot(xx + 1.5, yy, LAVA[3]); g.dot(xx + 1, yy, GLOW[4]); g.dot(xx + 1.5, yy, GLOW[2]); }
      continue;
    }
    p.px(xx, yy, i < 2 ? ASHR[4] : ASHR[3]);
    if (i % 3 === 1) { p.px(xx + 1, yy, LAVA[3]); g.px(xx + 1, yy, GLOW[2]); }
  }
  return { x, y: y + 1.5 };
}

function drawAshPriest(p, g, P, ex) {
  const { AX, AY } = AP;
  const meta = {};
  const gy = AY;
  const top = gy - 23 + P.bob;
  const x = AX + P.lean * 2;
  const sh = { x: x + 1 + P.lean * 3, y: top + 1 };

  // --- Glutfeld-Siegel am Boden (Zauber)
  if (P.cast > 0.05) {
    const r = 6 + P.cast * 12, cx = AX + 2, cy = gy - 1;
    if (p.fine) {
      // Siegelring fein: durchgehende Glutlinie (heller Kern oben, Saum unten), Runenkerben als Lücken
      const n = Math.ceil(r * 7);
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU + P.fl * 0.2, seg = Math.floor(i / n * 48);
        if (hash2(seg, 1, 3) >= 0.8) continue;
        const xx = cx + Math.cos(a) * r, yy = cy + Math.sin(a) * r * 0.35;
        const hot = seg % 4 === 0;
        p.dot(xx, yy, hot ? LAVA[5] : LAVA[4]); p.dot(xx, yy + 0.5, hot ? LAVA[3] : LAVA[2]);
        g.dot(xx, yy, GLOW[hot ? 4 : 3]); g.dot(xx, yy + 0.5, GLOW[hot ? 3 : 2]);
      }
    } else for (let i = 0; i < 48; i++) {
      const a = i / 48 * TAU + P.fl * 0.2;
      const xx = cx + Math.cos(a) * r, yy = cy + Math.sin(a) * r * 0.35;
      if (hash2(i, 1, 3) < 0.8) { p.px(xx, yy, i % 4 ? LAVA[2] : LAVA[4]); g.px(xx, yy, GLOW[i % 4 ? 2 : 3]); }
    }
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * TAU + P.fl * 0.3, xx = cx + Math.cos(a) * r * 0.6, yy = cy + Math.sin(a) * r * 0.2;
      p.px(xx, yy, LAVA[3]); g.px(xx, yy, GLOW[3]);
      flame(p, g, xx, yy, Math.round(2 + P.cast * 3), 0.9, P.fl + k, { seed: 60 + k, hot: 0.7 });
    }
  }

  // Füße
  p.rect(AX - 4 + P.stepB, gy - 2, 4, 2, CHAR[1]);
  // --- hinterer Ärmel + Weihrauchfass
  const hB = { x: sh.x + P.hBx, y: sh.y + P.hBy };
  cap(p, sh.x - 3, sh.y + 1, hB.x, hB.y, 2.4, 2.8, ASHR.slice(0, 4));
  p.rect(hB.x - 1, hB.y + 1, 2, 2, GOLD[2]);
  const cz = censer(p, g, hB.x, hB.y + 2, P.cens, P.fl);
  meta.censer = cz;

  // --- Robe: Asche, glimmender Saum, Goldstola
  robe(p, g, x, top, gy - 1, 5, 9.5, P.lean, P.hem, ASHR, CHAR, 83);
  p.rect(AX + 1 + P.stepA, gy - 2, 4, 2, CHAR[2]); p.px(AX + 4 + P.stepA, gy - 2, CHAR[3]);
  for (let j = 0; j < 19; j++) {
    const sx = x + 2.5 + P.lean * (2 - j * 0.12);
    p.px(sx, top + 3 + j, GOLD[j % 5 === 0 ? 4 : 3]); p.px(sx + 1, top + 3 + j, GOLD[1]);
    if (j % 5 === 2) { p.px(sx, top + 3 + j, LAVA[3]); g.px(sx, top + 3 + j, GLOW[2]); }
    if (p.fine) {
      // Stola: Gold-Filigran (Zickzack-Gravur) und Glutstein mit hellem Kern
      if (j % 5 === 2) { p.dot(sx, top + 3 + j, LAVA[5]); g.dot(sx, top + 3 + j, GLOW[4]); }
      else { p.dot(sx + (j & 1) * 0.5, top + 3.5 + j, GOLD[1]); if (j % 5 === 0) p.dot(sx, top + 3 + j, GOLD[5]); }
      p.dot(sx + 1.5, top + 3 + j, CHAR[1]);
    }
  }
  // Gürtelkordel
  for (let k = -5; k <= 5; k++) p.px(x + k + P.lean * 1.5, top + 9 + Math.abs(k) * 0.1, k < -1 ? GOLD[2] : GOLD[3]);
  p.px(x - 3 + P.lean, top + 10, GOLD[3]); p.px(x - 3 + P.lean, top + 11, GOLD[2]); p.px(x - 3 + P.lean, top + 12, GOLD[4]);
  if (p.fine) {
    // Kordel gedreht: schräge Feinpixel-Fugen, Quaste mit Fäden
    const by = Math.round(top + 9);
    for (let k = -5; k <= 5.5; k += 1) { const xx = Math.round(x + k + P.lean * 1.5); p.dot(xx + 0.5, by, GOLD[1]); p.dot(xx, by + 0.5, GOLD[1]); p.dot(xx, by, k < -1 ? GOLD[3] : GOLD[5]); }
    const qx = Math.round(x - 3 + P.lean), qy = Math.round(top + 12);
    p.dot(qx, qy + 1, GOLD[3]); p.dot(qx + 0.5, qy + 1.5, GOLD[2]); p.dot(qx + 0.5, qy, GOLD[1]);
  }
  // Goldener Schulterkragen
  ell(p, sh.x - 0.5, sh.y + 1, 6, 2.6, GOLD.slice(1), { bias: 0.05 });
  for (let k = -5; k <= 5; k += 2) p.px(sh.x - 0.5 + k, sh.y + 3, GOLD[1]);
  if (p.fine) {
    // Kragen: Glanzbogen, Glanzpunkt, Glutsteine mit Kern, feiner Zackensaum
    for (let a = -2.8; a <= -1.6; a += 0.1) p.dot(sh.x - 0.5 + Math.cos(a) * 5, sh.y + 1 + Math.sin(a) * 2.1, GOLD[5]);
    p.dot(sh.x - 4, sh.y, '#fffbe0');
    for (const k of [-3, 0, 3]) { p.dot(sh.x - 0.5 + k, sh.y + 1.5, LAVA[3]); p.dot(sh.x + k, sh.y + 1.5, LAVA[2]); p.dot(sh.x - 0.5 + k, sh.y + 1, LAVA[5]); g.dot(sh.x - 0.5 + k, sh.y + 1, GLOW[3]); }
    for (let k = -5; k <= 5; k += 1) p.dot(sh.x + k, sh.y + 3, GOLD[2]);
  }

  // --- Kopf: Kapuze, Goldmaske, hohe Mitra mit Glutjuwel
  const hx = sh.x + 1.5 + P.head, hy = top - 4;
  ell(p, hx - 0.5, hy, 4.4, 4.4, ASHR, { bias: -0.05 });
  poly(p, [[hx - 4, hy - 1], [hx - 7 - P.wind * 2, hy + 4 + P.wind], [hx - 2, hy + 3]], ASHR[2]);
  ell(p, hx + 1.5, hy + 0.5, 2.8, 3.4, [VOID, CHAR[0]]);
  // Maske (Sonnenantlitz)
  const mx = hx + 2, my = hy - 2;
  poly(p, [[mx - 1, my], [mx + 3.5, my - 0.5], [mx + 3.8, my + 3.5], [mx + 1.5, my + 5.5], [mx - 1, my + 4]], (xx, yy) => (xx < mx + 0.5 ? GOLD[2] : yy < my + 2 ? GOLD[4] : GOLD[3]));
  p.px(mx + 2, my + 3, GOLD[1]); p.px(mx + 1, my + 4, GOLD[1]);
  const ec = ex.hurt ? '#ffffff' : LAVA[5];
  if (p.fine) { /* Augen unten fein */ } else if (P.eye > 0.3) {
    p.px(mx, my + 1.5, ec); p.px(mx + 2, my + 1.5, ec);
    g.px(mx, my + 1.5, GLOW[4]); g.px(mx + 2, my + 1.5, GLOW[4]); g.px(mx + 1, my + 1.5, GLOW[1]);
  } else { p.px(mx, my + 1.5, VOID); p.px(mx + 2, my + 1.5, VOID); }
  if (p.fine) {
    // Sonnenmaske fein: Stirnkante im Licht, Nasenrücken mit Glanz und Schattenseite, Mundschlitz, Wangengravur,
    // Augenschlitze: oben dunkle Lidkante, darunter glühender Saum mit weißheißem Kern
    const X = Math.round(mx * 2) / 2, Y = Math.round((my + 1.5) * 2) / 2;
    if (P.eye > 0.3) { g.dot(X + 1, Y + 0.5, GLOW[1]); g.dot(X + 1.5, Y + 0.5, GLOW[1]); }
    p.fline(mx - 0.5, my + 0.5, mx + 3, my, GOLD[5]);
    p.fline(X + 1, Y - 0.5, X + 1.5, Y + 2, GOLD[5]); p.fline(X + 1.5, Y + 0.5, X + 2, Y + 2, GOLD[1]);
    p.fline(X, Y + 3, X + 2, Y + 2.5, VOID); p.dot(X + 2.5, Y + 2.5, GOLD[1]);
    p.fline(X - 0.5, Y + 1.5, X, Y + 2.5, GOLD[2]); p.dot(X + 3, Y + 1, GOLD[2]);
    for (const e of [X, X + 2]) {
      p.dot(e, Y, VOID); p.dot(e + 0.5, Y, VOID);
      if (P.eye > 0.3) { p.dot(e, Y + 0.5, LAVA[3]); p.dot(e + 0.5, Y + 0.5, ec); g.dot(e + 0.5, Y + 0.5, GLOW[4]); }
      else { p.dot(e, Y + 0.5, VOID); p.dot(e + 0.5, Y + 0.5, GOLD[1]); }
    }
  }
  meta.eye = { x: mx + 1, y: my + 1.5 };
  // Mitra
  const mt = { x: hx, y: hy - 3 };
  poly(p, [[mt.x - 3.5, mt.y + 1], [mt.x - 2.5, mt.y - 7], [mt.x + 0.5, mt.y - 10], [mt.x + 3, mt.y - 7], [mt.x + 3.5, mt.y + 1]], GOLD[3]);
  poly(p, [[mt.x - 3.5, mt.y + 1], [mt.x - 2.5, mt.y - 7], [mt.x + 0.5, mt.y - 10], [mt.x - 0.5, mt.y + 1]], GOLD[4]);
  GL(p, mt.x - 2.5, mt.y - 7, mt.x + 0.5, mt.y - 10, GOLD[5]);
  L(p, mt.x - 3.5, mt.y + 1, mt.x + 3.5, mt.y + 1, GOLD[1]);
  if (p.fine) {
    // Mitra: Mittelnaht als Glanzlinie, Filigran-Ranken links/rechts, Perlreihe am Reif
    p.fline(mt.x + 0.5, mt.y - 9, mt.x + 0.5, mt.y - 5.5, GOLD[5]); p.fline(mt.x + 1, mt.y - 8.5, mt.x + 1, mt.y - 5.5, GOLD[2]);
    for (let k = 0; k < 6; k++) { p.dot(mt.x - 2.5 + k * 0.5, mt.y - 1.5 - Math.sin(k * 1.4) * 0.6, GOLD[2]); p.dot(mt.x + 1.5 + k * 0.4, mt.y - 2 - Math.cos(k * 1.4) * 0.6, GOLD[2]); }
    for (let k = -3; k <= 3; k += 1) p.dot(mt.x + k, mt.y + 0.5, k < 0 ? GOLD[5] : GOLD[4]);
  }
  // Seitenzacken
  L(p, mt.x - 3, mt.y - 2, mt.x - 5, mt.y - 6, GOLD[4]); p.px(mt.x - 5, mt.y - 7, GOLD[5]);
  L(p, mt.x + 3, mt.y - 2, mt.x + 5, mt.y - 5, GOLD[3]); p.px(mt.x + 5, mt.y - 6, GOLD[4]);
  // Juwel
  p.px(mt.x, mt.y - 4, LAVA[4]); p.px(mt.x, mt.y - 3, LAVA[2]); p.px(mt.x + 1, mt.y - 4, LAVA[3]);
  if (p.fine) { p.dot(mt.x, mt.y - 4, '#ffffff'); p.dot(mt.x + 0.5, mt.y - 4, LAVA[5]); p.dot(mt.x + 1.5, mt.y - 3.5, LAVA[1]); p.fline(mt.x - 0.5, mt.y - 4.5, mt.x - 0.5, mt.y - 2.5, GOLD[1]); }
  glowDot(g, mt.x, mt.y - 4, 1 + P.cast * 0.8);
  meta.head = { x: hx, y: hy - 14 };

  // --- vorderer Ärmel, Hand, Glutkugel
  const hF = { x: sh.x + P.hFx, y: sh.y + P.hFy };
  const k = ik(sh.x + 1, sh.y + 1, hF.x, hF.y, 5.5, 5.5, P.hFy < 3 ? -1 : 1);
  cap(p, sh.x + 1, sh.y + 1, k.jx, k.jy, 2.4, 2.2, ASHR, { rim: 1, bias: 0.15 });
  cap(p, k.jx, k.jy, k.ex, k.ey, 2.2, 3, ASHR, { rim: 1, bias: 0.15 });
  p.px(k.ex, k.ey + 2, GOLD[3]); p.px(k.ex + 1, k.ey + 2, GOLD[4]);           // Goldsaum am Ärmel
  p.rect(k.ex, k.ey - 0.5, 2, 2, '#6a5a50'); p.px(k.ex + 1, k.ey - 1, '#8a7868');
  if (p.fine) {
    // Ärmel: zweifarbige Falten (heller Grat, dunkle Kehle); Hand: Fingerfugen, Knöchellicht
    const ux = k.ex - k.jx, uy = k.ey - k.jy, ul = Math.hypot(ux, uy) || 1, nx = -uy / ul, ny = ux / ul;
    for (const [o, c0, c1] of [[-0.8, ASHR[5], ASHR[1]], [0.9, ASHR[4], ASHR[0]]]) {
      p.fline(k.jx + nx * o + ux * 0.2, k.jy + ny * o + uy * 0.2, k.jx + nx * o + ux * 0.8, k.jy + ny * o + uy * 0.8, c0);
      p.fline(k.jx + nx * (o + 0.5) + ux * 0.25, k.jy + ny * (o + 0.5) + uy * 0.25, k.jx + nx * (o + 0.5) + ux * 0.8, k.jy + ny * (o + 0.5) + uy * 0.8, c1);
    }
    p.fline(sh.x + 1, sh.y + 2, k.jx - 0.5, k.jy, ASHR[5]);
    const hx0 = Math.round(k.ex * 2) / 2, hy0 = Math.round((k.ey - 0.5) * 2) / 2;
    p.dot(hx0 + 0.5, hy0 + 0.5, '#4a3c34'); p.dot(hx0 + 1, hy0 + 1, '#4a3c34'); p.dot(hx0, hy0, '#9a8878'); p.dot(hx0 + 1.5, hy0, '#a89684');
  }
  meta.hand = { x: k.ex + 1, y: k.ey - 3 };
  if (P.ball > 0.3 && !ex.thrown) fireball(p, g, k.ex + 1, k.ey - 2 - P.ball * 0.6, P.ball, P.fl);
  if (ex.thrown) {
    const t = ex.thrown;
    fireball(p, g, k.ex + 3 + t * 6, k.ey - 1, 2.4, P.fl);
    for (let i = 1; i < 4; i++) { p.px(k.ex + 3 + t * 6 - i * 2, k.ey - 1 + (i % 2), LAVA[3 - (i >> 1)]); g.px(k.ex + 3 + t * 6 - i * 2, k.ey - 1 + (i % 2), GLOW[2]); }
    meta.hand = { x: k.ex + 3 + t * 6, y: k.ey - 1 };
  }
  // Zweite erhobene Hand beim Zauber (hB2: hintere Hand über dem Kopf)
  if (P.hB2 > 0.3) { p.rect(sh.x - 4, sh.y - 8 * P.hB2, 2, 2, '#6a5a50'); glowDot(g, sh.x - 3, sh.y - 9 * P.hB2, 1); }
  if (ex.smear) arcSmear(p, g, sh.x, sh.y, ex.smear[0], ex.smear[1], 6, 11, [LAVA[1], LAVA[3], LAVA[5]], 29, true);
  return meta;
}

function drawPriestCorpse(p, g, k) {
  const { AX, AY } = AP;
  const gy = AY - 1;
  for (let j = 0; j < 5; j++) {
    const hw = 12 - j * 1.8;
    for (let x = -hw; x <= hw; x++) {
      const t = 0.3 + (hw - x) / (2 * hw) * 0.5 - j * 0.02;
      p.px(AX + x, gy - j, (j < 2 ? CHAR : ASHR)[clamp(Math.floor(t * 4), 0, 3)]);
    }
  }
  for (let x = -8; x <= 6; x++) p.px(AX + x, gy - 4 + Math.abs(x) * 0.05, GOLD[x % 3 === 0 ? 4 : 2]);
  // Maske + Mitra liegen daneben
  poly(p, [[AX + 10, gy - 5], [AX + 15, gy - 4], [AX + 15, gy - 1], [AX + 10, gy - 1]], GOLD[3]);
  p.px(AX + 12, gy - 3, k < 0.5 ? LAVA[4] : VOID); p.px(AX + 14, gy - 3, VOID);
  if (k < 0.5) g.px(AX + 12, gy - 3, GLOW[3]);
  poly(p, [[AX + 16, gy], [AX + 22, gy - 2], [AX + 24, gy], [AX + 22, gy + 0.5]], GOLD[4]);
  censer(p, g, AX - 16, gy - 7, 0, k * 5);
  for (let i = 0; i < 7; i++) { const x = AX - 9 + i * 3, y = gy - hash2(i, 1, 3) * 3; if (hash2(i, 2, 3) > k) { p.px(x, y, LAVA[2]); g.px(x, y, GLOW[2]); } }
  return { eye: { x: AX + 12, y: gy - 3 }, hand: { x: AX + 8, y: gy - 2 }, head: { x: AX + 12, y: gy - 6 } };
}

function createAshPriest() {
  const S = spec(AP, drawAshPriest, RIM_GOLD, BACK_EMBER);
  const idle = [];
  for (let i = 0; i <= 6; i++) {
    const ph = (i / 6) * TAU, sn = Math.sin(ph);
    idle.push([i / 6, app({ bob: Math.max(0, sn), hem: ph, hFy: 10 + Math.max(0, sn), ball: 1.8 + sn * 0.3, fl: ph * 2, wind: sn * 0.3, cens: sn * 0.35 }), linear]);
  }
  const walk = [];
  for (let i = 0; i <= 6; i++) {
    const ph = (i / 6) * TAU, sn = Math.sin(ph), c = Math.cos(ph);
    walk.push([i / 6, app({ bob: -Math.abs(c) + 1, lean: 0.35, hem: ph * 2, stepA: sn * 3, stepB: -sn * 3, hFx: 6 + sn, hFy: 9, hBx: -6 - sn, fl: ph * 2, wind: 1, head: 0.5, cens: -0.3 + sn * 0.5, ball: 1.5 }), linear]);
  }
  // Ausholen: Hand über den Kopf, Glutkugel wächst
  const w1 = app({ lean: -0.2, hFx: 0, hFy: -5, hBx: 3, hBy: 7, ball: 2.8, fl: 1, wind: 0.4, head: -0.5, cens: 0.4 });
  const w2 = app({ lean: -0.45, hFx: -4, hFy: -9, hBx: 5, hBy: 5, ball: 4, fl: 2, wind: 0.6, head: -1, cens: 0.7 });
  const s1 = app({ lean: 0.5, hFx: 9, hFy: -3, hBx: -6, hBy: 9, ball: 3.2, fl: 3, wind: 1, head: 0.5, stepA: 3, cens: -0.6 });
  const s2 = app({ lean: 0.7, hFx: 11, hFy: 5, hBx: -7, hBy: 10, ball: 0, fl: 4, wind: 1.2, head: 1, stepA: 3, cens: -0.9 });
  const s3 = app({ lean: 0.3, hFx: 7, hFy: 8, hBx: -5, hBy: 10, ball: 0, fl: 5, wind: 0.5, stepA: 2, cens: -0.3 });
  // Glutfeld wirken: beide Hände hoch, Siegel am Boden wächst
  const c1 = app({ lean: -0.15, hFx: 3, hFy: -8, hBx: -3, hBy: -6, hB2: 1, ball: 2.5, fl: 1, cast: 0.3, head: -0.6, cens: 0.2, wind: 0.5 });
  const c2 = app({ lean: -0.3, hFx: 2, hFy: -12, hBx: -3, hBy: -8, hB2: 1.3, ball: 3.5, fl: 2, cast: 0.8, head: -1, cens: 0.4, wind: 0.8, bob: -1 });
  const c3 = app({ lean: 0.4, hFx: 9, hFy: 10, hBx: -6, hBy: 10, ball: 0, fl: 3, cast: 1.1, head: 1, cens: -0.5, wind: 1 });
  const hurtP = app({ lean: -0.6, head: -1.5, hFx: 3, hFy: 3, hBx: -6, hBy: 6, ball: 0.8, eye: 0, wind: 1, cens: 0.8 });
  const d1 = app({ lean: -0.8, bob: 1, head: -1.5, hFx: 5, hFy: 0, hBx: -7, hBy: 2, ball: 0, eye: 0, wind: 1.2, cens: 1.2 });
  const d2 = app({ lean: 0.9, bob: 7, head: 1.5, hFx: 9, hFy: 9, hBx: 0, hBy: 11, ball: 0, eye: 0, cens: -0.6 });
  return {
    idle: new Animation(track(S, idle, 6, { loop: true }), 7),
    walk: new Animation(track(S, walk, 6, { loop: true }), 9),
    windup: new Animation(track(S, [[0, idle[0][1]], [0.5, w1], [1, w2]], 4), 7, false),
    strike: new Animation(track(S, [[0, s1], [0.35, s2, snap], [1, s3]], 4, {
      extras: { 0: { fx: 'cast', smear: [-2.6, -1.0] }, 1: { thrown: 0.3, smear: [-1.8, 0.2] }, 2: { thrown: 1 } },
    }), 13, false),
    cast: new Animation(track(S, [[0, idle[0][1]], [0.35, c1], [0.75, c2], [1, c3, snap]], 7, { extras: { 6: { fx: 'impact' } } }), 7, false),
    hurt: new Animation(track(S, [[0, hurtP], [1, app({ lean: -0.2 })]], 2, { extras: { 0: { hurt: true } } }), 10, false),
    death: new Animation([
      ...track(S, [[0, hurtP], [0.4, d1], [1, d2]], 3, { extras: { 0: { hurt: true } } }),
      stillR(S, (p, g) => drawPriestCorpse(p, g, 0), 'impact', RIM_GOLD, BACK_EMBER),
      stillR(S, (p, g) => drawPriestCorpse(p, g, 0.45), null, RIM_GOLD, BACK_EMBER),
      stillR(S, (p, g) => drawPriestCorpse(p, g, 1), null, RIM_GOLD, BACK_EMBER),
    ], 8, false),
  };
}


// ================================================================ Wächter des Throns (Elite)

const SN = { W: 140, H: 112, AX: 62, AY: 100, pad: 14 };
const SD = { legH: 22, thigh: 12, shin: 12.5, spine: 19, upper: 10, fore: 10.5, sh: 3, hipW: 4 };
const SN_REST = {
  hipX: 0, hipY: 0, lean: 0.06, head: 0, headY: 0, fFx: 9, fFy: 0, fBx: -9, fBy: 0,
  hFx: 12, hFy: 16, sw: -1.1, hBx: -10, hBy: 16, heat: 1, visor: 1, kneel: 0, spin: -1, crk: 0, two: 0, ban: 0,
};
const snp = (o) => ({ ...SN_REST, ...o });
const BLADE = 38;

// Obsidian-Großschwert: Hand (hx,hy), Winkel a, Verkürzung ls (Wirbel).
function obsidianBlade(p, g, hx, hy, a, ls, heat) {
  const c = Math.cos(a) * ls, s = Math.sin(a) * ls;
  const nx = -Math.sin(a), ny = Math.cos(a);
  // Knauf + Griff (Gold/Leder)
  cap(p, hx - c * 7, hy - s * 7, hx + c * 3, hy + s * 3, 1.4, 1.4, ['#140a08', '#24140c', '#3a2214', '#553420']);
  ell(p, hx - c * 8, hy - s * 8, 2.2, 2.2, GOLD, { bias: 0.1 });
  p.px(hx - c * 8, hy - s * 8, LAVA[3]); g.px(hx - c * 8, hy - s * 8, GLOW[2]);
  const fine = p.fine, fq = fine ? 0.25 : 0.5;
  if (fine) {
    // Griff: Lederwicklung als schräge Feinpixel-Fugen, Knauf mit Glanzpunkt und heißem Kern
    for (let t = -6; t <= 2; t += 1) p.fline(hx + c * t - nx * 1, hy + s * t - ny * 1, hx + c * (t + 0.6) + nx * 1, hy + s * (t + 0.6) + ny * 1, '#140a08');
    p.dot(hx - c * 8 - 1, hy - s * 8 - 1, '#fffbe0'); p.dot(hx - c * 8, hy - s * 8, LAVA[5]); g.dot(hx - c * 8, hy - s * 8, GLOW[4]);
  }
  // Parierstange: geschwungene Goldflügel (fein: Feinpixel-Flügel mit Glanzgrat und Schattenkante)
  for (const side of [-1, 1]) {
    for (let k = 0; k <= 7; k += fq) {
      const bend = (k * k) * 0.06;
      const x = hx + c * (4 + bend) + nx * side * k, y = hy + s * (4 + bend) + ny * side * k;
      if (fine) {
        const w = 1.1 - k * 0.08;
        for (let o = -0.25; o <= w; o += 0.25) p.dot(x + c * o, y + s * o, k > 6.25 ? GOLD[5] : o < 0.2 ? (side > 0 ? GOLD[3] : GOLD[5]) : o > w - 0.3 ? GOLD[1] : side > 0 ? GOLD[2] : GOLD[4]);
      } else { p.px(x, y, k > 6 ? GOLD[5] : side > 0 ? GOLD[2] : GOLD[4]); p.px(x + c * 0.8, y + s * 0.8, GOLD[side > 0 ? 1 : 3]); }
    }
  }
  ell(p, hx + c * 4.5, hy + s * 4.5, 1.8, 1.8, [LAVA[2], LAVA[3], LAVA[4], LAVA[5]]); glowDot(g, hx + c * 4.5, hy + s * 4.5, 1.5);
  if (fine) { p.dot(hx + c * 4.5 - 0.5, hy + s * 4.5 - 0.5, '#ffffff'); }
  // Klinge: Obsidian, facettiert, Glutkante (fein: schmale Glutschneide mit hellem Kern, Gratlinie 1 Feinpixel)
  const b0 = 6, b1 = BLADE;
  const lightSide = nx * -0.6 + ny * -0.8 > 0 ? 1 : -1;
  const eW = fine ? 0.5 : 0.7, rW = fine ? 0.5 : 1;
  for (let t = b0; t <= b1; t += fq) {
    const f = (t - b0) / (b1 - b0);
    const hw = 3.4 - f * 1.1 - (f > 0.86 ? (f - 0.86) * 20 : 0);
    if (hw <= 0) continue;
    for (let k = -hw; k <= hw; k += fq) {
      const x = hx + c * t + nx * k, y = hy + s * t + ny * k;
      const lk = k * lightSide;
      const edge = Math.abs(k) > hw - eW;
      let col = lk > 0 ? (lk < rW ? OBS[6] : OBS[4]) : lk > -1 ? OBS[3] : OBS[2];
      if (fine && !edge && lk > 0 && lk >= rW && lk < rW + 0.3) col = OBS[5];
      if (edge) col = lk > 0 ? (heat > 0.4 ? LAVA[4] : OBS[6]) : (heat > 0.4 ? LAVA[2] : OBS[1]);
      if (fine && edge && Math.abs(k) > hw - 0.25) col = lk > 0 ? (heat > 0.4 ? LAVA[5] : '#b4a2cc') : (heat > 0.4 ? LAVA[3] : OBS[2]);
      dot(p, x, y, col);
      if (edge && heat > 0.4) dot(g, x, y, GLOW[lk > 0 ? (fine && Math.abs(k) > hw - 0.25 ? 4 : 3) : 1]);
    }
  }
  if (fine) { const gp = b0 + 4; p.dot(hx + c * gp + nx * lightSide * 0.5, hy + s * gp + ny * lightSide * 0.5, '#e4dcf4'); }
  // Glutrunen in der Mittelkehle (fein: Runenstriche mit weißheißem Kern)
  for (let t = b0 + 3; t < b1 - 6; t += 3) {
    const x = hx + c * t, y = hy + s * t;
    p.px(x, y, LAVA[heat > 0.8 ? 4 : 3]); g.px(x, y, GLOW[heat > 0.8 ? 4 : 2]);
    p.px(x + c, y + s, LAVA[2]); g.px(x + c, y + s, GLOW[1]);
    if (fine) {
      p.dot(x, y, heat > 0.8 ? '#ffffff' : LAVA[5]); g.dot(x, y, GLOW[4]);
      p.dot(x + nx * 0.5 + c * 0.5, y + ny * 0.5 + s * 0.5, LAVA[4]); p.dot(x - nx * 0.5 + c, y - ny * 0.5 + s, LAVA[3]);
    }
  }
  return { tip: { x: hx + c * b1, y: hy + s * b1 }, mid: { x: hx + c * (b1 * 0.6), y: hy + s * (b1 * 0.6) } };
}

// Kantige Obsidianplatte (Schulter, Knie): gedrehtes Polygon mit Goldrand
function plate(p, x, y, pts, rimC = GOLD[3]) {
  const P2 = pts.map(([a, b]) => [x + a, y + b]);
  poly(p, P2, OBS[3]);
  // helle Facette oben links
  const cx = P2.reduce((a, q) => a + q[0], 0) / P2.length, cy = P2.reduce((a, q) => a + q[1], 0) / P2.length;
  poly(p, P2.map(([a, b]) => [cx + (a - cx) * 0.7 - 1, cy + (b - cy) * 0.7 - 1]), OBS[5]);
  for (let i = 0; i < P2.length; i++) {
    const a = P2[i], b = P2[(i + 1) % P2.length];
    const top = (a[1] + b[1]) / 2 < cy;
    L(p, a[0], a[1], b[0], b[1], top ? rimC : GOLD[1]);
  }
  if (p.fine) {
    // Fein: Glanzlinie auf der oberen Goldkante, Fase der Facette (hell/dunkel), Nieten in den Ecken, Glanzpunkt
    for (let i = 0; i < P2.length; i++) {
      const a = P2[i], b = P2[(i + 1) % P2.length];
      if ((a[1] + b[1]) / 2 < cy) p.fline(a[0], a[1], b[0], b[1], GOLD[5]);
      rivet(p, a[0] + (cx - a[0]) * 0.25, a[1] + (cy - a[1]) * 0.25, GOLD[4], OBS[1]);
    }
    const F = P2.map(([a, b]) => [cx + (a - cx) * 0.7 - 1, cy + (b - cy) * 0.7 - 1]);
    for (let i = 0; i < F.length; i++) {
      const a = F[i], b = F[(i + 1) % F.length], top = (a[1] + b[1]) / 2 < cy - 1;
      p.fline(a[0], a[1], b[0], b[1], top ? OBS[6] : OBS[2]);
    }
    p.dot(F[0][0] + 1, F[0][1] + 1, '#d4c6ea');
  }
}

// Flammenbanner auf dem Rücken des Wächters: Stange hinter der Schulter, Tuch in Violett/Gold
// mit Glutflamme, oben eine echte Flamme. sway = Wehen (Pose), t = Zeit
function flameBanner(p, g, bx, by, sway, t, heat) {
  const top = by - 50;
  // Stange (dunkles Holz, Goldringe), Spitze mit Glutschale
  for (let y = top; y <= by; y++) { p.px(bx, y, '#24140c'); p.px(bx + 1, y, y % 9 === 0 ? GOLD[3] : '#3a2214'); }
  p.rect(bx - 2, top - 1, 6, 2, GOLD[3]); L(p, bx - 2, top - 1, bx + 3, top - 1, GOLD[5]);
  if (p.fine) {
    // Holzmaserung (Feinpixel-Linien), Goldringe mit Glanzpunkt, Schale mit Fugen
    const X = Math.round(bx), T = Math.round(top);
    p.fline(X + 0.5, T + 1, X + 0.5, Math.round(by), '#3a2214'); p.fline(X + 1, T + 1, X + 1, Math.round(by), '#553420');
    for (let y = T; y <= by; y++) if (y % 9 === 0) { p.dot(X, y, GOLD[4]); p.dot(X + 0.5, y, GOLD[5]); p.dot(X + 1.5, y + 0.5, GOLD[1]); p.dot(X, y + 0.5, GOLD[2]); }
    p.fline(X - 2, T + 0.5, X + 3.5, T + 0.5, GOLD[1]); rivet(p, X - 1.5, T, GOLD[5], GOLD[2]); rivet(p, X + 2.5, T, GOLD[4], GOLD[2]);
  }
  // Querstange
  L(p, bx - 18, top + 3, bx + 1, top + 3, GOLD[2]); p.px(bx - 18, top + 3, GOLD[5]); p.px(bx - 19, top + 2, GOLD[4]);
  // Tuch: hängt von der Querstange, weht nach hinten (links), Schwalbenschwanz unten
  const W = 17, Hh = 30;
  if (p.fine) {
    // Fein: Tuch in Feinpixeln abgetastet (lückenlos), zweifarbige Falten (Grat hell, Kehle dunkel),
    // schmale Goldborten mit Glanzfaden, Schwalbenschwanz mit Saum
    for (let i = -0.25; i <= W + 0.25; i += 0.5) {
      const u = Math.max(0, i) / W, ii = Math.round(i);
      const len = Hh - (u > 0.3 && u < 0.7 ? 5 * (1 - Math.abs(u - 0.5) / 0.2) : 0);
      for (let j = 0; j < len; j += 0.5) {
        const v = j / Hh;
        const x = bx - 1 - i - sway * v * 3 + Math.sin(t * 5 + v * 4 + u * 2) * v * 1.2, y = top + 4 + j;
        const edgeL = i < 0.5, bot = j >= len - 1;
        const fold = Math.sin(u * 9 + v * 3 - t * 4);
        let c = fold > 0.88 ? OBS[6] : fold > 0.55 ? OBS[5] : fold > -0.2 ? OBS[4] : fold > -0.85 ? OBS[3] : OBS[2];
        if (ii >= W) c = OBS[2];
        if (j > 1 && j < 3) c = j < 1.5 ? GOLD[5] : j < 2.5 ? GOLD[4] : GOLD[2];
        if (j >= len - 3 && j < len - 1) c = j < len - 2.5 ? GOLD[4] : j < len - 1.5 ? GOLD[2] : GOLD[1];
        if (bot) c = j < len - 0.5 ? GOLD[3] : GOLD[1];
        if (edgeL) c = i < 0 ? GOLD[5] : GOLD[3];
        p.dot(x, y, c); p.dot(x + 0.5, y, c);
      }
    }
  } else for (let i = 0; i <= W; i++) {
    const u = i / W;
    const len = Hh - (u > 0.3 && u < 0.7 ? 5 * (1 - Math.abs(u - 0.5) / 0.2) : 0);
    for (let j = 0; j < len; j++) {
      const v = j / Hh;
      const x = bx - 1 - i - sway * v * 3 + Math.sin(t * 5 + v * 4 + u * 2) * v * 1.2, y = top + 4 + j;
      const edge = i === 0 || j >= len - 1;
      const fold = Math.sin(u * 9 + v * 3 - t * 4);
      let c = edge ? (j >= len - 1 ? GOLD[3] : GOLD[4]) : fold > 0.55 ? OBS[5] : fold > -0.2 ? OBS[4] : OBS[3];
      if (i === W) c = OBS[2];
      if (!edge && j > 1 && j < 3) c = GOLD[4];
      if (!edge && j >= len - 3 && j < len - 1) c = GOLD[2];
      p.px(x, y, c);
    }
  }
  // gestickte Flamme (Glut) in der Mitte des Tuchs
  const fx = bx - 1 - W / 2, fy = top + 18;
  const F = [[0, -8], [0, -7], [-1, -6], [1, -6], [-1, -5], [0, -5], [2, -5], [-2, -4], [-1, -4], [0, -4], [1, -4], [2, -3], [-2, -3], [-1, -3], [0, -3], [1, -3], [-3, -1], [-2, -2], [-1, -2], [0, -2], [1, -2], [2, -2], [3, -1], [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1]];
  for (const [dx, dy] of F) { const x = fx + dx - sway * ((fy + dy - top) / Hh) * 3, y = fy + dy; const inner = Math.abs(dx) <= 1 && dy > -4; p.px(x, y, inner ? LAVA[5] : dy < -4 ? LAVA[4] : LAVA[3]); g.px(x, y, GLOW[inner ? 3 : 2]); }
  if (p.fine) {
    // Stickerei fein: Saum aus dunklerem Glutgarn außen, weißheißer Kern, Stichlinien
    for (const [dx, dy] of F) {
      const x = fx + dx - sway * ((fy + dy - top) / Hh) * 3, y = fy + dy;
      if (Math.abs(dx) >= 2 || dy <= -6) { p.dot(x + (dx < 0 ? 0 : 0.5), y + 0.5, LAVA[2]); }
      if (dx === 0 && dy > -3 && dy < 1) { p.dot(x, y, '#ffffff'); g.dot(x, y, GLOW[4]); }
    }
    const x0 = fx - sway * ((fy - 9 - top) / Hh) * 3; p.dot(x0, fy - 9, LAVA[3]); p.dot(x0 + 0.5, fy - 9.5, LAVA[2]);
  }
  // echte Flamme auf der Stangenspitze
  flame(p, g, bx + 0.5, top - 2, Math.round(6 + heat * 3), 2, t * 7, { seed: 11, hot: heat });
}

function drawSentinel(p, g, P, ex) {
  const { AX, AY } = SN;
  const K = P.kneel;
  const R = rig({ ...P, hipY: P.hipY + K * 10 }, SD, AX, AY);
  const { hip, chest, pt, legF, legB, shF, shB } = R;
  const meta = {};
  const heat = P.heat;
  if (K > 0.01) {
    const kx = hip.x - 4 - K * 3, ky = AY - 3;
    legB.jx += (kx - legB.jx) * K; legB.jy += (ky - legB.jy) * K;
    legB.ex += (kx - 14 - legB.ex) * K; legB.ey += (AY - legB.ey) * K;
  }
  // Schwerthand (vorn), Faust (hinten) – im Wirbel führen beide Hände das Schwert
  const hF = { x: chest.x + P.hFx, y: chest.y + P.hFy };
  let swA = P.sw, swL = 1;
  const spinning = P.spin >= 0;
  if (spinning) {
    const ph = P.spin * TAU, vx = Math.cos(ph), vy = Math.sin(ph) * 0.38;
    swA = Math.atan2(vy, vx); swL = Math.max(0.3, Math.hypot(vx, vy));
    hF.x = chest.x + 2 + vx * 11; hF.y = chest.y + 9 + vy * 11;
  }
  const hB = ex.twoHand || spinning || P.two > 0.5 ? { x: hF.x - Math.cos(swA) * 6 * swL, y: hF.y - Math.sin(swA) * 6 * swL } : { x: chest.x + P.hBx, y: chest.y + P.hBy };
  const armF = ik(shF.x, shF.y, hF.x, hF.y, SD.upper, SD.fore, 1);
  const armB = ik(shB.x, shB.y, hB.x, hB.y, SD.upper, SD.fore, 1);
  const behind = spinning ? Math.sin(P.spin * TAU) < 0 : !!ex.bladeBehind;

  // --- Ketten hängen von den Schultern (hinten)
  for (let i = 0; i < 2; i++) {
    const c0 = pt(SD.spine - 2, -5 - i * 3);
    for (let j = 0; j < 9 - K * 3; j++) {
      const x = c0.x - 1 - j * 0.4 + Math.sin(ex.t * 6 + j * 0.6 + i) * 0.4 * j * 0.15, y = c0.y + j * 2;
      if (p.fine) {
        // Kettenglied als Feinpixel-Ring (Glanz oben links, Schatten unten rechts), abwechselnd quer/flach
        const X = Math.round(x * 2) / 2, Y = Math.round(y * 2) / 2;
        if (j % 2) { p.dot(X, Y, GOLD[3]); p.dot(X, Y + 0.5, GOLD[2]); p.dot(X, Y + 1, GOLD[3]); p.dot(X, Y + 1.5, GOLD[1]); }
        else { p.dot(X - 0.5, Y + 0.5, GOLD[4]); p.dot(X, Y, GOLD[5]); p.dot(X + 0.5, Y + 0.5, GOLD[2]); p.dot(X, Y + 1, GOLD[2]); p.dot(X - 0.5, Y + 1, GOLD[3]); p.dot(X + 0.5, Y + 1, GOLD[1]); p.dot(X, Y + 1.5, GOLD[1]); }
        continue;
      }
      p.px(x, y, j % 2 ? GOLD[2] : GOLD[3]); p.px(x, y + 1, j % 2 ? GOLD[1] : GOLD[4]);
    }
  }
  // --- Flammenbanner auf dem Rücken (hinter allem)
  { const bp = pt(SD.spine + 1, -7); flameBanner(p, g, bp.x - 1, bp.y + 10, 0.6 + P.ban + Math.sin(ex.t * 3) * 0.3, ex.t, heat); }
  // --- Klinge hinten
  let bl = null;
  const smear = () => {
    if (!ex.smear) return;
    const [a0, a1, sy] = ex.smear;
    smearArc(p, g, ex.smearC ? chest.x + ex.smearC.x : shF.x, ex.smearC ? chest.y + ex.smearC.y : shF.y, a0, a1, ex.smearR0 ?? 26, ex.smearR1 ?? (SD.upper + SD.fore + BLADE - 6), [LAVA[2], LAVA[4], LAVA[5]], [GLOW[2], GLOW[3]], sy ?? 1);
  };
  if (behind) { smear(); bl = obsidianBlade(p, g, hF.x, hF.y, swA, swL, heat); }

  // --- hinteres Bein
  const RB = OBS_D.concat(OBS[5]);
  cap(p, hip.x - 3, hip.y, legB.jx, legB.jy, 5.5, 5, RB);
  cap(p, legB.jx, legB.jy, legB.ex, legB.ey - 4, 5, 4.6, RB);
  poly(p, [[legB.ex - 5, legB.ey], [legB.ex - 5, legB.ey - 5], [legB.ex + 4, legB.ey - 5], [legB.ex + 9, legB.ey]], OBS[2]);
  plate(p, legB.jx, legB.jy, [[-3, -3], [3, -4], [4, 2], [-2, 3]], GOLD[2]);
  // --- hinterer Arm
  cap(p, shB.x, shB.y, armB.jx, armB.jy, 4.5, 4, RB);
  cap(p, armB.jx, armB.jy, armB.ex, armB.ey, 4, 4.5, RB);
  ell(p, armB.ex, armB.ey, 3.6, 3.6, RB, { bias: 0.05 });
  // hintere Schulterplatte
  plate(p, shB.x - 2, shB.y - 1, [[-6, -4], [4, -6], [7, 1], [-4, 5]], GOLD[2]);

  // --- Rumpf: massiver Obsidiankörper, Goldbänder, Glutkern
  for (let i = 0; i < 5; i++) {                                   // Tassetten
    const a = pt(0, -9 + i * 4.4);
    poly(p, [[a.x, a.y], [a.x + 4.4, a.y], [a.x + 4.8, a.y + 9 - Math.abs(i - 2)], [a.x - 0.4, a.y + 9 - Math.abs(i - 2)]], OBS[i % 2 ? 3 : 4]);
    L(p, a.x - 0.4, a.y + 9 - Math.abs(i - 2), a.x + 4.8, a.y + 9 - Math.abs(i - 2), GOLD[2]);
    p.px(a.x + 1, a.y + 1, OBS[6]);
    if (p.fine) {
      const hb = 9 - Math.abs(i - 2);
      p.fline(a.x + 0.5, a.y + 0.5, a.x + 0.1, a.y + hb - 1, OBS[6]); p.fline(a.x + 4.2, a.y + 0.5, a.x + 4.5, a.y + hb - 1, OBS[1]);
      rivet(p, a.x + 2, a.y + hb - 2, GOLD[4]); p.fline(a.x, a.y + hb - 0.5, a.x + 4.5, a.y + hb - 0.5, GOLD[1]);
    }
  }
  const hp = pt(1, 0), cp = pt(SD.spine - 3, 0.5);
  cap(p, hp.x, hp.y, cp.x, cp.y, 8, 11, OBS, { noise: 0.05, seed: 3 });
  ell(p, cp.x + 1, cp.y, 12.5, 10, OBS, { rot: P.lean, bias: 0.05, noise: 0.05, seed: 4 });
  const q = (u, k, c) => { const o = pt(u, k); p.px(o.x, o.y, c); };
  for (let k = -9; k <= 9; k += 0.5) { q(2, k, GOLD[2]); q(2.7, k, GOLD[k < 0 ? 4 : 3]); }          // Gürtel
  for (let k = -10; k <= 10; k += 0.5) q(SD.spine - 9 + Math.abs(k) * 0.12, k, GOLD[k < -2 ? 4 : 3]); // Brustband
  if (p.fine) {
    // Rumpf fein: Glanzbögen auf Brust und Bauch (Obsidian mit Glanzlinie + Glanzpunkt), Plattenfugen,
    // Gürtel/Brustband mit Glanzfaden und Nieten
    const d = (u, k, c) => { const o = pt(u, k); p.dot(o.x, o.y, c); };
    for (let a = -2.75; a <= -1.6; a += 0.06) p.dot(cp.x + 1 + Math.cos(a + P.lean) * 10.5, cp.y + Math.sin(a + P.lean) * 8.4, OBS[6]);
    for (let a = -2.6; a <= -1.9; a += 0.08) p.dot(cp.x + 1 + Math.cos(a + P.lean) * 9.5, cp.y + Math.sin(a + P.lean) * 7.4, OBS[5]);
    const sp = pt(SD.spine - 4, -7); p.dot(sp.x, sp.y, '#d4c6ea'); p.dot(sp.x + 0.5, sp.y, OBS[6]); p.dot(sp.x, sp.y + 0.5, OBS[6]);
    for (let k = -8.5; k <= 8.5; k += 0.5) { d(3, k, k < 0 ? GOLD[5] : GOLD[4]); d(1.6, k, GOLD[1]); }
    for (let k = -7; k <= 7; k += 3.5) { const o = pt(2.3, k); rivet(p, o.x, o.y); }
    for (let k = -9.5; k <= 9.5; k += 0.5) d(SD.spine - 8.6 + Math.abs(k) * 0.12, k, k < -2 ? GOLD[5] : GOLD[4]);
    for (let u = 4; u < SD.spine - 9; u += 0.5) { d(u, -4.5, OBS[2]); d(u, 5, OBS[1]); }
    for (let u = 4; u < SD.spine - 9; u += 0.5) d(u, -5, OBS[5]);
  }
  // Filigran
  const fl0 = pt(SD.spine - 5, -7); filigree(p, fl0.x, fl0.y, 6, 2);
  const fl1 = pt(SD.spine - 5, 4); filigree(p, fl1.x, fl1.y, 5, 4);
  // Glutkern (Sonne im Brustpanzer)
  const cc = pt(SD.spine - 4, 1);
  ell(p, cc.x, cc.y, 4.2, 4.2, GOLD.slice(1), { bias: 0.05 });
  const hot = heat;
  if (p.fine) {
    // Glutkern fein: Feinpixel-Stufen ohne Sprenkel (heißer heller Kern im roten Saum), Strahlenkranz als Strahlen
    const X = Math.round(cc.x), Y = Math.round(cc.y);
    for (let j = -2.5; j <= 2.5; j += 0.5) for (let i = -2.5; i <= 2.5; i += 0.5) {
      const r = Math.hypot(i + 0.25 - 0.5 + 0.5, j + 0.25 - 0.5 + 0.5);
      const rr = Math.hypot(i + 0.25, j + 0.25);
      if (rr > 2.45) continue;
      const v = (1 - (rr + Math.max(0, i + j) * 0.12) / 3) * 0.6 + hot * 0.3 + 0.08 + (r < 0 ? 1 : 0);
      const ci = v > 0.8 ? 5 : v > 0.62 ? 4 : v > 0.42 ? 3 : 2;
      p.dot(X + 0.5 + i, Y + 0.5 + j, LAVA[ci]); g.dot(X + 0.5 + i, Y + 0.5 + j, GLOW[Math.min(4, ci - 1)]);
    }
    p.dot(X, Y, '#ffffff'); p.dot(X - 0.5, Y - 0.5, '#ffffff');
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8, ca = Math.cos(a), sa = Math.sin(a);
      p.fline(cc.x + ca * 4.6, cc.y + sa * 4.6, cc.x + ca * 6, cc.y + sa * 6, i > 4 && i < 8 ? GOLD[4] : GOLD[3]);
      p.dot(cc.x + ca * 6, cc.y + sa * 6, GOLD[5]);
    }
    for (let a = -2.6; a <= -1.0; a += 0.12) p.dot(cc.x + Math.cos(a) * 3.6, cc.y + Math.sin(a) * 3.6, GOLD[5]);
  } else {
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
      if (i * i + j * j > 5) continue;
      const v = (1 - Math.hypot(i, j) / 3) * 0.6 + hot * 0.3 + hash2(i, j, 5) * 0.15;
      const ci = v > 0.8 ? 5 : v > 0.6 ? 4 : v > 0.4 ? 3 : 2;
      p.px(cc.x + i, cc.y + j, LAVA[ci]); g.px(cc.x + i, cc.y + j, GLOW[Math.min(4, ci - 1)]);
    }
    for (let i = 0; i < 8; i++) { const a = i * TAU / 8; p.px(cc.x + Math.cos(a) * 5.5, cc.y + Math.sin(a) * 5.5, GOLD[4]); }
  }
  meta.chest = { x: cc.x, y: cc.y };
  // Glutrisse im Obsidian
  veins(p, g, cp.x - 3, cp.y + 3, 9, 7, 23, 3 + Math.round(P.crk * 4), 0.7 + P.crk * 0.5, { len: 6 });
  const lg = pt(3, -3); veins(p, g, lg.x, lg.y, 5, 4, 27, 1 + Math.round(P.crk * 2), 0.8, { len: 4 });

  // --- vorderes Bein
  occlude(g);
  cap(p, hip.x + 3, hip.y, legF.jx, legF.jy, 6, 5.5, OBS, { rim: 0 });
  cap(p, legF.jx, legF.jy, legF.ex, legF.ey - 4, 5.5, 5, OBS);
  GL(p, legF.jx + 3, legF.jy + 2, legF.ex + 3, legF.ey - 5, OBS[6]);
  if (p.fine) {
    // Beinschiene: zweite Glanzlinie, Grat im Schatten, Fugen der Schuhplatten
    p.fline(legF.jx + 2, legF.jy + 2.5, legF.ex + 2, legF.ey - 5, OBS[5]);
    p.fline(legF.jx - 1, legF.jy + 3, legF.ex - 1, legF.ey - 5, OBS[1]);
    for (const o of [0, 3]) p.fline(legF.ex + 4 + o * 0.6, legF.ey - 4.5 + o, legF.ex - 4.5, legF.ey - 4.5 + o, o ? OBS[2] : OBS[6]);
  }
  poly(p, [[legF.ex - 5, legF.ey], [legF.ex - 5, legF.ey - 5], [legF.ex + 4, legF.ey - 5], [legF.ex + 10, legF.ey]], OBS[4]);
  L(p, legF.ex - 5, legF.ey - 5, legF.ex + 4, legF.ey - 5, GOLD[3]); L(p, legF.ex + 4, legF.ey - 5, legF.ex + 10, legF.ey, GOLD[2]);
  plate(p, legF.jx + 1, legF.jy, [[-4, -4], [4, -5], [5, 3], [-3, 4]]);
  p.px(legF.jx + 1, legF.jy, LAVA[3]); g.px(legF.jx + 1, legF.jy, GLOW[2]);
  occlude(null);

  // --- Kopf: gekrönter Helm mit Glutschlitz
  const neck = pt(SD.spine + 2, 1.5);
  const hx = Math.round(neck.x + P.head), hy = Math.round(neck.y - 5 + P.headY);
  ell(p, hx - 1, hy + 5, 5.5, 3, OBS_D.concat(OBS[5]));
  ell(p, hx, hy, 6, 6.8, OBS, { bias: 0.1 });
  poly(p, [[hx - 6, hy], [hx + 6.5, hy - 1], [hx + 7, hy + 4], [hx + 2, hy + 7], [hx - 5, hy + 6]], OBS[3]);
  poly(p, [[hx - 6, hy], [hx, hy - 0.5], [hx - 1, hy + 6], [hx - 5, hy + 6]], OBS[4]);
  // Gehörnter Großhelm (keine Krone – die trägt nur der Fürst): flacher Scheitel mit Goldgrat,
  // zwei mächtige Stierhörner, die nach oben-vorn schwingen
  p.rect(hx - 6, hy - 4, 13, 2, OBS[4]); L(p, hx - 6, hy - 4, hx + 6, hy - 4, OBS[6]); L(p, hx - 6, hy - 3, hx + 6, hy - 3, GOLD[3]);
  for (let i = -5; i <= 5; i++) p.px(hx + i * 0.5, hy - 5 - (5 - Math.abs(i)) * 0.35, GOLD[i < 0 ? 5 : 4]);
  const hq = p.fine ? 0.25 : 0.5;
  for (const side of [-1, 1]) {
    const bx = hx + (side < 0 ? -5 : 5), by = hy - 2;
    for (let k = 0; k <= 12; k += hq) {
      const f = k / 12;
      const x = bx + side * (k * 0.75 - f * f * 3) + (side < 0 ? -1 : 0), y = by - k * 0.55 - f * f * 6;
      const w = Math.max(0.5, 1.8 * (1 - f));
      for (let q = -w; q <= w; q += hq) {
        let c = f > 0.8 ? GOLD[5] : q < 0 ? (side < 0 ? OBS[5] : OBS[6]) : (side < 0 ? OBS[2] : OBS[3]);
        if (p.fine) {
          // Horn fein: Ringrillen, Glanzgrat oben, Goldspitze mit dunklem Ansatz
          if (f <= 0.8 && (k % 2 < 0.25) && k > 0.5) c = side < 0 ? OBS[2] : OBS[3];
          if (f <= 0.8 && q < -w + 0.3) c = side < 0 ? OBS[6] : '#b4a2cc';
          if (f > 0.78 && f <= 0.82) c = GOLD[2];
          p.dot(x, y + q, c);
        } else p.px(x, y + q, c);
      }
      if (f > 0.85) dot(g, x, y, GLOW[p.fine && f > 0.95 ? 3 : 1]);
    }
    p.px(bx, by, GOLD[3]); p.px(bx, by + 1, GOLD[2]);
    if (p.fine) rivet(p, bx, by, GOLD[5], GOLD[1]);
  }
  p.px(hx, hy - 4, LAVA[4]); g.px(hx, hy - 4, GLOW[3]);
  // Visierschlitz
  const vs = P.visor, ec = ex.hurt ? '#ffffff' : LAVA[5];
  p.rect(hx + 0, hy + 1, 7, 2, VOID);
  for (let i = -4; i <= -1; i += 3) p.px(hx + i, hy + 2, GOLD[4]);           // Nieten
  if (vs > 0.2 && !p.fine) {
    // ein glühender Schlitz (zwei heiße Augenpunkte), darunter tiefer Schatten
    p.rect(hx + 1, hy + 1, 5, 1, LAVA[3]); p.rect(hx + 1, hy + 2, 5, 1, VOID);
    p.px(hx + 2, hy + 1, ec); p.px(hx + 4, hy + 1, ec); p.px(hx + 3, hy + 1, LAVA[4]);
    g.rect(hx + 1, hy + 1, 5, 1, GLOW[vs > 0.8 ? 4 : 2]); g.rect(hx + 1, hy + 2, 5, 1, GLOW[2]);
    if (vs > 1.2) { g.rect(hx + 1, hy + 1, 7, 2, GLOW[3]); g.rect(hx + 2, hy + 1, 5, 1, GLOW[4]); }
  }
  if (p.fine) {
    // Helm fein: Glanzbogen und Glanzpunkt auf der Kalotte, Glanzlinie am Scheitel, Kinnplatten-Fuge,
    // Visier: dunkle Oberkante, glühender Schlitz mit zwei weißheißen Augenkernen, Nieten mit Glanz
    for (let a = -2.7; a <= -1.75; a += 0.08) p.dot(hx + Math.cos(a) * 5.2, hy + Math.sin(a) * 5.9, OBS[6]);
    p.dot(hx - 3, hy - 1.5, '#d4c6ea');
    p.fline(hx - 6, hy - 4, hx + 6.5, hy - 4, '#9a88b4'); p.fline(hx - 6, hy - 2.5, hx + 6.5, hy - 2.5, GOLD[1]);
    p.fline(hx + 2, hy + 4, hx + 6.5, hy + 3, OBS[1]); p.fline(hx - 4.5, hy + 4, hx + 1.5, hy + 4.5, OBS[2]);
    for (let i = -4; i <= -1; i += 3) rivet(p, hx + i, hy + 2);
    if (vs > 0.2) {
      // Schlitz: oben glühender Saum, darunter dunkler; zwei weißheiße Augenkerne; Leucht-Ebene ebenso fein
      p.fline(hx + 1, hy + 1, hx + 5.5, hy + 1, LAVA[3]); p.fline(hx + 1, hy + 1.5, hx + 5.5, hy + 1.5, LAVA[1]);
      p.dot(hx + 3, hy + 1, LAVA[4]); p.dot(hx + 3.5, hy + 1, LAVA[4]);
      g.fline(hx + 1, hy + 1, hx + 5.5, hy + 1, GLOW[vs > 0.8 ? 3 : 2]); g.fline(hx + 1, hy + 1.5, hx + 5.5, hy + 1.5, GLOW[1]);
      for (const e of [hx + 2, hx + 4]) {
        p.dot(e, hy + 1, ec); p.dot(e + 0.5, hy + 1, LAVA[5]); p.dot(e, hy + 1.5, LAVA[3]);
        g.dot(e, hy + 1, GLOW[4]); g.dot(e + 0.5, hy + 1, GLOW[4]); g.dot(e, hy + 1.5, GLOW[2]);
      }
      if (vs > 1.2) { g.fline(hx + 1, hy + 2, hx + 7.5, hy + 2, GLOW[2]); g.fline(hx + 6, hy + 1, hx + 7.5, hy + 1, GLOW[3]); g.fline(hx + 6, hy + 1.5, hx + 7.5, hy + 1.5, GLOW[2]); }
    }
  }
  meta.eye = { x: hx + 3, y: hy + 1 };
  meta.head = { x: hx, y: hy - 14 };
  meta.mouth = { x: hx + 5, y: hy + 4 };

  // --- vorderer Arm + Schwert + große Schulterplatte
  const arm = () => {
    occlude(g);
    cap(p, shF.x, shF.y, armF.jx, armF.jy, 5, 4.5, OBS);
    cap(p, armF.jx, armF.jy, armF.ex, armF.ey, 4.5, 5, OBS);
    plate(p, armF.jx, armF.jy, [[-3, -2], [3, -3], [3, 3], [-3, 2]], GOLD[3]);
    ell(p, armF.ex, armF.ey, 3.8, 3.8, OBS, { bias: 0.1 });
    p.px(armF.ex - 2, armF.ey - 2, GOLD[4]);
    if (p.fine) {
      for (let a = -2.7; a <= -1.8; a += 0.12) p.dot(armF.ex + Math.cos(a) * 3, armF.ey + Math.sin(a) * 3, OBS[6]);
      p.dot(armF.ex - 2, armF.ey - 2, GOLD[5]);
      p.fline(shF.x - 2, shF.y + 2, armF.jx - 2, armF.jy, OBS[6]);
    }
    occlude(null);
  };
  if (!behind) {
    smear(); arm(); bl = obsidianBlade(p, g, hF.x, hF.y, swA, swL, heat); ell(p, hF.x, hF.y, 3, 3, OBS, { bias: 0.1 }); p.px(hF.x - 1, hF.y - 2, GOLD[4]);
    if (p.fine) { for (let k = 0; k < 4; k++) p.dot(hF.x - 1.5 + k * 0.8, hF.y - 2 + k * 0.3, k % 2 ? OBS[6] : OBS[5]); p.dot(hF.x - 1, hF.y - 2, GOLD[5]); p.fline(hF.x - 2, hF.y + 1, hF.x + 1.5, hF.y + 1.5, OBS[1]); }
  }
  else arm();
  occlude(g);
  // Schulterplatte etwas tiefer und nach hinten gesetzt, Dorn hinten: der Helm mit
  // dem Glutvisier bleibt frei sichtbar (vorher verdeckte die Platte das Gesicht)
  plate(p, shF.x - 1, shF.y + 1, [[-7, -2], [2, -5], [7, -1], [6, 5], [-5, 5]], GOLD[4]);
  occlude(null);
  poly(p, [[shF.x - 5, shF.y - 3], [shF.x - 6, shF.y - 12], [shF.x - 2, shF.y - 4]], OBS[4]);
  GL(p, shF.x - 5, shF.y - 4, shF.x - 6, shF.y - 12, OBS[6]); p.px(shF.x - 6, shF.y - 12, GOLD[5]);
  p.px(shF.x + 1, shF.y + 1, LAVA[3]); g.px(shF.x + 1, shF.y + 1, GLOW[2]);
  if (p.fine) { p.fline(shF.x - 3, shF.y - 4, shF.x - 5.5, shF.y - 11, OBS[2]); p.dot(shF.x + 1, shF.y + 1, LAVA[5]); g.dot(shF.x + 1, shF.y + 1, GLOW[4]); }
  meta.hand = { x: hF.x, y: hF.y };
  meta.tip = bl.tip;

  // --- Brüllen: Hitzewellen vor dem Visier
  if (ex.roarFx) {
    for (let r = 6; r < 22; r += 5) for (let a = -0.8; a <= 0.8; a += 0.1) {
      const x = meta.eye.x + 4 + Math.cos(a) * (r + ex.roarFx * 3), y = meta.eye.y + Math.sin(a) * (r + ex.roarFx * 3);
      if (hash2(Math.round(a * 20), r, 8) < 0.5) g.px(x, y, GLOW[r < 10 ? 2 : 1]);
    }
    for (let i = 0; i < 10; i++) { const x = cc.x + (hash2(i, 1, 3) - 0.5) * 30, y = cc.y - hash2(i, 2, 3) * 30 * ex.roarFx * 0.4; p.px(x, y, LAVA[4]); g.px(x, y, GLOW[3]); }
  }
  // --- Einschlag: Glut bricht aus dem Boden
  if (ex.erupt) {
    const bx = ex.eruptX != null ? AX + ex.eruptX : bl.tip.x, gy = AY - 1;
    dustRing(p, g, bx, gy, 8 + ex.erupt * 14, 63, [OBS[3], OBS[5], CHAR[3]]);
    for (let i = 0; i < 6; i++) {
      const xx = bx + (i - 2.5) * (2 + ex.erupt * 3);
      flame(p, g, xx, gy, Math.round((5 + hash2(i, 1, 9) * 10) * ex.erupt * (1 - Math.abs(i - 2.5) / 4)), 2, ex.erupt * 4 + i, { seed: 70 + i, hot: 1 });
    }
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.45, d = 3 + ex.erupt * 6;
      shard(p, g, bx + Math.cos(a) * d * 1.6, gy, a, (4 + hash2(i, 3, 9) * 5) * ex.erupt, 1.6, OBS, { base: 0.3, gl: [GLOW[1], GLOW[2]] });
    }
  }
  clearBelow(p, AY + 1); clearBelow(g, AY + 1);
  return meta;
}

// Zerborstener Wächter: Obsidiantrümmer, gehörnter Helm, Schwert (k 0..1)
function drawSentinelRubble(p, g, k) {
  const { AX, AY } = SN;
  const gy = AY;
  const heat = 1 - k;
  // umgestürztes Flammenbanner hinter den Trümmern
  for (let x = AX - 50; x <= AX - 6; x++) { p.px(x, gy - 2, '#3a2214'); p.px(x, gy - 3, (x % 9) ? '#24140c' : GOLD[3]); }
  for (let i = 0; i < 14; i++) for (let j = 0; j < 7; j++) p.px(AX - 44 + i + j * 0.4, gy - 4 - j * 0.6 + (i % 4 === 0 ? 1 : 0), j === 6 || i === 0 ? GOLD[3] : (i + j) % 5 === 0 ? OBS[5] : OBS[4]);
  if (heat > 0.2) flame(p, g, AX - 50, gy - 3, Math.round(1 + heat * 3), 1.2, k * 5, { seed: 12, hot: heat });
  obsidianBlade(p, g, AX + 6, gy - 3, -0.04, 1, heat * 0.8);
  const chunks = [[-26, 5, 4], [-18, 7, 6], [-8, 9, 8], [4, 8, 7], [14, 6, 5], [-30, 4, 3], [22, 5, 4]];
  for (const [dx, rx, ry] of chunks) ell(p, AX + dx, gy - ry * 0.8, rx, ry, OBS, { noise: 0.07, seed: dx + 50 });
  for (const [dx, rx] of chunks) veins(p, g, AX + dx, gy - 4, rx, 3, dx + 90, 2, heat * 0.9, { len: 4, dark: CHAR[1] });
  plate(p, AX - 12, gy - 16, [[-7, -3], [3, -7], [9, -2], [7, 5], [-5, 5]], GOLD[3]);
  // Brustkern verglimmt
  ell(p, AX - 4, gy - 12, 4, 4, GOLD.slice(1));
  ell(p, AX - 4, gy - 12, 2.2, 2.2, heat > 0.3 ? [LAVA[2], LAVA[3], LAVA[4]] : [CHAR[1], CHAR[2]]);
  if (heat > 0.1) glowDot(g, AX - 4, gy - 12, 1 + heat * 2);
  // Gehörnter Helm liegt davor
  const cx = AX + 20;
  ell(p, cx, gy - 4, 5, 4, OBS, { bias: 0.1 });
  L(p, cx - 5, gy - 6, cx + 5, gy - 6, GOLD[3]); p.rect(cx + 1, gy - 4, 4, 1, heat > 0.3 ? LAVA[3] : VOID);
  for (const side of [-1, 1]) for (let k = 0; k <= 7; k += 0.5) { const f = k / 7; p.px(cx + side * (4 + k * 0.7), gy - 6 - k * 0.5 - f * f * 3, f > 0.8 ? GOLD[5] : OBS[5]); }
  for (let i = 0; i < 6; i++) if (heat > 0.2) flame(p, g, AX - 22 + i * 8, gy - 6, Math.round(1 + heat * 4 * hash2(i, 2, 7)), 1.2, k * 6 + i, { seed: 80 + i, hot: heat });
  return { eye: { x: AX - 4, y: gy - 12 }, head: { x: cx, y: gy - 10 }, hand: { x: AX + 6, y: gy - 3 }, chest: { x: AX - 4, y: gy - 12 }, tip: { x: AX + 44, y: gy - 3 } };
}

function createSentinel() {
  const S = spec(SN, (p, g, P, ex, t) => drawSentinel(p, g, P, { ...ex, t }), RIM_GOLD, BACK_EMBER);
  const idle = [];
  for (let i = 0; i <= 6; i++) {
    const ph = (i / 6) * TAU, sn = Math.sin(ph);
    idle.push([i / 6, snp({ two: 1, hipY: Math.max(0, sn), lean: 0.06 + sn * 0.012, hFx: 9, hFy: 12 + Math.max(0, sn), headY: Math.max(0, sn), heat: 0.9 + sn * 0.15, visor: 1, sw: -1.32 + sn * 0.03, ban: sn * 0.3 }), linear]);
  }
  const walk = [];
  for (let i = 0; i <= 8; i++) {
    const ph = (i / 8) * TAU, sn = Math.sin(ph), c = Math.cos(ph);
    walk.push([i / 8, snp({
      hipX: 1, hipY: 1.5 - Math.abs(c) * 2.5, lean: 0.12 + sn * 0.02, head: sn * 0.5, headY: Math.abs(c),
      fFx: 3 + sn * 10, fFy: Math.max(0, -c) * 5, fBx: -4 - sn * 10, fBy: Math.max(0, c) * 5,
      two: 1, hFx: 10 - sn * 1.5, hFy: 12, sw: -1.25 - sn * 0.05, ban: 0.6,
    }), linear]);
  }
  // Hieb: Schwert über die Schulter, dann schräg nach vorn-unten
  const w1 = snp({ lean: -0.05, hipX: -1, hFx: 4, hFy: -6, sw: -1.9, fFx: 11, fBx: -11, heat: 1.2 });
  const w2 = snp({ lean: -0.2, hipX: -2, hipY: -1, hFx: -3, hFy: -12, sw: -2.7, fFx: 12, fBx: -12, heat: 1.4, visor: 1.3 });
  const s1 = snp({ lean: 0.2, hipX: 3, hipY: 2, hFx: 18, hFy: -6, sw: -0.6, fFx: 15, fBx: -12, heat: 1.4, visor: 1.3 });
  const s2 = snp({ lean: 0.38, hipX: 5, hipY: 6, hFx: 20, hFy: 12, sw: 0.55, fFx: 16, fBx: -13, heat: 1.5, visor: 1.3 });
  const s3 = snp({ ...s2, lean: 0.34, hFy: 13, heat: 1.2 });
  const s4 = snp({ lean: 0.15, hipX: 2, hipY: 2, hFx: 14, hFy: 16, sw: -0.3, fFx: 12, fBx: -11 });
  // Brüllen
  const r1 = snp({ lean: -0.08, hFx: 16, hFy: 4, sw: -0.9, hBx: -17, hBy: 6, headY: -1, visor: 1.5, heat: 1.4 });
  const r2 = snp({ lean: -0.24, hipY: -1, hFx: 18, hFy: -6, sw: -1.25, hBx: -19, hBy: -2, headY: -3, head: -1, visor: 2, heat: 1.9, crk: 1 });
  // Bodenstoß (slam): Schwert senkrecht hoch, dann mit der Spitze in den Boden
  const sl1 = snp({ lean: -0.08, hipY: -1, hFx: 8, hFy: -16, sw: -1.62, heat: 1.3, visor: 1.2 });
  const sl2 = snp({ lean: -0.2, hipY: -3, hFx: 6, hFy: -22, sw: -1.6, heat: 1.7, visor: 1.5, fBy: 2, crk: 0.5 });
  const sl3 = snp({ lean: 0.4, hipY: 10, hFx: 20, hFy: 4, sw: 1.52, heat: 2, visor: 1.8, fFx: 15, fBx: -13, crk: 1 });
  const sl4 = snp({ ...sl3, lean: 0.38, heat: 1.6, visor: 1.3 });
  const sl5 = snp({ lean: 0.15, hipY: 3, hFx: 14, hFy: 16, sw: -0.4, heat: 1.1 });
  // Wirbel (spin): Schwert kreist waagerecht um den Körper
  const spin = [];
  for (let i = 0; i < 8; i++) {
    const ph = i / 8, a1 = ph * TAU;
    spin.push(snp({ spin: ph, lean: 0.05, hipY: 3, fFx: 12 + Math.sin(a1) * 2, fBx: -12 + Math.sin(a1) * 2, fFy: i % 4 === 0 ? 1.5 : 0, head: Math.cos(a1) * 1, heat: 1.5, visor: 1.4 }));
  }
  const hurtP = snp({ lean: -0.18, hipX: -3, head: -2, headY: -1, hFx: 9, hFy: 14, sw: -0.8, hBx: -13, hBy: 12, visor: 1.6, heat: 1.5, crk: 0.6 });
  const d1 = snp({ lean: -0.28, hipX: -4, head: -2, hFx: 8, hFy: 14, sw: -0.4, hBx: -14, hBy: 12, visor: 1.3, heat: 1.4, crk: 1 });
  const d2 = snp({ lean: 0.4, kneel: 1, hipY: 3, head: 1, headY: 2, hFx: 18, hFy: 16, sw: 1.52, visor: 0.8, heat: 0.9, crk: 1.4 });
  const d3 = snp({ lean: 0.6, kneel: 1, hipY: 6, head: 2, headY: 4, hFx: 19, hFy: 16, sw: 1.5, visor: 0.3, heat: 0.6, crk: 1.6 });
  const T = (keys, n, o) => track(S, keys, n, o);
  return {
    idle: new Animation(T(idle, 6, { loop: true }), 5),
    walk: new Animation(T(walk, 8, { loop: true, extras: { 0: { fx: 'step' }, 4: { fx: 'step' } } }), 7),
    windup: new Animation(T([[0, idle[0][1]], [0.45, w1], [1, w2]], 5, { extras: { 3: { bladeBehind: true }, 4: { bladeBehind: true } } }), 8, false),
    strike: new Animation(T([[0, s1], [0.25, s2, snap], [0.6, s3], [1, s4]], 5, {
      extras: { 0: { smear: [-2.3, -0.7] }, 1: { fx: 'impact', smear: [-1.4, 0.6] }, 2: { smear: [0.2, 0.6] } },
    }), 12, false),
    roar: new Animation(T([[0, idle[0][1]], [0.3, r1], [0.5, r2, snap], [0.85, { ...r2, heat: 2 }], [1, snp({ ...r1, visor: 1.2 })]], 8, {
      extras: { 3: { fx: 'roar', roarFx: 1 }, 4: { roarFx: 2 }, 5: { roarFx: 3 }, 6: { roarFx: 4 } },
    }), 7, false),
    slam: new Animation(T([[0, idle[0][1]], [0.25, sl1], [0.45, sl2], [0.6, sl3, snap], [0.8, sl4], [1, sl5]], 9, {
      extras: { 1: { twoHand: true }, 2: { twoHand: true }, 3: { twoHand: true }, 4: { twoHand: true, smear: [-1.7, 0.1] }, 5: { twoHand: true, fx: 'impact', erupt: 0.6 }, 6: { twoHand: true, erupt: 1 }, 7: { erupt: 0.7 } },
    }), 9, false),
    spin: new Animation(spin.map((P, i) => T([[0, P], [1, P]], 1, { extras: { 0: { smear: [i / 8 * TAU - 2.2, i / 8 * TAU, 0.38], smearC: { x: 2, y: 9 }, smearR0: 30, smearR1: 48, fx: i % 4 === 0 ? 'step' : null } } })[0]), 16),
    hurt: new Animation(T([[0, hurtP], [1, snp({ lean: 0 })]], 2, { extras: { 0: { hurt: true } } }), 8, false),
    death: new Animation([
      ...T([[0, hurtP], [0.3, d1], [0.65, d2, snap], [1, d3]], 4, { extras: { 0: { hurt: true }, 2: { fx: 'impact', erupt: 0.4 } } }),
      stillR(S, (p, g) => drawSentinelRubble(p, g, 0), 'impact', RIM_GOLD, BACK_EMBER),
      stillR(S, (p, g) => drawSentinelRubble(p, g, 0.45), null, RIM_GOLD, BACK_EMBER),
      stillR(S, (p, g) => drawSentinelRubble(p, g, 1), null, RIM_GOLD, BACK_EMBER),
    ], 6, false),
  };
}

// ================================================================ Export

const THRONE = {
  throne_guard: createThroneGuard,
  ash_priest: createAshPriest,
  ember_hellhound: createHellhound,
  throne_sentinel: createSentinel,
};

// only (optional): nur eine Figur erzeugen. Jede Figur wird erst beim ersten
// Zugriff gezeichnet und dann gecacht (wie createForgeFoes).
export function createThroneFoes(only) {
  const out = {};
  for (const k in THRONE) {
    if (only && only !== k) continue;
    Object.defineProperty(out, k, {
      configurable: true, enumerable: true,
      get() {
        const v = THRONE[k]();
        Object.defineProperty(out, k, { value: v, writable: true, configurable: true, enumerable: true });
        return v;
      },
    });
  }
  return out;
}
