import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame, SpriteFrame, Animation } from '../gfx/Sprite.js';
import { hash2 } from '../core/math.js';

// Gegner der Frostzinnen: Eistroll, Frostwolf, Reifhexe, Schneepirscher und
// Gorm Eisfaust, der Eistroll-Häuptling (Elite).
//
// Aufbau wie foes_ashwood.js: kleine Rigs (Hüfte, Rumpf, Kopf, IK-Arme/-Beine
// bzw. parametrische Vierbeiner), Schlüsselposen werden beim Laden weich
// interpoliert. Jeder Frame hat eine Leucht-Ebene (frame.glow: Eis, Augen,
// Frostatem), Metadaten (frame.meta: eye/hand/mouth/head … relativ zum Anker)
// und optional eine Ereignismarke (frame.fx: 'step' | 'impact' | 'roar' | 'cast').
// Blickrichtung rechts, Anker = Bodenkontakt.
//
// Die Zone ist hell (Schnee): Körper sind in mittleren bis dunklen Tönen
// gehalten, reines Weiß nur für Glanzlichter, Fell und Eis – so bleibt die
// dunkle Kontur (outlineCanvas) auf dem Schneeboden klar lesbar.

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

// Schwung-Schleier: geschlossene Sichel von a0 nach a1 (Drehpunkt cx/cy); am
// Ende (frisch) breit und hell, zum Anfang hin dünn auslaufend. Bewusst ohne
// Rasterrauschen, damit die dunkle Kontur auf Schnee keine Krümel erzeugt.
function smearArc(p, g, cx, cy, a0, a1, r0, r1, cols, gcols, sy = 1) {
  const n = Math.ceil(Math.abs(a1 - a0) * r1 * 2) + 2;
  for (let i = 0; i <= n; i++) {
    const f = i / n, a = a0 + (a1 - a0) * f;
    const th = (r1 - r0) * (0.15 + 0.6 * f * f);
    for (let r = r1 - th; r <= r1; r += 0.5) {
      const radial = (r - (r1 - th)) / (th || 1);
      const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r * sy);
      const c = radial > 0.75 ? cols[2] : radial > 0.35 ? cols[1] : cols[0];
      p.px(x, y, c);
      if (g && gcols && f > 0.3 && radial > 0.4) g.px(x, y, radial > 0.75 ? gcols[1] : gcols[0]);
    }
  }
}

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
// extra.rot = [winkel, drehpunktX, drehpunktY] kippt die ganze Figur (Sturz),
// extra.post(p, g) zeichnet danach ungedreht (z. B. liegende Waffe, Bodeneis).
function makeFrame(W, H, AX, AY, draw, P, extra = {}) {
  const g = new PixelCanvas(W, H);
  let meta = {};
  const f = buildFrame(W, H, AX, AY, (p) => {
    if (extra.rot && Math.abs(extra.rot[0]) > 0.001) {
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

// Eis: Körperfarben (dunkel → hell) und Leucht-Ebene (kalt, türkis-weiß)
const ICE = ['#1c3e5c', '#2e6890', '#4c9ac4', '#86cde8', '#c8f0fa', '#f4feff'];
const ICE_G = ['#0e2c48', '#1e5c8c', '#3a9ad0', '#7ad4f4', '#c4f4ff', '#ffffff'];
const FROST_SMEAR = ['#6ab4d8', '#b8ecfa', '#f4feff'];
const FROST_SMEAR_G = ['#2a7ab0', '#a0e8ff'];
const MIST = ['#9ab8cc', '#c6dce8', '#eef6fa'];
const BONE = PAL.bone;
const WOOD = ['#1e140c', '#35241a', '#4e3826', '#6a4e34', '#86683f'];
const IRON = ['#12141c', '#222734', '#363d4e', '#525c72', '#7e8ba4', '#b8c4d8'];

// Kalter Atemhauch: kleine Nebelwölkchen vor dem Maul (Phase ph 0..1).
// Nur ein zarter Kern auf der Grundebene, der Rest leuchtet (lesbar auf Schnee).
function breath(p, g, x, y, ph, dir = 1, n = 3, size = 1) {
  for (let i = 0; i < n; i++) {
    const f = (ph + i / n) % 1;
    if (f > 0.8) continue;
    const bx = x + dir * (1 + f * 5 * size), by = y - f * 2.5 * size + (i - 1) * 0.5;
    const r = (0.5 + f * 1.6) * size;
    for (let yy = -r; yy <= r; yy += 1) for (let xx = -r; xx <= r; xx += 1) {
      if (xx * xx + yy * yy > r * r + 0.3) continue;
      const edge = xx * xx + yy * yy > (r - 1) * (r - 1);
      if (!edge || f < 0.3) g.px(bx + xx, by + yy, f < 0.35 ? ICE_G[2] : ICE_G[1]);
      if (f < 0.45 && !edge && hash2(i, Math.round(xx * 3 + yy), 5) < 0.5) p.px(bx + xx, by + yy, MIST[1]);
    }
  }
}

// Herabhängender Eiszapfen (spitz nach unten), mit Leuchtspitze.
function icicle(p, g, x, y, len, lit = 1) {
  for (let j = 0; j < len; j++) {
    const f = j / len;
    const c = f < 0.3 ? ICE[3] : f < 0.75 ? ICE[4] : ICE[5];
    p.px(x, y + j, c);
    if (j < len * 0.5 && len > 3) p.px(x - 1, y + j, ICE[2]);
    if (lit > 0.2 && f > 0.4) g.px(x, y + j, f > 0.8 ? ICE_G[4] : ICE_G[2]);
  }
}

// Eissplitter, die schräg aus dem Boden brechen (Einschlag).
function iceBurst(p, g, cx, gy, s, n = 5, seed = 1) {
  if (s <= 0.02) return;
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * 3.2 + (hash2(i, seed, 61) - 0.5) * 2;
    const h = (3 + hash2(i, seed, 62) * 6) * s * (1 - Math.abs(off) / (n * 2.4));
    const lean = off * 0.12;
    for (let j = 0; j < h; j++) {
      const f = j / h, w = Math.max(0, (1 - f) * 1.6);
      for (let k = -w; k <= w; k += 0.5) {
        const x = cx + off + lean * j + k, y = gy - j;
        p.px(x, y, k < -w + 0.6 ? ICE[1] : k > w - 0.6 ? ICE[4] : f > 0.7 ? ICE[5] : ICE[3]);
      }
      if (f > 0.35) g.px(cx + off + lean * j, gy - j, f > 0.75 ? ICE_G[4] : ICE_G[2]);
    }
  }
  // Schneestaub am Fuß
  for (let i = 0; i < n * 3; i++) {
    const x = cx + (hash2(i, seed, 63) - 0.5) * n * 7, y = gy - hash2(i, seed, 64) * 3 * s;
    p.px(x, y, i % 3 ? MIST[2] : MIST[1]);
  }
}

// ================================================================ Eistroll + Gorm Eisfaust

// Blaugraue Trollhaut (dunkel → hell); die Häuptlingshaut etwas kälter/heller.
const T_SKIN = ['#121a2c', '#1f2c46', '#2e4262', '#405c84', '#5a7ca4', '#80a2c4', '#a8c6de'];
const G_SKIN = ['#101628', '#1b2842', '#283c5e', '#385480', '#4e72a0', '#7496c0', '#9ebcda'];
const MANE = ['#0e1018', '#1a1e2a', '#2a303e', '#3e4656', '#586274', '#7a8698'];
const PELT = ['#3c4452', '#5e6878', '#8894a4', '#b2bcc8', '#d6dde4', '#f0f4f8'];
const LOIN = ['#1c120c', '#302016', '#463022', '#5e4430', '#7a5c40'];

const TROLL = {
  W: 100, H: 82, AX: 42, AY: 76,
  D: { legH: 15, thigh: 8, shin: 8.5, spine: 15, upper: 9.5, fore: 10.5, sh: 3.5, hipW: 3 },
  k: 1.15, skin: T_SKIN, chief: false,
};
const CHIEF = {
  W: 140, H: 108, AX: 60, AY: 102,
  D: { legH: 21, thigh: 11.5, shin: 12, spine: 21, upper: 13, fore: 14, sh: 5, hipW: 4.5 },
  k: 1.6, skin: G_SKIN, chief: true,
};

const TR_REST = {
  hipX: 0, hipY: 0, lean: 0.42, head: 0, headY: 0, fFx: 6, fFy: 0, fBx: -6, fBy: 0,
  hFx: 9, hFy: 15, hBx: 5, hBy: 15, ca: 0.55, jaw: 0, eye: 1, frost: 1, capeT: 0, sway: 0,
  br: 0, kneel: 0, hBopen: 0, fist: 1,
};
const trpose = (o = {}) => ({ ...TR_REST, ...o });

// Trollkeule: knorriger Baumstamm, Eisenring, Knochendornen, Eiskruste am Kopf.
function drawClub(p, g, hx, hy, a, frost) {
  const dx = Math.cos(a), dy = Math.sin(a);
  let nx = -dy, ny = dx; if (nx + ny > 0) { nx = -nx; ny = -ny; }
  const L = 21;
  // Stamm (wird zum Kopf dicker)
  for (let s = -4; s <= L; s += 0.5) {
    const f = Math.max(0, s) / L;
    const hw = 1.2 + f * f * 2.6 + (s > L - 5 ? 0.6 : 0);
    for (let k = -hw; k <= hw; k += 0.5) {
      let c = k > hw - 0.7 ? WOOD[4] : k < -hw + 0.7 ? WOOD[1] : k > 0 ? WOOD[3] : WOOD[2];
      if (hash2(Math.round(s * 2), Math.round(k * 2), 91) < 0.1) c = WOOD[1];
      p.px(hx + dx * s + nx * k, hy + dy * s + ny * k, c);
    }
  }
  // Astknoten
  p.px(hx + dx * 9 + nx * 1.5, hy + dy * 9 + ny * 1.5, WOOD[0]);
  p.px(hx + dx * 13 - nx * 2, hy + dy * 13 - ny * 2, WOOD[1]);
  // Eisenring
  for (let k = -2.4; k <= 2.4; k += 0.5) {
    p.px(hx + dx * 11 + nx * k, hy + dy * 11 + ny * k, k > 1 ? IRON[5] : IRON[3]);
    p.px(hx + dx * 11.5 + nx * k, hy + dy * 11.5 + ny * k, IRON[2]);
  }
  // Knochendornen seitlich
  for (const [s, side] of [[15, 1], [18, -1], [20, 1]]) {
    const bx = hx + dx * s + nx * 3 * side, by = hy + dy * s + ny * 3 * side;
    p.px(bx, by, BONE[3]); p.px(bx + nx * side, by + ny * side, BONE[4]);
  }
  // Eiskruste am Kopf, mit Leuchtkanten
  for (let s = L - 5; s <= L + 1.5; s += 0.5) {
    const hw = 3.6 - Math.max(0, s - L) * 1.6;
    for (let k = -hw; k <= hw; k += 0.5) {
      if (hash2(Math.round(s * 2), Math.round(k * 2), 93) < 0.35 && Math.abs(k) < hw - 0.8) continue;
      const x = hx + dx * s + nx * k, y = hy + dy * s + ny * k;
      p.px(x, y, k > hw - 0.8 ? ICE[5] : k > 0 ? ICE[3] : ICE[2]);
      if (frost > 0.3 && (k > hw - 1 || s > L)) g.px(x, y, ICE_G[3]);
    }
  }
  // Eisdornen, die aus dem Kopf ragen
  for (const [s, side, len] of [[L - 2, 1, 4], [L, -1, 3], [L + 1, 0, 3]]) {
    const ex = side === 0 ? dx : nx * side, ey = side === 0 ? dy : ny * side;
    const bx = hx + dx * s + nx * 2.5 * side, by = hy + dy * s + ny * 2.5 * side;
    for (let j = 0; j < len; j++) {
      p.px(bx + ex * j, by + ey * j, j === len - 1 ? ICE[5] : ICE[4]);
      if (frost > 0.3) g.px(bx + ex * j, by + ey * j, j === len - 1 ? ICE_G[5] : ICE_G[3]);
    }
  }
  return { x: hx + dx * (L + 2), y: hy + dy * (L + 2) };
}

// Gorms Eisfaust: die Faust steckt in einem kantigen, leuchtenden Eisblock.
function drawIceFist(p, g, x, y, a, frost, k = 1) {
  const r = 6.5 * k;
  const dx = Math.cos(a), dy = Math.sin(a);
  // kantiger Block (Achteck), dunkle Innenseite, helle Facetten
  for (let yy = -r; yy <= r; yy += 0.5) for (let xx = -r; xx <= r; xx += 0.5) {
    const d = Math.abs(xx) + Math.abs(yy) * 0.9;
    if (d > r * 1.25 || Math.abs(xx) > r || Math.abs(yy) > r * 0.92) continue;
    const lx = xx * 0.7 - yy * 0.7;          // Lichtachse (oben links hell)
    let c = lx < -r * 0.45 ? ICE[4] : lx < 0 ? ICE[3] : lx < r * 0.45 ? ICE[2] : ICE[1];
    if (d > r * 1.1 || Math.abs(xx) > r - 0.6) c = lx < 0 ? ICE[3] : ICE[1];
    p.px(x + xx, y + yy, c);
  }
  // eingeschlossene Faust (dunkel durchscheinend)
  p.ellipse(x - dx, y - dy, 2.6 * k, 2.2 * k, G_SKIN[2]);
  p.px(x - dx - 1, y - dy - 1, G_SKIN[4]);
  // Facettenlinien + Risse (leuchtend)
  const cracks = [[-0.8, -0.2, 0.3, 0.6], [0.2, -0.9, 0.7, -0.1], [-0.5, 0.5, 0.4, 0.9]];
  for (const [x0, y0, x1, y1] of cracks) {
    p.line(x + x0 * r, y + y0 * r, x + x1 * r, y + y1 * r, ICE[5]);
    if (frost > 0.3) g.line(x + x0 * r, y + y0 * r, x + x1 * r, y + y1 * r, frost > 0.9 ? ICE_G[4] : ICE_G[2]);
  }
  // Eisdornen auf den Knöcheln (in Schlagrichtung)
  let nx = -dy, ny = dx;
  for (let i = -1; i <= 1; i++) {
    const bx = x + dx * r * 0.8 + nx * i * r * 0.55, by = y + dy * r * 0.8 + ny * i * r * 0.55;
    const len = (i === 0 ? 4 : 3) * k;
    for (let j = 0; j < len; j++) {
      p.px(bx + dx * j, by + dy * j, j > len - 2 ? ICE[5] : ICE[4]);
      if (frost > 0.3) g.px(bx + dx * j, by + dy * j, j > len - 2 ? ICE_G[5] : ICE_G[3]);
    }
  }
  if (frost > 0.3) { g.px(x - r * 0.5, y - r * 0.5, ICE_G[4]); g.px(x - r * 0.4, y - r * 0.6, ICE_G[3]); }
  return { x: x + dx * r * 1.5, y: y + dy * r * 1.5 };
}

// Klauenhand (offen oder zur Faust geballt).
function trollHand(p, x, y, S, k, open, dir = 1) {
  p.ellipse(x, y, 2.2 * k, 2 * k, S[3]);
  p.px(x - 1, y - 1, S[5]);
  const n = 3;
  for (let i = 0; i < n; i++) {
    const fx = x + (i - 1) * 1.3 * k, fy = y + 1.5 * k;
    if (open > 0.5) { p.line(fx, fy, fx + dir * 0.5, fy + 2.2 * k, S[2]); p.px(fx + dir * 0.5, fy + 2.5 * k, BONE[3]); }
    else p.px(fx, fy, S[2]);
  }
}

function drawTroll(p, g, P, X, T) {
  const { D, k, skin: S, chief } = T;
  const AX = T.AX, AY = T.AY;
  const K = P.kneel;
  const PP = { ...P, hipY: P.hipY + K * D.legH * 0.45 };
  const R = rig(PP, D, AX, AY);
  const { hip, chest, pt, legF, legB, shF, shB, armF, armB } = R;
  const meta = {};
  if (K > 0.01) { // vorderes Knie am Boden (Tod/Erschöpfung)
    const kx = hip.x + 4 * k, ky = AY - 1;
    legF.jx += (kx - legF.jx) * K; legF.jy += (ky - legF.jy) * K;
    legF.ex += (kx - 6 * k - legF.ex) * K; legF.ey += (AY - legF.ey) * K;
  }
  const fr = P.frost;
  const R4 = (a, b, c, d) => [S[a], S[b], S[c], S[d]];

  // --- 0. Keule hinter dem Körper (auf der Schulter / weit ausgeholt)
  let clubTip = null;
  const club = () => {
    if (chief) return;
    if (X.smear) smearArc(p, g, shF.x, shF.y, X.smear[0], X.smear[1], 12, 30, FROST_SMEAR, FROST_SMEAR_G, X.smear[2] ?? 1);
    clubTip = drawClub(p, g, armF.ex, armF.ey, P.ca, fr);
  };
  const clubFront = X.clubFront ?? (P.ca > -1.3);
  if (!chief && !clubFront && !X.noClub) club();

  // --- 1. hinterer Arm (lang, bis fast zum Boden)
  limb(p, shB.x, shB.y, armB.jx, armB.jy, 5 * k, 4.5 * k, R4(0, 0, 1, 2));
  limb(p, armB.jx, armB.jy, armB.ex, armB.ey, 4.5 * k, 4 * k, R4(0, 1, 1, 2));
  trollHand(p, armB.ex, armB.ey, [S[0], S[0], S[1], S[2], S[2], S[3]], k, P.hBopen);
  if (chief && X.slamFists) { // zweite Eisfaust-Wucht: auch die hintere Hand schlägt
    p.ellipse(armB.ex, armB.ey, 3 * k, 2.6 * k, S[2]);
  }

  // --- 2. hinteres Bein
  limb(p, hip.x - D.hipW, hip.y, legB.jx, legB.jy, 6.5 * k, 5.5 * k, R4(0, 0, 1, 2));
  limb(p, legB.jx, legB.jy, legB.ex, legB.ey - 1.5 * k, 5.5 * k, 5 * k, R4(0, 0, 1, 2));
  p.ellipse(legB.ex + 1.5 * k, legB.ey - 1.2 * k, 3.5 * k, 1.6 * k, S[1]);
  for (let i = 0; i < 3; i++) p.px(legB.ex + (2.5 + i * 1.4) * k, legB.ey - 0.5, BONE[1]);

  // --- 3. Lendenschurz / Fellschurz hinten
  for (let i = 0; i < 4; i++) {
    const a = pt(-0.5 * k, (-5 + i * 1.6) * k);
    const sw = Math.sin(P.capeT + i) * 0.7;
    p.rect(a.x - 1 + sw, a.y, 2.2 * k, (5 + (i % 2)) * k, LOIN[i % 2 ? 1 : 2]);
  }

  // --- 4. Rumpf: gewaltiger Brustkorb, Bauch, Buckel
  const belly = pt(4.5 * k, 2.5 * k), chestC = pt(D.spine - 3 * k, 0.5 * k), hump = pt(D.spine - 1 * k, -3.5 * k);
  p.ellipse(belly.x, belly.y, 8 * k, 7 * k, S[2]);
  p.ellipse(chestC.x, chestC.y, 9.5 * k, 7.5 * k, S[2]);
  p.ellipse(hump.x, hump.y, 8 * k, 6 * k, S[2]);
  // Licht von oben links (Rücken, Schulter)
  p.ellipse(hump.x - 1 * k, hump.y - 2 * k, 6 * k, 3 * k, S[3]);
  p.ellipse(chestC.x + 1.5 * k, chestC.y - 1 * k, 5.5 * k, 3.5 * k, S[3]);
  p.ellipse(chestC.x + 2.5 * k, chestC.y - 1.5 * k, 3 * k, 2 * k, S[4]);
  // Brustmuskeln / Bauchfalten
  const q = (u, kk, c) => { const o = pt(u * k, kk * k); p.px(o.x, o.y, c); };
  for (let u = 3; u <= 7; u += 1) q(u, 6.8 - (u - 3) * 0.2, S[1]);
  q(6, 4, S[4]); q(7, 5, S[4]); q(4, 5.5, S[3]); q(2, 5, S[3]); q(9.5, 5, S[1]); q(10, 3.5, S[1]);
  // Bauch (heller, etwas grünlich-blau)
  p.ellipse(belly.x + 3 * k, belly.y + 1 * k, 4 * k, 4.5 * k, S[3]);
  p.ellipse(belly.x + 3.5 * k, belly.y + 0.5 * k, 2.2 * k, 3 * k, S[4]);
  // Warzen / Reifflecken auf der Haut
  for (let i = 0; i < 10 * k; i++) {
    const u = hash2(i, 1, chief ? 77 : 71) * D.spine, kk = (hash2(i, 2, 71) - 0.5) * 12 * k;
    const o = pt(u, kk);
    p.px(o.x, o.y, hash2(i, 3, 71) < 0.5 ? S[1] : S[5]);
  }
  // Gürtel mit Fellschurz vorn
  for (let kk = -6 * k; kk <= 7 * k; kk += 0.5) { const o = pt(0.8 * k, kk); p.px(o.x, o.y, LOIN[1]); const o2 = pt(1.5 * k, kk); p.px(o2.x, o2.y, LOIN[3]); }
  for (let i = 0; i < 3; i++) {
    const a = pt(0.5 * k, (1 + i * 2.2) * k);
    const sw = Math.sin(P.capeT + i * 1.3) * 0.6;
    p.rect(a.x + sw, a.y, 2.4 * k, (6 - i) * k, LOIN[i % 2 ? 3 : 2]);
    p.px(a.x + sw, a.y, LOIN[4]);
  }
  if (chief) { // Gürtelschädel
    const bk = pt(1.2 * k, 4 * k);
    p.ellipse(bk.x, bk.y, 2.2, 2.4, BONE[3]); p.px(bk.x - 1, bk.y - 1, BONE[4]);
    p.px(bk.x - 1, bk.y, '#1a0e10'); p.px(bk.x + 1, bk.y, '#1a0e10'); p.px(bk.x, bk.y + 2, BONE[1]);
    const bk2 = pt(1.2 * k, -3 * k);
    p.ellipse(bk2.x, bk2.y, 1.6, 1.8, BONE[2]); p.px(bk2.x, bk2.y, '#1a0e10');
  }

  // --- 5. Mähne / Eisbärenfell über Buckel und Rücken, Eiszapfen
  const maneTop = pt(D.spine + 1 * k, -1 * k);
  const MN = chief ? PELT : MANE;
  const strands = chief ? 16 : 11;
  for (let i = 0; i < strands; i++) {
    const u = i / (strands - 1);
    const base = pt(D.spine + (1 - u * 9) * k, (-1.5 - u * 3.8) * k);
    const len = (4 + hash2(i, 4, chief ? 13 : 11) * 4 + u * 3) * k;
    for (let j = 0; j < len; j++) {
      const v = j / len;
      const x = base.x - v * (2 + P.sway) * k * 0.8 + Math.sin(P.capeT + v * 2 + i) * 0.5 * v;
      const y = base.y + j * 0.9;
      const c = v < 0.25 ? MN[4] : (i + j) % 4 === 0 ? MN[1] : v < 0.6 ? MN[3] : MN[2];
      p.px(x, y, c); p.px(x - 1, y, chief ? MN[2] : MN[1]);
    }
  }
  // Mähnenkamm oben (hell, Schnee darauf)
  for (let i = 0; i < 9; i++) {
    const o = pt(D.spine + (1.5 - i * 1.1) * k, (-4.5 - Math.sin(i / 8 * Math.PI) * 1.2) * k);
    p.px(o.x, o.y, i % 3 === 1 ? '#f4f8fc' : MN[5 - (chief ? 0 : 1)]);
    p.px(o.x, o.y + 1, MN[3]);
  }
  if (chief) { // Bärenkopf-Kapuze über der Schulter
    const bh = pt(D.spine + 1 * k, -5.5 * k);
    p.ellipse(bh.x, bh.y, 5, 3.5, PELT[3]); p.ellipse(bh.x - 1, bh.y - 1, 3.5, 2, PELT[4]);
    p.px(bh.x - 4, bh.y - 3, PELT[2]); p.px(bh.x - 4, bh.y - 4, PELT[3]); // Ohr
    p.px(bh.x + 1, bh.y + 1, '#101218'); p.px(bh.x + 4, bh.y + 1, PELT[1]);
    for (let i = 0; i < 4; i++) p.px(bh.x + 1 + i, bh.y + 3, i % 2 ? BONE[4] : BONE[3]); // Bärenzähne
  }
  // Eiszapfen, die vom Mähnensaum herabhängen
  const icN = chief ? 6 : 4;
  for (let i = 0; i < icN; i++) {
    const o = pt(D.spine + (-1 - i * 1.7) * k, (-3.2 - i * 0.6) * k);
    icicle(p, g, o.x, o.y + 3 * k, Math.round((2 + hash2(i, 5, 17) * 3) * k), fr);
  }
  // Eisgeschwüre / Eiskristalle auf dem Rücken
  const crystals = chief ? [[D.spine - 2 * k, -6 * k, 5], [D.spine - 6 * k, -6.5 * k, 6], [D.spine - 10 * k, -5 * k, 4], [D.spine + 1 * k, -6 * k, 3]] : [[D.spine - 3, -6, 3], [D.spine - 6.5, -5.5, 4], [D.spine - 9.5, -4.5, 2]];
  for (const [u, kk, h] of crystals) {
    const o = pt(u, kk);
    for (let j = 0; j < h; j++) {
      const x = o.x - j * 0.35 - P.lean * j * 0.6, y = o.y - j;
      p.px(x, y, j === h - 1 ? ICE[5] : ICE[3]); p.px(x - 1, y + 0.5, ICE[1]);
      if (j < h - 1) p.px(x + 1, y, ICE[4]);
      if (fr > 0.3) g.px(x, y, j === h - 1 ? ICE_G[5] : ICE_G[3]);
    }
  }

  // --- 6. vorderes Bein (dicke Säule, Fußklauen)
  limb(p, hip.x + D.hipW, hip.y, legF.jx, legF.jy, 7 * k, 6 * k, R4(1, 2, 3, 4));
  limb(p, legF.jx, legF.jy, legF.ex, legF.ey - 1.5 * k, 6 * k, 5.5 * k, R4(1, 2, 3, 4));
  p.px(legF.jx - 1, legF.jy - 1, S[5]); p.px(legF.jx, legF.jy - 1, S[5]);
  p.ellipse(legF.ex + 1.5 * k, legF.ey - 1.2 * k, 3.8 * k, 1.7 * k, S[2]);
  p.px(legF.ex, legF.ey - 2 * k, S[4]);
  for (let i = 0; i < 3; i++) { p.px(legF.ex + (3 + i * 1.4) * k, legF.ey - 1, BONE[3]); p.px(legF.ex + (3.5 + i * 1.4) * k, legF.ey - 1, BONE[2]); }
  // Reif an den Waden
  p.px(legF.jx + 1, legF.jy + 2, '#e8f2f8'); p.px(legF.jx + 2, legF.jy + 4, ICE[4]);

  // --- 7. Kopf: tief und vorgereckt, schwere Stirn, Knollennase, Hauer
  const neck = pt(D.spine - 1 * k, 4.5 * k);
  const hx = Math.round(neck.x + (4.5 + P.head) * k), hy = Math.round(neck.y + (0.5 + P.headY) * k);
  const jaw = Math.round(P.jaw * 2.5 * k);
  // Nackenschatten trennt Kopf und Schulterbuckel
  p.ellipse(hx - 4 * k, hy + 0.5 * k, 3.5 * k, 4 * k, S[1]);
  // Unterkiefer (breit, vorstehend – Unterbiss)
  p.ellipse(hx + 1.5 * k, hy + 2.8 * k + jaw, 4.6 * k, 2.4 * k, S[2]);
  p.ellipse(hx + 2 * k, hy + 2.2 * k + jaw, 3.2 * k, 1.3 * k, S[3]);
  p.line(hx - 1 * k, hy + 4.6 * k + jaw, hx + 4 * k, hy + 4.6 * k + jaw, S[1]);
  if (jaw > 0) { // Maulhöhle
    p.rect(hx - 1 * k, hy + 1.2 * k, 5.5 * k, jaw + 1, '#0a0c14');
    p.rect(hx, hy + 1.2 * k + jaw, 4 * k, 1, '#4a2434');
  }
  // Schädel (flach, breit), Licht von oben links
  p.ellipse(hx, hy - 1 * k, 5 * k, 3.8 * k, S[3]);
  p.ellipse(hx - 1 * k, hy - 2.2 * k, 3.6 * k, 2.2 * k, S[4]);
  p.px(hx - 2.5 * k, hy - 3.8 * k, S[6]); p.px(hx - 1.5 * k, hy - 4.2 * k, S[5]);
  // Haarschopf, der in die Mähne übergeht
  for (let i = 0; i < 5; i++) {
    const bx = hx - 3 * k + i * 1.2 * k, by = hy - 4 * k + Math.abs(i - 1.5) * 0.4;
    p.line(bx, by, bx - 3 - P.sway, by + 1 + i * 0.3, i % 2 ? MANE[2] : MANE[3]);
  }
  // spitzes Ohr nach hinten oben
  p.line(hx - 3.5 * k, hy - 0.5 * k, hx - 7 * k, hy - 3.5 * k, S[4]); p.line(hx - 3.5 * k, hy + 0.5 * k, hx - 6.5 * k, hy - 2.5 * k, S[2]);
  p.px(hx - 7 * k, hy - 3.5 * k, S[5]);
  // Stirnwulst: heller Grat, tiefer Schatten darunter
  p.rect(hx - 0.5 * k, hy - 2 * k, 5.5 * k, 1, S[5]);
  p.rect(hx - 0.5 * k, hy - 1 * k, 5.5 * k, 1.4 * k, S[0]);
  // Augen tief im Schatten, eisblau glühend
  const ex = hx + Math.round(3 * k), ey = hy - Math.round(0.4 * k);
  const eyeOn = P.eye > 0.3;
  p.px(ex, ey, eyeOn ? ICE[5] : S[1]); p.px(ex - Math.round(2.2 * k), ey, eyeOn ? ICE[3] : S[1]);
  if (chief) p.px(ex - 1, ey, eyeOn ? ICE[4] : S[1]);
  if (eyeOn) { g.px(ex, ey, ICE_G[5]); g.px(ex + 1, ey, ICE_G[3]); g.px(ex - Math.round(2.2 * k), ey, ICE_G[3]); g.px(ex, ey - 1, ICE_G[1]); g.px(ex - 1, ey, ICE_G[2]); }
  meta.eye = { x: ex, y: ey };
  // Knollennase, ragt über den Kiefer
  p.ellipse(hx + 5.2 * k, hy + 0.6 * k, 1.8 * k, 1.5 * k, S[4]);
  p.px(hx + 5 * k, hy - 0.2 * k, S[5]); p.px(hx + 6 * k, hy + 1.5 * k, S[1]); p.px(hx + 4.5 * k, hy + 1.6 * k, S[1]);
  // Hauer aus dem Unterkiefer (ragen vor der Oberlippe hoch)
  const tusk = (tx, big) => {
    const ty = hy + 2.2 * k + jaw;
    const h = big ? (chief ? 5 : 3) : 2;
    for (let j = 0; j < h; j++) p.px(tx + (j > 1 ? 0.6 : 0), ty - j, j === h - 1 ? '#fffbef' : j === 0 ? BONE[2] : BONE[4]);
  };
  tusk(hx + 4 * k, true); tusk(hx + 1 * k, false);
  // Frostbart am Kinn mit kleinen Eiszapfen
  for (let i = 0; i < (chief ? 5 : 3); i++) {
    const bx = hx + (-0.5 + i * 1.5) * k, by = hy + 5 * k + jaw;
    p.px(bx, by, MN[3]); p.px(bx, by + 1, MN[2]);
    if (i === (chief ? 2 : 0)) icicle(p, g, bx, by + 2, 2, fr);
  }
  meta.mouth = { x: hx + 5 * k, y: hy + 2 * k + jaw * 0.5 };
  meta.head = { x: hx, y: hy - 6 * k };

  // Knochenkrone des Häuptlings
  if (chief) {
    const cy = hy - 4 * k;
    for (let i = -3; i <= 3; i++) { p.px(hx + i * 1.6, cy + 1 + Math.abs(i) * 0.3, BONE[1]); p.px(hx + i * 1.6 + 0.8, cy + 1 + Math.abs(i) * 0.3, BONE[2]); }
    const spikes = [[-5, 4, -0.5], [-2.5, 6, -0.2], [0, 8, 0], [2.5, 6, 0.25], [5, 4, 0.55]];
    for (const [ox, h, l] of spikes) {
      for (let j = 0; j < h; j++) {
        const x = hx + ox + l * j, y = cy - j + Math.abs(ox) * 0.3;
        p.px(x, y, j > h - 2 ? '#fffbef' : j > h * 0.5 ? BONE[4] : BONE[3]);
        if (j < h - 2) p.px(x - 1, y, BONE[1]);
      }
    }
    // Eisjuwel in der Mitte
    p.rect(hx - 0.5, cy - 1, 2, 2, ICE[4]); p.px(hx - 0.5, cy - 1, ICE[5]);
    if (fr > 0.3) { g.rect(hx - 0.5, cy - 1, 2, 2, ICE_G[4]); g.px(hx - 1.5, cy - 0.5, ICE_G[2]); g.px(hx + 1.5, cy - 0.5, ICE_G[2]); }
    meta.head = { x: hx, y: cy - 8 };
  }

  // Frostatem vor dem Maul
  if (P.br >= 0) breath(p, g, meta.mouth.x + 1, meta.mouth.y, P.br, 1, X.bigBreath ? 6 : 3, (X.bigBreath ? 1.8 : 1) * (chief ? 1.3 : 1));

  // --- 8. vorderer Arm (+ Keule bzw. Eisfaust)
  if (!chief && clubFront && !X.noClub) {
    limb(p, shF.x, shF.y, armF.jx, armF.jy, 5.5 * k, 5 * k, R4(2, 3, 5, 6));
    club();
  }
  limb(p, shF.x, shF.y, armF.jx, armF.jy, 5.5 * k, 5 * k, R4(2, 3, 5, 6));
  p.px(shF.x - 1, shF.y - 2, S[6]); p.px(shF.x, shF.y - 2, S[5]);
  limb(p, armF.jx, armF.jy, armF.ex, armF.ey, 5 * k, 4.8 * k, R4(1, 3, 4, 5));
  // Eisschulterpanzer (Eis-Verkrustung auf der Schulter)
  const sp = { x: shF.x - 0.5, y: shF.y - 1 * k };
  p.ellipse(sp.x, sp.y, 3.2 * k, 2.4 * k, ICE[2]); p.ellipse(sp.x - 0.8, sp.y - 0.8, 2.2 * k, 1.4 * k, ICE[3]);
  p.px(sp.x - 2 * k, sp.y - 1.5 * k, ICE[5]);
  for (let i = 0; i < (chief ? 3 : 2); i++) {
    const bx = sp.x - 1.5 * k + i * 2.2 * k, by = sp.y - 2 * k;
    for (let j = 0; j < 3 * k; j++) { p.px(bx - j * 0.4, by - j, j > 3 * k - 2 ? ICE[5] : ICE[4]); if (fr > 0.3) g.px(bx - j * 0.4, by - j, ICE_G[3]); }
  }
  icicle(p, g, sp.x + 1, sp.y + 2 * k, Math.round(3 * k), fr);
  if (fr > 0.3) g.px(sp.x - 2 * k, sp.y - 1.5 * k, ICE_G[4]);
  // Lederwicklung am Unterarm
  for (const t of [0.5, 0.65]) {
    const bw = { x: armF.jx + (armF.ex - armF.jx) * t, y: armF.jy + (armF.ey - armF.jy) * t };
    p.ellipse(bw.x, bw.y, 2.3 * k, 1 * k, LOIN[2]); p.px(bw.x - 1, bw.y - 1, LOIN[4]);
  }

  if (chief) {
    if (X.smear) smearArc(p, g, shF.x, shF.y, X.smear[0], X.smear[1], 14, 31, FROST_SMEAR, FROST_SMEAR_G, X.smear[2] ?? 1);
    const fa = Math.atan2(armF.ey - armF.jy, armF.ex - armF.jx);
    const fp = { x: armF.ex + Math.cos(fa) * 3, y: armF.ey + Math.sin(fa) * 3 };
    meta.fist = drawIceFist(p, g, fp.x, fp.y, fa, fr, 1.05);
    meta.hand = fp;
    meta.tip = meta.fist;
  } else {
    if (!X.noClub) {
      // Faust um den Stiel
      p.ellipse(armF.ex, armF.ey, 2.4 * k, 2.2 * k, S[4]); p.px(armF.ex - 1, armF.ey - 1, S[6]);
      p.px(armF.ex + 1, armF.ey + 1, S[2]);
    } else trollHand(p, armF.ex, armF.ey, S, k, 1);
    meta.hand = { x: armF.ex, y: armF.ey };
    if (clubTip) meta.tip = clubTip;
  }
  return meta;
}

// Eistroll: Keule auf der Schulter; Angriff = Überkopf-Schmettern (slam).
function iceTrollAnims() {
  const T = TROLL;
  const mk = (P, X) => makeFrame(T.W, T.H, T.AX, T.AY, (p, g, PP, XX) => drawTroll(p, g, PP, XX, T), P, X);
  const idleA = trpose({ br: 0 });
  const idleB = trpose({ hipY: 1, lean: 0.46, hFy: 15.5, hFx: 9.5, hBy: 16, hBx: 5.5, capeT: Math.PI, headY: 0.5, ca: 0.6, sway: 0.5 });
  const idle = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 6, kk = (1 - Math.cos(t * TAU)) / 2;
    idle.push(mk({ ...mixP(idleA, idleB, kk), br: t, frost: i % 3 === 0 ? 1.2 : 1 }));
  }
  const walk = [];
  for (let i = 0; i < 8; i++) {
    const ph = (i / 8) * TAU, sn = Math.sin(ph), c = Math.cos(ph);
    walk.push(mk(trpose({
      hipY: -Math.abs(c) * 1.5 + 1, hipX: sn * 0.5, lean: 0.46 + Math.abs(sn) * 0.03, fFx: 1 + sn * 6.5, fFy: Math.max(0, -c) * 3,
      fBx: -1 - sn * 6.5, fBy: Math.max(0, c) * 3, hBx: 5 - sn * 4, hBy: 14 + Math.abs(sn), hFx: 9 + sn * 1.5, hFy: 14.5 + Math.abs(c) * 0.8,
      ca: 0.5 + sn * 0.1, capeT: ph, sway: 0.6 + c * 0.4, head: sn * 0.4, br: i / 8,
    }), { fx: i === 0 || i === 4 ? 'step' : null }));
  }
  // Ausholen: Keule weit über/hinter den Kopf, Oberkörper richtet sich auf
  const w1 = trpose({ lean: 0.28, hipX: -1, hFx: -1, hFy: -8, ca: -2.0, hBx: 9, hBy: 8, fFx: 8, fBx: -7, jaw: 0.4, sway: 0.4, br: -1 });
  const w2 = trpose({ lean: 0.1, hipX: -2, hipY: 1, hFx: -3, hFy: -13, ca: -2.55, hBx: 10, hBy: 5, fFx: 9, fBx: -8, jaw: 1, sway: 0, capeT: 1, frost: 1.3, br: -1, headY: -1 });
  const windup = track(mk, [[0, idleA], [0.45, w1], [1, w2]], 5, { all: {} });
  // Schmettern: Keule fährt vor dem Körper in den Boden
  const s1 = trpose({ lean: 0.4, hipX: 1, hipY: 1, hFx: 6, hFy: -10, ca: -0.9, hBx: 4, hBy: 12, fFx: 10, fBx: -8, jaw: 1, sway: 0.8, capeT: 2, br: -1 });
  const s2 = trpose({ lean: 0.6, hipX: 3, hipY: 3, hFx: 13, hFy: 6, ca: 0.72, hBx: 2, hBy: 14, fFx: 11, fBx: -9, jaw: 1, sway: 1.2, capeT: 3, frost: 1.4, br: -1, headY: 1 });
  const s3 = trpose({ ...s2, lean: 0.62, hipY: 3.5, hFy: 6.5, ca: 0.75, capeT: 4, jaw: 0.6 });
  const s4 = trpose({ lean: 0.55, hipX: 2, hipY: 2, hFx: 9, hFy: 5, ca: 0.4, hBx: 5, hBy: 13, fFx: 9, fBx: -8, capeT: 5, sway: 0.6, br: 0.2 });
  const s5 = trpose({ lean: 0.48, hipX: 1, hipY: 1, hFx: 9, hFy: 12, ca: 0.2, hBx: 6, hBy: 13, fFx: 7, fBx: -7, capeT: 6, br: 0.5 });
  const burst = (s) => (p, g) => { iceBurst(p, g, T.AX + 40, T.AY - 1, s, 5, 3); return {}; };
  const strike = [
    mk(s1, { clubFront: true, smear: [-2.2, -0.9, 1] }),
    mk(s2, { clubFront: true, smear: [-1.1, 0.72, 1], fx: 'impact', post: burst(0.8) }),
    mk(s3, { clubFront: true, post: burst(1) }),
    mk(s4, { clubFront: true, post: burst(0.5) }),
    mk(s5, {}),
  ];
  const hurtP = trpose({ lean: 0.2, hipX: -2, head: -1.5, headY: -1, jaw: 0.8, hFx: 6, hFy: 13, ca: 0.9, hBx: 3, hBy: 10, eye: 1, sway: -0.5, br: -1 });
  const hurt = [mk(hurtP), mk(mixP(hurtP, idleA, 0.5))];
  // Tod: taumelt, sackt auf ein Knie, kippt vornüber; die Keule fällt
  const d1 = trpose({ lean: 0.15, hipX: -2, head: -2, headY: -1, jaw: 1, hFx: 5, hFy: 14, ca: 1.1, hBx: 3, hBy: 10, br: -1 });
  const d2 = trpose({ kneel: 1, lean: 0.6, jaw: 1, headY: 2, hFx: 10, hFy: 10, hBx: 8, hBy: 12, ca: 1.2, frost: 0.8, eye: 0.6, br: -1 });
  const d3 = trpose({ kneel: 1, lean: 0.85, jaw: 0.5, headY: 3, hFx: 12, hFy: 14, hBx: 10, hBy: 14, ca: 1.3, frost: 0.5, eye: 0.3, br: -1 });
  const lyingClub = (fr) => (p, g) => { drawClub(p, g, T.AX + 14, T.AY - 3, -0.08, fr); return {}; };
  const flat = trpose({ lean: 0.05, headY: 1, hFx: 6, hFy: 12, hBx: 2, hBy: 12, fFx: 3, fBx: -2, frost: 0, eye: 0, jaw: 0.4, br: -1 });
  const piv = [T.AX + 4, T.AY - 1];
  const death = [
    mk(hurtP), mk(d1), mk(d2, { fx: 'impact' }), mk(d3),
    mk(d3, { noClub: true, rot: [0.55, ...piv], post: lyingClub(0.6) }),
    mk(flat, { noClub: true, rot: [1.15, ...piv], post: lyingClub(0.4) }),
    mk(flat, { noClub: true, rot: [Math.PI / 2, T.AX - 2, T.AY - 1], post: lyingClub(0.2), fx: 'impact' }),
    mk(flat, { noClub: true, rot: [Math.PI / 2, T.AX - 2, T.AY - 1], post: lyingClub(0) }),
  ];
  return {
    idle: new Animation(idle, 5),
    walk: new Animation(walk, 8),
    windup: new Animation(windup, 6, false),
    strike: new Animation(strike, 12, false),
    hurt: new Animation(hurt, 9, false),
    death: new Animation(death, 8, false),
  };
}

// Gorm Eisfaust: Eisfaust statt Keule, Knochenkrone, Bärenfell.
// Angriff = Faustschmettern (slam), Spezial: slam (beidhändig, Eisdornen) und charge.
function chiefAnims() {
  const T = CHIEF;
  // Posen sind im Maß des Eistrolls geschrieben und werden hier hochskaliert.
  const SCL = ['hipX', 'hipY', 'fFx', 'fFy', 'fBx', 'fBy', 'hFx', 'hFy', 'hBx', 'hBy'];
  const up = (P) => { const o = { ...P }; for (const k of SCL) o[k] *= 1.2; return o; };
  const mk = (P, X) => makeFrame(T.W, T.H, T.AX, T.AY, (p, g, PP, XX) => drawTroll(p, g, PP, XX, T), up(P), X);
  const TT = (keys, n, o) => track(mk, keys, n, o);
  const base = { hFx: 11, hFy: 23, hBx: 6, hBy: 22, fFx: 9, fBx: -9 };
  const idleA = trpose({ ...base, br: 0 });
  const idleB = trpose({ ...base, hipY: 1.5, lean: 0.47, hFy: base.hFy + 1, hBy: base.hBy + 1, hBx: base.hBx + 0.5, capeT: Math.PI, headY: 0.4, sway: 0.5, frost: 1.3 });
  const idle = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 6, kk = (1 - Math.cos(t * TAU)) / 2;
    idle.push(mk({ ...mixP(idleA, idleB, kk), br: t }));
  }
  const walk = [];
  for (let i = 0; i < 8; i++) {
    const ph = (i / 8) * TAU, sn = Math.sin(ph), c = Math.cos(ph);
    walk.push(mk(trpose({
      ...base, hipY: -Math.abs(c) * 2 + 1.5, hipX: sn * 0.7, lean: 0.46, fFx: 1 + sn * 9, fFy: Math.max(0, -c) * 4,
      fBx: -1 - sn * 9, fBy: Math.max(0, c) * 4, hFx: 11 + sn * 4, hFy: 15 - Math.abs(sn), hBx: 8 - sn * 5, hBy: 17,
      capeT: ph, sway: 0.6 + c * 0.4, head: sn * 0.3, br: i / 8,
    }), { fx: i === 0 || i === 4 ? 'step' : null }));
  }
  // Brüllen: Arme weit, Brust raus, Kopf in den Nacken, großer Frosthauch
  const r1 = trpose({ ...base, lean: 0.55, hipY: 2, headY: 1, hFx: 8, hFy: 16, hBx: 6, hBy: 17, jaw: 0.3, br: -1 });
  const r2 = trpose({ lean: 0.12, hipY: 1, head: -1, headY: -2, hFx: 17, hFy: -12, hBx: -12, hBy: -6, jaw: 1, fFx: 11, fBx: -11, sway: -0.5, capeT: 2, frost: 1.5, br: 0, hBopen: 1 });
  const roar = TT([[0, idleA], [0.28, r1], [0.45, r2, snap], [0.85, { ...r2, capeT: 4, br: 0.6 }], [1, { ...r2, capeT: 5, br: 0.9, jaw: 0.8 }]], 9, {
    extras: { 4: { fx: 'roar', bigBreath: true }, 5: { bigBreath: true }, 6: { bigBreath: true }, 7: { bigBreath: true }, 8: { bigBreath: true } },
  });
  // Standardangriff: Eisfaust hoch – und von oben auf den Boden
  const w1 = trpose({ ...base, lean: 0.25, hipX: -1, hFx: 2, hFy: -10, hBx: 10, hBy: 10, fFx: 11, fBx: -10, jaw: 0.4, br: -1 });
  const w2 = trpose({ lean: 0.08, hipX: -2, hipY: 1, hFx: -3, hFy: -18, hBx: 12, hBy: 6, fFx: 12, fBx: -11, jaw: 1, capeT: 1, frost: 1.5, headY: -1, br: -1, hBopen: 1 });
  const windup = TT([[0, idleA], [0.45, w1], [1, w2]], 5);
  const s1 = trpose({ lean: 0.4, hipX: 1, hipY: 1, hFx: 10, hFy: -12, hBx: 6, hBy: 14, fFx: 13, fBx: -11, jaw: 1, sway: 0.8, capeT: 2, br: -1 });
  const s2 = trpose({ lean: 0.72, hipX: 4, hipY: 7, hFx: 13, hFy: 16.5, hBx: 3, hBy: 20, fFx: 14, fBx: -12, jaw: 1, sway: 1.2, capeT: 3, frost: 1.6, headY: 1, br: -1 });
  const s3 = trpose({ ...s2, hipY: 7.5, hFy: 17, capeT: 4, jaw: 0.6 });
  const s4 = trpose({ ...base, lean: 0.55, hipX: 2, hipY: 3, hFx: 13, hFy: 19, fFx: 12, fBx: -10, capeT: 5, sway: 0.6, br: 0.2 });
  const fistBurst = (s) => (p, g) => { iceBurst(p, g, T.AX + 46, T.AY - 1, s, 5, 5); return {}; };
  const strike = [
    mk(s1, { smear: [-2.1, -0.7, 1] }),
    mk(s2, { smear: [-1.1, 0.75, 1], fx: 'impact', post: fistBurst(0.8) }),
    mk(s3, { post: fistBurst(1) }),
    mk(s4, { post: fistBurst(0.45) }),
    mk(mixP(s4, idleA, 0.6)),
  ];
  // Spezial „slam“ (Ausholzeit 1,1 s): beide Arme über den Kopf, Beben,
  // beidhändiger Schlag – ein Kranz aus Eisdornen bricht aus dem Boden.
  const sl1 = trpose({ ...base, lean: 0.55, hipY: 3, hFx: 8, hFy: 18, hBx: 6, hBy: 18, jaw: 0.5, br: -1 });
  const sl2 = trpose({ lean: 0.02, hipX: -2, hipY: 0, hFx: 2, hFy: -20, hBx: -2, hBy: -19, fFx: 12, fBx: -11, jaw: 1, frost: 1.6, headY: -2, head: -1, capeT: 1, br: -1, hBopen: 0 });
  const sl3 = trpose({ ...sl2, lean: -0.06, hipY: -1, hFy: -21, hBy: -20, capeT: 2 });
  const sl4 = trpose({ lean: 0.8, hipX: 4, hipY: 8, hFx: 13, hFy: 16.5, hBx: 9, hBy: 17, fFx: 14, fBx: -12, jaw: 1, frost: 1.7, headY: 2, capeT: 3, sway: 1.4, br: -1 });
  const sl5 = trpose({ ...sl4, lean: 0.78, hipY: 7.5, capeT: 4, jaw: 0.7, br: 0.2 });
  const ring = (s) => (p, g) => {
    iceBurst(p, g, T.AX + 46, T.AY - 1, s, 7, 9);
    iceBurst(p, g, T.AX + 20, T.AY - 1, s * 0.6, 3, 11);
    return {};
  };
  // 12 Frames bei 10 fps: Einschlag in Frame 11 (≈ 1,1 s)
  const slam = [
    ...TT([[0, idleA], [0.25, sl1], [0.65, sl2], [1, sl3]], 9),
    mk(mixP(sl3, sl2, 0.5), { fx: 'step' }),
    mk(sl4, { smear: [-1.2, 0.9, 1], fx: 'impact', slamFists: true, post: ring(0.9) }),
    mk(sl5, { slamFists: true, post: ring(1.15) }),
    mk(mixP(sl5, idleA, 0.35), { post: ring(0.7) }),
  ];
  // Spezial „charge“: Schulter vor, Kopf runter, scharrt (brace), dann Sturmlauf
  const b1 = trpose({ ...base, lean: 0.7, hipY: 4, headY: 2, hFx: 6, hFy: 12, hBx: 12, hBy: 16, fFx: 12, fBx: -12, jaw: 0.6, br: 0 });
  const b2 = trpose({ ...b1, fFx: 7, fFy: 3, br: 0.4, jaw: 1 });
  const b3 = trpose({ ...b1, fFx: 13, fFy: 0, br: 0.7, frost: 1.5 });
  const brace = TT([[0, idleA], [0.35, b1], [0.6, b2], [0.8, b3], [1, { ...b3, br: 0.95 }]], 7, { extras: { 4: { fx: 'step' } } });
  const charge = [];
  for (let i = 0; i < 6; i++) {
    const ph = (i / 6) * TAU, sn = Math.sin(ph), c = Math.cos(ph);
    charge.push(mk(trpose({
      lean: 0.78, hipY: 2 - Math.abs(c) * 2.5, hipX: 2, fFx: 3 + sn * 13, fFy: Math.max(0, -c) * 6, fBx: -3 - sn * 13, fBy: Math.max(0, c) * 6,
      hFx: 9 + sn * 3, hFy: 10, hBx: 6 - sn * 6, hBy: 13, headY: 2.5, jaw: 1, sway: 1.6, capeT: ph * 2, frost: 1.5, br: i / 6,
    }), { fx: i === 0 || i === 3 ? 'step' : null, bigBreath: true }));
  }
  const hurtP = trpose({ ...base, lean: 0.25, hipX: -2, head: -1.5, headY: -1, jaw: 0.8, hFx: 8, hFy: 8, eye: 1, sway: -0.5, br: -1 });
  const hurt = [mk(hurtP), mk(mixP(hurtP, idleA, 0.5))];
  // Tod: Knie, Faust stützt sich auf – Eis zerspringt, kippt vornüber
  const d1 = trpose({ ...base, lean: 0.15, hipX: -2, head: -2, headY: -1, jaw: 1, hFx: 6, hFy: 6, br: -1 });
  const d2 = trpose({ kneel: 1, lean: 0.62, jaw: 1, headY: 2, hFx: 15, hFy: 20, hBx: 10, hBy: 18, frost: 0.9, eye: 0.6, br: -1 });
  const d3 = trpose({ kneel: 1, lean: 0.85, jaw: 0.5, headY: 3, hFx: 17, hFy: 22, hBx: 12, hBy: 20, frost: 0.6, eye: 0.3, br: -1 });
  const flat = trpose({ lean: 0.05, headY: 1, hFx: 10, hFy: 20, hBx: 4, hBy: 18, fFx: 4, fBx: -3, frost: 0.2, eye: 0, jaw: 0.4, br: -1 });
  const piv = [T.AX + 6, T.AY - 1];
  const shards = (s) => (p, g) => { if (s > 0) iceBurst(p, g, T.AX + 36, T.AY - 1, s, 4, 21); return {}; };
  const death = [
    mk(hurtP), mk(d1), mk(d2, { fx: 'impact' }), mk(d3, { post: shards(0.5) }),
    mk(trpose({ kneel: 0.7, lean: 0.35, jaw: 0.5, headY: 1, hFx: 17, hFy: 10, hBx: 12, hBy: 12, frost: 0.5, eye: 0.2, br: -1 }), { rot: [0.55, ...piv], post: shards(0.3) }),
    mk(flat, { rot: [1.1, ...piv] }),
    mk(flat, { rot: [Math.PI / 2, T.AX - 2, T.AY - 1], fx: 'impact' }),
    mk({ ...flat, frost: 0 }, { rot: [Math.PI / 2, T.AX - 2, T.AY - 1] }),
  ];
  return {
    idle: new Animation(idle, 5),
    walk: new Animation(walk, 8),
    roar: new Animation(roar, 8, false),
    windup: new Animation(windup, 6, false),
    strike: new Animation(strike, 12, false),
    slam: new Animation(slam, 10, false),
    brace: new Animation(brace, 9, false),
    charge: new Animation(charge, 12),
    hurt: new Animation(hurt, 9, false),
    death: new Animation(death, 8, false),
  };
}

// ================================================================ Vierbeiner-Werkzeug

// Ein Bein von Gelenk (hx, hy) zum Fuß (fx, fy); front: Handwurzel knickt nach
// vorn, hinten: Sprunggelenk nach hinten. ramp: 4 Stufen.
function qLeg(p, hx, hy, fx, fy, l1, l2, front, w, ramp, paw) {
  const L = ik(hx, hy, fx, fy, l1, l2, front ? -1 : 1);
  limb(p, hx, hy, L.jx, L.jy, w, w * 0.75, ramp);
  limb(p, L.jx, L.jy, L.ex, L.ey - 1, w * 0.7, w * 0.6, ramp);
  p.rect(L.ex - 1, L.ey - 1, paw, 1, ramp[0]);
  p.px(L.ex + paw - 2, L.ey - 1, ramp[1]);
  return L;
}

// Kopf-Richtung: Schnauzenwinkel a (0 = nach vorn, negativ = hoch).
const dirOf = (a) => ({ x: Math.cos(a), y: Math.sin(a) });

// ================================================================ Frostwolf

const FW = 64, FH = 44, FAX = 29, FAY = 39;
const WF = ['#161c2a', '#243044', '#36445c', '#4e5e78', '#6e7e98', '#96a4ba', '#bcc8d6', '#e2e8f0'];
const W_REST = { t: 0, amp: 0, gallop: 0, crouch: 0, leap: 0, bob: 0, ha: 0.12, jaw: 0, lie: 0, side: 0, eye: 1, br: 0, tail: 0, lunge: 0, pitch: 0, ear: 0, frost: 1 };
const wpose = (o = {}) => ({ ...W_REST, ...o });

function drawFrostWolf(p, g, P, X) {
  const gy = FAY, ox = FAX - 15 + P.lunge;
  const meta = {};
  const lie = P.lie, side = P.side;
  const by = gy - 15.5 + P.crouch + P.bob - P.leap * 4 + lie * 9;
  const Y = (x, y) => y + (x - 13) * P.pitch * 0.14;
  const farR = [WF[0], WF[1], WF[2], WF[3]], nearR = [WF[2], WF[3], WF[4], WF[5]];

  const leg = (xh, ph, near, front) => {
    const hx = ox + xh, hy = Y(xh, by + (front ? 1 : 0));
    const col = near ? nearR : farR;
    if (side > 0.5) { // auf der Seite liegend: Beine steif nach vorn
      const ly = gy - 2 - (near ? 0 : 2);
      limb(p, hx, hy + 1, hx + 6, ly, 3, 2, col); p.rect(hx + 6, ly - 1, 2, 1, WF[0]);
      return;
    }
    const a = P.t * TAU + ph;
    let fx = hx + Math.sin(a) * 4 * P.amp + (front ? 1 : -1), fy = gy - Math.max(0, Math.cos(a)) * 3 * P.amp;
    if (P.leap > 0) {
      const lp = P.leap;
      fx += ((hx + (front ? 13 : -13)) - fx) * lp; fy += (Y(xh, by + (front ? 4 : 6)) - fy) * lp;
    }
    if (lie > 0) { fx = hx + (front ? 5 : -4) * lie + (fx - hx) * (1 - lie); fy = Math.min(gy, fy); }
    qLeg(p, hx, hy - 1, fx, fy, front ? 7.5 : 8, front ? 7.5 : 9, front, near ? 2.8 : 2.4, col, 3);
    if (!front) p.ellipse(hx - 0.5, hy + 1.5, near ? 3 : 2.5, near ? 3.5 : 3, col[1]);
  };
  const run = P.gallop > 0.5;
  leg(6, 0, false, false);
  leg(20, run ? Math.PI * 0.2 : Math.PI, false, true);

  // --- buschiger Schwanz (hängt; beim Laufen gestreckt)
  const ts = Math.sin(P.t * TAU * 2) * P.amp * 0.8;
  const tailA = 2.3 - P.tail * 0.9 - P.amp * 0.35 - P.leap * 0.6;
  let tx = ox + 1, ty = Y(1, by - 2);
  for (let i = 0; i < 9; i++) {
    const a = tailA + i * 0.05 + ts * 0.05;
    tx += Math.cos(a) * 1.2; ty += Math.sin(a) * 1.2;
    const r = 1.1 + Math.sin(i / 8 * Math.PI) * 1.0;
    p.ellipse(tx, ty, r, r, WF[4]);
    p.px(tx - 0.5, ty - r + 0.5, WF[6]);
  }
  p.px(tx, ty, WF[7]); p.px(tx - 1, ty + 1, WF[6]);

  // --- Rumpf
  const flat = 1 - side * 0.25;
  p.ellipse(ox + 7, Y(7, by), 6, 4.8 * flat, WF[4]);
  p.ellipse(ox + 13, Y(13, by + 0.3), 7.5, 4.2 * flat, WF[4]);
  p.ellipse(ox + 20, Y(20, by - 0.5), 5.5, 5.3 * flat, WF[4]);
  // Bauch dunkler, Rücken hell (Schnee-Fell)
  p.ellipse(ox + 13, Y(13, by + 3.4), 6.5, 1.3, WF[2]);
  p.ellipse(ox + 8, Y(8, by + 3.5), 4, 1.5, WF[3]);
  p.ellipse(ox + 12, Y(12, by - 3), 9, 2.2 * flat, WF[5]);
  p.ellipse(ox + 12, Y(12, by - 4), 7, 1.2, WF[6]);
  for (let x = 2; x <= 22; x++) p.px(ox + x, Y(x, by - 5 - (x > 15 ? (x - 15) * 0.2 : 0)) + (x % 3 === 0 ? 1 : 0), x % 4 === 0 ? WF[7] : WF[6]);
  // Oberschenkel-Wölbung
  p.ellipse(ox + 5, Y(5, by + 1), 3.5, 3.5, WF[3]); p.ellipse(ox + 4.5, Y(4.5, by), 2.5, 2.5, WF[5]);
  // Fellstruktur
  for (let i = 0; i < 26; i++) {
    const x = 2 + hash2(i, 1, 51) * 22, y = -3 + hash2(i, 2, 51) * 7;
    p.px(ox + x, Y(x, by + y), hash2(i, 3, 51) < 0.55 ? WF[3] : WF[6]);
  }
  // Reifkristalle im Rückenfell (leuchtend)
  for (const [x, h] of [[9, 2], [13, 3], [17, 2]]) {
    for (let j = 0; j < h; j++) {
      const yy = Y(x, by - 5.5) - j;
      p.px(ox + x - j * 0.4, yy, j === h - 1 ? ICE[5] : ICE[3]);
      if (P.frost > 0.3) g.px(ox + x - j * 0.4, yy, j === h - 1 ? ICE_G[4] : ICE_G[2]);
    }
  }

  // --- nahe Beine
  leg(8, run ? 0.5 : Math.PI, true, false);
  leg(22, run ? Math.PI * 1.1 : 0, true, true);

  // --- Hals (schräg nach oben) und Halskrause (weiß, zottig, mit Reifspitzen)
  const hx = ox + 27 + P.leap * 2, hy = Y(27, by - 7) + lie * 3.5 + Math.max(0, P.ha) * 3;
  limb(p, ox + 20, Y(20, by - 1), hx - 1.5, hy + 1, 7, 5, [WF[3], WF[4], WF[5], WF[6]]);
  const nx = ox + 23, ny = Y(23, by - 4);
  p.ellipse(nx, ny + 1, 4.5, 5.5, WF[5]);
  p.ellipse(nx - 1, ny - 1, 3, 3, WF[6]);
  for (let i = 0; i < 8; i++) {
    const a = -2.4 + i * 0.5, r = 5 + (i % 2);
    const x = nx + Math.cos(a) * r - 1, y = ny + 1 + Math.sin(a) * r * 1.1;
    p.px(x, y, i % 2 ? WF[6] : WF[5]); p.px(x - Math.cos(a) * 0.8, y - Math.sin(a) * 0.8, WF[4]);
  }
  p.px(nx + 1, ny + 6, WF[5]); p.px(nx - 1, ny + 7, WF[4]); p.px(nx + 2, ny + 5, WF[6]);

  // --- Kopf
  const ha = P.ha, d = dirOf(ha);
  p.ellipse(hx, hy, 3.6, 3.1, WF[4]);
  p.ellipse(hx - 0.5, hy - 1, 2.8, 1.8, WF[6]);
  // Ohren (spitz, zurückgelegt beim Knurren)
  const earBack = P.ear;
  const ear = (ex, ey, near) => {
    const tipx = ex - 1 - earBack * 2.5 + d.y * 1.5, tipy = ey - 4 + earBack * 2;
    p.line(ex, ey, tipx, tipy, near ? WF[5] : WF[3]); p.line(ex + 1, ey, tipx + 0.5, tipy + 1, near ? WF[4] : WF[2]);
    p.px(tipx, tipy, near ? WF[7] : WF[4]);
    if (near) p.px(ex + 0.5, ey - 1, WF[1]);
  };
  ear(hx - 2, hy - 2, false); ear(hx, hy - 2.5, true);
  // Schnauze (lang), Unterkiefer öffnet sich um jaw
  const sx0 = hx + d.x * 1.5, sy0 = hy + d.y * 1.5;
  const tipX = hx + d.x * 7.5, tipY = hy + d.y * 7.5 + 0.8;
  limb(p, sx0, sy0, tipX, tipY, 3.6, 2.2, [WF[3], WF[4], WF[5], WF[6]]);
  const ja = ha + P.jaw * 0.45, jd = dirOf(ja);
  const jx = hx + jd.x * 6.2, jy = hy + 1.8 + jd.y * 6.2;
  p.line(hx + 1, hy + 2, jx, jy, WF[3]); p.line(hx + 1, hy + 1.5, jx - jd.x * 0.5, jy - 0.8, WF[2]);
  if (P.jaw > 0.2) { // Maul, Zähne, Zunge
    p.line(hx + 1.5, hy + 1, tipX - d.x, tipY + 0.5 - d.y, '#1a0c14');
    p.line(hx + 2, hy + 1.5, jx - jd.x * 1.5, jy - 1, '#6a2a3a');
    p.px(tipX - d.x * 1.5, tipY + 1, '#f4f4ec'); p.px(jx - jd.x * 1.5, jy - 1.5, '#f4f4ec'); p.px(hx + d.x * 3, hy + d.y * 3 + 1.5, '#e0e0d8');
  }
  p.px(tipX, tipY - 0.5, '#0c0e14'); p.px(tipX - d.x, tipY - 1, WF[1]); // Nase
  // Auge: eisblau, leuchtend, dunkle Maske darum
  const ex = hx + 1 + d.x, ey = hy - 1 + d.y * 0.5;
  p.px(ex - 1, ey, WF[1]); p.px(ex + 1, ey + 0.5, WF[2]);
  if (P.eye > 0.3) { p.px(ex, ey, ICE[4]); g.px(ex, ey, ICE_G[5]); g.px(ex + 1, ey, ICE_G[2]); g.px(ex - 1, ey, ICE_G[1]); }
  else p.px(ex, ey, WF[1]);
  meta.eye = { x: ex, y: ey };
  meta.mouth = { x: tipX, y: tipY + 1 };
  meta.head = { x: hx, y: hy - 6 };
  // eisiger Atemhauch
  if (P.br >= 0) breath(p, g, tipX, tipY + 1, P.br, d.x >= 0 ? 1 : -1, X.bigBreath ? 5 : 3, X.bigBreath ? 1.4 : 0.9);
  return meta;
}

function frostWolfAnims() {
  const mk = (P, X) => makeFrame(FW, FH, FAX, FAY, drawFrostWolf, P, X);
  const idle = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 6, k = (1 - Math.cos(t * TAU)) / 2;
    idle.push(mk(wpose({ bob: k > 0.5 ? 1 : 0, ha: 0.12 + k * 0.08, br: t, tail: k * 0.2, frost: i % 3 === 0 ? 1.2 : 1 })));
  }
  const walk = [];
  for (let i = 0; i < 6; i++) walk.push(mk(wpose({ t: i / 6, amp: 1, bob: i % 3 === 1 ? 1 : 0, ha: 0.2, br: i / 6, tail: 0.3 }), { fx: i % 3 === 0 ? 'step' : null }));
  // Knurren: tief ducken, Ohren zurück, Maul auf
  const windup = track(mk, [[0, wpose()], [0.5, wpose({ crouch: 2, ha: 0.3, jaw: 0.8, ear: 1, br: -1, tail: -0.3 })], [1, wpose({ crouch: 3, ha: 0.25, jaw: 1, ear: 1, lunge: -1, br: -1, t: 0.25, amp: 0.3, pitch: 0.2 })]], 4);
  // Sprung: streckt sich lang, Maul weit auf – und landet
  const strike = [
    mk(wpose({ leap: 1, jaw: 1.2, ha: 0.05, lunge: 3, ear: 1, br: -1, pitch: -0.15, tail: 0.6 }), { fx: 'impact' }),
    mk(wpose({ leap: 0.9, jaw: 0.6, ha: 0.25, lunge: 3, ear: 0.6, br: -1, pitch: 0.1, tail: 0.5 })),
    mk(wpose({ leap: 0.3, jaw: 0.3, ha: 0.25, lunge: 1.5, crouch: 1.5, br: 0.2, t: 0.25, amp: 0.4 })),
  ];
  const hurt = [mk(wpose({ crouch: 2, ha: -0.35, jaw: 0.8, ear: 1, lunge: -1.5, pitch: -0.2, eye: 1, br: -1 })), mk(wpose({ crouch: 1, ha: 0, lunge: -0.5, br: -1 }))];
  // Heulen (Rudel): Kopf in den Nacken, großer Atemhauch
  const howl = track(mk, [[0, wpose()], [0.35, wpose({ crouch: 1.5, ha: -0.5, jaw: 0.3, br: -1 })], [0.6, wpose({ crouch: 1.5, ha: -1.15, jaw: 1, pitch: -0.25, br: 0, tail: -0.2 })], [1, wpose({ crouch: 1.5, ha: -1.2, jaw: 1, pitch: -0.25, br: 0.7, tail: -0.2 })]], 6, {
    extras: { 3: { fx: 'roar', bigBreath: true }, 4: { bigBreath: true }, 5: { bigBreath: true } },
  });
  const death = [
    mk(wpose({ crouch: 2, ha: -0.4, jaw: 1, ear: 1, lunge: -1.5, pitch: -0.2, br: -1 })),
    mk(wpose({ crouch: 3, ha: 0.5, lie: 0.4, jaw: 0.6, eye: 0.6, br: -1 })),
    mk(wpose({ ha: 0.7, lie: 0.8, jaw: 0.4, eye: 0.4, br: -1, frost: 0.6 }), { fx: 'impact' }),
    mk(wpose({ ha: 0.6, lie: 1, side: 1, jaw: 0.3, eye: 0, br: -1, frost: 0.3 })),
    mk(wpose({ ha: 0.6, lie: 1, side: 1, jaw: 0.3, eye: 0, br: -1, frost: 0 })),
  ];
  return {
    idle: new Animation(idle, 5),
    walk: new Animation(walk, 12),
    windup: new Animation(windup, 9, false),
    strike: new Animation(strike, 10, false),
    hurt: new Animation(hurt, 10, false),
    howl: new Animation(howl, 7, false),
    death: new Animation(death, 8, false),
  };
}

