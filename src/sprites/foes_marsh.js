import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame, SpriteFrame, Animation } from '../gfx/Sprite.js';
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

// Schattierte Ellipse (optional gedreht, mit Materialrauschen).
function ell(p, cx, cy, rx, ry, ramp, o = {}) {
  const { rot = 0, noise = 0, seed = 1, bias = 0, clip = null } = o;
  if (rx <= 0 || ry <= 0) return;
  const c = Math.cos(rot), s = Math.sin(rot);
  const R = Math.ceil(Math.max(rx, ry)) + 1;
  const ctx = p.ctx; let last = null;
  for (let y = Math.floor(cy - R); y <= cy + R; y++) {
    for (let x = Math.floor(cx - R); x <= cx + R; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry;
      const d2 = u * u + v * v;
      if (d2 > 1) continue;
      if (clip && !clip(x, y)) continue;
      const nz = Math.sqrt(1 - d2);
      const nx = u * c - v * s, ny = u * s + v * c;
      const n = noise ? (hash2(Math.round(dx) + 64, Math.round(dy) + 64, seed) - 0.5) * noise : 0;
      const col = tone(ramp, nx, ny, nz, bias, n);
      if (col !== last) { ctx.fillStyle = col; last = col; }
      ctx.fillRect(x, y, 1, 1);
      if (OCC) OCC.ctx.clearRect(x, y, 1, 1);
    }
  }
}

// Schattierte Kapsel (Gliedmaßen): Radius r0 -> r1.
function cap(p, x0, y0, x1, y1, r0, r1, ramp, o = {}) {
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
      if (OCC) OCC.ctx.clearRect(x, y, 1, 1);
    }
  }
}

// Gefülltes Polygon (Scanline). col: Farbe oder (x,y)=>Farbe.
function poly(p, pts, col) {
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
      for (let x = x0; x < x1; x++) {
        const c = typeof col === 'function' ? col(x, y) : col;
        if (!c) continue;
        p.ctx.fillStyle = c; p.ctx.fillRect(x, y, 1, 1);
        if (OCC) OCC.ctx.clearRect(x, y, 1, 1);
      }
    }
  }
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

// Leuchtpunkt auf der Glow-Ebene (konzentrisch), Rampe dunkel -> hell.
function glowDot(g, x, y, r, G) {
  if (r <= 0.6) { g.px(x, y, G[3]); return; }
  g.ellipse(x, y, r + 1, r + 1, G[0]);
  g.ellipse(x, y, r, r, G[1]);
  g.ellipse(x, y, Math.max(0.5, r - 1), Math.max(0.5, r - 1), G[2]);
  if (r > 1.5) g.ellipse(x, y, Math.max(0.5, r - 2), Math.max(0.5, r - 2), G[3]);
  if (r > 2.5) g.ellipse(x, y, Math.max(0.5, r - 3), Math.max(0.5, r - 3), G[4]);
}

// Tropfender Schlamm: Faden unter (x,y), Länge len, Phase ph (0..1).
function drip(p, g, x, y, len, ph, cols, gcol = null) {
  const L = Math.max(1, Math.round(len * (0.4 + 0.6 * ((ph % 1 + 1) % 1))));
  for (let j = 0; j < L; j++) p.px(x, y + j, j === L - 1 ? cols[2] : cols[1]);
  if (((ph % 1 + 1) % 1) > 0.7) { p.px(x, y + L + 1, cols[2]); if (gcol) g.px(x, y + L + 1, gcol); }
}

// Wölkchen aus Sporen/Faulgas (auf Farb- und Leucht-Ebene): dichte, weich
// schattierte Ballen mit ausgefranstem Rand. k 0..1 = Dichte (dünnt nur den Rand aus).
function gasPuff(p, g, x, y, r, k, seed, C, G) {
  if (r < 0.8 || k <= 0.02) return;
  const R = Math.ceil(r) + 1;
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

// Randlicht: helle Oberkante (Mondlicht von links oben) und kaltes Gegenlicht
// rechts. Läuft über die fertige Figur, bevor der Umriss entsteht.
function rimLight(p, rim, back, k1 = 0.42, k2 = 0.3) {
  const W = p.w, H = p.h;
  const img = p.ctx.getImageData(0, 0, W, H), d = img.data;
  const src = new Uint8ClampedArray(d);
  const A = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : src[(y * W + x) * 4 + 3]);
  const R1 = hex(rim), R2 = hex(back);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (src[i + 3] < 40) continue;
    const lum = src[i] * 0.3 + src[i + 1] * 0.59 + src[i + 2] * 0.11;
    if (lum > 185) continue;
    let k = 0, C = null;
    if (A(x, y - 1) < 40 || A(x - 1, y - 1) < 40 && A(x - 1, y) < 40) { k = k1; C = R1; }
    else if (A(x - 1, y) < 40) { k = k1 * 0.6; C = R1; }
    else if (A(x + 1, y) < 40 || A(x + 1, y - 1) < 40 && A(x, y - 1) >= 40 && A(x + 1, y + 1) < 40) { k = k2; C = R2; }
    if (!C) continue;
    d[i] = src[i] + (C[0] - src[i]) * k;
    d[i + 1] = src[i + 1] + (C[1] - src[i + 1]) * k;
    d[i + 2] = src[i + 2] + (C[2] - src[i + 2]) * k;
  }
  p.ctx.putImageData(img, 0, 0);
}
function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }

// Dreht den Inhalt einer PixelCanvas pixelgenau um einen Drehpunkt.
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

