import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame, SpriteFrame, Animation } from '../gfx/Sprite.js';
import { hash2 } from '../core/math.js';

// Gegner des Heulenden Hügelgrabs (Stufe 24–26): Grabunhold, Grabhund,
// Knochenschütze und Totenrufer. Kaltes, blaugrünes Geisterlicht auf der
// Leucht-Ebene (frame.glow), verwitterte Bronze mit Grünspan.
//
// Aufbau wie foes_ashwood.js: kleine Rigs (Hüfte, Rumpf, Kopf, IK-Arme/-Beine
// bzw. parametrischer Vierbeiner), Schlüsselposen werden beim Laden weich
// interpoliert. frame.meta: eye/hand/mouth/head (relativ zum Anker), bei
// Fernkämpfern ist meta.hand die Mündung. frame.fx: 'step' | 'impact' | 'roar' | 'cast'.
// Blickrichtung rechts, Anker = Bodenkontakt.

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

// Dickes Glied mit Licht von links oben (ramp: 4 Stufen dunkel → hell).
function limb(p, x0, y0, x1, y1, w0, w1, ramp) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len, ny = dx / len;
  if (nx + ny > 0) { nx = -nx; ny = -ny; }
  const steps = Math.ceil(len * 2);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, x = x0 + dx * t, y = y0 + dy * t;
    const hw = (w0 + (w1 - w0) * t) / 2;
    for (let k = -hw; k <= hw + 0.01; k += 0.5) {
      const c = k > hw - 1 ? ramp[3] : k < -hw + 1 ? ramp[0] : k > 0 ? ramp[2] : ramp[1];
      p.px(x + nx * k, y + ny * k, c);
    }
  }
}

// Schwung-Schleier: überstreicht die Klinge von a0 nach a1 (Drehpunkt cx/cy),
// frisch (am Ende) dicht und hell, am Anfang ausgedünnt. sy staucht die
// Bahn senkrecht (waagerechte Hiebe in 3/4-Sicht).
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

// Bronze (Grabrüstung), Grünspan, kaltes Geisterlicht, vertrocknete Haut,
// Leichentuch, kühler Knochen, verblichener Helmbusch.
const BRZ = ['#150e08', '#281a0e', '#402b16', '#5c4020', '#7c5a2e', '#a07c42', '#c8a868'];
const VERD = ['#0e221c', '#1a3a30', '#285a4a', '#3e7e68', '#62a88c', '#8ccab0'];
const GH = ['#06302e', '#0c6a64', '#20b4a6', '#66f0da', '#c4fff2', '#ffffff'];
const MUM = ['#131316', '#222126', '#343137', '#494548', '#625c5a', '#7e776e'];
const SHR = ['#0f1215', '#1a1f23', '#273034', '#374246', '#4c585a', '#687472'];
const BN = ['#33312b', '#5a584c', '#8c8872', '#bab69a', '#e0dcc2', '#f8f6e8'];
const CREST = ['#1c090b', '#381114', '#581b1d', '#7c2a25', '#9e3c2e'];
const WOODB = ['#1a120c', '#2c2016', '#433222', '#5c4630', '#78603f'];
const GH_EDGE = [GH[1], GH[2], GH[4]];
const GH_EDGE_G = [GH[1], GH[3]];

// Geisterfahne: wellige, nach hinten verwehende Spur auf der Leucht-Ebene
// (Kern hell, Schweif dunkler). dir = -1 weht nach links (hinten).
function wisp(p, g, x, y, len, ph, dir = -1, rise = 0.35, bright = 1) {
  for (let i = 0; i < len; i++) {
    const f = i / len;
    const wx = x + dir * i, wy = y - i * rise + Math.sin(ph + i * 0.7) * f * 1.4;
    const c = f < 0.25 ? GH[4] : f < 0.55 ? GH[3] : f < 0.8 ? GH[2] : GH[1];
    if (bright > 0.2) g.px(wx, wy, bright > 0.7 || f > 0.3 ? c : GH[2]);
    if (f < 0.35) p.px(wx, wy, GH[f < 0.15 ? 4 : 3]);
  }
}

// Grünspan-Flecken auf Bronze (deterministisch)
function patina(p, x, y, seed, n = 3, r = 2) {
  for (let i = 0; i < n; i++) {
    const px_ = x + (hash2(i, seed, 71) - 0.5) * r * 2, py_ = y + (hash2(seed, i, 72) - 0.5) * r * 2;
    p.px(px_, py_, VERD[hash2(i, seed, 73) < 0.5 ? 2 : 3]);
    if (hash2(i, seed, 74) < 0.5) p.px(px_ + 1, py_, VERD[1]);
  }
}

// ================================================================ Grabunhold (barrow_wight)

const WW = 72, WH = 56, WAX = 32, WAY = 50;
const WD = { legH: 13, thigh: 6.5, shin: 7, spine: 10, upper: 5.5, fore: 5.5, sh: 1.5, hipW: 1.5 };
const W_REST = {
  hipX: 0, hipY: 0, lean: 0.1, head: 0, fFx: 4, fFy: 0, fBx: -4, fBy: 0,
  hFx: 6, hFy: 7, hBx: 6, hBy: 4, sw: -0.9, sh: 0, grab: 0.4, cape: 0.15, capeT: 0, eye: 1, wph: 0, soul: 1, slump: 0,
};
const wpose = (o = {}) => ({ ...W_REST, ...o });

// Blattschwert aus Bronze (Griffangel mit Knauf, blattförmige Klinge, Mittelgrat)
function drawBronzeSword(p, g, hx, hy, a, glowK) {
  const dx = Math.cos(a), dy = Math.sin(a);
  let nx = -dy, ny = dx; if (nx + ny > 0) { nx = -nx; ny = -ny; }
  p.line(hx - dx * 2.5, hy - dy * 2.5, hx + dx, hy + dy, WOODB[2]);
  p.px(hx - dx * 3, hy - dy * 3, BRZ[5]); p.px(hx - dx * 3.5, hy - dy * 3.5, BRZ[3]);
  // Parierstange (sichelförmig)
  for (let k = -2; k <= 2; k += 0.5) p.px(hx + dx * (1.5 + Math.abs(k) * 0.3) + nx * k, hy + dy * (1.5 + Math.abs(k) * 0.3) + ny * k, k < 0 ? BRZ[5] : BRZ[3]);
  const L = 15;
  for (let s = 2; s <= L; s += 0.5) {
    const f = (s - 2) / (L - 2);
    const hw = 0.7 + Math.sin(Math.min(1, f * 1.15) * Math.PI) * 0.6 - (f > 0.85 ? (f - 0.85) * 5 : 0);
    for (let k = -hw; k <= hw + 0.01; k += 0.5) {
      let c = k > hw - 0.6 ? BRZ[6] : k < -hw + 0.6 ? BRZ[2] : Math.abs(k) < 0.3 ? BRZ[5] : k > 0 ? BRZ[4] : BRZ[3];
      const x = hx + dx * s - nx * k, y = hy + dy * s - ny * k;
      if (Math.abs(k) < hw - 0.6 && hash2(Math.round(s * 2), Math.round(k * 2), 81) < 0.14) c = VERD[3];
      p.px(x, y, c);
      if (glowK > 0 && k > hw - 0.6) g.px(x, y, glowK > 0.7 ? GH[3] : GH[1]);
    }
  }
  return { x: hx + dx * L, y: hy + dy * L };
}

// Mit Leichentuch umwickeltes Glied: Tuchstreifen quer über dem Schaft
function wrapLimb(p, x0, y0, x1, y1, w0, w1, near, seed) {
  const R = near ? [SHR[1], SHR[2], SHR[3], SHR[4]] : [SHR[0], SHR[1], SHR[1], SHR[2]];
  limb(p, x0, y0, x1, y1, w0, w1, R);
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 2));
  for (let i = 1; i < n; i++) {
    const t = i / n + (hash2(i, seed, 88) - 0.5) * 0.15;
    const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    p.px(x - 0.5, y, near ? SHR[5] : SHR[3]); p.px(x + 0.5, y + 0.5, near ? SHR[1] : SHR[0]);
  }
}

// Knochenklaue (Hand ohne Haut)
function claw(p, x, y, a, open, near) {
  const c = near ? [BN[2], BN[4]] : [BN[1], BN[2]];
  p.rect(x - 1, y - 1, 2, 2, c[0]); p.px(x - 1, y - 1, c[1]);
  for (let i = -1; i <= 1; i++) {
    const fa = a + i * (0.35 + open * 0.3);
    p.line(x + Math.cos(fa), y + Math.sin(fa), x + Math.cos(fa) * 3, y + Math.sin(fa) * 3, i === -1 ? c[1] : c[0]);
  }
}

