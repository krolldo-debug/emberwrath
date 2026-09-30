import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame, SpriteFrame, Animation } from '../gfx/Sprite.js';
import { hash2 } from '../core/math.js';

// Gegner des Aschenwalds: Aschekeiler, Wegelagerer, Bogenschützin,
// Dornenkriecher und Rask, der Brandschatzer (Elite).
//
// Alle Figuren sind kleine Rigs (Hüfte, Rumpf, Kopf, IK-Arme/-Beine bzw.
// parametrische Vierbeiner), deren Schlüsselposen beim Laden weich
// interpoliert werden (wie bonelord.js). Jeder Frame hat eine Leucht-Ebene
// (frame.glow), Metadaten (frame.meta: eye/hand/mouth/head … relativ zum
// Anker) und optional eine Ereignismarke (frame.fx: 'step' | 'impact' | 'roar').
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

const GLOW_EMBER = ['#7a2208', '#c8420c', '#f07a1c', '#ffb640', '#fff0b0'];
const COLD = ['#48526a', '#a3b0c6', '#eef4ff'];
const COLD_G = ['#2d3548', '#6d7a94'];

// ================================================================ Wegelagerer + Bogenschützin

const BW = 60, BH = 42, BAX = 28, BAY = 38;
const BD = { legH: 10, thigh: 5, shin: 6, spine: 7, upper: 4, fore: 4, sh: 1.5, hipW: 1 };
const B_HOOD = ['#191513', '#2a221e', '#3d322b', '#54463b', '#6d5d4d'];
const A_HOOD = ['#131612', '#1f241e', '#2e352b', '#414a3b', '#58614e'];
const PANTS = ['#141117', '#221e26', '#332d36', '#463f47'];
const LEA = [PAL.leather[0], PAL.leather[1], PAL.leather[2], PAL.leather[3], '#86603f'];
const PATCH = ['#2e2e22', '#47472f', '#5e5e3c'];
const SKIN = ['#3e2620', ...PAL.skin, '#d8a482'];
const WOOD = ['#26180e', '#3f2a18', '#5a3e24', '#7a5834', '#96703f'];
const St = PAL.steel, CR = PAL.crimson;

const B_REST = {
  hipX: 0, hipY: 0, lean: 0.06, head: 0, fFx: 3, fFy: 0, fBx: -3, fBy: 0,
  hFx: 4, hFy: 5, hBx: 4, hBy: 4, wa: -0.75, sh: 0, cape: 0.15, capeT: 0,
  bowA: 0.05, draw: 0, arrow: 0, eye: 1,
};
const bpose = (o = {}) => ({ ...B_REST, ...o });

function drawCleaver(p, hx, hy, a) {
  const dx = Math.cos(a), dy = Math.sin(a);
  let nx = -dy, ny = dx; if (nx + ny > 0) { nx = -nx; ny = -ny; }
  // Griff + Knauf
  p.line(hx - dx * 2, hy - dy * 2, hx + dx, hy + dy, LEA[1]);
  p.px(hx - dx * 3, hy - dy * 3, St[2]);
  // Parier-Stummel
  p.px(hx + dx * 1.5 + nx, hy + dy * 1.5 + ny, St[3]); p.px(hx + dx * 1.5 - nx, hy + dy * 1.5 - ny, St[1]);
  // breite, leicht bauchige Klinge (Rücken oben/links, Schneide unten)
  for (let s = 2; s <= 9; s += 0.5) {
    const f = (s - 2) / 7;
    const hw = 1.1 + Math.sin(f * Math.PI * 0.9) * 0.9 - (f > 0.9 ? (f - 0.9) * 8 : 0);
    for (let k = -hw; k <= hw; k += 0.5) {
      const c = k > hw - 0.6 ? St[5] : k < -hw + 0.6 ? St[2] : k > 0 ? St[4] : St[3];
      p.px(hx + dx * s - nx * k, hy + dy * s - ny * k, c);
    }
  }
  p.px(hx + dx * 5 + nx * 0.5, hy + dy * 5 + ny * 0.5, PAL.rust[2]);
  return { x: hx + dx * 9, y: hy + dy * 9 };
}

function drawShield(p, x, y, tilt) {
  // Rundschild schräg von der Seite: Oval mit Eisenrand, hellen Planken,
  // verblasster roter Bemalung und Buckel
  const rx = 2.8 + tilt, ry = 4.4;
  p.ellipse(x, y, rx + 0.7, ry + 0.7, St[2]);
  p.ellipse(x, y, rx, ry, '#8a6a44');
  p.ellipse(x - 0.5, y - 1, rx - 1, ry - 1.5, '#a8845a');
  p.line(x - rx + 0.5, y + 2, x + rx - 0.5, y - 1, CR[2]);
  p.line(x - rx + 0.5, y + 3, x + rx - 0.5, y, CR[1]);
  p.px(x + rx - 0.5, y + 2, '#6a4e32'); p.px(x, y + ry - 0.5, '#6a4e32');
  p.rect(x - 1, y - 1, 2, 2, St[3]); p.px(x - 1, y - 1, St[5]);
  p.px(x - rx - 0.5, y - 2, St[4]); p.px(x - rx + 0.5, y - ry, St[4]);
}

function drawBow(p, hx, hy, a, draw, nock, arrow) {
  // Bogenachse (a = 0 senkrecht), Wurfarme biegen sich zum Schützen hin
  const ax = Math.sin(a), ay = -Math.cos(a), fx = Math.cos(a), fy = Math.sin(a);
  const bend = 0.09 + draw * 0.05;
  const pts = [];
  for (let s = -6.5; s <= 6.5; s += 0.5) {
    const b = -(s * s) * bend * 0.6;
    const x = hx + ax * s + fx * b, y = hy + ay * s + fy * b;
    pts.push([x, y, s]);
    const tip = Math.abs(s) > 5.5;
    p.px(x, y, tip ? PAL.bone[3] : Math.abs(s) < 1.5 ? LEA[1] : WOOD[3]);
    if (!tip && Math.abs(s) > 1) p.px(x + fx, y + fy, WOOD[1]);
  }
  const top = pts[0], bot = pts[pts.length - 1];
  const sx = nock ? nock.x : (top[0] + bot[0]) / 2, sy = nock ? nock.y : (top[1] + bot[1]) / 2;
  p.line(top[0], top[1], sx, sy, '#a8a08c');
  p.line(sx, sy, bot[0], bot[1], '#a8a08c');
  if (arrow && nock) {
    const tx = hx + fx * 3, ty = hy + fy * 3;
    p.line(nock.x, nock.y, tx, ty, WOOD[3]);
    p.px(tx + fx * 0.2, ty, St[5]); p.px(tx + fx, ty + fy, St[4]);
    p.px(nock.x - 1, nock.y - 1, CR[3]); p.px(nock.x - 1, nock.y + 1, CR[2]);
  }
  return { x: hx + fx * 2, y: hy + fy * 2 };
}

