import { PAL } from '../gfx/Palette.js';
import { buildFrame, SpriteFrame, Animation } from '../gfx/Sprite.js';
import { FineCanvas, fineRes, pixelsToCanvas, col32 } from '../gfx/Fine.js';
import { hash2 } from '../core/math.js';

// Gegner der Aschensteppe: Steppenräuber, Räuberschützin, Staubhyäne,
// Aschegeier und Khar, der Steppenfürst (Elite).
//
// Wie foes_ashwood.js: kleine Rigs (Hüfte, Rumpf, Kopf, IK-Arme/-Beine bzw.
// parametrische Tiere), Schlüsselposen werden beim Laden weich interpoliert.
// Material wird pro Pixel mit Licht von links oben schattiert (wie foes_cinder.js),
// danach legt ein Randlicht-Pass (Aschehimmel, warmes Grau) eine helle Kante
// auf die Oberseiten – die Silhouette bleibt auf dunklem Boden lesbar.
// Jeder Frame hat eine Leucht-Ebene (frame.glow), Metadaten (frame.meta:
// eye/hand/mouth/head/tip relativ zum Anker) und optional frame.fx
// ('step' | 'impact' | 'roar' | 'cast'). Blickrichtung rechts, Anker = Bodenkontakt.
// Der Aschegeier schwebt im Sprite über dem Anker (Schatten zeichnet die Engine am Boden).

// ================================================================ Werkzeuge

const ease = (t) => t * t * (3 - 2 * t);
const linear = (t) => t;
const snap = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const TAU = Math.PI * 2;

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

// Wie FineCanvas.each, aber schneller: Farbe zwischengespeichert, direkt in den Puffer (nur deckende Farben).
// span(y) -> [xa, xb] engt die Spalten je Zeile ein (Weltkoordinaten, darf großzügig sein).
function fill(p, x0, y0, x1, y1, fn, span = null) {
  const r = p.res, W = p.W, H = p.H, buf = p.buf;
  const F0 = Math.floor(x0 * r), F1 = Math.ceil(x1 * r), G0 = Math.floor(y0 * r), G1 = Math.ceil(y1 * r);
  const fo = Math.round(p.ox * r), go = Math.round(p.oy * r);
  let lc = null, lv = 0;
  for (let G = G0; G <= G1; G++) {
    const ty = G + go;
    if (ty < 0 || ty >= H) continue;
    const y = (G + 0.5) / r, row = ty * W;
    let Fa = F0, Fb = F1;
    if (span) { const s = span(y); Fa = Math.max(F0, Math.floor(s[0] * r)); Fb = Math.min(F1, Math.ceil(s[1] * r)); }
    for (let F = Fa; F <= Fb; F++) {
      const tx = F + fo;
      if (tx < 0 || tx >= W) continue;
      const c = fn((F + 0.5) / r, y);
      if (!c) continue;
      if (c !== lc) { lc = c; lv = col32(c); }
      buf[row + tx] = lv;
    }
  }
  p.dirty = true;
}

// Schattierte Ellipse (optional gedreht). Tastet Feinpixel ab (p.each); Materialrauschen nur im groben Raster
// („Niedrig“, wie früher) – im Feinraster ersetzen gezielte Strähnen/Federn/Kanten das Rauschen.
function ell(p, cx, cy, rx, ry, ramp, o = {}) {
  const { rot = 0, noise: nz0 = 0, seed = 1, bias = 0, clip = null } = o;
  const noise = p.fine ? 0 : nz0, h = (p.step ?? 1) / 2;
  const c = Math.cos(rot), s = Math.sin(rot);
  const R = Math.ceil(Math.max(rx, ry)) + 1;
  fill(p, Math.floor(cx - R), Math.floor(cy - R), cx + R, cy + R, (x, y) => {
    const dx = x - cx, dy = y - cy;
    const u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry;
    const d2 = u * u + v * v;
    if (d2 > 1) return null;
    if (clip && !clip(x - h, y - h)) return null;
    const nz = Math.sqrt(1 - d2);
    const nx = u * c - v * s, ny = u * s + v * c;
    const n = noise ? (hash2(Math.round(dx) + 64, Math.round(dy) + 64, seed) - 0.5) * noise : 0;
    return tone(ramp, nx, ny, nz, bias, n);
  });
}

// Schattierte Kapsel (Gliedmaßen): Radius r0 -> r1
function cap(p, x0, y0, x1, y1, r0, r1, ramp, o = {}) {
  const { noise: nz0 = 0, seed = 1, bias = 0 } = o;
  const noise = p.fine ? 0 : nz0;
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 0.0001;
  const R = Math.ceil(Math.max(r0, r1)) + 1;
  const minX = Math.floor(Math.min(x0, x1) - R), maxX = Math.ceil(Math.max(x0, x1) + R);
  const minY = Math.floor(Math.min(y0, y1) - R), maxY = Math.ceil(Math.max(y0, y1) + R);
  fill(p, minX, minY, maxX, maxY, (px, py) => {
    const t = clamp(((px - x0) * dx + (py - y0) * dy) / l2, 0, 1);
    const qx = x0 + dx * t, qy = y0 + dy * t;
    const r = r0 + (r1 - r0) * t;
    const ex = px - qx, ey = py - qy, d = Math.hypot(ex, ey);
    if (d > r) return null;
    const nx = ex / (r || 1), ny = ey / (r || 1), nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const n = noise ? (hash2(Math.round(px - x0) + 64, Math.round(py - y0) + 64, seed) - 0.5) * noise : 0;
    return tone(ramp, nx, ny, nz, bias, n);
  }, Math.abs(dy) < 1e-6 ? null : (y) => {
    // Zeile y berührt nur Segmentpunkte mit |qy - y| <= R: Spaltenbereich daraus (+R)
    const Rm = Math.max(r0, r1);
    let ta = clamp((y - Rm - y0) / dy, 0, 1), tb = clamp((y + Rm - y0) / dy, 0, 1);
    const xa = x0 + dx * ta, xb = x0 + dx * tb;
    return [Math.min(xa, xb) - Rm - 1, Math.max(xa, xb) + Rm + 1];
  });

}

// Flache Ellipse: bei res 1 der alte Zeilen-Algorithmus (PixelCanvas.ellipse, pixelgleich), fein abgetastet sonst.
function oval(p, cx, cy, rx, ry, c) {
  if (p.fine) { p.ellipse(cx, cy, rx, ry, c); return; }
  for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
    const t = 1 - (y * y) / (ry * ry);
    if (t < 0) continue;
    const hw = Math.round(rx * Math.sqrt(t) - 0.15);
    p.rect(Math.round(cx - hw), Math.round(cy + y), hw * 2 + 1, 1, c);
  }
}

// Gefülltes Polygon (Scanline, je Feinpixelzeile). col: Farbe oder (x, y) => Farbe|null
// (x/y = linke obere Ecke des (Fein-)Pixels in Weltkoordinaten).
function poly(p, pts, col) {
  let minY = Infinity, maxY = -Infinity;
  for (const q of pts) { minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]); }
  const q = p.step ?? 1, fn = typeof col === 'function';
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y += q) {
    const yc = y + q / 2, xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + (yc - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.round(xs[k] / q) * q, x1 = Math.round(xs[k + 1] / q) * q;
      if (fn) {
        for (let x = x0; x < x1 - 1e-6; x += q) {
          const c = col(x, y);
          if (c) { if (q < 1) p.dot(x, y, c); else p.px(x, y, c); }
        }
      } else if (x1 > x0) p.rect(x0, y, x1 - x0, q, col);
    }
  }
}

// Schwung-Schleier: überstreicht die Klinge von a0 nach a1 (Drehpunkt cx/cy),
// am Ende breit und hell, am Anfang schmal; sy staucht die Bahn senkrecht.
// Fein: geschlossene Sichel in Feinpixeln (dicht, ohne Streuung – flimmert nicht).
function smearArc(p, g, cx, cy, a0, a1, r0, r1, cols, gcols, sy = 1) {
  // geschlossene Sichel ohne Raster: dünn am Anfang, zur Klinge hin breit,
  // Außenkante hell (Klingenbahn), innen dunkler auslaufend
  const q = p.step ?? 1, R = 1 / q, fine = q < 1;
  const n = Math.ceil(Math.abs(a1 - a0) * r1 * 1.6 * R) + 2;
  for (let i = 0; i <= n; i++) {
    const f = i / n, a = a0 + (a1 - a0) * f;
    const w = (r1 - r0) * (0.12 + 0.88 * f * f);
    for (let r = r1 - w; r <= r1; r += 0.5 * q) {
      const radial = (r - (r1 - w)) / (w || 1);
      const x = Math.round((cx + Math.cos(a) * r) * R) * q, y = Math.round((cy + Math.sin(a) * r * sy) * R) * q;
      const c = radial > 0.8 ? cols[2] : radial > 0.4 ? cols[1] : cols[0];
      if (fine) {
        p.dot(x, y, r > r1 - 0.3 && f > 0.5 ? '#ffffff' : c);   // heiße Schneidenbahn außen
        if (g && gcols && f > 0.35 && radial > 0.45) g.dot(x, y, radial > 0.8 ? gcols[1] : gcols[0]);
      } else {
        p.px(x, y, c);
        if (g && gcols && f > 0.35 && radial > 0.45) g.px(x, y, radial > 0.8 ? gcols[1] : gcols[0]);
      }
    }
  }
}

// Staubkranz am Boden (Aufprall, Stampfen); fein: jede Wolke bekommt eine helle Kuppe (Licht oben links)
function dust(p, x, y, r, seed, cols, n = 16) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + hash2(i, 1, seed) * 0.4;
    const rr = r * (0.55 + hash2(i, 2, seed) * 0.6);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.4 - (Math.sin(a) < 0 ? hash2(i, 3, seed) * 3 : 0);
    p.px(px, py, cols[i % cols.length]);
    if (hash2(i, 4, seed) < 0.55) p.px(px + 1, py, cols[(i + 1) % cols.length]);
    if (hash2(i, 5, seed) < 0.3) p.px(px, py - 1, cols[(i + 2) % cols.length]);
    if (p.fine) { const s = p.snap(px), t = p.snap(py); p.dot(s, t, '#c4b69a'); p.dot(s + 0.5, t + 0.5, cols[3]); }
  }
}

// Dreht einen Pixelpuffer (W×H Texel) texelgenau (nächster Nachbar) um einen Drehpunkt (Texelkoordinaten).
function rotBlit(s, d, W, H, px, py, ang) {
  const c = Math.cos(-ang), sn = Math.sin(-ang);
  // nur der Zielbereich, in den der Inhalt der Quelle gedreht wird (Ecken des Quell-Rahmens)
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (s[y * W + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; }
  if (x1 < 0) return;
  let X0 = W, Y0 = H, X1 = 0, Y1 = 0;
  for (const [u, v] of [[x0, y0], [x1 + 1, y0], [x0, y1 + 1], [x1 + 1, y1 + 1]]) {
    const rx = u - px, ry = v - py, X = px + rx * c + ry * sn, Y = py - rx * sn + ry * c;
    X0 = Math.min(X0, X); X1 = Math.max(X1, X); Y0 = Math.min(Y0, Y); Y1 = Math.max(Y1, Y);
  }
  const ya = Math.max(0, Math.floor(Y0) - 2), yb = Math.min(H - 1, Math.ceil(Y1) + 2);
  const xa = Math.max(0, Math.floor(X0) - 2), xb = Math.min(W - 1, Math.ceil(X1) + 2);
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
    const rx = x + 0.5 - px, ry = y + 0.5 - py;
    const sx = Math.floor(px + rx * c - ry * sn), sy = Math.floor(py + rx * sn + ry * c);
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
    const v = s[sy * W + sx];
    if (v) d[y * W + x] = v;
  }
}
// Setzt einen Pixelpuffer (gleiche Breite) um dy Texelzeilen verschoben in eine FineCanvas (ohne Verschiebung).
function blitRows(src, W, H, dst, dy) {
  for (let y = 0; y < H; y++) {
    const ty = y + dy;
    if (ty < 0 || ty >= dst.H) continue;
    for (let x = 0; x < W; x++) { const v = src[y * W + x]; if (v) dst.put(x, ty, v); }
  }
}

// Randlicht: Oberkanten (oben frei) kräftig, linke Kanten schwächer zum
// Himmelslicht hin aufhellen. Läuft vor dem Umriss aus buildFrame, in Texeln.
// Fein ersetzt es den Feinschliff von buildFrame (warmer Aschehimmel statt Mondlicht): Kante 1 Feinpixel,
// dazu der Kontaktschatten unten (1 Feinpixel dunkler).
const RIM = [238, 224, 196];
function rimLight(p, k1 = 0.42, k2 = 0.24) {
  const w = p.W, h = p.H, fine = p.fine;
  let img = null, d;
  if (p._canvas) { img = p.ctx.getImageData(0, 0, w, h); d = img.data; }
  else d = new Uint8ClampedArray(p.buf.buffer);
  const a = new Uint32Array(d.buffer, d.byteOffset, w * h);   // Deckung aus dem Alphabyte (bleibt beim Aufhellen gleich)
  const sh = 0.74;
  for (let y = 0; y < h; y++) for (let x = 0, i = y * w; x < w; x++, i++) {
    if ((a[i] >>> 24) <= 40) continue;
    const up = y > 0 && (a[i - w] >>> 24) > 40, lf = x > 0 && (a[i - 1] >>> 24) > 40;
    const k = !up ? k1 : !lf ? k2 : (x > 0 && (a[i - w - 1] >>> 24) <= 40) ? k2 * 0.5 : 0;
    const j = i * 4;
    if (!k) {
      if (fine && (y === h - 1 || (a[i + w] >>> 24) <= 40)) { d[j] *= sh; d[j + 1] *= sh; d[j + 2] *= sh; }
      continue;
    }

    d[j] += (RIM[0] - d[j]) * k; d[j + 1] += (RIM[1] - d[j + 1]) * k; d[j + 2] += (RIM[2] - d[j + 2]) * k;
  }
  if (img) p.ctx.putImageData(img, 0, 0);
  else p.dirty = true;
}

// Leuchtebene auf ihren Inhalt zuschneiden (Anker entsprechend verschoben): spart Bauzeit und Speicher,
// gezeichnet wird ankerbezogen (SpriteFrame.draw), auch gespiegelt richtig.
function cropGlow(g, ax, ay, res) {
  const W = g.W, H = g.H, b = g.buf;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) if (b[row + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; }
  }
  if (x1 < 0) return new SpriteFrame(pixelsToCanvas(new Uint32Array(1), 1, 1), ax, ay, res);
  const w = x1 - x0 + 1, h = y1 - y0 + 1, d = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) d.set(b.subarray((y + y0) * W + x0, (y + y0) * W + x0 + w), y * w);
  return new SpriteFrame(pixelsToCanvas(d, w, h), ax - x0, ay - y0, res);
}

// Baut einen Frame: draw(p, g, P, X) -> meta (Koordinaten im Grundmaß S.W×S.H).
// S.pad = Rand für Schleier/Staub. X.rot = [winkel, drehpunktX, drehpunktY] kippt die
// ganze Figur (Sturz) und setzt sie wieder auf den Boden. X.post zeichnet danach
// ungedreht (liegende Waffe). X.fx = Frame-Marke.
// Feinraster: p und g sind FineCanvas (res = fineRes()); Verschiebung über translate, Drehung in Texeln.
function makeFrame(S, draw, P, X = {}) {
  const pad = S.pad ?? 10, res = fineRes();
  const W = S.W + pad * 2, H = S.H + pad * 2, AX = S.AX + pad, AY = S.AY + pad;
  const g = new FineCanvas(W, H, res);
  const meta = {};
  const f = buildFrame(W, H, AX, AY, (p) => {
    if (X.rot && Math.abs(X.rot[0]) > 0.001) {
      const R = 32, HH = H + R * 2;
      const tp = new FineCanvas(W, HH, res), tg = new FineCanvas(W, HH, res);
      tp.translate(pad, pad + R); tg.translate(pad, pad + R);
      const m0 = draw(tp, tg, P, X) || {};
      tp.resetTranslate(); tg.resetTranslate();
      const [a, rx0, ry0] = X.rot, rx = rx0 + pad, ry = ry0 + pad + R;
      const WR = W * res, HR = HH * res, sp = tp.pixels(), sg = tg.pixels();
      const rp = new Uint32Array(WR * HR), rg = new Uint32Array(WR * HR);
      rotBlit(sp, rp, WR, HR, rx * res, ry * res, a); rotBlit(sg, rg, WR, HR, rx * res, ry * res, a);
      let bottom = -1;
      for (let y = HR - 1; y >= 0 && bottom < 0; y--) for (let x = 0; x < WR; x++) if ((rp[y * WR + x] >>> 24) > 40) { bottom = y; break; }
      const shift = bottom >= 0 ? Math.round(((AY - 1 / res) - bottom / res) * res) / res : -R;
      blitRows(rp, WR, HR, p, Math.round(shift * res)); blitRows(rg, WR, HR, g, Math.round(shift * res));
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
    rimLight(p);
  }, { fine: true, res, finish: false });
  f.glow = g._canvas ? new SpriteFrame(g.canvas, AX * res, AY * res, res) : cropGlow(g, AX * res, AY * res, res);
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

// ================================================================ Farben

const GLOW_EMBER = ['#7a2208', '#c8420c', '#f07a1c', '#ffb640', '#fff0b0'];
const COLD = ['#48526a', '#a3b0c6', '#eef4ff'];
const COLD_G = ['#2d3548', '#6d7a94'];
const DUST = ['#6a5e4c', '#8a7c64', '#a89a80', '#5a4e40'];

const SK = ['#2e1a12', '#4e2e1e', '#76472c', '#9c6440', '#bd8458', '#d9a57a'];            // sonnengegerbte Haut
const FUR = ['#16120f', '#2a231c', '#40362b', '#5a4c3c', '#77664f', '#958268', '#b4a184']; // graubraunes Steppenfell
const LEA = ['#1b110b', '#2e1d12', '#46301e', '#61442b', '#7e5a39', '#9c7349'];
const FELT = ['#17120f', '#271f19', '#3a2f25', '#504132', '#6a5642'];                 // Filzhose, Mütze
const BRZ = ['#2a1606', '#4f2c0e', '#7a4a18', '#a86e28', '#d09a44', '#f0c878', '#fff0c0']; // Bronze
const TEAL = ['#0f1719', '#182a2e', '#243f45', '#33575d', '#4a767a', '#6a9894'];      // verblichene Schärpe
const OCHRE = ['#3a0e08', '#6e1c0e', '#a0321a', '#c8502a', '#e07a3c'];               // Kriegsbemalung
const HAIR = ['#0c0908', '#1a1310', '#2a201a', '#3d3027'];
const WOOD = ['#26180e', '#3f2a18', '#5a3e24', '#7a5834', '#96703f'];
const HORNB = ['#1a120c', '#2e2016', '#48321f', '#6a4a2c'];                           // lackiertes Horn (Reiterbogen)
const St = PAL.steel, BONE = PAL.bone;
const PAINT_W = '#d8ccb4';

// ================================================================ Steppenräuber + Räuberschützin

const RS = { W: 64, H: 46, AX: 30, AY: 42, pad: 10 };
const RD = { legH: 10, thigh: 5.2, shin: 5.6, spine: 7.5, upper: 4.2, fore: 4.3, sh: 1.6, hipW: 1.1 };
const R_REST = {
  hipX: 0, hipY: 0, lean: 0.06, head: 0, fFx: 3, fFy: 0, fBx: -3, fBy: 0,
  hFx: 5, hFy: 6, hBx: 4, hBy: 4, wa: -1.0, sh: 0, cape: 0.15, capeT: 0,
  bowA: 0.05, draw: 0, arrow: 0, eye: 1, jaw: 0,
};
const rpose = (o = {}) => ({ ...R_REST, ...o });

// Fein: kurze Fell-/Federstriche in einer (gedrehten) Ellipse, oben links hell, unten rechts dunkel.
// cols dunkel → hell; Strichrichtung (sx, sy) in Weltpixeln.
function strokes(p, cx, cy, rx, ry, cols, n, seed, sx = -0.6, sy = 1.1, rot = 0) {
  // Lagen in versetzten Reihen (leicht verschoben), damit es als Fell liest und nicht als Rauschen
  const c = Math.cos(rot), s = Math.sin(rot), L = cols.length;
  const rows = Math.max(1, Math.round(Math.sqrt(n * ry / rx))), per = Math.max(1, Math.round(n / rows));
  for (let i = 0; i < rows * per; i++) {
    const r = Math.floor(i / per), q = i % per;
    const u = -1 + (q + 0.5 + (r % 2) * 0.5 + (hash2(i, 1, seed) - 0.5) * 0.4) / per * 2;
    const v = -1 + (r + 0.5 + (hash2(i, 2, seed) - 0.5) * 0.4) / rows * 2;
    if (u * u + v * v > 0.7) continue;
    const lx = u * rx, ly = v * ry, x = cx + lx * c - ly * s, y = cy + lx * s + ly * c;
    const t = clamp((v * 0.8 + u * 0.35 + 1) / 2, 0, 0.999), k = clamp(Math.floor((1 - t) * L), 0, L - 1);
    // Strähne: dunkle Kerbe, die helle Spitze oben (Licht oben links)
    p.fline(x, y, x + sx, y + sy, cols[Math.max(0, k - 1)]);
    p.dot(x - sx * 0.3, y - sy * 0.3, cols[Math.min(L - 1, k + 1)]);
  }
}
// Fein: Punktlinie (Naht) von a nach b, Abstand gap Weltpixel
function stitch(p, x0, y0, x1, y1, c, gap = 0.75) {
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / gap));
  for (let i = 0; i <= n; i++) p.dot(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c);
}

