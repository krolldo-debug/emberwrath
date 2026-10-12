import { PAL } from '../gfx/Palette.js';
import { buildFrame, SpriteFrame, Animation } from '../gfx/Sprite.js';
import { FineCanvas, fineRes, col32, pixelsToCanvas } from '../gfx/Fine.js';
import { hash2 } from '../core/math.js';

// Gegner der Faulmarsch (Stufe 25–31): Moorlauerer, Fäulnisschamane,
// Sumpfegel, Pestkröte und „Das Moorgrauen“ (Elite).
//
// Wie foes_ashwood.js/foes_cinder.js: kleine Rigs mit Schlüsselposen, die beim
// Laden weich interpoliert werden, Körper aus beleuchteten Ellipsen/Kapseln
// (Licht von links oben). Jeder Frame hat eine Leucht-Ebene (frame.glow),
// Metadaten (frame.meta: eye/hand/mouth/head … relativ zum Anker) und
// optional eine Ereignismarke (frame.fx: 'step' | 'impact' | 'roar' | 'cast').
// Das Moor ist dunkel: jede Figur bekommt nach dem Zeichnen ein fahles
// Randlicht (Mondlicht oben links, kaltes Gegenlicht rechts), damit die
// Silhouette auf Schlamm und Wasser lesbar bleibt.
// Blickrichtung rechts, Anker = Bodenkontakt.
//
// Feinraster (docs/STYLE.md „Feinraster“, Stufe B): gezeichnet wird auf FineCanvas in Weltpixeln; die Formen
// (ell, cap, poly, chain) tasten Feinpixel ab und schreiben in den Pixelpuffer, p.px/p.rect/p.line setzen ganze
// Weltpixel. Handfeine Zusatzdetails stehen in `if (p.fine)`; bei Qualität „Niedrig“ (res 1) bleibt alles wie vorher.

// ================================================================ Werkzeuge

const ease = (t) => t * t * (3 - 2 * t);
const snap = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const TAU = Math.PI * 2;

function mix(a, b, t) {
  const o = {};
  for (const k in a) o[k] = a[k] + ((b[k] ?? a[k]) - a[k]) * t;
  return o;
}
// keys = [[t 0..1, pose, easing?], ...]
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

// Licht von links oben, leicht zum Betrachter
const LX = -0.52, LY = -0.66, LZ = 0.54;
// Verdecker: solange gesetzt, löschen ell()/cap()/poly() die Glow-Ebene unter sich.
let OCC = null;
const occlude = (g) => { OCC = g; };
function tone(ramp, nx, ny, nz, bias, noise) {
  const t = 0.28 + 0.62 * (nx * LX + ny * LY + nz * LZ) + bias + noise;
  return ramp[clamp(Math.floor(t * ramp.length), 0, ramp.length - 1)];
}

// ---------------------------------------------------------------- Feinraster-Unterbau
// Alle Formen schreiben direkt in den Pixelpuffer der FineCanvas (p.buf, Texel). Abgetastet wird je Feinpixel
// (Mitte), bei res 1 also wie früher je Weltpixel an x+0.5 – Qualität „Niedrig“ bleibt pixelgleich.

// Texel setzen (Puffer-Koordinaten); ein aktiver Verdecker löscht die Leuchtebene darunter.
function occT(F, G) {
  const o = OCC;
  if (F < 0 || G < 0 || F >= o.W || G >= o.H) return;
  if (o._canvas) { const r = o.res; o.ctx.clearRect(F / r - o.ox, G / r - o.oy, 1 / r, 1 / r); }
  o.buf[G * o.W + F] = 0;
}

// Tastet einen Bereich (Zeichenkoordinaten, Weltpixel) Feinpixel für Feinpixel ab:
// fn(x, y) -> Farbe | null mit x/y = Mitte des Feinpixels.
function scan(p, x0, y0, x1, y1, fn) {
  const r = p.res, q = 1 / r, W = p.W, H = p.H, b = p.buf;
  const fo = Math.round(p.ox * r), go = Math.round(p.oy * r);
  const F0 = Math.max(Math.floor(x0 * r), -fo), F1 = Math.min(Math.ceil(x1 * r), W - 1 - fo);
  const G0 = Math.max(Math.floor(y0 * r), -go), G1 = Math.min(Math.ceil(y1 * r), H - 1 - go);
  let lc = null, lv = 0;
  for (let G = G0; G <= G1; G++) {
    const y = (G + 0.5) * q, row = (G + go) * W + fo;
    for (let F = F0; F <= F1; F++) {
      const c = fn((F + 0.5) * q, y);
      if (!c) continue;
      if (c !== lc) { lc = c; lv = col32(c); }
      b[row + F] = lv;
      if (OCC) occT(F + fo, G + go);
    }
  }
  p.dirty = true;
}

// Gefüllte Ellipse wie PixelCanvas.ellipse (Zeilenspannen), im Feinraster (Leuchtpunkte).
function pell(c, cx, cy, rx, ry, col) {
  const q = c.step;
  for (let y = -Math.ceil(ry / q) * q; y <= Math.ceil(ry / q) * q + 1e-9; y += q) {
    const t = 1 - (y * y) / (ry * ry);
    if (t < 0) continue;
    const hw = Math.round((rx * Math.sqrt(t) - 0.15 * q) / q) * q;
    c.rect(Math.round((cx - hw) / q) * q, Math.round((cy + y) / q) * q, hw * 2 + q, q, col);
  }
}

// Fertiges Texelbild bearbeiten: fn(Uint32Array) – direkt im Puffer oder (falls schon per ctx bemalt) über ImageData.
function withPixels(c, fn) {
  if (!c._canvas) { fn(c.buf); c.dirty = true; return; }
  const ctx = c.ctx, img = ctx.getImageData(0, 0, c.W, c.H);
  fn(new Uint32Array(img.data.buffer));
  ctx.putImageData(img, 0, 0);
}

// Materialrauschen im Feinraster gedämpft: die Form tragen Licht und gezeichnete Details, nicht Sprenkel.
const NOISE_FINE = 0.45;

// Schattierte Ellipse (optional gedreht, mit Materialrauschen).
// Das Rauschen bleibt je Weltpixel (sonst Sprenkel im Feinraster) und ist fein schwächer.
function ell(p, cx, cy, rx, ry, ramp, o = {}) {
  const { rot = 0, noise = 0, seed = 1, bias = 0, clip = null } = o;
  if (rx <= 0 || ry <= 0) return;
  const c = Math.cos(rot), s = Math.sin(rot), h = p.step / 2;
  // fein: knolliger Umriss (o.lump = Ausschlag in Weltpixeln), an die Form gebunden
  const lump = p.fine && o.lump ? o.lump / Math.max(rx, ry) : 0;
  const R = Math.ceil(Math.max(rx, ry) + (lump ? o.lump : 0)) + 1, nk = p.fine ? noise * NOISE_FINE * (lump ? 0.35 : 1) : noise;
  scan(p, cx - R, cy - R, cx + R, cy + R, (x, y) => {
    const dx = x - cx, dy = y - cy;
    let u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry;
    let d2 = u * u + v * v;
    if (lump) {
      const a = Math.atan2(v, u), k = 1 + lump * (0.6 * Math.sin(a * 5 + seed) + 0.4 * Math.sin(a * 11 + seed * 2.3));
      u /= k; v /= k; d2 /= k * k;
    }
    if (d2 > 1) return null;
    if (clip && !clip(x - h, y - h)) return null;
    const nz = Math.sqrt(1 - d2);
    const nx = u * c - v * s, ny = u * s + v * c;
    const n = nk ? (hash2(Math.round(dx) + 64, Math.round(dy) + 64, seed) - 0.5) * nk : 0;
    return tone(ramp, nx, ny, nz, bias, n);
  });
}

// Schattierte Kapsel (Gliedmaßen): Radius r0 -> r1. Eigene Schleife mit Zeilenspannen (schnell bei schrägen Kapseln);
// je Feinpixel exakt dieselbe Prüfung wie früher.
function cap(p, x0, y0, x1, y1, r0, r1, ramp, o = {}) {
  const { noise = 0, seed = 1, bias = 0 } = o;
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 0.0001;
  // fein: knolliger Umriss (o.lump = Ausschlag in Weltpixeln), Buckel längs der Achse und je Seite verschieden
  const lump = p.fine && o.lump ? o.lump : 0, len = Math.sqrt(l2);
  const Rm = Math.max(r0, r1) + lump + 1e-6, nk = p.fine ? noise * NOISE_FINE * (lump ? 0.35 : 1) : noise;
  const R = Math.ceil(Math.max(r0, r1) + lump) + 1;
  const r = p.res, q = 1 / r, W = p.W, H = p.H, b = p.buf;
  const fo = Math.round(p.ox * r), go = Math.round(p.oy * r);
  const G0 = Math.max(Math.floor((Math.min(y0, y1) - R) * r), -go), G1 = Math.min(Math.ceil((Math.max(y0, y1) + R) * r), H - 1 - go);
  let lc = null, lv = 0;
  for (let G = G0; G <= G1; G++) {
    const py = (G + 0.5) * q;
    // Bereich des Parameters t, in dem die Achse höchstens Rm von dieser Zeile entfernt ist
    let ta = 0, tb = 1;
    if (Math.abs(dy) > 1e-9) {
      ta = (py - Rm - y0) / dy; tb = (py + Rm - y0) / dy;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      ta = Math.max(0, ta); tb = Math.min(1, tb);
      if (ta > tb) continue;
    } else if (Math.abs(py - y0) > Rm) continue;
    const xa = x0 + dx * ta, xb = x0 + dx * tb;
    const F0 = Math.max(Math.floor((Math.min(xa, xb) - Rm) * r), -fo), F1 = Math.min(Math.ceil((Math.max(xa, xb) + Rm) * r), W - 1 - fo);
    const row = (G + go) * W + fo;
    for (let F = F0; F <= F1; F++) {
      const px = (F + 0.5) * q;
      const t = clamp(((px - x0) * dx + (py - y0) * dy) / l2, 0, 1);
      const qx = x0 + dx * t, qy = y0 + dy * t;
      let rr = r0 + (r1 - r0) * t;
      const ex = px - qx, ey = py - qy;
      if (lump) {
        const side = ex * dy - ey * dx > 0 ? 1 : -1, u = t * len;
        rr += lump * (0.6 * Math.sin(u * 0.9 + seed + side * 2) + 0.4 * Math.sin(u * 2.1 + seed * 1.7 + side));
      }
      if (ex * ex + ey * ey > rr * rr * 1.000001 + 1e-9) continue;
      const d = Math.hypot(ex, ey);
      if (d > rr) continue;
      const nx = ex / (rr || 1), ny = ey / (rr || 1), nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const n = nk ? (hash2(Math.round(px - x0) + 64, Math.round(py - y0) + 64, seed) - 0.5) * nk : 0;
      const c = tone(ramp, nx, ny, nz, bias, n);
      if (c !== lc) { lc = c; lv = col32(c); }
      b[row + F] = lv;
      if (OCC) occT(F + fo, G + go);
    }
  }
  p.dirty = true;
}

// Gefülltes Polygon (Scanline je Feinzeile). col: Farbe oder (x,y)=>Farbe (x/y = linke obere Ecke des Feinpixels).
function poly(p, pts, col) {
  let minY = Infinity, maxY = -Infinity;
  for (const q of pts) { minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]); }
  const r = p.res, W = p.W, H = p.H, b = p.buf, fo = Math.round(p.ox * r), go = Math.round(p.oy * r);
  const fn = typeof col === 'function';
  const v0 = fn ? 0 : col32(col);
  for (let G = Math.floor(minY) * r; G <= Math.ceil(maxY) * r; G++) {
    const y = G / r, yc = (G + 0.5) / r, xs = [];
    const TG = G + go;
    if (TG < 0 || TG >= H) continue;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], c = pts[(i + 1) % pts.length];
      if ((a[1] <= yc && c[1] > yc) || (c[1] <= yc && a[1] > yc)) xs.push(a[0] + (yc - a[1]) / (c[1] - a[1]) * (c[0] - a[0]));
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const F0 = Math.round(xs[k] * r), F1 = Math.round(xs[k + 1] * r);
      for (let F = F0; F < F1; F++) {
        const TF = F + fo;
        if (TF < 0 || TF >= W) continue;
        const c = fn ? col(F / r, y) : col;
        if (!c) continue;
        b[TG * W + TF] = fn ? col32(c) : v0;
        if (OCC) occT(TF, TG);
      }
    }
  }
  p.dirty = true;
}

// Kette von Punkten als Kapseln (Wurzeln, Moosbärte, Stäbe).
function chain(p, pts, r0, r1, ramp, o = {}) {
  for (let i = 0; i < pts.length - 1; i++) {
    const f0 = i / (pts.length - 1), f1 = (i + 1) / (pts.length - 1);
    cap(p, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], r0 + (r1 - r0) * f0, r0 + (r1 - r0) * f1, ramp, o);
  }
}

// Gebogene Wurzel/Ranke: Start (x,y), Winkel a, Krümmung c je Glied, n Glieder.
function root(x, y, a, c, n, seg = 1.6, wob = 0, ph = 0) {
  const pts = [[x, y]];
  for (let i = 0; i < n; i++) {
    a += c + Math.sin(ph + i * 0.9) * wob;
    x += Math.cos(a) * seg; y += Math.sin(a) * seg;
    pts.push([x, y]);
  }
  return pts;
}

// Leuchtpunkt auf der Glow-Ebene (konzentrisch), Rampe dunkel -> hell. Fein: Ringe in Feinpixeln,
// dazu ein heißer heller Kern (2×2 Feinpixel).
function glowDot(g, x, y, r, G) {
  if (r <= 0.6) { g.px(x, y, G[3]); if (g.fine) g.dot(x, y, G[4]); return; }
  pell(g, x, y, r + 1, r + 1, G[0]);
  pell(g, x, y, r, r, G[1]);
  pell(g, x, y, Math.max(0.5, r - 1), Math.max(0.5, r - 1), G[2]);
  if (r > 1.5) pell(g, x, y, Math.max(0.5, r - 2), Math.max(0.5, r - 2), G[3]);
  if (r > 2.5) pell(g, x, y, Math.max(0.5, r - 3), Math.max(0.5, r - 3), G[4]);
  if (g.fine && r <= 2.5) g.rect(g.snap(x - 0.25), g.snap(y - 0.25), r > 1.5 ? 1 : 0.5, r > 1.5 ? 1 : 0.5, G[4]);
}

// Tropfender Schlamm: Faden unter (x,y), Länge len, Phase ph (0..1).
// Fein: dünner Faden (1 Feinpixel) mit Lichtkante, Tropfenkopf mit Glanzpunkt, fallender Tropfen.
function drip(p, g, x, y, len, ph, cols, gcol = null) {
  const f = ((ph % 1) + 1) % 1;
  const L = Math.max(1, Math.round(len * (0.4 + 0.6 * f)));
  if (p.fine) {
    const X0 = p.snap(x), Y0 = p.snap(y);
    for (let j = 0; j < L - 0.5; j += 0.5) { p.dot(X0, Y0 + j, cols[1]); if (j < L * 0.5) p.dot(X0 + 0.5, Y0 + j, cols[0]); }
    // Tropfenkopf: 3 Feinpixel breit, unten dunkel, oben links ein Glanzpunkt
    p.dot(X0 - 0.5, Y0 + L - 0.5, cols[1]); p.dot(X0, Y0 + L - 0.5, cols[2]); p.dot(X0 + 0.5, Y0 + L - 0.5, cols[1]);
    p.dot(X0, Y0 + L, cols[1]); p.dot(X0 - 0.5, Y0 + L - 1, DRIP_HI);
    if (f > 0.7) { p.dot(X0, Y0 + L + 1, cols[2]); p.dot(X0, Y0 + L + 1.5, cols[1]); if (gcol) g.dot(X0, Y0 + L + 1, gcol); }
    return;
  }
  for (let j = 0; j < L; j++) p.px(x, y + j, j === L - 1 ? cols[2] : cols[1]);
  if (f > 0.7) { p.px(x, y + L + 1, cols[2]); if (gcol) g.px(x, y + L + 1, gcol); }
}
const DRIP_HI = '#8a8058';

// ---------------------------------------------------------------- handfeine Kleinteile (nur bei p.fine)
// Glanzpunkt auf nasser Haut: kurzer Glanzstrich mit hellem Kern, daneben ein abgesetzter Nebenglanz.
function shine(p, x, y, lo, hi, len = 2) {
  x = p.snap(x); y = p.snap(y);
  for (let i = 0; i < len; i++) p.dot(x + i * 0.5, y + (i > 1 ? 0.5 : 0), lo);
  p.dot(x, y, hi);
  if (len > 1) p.dot(x + len * 0.5 + 0.5, y + 1, lo);
}
// Warze/Pustel: 2×2 Feinpixel, heller Kern oben links, Schatten unten rechts und darunter.
function wart(p, x, y, dk, md, lt) {
  x = p.snap(x); y = p.snap(y);
  p.dot(x + 0.5, y, md); p.dot(x, y + 0.5, md); p.dot(x + 0.5, y + 0.5, dk); p.dot(x + 0.5, y + 1, dk); p.dot(x, y, lt);
}
// Lichtkante/Maserung entlang einer Punktkette (Wurzel, Geweih, Rippe): feine Linie auf der Lichtseite, k = Anteil des Radius.
function edge(p, pts, r0, r1, col, k = 0.5) {
  const n = pts.length - 1;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], L = Math.hypot(x1 - x0, y1 - y0) || 1;
    let nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
    if (nx * LX + ny * LY < 0) { nx = -nx; ny = -ny; }
    const ra = (r0 + (r1 - r0) * i / n) * k, rb = (r0 + (r1 - r0) * (i + 1) / n) * k;
    p.fline(x0 + nx * ra, y0 + ny * ra, x1 + nx * rb, y1 + ny * rb, col);
  }
}
// Moospolster: Büschel mit hellem Kamm (Licht oben links) und Schattenbogen, am Unterrand hängende Strähnen.
function mossTufts(p, cx, cy, rx, ry, ph, n, seed = 5) {
  for (let i = 0; i < n; i++) {
    const u = -0.85 + 1.7 * (i + 0.5) / n, v = -0.85 + hash2(i, seed, 74) * 1.1;
    const x = cx + u * rx * 0.85, y = cy + v * ry * Math.sqrt(1 - u * u);
    const lit = u * LX + v * LY > 0.15;
    p.dot(x, y + 0.5, MOSS[2]); p.dot(x + 0.5, y + 0.5, MOSS[2]);
    p.dot(x - 0.5, y, lit ? MOSS[5] : MOSS[4]); p.dot(x, y - 0.5, lit ? MOSS[6] : MOSS[5]); p.dot(x + 0.5, y, MOSS[4]);
  }
  const m = Math.ceil(n * 0.7);
  for (let i = 0; i < m; i++) {
    const u = -0.8 + 1.6 * (i + 0.5) / m, x = cx + u * rx, y = cy + ry * Math.sqrt(1 - u * u) - 0.5;
    const len = 1 + hash2(i, seed + 1, 74) * 2, sw = Math.sin(ph + i) * 0.4;
    p.fline(x, y, x + sw, y + len, MOSS[i & 1 ? 2 : 3]);
    p.dot(x + sw, y + len, MOSS[1]);
  }
}
// Klaue/Zahn/Stachel als spitzer Keil: an der Wurzel 2 Feinpixel (Lichtseite oben links heller), Spitze 1 Feinpixel.
function spike(p, x0, y0, x1, y1, dark, lite, tip) {
  const L = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / L, uy = (y1 - y0) / L;
  let nx = -uy, ny = ux;
  if (nx * LX + ny * LY < 0) { nx = -nx; ny = -ny; }
  const n = Math.max(1, Math.round(L * 2));
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    p.dot(x, y, dark);
    if (t < 0.6) p.dot(x + nx * 0.5, y + ny * 0.5, lite);
  }
  p.dot(x1, y1, tip);
}

// Wölkchen aus Sporen/Faulgas (auf Farb- und Leucht-Ebene): dichte, weich
// schattierte Ballen mit ausgefranstem Rand. k 0..1 = Dichte (dünnt nur den Rand aus).
// Fein: runder Ballen in Feinpixeln, Ausfransen je Weltpixel (ruhig), harte Lichtstufen mit hellem Kern
// oben links und heißem Kern auf der Leuchtebene.
function gasPuff(p, g, x, y, r, k, seed, C, G) {
  if (r < 0.8 || k <= 0.02) return;
  const R = Math.ceil(r) + 1;
  if (p.fine) {
    const rx0 = Math.round(x), ry0 = Math.round(y), cx = rx0 + (x % 1), cy = ry0 + (y % 1);
    scanPair(p, g, rx0 - R, ry0 - R, rx0 + R + 1, ry0 + R + 1, (px, py) => {
      const fx = px - cx, fy = py - cy, d = Math.hypot(fx, fy * 1.2) / r;
      if (d > 1) return null;
      const xx = Math.floor(px) - rx0, yy = Math.floor(py) - ry0;
      const h = hash2(xx + 40 + rx0, yy + 40 + ry0, seed);
      if (d > 0.62 && h > k * 1.3 - (d - 0.62) * 1.6) return null;
      const l = (-fx * 0.5 - fy * 0.8) / (r || 1) + (1 - d) * 0.6;
      const c = l > 0.75 ? C[4] : l > 0.35 ? C[3] : l > -0.1 ? C[2] : C[1];
      const gc = d < 0.55 && h < k * 0.5 ? (d < 0.16 ? G[3] : d < 0.3 ? G[1] : G[0]) : null;
      return [c, gc];
    });
    return;
  }
  for (let yy = -R; yy <= R; yy++) for (let xx = -R; xx <= R; xx++) {
    const d = Math.hypot(xx + 0.5 - (x % 1), (yy + 0.5 - (y % 1)) * 1.2) / r;
    if (d > 1) continue;
    const h = hash2(xx + 40 + Math.round(x), yy + 40 + Math.round(y), seed);
    if (d > 0.62 && h > k * 1.3 - (d - 0.62) * 1.6) continue;
    // Licht von oben links
    const l = (-(xx) * 0.5 - yy * 0.8) / (r || 1) + (1 - d) * 0.6;
    const c = l > 0.75 ? C[4] : l > 0.35 ? C[3] : l > -0.1 ? C[2] : C[1];
    p.px(x + xx, y + yy, c);
    if (d < 0.55 && h < k * 0.5) g.px(x + xx, y + yy, d < 0.25 ? G[1] : G[0]);
  }
}
// scan für Farb- und Leuchtebene zugleich: fn -> [farbe, leuchtfarbe|null] | null
function scanPair(p, g, x0, y0, x1, y1, fn) {
  let gl = null;
  scan(p, x0, y0, x1, y1, (x, y) => {
    const v = fn(x, y);
    if (!v) return null;
    if (v[1]) (gl ??= []).push(x, y, v[1]);
    return v[0];
  });
  if (gl) for (let i = 0; i < gl.length; i += 3) g.dot(gl[i], gl[i + 1], gl[i + 2]);
}

// Randlicht: helle Oberkante (Mondlicht von links oben) und kaltes Gegenlicht
// rechts. Läuft über die fertige Figur (Texel), bevor der Umriss entsteht. Fein: etwa 1 Weltpixel tief
// in harter Stufe – äußerster Texel voll, der innere schwächer.
let RIM_MASK = new Uint8Array(0);
function rimLight(p, rim, back, k1 = 0.42, k2 = 0.3) {
  const W = p.W, H = p.H, r = p.res;
  const R1 = hex(rim), R2 = hex(back);
  // Deckungsmaske mit r Texeln Rand: 1 = deckend (Alpha ≥ 40); Puffer wird wiederverwendet
  const MW = W + 2 * r, MN = MW * (H + 2 * r);
  if (RIM_MASK.length < MN) RIM_MASK = new Uint8Array(MN);
  const M = RIM_MASK;
  M.fill(0, 0, MN);
  withPixels(p, (px32) => {
    for (let y = 0; y < H; y++) for (let x = 0, i = y * W, m = (y + r) * MW + r; x < W; x++) if ((px32[i + x] >>> 24) >= 40) M[m + x] = 1;
    const d = new Uint8ClampedArray(px32.buffer, px32.byteOffset, W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const m = (y + r) * MW + x + r;
      if (!M[m]) continue;
      const u1 = m - MW;   // schneller Ausstieg im Inneren: alle geprüften Nachbarn deckend
      if (M[u1] && M[m - 1] && M[m + 1] && M[u1 + 1] && (r === 1 || M[u1 - MW] && M[m - 2] && M[m + 2] && M[u1 - MW + 2])) continue;
      let k = 0, C = null;
      for (let s = 1; s <= r && !C; s++) {
        const f = s === 1 ? 1 : 0.45, up = m - s * MW;
        if (!M[up] || !M[up - s] && !M[m - s]) { k = k1 * f; C = R1; }
        else if (!M[m - s]) { k = k1 * 0.6 * f; C = R1; }
        else if (!M[m + s] || !M[up + s] && M[up] && !M[m + s * MW + s]) { k = k2 * f; C = R2; }
      }
      if (!C) continue;
      const i = (y * W + x) * 4, sr = d[i], sg = d[i + 1], sb = d[i + 2];
      if (sr * 0.3 + sg * 0.59 + sb * 0.11 > 185) continue;
      d[i] = sr + (C[0] - sr) * k;
      d[i + 1] = sg + (C[1] - sg) * k;
      d[i + 2] = sb + (C[2] - sb) * k;
    }
  });
}
function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }

