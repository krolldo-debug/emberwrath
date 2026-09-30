import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame, SpriteFrame, Animation } from '../gfx/Sprite.js';
import { hash2 } from '../core/math.js';

// Varkhul, der Knochenfürst.
//
// Das Sprite ist ein kleines Skelett-Rig: Hüfte, Wirbelsäule, Kopf, zwei Arme
// und zwei Beine (Zwei-Gelenk-IK), dazu Umhang, Rüstteile und ein riesiges
// Knochen-Großschwert. Animationen sind Schlüsselposen, zwischen denen beim
// Laden weich interpoliert wird. Jeder Frame hat zusätzlich eine Leucht-Ebene
// (Augen, Seelenfeuer, Runen) in Violett und – für Phase 3 – in Glutrot, sowie
// Metadaten (Kopf, Hand, Klingenspitze) für Partikel und Effekte.
// Blickrichtung rechts, Anker = Mitte zwischen den Füßen.
const W = 128, H = 112, AX = 56, AY = 106;
const B = PAL.bone, St = PAL.steel;
// Rüstung: dunkles, angelaufenes Eisen mit Rostkanten
const R = ['#141620', '#262a38', '#3c4052', '#5c5f70'];
const RUST = PAL.rust;
const CAPE = ['#0c0612', '#170b22', '#241036', '#34184c', '#46215f'];
const VOID = '#0d0610';
const GLOW = {
  violet: ['#3a1466', '#6a2cb0', '#a060f0', '#e0b8ff', '#ffffff'],
  ember: ['#4a0e06', '#a8280c', '#f0602a', '#ffb070', '#fff4d8'],
};

const THIGH = 13, SHIN = 13, SPINE = 19, UPPER = 11, FORE = 11, BLADE = 38;

// ---------------------------------------------------------------- Pose

const REST = {
  hipX: 0, hipY: 0, lean: 0.06, head: 0, jaw: 0,
  fFx: 7, fFy: 0, fBx: -8, fBy: 0,
  hFx: 9, hFy: 15, hBx: -5, hBy: 16,
  sword: 0.55, grip: 0, cape: 0.2, capeT: 0,
  cast: 0, eye: 1, soul: 1, kneel: 0,
};
const pose = (o = {}) => ({ ...REST, ...o });
const ease = (t) => t * t * (3 - 2 * t);
const mix = (a, b, t) => {
  const o = {};
  for (const k in REST) o[k] = a[k] + (b[k] - a[k]) * t;
  return o;
};
// Tastet eine Keyframe-Spur ab: keys = [[t 0..1, pose, easing?], ...]
function sample(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, p0] = keys[i], [t1, p1, e = ease] = keys[i + 1];
    if (t <= t1) return mix(p0, p1, e((t - t0) / (t1 - t0 || 1)));
  }
  return keys[keys.length - 1][1];
}
const linear = (t) => t;
const snap = (t) => 1 - (1 - t) * (1 - t) * (1 - t); // schnell rein, weich aus

// ---------------------------------------------------------------- Geometrie

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

// Dicker Knochen/Rüstteil mit Licht von links oben.
function limb(p, x0, y0, x1, y1, w0, w1, ramp) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len, ny = dx / len;
  if (nx + ny > 0) { nx = -nx; ny = -ny; } // Normale zeigt nach links oben
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
const knob = (p, x, y, r, ramp) => { p.ellipse(x, y, r, r, ramp[1]); p.px(x - r * 0.4, y - r * 0.4, ramp[3]); };

// Großschwert: Griff, Parierstange aus Wirbeln, breite gezackte Knochenklinge.
function greatsword(p, g, hx, hy, a, glow) {
  const dx = Math.cos(a), dy = Math.sin(a);
  let nx = -dy, ny = dx;
  const flipN = nx + ny > 0; if (flipN) { nx = -nx; ny = -ny; }
  // Griff + Knauf
  limb(p, hx - dx * 7, hy - dy * 7, hx + dx * 1, hy + dy * 1, 2, 2, [PAL.leather[0], PAL.leather[1], PAL.leather[2], PAL.leather[3]]);
  p.ellipse(hx - dx * 8, hy - dy * 8, 1.5, 1.5, B[2]); p.px(hx - dx * 8 - 0.5, hy - dy * 8 - 0.5, B[4]);
  // Parierstange
  for (let k = -6; k <= 6; k += 0.5) {
    const v = Math.abs(k);
    const c = v > 5 ? B[1] : Math.round(k) % 3 === 0 ? B[1] : B[3];
    p.px(hx + dx * 2 + nx * k, hy + dy * 2 + ny * k, c);
    p.px(hx + dx * 3 + nx * k * 0.8, hy + dy * 3 + ny * k * 0.8, v > 4 ? B[2] : B[2]);
  }
  p.px(hx + dx * 2 + nx * 6.5, hy + dy * 2 + ny * 6.5, B[4]); p.px(hx + dx * 2 - nx * 6.5, hy + dy * 2 - ny * 6.5, B[2]);
  // Klinge
  const bx = hx + dx * 4, by = hy + dy * 4;
  for (let s = 0; s <= BLADE; s += 0.5) {
    const f = s / BLADE;
    const hw = 3.4 - 2.2 * f * f - (f > 0.94 ? (f - 0.94) * 30 : 0);
    const notch = (Math.floor(s) % 7 === 3 && f < 0.85) ? 1 : 0;
    for (let k = -hw; k <= hw - notch * (k > 0 ? 1 : 0); k += 0.5) {
      const edge = k > hw - 1.1 ? 3 : k < -hw + 1 ? 0 : Math.abs(k) < 0.6 ? 1 : 2;
      let c = [B[1], B[2], B[3], B[4]][edge];
      if (edge === 2 && hash2(Math.round(s), Math.round(k * 2), 7) < 0.12) c = PAL.rust[2];
      p.px(bx + dx * s + nx * k, by + dy * s + ny * k, c);
    }
  }
  // Runen entlang der Hohlkehle (Leucht-Ebene)
  for (let s = 5; s < BLADE - 6; s += 5) {
    p.px(bx + dx * s, by + dy * s, B[1]);
    g.px(bx + dx * s, by + dy * s, glow[2]);
    g.px(bx + dx * (s + 1), by + dy * (s + 1), glow[1]);
  }
  return { tipX: bx + dx * BLADE, tipY: by + dy * BLADE };
}

