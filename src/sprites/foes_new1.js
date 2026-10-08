import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame, SpriteFrame, Animation } from '../gfx/Sprite.js';
import { hash2 } from '../core/math.js';

// Neue Gegner Stufe 1–20 (Runde 5): Glutkäfer, Schildträger,
// Schlackensprenger und Klippenharpyie.
//
// Bauweise wie foes_steppe.js / foes_ashwood.js: kleine Rigs (Hüfte, Rumpf,
// Kopf, IK-Arme/-Beine bzw. parametrische Tiere), Schlüsselposen werden beim
// Laden weich interpoliert. Material pro Pixel mit Licht von links oben
// schattiert, danach Randlicht auf den Oberkanten; die dunkle Kontur legt
// buildFrame darum. Jeder Frame hat eine Leucht-Ebene (frame.glow),
// Metadaten (frame.meta: eye/head/hand/mouth, Sprenger zusätzlich fuse =
// Luntenspitze, Harpyie zusätzlich fly = Körpermitte über dem Boden) und
// optional frame.fx ('step' | 'impact' | 'roar' | 'cast' | 'burst').
// Blickrichtung rechts, Anker = Bodenkontakt. Die Harpyie schwebt im Sprite
// über dem Anker (Schatten zeichnet die Engine am Boden).
// Deterministisch: Rauschen nur über hash2, kein Zufall.

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


// Maßstab-Hülle (Runde r3): zeichnet eine Figur im alten Grundmaß, rastert aber Flächen (ell, cap, poly,
// ellipse, line) neu im vergrößerten Maß, damit Rundungen und Kanten pixelgenau bleiben. Einzelpixel und
// Rechtecke werden auf ganze Zielpixel gestreckt (keine Lücken). Drehpunkt: Anker alt (ax, ay) -> Anker neu.
class GeoPC {
  constructor(base, s, ax, ay, AX, AY) { this.base = base; this.s = s; this.ax = ax; this.ay = ay; this.AX = AX; this.AY = AY; this.geo = true; }
  get ctx() { return this.base.ctx; }
  get w() { return this.base.w; }
  get h() { return this.base.h; }
  get canvas() { return this.base.canvas; }
  tx(x) { return this.AX + (x - this.ax) * this.s; }
  ty(y) { return this.AY + (y - this.ay) * this.s; }
  ix(x) { return this.ax + (x - this.AX) / this.s; }
  iy(y) { return this.ay + (y - this.AY) / this.s; }
  px(x, y, c) {
    const x0 = Math.round(x), y0 = Math.round(y);
    const a = Math.round(this.tx(x0)), b = Math.round(this.tx(x0 + 1)), u = Math.round(this.ty(y0)), v = Math.round(this.ty(y0 + 1));
    this.base.ctx.fillStyle = c; this.base.ctx.fillRect(a, u, Math.max(1, b - a), Math.max(1, v - u));
  }
  rect(x, y, w, h, c) {
    const x0 = Math.round(x), y0 = Math.round(y), x1 = x0 + Math.round(w), y1 = y0 + Math.round(h);
    const a = Math.round(this.tx(x0)), b = Math.round(this.tx(x1)), u = Math.round(this.ty(y0)), v = Math.round(this.ty(y1));
    this.base.ctx.fillStyle = c; this.base.ctx.fillRect(a, u, Math.max(1, b - a), Math.max(1, v - u));
  }
  line(x0, y0, x1, y1, c) { this.base.line(this.tx(x0), this.ty(y0), this.tx(x1), this.ty(y1), c); }
  ellipse(cx, cy, rx, ry, c) { this.base.ellipse(this.tx(cx), this.ty(cy), rx * this.s, ry * this.s, c); }
  vgrad(x, y, w, h, ramp) { PixelCanvas.prototype.vgrad.call(this, x, y, w, h, ramp); }
}
// Vergrößertes Grundmaß aus einem Grundmaß S (Faktor s); makeFrame erkennt S.gs.
function scaleS(S, s) {
  return { ...S, W: Math.ceil(S.W * s), H: Math.ceil(S.H * s), AX: Math.round(S.AX * s), AY: Math.round(S.AY * s), pad: Math.ceil((S.pad ?? 10) * s), gs: { s, ax: S.AX, ay: S.AY } };
}

// Schattierte Ellipse (optional gedreht, mit Materialrauschen)
function ell(p, cx, cy, rx, ry, ramp, o = {}) {
  if (p.geo) return ell(p.base, p.tx(cx), p.ty(cy), rx * p.s, ry * p.s, ramp, { ...o, clip: o.clip ? (x, y, u, v) => o.clip(p.ix(x + 0.5) - 0.5, p.iy(y + 0.5) - 0.5, u, v) : null });
  const { rot = 0, noise = 0, seed = 1, bias = 0, clip = null } = o;
  const c = Math.cos(rot), s = Math.sin(rot);
  const R = Math.ceil(Math.max(rx, ry)) + 1;
  const ctx = p.ctx; let last = null;
  for (let y = Math.floor(cy - R); y <= cy + R; y++) {
    for (let x = Math.floor(cx - R); x <= cx + R; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry;
      const d2 = u * u + v * v;
      if (d2 > 1) continue;
      if (clip && !clip(x, y, u, v)) continue;
      const nz = Math.sqrt(1 - d2);
      const nx = u * c - v * s, ny = u * s + v * c;
      const n = noise ? (hash2(Math.round(dx) + 64, Math.round(dy) + 64, seed) - 0.5) * noise : 0;
      const col = tone(ramp, nx, ny, nz, bias, n);
      if (col !== last) { ctx.fillStyle = col; last = col; }
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

// Schattierte Kapsel (Gliedmaßen): Radius r0 -> r1
function cap(p, x0, y0, x1, y1, r0, r1, ramp, o = {}) {
  if (p.geo) return cap(p.base, p.tx(x0), p.ty(y0), p.tx(x1), p.ty(y1), r0 * p.s, r1 * p.s, ramp, o);
  const { noise = 0, seed = 1, bias = 0 } = o;
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 0.0001;
  const R = Math.ceil(Math.max(r0, r1)) + 1;
  const ctx = p.ctx; let last = null;
  const minX = Math.floor(Math.min(x0, x1) - R), maxX = Math.ceil(Math.max(x0, x1) + R);
  const minY = Math.floor(Math.min(y0, y1) - R), maxY = Math.ceil(Math.max(y0, y1) + R);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const t = clamp(((px - x0) * dx + (py - y0) * dy) / l2, 0, 1);
      const qx = x0 + dx * t, qy = y0 + dy * t;
      const r = r0 + (r1 - r0) * t;
      const ex = px - qx, ey = py - qy, d = Math.hypot(ex, ey);
      if (d > r) continue;
      const nx = ex / (r || 1), ny = ey / (r || 1), nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const n = noise ? (hash2(Math.round(px - x0) + 64, Math.round(py - y0) + 64, seed) - 0.5) * noise : 0;
      const col = tone(ramp, nx, ny, nz, bias, n);
      if (col !== last) { ctx.fillStyle = col; last = col; }
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

// Gefülltes Polygon (Scanline). col: Farbe oder (x, y) => Farbe|null
function poly(p, pts, col) {
  if (p.geo) return poly(p.base, pts.map((q) => [p.tx(q[0]), p.ty(q[1])]), typeof col === 'function' ? (x, y) => col(Math.round(p.ix(x + 0.5) - 0.5), Math.round(p.iy(y + 0.5) - 0.5)) : col);
  let minY = Infinity, maxY = -Infinity;
  for (const q of pts) { minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]); }
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const yc = y + 0.5, xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + (yc - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.round(xs[k]), x1 = Math.round(xs[k + 1]);
      if (typeof col === 'function') for (let x = x0; x < x1; x++) { const c = col(x, y); if (c) p.px(x, y, c); }
      else if (x1 > x0) p.rect(x0, y, x1 - x0, 1, col);
    }
  }
}

// Schwung-Schleier: überstreicht die Klinge von a0 nach a1 (Drehpunkt cx/cy),
// am Ende dicht und hell, am Anfang ausgedünnt; sy staucht die Bahn senkrecht.
function smearArc(p, g, cx, cy, a0, a1, r0, r1, cols, gcols, sy = 1) {
  const n = Math.ceil(Math.abs(a1 - a0) * r1 * 1.4) + 2;
  for (let i = 0; i <= n; i++) {
    const f = i / n, a = a0 + (a1 - a0) * f;
    for (let r = r0; r <= r1; r += 0.5) {
      const radial = (r - r0) / (r1 - r0 || 1);
      const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r * sy);
      const dens = f * f * 0.55 + radial * (0.2 + 0.8 * f) - 0.12;
      if (hash2(x + 50, y + 50, 31) > dens) continue;
      const c = radial > 0.82 ? cols[2] : radial > 0.5 ? cols[1] : cols[0];
      p.px(x, y, c);
      if (g && gcols && f > 0.35 && radial > 0.45) g.px(x, y, radial > 0.82 ? gcols[1] : gcols[0]);
    }
  }
}

// Staubkranz am Boden (Aufprall, Stampfen)
function dust(p, x, y, r, seed, cols, n = 16) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + hash2(i, 1, seed) * 0.4;
    const rr = r * (0.55 + hash2(i, 2, seed) * 0.6);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.4 - (Math.sin(a) < 0 ? hash2(i, 3, seed) * 3 : 0);
    p.px(px, py, cols[i % cols.length]);
    if (hash2(i, 4, seed) < 0.55) p.px(px + 1, py, cols[(i + 1) % cols.length]);
    if (hash2(i, 5, seed) < 0.3) p.px(px, py - 1, cols[(i + 2) % cols.length]);
  }
}

// Dreht den Inhalt einer PixelCanvas pixelgenau (nächster Nachbar) um einen Drehpunkt.
function rotBlit(src, dst, px, py, ang) {
  const W = src.w, H = src.h;
  const s = src.ctx.getImageData(0, 0, W, H).data;
  const img = dst.ctx.getImageData(0, 0, W, H), d = img.data;
  const c = Math.cos(-ang), sn = Math.sin(-ang);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const rx = x + 0.5 - px, ry = y + 0.5 - py;
    const sx = Math.floor(px + rx * c - ry * sn), sy = Math.floor(py + rx * sn + ry * c);
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
    const si = (sy * W + sx) * 4;
    if (s[si + 3] === 0) continue;
    const di = (y * W + x) * 4;
    d[di] = s[si]; d[di + 1] = s[si + 1]; d[di + 2] = s[si + 2]; d[di + 3] = s[si + 3];
  }
  dst.ctx.putImageData(img, 0, 0);
}

const hexRgb = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

// Randlicht: Oberkanten (oben frei) kräftig, linke Kanten schwächer zum
// Himmelslicht hin aufhellen. Glühende Pixel (Leucht-Ebene hell) bleiben.
// rim.back: schwacher Glutsaum auf der Leucht-Ebene an Unter-/Rückseiten
// (Widerschein von Glut und Lava), ab Zeile rim.backFrom.
function rimLight(p, g, rim) {
  const { w, h } = p;
  const img = p.ctx.getImageData(0, 0, w, h), d = img.data;
  const gimg = g.ctx.getImageData(0, 0, w, h), gd = gimg.data;
  const op = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) op[i] = d[i * 4 + 3] > 40 ? 1 : 0;
  const [R0, G0, B0] = hexRgb(rim.col);
  const k1 = rim.k1 ?? 0.42, k2 = rim.k2 ?? 0.24;
  const back = rim.back ? hexRgb(rim.back) : null;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!op[i]) continue;
    const j = i * 4;
    if (gd[j + 3] > 0 && gd[j] + gd[j + 1] > 260) continue;
    const up = y > 0 ? op[i - w] : 0, lf = x > 0 ? op[i - 1] : 0, ul = x > 0 && y > 0 ? op[i - w - 1] : 0;
    const k = !up ? k1 : !lf ? k2 : !ul ? k2 * 0.5 : 0;
    if (k) {
      d[j] += (R0 - d[j]) * k; d[j + 1] += (G0 - d[j + 1]) * k; d[j + 2] += (B0 - d[j + 2]) * k;
      continue;
    }
    if (back && y >= (rim.backFrom ?? 0)) {
      const dn = y + 1 < h ? op[i + w] : 0, rt = x + 1 < w ? op[i + 1] : 0;
      if ((!dn || !rt) && gd[j + 3] === 0) { gd[j] = back[0]; gd[j + 1] = back[1]; gd[j + 2] = back[2]; gd[j + 3] = 255; }
    }
  }
  p.ctx.putImageData(img, 0, 0);
  g.ctx.putImageData(gimg, 0, 0);
}