// ================================================================ Schneepirscher

// Säbelzahn-Schneekatze: lang, geduckt, dunkle Streifen, Eis auf den Schulterblättern.
const SW_ = 72, SH_ = 44, SAX = 31, SAY = 39;
const CF = ['#141824', '#222a3a', '#343f54', '#4c5a70', '#6c7a90', '#94a2b6', '#bcc6d4', '#e4eaf0'];
const STRIPE = ['#0e1119', '#1a1f2c', '#283042'];
const S_REST = { t: 0, amp: 0, crouch: 0, bob: 0, pitch: 0, lunge: 0, ha: 0.15, jaw: 0, eye: 1, lie: 0, side: 0, tail: 0, tailT: 0, sN: 0, nX: 0, nY: 0, sF: 0, fX: 0, fY: 0, ear: 0, frost: 1, rear: 0 };
const spose = (o = {}) => ({ ...S_REST, ...o });

function drawStalker(p, g, P, X) {
  const gy = SAY, ox = SAX - 17 + P.lunge;
  const meta = {};
  const lie = P.lie, side = P.side;
  const by = gy - 15 + P.crouch + P.bob + lie * 5;
  // rear: Vorderkörper hebt sich (Aufbäumen vor dem Hieb)
  const Y = (x, y) => y + (x - 14) * (P.pitch * 0.14 - P.rear * 0.28);
  const farR = [CF[0], CF[1], CF[2], CF[3]], nearR = [CF[2], CF[3], CF[4], CF[5]];

  const leg = (xh, ph, near, front, sw, sx, sy) => {
    const hx = ox + xh, hy = Y(xh, by + 1);
    const col = near ? nearR : farR;
    if (side > 0.5) {
      const ly = gy - 2 - (near ? 0 : 2);
      limb(p, hx, hy + 1, hx + 7, ly, 3.5, 2.5, col); p.rect(hx + 7, ly - 1, 3, 1, CF[0]);
      return null;
    }
    const a = P.t * TAU + ph;
    let fx = hx + Math.sin(a) * 4.5 * P.amp + (front ? 1.5 : -1), fy = gy - Math.max(0, Math.cos(a)) * 2.5 * P.amp;
    if (lie > 0) { fx = hx + (front ? 6 : -5) * lie + (fx - hx) * (1 - lie); }
    if (sw > 0) { fx += (hx + sx - fx) * sw; fy += (hy + sy - fy) * sw; }
    const L = qLeg(p, hx, hy - 1, fx, fy, front ? 7.5 : 8, front ? 7 : 8.5, front, near ? 3.8 : 3.2, col, 4);
    if (!front) p.ellipse(hx - 0.5, hy + 1.5, near ? 3.5 : 3, near ? 4 : 3.5, col[1]);
    // Streifen am Bein
    if (near) p.px((hx + L.jx) / 2, (hy + L.jy) / 2, STRIPE[1]);
    // Krallen bei erhobener Pranke
    if (sw > 0.3) for (let i = 0; i < 3; i++) { p.px(L.ex + 2, L.ey - 1 + i, BONE[4]); p.px(L.ex + 3, L.ey + i, BONE[3]); }
    return L;
  };
  leg(6, 0, false, false, 0);
  const farPaw = leg(25, Math.PI, false, true, P.sF, P.fX, P.fY);

  // --- langer Schwanz mit dunklen Ringen
  let tx = ox + 1, ty = Y(1, by - 2);
  const tailA = 2.35 + P.tail * 0.5;
  for (let i = 0; i < 16; i++) {
    const a = tailA + Math.sin(P.tailT + i * 0.35) * 0.25 * (i / 15) + i * 0.075;
    tx += Math.cos(a) * 1.2; ty += Math.sin(a) * 1.2;
    const r = 1.8 - i * 0.04;
    p.ellipse(tx, ty, r, r, i % 4 === 2 ? STRIPE[2] : CF[4]);
    if (i % 4 !== 2) p.px(tx, ty - r + 0.5, CF[6]);
  }
  p.ellipse(tx, ty, 1.5, 1.5, STRIPE[1]);

  // --- Rumpf (lang, Schultern höher)
  const flat = 1 - side * 0.25;
  p.ellipse(ox + 7, Y(7, by), 6.5, 5 * flat, CF[4]);
  p.ellipse(ox + 15, Y(15, by + 0.5), 9, 4.6 * flat, CF[4]);
  p.ellipse(ox + 23, Y(23, by - 0.5), 6.5, 5.8 * flat, CF[4]);
  p.ellipse(ox + 15, Y(15, by + 3.8), 8, 1.4, CF[2]);
  p.ellipse(ox + 14, Y(14, by - 3), 10, 2, CF[5]);
  p.ellipse(ox + 14, Y(14, by - 3.8), 8, 1, CF[6]);
  p.ellipse(ox + 23, Y(23, by - 4), 4, 1.5, CF[6]);
  // Hinterbacke + Schulterblatt
  p.ellipse(ox + 5, Y(5, by + 1), 3.5, 3.5, CF[3]); p.ellipse(ox + 4.5, Y(4.5, by), 2.5, 2.2, CF[5]);
  // Tigerstreifen (dunkel, quer)
  const stripes = [[4, -2, 2], [8, -4, 5], [11, -4, 6], [14, -4, 5], [17, -4, 6], [20, -4, 4], [24, -5, 3]];
  for (const [x, y0, len] of stripes) {
    for (let j = 0; j < len; j++) {
      const xx = x + j * 0.35 + (j > len / 2 ? -0.5 : 0);
      p.px(ox + xx, Y(xx, by + y0 + j), j < 1 ? STRIPE[2] : STRIPE[1]);
    }
  }
  // Fellrauschen
  for (let i = 0; i < 22; i++) {
    const x = 2 + hash2(i, 1, 57) * 26, y = -3 + hash2(i, 2, 57) * 6;
    p.px(ox + x, Y(x, by + y), hash2(i, 3, 57) < 0.5 ? CF[3] : CF[6]);
  }
  // Eiskristalle auf den Schulterblättern (Tarnung im Schnee, leuchten kalt)
  for (const [x, h, l] of [[20, 4, -0.5], [22.5, 5, -0.3], [25, 3, -0.2]]) {
    for (let j = 0; j < h; j++) {
      const xx = ox + x + l * j, yy = Y(x, by - 5.5) - j;
      p.px(xx, yy, j === h - 1 ? ICE[5] : j > h / 2 ? ICE[4] : ICE[3]); p.px(xx - 1, yy + 0.5, ICE[1]);
      if (P.frost > 0.3) g.px(xx, yy, j === h - 1 ? ICE_G[5] : ICE_G[2]);
    }
  }

  // --- nahe Beine (vordere schlägt beim Hieb)
  leg(8, Math.PI, true, false, 0);
  if (X.smear) smearArc(p, g, ox + 26, Y(26, by) - 2, X.smear[0], X.smear[1], 6, 15, FROST_SMEAR, FROST_SMEAR_G, 1);
  const nearPaw = leg(27, 0, true, true, P.sN, P.nX, P.nY);

  // --- Kopf: flach, breit, Säbelzähne
  const ha = P.ha, d = dirOf(ha);
  const hx = ox + 30, hy = Y(30, by - 3.5) + lie * 1.5;
  p.ellipse(hx, hy, 4.2, 3.4, CF[4]);
  p.ellipse(hx - 0.5, hy - 1, 3.2, 1.8, CF[6]);
  p.ellipse(hx - 2, hy + 1.5, 2.5, 2, CF[5]); // Backenbart
  p.px(hx - 4, hy + 2, CF[6]); p.px(hx - 4, hy + 3, CF[5]);
  // Stirnstreifen
  p.px(hx - 1, hy - 3, STRIPE[1]); p.px(hx, hy - 3, STRIPE[2]); p.px(hx - 2, hy - 2, STRIPE[1]);
  // Ohren (rund, angelegt beim Angriff)
  const earY = hy - 3 + P.ear * 1.5;
  p.ellipse(hx - 2.5 - P.ear, earY - 1, 1.3, 1.5, CF[3]); p.px(hx - 2.5 - P.ear, earY - 2, CF[6]);
  p.ellipse(hx - 0.5 - P.ear, earY - 1.3, 1.3, 1.5, CF[5]); p.px(hx - 0.5 - P.ear, earY - 1.5, STRIPE[1]);
  // kurze Schnauze
  const sx = hx + d.x * 4, sy = hy + d.y * 4 + 0.5;
  p.ellipse(sx, sy, 2.3, 1.8, CF[5]); p.px(sx + 1.5, sy - 1, '#1a1418'); p.px(sx + 1, sy - 1.5, CF[6]);
  // Maul: Unterkiefer klappt auf
  const jo = P.jaw * 2.5;
  if (P.jaw > 0.1) { p.rect(sx - 2, sy + 1, 4, jo, '#1a0c14'); p.px(sx - 1, sy + 1 + jo * 0.6, '#7a2a3a'); }
  p.line(sx - 2, sy + 1.5 + jo, sx + 1.5, sy + 1.5 + jo, CF[3]);
  // Säbelzähne (lang, knochenweiß, leicht nach hinten gebogen)
  for (const [ox2, len] of [[0.5, 5], [-1, 4]]) {
    const fx = sx + ox2, fy = sy + 1;
    for (let j = 0; j < len; j++) p.px(fx - j * 0.15, fy + j, j === len - 1 ? BONE[3] : j === 0 ? BONE[2] : '#f8f4e8');
  }
  // Auge: schmal, eisblau
  const ex = hx + 1.5 + d.x, ey = hy - 1 + d.y * 0.5;
  p.px(ex - 1, ey, STRIPE[1]); p.px(ex + 1, ey, STRIPE[2]);
  if (P.eye > 0.3) { p.px(ex, ey, ICE[4]); g.px(ex, ey, ICE_G[5]); g.px(ex + 1, ey, ICE_G[2]); g.px(ex - 1, ey, ICE_G[1]); }
  else p.px(ex, ey, STRIPE[1]);
  meta.eye = { x: ex, y: ey };
  meta.mouth = { x: sx + 2, y: sy + 1 };
  meta.head = { x: hx, y: hy - 6 };
  meta.hand = nearPaw ? { x: nearPaw.ex + 2, y: nearPaw.ey } : { x: sx, y: sy };
  if (farPaw && P.sF > 0.3) meta.hand2 = { x: farPaw.ex + 2, y: farPaw.ey };
  return meta;
}

