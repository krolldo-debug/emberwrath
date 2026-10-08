import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame, SpriteFrame, Animation } from '../gfx/Sprite.js';
import { hash2 } from '../core/math.js';

// Gegner des Sporenschlunds (Stufe 30–32): Sporling (Schwarm, hüpft),
// Pilzwüterich (schwer, Stampfer) und Sporenwirker (Zauberer, Giftsporen,
// Spezialangriff Giftwolke). Grüne und violette Biolumineszenz auf der
// Leucht-Ebene (frame.glow).
//
// Aufbau wie foes_ashwood.js: kleine Rigs mit Schlüsselposen, die beim Laden
// weich interpoliert werden. frame.meta: eye/hand/mouth/head (relativ zum
// Anker), bei Zauberern ist meta.hand die Mündung (Sporenkapsel).
// frame.fx: 'step' | 'impact' | 'cast'. Blickrichtung rechts, Anker = Bodenkontakt.

// ================================================================ Werkzeuge

const ease = (t) => t * t * (3 - 2 * t);
const linear = (t) => t;
const snap = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
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

// Schwung-Schleier: überstreicht die Klinge von a0 nach a1 (Drehpunkt cx/cy),
// frisch (am Ende) breit und hell, am Anfang schmal. sy staucht die
// Bahn senkrecht (waagerechte Hiebe in 3/4-Sicht).
function smearArc(p, g, cx, cy, a0, a1, r0, r1, cols, gcols, sy = 1) {
  // geschlossene Sichel ohne Raster: dünn am Anfang, zur Klinge hin breit,
  // Außenkante hell (Klingenbahn), innen dunkler auslaufend
  const n = Math.ceil(Math.abs(a1 - a0) * r1 * 1.6) + 2;
  for (let i = 0; i <= n; i++) {
    const f = i / n, a = a0 + (a1 - a0) * f;
    const w = (r1 - r0) * (0.12 + 0.88 * f * f);
    for (let r = r1 - w; r <= r1; r += 0.5) {
      const radial = (r - (r1 - w)) / (w || 1);
      const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r * sy);
      const c = radial > 0.8 ? cols[2] : radial > 0.4 ? cols[1] : cols[0];
      p.px(x, y, c);
      if (g && gcols && f > 0.35 && radial > 0.45) g.px(x, y, radial > 0.8 ? gcols[1] : gcols[0]);
    }
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

// Licht von links oben, leicht zum Betrachter (wie foes_steppe.js): Material
// wird pro Pixel über die Flächennormale schattiert statt in festen Bändern.
const LX = -0.52, LY = -0.66, LZ = 0.54;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function tone(ramp, nx, ny, nz, bias, noise) {
  const t = 0.28 + 0.62 * (nx * LX + ny * LY + nz * LZ) + bias + noise;
  return ramp[clamp(Math.floor(t * ramp.length), 0, ramp.length - 1)];
}

// Schattierte Ellipse (optional gedreht, mit Materialrauschen und Clip)
function ell(p, cx, cy, rx, ry, ramp, o = {}) {
  const { rot = 0, noise = 0, seed = 1, bias = 0, clip = null } = o;
  const c = Math.cos(rot), s = Math.sin(rot);
  const R = Math.ceil(Math.max(rx, ry)) + 1;
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
      p.px(x, y, tone(ramp, nx, ny, nz, bias, n));
    }
  }
}

// Schattierte Kapsel (Gliedmaßen, Rumpf): Radius r0 -> r1, rundes Volumen
function capsule(p, x0, y0, x1, y1, r0, r1, ramp, o = {}) {
  const { noise = 0, seed = 1, bias = 0 } = o;
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 0.0001;
  const R = Math.ceil(Math.max(r0, r1)) + 1;
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
      p.px(x, y, tone(ramp, nx, ny, nz, bias, n));
    }
  }
}

// Randlicht: kühles Höhlenlicht (blasses Violett) auf Ober- und linken Kanten,
// damit die Figuren sich vom dunklen Myzelboden lösen. Läuft vor dem Umriss.
const RIM = [214, 200, 228];
function rimLight(p, k1 = 0.34, k2 = 0.18) {
  const { w, h } = p;
  const img = p.ctx.getImageData(0, 0, w, h), d = img.data;
  const op = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) op[i] = d[i * 4 + 3] > 40 ? 1 : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!op[i]) continue;
    const up = y > 0 ? op[i - w] : 0, lf = x > 0 ? op[i - 1] : 0;
    const k = !up ? k1 : !lf ? k2 : 0;
    if (!k) continue;
    const j = i * 4;
    d[j] += (RIM[0] - d[j]) * k; d[j + 1] += (RIM[1] - d[j + 1]) * k; d[j + 2] += (RIM[2] - d[j + 2]) * k;
  }
  p.ctx.putImageData(img, 0, 0);
}

// Baut einen Frame: draw(p, g, P, extra) -> meta (absolute Koordinaten).
// extra.rot = [winkel, drehpunktX, drehpunktY] kippt die ganze Figur (Sturz).
function makeFrame(W, H, AX, AY, draw, P, extra = {}) {
  const g = new PixelCanvas(W, H);
  let meta = {};
  const f = buildFrame(W, H, AX, AY, (p) => {
    if (extra.rot && Math.abs(extra.rot[0]) > 0.001) {
      // Auf eine gepolsterte Leinwand zeichnen, drehen und die Figur wieder
      // auf den Boden setzen (unterstes Pixel = Bodenlinie).
      const PAD = 24, HH = H + PAD * 2;
      const tp = new PixelCanvas(W, HH), tg = new PixelCanvas(W, HH);
      tp.ctx.translate(0, PAD); tg.ctx.translate(0, PAD);
      meta = draw(tp, tg, P, extra) || {};
      tp.ctx.setTransform(1, 0, 0, 1, 0, 0); tg.ctx.setTransform(1, 0, 0, 1, 0, 0);
      const [a, rx, ry0] = extra.rot, ry = ry0 + PAD;
      const rp = new PixelCanvas(W, HH), rg = new PixelCanvas(W, HH);
      rotBlit(tp, rp, rx, ry, a); rotBlit(tg, rg, rx, ry, a);
      const d = rp.ctx.getImageData(0, 0, W, HH).data;
      let bottom = -1;
      for (let y = HH - 1; y >= 0 && bottom < 0; y--) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 40) { bottom = y; break; }
      const shift = bottom >= 0 ? (AY - 1) - (bottom - PAD) : 0;
      p.ctx.drawImage(rp.canvas, 0, shift - PAD); g.ctx.drawImage(rg.canvas, 0, shift - PAD);
      const c = Math.cos(a), s = Math.sin(a);
      for (const k in meta) {
        const m = meta[k], dx = m.x - rx, dy = m.y - ry0;
        meta[k] = { x: rx + dx * c - dy * s, y: ry0 + dx * s + dy * c + shift };
      }
    } else meta = draw(p, g, P, extra) || {};
    if (extra.post) Object.assign(meta, extra.post(p, g) || {});
    rimLight(p);
  });
  f.glow = new SpriteFrame(g.canvas, AX, AY);
  f.meta = {};
  for (const k in meta) f.meta[k] = { dx: Math.round(meta[k].x - AX), dy: Math.round(meta[k].y - AY) };
  f.fx = extra.fx ?? null;
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

// Violette Pilzhüte, blasses Pilzfleisch, Lamellen, grüne und violette
// Biolumineszenz, Moos, Wurzelholz.
const CAP = ['#140a1a', '#28122f', '#401c4a', '#5c2a66', '#7c3e86', '#9e5ca6', '#c488c8'];
const FL = ['#1c1816', '#332d28', '#51473b', '#736752', '#978a70', '#bdb192', '#e0d6b8'];
const GILL = ['#191216', '#2c2026', '#46333c', '#5e4650'];
const GG = ['#0a2e10', '#166c1c', '#36bc32', '#92ee62', '#e0ffbc', '#ffffff'];
const GV = ['#280a44', '#5a1c90', '#9848dc', '#d09aff', '#f4e4ff'];
const MOSS = ['#0b150d', '#152418', '#203724', '#2f4e33', '#436a45', '#5c8858'];
const ROOT = ['#130d0b', '#231913', '#39291d', '#523e2a', '#6c563a'];
const SPORE_C = [GG[1], GG[2], GG[3]];
const SPORE_G = [GG[2], GG[4]];