// Schwung-Schleier (Smear) zwischen zwei Klingenwinkeln um einen Drehpunkt.
function smear(p, g, cx, cy, a0, a1, r0, r1, glow) {
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1), span = hi - lo || 1;
  const R1 = Math.ceil(r1);
  for (let y = -R1; y <= R1; y++) for (let x = -R1; x <= R1; x++) {
    const d = Math.hypot(x, y);
    if (d < r0 || d > r1) continue;
    let a = Math.atan2(y, x);
    while (a < lo - Math.PI) a += Math.PI * 2;
    while (a > lo + Math.PI) a -= Math.PI * 2;
    if (a < lo || a > hi) continue;
    // "fresh" = 1 an der aktuellen Klinge, 0 am Anfang des Schwungs
    const fresh = a1 > a0 ? (a - lo) / span : (hi - a) / span;
    const radial = (d - r0) / (r1 - r0);
    const band = Math.max(0, 1 - (1 - radial) * 2.2);
    const dens = fresh * fresh * 0.4 + band * (0.25 + 0.75 * fresh);
    if (hash2(x + 99, y + 99, 13) > dens) continue;
    const c = radial > 0.86 ? B[4] : radial > 0.7 ? B[3] : fresh > 0.7 ? '#c8bce0' : '#8a7aa8';
    p.px(cx + x, cy + y, c);
    if (fresh > 0.45 && radial > 0.55) g.px(cx + x, cy + y, radial > 0.85 ? glow[3] : glow[1]);
  }
}

// ---------------------------------------------------------------- Zeichnen