// Dreht den Inhalt einer FineCanvas texelgenau (nächster Nachbar) um einen Drehpunkt (Weltpixel);
// liefert den gedrehten Texelpuffer gleicher Größe.
const ROT_PROBE = [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]];
function rotPix(src, px, py, ang) {
  const r = src.res, W = src.W, H = src.H, s = src.pixels(), d = new Uint32Array(W * H);
  px *= r; py *= r;
  const c = Math.cos(-ang), sn = Math.sin(-ang);
  const at = (fx, fy) => {
    const sx = Math.floor(fx), sy = Math.floor(fy);
    return sx < 0 || sy < 0 || sx >= W || sy >= H ? 0 : s[sy * W + sx];
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const rx = x + 0.5 - px, ry = y + 0.5 - py;
    const fx = px + rx * c - ry * sn, fy = py + rx * sn + ry * c;
    let v = at(fx, fy);
    if (!(v >>> 24) && r > 1) {
      // fein: Lücken in gedrehten 1-Feinpixel-Linien schließen (mind. 2 von 4 Nachbarproben deckend)
      let n = 0, w = 0;
      for (const [ox, oy] of ROT_PROBE) { const u = at(fx + ox, fy + oy); if (u >>> 24) { n++; w ||= u; } }
      if (n >= 2) v = w;
    }
    if (v >>> 24) d[y * W + x] = v;
  }
  return d;
}
// Texelpuffer (gleiche Breite) zeilenversetzt um off Texel in eine FineCanvas legen.
function blitRows(c, s, off) {
  const W = c.W, H = c.H, n = s.length / W;
  withPixels(c, (d) => {
    for (let y = 0; y < n; y++) {
      const ty = y + off;
      if (ty < 0 || ty >= H) continue;
      for (let x = 0, i = y * W, o = ty * W; x < W; x++) if (s[i + x]) d[o + x] = s[i + x];
    }
  });
}

// Rahmen-Bau. spec = { W, H, AX, AY, pad, rim, back, draw(p, g, P, X) -> meta (absolut) }.
// X.rot = [winkel, drehpunktX, drehpunktY] kippt die Figur (Sturz) und setzt sie wieder auf den Boden.
// X.sink = 0..1 lässt die Figur im Morast versinken (alles unter der Bodenlinie wird abgeschnitten).
// Figur und Leuchtebene entstehen auf FineCanvas (res = fineRes()); Drehen und Versinken rechnen in Texeln,
// Anker, Rahmengrößen und Metadaten bleiben in Weltpixeln.
function makeFrame(spec, P, X = {}) {
  const { W, H, AX, AY } = spec, pad = spec.pad ?? 8;
  const W2 = W + pad * 2, H2 = H + pad * 2;
  const res = fineRes(), g = new FineCanvas(W2, H2, res);
  let meta = {};
  const f = buildFrame(W2, H2, AX + pad, AY + pad, (p) => {
    if (X.rot && Math.abs(X.rot[0]) > 0.001) {
      const PR = 30, HH = H2 + PR * 2;
      const tp = new FineCanvas(W2, HH, res), tg = new FineCanvas(W2, HH, res);
      tp.translate(pad, pad + PR); tg.translate(pad, pad + PR);
      meta = spec.draw(tp, tg, P, X) || {};
      OCC = null;
      tp.resetTranslate(); tg.resetTranslate();
      const [a, rx, ry] = X.rot;
      const rp = rotPix(tp, rx + pad, ry + pad + PR, a), rg = rotPix(tg, rx + pad, ry + pad + PR, a);
      const WT = W2 * res;
      let bottom = -1;
      for (let y = HH * res - 1; y >= 0 && bottom < 0; y--) for (let x = 0; x < WT; x++) if ((rp[y * WT + x] >>> 24) > 40) { bottom = y; break; }
      const sT = bottom >= 0 ? (AY + pad + PR) * res - 1 - bottom : 0, shift = sT / res;
      blitRows(p, rp, sT - PR * res); blitRows(g, rg, sT - PR * res);
      const c = Math.cos(a), s = Math.sin(a);
      for (const k in meta) {
        const m = meta[k], dx = m.x - rx, dy = m.y - ry;
        meta[k] = { x: rx + dx * c - dy * s, y: ry + dx * s + dy * c + shift };
      }
    } else {
      p.translate(pad, pad); g.translate(pad, pad);
      meta = spec.draw(p, g, P, X) || {};
      OCC = null;
      p.resetTranslate(); g.resetTranslate();
    }
    if (X.sink) {
      // Figur um sink·H nach unten schieben (fein in halben Weltpixeln) und unter der Bodenlinie abschneiden
      const dT = Math.round(X.sink * (spec.sinkH ?? H) * res), cut = (AY + pad) * res;
      for (const c of [p, g]) {
        const WT = c.W;
        withPixels(c, (d) => {
          for (let y = c.H - 1; y >= 0; y--) {
            const o = y * WT, sy = y - dT;
            if (y >= cut || sy < 0) { d.fill(0, o, o + WT); continue; }
            d.copyWithin(o, sy * WT, sy * WT + WT);
          }
        });
      }
      for (const k in meta) meta[k] = { x: meta[k].x, y: Math.min(AY - 1, meta[k].y + dT / res) };
    }
    if (X.post) {
      p.translate(pad, pad); g.translate(pad, pad);
      Object.assign(meta, X.post(p, g) || {});
      OCC = null;
      p.resetTranslate(); g.resetTranslate();
    }
    rimLight(p, spec.rim ?? '#b8d8b0', spec.back ?? '#7a9ab8', spec.rimK ?? 0.42, spec.backK ?? 0.3);
  }, { fine: true, res });
  f.glow = new SpriteFrame(g._canvas ? g.canvas : pixelsToCanvas(g.buf, g.W, g.H), (AX + pad) * res, (AY + pad) * res, res);
  f.meta = {};
  for (const k in meta) f.meta[k] = { dx: Math.round(meta[k].x - AX), dy: Math.round(meta[k].y - AY) };
  f.fx = X.fx ?? null;
  return f;
}

// n Frames aus einer Keyframe-Spur. loop: letzter Frame ≠ erster.
function track(spec, keys, n, { loop = false, extras = {}, all = {} } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = loop ? i / n : n === 1 ? 1 : i / (n - 1);
    out.push(makeFrame(spec, sample(keys, t), { ...all, ...(extras[i] ?? {}) }));
  }
  return out;
}

// ================================================================ Farben

// Toxisches Grün (Farbebene dunkel -> hell) und passende Leucht-Rampe
const TOX = ['#16280a', '#2e5010', '#548a18', '#8cc226', '#c8ec52', '#f2ffb4'];
const GT = ['#14300a', '#2e6a12', '#62b020', '#b0ec48', '#f0ffc0'];
// Sumpflicht (Irrlicht): kaltes Türkis-Grün
const WISP = ['#0e3a34', '#1e7a66', '#46c8a0', '#a0f8d0', '#f0fff4'];
const MUD = ['#0c0a07', '#17140e', '#241f15', '#332c1e', '#443b28', '#574c33', '#6e6242'];
const MOSS = ['#0d140b', '#172312', '#223419', '#2f4520', '#3f5a28', '#537032', '#6c8a40'];
const ROOT = ['#0f0b08', '#1b140e', '#2a2016', '#3b2e1f', '#4e3e29', '#665236'];
const BONE = ['#2c281e', '#4e4836', '#78705a', '#a49a7e', '#cac0a0', '#ece4c8'];
const SLIME = ['#1a2410', '#34461c', '#5a7228'];
const MUDDRIP = ['#1a160e', '#2e2818', '#4a4028'];
const BLACK = '#070605';

// ================================================================ Moorlauerer

// Geduckter Sumpfjäger: breiter Froschschädel mit leuchtendem Köder an einem
// Stirnstiel, lange Klauenarme, Moosbuckel mit Schilf und Schlammtropfen.
const LU = { W: 64, H: 48, AX: 28, AY: 42, pad: 8, rim: '#bcd8a8', back: '#7894a8', sinkH: 30, draw: drawLurker };
const L_SKIN = ['#0a0e0a', '#141d15', '#202e1f', '#2e4128', '#415932', '#587340', '#7a9252'];
const L_GLOSS = '#b4cc8a';
const L_BELLY = ['#26261a', '#3e3c28', '#5a5638', '#7a744c', '#9a9262'];
const L_REST = {
  hipX: -3, hipY: 0, ang: 0.62, air: 0, head: 0, headA: 0, jaw: 0,
  fFx: 4, fFy: 0, fBx: -2, fBy: 0, aFx: 9, aFy: 12, aBx: 6, aBy: 12,
  lure: 0, lureA: -0.4, weed: 0, dr: 0, eye: 1, glow: 1, claw: 0, stretch: 0, hump: 0,
};
const lpose = (o = {}) => ({ ...L_REST, ...o });

function drawLurker(p, g, P, X) {
  const AX = LU.AX - 3, AY = LU.AY;
  const meta = {};
  const gy = AY - P.air;
  const hip = { x: AX + P.hipX, y: gy - 10 + P.hipY };
  const sp = 9 + P.stretch * 3;
  const chest = { x: hip.x + Math.cos(P.ang) * sp, y: hip.y - Math.sin(P.ang) * sp };
  const legLen = [6.5, 6.5];
  const fF = { x: AX + P.fFx, y: AY - 1 - P.fFy - P.air * 0.6 }, fB = { x: AX + P.fBx, y: AY - 1 - P.fBy - P.air * 0.6 };
  const legF = ik(hip.x + 1, hip.y + 1, fF.x, fF.y, legLen[0], legLen[1], -1);
  const legB = ik(hip.x - 1, hip.y + 1, fB.x, fB.y, legLen[0], legLen[1], -1);
  const shF = { x: chest.x + 0.5, y: chest.y + 1 }, shB = { x: chest.x - 1.5, y: chest.y + 0.5 };
  // Hände relativ zur Brust, nie unter dem Boden
  const hF = { x: chest.x + P.aFx, y: Math.min(AY - 1, chest.y + P.aFy) }, hB = { x: chest.x + P.aBx, y: Math.min(AY - 1, chest.y + P.aBy) };
  const armF = ik(shF.x, shF.y, hF.x, hF.y, 6.5, 7, 1);
  const armB = ik(shB.x, shB.y, hB.x, hB.y, 6.5, 7, 1);
  const S = L_SKIN;
  const far = [S[0], S[1], S[2], S[3]];
  const near = [S[1], S[2], S[3], S[4], S[5]];

  const claws = (x, y, a, n, open, cols) => {
    for (let k = -1; k <= 1; k++) {
      const aa = a + k * (0.35 + open * 0.3);
      const x1 = x + Math.cos(aa) * 3, y1 = y + Math.sin(aa) * 3;
      if (p.fine) { // fein: gebogene Keilkralle, helle Spitze
        const bx = x1 + Math.cos(aa + 0.5) * 0.8, by = y1 + Math.sin(aa + 0.5) * 0.8;
        spike(p, x, y, x1, y1, cols[0], cols[1], cols[1]); spike(p, x1, y1, bx, by, cols[0], cols[1], cols[2] ?? cols[1]);
        continue;
      }
      p.line(x, y, x1, y1, cols[0]);
      p.px(x1 + Math.cos(aa) * 0.8, y1 + Math.sin(aa) * 0.8, cols[1]);
    }
  };

  // --- hinterer Arm und hinteres Bein (dunkel)
  cap(p, shB.x, shB.y, armB.jx, armB.jy, 2.2, 1.8, far);
  cap(p, armB.jx, armB.jy, armB.ex, armB.ey, 1.8, 1.5, far);
  claws(armB.ex, armB.ey, Math.atan2(armB.ey - armB.jy, armB.ex - armB.jx) * 0.3, 3, P.claw, [BONE[1], BONE[2]]);
  cap(p, hip.x - 1, hip.y + 1, legB.jx, legB.jy, 3.2, 2.2, far);
  cap(p, legB.jx, legB.jy, legB.ex, legB.ey, 2, 1.4, far);
  p.rect(legB.ex - 2, legB.ey, 5, 1, S[1]);

  // --- Rumpf: Hinterteil + gebuckelter Brustkorb
  ell(p, hip.x, hip.y, 5.2, 4.6, near, { noise: 0.1, seed: 3 });
  cap(p, hip.x, hip.y, chest.x, chest.y, 5, 6.2, near, { noise: 0.12, seed: 5 });
  // heller, gerippter Bauch
  const bx = (hip.x + chest.x) / 2 + 1.5, by = (hip.y + chest.y) / 2 + 3.5;
  ell(p, bx, by, 4.5, 2.2, L_BELLY, { rot: -P.ang * 0.7, bias: 0.1 });
  if (p.fine) { // Bauchfalten: dunkle Furche, darüber eine helle Kante
    for (let i = -3; i <= 3; i += 1.5) {
      const x = bx + i, y = by - 1 - i * 0.3;
      p.fline(x, y, x - 0.5, y + 2, L_BELLY[1]); p.fline(x - 0.5, y, x - 1, y + 1.5, L_BELLY[4]);
    }
  } else for (let i = -2; i <= 2; i += 2) p.px(bx + i, by + 0.5 - i * 0.3, L_BELLY[1]);
  // Hautwarzen / Flecken (fein: Warzen mit hellem Kern, Flecken als dunkle Tupfer)
  for (let i = 0; i < 12; i++) {
    const u = hash2(i, 1, 71), v = hash2(i, 2, 71);
    const x = hip.x + (chest.x - hip.x) * u + (v - 0.6) * 5, y = hip.y + (chest.y - hip.y) * u - 2 + (v - 0.5) * 4;
    if (p.fine) {
      if (hash2(i, 3, 71) < 0.5) { p.dot(x, y, S[1]); p.dot(x + 0.5, y, S[1]); p.dot(x, y + 0.5, S[2]); }
      else wart(p, x, y, S[2], S[4], S[5]);
      continue;
    }
    p.px(x, y, hash2(i, 3, 71) < 0.5 ? S[1] : S[5]);
  }
  if (p.fine) { // nasse Haut: Glanzpunkte oben links auf Hüfte und Brustkorb
    shine(p, hip.x - 2.5, hip.y - 2, S[5], S[6], 3);
    const c = { x: hip.x + (chest.x - hip.x) * 0.8, y: hip.y + (chest.y - hip.y) * 0.8 };
    shine(p, c.x - 1, c.y - 3.5, S[5], L_GLOSS, 2);
  }
  // Moosbuckel auf dem Rücken, Schilf und Tang hängen herab
  const hump = { x: hip.x + (chest.x - hip.x) * 0.45 - 1.5, y: hip.y + (chest.y - hip.y) * 0.45 - 4 - P.hump };
  ell(p, hump.x, hump.y, 5.5, 3, MOSS, { noise: 0.35, seed: 9, rot: -P.ang * 0.5 });
  ell(p, hump.x + 3.5, hump.y - 1.5, 3, 2, MOSS, { noise: 0.3, seed: 10 });
  if (p.fine) mossTufts(p, hump.x, hump.y, 5.5, 3, P.weed, 9);
  for (let i = 0; i < 4; i++) { // Schilfhalme, die aus dem Buckel wachsen
    const x0 = hump.x - 3 + i * 2, y0 = hump.y - 1.5;
    const len = 4 + (i % 2) * 3;
    if (p.fine) { // Halm 2 Feinpixel: Lichtseite links, Schattenseite rechts; Samenkolben mit Glanz
      for (let j = 0; j < len - 1; j += 0.5) {
        const x = x0 - j * 0.35 - Math.sin(P.weed + i) * j * 0.08;
        p.dot(x, y0 - j, MOSS[5]); p.dot(x + 0.5, y0 - j, MOSS[3]);
      }
      const tx = x0 - (len - 1) * 0.35 - Math.sin(P.weed + i) * (len - 1) * 0.08, ty = y0 - len + 1;
      p.rect(p.snap(tx), p.snap(ty - 0.5), 1, 1.5, '#6a6a38'); p.dot(tx, ty - 0.5, '#b0a85e'); p.dot(tx, ty, '#8a8a4a');
      p.dot(tx + 0.25, ty - 1, '#8a8a4a');
      continue;
    }
    for (let j = 0; j < len; j++) p.px(x0 - j * 0.35 - Math.sin(P.weed + i) * j * 0.08, y0 - j, j === len - 1 ? '#8a8a4a' : MOSS[4 + (j & 1)]);
  }
  for (let i = 0; i < 5; i++) { // Tangfäden (fein: dünne Strähne, nasser Tropfen am Ende)
    const x0 = hump.x - 4.5 + i * 1.8, y0 = hump.y + 2;
    const len = 3 + (hash2(i, 4, 72) * 4 | 0);
    if (p.fine) {
      for (let j = 0; j < len; j += 0.5) {
        const x = x0 + Math.sin(P.weed + i + j * 0.7) * 0.6 - P.stretch * j * 0.4;
        p.dot(x, y0 + j, j < 1 ? MOSS[4] : (j | 0) % 3 === 2 ? MOSS[1] : MOSS[3]);
        if (j < len * 0.6) p.dot(x - 0.5, y0 + j, MOSS[2]);
      }
      const ex = x0 + Math.sin(P.weed + i + len * 0.7) * 0.6 - P.stretch * len * 0.4;
      p.dot(ex, y0 + len, MUDDRIP[2]);
      continue;
    }
    for (let j = 0; j < len; j++) p.px(x0 + Math.sin(P.weed + i + j * 0.7) * 0.6 - P.stretch * j * 0.4, y0 + j, j % 3 === 2 ? MOSS[1] : MOSS[3]);
  }
  // Knochiger Rückenkamm: helle Stacheln durch das Moos (klare Silhouette)
  for (let i = 0; i < 5; i++) {
    const u = 0.1 + i * 0.2;
    const bx0 = hip.x + (chest.x - hip.x) * u - 2, by0 = hip.y + (chest.y - hip.y) * u - 4.5 - (i === 2 ? 1 + P.hump : 0);
    const h = 2 + (i === 1 || i === 2 ? 1.5 : 0) + P.hump * 0.5;
    const tx = bx0 - 1.2 - P.stretch, ty = by0 - h;
    if (p.fine) { // Knochenstachel: Keil mit Lichtkante, Riss und Kerbe an der Wurzel
      spike(p, bx0 + 0.5, by0, tx, ty, BONE[2], BONE[4], BONE[5]);
      p.dot(bx0 + (tx - bx0) * 0.45 + 0.5, by0 + (ty - by0) * 0.45, BONE[0]);
      p.dot(bx0 + 1, by0, BONE[1]); p.dot(bx0 + 1, by0 - 0.5, BONE[1]);
      continue;
    }
    p.line(bx0, by0, tx, ty, BONE[2]); p.px(tx, ty, BONE[5]); p.px(bx0 + 1, by0, BONE[1]);
  }
  // Dunkle Rückenflecken
  for (let i = 0; i < 4; i++) {
    const u = 0.15 + i * 0.25;
    ell(p, hip.x + (chest.x - hip.x) * u + 0.5, hip.y + (chest.y - hip.y) * u - 1 + (i & 1), 1.3, 0.9, [S[1], S[2]]);
  }
  // Schlammtropfen unter dem Bauch
  drip(p, g, bx - 2, by + 2, 3, P.dr, MUDDRIP);
  drip(p, g, bx + 2, by + 2, 2, P.dr + 0.4, MUDDRIP);

  // --- vorderes Bein (Froschschenkel)
  cap(p, hip.x + 1, hip.y + 1, legF.jx, legF.jy, 3.6, 2.6, near, { seed: 12 });
  cap(p, legF.jx, legF.jy, legF.ex, legF.ey, 2.3, 1.6, near);
  p.rect(legF.ex - 2, legF.ey, 5, 1, S[3]); p.px(legF.ex + 3, legF.ey, S[4]); p.px(legF.ex + 2, legF.ey - 1, S[3]);
  if (p.fine) { // Schwimmhäute: Zehen mit hellen Kuppen, dunkle Haut dazwischen; Glanz auf dem Schenkel
    for (const k of [-1.5, 0.5, 2.5]) { p.dot(legF.ex + k, legF.ey, S[5]); p.dot(legF.ex + k + 0.5, legF.ey + 0.5, S[2]); }
    p.dot(legF.ex + 3.5, legF.ey, S[5]);
    shine(p, (hip.x + legF.jx) / 2 - 0.5, (hip.y + legF.jy) / 2 - 1, S[5], L_GLOSS, 2);
  }

  // --- Kopf: breiter, flacher Froschschädel vor dem Buckel
  const ha = P.headA;
  const hx = chest.x + 5 + P.stretch * 2, hy = chest.y + 1 + P.head;
  const ca = Math.cos(ha), sa = Math.sin(ha);
  const H = (u, v) => ({ x: hx + u * ca - v * sa, y: hy + u * sa + v * ca });
  const jw = P.jaw;
  // Unterkiefer (klappt nach unten)
  const j0 = H(-2.5, 1.8), j1 = H(5, 1.8 + jw * 3.8);
  cap(p, j0.x, j0.y, j1.x, j1.y, 2.6, 1.6, [L_BELLY[0], L_BELLY[1], L_BELLY[2], L_BELLY[3], L_BELLY[4]]);
  if (jw > 0.2) { // Maulinneres und Zähne
    const m0 = H(0, 1), m1 = H(5, 1 + jw * 1.8);
    p.line(m0.x, m0.y, m1.x, m1.y, '#3a0e10');
    const m2 = H(0.5, 1.8 + jw), m3 = H(4, 1.5 + jw * 2.5);
    p.line(m2.x, m2.y, m3.x, m3.y, '#240608');
    if (p.fine) { // Nadelzähne oben und unten, Speichelfaden zwischen den Kiefern
      for (let u = 0.8; u <= 5; u += 0.9) {
        const t = H(u, 0.8 + jw * 0.3); spike(p, t.x, t.y + 0.5, t.x + 0.2, t.y + 1.5, BONE[3], BONE[5], BONE[4]);
        const b = H(u + 0.4, 1 + jw * 3.2); spike(p, b.x, b.y, b.x - 0.2, b.y - 1, BONE[2], BONE[4], BONE[3]);
      }
      const s0 = H(2.6, 1.2 + jw * 0.3), s1 = H(3, 1 + jw * 2.8);
      p.fline(s0.x, s0.y + 1, s1.x, s1.y - 0.5, SLIME[2]); p.dot(s0.x, s0.y + 1.5, '#9ab070');
    } else for (let u = 1; u <= 4.5; u += 1.5) { const t = H(u, 0.8 + jw * 0.3); p.px(t.x, t.y + 1, BONE[4]); const b = H(u + 0.5, 1 + jw * 3.2); p.px(b.x, b.y - 1, BONE[3]); }
  }
  // Schädeldach
  const s0 = H(-2.5, -0.8), s1 = H(4.5, 0);
  cap(p, s0.x, s0.y, s1.x, s1.y, 3.8, 2.7, near, { seed: 14 });
  const lip = H(6.5, 0.6);
  p.px(lip.x, lip.y, S[5]); p.px(lip.x - 1, lip.y - 0.8, S[6]);
  // Nasenlöcher, Maulspalte mit heller Lippe
  const nos = H(5.2, -1); p.px(nos.x, nos.y, S[1]);
  if (p.fine) { const n2 = H(5.6, -1.6); p.dot(n2.x, n2.y, S[6]); p.dot(nos.x + 0.5, nos.y + 0.5, S[0]); }
  if (jw <= 0.2) {
    const m0 = H(-1.5, 1.5), m1 = H(6.5, 1.1); p.line(m0.x, m0.y, m1.x, m1.y, S[0]);
    const l0 = H(-0.5, 0.6), l1 = H(5.5, 0.3); p.line(l0.x, l0.y, l1.x, l1.y, S[5]);
    // Überbiss: Hauer des Oberkiefers ragen über die Lippe
    if (p.fine) { // Hauer als Keile mit Lichtkante, Mundwinkel als dunkle Kerbe
      for (const u of [1.5, 4]) { const t = H(u, 1.8); spike(p, t.x, t.y, t.x + 0.3, t.y + 2, BONE[2], BONE[5], BONE[4]); }
      const t3 = H(2.8, 1.9); spike(p, t3.x, t3.y, t3.x + 0.2, t3.y + 1, BONE[2], BONE[4], BONE[3]);
      const mw = H(-1.8, 1.2); p.dot(mw.x, mw.y, S[0]); p.dot(mw.x - 0.5, mw.y - 0.5, S[0]);
    } else for (const u of [1.5, 4]) { const t = H(u, 2.3); p.px(t.x, t.y, BONE[4]); p.px(t.x, t.y + 1, BONE[2]); }
  }
  // Augenwulst: dunkle Falte vor und unter dem Glotzauge
  const br = H(3.6, -2.4), br2 = H(0.2, -1.6);
  p.px(br.x, br.y, S[1]); p.px(br2.x, br2.y, S[2]);
  // Glotzaugen oben auf dem Schädel
  const eyeOn = P.eye > 0.3;
  const eye = H(1.5, -3.2), eye2 = H(-1.5, -3.4);
  ell(p, eye2.x, eye2.y, 1.7, 1.5, [S[1], S[2], S[3]]);
  ell(p, eye.x, eye.y, 2.3, 2.1, [S[3], S[4], S[5], S[6]]);
  const Y = ['#3a3004', '#8a7a0a', '#e0d030', '#fffaa0'];
  if (eyeOn && p.fine) {
    // Iris rund mit dunklem Ring, senkrechte Schlitzpupille (1 Feinpixel), Glanzpunkt oben links, Lid darüber
    p.ellipse(eye.x + 0.25, eye.y + 0.25, 1.6, 1.6, Y[0]);
    p.ellipse(eye.x + 0.25, eye.y + 0.25, 1.25, 1.25, Y[1]);
    p.ellipse(eye.x, eye.y, 0.8, 0.8, Y[2]);
    p.fline(eye.x + 0.25, eye.y - 1, eye.x + 0.25, eye.y + 1.25, '#101008'); p.dot(eye.x + 0.75, eye.y, '#2a2404');
    p.dot(eye.x - 0.5, eye.y - 0.5, '#ffffff'); p.dot(eye.x - 0.75, eye.y - 0.25, Y[3]); p.dot(eye.x + 1, eye.y + 0.75, Y[3]);
    p.fline(eye.x - 1.75, eye.y - 1.5, eye.x + 1.75, eye.y - 1.75, S[2]); p.fline(eye.x - 1.5, eye.y - 2, eye.x + 1.25, eye.y - 2.25, S[6]);
    p.dot(eye2.x + 0.3, eye2.y, Y[1]); p.dot(eye2.x + 0.8, eye2.y, Y[0]); p.dot(eye2.x, eye2.y - 0.5, Y[2]);
    g.ellipse(eye.x + 0.25, eye.y + 0.25, 1.25, 1.25, '#6a5e08'); g.ellipse(eye.x, eye.y, 0.8, 0.8, '#a09010'); g.dot(eye.x - 0.5, eye.y - 0.5, '#f8f0a0');
    g.dot(eye2.x + 0.3, eye2.y, '#5a5008');
  } else if (eyeOn) {
    // Iris mit dunklem Ring, senkrechte Schlitzpupille, Glanzpunkt oben links
    p.rect(eye.x - 1, eye.y - 1, 3, 3, Y[1]);
    p.rect(eye.x - 0.5, eye.y - 0.5, 2, 2, Y[2]); p.px(eye.x - 1, eye.y - 1, Y[3]);
    p.px(eye.x + 0.5, eye.y - 0.5, '#101008'); p.px(eye.x + 0.5, eye.y + 0.5, '#101008');
    p.px(eye2.x + 0.3, eye2.y, Y[1]);
    g.rect(eye.x - 0.5, eye.y - 0.5, 2, 2, '#a09010'); g.px(eye.x + 0.5, eye.y - 0.5, '#f8f0a0'); g.px(eye2.x + 0.3, eye2.y, '#5a5008');
  } else { p.line(eye.x - 1, eye.y, eye.x + 1, eye.y, S[1]); if (p.fine) p.fline(eye.x - 1.5, eye.y - 0.5, eye.x + 1.5, eye.y - 0.5, S[6]); }
  if (p.fine) shine(p, H(4, -1.8).x, H(4, -1.8).y, S[5], L_GLOSS, 2);   // nasser Glanz auf der Schnauze
  meta.eye = { x: eye.x + 0.5, y: eye.y };
  meta.mouth = H(5, 1.5 + jw * 1.5);
  meta.head = H(0, -5);

  // --- Köder: Stiel aus der Stirn, leuchtende Blase baumelt vor dem Maul
  const st = H(2.5, -2.5);
  const la = P.lureA - ha * 0.3;
  const lpts = root(st.x, st.y, -1.2 + la * 0.3, 0.42 + P.lure * 0.12, 5, 1.6, 0.05, P.weed);
  for (let i = 0; i < lpts.length - 1; i++) {
    if (p.fine) { // Stiel: 2 Feinpixel, Lichtseite oben, verjüngt sich zur Blase
      p.fline(lpts[i][0], lpts[i][1], lpts[i + 1][0], lpts[i + 1][1], i < 2 ? S[3] : S[2]);
      p.fline(lpts[i][0], lpts[i][1] - 0.5, lpts[i + 1][0], lpts[i + 1][1] - 0.5, i < 3 ? S[5] : S[4]);
      continue;
    }
    p.line(lpts[i][0], lpts[i][1], lpts[i + 1][0], lpts[i + 1][1], i < 2 ? S[4] : S[3]);
  }
  const lb = lpts[lpts.length - 1];
  const lr = 1 + P.lure * 0.5;
  const lx = lb[0] + 0.5, ly = lb[1] + 1.5;
  ell(p, lx, ly, lr, lr + 0.2, [WISP[1], WISP[2], WISP[3], WISP[4]], { bias: 0.15 });
  if (P.glow > 0.05) glowDot(g, lx, ly, lr * P.glow + 0.8, WISP);
  if (p.fine) { // heißer Kern und Glanz in der Blase
    p.rect(p.snap(lx - 0.25), p.snap(ly - 0.25), 0.5 + (lr > 1.3 ? 0.5 : 0), 1, WISP[4]); p.dot(lx - lr * 0.6, ly - lr * 0.6, '#ffffff');
    p.dot(lx + lr * 0.5, ly + lr * 0.6, WISP[1]);
  }
  meta.lure = { x: lx, y: ly };

  // --- vorderer Arm mit Klauen
  cap(p, shF.x, shF.y, armF.jx, armF.jy, 2.6, 2.1, near, { seed: 15 });
  cap(p, armF.jx, armF.jy, armF.ex, armF.ey, 2.1, 1.7, near);
  ell(p, armF.ex, armF.ey, 1.6, 1.4, near);
  if (p.fine) {
    shine(p, (shF.x + armF.jx) / 2 - 1, (shF.y + armF.jy) / 2 - 1, S[5], L_GLOSS, 2);
    wart(p, (armF.jx + armF.ex) / 2 - 0.5, (armF.jy + armF.ey) / 2 - 1, S[2], S[4], S[5]);
  }
  const ca2 = Math.atan2(armF.ey - armF.jy, armF.ex - armF.jx);
  claws(armF.ex + Math.cos(ca2), armF.ey + Math.sin(ca2), P.claw > 0.3 ? ca2 : ca2 * 0.25, 3, P.claw, [BONE[3], BONE[5], '#fffae8']);
  drip(p, g, armF.jx, armF.jy + 2, 2, P.dr + 0.7, MUDDRIP);
  meta.hand = { x: armF.ex + Math.cos(ca2) * 3, y: armF.ey + Math.sin(ca2) * 3 };
  if (X.rake) { // drei Krallenspuren vor der Hand
    const h = meta.hand;
    for (let k = 0; k < 3; k++) {
      const x0 = h.x - 3 + k * 2, y0 = h.y - 7 + k;
      for (let j = 0; j < 7; j++) {
        const x = x0 + j * 0.9, y = y0 + j * 1.3;
        p.px(x, y, j > 1 && j < 6 ? '#e8f4d0' : '#8aa870');
        if (j > 1 && j < 6) g.px(x, y, GT[1]);
      }
    }
  }
  return meta;
}