function drawBandit(p, g, P, X, archer) {
  const R = rig(P, BD, BAX, BAY);
  const { hip, chest, pt, legF, legB, shF, shB, armF, armB } = R;
  const HOOD = archer ? A_HOOD : B_HOOD;
  const meta = {};

  // --- Umhang hinten (zerschlissen, weht)
  const top = pt(BD.spine, -1.5);
  for (let i = 0; i < 5; i++) {
    const len = 8 + (hash2(i, 3, archer ? 9 : 4) * 3 | 0) - i * 0.4;
    for (let j = 0; j < len; j++) {
      const v = j / len;
      const x = top.x - 1 - i * 0.7 - P.cape * 6 * v * v + Math.sin(P.capeT + v * 3 + i) * 0.8 * v;
      const y = top.y + j + i * 0.2;
      p.px(x, y, HOOD[i === 0 ? 3 : i < 3 ? 2 : 1]);
    }
  }
  // --- Köcher auf dem Rücken
  if (archer) {
    const q0 = pt(2, -3), q1 = pt(BD.spine + 3, -4.5);
    limb(p, q0.x, q0.y, q1.x, q1.y, 3, 3, [LEA[0], LEA[1], LEA[2], LEA[3]]);
    p.px(q0.x + 0.5, q0.y - 3, St[2]);
    for (let k = 0; k < 3; k++) {
      p.px(q1.x - 1 + k, q1.y - 1 - (k % 2), k === 1 ? '#e6dcc0' : CR[3]);
      p.px(q1.x - 1 + k, q1.y - 2 - (k % 2), k === 1 ? '#fffbef' : CR[4]);
    }
  }
  // --- Hinteres Bein
  limb(p, hip.x - 1, hip.y, legB.jx, legB.jy, 3, 2.5, [PANTS[0], PANTS[0], PANTS[1], PANTS[2]]);
  limb(p, legB.jx, legB.jy, legB.ex, legB.ey - 1, 2.5, 2.5, [LEA[0], LEA[0], LEA[1], LEA[2]]);
  p.rect(legB.ex - 1, legB.ey - 1, 3, 1, LEA[0]);
  // --- Hinterer Arm
  limb(p, shB.x, shB.y, armB.jx, armB.jy, 2.5, 2, [LEA[0], LEA[0], LEA[1], LEA[2]]);
  limb(p, armB.jx, armB.jy, armB.ex, armB.ey, 2, 2, [SKIN[0], SKIN[0], SKIN[1], SKIN[1]]);
  p.px(armB.ex, armB.ey, SKIN[1]);

  // --- Rumpf: geflickte Lederrüstung
  const hp = pt(0, 0), cp = pt(BD.spine, 0.3);
  limb(p, hp.x, hp.y, cp.x, cp.y, 5.5, 6, [LEA[1], LEA[2], LEA[3], LEA[4]]);
  // Nähte / Flicken
  const q = (u, k, c) => { const o = pt(u, k); p.px(o.x, o.y, c); };
  q(4, 1.5, PATCH[1]); q(5, 1.5, PATCH[2]); q(4, 0.5, PATCH[1]); q(5, 0.5, PATCH[1]); q(3, 1, LEA[0]); q(6, 1, LEA[0]);
  q(3, -1.5, LEA[1]); q(5, -1.5, LEA[1]);
  q(2, 2.5, LEA[3]);
  // Gürtel mit Schnalle
  for (let k = -3; k <= 3; k += 0.5) q(1.2, k, k > 2 ? PAL.gold[2] : LEA[0]);
  q(1.2, 2.5, PAL.gold[3]); q(1.2, 2, PAL.gold[2]);
  // Beutel am Gürtel
  q(0, -2, LEA[2]); q(-1, -2, LEA[1]); q(-1, -1.5, LEA[1]);
  // Schulterkragen der Kapuze
  const col = pt(BD.spine, 0);
  p.ellipse(col.x, col.y, 3.5, 1.6, HOOD[2]);
  p.rect(col.x - 3, col.y - 1, 4, 1, HOOD[3]);
  p.px(col.x - 3, col.y - 1, HOOD[4]);

  // --- Vorderes Bein
  limb(p, hip.x + 1, hip.y, legF.jx, legF.jy, 3, 2.5, [PANTS[1], PANTS[1], PANTS[2], PANTS[3]]);
  limb(p, legF.jx, legF.jy, legF.ex, legF.ey - 1, 2.5, 2.5, [LEA[1], LEA[1], LEA[2], LEA[3]]);
  p.rect(legF.ex - 1, legF.ey - 1, 4, 1, LEA[1]); p.px(legF.ex + 2, legF.ey - 1, LEA[2]);
  p.px(legF.jx - 0.5, legF.jy - 1, LEA[3]); // Knieschutz
  p.px(legF.jx + 0.5, legF.jy, LEA[2]);

  // --- Schild (hintere Hand, vor dem Körper)
  if (!archer) drawShield(p, armB.ex + 1, armB.ey - 1, P.sh);

  // --- Kopf mit Kapuze und Halstuch
  const neck = pt(BD.spine + 2, 0.5);
  const hx = Math.round(neck.x + P.head), hy = Math.round(neck.y - 3);
  p.ellipse(hx, hy, 3.6, 3.6, HOOD[2]);
  p.ellipse(hx - 0.6, hy - 0.8, 2.6, 2.4, HOOD[3]);
  p.px(hx - 2, hy - 2, HOOD[4]); p.px(hx - 1, hy - 3, HOOD[4]);
  // Kapuzenzipfel hinten
  p.px(hx - 4, hy + 1, HOOD[1]); p.px(hx - 4, hy + 2, HOOD[1]); p.px(hx - 5, hy + 3, HOOD[1]);
  // Gesicht in der Öffnung
  p.rect(hx + 1, hy - 1, 3, 3, SKIN[2]);
  p.rect(hx + 1, hy - 2, 3, 1, HOOD[0]);
  p.px(hx + 1, hy - 1, SKIN[1]); p.px(hx + 1, hy, SKIN[1]);
  p.px(hx + 2, hy - 1, P.eye > 0.5 ? '#1a0e0a' : SKIN[1]);
  p.px(hx + 3, hy - 1, SKIN[3]);
  p.px(hx + 4, hy, SKIN[2]);
  p.px(hx + 3, hy - 2, HOOD[1]);
  meta.eye = { x: hx + 2, y: hy - 1 };
  meta.head = { x: hx, y: hy - 4 };
  // Halstuch über Mund und Nase
  const SC = archer ? ['#1c2a26', '#2a403a', '#3c5a50', '#5a7a6a'] : [CR[1], CR[2], CR[3], CR[4]];
  p.rect(hx, hy + 1, 4, 2, SC[2]); p.px(hx + 4, hy + 1, SC[2]);
  p.px(hx + 1, hy + 1, SC[3]); p.px(hx + 3, hy + 2, SC[1]); p.px(hx, hy + 2, SC[1]);
  // wehende Tuchenden im Nacken
  const tw = Math.sin(P.capeT * 1.3) * 0.8;
  p.px(hx - 3, hy + 3 + tw * 0.5, SC[2]); p.px(hx - 4 - P.cape * 2, hy + 3 + tw, SC[1]); p.px(hx - 5 - P.cape * 3, hy + 4 + tw, SC[1]);

  // --- Vorderer Arm + Waffe
  const drawArm = () => {
    limb(p, shF.x, shF.y, armF.jx, armF.jy, 2.5, 2.2, [LEA[1], LEA[2], LEA[3], LEA[4]]);
    limb(p, armF.jx, armF.jy, armF.ex, armF.ey, 2.2, 2, [SKIN[1], SKIN[1], SKIN[2], SKIN[3]]);
    p.px(armF.jx - 0.5, armF.jy + 0.5, LEA[0]); // Armschiene
    p.rect(armF.ex - 1, armF.ey - 1, 2, 2, SKIN[2]); p.px(armF.ex - 1, armF.ey - 1, SKIN[3]);
  };
  // Schulterpolster
  const shoulderPad = () => { p.ellipse(shF.x, shF.y, 1.8, 1.4, LEA[3]); p.px(shF.x - 1, shF.y - 1, LEA[4]); };
  if (archer) {
    // Sehnenhand = hintere Hand (armB.ex/ey), Bogen in der vorderen Hand
    drawArm(); shoulderPad();
    const nock = P.draw > 0.02 || P.arrow > 0.5 ? { x: armB.ex, y: armB.ey } : null;
    const hand = drawBow(p, armF.ex, armF.ey, P.bowA, P.draw, nock, P.arrow > 0.5);
    p.rect(armF.ex - 1, armF.ey - 1, 2, 2, SKIN[2]); p.px(armF.ex - 1, armF.ey - 1, SKIN[3]);
    // Sehnenhand vor dem Gesicht sichtbar
    if (nock) { p.px(armB.ex, armB.ey, SKIN[2]); p.px(armB.ex - 1, armB.ey, SKIN[1]); }
    meta.hand = hand;
  } else {
    if (X.smear) smearArc(p, g, shF.x, shF.y + 2, X.smear[0], X.smear[1], 6, 14, COLD, COLD_G, 0.5);
    drawArm(); shoulderPad();
    const tip = drawCleaver(p, armF.ex, armF.ey, P.wa);
    p.px(armF.ex, armF.ey, SKIN[3]);
    meta.hand = { x: armF.ex, y: armF.ey };
    meta.tip = tip;
  }
  return meta;
}