function drawBonelord(p, g, P, glow, extra = {}) {
  const gy = AY;
  const hipX = AX - 2 + P.hipX, hipY = gy - 24 + P.hipY + P.kneel * 9;
  const lean = P.lean;
  const chX = hipX + Math.sin(lean) * SPINE, chY = hipY - Math.cos(lean) * SPINE;
  const perpX = Math.cos(lean), perpY = Math.sin(lean); // "nach vorn" quer zum Rumpf
  const meta = {};

  // Füße / Knie (IK), Knie beugen nach vorn
  const fF = { x: AX + P.fFx, y: gy - P.fFy };
  const fB = { x: AX + P.fBx, y: gy - P.fBy };
  const legF = ik(hipX + 2, hipY, fF.x, fF.y, THIGH, SHIN, -1);
  const legB = ik(hipX - 2, hipY, fB.x, fB.y, THIGH, SHIN, -1);
  // Kniend: hinteres Knie auf dem Boden
  if (P.kneel > 0.01) {
    const kx = hipX - 5 - P.kneel * 3, ky = gy - 1;
    legB.jx += (kx - legB.jx) * P.kneel; legB.jy += (ky - legB.jy) * P.kneel;
    legB.ex += (kx - 11 - legB.ex) * P.kneel; legB.ey += (gy - legB.ey) * P.kneel;
  }

  // Schultern und Arme
  const shF = { x: chX + perpX * 5, y: chY + perpY * 5 + 1 };
  const shB = { x: chX - perpX * 5, y: chY - perpY * 5 };
  const hF = { x: chX + P.hFx, y: chY + P.hFy };
  const sa = P.sword;
  const hB = P.grip > 0.5
    ? { x: hF.x - Math.cos(sa) * 5, y: hF.y - Math.sin(sa) * 5 }
    : { x: chX + P.hBx, y: chY + P.hBy };
  const armF = ik(shF.x, shF.y, hF.x, hF.y, UPPER, FORE, 1);
  const armB = ik(shB.x, shB.y, hB.x, hB.y, UPPER, FORE, 1);

  // Kopf
  const neckX = chX + Math.sin(lean) * 3, neckY = chY - Math.cos(lean) * 3;
  const hx = Math.round(neckX + P.head - 5), hy = Math.round(neckY - 14);

  // --- 1. Umhang hinten, mit hohem Kragen
  const capeTopX = chX - perpX * 2, capeTopY = chY - 2;
  const capeLen = 40 - P.kneel * 10;
  for (let i = 0; i < 18; i++) {
    const u = i / 17;
    const sx = capeTopX - 8 + i * 0.9;
    const top = capeTopY + Math.abs(u - 0.4) * 3;
    const len = capeLen - Math.abs(u - 0.5) * 8 + Math.sin(P.capeT + i * 0.9) * 2.2 + (hash2(i, 1, 3) * 4 | 0);
    for (let j = 0; j < len; j++) {
      const v = j / len;
      const x = sx - P.cape * 16 * v * v - (1 - u) * 4 * v + Math.sin(P.capeT * 1.3 + v * 4 + i * 0.4) * 1.4 * v;
      const shade = u < 0.15 ? 3 : u > 0.85 ? 0 : (i % 3 === 0 ? 1 : 2);
      p.px(x, top + j, CAPE[v > 0.85 && shade > 0 ? shade - 1 : shade]);
    }
    if (i % 4 === 1) { const x = sx - P.cape * 16 - (1 - u) * 4; p.px(x, top + len, CAPE[0]); p.px(x, top + len + 1, CAPE[0]); }
  }
  // Kragen hinter dem Schädel
  for (let i = 0; i < 9; i++) {
    const x = hx - 3 + i * 0.8, top = hy - 3 + Math.abs(i - 1) * 0.7;
    p.rect(x, top, 1, chY - top + 2, CAPE[i < 2 ? 4 : i < 5 ? 3 : 2]);
  }

  // --- 2. Hinteres Bein und Arm (dunkler)
  const darkB = [VOID, B[0], B[1], B[2]];
  limb(p, hipX - 2, hipY, legB.jx, legB.jy, 4, 3, darkB);
  limb(p, legB.jx, legB.jy, legB.ex, legB.ey - 2, 5, 5, [R[0], R[0], R[1], R[2]]);
  p.rect(legB.ex - 3, legB.ey - 3, 8, 3, R[0]); p.rect(legB.ex - 3, legB.ey - 3, 8, 1, R[1]);
  knob(p, legB.jx, legB.jy, 2, [R[0], R[1], R[1], R[2]]);
  limb(p, shB.x, shB.y, armB.jx, armB.jy, 3, 3, darkB);
  limb(p, armB.jx, armB.jy, armB.ex, armB.ey, 3, 2.5, darkB);
  // Zauberhand
  const clawOpen = P.cast > 0.3 || P.grip > 0.5 ? 1 : 0;
  p.rect(armB.ex - 2, armB.ey - 1, 4, 3, B[1]);
  if (clawOpen) for (let k = -2; k <= 2; k += 2) p.line(armB.ex + k * 0.6, armB.ey - 1, armB.ex + k * 1.3, armB.ey - 4, B[2]);
  meta.cast = { x: armB.ex, y: armB.ey - 3 };

  // --- 3. Becken, Tassetten, Wirbelsäule, Brustkorb
  p.ellipse(hipX, hipY, 7, 3, B[1]); p.ellipse(hipX, hipY - 1, 6, 2, B[2]); p.px(hipX - 3, hipY - 2, B[4]);
  for (let i = 0; i < 4; i++) {
    const tx = hipX - 6 + i * 4, ty = hipY + 1;
    const sw = Math.sin(P.capeT + i) * 0.8 + P.lean * 4;
    p.rect(tx + sw * 0.3, ty, 4, 8 - Math.abs(i - 1.5), R[i % 2 ? 1 : 2]);
    p.rect(tx + sw * 0.3, ty, 4, 1, R[3]);
    p.px(tx + sw * 0.3 + 1, ty + 3, RUST[2]); p.px(tx + sw * 0.3 + 2, ty + 5, RUST[1]);
  }
  // Gürtel mit Schädelschnalle
  p.rect(hipX - 7, hipY - 3, 14, 2, PAL.leather[1]);
  p.rect(hipX - 1, hipY - 4, 4, 4, B[3]); p.px(hipX, hipY - 3, VOID); p.px(hipX + 2, hipY - 3, VOID);
  // Wirbel
  for (let s = 2; s < SPINE - 8; s += 2) {
    const x = hipX + Math.sin(lean) * s, y = hipY - Math.cos(lean) * s;
    p.rect(x - 1, y - 1, 3, 2, B[2]); p.px(x - 1, y - 1, B[3]);
  }
  // Brustkorb: dunkles Inneres, Rippen quer zur Wirbelsäule
  const rcx = hipX + Math.sin(lean) * 14, rcy = hipY - Math.cos(lean) * 14;
  p.ellipse(rcx, rcy - 1, 8, 7, VOID);
  // Seelenfeuer
  const soulR = 2 + P.soul * 1.3;
  p.ellipse(rcx, rcy, soulR, soulR + 1, glow[1]);
  g.ellipse(rcx, rcy, soulR + 0.5, soulR + 1.5, glow[1]);
  g.ellipse(rcx, rcy, soulR - 0.5, soulR, glow[2]);
  g.ellipse(rcx, rcy - 0.5, Math.max(0.6, soulR - 1.6), Math.max(0.6, soulR - 1.2), glow[3]);
  g.px(rcx, rcy - soulR - 2, glow[2]);
  meta.chest = { x: rcx, y: rcy };
  for (let r = 0; r < 5; r++) {
    const off = -6 + r * 3;
    const cx = rcx + Math.sin(lean) * -off, cy = rcy - Math.cos(lean) * -off;
    const hw = 8 - Math.abs(r - 1.5) * 1.1;
    const ax = cx - perpX * hw, ay = cy - perpY * hw + 1, bx = cx + perpX * hw, by = cy + perpY * hw + 1;
    p.line(ax, ay, cx, cy, B[2]); p.line(cx, cy, bx, by, B[3]);
    p.px(bx, by, B[4]); p.px(ax, ay + 1, B[1]);
  }
  // Brustbein
  limb(p, rcx + Math.sin(lean) * 7, rcy - Math.cos(lean) * 7, rcx - Math.sin(lean) * 4, rcy + Math.cos(lean) * 4, 2, 2, [B[1], B[2], B[3], B[4]]);

  // --- 4. Vorderes Bein
  const lightB = [B[1], B[2], B[3], B[4]];
  limb(p, hipX + 2, hipY, legF.jx, legF.jy, 4.5, 3.5, lightB);
  limb(p, legF.jx, legF.jy, legF.ex, legF.ey - 2, 5.5, 5, [R[0], R[1], R[2], R[3]]);
  // Sabaton mit Zehendorn
  p.rect(legF.ex - 3, legF.ey - 3, 9, 3, R[1]); p.rect(legF.ex - 3, legF.ey - 3, 9, 1, R[3]); p.px(legF.ex, legF.ey - 2, RUST[2]);
  p.px(legF.ex + 6, legF.ey - 2, B[3]); p.px(legF.ex + 7, legF.ey - 1, B[4]);
  knob(p, legF.jx, legF.jy, 2.5, [R[0], R[1], R[2], R[3]]); p.px(legF.jx + 1, legF.jy + 1, RUST[2]);
  p.px(legF.jx + 2, legF.jy - 3, B[4]);

  // --- 5. Hintere Schulterplatte
  const pauldron = (x, y, rx, ry, ramp, spikes) => {
    p.ellipse(x, y, rx, ry, ramp[0]);
    p.ellipse(x - 0.5, y - 0.5, rx - 1, ry - 1, ramp[1]);
    p.ellipse(x - 1.5, y - 1.5, rx - 3, ry - 2.5, ramp[2]);
    p.line(x - rx + 1, y + ry - 1, x + rx - 1, y + ry - 1, ramp[0]);
    for (let k = -rx + 2; k < rx - 1; k += 3) p.px(x + k, y + ry - 2, RUST[3]);
    p.line(x - rx + 2, y + ry - 1, x + rx - 2, y + ry - 1, RUST[1]);
    for (const [sx, h, lean2] of spikes) {
      limb(p, x + sx, y - ry + 1, x + sx + lean2, y - ry + 1 - h, 2.5, 1, lightB);
    }
  };
  pauldron(shB.x - 2, shB.y, 6, 5, [R[0], R[1], R[2]], [[-3, 5, -3], [0, 6, -2]]);

  // --- 6. Schädel mit Krone
  const jaw = Math.round(P.jaw * 3);
  // Hirnschale (rund), Brauenwulst, Wangenknochen, schmaler Oberkiefer
  p.ellipse(hx + 6, hy + 4, 6.5, 5.5, B[2]);
  p.ellipse(hx + 5.5, hy + 3.5, 5.5, 4.5, B[3]);
  p.ellipse(hx + 4.5, hy + 2, 3, 2, B[4]);
  p.rect(hx + 3, hy + 7, 9, 3, B[3]);
  p.rect(hx + 1, hy + 5, 2, 4, B[2]);
  p.rect(hx + 11, hy + 5, 2, 3, B[4]);
  p.rect(hx + 5, hy + 3, 7, 1, B[4]); // Brauenwulst
  // Augenhöhlen (tief, mit Schatten darunter)
  p.rect(hx + 5, hy + 4, 3, 3, VOID); p.px(hx + 5, hy + 7, B[1]); p.px(hx + 7, hy + 7, B[1]);
  p.rect(hx + 9, hy + 4, 2, 3, VOID);
  p.px(hx + 10, hy + 8, VOID); p.px(hx + 9, hy + 8, B[1]); // Nase
  p.px(hx + 12, hy + 7, B[2]); p.px(hx + 3, hy + 8, B[1]);
  if (P.eye > 0.2) {
    g.rect(hx + 6, hy + 5, 2, 1, glow[3]); g.px(hx + 6, hy + 5, glow[4]);
    g.px(hx + 9, hy + 5, glow[2]);
    if (P.eye > 0.8) { g.px(hx + 5, hy + 5, glow[1]); g.px(hx + 7, hy + 4, glow[1]); }
  }
  meta.eye = { x: hx + 7, y: hy + 5 };
  // Zahnreihe oben, Unterkiefer
  p.rect(hx + 4, hy + 10, 8, 1, B[2]);
  for (let x = hx + 5; x < hx + 12; x += 2) p.px(x, hy + 10, B[4]);
  if (jaw) p.rect(hx + 5, hy + 11, 7, jaw, VOID);
  p.rect(hx + 4, hy + 11 + jaw, 8, 2, B[2]); p.px(hx + 4, hy + 11 + jaw, B[1]); p.rect(hx + 5, hy + 12 + jaw, 6, 1, B[1]);
  for (let x = hx + 6; x < hx + 12; x += 2) p.px(x, hy + 11 + jaw - (jaw ? 1 : 0), B[4]);
  // Eisenreif mit Knochenzacken
  p.rect(hx - 1, hy - 1, 14, 2, St[1]); p.rect(hx - 1, hy - 1, 14, 1, St[3]);
  const crown = [[0, 4], [3, 6], [6, 9], [9, 6], [12, 4]];
  for (const [cx, h] of crown) {
    limb(p, hx + cx, hy - 1, hx + cx + (cx - 6) * 0.15, hy - 1 - h, 2, 1, lightB);
  }
  g.px(hx + 6, hy - 1, glow[3]); p.px(hx + 6, hy - 1, glow[1]);
  meta.head = { x: hx + 6, y: hy - 4 };

  // --- 7. Schwung-Schleier
  if (extra.smear) {
    const s = extra.smear;
    smear(p, g, shF.x, shF.y, s[0], s[1], 12, 12 + FORE + BLADE * 0.95, glow);
  }

  // --- 8. Vordere Schulterplatte, Arm, Schwert
  const drawArm = () => {
    limb(p, shF.x, shF.y, armF.jx, armF.jy, 3.5, 3, lightB);
    limb(p, armF.jx, armF.jy, armF.ex, armF.ey, 4, 4, [R[0], R[1], R[2], R[3]]);
    knob(p, armF.jx, armF.jy, 2, lightB);
    p.rect(armF.ex - 2, armF.ey - 2, 4, 4, R[1]); p.px(armF.ex - 2, armF.ey - 2, R[3]);
  };
  const swordBehind = extra.swordBehind;
  let tip;
  if (swordBehind) { tip = greatsword(p, g, hF.x, hF.y, sa, glow); drawArm(); }
  else { drawArm(); tip = greatsword(p, g, hF.x, hF.y, sa, glow); p.rect(hF.x - 2, hF.y - 1, 3, 3, R[2]); p.px(hF.x - 2, hF.y - 1, R[3]); }
  pauldron(shF.x + 2, shF.y, 7, 5.5, [R[1], R[2], R[3]], [[2, 5, 2], [5, 4, 3]]);
  meta.hand = { x: hF.x, y: hF.y };
  meta.tip = { x: tip.tipX, y: tip.tipY };

  // Zauberglut an der Hand
  if (P.cast > 0.05) {
    const r = 1 + P.cast * 3;
    g.ellipse(meta.cast.x, meta.cast.y, r + 1, r + 1, glow[1]);
    g.ellipse(meta.cast.x, meta.cast.y, r, r, glow[2]);
    g.ellipse(meta.cast.x, meta.cast.y, Math.max(0.5, r - 1.5), Math.max(0.5, r - 1.5), glow[3]);
  }
  return meta;
}

