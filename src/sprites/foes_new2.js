import { PAL } from '../gfx/Palette.js';
import { SpriteFrame, Animation } from '../gfx/Sprite.js';
import { FineCanvas, fineRes, finishPixels, outlinePixels, pixelsToCanvas, col32 } from '../gfx/Fine.js';
import { hash2 } from '../core/math.js';

// Neue Gegner der Stufen 20–40 (Runde 5):
//   Aschensteppe   – Staubschamane (+ Heiltotem), Fallensteller (Gnoll)
//   Pestmarsch     – Moorschleim (+ kleiner Moorschleim), Sumpfhexe
//   Frostzinnen    – Frostwiedergänger (mit/ohne Eispanzer), Schneewurm
//   Glutöde        – Aschebombardier, Phasengeist
//
// Bauweise wie foes_steppe.js / foes_frost.js: kleine Rigs (Hüfte, Rumpf,
// Kopf, IK-Arme/-Beine bzw. parametrische Körper), Schlüsselposen werden beim
// Laden weich interpoliert. Material wird pro Pixel mit Licht von links oben
// schattiert, danach legt ein Randlicht-Pass (Farbe je Zone) eine helle Kante
// auf die Oberseiten; die dunkle Kontur kommt wie bei buildFrame dazu (finishOutline). Jeder Frame hat eine
// Leucht-Ebene (frame.glow), Metadaten (frame.meta: eye/head/hand/tip/mouth
// relativ zum Anker) und optional frame.fx ('step' | 'impact' | 'cast' | 'roar').
// Blickrichtung rechts, Anker = Bodenkontakt. Alles deterministisch (hash2).

// ================================================================ Werkzeuge

const ease = (t) => t * t * (3 - 2 * t);
const linear = (t) => t;
const snap = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const TAU = Math.PI * 2;
const A40 = 41 * 2 ** 24;   // Uint32-Pixel (RGBA) mit Alpha > 40

function mixP(a, b, t) {
  const o = {};
  for (const k in a) o[k] = a[k] + ((b[k] ?? a[k]) - a[k]) * t;
  return o;
}
// keys = [[t 0..1, pose, easing?], ...]
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

// Licht von links oben, leicht zum Betrachter
const LX = -0.52, LY = -0.66, LZ = 0.54;
function tone(ramp, nx, ny, nz, bias, noise) {
  const t = 0.28 + 0.62 * (nx * LX + ny * LY + nz * LZ) + bias + noise;
  return ramp[clamp(Math.floor(t * ramp.length), 0, ramp.length - 1)];
}

// Schattierte Ellipse (optional gedreht, mit Materialrauschen). Tastet Feinpixel ab; das Rauschen bleibt im
// Weltraster (fein halb so stark, kein Sprenkel).
function ell(p, cx, cy, rx, ry, ramp, o = {}) {
  const { rot = 0, noise = 0, seed = 1, bias = 0, clip = null } = o;
  const c = Math.cos(rot), s = Math.sin(rot);
  const R = Math.ceil(Math.max(rx, ry)) + 1;
  const nk = p.fine ? noise * 0.5 : noise;
  p.each(Math.floor(cx - R), Math.floor(cy - R), cx + R, cy + R, (x, y) => {
    const dx = x - cx, dy = y - cy;
    const u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry;
    const d2 = u * u + v * v;
    if (d2 > 1) return null;
    if (clip && !clip(Math.floor(x), Math.floor(y))) return null;
    const nz = Math.sqrt(1 - d2);
    const nx = u * c - v * s, ny = u * s + v * c;
    const n = nk ? (hash2(Math.round(dx) + 64, Math.round(dy) + 64, seed) - 0.5) * nk : 0;
    return tone(ramp, nx, ny, nz, bias, n);
  });
}

// Schattierte Kapsel (Gliedmaßen): Radius r0 -> r1
function cap(p, x0, y0, x1, y1, r0, r1, ramp, o = {}) {
  const { noise = 0, seed = 1, bias = 0 } = o;
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 0.0001;
  const R = Math.ceil(Math.max(r0, r1)) + 1;
  const nk = p.fine ? noise * 0.5 : noise;
  const minX = Math.floor(Math.min(x0, x1) - R), maxX = Math.ceil(Math.max(x0, x1) + R);
  const minY = Math.floor(Math.min(y0, y1) - R), maxY = Math.ceil(Math.max(y0, y1) + R);
  const fn = (px, py) => {
    const t = clamp(((px - x0) * dx + (py - y0) * dy) / l2, 0, 1);
    const qx = x0 + dx * t, qy = y0 + dy * t;
    const r = r0 + (r1 - r0) * t;
    const ex = px - qx, ey = py - qy;
    if (ex * ex + ey * ey > r * r) return null;
    const nx = ex / (r || 1), ny = ey / (r || 1), nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const n = nk ? (hash2(Math.round(px - x0) + 64, Math.round(py - y0) + 64, seed) - 0.5) * nk : 0;
    return tone(ramp, nx, ny, nz, bias, n);
  };
  if (!p.fine) { p.each(minX, minY, maxX + 0.5, maxY + 0.5, fn); return; }
  // fein: je Feinzeile nur den Bereich abtasten, den die Kapsel dort überhaupt erreichen kann
  // (Segmentstellen t mit |qy(t) − y| ≤ r(t); x-Spanne an den Intervallenden, 1 Weltpixel Rand)
  const r = p.res, dr = r1 - r0;
  for (let G = Math.floor(minY * r), G1 = Math.ceil((maxY + 0.5) * r); G <= G1; G++) {
    const yc = (G + 0.5) / r;
    // y0 + dy·t − yc ≤ r0 + dr·t  und  −(y0 + dy·t − yc) ≤ r0 + dr·t
    let ta = 0, tb = 1;
    const lim = (a, b) => {   // a·t ≤ b
      if (Math.abs(a) < 1e-9) { if (b < 0) { ta = 1; tb = 0; } return; }
      if (a > 0) tb = Math.min(tb, b / a); else ta = Math.max(ta, b / a);
    };
    lim(dy - dr, r0 + yc - y0); lim(-dy - dr, r0 - yc + y0);
    if (ta > tb + 1e-6) continue;
    const xa = Math.min(x0 + dx * ta - r0 - dr * ta, x0 + dx * tb - r0 - dr * tb) - 1;
    const xb = Math.max(x0 + dx * ta + r0 + dr * ta, x0 + dx * tb + r0 + dr * tb) + 1;
    p.each(Math.max(minX, xa), (G + 1e-6) / r, Math.min(maxX + 0.5, xb), (G - 1e-6) / r, fn);   // genau Feinzeile G
  }
}

// Gefülltes Polygon (Scanline, fein in Feinpixelzeilen). col: Farbe oder (x, y) => Farbe|null;
// x/y sind die linke obere Ecke des Pixels (fein: Vielfache von p.step).
function poly(p, pts, col) {
  let minY = Infinity, maxY = -Infinity;
  for (const q of pts) { minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]); }
  const q = p.step ?? 1;
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

// Gefüllte Ellipse ohne Schattierung. Grob wie PixelCanvas.ellipse (Zeilen), fein abgetastet mit gleicher Größe.
function oval(p, cx, cy, rx, ry, c) {
  if (p.fine) {
    // fein: wie p.ellipse(cx + 0.5, cy + 0.5, rx + 0.5, ry + 0.5, c) (gleiche Abtastung und Prüfung), aber je
    // Feinzeile nur die Spanne der Ellipse (±1 Feinpixel) statt des ganzen Rechtecks abtasten
    if (!c) return;
    const ex = cx + 0.5, ey = cy + 0.5, ax = rx + 0.5, ay = ry + 0.5, r = p.res, v = col32(c);
    const F0 = Math.floor((ex - ax - 1) * r), F1 = Math.ceil((ex + ax + 1) * r);
    const G0 = Math.floor((ey - ay - 1) * r), G1 = Math.ceil((ey + ay + 1) * r);
    const fo = Math.round(p.ox * r), go = Math.round(p.oy * r);
    for (let G = G0; G <= G1; G++) {
      const ny = ((G + 0.5) / r - ey) / ay, t = 1 - ny * ny;
      if (t < -1e-9) continue;
      const sp = ax * Math.sqrt(Math.max(0, t));
      const Fa = Math.max(F0, Math.floor((ex - sp) * r - 0.5) - 1), Fb = Math.min(F1, Math.ceil((ex + sp) * r - 0.5) + 1);
      for (let F = Fa; F <= Fb; F++) {
        const nx = ((F + 0.5) / r - ex) / ax;
        if (nx * nx + ny * ny > 1) continue;
        p.put(F + fo, G + go, v);
      }
    }
    return;
  }
  for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
    const t = 1 - (y * y) / (ry * ry);
    if (t < 0) continue;
    const hw = Math.round(rx * Math.sqrt(t) - 0.15);
    p.rect(Math.round(cx - hw), Math.round(cy + y), hw * 2 + 1, 1, c);
  }
}

// Schwung-Schleier: überstreicht die Klinge von a0 nach a1 (Drehpunkt cx/cy),
// am Ende dicht und hell, am Anfang ausgedünnt; sy staucht die Bahn senkrecht.
// Fein: Feinpixel, Dichte aber je Weltpixel (kein Flimmern).
function smearArc(p, g, cx, cy, a0, a1, r0, r1, cols, gcols, sy = 1) {
  const q = p.step ?? 1, R = 1 / q;
  const n = Math.ceil(Math.abs(a1 - a0) * r1 * 1.4 * R) + 2;
  for (let i = 0; i <= n; i++) {
    const f = i / n, a = a0 + (a1 - a0) * f;
    for (let r = r0; r <= r1; r += 0.5 * q) {
      const radial = (r - r0) / (r1 - r0 || 1);
      const x = Math.round((cx + Math.cos(a) * r) * R) * q, y = Math.round((cy + Math.sin(a) * r * sy) * R) * q;
      const dens = f * f * 0.55 + radial * (0.2 + 0.8 * f) - 0.12;
      if (hash2(Math.floor(x) + 50, Math.floor(y) + 50, 31) > dens + (q < 1 && radial > 0.82 ? 0.25 : 0)) continue;
      const c = radial > 0.82 ? cols[2] : radial > 0.5 ? cols[1] : cols[0];
      if (q < 1) p.dot(x, y, c); else p.px(x, y, c);
      if (g && gcols && f > 0.35 && radial > 0.45) { if (q < 1) g.dot(x, y, radial > 0.82 ? gcols[1] : gcols[0]); else g.px(x, y, radial > 0.82 ? gcols[1] : gcols[0]); }
    }
  }
}

// Staubkranz am Boden (Aufprall, Stampfen); fein: Körner aus 2–3 Feinpixeln, oben heller
function dust(p, x, y, r, seed, cols, n = 16) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + hash2(i, 1, seed) * 0.4;
    const rr = r * (0.55 + hash2(i, 2, seed) * 0.6);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.4 - (Math.sin(a) < 0 ? hash2(i, 3, seed) * 3 : 0);
    if (p.fine) {
      const c0 = cols[i % cols.length], c1 = cols[(i + 1) % cols.length], c2 = cols[(i + 2) % cols.length];
      p.dot(px, py, c0); p.dot(px + 0.5, py, c0); p.dot(px, py + 0.5, c0);
      if (hash2(i, 4, seed) < 0.55) { p.dot(px + 1, py + 0.5, c1); p.dot(px + 1.5, py + 0.5, c1); }
      if (hash2(i, 5, seed) < 0.3) p.dot(px + 0.5, py - 0.5, c2);
      continue;
    }
    p.px(px, py, cols[i % cols.length]);
    if (hash2(i, 4, seed) < 0.55) p.px(px + 1, py, cols[(i + 1) % cols.length]);
    if (hash2(i, 5, seed) < 0.3) p.px(px, py - 1, cols[(i + 2) % cols.length]);
  }
}

// Leuchtpunkt auf der Leuchtebene: gestufte Ringe (ramp dunkel -> hell); fein mit hellem Kern
function glowDot(g, x, y, r, ramp) {
  if (r <= 0.6) { g.px(x, y, ramp[Math.min(ramp.length - 1, 3)]); return; }
  oval(g, x, y, r + 1, r + 1, ramp[0]);
  oval(g, x, y, r, r, ramp[1]);
  oval(g, x, y, Math.max(0.5, r - 1), Math.max(0.5, r - 1), ramp[2]);
  if (r > 1.5) oval(g, x, y, Math.max(0.5, r - 2), Math.max(0.5, r - 2), ramp[3]);
  if (g.fine && r > 1.2) { const c = ramp[Math.min(ramp.length - 1, 4)]; g.dot(x + 0.25, y + 0.25, c); g.dot(x + 0.75, y + 0.25, c); g.dot(x + 0.25, y + 0.75, c); g.dot(x + 0.75, y + 0.75, c); }
}

// Pixelpuffer (Uint32, RGBA) einer FineCanvas zum Nachbearbeiten: ohne Leinwand der Puffer selbst (direkt
// bearbeitbar), sonst eine Kopie, die putPix zurückschreibt. Spart Leinwand-Umwege (getImageData/putImageData).
function getPix(p) { return p.pixels(); }
// Zeichnet die FineCanvas noch nur in ihren Puffer (keine Leinwand)? Öffentlicher Weg: pixels() liefert dann den Puffer selbst.
const bufOnly = (p) => p.pixels() === p.buf;
function putPix(p, d) { if (d !== p.buf) p.ctx.putImageData(new ImageData(bytes(d), p.W, p.H), 0, 0); }
const bytes = (d) => new Uint8ClampedArray(d.buffer, d.byteOffset, d.length * 4);
// Wie buildFrame (fein): Feinschliff (nur bei res > 1) und Kontur 1 Texel, Ergebnis (W+2)×(H+2) – aber nur im
// belegten Rechteck (+1 Texel durchsichtiger Rand) gerechnet. Außerhalb ist das Ergebnis ohnehin leer, und am
// Bildrand verhalten sich beide Werkzeuge wie bei durchsichtigen Nachbarn → pixelgleich zu buildFrame.
function finishOutline(d, W, H, res) {
  let X0 = W, X1 = -1, Y0 = -1, Y1 = -1;
  for (let y = 0; y < H; y++) {
    const o = y * W;
    let a = -1, b = -1;
    for (let x = 0; x < W; x++) if (d[o + x] >= A40) { a = x; break; }
    if (a < 0) continue;
    for (let x = W - 1; x >= a; x--) if (d[o + x] >= A40) { b = x; break; }
    if (Y0 < 0) Y0 = y;
    Y1 = y; if (a < X0) X0 = a; if (b > X1) X1 = b;
  }
  const OW = W + 2, out = outBuf(OW * (H + 2));
  if (Y0 < 0) return out;
  const cx0 = X0 - 1, cy0 = Y0 - 1, cw = X1 - X0 + 3, ch = Y1 - Y0 + 3, crop = new Uint32Array(cw * ch);
  for (let y = Math.max(0, cy0); y < Math.min(H, cy0 + ch); y++) {
    const xa = Math.max(0, cx0), xb = Math.min(W, cx0 + cw);
    crop.set(d.subarray(y * W + xa, y * W + xb), (y - cy0) * cw + xa - cx0);
  }
  if (res > 1) finishPixels(crop, cw, ch);
  const o = outlinePixels(crop, cw, ch), ow = cw + 2;
  // o(0,0) entspricht Quelle (cx0 − 1, cy0 − 1) → Ausgabe (cx0, cy0)
  for (let j = 0; j < ch + 2; j++) {
    const y = cy0 + j;
    if (y < 0 || y >= H + 2) continue;
    const xa = Math.max(0, cx0), xb = Math.min(OW, cx0 + ow);
    out.set(o.subarray(j * ow + xa - cx0, j * ow + xb - cx0), y * OW + xa);
  }
  OUTR = [Math.max(0, cy0) * OW, Math.min(H + 2, cy0 + ch + 2) * OW];
  return out;
}
// Ausgabepuffer von finishOutline wiederverwenden (wird gleich in eine Leinwand kopiert): beim nächsten Frame gleicher
// Größe nur die zuletzt belegten Zeilen leeren statt neu anzulegen.
let OUTB = null, OUTR = null;
function outBuf(n) {
  if (OUTB && OUTB.length === n) { if (OUTR) OUTB.fill(0, OUTR[0], OUTR[1]); OUTR = null; return OUTB; }
  OUTR = null;
  return (OUTB = new Uint32Array(n));
}

// Feinleinwände gleicher Größe wiederverwenden (spart Speicherbereinigung beim Bau vieler Frames). Zurück in den
// Pool nur ohne eigene Leinwand; geleert über den Puffer, Verschiebung zurückgesetzt. Nach jedem Figurensatz geleert.
const POOL = new Map();
function takeFine(W, H, res) {
  const c = POOL.get(W + ',' + H + ',' + res)?.pop();
  return c ?? new FineCanvas(W, H, res);
}
function giveFine(...cs) {
  for (const c of cs) {
    if (!bufOnly(c)) continue;
    c.resetTranslate(); c.buf.fill(0);
    const k = c.w + ',' + c.h + ',' + c.res;
    if (!POOL.has(k)) POOL.set(k, []);
    POOL.get(k).push(c);
  }
}
// Leuchtebene als eigener Frame, auf das belegte Rechteck beschnitten (Anker entsprechend versetzt): Leuchtebenen
// sind meist fast leer – kleinere Leinwand spart Bauzeit und Grafikspeicher. Gezeichnet wird sie über ihre Anker
// (SpriteFrame.draw), die Lage bleibt pixelgleich. Leer → 1×1 durchsichtig (Frame bleibt vorhanden).
function glowFrame(d, W, H, ax, ay, res) {
  let x0 = W, x1 = -1, y0 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    const o = y * W;
    let a = -1, b = -1;
    for (let x = 0; x < W; x++) if (d[o + x] >>> 24) { a = x; break; }
    if (a < 0) continue;
    for (let x = W - 1; x >= a; x--) if (d[o + x] >>> 24) { b = x; break; }
    if (y0 < 0) y0 = y;
    y1 = y; if (a < x0) x0 = a; if (b > x1) x1 = b;
  }
  if (y0 < 0) return new SpriteFrame(pixelsToCanvas(new Uint32Array(1), 1, 1), ax, ay, res);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, c = new Uint32Array(cw * ch);
  for (let y = 0; y < ch; y++) c.set(d.subarray((y + y0) * W + x0, (y + y0) * W + x0 + cw), y * cw);
  return new SpriteFrame(pixelsToCanvas(c, cw, ch), ax - x0, ay - y0, res);
}

// Weltrechteck leeren (wie ctx.clearRect, mit Verschiebung); ohne Leinwand direkt im Puffer.
function clearBox(p, x, y, w, h) {
  if (!bufOnly(p)) { p.ctx.clearRect(x, y, w, h); return; }
  const r = p.res, F0 = Math.max(0, Math.round((x + p.ox) * r)), F1 = Math.min(p.W, Math.round((x + w + p.ox) * r));
  const G0 = Math.max(0, Math.round((y + p.oy) * r)), G1 = Math.min(p.H, Math.round((y + h + p.oy) * r));
  if (F1 > F0) for (let G = G0; G < G1; G++) p.buf.fill(0, G * p.W + F0, G * p.W + F1);
}

// Dreht einen Pixelpuffer (W×H Texel) pixelgenau (nächster Nachbar) um einen Drehpunkt (in Texeln); neuer Puffer.
function rotBlit(s, W, H, px, py, ang) {
  const d = new Uint32Array(W * H);
  const c = Math.cos(-ang), sn = Math.sin(-ang);
  // Zielbereich: belegtes Rechteck der Quelle, gedreht (+2 Texel Rand); außerhalb träfe jede Abtastung Leere
  let x0 = W, x1 = -1, y0 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    const o = y * W;
    let a = -1, b = -1;
    for (let x = 0; x < W; x++) if (s[o + x] >>> 24) { a = x; break; }
    if (a < 0) continue;
    for (let x = W - 1; x >= a; x--) if (s[o + x] >>> 24) { b = x; break; }
    if (y0 < 0) y0 = y;
    y1 = y; if (a < x0) x0 = a; if (b > x1) x1 = b;
  }
  if (y0 < 0) return d;
  let X0 = Infinity, X1 = -Infinity, Y0 = Infinity, Y1 = -Infinity;
  for (const [qx, qy] of [[x0, y0], [x1 + 1, y0], [x0, y1 + 1], [x1 + 1, y1 + 1]]) {
    const rx = qx - px, ry = qy - py, tx = px + rx * c + ry * sn, ty = py - rx * sn + ry * c;   // Umkehrdrehung
    X0 = Math.min(X0, tx); X1 = Math.max(X1, tx); Y0 = Math.min(Y0, ty); Y1 = Math.max(Y1, ty);
  }
  const XA = Math.max(0, Math.floor(X0) - 2), XB = Math.min(W - 1, Math.ceil(X1) + 2), YA = Math.max(0, Math.floor(Y0) - 2), YB = Math.min(H - 1, Math.ceil(Y1) + 2);
  for (let y = YA; y <= YB; y++) for (let x = XA; x <= XB; x++) {
    const rx = x + 0.5 - px, ry = y + 0.5 - py;
    const sx = Math.floor(px + rx * c - ry * sn), sy = Math.floor(py + rx * sn + ry * c);
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
    const v = s[sy * W + sx];
    if (v >>> 24) d[y * W + x] = v;
  }
  return d;
}
// Puffer zeilenweise um S Texel nach unten versetzt in eine (leere) FineCanvas legen
function blitRows(p, d, S) {
  const W = p.W, n = d.length / W, y0 = Math.max(0, -S), y1 = Math.min(n, p.H - S);
  if (y1 > y0) p.buf.set(d.subarray(y0 * W, y1 * W), (y0 + S) * W);
  p.dirty = true;
}

// Randlicht: Oberkanten kräftig, linke Kanten schwächer zur Lichtfarbe der
// Zone ziehen; glühende Pixel (Leuchtebene hell) bleiben unberührt.
// Fein: Kante 1 Weltpixel tief (res Texel), wie vorher.
function rimLight(p, g, rim) {
  const r = p.res ?? 1, w = p.w * r, h = p.h * r;
  const px = getPix(p), d = bytes(px), g32 = getPix(g);
  // Umriss-Rechteck der deckenden Texel (Alpha > 40); nur darin arbeiten
  let X0 = w, X1 = -1, Y0 = -1, Y1 = -1;
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let a = -1, b = -1;
    for (let x = 0; x < w; x++) if (px[o + x] >= A40) { a = x; break; }
    if (a < 0) continue;
    for (let x = w - 1; x >= a; x--) if (px[o + x] >= A40) { b = x; break; }
    if (Y0 < 0) Y0 = y;
    Y1 = y; if (a < X0) X0 = a; if (b > X1) X1 = b;
  }
  if (Y0 < 0) return;
  // Deckmaske des Rechtecks mit r Texeln Rand oben/links (Rand = frei, wie außerhalb des Bildes)
  const lw = X1 - X0 + 1 + r, lh = Y1 - Y0 + 1 + r, op = scratchOp(lw * lh);
  for (let y = Y0; y <= Y1; y++) for (let x = X0, l = (y - Y0 + r) * lw + r; x <= X1; x++, l++) if (px[y * w + x] >= A40) op[l] = 1;
  const [r0, g0, b0] = rim.c, k1 = rim.k1 ?? 0.42, k2 = rim.k2 ?? 0.24;
  for (let y = Y0; y <= Y1; y++) for (let x = X0, l = (y - Y0 + r) * lw + r; x <= X1; x++, l++) {
    if (!op[l]) continue;
    const i = y * w + x, gv = g32[i];
    if ((gv >>> 24) && (gv & 255) + ((gv >>> 8) & 255) + ((gv >>> 16) & 255) > 300) continue;
    let k;
    if (r === 1) k = !op[l - lw] ? k1 : !op[l - 1] ? k2 : !op[l - lw - 1] ? k2 * 0.5 : 0;
    else {
      // fein: offen, wenn einer der r Texel darüber/links/diagonal frei ist
      let fu = false, fl = false, fd = false;
      for (let j = 1; j <= r; j++) { if (!op[l - lw * j]) fu = true; if (!op[l - j]) fl = true; if (!op[l - (lw + 1) * j]) fd = true; }
      k = fu ? k1 : fl ? k2 : fd ? k2 * 0.5 : 0;
    }
    if (!k) continue;
    const j = i * 4;
    d[j] += (r0 - d[j]) * k; d[j + 1] += (g0 - d[j + 1]) * k; d[j + 2] += (b0 - d[j + 2]) * k;
  }
  putPix(p, px);
}
// wiederverwendete Deckmaske (spart Speicherbereinigung), Länge n genullt
let OPS = new Uint8Array(1 << 16);
function scratchOp(n) {
  if (OPS.length < n) OPS = new Uint8Array(Math.ceil(n * 1.5));
  else OPS.fill(0, 0, n);
  return OPS;
}

// Pixel der Farbebene zerfallen lassen (k 0..1, oben zuerst); Flocken fallen.
// Zerfall je Weltpixel (fein: ganze 2×2-Zellen), Flocken fein.
function dissolve(p, g, k, seed, top, bottom, flakes) {
  const r = p.res ?? 1, W = p.w * r, H = p.h * r;
  const d = getPix(p), gd = getPix(g);
  const fall = [];
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
    const i = Y * W + X;
    if ((d[i] >>> 24) < 40) continue;
    const x = Math.floor(X / r), y = Math.floor(Y / r);
    const hgt = 1 - clamp((y - top) / (bottom - top), 0, 1);
    if (hash2(x, y, seed) < k * 1.6 - (1 - hgt) * 0.8) {
      d[i] = 0; gd[i] = 0;
      if (X % r === 0 && Y % r === 0 && hash2(x, y, seed + 1) < 0.12) fall.push([x, y]);
    }
  }
  putPix(p, d); putPix(g, gd);
  for (const [x, y] of fall) {
    const dy = 2 + hash2(x, y, seed + 2) * 5 * k, dx = (hash2(x, y, seed + 3) - 0.6) * 4;
    const c = flakes[Math.floor(hash2(x, y, seed + 5) * flakes.length)];
    if (p.fine) { p.dot(x + dx, y + dy, c); p.dot(x + dx + 0.5, y + dy, c); p.dot(x + dx, y + dy + 0.5, flakes[0]); }
    else p.px(x + dx, y + dy, c);
  }
}

// ---------------------------------------------------------------- Feinwerkzeuge (nur bei p.fine)

// Punkt im Polygon (gerade/ungerade Regel)
function inPoly(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
// Strähnen: n kurze Feinlinien (dx, dy) an festen Stellen im Rechteck; col(x, y, i) -> Farbe|null,
// inside(x, y) begrenzt auf eine Form. Lagen hängen nur von i ab → kein Flackern zwischen Frames.
function strands(p, x0, y0, x1, y1, n, seed, dx, dy, col, inside = null) {
  for (let i = 0; i < n; i++) {
    const x = x0 + hash2(i, 1, seed) * (x1 - x0), y = y0 + hash2(i, 2, seed) * (y1 - y0);
    if (inside && !inside(x, y)) continue;
    const c = col(x, y, i);
    if (!c) continue;
    const k = 0.7 + hash2(i, 3, seed) * 0.6;
    p.fline(x, y, x + dx * k, y + dy * k, c);
  }
}
// Liegt (x, y) in der Kapsel x0/y0 → x1/y1 mit Radius r0 → r1?
function inCap(x, y, x0, y0, x1, y1, r0, r1) {
  const dx = x1 - x0, dy = y1 - y0, t = clamp(((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy || 0.0001), 0, 1);
  return Math.hypot(x - x0 - dx * t, y - y0 - dy * t) <= r0 + (r1 - r0) * t;
}
// Feinpunkt-Gruppe (Korn aus 2 Feinpixeln: hell oben links, dunkel unten rechts)
function grain(p, x, y, c0, c1) { p.dot(x, y, c0); if (c1) p.dot(x + 0.5, y + 0.5, c1); }

// Baut einen Frame: draw(p, g, P, X) -> meta (Koordinaten im Grundmaß S.W×S.H).
// S.pad = Rand für Schleier/Staub, S.rim = Randlicht. X.rot = [winkel, dx, dy]
// kippt die ganze Figur (Sturz) und setzt sie wieder auf den Boden. X.post
// zeichnet danach ungedreht (liegende Waffe). X.after(p, g) läuft zuletzt
// (Auflösen). X.fx = Frame-Marke.
// Feinraster (docs/STYLE.md „Feinraster“, Stufe B): p und g sind FineCanvas (res = fineRes()). Abschluss wie
// buildFrame (fein) über finishOutline; Leuchtebene auf ihren Inhalt beschnitten (glowFrame).
function makeFrame(S, draw, P, X = {}) {
  const pad = S.pad ?? 10;
  const W = S.W + pad * 2, H = S.H + pad * 2, AX = S.AX + pad, AY = S.AY + pad;
  const res = fineRes(), g = takeFine(W, H, res);
  const meta = {};
  const body = (p) => {
    if (X.rot && Math.abs(X.rot[0]) > 0.001) {
      const R = 32, HH = H + R * 2;
      const tp = takeFine(W, HH, res), tg = takeFine(W, HH, res);
      tp.translate(pad, pad + R); tg.translate(pad, pad + R);
      const m0 = draw(tp, tg, P, X) || {};
      tp.resetTranslate(); tg.resetTranslate();
      const [a, rx0, ry0] = X.rot, rx = rx0 + pad, ry = ry0 + pad + R;
      const WR = W * res, HR = HH * res;
      const dd = rotBlit(tp.pixels(), WR, HR, rx * res, ry * res, a), dg = rotBlit(tg.pixels(), WR, HR, rx * res, ry * res, a);
      let bottom = -1;
      for (let y = HR - 1; y >= 0 && bottom < 0; y--) for (let x = 0; x < WR; x++) if ((dd[y * WR + x] >>> 24) > 40) { bottom = y; break; }
      const shift = bottom >= 0 ? Math.round(((AY - 1 / res) - bottom / res) * res) / res : -R;
      blitRows(p, dd, Math.round(shift * res)); blitRows(g, dg, Math.round(shift * res));
      giveFine(tp, tg);
      const c = Math.cos(a), s = Math.sin(a);
      for (const k in m0) {
        const dx = m0[k].x + pad - rx, dy = m0[k].y + pad + R - ry;
        meta[k] = { x: rx + dx * c - dy * s, y: ry + dx * s + dy * c + shift };
      }
    } else {
      p.translate(pad, pad); g.translate(pad, pad);
      const m0 = draw(p, g, P, X) || {};
      p.resetTranslate(); g.resetTranslate();
      for (const k in m0) meta[k] = { x: m0[k].x + pad, y: m0[k].y + pad };
    }
    if (X.post) {
      p.translate(pad, pad); g.translate(pad, pad);
      const m1 = X.post(p, g) || {};
      p.resetTranslate(); g.resetTranslate();
      for (const k in m1) meta[k] = { x: m1[k].x + pad, y: m1[k].y + pad };
    }
    if (S.rim) rimLight(p, g, S.rim);
    if (X.after) X.after(p, g, pad);
  };
  const pc = takeFine(W, H, res);
  body(pc);
  const d = finishOutline(pc.pixels(), pc.W, pc.H, res), DW = pc.W + 2, DH = pc.H + 2;
  const gd = g.pixels();
  // rimGlow-Saum gleich auf den Pixeldaten (Kontur 1 Texel → Leuchtebene 1 Texel versetzt)
  if (RIM_GLOW) rimGlowPixels(d, DW, DH, res, RIM_GLOW, gd, g.W, g.H, -1, -1);
  const f = new SpriteFrame(pixelsToCanvas(d, DW, DH), AX * res + 1, AY * res + 1, res);
  f.glow = glowFrame(gd, g.W, g.H, AX * res, AY * res, res);
  if (RIM_GLOW) f.rimGlow = true;
  giveFine(pc, g);
  f.meta = {};
  for (const k in meta) f.meta[k] = { dx: Math.round(meta[k].x - AX), dy: Math.round(meta[k].y - AY) };
  f.fx = X.fx ?? null;
  return f;
}

// n Frames aus einer Keyframe-Spur. loop: letzter Frame ≠ erster.
function track(mk, keys, n, { loop = false, extras = {}, all = {} } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = loop ? i / n : n === 1 ? 1 : i / (n - 1);
    out.push(mk(sample(keys, t), { ...all, ...(extras[i] ?? {}) }));
  }
  return out;
}
// Loop-Spur aus einer Posenfunktion f(phase 0..2π)
function cycle(f, n) {
  const keys = [];
  for (let i = 0; i <= n; i++) keys.push([i / n, f((i / n) * TAU, i), linear]);
  return keys;
}

// Humanoides Rig: Gelenkpunkte aus einer Pose.
function rig(P, D, AX, AY) {
  const hip = { x: AX + P.hipX, y: AY - D.legH + P.hipY };
  const sL = Math.sin(P.lean), cL = Math.cos(P.lean);
  const pt = (u, k) => ({ x: hip.x + sL * u + cL * k, y: hip.y - cL * u + sL * k });
  const chest = pt(D.spine, 0);
  const fF = { x: AX + P.fFx, y: AY - P.fFy }, fB = { x: AX + P.fBx, y: AY - P.fBy };
  const legF = ik(hip.x + D.hipW, hip.y, fF.x, fF.y, D.thigh, D.shin, -1);
  const legB = ik(hip.x - D.hipW, hip.y, fB.x, fB.y, D.thigh, D.shin, -1);
  const shF = pt(D.spine - 1, D.sh), shB = pt(D.spine - 1, -D.sh);
  const hF = { x: chest.x + P.hFx, y: chest.y + P.hFy }, hB = { x: chest.x + P.hBx, y: chest.y + P.hBy };
  const armF = ik(shF.x, shF.y, hF.x, hF.y, D.upper, D.fore, 1);
  const armB = ik(shB.x, shB.y, hB.x, hB.y, D.upper, D.fore, 1);
  return { hip, chest, pt, sL, cL, legF, legB, shF, shB, armF, armB };
}

// Gangzyklus-Schlüssel für Zweibeiner (base = Ruhepose)
function walkKeys(base, n, o = {}) {
  const { stride = 4.4, lift = 2.2, bob = 1, arm = 1.5, extra = () => ({}) } = o;
  const keys = [];
  for (let i = 0; i <= n; i++) {
    const ph = (i / n) * TAU, s = Math.sin(ph), c = Math.cos(ph);
    keys.push([i / n, {
      ...base, hipY: base.hipY - Math.abs(c) * bob + bob * 0.5,
      fFx: 1 + s * stride, fFy: Math.max(0, -c) * lift, fBx: -1 - s * stride, fBy: Math.max(0, c) * lift,
      hFx: base.hFx - s * arm, hBx: base.hBx + s * arm, ...extra(ph, s, c),
    }, linear]);
  }
  return keys;
}

// ================================================================ Farben

const BONE = PAL.bone;
const OUT_D = '#0c0808';
// Steppe
const RIM_STEPPE = { c: [238, 224, 196], k1: 0.42, k2: 0.24 };
const DGLOW = ['#3a2006', '#7a4810', '#c88a26', '#ffd06a', '#fff4cc'];   // Staubglut (Leuchtebene)
const DUSTC = ['#5e5040', '#7e6e56', '#a49276', '#cbb894', '#e8dcc0'];
const OCHRE = ['#3a0e08', '#6e1c0e', '#a0321a', '#c8502a', '#e07a3c'];
const ASHSK = ['#211a17', '#3a2f29', '#594a40', '#7b6a5c', '#9e8d7c', '#c2b4a2'];  // aschebemalte Haut
const HIDE = ['#130e0b', '#221911', '#342619', '#4a3824', '#634c32', '#7e6344'];   // Fellumhang
const SHAG = ['#120e0b', '#211a14', '#33291f', '#4a3c2d', '#655340', '#837058'];
const DRIFT = ['#2a2218', '#4e4232', '#7a6c52', '#a8987a', '#d0c4a4'];             // gebleichtes Treibholz
const HORN = ['#1e1812', '#362c22', '#54463a', '#76664f', '#9a8a6c', '#bcad8c'];
const PAINT = '#e6dcc4', PAINT_D = '#a89c84';
const SKD = ['#1c120e', '#301f17', '#4a3022', '#66442e', '#85603f', '#a47c52'];   // sonnenverbrannte Haut
const BRZ = ['#2a1606', '#4f2c0e', '#7a4a18', '#a86e28', '#d09a44', '#f0c878', '#fff0c0'];
const TEAL = ['#0f1719', '#182a2e', '#243f45', '#33575d', '#4a767a', '#6a9894'];
const WOODT = ['#1a120c', '#2c1f14', '#43301f', '#5c432c', '#77583a', '#93724c'];
const STONE = ['#1e1c1a', '#34302b', '#4c463e', '#686052', '#867c6a', '#a49a86'];

// ================================================================ Staubschamane

const SS = { W: 60, H: 52, AX: 26, AY: 46, pad: 12, rim: { c: [238, 224, 196], k1: 0.3, k2: 0.14 } };
const SD = { legH: 10, thigh: 5, shin: 5.5, spine: 8, upper: 4.2, fore: 4.6, sh: 1.4, hipW: 1 };
const SH_REST = {
  hipX: 0, hipY: 0, lean: 0.24, head: 0, headY: 0, fFx: 3, fFy: 0, fBx: -3, fBy: 0,
  hFx: 7.5, hFy: 4, hBx: 1.5, hBy: 7, sa: -1.45, cape: 0.1, capeT: 0,
  swirl: 0.2, sph: 0, cast: 0, eye: 1, held: 1, jaw: 0, claw: 0,
};
const shp = (o = {}) => ({ ...SH_REST, ...o });

// Staubwirbel: Teilchen auf einer steigenden Spirale; front = nur vordere Hälfte
function dustSwirl(p, g, cx, gy, ph, k, front, seed = 5) {
  if (k <= 0.02) return;
  const n = Math.round(8 + k * 22);
  const H = 3 + k * 16, R = 6 + k * 5;
  for (let i = 0; i < n; i++) {
    const u = ((i / n) + ph / TAU * 0.5 + hash2(i, 1, seed) * 0.15) % 1;
    const a = ph * 1.5 + i * 2.39996;
    const r = R * (1 - u * 0.45) + hash2(i, 2, seed) * 1.5;
    const sn = Math.sin(a);
    if ((sn > 0) !== front) continue;
    const x = cx + Math.cos(a) * r, y = gy - 1 - u * H + sn * r * 0.32;
    const ci = clamp(Math.floor((1 - u) * 3 + (front ? 1 : 0) + hash2(i, 3, seed) * 1.2), 0, 4);
    if (p.fine) {
      // fein: Staubkorn als kurzer Strich entlang der Drehung, Glutkörner mit hellem Kern
      const tx = Math.sin(a) * 0.5 * (front ? -1 : 1);
      p.dot(x, y, DUSTC[ci]); p.dot(x + 0.5, y + tx, DUSTC[ci]);
      if (hash2(i, 4, seed) < 0.5) p.dot(x + (sn > 0 ? 1 : -0.5), y + tx, DUSTC[Math.max(0, ci - 1)]);
      if (k > 0.55 && hash2(i, 5, seed) < 0.35) { p.dot(x, y, DGLOW[4]); p.dot(x + 0.5, y, DGLOW[3]); g.dot(x, y, DGLOW[4]); g.dot(x + 0.5, y, DGLOW[k > 0.85 ? 3 : 2]); g.dot(x - 0.5, y, DGLOW[1]); }
      continue;
    }
    p.px(x, y, DUSTC[ci]);
    if (hash2(i, 4, seed) < 0.5) p.px(x + (sn > 0 ? 1 : -1), y, DUSTC[Math.max(0, ci - 1)]);
    if (k > 0.55 && hash2(i, 5, seed) < 0.35) { p.px(x, y, DGLOW[3]); g.px(x, y, DGLOW[k > 0.85 ? 3 : 2]); }
  }
}

// Knochenstab: Treibholz mit Vogelschädel, Ring und Federgehängen.
// a = Richtung "oben" ab der Hand. Gibt die Spitze (Schädel) zurück.
function drawBoneStaff(p, g, hx, hy, a, glowK, ph) {
  const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
  const up = 15, down = 10;
  for (let s = -down; s <= up; s += 0.5) {
    const w = Math.sin(s * 0.55) * 0.45;
    const x = hx + dx * s + nx * w, y = hy + dy * s + ny * w;
    const knot = Math.abs(s - 6) < 0.6 || Math.abs(s + 4) < 0.6;
    p.px(x, y, knot ? DRIFT[4] : DRIFT[3]);
    p.px(x + nx * 0.9, y + ny * 0.9, knot ? DRIFT[2] : DRIFT[1]);
  }
  if (p.fine) {
    // fein: gebleichtes Holz mit Lichtgrat (1 Feinpixel), dunkler Maserrille und Astaugen
    for (let s = -down; s <= up; s += 0.25) {
      const w = Math.sin(s * 0.55) * 0.45;
      const x = hx + dx * s + nx * w, y = hy + dy * s + ny * w;
      p.dot(x - nx * 0.1, y - ny * 0.1, Math.abs(s - 2.5) < 1.5 ? null : DRIFT[4]);
      if ((s > 8 && s < 12.5) || (s > -9 && s < -5.5)) p.dot(x + nx * 0.45, y + ny * 0.45, DRIFT[1]);   // Trockenriss
    }
    for (const s of [6, -4]) { const x = hx + dx * s + nx * 0.4, y = hy + dy * s + ny * 0.4; p.dot(x, y, DRIFT[1]); p.dot(x - dx * 0.5, y - dy * 0.5, DRIFT[4]); }
  }
  // Wicklung über der Hand
  for (let s = 1.5; s <= 3.5; s += 1) { p.px(hx + dx * s, hy + dy * s, OCHRE[s % 2 ? 2 : 3]); p.px(hx + dx * s + nx, hy + dy * s + ny, OCHRE[1]); }
  if (p.fine) for (let s = 1.25; s <= 4; s += 0.75) p.fline(hx + dx * s - nx * 0.2, hy + dy * s - ny * 0.2, hx + dx * (s + 0.4) + nx * 1.2, hy + dy * (s + 0.4) + ny * 1.2, OCHRE[4]);   // Wickelstreifen
  // Vogelschädel oben (Schnabel nach vorn)
  const tx = hx + dx * (up + 1.5), ty = hy + dy * (up + 1.5);
  ell(p, tx, ty, 2.0, 1.7, BONE);
  const fwd = Math.cos(a + Math.PI / 2) >= 0 ? 1 : -1;
  p.line(tx + fwd * 1.5, ty + 0.5, tx + fwd * 4, ty + 1.6, BONE[2]);
  p.px(tx + fwd * 4, ty + 2, BONE[1]);
  p.px(tx + fwd * 0.5, ty - 0.4, OUT_D);
  if (glowK > 0.05) { p.px(tx + fwd * 0.5, ty - 0.4, DGLOW[3]); g.px(tx + fwd * 0.5, ty - 0.4, DGLOW[glowK > 0.6 ? 4 : 3]); }
  if (p.fine) {
    // fein: Schädeldach mit Glanzkante, Schnabelfirst, Naht; Augenhöhle mit heißem Kern
    p.fline(tx - 1.5, ty - 1.2, tx + 0.5, ty - 1.7, BONE[4]); p.dot(tx - 1, ty - 1, '#fffbef');
    p.fline(tx + fwd * 1.5, ty + 0.25, tx + fwd * 3.75, ty + 1.25, BONE[3]);
    p.fline(tx - 0.5, ty - 1.5, tx - 1, ty + 0.5, BONE[1]);
    const ex = tx + fwd * 0.5, ey = ty - 0.4;
    if (glowK > 0.05) { p.dot(ex + 0.25, ey + 0.25, DGLOW[4]); g.dot(ex + 0.25, ey + 0.25, '#ffffff'); }
    else p.dot(ex + 0.5, ey + 0.5, '#3a2a1c');
  }
  // Ring mit Gehängen unter dem Schädel
  const rx = hx + dx * (up - 2), ry = hy + dy * (up - 2);
  p.px(rx - 1, ry, BONE[3]); p.px(rx + 1, ry, BONE[2]); p.px(rx, ry + 1, BONE[2]);
  for (let i = 0; i < 3; i++) {
    const sw = Math.sin(ph + i * 1.7) * 0.9;
    const ox = rx - 1.5 + i * 1.5;
    if (p.fine) {
      // fein: dünne Lederschnur, Perle und Feder mit Kiel
      const L = 4 + (i % 2), ex = ox + sw * L * 0.25 - L * 0.15;
      p.fline(ox, ry + 1.5, ex, ry + 1 + L, HIDE[3]);
      p.dot(ex, ry + 1 + L - 1.5, i === 1 ? BONE[3] : OCHRE[3]); p.dot(ex - 0.5, ry + L - 0.5, i === 1 ? BONE[4] : OCHRE[4]);
      p.fline(ex, ry + 1.5 + L, ox + sw - 0.9, ry + 6.5 + (i % 2), i === 1 ? BONE[2] : '#d8ccb4');
      p.dot(ox + sw - 0.4, ry + 5.5 + (i % 2), i === 1 ? BONE[1] : '#a89c84');
      continue;
    }
    for (let j = 1; j <= 4 + (i % 2); j++) p.px(ox + sw * j * 0.25 - j * 0.15, ry + 1 + j, j > 3 ? (i === 1 ? BONE[3] : OCHRE[3]) : HIDE[3]);
    p.px(ox + sw - 0.9, ry + 6 + (i % 2), i === 1 ? BONE[2] : '#d8ccb4');
  }
  if (glowK > 0.05) {
    const r = 1 + glowK * 2.6;
    // fein: Glut in nur 2 Stufen (kein brauner Außenring), heller Kern
    if (p.fine) { oval(g, tx, ty, r, r, DGLOW[2]); oval(g, tx, ty, Math.max(0.5, r - 1.2), Math.max(0.5, r - 1.2), DGLOW[4]); }
    else glowDot(g, tx, ty, r, DGLOW);
    for (let i = 0; i < 7; i++) {
      const aa = ph * 2 + i * TAU / 7, rr = r + 2 + hash2(i, 3, 7) * 2;
      const qx = tx + Math.cos(aa) * rr, qy = ty + Math.sin(aa) * rr * 0.8;
      if (p.fine) { p.dot(qx, qy, DGLOW[4]); p.dot(qx + 0.5, qy, DUSTC[3]); g.dot(qx, qy, DGLOW[4]); g.dot(qx + 0.5, qy, DGLOW[2]); continue; }
      p.px(qx, qy, DUSTC[3]); g.px(qx, qy, DGLOW[2]);
    }
  }
  return { x: tx, y: ty };
}

function lyingStaff(gx, gy) {
  return (p, g) => {
    for (let s = 0; s < 24; s++) { p.px(gx - 12 + s, gy - 1, DRIFT[3]); p.px(gx - 12 + s, gy, DRIFT[1]); }
    ell(p, gx + 13, gy - 1.5, 2, 1.6, BONE);
    p.px(gx + 16, gy - 1, BONE[2]); p.px(gx + 13, gy - 2, OUT_D);
    p.px(gx + 9, gy + 1, OCHRE[3]); p.px(gx + 8, gy + 1, HIDE[3]);
    if (p.fine) { p.fline(gx - 12, gy - 1, gx + 10, gy - 1, DRIFT[4]); p.fline(gx + 12, gy - 2.5, gx + 13.5, gy - 3, BONE[4]); p.dot(gx + 13.25, gy - 1.75, '#3a2a1c'); }
    return {};
  };
}

// Widderschädel als Maske: Schädeldach, Schnauze, dunkle Hörner eingerollt
function ramSkull(p, g, hx, hy, P) {
  // Schädeldach
  ell(p, hx + 1, hy - 1.2, 3.0, 2.4, BONE, { noise: 0.12, seed: 41, bias: p.fine ? 0.17 : 0.05 });   // fein: hellerer Knochen, hebt sich vom Fell ab
  // Schnauze nach vorn unten
  poly(p, [[hx + 2.2, hy - 2.6], [hx + 6.8, hy + 0.4], [hx + 6.4, hy + 2.0], [hx + 2.4, hy + 0.8]], (x, y) => (y < hy - 0.5 ? BONE[4] : y < hy + 1 ? BONE[3] : p.fine ? BONE[2] : BONE[1]));
  p.px(hx + 6.5, hy + 1.5, BONE[0]);
  // Hornschnecke seitlich: oben ansetzen, nach hinten-unten-vorn einrollen
  const cx = hx - 0.6, cy = hy + 0.6;
  // fein: Horn in Feinpixeln, schmale Lichtkante außen, Wachstumsrillen quer als Feinlinie
  const hq = p.fine ? 0.25 : 0.5, he = p.fine ? 0.35 : 0.6, put = p.fine ? p.dot.bind(p) : p.px.bind(p);
  for (let t = 0; t <= 1; t += p.fine ? 0.0125 : 0.025) {
    const ang = -Math.PI * 0.5 - t * Math.PI * 1.7;
    const r = 3.6 - t * 2.6;
    const x = cx + Math.cos(ang) * r * 1.1, y = cy + Math.sin(ang) * r;
    const w = 1.7 - t * 0.9;
    const ridge = Math.floor(t * 16) % 2 === 0;
    for (let k = -w; k <= w; k += hq) {
      const qx = x + Math.cos(ang) * k, qy = y + Math.sin(ang) * k;
      put(qx, qy, k > w - he ? HORN[ridge ? 5 : 4] : k < -w + he ? HORN[1] : HORN[ridge ? 3 : 2]);
    }
  }
  if (p.fine) {
    for (let t = 0.04; t < 0.95; t += 0.075) {
      const ang = -Math.PI * 0.5 - t * Math.PI * 1.7, r = 3.6 - t * 2.6, w = 1.7 - t * 0.9;
      const x = cx + Math.cos(ang) * r * 1.1, y = cy + Math.sin(ang) * r, c = Math.cos(ang + 0.25), sn = Math.sin(ang + 0.25);
      p.fline(x - c * (w - 0.3), y - sn * (w - 0.3), x + c * (w - 0.4), y + sn * (w - 0.4), HORN[1]);
    }
  }
  // Augenhöhle mit Glut
  p.rect(hx + 1.5, hy - 1.6, 2, 2, OUT_D);
  if (P.eye > 0.3) {
    const c = P.cast > 0.6 ? DGLOW[4] : DGLOW[3];
    p.px(hx + 2.5, hy - 0.6, c); g.px(hx + 2.5, hy - 0.6, DGLOW[P.cast > 0.6 ? 4 : 3]);
    g.px(hx + 1.5, hy - 0.6, DGLOW[1]);
    if (P.cast > 0.5) { g.px(hx + 2.5, hy - 1.6, DGLOW[2]); g.px(hx + 3.5, hy - 0.6, DGLOW[2]); }
  }
  // Ockerstreifen über der Stirn
  p.px(hx + 1, hy - 3.4, OCHRE[3]); p.px(hx + 2, hy - 3.2, OCHRE[4]); p.px(hx + 3, hy - 2.6, OCHRE[3]);
  if (p.fine) {
    // Handfein: Glanzkante auf Schädeldach und Nasenbein, Nasenloch, Zahnreihe, Riss im Knochen,
    // Augenhöhle gerundet mit Glutkern (hell im farbigen Saum)
    p.fline(hx - 0.5, hy - 3.5, hx + 2, hy - 3.75, BONE[4]); p.dot(hx, hy - 3, '#fffbef');
    p.fline(hx + 3, hy - 2.25, hx + 6.5, hy + 0.25, BONE[4]);
    p.fline(hx + 3.5, hy - 1, hx + 6, hy + 0.75, BONE[2]);
    p.dot(hx + 6, hy + 0.75, OUT_D); p.dot(hx + 6.25, hy + 1.25, BONE[0]);
    for (let x = hx + 3; x <= hx + 6; x += 0.5) p.dot(x, hy + 0.25 + (x - hx - 3) * 0.33 + 1, Math.round(x * 2) % 2 ? OUT_D : BONE[3]);
    p.fline(hx + 0.5, hy - 3.5, hx + 1, hy - 2.25, BONE[1]); p.dot(hx + 1.25, hy - 2, BONE[0]);
    p.dot(hx + 1.5, hy - 1.5, BONE[2]); p.dot(hx + 3, hy - 1.5, BONE[1]);           // Höhlenecken runden
    if (P.eye > 0.3) {
      const hot = P.cast > 0.6 ? '#ffffff' : DGLOW[4];
      p.dot(hx + 2.5, hy - 0.5, hot); p.dot(hx + 2.5, hy - 1, DGLOW[3]); p.dot(hx + 2, hy - 0.5, DGLOW[2]);
      g.dot(hx + 2.5, hy - 0.5, '#ffffff'); g.dot(hx + 3, hy - 0.5, DGLOW[3]);
    }
    // Schattenspalt unter der Maske (Kiefer- und Schädelunterkante), damit sie sich vom Körper absetzt
    p.fline(hx + 2.5, hy + 1.5, hx + 6.5, hy + 2.75, OUT_D, 0.5); p.fline(hx - 2, hy + 1.25, hx + 2.5, hy + 1.5, OUT_D, 0.5);
  }
}

function drawShaman(p, g, P, X) {
  const R = rig(P, SD, SS.AX, SS.AY);
  const { hip, pt, legF, legB, shF, shB, armF, armB } = R;
  const meta = {};
  const neck = pt(SD.spine + 1.4, 1.4);
  const hx = Math.round(neck.x + P.head), hy = Math.round(neck.y - 2.5 + P.headY);
  const gx = SS.AX + P.hipX * 0.5;

  dustSwirl(p, g, gx, SS.AY, P.sph, P.swirl, false);

  // --- Hinterer Arm (dürr, dunkle Haut)
  cap(p, shB.x, shB.y, armB.jx, armB.jy, 1.1, 0.9, SKD.slice(0, 4));
  cap(p, armB.jx, armB.jy, armB.ex, armB.ey, 0.9, 0.8, SKD.slice(0, 4));
  if (P.claw > 0.3) for (let i = -1; i <= 1; i++) p.line(armB.ex, armB.ey, armB.ex + 1 + i * 0.7, armB.ey - 2 + Math.abs(i) * 0.5, SKD[2]);

  // --- Beine (unter dem Gewand nur Schienbeine und Füße sichtbar)
  const leg = (L, x0, near) => {
    const ramp = near ? SKD : SKD.slice(0, 4);
    cap(p, x0, hip.y, L.jx, L.jy, 1.3, 1.0, ramp);
    cap(p, L.jx, L.jy, L.ex, L.ey - 1, 1.0, 0.9, ramp);
    for (let s = 0.3; s < 0.95; s += 0.3) p.px(L.jx + (L.ex - L.jx) * s + 0.5, L.jy + (L.ey - L.jy) * s, PAINT_D);
    p.rect(L.ex - 1, L.ey - 1, near ? 4 : 3, 1, SKD[near ? 1 : 0]);
  };
  leg(legB, hip.x - 1, false);
  leg(legF, hip.x + 1, true);

  // --- Gewand aus Fellhaut: Schultern bis unter die Knie, offen nach vorn
  const sway = Math.sin(P.capeT) * 0.7;
  const shR = pt(SD.spine + 0.3, 2.8), shL = pt(SD.spine + 0.6, -3.4);
  const frontHem = { x: hip.x + 3.2 + P.lean * 3 + sway * 0.4, y: SS.AY - 4.5 + Math.min(0, P.hipY) };
  const backHem = { x: hip.x - 6.5 - P.cape * 4 + sway, y: SS.AY - 2.5 - P.cape * 1.2 };
  const waistF = pt(0.5, 3.0);
  const robeCol = (x, y) => {
    const span = Math.max(1, frontHem.x - backHem.x + 2);
    const rel = (x - backHem.x) / span;
    const fold = ((x - Math.round(hip.x) + 40) + Math.floor((y - hip.y) * 0.25)) % 4;
    let i = rel < 0.18 ? 3 : rel < 0.5 ? 2 : 1;
    if (p.fine) return HIDE[rel < 0.3 ? 4 : rel < 0.62 ? 3 : 2];   // fein: Stoff in 3 Stufen (Licht von links), Falten folgen
    if (fold === 0) i -= 1; else if (fold === 2 && rel < 0.5) i += 1;
    if (y < shL.y + 2.5) i += 1;
    if (hash2(x, y, 17) < 0.1) i -= 1;
    return HIDE[clamp(i, 0, 5)];
  };
  const robe = [[shL.x, shL.y], [shR.x, shR.y], [waistF.x, waistF.y], [frontHem.x, frontHem.y], [backHem.x + 3, backHem.y + 1], [backHem.x, backHem.y]];
  poly(p, robe, robeCol);
  if (p.fine) {
    // Handfein: Fellhaut in Strähnen (nach unten gekämmt, Licht links), zwei zweifarbige Falten
    const x0 = Math.min(backHem.x, shL.x) - 1, x1 = Math.max(frontHem.x, shR.x) + 1, ins = (x, y) => inPoly(robe, x, y + 1.2) && inPoly(robe, x, y);
    // Großform: drei Faltenkanten von der Schulter zum Saum (Schattenrinne dunkel, links daneben Lichtkante)
    for (const [u, v] of [[0.15, 0.22], [0.42, 0.48], [0.7, 0.76]]) {
      const ax = shL.x + (shR.x - shL.x) * u, ay = shL.y + (shR.y - shL.y) * u + 2.5;
      const bx = backHem.x + (frontHem.x - backHem.x) * v, by = backHem.y + (frontHem.y - backHem.y) * v - 1.5;
      p.fline(ax + 0.5, ay, bx + 0.5, by, HIDE[0], 0.5); p.fline(ax, ay, bx, by, HIDE[1]); p.fline(ax - 0.5, ay + 0.5, bx - 0.5, by, HIDE[5]);
    }
    // wenige Fellzotteln, je Zone eine Stufe heller als der Stoff (erst auf der Großform)
    strands(p, x0, shL.y + 1, x1, Math.max(frontHem.y, backHem.y) - 2, 14, 17, -0.4 - P.cape * 0.6 + sway * 0.2, 1.6, (x) => {
      const rel = (x - backHem.x) / Math.max(1, frontHem.x - backHem.x);
      return rel < 0.3 ? HIDE[5] : rel < 0.62 ? HIDE[4] : HIDE[3];
    }, ins);
    // Schulterzone heller (Licht von oben)
    p.fline(shL.x, shL.y + 0.5, shR.x, shR.y + 0.5, HIDE[5]);
  }
  // Ocker-Zickzackband über dem Saum
  if (p.fine) {
    // fein: gemaltes Zickzack als Feinlinie mit hellem Farbauftrag oben
    let px0 = null;
    for (let x = Math.round(backHem.x) + 1; x <= Math.round(frontHem.x) - 1; x += 1) {
      const f = (x - backHem.x) / Math.max(1, frontHem.x - backHem.x);
      const y0 = backHem.y + (frontHem.y - backHem.y) * f - 2.5 - ((x + 40) % 2 ? 0.75 : 0);
      if (px0) { p.fline(px0[0], px0[1], x, y0, OCHRE[3]); p.fline(px0[0], px0[1] + 0.5, x, y0 + 0.5, OCHRE[1]); }
      if ((x + 40) % 2) p.dot(x, y0, OCHRE[4]);
      px0 = [x, y0];
    }
  } else for (let x = Math.round(backHem.x) + 1; x <= Math.round(frontHem.x) - 1; x++) {
    const f = (x - backHem.x) / Math.max(1, frontHem.x - backHem.x);
    const y0 = backHem.y + (frontHem.y - backHem.y) * f - 2.5;
    const z = ((x + 40) % 4);
    p.px(x, y0 - (z === 1 ? 1 : z === 3 ? 0 : 0.5), z % 2 ? OCHRE[2] : OCHRE[3]);
  }
  // zerfranster Saum
  for (let x = Math.round(backHem.x); x <= Math.round(frontHem.x); x++) {
    const f = (x - backHem.x) / Math.max(1, frontHem.x - backHem.x);
    const y0 = backHem.y + (frontHem.y - backHem.y) * f;
    const L = 1 + Math.floor(hash2(x - Math.round(hip.x), 2, 19) * 2.5) + (Math.sin(P.capeT + x * 0.9) > 0.6 ? 1 : 0);
    if (p.fine) {
      // fein: Fransen als einzelne Fellzotteln, je Weltpixel zwei verschieden lang
      for (const o of [0, 0.5]) {
        const LL = L + (hash2(x * 2 + o * 2, 7, 19) - 0.5) * 1.2;
        p.fline(x + o, y0, x + o - P.cape * 0.5, y0 + LL - 0.5, o ? HIDE[1] : HIDE[2]);
        p.dot(x + o - P.cape * 0.5, y0 + LL - 0.5, HIDE[0]);
      }
      continue;
    }
    for (let j = 0; j < L; j++) p.px(x, y0 + j, j === L - 1 ? HIDE[1] : HIDE[2]);
  }
  // Brust im offenen Gewand: bemalte Rippen
  const c0 = pt(SD.spine - 0.5, 1.6), c1 = pt(2, 2.3);
  cap(p, c0.x, c0.y, c1.x, c1.y, 1.2, 1.0, SKD);
  if (p.fine) {
    // fein: Rippen mit Asche gemalt (Pinselstrich hell, darunter Schatten der Rippe), Brustbein-Licht
    for (let r = 0; r < 4; r++) { const a = pt(SD.spine - 1.3 - r * 1.15, 0.8); p.fline(a.x, a.y, a.x + 1.5, a.y + 0.4 + r * 0.1, PAINT); p.fline(a.x + 0.25, a.y + 0.5, a.x + 1.5, a.y + 0.9, SKD[1]); }
    const s0 = pt(SD.spine - 0.8, 1.4), s1 = pt(2.5, 1.9); p.fline(s0.x, s0.y, s1.x, s1.y, SKD[4]);
  } else for (let r = 0; r < 3; r++) { const a = pt(SD.spine - 1.6 - r * 1.5, 1.3); p.px(a.x, a.y, PAINT); p.px(a.x + 1, a.y + 0.3, PAINT_D); }
  // Gürtel mit Beutel und Knochen
  const belt = pt(1.2, 0.5);
  p.line(belt.x - 3, belt.y - 0.5, belt.x + 2.5, belt.y + 0.5, OCHRE[1]);
  ell(p, belt.x - 1.5, belt.y + 1.8, 1.3, 1.5, SHAG.slice(2));
  p.px(belt.x + 1.5, belt.y + 1.5, BONE[3]); p.px(belt.x + 1.5, belt.y + 2.5, BONE[2]);
  if (p.fine) {
    // Beutel: Naht als Punktlinie, Zugschnur; Gürtelknoten
    for (let k = 0; k < 4; k++) p.dot(belt.x - 2.5 + k * 0.5, belt.y + 1.5 + (k & 1) * 0.5, SHAG[5]);
    p.fline(belt.x - 2.5, belt.y + 0.5, belt.x - 0.5, belt.y + 0.5, OCHRE[3]); p.dot(belt.x + 1.25, belt.y + 1.25, BONE[4]);
  }

  // --- Fellkragen mit Zahnkette
  const col = pt(SD.spine - 0.1, -0.4);
  ell(p, col.x - 0.6, col.y, 4.2, 2.3, SHAG, { noise: p.fine ? 0 : 0.4, seed: 23 });   // fein: ohne Rauschen, Zotteln tragen die Struktur
  if (p.fine) {
    // Handfein: Kragenfell in Zotteln (oben hell, nach außen-unten gekämmt), Zahnkette mit Glanzpunkt
    strands(p, col.x - 4.6, col.y - 2, col.x + 3.6, col.y + 2, 14, 23, 0, 1.6, (x, y) => {
      const lx = (x - col.x + 0.6) / 4.2, ly = (y - col.y) / 2.3;
      if (lx * lx + ly * ly > 0.9) return null;
      return ly < -0.3 ? SHAG[5] : lx < 0 ? SHAG[4] : SHAG[2];
    });
    for (let i = -3.5; i <= 3; i += 0.75) p.fline(col.x + i, col.y + 1.5, col.x + i - 0.3, col.y + 2.5 + hash2(Math.round(i * 4), 1, 5) * 1.2, SHAG[1]);
    for (let i = 0; i < 6; i++) { const t = pt(SD.spine - 2.1 - i * 0.15, 0.3 + i * 0.5); p.dot(t.x, t.y, BONE[3]); p.dot(t.x, t.y + 0.5, BONE[1]); if (i % 2) p.dot(t.x - 0.5, t.y, BONE[4]); }
  } else {
    for (let i = -3; i <= 3; i += 1.3) p.px(col.x + i, col.y + 2 + (hash2(i * 3 | 0, 1, 5) * 1.6 | 0), SHAG[1]);
    for (let i = 0; i < 4; i++) { const t = pt(SD.spine - 2.2 - i * 0.2, 0.5 + i * 0.7); p.px(t.x, t.y, BONE[i % 2 ? 3 : 4]); }
  }

  // --- Kopf: Gesicht im Schatten unter dem Widderschädel
  ell(p, hx + 1.6, hy + 1.0, 2.2, 2.0, ['#120c0a', '#1c1410', '#2a1e18', '#3a2a20']);
  p.px(hx + 3, hy + 2.6 + Math.round(P.jaw), '#080404');
  // Ziegenbart
  if (p.fine) {
    // Handfein: Gesicht im Maskenschatten – Wangenlicht, Lippen, Mundwinkel, Zähne bei offenem Kiefer;
    // Ziegenbart in fünf Strähnen (hell oben, dunkle Spitzen)
    p.dot(hx + 3.5, hy + 1.5, '#4a3628'); p.dot(hx + 3, hy + 1.5, '#3a2a20');
    p.fline(hx + 2, hy + 2.5 + P.jaw, hx + 3.5, hy + 2.5 + P.jaw, '#080404'); p.dot(hx + 1.5, hy + 2, '#2a1e18');
    if (P.jaw > 0.4) { p.dot(hx + 2.5, hy + 2.5, '#d8ccb4'); p.dot(hx + 3, hy + 2.5, '#bab0a0'); p.dot(hx + 2.5, hy + 3 + P.jaw, '#4a1410'); }
    for (let i = 0; i < 5; i++) {
      const bx = hx + 1.75 + i * 0.4, ex = hx + 1.5 + i * 0.3 - P.cape, ey = hy + 5.5 + (i % 2 ? 0.5 : 0) - Math.abs(i - 2) * 0.4;
      p.fline(bx, hy + 3, ex, ey, i < 2 ? '#bab0a0' : i === 4 ? '#6a6258' : '#9a9080'); p.dot(ex, ey + 0.5, '#5a544a');
    }
  } else { p.line(hx + 2.5, hy + 3, hx + 2 - P.cape, hy + 6, '#9a9080'); p.px(hx + 3, hy + 3, '#bab0a0'); p.px(hx + 2 - P.cape, hy + 6, '#6a6258'); }
  ramSkull(p, g, hx, hy - 1.5, P);
  // Federn hinten am Schädel
  for (let i = 0; i < 3; i++) {
    const bx = hx - 2.5 - i * 0.8, by = hy - 3.5 + i * 0.8;
    const ang = -2.1 - i * 0.35 - P.cape * 0.3 + Math.sin(P.capeT + i) * 0.08;
    if (p.fine) {
      // fein: Feder mit hellem Kiel und Fahnen in Feinpixeln, Spitze ockerfarben
      const L = 6 - i, ca = Math.cos(ang), sa = Math.sin(ang), ex = bx + ca * L, ey = by + sa * L;
      const mx = bx + ca * (L - 2), my = by + sa * (L - 2);
      p.fline(bx + sa * 0.5, by - ca * 0.5, mx + sa * 0.5, my - ca * 0.5, '#5a5046');       // Fahne zum Licht
      p.fline(bx - sa * 0.5, by + ca * 0.5, mx - sa * 0.5, my + ca * 0.5, '#2a2420');       // Fahne im Schatten
      p.fline(mx + sa * 0.4, my - ca * 0.4, ex, ey, OCHRE[4]); p.fline(mx - sa * 0.4, my + ca * 0.4, ex, ey, OCHRE[2]);
      p.fline(bx, by, ex - ca * 0.5, ey - sa * 0.5, '#8a7e6c');                                // Kiel
      continue;
    }
    for (let s = 0; s < 6 - i; s++) p.px(bx + Math.cos(ang) * s, by + Math.sin(ang) * s, s >= 4 - i ? OCHRE[3] : s % 2 ? '#2a2420' : '#4a4038');
  }
  meta.eye = { x: hx + 2.5, y: hy - 2 };
  meta.head = { x: hx + 1, y: hy - 7 };
  meta.mouth = { x: hx + 3, y: hy + 3 };

  // --- Vorderer Arm + Stab
  if (X.smear) smearArc(p, g, shF.x, shF.y, X.smear[0], X.smear[1], 11, 18, [DUSTC[1], DUSTC[2], DUSTC[3]], DGLOW.slice(1, 3), X.smear[2] ?? 1);
  let tip = null;
  const arm = () => {
    cap(p, shF.x, shF.y, armF.jx, armF.jy, 1.2, 1.0, SKD);
    cap(p, armF.jx, armF.jy, armF.ex, armF.ey, 1.0, 0.9, SKD);
    const bx = armF.jx + (armF.ex - armF.jx) * 0.6, by = armF.jy + (armF.ey - armF.jy) * 0.6;
    p.px(bx, by, BONE[3]); p.px(bx + 0.6, by + 0.6, BONE[2]);
    ell(p, shF.x - 0.3, shF.y, 1.8, 1.5, SHAG.slice(1));
    if (p.fine) {
      // Armreif aus Knochen mit Glanzpunkt, Schulterfell in Zotteln, gemalte Linie am Unterarm
      p.dot(bx - 0.25, by - 0.25, BONE[4]);
      for (let k = -1.5; k <= 1.5; k += 0.5) p.fline(shF.x + k - 0.3, shF.y - 1, shF.x + k - 0.6, shF.y + 1.5 + Math.abs(k) * 0.3, k < 0 ? SHAG[4] : SHAG[2]);
      p.fline(armF.jx + 0.4, armF.jy - 0.2, armF.jx + (armF.ex - armF.jx) * 0.45 + 0.4, armF.jy + (armF.ey - armF.jy) * 0.45 - 0.2, PAINT_D);
    }
  };
  if (P.held > 0.5) {
    tip = drawBoneStaff(p, g, armF.ex, armF.ey, P.sa, P.cast, P.sph);
    arm();
    ell(p, armF.ex, armF.ey, 1.1, 1.1, SKD); p.px(armF.ex - 0.5, armF.ey - 0.5, SKD[4]);
    if (p.fine) { p.dot(armF.ex - 0.75, armF.ey - 0.75, SKD[5]); p.dot(armF.ex + 0.25, armF.ey - 0.25, SKD[1]); p.dot(armF.ex + 0.25, armF.ey + 0.5, SKD[1]); }   // Knöchel
  } else {
    arm();
    ell(p, armF.ex, armF.ey, 1.0, 1.0, SKD);
  }
  meta.hand = tip ?? { x: armF.ex, y: armF.ey };
  if (tip) meta.tip = tip;

  dustSwirl(p, g, gx, SS.AY, P.sph, P.swirl, true);
  if (X.dust) dust(p, SS.AX + X.dust, SS.AY, 8, 3, DUSTC, 14);
  return meta;
}

function shamanAnims() {
  const mk = (P, X) => makeFrame(SS, drawShaman, P, X);
  const idleA = shp();
  const idle = track(mk, cycle((ph) => {
    const s = Math.sin(ph);
    return shp({ hipY: (1 - Math.cos(ph)) * 0.4, lean: 0.24 + s * 0.03, hFy: 4 + s * 0.5, hBy: 7 + s * 0.6, capeT: ph, sph: ph, swirl: 0.25, head: Math.max(0, s) * 0.4, sa: -1.45 + s * 0.04 });
  }, 6), 6, { loop: true });
  // Gang: Stab wird wie ein Wanderstock mitgesetzt
  const walk = track(mk, walkKeys(idleA, 8, {
    stride: 3.8, lift: 2, bob: 0.8, arm: 0,
    extra: (ph, s) => ({ hFx: 7.5 + s * 1.6, hFy: 4 - Math.max(0, -s) * 1.2, sa: -1.45 - s * 0.14, hBx: 1.5 - s * 1.2, cape: 0.45, capeT: ph, sph: ph, swirl: 0.15, lean: 0.3 }),
  }), 8, { loop: true, extras: { 0: { fx: 'step' }, 4: { fx: 'step' } } });

  // Nahkampf: Stab über den Kopf nach hinten, dann Schädelende nach vorn stoßen
  const w1 = shp({ lean: 0.08, hFx: 2, hFy: -3, sa: -2.2, hBx: 3, hBy: 3, jaw: 0.5, swirl: 0.3, sph: 1, capeT: 1 });
  const w2 = shp({ lean: -0.08, hipX: -1, hFx: -1, hFy: -6, sa: -2.75, hBx: 4, hBy: 2, jaw: 1, swirl: 0.4, sph: 2, cast: 0.3, capeT: 2, fFx: 4, fBx: -4 });
  const windup = track(mk, [[0, idleA], [0.45, w1], [1, w2]], 4);
  const s1 = shp({ lean: 0.35, hipX: 1, hFx: 6, hFy: -2, sa: -0.9, hBx: 0, hBy: 6, jaw: 1, cast: 0.4, fFx: 5.5, fBx: -4.5, cape: 0.5, capeT: 3, sph: 3, swirl: 0.4 });
  const s2 = shp({ lean: 0.5, hipX: 2.5, hipY: 1.5, hFx: 9, hFy: 3, sa: 0.12, hBx: -1, hBy: 6, jaw: 1, cast: 0.6, fFx: 7, fBx: -5, cape: 0.8, capeT: 4, sph: 4, swirl: 0.5 });
  const s3 = shp({ lean: 0.42, hipX: 2, hipY: 1, hFx: 8, hFy: 4, sa: 0.25, hBx: 0, hBy: 7, jaw: 0.4, cast: 0.2, fFx: 7, fBx: -5, cape: 0.5, capeT: 5, sph: 5, swirl: 0.3 });
  const strike = [
    mk(s1, { smear: [-2.4, -0.9] }),
    mk(s2, { smear: [-1.9, 0.12], fx: 'impact', dust: 10 }),
    mk(s3, { smear: [-0.6, 0.3] }),
    mk(mixP(s3, idleA, 0.55)),
  ];
  // Zauber: Stab hoch, Wirbel steigt, Glut im Schädel, Stab stößt in den Boden
  const c1 = shp({ lean: 0.05, head: -0.4, headY: -0.5, hFx: 4, hFy: -6, sa: -1.6, hBx: 2, hBy: -4, claw: 1, swirl: 0.55, sph: 1, cast: 0.35, jaw: 0.6, capeT: 1, cape: 0.2 });
  const c2 = shp({ lean: -0.04, head: -0.8, headY: -1, hFx: 3.5, hFy: -9, sa: -1.57, hBx: 1, hBy: -7, claw: 1, swirl: 0.9, sph: 2.4, cast: 0.8, jaw: 1, capeT: 2, cape: 0.4 });
  const c3 = { ...c2, swirl: 1.15, sph: 3.8, cast: 1, capeT: 3, head: -0.6 };
  const c4 = shp({ lean: 0.36, hipY: 1.5, hFx: 6, hFy: 3, sa: -1.62, hBx: 4, hBy: 1, claw: 1, swirl: 1.25, sph: 5, cast: 1, jaw: 1, capeT: 4, cape: 0.6, fFx: 4.5, fBx: -4 });
  const c5 = { ...mixP(c4, idleA, 0.5), swirl: 0.7, sph: 6, cast: 0.4 };
  const cast = [
    mk(c1), mk(mixP(c1, c2, 0.5)), mk(c2), mk(c3, { fx: 'cast' }), mk({ ...c3, sph: 4.4 }),
    mk(c4, { fx: 'impact', dust: 6 }), mk(c5),
  ];
  const hurtP = shp({ lean: -0.12, hipX: -1, head: -1, headY: 0.5, hFx: 3, hFy: 3, sa: -1.1, hBx: -1, hBy: 4, eye: 0.6, jaw: 1, cape: -0.2, swirl: 0.1 });
  const hurt = [mk(hurtP), mk(mixP(hurtP, idleA, 0.5))];
  // Tod: Stab entgleitet, in die Knie, vornüber in den Staub
  const d1 = shp({ ...hurtP, lean: -0.2, hFy: 5, sa: -0.6, swirl: 0.4, sph: 2 });
  const d2 = shp({ lean: 0.4, hipY: 3.5, fFx: 4, fFy: 0, fBx: -3, hFx: 6, hFy: 9, hBx: 3, hBy: 9, held: 0, eye: 0.4, jaw: 1, head: 1, swirl: 0.6, sph: 3 });
  const d3 = { ...d2, lean: 0.7, hipY: 4, head: 1.5, eye: 0 };
  const piv = [SS.AX + 4, SS.AY - 1];
  const staff = lyingStaff(SS.AX + 5, SS.AY);
  const death = [
    mk(d1), mk(d2, { post: staff }), mk(d3, { post: staff }),
    mk(d3, { rot: [0.7, ...piv], post: staff }),
    mk({ ...d3, swirl: 0.3, sph: 4 }, { rot: [1.35, ...piv], post: staff, fx: 'impact', dust: 4 }),
    mk({ ...d3, swirl: 0, hFy: 11 }, { rot: [Math.PI / 2, piv[0], piv[1]], post: staff }),
  ];
  return {
    idle: new Animation(idle, 6),
    walk: new Animation(walk, 9),
    windup: new Animation(windup, 8, false),
    strike: new Animation(strike, 13, false),
    cast: new Animation(cast, 9, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 8, false),
  };
}

// ================================================================ Staubtotem (Heiltotem des Schamanen)

const TS = { W: 30, H: 40, AX: 15, AY: 36, pad: 10, rim: RIM_STEPPE };
const T_REST = { t: 0, glow: 0.6, shake: 0, crack: 0, top: 1, flare: 0 };
const tpose = (o = {}) => ({ ...T_REST, ...o });

// Kleine geritzte Rune (3×4), leuchtet je nach k
function rune(p, g, x, y, kind, k) {
  const shapes = [
    [[0, 0], [0, 1], [0, 2], [0, 3], [1, 1], [2, 0], [2, 2]],
    [[1, 0], [0, 1], [2, 1], [1, 2], [1, 3]],
    [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2], [1, 3]],
  ];
  if (p.fine) {
    // fein: Rune als geritzte Rille; leuchtend mit weißglühendem Kern (Feinlinie) im farbigen Saum
    const S = shapes[kind % 3], lit = k > 0.25;
    for (const [dx, dy] of S) {
      p.px(x + dx, y + dy, lit ? DGLOW[k > 0.8 ? 3 : 2] : WOODT[0]);
      if (lit) g.px(x + dx, y + dy, DGLOW[k > 0.5 ? 2 : 1]);
      else p.dot(x + dx + 0.5, y + dy + 1, WOODT[4]);                 // Ritzkante fängt Licht
    }
    const core = k > 0.8 ? '#ffffff' : DGLOW[4];
    for (let i = 0; i < S.length; i++) for (let j = i; j < S.length; j++) {
      const a = S[i], b = S[j];
      if (Math.abs(a[0] - b[0]) > 1 || Math.abs(a[1] - b[1]) > 1) continue;
      const x0 = x + a[0] + 0.5, y0 = y + a[1] + 0.5, x1 = x + b[0] + 0.5, y1 = y + b[1] + 0.5;
      p.fline(x0, y0, x1, y1, lit ? core : '#0c0805');
      if (lit) g.fline(x0, y0, x1, y1, k > 0.5 ? DGLOW[4] : DGLOW[3]);
    }
  } else for (const [dx, dy] of shapes[kind % 3]) {
    p.px(x + dx, y + dy, k > 0.25 ? (k > 0.8 ? DGLOW[4] : DGLOW[3]) : WOODT[0]);
    if (k > 0.25) g.px(x + dx, y + dy, DGLOW[k > 0.8 ? 4 : k > 0.5 ? 3 : 2]);
  }
  if (k > 0.6) { g.px(x + 1, y - 1, DGLOW[1]); g.px(x + 1, y + 4, DGLOW[1]); g.px(x - 1, y + 1, DGLOW[1]); g.px(x + 3, y + 2, DGLOW[1]); }
}

function drawTotem(p, g, P, X) {
  const { AX, AY } = TS;
  const meta = {};
  const sx = Math.round(Math.sin(P.shake * 9) * P.shake * 1.2);
  const cx = AX + sx;
  const k = clamp(P.glow, 0, 1.6);

  // --- Steinsockel
  ell(p, AX - 4, AY - 2, 3.4, 2.4, STONE, { noise: 0.25, seed: 3 });
  ell(p, AX + 4, AY - 2, 3.2, 2.2, STONE, { noise: 0.25, seed: 4 });
  ell(p, AX, AY - 3, 3.6, 2.8, STONE, { noise: 0.25, seed: 5, bias: 0.06 });
  p.px(AX - 1, AY - 3, OCHRE[3]); p.px(AX, AY - 4, OCHRE[2]);       // Handabdruck
  if (p.fine) {
    // Steinkanten im Licht, Spalten, Handabdruck mit Fingern
    p.fline(AX - 6.5, AY - 3.5, AX - 4.5, AY - 4.25, STONE[5]); p.fline(AX - 2.5, AY - 5.25, AX + 0.5, AY - 5.75, STONE[5]); p.fline(AX + 2, AY - 3.75, AX + 3.5, AY - 4, STONE[4]);
    p.fline(AX - 2.5, AY - 1, AX - 1.5, AY - 3, STONE[0]); p.fline(AX + 4, AY - 1, AX + 5, AY - 2.5, STONE[0]);
    for (let i = 0; i < 4; i++) p.fline(AX - 1.5 + i * 0.5, AY - 3.5, AX - 1.75 + i * 0.6, AY - 4.75 + (i === 0 ? 0.5 : 0), OCHRE[3]);
  }
  // --- Pfahl
  const top = AY - 27;
  for (let y = AY - 4; y >= top; y--) {
    const crackHere = P.crack > 0 && Math.abs(y - (AY - 15)) < 1.5;
    if (p.fine) {
      // fein: Rundholz in 8 Feinspalten (Glanzkante links), geschnitzte Ringkerbe mit heller Lippe, Maserung
      const groove = (y + 40) % 5 === 0, FR = [5, 4, 4, 3, 3, 2, 1, 1];
      for (let j = 0; j < 8; j++) {
        const i = FR[j];
        p.rect(cx - 2 + j * 0.5, y, 0.5, 0.5, WOODT[groove ? Math.max(0, i - 2) : i]);
        p.rect(cx - 2 + j * 0.5, y + 0.5, 0.5, 0.5, WOODT[groove ? Math.min(5, i + 1) : i]);
      }
      if (!groove) for (const o of [-1, 0.5]) { const w = Math.sin(y * 0.6 + o * 3) > 0.3 ? 0.5 : 0; p.dot(cx + o + w, y, WOODT[o < 0 ? 2 : 0]); p.dot(cx + o + w, y + 0.5, WOODT[o < 0 ? 2 : 0]); }
    } else for (let x = -2; x <= 1; x++) {
      let c = x === -2 ? WOODT[4] : x === -1 ? WOODT[3] : x === 0 ? WOODT[2] : WOODT[1];
      if ((y + 40) % 5 === 0) c = WOODT[Math.max(0, WOODT.indexOf(c) - 1)];
      if (hash2(x, y, 9) < 0.12) c = WOODT[1];
      p.px(cx + x, y, c);
    }
    if (crackHere) { p.px(cx - 1, y, DGLOW[3]); g.px(cx - 1, y, DGLOW[3]); p.px(cx, y, DGLOW[2]); if (p.fine) { p.dot(cx - 0.5 + (y & 1) * 0.5, y + 0.5, '#ffffff'); g.dot(cx - 0.5 + (y & 1) * 0.5, y + 0.5, DGLOW[4]); } }
  }
  // geritzte Runen
  const pulse = k * (0.8 + 0.2 * Math.sin(P.t));
  rune(p, g, cx - 2, AY - 10, 0, pulse);
  rune(p, g, cx - 2, AY - 21, 2, pulse * (0.9 + 0.1 * Math.cos(P.t)));
  // Querholz mit Gehängen
  const by = AY - 23;
  for (let x = -6; x <= 6; x++) { p.px(cx + x, by, WOODT[x < 0 ? 4 : 3]); p.px(cx + x, by + 1, WOODT[1]); }
  p.px(cx - 6, by - 1, WOODT[3]); p.px(cx + 6, by - 1, WOODT[2]);
  if (p.fine) { p.fline(cx - 6, by, cx + 6, by, WOODT[4]); p.fline(cx - 6.5, by - 1, cx - 5.5, by - 1, WOODT[5]); for (const x of [-4, 2]) p.fline(cx + x, by + 0.5, cx + x + 1.5, by + 0.5, WOODT[2]); }
  for (const [ox, len, kind] of [[-5, 6, 0], [-3, 4, 1], [3, 5, 1], [5, 7, 0]]) {
    const sw = Math.sin(P.t + ox) * 0.9;
    if (p.fine) {
      // fein: dünne Schnur, Perlen mit Glanzpunkt, Knochen bzw. Feder mit Kiel
      const ex = cx + ox + sw * 1.5, ey = by + 2 + len;
      p.fline(cx + ox, by + 1.5, ex, ey - 0.5, kind ? HIDE[4] : TEAL[3]);
      if (!kind) for (let j = 3; j < len; j += 3) { const x = cx + ox + sw * j / len * 1.5; p.dot(x - 0.25, by + 1 + j, TEAL[5]); p.dot(x + 0.25, by + 1.5 + j, TEAL[2]); }
      if (kind) { p.fline(ex, ey, ex, ey + 1.5, BONE[3]); p.dot(ex - 0.5, ey, BONE[4]); p.dot(ex + 0.5, ey + 1.5, BONE[1]); }
      else { p.fline(ex, ey, ex - 1, ey + 3, '#4a4038'); p.fline(ex + 0.5, ey, ex - 0.5, ey + 3, '#2a2420'); p.dot(ex - 1, ey + 3, OCHRE[4]); p.dot(ex - 0.5, ey + 3.5, OCHRE[3]); }
      continue;
    }
    for (let j = 1; j <= len; j++) {
      const x = cx + ox + sw * j / len * 1.5, y = by + 1 + j;
      p.px(x, y, kind ? HIDE[4] : (j % 3 === 0 ? TEAL[4] : TEAL[3]));
    }
    const ex = cx + ox + sw * 1.5, ey = by + 2 + len;
    if (kind) { p.px(ex, ey, BONE[3]); p.px(ex, ey + 1, BONE[2]); }
    else { p.line(ex, ey, ex - 1, ey + 3, '#2a2420'); p.px(ex - 1, ey + 3, OCHRE[3]); }
  }
  // Seil-Bindung + Menschenschädel in der Mitte
  for (let y = AY - 17; y <= AY - 15; y++) p.px(cx - 2 + (y % 2), y, DRIFT[3]);
  if (P.top > 0.5) {
    ell(p, cx + 2.3, AY - 15.5, 2.4, 2.2, BONE, { noise: 0.1, seed: 7 });
    p.rect(cx + 1.6, AY - 15.6, 1, 1, OUT_D); p.rect(cx + 3.4, AY - 15.6, 1, 1, OUT_D);
    p.px(cx + 2.5, AY - 14.4, BONE[1]); p.rect(cx + 1.8, AY - 13.6, 2, 1, BONE[2]);
    if (k > 0.3) { g.px(cx + 1.6, AY - 15.6, DGLOW[2]); g.px(cx + 3.4, AY - 15.6, DGLOW[2]); p.px(cx + 3.4, AY - 15.6, DGLOW[2]); }
    if (p.fine) {
      // Menschenschädel: Glanz auf der Stirn, Schläfennaht, Zähne einzeln, glimmende Pupillen
      p.fline(cx + 0.5, AY - 17, cx + 2.5, AY - 17.5, BONE[4]); p.dot(cx + 1, AY - 16.5, '#fffbef');
      p.fline(cx + 3.5, AY - 17.5, cx + 4, AY - 16.25, BONE[1]);
      for (let i = 0; i < 4; i++) p.dot(cx + 2 + i * 0.5, AY - 13.5, i & 1 ? BONE[1] : BONE[4]);
      if (k > 0.3) { for (const ex of [2.25, 4.25]) { p.dot(cx + ex - 0.25, AY - 15.75, DGLOW[4]); g.dot(cx + ex - 0.25, AY - 15.75, '#ffffff'); } }
    }
  }
  // Ochsenschädel mit weit ausladenden Hörnern oben
  if (P.top > 0.5) {
    const sy = top - 2;
    for (const sd of [-1, 1]) {
      if (p.fine) {
        // fein: Horn verjüngt sich, Lichtgrat oben, Wachstumsrillen, helle Spitze
        for (let s = 0; s <= 8.5; s += 0.25) {
          const x = cx + sd * (2 + s), y = sy - 1 - s * s * 0.06 + (s > 5 ? -(s - 5) * 0.9 : 0);
          const w = Math.max(0.5, 2 - s * 0.2), ring = s < 6 && Math.round(s * 4) % 6 === 0;
          for (let k = 0; k <= w; k += 0.5) p.dot(x, y + k, ring ? HORN[1] : s > 6.5 ? HORN[5] : k === 0 ? (sd < 0 ? HORN[5] : HORN[4]) : k + 0.5 > w ? HORN[1] : sd < 0 ? HORN[3] : HORN[2]);
        }
        continue;
      }
      for (let s = 0; s <= 8; s += 0.5) {
        const x = cx + sd * (2 + s), y = sy - 1 - s * s * 0.06 + (s > 5 ? -(s - 5) * 0.9 : 0);
        p.px(x, y, s > 6.5 ? HORN[5] : sd < 0 ? HORN[4] : HORN[2]);
        if (s < 5) p.px(x, y + 1, HORN[1]);
      }
    }
    ell(p, cx, sy, 3, 2.6, BONE, { noise: 0.12, seed: 8 });
    poly(p, [[cx - 2, sy + 1], [cx + 2, sy + 1], [cx + 1.2, sy + 5.5], [cx - 1.2, sy + 5.5]], (x, y) => (x < cx ? BONE[3] : BONE[2]));
    p.px(cx - 1, sy + 5, BONE[1]); p.px(cx, sy + 5, BONE[1]);
    p.rect(cx - 2, sy, 1, 2, OUT_D); p.rect(cx + 1, sy, 1, 2, OUT_D);
    const ec = k > 1 ? DGLOW[4] : DGLOW[3];
    if (k > 0.2) { p.px(cx - 2, sy + 1, ec); p.px(cx + 1, sy + 1, ec); g.px(cx - 2, sy + 1, DGLOW[3]); g.px(cx + 1, sy + 1, DGLOW[3]); g.px(cx - 2, sy, DGLOW[1]); g.px(cx + 1, sy, DGLOW[1]); }
    p.px(cx - 1, sy - 2, OCHRE[3]); p.px(cx, sy - 2, OCHRE[4]);    // Ockerstrich
    if (p.fine) {
      // Ochsenschädel: Stirnwulst mit Glanzlinie, Nasenbein-Licht, Nüstern, Glutkern in den Höhlen
      p.fline(cx - 2.5, sy - 1.5, cx + 1.5, sy - 2, BONE[4]); p.dot(cx - 1.5, sy - 1, '#fffbef');
      p.fline(cx - 0.5, sy + 2, cx - 0.5, sy + 4.5, BONE[4]); p.dot(cx - 1, sy + 5, OUT_D); p.dot(cx + 0.5, sy + 5, OUT_D);
      p.fline(cx + 1.5, sy + 2, cx + 1, sy + 4.5, BONE[1]);
      if (k > 0.2) for (const ex of [-2, 1]) { p.dot(cx + ex, sy + 1, k > 1 ? '#ffffff' : DGLOW[4]); g.dot(cx + ex, sy + 1, '#ffffff'); p.dot(cx + ex + 0.5, sy + 1.5, DGLOW[2]); }
    }
    meta.head = { x: cx, y: sy - 4 };
    meta.eye = { x: cx, y: sy + 1 };
  } else {
    meta.head = { x: cx, y: top };
    meta.eye = { x: cx, y: top + 2 };
  }
  // aufsteigende Glutstäubchen (Heilaura)
  if (k > 0.15) {
    for (let i = 0; i < 6; i++) {
      const u = ((P.t / TAU) + i / 6) % 1;
      const x = cx + Math.sin(P.t * 2 + i * 2.1) * (3 + i % 3), y = AY - 4 - u * 22;
      if (u > 0.9) continue;
      if (p.fine) { p.dot(x, y, u < 0.5 ? DGLOW[4] : DUSTC[3]); p.dot(x, y + 0.5, u < 0.5 ? DGLOW[2] : DUSTC[2]); g.dot(x, y, DGLOW[u < 0.5 ? 4 : 2]); g.dot(x, y + 0.5, DGLOW[u < 0.5 ? 2 : 1]); continue; }
      p.px(x, y, u < 0.5 ? DGLOW[3] : DUSTC[3]); g.px(x, y, DGLOW[u < 0.5 ? 2 : 1]);
    }
    glowDot(g, cx, AY - 3, 1.2 + k * 0.8, ['#1e1004', '#3a2006', DGLOW[1], DGLOW[2]]);
  }
  if (P.flare > 0) {
    const r = 3 + P.flare * 8;
    for (let i = 0; i < 18; i++) {
      const a = i / 18 * TAU, x = cx + Math.cos(a) * r, y = AY - 14 + Math.sin(a) * r * 0.9;
      if (p.fine) { const tx = -Math.sin(a) * 0.5, ty = Math.cos(a) * 0.45; p.fline(x - tx, y - ty, x + tx, y + ty, DUSTC[4]); g.fline(x - tx, y - ty, x + tx, y + ty, DGLOW[P.flare > 0.6 ? 2 : 3]); g.dot(x, y, DGLOW[4]); continue; }
      p.px(x, y, DUSTC[4]); g.px(x, y, DGLOW[P.flare > 0.6 ? 2 : 3]);
    }
  }
  meta.hand = { x: cx, y: AY - 14 };
  if (X.dust) dust(p, AX, AY, 9, 5, DUSTC, 16);
  return meta;
}

function totemAnims() {
  const mk = (P, X) => makeFrame(TS, drawTotem, P, X);
  const idle = track(mk, cycle((ph) => tpose({ t: ph, glow: 0.65 + Math.sin(ph) * 0.35 }), 8), 8, { loop: true });
  const hurt = [mk(tpose({ shake: 1, glow: 1.2 })), mk(tpose({ shake: 0.5, glow: 0.8, t: 1 }))];
  const piv = [TS.AX + 1, TS.AY - 3];
  const fallen = tpose({ glow: 0, top: 1, t: 2 });
  const death = [
    mk(tpose({ glow: 1.5, shake: 1, flare: 0.2 })),
    mk(tpose({ glow: 1.2, crack: 1, shake: 0.6, flare: 0.6 })),
    mk(tpose({ glow: 0.5, crack: 1, flare: 1, t: 1 }), { rot: [0.35, ...piv] }),
    mk(tpose({ glow: 0.2, crack: 1, t: 1.5 }), { rot: [0.9, ...piv] }),
    mk(fallen, { rot: [1.45, ...piv], fx: 'impact', dust: 1 }),
    mk({ ...fallen, crack: 1 }, { rot: [Math.PI / 2, ...piv] }),
  ];
  const idleA = new Animation(idle, 7);
  return {
    idle: idleA,
    walk: idleA,
    windup: new Animation([mk(tpose({ glow: 1.3, t: 0 })), mk(tpose({ glow: 1.5, t: 1, flare: 0.3 }))], 6, false),
    strike: new Animation([mk(tpose({ glow: 1.5, flare: 0.6 })), mk(tpose({ glow: 1, flare: 1, t: 1 }))], 8, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 8, false),
  };
}

// ================================================================ Fallensteller (Gnoll)

const GS = { W: 62, H: 48, AX: 27, AY: 43, pad: 12, rim: { c: [238, 224, 196], k1: 0.34, k2: 0.18 } };
const GD = { legH: 12, thigh: 5.2, shin: 5.2, spine: 9, upper: 4.8, fore: 5, sh: 1.6, hipW: 1 };
const GFUR = ['#1c100a', '#33200f', '#523418', '#744c22', '#966632', '#b48446', '#cca262'];
const GFUR_D = ['#140c07', '#24160c', '#3a2512', '#52351a', '#6c4824'];
const GMANE = ['#0e0b09', '#1b1612', '#2a221b', '#3b3027', '#4e4134'];
const GSPOT = '#2a1e13';
const ROPE = ['#2a2016', '#4a3a26', '#6e5a3a', '#927a52', '#b49c6e'];
const IRONB = ['#16161a', '#2a2a30', '#44444c', '#686a72', '#9a9ca4', '#d0d2d6'];
const G_REST = {
  hipX: 0, hipY: 0, lean: 0.42, head: 0, headY: 0, fFx: 3.5, fFy: 0, fBx: -3, fBy: 0,
  hFx: 3.5, hFy: 8.5, hBx: 0, hBy: 6.5, wa: 0.75, tail: 0, tailT: 0, jaw: 0, eye: 1, net: 1, ear: 0, spin: 0,
};
const gpose = (o = {}) => ({ ...G_REST, ...o });

// Digitigrades Bein: Hüfte -> Knie (vorn) -> Sprunggelenk (hinten) -> Pfote
function gnollLeg(p, hx, hy, fx, fy, ramp, near) {
  const hock = { x: fx - 2.2, y: fy - 3.6 };
  const L = ik(hx, hy, hock.x, hock.y, GD.thigh, GD.shin, -1);
  cap(p, hx, hy, L.jx, L.jy, near ? 2.3 : 2.0, 1.4, ramp, { noise: 0.15, seed: near ? 3 : 4 });
  cap(p, L.jx, L.jy, L.ex, L.ey, 1.3, 0.95, ramp);
  cap(p, L.ex, L.ey, fx, fy - 1, 0.95, 0.8, ramp);
  p.rect(fx - 1, fy - 1, 3, 1, GMANE[near ? 2 : 1]);
  p.px(fx + 2, fy - 1, near ? '#cfc6b0' : '#8a8270');                // Krallen
  if (near) p.px(L.jx + 0.5, L.jy + 1, GSPOT);
  if (p.fine) {
    // fein: Zehen getrennt, Krallen gebogen mit Spitze, Fellzotteln an Oberschenkel und Sprunggelenk
    p.dot(fx + 0.5, fy - 1, ramp[1]); p.dot(fx - 0.5, fy - 1, ramp[1]);
    p.dot(fx + 2.5, fy - 0.5, near ? '#8a8270' : '#5a5448'); p.dot(fx + 1.5, fy - 0.5, near ? '#e8e0cc' : '#8a8270');
    const c = near ? ramp[5] : ramp[3], d = ramp[1];
    for (let k = 0; k < 4; k++) { const t = 0.2 + k * 0.2, x = hx + (L.jx - hx) * t, y = hy + (L.jy - hy) * t; p.fline(x - 1, y - 0.5, x - 1.75, y + 0.75, k & 1 ? d : c); }
    p.fline(L.ex - 0.5, L.ey, L.ex - 1.5, L.ey + 1, d);
    if (near) { p.dot(L.jx, L.jy + 1.5, GSPOT); p.dot(L.jx + 1, L.jy + 1, GSPOT); }
  }
}

// Netzbündel mit Steingewichten
function netBundle(p, x, y, r = 2.2, ph = 0) {
  ell(p, x, y, r, r * 0.9, ROPE);
  if (!p.fine) for (let k = -2; k <= 2; k += 2) { p.px(x + k * 0.6, y - 0.5 + k * 0.3, ROPE[1]); p.px(x - k * 0.5, y + 0.6 + k * 0.2, ROPE[1]); }
  for (let i = 0; i < 3; i++) {
    const a = 1.2 + i * 0.7 + Math.sin(ph + i) * 0.2;
    const sx = x + Math.cos(a) * (r + 1.5), sy = y + Math.sin(a) * (r + 1.5);
    p.line(x + Math.cos(a) * r, y + Math.sin(a) * r, sx, sy, ROPE[2]);
    p.px(sx, sy + 0.5, STONE[3]); p.px(sx + 0.6, sy + 0.5, STONE[1]);
    if (p.fine) p.dot(sx, sy + 0.5, STONE[5]);
  }
  if (p.fine) {
    // fein: Maschen als gekreuzte Feinlinien mit Knoten, Licht oben links
    for (const k of [-1, 1]) {
      p.fline(x + k * 1.1 - 0.8, y - r * 0.6, x + k * 1.1 + 0.8, y + r * 0.6, ROPE[1]);
      p.fline(x + k * 1.1 + 0.8, y - r * 0.6, x + k * 1.1 - 0.8, y + r * 0.6, ROPE[1]);
      p.dot(x + k * 1.1, y, ROPE[4]);
    }
    p.dot(x - r * 0.5, y - r * 0.5, ROPE[4]);
  }
}

// Hakenbeil: Holzgriff, Eisenkopf mit Sporn
function hookAxe(p, hx, hy, a) {
  const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
  for (let s = -1.5; s <= 7; s += 0.5) { p.px(hx + dx * s, hy + dy * s, WOODT[3]); p.px(hx + dx * s + nx * 0.7, hy + dy * s + ny * 0.7, WOODT[1]); }
  // Klinge vorn (Bart nach unten), Sporn hinten
  const bx = hx + dx * 6.5, by = hy + dy * 6.5;
  poly(p, [[bx - nx * 0.5, by - ny * 0.5], [bx + dx * 1.5 - nx * 0.5, by + dy * 1.5 - ny * 0.5], [bx + dx * 2 + nx * 3.6, by + dy * 2 + ny * 3.6], [bx - dx * 1.6 + nx * 3.4, by - dy * 1.6 + ny * 3.4]],
    (x, y) => { const d = ((x - bx) * nx + (y - by) * ny); return d > 2.8 ? IRONB[5] : d > 1.6 ? IRONB[4] : IRONB[3]; });
  p.line(bx - nx * 0.5, by - ny * 0.5, bx - nx * 2.6 - dx * 0.8, by - ny * 2.6 - dy * 0.8, IRONB[2]);
  p.px(bx, by, IRONB[1]);
  if (p.fine) {
    // Handfein: Eisen in 5 Stufen – geschliffene Schneide als Glanzlinie (1 Feinpixel), Glanzpunkt,
    // dunkle Schmiedekerbe; Griff mit Maserlinie und Lederwicklung (Punktnaht)
    p.fline(bx + dx * 1.75 + nx * 3.4, by + dy * 1.75 + ny * 3.4, bx - dx * 1.4 + nx * 3.2, by - dy * 1.4 + ny * 3.2, IRONB[5]);
    p.fline(bx + dx * 1.2 + nx * 2.6, by + dy * 1.2 + ny * 2.6, bx - dx * 0.9 + nx * 2.4, by - dy * 0.9 + ny * 2.4, IRONB[4]);
    p.dot(bx - dx * 0.8 + nx * 2.9, by - dy * 0.8 + ny * 2.9, '#ffffff');
    p.fline(bx + dx * 0.4 + nx * 0.5, by + dy * 0.4 + ny * 0.5, bx + dx * 0.4 + nx * 1.8, by + dy * 0.4 + ny * 1.8, IRONB[1]);
    p.dot(bx + dx * 1.2 + nx * 1.2, by + dy * 1.2 + ny * 1.2, IRONB[2]);
    p.fline(hx - dx * 1.2, hy - dy * 1.2, hx + dx * 5.5, hy + dy * 5.5, WOODT[4]);
    for (let s = -1; s <= 1.5; s += 0.5) p.dot(hx + dx * s + nx * 0.35, hy + dy * s + ny * 0.35, (s * 2) & 1 ? HIDE[5] : HIDE[2]);
  }
  return { x: bx + nx * 3.5 + dx, y: by + ny * 3.5 + dy };
}

function drawGnoll(p, g, P, X) {
  const R = rig(P, GD, GS.AX, GS.AY);
  const { hip, pt, shF, shB, armF, armB } = R;
  const meta = {};
  const AY = GS.AY;

  // --- Schwanz (kurz, buschig)
  const tb = pt(0.5, -2.5);
  for (let i = 0; i < 6; i++) {
    const v = i / 6, a = 2.5 + P.tail * 0.6 + Math.sin(P.tailT + v * 2) * 0.25;
    const x = tb.x + Math.cos(a) * i * 0.9, y = tb.y + Math.sin(a) * i * 0.9 + v * v * 1.5;
    ell(p, x, y, 1.2 + v * 0.4, 1.0 + v * 0.3, i > 3 ? GMANE.slice(1) : GFUR_D);
    if (p.fine && i > 1) { const a2 = a + 0.4; p.fline(x, y - 0.5, x + Math.cos(a2) * 1.6, y + Math.sin(a2) * 1.6 - 0.5, i > 3 ? GMANE[4] : GFUR_D[4]); p.fline(x, y + 0.5, x + Math.cos(a) * 1.4, y + Math.sin(a) * 1.4 + 0.5, GMANE[0]); }
  }

  // --- Hinterer Arm mit Netzbündel
  const backArm = () => {
    cap(p, shB.x, shB.y, armB.jx, armB.jy, 1.4, 1.1, GFUR_D);
    cap(p, armB.jx, armB.jy, armB.ex, armB.ey, 1.1, 0.9, GFUR_D);
    if (P.net > 0.5) netBundle(p, armB.ex, armB.ey + 1, 2.3, P.tailT);
    else { p.px(armB.ex + 1, armB.ey, GFUR_D[3]); p.px(armB.ex + 1, armB.ey + 1, GFUR_D[2]); }
  };
  if (P.spin < 0.5) backArm();

  // --- Hinteres Bein
  gnollLeg(p, hip.x - 1, hip.y, GS.AX + P.fBx, AY - P.fBy, GFUR_D, false);

  // --- Rumpf: tiefer Brustkorb, abfallender Rücken, gefleckt
  const hp = pt(0, 0), cp = pt(GD.spine, 0.6);
  cap(p, hp.x, hp.y, cp.x, cp.y, 2.9, 3.8, GFUR, { noise: 0.18, seed: 7 });
  // heller Bauch
  const b0 = pt(1.5, 2), b1 = pt(GD.spine - 1.5, 2.9);
  cap(p, b0.x, b0.y, b1.x, b1.y, 1.0, 1.4, GFUR.slice(3), { bias: 0.1 });
  // Flecken
  if (p.fine) {
    // Handfein: Fell in Strähnen entlang des Rumpfs (oben hell, Bauch dunkel), Flecken als unregelmäßige Tupfen
    const ux = hp.x - cp.x, uy = hp.y - cp.y, ul = Math.hypot(ux, uy) || 1, sx = ux / ul * 1.8, sy = uy / ul * 1.8 + 0.5;
    strands(p, Math.min(hp.x, cp.x) - 4, Math.min(hp.y, cp.y) - 4, Math.max(hp.x, cp.x) + 4, Math.max(hp.y, cp.y) + 4, 60, 7, sx, sy, (x, y, i) => {
      const t = clamp(((x - cp.x) * ux + (y - cp.y) * uy) / (ul * ul), 0, 1), cyy = cp.y + uy * t, d = (y - cyy) / (3.8 - t * 0.9);
      return d < -0.45 ? GFUR[i % 3 ? 5 : 6] : d < 0.2 ? GFUR[i % 2 ? 4 : 2] : GFUR[i % 2 ? 1 : 2];
    }, (x, y) => inCap(x, y, hp.x, hp.y, cp.x, cp.y, 2.4, 3.3));
    for (let i = 0; i < 9; i++) {
      const s = pt(1 + hash2(i, 1, 9) * (GD.spine - 2), -2.5 + hash2(i, 2, 9) * 4);
      p.dot(s.x, s.y, GSPOT); p.dot(s.x + 0.5, s.y, GSPOT); p.dot(s.x + (i & 1 ? 1 : 0), s.y + 0.5, GSPOT); if (i % 3 === 0) p.dot(s.x - 0.5, s.y + 0.5, GSPOT);
    }
  } else for (let i = 0; i < 7; i++) {
    const s = pt(1 + hash2(i, 1, 9) * (GD.spine - 2), -2.5 + hash2(i, 2, 9) * 4);
    p.px(s.x, s.y, GSPOT); if (i % 2) p.px(s.x + 1, s.y, GSPOT);
  }
  // Lendenschurz + Gürtel mit Beuteln
  const belt = pt(0.8, 0);
  for (let i = 0; i < 4; i++) {
    const a = pt(0.5, -1.8 + i * 1.3);
    for (let j = 0; j < 4; j++) p.px(a.x - P.lean * j * 0.7 + Math.sin(P.tailT + i) * 0.2 * j, a.y + j, i % 2 ? HIDE[4] : HIDE[3]);
  }
  p.line(pt(0.8, -3).x, pt(0.8, -3).y, pt(0.8, 3).x, pt(0.8, 3).y, HIDE[2]);
  ell(p, belt.x - 2.2, belt.y + 1.5, 1.3, 1.5, HIDE.slice(1));
  p.px(belt.x + 1.5, belt.y + 1, BONE[3]); p.px(belt.x + 1.5, belt.y + 2, BONE[1]);  // Zahn-Talisman
  if (p.fine) { p.dot(belt.x + 1.25, belt.y + 0.75, BONE[4]); p.dot(belt.x - 2.5, belt.y + 0.5, HIDE[5]); p.dot(belt.x - 2, belt.y + 1, HIDE[0]); }
  // Kreuzgurt über die Brust
  const h0 = pt(GD.spine - 0.5, -2.5), h1 = pt(1.5, 2.8);
  p.line(h0.x, h0.y, h1.x, h1.y, HIDE[4]); p.line(h0.x + 0.6, h0.y + 0.6, h1.x + 0.6, h1.y + 0.6, HIDE[2]);
  const bk = pt(GD.spine * 0.5, 0.3); p.px(bk.x, bk.y, BRZ[4]); p.px(bk.x + 1, bk.y, BRZ[2]);
  if (p.fine) {
    // Kreuzgurt: Naht als Punktlinie, Kratzer; Schnalle mit Glanzpunkt
    for (let t = 0.1; t < 0.95; t += 0.12) p.dot(h0.x + (h1.x - h0.x) * t + 0.25, h0.y + (h1.y - h0.y) * t + 0.25, HIDE[5]);
    p.dot(bk.x, bk.y, BRZ[6]); p.dot(bk.x + 1, bk.y + 0.5, BRZ[1]);
  }

  // --- Netzrolle quer auf dem Rücken
  const nr = pt(GD.spine * 0.55, -3.6);
  ell(p, nr.x, nr.y, 3.8, 2.3, ROPE, { rot: P.lean - 0.3 });
  if (!p.fine) for (let i = -3; i <= 3; i += 1.5) { p.px(nr.x + i, nr.y - 0.8 + i * 0.15, ROPE[1]); p.px(nr.x + i + 0.7, nr.y + 0.6 + i * 0.15, ROPE[1]); }
  p.px(nr.x - 2.5, nr.y + 2, STONE[3]); p.px(nr.x + 1.5, nr.y + 2.3, STONE[2]);
  p.line(nr.x - 3, nr.y, nr.x - 3.5, nr.y + 2.5, HIDE[2]);                   // Halteriemen
  if (p.fine) {
    // Netzrolle: Wicklungen als Feinlinien quer, Knoten hell
    for (const i of [-2.5, -0.5, 1.5]) { p.fline(nr.x + i - 0.4, nr.y - 1.9, nr.x + i + 0.4, nr.y + 1.9, ROPE[0]); p.fline(nr.x + i - 0.9, nr.y - 1.9, nr.x + i - 0.1, nr.y + 1.9, i < 0 ? ROPE[4] : ROPE[3]); }
    p.fline(nr.x - 2.5, nr.y - 1.75, nr.x + 1.5, nr.y - 2.1, ROPE[4]);
  }

  // --- Mähne entlang Rücken und Nacken (borstig, dunkel)
  for (let i = 0; i < 10; i++) {
    const u = 2 + i * 0.85;
    const base = pt(u, -2.8 - (i > 6 ? (i - 6) * 0.4 : 0));
    const L = 2 + (hash2(i, 3, 11) * 2 | 0) + (i > 4 ? 1 : 0);
    const ang = -Math.PI / 2 - P.lean - 0.5 + Math.sin(P.tailT + i) * 0.1;
    if (p.fine) {
      // fein: zwei borstige Strähnen je Büschel, Spitzen heller
      const ex = base.x + Math.cos(ang) * L, ey = base.y + Math.sin(ang) * L;
      p.fline(base.x, base.y + 0.5, ex, ey, GMANE[1 + (i % 2)], 1);
      p.fline(base.x - 0.25, base.y, ex - 0.25, ey, GMANE[3]); p.dot(ex - 0.25, ey - 0.25, GMANE[4]);
      continue;
    }
    for (let s = 0; s < L; s++) p.px(base.x + Math.cos(ang) * s, base.y + Math.sin(ang) * s, GMANE[s === L - 1 ? 4 : 2 + (i % 2)]);
  }

  // --- Vorderes Bein
  gnollLeg(p, hip.x + 1, hip.y, GS.AX + P.fFx, AY - P.fFy, GFUR, true);

  // --- Kopf: Hyänenschädel, tief vor der Brust getragen
  const neck = pt(GD.spine + 1.2, 1.2);
  const hx = neck.x + 2.2 + P.head, hy = neck.y + 0.2 + P.headY;
  cap(p, cp.x, cp.y, hx - 0.5, hy, 2.6, 2.1, GFUR, { noise: 0.12, seed: 13 });
  // Ohren (rund)
  ell(p, hx - 2.4, hy - 3.2 - P.ear, 1.5, 2.1, GFUR_D);
  ell(p, hx - 0.6, hy - 3.6 - P.ear, 1.6, 2.2, GFUR); p.px(hx - 0.6, hy - 3.2 - P.ear, GMANE[1]); p.px(hx - 0.6, hy - 2.4 - P.ear, GMANE[2]);
  ell(p, hx, hy, 3.1, 2.7, GFUR, { noise: 0.12, seed: 15 });
  // Schnauze, dunkle Maske
  const jw = P.jaw;
  cap(p, hx + 1.8, hy + 0.6, hx + 5.6, hy + 1.2, 1.9, 1.4, ['#140e0a', '#22180f', '#33261a', '#4a3a28', '#5e4c36']);
  p.px(hx + 6.6, hy + 0.6, '#050302'); p.px(hx + 6.2, hy + 0.2, '#3a3028');              // Nase
  // Unterkiefer
  const jx1 = hx + 5.2, jy1 = hy + 2.6 + jw * 2.2;
  p.line(hx + 1.6, hy + 2.4, jx1, jy1, '#2a2018'); p.line(hx + 1.8, hy + 3, jx1 - 0.5, jy1 + 0.6, '#1a120c');
  if (jw > 0.25) {
    poly(p, [[hx + 2, hy + 2], [hx + 6, hy + 1.8], [jx1, jy1]], '#4a0e0c');
    p.px(hx + 4, hy + 2, '#f0e8d4'); p.px(hx + 5.5, hy + 2, '#f0e8d4'); p.px(hx + 4, jy1 - 0.5, '#d8d0bc');
  } else { p.px(hx + 4.5, hy + 2.2, '#e8e0cc'); }
  // Auge: bernsteinfarben, böse
  p.px(hx + 1.6, hy - 0.8, P.eye > 0.5 ? '#ffc040' : GFUR[1]); p.px(hx + 2.4, hy - 0.8, P.eye > 0.5 ? '#2a0804' : GFUR[1]);
  if (P.eye > 0.5) g.px(hx + 1.6, hy - 0.8, '#7a4a08');
  p.px(hx + 1.2, hy - 1.8, GMANE[1]); p.px(hx + 2.2, hy - 1.6, GMANE[1]);              // Braue
  if (p.fine) {
    // Handfein: Hyänengesicht – Auge mit Iris, Schlitzpupille, Glanzpunkt und dunklem Lid; harte Braue,
    // Nasenrücken-Licht, Nüstern, Lefze mit Mundwinkel, Reißzähne, Schnurrhaarpunkte, Ohrmuschel, Wangenfell
    if (P.eye > 0.5) {
      p.dot(hx + 1.5, hy - 1, '#ffd870'); p.dot(hx + 1.5, hy - 0.5, '#d88a20'); p.dot(hx + 2, hy - 0.5, '#ffc040');
      p.dot(hx + 2, hy - 1, '#1a0602'); p.dot(hx + 2.5, hy - 0.5, '#2a0804'); p.dot(hx + 1.5, hy - 1, '#fff8e0');
      g.dot(hx + 1.5, hy - 0.5, '#a86a10');
    } else p.fline(hx + 1.25, hy - 0.75, hx + 2.5, hy - 0.5, GFUR[0]);
    p.fline(hx + 1, hy - 1.5, hx + 2.75, hy - 1.25, GMANE[0]); p.dot(hx + 0.75, hy - 2, GFUR[6]);
    p.fline(hx + 3, hy - 0.5, hx + 6, hy + 0.25, '#6e5a42'); p.dot(hx + 6.5, hy + 0.5, '#5a4a3c');
    p.dot(hx + 6.75, hy + 1, '#000000'); p.dot(hx + 6.25, hy + 1, '#1a120c');
    p.fline(hx + 2.5, hy + 2.25, hx + 6, hy + 2, '#0c0806'); p.dot(hx + 2.25, hy + 2.5, '#4a0e0c');
    for (const [x, y] of [[4, 1], [4.75, 1.25], [5.5, 1]]) p.dot(hx + x, hy + y, '#140e0a');
    if (jw > 0.25) { p.fline(hx + 3.5, hy + 2, hx + 3.75, hy + 3, '#f0e8d4'); p.fline(hx + 5.25, hy + 2, hx + 5.25, hy + 2.75, '#f0e8d4'); p.dot(hx + 4.5, jy1 - 1, '#c8c0ac'); p.dot(hx + 4.5, hy + 2.5 + jw, '#8a2a24'); }
    p.dot(hx - 0.75, hy - 3.25 - P.ear, '#5a3a2a'); p.dot(hx - 0.5, hy - 2.75 - P.ear, '#7a4a38'); p.fline(hx - 1.5, hy - 4.5 - P.ear, hx - 0.5, hy - 5.5 - P.ear, GFUR[6]);
    for (let k = 0; k < 4; k++) p.fline(hx - 1.5 + k * 0.5, hy + 1.5, hx - 2 + k * 0.5, hy + 3, k & 1 ? GFUR[2] : GFUR[4]);
  }
  // Nackenmähne vor dem Hals
  if (p.fine) for (let i = 0; i < 7; i++) { const m = pt(GD.spine + 0.3 + i * 0.3, -1.8 + i * 0.45); p.fline(m.x, m.y - 1, m.x - 0.8, m.y - 3, i & 1 ? GMANE[2] : GMANE[4]); }
  else for (let i = 0; i < 4; i++) { const m = pt(GD.spine + 0.3 + i * 0.5, -1.8 + i * 0.7); p.px(m.x, m.y - 1.5, GMANE[3]); p.px(m.x - 0.6, m.y - 2.5, GMANE[2]); }
  meta.eye = { x: hx + 2, y: hy - 1 };
  meta.head = { x: hx - 0.5, y: hy - 6 };
  meta.mouth = { x: hx + 5, y: hy + 2 };

  // --- Wurfarm über dem Kopf (beim Wurf vor dem Körper)
  if (P.spin >= 0.5) backArm();
  meta.hand = P.net > 0.5 || P.spin >= 0.5 ? { x: armB.ex, y: armB.ey + 1 } : { x: armF.ex, y: armF.ey };

  // --- Vorderer Arm mit Hakenbeil
  if (X.smear) smearArc(p, g, shF.x, shF.y + 1, X.smear[0], X.smear[1], 8, 14, ['#5e6070', '#a8aab6', '#eef0f6'], null, X.smear[2] ?? 1);
  const tip = hookAxe(p, armF.ex, armF.ey, P.wa);
  cap(p, shF.x, shF.y, armF.jx, armF.jy, 1.6, 1.3, GFUR);
  cap(p, armF.jx, armF.jy, armF.ex, armF.ey, 1.3, 1.1, GFUR);
  const wr = { x: armF.jx + (armF.ex - armF.jx) * 0.55, y: armF.jy + (armF.ey - armF.jy) * 0.55 };
  p.px(wr.x, wr.y, HIDE[4]); p.px(wr.x + 0.7, wr.y + 0.5, HIDE[2]);              // Armwickel
  ell(p, armF.ex, armF.ey, 1.3, 1.2, GFUR); p.px(armF.ex + 1, armF.ey + 1, '#cfc6b0');
  ell(p, shF.x, shF.y, 2, 1.6, GMANE.slice(1));                                     // Schulterfell
  if (p.fine) {
    for (let k = -1.5; k <= 1.5; k += 0.5) p.fline(shF.x + k, shF.y - 1, shF.x + k - 0.5, shF.y + 1.5 + Math.abs(k) * 0.4, k < 0 ? GMANE[4] : GMANE[2]);
    p.dot(armF.ex - 0.5, armF.ey - 0.5, GFUR[6]); p.dot(armF.ex + 1.5, armF.ey + 1, '#8a8270'); p.dot(wr.x - 0.25, wr.y - 0.25, HIDE[5]);
  }
  if (P.net > 0.5 || P.spin >= 0.5) meta.tip = tip; else meta.tip = tip;
  if (X.dust) dust(p, GS.AX + X.dust, AY, 7, 5, DUSTC, 12);
  return meta;
}

function gnollAnims() {
  const mk = (P, X) => makeFrame(GS, drawGnoll, P, X);
  const idleA = gpose();
  const idle = track(mk, cycle((ph) => {
    const s = Math.sin(ph), c = Math.cos(ph);
    return gpose({ hipY: (1 - c) * 0.35, lean: 0.42 + s * 0.03, headY: -Math.max(0, s) * 0.8, head: Math.max(0, -s) * 0.5, tailT: ph, tail: s * 0.3, hFy: 8.5 + s * 0.5, hBy: 6.5 + c * 0.4, ear: Math.max(0, s) * 0.5, jaw: Math.max(0, -c) * 0.3 });
  }, 6), 6, { loop: true });
  const walk = track(mk, walkKeys(idleA, 8, {
    stride: 4.6, lift: 2.6, bob: 1.2, arm: 2,
    extra: (ph, s, c) => ({ lean: 0.52, tailT: ph * 2, tail: 0.5 + s * 0.3, headY: Math.abs(c) * 0.6, wa: 0.75 + s * 0.15 }),
  }), 8, { loop: true, extras: { 0: { fx: 'step' }, 4: { fx: 'step' } } });
  // Nahkampf: Beil hoch, ducken, dann von oben herunterreißen
  const w1 = gpose({ lean: 0.4, hipY: 1, hFx: 1, hFy: -4, wa: -2.2, hBx: 2, hBy: 4, jaw: 0.6, ear: 1, fFx: 4.5, fBx: -4 });
  const w2 = gpose({ lean: 0.28, hipY: 1.5, hipX: -1, hFx: -2, hFy: -6, wa: -2.9, hBx: 3, hBy: 3, jaw: 1, ear: 1, fFx: 5, fBx: -4.5, tail: 1 });
  const windup = track(mk, [[0, idleA], [0.45, w1], [1, w2]], 4);
  const s1 = gpose({ lean: 0.7, hipX: 1.5, hFx: 6, hFy: -2, wa: -1.2, hBx: -1, hBy: 6, jaw: 1, fFx: 6.5, fBx: -5, tail: 1 });
  const s2 = gpose({ lean: 0.9, hipX: 3, hipY: 1.5, hFx: 8, hFy: 8, wa: 0.6, hBx: -2, hBy: 7, jaw: 0.8, fFx: 7.5, fBx: -5.5, tail: 1.2 });
  const s3 = gpose({ lean: 0.85, hipX: 2.5, hipY: 1.5, hFx: 6, hFy: 10, wa: 1.2, hBx: -1, hBy: 7, jaw: 0.4, fFx: 7.5, fBx: -5.5 });
  const strike = [
    mk(s1, { smear: [-2.6, -1.2] }), mk(s2, { smear: [-2.2, 0.6], fx: 'impact', dust: 10 }),
    mk(s3, { smear: [-0.5, 1.2] }), mk(mixP(s3, idleA, 0.55)),
  ];
  // Netzwurf: Bündel kreist hinten, Ausfallschritt, Wurf über Kopf
  const t1 = gpose({ lean: 0.45, hBx: -6, hBy: 2, wa: -0.6, hFx: 5, hFy: 5, ear: 0.6, jaw: 0.3, tailT: 1 });
  const t2 = gpose({ lean: 0.3, hipX: -1.5, hipY: 0.5, hBx: -7, hBy: -5, spin: 1, wa: -0.4, hFx: 6, hFy: 3, jaw: 0.6, ear: 1, fFx: 5, fBx: -4.5, tailT: 2 });
  const t3 = gpose({ lean: 0.4, hipX: -1, hBx: -3, hBy: -9, spin: 1, wa: -0.3, hFx: 6, hFy: 4, jaw: 1, ear: 1, fFx: 5.5, fBx: -5, tailT: 3 });
  const t4 = gpose({ lean: 0.75, hipX: 2.5, hipY: 1, hBx: 9, hBy: -2, spin: 1, net: 0, wa: -0.2, hFx: 2, hFy: 7, jaw: 1, fFx: 7, fBx: -5, tail: 1, tailT: 4 });
  const t5 = gpose({ lean: 0.78, hipX: 2.5, hipY: 1, hBx: 8, hBy: 5, spin: 1, net: 0, wa: -0.6, hFx: 3, hFy: 7, jaw: 0.6, fFx: 7, fBx: -5, tailT: 5 });
  const t6 = { ...mixP(t5, idleA, 0.6), net: 0, spin: 0 };
  const throwA = [mk(t1), mk(t2), mk(t3), mk(t4, { fx: 'cast', dust: 6 }), mk(t5), mk(t6)];
  const hurtP = gpose({ lean: 0.35, hipX: -1.5, head: -1, headY: -1, jaw: 1, eye: 0.3, ear: -0.5, hFx: 2, hFy: 4, hBx: -2, hBy: 4, wa: -1.6, tail: -0.5 });
  const hurt = [mk(hurtP), mk(mixP(hurtP, idleA, 0.5))];
  // Tod: aufjaulen, rückwärts auf die Seite
  const d1 = gpose({ ...hurtP, lean: 0.2, headY: -2, jaw: 1 });
  const d2 = gpose({ lean: 0.1, hipY: 2.5, hipX: -1, fFx: 4.5, fBx: -3, hFx: 4, hFy: 7, hBx: 1, hBy: 7, jaw: 1, eye: 0.3, head: -0.5, headY: -1.5, wa: 1.3, net: 0, tail: -0.5 });
  const flat = { ...d2, hipY: 3, lean: 0.2, head: 0.8, headY: 0.5, eye: 0, jaw: 0.7, hFx: 5, hFy: 9, hBx: 3, hBy: 9 };
  const piv = [GS.AX - 3, GS.AY - 1];
  const death = [
    mk(d1), mk(d2), mk(flat, { rot: [-0.5, ...piv] }), mk(flat, { rot: [-1.1, ...piv] }),
    mk(flat, { rot: [-1.5, piv[0], piv[1] - 0.5], fx: 'impact', dust: -2 }),
    mk({ ...flat, jaw: 0.4, hFy: 10 }, { rot: [-Math.PI / 2, piv[0], piv[1] - 0.5] }),
  ];
  return {
    idle: new Animation(idle, 6),
    walk: new Animation(walk, 11),
    windup: new Animation(windup, 8, false),
    strike: new Animation(strike, 14, false),
    throw: new Animation(throwA, 10, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 9, false),
  };
}

// ================================================================ Moorschleim (+ kleiner Moorschleim)

const RIM_MARSH = { c: [200, 226, 170], k1: 0.3, k2: 0.16 };
const SLIME = ['#0c1a0e', '#143020', '#1d4528', '#285c30', '#357638', '#4c9040', '#6eac50', '#9ccc70'];
const MURK = ['#0a140c', '#112218', '#18301e', '#204026', '#2a502c'];
const BSUB = ['#3e4a30', '#5e6a46', '#808c5e', '#a4ae7a', '#c4cc98'];   // Knochen im Schleim
const SGLOW = ['#0a2a10', '#1a5a20', '#3a9a30', '#8ae060', '#e0ffb0'];
const S_REST = { sq: 0, lean: 0, ph: 0, wob: 1, pod: 0, podY: 0, melt: 0, hurt: 0, spill: 0, open: 0 };
const slp = (o = {}) => ({ ...S_REST, ...o });

function drawSlime(p, g, P, X, S, sc) {
  const meta = {};
  const cx = S.AX, gy = S.AY;
  const melt = P.melt;
  const wb = 13 * sc * (1 + P.sq * 0.28) * (1 + melt * 0.6);
  const h = 17 * sc * (1 - P.sq * 0.3) * (1 - melt * 0.78);
  const offAt = (v) => P.lean * h * v * v * 0.55 + Math.sin(P.ph + v * 4.2) * 0.6 * P.wob * sc;
  const widthAt = (v) => wb * Math.pow(Math.max(0, 1 - Math.pow(v, 2.4)), 0.5) * (1 + 0.07 * Math.sin(P.ph * 2 + v * 6) * P.wob);

  // --- Schleimspur / Pfütze am Boden
  oval(p, cx + P.lean * 1.5 - 1, gy - 0.5, wb + 2.5 + melt * 4, 1.6 + melt, SLIME[1]);
  oval(p, cx + P.lean * 1.5 - 1, gy - 0.5, wb + 0.5 + melt * 3, 1, SLIME[2]);
  if (p.fine) { p.fline(cx + P.lean * 1.5 - wb - 1.5 - melt * 3, gy - 1, cx + P.lean * 1.5 - wb * 0.4, gy - 1.5, SLIME[4]); p.dot(cx + P.lean * 1.5 + wb + 1 + melt * 3, gy, SLIME[3]); }   // nasser Glanz auf der Pfütze

  // --- Scheinfüßchen (hinter dem Körper ansetzen)
  if (P.pod > 0.05) {
    const px0 = cx + wb * 0.5, py0 = gy - h * 0.55;
    const px1 = cx + wb * 0.6 + P.pod * 13 * sc, py1 = gy - h * 0.55 + P.podY * sc;
    cap(p, px0, py0, px1, py1, 3.2 * sc, 2.4 * sc, SLIME.slice(1), { noise: 0.2, seed: 5 });
    ell(p, px1 + 0.5, py1, 3.0 * sc, 2.6 * sc, SLIME.slice(1), { noise: 0.2, seed: 6 });
    meta.tip = { x: px1 + 2 * sc, y: py1 };
  }

  // --- Körper: Kuppel, Rand satt und hell, Mitte trüb (durchscheinend)
  // Maske im Pixelraster der Leinwand (fein: Feinpixel q = 1/2); fein ohne Rauschen, harte Stufen
  // Maske als Raster (Zelle = Rasterpixel i = x/q, j = y/q), 1 Zelle Rand für Nachbarabfragen
  const q = p.step ?? 1;
  const top = Math.floor(gy - h - 2), bot = gy - 1;
  const mI0 = Math.round(Math.floor(cx - wb - 4) / q) - 1, mJ0 = Math.round(top / q) - 1;
  const mW = Math.round(Math.ceil(cx + wb + 6) / q) - mI0 + 2, mH = Math.round(bot / q) - mJ0 + 2;
  const grid = new Uint8Array(mW * mH);
  const has = (i, j) => { i -= mI0; j -= mJ0; return i >= 0 && j >= 0 && i < mW && j < mH && grid[j * mW + i] === 1; };
  if (p.fine) {
    // fein: dieselben Formeln, Zeilenwerte vorab, Farben als Uint32 direkt in den Puffer (je Feinpixel ein put)
    const S32 = SLIME.map(col32), M32 = MURK.map(col32), bias = 0.06 + P.hurt * 0.25, murk = P.hurt < 0.5, n = SLIME.length;
    const r = p.res, xs = Math.floor(cx - wb - 4), xe = Math.ceil(cx + wb + 6), buf = p.buf, BW = p.W, BH = p.H;
    p.dirty = true;
    for (let y = top; y <= bot; y += q) {
      const v = (gy - q / 2 - y) / h;
      if (v < 0 || v > 1) continue;
      const w = widthAt(v), ox = offAt(v), G = Math.floor((y + q / 2 + p.oy) * r + 1e-6);
      const ny = -clamp(v * 1.15 - 0.25, -0.6, 1), nyL = ny * LY, ny2 = ny * ny * 0.55, dv = (v - 0.42) / 0.55, dv2 = dv * dv;
      const jr = (Math.round(y / q) - mJ0) * mW - mI0;
      // nur die Spalten, in denen |u| ≤ 1 möglich ist (±1 Rasterpixel Rand), statt der ganzen Breite
      const ww = w || 0.01, k0 = Math.max(0, Math.ceil((cx + ox - ww - q / 2 - xs) / q) - 1), k1 = Math.min((xe - xs) / q, Math.floor((cx + ox + ww - q / 2 - xs) / q) + 1);
      for (let kk = k0; kk <= k1; kk++) {
        const x = xs + kk * q, u = (x + q / 2 - (cx + ox)) / ww;
        if (Math.abs(u) > 1) continue;
        grid[jr + Math.round(x / q)] = 1;
        const nx = u * 0.95, z2 = 1 - nx * nx - ny2, nz = z2 > 0 ? Math.sqrt(z2) : 0, du = u * 1.05, d = Math.sqrt(du * du + dv2);
        let c, k;
        if (d < 0.72 && murk) {
          k = Math.floor((0.72 - d) * 9 + 0.5); k = 4 - (k < 0 ? 0 : k > 4 ? 4 : k) + (nx < -0.2 ? 1 : 0);
          c = M32[k < 0 ? 0 : k > 4 ? 4 : k];
        } else {
          k = Math.floor((0.28 + 0.62 * (nx * LX + nyL + nz * LZ) + bias) * n);
          c = S32[k < 0 ? 0 : k > n - 1 ? n - 1 : k];
        }
        const F = Math.floor((x + q / 2 + p.ox) * r + 1e-6);
        if (F >= 0 && F < BW && G >= 0 && G < BH) buf[G * BW + F] = c;
      }
    }
  } else for (let y = top; y <= bot; y += q) {
    const v = (gy - q / 2 - y) / h;
    if (v < 0 || v > 1) continue;
    const w = widthAt(v), ox = offAt(v);
    for (let x = Math.floor(cx - wb - 4); x <= Math.ceil(cx + wb + 6); x += q) {
      const u = (x + q / 2 - (cx + ox)) / (w || 0.01);
      if (Math.abs(u) > 1) continue;
      grid[(Math.round(y / q) - mJ0) * mW + Math.round(x / q) - mI0] = 1;
      const nx = u * 0.95, ny = -clamp(v * 1.15 - 0.25, -0.6, 1), nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny * 0.55));
      const du = u * 1.05, dv = (v - 0.42) / 0.55, d = Math.sqrt(du * du + dv * dv);
      let col;
      if (d < 0.72 && P.hurt < 0.5) {
        const k = clamp(Math.floor((0.72 - d) * 9 + (p.fine ? 0.5 : hash2(x, y, 9) * 1.2)), 0, 4);
        col = MURK[clamp(4 - k + (nx < -0.2 ? 1 : 0), 0, 4)];
      } else col = tone(SLIME, nx, ny, nz, 0.06 + P.hurt * 0.25, p.fine ? 0 : (hash2(x - cx + 40, y - gy + 40, 7) - 0.5) * 0.12);
      if (q < 1) p.dot(x + q / 2, y + q / 2, col); else p.px(x, y, col);
    }
  }
  const inside = (x, y) => has(Math.round(x / q), Math.round(y / q));
  // Kleiner Schleim: heller Saum an der Oberkante und grünes Glühen, damit er im Gewimmel lesbar bleibt
  if (sc < 0.9 && melt < 0.8 && p.fine) {
    // fein: Glanzlinie 1 Feinpixel, darunter eine Stufe dunkler (harter Saum), Leuchtsaum; Oberkanten-Zellen direkt
    // aus dem Raster (Randzellen sind nie belegt), Farben als Uint32
    const L7 = col32(SLIME[7]), L6 = col32(SLIME[6]), L5 = col32(SLIME[5]), G0 = col32(SGLOW[0]), G1 = col32(SGLOW[1]), G2 = col32(SGLOW[2]);
    for (let jj = 1; jj < mH - 1; jj++) for (let ii = 1; ii < mW - 1; ii++) {
      const c = jj * mW + ii;
      if (!grid[c] || grid[c - mW]) continue;
      const x = ii + mI0, y = jj + mJ0, left = !grid[c - 1] || !grid[c - mW - 1];
      const F = p.F(x * q + q / 2), G = p.G(y * q + q / 2);
      p.put(F, G, left ? L7 : L6);
      if (grid[c + mW]) p.put(F, G + 1, left ? L6 : L5);
      const gF = g.F(x * q + q / 2), gG = g.G(y * q + q / 2);
      g.put(gF, gG, left ? G2 : G1);
      if (hash2(Math.floor(x * q), Math.floor(y * q), 31) > 0.5) g.put(gF, gG - 1, G0);
    }
    if (melt < 0.2) glowDot(g, cx + offAt(0.5), gy - h * 0.5, Math.min(h * 0.6, wb * 0.7) * (1 - P.hurt * 0.5), ['#04140a', '#08200e', '#0c2c12', '#103816']);
  } else if (sc < 0.9 && melt < 0.8) {
    for (let jj = 0; jj < mH; jj++) for (let ii = 0; ii < mW; ii++) {
      if (!grid[jj * mW + ii]) continue;
      const x = ii + mI0, y = jj + mJ0;
      if (has(x, y - 1)) continue;
      const left = !has(x - 1, y) || !has(x - 1, y - 1);
      p.px(x, y, left ? SLIME[7] : SLIME[6]);
      g.px(x, y, SGLOW[left ? 2 : 1]);
      if (hash2(x, y, 31) > 0.5) g.px(x, y - 1, SGLOW[0]);
    }
    if (melt < 0.2) glowDot(g, cx + offAt(0.5), gy - h * 0.5, Math.min(h * 0.6, wb * 0.7) * (1 - P.hurt * 0.5), ['#04140a', '#08200e', '#0c2c12', '#103816']);
  }
  const sub = (x, y, c) => { if (inside(x, y)) p.px(x, y, c); };

  // --- Eingeschlossene Knochen (gedämpft, wie unter Wasser)
  const sx = cx + offAt(0.58) + 4 * sc, sy = gy - h * 0.58;
  const big = sc > 0.7;
  const skull = (x, y, under) => {
    const put = under ? sub : (a, b, c) => p.px(a, b, c);
    const C = under ? BSUB : [BONE[0], BONE[1], BONE[2], BONE[3], BONE[4]];
    const rx = big ? 3.2 : 2.2, ry = big ? 2.6 : 1.8;
    if (p.fine) {
      // Handfein: Schädel fein gerundet, Stirnglanz, Augenhöhlen und Nasenloch geformt, Zähne einzeln
      const ok = (X, Y) => !under || inside(X, Y);
      p.each(x - rx, y - ry - 1, x + rx + 1, y + ry, (X, Y) => {
        const u = (X - x - 0.5) / rx, v = (Y - y) / ry;
        if (u * u + v * v > 1 || !ok(X, Y)) return null;
        return v < -0.55 ? (u < 0.1 ? C[4] : C[3]) : u < -0.2 ? C[3] : v > 0.5 ? C[1] : C[2];
      });
      const jy = y + (big ? 3 : 2);
      for (let xx = -1; xx <= (big ? 3.5 : 2.5); xx += 0.5) { if (ok(x + xx, jy)) p.dot(x + xx, jy, Math.round(xx * 2) % 2 ? C[1] : C[4]); if (ok(x + xx, jy + 0.5)) p.dot(x + xx, jy + 0.5, C[2]); }
      const e = big ? 1.5 : 1;
      for (const ex of [x + e, x - e + 0.5]) for (const [a, b] of [[0, 0], [0.5, 0], [0, 0.5], [0.5, 0.5]]) if (ok(ex + a, y + b - 0.5)) p.dot(ex + a, y + b - 0.5, '#081008');
      if (ok(x + 0.5, y + 1.5)) { p.dot(x + 0.5, y + 1, '#1a2414'); p.dot(x + 1, y + 1.5, '#1a2414'); }
      return;
    }
    for (let yy = -3; yy <= 2; yy++) for (let xx = -3; xx <= 3; xx++) {
      if ((xx * xx) / (rx * rx) + ((yy + 0.5) * (yy + 0.5)) / (ry * ry) > 1) continue;
      put(x + xx, y + yy, yy < -1 ? C[4] : xx < 0 ? C[3] : C[2]);
    }
    // Kiefer mit Zähnen
    for (let xx = -1; xx <= (big ? 3 : 2); xx++) put(x + xx, y + (big ? 3 : 2), xx % 2 ? C[1] : C[3]);
    put(x + (big ? 3 : 2), y + 1, C[2]);
    const e = big ? 1.5 : 1;
    put(x + e, y - 0, '#081008'); put(x - e + 0.5, y, '#081008'); if (big) { put(x + e, y - 1, '#081008'); put(x - 1, y - 1, '#081008'); }
    put(x + 0.5, y + 1.5, '#1a2414');                                     // Nasenloch
  };
  if (sc > 0.9) {
    // Rippenbogen
    const rx = cx + offAt(0.3) - 5 * sc, ry = gy - h * 0.28;
    for (let r = 0; r < 3; r++) for (let a = 0; a < 6; a++) {
      const t = a / 5;
      sub(rx - 3 + a * 0.9 + r * 0.4, ry - 3 + r * 2.2 + Math.sin(t * Math.PI) * -1.5, r === 0 ? BSUB[3] : BSUB[2]);
    }
    for (let k = 0; k < 6; k++) sub(rx - 3.5 + k * 0.1, ry - 3 + k, BSUB[1]);               // Wirbelsäule
    // Oberschenkelknochen quer
    for (let k = 0; k <= 8; k++) sub(cx - 6 * sc + k, gy - 3 - k * 0.35 + P.spill * 2, k === 0 || k === 8 ? BSUB[4] : BSUB[2]);
    // Schwert-/Speerrest
    for (let k = 0; k < 5; k++) sub(cx + offAt(0.8) - 2 + k * 0.5, gy - h * 0.82 + k, '#5a6a6e');
  } else {
    for (let k = 0; k <= 4; k++) sub(cx - 2 + k, gy - 2 - k * 0.3, k === 0 || k === 4 ? BSUB[4] : BSUB[2]);   // Rattenknochen
  }
  if (P.spill < 0.5) skull(Math.round(sx), Math.round(sy), true);

  // --- Augenhöhlen glimmen sumpfgrün
  if (P.spill < 0.5 && melt < 0.7) {
    const e = big ? 2 : 1;
    g.px(Math.round(sx) + e, Math.round(sy), SGLOW[3]); g.px(Math.round(sx) - e + 1, Math.round(sy), SGLOW[2]);
    if (sc < 0.9) { g.px(Math.round(sx) + e, Math.round(sy) - 1, SGLOW[1]); g.px(Math.round(sx) - e + 1, Math.round(sy) - 1, SGLOW[1]); }
    p.px(Math.round(sx) + e, Math.round(sy), SGLOW[3]); p.px(Math.round(sx) - e + 1, Math.round(sy), SGLOW[2]);
    if (p.fine) {
      // Augenglut: heller Kern (1 Feinpixel) im grünen Saum
      for (const ex of [Math.round(sx) + e, Math.round(sx) - e + 1]) { p.dot(ex + 0.25, sy + 0.25, SGLOW[4]); g.dot(ex + 0.25, sy + 0.25, SGLOW[4]); }
    }
  }
  meta.eye = { x: Math.round(sx) + 1, y: Math.round(sy) };
  meta.head = { x: cx + offAt(1), y: gy - h - 1 };
  meta.mouth = { x: cx + offAt(0.5) + widthAt(0.5), y: gy - h * 0.5 };
  meta.hand = meta.tip ?? meta.mouth;

  // --- Blasen steigen auf
  for (let i = 0; i < (sc > 0.9 ? 4 : 3); i++) {
    const u = ((P.ph / TAU) * 0.9 + i * 0.27 + hash2(i, 1, 21) * 0.2) % 1;
    const bx = cx + offAt(u) + (hash2(i, 2, 21) - 0.5) * wb * 1.1, by = gy - 2 - u * (h - 3);
    if (!inside(bx, by)) continue;
    if (p.fine) {
      // Blase hart umrandet: Ring hell, Inneres eine Stufe tiefer, Glanzpunkt oben links, Schatten unten rechts
      const r = i % 2 === 0 ? 1 : 0.5, ring = r > 0.5 ? [[-0.5, -1], [0, -1], [0.5, -0.5], [0.5, 0], [0, 0.5], [-0.5, 0.5], [-1, 0], [-1, -0.5]] : [[0, -0.5], [0.5, 0], [0, 0.5], [-0.5, 0]];
      for (const [a, b] of ring) if (inside(bx + a, by + b)) p.dot(bx + a, by + b, b < 0 || a < 0 ? SLIME[7] : SLIME[5]);
      if (r > 0.5) { p.dot(bx, by - 0.5, SLIME[4]); p.dot(bx - 0.5, by, SLIME[4]); p.dot(bx, by, SLIME[3]); }
      p.dot(bx - (r > 0.5 ? 0.5 : 0), by - (r > 0.5 ? 0.5 : 0), '#f4ffe0');
      if (inside(bx + 1, by + 1)) p.dot(bx + 1, by + 1, SLIME[2]);
      if (i % 2 === 0) { g.dot(bx - 0.5, by - 0.5, SGLOW[2]); g.dot(bx, by, SGLOW[1]); }
      continue;
    }
    p.px(bx, by, SLIME[7]); sub(bx + 1, by + 1, SLIME[4]);
    if (i % 2 === 0) g.px(bx, by, SGLOW[1]);
  }
  // --- Glanzlicht oben links (nasse Haut)
  if (melt < 0.8) {
    const hx = cx + offAt(0.78) - widthAt(0.78) * 0.45, hy = gy - h * 0.78;
    if (p.fine) {
      // Glanzpunkt: harter Lichtfleck (Bogen) plus weißer Funke, Glanzlinie an der Kuppe
      const subd = (x, y, c) => { if (inside(x, y)) p.dot(x, y, c); };
      const sc2 = sc > 0.9 ? 1 : 0.75;
      p.each(hx - 3, hy - 3, hx + 3, hy + 3, (x, y) => {
        const u = (x - hx) * 0.92 + (y - hy) * 0.4, v = -(x - hx) * 0.4 + (y - hy) * 0.92;
        const d = (u * u) / (2.2 * sc2 * 2.2 * sc2) + (v * v) / (0.95 * sc2 * 0.95 * sc2);
        if (d > 1 || !inside(x, y)) return null;
        return d < 0.3 && u < 0.4 ? '#ffffff' : v < 0 ? '#e8f8c8' : '#b4dc90';
      });
      subd(hx + 2.5 * sc2, hy + 1.5, '#d0ecaa'); subd(hx + 3 * sc2, hy + 1.5, '#b4dc90');
      for (let v = 0.5; v <= 0.92; v += 0.04) subd(cx + offAt(v) - widthAt(v) * 0.86 + 0.25, gy - h * v, SLIME[7]);
    } else { sub(hx, hy, '#e8f8c8'); sub(hx + 1, hy - 1, '#d0ecaa'); sub(hx - 1, hy + 1, '#b4dc90'); sub(hx + 2, hy - 1, SLIME[7]); }
  }
  // --- Tropfen am Rand
  for (let i = 0; i < 3; i++) {
    const side = i === 1 ? 1 : -1;
    const v = 0.15 + i * 0.12;
    const dx = cx + offAt(v) + side * widthAt(v) + side * 0.5, dy = gy - h * v + ((P.ph + i) % 1.6);
    if (p.fine) { p.dot(dx, dy, SLIME[4]); p.dot(dx + 0.5, dy, SLIME[3]); p.dot(dx, dy + 0.5, SLIME[3]); p.dot(dx + 0.5, dy + 0.5, SLIME[2]); p.dot(dx, dy + 1, SLIME[3]); p.dot(dx, dy + 1.5, SLIME[2]); p.dot(dx - 0.25 + 0.25, dy, SLIME[6]); continue; }   // Tropfen mit Glanz
    p.px(dx, dy, SLIME[3]); p.px(dx, dy + 1, SLIME[2]);
  }
  // --- verschütteter Schädel (Tod)
  if (P.spill >= 0.5) {
    const kx = cx + wb * 0.6 + 2, ky = gy - 3;
    skull(kx, ky, false);
    p.px(kx + 1, ky, '#100c08'); p.px(kx - 1, ky, '#100c08');
    meta.eye = { x: kx + 1, y: ky };
  }
  if (X.splash) {
    const fx = meta.tip ? meta.tip.x : cx + wb;
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI * (0.1 + hash2(i, 1, 3) * 0.8), r = 3 + hash2(i, 2, 3) * 5 * sc + X.splash;
      if (p.fine) { const x = fx + Math.cos(a) * r, y = gy - 2 + Math.sin(a) * r * 0.8; p.dot(x, y, SLIME[7]); p.dot(x + 0.5, y, SLIME[4 + (i % 3)]); p.dot(x, y + 0.5, SLIME[4 + (i % 3)]); p.dot(x + 0.5, y + 0.5, SLIME[3]); continue; }
      p.px(fx + Math.cos(a) * r, gy - 2 + Math.sin(a) * r * 0.8, SLIME[4 + (i % 3)]);
    }
  }
  return meta;
}

function slimeAnims(sc) {
  const S = sc > 0.9 ? { W: 56, H: 36, AX: 26, AY: 32, pad: 10, rim: RIM_MARSH } : { W: 46, H: 30, AX: 21, AY: 26, pad: 9, rim: RIM_MARSH };
  const mk = (P, X) => makeFrame(S, (p, g, PP, XX) => drawSlime(p, g, PP, XX, S, sc), P, X);
  const idle = track(mk, cycle((ph) => slp({ sq: Math.sin(ph) * 0.12, ph: ph * 1, lean: Math.sin(ph + 1) * 0.08 }), 6), 6, { loop: true });
  // Kriechen: Front schiebt vor, Körper zieht nach (Raupenwelle)
  const walk = track(mk, cycle((ph) => slp({ sq: Math.sin(ph) * 0.24, lean: 0.25 + Math.cos(ph) * 0.25, ph: ph * 2, wob: 1.3 }), 6), 6, { loop: true });
  // Ausholen: zusammenziehen, hoch aufbäumen, Scheinfuß hinten
  const w1 = slp({ sq: 0.35, lean: -0.3, ph: 1, wob: 0.6 });
  const w2 = slp({ sq: -0.3, lean: -0.5, ph: 2, wob: 0.4, pod: 0.25, podY: -6 });
  const windup = track(mk, [[0, idle[0] ? slp() : slp()], [0.5, w1], [1, w2]], 4);
  // Stoß: nach vorn schnellen, Scheinfuß klatscht auf den Boden
  const s1 = slp({ sq: 0.1, lean: 0.8, ph: 3, wob: 1.4, pod: 0.8, podY: -4 });
  const s2 = slp({ sq: 0.35, lean: 1.0, ph: 3.5, wob: 1.6, pod: 1.0, podY: 3.5 });
  const s3 = slp({ sq: 0.2, lean: 0.6, ph: 4, wob: 1.2, pod: 0.6, podY: 4 });
  const strike = [mk(s1), mk(s2, { fx: 'impact', splash: 1 }), mk(s3, { splash: 3 }), mk(slp({ sq: -0.05, lean: 0.2, ph: 5, pod: 0.15, podY: 2 }))];
  const hurt = [mk(slp({ sq: 0.4, lean: -0.3, ph: 2, wob: 1.8, hurt: 1 })), mk(slp({ sq: -0.2, lean: -0.1, ph: 3, wob: 1.4 }))];
  // Tod: in sich zusammenfallen, Knochen rutschen heraus
  const death = [
    mk(slp({ sq: 0.45, lean: -0.2, ph: 1, wob: 2, hurt: 1 })),
    mk(slp({ sq: -0.25, ph: 2, wob: 1.6 })),
    mk(slp({ sq: 0.3, ph: 3, wob: 1.2, melt: 0.35 }), { fx: 'impact', splash: 2 }),
    mk(slp({ sq: 0.3, ph: 4, wob: 0.8, melt: 0.65, spill: 1 })),
    mk(slp({ sq: 0.3, ph: 5, wob: 0.5, melt: 0.85, spill: 1 })),
    mk(slp({ sq: 0.3, ph: 5.5, wob: 0.2, melt: 0.95, spill: 1 })),
  ];
  return {
    idle: new Animation(idle, 6),
    walk: new Animation(walk, 8),
    windup: new Animation(windup, 7, false),
    strike: new Animation(strike, 12, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 8, false),
  };
}

// ================================================================ Sumpfhexe

const HS2 = { W: 64, H: 60, AX: 28, AY: 54, pad: 12, rim: RIM_MARSH, sinkH: 38 };
const HGD = { legH: 12, thigh: 6, shin: 6.5, spine: 11, upper: 5.2, fore: 5.6, sh: 1.5, hipW: 1 };
const HSK = ['#26302a', '#3e4c40', '#5c6c5a', '#7e8e78', '#a2b09a', '#c8d2bc'];
const SHAWL = ['#121a10', '#1e2c1a', '#2c4024', '#3c5630', '#506e3c', '#6a8a4c'];
const RAGS = ['#100c0a', '#1c1612', '#29211a', '#382d23', '#493b2e'];
const TWIG = ['#1a140e', '#2e241a', '#4a3c2c', '#66553f', '#857156'];
const LGLOW = ['#0c260c', '#226014', '#5aa820', '#bce848', '#f4ffc0'];
const IRONL = ['#121414', '#222624', '#363c38', '#525a52', '#76806e'];
const HG_REST = {
  hipX: 0, hipY: 0, lean: 0.3, head: 0, headY: 0, fFx: 2.5, fFy: 0, fBx: -2.5, fBy: 0,
  hFx: 8, hFy: 3, hBx: 3, hBy: 8, la: -1.1, lsw: 0, flame: 1, hairT: 0, hem: 0, eye: 1, jaw: 0, claw: 0.3, held: 1,
};
const hgp = (o = {}) => ({ ...HG_REST, ...o });

// Krummer Stock mit hängender Laterne; gibt die Laternenmitte zurück
function lanternStaff(p, g, hx, hy, a, sw, flame, ph) {
  const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
  const L = 13;
  for (let s = -3; s <= L; s += 0.5) {
    const w = Math.sin(s * 0.6) * 0.6;
    const x = hx + dx * s + nx * w, y = hy + dy * s + ny * w;
    p.px(x, y, TWIG[3]); p.px(x + nx * 0.8, y + ny * 0.8, TWIG[1]);
    if (p.fine && (s < -1 || s > 2)) p.dot(x - nx * 0.15, y - ny * 0.15, TWIG[4]);   // fein: Lichtgrat am Stock
  }
  // Haken
  const tx = hx + dx * L, ty = hy + dy * L;
  const hk = { x: tx + dx * 1.5 + 0.5, y: ty + dy * 1.5 + 1 };
  p.line(tx, ty, hk.x, hk.y - 1, TWIG[3]); p.px(hk.x, hk.y, TWIG[2]);
  // Kette und Laterne (pendelt)
  const lx = hk.x + Math.sin(sw) * 3, ly = hk.y + Math.cos(sw) * 3 + 3;
  p.line(hk.x, hk.y, lx, ly - 3, IRONL[3]);
  // Käfig
  p.rect(lx - 2, ly - 3, 5, 1, IRONL[3]); p.px(lx, ly - 4, IRONL[4]);
  p.rect(lx - 2, ly + 3, 5, 1, IRONL[2]);
  for (const ox of [-2, 2]) for (let y = -2; y <= 2; y++) p.px(lx + ox, ly + y, ox < 0 ? IRONL[4] : IRONL[1]);
  if (p.fine) {
    // Käfig: Eisen mit Glanzlinie oben und am linken Stab, Glanzpunkt, Niete; Mittelstab fein
    p.fline(Math.round(lx) - 2, Math.round(ly) - 3, Math.round(lx) + 2.5, Math.round(ly) - 3, IRONL[4]); p.dot(Math.round(lx) - 1.5, Math.round(ly) - 3, '#c8d0c0');
    p.fline(Math.round(lx) - 2, Math.round(ly) - 2, Math.round(lx) - 2, Math.round(ly) + 2.5, '#9aa494');
    p.dot(Math.round(lx) + 2.5, Math.round(ly) + 3, IRONL[0]); p.dot(Math.round(lx), Math.round(ly) + 3.5, IRONL[4]);
  }
  // Flamme / Irrlicht
  const f = flame;
  for (let y = -2; y <= 2; y++) for (let x = -1; x <= 1; x++) {
    const hot = 1 - Math.abs(x) * 0.4 - (y + 2) * 0.12 + Math.sin(ph * 3 + y) * 0.1;
    const i = clamp(Math.floor(hot * f * 4.2), 0, 4);
    if (f < 0.1) { p.px(lx + x, ly + y, '#141a14'); continue; }
    p.px(lx + x, ly + y, LGLOW[i]); g.px(lx + x, ly + y, LGLOW[Math.min(4, i + 1)]);
  }
  if (f > 0.1) {
    // fein: Halo klein und gestuft (zwei Ringe, dunkles Grün), damit Käfig und Flamme lesbar bleiben
    if (p.fine) { const r = 1.6 + f * 1.4; oval(g, lx, ly, r + 1, r + 0.5, LGLOW[0]); oval(g, lx, ly, r, r - 0.5, LGLOW[0]); oval(g, lx, ly - 0.5, 1, 1.5, LGLOW[1]); }
    else glowDot(g, lx, ly, 2 + f * 2.2, LGLOW);
    p.px(lx, ly - 1, LGLOW[4]);
    if (p.fine) {
      // Irrlicht: züngelnde Flamme mit weißem Kern im grünen Saum
      const X0 = Math.round(lx), Y0 = Math.round(ly), wv = Math.sin(ph * 3) > 0 ? 0.5 : 0;
      p.fline(X0 + 0.25 + wv, Y0 - 2, X0 + 0.25, Y0 + 1, LGLOW[4]); p.dot(X0 + 0.25, Y0 - 0.5, '#ffffff'); p.dot(X0 + 0.25, Y0, '#ffffff');
      p.dot(X0 - 0.75, Y0 + 2, LGLOW[1]); p.dot(X0 + 1.25, Y0 + 2, LGLOW[1]);
      g.fline(X0 + 0.25 + wv, Y0 - 2, X0 + 0.25, Y0 + 1, '#ffffff');
    }
  }
  return { x: lx, y: ly };
}

// Reisig-Haar: dünne verzweigte Äste nach hinten-oben
// fein: weniger, dafür kräftigere und gerichtete Zweige (2 Feinpixel stark, zur Spitze 1), zwei Tonstufen:
// dunkler Kern, Lichtseite oben links (oberer/linker Feinpixel des Strichs). Silhouette ruhig wie im Grobraster.
function twigHairFine(p, hx, hy, P) {
  const m = 8;
  for (let i = 0; i < m; i++) {
    const f = i / (m - 1);
    let a = -1.55 - f * 1.75 + Math.sin(P.hairT + i * 1.1) * 0.07;
    let x = hx - 0.5 - f * 1.5, y = hy - 2.5 + f * 2;
    const L = 11 + (hash2(i, 1, 53) * 5 | 0) - Math.abs(f - 0.5) * 4;
    for (let s = 0; s < L; s++) {
      const x0 = x, y0 = y;
      x += Math.cos(a); y += Math.sin(a) * 0.95;
      a += (hash2(i, s, 54) - 0.5) * 0.14 + (f > 0.5 ? 0.01 : -0.03);
      const tip = s > L - 3;
      p.fline(x0, y0, x, y, tip ? TWIG[3] : TWIG[2], tip ? 0 : s < 3 ? 1.5 : 1);
      if (!tip) p.fline(x0, y0, x, y, s < L * 0.5 ? TWIG[4] : TWIG[3]);
      if (s === 4 && i % 2 === 0) {   // ein Seitenzweig je zweitem Ast, zur Außenseite
        const fa = a + (f > 0.5 ? -0.8 : 0.8), ex = x + Math.cos(fa) * 2.5, ey = y + Math.sin(fa) * 2.5;
        p.fline(x, y, ex, ey, TWIG[2], 1); p.fline(x, y, ex, ey, TWIG[4]);
        p.fline(ex, ey, ex + Math.cos(fa) * 1.5, ey + Math.sin(fa) * 1.5, TWIG[3]);
      }
      if (s === 5 && i % 3 === 0) { p.fline(x, y + 0.5, x + 1, y + 1.5, SHAWL[4]); p.fline(x + 0.5, y + 0.5, x + 0.5, y + 2, SHAWL[3]); }
    }
    if (i === 4) { p.px(x, y + 1, BONE[2]); p.px(x, y + 2, BONE[3]); p.dot(x, y + 1, BONE[4]); }
  }
}
function twigHair(p, hx, hy, P, n = 11) {
  if (p.fine) { twigHairFine(p, hx, hy, P); return; }
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    let a = -1.55 - f * 1.75 + Math.sin(P.hairT + i * 0.9) * 0.07;
    let x = hx - 0.5 - f * 1.5, y = hy - 2.5 + f * 2;
    const L = 9 + (hash2(i, 1, 51) * 7 | 0) - Math.abs(f - 0.5) * 4;
    for (let s = 0; s < L; s++) {
      const x0 = x, y0 = y;
      x += Math.cos(a); y += Math.sin(a) * 0.95;
      a += (hash2(i, s, 52) - 0.5) * 0.4 + (f > 0.5 ? 0.02 : -0.02);
      p.px(x, y, TWIG[s < 2 ? 2 : s > L - 3 ? 4 : 3]);
      if (s % 3 === 2) p.px(x + 0.6, y + 0.6, TWIG[1]);
      if (s === 4 || s === 8) {
        const fa = a + (i % 2 ? 0.75 : -0.75);
        for (let k = 1; k <= 3; k++) p.px(x + Math.cos(fa) * k, y + Math.sin(fa) * k, TWIG[k === 3 ? 4 : 3]);
      }
      if (s === 5 && i % 3 === 0) { p.px(x, y + 1, SHAWL[4]); p.px(x + 1, y + 1, SHAWL[3]); }
    }
    if (i === 5) { p.px(x, y + 1, BONE[2]); p.px(x, y + 2, BONE[3]); }
  }
}

function drawHag(p, g, P, X) {
  const R = rig(P, HGD, HS2.AX, HS2.AY);
  const { hip, pt, legF, legB, shF, shB, armF, armB } = R;
  const meta = {};
  const AY = HS2.AY;
  const neck = pt(HGD.spine + 1.2, 1.6);
  const hx = Math.round(neck.x + P.head), hy = Math.round(neck.y - 2.5 + P.headY);

  // --- Haar hinten
  twigHair(p, hx, hy, P);

  // --- hinterer Arm (lange Krallenhand)
  const clawHand = (A, ramp, back) => {
    cap(p, A.jx, A.jy, A.ex, A.ey, 0.9, 0.8, ramp);
    const a = Math.atan2(A.ey - A.jy, A.ex - A.jx);
    for (let i = -1; i <= 1; i++) {
      const fa = a + i * (0.25 + P.claw * 0.35);
      if (p.fine) {
        // fein: knochige Finger (Gelenk heller), lange helle Kralle
        let px0 = A.ex, py0 = A.ey;
        for (let s = 1; s <= 4; s++) {
          const x = A.ex + Math.cos(fa + s * 0.12) * s, y = A.ey + Math.sin(fa + s * 0.12) * s;
          p.fline(px0, py0, x, y, s >= 3.5 ? '#d8d2bc' : s === 3 ? '#a8a28c' : ramp[back ? 1 : 2], s < 3 ? 1 : 0);
          if (s === 2) p.dot(x, y - 0.25, ramp[back ? 2 : 4]);
          px0 = x; py0 = y;
        }
        p.dot(px0 + Math.cos(fa + 0.6) * 0.5, py0 + Math.sin(fa + 0.6) * 0.5, '#f0ead8');
        continue;
      }
      for (let s = 1; s <= 4; s++) p.px(A.ex + Math.cos(fa + s * 0.12) * s, A.ey + Math.sin(fa + s * 0.12) * s, s === 4 ? '#d8d2bc' : ramp[back ? 1 : 2]);
    }
  };
  if (!X.backFront) {
    cap(p, shB.x, shB.y, armB.jx, armB.jy, 1.2, 0.9, SHAWL.slice(0, 4));
    clawHand(armB, HSK.slice(0, 4), true);
  }

  // --- Füße (knochig, unter dem Rock)
  for (const [L, near] of [[legB, false], [legF, true]]) {
    p.rect(L.ex - 1, L.ey - 1, near ? 4 : 3, 1, HSK[near ? 2 : 1]);
    p.px(L.ex + (near ? 3 : 2), L.ey - 1, '#cfc8b0');
  }

  // --- Lumpenrock bis zum Boden, zerfranst
  const sway = Math.sin(P.hairT) * 0.8 + P.hem;
  const wl = pt(1.5, -2.6), wr = pt(1.5, 2.4);
  const hemL = { x: hip.x - 6 - P.hem * 2 + sway * 0.5, y: AY - 1 }, hemR = { x: hip.x + 5 + P.lean * 3 + sway * 0.3, y: AY - 1.5 };
  const skirt = [[wl.x, wl.y], [wr.x, wr.y], [hemR.x, hemR.y], [hemL.x, hemL.y]];
  poly(p, skirt, (x, y) => {
    const rel = (x - hemL.x) / Math.max(1, hemR.x - hemL.x);
    if (p.fine) return RAGS[rel < 0.25 ? 3 : rel < 0.6 ? 2 : 1];     // fein: Falten folgen als Linien
    const fold = (x + 40 + Math.floor((y - hip.y) * 0.4)) % 3;
    let i = rel < 0.25 ? 3 : rel < 0.6 ? 2 : 1;
    if (fold === 0) i -= 1;
    if (hash2(x, y, 33) < 0.1) i += 1;
    return RAGS[clamp(i, 0, 4)];
  });
  if (p.fine) {
    // Handfein: Stoff mit zweifarbigen Falten (Schattenlinie + Lichtkante), Flicknaht als Punktlinie
    for (let k = 0; k < 5; k++) {
      const u = 0.12 + k * 0.19, ax = wl.x + (wr.x - wl.x) * u, ay = wl.y + (wr.y - wl.y) * u + 1;
      const bx = hemL.x + (hemR.x - hemL.x) * (u + (k - 2) * 0.03), by = AY - 2;
      p.fline(ax, ay, bx, by, RAGS[0]); p.fline(ax - 0.5, ay + 0.5, bx - 0.5, by, u < 0.5 ? RAGS[4] : RAGS[3]);
    }
    const n0 = pt(-1.5, -0.5);
    for (let k = 0; k < 6; k++) p.dot(n0.x - 2 + k * 0.5, n0.y + 3 + k * 0.4, (k & 1) ? RAGS[4] : null);
    p.fline(n0.x - 2.5, n0.y + 2.5, n0.x + 0.5, n0.y + 5.5, RAGS[0]);
  }
  for (let x = Math.round(hemL.x); x <= Math.round(hemR.x); x++) {
    const L = 1 + Math.floor(hash2(x - Math.round(hip.x), 4, 35) * 2.2);
    if (p.fine) {
      // fein: zerfranster Saum in Fäden, Schlamm/Moos als Tupfen am Rand
      for (const o of [0, 0.5]) { const LL = L + (hash2(x * 2 + o * 2, 9, 35) - 0.5); p.fline(x + o, AY - 1.5, x + o - sway * 0.15, AY - 1.5 + LL, o ? RAGS[0] : RAGS[1]); }
      if (hash2(x, 5, 35) < 0.25) { p.dot(x, AY - 2, SHAWL[3]); p.dot(x + 0.5, AY - 2, SHAWL[4]); p.dot(x, AY - 1.5, SHAWL[2]); }
      continue;
    }
    for (let j = 0; j < L; j++) p.px(x, AY - 1 - j + 1, j === 0 ? RAGS[0] : RAGS[1]);
    if (hash2(x, 5, 35) < 0.25) p.px(x, AY - 2, SHAWL[3]);                     // Schlamm/Moos am Saum
  }

  // --- Rumpf: hager, eingesunkene Brust unter dem Schultertuch
  const hp = pt(0.5, 0), cp = pt(HGD.spine, 0.4);
  cap(p, hp.x, hp.y, cp.x, cp.y, 2.0, 2.6, RAGS, { noise: 0.15, seed: 37 });
  // Schultertuch aus Moos (hängt in Zipfeln)
  const s0 = pt(HGD.spine + 0.5, -3.2), s1 = pt(HGD.spine + 0.8, 2.8), s2 = pt(HGD.spine - 5, 3.2), s3 = pt(HGD.spine - 6.5, -1), s4 = pt(HGD.spine - 4.5, -4.5 - P.hem);
  const shawl = [[s0.x, s0.y], [s1.x, s1.y], [s2.x, s2.y], [s3.x, s3.y], [s4.x, s4.y]];
  poly(p, shawl, (x, y) => {
    let i = 2 + (x < cp.x - 1 ? 1 : 0) + (y < s0.y + 2 ? 1 : 0);
    if (p.fine) return SHAWL[clamp(i, 0, 5)];
    if (hash2(x, y, 39) < 0.2) i -= 1; if (hash2(x, y, 40) < 0.08) i += 2;
    return SHAWL[clamp(i, 0, 5)];
  });
  if (p.fine) {
    // Handfein: Moos in hängenden Strähnen (oben hell, unten dunkel), Zipfel als lange Fäden
    const xs = shawl.map((q) => q[0]), ys = shawl.map((q) => q[1]);
    strands(p, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), 46, 39, -P.hem * 0.4, 1.6, (x, y, i) => {
      const top = y < s0.y + 2;
      return top ? SHAWL[i % 3 ? 5 : 4] : x < cp.x - 1 ? SHAWL[i % 2 ? 4 : 2] : SHAWL[i % 2 ? 1 : 3];
    }, (x, y) => inPoly(shawl, x, y));
    for (let i = 0; i < 6; i++) {
      const z = pt(HGD.spine - 4.5 - (i % 2) * 0.7, -3 + i * 1.2), len = 2 + (i % 3) + (i === 3 ? 1.5 : 0);
      p.fline(z.x, z.y, z.x - P.hem * len * 0.4, z.y + len, SHAWL[i & 1 ? 1 : 3]); p.dot(z.x - P.hem * len * 0.4, z.y + len, SHAWL[0]);
    }
  } else for (let i = 0; i < 4; i++) {
    const z = pt(HGD.spine - 4.5 - (i % 2), -3 + i * 1.8);
    const len = 2 + (i % 3);
    for (let j = 0; j < len; j++) p.px(z.x - P.hem * j * 0.4, z.y + j, SHAWL[j === len - 1 ? 1 : 2]);
  }
  // Kette mit Fingerknochen
  for (let i = 0; i < 4; i++) { const t = pt(HGD.spine - 1.5 - i * 0.4, 0.3 + i * 0.6); p.px(t.x, t.y, i % 2 ? BONE[2] : BONE[3]); if (p.fine) { p.dot(t.x, t.y, BONE[4]); p.dot(t.x + 0.5, t.y + 0.5, BONE[1]); } }

  // --- Kopf: lang, Hakennase, Kinn
  ell(p, hx + 0.8, hy + 0.2, 3.0, 3.2, HSK, { noise: 0.1, seed: 43, bias: 0.05 });
  // Hakennase
  p.px(hx + 3, hy, HSK[4]); p.px(hx + 4, hy + 0.5, HSK[3]); p.px(hx + 4.6, hy + 1.4, HSK[3]); p.px(hx + 4.2, hy + 2.2, HSK[2]);
  // spitzes Kinn
  p.px(hx + 2.6, hy + 3.2, HSK[3]); p.px(hx + 3.2, hy + 3.6, HSK[2]);
  p.px(hx + 2.6, hy + 2.2 + P.jaw, '#0a0806'); if (P.jaw > 0.4) { p.px(hx + 3, hy + 2.4 + P.jaw, '#0a0806'); p.px(hx + 2.2, hy + 2.6 + P.jaw, '#0a0806'); }
  // Augen: eingesunken, giftgrün
  p.px(hx + 1.6, hy - 0.6, '#0a0c08'); p.px(hx + 2.4, hy - 0.6, P.eye > 0.5 ? LGLOW[3] : HSK[1]);
  if (P.eye > 0.5) { g.px(hx + 2.4, hy - 0.6, LGLOW[3]); g.px(hx + 3.2, hy - 0.6, LGLOW[1]); }
  if (p.fine) {
    // Handfein: Hexengesicht – tiefe Augenhöhle, glühende Iris mit weißem Kern, Pupillenschlitz,
    // harte Braue, Licht auf dem Nasenrücken der Hakennase, Nasenloch, Warze, Falten, Mund mit Mundwinkel
    // und schiefem Zahn, Kinnlicht
    p.fline(hx + 1, hy - 1.5, hx + 3, hy - 1.25, '#0a0c08'); p.dot(hx + 1, hy - 2, HSK[5]); p.dot(hx + 2, hy - 2, HSK[4]);
    p.dot(hx + 1.5, hy - 0.5, '#0a0c08'); p.dot(hx + 1.5, hy, HSK[1]); p.dot(hx + 2, hy, HSK[1]);
    if (P.eye > 0.5) {
      p.dot(hx + 2, hy - 0.5, LGLOW[3]); p.dot(hx + 2.5, hy - 0.5, LGLOW[2]); p.dot(hx + 2, hy - 1, '#ffffff');
      g.dot(hx + 2, hy - 1, '#ffffff'); g.dot(hx + 2, hy - 0.5, LGLOW[3]);
    } else p.fline(hx + 1.5, hy - 0.5, hx + 2.75, hy - 0.5, HSK[0]);
    p.fline(hx + 3, hy - 0.5, hx + 4.5, hy + 1.25, HSK[5]); p.dot(hx + 4.75, hy + 1.75, HSK[4]);
    p.dot(hx + 4, hy + 2, '#1a2018'); p.dot(hx + 3.5, hy + 0.5, '#5c6c5a'); p.dot(hx + 3.75, hy + 0.25, HSK[2]);
    p.fline(hx + 0.5, hy + 0.5, hx + 1.5, hy + 1.5, HSK[1]); p.fline(hx + 0.5, hy + 1.5, hx + 1.5, hy + 2.25, HSK[1]);
    p.fline(hx + 2, hy + 2.5 + P.jaw * 0.5, hx + 3.25, hy + 2.25 + P.jaw * 0.5, '#0a0806'); p.dot(hx + 1.75, hy + 2.25 + P.jaw * 0.5, HSK[1]);
    p.dot(hx + 2.75, hy + 2.75 + P.jaw * 0.5, '#d8d2b0');
    p.dot(hx + 2.75, hy + 3.5, HSK[5]); p.dot(hx + 3.25, hy + 3.75, HSK[4]);
    // Haar vorn: Strähnen übers Gesicht als Feinlinien
    for (let i = 1; i < 4; i++) {
      let x = hx - 0.4 * i + 0.3, y = hy - 2.6, px0 = x, py0 = y;
      for (let s = 0; s < 5 + i; s++) { x += 0.2 - i * 0.15; y += 0.95; }
      p.fline(px0, py0, (px0 + x) / 2 + 0.3, (py0 + y) / 2, TWIG[i === 2 ? 4 : 3]); p.fline((px0 + x) / 2 + 0.3, (py0 + y) / 2, x, y, TWIG[2]);
    }
    for (let x = -2.5; x <= 2.5; x += 0.5) p.fline(hx + x, hy - 3.5, hx + x + 0.3, hy - 2.5 + (x > 1.5 ? 1 : 0), Math.round(x * 2) % 3 ? TWIG[3] : TWIG[4]);
  } else {
    // Haar vorn: Strähnen übers Gesicht
    for (let i = 1; i < 3; i++) {
      let x = hx - 0.6 * i, y = hy - 2.6;
      for (let s = 0; s < 6 + i; s++) { x += 0.2 - i * 0.2; y += 0.95; p.px(x, y, TWIG[s % 2 ? 2 : 3]); }
    }
    // Haaransatz oben (verfilzt)
    for (let x = -2; x <= 2; x++) p.px(hx + x, hy - 3 + (x === 2 ? 1 : 0), TWIG[x < 0 ? 3 : 2]);
  }
  meta.eye = { x: hx + 2.4, y: hy - 0.6 };
  meta.head = { x: hx, y: hy - 9 };
  meta.mouth = { x: hx + 3, y: hy + 2.4 };

  // --- vorderer Arm mit Laternenstock
  if (X.smear) smearArc(p, g, (X.backFront ? shB : shF).x, (X.backFront ? shB : shF).y, X.smear[0], X.smear[1], 7, 15, ['#2c4a2a', '#6aa04a', '#c8f080'], [LGLOW[1], LGLOW[2]], X.smear[2] ?? 1);
  if (X.backFront) {
    cap(p, shB.x, shB.y, armB.jx, armB.jy, 1.2, 0.9, SHAWL);
    clawHand(armB, HSK, false);
  }
  let lan = null;
  if (P.held > 0.5) lan = lanternStaff(p, g, armF.ex, armF.ey, P.la, P.lsw, P.flame, P.hairT);
  cap(p, shF.x, shF.y, armF.jx, armF.jy, 1.3, 1.0, SHAWL);
  cap(p, armF.jx, armF.jy, armF.ex, armF.ey, 0.9, 0.8, HSK);
  ell(p, armF.ex, armF.ey, 1.1, 1.1, HSK);
  if (p.fine) { for (let i = 0; i < 3; i++) { p.fline(armF.ex + 0.5, armF.ey - 1 + i, armF.ex + 1.5, armF.ey - 0.75 + i, '#c8c2aa'); p.dot(armF.ex + 0.5, armF.ey - 1 + i, HSK[4]); } p.dot(armF.ex - 0.5, armF.ey - 0.5, HSK[5]); }
  else for (let i = 0; i < 3; i++) p.px(armF.ex + 1, armF.ey - 1 + i, '#c8c2aa');
  meta.hand = lan ?? { x: armF.ex, y: armF.ey };
  if (lan) meta.tip = lan;
  if (P.flame > 1.2) {
    for (let i = 0; i < 8; i++) {
      const a = P.hairT * 2 + i * TAU / 8, r = 5 + P.flame * 2 + hash2(i, 1, 61) * 2;
      const x = (lan ?? meta.hand).x + Math.cos(a) * r, y = (lan ?? meta.hand).y + Math.sin(a) * r * 0.7;
      p.px(x, y, LGLOW[3]); g.px(x, y, LGLOW[2]);
    }
  }
  return meta;
}

// Versinken/Auftauchen: Figur nach unten versetzen, unterhalb des Wasserspiegels abschneiden, Wellenring
function sinkDraw(drawFn, S, sinkKey = 'sink') {
  return (p, g, P, X) => {
    const k = X[sinkKey] ?? 0;
    const off = Math.round(k * (S.sinkH ?? S.H - 4));
    p.translate(0, off); g.translate(0, off);
    const meta = drawFn(p, g, P, X);
    p.translate(0, -off); g.translate(0, -off);
    for (const m in meta) meta[m] = { x: meta[m].x, y: meta[m].y + off };
    if (k > 0.02) {
      clearBox(p, -20, S.AY - 1, S.W + 40, 40); clearBox(g, -20, S.AY - 1, S.W + 40, 40);
      const rx = 7 + k * 5 + (X.ripple ?? 0) * 4;
      oval(p, S.AX, S.AY - 1, rx + 1, 2.2, '#0c1410');
      oval(p, S.AX, S.AY - 1, rx, 1.6, '#16261c');
      if (p.fine) {
        // fein: Wellenring als durchgehende Feinlinie (vorn hell, hinten dunkel), Lücken je Weltpixel
        for (let i = 0; i < 64; i++) {
          const a = i / 64 * TAU;
          if (hash2(i >> 2, Math.round(k * 10), 71) > 0.75) continue;
          p.dot(S.AX + 0.5 + Math.cos(a) * (rx + 0.75), S.AY - 0.5 + Math.sin(a) * 2, Math.sin(a) < 0 ? '#5a8a54' : '#8ac070');
        }
      } else for (let i = 0; i < 16; i++) {
        const a = i / 16 * TAU;
        const x = S.AX + Math.cos(a) * (rx + 0.5), y = S.AY - 1 + Math.sin(a) * 2;
        if (hash2(i, Math.round(k * 10), 71) < 0.7) p.px(x, y, Math.sin(a) < 0 ? '#5a8a54' : '#3a5a38');
      }
      for (let i = 0; i < 5; i++) {
        const x = S.AX - rx * 0.6 + hash2(i, 2, 72) * rx * 1.2, y = S.AY - 2 - hash2(i, Math.round(k * 7), 73) * 3 * (1 - k);
        p.px(x, y, '#8ac070'); g.px(x, y, LGLOW[1]);
      }
    }
    return meta;
  };
}

function hagAnims() {
  const drawS = sinkDraw(drawHag, HS2);
  const mk = (P, X) => makeFrame(HS2, drawS, P, X);
  const idleA = hgp();
  const idle = track(mk, cycle((ph) => {
    const s = Math.sin(ph);
    return hgp({ hipY: (1 - Math.cos(ph)) * 0.4, lean: 0.3 + s * 0.03, hairT: ph, lsw: Math.sin(ph) * 0.35, flame: 0.85 + Math.sin(ph * 2) * 0.15, hBy: 8 + s * 0.6, claw: 0.3 + Math.max(0, s) * 0.4, head: Math.max(0, -s) * 0.4 });
  }, 6), 6, { loop: true });
  const walk = track(mk, walkKeys(idleA, 8, {
    stride: 3, lift: 1.4, bob: 0.8, arm: 1,
    extra: (ph, s) => ({ hairT: ph, lsw: -0.4 + s * 0.3, hem: 0.5 + s * 0.4, lean: 0.36 }),
  }), 8, { loop: true, extras: { 0: { fx: 'step' }, 4: { fx: 'step' } } });
  // Nahkampf: Krallenhand holt aus (Laterne zurück), dann Kratzer schräg nach unten
  const w1 = hgp({ lean: 0.1, hipX: -1, hBx: -3, hBy: -4, claw: 1, jaw: 0.8, la: -1.4, hFx: 5, hFy: 4, lsw: 0.6, hairT: 1, hem: -0.3 });
  const w2 = hgp({ lean: -0.05, hipX: -1.5, hBx: -5, hBy: -7, claw: 1, jaw: 1, la: -1.6, hFx: 3, hFy: 5, lsw: 0.9, hairT: 2, hem: -0.5, eye: 1 });
  const windup = track(mk, [[0, idleA], [0.45, w1], [1, w2]], 4, { all: { backFront: true } });
  const s1 = hgp({ lean: 0.45, hipX: 1, hBx: 7, hBy: -3, claw: 1, jaw: 1, la: -1.0, hFx: 3, hFy: 6, lsw: -0.4, hairT: 3, hem: 0.6 });
  const s2 = hgp({ lean: 0.6, hipX: 2.5, hBx: 10, hBy: 6, claw: 0.6, jaw: 0.8, la: -0.9, hFx: 2, hFy: 7, lsw: -0.8, hairT: 4, hem: 1 });
  const s3 = hgp({ lean: 0.5, hipX: 2, hBx: 7, hBy: 10, claw: 0.3, jaw: 0.4, la: -1.0, hFx: 4, hFy: 6, lsw: -0.5, hairT: 5, hem: 0.7 });
  const strike = [
    mk(s1, { backFront: true, smear: [-2.4, -0.8] }), mk(s2, { backFront: true, smear: [-1.9, 0.7], fx: 'impact' }),
    mk(s3, { backFront: true, smear: [-0.5, 1.2] }), mk(mixP(s3, idleA, 0.55), { backFront: true }),
  ];
  // Fluch: Laterne hoch, Irrlicht lodert, Krallen gespreizt
  const c1 = hgp({ lean: 0.1, head: -0.5, hFx: 6, hFy: -6, la: -1.45, lsw: 0.3, flame: 1.2, hBx: 6, hBy: 2, claw: 1, jaw: 0.6, hairT: 1 });
  const c2 = hgp({ lean: -0.05, head: -0.8, headY: -0.5, hFx: 5, hFy: -9, la: -1.5, lsw: -0.2, flame: 1.7, hBx: 8, hBy: 0, claw: 1, jaw: 1, hairT: 2, hem: -0.3 });
  const c3 = { ...c2, flame: 2, hairT: 3, lsw: 0.2, hem: 0.3 };
  const c4 = hgp({ lean: 0.45, hFx: 9, hFy: 1, la: -0.9, lsw: -0.6, flame: 1.4, hBx: 9, hBy: 5, claw: 1, jaw: 1, hairT: 4, hem: 0.6 });
  const cast = [mk(c1), mk(c2), mk(c3, { fx: 'cast' }), mk({ ...c3, hairT: 3.6 }), mk(c4), mk(mixP(c4, idleA, 0.6))];
  // Verschwinden: ins Moorwasser sinken; Auftauchen: rückwärts
  const vk = [0, 0.15, 0.4, 0.7, 0.95, 1];
  const vpose = (i) => hgp({ lean: 0.2 - i * 0.03, hairT: i, hem: 0.5, lsw: Math.sin(i) * 0.5, flame: 1 - i * 0.12, claw: 0.6, hFy: 1 - i * 0.5, la: -1.3 });
  const vanish = vk.map((k, i) => mk(vpose(i), { sink: k, ripple: i * 0.3, fx: i === 1 ? 'cast' : null }));
  const appear = vk.slice().reverse().map((k, i) => mk(vpose(5 - i), { sink: k, ripple: (5 - i) * 0.3, fx: i === 4 ? 'cast' : null }));
  const hurtP = hgp({ lean: 0.05, hipX: -1.5, head: -1, headY: -0.5, jaw: 1, eye: 0.4, hFx: 5, hFy: 5, la: -1.6, lsw: 1, hBx: 0, hBy: 4, claw: 1, hem: -0.6, hairT: 1 });
  const hurt = [mk(hurtP), mk(mixP(hurtP, idleA, 0.5))];
  // Tod: Laterne fällt und erlischt, Hexe sackt in ihren Lumpen zusammen
  const lanternDown = (f) => (p, g) => {
    const lx = HS2.AX + 13, ly = HS2.AY - 3;
    for (let s = 0; s < 14; s++) { p.px(lx - 14 + s, HS2.AY - 1, TWIG[3]); p.px(lx - 14 + s, HS2.AY, TWIG[1]); }
    p.rect(lx - 2, ly - 2, 5, 5, IRONL[2]); p.rect(lx - 1, ly - 1, 3, 3, f > 0.1 ? LGLOW[2] : '#141a14');
    if (p.fine) { p.fline(lx - 2, ly - 2, lx + 2.5, ly - 2, IRONL[4]); p.dot(lx - 1.5, ly - 2, '#c8d0c0'); p.fline(lx - 2, ly - 1.5, lx - 2, ly + 2.5, '#76806e'); if (f > 0.1) { p.dot(lx + 0.25, ly + 0.25, f > 0.5 ? '#ffffff' : LGLOW[4]); p.fline(lx + 0.25, ly - 0.75, lx + 0.25, ly + 0.75, LGLOW[3]); } }
    if (f > 0.1) { g.rect(lx - 1, ly - 1, 3, 3, LGLOW[3]); glowDot(g, lx, ly, f * 2.5, LGLOW); }
    return {};
  };
  const d1 = hgp({ ...hurtP, lean: -0.1, hFy: 8, la: -0.6 });
  const d2 = hgp({ lean: 0.5, hipY: 5, head: 1, headY: 1, hFx: 6, hFy: 10, hBx: 4, hBy: 10, held: 0, eye: 0.3, jaw: 1, hem: 1, fFx: 4, fBx: -3 });
  const d3 = { ...d2, hipY: 8, lean: 1.0, head: 1.5, headY: 2, eye: 0, hairT: 1, hFy: 8, hBy: 8, hFx: 9, hBx: 7 };
  const d4 = { ...d3, hipY: 9.5, lean: 1.2, headY: 3, hairT: 1.5, hFy: 7, hFx: 11 };
  const death = [
    mk(d1), mk(d2, { post: lanternDown(1) }), mk(mixP(d2, d3, 0.5), { post: lanternDown(0.8) }),
    mk(d3, { post: lanternDown(0.5), fx: 'impact' }), mk(d4, { post: lanternDown(0.25) }), mk(d4, { post: lanternDown(0) }),
  ];
  return {
    idle: new Animation(idle, 6),
    walk: new Animation(walk, 8),
    windup: new Animation(windup, 8, false),
    strike: new Animation(strike, 13, false),
    cast: new Animation(cast, 8, false),
    vanish: new Animation(vanish, 10, false),
    appear: new Animation(appear, 10, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 8, false),
  };
}

// ================================================================ Frostwiedergänger (mit/ohne Eispanzer)

const RIM_FROST = { c: [220, 236, 255], k1: 0.32, k2: 0.16 };
const ICE = ['#1c3e5c', '#2e6890', '#4c9ac4', '#86cde8', '#c8f0fa', '#f4feff'];
const ICE_G = ['#0e2c48', '#1e5c8c', '#3a9ad0', '#7ad4f4', '#c4f4ff', '#ffffff'];
const RSTEEL = ['#0c0e14', '#181c26', '#272d3a', '#3a4252', '#525c6e', '#727e92', '#98a4b6'];
const RUSTF = ['#24140e', '#3e2216', '#5a3420'];
const CORPSE = ['#10161c', '#1c2832', '#2c3c4a', '#405666'];
const CLOAKN = ['#08090f', '#10131d', '#191e2e', '#242b40', '#313a54'];
// Schwertkristalle (fein): [Lage auf der Klinge, Seite, Länge, Neigung zur Spitze], in Gruppen
const ICE_CRYST = [
  [3.8, 1, 2.0, 0.5], [4.6, 1, 3.3, 0.9], [5.3, 1, 1.5, 1.3],
  [8.4, -1, 2.6, 0.7], [9.3, -1, 1.6, 1.2],
  [11.6, 1, 3.6, 0.6], [12.5, 1, 2.3, 1.1], [13.1, 1, 1.3, 1.5],
  [15.8, -1, 2.4, 0.8], [16.6, -1, 3.0, 1.1],
  [18.4, 1, 1.7, 1.0],
];
const RICE = ['#050c2e', '#0a1c5a', '#12308e', '#1e4cc0', '#4a7ee6', '#b4d0ff'];   // r3: tiefblaues Panzereis
const CROWN = ['#8aa0c8', '#c8d6f0', '#eef4ff', '#ffffff'];   // r3: weiße Eiskrone
const BLUEG = ['#08183a', '#163e80', '#3480d4', '#88ccff', '#e0f6ff'];
const FROST_SMEAR = ['#6ab4d8', '#b8ecfa', '#f4feff'];
const FRS = { W: 80, H: 66, AX: 32, AY: 60, pad: 12, rim: RIM_FROST };
const FRD = { legH: 14.5, thigh: 7.4, shin: 7.8, spine: 11.5, upper: 6, fore: 6.4, sh: 2.6, hipW: 1.8 };
const FR_REST = {
  hipX: 0, hipY: 0, lean: 0.08, head: 0, headY: 0, fFx: 3.5, fFy: 0, fBx: -3.5, fBy: 0,
  hFx: 7, hFy: 8, hBx: 2, hBy: 9, wa: -1.05, cape: 0.1, capeT: 0, eye: 1, ice: 1, crack: 0, glow: 1, mist: 0, held: 1,
};
const frp = (o = {}) => ({ ...FR_REST, ...o });

// Eisplatte: facettiertes Polygon mit hellem Grat und dunkler Unterkante
function iceSlab(p, g, pts, crack, seed) {
  let cx = 0, cy = 0; for (const q of pts) { cx += q[0]; cy += q[1]; } cx /= pts.length; cy /= pts.length;
  if (p.fine) {
    // Handfein: Eisplatte in 3 klaren Stufen quer zum Licht (oben links hell, Mitte, unten rechts tief), kein Sprenkel;
    // Facettenkante: Lichtkanten hell, Schattenkanten dunkel; eine Glanzlinie je Platte auf der hellsten Kante
    const n = pts.length, h = p.step / 2;
    let e0 = Infinity, e1 = -Infinity;
    for (const q of pts) { const t = (q[0] - cx) * 0.6 + (q[1] - cy) * 0.8; e0 = Math.min(e0, t); e1 = Math.max(e1, t); }
    const s0 = e0 + (e1 - e0) * 0.36, s1 = e0 + (e1 - e0) * 0.7;
    poly(p, pts, (x, y) => {
      const t = (x + h - cx) * 0.6 + (y + h - cy) * 0.8;
      return t < s0 ? RICE[4] : t < s1 ? RICE[3] : RICE[2];
    });
    let best = 0, bl = -Infinity;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const mx = (a[0] + b[0]) / 2 - cx, my = (a[1] + b[1]) / 2 - cy, l = Math.hypot(mx, my) || 1, lit = (mx * -0.6 + my * -0.8) / l;
      p.fline(a[0], a[1], b[0], b[1], lit > 0.1 ? RICE[5] : lit > -0.3 ? RICE[3] : RICE[1]);
      if (lit > bl) { bl = lit; best = i; }
    }
    // Glanzlinie: auf der hellsten Kante, ein Stück nach innen versetzt, mit weißem Kern am Anfang
    const a = pts[best], b = pts[(best + 1) % n], ix = (cx - (a[0] + b[0]) / 2) * 0.22, iy = (cy - (a[1] + b[1]) / 2) * 0.22;
    const u0 = 0.2, u1 = 0.7;
    p.fline(a[0] + (b[0] - a[0]) * u0 + ix, a[1] + (b[1] - a[1]) * u0 + iy, a[0] + (b[0] - a[0]) * u1 + ix, a[1] + (b[1] - a[1]) * u1 + iy, '#d8ecff');
    p.dot(a[0] + (b[0] - a[0]) * u0 + ix, a[1] + (b[1] - a[1]) * u0 + iy, '#ffffff');
  } else poly(p, pts, (x, y) => {
    const dx = x - cx, dy = y - cy;
    let i = 2 + (dx < -0.5 && dy < 0.5 ? 1 : 0) + (dy < -1 ? 1 : 0) - (dy > 1.5 ? 1 : 0) - (dx > 1.5 ? 1 : 0);
    if (hash2(x, y, seed) < 0.12) i += 1;
    return RICE[clamp(i, 0, 5)];
  });
  // Grat
  if (!p.fine) for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if (a[1] + b[1] < cy * 2 && a[0] + b[0] < cx * 2 + 4) p.line(a[0], a[1], b[0], b[1], RICE[4]);
  }
  if (!p.fine) p.px(cx - 1, cy - 1, RICE[5]);
  if (crack > 0.05) {
    let x = cx - 1, y = cy - 1.5;
    for (let s = 0; s < 4 + crack * 3; s++) {
      const x0 = x, y0 = y;
      x += (hash2(s, 1, seed) - 0.4) * 1.6; y += 0.9;
      if (p.fine) { p.fline(x0, y0, x, y, crack > 0.5 ? '#ffffff' : RICE[5]); g.fline(x0, y0, x, y, ICE_G[crack > 0.5 ? 5 : 3]); continue; }   // fein: Riss als Lichtlinie
      p.px(x, y, crack > 0.5 ? ICE_G[5] : RICE[5]); g.px(x, y, ICE_G[crack > 0.5 ? 4 : 3]);
    }
  }
}

// Zweihänder (verrostet, frostbedeckt); im Eispanzer von dickem Eis ummantelt
function revSword(p, g, hx, hy, a, ice) {
  const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
  // Griff und Knauf
  for (let s = -4; s <= 0; s += 0.5) { p.px(hx + dx * s, hy + dy * s, CLOAKN[3]); p.px(hx + dx * s + nx * 0.6, hy + dy * s + ny * 0.6, CLOAKN[1]); }
  ell(p, hx - dx * 4.5, hy - dy * 4.5, 1.1, 1.1, RSTEEL.slice(2));
  // Parierstange
  for (let k = -3; k <= 3; k += 0.5) p.px(hx + dx * 1.2 + nx * k, hy + dy * 1.2 + ny * k, k < 0 ? RSTEEL[5] : RSTEEL[3]);
  p.px(hx + dx * 1.2 + nx * -3, hy + dy * 1.2 + ny * -3, RSTEEL[6]);
  if (p.fine) {
    p.fline(hx + dx * 0.9 - nx * 3, hy + dy * 0.9 - ny * 3, hx + dx * 0.9 + nx * 3, hy + dy * 0.9 + ny * 3, RSTEEL[6]);   // Glanzlinie Parier
    for (let s = -3.5; s <= -0.5; s += 1) p.fline(hx + dx * s - nx * 0.3, hy + dy * s - ny * 0.3, hx + dx * (s + 0.5) + nx * 0.9, hy + dy * (s + 0.5) + ny * 0.9, CLOAKN[4]);   // Griffwicklung
  }
  let tip = null;
  if (p.fine) {
    // Handfein: Klinge in Feinpixeln, Stahl 5 Stufen, Schneide als Glanzlinie, Rostflecken und Reif als feste
    // Flecken (kein Rauschen), Hohlkehle schmal mit kaltem Schimmer, Glanzpunkt
    for (let s = 2; s <= 19; s += 0.25) {
      const f = (s - 2) / 17, hw = 1.3 - f * 0.5 + (s > 17 ? -(s - 17) * 0.4 : 0);
      const cx = hx + dx * s, cy = hy + dy * s;
      for (let k = -hw; k <= hw + 0.01; k += 0.25) p.dot(cx + nx * k, cy + ny * k, k > hw - 0.3 ? RSTEEL[6] : k > hw - 0.6 ? RSTEEL[5] : k < -hw + 0.4 ? RSTEEL[2] : k > 0 ? RSTEEL[4] : RSTEEL[3]);
      tip = { x: cx, y: cy };
    }
    for (const [s, k, c] of [[5, -0.5, RUSTF[2]], [5.5, -0.5, RUSTF[1]], [11, 0.5, RUSTF[2]], [15.5, -0.25, RUSTF[2]], [8, 0.75, RICE[4]], [8.5, 0.75, RICE[5]], [13, -0.75, RICE[4]]]) p.dot(hx + dx * s + nx * k, hy + dy * s + ny * k, c);
    p.fline(hx + dx * 3, hy + dy * 3, hx + dx * 14, hy + dy * 14, RICE[2]);
    g.fline(hx + dx * 3, hy + dy * 3, hx + dx * 14, hy + dy * 14, ICE_G[1]);
    p.dot(hx + dx * 4 + nx * 0.9, hy + dy * 4 + ny * 0.9, '#ffffff');
  } else for (let s = 2; s <= 19; s += 0.5) {
    const f = (s - 2) / 17;
    const hw = 1.3 - f * 0.5 + (s > 17 ? -(s - 17) * 0.4 : 0);
    const cx = hx + dx * s, cy = hy + dy * s;
    for (let k = -hw; k <= hw + 0.01; k += 0.5) {
      let c = k > hw - 0.5 ? RSTEEL[5] : k < -hw + 0.5 ? RSTEEL[2] : k > 0 ? RSTEEL[4] : RSTEEL[3];
      if (hash2(Math.round(s * 2), Math.round(k * 2), 77) < 0.08) c = RUSTF[2];
      if (hash2(Math.round(s * 2), Math.round(k * 2), 78) < 0.1) c = RICE[4];
      p.px(cx + nx * k, cy + ny * k, c);
    }
    tip = { x: cx, y: cy };
  }
  // Hohlkehle mit kaltem Schimmer
  if (!p.fine) for (let s = 3; s <= 14; s += 1) { p.px(hx + dx * s, hy + dy * s, RICE[2]); if (s % 3 === 0) g.px(hx + dx * s, hy + dy * s, ICE_G[1]); }
  if (ice > 0.5) {
    // Eismantel: gezackte Kristalle entlang der Klinge
    if (p.fine) {
      // fein: Kristalle in unregelmäßigen Gruppen (Lage s, Seite, Länge, Neigung zur Spitze), je zwei Facetten:
      // Lichtseite (oben links) hell, Schattenseite tief, Grat als Glanzlinie, weiße Spitze
      for (const [s, side, L, tl] of ICE_CRYST) {
        const mx = hx + dx * s + nx * side * 0.7, my = hy + dy * s + ny * side * 0.7;
        const wb = 0.7 + L * 0.12, b1 = [mx - dx * wb, my - dy * wb], b2 = [mx + dx * wb, my + dy * wb];
        const e = [mx + nx * side * L + dx * tl, my + ny * side * L + dy * tl];
        const lit = b1[0] + b1[1] < b2[0] + b2[1];
        poly(p, [b1, [mx, my], e], lit ? RICE[4] : RICE[2]);
        poly(p, [[mx, my], b2, e], lit ? RICE[2] : RICE[4]);
        if (L > 2.5) p.fline(mx + nx * side * 0.5, my + ny * side * 0.5, mx + (e[0] - mx) * 0.7, my + (e[1] - my) * 0.7, RICE[5]);   // Grat
        p.dot(e[0], e[1], '#ffffff'); g.dot(e[0], e[1], L > 2.5 ? ICE_G[4] : ICE_G[2]);
      }
    } else for (let s = 3; s <= 19; s += 2.2) {
      const side = (Math.round(s) % 2) ? 1 : -1;
      const L = 2 + hash2(Math.round(s), 2, 79) * 2.5;
      const bx = hx + dx * s + nx * side * 1.2, by = hy + dy * s + ny * side * 1.2;
      const ex = bx + nx * side * L + dx * 1.4, ey = by + ny * side * L + dy * 1.4;
      p.line(bx, by, ex, ey, RICE[3]); p.px(ex, ey, RICE[5]);
      p.line(bx + dx, by + dy, ex, ey, RICE[2]);
      g.px(ex, ey, ICE_G[2]);
    }
    const ex = tip.x + dx * 3, ey = tip.y + dy * 3;
    p.line(tip.x, tip.y, ex, ey, RICE[4]); p.px(ex, ey, RICE[5]); g.px(ex, ey, ICE_G[3]);
    if (p.fine) { p.fline(tip.x - nx * 0.25, tip.y - ny * 0.25, ex, ey, RICE[5]); p.dot(ex, ey, '#ffffff'); g.dot(ex, ey, ICE_G[5]); }
    tip = { x: ex, y: ey };
  }
  return tip;
}

function drawRevenant(p, g, P, X) {
  const R = rig(P, FRD, FRS.AX, FRS.AY);
  const { hip, pt, legF, legB, shF, shB, armF, armB } = R;
  const meta = {};
  const ice = P.ice > 0.5, gk = P.glow;
  const neck = pt(FRD.spine + 1.5, 0.8);
  const hx = Math.round(neck.x + P.head), hy = Math.round(neck.y - 3 + P.headY);

  // --- Zerfetzter Umhang hinten
  const ct = pt(FRD.spine, -2.5), cb = pt(FRD.spine - 0.5, 1.5);
  const hemB = { x: hip.x - 7 - P.cape * 5 + Math.sin(P.capeT) * 0.8, y: FRS.AY - 4 - P.cape * 2 }, hemF = { x: hip.x - 0.5, y: FRS.AY - 5 };
  poly(p, [[ct.x, ct.y], [cb.x, cb.y], [hemF.x, hemF.y], [hemB.x, hemB.y]], (x, y) => {
    if (p.fine) return CLOAKN[y < ct.y + 3 ? 3 : 2];
    if (hash2(x, y, 81) < 0.04) return null;
    let i = 2 + ((x + 40) % 3 === 0 ? -1 : 0) + (y < ct.y + 3 ? 1 : 0);
    return CLOAKN[clamp(i, 0, 4)];
  });
  if (p.fine) {
    // Handfein: Umhang mit zweifarbigen Falten (Schattenrinne + Lichtkante) und Reif an der Oberkante
    for (let k = 0; k < 4; k++) {
      const u = 0.15 + k * 0.24, ax = ct.x + (cb.x - ct.x) * u, ay = ct.y + (cb.y - ct.y) * u + 1.5;
      const bx = hemB.x + (hemF.x - hemB.x) * (u * 0.9), by = hemB.y + (hemF.y - hemB.y) * u - 1;
      p.fline(ax, ay, bx, by, CLOAKN[0]); p.fline(ax - 0.5, ay, bx - 0.5, by, CLOAKN[4]);
    }
    p.fline(ct.x, ct.y + 0.5, cb.x, cb.y + 0.5, '#5a6680');
  }
  for (let x = Math.round(hemB.x); x <= Math.round(hemF.x); x++) {
    const f = (x - hemB.x) / Math.max(1, hemF.x - hemB.x);
    const y0 = hemB.y + (hemF.y - hemB.y) * f;
    const L = 1 + Math.floor(hash2(x - Math.round(hip.x), 6, 83) * 4);
    if (p.fine) {
      // fein: Fetzen als Fäden; Eiszapfen spitz zulaufend mit weißer Spitze
      for (const o of [0, 0.5]) { const LL = L + (hash2(x * 2 + o * 2, 7, 83) - 0.5) * 1.5; p.fline(x + o, y0, x + o, y0 + LL - 0.5, o ? CLOAKN[0] : CLOAKN[1]); }
      if (ice && x % 3 === 0) { p.fline(x, y0 + L - 0.5, x, y0 + L + 1, RICE[4], 0.5); p.dot(x + 0.5, y0 + L + 0.5, RICE[2]); p.dot(x, y0 + L + 1.5, '#ffffff'); }
      continue;
    }
    for (let j = 0; j < L; j++) p.px(x, y0 + j, CLOAKN[j === L - 1 ? 0 : 1]);
    if (ice && x % 3 === 0) { p.px(x, y0 + L, RICE[3]); p.px(x, y0 + L + 1, RICE[4]); }   // Eiszapfen am Saum
  }

  // --- Hinterer Arm (Panzerhandschuh)
  cap(p, shB.x, shB.y, armB.jx, armB.jy, 1.8, 1.5, RSTEEL.slice(0, 5));
  cap(p, armB.jx, armB.jy, armB.ex, armB.ey, 1.6, 1.5, RSTEEL.slice(0, 5));
  ell(p, armB.ex, armB.ey, 1.5, 1.4, RSTEEL.slice(0, 5));

  // --- Beine (Beinschienen)
  const leg = (L, x0, near) => {
    const ramp = near ? RSTEEL : RSTEEL.slice(0, 5);
    cap(p, x0, hip.y, L.jx, L.jy, 2.7, 2.2, ramp, { noise: 0.15, seed: near ? 5 : 6 });
    cap(p, L.jx, L.jy, L.ex, L.ey - 1.5, 2.2, 2.0, ramp, { noise: 0.15, seed: near ? 7 : 8 });
    ell(p, L.jx + 0.5, L.jy, 1.8, 1.6, ramp);                            // Kniekachel
    p.rect(L.ex - 2, L.ey - 2, near ? 6 : 5, 2, ramp[near ? 3 : 1]); p.rect(L.ex - 2, L.ey - 1, near ? 6 : 5, 1, ramp[1]);
    if (p.fine) {
      // Beinschiene: Glanzlinie vorn, Knie-Niete mit Glanzpunkt, Schuhkappe mit Lichtkante
      const hi = near ? RSTEEL[6] : RSTEEL[4];
      p.fline(x0 - 1.5, hip.y + 0.5, L.jx - 1.5, L.jy, hi); p.fline(L.jx - 1.25, L.jy + 1.5, L.ex - 1.25, L.ey - 2.5, hi);
      p.dot(L.jx, L.jy - 0.5, hi); p.dot(L.jx + 0.5, L.jy, RSTEEL[1]);
      p.fline(L.ex - 2, L.ey - 2, L.ex + (near ? 3.5 : 2.5), L.ey - 2, near ? RSTEEL[5] : RSTEEL[3]);
    }
    if (!ice && near) { p.px(L.jx + 1.5, L.jy + 2.5, CORPSE[2]); p.px(L.jx + 1.5, L.jy + 3.5, CORPSE[1]); } // Lücke
    if (ice) iceSlab(p, g, [[L.jx - 1.5, L.jy - 2], [L.jx + 2.6, L.jy - 1], [L.jx + 2.2, L.jy + 3], [L.jx - 1, L.jy + 2.2]], P.crack, near ? 11 : 12);
  };
  leg(legB, hip.x - FRD.hipW, false);

  // --- Rumpf: Brustpanzer, Kettenschurz
  const hp = pt(0, 0), cp = pt(FRD.spine - 1, 0.5);
  for (let i = 0; i < 5; i++) {   // Kettenhemd-Schurz
    const a = pt(0.8, -3.2 + i * 1.6);
    if (p.fine) {
      // fein: Kettenhemd als Ringraster (Ring hell oben, dunkel unten)
      for (let j = 0; j < 4; j += 0.5) for (const o of [0, 0.5]) p.dot(a.x - P.lean * j + o + 0.5, a.y + j, ((j * 2 + (i & 1)) % 2) ? (o ? RSTEEL[2] : RSTEEL[4]) : (o ? RSTEEL[1] : RSTEEL[3]));
      continue;
    }
    for (let j = 0; j < 4; j++) p.px(a.x - P.lean * j, a.y + j, (i + j) % 2 ? RSTEEL[3] : RSTEEL[2]);
  }
  cap(p, hp.x, hp.y, cp.x, cp.y, 4.2, 5.4, RSTEEL, { noise: 0.2, seed: 13 });
  // Dellen/Rost
  for (let i = 0; i < 5; i++) { const d = pt(2 + hash2(i, 1, 85) * 6, -2.5 + hash2(i, 2, 85) * 5); p.px(d.x, d.y, i % 2 ? RUSTF[1] : RSTEEL[1]); if (p.fine) p.dot(d.x, d.y, i % 2 ? RUSTF[2] : RSTEEL[5]); }   // fein: Dellenrand fängt Licht
  if (p.fine) {
    // Brustpanzer: Glanzlinie auf der Wölbung, Glanzpunkt, Mittelgrat, Nietenreihe
    const q0 = pt(FRD.spine - 1.5, -3.2), q1 = pt(2.5, -3.6); p.fline(q0.x, q0.y, q1.x, q1.y, RSTEEL[6]);
    const g0 = pt(FRD.spine - 0.5, 0.5), g1 = pt(2.5, 0.8); p.fline(g0.x, g0.y, g1.x, g1.y, RSTEEL[5]); p.fline(g0.x + 0.5, g0.y + 0.5, g1.x + 0.5, g1.y + 0.5, RSTEEL[1]);
    const q2 = pt(FRD.spine - 2, -2.5); p.dot(q2.x, q2.y, '#d8e0ec');
    for (let k = 0; k < 4; k++) { const r = pt(FRD.spine - 0.8, -3 + k * 2); p.dot(r.x, r.y, RSTEEL[6]); p.dot(r.x + 0.5, r.y + 0.5, RSTEEL[0]); }
  }
  // Gürtel
  const b0 = pt(1.6, -3.5), b1 = pt(1.6, 3.8);
  p.line(b0.x, b0.y, b1.x, b1.y, CLOAKN[2]); const bk = pt(1.6, 1.5); p.px(bk.x, bk.y, RSTEEL[5]);
  // Kern: Riss im Panzer mit blauem Leuchten (ohne Eis), sonst unter dem Eis gedämpft
  const core = pt(FRD.spine - 3.5, 1.6);
  if (!ice) {
    poly(p, [[core.x - 1.5, core.y - 2.5], [core.x + 2.2, core.y - 1.2], [core.x + 1.2, core.y + 2.5], [core.x - 1.2, core.y + 1.5]], CORPSE[1]);
    for (let r = 0; r < 3; r++) p.px(core.x - 0.5 + r * 0.6, core.y - 1.2 + r * 1.2, '#8a9aa6');   // Rippen
    p.px(core.x + 0.4, core.y + 0.2, BLUEG[3]); p.px(core.x - 0.3, core.y + 0.6, BLUEG[2]);
    if (p.fine) { p.dot(core.x + 0.5, core.y + 0.5, '#ffffff'); g.dot(core.x + 0.5, core.y + 0.5, '#ffffff'); p.fline(core.x - 1.5, core.y - 2.5, core.x + 2.2, core.y - 1.2, '#5a6a7a'); }   // Kern weißglühend, Risskante
    glowDot(g, core.x + 0.3, core.y + 0.3, 1.4 * gk + 0.4, BLUEG);
    // Leuchtadern
    for (let i = 0; i < 4; i++) {
      let x = core.x, y = core.y;
      for (let s = 0; s < 3; s++) { x += Math.cos(i * 1.6 + s * 0.4) * 1.2; y += Math.sin(i * 1.6 + s * 0.4) * 1.2; if (gk > 0.3) g.px(x, y, BLUEG[1]); }
    }
  } else {
    iceSlab(p, g, [[core.x - 3.5, core.y - 4.2], [core.x + 3.2, core.y - 3.4], [core.x + 3.6, core.y + 1.5], [core.x + 0.5, core.y + 4], [core.x - 3, core.y + 2.5]], P.crack, 14);
    // tiefblauer Kern schimmert durch das Eis
    ell(p, core.x + 0.2, core.y + 0.2, 1.8, 1.8, ['#0a1a5a', '#1838a8', '#3a70e8', '#a8d0ff']);
    p.px(core.x - 0.4, core.y - 0.4, '#e8f4ff');
    if (p.fine) { p.dot(core.x + 0.25, core.y + 0.25, '#ffffff'); p.dot(core.x - 0.25, core.y + 0.25, '#e8f4ff'); }
    glowDot(g, core.x + 0.2, core.y + 0.2, 1.6 * gk + 0.8, BLUEG);
  }

  leg(legF, hip.x + FRD.hipW, true);

  // --- Schultern
  const pauldron = (sh, near) => {
    ell(p, sh.x, sh.y, near ? 3.8 : 3.2, 2.8, near ? RSTEEL : RSTEEL.slice(0, 5), { noise: 0.15, seed: near ? 15 : 16 });
    p.line(sh.x - 2.5, sh.y + 1.5, sh.x + 2.5, sh.y + 1.8, RSTEEL[1]);
    if (p.fine) {
      // Schulterplatte: Glanzlinie auf dem Bogen, Glanzpunkt, Lamellenkante hell über der Fuge, Nieten
      for (let a = -2.6; a <= -1.2; a += 0.12) p.dot(sh.x + Math.cos(a) * (near ? 3.2 : 2.6), sh.y + Math.sin(a) * 2.2, near ? RSTEEL[6] : RSTEEL[4]);
      p.dot(sh.x - 1.5, sh.y - 1.5, near ? '#e0e8f4' : RSTEEL[5]);
      p.fline(sh.x - 2.5, sh.y + 1, sh.x + 2.5, sh.y + 1.25, near ? RSTEEL[5] : RSTEEL[3]);
      for (const k of [-1.5, 1.5]) p.dot(sh.x + k, sh.y + 2.25, RSTEEL[near ? 6 : 4]);
    }
    if (!ice && near) { p.px(sh.x + 1, sh.y - 1, RUSTF[2]); p.px(sh.x + 2, sh.y, RUSTF[1]); }
    if (ice) {
      iceSlab(p, g, [[sh.x - 3.8, sh.y + 0.5], [sh.x - 2.5, sh.y - 3.2], [sh.x + 2.5, sh.y - 3.5], [sh.x + 4, sh.y + 0.8], [sh.x, sh.y + 2.2]], P.crack, near ? 17 : 18);
      // Eisdornen nach oben
      for (let i = 0; i < 3; i++) {
        const bx = sh.x - 2 + i * 2, by = sh.y - 3;
        const L = 4 + (i === 1 ? 2 : 0) - (near ? 0 : 1);
        if (p.fine) {
          // fein: Eisdorn zweiflächig, verjüngt, weiße Spitze
          p.each(bx - 1.5, by - L, bx + 2, by + 0.5, (x, y) => {
            const s = by + 0.5 - y, c = bx + 0.5 - s * 0.35, w = (1 - s / L) * 0.8;
            if (s < 0 || s > L || Math.abs(x - c) > w) return null;
            return x < c - 0.1 ? RICE[s > L - 1.5 ? 5 : 4] : RICE[s > L - 1.5 ? 4 : 2];
          });
          p.dot(bx + 0.5 - (L - 0.5) * 0.35, by - L + 0.5, '#ffffff'); g.dot(bx + 0.5 - (L - 0.5) * 0.35, by - L + 0.5, ICE_G[3]);
          continue;
        }
        for (let s = 0; s < L; s++) { const w = (1 - s / L) * 1.1; p.px(bx - s * 0.35, by - s, RICE[s > L - 2 ? 5 : 3]); if (w > 0.6) p.px(bx - s * 0.35 + 1, by - s, RICE[2]); }
        g.px(bx - (L - 1) * 0.35, by - L + 1, ICE_G[2]);
      }
    }
  };
  pauldron(shB, false);

  // Kopf und vorderer Arm. Fein: vordere Schulter zuerst, dann der Kopf, dann Arm und Schwert – so verdeckt
  // die Schulter (Eisplatte, Dornen) das Helmvisier nicht mehr; grob bleibt die alte Reihenfolge.
  const head = () => {
    // --- Kopf: Topfhelm mit Sehschlitz
    ell(p, hx + 0.5, hy, 3.9, 4.2, RSTEEL, { noise: 0.12, seed: 19, bias: 0.04 });
    p.rect(hx - 3, hy + 2.5, 7, 1.5, RSTEEL[2]);                   // Unterrand
    p.line(hx + 1.5, hy - 3.6, hx + 1.5, hy + 3, RSTEEL[5]);        // Mittelgrat
    // fein: dunkles Visierfeld unter dem Schlitz (Gesicht lesbar), Unterkante mit Lichtkante
    if (p.fine) {
      poly(p, [[hx - 0.5, hy - 1.5], [hx + 5, hy - 1.5], [hx + 4.5, hy + 2.5], [hx + 0.5, hy + 2.75]], RSTEEL[1]);
      p.fline(hx + 0.5, hy + 2.75, hx + 4.5, hy + 2.5, RSTEEL[3]); p.fline(hx + 5, hy - 1.5, hx + 4.5, hy + 2.5, RSTEEL[0]);
    }
    // Sehschlitz mit blauen Augen
    p.rect(hx, hy - 0.6, 4.5, 1.2, '#04060a');
    const ec = P.eye > 1.2 ? BLUEG[4] : BLUEG[3];
    if (P.eye > 0.2) {
      p.px(hx + 1.5, hy - 0.4, ec); p.px(hx + 3.2, hy - 0.4, ec);
      g.px(hx + 1.5, hy - 0.4, BLUEG[3]); g.px(hx + 3.2, hy - 0.4, BLUEG[3]); g.px(hx + 2.4, hy - 0.4, BLUEG[1]);
      if (P.eye > 1.2) { g.px(hx + 4.5, hy - 0.4, BLUEG[2]); g.px(hx + 5.5, hy - 0.7, BLUEG[1]); }
    }
    // Atemlöcher
    p.px(hx + 3, hy + 1.6, '#04060a'); p.px(hx + 2, hy + 1.8, '#04060a');
    if (p.fine) {
      // Handfein: Topfhelm – Glanzlinie auf der Kuppel, Glanzpunkt, Mittelgrat zweifarbig, Sehschlitz mit Lichtkante
      // darüber, Augen mit weißem Kern im blauen Saum, Atemlöcher als Kreuzmuster, Nietenreihe am Unterrand
      for (let a = -2.7; a <= -1.0; a += 0.1) p.dot(hx + 0.5 + Math.cos(a) * 3.3, hy + Math.sin(a) * 3.6, RSTEEL[6]);
      p.dot(hx - 1, hy - 2.5, '#e8eef8'); p.dot(hx - 0.5, hy - 2.5, RSTEEL[6]);
      p.fline(hx + 1.5, hy - 3.5, hx + 1.5, hy - 1, RSTEEL[6]); p.fline(hx + 2, hy - 3.5, hx + 2, hy - 1, RSTEEL[2]);
      p.fline(hx, hy - 1, hx + 4.5, hy - 1, RSTEEL[5]); p.fline(hx, hy + 0.5, hx + 4.5, hy + 0.5, RSTEEL[1]);
      if (P.eye > 0.2) { for (const ex of [1.5, 3.2]) { p.dot(hx + ex, hy - 0.5, '#ffffff'); g.dot(hx + ex, hy - 0.5, '#ffffff'); p.dot(hx + ex + 0.5, hy - 0.5, BLUEG[3]); p.dot(hx + ex - 0.5, hy - 0.5, BLUEG[2]); } g.fline(hx + 0.5, hy - 0.5, hx + 4.5, hy - 0.5, BLUEG[2]); g.fline(hx + 1, hy - 1, hx + 4, hy - 1, BLUEG[1]); g.fline(hx + 1, hy, hx + 4, hy, BLUEG[1]); }   // Augenglut mit Saum
      for (const [a, b] of [[2, 1.5], [3, 1.5], [2.5, 2], [3.5, 2]]) p.dot(hx + a, hy + b, '#04060a');
      for (let k = -2.5; k <= 3.5; k += 1.5) p.dot(hx + k, hy + 3, RSTEEL[5]);
    }
    meta.eye = { x: hx + 2.4, y: hy - 0.4 };
    meta.mouth = { x: hx + 3, y: hy + 2 };
    if (ice) {
      // Eiskrone und Eisbart
      for (let i = 0; i < 4; i++) {
        const bx = hx - 2 + i * 1.6, by = hy - 3.4 + Math.abs(i - 1.5) * 0.4;
        const L = [4, 6, 5, 3][i];
        for (let s = 0; s < L; s++) { p.px(bx - s * 0.3, by - s, CROWN[s >= L - 2 ? 3 : 1 + (i % 2)]); g.px(bx - s * 0.3, by - s, s >= L - 2 ? '#3a4a66' : '#141c2c'); }
        g.px(bx - (L - 1) * 0.3, by - L + 1, ICE_G[3]);
        if (p.fine) { p.fline(bx + 0.5, by + 0.5, bx + 0.5 - (L - 1) * 0.3, by - L + 1.5, CROWN[0]); p.fline(bx, by, bx - (L - 1) * 0.3, by - L + 1, CROWN[3]); p.dot(bx - (L - 1) * 0.3, by - L + 1, '#ffffff'); }   // Zacke: Schattenfläche rechts, Grat hell
      }
      for (let i = 0; i < 5; i++) {
        const bx = hx - 1 + i * 1.2, by = hy + 3.6;
        const L = 2 + (i % 3);
        if (p.fine) { p.fline(bx, by, bx + (L - 1) * 0.1, by + L - 0.5, CROWN[2], 0.5); p.fline(bx + 0.5, by, bx + 0.5, by + L - 1, CROWN[0]); p.dot(bx + (L - 1) * 0.1, by + L - 0.5, '#ffffff'); continue; }   // Eiszapfen-Bart
        for (let s = 0; s < L; s++) p.px(bx + s * 0.1, by + s, CROWN[s === L - 1 ? 3 : 2]);
      }
      meta.head = { x: hx, y: hy - 9 };
    } else {
      // Riss im Helm, abgebrochenes Horn
      p.line(hx - 1.5, hy - 3, hx + 0.5, hy - 1, RSTEEL[1]); g.px(hx - 0.5, hy - 2, BLUEG[1]);
      p.line(hx - 2.5, hy - 2.5, hx - 4, hy - 5, BONE[1]); p.px(hx - 4, hy - 5, BONE[2]);
      meta.head = { x: hx, y: hy - 6 };
    }
    // Frostatem
    if (P.mist > 0) {
      for (let i = 0; i < 4; i++) {
        const u = ((P.capeT / TAU) + i * 0.25) % 1;
        const x = hx + 5 + u * 5, y = hy + 1.5 - u * 3 + Math.sin(P.capeT + i) * 0.6;
        if (p.fine) { const c = ['#eef6fa', '#c6dce8', '#9ab8cc'][Math.floor(u * 3)]; p.dot(x, y, c); p.dot(x + 0.5, y - 0.5, c); if (u < 0.5) p.dot(x + 0.5, y, c); continue; }
        p.px(x, y, ['#eef6fa', '#c6dce8', '#9ab8cc'][Math.floor(u * 3)]);
      }
    }

  };
  let tip;
  const front = () => {
    // --- vorderer Arm + Schwert
    if (X.smear) smearArc(p, g, shF.x, shF.y, X.smear[0], X.smear[1], 10, 24, FROST_SMEAR, ['#2a7ab0', '#a0e8ff'], X.smear[2] ?? 1);
    tip = P.held > 0.5 ? revSword(p, g, armF.ex, armF.ey, P.wa, P.ice) : { x: armF.ex, y: armF.ey };
    cap(p, shF.x, shF.y, armF.jx, armF.jy, 2.0, 1.7, RSTEEL);
    cap(p, armF.jx, armF.jy, armF.ex, armF.ey, 1.8, 1.7, RSTEEL);
    ell(p, armF.ex, armF.ey, 1.7, 1.6, RSTEEL);
    if (p.fine) { p.fline(shF.x - 1.5, shF.y + 0.5, armF.jx - 1.5, armF.jy, RSTEEL[6]); p.dot(armF.ex - 0.75, armF.ey - 0.75, '#e0e8f4'); for (let k = -1; k <= 1; k++) p.dot(armF.ex + 1, armF.ey + k * 0.5, RSTEEL[1]); }   // Armschiene, Handschuh-Fingerfugen
    if (ice) iceSlab(p, g, [[armF.jx - 1, armF.jy - 1.5], [armF.jx + 2.5, armF.jy - 1.8], [armF.ex + 1, armF.ey - 1.2], [armF.ex - 1.2, armF.ey + 1.2], [armF.jx - 1.5, armF.jy + 1.2]], P.crack, 21);
    else { const m = { x: (armF.jx + armF.ex) / 2, y: (armF.jy + armF.ey) / 2 }; p.px(m.x, m.y + 1, CORPSE[2]); g.px(m.x, m.y + 1, BLUEG[0]); }
  };
  if (p.fine) { pauldron(shF, true); head(); front(); }
  else { head(); front(); pauldron(shF, true); }
  meta.hand = { x: armF.ex, y: armF.ey };
  meta.tip = tip;
  if (X.burst) {   // Eisstoß: Splitterstern an der Spitze
    const k = X.burst;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + 0.2, r = 2 + k * 4 + hash2(i, 1, 87) * 2;
      const x = tip.x + Math.cos(a) * r, y = tip.y + Math.sin(a) * r * 0.8;
      if (p.fine) { p.fline(x - Math.cos(a) * 1.5, y - Math.sin(a) * 1.2, x, y, RICE[4], 0.5); p.dot(x, y, '#ffffff'); g.fline(x - Math.cos(a), y - Math.sin(a) * 0.8, x, y, ICE_G[3]); g.dot(x, y, ICE_G[5]); continue; }
      p.px(x, y, RICE[4]); p.px(x - Math.cos(a), y - Math.sin(a) * 0.8, RICE[3]); g.px(x, y, ICE_G[3]);
    }
    glowDot(g, tip.x, tip.y, 1.5 + k, ICE_G);
  }
  if (X.dust) dust(p, FRS.AX + X.dust, FRS.AY, 9, 7, ['#c6dce8', '#eef6fa', '#9ab8cc'], 14);
  return meta;
}

// Splitter des berstenden Eispanzers (fliegen nach außen, fallen)
function iceShards(k, AX, AY) {
  return (p, g) => {
    for (let i = 0; i < 22; i++) {
      const a = -Math.PI * (0.05 + hash2(i, 1, 91) * 0.9) + (hash2(i, 4, 91) < 0.25 ? Math.PI * 0.15 : 0);
      const v = 10 + hash2(i, 2, 91) * 16;
      const x0 = AX - 4 + hash2(i, 3, 91) * 10, y0 = AY - 12 - hash2(i, 5, 91) * 22;
      const x = x0 + Math.cos(a) * v * k, y = Math.min(AY - 1, y0 + Math.sin(a) * v * k + 30 * k * k);
      const L = 1 + (i % 3);
      if (p.fine) { p.fline(x, y, x + (L - 1) * 0.5, y + L - 1, RICE[3], 0.5); p.fline(x - 0.25, y, x + (L - 1) * 0.5 - 0.25, y + L - 1, RICE[5]); p.dot(x, y, '#ffffff'); if (k < 0.7) g.dot(x, y, ICE_G[k < 0.4 ? 5 : 3]); continue; }   // Splitter mit Lichtkante
      for (let s = 0; s < L; s++) p.px(x + s * 0.5, y + s, RICE[s === 0 ? 5 : 3]);
      if (k < 0.7) g.px(x, y, ICE_G[k < 0.4 ? 4 : 2]);
    }
    if (k < 0.35) glowDot(g, AX + 2, AY - 22, 4 - k * 6, ICE_G);
    return {};
  };
}

function revenantAnims() {
  const mk = (P, X) => makeFrame(FRS, drawRevenant, P, X);
  const idleA = frp();
  const sets = {};
  for (const bare of [false, true]) {
    const iceV = bare ? 0 : 1;
    const base = frp({ ice: iceV });
    const idle = track(mk, cycle((ph) => {
      const s = Math.sin(ph);
      return frp({ ice: iceV, hipY: (1 - Math.cos(ph)) * 0.4, lean: 0.08 + s * 0.02, hFy: 8 + s * 0.4, hBy: 9 + s * 0.5, capeT: ph, mist: 1, glow: 0.8 + s * 0.25, wa: -1.05 + s * 0.03 });
    }, 6), 6, { loop: true });
    const walk = track(mk, walkKeys(base, 8, {
      stride: 4, lift: 2, bob: 1.2, arm: 1,
      extra: (ph, s) => ({ cape: 0.5, capeT: ph, mist: 1, lean: 0.14, wa: -1.0 + s * 0.06 }),
    }), 8, { loop: true, extras: { 0: { fx: 'step', dust: 2 }, 4: { fx: 'step', dust: -2 } } });
    // Eisstoß: Schwert waagerecht an die Hüfte zurückziehen, dann vorstoßen
    const w1 = frp({ ice: iceV, lean: -0.05, hipX: -1, hFx: 1, hFy: 6, wa: -0.25, hBx: 4, hBy: 7, fFx: 4.5, fBx: -4.5, eye: 1.2, capeT: 1, cape: 0.2 });
    const w2 = frp({ ice: iceV, lean: -0.16, hipX: -2.5, hipY: 1.5, hFx: -3, hFy: 5, wa: -0.08, hBx: 3, hBy: 5, fFx: 6, fBx: -5, eye: 1.5, capeT: 2, cape: 0.35, mist: 1 });
    const windup = track(mk, [[0, base], [0.45, w1], [1, w2]], 4);
    const s1 = frp({ ice: iceV, lean: 0.25, hipX: 2, hipY: 1, hFx: 9, hFy: 5, wa: -0.04, hBx: 6, hBy: 5, fFx: 8, fBx: -5, eye: 1.5, cape: 0.8, capeT: 3 });
    const s2 = frp({ ice: iceV, lean: 0.38, hipX: 4, hipY: 2, hFx: 13, hFy: 4.5, wa: 0, hBx: 8, hBy: 5, fFx: 10, fBx: -5, eye: 1.5, cape: 1, capeT: 4 });
    const s3 = frp({ ice: iceV, lean: 0.3, hipX: 3.5, hipY: 1.5, hFx: 11, hFy: 6, wa: 0.15, hBx: 6, hBy: 6, fFx: 10, fBx: -5, eye: 1.2, cape: 0.6, capeT: 5 });
    const strike = [mk(s1), mk(s2, { fx: 'impact', burst: 0.4, dust: 8 }), mk(s3, { burst: 1 }), mk(mixP(s3, base, 0.55))];
    sets[bare ? 'bare' : 'ice'] = { idle, walk, windup, strike, base };
  }
  const B = sets.bare.base;
  const hurtP = frp({ ice: 0, lean: -0.15, hipX: -1.5, head: -1, headY: 0.5, hFx: 4, hFy: 6, wa: -1.6, hBx: -1, hBy: 6, eye: 0.6, glow: 1.6, cape: -0.2 });
  const hurt = [mk(hurtP), mk(mixP(hurtP, B, 0.5))];
  // Bersten des Eispanzers
  const sh0 = frp({ ice: 1, crack: 0.5, lean: -0.05, hFy: 7, eye: 1.3, glow: 1.5 });
  const sh1 = frp({ ice: 1, crack: 1, lean: -0.12, hipX: -0.5, hFx: 5, hFy: 5, hBx: 0, hBy: 6, eye: 1.6, glow: 2 });
  const sh2 = frp({ ice: 0, lean: -0.2, hipX: -1.5, hipY: 1, hFx: 4, hFy: 3, wa: -1.4, hBx: -2, hBy: 4, eye: 1.6, glow: 2, cape: 0.5 });
  const shatter = [
    mk(sh0), mk(sh1, { fx: 'impact' }),
    mk(sh2, { post: iceShards(0.2, FRS.AX, FRS.AY) }), mk(sh2, { post: iceShards(0.5, FRS.AX, FRS.AY) }),
    mk(mixP(sh2, B, 0.5), { post: iceShards(0.8, FRS.AX, FRS.AY) }), mk(B, { post: iceShards(1, FRS.AX, FRS.AY) }),
  ];
  // Tod (ohne Panzer): auf die Knie, vornüber; das blaue Leuchten erlischt
  const d1 = frp({ ...hurtP, glow: 2, eye: 1.5 });
  const d2 = frp({ ice: 0, lean: 0.3, hipY: 5.5, hipX: 1, fFx: 5, fBx: -4, hFx: 7, hFy: 10, wa: 0.9, hBx: 4, hBy: 10, eye: 0.6, glow: 0.8, head: 1, headY: 1 });
  const d3 = { ...d2, lean: 0.05, hipY: 6, eye: 0, glow: 0.2, held: 0 };
  const flat = frp({ held: 0, ice: 0, lean: 0.1, hipY: 0, fFx: 2, fBx: -2.5, fBy: 0.5, hFx: 5, hFy: 9, hBx: 3, hBy: 10, wa: 1.2, eye: 0, glow: 0.2, head: 1, headY: 1, cape: 0.4 });
  const piv = [FRS.AX + 4, FRS.AY - 1];
  const swordDown = (p, g) => { revSword(p, g, FRS.AX - 4, FRS.AY - 2, 0.02, 0); return {}; };
  const death = [
    mk(d1), mk(d2), mk(d3, { post: swordDown }),
    mk(flat, { rot: [0.7, ...piv], post: swordDown }),
    mk({ ...flat, glow: 0 }, { rot: [1.3, ...piv], post: swordDown, fx: 'impact', dust: 6 }),
    mk({ ...flat, glow: 0 }, { rot: [Math.PI / 2, ...piv], post: swordDown }),
  ];
  const I = sets.ice, Bs = sets.bare;
  return {
    idle: new Animation(I.idle, 5),
    walk: new Animation(I.walk, 8),
    windup: new Animation(I.windup, 7, false),
    strike: new Animation(I.strike, 13, false),
    idle_bare: new Animation(Bs.idle, 6),
    walk_bare: new Animation(Bs.walk, 9),
    windup_bare: new Animation(Bs.windup, 8, false),
    strike_bare: new Animation(Bs.strike, 14, false),
    shatter: new Animation(shatter, 10, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 8, false),
  };
}

// ================================================================ Schneewurm

const SBS = { W: 76, H: 56, AX: 34, AY: 50, pad: 12, rim: RIM_FROST };
const WYRM = ['#141a26', '#222c3e', '#334058', '#4a5c78', '#647c9a', '#8aa2bc', '#b6c8da'];
const WBELLY = ['#2a3444', '#44546a', '#64788e', '#8a9eb2', '#b0c2d2'];
const MAW = ['#1a060c', '#34101c', '#52202e'];
const SNOW = ['#8ea6bc', '#b4c8d8', '#d8e6f0', '#f2f8fc'];
const SB_REST = { rise: 1, sway: 0, jaw: 0, ph: 0, coil: 0, pitch: 0, eye: 1, lie: 0, curl: 0 };
const sbp = (o = {}) => ({ ...SB_REST, ...o });

// Wirbelsäule: Schwanzende am Boden hinten -> Hals aufgerichtet -> Kopf
function wyrmSpine(P, AX, AY) {
  const pts = [];
  const N = 15;
  const headX = AX + 8 + P.sway, headY = AY - 6 - P.rise * 21;
  const neckBase = { x: AX + 1 + P.sway * 0.25, y: AY - 4 };
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    if (t < 0.55) {   // am Boden liegender Leib, schlängelt
      const u = t / 0.55;
      const x = AX - 22 + u * (neckBase.x - (AX - 22)) + Math.sin(P.ph + u * 3) * 0.6;
      const y = AY - 3 - Math.sin(P.ph * 1 + u * 5) * 1.2 * (1 - P.lie) - u * 1 - P.coil * Math.sin(u * Math.PI) * 3;
      pts.push({ x, y, r: 2 + u * 3.3 });
    } else {          // aufgerichteter Hals (Bezier)
      const u = (t - 0.55) / 0.45;
      const cx = neckBase.x + 6 + P.sway * 0.4, cy = neckBase.y - 4 - P.rise * 6;
      const x = (1 - u) * (1 - u) * neckBase.x + 2 * (1 - u) * u * cx + u * u * (headX - 3);
      const y = (1 - u) * (1 - u) * neckBase.y + 2 * (1 - u) * u * cy + u * u * (headY + 2);
      pts.push({ x, y, r: 5.3 - u * 1.2 });
    }
  }
  return { pts, head: { x: headX, y: headY } };
}

function drawBurrower(p, g, P, X) {
  const { AX, AY } = SBS;
  const meta = {};
  const { pts, head } = wyrmSpine(P, AX, AY);
  // Schatten-Schneespur unter dem Leib
  oval(p, AX - 8, AY - 1, 17, 1.5, '#7890a6');
  // Segmente von hinten nach vorn
  for (let i = 0; i < pts.length; i++) {
    const q = pts[i];
    ell(p, q.x, q.y, q.r * 1.05, q.r, WYRM, { noise: 0.15, seed: 31 + i, bias: 0.02 });
    if (p.fine) {
      // Handfein: Panzerring – dunkle Fuge zum vorigen Segment, Glanzlinie (1 Feinpixel) oben links, Glanzpunkt
      const pr = pts[Math.max(0, i - 1)], b = i > 0 ? Math.atan2(pr.y - q.y, pr.x - q.x) : Math.PI;
      if (i > 0) for (let a = b - 1.1; a <= b + 1.1; a += 0.12) p.dot(q.x + Math.cos(a) * q.r * 0.98, q.y + Math.sin(a) * q.r * 0.95, WYRM[0]);
      for (let a = -2.5; a <= -1.25; a += 0.1) p.dot(q.x + Math.cos(a) * q.r * 0.8, q.y + Math.sin(a) * q.r * 0.75, WYRM[6]);
      p.dot(q.x - q.r * 0.35, q.y - q.r * 0.5, '#e0eaf4');
    }
    // Bauchschuppen (vorn/unten)
    if (i > 2) {
      const n = i < pts.length - 1 ? pts[i + 1] : q;
      const ang = Math.atan2(n.y - q.y, n.x - q.x);
      const bx = q.x + Math.cos(ang + Math.PI / 2) * q.r * 0.65, by = q.y + Math.sin(ang + Math.PI / 2) * q.r * 0.65;
      if (p.fine) {
        // fein: Bauchschuppe als heller Bogen mit dunkler Kante darunter
        p.fline(bx - Math.cos(ang) * 0.75, by - Math.sin(ang) * 0.75, bx + Math.cos(ang) * 1.25, by + Math.sin(ang) * 1.25, WBELLY[4]);
        p.fline(bx - Math.cos(ang) * 0.5 - Math.sin(ang) * -0.5, by - Math.sin(ang) * 0.5 + Math.cos(ang) * 0.5, bx + Math.cos(ang) * 1.25 + Math.sin(ang) * 0.5, by + Math.sin(ang) * 1.25 + Math.cos(ang) * 0.5, WBELLY[1]);
      } else { p.px(bx, by, WBELLY[3]); p.px(bx + Math.cos(ang), by + Math.sin(ang), WBELLY[2]); }
    }
    // Panzerkante + Rückendorn aus Eis
    if (i % 2 === 0 && i > 0) {
      const n = pts[Math.min(pts.length - 1, i + 1)];
      const ang = Math.atan2(n.y - q.y, n.x - q.x) - Math.PI / 2;
      const bx = q.x + Math.cos(ang) * q.r, by = q.y + Math.sin(ang) * q.r;
      const L = 2 + (i > 8 ? 2 : 1);
      if (p.fine) {
        // fein: Eisdorn zweiflächig (Lichtseite hell), weiße Spitze
        const da = ang - 0.5, ex = bx + Math.cos(da) * (L - 0.5), ey = by + Math.sin(da) * (L - 0.5), ox = Math.cos(da - Math.PI / 2) * 0.5, oy = Math.sin(da - Math.PI / 2) * 0.5;
        p.fline(bx - ox, by - oy, ex, ey, ICE[2]); p.fline(bx, by, ex, ey, ICE[3]); p.fline(bx + ox, by + oy, ex, ey, ICE[4]);
        p.dot(ex, ey, ICE[5]); g.dot(ex, ey, ICE_G[2]);
      } else {
        for (let s = 0; s < L; s++) p.px(bx + Math.cos(ang - 0.5) * s, by + Math.sin(ang - 0.5) * s, ICE[s === L - 1 ? 5 : 3]);
        g.px(bx + Math.cos(ang - 0.5) * (L - 1), by + Math.sin(ang - 0.5) * (L - 1), ICE_G[1]);
      }
    }
    if (!p.fine && i > 0 && i % 2 === 1) {   // dunkle Fuge zwischen Platten
      const pr = pts[i - 1];
      p.px((q.x + pr.x) / 2, (q.y + pr.y) / 2 - q.r * 0.7, WYRM[1]);
    }
  }
  // --- Kopf: breiter Panzerschädel, Kragen aus Eisdornen, Riesenmaul
  const hx = head.x, hy = head.y, pitch = P.pitch;
  const fx = Math.cos(pitch), fy = Math.sin(pitch);
  const HK = 1.25;
  const at = (a, b) => ({ x: hx + (fx * a - fy * b) * HK, y: hy + (fy * a + fx * b) * HK });
  // Kragen
  for (let i = 0; i < 5; i++) {
    const a = -2.2 - i * 0.32 + pitch;
    const L = 4 + (i === 2 ? 3 : i % 2 ? 1 : 2);
    const bx = hx - 2 * fx, by = hy - 2 * fy;
    if (p.fine) {
      // fein: Kragendorn als verjüngter Eiskeil, Grat hell, Schattenkante dunkel
      const x0 = bx + Math.cos(a) * 4, y0 = by + Math.sin(a) * 4, ex = bx + Math.cos(a) * (3.5 + L), ey = by + Math.sin(a) * (3.5 + L), ox = -Math.sin(a) * 0.5, oy = Math.cos(a) * 0.5;
      p.fline(x0 + ox, y0 + oy, ex, ey, ICE[2]); p.fline(x0, y0, ex, ey, ICE[3]); p.fline(x0 - ox, y0 - oy, ex, ey, ICE[4]); p.dot(ex, ey, ICE[5]);
      g.dot(ex, ey, ICE_G[3]);
      continue;
    }
    for (let s = 0; s < L; s++) { p.px(bx + Math.cos(a) * (4 + s), by + Math.sin(a) * (4 + s), ICE[s > L - 2 ? 5 : s > 1 ? 3 : 2]); }
    g.px(bx + Math.cos(a) * (3 + L), by + Math.sin(a) * (3 + L), ICE_G[2]);
  }
  // Unterkiefer (klappt nach unten)
  const ja = pitch + P.jaw * 0.75;
  const jx = Math.cos(ja), jy = Math.sin(ja);
  const J = (a, b) => ({ x: hx + (jx * a - jy * b) * HK, y: hy + (jy * a + jx * b) * HK });
  const j0 = J(-2, 2), j1 = J(8.5, 2.3), j2 = J(8, 4.2), j3 = J(-2, 4.6);
  if (P.jaw > 0.12) {
    const u0 = at(-1, 0.5), u1 = at(9, 0.5);
    poly(p, [[u0.x, u0.y], [u1.x, u1.y], [j1.x, j1.y], [j0.x, j0.y]], (x, y) => (p.fine ? MAW[((x - hx) * fx + (y - hy) * fy) < 2 ? 0 : 1] : MAW[hash2(x, y, 5) < 0.3 ? 2 : 1]));
    p.line(J(0, 2.6).x, J(0, 2.6).y, J(6, 2.6).x, J(6, 2.6).y, '#7a2a3a');            // Zunge
    if (p.fine) { p.fline(J(0.5, 2.3).x, J(0.5, 2.3).y, J(5.5, 2.3).x, J(5.5, 2.3).y, '#a8485a'); p.fline(J(1, 2.9).x, J(1, 2.9).y, J(5, 2.9).x, J(5, 2.9).y, MAW[0]); }   // Zunge mit Glanz und Rinne
  }
  poly(p, [[j0.x, j0.y], [j1.x, j1.y], [j2.x, j2.y], [j3.x, j3.y]], (x, y) => WYRM[(y > (j0.y + j2.y) / 2 ? 2 : 3) + (!p.fine && hash2(x, y, 41) < 0.15 ? 1 : 0)]);
  if (p.fine) p.fline(j0.x, j0.y + 0.5, j1.x, j1.y + 0.5, WYRM[5]);   // Kieferkante im Licht
  // Unterkiefer-Zähne (nach oben)
  for (let k = 0; k < 4; k++) {
    const b = J(1 + k * 2, 2), L = k === 3 ? 3 : 2;
    if (p.fine) { const ex = b.x + jy * (L - 0.5), ey = b.y - jx * (L - 0.5); p.fline(b.x, b.y, ex, ey, ICE[3], 1); p.fline(b.x - 0.25, b.y, ex - 0.25, ey, ICE[5]); p.dot(ex, ey, '#ffffff'); if (P.jaw > 0.3) g.dot(ex, ey, ICE_G[3]); continue; }
    for (let s = 0; s < L; s++) p.px(b.x + jy * s, b.y - jx * s, s === L - 1 ? ICE[5] : ICE[4]);
    if (P.jaw > 0.3) g.px(b.x + jy * (L - 1), b.y - jx * (L - 1), ICE_G[2]);
  }
  // Oberschädel
  ell(p, at(1, -0.5).x, at(1, -0.5).y, 5.6 * HK, 4.2 * HK, WYRM, { rot: pitch, noise: 0.14, seed: 43, bias: 0.04 });
  const s0 = at(3, -3.8), s1 = at(10.5, -0.6), s2 = at(10, 1.4), s3 = at(3, 1.8);
  poly(p, [[s0.x, s0.y], [s1.x, s1.y], [s2.x, s2.y], [s3.x, s3.y]], (x, y) => {
    const d = (x - s0.x) * -fy + (y - s0.y) * fx;
    return WYRM[d < 1.5 ? 5 : d < 3 ? 4 : 3];
  });
  // Stirnplatten
  if (p.fine) {
    // Handfein: Stirnplatten als Schuppenbögen mit Glanzlinie, Schnauzenrücken-Licht, Glanzpunkt
    for (let k = 0; k < 4; k++) { const a0 = at(0.5 + k * 2.2, -3.8 + k * 0.6), a1 = at(2.3 + k * 2.2, -3.3 + k * 0.6); p.fline(a0.x, a0.y, a1.x, a1.y, WYRM[6]); p.fline(a0.x, a0.y + 0.5, a1.x, a1.y + 0.5, WYRM[2]); }
    const n0 = at(4, -3), n1 = at(10, -0.8); p.fline(n0.x, n0.y, n1.x, n1.y, WYRM[6]); const gp = at(1, -3.5); p.dot(gp.x, gp.y, '#eef4fa');
  } else for (let k = 0; k < 3; k++) { const q = at(1 + k * 2.6, -3.4 + k * 0.7); p.px(q.x, q.y, WYRM[6]); p.px(q.x + 1, q.y, WYRM[4]); }
  // Oberkiefer-Eiszähne (lang, nach unten)
  for (let k = 0; k < 5; k++) {
    const b = at(2 + k * 1.9, 1.6), L = k === 1 || k === 4 ? 5 + P.jaw * 1.5 : 3;
    if (p.fine) { p.fline(b.x + 0.25, b.y, b.x + 0.25, b.y + L - 1, ICE[3], 1); p.fline(b.x, b.y, b.x, b.y + L - 1.5, ICE[5]); p.dot(b.x + 0.25, b.y + L - 0.5, '#ffffff'); g.dot(b.x + 0.25, b.y + L - 0.5, ICE_G[P.jaw > 0.3 ? 4 : 2]); continue; }   // Eiszahn: Lichtkante, weiße Spitze
    for (let s = 0; s < L; s++) p.px(b.x, b.y + s, s >= L - 1 ? ICE[5] : ICE[4]);
    g.px(b.x, b.y + L - 1, ICE_G[P.jaw > 0.3 ? 3 : 1]);
  }
  // Nüstern und Augen (drei kleine, kalt leuchtend)
  const ns = at(9.6, -0.6); p.px(ns.x, ns.y, '#0a0c12');
  if (p.fine) p.dot(ns.x - 0.5, ns.y - 0.5, WYRM[6]);
  for (let k = 0; k < 3; k++) {
    const e = at(1.5 + k * 1.6, -2 + k * 0.3);
    p.px(e.x, e.y, P.eye > 0.5 ? (k === 1 ? '#e0fbff' : '#8ae0ff') : WYRM[1]);
    if (P.eye > 0.5) g.px(e.x, e.y, k === 1 ? ICE_G[4] : ICE_G[3]);
    if (p.fine) {
      // fein: Auge mit dunklem Lidwulst darüber, weißglühender Kern
      p.fline(e.x - 0.5, e.y - 0.5, e.x + 1, e.y - 0.5, WYRM[0]);
      if (P.eye > 0.5) { p.dot(e.x + 0.25, e.y + 0.25, '#ffffff'); g.dot(e.x + 0.25, e.y + 0.25, '#ffffff'); }
    }
  }
  meta.eye = at(3.1, -1.7);
  meta.head = at(0, -10);
  meta.mouth = at(9, 2.5);
  meta.hand = meta.mouth;
  // Frostatem aus dem Maul
  if (P.jaw > 0.4) {
    for (let i = 0; i < 3; i++) {
      const u = ((P.ph / TAU) + i / 3) % 1;
      const m = at(10 + u * 5, 3 + Math.sin(P.ph + i) * 1.5);
      if (p.fine) { grain(p, m.x, m.y, SNOW[3 - Math.floor(u * 2)], SNOW[2]); p.dot(m.x + 0.5, m.y, SNOW[3]); continue; }
      p.px(m.x, m.y, SNOW[3 - Math.floor(u * 2)]); if (u < 0.5) p.px(m.x + 1, m.y, SNOW[2]);
    }
  }
  if (X.smear) smearArc(p, g, AX + 2, AY - 10, X.smear[0], X.smear[1], 15, 25, FROST_SMEAR, ['#2a7ab0', '#a0e8ff'], 0.45);
  if (X.dust) dust(p, AX + X.dust, AY, 12, 9, SNOW, 18);
  return meta;
}

// Schneehügel, der unter der Oberfläche wandert (Eingegraben)
function snowMound(p, g, AX, AY, ph, k = 1) {
  const w = 11 * k + 2, h = 6 * k + 1;
  if (p.fine) {
    // fein: Schneehaufen in harten Lichtstufen (kein Rauschen), Windkante oben als Glanzlinie, Glitzerpunkte
    for (let y = 0; y <= h + 0.5; y += 0.5) {
      const v = y / h;
      const hw = w * Math.sqrt(Math.max(0, 1 - v * v)) + Math.sin(ph + v * 4) * 0.8;
      for (let x = -Math.ceil(hw); x <= Math.ceil(hw); x += 0.5) {
        if (Math.abs(x) > hw || v > 1) continue;
        const lit = (-x / w) * 0.5 + v * 0.6;
        p.rect(AX + x, AY - 0.5 - y, 0.5, 0.5, SNOW[clamp(Math.floor(lit * 3 + 1.2), 0, 3)]);
      }
    }
    for (let x = -w * 0.7; x < w * 0.2; x += 0.5) { const v = Math.sqrt(Math.max(0, 1 - (x / w) * (x / w))); p.dot(AX + x, AY - 0.5 - h * v + 0.5, '#ffffff'); }
    for (let i = 0; i < 5; i++) p.dot(AX - w * 0.6 + hash2(i, 1, 4) * w * 1.2, AY - 1 - hash2(i, 2, 4) * h * 0.8, '#ffffff');
  } else for (let y = 0; y <= h; y++) {
    const v = y / h;
    const hw = w * Math.sqrt(Math.max(0, 1 - v * v)) + Math.sin(ph + v * 4) * 0.8;
    for (let x = -Math.ceil(hw); x <= Math.ceil(hw); x++) {
      if (Math.abs(x) > hw) continue;
      const lit = (-x / w) * 0.5 + v * 0.6 + (hash2(x, y, 3) - 0.5) * 0.25;
      p.px(AX + x, AY - 1 - y, SNOW[clamp(Math.floor(lit * 3 + 1.2), 0, 3)]);
    }
  }
  // Risse und Eisdorn-Spitzen, die durchbrechen
  for (let i = 0; i < 4; i++) {
    const x = AX - 6 + i * 4 + Math.sin(ph + i) * 1, y = AY - 2 - h * (0.4 + (i % 2) * 0.3);
    if (p.fine) { p.fline(x, y, x + 1.5, y + 1, '#5c7488'); p.fline(x, y + 0.5, x + 1.5, y + 1.5, SNOW[3]); continue; }   // Riss mit Lichtkante
    p.px(x, y, '#5c7488'); p.px(x + 1, y + 1, '#5c7488');
  }
  for (let i = 0; i < 2; i++) {
    const x = AX - 3 + i * 6 + Math.round(Math.sin(ph * 2 + i)), y = AY - 1 - h;
    p.px(x, y, ICE[4]); p.px(x, y - 1, ICE[5]); g.px(x, y - 1, ICE_G[1]);
    if (p.fine) { p.dot(x, y - 1.5, '#ffffff'); p.dot(x + 0.5, y, ICE[2]); g.dot(x, y - 1.5, ICE_G[3]); }
  }
  // aufstiebender Schnee vorn
  for (let i = 0; i < 8; i++) {
    const u = ((ph / TAU) * 2 + i / 8) % 1;
    const x = AX + w - 1 + u * 5 + hash2(i, 1, 5) * 2, y = AY - 2 - Math.sin(u * Math.PI) * (4 + hash2(i, 2, 5) * 3);
    if (p.fine) { grain(p, x, y, SNOW[3 - (i % 2)], SNOW[1]); continue; }
    p.px(x, y, SNOW[3 - (i % 2)]);
  }
  // Furche hinter dem Hügel
  for (let x = 0; x < 9; x++) { p.px(AX - w - x, AY - 1, x % 2 ? '#7890a6' : '#9ab0c4'); if (x < 5) p.px(AX - w - x, AY - 2, SNOW[1]); }
  return { eye: { x: AX + 2, y: AY - h }, head: { x: AX, y: AY - h - 3 }, hand: { x: AX + w, y: AY - 2 } };
}

// Wurm im Schnee versinken lassen bzw. herausbrechen
function wyrmSink(S) {
  return (p, g, P, X) => {
    const k = X.sink ?? 0;
    const off = Math.round(k * 34);
    p.translate(0, off); g.translate(0, off);
    const meta = drawBurrower(p, g, P, X);
    p.translate(0, -off); g.translate(0, -off);
    for (const m in meta) meta[m] = { x: meta[m].x, y: meta[m].y + off };
    if (k > 0.02 || X.spray) {
      clearBox(p, -20, S.AY - 2, S.W + 40, 40); clearBox(g, -20, S.AY - 2, S.W + 40, 40);
      // Schneewall um das Loch
      const rx = 12;
      for (let x = -rx; x <= rx; x++) {
        const hh = 2.5 - Math.abs(x) / rx * 2 + hash2(x, 1, 7) * 1.2;
        for (let y = 0; y < hh; y++) p.px(S.AX + 4 + x, S.AY - 2 - y, SNOW[clamp(Math.floor(2 - y + (x < 0 ? 1 : 0)), 0, 3)]);
      }
      p.rect(S.AX - 6, S.AY - 2, 20, 1, '#6a8298');
    }
    if (X.spray) {   // Schneebrocken fliegen
      const s = X.spray;
      for (let i = 0; i < 18; i++) {
        const a = -Math.PI * (0.1 + hash2(i, 1, 9) * 0.8), v = 6 + hash2(i, 2, 9) * 14;
        const x = S.AX + 4 + Math.cos(a) * v * s, y = Math.min(S.AY - 3, S.AY - 3 + Math.sin(a) * v * s + 10 * s * s);
        if (p.fine) { p.dot(x, y, SNOW[3]); p.dot(x + 0.5, y, SNOW[2 + (i % 2)]); p.dot(x, y + 0.5, SNOW[1]); if (i % 3 === 0) { p.dot(x + 1, y, SNOW[2]); p.dot(x + 1, y + 0.5, SNOW[0]); } continue; }   // Schneebrocken mit Licht oben
        p.px(x, y, SNOW[2 + (i % 2)]); if (i % 3 === 0) p.px(x + 1, y, SNOW[1]);
      }
    }
    return meta;
  };
}

function burrowerAnims() {
  const S = SBS;
  const draw = wyrmSink(S);
  const mk = (P, X) => makeFrame(S, draw, P, X);
  const mkMound = (ph, k, X = {}) => makeFrame(S, (p, g) => snowMound(p, g, S.AX, S.AY, ph, k), {}, X);
  const idle = track(mk, cycle((ph) => sbp({ ph, sway: Math.sin(ph) * 1.5, rise: 0.92 + Math.sin(ph * 2) * 0.05, jaw: Math.max(0, Math.sin(ph)) * 0.25, pitch: Math.sin(ph + 1) * 0.06 }), 6), 6, { loop: true });
  const walk = track(mk, cycle((ph) => sbp({ ph: ph * 2, sway: Math.sin(ph) * 2.5, rise: 0.75 + Math.sin(ph * 2) * 0.06, coil: 0.3 + Math.sin(ph) * 0.3, pitch: 0.12 }), 6), 6, { loop: true });
  // Rundumschlag: Kopf weit zurück, dann flach im Bogen nach vorn fegen
  const w1 = sbp({ sway: -6, rise: 1.05, jaw: 0.6, pitch: -0.25, coil: 0.5, ph: 1 });
  const w2 = sbp({ sway: -11, rise: 1.15, jaw: 1, pitch: -0.45, coil: 0.8, ph: 2, eye: 1 });
  const windup = track(mk, [[0, idle.length ? sbp() : sbp()], [0.45, w1], [1, w2]], 4);
  const s1 = sbp({ sway: -2, rise: 0.6, jaw: 1, pitch: 0.2, coil: 0.6, ph: 3 });
  const s2 = sbp({ sway: 10, rise: 0.35, jaw: 0.8, pitch: 0.35, coil: 0.2, ph: 3.6 });
  const s3 = sbp({ sway: 13, rise: 0.45, jaw: 0.4, pitch: 0.2, coil: 0, ph: 4.2 });
  const strike = [
    mk(s1, { smear: [Math.PI * 0.95, Math.PI * 0.35] }),
    mk(s2, { smear: [Math.PI * 0.9, Math.PI * -0.05], fx: 'impact', dust: 10 }),
    mk(s3, { smear: [Math.PI * 0.4, -Math.PI * 0.1] }),
    mk(mixP(s3, sbp(), 0.55)),
  ];
  const hurtP = sbp({ sway: -4, rise: 0.8, jaw: 0.9, pitch: -0.4, eye: 0.3, ph: 1 });
  const hurt = [mk(hurtP), mk(mixP(hurtP, sbp(), 0.5))];
  // Eingraben: Kopf voran in den Schnee, Hügel bleibt
  const dg1 = sbp({ sway: 6, rise: 0.6, pitch: 0.9, jaw: 0.2, ph: 1 });
  const dg2 = sbp({ sway: 8, rise: 0.3, pitch: 1.2, jaw: 0, ph: 2 });
  const dig = [mk(sbp({ rise: 1.05, pitch: -0.2, jaw: 0.5 })), mk(dg1, { sink: 0.15, spray: 0.3 }), mk(dg2, { sink: 0.45, spray: 0.6, fx: 'impact' }), mk(dg2, { sink: 0.8, spray: 0.9 }), mkMound(0, 0.8)];
  const mound = [0, 1, 2, 3].map((i) => mkMound(i * TAU / 4, 1, { fx: i % 2 === 0 ? 'step' : null }));
  // Auftauchen: Hügel schwillt, Wurm bricht mit offenem Maul heraus (Rundumschlag folgt im Code)
  const emerge = [
    mkMound(0, 1.25), mk(sbp({ rise: 0.5, pitch: -0.6, jaw: 1, ph: 1 }), { sink: 0.55, spray: 0.25, fx: 'impact' }),
    mk(sbp({ rise: 1.1, pitch: -0.5, jaw: 1, ph: 2 }), { sink: 0.2, spray: 0.6 }),
    mk(sbp({ rise: 1.2, pitch: -0.3, jaw: 0.8, ph: 3 }), { spray: 0.95 }),
    mk(sbp({ rise: 1, pitch: 0, jaw: 0.3, ph: 4 })),
  ];
  // Tod: bäumt sich auf, kracht der Länge nach in den Schnee
  const d1 = sbp({ rise: 1.2, sway: -3, pitch: -0.6, jaw: 1, eye: 1, ph: 1 });
  const d2 = sbp({ rise: 0.5, sway: 6, pitch: 0.5, jaw: 0.9, eye: 0.4, ph: 2 });
  const d3 = sbp({ rise: 0.05, sway: 12, pitch: 0.1, jaw: 0.7, eye: 0, ph: 2.4, lie: 1 });
  const death = [mk(d1), mk(d2), mk(d3, { fx: 'impact', dust: 14 }), mk({ ...d3, jaw: 0.5 }, { dust: 18 }), mk({ ...d3, jaw: 0.45 }), mk({ ...d3, jaw: 0.4 })];
  return {
    idle: new Animation(idle, 6),
    walk: new Animation(walk, 8),
    windup: new Animation(windup, 7, false),
    strike: new Animation(strike, 12, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 8, false),
    dig: new Animation(dig, 9, false),
    mound: new Animation(mound, 8),
    emerge: new Animation(emerge, 10, false),
  };
}

// ================================================================ Aschebombardier

const RIM_ASHW = { c: [228, 204, 184], k1: 0.36, k2: 0.18 };
const EGLOW = ['#4a0e06', '#a8280c', '#f0602a', '#ffb070', '#fff4d8'];
const LAVA = ['#4a1006', '#9a2608', '#dc4e0e', '#ff8c24', '#ffd060', '#fff4c0'];
const OGRE = ['#170e10', '#291a1a', '#3e2824', '#56382e', '#70483a', '#8c5c48'];
const OGRE_D = ['#120a0c', '#201414', '#30201c', '#422c24', '#563a30'];
const POT = ['#0c0a0c', '#181418', '#262026', '#383038', '#4e444c', '#6a5e64'];
const SOOT = ['#2a2426', '#3e3638', '#564c4c'];
const LEAT = ['#160e0a', '#26180f', '#3a2618', '#523622', '#6c4a2e'];
const BRASS = ['#3a2208', '#6a4412', '#a07024', '#d4a040', '#f4d880'];
const BMS = { W: 86, H: 72, AX: 38, AY: 66, pad: 12, rim: RIM_ASHW };
const BMD = { legH: 13, thigh: 6.6, shin: 6.8, spine: 14, upper: 8, fore: 8.4, sh: 5, hipW: 2.8 };
const BM_REST = {
  hipX: 0, hipY: 0, lean: 0.38, head: 0, headY: 0, fFx: 4.5, fFy: 0, fBx: -4.5, fBy: 0,
  hFx: 7.5, hFy: 12, hBx: 2, hBy: 12, bomb: 0, heat: 1, ph: 0, jaw: 0, eye: 1, fistB: 1,
};
const bmp = (o = {}) => ({ ...BM_REST, ...o });

function glowBall(p, g, x, y, r, ph) {
  ell(p, x, y, r, r, ['#2a0c06', '#5a1a08', LAVA[2], LAVA[3], LAVA[4]]);
  p.px(x - 0.6, y - 0.6, LAVA[5]);
  glowDot(g, x, y, r + 1, EGLOW);
  // Funkenlunte
  const fx = x + 1 + Math.sin(ph * 3) * 0.5, fy = y - r - 1;
  p.px(fx, fy, LAVA[4]); g.px(fx, fy, EGLOW[4]); p.px(fx + 1, fy - 1, LAVA[3]); g.px(fx + 1, fy - 1, EGLOW[2]);
  if (p.fine) {
    // fein: Kruste mit Glutrissen, weißheißer Kern, Funke an der Lunte
    p.fline(x - r * 0.6, y + 0.25, x + 0.25, y + r * 0.5, '#2a0c06'); p.fline(x + 0.25, y - r * 0.5, x + r * 0.6, y + 0.25, '#2a0c06');
    p.dot(x - 0.25, y - 0.25, '#ffffff'); g.dot(x - 0.25, y - 0.25, '#ffffff'); p.dot(fx + 0.25, fy - 0.25, '#ffffff'); g.dot(fx + 0.25, fy - 0.25, '#ffffff');
  }
}

function drawBombardier(p, g, P, X) {
  const R = rig(P, BMD, BMS.AX, BMS.AY);
  const { hip, pt, legF, legB, shF, shB, armF, armB } = R;
  const meta = {};
  const AY = BMS.AY;

  // --- Hinterer Arm
  const arm = (sh, A, ramp, near) => {
    cap(p, sh.x, sh.y, A.jx, A.jy, near ? 3.0 : 2.6, 2.4, ramp, { noise: 0.15, seed: near ? 73 : 74, bias: near ? 0.08 : 0 });
    cap(p, A.jx, A.jy, A.ex, A.ey, 2.4, 2.6, ramp, { noise: 0.15, seed: near ? 75 : 76, bias: near ? 0.08 : 0 });
    // Lederbandage um den Unterarm
    for (let s = 0.3; s <= 0.7; s += 0.2) { const x = A.jx + (A.ex - A.jx) * s, y = A.jy + (A.ey - A.jy) * s; p.px(x - 1, y, LEAT[3]); p.px(x, y + 0.5, LEAT[2]); p.px(x + 1, y + 1, LEAT[3]); }
    ell(p, A.ex, A.ey + 0.5, near ? 2.8 : 2.4, 2.4, ramp);          // Faust
    p.px(A.ex + 1.5, A.ey - 0.5, ramp[ramp.length - 1]);
    if (p.fine) {
      // fein: Bandage als Wickelbahnen mit Kante, Fingerfugen und Knöchellicht an der Faust
      for (let s = 0.25; s <= 0.75; s += 0.17) { const x = A.jx + (A.ex - A.jx) * s, y = A.jy + (A.ey - A.jy) * s; p.fline(x - 1.75, y - 0.25, x + 1.75, y + 0.75, LEAT[near ? 4 : 3]); p.fline(x - 1.75, y + 0.25, x + 1.75, y + 1.25, LEAT[1]); }
      for (let k = -1; k <= 1; k++) p.fline(A.ex + 0.5 + k * 0.9, A.ey + 0.5, A.ex + 0.75 + k * 0.9, A.ey + 2, ramp[1]);
      for (let k = -1; k <= 1; k++) p.dot(A.ex + 0.25 + k * 0.9, A.ey - 1, ramp[ramp.length - 1]);
    }
  };
  arm(shB, armB, OGRE_D, false);

  // --- Beine (kurz, säulenartig)
  const leg = (L, x0, near) => {
    const ramp = near ? OGRE : OGRE_D;
    cap(p, x0, hip.y, L.jx, L.jy, 3.8, 3.1, ramp, { noise: 0.12, seed: near ? 77 : 78 });
    cap(p, L.jx, L.jy, L.ex, L.ey - 2, 3.1, 2.9, ramp, { noise: 0.12, seed: near ? 79 : 80 });
    p.rect(L.ex - 3, L.ey - 2, near ? 7 : 6, 2, LEAT[near ? 2 : 1]); p.rect(L.ex - 3, L.ey - 1, near ? 7 : 6, 1, LEAT[0]);
    p.px(L.ex + 3, L.ey - 2, LEAT[3]);
    if (p.fine) {
      // Stiefel: Naht als Punktlinie, Lichtkante oben; Wade mit Muskelschatten
      for (let k = -2.5; k <= (near ? 3.5 : 2.5); k += 1) p.dot(L.ex + k, L.ey - 1.5, LEAT[4]);
      p.fline(L.ex - 3, L.ey - 2, L.ex + (near ? 3.5 : 2.5), L.ey - 2, LEAT[near ? 4 : 3]);
      p.fline(L.jx + 1.5, L.jy + 1, L.ex + 1.5, L.ey - 3, ramp[1]);
    }
  };
  leg(legB, hip.x - BMD.hipW, false);

  // --- Rumpf: mächtiger Brustkorb, Wanst, Gurte zum Kessel
  const hp = pt(0, 0.5), cp = pt(BMD.spine - 2, 0.6);
  cap(p, hp.x, hp.y, cp.x, cp.y, 6.8, 8.4, OGRE, { noise: 0.12, seed: 81, bias: -0.06 });
  const belly = pt(3.5, 2.6);
  ell(p, belly.x, belly.y, 4.6, 4.2, OGRE.slice(1), { noise: 0.1, seed: 82, bias: 0.05 });
  // Ruß und Brandnarben
  for (let i = 0; i < 6; i++) { const q = pt(4 + hash2(i, 1, 83) * 8, -3 + hash2(i, 2, 83) * 7); p.px(q.x, q.y, SOOT[0]); }
  const scar = pt(8, 2.5); p.px(scar.x, scar.y, LAVA[1]); p.px(scar.x + 1, scar.y + 1, LAVA[1]);
  if (p.fine) {
    // Handfein: Brustmuskel-Kante, Brandnarbe mit hellem Wulst, Brustbehaarung als Strähnen, Wanstlicht
    const m0 = pt(BMD.spine - 3, -1), m1 = pt(BMD.spine - 4.5, 5); p.fline(m0.x, m0.y, m1.x, m1.y, OGRE[1]); p.fline(m0.x - 0.5, m0.y, m1.x - 0.5, m1.y, OGRE[5]);
    p.fline(scar.x - 0.5, scar.y - 0.5, scar.x + 1.5, scar.y + 1.5, OGRE[5]); p.fline(scar.x, scar.y, scar.x + 1.5, scar.y + 1, LAVA[1]);
    for (let i = 0; i < 6; i++) { const h = pt(BMD.spine - 2.5 - i * 0.6, 1 + (i % 3) * 0.9); p.fline(h.x, h.y, h.x + 0.5, h.y + 1, OGRE[0]); }
    p.fline(belly.x - 3.5, belly.y - 2.5, belly.x - 1, belly.y - 3.75, OGRE[5]);
  }
  // Gurte
  const g0 = pt(BMD.spine - 1, -5), g1 = pt(2, 5), g2 = pt(BMD.spine - 1.5, 4), g3 = pt(3.5, -6);
  p.line(g0.x, g0.y, g1.x, g1.y, LEAT[3]); p.line(g0.x + 0.8, g0.y + 0.8, g1.x + 0.8, g1.y + 0.8, LEAT[1]);
  p.line(g3.x, g3.y, g2.x, g2.y, LEAT[2]);
  const bk = pt(BMD.spine * 0.55, 1.2); p.rect(bk.x - 1, bk.y - 1, 2, 2, BRASS[3]); p.px(bk.x - 1, bk.y - 1, BRASS[4]);
  if (p.fine) {
    // Gurte: Naht als Punktlinie, Schnalle als Messingring mit Dorn und Glanzpunkt
    for (let t = 0.08; t < 0.95; t += 0.09) p.dot(g0.x + (g1.x - g0.x) * t + 0.25, g0.y + (g1.y - g0.y) * t + 0.25, LEAT[4]);
    p.rect(bk.x - 0.5, bk.y - 0.5, 1, 1, BRASS[1]); p.fline(bk.x - 0.5, bk.y, bk.x + 0.5, bk.y, BRASS[2]); p.dot(bk.x - 1, bk.y - 1, '#fff8d0');
  }
  // Lederschurz
  const a0 = pt(0.5, -4), a1 = pt(0.5, 5.5);
  poly(p, [[a0.x, a0.y], [a1.x, a1.y], [a1.x + 1, AY - 9], [a0.x - 1.5, AY - 8]], (x, y) => LEAT[!p.fine && (x + y) % 5 === 0 ? 1 : (x > hip.x + 1 ? 2 : 3)]);
  p.line(a0.x, a0.y, a1.x, a1.y, LEAT[4]);
  if (p.fine) {
    // Lederschurz: Brandflecken, Kratzer, Saumnaht als Punktlinie
    for (let t = 0.1; t < 0.95; t += 0.12) p.dot(a0.x - 1.25 + (a1.x - a0.x + 2.25) * t, AY - 8.5 + (-0.5) * t, LEAT[4]);
    p.fline(a0.x + 0.5, a0.y + 4, a0.x + 2, a0.y + 5.5, LEAT[1]); p.fline(a1.x - 1, a1.y + 2, a1.x - 0.5, a1.y + 4, LEAT[4]);
    p.dot(hip.x - 0.5, AY - 11, SOOT[0]); p.dot(hip.x, AY - 11, SOOT[0]); p.dot(hip.x - 0.5, AY - 10.5, SOOT[1]);
  }

  // --- Glutkessel auf dem Rücken
  const kc = pt(BMD.spine - 4, -8.8);
  // Rauch und Funken über dem Kessel
  for (let i = 0; i < 7; i++) {
    const u = ((P.ph / TAU) + i / 7) % 1;
    const x = kc.x - 2 + Math.sin(P.ph * 1.3 + i * 2) * 2 - u * 4, y = kc.y - 6 - u * 14;
    const c = SOOT[2 - Math.floor(u * 2.9)];
    if (p.fine) {
      // fein: Rauchballen mit heller Oberkante (kein weicher Verlauf)
      const r = u < 0.6 ? 1 : 0.5;
      p.each(x - r, y - r, x + r + 0.5, y + r, (X, Y) => ((X - x - 0.25) ** 2 + (Y - y) ** 2 <= r * r ? (Y < y - r * 0.4 ? SOOT[Math.min(2, 3 - Math.floor(u * 2.9))] : c) : null));
      continue;
    }
    p.px(x, y, c); if (u < 0.6) { p.px(x + 1, y, c); p.px(x, y - 1, SOOT[0]); }
  }
  for (let i = 0; i < 4; i++) {
    const u = ((P.ph / TAU) * 1.7 + i / 4) % 1;
    const x = kc.x + Math.sin(P.ph * 2 + i * 1.7) * 3, y = kc.y - 5 - u * 10;
    if (u < 0.8) {
      if (p.fine) { p.dot(x, y, u < 0.4 ? LAVA[5] : LAVA[4]); p.dot(x, y + 0.5, LAVA[2]); g.dot(x, y, EGLOW[u < 0.4 ? 4 : 3]); g.dot(x, y + 0.5, EGLOW[2]); continue; }
      p.px(x, y, LAVA[u < 0.4 ? 4 : 3]); g.px(x, y, EGLOW[u < 0.4 ? 3 : 2]);
    }
  }
  ell(p, kc.x, kc.y, 7.2, 6.6, POT, { noise: 0.12, seed: 71 });
  // Nieten und Band
  p.line(kc.x - 6, kc.y + 1, kc.x + 6, kc.y + 1.5, POT[1]);
  for (let i = -2; i <= 2; i++) p.px(kc.x + i * 2.4, kc.y + 1 + i * 0.1, POT[5]);
  if (p.fine) {
    // Handfein: Gusseisen 5 Stufen – Glanzlinie auf der Wölbung, Glanzpunkt, Band mit Lichtkante, Nieten mit Schatten
    for (let a = -2.75; a <= -1.6; a += 0.06) p.dot(kc.x + Math.cos(a) * 5.6, kc.y + Math.sin(a) * 5, POT[5]);
    p.dot(kc.x - 4, kc.y - 2.5, '#c8bcc4'); p.dot(kc.x - 3.5, kc.y - 2.5, POT[5]);
    p.fline(kc.x - 6, kc.y + 0.5, kc.x + 6, kc.y + 1, POT[4]);
    for (let i = -2; i <= 2; i++) { p.dot(kc.x + i * 2.4, kc.y + 1 + i * 0.1, '#e0d4dc'); p.dot(kc.x + i * 2.4 + 0.5, kc.y + 1.5 + i * 0.1, POT[0]); }
    p.fline(kc.x - 4, kc.y + 4, kc.x + 3, kc.y + 5, POT[1]);
  }
  // Rand und glühender Inhalt
  oval(p, kc.x, kc.y - 4.4, 6, 1.8, POT[4]);
  oval(p, kc.x, kc.y - 4.2, 4.8, 1.2, LAVA[2]);
  for (let i = -4; i <= 4; i++) {
    const c = LAVA[clamp(3 + Math.round(Math.sin(P.ph * 2 + i) * P.heat), 1, 5)];
    p.px(kc.x + i, kc.y - 4.2 + (Math.abs(i) > 3 ? 0.5 : 0), c); g.px(kc.x + i, kc.y - 4.2, EGLOW[clamp(2 + Math.round(P.heat), 1, 4)]);
  }
  glowDot(g, kc.x, kc.y - 5, 3 + P.heat * 1.8, EGLOW);
  // Glutrisse im Kessel
  p.px(kc.x + 3, kc.y - 1, LAVA[3]); p.px(kc.x + 3.5, kc.y, LAVA[2]); g.px(kc.x + 3, kc.y - 1, EGLOW[2]);
  if (p.fine) {
    // Rand mit Glanzlinie; Lava mit Kruste, weißheißen Blasen; Glutriss als Feinlinie mit hellem Kern
    p.fline(kc.x - 5.5, kc.y - 5.5, kc.x + 3, kc.y - 6, POT[5]);
    for (let i = -3; i <= 3; i += 1.5) p.dot(kc.x + i + Math.sin(P.ph * 2 + i) * 0.5, kc.y - 4.25, Math.sin(P.ph * 3 + i * 2) > 0 ? '#ffffff' : LAVA[1]);
    g.dot(kc.x - 0.5, kc.y - 4.25, '#ffffff');
    p.fline(kc.x + 2.5, kc.y - 1.5, kc.x + 4, kc.y + 0.5, LAVA[2], 0.5); p.fline(kc.x + 2.5, kc.y - 1.5, kc.x + 4, kc.y + 0.5, LAVA[5]); g.fline(kc.x + 2.5, kc.y - 1.5, kc.x + 4, kc.y + 0.5, EGLOW[4]);
  }
  meta.kettle = { x: kc.x, y: kc.y - 5 };

  leg(legF, hip.x + BMD.hipW, true);

  // --- Schulterplatte + vorderer Arm
  arm(shF, armF, OGRE, true);
  ell(p, shF.x, shF.y - 0.5, 3.6, 2.6, POT.slice(1), { noise: 0.1, seed: 85 });
  p.px(shF.x - 1, shF.y - 2, POT[5]); p.px(shF.x + 1.5, shF.y - 1, POT[4]);
  if (p.fine) { for (let a = -2.7; a <= -1.3; a += 0.1) p.dot(shF.x + Math.cos(a) * 2.8, shF.y - 0.5 + Math.sin(a) * 1.9, POT[5]); p.dot(shF.x - 1.5, shF.y - 2, '#e0d4dc'); p.fline(shF.x - 3, shF.y + 1, shF.x + 3, shF.y + 1.25, POT[0]); }   // Schulterplatte: Glanzlinie, Glanzpunkt, Unterkante
  // --- Kopf: klein, tief zwischen den Schultern, Hauer, Schweißerbrille
  const hc = pt(BMD.spine + 0.5, 7.2);
  const hx = hc.x + P.head, hy = hc.y + P.headY;
  ell(p, hx, hy, 4.0, 3.7, OGRE, { noise: 0.1, seed: 84, bias: 0.1 });
  p.px(hx - 1.5, hy - 2.5, OGRE[5]); p.px(hx - 0.5, hy - 3, OGRE[5]);
  p.line(hx - 1, hy - 1.5, hx + 3.5, hy - 1, OGRE[1]);                   // Stirnwulst
  // Brille: Messingring, glühendes Glas
  oval(p, hx + 1.8, hy - 0.4, 1.6, 1.4, BRASS[2]); p.px(hx + 1.2, hy - 1.2, BRASS[4]);
  p.rect(hx + 1.3, hy - 0.8, 2, 1.5, P.eye > 0.5 ? LAVA[3] : '#2a1008');
  if (P.eye > 0.5) { if (!p.fine) { glowDot(g, hx + 2, hy - 0.3, 1.6, EGLOW); g.rect(hx + 1.3, hy - 0.8, 2, 1.5, EGLOW[3]); g.px(hx + 1.3, hy - 0.8, EGLOW[4]); } p.px(hx + 1.3, hy - 0.8, LAVA[5]); }
  p.line(hx - 3, hy - 0.8, hx, hy - 0.6, LEAT[1]);                        // Brillenband
  // Maul + Hauer
  const jw = P.jaw;
  p.line(hx + 1, hy + 2 + jw, hx + 3.5, hy + 1.6 + jw, '#120808');
  p.px(hx + 3.4, hy + 1 + jw, BONE[3]); p.px(hx + 3.4, hy + 0.2 + jw, BONE[4]);
  p.px(hx + 1.2, hy + 1.4 + jw, BONE[2]);
  p.px(hx - 1.5, hy + 0.5, OGRE[1]); p.px(hx - 2, hy, OGRE[4]);           // Ohr
  if (p.fine) {
    // Handfein: Ogergesicht – Stirnwulst mit Lichtkante, Brille mit Messing-Glanzlinie und weißheißem Glas-Kern,
    // Nasenrücken-Licht und Nasenloch, Hauer mit Glanzpunkt, Mundwinkel, Bartstoppeln, Ohrmuschel
    // Gesicht klar gegliedert: Stirnwulst (Licht oben, Schatten darunter) – Brille – Wangenlicht – Maul – Kinn
    p.fline(hx - 1, hy - 2, hx + 3.5, hy - 1.5, OGRE[5]);
    // Brille: Messingring rundum (oben links hell, unten rechts dunkel), Glas dunkelrot mit kleinem weißheißem Kern
    for (let a = -3.1; a <= 3.1; a += 0.2) p.dot(hx + 1.8 + Math.cos(a) * 1.9, hy - 0.4 + Math.sin(a) * 1.7, Math.cos(a) + Math.sin(a) < -0.3 ? BRASS[4] : Math.cos(a) + Math.sin(a) > 0.6 ? BRASS[1] : BRASS[3]);
    p.rect(hx + 1, hy - 1, 2, 1.5, P.eye > 0.5 ? LAVA[1] : '#2a1008');
    if (P.eye > 0.5) {
      p.dot(hx + 1.75, hy - 0.5, '#ffffff'); p.dot(hx + 2.25, hy - 0.5, LAVA[4]); p.dot(hx + 1.75, hy, LAVA[3]); p.dot(hx + 1.25, hy - 1, LAVA[5]);
      g.rect(hx + 1, hy - 1, 2, 1.5, EGLOW[1]); g.dot(hx + 1.75, hy - 0.5, '#ffffff'); g.dot(hx + 2.25, hy - 0.5, EGLOW[3]); g.dot(hx + 1.75, hy, EGLOW[2]);
    }
    // Wangenlicht zwischen Brille und Maul, Nasenrücken vorn
    p.fline(hx + 0.5, hy + 1.25, hx + 3, hy + 1.25, OGRE[4]);
    p.fline(hx + 3.5, hy, hx + 4, hy + 1, OGRE[5]); p.dot(hx + 3.5, hy + 1.25, OGRE[0]);
    // Maul als klarer dunkler Spalt (2 Feinpixel), Unterlippe mit Lichtkante, Hauer davor
    p.fline(hx + 1, hy + 2 + jw, hx + 3.5, hy + 1.75 + jw, '#120808', 1);
    p.fline(hx + 1, hy + 3 + jw, hx + 3.5, hy + 2.75 + jw, OGRE[4]);
    p.dot(hx + 3.25, hy + 0.25 + jw, '#fffbef'); p.dot(hx + 3.25, hy + 0.75 + jw, BONE[4]); p.dot(hx + 3.25, hy + 1.25 + jw, BONE[3]); p.dot(hx + 3.75, hy + 1.25 + jw, BONE[1]);
    p.dot(hx + 1.25, hy + 1.75 + jw, BONE[3]);
    p.dot(hx - 2, hy + 0.5, OGRE[0]); p.dot(hx - 2.5, hy - 0.5, OGRE[5]);
  }
  meta.eye = { x: hx + 2, y: hy - 0.4 };
  meta.head = { x: hx, y: hy - 6 };
  meta.mouth = { x: hx + 3, y: hy + 2 };

  if (P.bomb > 0.5) {
    const bx = armF.ex + 1, by = armF.ey - 2.5;
    glowBall(p, g, bx, by, 2.3, P.ph);
    meta.hand = { x: bx, y: by };
  } else meta.hand = { x: armF.ex, y: armF.ey };
  if (X.smear) smearArc(p, g, shF.x, shF.y, X.smear[0], X.smear[1], 9, 17, ['#6a5048', '#b8907a', '#f4d8c0'], null, X.smear[2] ?? 1);
  if (X.slam) {
    dust(p, armF.ex + 2, AY, 12, 11, [SOOT[1], SOOT[2], '#7a6a64'], 20);
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI * (0.15 + hash2(i, 1, 13) * 0.7), r = 4 + hash2(i, 2, 13) * 7;
      const x = armF.ex + 2 + Math.cos(a) * r, y = AY - 1 + Math.sin(a) * r * 0.7;
      if (p.fine) { p.dot(x, y, '#ffffff'); p.dot(x + 0.5, y + 0.5, LAVA[3 + (i % 2)]); g.dot(x, y, EGLOW[4]); g.dot(x + 0.5, y + 0.5, EGLOW[2]); continue; }
      p.px(x, y, LAVA[3 + (i % 2)]); g.px(x, y, EGLOW[2]);
    }
  }
  if (X.dust) dust(p, BMS.AX + X.dust, AY, 9, 15, [SOOT[1], SOOT[2], '#6a5e5a'], 14);
  return meta;
}

function bombardierAnims() {
  const mk = (P, X) => makeFrame(BMS, drawBombardier, P, X);
  const idleA = bmp();
  const idle = track(mk, cycle((ph) => {
    const s = Math.sin(ph);
    return bmp({ ph, hipY: (1 - Math.cos(ph)) * 0.5, lean: 0.38 + s * 0.025, hFy: 12 + s * 0.6, hBy: 12 - s * 0.4, heat: 0.8 + s * 0.3, jaw: Math.max(0, s) * 0.5 });
  }, 6), 6, { loop: true });
  const walk = track(mk, walkKeys(idleA, 8, {
    stride: 4.2, lift: 2.2, bob: 1.6, arm: 2.4,
    extra: (ph, s) => ({ ph: ph * 2, lean: 0.44, head: s * 0.4, heat: 1 }),
  }), 8, { loop: true, extras: { 0: { fx: 'step', dust: 3 }, 4: { fx: 'step', dust: -3 } } });
  // Nahkampf: beide Fäuste über den Kopf, dann auf den Boden hämmern
  const w1 = bmp({ lean: 0.1, hipY: 0.5, hFx: 3, hFy: -4, hBx: 1, hBy: -3, jaw: 0.6, ph: 1, heat: 1.2 });
  const w2 = bmp({ lean: -0.06, hipY: 1, hipX: -1, hFx: 1, hFy: -9, hBx: -1, hBy: -8, jaw: 1, ph: 2, heat: 1.4, fFx: 5.5, fBx: -5 });
  const windup = track(mk, [[0, idleA], [0.45, w1], [1, w2]], 4);
  const s1 = bmp({ lean: 0.4, hipX: 1, hipY: 1, hFx: 9, hFy: -2, hBx: 7, hBy: -1, jaw: 1, ph: 3, heat: 1.4, fFx: 6, fBx: -5 });
  const s2 = bmp({ lean: 0.62, hipX: 2.5, hipY: 4, hFx: 11, hFy: 14, hBx: 9, hBy: 14, jaw: 1, ph: 3.5, heat: 1.6, fFx: 7, fBx: -5.5 });
  const s3 = { ...s2, jaw: 0.6, ph: 4, heat: 1.2 };
  const strike = [mk(s1, { smear: [-2.4, -0.7] }), mk(s2, { smear: [-1.6, 0.9], fx: 'impact', slam: 1 }), mk(s3, { slam: 1 }), mk(mixP(s3, idleA, 0.55))];
  // Bogenwurf: Griff über die Schulter in den Kessel, Glutklumpen hoch, im Bogen werfen
  const t1 = bmp({ lean: 0.2, hFx: -2, hFy: -9, hBx: 2, hBy: 10, jaw: 0.3, ph: 1, heat: 1.3 });
  const t2 = bmp({ lean: 0.16, hFx: -4, hFy: -8, hBx: 3, hBy: 9, bomb: 1, jaw: 0.5, ph: 2, heat: 1.6 });
  const t3 = bmp({ lean: -0.05, hipX: -1.5, hipY: 0.5, hFx: -6, hFy: -6, hBx: 6, hBy: 4, bomb: 1, jaw: 1, ph: 3, heat: 1.2, fFx: 6, fBx: -5 });
  const t4 = bmp({ lean: 0.35, hipX: 1.5, hipY: 0.5, hFx: 5, hFy: -11, hBx: 3, hBy: 8, bomb: 1, jaw: 1, ph: 4, heat: 1, fFx: 6.5, fBx: -5 });
  const t5 = bmp({ lean: 0.5, hipX: 2.5, hipY: 1, hFx: 10, hFy: 2, hBx: 0, hBy: 10, bomb: 0, jaw: 0.8, ph: 5, heat: 0.9, fFx: 6.5, fBx: -5 });
  const throwA = [mk(t1), mk(t2, { fx: 'cast' }), mk(t3), mk(t4), mk(t5, { smear: [-1.8, 0.2] }), mk(mixP(t5, idleA, 0.5)), mk(mixP(t5, idleA, 0.85))];
  // Wurf-Moment: Hand-Meta im Frame 3 (t4) = Abwurfpunkt
  const hurtP = bmp({ lean: 0.05, hipX: -2, head: -1.2, headY: -0.5, jaw: 1, eye: 0.3, hFx: 3, hFy: 8, hBx: -1, hBy: 9, heat: 1.6 });
  const hurt = [mk(hurtP), mk(mixP(hurtP, idleA, 0.5))];
  // Tod: wankt, fällt rücklings auf den Kessel, Glut schwappt heraus
  const d1 = bmp({ ...hurtP, lean: -0.1, heat: 1.8, jaw: 1 });
  const d2 = bmp({ lean: -0.18, hipY: 2, hipX: -1.5, hFx: 4, hFy: 4, hBx: -2, hBy: 6, eye: 0, jaw: 1, heat: 1.4, fFx: 6, fBx: -3 });
  const piv = [BMS.AX - 6, BMS.AY - 1];
  const spill = (k) => (p, g) => {
    for (let i = 0; i < 12; i++) {
      const x = BMS.AX - 22 + hash2(i, 1, 33) * 12 - k * 4, y = BMS.AY - 1 - hash2(i, 2, 33) * 2;
      p.px(x, y, LAVA[2 + (i % 3)]); g.px(x, y, EGLOW[2 + (i % 2)]);
      if (p.fine && i % 3 === 0 && k < 1) { p.dot(x + 0.25, y, '#ffffff'); g.dot(x + 0.25, y, '#ffffff'); }
    }
    glowDot(g, BMS.AX - 17 - k * 3, BMS.AY - 2, 2 + (1 - k) * 2, EGLOW);
    return {};
  };
  const death = [
    mk(d1), mk(d2), mk(d2, { rot: [-0.5, ...piv] }), mk({ ...d2, heat: 1.6 }, { rot: [-1.05, ...piv] }),
    mk({ ...d2, heat: 1 }, { rot: [-1.5, ...piv], fx: 'impact', dust: -8, post: spill(0) }),
    mk({ ...d2, heat: 0.5, hFy: 8 }, { rot: [-Math.PI / 2, ...piv], post: spill(0.5) }),
    mk({ ...d2, heat: 0.2, hFy: 8 }, { rot: [-Math.PI / 2, ...piv], post: spill(1) }),
  ];
  return {
    idle: new Animation(idle, 5),
    walk: new Animation(walk, 8),
    windup: new Animation(windup, 7, false),
    strike: new Animation(strike, 12, false),
    throw: new Animation(throwA, 9, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 8, false),
  };
}

// ================================================================ Phasengeist

const RIM_PHASE = { c: [200, 190, 240], k1: 0.34, k2: 0.18 };
const VOIDC = ['#0a0812', '#151126', '#211a3a', '#2f2652', '#40356c', '#554888', '#6e60a6'];
const PHASE = ['#0a2a3a', '#147a9a', '#3ad0f0', '#a8f4ff', '#ffffff'];
const MAGE = ['#2a0a3a', '#6a1a8a', '#b040e8', '#e0a0ff'];
const BLADE = ['#1c1c2a', '#3e3e56', '#6c6c8c', '#a4a4c4', '#dcdcf0', '#ffffff'];
const PWS = { W: 64, H: 62, AX: 30, AY: 56, pad: 12, rim: RIM_PHASE };
const PW_REST = {
  x: 0, bob: 0, hover: 7, lean: 0.12, t: 0, drift: 0.2, head: 0, headY: 0,
  hFx: 8, hFy: 6, hBx: 4, hBy: 7, aF: 0.55, aB: 0.75, eye: 1, flick: 0.15, rip: 0,
};
const pwp = (o) => ({ ...PW_REST, ...o });

// Klingenarm-Klinge: gebogen, von der Hand in Richtung a
function phaseBlade(p, g, x, y, a, len, back, glowK) {
  const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
  let tip = { x, y };
  // fein: Klinge in Feinpixeln, Schneide als Glanzlinie (1 Feinpixel), Leuchtkante mit weißem Kern
  const q = p.fine ? 0.25 : 0.5, e = p.fine ? 0.3 : 0.5, put = p.fine ? p.dot.bind(p) : p.px.bind(p);
  for (let s = 0; s <= len; s += q) {
    const f = s / len;
    const curve = f * f * 3.2;
    const hw = (1.4 - f * 1.1) * (back ? 0.85 : 1);
    const cx = x + dx * s + nx * curve, cy = y + dy * s + ny * curve;
    for (let k = -hw; k <= hw + 0.01; k += q) {
      const c = k > hw - e ? BLADE[back ? 3 : 5] : k < -hw + e ? BLADE[1] : BLADE[back ? 2 : 3 + (k > 0 ? 1 : 0)];
      put(cx + nx * k, cy + ny * k, c);
    }
    if (p.fine) {
      if (Math.abs(s - len * 0.3) < 0.13 && !back) p.dot(cx + nx * hw * 0.5, cy + ny * hw * 0.5, '#ffffff');
      if (glowK > 0 && Math.round(s * 4) % 2 === 0) { g.dot(cx + nx * hw, cy + ny * hw, back ? PHASE[1] : glowK > 1 ? PHASE[4] : PHASE[3]); if (!back) p.dot(cx + nx * (hw - 0.25), cy + ny * (hw - 0.25), glowK > 1 ? '#ffffff' : PHASE[3]); }
      tip = { x: cx, y: cy };
      continue;
    }
    if (glowK > 0) {
      g.px(cx + nx * hw, cy + ny * hw, PHASE[back ? 1 : glowK > 1 ? 3 : 2]);
      if (!back && Math.round(s * 2) % 2 === 0) g.px(cx, cy, PHASE[glowK > 1 ? 2 : 1]);
    }
    tip = { x: cx, y: cy };
  }
  return tip;
}

function drawPhase(p, g, P, X) {
  const { AX, AY } = PWS;
  const meta = {};
  const waist = { x: AX + P.x, y: AY - P.hover - 12 - P.bob };
  const L = P.lean;
  const ch = { x: waist.x + Math.sin(L) * 11, y: waist.y - Math.cos(L) * 11 };
  const shF = { x: ch.x + 2.5, y: ch.y - 2 }, shB = { x: ch.x - 2.5, y: ch.y - 2.5 };

  // --- hinterer Klingenarm
  const armB = ik(shB.x, shB.y, ch.x + P.hBx, ch.y + P.hBy, 6.5, 7, 1);
  cap(p, shB.x, shB.y, armB.jx, armB.jy, 1.2, 1.0, VOIDC.slice(0, 5));
  cap(p, armB.jx, armB.jy, armB.ex, armB.ey, 1.0, 0.9, VOIDC.slice(0, 5));
  const tipB = phaseBlade(p, g, armB.ex, armB.ey, P.aB, 10, true, 1);

  // --- Fetzen statt Beinen (hängen, wehen nach hinten)
  for (let i = 0; i < 6; i++) {
    const f = i / 5;
    const x0 = waist.x - 3 + f * 6, y0 = waist.y - 1;
    const len = 10 + (hash2(i, 1, 61) * 5 | 0) - Math.abs(f - 0.4) * 4;
    let x = x0, y = y0;
    for (let s = 0; s < len; s++) {
      const v = s / len;
      x += -P.drift * 0.6 * v - 0.08 + Math.sin(P.t + i * 1.3 + v * 3) * 0.35;
      y += 1;
      const w = (1 - v) * 1.6 + 0.3;
      if (p.fine) {
        // fein: Fetzen aus Fäden – Lichtkante links, Schattenfaden rechts, ausgefranste Spitze mit Phasenfunke
        for (let k = -w; k <= w; k += 0.5) p.rect(Math.round((x + k) * 2) / 2, y, 0.5, 1, VOIDC[clamp(Math.round(4 - v * 2 - (k > 0 ? 1 : 0) + (i % 2 ? -1 : 0)), 0, 6)]);
        p.dot(x - w, y, VOIDC[clamp(Math.round(6 - v * 2), 0, 6)]); p.dot(x + w * 0.3, y + 0.5, VOIDC[1]);
        if (s === len - 1) {
          p.fline(x - 0.5, y + 0.5, x - 0.75, y + 1.5, VOIDC[3]); p.fline(x + 0.5, y + 0.5, x + 0.5, y + 2, VOIDC[2]);
          if (hash2(i, 3, Math.round(P.t * 3)) < 0.6) { p.dot(x, y + 1, PHASE[3]); p.dot(x, y + 1.5, PHASE[1]); g.dot(x, y + 1, '#ffffff'); g.dot(x, y + 1.5, PHASE[2]); }
        }
        continue;
      }
      for (let k = -w; k <= w; k += 0.5) p.px(x + k, y, VOIDC[clamp(Math.round(4 - v * 2 - (k > 0 ? 1 : 0) + (i % 2 ? -1 : 0)), 0, 6)]);
      if (s === len - 1 && hash2(i, 3, Math.round(P.t * 3)) < 0.6) { p.px(x, y + 1, PHASE[1]); g.px(x, y + 1, PHASE[2]); }
    }
  }
  // --- Rumpf: schmaler Brustkorb, Fetzenmantel
  cap(p, waist.x, waist.y, ch.x, ch.y, 3.0, 4.2, VOIDC, { noise: 0.25, seed: 63 });
  // Rippenglühen
  for (let r = 0; r < 3; r++) {
    const ry = ch.y - 0.5 + r * 2.2, rx = ch.x + 0.8 + L * 3;
    if (p.fine) {
      // fein: Rippe als heller Bogen mit Schattenkante; mittlere Rippe glüht mit weißem Kern
      p.fline(rx - 1, ry + 0.5, rx + 0.5, ry - 0.25, VOIDC[6]); p.fline(rx + 0.5, ry - 0.25, rx + 1.5, ry + 0.5, VOIDC[5]); p.fline(rx - 0.5, ry + 1, rx + 1.5, ry + 1, VOIDC[1]);
      if (r === 1) { p.fline(rx - 0.75, ry + 1, rx + 1, ry + 1, PHASE[2]); p.dot(rx, ry + 1, '#ffffff'); g.fline(rx - 1, ry + 1, rx + 1.25, ry + 1, PHASE[3]); g.dot(rx, ry + 1, '#ffffff'); }
      continue;
    }
    p.px(rx, ry, VOIDC[6]); p.px(rx + 1, ry + 0.4, VOIDC[5]);
    if (r === 1) { p.px(rx - 0.5, ry + 1, PHASE[2]); g.px(rx - 0.5, ry + 1, PHASE[2]); }
  }
  // spitze Schulterfetzen
  for (const [sx, sy, a] of [[shB.x - 1, shB.y, -2.3], [shF.x, shF.y - 0.5, -1.9], [ch.x - 3, ch.y + 2, -2.8]]) {
    if (p.fine) { const aa = a - P.drift * 0.2, ex = sx + Math.cos(aa) * 4.5, ey = sy + Math.sin(aa) * 4.5; p.fline(sx, sy, ex, ey, VOIDC[4], 1); p.fline(sx - 0.5, sy, ex, ey, VOIDC[6]); p.dot(ex, ey, PHASE[3]); continue; }   // Schulterzacke: Grat hell, Spitze flimmert
    for (let s = 0; s < 5; s++) p.px(sx + Math.cos(a - P.drift * 0.2) * s, sy + Math.sin(a - P.drift * 0.2) * s, VOIDC[s > 3 ? 6 : 4]);
  }
  // --- Kopf: spitze Kapuze, leeres Gesicht, Schlitzaugen
  const hx = ch.x + 2.5 + L * 3 + P.head, hy = ch.y - 7 + P.headY;
  poly(p, [[hx - 3.5, hy + 3], [hx - 2.5, hy - 3], [hx - 4.5 - P.drift * 3, hy - 8], [hx + 1.5, hy - 4], [hx + 3.8, hy + 0.5], [hx + 3, hy + 3.5]], (x, y) => VOIDC[(y < hy - 3 ? 5 : 4) - (x > hx + 1 ? 1 : 0) - (!p.fine && hash2(x, y, 65) < 0.15 ? 1 : 0)]);
  ell(p, hx + 1.4, hy + 0.6, 2.2, 2.6, ['#020205', '#05040a']);
  if (p.fine) {
    // Handfein: Kapuze mit Stoffkante (Glanzlinie am Rand der Öffnung), Faltenrinne zum Zipfel, Saum unten
    p.fline(hx - 2.5, hy - 3, hx - 4.5 - P.drift * 3, hy - 8, VOIDC[6]); p.fline(hx - 1.5, hy - 2.5, hx - 3.5 - P.drift * 3, hy - 7, VOIDC[2]);
    for (let a = -2.2; a <= 0.3; a += 0.12) p.dot(hx + 1.4 + Math.cos(a) * 2.6, hy + 0.6 + Math.sin(a) * 3, VOIDC[6]);
    p.fline(hx - 3.5, hy + 3, hx + 3, hy + 3.5, VOIDC[2]);
  }
  if (P.eye > 0.2) {
    const c = P.eye > 1.2 ? PHASE[4] : PHASE[3];
    p.px(hx + 1, hy, c); p.px(hx + 2, hy, c); p.px(hx + 3, hy - 0.4, c);
    g.px(hx + 1, hy, PHASE[3]); g.px(hx + 2, hy, PHASE[3]); g.px(hx + 3, hy - 0.4, PHASE[2]);
    if (P.eye > 1.2) { g.px(hx + 4, hy - 0.6, PHASE[1]); g.px(hx + 5, hy - 0.8, PHASE[1]); }
    if (p.fine) { for (const [ex, ey] of [[1, 0], [2, 0], [3, -0.4]]) { p.dot(hx + ex + 0.25, hy + ey + 0.25, '#ffffff'); g.dot(hx + ex + 0.25, hy + ey + 0.25, '#ffffff'); } p.fline(hx + 0.5, hy - 0.5, hx + 3.5, hy - 1, '#000000'); }   // Schlitzaugen: weißer Kern, Schattenkante darüber
  }
  meta.eye = { x: hx + 2, y: hy };
  meta.head = { x: hx - 1, y: hy - 9 };
  meta.mouth = { x: hx + 2, y: hy + 2 };

  // --- vorderer Klingenarm
  if (X.smear) smearArc(p, g, shF.x, shF.y, X.smear[0], X.smear[1], 11, 19, [PHASE[1], PHASE[2], PHASE[3]], [PHASE[1], PHASE[2]], X.smear[2] ?? 1);
  if (X.smear2) smearArc(p, g, shB.x, shB.y, X.smear2[0], X.smear2[1], 10, 16, [MAGE[1], MAGE[2], MAGE[3]], [MAGE[0], MAGE[1]], X.smear2[2] ?? 1);
  const armF = ik(shF.x, shF.y, ch.x + P.hFx, ch.y + P.hFy, 6.5, 7, 1);
  cap(p, shF.x, shF.y, armF.jx, armF.jy, 1.4, 1.1, VOIDC);
  cap(p, armF.jx, armF.jy, armF.ex, armF.ey, 1.1, 1.0, VOIDC);
  const tipF = phaseBlade(p, g, armF.ex, armF.ey, P.aF, 13, false, 1 + P.flick);
  ell(p, shF.x, shF.y, 1.8, 1.6, VOIDC.slice(1));
  if (P.eye > 0.2) {   // Augen bleiben über erhobenen Klingen sichtbar
    const c = P.eye > 1.2 ? PHASE[4] : PHASE[3];
    p.px(hx + 1, hy, c); p.px(hx + 2, hy, c); p.px(hx + 3, hy - 0.4, c);
    if (p.fine) for (const [ex, ey] of [[1, 0], [2, 0], [3, -0.4]]) p.dot(hx + ex + 0.25, hy + ey + 0.25, '#ffffff');
  }
  meta.hand = { x: armF.ex, y: armF.ey };
  meta.tip = tipF; meta.tipB = tipB;
  return meta;
}

// Flimmerrand + Zeilenversatz (Phasenverschiebung) als Nachbearbeitung.
// Versatz je Weltzeile (fein: in Texeln; die zweite Feinzeile springt einen Texel weiter → feine Sägekante).
function phaseFlicker(k, seed, dis = 0) {
  return (p, g) => {
    const r = p.res ?? 1, W = p.w * r, H = p.h * r;
    if (dis > 0) dissolve(p, g, dis, seed + 7, 0, p.h - 14, [PHASE[2], VOIDC[5], MAGE[2], PHASE[1]]);
    const d = getPix(p);
    // Zeilen versetzen. Fein nur bei starkem Flimmern (Verschwinden, Treffer, Tod): bei schwachem Flimmern (Ruhe,
    // Ausholen, Hieb) zerschnitt der Versatz Körper und Klingenschleier in waagerechte Streifen – dort bleibt nur
    // der Farbsaum.
    if (r === 1 || k > 0.6 || dis > 0) for (let Y = 0; Y < H; Y++) {
      const y = Math.floor(Y / r);
      const rr = hash2(y >> 1, 3, seed);
      if (rr > k * 0.45) continue;
      let sh = (hash2(y, 4, seed) < 0.5 ? -1 : 1) * (1 + Math.floor(hash2(y, 5, seed) * (1 + k * 3)));
      sh = sh * r + (r > 1 && Y % r === r - 1 ? Math.sign(sh) : 0);
      const row = d.slice(Y * W, (Y + 1) * W);
      for (let x = 0; x < W; x++) {
        const sx = x - sh;
        d[Y * W + x] = sx < 0 || sx >= W ? 0 : row[sx];
      }
    }
    putPix(p, d);
    // Farbsaum: links Cyan, rechts Magenta (Leuchtebene); Auswahl je Weltpixel, fein 1 Texel breit
    const op = (x, y) => x >= 0 && y >= 0 && x < W && y < H && (d[y * W + x] >>> 24) > 40;
    const gd = getPix(g);
    const cy = (0xff000000 | (190 << 16) | (150 << 8) | 40) >>> 0, mg = (0xff000000 | (170 << 16) | (40 << 8) | 130) >>> 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!op(x, y)) continue;
      if (hash2(Math.floor(x / r), Math.floor(y / r), seed + 9) > 0.35 + k * 0.6) continue;
      if (!op(x - 1, y) && x > 0) gd[y * W + x - 1] = cy;
      if (!op(x + 1, y) && x < W - 1 && k > 0.3) gd[y * W + x + 1] = mg;
    }
    putPix(g, gd);
  };
}

function phaseAnims() {
  const mk = (P, X = {}) => makeFrame(PWS, drawPhase, P, { ...X, after: phaseFlicker(X.flick ?? P.flick, X.seed ?? Math.round(P.t * 10 + P.hFx * 3), X.dis ?? 0) });
  const idleK = cycle((ph) => {
    const s = Math.sin(ph);
    return pwp({ bob: s * 1.4, t: ph, hFy: 6 + s, hBy: 7 + s, aF: 0.55 + s * 0.08, aB: 0.75 - s * 0.06, headY: -Math.max(0, s) * 0.5, flick: 0.15 + Math.max(0, Math.sin(ph * 3)) * 0.2 });
  }, 6);
  const idle = track(mk, idleK, 6, { loop: true, extras: { 2: { flick: 0.5 } } });
  const walk = track(mk, cycle((ph) => {
    const s = Math.sin(ph);
    return pwp({ bob: s * 1.2, lean: 0.4, drift: 0.9, t: ph * 2, hFx: 2, hFy: 10, hBx: -3, hBy: 10, aF: 2.2, aB: 2.4, head: 0.5, flick: 0.25 });
  }, 6), 6, { loop: true });
  // Ausholen: beide Klingen über Kreuz hoch hinter den Kopf
  const w1 = pwp({ bob: 2, lean: -0.05, hFx: 2, hFy: -5, aF: -2.0, hBx: -3, hBy: -5, aB: -2.6, eye: 1.3, flick: 0.4, t: 1, drift: 0.3 });
  const w2 = pwp({ bob: 3.5, lean: -0.2, x: -1.5, hFx: -1, hFy: -9, aF: -2.7, hBx: -5, hBy: -8, aB: -2.9, eye: 1.6, flick: 0.6, t: 2, drift: 0.4, headY: -1 });
  const windup = track(mk, [[0, idleK[0][1]], [0.45, w1], [1, w2]], 4);
  // Hieb: Kreuzschnitt nach vorn unten
  const s1 = pwp({ bob: 1, lean: 0.45, x: 3, hFx: 10, hFy: -3, aF: -0.9, hBx: 6, hBy: -6, aB: -1.4, eye: 1.6, flick: 0.5, t: 3, drift: 1 });
  const s2 = pwp({ bob: -1, lean: 0.6, x: 5, hFx: 10, hFy: 8, aF: 1.0, hBx: 9, hBy: 2, aB: 0.2, eye: 1.4, flick: 0.4, t: 3.6, drift: 1.1 });
  const s3 = pwp({ bob: -1, lean: 0.55, x: 5, hFx: 7, hFy: 11, aF: 1.6, hBx: 9, hBy: 9, aB: 1.2, eye: 1.2, flick: 0.3, t: 4.2, drift: 0.9 });
  const strike = [
    mk(s1, { smear: [-2.4, -0.9] }),
    mk(s2, { smear: [-1.6, 1.0], smear2: [-2.0, 0.3], fx: 'impact' }),
    mk(s3, { smear2: [-0.6, 1.2] }),
    mk(mixP(s3, idleK[0][1], 0.55)),
  ];
  // Verschwinden: Flimmern nimmt zu, Figur zerfasert in Zeilen
  const vP = (i) => pwp({ t: i, bob: i * 0.4, lean: 0.1, eye: 1.4, hFy: 8, hBy: 9, flick: 0.5 + i * 0.12 });
  const vanish = [
    mk(vP(0), { flick: 0.6, fx: 'cast' }), mk(vP(1), { flick: 0.9 }), mk(vP(2), { flick: 1.2, dis: 0.3 }),
    mk(vP(3), { flick: 1.5, dis: 0.55 }), mk(vP(4), { flick: 1.8, dis: 0.8 }), mk(vP(5), { flick: 2, dis: 0.97 }),
  ];
  // Auftauchen hinter dem Helden: erst Streifen, dann Figur, Augen lodern
  const appear = [
    mk(vP(5), { flick: 2, dis: 0.95, seed: 71 }), mk(vP(4), { flick: 1.7, dis: 0.7, seed: 72 }), mk(vP(3), { flick: 1.3, dis: 0.4, seed: 73 }),
    mk({ ...vP(2), eye: 1.6 }, { flick: 0.9, dis: 0.12, seed: 74 }), mk({ ...vP(1), eye: 1.6 }, { flick: 0.5, seed: 75, fx: 'cast' }), mk(idleK[0][1], { flick: 0.3, seed: 76 }),
  ];
  const hurtP = pwp({ bob: 2, lean: -0.3, x: -3, head: -1.5, hFx: 3, hFy: 5, aF: 0.3, hBx: -3, hBy: 6, aB: 0.5, eye: 1.5, flick: 1, t: 2 });
  const hurt = [mk(hurtP, { flick: 1.2 }), mk(mixP(hurtP, idleK[0][1], 0.5), { flick: 0.5 })];
  // Tod: zerreißt, Klingen fallen klirrend zu Boden
  const blades = (p, g) => {
    phaseBlade(p, g, PWS.AX - 9, PWS.AY - 2, 0.05, 11, false, 0);
    phaseBlade(p, g, PWS.AX + 2, PWS.AY - 1, -0.1, 10, true, 0);
    return {};
  };
  const d1 = pwp({ ...hurtP, eye: 2, flick: 1.4 });
  const d2 = pwp({ bob: -2, hover: 4, lean: 0.3, hFx: 6, hFy: 12, hBx: 2, hBy: 12, aF: 1.5, aB: 1.6, eye: 0.6, t: 3 });
  const death = [
    mk(d1, { flick: 1.4 }), mk(d1, { flick: 1.8, dis: 0.2, seed: 81 }),
    mk(d2, { flick: 1.5, dis: 0.45, seed: 82, post: blades, fx: 'impact' }),
    mk(d2, { flick: 1.2, dis: 0.7, seed: 83, post: blades }),
    mk(d2, { flick: 0.8, dis: 0.92, seed: 84, post: blades }),
    makeFrame(PWS, () => ({}), {}, { post: blades }),
  ];
  return {
    idle: new Animation(idle, 6),
    walk: new Animation(walk, 9),
    windup: new Animation(windup, 7, false),
    strike: new Animation(strike, 14, false),
    vanish: new Animation(vanish, 12, false),
    appear: new Animation(appear, 12, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 8, false),
  };
}

// ================================================================ Export

// Figurensätze werden erst beim ersten Zugriff gebaut (je Typ).

// Randlicht nach fertigem Frame (Signatur wie im Review gewünscht: rimGlow(anims, {top, side, glowTop, glowSide, k})).
// Innenpixel direkt unter der dunklen Kontur werden zur Oberkante hin aufgehellt (top), seitlich schwächer (side);
// dieselben Pixel bekommen auf der Leucht-Ebene einen additiven Saum, damit die Figur auf dunklem Boden lesbar bleibt.
// Arbeitet auf fertigen Frames (STYLE §8): Texel; Saumtiefe in Weltpixeln (je res Texel), damit fein wie grob gleich wirkt.
const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function rimGlow(anims, o) {
  // Bauer statt fertiger Sätze: makeFrame wendet den Saum gleich auf die Pixeldaten an (kein Zurücklesen der Leinwand)
  if (typeof anims === 'function') {
    const prev = RIM_GLOW; RIM_GLOW = o;
    try { anims = anims(); } finally { RIM_GLOW = prev; }
  }
  const done = new Set();
  for (const a of Object.values(anims)) for (const f of a.frames) {
    if (done.has(f) || f.rimGlow) continue; done.add(f);
    const r = f.res ?? 1;
    const c = f.canvas, W = c.width, H = c.height, x2 = c.getContext('2d');
    const im = x2.getImageData(0, 0, W, H);
    if (!f.glow) f.glow = new SpriteFrame(new FineCanvas(Math.ceil(W / r), Math.ceil(H / r), r).canvas, f.ax, f.ay, r);
    const g = f.glow, gc = g.canvas, gx = gc.getContext('2d'), gim = gx.getImageData(0, 0, gc.width, gc.height);
    rimGlowPixels(new Uint32Array(im.data.buffer), W, H, r, o, new Uint32Array(gim.data.buffer), gc.width, gc.height, g.ax - f.ax, g.ay - f.ay);
    x2.putImageData(im, 0, 0); gx.putImageData(gim, 0, 0);
    f.rimGlow = true;
  }
  return anims;
}
let RIM_GLOW = null;
// Kern von rimGlow auf Pixelpuffern (Uint32 RGBA): d = fertiger Frame (mit Kontur) W×H, gd = Leuchtebene GW×GH,
// ox/oy = Versatz Leuchtebene gegenüber Frame (Texel).
function rimGlowPixels(d32, W, H, r, o, gd32, GW, GH, ox, oy) {
  const T = hexRGB(o.top), Sd = hexRGB(o.side), k = o.k ?? 0.4;
  const d = bytes(d32), gd = bytes(gd32);
  // nur im Umriss-Rechteck der deckenden Pixel arbeiten (außerhalb ist nichts)
  let X0 = W, X1 = -1, Y0 = H, Y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d32[y * W + x] >>> 24) {
    if (x < X0) X0 = x; if (x > X1) X1 = x; if (y < Y0) Y0 = y; Y1 = y;
  }
  if (X1 < 0) return;
  const w = X1 - X0 + 1, h = Y1 - Y0 + 1, N = w * h, op = new Uint8Array(N), outl = new Uint8Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) op[y * w + x] = d32[(y + Y0) * W + x + X0] >>> 24 ? 1 : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (op[i] && (x === 0 || !op[i - 1] || x === w - 1 || !op[i + 1] || y === 0 || !op[i - w] || y === h - 1 || !op[i + w])) outl[i] = 1;
  }
  // Abstand zur nächsten Konturkante oben/unten/links/rechts (0 = keine), in Texeln, gekappt
  const cm = 4 * r + 4, up = new Uint16Array(N), dn = new Uint16Array(N), lf = new Uint16Array(N), rt = new Uint16Array(N);
  for (let i = w; i < N; i++) { const v = up[i - w]; up[i] = outl[i - w] ? 1 : v && v < cm ? v + 1 : v; }
  for (let i = N - w - 1; i >= 0; i--) { const v = dn[i + w]; dn[i] = outl[i + w] ? 1 : v && v < cm ? v + 1 : v; }
  for (let y = 0; y < h; y++) {
    const o0 = y * w;
    for (let i = o0 + 1; i < o0 + w; i++) { const v = lf[i - 1]; lf[i] = outl[i - 1] ? 1 : v && v < cm ? v + 1 : v; }
    for (let i = o0 + w - 2; i >= o0; i--) { const v = rt[i + 1]; rt[i] = outl[i + 1] ? 1 : v && v < cm ? v + 1 : v; }
  }
  const within = (v, n) => v > 0 && v <= n;
  const tops = [], sides = [];
  for (let i = 0; i < N; i++) {
    if (!op[i] || outl[i]) continue;
    let col = null, kk = 0;
    const I = ((i / w) | 0) + Y0, J = I * W + (i % w) + X0;   // Index im ganzen Frame
    if (within(up[i], r)) { col = T; kk = k; tops.push(J); }
    else if (within(up[i], 2 * r) && !within(dn[i], r)) { col = T; kk = k * 0.45; }
    else if (within(lf[i], r) || (r === 1 && within(rt[i], r))) { col = Sd; kk = k * 0.8; sides.push(J); }   // fein: Seitenlicht nur links
    if (!col) continue;
    for (let j = 0; j < 3; j++) d[J * 4 + j] = Math.round(d[J * 4 + j] * (1 - kk) + col[j] * kk);
  }
  // Saum additiv in die Leuchtebene (wie 'lighter', in einem Durchgang statt fillRect je Texel)
  const add = (list, c) => {
    for (const i of list) {
      const x = (i % W) + ox, y = ((i / W) | 0) + oy;
      if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
      const q = (y * GW + x) * 4, a = gd[q + 3] / 255;
      for (let j = 0; j < 3; j++) gd[q + j] = Math.min(255, c[j] + Math.round(gd[q + j] * a));
      gd[q + 3] = 255;
    }
  };
  add(sides, hexRGB(o.glowSide)); add(tops, hexRGB(o.glowTop));
}

const NEW2 = {
  dust_shaman: shamanAnims,
  dust_totem: totemAnims,
  gnoll_trapper: gnollAnims,
  bog_slime: () => slimeAnims(1),
  bog_slime_small: () => slimeAnims(0.8),
  marsh_hag: hagAnims,
  frost_revenant: revenantAnims,
  snow_burrower: burrowerAnims,
  cinder_bombardier: () => rimGlow(bombardierAnims, { top: '#c8b4a0', side: '#8a6a50', glowTop: '#8c7464', glowSide: '#5a2a14', k: 0.45 }),
  phase_wraith: () => rimGlow(phaseAnims, { top: '#d8c8ff', side: '#9a80d8', glowTop: '#8a70c8', glowSide: '#3a2070', k: 0.4 }),
};

export function createNew2Foes() {
  const out = {};
  for (const k in NEW2) {
    Object.defineProperty(out, k, {
      configurable: true, enumerable: true,
      get() {
        const v = NEW2[k]();
        POOL.clear();
        Object.defineProperty(out, k, { value: v, writable: true, configurable: true, enumerable: true });
        return v;
      },
    });
  }
  return out;
}
