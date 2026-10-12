import { PAL } from '../gfx/Palette.js';
import { buildFrame, SpriteFrame, Animation, lazyFrame } from '../gfx/Sprite.js';
import { FineCanvas, fineRes, col32, pixelsToCanvas } from '../gfx/Fine.js';
import { FK } from './foes_cinder.js';

// Gegner der Reifhöhlen (Eiskristallhöhle, Stufe 35–37): Eiselementar,
// Kristallspinne und Erfrorener Ritter.
//
// Gleicher Rig-Ansatz wie foes_ashwood.js / foes_cinder.js: Schlüsselposen
// werden beim Laden weich interpoliert, Material pro Pixel mit Licht von links
// oben schattiert. Leuchtendes Eis (Kerne, Augen, Frostkugeln) liegt auf der
// Leucht-Ebene (frame.glow). Ein Randlicht-Durchgang (rim) hellt die obere/
// linke Kante jeder Figur auf, damit die Silhouette auf dunklem Höhlenboden
// klar lesbar bleibt. Die Werkzeuge (RK) nutzt auch foes_throne.js.
// Blickrichtung rechts, Anker = Bodenkontakt.
//
// Feinraster (docs/STYLE.md „Feinraster“, Stufe B): gezeichnet wird auf FineCanvas in Weltpixeln. Die Formen
// (ell, cap, poly, limb, shard, smearArc, halo) tasten Feinpixel ab; bei res 1 tasten sie genau wie früher ab
// (Pixelmitten x + 0.5), Zusatzdetails stehen in `if (p.fine)`. Die RK-Werkzeuge bleiben polymorph: sie laufen
// auch auf einer groben PixelCanvas (foes_throne.js über FK.makeFrame), dort ohne .res/.step/.fine.

const { linear, snap, clamp, ik, hash2 } = FK;
const TAU = Math.PI * 2;

// ================================================================ Kit (fein)

const ease = (t) => t * t * (3 - 2 * t);
function mixP(a, b, t) { const o = {}; for (const k in a) o[k] = a[k] + ((b[k] ?? a[k]) - a[k]) * t; return o; }
function sample(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, p0] = keys[i], [t1, p1, e = ease] = keys[i + 1];
    if (t <= t1) return mixP(p0, p1, e((t - t0) / (t1 - t0 || 1)));
  }
  return keys[keys.length - 1][1];
}

// Lichtrichtung (von links oben, leicht zum Betrachter) – wie foes_cinder.js
const LX = -0.52, LY = -0.66, LZ = 0.54;
function tone(ramp, nx, ny, nz, bias, noise) {
  const t = 0.28 + 0.62 * (nx * LX + ny * LY + nz * LZ) + bias + noise;
  return ramp[clamp(Math.floor(t * ramp.length), 0, ramp.length - 1)];
}

// Verdecker: solange gesetzt, löschen ell()/cap() die Leucht-Ebene unter sich (im Feinraster), damit verdeckte
// Glut (Herz hinter dem Arm) nicht durchscheint.
let OCC = null;
const occlude = (g) => { OCC = g; };
function occClear(g, F, G) {
  if (F < 0 || G < 0 || F >= g.W || G >= g.H) return;
  g.buf[G * g.W + F] = 0;
  if (g._canvas) { const c = g._ctx; c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(F, G, 1, 1); c.restore(); }
}

// Tastet alle Feinpixel eines Weltbereichs ab und schreibt direkt in den Puffer: fn(x, y) -> Farbe|null,
// x/y = Weltkoordinate der Feinpixelmitte (bei res 1: x + 0.5 wie früher).
function shade(p, x0, y0, x1, y1, fn, span = null) {
  const r = p.res, W = p.W, H = p.H, buf = p.buf;
  const fo = Math.round(p.ox * r), go = Math.round(p.oy * r);
  const O = OCC, oo = O ? Math.round(O.ox * r) : 0, og = O ? Math.round(O.oy * r) : 0;
  const F0 = Math.floor(x0 * r), F1 = Math.ceil(x1 * r), G0 = Math.floor(y0 * r), G1 = Math.ceil(y1 * r);
  let lc = null, lv = 0, any = false;
  for (let G = G0; G <= G1; G++) {
    const Y = G + go;
    if (Y < 0 || Y >= H) continue;
    const y = (G + 0.5) / r;
    let Fa = F0, Fb = F1;
    if (span) {
      // Zeilenspanne der Form (analytisch, um 1 Feinpixel geweitet; fn prüft weiterhin exakt)
      const sp = span(y);
      if (!sp) continue;
      Fa = Math.max(F0, Math.floor(sp[0] * r) - 1); Fb = Math.min(F1, Math.ceil(sp[1] * r) + 1);
    }
    for (let F = Fa; F <= Fb; F++) {
      const X = F + fo;
      if (X < 0 || X >= W) continue;
      const c = fn((F + 0.5) / r, y);
      if (!c) continue;
      if (c !== lc) { lc = c; lv = col32(c); }
      buf[Y * W + X] = lv; any = true;
      if (O) occClear(O, F + oo, G + og);
    }
  }
  if (any) p.dirty = true;
}

// Schattierte Ellipse (optional gedreht, mit Materialrauschen je Weltpixel).
function ell(p, cx, cy, rx, ry, ramp, o = {}) {
  const { rot = 0, noise = 0, seed = 1, bias = 0, clip = null, rim = 0 } = o;
  if (rim) ell(p, cx, cy, rx + rim, ry + rim, [ramp[0]], { rot, clip });
  const c = Math.cos(rot), s = Math.sin(rot);
  const R = Math.ceil(Math.max(rx, ry)) + 1;
  shade(p, cx - R, cy - R, cx + R, cy + R, (px, py) => {
    const dx = px - cx, dy = py - cy;
    const u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry;
    const d2 = u * u + v * v;
    if (d2 > 1) return null;
    if (clip && !clip(Math.floor(px), Math.floor(py))) return null;
    const nz = Math.sqrt(1 - d2);
    const nx = u * c - v * s, ny = u * s + v * c;
    const n = noise ? (hash2(Math.round(dx) + 64, Math.round(dy) + 64, seed) - 0.5) * noise : 0;
    return tone(ramp, nx, ny, nz, bias, n);
  }, (py) => {
    // u² + v² ≤ 1 als quadratische Gleichung in dx für feste Zeile
    const dy = py - cy, irx = 1 / (rx * rx), iry = 1 / (ry * ry);
    const A = c * c * irx + s * s * iry, B = 2 * dy * c * s * (irx - iry), C = dy * dy * (s * s * irx + c * c * iry) - 1;
    const D = B * B - 4 * A * C;
    if (!(D >= -1e-9)) return null;
    const q = Math.sqrt(Math.max(0, D));
    return [cx + (-B - q) / (2 * A), cx + (-B + q) / (2 * A)];
  });
}

// Schattierte Kapsel (Gliedmaßen): Radius r0 -> r1.
function cap(p, x0, y0, x1, y1, r0, r1, ramp, o = {}) {
  const { noise = 0, seed = 1, bias = 0, rim = 0 } = o;
  if (rim) cap(p, x0, y0, x1, y1, r0 + rim, r1 + rim, [ramp[0]]);
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 0.0001;
  const R = Math.ceil(Math.max(r0, r1)) + 1;
  shade(p, Math.min(x0, x1) - R, Math.min(y0, y1) - R, Math.max(x0, x1) + R, Math.max(y0, y1) + R, (px, py) => {
    const t = clamp(((px - x0) * dx + (py - y0) * dy) / l2, 0, 1);
    const qx = x0 + dx * t, qy = y0 + dy * t;
    const r = r0 + (r1 - r0) * t;
    const ex = px - qx, ey = py - qy, d = Math.hypot(ex, ey);
    if (d > r) return null;
    const nx = ex / (r || 1), ny = ey / (r || 1), nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const n = noise ? (hash2(Math.round(px - x0) + 64, Math.round(py - y0) + 64, seed) - 0.5) * noise : 0;
    return tone(ramp, nx, ny, nz, bias, n);
  });
}

// Gefülltes Polygon (Scanline je Feinzeile, ohne Kantenglättung). col: Farbe oder (x,y)=>Farbe.
// Polymorph (auch grobe PixelCanvas, Schritt 1).
function poly(p, pts, col) {
  let minY = Infinity, maxY = -Infinity;
  for (const q of pts) { minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]); }
  const q = p.step ?? 1, R = 1 / q;
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y += q) {
    const yc = y + q / 2, xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + (yc - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = q === 1 ? Math.round(xs[k]) : Math.round(xs[k] * R) * q, x1 = q === 1 ? Math.round(xs[k + 1]) : Math.round(xs[k + 1] * R) * q;
      if (typeof col === 'function') {
        for (let x = x0; x < x1; x += q) { const c = col(x, y); if (c) { if (q === 1) p.px(x, y, c); else p.dot(x, y, c); } }
      } else if (x1 > x0) {
        if (q === 1 || !p.buf) p.rect(x0, y, x1 - x0, q, col);
        else {
          // fein: Zeile direkt in den Puffer (wie p.rect, ohne Einzelaufrufe je Feinpixel)
          const G = Math.round((y + p.oy) * R);
          if (G >= 0 && G < p.H) {
            const F0 = Math.max(0, Math.round((x0 + p.ox) * R)), F1 = Math.min(p.W, Math.round((x1 + p.ox) * R));
            if (F1 > F0) { p.buf.fill(col32(col), G * p.W + F0, G * p.W + F1); p.dirty = true; }
          }
        }
      }
    }
  }
}

// Gefüllte Ellipse wie PixelCanvas.ellipse (grob: Zeilen mit gerundeter Halbbreite, exakt wie früher);
// fein: Feinpixel abgetastet, gleiche Ausdehnung (Pixelmitte cx + 0.5, Radius + 0.5). Polymorph.
function pell(p, cx, cy, rx, ry, c) {
  if (!p.fine) {
    for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
      const t = 1 - (y * y) / (ry * ry);
      if (t < 0) continue;
      const hw = Math.round(rx * Math.sqrt(t) - 0.15);
      p.rect(Math.round(cx - hw), Math.round(cy + y), hw * 2 + 1, 1, c);
    }
    return;
  }
  const mx = cx + 0.5, my = cy + 0.5, ax = rx + 0.5, ay = ry + 0.5;
  p.each(mx - ax - 1, my - ay - 1, mx + ax + 1, my + ay + 1, (x, y) => {
    const u = (x - mx) / ax, v = (y - my) / ay;
    return u * u + v * v <= 1 ? c : null;
  });
}

// Feine Gegenstücke zu p.line/p.px für Details: 1 Feinpixel in der linken oberen Ecke des groben Pixels
// (grob: unverändert p.line/p.px). Nur für Stellen, die grob und fein gleich liegen sollen.
function ln(p, x0, y0, x1, y1, c) { if (p.fine) p.fline(x0 + 0.25, y0 + 0.25, x1 + 0.25, y1 + 0.25, c); else p.line(x0, y0, x1, y1, c); }
const dp = (p, x, y, c) => p.dot(x + 0.25, y + 0.25, c);

// Rahmen-Bau: draw(p, g) -> meta mit absoluten Koordinaten. pad = Rand um die Zeichenfläche. Figur und
// Leucht-Ebene auf FineCanvas (res = fineRes()); Anker/Meta/Größen in Weltpixeln.
// Aufgeschoben (gfx/Sprite.js LazyFrame): gezeichnet wird erst, wenn die Animation den Frame braucht.
const makeFrame = (W, H, AX, AY, draw, fx, pad) => lazyFrame(() => makeFrameNow(W, H, AX, AY, draw, fx, pad));
function makeFrameNow(W, H, AX, AY, draw, fx = null, pad = 0) {
  const W2 = W + pad * 2, H2 = H + pad * 2, res = fineRes();
  const g = new FineCanvas(W2, H2, res);
  g.translate(pad, pad);
  let meta = {};
  const f = buildFrame(W2, H2, AX + pad, AY + pad, (p) => { p.translate(pad, pad); meta = draw(p, g) || {}; OCC = null; }, { fine: true, res });
  // Leucht-Ebene direkt aus dem Puffer (ohne Umweg über getImageData), solange nie per ctx bemalt
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

// Unterhalb von y (Welt) alles löschen (Figur unter der Bodenlinie abschneiden), im Puffer.
function clearBelow(p, y) {
  const r = p.res, G0 = Math.max(0, Math.round((y + p.oy) * r));
  if (p._canvas) { p.ctx.clearRect(-p.ox, y, p.w, p.h); return; }
  p.buf.fill(0, G0 * p.W);
}

// Randlicht: Pixel mit freier Oberkante/linker Kante werden zur Lichtfarbe gezogen (Schlüssellicht), freie
// rechte Kanten schwach zur Gegenlichtfarbe. Arbeitet auf Texeln (PixelCanvas: p.w × p.h; FineCanvas: p.W × p.H,
// direkt im Puffer). Fein: äußerer Texel voll, der zweite schwächer – Wirkung etwa 1 Weltpixel tief, harte Stufe.
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rim(p, key, keyK = 0.42, back = null, backK = 0.3) {
  const r = p.res ?? 1, W = p.W ?? p.w, H = p.H ?? p.h;
  let img = null, d;
  if (p.buf && !p._canvas) d = new Uint8ClampedArray(p.buf.buffer, p.buf.byteOffset, W * H * 4);
  else { img = p.ctx.getImageData(0, 0, W, H); d = img.data; }
  const k = hexRgb(key), b = back ? hexRgb(back) : null;
  if (r > 1) { rimFine(d, W, H, r, k, keyK, b, backK); if (img) p.ctx.putImageData(img, 0, 0); else p.dirty = true; return; }
  const A = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) A[i] = d[i * 4 + 3] > 40 ? 1 : 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : A[y * W + x]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!A[y * W + x]) continue;
    const i = (y * W + x) * 4;
    const up = !at(x, y - 1), lf = !at(x - 1, y), ul = !at(x - 1, y - 1);
    let t = 0, c = null;
    if (up || lf) { t = keyK * (up && lf ? 1.15 : up ? 1 : 0.75); c = k; }
    else if (ul) { t = keyK * 0.45; c = k; }
    else if (b && (!at(x + 1, y) || !at(x + 1, y - 1))) { t = backK; c = b; }
    if (!c) continue;
    t = Math.min(0.8, t);
    d[i] += (c[0] - d[i]) * t; d[i + 1] += (c[1] - d[i + 1]) * t; d[i + 2] += (c[2] - d[i + 2]) * t;
  }
  if (img) p.ctx.putImageData(img, 0, 0);
  else p.dirty = true;
}

// Randlicht im Feinraster (r > 1): Maske mit Rand r, ohne Bereichsprüfungen. Äußerer Texel voll, innere schwächer.
function rimFine(d, W, H, r, k, keyK, b, backK) {
  const M = W + 2 * r, A = new Uint8Array(M * (H + 2 * r));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 40) A[(y + r) * M + x + r] = 1;
  const wt = (s) => (s === 1 ? 1 : s ? 0.6 : 0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const m = (y + r) * M + x + r;
    if (!A[m]) continue;
    let su = 0, sl = 0;
    for (let s = 1; s <= r; s++) if (!A[m - s * M]) { su = s; break; }
    for (let s = 1; s <= r; s++) if (!A[m - s]) { sl = s; break; }
    let t = 0, c = null;
    const tu = wt(su), tl = wt(sl);
    if (tu || tl) { t = keyK * Math.max(tu, tl * 0.75) * (tu && tl ? 1.15 : 1); c = k; }
    else if (!A[m - M - 1]) { t = keyK * 0.45; c = k; }
    else if (b) {
      let sr = 0;
      for (let s = 1; s <= r; s++) if (!A[m + s]) { sr = s; break; }
      const tb = Math.max(wt(sr), !A[m - M + 1] ? 1 : 0);
      if (tb) { t = backK * tb; c = b; }
    }
    if (!c) continue;
    t = Math.min(0.8, t);
    const i = (y * W + x) * 4;
    d[i] += (c[0] - d[i]) * t; d[i + 1] += (c[1] - d[i + 1]) * t; d[i + 2] += (c[2] - d[i + 2]) * t;
  }
}