function drawWight(p, g, P, X) {
  const R = rig(P, WD, WAX, WAY);
  const { hip, pt, legF, legB, shF, shB, armF, armB } = R;
  const meta = {};
  const soul = P.soul;

  // --- 1. Leichentuch-Umhang hinten (zerfetzt, mit Löchern)
  const top = pt(WD.spine, -1.5);
  for (let i = 0; i < 8; i++) {
    const len = 16 + (hash2(i, 3, 91) * 5 | 0) - i * 0.5 - P.slump * 3;
    for (let j = 0; j < len; j++) {
      const v = j / len;
      if (v > 0.5 && hash2(i, j, 92) < 0.2) continue; // Löcher
      const x = top.x - 1 - i * 0.75 - P.cape * 9 * v * v + Math.sin(P.capeT + v * 3 + i * 0.8) * 1 * v;
      const y = top.y + j + i * 0.25;
      p.px(x, y, SHR[i === 0 ? 5 : i < 2 ? 4 : i < 4 ? 3 : i < 6 ? 2 : 1]);
    }
  }

  // --- 2. hinteres Bein
  wrapLimb(p, hip.x - 1, hip.y, legB.jx, legB.jy, 3, 2.5, false, 1);
  limb(p, legB.jx, legB.jy, legB.ex, legB.ey - 1, 3, 2.5, [BRZ[0], BRZ[1], BRZ[2], BRZ[3]]);
  p.rect(legB.ex - 1, legB.ey - 1, 4, 1, SHR[1]);

  // --- 3. hinterer Arm: dürr, Knochenklaue greift nach vorn
  limb(p, shB.x, shB.y, armB.jx, armB.jy, 2.2, 1.8, [MUM[0], MUM[1], MUM[2], MUM[3]]);
  limb(p, armB.jx, armB.jy, armB.ex, armB.ey, 1.8, 1.6, [MUM[0], MUM[1], MUM[2], MUM[2]]);
  claw(p, armB.ex, armB.ey, Math.atan2(armB.ey - armB.jy, armB.ex - armB.jx), P.grab ?? 0.5, false);
  if (P.grab > 0.8 && soul > 0.3) { g.px(armB.ex + 2, armB.ey, GH[2]); g.px(armB.ex + 3, armB.ey + 1, GH[1]); }

  // --- 4. Rumpf: Lederstreifen-Schurz, eingefallener Leib, Bronze-Brustpanzer
  for (let i = 0; i < 5; i++) {
    const a = pt(-0.5, -3 + i * 1.6);
    const sw = Math.sin(P.capeT + i) * 0.5 + P.lean * 2;
    const l = 6 - Math.abs(i - 2) * 0.6;
    for (let j = 0; j < l; j++) p.px(a.x + sw * j * 0.15, a.y + j, j === 0 ? BRZ[4] : i % 2 ? SHR[2] : SHR[3]);
    p.px(a.x + sw * (l - 1) * 0.15, a.y + l - 1, BRZ[3]);
  }
  const hp = pt(0, 0), mp = pt(4, 0.2), cp = pt(WD.spine, 0.4);
  // Leib: dürr, Rippen unter der Haut
  limb(p, hp.x, hp.y, mp.x, mp.y, 5, 4.5, [MUM[0], MUM[1], MUM[2], MUM[3]]);
  const q = (u, k, c) => { const o = pt(u, k); p.px(o.x, o.y, c); };
  for (let u = 1.5; u <= 3.5; u += 1) { q(u, 0.5, MUM[4]); q(u, 1.5, MUM[1]); q(u, -0.5, MUM[1]); }
  // Brustpanzer (gewölbt, endet über dem Bauch)
  const bp = pt(4.5, 0.3);
  limb(p, bp.x, bp.y, cp.x, cp.y, 7, 8, [BRZ[2], BRZ[3], BRZ[4], BRZ[5]]);
  q(4.5, -2.5, BRZ[1]); q(4.5, -1.5, BRZ[5]); q(4.5, -0.5, BRZ[5]); q(4.5, 0.5, BRZ[5]); q(4.5, 1.5, BRZ[4]); q(4.5, 2.5, BRZ[3]); // Unterkante
  q(7.5, 1.5, BRZ[2]); q(7, 2.5, BRZ[2]); q(8.5, 0, BRZ[6]); q(8.2, -1, BRZ[6]); q(9, 0.5, BRZ[5]);
  q(6, -1.5, VERD[2]); q(5.5, -2, VERD[3]); q(6.5, -2.5, VERD[2]); q(5.5, 3, VERD[3]); q(6, 2.3, VERD[2]); q(9, -2.5, VERD[3]);
  // Riss im Panzer: dahinter glimmt das Geisterlicht
  const crack = [[8, 1.3], [7.2, 0.6], [6.5, 1.1], [5.8, 0.5]];
  for (const [u, k] of crack) { const o = pt(u, k); p.px(o.x, o.y, soul > 0.3 ? GH[2] : MUM[0]); if (soul > 0.3) g.px(o.x, o.y, soul > 0.8 ? GH[3] : GH[1]); }
  // Gürtel mit Bronzescheiben
  for (let k = -3; k <= 3; k += 0.5) q(0.6, k, SHR[1]);
  for (let k = -2; k <= 3; k += 2.5) { q(0.6, k, BRZ[5]); q(0.6, k + 0.5, BRZ[3]); }

  // --- 5. vorderes Bein
  wrapLimb(p, hip.x + 1, hip.y, legF.jx, legF.jy, 3.2, 2.8, true, 2);
  limb(p, legF.jx, legF.jy, legF.ex, legF.ey - 1, 3.2, 2.8, [BRZ[2], BRZ[3], BRZ[4], BRZ[5]]);
  p.px(legF.jx - 0.5, legF.jy - 0.5, BRZ[6]); p.px(legF.jx + 0.5, legF.jy + 2, VERD[3]);
  p.rect(legF.ex - 1, legF.ey - 1, 4, 1, SHR[2]); p.px(legF.ex + 2, legF.ey - 1, SHR[3]);

  // --- 6. Kopf: geschlossener Bronzehelm mit Busch, im Sehschlitz ein Geisterauge
  const neck = pt(WD.spine + 1.5, 0.6);
  const hx = Math.round(neck.x + P.head), hy = Math.round(neck.y - 3.5);
  for (let i = 0; i < 10; i++) {
    const cx = hx + 2 - i * 0.95 - P.cape * i * 0.2, cy = hy - 5.5 + i * 0.3 + (i * i) * 0.035;
    const h = 3.2 - Math.abs(i - 3) * 0.22;
    for (let j = 0; j < h; j++) p.px(cx, cy - j, CREST[j === Math.ceil(h) - 1 ? 4 : i < 3 ? 3 : 2]);
    if (i > 5) p.px(cx - 0.5, cy + 1 + Math.sin(P.capeT + i) * 0.6, CREST[1]);
  }
  p.ellipse(hx + 0.5, hy - 1, 4, 4.3, BRZ[3]);
  p.ellipse(hx, hy - 2, 3, 2.8, BRZ[4]);
  p.px(hx - 2, hy - 4, BRZ[6]); p.px(hx - 1, hy - 5, BRZ[5]); p.px(hx - 3, hy - 2, BRZ[5]);
  p.rect(hx - 4, hy, 3, 4, BRZ[2]); p.px(hx - 4, hy, BRZ[3]);           // Nackenschutz
  p.rect(hx + 1, hy + 1, 4, 3, BRZ[3]); p.px(hx + 4, hy + 3, BRZ[2]);   // Wangenklappe
  p.px(hx + 1, hy + 3, BRZ[4]); p.px(hx + 2, hy + 3, BRZ[1]);
  p.px(hx + 5, hy, BRZ[4]); p.px(hx + 5, hy - 1, BRZ[3]);               // Nasal
  patina(p, hx - 1, hy - 1, 3, 3, 1.5);
  // Sehschlitz + Mundspalt: Schwärze
  p.rect(hx + 2, hy - 1, 3, 1, '#050608'); p.rect(hx + 3, hy, 1, 2, '#050608');
  if (P.eye > 0.3) {
    p.px(hx + 3, hy - 1, GH[4]); p.px(hx + 4, hy - 1, GH[2]);
    g.px(hx + 3, hy - 1, GH[5]); g.px(hx + 4, hy - 1, GH[4]); g.px(hx + 2, hy - 1, GH[3]); g.px(hx + 5, hy - 1, GH[2]);
    g.px(hx + 3, hy - 2, GH[1]); g.px(hx + 3, hy, GH[1]);
    wisp(p, g, hx - 3, hy - 0.5, 8, P.wph, -1, 0.45, P.eye);
    wisp(p, g, hx - 4, hy + 2, 6, P.wph + 2, -1, 0.2, P.eye * 0.6);
  }
  meta.eye = { x: hx + 3, y: hy - 1 };
  meta.head = { x: hx, y: hy - 7 };
  meta.mouth = { x: hx + 3, y: hy + 2 };

  // --- 7. vorderer Arm + Schwert
  if (X.smear) smearArc(p, g, shF.x, shF.y + 1, X.smear[0], X.smear[1], 8, 19, GH_EDGE, GH_EDGE_G, X.smear[2] ?? 0.8);
  wrapLimb(p, shF.x, shF.y, armF.jx, armF.jy, 2.8, 2.3, true, 3);
  limb(p, armF.jx, armF.jy, armF.ex, armF.ey, 2.8, 2.6, [BRZ[2], BRZ[3], BRZ[4], BRZ[5]]);
  p.ellipse(shF.x, shF.y, 2.8, 2.2, BRZ[3]); p.ellipse(shF.x - 0.5, shF.y - 0.7, 1.8, 1.2, BRZ[5]);
  p.px(shF.x - 2, shF.y - 1, BRZ[6]); p.px(shF.x + 1.5, shF.y + 1.5, VERD[3]);
  const tip = drawBronzeSword(p, g, armF.ex, armF.ey, P.sw, X.bladeGlow ?? 0);
  p.rect(armF.ex - 1, armF.ey - 1, 2, 2, BN[2]); p.px(armF.ex - 1, armF.ey - 1, BN[4]);
  meta.hand = { x: armF.ex, y: armF.ey };
  meta.tip = tip;
  return meta;
}