function banditAnims(archer) {
  const mk = (P, X) => makeFrame(BW, BH, BAX, BAY, (p, g, PP, XX) => drawBandit(p, g, PP, XX, archer), P, X);
  const idleA = archer ? bpose({ hFx: 5, hFy: 6, hBx: -1, hBy: 7, bowA: 0.45 }) : bpose({ hFx: 6, hFy: 7, wa: -0.55, hBx: 5.5, hBy: 3.5 });
  const idleB = mixP(idleA, { ...idleA, hipY: 1, lean: 0.09, hFy: idleA.hFy + 0.5, hBy: idleA.hBy + 0.5, capeT: Math.PI, head: 0.3, wa: idleA.wa + 0.08 }, 1);
  const idle = track(mk, [[0, idleA], [0.5, idleB], [1, idleA]], 6, { loop: true });

  const walkKeys = [];
  for (let i = 0; i <= 8; i++) {
    const ph = (i / 8) * TAU, s = Math.sin(ph), c = Math.cos(ph);
    walkKeys.push([i / 8, {
      ...idleA, hipY: -Math.abs(c) * 1 + 0.5, lean: 0.12, fFx: 1 + s * 4.5, fFy: Math.max(0, -c) * 2.2,
      fBx: -1 - s * 4.5, fBy: Math.max(0, c) * 2.2, hFx: idleA.hFx - s * 1.5, hBx: idleA.hBx + s * 1.5,
      hFy: idleA.hFy - Math.abs(s) * 0.5, cape: 0.5, capeT: ph, head: 0.5,
    }, linear]);
  }
  const walk = track(mk, walkKeys, 8, { loop: true });

  const hurtP = { ...idleA, lean: -0.22, hipX: -1, head: -1, hFx: 2, hFy: 3, hBx: 1, hBy: 3, eye: 0, cape: -0.2, wa: idleA.wa - 0.5 };

  let windup, strike;
  if (!archer) {
    // Ausholen: Klinge weit hinter die Schulter, Oberkörper verdreht
    const w1 = bpose({ lean: -0.02, hipX: -1, hFx: -2, hFy: 2, wa: -2.4, hBx: 5, hBy: 3, sh: 0.5, fFx: 4, fBx: -4, cape: 0.2 });
    const w2 = bpose({ lean: -0.12, hipX: -1.5, hipY: 1, hFx: -5, hFy: 2, wa: -3.05, hBx: 6, hBy: 2, sh: 1, fFx: 5, fBx: -5, cape: 0.3, capeT: 1 });
    windup = track(mk, [[0, idleA], [0.5, w1], [1, w2]], 4);
    // Hieb: waagerechter Schnitt – die Klinge fegt vor dem Körper (unten) nach vorn
    const s1 = bpose({ lean: 0.16, hipX: 1, hipY: 1, hFx: 3, hFy: 7, wa: 2.1, hBx: 1, hBy: 5, fFx: 6, fBx: -5, cape: 0.6, capeT: 2 });
    const s2 = bpose({ lean: 0.28, hipX: 2, hipY: 1.5, hFx: 9, hFy: 5, wa: 0.15, hBx: -1, hBy: 6, fFx: 6, fBx: -5, cape: 0.8, capeT: 3 });
    const s3 = bpose({ lean: 0.24, hipX: 1.5, hipY: 1, hFx: 7, hFy: 1, wa: -0.75, hBx: 0, hBy: 6, fFx: 6, fBx: -5, cape: 0.5, capeT: 4 });
    const s4 = bpose({ lean: 0.1, hipX: 1, hFx: 6, hFy: 5, wa: -0.4, hBx: 3, hBy: 4, fFx: 5, fBx: -4, cape: 0.2, capeT: 5 });
    strike = [
      mk(s1, { smear: [3.1, 2.0] }),
      mk(s2, { smear: [2.9, 0.15], fx: 'impact' }),
      mk(s3, { smear: [0.9, -0.75] }),
      mk(s4, {}),
    ];
  } else {
    // Pfeil ziehen, auflegen, Sehne spannen, halten
    const n1 = { ...idleA, hBx: -4, hBy: -2, head: -0.3, bowA: 0.2, lean: 0.02 };                 // Griff zum Köcher
    const n2 = { ...idleA, hFx: 7, hFy: 1, hBx: 4, hBy: 1, bowA: 0.05, arrow: 1, draw: 0.1, lean: 0.06 }; // auflegen
    const n3 = { ...idleA, hFx: 9, hFy: 0, hBx: 1, hBy: 0, bowA: 0.02, arrow: 1, draw: 0.6, lean: 0.02, fFx: 4, fBx: -4 };
    const n4 = { ...idleA, hFx: 10, hFy: 0, hBx: -1, hBy: 0, bowA: 0, arrow: 1, draw: 1, lean: -0.02, fFx: 4, fBx: -4, cape: 0.2 };
    windup = [mk(n1), mk(n2), mk(n3), mk(n4)];
    const r1 = { ...n4, hBx: -4, hBy: -1, arrow: 0, draw: 0, lean: -0.06, hipX: -0.5, cape: 0.35, capeT: 1 };
    const r2 = { ...n4, hFx: 8, hBx: -5, hBy: 1, arrow: 0, draw: 0, lean: -0.02, cape: 0.2, capeT: 2 };
    const r3 = { ...idleA, hFx: 7, hFy: 3, hBx: -2, hBy: 5, arrow: 0, bowA: 0.12, capeT: 3 };
    strike = [mk(r1, { fx: 'cast' }), mk(r2), mk(r3)];
  }

  // Tod: getroffen zurücktaumeln, in die Knie, rücklings umkippen
  const d1 = { ...hurtP, lean: -0.3, hipX: -1.5, fFx: 4, fBx: -3 };
  const d2 = { ...d1, hipY: 3, lean: -0.15, fFx: 3, fBx: -2, hFy: 8, hBy: 8, hFx: 3, wa: 1.2, bowA: 0.6 };
  const d3 = { ...d2, hipY: 4, lean: 0.1, head: 1 };
  const piv = [BAX - 3, BAY - 1];
  const death = [
    mk(d1), mk(d2), mk(d3, { rot: [-0.45, ...piv] }), mk(d3, { rot: [-1.05, ...piv] }),
    mk({ ...d3, hipY: 3, lean: 0 }, { rot: [-1.5, piv[0], piv[1] - 0.5], fx: 'impact' }),
    mk({ ...d3, hipY: 3, lean: 0, hFy: 9, hFx: 4 }, { rot: [-Math.PI / 2, piv[0], piv[1] - 0.5] }),
  ];

  return {
    idle: new Animation(idle, 6),
    walk: new Animation(walk, 11),
    windup: new Animation(windup, archer ? 7 : 10, false),
    strike: new Animation(strike, archer ? 10 : 16, false),
    hurt: new Animation([mk(hurtP), mk(mixP(hurtP, idleA, 0.5))], 10, false),
    death: new Animation(death, 9, false),
  };
}


// ================================================================ Aschekeiler

const KW = 54, KH = 36, KAX = 25, KAY = 32;
const FUR = ['#110f11', '#1d191b', '#2b2527', '#3c3436', '#524848', '#6c605e', '#8a7e76'];
const SNOUT = ['#3a2a2a', '#5a4242', '#7a5c56', '#9a7a70'];
const B_ = PAL.bone;
const K_REST = { t: 0, amp: 0, gallop: 0, head: 0, thrust: 0, crouch: 0, paw: 0, lunge: 0, bob: 0, lie: 0, side: 0, eye: 1, ember: 1, pitch: 0 };
const kpose = (o = {}) => ({ ...K_REST, ...o });

function drawBoar(p, g, P) {
  const gy = KAY, ox = KAX - 15 + P.lunge;
  const meta = {};
  const lie = P.lie, side = P.side;
  const by = gy - 12 + P.crouch + P.bob + lie * 5;      // Rumpfmitte
  const pitch = P.pitch;                                  // + = Kopf runter (Galopp)
  const Y = (x, y) => y + (x - 15) * pitch * 0.12;        // Rumpf-Neigung
  const E = GLOW_EMBER;

  // --- Beine: diagonale Paare im Schritt, Paare gemeinsam im Galopp
  const leg = (xh, ph, near, front) => {
    const hipY = Y(xh, by + 3);
    const fold = lie;
    let fx, lift;
    if (side > 0) { // auf der Seite: Beine steif nach vorn
      const ly = gy - 3 - (near ? 0 : 2);
      limb(p, ox + xh, hipY, ox + xh + 7, ly, 3, 2, near ? [FUR[1], FUR[2], FUR[3], FUR[4]] : [FUR[0], FUR[0], FUR[1], FUR[2]]);
      p.rect(ox + xh + 7, ly - 1, 2, 2, '#0a080a');
      return;
    }
    const a = P.t * TAU + ph;
    fx = Math.sin(a) * 3.2 * P.amp; lift = Math.max(0, Math.cos(a)) * 2.4 * P.amp;
    if (front && near && P.paw) { fx = -1 + Math.sin(P.paw * TAU) * 2.5; lift = Math.max(0, Math.cos(P.paw * TAU)) * 2; }
    const footY = gy - lift - fold * 1;
    const footX = ox + xh + fx - (front ? 0 : 1) - fold * (front ? -2 : 2);
    const kx = ox + xh + fx * 0.4 + (front ? 1 : -1.5), ky = (hipY + footY) / 2 + (front ? 0 : -0.5) - fold;
    const ramp = near ? [FUR[1], FUR[2], FUR[3], FUR[4]] : [FUR[0], FUR[0], FUR[1], FUR[2]];
    limb(p, ox + xh, hipY - 1, kx, ky, front ? 4 : 4.5, 3, ramp);
    limb(p, kx, ky, footX, footY - 1, 2.5, 2, ramp);
    p.rect(footX - 1, footY - 1, 3, 1, near ? '#1a1416' : '#0a080a');
    p.px(footX + 1, footY - 1, near ? '#2e2426' : '#141012');
  };
  const walk = P.gallop < 0.5;
  leg(6, walk ? 0 : 0, false, false);
  leg(19, walk ? Math.PI : Math.PI * 0.9, false, true);

  // --- Schwanz
  const tw = Math.sin(P.t * TAU * 2) * P.amp;
  p.px(ox + 1, Y(1, by - 3), FUR[3]); p.px(ox, Y(0, by - 3 + tw), FUR[3]); p.px(ox - 1, Y(0, by - 2 + tw), FUR[2]); p.px(ox - 1, Y(0, by - 1 + tw), FUR[4]);

  // --- Rumpf: Hinterteil, Bauch, gewaltiger Nacken-Buckel
  const flat = 1 - side * 0.25;
  p.ellipse(ox + 7, Y(7, by), 6.5, 5.5 * flat, FUR[2]);
  p.ellipse(ox + 14, Y(14, by), 10, 6 * flat, FUR[2]);
  p.ellipse(ox + 20, Y(20, by - 2), 7, 7.5 * flat, FUR[2]);
  // Licht von oben links
  p.ellipse(ox + 6, Y(6, by - 2), 4.5, 2.5 * flat, FUR[3]);
  p.ellipse(ox + 17, Y(17, by - 5), 6.5, 3 * flat, FUR[3]);
  p.ellipse(ox + 16, Y(16, by - 6), 4, 1.5, FUR[4]);
  // Bauch (dunkel)
  p.ellipse(ox + 13, Y(13, by + 4), 8, 1.6, FUR[1]);
  p.ellipse(ox + 20, Y(20, by + 3.5), 4, 1.6, FUR[1]);
  // Fellstruktur
  for (let i = 0; i < 26; i++) {
    const x = 3 + hash2(i, 1, 41) * 22, y = -5 + hash2(i, 2, 41) * 9;
    p.px(ox + x, Y(x, by + y), hash2(i, 3, 41) < 0.5 ? FUR[1] : FUR[4]);
  }
  // Glutrisse im Fell
  const cracks = [[10, -1, 12, 1], [12, 1, 11, 3], [17, -2, 19, 0], [19, 0, 21, 1], [6, 0, 7, 2]];
  for (const [x0, y0, x1, y1] of cracks) {
    p.line(ox + x0, Y(x0, by + y0), ox + x1, Y(x1, by + y1), P.ember > 0.3 ? E[1] : FUR[1]);
    if (P.ember > 0.3) g.line(ox + x0, Y(x0, by + y0), ox + x1, Y(x1, by + y1), P.ember > 0.8 ? E[2] : E[0]);
  }
  // Borstenkamm entlang des Rückens
  for (let x = 2; x <= 25; x += 1) {
    const top = x < 14 ? -5.5 - (x - 2) * 0.12 : -7 - Math.sin((x - 14) / 11 * Math.PI) * 3.2;
    const h = 2 + (hash2(x, 5, 43) * 2.5 | 0) + (x > 14 && x < 23 ? 1 : 0);
    const lean = -0.5 - hash2(x, 6, 43) * 0.6 - P.amp * 0.4 * P.gallop;
    const y0 = Y(x, by + top * flat + 1);
    p.line(ox + x, y0, ox + x + lean * h, y0 - h, x % 3 === 0 ? FUR[1] : FUR[3]);
    const tipC = x % 4 === 1 ? E[2] : FUR[6];
    p.px(ox + x + lean * h, y0 - h, tipC);
    if (x % 4 === 1 && P.ember > 0.3) g.px(ox + x + lean * h, y0 - h, E[3]);
  }

  // --- vordere Beine (nahe Seite)
  leg(9, walk ? Math.PI : 0.4, true, false);
  leg(22, walk ? 0 : Math.PI * 1.1, true, true);

  // --- Kopf: keilförmig, tief angesetzt
  const hd = P.head, th = P.thrust;
  const hx = ox + 28, hy = Y(28, by) + hd * 3 - th * 3 + lie * 2;
  const up = th * 0.9 - hd * 0.25;                      // Schnauzenwinkel (+ = hoch)
  p.ellipse(hx - 1, hy, 4.5, 4, FUR[2]);
  // Stirnfläche hell, Kiefer dunkel
  p.ellipse(hx - 1, hy - 2, 3.5, 1.6, FUR[4]);
  p.px(hx - 3, hy - 3, FUR[5]); p.px(hx - 2, hy - 3, FUR[5]);
  p.ellipse(hx, hy + 2.5, 3.5, 1.5, FUR[1]);
  // Nackenfalte trennt Kopf und Buckel
  p.line(hx - 5, hy - 3, hx - 5, hy + 3, FUR[1]); p.px(hx - 4, hy - 4, FUR[1]);
  // lange Schnauze
  const sx = hx + 3, sy = hy + 0.5 - up * 2.5;
  limb(p, hx + 1, hy - up, sx + 4, sy, 5, 3.5, [FUR[1], FUR[2], FUR[3], FUR[5]]);
  p.rect(sx + 4, sy - 1.5, 2, 3, SNOUT[1]); p.px(sx + 4, sy - 1.5, SNOUT[3]); p.px(sx + 5, sy - 0.5, SNOUT[0]);
  // Maul + Hauer (krümmen sich nach oben)
  p.line(hx + 1, sy + 1.5, sx + 3, sy + 1.5, '#1a0c0c');
  const tx = sx + 2, ty = sy + 1.5;
  p.px(tx, ty, B_[2]); p.px(tx + 1, ty - 1, B_[3]); p.px(tx + 1, ty - 2, B_[4]);
  p.px(tx + 0, ty - 3, E[4]);
  g.px(tx, ty - 3, E[4]); g.px(tx + 1, ty - 2, E[2]); g.px(tx + 1, ty - 1, E[0]);
  const tx2 = tx, ty2 = ty - 3;
  meta.mouth = { x: sx + 5, y: sy };
  meta.tusk = { x: tx2, y: ty2 };
  // Ohr
  p.line(hx - 3, hy - 3.5, hx - 5, hy - 6.5 - th, FUR[3]); p.px(hx - 4, hy - 4, FUR[4]); p.px(hx - 5, hy - 6 - th, FUR[5]);
  // Auge
  const ex = hx + 1, ey = hy - 1.5;
  p.rect(ex - 1, ey - 1, 3, 2, FUR[0]);
  if (P.eye > 0.2) { p.px(ex, ey, E[4]); p.px(ex + 1, ey, E[2]); g.px(ex, ey, E[4]); g.px(ex + 1, ey, E[2]); g.px(ex - 1, ey, E[0]); }
  else p.px(ex, ey, FUR[0]);
  meta.eye = { x: ex, y: ey };
  meta.head = { x: hx, y: hy - 5 };
  return meta;
}