// Dickes Glied mit Licht von links oben (ramp: 4 Stufen dunkel → hell), wie foes_ashwood.js. Polymorph:
// grob wie früher (Querschnitte in 0.5-Schritten, p.px); fein je Feinpixel abgetastet (Abstand zur Achse, keine
// Moiré-Streifen), gleiche Lage wie grob (Pixelmitte + 0.5), Kanten 1 Feinpixel.
function limb(p, x0, y0, x1, y1, w0, w1, ramp) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len, ny = dx / len;
  if (nx + ny > 0) { nx = -nx; ny = -ny; }
  if (!p.fine) {
    const steps = Math.ceil(len * 2);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, x = x0 + dx * t, y = y0 + dy * t;
      const hw = (w0 + (w1 - w0) * t) / 2;
      for (let k = -hw; k <= hw + 0.01; k += 0.5) {
        const c = k > hw - 1 ? ramp[3] : k < -hw + 1 ? ramp[0] : k > 0 ? ramp[2] : ramp[1];
        p.px(x + nx * k, y + ny * k, c);
      }
    }
    return;
  }
  const ox = x0 + 0.5, oy = y0 + 0.5, e = p.step, R = Math.max(w0, w1) / 2 + 1;
  p.each(Math.min(ox, ox + dx) - R, Math.min(oy, oy + dy) - R, Math.max(ox, ox + dx) + R, Math.max(oy, oy + dy) + R, (x, y) => {
    const ux = x - ox, uy = y - oy, t = (ux * dx + uy * dy) / (len * len);
    if (t < -0.02 || t > 1.02) return null;
    const k = -(ux * nx + uy * ny), hw = (w0 + (w1 - w0) * Math.max(0, Math.min(1, t))) / 2 + 0.25;
    if (Math.abs(k) > hw) return null;
    return k < -hw + e ? ramp[3] : k > hw - e ? ramp[0] : k < 0 ? ramp[2] : ramp[1];
  });
}

// Kristallsplitter: Basis (x,y), Richtung a, Länge len, halbe Breite w.
// Zwei Facetten (Licht links oben hell, Schattenseite dunkel), heller Grat,
// weiße Spitze. ramp mind. 5 Stufen. gl: Leuchtfarben für innere Glut (optional).
// Fein: dritte, helle Grat-Facette, Grat und Kanten als Feinlinie (Lichtkante hell, Schattenkante dunkel),
// Glanzpunkt an der Lichtschulter, Glut mit hellem Kern. Polymorph.
function shard(p, g, x, y, a, len, w, ramp, o = {}) {
  const { gl = null, tipW = 0, spark = true, base = 0.35 } = o;
  const ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
  const lightN = nx * -0.6 + ny * -0.8 > 0 ? 1 : -1;
  const S = (s, k) => [x + ux * s + nx * k, y + uy * s + ny * k];
  const mid = len * base;
  const L = [S(0, -w * 0.7), S(mid, -w), S(len, -tipW)], R = [S(0, w * 0.7), S(mid, w), S(len, tipW)];
  const n = ramp.length;
  const light = lightN > 0 ? R : L, dark = lightN > 0 ? L : R;
  poly(p, [S(0, 0), dark[0], dark[1], dark[2], S(len, 0)], ramp[Math.max(0, Math.floor(n * 0.3))]);
  poly(p, [S(0, 0), light[0], light[1], light[2], S(len, 0)], ramp[Math.floor(n * 0.62)]);
  if (!p.fine) {
    // Grat und Kanten
    p.line(S(len * 0.15, 0)[0], S(len * 0.15, 0)[1], S(len * 0.95, 0)[0], S(len * 0.95, 0)[1], ramp[n - 2]);
    p.line(light[1][0], light[1][1], light[2][0], light[2][1], ramp[n - 1]);
    p.line(dark[1][0], dark[1][1], dark[2][0], dark[2][1], ramp[0]);
    if (spark) { const t = S(len - 0.5, 0); p.px(t[0], t[1], '#ffffff'); }
    if (gl) {
      const c = S(len * 0.35, 0);
      g.px(c[0], c[1], gl[1]); const c2 = S(len * 0.55, 0); g.px(c2[0], c2[1], gl[0]);
    }
    return { tip: { x: S(len, 0)[0], y: S(len, 0)[1] } };
  }
  // ---- fein: Facetten, Grat, Glanz
  const big = len >= 4 && w >= 1;
  const ls = lightN * w, ds = -lightN * w;
  if (big) {
    poly(p, [S(len * 0.08, 0), S(mid, ls * 0.42), S(len * 0.9, ls * 0.1), S(len * 0.9, 0)], ramp[Math.min(n - 2, Math.floor(n * 0.8))]);   // helle Grat-Facette
    poly(p, [S(len * 0.08, 0), S(mid, ds * 0.4), S(len * 0.85, 0)], ramp[Math.max(0, Math.floor(n * 0.3) - 1)]);                       // Kernschatten am Grat
  }
  const ln = (A, B, c) => p.fline(A[0], A[1], B[0], B[1], c);
  ln(S(len * 0.12, 0), S(len * 0.94, 0), ramp[n - 2]);                     // Grat
  if (big) ln(S(mid, 0), S(len * 0.9, 0), ramp[n - 1]);                     // Grat im Licht: heller Lauf zur Spitze
  ln(light[1], light[2], ramp[n - 1]);                                      // Lichtkante
  if (big) ln(light[0], light[1], ramp[n - 2]);
  ln(dark[1], dark[2], ramp[0]);                                            // Schattenkante
  if (big) ln(dark[0], dark[1], ramp[Math.max(0, Math.floor(n * 0.3) - 1)]);
  if (spark) { const t = S(len - 0.6, 0); p.dot(t[0], t[1], '#ffffff'); }
  if (big) { const s = S(mid * 0.95, ls * 0.55); p.dot(s[0], s[1], '#ffffff'); }   // Glanzpunkt an der Lichtschulter
  if (gl) {
    const c = S(len * 0.35, 0), c2 = S(len * 0.55, 0);
    g.fline(c[0], c[1], c2[0], c2[1], gl[0], 0.5);
    g.dot(c[0], c[1], gl[1]); g.dot((c[0] + c2[0]) / 2, (c[1] + c2[1]) / 2, gl[1]);
  }
  return { tip: { x: S(len, 0)[0], y: S(len, 0)[1] } };
}

// Schwung-Schleier: geschlossene Sichel von a0 nach a1 um (cx,cy). Am Ende
// (frisch) breit und hell, zum Anfang hin spitz auslaufend; harte Stufen statt
// Rasterrauschen, damit die Kontur keine Krümel bildet. sy staucht senkrecht.
// Fein: dicht je Feinpixel abgetastet (geschlossene Fläche, kein Flimmern). Polymorph.
function smearArc(p, g, cx, cy, a0, a1, r0, r1, cols, gcols, sy = 1) {
  const q = p.fine ? p.step : 1;
  const n = Math.ceil(Math.abs(a1 - a0) * r1 * 2 / q) + 2;
  for (let i = 0; i <= n; i++) {
    const f = i / n, a = a0 + (a1 - a0) * f;
    const th = (r1 - r0) * (0.12 + 0.75 * f * f);
    for (let r = r1 - th; r <= r1; r += 0.5 * q) {
      const radial = (r - (r1 - th)) / (th || 1);
      if (q === 1) {
        const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r * sy);
        p.px(x, y, radial > 0.72 ? cols[2] : radial > 0.3 ? cols[1] : cols[0]);
        if (g && gcols && f > 0.35 && radial > 0.4) g.px(x, y, radial > 0.72 ? gcols[1] : gcols[0]);
      } else {
        const x = cx + 0.5 + Math.cos(a) * r, y = cy + 0.5 + Math.sin(a) * r * sy;
        p.dot(x, y, radial > 0.88 ? cols[2] : radial > 0.4 ? cols[1] : cols[0]);
        if (g && gcols && f > 0.35 && radial > 0.4) g.dot(x, y, radial > 0.8 ? gcols[1] : gcols[0]);
      }
    }
  }
}

// Ringförmiger Leuchthof auf der Glow-Ebene (harte Stufen). Polymorph.
function halo(g, x, y, r, cols) {
  for (let i = 0; i < cols.length; i++) {
    const rr = r * (1 - i / cols.length);
    if (rr < 0.5) { g.px(x, y, cols[i]); continue; }
    pell(g, x, y, rr, rr, cols[i]);
  }
}

// Frostnebel/-partikel am Boden (Leucht-Ebene, sehr dunkel = zarter Schimmer). Fein: Flocken mit hellem Kern.
function frostMist(p, g, x, y, w, ph, seed, cols) {
  for (let i = 0; i < 14; i++) {
    const u = hash2(i, 1, seed) - 0.5, v = hash2(i, 2, seed);
    const xx = x + u * w + Math.sin(ph + i) * 1.2, yy = y - v * 2 - ((ph * 2 + i * 0.7) % 3);
    const c = hash2(i, 3, seed) < 0.5 ? cols[0] : cols[1];
    if (!g.fine) { g.px(xx, yy, c); continue; }
    const fx = g.snap(xx), fy = g.snap(yy);
    g.dot(fx, fy, c); g.dot(fx + 0.5, fy, cols[0]);
    if (i % 3 === 0) g.dot(fx, fy - 0.5, cols[1]);
  }
}

// Frame-Spezifikation mit Randlicht-Durchgang
let S_RIM = 0.34;
function spec(base, draw, rimKey, rimBack) {
  return { ...base, draw: (p, g, P, ex, t) => { const m = draw(p, g, P, ex, t); rim(p, rimKey, S_RIM, rimBack, 0.28); return m; } };
}
// Standbild mit Randlicht. RK.stillR (foes_throne.js) baut über FK.still aus foes_cinder.js, die Rime-Gegner
// über die eigene feine still().
const stillWith = (st) => (S, draw, fx, rimKey, rimBack) => st(S, (p, g) => { const m = draw(p, g); rim(p, rimKey, 0.42, rimBack, 0.28); return m; }, fx);
const stillR = stillWith(still);
const stillR_FK = stillWith((...a) => FK.still(...a));

// ================================================================ Materialien

const ICE = ['#0b1826', '#132c44', '#1d4664', '#2c6788', '#448eae', '#6cb8d2', '#a6e0ee', '#e2fbff'];
const ICE_D = ['#08111c', '#0e2032', '#16334c', '#204a68', '#2e6686', '#4686a6'];
const FROST = ['#2a7aa8', '#4cb0d8', '#8ae0f4', '#cdf8ff', '#ffffff'];
const IGL = ['#0c3a58', '#2474a4', '#3aa2d2', '#6cd2f2', '#c8f6ff'];   // Leucht-Ebene
const RIM_ICE = '#d8f6ff', BACK_ICE = '#5cc8ec';
const CHIT = ['#06070d', '#0c0f1b', '#141a2c', '#1e2740', '#2c3856', '#3e4d70', '#5a6c90'];
const CHIT_HI = ['#7a8cb2', '#a8bad8'];   // fein: Glanzlinie und Glanzpunkt auf dem Chitin
// Erfrorener Ritter: eigener Farbakzent gegen die hellblauen Eisfiguren der Zone
// (Eiselementar, Eistroll) – neutral-graues Alteisen statt Blaustahl, ein
// erstarrter weinroter Umhang und violettes Totenlicht in Sehschlitz, Frostherz
// und Klingenrune. Eiskristalle bleiben eisblau.
const STEEL_F = ['#0e0e13', '#1a1a21', '#282830', '#3a3a44', '#52525e', '#72717c', '#9c9aa4', '#dcdae0'];
const CLOTH_F = ['#16070d', '#290c17', '#431422', '#601c2e', '#82293c'];
const VIO = ['#3a1660', '#6a2ea8', '#a868e8', '#dcb8ff', '#ffffff'];   // Totenlicht (Farbebene)
const VIG = ['#2a0c4c', '#5a1e9a', '#8c48dc', '#c08cff', '#f0e0ff'];   // Totenlicht (Leucht-Ebene)
const RIM_KN = '#e4e0ec', BACK_KN = '#8a5cd0';
const VOIDB = '#040810';

// ================================================================ Eiselementar

const IE = { W: 50, H: 58, AX: 23, AY: 54, pad: 10 };
const IE_REST = {
  hov: 21, bx: 0, lean: 0, spin: 0, fAx: 9, fAy: 2, bAx: -8, bAy: 3, fR: 0.5, bR: 2.4,
  orb: 0, crack: 0, eye: 1, pulse: 0.5, tail: 0, sh: 0, head: 0,
};
const iep = (o) => ({ ...IE_REST, ...o });

// Schwebende Kristallhand: Unterarm-Splitter + drei Krallen. r = Richtung (Winkel) des Unterarms
function iceHand(p, g, x, y, r, front) {
  const ramp = front ? ICE : ICE_D.concat(ICE[5]);
  // Unterarm: dicker Splitter von hinten zur Hand
  const bx = x - Math.cos(r) * 7, by = y - Math.sin(r) * 7;
  shard(p, g, bx - Math.cos(r) * 2, by - Math.sin(r) * 2, r, 11, 3, ramp, { base: 0.45, tipW: 1.6, spark: false });
  // Krallen
  for (let k = -1; k <= 1; k++) {
    const a = r + k * 0.55;
    shard(p, g, x, y, a, 4.5 + (k === 0 ? 1 : 0), 1.1, ramp, { base: 0.3, spark: front });
  }
  // Gelenkkristall mit Leuchtkern
  p.px(x, y, front ? FROST[2] : FROST[0]);
  g.px(x, y, IGL[front ? 3 : 2]);
  if (p.fine) {
    // Gelenkkristall: heller Kern im farbigen Saum, Glanz oben links
    dp(p, x + 0.5, y + 0.5, front ? FROST[4] : FROST[2]); dp(p, x, y, front ? FROST[3] : FROST[1]);
    g.dot(x + 0.75, y + 0.75, front ? IGL[4] : IGL[3]);
  }
}

// Kleiner Umlaufsplitter
function orbiter(p, g, x, y, a, s, front) {
  shard(p, g, x - Math.cos(a) * s, y - Math.sin(a) * s, a, s * 2, s * 0.55, front ? ICE : ICE_D.concat(ICE[5]), { base: 0.5, spark: front });
  if (front) g.px(x, y, IGL[1]);
}