// Fellmantel / Umhang hinten: zottelige Strähnen, die im Wind wehen
// Fein: jede Strähne 2 Feinpixel breit, links im Licht, rechts eine Stufe dunkler (Strähnen trennen sich),
// Spitzen hell.
function mantle(p, top, n, len0, P, ramp, seed, spread = 0.75) {
  const fine = p.fine, q = fine ? 0.5 : 1;
  for (let i = 0; i < n; i++) {
    const len = len0 + (hash2(i, 3, seed) * 3 | 0) - i * 0.35;
    for (let j = 0; j < len; j += q) {
      const v = j / len;
      const x = top.x - 1 - i * spread - P.cape * 7 * v * v + Math.sin(P.capeT + v * 3 + i * 0.7) * 0.9 * v;
      const y = top.y + j + i * 0.25 - P.cape * 2.2 * v * v;
      let ci = i === 0 ? 4 : i === 1 ? 3 : (i + Math.floor(j)) % 4 === 0 ? 1 : 2;
      if (j >= len - 1.5) ci = i < 2 ? 5 : 3;
      if (fine) {
        p.dot(x + 0.25, y + 0.25, ramp[ci]);
        p.dot(x + 0.75, y + 0.25, ramp[Math.max(0, ci - 1)]);

      } else p.px(x, y, ramp[ci]);
    }
  }
}

// Krummsäbel: Griff mit Bronzeknauf, Parierstange, zum Rücken gekrümmte Klinge
function drawSabre(p, hx, hy, a) {
  const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
  p.line(hx - dx * 2, hy - dy * 2, hx + dx, hy + dy, LEA[1]);
  p.px(hx - dx * 3, hy - dy * 3, BRZ[4]); p.px(hx - dx * 2.6 + nx * 0.6, hy - dy * 2.6 + ny * 0.6, BRZ[2]);
  for (let k = -1.5; k <= 1.5; k += 0.5) p.px(hx + dx * 1.6 + nx * k, hy + dy * 1.6 + ny * k, k < 0 ? BRZ[4] : BRZ[2]);
  // fein: Klinge in Feinpixeln mit schmaler Schneide; Glanzlinie, Hohlkehle, Glanzpunkt, Griffwicklung
  const fine = p.fine, ss = fine ? 0.2 : 0.4, q = fine ? 0.25 : 0.5, e = fine ? 0.3 : 0.5;
  const put = fine ? p.dot.bind(p) : p.px.bind(p);
  let tip = null;
  const at = (s, k) => {
    const f = (s - 2) / 10, curv = f * f * 2.4;
    return [hx + dx * s - nx * curv + nx * k, hy + dy * s - ny * curv + ny * k];
  };
  for (let s = 2; s <= 12; s += ss) {
    const f = (s - 2) / 10;
    const curv = f * f * 2.4;
    const hw = 1.0 - f * 0.45 + (f > 0.55 && f < 0.85 ? 0.2 : 0);
    const cx = hx + dx * s - nx * curv, cy = hy + dy * s - ny * curv;
    for (let k = -hw; k <= hw + 0.01; k += q) {
      const c = k > hw - e ? St[5] : k < -hw + e ? St[2] : k > 0 ? St[4] : St[3];
      put(cx + nx * k, cy + ny * k, c);
    }
    tip = { x: cx, y: cy };
  }
  // Hohlkehle
  p.px(hx + dx * 5 - nx * 0.3, hy + dy * 5 - ny * 0.3, St[2]);
  if (fine) {
    for (let s = 2.4; s <= 8.5; s += 0.25) { const [x, y] = at(s, -0.3); p.dot(x, y, St[1]); }          // Hohlkehle (dunkel)
    for (let s = 2.4; s <= 11; s += 0.25) { const [x, y] = at(s, 0.15); p.dot(x, y, s > 9.5 ? St[5] : St[4]); }   // Glanzlinie
    let [x, y] = at(4.2, 0.2); p.dot(x, y, '#ffffff'); [x, y] = at(4.4, 0.2); p.dot(x, y, '#ffffff');   // Glanzpunkt
    [x, y] = at(7.3, 0.85); p.dot(x, y, St[2]); [x, y] = at(6.1, 0.9); p.dot(x, y, St[3]);              // Scharten
    for (let s = -1.8; s <= 0.8; s += 0.6) p.dot(hx + dx * s + nx * 0.25, hy + dy * s + ny * 0.25, LEA[3]);   // Wicklung
    p.dot(hx - dx * 3 - 0.25, hy - dy * 3 - 0.25, BRZ[6]);                                               // Knauf-Glanz
    p.dot(hx + dx * 1.6 - nx * 1.25, hy + dy * 1.6 - ny * 1.25, BRZ[6]);
  }
  return tip;
}

// Rundschild aus Rohhaut mit Bronzerand, Ockersonne und Buckel
function drawTarge(p, x, y, tilt) {
  const rx = 2.6 + tilt, ry = 4.2;
  oval(p, x, y, rx + 0.8, ry + 0.8, BRZ[1]);
  ell(p, x, y, rx, ry, ['#2a1c12', '#3e2a1c', '#553a26', '#6e4e32', '#886440']);
  // Sonnenstrahlen
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3;
    p.px(x + Math.cos(a) * rx * 0.6, y + Math.sin(a) * ry * 0.6, i % 2 ? OCHRE[1] : OCHRE[2]);
  }
  oval(p, x, y, Math.max(0.6, rx * 0.25), 1, OCHRE[2]);
  p.px(x - 0.5, y - 0.5, BRZ[5]); p.px(x, y, BRZ[3]);
  p.px(x - rx - 0.5, y - 2, BRZ[5]); p.px(x - rx * 0.4, y - ry - 0.5, BRZ[5]);
  // Fellquaste am Rand
  p.px(x + rx * 0.4, y + ry + 1, FUR[4]); p.px(x + rx * 0.4, y + ry + 2, FUR[3]); p.px(x + rx * 0.4 + 1, y + ry + 3, FUR[2]);
  if (p.fine) {
    // Bronzerand: Glanzlinie oben links, Nieten rundum; feine Sonnenstrahlen, Kratzer in der Rohhaut
    for (let a = 2.4; a <= 4.5; a += 0.08) p.dot(x + Math.cos(a) * (rx + 0.55), y + Math.sin(a) * (ry + 0.55), BRZ[4]);
    for (let a = 3.0; a <= 4.0; a += 0.1) p.dot(x + Math.cos(a) * (rx + 0.55), y + Math.sin(a) * (ry + 0.55), BRZ[6]);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.2, ux = x + Math.cos(a) * (rx + 0.4), uy = y + Math.sin(a) * (ry + 0.4);
      p.dot(ux, uy, BRZ[i > 2 && i < 6 ? 5 : 3]);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3;
      p.fline(x + Math.cos(a) * rx * 0.3, y + Math.sin(a) * ry * 0.3, x + Math.cos(a) * rx * 0.75, y + Math.sin(a) * ry * 0.75, i % 2 ? OCHRE[2] : OCHRE[3]);
    }
    p.fline(x - rx * 0.6, y + ry * 0.4, x - rx * 0.2, y + ry * 0.65, '#2a1c12');
    p.fline(x + rx * 0.2, y - ry * 0.7, x + rx * 0.55, y - ry * 0.45, '#2a1c12');
    p.dot(x - 0.5, y - 0.5, BRZ[6]); p.dot(x + 0.5, y + 0.5, BRZ[2]);
    p.dot(x + rx * 0.4 + 0.5, y + ry + 1.5, FUR[6]); p.dot(x + rx * 0.4 + 1, y + ry + 3, FUR[4]);
  }
}

// Reiterbogen (Kompositbogen, stark zurückgebogene Spitzen)
function drawRecurve(p, g, hx, hy, a, draw, nock, arrow) {
  const ax = Math.sin(a), ay = -Math.cos(a), fx = Math.cos(a), fy = Math.sin(a);
  const bend = 0.07 + draw * 0.05;
  const pts = [];
  const fine = p.fine;
  for (let s = -7; s <= 7; s += fine ? 0.25 : 0.5) {
    const as = Math.abs(s);
    let b = -(s * s) * bend * 0.55;
    if (as > 5) b += (as - 5) * (1.5 - draw * 0.4);               // Spitzen (Siyahs) kippen nach vorn
    const x = hx + ax * s + fx * b, y = hy + ay * s + fy * b;
    if (!fine || (s * 2) % 1 === 0) pts.push([x, y, s]);
    const tip = as > 5.5;
    if (fine) {
      // fein: Horn mit heller Bauchkante, dunklem Rücken, Sehnenbelag; Griff in Bronze, Knochenspitzen
      const c = tip ? BONE[3] : as < 1.2 ? BRZ[4] : HORNB[3];
      p.dot(x, y, c); p.dot(x + fx * 0.5, y + fy * 0.5, tip ? BONE[2] : as < 1.2 ? BRZ[2] : HORNB[2]);
      if (!tip && as > 1) { p.dot(x + fx, y + fy, HORNB[1]); p.dot(x + fx * 1.4, y + fy * 1.4, HORNB[0]); }
      if (!tip && as > 1.2 && Math.abs(as - 3) < 0.13) p.dot(x + fx * 0.5, y + fy * 0.5, BRZ[4]);   // Wicklung
    } else {
      p.px(x, y, tip ? BONE[3] : as < 1.2 ? BRZ[3] : HORNB[2 + ((s * 2) & 1)]);
      if (!tip && as > 1) p.px(x + fx, y + fy, HORNB[0]);
    }
  }
  // Sehne an den Knicken der Siyahs (fein: Sehne 1 Feinpixel)
  const top = pts[4], bot = pts[pts.length - 5];
  const sx = nock ? nock.x : (top[0] + bot[0]) / 2 - fx * 1.5, sy = nock ? nock.y : (top[1] + bot[1]) / 2 - fy * 1.5;
  const ln = fine ? (x0, y0, x1, y1, c) => p.fline(x0 + 0.25, y0 + 0.25, x1 + 0.25, y1 + 0.25, c) : p.line.bind(p);
  ln(top[0], top[1], sx, sy, fine ? '#d8ceb4' : '#b8ae96');
  ln(sx, sy, bot[0], bot[1], fine ? '#d8ceb4' : '#b8ae96');
  let tipPt = { x: hx + fx * 2, y: hy + fy * 2 };
  if (arrow && nock) {
    const tx = hx + fx * 3.5, ty = hy + fy * 3.5;
    if (fine) {
      ln(nock.x, nock.y, tx, ty, WOOD[4]); ln(nock.x + 0.5 * ax, nock.y + 0.5 * ay, tx + 0.5 * ax, ty + 0.5 * ay, WOOD[2]);
    } else p.line(nock.x, nock.y, tx, ty, WOOD[3]);
    // Brandpfeil: glimmende Pechspitze (fein: weißgelber Kern im roten Saum)
    p.px(tx, ty, GLOW_EMBER[3]); p.px(tx + fx, ty + fy, GLOW_EMBER[4]);
    g.px(tx, ty, GLOW_EMBER[2]); g.px(tx + fx, ty + fy, GLOW_EMBER[4]); g.px(tx + fx * 2, ty + fy * 2 - 1, GLOW_EMBER[1]);
    g.px(tx, ty - 1, GLOW_EMBER[1]);
    p.px(nock.x - 1, nock.y - 1, OCHRE[3]); p.px(nock.x - 1, nock.y + 1, OCHRE[2]);
    if (fine) {
      const ex = p.snap(tx + fx), ey = p.snap(ty + fy);
      p.dot(ex + 0.5, ey, '#ffffff'); g.dot(ex + 0.5, ey, '#ffffff'); p.dot(ex, ey + 0.5, GLOW_EMBER[4]);
      p.dot(p.snap(tx), p.snap(ty) + 0.5, GLOW_EMBER[1]); g.dot(p.snap(tx) + 0.5, p.snap(ty) - 0.5, GLOW_EMBER[3]);
      // Befiederung: zwei Fahnen mit hellem Kiel
      p.dot(nock.x - 0.5, nock.y - 1, OCHRE[4]); p.dot(nock.x - 0.5, nock.y + 1, OCHRE[1]);
      p.dot(nock.x - 1.5, nock.y - 0.5, PAINT_W); p.dot(nock.x - 1.5, nock.y + 0.5, OCHRE[3]);
    }
    tipPt = { x: tx + fx, y: ty + fy };
  }
  return tipPt;
}