// Rahmen-Bau. spec = { W, H, AX, AY, pad, rim, back, draw(p, g, P, X) -> meta (absolut) }.
// X.rot = [winkel, drehpunktX, drehpunktY] kippt die Figur (Sturz) und setzt sie wieder auf den Boden.
// X.sink = 0..1 lässt die Figur im Morast versinken (alles unter der Bodenlinie wird abgeschnitten).
function makeFrame(spec, P, X = {}) {
  const { W, H, AX, AY } = spec, pad = spec.pad ?? 8;
  const W2 = W + pad * 2, H2 = H + pad * 2;
  const g = new PixelCanvas(W2, H2);
  let meta = {};
  const f = buildFrame(W2, H2, AX + pad, AY + pad, (p) => {
    if (X.rot && Math.abs(X.rot[0]) > 0.001) {
      const PR = 30, HH = H2 + PR * 2;
      const tp = new PixelCanvas(W2, HH), tg = new PixelCanvas(W2, HH);
      tp.ctx.translate(pad, pad + PR); tg.ctx.translate(pad, pad + PR);
      meta = spec.draw(tp, tg, P, X) || {};
      OCC = null;
      tp.ctx.setTransform(1, 0, 0, 1, 0, 0); tg.ctx.setTransform(1, 0, 0, 1, 0, 0);
      const [a, rx, ry] = X.rot;
      const rp = new PixelCanvas(W2, HH), rg = new PixelCanvas(W2, HH);
      rotBlit(tp, rp, rx + pad, ry + pad + PR, a); rotBlit(tg, rg, rx + pad, ry + pad + PR, a);
      const dd = rp.ctx.getImageData(0, 0, W2, HH).data;
      let bottom = -1;
      for (let y = HH - 1; y >= 0 && bottom < 0; y--) for (let x = 0; x < W2; x++) if (dd[(y * W2 + x) * 4 + 3] > 40) { bottom = y; break; }
      const shift = bottom >= 0 ? (AY + pad + PR - 1) - bottom : 0;
      p.ctx.drawImage(rp.canvas, 0, shift - PR); g.ctx.drawImage(rg.canvas, 0, shift - PR);
      const c = Math.cos(a), s = Math.sin(a);
      for (const k in meta) {
        const m = meta[k], dx = m.x - rx, dy = m.y - ry;
        meta[k] = { x: rx + dx * c - dy * s, y: ry + dx * s + dy * c + shift };
      }
    } else {
      p.ctx.translate(pad, pad); g.ctx.translate(pad, pad);
      meta = spec.draw(p, g, P, X) || {};
      OCC = null;
      p.ctx.setTransform(1, 0, 0, 1, 0, 0); g.ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (X.sink) {
      // Figur um sink·H nach unten schieben und unter der Bodenlinie abschneiden
      const dy = Math.round(X.sink * (spec.sinkH ?? H));
      for (const c of [p, g]) {
        const tmp = new PixelCanvas(W2, H2);
        tmp.ctx.drawImage(c.canvas, 0, 0);
        c.ctx.clearRect(0, 0, W2, H2);
        c.ctx.drawImage(tmp.canvas, 0, dy);
        c.ctx.clearRect(0, AY + pad, W2, H2);
      }
      for (const k in meta) meta[k] = { x: meta[k].x, y: Math.min(AY - 1, meta[k].y + dy) };
    }
    if (X.post) {
      p.ctx.translate(pad, pad); g.ctx.translate(pad, pad);
      Object.assign(meta, X.post(p, g) || {});
      OCC = null;
      p.ctx.setTransform(1, 0, 0, 1, 0, 0); g.ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    rimLight(p, spec.rim ?? '#b8d8b0', spec.back ?? '#7a9ab8', spec.rimK ?? 0.42, spec.backK ?? 0.3);
  });
  f.glow = new SpriteFrame(g.canvas, AX + pad, AY + pad);
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
  for (let i = -2; i <= 2; i += 2) p.px(bx + i, by + 0.5 - i * 0.3, L_BELLY[1]);
  // Hautwarzen / Flecken
  for (let i = 0; i < 12; i++) {
    const u = hash2(i, 1, 71), v = hash2(i, 2, 71);
    const x = hip.x + (chest.x - hip.x) * u + (v - 0.6) * 5, y = hip.y + (chest.y - hip.y) * u - 2 + (v - 0.5) * 4;
    p.px(x, y, hash2(i, 3, 71) < 0.5 ? S[1] : S[5]);
  }
  // Moosbuckel auf dem Rücken, Schilf und Tang hängen herab
  const hump = { x: hip.x + (chest.x - hip.x) * 0.45 - 1.5, y: hip.y + (chest.y - hip.y) * 0.45 - 4 - P.hump };
  ell(p, hump.x, hump.y, 5.5, 3, MOSS, { noise: 0.35, seed: 9, rot: -P.ang * 0.5 });
  ell(p, hump.x + 3.5, hump.y - 1.5, 3, 2, MOSS, { noise: 0.3, seed: 10 });
  for (let i = 0; i < 4; i++) { // Schilfhalme, die aus dem Buckel wachsen
    const x0 = hump.x - 3 + i * 2, y0 = hump.y - 1.5;
    const len = 4 + (i % 2) * 3;
    for (let j = 0; j < len; j++) p.px(x0 - j * 0.35 - Math.sin(P.weed + i) * j * 0.08, y0 - j, j === len - 1 ? '#8a8a4a' : MOSS[4 + (j & 1)]);
  }
  for (let i = 0; i < 5; i++) { // Tangfäden
    const x0 = hump.x - 4.5 + i * 1.8, y0 = hump.y + 2;
    const len = 3 + (hash2(i, 4, 72) * 4 | 0);
    for (let j = 0; j < len; j++) p.px(x0 + Math.sin(P.weed + i + j * 0.7) * 0.6 - P.stretch * j * 0.4, y0 + j, j % 3 === 2 ? MOSS[1] : MOSS[3]);
  }
  // Knochiger Rückenkamm: helle Stacheln durch das Moos (klare Silhouette)
  for (let i = 0; i < 5; i++) {
    const u = 0.1 + i * 0.2;
    const bx0 = hip.x + (chest.x - hip.x) * u - 2, by0 = hip.y + (chest.y - hip.y) * u - 4.5 - (i === 2 ? 1 + P.hump : 0);
    const h = 2 + (i === 1 || i === 2 ? 1.5 : 0) + P.hump * 0.5;
    const tx = bx0 - 1.2 - P.stretch, ty = by0 - h;
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
    for (let u = 1; u <= 4.5; u += 1.5) { const t = H(u, 0.8 + jw * 0.3); p.px(t.x, t.y + 1, BONE[4]); const b = H(u + 0.5, 1 + jw * 3.2); p.px(b.x, b.y - 1, BONE[3]); }
  }
  // Schädeldach
  const s0 = H(-2.5, -0.8), s1 = H(4.5, 0);
  cap(p, s0.x, s0.y, s1.x, s1.y, 3.8, 2.7, near, { seed: 14 });
  const lip = H(6.5, 0.6);
  p.px(lip.x, lip.y, S[5]); p.px(lip.x - 1, lip.y - 0.8, S[6]);
  // Nasenlöcher, Maulspalte mit heller Lippe
  const nos = H(5.2, -1); p.px(nos.x, nos.y, S[1]);
  if (jw <= 0.2) {
    const m0 = H(-1.5, 1.5), m1 = H(6.5, 1.1); p.line(m0.x, m0.y, m1.x, m1.y, S[0]);
    const l0 = H(-0.5, 0.6), l1 = H(5.5, 0.3); p.line(l0.x, l0.y, l1.x, l1.y, S[5]);
    // Überbiss: Hauer des Oberkiefers ragen über die Lippe
    for (const u of [1.5, 4]) { const t = H(u, 2.3); p.px(t.x, t.y, BONE[4]); p.px(t.x, t.y + 1, BONE[2]); }
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
  if (eyeOn) {
    // Iris mit dunklem Ring, senkrechte Schlitzpupille, Glanzpunkt oben links
    p.rect(eye.x - 1, eye.y - 1, 3, 3, Y[1]);
    p.rect(eye.x - 0.5, eye.y - 0.5, 2, 2, Y[2]); p.px(eye.x - 1, eye.y - 1, Y[3]);
    p.px(eye.x + 0.5, eye.y - 0.5, '#101008'); p.px(eye.x + 0.5, eye.y + 0.5, '#101008');
    p.px(eye2.x + 0.3, eye2.y, Y[1]);
    g.rect(eye.x - 0.5, eye.y - 0.5, 2, 2, '#a09010'); g.px(eye.x + 0.5, eye.y - 0.5, '#f8f0a0'); g.px(eye2.x + 0.3, eye2.y, '#5a5008');
  } else { p.line(eye.x - 1, eye.y, eye.x + 1, eye.y, S[1]); }
  meta.eye = { x: eye.x + 0.5, y: eye.y };
  meta.mouth = H(5, 1.5 + jw * 1.5);
  meta.head = H(0, -5);

  // --- Köder: Stiel aus der Stirn, leuchtende Blase baumelt vor dem Maul
  const st = H(2.5, -2.5);
  const la = P.lureA - ha * 0.3;
  const lpts = root(st.x, st.y, -1.2 + la * 0.3, 0.42 + P.lure * 0.12, 5, 1.6, 0.05, P.weed);
  for (let i = 0; i < lpts.length - 1; i++) p.line(lpts[i][0], lpts[i][1], lpts[i + 1][0], lpts[i + 1][1], i < 2 ? S[4] : S[3]);
  const lb = lpts[lpts.length - 1];
  const lr = 1 + P.lure * 0.5;
  const lx = lb[0] + 0.5, ly = lb[1] + 1.5;
  ell(p, lx, ly, lr, lr + 0.2, [WISP[1], WISP[2], WISP[3], WISP[4]], { bias: 0.15 });
  if (P.glow > 0.05) glowDot(g, lx, ly, lr * P.glow + 0.8, WISP);
  meta.lure = { x: lx, y: ly };

  // --- vorderer Arm mit Klauen
  cap(p, shF.x, shF.y, armF.jx, armF.jy, 2.6, 2.1, near, { seed: 15 });
  cap(p, armF.jx, armF.jy, armF.ex, armF.ey, 2.1, 1.7, near);
  ell(p, armF.ex, armF.ey, 1.6, 1.4, near);
  const ca2 = Math.atan2(armF.ey - armF.jy, armF.ex - armF.jx);
  claws(armF.ex + Math.cos(ca2), armF.ey + Math.sin(ca2), P.claw > 0.3 ? ca2 : ca2 * 0.25, 3, P.claw, [BONE[3], BONE[5]]);
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
  if (!bubbles) return;
  for (let i = 0; i < 3; i++) {
    const t = (ph + i * 0.37) % 1;
    const bx = x + (hash2(i, 1, 88) - 0.5) * r * 1.3, by = y - t * 2;
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
  for (const k of [-6, 4, 9]) p.px(hx + ux * k + 1, hy + uy * k, ROOT[1]);
  // Knoten mit Riemen, baumelnde Knochen
  p.px(hx + ux * 7, hy + uy * 7, RAG[5]); p.px(hx + ux * 7.5 + 0.5, hy + uy * 7.5, RAG[4]);
  const sw = Math.sin(P.robeT) * 0.8;
  for (const [k, len] of [[8, 4], [9.5, 3]]) {
    const bx = hx + ux * k + 1.5, by = hy + uy * k;
    p.line(bx, by, bx + sw * 0.5, by + len - 1, RAG[3]);
    p.px(bx + sw * 0.5, by + len, BONE[4]); p.px(bx + sw * 0.5, by + len + 1, BONE[2]);
  }
  // Wurzelkäfig um die Faulkugel
  const ox = top.x + ux * 2.5, oy = top.y + uy * 2.5;
  const r = 2 + P.orb * 0.5 + P.swirl * 0.8;
  ell(p, ox, oy, r, r, [TOX[1], TOX[2], TOX[3], TOX[4], TOX[5]], { bias: 0.1 });
  if (P.orb > 0.05) glowDot(g, ox, oy, r * (0.7 + P.orb * 0.5) + 0.5, GT);
  for (let i = 0; i < 4; i++) { // Käfigstreben
    const aa = -Math.PI / 2 + (i - 1.5) * 0.9;
    const pts = root(top.x + Math.cos(aa) * 0.8, top.y, aa + a, (i < 2 ? -0.35 : 0.35), 4, 1.5);
    for (let j = 0; j < pts.length - 1; j++) p.line(pts[j][0], pts[j][1], pts[j + 1][0], pts[j + 1][1], j < 2 ? ROOT[4] : ROOT[3]);
  }
  // kleiner Vogelschädel auf der Spitze
  const sk = { x: ox + ux * (r + 1.5), y: oy + uy * (r + 1.5) };
  p.px(sk.x, sk.y, BONE[4]); p.px(sk.x + 1, sk.y, BONE[3]); p.px(sk.x + 2, sk.y + 0.5, BONE[2]); p.px(sk.x + 0.5, sk.y, '#0a0806');
  // wirbelnde Sporen beim Wirken
  if (P.swirl > 0.05) {
    for (let i = 0; i < 9; i++) {
      const ang = i / 9 * TAU + P.robeT * 1.7;
      const rr = r + 2 + (1 - P.swirl) * 6 + (i % 3);
      const x = ox + Math.cos(ang) * rr, y = oy + Math.sin(ang) * rr * 0.8;
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
      p.line(x, y, x + Math.cos(aa) * (2 + open), y + Math.sin(aa) * (2 + open), cols[k === 0 ? 1 : 0]);
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
    const fold = Math.sin(u * 9 + P.robeT * 0.3) > 0.55 ? -1 : 0;
    const k = clamp(Math.round(4.4 - u * 2.6 + fold - (y > hemY - 2 ? 1 : 0)), 1, 5);
    return RAG[k];
  };
  poly(p, [[c0.x, c0.y], [c1.x, c1.y], ...hem], shade);
  // Moosflecken und Schlamm am Saum
  for (let i = 0; i < 10; i++) {
    const x = hemL + (hemR - hemL) * hash2(i, 1, 97), y = hemY - hash2(i, 2, 97) * 3;
    p.px(x, y, i % 3 ? MUD[3] : MOSS[3]);
  }
  // Gürtel mit Knochenfetischen
  const b0 = pt(1.5, -4), b1 = pt(1.5, 4);
  p.line(b0.x, b0.y, b1.x, b1.y, ROOT[3]); p.line(b0.x, b0.y + 1, b1.x, b1.y + 1, ROOT[1]);
  for (const k of [-2.5, 0.5, 2.5]) {
    const b = pt(1, k), sw = Math.sin(P.robeT + k) * 0.6;
    p.line(b.x, b.y + 1, b.x + sw, b.y + 3, RAG[1]);
    p.px(b.x + sw, b.y + 4, BONE[k > 0 ? 4 : 3]); p.px(b.x + sw + (k > 0 ? 1 : 0), b.y + 5, BONE[2]);
  }
  const sk = pt(1.5, 1.5); // Schädelchen am Gürtel
  p.rect(sk.x - 1, sk.y, 3, 2, BONE[3]); p.px(sk.x - 1, sk.y, BONE[5]); p.px(sk.x, sk.y + 1, '#0a0806'); p.px(sk.x + 1, sk.y + 1, '#0a0806');

  // --- Moosmantel über den Schultern + Kapuze
  const col = pt(SD.spine, -0.5);
  ell(p, col.x, col.y, 5, 2.8, MOSS, { noise: 0.2, seed: 21 });
  for (let i = -4; i <= 4; i += 1.3) {
    const x = col.x + i, y = col.y + 2 + (hash2(Math.round(i * 3), 1, 22) * 2.5 | 0);
    p.line(x, col.y + 1, x - P.robe * 0.5, y, MOSS[i < 0 ? 2 : 3]);
  }
  // Leuchtpilzchen auf der Schulter
  const mu = pt(SD.spine + 0.5, -3.2);
  p.px(mu.x, mu.y - 1, TOX[3]); p.px(mu.x + 1, mu.y - 1, TOX[4]); p.px(mu.x + 0.5, mu.y, BONE[2]);
  g.px(mu.x, mu.y - 1, GT[1]); g.px(mu.x + 1, mu.y - 1, GT[2]);

  // --- Kopf: Kapuze mit Hirschschädel-Maske
  const neck = pt(SD.spine + 2.5, 0.5);
  const hx = Math.round(neck.x + P.head), hy = Math.round(neck.y - 2 + P.headY);
  ell(p, hx - 0.5, hy, 3.8, 3.8, near, { seed: 23 });
  p.px(hx - 4, hy + 2, RAG[2]); p.px(hx - 4.5, hy + 3, RAG[1]); p.px(hx - 5, hy + 4, RAG[1]);
  // Geweihstangen aus der Kapuze
  for (const [dx, dir, c] of [[-1.5, -1, BONE[2]], [1, 1, BONE[4]]]) {
    const b = { x: hx + dx, y: hy - 3 };
    const a = root(b.x, b.y, -Math.PI / 2 - 0.35 + dir * 0.2, -0.12 * dir, 4, 1.5);
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
  // leuchtende Augenhöhlen
  const eOn = P.eye > 0.3;
  p.rect(hx + 1, hy - 1, 2, 2, '#0a0806');
  if (eOn) { p.px(hx + 2, hy - 0.5, TOX[4]); p.px(hx + 1, hy - 0.5, TOX[2]); g.px(hx + 2, hy - 0.5, GT[4]); g.px(hx + 1, hy - 0.5, GT[2]); g.px(hx + 3, hy - 0.5, GT[1]); }
  meta.eye = { x: hx + 2, y: hy - 0.5 };
  meta.head = { x: hx, y: hy - 8 };
  meta.mouth = { x: hx + 5, y: hy + 2 };

  // --- vorderer Arm + Stab
  const st = drawStaff(p, g, armF.ex, armF.ey, P.staffA, P);
  cap(p, shF.x, shF.y, armF.jx, armF.jy, 2, 1.7, near);
  cap(p, armF.jx, armF.jy, armF.ex, armF.ey, 1.3, 1.1, [S_SKIN[1], S_SKIN[2], S_SKIN[3], S_SKIN[4]]);
  p.px(armF.jx, armF.jy + 1, RAG[4]); p.px(armF.jx - 0.5, armF.jy + 2, RAG[3]); // Ärmelfetzen
  p.rect(armF.ex - 1, armF.ey - 1, 2, 2, S_SKIN[3]); p.px(armF.ex - 1, armF.ey - 1, S_SKIN[4]);
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
  for (let i = 1; i < N - 1; i++) {
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
  for (let i = 1; i < N - 1; i++) { const a = pts[i]; p.px(a.x, a.y + a.r - 0.5, LEECH[1]); if (i % 2) p.px(a.x, a.y + a.r - 1.5, STRIPE[0]); }
  // --- Kopf mit Saugscheibe
  const h = pts[N - 1], h2 = pts[N - 2];
  const ang = Math.atan2(h.y - h2.y, h.x - h2.x) + P.head;
  const ux = Math.cos(ang), uy = Math.sin(ang);
  const dx = h.x + ux * (h.r + 0.5), dy = h.y + uy * (h.r + 0.5);
  const dr = 2.2 + P.open * 1.2;
  ell(p, dx, dy, 1.4 + P.open * 0.4, dr, [LEECH[2], LEECH[3], LEECH[4], LEECH[5]], { rot: ang });
  if (P.open > 0.15) {
    ell(p, dx + ux * 0.6, dy + uy * 0.6, 0.8 + P.open * 0.2, dr - 0.8, ['#2a0608', '#5a0e12', '#8a1c1c'], { rot: ang });
    for (let k = 0; k < 6; k++) {
      const a2 = ang + Math.PI / 2 + (k / 5 - 0.5) * Math.PI * 0.9 * 2;
      p.px(dx + ux * 0.8 + Math.cos(a2) * (dr - 0.6) * 0.5, dy + uy * 0.8 + Math.sin(a2) * (dr - 0.6), BONE[4]);
    }
    g.px(dx + ux, dy + uy, '#4a0a0a');
  } else p.line(dx + ux * 0.8 - uy * (dr - 1), dy + uy * 0.8 + ux * (dr - 1), dx + ux * 0.8 + uy * (dr - 1), dy + uy * 0.8 - ux * (dr - 1), LEECH[0]);
  // Augenpunkte: Reihe roter Punktaugen auf dem Kopflappen, darüber eine dunkle Falte
  const ex = h.x - uy * -h.r * 0.1 + ux * 0.5, ey = h.y - h.r * 0.6;
  p.px(ex - 0.5, ey - 1, LEECH[1]); p.px(ex - 2, ey - 0.7, LEECH[2]);
  if (P.glow > 0.1) {
    p.px(ex, ey, '#ff6a40'); p.px(ex - 1.5, ey + 0.3, '#c03020'); p.px(ex - 3, ey + 0.6, '#801c14');
    g.px(ex, ey, '#c03020'); g.px(ex - 1.5, ey + 0.3, '#601008');
  }
  meta.eye = { x: ex, y: ey };
  meta.mouth = { x: dx + ux, y: dy + uy };
  meta.hand = meta.mouth;
  meta.head = { x: h.x, y: h.y - h.r - 2 };
  // Schleimspur
  if (P.amp > 0 && P.curl === 0) for (let i = 0; i < 4; i++) p.px(pts[0].x - 1 - i * 1.5, AY - 1, i % 2 ? SLIME[1] : SLIME[2]);
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
    p.px(x, y, TOAD[1]); p.px(x - 0.5, y - 1, TOAD[hash2(i, 3, 35) < 0.5 ? 6 : 7]);
  }
  // Leuchtbeulen auf dem Rücken
  const pusts = [[-5, -0.6], [-1.5, -0.85], [2.5, -0.75], [-7.5, -0.2], [0.5, -0.45], [-3.5, -0.3]];
  pusts.forEach(([dx, dy], i) => {
    const x = bx + dx * k, y = by + dy * ry;
    const r = (i < 3 ? 1.5 : 1) * (1 + P.puff * 0.5);
    const hot = P.pust * (i < 3 ? 1 : 0.55) * (0.7 + 0.3 * Math.sin(P.ph * TAU + i * 1.7));
    ell(p, x, y, r + 0.4, r * 0.85 + 0.3, [TOAD[1], TOAD[3], TOAD[4]]);
    ell(p, x, y - 0.2, r, r * 0.8, hot > 0.3 ? [TOX[1], TOX[2], TOX[3], TOX[4], TOX[5]] : [TOAD[2], TOAD[3], SLIME[1]]);
    if (hot > 0.3) glowDot(g, x, y - 0.2, r * hot, GT);
  });
  // --- Kopf (vorn im Rumpf), Kehlblase, Maul
  const hx = bx + rx * 0.62, hy = by - ry * 0.12 - P.headUp * 1.5;
  ell(p, hx + 1, hy + 0.5, 6, 4.3 * (1 - P.splat * 0.3), near, { noise: 0.12, seed: 37, rot: -P.headUp * 0.3 });
  // Hautfalte zwischen Kopf und Leib
  for (let j = -3; j <= 3; j++) p.px(hx - 5 + Math.abs(j) * 0.35, hy + j, j < 0 ? TOAD[2] : TOAD[1]);
  const mo = P.mouth;
  // Kehlblase (fahl, durchscheinend)
  const sr = 1.2 + P.sac * 4.2;
  if (P.sac > 0.02) {
    ell(p, hx + 3, hy + 4 + sr * 0.4 + mo, sr * 1.05, sr * 0.8, [T_BELLY[1], T_BELLY[2], T_BELLY[3], T_BELLY[4], '#e0dca0'], { bias: 0.08 });
    if (P.sac > 0.5) { p.px(hx + 2, hy + 3 + sr * 0.2 + mo, '#f0f0c8'); g.px(hx + 3, hy + 4 + sr * 0.4 + mo, GT[0]); }
    for (let j = 0; j < 3; j++) p.px(hx + 1 + j * 2, hy + 4 + sr * 0.6 + mo, T_BELLY[1]); // Adern
  }
  // Maul: breite Spalte, beim Spucken aufgeklappt
  const mx0 = hx - 3, mx1 = hx + 7, my = hy + 2;
  if (mo > 0.15) {
    poly(p, [[mx0, my], [mx1, my - 1 - P.headUp], [mx1 - 1, my + mo * 3.5], [mx0 + 1, my + mo * 1.5]], '#3a0e0c');
    p.line(mx0 + 2, my + mo * 1.5, mx1 - 1, my + mo * 3.2, T_BELLY[2]);   // Unterkiefer-Lippe
    p.line(mx0 + 3, my + 1, mx1 - 2, my + mo * 2, '#8a2a28');            // Zunge
    for (let x = mx0 + 2; x < mx1; x += 2) p.px(x, my + 0.5 + (x - mx0) * mo * 0.18, TOX[3]); // Schleimfäden
  } else {
    p.line(mx0, my, mx1, my - 1 - P.headUp, TOAD[0]); p.line(mx0 + 1, my - 1, mx1 - 1, my - 2 - P.headUp, TOAD[5]);
  }
  meta.mouth = { x: mx1 + 1, y: my - 0.5 + mo };
  meta.hand = meta.mouth;
  // Glotzauge + Ohrdrüse
  const ex = hx + 1, ey = hy - 3.8 * (1 - P.splat * 0.3);
  ell(p, ex - 5, ey + 1.5, 2.6, 1.6, near, { seed: 39 });    // Drüse
  p.px(ex - 6, ey + 1, TOX[2]); g.px(ex - 6, ey + 1, GT[1]); p.px(ex - 4, ey + 1.5, TOX[2]);
  ell(p, ex, ey, 2.7, 2.4, [TOAD[2], TOAD[4], TOAD[5], TOAD[6], TOAD[7]]);
  const eOn = P.eye > 0.3;
  if (eOn) {
    // goldene Iris mit dunklem Rand, waagerechte Pupille, Glanzpunkt
    p.rect(ex - 1, ey - 1, 3, 3, '#8a4a0a');
    p.rect(ex - 0.5, ey - 1, 2, 2, '#e89a18'); p.px(ex - 1, ey - 1, '#ffe080');
    p.line(ex - 1, ey + 0.5, ex + 1.5, ey + 0.5, '#140a04');
    g.px(ex, ey - 0.5, '#a05a08'); g.px(ex + 1, ey - 0.5, '#6a3a04');
  } else p.line(ex - 1, ey + 0.5, ex + 1.5, ey + 0.5, TOAD[1]);
  // schwerer Augenwulst: helle Oberkante, Schatten darunter
  p.line(ex - 2, ey - 2.5, ex + 1.5, ey - 2.8, TOAD[7]); p.px(ex + 2.5, ey - 2, TOAD[5]);
  p.px(ex - 2.5, ey + 1.5, TOAD[1]); p.px(ex + 2.6, ey + 1, TOAD[1]);
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
    p.px(t[0] + Math.cos(aa + 0.4), t[1] + Math.sin(aa + 0.4), near ? BONE[4] : BONE[2]);
  }
}

// Wurzelgeweih: Hauptstange mit zwei Sprossen.
function antler(p, x, y, a, c, n, near, ph) {
  const R = near ? [ROOT[3], ROOT[4], BONE[2], BONE[3], BONE[4]] : [ROOT[1], ROOT[2], ROOT[3], ROOT[4]];
  const pts = root(x, y, a, c, n, 2.6, 0.05, ph);
  chain(p, pts, 2, 0.8, R);
  for (const [i, da, m] of [[2, 1.05, 3], [4, 0.9, 3], [5, -0.85, 2]]) {
    if (i >= pts.length - 1) continue;
    const b = pts[i], a0 = Math.atan2(pts[i + 1][1] - b[1], pts[i + 1][0] - b[0]);
    const q = root(b[0], b[1], a0 + da, -da * 0.12, m, 2.4);
    chain(p, q, 1.3, 0.6, R);
    const t = q[q.length - 1]; p.px(t[0], t[1], near ? BONE[3] : BONE[1]);
  }
  const t = pts[pts.length - 1]; p.px(t[0], t[1], near ? BONE[4] : BONE[2]);
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
    if (hash2(i, 5, 61) < 0.3) { p.px(px, py - r, TOX[3]); g.px(px, py - r, GT[1]); }
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
  }
}

function drawHorror(p, g, P, X) {
  const R = horrorRig(P);
  const { hip, chest, pt, legF, legB, shF, shB, armF, armB } = R;
  const { AY } = BH;
  const meta = {};
  const far = H_MUD_D, near = H_MUD;
  const E = WISP;

  // --- hinterer Arm
  cap(p, shB.x, shB.y, armB.jx, armB.jy, 5.2, 4.4, far, { noise: 0.2, seed: 53 });
  cap(p, armB.jx, armB.jy, armB.ex, armB.ey, 4.4, 3.4, far, { noise: 0.2, seed: 54 });
  rootHand(p, armB.ex, armB.ey, Math.atan2(armB.ey - armB.jy, armB.ex - armB.jx) * 0.6 + 0.3, P.splash, far, false);
  // --- hinteres Bein
  cap(p, hip.x - 3, hip.y, legB.jx, legB.jy, 7, 6, far, { noise: 0.2, seed: 55 });
  cap(p, legB.jx, legB.jy, legB.ex, legB.ey - 1, 6, 6.5, far, { noise: 0.2, seed: 56 });
  for (let k = -1; k <= 2; k++) p.line(legB.ex + k * 1.5, legB.ey - 2, legB.ex + k * 3 - 1, AY - 1, ROOT[1]);

  // --- Moosbärte hinten am Buckel
  const back = pt(BD.spine + 2, -9);
  for (let i = 0; i < 7; i++) {
    const len = 12 + (hash2(i, 1, 57) * 9 | 0);
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

  // --- Leib: Hüftmasse, Rumpf, Buckel
  ell(p, hip.x, hip.y, 13, 11, near, { noise: 0.22, seed: 58 });
  cap(p, hip.x, hip.y, chest.x, chest.y, 13, 15.5, near, { noise: 0.22, seed: 59 });
  const hump = pt(BD.spine - 1, -6);
  ell(p, hump.x, hump.y, 17, 12.5, near, { noise: 0.25, seed: 60, rot: P.lean * 0.6 });
  // Wurzeln quer über den Leib
  for (let i = 0; i < 4; i++) {
    const a = pt(2 + i * 4.5, -9 + (i & 1) * 2), b = pt(5 + i * 4, 8 - (i & 1) * 3);
    const pts = root(a.x, a.y, Math.atan2(b.y - a.y, b.x - a.x) - 0.3, 0.12, 6, Math.hypot(b.x - a.x, b.y - a.y) / 6, 0.1, i);
    chain(p, pts, 1.3, 0.9, [ROOT[1], ROOT[2], ROOT[3], ROOT[4]]);
  }
  // Schlammklumpen und Knochensplitter im Leib
  for (let i = 0; i < 10; i++) {
    const q = pt(hash2(i, 1, 62) * BD.spine, (hash2(i, 2, 62) - 0.6) * 20);
    if (hash2(i, 3, 62) < 0.5) ell(p, q.x, q.y, 1.8, 1.3, [H_MUD[2], H_MUD[3], H_MUD[5]]);
    else { p.line(q.x, q.y, q.x + 2, q.y - 1, BONE[2]); p.px(q.x + 2, q.y - 1, BONE[4]); }
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
  }
  occlude(g);
  for (let i = 0; i < 5; i++) { // Rippen: Bögen vom Rückgrat nach vorn, verdecken das Licht
    const yy = rc.y - rr * 0.85 + i * rr * 0.4;
    const pts = [];
    for (let s2 = 0; s2 <= 6; s2++) {
      const a = -Math.PI * 0.6 + s2 / 6 * Math.PI * 1.0;
      pts.push([rc.x + Math.cos(a) * (rr + 1 + P.ribs), yy + Math.sin(a) * 2 + s2 * 0.45]);
    }
    chain(p, pts, 1.1, 0.8, [BONE[1], BONE[2], BONE[3], BONE[4], BONE[5]]);
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
    for (let j = 0; j < len; j++) p.px(x + Math.sin(P.ph + i + j * 0.6) * 0.5, y + j, j % 3 === 2 ? MOSS[2] : MOSS[4]);
  }
  for (const [dx, dy, s3] of [[-9, -11, 1.6], [-3, -12.5, 2.2], [4, -11, 1.4], [10, -7.5, 1.8]]) { // Leuchtpilze
    const x = hump.x + dx, y = hump.y + dy;
    p.line(x, y, x, y + 2, BONE[2]);
    ell(p, x, y - 0.5, s3, s3 * 0.6, [TOX[1], TOX[2], TOX[3], TOX[4]]);
    glowDot(g, x, y - 0.5, s3 * 0.6 * P.heart, GT);
  }
  // Schlammtropfen vom Bauch
  const belly = pt(4, 9);
  drip(p, g, belly.x, belly.y + 2, 4, P.dr, MUDDRIP);
  drip(p, g, belly.x - 5, belly.y + 1, 3, P.dr + 0.5, MUDDRIP);

  // --- vorderes Bein
  cap(p, hip.x + 3, hip.y, legF.jx, legF.jy, 7.5, 6.5, near, { noise: 0.2, seed: 66 });
  cap(p, legF.jx, legF.jy, legF.ex, legF.ey - 1, 6.5, 7, near, { noise: 0.2, seed: 67 });
  for (let k = -1; k <= 2; k++) { p.line(legF.ex + k * 2, legF.ey - 2, legF.ex + k * 3.5 + 1, AY - 1, ROOT[k === 1 ? 4 : 2]); }
  p.rect(legF.ex - 5, AY - 2, 11, 1, H_MUD[2]);
  // Wurzelranke ums Knie
  p.line(legF.jx - 4, legF.jy - 1, legF.jx + 4, legF.jy + 2, ROOT[3]); p.line(legF.jx - 4, legF.jy + 1, legF.jx + 4, legF.jy + 4, ROOT[2]);

  // --- vorderer Arm (erhoben: hinter dem Kopf, sonst davor)
  const armUp = P.hFy < -8;
  const drawFrontArm = () => {
  const armR = [H_MUD[1], H_MUD[2], H_MUD[3], H_MUD[4], H_MUD[5], H_MUD[6], '#857a52'];
  // dunkle Kontur trennt den Arm vom Leib
  cap(p, shF.x, shF.y, armF.jx, armF.jy, 7, 6, [BLACK]); cap(p, armF.jx, armF.jy, armF.ex, armF.ey, 6, 4.8, [BLACK]);
  cap(p, shF.x, shF.y, armF.jx, armF.jy, 6, 5, armR, { noise: 0.2, seed: 70 });
  ell(p, shF.x - 1, shF.y - 1, 6.5, 5.5, armR, { noise: 0.25, seed: 71 }); // Schulterballen
  p.line(shF.x - 4, shF.y - 3, shF.x + 3, shF.y - 5, BONE[3]); p.px(shF.x + 3, shF.y - 5, BONE[5]); // Knochenzacke
  cap(p, armF.jx, armF.jy, armF.ex, armF.ey, 5, 3.8, armR, { noise: 0.2, seed: 72 });
  for (let s4 = 0.2; s4 < 0.9; s4 += 0.3) { // Wurzelbänder
    const x = armF.jx + (armF.ex - armF.jx) * s4, y = armF.jy + (armF.ey - armF.jy) * s4;
    p.line(x - 3, y - 1, x + 3, y + 2, ROOT[3]); p.px(x + 3, y + 2, ROOT[5]);
  }
  drip(p, g, armF.jx + 1, armF.jy + 3, 4, P.dr + 0.3, MUDDRIP);
  const fa = Math.atan2(armF.ey - armF.jy, armF.ex - armF.jx);
  rootHand(p, armF.ex, armF.ey, fa * 0.6 + 0.2, P.splash, armR, true);
  meta.hand = { x: armF.ex + Math.cos(fa) * 4, y: armF.ey + Math.sin(fa) * 4 };

  };
  if (armUp) drawFrontArm();

  // --- Kopf: Elchschädel am Schlammhals, Wurzelgeweih
  const neck = pt(BD.spine + 1, 8);
  const hx = neck.x + 6 + P.head, hy = neck.y + 3 + P.headY;
  cap(p, neck.x - 3, neck.y - 1, hx - 1, hy, 6, 4, near, { noise: 0.2, seed: 68 });
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
  // Moos auf dem Schädel
  const mt = Hh(-2, -3.5); ell(p, mt.x, mt.y, 3, 1.5, MOSS, { noise: 0.4, seed: 69 });
  // Augenhöhle
  const eh = Hh(3.5, -1.2);
  ell(p, eh.x, eh.y, 2.2, 1.7, ['#060504', '#0c0a08']);
  if (P.eye > 0.3) {
    p.px(eh.x + 0.5, eh.y, TOX[5]); p.px(eh.x - 0.5, eh.y, TOX[3]);
    g.px(eh.x + 0.5, eh.y, GT[4]); g.px(eh.x - 0.5, eh.y, GT[3]); g.px(eh.x + 1.5, eh.y, GT[2]); g.px(eh.x + 0.5, eh.y - 1, GT[1]); g.px(eh.x + 0.5, eh.y + 1, GT[1]);
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
