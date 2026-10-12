import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame, SpriteFrame, Animation } from '../gfx/Sprite.js';
import { FineCanvas, fineRes, pixelsToCanvas, col32, outlinePixels } from '../gfx/Fine.js';
import { hash2 } from '../core/math.js';

// Gegner der Schlackenhöhen: Feuerwicht, Magmahund, Aschegolem,
// Schlackenkultist und der Schlackenkoloss (Elite).
//
// Alle Figuren sind kleine Rigs: Schlüsselposen werden beim Laden weich
// interpoliert, Material wird pro Pixel mit Licht von links oben schattiert.
// Lava, Glut und Flammen liegen zusätzlich auf einer Leucht-Ebene (frame.glow).
// Die Hilfsfunktionen (FK) nutzt auch foes_forge.js.
// Blickrichtung rechts, Anker = Bodenkontakt.
//
// Feinraster (docs/STYLE.md „Feinraster“, Stufe B): Figuren mit spec.fine zeichnen auf FineCanvas in Weltpixeln
// (Farb- und Leuchtebene); ell/cap/poly/flame/veins/arcSmear/robe tasten dann Feinpixel ab, p.px/p.rect setzen
// ganze Weltpixel, Feinarbeit steht in `if (p.fine)`. Ohne spec.fine (foes_throne.js) und bei Qualität „Niedrig“
// (fineRes() 1) zeichnen dieselben Helfer wie früher auf PixelCanvas.

// ================================================================ Kit

const GLOW = ['#4a0e06', '#a8280c', '#f0602a', '#ffb070', '#fff4d8'];
// Lava/Flamme auf der Farbebene (dunkel -> hell)
const LAVA = ['#4a1006', '#9a2608', '#dc4e0e', '#ff8c24', '#ffd060', '#fff4c0'];

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

// Stift für Rasterschleifen: setzt die Zelle mit linker oberer Ecke (x, y) – fein ein Feinpixel (Pixelpuffer),
// sonst ein Weltpixel über ctx (Farbe zwischengespeichert, wie früher).
function pen(p) {
  if (p.fine) {
    // schneller Weg: deckende Farbe direkt in den Pixelpuffer (Formen setzen Tausende Feinpixel je Frame)
    const r = p.res, W = p.W, H = p.H, buf = p.buf; let last = null, v = 0;
    return (x, y, c) => {
      if (c !== last) { last = c; v = col32(c); }
      const F = Math.round((x + p.ox) * r), G = Math.round((y + p.oy) * r);
      if (F < 0 || G < 0 || F >= W || G >= H) return;
      if (v >>> 24 === 255) { buf[G * W + F] = v; p.dirty = true; } else p.put(F, G, v);
    };
  }
  const ctx = p.ctx; let last = null;
  return (x, y, c) => { if (c !== last) { ctx.fillStyle = c; last = c; } ctx.fillRect(x, y, 1, 1); };
}
// Leuchtebene löschen: Rechteck in Weltpixeln (fein direkt im Pixelpuffer, solange die Leinwand nicht angelegt ist).
function wipe(c, x, y, w = 1, h = 1) {
  if (c.buf && !c._canvas) {
    const r = c.res, F0 = Math.round((x + c.ox) * r), G0 = Math.round((y + c.oy) * r);
    const F1 = Math.min(c.W, F0 + Math.round(w * r)), G1 = Math.min(c.H, G0 + Math.round(h * r));
    for (let G = Math.max(0, G0); G < G1; G++) for (let F = Math.max(0, F0); F < F1; F++) c.buf[G * c.W + F] = 0;
  } else c.ctx.clearRect(x, y, w, h);
}
// eine Rasterzelle (linke obere Ecke x, y; Kante q) der Leuchtebene löschen
function wipeCell(c, x, y, q) {
  if (c.buf && !c._canvas) {
    const F = c.F(x + q / 2), G = c.G(y + q / 2);
    if (F >= 0 && G >= 0 && F < c.W && G < c.H) c.buf[G * c.W + F] = 0;
  } else c.ctx.clearRect(x, y, 1, 1);
}

// Lichtrichtung (von links oben, leicht zum Betrachter)
const LX = -0.52, LY = -0.66, LZ = 0.54;
// Verdecker: solange gesetzt, löschen ell()/cap() die Glow-Ebene unter sich,
// damit verdeckte Glut (Kern hinter dem Arm) nicht durchscheint.
let OCC = null;
const occlude = (g) => { OCC = g; };
function tone(ramp, nx, ny, nz, bias, noise) {
  const t = 0.28 + 0.62 * (nx * LX + ny * LY + nz * LZ) + bias + noise;
  return ramp[clamp(Math.floor(t * ramp.length), 0, ramp.length - 1)];
}

// Schattierte Ellipse (optional gedreht, mit Materialrauschen). Fein: Feinpixel abgetastet,
// das Materialrauschen bleibt je Weltpixel (keine Feinsprenkel).
function ell(p, cx, cy, rx, ry, ramp, o = {}) {
  const { rot = 0, noise = 0, seed = 1, bias = 0, clip = null, rim = 0 } = o;
  // Trennrand (rim) fein nur ein Feinpixel stark: Teile bleiben getrennt, ohne dicke dunkle Kontur
  if (rim) { const rr = p.fine ? rim * 0.5 : rim; ell(p, cx, cy, rx + rr, ry + rr, [ramp[0]], { rot, clip }); }
  const c = Math.cos(rot), s = Math.sin(rot);
  const R = Math.ceil(Math.max(rx, ry)) + 1;
  const q = p.fine ? p.step : 1, h = q / 2, put = pen(p);
  for (let y = Math.floor(cy - R); y <= cy + R; y += q) {
    for (let x = Math.floor(cx - R); x <= cx + R; x += q) {
      const dx = x + h - cx, dy = y + h - cy;
      const u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry;
      const d2 = u * u + v * v;
      if (d2 > 1) continue;
      if (clip && !clip(x, y)) continue;
      const nz = Math.sqrt(1 - d2);
      const nx = u * c - v * s, ny = u * s + v * c;
      const n = noise ? (hash2(Math.round(dx) + 64, Math.round(dy) + 64, seed) - 0.5) * noise : 0;
      put(x, y, tone(ramp, nx, ny, nz, bias, n));
      if (OCC) wipeCell(OCC, x, y, q);
    }
  }
}

// Schattierte Kapsel (Gliedmaßen): Radius r0 -> r1.
function cap(p, x0, y0, x1, y1, r0, r1, ramp, o = {}) {
  const { noise = 0, seed = 1, bias = 0, rim = 0 } = o;
  if (rim) { const rr = p.fine ? rim * 0.5 : rim; cap(p, x0, y0, x1, y1, r0 + rr, r1 + rr, [ramp[0]]); }
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 0.0001;
  const R = Math.ceil(Math.max(r0, r1)) + 1;
  const q = p.fine ? p.step : 1, h = q / 2, put = pen(p);
  const minX = Math.floor(Math.min(x0, x1) - R), maxX = Math.ceil(Math.max(x0, x1) + R);
  const minY = Math.floor(Math.min(y0, y1) - R), maxY = Math.ceil(Math.max(y0, y1) + R);
  for (let y = minY; y <= maxY; y += q) {
    for (let x = minX; x <= maxX; x += q) {
      const px = x + h, py = y + h;
      const t = clamp(((px - x0) * dx + (py - y0) * dy) / l2, 0, 1);
      const qx = x0 + dx * t, qy = y0 + dy * t;
      const r = r0 + (r1 - r0) * t;
      const ex = px - qx, ey = py - qy, d = Math.hypot(ex, ey);
      if (d > r) continue;
      const nx = ex / (r || 1), ny = ey / (r || 1), nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const n = noise ? (hash2(Math.round(px - x0) + 64, Math.round(py - y0) + 64, seed) - 0.5) * noise : 0;
      put(x, y, tone(ramp, nx, ny, nz, bias, n));
      if (OCC) wipeCell(OCC, x, y, q);
    }
  }
}

// Gefülltes Polygon (Scanline, ohne Kantenglättung). col: Farbe oder (x,y)=>Farbe.
// Fein: Zeilen und Spannen im Feinraster; col bekommt die linke obere Ecke der Feinzelle.
function poly(p, pts, col) {
  let minY = Infinity, maxY = -Infinity;
  for (const q of pts) { minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]); }
  const q = p.fine ? p.step : 1, fn = typeof col === 'function', put = fn ? pen(p) : null;
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y += q) {
    const yc = y + q / 2, xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + (yc - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.round(xs[k] / q) * q, x1 = Math.round(xs[k + 1] / q) * q;
      if (fn) for (let x = x0; x < x1; x += q) { const c = col(x, y); if (c) put(x, y, c); }
      else if (x1 > x0) p.rect(x0, y, x1 - x0, q, col);
    }
  }
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

// Leuchtpunkt/-fleck auf der Glow-Ebene (konzentrisch)
function glowDot(g, x, y, r, k = 1) {
  if (r <= 0.6) { g.px(x, y, GLOW[Math.min(4, 2 + k)]); return; }
  g.ellipse(x, y, r + 1, r + 1, GLOW[1]);
  g.ellipse(x, y, r, r, GLOW[2]);
  g.ellipse(x, y, Math.max(0.5, r - 1), Math.max(0.5, r - 1), GLOW[3]);
  if (r > 1.5) g.ellipse(x, y, Math.max(0.5, r - 2), Math.max(0.5, r - 2), GLOW[4]);
}

// Glühende Risse innerhalb einer Ellipse (Random Walk, relativ zur Mitte,
// damit sie mit dem Körper mitwandern). heat 0..1.
// Fein: Riss 1 Weltpixel breit als Saum, darin eine Kernlinie (1 Feinpixel) eine Stufe heißer.
function veins(p, g, cx, cy, rx, ry, seed, n, heat = 1, o = {}) {
  const { len = 6, dark = null } = o;
  const fine = p.fine;
  for (let i = 0; i < n; i++) {
    let x = (hash2(i, 1, seed) - 0.5) * 1.3 * rx, y = (hash2(i, 2, seed) - 0.5) * 1.3 * ry;
    let a = hash2(i, 3, seed) * Math.PI * 2;
    const L = Math.round(len * (0.6 + hash2(i, 4, seed) * 0.8));
    let lx = null, ly = 0, lk = 0;
    for (let s = 0; s < L; s++) {
      if ((x * x) / (rx * rx * 0.8) + (y * y) / (ry * ry * 0.8) > 1) break;
      const mid = 1 - Math.abs(s / L - 0.5) * 2;
      const h = heat * (0.45 + mid * 0.55);
      const k = h < 0.18 ? 0 : h > 0.75 ? 3 : h > 0.45 ? 2 : 1;
      if (!k) p.px(cx + x, cy + y, dark || LAVA[0]);
      else {
        p.px(cx + x, cy + y, LAVA[k]);
        g.px(cx + x, cy + y, GLOW[k]);
      }
      if (fine) {
        // Mitte des gesetzten Weltpixels (FineCanvas.px rastet auf das Feinraster)
        const mx = Math.round((cx + x) * 2) / 2 + 0.5, my = Math.round((cy + y) * 2) / 2 + 0.5;
        if (lx !== null && k && lk) {
          const kk = Math.min(k, lk);
          p.fline(lx, ly, mx, my, LAVA[kk + 1]); g.fline(lx, ly, mx, my, GLOW[kk + 1]);
        }
        lx = mx; ly = my; lk = k;
      }
      x += Math.cos(a); y += Math.sin(a) * 0.85;
      a += (hash2(i, s + 7, seed) - 0.5) * 1.5;
    }
  }
}

// Flammenzunge: Basis (x,y), wächst nach oben, neigt sich um lean px je Zeile.
// Fein: Zungenform je Feinpixel – heller, schmaler Kern im farbigen Saum; Flackerlücken je Weltpixel.
function flame(p, g, x, y, h, w, ph, o = {}) {
  const { lean = 0, seed = 3, hot = 1, glowOnly = false } = o;
  if (p.fine) {
    const q = p.step, yb = Math.round(y) + 1;
    for (let v = yb - q / 2; v > yb - h; v -= q) {
      const j = Math.max(0, yb - 0.5 - v), f = j / h, jw = Math.round(j);
      const hw = w * (1 - f * f * 0.85) * (0.82 + 0.28 * Math.sin(ph * 2 + j * 1.3 + seed));
      const xc = x + lean * j + Math.sin(ph + j * 0.8 + seed) * f * 1.4;
      const F0 = Math.floor((xc - hw - 0.5) / q), F1 = Math.ceil((xc + hw + 0.5) / q);
      for (let F = F0; F <= F1; F++) {
        const u = (F + 0.5) * q, k = u - xc;
        const e = Math.abs(k) / (hw + 0.5);
        if (e > 1) continue;
        if (f > 0.5 && hash2(Math.round(k) + 9, jw + Math.floor(ph * 3), seed) < (f - 0.45) * 1.3) continue;
        const heat = (1 - f * 0.85) * (1 - e * 0.95) * hot;
        const i = heat > 0.74 ? 5 : heat > 0.56 ? 4 : heat > 0.38 ? 3 : heat > 0.22 ? 2 : 1;
        if (!glowOnly) p.dot(u, v, LAVA[i]);
        g.dot(u, v, GLOW[Math.min(4, Math.max(1, i - 1))]);
      }
    }
    return;
  }
  for (let j = 0; j < h; j++) {
    const f = j / h;
    const hw = w * (1 - f * f * 0.85) * (0.82 + 0.28 * Math.sin(ph * 2 + j * 1.3 + seed));
    const off = lean * j + Math.sin(ph + j * 0.8 + seed) * f * 1.4;
    const K = Math.ceil(hw);
    for (let k = -K; k <= K; k++) {
      const e = Math.abs(k) / (hw + 0.01);
      if (e > 1) continue;
      if (f > 0.5 && hash2(k + 9, j + Math.floor(ph * 3), seed) < (f - 0.45) * 1.3) continue;
      const heat = (1 - f * 0.85) * (1 - e * 0.75) * hot;
      const i = heat > 0.72 ? 5 : heat > 0.55 ? 4 : heat > 0.38 ? 3 : heat > 0.22 ? 2 : 1;
      if (!glowOnly) p.px(x + off + k, y - j, LAVA[i]);
      g.px(x + off + k, y - j, GLOW[Math.min(4, Math.max(1, i - 1))]);
    }
  }
}

// Feuerball (Hand, Stab, Projektil-Auftakt)
function fireball(p, g, x, y, r, ph) {
  if (r < 0.5) return;
  ell(p, x, y, r, r, [LAVA[2], LAVA[3], LAVA[4], LAVA[5]], { bias: 0.1 });
  flame(p, g, x - 0.5, y - r * 0.4, Math.round(r * 2.2), r * 0.7, ph, { lean: -0.25, seed: 5 });
  glowDot(g, x, y, r + 0.5);
  if (p.fine) {
    // weißglühender Kern mit Glanz oben links, dunkler Saum unten rechts
    ell(p, x - r * 0.25, y - r * 0.2, r * 0.45, r * 0.45, [LAVA[5]]);
    p.dot(x - r * 0.45, y - r * 0.45, '#ffffff');
    if (r > 1.5) { p.fline(x + r * 0.2, y + r * 0.85, x + r * 0.8, y + r * 0.35, LAVA[2]); }
  }
}

// Rahmen-Bau: draw(p, g) -> meta mit absoluten Koordinaten. pad = Rand um die
// Zeichenfläche (Staub, Funken, Schweife dürfen über das Grundmaß hinausragen).
// fine: Feinraster (Stufe B) – Farb- und Leuchtebene als FineCanvas, sobald fineRes() > 1.
// Feinschliff wie finishPixels (Mondlicht-Kante oben, Kontaktschatten unten, gleiche Stärken), aber nicht auf
// Pixeln, deren Leuchtebene mindestens GLOW[1] trägt: Glut und Flammen bekommen sonst einen rosa Mondlichtsaum.
function finishGlowAware(d, w, h, gd, rim = 0.3, shade = 0.26) {
  const solid = (i) => (d[i] >>> 24) > 40;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const m = y * w + x, v = d[m];
      if ((v >>> 24) <= 40) continue;
      const up = y === 0 || !solid(m - w), down = y === h - 1 || !solid(m + w);
      if (up === down) continue;
      const gv = gd[m];
      if ((gv >>> 24) > 40 && (gv & 255) >= 0x80) continue;
      let r = v & 255, g = (v >>> 8) & 255, b = (v >>> 16) & 255;
      if (up) { r += (216 - r) * rim; g += (220 - g) * rim; b += (255 - b) * rim; }
      else { r *= 1 - shade; g *= 1 - shade; b *= 1 - shade; }
      d[m] = ((v & 0xff000000) | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r)) >>> 0;
    }
  }
  return d;
}

function makeFrame(W, H, AX, AY, draw, fx = null, pad = 0, fine = false) {
  const W2 = W + pad * 2, H2 = H + pad * 2;
  const res = fine ? fineRes() : 1;
  let meta = {}, f;
  if (res > 1) {
    // Wie buildFrame(..., { fine: true }), aber der Feinschliff lässt glühende Pixel aus (siehe finishGlowAware)
    const g = new FineCanvas(W2, H2, res), p = new FineCanvas(W2, H2, res);
    g.translate(pad, pad); p.translate(pad, pad);
    meta = draw(p, g) || {}; OCC = null;
    const gd = g.pixels(), d = finishGlowAware(p.pixels(), p.W, p.H, gd);
    f = new SpriteFrame(pixelsToCanvas(outlinePixels(d, p.W, p.H), p.W + 2, p.H + 2), (AX + pad) * res + 1, (AY + pad) * res + 1, res);
    // Leuchtebene direkt aus dem Pixelpuffer (ein putImageData)
    f.glow = new SpriteFrame(pixelsToCanvas(gd, g.W, g.H), (AX + pad) * res, (AY + pad) * res, res);
  } else {
    const g = new PixelCanvas(W2, H2);
    g.ctx.translate(pad, pad);
    f = buildFrame(W2, H2, AX + pad, AY + pad, (p) => { p.ctx.translate(pad, pad); meta = draw(p, g) || {}; OCC = null; });
    f.glow = new SpriteFrame(g.canvas, AX + pad, AY + pad);
  }
  f.meta = {};
  for (const k in meta) f.meta[k] = { dx: Math.round(meta[k].x - AX), dy: Math.round(meta[k].y - AY) };
  f.fx = fx;
  return f;
}