function stalkerAnims() {
  const mk = (P, X) => makeFrame(SW_, SH_, SAX, SAY, drawStalker, P, X);
  // Lauern: tief geduckt, nur die Schwanzspitze zuckt
  const idle = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 6, k = (1 - Math.cos(t * TAU)) / 2;
    idle.push(mk(spose({ crouch: 1 + k * 0.6, ha: 0.25, tailT: t * TAU, tail: 0.1 + k * 0.15, frost: i % 3 === 0 ? 1.2 : 1 })));
  }
  // Schleichen: flacher, federnder Gang
  const walk = [];
  for (let i = 0; i < 8; i++) {
    const ph = i / 8;
    walk.push(mk(spose({ t: ph, amp: 1, crouch: 1.5, bob: i % 4 === 1 || i % 4 === 2 ? 0.5 : 0, ha: 0.3, tailT: ph * TAU, tail: 0.2 })));
  }
  // Aufbäumen: Pranke hoch, Maul auf
  const w1 = spose({ crouch: 2.5, rear: 0.3, sN: 0.6, nX: 6, nY: -5, jaw: 0.5, ear: 1, ha: 0.1, tail: 0.5, lunge: -1 });
  const w2 = spose({ crouch: 2.5, rear: 0.6, sN: 1, nX: 7, nY: -9, jaw: 1, ear: 1, ha: -0.1, tail: 0.6, lunge: -1.5, tailT: 1 });
  const windup = track(mk, [[0, spose({ crouch: 1 })], [0.5, w1], [1, w2]], 4);
  // Doppelhieb: nahe Pranke fegt herab, dann die ferne
  const s1 = spose({ crouch: 1.5, rear: 0.3, sN: 1, nX: 10, nY: -4, sF: 0.6, fX: 1, fY: -8, jaw: 1, ear: 1, ha: 0.2, lunge: 2, tail: 0.6, tailT: 2 });
  const s2 = spose({ crouch: 2, rear: 0.05, sN: 1, nX: 9, nY: 6, sF: 1, fX: 2, fY: -10, jaw: 1, ear: 1, ha: 0.3, lunge: 3.5, tail: 0.5, tailT: 3 });
  const s3 = spose({ crouch: 2, rear: 0.2, sN: 0.4, nX: 6, nY: 6, sF: 1, fX: 10, fY: 5, jaw: 0.8, ear: 1, ha: 0.25, lunge: 4, tail: 0.4, tailT: 4 });
  const s4 = spose({ crouch: 1.5, sN: 0, sF: 0.2, fX: 6, fY: 6, jaw: 0.3, ha: 0.2, lunge: 2, tail: 0.3, tailT: 5 });
  const strike = [
    mk(s1, { smear: [-2.2, -1.0] }),
    mk(s2, { smear: [-1.6, 0.9], fx: 'impact' }),
    mk(s3, { smear: [-1.5, 0.8] }),
    mk(s4),
  ];
  const hurtP = spose({ crouch: 2, rear: 0.2, ha: -0.4, jaw: 1, ear: 1, lunge: -2, tail: 0.7, tailT: 2 });
  const hurt = [mk(hurtP), mk(mixP(hurtP, spose({ crouch: 1 }), 0.5))];
  const death = [
    mk(hurtP),
    mk(spose({ crouch: 3, ha: 0.5, lie: 0.4, jaw: 0.8, eye: 0.6, frost: 0.8 })),
    mk(spose({ ha: 0.6, lie: 0.8, jaw: 0.5, eye: 0.4, frost: 0.6 }), { fx: 'impact' }),
    mk(spose({ ha: 0.5, lie: 1, side: 1, jaw: 0.4, eye: 0, frost: 0.3, tail: -0.3 })),
    mk(spose({ ha: 0.5, lie: 1, side: 1, jaw: 0.4, eye: 0, frost: 0, tail: -0.3 })),
  ];
  return {
    idle: new Animation(idle, 5),
    walk: new Animation(walk, 12),
    windup: new Animation(windup, 10, false),
    strike: new Animation(strike, 16, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 8, false),
  };
}