// Baut einen Frame: draw(p, g, P, X) -> meta (Koordinaten im Grundmaß S.W×S.H).
// S.pad = Rand für Schleier/Staub. X.rot = [winkel, drehpunktX, drehpunktY] kippt die
// ganze Figur (Sturz) und setzt sie wieder auf den Boden. X.post zeichnet danach
// ungedreht (liegender Schild). X.fx = Frame-Marke. X.ground = Boden unter der
// Figur wegschneiden (Eingraben): Zeilen ab dieser Höhe (Grundmaß) werden geleert.
function makeFrame(S, draw0, P, X0 = {}) {
  const pad = S.pad ?? 10;
  const G = S.gs;
  const wrap = (q) => (G ? new GeoPC(q, G.s, G.ax, G.ay, S.AX, S.AY) : q);
  const tpt = (m) => (G ? { x: S.AX + (m.x - G.ax) * G.s, y: S.AY + (m.y - G.ay) * G.s } : m);
  const tmeta = (m) => { if (!m || !G) return m; const o = {}; for (const k in m) o[k] = tpt(m[k]); return o; };
  const draw = (p, g, PP) => tmeta(draw0(wrap(p), wrap(g), PP, X0));
  const X = { ...X0 };
  if (G && X0.rot) { const q = tpt({ x: X0.rot[1], y: X0.rot[2] }); X.rot = [X0.rot[0], q.x, q.y]; }
  if (G && X0.ground != null) X.ground = Math.round(S.AY + (X0.ground - G.ay) * G.s);
  if (G && X0.post) X.post = (p, g) => tmeta(X0.post(wrap(p), wrap(g)));
  if (G && X0.rotLift) X.rotLift = Math.round(X0.rotLift * G.s);
  const W = S.W + pad * 2, H = S.H + pad * 2, AX = S.AX + pad, AY = S.AY + pad;
  const g = new PixelCanvas(W, H);
  const meta = {};
  const f = buildFrame(W, H, AX, AY, (p) => {
    if (X.rot && Math.abs(X.rot[0]) > 0.001) {
      const R = 32, HH = H + R * 2;
      const tp = new PixelCanvas(W, HH), tg = new PixelCanvas(W, HH);
      tp.ctx.translate(pad, pad + R); tg.ctx.translate(pad, pad + R);
      const m0 = draw(tp, tg, P, X) || {};
      tp.ctx.setTransform(1, 0, 0, 1, 0, 0); tg.ctx.setTransform(1, 0, 0, 1, 0, 0);
      const [a, rx0, ry0] = X.rot, rx = rx0 + pad, ry = ry0 + pad + R;
      const rp = new PixelCanvas(W, HH), rg = new PixelCanvas(W, HH);
      rotBlit(tp, rp, rx, ry, a); rotBlit(tg, rg, rx, ry, a);
      const dd = rp.ctx.getImageData(0, 0, W, HH).data;
      let bottom = -1;
      for (let y = HH - 1; y >= 0 && bottom < 0; y--) for (let x = 0; x < W; x++) if (dd[(y * W + x) * 4 + 3] > 40) { bottom = y; break; }
      const shift = bottom >= 0 ? (AY - 1) - bottom + (X.rotLift ?? 0) : -R;
      p.ctx.drawImage(rp.canvas, 0, shift); g.ctx.drawImage(rg.canvas, 0, shift);
      const c = Math.cos(a), s = Math.sin(a);
      for (const k in m0) {
        const dx = m0[k].x + pad - rx, dy = m0[k].y + pad + R - ry;
        meta[k] = { x: rx + dx * c - dy * s, y: ry + dx * s + dy * c + shift };
      }
    } else {
      p.ctx.translate(pad, pad); g.ctx.translate(pad, pad);
      const m0 = draw(p, g, P, X) || {};
      p.ctx.setTransform(1, 0, 0, 1, 0, 0); g.ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (const k in m0) meta[k] = { x: m0[k].x + pad, y: m0[k].y + pad };
    }
    if (X.ground != null) {
      p.ctx.clearRect(0, X.ground + pad, W, H); g.ctx.clearRect(0, X.ground + pad, W, H);
    }
    if (X.post) {
      p.ctx.translate(pad, pad); g.ctx.translate(pad, pad);
      const m1 = X.post(p, g) || {};
      p.ctx.setTransform(1, 0, 0, 1, 0, 0); g.ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (const k in m1) meta[k] = { x: m1[k].x + pad, y: m1[k].y + pad };
    }
    rimLight(p, g, S.rim);
  });
  f.glow = new SpriteFrame(g.canvas, AX, AY);
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
    out.push(mk(sample(keys, t), { ...all, ...(extras[i] ?? {}), i }));
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

// Erdklumpen/Funken im Flug: n Teilchen von (x, y) in Richtung a ± spread,
// Weite k (0..1), Bogen nach oben. cols = Farben; glow = Leuchtfarben (optional).
function spray(p, g, x, y, n, a, spreadA, dist, k, seed, cols, glow = null, grav = 1) {
  for (let i = 0; i < n; i++) {
    const aa = a + (hash2(i, 1, seed) - 0.5) * spreadA;
    const v = dist * (0.45 + hash2(i, 2, seed) * 0.7) * k;
    const px = x + Math.cos(aa) * v, py = y + Math.sin(aa) * v + grav * k * k * (3 + hash2(i, 3, seed) * 5);
    const c = cols[Math.floor(hash2(i, 4, seed) * cols.length)];
    p.px(px, py, c);
    if (hash2(i, 5, seed) < 0.45) p.px(px + 1, py, cols[Math.min(cols.length - 1, Math.floor(hash2(i, 6, seed) * cols.length))]);
    if (glow && hash2(i, 7, seed) < 0.35) { p.px(px, py, glow[3]); g.px(px, py, glow[2]); }
  }
}

// ================================================================ Farben

const GLOW_EMBER = ['#7a2208', '#c8420c', '#f07a1c', '#ffb640', '#fff0b0'];
const COLD = ['#48526a', '#a3b0c6', '#eef4ff'];
const COLD_G = ['#2d3548', '#6d7a94'];
const St = PAL.steel, BONE = PAL.bone, CR = PAL.crimson;
const SOIL = ['#140d09', '#22170f', '#332317', '#47321f', '#5d442a', '#775a39', '#93744c'];   // Waldboden, Asche
const DUST_W = ['#4a3e30', '#625342', '#7c6b56', '#3a3026'];
const WOOD = ['#1e130b', '#33210f', '#4c3219', '#684626', '#875d33', '#a5773f'];
const LEA = [PAL.leather[0], PAL.leather[1], PAL.leather[2], PAL.leather[3], '#86603f', '#a07a52'];
const SMOKE = ['#1a1618', '#2a2528', '#3c3539', '#524a4c', '#6c6264'];

// ================================================================ Glutkäfer

// Flacher, gepanzerter Käfer (Länge ~20 px): kohlschwarze Deckflügel mit
// glühenden Rissen, Glut-Horn auf dem Halsschild, glimmende Fühlerkolben.
// Gräbt sich ein (dig), wandert als Erdhügel (mound), bricht hervor (emerge).
const BS = { W: 52, H: 34, AX: 24, AY: 28, pad: 10, rim: { col: '#d8c8b8', k1: 0.3, k2: 0.1 } };
const BS2 = scaleS(BS, 1.35);   // r3: Glutkäfer 1,35× (Rumpf ≥ 12 px)
const CHIT = ['#08060a', '#100c12', '#19141c', '#241c28', '#332836', '#46384a', '#625066'];   // schwarzviolett glänzend
const CHIT_D = ['#060508', '#0d0a0f', '#151118', '#1e1822', '#2a222e'];
const BELLY_B = ['#2a0c06', '#4a160a', '#72240c', '#9c3a12', '#c4561a'];
const MAND = ['#1a100a', '#3a2412', '#5e3c1e', '#8a5e30', '#b08048'];
const B_REST = {
  t: 0, amp: 0, bob: 0, pitch: 0, lunge: 0, jaw: 0.15, wing: 0, heat: 0.5, ant: 0, sink: 0,
  eye: 1, crouch: 0, reach: 0, scrab: 0, shake: 0,
};
const bpose = (o = {}) => ({ ...B_REST, ...o });

// Risse auf den Deckflügeln (lokale Koordinaten, Mitte = 0/0)
const B_CRACKS = [
  [[-5, -1], [-3, 0], [-1, -1]],
  [[0, 1], [2, 0], [3, 1]],
  [[-2, -3], [0, -2]],
];

function drawBeetle(p, g, P, X) {
  const gy = BS.AY, meta = {};
  const cx = BS.AX + P.lunge + (P.shake ? (X.i % 2 ? P.shake : -P.shake) : 0);
  const cy = gy - 5 + P.bob + P.crouch + P.sink;
  const a = -P.pitch, ca = Math.cos(a), sa = Math.sin(a);
  // lokal -> Bild; Drehpunkt hinten unten
  const L = (lx, ly) => { const dx = lx + 6, dy = ly - 2; return { x: cx - 6 + dx * ca - dy * sa, y: cy + 2 + dx * sa + dy * ca }; };
  const heat = P.heat;
  const hot = (v) => GLOW_EMBER[clamp(Math.round(v), 0, 4)];

  // --- Beine: Dreifußgang (vorne/hinten der einen Seite mit der Mitte der anderen)
  const leg = (i, near) => {
    const lx = [-3.5, 0, 3.5][i];
    const hip = L(lx, 2.2);
    const ph = P.t * TAU + (((i + (near ? 0 : 1)) % 2) ? Math.PI : 0);
    const spreadX = [-4.6, 0.6, 4.4][i] + (near ? 0.6 : -0.4);
    let fx = hip.x + spreadX + Math.sin(ph) * 2.2 * P.amp;
    let fy = gy - Math.max(0, Math.cos(ph)) * 1.6 * P.amp;
    if (P.scrab && i === 2) { fx = hip.x + 2.5 + Math.sin(X.i * 2.1 + (near ? 0 : 1.5)) * 1.8 * P.scrab; fy = gy - Math.max(0, Math.cos(X.i * 2.1 + (near ? 0 : 1.5))) * 2 * P.scrab; }
    if (i === 2 && P.reach > 0) {
      fx = fx * (1 - P.reach) + (hip.x + 4.5) * P.reach;
      fy = fy * (1 - P.reach) + (hip.y - 1 - (near ? 0 : 1)) * P.reach;
    }
    fy = Math.min(fy, gy);
    const kx = hip.x + (fx - hip.x) * 0.5 + (i === 0 ? -0.8 : i === 2 ? 0.8 : 0);
    const ky = Math.min(hip.y, fy) - 1.4 + (near ? 0 : 0.5);
    const c1 = near ? MAND[2] : CHIT[3], c2 = near ? MAND[1] : CHIT[2];
    p.line(hip.x, hip.y, kx, ky, c2);
    p.line(kx, ky, fx, fy, c1);
    p.px(kx, ky, near ? MAND[3] : CHIT[4]);
    p.px(fx + (i === 0 ? -1 : 1), fy, near ? MAND[1] : CHIT[1]);
  };
  for (let i = 0; i < 3; i++) leg(i, false);

  // --- ferner Fühler
  const head = L(9.2, 0.6);
  const antenna = (near) => {
    const b0 = L(10.2, -1.2 + (near ? 0 : -0.5));
    const sw = Math.sin(P.ant + (near ? 0 : 1.3)) * 1.2;
    const m = { x: b0.x + 1.4 + sw * 0.2, y: b0.y - 1.6 };
    const tip = { x: b0.x + 3.4 + sw * 0.7, y: b0.y - 2.4 + Math.cos(P.ant * 1.3 + (near ? 0 : 2)) * 0.6 - P.pitch * 2 };
    p.line(b0.x, b0.y, m.x, m.y, near ? MAND[2] : CHIT[3]);
    p.line(m.x, m.y, tip.x, tip.y, near ? MAND[2] : CHIT[3]);
    // Kolben glimmt
    const kc = hot(1 + heat * 2.4 - (near ? 0 : 1));
    p.px(tip.x, tip.y, kc);
    g.px(tip.x, tip.y, hot(heat * 2.5 - (near ? 0.2 : 1.2))); if (near && heat > 0.4) g.px(tip.x + 1, tip.y, GLOW_EMBER[1]);
    return tip;
  };

  // --- Hinterleib (unter den Deckflügeln, glüht bei geöffneten Flügeln)
  const ab = L(-1.2, 1.2);
  ell(p, ab.x, ab.y, 6.6, 2.8, BELLY_B, { rot: a });
  for (let k = -4; k <= 3; k += 2) { const q = L(k, 2.4); p.px(q.x, q.y, BELLY_B[0]); }
  if (P.wing > 0.05) {
    // geöffnete Deckflügel geben den glühenden Hinterleib frei
    for (let k = -5; k <= 4; k++) {
      for (let j = -1; j <= 1; j++) {
        const q = L(k, -0.6 + j);
        const v = (heat * 3.2 + (j === 0 ? 0.6 : 0) - Math.abs(k) * 0.12) * Math.min(1, P.wing * 2.2);
        if (v < 0.6) continue;
        p.px(q.x, q.y, hot(v)); g.px(q.x, q.y, hot(v - 0.6));
      }
      if (k % 2 === 0) { const q = L(k, -0.6); p.px(q.x, q.y, BELLY_B[2]); }
    }
    // Hautflügel fächern nach oben/hinten
    const hw = L(2, -3);
    for (let f = 0; f < 4; f++) {
      const ang = -2.2 - f * 0.28 + a - P.wing * 0.4 + Math.sin(X.i * 2.7 + f) * 0.08;
      const len = (7 + f * 0.6) * P.wing;
      for (let s = 1; s < len; s += 1) {
        const x = hw.x + Math.cos(ang) * s, y = hw.y + Math.sin(ang) * s;
        if ((s + f) % 3 === 0) continue;
        p.px(x, y, s > len - 2 ? '#8a7a72' : f % 2 ? '#4a3c3a' : '#5e4e4a');
      }
    }
  }

  // --- Deckflügel (heben sich um das vordere Scharnier)
  const lift = -P.wing * 0.55;
  const hinge = L(4, -2.5);
  const el = (lx, ly) => {
    const q = L(lx, ly), dx = q.x - hinge.x, dy = q.y - hinge.y, c = Math.cos(lift), s = Math.sin(lift);
    return { x: hinge.x + dx * c - dy * s, y: hinge.y + dx * s + dy * c };
  };
  const ec = el(-1.4, -0.6);
  ell(p, ec.x, ec.y, 6.8, 4.1, CHIT, { rot: a + lift, noise: 0.16, seed: 3 });
  // Längsrippen (dunkel) und Glanz
  for (let k = -5; k <= 4; k++) {
    const r1 = el(k, 0.8), r2 = el(k + 0.5, -1.8);
    if (k % 2 === 0) p.px(r1.x, r1.y, CHIT[1]);
    if (k > -4 && k < 3 && k % 3 !== 0) p.px(r2.x, r2.y, CHIT[2]);
  }
  for (let k = -3; k <= 0; k++) { const q = el(k, -3.4); p.px(q.x, q.y, CHIT[6]); }
  { const q = el(-4, -2.6); p.px(q.x, q.y, CHIT[5]); }
  // Saum der Deckflügel (unten) mit Glut darunter
  for (let k = -6; k <= 4; k++) { const q = el(k, 3.1 - Math.abs(k + 1) * 0.12); p.px(q.x, q.y, k % 3 === 0 ? hot(heat * 2.2) : CHIT[2]); if (k % 3 === 0 && heat > 0.3) g.px(q.x, q.y, GLOW_EMBER[1]); }
  // glühende Risse
  for (const cr of B_CRACKS) {
    for (let s = 0; s < cr.length - 1; s++) {
      const q0 = el(cr[s][0], cr[s][1]), q1 = el(cr[s + 1][0], cr[s + 1][1]);
      const n = Math.max(1, Math.round(Math.hypot(q1.x - q0.x, q1.y - q0.y)));
      for (let k = 0; k <= n; k++) {
        const x = q0.x + (q1.x - q0.x) * k / n, y = q0.y + (q1.y - q0.y) * k / n;
        const v = heat * 3 + 0.4 - (k === 0 || k === n ? 0.5 : 0);
        p.px(x, y, v < 1 ? '#3a1408' : hot(v));
        if (v > 1.2) g.px(x, y, hot(v - 1.1));
      }
    }
  }

  // --- Halsschild mit Glut-Horn
  const pr = L(5.6, -0.6);
  ell(p, pr.x, pr.y, 3.3, 3.0, CHIT, { rot: a, noise: 0.12, seed: 9 });
  { const q = L(4.6, -2.6); p.px(q.x, q.y, CHIT[6]); p.px(q.x + 1, q.y, CHIT[5]); }
  const h0 = L(6.6, -3), h1 = L(7.9, -4.6), h2 = L(8.9, -5.2);
  p.line(h0.x, h0.y, h1.x, h1.y, CHIT[4]); p.px(h0.x - 1, h0.y + 1, CHIT[3]);
  p.line(h1.x, h1.y, h2.x, h2.y, MAND[3]);
  p.px(h2.x, h2.y, hot(1.5 + heat * 2)); g.px(h2.x, h2.y, hot(heat * 2.5));

  // --- Kopf
  ell(p, head.x, head.y, 2.3, 2.0, CHIT.slice(1), { rot: a });
  const eye = L(9.8, -0.3);
  if (P.eye > 0.3) { p.px(eye.x, eye.y, '#ffb640'); g.px(eye.x, eye.y, '#f07a1c'); g.px(eye.x - 1, eye.y, '#5a1804'); }
  else p.px(eye.x, eye.y, CHIT[0]);
  meta.eye = eye;
  meta.head = L(8.5, -7);

  // --- Mandibeln: zwei gekrümmte Zangen
  const jw = P.jaw;
  const mand = (up) => {
    const sgn = up ? -1 : 1;
    const b = L(10.6, 0.8 + sgn * 0.6);
    const m = L(12.4, 0.8 + sgn * (1.2 + jw * 1.5));
    const t = L(13.8 - jw * 0.3, 0.8 + sgn * (jw * 1.3 - 0.4));
    cap(p, b.x, b.y, m.x, m.y, 0.9, 0.6, up ? MAND : MAND.slice(0, 4));
    p.line(m.x, m.y, t.x, t.y, up ? MAND[4] : MAND[3]);
    return t;
  };
  mand(false); const mt = mand(true);
  meta.mouth = mt;
  antenna(true);

  // --- nahe Beine
  for (let i = 0; i < 3; i++) leg(i, true);
  if (X.dust) dust(p, BS.AX + X.dust, gy, 5, 7, DUST_W, 10);
  return meta;
}

// Erdhügel: aufgeworfene Erde mit Klumpen, Rissen (Glut von unten) und Steinchen.
// w/h = Halbbreite/Höhe; ph = Wühlphase; crack = Glut in den Rissen 0..1
function moundShape(p, g, cx, gy, w, h, ph, crack, seed) {
  // Schatten-/Rand-Krümel am Boden
  for (let x = -w - 1; x <= w + 1; x++) if (hash2(x, 3, seed) < 0.55) p.px(cx + x, gy, SOIL[1 + ((x + 9) % 2)]);
  ell(p, cx, gy, w, h, SOIL, { noise: 0.55, seed, clip: (x, y) => y < gy, bias: 0.04 });
  // Klumpen auf der Oberfläche
  for (let i = 0; i < 9; i++) {
    const u = (hash2(i, 1, seed) * 2 - 1) * 0.85;
    const top = gy - h * Math.sqrt(Math.max(0, 1 - u * u));
    const x = cx + u * w, y = top + 0.6 + hash2(i, 2, seed) * h * 0.6;
    ell(p, x, y, 1.3, 1.0, SOIL.slice(2), { noise: 0.3, seed: seed + i });
  }
  // Risse, aus denen Glut scheint
  for (let i = 0; i < 3; i++) {
    const x0 = cx - w * 0.5 + i * w * 0.5 + (hash2(i, 5, seed) - 0.5) * 2;
    const y0 = gy - h * 0.55 + hash2(i, 6, seed) * 1.5;
    for (let k = 0; k < 3; k++) {
      const x = x0 + k * 0.8 - 1, y = y0 + (k % 2) * 0.7;
      const v = crack * 3.2 + 0.3 * Math.sin(ph * TAU + i * 2.1) - (k === 1 ? 0 : 0.8);
      p.px(x, y, v > 1 ? GLOW_EMBER[clamp(Math.round(v), 0, 4)] : SOIL[0]);
      if (v > 1.3) g.px(x, y, GLOW_EMBER[clamp(Math.round(v - 1), 0, 4)]);
    }
  }
  // Steinchen
  for (let i = 0; i < 4; i++) {
    const u = hash2(i, 8, seed) * 1.8 - 0.9;
    const x = cx + u * w * 0.9, y = gy - h * Math.sqrt(Math.max(0, 1 - u * u)) * 0.7 + 1;
    p.px(x, y, '#6e6660'); p.px(x + 1, y, '#4a4440');
  }
}

// rollende Klumpen am Hügel (Phase ph 0..1)
function moundClods(p, cx, gy, w, h, ph, seed) {
  for (let i = 0; i < 5; i++) {
    let f = (ph + i / 5) % 1;
    const back = i % 2 === 0;
    const u = (back ? -1 : 1) * (0.2 + f * 0.95);
    const yTop = gy - h * Math.sqrt(Math.max(0, 1 - Math.min(1, u * u)));
    const x = cx + u * w + (back ? -f * 1.5 : f * 1.5), y = Math.min(gy, yTop - 0.5 + f * 1.2);
    p.px(x, y, SOIL[4 + (i % 2)]); if (i % 2) p.px(x + 1, y, SOIL[3]);
  }
}

function drawMound(p, g, P, X) {
  const gy = BS.AY, cx = BS.AX + P.lunge;
  const w = P.mw, h = P.mh;
  // Spur: aufgewühlte Erde hinter dem Hügel
  for (let k = 0; k < 6; k++) {
    const x = cx - w - 2 - k * 1.6, y = gy - (k % 2) * 0.6;
    if (hash2(k, X.i ?? 0, 11) < 0.7 - k * 0.08) p.px(x, y, SOIL[2 + (k % 2)]);
  }
  moundShape(p, g, cx, gy, w, h, P.ph, P.crack, 17);
  moundClods(p, cx, gy, w, h, P.ph, 5);
  if (P.puff > 0) dust(p, cx - w - 1, gy - 1, 3 + P.puff * 2, 23 + (X.i ?? 0), DUST_W, 6);
  const top = { x: cx, y: gy - h - 1 };
  return { eye: top, head: { x: cx, y: gy - h - 3 }, mouth: top };
}

// Käfer auf dem Rücken (Todes-Endframes): k = Beine einrollen 0..1, heat = Restglut
function drawBeetleBack(p, g, P, X) {
  const gy = BS.AY, cx = BS.AX - 1, cy = gy - 3.6;
  // Deckflügelrand unten (Rücken liegt auf)
  ell(p, cx, cy + 1, 7, 3, CHIT_D);
  // Bauchplatten oben
  ell(p, cx, cy - 0.5, 6.4, 2.8, BELLY_B, { noise: 0.15, seed: 4 });
  for (let k = -4; k <= 4; k += 2) { p.px(cx + k, cy - 1, BELLY_B[1]); p.px(cx + k, cy - 2, BELLY_B[1]); }
  for (let k = -5; k <= 5; k++) if (P.heat > 0.1 && (k + 7) % 3 === 0) { p.px(cx + k, cy + 1.5, GLOW_EMBER[clamp(Math.round(P.heat * 3), 0, 4)]); g.px(cx + k, cy + 1.5, GLOW_EMBER[clamp(Math.round(P.heat * 2.5), 0, 4)]); }
  // Kopf hängt zur Seite, Mandibeln auf
  ell(p, cx + 7.4, cy + 0.6, 2, 1.8, CHIT.slice(1));
  p.line(cx + 9, cy + 1, cx + 11, cy + 2.2, MAND[3]); p.line(cx + 9, cy - 0.2, cx + 11, cy - 1, MAND[3]);
  p.px(cx + 7.8, cy - 0.2, P.heat > 0.2 ? '#c8420c' : CHIT[0]);
  // Beine in die Luft, zappelnd bzw. eingerollt
  for (let i = 0; i < 6; i++) {
    const lx = cx - 3.5 + (i % 3) * 3.5 + (i > 2 ? 0.8 : 0);
    const by = cy - 2.2;
    const wig = Math.sin(P.w + i * 1.9) * 1.4 * (1 - P.k);
    const kx = lx + (i % 3 - 1) * 1.5 + wig * 0.5, ky = by - 3 + P.k * 1.5;
    const fx = kx + (i % 3 - 1) * 1.2 + wig - P.k * (i % 3 - 1) * 2.4 + P.k * 1.2, fy = ky - 1.5 + P.k * 3.2;
    const c = i > 2 ? MAND[2] : CHIT[3];
    p.line(lx, by, kx, ky, c); p.line(kx, ky, fx, fy, c);
  }
  // Antenne
  p.line(cx + 9, cy - 0.5, cx + 12, cy - 3 + P.k, MAND[2]);
  if (P.smoke) for (let i = 0; i < 4; i++) if ((i + Math.round(P.smoke * 3)) % 2 === 0 || i === 0) p.px(cx - 1 + Math.sin(i * 1.4 + P.smoke * 4) * 1.3, cy - 5 - i * 2 - P.smoke * 2, i < 2 ? '#7c7470' : '#5e5652');
  return { eye: { x: cx + 7.8, y: cy - 0.2 }, head: { x: cx + 7, y: cy - 6 } };
}

function beetleAnims() {
  const mk = (P, X) => makeFrame(BS2, drawBeetle, P, X);
  const mkM = (P, X) => makeFrame(BS2, drawMound, P, X);
  const mkB = (P, X) => makeFrame(BS2, drawBeetleBack, P, X);
  // Atmen: Panzer hebt sich, Risse glühen auf, Fühler tasten
  const idle = [];
  for (let i = 0; i < 8; i++) {
    const ph = (i / 8) * TAU, br = (1 - Math.cos(ph)) / 2;
    idle.push(mk(bpose({ t: 0.25, bob: br > 0.5 ? -0.5 : 0, wing: 0.04 + br * 0.08, heat: 0.35 + br * 0.45, ant: ph, jaw: 0.15 + Math.max(0, Math.sin(ph * 2)) * 0.25, crouch: br > 0.75 ? 0 : 0 }), { i }));
  }
  // Krabbeln: Dreifußgang, Körper wiegt
  const walk = [];
  for (let i = 0; i < 6; i++) {
    const ph = (i / 6) * TAU;
    walk.push(mk(bpose({ t: i / 6, amp: 1, bob: Math.abs(Math.sin(ph)) > 0.6 ? -0.5 : 0, pitch: Math.sin(ph * 2) * 0.03, ant: ph * 2, heat: 0.55, jaw: 0.2 }), { i, fx: i % 3 === 0 ? 'step' : null }));
  }
  // Ausholen: Vorderleib bäumt sich auf, Deckflügel klaffen, Glut lodert
  const w0 = bpose({ heat: 0.55, jaw: 0.2 });
  const w1 = bpose({ pitch: 0.18, lunge: -1, wing: 0.35, heat: 0.8, jaw: 0.8, reach: 0.4, ant: 1 });
  const w2 = bpose({ pitch: 0.34, lunge: -2.2, wing: 0.7, heat: 1, jaw: 1.25, reach: 1, ant: 2, crouch: 0.5 });
  const windup = [mk(w0, { i: 0 }), mk(w1, { i: 1 }), mk(w2, { i: 2 }), mk({ ...w2, shake: 0.5 }, { i: 3 })];
  // Biss: Satz nach vorn, Zangen schnappen zu
  const strike = [
    mk(bpose({ pitch: 0.12, lunge: 3, wing: 0.5, heat: 1, jaw: 1.3, reach: 0.6 }), { i: 0 }),
    mk(bpose({ pitch: -0.08, lunge: 6.5, wing: 0.25, heat: 1, jaw: 0, crouch: 0.5 }), { i: 1, fx: 'impact', dust: 9 }),
    mk(bpose({ pitch: -0.03, lunge: 5.5, wing: 0.1, heat: 0.8, jaw: 0.3 }), { i: 2 }),
    mk(bpose({ lunge: 2.5, heat: 0.6, jaw: 0.2 }), { i: 3 }),
  ];
  const hurtP = bpose({ pitch: 0.22, lunge: -2, jaw: 1, wing: 0.15, heat: 0.95, eye: 0, ant: 2.5, shake: 0.5 });
  const hurt = [mk(hurtP, { i: 0 }), mk(mixP(hurtP, bpose({ heat: 0.5 }), 0.55), { i: 1 })];
  const death = [
    mk(hurtP, { i: 0 }),
    mk(bpose({ pitch: 0.55, lunge: -3, bob: -1.5, jaw: 1.3, heat: 0.9, eye: 0, reach: 1, wing: 0.5 }), { i: 1 }),
    mkB({ k: 0, w: 0, heat: 0.8, smoke: 0 }, { i: 2, fx: 'impact', dust: 0 }),
    mkB({ k: 0.15, w: 2.2, heat: 0.6, smoke: 0 }, { i: 3 }),
    mkB({ k: 0.55, w: 4.4, heat: 0.35, smoke: 0.3 }, { i: 4 }),
    mkB({ k: 1, w: 6, heat: 0.12, smoke: 0.7 }, { i: 5 }),
    mkB({ k: 1, w: 6, heat: 0, smoke: 0 }, { i: 6 }),
  ];
  // Eingraben: Kopf voran, Vorderbeine schaufeln, Erde fliegt nach hinten
  const digS = [
    { P: bpose({ pitch: -0.1, scrab: 0.6, heat: 0.6, jaw: 0.6 }), m: 0, s: 0 },
    { P: bpose({ pitch: -0.28, scrab: 1, sink: 2, heat: 0.7, jaw: 0.8 }), m: 0.3, s: 0.35 },
    { P: bpose({ pitch: -0.32, scrab: 1, sink: 5, heat: 0.75, jaw: 0.8, lunge: 0.5 }), m: 0.55, s: 0.7 },
    { P: bpose({ pitch: -0.25, scrab: 1, sink: 8, heat: 0.8, lunge: 1 }), m: 0.8, s: 1 },
    { P: bpose({ pitch: -0.12, sink: 11, heat: 0.8, lunge: 1 }), m: 1, s: 0.7 },
  ];
  const dig = digS.map(({ P, m, s }, i) => mk(P, {
    i, ground: BS.AY, fx: i === 1 ? 'step' : null,
    post: (p, g) => {
      const cx = BS.AX + 1 + P.lunge;
      if (m > 0) moundShape(p, g, cx, BS.AY, 3 + m * 5, 1 + m * 3.2, i / 5, 0.3 * m, 17);
      if (s > 0) spray(p, g, cx - 2, BS.AY - 3, 14, -2.5, 1.2, 12, s, 30 + i, SOIL.slice(2, 6));
      return null;
    },
  }));
  dig.push(mkM({ mw: 8, mh: 4.2, ph: 0, crack: 0.3, puff: 1, lunge: 1 }, { i: 9 }));
  // Hügel wandert: Erde wölbt sich, Klumpen rollen ab, Glut blitzt in Rissen
  const mound = [];
  for (let i = 0; i < 6; i++) {
    const ph = i / 6;
    mound.push(mkM({ mw: 8 + Math.sin(ph * TAU) * 0.6, mh: 4.2 + Math.cos(ph * TAU) * 0.5, ph, crack: 0.35 + Math.max(0, Math.sin(ph * TAU * 2)) * 0.25, puff: i % 3 === 0 ? 1 : 0, lunge: 1 + Math.sin(ph * TAU) * 0.5 }, { i }));
  }
  // Hervorbrechen: Hügel schwillt glühend an, platzt, Käfer schießt heraus
  const emerge = [
    mkM({ mw: 9, mh: 5.5, ph: 0, crack: 1, puff: 0, lunge: 1 }, { i: 0 }),
    mk(bpose({ pitch: 0.65, sink: 8, jaw: 1.3, heat: 1, wing: 0.4, reach: 1, lunge: 1 }), {
      i: 1, ground: BS.AY, fx: 'burst',
      post: (p, g) => { moundShape(p, g, BS.AX + 1, BS.AY, 8, 2.5, 0, 0.8, 19); spray(p, g, BS.AX + 1, BS.AY - 4, 22, -Math.PI / 2, 2.6, 13, 0.6, 41, SOIL.slice(2, 7), GLOW_EMBER); return null; },
    }),
    mk(bpose({ pitch: 0.45, sink: 2, bob: -3, jaw: 1, heat: 1, wing: 0.3, reach: 0.8, lunge: 1.5 }), {
      i: 2, fx: 'impact',
      post: (p, g) => { spray(p, g, BS.AX + 1, BS.AY - 4, 22, -Math.PI / 2, 2.6, 13, 1, 41, SOIL.slice(2, 7), GLOW_EMBER); return null; },
    }),
    mk(bpose({ pitch: 0.12, jaw: 0.6, heat: 0.85, wing: 0.1, lunge: 2 }), {
      i: 3,
      post: (p, g) => { for (let x = -9; x <= 9; x++) if (hash2(x, 1, 7) < 0.7) p.px(BS.AX + 1 + x, BS.AY + (Math.abs(x) > 6 ? 0 : 1), SOIL[2 + (x & 1)]); spray(p, g, BS.AX + 1, BS.AY - 2, 10, -Math.PI / 2, 2.8, 11, 1, 43, SOIL.slice(3, 7), null, 2.2); return null; },
    }),
    mk(bpose({ jaw: 0.3, heat: 0.6, lunge: 2 }), {
      i: 4, dust: 2,
      post: (p) => { for (let x = -7; x <= 7; x++) if (hash2(x, 2, 7) < 0.45) p.px(BS.AX + 1 + x, BS.AY, SOIL[2 + (x & 1)]); return null; },
    }),
  ];
  return {
    idle: new Animation(idle, 7),
    walk: new Animation(walk, 12),
    windup: new Animation(windup, 7, false),
    strike: new Animation(strike, 14, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 9, false),
    dig: new Animation(dig, 9, false),
    mound: new Animation(mound, 8),
    emerge: new Animation(emerge, 10, false),
  };
}

// ================================================================ Schildträger

// Breiter, schwerer Bandit der Aschwald-Bande: Eisenhut mit breiter Krempe,
// rotes Bandentuch vor dem Gesicht, Kettenhemd, Turmschild (Planken,
// Eisenbänder, Bandenzeichen, steckende Pfeile) am nahen Arm, Kriegsbeil
// über der hinteren Schulter. Angriff: Schildstoß. block: Schild hoch.
const SS = { W: 66, H: 52, AX: 28, AY: 46, pad: 10, rim: { col: '#e4d6c0', k1: 0.4, k2: 0.2 } };
const SD = { legH: 10.5, thigh: 5.5, shin: 5.6, spine: 8, upper: 4.4, fore: 4.4, sh: 2.3, hipW: 1.7 };
const S_HOOD = ['#14100e', '#211a16', '#30261f', '#43362b', '#5a4a3b', '#72604c'];
const S_PANTS = ['#110f13', '#1c1820', '#29242d', '#38323c', '#4a434e'];
const S_SKIN = ['#3e2620', ...PAL.skin, '#d8a482'];
const S_PLANK = ['#1a100a', '#2a1a10', '#3c2716', '#52361f', '#6a4828', '#845c34'];
const IRON = ['#14161c', '#22252e', '#343944', '#4c525e', '#6c7380', '#959ca8', '#c4cad2'];
const S_REST = {
  hipX: 0, hipY: 0, lean: 0.08, head: 0, fFx: 3.5, fFy: 0, fBx: -3.5, fBy: 0,
  hFx: 4.5, hFy: 6, hBx: -1.5, hBy: 1.5, wa: -1.95, sTilt: 0.04, hold: 1, eye: 1, cape: 0.1, capeT: 0, duck: 0,
};
const spose = (o = {}) => ({ ...S_REST, ...o });

// Kriegsbeil: Stiel aus Esche, bärtiges Eisenblatt
function drawHatchet(p, g, hx, hy, a) {
  const dx = Math.cos(a), dy = Math.sin(a);
  let nx = -dy, ny = dx; if (ny > 0 || (ny === 0 && nx > 0)) { nx = -nx; ny = -ny; }
  for (let s = -2; s <= 9; s += 0.5) p.px(hx + dx * s, hy + dy * s, s % 2 < 1 ? WOOD[3] : WOOD[4]);
  p.px(hx - dx * 2, hy - dy * 2, IRON[3]);
  // Blatt: am Stielende, Schneide nach "vorn" (nx/ny-Gegenseite)
  const bx = hx + dx * 8.5, by = hy + dy * 8.5;
  const pts = [
    [bx - dx * 1.2, by - dy * 1.2], [bx - dx * 1.5 - nx * 4.2, by - dy * 1.5 - ny * 4.2],
    [bx + dx * 2.2 - nx * 4.6, by + dy * 2.2 - ny * 4.6], [bx + dx * 1.2, by + dy * 1.2],
  ];
  poly(p, pts, (x, y) => {
    const lx = x + 0.5 - bx, ly = y + 0.5 - by, c = -(lx * nx + ly * ny);
    return c > 3.4 ? IRON[6] : c > 2.4 ? IRON[5] : c > 1 ? IRON[4] : IRON[3];
  });
  p.px(bx + dx * 0.2, by + dy * 0.2, IRON[2]); p.px(bx + nx * 0.6, by + ny * 0.6, IRON[5]);
  return { x: bx - nx * 4.4, y: by - ny * 4.4 };
}

// Turmschild: Mitte (x, y), Neigung tilt (+ = Oberkante vorn), Halbmaße hw/hh
function drawTower(p, g, x, y, tilt, hw = 4.8, hh = 10) {
  const c = Math.cos(tilt), s = Math.sin(tilt);
  const W2 = (u, v) => [x + u * c - v * s, y + u * s + v * c];
  const pts = [W2(-hw, -hh + 0.8), W2(-hw + 0.8, -hh), W2(hw - 0.4, -hh + 0.5), W2(hw, -hh + 1.5), W2(hw, hh - 1.5), W2(hw - 0.4, hh - 0.5), W2(-hw + 0.8, hh), W2(-hw, hh - 0.8)];
  poly(p, pts, (px, py) => {
    const lx = px + 0.5 - x, ly = py + 0.5 - y;
    const u = lx * c + ly * s, v = -lx * s + ly * c;
    const un = u / hw;
    // Eisenrand
    if (Math.abs(u) > hw - 0.9 || Math.abs(v) > hh - 0.9) return un < -0.4 ? IRON[5] : v < 0 && Math.abs(v) > hh - 0.9 ? IRON[4] : IRON[2];
    // Eisenbänder
    if (Math.abs(Math.abs(v) - 5) < 0.6) return un < -0.3 ? IRON[4] : IRON[3];
    // Planken mit Fugen
    const pl = Math.floor((u + hw) / 3.2);
    if (((u + hw) % 3.2) < 0.5 && pl > 0) return S_PLANK[0];
    // Bandenzeichen: rote Ascheflamme (Tropfen mit Spitze nach oben), abgeplatzt
    const fv = (v + 3.6) / 7.6, fw = fv < 0 ? -1 : fv < 0.55 ? fv * 4.2 : (1 - fv) * 5.1;
    const fl = Math.abs(u - 0.3 + Math.sin(fv * 4) * 0.4) < fw && fv <= 1;
    if (fl && hash2(px, py, 77) > 0.12) return fv < 0.3 ? CR[4] : un < 0 ? CR[3] : CR[2];
    const lit = 4 - Math.floor((un + 1) * 1.6) + (hash2(px, py, 78) < 0.15 ? -1 : 0);
    return S_PLANK[clamp(lit, 1, 5)];
  });
  // Buckel
  const b = W2(0.3, 0.5);
  p.px(b[0], b[1], IRON[5]); p.px(b[0] + 1, b[1], IRON[3]); p.px(b[0], b[1] + 1, IRON[2]); p.px(b[0] - 0.5, b[1] - 0.6, IRON[6]);
  // Nieten auf den Bändern
  for (const v of [-5, 5]) for (const u of [-2.4, 0, 2.4]) { const q = W2(u, v); p.px(q[0], q[1], IRON[6]); }
  // Kratzer
  const k0 = W2(-2, -7.5), k1 = W2(1, -6.5); p.line(k0[0], k0[1], k1[0], k1[1], S_PLANK[5]);
  // zwei abgebrochene Pfeile stecken im Schild
  const arrow = (u, v, len, ang) => {
    const q = W2(u, v), ax = Math.cos(ang + tilt), ay = Math.sin(ang + tilt);
    p.line(q[0], q[1], q[0] + ax * len, q[1] + ay * len, WOOD[4]);
    p.px(q[0] + ax * len, q[1] + ay * len, BONE[3]); p.px(q[0] + ax * (len - 1), q[1] + ay * (len - 1) - 1, BONE[2]);
  };
  arrow(2.2, -6.8, 4, -0.55); arrow(-2.4, 7, 3, 0.2);
  return { top: { x: W2(0, -hh)[0], y: W2(0, -hh)[1] }, front: { x: W2(hw, 0)[0], y: W2(hw, 0)[1] } };
}

function drawShieldbearer(p, g, P, X) {
  const R = rig(P, SD, SS.AX, SS.AY);
  const { hip, pt, legF, legB, shF, shB, armF, armB } = R;
  const meta = {};
  const neck = pt(SD.spine + 2, 0.6);
  const hx = Math.round(neck.x + P.head), hy = Math.round(neck.y - 3 + P.duck);

  // --- Kapuzenmantel hinten (kurz, schwer)
  const back = pt(SD.spine, -2.4);
  for (let i = 0; i < 6; i++) {
    const len = 8 + (hash2(i, 3, 41) * 3 | 0) - i * 0.4;
    for (let j = 0; j < len; j++) {
      const v = j / len;
      const x = back.x - 0.5 - i * 0.55 - P.cape * 5 * v * v + Math.sin(P.capeT + v * 3 + i) * 0.5 * v;
      const y = back.y + j + i * 0.3;
      p.px(x, y, j >= len - 1.5 ? S_HOOD[i < 2 ? 4 : 2] : i === 0 ? S_HOOD[4] : (i + j) % 4 === 0 ? S_HOOD[1] : S_HOOD[2 + (i < 3 ? 1 : 0)]);
    }
  }

  // --- hinterer Arm mit Beil (hinter dem Körper)
  cap(p, shB.x, shB.y, armB.jx, armB.jy, 1.6, 1.4, S_HOOD.slice(0, 5));
  cap(p, armB.jx, armB.jy, armB.ex, armB.ey, 1.4, 1.3, LEA.slice(0, 4));
  if (X.smear) smearArc(p, g, shB.x, shB.y, X.smear[0], X.smear[1], 5, 14, COLD, COLD_G);
  const axTip = drawHatchet(p, g, armB.ex, armB.ey, P.wa);
  ell(p, armB.ex, armB.ey, 1.3, 1.3, LEA.slice(1));

  // --- hinteres Bein
  cap(p, hip.x - 1.2, hip.y, legB.jx, legB.jy, 2.1, 1.7, S_PANTS.slice(0, 4));
  cap(p, legB.jx, legB.jy, legB.ex, legB.ey - 1.8, 1.7, 1.6, LEA.slice(0, 4));
  p.rect(legB.ex - 1.5, legB.ey - 1, 4, 1, LEA[0]); p.px(legB.ex + 2.5, legB.ey - 1, LEA[1]);

  // --- Rumpf: Wams + Kettenhemd, breit
  const hp = pt(0, 0), cp = pt(SD.spine, 0.2);
  const q = (u, k, c) => { const o = pt(u, k); p.px(o.x, o.y, c); };
  cap(p, hp.x, hp.y, cp.x, cp.y, 3.6, 4.2, IRON.slice(0, 6), { noise: 0.2, seed: 12 });
  // Kettenringe
  for (let u = 1; u <= 8; u += 1) for (let k = -3.5; k <= 3.5; k += 1) if ((Math.round(u) + Math.round(k + 4)) % 2 === 0) q(u, k, IRON[1]);
  // Kettenhemd-Saum, darunter Wams-Schöße
  for (let k = -3.5; k <= 3.5; k += 0.5) { q(-0.6, k, IRON[4]); q(-1.6, k, Math.round(k * 2) % 3 === 0 ? S_HOOD[1] : S_HOOD[3]); q(-2.4, k, S_HOOD[2]); }
  // breiter Gürtel mit Schnalle
  for (let k = -3.8; k <= 3.8; k += 0.5) { q(1.2, k, LEA[2]); q(1.8, k, LEA[3]); }
  q(1.5, 2.5, '#c8a050'); q(1.5, 3.1, '#806030');
  // Schulterpanzer (Leder, hintere Schulter) + Kapuzenkragen
  ell(p, shB.x - 0.3, shB.y + 0.3, 2.6, 2, LEA.slice(1, 6));
  const col = pt(SD.spine + 0.3, -0.4);
  ell(p, col.x, col.y, 4.4, 2.0, S_HOOD.slice(1), { noise: 0.25, seed: 4 });

  // --- vorderes Bein (Kniekachel aus Eisen)
  cap(p, hip.x + 1.2, hip.y, legF.jx, legF.jy, 2.2, 1.8, S_PANTS);
  cap(p, legF.jx, legF.jy, legF.ex, legF.ey - 1.8, 1.8, 1.7, LEA);
  p.rect(legF.ex - 1.5, legF.ey - 1, 5, 1, LEA[1]); p.px(legF.ex + 3, legF.ey - 2, LEA[3]);
  ell(p, legF.jx + 0.4, legF.jy, 1.5, 1.4, IRON.slice(2));

  // --- Kopf: Eisenhut mit breiter Krempe, Bandentuch
  ell(p, hx + 0.5, hy + 0.5, 3.0, 3.2, S_SKIN);
  // Tuch über Nase/Mund
  for (let x = -1; x <= 3; x++) for (let y = 1; y <= 3; y++) p.px(hx + x + (y > 2 ? 0.5 : 0), hy + y, y === 1 ? CR[3] : x % 2 ? CR[2] : CR[1]);
  p.px(hx + 4, hy + 2, CR[2]);
  p.line(hx - 1, hy + 2, hx - 3 - P.cape * 2, hy + 4, CR[1]); p.px(hx - 3 - P.cape * 2, hy + 5, CR[2]); // Tuchzipfel
  // Augenschatten unter der Krempe
  p.px(hx + 1, hy, S_SKIN[0]); p.px(hx + 3, hy, S_SKIN[1]);
  if (P.eye > 0.5) { p.px(hx + 2, hy, '#f0e6d0'); p.px(hx + 3, hy, '#1a0a06'); }
  else { p.px(hx + 2, hy, S_SKIN[0]); }
  meta.eye = { x: hx + 2, y: hy };
  meta.mouth = { x: hx + 4, y: hy + 2 };
  // Hut: Kalotte + Krempe (leicht nach vorn geneigt)
  ell(p, hx + 0.4, hy - 2.6, 3.4, 2.6, IRON, { noise: 0.1, seed: 2 });
  p.px(hx + 0.4, hy - 5.2, IRON[2]); p.px(hx - 1, hy - 4.2, IRON[6]);
  for (let x = -5; x <= 5; x++) {
    const y = hy - 1 + (x > 2 ? 0.5 : 0) + (x < -3 ? -0.4 : 0);
    p.px(hx + 0.4 + x, y, x < -2 ? IRON[5] : IRON[4]);
    p.px(hx + 0.4 + x, y + 1, IRON[1]);
  }
  p.px(hx - 2, hy - 2, IRON[6]); p.px(hx + 1, hy - 2, IRON[2]); p.px(hx + 3, hy - 2, IRON[5]); // Nieten am Band
  meta.head = { x: hx, y: hy - 6 };

  // --- naher Arm + Turmschild
  const shield = () => {
    cap(p, shF.x, shF.y, armF.jx, armF.jy, 1.8, 1.5, S_HOOD);
    cap(p, armF.jx, armF.jy, armF.ex, armF.ey, 1.5, 1.4, LEA);
    ell(p, shF.x, shF.y, 2.3, 1.9, IRON.slice(1, 7));       // Schulterkachel
    if (P.hold > 0.5) {
      const sh = drawTower(p, g, armF.ex + 2.2, armF.ey + 0.5, P.sTilt);
      meta.hand = sh.front; meta.tip = sh.front;
    } else {
      ell(p, armF.ex, armF.ey, 1.3, 1.3, S_SKIN.slice(1));
      meta.hand = { x: armF.ex, y: armF.ey };
    }
  };
  shield();
  meta.axe = axTip;
  if (X.streak) {
    // Wucht-Striche hinter dem Schild
    for (let i = 0; i < 5; i++) {
      const y = armF.ey - 7 + i * 3.5, x0 = armF.ex - 4 - hash2(i, 1, 9) * 3, len = 3 + hash2(i, 2, 9) * 4 * X.streak;
      p.line(x0 - len, y, x0, y, i % 2 ? '#b8ae9c' : '#8a8070');
    }
  }
  if (X.dust) dust(p, SS.AX + X.dust, SS.AY, 8, 5, DUST_W, 14);
  return meta;
}

// Liegender Turmschild (Tod)
function drawTowerFlat(p, g, x, gy, k) {
  // gekippt: Draufsicht stark gestaucht, Planken quer
  const h = 3 - k * 1.2, w = 9.5;
  poly(p, [[x - w, gy - h], [x + w, gy - h - 0.5], [x + w, gy], [x - w, gy]], (px, py) => {
    const v = (py + 0.5 - (gy - h)) / (h + 0.5);
    if (Math.abs(px + 0.5 - x) > w - 1 || v < 0.25) return v < 0.25 ? IRON[5] : IRON[2];
    if (Math.abs(Math.abs(px + 0.5 - x) - 5) < 0.6) return IRON[3];
    if (Math.abs(px + 0.5 - x) < 1.6 && v > 0.3) return CR[2];
    return S_PLANK[v > 0.7 ? 2 : 4];
  });
  p.px(x, gy - h * 0.5, IRON[5]);
  p.line(x + 3, gy - h, x + 5, gy - h - 3, WOOD[4]); p.px(x + 5, gy - h - 3, BONE[3]);
}

function shieldbearerAnims() {
  const mk = (P, X) => makeFrame(SS, drawShieldbearer, P, X);
  const idleA = spose();
  const idleB = { ...idleA, hipY: 1, lean: 0.11, hFy: 6.6, hBy: 2, head: 0.3, capeT: Math.PI, wa: -1.88, sTilt: 0.06 };
  const idle = track(mk, [[0, idleA], [0.5, idleB], [1, idleA]], 6, { loop: true });
  // schwerer Schritt: Schild vorn, Körper sackt bei jedem Auftritt ein
  const walkKeys = [];
  for (let i = 0; i <= 8; i++) {
    const ph = (i / 8) * TAU, s = Math.sin(ph), c = Math.cos(ph);
    walkKeys.push([i / 8, {
      ...idleA, hipY: Math.abs(s) < 0.4 ? 1.2 : -0.3, lean: 0.12, fFx: 1.5 + s * 4, fFy: Math.max(0, -c) * 1.8,
      fBx: -1.5 - s * 4, fBy: Math.max(0, c) * 1.8, hFx: 5 - s * 0.6, hFy: 6 - Math.abs(c) * 0.6, hBx: -1.5 + s * 0.8,
      cape: 0.35, capeT: ph, head: 0.3, sTilt: 0.04 + s * 0.03, wa: -1.95 + s * 0.06,
    }, linear]);
  }
  const walk = track(mk, walkKeys, 8, { loop: true, extras: { 0: { fx: 'step' }, 4: { fx: 'step' } } });
  // Ausholen: Gewicht nach hinten, Schild an die Schulter gezogen, tief geduckt
  const w1 = spose({ hipX: -1, hipY: 1, lean: -0.02, hFx: 2.5, hFy: 4.5, sTilt: -0.06, fFx: 5, fBx: -4.5, wa: -2.25, hBx: -3, hBy: -0.5, cape: 0.2 });
  const w2 = spose({ hipX: -2.5, hipY: 2.2, lean: -0.1, hFx: 1.5, hFy: 4, sTilt: -0.12, fFx: 6.5, fBx: -5, wa: -2.45, hBx: -4, hBy: -1.5, cape: 0.35, capeT: 1, duck: 0.5 });
  const windup = track(mk, [[0, idleA], [0.5, w1], [1, w2]], 4);
  // Schildstoß: Satz nach vorn, Schild vorgerammt
  const s1 = spose({ hipX: 2, hipY: 0.5, lean: 0.25, hFx: 8, hFy: 4.5, sTilt: 0.12, fFx: 8, fBx: -4, wa: -1.8, cape: 0.7, capeT: 2 });
  const s2 = spose({ hipX: 4.5, hipY: 1, lean: 0.34, hFx: 9.5, hFy: 4.8, sTilt: 0.2, fFx: 9.5, fBx: -3, wa: -1.9, cape: 0.9, capeT: 3 });
  const s3 = spose({ hipX: 3.5, hipY: 1, lean: 0.24, hFx: 7.5, hFy: 5.5, sTilt: 0.1, fFx: 8.5, fBx: -2.5, wa: -1.85, cape: 0.5, capeT: 4 });
  const strike = [mk(s1, {}), mk(s2, { fx: 'impact', dust: 12 }), mk(s3, {}), mk(mixP(s3, idleA, 0.6), {})];
  // Block: tief hinter dem Schild, Schild hoch bis unter die Krempe
  const b0 = spose({ hipY: 3.2, lean: 0.2, hFx: 5.5, hFy: 0.2, sTilt: 0.07, fFx: 5.5, fBx: -5, duck: 1.5, head: -0.5, wa: -2.2, hBx: -3, hBy: 0.5 });
  const block = [0, 1, 2, 3].map((i) => mk({ ...b0, hipY: b0.hipY + (i % 2) * 0.6, hFy: b0.hFy + (i === 2 ? 0.5 : 0), sTilt: b0.sTilt + (i === 1 ? 0.03 : 0), capeT: i }, { i }));
  const hurtP = spose({ hipX: -1.5, lean: -0.2, head: -0.8, hFx: 3, hFy: 7, sTilt: -0.2, eye: 0, wa: -2.3, fFx: 5, cape: -0.2 });
  const hurt = [mk(hurtP), mk(mixP(hurtP, idleA, 0.5))];
  // Tod: Schild entgleitet und fällt nach vorn, der Bandit kippt rücklings
  const flat = (k) => (p, g) => { drawTowerFlat(p, g, SS.AX + 12, SS.AY, k); return null; };
  const d1 = spose({ ...hurtP, hipY: 1, lean: -0.25, hFy: 9, hFx: 4, sTilt: 0.5 });
  const d2 = spose({ ...hurtP, hold: 0, hipY: 3.5, lean: -0.1, hFx: 3, hFy: 9, fFx: 4, fBx: -2, wa: -1.2, hBx: -5, hBy: 4 });
  const piv = [SS.AX - 3, SS.AY - 1];
  const death = [
    mk(hurtP),
    mk(d1),
    mk(d2, { post: flat(0) , fx: 'impact' }),
    mk({ ...d2, hipY: 4 }, { rot: [-0.55, ...piv], post: flat(0.5) }),
    mk({ ...d2, hipY: 3, lean: 0 }, { rot: [-1.2, ...piv], post: flat(1) }),
    mk({ ...d2, hipY: 3, lean: 0, eye: 0, hFy: 10 }, { rot: [-1.4, ...piv], post: flat(1), fx: 'impact' }),
  ];
  return {
    idle: new Animation(idle, 5),
    walk: new Animation(walk, 9),
    windup: new Animation(windup, 7, false),
    strike: new Animation(strike, 13, false),
    block: new Animation(block, 6),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 8, false),
  };
}