// n Frames aus einer Keyframe-Spur. spec = { W, H, AX, AY, pad?, fine?, draw(p, g, P, extra, t) }
function track(spec, keys, n, { loop = false, extras = {} } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = loop ? i / n : n === 1 ? 1 : i / (n - 1);
    const P = sample(keys, t);
    const ex = extras[i] || {};
    out.push(makeFrame(spec.W, spec.H, spec.AX, spec.AY, (p, g) => spec.draw(p, g, P, ex, t), ex.fx ?? null, spec.pad ?? 8, spec.fine));
  }
  return out;
}
const still = (spec, draw, fx = null) => makeFrame(spec.W, spec.H, spec.AX, spec.AY, draw, fx, spec.pad ?? 8, spec.fine);

// Schwung-Schleier (Smear) um einen Drehpunkt – heller Bogen, auf beiden Ebenen.
// Fein: Bogenform je Feinpixel, Dichte je Weltpixel (sonst flimmert es), Außenkante geschlossener.
function arcSmear(p, g, cx, cy, a0, a1, r0, r1, cols, seed = 13, glowIt = true) {
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1), span = hi - lo || 1;
  const R1 = Math.ceil(r1), fine = p.fine, q = fine ? p.step : 1, h = fine ? q / 2 : 0;
  for (let y = -R1; y <= R1; y += q) for (let x = -R1; x <= R1; x += q) {
    const sx = x + h, sy = y + h;
    const d = Math.hypot(sx, sy);
    if (d < r0 || d > r1) continue;
    let a = Math.atan2(sy, sx);
    while (a < lo - Math.PI) a += Math.PI * 2;
    while (a > lo + Math.PI) a -= Math.PI * 2;
    if (a < lo || a > hi) continue;
    const fresh = a1 > a0 ? (a - lo) / span : (hi - a) / span;
    const radial = (d - r0) / (r1 - r0);
    const dens = fresh * fresh * 0.5 + Math.max(0, radial - 0.3) * (0.3 + 0.7 * fresh);
    if (!fine) {
      if (hash2(x + 99, y + 99, seed) > dens) continue;
      p.px(cx + x, cy + y, radial > 0.8 ? cols[2] : fresh > 0.6 ? cols[1] : cols[0]);
      if (glowIt && fresh > 0.4 && radial > 0.5) g.px(cx + x, cy + y, radial > 0.8 ? GLOW[3] : GLOW[1]);
      continue;
    }
    if (hash2(Math.floor(x) + 99, Math.floor(y) + 99, seed) > dens + (radial > 0.86 ? 0.3 : 0)) continue;
    p.dot(cx + sx, cy + sy, radial > 0.86 ? cols[2] : radial > 0.7 || fresh > 0.6 ? cols[1] : cols[0]);
    if (glowIt && fresh > 0.4 && radial > 0.5) g.dot(cx + sx, cy + sy, radial > 0.86 ? GLOW[3] : GLOW[1]);
  }
}

// Staub-/Funkenkranz am Boden (Einschlag). Fein: Funken als Strich mit weißem Kopf.
function dustRing(p, g, x, y, r, seed, cols, sparks = true) {
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + hash2(i, 1, seed) * 0.3;
    const rr = r * (0.7 + hash2(i, 2, seed) * 0.5);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.4 - (Math.sin(a) < 0 ? hash2(i, 3, seed) * 3 : 0);
    p.px(px, py, cols[i % cols.length]);
    if (hash2(i, 4, seed) < 0.5) p.px(px + 1, py, cols[(i + 1) % cols.length]);
    if (sparks && hash2(i, 5, seed) < 0.35) {
      const sy = py - 2 - hash2(i, 6, seed) * 5;
      if (p.fine) {
        p.dot(px, sy, LAVA[5]); p.dot(px, sy + 0.5, LAVA[4]); p.dot(px - 0.5 * Math.sign(Math.cos(a)), sy + 1, LAVA[3]);
        g.dot(px, sy, GLOW[4]); g.dot(px, sy + 0.5, GLOW[3]); g.dot(px - 0.5 * Math.sign(Math.cos(a)), sy + 1, GLOW[2]);
      } else { p.px(px, sy, LAVA[4]); g.px(px, sy, GLOW[3]); }
    }
  }
}


// Randlicht für dunkle Figuren (Nachbearbeitung fertiger Frames): die äußerste
// Materialreihe innerhalb der Kontur bekommt oben (und schwächer an den Seiten)
// einen hellen Saum – auf der Farbebene aufgehellt und zusätzlich auf der
// Leucht-Ebene, damit die Silhouette auch auf fast schwarzem Boden (Glutöde,
// Schlackenhöhen, Faulmarsch) lesbar bleibt, wo die Lichtkarte die Farbebene
// abdunkelt. Glühende Stellen bleiben unberührt. Anker/Meta/Größen ändern sich nicht.
// rim = { top, side, glowTop, glowSide, k }
// Feinraster (STYLE §8): Frame und Leuchtebene sind in Texeln (frame.res je Weltpixel); der Saum ist ein Weltpixel
// tief, also res Texelreihen – die innere fein eine Stufe schwächer.
function rimGlow(anims, rim) {
  const hexc = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const T = hexc(rim.top), Sd = hexc(rim.side ?? rim.top);
  const GT = hexc(rim.glowTop), GS = rim.glowSide ? hexc(rim.glowSide) : null;
  const k = rim.k ?? 0.45;
  const done = new Set();
  for (const a of Object.values(anims)) for (const f of a.frames) {
    if (done.has(f)) continue;
    done.add(f);
    const c = f.canvas, W = c.width, H = c.height, res = f.res ?? 1;
    const cx = c.getContext('2d'), img = cx.getImageData(0, 0, W, H), d = img.data;
    const gc = f.glow?.canvas, gW = gc ? gc.width : 0, gH = gc ? gc.height : 0;
    const gx = gc ? gc.getContext('2d') : null, gimg = gx ? gx.getImageData(0, 0, gW, gH) : null, gd = gimg?.data;
    // Glow-Ebene liegt ohne Konturrand: Versatz aus den Ankern (Texel)
    const ox = gc ? Math.round(f.ax - f.glow.ax) : 0, oy = gc ? Math.round(f.ay - f.glow.ay) : 0;
    const A = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) A[i] = d[i * 4 + 3] > 0 ? 1 : 0;
    const op = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? A[y * W + x] : 0);
    // Kontur = deckende Pixel mit freiem Nachbarn
    const O = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (A[y * W + x] && (!op(x - 1, y) || !op(x + 1, y) || !op(x, y - 1) || !op(x, y + 1))) O[y * W + x] = 1;
    }
    const ring = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? O[y * W + x] : 1);
    if (res > 1) {
      // Fein: eine durchgehende helle Randlinie (1 Texel, 4-zusammenhängend auch auf Schrägen) nur an Kanten, die
      // nach oben links zeigen. Rechts/unten kein Saum (sonst Punktkette mit Lücken).
      // Ausgelassen wird nur echte Glut (Leuchtebene ab GLOW[1]), nicht ihr schwacher Hof.
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const m = y * W + x;
        if (!A[m] || O[m]) continue;
        // Außenrichtung = Summe der Versätze zu Konturtexeln in der 8er-Nachbarschaft; Licht kommt von oben links
        let ux = 0, uy = 0;
        for (let v = -1; v <= 1; v++) for (let u = -1; u <= 1; u++) if ((u || v) && ring(x + u, y + v)) { ux += u; uy += v; }
        if (!ux && !uy) continue;
        if (-ux - uy <= 0) continue;
        const up = uy < 0;
        const qx = x - ox, qy = y - oy, gi = (qy * gW + qx) * 4;
        const inG = gd && qx >= 0 && qy >= 0 && qx < gW && qy < gH;
        if (inG && gd[gi + 3] > 0 && gd[gi] >= 0x80) continue; // Glut bleibt Glut
        const i = m * 4, f2 = up ? k : k * 0.8;
        d[i] += (T[0] - d[i]) * f2; d[i + 1] += (T[1] - d[i + 1]) * f2; d[i + 2] += (T[2] - d[i + 2]) * f2;
        if (inG) { gd[gi] = GT[0]; gd[gi + 1] = GT[1]; gd[gi + 2] = GT[2]; gd[gi + 3] = 255; }
      }
      cx.putImageData(img, 0, 0);
      if (gx) gx.putImageData(gimg, 0, 0);
      continue;
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const m = y * W + x;
      if (!A[m] || O[m]) continue;
      let up = 0, side = 0;
      for (let s = 1; s <= res && !up; s++) if (ring(x, y - s)) up = s;
      for (let s = 1; s <= res && !side; s++) if (ring(x - s, y) || ring(x + s, y)) side = s;
      if (!up && !side) continue;
      const qx = x - ox, qy = y - oy, gi = (qy * gW + qx) * 4;
      const inG = gd && qx >= 0 && qy >= 0 && qx < gW && qy < gH;
      if (inG && gd[gi + 3] > 0) continue; // Glut bleibt Glut
      const depth = up || side, deep = depth > 1;
      const i = m * 4, col = up ? T : Sd, f2 = (up ? k : k * 0.6) * (deep ? 0.55 : 1);
      d[i] += (col[0] - d[i]) * f2; d[i + 1] += (col[1] - d[i + 1]) * f2; d[i + 2] += (col[2] - d[i + 2]) * f2;
      const gcol = up ? GT : GS;
      if (inG && gcol && !deep) { gd[gi] = gcol[0]; gd[gi + 1] = gcol[1]; gd[gi + 2] = gcol[2]; gd[gi + 3] = 255; }
    }
    cx.putImageData(img, 0, 0);
    if (gx) gx.putImageData(gimg, 0, 0);
  }
  return anims;
}


// ================================================================ Materialien

const BASALT = ['#0c0a0e', '#17131a', '#231d24', '#322a31', '#443a41', '#5a4f55'];
const OBS = ['#060409', '#0f0a14', '#1a1222', '#281c34', '#3b2c4c', '#5a4a72'];
const OBS_SHINE = '#9a8cc0';
const ASH = ['#1b1819', '#2a2627', '#3b3637', '#4f4949', '#676060', '#847c7a'];
// Feuerwicht: dunkle, glühend rote Haut – Augen, Zähne und Bauchglut heben sich ab
const SKIN = ['#1e0408', '#3e0c14', '#681820', '#922a22', '#bc4a2a', '#e8783a'];
const MEMB = ['#12060e', '#220a16', '#36101e', '#4e1826'];
const ROBE = ['#120709', '#1f0b0e', '#321014', '#4a1618', '#66201e'];
const CHAR = ['#0e0b0c', '#1a1516', '#282122', '#3a3030'];
const MASK = ['#3a302a', '#6c6052', '#a09080', '#cfc2ae', '#eee4d2'];
const HORN = PAL.bone;
const VOID = '#0a0508';
// Feindliche Hiebe kalt (STYLE.md)
const SMEAR = ['#6a7a98', '#b8c8e0', '#f4f8ff'];

// ================================================================ Feuerwicht

const IMP = { W: 34, H: 38, AX: 16, AY: 35, fine: true };
const IMP_REST = {
  hov: 10, bx: 0, lean: 0, wing: 0.2, wingB: 0.2, arm: 0.6, armB: 1.2, jaw: 0, tail: 0,
  fl: 0, spit: 0, eye: 1, legs: 0, flame: 1, claw: 0,
};
const ip = (o) => ({ ...IMP_REST, ...o });

function batWing(p, g, sx, sy, ang, span, ramp, bone, front) {
  // drei Fingerknochen, Membran dazwischen, gezackter Rand
  const fingers = [ang - 0.55, ang - 0.05, ang + 0.5].map((a, i) => {
    const L = span * [0.95, 1, 0.7][i];
    return [sx + Math.cos(a) * L, sy + Math.sin(a) * L];
  });
  const elbow = [sx + Math.cos(ang - 0.7) * span * 0.45, sy + Math.sin(ang - 0.7) * span * 0.45];
  const pts = [[sx, sy], elbow, fingers[0]];
  for (let i = 0; i < 2; i++) {
    const a = fingers[i], b = fingers[i + 1];
    pts.push([(a[0] + b[0]) / 2 + (sx - (a[0] + b[0]) / 2) * 0.28, (a[1] + b[1]) / 2 + (sy - (a[1] + b[1]) / 2) * 0.28]);
    pts.push(b);
  }
  pts.push([sx + 1, sy + 3]);
  poly(p, pts, (x, y) => {
    const d = Math.hypot(x - sx, y - sy) / span;
    return d > 0.75 ? ramp[front ? 3 : 2] : d > 0.4 ? ramp[front ? 2 : 1] : ramp[front ? 1 : 0];
  });
  if (p.fine) {
    // Handfein: Membranadern zwischen den Fingern (dunkel, Lichtseite eine Stufe heller), Knochen als
    // feine Doppellinie (Lichtkante oben), glimmender Saum an den Bogenkanten
    for (let i = 0; i < 2; i++) {
      const a = fingers[i], b = fingers[i + 1], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      p.fline(elbow[0], elbow[1], mx + (elbow[0] - mx) * 0.2, my + (elbow[1] - my) * 0.2, ramp[front ? 0 : 0]);
      p.fline(elbow[0] - 0.5, elbow[1], mx + (elbow[0] - mx) * 0.35 - 0.5, my + (elbow[1] - my) * 0.35, ramp[front ? 3 : 1]);
      if (front) { const e = pts[3 + i * 2]; p.dot(e[0], e[1], LAVA[3]); g.dot(e[0], e[1], GLOW[2]); }
    }
    p.fline(sx, sy, elbow[0], elbow[1], bone[front ? 2 : 1], 1);
    p.fline(sx, sy - 0.5, elbow[0], elbow[1] - 0.5, bone[front ? 4 : 2]);
    for (const f of fingers) p.fline(elbow[0], elbow[1], f[0], f[1], bone[front ? 2 : 1]);
    p.fline(elbow[0], elbow[1] - 0.5, fingers[0][0], fingers[0][1] - 0.5, bone[front ? 3 : 2]);
    p.dot(elbow[0], elbow[1] - 1, bone[front ? 4 : 2]); p.dot(elbow[0] + 0.5, elbow[1] - 1, HORN[front ? 3 : 1]);
    if (front) for (const f of fingers) { p.dot(f[0], f[1], LAVA[4]); p.dot(f[0] + 0.5, f[1], LAVA[2]); g.dot(f[0], f[1], GLOW[3]); g.dot(f[0] + 0.5, f[1], GLOW[1]); }
    return;
  }
  p.line(sx, sy, elbow[0], elbow[1], bone[front ? 3 : 2]);
  for (const f of fingers) p.line(elbow[0], elbow[1], f[0], f[1], bone[front ? 2 : 1]);
  p.px(elbow[0], elbow[1] - 1, bone[front ? 4 : 2]);
  if (front) for (const f of fingers) { p.px(f[0], f[1], LAVA[2]); g.px(f[0], f[1], GLOW[1]); }
}

// Handfein: Gesicht des Wichts (hx/hy auf das Feinraster gerastet) – Glutaugen mit Schlitzpupille und Glanz,
// Brauenwulst mit Lichtkante, Nasenrücken, Nüster, spitze Zähne und Mundwinkel, Hörner mit Lichtkante, Ohrmuschel.
function impFace(p, g, P, hx, hy, jaw, ec) {
  // Brauenwulst: Lichtkante oben, Schattenkante zum Auge
  p.fline(hx - 0.5, hy - 2, hx + 3.5, hy - 2, SKIN[5]); p.dot(hx + 2, hy - 1.5, SKIN[1]);
  p.dot(hx + 4, hy - 1.5, SKIN[4]); p.dot(hx + 4.5, hy - 1, SKIN[3]);
  if (P.eye > 0.3) {
    for (const ex of [hx + 1, hx + 3]) {
      p.dot(ex, hy - 1, '#ffffff'); p.dot(ex + 0.5, hy - 1, ec); p.dot(ex, hy - 0.5, ec);
      p.dot(ex + 0.5, hy - 0.5, '#5a1004'); p.dot(ex + 0.5, hy, '#5a1004');            // Schlitzpupille (Blick nach vorn)
      p.dot(ex, hy, LAVA[4]); p.dot(ex, hy + 0.5, LAVA[3]); p.dot(ex + 0.5, hy + 0.5, LAVA[2]);
      g.dot(ex, hy - 1, GLOW[4]); g.dot(ex + 0.5, hy - 0.5, GLOW[2]); g.dot(ex + 0.5, hy, GLOW[2]);
    }
  } else { p.fline(hx + 0.5, hy - 0.5, hx + 1.5, hy - 0.5, SKIN[3]); p.fline(hx + 2.5, hy - 0.5, hx + 3.5, hy - 0.5, SKIN[3]); }
  // Nasenrücken im Licht, Nüster, Wangenknochen
  p.dot(hx + 4.5, hy - 0.5, SKIN[5]); p.dot(hx + 5, hy, SKIN[5]); p.dot(hx + 5.5, hy + 0.5, SKIN[2]); p.dot(hx + 5, hy + 0.5, VOID);
  p.dot(hx - 0.5, hy, SKIN[4]); p.dot(hx - 1, hy + 0.5, SKIN[3]);
  // Maul: Lippe oben im Licht, spitze Zähne, Mundwinkel
  p.fline(hx + 1, hy + 0.5, hx + 4, hy + 0.5, SKIN[4]);
  p.dot(hx + 1.5, hy + 1.5, HORN[4]); p.dot(hx + 3.5, hy + 1.5, HORN[4]); p.dot(hx + 4.5, hy + 1.5, HORN[3]);
  p.dot(hx + 0.5, hy + 1, '#2a0408'); p.dot(hx + 0.5, hy + 1.5 + jaw, SKIN[1]);
  if (jaw) { p.dot(hx + 2.5, hy + 0.5 + jaw, HORN[4]); p.dot(hx + 2.5, hy + 1 + jaw, LAVA[5]); g.dot(hx + 2.5, hy + 1 + jaw, GLOW[4]); }
  // Hörner: Lichtkante oben, helle Spitze
  p.fline(hx - 1, hy - 3.5, hx - 3, hy - 5.5, HORN[4]); p.dot(hx - 5, hy - 6.5, '#fffbef');
  p.fline(hx + 1, hy - 3.5, hx + 1, hy - 5, HORN[4]); p.dot(hx - 1, hy - 7.5, '#fffbef'); p.dot(hx + 2.5, hy - 3.5, HORN[0]);
  // Ohrmuschel: dunkle Mulde, helle Kante
  p.fline(hx - 3, hy - 0.5, hx - 5, hy - 2.5, SKIN[0]); p.fline(hx - 3, hy - 1.5, hx - 5.5, hy - 3, SKIN[4]);
}