// Schlammpfütze mit Blasen (Versinken)
function mirePool(p, g, x, y, r, ph, bubbles = true) {
  ell(p, x, y, r, r * 0.3, [MUD[1], MUD[2], MUD[3], MUD[4]], { bias: -0.05 });
  ell(p, x - r * 0.15, y - 0.3, r * 0.6, r * 0.14, [MUD[3], MUD[4], MUD[5]], { bias: 0.1 });
  if (p.fine) { // Kräuselring und nasse Glanzstriche auf dem Schlamm
    for (let a = Math.PI * 1.08; a < Math.PI * 1.92; a += 0.5 / r) p.dot(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.3 * 0.78, MUD[4]);
    p.fline(x - r * 0.45, y - r * 0.12, x - r * 0.2, y - r * 0.12, MUD[6]); p.fline(x + r * 0.15, y + r * 0.05, x + r * 0.3, y + r * 0.05, MUD[5]);
  }
  if (!bubbles) return;
  for (let i = 0; i < 3; i++) {
    const t = (ph + i * 0.37) % 1;
    const bx = x + (hash2(i, 1, 88) - 0.5) * r * 1.3, by = y - t * 2;
    if (p.fine) { // Blase: Ring mit Glanzpunkt oben links, dunkle Mitte; platzend als Spritzer
      const X0 = p.snap(bx), Y0 = p.snap(by);
      if (t < 0.8) {
        p.dot(X0, Y0 - 1, MUD[5]); p.dot(X0 + 0.5, Y0 - 1, MUD[4]); p.dot(X0 - 0.5, Y0 - 0.5, MUD[5]); p.dot(X0 + 1, Y0 - 0.5, MUD[3]);
        p.dot(X0, Y0 - 0.5, MUD[2]); p.dot(X0 + 0.5, Y0 - 0.5, MUD[2]); p.dot(X0, Y0, MUD[4]); p.dot(X0 + 0.5, Y0, MUD[3]); p.dot(X0, Y0 - 1, MUD[6]);
      } else { p.dot(X0 - 1, Y0, MUD[5]); p.dot(X0 - 0.5, Y0 - 0.5, MUD[6]); p.dot(X0 + 1, Y0, MUD[5]); p.dot(X0 + 1.5, Y0 - 0.5, MUD[4]); }
      continue;
    }
    if (t < 0.8) { p.px(bx, by, MUD[6]); p.px(bx, by - 1, MUD[4]); }
    else { p.px(bx - 1, by, MUD[5]); p.px(bx + 1, by, MUD[5]); }
  }
}

function lurkerAnims() {
  const mk = (P, X) => makeFrame(LU, P, X);
  const T = (keys, n, o) => track(LU, keys, n, o);
  const idleA = lpose();
  const idleB = lpose({ hipY: 0.8, ang: 0.58, head: 0.6, headA: 0.05, lureA: -0.1, lure: 0.4, weed: Math.PI, dr: 0.5, aFy: 12.5, glow: 0.8 });
  const idle = [];
  for (let i = 0; i < 6; i++) {
    const k = (1 - Math.cos(i / 6 * TAU)) / 2;
    idle.push(mk({ ...mix(idleA, idleB, k), weed: i / 6 * TAU, dr: i / 6, lureA: -0.4 + Math.sin(i / 6 * TAU) * 0.35, eye: i === 4 ? 0 : 1 }));
  }
  // Gehen: schiebt sich auf allen vieren vor (Hände und Füße im Kreuzgang)
  const walk = [];
  for (let i = 0; i < 8; i++) {
    const ph = i / 8 * TAU, s = Math.sin(ph), c = Math.cos(ph);
    walk.push(mk(lpose({
      hipY: -Math.abs(c) * 0.8, ang: 0.56 + s * 0.04, head: Math.abs(s) * 0.6,
      fFx: 4 + s * 3.5, fFy: Math.max(0, -c) * 2, fBx: -2 - s * 3.5, fBy: Math.max(0, c) * 2,
      aFx: 9 - s * 4, aFy: 12 - Math.max(0, c) * 2.5, aBx: 6 + s * 4, aBy: 12 - Math.max(0, -c) * 2.5,
      weed: ph, dr: i / 8, lureA: -0.3 - s * 0.4,
    }), { fx: i % 4 === 0 ? 'step' : null }));
  }
  // Ausholen: tief in den Schlamm ducken, Maul auf, Köder flackert
  const w1 = lpose({ hipY: 2, ang: 0.45, hipX: -4, head: 1.5, fFx: 5, fBx: -1, aFx: 8, aFy: 12, aBx: 5, jaw: 0.3, lure: 0.8, lureA: 0.3, weed: 1 });
  const w2 = lpose({ hipY: 3, ang: 0.35, hipX: -5, head: 2, headA: -0.1, fFx: 5, fBx: -1, aFx: 7, aFy: 12, aBx: 4, jaw: 0.6, lure: 1.2, lureA: 0.6, hump: 0.8, claw: 0.5, weed: 2, glow: 1.4 });
  const w3 = { ...w2, hipY: 3.5, head: 2.2, hipX: -5.5, jaw: 0.8, weed: 2.5, lureA: 0.8 };
  const windup = T([[0, idleA], [0.4, w1], [0.75, w2], [1, w3]], 5);
  // Sprungangriff: abstoßen, gestreckt durch die Luft, Klauen voran, landen
  const s1 = lpose({ air: 3, hipX: -2, hipY: -1, ang: 0.35, stretch: 0.6, fFx: -3, fFy: 3, fBx: -6, fBy: 2, aFx: 12, aFy: -1, aBx: 11, aBy: 1, jaw: 1, claw: 1, headA: -0.15, lureA: 1, weed: 3, glow: 1.3 });
  const s2 = lpose({ air: 5, hipX: 0, hipY: -1, ang: 0.15, stretch: 1, fFx: -6, fFy: 4, fBx: -9, fBy: 3, aFx: 15, aFy: 4, aBx: 13, aBy: 6, jaw: 1, claw: 1, headA: 0.1, lureA: 1.2, weed: 4, glow: 1.3 });
  const s3 = lpose({ air: 1, hipX: 1, hipY: 1, ang: 0.3, stretch: 0.5, fFx: 1, fFy: 1, fBx: -4, fBy: 0, aFx: 13, aFy: 12, aBx: 11, aBy: 12, jaw: 0.6, claw: 0.6, head: 1.5, lureA: 0.6, weed: 5 });
  const s4 = lpose({ hipX: -1, hipY: 1, ang: 0.5, stretch: 0.1, fFx: 4, fBx: -2, aFx: 10, aBx: 7, jaw: 0.2, head: 1, lureA: 0, weed: 6 });
  const strike = [
    mk(s1),
    mk(s2, { fx: 'impact', smear: null }),
    mk(mix(s2, s3, 0.55), { rake: 1 }),
    mk(s3, { fx: 'step' }),
    mk(s4),
  ];
  const hurtP = lpose({ hipX: -5, hipY: 1, ang: 0.8, head: -2, headA: -0.35, jaw: 0.8, aFx: 5, aFy: 7, aBx: 3, aBy: 8, lureA: -1.2, lure: 0.6, eye: 1, weed: 2 });
  const hurt = [mk(hurtP), mk(mix(hurtP, idleA, 0.5))];
  // Tod: bäumt sich auf, klatscht bäuchlings in den Schlamm und versinkt
  const d1 = { ...hurtP, ang: 0.95, head: -3, jaw: 1 };
  const d2 = lpose({ hipY: 4, ang: 0.15, head: 3, headA: 0.25, jaw: 0.5, fFx: 6, fBx: -5, aFx: 12, aFy: 12, aBx: 10, lureA: 1.4, eye: 0.5, glow: 0.7 });
  const d3 = { ...d2, hipY: 5, eye: 0, glow: 0.4 };
  const pool = (r, ph, lureGlow) => (p, g) => {
    mirePool(p, g, LU.AX + 3, LU.AY - 1, r, ph);
    if (lureGlow > 0) { p.px(LU.AX + 14, LU.AY - 2, WISP[3]); g.px(LU.AX + 14, LU.AY - 2, WISP[2]); if (lureGlow > 0.5) g.px(LU.AX + 14, LU.AY - 3, WISP[1]); }
    return {};
  };
  const death = [
    mk(d1), mk(d2, { fx: 'impact' }),
    mk(d3, { sink: 0.2, post: pool(12, 0, 0) }),
    mk(d3, { sink: 0.45, post: pool(13, 0.3, 0) }),
    mk(d3, { sink: 0.75, post: pool(13, 0.6, 1) }),
    mk(d3, { sink: 1, post: pool(12, 0.9, 0.6) }),
    mk(d3, { sink: 1, post: (p, g) => { mirePool(p, g, LU.AX + 3, LU.AY - 1, 10, 0, false); return {}; } }),
  ];
  return {
    idle: new Animation(idle, 6),
    walk: new Animation(walk, 10),
    windup: new Animation(windup, 9, false),
    strike: new Animation(strike, 14, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 8, false),
  };
}


// ================================================================ Fäulnisschamane

// Gebeugter Moorpriester in Lumpen und Moosmantel, Hirschschädel-Maske mit
// kleinen Geweihstangen, Knochenstab mit einem Wurzelkäfig, in dem eine
// Faulkugel glimmt (= Mündung der Giftbolzen, meta.hand).
const SH = { W: 64, H: 58, AX: 28, AY: 50, pad: 10, rim: '#c8e0b8', back: '#8aa4c0', rimK: 0.3, backK: 0.12, draw: drawShaman };
const SD = { legH: 11, thigh: 5.5, shin: 6, spine: 9, upper: 5, fore: 5, sh: 1.5, hipW: 1 };
const RAG = ['#100c0e', '#1e181a', '#2e2426', '#41342f', '#56463c', '#6e5b4a', '#8c7660'];
const S_SKIN = ['#141812', '#232a20', '#343d2e', '#48533e', '#606c50'];
const S_REST = {
  hipX: 0, hipY: 0, lean: 0.28, head: 0, headY: 0, fFx: 3, fFy: 0, fBx: -3, fBy: 0,
  hFx: 8, hFy: 5, hBx: 1, hBy: 7, staffA: 0.05, robe: 0, robeT: 0, orb: 1, swirl: 0, eye: 1, burst: 0, open: 0,
};
const spose = (o = {}) => ({ ...S_REST, ...o });

function shamanRig(P) {
  const { AX, AY } = SH, D = SD;
  const hip = { x: AX + P.hipX, y: AY - D.legH + P.hipY };
  const sL = Math.sin(P.lean), cL = Math.cos(P.lean);
  const pt = (u, k) => ({ x: hip.x + sL * u + cL * k, y: hip.y - cL * u + sL * k });
  const chest = pt(D.spine, 0);
  const fF = { x: AX + P.fFx, y: AY - 1 - P.fFy }, fB = { x: AX + P.fBx, y: AY - 1 - P.fBy };
  const legF = ik(hip.x + D.hipW, hip.y, fF.x, fF.y, D.thigh, D.shin, -1);
  const legB = ik(hip.x - D.hipW, hip.y, fB.x, fB.y, D.thigh, D.shin, -1);
  const shF = pt(D.spine - 1, D.sh), shB = pt(D.spine - 1, -D.sh);
  const hF = { x: chest.x + P.hFx, y: chest.y + P.hFy }, hB = { x: chest.x + P.hBx, y: chest.y + P.hBy };
  const armF = ik(shF.x, shF.y, hF.x, hF.y, D.upper, D.fore, 1);
  const armB = ik(shB.x, shB.y, hB.x, hB.y, D.upper, D.fore, 1);
  return { hip, chest, pt, legF, legB, shF, shB, armF, armB };
}

function drawStaff(p, g, hx, hy, a, P) {
  const ux = Math.sin(a), uy = -Math.cos(a);           // Stabachse nach oben
  const top = { x: hx + ux * 13, y: hy + uy * 13 }, bot = { x: hx - ux * 12, y: hy - uy * 12 };
  // knorriger Wurzelstab
  cap(p, bot.x, bot.y, top.x, top.y, 1.1, 1.3, [ROOT[1], ROOT[2], ROOT[3], ROOT[5]]);
  const sw = Math.sin(P.robeT) * 0.8;
  if (p.fine) {
    // Maserung: Rillen längs des Stabs, Astknoten mit heller Oberkante
    for (const [k0, k1, o] of [[-11, -7, 0.25], [-4, 1, -0.25], [2.5, 6, 0.25], [9.5, 12, -0.25]]) p.fline(hx + ux * k0 + o, hy + uy * k0, hx + ux * k1 + o, hy + uy * k1, ROOT[1]);
    for (const k of [-6, 4, 9]) { const x = hx + ux * k + 1, y = hy + uy * k; p.dot(x, y, ROOT[1]); p.dot(x + 0.5, y, ROOT[2]); p.dot(x, y - 0.5, ROOT[5]); }
    // Lederriemen: drei schräge Wicklungen, Naht als Punktlinie
    for (let w = 0; w < 3; w++) {
      const k = 6.3 + w * 0.7, x = hx + ux * k, y = hy + uy * k;
      p.fline(x - 1, y + 0.5, x + 1, y - 0.25, w === 1 ? RAG[4] : RAG[5]); p.dot(x - 1, y + 1, RAG[2]);
    }
    p.dot(hx + ux * 7 + 0.5, hy + uy * 7 + 0.5, RAG[1]);
    // baumelnde Knochen an Schnüren: Gelenkknubbel hell, Schaft mit Riss
    for (const [k, len] of [[8, 4], [9.5, 3]]) {
      const bx = hx + ux * k + 1.5, by = hy + uy * k, ex = bx + sw * 0.5, ey = by + len - 0.5;
      p.fline(bx, by, ex, ey, RAG[3]);
      p.dot(ex - 0.5, ey + 0.5, BONE[5]); p.dot(ex, ey + 0.5, BONE[4]);
      p.dot(ex, ey + 1, BONE[3]); p.dot(ex, ey + 1.5, BONE[1]); p.dot(ex, ey + 2, BONE[3]);
      p.dot(ex - 0.5, ey + 2.5, BONE[4]); p.dot(ex, ey + 2.5, BONE[2]);
    }
  } else {
    for (const k of [-6, 4, 9]) p.px(hx + ux * k + 1, hy + uy * k, ROOT[1]);
    // Knoten mit Riemen, baumelnde Knochen
    p.px(hx + ux * 7, hy + uy * 7, RAG[5]); p.px(hx + ux * 7.5 + 0.5, hy + uy * 7.5, RAG[4]);
    for (const [k, len] of [[8, 4], [9.5, 3]]) {
      const bx = hx + ux * k + 1.5, by = hy + uy * k;
      p.line(bx, by, bx + sw * 0.5, by + len - 1, RAG[3]);
      p.px(bx + sw * 0.5, by + len, BONE[4]); p.px(bx + sw * 0.5, by + len + 1, BONE[2]);
    }
  }
  // Wurzelkäfig um die Faulkugel
  const ox = top.x + ux * 2.5, oy = top.y + uy * 2.5;
  const r = 2 + P.orb * 0.5 + P.swirl * 0.8;
  ell(p, ox, oy, r, r, [TOX[1], TOX[2], TOX[3], TOX[4], TOX[5]], { bias: 0.1 });
  if (P.orb > 0.05) glowDot(g, ox, oy, r * (0.7 + P.orb * 0.5) + 0.5, GT);
  if (p.fine) { // heißer Kern, Glanzpunkt oben links, Faulschliere in der Kugel
    p.ellipse(ox + 0.25, oy + 0.25, r * 0.45, r * 0.45, TOX[5]);
    p.dot(ox - r * 0.55, oy - r * 0.55, '#ffffff'); p.dot(ox - r * 0.55 + 0.5, oy - r * 0.55, TOX[5]);
    p.fline(ox - r * 0.5, oy + r * 0.3, ox + r * 0.2, oy + r * 0.55, TOX[2]);
    if (P.orb > 0.05) g.ellipse(ox + 0.25, oy + 0.25, r * 0.35, r * 0.35, GT[4]);
  }
  for (let i = 0; i < 4; i++) { // Käfigstreben
    const aa = -Math.PI / 2 + (i - 1.5) * 0.9;
    const pts = root(top.x + Math.cos(aa) * 0.8, top.y, aa + a, (i < 2 ? -0.35 : 0.35), 4, 1.5);
    for (let j = 0; j < pts.length - 1; j++) {
      if (p.fine) { // Strebe 2 Feinpixel, Lichtseite links/oben, zur Spitze 1 Feinpixel
        p.fline(pts[j][0], pts[j][1], pts[j + 1][0], pts[j + 1][1], j < 2 ? ROOT[3] : ROOT[2]);
        if (j < 3) p.fline(pts[j][0] - 0.5, pts[j][1], pts[j + 1][0] - 0.5, pts[j + 1][1], j < 2 ? ROOT[5] : ROOT[4]);
        continue;
      }
      p.line(pts[j][0], pts[j][1], pts[j + 1][0], pts[j + 1][1], j < 2 ? ROOT[4] : ROOT[3]);
    }
  }
  // kleiner Vogelschädel auf der Spitze
  const sk = { x: ox + ux * (r + 1.5), y: oy + uy * (r + 1.5) };
  if (p.fine) { // Hirnschale mit Licht oben links, Augenloch, spitzer Schnabel
    const X0 = p.snap(sk.x), Y0 = p.snap(sk.y);
    p.rect(X0 - 0.5, Y0 - 0.5, 1.5, 1, BONE[4]); p.rect(X0 - 0.5, Y0 + 0.5, 1.5, 0.5, BONE[2]); p.dot(X0 - 0.5, Y0 - 0.5, BONE[5]);
    p.dot(X0 + 0.5, Y0, '#0a0806'); p.dot(X0 + 1, Y0, BONE[3]); p.dot(X0 + 1.5, Y0, BONE[3]); p.dot(X0 + 2, Y0 + 0.5, BONE[2]); p.dot(X0 + 1.5, Y0 + 0.5, BONE[1]);
  } else {
    p.px(sk.x, sk.y, BONE[4]); p.px(sk.x + 1, sk.y, BONE[3]); p.px(sk.x + 2, sk.y + 0.5, BONE[2]); p.px(sk.x + 0.5, sk.y, '#0a0806');
  }
  // wirbelnde Sporen beim Wirken
  if (P.swirl > 0.05) {
    for (let i = 0; i < 9; i++) {
      const ang = i / 9 * TAU + P.robeT * 1.7;
      const rr = r + 2 + (1 - P.swirl) * 6 + (i % 3);
      const x = ox + Math.cos(ang) * rr, y = oy + Math.sin(ang) * rr * 0.8;
      if (p.fine) { // Spore: heller Kern, Schweif gegen die Drehrichtung
        const tx = x + Math.sin(ang) * 0.5, ty = y - Math.cos(ang) * 0.4;
        p.dot(x, y, TOX[5]); p.dot(tx, ty, i % 2 ? TOX[4] : TOX[3]); p.dot(x + 0.5, y, TOX[3]);
        g.dot(x, y, GT[4]); g.dot(tx, ty, GT[2]); g.dot(x + 0.5, y, GT[2]);
        continue;
      }
      p.px(x, y, i % 2 ? TOX[4] : TOX[3]); g.px(x, y, GT[i % 2 ? 3 : 2]);
    }
  }
  return { orb: { x: ox, y: oy }, bot };
}