// Zerfall: Knochenhaufen, umgestürzte Rüstung, Schwert und weggerollte Krone.
function drawCollapse(p, g, k, glow) {
  const gy = AY;
  const cx = AX + 2;
  p.ellipse(cx - 2, gy - 2, 16 + k * 6, 3.5, CAPE[1]);
  p.ellipse(cx - 4, gy - 3, 12 + k * 4, 2.5, CAPE[2]);
  for (let i = 0; i < 22; i++) {
    const a = hash2(i, 2, 5) * Math.PI, r = 4 + hash2(i, 3, 5) * (12 + k * 8);
    const x = cx + Math.cos(a) * r - 4, y = gy - 3 - hash2(i, 4, 5) * (6 * (1 - k * 0.6));
    const l = 3 + hash2(i, 6, 5) * 4, ang = hash2(i, 7, 5) * Math.PI;
    limb(p, x, y, x + Math.cos(ang) * l, y + Math.sin(ang) * l * 0.5, 2, 1.5, [B[1], B[1], B[2], B[3]]);
  }
  // Brustkorb
  p.ellipse(cx - 6, gy - 6 + k * 2, 6, 4 - k, VOID);
  for (let r = 0; r < 4; r++) p.line(cx - 11 + r * 3, gy - 8 + k * 2, cx - 9 + r * 3, gy - 3, B[3]);
  // Schädel liegt
  p.rect(cx + 6, gy - 9 + k * 3, 11, 7, B[3]); p.rect(cx + 6, gy - 9 + k * 3, 11, 1, B[4]);
  p.rect(cx + 10, gy - 7 + k * 3, 3, 2, VOID); p.rect(cx + 14, gy - 7 + k * 3, 2, 2, VOID);
  if (k < 0.5) g.px(cx + 11, gy - 7 + k * 3, glow[2]);
  // Schulterplatten
  p.ellipse(cx - 14, gy - 3, 5, 3, R[1]); p.ellipse(cx - 15, gy - 4, 3, 2, R[2]);
  p.ellipse(cx + 1, gy - 2, 6, 3, R[2]); p.ellipse(cx, gy - 3, 4, 2, R[3]);
  // Schwert liegt quer
  greatsword(p, g, cx - 22, gy - 4, -0.05, glow);
  // Krone rollt weg
  const kx = cx + 26 + k * 10;
  p.rect(kx, gy - 3, 12, 2, St[1]); p.rect(kx, gy - 3, 12, 1, St[3]);
  for (let i = 0; i < 5; i++) limb(p, kx + i * 3, gy - 3, kx + i * 3 + 1, gy - 5 - [3, 5, 7, 5, 3][i], 2, 1, [B[1], B[2], B[3], B[4]]);
}