function drawImp(p, g, P, ex) {
  const { AX, AY } = IMP;
  const px0 = AX + P.bx, py0 = AY - P.hov; // Hüfte
  const lean = P.lean;
  const meta = {};
  const chx = px0 + lean * 3, chy = py0 - 6;
  const hx = chx + 1 + lean * 3, hy = chy - 5;
  const hurt = ex.hurt;

  // Schwanz: Kurve nach hinten/unten, Pfeilspitze mit Glut
  let tx = px0 - 1, ty = py0 - 1;
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * 0.85 + Math.sin(P.tail + i * 0.6) * 0.35 - i * 0.12;
    const nx = tx + Math.cos(a) * 1.3, ny = ty - Math.sin(a) * 1.3 + 0.6;
    p.px(nx, ny, SKIN[i < 4 ? 2 : 1]); if (i < 5) p.px(nx, ny + 1, SKIN[1]);
    tx = nx; ty = ny;
  }
  poly(p, [[tx - 2, ty], [tx, ty - 2], [tx + 1, ty], [tx, ty + 2]], SKIN[3]);
  p.px(tx - 1, ty, LAVA[3]); g.px(tx - 1, ty, GLOW[3]); g.px(tx, ty, GLOW[1]);

  // hinterer Flügel
  batWing(p, g, chx - 2, chy - 2, -2.2 + P.wingB * 0.9, 10, MEMB, SKIN, false);

  // Beine (Ziegenbeine, baumeln)
  const leg = (dx, sw, c1, c2) => {
    const kx = px0 + dx + 1 + sw, ky = py0 + 2;
    cap(p, px0 + dx, py0, kx, ky, 1.2, 0.9, c1);
    p.line(kx, ky, kx - 1 - sw * 0.5, ky + 2 - P.legs, c1[1]);
    p.px(kx - 1 - sw * 0.5, ky + 3 - P.legs, c2); p.px(kx - sw * 0.5, ky + 3 - P.legs, c2); // Huf
  };
  leg(-1, Math.sin(P.tail) * 0.8, SKIN.slice(0, 3), CHAR[0]);

  // Körper
  ell(p, chx, chy + 2.5, 3.2, 4, SKIN, { rot: lean * 0.3 });
  ell(p, px0 - 0.2, py0 - 0.5, 2.6, 2, SKIN, { bias: -0.05 });
  // Glut im Bauch: glühende Risse in der Brust (Licht kommt von innen)
  p.px(chx + 1, chy + 2, LAVA[3]); p.px(chx + 1, chy + 3, LAVA[4]); p.px(chx + 2, chy + 4, LAVA[2]); p.px(chx, chy + 4, LAVA[2]);
  p.px(chx - 1, chy + 1, SKIN[5]);
  g.px(chx + 1, chy + 3, GLOW[3]); g.px(chx + 1, chy + 2, GLOW[2]); g.px(chx + 2, chy + 4, GLOW[1]); g.px(chx, chy + 4, GLOW[1]);
  if (p.fine) {
    // Handfein: Bauchriss mit weißglühendem Kern, Rippenkanten im Licht, Nabelglut
    const bx = p.snap(chx), by = p.snap(chy);
    p.fline(bx + 1.5, by + 2, bx + 1.5, by + 3.5, LAVA[5]); p.fline(bx + 1.5, by + 4, bx + 2.5, by + 4.5, LAVA[3]); p.fline(bx + 1, by + 4, bx + 0.5, by + 4.5, LAVA[3]);
    g.fline(bx + 1.5, by + 2, bx + 1.5, by + 3.5, GLOW[4]);
    p.fline(bx - 1.5, by + 0.5, bx - 0.5, by + 1, SKIN[4]); p.fline(bx - 1.5, by + 2, bx - 0.5, by + 2.5, SKIN[3]);
    p.dot(bx - 1, by + 1, SKIN[5]); p.dot(bx + 2.5, by + 1.5, SKIN[1]);
  }
  leg(1, -Math.sin(P.tail) * 0.8, SKIN.slice(1, 5), CHAR[2]);

  // hinterer Arm
  const shB = [chx - 1, chy + 0.5];
  const hB = [shB[0] + Math.cos(P.armB) * 4, shB[1] + Math.sin(P.armB) * 4];
  cap(p, shB[0], shB[1], hB[0], hB[1], 1, 0.8, SKIN.slice(0, 3));
  p.px(hB[0] + 1, hB[1], HORN[1]);

  // vorderer Flügel – vor dem Kopf gezeichnet, damit das Gesicht frei bleibt
  batWing(p, g, chx - 1, chy - 1, -2.0 + P.wing * 0.9, 11, MEMB, SKIN, true);

  // Flammenhaar: wächst aus dem Hinterkopf und weht nach hinten (hinter dem Kopf)
  if (P.flame > 0.05) {
    const fh = Math.round(3 + P.flame * 5);
    flame(p, g, hx - 3, hy - 1, fh, 1.5 + P.flame * 0.6, P.fl, { lean: -0.9 - Math.max(0, P.bx) * 0.05, seed: 2 });
    flame(p, g, hx - 1, hy - 3, fh - 2, 1.0, P.fl + 1.7, { lean: -0.7, seed: 7 });
  }
  // Kopf: rund, große Wangen, Licht oben links
  ell(p, hx, hy, 4.4, 3.8, SKIN, { bias: 0.04 });
  p.px(hx - 2, hy - 2, SKIN[5]); p.px(hx - 1, hy - 3, SKIN[5]);
  // Hörner: kräftig, nach hinten oben gebogen, Knochen mit Lichtkante
  p.line(hx - 1, hy - 3, hx - 3, hy - 5, HORN[1]); p.line(hx - 2, hy - 3, hx - 4, hy - 5, HORN[2]);
  p.px(hx - 5, hy - 6, HORN[4]); p.px(hx - 4, hy - 6, HORN[3]);
  p.line(hx + 1, hy - 3, hx + 1, hy - 5, HORN[2]); p.line(hx + 2, hy - 3, hx + 2, hy - 4, HORN[1]);
  p.px(hx, hy - 6, HORN[3]); p.px(hx - 1, hy - 7, HORN[4]);
  // Spitzes Fledermausohr
  poly(p, [[hx - 2.5, hy - 1], [hx - 6, hy - 3], [hx - 2.5, hy + 1]], SKIN[2]);
  p.px(hx - 4, hy - 2, SKIN[0]); p.px(hx - 5, hy - 3, SKIN[4]);
  // Grinsendes Maul: Zahnreihe, glühender Schlund
  const jaw = Math.round(P.jaw * 2);
  p.rect(hx + 1, hy + 1, 4, 1 + jaw, VOID);
  p.px(hx + 1, hy + 1, HORN[3]); p.px(hx + 3, hy + 1, HORN[4]); p.px(hx + 4, hy + 1, HORN[3]);
  if (jaw) { p.px(hx + 2, hy + 1 + jaw, LAVA[3]); p.px(hx + 3, hy + jaw, LAVA[2]); g.px(hx + 2, hy + 1 + jaw, GLOW[3]); g.px(hx + 3, hy + 1 + jaw, GLOW[2]); p.px(hx + 2, hy + 1 + jaw, HORN[3]); p.px(hx + 4, hy + 1 + jaw, HORN[3]); }
  p.rect(hx + 1, hy + 2 + jaw, 3, 1, SKIN[2]); p.px(hx + 1, hy + 2 + jaw, SKIN[1]);
  p.px(hx + 5, hy, SKIN[4]);                                   // Nasenspitze
  meta.mouth = { x: hx + 4, y: hy + 1 + jaw / 2 };
  // Augen: tiefe Höhlen unter schrägem Brauenwulst, große gelbe Glutaugen
  const ec = hurt ? '#ffffff' : '#ffe070';
  p.rect(hx, hy - 1, 5, 2, VOID);
  p.px(hx, hy - 2, SKIN[5]); p.px(hx + 1, hy - 2, SKIN[4]); p.px(hx + 2, hy - 2, SKIN[2]); p.px(hx + 3, hy - 2, SKIN[4]); p.px(hx + 4, hy - 1, SKIN[3]);
  p.px(hx + 2, hy - 1, SKIN[1]); p.px(hx + 2, hy, SKIN[2]);
  if (P.eye > 0.3) {
    p.px(hx + 1, hy - 1, ec); p.px(hx + 3, hy - 1, ec); p.px(hx + 3, hy, LAVA[4]); p.px(hx + 1, hy, LAVA[3]);
    g.px(hx + 1, hy - 1, GLOW[4]); g.px(hx + 3, hy - 1, GLOW[4]); g.px(hx + 3, hy, GLOW[3]); g.px(hx + 1, hy, GLOW[2]);
  } else { p.px(hx + 1, hy - 1, SKIN[1]); p.px(hx + 3, hy - 1, SKIN[1]); }
  if (p.fine) impFace(p, g, P, p.snap(hx), p.snap(hy), jaw, ec);
  meta.eye = { x: hx + 2, y: hy - 1 };
  meta.head = { x: hx, y: hy - 4 };

  // vorderer Arm mit Krallen
  const shF = [chx + 1.5, chy + 0.5];
  const hF = [shF[0] + Math.cos(P.arm) * 4.5, shF[1] + Math.sin(P.arm) * 4.5];
  cap(p, shF[0], shF[1], hF[0], hF[1], 1.2, 0.9, SKIN.slice(1));
  p.px(shF[0] - 1, shF[1] - 1, SKIN[5]);
  const ca = P.arm + 0.4 * (1 - P.claw);
  for (let k = -1; k <= 1; k++) {
    const a = ca + k * 0.5;
    p.px(hF[0] + Math.cos(a) * 1.5, hF[1] + Math.sin(a) * 1.5, HORN[3]);
    p.px(hF[0] + Math.cos(a) * 2.4, hF[1] + Math.sin(a) * 2.4, HORN[4]);
    // fein: Kralle läuft spitz aus, dunkle Unterkante
    if (p.fine) { p.dot(hF[0] + Math.cos(a) * 3.1, hF[1] + Math.sin(a) * 3.1, HORN[4]); p.dot(hF[0] + Math.cos(a) * 1.8 + 0.5, hF[1] + Math.sin(a) * 1.8 + 0.5, HORN[1]); }
  }
  if (p.fine) { p.dot(shF[0] - 0.5, shF[1] - 0.5, SKIN[5]); p.dot(shF[0], shF[1] - 1, SKIN[5]); }
  meta.hand = { x: hF[0], y: hF[1] };

  if (ex.smear) arcSmear(p, g, shF[0], shF[1], ex.smear[0], ex.smear[1], 3, 8, ['#8a5040', '#e8a070', '#fff0d0'], 13);
  // Feuerspucke
  if (P.spit > 0.05) {
    const m = meta.mouth;
    for (let i = 0; i < 5; i++) {
      const r = (0.8 + i * 0.5) * P.spit;
      const x = m.x + 1 + i * 2.2 * P.spit, y = m.y + Math.sin(i * 1.7 + P.fl) * 0.6;
      ell(p, x, y, r, r * 0.8, [LAVA[2], LAVA[3], LAVA[4], LAVA[5]], { bias: 0.15 });
      glowDot(g, x, y, r);
    }
  }
  return meta;
}

// Liegender Wicht: verkohlt, Flügel flach, Flamme erlischt (k 0..1)
function drawImpCorpse(p, g, k) {
  const { AX, AY } = IMP;
  const cx = AX, cy = AY - 2;
  // flacher Flügel
  poly(p, [[cx - 9, cy + 1], [cx - 2, cy - 3], [cx + 1, cy + 1]], MEMB[1]);
  p.line(cx - 9, cy + 1, cx - 2, cy - 3, SKIN[1]);
  ell(p, cx, cy, 4, 2.2, k > 0.6 ? CHAR : SKIN.slice(0, 4));
  ell(p, cx + 4.5, cy - 0.5, 2.6, 2.2, k > 0.6 ? CHAR : SKIN.slice(0, 4));
  p.line(cx + 5, cy - 2, cx + 3, cy - 4, HORN[2]);
  p.line(cx - 4, cy + 1, cx - 8, cy + 2, SKIN[1]); p.px(cx - 9, cy + 2, SKIN[2]);
  const glow = 1 - k;
  if (glow > 0.2) { p.px(cx + 1, cy, LAVA[2]); g.px(cx + 1, cy, GLOW[2]); flame(p, g, cx + 4, cy - 2, Math.round(1 + glow * 3), 1, k * 6, { seed: 4 }); }
  else { p.px(cx + 1, cy, LAVA[0]); p.px(cx + 5, cy - 1, LAVA[1]); g.px(cx + 5, cy - 1, GLOW[0]); }
  if (p.fine) {
    // fein: Flügelknochen mit Lichtkante, Membranader, Horn mit heller Spitze, erlöschendes Auge
    p.fline(cx - 8.5, cy + 0.5, cx - 2, cy - 3.5, SKIN[3]); p.fline(cx - 6, cy, cx - 2.5, cy - 1.5, MEMB[0]);
    p.fline(cx + 5, cy - 2.5, cx + 3.5, cy - 4, HORN[4]); p.dot(cx + 3, cy - 4, '#fffbef');
    p.dot(cx + 5.5, cy - 1, glow > 0.2 ? LAVA[5] : LAVA[2]); p.dot(cx + 6.5, cy, VOID); p.dot(cx + 4, cy - 2, k > 0.6 ? CHAR[3] : SKIN[5]);
  }
  return { eye: { x: cx + 5, y: cy - 1 }, mouth: { x: cx + 6, y: cy }, hand: { x: cx + 2, y: cy }, head: { x: cx + 4, y: cy - 3 } };
}

function createImp() {
  const S = { ...IMP, draw: drawImp };
  const idle = [];
  for (let i = 0; i <= 6; i++) {
    const ph = (i / 6) * Math.PI * 2;
    idle.push([i / 6, ip({ hov: 10 - Math.sin(ph) * 1.2, wing: Math.cos(ph * 2) * 0.8, wingB: Math.cos(ph * 2 + 0.4) * 0.8, tail: ph, fl: ph * 2, arm: 0.7 + Math.sin(ph) * 0.15, legs: Math.max(0, Math.sin(ph)) }), linear]);
  }
  const walk = [];
  for (let i = 0; i <= 6; i++) {
    const ph = (i / 6) * Math.PI * 2;
    walk.push([i / 6, ip({ hov: 11 - Math.sin(ph * 2) * 1.5, lean: 0.35, bx: 1, wing: Math.cos(ph * 2) * 1.2, wingB: Math.cos(ph * 2 + 0.5) * 1.2, tail: ph * 1.5, fl: ph * 2, arm: 1.1, armB: 1.6, legs: 1 }), linear]);
  }
  const w1 = ip({ hov: 12, bx: -2, lean: -0.35, wing: 1.3, wingB: 1.2, arm: -2.2, armB: 2.2, jaw: 0.6, fl: 1, flame: 1.3 });
  const w2 = ip({ hov: 13, bx: -3, lean: -0.5, wing: 1.5, wingB: 1.4, arm: -2.6, armB: 2.4, jaw: 1, fl: 2, flame: 1.6, tail: 2 });
  const s1 = ip({ hov: 9, bx: 3, lean: 0.6, wing: -0.8, wingB: -0.7, arm: 0.3, claw: 1, jaw: 1, spit: 0.7, fl: 3, flame: 1.3, tail: 3 });
  const s2 = ip({ hov: 8, bx: 4, lean: 0.7, wing: -1.2, wingB: -1.1, arm: 1.3, claw: 1, jaw: 1, spit: 1, fl: 4, flame: 1.2, tail: 4 });
  const s3 = ip({ hov: 9, bx: 2, lean: 0.3, wing: 0.2, wingB: 0.1, arm: 1.2, jaw: 0.3, spit: 0.3, fl: 5, tail: 5 });
  const hurtP = ip({ hov: 11, bx: -3, lean: -0.6, wing: 1.4, wingB: 1.2, arm: -1.5, armB: -2, jaw: 1, eye: 0, fl: 1, flame: 0.6 });
  const d1 = ip({ hov: 8, bx: -2, lean: -0.7, wing: 1.5, wingB: 1.5, arm: -1.2, jaw: 1, eye: 0, flame: 0.6 });
  const d2 = ip({ hov: 5, bx: 0, lean: 0.6, wing: -1.4, wingB: -1.3, arm: 1.6, armB: 2, jaw: 1, eye: 0, flame: 0.3, tail: 2 });
  return {
    idle: new Animation(track(S, idle, 6, { loop: true }), 8),
    walk: new Animation(track(S, walk, 6, { loop: true }), 12),
    windup: new Animation(track(S, [[0, idle[0][1]], [0.5, w1], [1, w2]], 4), 10, false),
    strike: new Animation(track(S, [[0, w2], [0.3, s1, snap], [0.6, s2], [1, s3]], 5, {
      extras: { 1: { smear: [-2.4, 0.4], fx: 'impact' }, 2: { smear: [-0.8, 1.3] } },
    }), 16, false),
    hurt: new Animation([...track(S, [[0, hurtP], [1, hurtP]], 1, { extras: { 0: { hurt: true } } }), ...track(S, [[0, hurtP], [1, ip({ hov: 10, lean: -0.2, wing: 0.8 })]], 1)], 10, false),
    death: new Animation([
      ...track(S, [[0, hurtP], [0.4, d1], [1, d2]], 4, { extras: { 0: { hurt: true } } }),
      still(S, (p, g) => drawImpCorpse(p, g, 0), 'impact'),
      still(S, (p, g) => drawImpCorpse(p, g, 0.5)),
      still(S, (p, g) => drawImpCorpse(p, g, 1)),
    ], 9, false),
  };
}