function wightAnims() {
  const mk = (P, X) => makeFrame(WW, WH, WAX, WAY, drawWight, P, X);
  const idleA = wpose();
  const idleB = wpose({ hipY: 1, lean: 0.14, hFy: 7.5, hBy: 5.5, head: 0.4, sw: -0.8, capeT: Math.PI });
  const idle = [];
  for (let i = 0; i < 6; i++) {
    const k = (1 - Math.cos(i / 6 * TAU)) / 2;
    idle.push(mk({ ...mixP(idleA, idleB, k), wph: i / 6 * TAU }));
  }
  // Schlurfender, schwerer Gang: Schwert hängt, Schild vorgehalten
  const walk = [];
  for (let i = 0; i < 8; i++) {
    const ph = (i / 8) * TAU, s = Math.sin(ph), c = Math.cos(ph);
    walk.push(mk(wpose({
      hipY: -Math.abs(c) * 0.8 + 0.8, lean: 0.16 + Math.abs(s) * 0.03, fFx: 1 + s * 5, fFy: Math.max(0, -c) * 2,
      fBx: -1 - s * 5, fBy: Math.max(0, c) * 2, hFx: 6 - s * 1.2, hBx: 5 + s * 1, hFy: 7 + Math.abs(s) * 0.5,
      sw: -0.85 + s * 0.08, cape: 0.45, capeT: ph, head: s * 0.4, wph: ph,
    }), { fx: i === 0 || i === 4 ? 'step' : null }));
  }
  // Ausholen: Schwert hoch über die Schulter nach hinten, Schild vor
  const w1 = wpose({ lean: 0.02, hipX: -0.5, hFx: 1, hFy: -3, sw: -2.2, hBx: 8, hBy: 2, grab: 0.8, fFx: 5, fBx: -5, cape: 0.2, wph: 1 });
  const w2 = wpose({ lean: -0.1, hipX: -1.5, hipY: 1, hFx: -2, hFy: -6, sw: -2.75, hBx: 9, hBy: 1, grab: 1, fFx: 6, fBx: -5, cape: 0.3, capeT: 1, wph: 2 });
  const w3 = { ...w2, hFx: -3, hFy: -6.5, sw: -2.95, lean: -0.13, wph: 3 };
  const windup = [mk(mixP(idleA, w1, 0.5)), mk(w1), mk(w2, { bladeGlow: 0.5 }), mk(w3, { bladeGlow: 1 })];
  // Hieb: schräg von oben nach vorn unten, Geisterlicht auf der Schneide
  const s1 = wpose({ lean: 0.2, hipX: 1, hipY: 1, hFx: 7, hFy: -4, sw: -1.3, hBx: 4, hBy: 5, fFx: 7, fBx: -5, cape: 0.6, capeT: 2, wph: 4 });
  const s2 = wpose({ lean: 0.36, hipX: 2.5, hipY: 2.5, hFx: 10, hFy: 6, sw: 0.55, hBx: 2, hBy: 6, fFx: 8, fBx: -5, cape: 0.9, capeT: 3, wph: 5 });
  const s3 = wpose({ ...s2, lean: 0.32, hFx: 9, hFy: 8, sw: 0.9, capeT: 4, wph: 6 });
  const s4 = wpose({ lean: 0.18, hipX: 1, hipY: 1, hFx: 7, hFy: 7, sw: 0.1, hBx: 4, hBy: 5, fFx: 6, fBx: -5, cape: 0.3, capeT: 5, wph: 7 });
  const strike = [
    mk(s1, { smear: [-2.9, -1.3, 1], bladeGlow: 1 }),
    mk(s2, { smear: [-2.2, 0.55, 1], bladeGlow: 1, fx: 'impact' }),
    mk(s3, { smear: [-0.4, 0.9, 1], bladeGlow: 0.5 }),
    mk(s4),
    mk(mixP(s4, idleA, 0.6)),
  ];
  const hurtP = wpose({ lean: -0.18, hipX: -1.5, head: -1, hFx: 4, hFy: 5, sw: -1.4, hBx: 7, hBy: 3, sh: 0.6, cape: -0.2, wph: 2 });
  const hurt = [mk(hurtP, { bladeGlow: 0 }), mk(mixP(hurtP, idleA, 0.5))];
  // Tod: Geisterlicht erlischt, der Leib sackt in sich zusammen und kippt nach vorn
  const d1 = { ...hurtP, lean: -0.26, hipX: -2, wph: 3 };
  const d2 = wpose({ hipY: 4, lean: 0.25, head: 1.5, hFx: 6, hFy: 11, sw: 1.2, hBx: 5, hBy: 10, fFx: 5, fBx: -4, eye: 0.7, soul: 0.7, slump: 0.5, wph: 4 });
  const d3 = { ...d2, hipY: 6, lean: 0.4, head: 2, eye: 0.4, soul: 0.4, slump: 1, wph: 5 };
  const piv = [WAX + 3, WAY - 1];
  const flat = { ...d3, hipY: 5, lean: 0.1, hFx: 5, hFy: 10, hBy: 10, sw: 1.5, eye: 0, soul: 0, wph: 6 };
  const death = [
    mk(d1), mk(d2), mk(d3, { rot: [0.45, ...piv] }), mk(d3, { rot: [1.05, ...piv] }),
    mk({ ...flat, eye: 0.3, soul: 0.2 }, { rot: [Math.PI / 2 - 0.08, piv[0], piv[1]], fx: 'impact' }),
    mk(flat, { rot: [Math.PI / 2, piv[0], piv[1]] }),
  ];
  return {
    idle: new Animation(idle, 6),
    walk: new Animation(walk, 9),
    windup: new Animation(windup, 8, false),
    strike: new Animation(strike, 15, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 8, false),
  };
}

// ================================================================ Grabhund (grave_hound)

const HW = 60, HH = 40, HAX = 27, HAY = 36;
const HFUR = ['#0c1012', '#161d20', '#222c30', '#324044', '#465856', '#5e726c', '#7e9488', '#a2b8aa'];
const H_REST = { leap: 0, t: 0, amp: 0, bob: 0, crouch: 0, head: 0, up: 0, jaw: 0, lunge: 0, pitch: 0, lie: 0, eye: 1, fl: 0, soul: 1, gallop: 0, tail: 0 };
const hpose = (o = {}) => ({ ...H_REST, ...o });