function boarAnims() {
  const mk = (P, X) => makeFrame(KW, KH, KAX, KAY, drawBoar, P, X);
  const idle = [0, 1, 2, 3].map((i) => mk(kpose({ bob: i === 1 || i === 2 ? 1 : 0, head: i === 2 ? 0.3 : 0, ember: i % 2 ? 1 : 0.6, t: 0.25 })));
  const walk = [];
  for (let i = 0; i < 6; i++) walk.push(mk(kpose({ t: i / 6, amp: 1, bob: i % 3 === 1 ? 1 : 0, head: 0.15 }), { fx: i % 3 === 0 ? 'step' : null }));
  const charge = [];
  for (let i = 0; i < 6; i++) {
    const c = Math.cos(i / 6 * TAU);
    charge.push(mk(kpose({ t: i / 6, amp: 1.5, gallop: 1, head: 1, pitch: 0.4 * c, bob: c > 0.3 ? 1 : c < -0.3 ? -1 : 0, crouch: 0.5 }), { fx: i === 0 || i === 3 ? 'step' : null }));
  }
  // Ausholen: Kopf runter, scharrt mit dem Huf
  const windup = [
    mk(kpose({ head: 0.6, crouch: 0.5 })),
    mk(kpose({ head: 1, crouch: 1, paw: 0.25 })),
    mk(kpose({ head: 1, crouch: 1, paw: 0.6 })),
    mk(kpose({ head: 1.1, crouch: 1.5, paw: 0.95, lunge: -1 }), { fx: 'step' }),
  ];
  // Stoß: nach vorn schnellen, Hauer nach oben reißen
  const strike = [
    mk(kpose({ head: 0.6, lunge: 2, crouch: 0.5, t: 0.25, amp: 1.2, gallop: 1 })),
    mk(kpose({ head: -0.2, thrust: 1, lunge: 4, pitch: -0.3, t: 0.4, amp: 1, gallop: 1 }), { fx: 'impact' }),
    mk(kpose({ head: -0.1, thrust: 0.7, lunge: 3, pitch: -0.15 })),
    mk(kpose({ head: 0.2, thrust: 0.1, lunge: 1 })),
  ];
  const hurt = [mk(kpose({ head: -0.3, lunge: -1.5, crouch: 1, pitch: -0.2, eye: 1, ember: 1 })), mk(kpose({ head: 0.1, lunge: -0.5, crouch: 0.5 }))];
  const death = [
    mk(kpose({ head: -0.4, lunge: -1.5, crouch: 1, pitch: -0.2 })),
    mk(kpose({ head: 0.8, crouch: 2, lie: 0.3, ember: 0.8 })),
    mk(kpose({ head: 1.2, lie: 0.6, ember: 0.6, eye: 0.5 })),
    mk(kpose({ head: 1.4, lie: 0.9, ember: 0.5, eye: 0.3 }), { fx: 'impact' }),
    mk(kpose({ head: 1.2, lie: 1, side: 1, ember: 0.35, eye: 0 })),
    mk(kpose({ head: 1.2, lie: 1, side: 1, ember: 0, eye: 0 })),
  ];
  return {
    idle: new Animation(idle, 5),
    walk: new Animation(walk, 10),
    charge: new Animation(charge, 14),
    windup: new Animation(windup, 7, false),
    strike: new Animation(strike, 14, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 8, false),
  };
}


// ================================================================ Dornenkriecher

const CW = 60, CH = 36, CAX = 22, CAY = 32;
const BARK = ['#120e0e', '#201815', '#30251d', '#433428', '#5a4735', '#735e46'];
const THORN = ['#3a3024', '#6a5c44', '#a0906a', '#d0c49a'];
const SAP = ['#2e3a06', '#5a7a10', '#96c41c', '#d4f850', '#f6ffc0'];
const C_REST = { t: 0, amp: 0, bob: 0, crouch: 0, ta: -1.95, tc: 0.24, tl: 9, sway: 0, jaw: 0, lunge: 0, dead: 0, sap: 1, curl: 0 };
const cpose = (o = {}) => ({ ...C_REST, ...o });

// Dornenranke als Gliederkette: Winkel ta am Ansatz, Krümmung tc je Glied.
function vine(p, g, x, y, ta, tc, n, sway, sap, seg = 1.7) {
  const pts = [[x, y]];
  let a = ta;
  for (let i = 0; i < n; i++) {
    a += tc + Math.sin(sway + i * 0.7) * 0.05;
    x += Math.cos(a) * seg; y += Math.sin(a) * seg;
    pts.push([x, y]);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const f = i / (pts.length - 1);
    const w = 3.5 - f * 2.4;
    limb(p, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, Math.max(1, w - 0.2), [BARK[1], BARK[2], BARK[3], BARK[4]]);
  }
  for (let i = 1; i < pts.length - 1; i += 2) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
    const side = i % 4 === 1 ? 1 : -1;
    const nx = -dy / l * side, ny = dx / l * side;
    p.px(x0 + nx * 1.6, y0 + ny * 1.6, THORN[2]); p.px(x0 + nx * 2.4 + dx / l * 0.6, y0 + ny * 2.4 + dy / l * 0.6, THORN[3]);
  }
  // Giftknospe an der Spitze
  const [tx, ty] = pts[pts.length - 1];
  p.px(tx, ty, SAP[3]); p.px(tx - 0.8, ty, SAP[2]);
  if (sap > 0.2) { g.px(tx, ty, SAP[4]); g.px(tx + 1, ty, SAP[2]); g.px(tx, ty + 1, SAP[1]); g.px(tx - 1, ty, SAP[1]); }
  return pts;
}