// ================================================================ Reifhexe

const HW = 64, HH = 58, HAX = 28, HAY = 52;
const HD = { legH: 11, thigh: 5.5, shin: 6, spine: 9, upper: 5, fore: 5.5, sh: 1.5, hipW: 1 };
const ROBE = ['#0a0e1c', '#141b30', '#1f2a48', '#2c3c62', '#3e5282', '#56709e'];
const HSKIN = ['#243444', '#3e5668', '#62808e', '#8eaab2', '#bcd2d6', '#e2f0f0'];
const HAIR = ['#5a6878', '#8494a4', '#b0bcc8', '#d6dee6', '#f2f6fa'];
const H_REST = {
  hipX: 0, hipY: 0, lean: 0.14, head: 0, headY: 0, fFx: 2.5, fFy: 0, fBx: -2.5, fBy: 0,
  hFx: 8, hFy: 5, hBx: 1, hBy: 6, sa: -1.5, cast: 0.2, orbit: 0, hem: 0, hairT: 0, eye: 1, jaw: 0, claw: 0, kneel: 0, field: 0,
};
const hpose = (o = {}) => ({ ...H_REST, ...o });

// Krummer Stab aus Schwarzholz mit Frostkristall-Büschel; gibt die Kristallmitte zurück.
function drawRimeStaff(p, g, hx, hy, a, cast, orbit) {
  const dx = Math.cos(a), dy = Math.sin(a);
  let nx = -dy, ny = dx;
  // Schaft (leicht gewunden)
  for (let s = -13; s <= 9; s += 0.5) {
    const w = Math.sin(s * 0.7) * 0.5;
    const x = hx + dx * s + nx * w, y = hy + dy * s + ny * w;
    p.px(x, y, WOOD[2]); p.px(x - nx * 0.8 - 0.3, y - ny * 0.8, s % 3 < 1 ? WOOD[3] : WOOD[1]);
  }
  // Knauf am Fuß (Eisenkappe)
  p.px(hx - dx * 13, hy - dy * 13, IRON[3]);
  // Klaue oben, die den Kristall hält
  const cx = hx + dx * 12, cy = hy + dy * 12;
  for (const sd of [-1, 1]) {
    p.line(hx + dx * 9 + nx * sd, hy + dy * 9 + ny * sd, cx + nx * sd * 2.2, cy + ny * sd * 2.2, WOOD[3]);
    p.px(cx + nx * sd * 2.2 + dx, cy + ny * sd * 2.2 + dy, WOOD[1]);
  }
  // Kristall-Büschel (3 Spitzen)
  const spikes = [[0, 6, 1.6], [-0.55, 4, 1.1], [0.5, 4.5, 1.2]];
  for (const [off, len, w] of spikes) {
    const sa = a + off, sdx = Math.cos(sa), sdy = Math.sin(sa);
    const snx = -sdy, sny = sdx;
    for (let s = -1; s <= len; s += 0.5) {
      const hw = w * (1 - Math.max(0, s) / (len + 0.5));
      for (let k = -hw; k <= hw; k += 0.5) {
        const x = cx + sdx * s + snx * k, y = cy + sdy * s + sny * k;
        p.px(x, y, k < -hw + 0.6 ? ICE[2] : k > hw - 0.6 ? ICE[5] : ICE[3 + (s > len * 0.6 ? 1 : 0)]);
        if (cast > 0.1) g.px(x, y, cast > 0.7 ? ICE_G[4] : cast > 0.35 ? ICE_G[3] : ICE_G[2]);
      }
    }
  }
  // Aura / Lichthof um den Kristall
  const c0 = { x: cx + dx * 2, y: cy + dy * 2 };
  if (cast > 0.4) {
    const r = 2 + cast * 3;
    for (let i = 0; i < 14; i++) {
      const aa = i / 14 * TAU + orbit;
      const rr = r + (hash2(i, 1, 81) - 0.5) * 1.5;
      g.px(c0.x + Math.cos(aa) * rr, c0.y + Math.sin(aa) * rr, i % 2 ? ICE_G[2] : ICE_G[1]);
    }
    g.px(c0.x, c0.y, ICE_G[5]);
  }
  // kreisende Eissplitter
  for (let i = 0; i < 3; i++) {
    const aa = orbit + i * TAU / 3;
    const ox = c0.x + Math.cos(aa) * (5 + cast * 2), oy = c0.y + Math.sin(aa) * (2.5 + cast);
    const front = Math.sin(aa) > 0;
    p.px(ox, oy, front ? ICE[5] : ICE[3]); p.px(ox, oy - 1, front ? ICE[4] : ICE[2]);
    g.px(ox, oy, front ? ICE_G[4] : ICE_G[2]);
  }
  return c0;
}