// ================================================================ Magmahund

const HOUND = { W: 54, H: 36, AX: 22, AY: 32, fine: true };
const HD_REST = {
  bx: 0, by: 0, pitch: 0, head: 0, jaw: 0.1, tail: 0, heat: 0.7, breath: 0,
  fAx: 0, fAy: 0, fBx: 0, fBy: 0, hAx: 0, hAy: 0, hBx: 0, hBy: 0, lie: 0,
};
const hp = (o) => ({ ...HD_REST, ...o });

function houndHead(p, g, nx, ny, jaw, heat, ex, meta) {
  // Schädel
  ell(p, nx, ny, 4.2, 3.5, OBS, { noise: 0.2, seed: 21 });
  // Oberkiefer / Schnauze
  const ja = jaw * 0.75;
  poly(p, [[nx + 1, ny - 2], [nx + 7, ny - 0.5], [nx + 8, ny + 1.5], [nx + 1, ny + 2]], (x, y) => (y < ny ? OBS[3] : OBS[2]));
  p.line(nx + 2, ny - 2, nx + 7, ny - 1, OBS[4]); p.px(nx + 8, ny + 0, OBS_SHINE);
  // Maul-Inneres (Lava)
  const c = Math.cos(ja), s = Math.sin(ja);
  const J = (u, v) => [nx + 0.5 + u * c - v * s, ny + 2 + u * s + v * c];
  if (jaw > 0.12) {
    poly(p, [[nx + 1, ny + 1.5], [nx + 7.5, ny + 1.5], J(7, 0), J(1, 0)], LAVA[2]);
    poly(p, [[nx + 1.5, ny + 2], [nx + 6, ny + 2], J(5, -0.5)], LAVA[4]);
    for (let u = 2; u < 7; u++) { const q = J(u, -0.5); g.px(q[0], q[1], GLOW[3]); g.px(nx + u, ny + 2, GLOW[2]); }
    g.px(nx + 3, ny + 3, GLOW[4]);
  }
  // Unterkiefer
  poly(p, [J(0, -0.5), J(7, -0.5), J(6.5, 1.5), J(0, 1.5)], OBS[1]);
  const t1 = J(6, -1), t2 = J(3.5, -1);
  p.px(t1[0], t1[1], MASK[4]); p.px(t2[0], t2[1], MASK[3]);
  p.px(nx + 7, ny + 2, MASK[4]); p.px(nx + 4, ny + 2, MASK[3]);
  // Glühende Lefze/Kinnlava
  if (heat > 0.3) { const q = J(4, 0.5); p.px(q[0], q[1], LAVA[2]); g.px(q[0], q[1], GLOW[2]); }
  meta.mouth = { x: nx + 7, y: ny + 2 + jaw * 3 };
  // Ohren: zurückgelegte Obsidiansplitter
  poly(p, [[nx - 2, ny - 2], [nx - 7, ny - 5], [nx, ny - 3]], OBS[3]);
  p.line(nx - 2, ny - 3, nx - 6, ny - 5, OBS_SHINE);
  // Auge
  const ec = ex.hurt ? '#ffffff' : LAVA[4];
  p.px(nx + 1, ny - 1, ec); p.px(nx + 2, ny - 1, LAVA[3]);
  g.px(nx + 1, ny - 1, GLOW[4]); g.px(nx + 2, ny - 1, GLOW[3]); g.px(nx + 3, ny - 1, GLOW[1]);
  meta.eye = { x: nx + 1, y: ny - 1 };
  meta.head = { x: nx, y: ny - 4 };
  // Lavarisse am Kopf
  p.px(nx - 1, ny + 1, LAVA[2]); g.px(nx - 1, ny + 1, GLOW[2]); p.px(nx - 2, ny, LAVA[1]);
  if (p.fine) {
    // Handfein: Obsidian-Glanzlinie über Stirn und Nasenrücken, Brauenkante über dem Glutauge
    // (weißer Kern, Schlitz), Nüster, Reißzähne mit Spitze, Lefzenglut
    const x = p.snap(nx), y = p.snap(ny);
    p.fline(x - 2, y - 3, x + 1, y - 2.5, OBS_SHINE); p.fline(x + 2, y - 2, x + 7, y - 1, OBS_SHINE);
    p.fline(x + 2, y - 1.5, x + 6.5, y - 0.5, OBS[3]); p.dot(x + 8, y - 0.5, OBS[5]);
    p.fline(x, y - 1.5, x + 2.5, y - 1.5, OBS[0]); p.dot(x - 0.5, y - 1.5, OBS[4]);
    if (!ex.hurt) { p.dot(x + 1, y - 1, LAVA[5]); p.dot(x + 1.5, y - 1, '#ffffff'); p.dot(x + 2, y - 0.5, LAVA[2]); p.dot(x + 2.5, y - 1, LAVA[4]); g.dot(x + 1.5, y - 1, GLOW[4]); }
    p.dot(x + 8, y + 0.5, VOID); p.dot(x + 7.5, y + 1, OBS[4]);
    p.dot(x + 7, y + 3, MASK[4]); p.dot(x + 4, y + 3, MASK[3]); p.dot(x + 7.5, y + 2, MASK[2]);
    const t3 = J(6, -1.5); p.dot(t3[0], t3[1], MASK[4]);
    if (jaw > 0.12) { const q = J(3, 0.5); p.dot(q[0], q[1], LAVA[3]); p.dot(q[0], q[1] + 0.5, LAVA[2]); g.dot(q[0], q[1], GLOW[2]); }
    // Ohrsplitter: dunkle Unterkante
    p.fline(nx - 2, ny - 2, nx - 6, ny - 4.5, OBS[1]);
  }
}

function drawHound(p, g, P, ex) {
  const { AX, AY } = HOUND;
  const meta = {};
  const gy = AY;
  const hip = { x: AX - 8 + P.bx, y: gy - 14 + P.by + Math.sin(P.pitch) * 7 };
  const sh = { x: AX + 7 + P.bx, y: gy - 15 + P.by - Math.sin(P.pitch) * 7 };
  const heat = P.heat;

  const leg = (bx, by, fx, fy, l1, l2, bend, ramp, far) => {
    const k = ik(bx, by, fx, fy, l1, l2, bend);
    cap(p, bx, by, k.jx, k.jy, far ? 2.2 : 2.6, 1.6, ramp);
    cap(p, k.jx, k.jy, k.ex, k.ey - 1, 1.5, 1.3, ramp);
    p.rect(k.ex - 1, k.ey - 1, 4, 1, ramp[far ? 1 : 2]);
    p.px(k.ex + 3, k.ey - 1, far ? OBS[3] : OBS_SHINE);
    if (!far) { p.px(k.jx, k.jy, LAVA[2]); g.px(k.jx, k.jy, GLOW[2]); }
    if (p.fine) {
      // Krallen fein, Lichtkante über der Pfote, Glutkern im Gelenk
      const fx = p.snap(k.ex), fy = p.snap(k.ey);
      p.dot(fx + 4, fy - 0.5, far ? OBS[2] : OBS[5]); p.dot(fx + 2, fy - 0.5, far ? OBS[2] : OBS[4]); p.fline(fx - 1, fy - 1, fx + 2, fy - 1, ramp[far ? 2 : 4]);
      if (!far) { const jx = p.snap(k.jx), jy = p.snap(k.jy); p.dot(jx, jy, LAVA[4]); g.dot(jx, jy, GLOW[4]); }
    }
    return k;
  };
  const farR = OBS.slice(0, 4);
  // ferne Beine
  leg(hip.x + 1, hip.y + 1, AX - 9 + P.hBx, gy - P.hBy, 7, 8, 1, farR, true);
  leg(sh.x - 1, sh.y + 1, AX + 5 + P.fBx, gy - P.fBy, 7, 7, -1, farR, true);

  // Schwanz: kurze Segmente, Glutspitze
  let tx = hip.x - 4, ty = hip.y - 2;
  for (let i = 0; i < 5; i++) {
    const a = Math.PI + 0.6 - i * 0.18 + Math.sin(P.tail + i * 0.7) * 0.25;
    const nx = tx + Math.cos(a) * 2, ny = ty - Math.sin(a) * 2;
    cap(p, tx, ty, nx, ny, 1.8 - i * 0.25, 1.5 - i * 0.25, OBS);
    tx = nx; ty = ny;
  }
  flame(p, g, tx, ty, 4, 1.2, P.tail * 2, { lean: -0.4, seed: 9, hot: 0.8 * heat + 0.3 });

  // Rumpf
  cap(p, hip.x, hip.y, sh.x, sh.y, 4.6, 5.2, OBS, { noise: 0.2, seed: 11 });
  ell(p, hip.x - 0.5, hip.y, 5, 4.6, OBS, { noise: 0.2, seed: 12 });
  ell(p, sh.x, sh.y + 0.5 - P.breath * 0.5, 5.6, 5.4 + P.breath * 0.5, OBS, { noise: 0.2, seed: 13 });
  // Bauchglut
  const mx = (hip.x + sh.x) / 2, my = (hip.y + sh.y) / 2;
  veins(p, g, mx, my + 0.5, 9, 4, 31, 5, heat, { len: 7 });
  veins(p, g, sh.x, sh.y + 1, 4.5, 4.5, 33, 2, heat, { len: 5 });
  // Rückensplitter (Obsidian)
  for (let i = 0; i < 5; i++) {
    const u = i / 4, x = hip.x - 1 + (sh.x - hip.x + 1) * u, y = hip.y - 4.5 + (sh.y - hip.y) * u - Math.sin(u * Math.PI) * 0.8;
    const h = [2, 4, 3, 5, 3][i];
    poly(p, [[x - 1.5, y + 1], [x - 1 - h * 0.7, y - h], [x + 1.5, y + 1]], OBS[2]);
    p.line(x - 1, y, x - 1 - h * 0.7, y - h, OBS_SHINE); p.px(x, y, OBS[4]);
    if (p.fine) {
      // Splitter fein: Schattenfacette rechts, weiße Glanzspitze, Glutfuge am Fuß
      p.fline(x + 1, y + 0.5, x - 0.5 - h * 0.7, y - h + 1, OBS[1]); p.fline(x + 0.5, y + 0.5, x - 0.5 - h * 0.7, y - h + 1.5, OBS[3]);
      p.dot(x - 1 - h * 0.7, y - h, '#d8d0f0');
      if (heat > 0.5 && i % 2) { p.dot(x - 0.5, y + 1, LAVA[3]); g.dot(x - 0.5, y + 1, GLOW[2]); }
    }
  }
  if (p.fine) {
    // Glasfacetten auf Schulter und Kruppe (Glanzlinie 1 Feinpixel, darunter dunkle Kante)
    for (const [ox, oy, l] of [[-1.5, -3.5, 3], [0.5, -2.5, 2]]) {
      for (const c of [sh, hip]) { p.fline(c.x + ox, c.y + oy, c.x + ox + l, c.y + oy - 0.5, OBS[5]); p.fline(c.x + ox + 0.5, c.y + oy + 0.5, c.x + ox + l, c.y + oy, OBS[1]); }
    }
  }

  // nahe Beine
  leg(hip.x, hip.y + 2, AX - 7 + P.hAx, gy - P.hAy, 7, 8, 1, OBS, false);
  leg(sh.x + 1, sh.y + 2, AX + 8 + P.fAx, gy - P.fAy, 7, 7, -1, OBS, false);

  // Hals und Kopf
  const na = -0.55 + P.head - P.pitch * 0.3;
  const nx = sh.x + 4 + Math.cos(na) * 3, ny = sh.y - 2 + Math.sin(na) * 3;
  cap(p, sh.x + 2, sh.y - 1, nx, ny, 3.8, 3, OBS, { noise: 0.2, seed: 14 });
  p.px(sh.x + 3, sh.y + 1, LAVA[2]); g.px(sh.x + 3, sh.y + 1, GLOW[2]); p.px(sh.x + 4, sh.y, LAVA[3]); g.px(sh.x + 4, sh.y, GLOW[3]);
  houndHead(p, g, nx + 2, ny, P.jaw, heat, ex, meta);
  if (ex.smear) arcSmear(p, g, nx + 2, ny + 2, ex.smear[0], ex.smear[1], 5, 11, SMEAR, 17, false);
  return meta;
}

function drawHoundCorpse(p, g, k) {
  const { AX, AY } = HOUND;
  const cx = AX - 1, cy = AY - 4;
  // Beine seitlich weggestreckt
  for (const [x, a] of [[-7, 0.3], [-4, 0.6], [5, 0.2], [8, 0.5]]) cap(p, cx + x, cy + 2, cx + x + 4 + a * 3, cy + 4, 1.4, 1.2, OBS.slice(0, 4));
  ell(p, cx, cy, 10, 4.2, OBS, { noise: 0.2, seed: 12 });
  ell(p, cx + 11, cy + 1, 3.6, 3, OBS, { noise: 0.2, seed: 21 });
  poly(p, [[cx + 12, cy], [cx + 18, cy + 1], [cx + 18, cy + 3], [cx + 12, cy + 3]], OBS[2]);
  poly(p, [[cx - 9, cy - 1], [cx - 14, cy + 1], [cx - 9, cy + 2]], OBS[2]);
  for (let i = 0; i < 5; i++) { const x = cx - 7 + i * 3.5; poly(p, [[x - 1, cy - 3], [x - 2, cy - 6 - (i % 2)], [x + 1, cy - 3]], OBS[2]); p.px(x - 1, cy - 4, OBS_SHINE); }
  veins(p, g, cx, cy, 10, 3.6, 31, 6, 0.9 * (1 - k), { len: 7, dark: '#2a0c08' });
  if (k < 0.7) { p.px(cx + 16, cy + 3, LAVA[3]); g.px(cx + 16, cy + 3, GLOW[2]); }
  if (p.fine) {
    // fein: Glanzlinie auf Schädel und Schnauze, Splitter mit weißer Spitze, erloschenes Auge mit Glutrest
    p.fline(cx + 9, cy - 2, cx + 13, cy - 2.5, OBS_SHINE); p.fline(cx + 13, cy - 0.5, cx + 17.5, cy + 0.5, OBS[4]);
    for (let i = 0; i < 5; i++) { const x = cx - 7 + i * 3.5; p.dot(x - 2, cy - 6 - (i % 2), '#d8d0f0'); p.fline(x + 0.5, cy - 3, x - 1, cy - 5.5 - (i % 2), OBS[1]); }
    p.dot(cx + 12, cy, k < 0.5 ? LAVA[4] : OBS[0]); p.dot(cx + 12.5, cy, OBS[0]);
  }
  return { eye: { x: cx + 12, y: cy }, mouth: { x: cx + 17, y: cy + 2 }, head: { x: cx + 11, y: cy - 3 } };
}

function createHound() {
  const S = { ...HOUND, draw: drawHound };
  const idle = [];
  for (let i = 0; i <= 4; i++) {
    const ph = (i / 4) * Math.PI * 2;
    idle.push([i / 4, hp({ by: Math.sin(ph) * 0.6, breath: (Math.sin(ph) + 1) / 2, jaw: 0.15 + Math.max(0, Math.sin(ph)) * 0.25, tail: ph, heat: 0.6 + Math.sin(ph) * 0.25, head: Math.sin(ph) * 0.05 }), linear]);
  }
  // Trab: diagonale Beinpaare
  const walk = [];
  for (let i = 0; i <= 6; i++) {
    const ph = (i / 6) * Math.PI * 2, s = Math.sin(ph), c = Math.cos(ph);
    walk.push([i / 6, hp({
      by: -Math.abs(c) * 1.2 + 0.6, pitch: s * 0.04, head: -s * 0.06, jaw: 0.3, tail: ph * 2, heat: 0.8,
      fAx: s * 4, fAy: Math.max(0, c) * 3, hBx: s * 4, hBy: Math.max(0, c) * 3,
      fBx: -s * 4, fBy: Math.max(0, -c) * 3, hAx: -s * 4, hAy: Math.max(0, -c) * 3,
    }), linear]);
  }
  const w1 = hp({ by: 2, pitch: -0.08, head: 0.3, jaw: 0.6, heat: 0.9, fAx: 2, fBx: 1, hAx: 1, hBx: 1 });
  const w2 = hp({ by: 4, bx: -2, pitch: -0.14, head: 0.45, jaw: 0.9, heat: 1.1, fAx: 4, fBx: 3, hAx: 2, hBx: 2, tail: 2, breath: 1 });
  const s1 = hp({ by: -4, bx: 6, pitch: 0.28, head: -0.2, jaw: 1.2, heat: 1.2, fAx: 9, fAy: 6, fBx: 7, fBy: 5, hAx: -5, hAy: 1, hBx: -6, hBy: 0, tail: 3 });
  const s2 = hp({ by: -2, bx: 9, pitch: 0.12, head: 0.15, jaw: 0.1, heat: 1.2, fAx: 10, fAy: 3, fBx: 8, fBy: 2, hAx: -2, hAy: 3, hBx: -3, hBy: 2, tail: 4 });
  const s3 = hp({ by: 1, bx: 6, pitch: -0.04, head: 0.1, jaw: 0.3, heat: 0.9, fAx: 5, fBx: 4, hAx: 2, hBx: 1, tail: 5 });
  const s4 = hp({ by: 0, bx: 3, jaw: 0.3, heat: 0.8, fAx: 2, fBx: 1, tail: 6 });
  const hurtP = hp({ by: 1, bx: -2, pitch: 0.16, head: -0.45, jaw: 1, heat: 1.3, fAx: -1, fAy: 2, tail: 1 });
  const d1 = hp({ by: 2, bx: -2, pitch: 0.22, head: -0.5, jaw: 1, heat: 1, fAx: 1, fAy: 3, fBy: 2 });
  const d2 = hp({ by: 6, bx: -1, pitch: -0.12, head: 0.5, jaw: 0.8, heat: 0.7, fAx: 5, fBx: 4, hAx: -3, hBx: -2 });
  return {
    idle: new Animation(track(S, idle, 4, { loop: true }), 6),
    walk: new Animation(track(S, walk, 6, { loop: true, extras: { 0: { fx: 'step' }, 3: { fx: 'step' } } }), 12),
    windup: new Animation(track(S, [[0, idle[0][1]], [0.5, w1], [1, w2]], 4), 10, false),
    strike: new Animation(track(S, [[0, s1], [0.25, s2, snap], [0.6, s3], [1, s4]], 4, {
      extras: { 0: { smear: [-1.1, 0.5] }, 1: { fx: 'impact', smear: [-0.3, 1.1] } },
    }), 14, false),
    hurt: new Animation(track(S, [[0, hurtP], [1, hp({ bx: -1, head: -0.2, jaw: 0.5 })]], 2, { extras: { 0: { hurt: true } } }), 10, false),
    death: new Animation([
      ...track(S, [[0, hurtP], [0.5, d1], [1, d2]], 3, { extras: { 0: { hurt: true } } }),
      still(S, (p, g) => drawHoundCorpse(p, g, 0), 'impact'),
      still(S, (p, g) => drawHoundCorpse(p, g, 0.5)),
      still(S, (p, g) => drawHoundCorpse(p, g, 1)),
    ], 8, false),
  };
}