function drawRaider(p, g, P, X, archer) {
  const R = rig(P, RD, RS.AX, RS.AY);
  const { hip, pt, legF, legB, shF, shB, armF, armB } = R;
  const meta = {};
  const neck = pt(RD.spine + 2, 0.5);
  const hx = Math.round(neck.x + P.head), hy = Math.round(neck.y - 3);

  // --- 1. Fellmantel (Räuber) bzw. Filzumhang (Schützin) hinten
  mantle(p, pt(RD.spine, -1.5), archer ? 5 : 7, archer ? 9 : 12, P, archer ? [TEAL[0], TEAL[1], TEAL[2], TEAL[3], TEAL[4], FUR[5]] : FUR, archer ? 9 : 4);

  // --- Zöpfe hinter dem Kopf
  const braid = (bx, by, n, sway, seed) => {
    for (let j = 0; j < n; j++) {
      const v = j / n;
      const x = bx - j * 0.55 - P.cape * j * 0.35 + Math.sin(P.capeT * 1.2 + j * 0.7 + seed) * 0.6 * v * sway;
      const y = by + j * 0.95;
      if (p.fine) {
        // fein: Flechtglieder abwechselnd links/rechts im Licht, Bronzeperle mit Glanzpunkt
        const o = j % 2, X0 = p.snap(x - 0.25), Y0 = p.snap(y - 0.25);
        p.dot(X0 - 0.5, Y0, HAIR[0]); p.dot(X0, Y0, HAIR[o ? 2 : 3]); p.dot(X0 + 0.5, Y0, HAIR[o ? 3 : 1]);
        p.dot(X0 - 0.5, Y0 + 0.5, HAIR[0]); p.dot(X0, Y0 + 0.5, HAIR[1]); p.dot(X0 + 0.5, Y0 + 0.5, HAIR[0]);
        if (j === 2) { p.dot(X0, Y0, BRZ[6]); p.dot(X0 + 0.5, Y0, BRZ[4]); p.dot(X0, Y0 + 0.5, BRZ[3]); p.dot(X0 + 0.5, Y0 + 0.5, BRZ[2]); }
      } else {
        p.px(x, y, HAIR[j % 2 ? 1 : 3]); p.px(x - 0.6, y, HAIR[0]);
        if (j === 2) p.px(x, y, BRZ[4]);
      }
    }
    return { x: bx - n * 0.55, y: by + n };
  };
  if (archer) { braid(hx - 2, hy + 1, 10, 1, 0); braid(hx - 3, hy, 8, 1.2, 2); }
  else braid(hx - 1, hy - 3, 7, 1.4, 0);

  // --- Köcher (Schützin) auf dem Rücken, Brandpfeile mit roten Federn
  if (archer) {
    const q0 = pt(1.5, -3), q1 = pt(RD.spine + 2, -4.8);
    cap(p, q0.x, q0.y, q1.x, q1.y, 1.4, 1.6, LEA);
    for (let s = 0.25; s < 1; s += 0.3) p.px(q0.x + (q1.x - q0.x) * s, q0.y + (q1.y - q0.y) * s, BRZ[4]);
    for (let k = 0; k < 3; k++) {
      p.px(q1.x - 1 + k, q1.y - 1 - (k % 2), k === 1 ? PAINT_W : OCHRE[3]);
      p.px(q1.x - 1 + k, q1.y - 2 - (k % 2), k === 1 ? '#fffbef' : OCHRE[4]);
    }
    if (p.fine) {
      // Köcher: Naht als Punktlinie auf der Lichtseite, Glanz auf den Bronzebändern, Federkiele
      const ux = q1.x - q0.x, uy = q1.y - q0.y, L = Math.hypot(ux, uy) || 1, nx = uy / L, ny = -ux / L;
      stitch(p, q0.x + ux * 0.08 + nx * 0.8, q0.y + uy * 0.08 + ny * 0.8, q0.x + ux * 0.9 + nx * 0.8, q0.y + uy * 0.9 + ny * 0.8, LEA[5], 0.8);
      for (let s = 0.25; s < 1; s += 0.3) p.dot(q0.x + ux * s - 0.25, q0.y + uy * s - 0.25, BRZ[6]);
      for (let k = 0; k < 3; k++) p.dot(q1.x - 1 + k + 0.25, q1.y - 1.5 - (k % 2), k === 1 ? '#a89a80' : OCHRE[1]);
    }
  }

  // --- 2. Hinteres Bein: Filzhose, Stiefel
  cap(p, hip.x - 1, hip.y, legB.jx, legB.jy, 1.7, 1.4, FELT.slice(0, 4));
  cap(p, legB.jx, legB.jy, legB.ex, legB.ey - 1.5, 1.35, 1.3, LEA.slice(0, 4));
  p.rect(legB.ex - 1, legB.ey - 1, 3, 1, LEA[0]); p.px(legB.ex + 2, legB.ey - 2, LEA[1]);

  // --- 3. Hinterer Arm
  cap(p, shB.x, shB.y, armB.jx, armB.jy, 1.3, 1.1, archer ? TEAL.slice(0, 4) : LEA.slice(0, 4));
  cap(p, armB.jx, armB.jy, armB.ex, armB.ey, 1.1, 1.0, SK.slice(0, 4));

  // --- 4. Rumpf
  const hp = pt(0, 0), cp = pt(RD.spine, 0.3);
  const q = (u, k, c) => { const o = pt(u, k); p.px(o.x, o.y, c); };
  // Lederschurz (Lamellen) über den Oberschenkeln
  for (let i = 0; i < 4; i++) {
    const a = pt(0.2, -2.5 + i * 1.7);
    const sw = Math.sin(P.capeT + i) * 0.5 + P.lean * 2;
    for (let j = 0; j < 4 - (i === 0 ? 1 : 0); j++) {
      p.px(a.x + sw * j * 0.3, a.y + j, archer ? TEAL[j < 1 ? 3 : 2] : LEA[j < 1 ? 4 : i % 2 ? 2 : 3]);
      if (p.fine) {   // fein: Kante rechts dunkel (Streifen trennen sich), Saumnaht unten
        const sx = p.snap(a.x + sw * j * 0.3), sy = p.snap(a.y + j);
        p.dot(sx + 0.5, sy, archer ? TEAL[1] : LEA[1]); p.dot(sx + 0.5, sy + 0.5, archer ? TEAL[1] : LEA[1]);
        if (j === 2) p.dot(sx, sy + 0.5, archer ? TEAL[4] : LEA[5]);
      }
    }
  }
  if (archer) {
    // gesteppter Kaftan
    cap(p, hp.x, hp.y, cp.x, cp.y, 2.7, 3.0, TEAL, { noise: 0.1, seed: 5 });
    if (p.fine) {
      // Steppnähte als Punktlinien, gepolsterte Kissen dazwischen mit Licht oben links
      for (let k = -2; k <= 2; k += 2) for (let u = 1.6; u <= 7; u += 0.5) { const o = pt(u, k); if (Math.round(u * 2) % 2 === 0) p.dot(o.x, o.y, TEAL[1]); }
      for (let u = 2.4; u <= 6.6; u += 1.5) for (let k = -1.5; k <= 1; k += 2) { const o = pt(u, k); p.dot(o.x, o.y, TEAL[5]); const o2 = pt(u - 0.5, k + 0.5); p.dot(o2.x, o2.y, TEAL[2]); }
    } else for (let u = 2; u <= 6.5; u += 1.5) for (let k = -2; k <= 2; k += 2) q(u, k, TEAL[1]);
    // Fellbesatz am Kragen und Brustschnur aus Bronzeplättchen
    for (let u = 3; u <= 7; u += 1) q(u, 1.6, u % 2 ? BRZ[4] : BRZ[2]);
    if (p.fine) for (let u = 3; u <= 7; u += 1) { const o = pt(u, 1.6); p.dot(p.snap(o.x), p.snap(o.y), u % 2 ? BRZ[6] : BRZ[4]); }
  } else {
    cap(p, hp.x, hp.y, cp.x, cp.y, 2.9, 3.2, LEA, { noise: 0.12, seed: 3 });
    // Lamellenpanzer: Reihen aus Leder mit Bronzenieten
    // fein: Platten 1,5 Weltpixel breit, Oberkante im Licht, Schattenfuge darunter, Nieten mit Glanz
    if (p.fine) for (let u = 2.2; u <= 6.8; u += 1.5) {
      for (let k = -2.75; k <= 2.8; k += 0.5) {
        const kk = Math.round((k + 2.75) * 2), seam = kk % 3 === 0;
        const a = pt(u + 0.25, k), b = pt(u - 0.25, k), c = pt(u - 0.75, k);
        p.dot(a.x, a.y, seam ? LEA[2] : k < 0 ? LEA[5] : LEA[4]);
        p.dot(b.x, b.y, seam ? LEA[1] : k < 0 ? LEA[4] : LEA[3]);
        p.dot(c.x, c.y, LEA[1]);
        if (kk % 6 === 4) { p.dot(b.x, b.y, BRZ[5]); p.dot(c.x, c.y, BRZ[2]); }
      }
    }
    else for (let u = 2.2; u <= 6.8; u += 1.5) {
      for (let k = -2.5; k <= 2.6; k += 1) {
        const seam = Math.round(k + 2.5) % 3 === 0;
        q(u, k, seam ? LEA[2] : k < 0 ? LEA[5] : LEA[4]);   // Plattenkante, links im Licht
        q(u - 0.7, k, LEA[1]);                             // Schatten unter der Reihe
        if (seam && Math.round(u * 2) % 3 === 1) q(u, k, BRZ[4]);
      }
    }
    // Bronzescheibe (Brustspiegel)
    const m = pt(5.2, 1.4);
    p.px(m.x, m.y, BRZ[5]); p.px(m.x + 1, m.y, BRZ[3]); p.px(m.x, m.y + 1, BRZ[2]); p.px(m.x + 1, m.y + 1, BRZ[3]);
    if (p.fine) {
      const X0 = p.snap(m.x), Y0 = p.snap(m.y);
      p.dot(X0, Y0, BRZ[6]); p.dot(X0 + 0.5, Y0, BRZ[5]); p.dot(X0 + 1.5, Y0 + 1.5, BRZ[1]); p.dot(X0 + 1, Y0 + 1.5, BRZ[2]); p.dot(X0 + 1.5, Y0 + 1, BRZ[2]);
    }
  }
  // Schärpe mit wehenden Enden
  for (let k = -3; k <= 3; k += 0.5) { q(1.2, k, TEAL[3]); q(1.9, k, TEAL[4]); }
  q(1.5, 2.5, BRZ[5]);
  const se = pt(1.3, -3);
  for (let j = 0; j < 5; j++) {
    const x = se.x - j * 0.9 - P.cape * j * 0.5, y = se.y + j * 0.6 + Math.sin(P.capeT * 1.3 + j) * 0.6;
    p.px(x, y, TEAL[j < 2 ? 4 : 3]); p.px(x, y + 1, TEAL[2]);
    if (p.fine) p.dot(p.snap(x), p.snap(y), TEAL[5]);
  }
  if (p.fine) {
    // Schärpe: zweifarbige Falten (dunkle Kerbe, helle Wulst)
    for (let k = -3; k <= 3; k += 1.5) { const a = pt(1.45, k), b = pt(1.95, k + 0.5); p.dot(a.x, a.y, TEAL[1]); p.dot(b.x, b.y, TEAL[5]); }
    const kn = pt(1.5, 2.5); p.dot(p.snap(kn.x), p.snap(kn.y), BRZ[6]);
  }

  // --- 5. Vorderes Bein
  cap(p, hip.x + 1, hip.y, legF.jx, legF.jy, 1.8, 1.5, FELT);
  cap(p, legF.jx, legF.jy, legF.ex, legF.ey - 1.5, 1.45, 1.35, LEA);
  p.rect(legF.ex - 1, legF.ey - 1, 4, 1, LEA[1]); p.px(legF.ex + 3, legF.ey - 2, LEA[3]); // Spitzstiefel
  p.px(legF.jx - 0.5, legF.jy + 1, BRZ[3]);   // Stiefelschnalle
  if (p.fine) {
    // Filzhose: zweifarbige Querfalten; Stiefel: Stulpe im Licht, Naht als Punktlinie, Glanz auf Schnalle und Spitze
    for (let s = 0.3; s <= 0.85; s += 0.27) {
      const x = hip.x + 1 + (legF.jx - hip.x - 1) * s, y = hip.y + (legF.jy - hip.y) * s;
      p.fline(x - 1.25, y - 0.5, x + 0.25, y, FELT[4]); p.fline(x - 0.75, y, x + 0.75, y + 0.5, FELT[1]);
    }
    const kx = legF.jx, ky = legF.jy, fx = legF.ex, fy = legF.ey - 1.5;
    p.fline(kx - 1.25, ky - 0.25, kx + 1, ky - 0.25, LEA[5]);
    stitch(p, kx + 0.4 + (fx - kx) * 0.15, ky + (fy - ky) * 0.15, fx + 0.6, fy, LEA[4], 0.7);
    p.dot(legF.jx - 0.5, legF.jy + 1, BRZ[6]); p.dot(legF.ex + 3, legF.ey - 2, LEA[5]);
    p.fline(legF.ex - 1, legF.ey - 0.5, legF.ex + 3, legF.ey - 0.5, LEA[0]);
  }

  // --- 6. Fellkragen
  const col = pt(RD.spine - 0.2, -0.3);
  if (archer) {
    ell(p, col.x, col.y, 3.4, 1.6, FUR.slice(1, 7), { noise: 0.3, seed: 7 });
    if (p.fine) strokes(p, col.x, col.y, 3.2, 1.4, FUR.slice(1, 7), 34, 7, -0.6, 0.9);
  } else {
    ell(p, col.x - 0.5, col.y, 4.4, 2.2, FUR.slice(1, 7), { noise: 0.35, seed: 5 });
    if (p.fine) strokes(p, col.x - 0.5, col.y, 4.2, 2.0, FUR.slice(1, 7), 50, 5, -0.6, 1.1);
    for (let i = -4; i <= 3; i += 1.3) {
      const x = col.x + i, y = col.y + 2 + (hash2(i * 3 | 0, 1, 5) * 1.6 | 0);
      if (p.fine) { p.fline(x, y - 0.5, x - 0.5, y + 0.75, FUR[2]); p.dot(x + 0.5, y - 0.5, FUR[4]); } else p.px(x, y, FUR[2]);
    }
  }

  // --- 7. Schild (hintere Hand, vor dem Körper)
  if (!archer) drawTarge(p, armB.ex + 1, armB.ey - 1, P.sh);

  // --- 8. Kopf
  ell(p, hx + 0.5, hy + 0.5, 3.2, 3.3, SK, { bias: 0.08 });
  p.px(hx - 1, hy + 1, SK[1]);                     // Ohr
  // Gesicht: Nase, Mund, Kriegsbemalung
  p.px(hx + 3.5, hy + 1, SK[4]); p.px(hx + 4, hy + 1.5, SK[3]);
  if (archer) {
    p.px(hx + 1, hy + 2, OCHRE[3]); p.px(hx + 2, hy + 2, OCHRE[2]);   // roter Wangenstrich
    p.px(hx + 1, hy, SK[1]);                                          // Augenschatten (Kohle)
    if (P.eye > 0.5) { p.px(hx + 2, hy, '#efe2c8'); p.px(hx + 3, hy, '#1a0e0a'); } else { p.px(hx + 2, hy, SK[1]); p.px(hx + 3, hy, SK[1]); }
    p.px(hx + 2, hy - 1, HAIR[1]); p.px(hx + 3, hy - 1, HAIR[2]);     // Braue
    p.px(hx + 2, hy + 1, SK[5]);                                      // Wangenlicht
    p.px(hx + 3, hy + 2, '#7a3228');             // Lippen
    p.px(hx - 1, hy + 2, BRZ[5]); g.px(hx - 1, hy + 2, BRZ[3]); // Ohrring
  } else {
    // Kriegsbemalung: Ruß in der Augenhöhle, ein Ockerstrich auf der Wange
    p.px(hx + 1, hy, '#2a1810'); p.px(hx, hy, SK[2]);
    p.px(hx + 1, hy + 1, OCHRE[3]);
    p.px(hx + 2, hy + 1, SK[5]); p.px(hx + 3, hy + 1, SK[4]);         // Wangenknochen im Licht
    if (P.eye > 0.5) { p.px(hx + 2, hy, '#f2e6c8'); p.px(hx + 3, hy, '#120604'); g.px(hx + 2, hy, '#4a2208'); }
    p.px(hx + 1, hy - 1, HAIR[1]); p.px(hx + 2, hy - 1, HAIR[1]); p.px(hx + 3, hy - 1, HAIR[2]);   // zornige Braue
    // Hängeschnurrbart, Kinnbart; beim Brüllen offener Mund mit Zähnen
    const jw = Math.round(P.jaw * 1.5);
    p.px(hx + 3, hy + 2, HAIR[3]); p.px(hx + 4, hy + 2, HAIR[2]); p.px(hx + 2, hy + 2, HAIR[2]);
    if (jw) { p.px(hx + 3, hy + 3, '#2a0806'); p.px(hx + 4, hy + 3, '#2a0806'); p.px(hx + 3, hy + 2.6, '#e8dcc0'); }
    p.rect(hx + 1, hy + 3 + jw, 3, 1, HAIR[1]); p.px(hx + 4, hy + 3 + jw, HAIR[2]);
    p.px(hx + 1, hy + 4 + jw, HAIR[1]); p.px(hx + 2, hy + 4 + jw, HAIR[0]);
  }
  if (p.fine) {
    // Handfein: Gesicht in Feinpixeln – Augenweiß mit Pupille und Glanz, Braue, Nasenrücken-Licht, Mund, Ohrmuschel
    const eyeOn = P.eye > 0.5;
    p.dot(hx - 1, hy + 0.5, SK[3]); p.dot(hx - 0.5, hy + 1.5, SK[0]); p.dot(hx - 1, hy + 1.5, SK[2]);
    p.dot(hx + 3.5, hy, SK[4]); p.dot(hx + 4, hy + 0.5, SK[5]); p.dot(hx + 4.5, hy + 1, SK[4]); p.dot(hx + 4, hy + 1.5, SK[1]); p.dot(hx + 4.5, hy + 1.5, SK[2]);
    if (eyeOn) {
      p.dot(hx + 2, hy, '#f2e6c8'); p.dot(hx + 2.5, hy, '#f2e6c8'); p.dot(hx + 3, hy, '#fff8ea'); p.dot(hx + 3.5, hy, '#140806');
      p.dot(hx + 2, hy + 0.5, SK[2]); p.dot(hx + 2.5, hy + 0.5, '#c8b8a4'); p.dot(hx + 3, hy + 0.5, '#140806'); p.dot(hx + 3.5, hy + 0.5, '#3a2014');
    } else p.fline(hx + 2, hy + 0.5, hx + 3.5, hy + 0.5, archer ? '#1a0e0a' : '#2a1810');
    if (archer) {
      p.fline(hx + 1.5, hy - 0.5, hx + 3.5, hy - 0.5, HAIR[1]);                   // schmale Braue (unter dem Fellrand)
      p.fline(hx + 1, hy + 2, hx + 2.5, hy + 2, OCHRE[4]);                        // Wangenstrich, Lichtkante
      p.dot(hx + 2.5, hy + 1, SK[5]); p.dot(hx + 2, hy + 1.5, SK[4]);
      p.dot(hx + 3, hy + 2, '#7a3228'); p.dot(hx + 3.5, hy + 2, '#5a2018'); p.dot(hx + 3, hy + 2.5, '#9a4a3a'); p.dot(hx + 2.5, hy + 2, '#4a1c14');
      p.dot(hx + 3, hy + 3, SK[4]);                                                // Kinnlicht
      p.dot(hx - 1, hy + 2, BRZ[6]); p.dot(hx - 0.5, hy + 2.5, BRZ[2]);

    } else {
      p.fline(hx + 1, hy - 0.5, hx + 3.5, hy - 0.5, HAIR[0]); p.dot(hx + 3.5, hy, '#2a1810');   // zornige Braue
      p.fline(hx + 0.5, hy + 1, hx + 1, hy + 2, OCHRE[3]); p.fline(hx + 1.5, hy + 1, hx + 2, hy + 2, OCHRE[2]);  // Ockerkrallen
      p.dot(hx + 2.5, hy + 1, SK[5]);
      // Hängeschnurrbart und Kinnbart in Strähnen
      const jw = Math.round(P.jaw * 1.5);
      p.fline(hx + 2, hy + 2, hx + 4.5, hy + 2, HAIR[3]); p.fline(hx + 2, hy + 2.5, hx + 1.5, hy + 4 + jw, HAIR[2]);
      p.dot(hx + 4.5, hy + 2.5, HAIR[1]); p.dot(hx + 4, hy + 2.5, '#2a0806');
      for (let x = 1; x <= 4; x += 0.5) {
        const lit = Math.round(x * 2) % 2 === 0;
        p.dot(hx + x, hy + 3 + jw, lit ? HAIR[3] : HAIR[0]); p.dot(hx + x, hy + 3.5 + jw, lit ? HAIR[2] : HAIR[0]);
      }
      p.dot(hx + 1.5, hy + 4 + jw, HAIR[2]); p.dot(hx + 2, hy + 4.5 + jw, HAIR[1]);
    }
  }
  meta.eye = { x: hx + 2, y: hy };
  meta.mouth = { x: hx + 4, y: hy + 2 };
  // Kopfbedeckung
  if (archer) {
    // Spitzmütze mit Fellrand, nach hinten geneigt, Adlerfeder
    ell(p, hx + 0.3, hy - 2.8, 3.5, 2.0, FELT);
    poly(p, [[hx - 2.5, hy - 3], [hx + 2.5, hy - 3.5], [hx - 3.5 - P.cape, hy - 8]], FELT[3]);
    p.line(hx - 3.5 - P.cape, hy - 8, hx + 1, hy - 4, FELT[4]);
    for (let x = -3; x <= 3; x++) p.px(hx + x, hy - 1, x < 0 ? FUR[6] : FUR[4]);
    p.px(hx + 3, hy - 1, FUR[3]);
    p.px(hx - 3, hy, FUR[3]);
    p.line(hx - 2, hy - 3, hx - 5 - P.cape, hy - 6, PAINT_W); p.px(hx - 5 - P.cape, hy - 6, HAIR[1]);
    if (p.fine) {
      // Filz: Falten zweifarbig; Fellrand in Strähnen; Adlerfeder mit Kiel, Fahne und dunklen Bändern
      p.fline(hx - 3 - P.cape, hy - 7.5, hx - 1, hy - 4, FELT[1]); p.fline(hx + 2, hy - 4, hx, hy - 3, FELT[4]);
      for (let x = -3; x <= 3.5; x += 0.5) {
        const lit = Math.round(x * 2) % 2 === 0, L = x < 0;
        p.dot(hx + x, hy - 1, lit ? FUR[L ? 6 : 5] : FUR[L ? 4 : 3]); if (x < 1) p.dot(hx + x, hy - 0.5, lit ? FUR[L ? 4 : 3] : FUR[2]);
      }
      const fx0 = hx - 2, fy0 = hy - 3, fx1 = hx - 5 - P.cape, fy1 = hy - 6;
      p.fline(fx0, fy0 - 0.5, fx1, fy1 - 0.5, PAINT_W); p.fline(fx0, fy0 + 0.5, fx1 + 0.5, fy1 + 0.5, '#8a7c64');
      p.fline(fx0, fy0, fx1, fy1, '#fffbef');
      for (const t of [0.55, 0.75]) { const x = fx0 + (fx1 - fx0) * t, y = fy0 + (fy1 - fy0) * t; p.dot(x, y - 0.5, HAIR[2]); p.dot(x, y + 0.5, HAIR[1]); }
    }
    meta.head = { x: hx, y: hy - 8 };
  } else {
    // Filzkappe mit Fellkrempe, Bronzeband und Dorn
    ell(p, hx + 0.2, hy - 3, 3.5, 2.1, LEA);
    for (let x = -1; x <= 2; x += 1) p.px(hx + x, hy - 3, x % 2 ? BRZ[2] : BRZ[4]);
    for (let x = -3; x <= 3; x++) p.px(hx + x, hy - 1, FUR[x % 2 ? 4 : 5]);
    p.px(hx - 3, hy - 2, FUR[4]); p.px(hx + 3, hy - 2, FUR[3]);
    p.rect(hx - 3, hy, 1, 3, FUR[3]); p.px(hx - 2, hy, FUR[2]); p.px(hx - 3, hy + 3, FUR[2]); // Ohrenklappe
    p.line(hx + 0.5, hy - 5, hx + 0.5, hy - 7, BRZ[3]); p.px(hx + 0.5, hy - 7, BRZ[6]);
    g.px(hx + 0.5, hy - 7, BRZ[2]);
    if (p.fine) {
      // Kappe: Lederfalten; Bronzeband mit Glanzlinie und Nieten; Fellkrempe in Strähnen; Dorn mit Glanzlinie
      p.fline(hx - 2, hy - 4, hx - 0.5, hy - 4.5, LEA[5]); p.fline(hx + 1.5, hy - 4.5, hx + 2.5, hy - 3.5, LEA[2]);
      for (let x = -1; x <= 2.5; x += 0.5) { p.dot(hx + x, hy - 3, x < 0.5 ? BRZ[6] : BRZ[5]); p.dot(hx + x, hy - 2.5, x < 1 ? BRZ[3] : BRZ[2]); }
      p.dot(hx - 0.5, hy - 2.5, BRZ[5]); p.dot(hx + 1.5, hy - 2.5, BRZ[5]);
      for (let x = -3; x <= 3.5; x += 0.5) {
        const lit = Math.round(x * 2) % 2 === 0, L = x < 0;
        p.dot(hx + x, hy - 1, lit ? FUR[L ? 6 : 5] : FUR[L ? 4 : 3]); if (x < 1) p.dot(hx + x, hy - 0.5, lit ? FUR[L ? 4 : 3] : FUR[2]);
      }
      for (let y = 0; y <= 3; y += 0.5) p.dot(hx - 3, hy + y, Math.round(y * 2) % 2 ? FUR[2] : FUR[4]);
      for (let y = -7; y <= -5; y += 0.5) { p.dot(hx + 0.5, hy + y, BRZ[5]); p.dot(hx + 1, hy + y, BRZ[2]); }
      p.dot(hx + 0.5, hy - 7, BRZ[6]); g.dot(hx + 0.5, hy - 7, BRZ[6]);
    }
    meta.head = { x: hx, y: hy - 7 };
  }

  // --- 9. Vorderer Arm + Waffe
  const drawArm = () => {
    cap(p, shF.x, shF.y, armF.jx, armF.jy, 1.45, 1.25, archer ? TEAL : LEA);
    cap(p, armF.jx, armF.jy, armF.ex, armF.ey, 1.2, 1.1, SK);
    const bx = armF.jx + (armF.ex - armF.jx) * 0.35, by = armF.jy + (armF.ey - armF.jy) * 0.35;
    cap(p, bx, by, armF.ex, armF.ey, 1.35, 1.3, LEA);                 // Armschiene
    p.px(bx + (armF.ex - bx) * 0.5, by + (armF.ey - by) * 0.5 - 1, BRZ[4]);
    if (p.fine) {
      // Ärmelfalte zweifarbig, Armschiene mit Naht (Punktlinie) und Kante, Niete mit Glanz
      const mx = (shF.x + armF.jx) / 2, my = (shF.y + armF.jy) / 2, R = archer ? TEAL : LEA;
      p.fline(mx - 1, my - 0.25, mx + 0.5, my + 0.25, R[R.length - 1]); p.fline(mx - 0.5, my + 0.5, mx + 1, my + 0.75, R[1]);
      const ux = armF.ex - bx, uy = armF.ey - by, L = Math.hypot(ux, uy) || 1, nx = -uy / L, ny = ux / L;
      p.fline(bx - nx * 1.2, by - ny * 1.2, bx + nx * 1.2, by + ny * 1.2, LEA[5]);
      stitch(p, bx + ux * 0.15, by + uy * 0.15, bx + ux * 0.85, by + uy * 0.85, LEA[5], 0.6);
      const sx = p.snap(bx + ux * 0.5), sy = p.snap(by + uy * 0.5 - 1); p.dot(sx, sy, BRZ[6]); p.dot(sx + 0.5, sy + 0.5, BRZ[2]);
    }
  };
  const shoulder = () => {
    if (archer) { ell(p, shF.x, shF.y, 1.8, 1.4, FUR.slice(2, 7)); if (p.fine) strokes(p, shF.x, shF.y, 1.6, 1.2, FUR.slice(2, 7), 12, 17, -0.4, 0.8); return; }
    ell(p, shF.x, shF.y, 2.2, 1.7, BRZ.slice(1, 6));
    p.px(shF.x - 1, shF.y - 1, BRZ[6]);
    if (p.fine) {
      // Bronze-Schulterschale: Glanzlinie oben links, Glanzpunkt, Randnieten, dunkle Kante unten
      for (let a = 3.4; a <= 4.7; a += 0.15) p.dot(shF.x + Math.cos(a) * 1.75, shF.y + Math.sin(a) * 1.25, BRZ[6]);
      for (let a = 0.3; a <= 2.6; a += 0.2) p.dot(shF.x + Math.cos(a) * 2, shF.y + Math.sin(a) * 1.5, BRZ[1]);
      p.dot(shF.x - 0.75, shF.y - 0.75, '#ffffff');
      p.dot(shF.x - 1.5, shF.y + 0.75, BRZ[5]); p.dot(shF.x + 1.25, shF.y + 0.75, BRZ[3]);
    }
  };
  const hand = (x, y) => {
    ell(p, x, y, 1.2, 1.2, SK); p.px(x - 0.5, y - 0.5, SK[4]);
    if (p.fine) { p.dot(x - 0.5, y - 0.5, SK[5]); p.dot(x + 0.5, y + 0.5, SK[1]); p.dot(x, y + 0.25, SK[2]); }
  };

  if (archer) {
    drawArm(); shoulder();
    const nock = P.draw > 0.02 || P.arrow > 0.5 ? { x: armB.ex, y: armB.ey } : null;
    const tip = drawRecurve(p, g, armF.ex, armF.ey, P.bowA, P.draw, nock, P.arrow > 0.5);
    hand(armF.ex, armF.ey);
    if (nock) { p.px(armB.ex, armB.ey, SK[3]); p.px(armB.ex - 1, armB.ey, SK[2]); p.px(armB.ex, armB.ey + 1, SK[2]); }
    meta.hand = tip;
  } else {
    if (X.smear) smearArc(p, g, shF.x, shF.y + 1, X.smear[0], X.smear[1], 6, 16, COLD, COLD_G, X.smear[2] ?? 1);
    drawArm(); shoulder();
    const tip = drawSabre(p, armF.ex, armF.ey, P.wa);
    hand(armF.ex, armF.ey);
    meta.hand = { x: armF.ex, y: armF.ey };
    meta.tip = tip;
  }
  if (X.dust) dust(p, RS.AX + X.dust, RS.AY, 7, 3, DUST, 12);
  return meta;
}