function drawShaman(p, g, P, X) {
  const R = shamanRig(P);
  const { hip, chest, pt, legF, legB, shF, shB, armF, armB } = R;
  const { AY } = SH;
  const meta = {};
  const near = [RAG[2], RAG[3], RAG[4], RAG[5], RAG[6]];

  // --- zerfetzte Mantelstreifen hinten
  const top = pt(SD.spine, -2);
  for (let i = 0; i < 6; i++) {
    const len = 12 + (hash2(i, 3, 91) * 5 | 0) - i * 0.3;
    if (p.fine) { // Stoffstreifen: Lichtkante links, Schattenseite rechts, Querfalten, ausgefranstes Ende
      const base = i === 0 ? 3 : 1 + (i & 1);
      let ex = 0, ey = 0;
      for (let j = 0; j < len; j += 0.5) {
        const v = j / len, J = j | 0;
        const x = top.x - 1 - i * 0.8 - P.robe * 5 * v * v + Math.sin(P.robeT + v * 3 + i) * 0.8 * v, y = top.y + j + i * 0.3;
        const mossy = i !== 0 && (i + J) % 4 === 0;
        const fold = (J + i) % 3 === 1 && j === J;
        p.dot(x, y, mossy ? MOSS[2] : fold ? RAG[base + 1] : RAG[base]); p.dot(x + 0.5, y, mossy ? MOSS[1] : fold ? RAG[base] : RAG[Math.max(0, base - 1)]);
        ex = x; ey = y;
      }
      p.dot(ex - 0.5, ey + 0.5, RAG[base]); p.dot(ex + 0.5, ey + 1, RAG[Math.max(0, base - 1)]);
      continue;
    }
    for (let j = 0; j < len; j++) {
      const v = j / len;
      const x = top.x - 1 - i * 0.8 - P.robe * 5 * v * v + Math.sin(P.robeT + v * 3 + i) * 0.8 * v;
      p.px(x, top.y + j + i * 0.3, i === 0 ? RAG[3] : (i + j) % 4 === 0 ? MOSS[2] : RAG[1 + (i & 1)]);
    }
  }
  // --- hinterer Arm (knochig)
  cap(p, shB.x, shB.y, armB.jx, armB.jy, 1.8, 1.5, [RAG[0], RAG[1], RAG[2]]);
  cap(p, armB.jx, armB.jy, armB.ex, armB.ey, 1.2, 1, [S_SKIN[0], S_SKIN[1], S_SKIN[2]]);
  const fing = (x, y, open, cols, a0) => {
    for (let k = -1; k <= 1; k++) {
      const aa = a0 + k * (0.3 + open * 0.35);
      const x1 = x + Math.cos(aa) * (2 + open), y1 = y + Math.sin(aa) * (2 + open);
      if (p.fine) { // dürrer Finger mit Knöchelkerbe und hellem Nagel
        p.fline(x, y, x1, y1, cols[k === 0 ? 1 : 0], 0.5); p.fline(x - 0.5, y, x1 - 0.5, y1, cols[0]);
        p.dot((x + x1) / 2, (y + y1) / 2, S_SKIN[0]); p.dot(x1, y1, BONE[3]);
        continue;
      }
      p.line(x, y, x1, y1, cols[k === 0 ? 1 : 0]);
    }
  };
  fing(armB.ex, armB.ey, P.open, [S_SKIN[2], S_SKIN[3]], P.open > 0.3 ? -1.2 : 1.3);
  if (P.open > 0.3) { glowDot(g, armB.ex + 0.5, armB.ey - 2, 1.2 * P.open, GT); p.px(armB.ex + 0.5, armB.ey - 2, TOX[4]); }
  // --- Beine (dürr, umwickelt)
  for (const [L, far] of [[legB, true], [legF, false]]) {
    const hx = hip.x + (far ? -1 : 1);
    cap(p, hx, hip.y, L.jx, L.jy, 1.8, 1.4, far ? [S_SKIN[0], S_SKIN[1]] : [S_SKIN[1], S_SKIN[2], S_SKIN[3]]);
    cap(p, L.jx, L.jy, L.ex, L.ey - 0.5, 1.4, 1.1, far ? [S_SKIN[0], S_SKIN[1]] : [S_SKIN[1], S_SKIN[2], S_SKIN[3]]);
    p.px(L.jx, L.jy + 2, RAG[far ? 1 : 3]); p.px(L.jx + 0.5, L.jy + 3, RAG[far ? 1 : 3]);
    p.rect(L.ex - 1, L.ey, 4, 1, far ? S_SKIN[0] : S_SKIN[2]); p.px(L.ex + 3, L.ey, far ? S_SKIN[1] : S_SKIN[3]);
    if (p.fine) { // Wickelbinden am Schienbein (schräg, helle Oberkante), Zehen mit Kerben
      for (let w = 0; w < 3; w++) {
        const t = 0.25 + w * 0.22, x = L.jx + (L.ex - L.jx) * t, y = L.jy + (L.ey - L.jy) * t;
        p.fline(x - 1.25, y - 0.25, x + 1, y + 0.5, RAG[far ? 2 : 4]); p.fline(x - 1.25, y + 0.25, x + 1, y + 1, RAG[far ? 1 : 2]);
      }
      p.dot(L.ex + 0.5, L.ey + 0.5, S_SKIN[0]); p.dot(L.ex + 1.5, L.ey + 0.5, S_SKIN[0]); p.dot(L.ex + 3, L.ey, far ? S_SKIN[2] : S_SKIN[4]);
    }
  }
  // --- Robe: Trapez von den Schultern bis knapp über die Knöchel, zerfranster Saum
  const c0 = pt(SD.spine + 0.5, -3.5), c1 = pt(SD.spine + 0.5, 3.2);
  const hemY = AY - 5 + P.hipY * 0.3;
  const hemL = hip.x - 6.5 - P.robe * 2.5, hemR = hip.x + 5.5 + P.robe * 0.5 + (P.fFx - 3) * 0.3;
  const hem = [];
  for (let i = 0; i <= 12; i++) {
    const x = hemR + (hemL - hemR) * (i / 12);
    const tooth = (i % 2 ? 1.6 : 0) + hash2(i, 7, 93) * 1.4 + Math.sin(P.robeT * 1.3 + i * 0.9) * 0.6;
    hem.push([x, hemY + tooth]);
  }
  const shade = (x, y) => {
    const u = (x - hemL) / (hemR - hemL || 1);
    if (p.fine) { // zweifarbige Falten: schmale dunkle Rinne, rechts daneben eine Lichtkante (Licht von links)
      const w = u * 9 + P.robeT * 0.3 + (y - hemY) * 0.04, sv = Math.sin(w);
      const f2 = sv > 0.82 ? -1 : sv > 0.45 && Math.cos(w) < 0 ? 1 : 0;
      const k = clamp(Math.round(4.4 - u * 2.6 - (y > hemY - 2 ? 1 : 0)) + f2, 1, 6);
      return RAG[k];
    }
    const fold = Math.sin(u * 9 + P.robeT * 0.3) > 0.55 ? -1 : 0;
    const k = clamp(Math.round(4.4 - u * 2.6 + fold - (y > hemY - 2 ? 1 : 0)), 1, 5);
    return RAG[k];
  };
  poly(p, [[c0.x, c0.y], [c1.x, c1.y], ...hem], shade);
  if (p.fine) { // lose Fäden an den Saumzipfeln
    for (let i = 1; i < 12; i += 2) {
      const [x, y] = hem[i], sw = Math.sin(P.robeT * 1.3 + i) * 0.4;
      p.fline(x, y, x + sw, y + 1.5, RAG[2]); p.dot(x + sw, y + 1.5, RAG[1]);
    }
  }
  // Moosflecken und Schlamm am Saum (fein: kleine Schmierer mit heller Kuppe)
  for (let i = 0; i < 10; i++) {
    const x = hemL + (hemR - hemL) * hash2(i, 1, 97), y = hemY - hash2(i, 2, 97) * 3;
    if (p.fine) {
      const c = i % 3 ? MUD : MOSS;
      p.dot(x, y, c[3]); p.dot(x + 0.5, y, c[3]); p.dot(x, y + 0.5, c[2]); p.dot(x + 0.5, y + 0.5, c[1]); p.dot(x, y - 0.5, c[5]);
      continue;
    }
    p.px(x, y, i % 3 ? MUD[3] : MOSS[3]);
  }
  // Gürtel mit Knochenfetischen
  const b0 = pt(1.5, -4), b1 = pt(1.5, 4);
  p.line(b0.x, b0.y, b1.x, b1.y, ROOT[3]); p.line(b0.x, b0.y + 1, b1.x, b1.y + 1, ROOT[1]);
  if (p.fine) { // Ledergurt: Lichtkante oben, Naht als Punktlinie
    p.fline(b0.x, b0.y, b1.x, b1.y, ROOT[5]);
    for (let t = 0.05; t < 1; t += 0.12) p.dot(b0.x + (b1.x - b0.x) * t, b0.y + (b1.y - b0.y) * t + 0.5, ROOT[4]);
  }
  for (const k of [-2.5, 0.5, 2.5]) {
    const b = pt(1, k), sw = Math.sin(P.robeT + k) * 0.6;
    if (p.fine) { // Fetisch: Schnur, Knöchelchen mit Gelenkknubbeln und Riss
      const ex = b.x + sw, ey = b.y + 3.5;
      p.fline(b.x, b.y + 1, ex, ey, RAG[1]);
      p.dot(ex - 0.5, ey + 0.5, BONE[5]); p.dot(ex, ey + 0.5, BONE[4]); p.dot(ex, ey + 1, BONE[k > 0 ? 4 : 3]); p.dot(ex, ey + 1.5, BONE[1]);
      p.dot(ex, ey + 2, BONE[3]); p.dot(ex - 0.5, ey + 2.5, BONE[3]); p.dot(ex + 0.5, ey + 2.5, BONE[2]);
      continue;
    }
    p.line(b.x, b.y + 1, b.x + sw, b.y + 3, RAG[1]);
    p.px(b.x + sw, b.y + 4, BONE[k > 0 ? 4 : 3]); p.px(b.x + sw + (k > 0 ? 1 : 0), b.y + 5, BONE[2]);
  }
  const sk = pt(1.5, 1.5); // Schädelchen am Gürtel
  if (p.fine) { // rund, Augenhöhlen, Nasenloch, Zahnreihe, Riss
    const X0 = p.snap(sk.x - 1), Y0 = p.snap(sk.y);
    p.rect(X0 + 0.5, Y0 - 0.5, 2, 0.5, BONE[4]); p.rect(X0, Y0, 3, 1, BONE[3]); p.rect(X0 + 0.5, Y0 + 1, 2, 0.5, BONE[2]);
    p.dot(X0 + 0.5, Y0 - 0.5, BONE[5]); p.dot(X0, Y0, BONE[5]);
    p.dot(X0 + 0.5, Y0 + 0.5, '#0a0806'); p.dot(X0 + 2, Y0 + 0.5, '#0a0806'); p.dot(X0 + 1.5, Y0 + 0.5, '#0a0806');
    p.dot(X0 + 1.5, Y0 + 1, BONE[1]); p.dot(X0 + 1, Y0 + 1.5, BONE[4]); p.dot(X0 + 2, Y0 + 1.5, BONE[4]); p.dot(X0 + 1.5, Y0 + 1.5, BONE[1]);
    p.dot(X0 + 1.5, Y0 - 0.5, BONE[1]); p.dot(X0 + 2, Y0, BONE[1]);
  } else {
    p.rect(sk.x - 1, sk.y, 3, 2, BONE[3]); p.px(sk.x - 1, sk.y, BONE[5]); p.px(sk.x, sk.y + 1, '#0a0806'); p.px(sk.x + 1, sk.y + 1, '#0a0806');
  }

  // --- Moosmantel über den Schultern + Kapuze
  const col = pt(SD.spine, -0.5);
  ell(p, col.x, col.y, 5, 2.8, MOSS, { noise: 0.2, seed: 21 });
  for (let i = -4; i <= 4; i += 1.3) {
    const x = col.x + i, y = col.y + 2 + (hash2(Math.round(i * 3), 1, 22) * 2.5 | 0);
    if (p.fine) { // Moossträhnen: zwei dünne Fäden je Bart, hell/dunkel
      p.fline(x, col.y + 1, x - P.robe * 0.5, y, MOSS[i < 0 ? 2 : 4]); p.fline(x + 0.5, col.y + 1, x + 0.5 - P.robe * 0.5, y - 0.5, MOSS[i < 0 ? 1 : 2]);
      p.dot(x - P.robe * 0.5, y + 0.5, MOSS[1]);
      continue;
    }
    p.line(x, col.y + 1, x - P.robe * 0.5, y, MOSS[i < 0 ? 2 : 3]);
  }
  if (p.fine) mossTufts(p, col.x, col.y, 5, 2.8, P.robeT, 8, 21);
  // Leuchtpilzchen auf der Schulter
  const mu = pt(SD.spine + 0.5, -3.2);
  if (p.fine) { // Hut mit heißem Kern und dunklen Lamellen, dünner Stiel
    const X0 = p.snap(mu.x), Y0 = p.snap(mu.y - 1);
    p.rect(X0 - 0.5, Y0, 2.5, 0.5, TOX[3]); p.rect(X0, Y0 - 0.5, 1.5, 0.5, TOX[4]); p.dot(X0 + 0.5, Y0, TOX[5]);
    p.dot(X0, Y0 + 0.5, TOX[1]); p.dot(X0 + 1, Y0 + 0.5, TOX[1]); p.dot(X0 + 0.5, Y0 + 0.5, BONE[3]); p.dot(X0 + 0.5, Y0 + 1, BONE[2]);
    g.rect(X0 - 0.5, Y0 - 0.5, 2.5, 1, GT[1]); g.dot(X0 + 0.5, Y0, GT[4]); g.dot(X0 + 0.5, Y0 - 0.5, GT[3]);
  } else {
    p.px(mu.x, mu.y - 1, TOX[3]); p.px(mu.x + 1, mu.y - 1, TOX[4]); p.px(mu.x + 0.5, mu.y, BONE[2]);
    g.px(mu.x, mu.y - 1, GT[1]); g.px(mu.x + 1, mu.y - 1, GT[2]);
  }

  // --- Kopf: Kapuze mit Hirschschädel-Maske
  const neck = pt(SD.spine + 2.5, 0.5);
  const hx = Math.round(neck.x + P.head), hy = Math.round(neck.y - 2 + P.headY);
  ell(p, hx - 0.5, hy, 3.8, 3.8, near, { seed: 23 });
  p.px(hx - 4, hy + 2, RAG[2]); p.px(hx - 4.5, hy + 3, RAG[1]); p.px(hx - 5, hy + 4, RAG[1]);
  if (p.fine) { // Kapuze: Stoffkante um die Maske (hell/dunkel), Falte im Nacken
    for (let a = -2.2; a < 0.9; a += 0.18) p.dot(hx - 0.5 + Math.cos(a) * 3.3, hy + Math.sin(a) * 3.3, a < -0.6 ? RAG[6] : RAG[5]);
    p.fline(hx - 3.5, hy - 1.5, hx - 2.5, hy + 2, RAG[1]); p.fline(hx - 3, hy - 1.5, hx - 2, hy + 1.5, RAG[5]);
  }
  // Geweihstangen aus der Kapuze
  for (const [dx, dir, c] of [[-1.5, -1, BONE[2]], [1, 1, BONE[4]]]) {
    const b = { x: hx + dx, y: hy - 3 };
    const a = root(b.x, b.y, -Math.PI / 2 - 0.35 + dir * 0.2, -0.12 * dir, 4, 1.5);
    if (p.fine) { // Stange 2 Feinpixel mit Lichtkante, Spross mit Gelenkkerbe, helle Spitzen
      const lt = dir > 0 ? BONE[5] : BONE[3], dk = dir > 0 ? BONE[3] : BONE[1];
      for (let j = 0; j < a.length - 1; j++) {
        p.fline(a[j][0] + 0.5, a[j][1], a[j + 1][0] + 0.5, a[j + 1][1], j < 3 ? dk : c);
        p.fline(a[j][0], a[j][1], a[j + 1][0], a[j + 1][1], j < 3 ? c : lt);
      }
      p.fline(a[2][0], a[2][1], a[2][0] + 2 * (dir > 0 ? 1 : 0.5), a[2][1] - 1.5, c);
      p.dot(a[2][0] + 0.5, a[2][1] + 0.5, BONE[0]); p.dot(a[1][0] + 0.5, a[1][1], BONE[1]);
      p.dot(a[2][0] + 2 * (dir > 0 ? 1 : 0.5), a[2][1] - 1.5, lt);
      p.dot(a[a.length - 1][0], a[a.length - 1][1], BONE[5]);
      continue;
    }
    for (let j = 0; j < a.length - 1; j++) p.line(a[j][0], a[j][1], a[j + 1][0], a[j + 1][1], c);
    p.line(a[2][0], a[2][1], a[2][0] + 2 * (dir > 0 ? 1 : 0.5), a[2][1] - 1.5, c);
    p.px(a[a.length - 1][0], a[a.length - 1][1], BONE[5]);
  }
  // Schädelmaske (Schnauze nach vorn unten)
  const m0 = { x: hx + 1, y: hy - 0.5 }, m1 = { x: hx + 5, y: hy + 2 };
  cap(p, m0.x, m0.y, m1.x, m1.y, 2.2, 1.2, [BONE[1], BONE[2], BONE[3], BONE[4], BONE[5]]);
  p.px(m1.x + 0.5, m1.y + 0.5, BONE[1]); p.px(m1.x - 1, m1.y + 1, BONE[1]); // Nasenloch, Kieferkante
  p.px(hx + 3, hy + 2.5, BONE[1]); p.px(hx + 2, hy + 2.5, BONE[3]);
  for (const u of [2.5, 3.5, 4.5]) p.px(hx + u, hy + 3, u === 3.5 ? BONE[2] : BONE[4]);   // Zahnreihe
  p.px(hx + 1.5, hy + 1.2, BONE[1]);                                                    // Wangenbogen-Schatten
  if (p.fine) { // Knochenmaske: Risse, Nasenrücken-Licht, einzelne Zähne
    p.fline(hx + 2.5, hy - 1.5, hx + 3.5, hy - 0.5, BONE[1]); p.dot(hx + 4, hy - 0.5, BONE[1]); p.dot(hx + 4, hy, BONE[2]);
    p.fline(hx + 2.5, hy - 1.25, hx + 4.5, hy + 0.75, BONE[5]);
    p.dot(hx + 2.5, hy + 0.5, BONE[1]); p.dot(hx + 2, hy + 1, BONE[1]);
    for (const u of [2.5, 3, 3.5, 4, 4.5]) { p.dot(hx + u, hy + 3, u === 3 || u === 4 ? BONE[1] : BONE[5]); p.dot(hx + u, hy + 3.5, u === 3 || u === 4 ? BONE[0] : BONE[3]); }
    p.dot(m1.x + 1, m1.y + 0.5, '#0a0806');
  }
  // leuchtende Augenhöhlen
  const eOn = P.eye > 0.3;
  p.rect(hx + 1, hy - 1, 2, 2, '#0a0806');
  if (eOn && p.fine) { // Glutauge: heißer heller Kern im grünen Saum, tiefe Höhle drumherum
    p.dot(hx + 1.5, hy - 0.5, TOX[3]); p.dot(hx + 2, hy - 0.5, TOX[5]); p.dot(hx + 2.5, hy - 0.5, TOX[4]); p.dot(hx + 2, hy, TOX[3]); p.dot(hx + 1, hy - 0.5, TOX[2]);
    p.dot(hx + 2, hy - 1, '#ffffff');
    g.rect(hx + 1, hy - 1, 2, 1.5, GT[1]); g.dot(hx + 2, hy - 0.5, GT[4]); g.dot(hx + 1.5, hy - 0.5, GT[3]); g.dot(hx + 2.5, hy - 0.5, GT[3]); g.dot(hx + 3, hy - 0.5, GT[1]);
  } else if (eOn) { p.px(hx + 2, hy - 0.5, TOX[4]); p.px(hx + 1, hy - 0.5, TOX[2]); g.px(hx + 2, hy - 0.5, GT[4]); g.px(hx + 1, hy - 0.5, GT[2]); g.px(hx + 3, hy - 0.5, GT[1]); }
  meta.eye = { x: hx + 2, y: hy - 0.5 };
  meta.head = { x: hx, y: hy - 8 };
  meta.mouth = { x: hx + 5, y: hy + 2 };

  // --- vorderer Arm + Stab
  const st = drawStaff(p, g, armF.ex, armF.ey, P.staffA, P);
  cap(p, shF.x, shF.y, armF.jx, armF.jy, 2, 1.7, near);
  cap(p, armF.jx, armF.jy, armF.ex, armF.ey, 1.3, 1.1, [S_SKIN[1], S_SKIN[2], S_SKIN[3], S_SKIN[4]]);
  p.px(armF.jx, armF.jy + 1, RAG[4]); p.px(armF.jx - 0.5, armF.jy + 2, RAG[3]); // Ärmelfetzen
  p.rect(armF.ex - 1, armF.ey - 1, 2, 2, S_SKIN[3]); p.px(armF.ex - 1, armF.ey - 1, S_SKIN[4]);
  if (p.fine) { // Finger um den Stab: Knöchel hell, Fugen dunkel, Ärmelsaum mit Falte
    p.dot(armF.ex - 1, armF.ey - 1, S_SKIN[4]); p.dot(armF.ex - 0.5, armF.ey - 1, S_SKIN[3]);
    for (const k of [-0.5, 0, 0.5]) { p.dot(armF.ex + 0.5, armF.ey + k, S_SKIN[1]); p.dot(armF.ex - 0.5, armF.ey + k + 0.25, S_SKIN[4]); }
    p.dot(armF.jx + 0.5, armF.jy + 1.5, RAG[6]); p.dot(armF.jx, armF.jy + 2.5, RAG[2]);
  }
  meta.hand = st.orb;
  meta.staff = st.bot;
  // Sporenausstoß am Boden (Wirken der Giftwolke)
  if (P.burst > 0.02) {
    const bx = st.bot.x, by = AY - 1;
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * TAU;
      const rr = 3 + P.burst * 13 * (0.7 + hash2(i, 1, 99) * 0.5);
      gasPuff(p, g, bx + Math.cos(a) * rr, by + Math.sin(a) * rr * 0.35 - 1 - P.burst * 2, 1.5 + (1 - P.burst) * 1.5, 0.9 - P.burst * 0.5, 100 + i, [TOX[0], TOX[1], TOX[2], TOX[3], TOX[4]], GT);
    }
  }
  return meta;
}