// ================================================================ Schlackensprenger

// Gebückter Minenarbeiter der Schlackenhöhen mit einem Pulverfass auf dem
// Rücken: Lederkappe mit Bernstein-Schutzbrille, rußgeschwärzt, lange Arme,
// Riemen über der Brust, Lunte oben aus dem Fass (meta.fuse = Luntenspitze).
// walk: Lunte aus; fuse: rennt mit brennender Lunte; windup: zündet;
// strike: Explosion (Figur vergeht im Feuerball); death: bricht zusammen,
// das Fass rollt fort, die Lunte verlischt.
const PS = { W: 60, H: 48, AX: 28, AY: 42, pad: 12, rim: { col: '#e8d4bc', k1: 0.4, k2: 0.2, back: '#2c0c02', backFrom: 0 } };
const PS2 = scaleS(PS, 1.35);   // r3: Sprenger 1,35× (Rumpf ≥ 10 px)
const PX = { W: 92, H: 78, AX: 45, AY: 62, pad: 6, rim: { col: '#e8d4bc', k1: 0.25, k2: 0.1 } };
const PD = { legH: 8.4, thigh: 4.4, shin: 4.6, spine: 6.6, upper: 4.2, fore: 4.6, sh: 1.5, hipW: 1.2 };
const P_CLOTH = ['#0e0d10', '#18161a', '#242126', '#322e34', '#433e46', '#58525a'];   // rußiges Schiefergrau
const P_SKIN = ['#2a1e1a', '#4a362e', '#6a4e42', '#8a6a5a', '#a88874'];
const P_KEG = ['#3a200c', '#5a3414', '#7a4a1c', '#9a6226', '#b87c34', '#d49a4a'];
const P_CAP = ['#120c09', '#1e1510', '#2e2118', '#433022', '#5a4230'];
const BRASS = ['#2e1c08', '#5a3a12', '#8a6020', '#c09038', '#e8c060'];
const P_REST = {
  hipX: 0, hipY: 0, lean: 0.55, head: 0, headY: 0, fFx: 3, fFy: 0, fBx: -3, fBy: 0,
  hFx: 3, hFy: 9, hBx: 1, hBy: 8, keg: 0, lit: 0, fuse: 1, eye: 1, jaw: 0, fl: 0, cape: 0, kegOn: 1,
};
const ppose = (o = {}) => ({ ...P_REST, ...o });