// Sporenwolke: verstreute, leuchtende Pünktchen um (x, y), deterministisch
function sporePuff(p, g, x, y, r, k, seed, n = 18, ramp = GG) {
  if (k <= 0.02) return;
  for (let i = 0; i < n; i++) {
    const a = hash2(i, seed, 61) * TAU, d = Math.sqrt(hash2(seed, i, 62)) * r * (0.4 + k * 0.6);
    const px_ = x + Math.cos(a) * d, py_ = y + Math.sin(a) * d * 0.75 - k * hash2(i, i, 63) * 3;
    const b = hash2(i, seed, 64);
    if (b < k) {
      g.px(px_, py_, b < 0.3 ? ramp[4] : b < 0.65 ? ramp[3] : ramp[2]);
      if (b < 0.25) { g.px(px_ + 1, py_, ramp[1]); g.px(px_, py_ + 1, ramp[1]); }
    }
  }
}

// Pilzhut: Kuppel mit Licht von links oben, Leuchtflecken, Lamellenrand.
// cx/cy = Mitte des Hutrands, rx/ry = Halbachsen der Kuppel.
function drawCap(p, g, cx, cy, rx, ry, spots, glowK, seed, ramp = CAP, droop = 0) {
  const dr = (u) => droop * u * u * 1.5;              // Hängen der Hutkrempe
  // Lamellen (Unterseite): dunkle Schale, Rippen laufen strahlenförmig zum Stiel
  const gy = Math.max(1.2, ry * 0.3);
  p.ellipse(cx, cy + 0.5, rx - 0.5, gy, GILL[1]);
  p.ellipse(cx + 0.5, cy + 0.5, rx * 0.45, gy * 0.6, GILL[0]);
  for (let x = -rx + 1.5; x <= rx - 1.5; x += 1.5) {
    const u = x / rx, yy = cy + 0.5 + dr(u) + (Math.abs(u) < 0.5 ? 0.5 : 0);
    p.px(cx + x, yy, x < 0 ? GILL[3] : GILL[2]);
    if (Math.abs(u) > 0.35) p.px(cx + x * 0.8, yy + 0.6, GILL[2]);
    if (glowK > 0) g.px(cx + x, yy + 0.5, glowK > 0.9 && (Math.round(x * 2) % 3 === 0) ? GG[2] : GG[1]);
  }
  // Kuppel: per Normale schattiert, feines Fleischrauschen, unten dunkler Saum
  const R = Math.ceil(rx) + 1;
  for (let y = Math.floor(cy - ry); y < cy; y++) {
    for (let x = Math.floor(cx - R); x <= cx + R; x++) {
      const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
      const d2 = u * u + v * v;
      if (d2 > 1) continue;
      const nz = Math.sqrt(1 - d2) * 0.9 + 0.1;
      const n = (hash2(x - Math.round(cx) + 64, y - Math.round(cy) + 64, seed) - 0.5) * 0.12;
      let c = tone(ramp, u, v, nz, 0.06, n);
      const edge = cy - y < 1.2;
      if (edge) c = ramp[Math.max(1, ramp.indexOf(c) - 2)];
      const yy = y + dr(u);
      p.px(x, yy, c);
      if (edge && droop > 0.3) p.px(x, yy + 1, ramp[1]);
    }
  }
  // Heller Krempensaum oben links und Glanz auf der Kuppel (feuchte Haut)
  for (let x = -rx + 1; x < -rx * 0.35; x += 1) p.px(cx + x, cy - 1.6 + dr(x / rx), ramp[4]);
  p.px(cx - rx * 0.38, cy - ry * 0.7, ramp[6]); p.px(cx - rx * 0.38 + 1, cy - ry * 0.7, ramp[6]);
  p.px(cx - rx * 0.5, cy - ry * 0.55, ramp[6]);
  // Leuchtflecken als erhabene Warzen: Kern, Glanzpunkt oben links, Schatten unten rechts
  for (let i = 0; i < spots; i++) {
    const a = -Math.PI * (0.15 + 0.7 * hash2(i, seed, 51)), d = 0.35 + hash2(seed, i, 52) * 0.5;
    const sx = Math.round(cx + Math.cos(a) * rx * d), sy = Math.round(cy + Math.sin(a) * ry * d + dr(Math.cos(a) * d));
    const big = hash2(i, seed, 53) < 0.45;
    const lit = glowK > 0.2;
    if (big) {
      p.px(sx + 1, sy + 1, ramp[1]); p.px(sx, sy + 1, ramp[2]);
      p.px(sx, sy, lit ? GG[3] : ramp[5]); p.px(sx + 1, sy, lit ? GG[2] : ramp[4]);
      p.px(sx, sy - 1, lit ? GG[4] : ramp[6]);
    } else {
      p.px(sx, sy + 1, ramp[2]); p.px(sx, sy, lit ? GG[3] : ramp[5]);
    }
    if (lit) {
      g.px(sx, sy, glowK > 0.8 ? GG[4] : GG[3]); if (big) { g.px(sx + 1, sy, GG[2]); g.px(sx, sy - 1, GG[3]); }
      if (glowK > 0.8) { g.px(sx - 1, sy, GG[1]); g.px(sx + 1, sy - 1, GG[1]); }
    }
  }
}

// ================================================================ Sporling (sporeling)

const SW = 44, SH = 38, SAX = 20, SAY = 33;
const S_REST = { sq: 0, air: 0, tilt: 0, lx: 0, leg: 0, arm: 0, eye: 1, glow: 0.6, puff: 0, dead: 0, wob: 0, mouth: 0 };
const spose = (o = {}) => ({ ...S_REST, ...o });