function drawHound(p, g, P, X) {
  const gy = HAY, ox = HAX - 13 + P.lunge;
  const meta = {};
  const lie = P.lie;
  const by = gy - 16 + P.crouch + P.bob + lie * 10;          // Rückenlinie Mitte
  const Y = (x, y) => y + (x - 13) * P.pitch * 0.12;
  const soul = P.soul;

  // --- Beine (dürr, drei Glieder; Hinterbein mit Sprunggelenk)
  const leg = (xh, ph, near, front) => {
    const ramp = near ? [HFUR[2], HFUR[3], HFUR[4], HFUR[5]] : [HFUR[0], HFUR[1], HFUR[2], HFUR[3]];
    const hipY = Y(xh, by + (front ? 6 : 4));
    if (lie > 0.6) {
      const ly = gy - 2 - (near ? 0 : 2);
      limb(p, ox + xh, hipY, ox + xh + (front ? 6 : -5), ly, 2, 1.5, ramp);
      p.px(ox + xh + (front ? 7 : -6), ly, ramp[1]);
      return;
    }
    const a = P.t * TAU + ph;
    let fx = Math.sin(a) * (P.gallop ? 4.5 : 3.4) * P.amp, lift = Math.max(0, Math.cos(a)) * 2.6 * P.amp;
    const footY = gy - lift - lie * 2 - (front ? P.leap * 4 : P.leap * 0.5);
    const footX = ox + xh + fx + (front ? 1 + P.leap * 5 : -P.leap * 4);
    if (front) {
      const ex = ox + xh + fx * 0.3 - 0.5, ey = hipY + 4.5 - P.crouch * 0.3;
      const wx = footX - 0.5 + fx * 0.15, wy = footY - 3;
      limb(p, ox + xh, hipY - 1, ex, ey, 3.2, 2, ramp);
      limb(p, ex, ey, wx, wy, 1.6, 1.4, ramp);
      limb(p, wx, wy, footX, footY - 1, 1.4, 1.4, ramp);
    } else {
      const kx = ox + xh + 2 + fx * 0.4, ky = hipY + 3.5;
      const hx = footX - 2.5 + fx * 0.1, hy = footY - 4 + P.crouch * 0.3;
      limb(p, ox + xh, hipY - 1, kx, ky, 4, 2.5, ramp);
      limb(p, kx, ky, hx, hy, 2, 1.6, ramp);
      limb(p, hx, hy, footX, footY - 1, 1.5, 1.4, ramp);
      p.px(hx - 0.5, hy, ramp[3]);
    }
    p.rect(footX - 1, footY - 1, 3, 1, near ? HFUR[1] : HFUR[0]);
    p.px(footX + 2, footY - 1, near ? BN[2] : BN[1]); // Kralle
  };
  const gal = P.gallop > 0.5;
  leg(4, 0, false, false);
  leg(20, gal ? 0.5 : Math.PI, false, true);

  // --- Schwanz: dünn, endet in Geisterfahne
  const tw = Math.sin(P.t * TAU * 2 + P.fl) * 1 * (0.4 + P.amp) + P.tail;
  const tx0 = ox + 1, ty0 = Y(1, by + 1);
  const tpts = [[tx0, ty0], [tx0 - 3, ty0 + 1 - tw * 0.3], [tx0 - 6, ty0 + 2.5 - tw], [tx0 - 8, ty0 + 5 - tw * 1.3]];
  for (let i = 0; i < 3; i++) limb(p, tpts[i][0], tpts[i][1], tpts[i + 1][0], tpts[i + 1][1], 1.8 - i * 0.3, 1.4 - i * 0.3, [HFUR[1], HFUR[2], HFUR[3], HFUR[4]]);
  if (soul > 0.2) wisp(p, g, tpts[3][0], tpts[3][1], 6, P.fl + P.t * TAU, -1, -0.2, soul);

  // --- Rumpf: tiefe Brust, eingezogener Bauch, Hüftknochen
  const flat = 1 - lie * 0.35;
  p.ellipse(ox + 5, Y(5, by + 3), 4.5, 3.6 * flat, HFUR[2]);                 // Becken
  p.ellipse(ox + 12, Y(12, by + 3), 6, 2.6 * flat, HFUR[2]);                  // Lende (schmal)
  p.ellipse(ox + 19, Y(19, by + 4.5), 5.5, 5.2 * flat, HFUR[2]);              // Brustkorb
  // Bauchlinie scharf eingezogen (dunkel)
  p.line(ox + 8, Y(8, by + 5.5), ox + 15, Y(15, by + 5), HFUR[0]);
  p.ellipse(ox + 19, Y(19, by + 8), 3.5, 1.3, HFUR[1]);
  // Licht von oben links
  p.ellipse(ox + 5, Y(5, by + 1), 3, 1.4, HFUR[4]);
  p.line(ox + 7, Y(7, by + 0.8), ox + 16, Y(16, by + 1), HFUR[4]);
  p.ellipse(ox + 18, Y(18, by + 1.5), 3.5, 1.5, HFUR[4]);
  p.px(ox + 3, Y(3, by + 0.5), HFUR[6]); p.px(ox + 4, Y(4, by), HFUR[6]);  // Hüftknochen
  // Rippen
  for (let i = 0; i < 4; i++) {
    const rx = ox + 15.5 + i * 1.6, ry = Y(rx - ox, by + 3);
    p.line(rx, ry, rx + 0.5, ry + 3.5 * flat, HFUR[1]);
    p.line(rx + 1, ry - 0.5, rx + 1.5, ry + 3 * flat, HFUR[5]);
  }
  // Wirbelsäule tritt hervor
  for (let x = 6; x <= 17; x += 2) p.px(ox + x, Y(x, by + 0.2 - (x > 11 ? 0.3 : 0)), HFUR[6]);

  // --- Geistermähne: Flammenzungen entlang des Nackens/Rückens (Leucht-Ebene)
  for (let i = 0; i < 9; i++) {
    const x = 11 + i * 1.3, base = Y(x, by + 1.2 - Math.sin(i / 8 * Math.PI) * 1.2);
    const h = (2.5 + ((hash2(i, 2, 95) * 3 + P.fl * 2 + i) % 3)) * soul * (0.6 + i / 12);
    for (let j = 0; j < h; j++) {
      const f = j / h;
      const x2 = ox + x - j * (0.55 + P.amp * 0.25) + Math.sin(P.fl * 1.7 + i + j) * 0.4, y2 = base - j * 0.8;
      if (f < 0.4) p.px(x2, y2, GH[f < 0.2 ? 3 : 2]);
      g.px(x2, y2, GH[f < 0.3 ? 4 : f < 0.6 ? 3 : 2]);
    }
  }

  // --- nahe Beine
  leg(7, gal ? 0.3 : Math.PI, true, false);
  leg(22, gal ? 0.8 : 0, true, true);

  // --- Hals + Kopf: langer, schädelhafter Kopf
  const hx = ox + 26 + P.up * 0.5, hy = Y(26, by + 1) + P.head * 3 - P.up * 3 + lie * 3;
  const up = P.up * 0.9 - P.head * 0.3;
  limb(p, ox + 21, Y(21, by + 2.5), hx - 1, hy + 1, 5, 3.6, [HFUR[1], HFUR[2], HFUR[3], HFUR[4]]);
  p.ellipse(hx, hy, 3.2, 2.8, HFUR[3]);
  p.ellipse(hx - 0.5, hy - 1, 2.2, 1.4, HFUR[5]);
  // Ohren: zerrissen, angelegt
  p.line(hx - 2, hy - 2, hx - 4, hy - 4.5 - P.up, HFUR[4]); p.px(hx - 4, hy - 5 - P.up, HFUR[6]);
  p.px(hx - 1, hy - 3, HFUR[5]);
  // Schnauze: knöcherner Oberkiefer, Unterkiefer klappt auf
  const j = P.jaw;
  const sx = hx + 2, sy = hy - up * 2;
  limb(p, sx, sy, sx + 5, sy + 0.5 - up, 3, 2, [HFUR[2], HFUR[3], BN[2], BN[3]]);
  p.px(sx + 5.5, sy + 0.5 - up, BN[1]); // Nase
  p.px(sx + 2, sy - 1, BN[4]); p.px(sx + 3, sy - 1 - up * 0.3, BN[3]);
  // Unterkiefer
  const ja = 0.25 + j * 0.45;
  const jx1 = sx + 4.5 * Math.cos(ja), jy1 = sy + 1.5 + 4.5 * Math.sin(ja) - up;
  limb(p, sx, sy + 1.5, jx1, jy1, 1.8, 1.2, [HFUR[1], HFUR[1], HFUR[2], BN[2]]);
  if (j > 0.2) {
    // Maulinneres glimmt
    p.line(sx + 1, sy + 1.2, sx + 4, sy + 1.5 + j * 1.2 - up, GH[1]);
    g.line(sx + 1, sy + 1.2, sx + 4, sy + 1.5 + j * 1.2 - up, GH[2]);
    // Zähne
    p.px(sx + 3, sy + 1 - up * 0.5, BN[5]); p.px(sx + 4.5, sy + 1 - up * 0.8, BN[5]); p.px(jx1 - 0.5, jy1 - 1, BN[4]);
  } else {
    p.px(sx + 3, sy + 1.3, BN[4]); p.px(sx + 1, sy + 1.3, HFUR[0]);
  }
  // Auge: tief, glühend
  const ex = hx + 1, ey = hy - 1;
  p.rect(ex - 1, ey, 2, 1, HFUR[0]);
  if (P.eye > 0.2) {
    p.px(ex, ey, GH[4]); g.px(ex, ey, GH[5]); g.px(ex + 1, ey, GH[3]); g.px(ex - 1, ey, GH[2]);
    wisp(p, g, ex - 1, ey - 0.5, 5 + (P.amp > 0.5 ? 2 : 0), P.fl, -1, 0.1, P.eye * 0.8);
  }
  meta.eye = { x: ex, y: ey };
  meta.mouth = { x: sx + 5, y: sy + 1 };
  meta.head = { x: hx, y: hy - 5 };
  return meta;
}

function houndAnims() {
  const mk = (P, X) => makeFrame(HW, HH, HAX, HAY, drawHound, P, X);
  const idle = [0, 1, 2, 3, 4, 5].map((i) => {
    const a = i / 6 * TAU;
    return mk(hpose({ t: 0.25, bob: Math.sin(a) > 0.4 ? 1 : 0, head: 0.2 + Math.sin(a) * 0.15, fl: i * 1.2, jaw: 0.1 + (i === 3 ? 0.2 : 0) }));
  });
  // Lauernder Trab: Kopf tief
  const walk = [];
  for (let i = 0; i < 8; i++) walk.push(mk(hpose({ t: i / 8, amp: 1, bob: i % 4 === 1 || i % 4 === 2 ? 1 : 0, head: 0.35, fl: i * 0.9, pitch: Math.sin(i / 8 * TAU * 2) * 0.05 })));
  // Heulen (Rudel ruft)
  const howl = [
    mk(hpose({ crouch: 1, head: 0.2, fl: 0, tail: -1 })),
    mk(hpose({ crouch: 1.5, up: 1, head: -0.3, jaw: 0.5, fl: 1, pitch: -0.5, tail: -1 })),
    mk(hpose({ crouch: 1.5, up: 1.6, head: -0.6, jaw: 1, fl: 2, pitch: -0.8, tail: -1.5 }), { fx: 'roar' }),
    mk(hpose({ crouch: 1.5, up: 1.7, head: -0.6, jaw: 1, fl: 3.2, pitch: -0.8, tail: -1.5 })),
    mk(hpose({ crouch: 1.5, up: 1.6, head: -0.5, jaw: 0.8, fl: 4.4, pitch: -0.75, tail: -1.2 })),
  ];
  // Ausholen: duckt sich tief, knurrt, Mähne lodert auf
  const windup = [
    mk(hpose({ crouch: 1, head: 0.6, jaw: 0.3, fl: 0, soul: 1.2 })),
    mk(hpose({ crouch: 2, head: 0.9, jaw: 0.5, fl: 1, lunge: -1, soul: 1.4, pitch: 0.2 })),
    mk(hpose({ crouch: 2.5, head: 1, jaw: 0.6, fl: 2, lunge: -1.5, soul: 1.5, pitch: 0.25, tail: 0.5 })),
  ];
  // Sprung-Biss
  const strike = [
    mk(hpose({ leap: 0.6, crouch: -2, head: -0.2, up: 0.3, jaw: 1, lunge: 2, pitch: -0.35, fl: 3, soul: 1.4 })),
    mk(hpose({ leap: 1, crouch: -3, head: 0.1, jaw: 1.3, lunge: 5, pitch: 0.05, fl: 4, soul: 1.5 }), { fx: 'impact' }),
    mk(hpose({ leap: 0.3, crouch: -0.5, head: 0.5, jaw: 0.6, lunge: 4.5, pitch: 0.2, fl: 5 })),
    mk(hpose({ t: 0.25, head: 0.4, jaw: 0.1, lunge: 1.5, fl: 6 })),
  ];
  const hurt = [mk(hpose({ head: -0.5, up: 0.4, jaw: 0.8, lunge: -2, crouch: 1, pitch: -0.25, fl: 1, tail: -1 })), mk(hpose({ head: 0.1, lunge: -0.8, crouch: 0.5, fl: 2 }))];
  const death = [
    mk(hpose({ head: -0.5, up: 0.6, jaw: 1, lunge: -2, crouch: 1, pitch: -0.3, fl: 1, tail: -1 })),
    mk(hpose({ head: 0.8, crouch: 2.5, lie: 0.3, jaw: 0.5, fl: 2, soul: 0.8, eye: 0.8 })),
    mk(hpose({ head: 1.2, lie: 0.6, jaw: 0.3, fl: 3, soul: 0.6, eye: 0.6 })),
    mk(hpose({ head: 1.3, lie: 0.9, jaw: 0.4, fl: 4, soul: 0.4, eye: 0.3 }), { fx: 'impact' }),
    mk(hpose({ head: 1.3, lie: 1, jaw: 0.4, fl: 5, soul: 0.2, eye: 0 })),
    mk(hpose({ head: 1.3, lie: 1, jaw: 0.4, fl: 6, soul: 0, eye: 0 })),
  ];
  return {
    idle: new Animation(idle, 6),
    walk: new Animation(walk, 12),
    howl: new Animation(howl, 6, false),
    windup: new Animation(windup, 7, false),
    strike: new Animation(strike, 13, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 8, false),
  };
}