function shamanAnims() {
  const mk = (P, X) => makeFrame(SH, P, X);
  const T = (keys, n, o) => track(SH, keys, n, o);
  const idleA = spose();
  const idleB = spose({ hipY: 0.8, lean: 0.32, head: 0.4, headY: 0.5, hFy: 5.5, staffA: 0.09, orb: 0.6, robeT: Math.PI });
  const idle = [];
  for (let i = 0; i < 6; i++) { const k = (1 - Math.cos(i / 6 * TAU)) / 2; idle.push(mk({ ...mix(idleA, idleB, k), robeT: i / 6 * TAU })); }
  // Gehen: schlurfend, der Stab wird mitgesetzt
  const walk = [];
  for (let i = 0; i < 8; i++) {
    const ph = i / 8 * TAU, sn = Math.sin(ph), c = Math.cos(ph);
    walk.push(mk(spose({
      hipY: -Math.abs(c) * 0.8 + 0.5, lean: 0.32, fFx: 1 + sn * 3.5, fFy: Math.max(0, -c) * 1.6, fBx: -1 - sn * 3.5, fBy: Math.max(0, c) * 1.6,
      hFx: 8 + sn * 1.5, hFy: 5 - Math.abs(sn) * 0.5, staffA: 0.05 + sn * 0.12, hBx: 1 - sn * 1.5, robe: 0.5, robeT: ph, head: sn * 0.3,
    }), { fx: i % 4 === 0 ? 'step' : null }));
  }
  // Ausholen: Stab hochreißen, Kugel saugt Sporen an
  const w1 = spose({ lean: 0.12, hFx: 5, hFy: -2, staffA: -0.05, hBx: 4, hBy: 2, open: 0.5, orb: 1.2, swirl: 0.3, robeT: 1 });
  const w2 = spose({ lean: 0.0, hipX: -1, hFx: 3, hFy: -5, staffA: -0.25, hBx: 5, hBy: 0, open: 1, orb: 1.6, swirl: 0.7, head: -0.5, robeT: 2, fFx: 4, fBx: -4 });
  const w3 = { ...w2, swirl: 1, orb: 2, robeT: 3 };
  const windup = T([[0, idleA], [0.35, w1], [0.75, w2], [1, w3]], 5);
  // Zauber: Stab nach vorn stoßen, Kugel entlädt sich
  const s1 = spose({ lean: 0.4, hipX: 1.5, hFx: 9, hFy: 1, staffA: 0.85, hBx: -2, hBy: 6, orb: 2.2, head: 1, fFx: 5, fBx: -4, robe: 0.6, robeT: 4 });
  const s2 = spose({ lean: 0.36, hipX: 1, hFx: 8, hFy: 2, staffA: 0.7, hBx: -1, hBy: 7, orb: 0.4, head: 0.8, fFx: 5, fBx: -4, robe: 0.4, robeT: 5 });
  const strike = [mk(s1, { fx: 'cast' }), mk(s2), mk(mix(s2, idleA, 0.5)), mk(idleA)];
  // Giftwolke: Stab hoch über den Kopf, dann Stabende in den Morast rammen
  const c1 = spose({ lean: -0.05, hFx: 3, hFy: -7, staffA: -0.1, hBx: 4, hBy: -6, open: 1, orb: 1.5, swirl: 0.4, head: -1, headY: -0.5, robeT: 1, fFx: 4, fBx: -4 });
  const c2 = { ...c1, lean: -0.12, hFy: -9, hBy: -8, orb: 2.2, swirl: 1, robeT: 2 };
  const c3 = spose({ lean: 0.45, hipY: 2, hipX: 1, hFx: 7, hFy: 7, staffA: 0.05, hBx: 5, hBy: 5, orb: 1.6, head: 1.2, fFx: 5, fBx: -5, robe: 0.8, robeT: 3, burst: 0.25 });
  const c4 = { ...c3, burst: 0.6, orb: 0.8, robeT: 4 };
  const c5 = { ...c3, hipY: 1.5, burst: 1, orb: 0.5, robeT: 5 };
  const cast = T([[0, idleA], [0.25, c1], [0.55, c2], [0.66, c3, snap], [0.8, c4], [1, c5]], 11, { extras: { 7: { fx: 'impact' } } });
  const hurtP = spose({ lean: 0.05, hipX: -1.5, head: -1.2, headY: -0.5, hFx: 4, hFy: 5, staffA: -0.2, hBx: -2, hBy: 4, orb: 0.5, robe: -0.3, robeT: 2 });
  const hurt = [mk(hurtP), mk(mix(hurtP, idleA, 0.5))];
  // Tod: sackt in die Knie, kippt vornüber, die Kugel erlischt
  const d1 = { ...hurtP, lean: -0.1, head: -1.5 };
  const d2 = spose({ hipY: 4, lean: 0.5, head: 1.5, hFx: 7, hFy: 8, staffA: 0.9, hBx: 3, hBy: 8, orb: 0.4, eye: 0.6, fFx: 4, fBx: -4, robeT: 3 });
  const d3 = { ...d2, hipY: 5, lean: 0.8, head: 2, orb: 0.2, eye: 0.3 };
  const piv = [SH.AX + 4, SH.AY - 1];
  const flat = { ...d3, orb: 0, eye: 0, hFx: 2, hFy: 9, staffA: 1.5 };
  const death = [
    mk(d1), mk(d2), mk(d3, { fx: 'impact' }),
    mk(d3, { rot: [0.25, ...piv] }),
    mk(flat, { rot: [0.55, ...piv] }),
    mk(flat, { rot: [0.72, ...piv], fx: 'impact' }),
    mk(flat, { rot: [0.75, ...piv] }),
  ];
  return {
    idle: new Animation(idle, 6),
    walk: new Animation(walk, 8),
    windup: new Animation(windup, 7, false),
    strike: new Animation(strike, 10, false),
    cast: new Animation(cast, 10, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 8, false),
  };
}


// ================================================================ Sumpfegel

// Fetter, glänzender Egel: dunkler Ringleib mit roter Flankenlinie und
// leuchtenden Rückenpunkten, vorn eine Saugscheibe mit Zahnkranz.
// Kriecht in Wellen (Buckel läuft von hinten nach vorn), bäumt sich zum
// Sprung auf und schnellt mit offener Scheibe vor.
const LE = { W: 48, H: 30, AX: 22, AY: 24, pad: 8, rim: '#d0c8c0', back: '#8a90b0', rimK: 0.3, backK: 0.22, draw: drawLeech };
const LEECH = ['#0a0708', '#170f12', '#26181b', '#382226', '#4e3032', '#6a4442', '#8a6058'];
const STRIPE = ['#4a120e', '#7e2416', '#b44a24', '#e07a3a'];
const E_REST = { t: 0, amp: 0, rear: 0, reach: 0, open: 0, curl: 0, shrivel: 0, glow: 1, lunge: 0, air: 0, head: 0, twitch: 0 };
const epose = (o = {}) => ({ ...E_REST, ...o });

// Handfeine Haut des Egels: Ringfurchen als feine Kerben mit Lichtwulst dahinter, durchgehende rote Flankenlinie,
// nasser Glanz je Ring (Strich + heller Kern), Leuchtpunkte mit heißem Kern und dunklem Hof, dunkle Bauchkante.
function leechFine(p, g, pts, P) {
  const N = pts.length, fl = [];
  for (let i = 1; i < N - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, tx = dx / l, ty = dy / l;
    let nx = -dy / l, ny = dx / l; if (ny < 0) { nx = -nx; ny = -ny; }
    // Ringfurche quer über den Leib: dunkle Kerbe, davor ein heller Wulst
    if (i % 2 === 0) {
      p.fline(a.x + nx * (a.r - 1) + tx, a.y + ny * (a.r - 1) + ty, a.x - nx * a.r * 0.7 + tx * 1.4, a.y - ny * a.r * 0.7 + ty * 1.4, LEECH[2]);
      p.fline(a.x + nx * (a.r - 1.5) + tx * 0.5, a.y + ny * (a.r - 1.5) + ty * 0.5, a.x - nx * a.r * 0.5 + tx * 0.5, a.y - ny * a.r * 0.5 + ty * 0.5, LEECH[4]);
    }
    fl.push([a.x + nx * a.r * 0.45, a.y + ny * a.r * 0.45]);
    // Bauchkante dunkel, alle zwei Ringe ein Rostfleck
    p.dot(a.x, a.y + a.r - 0.5, LEECH[1]); p.dot(a.x + 0.5, a.y + a.r - 0.5, LEECH[1]);
    // nasser Glanz: Strich längs der Oberseite, heller Kern
    if (i % 2 === 1) {
      const hx = a.x - nx * a.r * 0.62, hy = a.y - ny * a.r * 0.62;
      p.fline(hx, hy, hx + tx * 1.2, hy + ty * 1.2, LEECH[6]); p.dot(hx, hy, i % 4 === 1 ? '#f0c8b8' : '#c4948a');
    } else p.dot(a.x - nx * a.r * 0.55, a.y - ny * a.r * 0.55, LEECH[5]);
    // Leuchtpunkte auf dem Rücken mit dunklem Hof
    if (i % 2 === 0 && i < N - 2 && P.glow > 0.1) {
      const gx = p.snap(a.x - nx * a.r * 0.2), gy = p.snap(a.y - ny * a.r * 0.2);
      p.rect(gx - 0.5, gy - 0.5, 1.5, 1.5, LEECH[1]);
      p.rect(gx - 0.5, gy - 0.5, 1, 1, WISP[P.glow > 0.6 ? 3 : 2]); p.dot(gx - 0.5, gy - 0.5, P.glow > 0.6 ? WISP[4] : WISP[3]);
      g.rect(gx - 0.5, gy - 0.5, 1, 1, WISP[P.glow > 0.6 ? 2 : 1]); g.dot(gx - 0.5, gy - 0.5, WISP[P.glow > 0.6 ? 4 : 2]);
      if (P.glow > 0.6) { g.dot(gx - 1, gy - 0.5, WISP[1]); g.dot(gx + 0.5, gy - 0.5, WISP[1]); }
    }
  }
  // Flankenlinie als durchgehendes Band: oben glühendes Orange, unten Rostrot
  for (let i = 0; i + 1 < fl.length; i++) {
    const [x0, y0] = fl[i], [x1, y1] = fl[i + 1];
    p.fline(x0, y0, x1, y1, STRIPE[2]); p.fline(x0, y0 + 0.5, x1, y1 + 0.5, STRIPE[1]);
    if (i % 2 === 0) p.dot(x0, y0, STRIPE[3]);
    p.dot(x0, y0 + 1, STRIPE[0]);
  }
}

function drawLeech(p, g, P) {
  const { AX, AY } = LE;
  const meta = {};
  const N = 11;
  const sp = 2.05 * (1 + P.reach * 0.45) * (1 - P.curl * 0.1);
  const pts = [];
  for (let i = 0; i < N; i++) {
    const f = i / (N - 1);
    let r = (1.5 + 2.3 * Math.sin(Math.PI * (0.12 + 0.8 * f))) * (1 - P.shrivel * 0.35) * (1 - P.reach * 0.15);
    const hump = P.amp * 3.4 * Math.max(0, Math.sin(P.t * TAU - f * TAU * 1.1));
    let x = AX - 11 + P.lunge + i * sp - P.amp * Math.max(0, Math.sin(P.t * TAU - f * TAU * 1.1)) * 0.6 * f;
    let y = AY - 1 - r - hump - P.air * (0.3 + f * 0.7);
    if (P.rear > 0 && f > 0.45) {
      const k = Math.pow((f - 0.45) / 0.55, 1.4);
      y -= P.rear * k * 9; x -= P.rear * k * 3.5;
    }
    if (P.curl > 0) { // C-förmig einrollen
      const a = -Math.PI * 0.5 + (f - 0.5) * Math.PI * 1.6;
      const cx = AX + 1, cy = AY - 6, R = 6;
      const x2 = cx + Math.cos(a) * R * 1.2, y2 = Math.min(AY - 1 - r, cy - Math.sin(a) * R * -0.9 + 2);
      x += (x2 - x) * P.curl; y += (y2 - y) * P.curl;
    }
    y += Math.sin(P.twitch * 7 + i) * P.twitch;
    pts.push({ x, y, r, f });
  }
  // --- Körper: Kapseln vom Schwanz zum Kopf
  for (let i = 0; i < N - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    cap(p, a.x, a.y, b.x, b.y, a.r, b.r, LEECH, { bias: 0.02 });
  }
  // Ringfurchen, rote Flankenlinie, Glanzpunkte, Leuchtpunkte
  if (p.fine) leechFine(p, g, pts, P);
  else for (let i = 1; i < N - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    let nx = -dy / l, ny = dx / l; if (ny < 0) { nx = -nx; ny = -ny; }   // nach unten
    if (i % 2 === 0) for (let k = -a.r + 1; k <= a.r * 0.3; k += 0.7) p.px(a.x + nx * k + dx / l, a.y + ny * k + dy / l, LEECH[2]);
    // Flankenlinie (unteres Drittel)
    const sx = a.x + nx * a.r * 0.45, sy = a.y + ny * a.r * 0.45;
    p.px(sx, sy, STRIPE[2]); p.px(sx + dx / l, sy + dy / l, STRIPE[i % 2 ? 1 : 2]);
    // nasser Glanz: kurze, harte Lichtflecken je Ring statt durchgehender Linie
    if (i % 2 === 1) {
      const hx0 = a.x - nx * a.r * 0.62, hy0 = a.y - ny * a.r * 0.62;
      p.px(hx0, hy0, LEECH[6]); p.px(hx0 + dx / l, hy0 + dy / l, i % 4 === 1 ? '#c4948a' : LEECH[6]);
    } else p.px(a.x - nx * a.r * 0.55, a.y - ny * a.r * 0.55, LEECH[5]);
    // Leuchtpunkte auf dem Rücken mit dunklem Hof
    if (i % 2 === 0 && i < N - 2 && P.glow > 0.1) {
      const gx = a.x - nx * a.r * 0.2, gy = a.y - ny * a.r * 0.2;
      p.px(gx + 1, gy, LEECH[1]); p.px(gx, gy + 1, LEECH[1]);
      p.px(gx, gy, WISP[P.glow > 0.6 ? 3 : 2]); g.px(gx, gy, WISP[P.glow > 0.6 ? 3 : 1]);
      if (P.glow > 0.6) { p.px(gx - 0.6, gy, WISP[2]); g.px(gx - 1, gy, WISP[1]); }
    }
  }
  // Bauch dunkler
  if (!p.fine) for (let i = 1; i < N - 1; i++) { const a = pts[i]; p.px(a.x, a.y + a.r - 0.5, LEECH[1]); if (i % 2) p.px(a.x, a.y + a.r - 1.5, STRIPE[0]); }
  // --- Kopf mit Saugscheibe
  const h = pts[N - 1], h2 = pts[N - 2];
  const ang = Math.atan2(h.y - h2.y, h.x - h2.x) + P.head;
  const ux = Math.cos(ang), uy = Math.sin(ang);
  const dx = h.x + ux * (h.r + 0.5), dy = h.y + uy * (h.r + 0.5);
  const dr = 2.2 + P.open * 1.2;
  ell(p, dx, dy, 1.4 + P.open * 0.4, dr, [LEECH[2], LEECH[3], LEECH[4], LEECH[5]], { rot: ang });
  if (P.open > 0.15) {
    ell(p, dx + ux * 0.6, dy + uy * 0.6, 0.8 + P.open * 0.2, dr - 0.8, ['#2a0608', '#5a0e12', '#8a1c1c'], { rot: ang });
    if (p.fine) { // Zahnkranz: spitze Hakenzähne zur Mitte, Schlund dunkel, feuchter Glanz am Rand
      for (let k = 0; k < 7; k++) {
        const a2 = ang + Math.PI / 2 + (k / 6 - 0.5) * Math.PI * 0.9 * 2;
        const cx = dx + ux * 0.8, cy = dy + uy * 0.8, ca = Math.cos(a2), sa = Math.sin(a2);
        p.dot(cx + ca * (dr - 0.6) * 0.5, cy + sa * (dr - 0.6), k % 2 ? BONE[4] : BONE[5]);
        p.dot(cx + ca * (dr - 1.3) * 0.5, cy + sa * (dr - 1.3), BONE[2]);
      }
      p.dot(dx + ux * 1.2, dy + uy * 1.2, '#140204'); p.dot(dx - ux * 0.5 - uy * (dr - 0.5), dy - uy * 0.5 + ux * (dr - 0.5) * 0, LEECH[6]);
    } else for (let k = 0; k < 6; k++) {
      const a2 = ang + Math.PI / 2 + (k / 5 - 0.5) * Math.PI * 0.9 * 2;
      p.px(dx + ux * 0.8 + Math.cos(a2) * (dr - 0.6) * 0.5, dy + uy * 0.8 + Math.sin(a2) * (dr - 0.6), BONE[4]);
    }
    g.px(dx + ux, dy + uy, '#4a0a0a');
  } else p.line(dx + ux * 0.8 - uy * (dr - 1), dy + uy * 0.8 + ux * (dr - 1), dx + ux * 0.8 + uy * (dr - 1), dy + uy * 0.8 - ux * (dr - 1), LEECH[0]);
  // Augenpunkte: Reihe roter Punktaugen auf dem Kopflappen, darüber eine dunkle Falte
  const ex = h.x - uy * -h.r * 0.1 + ux * 0.5, ey = h.y - h.r * 0.6;
  p.px(ex - 0.5, ey - 1, LEECH[1]); p.px(ex - 2, ey - 0.7, LEECH[2]);
  if (P.glow > 0.1 && p.fine) { // Punktaugen: glühender Kern im roten Saum, nach hinten kleiner
    for (const [o, k] of [[0, 2], [-1.5, 1], [-3, 0]]) {
      const x = ex + o, y = ey - o * 0.2;
      if (k > 0) { p.dot(x - 0.5, y, '#801c14'); p.dot(x + 0.5, y, '#801c14'); p.dot(x, y + 0.5, '#5a1008'); }
      p.dot(x, y, k === 2 ? '#ffd0a0' : k === 1 ? '#ff6a40' : '#c03020');
      if (k === 2) { p.dot(x - 0.5, y, '#ff6a40'); p.dot(x, y - 0.5, '#ff6a40'); }
      g.dot(x, y, k === 2 ? '#ff8050' : k === 1 ? '#c03020' : '#601008'); if (k === 2) { g.dot(x + 0.5, y, '#801c10'); g.dot(x - 0.5, y, '#801c10'); }
    }
    p.fline(ex - 3.5, ey - 1.25, ex + 0.5, ey - 1.75, LEECH[1]); p.fline(ex - 3, ey - 1.75, ex, ey - 2.25, LEECH[5]);   // Brauenfalte
  } else if (P.glow > 0.1) {
    p.px(ex, ey, '#ff6a40'); p.px(ex - 1.5, ey + 0.3, '#c03020'); p.px(ex - 3, ey + 0.6, '#801c14');
    g.px(ex, ey, '#c03020'); g.px(ex - 1.5, ey + 0.3, '#601008');
  }
  meta.eye = { x: ex, y: ey };
  meta.mouth = { x: dx + ux, y: dy + uy };
  meta.hand = meta.mouth;
  meta.head = { x: h.x, y: h.y - h.r - 2 };
  // Schleimspur
  if (P.amp > 0 && P.curl === 0) {
    // fein: keine lose Schleimspur hinter dem Schwanz (las sich als abgerissener Strich)
    if (!p.fine) for (let i = 0; i < 4; i++) p.px(pts[0].x - 1 - i * 1.5, AY - 1, i % 2 ? SLIME[1] : SLIME[2]);
  }
  return meta;
}

function leechAnims() {
  const mk = (P, X) => makeFrame(LE, P, X);
  const T = (keys, n, o) => track(LE, keys, n, o);
  const idle = [];
  for (let i = 0; i < 6; i++) idle.push(mk(epose({ t: i / 6, amp: 0.35, head: Math.sin(i / 6 * TAU) * 0.25, rear: 0.12 + Math.sin(i / 6 * TAU) * 0.1, glow: i % 3 === 0 ? 1 : 0.5 })));
  const walk = [];
  for (let i = 0; i < 8; i++) walk.push(mk(epose({ t: i / 8, amp: 1, head: Math.sin(i / 8 * TAU) * 0.15, glow: i % 4 < 2 ? 1 : 0.5 }), { fx: i === 0 ? 'step' : null }));
  // Aufbäumen: Vorderleib hoch, Scheibe öffnet sich
  const w1 = epose({ rear: 0.6, open: 0.3, head: 0.2, amp: 0.2, t: 0.3 });
  const w2 = epose({ rear: 1, open: 0.8, head: -0.1, lunge: -1.5, glow: 1 });
  const windup = T([[0, epose({ rear: 0.12 })], [0.5, w1], [1, w2]], 4);
  // Vorschnellen: gestreckt, Scheibe weit offen, festsaugen
  const s1 = epose({ reach: 1, open: 1, lunge: 3, air: 2, head: 0.25 });
  const s2 = epose({ reach: 0.8, open: 1, lunge: 4, head: 0.1 });
  const s3 = epose({ reach: 0.3, open: 0.5, lunge: 2, amp: 0.5, t: 0.5 });
  const strike = [mk(s1), mk(s2, { fx: 'impact' }), mk(s3), mk(epose({ rear: 0.1, amp: 0.3, t: 0.8 }))];
  const hurt = [mk(epose({ rear: 0.5, head: -0.6, open: 0.6, lunge: -2, twitch: 1 })), mk(epose({ rear: 0.2, lunge: -1, twitch: 0.5 }))];
  const death = [
    mk(epose({ rear: 0.8, head: -0.7, open: 1, lunge: -2, twitch: 1 })),
    mk(epose({ rear: 0.3, curl: 0.4, open: 0.6, twitch: 1, glow: 0.8 })),
    mk(epose({ curl: 0.8, open: 0.3, shrivel: 0.2, glow: 0.6 }), { fx: 'impact' }),
    mk(epose({ curl: 1, shrivel: 0.35, glow: 0.4 })),
    mk(epose({ curl: 1, shrivel: 0.5, glow: 0.2 })),
    mk(epose({ curl: 1, shrivel: 0.55, glow: 0 })),
  ];
  return {
    idle: new Animation(idle, 6),
    walk: new Animation(walk, 12),
    windup: new Animation(windup, 9, false),
    strike: new Animation(strike, 12, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 8, false),
  };
}

// ================================================================ Pestkröte