function drawSporeling(p, g, P, X) {
  const meta = {};
  const sq = P.sq, d = P.dead;
  const bx = SAX + P.lx, by = SAY - 1 - P.air;
  const bw = 3.6 * (1 + sq * 0.3), bh = 4.8 * (1 - sq * 0.35) * (1 - d * 0.4);
  const cyB = by - 1.5 - bh;                    // Körpermitte
  const t = P.tilt;

  // --- Wurzelfüßchen (hinteres im Schatten), mit Zehenfasern
  const legY = by, dang = P.air > 0.5 ? 1 : 0;
  const lf = Math.sin(P.leg * TAU) * 1.2, lb = -lf;
  const flatL = d > 0.5 ? 1 : 0;
  const foot = (x, y, near) => {
    const R = near ? ROOT : [ROOT[0], ROOT[0], ROOT[1], ROOT[2], ROOT[2]];
    p.rect(x, y, 2, 2 - flatL, R[2]); p.px(x, y, R[near ? 4 : 3]); p.px(x + 1, y + 1 - flatL, R[1]);
    p.px(x + 2, y + 1 - flatL, R[1]);                    // Zehenfaser nach vorn
  };
  foot(bx - 2 + lb - dang, legY - 1 - dang * 0.5, false);
  foot(bx + 1 + lf + dang, legY - 1 + dang * 0.5, true);

  // --- Stielkörper: rundlich, blass, mit Längsfasern und Schattenseite
  const tx0 = bx + t * 0.5;
  ell(p, tx0, cyB + 0.5, bw, bh, FL.slice(1), { bias: 0.1 });
  p.px(tx0 + bw - 1.5, cyB + bh - 1, FL[2]); p.px(tx0 + 0.5, cyB + bh - 0.5, FL[2]);   // Faserkerben unten
  // Ärmchen: kurze Wurzelstummel mit Fingerfasern
  const aw = Math.sin(P.arm) * 1.2;
  const ax1 = bx + bw + 1.5 + t * 0.6, ay1 = cyB + 2 + aw;
  p.line(tx0 - bw + 0.5, cyB + 0.5, bx - bw - 1.2 + t * 0.4, cyB + 2 - aw, FL[1]);
  p.line(bx + bw - 0.5 + t * 0.5, cyB + 0.5, ax1, ay1, FL[4]);
  p.px(ax1 + 1, ay1, FL[3]); p.px(ax1, ay1 + 1, FL[2]);

  const fx = Math.round(bx + bw - 1.5 + t * 0.6), fy = Math.round(cyB);

  // --- Hut: breit, leicht schief, wackelt
  const crx = 6.8 * (1 + sq * 0.18) - d * 0.6, cry = 6.6 * (1 - sq * 0.25) * (1 - d * 0.35);
  const ccx = bx + t * 1.6 + Math.sin(P.wob) * 0.6, ccy = cyB - bh + 1.5 + d * 1.5;
  drawCap(p, g, ccx, ccy, crx, cry, 5, P.glow, 7, CAP, d * 1.2);
  // --- Gesicht liegt vor den Lamellen: Stiel oben neu, darauf Kragen und Gesicht
  if (d < 0.5) {
    ell(p, tx0, cyB + 0.5, bw, bh, FL.slice(1), { bias: 0.1, clip: (x, y) => y >= fy - 2 });
    // Ring (Manschette): gefranster Kragen
    const ry0 = fy - 3;
    for (let x = -bw + 0.5; x <= bw - 0.5; x += 1) p.px(tx0 + x, ry0 + 1, x < 0 ? FL[5] : FL[3]);
    p.px(tx0 - bw - 0.5, ry0 + 2, FL[4]); p.px(tx0 + bw + 0.5, ry0 + 2, FL[2]);       // Fransenenden
  }

  // --- Gesicht: tiefliegende Leuchtaugen unter zornigen Brauen, gezacktes Maul
  const eyeOn = P.eye > 0.3;
  // Augenhöhlen (dunkler Schatten unter dem Kragen) und Brauen schräg nach innen
  p.px(fx, fy, FL[0]); p.px(fx - 2, fy, FL[0]);
  p.px(fx - 1, fy - 1, FL[1]); p.px(fx - 2, fy - 1, FL[2]); p.px(fx, fy - 1, FL[2]);
  if (eyeOn) {
    p.px(fx, fy, GG[4]); p.px(fx - 2, fy, GG[3]);
    g.px(fx, fy, GG[5]); g.px(fx + 1, fy, GG[2]); g.px(fx - 2, fy, GG[4]); g.px(fx - 3, fy, GG[1]); g.px(fx, fy - 1, GG[1]);
  }
  if (P.mouth > 0.4) {
    p.rect(fx - 2, fy + 2, 3, 2, FL[0]); p.px(fx - 2, fy + 2, FL[6]); p.px(fx, fy + 2, FL[6]); p.px(fx - 1, fy + 3, FL[5]);
    if (eyeOn) g.px(fx - 1, fy + 3, GG[1]);
  } else { p.px(fx - 2, fy + 2, FL[0]); p.px(fx - 1, fy + 2, FL[0]); p.px(fx, fy + 2, FL[1]); }
  meta.eye = { x: fx, y: fy };
  meta.mouth = { x: fx, y: fy + 2 };

  meta.head = { x: ccx, y: ccy - cry };
  meta.hand = { x: fx + 1, y: fy + 1 };

  // --- Sporenstoß
  if (P.puff > 0) sporePuff(p, g, ccx, ccy - cry * 0.5, 6 + P.puff * 8, P.puff, 11 + Math.round(P.puff * 3), 26);
  return meta;
}

function sporelingAnims() {
  const mk = (P, X) => makeFrame(SW, SH, SAX, SAY, drawSporeling, P, X);
  const idle = [0, 1, 2, 3, 4, 5].map((i) => {
    const a = i / 6 * TAU;
    return mk(spose({ sq: 0.12 + Math.sin(a) * 0.12, wob: a, arm: a, glow: 0.55 + Math.sin(a) * 0.3 }));
  });
  // Hüpfen: stauchen → abstoßen → Flug → landen
  const hk = [
    [0, spose({ sq: 0.5, glow: 0.6 })],
    [0.18, spose({ sq: -0.35, air: 2, tilt: 0.4, arm: 1, glow: 0.7 }), snap],
    [0.45, spose({ sq: -0.15, air: 5, tilt: 0.6, arm: 2, leg: 0.25, wob: 1, glow: 0.8 })],
    [0.7, spose({ sq: -0.2, air: 2.5, tilt: 0.2, arm: 3, leg: 0.5, wob: 2, glow: 0.7 })],
    [0.85, spose({ sq: 0.6, air: 0, tilt: -0.2, arm: 4, wob: 3, glow: 0.6 })],
    [1, spose({ sq: 0.5, glow: 0.6, wob: 3.5 })],
  ];
  const walk = track(mk, hk, 8, { loop: true, extras: { 6: { fx: 'step' } } });
  // Ausholen: tief geduckt, Hut zittert, Flecken glühen auf
  const windup = [
    mk(spose({ sq: 0.45, glow: 0.8, wob: 0.8, mouth: 1 })),
    mk(spose({ sq: 0.75, glow: 1, wob: -0.8, lx: -1, mouth: 1 })),
    mk(spose({ sq: 0.9, glow: 1.2, wob: 1, lx: -1.5, mouth: 1, puff: 0.15 })),
  ];
  // Kopfstoß-Sprung, beim Aufprall platzt eine Sporenwolke
  const strike = [
    mk(spose({ sq: -0.45, air: 4, tilt: 1.4, lx: 3, glow: 1.2, arm: 2, mouth: 1 })),
    mk(spose({ sq: -0.2, air: 3, tilt: 2, lx: 7, glow: 1.3, arm: 3, puff: 0.6, mouth: 1 }), { fx: 'impact' }),
    mk(spose({ sq: 0.5, air: 0, tilt: 0.8, lx: 6, glow: 0.9, puff: 1, wob: 2 })),
    mk(spose({ sq: 0.2, lx: 3, glow: 0.7, puff: 0.5, wob: 3 })),
  ];
  const hurt = [mk(spose({ sq: -0.3, tilt: -1.5, lx: -2, air: 1, eye: 1, glow: 1, puff: 0.3, mouth: 1 })), mk(spose({ sq: 0.3, tilt: -0.5, lx: -1 }))];
  // Tod: platzt in einer Sporenwolke und fällt schlaff zusammen
  const death = [
    mk(spose({ sq: -0.4, tilt: -1.5, lx: -2, air: 1, glow: 1.2, mouth: 1 })),
    mk(spose({ sq: 0.6, tilt: -0.5, lx: -1.5, glow: 1.3, puff: 0.5, mouth: 1 })),
    mk(spose({ sq: 0.9, dead: 0.4, lx: -1.5, glow: 0.9, puff: 1, eye: 0.6 }), { fx: 'impact' }),
    mk(spose({ sq: 1.1, dead: 0.8, lx: -1.5, glow: 0.5, puff: 1.3, eye: 0.2 })),
    mk(spose({ sq: 1.2, dead: 1, lx: -1.5, glow: 0.3, puff: 0.7, eye: 0 })),
    mk(spose({ sq: 1.2, dead: 1, lx: -1.5, glow: 0, puff: 0, eye: 0 })),
  ];
  return {
    idle: new Animation(idle, 6),
    walk: new Animation(walk, 11),
    windup: new Animation(windup, 7, false),
    strike: new Animation(strike, 13, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 9, false),
  };
}

// ================================================================ Pilzwüterich (fungal_brute)