// ================================================================ Knochenschütze (bone_archer)

const AW = 64, AH = 52, AAX = 28, AAY = 46;
const AD = { legH: 12, thigh: 6, shin: 6.5, spine: 9, upper: 5, fore: 5, sh: 1.5, hipW: 1.2 };
const A_REST = {
  hipX: 0, hipY: 0, lean: 0.05, head: 0, fFx: 3.5, fFy: 0, fBx: -3.5, fBy: 0,
  hFx: 6, hFy: 7, hBx: -1, hBy: 8, bowA: 0.4, draw: 0, arrow: 0, cape: 0.15, capeT: 0, eye: 1, jaw: 0, soul: 1, wph: 0,
};
const apose = (o = {}) => ({ ...A_REST, ...o });

// Knochenglied: dünner Schaft mit Gelenkknubbel
function boneLimb(p, x0, y0, x1, y1, w, near) {
  const R = near ? [BN[1], BN[2], BN[3], BN[4]] : [BN[0], BN[1], BN[2], BN[2]];
  limb(p, x0, y0, x1, y1, w, w, R);
  p.ellipse(x1, y1, w * 0.55 + 0.3, w * 0.55 + 0.3, near ? BN[3] : BN[1]);
}

function drawLongbow(p, g, hx, hy, a, draw, nock, arrow, ghost) {
  const ax = Math.sin(a), ay = -Math.cos(a), fx = Math.cos(a), fy = Math.sin(a);
  const bend = 0.05 + draw * 0.035;
  const pts = [];
  const L = 11;
  for (let s = -L; s <= L; s += 0.5) {
    const b = -(s * s) * bend * 0.45 + (Math.abs(s) > L - 2 ? (Math.abs(s) - (L - 2)) * 0.6 : 0);  // Recurve-Enden
    const x = hx + ax * s + fx * b, y = hy + ay * s + fy * b;
    pts.push([x, y]);
    const tip = Math.abs(s) > L - 1;
    p.px(x, y, tip ? BN[4] : Math.abs(s) < 1.5 ? CREST[2] : WOODB[3]);
    if (!tip && Math.abs(s) > 1.5) p.px(x + fx, y + fy, WOODB[1]);
    if (Math.abs(s) > 2 && Math.abs(s) < L - 1 && (Math.round(s * 2) % 7 === 0)) p.px(x, y, BRZ[5]); // Bronzeringe
  }
  const top = pts[0], bot = pts[pts.length - 1];
  const sx = nock ? nock.x : (top[0] + bot[0]) / 2 - fx * 0.5, sy = nock ? nock.y : (top[1] + bot[1]) / 2;
  p.line(top[0], top[1], sx, sy, '#9aa6a0');
  p.line(sx, sy, bot[0], bot[1], '#9aa6a0');
  let head = { x: hx + fx * 2, y: hy + fy * 2 };
  if (arrow && nock) {
    const tx = hx + fx * 4, ty = hy + fy * 4;
    p.line(nock.x, nock.y, tx, ty, WOODB[4]);
    // Geisterspitze
    p.px(tx + fx, ty + fy, ghost > 0.3 ? GH[4] : BRZ[5]); p.px(tx, ty, ghost > 0.3 ? GH[3] : BRZ[4]);
    if (ghost > 0.3) {
      g.px(tx + fx, ty + fy, GH[5]); g.px(tx, ty, GH[4]); g.px(tx + fx * 2, ty + fy * 2, GH[2]);
      g.px(tx - 0.5 * fx, ty - 1, GH[1]); g.px(tx - 0.5 * fx, ty + 1, GH[1]);
      if (ghost > 0.8) { g.px(tx + fx, ty + fy - 1, GH[2]); g.px(tx + fx, ty + fy + 1, GH[2]); g.px(tx - fx, ty - fy, GH[3]); }
    }
    p.px(nock.x - 1, nock.y - 1, SHR[4]); p.px(nock.x - 1, nock.y + 1, SHR[3]); // Federn
    head = { x: tx + fx, y: ty + fy };
  }
  return head;
}

function drawBoneArcher(p, g, P, X) {
  const R = rig(P, AD, AAX, AAY);
  const { hip, pt, legF, legB, shF, shB, armF, armB } = R;
  const meta = {};
  const soul = P.soul;

  // --- Köcher auf dem Rücken (Leder mit Bronzebeschlag, Geisterfedern)
  const q0 = pt(1.5, -3), q1 = pt(AD.spine + 3.5, -4.5);
  limb(p, q0.x, q0.y, q1.x, q1.y, 3, 3.5, [MUM[0], MUM[1], MUM[2], MUM[3]]);
  p.px(q0.x, q0.y - 1, BRZ[4]); p.px(q1.x + 0.5, q1.y + 2, BRZ[5]);
  for (let k = 0; k < 3; k++) {
    const fx_ = q1.x - 1.5 + k * 1.1, fy_ = q1.y - 1.5 - (k % 2);
    p.px(fx_, fy_, SHR[4]); p.px(fx_, fy_ - 1, SHR[5]);
  }
  // --- Leichentuch-Fetzen hinten (Schultertuch)
  const top = pt(AD.spine, -1.5);
  for (let i = 0; i < 4; i++) {
    const len = 8 + (hash2(i, 5, 97) * 4 | 0) - i;
    for (let j = 0; j < len; j++) {
      const v = j / len;
      if (v > 0.5 && hash2(i, j, 98) < 0.22) continue;
      const x = top.x - 1 - i * 0.8 - P.cape * 6 * v * v + Math.sin(P.capeT + v * 3 + i) * 0.7 * v;
      p.px(x, top.y + j + i * 0.2, SHR[i === 0 ? 3 : 2 - (i > 2 ? 1 : 0)]);
    }
  }
  // --- hinteres Bein
  boneLimb(p, hip.x - 1, hip.y, legB.jx, legB.jy, 2, false);
  boneLimb(p, legB.jx, legB.jy, legB.ex, legB.ey - 1, 1.5, false);
  p.rect(legB.ex - 1, legB.ey - 1, 3, 1, BN[1]);
  // --- hinterer Arm (Sehnenhand)
  boneLimb(p, shB.x, shB.y, armB.jx, armB.jy, 1.8, false);
  boneLimb(p, armB.jx, armB.jy, armB.ex, armB.ey, 1.5, false);

  // --- Becken + Wirbelsäule + Brustkorb
  const hp = pt(0, 0);
  p.ellipse(hp.x, hp.y, 3, 1.6, BN[2]); p.px(hp.x - 2, hp.y - 1, BN[4]); p.px(hp.x + 1, hp.y, BN[0]);
  // Lendentuch (zerfetzt)
  for (let i = 0; i < 4; i++) {
    const a = pt(-0.5, -2.5 + i * 1.6);
    const l = 5 - Math.abs(i - 1.5) * 0.8 + (hash2(i, 1, 99) * 2 | 0);
    for (let j = 0; j < l; j++) p.px(a.x + Math.sin(P.capeT + i) * 0.3 * j * 0.3, a.y + j, SHR[i % 2 ? 2 : 3]);
  }
  for (let u = 0.5; u <= 4; u += 1) { const o = pt(u, -0.3); p.px(o.x, o.y, BN[3]); const o2 = pt(u + 0.5, -0.3); p.px(o2.x, o2.y, BN[1]); }
  // Rippen: Bögen, dazwischen dunkel; im Brustkorb glimmt ein Geisterherz
  const rc = pt(6.5, 0.8);
  p.ellipse(rc.x, rc.y, 3.4, 3.2, '#08090a');
  const heart = pt(6.2, 0.8);
  if (soul > 0.2) {
    p.px(heart.x, heart.y, GH[3]); p.px(heart.x + 1, heart.y, GH[2]);
    g.ellipse(heart.x + 0.5, heart.y, 1.5 + soul * 0.5, 1.5 + soul * 0.5, GH[1]); g.px(heart.x, heart.y, GH[4]); g.px(heart.x + 1, heart.y, GH[3]);
  }
  for (let r = 0; r < 4; r++) {
    const u = 4.3 + r * 1.35;
    for (let k = -3; k <= 3.2; k += 0.5) {
      const o = pt(u - Math.abs(k) * 0.12 + (k > 0 ? 0.25 : 0), k);
      p.px(o.x, o.y, k < -2 ? BN[4] : k > 2 ? BN[1] : BN[3]);
    }
  }
  // Brustbein + Schlüsselbein
  for (let u = 4; u <= 8.5; u += 0.5) { const o = pt(u, 2.4); p.px(o.x, o.y, BN[2]); }
  const cl = pt(AD.spine, 0); p.line(cl.x - 2.5, cl.y, cl.x + 2, cl.y + 0.5, BN[4]);

  // --- vorderes Bein
  boneLimb(p, hip.x + 1, hip.y, legF.jx, legF.jy, 2.2, true);
  boneLimb(p, legF.jx, legF.jy, legF.ex, legF.ey - 1, 1.7, true);
  p.rect(legF.ex - 1, legF.ey - 1, 4, 1, BN[2]); p.px(legF.ex + 2, legF.ey - 1, BN[3]);
  // Bronze-Beinschiene (Rest der Grabrüstung)
  const gm = { x: (legF.jx + legF.ex) / 2, y: (legF.jy + legF.ey) / 2 };
  p.rect(gm.x - 1, gm.y - 1.5, 2, 3, BRZ[3]); p.px(gm.x - 1, gm.y - 1.5, BRZ[5]); p.px(gm.x, gm.y + 1, VERD[3]);

  // --- Schädel mit Bronzekappe
  const neck = pt(AD.spine + 1.5, 0.5);
  const hx = Math.round(neck.x + P.head), hy = Math.round(neck.y - 3);
  p.ellipse(hx, hy, 3.2, 3.3, BN[3]);
  p.ellipse(hx - 0.5, hy - 1, 2.2, 2, BN[4]);
  p.px(hx - 2, hy - 2, BN[5]);
  // Kiefer
  const jw = P.jaw;
  p.rect(hx, hy + 2 + jw, 3.5, 1.5, BN[2]); p.px(hx + 3, hy + 2 + jw, BN[3]);
  p.px(hx + 1, hy + 2, BN[5]); p.px(hx + 2, hy + 2, '#08090a'); p.px(hx + 3, hy + 2, BN[5]);
  if (jw > 0.4) p.rect(hx + 1, hy + 2, 2, jw, '#08090a');
  // Nasenloch, Wangenknochen
  p.px(hx + 3, hy + 0.5, '#08090a'); p.px(hx + 2, hy + 1, BN[1]);
  // Augenhöhle mit Geisterlicht
  p.rect(hx + 1, hy - 1, 2, 2, '#050607');
  if (P.eye > 0.3) {
    p.px(hx + 2, hy - 1, GH[4]); g.px(hx + 2, hy - 1, GH[5]); g.px(hx + 1, hy - 1, GH[3]); g.px(hx + 3, hy - 1, GH[2]); g.px(hx + 2, hy, GH[2]);
    wisp(p, g, hx + 1, hy - 1.5, 6, P.wph, -1, 0.35, P.eye);
  }
  // Bronzekappe (Spangenhelm, spitz) mit Wangenrest
  p.ellipse(hx - 0.5, hy - 3, 3.4, 1.8, BRZ[3]);
  p.rect(hx - 4, hy - 2.5, 7, 1, BRZ[2]); p.px(hx + 2, hy - 2.5, BRZ[4]);
  p.px(hx - 0.5, hy - 5, BRZ[5]); p.px(hx - 1, hy - 4, BRZ[5]); p.px(hx - 2, hy - 4, BRZ[4]); p.px(hx - 3, hy - 3, BRZ[5]);
  p.px(hx, hy - 6, BRZ[6]); p.px(hx, hy - 5, BRZ[4]);
  patina(p, hx, hy - 3.5, 5, 2, 1.2);
  meta.eye = { x: hx + 2, y: hy - 1 };
  meta.head = { x: hx, y: hy - 6 };
  meta.mouth = { x: hx + 3, y: hy + 2 };

  // --- vorderer Arm mit Bogen
  boneLimb(p, shF.x, shF.y, armF.jx, armF.jy, 2, true);
  boneLimb(p, armF.jx, armF.jy, armF.ex, armF.ey, 1.7, true);
  // Schulterstück: Bronzeplatte
  p.ellipse(shF.x, shF.y, 2.2, 1.6, BRZ[3]); p.px(shF.x - 1, shF.y - 1, BRZ[5]); p.px(shF.x + 1, shF.y + 1, VERD[3]);
  const nock = P.draw > 0.02 || P.arrow > 0.5 ? { x: armB.ex, y: armB.ey } : null;
  const hand = drawLongbow(p, g, armF.ex, armF.ey, P.bowA, P.draw, nock, P.arrow > 0.5, P.draw * soul);
  p.rect(armF.ex - 1, armF.ey - 1, 2, 2, BN[3]); p.px(armF.ex - 1, armF.ey - 1, BN[5]);
  if (nock) { p.px(armB.ex, armB.ey, BN[4]); p.px(armB.ex - 1, armB.ey, BN[2]); }
  meta.hand = hand;
  return meta;
}