function drawSapper(p, g, P, X) {
  const R = rig(P, PD, PS.AX, PS.AY);
  const { hip, pt, legF, legB, shF, shB, armF, armB } = R;
  const meta = {};
  const i = X.i ?? 0;

  // --- hinterer Arm (fern, dunkel)
  cap(p, shB.x, shB.y, armB.jx, armB.jy, 1.2, 1.0, P_CLOTH.slice(0, 4));
  cap(p, armB.jx, armB.jy, armB.ex, armB.ey, 1.0, 1.0, P_SKIN.slice(0, 3));
  ell(p, armB.ex, armB.ey, 1.4, 1.3, P_CAP.slice(0, 4));

  // --- hinteres Bein
  cap(p, hip.x - 1, hip.y, legB.jx, legB.jy, 1.6, 1.3, P_CLOTH.slice(0, 4));
  cap(p, legB.jx, legB.jy, legB.ex, legB.ey - 1.4, 1.3, 1.3, P_CAP.slice(0, 4));
  p.rect(legB.ex - 1, legB.ey - 1, 3, 1, P_CAP[0]);

  // --- Pulverfass auf dem Rücken (Achse entlang der Wirbelsäule)
  if (P.kegOn > 0.5) {
  const ka = P.lean + P.keg;
  const ku = { x: Math.sin(ka), y: -Math.cos(ka) };          // Fassachse (nach oben)
  const kn = { x: Math.cos(ka), y: Math.sin(ka) };           // quer (nach vorn)
  const kc0 = pt(PD.spine * 0.55, -4.0);
  const kc = { x: kc0.x - kn.x * 0.4, y: kc0.y - kn.y * 0.4 };
  const KH = 5.8, KR = 4.1;
  // Mantel: gewölbt, Dauben längs, zwei Eisenreifen
  const kpts = [];
  for (let s = -KH; s <= KH; s += 1) { const b = KR * (0.86 + 0.14 * Math.cos((s / KH) * 1.4)); kpts.push([kc.x + ku.x * s - kn.x * b, kc.y + ku.y * s - kn.y * b]); }
  for (let s = KH; s >= -KH; s -= 1) { const b = KR * (0.86 + 0.14 * Math.cos((s / KH) * 1.4)); kpts.push([kc.x + ku.x * s + kn.x * b, kc.y + ku.y * s + kn.y * b]); }
  poly(p, kpts, (x, y) => {
    const lx = x + 0.5 - kc.x, ly = y + 0.5 - kc.y;
    const s = lx * ku.x + ly * ku.y, c = lx * kn.x + ly * kn.y;
    const cn = c / KR;
    if (Math.abs(Math.abs(s) - 3.4) < 0.5) return cn < -0.3 ? IRON[3] : IRON[1];
    if (Math.abs(s) < 1.1 && cn > -0.6) return cn < 0 ? '#b8402a' : '#8a2a1c';   // rotes Warnband
    const stave = Math.round((c + KR) / 1.9);
    const lit = 4 - Math.floor((cn + 1) * 1.7) + (stave % 2 ? 0 : -1) + (hash2(x, y, 51) < 0.08 ? -1 : 0);
    return P_KEG[clamp(lit, 1, 5)];
  });
  // Deckel oben
  const top = { x: kc.x + ku.x * (KH + 0.2), y: kc.y + ku.y * (KH + 0.2) };
  ell(p, top.x, top.y, 3.4, 1.2, P_KEG.slice(2), { rot: ka });
  p.px(top.x - kn.x * 1.5, top.y - kn.y * 1.5, P_KEG[5]);
  // Lunte: geschwungene Schnur, brennend mit Funken
  const fl = 1.5 + 6.5 * P.fuse;
  const fb = { x: top.x + kn.x * 0.6 + ku.x * 0.5, y: top.y + kn.y * 0.6 + ku.y * 0.5 };
  let tip = fb;
  for (let s = 0; s <= fl; s += 0.5) {
    const f = s / 8;
    const wob = Math.sin(f * 5 + P.fl) * 1.2 * f;
    const x = fb.x - kn.x * (f * 4.5 - wob) + ku.x * (f * 6.5 - f * f * 3.5);
    const y = fb.y - kn.y * (f * 4.5 - wob) + ku.y * (f * 6.5 - f * f * 3.5) + f * f * 1.5;
    p.px(x, y, (Math.round(s * 2) % 3 === 0) ? '#8a7a5c' : '#6a5a40');
    tip = { x, y };
  }
  if (P.lit > 0.5) {
    p.px(tip.x, tip.y, '#fff0b0'); g.px(tip.x, tip.y, '#fff0b0');
    for (const [dx, dy, c] of [[-1, 0, 3], [1, 0, 2], [0, -1, 3], [0, 1, 1]]) { p.px(tip.x + dx, tip.y + dy, GLOW_EMBER[c]); g.px(tip.x + dx, tip.y + dy, GLOW_EMBER[c - 1]); }
    // Funken stieben (je Frame anders)
    for (let k = 0; k < 7; k++) {
      const a = hash2(k, i, 61) * TAU, r = 1.5 + hash2(k, i, 62) * 4 * P.lit;
      const x = tip.x + Math.cos(a) * r, y = tip.y + Math.sin(a) * r * 0.8 - hash2(k, i, 63) * 1.5;
      const c = GLOW_EMBER[2 + (k % 3)];
      p.px(x, y, c); g.px(x, y, GLOW_EMBER[1 + (k % 3)]);
    }
    // Rauchfaden
    for (let k = 1; k < 5; k++) p.px(tip.x - k * 0.8 - P.cape * k, tip.y - 1.5 - k * 1.3 + Math.sin(k + i) * 0.6, SMOKE[4 - Math.min(3, k)]);
  } else {
    p.px(tip.x, tip.y, '#2a2420');
  }
  meta.fuse = tip;
  }

  // --- Rumpf: gebückt, Lederwams, Russflecken
  const hp = pt(0, 0), cp = pt(PD.spine, 0.6);
  cap(p, hp.x, hp.y, cp.x, cp.y, 2.7, 3.1, P_CLOTH, { noise: 0.22, seed: 21 });
  const q = (u, k, c) => { const o = pt(u, k); p.px(o.x, o.y, c); };
  for (let k = 0; k < 6; k++) q(1 + hash2(k, 1, 23) * 5, -2 + hash2(k, 2, 23) * 4, P_CLOTH[0]);
  // Riemen über die Brust zum Fass
  for (let u = 1; u <= 6.5; u += 0.5) { q(u, 1.4 - (u - 1) * 0.55, LEA[3]); }
  q(4, 0.05, BRASS[3]);
  for (let k = -2.6; k <= 2.6; k += 0.5) q(0.8, k, LEA[2]);
  // Schürze vorn (versengtes Leder)
  const ap0 = pt(0.6, 2.4), ap1 = pt(-4.2, 3.6 + P.cape);
  cap(p, ap0.x, ap0.y, ap1.x, ap1.y, 1.4, 1.8, LEA.slice(0, 5));
  p.px(ap1.x, ap1.y + 1, LEA[0]); p.px(ap1.x - 1, ap1.y + 1.5, P_CLOTH[0]);

  // --- vorderes Bein
  cap(p, hip.x + 1, hip.y, legF.jx, legF.jy, 1.7, 1.4, P_CLOTH);
  cap(p, legF.jx, legF.jy, legF.ex, legF.ey - 1.4, 1.4, 1.4, P_CAP);
  p.rect(legF.ex - 1, legF.ey - 1, 4, 1, P_CAP[1]); p.px(legF.ex + 2.5, legF.ey - 2, P_CAP[3]);

  // --- Kopf: weit vorgeschoben, tief
  const neck = pt(PD.spine + 1.2, 1.4);
  const hx = Math.round(neck.x + 2.2 + P.head), hy = Math.round(neck.y - 1.6 + P.headY);
  // Haarbüschel (versengt) hinten
  for (let k = 0; k < 4; k++) p.line(hx - 2, hy - 1 + k * 0.6, hx - 4 - k * 0.4 - P.cape, hy - 2 + k * 1.2, k % 2 ? '#2a201a' : '#40302a');
  ell(p, hx + 0.5, hy + 0.5, 3.2, 3.1, P_SKIN);
  p.px(hx + 3.5, hy + 1, P_SKIN[3]);   // Nase
  // Halstuch (aschgrau, hell) vor Mund und Nase
  for (let x = -1; x <= 3; x++) { p.px(hx + x, hy + 2, x % 2 ? '#8e867c' : '#a49a8e'); p.px(hx + x - 0.5, hy + 3, '#6e665e'); }
  p.px(hx - 2, hy + 3, '#8e867c'); p.px(hx - 3 - P.cape, hy + 4, '#6e665e');
  if (P.jaw > 0.4) { p.px(hx + 2, hy + 2, '#1a0a08'); p.px(hx + 3, hy + 2, '#3a2420'); }
  // Lederkappe (dunkel) mit Ohrenklappe
  ell(p, hx + 0.1, hy - 2.1, 3.3, 1.8, ['#0c0a0a', '#161212', '#221c1a', '#302724', '#40352f'], { noise: 0.1, seed: 3 });
  p.rect(hx - 2, hy - 0.5, 1, 2.5, '#221c1a');
  // Schutzbrille: zwei runde Gläser in Messing (glimmen)
  const gx = hx + 2, gyy = hy - 0.4;
  p.px(gx - 2, gyy, BRASS[2]); p.px(gx - 1, gyy - 1, BRASS[3]); p.px(gx + 2, gyy - 1, BRASS[2]);
  p.px(gx + 2, gyy, BRASS[1]);
  const lens = P.eye > 0.5 ? (P.lit > 0.5 ? '#ffe080' : '#f0a840') : '#4a3018';
  p.px(gx - 1, gyy, P.eye > 0.5 ? '#c07020' : '#3a2410'); p.px(gx, gyy, BRASS[3]); p.px(gx + 1, gyy, lens);
  if (P.eye > 0.5) { g.px(gx + 1, gyy, P.lit > 0.5 ? '#f0a040' : '#9a5212'); g.px(gx - 1, gyy, '#5a2a08'); }
  p.line(hx - 2.5, hy - 0.4, gx - 2, gyy, BRASS[1]);       // Brillenband
  meta.eye = { x: gx + 1, y: gyy };
  meta.mouth = { x: hx + 3, y: hy + 2 };
  meta.head = { x: hx, y: hy - 5 };

  // --- naher Arm: lang, dicker Handschuh (Feuerstein in der Faust)
  cap(p, shF.x, shF.y, armF.jx, armF.jy, 1.4, 1.2, P_CLOTH);
  cap(p, armF.jx, armF.jy, armF.ex, armF.ey, 1.2, 1.1, P_SKIN);
  const gl0 = { x: armF.jx + (armF.ex - armF.jx) * 0.55, y: armF.jy + (armF.ey - armF.jy) * 0.55 };
  cap(p, gl0.x, gl0.y, armF.ex, armF.ey, 1.5, 1.6, P_CAP);
  ell(p, armF.ex, armF.ey, 1.8, 1.7, P_CAP.slice(1));
  p.px(armF.ex + 1, armF.ey - 1, '#8a909a'); p.px(armF.ex + 1.5, armF.ey - 1.5, '#c4cad2'); // Feuerstahl
  meta.hand = { x: armF.ex, y: armF.ey };
  if (X.strikeSpark) {
    const sx = armF.ex + 1, sy = armF.ey - 2;
    for (let k = 0; k < 9; k++) {
      const a = -Math.PI / 2 + (hash2(k, 1, 71) - 0.5) * 3.2, r = 1 + hash2(k, 2, 71) * 5;
      p.px(sx + Math.cos(a) * r, sy + Math.sin(a) * r, GLOW_EMBER[2 + (k % 3)]); g.px(sx + Math.cos(a) * r, sy + Math.sin(a) * r, GLOW_EMBER[2 + (k % 2)]);
    }
    p.px(sx, sy, '#fff0b0'); g.px(sx, sy, '#fff0b0');
  }
  if (X.dust) dust(p, PS.AX + X.dust, PS.AY, 6, 13, DUST_W, 10);
  return meta;
}