function drawIceElemental(p, g, P, ex) {
  const { AX, AY } = IE;
  const meta = {};
  const gy = AY;
  const cx = AX + P.bx, cy = gy - P.hov;              // Kernmitte
  const L = P.lean;
  const hx = cx + 2 + L * 6 + P.head, hy = cy - 15 + Math.abs(L) * 1.5;
  const hurt = ex.hurt;

  // --- Frostschimmer am Boden
  frostMist(p, g, AX + P.bx * 0.5, gy - 1, 16, P.spin * 3, 7, [IGL[2], IGL[3], ICE[6]]);

  // --- Umlaufsplitter hinten
  const orbs = [0, 1, 2].map((i) => {
    const a = P.spin * TAU + i * TAU / 3;
    return { x: cx + Math.cos(a) * 15, y: cy + 2 + Math.sin(a) * 4.5 - L * Math.cos(a) * 3, a, front: Math.sin(a) > 0, i };
  });
  for (const o of orbs) if (!o.front) orbiter(p, g, o.x, o.y, -1.2 + o.i * 0.9 + P.spin * 2, 2.4, false);

  // --- hintere Hand
  iceHand(p, g, cx + P.bAx, cy + P.bAy, P.bR, false);

  // --- Eiszapfen-Schweif unter dem Rumpf (weht beim Schweben nach hinten)
  const tl = P.tail;
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + 0.25 + tl * 0.5 + (i - 1) * 0.35;
    const bx = cx - 2 + (i - 1) * 3, by = cy + 6;
    shard(p, g, bx, by, a, 9 - Math.abs(i - 1) * 3 + (i === 1 ? 3 : 0), 2.2 - Math.abs(i - 1) * 0.5, ICE_D.concat(ICE[5], ICE[6]), { base: 0.25 });
  }

  // --- Rumpf: Kristall-Geode. Große Außensplitter um einen leuchtenden Kern
  const body = [
    // [Winkel, Länge, halbe Breite, Rampe]
    [-2.75, 9, 4, ICE_D.concat(ICE[5], ICE[6])], [2.5, 10, 4, ICE_D.concat(ICE[5])], [1.85, 10, 4.2, ICE_D.concat(ICE[5])],
    [0.15, 8, 4, ICE_D.concat(ICE[5], ICE[6])], [1.1, 9, 4.2, ICE_D.concat(ICE[5], ICE[6])],
  ];
  // Grundkörper (dunkles Eis), dann Facetten
  ell(p, cx, cy, 7.5, 8.5, ICE_D, { rot: L * 0.3 });
  for (const [a, len, w, ramp] of body) shard(p, g, cx - Math.cos(a) * 2, cy - Math.sin(a) * 2, a + L * 0.3, len, w, ramp, { base: 0.4, tipW: 0.8 });
  // Brustfacetten (vorn, hell)
  poly(p, [[cx - 4 + L * 2, cy - 6], [cx + 5 + L * 3, cy - 5], [cx + 6 + L * 2, cy + 1], [cx + 1, cy + 5], [cx - 5, cy + 1]], ICE[3]);
  poly(p, [[cx - 4 + L * 2, cy - 6], [cx + 1 + L * 3, cy - 6], [cx - 1, cy - 1], [cx - 5, cy + 1]], ICE[5]);
  ln(p, cx - 4 + L * 2, cy - 6, cx + 5 + L * 3, cy - 5, ICE[7]);
  ln(p, cx - 5, cy + 1, cx + 1, cy + 5, ICE[1]);
  if (p.fine) {
    // Facettenkanten der Brustplatte: Grat zwischen Licht- und Mittelfläche, Schattenfacette unten rechts, Glanzpunkt
    p.fline(cx + 1 + L * 3, cy - 5.5, cx - 1, cy - 1, ICE[6]);
    p.fline(cx - 1, cy - 1, cx - 4.5, cy + 0.75, ICE[6]);
    poly(p, [[cx - 1, cy - 0.5], [cx + 6 + L * 2, cy + 1], [cx + 1, cy + 5]], ICE[2]);
    p.fline(cx - 1, cy - 0.5, cx + 5.5 + L * 2, cy + 1, ICE[4]);
    p.fline(cx - 3.5 + L * 2, cy - 5.75, cx + 4.5 + L * 3, cy - 4.75, ICE[6]);
    p.dot(cx - 2.5 + L * 2, cy - 5, '#ffffff'); p.dot(cx - 2 + L * 2, cy - 5, ICE[7]); p.dot(cx - 2.5 + L * 2, cy - 4.5, ICE[7]);
  }
  // Kern: pulsierender Frostkern in einer Aussparung
  const pu = P.pulse, cr = 2.2 + pu * 0.8 + P.crack * 0.8;
  const kx = cx + 1 + L * 2, ky = cy - 0.5;
  ell(p, kx, ky, cr + 1, cr + 1.2, [VOIDB, ICE[0]]);
  ell(p, kx, ky, cr, cr, [FROST[1], FROST[2], FROST[3], FROST[4]], { bias: 0.15 });
  p.px(kx - 0.5, ky - 1, '#ffffff');
  halo(g, kx, ky, cr + 0.5 + pu * 0.5, [IGL[2], IGL[3], IGL[4]]);
  if (p.fine) {
    // Fassung der Aussparung: Lichtkante oben links, Schattenkante unten rechts (Facettenrand)
    const R0 = cr + 0.5, R1 = cr + 1.1;
    p.each(kx - R1 - 1, ky - R1 - 1, kx + R1 + 1, ky + R1 + 1, (x, y) => {
      const dx = x - kx, dy = y - ky, d = Math.hypot(dx / R1, dy / (R1 + 0.2));
      if (d > 1 || Math.hypot(dx, dy) < R0) return null;
      const l = (dx * -0.6 + dy * -0.8) / (Math.hypot(dx, dy) || 1);
      return l > 0.45 ? ICE[6] : l < -0.55 ? ICE[2] : null;
    });
    // heißer Kern: weißes Herz im hellblauen Saum, Glanzpunkt oben links, Spiegelsichel unten rechts
    ell(p, kx, ky, cr * 0.62, cr * 0.62, [FROST[3], FROST[4]], { bias: 0.25 });
    ell(p, kx + 0.15, ky + 0.15, Math.max(0.6, cr * 0.32), Math.max(0.6, cr * 0.32), ['#ffffff']);
    p.dot(kx - cr * 0.55, ky - cr * 0.6, '#ffffff'); p.dot(kx - cr * 0.55 + 0.5, ky - cr * 0.6, '#ffffff'); p.dot(kx - cr * 0.55, ky - cr * 0.6 + 0.5, FROST[3]);
    p.each(kx - cr - 1, ky - cr - 1, kx + cr + 1, ky + cr + 1, (x, y) => {
      const dx = x - kx, dy = y - ky, d = Math.hypot(dx, dy);
      return d < cr - 0.05 && d > cr - 0.6 && dx + dy > cr * 0.55 ? FROST[2] : null;
    });
    halo(g, kx, ky, Math.max(0.6, cr * 0.4), ['#e8fcff']);
  }
  meta.core = { x: kx, y: ky };
  // Risse (Treffer/Tod): leuchtende Sprünge vom Kern nach außen
  if (P.crack > 0.05) {
    for (let i = 0; i < 5; i++) {
      let x = kx, y = ky, a = i * 1.3 + 0.4;
      const n = Math.round(3 + P.crack * 6);
      for (let s = 0; s < n; s++) {
        const x0 = x, y0 = y;
        x += Math.cos(a); y += Math.sin(a); a += (hash2(i, s, 91) - 0.5) * 1.2;
        if (p.fine) {
          // feiner Sprung: heißer heller Kern, farbiger Saum auf der Leucht-Ebene
          if (s === 0) continue;
          p.fline(x0 + 0.5, y0 + 0.5, x + 0.5, y + 0.5, s < n * 0.6 ? '#ffffff' : FROST[2]);
          g.fline(x0 + 0.5, y0 + 0.5, x + 0.5, y + 0.5, IGL[s < n * 0.5 ? 3 : 2], 1);
          if (s < n * 0.6) g.fline(x0 + 0.5, y0 + 0.5, x + 0.5, y + 0.5, IGL[4]);
          continue;
        }
        p.px(x, y, s < n * 0.6 ? FROST[3] : FROST[1]); g.px(x, y, IGL[s < n * 0.5 ? 3 : 2]);
      }
    }
  }

  // --- Schulterzacken (klare Silhouette)
  const shB = { x: cx - 5 + L * 3, y: cy - 6 }, shF = { x: cx + 5 + L * 4, y: cy - 5 };
  shard(p, g, shB.x, shB.y, -2.45 - P.sh * 0.2, 10 + P.sh * 2, 3, ICE_D.concat(ICE[5], ICE[6]), { base: 0.3 });
  // --- Kopf: Kristallkrone mit Augenschlitz
  const hh = p.fine ? { x: p.snap(hx), y: p.snap(hy) } : { x: hx, y: hy };
  // Hals (fein: heller Kristallhals mit Facetten, schließt die Silhouette zwischen Rumpf und Kopf)
  if (!p.fine) ell(p, cx + 1 + L * 5, cy - 9, 3, 2.5, ICE_D);
  else {
    const nx0 = cx + 1 + L * 5, by = cy - 5.5, ty = hh.y + 3.5;
    const B0 = [nx0 - 3.5, by], B1 = [nx0 + 3.5, by], T0 = [hh.x - 2.5, ty], T1 = [hh.x + 3, ty];
    const M0 = [(B0[0] + T0[0]) / 2 - 0.75, (by + ty) / 2], M1 = [(B1[0] + T1[0]) / 2 + 0.5, (by + ty) / 2];
    const Bm = [nx0 + 0.25, by], Tm = [hh.x + 0.5, ty];
    poly(p, [B0, M0, T0, Tm, Bm], ICE[5]);                    // Lichtfacette (links oben)
    poly(p, [Bm, Tm, T1, M1, B1], ICE[3]);                    // Schattenfacette
    poly(p, [M0, [(Bm[0] + Tm[0]) / 2, M0[1] - 0.5], Tm, T0], ICE[6]);   // obere Lichtfacette
    p.fline(Bm[0], Bm[1], Tm[0], Tm[1], ICE[7]);              // Grat
    p.fline(B0[0], B0[1], M0[0], M0[1], ICE[6]); p.fline(M0[0], M0[1], T0[0], T0[1], ICE[7]);   // Lichtkante
    p.fline(B1[0], B1[1], M1[0], M1[1], ICE[1]); p.fline(M1[0], M1[1], T1[0], T1[1], ICE[2]);   // Schattenkante
    p.fline(M0[0] + 0.5, M0[1], M1[0] - 0.5, M1[1], ICE[4]);  // Facettenbruch quer
    p.dot(M0[0] + 0.5, M0[1] - 1, '#ffffff');
    // innere Glut steigt vom Kern auf (Leucht-Ebene, dünn)
    g.fline(Bm[0] + 0.5, Bm[1] + 1, Tm[0] + 0.5, Tm[1] - 0.5, IGL[1]);
  }
  shard(p, g, hh.x - 1, hh.y + 1, -1.9, 9, 2.4, ICE, { base: 0.4 });           // hinterer Kronenzacken
  shard(p, g, hh.x + 1, hh.y + 1, -1.45, 11, 2.6, ICE, { base: 0.4 });         // Mittelzacken
  // Gesichtsplatte (keilförmig nach vorn)
  poly(p, [[hh.x - 4, hh.y - 2], [hh.x + 2, hh.y - 4], [hh.x + 6, hh.y], [hh.x + 3, hh.y + 4], [hh.x - 3, hh.y + 3]], p.fine ? ICE[3] : ICE[2]);
  poly(p, [[hh.x - 4, hh.y - 2], [hh.x + 2, hh.y - 4], [hh.x + 1, hh.y - 1], [hh.x - 3, hh.y]], p.fine ? ICE[5] : ICE[4]);
  ln(p, hh.x - 3, hh.y - 2, hh.x + 2, hh.y - 4, ICE[7]);
  ln(p, hh.x + 6, hh.y, hh.x + 3, hh.y + 4, ICE[1]);
  if (p.fine) {
    // Gesichtsplatte: zweite Lichtstufe unter der Kante, Facettengrat, hellere Wangenfacette, Glanzpunkt
    p.fline(hh.x - 3, hh.y - 1.5, hh.x + 1.5, hh.y - 3.5, ICE[5]);
    p.fline(hh.x + 2, hh.y - 3.5, hh.x + 1, hh.y - 1, ICE[6]);
    poly(p, [[hh.x + 1.5, hh.y + 1.5], [hh.x + 5.5, hh.y + 0.5], [hh.x + 3.5, hh.y + 3.5]], ICE[4]);
    poly(p, [[hh.x - 3, hh.y + 0.5], [hh.x + 1, hh.y + 1], [hh.x - 2.5, hh.y + 3]], ICE[4]);   // helle Kieferfacette links
    p.fline(hh.x + 5.5, hh.y + 0.5, hh.x + 3.5, hh.y + 3.5, ICE[1]);
    p.dot(hh.x - 2, hh.y - 2, '#ffffff'); p.dot(hh.x - 1.5, hh.y - 2.5, ICE[7]);
  }
  shard(p, g, hh.x + 3, hh.y - 1, -0.9, 7, 1.6, ICE, { base: 0.35 });          // vorderer Zacken
  // Augen: dunkle Höhle unter einer vorspringenden Brauenkante, schräger
  // Glutschlitz (zornig zur Mitte hin abfallend), darunter ein Kieferspalt
  const ec = hurt ? '#ffffff' : FROST[4];
  if (!p.fine) {
    p.line(hh.x, hh.y - 2, hh.x + 5, hh.y - 1, ICE[7]);
    p.line(hh.x, hh.y - 1, hh.x + 5, hh.y, ICE[1]);
    p.rect(hh.x + 1, hh.y, 4, 1, VOIDB); p.px(hh.x + 1, hh.y + 1, VOIDB);
    if (P.eye > 0.3) {
      p.px(hh.x + 2, hh.y, ec); p.px(hh.x + 3, hh.y, ec); p.px(hh.x + 4, hh.y, FROST[2]); p.px(hh.x + 1, hh.y + 1, FROST[1]);
      g.px(hh.x + 2, hh.y, IGL[4]); g.px(hh.x + 3, hh.y, IGL[4]); g.px(hh.x + 4, hh.y, IGL[3]); g.px(hh.x + 1, hh.y + 1, IGL[2]); g.px(hh.x + 5, hh.y, IGL[1]);
    }
    p.line(hh.x + 2, hh.y + 2, hh.x + 4, hh.y + 2, VOIDB);
  } else {
    // Brauenkante als vorspringender Grat (hell, Mittelton, Schattenfuge), zur Mitte hin abfallend
    const X = hh.x, Y = hh.y;
    p.fline(X, Y - 2, X + 5.5, Y - 1, ICE[7]);
    p.fline(X, Y - 1.5, X + 5.5, Y - 0.5, ICE[4]);
    p.fline(X + 0.5, Y - 1, X + 5.5, Y, ICE[0]);
    // Augenhöhle und Glutschlitz: mandelförmig, heißer weißer Kern im farbigen Saum, innerer Winkel tiefer (zornig)
    p.rect(X + 1, Y, 4, 1, VOIDB); p.dot(X + 1, Y + 1, VOIDB); p.dot(X + 4, Y + 1, VOIDB); p.dot(X + 4.5, Y + 1, VOIDB);
    if (P.eye > 0.3) {
      // weißer Kern = ein voller Weltpixel (2×2 Feinpixel), klar abgesetzt gegen den blauen Saum
      const E = [
        [2.5, 0, ec, '#ffffff'], [3, 0, ec, '#ffffff'], [2.5, 0.5, ec, '#ffffff'], [3, 0.5, ec, IGL[4]],
        [2, 0, FROST[1], IGL[2]], [2, 0.5, FROST[2], IGL[3]], [1.5, 0.5, FROST[0], IGL[1]],
        [3.5, 0, FROST[1], IGL[2]], [3.5, 0.5, FROST[2], IGL[3]], [3.5, 1, FROST[1], IGL[2]], [4, 1, FROST[0], IGL[1]],
      ];
      for (const [dx, dy, c, gc] of E) { p.dot(X + dx, Y + dy, c); g.dot(X + dx, Y + dy, gc); }
      g.dot(X + 4.5, Y + 1, IGL[1]);
    }
    // Kieferspalt mit zwei Eiszähnen, Kinnkante im Licht
    p.fline(X + 2, Y + 2, X + 4.5, Y + 2, VOIDB);
    p.dot(X + 2.5, Y + 2, ICE[6]); p.dot(X + 3.5, Y + 2, ICE[5]);
    p.fline(X + 2, Y + 2.5, X + 4, Y + 2.5, ICE[3]);
  }
  meta.eye = { x: hh.x + 3, y: hh.y };
  meta.head = { x: hh.x, y: hh.y - 10 };
  meta.mouth = { x: hh.x + 5, y: hh.y + 2 };

  // --- Schulter vorn
  shard(p, g, shF.x - 1, shF.y, -0.75 - P.sh * 0.25, 9 + P.sh * 2, 3, ICE, { base: 0.3 });

  // --- Umlaufsplitter vorn
  for (const o of orbs) if (o.front) orbiter(p, g, o.x, o.y, -1.2 + o.i * 0.9 + P.spin * 2, 2.6, true);

  // --- vordere Hand + Frostkugel
  const hF = { x: cx + P.fAx, y: cy + P.fAy };
  iceHand(p, g, hF.x, hF.y, P.fR, true);
  meta.hand = { x: hF.x + Math.cos(P.fR) * 4, y: hF.y + Math.sin(P.fR) * 4 };
  if (P.orb > 0.2) {
    const ox = ex.orbAt ? ex.orbAt.x : hF.x + Math.cos(P.fR) * 4.5, oy = ex.orbAt ? ex.orbAt.y : hF.y + Math.sin(P.fR) * 4.5 - 1;
    const r = P.orb * 3.4;
    // Sog: Frostfäden laufen zur Kugel
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9 + P.spin * 5, d = r + 2 + ((i * 3 + P.spin * 20) % 6);
      const x = ox + Math.cos(a) * d, y = oy + Math.sin(a) * d * 0.8;
      if (p.fine) { g.dot(x, y, IGL[3]); g.dot(x + 0.5, y, IGL[2]); p.dot(x, y, i % 2 ? FROST[3] : FROST[1]); continue; }
      g.px(x, y, IGL[2]); if (i % 2) p.px(x, y, FROST[2]);
    }
    ell(p, ox, oy, r + 0.6, r + 0.6, [ICE[3], ICE[5]]);
    ell(p, ox, oy, r, r, [FROST[1], FROST[2], FROST[3], FROST[4]], { bias: 0.2 });
    if (!p.fine) for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + P.spin * 3; p.px(ox + Math.cos(a) * (r + 1.2), oy + Math.sin(a) * (r + 1.2), FROST[4]); }
    halo(g, ox, oy, r + 1, [IGL[2], IGL[3], IGL[4]]);
    if (p.fine) {
      // heißer Kern, Glanzpunkt, umlaufende Eisfunken als kleine Sterne (Kern weiß, Strahlen hellblau)
      ell(p, ox + 0.2, oy + 0.2, r * 0.45, r * 0.45, ['#ffffff']);
      p.dot(ox - r * 0.5, oy - r * 0.55, '#ffffff');
      halo(g, ox, oy, Math.max(0.6, r * 0.45), ['#e8fcff']);
      for (let i = 0; i < 4; i++) {
        const a = i * TAU / 4 + P.spin * 3, sx = p.snap(ox + 0.5 + Math.cos(a) * (r + 1.4)), sy = p.snap(oy + 0.5 + Math.sin(a) * (r + 1.4));
        p.dot(sx, sy, '#ffffff'); g.dot(sx, sy, IGL[4]);
        for (const [u, v] of [[-0.5, 0], [0.5, 0], [0, -0.5], [0, 0.5]]) { p.dot(sx + u, sy + v, FROST[2]); g.dot(sx + u, sy + v, IGL[2]); }
      }
    }
    meta.hand = { x: ox, y: oy };
  }
  // Frostspur des geworfenen Geschosses
  if (ex.trail) {
    const x1 = meta.hand.x, y1 = meta.hand.y, x0 = x1 - 14, y0 = y1 + 3;
    for (let i = 0; i <= 10; i++) {
      const t = i / 10, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t + Math.sin(t * 9) * 0.6;
      if (p.fine) {
        // feine Spur: geschlossener Faden, vorn heiß (weißer Kern), hinten dünn
        if (i > 0) {
          const tp = (i - 1) / 10, xp = x0 + (x1 - x0) * tp, yp = y0 + (y1 - y0) * tp + Math.sin(tp * 9) * 0.6;
          if (t > 0.3) { p.fline(xp + 0.5, yp + 0.5, x + 0.5, y + 0.5, t > 0.7 ? '#ffffff' : FROST[2]); g.fline(xp + 0.5, yp + 0.5, x + 0.5, y + 0.5, IGL[t > 0.7 ? 3 : 2], t > 0.6 ? 1 : 0); }
          else if (i % 2) { p.dot(x + 0.5, y + 0.5, FROST[1]); g.dot(x + 0.5, y + 0.5, IGL[2]); }
        }
        continue;
      }
      if (hash2(i, 3, 5) < 0.35 + t * 0.6) { p.px(x, y, t > 0.7 ? FROST[3] : FROST[1]); g.px(x, y, IGL[t > 0.7 ? 3 : 2]); }
    }
  }
  return meta;
}