function raiderAnims(archer) {
  const mk = (P, X) => makeFrame(RS, (p, g, PP, XX) => drawRaider(p, g, PP, XX, archer), P, X);
  const idleA = archer
    ? rpose({ hFx: 5, hFy: 6, hBx: -1, hBy: 7, bowA: 0.5, lean: 0.04 })
    : rpose({ hFx: 6, hFy: 6, wa: -1.05, hBx: 3, hBy: 6, fFx: 3.5, fBx: -3.5 });
  const idleB = { ...idleA, hipY: 1, lean: idleA.lean + 0.04, hFy: idleA.hFy + 0.6, hBy: idleA.hBy + 0.5, capeT: Math.PI, head: 0.3, wa: idleA.wa + 0.1, bowA: idleA.bowA + 0.06 };
  const idle = track(mk, [[0, idleA], [0.5, idleB], [1, idleA]], 6, { loop: true });

  const walkKeys = [];
  for (let i = 0; i <= 8; i++) {
    const ph = (i / 8) * TAU, s = Math.sin(ph), c = Math.cos(ph);
    walkKeys.push([i / 8, {
      ...idleA, hipY: -Math.abs(c) * 1 + 0.5, lean: idleA.lean + 0.07, fFx: 1 + s * 4.6, fFy: Math.max(0, -c) * 2.3,
      fBx: -1 - s * 4.6, fBy: Math.max(0, c) * 2.3, hFx: idleA.hFx - s * 1.5, hBx: idleA.hBx + s * 1.5,
      hFy: idleA.hFy - Math.abs(s) * 0.5, cape: 0.6, capeT: ph, head: 0.5, wa: idleA.wa + s * 0.08,
    }, linear]);
  }
  const walk = track(mk, walkKeys, 8, { loop: true, extras: { 0: { fx: 'step' }, 4: { fx: 'step' } } });

  const hurtP = { ...idleA, lean: -0.24, hipX: -1, head: -1, hFx: 2, hFy: 3, hBx: 1, hBy: 3, eye: 0, cape: -0.2, wa: idleA.wa - 0.6, jaw: 1, bowA: 0.8 };

  let windup, strike;
  if (!archer) {
    // Ausholen: Säbel hoch über den Kopf nach hinten, Schild vor die Brust
    const w1 = rpose({ lean: 0, hipX: -0.5, hFx: 1, hFy: -5, wa: -2.0, hBx: 6, hBy: 2, sh: 0.5, fFx: 4, fBx: -4, cape: 0.2, jaw: 0.5 });
    const w2 = rpose({ lean: -0.14, hipX: -1.5, hipY: 1, hFx: -3, hFy: -7, wa: -2.75, hBx: 6.5, hBy: 1, sh: 1, fFx: 5.5, fBx: -5, cape: 0.35, capeT: 1, jaw: 1 });
    windup = track(mk, [[0, idleA], [0.45, w1], [1, w2]], 4);
    // Hieb: schräg von oben nach vorn unten
    const s1 = rpose({ lean: 0.18, hipX: 1, hipY: 0.5, hFx: 6, hFy: -4, wa: -1.1, hBx: 3, hBy: 4, fFx: 6.5, fBx: -5, cape: 0.6, capeT: 2, jaw: 1 });
    const s2 = rpose({ lean: 0.34, hipX: 2.5, hipY: 2, hFx: 9, hFy: 5, wa: 0.75, hBx: 0, hBy: 6, fFx: 7, fBx: -5.5, cape: 0.9, capeT: 3, jaw: 1 });
    const s3 = rpose({ lean: 0.28, hipX: 2, hipY: 1.5, hFx: 7, hFy: 8, wa: 1.35, hBx: 1, hBy: 6, fFx: 7, fBx: -5.5, cape: 0.6, capeT: 4, jaw: 0.5 });
    const s4 = mixP(s3, idleA, 0.55);
    strike = [
      mk(s1, { smear: [-2.8, -1.1] }),
      mk(s2, { smear: [-2.3, 0.75], fx: 'impact', dust: 12 }),
      mk(s3, { smear: [-0.4, 1.35] }),
      mk(s4, {}),
    ];
  } else {
    // Pfeil aus dem Köcher, auflegen, Daumenzug bis zur Wange, halten
    const n1 = { ...idleA, hBx: -4, hBy: -3, head: -0.3, bowA: 0.25, lean: 0.02 };
    const n2 = { ...idleA, hFx: 7, hFy: 1, hBx: 4, hBy: 1, bowA: 0.08, arrow: 1, draw: 0.1, lean: 0.06 };
    const n3 = { ...idleA, hFx: 9, hFy: 0, hBx: 1, hBy: 0, bowA: 0.02, arrow: 1, draw: 0.6, lean: 0.02, fFx: 4, fBx: -4 };
    const n4 = { ...idleA, hFx: 10, hFy: -0.5, hBx: -1.5, hBy: 0, bowA: -0.02, arrow: 1, draw: 1, lean: -0.03, fFx: 4.5, fBx: -4.5, cape: 0.2 };
    windup = [mk(n1), mk(n2), mk(n3), mk(n4)];
    const r1 = { ...n4, hBx: -5, hBy: -1.5, arrow: 0, draw: 0, lean: -0.08, hipX: -0.5, cape: 0.4, capeT: 1 };
    const r2 = { ...n4, hFx: 8, hBx: -5.5, hBy: 1, arrow: 0, draw: 0, lean: -0.03, cape: 0.25, capeT: 2 };
    const r3 = { ...idleA, hFx: 7, hFy: 3, hBx: -2, hBy: 5, arrow: 0, bowA: 0.15, capeT: 3 };
    strike = [mk(r1, { fx: 'cast' }), mk(r2), mk(r3)];
  }

  // Tod: zurücktaumeln, in die Knie, rücklings umkippen
  const d1 = { ...hurtP, lean: -0.3, hipX: -1.5, fFx: 4, fBx: -3 };
  const d2 = { ...d1, hipY: 3, lean: -0.15, fFx: 3, fBx: -2, hFy: 8, hBy: 8, hFx: 3, wa: 1.2, bowA: 0.9 };
  const d3 = { ...d2, hipY: 4, lean: 0.1, head: 1 };
  const piv = [RS.AX - 3, RS.AY - 1];
  const death = [
    mk(d1), mk(d2), mk(d3, { rot: [-0.45, ...piv] }), mk(d3, { rot: [-1.05, ...piv] }),
    mk({ ...d3, hipY: 3, lean: 0 }, { rot: [-1.5, piv[0], piv[1] - 0.5], fx: 'impact' }),
    mk({ ...d3, hipY: 3, lean: 0, hFy: 9, hFx: 4, eye: 0 }, { rot: [-Math.PI / 2, piv[0], piv[1] - 0.5] }),
  ];

  return {
    idle: new Animation(idle, 6),
    walk: new Animation(walk, 11),
    windup: new Animation(windup, archer ? 7 : 9, false),
    strike: new Animation(strike, archer ? 10 : 15, false),
    hurt: new Animation([mk(hurtP), mk(mixP(hurtP, idleA, 0.5))], 10, false),
    death: new Animation(death, 9, false),
  };
}

// ================================================================ Staubhyäne

const HS = { W: 58, H: 38, AX: 26, AY: 33, pad: 10 };
const HY = ['#18130e', '#2b2319', '#413526', '#5a4a35', '#766248', '#937c5c', '#b09a78']; // sandgrau, aschebestäubt
const HY_D = ['#110d0a', '#1e1812', '#2d251c', '#3f3428', '#544634'];
const MANE = ['#0e0b09', '#1c1611', '#2c231b', '#443628', '#5e4c38'];
const SPOT = ['#1a140f', '#261e16'];
const H_REST = {
  t: 0, amp: 0, crouch: 0, bob: 0, head: 0, up: 0, jaw: 0, lunge: 0, lie: 0, side: 0,
  eye: 1, pitch: 0, tail: 0, ear: 0, reach: 0, tuck: 0,
};
const hpose = (o = {}) => ({ ...H_REST, ...o });

function drawHyena(p, g, P, X) {
  const gy = HS.AY, ox = HS.AX - 14 + P.lunge;
  const meta = {};
  const lie = P.lie, side = P.side;
  const by = gy - 12 + P.crouch + P.bob + lie * 5.5;
  const pitch = P.pitch;
  const Y = (x, y) => y + (x - 12) * pitch * 0.12;
  const flat = 1 - side * 0.3;

  // --- Beine: Vorderbeine lang, Hinterbeine kurz mit hohem Sprunggelenk
  const leg = (xh, ph, near, front) => {
    const hipY = Y(xh, by + (front ? 1.5 : 2));
    const ramp = near ? HY.slice(1, 6) : HY_D;
    if (side > 0.5) { // auf der Seite: Beine steif von sich gestreckt
      const ly = gy - 2 - (near ? 0 : 2);
      cap(p, ox + xh, hipY, ox + xh + (front ? 7 : 3), ly, 1.7, 1.0, ramp);
      p.px(ox + xh + (front ? 8 : 4), ly, MANE[0]);
      if (p.fine) { p.fline(ox + xh + 1, hipY - 0.5, ox + xh + (front ? 5 : 2.5), ly - 0.75, near ? HY[5] : HY_D[4]); p.dot(ox + xh + 2, hipY + 0.5, SPOT[0]); }
      return;
    }
    const a = P.t * TAU + ph;
    let fx = Math.sin(a) * 3.4 * P.amp, lift = Math.max(0, Math.cos(a)) * 2.6 * P.amp;
    fx += front ? P.reach * 4 : -P.reach * 4;
    fx += near ? 0.8 : -1.2;                                        // Standbreite
    lift += P.reach * (front ? 3 : 1.5) + P.tuck * 3;
    const footY = gy - lift - lie;
    const footX = ox + xh + fx - lie * (front ? -2 : 2);
    if (front) {
      const kx = ox + xh + fx * 0.35 + 0.5, ky = (hipY + footY) / 2 + 0.5;
      cap(p, ox + xh, hipY - 1, kx, ky, 1.8, 1.1, ramp);
      cap(p, kx, ky, footX, footY - 1, 0.95, 0.8, ramp);
      p.px(kx, ky + 1.5, SPOT[0]); p.px(kx - 0.5, ky + 3, SPOT[1]);
    } else {
      const kx = ox + xh + 2 + fx * 0.3, ky = hipY + 3;
      const hx2 = footX - 1.8, hy2 = footY - 3.5;
      cap(p, ox + xh, hipY - 1, kx, ky, 2.3, 1.3, ramp);
      cap(p, kx, ky, hx2, hy2, 1.1, 0.85, ramp);
      cap(p, hx2, hy2, footX, footY - 1, 0.85, 0.8, ramp);
      p.px(kx - 0.5, ky - 1, SPOT[0]);
    }
    p.rect(footX - 1, footY - 1, 3, 1, near ? MANE[1] : MANE[0]);
    p.px(footX + 1.5, footY - 1, near ? MANE[3] : MANE[1]);
    if (p.fine) {
      // Pfote: Zehen getrennt, Krallen hell; Lauf mit Lichtkante und Fleckenreihe
      const fxs = p.snap(footX), fys = p.snap(footY);
      p.dot(fxs, fys - 1, near ? MANE[3] : MANE[2]); p.dot(fxs + 0.5, fys - 0.5, MANE[0]); p.dot(fxs + 1.5, fys - 0.5, MANE[0]);
      p.dot(fxs + 2.5, fys - 0.5, near ? BONE[2] : BONE[0]); p.dot(fxs + 2, fys - 0.5, near ? BONE[1] : MANE[1]);
      if (near) {
        const kx = front ? ox + xh + fx * 0.35 + 0.5 : ox + xh + 2 + fx * 0.3, ky = front ? (hipY + footY) / 2 + 0.5 : hipY + 3;
        p.fline(ox + xh - 0.75, hipY - 0.5, kx - 0.75, ky, HY[5]);
        p.dot(kx - 0.25, ky + 2, SPOT[0]); p.dot(kx + 0.25, ky + 2.5, SPOT[1]); p.dot(kx - 0.5, ky + 4, SPOT[0]);
      }
    }
  };
  leg(4.5, Math.PI * 0.1, false, false);
  leg(18, Math.PI * 1.1, false, true);

  // --- Schwanz: kurz, buschige dunkle Spitze
  const tw = Math.sin(P.t * TAU * 2 + P.tail) * (P.amp + 0.3);
  const t0x = ox + 0.5, t0y = Y(0, by - 2.5);
  const t1x = ox - 3 - P.reach * 1.5, t1y = Y(0, by - 0.5 + tw * 0.8 - P.reach * 3);
  cap(p, t0x, t0y, t1x, t1y, 1.1, 0.9, HY.slice(1, 6));
  ell(p, t1x - 1, t1y + 0.8, 1.7, 1.4, MANE, { rot: 0.5 + tw * 0.2, noise: 0.3, seed: 8 });
  if (p.fine) {
    strokes(p, t1x - 1, t1y + 0.8, 1.6, 1.2, MANE, 14, 8, -0.9, 0.6, 0.5 + tw * 0.2);
    p.fline(t0x, t0y - 0.5, t1x + 0.5, t1y - 0.5, HY[5]);
  }

  // --- Rumpf: tiefes Becken, hoher Widerrist
  ell(p, ox + 5, Y(5, by + 1), 4.6, 3.9 * flat, HY, { noise: 0.1, seed: 3 });
  ell(p, ox + 11, Y(11, by - 0.5), 6.6, 4.3 * flat, HY, { noise: 0.1, seed: 4 });
  ell(p, ox + 17.5, Y(17.5, by - 2.6), 5, 5.8 * flat, HY, { noise: 0.1, seed: 5 });
  // Bauch dunkel
  ell(p, ox + 11, Y(11, by + 3.4), 6, 1.2, HY_D.slice(1));
  if (p.fine) {
    // Handfein: Fell in Strähnen, nach hinten unten gekämmt (Licht oben links: oben hell, unten dunkel)
    const C = HY.slice(1, 7);
    strokes(p, ox + 5, Y(5, by + 1), 4.2, 3.5 * flat, C, 12, 3, -1.5, 0.8);
    strokes(p, ox + 11, Y(11, by - 0.5), 6.2, 3.9 * flat, C, 22, 4, -1.6, 0.8);
    strokes(p, ox + 17.5, Y(17.5, by - 2.6), 4.6, 5.3 * flat, C, 18, 5, -1.2, 1.1);

    // Flecken: unregelmäßige Tupfen aus Feinpixeln, auf Flanke und Schulter dichter
    for (let i = 0; i < 22; i++) {
      const x = 3 + hash2(i, 1, 62) * 19, y = -2.5 + hash2(i, 2, 62) * 5.5;
      const topY = -3.2 - Math.max(0, x - 8) * 0.12;
      if (y < topY + 0.5) continue;
      const X0 = p.snap(ox + x), Y0 = p.snap(Y(x, by + y)), c = SPOT[i % 2], k = i % 3;
      p.dot(X0, Y0, c); p.dot(X0 + 0.5, Y0, c);
      if (k !== 1) p.dot(X0 + 0.5, Y0 + 0.5, c);
      if (k === 0) p.dot(X0 + 1, Y0 + 0.5, SPOT[1]);
      if (k === 2) p.dot(X0, Y0 + 0.5, SPOT[1]);
    }
  } else for (let i = 0; i < 11; i++) {
    const x = 3 + hash2(i, 1, 61) * 17, y = -2.5 + hash2(i, 2, 61) * 5;
    const topY = -3.2 - Math.max(0, x - 8) * 0.12;
    if (y < topY + 0.5) continue;
    const c = SPOT[i % 2];
    p.px(ox + x, Y(x, by + y), c);
    p.px(ox + x + 1, Y(x, by + y), c);                       // Flecken je 2 px, klar statt Rauschen
    if (hash2(i, 3, 61) < 0.4) p.px(ox + x, Y(x, by + y) + 1, SPOT[1]);
  }
  // Mähne: dunkle Borsten vom Nacken bis zur Rückenmitte
  // fein: doppelt so viele, dünne Borsten (2 Feinpixel), Spitzen eine Stufe heller
  for (let x = 7; x <= 23; x += p.fine ? 0.5 : 1) {
    const xi = Math.floor(x);
    const top = x < 17 ? -4 - (x - 7) * 0.2 : -6 - (x - 17) * 0.1;
    const h = 1.5 + (hash2(xi, 5, 63) * 2 | 0) + (x > 13 && x < 21 ? 1 : 0) + (X.bristle ? 1 : 0) - (x !== xi ? 0.5 : 0);
    const lean = -0.6 - hash2(xi, 6, 63) * 0.4 - P.amp * 0.3;
    const y0 = Y(x, by + top * flat + 1);
    if (p.fine) {
      if (x !== xi) continue;
      p.fline(ox + x, y0 + 0.5, ox + x + lean * h, y0 - h, MANE[xi % 4 === 0 ? 1 : 2], 1);
      p.fline(ox + x + 0.5, y0 + 0.5, ox + x + 0.5 + lean * h, y0 - h + 0.5, MANE[1]);
      p.dot(ox + x + lean * h, y0 - h, MANE[3]);
      continue;

    }
    p.line(ox + x, y0, ox + x + lean * h, y0 - h, MANE[x % 4 === 0 ? 1 : 2]);
    p.px(ox + x + lean * h, y0 - h, MANE[3]);                      // Spitzen einheitlich: Kamm statt Rauschen
  }

  // --- Vorderbeine (nahe Seite)
  leg(6.5, Math.PI * 1.1, true, false);
  leg(20, Math.PI * 0.1, true, true);

  // --- Hals + Kopf: schwerer Schädel, stumpfe dunkle Schnauze, runde Ohren
  const hd = P.head, up = P.up;
  const hx = ox + 25.5 - up, hy = Y(24, by - 6) + hd * 3.2 - up * 3.5 + lie * 3;
  cap(p, ox + 19, Y(19, by - 4), hx - 1.5, hy + 0.5, 3.1, 2.4, HY, { noise: 0.08, seed: 9 });
  // Mähnenkamm über dem Hals
  for (let k = 0; k < 5; k++) {
    const x = ox + 20 + k * (hx - 2 - ox - 20) / 5, y = Y(20, by - 6.5) + k * (hy - 3 - Y(20, by - 6.5)) / 5;
    if (p.fine) {
      p.fline(x, y + 1, x - 1, y - 1 - (k % 2), MANE[2], 0.5); p.fline(x + 0.5, y + 1, x - 0.5, y - 0.5 - (k % 2), MANE[1]);
      p.dot(x - 1, y - 1 - (k % 2), MANE[4]);
    } else { p.line(x, y + 1, x - 1, y - 1 - (k % 2), MANE[2]); p.px(x - 1, y - 1 - (k % 2), MANE[4]); }
  }
  if (p.fine) strokes(p, (ox + 19 + hx) / 2 - 0.5, (Y(19, by - 4) + hy) / 2 + 0.5, 2.6, 1.8, HY.slice(1, 7), 14, 19, -0.9, 0.6, Math.atan2(hy - Y(19, by - 4), hx - ox - 19));
  ell(p, hx, hy, 3.3, 3.0, HY, { bias: 0.08 });
  if (p.fine) strokes(p, hx - 0.5, hy + 0.3, 2.4, 2, HY.slice(2, 7), 12, 21, -0.7, 0.5);
  // Schnauze: Richtung mu (+ = nach unten)
  const mu = -up * 0.9 + hd * 0.25;
  const mx = Math.cos(mu), my = Math.sin(mu);
  const sx = hx + 1.5 + mx * 3.8, sy = hy + 1 + my * 3.8;
  cap(p, hx + 1, hy + 0.5, sx, sy, 2.1, 1.4, HY.slice(1, 6));
  cap(p, sx - mx * 1.8, sy - my * 1.8, sx, sy, 1.5, 1.3, MANE.slice(1)); // dunkle Schnauze
  p.px(sx + mx * 0.8, sy - 0.8, MANE[0]);                     // Nase
  // Unterkiefer / Maul
  const jw = P.jaw;
  const jx = sx - mx * 0.6 - my * jw * 0.5, jy = sy + 1.2 + jw * 2.4 * Math.cos(mu);
  if (jw > 0.15) {
    poly(p, [[hx + 1.2, hy + 1.6], [sx + mx * 0.4, sy + 0.8], [jx + mx * 0.6, jy]], '#4a1210');
    p.px(sx - mx * 0.5, sy + 1, BONE[3]); p.px(sx - mx * 1.5, sy + 1, BONE[2]);
    p.px(jx, jy - 1, BONE[3]);
    if (p.fine) {
      // Rachen mit Zunge, Zahnreihe oben fein, Fänge mit Licht
      p.fline(hx + 1.8, hy + 2.2, (sx + jx) / 2, (sy + jy) / 2 + 0.3, '#8a2a24', 0.5); p.dot((sx + jx) / 2 - 0.5, (sy + jy) / 2, '#b04a3a');
      for (let t = 0.15; t <= 0.85; t += 0.23) p.dot(hx + 1.2 + (sx - hx - 1.2) * t, hy + 1.6 + (sy + 0.8 - hy - 1.6) * t + 0.25, BONE[3]);
      p.dot(sx - mx * 0.5, sy + 1, BONE[4]); p.dot(jx, jy - 1, BONE[4]); p.dot(jx + 0.5, jy - 1, BONE[2]);
    }
  }
  cap(p, hx + 0.5, hy + 2, jx, jy, 1.3, 0.9, HY_D);
  // Ohren (rund, dunkel gerändert)
  const ear = (ex, ey, near) => {
    ell(p, ex, ey - P.ear * 0.5, 1.7, 2.3, near ? HY.slice(2, 7) : HY_D, { rot: -0.35 - P.ear * 0.3 });
    p.px(ex + 0.3, ey + 0.3 - P.ear * 0.5, near ? '#5a3a30' : MANE[1]); p.px(ex + 0.3, ey - 0.7 - P.ear * 0.5, MANE[2]);
    p.px(ex - 0.7, ey - 1.8 - P.ear * 0.5, MANE[1]);                       // dunkler Ohrrand
    if (p.fine) {   // Ohrmuschel mit Haarbüschel, heller Rand vorn
      const e2 = ey - P.ear * 0.5;
      p.dot(ex + 0.25, e2 - 0.25, near ? '#7a5048' : MANE[2]); p.dot(ex + 0.75, e2 + 0.75, near ? '#3a2420' : MANE[0]);
      p.fline(ex - 0.25, e2 + 0.5, ex + 0.25, e2 - 1, near ? HY[5] : HY_D[3]);
      p.dot(ex + 1, e2 - 1, near ? HY[6] : HY_D[4]);
    }
  };
  ear(hx - 3, hy - 3.2, false);
  ear(hx - 1, hy - 3.6, true);
  // Wangenfleck, Auge mit bernsteinfarbenem Glanz
  p.px(hx - 1, hy + 1, SPOT[0]); p.px(hx - 2, hy + 0, SPOT[1]);
  const ex = hx + 1.2, ey = hy - 1;
  // Auge: dunkle Maske, bernsteinfarbene Iris, heller Brauenwulst darüber
  p.rect(ex - 1, ey, 3, 1, MANE[1]); p.px(ex - 1, ey + 1, MANE[2]);
  p.px(ex - 1, ey - 1, HY[6]); p.px(ex, ey - 1, HY[5]); p.px(ex + 1, ey - 1, HY[3]);
  if (P.eye > 0.3) { p.px(ex, ey, '#f0b43c'); p.px(ex + 1, ey, '#1a0e06'); g.px(ex, ey, '#e0a030'); g.px(ex - 1, ey, '#5a3008'); }
  if (p.fine) {
    // Handfein: Bernsteinauge mit Schlitzpupille und Glanzpunkt, Brauenwulst als Lichtkante, Nasenspiegel, Lefze
    const E0 = p.snap(ex), F0 = p.snap(ey);
    if (P.eye > 0.3) {
      p.dot(E0, F0, '#f8c850'); p.dot(E0 + 0.5, F0, '#fff4c0'); p.dot(E0, F0 + 0.5, '#c88a28'); p.dot(E0 + 0.5, F0 + 0.5, '#a06818');
      p.dot(E0 + 1, F0, '#1a0e06'); p.dot(E0 + 1, F0 + 0.5, '#1a0e06'); p.dot(E0 + 1.5, F0 + 0.5, MANE[0]);
      g.dot(E0 + 0.5, F0, '#fff0b0');
    } else p.fline(E0 - 0.5, F0 + 0.5, E0 + 1.5, F0 + 0.5, MANE[0]);
    p.fline(E0 - 1, F0 - 0.5, E0 + 1.5, F0 - 1, HY[6]); p.dot(E0 + 1.5, F0 - 0.5, HY[2]);
    p.dot(sx + mx * 0.8 - 0.5, sy - 1.25, '#6a5a50'); p.dot(sx + mx * 0.8, sy - 0.75, MANE[0]);
    p.fline(sx - mx * 2.6, sy + 1, sx - mx * 0.2, sy + 0.8, MANE[0]);
    p.dot(sx - mx * 1.4, sy - 0.25, MANE[3]); p.dot(sx - mx * 0.8, sy, MANE[3]);     // Schnurrhaar-Punkte
  }

  // Fangzahn ragt auch bei geschlossenem Maul über die Lefze
  if (jw < 0.5) { p.px(sx - mx * 1.3, sy + 1.4, BONE[4]); p.px(sx - mx * 1.3, sy + 2.2, BONE[2]); }
  p.px(sx - mx * 2.4, sy + 1.4, MANE[0]);                                   // Lefzenfalte
  meta.eye = { x: ex, y: ey };
  meta.mouth = { x: sx + mx, y: sy + 0.5 };
  meta.head = { x: hx, y: hy - 5 };
  if (X.dust) dust(p, HS.AX + X.dust, gy, 6, 11, DUST, 10);
  return meta;
}