// Feuerball mit ausgefranstem Rand; k = Alter 0..1 (heiß -> Rauch)
function fireball(p, g, cx, cy, r, k, seed) {
  const R = Math.ceil(r) + 3;
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
    const a = Math.atan2(y, x);
    const edge = r * (0.9 + 0.07 * Math.sin(a * 5 + seed) + 0.05 * Math.sin(a * 11 + seed * 2)) + (hash2(x, y, seed) - 0.5) * 1.4;
    const d = Math.hypot(x, y * 1.15);
    if (d > edge) continue;
    const f = d / edge;                      // 0 Mitte .. 1 Rand
    const h = 1 - f * 0.9 - k * 1.1 + (hash2(x + 40, y + 40, seed + 1) - 0.5) * 0.25;
    let c, gc = null;
    if (h > 0.75) { c = '#fffbe0'; gc = '#fff0b0'; }
    else if (h > 0.55) { c = '#ffd860'; gc = '#ffb640'; }
    else if (h > 0.35) { c = '#f89028'; gc = '#f07a1c'; }
    else if (h > 0.15) { c = '#c8420c'; gc = '#7a2208'; }
    else if (h > -0.05) { c = '#6a1c0a'; }
    else c = SMOKE[clamp(Math.floor((1 - f) * 3 + 1 - k), 1, 4)];
    p.px(cx + x, cy + y, c);
    if (gc) g.px(cx + x, cy + y, gc);
  }
}