// Zerborstener Elementar: Splitterhaufen, Kern erlischt (k 0..1)
function drawIceHeap(p, g, k) {
  const { AX, AY } = IE;
  const gy = AY - 1;
  const heat = 1 - k;
  const bits = [
    [-12, 0, -2.6, 7, 2], [-7, 0, -1.9, 9, 2.6], [-2, 0, -1.4, 6, 2.2], [3, 0, -1.2, 10, 2.8], [8, 0, -0.5, 7, 2],
    [12, 0, -0.9, 5, 1.6], [-15, 0, -2.9, 5, 1.6], [0, -1, -2.2, 5, 1.8], [16, 0, -0.3, 4, 1.4],
  ];
  for (const [dx, dy, a, len, w] of bits) shard(p, g, AX + dx, gy + dy, a, len * (0.85 + (1 - k) * 0.15), w, dx % 2 ? ICE_D.concat(ICE[5], ICE[6]) : ICE, { base: 0.35 });
  // Kopfplatte liegt schräg
  poly(p, [[AX + 5, gy - 3], [AX + 11, gy - 5], [AX + 13, gy - 1], [AX + 6, gy]], ICE[4]);
  ln(p, AX + 5, gy - 3, AX + 11, gy - 5, ICE[7]);
  p.rect(AX + 8, gy - 3, 3, 1, heat > 0.4 ? FROST[2] : VOIDB);
  if (p.fine) {
    // Kopfplatte: zweite Lichtstufe, Schattenkante; Augenschlitz glimmt mit hellem Kern nach
    p.fline(AX + 5.5, gy - 2.5, AX + 10.5, gy - 4.25, ICE[5]);
    p.fline(AX + 13, gy - 1, AX + 6, gy, ICE[1]);
    p.fline(AX + 8, gy - 2.5, AX + 11, gy - 2.5, ICE[2]);
    if (heat > 0.4) { p.dot(AX + 9, gy - 3, '#ffffff'); p.dot(AX + 9.5, gy - 3, FROST[4]); g.dot(AX + 9, gy - 3, IGL[4]); g.dot(AX + 9.5, gy - 3, IGL[3]); g.dot(AX + 8.5, gy - 3, IGL[2]); }
  }
  // erlöschender Kern
  const r = 1.2 + heat * 1.8;
  ell(p, AX - 1, gy - 3, r, r, heat > 0.3 ? [FROST[0], FROST[1], FROST[2], FROST[3]] : [ICE[1], ICE[2], ICE[3]]);
  if (p.fine && heat > 0.3) { ell(p, AX - 0.9, gy - 2.9, r * 0.4, r * 0.4, [heat > 0.6 ? '#ffffff' : FROST[3]]); p.dot(AX - 1 - r * 0.5, gy - 3 - r * 0.55, FROST[4]); }
  if (heat > 0.1) halo(g, AX - 1, gy - 3, r * heat, heat > 0.5 ? [IGL[2], IGL[3], IGL[4]] : [IGL[2], IGL[3]]);
  // Frostnebel
  if (k < 0.8) frostMist(p, g, AX, gy, 26 * (1 - k * 0.5), k * 5, 13, [IGL[2], IGL[3], ICE[5]]);
  return { eye: { x: AX + 9, y: gy - 3 }, head: { x: AX + 8, y: gy - 7 }, hand: { x: AX - 1, y: gy - 3 }, core: { x: AX - 1, y: gy - 3 } };
}

function createIceElemental() {
  const S = spec(IE, drawIceElemental, RIM_ICE, BACK_ICE);
  const idle = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, ph = t * TAU, s = Math.sin(ph);
    idle.push([t, iep({ hov: 21 - s * 1.5, spin: t, pulse: 0.5 + 0.5 * Math.sin(ph * 2), fAy: 2 - s * 1.2, bAy: 3 - Math.sin(ph + 1) * 1.2, fR: 0.5 + s * 0.1, bR: 2.4 - s * 0.1, tail: Math.sin(ph + 0.8) * 0.2, sh: Math.max(0, s) * 0.5 }), linear]);
  }
  const walk = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, ph = t * TAU, s = Math.sin(ph * 2);
    walk.push([t, iep({ hov: 20 - s * 1, bx: 1, lean: 0.25, spin: t * 1.5, pulse: 0.6 + 0.3 * s, fAx: 10, fAy: 4 - s, fR: 0.9, bAx: -10, bAy: 5, bR: 2.7, tail: 0.6 + s * 0.1, head: 1 }), linear]);
  }
  // Ausholen: Hände weit auseinander, dann vorn zusammen – die Frostkugel wächst
  const w0 = idle[0][1];
  const w1 = iep({ hov: 23, bx: -1, lean: -0.2, spin: 0.2, pulse: 1, fAx: 6, fAy: -8, fR: -1.2, bAx: -11, bAy: -4, bR: -2.4, orb: 0.5, tail: -0.2, sh: 1, head: -1 });
  const w2 = iep({ hov: 24, bx: -2, lean: -0.35, spin: 0.4, pulse: 1.4, fAx: 3, fAy: -11, fR: -1.6, bAx: -10, bAy: -8, bR: -2.2, orb: 1, tail: -0.3, sh: 1.5, head: -1.5 });
  // Wurf: Arm schnellt nach vorn, Kugel fliegt ab
  const s1 = iep({ hov: 21, bx: 3, lean: 0.35, spin: 0.55, pulse: 1.2, fAx: 15, fAy: -3, fR: -0.1, bAx: -9, bAy: 1, bR: 2.8, orb: 0, tail: 0.6, sh: 0.4, head: 1.5 });
  const s2 = iep({ hov: 20, bx: 2, lean: 0.3, spin: 0.65, pulse: 0.8, fAx: 14, fAy: 0, fR: 0.2, bAx: -9, bAy: 3, bR: 2.6, tail: 0.5, head: 1 });
  const s3 = iep({ hov: 21, bx: 0, lean: 0.05, spin: 0.75, pulse: 0.6, fAx: 10, fAy: 2, fR: 0.5, tail: 0.1 });
  const hurtP = iep({ hov: 23, bx: -3, lean: -0.45, spin: 0.1, crack: 0.6, pulse: 1.5, fAx: 5, fAy: -4, fR: -1, bAx: -12, bAy: -1, bR: -2.6, sh: 1, head: -2 });
  const d1 = iep({ hov: 22, bx: -2, lean: -0.5, crack: 1, pulse: 2, fAx: 8, fAy: -8, fR: -1.3, bAx: -12, bAy: -6, bR: -2.4, sh: 2, head: -2 });
  const d2 = iep({ hov: 14, bx: 0, lean: 0.4, crack: 1.4, pulse: 2.4, fAx: 12, fAy: 6, fR: 1.2, bAx: -12, bAy: 8, bR: 2, sh: 2.5, tail: 0.8, eye: 0 });
  return {
    idle: new Animation(track(S, idle, 8, { loop: true }), 8),
    walk: new Animation(track(S, walk, 8, { loop: true }), 10),
    windup: new Animation(track(S, [[0, w0], [0.45, w1], [1, w2]], 5), 8, false),
    strike: new Animation(track(S, [[0, s1], [0.3, s2, snap], [1, s3]], 4, {
      extras: { 0: { fx: 'cast', trail: true } },
    }), 12, false),
    hurt: new Animation(track(S, [[0, hurtP], [1, iep({ hov: 21, lean: -0.1, crack: 0.2 })]], 2, { extras: { 0: { hurt: true } } }), 10, false),
    death: new Animation([
      ...track(S, [[0, hurtP], [0.45, d1], [1, d2]], 4, { extras: { 0: { hurt: true }, 1: { hurt: true } } }),
      stillR(S, (p, g) => drawIceHeap(p, g, 0), 'impact', RIM_ICE, BACK_ICE),
      stillR(S, (p, g) => drawIceHeap(p, g, 0.4), null, RIM_ICE, BACK_ICE),
      stillR(S, (p, g) => drawIceHeap(p, g, 0.75), null, RIM_ICE, BACK_ICE),
      stillR(S, (p, g) => drawIceHeap(p, g, 1), null, RIM_ICE, BACK_ICE),
    ], 9, false),
  };
}


// ================================================================ Kristallspinne

const CS = { W: 74, H: 40, AX: 32, AY: 35, pad: 8 };
const CS_REST = { t: 0, amp: 0, bob: 0, crouch: 0, rear: 0, lunge: 0, fang: 0, curl: 0, sink: 0, glow: 0.7, abd: 0, pal: 0, eye: 1 };
const csp = (o) => ({ ...CS_REST, ...o });
const CRYS = ['#0e2436', '#1a4460', '#2a6e8e', '#48a2c0', '#7ed4e8', '#c4f4fc', '#ffffff'];
// Beinansätze relativ zur Kopfbrust, Ruhe-Fuß-x relativ zur Körpermitte
const SP_LEGS = [
  { ax: 3, fx: 24, kh: 9 }, { ax: 1, fx: 14, kh: 11 }, { ax: -1, fx: -8, kh: 11 }, { ax: -3, fx: -21, kh: 9 },
];

// Glanz (fein): Glanzlinie als Bogen auf der Lichtseite einer Ellipse (zwei Stufen), Glanzpunkt am Scheitel.
// cols = [Linie hell, Linie Rand, Glanzpunkt]
function gloss(p, cx, cy, rx, ry, rot, cols, band = [0.6, 0.74]) {
  const c = Math.cos(rot), s = Math.sin(rot);
  p.each(cx - rx - 1, cy - ry - 1, cx + rx + 1, cy + ry + 1, (x, y) => {
    const dx = x - cx, dy = y - cy, u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry, d = Math.hypot(u, v);
    if (d < band[0] || d > band[1]) return null;
    const l = (u * -0.55 + v * -0.83) / d;
    return l > 0.9 ? cols[0] : l > 0.72 ? cols[1] : null;
  });
  const gx = cx + (-0.36 * rx) * c - (-0.5 * ry) * s, gy = cy + (-0.36 * rx) * s + (-0.5 * ry) * c;
  p.dot(gx, gy, cols[2]); p.dot(gx + 0.5, gy, cols[0]);
}
const CHIT_GL = [CHIT_HI[0], CHIT[6], CHIT_HI[1]];

function spiderLeg(p, g, bx, by, fx, fy, kh, ramp, near, P, i) {
  // Knie hoch über dem Körper (Spinnenbogen), Unterschenkel zum Fuß
  const kx = bx + (fx - bx) * 0.32, ky = by - kh * (1 - P.curl * 0.7);
  let fX = fx, fY = fy;
  if (P.curl > 0) { fX = fx + (bx - fx) * P.curl * 0.8; fY = fy + (by - 6 - fy) * P.curl; }
  limb(p, bx, by, kx, ky, near ? 3 : 2.5, 2.2, ramp);
  limb(p, kx, ky, fX, fY, 2.2, 1.2, ramp);
  // Gelenke: Hüftring und dunkles Band unterhalb des Knies (gegliederter Chitinpanzer)
  p.px(bx, by, ramp[3]); p.px(bx + 1, by + 1, ramp[0]);
  const sx = kx + (fX - kx) * 0.35, sy = ky + (fY - ky) * 0.35;
  p.px(sx, sy, ramp[0]); p.px(sx + 0.7, sy, ramp[0]);
  // Kristalldorn am Knie
  shard(p, g, kx, ky, -Math.PI / 2 - (fx > bx ? -0.4 : 0.4), near ? 4 : 3, 1, near ? CRYS : CRYS.slice(0, 5).concat(CRYS[4]), { base: 0.3, spark: near });
  p.px(fX, fY, near ? CRYS[4] : CRYS[2]);
  if (near && P.glow > 0.4) g.px(kx, ky - 1, IGL[1]);
  if (p.fine && near && P.curl < 0.5) {
    // Chitin (nahe Beine): Glanzlinie auf der Lichtseite jedes Glieds, Gelenkfuge als dunkler Ring mit heller Kante
    const seg = (x0, y0, x1, y1, w) => {
      const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
      let nx = -dy / l, ny = dx / l;
      if (nx + ny > 0) { nx = -nx; ny = -ny; }
      const o = w * 0.22;
      p.fline(x0 + 0.5 + nx * o + dx * 0.18, y0 + 0.5 + ny * o + dy * 0.18, x1 + 0.5 + nx * o - dx * 0.22, y1 + 0.5 + ny * o - dy * 0.22, CHIT_HI[0]);
      return { nx, ny, dx: dx / l, dy: dy / l };
    };
    seg(bx, by, kx, ky, near ? 3 : 2.5);
    const b = seg(kx, ky, fX, fY, 2);
    const hw = 0.9;
    p.fline(sx + 0.5 - b.nx * hw, sy + 0.5 - b.ny * hw, sx + 0.5 + b.nx * hw, sy + 0.5 + b.ny * hw, CHIT[0]);
    p.fline(sx + 0.5 + b.dx * 0.5 - b.nx * hw, sy + 0.5 + b.dy * 0.5 - b.ny * hw, sx + 0.5 + b.dx * 0.5 + b.nx * hw, sy + 0.5 + b.dy * 0.5 + b.ny * hw, CHIT[5]);
    // Fußkralle: helle Kristallspitze
    p.dot(fX + 0.5, fY + 0.5, CRYS[5]);
  }
}