const FW = 124, FH = 100, FAX = 54, FAY = 94;
const FD = { legH: 16, thigh: 8.5, shin: 8.5, spine: 17, upper: 11, fore: 12, sh: 3, hipW: 3.5 };
const F_REST = {
  hipX: 0, hipY: 0, lean: 0.22, head: 0, fFx: 7, fFy: 0, fBx: -7, fBy: 0,
  hFx: 15, hFy: 23, hBx: -3, hBy: 23, capT: 0, glow: 0.6, eye: 1, jaw: 0, puff: 0, kneel: 0, capTilt: 0,
};
const fpose = (o = {}) => ({ ...F_REST, ...o });

// Knorrige Wurzelfaust mit Leuchtpilzchen
function rootFist(p, g, x, y, r, near, glow, seed) {
  const bias = near ? 0 : -0.2;
  ell(p, x, y, r, r * 0.9, ROOT, { noise: 0.25, seed: 7 + seed, bias });
  // Knöchelwülste: kleine runde Knorren mit eigenem Glanz
  for (let i = 0; i < 4; i++) {
    const a = -0.7 + i * 0.5;
    const kx = x + Math.cos(a) * (r - 1), ky = y + Math.sin(a) * (r - 1) * 0.9;
    ell(p, kx, ky, 1.6, 1.4, ROOT, { bias: bias + 0.05 });
    p.px(kx + 1, ky + 1, ROOT[0]);
  }
  // Rindenrisse
  p.line(x - r * 0.5, y - 1, x + 1, y + r * 0.4, ROOT[1]);
  // Wurzelfasern hängen herab
  for (let i = 0; i < 4; i++) {
    const fx = x - 3 + i * 2, fy = y + r * 0.75;
    const l = 2 + ((i + seed) & 1) + (i === 2 ? 1 : 0);
    p.line(fx, fy, fx - 0.5 + i * 0.3, fy + l, near ? ROOT[2] : ROOT[1]);
    p.px(fx - 0.5 + i * 0.3, fy + l, ROOT[0]);
  }
  if (near) {
    // kleiner Leuchtpilz auf dem Handrücken
    const mx = Math.round(x - r * 0.3), my = Math.round(y - r * 0.85);
    p.px(mx, my, FL[4]); p.px(mx, my - 1, CAP[5]); p.px(mx - 1, my - 1, CAP[4]); p.px(mx + 1, my - 1, CAP[3]); p.px(mx, my - 2, CAP[6]);
    if (glow > 0.2) { g.px(mx, my - 1, GG[3]); g.px(mx + 1, my - 2, GG[1]); }
  }
}

// Konsolenpilz (Baumschwamm) als Halbschale: Oberseite hell, Lamellen darunter
function bracket(p, g, x, y, w, glow, seed) {
  for (let i = 0; i < w; i++) {
    const f = i / (w - 1 || 1), h = Math.sin(f * Math.PI) * 2.4 + 0.6;
    for (let j = 0; j < h; j++) p.px(x + i, y - j, j >= h - 1 ? (f < 0.5 ? FL[6] : FL[5]) : j === 0 ? FL[2] : f < 0.4 ? FL[4] : FL[3]);
    p.px(x + i, y + 1, GILL[1]);
    if (i % 2) p.px(x + i, y + 1, GILL[3]);
    if (glow > 0.3 && (i + seed) % 4 === 0) g.px(x + i, y + 1, GG[1]);
  }
  p.px(x, y - 1, FL[6]);
}