// Massige Kröte mit Warzenhaut, eiternden Leuchtbeulen auf dem Rücken und
// einer Kehlblase. Spuckt Giftschleim (meta.hand = Maul) und bläht sich zur
// Giftwolke auf (Animation 'puff').
const TD = { W: 64, H: 50, AX: 28, AY: 42, pad: 14, rim: '#d0d0a0', back: '#8098a8', draw: drawToad, sinkH: 20 };
const TOAD = ['#0d0b06', '#1b190d', '#2c2a14', '#413e1d', '#5a5527', '#767032', '#968f40', '#b6ad56'];
const T_BELLY = ['#2e2a18', '#4e4828', '#72693c', '#978c52', '#bcb070'];
const T_REST = { puff: 0, sac: 0, air: 0, crouch: 0, headUp: 0, mouth: 0, eye: 1, legExt: 0, splat: 0, pust: 0.7, gas: 0, spit: 0, lean: 0, ph: 0 };
const tpose = (o = {}) => ({ ...T_REST, ...o });

function drawToad(p, g, P) {
  const { AX, AY } = TD;
  const meta = {};
  const k = 1 + P.puff * 0.32;
  const bx = AX - 2, by = AY - 1 - 8 * (1 + P.puff * 0.35) * (1 - P.splat * 0.45) - P.air + P.crouch;
  const rx = 10.5 * k * (1 + P.splat * 0.15), ry = 7.5 * (1 + P.puff * 0.42) * (1 - P.splat * 0.4);
  const lean = P.lean + P.headUp * 0.15;
  const near = TOAD, far = [TOAD[0], TOAD[1], TOAD[2], TOAD[3]];
  if (P.gas > 0.02) toadGas(p, g, bx, by, P.gas, 0);
  // --- hinteres Hinterbein (weit)
  const legs = (isNear) => {
    const hx = bx - 5 * k + (isNear ? 0 : -1), hy = by + ry * 0.35;
    const e = P.legExt;
    const R = isNear ? near : far;
    if (e < 0.05) { // gefaltet: dicker Schenkel, Fuß flach nach vorn
      ell(p, hx, hy + 0.5, 4.5, 3.6 * (1 - P.splat * 0.3), R, { noise: 0.15, seed: isNear ? 31 : 32 });
      const fy = AY - 1 - (isNear ? 0 : 1);
      cap(p, hx - 1, hy + 2.5, hx + 3, fy - 0.5, 1.8, 1.4, R);
      p.rect(hx + 2, fy, 5, 1, R[isNear ? 3 : 1]); p.px(hx + 7, fy, R[isNear ? 4 : 2]); p.px(hx + 6, fy - 1, R[isNear ? 3 : 1]);
      if (p.fine && isNear) { // Zehen: helle Kuppen, Kerben dazwischen; Glanz auf dem Schenkel
        for (const t of [3, 4.5, 6]) { p.dot(hx + t, fy + 0.5, R[1]); p.dot(hx + t + 0.5, fy, R[5]); }
        p.dot(hx + 7.5, fy, R[5]); shine(p, hx - 2.5, hy - 2, R[6], R[7], 2);
        wart(p, hx + 1, hy - 0.5, R[2], R[4], R[6]);
      }
    } else { // gestreckt nach hinten-unten (Sprung)
      const kx = hx - 3 - e * 3, ky = hy + 3 + e;
      const fx = hx - 4 - e * 5.5, fy = Math.min(AY - 1, hy + 5 + e * 4);
      cap(p, hx, hy, kx, ky, 3.6, 2.2, R);
      cap(p, kx, ky, fx, fy, 2, 1.2, R);
      p.line(fx, fy, fx - 3, fy + 0.5, R[isNear ? 3 : 1]); p.px(fx - 3, fy + 1, R[isNear ? 4 : 2]);
    }
  };
  legs(false);
  // Vorderbein hinten
  const arm = (isNear) => {
    const sx = bx + 6 * k + (isNear ? 0 : -2), sy = by + ry * 0.4;
    const fx = sx + 2 + P.splat * 4, fy = AY - 1 - (isNear ? 0 : 1) - P.air * 0.2;
    const R = isNear ? near : far;
    cap(p, sx, sy, fx, fy, 2, 1.4, R);
    for (let j = -1; j <= 1; j++) p.px(fx + 1 + j * 1.2 + (j > 0 ? 0.5 : 0), fy, R[isNear ? 4 : 2]);
    if (p.fine && isNear) { // Finger mit hellen Kuppen und Schatten unten
      for (let j = -1; j <= 1; j++) { const x = fx + 1 + j * 1.2 + (j > 0 ? 0.5 : 0); p.dot(x, fy, R[6]); p.dot(x + 0.5, fy + 0.5, R[1]); }
    }
  };
  arm(false);
  // --- Rumpf (mit Kopf verschmolzen, leicht nach vorn geneigt)
  ell(p, bx, by, rx, ry, near, { noise: 0.18, seed: 33, rot: -lean * 0.3 });
  // heller Bauch unten
  ell(p, bx + 2, by + ry * 0.55, rx * 0.75, ry * 0.38, T_BELLY, { bias: 0.05, clip: (x, y) => y > by + ry * 0.25 });
  // dunkle Flecken
  for (let i = 0; i < 6; i++) {
    const x = bx - rx * 0.7 + hash2(i, 7, 35) * rx * 1.3, y = by - ry * 0.1 + hash2(i, 8, 35) * ry * 0.4;
    ell(p, x, y, 1.6, 1, [TOAD[1], TOAD[2]]);
  }
  // Warzen
  for (let i = 0; i < 22; i++) {
    const a = hash2(i, 1, 35) * TAU, r = Math.sqrt(hash2(i, 2, 35)) * 0.85;
    const x = bx + Math.cos(a) * rx * r, y = by + Math.sin(a) * ry * r * 0.8 - 1;
    if (y > by + ry * 0.35) continue;
    if (p.fine) { // Warze: runder Buckel mit hellem Kern oben links, Schattensichel unten rechts
      const big = hash2(i, 4, 35) < 0.4, X0 = p.snap(x - 0.5), Y0 = p.snap(y - 1);
      if (big) {
        p.rect(X0 - 0.5, Y0, 1.5, 1, TOAD[5]); p.rect(X0, Y0 - 0.5, 1, 0.5, TOAD[6]);
        p.dot(X0 + 1, Y0 + 0.5, TOAD[2]); p.dot(X0 + 0.5, Y0 + 1, TOAD[1]); p.dot(X0, Y0 + 1, TOAD[2]);
        p.dot(X0, Y0, TOAD[7]);
      } else wart(p, X0, Y0, TOAD[2], TOAD[5], hash2(i, 3, 35) < 0.5 ? TOAD[6] : TOAD[7]);
      continue;
    }
    p.px(x, y, TOAD[1]); p.px(x - 0.5, y - 1, TOAD[hash2(i, 3, 35) < 0.5 ? 6 : 7]);
  }
  if (p.fine) { shine(p, bx - rx * 0.45, by - ry * 0.55, TOAD[6], '#e4dc90', 3); shine(p, bx + rx * 0.05, by - ry * 0.25, TOAD[6], TOAD[7], 2); }
  // Leuchtbeulen auf dem Rücken
  const pusts = [[-5, -0.6], [-1.5, -0.85], [2.5, -0.75], [-7.5, -0.2], [0.5, -0.45], [-3.5, -0.3]];
  pusts.forEach(([dx, dy], i) => {
    const x = bx + dx * k, y = by + dy * ry;
    const r = (i < 3 ? 1.5 : 1) * (1 + P.puff * 0.5);
    const hot = P.pust * (i < 3 ? 1 : 0.55) * (0.7 + 0.3 * Math.sin(P.ph * TAU + i * 1.7));
    ell(p, x, y, r + 0.4, r * 0.85 + 0.3, [TOAD[1], TOAD[3], TOAD[4]]);
    ell(p, x, y - 0.2, r, r * 0.8, hot > 0.3 ? [TOX[1], TOX[2], TOX[3], TOX[4], TOX[5]] : [TOAD[2], TOAD[3], SLIME[1]]);
    if (hot > 0.3) glowDot(g, x, y - 0.2, r * hot, GT);
    if (p.fine) { // Pustel: heißer Eiterkern, Glanzpunkt, gerissene Haut am Rand
      const X0 = p.snap(x - 0.25), Y0 = p.snap(y - 0.45);
      if (hot > 0.3) {
        p.rect(X0, Y0, r > 1.2 ? 1 : 0.5, 0.5, TOX[5]); p.dot(X0 - r * 0.5, Y0 - r * 0.35, '#ffffff');
        if (hot > 0.7) g.dot(X0, Y0, GT[4]);
      } else { p.dot(X0, Y0, SLIME[2]); p.dot(X0 - 0.5, Y0 - 0.5, TOAD[5]); }
      p.dot(x + r + 0.2, y, TOAD[1]); p.dot(x - r * 0.3, y + r * 0.85, TOAD[0]);
    }
  });
  // --- Kopf (vorn im Rumpf), Kehlblase, Maul
  const hx = bx + rx * 0.62, hy = by - ry * 0.12 - P.headUp * 1.5;
  ell(p, hx + 1, hy + 0.5, 6, 4.3 * (1 - P.splat * 0.3), near, { noise: 0.12, seed: 37, rot: -P.headUp * 0.3 });
  // Hautfalte zwischen Kopf und Leib
  for (let j = -3; j <= 3; j++) p.px(hx - 5 + Math.abs(j) * 0.35, hy + j, j < 0 ? TOAD[2] : TOAD[1]);
  if (p.fine) for (let j = -3; j <= 2.5; j += 0.5) p.dot(hx - 4.5 + Math.abs(j) * 0.35, hy + j, j < 0 ? TOAD[5] : TOAD[3]);   // Faltenkante im Licht
  const mo = P.mouth;
  // Kehlblase (fahl, durchscheinend)
  const sr = 1.2 + P.sac * 4.2;
  if (P.sac > 0.02) {
    ell(p, hx + 3, hy + 4 + sr * 0.4 + mo, sr * 1.05, sr * 0.8, [T_BELLY[1], T_BELLY[2], T_BELLY[3], T_BELLY[4], '#e0dca0'], { bias: 0.08 });
    if (P.sac > 0.5) { p.px(hx + 2, hy + 3 + sr * 0.2 + mo, '#f0f0c8'); g.px(hx + 3, hy + 4 + sr * 0.4 + mo, GT[0]); }
    if (p.fine) { // feine, verzweigte Adern auf der gespannten Blase, Glanzpunkt
      const cy = hy + 4 + sr * 0.4 + mo, cx = hx + 3;
      for (let j = 0; j < 3; j++) {
        const x0 = cx - sr * 0.6 + j * sr * 0.55, y0 = cy + sr * 0.55;
        p.fline(x0, y0, x0 + 0.5, y0 - sr * 0.45, T_BELLY[1]); p.fline(x0 + 0.5, y0 - sr * 0.45, x0 + 1.25, y0 - sr * 0.6, T_BELLY[1]);
      }
      p.dot(cx - sr * 0.45, cy - sr * 0.45, '#f8f8e0');
    } else for (let j = 0; j < 3; j++) p.px(hx + 1 + j * 2, hy + 4 + sr * 0.6 + mo, T_BELLY[1]); // Adern
  }
  // Maul: breite Spalte, beim Spucken aufgeklappt
  const mx0 = hx - 3, mx1 = hx + 7, my = hy + 2;
  if (mo > 0.15) {
    poly(p, [[mx0, my], [mx1, my - 1 - P.headUp], [mx1 - 1, my + mo * 3.5], [mx0 + 1, my + mo * 1.5]], '#3a0e0c');
    p.line(mx0 + 2, my + mo * 1.5, mx1 - 1, my + mo * 3.2, T_BELLY[2]);   // Unterkiefer-Lippe
    p.line(mx0 + 3, my + 1, mx1 - 2, my + mo * 2, '#8a2a28');            // Zunge
    if (p.fine) { // Schleimfäden spannen sich zwischen den Kiefern, Tropfen mit hellem Kern; Zungenglanz
      for (let x = mx0 + 2; x < mx1; x += 2) {
        const yt = my + 0.25 - (x - mx0) / (mx1 - mx0) * (1 + P.headUp), yb = my + mo * (1.5 + (x - mx0) / (mx1 - mx0) * 1.8) - 0.5;
        p.fline(x, yt, x + 0.25, yb, TOX[2]); p.dot(x + 0.25, (yt + yb) / 2 + 0.5, TOX[4]);
      }
      p.fline(mx0 + 3, my + 0.5, mx0 + 5, my + 0.5 + mo * 0.4, '#c05048');
      p.dot(mx0 + 0.5, my, '#140404');
    } else for (let x = mx0 + 2; x < mx1; x += 2) p.px(x, my + 0.5 + (x - mx0) * mo * 0.18, TOX[3]); // Schleimfäden
  } else {
    p.line(mx0, my, mx1, my - 1 - P.headUp, TOAD[0]); p.line(mx0 + 1, my - 1, mx1 - 1, my - 2 - P.headUp, TOAD[5]);
    if (p.fine) { // Lippenwulst mit Glanzlinie, Mundwinkel als Kerbe
      p.fline(mx0 + 1.5, my - 1, mx1 - 2, my - 2 - P.headUp, TOAD[7]);
      p.dot(mx0 - 0.5, my + 0.5, TOAD[0]); p.dot(mx0, my + 0.5, TOAD[1]); p.dot(mx1 + 0.5, my - 1 - P.headUp, TOAD[1]);
    }
  }
  meta.mouth = { x: mx1 + 1, y: my - 0.5 + mo };
  meta.hand = meta.mouth;
  // Glotzauge + Ohrdrüse
  const ex = hx + 1, ey = hy - 3.8 * (1 - P.splat * 0.3);
  ell(p, ex - 5, ey + 1.5, 2.6, 1.6, near, { seed: 39 });    // Drüse
  p.px(ex - 6, ey + 1, TOX[2]); g.px(ex - 6, ey + 1, GT[1]); p.px(ex - 4, ey + 1.5, TOX[2]);
  if (p.fine) { // Drüsenporen mit glühendem Kern
    p.dot(ex - 6, ey + 1, TOX[4]); p.dot(ex - 4, ey + 1.5, TOX[3]); g.dot(ex - 6, ey + 1, GT[3]);
    p.dot(ex - 5, ey + 0.5, TOAD[1]); p.dot(ex - 6.5, ey + 0.5, TOAD[6]);
  }
  ell(p, ex, ey, 2.7, 2.4, [TOAD[2], TOAD[4], TOAD[5], TOAD[6], TOAD[7]]);
  const eOn = P.eye > 0.3;
  if (eOn && p.fine) {
    // goldene Iris rund mit dunklem Rand, waagerechte Schlitzpupille (1 Feinpixel), Glanzpunkt oben links
    p.ellipse(ex + 0.25, ey + 0.25, 1.75, 1.6, '#5a2a06');
    p.ellipse(ex + 0.25, ey + 0.25, 1.4, 1.3, '#8a4a0a');
    p.ellipse(ex, ey, 1, 0.9, '#e89a18'); p.dot(ex - 0.5, ey - 0.5, '#ffd060');
    p.fline(ex - 1, ey + 0.25, ex + 1.5, ey + 0.25, '#140a04'); p.dot(ex + 0.5, ey + 0.75, '#3a1a04');
    p.dot(ex - 0.75, ey - 0.75, '#ffffff'); p.dot(ex + 1, ey + 0.75, '#ffe080');
    g.ellipse(ex, ey - 0.25, 1, 0.75, '#6a3a04'); g.dot(ex - 0.5, ey - 0.5, '#a05a08');
  } else if (eOn) {
    // goldene Iris mit dunklem Rand, waagerechte Pupille, Glanzpunkt
    p.rect(ex - 1, ey - 1, 3, 3, '#8a4a0a');
    p.rect(ex - 0.5, ey - 1, 2, 2, '#e89a18'); p.px(ex - 1, ey - 1, '#ffe080');
    p.line(ex - 1, ey + 0.5, ex + 1.5, ey + 0.5, '#140a04');
    g.px(ex, ey - 0.5, '#a05a08'); g.px(ex + 1, ey - 0.5, '#6a3a04');
  } else p.line(ex - 1, ey + 0.5, ex + 1.5, ey + 0.5, TOAD[1]);
  // schwerer Augenwulst: helle Oberkante, Schatten darunter
  p.line(ex - 2, ey - 2.5, ex + 1.5, ey - 2.8, TOAD[7]); p.px(ex + 2.5, ey - 2, TOAD[5]);
  p.px(ex - 2.5, ey + 1.5, TOAD[1]); p.px(ex + 2.6, ey + 1, TOAD[1]);
  if (p.fine) p.fline(ex - 2, ey - 2, ex + 1.5, ey - 2.25, TOAD[5]);   // Lidkante unter dem Wulst
  meta.eye = { x: ex, y: ey };
  meta.head = { x: ex, y: ey - 4 };
  // --- nahe Beine
  legs(true);
  arm(true);
  // --- Giftspucke am Maul
  if (P.spit > 0.05) {
    const sx = meta.mouth.x + 1 + P.spit * 3, sy = meta.mouth.y;
    ell(p, sx, sy, 1.6 + P.spit, 1.3 + P.spit * 0.6, [TOX[1], TOX[2], TOX[3], TOX[4], TOX[5]]);
    glowDot(g, sx, sy, 1.5 + P.spit, GT);
    p.line(meta.mouth.x - 1, meta.mouth.y, sx, sy, TOX[2]);
    if (p.fine) { // Schleimballen: heißer Kern, Glanz, abreißende Tröpfchen
      p.rect(p.snap(sx - 0.25), p.snap(sy - 0.25), 1, 0.5, TOX[5]); p.dot(sx - 1, sy - 0.75, '#ffffff');
      p.fline(meta.mouth.x - 0.5, meta.mouth.y - 0.5, sx - 1, sy - 0.5, TOX[4]);
      p.dot(sx - 2, sy + 1.5, TOX[3]); p.dot(sx + 1.5 + P.spit, sy + 1, TOX[2]); g.dot(sx, sy, GT[4]);
    }
  }
  // --- Giftwolke (vordere Hälfte der Ballen)
  if (P.gas > 0.02) toadGas(p, g, bx, by, P.gas, 1);
  return meta;
}

// Faulgas quillt aus den Beulen: Ballen um den Körper, nach oben treibend.
// layer 0 = hinter der Kröte, 1 = davor.
function toadGas(p, g, bx, by, gas, layer) {
  const G2 = ['#1a2410', '#34421c', '#4e6426', '#728c34', '#9cb450'];
  for (let i = 0; i < 16; i++) {
    if ((i & 1) !== layer) continue;
    const a = -Math.PI * (0.05 + 0.9 * hash2(i, 1, 43)) + (i % 5 === 0 ? Math.PI * 0.9 : 0);
    const d = (3 + gas * 15) * (0.45 + hash2(i, 2, 43) * 0.7);
    const x = bx + Math.cos(a) * d * 1.4, y = Math.min(by + 6, by - 1 + Math.sin(a) * d * 0.7 - gas * 3);
    const r = (2.2 + gas * 3 + hash2(i, 3, 43) * 2) * (gas > 0.75 ? 1 - (gas - 0.75) * 1.4 : 1);
    gasPuff(p, g, x, y, r, 1.1 - gas * 0.45, 200 + i, G2, GT);
  }
}

function toadAnims() {
  const mk = (P, X) => makeFrame(TD, P, X);
  const T = (keys, n, o) => track(TD, keys, n, o);
  // Ruhe: Kehlblase pumpt, Beulen pulsieren, Blinzeln
  const idle = [];
  for (let i = 0; i < 6; i++) idle.push(mk(tpose({ sac: [0.1, 0.4, 0.7, 0.45, 0.15, 0][i], ph: i / 6, crouch: i === 2 ? 0.5 : 0, eye: i === 4 ? 0 : 1 })));
  // Hüpfen: ducken, abstoßen, flug, landen
  const walk = [
    mk(tpose({ crouch: 1.2, ph: 0 }), { fx: 'step' }),
    mk(tpose({ legExt: 0.7, air: 3, lean: -0.1, headUp: 0.3, ph: 0.15 })),
    mk(tpose({ legExt: 1, air: 5, lean: -0.05, headUp: 0.2, ph: 0.3 })),
    mk(tpose({ legExt: 0.5, air: 3, lean: 0.1, ph: 0.45 })),
    mk(tpose({ crouch: 1.5, ph: 0.6 }), { fx: 'step' }),
    mk(tpose({ crouch: 0.4, ph: 0.8, sac: 0.3 })),
  ];
  // Spucken: Kopf hoch, Kehlblase füllen, Maul auf, Schleim schießt heraus
  const w1 = tpose({ headUp: 0.5, sac: 0.6, crouch: 0.6, pust: 0.9 });
  const w2 = tpose({ headUp: 1, sac: 1, crouch: 1, pust: 1, lean: -0.1 });
  const windup = T([[0, tpose()], [0.5, w1], [1, w2]], 4);
  const strike = [
    mk(tpose({ headUp: 0.4, mouth: 1, sac: 0.2, spit: 1, lean: 0.15 }), { fx: 'cast' }),
    mk(tpose({ headUp: 0.2, mouth: 0.8, sac: 0.1, spit: 0.3, lean: 0.1 })),
    mk(tpose({ mouth: 0.3, lean: 0.05 })),
    mk(tpose()),
  ];
  // Aufblähen zur Giftwolke: pumpt sich auf, Beulen glühen, entlädt alles auf einmal
  const puff = T([
    [0, tpose()],
    [0.18, tpose({ crouch: 0.8, sac: 1, pust: 1 })],
    [0.5, tpose({ puff: 0.7, sac: 0.8, pust: 1.3, eye: 1, headUp: 0.3, ph: 0.5 })],
    [0.7, tpose({ puff: 1, sac: 1, pust: 1.6, headUp: 0.4, ph: 0.8 })],
    [0.78, tpose({ puff: 0.2, mouth: 0.7, crouch: 1, pust: 0.3, gas: 0.25 }), snap],
    [1, tpose({ puff: 0, mouth: 0.3, crouch: 0.5, pust: 0.2, gas: 1 })],
  ], 12, { extras: { 9: { fx: 'impact' } } });
  const hurt = [mk(tpose({ crouch: 1.5, headUp: -0.4, mouth: 0.4, eye: 0, lean: -0.2, pust: 1.2 })), mk(tpose({ crouch: 0.6, pust: 0.9 }))];
  const death = [
    mk(tpose({ crouch: 1.5, headUp: 0.6, mouth: 0.8, pust: 1.5, puff: 0.3 })),
    mk(tpose({ puff: 0.1, mouth: 0.6, pust: 0.4, gas: 0.3, splat: 0.3 }), { fx: 'impact' }),
    mk(tpose({ mouth: 0.5, pust: 0.2, gas: 0.6, splat: 0.6, eye: 0 })),
    mk(tpose({ mouth: 0.4, pust: 0.1, gas: 0.85, splat: 0.9, eye: 0 })),
    mk(tpose({ mouth: 0.4, pust: 0, splat: 1, eye: 0 })),
  ];
  return {
    idle: new Animation(idle, 5),
    walk: new Animation(walk, 10),
    windup: new Animation(windup, 6, false),
    strike: new Animation(strike, 10, false),
    puff: new Animation(puff, 10, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 8, false),
  };
}


// ================================================================ Das Moorgrauen (Elite)

// Ein Ungetüm aus Schlamm, Wurzeln und Knochen: gebuckelter Leib, Beine wie
// Schlammsäulen, lange Wurzelarme mit Krallenfingern. Vorn hängt ein
// Elchschädel mit Wurzelgeweih, im offenen Brustkorb glimmt ein gefangenes
// Irrlicht (Herz). Moosbärte, Leuchtpilze, alte Speere im Rücken.
const BH = { W: 132, H: 112, AX: 58, AY: 100, pad: 18, rim: '#c8dcb0', back: '#88a0b8', rimK: 0.45, backK: 0.32, sinkH: 64, draw: drawHorror };
const BD = { legH: 23, thigh: 12, shin: 12.5, spine: 24, upper: 16, fore: 17, sh: 9, hipW: 5 };
const H_MUD = ['#0a0907', '#15130d', '#211e14', '#2f2a1c', '#3f3926', '#534b31', '#6a6040'];
const H_GLOSS = '#9a9268';
// Feinraster: harte Stufen (dunkel, mittel, hell, Kante oben links) statt sanfter Rampe
const HF_NEAR = ['#211e14', '#2f2a1c', '#2f2a1c', '#3f3926', '#3f3926', '#6a6040'];
const HF_FAR = ['#0f0d09', '#18150f', '#18150f', '#221e15', '#221e15', '#3a3424'];
const HF_ARM = ['#211e14', '#2f2a1c', '#3f3926', '#3f3926', '#534b31', '#857a52'];
const HF_CLUMP = ['#2f2a1c', '#3f3926', '#534b31', '#7a6e48'];
const HF_CLUMP_D = ['#15130d', '#211e14', '#2f2a1c', '#3f3926'];