function drawCrystalSpider(p, g, P, ex) {
  const { AX, AY } = CS;
  const meta = {};
  const gy = AY;
  const ox = AX + P.lunge;
  const top = gy - 11 + P.crouch + P.bob + P.sink;   // Rückenlinie der Kopfbrust
  const ch = { x: ox + 5, y: top + 3 - P.rear * 3 };
  const ab = { x: ox - 7, y: top - 0.5 + P.rear * 1.5 };
  const hurt = ex.hurt;

  const legs = (near) => {
    SP_LEGS.forEach((L, i) => {
      const ph = P.t * TAU + (i % 2 ? Math.PI : 0) + (near ? 0 : Math.PI);
      let sw = Math.sin(ph) * 3 * P.amp, lift = Math.max(0, Math.cos(ph)) * 2.5 * P.amp;
      let fx = ox + L.fx * (near ? 1 : 0.8) + sw + (near ? 1 : -2), fy = gy - lift - (near ? 0 : 2);
      if (i === 0 && P.rear > 0) { fx += P.rear * 3; fy -= P.rear * 13; }
      if (i === 1 && P.rear > 0) { fx += P.rear * 2; fy -= P.rear * 6; }
      const bx = ch.x + L.ax - 2 + (near ? 0.5 : -0.5), by = ch.y + (near ? 1 : 0);
      spiderLeg(p, g, bx, by, fx, fy, L.kh + (i === 0 ? P.rear * 3 : 0), near ? [CHIT[2], CHIT[4], CHIT[5], CHIT[6]] : [CHIT[0], CHIT[1], CHIT[2], CHIT[3]], near, P, i);
    });
  };
  legs(false);

  // --- Hinterleib: dunkler Panzer, Kristalldrusen
  const abR = -0.15 + P.rear * 0.15, abRy = 7 - P.sink * 0.3;
  ell(p, ab.x, ab.y, 10, abRy, CHIT, { rot: abR, noise: p.fine ? 0 : 0.04, seed: 5 });
  // Panzersegmente: helle Kante oben, dunkle Fuge darunter
  if (!p.fine) for (const dx of [-5, -1, 3]) { p.line(ab.x + dx, ab.y - 4, ab.x + dx - 1, ab.y + 4, CHIT[1]); p.line(ab.x + dx + 1, ab.y - 4, ab.x + dx, ab.y + 2, CHIT[5]); }
  else {
    // fein: Fuge 1 Feinpixel dunkel, daneben Plattenkante im Licht (zweistufig), Glanzlinie und Glanzpunkt
    for (const dx of [-5, -1, 3]) {
      p.fline(ab.x + dx + 0.5, ab.y - 4.5, ab.x + dx - 0.5, ab.y + 4.5, CHIT[0]);
      p.fline(ab.x + dx + 1, ab.y - 4.5, ab.x + dx + 0.25, ab.y + 2.5, CHIT[5]);
      p.fline(ab.x + dx + 1, ab.y - 4.5, ab.x + dx + 0.75, ab.y - 2.5, CHIT[6]);
    }
    gloss(p, ab.x, ab.y, 10, abRy, abR, CHIT_GL);
  }
  // Leuchtende Zeichnung (Rautenmuster)
  const gl = P.glow;
  for (let i = 0; i < 3; i++) {
    const x = ab.x - 5 + i * 3.5, y = ab.y + 2 - i * 0.6;
    if (p.fine) {
      // fein: Raute als Linienzeichen, heißer Kern in der Mitte, farbiger Saum
      const X = p.snap(x) + 0.5, Y = p.snap(y);
      const on = gl > 0.3, ring = [[-0.5, 0], [0, -0.5], [0.5, -1], [1, -0.5], [1.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]];
      for (const [u, v] of ring) { p.dot(X + u, Y + v, on ? (v < 0 ? FROST[2] : FROST[1]) : CHIT[3]); if (on) g.dot(X + u, Y + v, IGL[2]); }
      p.dot(X + 0.5, Y, on ? (gl > 0.8 ? '#ffffff' : FROST[3]) : CHIT[2]);
      if (on) g.dot(X + 0.5, Y, IGL[gl > 0.8 ? 4 : 3]);
      continue;
    }
    p.px(x, y, gl > 0.3 ? FROST[1] : CHIT[3]); p.px(x + 1, y - 1, gl > 0.3 ? FROST[2] : CHIT[3]); p.px(x + 1, y + 1, gl > 0.3 ? FROST[0] : CHIT[2]);
    if (gl > 0.3) { g.px(x, y, IGL[2]); g.px(x + 1, y - 1, IGL[gl > 0.8 ? 4 : 3]); g.px(x + 1, y + 1, IGL[1]); }
  }
  // Spinnwarzen
  p.px(ab.x - 10, ab.y + 2, CHIT[3]); p.px(ab.x - 11, ab.y + 3, CHIT[2]);
  if (p.fine) { p.dot(ab.x - 10, ab.y + 2, CHIT[5]); p.dot(ab.x - 10.5, ab.y + 3, CHIT[4]); p.dot(ab.x - 10, ab.y + 3.5, CHIT[0]); }
  // Kristalldrusen auf dem Rücken (von hinten nach vorn, größer werdend)
  const cr = [[-7, -2.35, 5], [-4, -2.0, 8], [-1, -1.75, 10], [2, -1.45, 7], [4, -1.2, 5], [-2, -2.3, 6]];
  cr.forEach(([dx, a, len], i) => {
    const bx = ab.x + dx, by = ab.y - 4.5 + Math.abs(dx) * 0.15;
    shard(p, g, bx, by, a + P.rear * 0.2, len * (1 - P.sink * 0.03), 1.8 + len * 0.12, CRYS, { base: 0.3, gl: gl > 0.3 ? [IGL[1], IGL[gl > 0.8 ? 3 : 2]] : null });
  });
  // nahe Beine: vor dem Hinterleib, aber unter der Kopfbrust (Ansätze verdeckt)
  legs(true);

  // --- Kopfbrust
  ell(p, ch.x, ch.y, 6, 4.2, CHIT, { rot: -P.rear * 0.4, noise: p.fine ? 0 : 0.04, seed: 9 });
  if (p.fine) gloss(p, ch.x, ch.y, 6, 4.2, -P.rear * 0.4, CHIT_GL);
  // dunkle Gesichtsplatte, auf der die Augen leuchten
  ell(p, ch.x + 4 + P.rear, ch.y - 1.5 - P.rear, 2.6, 2, [CHIT[0], CHIT[1], CHIT[2]]);
  ln(p, ch.x - 4, ch.y - 3, ch.x + 2, ch.y - 4, CHIT[6]);
  if (p.fine) { p.fline(ch.x - 3, ch.y - 2.75, ch.x + 1, ch.y - 3.5, CHIT_HI[0]); p.dot(ch.x - 2.5, ch.y - 3, CHIT_HI[1]); }
  // Kristallkamm auf dem Kopf
  shard(p, g, ch.x - 1, ch.y - 3, -1.9, 4, 1.3, CRYS, { base: 0.3 });
  shard(p, g, ch.x + 1.5, ch.y - 3.5, -1.6, 3, 1.1, CRYS, { base: 0.3 });
  // Augen: Gruppe aus 6 Punkten
  const ex0 = ch.x + 4 + P.rear, ey0 = ch.y - 2 - P.rear;
  const ec = hurt ? '#ffffff' : FROST[4];
  const eyes = [[0, 0, 1], [2, 0.5, 1], [1, -1, 0], [-1, -0.5, 0], [2.5, 1.5, 0], [0.5, 1, 0]];
  if (p.fine) {
    // Augenreihe: zwei große Hauptaugen (Glanzpunkt, heller Kern, Iris darunter), darüber ein Bogen aus vier
    // kleinen Nebenaugen, zwei weitere seitlich unten – jedes mit hellem Kern im farbigen Saum.
    const X = p.snap(ex0), Y = p.snap(ey0), on = P.eye > 0.3;
    const row = [[-1.5, -0.5], [-0.5, -1.5], [0.5, -1.5], [1.5, -1]];
    for (const [dx, dy] of row.concat([[2.5, 1.5], [0.5, 1]])) {
      p.dot(X + dx, Y + dy, on ? FROST[3] : CHIT[0]); p.dot(X + dx + 0.5, Y + dy, on ? FROST[1] : CHIT[1]);
      if (on) { g.dot(X + dx, Y + dy, IGL[3]); g.dot(X + dx + 0.5, Y + dy, IGL[1]); }
    }
    for (const [dx, dy] of [[0, 0], [2, 0.5]]) {
      const c = [[0, 0, ec, IGL[4]], [0.5, 0, FROST[2], IGL[3]], [0, 0.5, FROST[2], IGL[3]], [0.5, 0.5, FROST[1], IGL[2]], [0, 1, FROST[0], IGL[1]], [0.5, 1, CHIT[1], null], [-0.5, 0.5, CHIT[0], null], [1, 0.5, CHIT[0], null]];
      for (const [u, v, pc, gc] of c) {
        p.dot(X + dx + u, Y + dy + v, on ? pc : (gc ? CHIT[1] : CHIT[0]));
        if (on && gc) g.dot(X + dx + u, Y + dy + v, gc);
      }
    }
  } else for (const [dx, dy, big] of eyes) {
    const x = ex0 + dx, y = ey0 + dy;
    p.px(x, y, P.eye > 0.3 ? (big ? ec : FROST[2]) : CHIT[0]);
    if (P.eye > 0.3) g.px(x, y, IGL[big ? 4 : 3]);
    // Hauptaugen: zweistufig (Iris unter dem Glanzpunkt)
    if (big) { p.px(x, y + 1, P.eye > 0.3 ? FROST[1] : CHIT[0]); if (P.eye > 0.3) g.px(x, y + 1, IGL[2]); }
  }
  meta.eye = { x: ex0 + 1, y: ey0 };
  meta.head = { x: ch.x + 2, y: ch.y - 7 };
  // Taster
  const pl = P.pal;
  p.line(ch.x + 5, ch.y + 1, ch.x + 8 + pl, ch.y + 2 - pl * 2, CHIT[4]); p.px(ch.x + 8 + pl, ch.y + 3 - pl * 2, CHIT[5]);
  if (p.fine) { p.fline(ch.x + 5.5, ch.y + 1, ch.x + 8.5 + pl, ch.y + 2 - pl * 2, CHIT[6]); p.dot(ch.x + 8.5 + pl, ch.y + 3.5 - pl * 2, CHIT_HI[0]); p.dot(ch.x + 7, ch.y + 2.5 - pl, CHIT[1]); }
  // Kieferklauen: Kristallspitzen, öffnen sich
  const fa = 0.3 + P.fang * 0.9;
  for (const side of [-1, 1]) {
    const bx = ch.x + 5 + (side > 0 ? 1 : 0), by = ch.y + 2;
    const a = Math.PI / 2 - 0.25 - side * fa * 0.5 - P.rear * 0.4;
    limb(p, bx, by, bx + Math.cos(a) * 3, by + Math.sin(a) * 3, 2.2, 1.8, side > 0 ? [CHIT[2], CHIT[3], CHIT[4], CHIT[5]] : [CHIT[1], CHIT[2], CHIT[3], CHIT[4]]);
    const tx = bx + Math.cos(a) * 3, ty = by + Math.sin(a) * 3;
    shard(p, g, tx, ty, a - side * 0.9, 3, 0.8, CRYS, { base: 0.2, spark: side > 0 });
  }
  meta.mouth = { x: ch.x + 7, y: ch.y + 4 };

  if (ex.smear) smearArc(p, g, ch.x + 2, ch.y + 1, ex.smear[0], ex.smear[1], 6, 12, [ICE[4], ICE[6], ICE[7]], [IGL[1], IGL[2]], 1);
  return meta;
}

function createCrystalSpider() {
  const S = spec(CS, drawCrystalSpider, RIM_ICE, BACK_ICE);
  const idle = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6, ph = t * TAU, s = Math.sin(ph);
    idle.push([t, csp({ bob: Math.max(0, s) * 0.8, glow: 0.65 + 0.35 * Math.sin(ph), pal: Math.max(0, Math.sin(ph * 2)), fang: Math.max(0, s) * 0.2 }), linear]);
  }
  const walk = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6, ph = t * TAU;
    walk.push([t, csp({ t, amp: 1, bob: Math.abs(Math.sin(ph * 2)) * -0.8 + 0.4, glow: 0.8, pal: 0.5 }), linear]);
  }
  // Ausholen: aufbäumen, Vorderbeine hoch, Klauen auf
  const w1 = csp({ rear: 0.6, crouch: 1, lunge: -1, fang: 0.6, glow: 1, pal: 1 });
  const w2 = csp({ rear: 1, crouch: 2, lunge: -2.5, fang: 1, glow: 1.2, pal: 1.5 });
  // Sprungbiss
  const s1 = csp({ rear: 0.3, crouch: -2, lunge: 6, fang: 1, glow: 1.2, t: 0.25, amp: 1 });
  const s2 = csp({ rear: -0.2, crouch: 0, lunge: 8, fang: 0, glow: 1, t: 0.5, amp: 0.6 });
  const s3 = csp({ rear: 0, crouch: 0.5, lunge: 4, fang: 0.2, glow: 0.8 });
  const s4 = csp({ lunge: 1, glow: 0.7 });
  const hurtP = csp({ rear: 0.5, crouch: 1, lunge: -3, fang: 1, glow: 1.3, curl: 0.2 });
  const d1 = csp({ rear: 0.7, crouch: 1, lunge: -3, fang: 1, glow: 1.2, curl: 0.3 });
  const d2 = csp({ rear: 0.2, sink: 3, lunge: -2, fang: 0.5, glow: 0.7, curl: 0.7, eye: 0.5 });
  const d3 = csp({ rear: 0, sink: 5, lunge: -2, fang: 0.2, glow: 0.35, curl: 1, eye: 0 });
  const d4 = csp({ rear: 0, sink: 5.5, lunge: -2, fang: 0.2, glow: 0, curl: 1.05, eye: 0 });
  return {
    idle: new Animation(track(S, idle, 6, { loop: true }), 7),
    walk: new Animation(track(S, walk, 6, { loop: true }), 16),
    windup: new Animation(track(S, [[0, idle[0][1]], [0.5, w1], [1, w2]], 4), 9, false),
    strike: new Animation(track(S, [[0, s1], [0.3, s2, snap], [0.65, s3], [1, s4]], 4, {
      extras: { 0: { smear: [-1.2, 0.2] }, 1: { fx: 'impact', smear: [-0.6, 1.2] } },
    }), 14, false),
    hurt: new Animation(track(S, [[0, hurtP], [1, csp({ lunge: -1, glow: 0.8 })]], 2, { extras: { 0: { hurt: true } } }), 10, false),
    death: new Animation(track(S, [[0, hurtP], [0.25, d1], [0.6, d2], [0.85, d3], [1, d4]], 7, { extras: { 0: { hurt: true }, 4: { fx: 'impact' } } }), 9, false),
  };
}


// ================================================================ Erfrorener Ritter

// Humanoides Rig (wie foes_ashwood.js): Gelenkpunkte aus einer Pose.
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

const FKN = { W: 100, H: 84, AX: 44, AY: 76, pad: 12 };
const KD = { legH: 16, thigh: 8.5, shin: 9, spine: 14, upper: 7, fore: 7, sh: 2, hipW: 2 };
const FK_REST = {
  hipX: 0, hipY: 0, lean: 0.06, head: 0, headY: 0, fFx: 6, fFy: 0, fBx: -6, fBy: 0,
  hFx: 8, hFy: 9, sw: -1.2, cape: 0.1, capeT: 0, kneel: 0, eye: 1, burst: 0,
};
const fkp = (o) => ({ ...FK_REST, ...o });
const SWORD_L = 24;

// Frostkruste: Eisschicht mit kleinen Kristallen auf einer Fläche (Kreis um x,y)
// Frostkruste: zusammenhängende Eisplatte (dunkle Unterkante, helle Facette oben
// links, Glanzpunkt) mit ein, zwei kleinen Kristallspitzen – kein Streurauschen.
function frostCrust(p, g, x, y, r, seed, n = 6) {
  const rx = Math.max(1.4, r * 0.7), ry = Math.max(1, r * 0.45);
  pell(p, x, y + 0.5, rx + 0.5, ry + 0.5, ICE[2]);
  pell(p, x - 0.3, y, rx, ry, ICE[4]);
  pell(p, x - rx * 0.35, y - ry * 0.35, rx * 0.5, Math.max(0.6, ry * 0.45), ICE[5]);
  p.px(x - rx * 0.5, y - ry * 0.5, ICE[7]);
  const m = Math.min(2, Math.floor(n / 4));
  if (p.fine) {
    // Raureif-Kruste: Plattenrand als Feinlinie (Licht oben links, Schatten unten rechts), Facettengrat,
    // Glanzpunkt und Reif-Nadeln, die schräg aus der Oberkante wachsen
    const mx = x + 0.2, my = y + 0.5, ax = rx + 0.5, ay = ry + 0.5;
    p.each(mx - ax - 1, my - ay - 1, mx + ax + 1, my + ay + 1, (X, Y) => {
      const u = (X - mx) / ax, v = (Y - my) / ay, d = u * u + v * v;
      if (d > 1 || d < 0.62) return null;
      const l = (u * -0.55 + v * -0.83) / Math.sqrt(d);
      return l > 0.35 ? ICE[6] : l < -0.5 ? ICE[1] : null;
    });
    p.fline(x - rx * 0.6, y + 0.25, x + rx * 0.3, y - ry * 0.6, ICE[5]);
    p.dot(x - rx * 0.5 + 0.25, y - ry * 0.5 + 0.25, '#ffffff');
    rime(p, x - rx * 0.8, y - ry * 0.7, x + rx * 0.8, y - ry * 0.4, seed, Math.max(2, m + 2));
    return;
  }
  for (let i = 0; i < m; i++) {
    const sx = x + (hash2(i, 1, seed) - 0.5) * rx * 1.4, sy = y - ry;
    p.px(sx, sy, ICE[5]); p.px(sx, sy - 1, ICE[6]);
  }
}