function drawBrute(p, g, P, X) {
  const K = P.kneel;
  const PP = { ...P, hipY: P.hipY + K * 6 };
  const R = rig(PP, FD, FAX, FAY);
  const { hip, pt, legF, legB, shF, shB, armF, armB } = R;
  const meta = {};
  const glow = P.glow;
  if (K > 0.01) { // hinteres Knie am Boden
    const kx = hip.x - 4 - K * 3, ky = FAY - 2;
    legB.jx += (kx - legB.jx) * K; legB.jy += (ky - legB.jy) * K;
    legB.ex += (kx - 9 - legB.ex) * K; legB.ey += (FAY - legB.ey) * K;
  }
  const toes = (x, y, near) => {
    for (let k = 0; k < 4; k++) {
      const tx = x - 4 + k * 3;
      p.line(tx, y - 2, tx + 1.5 + k * 0.4, y - 0.5, near ? ROOT[2] : ROOT[1]);
      p.px(tx + 1.5 + k * 0.4, y - 0.5, near ? ROOT[3] : ROOT[1]);
    }
  };

  // --- 1. hinterer Arm (massig, im Schatten)
  capsule(p, shB.x, shB.y, armB.jx, armB.jy, 4.6, 4, MOSS, { noise: 0.3, seed: 11, bias: -0.22 });
  capsule(p, armB.jx, armB.jy, armB.ex, armB.ey, 4, 4.4, ROOT, { noise: 0.25, seed: 12, bias: -0.2 });
  rootFist(p, g, armB.ex, armB.ey, 5.5, false, glow, 2);

  // --- 2. hinteres Bein (stämmig, Wurzelzehen)
  capsule(p, hip.x - 3, hip.y, legB.jx, legB.jy, 4.8, 4.2, MOSS, { noise: 0.3, seed: 13, bias: -0.22 });
  capsule(p, legB.jx, legB.jy, legB.ex, legB.ey - 2, 4, 4.6, ROOT, { noise: 0.25, seed: 14, bias: -0.2 });
  toes(legB.ex, legB.ey, false);

  // --- 3. Rumpf: fassförmiger Leib aus Moos und Pilzgeflecht
  const hp = pt(0, 0), cp = pt(FD.spine, 0.5);
  const cpT = pt(FD.spine - 2.5, 0.5);
  capsule(p, hp.x, hp.y, cpT.x, cpT.y, 9.6, 10.8, MOSS, { noise: 0.1, seed: 4 });
  const q = (u, k, c) => { const o = pt(u, k); p.px(o.x, o.y, c); };
  // Bauch: blasses, faseriges Pilzfleisch, rund schattiert, mit Längsfasern
  const bc = pt(7.2, 5.6);
  ell(p, bc.x, bc.y, 4.4, 7, FL.slice(1), { rot: P.lean, noise: 0.16, seed: 9 });
  for (let k = 3.5; k <= 8; k += 1.5) for (let u = 1.5; u <= 12.5; u += 1) if ((u * 2 + k) % 3 > 0.8) {
    const o = pt(u, k);
    const dx = o.x - bc.x, dy = o.y - bc.y;
    const cl = Math.cos(P.lean), sl = Math.sin(P.lean);
    const uu = (dx * cl + dy * sl) / 4.4, vv = (-dx * sl + dy * cl) / 7;
    if (uu * uu + vv * vv < 0.8) p.px(o.x, o.y, k > 6.5 ? FL[1] : FL[2]);
  }
  // Moosbüschel: heller Kopf, dunkle Unterseite (Licht von oben)
  for (let i = 0; i < 18; i++) {
    const u = 1.5 + hash2(i, 1, 41) * (FD.spine - 2), k = -9 + hash2(i, 2, 41) * 11;
    const o = pt(u, k);
    p.px(o.x, o.y, MOSS[5]); p.px(o.x + 1, o.y, MOSS[4]); p.px(o.x, o.y + 1, MOSS[1]); p.px(o.x + 1, o.y + 1, MOSS[0]);
  }
  for (let k = -8; k <= 2; k += 1) q(FD.spine + 0.5 - Math.abs(k + 3) * 0.12, k, MOSS[5]);
  // hängende Moosfäden unter dem Bauch
  for (let i = 0; i < 5; i++) { const o = pt(0.5, -6 + i * 3); p.line(o.x, o.y, o.x - 0.5, o.y + 2 + (i & 1), MOSS[2]); }
  // Leuchtknoten (wenige, dafür deutlich, mit dunklem Hof)
  const nodes = [[6, -3], [10, 1.5], [3.5, 1], [12, -5]];
  // als Büschel winziger Leuchtpilze: Stielchen, leuchtendes Köpfchen
  for (const [u, k] of nodes) {
    const o = pt(u, k), ox = Math.round(o.x), oy = Math.round(o.y);
    for (const [dx, h] of [[0, 2], [2, 1]]) {
      p.px(ox + dx, oy, FL[3]); if (h > 1) p.px(ox + dx, oy - 1, FL[4]);
      const hy2 = oy - h;
      p.px(ox + dx, hy2, glow > 0.2 ? GG[4] : CAP[5]); p.px(ox + dx + 1, hy2, glow > 0.2 ? GG[2] : CAP[3]); p.px(ox + dx - 1, hy2, glow > 0.2 ? GG[3] : CAP[4]);
      if (glow > 0.2) { g.px(ox + dx, hy2, glow > 0.8 ? GG[5] : GG[3]); g.px(ox + dx + 1, hy2, GG[2]); g.px(ox + dx, hy2 - 1, GG[1]); }
    }
  }
  // Konsolenpilze an der Flanke
  const b1 = pt(6, -9), b2 = pt(10, -10), b3 = pt(2.5, -8.5);
  bracket(p, g, b3.x - 4, b3.y, 6, glow, 1);
  bracket(p, g, b1.x - 4, b1.y, 7, glow, 2);
  bracket(p, g, b2.x - 3, b2.y, 5, glow, 3);

  // --- 4. vorderes Bein
  capsule(p, hip.x + 3, hip.y, legF.jx, legF.jy, 5, 4.4, MOSS, { noise: 0.3, seed: 15 });
  capsule(p, legF.jx, legF.jy, legF.ex, legF.ey - 2, 4.3, 4.9, ROOT, { noise: 0.25, seed: 16 });
  p.line(legF.jx - 1, legF.jy + 2, legF.ex + 1, legF.ey - 4, ROOT[1]);       // Rindenriss am Schienbein
  toes(legF.ex + 1, legF.ey, true);
  p.px(legF.jx - 3, legF.jy - 1, MOSS[5]); p.px(legF.jx - 2, legF.jy - 2, MOSS[5]); p.px(legF.jx - 1, legF.jy - 2, MOSS[4]);

  // Hut- und Kopfmaße vorab: der Kopf sitzt vor den Lamellen, das Gesicht unter der Krempe
  const capC = pt(FD.spine + 3, 2.5);
  const crx = 17 - K * 1.5, cry = 9 - K;
  const cx = capC.x + 1 + Math.sin(P.capT) * 0.6 + P.capTilt * 2, cy = capC.y + 1 + Math.cos(P.capT) * 0.5;
  const hc = pt(FD.spine - 2, 9.5);
  const hx = Math.round(hc.x + P.head), hy = Math.round(hc.y + 1);
  const rimY = Math.round(cy + 1.5);
  const ey0 = Math.max(hy - 2, rimY + 2);
  meta.eye = { x: hx + 4, y: hy - 2 };
  meta.mouth = { x: hx + 5, y: hy + 2 };
  meta.head = { x: cx, y: cy - cry };
  const drawArm = () => {
    capsule(p, shF.x, shF.y, armF.jx, armF.jy, 5.2, 4.4, MOSS, { noise: 0.3, seed: 17 });
    capsule(p, armF.jx, armF.jy, armF.ex, armF.ey, 4.3, 4.8, ROOT, { noise: 0.25, seed: 18 });
    for (let s = 0.25; s < 0.8; s += 0.25) {                                   // Rindenringe am Unterarm
      const rx = armF.jx + (armF.ex - armF.jx) * s, ry = armF.jy + (armF.ey - armF.jy) * s;
      p.px(rx - 2, ry, ROOT[1]); p.px(rx - 1, ry + 0.5, ROOT[1]); p.px(rx, ry + 1, ROOT[0]);
    }
    p.px(armF.jx - 3, armF.jy - 1, MOSS[5]); p.px(armF.jx - 2, armF.jy - 2, MOSS[5]);
    bracket(p, g, shF.x - 5, shF.y - 3, 8, glow, 4);   // Schulterschwamm
  };
  const drawCapAll = () => {
    // --- 7. Riesenhut: wächst aus Nacken und Schultern, überdacht den Kopf
    drawCap(p, g, cx, cy, crx, cry, 9, glow, 5, CAP, 1.2 + K * 1.5 + P.capTilt);
    // Lamellenfransen hängen vorn und hinten
    for (let i = 0; i < 10; i++) {
      const x = cx - crx + 3 + i * 3, l = 1 + ((i * 7 + Math.round(P.capT * 2)) % 3);
      for (let j = 0; j < l; j++) p.px(x + Math.sin(P.capT + i) * 0.4, cy + 2 + j, j === l - 1 ? FL[4] : FL[2]);
      if (glow > 0.3 && i % 3 === 1) g.px(x, cy + 1 + l, GG[2]);
    }
  };
  const drawHead = () => {
    // --- 6. Kopf: tief vorn an der Brust, unter dem Hutrand
    ell(p, hx + 1, hy, 5.4, 4.7, FL.slice(1), { noise: 0.1, seed: 21, bias: 0.24, clip: (x, y) => y >= rimY });
    // Schatten des Huts auf der Stirn, schwerer Brauenwulst
    for (let x = -4; x <= 5; x++) p.px(hx + x, rimY, FL[1]);                    // Hutschatten unter der Krempe
    p.line(hx - 1, ey0 - 1, hx + 5, ey0 - 1, FL[2]);                          // Brauenwulst
    p.px(hx + 6, hy - 1, FL[4]); p.px(hx + 6, hy, FL[3]);                     // Wangenknorren vorn
    // Maul: breiter Spalt mit gezackten Zähnen, beim Brüllen weit offen
    const my = Math.max(hy + 1, ey0 + 3);                                   // Maulspalte unter den Augen
    const jw = Math.round(P.jaw * 3);
    p.rect(hx + 1, my, 5, 1 + jw, '#0a0608');
    if (jw > 0) { p.rect(hx + 2, my + jw, 3, 1, CAP[3]); p.px(hx + 3, my - 1 + jw, CAP[2]); }
    if (jw > 0 && glow > 0.2) { g.rect(hx + 1, my, 4, jw + 1, GG[1]); g.px(hx + 3, my + jw * 0.5, GG[3]); }
    for (let k = 0; k < 5; k++) {
      if (k % 2 === 0) { p.px(hx + 1 + k, my, FL[6]); if (jw > 1) p.px(hx + 1 + k, my + 1, FL[4]); }
      if (jw && k % 2 === 1) p.px(hx + 1 + k, my + jw, FL[5]);
    }
    p.line(hx + 1, my + 1 + jw, hx + 5, my + 1 + jw, FL[2]);                  // Kinnschatten
    // drei Augen in tiefen Höhlen
    const eyeOn = P.eye > 0.3;
    for (const [ex, ey, c] of [[hx + 4, ey0, 4], [hx + 1, ey0, 3], [hx + 2.5, ey0 + 1.5, 3]]) {
      p.px(ex - 1, ey, GILL[0]); p.px(ex, ey + 1, FL[1]); p.px(ex + 1, ey, FL[1]);
      p.px(ex, ey, eyeOn ? GG[c] : GILL[0]);
      if (eyeOn) { g.px(ex, ey, GG[c + 1]); g.px(ex + 1, ey, GG[2]); g.px(ex, ey - 1, GG[1]); }
    }
  };
  // --- 5.–7. Arm, Hut, Kopf: erhobene Fäuste liegen vor dem Hut, sonst der Kopf vorn
  if (armF.ey < cy + 2) { drawHead(); drawCapAll(); drawArm(); }
  else { drawArm(); drawCapAll(); drawHead(); }

  // --- 7b. Faust ganz vorn
  rootFist(p, g, armF.ex, armF.ey, 6.5, true, glow, 1);
  meta.hand = { x: armF.ex, y: armF.ey };

  // --- 8. Sporenstoß beim Aufschlag
  if (P.puff > 0) {
    sporePuff(p, g, armF.ex + 2, FAY - 4, 12 + P.puff * 10, P.puff, 21, 44);
    sporePuff(p, g, cx, cy - cry, 10, P.puff * 0.6, 23, 16);
  }
  return meta;
}