function drawWitch(p, g, P, X) {
  const K = P.kneel;
  const PP = { ...P, hipY: P.hipY + K * 5 };
  const R = rig(PP, HD, HAX, HAY);
  const { hip, chest, pt, legF, legB, shF, shB, armF, armB } = R;
  const meta = {};

  // --- Haare hinten (lang, silberweiß, wehen)
  const neck = pt(HD.spine + 1.5, 1);
  const hx = Math.round(neck.x + P.head), hy = Math.round(neck.y - 3 + P.headY);
  for (let i = 0; i < 9; i++) {
    const len = 9 + (hash2(i, 1, 33) * 5 | 0) - K * 3;
    for (let j = 0; j < len; j++) {
      const v = j / len;
      const x = hx - 2 - i * 0.5 - v * 3 + Math.sin(P.hairT + v * 3 + i * 0.7) * 1.2 * v;
      const y = hy - 2 + j + i * 0.25;
      p.px(x, y, v < 0.2 ? HAIR[3] : (i + j) % 4 === 0 ? HAIR[0] : i % 2 ? HAIR[1] : HAIR[2]);
    }
  }
  // --- hinterer Arm (knochige Krallenhand)
  limb(p, shB.x, shB.y, armB.jx, armB.jy, 2.5, 2, [ROBE[0], ROBE[1], ROBE[1], ROBE[2]]);
  limb(p, armB.jx, armB.jy, armB.ex, armB.ey, 2, 1.5, [HSKIN[0], HSKIN[1], HSKIN[1], HSKIN[2]]);
  for (let i = 0; i < 3; i++) p.px(armB.ex + i - 1 + P.claw, armB.ey + 1 + (i === 1 ? 1 : 0), HSKIN[1]);
  if (P.claw > 0.3 || P.cast > 0.6) { // Frostfunken in der Krallenhand
    for (let i = 0; i < 4; i++) { const aa = P.orbit * 1.7 + i * 1.6; g.px(armB.ex + Math.cos(aa) * 2, armB.ey + Math.sin(aa) * 2, i % 2 ? ICE_G[3] : ICE_G[2]); }
    p.px(armB.ex, armB.ey, ICE[4]); g.px(armB.ex, armB.ey, ICE_G[4]);
  }

  // --- Füße (schauen beim Gehen unter dem Saum hervor)
  for (const [L, c] of [[legB, ROBE[0]], [legF, ROBE[1]]]) { p.rect(L.ex - 1, L.ey - 1, 3, 1, c); p.px(L.ex + 1, L.ey - 1, '#2a2430'); }

  // --- Robe: A-Linie von der Brust bis zum Boden, ausgefranster Saum
  const top = pt(HD.spine - 0.5, 0);
  const feetX = HAX + P.hipX + (P.fFx + P.fBx) * 0.3;
  const bottom = HAY - 1 - Math.max(0, (P.fFy + P.fBy) * 0.3);
  const y0 = Math.round(top.y), y1 = Math.round(bottom);
  for (let y = y0; y <= y1; y++) {
    const t = (y - y0) / Math.max(1, y1 - y0);
    const cx = top.x + (feetX - top.x) * t - P.hem * t * t * 2;
    const hw = 3.5 + t * 4.2 + Math.sin(P.hem * 2 + t * 4) * 0.4 * t + K * 2 * t;
    for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
      const u = (x - (cx - hw)) / (2 * hw);
      let c = u < 0.12 ? ROBE[4] : u < 0.4 ? ROBE[3] : u < 0.78 ? ROBE[2] : ROBE[1];
      // Faltenlinien
      if (t > 0.3 && Math.abs(u - 0.33 - Math.sin(P.hem + t * 2) * 0.03) < 0.04) c = ROBE[1];
      if (t > 0.45 && Math.abs(u - 0.66) < 0.035) c = ROBE[0];
      p.px(x, y, c);
    }
  }
  // Saum: ausgefranst, mit Reif (weiß-blau) besetzt
  const hemCx = feetX - P.hem * 2, hemHw = 7.7 + K * 2;
  for (let x = Math.round(hemCx - hemHw); x <= Math.round(hemCx + hemHw); x++) {
    const j = hash2(x - Math.round(hemCx), 3, 35);
    p.px(x, y1 - 1, j < 0.5 ? PELT[3] : PELT[4]);
    p.px(x, y1 - 2, j < 0.3 ? PELT[4] : ROBE[3]);
    if (j > 0.6) p.px(x, y1, PELT[2]);
  }
  // Eisschnörkel-Stickerei (leuchtend) auf der Vorderbahn
  for (let i = 0; i < 4; i++) {
    const t = 0.35 + i * 0.16, y = y0 + (y1 - y0) * t;
    const cx = top.x + (feetX - top.x) * t + 1;
    p.px(cx, y, ICE[3]); p.px(cx + 1, y + 1, ICE[2]);
    g.px(cx, y, ICE_G[1]);
  }
  // Gürtelschnur mit Knochenamuletten
  const bl = pt(3, 0);
  for (let k = -3.5; k <= 3.5; k += 0.5) { const o = pt(3, k); p.px(o.x, o.y, BONE[1]); }
  p.px(bl.x + 2, bl.y + 2, BONE[3]); p.px(bl.x + 2, bl.y + 3, BONE[4]); p.px(bl.x + 1, bl.y + 4, ICE[4]); g.px(bl.x + 1, bl.y + 4, ICE_G[3]);

  // --- Fellstola über den Schultern mit Eiszapfen
  const col = pt(HD.spine, 0);
  p.ellipse(col.x, col.y + 0.5, 4.8, 2.4, PELT[2]);
  p.ellipse(col.x - 0.7, col.y - 0.3, 3.8, 1.5, PELT[4]);
  p.px(col.x - 3, col.y - 1, PELT[5]); p.px(col.x - 1, col.y - 1.5, PELT[5]);
  for (let i = -4; i <= 4; i += 1) p.px(col.x + i, col.y + 2.5 + ((i + 8) % 2), PELT[i % 2 ? 1 : 2]);
  icicle(p, g, col.x - 3, col.y + 3, 3, 1); icicle(p, g, col.x + 2, col.y + 3, 2, 1);

  // --- Kopf: hager, blasse Blauhaut, Hakennase, Eiskrone
  p.ellipse(hx + 0.5, hy, 2.8, 3.2, HSKIN[2]);
  p.ellipse(hx + 1, hy - 0.5, 1.8, 2, HSKIN[3]);
  p.px(hx + 1, hy - 2, HSKIN[4]);
  // eingefallene Wange, Kinn
  p.px(hx + 1, hy + 1, HSKIN[1]); p.px(hx + 2, hy + 2.5, HSKIN[2]); p.px(hx + 3, hy + 2, HSKIN[3]);
  // Hakennase
  p.px(hx + 3, hy - 0.5, HSKIN[3]); p.px(hx + 4, hy + 0.5, HSKIN[3]); p.px(hx + 4, hy + 1, HSKIN[2]);
  // Mund
  p.px(hx + 2, hy + 1.5 + P.jaw, '#1a1020'); if (P.jaw > 0.5) p.px(hx + 3, hy + 1.8, '#1a1020');
  // Augen: tief, eisweiß glühend
  const ex = hx + 2, ey = hy - 1;
  p.px(ex - 1, ey, HSKIN[0]);
  if (P.eye > 0.3) { p.px(ex, ey, ICE[5]); g.px(ex, ey, ICE_G[5]); g.px(ex + 1, ey, ICE_G[2]); g.px(ex - 1, ey, ICE_G[1]); }
  else p.px(ex, ey, HSKIN[0]);
  meta.eye = { x: ex, y: ey };
  meta.mouth = { x: hx + 3, y: hy + 2 };
  // Scheitelhaar (vorn übers Gesicht, Strähnen)
  p.ellipse(hx - 1.2, hy - 2.6, 3, 1.5, HAIR[2]); p.px(hx - 2, hy - 3, HAIR[4]); p.px(hx, hy - 3.5, HAIR[3]); p.px(hx + 2, hy - 2, HSKIN[4]);
  p.px(hx - 2, hy, HAIR[1]); p.px(hx - 2, hy + 1, HAIR[2]); p.px(hx - 1.5, hy + 2, HAIR[1]);
  // Eiskrone: 5 Zacken, mittlere am höchsten
  const crown = [[-2, 3], [-0.5, 4], [1, 6], [2.5, 4], [3.5, 2]];
  for (const [cx, h] of crown) {
    for (let j = 0; j < h; j++) {
      const x = hx + cx - j * 0.15, y = hy - 3.5 - j;
      p.px(x, y, j === h - 1 ? ICE[5] : j > h / 2 ? ICE[4] : ICE[3]);
      g.px(x, y, j === h - 1 ? ICE_G[5] : ICE_G[2]);
    }
  }
  meta.head = { x: hx, y: hy - 10 };

  // --- vorderer Arm + Stab
  const sleeve = () => {
    limb(p, shF.x, shF.y, armF.jx, armF.jy, 3, 3, [ROBE[1], ROBE[2], ROBE[3], ROBE[4]]);
    // weiter Ärmel mit Fellsaum
    limb(p, armF.jx, armF.jy, armF.jx + (armF.ex - armF.jx) * 0.6, armF.jy + (armF.ey - armF.jy) * 0.6, 3, 4, [ROBE[1], ROBE[2], ROBE[3], ROBE[4]]);
    const cu = { x: armF.jx + (armF.ex - armF.jx) * 0.62, y: armF.jy + (armF.ey - armF.jy) * 0.62 };
    p.px(cu.x, cu.y, PELT[4]); p.px(cu.x + 1, cu.y + 1, PELT[3]); p.px(cu.x - 1, cu.y + 1, PELT[3]);
    p.ellipse(shF.x, shF.y, 1.8, 1.4, PELT[3]); p.px(shF.x - 1, shF.y - 1, PELT[5]);
  };
  sleeve();
  if (X.noStaff) { p.rect(armF.ex - 1, armF.ey - 1, 2, 2, HSKIN[2]); return meta; }
  const c = drawRimeStaff(p, g, armF.ex, armF.ey, P.sa, P.cast, P.orbit);
  // Knochenfinger um den Schaft
  p.rect(armF.ex - 1, armF.ey - 1, 2, 2, HSKIN[2]); p.px(armF.ex - 1, armF.ey - 1, HSKIN[4]); p.px(armF.ex + 1, armF.ey, HSKIN[1]);
  meta.hand = c;
  return meta;
}