// Raureif (nur fein): kleine Eisnadeln wachsen entlang einer Kante (x0,y0)→(x1,y1) nach oben links, je Nadel
// Fuß, Schaft und helle Spitze in Feinpixeln; feste Lage über seed (kein Rauschen, sitzt in Bewegung).
function rime(p, x0, y0, x1, y1, seed, n = 4) {
  if (!p.fine) return;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.3 + hash2(i, 7, seed) * 0.4) / n, x = p.snap(x0 + (x1 - x0) * t), y = p.snap(y0 + (y1 - y0) * t);
    const h = 2 + (hash2(i, 8, seed) * 1.8 | 0), lean = hash2(i, 9, seed) < 0.5 ? -0.5 : 0;
    p.dot(x, y, ICE[5]); p.dot(x + 0.5, y, ICE[3]);
    for (let j = 1; j <= h; j++) p.dot(x + (j > 1 ? lean : 0), y - j * 0.5, j === h ? ICE[7] : ICE[6]);
  }
}

// Glanzlinie auf einer Kapsel (nur fein): Feinlinie auf der Lichtseite (oben links) längs der Achse, Glanzpunkt.
function capGloss(p, x0, y0, x1, y1, r0, r1, c = STEEL_F[7], spot = '#f4f2f8') {
  if (!p.fine) return;
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
  let nx = -dy / l, ny = dx / l;
  if (nx * -0.55 + ny * -0.83 < 0) { nx = -nx; ny = -ny; }
  const k0 = r0 * 0.5, k1 = r1 * 0.5;
  p.fline(x0 + dx * 0.2 + nx * k0, y0 + dy * 0.2 + ny * k0, x0 + dx * 0.78 + nx * k1, y0 + dy * 0.78 + ny * k1, c);
  if (spot) p.dot(x0 + dx * 0.3 + nx * (k0 + 0.1), y0 + dy * 0.3 + ny * (k0 + 0.1), spot);
}

// Eiszapfen hängen von einer Kante (x0..x1 auf Höhe y)
function icicles(p, x0, y0, x1, y1, seed, maxL = 4) {
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 3));
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    const L = 1 + Math.floor(hash2(i, 5, seed) * maxL);
    if (p.fine) {
      // fein: spitz zulaufender Zapfen, Lichtkante links, Schattenseite rechts, helle Tropfenspitze
      const X = Math.round(x), Y = Math.round(y), H = L * 2;
      for (let j = 0; j < H; j++) {
        const w = j < H * 0.45 ? 2 : 1, yy = Y + j * 0.5;
        if (j === H - 1) { p.dot(X + 0.25, yy, ICE[7]); continue; }
        if (w === 2) { p.dot(X, yy, j === 0 ? ICE[4] : ICE[6]); p.dot(X + 0.5, yy, j === 0 ? ICE[2] : ICE[3]); }
        else p.dot(X + 0.25, yy, j & 1 ? ICE[5] : ICE[4]);
      }
      if (L > 2) p.dot(X - 0.5, Y, ICE[2]);
      continue;
    }
    for (let j = 0; j < L; j++) { p.px(x, y + j, j === L - 1 ? ICE[7] : j === 0 ? ICE[3] : ICE[5]); if (j < L - 1 && L > 2) p.px(x - 1, y + j, ICE[2]); }
  }
}

// Zweihänder im Eis: Griff bei (hx,hy), Winkel a. Klinge von Eiskristallen überwachsen.
function iceGreatsword(p, g, hx, hy, a, glow) {
  const c = Math.cos(a), s = Math.sin(a), nx = -s, ny = c;
  // Knauf + Griff
  cap(p, hx - c * 5, hy - s * 5, hx + c * 2, hy + s * 2, 1.1, 1.1, CLOTH_F);
  if (p.fine) for (let t = -4.5; t <= 1.5; t += 1) p.fline(hx + c * t - nx * 0.9, hy + s * t - ny * 0.9, hx + c * (t + 0.5) + nx * 0.9, hy + s * (t + 0.5) + ny * 0.9, CLOTH_F[0]);   // Griffwicklung
  ell(p, hx - c * 6, hy - s * 6, 1.6, 1.6, STEEL_F, { bias: 0.1 });
  if (p.fine) p.dot(hx - c * 6 - 0.5, hy - s * 6 - 0.75, STEEL_F[7]);
  // Parierstange
  cap(p, hx + c * 3 - nx * 5, hy + s * 3 - ny * 5, hx + c * 3 + nx * 5, hy + s * 3 + ny * 5, 1.2, 1.2, STEEL_F, { bias: 0.1 });
  p.px(hx + c * 3 + nx * 5, hy + s * 3 + ny * 5, ICE[6]); p.px(hx + c * 3 - nx * 5, hy + s * 3 - ny * 5, ICE[5]);
  capGloss(p, hx + c * 3 - nx * 5, hy + s * 3 - ny * 5, hx + c * 3 + nx * 5, hy + s * 3 + ny * 5, 1.2, 1.2, STEEL_F[7], null);
  // Klinge: Stahlkern
  const b0 = 4, b1 = SWORD_L;
  if (!p.fine) {
    for (let t = b0; t <= b1; t += 0.5) {
      const f = (t - b0) / (b1 - b0);
      const hw = 1.9 - f * 0.7 - (f > 0.88 ? (f - 0.88) * 12 : 0);
      for (let k = -hw; k <= hw; k += 0.5) {
        const light = nx * -0.6 + ny * -0.8 > 0 ? k : -k;
        const col = Math.abs(k) > hw - 0.6 ? (light > 0 ? STEEL_F[7] : STEEL_F[2]) : light > 0 ? STEEL_F[5] : STEEL_F[4];
        p.px(hx + c * t + nx * k, hy + s * t + ny * k, col);
      }
    }
    // Hohlkehle mit Frostrune (Leuchten)
    for (let t = b0 + 1; t < b1 - 5; t += 1) {
      const x = hx + c * t, y = hy + s * t;
      p.px(x, y, t % 3 === 0 ? VIO[2] : STEEL_F[3]);
      if (glow > 0.2 && t % 3 === 0) g.px(x, y, VIG[glow > 0.8 ? 3 : 2]);
    }
  } else {
    // fein: Klinge je Feinpixel abgetastet – Schneide 1 Feinpixel (Licht hell / Schatten dunkel), Fläche in zwei
    // Stufen, Glanzlinie auf der Lichtseite, dunkle Hohlkehle in der Mitte; Lage wie grob (Pixelmitte + 0.5)
    const lsgn = nx * -0.6 + ny * -0.8 > 0 ? 1 : -1, ox = hx + 0.5, oy = hy + 0.5;
    p.each(Math.min(ox + c * b0, ox + c * b1) - 3, Math.min(oy + s * b0, oy + s * b1) - 3, Math.max(ox + c * b0, ox + c * b1) + 3, Math.max(oy + s * b0, oy + s * b1) + 3, (X, Y) => {
      const ux = X - ox, uy = Y - oy, t = ux * c + uy * s;
      if (t < b0 - 0.25 || t > b1 + 0.25) return null;
      const f = (t - b0) / (b1 - b0), hw = 1.9 - f * 0.7 - (f > 0.88 ? (f - 0.88) * 12 : 0) + 0.25;
      const k = (ux * nx + uy * ny), lk = k * lsgn;
      if (Math.abs(k) > hw) return null;
      if (Math.abs(k) > hw - 0.5) return lk > 0 ? STEEL_F[7] : STEEL_F[2];
      if (lk > 0) return lk > hw * 0.45 && lk < hw * 0.45 + 0.5 ? STEEL_F[6] : STEEL_F[5];
      return lk > -0.5 && f < 0.82 ? STEEL_F[2] : STEEL_F[4];
    });
    // Frostrune in der Hohlkehle: heißer Kern, violetter Saum (Farbe und Leucht-Ebene fein)
    for (let t = b0 + 1; t < b1 - 5; t += 1) {
      if (t % 3) continue;
      const x = ox + c * t, y = oy + s * t;
      p.dot(x, y, glow > 0.5 ? VIO[4] : VIO[3]); p.dot(x - c * 0.5, y - s * 0.5, VIO[2]); p.dot(x + c * 0.5, y + s * 0.5, VIO[2]);
      p.dot(x + nx * 0.5, y + ny * 0.5, VIO[1]);
      if (glow > 0.2) { g.dot(x, y, VIG[glow > 0.8 ? 4 : 3]); g.dot(x - c * 0.5, y - s * 0.5, VIG[2]); g.dot(x + c * 0.5, y + s * 0.5, VIG[2]); }
    }
    p.dot(ox + c * (b0 + 1.5) - nx * lsgn * 1.2, oy + s * (b0 + 1.5) - ny * lsgn * 1.2, '#ffffff');   // Glanzpunkt an der Wurzel
  }
  // Eisbewuchs: Kristalle wachsen schräg aus der Klinge
  const growth = [[9, 1, 0.7, 4], [15, 1, 0.9, 5], [19, -1, -0.6, 3]];
  for (const [t, side, da, len] of growth) {
    const bx = hx + c * t + nx * side * 1.2, by = hy + s * t + ny * side * 1.2;
    const ang = Math.atan2(ny * side, nx * side) + da * 0.6 * side + 0.35;
    shard(p, g, bx, by, ang, len, 1.1, ICE, { base: 0.3 });
  }
  const tip = { x: hx + c * b1, y: hy + s * b1 };
  if (glow > 0.5) { if (p.fine) { g.dot(tip.x + 0.5, tip.y + 0.5, VIG[4]); g.dot(tip.x, tip.y + 0.5, VIG[2]); g.dot(tip.x + 0.5, tip.y, VIG[2]); } else g.px(tip.x, tip.y, VIG[3]); }
  return tip;
}