// ================================================================ Aschegolem

const GOLEM = { W: 60, H: 52, AX: 28, AY: 48, fine: true };
const GL_REST = {
  hipX: 0, hipY: 0, lean: 0.05, head: 0, heat: 0.7,
  fFx: 5, fFy: 0, fBx: -6, fBy: 0,
  hFx: 12, hFy: 10, hBx: -11, hBy: 9, fist: 0,
};
const gp = (o) => ({ ...GL_REST, ...o });
const ASH_D = ASH.slice(0, 5);

function rock(p, g, x, y, r, ramp, seed, heat, cracks = 1, rim = 0) {
  ell(p, x, y, r, r * 0.92, ramp, { noise: 0.22, seed, rim });
  // kantige Facetten: helle Oberkante, dunkle Kerbe
  p.px(x - r * 0.5, y - r * 0.6, ramp[ramp.length - 1]);
  p.px(x - r * 0.2, y - r * 0.75, ramp[ramp.length - 2]);
  if (cracks && r > 2.5) veins(p, g, x, y, r, r, seed + 5, cracks, heat, { len: Math.round(r * 1.3) });
  if (p.fine && r > 1.8) rockFine(p, x, y, r, ramp, seed);
}

// Handfein: Gesteinskanten – Lichtkante oben links (1 Feinpixel), eine Bruchfacette quer über den Brocken
// (helle Fläche über dunkler Kante) und ein kalter Haarriss mit Lichtlippe (je Brocken anders, wandert mit).
function rockFine(p, x, y, r, ramp, seed) {
  const n = ramp.length, ry = r * 0.92;
  for (let a = -2.75; a <= -0.95; a += 0.5 / r) p.dot(x + Math.cos(a) * (r - 0.35), y + Math.sin(a) * (ry - 0.35), ramp[n - 2]);
  const fa = -0.4 + hash2(seed, 1, 77) * 0.8, fl = r * (0.5 + hash2(seed, 2, 77) * 0.3);
  const fx = x - r * 0.15, fy = y - r * 0.2 + hash2(seed, 3, 77) * r * 0.3;
  const ax = fx - Math.cos(fa) * fl, ay = fy - Math.sin(fa) * fl * 0.6, bx = fx + Math.cos(fa) * fl, by = fy + Math.sin(fa) * fl * 0.6;
  p.fline(ax, ay, bx, by, ramp[n - 1]); p.fline(ax, ay + 0.5, bx, by + 0.5, ramp[1]);
  if (r > 3.5) {
    const cx0 = x + r * (0.1 + hash2(seed, 4, 77) * 0.3), cy0 = y + r * 0.15;
    const cx1 = cx0 + r * 0.35, cy1 = cy0 + r * 0.45, cx2 = cx1 - r * 0.1, cy2 = cy1 + r * 0.25;
    p.fline(cx0, cy0, cx1, cy1, ramp[0]); p.fline(cx1, cy1, cx2, cy2, ramp[0]);
    p.fline(cx0 + 0.5, cy0, cx1 + 0.5, cy1, ramp[3]);
  }
}

function drawAshGolem(p, g, P, ex) {
  const { AX, AY } = GOLEM;
  const meta = {};
  const gy = AY;
  const hip = { x: AX + P.hipX, y: gy - 11 + P.hipY };
  const lean = P.lean;
  const ch = { x: hip.x + Math.sin(lean) * 13, y: hip.y - Math.cos(lean) * 13 };
  const px = Math.cos(lean), py = Math.sin(lean);
  const shF = { x: ch.x + px * 8, y: ch.y + py * 8 - 3 }, shB = { x: ch.x - px * 8, y: ch.y - py * 8 - 4 };
  const heat = P.heat;
  const dark = ['#141213', '#1f1c1d', '#2c2829', '#3b3637'];

  const legDraw = (hx, hy, fx, fy, ramp, back) => {
    const k = ik(hx, hy, fx, fy, 6, 6, -1);
    cap(p, hx, hy, k.jx, k.jy, 4, 3.4, ramp, { noise: 0.15, seed: 3 });
    cap(p, k.jx, k.jy, k.ex, k.ey - 2, 3.4, 3.8, ramp, { noise: 0.15, seed: 4 });
    ell(p, k.ex + 1, k.ey - 2, 5, 2.6, ramp, { noise: 0.15, seed: 5 });
    if (!back) { p.px(k.jx + 1, k.jy, LAVA[2]); g.px(k.jx + 1, k.jy, GLOW[2]); p.px(k.jx + 1, k.jy + 1, LAVA[1]); }
  };
  const armDraw = (sh, hx, hy, ramp, back, seed) => {
    const k = ik(sh.x, sh.y, hx, hy, 8, 8, 1);
    cap(p, sh.x, sh.y, k.jx, k.jy, 3.4, 3, ramp, { noise: 0.15, seed, rim: back ? 0 : 1 });
    cap(p, k.jx, k.jy, k.ex, k.ey, 3.2, 3.6, ramp, { noise: 0.15, seed: seed + 1, rim: back ? 0 : 1 });
    rock(p, g, k.ex + (back ? 0 : 1), k.ey + 1, 4.6 + P.fist * 0.6, ramp, seed + 2, heat * (back ? 0.6 : 1.1), back ? 1 : 2, back ? 0 : 1);
    return k;
  };

  // hinten: Bein, Arm, Schulterfels
  legDraw(hip.x - 3, hip.y, AX + P.fBx, gy - P.fBy, dark, true);
  armDraw(shB, ch.x + P.hBx, ch.y + P.hBy, dark, true, 40);
  rock(p, g, shB.x, shB.y, 5, dark, 60, heat * 0.5, 0);

  // Becken + Rumpf: ein großer, leicht nach vorn gekippter Brocken
  ell(p, hip.x, hip.y, 7, 4.5, ASH.slice(0, 5), { noise: 0.15, seed: 7 });
  ell(p, ch.x, ch.y + 1, 10, 9, ASH, { noise: 0.15, seed: 8, rot: lean, bias: 0.06 });
  // Schichtkanten (Sedimentbänder) quer über die Brust
  for (const [dy, w] of [[-4, 7], [3, 8]]) {
    for (let x = -w; x <= w; x++) {
      const yy = ch.y + dy + Math.round(x * py) + (x % 3 === 0 ? 0 : 0);
      p.px(ch.x + x, yy, ASH[1]); p.px(ch.x + x, yy - 1, ASH[x < 0 ? 5 : 4]);
    }
    // fein: Bandkante als Feinpixel-Grat, darunter eine Schattenkerbe
    if (p.fine) { const y0 = p.snap(ch.y + dy - w * py), y1 = p.snap(ch.y + dy + w * py); p.fline(ch.x - w, y0 - 1, ch.x + w, y1 - 1, '#a29a96'); p.fline(ch.x - w, y0 + 0.5, ch.x + w, y1 + 0.5, ASH[0]); }
  }
  // Kernriss in der Brust
  const cx = ch.x + px * 2, cy = ch.y + 0.5;
  veins(p, g, ch.x, ch.y + 1, 9, 8, 50, 5, heat, { len: 7 });
  p.ellipse(cx, cy, 2, 2.6, LAVA[1]); p.ellipse(cx, cy, 1.2, 1.8, LAVA[3]); p.px(cx, cy, LAVA[5]);
  glowDot(g, cx, cy, 1.6 + heat);
  if (p.fine) {
    // Kernriss: weißer Kern im gelben Saum, gezackte Bruchkante oben links im Licht
    p.ellipse(cx, cy - 0.2, 0.7, 1.1, LAVA[4]); p.dot(cx - 0.25, cy - 0.5, '#ffffff'); p.dot(cx - 0.25, cy, LAVA[5]);
    p.fline(cx - 2.5, cy - 1.5, cx - 1, cy - 3, ASH[5]); p.fline(cx + 1.5, cy + 2.5, cx + 0.5, cy + 3, ASH[0]);
  }
  meta.chest = { x: cx, y: cy };

  // vorderes Bein
  legDraw(hip.x + 3, hip.y + 1, AX + P.fFx, gy - P.fFy, ASH, false);

  // Kopf: klein, tief zwischen den Schultern, mit Stirnwulst
  const hx = ch.x + px * 2 + P.head, hy = ch.y - 10 + py * 2;
  ell(p, hx, hy, 4, 3.4, ASH, { noise: 0.15, seed: 61, rim: 1, bias: 0.05 });
  p.rect(hx - 3, hy - 2.5, 7, 1, ASH[5]); p.rect(hx - 1, hy - 1.5, 6, 1, ASH[1]);
  const ec = ex.hurt ? '#ffffff' : LAVA[4];
  p.rect(hx, hy - 0.5, 4, 1, ec); p.px(hx + 1, hy - 0.5, LAVA[5]);
  g.rect(hx, hy - 0.5, 4, 1, GLOW[3]); g.px(hx + 1, hy - 0.5, GLOW[4]); g.px(hx + 4, hy - 0.5, GLOW[1]);
  p.px(hx + 2, hy + 2, LAVA[1]); p.px(hx + 3, hy + 2, VOID);
  if (p.fine) {
    // Handfein: Stirnwulst mit Lichtkante und Bruchkerbe, Sehschlitz mit weißglühendem Kern im Glutsaum,
    // Wangenkante, Mundriss mit Glutfaden
    const x = p.snap(hx), y = p.snap(hy);
    p.fline(x - 3, y - 2.5, x + 3.5, y - 3, '#a29a96'); p.dot(x + 1, y - 2.5, ASH[2]); p.dot(x + 1.5, y - 2, ASH[1]);
    p.fline(x - 0.5, y - 1, x + 4, y - 1, VOID);
    if (!ex.hurt) { p.fline(x + 0.5, y - 0.5, x + 3, y - 0.5, LAVA[5]); p.dot(x + 1, y - 0.5, '#ffffff'); p.fline(x, y, x + 3.5, y, LAVA[3]); g.fline(x + 0.5, y - 0.5, x + 3, y - 0.5, GLOW[4]); }
    p.fline(x + 3.5, y + 0.5, x + 4, y + 2, ASH[4]); p.dot(x - 1, y + 1, ASH[1]);
    p.fline(x + 1.5, y + 2, x + 3, y + 2.5, LAVA[3]); g.dot(x + 2, y + 2, GLOW[2]);
  }
  meta.eye = { x: hx + 2, y: hy };
  meta.head = { x: hx, y: hy - 4 };

  // vorderer Schulterfels und Arm
  rock(p, g, shF.x, shF.y, 5.2, ASH, 62, heat, 1, 1);
  p.px(shF.x - 3, shF.y - 4, ASH[5]); p.px(shF.x - 2, shF.y - 5, ASH[5]);
  const k = armDraw(shF, ch.x + P.hFx, ch.y + P.hFy, ASH, false, 70);
  meta.hand = { x: k.ex + 1, y: k.ey + 1 };
  if (ex.smear) arcSmear(p, g, shF.x, shF.y, ex.smear[0], ex.smear[1], 12, 20, SMEAR, 19, false);
  if (ex.dust) dustRing(p, g, k.ex + 2, gy - 1, ex.dust, 23, [ASH[3], ASH[4], ASH[2]]);
  return meta;
}

function drawGolemRubble(p, g, k) {
  const { AX, AY } = GOLEM;
  const gy = AY;
  const heat = 0.9 * (1 - k);
  const rocks = [[-12, 3, 4], [-6, 5, 5.5], [2, 6, 7], [10, 4, 5], [16, 2, 3.5], [-2, 10 - k * 3, 5], [6, 11 - k * 4, 4], [-9, 8 - k * 3, 3.5], [20, 2, 2.5], [-17, 2, 2.5]];
  rocks.forEach(([x, h, r], i) => rock(p, g, AX + x, gy - h + (k * (i % 3)), r, i % 2 ? ASH : ASH_D, 80 + i, heat, r > 4 ? 1 : 0));
  // Kopf obenauf
  const hx = AX + 3, hy = gy - 15 + k * 5;
  ell(p, hx, hy, 4, 3.4, ASH, { noise: 0.22, seed: 61 });
  p.rect(hx + 1, hy, 3, 1, heat > 0.2 ? LAVA[3] : ASH[0]);
  if (heat > 0.2) g.rect(hx + 1, hy, 3, 1, GLOW[3]);
  if (p.fine) {
    // fein: Stirnwulst mit Lichtkante, Sehschlitz mit Kern (erlischt), Bruchkante am Kopf
    p.fline(hx - 3, hy - 2, hx + 3, hy - 2.5, '#a29a96'); p.fline(hx + 1, hy - 0.5, hx + 4, hy - 0.5, VOID);
    if (heat > 0.2) { p.fline(hx + 1.5, hy, hx + 3, hy, LAVA[5]); g.fline(hx + 1.5, hy, hx + 3, hy, GLOW[4]); }
    p.fline(hx - 3, hy + 1, hx - 1, hy + 2.5, ASH[0]);
  }
  return { eye: { x: hx + 2, y: hy }, head: { x: hx, y: hy - 4 }, hand: { x: AX + 10, y: gy - 4 }, chest: { x: AX + 2, y: gy - 6 } };
}

// Randlicht des Aschegolems: kühles Aschgrau oben, Glutsaum an den Seiten
const GOLEM_RIM = { top: '#c4b8ae', side: '#8a6a5c', glowTop: '#9c867a', glowSide: '#6c3a26', k: 0.5 };

function createAshGolem() {
  const S = { ...GOLEM, draw: drawAshGolem };
  const idle = [];
  for (let i = 0; i <= 4; i++) {
    const ph = (i / 4) * Math.PI * 2, s = Math.sin(ph);
    idle.push([i / 4, gp({ hipY: Math.max(0, s) * 1, lean: 0.05 + s * 0.02, hFx: 12, hFy: 10 + Math.max(0, s), hBx: -11, hBy: 9 + Math.max(0, s), heat: 0.65 + s * 0.2 }), linear]);
  }
  const walk = [];
  for (let i = 0; i <= 8; i++) {
    const ph = (i / 8) * Math.PI * 2, s = Math.sin(ph), c = Math.cos(ph);
    walk.push([i / 8, gp({
      hipX: 1, hipY: 1 - Math.abs(c) * 1.5, lean: 0.12 + s * 0.03, head: s * 0.5,
      fFx: 2 + s * 6, fFy: Math.max(0, -c) * 3, fBx: -3 - s * 6, fBy: Math.max(0, c) * 3,
      hFx: 12 - s * 3, hFy: 10, hBx: -11 + s * 3, hBy: 9, heat: 0.8,
    }), linear]);
  }
  const w1 = gp({ lean: -0.05, hipY: 1, hFx: 5, hFy: -6, hBx: -1, hBy: -6, fFx: 6, fBx: -7, heat: 0.9 });
  const w2 = gp({ lean: -0.18, hipY: -1, hFx: 3, hFy: -19, hBx: -3, hBy: -18, fFx: 7, fBx: -8, fBy: 1, heat: 1.2, fist: 1 });
  const s1 = gp({ lean: 0.25, hipY: 2, hFx: 12, hFy: -4, hBx: 7, hBy: -4, fFx: 8, fBx: -8, heat: 1.2, fist: 1 });
  const s2 = gp({ lean: 0.45, hipY: 5, hFx: 13, hFy: 17, hBx: 8, hBy: 17, fFx: 9, fBx: -9, heat: 1.3, fist: 1 });
  const s3 = gp({ lean: 0.4, hipY: 5, hFx: 13, hFy: 17, hBx: 8, hBy: 17, fFx: 9, fBx: -9, heat: 1 });
  const s4 = gp({ lean: 0.15, hipY: 2, hFx: 12, hFy: 10, hBx: -10, hBy: 9, fFx: 7, fBx: -7, heat: 0.8 });
  const hurtP = gp({ lean: -0.15, hipX: -2, head: -1, hFx: 8, hFy: 9, hBx: -11, hBy: 9, heat: 1.3 });
  const d1 = gp({ lean: -0.2, hipX: -2, hipY: 2, head: -1, hFx: 7, hFy: 11, hBx: -11, hBy: 11, heat: 1.1 });
  const d2 = gp({ lean: 0.3, hipY: 7, head: 1, hFx: 10, hFy: 16, hBx: 4, hBy: 18, fFx: 7, fBx: -8, heat: 0.7 });
  return rimGlow({
    idle: new Animation(track(S, idle, 4, { loop: true }), 5),
    walk: new Animation(track(S, walk, 8, { loop: true, extras: { 0: { fx: 'step' }, 4: { fx: 'step' } } }), 9),
    windup: new Animation(track(S, [[0, idle[0][1]], [0.45, w1], [1, w2]], 4), 7, false),
    strike: new Animation(track(S, [[0, s1], [0.25, s2, snap], [0.6, s3], [1, s4]], 5, {
      extras: { 0: { smear: [-1.9, -0.2] }, 1: { fx: 'impact', smear: [-1.2, 1.1], dust: 9 }, 2: { dust: 12 } },
    }), 12, false),
    hurt: new Animation(track(S, [[0, hurtP], [1, gp({ lean: 0 })]], 2, { extras: { 0: { hurt: true } } }), 8, false),
    death: new Animation([
      ...track(S, [[0, hurtP], [0.5, d1], [1, d2]], 3, { extras: { 0: { hurt: true } } }),
      still(S, (p, g) => drawGolemRubble(p, g, 0), 'impact'),
      still(S, (p, g) => drawGolemRubble(p, g, 0.4)),
      still(S, (p, g) => drawGolemRubble(p, g, 1)),
    ], 7, false),
  }, GOLEM_RIM);
}