function boneArcherAnims() {
  const mk = (P, X) => makeFrame(AW, AH, AAX, AAY, drawBoneArcher, P, X);
  const idleA = apose();
  const idleB = apose({ hipY: 1, lean: 0.08, hFy: 7.5, hBy: 8.5, capeT: Math.PI, head: 0.3, bowA: 0.44, jaw: 0.5 });
  const idle = [];
  for (let i = 0; i < 6; i++) { const k = (1 - Math.cos(i / 6 * TAU)) / 2; idle.push(mk({ ...mixP(idleA, idleB, k), wph: i / 6 * TAU })); }
  const walk = [];
  for (let i = 0; i < 8; i++) {
    const ph = (i / 8) * TAU, s = Math.sin(ph), c = Math.cos(ph);
    walk.push(mk(apose({
      hipY: -Math.abs(c) * 1 + 0.5, lean: 0.1, fFx: 1 + s * 4.5, fFy: Math.max(0, -c) * 2.2, fBx: -1 - s * 4.5, fBy: Math.max(0, c) * 2.2,
      hFx: 6 - s * 1.2, hBx: -1 + s * 1.5, hFy: 7 - Math.abs(s) * 0.5, cape: 0.5, capeT: ph, head: s * 0.4, wph: ph, jaw: Math.abs(s) > 0.7 ? 0.6 : 0,
    })));
  }
  // Pfeil ziehen, auflegen, spannen – die Spitze entflammt in Geisterlicht
  const n1 = apose({ hBx: -4, hBy: -2, head: -0.3, bowA: 0.25, lean: 0.02, wph: 1 });
  const n2 = apose({ hFx: 8, hFy: 1, hBx: 4, hBy: 1, bowA: 0.05, arrow: 1, draw: 0.15, lean: 0.05, wph: 2 });
  const n3 = apose({ hFx: 10, hFy: 0, hBx: 0, hBy: 0, bowA: 0.02, arrow: 1, draw: 0.6, lean: 0.01, fFx: 4.5, fBx: -4.5, wph: 3 });
  const n4 = apose({ hFx: 11, hFy: 0, hBx: -2, hBy: 0, bowA: 0, arrow: 1, draw: 1, lean: -0.03, fFx: 4.5, fBx: -4.5, cape: 0.2, wph: 4, jaw: 0.6 });
  const windup = [mk(n1), mk(n2), mk(n3), mk(n4)];
  const r1 = { ...n4, hBx: -5, hBy: -1, arrow: 0, draw: 0, lean: -0.07, hipX: -0.5, cape: 0.35, capeT: 1, wph: 5 };
  const r2 = { ...n4, hFx: 9, hBx: -6, hBy: 1, arrow: 0, draw: 0, lean: -0.03, cape: 0.2, capeT: 2, wph: 6, jaw: 0.2 };
  const r3 = apose({ hFx: 8, hFy: 3, hBx: -3, hBy: 5, arrow: 0, bowA: 0.15, capeT: 3, wph: 7 });
  const strike = [mk(r1, { fx: 'cast' }), mk(r2), mk(r3)];
  const hurtP = apose({ lean: -0.24, hipX: -1, head: -1, hFx: 3, hFy: 4, hBx: 0, hBy: 4, eye: 1, cape: -0.2, bowA: 0.8, jaw: 1, wph: 2 });
  const hurt = [mk(hurtP), mk(mixP(hurtP, idleA, 0.5))];
  // Tod: das Gerippe fällt in sich zusammen (Knie knicken, Oberkörper kippt nach hinten)
  const d1 = { ...hurtP, lean: -0.32, hipX: -1.5, fFx: 4, fBx: -3 };
  const d2 = { ...d1, hipY: 4, lean: -0.1, fFx: 4, fBx: -2, hFy: 9, hBy: 9, hFx: 4, bowA: 0.9, eye: 0.6, soul: 0.6 };
  const d3 = { ...d2, hipY: 6, lean: 0.15, head: 1, eye: 0.3, soul: 0.3, jaw: 1.5 };
  const piv = [AAX - 3, AAY - 1];
  const death = [
    mk(d1), mk(d2), mk(d3, { rot: [-0.5, ...piv] }), mk(d3, { rot: [-1.1, ...piv] }),
    mk({ ...d3, hipY: 4, lean: 0, soul: 0.1, eye: 0.1 }, { rot: [-1.5, piv[0], piv[1] - 0.5], fx: 'impact' }),
    mk({ ...d3, hipY: 4, lean: 0, hFy: 10, hFx: 5, soul: 0, eye: 0 }, { rot: [-Math.PI / 2, piv[0], piv[1] - 0.5] }),
  ];
  return {
    idle: new Animation(idle, 6),
    walk: new Animation(walk, 10),
    windup: new Animation(windup, 6, false),
    strike: new Animation(strike, 10, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 9, false),
  };
}

// ================================================================ Totenrufer (wight_caller)

const CWW = 72, CWH = 60, CAX2 = 32, CAY2 = 54;
const CD = { legH: 12, thigh: 6, shin: 6.5, spine: 10, upper: 5.5, fore: 5.5, sh: 1.5, hipW: 1 };
const ROBE_B = ['#0a0c10', '#141a20', '#20282e', '#2e383e', '#404c50', '#5c6a6a'];
const C_REST2 = {
  hipX: 0, hipY: 0, lean: 0.12, head: 0, fFx: 2.5, fFy: 0, fBx: -2.5, fBy: 0,
  hFx: 7, hFy: 7, hBx: 3, hBy: 7, sa: -1.45, flame: 0.5, sway: 0, hood: 0, cast: 0, orbit: 0, eye: 1,
  circle: 0, rise: 0, wph: 0,
};
const cpose2 = (o = {}) => ({ ...C_REST2, ...o });