function bruteAnims() {
  const mk = (P, X) => makeFrame(FW, FH, FAX, FAY, drawBrute, P, X);
  const idleA = fpose();
  const idleB = fpose({ hipY: 1.5, lean: 0.26, hFy: 23, hBy: 24, head: 0.5, capT: Math.PI, glow: 1, jaw: 0.3 });
  const idle = [];
  for (let i = 0; i < 6; i++) { const k = (1 - Math.cos(i / 6 * TAU)) / 2; idle.push(mk({ ...mixP(idleA, idleB, k), capT: i / 6 * TAU })); }
  // Schwerfälliges Stampfen, Knöchel schleifen fast am Boden
  const walk = [];
  for (let i = 0; i < 8; i++) {
    const ph = (i / 8) * TAU, s = Math.sin(ph), c = Math.cos(ph);
    walk.push(mk(fpose({
      hipY: -Math.abs(c) * 1.5 + 1.5, lean: 0.25 + Math.abs(s) * 0.03, fFx: 1 + s * 9, fFy: Math.max(0, -c) * 3.5,
      fBx: -1 - s * 9, fBy: Math.max(0, c) * 3.5, hFx: 15 - s * 4, hBx: -3 + s * 4, hFy: 22 - Math.abs(s) * 1.5, hBy: 23 - Math.abs(s) * 1.5,
      head: s * 0.6, capT: ph, glow: 0.6 + Math.abs(s) * 0.2,
    }), { fx: i === 0 || i === 4 ? 'step' : null }));
  }
  // Ausholen: beide Fäuste hoch über den Hut, Oberkörper zurück, Maul auf
  const w1 = fpose({ lean: 0.1, hipX: -1, hFx: 8, hFy: 2, hBx: 4, hBy: 3, fFx: 8, fBx: -8, capT: 1, glow: 0.8, jaw: 0.4 });
  const w2 = fpose({ lean: -0.06, hipX: -2, hipY: 1, hFx: 3, hFy: -22, hBx: -2, hBy: -21, fFx: 9, fBx: -9, capT: 2, glow: 1.1, jaw: 1, capTilt: -0.5 });
  const w3 = { ...w2, lean: -0.12, hFx: 0, hFy: -24, hBx: -5, hBy: -23, capT: 2.5, glow: 1.3 };
  const windup = [mk(mixP(idleA, w1, 0.5)), mk(w1), mk(w2), mk(w3), mk({ ...w3, capT: 3, hFy: -25, hBy: -24 })];
  // Stampfer: beide Fäuste krachen vor dem Körper in den Boden
  const s1 = fpose({ lean: 0.3, hipX: 2, hipY: 2, hFx: 16, hFy: -8, hBx: 12, hBy: -7, fFx: 11, fBx: -8, capT: 3.5, glow: 1.3, jaw: 1 });
  const s2 = fpose({ lean: 0.55, hipX: 4, hipY: 7, hFx: 21, hFy: 22, hBx: 16, hBy: 22, fFx: 12, fBx: -10, capT: 4, glow: 1.5, jaw: 1, puff: 0.6, capTilt: 1 });
  const s3 = { ...s2, capT: 4.6, puff: 1, glow: 1.2, jaw: 0.6, capTilt: 0.6 };
  const s4 = fpose({ lean: 0.42, hipX: 3, hipY: 5, hFx: 19, hFy: 23, hBx: 13, hBy: 23, fFx: 11, fBx: -9, capT: 5, puff: 0.6, glow: 0.9 });
  const strike = [mk(s1), mk(s2, { fx: 'impact' }), mk(s3), mk(s4), mk(mixP(s4, idleA, 0.6))];
  const hurtP = fpose({ lean: 0.05, hipX: -2, head: -1.5, jaw: 1, hFx: 7, hFy: 18, hBx: -2, hBy: 19, capT: 1, glow: 1.2, capTilt: -0.8 });
  const hurt = [mk(hurtP), mk(mixP(hurtP, idleA, 0.5))];
  // Tod: sackt auf die Knie, kippt nach vorn aufs Gesicht; der Hut klappt, das Licht erlischt
  const d1 = { ...hurtP, lean: 0, hipX: -3, jaw: 1 };
  const d2 = fpose({ kneel: 1, lean: 0.45, head: 1, hFx: 15, hFy: 28, hBx: 10, hBy: 28, fFx: 9, fBx: -12, glow: 0.8, jaw: 1, capT: 2, puff: 0.5, capTilt: 1 });
  const d3 = { ...d2, lean: 0.62, glow: 0.5, puff: 0.9, eye: 0.6, capT: 3 };
  const piv = [FAX + 12, FAY - 1];
  const death = [
    mk(hurtP), mk(d1), mk(d2, { fx: 'impact' }), mk(d3),
    mk({ ...d3, glow: 0.3, puff: 0.6, eye: 0.3 }, { rot: [0.5, ...piv] }),
    mk({ ...d3, glow: 0.15, puff: 0.2, eye: 0 }, { rot: [1.2, ...piv], fx: 'impact' }),
    mk({ ...d3, glow: 0, puff: 0, eye: 0 }, { rot: [1.35, ...piv] }),
  ];
  return {
    idle: new Animation(idle, 5),
    walk: new Animation(walk, 8),
    windup: new Animation(windup, 7, false),
    strike: new Animation(strike, 13, false),
    hurt: new Animation(hurt, 9, false),
    death: new Animation(death, 8, false),
  };
}

// ================================================================ Sporenwirker (spore_caster)

const KW2 = 68, KH2 = 62, KAX = 30, KAY = 56;
const KD = { legH: 11, thigh: 5.5, shin: 6, spine: 9, upper: 5, fore: 5, sh: 1.5, hipW: 1 };
const K_REST2 = {
  hipX: 0, hipY: 0, lean: 0.06, head: 0, fFx: 2.5, fFy: 0, fBx: -2.5, fBy: 0,
  hFx: 6, hFy: 6, hBx: 2, hBy: 6, sa: -1.42, pod: 0.4, sway: 0, cast: 0, orbit: 0, eye: 1, cloud: 0, glow: 0.6, wph: 0,
};
const kpose2 = (o = {}) => ({ ...K_REST2, ...o });

// Wurzelstab mit pulsierender Sporenkapsel
function podStaff(p, g, hx, hy, a, pod, orbit, wph) {
  const dx = Math.cos(a), dy = Math.sin(a);
  let nx = -dy, ny = dx; if (nx + ny > 0) { nx = -nx; ny = -ny; }
  // verdrillter Wurzelschaft
  for (let s = -10; s <= 11; s += 0.5) {
    const w = Math.sin(s * 0.9) * 0.6;
    p.px(hx + dx * s + nx * w, hy + dy * s + ny * w, ROOT[3]);
    p.px(hx + dx * s - nx * (w - 1), hy + dy * s - ny * (w - 1), ROOT[1]);
  }
  p.px(hx - dx * 10.5, hy - dy * 10.5, ROOT[2]);
  // Wurzelkrone umschließt die Kapsel
  const tx = hx + dx * 11, ty = hy + dy * 11;
  const cx = tx + dx * 3, cy = ty + dy * 3;
  for (const sd of [-1, 1]) {
    let x = tx, y = ty;
    for (let i = 0; i < 5; i++) { x += dx * 0.9 + nx * sd * (1.2 - i * 0.45); y += dy * 0.9 + ny * sd * (1.2 - i * 0.45); p.px(x, y, ROOT[sd > 0 ? 4 : 2]); }
  }
  // Kapsel: violette Hülle, grüner Kern
  const r = 2 + pod * 0.7;
  p.ellipse(cx, cy, r, r * 1.15, CAP[4]);
  p.ellipse(cx - 0.5, cy - 0.5, r - 0.8, r * 1.15 - 0.8, CAP[5]);
  p.px(cx - r + 0.8, cy - 1, CAP[6]);
  p.ellipse(cx + 0.3, cy + 0.3, r * 0.5, r * 0.55, GG[3]); p.px(cx, cy, GG[4]);
  const HR = r + 1 + pod * 1.4;
  for (let y = -HR; y <= HR; y++) for (let x = -HR; x <= HR; x++) {
    const d = Math.hypot(x, y) / HR;
    if (d > 1) continue;
    if (d > 0.7 && ((Math.round(cx + x) + Math.round(cy + y)) & 1)) continue;
    g.px(cx + x, cy + y, d < 0.35 ? GG[4] : d < 0.6 ? GG[2] : GG[1]);
  }
  // Sporen kreisen beim Kanalisieren
  if (orbit > 0) {
    const n = 6, R = 3.5 + orbit * 3;
    for (let i = 0; i < n; i++) {
      const a2 = orbit * 5 + (i / n) * TAU + wph;
      const ox = cx + Math.cos(a2) * R, oy = cy + Math.sin(a2) * R * 0.7;
      const V = i % 2 ? GV : GG;
      p.px(ox, oy, V[3]); g.px(ox, oy, V[4]); g.px(ox - Math.sin(a2), oy + Math.cos(a2) * 0.7, V[2]);
    }
  }
  return { x: cx, y: cy };
}