// Feine Schlammbrocken und Moosbüschel an einem Glied (an Achse und Radius gebunden): Klumpen stehen über den
// Umriss hinaus (Lichtseite hell, Schattenseite dunkel), Moos sitzt in Büscheln auf der Lichtseite.
function limbDeco(p, x0, y0, x1, y1, r0, r1, seed, far) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, tx = dx / L, ty = dy / L;
  let nx = -ty, ny = tx;
  if (nx * LX + ny * LY < 0) { nx = -nx; ny = -ny; }
  for (let i = 0; i < 3; i++) {
    const t = 0.2 + 0.3 * i + (hash2(i, seed, 77) - 0.5) * 0.16, r = r0 + (r1 - r0) * t, side = i === 1 ? -1 : 1;
    const cr = 1 + hash2(i, seed, 78) * 0.9, cx = x0 + dx * t + nx * side * (r - 0.1), cy = y0 + dy * t + ny * side * (r - 0.1);
    ell(p, cx, cy, cr, cr * 0.85, far ? HF_CLUMP_D : side > 0 ? HF_CLUMP : HF_CLUMP_D);
    if (side > 0) p.dot(cx - cr * 0.45, cy - cr * 0.5, far ? HF_CLUMP[1] : '#8a7e54');
    else p.dot(cx + cr * 0.3, cy + cr * 0.6, '#0a0907');
  }
  for (let i = 0; i < 2; i++) {
    const t = 0.32 + 0.38 * i + (hash2(i, seed, 79) - 0.5) * 0.12, r = r0 + (r1 - r0) * t;
    mossClump(p, x0 + dx * t + nx * r * 0.62, y0 + dy * t + ny * r * 0.62, seed * 3 + i, far);
  }
}
// Moosbüschel aus Feinpixeln: dunkler Fuß, mittlere Mitte, heller Kamm oben links
function mossClump(p, x, y, seed, far) {
  x = p.snap(x); y = p.snap(y);
  const C = far ? [MOSS[1], MOSS[2], MOSS[3]] : [MOSS[2], MOSS[4], MOSS[6]];
  const pts = [[-0.5, 0.5, 0], [0, 0.5, 0], [0.5, 0.5, 0], [1, 0.5, 0], [-0.5, 0, 1], [0, 0, 1], [0.5, 0, 1], [0, -0.5, 2], [0.5, -0.5, 1], [-0.5, -0.5, 2]];
  for (let k = 0; k < pts.length; k++) {
    const [ox, oy, c] = pts[k];
    if (k > 3 && hash2(k, seed, 76) > 0.8) continue;
    p.dot(x + ox, y + oy, C[c]);
  }
}
const H_MUD_D = ['#070605', '#0f0d09', '#18150f', '#221e15', '#2e291d'];
const B_REST = {
  hipX: 0, hipY: 0, lean: 0.55, head: 0, headY: 0, headA: 0.15, jaw: 0.1,
  fFx: 9, fFy: 0, fBx: -9, fBy: 0, hFx: 17, hFy: 40, hBx: 8, hBy: 40,
  heart: 1, ribs: 0, ph: 0, dr: 0, gas: 0, splash: 0, eye: 1, kneel: 0,
};
const bpose = (o = {}) => ({ ...B_REST, ...o });

function horrorRig(P) {
  const AX = BH.AX - 6, AY = BH.AY, D = BD;   // Leib etwas hinter dem Anker, der Kopf ragt vor
  const hip = { x: AX + P.hipX, y: AY - D.legH + P.hipY + P.kneel * 7 };
  const sL = Math.sin(P.lean), cL = Math.cos(P.lean);
  const pt = (u, k) => ({ x: hip.x + sL * u + cL * k, y: hip.y - cL * u + sL * k });
  const chest = pt(D.spine, 0);
  const fF = { x: AX + P.fFx, y: AY - 1 - P.fFy }, fB = { x: AX + P.fBx, y: AY - 1 - P.fBy };
  const legF = ik(hip.x + D.hipW, hip.y, fF.x, fF.y, D.thigh, D.shin, -1);
  const legB = ik(hip.x - D.hipW, hip.y, fB.x, fB.y, D.thigh, D.shin, -1);
  if (P.kneel > 0.01) { // hinteres Knie sinkt in den Schlamm
    const kx = hip.x - 4, ky = AY - 2;
    legB.jx += (kx - legB.jx) * P.kneel; legB.jy += (ky - legB.jy) * P.kneel;
    legB.ex += (kx - 9 - legB.ex) * P.kneel; legB.ey += (AY - 1 - legB.ey) * P.kneel;
  }
  const shF = pt(D.spine - 2, D.sh * 0.35), shB = pt(D.spine - 1, -D.sh * 0.6);
  const hF = { x: chest.x + P.hFx, y: Math.min(AY - 1, chest.y + P.hFy) }, hB = { x: chest.x + P.hBx, y: Math.min(AY - 2, chest.y + P.hBy) };
  const armF = ik(shF.x, shF.y, hF.x, hF.y, D.upper, D.fore, 1);
  const armB = ik(shB.x, shB.y, hB.x, hB.y, D.upper, D.fore, 1);
  return { hip, chest, pt, legF, legB, shF, shB, armF, armB };
}

// Wurzelhand: 4 Krallenfinger, spreizen mit open.
function rootHand(p, x, y, a, open, R, near) {
  ell(p, x, y, 3.2, 2.8, R, { noise: 0.2, seed: near ? 51 : 52 });
  for (let k = 0; k < 4; k++) {
    const aa = a + (k - 1.5) * (0.32 + open * 0.3);
    const pts = root(x + Math.cos(aa) * 2, y + Math.sin(aa) * 2, aa, 0.18 - open * 0.1, 3, 1.9);
    chain(p, pts, 1.3, 0.6, [ROOT[1], ROOT[2], ROOT[3], ROOT[4]]);
    const t = pts[pts.length - 1];
    if (p.fine) { // Wurzelfinger mit Lichtkante, Knöchelkerbe und Knochenkralle
      if (near) edge(p, pts, 1.3, 0.6, ROOT[5], 0.55);
      p.dot(pts[1][0], pts[1][1], ROOT[0]);
      spike(p, t[0], t[1], t[0] + Math.cos(aa + 0.4) * 1.5, t[1] + Math.sin(aa + 0.4) * 1.5, near ? BONE[3] : BONE[1], near ? BONE[5] : BONE[2], near ? BONE[4] : BONE[2]);
      continue;
    }
    p.px(t[0] + Math.cos(aa + 0.4), t[1] + Math.sin(aa + 0.4), near ? BONE[4] : BONE[2]);
  }
}

// Wurzelgeweih: Hauptstange mit zwei Sprossen.
function antler(p, x, y, a, c, n, near, ph) {
  const R = near ? [ROOT[3], ROOT[4], BONE[2], BONE[3], BONE[4]] : [ROOT[1], ROOT[2], ROOT[3], ROOT[4]];
  const pts = root(x, y, a, c, n, 2.6, 0.05, ph);
  chain(p, pts, 2, 0.8, R);
  if (p.fine) edge(p, pts, 2, 0.8, near ? BONE[5] : ROOT[5], 0.5);
  for (const [i, da, m] of [[2, 1.05, 3], [4, 0.9, 3], [5, -0.85, 2]]) {
    if (i >= pts.length - 1) continue;
    const b = pts[i], a0 = Math.atan2(pts[i + 1][1] - b[1], pts[i + 1][0] - b[0]);
    const q = root(b[0], b[1], a0 + da, -da * 0.12, m, 2.4);
    chain(p, q, 1.3, 0.6, R);
    const t = q[q.length - 1]; p.px(t[0], t[1], near ? BONE[3] : BONE[1]);
    if (p.fine) { // Spross: Lichtkante, Gelenkkerbe an der Gabel, helle Spitze
      edge(p, q, 1.3, 0.6, near ? BONE[5] : ROOT[5], 0.5);
      p.dot(b[0] + Math.cos(a0 + da) * 1.2, b[1] + Math.sin(a0 + da) * 1.2 + 0.5, near ? ROOT[1] : ROOT[0]);
      p.dot(t[0], t[1], near ? BONE[5] : BONE[2]);
    }
  }
  const t = pts[pts.length - 1]; p.px(t[0], t[1], near ? BONE[4] : BONE[2]);
  if (p.fine) { // Ringkerben am Hauptstamm, glänzende Spitze
    for (const i of [1, 3, 6]) if (i < pts.length - 1) { p.dot(pts[i][0], pts[i][1], near ? ROOT[2] : ROOT[0]); p.dot(pts[i][0] + 0.5, pts[i][1], near ? ROOT[3] : ROOT[1]); }
    p.dot(t[0], t[1], near ? BONE[5] : BONE[3]);
  }
}

// Schlammspritzer am Boden (Einschlag). k 0..1
const SPL = ['#2a2618', '#4a4430', '#6e6648', '#948a62', '#bab288'];
function mudSplash(p, g, x, y, k, big) {
  if (k <= 0.02) return;
  const n = big ? 22 : 12;
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (i / (n - 1)) * Math.PI + (hash2(i, 1, 61) - 0.5) * 0.3;
    const d = (big ? 20 : 11) * k * (0.5 + hash2(i, 2, 61) * 0.6);
    const hgt = (big ? 14 : 8) * Math.sin(k * Math.PI * 0.9) * hash2(i, 3, 61);
    const px = x + Math.cos(a) * d * 1.3, py = y + Math.sin(a) * d * 0.35 - hgt;
    const r = (big ? 1.8 : 1.2) * (1.1 - k * 0.5) + hash2(i, 4, 61);
    ell(p, px, py, r, r * 0.9, SPL);
    if (p.fine) { p.dot(px - r * 0.45, py - r * 0.45, '#e4dcb0'); p.dot(px + r * 0.4, py + r * 0.5, SPL[0]); }
    if (hash2(i, 5, 61) < 0.3) { p.px(px, py - r, TOX[3]); g.px(px, py - r, GT[1]); if (p.fine) { p.dot(px, py - r, TOX[5]); g.dot(px, py - r, GT[3]); } }
  }
  ell(p, x, y, (big ? 16 : 9) * Math.min(1, k * 1.5), 2.2, [MUD[2], MUD[3], MUD[4], MUD[5]]);
  // Schlammfontäne am Einschlag
  if (k < 0.8) for (let j = 0; j < (big ? 7 : 4); j++) {
    const h = (big ? 16 : 9) * Math.sin(k * Math.PI) * (0.5 + hash2(j, 9, 61) * 0.6);
    const dj = j - (big ? 3 : 1.5);
    const xx = x + dj * (1.5 + k * 4), yy = y - 2 - h;
    ell(p, xx, yy, 1.8 - k, 1.6 - k * 0.8, SPL);
    ell(p, xx - dj * 0.8, yy + 2.5, 1.1, 1, SPL);
    p.px(xx + dj * 0.6, yy - 2, SPL[3]);
    if (p.fine) { p.dot(xx - 0.5, yy - 0.5, '#e4dcb0'); p.dot(xx + dj * 0.6, yy - 2, SPL[4]); p.fline(xx - dj * 0.8, yy + 1.5, xx - dj * 0.4, yy + 0.5, SPL[2]); }
  }
}