// Knochenstab mit Käfiglaterne, darin eine Geisterflamme
function lanternStaff(p, g, hx, hy, a, flame, orbit, wph) {
  const dx = Math.cos(a), dy = Math.sin(a);
  let nx = -dy, ny = dx; if (nx + ny > 0) { nx = -nx; ny = -ny; }
  limb(p, hx - dx * 10, hy - dy * 10, hx + dx * 11, hy + dy * 11, 1.6, 1.6, [WOODB[0], WOODB[1], WOODB[2], WOODB[3]]);
  for (let s = -9; s < 11; s += 3.5) p.px(hx + dx * s + nx * 0.5, hy + dy * s + ny * 0.5, BN[3]); // Knochenringe
  p.px(hx - dx * 10.5, hy - dy * 10.5, BRZ[4]);
  // Haken + Käfig
  const tx = hx + dx * 11, ty = hy + dy * 11;
  const cx = tx + dx * 3.5, cy = ty + dy * 3.5;
  // Käfig: Bronzestreben um die Flamme
  const r = 2.6;
  for (let i = 0; i < 5; i++) {
    const t = -1 + i * 0.5;
    p.line(cx + nx * t * r - dx * r, cy + ny * t * r - dy * r, cx + nx * t * r * 1.1 + dx * r, cy + ny * t * r * 1.1 + dy * r, i === 0 ? BRZ[5] : i === 4 ? BRZ[2] : BRZ[3]);
  }
  // Flamme (unter den Streben durchsichtig)
  const fr = 1.5 + flame * 1.1;
  for (let y = -fr * 1.6; y <= fr; y += 0.5) {
    const w = (y < 0 ? fr * (1 + y / (fr * 1.6)) : Math.sqrt(Math.max(0, fr * fr - y * y))) * 0.9;
    for (let x = -w; x <= w; x += 0.5) {
      const d = Math.hypot(x / (fr + 0.01), y / (fr * 1.3));
      const wob = Math.sin(wph * 3 + y) * 0.4;
      const c = d < 0.35 ? GH[5] : d < 0.65 ? GH[4] : GH[3];
      g.px(cx + x + wob, cy + y, c);
      if (d < 0.6) p.px(cx + x + wob, cy + y, d < 0.3 ? GH[5] : GH[4]);
    }
  }
  // Lichthof: gerastert, damit er nicht als Scheibe liest
  const HR = fr + 1.5 + flame * 1.2;
  for (let y = -HR; y <= HR; y++) for (let x = -HR; x <= HR; x++) {
    const d = Math.hypot(x, y) / HR;
    if (d > 1 || d < 0.45) continue;
    if (((Math.round(cx + x) + Math.round(cy + y)) & 1) && d > 0.7) continue;
    g.px(cx + x, cy + y, d < 0.7 ? GH[1] : GH[0]);
  }
  g.px(cx, cy - fr * 1.6, GH[4]);
  // Streben vorn über der Flamme
  p.line(cx - dx * r, cy - dy * r, cx + dx * r, cy + dy * r, BRZ[4]);
  p.px(cx + dx * (r + 0.8), cy + dy * (r + 0.8), BRZ[5]); p.px(cx + dx * (r + 1.6), cy + dy * (r + 1.6), BRZ[4]);
  // umkreisende Seelenfunken beim Kanalisieren
  if (orbit > 0) {
    const n = 5, R = 3.5 + orbit * 3;
    for (let i = 0; i < n; i++) {
      const a2 = orbit * 5 + (i / n) * TAU + wph;
      const ox = cx + Math.cos(a2) * R, oy = cy + Math.sin(a2) * R * 0.7;
      p.px(ox, oy, GH[3]); g.px(ox, oy, GH[4]); g.px(ox - Math.sin(a2), oy + Math.cos(a2) * 0.7, GH[2]);
    }
  }
  return { x: cx, y: cy };
}

function drawCaller(p, g, P, X) {
  const R = rig(P, CD, CAX2, CAY2);
  const { hip, pt, legF, legB, shF, shB, armF, armB } = R;
  const meta = {};

  // --- Beschwörungskreis am Boden (Leucht-Ebene + blasse Runen)
  if (P.circle > 0.05) {
    const cx = CAX2 + 12, cy = CAY2 - 1, rx = 5 + P.circle * 11, ry = rx * 0.32;
    for (let a = 0; a < TAU; a += 0.06) {
      const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
      const front = Math.sin(a) > 0;
      if (!front && (Math.round(a * 20) & 1)) continue;
      g.px(x, y, GH[front ? (P.circle > 0.7 ? 3 : 2) : 1]);
    }
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU + P.wph * 0.5;
      const x = cx + Math.cos(a) * rx * 0.72, y = cy + Math.sin(a) * ry * 0.72;
      g.px(x, y, GH[4]); g.px(x + 1, y, GH[2]);
    }
    // aufsteigende Seelen aus dem Boden
    if (P.rise > 0) {
      for (let i = 0; i < 4; i++) {
        const x = cx - rx * 0.6 + i * rx * 0.4 + Math.sin(P.wph + i) * 1, y0 = cy - 1 - (hash2(i, 3, 90) * 2);
        const h = (3 + ((i * 3 + Math.round(P.wph * 2)) % 5)) * P.rise;
        for (let j = 0; j < h; j++) g.px(x + Math.sin(P.wph * 2 + j * 0.8 + i) * 0.7, y0 - j, GH[j < h * 0.4 ? 3 : 2]);
        g.px(x, y0 - h, GH[4]);
      }
    }
  }

  // --- hinterer Arm (Ärmel, knochige Hand)
  limb(p, shB.x, shB.y, armB.jx, armB.jy, 3, 3.5, [ROBE_B[0], ROBE_B[0], ROBE_B[1], ROBE_B[2]]);
  limb(p, armB.jx, armB.jy, armB.ex, armB.ey, 3.5, 4.2, [ROBE_B[0], ROBE_B[1], ROBE_B[1], ROBE_B[2]]);
  p.px(armB.ex + 1, armB.ey, BN[2]); p.px(armB.ex + 2, armB.ey + 1, BN[1]);
  if (P.cast > 0.05) {
    g.px(armB.ex + 1, armB.ey, GH[4]); g.px(armB.ex + 2, armB.ey, GH[2]); g.px(armB.ex + 1, armB.ey - 1, GH[2]);
    if (P.cast > 0.6) { g.px(armB.ex, armB.ey - 1, GH[1]); g.px(armB.ex + 2, armB.ey + 1, GH[1]); g.px(armB.ex + 1, armB.ey - 2 - P.wph % 2, GH[3]); }
    p.px(armB.ex + 1, armB.ey, GH[3]);
  }

  // --- Robe: bodenlang, zerfetzter Saum
  const top = pt(CD.spine, 0), waist = pt(1, 0);
  const hemY = CAY2 - 0.5;
  const hemL = Math.min(legB.ex, legF.ex) - 5 + Math.sin(P.sway) * 1 - P.lean * 6;
  const hemR = Math.max(legB.ex, legF.ex) + 3.5 + Math.sin(P.sway + 1) * 0.8;
  for (let y = Math.round(waist.y); y <= hemY; y++) {
    const f = (y - waist.y) / (hemY - waist.y || 1);
    const l = waist.x - 4 + (hemL - (waist.x - 4)) * f;
    const r = waist.x + 3.5 + (hemR - (waist.x + 3.5)) * f * f;
    for (let x = Math.round(l); x <= Math.round(r); x++) {
      const u = (x - l) / (r - l || 1);
      if (y > hemY - 2.5 && hash2(x, Math.round(P.sway * 3), 93) < 0.3 * (y - (hemY - 2.5))) continue; // Fransen
      const fold = Math.sin(u * 8 + P.sway * 0.7 + f * 1.5);
      let k = u < 0.07 ? 5 : u < 0.18 ? 4 : u > 0.84 ? 1 : fold > 0.35 ? 3 : fold < -0.4 ? 1 : 2;
      if (y > hemY - 1.5) k = Math.max(0, k - 1);
      p.px(x, y, ROBE_B[k]);
    }
    // Bronzeborte über dem Saum
    if (y > hemY - 4.5 && y <= hemY - 3.5) for (let x = Math.round(l) + 1; x <= Math.round(r) - 1; x += 1) p.px(x, y, (x % 3) ? BRZ[3] : BRZ[5]);
  }
  limb(p, waist.x, waist.y, top.x, top.y, 7.5, 8, [ROBE_B[1], ROBE_B[2], ROBE_B[3], ROBE_B[4]]);
  const q = (u, k, c) => { const o = pt(u, k); p.px(o.x, o.y, c); };
  // Grabbeigaben: Knochenkette + Bronze-Scheibe
  for (let u = 3; u <= 8; u += 1) q(u, 2.8 - (u - 3) * 0.35, (u % 2) ? BN[4] : BN[2]);
  q(3, 2.2, BRZ[5]); q(2.5, 2.2, BRZ[3]);
  for (let k = -3.5; k <= 3.5; k += 0.5) q(1.3, k, BRZ[2]);
  q(1.3, 2, BRZ[5]);

  // --- Kopf: tiefe Kapuze mit Bronze-Totenmaske und Zackenreif
  const neck = pt(CD.spine + 1.5, 0.5);
  const hx = Math.round(neck.x + P.head), hy = Math.round(neck.y - 3);
  p.ellipse(hx - 0.5, hy, 4.4, 4.4, ROBE_B[2]);
  p.ellipse(hx - 1, hy - 1, 3.4, 3.2, ROBE_B[3]);
  p.px(hx - 3, hy - 3, ROBE_B[5]); p.px(hx - 2, hy - 4, ROBE_B[4]);
  for (let i = 0; i < 5; i++) p.px(hx - 4 - i + P.hood * i * 0.3, hy - 2 - i * 0.4 + i * i * 0.25, ROBE_B[i < 2 ? 3 : 2]);
  // Zackenreif (Bronzekrone) über der Kapuze
  for (let k = -3; k <= 2; k++) {
    p.px(hx + k, hy - 4, BRZ[3]);
    if ((k & 1) === 0) { p.px(hx + k, hy - 5, BRZ[5]); p.px(hx + k, hy - 6, BRZ[6]); }
  }
  // Maske: Bronzeprofil, leere Augen mit Geisterlicht
  p.rect(hx + 1, hy - 2, 3, 5, BRZ[4]);
  p.rect(hx + 1, hy - 2, 2, 1, BRZ[5]);
  p.px(hx + 4, hy, BRZ[4]); p.px(hx + 4, hy + 1, BRZ[3]);
  p.px(hx + 1, hy + 2, BRZ[3]); p.px(hx + 2, hy + 2, BRZ[2]); p.px(hx + 3, hy + 2, BRZ[1]);
  p.px(hx + 2, hy + 1, VERD[3]); p.px(hx + 1, hy, VERD[2]);
  p.px(hx + 3, hy - 1, '#040506'); p.px(hx + 2, hy - 1, BRZ[3]);
  if (P.eye > 0.3) {
    p.px(hx + 3, hy - 1, GH[4]); g.px(hx + 3, hy - 1, GH[5]); g.px(hx + 4, hy - 1, GH[2]); g.px(hx + 3, hy, GH[1]);
    wisp(p, g, hx + 2, hy - 1.5, 5, P.wph, -1, 0.25, P.eye);
  }
  p.px(hx, hy - 1, ROBE_B[1]); p.px(hx, hy, ROBE_B[1]); p.px(hx, hy + 1, ROBE_B[1]);
  p.px(hx + 1, hy - 3, ROBE_B[3]); p.px(hx + 2, hy - 3, ROBE_B[2]); p.px(hx + 3, hy - 3, ROBE_B[2]);
  meta.eye = { x: hx + 3, y: hy - 1 };
  meta.head = { x: hx, y: hy - 7 };
  meta.mouth = { x: hx + 3, y: hy + 1 };

  // --- vorderer Arm + Laternenstab
  if (X.smear) smearArc(p, g, shF.x, shF.y, X.smear[0], X.smear[1], 8, 17, GH_EDGE, GH_EDGE_G, 1);
  limb(p, shF.x, shF.y, armF.jx, armF.jy, 3, 3.5, [ROBE_B[2], ROBE_B[3], ROBE_B[4], ROBE_B[5]]);
  limb(p, armF.jx, armF.jy, armF.ex, armF.ey, 3.5, 4.2, [ROBE_B[2], ROBE_B[3], ROBE_B[4], ROBE_B[5]]);
  p.px(armF.ex, armF.ey + 1, BRZ[4]);
  const lan = lanternStaff(p, g, armF.ex, armF.ey, P.sa, P.flame, P.orbit, P.wph);
  p.rect(armF.ex - 1, armF.ey - 1, 2, 2, BN[2]); p.px(armF.ex - 1, armF.ey - 1, BN[4]);
  meta.hand = lan;
  meta.cast = lan;
  return meta;
}