function drawCrawler(p, g, P, X) {
  const gy = CAY, ox = CAX - 11 + P.lunge;
  const meta = {};
  const dead = P.dead;
  const top = gy - 10 + P.crouch + P.bob + dead * 3;

  // --- Wurzelbeine (hintere Seite)
  const legs = (near) => {
    for (let i = 0; i < 3; i++) {
      const bx = ox + 5 + i * 6 + (near ? 1 : -1);
      const ph = P.t * TAU + (i % 2 ? Math.PI : 0) + (near ? Math.PI : 0);
      const sw = Math.sin(ph) * 2 * P.amp, lift = Math.max(0, Math.cos(ph)) * 1.5 * P.amp;
      const ky = top + 3 - (near ? 0 : 1);
      const kx = bx + 2 + sw * 0.5;
      let fx = bx + 3 + sw, fy = gy - lift - (near ? 0 : 1);
      if (dead > 0.5 || P.curl) { fx = bx + 1 + (near ? 1 : 0); fy = top + 5 - P.curl * 2; }
      const col = near ? [BARK[2], BARK[3]] : [BARK[0], BARK[1]];
      p.line(bx, top + 5, kx, ky, col[1]);
      p.line(kx, ky, fx, fy, col[0]);
      p.px(fx + 1, fy, col[0]);
    }
  };
  legs(false);

  // --- Schwanzranke hinten, am Boden schleifend
  const tailPts = [[ox + 1, top + 6], [ox - 2, top + 7], [ox - 5, gy - 2 + Math.sin(P.t * TAU) * 0.5], [ox - 8, gy - 1]];
  for (let i = 0; i < 3; i++) limb(p, tailPts[i][0], tailPts[i][1], tailPts[i + 1][0], tailPts[i + 1][1], 2.5 - i * 0.6, 2 - i * 0.6, [BARK[1], BARK[1], BARK[2], BARK[3]]);
  p.px(ox - 4, gy - 3, THORN[2]); p.px(ox - 7, gy - 2, THORN[1]);

  // --- Rumpf: Borkenpanzer in Platten
  const cx = ox + 11, cy = top + 4;
  p.ellipse(cx, cy + 1, 11, 4.5 - dead * 0.5, BARK[1]);
  p.ellipse(cx - 0.5, cy, 10, 4 - dead * 0.5, BARK[2]);
  // Platten (3 Segmente) mit hellen Oberkanten
  const plates = [[cx - 6, 4.5], [cx, 5], [cx + 6, 4]];
  plates.forEach(([px_, r], i) => {
    p.ellipse(px_, cy - 1, r, 3, BARK[3]);
    p.ellipse(px_ - 1, cy - 2, r - 1.5, 1.5, BARK[4]);
    p.px(px_ - r + 1.5, cy - 3, BARK[5]);
    // Rindenfurchen
    p.px(px_ + 1, cy, BARK[2]); p.px(px_ - 1, cy + 1, BARK[1]);
  });
  // leuchtender Saft in den Fugen
  const sapOn = P.sap > 0.2;
  for (const sx of [cx - 3, cx + 3]) {
    for (let k = -2; k <= 2; k++) {
      const x = sx + (k & 1 ? 0.5 : 0), y = cy - 1 + k;
      p.px(x, y, sapOn ? SAP[2] : BARK[1]);
      if (sapOn) g.px(x, y, P.sap > 0.8 ? SAP[3] : SAP[1]);
    }
  }
  // Dornen auf dem Rücken
  const spikes = [[-8, 3, -0.5], [-5, 4, -0.3], [-2, 3, 0], [1, 5, 0.2], [4, 3, 0.1], [7, 4, 0.4]];
  for (const [dx, h, l] of spikes) {
    const bx = cx + dx, by = cy - 3 - Math.cos(dx / 11 * 1.4) * 1;
    p.line(bx, by, bx + l * h - 1, by - h * (1 - dead * 0.4), THORN[1]);
    p.px(bx + l * h - 1, by - h * (1 - dead * 0.4), THORN[3]);
    p.px(bx, by, THORN[0]);
  }
  // Saftperlen, die heraustropfen
  if (sapOn) { p.px(cx + 4, cy + 4, SAP[2]); g.px(cx + 4, cy + 4, SAP[3]); p.px(cx - 5, cy + 4 + (P.bob ? 1 : 0), SAP[1]); g.px(cx - 5, cy + 4 + (P.bob ? 1 : 0), SAP[2]); }

  // --- Kopf mit Zangen
  const hx = ox + 22, hy = cy + 1 + dead;
  p.ellipse(hx, hy, 3.5, 3, BARK[2]);
  p.ellipse(hx - 0.5, hy - 1, 2.5, 1.5, BARK[3]);
  p.px(hx - 1, hy - 2, BARK[5]);
  const j = P.jaw;
  // obere und untere Dornzange
  p.line(hx + 2, hy - 1, hx + 5, hy - 2 - j, THORN[1]); p.px(hx + 5, hy - 1 - j, THORN[3]); p.px(hx + 6, hy - 1 - j, THORN[2]);
  p.line(hx + 2, hy + 2, hx + 5, hy + 3 + j, THORN[1]); p.px(hx + 5, hy + 2 + j, THORN[3]); p.px(hx + 6, hy + 2 + j, THORN[2]);
  // Giftmaul
  p.rect(hx + 2, hy, 2, 1 + j, sapOn ? SAP[2] : BARK[0]);
  if (sapOn) { g.rect(hx + 2, hy, 2, 1 + j, SAP[3]); g.px(hx + 4, hy + j * 0.5, SAP[2]); }
  // Augenpunkte
  const eyeOn = P.sap > 0.1;
  for (const [ex, ey] of [[hx + 1, hy - 2], [hx - 1, hy - 1]]) {
    p.px(ex, ey, eyeOn ? SAP[3] : BARK[0]);
    if (eyeOn) g.px(ex, ey, SAP[4]);
  }
  meta.eye = { x: hx + 1, y: hy - 2 };
  meta.mouth = { x: hx + 4, y: hy };
  meta.head = { x: hx, y: hy - 4 };

  // --- vordere Beine
  legs(true);

  // --- Peitschenranke (wurzelt oben auf dem Panzer)
  if (X.smear) smearArc(p, g, ox + 7, top - 1, X.smear[0], X.smear[1], 15, 23, [BARK[3], THORN[2], SAP[3]], [SAP[0], SAP[2]], 1);
  const pts = vine(p, g, ox + 7, top - 1, P.ta, P.tc, Math.round(P.tl), P.sway, P.sap);
  const tip = pts[pts.length - 1];
  meta.tip = { x: tip[0], y: tip[1] };
  return meta;
}

function crawlerAnims() {
  const mk = (P, X) => makeFrame(CW, CH, CAX, CAY, drawCrawler, P, X);
  const idle = [0, 1, 2, 3, 4, 5].map((i) => mk(cpose({ sway: i / 6 * TAU, ta: -1.95 + Math.sin(i / 6 * TAU) * 0.08, bob: i === 2 || i === 3 ? 1 : 0, sap: i % 3 === 0 ? 1 : 0.6 })));
  const walk = [0, 1, 2, 3, 4, 5].map((i) => mk(cpose({ t: i / 6, amp: 1, sway: i / 6 * TAU, bob: i % 3 === 1 ? 1 : 0, ta: -1.85, tc: 0.22 })));
  const windup = [
    mk(cpose({ ta: -2.2, tc: 0.18, tl: 10, crouch: 0.5, jaw: 1 })),
    mk(cpose({ ta: -2.5, tc: 0.1, tl: 11, crouch: 1, jaw: 1, sap: 1 })),
    mk(cpose({ ta: -2.7, tc: 0.06, tl: 11, crouch: 1.5, jaw: 2, lunge: -1 })),
  ];
  const strike = [
    mk(cpose({ ta: -2.0, tc: 0.12, tl: 16, crouch: 0.5, jaw: 2, lunge: 1 })),
    mk(cpose({ ta: -1.3, tc: 0.14, tl: 20, crouch: 1, jaw: 2, lunge: 2 }), { smear: [-1.3, 0.17], fx: 'impact' }),
    mk(cpose({ ta: -1.1, tc: 0.13, tl: 19, crouch: 0.5, jaw: 1, lunge: 1.5 })),
    mk(cpose({ ta: -1.7, tc: 0.2, tl: 13, jaw: 0, lunge: 0.5 })),
  ];
  const hurt = [mk(cpose({ ta: -2.3, tc: 0.35, crouch: 1.5, lunge: -1.5, jaw: 2, sap: 1 })), mk(cpose({ ta: -2.1, tc: 0.3, crouch: 0.5, lunge: -0.5 }))];
  const death = [
    mk(cpose({ ta: -2.4, tc: 0.4, crouch: 1.5, lunge: -1.5, jaw: 2 })),
    mk(cpose({ ta: -1.6, tc: 0.15, tl: 10, crouch: 1, jaw: 1, curl: 0.5, dead: 0.3, sap: 0.9 })),
    mk(cpose({ ta: -0.6, tc: 0.12, tl: 10, dead: 0.6, curl: 1, sap: 0.7 })),
    mk(cpose({ ta: 0.1, tc: 0.05, tl: 10, dead: 1, curl: 1, sap: 0.5 }), { fx: 'impact' }),
    mk(cpose({ ta: 0.25, tc: 0.02, tl: 10, dead: 1, curl: 1.2, sap: 0.25 })),
    mk(cpose({ ta: 0.25, tc: 0.02, tl: 10, dead: 1, curl: 1.2, sap: 0 })),
  ];
  return {
    idle: new Animation(idle, 6),
    walk: new Animation(walk, 8),
    windup: new Animation(windup, 7, false),
    strike: new Animation(strike, 14, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 8, false),
  };
}