function drawHorror(p, g, P, X) {
  const R = horrorRig(P);
  const { hip, chest, pt, legF, legB, shF, shB, armF, armB } = R;
  const { AY } = BH;
  const meta = {};
  // fein: harte 4-Stufen-Rampen mit heller Kante oben links, knollige Umrisse (lump)
  const FN = p.fine, LMP = FN ? 0.9 : 0;
  const far = FN ? HF_FAR : H_MUD_D, near = FN ? HF_NEAR : H_MUD;
  const E = WISP;

  // --- hinterer Arm
  cap(p, shB.x, shB.y, armB.jx, armB.jy, 5.2, 4.4, far, { noise: 0.2, seed: 53, lump: LMP });
  cap(p, armB.jx, armB.jy, armB.ex, armB.ey, 4.4, 3.4, far, { noise: 0.2, seed: 54, lump: LMP });
  if (FN) { limbDeco(p, shB.x, shB.y, armB.jx, armB.jy, 5.2, 4.4, 53, true); limbDeco(p, armB.jx, armB.jy, armB.ex, armB.ey, 4.4, 3.4, 54, true); }
  rootHand(p, armB.ex, armB.ey, Math.atan2(armB.ey - armB.jy, armB.ex - armB.jx) * 0.6 + 0.3, P.splash, far, false);
  // --- hinteres Bein
  cap(p, hip.x - 3, hip.y, legB.jx, legB.jy, 7, 6, far, { noise: 0.2, seed: 55, lump: LMP });
  cap(p, legB.jx, legB.jy, legB.ex, legB.ey - 1, 6, 6.5, far, { noise: 0.2, seed: 56, lump: LMP });
  if (FN) { limbDeco(p, hip.x - 3, hip.y, legB.jx, legB.jy, 7, 6, 55, true); limbDeco(p, legB.jx, legB.jy, legB.ex, legB.ey - 1, 6, 6.5, 56, true); }
  for (let k = -1; k <= 2; k++) {
    if (p.fine) { p.fline(legB.ex + k * 1.5, legB.ey - 2, legB.ex + k * 3 - 1, AY - 1, ROOT[1], 1); p.fline(legB.ex + k * 1.5 - 0.5, legB.ey - 2, legB.ex + k * 3 - 1.5, AY - 1, ROOT[2]); continue; }
    p.line(legB.ex + k * 1.5, legB.ey - 2, legB.ex + k * 3 - 1, AY - 1, ROOT[1]);
  }

  // --- Moosbärte hinten am Buckel
  const back = pt(BD.spine + 2, -9);
  for (let i = 0; i < 7; i++) {
    const len = 12 + (hash2(i, 1, 57) * 9 | 0);
    if (p.fine) { // Moosbart in Strähnen: helle Lichtsträhne links, dunkle Kernsträhne, dünne Spitzen
      for (let j = 0; j < len; j += 0.5) {
        const v = j / len, x = back.x - 2 - i * 1.3 + Math.sin(P.ph + v * 4 + i) * 1.2 * v - v * 3, y = back.y + i * 1.5 + j;
        const J = j | 0, knot = (i + J) % 5 === 0;
        p.dot(x, y, knot ? MOSS[1] : MOSS[2 + (i & 1)]);
        if (v < 0.8) p.dot(x - 0.5, y, knot ? MOSS[2] : MOSS[4 + (i & 1)]);
        if (v < 0.55) p.dot(x + 0.5, y, MOSS[1]);
        if (v > 0.6 && (i & 1)) p.dot(x + 0.75 + v, y - 0.5, MOSS[2]);
      }
      continue;
    }
    for (let j = 0; j < len; j++) {
      const v = j / len;
      p.px(back.x - 2 - i * 1.3 + Math.sin(P.ph + v * 4 + i) * 1.2 * v - v * 3, back.y + i * 1.5 + j, (i + j) % 5 === 0 ? MOSS[1] : MOSS[2 + (i & 1)]);
    }
  }
  // alte Speere / Pfähle im Rücken (Silhouette)
  const sp1 = pt(BD.spine - 3, -11), sp2 = pt(BD.spine + 4, -10);
  p.line(sp1.x + 1, sp1.y + 1, sp1.x - 12, sp1.y - 12, ROOT[3]); p.line(sp1.x, sp1.y + 1, sp1.x - 12, sp1.y - 11, ROOT[1]);
  p.line(sp1.x - 12, sp1.y - 12, sp1.x - 14, sp1.y - 15, PAL.rust[2]); p.px(sp1.x - 15, sp1.y - 16, PAL.rust[3]);
  p.line(sp2.x, sp2.y, sp2.x - 5, sp2.y - 13, ROOT[2]); p.px(sp2.x - 5, sp2.y - 14, BONE[3]);
  if (p.fine) { // Schaft: Lichtkante, Wicklung; rostige Spitze mit Glanzlinie und Scharte; Knochenspitze mit Riss
    p.fline(sp1.x, sp1.y, sp1.x - 11.5, sp1.y - 12, ROOT[5]);
    for (const t of [0.72, 0.78]) p.fline(sp1.x - 13 * t - 0.5, sp1.y - 13 * t + 0.5, sp1.x - 13 * t + 0.5, sp1.y - 13 * t - 0.5, RAG[4]);
    p.fline(sp1.x - 12.5, sp1.y - 12.5, sp1.x - 14.5, sp1.y - 15.5, PAL.rust[3]); p.dot(sp1.x - 13, sp1.y - 13.5, '#d8a070');
    p.dot(sp1.x - 15, sp1.y - 16, '#e8b888'); p.dot(sp1.x - 12, sp1.y - 13, PAL.rust[1]); p.dot(sp1.x - 13.5, sp1.y - 13.5, PAL.rust[1]);
    p.fline(sp2.x - 0.5, sp2.y, sp2.x - 5.5, sp2.y - 13, ROOT[4]);
    p.dot(sp2.x - 5.5, sp2.y - 14.5, BONE[5]); p.dot(sp2.x - 5, sp2.y - 13.5, BONE[1]);
  }

  // --- Leib: Hüftmasse, Rumpf, Buckel
  ell(p, hip.x, hip.y, 13, 11, near, { noise: 0.22, seed: 58, lump: LMP });
  cap(p, hip.x, hip.y, chest.x, chest.y, 13, 15.5, near, { noise: 0.22, seed: 59, lump: LMP });
  const hump = pt(BD.spine - 1, -6);
  ell(p, hump.x, hump.y, 17, 12.5, near, { noise: 0.25, seed: 60, rot: P.lean * 0.6, lump: LMP });
  if (FN) limbDeco(p, hip.x, hip.y, chest.x, chest.y, 13, 15.5, 59, false);
  // Wurzeln quer über den Leib
  for (let i = 0; i < 4; i++) {
    const a = pt(2 + i * 4.5, -9 + (i & 1) * 2), b = pt(5 + i * 4, 8 - (i & 1) * 3);
    const pts = root(a.x, a.y, Math.atan2(b.y - a.y, b.x - a.x) - 0.3, 0.12, 6, Math.hypot(b.x - a.x, b.y - a.y) / 6, 0.1, i);
    chain(p, pts, 1.3, 0.9, [ROOT[1], ROOT[2], ROOT[3], ROOT[4]]);
    if (p.fine) { edge(p, pts, 1.3, 0.9, ROOT[5], 0.55); for (let j = 1; j < pts.length - 1; j += 2) p.dot(pts[j][0], pts[j][1] + 0.5, ROOT[0]); }
  }
  // Schlammklumpen und Knochensplitter im Leib
  for (let i = 0; i < 10; i++) {
    const q = pt(hash2(i, 1, 62) * BD.spine, (hash2(i, 2, 62) - 0.6) * 20);
    if (hash2(i, 3, 62) < 0.5) {
      ell(p, q.x, q.y, 1.8, 1.3, [H_MUD[2], H_MUD[3], H_MUD[5]]);
      if (p.fine) { p.dot(q.x - 0.75, q.y - 0.75, H_MUD[6]); p.dot(q.x + 0.75, q.y + 1, H_MUD[1]); p.dot(q.x + 0.25, q.y + 1, H_MUD[1]); }
    } else if (p.fine) { // Knochensplitter: Keil mit Lichtkante, Riss, Bruchkante
      spike(p, q.x, q.y, q.x + 2.5, q.y - 1.25, BONE[2], BONE[4], BONE[5]); p.dot(q.x + 1, q.y - 0.5, BONE[0]); p.dot(q.x - 0.5, q.y + 0.5, BONE[1]);
    } else { p.line(q.x, q.y, q.x + 2, q.y - 1, BONE[2]); p.px(q.x + 2, q.y - 1, BONE[4]); }
  }
  if (p.fine) { // nasser Schlamm: Glanzpunkte oben links auf Buckel, Hüfte und Brust
    shine(p, hump.x - 9, hump.y + 1, H_MUD[5], H_GLOSS, 3); shine(p, hip.x - 8, hip.y - 3, H_MUD[5], H_MUD[6], 3);
    const c = pt(BD.spine - 8, -2); shine(p, c.x - 4, c.y, H_MUD[5], H_MUD[6], 2);
  }
  // --- offener Brustkorb mit Irrlicht-Herz
  const rc = pt(BD.spine - 14, 10.5);
  const rr = 6.5 + P.ribs * 1.5;
  ell(p, rc.x, rc.y, rr + 1, rr, ['#030403', '#08100c', '#0c1812', '#12241a']);
  const hb = P.heart * (0.85 + P.ribs * 0.5);
  if (hb > 0.05) {
    glowDot(g, rc.x, rc.y + 0.5, 1.8 + hb * 2, E);
    ell(p, rc.x, rc.y + 0.5, 2 + hb * 0.7, 1.8 + hb * 0.7, [E[1], E[2], E[3], E[4]], { bias: 0.1 });
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + P.ph; p.px(rc.x + Math.cos(a) * (3.5 + hb), rc.y + Math.sin(a) * (3 + hb), E[2]); g.px(rc.x + Math.cos(a) * (3.5 + hb), rc.y + Math.sin(a) * (3 + hb), E[1]); }
    if (p.fine) { // Irrlicht-Herz: weißglühender Kern, Glanz, Funken mit hellem Kern
      const cr = 0.6 + hb * 0.35;
      p.ellipse(rc.x - 0.25, rc.y + 0.25, cr, cr * 0.9, E[4]); p.dot(rc.x - cr - 0.5, rc.y - cr, '#ffffff');
      g.ellipse(rc.x - 0.25, rc.y + 0.25, cr, cr * 0.9, E[4]);
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + P.ph, x = rc.x + Math.cos(a) * (3.5 + hb), y = rc.y + Math.sin(a) * (3 + hb); p.dot(x, y, E[4]); g.dot(x, y, E[3]); }
    }
  }
  occlude(p.fine ? null : g);   // fein: Rippen verdecken das Herzlicht nicht (deckende Brustrune statt Strichen)
  for (let i = 0; i < 5; i++) { // Rippen: Bögen vom Rückgrat nach vorn, verdecken das Licht
    const yy = rc.y - rr * 0.85 + i * rr * 0.4;
    const pts = [];
    for (let s2 = 0; s2 <= 6; s2++) {
      const a = -Math.PI * 0.6 + s2 / 6 * Math.PI * 1.0;
      pts.push([rc.x + Math.cos(a) * (rr + 1 + P.ribs), yy + Math.sin(a) * 2 + s2 * 0.45]);
    }
    chain(p, pts, 1.1, 0.8, [BONE[1], BONE[2], BONE[3], BONE[4], BONE[5]]);
    if (p.fine) { // Rippe: Lichtkante, Riss, Gelenkkerbe am Rückgrat
      edge(p, pts, 1.1, 0.8, BONE[5], 0.5);
      const c = pts[2 + (i % 3)]; p.dot(c[0], c[1], BONE[1]); p.dot(c[0] + 0.5, c[1] + 0.5, BONE[1]);
      p.dot(pts[0][0] + 0.5, pts[0][1], BONE[0]);
    }
  }
  occlude(null);
  // Rippenbögen leuchten innen leicht an
  if (hb > 0.05) for (let i = 0; i < 5; i++) g.px(rc.x + rr * 0.5, rc.y - rr * 0.85 + i * rr * 0.4 + 1, E[0]);
  // --- Moosdecke auf dem Buckel mit Leuchtpilzen
  ell(p, hump.x - 1, hump.y - 6.5, 14, 6, MOSS, { noise: 0.4, seed: 63, rot: P.lean * 0.5 });
  ell(p, hump.x + 7, hump.y - 4, 7, 4, MOSS, { noise: 0.35, seed: 64 });
  for (let i = 0; i < 11; i++) { // Moosfransen vorn
    const x = hump.x - 8 + i * 2, y = hump.y - 1 + Math.abs(i - 4) * 0.4;
    const len = 3 + (hash2(i, 1, 65) * 5 | 0);
    if (p.fine) { // Fransen als zwei Strähnen: helle vorn, dunkle versetzt dahinter
      for (let j = 0; j < len; j += 0.5) {
        const x2 = x + Math.sin(P.ph + i + j * 0.6) * 0.5;
        p.dot(x2, y + j, (j | 0) % 3 === 2 ? MOSS[2] : MOSS[4]); if (j < len - 1) p.dot(x2 + 0.5, y + j + 0.5, MOSS[2]);
      }
      p.dot(x + Math.sin(P.ph + i + len * 0.6) * 0.5, y + len, MOSS[1]);
      continue;
    }
    for (let j = 0; j < len; j++) p.px(x + Math.sin(P.ph + i + j * 0.6) * 0.5, y + j, j % 3 === 2 ? MOSS[2] : MOSS[4]);
  }
  if (p.fine) mossTufts(p, hump.x - 1, hump.y - 6.5, 14, 6, P.ph, 18, 63);
  for (const [dx, dy, s3] of [[-9, -11, 1.6], [-3, -12.5, 2.2], [4, -11, 1.4], [10, -7.5, 1.8]]) { // Leuchtpilze
    const x = hump.x + dx, y = hump.y + dy;
    p.line(x, y, x, y + 2, BONE[2]);
    ell(p, x, y - 0.5, s3, s3 * 0.6, [TOX[1], TOX[2], TOX[3], TOX[4]]);
    glowDot(g, x, y - 0.5, s3 * 0.6 * P.heart, GT);
    if (p.fine) { // Pilzhut: heißer Kern, Glanz, Lamellen unten; Stiel mit Lichtkante
      p.dot(x - 0.25, y - 0.75, TOX[5]); p.dot(x + 0.25, y - 0.75, TOX[5]); p.dot(x - s3 * 0.55, y - s3 * 0.45, '#ffffff');
      for (let u = -s3 + 0.5; u < s3 - 0.25; u += 0.5) p.dot(x + u, y + s3 * 0.6 - 0.75, (u * 2 & 1) ? TOX[1] : TOX[0]);
      p.dot(x - 0.5, y + 1, BONE[4]); p.dot(x - 0.5, y + 1.5, BONE[3]);
      if (P.heart > 0.1) g.dot(x, y - 0.75, GT[4]);
    }
  }
  // Schlammtropfen vom Bauch
  const belly = pt(4, 9);
  drip(p, g, belly.x, belly.y + 2, 4, P.dr, MUDDRIP);
  drip(p, g, belly.x - 5, belly.y + 1, 3, P.dr + 0.5, MUDDRIP);

  // --- vorderes Bein
  if (FN) occlude(g);
  cap(p, hip.x + 3, hip.y, legF.jx, legF.jy, 7.5, 6.5, near, { noise: 0.2, seed: 66, lump: LMP });
  cap(p, legF.jx, legF.jy, legF.ex, legF.ey - 1, 6.5, 7, near, { noise: 0.2, seed: 67, lump: LMP });
  if (FN) { limbDeco(p, hip.x + 3, hip.y, legF.jx, legF.jy, 7.5, 6.5, 66, false); limbDeco(p, legF.jx, legF.jy, legF.ex, legF.ey - 1, 6.5, 7, 67, false); occlude(null); }
  for (let k = -1; k <= 2; k++) {
    if (p.fine) { // Wurzelzehen: 2 Feinpixel mit Lichtkante, Spitze dünn
      p.fline(legF.ex + k * 2, legF.ey - 2, legF.ex + k * 3.5 + 1, AY - 1, ROOT[k === 1 ? 4 : 2], 1);
      p.fline(legF.ex + k * 2 - 0.5, legF.ey - 2, legF.ex + k * 3.5 + 0.5, AY - 1.5, ROOT[k === 1 ? 5 : 4]);
      continue;
    }
    p.line(legF.ex + k * 2, legF.ey - 2, legF.ex + k * 3.5 + 1, AY - 1, ROOT[k === 1 ? 4 : 2]);
  }
  p.rect(legF.ex - 5, AY - 2, 11, 1, H_MUD[2]);
  if (p.fine) { p.fline(legF.ex - 5, AY - 2, legF.ex + 5.5, AY - 2, H_MUD[4]); shine(p, legF.jx - 4.5, legF.jy - 3, H_MUD[5], H_MUD[6], 3); }
  // Wurzelranke ums Knie
  p.line(legF.jx - 4, legF.jy - 1, legF.jx + 4, legF.jy + 2, ROOT[3]); p.line(legF.jx - 4, legF.jy + 1, legF.jx + 4, legF.jy + 4, ROOT[2]);
  if (p.fine) { p.fline(legF.jx - 4, legF.jy - 1, legF.jx + 4, legF.jy + 2, ROOT[5]); p.fline(legF.jx - 4, legF.jy + 1.5, legF.jx + 4, legF.jy + 4.5, ROOT[1]); }

  // --- vorderer Arm (erhoben: hinter dem Kopf, sonst davor)
  const armUp = P.hFy < -8;
  const drawFrontArm = () => {
  const armR = FN ? HF_ARM : [H_MUD[1], H_MUD[2], H_MUD[3], H_MUD[4], H_MUD[5], H_MUD[6], '#857a52'];
  // dunkle Kontur trennt den Arm vom Leib
  if (FN) occlude(g);   // fein: der Arm verdeckt das Leuchten dahinter (kein gestricheltes Durchscheinen)
  cap(p, shF.x, shF.y, armF.jx, armF.jy, 7, 6, [BLACK], { seed: 70, lump: LMP }); cap(p, armF.jx, armF.jy, armF.ex, armF.ey, 6, 4.8, [BLACK], { seed: 72, lump: LMP });
  cap(p, shF.x, shF.y, armF.jx, armF.jy, 6, 5, armR, { noise: 0.2, seed: 70, lump: LMP });
  ell(p, shF.x - 1, shF.y - 1, 6.5, 5.5, armR, { noise: 0.25, seed: 71, lump: LMP }); // Schulterballen
  p.line(shF.x - 4, shF.y - 3, shF.x + 3, shF.y - 5, BONE[3]); p.px(shF.x + 3, shF.y - 5, BONE[5]); // Knochenzacke
  if (p.fine) { // Knochenzacke: Lichtkante, Risse; nasser Glanz auf dem Schulterballen
    p.fline(shF.x - 4, shF.y - 3.5, shF.x + 3, shF.y - 5.5, BONE[5]); p.dot(shF.x - 1, shF.y - 3.5, BONE[1]); p.dot(shF.x + 1, shF.y - 4.5, BONE[1]);
    shine(p, shF.x - 4.5, shF.y - 3.5, armR[5], H_GLOSS, 2);
  }
  cap(p, armF.jx, armF.jy, armF.ex, armF.ey, 5, 3.8, armR, { noise: 0.2, seed: 72, lump: LMP });
  if (FN) { limbDeco(p, shF.x, shF.y, armF.jx, armF.jy, 6, 5, 70, false); limbDeco(p, armF.jx, armF.jy, armF.ex, armF.ey, 5, 3.8, 72, false); }
  for (let s4 = 0.2; s4 < 0.9; s4 += 0.3) { // Wurzelbänder
    const x = armF.jx + (armF.ex - armF.jx) * s4, y = armF.jy + (armF.ey - armF.jy) * s4;
    p.line(x - 3, y - 1, x + 3, y + 2, ROOT[3]); p.px(x + 3, y + 2, ROOT[5]);
    if (p.fine) { p.fline(x - 3, y - 1, x + 3, y + 2, ROOT[5]); p.fline(x - 3, y, x + 3, y + 3, ROOT[1]); }
  }
  drip(p, g, armF.jx + 1, armF.jy + 3, 4, P.dr + 0.3, MUDDRIP);
  const fa = Math.atan2(armF.ey - armF.jy, armF.ex - armF.jx);
  rootHand(p, armF.ex, armF.ey, fa * 0.6 + 0.2, P.splash, armR, true);
  meta.hand = { x: armF.ex + Math.cos(fa) * 4, y: armF.ey + Math.sin(fa) * 4 };
  if (FN) occlude(null);

  };
  if (armUp) drawFrontArm();

  // --- Kopf: Elchschädel am Schlammhals, Wurzelgeweih
  const neck = pt(BD.spine + 1, 8);
  const hx = neck.x + 6 + P.head, hy = neck.y + 3 + P.headY;
  if (FN) occlude(g);
  cap(p, neck.x - 3, neck.y - 1, hx - 1, hy, 6, 4, near, { noise: 0.2, seed: 68, lump: LMP });
  if (FN) occlude(null);
  const ha = P.headA;
  const ca = Math.cos(ha), sa = Math.sin(ha);
  const Hh = (u, v) => ({ x: hx + u * ca - v * sa, y: hy + u * sa + v * ca });
  // Geweih hinten (fern)
  const an = Hh(-2, -4);
  antler(p, an.x - 1, an.y, -Math.PI / 2 - 0.5 - ha * 0.5, 0.03, 7, false, P.ph);
  // Unterkiefer
  const j0 = Hh(0, 3.5), j1 = Hh(13, 4 + P.jaw * 6);
  cap(p, j0.x, j0.y, j1.x, j1.y, 2.2, 1.4, [BONE[0], BONE[1], BONE[2], BONE[3], BONE[4]]);
  if (P.jaw > 0.25) for (let u = 5; u <= 12; u += 1.5) { const t = Hh(u, 3 + P.jaw * 6 * (u / 13)); p.px(t.x, t.y - 1, BONE[5]); }
  // Schädel
  ell(p, hx, hy, 6, 5, [BONE[1], BONE[2], BONE[3], BONE[4], BONE[5]], { rot: ha });
  const s0 = Hh(2, 0.5), s1 = Hh(13.5, 2.3);
  cap(p, s0.x, s0.y, s1.x, s1.y, 3.6, 2.1, [BONE[1], BONE[2], BONE[3], BONE[4], BONE[5]]);
  for (let u = 5; u <= 13; u += 1.5) { const t = Hh(u, 3.6 - (u - 5) * 0.05); p.px(t.x, t.y, BONE[4]); p.px(t.x, t.y + 0.8, BONE[0]); } // Oberkieferzähne
  const ns = Hh(12.5, 1); p.px(ns.x, ns.y, BONE[0]); p.px(ns.x - 1, ns.y, BONE[1]);
  const cr = Hh(4, -1.5); p.line(cr.x, cr.y, cr.x + 2, cr.y + 1, BONE[1]); // Riss
  if (p.fine) { // Elchschädel: Zähne einzeln (Licht/Schatten, dunkle Fugen), Nasenrücken-Licht, verästelte Risse, Brauenwulst
    for (let u = 5; u <= 13; u += 0.75) {
      const t = Hh(u, 3.6 - (u - 5) * 0.05), gap = Math.round(u * 4) % 3 === 0;
      p.dot(t.x, t.y, gap ? BONE[1] : BONE[5]); p.dot(t.x, t.y + 0.5, gap ? BONE[0] : BONE[3]); p.dot(t.x, t.y + 1, BONE[0]);
    }
    const n0 = Hh(4.5, -0.6), n1 = Hh(12.5, 0.4); p.fline(n0.x, n0.y, n1.x, n1.y, BONE[5]);
    const c1 = Hh(6, -0.5), c2 = Hh(7, 0.5); p.fline(cr.x + 2, cr.y + 1, c1.x, c1.y, BONE[1]); p.fline(c1.x, c1.y, c2.x, c2.y, BONE[1]);
    const c3 = Hh(1, 1.5), c4 = Hh(2.5, 3); p.fline(c3.x, c3.y, c4.x, c4.y, BONE[1]);
    p.dot(ns.x + 0.5, ns.y, BONE[0]); p.dot(ns.x - 0.5, ns.y - 0.5, BONE[5]);
    const b0 = Hh(1.5, -2.8), b1 = Hh(5.5, -2.6); p.fline(b0.x, b0.y, b1.x, b1.y, BONE[5]);
  }
  // Moos auf dem Schädel
  const mt = Hh(-2, -3.5); ell(p, mt.x, mt.y, 3, 1.5, MOSS, { noise: 0.4, seed: 69 });
  // Augenhöhle
  const eh = Hh(3.5, -1.2);
  ell(p, eh.x, eh.y, 2.2, 1.7, ['#060504', '#0c0a08']);
  if (P.eye > 0.3) {
    p.px(eh.x + 0.5, eh.y, TOX[5]); p.px(eh.x - 0.5, eh.y, TOX[3]);
    g.px(eh.x + 0.5, eh.y, GT[4]); g.px(eh.x - 0.5, eh.y, GT[3]); g.px(eh.x + 1.5, eh.y, GT[2]); g.px(eh.x + 0.5, eh.y - 1, GT[1]); g.px(eh.x + 0.5, eh.y + 1, GT[1]);
    if (p.fine) { // glühendes Auge: weißer Kern im grünen Saum, Rand der Höhle unten dunkel
      p.dot(eh.x + 0.5, eh.y, '#ffffff'); p.dot(eh.x, eh.y, TOX[5]); p.dot(eh.x - 0.5, eh.y, TOX[4]); p.dot(eh.x - 1, eh.y, TOX[2]);
      p.dot(eh.x + 0.5, eh.y + 0.5, TOX[3]); g.dot(eh.x + 0.5, eh.y, '#ffffff');
    }
  }
  meta.eye = eh;
  meta.mouth = Hh(12, 3.5 + P.jaw * 3.5);
  // Geweih vorn (nah)
  const an2 = Hh(0, -4);
  antler(p, an2.x, an2.y, -Math.PI / 2 - 0.15 - ha * 0.5, 0.04, 8, true, P.ph + 1);
  meta.head = { x: hx, y: hy - 20 };

  if (!armUp) drawFrontArm();

  // --- Effekte
  if (X.splash) mudSplash(p, g, meta.hand.x + 2, AY - 1, X.splash.k, X.splash.big);
  if (P.gas > 0.02) {
    const m = meta.mouth;
    const G2 = ['#16200e', '#2e3c1a', '#485c24', '#6a8432', '#90aa4a'];
    for (let i = 0; i < 12; i++) {
      const f = i / 11;
      const d = f * (8 + P.gas * 20);
      const x = m.x + 2 + d * 1.1, y = m.y + 1 + d * 0.3 - Math.sin(f * 3 + i) * 3 * f;
      const r = (2 + f * 7.5) * Math.min(1, P.gas * 1.6) * (0.75 + hash2(i, 1, 73) * 0.5);
      gasPuff(p, g, x, y, r, 1.1 - P.gas * 0.3, 300 + i, G2, GT);
    }
  }
  return meta;
}

function horrorAnims() {
  const mk = (P, X) => makeFrame(BH, P, X);
  const T = (keys, n, o) => track(BH, keys, n, o);
  const idleA = bpose();
  const idleB = bpose({ hipY: 1, lean: 0.6, headY: 1, headA: 0.2, jaw: 0.2, hFy: 34, heart: 0.7, ribs: 0.4 });
  const idle = [];
  for (let i = 0; i < 6; i++) { const k = (1 - Math.cos(i / 6 * TAU)) / 2; idle.push(mk({ ...mix(idleA, idleB, k), ph: i / 6 * TAU, dr: i / 6 })); }
  // schwerfälliges Stapfen, die Arme schleifen
  const walk = [];
  for (let i = 0; i < 8; i++) {
    const ph = i / 8 * TAU, sn = Math.sin(ph), c = Math.cos(ph);
    walk.push(mk(bpose({
      hipY: -Math.abs(c) * 1.5 + 1, lean: 0.58 + Math.abs(sn) * 0.03, fFx: 1 + sn * 8, fFy: Math.max(0, -c) * 3.5, fBx: -3 - sn * 8, fBy: Math.max(0, c) * 3.5,
      hFx: 12 - sn * 5, hFy: 32 + Math.abs(sn), hBx: 4 + sn * 5, head: sn * 0.8, headY: Math.abs(c), headA: 0.15 + sn * 0.05, ph, dr: i / 8,
    }), { fx: i % 4 === 0 ? 'step' : null }));
  }
  // Ausholen (Grundangriff): beide Fäuste über den Kopf
  const w1 = bpose({ lean: 0.3, hipX: -2, hFx: 10, hFy: -10, hBx: 2, hBy: -8, headA: -0.1, jaw: 0.4, ph: 1 });
  const w2 = bpose({ lean: 0.08, hipX: -4, hipY: 1, hFx: 5, hFy: -27, hBx: -3, hBy: -25, headA: -0.3, headY: -2, jaw: 0.8, heart: 1.4, ribs: 0.6, fFx: 10, fBx: -10, ph: 2 });
  const windup = T([[0, idleA], [0.35, w1], [1, w2]], 5);
  // Hieb: Fäuste krachen vor ihm in den Morast
  const s1 = bpose({ lean: 0.7, hipX: 1, hipY: 2, hFx: 18, hFy: 8, hBx: 14, hBy: 6, headA: 0.3, jaw: 1, fFx: 11, fBx: -9, heart: 1.3, ph: 3 });
  const s2 = bpose({ lean: 0.95, hipX: 3, hipY: 5, hFx: 20, hFy: 40, hBx: 16, hBy: 40, headA: 0.35, headY: 2, jaw: 0.8, fFx: 12, fBx: -10, splash: 1, ph: 4 });
  const s3 = { ...s2, jaw: 0.4, splash: 0.6, ph: 5 };
  const s4 = bpose({ lean: 0.75, hipX: 2, hipY: 3, hFx: 17, hFy: 36, hBx: 12, hBy: 36, fFx: 11, fBx: -9, ph: 6 });
  const spl = (k, big = false) => ({ splash: { x: BH.AX + 36, k, big } });
  const strike = [mk(s1), mk(s2, { fx: 'impact', ...spl(0.35) }), mk(s3, spl(0.7)), mk(s4, spl(1)), mk(mix(s4, idleA, 0.6))];
  // Brüllen: aufrichten, Arme weit, Herz lodert
  const r1 = bpose({ lean: 0.7, hipY: 2, headY: 2, headA: 0.4, jaw: 0.3, heart: 1.2, ph: 1 });
  const r2 = bpose({ lean: 0.1, hipX: -3, hipY: -1, hFx: 18, hFy: -20, hBx: -16, hBy: -16, head: -2, headY: -3, headA: -0.45, jaw: 1, heart: 2, ribs: 1, fFx: 11, fBx: -11, ph: 2 });
  const roar = T([[0, idleA], [0.3, r1], [0.5, r2, snap], [0.85, { ...r2, ph: 4, headA: -0.5 }], [1, { ...r2, ph: 5, jaw: 0.8, heart: 1.6 }]], 8, { extras: { 3: { fx: 'roar' } } });
  // Moorbeben (Spezial 'slam'): duckt sich, reckt sich riesig auf, wirft sich mit
  // beiden Fäusten in den Morast. Aufschlag bei ~1,1 s (Frame 11 von 16, 10 fps).
  const m1 = bpose({ lean: 0.75, hipY: 4, hFx: 10, hFy: 30, hBx: 6, hBy: 30, headY: 2, jaw: 0.4, ph: 1, heart: 1.2 });
  const m2 = bpose({ lean: 0.05, hipX: -4, hipY: -3, fFy: 0, hFx: 6, hFy: -27, hBx: -2, hBy: -25, headA: -0.4, headY: -3, jaw: 1, heart: 1.8, ribs: 0.8, fFx: 9, fBx: -9, ph: 3 });
  const m3 = { ...m2, hipY: -4, lean: -0.05, hFx: 3, hFy: -30, hBy: -28, ph: 4 };
  const m4 = bpose({ lean: 1.0, hipX: 4, hipY: 6, hFx: 22, hFy: 40, hBx: 18, hBy: 40, headA: 0.4, headY: 3, jaw: 1, fFx: 13, fBx: -11, splash: 1, heart: 1.6, ph: 5 });
  const slamKeys = [[0, idleA], [0.2, m1], [0.5, m2], [0.62, m3], [0.7, m4, snap], [0.85, { ...m4, jaw: 0.6, ph: 6 }], [1, { ...m4, lean: 0.85, hipY: 4, jaw: 0.3, splash: 0.3, heart: 1, ph: 7 }]];
  const slam = T(slamKeys, 16, {
    extras: { 11: { fx: 'impact', ...spl(0.3, true) }, 12: spl(0.55, true), 13: spl(0.8, true), 14: spl(1, true) },
  });
  // Faulatem (Spezial 'cloud'): Brustkorb bläht sich, Herz gleißt, dann speit er Moorgas
  const b1 = bpose({ lean: 0.35, hipX: -2, headA: -0.35, headY: -2, head: -2, ribs: 1, heart: 1.8, jaw: 0.3, hFx: 10, hFy: 28, hBx: 2, hBy: 30, ph: 1 });
  const b2 = { ...b1, ribs: 1.5, heart: 2.4, headA: -0.5, ph: 2 };
  const b3 = bpose({ lean: 0.75, hipX: 2, head: 3, headY: 2, headA: 0.1, jaw: 1, ribs: 0.4, heart: 1.3, hFx: 13, hFy: 32, hBx: 6, hBy: 33, gas: 0.35, ph: 3 });
  const b4 = { ...b3, gas: 1, jaw: 0.9, heart: 1, ribs: 0, ph: 4 };
  const belch = T([[0, idleA], [0.35, b1], [0.62, b2], [0.7, b3, snap], [1, b4]], 14, { extras: { 9: { fx: 'cast' } } });
  const hurtP = bpose({ lean: 0.4, hipX: -3, headA: -0.3, headY: -2, jaw: 0.8, hFx: 8, hFy: 26, hBx: 0, hBy: 28, heart: 1.5, ribs: 0.6, ph: 2 });
  const hurt = [mk(hurtP), mk(mix(hurtP, idleA, 0.5))];
  // Tod: taumelt, bricht ins Knie, sackt vornüber und versinkt; der Schädel bleibt liegen
  const d1 = { ...hurtP, lean: 0.3, headA: -0.5, jaw: 1, heart: 1.8 };
  const d2 = bpose({ kneel: 1, lean: 0.9, headY: 4, headA: 0.5, jaw: 0.6, hFx: 18, hFy: 40, hBx: 12, hBy: 40, heart: 0.8, eye: 0.6, fFx: 9 });
  const d3 = { ...d2, lean: 1.05, headY: 6, headA: 0.7, heart: 0.4, eye: 0.3 };
  const mound = (k, skullOn) => (p, g) => {
    const x = BH.AX + 6, y = BH.AY - 1;
    ell(p, x, y - 3 * k, 22 * k + 4, 5 * k + 1.5, [H_MUD[1], H_MUD[2], H_MUD[3], H_MUD[4], H_MUD[5]], { noise: 0.2, seed: 74 });
    for (let i = 0; i < 4; i++) { const bx = x - 12 + i * 7; p.line(bx, y - 4 * k, bx + 3, y - 6 * k - 2, BONE[3]); p.px(bx + 3, y - 6 * k - 2, BONE[5]); } // Rippen
    mirePool(p, g, x, y, 24, k * 0.7);
    if (skullOn) { // Schädel mit Geweih ruht auf dem Hügel, Augen erloschen
      const sx = x + 16, sy = y - 5 * k - 2;
      antler(p, sx - 2, sy - 3, -Math.PI / 2 - 0.9, -0.1, 6, true, 0);
      ell(p, sx, sy, 4, 3.4, [BONE[1], BONE[2], BONE[3], BONE[4]]);
      cap(p, sx + 1, sy + 0.5, sx + 9, sy + 2, 2.4, 1.5, [BONE[1], BONE[2], BONE[3], BONE[4]]);
      ell(p, sx + 2, sy - 0.5, 1.4, 1.1, ['#060504', '#0c0a08']);
    }
    // letztes Irrlicht entweicht
    if (k < 1) { const wy = y - 18 - k * 14; p.px(x - 2, wy, WISP[3]); glowDot(g, x - 2, wy, 1.5 * (1 - k), WISP); }
    return {};
  };
  const death = [
    mk(d1), mk(d2, { fx: 'impact' }), mk(d3),
    mk(d3, { sink: 0.2, post: mound(0.3, false) }),
    mk(d3, { sink: 0.45, post: mound(0.55, false) }),
    mk(d3, { sink: 0.7, post: mound(0.8, false) }),
    mk(d3, { sink: 1, post: mound(1, true), fx: 'impact' }),
    mk(d3, { sink: 1, post: mound(1, true) }),
  ];
  return {
    idle: new Animation(idle, 5),
    walk: new Animation(walk, 8),
    roar: new Animation(roar, 7, false),
    windup: new Animation(windup, 6, false),
    strike: new Animation(strike, 12, false),
    slam: new Animation(slam, 10, false),
    belch: new Animation(belch, 10, false),
    hurt: new Animation(hurt, 9, false),
    death: new Animation(death, 7, false),
  };
}

// ================================================================ Export

export function createMarshFoes() {
  return {
    bog_lurker: lurkerAnims(),
    rot_shaman: shamanAnims(),
    swamp_leech: leechAnims(),
    plague_toad: toadAnims(),
    bog_horror: horrorAnims(),
  };
}