// ================================================================ Schlackenkultist

const CULT = { W: 44, H: 42, AX: 20, AY: 38, fine: true };
const CU_REST = {
  bob: 0, lean: 0, hem: 0, stepA: 0, stepB: 0, head: 0,
  hFx: 6, hFy: 9, hBx: -4, hBy: 10, ball: 2.2, fl: 0, eye: 1, wind: 0,
};
const cp = (o) => ({ ...CU_REST, ...o });

// Robe als Trapez mit ausgefranstem, glimmendem Saum (gemeinsam mit dem Akolythen)
// Fein: Feinpixel abgetastet; jede Falte zweifarbig (dunkle Talkante, helle Gratkante zum Licht), Saumrisse
// und Glutfunken je Weltpixel, die Glut mit heißem Kern.
function robe(p, g, x, top, bottom, wTop, wBot, lean, hem, ramp, char, seed, embers = 1) {
  const H = bottom - top;
  if (p.fine) { robeFine(p, g, x, top, H, wTop, wBot, lean, hem, ramp, char, seed, embers); return; }
  for (let j = 0; j <= H; j++) {
    const f = j / H;
    const cx = x + lean * (H - j) * 0.35;
    const hw = wTop + (wBot - wTop) * Math.pow(f, 0.8);
    const sway = Math.sin(hem + f * 2) * f * 1.4;
    for (let k = Math.round(-hw); k <= Math.round(hw); k++) {
      const u = (k + hw) / (2 * hw); // 0 links .. 1 rechts
      // Zerfetzter Saum
      if (j > H - 3) {
        const tear = hash2(k + 30, 3, seed) * 3;
        if (H - j < tear - 0.5 + Math.sin(hem + k) * 0.6) continue;
      }
      // Falten: senkrechte Streifen, Licht von links
      const fold = Math.sin((k - lean * j * 0.2) * 1.3 + sway) * 0.5 + 0.5;
      let t = (1 - u) * 0.55 + fold * 0.35 - f * 0.25 + 0.2;
      let ci = clamp(Math.floor(t * ramp.length), 0, ramp.length - 1);
      let c = ramp[ci];
      if (f > 0.72) c = char[clamp(Math.floor(t * char.length), 0, char.length - 1)];
      p.px(cx + k + sway, top + j, c);
      if (embers && f > 0.78 && hash2(k + 50, j, seed) < 0.07 * embers) {
        p.px(cx + k + sway, top + j, LAVA[3]); g.px(cx + k + sway, top + j, GLOW[2]);
      }
    }
  }
}

function robeFine(p, g, x, top, H, wTop, wBot, lean, hem, ramp, char, seed, embers) {
  // Spannen wie im Original: Weltpixel round(-hw)..round(hw) ab cx+sway, also Mitte cx+sway+0.5 und
  // halbe Breite hw+0.5 – hier stetig abgetastet, damit die A-Linie in halben Pixeln weich nach unten aufgeht.
  const q = p.step, put = pen(p);
  for (let j = 0; j <= Math.floor(H) + 1 - q; j += q) {
    const f = j / H;
    const cx = x + lean * (H - j) * 0.35;
    const hw = wTop + (wBot - wTop) * Math.pow(Math.min(1, f), 0.8);
    const sway = Math.sin(hem + f * 2) * f * 1.4;
    // Schultern abgerundet: die obersten Reihen laufen schräg ein, statt als flache Kante (mit Mondlicht-Saum) abzuschließen
    const sh = Math.max(0, 1.6 - j) * 0.9;
    const c0 = cx + sway + 0.5, Y = Math.floor((top + j + q / 2) / q) * q;   // Feinzeile wie dot()
    const X0 = Math.ceil((c0 - hw - 0.5 + sh - q / 2) / q) * q, X1 = c0 + hw + 0.5 - sh - q / 2;
    for (let X = X0; X <= X1 + 1e-6; X += q) {
      const k = X + q / 2 - c0, kw = Math.round(k), u = clamp((k + hw) / (2 * hw), 0, 1);
      // Zerfetzter Saum (Rissbreite je Weltspalte, Rissende fein)
      if (j > H - 3) {
        const tear = hash2(kw + 30, 3, seed) * 3;
        if (H - j < tear - 0.5 + Math.sin(hem + kw) * 0.6) continue;
      }
      const ph = (k - lean * j * 0.2) * 1.3 + sway, fold = Math.sin(ph) * 0.5 + 0.5;
      const t = (1 - u) * 0.55 + fold * 0.35 - f * 0.25 + 0.2;
      const rr = f > 0.72 ? char : ramp;
      let ci = clamp(Math.floor(t * rr.length), 0, rr.length - 1);
      // Falten zweifarbig: Tal (Sinus unten) eine Stufe dunkler, Grat auf der Lichtseite eine Stufe heller
      if (fold < 0.07 || j < 1) ci = Math.max(0, ci - 1);       // j<1: Schatten unter der Kapuze
      else if (fold > 0.9 && Math.cos(ph) > 0) ci = Math.min(rr.length - 1, ci + 1);
      put(X, Y, rr[ci]);
    }
  }
  // Saumglut wie im Original je Weltpixel (gleiche Stellen, gleiche Farbe LAVA[3]), fein mit heißem Kern oben links
  if (!embers) return;
  for (let j = 0; j <= H; j++) {
    const f = j / H;
    if (f <= 0.78) continue;
    const cx = x + lean * (H - j) * 0.35, hw = wTop + (wBot - wTop) * Math.pow(f, 0.8);
    const sway = Math.sin(hem + f * 2) * f * 1.4;
    for (let k = Math.round(-hw); k <= Math.round(hw); k++) {
      if (j > H - 3 && H - j < hash2(k + 30, 3, seed) * 3 - 0.5 + Math.sin(hem + k) * 0.6) continue;
      if (hash2(k + 50, j, seed) >= 0.07 * embers) continue;
      const X = Math.round(cx + k + sway), Y = Math.round(top + j);
      p.px(X, Y, LAVA[3]); g.px(X, Y, GLOW[2]); p.dot(X, Y, LAVA[4]); g.dot(X, Y, GLOW[3]);
    }
  }
}

// Handfein: Kapuzenrand im Licht mit Faltenkerbe, Schattenkante im Kapuzeninneren, Maske mit Stirnhörnchen,
// Wangenknochen, Nasengrat und Kinnkante; Augenhöhlen dunkel mit Glutpupille (weißer Kern), feiner Maskenriss.
function cultistFace(p, g, P, ex, hx, hy, mx, my, ec) {
  // Kapuze: Lichtkante oben links, Faltenkerbe, Saum der Öffnung hell/dunkel zweifarbig
  for (let a = -2.9; a <= -1.1; a += 0.12) p.dot(hx - 0.5 + Math.cos(a) * 4.2, hy + Math.sin(a) * 4.2, ROBE[4]);
  p.fline(hx - 2.5, hy - 2.5, hx - 1, hy + 2, ROBE[1]); p.fline(hx - 2, hy - 2.5, hx - 0.5, hy + 1.5, ROBE[3]);
  p.fline(mx - 1.5, my - 1, mx - 1.5, my + 5, ROBE[4]); p.fline(mx - 1, my - 0.5, mx - 1, my + 5, VOID);
  // Maske: Stirn, Hörnchen, Wangenknochen, Nasengrat, Kinn
  p.fline(mx - 0.5, my, mx + 3, my - 0.5, MASK[4]); p.dot(mx + 0.5, my - 1, MASK[4]); p.dot(mx + 2.5, my - 1, MASK[3]); p.dot(mx + 2.5, my - 1.5, MASK[4]);
  p.fline(mx + 1, my + 1, mx + 1, my + 3, MASK[4]); p.dot(mx + 1.5, my + 3, MASK[1]);
  p.fline(mx - 0.5, my + 3, mx + 0.5, my + 3.5, MASK[3]); p.fline(mx + 3, my + 3, mx + 3, my + 4, MASK[2]);
  p.fline(mx + 0.5, my + 4.5, mx + 2.5, my + 4.5, MASK[2]); p.dot(mx + 1.5, my + 5.5, MASK[1]);
  p.fline(mx + 0.5, my + 4, mx + 2, my + 4, '#2a1a14');                    // Mundschlitz
  // Riss quer über die Maske, unten eine Glutader
  p.fline(mx + 2, my + 0.5, mx + 1.5, my + 2.5, MASK[1]); p.fline(mx + 1.5, my + 2.5, mx + 2.5, my + 3.5, MASK[1]);
  // Augen: Höhle mit Glutpupille
  for (const e of [mx, mx + 2]) {
    p.dot(e - 0.5, my + 1.5, VOID); p.dot(e + 0.5, my + 1.5, VOID); p.dot(e, my + 2, '#2a0a06'); p.dot(e, my + 1, MASK[0]);
    if (P.eye > 0.3) { p.dot(e, my + 1.5, ex.hurt ? '#ffffff' : '#fff8d8'); p.dot(e + 0.5, my + 1.5, LAVA[3]); g.dot(e, my + 1.5, GLOW[4]); }
  }
}

function drawCultist(p, g, P, ex) {
  const { AX, AY } = CULT;
  const meta = {};
  const gy = AY;
  const top = gy - 19 + P.bob;
  const x = AX + P.lean * 2;
  const sh = { x: x + 1 + P.lean * 3, y: top + 1 };
  // Füße
  p.rect(AX - 3 + P.stepB, gy - 2, 4, 2, CHAR[1]);
  // hinterer Ärmel
  const hB = { x: sh.x + P.hBx, y: sh.y + P.hBy };
  cap(p, sh.x - 3, sh.y + 1, hB.x, hB.y, 2.2, 2.6, ROBE.slice(0, 4));
  p.rect(hB.x - 1, hB.y + 1, 2, 2, CHAR[2]);
  // Robe
  robe(p, g, x, top, gy - 1, 4.5, 8, P.lean, P.hem, ROBE, CHAR, 71);
  p.rect(AX + 1 + P.stepA, gy - 2, 4, 2, CHAR[2]); p.px(AX + 4 + P.stepA, gy - 2, CHAR[3]);
  // Gürtel mit Schlackenbrocken
  const by = top + 8;
  for (let k = -5; k <= 5; k++) p.px(x + k + P.lean * 1.5, by + Math.abs(k) * 0.1, k < -2 ? CHAR[2] : CHAR[1]);
  p.px(x + 2 + P.lean, by, LAVA[2]); g.px(x + 2 + P.lean, by, GLOW[2]);
  p.px(x + 2 + P.lean, by + 1, CHAR[3]); p.px(x + 2 + P.lean, by + 3, LAVA[1]);
  // Stola vorn: rot mit Glutmustern
  for (let j = 0; j < 12; j++) { p.px(x + 3 + P.lean * (1.5 - j * 0.1), top + 2 + j, ROBE[4]); if (j % 4 === 2) { p.px(x + 3 + P.lean * (1.5 - j * 0.1), top + 2 + j, LAVA[2]); g.px(x + 3 + P.lean * (1.5 - j * 0.1), top + 2 + j, GLOW[1]); } }
  if (p.fine) {
    // Stola fein: Lichtkante links, Schattenkante rechts, Glutrunen gedämpft wie im Original (Kern LAVA[3]), damit sie nicht als Glutreihe vorstechen
    for (let j = 0; j < 12; j += 0.5) {
      const sx = p.snap(x + 3 + P.lean * (1.5 - Math.floor(j) * 0.1)), sy = p.snap(top + 2) + j;
      p.dot(sx, sy, j % 4 < 2 ? '#8a3424' : ROBE[4]); p.dot(sx + 0.5, sy, ROBE[2]);
    }
    for (let j = 2; j < 12; j += 4) {
      const sx = p.snap(x + 3 + P.lean * (1.5 - j * 0.1)), sy = p.snap(top + 2 + j);
      p.dot(sx, sy, LAVA[3]); p.dot(sx, sy + 0.5, LAVA[2]); g.dot(sx, sy, GLOW[2]);
    }
    // Gürtel: Knotenlicht
    p.dot(x + 2 + P.lean, by - 0.5, LAVA[4]);
  }

  // Kapuze mit Spitze und Maske
  const hx = sh.x + 1 + P.head, hy = top - 4;
  ell(p, hx - 0.5, hy, 4.6, 4.6, ROBE, { bias: -0.05 });
  poly(p, [[hx - 4, hy - 2], [hx - 7 - P.wind * 2, hy - 7 + P.wind], [hx - 1, hy - 4]], ROBE[2]);
  p.line(hx - 4, hy - 3, hx - 7 - P.wind * 2, hy - 7 + P.wind, ROBE[3]);
  // Schatten in der Kapuze
  ell(p, hx + 1.5, hy + 0.5, 3, 3.6, [VOID, CHAR[0]]);
  // Maske: aschweiß, Hörnerstirn, Augenschlitze
  const mx = hx + 2, my = hy - 2;
  poly(p, [[mx - 1, my], [mx + 3.5, my - 0.5], [mx + 3.5, my + 4], [mx + 1.5, my + 6], [mx - 1, my + 4.5]], (xx, yy) => (xx < mx + 0.5 ? MASK[2] : yy < my + 2 ? MASK[4] : MASK[3]));
  p.px(mx + 1, my - 1, MASK[4]); p.px(mx + 1, my, LAVA[2]); g.px(mx + 1, my, GLOW[1]);
  p.px(mx + 1, my + 3, MASK[1]); p.px(mx + 2, my + 4, MASK[1]); // Riss
  const ec = ex.hurt ? '#ffffff' : LAVA[4];
  if (P.eye > 0.3) {
    p.px(mx + 0, my + 1.5, ec); p.px(mx + 2, my + 1.5, ec);
    g.px(mx + 0, my + 1.5, GLOW[4]); g.px(mx + 2, my + 1.5, GLOW[4]); g.px(mx + 1, my + 1.5, GLOW[1]);
  } else { p.px(mx, my + 1.5, VOID); p.px(mx + 2, my + 1.5, VOID); }
  if (p.fine) cultistFace(p, g, P, ex, p.snap(hx), p.snap(hy), p.snap(mx), p.snap(my), ec);
  meta.eye = { x: mx + 1, y: my + 1.5 };
  meta.head = { x: hx, y: hy - 5 };

  // vorderer Ärmel + Hand + Feuerball
  const hF = { x: sh.x + P.hFx, y: sh.y + P.hFy };
  const k = ik(sh.x + 1, sh.y + 1, hF.x, hF.y, 5, 5, P.hFy < 3 ? -1 : 1);
  cap(p, sh.x + 1, sh.y + 1, k.jx, k.jy, 2.2, 2, ROBE, { rim: 1, bias: 0.15 });
  cap(p, k.jx, k.jy, k.ex, k.ey, 2, 2.8, ROBE, { rim: 1, bias: 0.15 });
  cap(p, sh.x + 1, sh.y + 1, k.jx, k.jy, 2.2, 2, ROBE, { bias: 0.15 });
  p.px(k.ex + 1, k.ey + 2, ROBE[4]);
  p.rect(k.ex, k.ey - 0.5, 2, 2, CHAR[3]); p.px(k.ex + 1, k.ey - 1, CHAR[2]);
  meta.hand = { x: k.ex + 1, y: k.ey - 3 };
  if (P.ball > 0.3 && !ex.thrown) fireball(p, g, k.ex + 1, k.ey - 2 - P.ball * 0.6, P.ball, P.fl);
  if (ex.thrown) {
    const t = ex.thrown;
    fireball(p, g, k.ex + 3 + t * 6, k.ey - 1, 2.4, P.fl);
    for (let i = 1; i < 4; i++) { p.px(k.ex + 3 + t * 6 - i * 2, k.ey - 1 + (i % 2), LAVA[3 - (i >> 1)]); g.px(k.ex + 3 + t * 6 - i * 2, k.ey - 1 + (i % 2), GLOW[2]); }
    meta.hand = { x: k.ex + 3 + t * 6, y: k.ey - 1 };
  }
  if (ex.smear) arcSmear(p, g, sh.x, sh.y, ex.smear[0], ex.smear[1], 6, 11, [LAVA[1], LAVA[3], LAVA[5]], 29, true);
  return meta;
}