function hyenaAnims() {
  const mk = (P, X) => makeFrame(HS, drawHyena, P, X);
  const idle = track(mk, [
    [0, hpose({ t: 0.25, bob: 0, jaw: 0.2, head: 0.1 })],
    [0.35, hpose({ t: 0.25, bob: 0.6, jaw: 0.35, head: 0.35, tail: 1.5, ear: 1 })],
    [0.65, hpose({ t: 0.25, bob: 0.9, jaw: 0.1, head: 0.2, tail: 3 })],
    [1, hpose({ t: 0.25, bob: 0, jaw: 0.2, head: 0.1, tail: 6.28 })],
  ], 6, { loop: true });
  // Lauern-Lauf (hohe Frequenz, gesenkter Kopf)
  const walk = [];
  for (let i = 0; i < 6; i++) {
    const c = Math.cos((i / 6) * TAU);
    walk.push(mk(hpose({ t: i / 6, amp: 1.1, bob: c > 0.3 ? -0.5 : c < -0.3 ? 0.6 : 0, head: 0.45, pitch: 0.12 * c, jaw: 0.25, tail: i }), { fx: i % 3 === 0 ? 'step' : null }));
  }
  // Ausholen: duckt sich, Kopf tief, knurrt, Borsten stellen sich auf
  const windup = track(mk, [
    [0, hpose({ t: 0.25, head: 0.3, jaw: 0.2 })],
    [0.5, hpose({ t: 0.25, head: 0.9, crouch: 1.2, jaw: 0.8, lunge: -1, ear: -1 })],
    [1, hpose({ t: 0.25, head: 1.1, crouch: 2, jaw: 1, lunge: -2, pitch: 0.2, ear: -1.5 })],
  ], 4, { all: { bristle: true } });
  // Biss: Satz nach vorn, Maul weit auf, zuschnappen
  const strike = [
    mk(hpose({ t: 0.25, reach: 1, lunge: 2, head: 0.2, up: 0.1, jaw: 1.2, pitch: -0.15, bob: -2, ear: -1 }), { bristle: true }),
    mk(hpose({ t: 0.25, reach: 0.6, lunge: 5, head: 0.4, jaw: 0, pitch: 0.2, bob: -1, ear: -1 }), { fx: 'impact', bristle: true }),
    mk(hpose({ t: 0.25, reach: 0.1, lunge: 4, head: 0.5, jaw: 0.6, crouch: 0.5 }), { dust: 4 }),
    mk(hpose({ t: 0.25, lunge: 1.5, head: 0.3, jaw: 0.2 })),
  ];
  // "Lachen": Kopf hoch, Maul klappt im Takt, Körper bebt
  const howl = [
    mk(hpose({ t: 0.25, up: 0.5, jaw: 0.3, crouch: 0.5 })),
    mk(hpose({ t: 0.25, up: 1, jaw: 1.2, bob: -0.5 }), { fx: 'roar' }),
    mk(hpose({ t: 0.25, up: 0.9, jaw: 0.3, bob: 0.5 })),
    mk(hpose({ t: 0.25, up: 1, jaw: 1.3, bob: -0.5 })),
    mk(hpose({ t: 0.25, up: 0.9, jaw: 0.4, bob: 0.5 })),
    mk(hpose({ t: 0.25, up: 0.6, jaw: 1, bob: 0 })),
  ];
  const hurt = [
    mk(hpose({ t: 0.25, head: -0.4, up: 0.3, lunge: -2, crouch: 1, jaw: 1, pitch: -0.2, eye: 0 })),
    mk(hpose({ t: 0.25, head: 0.2, lunge: -1, crouch: 0.5, jaw: 0.4 })),
  ];
  const death = [
    mk(hpose({ t: 0.25, head: -0.4, up: 0.4, lunge: -2, crouch: 1, jaw: 1, pitch: -0.2, eye: 0 })),
    mk(hpose({ t: 0.25, head: 0.8, crouch: 2.5, lie: 0.3, jaw: 0.8 })),
    mk(hpose({ head: 1.2, lie: 0.7, jaw: 0.6, eye: 0.5, tuck: 0.4 })),
    mk(hpose({ head: 1.3, lie: 1, side: 1, jaw: 0.5, eye: 0 }), { fx: 'impact', dust: 0 }),
    mk(hpose({ head: 1.3, lie: 1, side: 1, jaw: 0.3, eye: 0 })),
  ];
  return {
    idle: new Animation(idle, 6),
    walk: new Animation(walk, 13),
    windup: new Animation(windup, 9, false),
    strike: new Animation(strike, 14, false),
    howl: new Animation(howl, 7.5, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 8, false),
  };
}

// ================================================================ Aschegeier

const VS = { W: 76, H: 64, AX: 36, AY: 58, pad: 10 };
const PLUM = ['#0e0b0c', '#1a1517', '#282123', '#3a3032', '#4f4445', '#6a5d5c'];     // rußschwarzes Gefieder
const PLUM_D = ['#0a0809', '#131011', '#1d1819', '#29222a', '#352c30'];
const ASHF = ['#2e2a2a', '#4a4442', '#6c6560', '#948b82', '#bdb3a6'];                 // aschgraue Armschwingen
const RUFF = ['#4a4038', '#6e6356', '#958a7a', '#bcb09c', '#e0d6c2'];                 // Halskrause
const NECK = ['#2e0e0e', '#561a18', '#843026', '#ae4c3a', '#cc7058', '#e0987a'];      // nackter Hals/Kopf
const BEAK = ['#3a3226', '#7a6c52', '#bcae8a', '#e2d8b8'];
const LEG = ['#2a2224', '#4a3e3e', '#6e6060', '#8e8080'];
const V_REST = {
  hov: 22, bx: 0, lean: 0, wing: 0, wingB: 0.1, fold: 0, neck: 0.3, up: 0, jaw: 0,
  legs: 0, talon: 0, tail: 0, eye: 1, ruff: 0, spread: 1,
};
const vpose = (o = {}) => ({ ...V_REST, ...o });

// Flügel: Wurzel (rx, ry), Schlag w (-1 oben … +1 unten), fold 0..1 (angelegt)
function vultureWing(p, g, rx, ry, w, fold, near, spread, lean) {
  const phi = -2.0 - ((w + 1) / 2) * 2.08 + lean * 0.5 - fold * 0.2;
  const dx = Math.cos(phi), dy = Math.sin(phi);
  // Sehnenrichtung = Senkrechte, die eher nach hinten zeigt
  let bx = -dy, by = dx;
  if (bx * -0.7 + by * 0.3 < 0) { bx = -bx; by = -by; }
  const fs = (0.55 + 0.45 * Math.abs(Math.sin(phi))) * (1 - fold * 0.38) * spread;
  const La = 12 * fs, Lh = 9.5 * fs, L = La + Lh;
  const W = (s) => (s < La ? 8.5 - (s / La) * 1.8 : 6.7 - ((s - La) / Lh) * 3.5) * (1 - fold * 0.35);
  const P = (s, c) => [rx + dx * s + bx * c, ry + dy * s + by * c];
  const RP = near ? PLUM : PLUM_D, RA = near ? ASHF : ASHF.slice(0, 4);
  // Handschwingen: gespreizte "Finger"
  const nF = 6;
  for (let k = 0; k < nF; k++) {
    const s0 = La + Lh * (0.35 + k * 0.13);
    const c0 = W(Math.min(L, s0)) * 0.45;
    const fan = (k - (nF - 1)) * 0.16 * (1 - fold * 0.7);
    const fa = Math.atan2(dy, dx) - fan * Math.sign(dx * by - dy * bx);
    const len = (7.5 - Math.abs(k - 3.5) * 0.6) * fs;
    const [x0, y0] = P(s0, c0);
    const x1 = x0 + Math.cos(fa) * len, y1 = y0 + Math.sin(fa) * len;
    cap(p, x0, y0, x1, y1, 1.0, 0.55, RP.slice(0, 5));
    p.px(x1, y1, near ? RP[4] : RP[2]);
    if (p.fine) {   // Federkiel hell, Hinterkante der Schwinge dunkel
      const ux = x1 - x0, uy = y1 - y0, l = Math.hypot(ux, uy) || 1, qx = -uy / l * 0.5, qy = ux / l * 0.5;
      p.fline(x0 + ux * 0.1, y0 + uy * 0.1, x0 + ux * 0.8, y0 + uy * 0.8, near ? RP[4] : RP[3]);
      p.fline(x0 + ux * 0.2 + qx, y0 + uy * 0.2 + qy, x0 + ux * 0.85 + qx, y0 + uy * 0.85 + qy, RP[0]);
    }
  }
  // Fläche: Vorderkante leicht gewölbt, Hinterkante gezackt
  const pts = [];
  for (let s = 0; s <= L; s += 1) pts.push(P(s, -Math.sin((s / L) * Math.PI) * 1.2));
  for (let s = L; s >= 0; s -= 1) {
    const jag = (Math.round(s) % 2) * 0.8;
    pts.push(P(s, W(s) + jag));
  }
  const cx0 = rx, cy0 = ry;
  if (p.fine) {
    // Handfein: Deckfedern als Schuppenreihen mit dunkler Unterkante, Schwingen als einzelne Federn
    // (Fuge dunkel, Kiel hell, Spitzen aufgehellt) – kein Rauschen
    const h = p.step / 2;
    poly(p, pts, (x, y) => {
      const lx = x + h - cx0, ly = y + h - cy0;
      const s = lx * dx + ly * dy, c = lx * bx + ly * by;
      const wc = W(clamp(s, 0, L)) || 1;
      const f = c / wc;
      if (c < 0.5) return near ? '#b4a89e' : '#7c706a';     // helle Federkante an der Vorderkante (Licht oben links)
      if (c < 1) return near ? '#857872' : RP[4];
      if (f < 0.1) return RP[near ? 5 : 3];
      if (f < 0.14) return RP[near ? 4 : 3];

      if (f < 0.42) {
        const fc = c - 0.14 * wc, row = Math.floor(fc / 1.3), t = fc - row * 1.3;
        const sp = ((s + row * 0.75) % 1.5 + 1.5) % 1.5;
        if (t > 0.85 + Math.abs(sp - 0.75) * 0.5) return RP[1];
        if (t < 0.45 && sp < 0.6) return RP[near ? 4 : 3];
        return RP[near ? 3 : 2];
      }
      const sec = s < La + 1, R = sec ? RA : RP, ss = ((s % 1.5) + 1.5) % 1.5, idx = Math.floor(s / 1.5);
      if (ss < 0.45) return sec ? RA[f > 0.82 ? 1 : 0] : RP[0];                     // Fuge zwischen den Federn
      if (f > 0.84) return sec ? RA[near ? 3 : 2] : RP[near ? 3 : 2];               // helle Federspitze
      return sec ? RA[idx % 2 ? 2 : 1] : RP[idx % 2 ? 2 : 1];

    });
    return P(L, 0);
  }
  poly(p, pts, (x, y) => {
    // lokale Koordinaten
    const lx = x + 0.5 - cx0, ly = y + 0.5 - cy0;
    const s = lx * dx + ly * dy, c = lx * bx + ly * by;
    const wc = W(clamp(s, 0, L)) || 1;
    const f = c / wc;
    const feather = Math.round(s) % 2 === 0;
    if (f < 0.12) return RP[near ? 4 : 3];                         // Vorderkante
    if (f < 0.42) return (hash2(x, y, 71) < 0.2 ? RP[2] : RP[near ? 3 : 2]); // Deckfedern
    if (s < La + 1) return f > 0.82 ? RA[feather ? 3 : 2] : RA[feather ? 2 : 1]; // Armschwingen aschgrau
    return f > 0.8 ? RP[2] : feather ? RP[1] : RP[2];
  });
  return P(L, 0);
}