// ================================================================ Rask, der Brandschatzer (Elite)

const RW = 104, RH = 76, RAX = 48, RAY = 70;
const RD = { legH: 14, thigh: 7.5, shin: 8, spine: 11, upper: 6, fore: 6.5, sh: 1.5, hipW: 2 };
const R_SKIN = ['#3a2218', '#6a4030', '#9a6448', '#c08a68', '#dcaa86'];
const R_FUR = ['#1a1512', '#2a221d', '#3d332b', '#54483d', '#6f6255', '#8f8274'];
const R_BEARD = ['#3a1206', '#6a220c', '#983614', '#c4561e', '#e27a30'];
const IRON = ['#13151c', '#232834', '#383f4e', '#555f75', '#8591aa', '#c4cede'];
const HORN = PAL.bone;
const R_LEA = ['#1a100c', '#2c1c14', '#442c1e', '#5e3f2a', '#7a5638'];
const R_REST = {
  hipX: 0, hipY: 0, lean: 0.08, head: 0, fFx: 6, fFy: 0, fBx: -6, fBy: 0,
  hFx: 9, hFy: 6, hBx: 4, hBy: 8, axe: -1.05, grip: 1, cape: 0.15, capeT: 0,
  jaw: 0, fire: 1, eye: 1, kneel: 0, spin: -1, fl: 0, held: 1,
};
const rpose = (o = {}) => ({ ...R_REST, ...o });

// Brennende Zweihandaxt. dir-Winkel a, Verkürzung ls (Wirbelwind), Flammenphase fl.
function drawAxe(p, g, hx, hy, a, ls, fl, fire, E = GLOW_EMBER) {
  const dx = Math.cos(a) * ls, dy = Math.sin(a) * ls;
  const nx = -Math.sin(a), ny = Math.cos(a);   // Schneidenseite (Schwungrichtung)
  // Stiel: Holz mit Lederwicklung und Eisenknauf
  const W_ = [WOOD[0], WOOD[1], WOOD[2], WOOD[3]];
  limb(p, hx - dx * 8, hy - dy * 8, hx + dx * 18, hy + dy * 18, 2, 2, W_);
  for (let s = -3; s <= 3; s += 2) p.px(hx + dx * s, hy + dy * s, R_LEA[3]);
  p.ellipse(hx - dx * 9, hy - dy * 9, 1.2, 1.2, IRON[3]);
  // Axtkopf: Tülle, Halbmond-Blatt, Rückendorn
  const cx = hx + dx * 15, cy = hy + dy * 15;
  for (let s = -5.5; s <= 5.5; s += 0.5) {
    const f = s / 5.5;
    const w = 3 + 5 * (1 - f * f) * 0.35 + (Math.abs(f) > 0.7 ? (Math.abs(f) - 0.7) * 8 : 0);
    const reach = Math.min(8, w + 1.5);
    for (let k = 0.5; k <= reach; k += 0.5) {
      const edge = k > reach - 1.2;
      const x = cx + dx * s * 0.8 + nx * k, y = cy + dy * s * 0.8 + ny * k;
      let c = edge ? (fire > 0.3 ? E[3] : IRON[5]) : k < 2 ? IRON[1] : (s < 0 ? IRON[3] : IRON[2]);
      if (!edge && k > 2 && hash2(Math.round(s * 2), Math.round(k * 2), 77) < 0.12) c = PAL.rust[2];
      if (!edge && k > reach - 2.2) c = fire > 0.3 ? E[1] : IRON[4];
      p.px(x, y, c);
      if (edge && fire > 0.3) g.px(x, y, E[4]);
      else if (k > reach - 2.2 && fire > 0.3) g.px(x, y, E[2]);
    }
  }
  // Glutrune im Blatt
  p.px(cx + nx * 3.5, cy + ny * 3.5, fire > 0.3 ? E[2] : IRON[1]);
  if (fire > 0.3) { g.px(cx + nx * 3.5, cy + ny * 3.5, E[3]); g.px(cx + nx * 4.5 + dx * 0.8, cy + ny * 4.5 + dy * 0.8, E[1]); }
  limb(p, cx - nx * 0.5 - dx * 3, cy - ny * 0.5 - dy * 3, cx - nx * 0.5 + dx * 3, cy - ny * 0.5 + dy * 3, 3, 3, [IRON[1], IRON[2], IRON[3], IRON[4]]);
  // Rückendorn
  p.line(cx - nx * 1.5, cy - ny * 1.5, cx - nx * 4.5 + dx * 0.8, cy - ny * 4.5 + dy * 0.8, IRON[3]);
  p.px(cx - nx * 4.5 + dx * 0.8, cy - ny * 4.5 + dy * 0.8, IRON[5]);
  // Flammen, die vom Blatt aufsteigen (Glut auf beiden Ebenen, Kern auf der Leucht-Ebene)
  if (fire > 0.3) {
    for (let i = 0; i < 9; i++) {
      const s = -4.5 + i * 1.1;
      const bx = cx + dx * s * 0.8 + nx * (6 + (1 - (s / 5) ** 2)), by = cy + dy * s * 0.8 + ny * (6 + (1 - (s / 5) ** 2));
      const h = (2 + ((hash2(i, 1, 55) * 4 + fl * 3 + i) % 4)) * fire;
      for (let j = 0; j < h; j++) {
        const x = bx + Math.sin(fl * 2 + i + j * 0.9) * 0.6, y = by - j - 1;
        const t = j / h;
        if (t < 0.5) p.px(x, y, E[t < 0.25 ? 4 : 3]);
        g.px(x, y, E[t < 0.3 ? 4 : t < 0.6 ? 3 : 2]);
      }
    }
  }
  return { head: { x: cx + nx * 4, y: cy + ny * 4 }, edge: { x: cx + nx * 7.5, y: cy + ny * 7.5 } };
}