// Frostfeld am Boden (für die Spezial-Animation 'field').
function frostRing(p, g, cx, cy, r, s) {
  if (s <= 0.02) return;
  const n = Math.ceil(r * 6);
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU;
    const rr = r + (hash2(i, 5, 87) - 0.5) * 1.2;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.38;
    if (hash2(i, 6, 87) > s) continue;
    g.px(x, y, ICE_G[2]); g.px(x, y + 1, ICE_G[1]);
    if (i % 4 === 0) { // Reifzacken
      p.px(x, y, ICE[3]); p.px(x, y - 1, ICE[4]); p.px(x, y - 2, ICE[5]);
      g.px(x, y - 1, ICE_G[4]);
    }
  }
}

function rimeWitchAnims() {
  const mk = (P, X) => makeFrame(HW, HH, HAX, HAY, drawWitch, P, X);
  const idleA = hpose();
  const idleB = hpose({ hipY: 1, lean: 0.17, hFx: 8.5, hFy: 5.5, hBy: 6.5, headY: 0.5, hem: 0.4, cast: 0.35 });
  const idle = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 6, k = (1 - Math.cos(t * TAU)) / 2;
    idle.push(mk({ ...mixP(idleA, idleB, k), orbit: t * TAU, hairT: t * TAU }));
  }
  const walk = [];
  for (let i = 0; i < 8; i++) {
    const ph = (i / 8) * TAU, sn = Math.sin(ph), c = Math.cos(ph);
    walk.push(mk(hpose({
      hipY: -Math.abs(c) * 0.8 + 0.5, lean: 0.2, fFx: 1 + sn * 3.5, fFy: Math.max(0, -c) * 1.5, fBx: -1 - sn * 3.5, fBy: Math.max(0, c) * 1.5,
      hFx: 8.5 + sn * 0.8, hFy: 5, hBx: 1 - sn * 1.5, hBy: 6, sa: -1.45 + sn * 0.05, hem: 0.6 + sn * 0.5, hairT: ph, orbit: ph, head: 0.3,
    })));
  }
  // Beschwören: Stab hoch, Krallenhand zieht Frost zusammen
  const w1 = hpose({ lean: 0.05, hFx: 8, hFy: -2, sa: -1.62, hBx: 5, hBy: 2, claw: 1, cast: 0.6, hem: 0.3, headY: -0.5, jaw: 1 });
  const w2 = hpose({ lean: -0.04, hipX: -1, hFx: 7, hFy: -6, sa: -1.72, hBx: 6, hBy: 0, claw: 1, cast: 1, hem: 0.5, headY: -1, jaw: 1, hairT: 1.5 });
  const windup = track(mk, [[0, idleA], [0.5, w1], [1, w2]], 5, { extras: {} }).map((f, i) => f);
  // Frostbolzen: Stab schnellt nach vorn, Kristall zielt auf den Helden
  const s1 = hpose({ lean: 0.3, hipX: 1, hFx: 11, hFy: -1, sa: -0.55, hBx: -3, hBy: 5, cast: 1.2, hem: -0.6, hairT: 2.5, jaw: 1, orbit: 1 });
  const s2 = hpose({ lean: 0.26, hipX: 1, hFx: 10, hFy: 0, sa: -0.7, hBx: -2, hBy: 6, cast: 0.6, hem: -0.4, hairT: 3.2, orbit: 1.6 });
  const s3 = hpose({ lean: 0.18, hFx: 7, hFy: 3, sa: -1.2, hBx: 0, hBy: 6, cast: 0.3, hem: -0.1, hairT: 4, orbit: 2.2 });
  const strike = [mk(s1, { fx: 'cast' }), mk(s2), mk(s3), mk(mixP(s3, idleA, 0.6))];
  // Frostfeld (Spezial 'cloud'): Stab hoch – und mit dem Fuß in den Schnee gerammt
  const f1 = hpose({ lean: 0, hFx: 7, hFy: -7, sa: -1.57, hBx: 5, hBy: -2, claw: 1, cast: 0.9, jaw: 1, headY: -1, hairT: 1 });
  const f2 = hpose({ lean: 0.34, hipY: 2, hFx: 10, hFy: 4, sa: -1.57, hBx: -3, hBy: 4, claw: 1, cast: 1.3, jaw: 1, hem: -0.5, hairT: 2 });
  const ring = (r, s) => (p, g) => { frostRing(p, g, HAX + 12, HAY - 1, r, s); return {}; };
  const field = [
    ...track(mk, [[0, idleA], [0.6, f1], [1, { ...f1, cast: 1.2, orbit: 2 }]], 5),
    mk(f2, { fx: 'impact', post: ring(5, 1) }),
    mk({ ...f2, cast: 1, orbit: 1 }, { post: ring(9, 0.9) }),
    mk({ ...f2, cast: 0.7, orbit: 2 }, { post: ring(13, 0.7) }),
    mk(mixP(f2, idleA, 0.5), { post: ring(16, 0.4) }),
  ];
  const hurtP = hpose({ lean: -0.15, hipX: -1, head: -1, headY: -0.5, hFx: 7, hFy: 5, sa: -1.25, hBx: -2, hBy: 3, cast: 0, jaw: 1, hem: 0.8, hairT: 2, eye: 1 });
  const hurt = [mk(hurtP), mk(mixP(hurtP, idleA, 0.5))];
  // Tod: sinkt auf die Knie, der Stab entgleitet, kippt rücklings; der Kristall erlischt
  const d1 = hpose({ ...hurtP, lean: -0.22, hipX: -1.5, cast: 0.2 });
  const d2 = hpose({ kneel: 1, lean: 0.2, head: 0.5, headY: 1, hFx: 8, hFy: 7, sa: -1.1, hBx: 3, hBy: 8, cast: 0.1, jaw: 1, hem: 0.2, eye: 0.6, hairT: 3 });
  const d3 = hpose({ kneel: 1, lean: -0.05, head: -0.5, headY: 0, hFx: 4, hFy: 8, hBx: 2, hBy: 8, cast: 0, eye: 0.3, jaw: 1, hairT: 3.5 });
  const lyingStaff = (c) => (p, g) => { drawRimeStaff(p, g, HAX + 10, HAY - 2, -0.05, c, 1); return {}; };
  const piv = [HAX - 3, HAY - 1];
  const death = [
    mk(d1), mk(d2),
    mk(d3, { noStaff: true, post: lyingStaff(0.3), fx: 'impact' }),
    mk(d3, { noStaff: true, rot: [-0.6, ...piv], post: lyingStaff(0.2) }),
    mk({ ...d3, eye: 0 }, { noStaff: true, rot: [-1.3, ...piv], post: lyingStaff(0.1), fx: 'impact' }),
    mk({ ...d3, eye: 0, hairT: 4 }, { noStaff: true, rot: [-1.45, ...piv], post: lyingStaff(0) }),
  ];
  return {
    idle: new Animation(idle, 6),
    walk: new Animation(walk, 9),
    windup: new Animation(windup, 7, false),
    strike: new Animation(strike, 11, false),
    field: new Animation(field, 9, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 8, false),
  };
}

// ================================================================ Export

export function createFrostFoes() {
  return {
    ice_troll: iceTrollAnims(),
    frost_wolf: frostWolfAnims(),
    rime_witch: rimeWitchAnims(),
    snow_stalker: stalkerAnims(),
    ice_troll_chief: chiefAnims(),
  };
}