function drawCultistCorpse(p, g, k) {
  const { AX, AY } = CULT;
  const gy = AY - 1;
  // zusammengesunkene Robe mit Maske obenauf
  for (let j = 0; j < 5; j++) {
    const hw = 11 - j * 1.6;
    for (let x = -hw; x <= hw; x++) {
      const t = 0.3 + (hw - x) / (2 * hw) * 0.5 - j * 0.02;
      p.px(AX + x, gy - j, (j < 2 ? CHAR : ROBE)[clamp(Math.floor(t * 4), 0, 3)]);
    }
  }
  ell(p, AX + 9, gy - 2, 3.5, 2.6, ROBE.slice(0, 4));
  poly(p, [[AX + 10, gy - 5], [AX + 15, gy - 4], [AX + 15, gy - 1], [AX + 10, gy - 1]], MASK[3]);
  p.px(AX + 12, gy - 3, k < 0.5 ? LAVA[3] : VOID); p.px(AX + 14, gy - 3, VOID);
  if (k < 0.5) g.px(AX + 12, gy - 3, GLOW[3]);
  if (p.fine) {
    // fein: Robenfalten zweifarbig auf dem Haufen, Maske mit Stirnkante, Riss und Augenhöhlen
    for (const x of [-8, -4, 0, 4]) { p.fline(AX + x, gy - 3.5, AX + x + 1, gy, ROBE[0]); p.fline(AX + x - 0.5, gy - 3.5, AX + x + 0.5, gy, x < 0 ? ROBE[4] : ROBE[3]); }
    p.fline(AX + 10, gy - 5, AX + 15, gy - 4, MASK[4]); p.fline(AX + 13, gy - 4.5, AX + 12.5, gy - 1.5, MASK[1]);
    p.dot(AX + 12, gy - 3, k < 0.5 ? LAVA[5] : VOID); p.dot(AX + 14.5, gy - 3, VOID); p.fline(AX + 11, gy - 1.5, AX + 14, gy - 1.5, MASK[2]);
  }
  // ausglühende Glut
  for (let i = 0; i < 6; i++) {
    const x = AX - 8 + i * 3, y = gy - hash2(i, 1, 3) * 3;
    if (hash2(i, 2, 3) > k) { p.px(x, y, LAVA[2]); g.px(x, y, GLOW[2]); }
  }
  // erlöschender Feuerball am Boden
  if (k < 0.9) flame(p, g, AX - 12, gy, Math.round(4 * (1 - k)) + 1, 1.5 * (1 - k) + 0.5, k * 8, { seed: 6 });
  return { eye: { x: AX + 12, y: gy - 3 }, hand: { x: AX - 12, y: gy - 2 }, head: { x: AX + 10, y: gy - 6 } };
}

function createCultist() {
  const S = { ...CULT, draw: drawCultist };
  const idle = [];
  for (let i = 0; i <= 4; i++) {
    const ph = (i / 4) * Math.PI * 2, s = Math.sin(ph);
    idle.push([i / 4, cp({ bob: Math.max(0, s) * 1, hem: ph, hFy: 9 + Math.max(0, s), ball: 2.2 + s * 0.3, fl: ph * 2, wind: s * 0.3 }), linear]);
  }
  const walk = [];
  for (let i = 0; i <= 6; i++) {
    const ph = (i / 6) * Math.PI * 2, s = Math.sin(ph), c = Math.cos(ph);
    walk.push([i / 6, cp({ bob: Math.abs(c) * -1 + 1, lean: 0.4, hem: ph * 2, stepA: s * 3, stepB: -s * 3, hFx: 6 + s, hFy: 8, hBx: -5 - s, fl: ph * 2, wind: 1, head: 0.5 }), linear]);
  }
  // Ausholen: Hand nach hinten über den Kopf, Feuerball wächst
  const w1 = cp({ lean: -0.2, hFx: 0, hFy: -4, hBx: 3, hBy: 6, ball: 2.6, fl: 1, wind: 0.4, head: -0.5 });
  const w2 = cp({ lean: -0.45, hFx: -5, hFy: -8, hBx: 5, hBy: 4, ball: 3.8, fl: 2, wind: 0.6, head: -1 });
  const s1 = cp({ lean: 0.5, hFx: 8, hFy: -3, hBx: -6, hBy: 9, ball: 3.2, fl: 3, wind: 1, head: 0.5, stepA: 3 });
  const s2 = cp({ lean: 0.7, hFx: 10, hFy: 5, hBx: -7, hBy: 10, ball: 0, fl: 4, wind: 1.2, head: 1, stepA: 3 });
  const s3 = cp({ lean: 0.3, hFx: 7, hFy: 8, hBx: -5, hBy: 10, ball: 0, fl: 5, wind: 0.5, stepA: 2 });
  const hurtP = cp({ lean: -0.6, head: -1.5, hFx: 3, hFy: 3, hBx: -6, hBy: 6, ball: 0.8, eye: 0, wind: 1 });
  const d1 = cp({ lean: -0.8, bob: 1, head: -1.5, hFx: 5, hFy: 0, hBx: -7, hBy: 2, ball: 0, eye: 0, wind: 1.2 });
  const d2 = cp({ lean: 0.9, bob: 6, head: 1.5, hFx: 9, hFy: 9, hBx: 0, hBy: 11, ball: 0, eye: 0 });
  return {
    idle: new Animation(track(S, idle, 4, { loop: true }), 6),
    walk: new Animation(track(S, walk, 6, { loop: true }), 10),
    windup: new Animation(track(S, [[0, idle[0][1]], [0.5, w1], [1, w2]], 4), 8, false),
    strike: new Animation(track(S, [[0, s1], [0.35, s2, snap], [1, s3]], 4, {
      extras: { 0: { smear: [-2.6, -1.0] }, 1: { fx: 'impact', thrown: 0.3, smear: [-1.8, 0.2] }, 2: { thrown: 1 } },
    }), 14, false),
    hurt: new Animation(track(S, [[0, hurtP], [1, cp({ lean: -0.2 })]], 2, { extras: { 0: { hurt: true } } }), 10, false),
    death: new Animation([
      ...track(S, [[0, hurtP], [0.4, d1], [1, d2]], 3, { extras: { 0: { hurt: true } } }),
      still(S, (p, g) => drawCultistCorpse(p, g, 0), 'impact'),
      still(S, (p, g) => drawCultistCorpse(p, g, 0.45)),
      still(S, (p, g) => drawCultistCorpse(p, g, 1)),
    ], 8, false),
  };
}


// ================================================================ Der Schlackenkoloss (Elite)

const BEH = { W: 104, H: 82, AX: 46, AY: 76, pad: 12, fine: true };
const BH_REST = {
  hipX: 0, hipY: 0, lean: 0.1, head: 0, headY: 0, jaw: 0.15, core: 1, vent: 0,
  fFx: 9, fFy: 0, fBx: -9, fBy: 0,
  hFx: 17, hFy: 18, hBx: -16, hBy: 17, kneel: 0,
};
const bp = (o) => ({ ...BH_REST, ...o });
const SLAG = ['#0d0a0c', '#1c1517', '#2e2224', '#433132', '#5c4440', '#7a5a50'];
const SLAG_D = ['#0a0709', '#141011', '#1f1718', '#2c2122', '#3a2b2b'];

// Lavagestein-Platte: schattierte Ellipse mit glühenden Fugen
function slabs(p, g, cx, cy, rx, ry, ramp, seed, heat, n = 6, o = {}) {
  ell(p, cx, cy, rx, ry, ramp, { noise: 0.14, seed, ...o });
  veins(p, g, cx, cy, rx, ry, seed + 3, n, heat, { len: Math.round((rx + ry) * 0.5) });
  if (p.fine) rockFine(p, cx, cy, Math.min(rx, ry * 1.08), ramp, seed);
}
function spike(p, bx, by, a, h, w, ramp) {
  const tx = bx + Math.cos(a) * h, ty = by + Math.sin(a) * h;
  const nx = -Math.sin(a) * w, ny = Math.cos(a) * w;
  poly(p, [[bx - nx, by - ny], [tx, ty], [bx + nx, by + ny]], ramp[2]);
  p.line(bx - nx * 0.5, by - ny * 0.5, tx, ty, OBS_SHINE);
  p.px(bx + nx * 0.6, by + ny * 0.6, ramp[1]);
  if (p.fine) {
    // Obsidiandorn fein: Schattenfacette, Mittelgrat, weiße Glanzspitze
    p.fline(bx + nx * 0.9, by + ny * 0.9, tx, ty, ramp[0]); p.fline(bx + nx * 0.2, by + ny * 0.2, tx, ty, ramp[4]);
    p.dot(tx, ty, '#e0d8f8');
  }
}

function drawBehemoth(p, g, P, ex) {
  const { AX, AY } = BEH;
  const meta = {};
  const gy = AY;
  const heat = P.core;
  const hip = { x: AX + P.hipX, y: gy - 18 + P.hipY + P.kneel * 7 };
  const lean = P.lean;
  const ch = { x: hip.x + Math.sin(lean) * 20, y: hip.y - Math.cos(lean) * 20 };
  const px = Math.cos(lean), py = Math.sin(lean);
  const shF = { x: ch.x + px * 12, y: ch.y + py * 12 - 6 }, shB = { x: ch.x - px * 12, y: ch.y - py * 12 - 8 };

  const leg = (hx, hy, fx, fy, ramp, back) => {
    let k = ik(hx, hy, fx, fy, 9, 9, -1);
    if (P.kneel > 0.01 && back) {
      const kx = hx - 3, ky = gy - 3;
      k = { jx: k.jx + (kx - k.jx) * P.kneel, jy: k.jy + (ky - k.jy) * P.kneel, ex: k.ex + (kx - 10 - k.ex) * P.kneel, ey: k.ey };
    }
    cap(p, hx, hy, k.jx, k.jy, 6.5, 5, ramp, { noise: 0.14, seed: 3, rim: back ? 0 : 1 });
    cap(p, k.jx, k.jy, k.ex, k.ey - 3, 5, 5.5, ramp, { noise: 0.14, seed: 4, rim: back ? 0 : 1 });
    ell(p, k.ex + 2, k.ey - 3, 7, 3.4, ramp, { noise: 0.14, seed: 5 });
    for (let i = 0; i < 3; i++) { p.px(k.ex + 8, k.ey - 5 + i * 1.5, OBS[4]); p.px(k.ex + 9, k.ey - 4 + i * 1.5, OBS[2]); }
    // Knieplatte
    ell(p, k.jx + 1, k.jy - 1, 3.4, 3, ramp, { noise: 0.1, seed: 6, bias: 0.12 });
    if (!back) { p.px(k.jx + 2, k.jy + 2, LAVA[3]); g.px(k.jx + 2, k.jy + 2, GLOW[3]); veins(p, g, k.jx, k.jy + 6, 3, 4, 91, 1, heat, { len: 5 }); }
    return k;
  };
  const arm = (sh, hx, hy, ramp, back, seed) => {
    const k = ik(sh.x, sh.y, hx, hy, 12, 12, 1);
    cap(p, sh.x, sh.y, k.jx, k.jy, 5.5, 4.6, ramp, { noise: 0.14, seed, rim: back ? 0 : 1 });
    cap(p, k.jx, k.jy, k.ex, k.ey, 4.8, 6.4, ramp, { noise: 0.14, seed: seed + 1, rim: back ? 0 : 1 });
    veins(p, g, (k.jx + k.ex) / 2, (k.jy + k.ey) / 2, 4.5, 4.5, seed + 2, back ? 1 : 3, heat * (back ? 0.6 : 1), { len: 6 });
    // Faust mit Obsidian-Knöcheln
    ell(p, k.ex + 1, k.ey + 2, 6.6, 6, ramp, { noise: 0.14, seed: seed + 3, rim: back ? 0 : 1 });
    for (let i = 0; i < 3; i++) {
      const kx = k.ex + 4 + i * 0.8, ky = k.ey - 2 + i * 3;
      poly(p, [[kx, ky], [kx + 4, ky + 0.5], [kx, ky + 2]], OBS[back ? 1 : 3]);
      if (!back) p.px(kx + 1, ky + 0.5, OBS_SHINE);
      if (p.fine && !back) { p.fline(kx, ky, kx + 3.5, ky + 0.5, OBS_SHINE); p.fline(kx, ky + 1.5, kx + 3, ky + 1, OBS[1]); p.dot(kx + 3.5, ky + 0.5, '#e0d8f8'); }
    }
    veins(p, g, k.ex, k.ey + 2, 5, 4.5, seed + 4, back ? 1 : 2, heat * (back ? 0.5 : 1.1), { len: 5 });
    return k;
  };

  // --- hinten
  leg(hip.x - 5, hip.y, AX + P.fBx, gy - P.fBy, SLAG_D, true);
  const kB = arm(shB, ch.x + P.hBx, ch.y + P.hBy, SLAG_D, true, 40);
  meta.handB = { x: kB.ex + 1, y: kB.ey + 2 };
  slabs(p, g, shB.x, shB.y, 7, 6, SLAG_D, 44, heat * 0.4, 1);
  for (let i = 0; i < 3; i++) spike(p, shB.x - 3 + i * 3, shB.y - 4, -1.9 - i * 0.15, 6 + (i % 2) * 3, 1.6, OBS);

  // --- Becken, Rumpf
  slabs(p, g, hip.x, hip.y, 11, 7, SLAG, 7, heat * 0.7, 3);
  slabs(p, g, ch.x, ch.y + 2, 15, 13, SLAG, 9, heat, 7, { rot: lean, bias: 0.05 });
  // Brustplatten-Kanten
  p.line(ch.x - 12, ch.y - 5, ch.x - 3, ch.y - 9, SLAG[5]);
  p.line(ch.x - 13, ch.y + 4, ch.x - 8, ch.y + 9, SLAG[1]);
  // Geschmolzener Kern mitten in der Brust
  const cx = ch.x - 2 + px * 2, cy = ch.y + 3 + py * 2;
  const cr = 4.6 + (heat - 1) * 1.6;
  ell(p, cx, cy, cr + 1.4, cr + 2, [SLAG[0]]);
  ell(p, cx, cy, cr, cr + 0.6, [LAVA[1], LAVA[2], LAVA[3], LAVA[4], LAVA[5]], { bias: 0.25 });
  g.ellipse(cx, cy, cr + 3, cr + 3.5, GLOW[0]);
  glowDot(g, cx, cy, cr);
  // Schlackespangen über dem Kern
  for (const [a, l] of [[-2.4, 7], [-0.5, 6], [1.9, 6.5], [0.9, 5.5]]) {
    const x0 = cx + Math.cos(a) * (cr + 2), y0 = cy + Math.sin(a) * (cr + 2);
    cap(p, x0, y0, cx + Math.cos(a) * (cr - 2), cy + Math.sin(a) * (cr - 2), 1.2, 0.8, SLAG.slice(1));
    void l;
  }
  if (p.fine) {
    // Kern fein: weißglühende Mitte, Glanz oben links, Spangen mit Lichtkante
    ell(p, cx - 0.6, cy - 0.6, cr * 0.38, cr * 0.42, [LAVA[5]]);
    p.dot(cx - cr * 0.45, cy - cr * 0.5, '#ffffff'); p.dot(cx - cr * 0.45 + 0.5, cy - cr * 0.5, '#ffffff');
    for (const a of [-2.4, -0.5, 1.9, 0.9]) { const x0 = cx + Math.cos(a) * (cr + 2), y0 = cy + Math.sin(a) * (cr + 2); p.fline(x0 - 0.5, y0 - 0.5, cx + Math.cos(a) * (cr - 1.5) - 0.5, cy + Math.sin(a) * (cr - 1.5) - 0.5, SLAG[5]); }
  }
  meta.chest = { x: cx, y: cy };
  for (let i = 0; i < 3; i++) { const dx = cx - 2 + i * 2, dy = cy + cr + 3 + ((i + Math.floor(P.vent * 2)) % 3); p.px(dx, dy, LAVA[3]); g.px(dx, dy, GLOW[2]); }
  // Schlote am Rücken
  for (let i = 0; i < 2; i++) {
    const vx = ch.x - 9 + i * 5, vy = ch.y - 10 + i * 1;
    p.ellipse(vx, vy, 2, 1.2, SLAG[0]); p.px(vx, vy, LAVA[3]);
    flame(p, g, vx, vy - 1, Math.round(4 + heat * 3), 1.5, P.vent + i * 2, { lean: -0.35, seed: 20 + i, hot: 0.8 + heat * 0.2 });
  }

  // --- vorderes Bein
  occlude(g);
  leg(hip.x + 5, hip.y + 2, AX + P.fFx, gy - P.fFy, SLAG, false);
  occlude(null);

  // --- vordere Schulter + Arm
  occlude(g);
  const kF = arm(shF, ch.x + P.hFx, ch.y + P.hFy, SLAG, false, 70);
  slabs(p, g, shF.x - 1, shF.y, 7.5, 6.5, SLAG, 75, heat, 2, { rim: 1, bias: 0.06 });
  occlude(null);
  for (let i = 0; i < 3; i++) spike(p, shF.x - 5 + i * 3, shF.y - 4, -2.1 - i * 0.2 + P.lean * 0.3, 6 + (i === 1 ? 3 : 0), 1.8, OBS);
  p.line(shF.x - 6, shF.y - 2, shF.x, shF.y - 6, SLAG[5]);
  // --- Kopf: gedrungen, Hörner nach vorn, lavagefülltes Maul
  const hx = ch.x + px * 9 + P.head, hy = ch.y - 12 + P.headY;
  ell(p, hx - 1, hy + 3, 6, 4, SLAG_D, { noise: 0.1, seed: 60 }); // Nacken
  ell(p, hx, hy, 6.4, 5.4, SLAG, { noise: 0.14, seed: 61, rim: 1, bias: 0.08 });
  p.rect(hx - 5, hy - 3, 10, 1, SLAG[5]); p.rect(hx - 2, hy - 1, 8, 1, SLAG[1]);
  const horn = (bx, by, s, ramp) => {
    let x = bx, y = by;
    for (let i = 0; i < 9; i++) {
      const a = -2.5 + i * 0.3;
      const nx = x + Math.cos(a) * 1.4 * s, ny = y + Math.sin(a) * 1.4 * s;
      cap(p, x, y, nx, ny, 2.4 - i * 0.24, 2.2 - i * 0.24, ramp);
      // fein: Glanzlinie auf der Hornoberseite, Wachstumsringe
      if (p.fine) { p.fline(x - 0.5, y - (1.8 - i * 0.2), nx - 0.5, ny - (1.7 - i * 0.2), i < 6 ? OBS_SHINE : ramp[4]); if (i % 3 === 1) p.fline(x + 0.6, y - 1.2, x + 0.6, y + 1, ramp[0]); }
      x = nx; y = ny;
    }
    p.px(x, y, OBS_SHINE);
    if (p.fine) p.dot(x, y, '#e0d8f8');
  };
  horn(hx - 4, hy - 2, 0.6, OBS.slice(1));
  const mo = Math.round(P.jaw * 5);
  p.rect(hx + 1, hy + 2, 6, 1 + mo, VOID);
  if (mo > 0) {
    p.rect(hx + 1, hy + 3, 5, Math.max(1, mo - 1), LAVA[2]); p.rect(hx + 2, hy + 3, 3, Math.max(1, mo - 2), LAVA[4]);
    g.rect(hx + 1, hy + 2, 6, 1 + mo, GLOW[2]); g.rect(hx + 2, hy + 3, 3, Math.max(1, mo - 2), GLOW[4]);
  }
  for (let i = 0; i < 3; i++) { p.px(hx + 2 + i * 2, hy + 2, MASK[4]); p.px(hx + 1 + i * 2, hy + 2 + mo, MASK[3]); }
  ell(p, hx + 2, hy + 4 + mo, 4.6, 1.8, SLAG, { noise: 0.1, seed: 62 });
  p.px(hx + 6, hy + 3 + mo, OBS[4]); p.px(hx + 6, hy + 2 + mo, OBS_SHINE);
  if (P.jaw > 0.3) { p.px(hx + 3, hy + 6 + mo, LAVA[3]); g.px(hx + 3, hy + 6 + mo, GLOW[2]); p.px(hx + 3, hy + 7 + mo, LAVA[2]); }
  meta.mouth = { x: hx + 5, y: hy + 3 + mo / 2 };
  const ec = ex.hurt ? '#ffffff' : LAVA[5];
  p.rect(hx + 1, hy - 0.5, 3, 1, ec); p.px(hx - 2, hy - 0.5, LAVA[3]);
  g.rect(hx, hy - 1, 5, 2, GLOW[2]); g.rect(hx + 1, hy - 0.5, 3, 1, GLOW[4]); g.px(hx - 2, hy - 0.5, GLOW[3]);
  if (p.fine) {
    // Handfein: Stirnplatte mit Lichtkante und Kerbe, Glutauge mit weißem Kern unter dunkler Brauenkante,
    // Reißzähne mit Spitze, Lavasabber mit hellem Kern, Kinnkante
    const x = p.snap(hx), y = p.snap(hy);
    p.fline(x - 5, y - 3.5, x + 4.5, y - 3.5, '#9a7a6c'); p.dot(x - 1, y - 3, SLAG[1]); p.dot(x - 1, y - 2.5, SLAG[0]);
    p.fline(x, y - 1, x + 5, y - 1, VOID);
    if (!ex.hurt) { p.fline(x + 1, y - 0.5, x + 3.5, y - 0.5, LAVA[5]); p.dot(x + 1.5, y - 0.5, '#ffffff'); p.fline(x + 1, y, x + 3.5, y, LAVA[3]); g.fline(x + 1, y - 0.5, x + 3.5, y - 0.5, GLOW[4]); }
    p.dot(x - 2, y - 0.5, LAVA[5]);
    for (let i = 0; i < 3; i++) { p.dot(x + 2.5 + i * 2, y + 3, MASK[3]); p.dot(x + 2 + i * 2, y + 1.5 + mo, MASK[4]); }
    if (mo > 1) { p.fline(x + 2, y + 3.5, x + 5, y + 3.5, LAVA[5]); g.fline(x + 2, y + 3.5, x + 5, y + 3.5, GLOW[4]); }
    if (P.jaw > 0.3) { p.dot(x + 3, y + 6 + mo, LAVA[5]); p.dot(x + 3.5, y + 7 + mo, LAVA[4]); }
    p.fline(x - 1, y + 5.5 + mo, x + 5, y + 5.5 + mo, SLAG[1]); p.fline(x - 1, y + 3 + mo, x + 1, y + 2.5 + mo, SLAG[5]);
  }
  meta.eye = { x: hx + 2, y: hy };
  meta.head = { x: hx, y: hy - 8 };
  horn(hx + 1, hy - 3, 0.75, OBS.slice(2));

  meta.hand = { x: kF.ex + 1, y: kF.ey + 2 };
  if (ex.smear) arcSmear(p, g, shF.x, shF.y, ex.smear[0], ex.smear[1], 17, 31, SMEAR, 41, false);
  if (ex.dust) {
    dustRing(p, g, kF.ex + 2, gy - 1, ex.dust, 43, [SLAG[3], SLAG[4], ASH[4]]);
    if (ex.both) dustRing(p, g, kB.ex, gy - 1, ex.dust * 0.8, 47, [SLAG[3], ASH[3]]);
  }
  if (ex.roarFx) {
    for (let r = 4; r < 14; r += 4) for (let a = -0.7; a <= 0.7; a += 0.14) {
      const x = meta.mouth.x + Math.cos(a) * (r + ex.roarFx * 3), y = meta.mouth.y + Math.sin(a) * (r + ex.roarFx * 3);
      if (hash2(Math.round(a * 20), r, 5) < 0.6) g.px(x, y, GLOW[r < 6 ? 2 : 1]);
    }
  }
  return meta;
}