function drawCaster(p, g, P, X) {
  const R = rig(P, KD, KAX, KAY);
  const { pt, legF, legB, shF, shB, armF, armB } = R;
  const meta = {};
  const glow = P.glow;

  // --- hinterer Arm (Moosärmel, Fingerwurzeln)
  capsule(p, shB.x, shB.y, armB.jx, armB.jy, 1.5, 1.7, MOSS, { bias: -0.25 });
  capsule(p, armB.jx, armB.jy, armB.ex, armB.ey, 1.7, 2, MOSS, { bias: -0.22 });
  p.px(armB.ex + 1, armB.ey, FL[3]); p.px(armB.ex + 2, armB.ey + 1, FL[2]); p.px(armB.ex + 2, armB.ey, FL[2]);
  if (P.cast > 0.05) { g.px(armB.ex + 1, armB.ey, GV[3]); g.px(armB.ex + 2, armB.ey, GV[2]); if (P.cast > 0.6) { g.px(armB.ex + 1, armB.ey - 1, GV[2]); g.px(armB.ex + 2, armB.ey - 2, GV[1]); } }

  // --- Mantel: Moos und Myzel, bodenlang, fasrige Fransen
  const top = pt(KD.spine, 0), waist = pt(1, 0);
  const hemY = KAY - 0.5;
  const hemL = Math.min(legB.ex, legF.ex) - 4.5 + Math.sin(P.sway) * 1 - P.lean * 6;
  const hemR = Math.max(legB.ex, legF.ex) + 3.5 + Math.sin(P.sway + 1) * 0.8;
  for (let y = Math.round(waist.y); y <= hemY; y++) {
    const f = (y - waist.y) / (hemY - waist.y || 1);
    const l = waist.x - 3.5 + (hemL - (waist.x - 3.5)) * f;
    const r = waist.x + 3.2 + (hemR - (waist.x + 3.2)) * f * f;
    for (let x = Math.round(l); x <= Math.round(r); x++) {
      const u = (x - l) / (r - l || 1);
      if (y > hemY - 3 && hash2(x, 1, 94) < 0.35 * (y - (hemY - 3))) continue; // Fransen
      const fold = Math.sin(u * 8 + P.sway * 0.7 + f * 1.5);
      let k = u < 0.12 ? 5 : u < 0.22 ? 4 : u > 0.86 ? 1 : fold > 0.45 ? 4 : fold > 0.1 ? 3 : fold < -0.45 ? 1 : 2;
      if (y > hemY - 1.5) k = Math.max(0, k - 1);
      p.px(x, y, MOSS[k]);
      // Myzelfäden (blass) und Leuchtpunkte im Mantel
      const hsh = hash2(x, y, 95);
      if (hsh < 0.03 && k > 1) p.px(x, y, FL[2]);
      else if (hsh > 0.988 && glow > 0.2) { p.px(x, y, GG[3]); g.px(x, y, GG[3]); }
    }
  }
  capsule(p, waist.x, waist.y, top.x, top.y, 3.4, 3.7, MOSS, { noise: 0.12, seed: 6 });
  // Saum: Wurzelborte am Mantelrand
  for (let x = Math.round(hemL) + 1; x < hemR - 1; x += 1) if (hash2(x, 3, 96) > 0.3) p.px(x, hemY - 2, x % 3 ? ROOT[2] : ROOT[3]);
  const q = (u, k, c) => { const o = pt(u, k); p.px(o.x, o.y, c); };
  // Gürtel aus Wurzeln mit Sporenbeuteln
  for (let k = -3.5; k <= 3.5; k += 0.5) { q(1.3, k, k < 0 ? ROOT[3] : ROOT[2]); q(0.8, k, ROOT[1]); }
  q(1.3, 1, FL[5]); q(1.3, 1.5, FL[3]);                     // Knochenschnalle
  q(0.5, 2, CAP[4]); q(0, 2, CAP[3]); q(0, 2.5, CAP[4]); q(0.5, 2.5, CAP[5]);
  q(0.3, -1.5, CAP[3]); q(-0.3, -1.5, CAP[2]);
  for (let u = 2; u < 7; u += 1) q(u, 2.5 - u * 0.25, MOSS[5]);

  // --- Kopf: blasses Gesicht unter hohem Hut mit Schleier
  const neck = pt(KD.spine + 1.5, 0.5);
  const hx = Math.round(neck.x + P.head), hy = Math.round(neck.y - 3);
  ell(p, hx + 1, hy, 3.2, 3.7, FL.slice(2), { bias: 0.05 });
  meta.eye = { x: hx + 3, y: hy - 1 };
  meta.mouth = { x: hx + 3, y: hy + 2 };
  // Schleier (Ring) hängt vom Hutrand über den Hinterkopf
  for (let i = 0; i < 6; i++) {
    const x = hx - 3 + i * 0.6, l = 5 - i * 0.5 + Math.sin(P.sway + i) * 0.5;
    for (let j = 0; j < l; j++) p.px(x - j * 0.15 - P.lean * j, hy - 2 + j, j === Math.floor(l) - 1 ? FL[5] : FL[2 + (i & 1)]);
  }
  // Hoher, glockenförmiger Hut
  const capX = hx + 0.5, capY = hy - 2.5;
  drawCap(p, g, capX, capY, 7, 7.5, 6, glow, 9, CAP, 0.8);
  // Gesicht vor den Lamellen: hager und blass, Augen im tiefen Hutschatten
  ell(p, hx + 1, hy, 3.2, 3.7, FL.slice(2), { bias: 0.1, clip: (x, y) => y >= hy - 1 });
  p.px(hx + 4, hy, FL[5]); p.px(hx + 4, hy + 1, FL[4]); p.px(hx + 4, hy + 2, FL[2]);   // spitze Nase
  // tiefer Hutschatten über den Augen, darin violett glühende Pupillen
  for (let x = -1; x <= 3; x++) p.px(hx + x, hy - 1, FL[1]);
  p.px(hx + 1, hy, FL[0]); p.px(hx + 3, hy, FL[0]); p.px(hx + 2, hy, FL[2]);
  const eyeOn = P.eye > 0.3;
  if (eyeOn) {
    p.px(hx + 3, hy, GV[3]); p.px(hx + 1, hy, GV[2]);
    g.px(hx + 3, hy, GV[4]); g.px(hx + 4, hy, GV[2]); g.px(hx + 1, hy, GV[3]); g.px(hx + 3, hy - 1, GV[1]);
  }
  // schmaler Mund mit Fäden (vernäht), Zahn blitzt
  p.px(hx + 2, hy + 2, FL[1]); p.px(hx + 3, hy + 2, FL[0]);
  // Hutspitze
  p.px(capX - 1, capY - 8, CAP[5]); p.px(capX - 2, capY - 9, CAP[4]);
  meta.head = { x: capX, y: capY - 9 };

  // --- Sporenwolke (Spezialangriff): quillt unter dem Hut hervor und sinkt zu Boden
  if (P.cloud > 0) {
    sporePuff(p, g, capX + 2, capY + 1, 9 + P.cloud * 6, P.cloud, 31 + Math.round(P.wph), 30);
    sporePuff(p, g, KAX + 6, KAY - 4, 10 + P.cloud * 10, P.cloud * 0.9, 33 + Math.round(P.wph), 34);
    sporePuff(p, g, KAX - 4, KAY - 6, 8 + P.cloud * 6, P.cloud * 0.7, 35, 16, GV);
  }

  // --- vorderer Arm + Kapselstab
  if (X.smear) smearArc(p, g, shF.x, shF.y, X.smear[0], X.smear[1], 7, 16, SPORE_C, SPORE_G, 1);
  capsule(p, shF.x, shF.y, armF.jx, armF.jy, 1.6, 1.8, MOSS, { bias: 0.05 });
  capsule(p, armF.jx, armF.jy, armF.ex, armF.ey, 1.8, 2.2, MOSS, { bias: 0.05 });
  p.px(armF.ex - 2, armF.ey - 1, MOSS[5]);                     // weiter Ärmelsaum
  p.px(armF.ex, armF.ey + 1, FL[4]);
  const pod = podStaff(p, g, armF.ex, armF.ey, P.sa, P.pod, P.orbit, P.wph);
  p.rect(armF.ex - 1, armF.ey - 1, 2, 2, FL[3]); p.px(armF.ex - 1, armF.ey - 1, FL[5]);
  meta.hand = pod;
  meta.cast = pod;
  return meta;
}