// Trümmer: Fassdauben, Reifenstücke, Glutbrocken
function debris(p, g, cx, cy, k, seed) {
  for (let n = 0; n < 10; n++) {
    const a = -Math.PI * (0.1 + hash2(n, 1, seed) * 0.8) + (n % 2 ? 0 : Math.PI * 0.05);
    const v = (14 + hash2(n, 2, seed) * 16) * k;
    const x = cx + Math.cos(a) * v, y = cy + Math.sin(a) * v * 0.8 + k * k * 18;
    const kind = n % 3;
    if (kind === 0) { const r = hash2(n, 3, seed) * 3; p.line(x, y, x + Math.cos(r) * 2.5, y + Math.sin(r) * 2.5, P_KEG[3]); }
    else if (kind === 1) { p.px(x, y, IRON[3]); p.px(x + 1, y, IRON[4]); }
    else { p.px(x, y, GLOW_EMBER[3]); g.px(x, y, GLOW_EMBER[2]); }
  }
}

// Bodenbrand nach der Explosion
function scorch(p, g, cx, gy, w, ember, seed) {
  for (let x = -w; x <= w; x++) for (let y = -2; y <= 1; y++) {
    const e = (x * x) / (w * w) + (y * y) / 4;
    if (e > 1 || hash2(x, y, seed) < e * 0.6) continue;
    p.px(cx + x, gy + y, e < 0.35 ? '#0e0a0a' : '#1c1414');
    if (ember > 0 && hash2(x, y, seed + 1) < 0.08 * ember) { p.px(cx + x, gy + y, GLOW_EMBER[2]); g.px(cx + x, gy + y, GLOW_EMBER[1]); }
  }
}

function drawBlast(p, g, P, X) {
  const cx = PX.AX + 1, gy = PX.AY, cy = gy - 9 - P.rise;
  const seed = 7 + X.i;
  if (P.scorch) scorch(p, g, cx, gy, 11, P.ember, 3);
  if (P.smoke > 0) {
    // Rauchwolke: mehrere Ballen, steigen auf
    for (let n = 0; n < 7; n++) {
      const a = (n / 7) * TAU + 0.3;
      const rr = P.r * 0.55 + P.smoke * 4;
      const ex = cx + Math.cos(a) * rr, ey = cy + Math.sin(a) * rr * 0.6 - P.smoke * 3;
      const rx = 3.5 + P.smoke * 2 + hash2(n, 1, 9) * 2.5, ry = 3 + P.smoke * 1.6;
      ell(p, ex, ey, rx, ry, SMOKE, { noise: 0.45, seed: n + 3, bias: -0.05, clip: (x, y, u, v) => u * u + v * v < 0.55 || hash2(x, y, n + 90) > (u * u + v * v - 0.55) * 2.2 + P.smoke * 0.25 });
    }
  }
  if (P.r > 0) fireball(p, g, cx, cy, P.r, P.k, seed);
  if (P.deb > 0) debris(p, g, cx, cy, P.deb, 13);
  if (P.ring > 0) {
    // Druckwelle am Boden
    for (let a = 0; a < TAU; a += 0.08) {
      const x = cx + Math.cos(a) * P.ring, y = gy + Math.sin(a) * P.ring * 0.35;
      if (hash2(Math.round(a * 20), 1, 4) < 0.6) p.px(x, y, a > Math.PI ? DUST_W[2] : DUST_W[1]);
    }
  }
  if (P.wisp > 0) for (let n = 0; n < 6; n++) {
    const x = cx - 6 + n * 2.4 + Math.sin(n * 1.7 + P.wisp * 3) * 1.5, y = gy - 4 - P.wisp * 10 - hash2(n, 2, 5) * 8;
    p.px(x, y, SMOKE[2 + (n % 3)]); p.px(x + 1, y - 1, SMOKE[2]);
  }
  const c = { x: cx, y: cy };
  return { eye: c, head: { x: cx, y: cy - P.r }, fuse: c, mouth: c };
}

// Liegendes Fass mit verlöschender Lunte (Tod)
function drawKegFlat(p, g, x, gy, roll, smoke) {
  const cx = x + roll, cy = gy - 3.6;
  ell(p, cx, cy, 5.2, 3.6, P_KEG, { noise: 0.25, seed: 5 });
  for (const dx of [-2.6, 2.6]) for (let y = -3; y <= 3; y++) p.px(cx + dx, cy + y, y < 0 ? IRON[4] : IRON[2]);
  ell(p, cx + 5.4, cy, 1.1, 3.2, P_KEG.slice(2));
  const ang = roll * 0.8;
  p.line(cx + 6, cy, cx + 6 + Math.cos(ang) * 3, cy + Math.sin(ang) * 3 - 1, '#6a5a40');
  if (smoke) for (let k = 0; k < 4; k++) p.px(cx + 8 + k * 0.5 + Math.sin(k + smoke * 4), cy - 2 - k * 1.5 - smoke * 2, SMOKE[4 - k]);
  return { fuse: { x: cx + 6 + Math.cos(ang) * 3, y: cy + Math.sin(ang) * 3 - 1 } };
}