function drawRask(p, g, P, X) {
  const K = P.kneel;
  const PP = { ...P, hipY: P.hipY + K * 6 };
  const R = rig(PP, RD, RAX, RAY);
  const { hip, chest, pt, legF, legB, shF, shB } = R;
  const meta = {};
  const E = GLOW_EMBER;
  if (K > 0.01) { // hinteres Knie am Boden
    const kx = hip.x - 3 - K * 3, ky = RAY - 1;
    legB.jx += (kx - legB.jx) * K; legB.jy += (ky - legB.jy) * K;
    legB.ex += (kx - 8 - legB.ex) * K; legB.ey += (RAY - legB.ey) * K;
  }
  // Hände: zweihändig am Stiel
  const hF = { x: chest.x + P.hFx, y: chest.y + P.hFy };
  const spinning = P.spin >= 0;
  let axeA = P.axe, axeLS = 1;
  if (spinning) {
    const ph = P.spin * TAU;
    const vx = Math.cos(ph), vy = Math.sin(ph) * 0.38;
    axeA = Math.atan2(vy, vx); axeLS = Math.max(0.35, Math.hypot(vx, vy));
    hF.x = chest.x + vx * 7; hF.y = chest.y + 4 + vy * 7;
  }
  const hB = P.grip > 0.5
    ? { x: hF.x - Math.cos(axeA) * 5 * axeLS, y: hF.y - Math.sin(axeA) * 5 * axeLS }
    : { x: chest.x + P.hBx, y: chest.y + P.hBy };
  const armF = ik(shF.x, shF.y, hF.x, hF.y, RD.upper, RD.fore, 1);
  const armB = ik(shB.x, shB.y, hB.x, hB.y, RD.upper, RD.fore, 1);
  const axeBehind = spinning ? Math.sin(P.spin * TAU) < 0 : !!X.axeBehind;

  // --- 1. Pelzmantel hinten
  const mt = pt(RD.spine + 1, -2);
  for (let i = 0; i < 12; i++) {
    const u = i / 11;
    const len = 17 - K * 5 + (hash2(i, 2, 21) * 4 | 0) - u * 3;
    for (let j = 0; j < len; j++) {
      const v = j / len;
      const x = mt.x - 4 - i * 0.55 - P.cape * 12 * v * v + Math.sin(P.capeT + v * 3 + i * 0.6) * 1.1 * v;
      const y = mt.y - 1 + j + i * 0.15;
      const c = i < 2 ? R_FUR[3] : (i + j) % 5 === 0 ? R_FUR[0] : i % 3 === 0 ? R_FUR[1] : R_FUR[2];
      p.px(x, y, c);
    }
  }
  // --- Axt hinter dem Körper (Wirbelwind-Rückseite / Ausholen)
  let axeInfo = null;
  const smearAxe = () => {
    if (!X.smear) return;
    const [a0, a1, sy] = X.smear;
    smearArc(p, g, X.smearC ? X.smearC.x + chest.x : hF.x, X.smearC ? X.smearC.y + chest.y : hF.y, a0, a1, 10, 24, [E[1], E[3], E[5]], [E[2], E[4]], sy ?? 1);
  };
  if (axeBehind && P.held > 0.5) { smearAxe(); axeInfo = drawAxe(p, g, hF.x, hF.y, axeA, axeLS, P.fl, P.fire); }

  // --- 2. hinteres Bein
  limb(p, hip.x - 2, hip.y, legB.jx, legB.jy, 4.5, 4, [R_LEA[0], R_LEA[0], R_LEA[1], R_LEA[2]]);
  limb(p, legB.jx, legB.jy, legB.ex, legB.ey - 2, 4.5, 4.5, [R_FUR[0], R_FUR[1], R_FUR[2], R_FUR[3]]);
  p.rect(legB.ex - 2, legB.ey - 2, 6, 2, R_LEA[1]); p.rect(legB.ex - 2, legB.ey - 2, 6, 1, R_LEA[2]);
  // --- 3. hinterer Arm
  limb(p, shB.x, shB.y, armB.jx, armB.jy, 4, 3.5, [R_SKIN[0], R_SKIN[0], R_SKIN[1], R_SKIN[2]]);
  limb(p, armB.jx, armB.jy, armB.ex, armB.ey, 4, 3.5, [R_LEA[0], R_LEA[1], R_LEA[2], R_LEA[3]]);
  p.ellipse(armB.ex, armB.ey, 1.6, 1.6, R_SKIN[1]);

  // --- 4. Rumpf: nackte Brust, Lederharnisch, Gürtel, Lederschurz
  const hp = pt(0, 0.5), cp = pt(RD.spine, 1);
  // Lederschurz-Streifen
  for (let i = 0; i < 5; i++) {
    const a = pt(-0.5, -4 + i * 2.2);
    const sw = Math.sin(P.capeT + i) * 0.6 + P.lean * 3;
    p.rect(a.x + sw * 0.3, a.y, 2, 6 - Math.abs(i - 2) * 0.7, R_LEA[i % 2 ? 2 : 3]);
    p.px(a.x + sw * 0.3, a.y, R_LEA[4]);
    p.px(a.x + sw * 0.3 + 1, a.y + 4, IRON[3]);
  }
  limb(p, hp.x, hp.y, cp.x, cp.y, 11, 13, [R_SKIN[1], R_SKIN[2], R_SKIN[3], R_SKIN[4]]);
  // Bauch-/Brustmuskeln
  const q = (u, k, c) => { const o = pt(u, k); p.px(o.x, o.y, c); };
  q(5, 1.5, R_SKIN[1]); q(5, 3, R_SKIN[1]); q(3, 2.2, R_SKIN[1]); q(7.5, 0.5, R_SKIN[2]); q(8, 3.5, R_SKIN[1]);
  q(8.5, 2, R_SKIN[4]); q(6, 4, R_SKIN[3]);
  // Narbe
  q(6, 2.5, '#8a4a3a'); q(7, 3, '#8a4a3a'); q(5, 2, '#8a4a3a');
  // Kreuzgurt über der Brust
  for (let u = 1; u <= 9; u += 0.5) q(u, -3 + (u - 1) * 0.8, R_LEA[2]);
  for (let u = 1.5; u <= 9; u += 1.5) q(u, -3 + (u - 1) * 0.8 - 0.5, R_LEA[3]);
  q(5, 0.2, IRON[4]);
  // Gürtel mit Schädelschnalle
  for (let k = -5; k <= 5; k += 0.5) { q(1, k, R_LEA[1]); q(1.8, k, R_LEA[2]); }
  const bk = pt(1.4, 3.5);
  p.rect(bk.x - 1, bk.y - 1.5, 3, 3, HORN[3]); p.px(bk.x - 1, bk.y - 1.5, HORN[4]); p.px(bk.x - 0.5, bk.y - 0.5, '#1a0c0c'); p.px(bk.x + 1, bk.y - 0.5, '#1a0c0c');

  // --- 5. vorderes Bein
  limb(p, hip.x + 2, hip.y, legF.jx, legF.jy, 5, 4.5, [R_LEA[1], R_LEA[2], R_LEA[3], R_LEA[4]]);
  limb(p, legF.jx, legF.jy, legF.ex, legF.ey - 2, 5, 5, [R_FUR[2], R_FUR[3], R_FUR[4], R_FUR[5]]);
  for (let j = 0; j < 3; j++) p.px(legF.jx + (j - 1) * 1.5, legF.jy + 1 + (j & 1), R_FUR[5]);
  p.rect(legF.ex - 2, legF.ey - 2, 7, 2, R_LEA[2]); p.rect(legF.ex - 2, legF.ey - 2, 7, 1, R_LEA[3]);
  p.line(legF.jx - 1, legF.jy + 3, legF.jx + 2, legF.jy + 3, R_LEA[1]); // Riemen

  // --- 6. Pelzkragen über den Schultern
  const col = pt(RD.spine - 0.5, -0.5);
  p.ellipse(col.x, col.y, 7, 3.5, R_FUR[2]);
  p.ellipse(col.x - 1, col.y - 1, 5.5, 2.2, R_FUR[3]);
  for (let i = -6; i <= 6; i += 1.5) {
    const x = col.x + i, y = col.y + 2.5 + (hash2(i * 2 | 0, 3, 23) * 2 | 0);
    p.px(x, y, R_FUR[2]); p.px(x, y + 1, R_FUR[1]);
    p.px(col.x + i * 0.8, col.y - 2 - (Math.abs(i) < 3 ? 1 : 0), R_FUR[4]);
  }
  p.px(col.x - 4, col.y - 2, R_FUR[5]); p.px(col.x - 2, col.y - 3, R_FUR[5]);

  // Schulterpanzer mit Dorn
  const pauldron = () => {
    p.ellipse(shF.x, shF.y, 3.5, 2.8, IRON[2]); p.ellipse(shF.x - 0.5, shF.y - 0.8, 2.5, 1.6, IRON[3]);
    p.px(shF.x - 2, shF.y - 1.5, IRON[5]);
    p.line(shF.x, shF.y - 2, shF.x - 1, shF.y - 5, IRON[3]); p.px(shF.x - 1, shF.y - 5, IRON[5]);
  };
  pauldron();

  // --- 7. Kopf: Hörnerhelm, Glutaugen, geflochtener roter Bart
  const neck = pt(RD.spine + 2, 1);
  const hx = Math.round(neck.x + P.head), hy = Math.round(neck.y - 5);
  // Bart (unter dem Helm, fällt auf die Brust)
  const jaw = Math.round(P.jaw * 2);
  p.ellipse(hx + 2, hy + 3 + jaw, 3.5, 3, R_BEARD[2]);
  p.ellipse(hx + 1.5, hy + 2.5 + jaw, 2.5, 2, R_BEARD[3]);
  // zwei Zöpfe
  for (let j = 0; j < 5; j++) {
    const sw = Math.sin(P.capeT + j * 0.5) * 0.4;
    p.px(hx + 1 + sw - P.lean * j, hy + 5 + jaw + j, j % 2 ? R_BEARD[1] : R_BEARD[3]);
    p.px(hx + 4 + sw - P.lean * j, hy + 5 + jaw + j * 0.8, j % 2 ? R_BEARD[2] : R_BEARD[4]);
  }
  p.px(hx + 1 - P.lean * 5, hy + 10 + jaw, PAL.gold[3]); p.px(hx + 4 - P.lean * 4, hy + 9 + jaw, PAL.gold[3]);
  // Gesicht
  p.rect(hx, hy - 1, 5, 4, R_SKIN[2]);
  p.px(hx + 4, hy + 1, R_SKIN[3]); p.px(hx + 5, hy, R_SKIN[2]); // Nase
  p.rect(hx, hy - 1, 5, 1, R_SKIN[0]); // Schatten unter dem Helm
  if (jaw) { p.rect(hx + 2, hy + 2, 3, jaw, '#2a0808'); p.px(hx + 3, hy + 2, HORN[3]); }
  p.rect(hx + 1, hy + 1 + jaw * 0.5, 4, 1, R_BEARD[3]); // Schnurrbart
  // Glutaugen
  const eyeOn = P.eye > 0.3;
  p.px(hx + 3, hy, eyeOn ? E[3] : R_SKIN[0]); p.px(hx + 1, hy, eyeOn ? E[2] : R_SKIN[0]);
  if (eyeOn) { g.px(hx + 3, hy, E[4]); g.px(hx + 4, hy, E[1]); g.px(hx + 1, hy, E[2]); }
  meta.eye = { x: hx + 3, y: hy };
  // Helm: Eisenkappe mit Nasenschutz und Nieten
  p.ellipse(hx + 1, hy - 3, 4.5, 3.5, IRON[2]);
  p.ellipse(hx + 0.5, hy - 4, 3.5, 2.2, IRON[3]);
  p.px(hx - 1, hy - 5, IRON[5]); p.px(hx, hy - 6, IRON[4]);
  p.rect(hx - 3, hy - 2, 9, 2, IRON[1]); p.rect(hx - 3, hy - 2, 9, 1, IRON[3]);
  for (let k = -2; k <= 5; k += 2) p.px(hx + k, hy - 1, IRON[4]);
  p.rect(hx + 4, hy - 1, 1, 2, IRON[3]); p.px(hx + 4, hy - 1, IRON[5]); // Nasal
  p.rect(hx - 4, hy - 2, 2, 5, IRON[1]); // Nackenschutz
  // Hörner: nach vorn-oben geschwungen
  const horn = (bx, by, dir, near) => {
    const pts = [[0, 0], [dir * 2, -2], [dir * 3, -5], [dir * 2.5, -8], [dir * 1, -10]];
    for (let i = 0; i < pts.length - 1; i++) {
      const w = 3 - i * 0.6;
      limb(p, bx + pts[i][0], by + pts[i][1], bx + pts[i + 1][0], by + pts[i + 1][1], w, w - 0.6,
        near ? [HORN[1], HORN[2], HORN[3], HORN[4]] : [HORN[0], HORN[1], HORN[2], HORN[2]]);
    }
    p.px(bx + dir * 2.2, by - 2.5, HORN[1]); p.px(bx + dir * 3, by - 5.5, HORN[1]);
  };
  horn(hx - 2, hy - 5, -1, false);
  horn(hx + 3, hy - 5, 1, true);
  meta.head = { x: hx + 1, y: hy - 8 };
  meta.mouth = { x: hx + 4, y: hy + 2 };

  // --- 8. vorderer Arm + Axt
  const drawArm = () => {
    limb(p, shF.x, shF.y, armF.jx, armF.jy, 4.5, 4, [R_SKIN[1], R_SKIN[2], R_SKIN[3], R_SKIN[4]]);
    p.px(shF.x - 1, shF.y - 1, R_SKIN[4]);
    limb(p, armF.jx, armF.jy, armF.ex, armF.ey, 4.5, 4, [R_SKIN[1], R_SKIN[2], R_SKIN[3], R_SKIN[4]]);
    // Lederarmschiene mit Nieten
    limb(p, armF.jx + (armF.ex - armF.jx) * 0.35, armF.jy + (armF.ey - armF.jy) * 0.35, armF.ex, armF.ey, 4.5, 4.2, [R_LEA[1], R_LEA[2], R_LEA[3], R_LEA[4]]);
    p.px(armF.jx + (armF.ex - armF.jx) * 0.6, armF.jy + (armF.ey - armF.jy) * 0.6 - 1, IRON[4]);
    p.ellipse(armF.ex, armF.ey, 1.8, 1.8, R_SKIN[2]); p.px(armF.ex - 1, armF.ey - 1, R_SKIN[4]);
  };
  if (!axeBehind && P.held > 0.5) { smearAxe(); drawArm(); axeInfo = drawAxe(p, g, hF.x, hF.y, axeA, axeLS, P.fl, P.fire); p.ellipse(hF.x, hF.y, 1.8, 1.8, R_SKIN[2]); p.px(hF.x - 1, hF.y - 1, R_SKIN[4]); }
  else drawArm();
  meta.hand = hF;
  if (axeInfo) { meta.axe = axeInfo.head; meta.tip = axeInfo.edge; }
  return meta;
}