function callerAnims() {
  const mk = (P, X) => makeFrame(CWW, CWH, CAX2, CAY2, drawCaller, P, X);
  const idle = [];
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU;
    idle.push(mk(cpose2({ hipY: Math.sin(a) > 0.3 ? 1 : 0, sway: a, flame: 0.5 + Math.sin(a * 2) * 0.2, hFy: 7 + Math.sin(a) * 0.5, head: Math.sin(a) * 0.3, hood: Math.sin(a), wph: a })));
  }
  const walk = [];
  for (let i = 0; i < 8; i++) {
    const ph = i / 8 * TAU, s = Math.sin(ph), c = Math.cos(ph);
    walk.push(mk(cpose2({
      fFx: 1 + s * 3.5, fFy: Math.max(0, -c) * 1.5, fBx: -1 - s * 3.5, fBy: Math.max(0, c) * 1.5,
      hipY: c > 0.5 || c < -0.5 ? 0 : 1, lean: 0.16, sway: ph * 2, hFx: 6 + s * 0.8, sa: -1.42 - s * 0.05,
      hBx: 2 - s * 1.5, flame: 0.5, hood: -1 + s * 0.3, wph: ph,
    })));
  }
  // Geisterblitz: Laterne hoch, Flamme wächst, Seelenfunken kreisen …
  const windup = [
    mk(cpose2({ hFx: 5, hFy: 1, sa: -1.55, hBx: 4, hBy: 2, cast: 0.3, flame: 0.8, orbit: 0.2, lean: 0.02, wph: 1 })),
    mk(cpose2({ hFx: 4, hFy: -3, sa: -1.6, hBx: 5, hBy: -1, cast: 0.6, flame: 1.2, orbit: 0.5, lean: -0.05, sway: 1, hood: 0.5, wph: 2 })),
    mk(cpose2({ hFx: 3, hFy: -5, sa: -1.65, hBx: 5, hBy: -3, cast: 0.9, flame: 1.6, orbit: 0.8, lean: -0.1, sway: 2, hood: 1, wph: 3 })),
    mk(cpose2({ hFx: 3, hFy: -6, sa: -1.7, hBx: 5, hBy: -4, cast: 1, flame: 1.9, orbit: 1.1, lean: -0.12, sway: 3, hood: 1, wph: 4 })),
  ];
  // … und nach vorn gestoßen: der Blitz löst sich aus der Laterne
  const strike = [
    mk(cpose2({ hFx: 10, hFy: 0, sa: -0.4, hBx: 3, hBy: 3, flame: 2, lean: 0.24, hipX: 1, fFx: 4, fBx: -3, sway: 4, hood: -1, wph: 5 }), { smear: [-1.7, -0.4], fx: 'cast' }),
    mk(cpose2({ hFx: 11, hFy: 1, sa: -0.25, hBx: 2, hBy: 4, flame: 0.4, lean: 0.28, hipX: 1.5, fFx: 4, fBx: -3, sway: 5, hood: -1.5, wph: 6 })),
    mk(cpose2({ hFx: 8, hFy: 3, sa: -0.9, hBx: 2, hBy: 5, flame: 0.3, lean: 0.16, hipX: 1, fFx: 3, fBx: -3, sway: 6, wph: 7 })),
  ];
  // Beschwörung: beide Arme hoch, Laterne über dem Kopf, Kreis am Boden, Seelen steigen auf
  const sk = [
    [0, cpose2({ wph: 0 })],
    [0.25, cpose2({ hFx: 7, hFy: -2, sa: -1.35, hBx: 4, hBy: -2, cast: 0.5, flame: 1, lean: 0.02, circle: 0.3, sway: 1, wph: 1.5 })],
    [0.5, cpose2({ hFx: 8, hFy: -7, sa: -1.2, hBx: 1, hBy: -8, cast: 1, flame: 1.8, orbit: 0.8, lean: -0.14, circle: 0.8, rise: 0.4, sway: 2, hood: 1, head: -0.5, wph: 3 }), snap],
    [0.8, cpose2({ hFx: 9, hFy: -8, sa: -1.15, hBx: 0, hBy: -9, cast: 1, flame: 2, orbit: 1.3, lean: -0.16, circle: 1, rise: 1, sway: 3, hood: 1.2, head: -0.6, wph: 4.5 })],
    [1, cpose2({ hFx: 7, hFy: 4, sa: -1.2, hBx: 6, hBy: 6, cast: 0.3, flame: 1.2, orbit: 0.3, lean: 0.2, circle: 1, rise: 1, sway: 4, wph: 6 })],
  ];
  const summon = track(mk, sk, 8, { extras: { 5: { fx: 'cast' } } });
  const hurtP = cpose2({ lean: -0.2, hipX: -1, head: -1, hFx: 4, hFy: 4, sa: -1.9, hBx: 0, hBy: 4, flame: 1, sway: 2, hood: 1.5, wph: 2 });
  const hurt = [mk(hurtP), mk(mixP(hurtP, C_REST2, 0.5))];
  // Tod: sinkt in die Robe, Laterne fällt, Flamme erlischt
  const d1 = { ...hurtP, lean: -0.3, hipX: -1.5, flame: 1.2 };
  const d2 = { ...d1, hipY: 3, lean: -0.1, hFy: 8, sa: -2.3, flame: 0.6, wph: 3 };
  const d3 = { ...d2, hipY: 5, lean: 0.1, flame: 0.25, eye: 0, wph: 4 };
  const piv = [CAX2 - 3, CAY2 - 1];
  const death = [
    mk(d1), mk(d2), mk(d3, { rot: [-0.5, ...piv] }), mk(d3, { rot: [-1.1, ...piv] }),
    mk({ ...d3, flame: 0.1 }, { rot: [-1.5, piv[0], piv[1] - 0.5], fx: 'impact' }),
    mk({ ...d3, flame: 0, eye: 0 }, { rot: [-Math.PI / 2, piv[0], piv[1] - 0.5] }),
  ];
  return {
    idle: new Animation(idle, 6),
    walk: new Animation(walk, 9),
    windup: new Animation(windup, 6, false),
    strike: new Animation(strike, 12, false),
    summon: new Animation(summon, 7, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 9, false),
  };
}

// ================================================================ Export

export function createBarrowFoes() {
  return {
    barrow_wight: wightAnims(),
    grave_hound: houndAnims(),
    bone_archer: boneArcherAnims(),
    wight_caller: callerAnims(),
  };
}