function sapperAnims() {
  const mk = (P, X) => makeFrame(PS2, drawSapper, P, X);
  const mkX = (P, X) => makeFrame(PX, drawBlast, P, X);
  const idleA = ppose({ hFx: 3.5, hFy: 8.5, hBx: 1, hBy: 8 });
  const idleB = { ...idleA, hipY: 0.8, lean: 0.6, headY: 0.6, hFx: 4.5, hFy: 7.5, hBy: 8.6, keg: 0.04, fl: 1.5 };
  const idle = track(mk, [[0, idleA], [0.5, idleB], [1, idleA]], 6, { loop: true });
  // Trippeln: kurze, schnelle Schritte, Arme pendeln tief, Fass hüpft
  const runKeys = (o) => {
    const keys = [];
    for (let i = 0; i <= 8; i++) {
      const ph = (i / 8) * TAU, s = Math.sin(ph), c = Math.cos(ph);
      keys.push([i / 8, {
        ...idleA, hipY: -Math.abs(c) * (o.bob ?? 1) + 0.4, lean: o.lean, fFx: 1 + s * o.st, fFy: Math.max(0, -c) * 2.4,
        fBx: -1 - s * o.st, fBy: Math.max(0, c) * 2.4, hFx: 4 - s * o.arm, hFy: o.hy - Math.abs(s) * 1.2, hBx: 2 + s * o.arm, hBy: o.hy + 0.5,
        keg: Math.abs(c) * 0.08 - 0.04, headY: Math.abs(s) * 0.6, fl: ph, cape: o.cape, lit: o.lit, jaw: o.jaw ?? 0, eye: 1,
      }, linear]);
    }
    return keys;
  };
  const walk = track(mk, runKeys({ lean: 0.62, st: 3.8, arm: 2.2, hy: 8.5, cape: 0.3, lit: 0 }), 8, { loop: true, extras: { 0: { fx: 'step' }, 4: { fx: 'step' } } });
  const fuse = track(mk, runKeys({ lean: 0.78, st: 5, arm: 4.5, hy: 6.5, cape: 0.8, lit: 1, bob: 1.4, jaw: 1 }), 6, { loop: true, extras: { 0: { fx: 'step' }, 3: { fx: 'step' } } });
  // Zünden: greift nach hinten zur Lunte, schlägt Funken, krümmt sich ums Fass
  const z1 = ppose({ lean: 0.4, hipY: 0.5, hFx: -2, hFy: -2, hBx: 1, hBy: 7, headY: 0.5, head: -0.5 });
  const z2 = ppose({ lean: 0.35, hipY: 0.8, hFx: -3, hFy: -4.5, hBx: 1.5, hBy: 7, head: -0.8, lit: 1, fuse: 1 });
  const z3 = ppose({ lean: 0.7, hipY: 1.8, hFx: 3, hFy: 6, hBx: 3, hBy: 6, fFx: 3.5, fBx: -3.5, lit: 1, fuse: 0.95, jaw: 1, fl: 1 });
  const z4 = { ...z3, hipY: 2.2, lean: 0.74, fuse: 0.9, fl: 2, hFx: 2.5 };
  const windup = [mk(idleA, { i: 0 }), mk(z1, { i: 1 }), mk(z2, { i: 2, strikeSpark: true, fx: 'cast' }), mk(z3, { i: 3 }), mk(z4, { i: 4 })];
  // Explosion: weiß aufglühende Gestalt, Feuerball, Trümmer, Rauch, Brandfleck
  // Gestalt glüht weiß auf (Kanten orange), aus dem Fass bricht der Feuerball
  const flash = (p, g) => {
    const W = p.w, H = p.h, d = p.ctx.getImageData(0, 0, W, H), gd = g.ctx.getImageData(0, 0, W, H);
    const A = (x, y) => x >= 0 && y >= 0 && x < W && y < H && d.data[(y * W + x) * 4 + 3] > 40;
    const out = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (A(x, y)) out[y * W + x] = (A(x - 1, y) && A(x + 1, y) && A(x, y - 1) && A(x, y + 1)) ? 2 : 1;
    for (let j = 0; j < W * H; j++) {
      if (!out[j]) continue;
      const c = out[j] === 2 ? [255, 246, 214] : [248, 150, 48];
      d.data[j * 4] = c[0]; d.data[j * 4 + 1] = c[1]; d.data[j * 4 + 2] = c[2];
      gd.data[j * 4] = c[0]; gd.data[j * 4 + 1] = c[1] * 0.85; gd.data[j * 4 + 2] = c[2] * 0.5; gd.data[j * 4 + 3] = 255;
    }
    p.ctx.putImageData(d, 0, 0); g.ctx.putImageData(gd, 0, 0);
    return null;
  };
  const z5 = { ...z4, lit: 1, fuse: 0.3 };
  const B0 = { r: 0, k: 0, smoke: 0, deb: 0, ring: 0, wisp: 0, scorch: 0, ember: 0, rise: 0 };
  const strike = [
    mk(z5, { i: 5, post: flash, fx: 'burst' }),
    mkX({ ...B0, r: 11, k: 0, deb: 0.25, ring: 8 }, { i: 1, fx: 'impact' }),
    mkX({ ...B0, r: 17, k: 0.15, deb: 0.5, ring: 15, scorch: 1, ember: 1, smoke: 0.1 }, { i: 2 }),
    mkX({ ...B0, r: 20, k: 0.45, deb: 0.75, ring: 21, scorch: 1, ember: 1, smoke: 0.5, rise: 2 }, { i: 3 }),
    mkX({ ...B0, r: 16, k: 0.8, deb: 1, scorch: 1, ember: 0.8, smoke: 1, rise: 5 }, { i: 4 }),
    mkX({ ...B0, r: 0, scorch: 1, ember: 0.5, smoke: 1.5, rise: 9, wisp: 0.3 }, { i: 5 }),
    mkX({ ...B0, scorch: 1, ember: 0.25, wisp: 1 }, { i: 6 }),
  ];
  const hurtP = ppose({ lean: 0.3, hipX: -1.5, head: -1, headY: -1, hFx: 1, hFy: 4, hBx: -1, hBy: 4, eye: 0, jaw: 1, keg: -0.1, fFx: 4 });
  const hurt = [mk(hurtP, { i: 0 }), mk(mixP(hurtP, idleA, 0.5), { i: 1 })];
  // Tod: taumelt, sackt auf die Knie, fällt aufs Gesicht; das Fass rollt fort
  const d1 = ppose({ ...hurtP, hipY: 2, lean: 0.6, hFy: 9, hFx: 4, hBy: 9 });
  const d2 = ppose({ ...d1, hipY: 4, lean: 0.9, fFx: 2, fBx: -4, fFy: 1, hFy: 10, hFx: 6 });
  const piv = [PS.AX + 4, PS.AY - 1];
  const noKeg = (P) => ({ ...P, kegOn: 0 });
  const keg = (roll, smoke) => (p, g) => drawKegFlat(p, g, PS.AX - 12 - roll, PS.AY, -roll, smoke);
  const dead = (o) => ({ ...noKeg(d2), hipY: 3, lean: 0.9, eye: 0, ...o });
  const death = [
    mk(hurtP, { i: 0 }),
    mk(d1, { i: 1 }),
    mk(d2, { i: 2, rot: [0.3, ...piv] }),
    mk(dead({ lean: 0.4 }), { i: 3, rot: [0.9, ...piv], fx: 'impact', post: keg(0, 0) }),
    mk(dead({ lean: 0.2, fFx: 1, fBx: -3 }), { i: 4, rot: [1.3, ...piv], post: keg(3, 0.4) }),
    mk(dead({ lean: 0.2, fFx: 1, fBx: -3, hFy: 11 }), { i: 5, rot: [1.35, ...piv], post: keg(5, 1) }),
  ];
  return {
    idle: new Animation(idle, 6),
    walk: new Animation(walk, 12),
    fuse: new Animation(fuse, 15),
    windup: new Animation(windup, 6, false),
    strike: new Animation(strike, 12, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 8, false),
  };
}

// ================================================================ Klippenharpyie

// Halb Frau, halb Raubvogel: die Arme sind große, rostbraun gebänderte
// Schwingen mit Daumenkralle, Beine eines Greifs mit schwarzen Krallen,
// aschfahle Haut, wildes rotes Federhaar, glühende Bernsteinaugen.
// Schwebt im Sprite über dem Anker (meta.fly = Körpermitte; die Flughöhe
// steht zusätzlich als frame.hover in Pixeln). walk = Fliegen,
// windup = Schweben und Kreischen vor dem Sturz, dive = Sturzflug (Schleife),
// strike = Krallenhieb im Tiefflug und Aufschwung.
const HP = { W: 92, H: 76, AX: 44, AY: 68, pad: 10, rim: { col: '#ecdcc8', k1: 0.4, k2: 0.1 } };
const SKH = ['#241820', '#3c2834', '#5a3e4a', '#7a5662', '#9c727a', '#c09496'];
const WG = ['#120a08', '#20120c', '#341c12', '#4c2a18', '#683a20', '#88502a', '#a86c3a'];
const WG_D = ['#0c0706', '#160d0a', '#22140e', '#321c12', '#432616'];
const WBAR = ['#6a5038', '#a08060', '#cdb088'];
const HAIRH = ['#1e0a0a', '#3c1210', '#621c14', '#8a2a18', '#b23c1c', '#d8602a'];
const TAL = ['#2a1e0a', '#5a4216', '#8c6a24', '#c09a3a', '#e0c060'];
const H_REST = {
  hov: 16, bx: 0, lean: 0.05, wing: 0, wingB: 0.1, fold: 0, spread: 1, head: 0, jaw: 0, legs: 0, talon: 0,
  tail: 0, eye: 1, hair: 0, hairT: 0, knee: 0,
};
const hppose = (o = {}) => ({ ...H_REST, ...o });

// Schwinge: Wurzel (rx, ry), Schlag w (-1 oben … +1 unten), fold 0..1
function harpyWing(p, g, rx, ry, w, fold, near, spread, lean) {
  const phi = -2.0 - ((w + 1) / 2) * 2.1 + lean * 0.6 - fold * 0.35;
  const dx = Math.cos(phi), dy = Math.sin(phi);
  let bx = -dy, by = dx;
  if (bx * -0.7 + by * 0.3 < 0) { bx = -bx; by = -by; }
  const fs = (0.6 + 0.4 * Math.abs(Math.sin(phi))) * (1 - fold * 0.42) * spread;
  const La = 12.5 * fs, Lh = 10.5 * fs, L = La + Lh;
  const W = (s) => (s < La ? 8.4 - (s / La) * 1.4 : 7 - ((s - La) / Lh) * 3.4) * (1 - fold * 0.4);
  const P = (s, c) => [rx + dx * s + bx * c, ry + dy * s + by * c];
  const R = near ? WG : WG_D;
  // Handschwingen (gefingert, gebändert)
  const nF = 6;
  for (let k = 0; k < nF; k++) {
    const s0 = La + Lh * (0.3 + k * 0.14);
    const c0 = W(Math.min(L, s0)) * 0.4;
    const fan = (k - (nF - 1)) * 0.17 * (1 - fold * 0.75);
    const fa = Math.atan2(dy, dx) - fan * Math.sign(dx * by - dy * bx);
    const len = (8 - Math.abs(k - 3.5) * 0.7) * fs;
    const [x0, y0] = P(s0, c0);
    for (let t = 0; t <= len; t += 0.5) {
      const x = x0 + Math.cos(fa) * t, y = y0 + Math.sin(fa) * t;
      const band = Math.floor(t / 2.2) % 2 === 1;
      p.px(x, y, band ? (near ? WBAR[1] : WBAR[0]) : R[near ? 3 : 2]);
      if (t < len - 1.5) p.px(x + Math.cos(fa + 1.57) * 0.7, y + Math.sin(fa + 1.57) * 0.7, R[near ? 2 : 1]);
    }
    p.px(x0 + Math.cos(fa) * len, y0 + Math.sin(fa) * len, near ? WBAR[2] : WBAR[0]);
  }
  // Fläche
  const pts = [];
  for (let s = 0; s <= L; s += 1) pts.push(P(s, -Math.sin((s / L) * Math.PI) * 1.1));
  for (let s = L; s >= 0; s -= 1) pts.push(P(s, W(s) + (Math.round(s) % 2) * 0.8));
  poly(p, pts, (x, y) => {
    const lx = x + 0.5 - rx, ly = y + 0.5 - ry;
    const s = lx * dx + ly * dy, c = lx * bx + ly * by;
    const wc = W(clamp(s, 0, L)) || 1, f = c / wc;
    if (f < 0.14) return R[near ? 5 : 4];                                  // Vorderkante (Arm)
    if (f < 0.42) return hash2(x, y, 81) < 0.2 ? R[2] : R[near ? 4 : 3];   // Deckfedern
    const band = Math.floor((f * 5 + s * 0.12)) % 2 === 0;
    if (f > 0.78) return band ? (near ? WBAR[1] : WBAR[0]) : R[1];          // gebänderter Saum
    return band ? R[near ? 3 : 2] : R[2];
  });
  // Daumenkralle am Handgelenk
  const [kx, ky] = P(La, -0.6);
  p.px(kx, ky, BONE[2]); p.px(kx + dx * 0.8 - bx * 0.8, ky + dy * 0.8 - by * 0.8, near ? BONE[3] : BONE[1]);
  return P(L, 0);
}