function raskAnims() {
  const mk = (P, X) => makeFrame(RW, RH, RAX, RAY, drawRask, P, X);
  const T = (keys, n, o) => track(mk, keys, n, o);
  const idleA = rpose({ fl: 0 });
  const idleB = rpose({ hipY: 1, lean: 0.11, hFy: 7, axe: -1.0, capeT: Math.PI, fl: 2, head: 0.3 });
  const idle = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 6, k = (1 - Math.cos(t * TAU)) / 2;
    idle.push(mk({ ...mixP(idleA, idleB, k), fl: i * 1.3 }));
  }
  const walk = [];
  for (let i = 0; i < 8; i++) {
    const ph = (i / 8) * TAU, sn = Math.sin(ph), c = Math.cos(ph);
    walk.push(mk(rpose({
      hipY: -Math.abs(c) * 1.3 + 1, lean: 0.14 + Math.abs(sn) * 0.03, fFx: 1 + sn * 7, fFy: Math.max(0, -c) * 3,
      fBx: -1 - sn * 7, fBy: Math.max(0, c) * 3, hFx: 9 + sn * 1.2, hFy: 6 - Math.abs(sn) * 0.8,
      axe: -1.05 + sn * 0.06, cape: 0.45, capeT: ph, head: sn * 0.5, fl: i * 1.1,
    }), { fx: i === 0 || i === 4 ? 'step' : null }));
  }
  // Brüllen: Axt in einer Hand hochgereckt, Brust raus
  const r0 = rpose({ fl: 0 });
  const r1 = rpose({ lean: 0.2, hipY: 2, head: 1, hFx: 7, hFy: 8, axe: -0.5, jaw: 0.3, fl: 1 });
  const r2 = rpose({ lean: -0.22, hipY: 1, head: -1, hFx: 8, hFy: -12, axe: -1.35, grip: 0, hBx: -9, hBy: 0, jaw: 1, cape: 0.8, capeT: 2, fire: 1.4, fl: 2, fFx: 8, fBx: -8 });
  const roar = T([[0, r0], [0.3, r1], [0.5, r2, snap], [0.85, { ...r2, capeT: 4, fl: 5 }], [1, { ...r2, capeT: 5, fl: 7, jaw: 0.8 }]], 8, { extras: { 3: { fx: 'roar' } } });
  // Überkopf-Hieb: ausholen weit hinter den Kopf …
  const w1 = rpose({ lean: 0.02, hipX: -1, hFx: 3, hFy: -8, axe: -1.9, fFx: 8, fBx: -8, cape: 0.2, fl: 1 });
  const w2 = rpose({ lean: -0.22, hipX: -2, hipY: 1, hFx: -1, hFy: -15, axe: -2.6, fFx: 9, fBx: -9, fBy: 1, cape: 0.3, capeT: 1, jaw: 0.6, fl: 2, fire: 1.2 });
  const w3 = rpose({ ...w2, lean: -0.28, hFx: -3, hFy: -15, axe: 2.75, jaw: 1, fl: 3, fire: 1.3 });
  const windup = [mk(idleA), mk(mixP(idleA, w1, 0.6)), mk(w1), mk(w2), mk(w3, { axeBehind: true })];
  // … und wuchtig nach vorn in den Boden
  const s1 = rpose({ lean: 0.2, hipX: 2, hipY: 2, hFx: 8, hFy: -11, axe: -0.9, fFx: 11, fBx: -9, cape: 0.7, capeT: 2, jaw: 1, fl: 4, fire: 1.4 });
  const s2 = rpose({ lean: 0.5, hipX: 4, hipY: 6, hFx: 12, hFy: 1, axe: 0.85, fFx: 12, fBx: -11, cape: 1, capeT: 3, jaw: 1, fl: 5, fire: 1.4 });
  const s3 = rpose({ ...s2, lean: 0.47, hipY: 6, hFy: 2, axe: 0.9, capeT: 4, jaw: 0.6, fl: 6 });
  const s4 = rpose({ lean: 0.25, hipX: 2, hipY: 3, hFx: 11, hFy: 6, axe: 0.3, fFx: 10, fBx: -9, cape: 0.4, capeT: 5, fl: 7 });
  const strike = [
    mk(s1, { smear: [-2.9, -0.9] }),
    mk(s2, { smear: [-1.6, 0.85], fx: 'impact' }),
    mk(s3, { smear: [0.4, 0.9] }),
    mk(s4),
    mk(mixP(s4, idleA, 0.6)),
  ];
  // Wirbelwind: Axt kreist waagerecht um den Körper
  const spin = [];
  for (let i = 0; i < 8; i++) {
    const ph = i / 8;
    const a1 = ph * TAU;
    spin.push(mk(rpose({
      spin: ph, lean: 0.05, hipY: 2, fFx: 8 + Math.sin(a1) * 1.5, fBx: -8 + Math.sin(a1) * 1.5, fFy: i % 4 === 0 ? 1 : 0,
      cape: 1, capeT: a1 * 2, head: Math.cos(a1) * 0.8, jaw: 0.6, fl: i * 1.5, fire: 1.3,
    }), { smear: [a1 - 2.2, a1, 0.38], smearC: { x: 0, y: 4 }, fx: i % 4 === 0 ? 'step' : null }));
  }
  // Treffer
  const hurtP = rpose({ lean: -0.18, hipX: -2, head: -1.5, jaw: 0.6, hFx: 6, hFy: 7, axe: -0.7, eye: 1, cape: 0.4, fl: 1 });
  const hurt = [mk(hurtP), mk(mixP(hurtP, idleA, 0.5))];
  // Tod: taumelt, sinkt auf die Knie, kippt vornüber; die Axt glüht aus
  const d1 = rpose({ lean: -0.28, hipX: -2, head: -2, jaw: 1, hFx: 8, hFy: 10, axe: 0.3, fl: 1 });
  const d2 = rpose({ kneel: 1, lean: 0.3, jaw: 1, head: 2, hFx: 12, hFy: 12, axe: 1.35, fl: 2, fire: 0.8, eye: 0.6, fFx: 7, fBx: -9 });
  const d3 = rpose({ kneel: 1, lean: 0.55, jaw: 0.6, head: 3, hFx: 13, hFy: 14, axe: 1.45, fl: 3, fire: 0.6, eye: 0.4, fFx: 7, fBx: -9 });
  const piv = [RAX + 2, RAY - 1];
  const flat = rpose({ lean: 0.05, head: 1, fFx: 3, fBx: -2, hFx: 4, hFy: 12, grip: 0, hBx: 0, hBy: 12, held: 0, fire: 0, eye: 0, jaw: 0.5 });
  const lying = (fire) => (p, g) => { drawAxe(p, g, RAX + 20, RAY - 2, -0.12, 1, 3, fire); return {}; };
  const d4 = { ...d3, hFx: 6, hFy: 16, grip: 0, hBx: 2, hBy: 16, axe: 1.6, fire: 0, held: 0 };
  const death = [
    mk(hurtP), mk(d1), mk(d2, { fx: 'impact' }), mk(d3),
    mk(d4, { rot: [0.6, ...piv], post: lying(0.6) }),
    mk(d4, { rot: [1.2, ...piv], post: lying(0.5) }),
    mk(flat, { rot: [Math.PI / 2, RAX - 4, RAY - 1], post: lying(0.4), fx: 'impact' }),
    mk(flat, { rot: [Math.PI / 2, RAX - 4, RAY - 1], post: lying(0) }),
  ];
  return {
    idle: new Animation(idle, 6),
    walk: new Animation(walk, 9),
    roar: new Animation(roar, 8, false),
    windup: new Animation(windup, 9, false),
    strike: new Animation(strike, 14, false),
    spin: new Animation(spin, 16),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 8, false),
  };
}

// ================================================================ Export

export function createAshwoodFoes() {
  return {
    ash_boar: boarAnims(),
    bandit: banditAnims(false),
    bandit_archer: banditAnims(true),
    thorn_crawler: crawlerAnims(),
    bandit_chief: raskAnims(),
  };
}