function drawVulture(p, g, P, X) {
  const meta = {};
  const cx = VS.AX + P.bx, cy = VS.AY - P.hov;
  const c = Math.cos(P.lean), s = Math.sin(P.lean);
  const L = (lx, ly) => ({ x: cx + lx * c - ly * s, y: cy + lx * s + ly * c });

  // --- ferner Flügel
  const shF = L(1.5, -3.5), shB = L(-1, -5);
  vultureWing(p, g, shB.x, shB.y, clamp(P.wingB * 0.8 - 0.3, -1, 1), P.fold, false, P.spread * 0.92, P.lean);

  // --- Schwanzfächer
  const t0 = L(-6, 0.5);
  const tw = Math.sin(P.tail) * 0.8;
  // fein: Schwanzfedern als Bänder längs (helle Kante oben, dunkle Fuge) statt Schachbrett
  poly(p, [[t0.x, t0.y - 1.5], [L(-13, -0.5 + tw).x, L(-13, -0.5 + tw).y], [L(-13.5, 2 + tw).x, L(-13.5, 2 + tw).y], [t0.x, t0.y + 2]],
    p.fine ? (x, y) => {
      const lx = x + 0.25 - cx, ly = y + 0.25 - cy, v = -lx * s + ly * c, u = lx * c + ly * s;
      const b = ((v + 3 + u * 0.12) % 1.25 + 1.25) % 1.25;
      return b < 0.4 ? PLUM[3] : b > 0.9 ? PLUM[0] : u < -11 ? PLUM[2] : PLUM[1];
    } : (x, y) => ((x + y) % 2 ? PLUM[2] : PLUM[1]));
  const te = L(-13.5, 1 + tw); p.px(te.x, te.y, PLUM[4]);

  // --- Beine / Fänge
  const legPt = (side) => {
    const hip = L(1 + side, 3);
    const ext = P.legs;
    const foot = L(1 + side - 2 + ext * 7, 6 + ext * 4.5);
    cap(p, hip.x, hip.y, foot.x, foot.y, 1.2, 0.8, side ? LEG : LEG.slice(0, 3));
    // drei Krallen
    const o = P.talon;
    const fa = P.lean + 0.3 + ext * 0.2;
    for (let k = -1; k <= 1; k++) {
      const a = fa + k * (0.45 + o * 0.5);
      const cx2 = foot.x + Math.cos(a) * 2.2, cy2 = foot.y + Math.sin(a) * 2.2;
      if (p.fine) {   // fein: dünne Zehen mit Schuppenglanz, gebogene Kralle mit hellem Rücken
        p.fline(foot.x, foot.y, cx2, cy2, LEG[side ? 2 : 1], 1); p.fline(foot.x, foot.y - 0.5, cx2, cy2 - 0.5, LEG[side ? 3 : 2]);
        const kx = cx2 + Math.cos(a + 1) * 0.8, ky = cy2 + Math.sin(a + 1) * 0.8;
        p.fline(cx2, cy2, kx, ky, BONE[side ? 2 : 1]); p.dot(cx2, cy2 - 0.5, BONE[side ? 4 : 2]);
      } else {
        p.line(foot.x, foot.y, cx2, cy2, LEG[side ? 2 : 1]);
        p.px(cx2 + Math.cos(a + 1) * 0.8, cy2 + Math.sin(a + 1) * 0.8, BONE[side ? 3 : 1]);
      }
    }
    if (p.fine) for (let t = 0.2; t < 0.9; t += 0.2) p.dot(hip.x + (foot.x - hip.x) * t - 0.25, hip.y + (foot.y - hip.y) * t, LEG[side ? 3 : 2]);
    return foot;
  };
  legPt(0);

  // --- Rumpf
  ell(p, cx, cy, 7.5, 4.6, PLUM, { rot: P.lean, noise: 0.18, seed: 5 });
  // Bauch mit braunem Unterton
  const bl = L(0.5, 2.2); ell(p, bl.x, bl.y, 5, 1.8, ['#1a1210', '#2a1e18', '#3a2a20', '#4c3828'], { rot: P.lean });
  // Federschuppen auf dem Rücken
  if (p.fine) {
    // Handfein: Rückenfedern als versetzte Schuppen (helle Kante, dunkle Unterkante), Bauch mit Strähnen
    for (let r = 0; r < 3; r++) for (let i = 0; i < 8 - r; i++) {
      const q = L(-6 + i * 1.6 + (r % 2) * 0.8, -3.4 + r * 1.3);
      const X0 = p.snap(q.x), Y0 = p.snap(q.y);
      p.dot(X0, Y0, PLUM[r ? 4 : 5]); p.dot(X0 + 0.5, Y0, PLUM[r ? 3 : 4]);
      p.dot(X0 - 0.5, Y0 + 0.5, PLUM[1]); p.dot(X0 + 1, Y0 + 0.5, PLUM[1]); p.dot(X0, Y0 + 1, PLUM[0]); p.dot(X0 + 0.5, Y0 + 1, PLUM[0]);
    }
    strokes(p, bl.x, bl.y, 4.6, 1.5, ['#1a1210', '#2a1e18', '#3a2a20', '#4c3828', '#5e4632'], 12, 57, -1.2, 0.4, P.lean);
  } else for (let i = 0; i < 14; i++) {
    const q = L(-5 + (i % 7) * 1.6, -2.6 + (i > 6 ? 1.6 : 0));
    p.px(q.x, q.y, i % 2 ? PLUM[4] : PLUM[3]); p.px(q.x + 0.5, q.y + 1, PLUM[1]);
  }
  legPt(1);

  // --- Hals (nackt, rot) + Kopf
  const n0 = L(5, -3.2);
  const nk = P.neck, up = P.up;
  const hx = n0.x + 3 + nk * 4.5 - up * 1, hy = n0.y - 4.5 + nk * 3.5 - up * 3 + s * 2;
  const nm = { x: (n0.x + hx) / 2 - 0.5 - nk * 0.5, y: Math.min(n0.y, hy) - 1.5 + nk * 1.5 };
  cap(p, n0.x, n0.y, nm.x, nm.y, 1.8, 1.4, NECK);
  cap(p, nm.x, nm.y, hx - 1, hy + 0.5, 1.4, 1.3, NECK);
  if (p.fine) {   // nackte Haut: Querfalten (dunkle Kerbe, helle Wulst)
    for (let t = 0.25; t < 1; t += 0.25) {
      const x = n0.x + (nm.x - n0.x) * t, y = n0.y + (nm.y - n0.y) * t;
      p.fline(x - 0.75, y - 0.5, x + 0.5, y - 0.25, NECK[1]); p.dot(x - 0.5, y - 1, NECK[4]);
    }
    for (let t = 0.3; t < 0.9; t += 0.3) {
      const x = nm.x + (hx - 1 - nm.x) * t, y = nm.y + (hy + 0.5 - nm.y) * t;
      p.fline(x - 0.5, y - 0.75, x, y + 0.75, NECK[1]); p.dot(x - 0.5, y - 1, NECK[5]);
    }
  }
  // Halskrause
  const rf = L(4.5, -3.2);
  ell(p, rf.x, rf.y, 3.4 + P.ruff * 0.6, 2.6 + P.ruff * 0.6, RUFF, { noise: 0.35, seed: 13 });
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI * 0.95 + i * 0.45;
    p.px(rf.x + Math.cos(a) * (3.6 + P.ruff), rf.y + Math.sin(a) * (2.8 + P.ruff), RUFF[3 + (i % 2)]);
  }
  if (p.fine) {   // Halskrause: flauschige Strähnen, Spitzen außen hell
    strokes(p, rf.x, rf.y, 3.2 + P.ruff * 0.6, 2.4 + P.ruff * 0.6, RUFF, 22, 13, -0.6, 0.9);
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI * 0.95 + i * 0.45, x = rf.x + Math.cos(a) * (3.6 + P.ruff), y = rf.y + Math.sin(a) * (2.8 + P.ruff);
      p.fline(x, y, x - Math.cos(a) * 1.2, y - Math.sin(a) * 1.2, RUFF[2]); p.dot(x + 0.25, y + 0.25, RUFF[4]);
    }
  }
  // Kopf mit Hautfalten
  ell(p, hx, hy, 2.5, 2.1, NECK.slice(1));
  p.px(hx - 1, hy + 1, NECK[1]); p.px(hx - 0.5, hy - 1.5, NECK[5]);
  // Hakenschnabel
  const mu = -up * 0.6 + nk * 0.35;
  const mx = Math.cos(mu), my = Math.sin(mu);
  const bx0 = hx + 1.8, by0 = hy + 0.2;
  cap(p, bx0, by0, bx0 + mx * 3, by0 + my * 3, 1.1, 0.8, BEAK);
  p.px(bx0 + mx * 3.6, by0 + my * 3.6 + 0.8, HAIR[1]); p.px(bx0 + mx * 3.2, by0 + my * 3.2 + 1.3, HAIR[2]);
  if (P.jaw > 0.2) {
    p.line(bx0, by0 + 1.2, bx0 + mx * 2.6 - my * P.jaw * 1.5, by0 + my * 2.6 + 1 + P.jaw * 1.5, BEAK[1]);
    p.px(bx0 + mx * 1.2, by0 + my * 1.2 + 1, '#3a0808');
  }
  // glühendes Auge
  const ex = hx + 0.6, ey = hy - 0.6;
  // Augenhöhle und finsterer Brauenwulst, Wachshaut am Schnabelansatz
  p.px(ex - 1, ey, NECK[0]); p.px(ex, ey + 1, NECK[1]);
  p.px(ex - 1, ey - 1, NECK[5]); p.px(ex, ey - 1.2, NECK[4]); p.px(ex + 1, ey - 0.8, NECK[1]);
  p.px(bx0 - 0.2, by0 - 0.6, BONE[4]); p.px(bx0 + 0.6, by0 - 0.4, BONE[3]);
  p.px(ex, ey, P.eye > 0.3 ? '#ff5a30' : NECK[0]);
  if (P.eye > 0.3) { g.px(ex, ey, '#ff8040'); g.px(ex + 1, ey, '#8a1a08'); g.px(ex, ey - 1, '#5a1004'); }
  if (p.fine) {
    // Handfein: Glutauge mit hellem Kern, Hautfalten am Kopf, Schnabel mit Glanzlinie und Nasenloch, dunkler Haken
    const E0 = p.snap(ex), F0 = p.snap(ey);
    if (P.eye > 0.3) { p.dot(E0, F0, '#fff0b0'); p.dot(E0 + 0.5, F0 + 0.5, '#c8300c'); g.dot(E0, F0, '#fff0b0'); g.dot(E0 + 0.5, F0, '#ffb640'); }
    p.fline(E0 - 1, F0 - 0.5, E0 + 1, F0 - 1, NECK[5]); p.dot(E0 + 1.5, F0 - 0.5, NECK[0]);
    p.fline(hx - 2, hy + 0.5, hx - 0.5, hy + 1.5, NECK[1]); p.fline(hx - 1.5, hy - 1, hx - 0.5, hy - 1.75, NECK[5]);
    p.fline(bx0 + 0.25, by0 - 0.75, bx0 + mx * 2.8 + 0.25, by0 + my * 2.8 - 0.75, BEAK[3]);
    p.dot(bx0 + mx * 1.2 + 0.5, by0 + my * 1.2 - 0.25, BEAK[0]);
    p.dot(bx0 + mx * 3.4, by0 + my * 3.4 + 0.25, HAIR[2]);
  }
  meta.eye = { x: ex, y: ey };
  meta.mouth = { x: bx0 + mx * 3.5, y: by0 + my * 3.5 };
  meta.head = { x: hx, y: hy - 4 };

  // --- naher Flügel
  const tip = vultureWing(p, g, shF.x, shF.y, P.wing, P.fold, true, P.spread, P.lean);
  meta.tip = { x: tip[0], y: tip[1] };
  meta.hand = L(1 + P.legs * 5, 6 + P.legs * 4.5);
  if (X.dust) dust(p, VS.AX + X.dust, VS.AY, 9, 21, DUST, 16);
  if (X.feathers) {
    for (let i = 0; i < 5; i++) {
      const fx = cx + (hash2(i, 1, X.feathers) - 0.5) * 22, fy = cy + (hash2(i, 2, X.feathers) - 0.5) * 16;
      p.px(fx, fy, PLUM[3]); p.px(fx + 1, fy + (i % 2), PLUM[2]);
      if (p.fine) p.fline(fx, fy + 0.5, fx + 1.5, fy + (i % 2) + 0.5, PLUM[5]);   // Federkiel
    }
  }
  return meta;
}

// Liegender Geier (Todes-Endframes)
function drawVultureCorpse(p, g, P, X) {
  const k = P.k;
  const gy = VS.AY, cx = VS.AX + 2;
  // weit ausgebreiteter, flach am Boden liegender Flügel (Draufsicht gestaucht)
  const wpts = [[cx - 2, gy - 4], [cx - 16, gy - 9 + k], [cx - 24, gy - 7 + k], [cx - 22, gy - 4], [cx - 12, gy - 1]];
  // fein: Federn als Streifen mit dunkler Fuge und hellem Kiel statt Schachbrett
  const fineWing = (x, y, top, A, B) => {
    const b = ((x + y * 0.5) % 1.5 + 1.5) % 1.5;
    return b < 0.5 ? PLUM[0] : y < top ? (b < 1 ? PLUM[4] : PLUM[3]) : (b < 1 ? A : B);
  };
  poly(p, wpts, p.fine ? (x, y) => fineWing(x, y, gy - 6, ASHF[2], ASHF[1]) : (x, y) => ((x + y) % 3 === 0 ? PLUM[1] : y < gy - 6 ? PLUM[3] : ASHF[1 + ((x & 1))]));
  for (let i = 0; i < 5; i++) {
    if (p.fine) { p.fline(cx - 20 - i * 0.6, gy - 7 + i * 0.6 + k, cx - 26 - i, gy - 7 + i * 1.1 + k, PLUM[2], 1); p.fline(cx - 20 - i * 0.6, gy - 7.5 + i * 0.6 + k, cx - 26 - i, gy - 7.5 + i * 1.1 + k, PLUM[4]); }
    else p.line(cx - 20 - i * 0.6, gy - 7 + i * 0.6 + k, cx - 26 - i, gy - 7 + i * 1.1 + k, PLUM[2]);
  }
  ell(p, cx, gy - 3.5, 7, 3.2, PLUM, { noise: 0.2, seed: 5 });
  if (p.fine) strokes(p, cx, gy - 3.5, 6.5, 2.8, PLUM, 20, 5, -1.2, 0.5);
  // anderer Flügel halb angelegt
  poly(p, [[cx - 3, gy - 6], [cx + 6, gy - 11 + k * 2], [cx + 9, gy - 8 + k * 2], [cx + 3, gy - 4]], p.fine ? (x, y) => fineWing(x, y, -1e9, PLUM[3], PLUM[2]) : (x, y) => ((x + y) % 2 ? PLUM[3] : PLUM[2]));
  ell(p, cx + 6, gy - 4, 2.8, 2, RUFF, { noise: 0.3, seed: 13 });
  if (p.fine) strokes(p, cx + 6, gy - 4, 2.6, 1.8, RUFF, 12, 13, -0.6, 0.8);

  // Hals abgeknickt, Kopf am Boden
  cap(p, cx + 7, gy - 3, cx + 11, gy - 2, 1.3, 1.1, NECK);
  ell(p, cx + 12, gy - 2, 2, 1.6, NECK.slice(1));
  p.line(cx + 13.5, gy - 2, cx + 16, gy - 1, BEAK[2]); p.px(cx + 16, gy, HAIR[1]);
  p.px(cx + 12.5, gy - 2.5, NECK[0]);
  // Fänge in die Luft
  p.line(cx - 1, gy - 6, cx + 1, gy - 10 + k, LEG[2]); p.px(cx + 1, gy - 10 + k, BONE[2]); p.px(cx + 2, gy - 10 + k, BONE[1]);
  // verstreute Federn
  for (let i = 0; i < 7; i++) {
    const fx = cx - 18 + hash2(i, 1, 44) * 40, fy = gy - hash2(i, 2, 44) * 4 - (1 - k) * 6 * hash2(i, 3, 44);
    p.px(fx, fy, i % 2 ? PLUM[3] : ASHF[2]); p.px(fx + 1, fy, PLUM[1]);
  }
  if (X.dust) dust(p, cx, gy, 12, 23, DUST, 16);
  return { eye: { x: cx + 12.5, y: gy - 2.5 }, head: { x: cx + 12, y: gy - 6 } };
}

function vultureAnims() {
  const mk = (P, X) => makeFrame(VS, drawVulture, P, X);
  const flap = (i, n, o = {}) => {
    const ph = (i / n) * TAU;
    // Aufschlag langsam, Abschlag schnell: Phase verzerren
    const w = -Math.cos(ph + Math.sin(ph) * 0.45);
    return vpose({
      wing: w * (o.amp ?? 0.95), wingB: -Math.cos(ph - 0.35 + Math.sin(ph) * 0.45) * (o.amp ?? 0.95),
      hov: (o.hov ?? 22) - Math.sin(ph - 0.6) * 1.6, tail: ph, neck: (o.neck ?? 0.3) + Math.sin(ph) * 0.1,
      lean: (o.lean ?? 0) + Math.sin(ph) * 0.04, legs: o.legs ?? 0, up: o.up ?? 0,
    });
  };
  const idle = []; for (let i = 0; i < 8; i++) idle.push(mk(flap(i, 8)));
  const walk = []; for (let i = 0; i < 6; i++) walk.push(mk(flap(i, 6, { lean: 0.14, hov: 21, neck: 0.5, amp: 1 })));
  // Ausholen: steigt hoch, Flügel weit oben, Kopf zurück, Fänge vor
  const w0 = flap(0, 8);
  const w1 = vpose({ hov: 27, wing: 0.9, wingB: 0.8, lean: -0.25, neck: 0.1, up: 0.3, legs: 0.3, ruff: 0.5 });
  const w2 = vpose({ hov: 31, wing: -1, wingB: -0.95, lean: -0.4, neck: 0, up: 0.5, legs: 0.6, talon: 0.6, jaw: 1, ruff: 1 });
  const windup = track(mk, [[0, w0], [0.5, w1], [1, w2]], 4);
  // Sturzflug: Flügel angelegt, Fänge voraus – Einschlag – Aufschwung
  const strike = [
    mk(vpose({ hov: 18, bx: 3, wing: -0.5, wingB: -0.55, fold: 0.85, lean: 0.55, neck: 0.8, legs: 0.8, talon: 0.5, jaw: 1, ruff: 1 }), { feathers: 3 }),
    mk(vpose({ hov: 11, bx: 7, wing: -0.9, wingB: -0.85, fold: 0.25, lean: 0.2, neck: 0.9, legs: 1, talon: 1, jaw: 1, ruff: 1 }), { fx: 'impact', dust: 12 }),
    mk(vpose({ hov: 12, bx: 6, wing: 0.9, wingB: 0.8, lean: 0.05, neck: 0.6, legs: 0.7, talon: 0.3, jaw: 0.4, ruff: 0.5 }), { dust: 11 }),
    mk(vpose({ hov: 15, bx: 3, wing: -0.2, wingB: -0.1, lean: -0.1, neck: 0.4, legs: 0.3 })),
    mk(vpose({ hov: 20, bx: 1, wing: 0.7, wingB: 0.6, lean: 0, neck: 0.3 })),
  ];
  const hurtP = vpose({ hov: 23, bx: -3, lean: -0.35, wing: 0.7, wingB: -0.6, neck: -0.2, up: 0.6, jaw: 1, eye: 0, ruff: 1, legs: 0.4, talon: 1 });
  const hurt = [mk(hurtP, { feathers: 7 }), mk(mixP(hurtP, flap(0, 8), 0.5))];
  const corpse = (P, X) => makeFrame(VS, drawVultureCorpse, P, X);
  const death = [
    mk(hurtP, { feathers: 5 }),
    mk(vpose({ hov: 17, bx: -2, lean: 0.5, wing: -0.9, wingB: 0.7, neck: 1, up: -0.5, jaw: 1, eye: 0, legs: 0.5, talon: 1 }), { feathers: 9 }),
    mk(vpose({ hov: 9, bx: 0, lean: 1.1, wing: -1, wingB: -0.4, fold: 0.4, neck: 1, up: -0.6, jaw: 0.6, eye: 0, legs: 0.3 })),
    corpse({ k: 0 }, { fx: 'impact', dust: true }),
    corpse({ k: 0.6 }),
    corpse({ k: 1 }),
  ];
  return {
    idle: new Animation(idle, 9),
    walk: new Animation(walk, 12),
    windup: new Animation(windup, 7, false),
    strike: new Animation(strike, 15, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 9, false),
  };
}

// ================================================================ Khar, der Steppenfürst (Elite)

const KS = { W: 116, H: 90, AX: 54, AY: 82, pad: 14 };
const KD = { legH: 15, thigh: 8, shin: 8.5, spine: 12, upper: 6.5, fore: 7, sh: 2, hipW: 2.2 };
const K_SKIN = ['#2a160e', '#4a2818', '#6e4028', '#935a38', '#b2744a', '#cc9064'];
const K_FUR = ['#121010', '#211d1b', '#332d29', '#4a423b', '#635950', '#827669', '#a39686']; // Wolfsfell
const K_LEA = ['#170e0a', '#2a1a12', '#3f281b', '#583a26', '#744e33', '#906844'];
const K_RED = ['#1a0808', '#300e0c', '#4a1612', '#662016', '#84301e', '#a4442a'];      // Filzhose, Rossschweif
const K_BEARD = ['#0c0908', '#1a1411', '#2c231e', '#40352d', '#6a5e54', '#9a8e84'];
const K_REST = {
  hipX: 0, hipY: 0, lean: 0.08, head: 0, fFx: 6.5, fFy: 0, fBx: -6.5, fBy: 0,
  hFx: 9, hFy: 7, hBx: 4, hBy: 8, axe: -1.1, grip: 1, cape: 0.15, capeT: 0,
  jaw: 0, fire: 1, eye: 1, kneel: 0, spin: -1, fl: 0, held: 1, plume: 0.2,
};
const kpose = (o = {}) => ({ ...K_REST, ...o });

// Doppelaxt: langer Schaft, zwei Bronze-Halbmonde, Glutrunen, Dorn oben.
// a = Schaftrichtung, ls = Verkürzung (Wirbelwind), fire = Glühen der Runen.
function drawDoubleAxe(p, g, hx, hy, a, ls, fire) {
  const dx = Math.cos(a) * ls, dy = Math.sin(a) * ls;
  const nx = -Math.sin(a), ny = Math.cos(a);
  const E = GLOW_EMBER;
  // Schaft mit Lederwicklung und Bronzeringen
  cap(p, hx - dx * 10, hy - dy * 10, hx + dx * 24, hy + dy * 24, 1.2, 1.2, WOOD);
  for (let s = -4; s <= 4; s += 2) p.px(hx + dx * s, hy + dy * s, K_LEA[4]);
  for (const s of [-9, 8, 14]) { p.px(hx + dx * s + nx * 0.5, hy + dy * s + ny * 0.5, BRZ[4]); p.px(hx + dx * s - nx * 0.5, hy + dy * s - ny * 0.5, BRZ[2]); }
  ell(p, hx - dx * 11, hy - dy * 11, 1.4, 1.4, BRZ.slice(1, 6));
  if (p.fine) {
    // Schaft: Maserung, Lederwicklung schräg mit dunkler Fuge, Bronzeringe mit Glanzpunkt, Knauf mit Glanz
    p.fline(hx - dx * 9 - nx * 0.5, hy - dy * 9 - ny * 0.5, hx + dx * 22 - nx * 0.5, hy + dy * 22 - ny * 0.5, WOOD[3]);
    for (let s = -4.5; s <= 4; s += 1) {
      p.fline(hx + dx * s + nx * 1, hy + dy * s + ny * 1, hx + dx * (s + 0.7) - nx * 1, hy + dy * (s + 0.7) - ny * 1, K_LEA[4]);
      p.fline(hx + dx * (s + 0.5) + nx * 1, hy + dy * (s + 0.5) + ny * 1, hx + dx * (s + 1.2) - nx * 1, hy + dy * (s + 1.2) - ny * 1, K_LEA[1]);
    }
    for (const s of [-9, 8, 14]) p.dot(hx + dx * s - nx * 0.75, hy + dy * s - ny * 0.75, BRZ[6]);
    p.dot(hx - dx * 11 - 0.5, hy - dy * 11 - 0.5, BRZ[6]);
  }
  // Kopf
  const cx = hx + dx * 19, cy = hy + dy * 19;
  const blade = (side) => {
    // fein: Blatt in Feinpixeln, schmale Schneide mit Glanzlinie, gravierte Linie parallel zur Schneide,
    // Glanzpunkt; Rune als Zickzack mit heißem Kern statt Einzelpixeln
    const fine = p.fine, st = fine ? 0.25 : 0.5;
    for (let s = -6.5; s <= 6.5; s += st) {
      const f = s / 6.5;
      const reach = 8.2 - f * f * 2.2;
      for (let k = 1; k <= reach; k += st) {
        const neck = 1.6 + (k - 1) * 0.75;
        if (Math.abs(s) > neck) continue;
        const edge = k > reach - (fine ? 0.8 : 1.1);
        const x = cx + dx * s + nx * k * side, y = cy + dy * s + ny * k * side;
        let c = edge ? BRZ[5] : k > reach - 2 ? BRZ[4] : (s * side < 0 ? BRZ[3] : BRZ[2]);
        if (!edge && k < 2.5) c = BRZ[1];
        if (fine) {
          if (edge && k > reach - 0.3) c = BRZ[6];
          else if (!edge && k > 2.6 && Math.abs(k - (reach - 2.6)) < 0.13 && Math.abs(s) < neck - 0.6) c = BRZ[1];
          p.dot(x, y, c);
        } else {
          if (!edge && k > 2.5 && hash2(Math.round(s * 2), Math.round(k * 2), 91 + side) < 0.1) c = BRZ[1];
          p.px(x, y, c);
        }
      }
    }
    if (fine) { const k = 6.2, s = -2.2; p.dot(cx + dx * s + nx * k * side, cy + dy * s + ny * k * side, '#fff8d8'); }
    // Glutrune (Zickzack) im Blatt
    const rp = [];
    for (let i = 0; i < 4; i++) {
      const s = -1.5 + i, k = 4 + (i % 2);
      const x = cx + dx * s + nx * k * side, y = cy + dy * s + ny * k * side;
      rp.push([x, y]);
      if (fine) continue;
      p.px(x, y, fire > 0.3 ? E[2] : BRZ[1]);
      if (fire > 0.3) g.px(x, y, fire > 1.1 ? E[4] : E[3]);
    }
    if (fine) {
      for (let i = 0; i < 3; i++) {
        p.fline(rp[i][0], rp[i][1], rp[i + 1][0], rp[i + 1][1], fire > 0.3 ? E[1] : BRZ[1], 1);
        if (fire > 0.3) { p.fline(rp[i][0], rp[i][1], rp[i + 1][0], rp[i + 1][1], fire > 1.1 ? E[4] : E[3]); g.fline(rp[i][0], rp[i][1], rp[i + 1][0], rp[i + 1][1], fire > 1.1 ? E[4] : E[3], 1); }
      }
      if (fire > 1.1) for (const [x, y] of rp) { p.dot(x, y, '#fff8e0'); g.dot(x, y, '#fff8e0'); }
    }
    if (fire > 1.1) { const x = cx + nx * 7.5 * side, y = cy + ny * 7.5 * side; g.px(x, y, E[2]); }
  };
  blade(1); blade(-1);
  // Tülle + Dorn
  cap(p, cx - dx * 3, cy - dy * 3, cx + dx * 3, cy + dy * 3, 1.8, 1.8, BRZ.slice(0, 5));
  if (p.fine) {
    // Tülle mit Nieten und Glanzlinie, Dorn zweistufig mit Glanzpunkt an der Spitze
    p.fline(cx - dx * 2.5 - nx * 1, cy - dy * 2.5 - ny * 1, cx + dx * 2.5 - nx * 1, cy + dy * 2.5 - ny * 1, BRZ[5]);
    for (const s of [-1.8, 1.8]) { p.dot(cx + dx * s, cy + dy * s, BRZ[6]); p.dot(cx + dx * s + 0.5, cy + dy * s + 0.5, BRZ[1]); }
    p.fline(cx + dx * 3, cy + dy * 3, cx + dx * 7, cy + dy * 7, BRZ[3], 1);
    p.fline(cx + dx * 3 - nx * 0.25, cy + dy * 3 - ny * 0.25, cx + dx * 6.5 - nx * 0.25, cy + dy * 6.5 - ny * 0.25, BRZ[5]);
    p.dot(cx + dx * 7, cy + dy * 7, BRZ[6]);
  } else { p.line(cx + dx * 3, cy + dy * 3, cx + dx * 7, cy + dy * 7, BRZ[4]); p.px(cx + dx * 7, cy + dy * 7, BRZ[6]); }
  return { head: { x: cx, y: cy }, edge: { x: cx + nx * 8, y: cy + ny * 8 }, edge2: { x: cx - nx * 8, y: cy - ny * 8 } };
}