function drawHarpy(p, g, P, X) {
  const meta = {};
  const cx = HP.AX + P.bx, cy = HP.AY - P.hov;
  const c = Math.cos(P.lean), s = Math.sin(P.lean);
  const L = (lx, ly) => ({ x: cx + lx * c - ly * s, y: cy + lx * s + ly * c });

  // --- Fahrtstreifen beim Sturzflug
  if (X.streak) {
    // Fahrtrichtung = Körperachse nach vorn unten; Streifen ziehen nach hinten oben
    const dx = Math.cos(P.lean - 0.5), dy = Math.sin(P.lean - 0.5);
    for (let k = 0; k < 6; k++) {
      const off = (k - 2.5) * 3.4 + (hash2(k, X.i ?? 0, 3) - 0.5) * 2;
      const bx0 = cx - dy * off - dx * (6 + hash2(k, 4, X.i ?? 0) * 4), by0 = cy + dx * off - dy * (6 + hash2(k, 4, X.i ?? 0) * 4);
      const len = (5 + hash2(k, 2, X.i ?? 0) * 7) * X.streak;
      for (let t = 0; t < len; t++) if (t % 4 !== 3) p.px(bx0 - dx * t, by0 - dy * t, t < 2 ? '#e0d4c0' : '#8a8070');
    }
  }

  // --- ferne Schwinge
  const shB = L(-0.8, -5.6), shF = L(1, -5);
  harpyWing(p, g, shB.x, shB.y, clamp(P.wingB, -1, 1), P.fold, false, P.spread * 0.92, P.lean);

  // --- Haar (hinter dem Kopf, weht nach hinten)
  const hd = L(2.2 + P.head * 0.6, -10.6 + Math.abs(P.head) * 0.3);
  for (let k = 0; k < 7; k++) {
    const len = 8 + (k % 3) * 2.5 + P.hair * 3;
    for (let t = 0; t < len; t++) {
      const v = t / len;
      const x = hd.x - 1 - t * (0.85 + P.hair * 0.15) + Math.sin(P.hairT + v * 4 + k) * 0.8 * v;
      const y = hd.y - 2 + k * 0.7 + t * (0.35 - P.hair * 0.35) + v * v * (2 - P.hair * 2.5);
      p.px(x, y, t > len - 2 ? HAIRH[k % 2 ? 5 : 4] : HAIRH[(k + t) % 3 === 0 ? 2 : k < 2 ? 4 : 3]);
      if (k % 2 === 0 && t < len - 2) p.px(x, y + 1, HAIRH[2]);
    }
  }

  // --- Schwanzfedern
  for (let k = 0; k < 4; k++) {
    const t0 = L(-1.5, 5.5);
    const a = 1.95 + k * 0.17 + Math.sin(P.tail + k) * 0.06 - P.lean * 0.2;
    for (let t = 0; t < 9 - k; t += 0.5) {
      const x = t0.x + Math.cos(a) * t * 1, y = t0.y + Math.sin(a) * t;
      p.px(x, y, Math.floor(t / 2) % 2 ? WBAR[k < 2 ? 1 : 0] : WG[2 + (k % 2)]);
    }
  }

  // --- Greifenbeine
  const legPt = (side) => {
    const hip = L(0.4 + side, 6.2);
    const ext = P.legs;
    const knee = L(2.2 + side + ext * 1.5 - P.knee, 9.5 - ext * 0.5);
    const foot = L(0.5 + side + ext * 6.5, 13 + ext * 2.5 - P.knee * 1.5);
    cap(p, hip.x, hip.y, knee.x, knee.y, 1.8, 1.3, side ? WG : WG_D);          // befiederter Schenkel
    cap(p, knee.x, knee.y, foot.x, foot.y, 0.9, 0.8, side ? TAL : TAL.slice(0, 4)); // Lauf
    for (let k = 0; k < 3; k += 0.5) { const q = { x: knee.x + (foot.x - knee.x) * k / 3, y: knee.y + (foot.y - knee.y) * k / 3 }; if (k % 1 === 0) p.px(q.x, q.y, side ? TAL[1] : TAL[0]); }
    // Zehen + Krallen (drei vorn, eine hinten)
    const o = P.talon, fa = P.lean + 0.25 + ext * 0.35;
    for (let k = -1; k <= 1; k++) {
      const a = fa + k * (0.5 + o * 0.45) - o * 0.4;
      const t1 = { x: foot.x + Math.cos(a) * 2.4, y: foot.y + Math.sin(a) * 2.4 };
      p.line(foot.x, foot.y, t1.x, t1.y, side ? TAL[3] : TAL[1]);
      const ca = a + 1.1 - o * 0.4;
      p.px(t1.x + Math.cos(ca) * 0.9, t1.y + Math.sin(ca) * 0.9, '#141010');
      p.px(t1.x + Math.cos(ca) * 1.6, t1.y + Math.sin(ca) * 1.6, side ? '#e8e0d0' : '#8a8478');
    }
    const ba = fa + Math.PI - 0.4 + o * 0.3;
    p.line(foot.x, foot.y, foot.x + Math.cos(ba) * 1.8, foot.y + Math.sin(ba) * 1.8, side ? TAL[2] : TAL[1]);
    p.px(foot.x + Math.cos(ba) * 2.6, foot.y + Math.sin(ba) * 2.6 + 0.5, '#141010');
    return foot;
  };
  legPt(0);

  // --- Rumpf: schlanker Oberkörper, befiederte Hüfte
  const hipC = L(-0.4, 4.6);
  ell(p, hipC.x, hipC.y, 3.4, 2.9, WG, { rot: P.lean, noise: 0.25, seed: 6 });
  const ch0 = L(0, 3), ch1 = L(0.9, -4.4);
  cap(p, ch0.x, ch0.y, ch1.x, ch1.y, 2.2, 2.8, SKH, { noise: 0.06, seed: 2 });
  // Rippenschatten, Federschuppen am Bauchansatz
  for (let k = 0; k < 3; k++) { const q = L(1.6, -1.5 + k * 1.3); p.px(q.x, q.y, SKH[2]); }
  for (let k = -2; k <= 2; k++) { const q = L(k * 1.2, 2.4 + Math.abs(k) * 0.3); p.px(q.x, q.y, k % 2 ? WG[5] : WG[4]); }
  // Federkragen an den Schultern
  const ruff = L(0.2, -5);
  ell(p, ruff.x, ruff.y, 3.8, 2.0, WG.slice(1), { rot: P.lean, noise: 0.35, seed: 8 });
  for (let k = -3; k <= 3; k++) { const q = L(k, -3.6 + Math.abs(k) * 0.2); p.px(q.x, q.y, k % 2 ? WBAR[1] : WG[4]); }
  legPt(1);

  // --- Kopf
  const hx = hd.x, hy = hd.y;
  ell(p, hx, hy, 2.9, 3.1, SKH, { rot: P.lean * 0.5 });
  // spitzes Ohr
  p.px(hx - 1.5, hy - 1, SKH[3]); p.px(hx - 2.5, hy - 2, SKH[4]); p.px(hx - 3, hy - 2.6, SKH[2]);
  // Haarkrone (Stirnfedern)
  for (let k = -2; k <= 2; k++) p.px(hx + k * 0.8, hy - 2.8 - (k === 0 ? 1 : 0) + Math.abs(k) * 0.3, HAIRH[k === 0 ? 5 : 4]);
  p.px(hx + 1.5, hy - 3.6 - P.hair, HAIRH[5]);
  // Gesicht: Nase/Kinn spitz, Auge glüht, Maul
  const fx = hx + 2.4, fy = hy + 0.4;
  p.px(fx, fy, SKH[4]); p.px(fx + 0.6, fy + 0.6, SKH[3]);
  const ex = hx + 1.2, ey = hy - 0.6;
  p.px(ex - 0.6, ey - 1, HAIRH[1]); p.px(ex + 0.6, ey - 1.2, HAIRH[1]);   // Braue, böse
  if (P.eye > 0.3) { p.px(ex, ey, '#ffc040'); g.px(ex, ey, '#f0a030'); g.px(ex - 1, ey, '#5a2a08'); }
  else p.px(ex, ey, SKH[0]);
  const jw = P.jaw;
  if (jw > 0.3) {
    p.px(hx + 1.6, hy + 1.8, '#2a0608'); p.px(hx + 2.2, hy + 2.2 + jw, '#2a0608'); p.px(hx + 1.6, hy + 2.6 + jw, '#2a0608');
    p.px(hx + 2.3, hy + 1.6, '#f0e8d8'); p.px(hx + 2.1, hy + 3 + jw, '#f0e8d8');
    p.px(hx + 1.2, hy + 3.2 + jw, SKH[3]);
  } else { p.px(hx + 1.6, hy + 1.8, SKH[1]); p.px(hx + 2.2, hy + 1.8, SKH[2]); }
  meta.eye = { x: ex, y: ey };
  meta.mouth = { x: hx + 2.4, y: hy + 2 };
  meta.head = { x: hx, y: hy - 5 };

  // --- nahe Schwinge
  const tip = harpyWing(p, g, shF.x, shF.y, clamp(P.wing, -1, 1), P.fold, true, P.spread, P.lean);
  meta.tip = { x: tip[0], y: tip[1] };
  meta.hand = L(1 + P.legs * 6.5, 14 + P.legs * 2.5);
  meta.fly = { x: cx, y: cy };
  if (X.dust) dust(p, HP.AX + X.dust, HP.AY, 9, 21, DUST_W, 16);
  if (X.feathers) for (let k = 0; k < 6; k++) {
    const fx2 = cx + (hash2(k, 1, X.feathers) - 0.5) * 26, fy2 = cy + (hash2(k, 2, X.feathers) - 0.5) * 18;
    p.px(fx2, fy2, WG[4]); p.px(fx2 + 1, fy2 + (k % 2), WBAR[1]);
  }
  return meta;
}

// Liegende Harpyie (Todes-Endframes): k = Nachsinken 0..1
function drawHarpyCorpse(p, g, P, X) {
  const gy = HP.AY, cx = HP.AX + 1;
  // ausgebreitete Schwinge flach am Boden
  poly(p, [[cx - 1, gy - 4], [cx - 14, gy - 8 + P.k], [cx - 23, gy - 6 + P.k], [cx - 21, gy - 3], [cx - 10, gy - 1]], (x, y) => {
    const band = Math.floor((x - cx) / 2.5) % 2 === 0;
    return y > gy - 3 ? (band ? WBAR[0] : WG[2]) : y < gy - 6 ? WG[4] : band ? WG[3] : WBAR[1];
  });
  for (let k = 0; k < 5; k++) p.line(cx - 20 - k * 0.6, gy - 6 + k * 0.6 + P.k, cx - 26 - k, gy - 6 + k + P.k, k % 2 ? WBAR[1] : WG[3]);
  // Körper auf der Seite
  ell(p, cx - 1, gy - 3, 4, 2.6, WG, { noise: 0.25, seed: 6 });
  cap(p, cx + 1, gy - 3.2, cx + 7, gy - 3.4, 2.4, 2.2, SKH);
  // angelegte zweite Schwinge
  poly(p, [[cx - 2, gy - 5], [cx + 5, gy - 9 + P.k * 2], [cx + 9, gy - 7 + P.k * 2], [cx + 4, gy - 4.5]], (x, y) => ((x + y) % 3 === 0 ? WBAR[1] : WG[3]));
  // Kopf, Haar ausgebreitet
  ell(p, cx + 10, gy - 2.6, 2.4, 2.2, SKH);
  for (let k = 0; k < 6; k++) p.line(cx + 9, gy - 3.5, cx + 7 - k * 0.6, gy - 6.5 - (k % 3) + k * 0.4, HAIRH[3 + (k % 3)]);
  p.px(cx + 11, gy - 3, SKH[1]); p.px(cx + 12, gy - 2, SKH[3]);
  // Krallen in der Luft
  p.line(cx - 2, gy - 4, cx - 1, gy - 9 + P.k, TAL[2]);
  p.px(cx - 2, gy - 10 + P.k, '#141010'); p.px(cx, gy - 10 + P.k, '#141010');
  for (let k = 0; k < 8; k++) {
    const fx = cx - 18 + hash2(k, 1, 45) * 36, fy = gy - hash2(k, 2, 45) * 4 - (1 - P.k) * 6 * hash2(k, 3, 45);
    p.px(fx, fy, k % 2 ? WG[4] : WBAR[1]);
  }
  if (X.dust) dust(p, cx, gy, 12, 23, DUST_W, 16);
  return { eye: { x: cx + 11, y: gy - 3 }, head: { x: cx + 10, y: gy - 7 }, fly: { x: cx, y: gy - 3 } };
}

function harpyAnims() {
  const mk = (P, X) => { const f = makeFrame(HP, drawHarpy, P, X); f.hover = Math.round(P.hov); return f; };
  const mkC = (P, X) => { const f = makeFrame(HP, drawHarpyCorpse, P, X); f.hover = 0; return f; };
  const flap = (i, n, o = {}) => {
    const ph = (i / n) * TAU;
    const w = -Math.cos(ph + Math.sin(ph) * 0.45);
    return hppose({
      wing: w * (o.amp ?? 0.95), wingB: -Math.cos(ph - 0.35 + Math.sin(ph) * 0.45) * (o.amp ?? 0.95) * 0.75 - 0.4,
      hov: (o.hov ?? 16) - Math.sin(ph - 0.6) * (o.bob ?? 1.8), tail: ph, hairT: ph,
      lean: (o.lean ?? 0.2) + Math.sin(ph) * 0.04, legs: o.legs ?? 0.1, talon: (o.talon ?? 0.2) + Math.sin(ph) * 0.15,
      hair: o.hair ?? 0.2, head: o.head ?? 0, jaw: o.jaw ?? 0, knee: o.knee ?? 0.5,
    });
  };
  const idle = []; for (let i = 0; i < 8; i++) idle.push(mk(flap(i, 8), { i }));
  const walk = []; for (let i = 0; i < 6; i++) walk.push(mk(flap(i, 6, { lean: 0.42, hov: 16, amp: 1, hair: 0.7, legs: 0, knee: 1 }), { i }));
  // Schweben vor dem Sturz: steigt, Schwingen hoch gespreizt, Krallen vor, kreischt
  const windup = [
    mk(flap(0, 8), { i: 0 }),
    mk(hppose({ hov: 17.5, wing: 0.6, wingB: 0.5, lean: -0.1, legs: 0.3, talon: 0.4, hair: 0.4, jaw: 0.4, knee: 0.3 }), { i: 1 }),
    mk(hppose({ hov: 19, wing: -0.95, wingB: -0.9, lean: -0.22, legs: 0.6, talon: 0.9, hair: 0.6, jaw: 1.2, head: 0.5 }), { i: 2, fx: 'roar' }),
    mk(hppose({ hov: 19.5, wing: -0.75, wingB: -0.7, lean: -0.24, legs: 0.7, talon: 1, hair: 0.5, jaw: 1.2, head: 0.6, hairT: 1 }), { i: 3 }),
    mk(hppose({ hov: 19.3, wing: -1, wingB: -0.95, lean: -0.26, legs: 0.7, talon: 1, hair: 0.7, jaw: 1, head: 0.6, hairT: 2 }), { i: 4 }),
  ];
  // Sturzflug: Kopf voran, Schwingen angelegt, Krallen gestreckt
  const dive = [0, 1, 2, 3].map((i) => mk(hppose({
    hov: 16 + (i % 2) * 0.5, bx: 1, lean: 0.95, wing: 0.35 + (i % 2) * 0.12, wingB: 0.05 + (i % 2) * 0.1, fold: 0.9, legs: -0.2, talon: 0.7 + (i % 2) * 0.2,
    hair: 1, hairT: i * 1.6, jaw: 0.8, tail: i, knee: 1.5,
  }), { i, streak: 1 }));
  // Krallenhieb im Tiefflug, Schwingen schlagen auf, Aufschwung
  const strike = [
    mk(hppose({ hov: 19, bx: 4, lean: 0.25, wing: -0.6, wingB: -0.5, fold: 0.3, legs: 1, talon: 1, hair: 0.9, jaw: 1 }), { i: 0, streak: 0.6 }),
    mk(hppose({ hov: 18, bx: 6, lean: 0.1, wing: -0.95, wingB: -0.9, legs: 0.9, talon: 0, hair: 0.8, jaw: 1, knee: 0.3 }), { i: 1, fx: 'impact', dust: 12 }),
    mk(hppose({ hov: 18, bx: 5, lean: -0.05, wing: 0.95, wingB: 0.85, legs: 0.5, talon: 0.1, hair: 0.5, jaw: 0.5 }), { i: 2, dust: 11 }),
    mk(hppose({ hov: 18, bx: 3, lean: -0.1, wing: -0.4, wingB: -0.3, legs: 0.3, talon: 0.3, hair: 0.4 }), { i: 3 }),
    mk(hppose({ hov: 19, bx: 1, lean: 0, wing: 0.7, wingB: 0.6, legs: 0.1, talon: 0.2, hair: 0.3 }), { i: 4 }),
  ];
  const hurtP = hppose({ hov: 17, bx: -3, lean: -0.35, wing: 0.7, wingB: -0.6, head: -0.6, jaw: 1, eye: 0, legs: 0.4, talon: 1, hair: -0.3 });
  const hurt = [mk(hurtP, { i: 0, feathers: 7 }), mk(mixP(hurtP, flap(0, 8), 0.5), { i: 1 })];
  const death = [
    mk(hurtP, { i: 0, feathers: 5 }),
    mk(hppose({ hov: 12, bx: -2, lean: 0.55, wing: -0.9, wingB: 0.7, head: 0.8, jaw: 1, eye: 0, legs: 0.5, talon: 1, hair: -0.5 }), { i: 1, feathers: 9 }),
    mk(hppose({ hov: 6, lean: 1.1, wing: -1, wingB: -0.4, fold: 0.4, head: 1, jaw: 0.6, eye: 0, legs: 0.3, hair: -0.5 }), { i: 2 }),
    mkC({ k: 0 }, { i: 3, fx: 'impact', dust: true }),
    mkC({ k: 0.6 }, { i: 4 }),
    mkC({ k: 1 }, { i: 5 }),
  ];
  return {
    idle: new Animation(idle, 9),
    walk: new Animation(walk, 12),
    windup: new Animation(windup, 7, false),
    dive: new Animation(dive, 12),
    strike: new Animation(strike, 14, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 9, false),
  };
}

// ================================================================ Export

const NEW1 = {
  ember_beetle: beetleAnims,
  bandit_shieldbearer: shieldbearerAnims,
  cinder_sapper: sapperAnims,
  cliff_harpy: harpyAnims,
};

// Figurensätze werden erst beim ersten Zugriff gebaut (je Typ).
export function createNew1Foes() {
  const out = {};
  for (const k in NEW1) {
    Object.defineProperty(out, k, {
      configurable: true, enumerable: true,
      get() {
        const v = NEW1[k]();
        Object.defineProperty(out, k, { value: v, writable: true, configurable: true, enumerable: true });
        return v;
      },
    });
  }
  return out;
}