function drawFrozenKnight(p, g, P, ex) {
  const { AX, AY } = FKN;
  const K = P.kneel;
  const PP = { ...P, hipY: P.hipY + K * 6 };
  const R = rig(PP, KD, AX, AY);
  const { hip, chest, pt, legF, legB, shF, shB } = R;
  const meta = {};
  if (K > 0.01) {
    const kx = hip.x - 3 - K * 2, ky = AY - 2;
    legB.jx += (kx - legB.jx) * K; legB.jy += (ky - legB.jy) * K;
    legB.ex += (kx - 9 - legB.ex) * K; legB.ey += (AY - legB.ey) * K;
  }
  // Hände am Griff (zweihändig)
  const hF = { x: chest.x + P.hFx, y: chest.y + P.hFy };
  const hB = { x: hF.x - Math.cos(P.sw) * 4, y: hF.y - Math.sin(P.sw) * 4 };
  const armF = ik(shF.x, shF.y, hF.x, hF.y, KD.upper, KD.fore, 1);
  const armB = ik(shB.x, shB.y, hB.x, hB.y, KD.upper, KD.fore, 1);
  const behind = !!ex.swordBehind;

  // --- 1. erstarrter Umhang (steif, gezackter Saum mit Eiszapfen)
  const ct = pt(KD.spine + 1, -2.5);
  const capeLen = 19 - K * 5;
  const cw = [];
  for (let i = 0; i < 9; i++) {
    const u = i / 8;
    const len = capeLen + (hash2(i, 2, 31) * 3 | 0) - u * 2;
    for (let j = 0; j < len; j++) {
      const v = j / len;
      const x = ct.x - 2 - i * 0.8 - P.cape * 9 * v * v + Math.sin(P.capeT + v * 2 + i * 0.5) * 0.5 * v;
      const y = ct.y + j + i * 0.2;
      const c = i < 2 ? CLOTH_F[3] : i % 3 === 0 ? CLOTH_F[1] : i % 3 === 1 ? CLOTH_F[3] : CLOTH_F[2];
      p.px(x, y, v > 0.84 ? (v > 0.93 ? ICE[4] : ICE[2]) : c);
      if (j === Math.floor(len) - 1) cw.push([x, y + 1]);
    }
  }
  if (p.fine) {
    // Stoff-Falten zweifarbig: Faltengrat mit Lichtkante (links) und dunkle Faltentiefe, folgen derselben Bahn wie
    // die Bahnen des Umhangs (sitzen in Bewegung); Saum mit Reifkante
    const cx_ = (i, v) => ct.x - 2 - i * 0.8 - P.cape * 9 * v * v + Math.sin(P.capeT + v * 2 + i * 0.5) * 0.5 * v;
    for (let i = 0; i < 9; i++) {
      const len = capeLen + (hash2(i, 2, 31) * 3 | 0) - (i / 8) * 2;
      const crest = i % 3 === 1, valley = i % 3 === 0 && i > 0;
      if (!crest && !valley && i !== 0) continue;
      let px = null, py = null;
      for (let j = 1; j < len * 0.84; j += 1) {
        const v = j / len, x = cx_(i, v) + (crest ? 0.25 : valley ? 0.5 : 0.25), y = ct.y + j + i * 0.2 + 0.25;
        if (px !== null) {
          if (crest) { p.fline(px, py, x, y, CLOTH_F[4]); if (j > 3) p.fline(px + 0.5, py, x + 0.5, y, CLOTH_F[3]); }
          else if (valley) { p.fline(px, py, x, y, CLOTH_F[0]); p.fline(px + 0.5, py, x + 0.5, y, CLOTH_F[1]); }
          else p.fline(px, py, x, y, CLOTH_F[4]);
        }
        px = x; py = y;
      }
    }
    for (let i = 0; i + 1 < cw.length; i++) p.fline(cw[i][0] + 0.25, cw[i][1] - 1.25, cw[i + 1][0] + 0.25, cw[i + 1][1] - 1.25, ICE[5]);
  }
  for (let i = 0; i < cw.length; i++) if (i % 2 === 0) icicles(p, cw[i][0], cw[i][1], cw[i][0], cw[i][1], 40 + i, 3);

  // --- Schwert hinter dem Körper (Ausholen)
  let tip = null;
  const smear = () => { if (ex.smear) smearArc(p, g, shF.x, shF.y, ex.smear[0], ex.smear[1], 16, 12 + SWORD_L, [ICE[4], ICE[6], ICE[7]], [IGL[1], IGL[3]], 1); };
  if (behind) { smear(); tip = iceGreatsword(p, g, hF.x, hF.y, P.sw, 1); }

  // --- 2. hinteres Bein
  const legRampB = STEEL_F.slice(0, 5);
  cap(p, hip.x - 2, hip.y, legB.jx, legB.jy, 3.4, 3, legRampB);
  cap(p, legB.jx, legB.jy, legB.ex, legB.ey - 2.5, 3, 2.8, legRampB);
  poly(p, [[legB.ex - 3, legB.ey], [legB.ex - 3, legB.ey - 3], [legB.ex + 3, legB.ey - 3], [legB.ex + 6, legB.ey]], STEEL_F[2]);
  ell(p, legB.jx, legB.jy, 2.3, 2.3, legRampB);
  capGloss(p, legB.jx, legB.jy, legB.ex, legB.ey - 2.5, 3, 2.8, STEEL_F[5], null);
  capGloss(p, hip.x - 2, hip.y, legB.jx, legB.jy, 3.4, 3, STEEL_F[5], null);
  // --- 3. hinterer Arm
  cap(p, shB.x, shB.y, armB.jx, armB.jy, 2.6, 2.4, legRampB);
  cap(p, armB.jx, armB.jy, armB.ex, armB.ey, 2.4, 2.6, legRampB);
  capGloss(p, shB.x, shB.y, armB.jx, armB.jy, 2.6, 2.4, STEEL_F[5], null);

  // --- 4. Rumpf: Plattenpanzer, Faltenrock aus Stahlschuppen
  for (let i = 0; i < 5; i++) {
    const a = pt(-0.5, -5 + i * 2.5);
    const sw = P.lean * 3;
    poly(p, [[a.x + sw * 0.3, a.y], [a.x + 2.6 + sw * 0.3, a.y], [a.x + 2.8 + sw * 0.5, a.y + 6 - Math.abs(i - 2) * 0.6], [a.x + sw * 0.5, a.y + 6 - Math.abs(i - 2) * 0.6]], STEEL_F[i % 2 ? 3 : 4]);
    p.px(a.x + sw * 0.3, a.y, STEEL_F[6]);
    p.px(a.x + 1 + sw * 0.5, a.y + 5 - Math.abs(i - 2) * 0.6, ICE[5]);
    if (p.fine) {
      // Schuppe: Lichtkante links, Schattenkante unten, Reiftropfen mit Glanz
      const by = a.y + 6 - Math.abs(i - 2) * 0.6;
      p.fline(a.x + sw * 0.3, a.y + 0.5, a.x + sw * 0.5, by - 0.5, STEEL_F[6]);
      p.fline(a.x + sw * 0.5 + 0.5, by - 0.5, a.x + 2.8 + sw * 0.5 - 0.5, by - 0.5, STEEL_F[1]);
      p.dot(a.x + 1.25 + sw * 0.5, by - 1, ICE[7]);
    }
  }
  const hp = pt(0.5, 0.5), cp = pt(KD.spine - 1, 0.5);
  cap(p, hp.x, hp.y, cp.x, cp.y, 5.5, 7.5, STEEL_F, { rim: 0 });
  ell(p, cp.x + 0.5, cp.y + 1, 7, 5.5, STEEL_F, { rot: P.lean, bias: 0.05 });
  // Brustgrat + Gürtel
  const q = (u, k, c) => { const o = pt(u, k); p.px(o.x, o.y, c); };
  const d = (u, k, c) => { const o = pt(u, k); p.dot(o.x + 0.25, o.y + 0.25, c); };
  if (!p.fine) {
    for (let u = 4; u <= KD.spine + 1; u += 0.5) q(u, 2.5, STEEL_F[7]);
    for (let k = -6; k <= 6; k += 0.5) { q(1.5, k, CLOTH_F[1]); q(2, k, CLOTH_F[2]); }
    q(1.8, 3, STEEL_F[6]); q(1.8, 2.5, STEEL_F[5]);
    // Metall: harter Glanzpunkt oben links auf der Brustplatte, dunkle Spiegelung
    // darunter, Nietenreihe am Kragen
    q(KD.spine - 2, -2.5, STEEL_F[7]); q(KD.spine - 2.5, -2, STEEL_F[7]); q(KD.spine - 3, -1.5, STEEL_F[6]);
    q(KD.spine - 6, -1, STEEL_F[2]); q(KD.spine - 6.5, 0, STEEL_F[2]);
    for (let k = -4; k <= 4; k += 2) { q(KD.spine, k, STEEL_F[7]); q(KD.spine - 0.5, k + 0.5, STEEL_F[1]); }
  } else {
    // fein: Brustplatte mit Glanzbogen (2 Stufen) und Glanzpunkt, Brustgrat als Feinlinie (Grat hell, Flanke
    // dunkel), dunkle Spiegelung unten; Ledergurt mit Naht als Punktlinie und Schnalle; Nieten mit Schlagschatten
    gloss(p, cp.x + 0.5, cp.y + 1, 7, 5.5, P.lean, [STEEL_F[7], STEEL_F[6], '#f4f2f8'], [0.58, 0.7]);
    for (let u = 4; u <= KD.spine + 1; u += 0.5) { d(u, 2.5, STEEL_F[7]); d(u, 3, STEEL_F[3]); }
    for (let u = 6; u <= KD.spine - 1; u += 0.5) d(u, 2, STEEL_F[5]);
    for (let k = -6; k <= 6; k += 0.5) { q(1.5, k, CLOTH_F[1]); q(2, k, CLOTH_F[2]); d(1.5, k, CLOTH_F[3]); d(2.5, k, CLOTH_F[0]); }
    for (let k = -5.5; k <= 5.5; k += 1) d(2, k, CLOTH_F[4]);
    d(1.5, 2.5, STEEL_F[7]); d(1.5, 3, STEEL_F[6]); d(1.5, 3.5, STEEL_F[5]); d(2, 3.5, STEEL_F[4]); d(2.5, 3.5, STEEL_F[3]); d(2.5, 3, STEEL_F[2]); d(2, 2.5, STEEL_F[6]); d(2, 3, VOIDB);
    for (let u = 5; u <= 8; u += 0.5) d(u, -0.5 - (u - 5) * 0.3, STEEL_F[2]);
    for (let k = -4; k <= 4; k += 1.5) { d(KD.spine, k, STEEL_F[7]); d(KD.spine - 0.5, k + 0.5, STEEL_F[1]); }
  }
  // Frostkruste auf Brust und Schulter, gesprungener Eispanzer mit blauem Schimmer
  const fc = pt(KD.spine - 6, -3.5);
  frostCrust(p, g, fc.x, fc.y, 2.4, 11, 9);
  // Kern: blaues Frostherz leuchtet durch einen Riss im Panzer
  const hc = pt(KD.spine - 3.5, 2.5);
  p.px(hc.x, hc.y, VIO[3]); p.px(hc.x + 1, hc.y + 1, VIO[2]); p.px(hc.x - 1, hc.y + 1, VIO[1]); p.px(hc.x, hc.y + 2, VIO[2]);
  g.px(hc.x, hc.y, VIG[4]); g.px(hc.x + 1, hc.y + 1, VIG[3]); g.px(hc.x, hc.y + 2, VIG[2]); g.px(hc.x - 1, hc.y + 1, VIG[2]);
  if (p.fine) {
    // Frostherz: Riss im Panzer (dunkle Kante, helle Bruchkante), heißer weißer Kern im violetten Saum
    const X = p.snap(hc.x), Y = p.snap(hc.y);
    p.fline(X - 1.5, Y - 0.5, X + 0.25, Y + 0.5, VOIDB); p.fline(X + 0.5, Y + 0.75, X + 1.75, Y + 2.5, VOIDB);
    p.fline(X - 1.5, Y - 1, X + 0.25, Y, STEEL_F[7]);
    p.dot(X + 0.5, Y + 0.5, '#ffffff'); p.dot(X + 0.5, Y + 1, VIO[4]); p.dot(X + 1, Y + 1, VIO[3]); p.dot(X, Y + 1, VIO[3]);
    g.dot(X + 0.5, Y + 0.5, '#ffffff'); g.dot(X + 0.5, Y + 1, VIG[4]); g.dot(X + 1, Y + 1, VIG[3]); g.dot(X, Y + 1, VIG[3]); g.dot(X + 0.5, Y + 1.5, VIG[3]);
  }
  meta.chest = { x: hc.x, y: hc.y };

  // --- 5. vorderes Bein (Beinschiene, Kniekachel, Sabaton)
  occlude(g);
  cap(p, hip.x + 2, hip.y, legF.jx, legF.jy, 3.8, 3.3, STEEL_F);
  cap(p, legF.jx, legF.jy, legF.ex, legF.ey - 2.5, 3.3, 3, STEEL_F);
  ln(p, legF.jx + 2, legF.jy + 2, legF.ex + 2, legF.ey - 3, STEEL_F[7]);
  capGloss(p, hip.x + 2, hip.y, legF.jx, legF.jy, 3.8, 3.3);
  capGloss(p, legF.jx, legF.jy, legF.ex, legF.ey - 2.5, 3.3, 3);
  poly(p, [[legF.ex - 3, legF.ey], [legF.ex - 3, legF.ey - 3], [legF.ex + 3, legF.ey - 3], [legF.ex + 7, legF.ey]], STEEL_F[4]);
  ln(p, legF.ex - 2, legF.ey - 3, legF.ex + 3, legF.ey - 3, STEEL_F[6]);
  if (p.fine) {
    // Sabaton: Glanzlinie, Lamellenfuge, Glanzpunkt an der Spitze, Reif am Rist
    p.fline(legF.ex - 2.5, legF.ey - 2.5, legF.ex + 3.5, legF.ey - 2.5, STEEL_F[7]);
    p.fline(legF.ex + 0.5, legF.ey - 2.5, legF.ex + 1.5, legF.ey - 0.5, STEEL_F[2]);
    p.fline(legF.ex + 3.5, legF.ey - 2.5, legF.ex + 6, legF.ey - 0.5, STEEL_F[6]);
    p.dot(legF.ex + 4, legF.ey - 2, '#f4f2f8');
    rime(p, legF.ex - 2.5, legF.ey - 3, legF.ex + 2.5, legF.ey - 3, 81, 3);
  }
  ell(p, legF.jx + 1, legF.jy, 2.8, 2.6, STEEL_F, { bias: 0.1 });
  if (p.fine) gloss(p, legF.jx + 1, legF.jy, 2.8, 2.6, 0, [STEEL_F[7], STEEL_F[6], '#f4f2f8'], [0.5, 0.72]);
  shard(p, g, legF.jx + 1, legF.jy - 1, -0.7, 3, 1, ICE, { base: 0.3 });
  icicles(p, legF.jx - 1, legF.jy + 2, legF.jx + 2, legF.jy + 2, 7, 2);
  occlude(null);

  // --- 6. hintere Schulterplatte
  ell(p, shB.x - 1, shB.y, 4.5, 3.5, STEEL_F.slice(0, 6), { bias: 0.05 });
  if (p.fine) { gloss(p, shB.x - 1, shB.y, 4.5, 3.5, 0, [STEEL_F[6], STEEL_F[5], STEEL_F[7]], [0.55, 0.72]); rime(p, shB.x - 4, shB.y - 2.5, shB.x + 1, shB.y - 3.5, 23, 3); }

  // --- 7. Helm: Topfhelm mit Eiskrone und Sehschlitz
  const neck = pt(KD.spine + 2, 1);
  const hx = Math.round(neck.x + P.head), hy = Math.round(neck.y - 5 + P.headY);
  ell(p, hx - 1, hy + 4, 4, 2.2, STEEL_F.slice(0, 5));         // Halsberge
  ell(p, hx, hy, 5, 5.5, STEEL_F, { bias: 0.08 });
  if (p.fine) gloss(p, hx, hy, 5, 5.5, 0, [STEEL_F[7], STEEL_F[6], '#f4f2f8'], [0.62, 0.76]);
  poly(p, [[hx - 5, hy - 1], [hx + 5, hy - 1], [hx + 5, hy + 4], [hx - 5, hy + 5]], STEEL_F[4]);
  poly(p, [[hx - 5, hy - 1], [hx - 1, hy - 1], [hx - 1, hy + 5], [hx - 5, hy + 5]], STEEL_F[5]);
  ln(p, hx - 5, hy - 1, hx + 5, hy - 1, STEEL_F[7]);
  ln(p, hx + 1, hy - 5, hx + 1, hy + 4, STEEL_F[6]);              // Grat
  if (p.fine) {
    // Helm fein: Kante unter dem Kronenrand zweistufig, Grat mit Lichtseite und Schattenflanke, Kinnplatten-Fuge
    p.fline(hx - 5, hy - 0.5, hx + 5, hy - 0.5, STEEL_F[5]);
    p.fline(hx + 1, hy - 4.5, hx + 1, hy - 1.5, STEEL_F[7]); p.fline(hx + 1.5, hy - 4, hx + 1.5, hy + 4, STEEL_F[3]);
    p.fline(hx - 1, hy - 0.5, hx - 1, hy + 4.5, STEEL_F[6]); p.fline(hx - 0.5, hy - 0.5, hx - 0.5, hy + 4.5, STEEL_F[3]);
    p.fline(hx - 4.5, hy + 4.5, hx + 4.5, hy + 3.75, STEEL_F[2]);
  }
  // Eiskrone: Zapfen wachsen aus dem Helm
  shard(p, g, hx - 3, hy - 3, -2.1, 6, 1.4, ICE, { base: 0.3 });
  shard(p, g, hx, hy - 4, -1.65, 8, 1.6, ICE, { base: 0.3 });
  shard(p, g, hx + 3, hy - 3, -1.2, 5, 1.2, ICE, { base: 0.3 });
  // Sehschlitz (T-Form) mit kaltem Glimmen; Kante darüber im Licht, Nieten
  const ec = ex.hurt ? '#ffffff' : VIO[3];
  ln(p, hx - 1, hy, hx + 5, hy, STEEL_F[7]);
  p.rect(hx, hy + 1, 6, 1, VOIDB);
  p.rect(hx + 3, hy + 2, 1, 3, VOIDB);
  if (!p.fine) {
    p.px(hx - 3, hy + 2, STEEL_F[7]); p.px(hx - 3, hy + 3, STEEL_F[2]); p.px(hx + 5, hy + 3, STEEL_F[6]);
    p.px(hx - 3, hy - 3, STEEL_F[7]); p.px(hx - 2, hy - 3, STEEL_F[6]);      // Glanzpunkt auf der Helmkuppe
  } else {
    // Visier: Schlitzkante oben im Licht, unten Schattenkante; Atemlöcher; Nieten mit Schatten; Glanz auf der Kuppe
    p.fline(hx - 0.5, hy + 0.5, hx + 5.5, hy + 0.5, STEEL_F[5]);
    p.fline(hx, hy + 2, hx + 2.5, hy + 2, STEEL_F[2]); p.fline(hx + 4, hy + 2, hx + 5.5, hy + 2, STEEL_F[2]);
    p.fline(hx + 2.5, hy + 2, hx + 2.5, hy + 4.5, STEEL_F[6]); p.fline(hx + 4, hy + 2.5, hx + 4, hy + 4.5, STEEL_F[2]);
    for (const [u, v] of [[4.75, 2.75], [4.75, 3.75], [5.25, 3.25]]) { p.dot(hx + u, hy + v, VOIDB); p.dot(hx + u, hy + v + 0.5, STEEL_F[6]); }
    for (const [u, v] of [[-3, 2], [-3, 3.5]]) { p.dot(hx + u, hy + v, STEEL_F[7]); p.dot(hx + u + 0.5, hy + v + 0.5, STEEL_F[1]); }
    p.dot(hx - 3, hy - 3, '#f4f2f8'); p.dot(hx - 2.5, hy - 3, STEEL_F[7]); p.dot(hx - 3, hy - 2.5, STEEL_F[7]); p.dot(hx - 2, hy - 3.5, STEEL_F[6]);
    rime(p, hx - 4.5, hy - 2.5, hx - 1, hy - 4.75, 19, 3);
  }
  if (P.eye > 0.3 && p.fine) {
    // leuchtende Augen im Sehschlitz: zwei Glutpunkte mit weißem Kern im violetten Saum, Glow ebenso fein
    for (const ex0 of [hx + 1.5, hx + 3.5]) {
      const E = [[0, 0, VIO[2], VIG[3]], [0.5, 0, ec, VIG[4]], [1, 0, VIO[2], VIG[3]], [0, 0.5, VIO[1], VIG[2]], [0.5, 0.5, VIO[3], VIG[4]], [1, 0.5, VIO[1], VIG[2]]];
      for (const [u, v, c, gc] of E) { p.dot(ex0 + u, hy + 1 + v, c); g.dot(ex0 + u, hy + 1 + v, gc); }
      g.dot(ex0 - 0.5, hy + 1.25, VIG[1]); g.dot(ex0 + 1.5, hy + 1.25, VIG[1]);
    }
    if (P.eye > 1.2) { g.rect(hx + 1, hy + 1, 5, 1, VIG[2]); g.dot(hx + 6, hy + 1, VIG[1]); g.dot(hx + 6.5, hy + 1.5, VIG[1]); for (const ex0 of [hx + 1.5, hx + 3.5]) { g.dot(ex0 + 0.5, hy + 1, '#ffffff'); g.dot(ex0 + 0.5, hy + 1.5, VIG[4]); } }
  } else if (P.eye > 0.3) {
    p.px(hx + 2, hy + 1, ec); p.px(hx + 3, hy + 1, ec); p.px(hx + 4, hy + 1, VIO[2]); p.px(hx + 1, hy + 1, VIO[1]);
    g.px(hx + 2, hy + 1, VIG[4]); g.px(hx + 3, hy + 1, VIG[4]); g.px(hx + 4, hy + 1, VIG[3]); g.px(hx + 1, hy + 1, VIG[2]);
    if (P.eye > 1.2) { g.rect(hx + 1, hy + 1, 5, 1, VIG[3]); g.px(hx + 6, hy + 1, VIG[1]); }
  }
  icicles(p, hx - 4, hy + 5, hx + 3, hy + 5, 17, 3);
  meta.eye = { x: hx + 3, y: hy + 1 };
  meta.head = { x: hx, y: hy - 11 };
  meta.mouth = { x: hx + 4, y: hy + 3 };

  // --- 8. vorderer Arm + Zweihänder + Schulterplatte
  const arm = () => {
    occlude(g);
    cap(p, shF.x, shF.y, armF.jx, armF.jy, 3, 2.7, STEEL_F);
    cap(p, armF.jx, armF.jy, armF.ex, armF.ey, 2.7, 3, STEEL_F);
    capGloss(p, shF.x, shF.y, armF.jx, armF.jy, 3, 2.7);
    capGloss(p, armF.jx, armF.jy, armF.ex, armF.ey, 2.7, 3, STEEL_F[7], null);
    ell(p, armF.jx, armF.jy, 2.2, 2.2, STEEL_F, { bias: 0.1 });
    poly(p, [[armF.ex - 2.5, armF.ey - 2.5], [armF.ex + 2.5, armF.ey - 2.5], [armF.ex + 2.5, armF.ey + 2.5], [armF.ex - 2.5, armF.ey + 2.5]], STEEL_F[4]);
    p.px(armF.ex - 2, armF.ey - 2, STEEL_F[7]);
    if (p.fine) {
      // Panzerhandschuh: Fingerlamellen, Lichtkante, Knöchelglanz
      p.fline(armF.ex - 2.5, armF.ey - 2.5, armF.ex + 2, armF.ey - 2.5, STEEL_F[6]); p.fline(armF.ex - 2.5, armF.ey - 2.5, armF.ex - 2.5, armF.ey + 2, STEEL_F[5]);
      for (const v of [-0.5, 0.5, 1.5]) p.fline(armF.ex - 2, armF.ey + v, armF.ex + 2, armF.ey + v, STEEL_F[2]);
      p.dot(armF.ex - 2, armF.ey - 2, '#f4f2f8');
    }
    occlude(null);
  };
  if (!behind) {
    smear(); arm(); tip = iceGreatsword(p, g, hF.x, hF.y, P.sw, 1); p.rect(hF.x - 1.5, hF.y - 1.5, 3, 3, STEEL_F[4]); p.px(hF.x - 1.5, hF.y - 1.5, STEEL_F[6]);
    if (p.fine) { const X = p.snap(hF.x - 1.5), Y = p.snap(hF.y - 1.5); p.fline(X, Y, X + 2.5, Y, STEEL_F[6]); p.fline(X + 0.5, Y + 1, X + 2.5, Y + 1, STEEL_F[2]); p.fline(X + 0.5, Y + 2, X + 2.5, Y + 2, STEEL_F[2]); p.dot(X, Y, '#f4f2f8'); }
  }
  else arm();
  // Schulterplatte vorn mit Eiszapfen
  occlude(g);
  ell(p, shF.x + 0.5, shF.y - 0.5, 5, 4, STEEL_F, { bias: 0.1 });
  occlude(null);
  ln(p, shF.x - 4, shF.y + 2, shF.x + 5, shF.y + 2, STEEL_F[2]);
  // Schulterplatte: harter Glanzpunkt, Nietenreihe am Rand, Eiszapfen am Saum
  if (!p.fine) {
    p.px(shF.x - 2, shF.y - 3, STEEL_F[7]); p.px(shF.x - 1, shF.y - 3, STEEL_F[7]); p.px(shF.x - 2, shF.y - 2, STEEL_F[6]);
    for (let i = -3; i <= 3; i += 2) p.px(shF.x + i, shF.y + 1, STEEL_F[6]);
  } else {
    // fein: Glanzbogen + Glanzpunkt, zweite Lamelle, Nieten mit Schatten, Raureif auf der Oberkante
    gloss(p, shF.x + 0.5, shF.y - 0.5, 5, 4, 0, [STEEL_F[7], STEEL_F[6], '#f4f2f8'], [0.56, 0.72]);
    p.fline(shF.x - 4, shF.y + 2.5, shF.x + 5, shF.y + 2.5, STEEL_F[5]);
    for (let i = -3; i <= 3; i += 2) { p.dot(shF.x + i + 0.25, shF.y + 1.25, STEEL_F[7]); p.dot(shF.x + i + 0.75, shF.y + 1.75, STEEL_F[2]); }
    rime(p, shF.x - 3.5, shF.y - 3.25, shF.x + 3, shF.y - 4.25, 29, 3);
  }
  icicles(p, shF.x - 4, shF.y + 3, shF.x + 4, shF.y + 3, 21, 4);
  meta.hand = { x: hF.x, y: hF.y };
  meta.tip = tip;

  // --- Einschlag: Eissplitter brechen aus dem Boden
  if (ex.burst) {
    const bx = ex.burstX ?? tip.x, gy = AY;
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.32;
      const d = 2 + hash2(i, 1, 51) * 5 * ex.burst;
      shard(p, g, bx + Math.cos(a) * d * 1.8, gy - 1, a, (3 + hash2(i, 2, 51) * 6) * ex.burst, 1.4, ICE, { base: 0.3, gl: [IGL[1], IGL[2]] });
    }
    frostMist(p, g, bx, gy - 1, 22 * ex.burst, ex.burst * 4, 53, [IGL[2], IGL[3], ICE[6]]);
  }
  clearBelow(p, AY + 1); clearBelow(g, AY + 1);
  return meta;
}