function drawKhar(p, g, P, X) {
  const K = P.kneel;
  const PP = { ...P, hipY: P.hipY + K * 6 };
  const R = rig(PP, KD, KS.AX, KS.AY);
  const { hip, chest, pt, legF, legB, shF, shB } = R;
  const meta = {};
  const E = GLOW_EMBER;
  if (K > 0.01) { // hinteres Knie am Boden
    const kx = hip.x - 3 - K * 3, ky = KS.AY - 1;
    legB.jx += (kx - legB.jx) * K; legB.jy += (ky - legB.jy) * K;
    legB.ex += (kx - 9 - legB.ex) * K; legB.ey += (KS.AY - legB.ey) * K;
  }
  // Hände: zweihändig am Schaft
  const hF = { x: chest.x + P.hFx, y: chest.y + P.hFy };
  const spinning = P.spin >= 0;
  let axeA = P.axe, axeLS = 1;
  if (spinning) {
    const ph = P.spin * TAU;
    const vx = Math.cos(ph), vy = Math.sin(ph) * 0.38;
    axeA = Math.atan2(vy, vx); axeLS = Math.max(0.35, Math.hypot(vx, vy));
    hF.x = chest.x + vx * 8; hF.y = chest.y + 5 + vy * 8;
  }
  const hB = P.grip > 0.5
    ? { x: hF.x - Math.cos(axeA) * 6 * axeLS, y: hF.y - Math.sin(axeA) * 6 * axeLS }
    : { x: chest.x + P.hBx, y: chest.y + P.hBy };
  const armF = ik(shF.x, shF.y, hF.x, hF.y, KD.upper, KD.fore, 1);
  const armB = ik(shB.x, shB.y, hB.x, hB.y, KD.upper, KD.fore, 1);
  const axeBehind = spinning ? Math.sin(P.spin * TAU) < 0 : !!X.axeBehind;
  const neck = pt(KD.spine + 2, 1);
  const hx = Math.round(neck.x + P.head), hy = Math.round(neck.y - 5);

  // --- 1. Rossschweif vom Helmdorn: lange Strähnen, die nach hinten wehen
  const tip = { x: hx + 0.5, y: hy - 12 };
  for (let i = 0; i < 9; i++) {
    const len = 22 - K * 6 + (hash2(i, 1, 33) * 6 | 0) - i * 0.6;
    let x = tip.x - 1, y = tip.y;
    for (let j = 0; j < len; j++) {
      const v = j / len;
      const wind = 0.35 + P.plume * 0.55;
      x -= 0.45 + wind * 0.55 + (i - 4) * 0.05;
      y += -0.45 + v * (1.9 - wind * 1.1) + i * 0.04 + Math.sin(P.capeT * 1.1 + v * 4 + i * 0.8) * 0.45 * v;
      const ci = v > 0.85 ? 2 : i < 2 ? 5 : j % 5 === 0 ? 1 : i % 3 === 0 ? 2 : 3;
      if (p.fine) {   // fein: jede Strähne mit Licht links, dunkler rechts – Rossschweif in Strähnen
        p.dot(x + 0.25, y + 0.25, K_RED[ci]); p.dot(x + 0.75, y + 0.25, K_RED[Math.max(0, ci - 2)]);
        p.dot(x + 0.25, y + 0.75, K_RED[Math.max(0, ci - 1)]); p.dot(x + 0.75, y + 0.75, K_RED[Math.max(0, ci - 2)]);
      } else p.px(x, y, K_RED[ci]);
    }
  }
  // --- 2. Wolfsfellmantel hinten
  const mt = pt(KD.spine + 1, -2);
  for (let i = 0; i < 13; i++) {
    const len = 19 - K * 5 + (hash2(i, 2, 27) * 4 | 0) - i * 0.25;
    for (let j = 0; j < len; j++) {
      const v = j / len;
      const x = mt.x - 4 - i * 0.6 - P.cape * 12 * v * v + Math.sin(P.capeT + v * 3 + i * 0.6) * 1.1 * v;
      const y = mt.y - 1 + j + i * 0.2 - P.cape * 3 * v * v;
      let ci = i < 2 ? 4 : (i + j) % 5 === 0 ? 1 : i % 3 === 0 ? 2 : 3;
      if (j >= len - 2) ci = i < 3 ? 6 : 5;
      if (p.fine) {   // fein: Wolfsfell in Strähnen (Licht links, Fuge rechts), helle Spitzen
        const tipS = j >= len - 2;
        p.dot(x + 0.25, y + 0.25, K_FUR[ci]); p.dot(x + 0.75, y + 0.25, K_FUR[Math.max(0, ci - 1)]);
        p.dot(x + 0.25, y + 0.75, K_FUR[tipS ? ci : Math.min(6, ci + 1)]); p.dot(x + 0.75, y + 0.75, K_FUR[Math.max(0, ci - 1)]);
      } else p.px(x, y, K_FUR[ci]);
    }
  }
  // --- Axt hinter dem Körper
  let axeInfo = null;
  const smearAxe = () => {
    if (!X.smear) return;
    const [a0, a1, sy] = X.smear;
    const scx = X.smearC ? X.smearC.x + chest.x : shF.x, scy = X.smearC ? X.smearC.y + chest.y : shF.y + 2;
    smearArc(p, g, scx, scy, a0, a1, 12, 30, COLD, COLD_G, sy ?? 1);
  };
  if (axeBehind && P.held > 0.5) { smearAxe(); axeInfo = drawDoubleAxe(p, g, hF.x, hF.y, axeA, axeLS, P.fire); }

  // --- 3. hinteres Bein: Filzhose, Fellstiefel
  cap(p, hip.x - 2, hip.y, legB.jx, legB.jy, 2.6, 2.2, K_RED.slice(0, 4));
  cap(p, legB.jx, legB.jy, legB.ex, legB.ey - 2, 2.2, 2.3, K_FUR.slice(0, 4));
  p.rect(legB.ex - 2, legB.ey - 2, 6, 2, K_LEA[1]); p.rect(legB.ex - 2, legB.ey - 2, 6, 1, K_LEA[2]);
  // --- 4. hinterer Arm (Bronze-Armschiene)
  cap(p, shB.x, shB.y, armB.jx, armB.jy, 2.1, 1.8, K_SKIN.slice(0, 4));
  cap(p, armB.jx, armB.jy, armB.ex, armB.ey, 2, 1.8, BRZ.slice(0, 4));
  if (p.fine) p.fline(armB.jx - 1, armB.jy - 1, armB.ex - 1, armB.ey - 1, BRZ[4]);
  ell(p, armB.ex, armB.ey, 1.7, 1.7, K_SKIN.slice(0, 4));

  // --- 5. Rumpf: Lamellenpanzer aus Bronze, Lederschurz, Gürtel
  const hp = pt(0, 0.5), cp = pt(KD.spine, 1);
  const q = (u, k, c) => { const o = pt(u, k); p.px(o.x, o.y, c); };
  // Lamellenschurz (hängende Plattenreihen)
  for (let i = 0; i < 6; i++) {
    const a = pt(0, -4.5 + i * 2);
    const sw = Math.sin(P.capeT + i * 0.9) * 0.6 + P.lean * 3;
    for (let j = 0; j < 7 - Math.abs(i - 2.5) * 0.8; j++) {
      const x = a.x + sw * j * 0.15, y = a.y + j;
      p.px(x, y, j % 2 ? K_LEA[3] : BRZ[i % 2 ? 3 : 2]);
      p.px(x + 1, y, j % 2 ? K_LEA[2] : BRZ[i % 2 ? 2 : 1]);
      if (p.fine) {   // fein: Plattenkante oben im Licht, Fuge unten, Schnürung als Punkt
        const X0 = p.snap(x), Y0 = p.snap(y);
        if (j % 2) { p.dot(X0 + 0.5, Y0, K_LEA[5]); p.dot(X0, Y0 + 0.5, K_LEA[1]); p.dot(X0 + 1.5, Y0 + 0.5, K_LEA[0]); }
        else { p.dot(X0, Y0, BRZ[i % 2 ? 5 : 4]); p.dot(X0 + 0.5, Y0, BRZ[i % 2 ? 4 : 3]); p.dot(X0 + 1.5, Y0 + 0.5, BRZ[0]); }
      }
    }
  }
  cap(p, hp.x, hp.y, cp.x, cp.y, 5.6, 6.6, K_LEA, { noise: 0.1, seed: 4 });
  // Plattenreihen
  // fein: Bronzeplatten 1,5 Weltpixel breit, je Reihe Glanzlinie oben, zwei Mitteltöne, dunkle Fuge;
  // Nieten mit Glanz, ein Glanzpunkt je Reihe auf der Lichtseite
  if (p.fine) for (let u = 2.5; u <= KD.spine - 0.5; u += 1.7) {
    for (let k = -5.25; k <= 6.3; k += 0.5) {
      const kk = Math.round((k + 5.25) * 2), seam = kk % 3 === 0;
      const sh = (Math.abs(k) > 4.6 ? -1 : 0) - (k > 2 ? 1 : 0) + (u > 8 ? 1 : 0);
      const a = pt(u + 0.25, k), b = pt(u - 0.25, k), c = pt(u - 0.75, k), d = pt(u - 1.25, k);
      p.dot(a.x, a.y, seam ? BRZ[clamp(3 + sh, 1, 6)] : BRZ[clamp(5 + sh, 1, 6)]);
      p.dot(b.x, b.y, seam ? BRZ[clamp(2 + sh, 0, 6)] : BRZ[clamp(4 + sh, 1, 6)]);
      p.dot(c.x, c.y, seam ? BRZ[clamp(1 + sh, 0, 6)] : BRZ[clamp(3 + sh, 0, 6)]);
      p.dot(d.x, d.y, K_LEA[1]);
      if (kk % 6 === 4) { p.dot(b.x, b.y, BRZ[6]); p.dot(c.x, c.y, BRZ[1]); }
    }
    const gp = pt(u + 0.25, -3.25); p.dot(gp.x, gp.y, '#fff8d8');
  }
  else for (let u = 2.5; u <= KD.spine - 0.5; u += 1.7) {
    const row = Math.round(u);
    for (let k = -5; k <= 6; k += 1.2) {
      const edge = Math.abs(k) > 4.6 ? -1 : 0;
      q(u, k, BRZ[clamp(4 + edge - (k > 2 ? 1 : 0) + (u > 8 ? 1 : 0), 1, 6)]);
      q(u - 0.6, k, BRZ[clamp(3 + edge - (k > 2 ? 1 : 0), 0, 6)]);
      q(u - 1.1, k, K_LEA[1]);
      if ((row + Math.round(k)) % 4 === 0) q(u - 0.3, k + 0.5, BRZ[1]);
    }
  }
  // Glutbemalte Brustscheibe (Wolfskopf-Symbol angedeutet)
  const bc = pt(7.5, 2.5);
  ell(p, bc.x, bc.y, 2.2, 2.2, BRZ.slice(2, 7));
  p.px(bc.x, bc.y, P.fire > 0.3 ? E[2] : BRZ[1]); p.px(bc.x - 1, bc.y - 1, P.fire > 0.3 ? E[1] : BRZ[1]); p.px(bc.x + 1, bc.y - 1, P.fire > 0.3 ? E[1] : BRZ[1]);
  if (P.fire > 0.3) { g.px(bc.x, bc.y, E[3]); g.px(bc.x - 1, bc.y - 1, E[2]); g.px(bc.x + 1, bc.y - 1, E[2]); }
  if (p.fine) {
    // Brustscheibe: Rand mit Glanzlinie oben links, Wolfskopf aus Glutlinien mit hellem Kern
    for (let a = 3.3; a <= 4.8; a += 0.2) p.dot(bc.x + Math.cos(a) * 1.9, bc.y + Math.sin(a) * 1.9, BRZ[6]);
    for (let a = 0.2; a <= 2.6; a += 0.25) p.dot(bc.x + Math.cos(a) * 2, bc.y + Math.sin(a) * 2, BRZ[1]);
    const on = P.fire > 0.3, c1 = on ? E[3] : BRZ[1];
    p.fline(bc.x - 1, bc.y - 1, bc.x, bc.y + 0.5, c1); p.fline(bc.x + 1, bc.y - 1, bc.x, bc.y + 0.5, c1);
    if (on) { p.dot(bc.x, bc.y, E[4]); g.fline(bc.x - 1, bc.y - 1, bc.x, bc.y + 0.5, E[3]); g.fline(bc.x + 1, bc.y - 1, bc.x, bc.y + 0.5, E[3]); g.dot(bc.x, bc.y, '#fff0b0'); }
  }
  // breiter Gürtel mit Bronzeplaketten
  for (let k = -6; k <= 6; k += 0.5) { q(1, k, K_LEA[1]); q(1.8, k, K_LEA[2]); }
  for (let k = -4.5; k <= 5; k += 2.4) { q(1.4, k, BRZ[4]); q(1.4, k + 0.6, BRZ[2]); }
  if (p.fine) {
    // Gürtel: Naht als Punktlinie oben und unten, Plaketten mit Glanzpunkt
    for (let k = -6; k <= 6; k += 0.75) { const a = pt(2.05, k), b = pt(0.75, k + 0.35); p.dot(a.x, a.y, K_LEA[4]); p.dot(b.x, b.y, K_LEA[3]); }
    for (let k = -4.5; k <= 5; k += 2.4) { const o = pt(1.4, k); p.dot(p.snap(o.x), p.snap(o.y), BRZ[6]); }
  }

  // --- 6. vorderes Bein
  cap(p, hip.x + 2, hip.y, legF.jx, legF.jy, 2.8, 2.4, K_RED);
  cap(p, legF.jx, legF.jy, legF.ex, legF.ey - 2, 2.5, 2.6, K_FUR.slice(1, 7), { noise: 0.2, seed: 6 });
  p.rect(legF.ex - 2, legF.ey - 2, 7, 2, K_LEA[2]); p.rect(legF.ex - 2, legF.ey - 2, 7, 1, K_LEA[3]);
  p.px(legF.ex + 5, legF.ey - 3, K_LEA[4]);
  p.line(legF.jx - 2, legF.jy + 2, legF.jx + 2, legF.jy + 2, BRZ[3]);
  if (p.fine) {
    // Filzhose: zweifarbige Falten; Fellstiefel in Strähnen; Sohle mit Naht; Knieband mit Glanzlinie
    for (let s = 0.25; s <= 0.85; s += 0.2) {
      const x = hip.x + 2 + (legF.jx - hip.x - 2) * s, y = hip.y + (legF.jy - hip.y) * s;
      p.fline(x - 2, y - 0.75, x + 0.5, y, K_RED[5]); p.fline(x - 1.5, y, x + 1.5, y + 0.75, K_RED[1]);
    }
    strokes(p, (legF.jx + legF.ex) / 2, (legF.jy + legF.ey - 2) / 2, 2.2, Math.max(1.5, Math.abs(legF.ey - 2 - legF.jy) / 2), K_FUR.slice(1, 7), 14, 61, -0.4, 1.2);
    stitch(p, legF.ex - 1.5, legF.ey - 1.5, legF.ex + 4.5, legF.ey - 1.5, K_LEA[5], 0.75);
    p.fline(legF.jx - 2, legF.jy + 1.5, legF.jx + 1.5, legF.jy + 1.5, BRZ[5]); p.dot(legF.jx - 1.5, legF.jy + 1.5, BRZ[6]);
  }

  // --- 7. Fellkragen + Schulterpanzer
  const col = pt(KD.spine - 0.5, -0.5);
  ell(p, col.x - 0.5, col.y, 7.5, 3.6, K_FUR.slice(1, 7), { noise: 0.35, seed: 15 });
  if (p.fine) strokes(p, col.x - 0.5, col.y, 7.2, 3.4, K_FUR.slice(1, 7), 60, 15, -0.8, 1.3);
  for (let i = -7; i <= 6; i += 1.4) {
    const x = col.x + i, y = col.y + 3 + (hash2(i * 2 | 0, 3, 23) * 2 | 0);
    if (p.fine) { p.fline(x, y - 0.5, x - 0.5, y + 1.5, K_FUR[2], 1); p.fline(x + 0.5, y, x, y + 1.5, K_FUR[1]); p.dot(x, y - 0.5, K_FUR[4]); }
    else { p.px(x, y, K_FUR[2]); p.px(x, y + 1, K_FUR[1]); }
  }
  const pauldron = () => {
    // drei Bronzeschienen übereinander
    for (let i = 2; i >= 0; i--) {
      ell(p, shF.x + i * 0.3, shF.y + i * 1.6, 4.2 - i * 0.4, 2.4, BRZ.slice(1, 7), { rot: 0.15 });
      if (p.fine) {   // fein: Glanzlinie an der Oberkante jeder Schiene, dunkle Unterkante, Nieten
        const ex = shF.x + i * 0.3, ey = shF.y + i * 1.6, rx = 4.2 - i * 0.4 - 0.3, ry = 2.1;
        for (let a = 3.5; a <= 5.3; a += 0.1) p.dot(ex + Math.cos(a) * rx, ey + Math.sin(a + 0.15) * ry, a < 4.5 ? BRZ[6] : BRZ[5]);
        for (let a = 0.4; a <= 2.7; a += 0.12) p.dot(ex + Math.cos(a) * (rx + 0.2), ey + Math.sin(a + 0.15) * (ry + 0.2), BRZ[1]);
        p.dot(ex - rx * 0.6, ey + 0.5, BRZ[6]); p.dot(ex - rx * 0.6 + 0.5, ey + 1, BRZ[1]);
      }
    }
    p.px(shF.x - 2, shF.y - 1.5, BRZ[6]);
    for (let i = 0; i < 3; i++) p.px(shF.x + 2.5, shF.y + i * 1.6 + 0.5, K_LEA[1]);
    if (p.fine) p.dot(shF.x - 2.5, shF.y - 1.5, '#fff8d8');
  };
  pauldron();

  // --- 8. Kopf: Bart, Gesicht mit Kriegsbemalung, Glutaugen, Spitzhelm mit Wangenklappen
  const jaw = Math.round(P.jaw * 2);
  // Bart: breit, zwei geflochtene Enden mit Bronzeperlen
  ell(p, hx + 2, hy + 3 + jaw, 3.8, 3.4, K_BEARD);
  for (let j = 0; j < 6; j++) {
    const sw = Math.sin(P.capeT + j * 0.5) * 0.4;
    p.px(hx + 1 + sw - P.lean * j, hy + 5 + jaw + j, j % 2 ? K_BEARD[1] : K_BEARD[4]);
    p.px(hx + 4 + sw - P.lean * j, hy + 5 + jaw + j * 0.8, j % 2 ? K_BEARD[2] : K_BEARD[5]);
  }
  p.px(hx + 1 - P.lean * 6, hy + 11 + jaw, BRZ[5]); p.px(hx + 4 - P.lean * 5, hy + 10 + jaw, BRZ[5]);
  if (p.fine) {
    // Bart in Strähnen (senkrecht gekämmt), Zöpfe als Flechtglieder, Perlen mit Glanzpunkt
    strokes(p, hx + 2, hy + 3.5 + jaw, 3.4, 2.8, K_BEARD, 22, 37, 0.15, 1.4);
    for (const [bx, sl, k] of [[1, 1, 0], [4, 0.8, 1]]) {
      for (let j = 0; j < 6; j++) {
        const sw = Math.sin(P.capeT + j * 0.5) * 0.4, x = p.snap(hx + bx + sw - P.lean * j), y = p.snap(hy + 5 + jaw + j * sl);
        const o = j % 2;
        p.dot(x, y, K_BEARD[o ? 3 : 5]); p.dot(x + 0.5, y, K_BEARD[o ? 5 : 2]); p.dot(x, y + 0.5, K_BEARD[1]); p.dot(x + 0.5, y + 0.5, K_BEARD[0]);
      }
      const x = p.snap(hx + bx - P.lean * (6 - k)), y = p.snap(hy + 11 - k + jaw);
      p.dot(x, y, BRZ[6]); p.dot(x + 0.5, y + 0.5, BRZ[2]);
    }
  }
  // Gesicht
  p.rect(hx, hy - 1, 5, 4, K_SKIN[3]);
  p.px(hx + 4, hy + 1, K_SKIN[4]); p.px(hx + 5, hy, K_SKIN[3]); // Nase
  // Kriegsbemalung: schwarzes Band mit rotem Rand über den Augen
  p.rect(hx, hy - 1, 5, 2, '#140c0a');
  p.rect(hx, hy + 1, 5, 1, OCHRE[2]); p.px(hx + 1, hy + 2, OCHRE[2]);
  if (jaw) { p.rect(hx + 2, hy + 2, 3, jaw, '#2a0808'); p.px(hx + 3, hy + 2, BONE[3]); }
  p.rect(hx + 1, hy + 2 + jaw * 0.5, 4, 1, K_BEARD[3]);                  // Schnurrbart
  const eyeOn = P.eye > 0.3;
  p.px(hx + 3, hy, eyeOn ? E[3] : K_SKIN[0]); p.px(hx + 1, hy, eyeOn ? E[2] : K_SKIN[0]);
  if (eyeOn) { g.px(hx + 3, hy, E[4]); g.px(hx + 4, hy, E[1]); g.px(hx + 1, hy, E[2]); g.px(hx + 3, hy - 1, E[0]); }
  if (p.fine) {
    // Handfein: schmale Glutaugen (heißer Kern, roter Saum) unter der Brauenkante, Farbband mit
    // ausgefranster Unterkante, Ockerstreifen mit Lichtkante, Nasenrücken-Licht, Schnurrbart in Strähnen, Mundwinkel
    for (const [x, c] of [[hx + 3, E[3]], [hx + 1, E[2]]]) {
      p.dot(x, hy, '#140c0a'); p.dot(x + 0.5, hy, '#140c0a');                         // Brauenschatten (Lid)
      if (eyeOn) {
        p.dot(x, hy + 0.5, x > hx + 2 ? '#fff0b0' : E[4]); p.dot(x + 0.5, hy + 0.5, c);
        g.dot(x, hy + 0.5, '#fff0b0'); g.dot(x + 0.5, hy + 0.5, E[3]);
      } else { p.dot(x, hy + 0.5, K_SKIN[0]); p.dot(x + 0.5, hy + 0.5, K_SKIN[0]); }
    }
    p.fline(hx, hy - 1, hx + 4.5, hy - 0.5, '#2a1612');                                   // Brauenwulst
    p.dot(hx + 0.5, hy + 1, '#140c0a'); p.dot(hx + 2.5, hy + 1, '#140c0a'); p.dot(hx + 4, hy + 1, '#140c0a');
    p.fline(hx, hy + 1.5, hx + 4.5, hy + 1.5, OCHRE[3]);
    p.dot(hx + 5, hy, K_SKIN[5]); p.dot(hx + 5.5, hy + 0.5, K_SKIN[1]); p.dot(hx + 5, hy + 0.5, K_SKIN[4]);
    const my = hy + 2 + jaw * 0.5;
    p.fline(hx + 1, my, hx + 4.5, my, K_BEARD[5]); p.fline(hx + 1, my + 0.5, hx + 4.5, my + 0.5, K_BEARD[2]);
    p.dot(hx + 0.5, my + 0.5, K_BEARD[4]); p.dot(hx + 0.5, my + 1, K_BEARD[3]);
    if (jaw) { p.fline(hx + 2.5, hy + 2 + jaw * 0.5 + 0.5, hx + 4, hy + 2 + jaw * 0.5 + 0.5, BONE[3]); p.dot(hx + 4.5, hy + 2 + jaw, '#2a0808'); }
  }
  meta.eye = { x: hx + 3, y: hy };
  // Helm: Bronze-Spangenhelm (konisch) mit Nasal, Wangenklappe, Nackenschutz (Leder-Lamellen)
  poly(p, [[hx - 4, hy - 2], [hx + 5.5, hy - 2], [hx + 3, hy - 6], [hx + 0.5, hy - 10], [hx - 2, hy - 6]], (x, y) => {
    const t = (x - (hx - 4)) / 9.5;
    const band = Math.abs(x - (hx + 0.5)) < 0.8;
    if (band) return BRZ[5];
    return y > hy - 3 ? BRZ[2] : BRZ[clamp(Math.round(5 - t * 3 - (y - (hy - 10)) * 0.1), 1, 6)];
  });
  p.rect(hx - 4, hy - 3, 10, 1, BRZ[4]); p.rect(hx - 4, hy - 2, 10, 1, BRZ[2]);
  for (let k = -3; k <= 5; k += 2) p.px(hx + k, hy - 2, BRZ[6]);
  p.rect(hx + 4, hy - 1, 1, 3, BRZ[3]); p.px(hx + 4, hy - 1, BRZ[6]);   // Nasal
  p.rect(hx - 1, hy - 1, 2, 5, BRZ[3]); p.px(hx - 1, hy - 1, BRZ[5]);  // Wangenklappe
  for (let j = 0; j < 5; j++) p.px(hx - 3 - (j % 2) * 0.5, hy - 1 + j, j % 2 ? K_LEA[2] : K_LEA[4]); // Nackenschutz
  p.rect(hx - 4, hy - 1, 1, 4, K_LEA[1]);
  // Dorn mit Ring
  p.line(hx + 0.5, hy - 10, hx + 0.5, hy - 12, BRZ[4]); p.px(hx + 0.5, hy - 12, BRZ[6]);
  p.px(hx - 0.5, hy - 11, BRZ[2]); p.px(hx + 1.5, hy - 11, BRZ[3]);
  if (p.fine) {
    // Spangenhelm: Spangen mit Glanzlinie, Nietenreihe am Stirnreif, Glanzpunkt auf der Kuppel, Gravur;
    // Nasal und Wangenklappe mit Lichtkante und Nieten, Nackenschutz mit Schnürung, Dorn zweistufig
    p.fline(hx + 0.5, hy - 9.5, hx - 2.5, hy - 3, BRZ[5]); p.fline(hx + 1, hy - 9.5, hx - 2, hy - 3, BRZ[3]);
    p.fline(hx + 1, hy - 9.5, hx + 3.5, hy - 3, BRZ[4]); p.fline(hx + 1.5, hy - 9.5, hx + 4, hy - 3, BRZ[1]);
    p.dot(hx - 0.5, hy - 7, '#fff8d8'); p.dot(hx, hy - 7.5, BRZ[6]);
    p.fline(hx - 4, hy - 3, hx + 1, hy - 3, BRZ[6]);
    for (let k = -3; k <= 5; k += 2) { p.dot(hx + k, hy - 2, BRZ[6]); p.dot(hx + k + 0.5, hy - 2, BRZ[4]); p.dot(hx + k, hy - 1.5, BRZ[3]); p.dot(hx + k + 0.5, hy - 1.5, BRZ[1]); }


    p.fline(hx + 4, hy - 1, hx + 4, hy + 1.5, BRZ[5]); p.fline(hx + 4.5, hy - 0.5, hx + 4.5, hy + 1.5, BRZ[2]);
    p.fline(hx - 1, hy - 1, hx - 1, hy + 3.5, BRZ[5]); p.fline(hx + 0.5, hy - 0.5, hx + 0.5, hy + 3.5, BRZ[1]);
    p.dot(hx - 0.5, hy, BRZ[6]); p.dot(hx - 0.5, hy + 2.5, BRZ[6]); p.dot(hx, hy + 3, BRZ[1]);
    for (let j = 0; j < 5; j++) p.dot(hx - 2.5, hy - 0.5 + j, K_LEA[0]);
    for (let y = -12; y <= -10; y += 0.5) { p.dot(hx + 0.5, hy + y, BRZ[5]); p.dot(hx + 1, hy + y, BRZ[2]); }
    p.dot(hx + 0.5, hy - 12, BRZ[6]); p.dot(hx - 0.5, hy - 11, BRZ[4]); p.dot(hx + 2, hy - 10.5, BRZ[1]);
  }
  meta.head = { x: hx + 1, y: hy - 12 };
  meta.mouth = { x: hx + 4, y: hy + 2 };

  // --- 9. vorderer Arm + Axt
  const drawArm = () => {
    cap(p, shF.x, shF.y + 1, armF.jx, armF.jy, 2.4, 2.1, K_SKIN);
    cap(p, armF.jx, armF.jy, armF.ex, armF.ey, 2.3, 2.1, K_SKIN);
    const bx = armF.jx + (armF.ex - armF.jx) * 0.3, by = armF.jy + (armF.ey - armF.jy) * 0.3;
    cap(p, bx, by, armF.ex, armF.ey, 2.4, 2.3, BRZ.slice(1, 7));
    p.px(bx + (armF.ex - bx) * 0.5, by + (armF.ey - by) * 0.5, BRZ[6]);
    // Ockerstreifen am Oberarm
    const mx = (shF.x + armF.jx) / 2, my = (shF.y + armF.jy) / 2;
    p.px(mx, my, OCHRE[3]); p.px(mx + 1, my + 1, OCHRE[2]);
    if (p.fine) {
      // Armschiene: Glanzlinie längs, Kante und Glanzpunkt; Ockerbänder als feine Striche; Muskelkante
      const ux = armF.ex - bx, uy = armF.ey - by, L = Math.hypot(ux, uy) || 1, nx = -uy / L, ny = ux / L, sg = nx + ny > 0 ? -1 : 1;
      p.fline(bx + nx * 1.4 * sg, by + ny * 1.4 * sg, armF.ex + nx * 1.4 * sg, armF.ey + ny * 1.4 * sg, BRZ[6]);
      p.fline(bx - nx * 1.6 * sg, by - ny * 1.6 * sg, armF.ex - nx * 1.6 * sg, armF.ey - ny * 1.6 * sg, BRZ[1]);
      p.fline(bx - nx * 2.2, by - ny * 2.2, bx + nx * 2.2, by + ny * 2.2, BRZ[5]);
      p.fline(mx - 1, my - 0.5, mx + 1, my + 0.5, OCHRE[4]); p.fline(mx - 0.5, my + 1, mx + 1.5, my + 2, OCHRE[3]);
      p.fline(shF.x - 1.5, shF.y + 2, armF.jx - 1.5, armF.jy, K_SKIN[5]);
    }
  };
  const fist = (x, y) => {
    ell(p, x, y, 1.9, 1.9, K_SKIN); p.px(x - 1, y - 1, K_SKIN[5]);
    if (p.fine) { for (let k = -1; k <= 1; k += 1) p.dot(x + 1, y + k * 0.75, K_SKIN[1]); p.dot(x - 1, y - 1, '#e8b088'); }
  };

  if (!axeBehind && P.held > 0.5) { smearAxe(); drawArm(); axeInfo = drawDoubleAxe(p, g, hF.x, hF.y, axeA, axeLS, P.fire); fist(hF.x, hF.y); if (P.grip > 0.5) fist(hB.x, hB.y); }
  else { drawArm(); fist(hF.x, hF.y); }
  meta.hand = hF;
  if (axeInfo) { meta.axe = axeInfo.head; meta.tip = axeInfo.edge; }
  if (X.dust) dust(p, KS.AX + X.dust, KS.AY, 14, 41, DUST, 22);
  return meta;
}