// ---------------------------------------------------------------- Frames

function frame(P, extra, glowSet) {
  const g = new PixelCanvas(W, H);
  let meta;
  const base = buildFrame(W, H, AX, AY, (p) => { meta = drawBonelord(p, g, P, GLOW.violet, extra); });
  // Leucht-Ebenen (kein Umriss): violett und, für Phase 3, glutrot
  const gv = new SpriteFrame(g.canvas, AX, AY);
  const g2 = new PixelCanvas(W, H);
  drawBonelord(new PixelCanvas(W, H), g2, P, GLOW.ember, extra);
  base.glow = gv;
  base.glowEnraged = new SpriteFrame(g2.canvas, AX, AY);
  base.meta = {};
  for (const k in meta) base.meta[k] = { dx: meta[k].x - AX, dy: meta[k].y - AY };
  base.fx = extra.fx ?? null; // Ereignis-Marke, z. B. 'step' oder 'impact'
  return base;
}

function collapseFrame(k) {
  const g = new PixelCanvas(W, H), g2 = new PixelCanvas(W, H);
  const base = buildFrame(W, H, AX, AY, (p) => drawCollapse(p, g, k, GLOW.violet));
  drawCollapse(new PixelCanvas(W, H), g2, k, GLOW.ember);
  base.glow = new SpriteFrame(g.canvas, AX, AY);
  base.glowEnraged = new SpriteFrame(g2.canvas, AX, AY);
  base.meta = { head: { dx: 12, dy: -10 }, chest: { dx: -4, dy: -6 }, hand: { dx: -20, dy: -4 }, tip: { dx: 20, dy: -4 }, eye: { dx: 12, dy: -8 }, cast: { dx: 0, dy: -6 } };
  base.fx = null;
  return base;
}