// Gefallener Ritter: zerbrochener Eispanzer, Helm, Schwert im Boden (k 0..1)
function drawKnightFallen(p, g, k) {
  const { AX, AY } = FKN;
  const gy = AY;
  const cx = AX;
  // Umhang flach
  for (let i = 0; i < 20; i++) for (let j = 0; j < 3; j++) p.px(cx - 20 + i, gy - 1 - j + (i % 4 === 0 ? 1 : 0), j === 2 ? CLOTH_F[3] : CLOTH_F[1 + (i % 2)]);
  if (p.fine) {
    // flacher Umhang: Falten als zweifarbige Kerben (Grat hell, Tiefe dunkel), Saumkante
    for (let i = 1; i < 20; i += 2) { p.fline(cx - 20 + i, gy - 2.5 + (i % 4 === 0 ? 1 : 0), cx - 20.5 + i, gy - 0.5, CLOTH_F[4]); p.fline(cx - 19.5 + i, gy - 2 + (i % 4 === 0 ? 1 : 0), cx - 20 + i, gy - 0.5, CLOTH_F[0]); }
    p.fline(cx - 20, gy - 3, cx - 1, gy - 3, CLOTH_F[4]);
  }
  // Rumpfplatte liegend
  ell(p, cx - 4, gy - 5, 10, 5, STEEL_F, { bias: 0.05 });
  ln(p, cx - 12, gy - 8, cx + 4, gy - 9, STEEL_F[7]);
  if (p.fine) { gloss(p, cx - 4, gy - 5, 10, 5, 0, [STEEL_F[7], STEEL_F[6], '#f4f2f8'], [0.58, 0.7]); p.fline(cx - 12, gy - 7.5, cx + 4, gy - 8.5, STEEL_F[5]); }
  frostCrust(p, g, cx - 5, gy - 7, 5, 61, 12);
  // Beine
  cap(p, cx - 14, gy - 3, cx - 24, gy - 2, 3, 2.6, STEEL_F.slice(0, 6));
  capGloss(p, cx - 14, gy - 3, cx - 24, gy - 2, 3, 2.6, STEEL_F[6], null);
  poly(p, [[cx - 28, gy], [cx - 28, gy - 4], [cx - 24, gy - 4], [cx - 24, gy]], STEEL_F[3]);
  // Helm gerollt
  const hx = cx + 10 + k * 2;
  ell(p, hx, gy - 5, 4.5, 4.5, STEEL_F, { bias: 0.08 });
  p.rect(hx - 1, gy - 4, 4, 1, VOIDB);
  if (k < 0.5) { p.px(hx + 1, gy - 4, VIO[2]); g.px(hx + 1, gy - 4, VIG[2]); }
  if (p.fine) {
    gloss(p, hx, gy - 5, 4.5, 4.5, 0, [STEEL_F[7], STEEL_F[6], '#f4f2f8'], [0.6, 0.76]);
    p.fline(hx - 1, gy - 4.5, hx + 3, gy - 4.5, STEEL_F[6]); p.fline(hx - 1, gy - 3, hx + 3, gy - 3, STEEL_F[2]);
    if (k < 0.5) { p.dot(hx + 1.5, gy - 4, VIO[3]); p.dot(hx + 1.5, gy - 3.5, VIO[1]); g.dot(hx + 1.5, gy - 4, VIG[3]); }
  }
  shard(p, g, hx - 2, gy - 8, -2.3, 4, 1.2, ICE, { base: 0.3 });
  // Schwert steckt schräg im Boden
  iceGreatsword(p, g, cx + 22, gy - 22 + k * 0, 1.35, 1 - k);
  // Eisbruchstücke
  for (let i = 0; i < 7; i++) {
    const x = cx - 18 + i * 6 + hash2(i, 1, 63) * 3, a = -Math.PI / 2 + (hash2(i, 2, 63) - 0.5) * 1.6;
    shard(p, g, x, gy - 1, a, 3 + hash2(i, 3, 63) * 4, 1.3, i % 2 ? ICE : ICE_D.concat(ICE[5], ICE[6]), { base: 0.3 });
  }
  // Frostherz verlischt
  const heat = 1 - k;
  if (heat > 0.1) { p.px(cx - 2, gy - 6, VIO[3]); halo(g, cx - 2, gy - 6, 0.5 + heat * 1.2, [VIG[2], VIG[3], VIG[4]]); }
  if (p.fine && heat > 0.1) { p.dot(cx - 2, gy - 6, heat > 0.6 ? '#ffffff' : VIO[4]); p.fline(cx - 4, gy - 7, cx - 2, gy - 6, VOIDB); p.fline(cx - 1.5, gy - 5.5, cx, gy - 4, VOIDB); }
  if (k < 0.8) frostMist(p, g, cx, gy, 40, k * 6, 67, [IGL[2], IGL[3], ICE[5]]);
  return { eye: { x: hx + 1, y: gy - 4 }, head: { x: hx, y: gy - 10 }, hand: { x: cx + 22, y: gy - 22 }, chest: { x: cx - 2, y: gy - 6 }, tip: { x: cx + 26, y: gy } };
}

function createFrozenKnight() {
  const S = spec(FKN, drawFrozenKnight, RIM_KN, BACK_KN);
  // Ruhe: Schwert gesenkt vor dem Körper, schweres Atmen (Frosthauch)
  const idleA = fkp({ hFx: 6, hFy: 12, sw: -0.95 });
  const idleB = fkp({ hFx: 6, hFy: 13, sw: -0.88, hipY: 1, lean: 0.09, headY: 1, capeT: Math.PI });
  const idle = [];
  for (let i = 0; i < 6; i++) idle.push(mixP(idleA, idleB, (1 - Math.cos(i / 6 * TAU)) / 2));
  const walk = [];
  for (let i = 0; i <= 8; i++) {
    const ph = (i / 8) * TAU, sn = Math.sin(ph), c = Math.cos(ph);
    walk.push([i / 8, fkp({
      hipY: -Math.abs(c) * 1.2 + 1, lean: 0.12, fFx: 1 + sn * 6.5, fFy: Math.max(0, -c) * 2.5, fBx: -1 - sn * 6.5, fBy: Math.max(0, c) * 2.5,
      hFx: 7 + sn * 0.8, hFy: 12, sw: -0.9 + sn * 0.06, cape: 0.2, capeT: ph, head: sn * 0.4, headY: Math.abs(c) * 0.5,
    }), linear]);
  }
  // Ausholen: Zweihänder steil über den Kopf gerissen
  const w1 = fkp({ lean: -0.05, hipX: -1, hFx: 3, hFy: -8, sw: -1.9, fFx: 8, fBx: -8, cape: 0.15, eye: 1.3 });
  const w2 = fkp({ lean: -0.22, hipX: -2, hipY: 1, hFx: -1, hFy: -14, sw: -2.55, fFx: 9, fBx: -9, fBy: 1, cape: 0.25, capeT: 1, eye: 1.6, headY: -1 });
  const w3 = fkp({ ...w2, lean: -0.26, hFx: -3, hFy: -14, sw: 2.9, eye: 1.8 });
  // Schlag: senkrecht in den Boden – Eis bricht hervor
  const s1 = fkp({ lean: 0.2, hipX: 2, hipY: 2, hFx: 8, hFy: -10, sw: -0.8, fFx: 11, fBx: -9, cape: 0.6, capeT: 2, eye: 1.8 });
  const s2 = fkp({ lean: 0.48, hipX: 4, hipY: 6, hFx: 11, hFy: 3, sw: 1.2, fFx: 12, fBx: -11, cape: 0.9, capeT: 3, eye: 1.8 });
  const s3 = fkp({ ...s2, lean: 0.46, capeT: 4, eye: 1.4 });
  const s4 = fkp({ lean: 0.22, hipX: 2, hipY: 3, hFx: 9, hFy: 8, sw: 1.1, fFx: 10, fBx: -9, cape: 0.4, capeT: 5 });
  const hurtP = fkp({ lean: -0.16, hipX: -2, head: -1.5, headY: -1, hFx: 5, hFy: 10, sw: -0.6, eye: 1.4, cape: 0.3 });
  const d1 = fkp({ lean: -0.26, hipX: -2, head: -2, hFx: 5, hFy: 11, sw: -0.2, eye: 1.2 });
  const d2 = fkp({ kneel: 1, lean: 0.25, head: 1.5, headY: 1, hFx: 10, hFy: 13, sw: 0.5, eye: 0.8, fFx: 7, fBx: -9 });
  const d3 = fkp({ kneel: 1, lean: 0.5, head: 2.5, headY: 2, hFx: 11, hFy: 15, sw: 0.35, eye: 0.4, fFx: 7, fBx: -9 });
  return {
    idle: new Animation(idle.map((P) => track(S, [[0, P], [1, P]], 1)[0]), 5),
    walk: new Animation(track(S, walk, 8, { loop: true, extras: { 0: { fx: 'step' }, 4: { fx: 'step' } } }), 8),
    windup: new Animation([
      ...track(S, [[0, idleA], [0.5, w1], [1, w2]], 4, { extras: { 3: { swordBehind: true } } }),
      ...track(S, [[0, w3], [1, w3]], 1, { extras: { 0: { swordBehind: true } } }),
    ], 8, false),
    strike: new Animation(track(S, [[0, s1], [0.25, s2, snap], [0.6, s3], [1, s4]], 5, {
      extras: { 0: { smear: [-2.4, -1.0] }, 1: { fx: 'impact', smear: [-1.0, 1.1], burst: 0.7 }, 2: { burst: 1 }, 3: { burst: 0.8 } },
    }), 11, false),
    hurt: new Animation(track(S, [[0, hurtP], [1, idleA]], 2, { extras: { 0: { hurt: true } } }), 9, false),
    death: new Animation([
      ...track(S, [[0, hurtP], [0.35, d1], [0.7, d2, snap], [1, d3]], 4, { extras: { 0: { hurt: true }, 2: { fx: 'impact' } } }),
      stillR(S, (p, g) => drawKnightFallen(p, g, 0), 'impact', RIM_KN, BACK_KN),
      stillR(S, (p, g) => drawKnightFallen(p, g, 0.5), null, RIM_KN, BACK_KN),
      stillR(S, (p, g) => drawKnightFallen(p, g, 1), null, RIM_KN, BACK_KN),
    ], 7, false),
  };
}

// ================================================================ Export

const RIME = {
  ice_elemental: createIceElemental,
  crystal_spider: createCrystalSpider,
  frozen_knight: createFrozenKnight,
};

// only (optional): nur eine Figur erzeugen. Jede Figur wird erst beim ersten
// Zugriff gezeichnet und dann gecacht (wie createForgeFoes).
export function createRimeFoes(only) {
  const out = {};
  for (const k in RIME) {
    if (only && only !== k) continue;
    Object.defineProperty(out, k, {
      configurable: true, enumerable: true,
      get() {
        const v = RIME[k]();
        Object.defineProperty(out, k, { value: v, writable: true, configurable: true, enumerable: true });
        return v;
      },
    });
  }
  return out;
}

// Werkzeugkasten für foes_throne.js
export const RK = { rim, mixP, limb, shard, halo, spec, stillR: stillR_FK, rig, smearArc, TAU };