function kharAnims() {
  const mk = (P, X) => makeFrame(KS, drawKhar, P, X);
  const T = (keys, n, o) => track(mk, keys, n, o);
  const idleA = kpose({});
  const idleB = kpose({ hipY: 1, lean: 0.11, hFy: 8, axe: -1.05, capeT: Math.PI, head: 0.3, plume: 0.3 });
  const idle = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 6, k = (1 - Math.cos(t * TAU)) / 2;
    idle.push(mk({ ...mixP(idleA, idleB, k), capeT: t * TAU, fire: 0.9 + k * 0.3 }));
  }
  const walk = [];
  for (let i = 0; i < 8; i++) {
    const ph = (i / 8) * TAU, sn = Math.sin(ph), c = Math.cos(ph);
    walk.push(mk(kpose({
      hipY: -Math.abs(c) * 1.4 + 1, lean: 0.14 + Math.abs(sn) * 0.03, fFx: 1 + sn * 7.5, fFy: Math.max(0, -c) * 3.2,
      fBx: -1 - sn * 7.5, fBy: Math.max(0, c) * 3.2, hFx: 9 + sn * 1.2, hFy: 7 - Math.abs(sn) * 0.8,
      axe: -1.1 + sn * 0.06, cape: 0.5, capeT: ph, head: sn * 0.5, plume: 0.5,
    }), { fx: i === 0 || i === 4 ? 'step' : null }));
  }
  // Brüllen: stampft, reißt die Axt einhändig hoch, Kopf in den Nacken, Runen lodern
  const r0 = kpose({});
  const r1 = kpose({ lean: 0.22, hipY: 2, head: 1, hFx: 7, hFy: 9, axe: -0.6, jaw: 0.3, fFx: 7.5 });
  const r2 = kpose({ lean: -0.22, hipY: 1, head: -1, hFx: 8, hFy: -14, axe: -1.45, grip: 0, hBx: -10, hBy: 1, jaw: 1, cape: 0.9, capeT: 2, fire: 1.6, fFx: 9, fBx: -9, plume: 1 });
  const roar = T([[0, r0], [0.3, r1], [0.5, r2, snap], [0.85, { ...r2, capeT: 4 }], [1, { ...r2, capeT: 5, jaw: 0.8, plume: 0.8 }]], 8,
    { extras: { 2: { fx: 'step', dust: 4 }, 3: { fx: 'roar' } } });
  // Grundangriff: Axt weit hinter die Hüfte gedreht …
  const w1 = kpose({ lean: 0.02, hipX: -1, hFx: -1, hFy: 4, axe: -2.4, fFx: 8.5, fBx: -8.5, cape: 0.2, plume: 0.4, head: -0.5 });
  const w2 = kpose({ lean: -0.14, hipX: -2.5, hipY: 1.5, hFx: -8, hFy: 3, axe: -2.95, fFx: 10, fBx: -9, fBy: 1, cape: 0.3, capeT: 1, jaw: 0.6, fire: 1.3, plume: 0.6, head: -1 });
  const w3 = kpose({ ...w2, lean: -0.18, hFx: -9, hFy: 4, axe: 3.05, jaw: 1, fire: 1.4 });
  const windup = [mk(idleA), mk(mixP(idleA, w1, 0.6)), mk(w1), mk(w2, { axeBehind: true }), mk(w3, { axeBehind: true })];
  // … und in weitem, flachem Bogen nach vorn gerissen
  const s1 = kpose({ lean: 0.12, hipX: 1, hipY: 2, hFx: 2, hFy: 7, axe: 2.2, fFx: 11, fBx: -9, cape: 0.6, capeT: 2, jaw: 1, fire: 1.5, plume: 0.8 });
  const s2 = kpose({ lean: 0.34, hipX: 4, hipY: 4, hFx: 13, hFy: 6, axe: 0.15, fFx: 12.5, fBx: -10, cape: 1, capeT: 3, jaw: 1, fire: 1.5, plume: 1 });
  const s3 = kpose({ ...s2, lean: 0.3, hFx: 11, hFy: 1, axe: -0.7, capeT: 4, jaw: 0.6 });
  const s4 = kpose({ lean: 0.2, hipX: 2, hipY: 2, hFx: 10, hFy: 5, axe: -0.9, fFx: 10, fBx: -9, cape: 0.4, capeT: 5, plume: 0.5 });
  const strike = [
    mk(s1, { smear: [3.1, 2.2, 0.42], smearC: { x: 0, y: 6 }, axeBehind: true }),
    mk(s2, { smear: [2.7, 0.15, 0.42], smearC: { x: 0, y: 6 }, fx: 'impact' }),
    mk(s3, { smear: [0.9, -0.7, 0.6], smearC: { x: 0, y: 5 } }),
    mk(s4),
    mk(mixP(s4, idleA, 0.6)),
  ];
  // Wirbelwind: Doppelaxt kreist waagerecht um den Körper
  const spin = [];
  for (let i = 0; i < 8; i++) {
    const ph = i / 8, a1 = ph * TAU;
    spin.push(mk(kpose({
      spin: ph, lean: 0.05, hipY: 2.5, fFx: 8.5 + Math.sin(a1) * 1.5, fBx: -8.5 + Math.sin(a1) * 1.5, fFy: i % 4 === 0 ? 1 : 0,
      cape: 1, capeT: a1 * 2, head: Math.cos(a1) * 0.8, jaw: 0.6, fire: 1.5, plume: 0.4 + Math.abs(Math.sin(a1)) * 0.6,
    }), { smear: [a1 - 2.4, a1, 0.38], smearC: { x: 0, y: 5 }, fx: i % 4 === 0 ? 'step' : null }));
  }
  // Ansturm vorbereiten: tief geduckt, Axt quer vor der Brust wie ein Rammbock, stampft
  const c1 = kpose({ lean: 0.2, hipY: 3, hFx: 9, hFy: 5, axe: -0.3, fFx: 9, fBx: -9, jaw: 0.4, plume: 0.4 });
  const c2 = kpose({ lean: 0.36, hipX: -1, hipY: 5, hFx: 11, hFy: 5, axe: -0.12, fFx: 10, fBx: -10, fBy: 1.5, jaw: 1, fire: 1.4, cape: 0.4, capeT: 1, plume: 0.6 });
  const c3 = kpose({ ...c2, fBy: 0, hipY: 5.5, capeT: 2, plume: 0.8 });
  const chargeup = [mk(idleA), mk(c1), mk(c2), mk(c3, { fx: 'step', dust: -6 }), mk({ ...c3, jaw: 0.7, capeT: 3 })];
  // Ansturm: schwerer Lauf, Axtkopf voraus, Mantel und Rossschweif fliegen
  const charge = [];
  for (let i = 0; i < 6; i++) {
    const ph = (i / 6) * TAU, sn = Math.sin(ph), c = Math.cos(ph);
    charge.push(mk(kpose({
      hipY: 2 - Math.abs(c) * 2, lean: 0.4, fFx: 3 + sn * 10, fFy: Math.max(0, -c) * 4.5, fBx: -1 - sn * 10, fBy: Math.max(0, c) * 4.5,
      hFx: 12 + sn * 0.6, hFy: 5, axe: -0.12 + sn * 0.05, cape: 1.1, capeT: ph * 2, plume: 1, jaw: 1, fire: 1.4, head: 0.5,
    }), { fx: i % 3 === 0 ? 'step' : null, dust: i % 3 === 0 ? -8 : undefined }));
  }
  // Treffer
  const hurtP = kpose({ lean: -0.18, hipX: -2, head: -1.5, jaw: 0.6, hFx: 6, hFy: 8, axe: -0.8, cape: 0.4, plume: 0.5 });
  const hurt = [mk(hurtP), mk(mixP(hurtP, idleA, 0.5))];
  // Tod: taumelt, sinkt auf die Knie, kippt vornüber; die Runen verglühen
  const d1 = kpose({ lean: -0.28, hipX: -2, head: -2, jaw: 1, hFx: 8, hFy: 10, axe: 0.3, plume: 0.6 });
  const d2 = kpose({ kneel: 1, lean: 0.3, jaw: 1, head: 2, hFx: 12, hFy: 10, axe: 0.62, fire: 0.8, eye: 0.6, fFx: 7.5, fBx: -9.5 });
  const d3 = kpose({ kneel: 1, lean: 0.55, jaw: 0.6, head: 3, hFx: 13, hFy: 12, axe: 0.45, fire: 0.6, eye: 0.4, fFx: 7.5, fBx: -9.5 });
  const piv = [KS.AX + 2, KS.AY - 1];
  const flat = kpose({ lean: 0.05, head: 1, fFx: 3, fBx: -2, hFx: 4, hFy: 12, grip: 0, hBx: 0, hBy: 12, held: 0, fire: 0, eye: 0, jaw: 0.5 });
  const lying = (fire) => (p, g) => { drawDoubleAxe(p, g, KS.AX + 22, KS.AY - 3, -0.1, 1, fire); return {}; };
  const d4 = { ...d3, hFx: 6, hFy: 16, grip: 0, hBx: 2, hBy: 16, axe: 1.6, fire: 0, held: 0 };
  const death = [
    mk(hurtP), mk(d1), mk(d2, { fx: 'impact' }), mk(d3),
    mk(d4, { rot: [0.6, ...piv], post: lying(0.9) }),
    mk(d4, { rot: [1.2, ...piv], post: lying(0.7) }),
    mk(flat, { rot: [Math.PI / 2, KS.AX - 4, KS.AY - 1], post: lying(0.5), fx: 'impact', dust: 10 }),
    mk(flat, { rot: [Math.PI / 2, KS.AX - 4, KS.AY - 1], post: lying(0) }),
  ];
  return {
    idle: new Animation(idle, 6),
    walk: new Animation(walk, 9),
    roar: new Animation(roar, 7, false),
    windup: new Animation(windup, 8, false),
    strike: new Animation(strike, 14, false),
    spin: new Animation(spin, 16),
    chargeup: new Animation(chargeup, 6, false),
    charge: new Animation(charge, 12),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 8, false),
  };
}

// ================================================================ Export

// Figurensätze werden erst beim ersten Zugriff gebaut (je Typ).
const STEPPE = {
  steppe_raider: () => raiderAnims(false),
  raider_archer: () => raiderAnims(true),
  dust_hyena: hyenaAnims,
  ash_vulture: vultureAnims,
  steppe_warlord: kharAnims,
};

export function createSteppeFoes() {
  const out = {};
  for (const k in STEPPE) {
    Object.defineProperty(out, k, {
      configurable: true, enumerable: true,
      get() {
        const v = STEPPE[k]();
        Object.defineProperty(out, k, { value: v, writable: true, configurable: true, enumerable: true });
        return v;
      },
    });
  }
  return out;
}