// n Frames aus einer Keyframe-Spur; loop = letzter Frame ≠ erster
function track(keys, n, { loop = false, extras = {} } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = loop ? i / n : n === 1 ? 1 : i / (n - 1);
    out.push(frame(sample(keys, t), extras[i] ?? {}));
  }
  return out;
}

export function createBonelordSprites() {
  // --- Grundposen
  const idleA = pose({ capeT: 0 });
  const idleB = pose({ hipY: 1, lean: 0.09, hFy: 16, hBy: 17, sword: 0.58, capeT: Math.PI, jaw: 0.3, soul: 1.3 });

  // Gehen: schwere Schritte, Oberkörper wippt, Umhang weht nach hinten
  const walkKeys = [];
  for (let i = 0; i <= 8; i++) {
    const ph = (i / 8) * Math.PI * 2, s = Math.sin(ph), c = Math.cos(ph);
    walkKeys.push([i / 8, pose({
      hipX: 1, hipY: Math.abs(c) * -1.2 + 0.8, lean: 0.14 + Math.abs(s) * 0.03,
      fFx: 3 + s * 8, fFy: Math.max(0, -c) * 3, fBx: -5 - s * 8, fBy: Math.max(0, c) * 3,
      hFx: 10 + s * 1.5, hFy: 14 - Math.abs(s), hBx: -4 - s * 3, hBy: 15,
      sword: 0.6 + s * 0.05, cape: 0.45, capeT: ph, head: s * 0.5,
    }), linear]);
  }

  // Schlafend: kniet, Schwert als Stütze vor sich in den Boden gerammt
  const kneel = pose({
    kneel: 1, lean: 0.32, fFx: 8, fBx: -10, hFx: 12, hFy: 6, grip: 1, sword: Math.PI / 2 - 0.08,
    head: 2, jaw: 0, eye: 0, soul: 0.3, cape: 0,
  });
  const rise = pose({ kneel: 0.3, lean: 0.12, hipY: 2, fFx: 8, fBx: -10, hFx: 12, hFy: 8, grip: 1, sword: 1.4, head: 1, eye: 1, soul: 1.2, cape: 0.3 });
  const roar = pose({ lean: -0.22, hipY: 1, hFx: 16, hFy: -2, hBx: -14, hBy: -6, sword: -0.35, jaw: 1, head: -1, soul: 1.8, cape: 0.8, capeT: 2, cast: 0.6, fFx: 9, fBx: -10 });

  // Hieb: ausholen über die hintere Schulter, dann weiter Querschlag
  const cw1 = pose({ lean: -0.08, hipX: -1, hFx: 2, hFy: -10, grip: 1, sword: -2.3, jaw: 0.3, fFx: 8, fBx: -9, cape: 0.3 });
  const cw2 = pose({ lean: -0.2, hipX: -2, hipY: 2, hFx: -6, hFy: -14, grip: 1, sword: -2.8, jaw: 0.8, fFx: 10, fBx: -10, cape: 0.4, soul: 1.4 });
  const cl1 = pose({ lean: 0.25, hipX: 2, hipY: 3, hFx: 16, hFy: -4, grip: 1, sword: -0.5, jaw: 1, fFx: 12, fBx: -11, cape: 0.8, capeT: 1 });
  const cl2 = pose({ lean: 0.42, hipX: 4, hipY: 5, hFx: 18, hFy: 12, grip: 1, sword: 0.75, jaw: 1, fFx: 13, fBx: -12, cape: 1, capeT: 2 });
  const cl3 = pose({ lean: 0.38, hipX: 3, hipY: 5, hFx: 13, hFy: 17, grip: 1, sword: 1.25, jaw: 0.5, fFx: 13, fBx: -12, cape: 0.6, capeT: 3 });
  const cl4 = pose({ lean: 0.2, hipX: 2, hipY: 3, hFx: 11, hFy: 16, grip: 0, sword: 0.9, jaw: 0.2, fFx: 11, fBx: -11, cape: 0.3, capeT: 4 });

  // Beben: Schwert beidhändig über den Kopf, dann in den Boden
  const sw1 = pose({ lean: -0.05, hFx: 6, hFy: -12, grip: 1, sword: -1.9, jaw: 0.5, fFx: 8, fBx: -9 });
  const sw2 = pose({ lean: -0.28, hipY: -2, hFx: 2, hFy: -18, grip: 1, sword: -2.35, jaw: 1, fFx: 9, fBx: -10, fBy: 2, soul: 1.6, cape: 0.2 });
  const sl1 = pose({ lean: 0.3, hipY: 3, hFx: 16, hFy: -6, grip: 1, sword: -0.4, jaw: 1, fFx: 11, fBx: -10, cape: 0.9 });
  const sl2 = pose({ lean: 0.55, hipY: 9, hFx: 18, hFy: 12, grip: 1, sword: 1.18, jaw: 1, fFx: 12, fBx: -12, cape: 1, capeT: 1, soul: 1.5 });
  const sl3 = pose({ lean: 0.5, hipY: 8, hFx: 17, hFy: 13, grip: 1, sword: 1.2, jaw: 0.6, fFx: 12, fBx: -12, cape: 0.5, capeT: 2 });
  const sl4 = pose({ lean: 0.2, hipY: 3, hFx: 12, hFy: 10, grip: 1, sword: 1.0, jaw: 0.2, fFx: 10, fBx: -10, cape: 0.2, capeT: 3 });

  // Zauber: Klaue hoch, Seelenfeuer lodert
  const ca1 = pose({ lean: -0.1, hBx: -10, hBy: -12, cast: 0.6, jaw: 0.6, soul: 1.5, sword: 0.9, hFy: 17, cape: 0.4 });
  const ca2 = pose({ lean: -0.18, hipY: -1, hBx: -8, hBy: -22, cast: 1, jaw: 1, soul: 1.9, sword: 1.0, hFy: 17, head: -1, cape: 0.6, capeT: 2 });

  // Ansturm: Schulter voran, Schwert schleift hinterher
  const chW = pose({ lean: 0.5, hipY: 6, hFx: 2, hFy: 20, grip: 0, sword: 2.75, fFx: 12, fBx: -14, jaw: 1, cape: 0.5, soul: 1.5 });
  const runKeys = [];
  for (let i = 0; i <= 6; i++) {
    const ph = (i / 6) * Math.PI * 2, s = Math.sin(ph), c = Math.cos(ph);
    runKeys.push([i / 6, pose({
      lean: 0.55, hipX: 3, hipY: 4 - Math.abs(c) * 2,
      fFx: 6 + s * 12, fFy: Math.max(0, -c) * 5, fBx: -4 - s * 12, fBy: Math.max(0, c) * 5,
      hFx: 0, hFy: 21, sword: 2.85 + s * 0.05, hBx: 8, hBy: 8, jaw: 1, cape: 1, capeT: ph * 2, soul: 1.6,
    }), linear]);
  }

  // Benommen: gebückt, Schwert im Boden, Kopf wankt
  const stA = pose({ lean: 0.5, hipY: 7, hFx: 14, hFy: 18, grip: 0, sword: 1.45, head: 2, jaw: 1, eye: 0.3, soul: 0.5, fFx: 9, fBx: -11, hBx: -2, hBy: 22 });
  const stB = pose({ lean: 0.46, hipY: 8, hFx: 14, hFy: 18, grip: 0, sword: 1.45, head: -1, jaw: 0.6, eye: 0.6, soul: 0.6, fFx: 9, fBx: -11, hBx: -1, hBy: 22 });

  const hurtP = pose({ lean: -0.18, hipX: -2, head: -2, jaw: 0.7, hFx: 6, hFy: 12, sword: 0.9, soul: 1.8, cape: 0.5 });

  // Tod: taumeln, auf die Knie, nach vorn kippen
  const d1 = pose({ lean: -0.3, hipX: -2, jaw: 1, head: -2, sword: 1.2, hFx: 12, hFy: 16, soul: 2, cape: 0.6 });
  const d2 = pose({ kneel: 0.8, lean: 0.35, jaw: 1, head: 2, sword: 1.5, hFx: 14, hFy: 20, soul: 1.2, eye: 0.6, hBx: 2, hBy: 22 });
  const d3 = pose({ kneel: 1, lean: 0.8, hipY: 4, jaw: 1, head: 4, sword: 0.1, hFx: 22, hFy: 24, soul: 0.4, eye: 0.1, hBx: 12, hBy: 24 });

  const sweepF = (a, b) => ({ smear: [a, b] });

  return {
    idle: new Animation(track([[0, idleA], [0.5, idleB], [1, idleA]], 8, { loop: true }), 6),
    walk: new Animation(track(walkKeys, 8, { loop: true, extras: { 0: { fx: 'step' }, 4: { fx: 'step' } } }), 9),
    dormant: new Animation(track([[0, kneel], [0.5, { ...kneel, soul: 0.55, capeT: 2 }], [1, kneel]], 6, { loop: true }), 3),
    awaken: new Animation(track([
      [0, kneel], [0.35, rise], [0.55, pose({ ...roar, jaw: 0.3, soul: 1.4 })], [0.75, roar, snap], [1, roar],
    ], 12, { extras: { 7: { fx: 'roar' } } }), 7.5, false),
    roar: new Animation(track([[0, idleA], [0.3, roar, snap], [0.8, { ...roar, capeT: 5 }], [1, roar]], 8, { extras: { 2: { fx: 'roar' } } }), 7, false),
    cleaveWindup: new Animation(track([[0, idleA], [0.45, cw1], [1, cw2]], 6), 9, false),
    cleave: new Animation(track([[0, cl1], [0.2, cl2, snap], [0.45, cl3], [1, cl4]], 7, {
      extras: { 0: { ...sweepF(-2.6, -0.5), swordBehind: false }, 1: { ...sweepF(-1.4, 0.75), fx: 'impact' }, 2: sweepF(0.2, 1.1) },
    }), 16, false),
    slamWindup: new Animation(track([[0, idleA], [0.4, sw1], [1, sw2]], 7), 8, false),
    slam: new Animation(track([[0, sl1], [0.18, sl2, snap], [0.55, sl3], [1, sl4]], 8, {
      extras: { 0: sweepF(-2.4, -0.4), 1: { ...sweepF(-1.2, 1.18), fx: 'impact' } },
    }), 12, false),
    cast: new Animation(track([[0, idleA], [0.4, ca1], [1, ca2]], 6), 8, false),
    chargeWindup: new Animation(track([[0, idleA], [0.5, pose({ ...chW, lean: 0.3, hipY: 3 })], [1, chW]], 6, { extras: { 5: { fx: 'step' } } }), 7, false),
    charge: new Animation(track(runKeys, 6, { loop: true, extras: { 0: { fx: 'step' }, 3: { fx: 'step' } } }), 14),
    stagger: new Animation(track([[0, stA], [0.5, stB], [1, stA]], 6, { loop: true }), 6),
    hurt: new Animation(track([[0, hurtP], [1, idleA]], 3), 12, false),
    death: new Animation([
      ...track([[0, hurtP], [0.3, d1], [0.65, d2, snap], [1, d3]], 8, { extras: { 5: { fx: 'impact' } } }),
      collapseFrame(0), collapseFrame(0.5), collapseFrame(1),
    ], 7, false),
  };
}

// Bodenriss für den Einschlag des Bebens (wird als Dekal gestempelt).
export function createSlamCrack() {
  const S = 56, p = new PixelCanvas(S, 32);
  const c = S / 2;
  for (let i = 0; i < 9; i++) {
    let x = c, y = 16;
    const a = (i / 9) * Math.PI * 2 + hash2(i, 1, 9) * 0.5;
    const len = 10 + hash2(i, 2, 9) * 14;
    for (let s = 0; s < len; s++) {
      x += Math.cos(a + (hash2(i, s, 10) - 0.5) * 0.9);
      y += Math.sin(a + (hash2(i, s, 11) - 0.5) * 0.9) * 0.55;
      p.px(x, y, s < len * 0.5 ? '#07050b' : '#140f1a');
      if (s < len * 0.3) p.px(x + 1, y, '#07050b');
    }
  }
  p.ellipse(c, 16, 6, 3.5, '#0a070e');
  p.ellipse(c, 16, 3, 1.5, '#050308');
  return p.canvas;
}