function casterAnims() {
  const mk = (P, X) => makeFrame(KW2, KH2, KAX, KAY, drawCaster, P, X);
  const idle = [];
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU;
    idle.push(mk(kpose2({ hipY: Math.sin(a) > 0.3 ? 1 : 0, sway: a, pod: 0.4 + Math.sin(a) * 0.3, glow: 0.55 + Math.sin(a) * 0.25, hFy: 6 + Math.sin(a) * 0.5, head: Math.sin(a) * 0.3, wph: a })));
  }
  const walk = [];
  for (let i = 0; i < 8; i++) {
    const ph = i / 8 * TAU, s = Math.sin(ph), c = Math.cos(ph);
    walk.push(mk(kpose2({
      fFx: 1 + s * 3.5, fFy: Math.max(0, -c) * 1.5, fBx: -1 - s * 3.5, fBy: Math.max(0, c) * 1.5,
      hipY: c > 0.5 || c < -0.5 ? 0 : 1, lean: 0.1, sway: ph * 2, hFx: 5 + s * 0.8, sa: -1.4 - s * 0.05,
      hBx: 1 - s * 1.5, pod: 0.4, wph: ph,
    })));
  }
  // Kapsel schwillt an, Sporen kreisen …
  const windup = [
    mk(kpose2({ hFx: 4, hFy: 0, sa: -1.55, hBx: 3, hBy: 2, cast: 0.3, pod: 0.8, orbit: 0.2, lean: 0, glow: 0.8, wph: 1 })),
    mk(kpose2({ hFx: 3, hFy: -4, sa: -1.6, hBx: 4, hBy: -1, cast: 0.6, pod: 1.2, orbit: 0.5, lean: -0.06, sway: 1, glow: 1, wph: 2 })),
    mk(kpose2({ hFx: 3, hFy: -6, sa: -1.62, hBx: 4, hBy: -3, cast: 0.9, pod: 1.6, orbit: 0.8, lean: -0.1, sway: 2, glow: 1.1, wph: 3 })),
    mk(kpose2({ hFx: 3, hFy: -7, sa: -1.65, hBx: 4, hBy: -4, cast: 1, pod: 2, orbit: 1.1, lean: -0.12, sway: 3, glow: 1.2, wph: 4 })),
  ];
  // … Stab nach vorn, das Sporengeschoss löst sich
  const strike = [
    mk(kpose2({ hFx: 9, hFy: 0, sa: -0.35, hBx: 3, hBy: 3, pod: 2, lean: 0.2, hipX: 1, fFx: 4, fBx: -3, sway: 4, glow: 1, wph: 5 }), { smear: [-1.7, -0.35], fx: 'cast' }),
    mk(kpose2({ hFx: 10, hFy: 1, sa: -0.2, hBx: 2, hBy: 4, pod: 0.3, lean: 0.24, hipX: 1.5, fFx: 4, fBx: -3, sway: 5, glow: 0.7, wph: 6 })),
    mk(kpose2({ hFx: 7, hFy: 2, sa: -0.8, hBx: 2, hBy: 5, pod: 0.3, lean: 0.12, hipX: 1, fFx: 3, fBx: -3, sway: 6, wph: 7 })),
  ];
  // Giftwolke: Kapsel hoch, dann den Stab in den Boden stoßen; der Hut stößt eine Wolke aus
  const ck = [
    [0, kpose2({ wph: 0 })],
    [0.3, kpose2({ hFx: 4, hFy: -8, sa: -1.5, hBx: 5, hBy: -5, cast: 1, pod: 1.8, orbit: 0.8, lean: -0.14, glow: 1.2, sway: 1, wph: 2 })],
    [0.5, kpose2({ hFx: 7, hFy: 7, sa: -1.62, hBx: 5, hBy: 6, cast: 0.6, pod: 1.2, orbit: 0.2, lean: 0.25, hipY: 2, glow: 1.4, cloud: 0.5, sway: 2, wph: 3 }), snap],
    [0.8, kpose2({ hFx: 7, hFy: 7, sa: -1.62, hBx: 5, hBy: 6, pod: 0.8, lean: 0.2, hipY: 2, glow: 1.2, cloud: 1, sway: 3, wph: 4 })],
    [1, kpose2({ hFx: 6, hFy: 6, pod: 0.5, lean: 0.1, glow: 0.8, cloud: 1.2, sway: 4, wph: 5 })],
  ];
  const cloud = track(mk, ck, 8, { extras: { 4: { fx: 'cast' } } });
  const hurtP = kpose2({ lean: -0.2, hipX: -1, head: -1, hFx: 3, hFy: 4, sa: -1.9, hBx: 0, hBy: 4, pod: 0.8, sway: 2, glow: 1, wph: 2 });
  const hurt = [mk(hurtP), mk(mixP(hurtP, K_REST2, 0.5))];
  const d1 = { ...hurtP, lean: -0.3, hipX: -1.5, pod: 1, cloud: 0.3 };
  const d2 = { ...d1, hipY: 3, lean: -0.1, hFy: 7, sa: -2.3, pod: 0.5, cloud: 0.7, wph: 3 };
  const d3 = { ...d2, hipY: 4, lean: 0.1, pod: 0.2, eye: 0, glow: 0.3, cloud: 0.9, wph: 4 };
  const piv = [KAX - 3, KAY - 1];
  const death = [
    mk(d1), mk(d2), mk(d3, { rot: [-0.5, ...piv] }), mk(d3, { rot: [-1.1, ...piv] }),
    mk({ ...d3, pod: 0, glow: 0.15, cloud: 0.5 }, { rot: [-1.5, piv[0], piv[1] - 0.5], fx: 'impact' }),
    mk({ ...d3, pod: 0, glow: 0, eye: 0, cloud: 0 }, { rot: [-Math.PI / 2, piv[0], piv[1] - 0.5] }),
  ];
  return {
    idle: new Animation(idle, 6),
    walk: new Animation(walk, 10),
    windup: new Animation(windup, 6, false),
    strike: new Animation(strike, 12, false),
    cloud: new Animation(cloud, 8, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 9, false),
  };
}

// ================================================================ Export

export function createSporeFoes() {
  return {
    sporeling: sporelingAnims(),
    fungal_brute: bruteAnims(),
    spore_caster: casterAnims(),
  };
}