// Zusammenbruch: Schlackehügel, erkaltender Kern, gebrochene Hörner
function drawBehemothHeap(p, g, k) {
  const { AX, AY } = BEH;
  const gy = AY;
  const heat = 1 - k;
  const cx = AX + 2;
  ell(p, cx, gy - 6 + k * 2, 22 + k * 3, 8 - k * 2, SLAG, { noise: 0.14, seed: 7 });
  ell(p, cx - 10, gy - 11 + k * 3, 11, 7 - k * 2, SLAG, { noise: 0.14, seed: 8 });
  ell(p, cx + 12, gy - 5 + k, 9, 5, SLAG_D, { noise: 0.14, seed: 9 });
  veins(p, g, cx, gy - 7, 20, 7, 99, 9, heat, { len: 8, dark: SLAG[1] });
  // Faust ragt heraus
  ell(p, cx + 24, gy - 5, 6, 5, SLAG, { noise: 0.14, seed: 10 });
  // Kopf am Boden
  const hx = cx + 16, hy = gy - 8 + k * 2;
  ell(p, hx, hy, 5.5, 4.4, SLAG, { noise: 0.14, seed: 61 });
  p.px(hx + 2, hy - 1, heat > 0.3 ? LAVA[3] : SLAG[0]);
  if (heat > 0.3) g.px(hx + 2, hy - 1, GLOW[2]);
  // abgebrochenes Horn
  poly(p, [[hx + 8, gy - 2], [hx + 13, gy - 6], [hx + 11, gy - 1]], OBS[3]); p.px(hx + 12, gy - 5, OBS_SHINE);
  // Rückenstacheln liegen schief
  for (let i = 0; i < 4; i++) {
    const bx = cx - 16 + i * 6, by = gy - 12 + Math.abs(i - 1.5) * 2 + k * 3;
    poly(p, [[bx - 2, by + 2], [bx - 4 - i, by - 5 + i], [bx + 2, by + 2]], OBS[2]); p.px(bx - 2, by - 1, OBS_SHINE);
  }
  // Kern: erkaltet von Gelb zu dunklem Rot
  const kc = heat > 0.6 ? [LAVA[2], LAVA[3], LAVA[4], LAVA[5]] : heat > 0.2 ? [LAVA[0], LAVA[1], LAVA[2], LAVA[3]] : [SLAG[1], SLAG[2], LAVA[0], LAVA[1]];
  ell(p, cx + 2, gy - 8, 4, 3, kc, { bias: 0.2 });
  if (heat > 0.05) glowDot(g, cx + 2, gy - 8, 1 + heat * 3);
  if (heat > 0.4) flame(p, g, cx - 8, gy - 16 + k * 3, Math.round(3 + heat * 4), 1.3, k * 7, { seed: 4 });
  if (p.fine) {
    // fein: Kopf mit Stirnkante und erlöschendem Auge, Hornbruch mit Glanz, Faust mit Knöchelkanten
    p.fline(hx - 4, hy - 3, hx + 3, hy - 3.5, '#9a7a6c'); p.dot(hx + 2, hy - 1, heat > 0.3 ? LAVA[5] : SLAG[0]);
    p.fline(hx + 8.5, gy - 2.5, hx + 12.5, gy - 5.5, OBS_SHINE);
    for (let i = 0; i < 3; i++) p.fline(cx + 26, gy - 8 + i * 2.5, cx + 28.5, gy - 7.5 + i * 2.5, SLAG[5]);
  }
  return {
    eye: { x: hx + 2, y: hy }, head: { x: hx, y: hy - 6 }, mouth: { x: hx + 5, y: hy + 2 }, chest: { x: cx + 2, y: gy - 8 },
    hand: { x: cx + 24, y: gy - 5 }, handB: { x: cx - 10, y: gy - 6 },
  };
}

function createBehemoth() {
  const S = { ...BEH, draw: drawBehemoth };
  const idle = [];
  for (let i = 0; i <= 6; i++) {
    const ph = (i / 6) * Math.PI * 2, s = Math.sin(ph);
    idle.push([i / 6, bp({ hipY: Math.max(0, s) * 1, lean: 0.1 + s * 0.02, hFy: 18 + Math.max(0, s), hBy: 17 + Math.max(0, s), headY: Math.max(0, s), jaw: 0.15 + Math.max(0, -s) * 0.3, core: 0.95 + s * 0.2, vent: ph * 1.5 }), linear]);
  }
  const walk = [];
  for (let i = 0; i <= 8; i++) {
    const ph = (i / 8) * Math.PI * 2, s = Math.sin(ph), c = Math.cos(ph);
    walk.push([i / 8, bp({
      hipX: 1, hipY: 1 - Math.abs(c) * 2, lean: 0.16 + s * 0.03, head: s * 0.8, headY: Math.abs(c) * 1,
      fFx: 3 + s * 9, fFy: Math.max(0, -c) * 4, fBx: -4 - s * 9, fBy: Math.max(0, c) * 4,
      hFx: 17 - s * 4, hFy: 17 + Math.max(0, s) * 2, hBx: -15 + s * 4, hBy: 17, core: 1, vent: ph * 2, jaw: 0.3,
    }), linear]);
  }
  // Einzelhieb: Faust über die Schulter zurück, dann Hammerfaust nach vorn-unten
  const w1 = bp({ lean: 0.0, hipX: -1, hFx: 8, hFy: -8, hBx: -12, hBy: 14, jaw: 0.5, core: 1.2, fFx: 10, fBx: -10 });
  const w2 = bp({ lean: -0.12, hipX: -3, hipY: -1, hFx: -2, hFy: -18, hBx: -8, hBy: 12, jaw: 0.8, core: 1.4, fFx: 11, fBx: -11, head: -1 });
  const s1 = bp({ lean: 0.3, hipX: 2, hipY: 2, hFx: 26, hFy: -6, hBx: -16, hBy: 14, jaw: 1, core: 1.4, fFx: 13, fBx: -11 });
  const s2 = bp({ lean: 0.45, hipX: 4, hipY: 5, hFx: 26, hFy: 22, hBx: -16, hBy: 12, jaw: 1, core: 1.5, fFx: 14, fBx: -12 });
  const s3 = bp({ lean: 0.42, hipX: 4, hipY: 5, hFx: 25, hFy: 23, hBx: -15, hBy: 13, jaw: 0.6, core: 1.2, fFx: 14, fBx: -12 });
  const s4 = bp({ lean: 0.25, hipX: 2, hipY: 2, hFx: 19, hFy: 19, hBx: -15, hBy: 16, jaw: 0.3, core: 1, fFx: 11, fBx: -10 });
  // Brüllen: aufrichten, Arme ausbreiten
  const r1 = bp({ lean: -0.05, hipY: -1, hFx: 18, hFy: 6, hBx: -18, hBy: 6, jaw: 0.6, core: 1.3, headY: -2, head: 1, fFx: 10, fBx: -10 });
  const r2 = bp({ lean: -0.2, hipY: -2, hFx: 22, hFy: -10, hBx: -20, hBy: -8, jaw: 1.2, core: 1.9, headY: -3, head: 2, fFx: 11, fBx: -11 });
  // Beidhändiger Bodenschlag
  const sl1 = bp({ lean: -0.05, hipY: -1, hFx: 8, hFy: -20, hBx: -4, hBy: -20, jaw: 0.8, core: 1.4, headY: -1, fFx: 10, fBx: -10 });
  const sl2 = bp({ lean: -0.2, hipY: -3, hFx: 4, hFy: -27, hBx: -6, hBy: -26, jaw: 1, core: 1.7, headY: -2, fFx: 11, fBx: -11, fBy: 1 });
  const sl3 = bp({ lean: 0.5, hipY: 8, hFx: 24, hFy: 24, hBx: 12, hBy: 25, jaw: 1.2, core: 1.8, headY: 3, fFx: 13, fBx: -12 });
  const sl4 = bp({ lean: 0.48, hipY: 8, hFx: 24, hFy: 24, hBx: 12, hBy: 25, jaw: 0.6, core: 1.3, headY: 3, fFx: 13, fBx: -12 });
  const sl5 = bp({ lean: 0.2, hipY: 2, hFx: 18, hFy: 19, hBx: -10, hBy: 18, jaw: 0.3, core: 1, fFx: 10, fBx: -10 });
  const hurtP = bp({ lean: -0.15, hipX: -3, head: -2, headY: -1, jaw: 1, hFx: 14, hFy: 12, hBx: -18, hBy: 12, core: 1.7 });
  const d1 = bp({ lean: -0.25, hipX: -4, head: -2, headY: -2, jaw: 1.2, hFx: 14, hFy: 6, hBx: -20, hBy: 6, core: 1.8 });
  const d2 = bp({ lean: 0.45, kneel: 1, hipY: 3, head: 1, headY: 3, jaw: 1, hFx: 22, hFy: 26, hBx: 4, hBy: 27, core: 1, fFx: 10, fBx: -8 });
  const d3 = bp({ lean: 0.8, kneel: 1, hipY: 8, head: 2, headY: 7, jaw: 0.8, hFx: 28, hFy: 21, hBx: 16, hBy: 22, core: 0.6, fFx: 12, fBx: -8 });
  return {
    idle: new Animation(track(S, idle, 6, { loop: true }), 5),
    walk: new Animation(track(S, walk, 8, { loop: true, extras: { 0: { fx: 'step' }, 4: { fx: 'step' } } }), 8),
    windup: new Animation(track(S, [[0, idle[0][1]], [0.45, w1], [1, w2]], 5), 8, false),
    strike: new Animation(track(S, [[0, s1], [0.25, s2, snap], [0.6, s3], [1, s4]], 5, {
      extras: { 0: { smear: [-2.2, -0.4] }, 1: { fx: 'impact', smear: [-1.3, 0.9], dust: 12 }, 2: { dust: 16 } },
    }), 12, false),
    roar: new Animation(track(S, [[0, idle[0][1]], [0.3, r1], [0.5, r2, snap], [0.85, { ...r2, vent: 3, core: 1.6 }], [1, bp({ ...r1, jaw: 0.4 })]], 7, {
      extras: { 3: { fx: 'roar', roarFx: 1 }, 4: { roarFx: 2 }, 5: { roarFx: 3 } },
    }), 7, false),
    slam: new Animation(track(S, [[0, idle[0][1]], [0.25, sl1], [0.45, sl2], [0.6, sl3, snap], [0.8, sl4], [1, sl5]], 8, {
      extras: { 4: { fx: 'impact', smear: [-2.4, 0.9], dust: 16, both: true }, 5: { dust: 22, both: true } },
    }), 9, false),
    hurt: new Animation(track(S, [[0, hurtP], [1, bp({ lean: 0.35, jaw: 0.4 })]], 2, { extras: { 0: { hurt: true } } }), 8, false),
    death: new Animation([
      ...track(S, [[0, hurtP], [0.3, d1], [0.65, d2, snap], [1, d3]], 4, { extras: { 0: { hurt: true }, 2: { fx: 'impact', dust: 10 } } }),
      still(S, (p, g) => drawBehemothHeap(p, g, 0), 'impact'),
      still(S, (p, g) => drawBehemothHeap(p, g, 0.5)),
      still(S, (p, g) => drawBehemothHeap(p, g, 1)),
    ], 6, false),
  };
}

// ================================================================ Export

const CINDER = {
  fire_imp: createImp,
  magma_hound: createHound,
  ash_golem: createAshGolem,
  cinder_cultist: createCultist,
  magma_behemoth: createBehemoth,
};

// only (optional): nur eine Figur erzeugen (Vorschau/Werkzeuge).
// Jede Figur wird erst beim ersten Zugriff gezeichnet und dann gecacht, damit
// eine Zone nur die Gegner erzeugt, die sie wirklich braucht.
export function createCinderFoes(only) {
  const out = {};
  for (const k in CINDER) {
    if (only && only !== k) continue;
    Object.defineProperty(out, k, {
      configurable: true, enumerable: true,
      get() {
        const v = CINDER[k]();
        Object.defineProperty(out, k, { value: v, writable: true, configurable: true, enumerable: true });
        return v;
      },
    });
  }
  return out;
}

// Werkzeugkasten für foes_forge.js
export const FK = {
  GLOW, LAVA, ease, linear, snap, clamp, mix, sample, ell, cap, poly, ik, glowDot, veins, flame, fireball,
  makeFrame, track, still, arcSmear, dustRing, occlude, robe, hash2, SMEAR, OBS, OBS_SHINE, CHAR, MASK, VOID, rimGlow,
  pen, wipe,
};
