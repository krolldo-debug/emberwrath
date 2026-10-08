import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame, SpriteFrame, Animation } from '../gfx/Sprite.js';
import { hash2 } from '../core/math.js';

// Gegner des Versunkenen Tempels: Ertrunkener, Gezeitenkultist und
// Tempelwächter (belebte Bronzestatue).
//
// Aufbau wie foes_ashwood.js: kleine Rigs mit IK, Schlüsselposen werden weich
// interpoliert; jeder Frame hat eine Leucht-Ebene (frame.glow), Metadaten
// (frame.meta: eye/hand/mouth/head … relativ zum Anker) und optional eine
// Ereignismarke (frame.fx: 'step' | 'impact' | 'cast').
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
// Pixelgenau gerastert (Kapsel um die Strecke): saubere Lichtbänder ohne
// Sprenkel, die beim Überzeichnen halber Schritte entstanden.
function limb(p, x0, y0, x1, y1, w0, w1, ramp) {
  const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy || 0.0001, len = Math.sqrt(len2);
  let nx = -dy / len, ny = dx / len;
  if (nx + ny > 0) { nx = -nx; ny = -ny; }
  const R = Math.max(w0, w1) / 2 + 1;
  const xa = Math.floor(Math.min(x0, x1) - R), xb = Math.ceil(Math.max(x0, x1) + R);
  const ya = Math.floor(Math.min(y0, y1) - R), yb = Math.ceil(Math.max(y0, y1) + R);
  for (let Y = ya; Y <= yb; Y++) for (let X = xa; X <= xb; X++) {
    const t = Math.max(0, Math.min(1, ((X - x0) * dx + (Y - y0) * dy) / len2));
    const ox = X - (x0 + dx * t), oy = Y - (y0 + dy * t);
    const hw = Math.max(0.62, (w0 + (w1 - w0) * t) / 2);
    if (ox * ox + oy * oy > hw * hw + 0.15) continue;
    const k = ox * nx + oy * ny;
    const c = k > hw - 1 ? ramp[3] : k < -hw + 1 ? ramp[0] : k > 0 ? ramp[2] : ramp[1];
    p.px(X, Y, c);
  }
}

// Schwung-Schleier: überstreicht die Klinge von a0 nach a1 (Drehpunkt cx/cy).
// Geschlossene Sichel ohne Rauschen: am Anfang ein dünner Faden, zum frischen
// Ende hin breit; Außenkante hell, innen dunkler. sy staucht die Bahn
// senkrecht (waagerechte Hiebe in 3/4-Sicht).
function smearArc(p, g, cx, cy, a0, a1, r0, r1, cols, gcols, sy = 1) {
  const n = Math.ceil(Math.abs(a1 - a0) * r1 * 2) + 2;
  const seen = new Set();
  for (let i = 0; i <= n; i++) {
    const f = i / n, a = a0 + (a1 - a0) * f;
    const th = (0.12 + 0.88 * Math.pow(f, 1.3)) * Math.min(1, 8 / (r1 - r0)); // höchstens ~8 px breit
    const rin = r1 - (r1 - r0) * th;
    for (let r = r1; r >= rin; r -= 0.5) {
      const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r * sy);
      const key = x * 1000 + y;
      if (seen.has(key)) continue;
      seen.add(key);
      const radial = (r - rin) / (r1 - rin || 1);
      const c = radial > 0.75 || f < 0.25 ? cols[2] : radial > 0.4 ? cols[1] : cols[0];
      p.px(x, y, c);
      if (g && gcols && f > 0.3 && radial > 0.4) g.px(x, y, radial > 0.75 ? gcols[1] : gcols[0]);
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

// Pixelkarte: jede Zeile ein String, jedes Zeichen ein Schlüssel in pal
// ('.' und Leerzeichen = frei). Für Köpfe/Gesichter, die pixelgenau sitzen müssen.
function pmap(p, x0, y0, rows, pal) {
  for (let j = 0; j < rows.length; j++) {
    const r = rows[j];
    for (let i = 0; i < r.length; i++) {
      const c = pal[r[i]];
      if (c) p.px(x0 + i, y0 + j, c);
    }
  }
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

const WATER = ['#0c2a34', '#15434e', '#236670', '#3a8e94', '#6cbcbc', '#b4ecea'];
const WEED = ['#0b1f16', '#15341f', '#22502c', '#33703a', '#4c8e48'];
const COLD = ['#3a6a6a', '#8ad0cc', '#e6fffa'];
const COLD_G = ['#1e5a5a', '#6cc8c0'];

// ================================================================ Ertrunkener

const DW = 58, DH = 42, DAX = 26, DAY = 38;
const DD = { legH: 9, thigh: 5, shin: 5, spine: 8, upper: 5, fore: 5.5, sh: 1.5, hipW: 1 };
const D_SKIN = ['#1a2622', '#2e403a', '#465c52', '#627a6c', '#86a08c', '#aac2ac'];
const RAG = ['#1e1f1c', '#34352f', '#4c4c42', '#66645a'];
const D_PANTS = ['#141a22', '#1f2834', '#2e3a48', '#3e4c5c'];
const BARN = ['#5c5a52', '#8e8a7c', '#c4bea8'];
const D_REST = {
  hipX: 0, hipY: 1, lean: 0.28, head: 1, fFx: 3, fFy: 0, fBx: -4, fBy: 0,
  hFx: 5, hFy: 10, hBx: 2, hBy: 11, jaw: 0.5, loll: 0, drip: 0, claw: 0, eye: 1, weed: 0,
};
const dpose = (o = {}) => ({ ...D_REST, ...o });

function drawDrowned(p, g, P, X) {
  const R = rig(P, DD, DAX, DAY);
  const { hip, chest, pt, legF, legB, shF, shB, armF, armB } = R;
  const meta = {};
  const G = ['#1e5a5a', '#4aa8a4', '#a8f0e8'];

  // --- Seetang hängt vom Rücken
  const back = pt(DD.spine, -2.5);
  for (let i = 0; i < 3; i++) {
    const len = 7 + i * 2;
    for (let j = 0; j < len; j++) {
      const x = back.x - i * 0.8 + Math.sin(P.weed + j * 0.6 + i) * 0.8 - j * 0.15, y = back.y + j + i;
      p.px(x, y, WEED[j % 3 === 0 ? 1 : 2 + (i === 0 ? 1 : 0)]);
    }
  }
  // --- hinteres Bein (schleift nach)
  limb(p, hip.x - 1, hip.y, legB.jx, legB.jy, 3.5, 3, [D_PANTS[0], D_PANTS[0], D_PANTS[1], D_PANTS[2]]);
  limb(p, legB.jx, legB.jy, legB.ex, legB.ey - 1, 3, 2.5, [D_PANTS[0], D_PANTS[0], D_PANTS[1], D_PANTS[1]]);
  p.rect(legB.ex - 1, legB.ey - 1, 3, 1, D_SKIN[1]);
  // --- hinterer Arm (lang, hängend)
  limb(p, shB.x, shB.y, armB.jx, armB.jy, 3, 2.5, [D_SKIN[0], D_SKIN[0], D_SKIN[1], D_SKIN[2]]);
  limb(p, armB.jx, armB.jy, armB.ex, armB.ey, 2.5, 2, [D_SKIN[0], D_SKIN[0], D_SKIN[1], D_SKIN[2]]);
  const claw = (x, y, near) => {
    const c = near ? D_SKIN[3] : D_SKIN[1];
    const open = P.claw;
    for (let k = -1; k <= 1; k++) {
      p.line(x, y, x + 2 + open, y + 1.5 + k * (0.7 + open * 0.8), c);
      p.px(x + 2 + open, y + 1.5 + k * (0.7 + open * 0.8), near ? BARN[2] : BARN[1]);
    }
    p.ellipse(x, y, 1.3, 1.3, near ? D_SKIN[3] : D_SKIN[1]);
  };
  claw(armB.ex, armB.ey, false);

  // --- aufgedunsener Rumpf mit zerrissenem Hemd
  const hp = pt(0, 0.5), cp = pt(DD.spine, 0.5);
  limb(p, hp.x, hp.y, cp.x, cp.y, 7.5, 7, [D_SKIN[0], D_SKIN[1], D_SKIN[2], D_SKIN[2]]);
  const belly = pt(3, 1.8);
  p.ellipse(belly.x, belly.y, 3.5, 3, D_SKIN[2]); p.ellipse(belly.x - 0.5, belly.y - 1, 2, 1.5, D_SKIN[3]); p.px(belly.x - 1.5, belly.y - 1.5, D_SKIN[4]);
  const q = (u, k, c) => { const o = pt(u, k); p.px(o.x, o.y, c); };
  // Zerrissenes Hemd: deckt Rücken und Brust, vorn unten aufgerissen (der
  // aufgedunsene Bauch quillt heraus). Licht von hinten oben = Rückenseite hell.
  for (let u = 3; u <= 8.5; u += 0.5) for (let k = -3.5; k <= 2.5; k += 0.5) {
    const torn = k > 0.2 && u < 6.2 - (k - 0.2) * 0.5 + hash2(Math.round(u * 2), 3, 64) * 1.2;
    if (torn) continue;
    if (u < 4 && hash2(Math.round(k * 2), 5, 61) < 0.45) continue; // ausgefranster Saum
    q(u, k, k < -2.4 ? RAG[3] : k > 1.6 ? RAG[1] : u > 7.5 ? RAG[3] : (Math.round(u * 2 + k) % 5 === 0 ? RAG[1] : RAG[2]));
  }
  for (let u = 4.5; u <= 8; u += 0.5) q(u, -1.5 + (u - 4.5) * 0.2, RAG[1]); // Falte
  q(8, 1.5, RAG[0]); q(7.5, 2, RAG[0]); // Kragenschatten
  q(6, 2.5, D_SKIN[1]); q(5, 3, D_SKIN[2]); // Nabel/Falte
  // Seepocken an der Schulter
  q(7.5, -2, BARN[1]); q(8, -1, BARN[2]); q(7, -1, BARN[0]);
  // Hosenbund
  for (let k = -3.5; k <= 3.5; k += 0.5) q(0.3, k, D_PANTS[1]);
  // --- vorderes Bein
  limb(p, hip.x + 1, hip.y, legF.jx, legF.jy, 3.5, 3, [D_PANTS[1], D_PANTS[1], D_PANTS[2], D_PANTS[3]]);
  limb(p, legF.jx, legF.jy, legF.ex, legF.ey - 1, 3, 2.5, [D_SKIN[1], D_SKIN[2], D_SKIN[3], D_SKIN[3]]);
  p.rect(legF.ex - 1, legF.ey - 1, 3, 1, D_SKIN[2]); p.px(legF.ex + 2, legF.ey - 1, D_SKIN[3]);
  p.px(legF.jx - 1, legF.jy - 1, D_PANTS[3]); p.px(legF.jx, legF.jy + 1, D_PANTS[0]); // zerrissenes Hosenbein

  // --- vorderer Arm
  if (X.smear) smearArc(p, g, shF.x, shF.y, X.smear[0], X.smear[1], 5, 12, COLD, COLD_G, 0.8);
  limb(p, shF.x, shF.y, armF.jx, armF.jy, 3, 2.6, [D_SKIN[1], D_SKIN[2], D_SKIN[3], D_SKIN[4]]);
  limb(p, armF.jx, armF.jy, armF.ex, armF.ey, 2.6, 2.4, [D_SKIN[1], D_SKIN[2], D_SKIN[3], D_SKIN[4]]);
  p.px(armF.jx, armF.jy, D_SKIN[4]); // Ellbogen im Licht
  // Tang um den Unterarm
  const mx = (armF.jx + armF.ex) / 2, my = (armF.jy + armF.ey) / 2;
  p.px(mx, my, WEED[3]); p.px(mx - 1, my + 1, WEED[2]); p.px(mx - 1, my + 2, WEED[2]); p.px(mx - 1.5, my + 3 + Math.sin(P.weed) * 0.5, WEED[1]);
  claw(armF.ex, armF.ey, true);
  meta.hand = { x: armF.ex + 2, y: armF.ey + 1 };

  // --- Kopf (nach dem Arm gezeichnet: der vorgereckte Kopf liegt vorn): kahl, aufgedunsen, hängender Kiefer, trübe leuchtende Augen
  const neck = pt(DD.spine + 1.5, 1.5);
  const hx = Math.round(neck.x + P.head), hy = Math.round(neck.y - 3 + P.loll);
  // Kopf als Pixelkarte: kahl, aufgedunsen, wulstige Stirn über tiefer Augenhöhle,
  // platte Nase, Seepocken am Hinterkopf; der Kiefer hängt (P.jaw)
  const jaw = Math.max(1, Math.round(P.jaw * 2));
  const DS = { 0: D_SKIN[0], 1: D_SKIN[1], 2: D_SKIN[2], 3: D_SKIN[3], 4: D_SKIN[4], 5: D_SKIN[5], k: '#0a1210', b: BARN[2], B: BARN[1] };
  // Schlund (immer offen) und hängender Unterkiefer
  p.rect(hx, hy + 2, 4, jaw, '#0a1210');
  pmap(p, hx - 1, hy + 2 + jaw, ['22333', '.0110'], DS);
  p.px(hx + 1, hy + 2 + jaw, BARN[2]); p.px(hx + 3, hy + 2, BARN[1]); p.px(hx + 1, hy + 2, BARN[0]); // faule Zähne
  pmap(p, hx - 4, hy - 5, [
    '..34443..',
    '.3455543.',
    '345555443',
    'b44555553',
    'B3442kek.',
    '233432123',
    '1233322..',
  ], DS);
  p.px(hx - 2, hy + 2, D_SKIN[0]); p.px(hx - 1, hy + 2, D_SKIN[1]); // Schatten unter dem Kinn
  // strähniges Haar / Tang fällt am Hinterkopf herab (nicht übers Gesicht)
  for (let i = 0; i < 3; i++) {
    const x = hx - 3.5 + i * 1.1, y = hy - 4 + i * 0.4;
    const len = 4 + i * 1.5;
    for (let j = 0; j < len; j++) p.px(x - j * 0.5 + Math.sin(P.weed + i + j * 0.8) * 0.4, y + j, j < 1 ? WEED[3] : WEED[1 + (i & 1) - (j > 3 ? 1 : 0)]);
  }
  // Auge: trübes, kaltes Glimmen in der Höhle
  const eyeOn = P.eye > 0.3;
  p.px(hx + 2, hy - 1, eyeOn ? G[2] : D_SKIN[1]);
  if (eyeOn) { g.px(hx + 2, hy - 1, G[2]); g.px(hx + 1, hy - 1, G[1]); g.px(hx + 2, hy, G[0]); g.px(hx + 3, hy - 1, G[0]); }
  meta.eye = { x: hx + 2, y: hy - 1 };
  meta.mouth = { x: hx + 3, y: hy + 2 };
  meta.head = { x: hx, y: hy - 4 };

  // --- Wassertropfen (fallen je nach Phase)
  const drops = [[armF.ex + 1, armF.ey + 3], [armB.ex + 1, armB.ey + 3], [hx - 3, hy + 4], [back.x - 1, back.y + 9]];
  drops.forEach(([x, y], i) => {
    const t = (P.drip + i * 0.37) % 1;
    const yy = y + t * 7;
    if (yy > DAY - 1) return;
    p.px(x, yy, WATER[3]); if (t > 0.3) p.px(x, yy - 1, WATER[2]);
    g.px(x, yy, WATER[1]);
  });
  return meta;
}

// Zerfließen: Körperhaufen sackt zur Pfütze mit Tang, Stofffetzen und Seepocken.
function drawPuddle(p, g, k) {
  const cx = DAX + 1, gy = DAY;
  const rx = 6 + k * 9, ry = 2 + k * 1.5;
  p.ellipse(cx, gy - 1, rx, ry, WATER[1]);
  p.ellipse(cx - 1, gy - 1.5, rx - 1.5, ry - 0.8, WATER[2]);
  p.ellipse(cx - 3, gy - 2, rx * 0.4, 0.6, WATER[4]);
  p.px(cx - rx + 3, gy - 2, WATER[5]); p.px(cx + rx * 0.5, gy - 1, WATER[3]);
  g.ellipse(cx - 3, gy - 2, rx * 0.35, 0.5, WATER[1]);
  // restlicher Körper (Haufen), der zusammensinkt
  const h = 7 * (1 - k);
  if (h > 0.5) {
    p.ellipse(cx, gy - 2 - h * 0.5, 5 - k * 2, h * 0.6 + 1, D_SKIN[2]);
    p.ellipse(cx - 1, gy - 3 - h * 0.6, 3.5 - k * 2, h * 0.35 + 0.5, D_SKIN[3]);
    p.px(cx + 2, gy - 3 - h * 0.7, D_SKIN[0]);
  }
  // Tang und Stoff
  for (let i = 0; i < 6; i++) {
    const x = cx - rx * 0.8 + hash2(i, 1, 63) * rx * 1.6, y = gy - 2 - hash2(i, 2, 63) * 1.5;
    p.line(x, y, x + 2 + hash2(i, 3, 63) * 2, y + (i & 1 ? 1 : -1) * 0.6, i < 3 ? WEED[2 + (i & 1)] : RAG[2]);
  }
  p.px(cx + 3, gy - 2, BARN[2]); p.px(cx + 4, gy - 2, BARN[1]); p.px(cx - 5, gy - 1, BARN[1]);
}

function drownedAnims() {
  const mk = (P, X) => makeFrame(DW, DH, DAX, DAY, drawDrowned, P, X);
  const idle = [];
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU;
    idle.push(mk(dpose({ hipY: 1 + (Math.sin(a) > 0.3 ? 1 : 0), lean: 0.28 + Math.sin(a) * 0.03, loll: Math.sin(a + 1) > 0.5 ? 1 : 0, jaw: 0.5 + Math.sin(a) * 0.3, hFy: 10 + Math.sin(a) * 0.6, hBy: 11 + Math.sin(a + 1) * 0.6, drip: i / 6, weed: a })));
  }
  // Schlurfen: vorderes Bein tritt, hinteres schleift mit der Spitze über den Boden
  const walk = [];
  for (let i = 0; i < 8; i++) {
    const ph = i / 8 * TAU, s = Math.sin(ph), c = Math.cos(ph);
    walk.push(mk(dpose({
      fFx: 2 + s * 4, fFy: Math.max(0, -c) * 2, fBx: -3 - s * 3, fBy: Math.max(0, c) * 0.5,
      hipY: 1 + (c > 0.3 ? 1 : 0), lean: 0.3 + s * 0.06, hipX: s * 0.5, head: 1 + s * 0.5, loll: c > 0 ? 1 : 0,
      hFx: 5 - s * 1.5, hFy: 10 + c * 0.5, hBx: 2 + s * 1.5, hBy: 11, drip: i / 8, weed: ph, jaw: 0.6,
    })));
  }
  const windup = [
    mk(dpose({ lean: 0.12, hipX: -1, hFx: 3, hFy: 0, hBx: 1, hBy: 1, jaw: 1, claw: 0.5, drip: 0.2, weed: 1 })),
    mk(dpose({ lean: -0.05, hipX: -1.5, hipY: 0, hFx: 2, hFy: -6, hBx: 0, hBy: -5, jaw: 1, claw: 1, head: 0, drip: 0.4, weed: 2, fFx: 4, fBx: -5 })),
    mk(dpose({ lean: -0.1, hipX: -2, hipY: 0, hFx: 1, hFy: -8, hBx: -1, hBy: -7, jaw: 1, claw: 1, head: -0.5, drip: 0.6, weed: 3, fFx: 4, fBx: -5 })),
  ];
  const strike = [
    mk(dpose({ lean: 0.45, hipX: 2, hipY: 1, hFx: 8, hFy: -2, hBx: 6, hBy: 0, jaw: 1, claw: 1, fFx: 6, fBx: -4, weed: 4 }), { smear: [-1.9, -0.6] }),
    mk(dpose({ lean: 0.55, hipX: 3, hipY: 2, hFx: 9, hFy: 6, hBx: 7, hBy: 7, jaw: 1, claw: 0.6, fFx: 7, fBx: -4, weed: 5 }), { smear: [-1.4, 0.6], fx: 'impact' }),
    mk(dpose({ lean: 0.5, hipX: 2.5, hipY: 2, hFx: 7, hFy: 10, hBx: 5, hBy: 10, jaw: 0.6, claw: 0, fFx: 6, fBx: -4, weed: 6, drip: 0.3 })),
    mk(dpose({ lean: 0.35, hipX: 1, hFx: 6, hFy: 10, hBx: 3, hBy: 11, weed: 7, drip: 0.5 })),
  ];
  const hurtP = dpose({ lean: 0.05, hipX: -1.5, head: -1, loll: -1, jaw: 1, hFx: 2, hFy: 7, hBx: 0, hBy: 8, eye: 1 });
  const hurt = [mk(hurtP), mk(mixP(hurtP, D_REST, 0.5))];
  const pud = (k, fx) => {
    const g = new PixelCanvas(DW, DH);
    const f = buildFrame(DW, DH, DAX, DAY, (p) => drawPuddle(p, g, k));
    f.glow = new SpriteFrame(g.canvas, DAX, DAY);
    f.meta = { eye: { dx: 2, dy: -4 }, head: { dx: 0, dy: -6 }, mouth: { dx: 2, dy: -3 }, hand: { dx: 3, dy: -2 } };
    f.fx = fx ?? null;
    return f;
  };
  const d1 = dpose({ lean: 0.1, hipX: -1, hipY: 3, head: -1, jaw: 1, hFx: 3, hFy: 9, hBx: 1, hBy: 10, fFx: 4, fBx: -3 });
  const d2 = dpose({ lean: 0.5, hipY: 5, head: 1.5, loll: 1, jaw: 1, hFx: 7, hFy: 14, hBx: 5, hBy: 14, fFx: 4, fBx: -4, eye: 0.5 });
  const death = [mk(hurtP), mk(d1), mk(d2, { fx: 'impact' }), pud(0.15), pud(0.5), pud(0.8), pud(1)];
  return {
    idle: new Animation(idle, 6),
    walk: new Animation(walk, 8),
    windup: new Animation(windup, 7, false),
    strike: new Animation(strike, 13, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 8, false),
  };
}


// ================================================================ Gezeitenkultist

const TW = 58, TH = 46, TAX = 26, TAY = 42;
const TD = { legH: 10, thigh: 5, shin: 6, spine: 8, upper: 4.5, fore: 4.5, sh: 1.5, hipW: 1 };
const ROBE = ['#06161a', '#0b2528', '#123a3a', '#1a5250', '#246c66', '#358a80'];
const TRIM = ['#3a2e14', '#6a5424', '#9a7c38', '#c8a652'];
const MASK = ['#5e6a66', '#94a29c', '#c6d2cc', '#eaf2ec'];
const CORAL = ['#4a1420', '#842a34', '#c04a44', '#e87a5c', '#ffb08a'];
const PEARL = ['#1a5a6a', '#3aa0b4', '#7ae0e8', '#c8fcfc', '#ffffff'];
const T_REST = {
  hipX: 0, hipY: 0, lean: 0.04, head: 0, fFx: 2.5, fFy: 0, fBx: -2.5, fBy: 0,
  hFx: 6, hFy: 6, hBx: 2, hBy: 6, sa: -1.42, pearl: 0.4, sway: 0, hood: 0, cast: 0, orbit: 0, eye: 1,
};
const tpose = (o = {}) => ({ ...T_REST, ...o });

function coralStaff(p, g, hx, hy, a, pearl, orbit) {
  const dx = Math.cos(a), dy = Math.sin(a);
  let nx = -dy, ny = dx; if (nx + ny > 0) { nx = -nx; ny = -ny; }
  // Schaft: verdrehtes Treibholz
  limb(p, hx - dx * 9, hy - dy * 9, hx + dx * 10, hy + dy * 10, 1.6, 1.6, [WOOD_[0], WOOD_[1], WOOD_[2], WOOD_[3]]);
  for (let s = -8; s < 10; s += 3) p.px(hx + dx * s + nx * 0.5, hy + dy * s + ny * 0.5, WOOD_[3]);
  // Korallenkrone: verzweigt, umfasst die Perle
  const tx = hx + dx * 10, ty = hy + dy * 10;
  const px_ = tx + dx * 3.5, py_ = ty + dy * 3.5;
  const branch = (side, len) => {
    let x = tx, y = ty;
    for (let i = 0; i < len; i++) {
      const f = i / len;
      x += dx * 0.9 + nx * side * (1.3 - f * 1.8);
      y += dy * 0.9 + ny * side * (1.3 - f * 1.8);
      p.px(x, y, CORAL[side > 0 ? 3 : 2]); p.px(x - nx * side * 0.6, y - ny * side * 0.6, CORAL[1]);
      if (i === 2) { p.px(x + nx * side * 1.2, y + ny * side * 1.2 - 0.5, CORAL[side > 0 ? 4 : 3]); }
    }
    p.px(x, y, CORAL[4]);
  };
  branch(1, 6); branch(-1, 6);
  p.px(tx + dx, ty + dy, CORAL[2]);
  // Perle
  const r = 1.3 + pearl * 0.6;
  p.ellipse(px_, py_, r, r, PEARL[2]); p.px(px_ - 0.6, py_ - 0.6, PEARL[4]);
  g.ellipse(px_, py_, r + 1.2 + pearl * 1.5, r + 1.2 + pearl * 1.5, PEARL[0]);
  g.ellipse(px_, py_, r + 0.5 + pearl, r + 0.5 + pearl, PEARL[1]);
  g.ellipse(px_, py_, r, r, PEARL[3]);
  g.px(px_ - 0.6, py_ - 0.6, PEARL[4]);
  // Wasserfunken kreisen um die Perle beim Kanalisieren
  if (orbit > 0) {
    const n = 5, R = 3 + orbit * 3;
    for (let i = 0; i < n; i++) {
      const a2 = orbit * 5 + (i / n) * TAU;
      const ox = px_ + Math.cos(a2) * R, oy = py_ + Math.sin(a2) * R * 0.7;
      p.px(ox, oy, PEARL[2]); g.px(ox, oy, PEARL[3]); g.px(ox - Math.sin(a2), oy + Math.cos(a2) * 0.7, PEARL[1]);
    }
  }
  return { x: px_, y: py_ };
}
const WOOD_ = ['#1e1612', '#34281e', '#4c3c2c', '#6a5640'];

function drawCultist(p, g, P, X) {
  const R = rig(P, TD, TAX, TAY);
  const { hip, chest, pt, legF, legB, shF, shB, armF, armB } = R;
  const meta = {};

  // --- Füße (unter der Robe hervor)
  p.rect(legB.ex - 1, legB.ey - 1, 3, 1, ROBE[0]);
  // --- hinterer Arm (Ärmel)
  limb(p, shB.x, shB.y, armB.jx, armB.jy, 3, 3.5, [ROBE[0], ROBE[0], ROBE[1], ROBE[2]]);
  limb(p, armB.jx, armB.jy, armB.ex, armB.ey, 3.5, 4, [ROBE[0], ROBE[1], ROBE[1], ROBE[2]]);
  p.px(armB.ex + 1, armB.ey, MASK[1]);
  if (P.cast > 0.05) { g.ellipse(armB.ex + 1, armB.ey, 1 + P.cast * 1.5, 1 + P.cast * 1.5, PEARL[1]); g.px(armB.ex + 1, armB.ey, PEARL[3]); }

  // --- Robe: Oberkörper + ausgestellter Rock bis zum Boden
  const top = pt(TD.spine, 0), waist = pt(1, 0);
  const hemY = TAY - 0.5;
  const hemL = Math.min(legB.ex, legF.ex) - 4 + Math.sin(P.sway) * 1 - P.lean * 6;
  const hemR = Math.max(legB.ex, legF.ex) + 3 + Math.sin(P.sway + 1) * 0.8;
  for (let y = Math.round(waist.y); y <= hemY; y++) {
    const f = (y - waist.y) / (hemY - waist.y || 1);
    const l = waist.x - 3.5 + (hemL - (waist.x - 3.5)) * f;
    const r = waist.x + 3 + (hemR - (waist.x + 3)) * f * f;
    for (let x = Math.round(l); x <= Math.round(r); x++) {
      const u = (x - l) / (r - l || 1);
      // Faltenwurf: senkrechte Streifen, links hell (Licht), rechts dunkel
      const fold = Math.sin(u * 9 + P.sway * 0.7 + f * 1.5);
      let k = u < 0.18 ? 3 : u > 0.82 ? 1 : fold > 0.35 ? 3 : fold < -0.4 ? 1 : 2;
      if (y > hemY - 1.5) k = Math.max(0, k - 1);
      p.px(x, y, ROBE[k]);
    }
    if (y > hemY - 2.5 && y <= hemY - 1.5) for (let x = Math.round(l); x <= Math.round(r); x += 1) p.px(x, y, (x & 1) ? TRIM[1] : TRIM[2]);
  }
  // Oberkörper
  limb(p, waist.x, waist.y, top.x, top.y, 7, 7.5, [ROBE[1], ROBE[2], ROBE[3], ROBE[4]]);
  // Schärpe + Muschelschnalle
  const q = (u, k, c) => { const o = pt(u, k); p.px(o.x, o.y, c); };
  for (let k = -3.5; k <= 3.5; k += 0.5) q(1.3, k, TRIM[1]);
  q(1.3, 1.5, TRIM[3]); q(1.3, 2, MASK[2]); q(2, 1.8, MASK[1]);
  for (let u = 2; u < 7; u += 1) q(u, 2.5 - u * 0.25, ROBE[4]); // Brustfalte
  // Anhänger: Zahn an Schnur
  q(5, 1.5, TRIM[2]); q(4.2, 1.8, MASK[3]);

  // --- Kopf: spitze Kapuze, bleiche Maske
  const neck = pt(TD.spine + 1.5, 0.5);
  const hx = Math.round(neck.x + P.head), hy = Math.round(neck.y - 3);
  // Kapuze
  p.ellipse(hx - 0.5, hy, 4, 4, ROBE[2]);
  p.ellipse(hx - 1, hy - 1, 3, 2.8, ROBE[3]);
  p.px(hx - 3, hy - 2, ROBE[5]); p.px(hx - 2, hy - 3, ROBE[4]);
  // Kapuzenspitze nach hinten
  for (let i = 0; i < 5; i++) {
    const x = hx - 3 - i * 0.9 + P.hood * i * 0.3, y = hy - 3 + i * 0.45 + i * i * 0.12;
    p.px(x, y, ROBE[i < 2 ? 4 : 3]); p.px(x + 0.5, y + 1, ROBE[2]);
  }
  // Kapuzeninneres: tiefer Schatten rund um die Maske
  p.rect(hx, hy - 2, 1, 5, ROBE[0]); p.rect(hx + 1, hy - 3, 3, 1, ROBE[1]);
  // Maske: bleiches Profil – Stirn im Licht, dunkle Augenhöhle, aufgemalte
  // Tränenlinie in Gezeitenfarbe, vorspringende Nase, schmaler Mund
  pmap(p, hx + 1, hy - 2, [
    '332.',
    '21k2',
    '2t22',
    '2t21',
    '1100',
  ], { 3: MASK[3], 2: MASK[2], 1: MASK[1], 0: MASK[0], k: '#061012', t: ROBE[4] });
  p.px(hx + 4, hy, MASK[3]); p.px(hx + 4, hy + 1, MASK[1]);
  if (P.eye > 0.3) { g.px(hx + 3, hy - 1, PEARL[3]); g.px(hx + 2, hy - 1, PEARL[1]); g.px(hx + 4, hy - 1, PEARL[0]); }
  // Kapuzenrand wirft Schatten über die Stirn
  p.px(hx + 1, hy - 3, ROBE[3]); p.px(hx + 2, hy - 3, ROBE[2]); p.px(hx + 3, hy - 3, ROBE[2]); p.px(hx + 4, hy - 2, ROBE[1]);
  meta.eye = { x: hx + 3, y: hy - 1 };
  meta.head = { x: hx, y: hy - 5 };

  // --- vorderer Arm + Korallenstab
  const drawArm = () => {
    limb(p, shF.x, shF.y, armF.jx, armF.jy, 3, 3.5, [ROBE[2], ROBE[3], ROBE[4], ROBE[5]]);
    limb(p, armF.jx, armF.jy, armF.ex, armF.ey, 3.5, 4.2, [ROBE[2], ROBE[3], ROBE[4], ROBE[5]]);
    p.px(armF.ex, armF.ey + 1, TRIM[2]); // Ärmelsaum
  };
  if (X.smear) smearArc(p, g, shF.x, shF.y, X.smear[0], X.smear[1], 6, 14, COLD, COLD_G, 1);
  drawArm();
  const pearl = coralStaff(p, g, armF.ex, armF.ey, P.sa, P.pearl, P.orbit);
  p.rect(armF.ex - 1, armF.ey - 1, 2, 2, MASK[1]); p.px(armF.ex - 1, armF.ey - 1, MASK[2]);
  meta.hand = pearl;
  meta.mouth = { x: hx + 3, y: hy + 1 };
  return meta;
}

function cultistAnims() {
  const mk = (P, X) => makeFrame(TW, TH, TAX, TAY, drawCultist, P, X);
  const idle = [];
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU;
    idle.push(mk(tpose({ hipY: Math.sin(a) > 0.3 ? 1 : 0, sway: a, pearl: 0.4 + Math.sin(a) * 0.25, hFy: 6 + Math.sin(a) * 0.5, head: Math.sin(a) * 0.3, hood: Math.sin(a) })));
  }
  const walk = [];
  for (let i = 0; i < 8; i++) {
    const ph = i / 8 * TAU, s = Math.sin(ph), c = Math.cos(ph);
    walk.push(mk(tpose({
      fFx: 1 + s * 3.5, fFy: Math.max(0, -c) * 1.5, fBx: -1 - s * 3.5, fBy: Math.max(0, c) * 1.5,
      hipY: c > 0.5 || c < -0.5 ? 0 : 1, lean: 0.1, sway: ph * 2, hFx: 5 + s * 0.8, sa: -1.4 - s * 0.05,
      hBx: 1 - s * 1.5, pearl: 0.4, hood: -1 + s * 0.3,
    })));
  }
  // Kanalisieren: Stab hoch, Perle glüht auf, Funken kreisen
  const windup = [
    mk(tpose({ hFx: 4, hFy: 0, sa: -1.55, hBx: 3, hBy: 2, cast: 0.3, pearl: 0.7, orbit: 0.2, lean: 0 })),
    mk(tpose({ hFx: 3, hFy: -4, sa: -1.6, hBx: 4, hBy: -1, cast: 0.6, pearl: 1.1, orbit: 0.5, lean: -0.06, sway: 1, hood: 0.5 })),
    mk(tpose({ hFx: 2, hFy: -6, sa: -1.65, hBx: 4, hBy: -3, cast: 0.9, pearl: 1.5, orbit: 0.8, lean: -0.1, sway: 2, hood: 1 })),
    mk(tpose({ hFx: 2, hFy: -7, sa: -1.7, hBx: 4, hBy: -4, cast: 1, pearl: 1.9, orbit: 1.1, lean: -0.12, sway: 3, hood: 1 })),
  ];
  // Stoß: Stab nach vorn, Perle entlässt das Geschoss (Projektil separat)
  const strike = [
    mk(tpose({ hFx: 9, hFy: 0, sa: -0.35, hBx: 3, hBy: 3, pearl: 2, lean: 0.2, hipX: 1, fFx: 4, fBx: -3, sway: 4, hood: -1 }), { smear: [-1.7, -0.35], fx: 'cast' }),
    mk(tpose({ hFx: 10, hFy: 1, sa: -0.2, hBx: 2, hBy: 4, pearl: 0.6, lean: 0.24, hipX: 1.5, fFx: 4, fBx: -3, sway: 5, hood: -1.5 })),
    mk(tpose({ hFx: 7, hFy: 2, sa: -0.8, hBx: 2, hBy: 5, pearl: 0.3, lean: 0.12, hipX: 1, fFx: 3, fBx: -3, sway: 6 })),
  ];
  const hurtP = tpose({ lean: -0.2, hipX: -1, head: -1, hFx: 3, hFy: 4, sa: -1.9, hBx: 0, hBy: 4, pearl: 0.8, sway: 2, hood: 1.5 });
  const hurt = [mk(hurtP), mk(mixP(hurtP, T_REST, 0.5))];
  const d1 = { ...hurtP, lean: -0.3, hipX: -1.5, pearl: 1 };
  const d2 = { ...d1, hipY: 3, lean: -0.1, hFy: 7, sa: -2.3, pearl: 0.5 };
  const d3 = { ...d2, hipY: 4, lean: 0.1, pearl: 0.2, eye: 0 };
  const piv = [TAX - 3, TAY - 1];
  const death = [
    mk(d1), mk(d2), mk(d3, { rot: [-0.5, ...piv] }), mk(d3, { rot: [-1.1, ...piv] }),
    mk({ ...d3, pearl: 0 }, { rot: [-1.5, piv[0], piv[1] - 0.5], fx: 'impact' }),
    mk({ ...d3, pearl: 0, eye: 0 }, { rot: [-Math.PI / 2, piv[0], piv[1] - 0.5] }),
  ];
  return {
    idle: new Animation(idle, 6),
    walk: new Animation(walk, 10),
    windup: new Animation(windup, 6, false),
    strike: new Animation(strike, 12, false),
    hurt: new Animation(hurt, 10, false),
    death: new Animation(death, 9, false),
  };
}


// ================================================================ Tempelwächter

const GW = 92, GH = 68, GAX = 38, GAY = 62;
const GD = { legH: 14, thigh: 7.5, shin: 8, spine: 12, upper: 6.5, fore: 6.5, sh: 1.5, hipW: 2.5 };
const BRZ = ['#24180e', '#402a16', '#62421e', '#8a5e2a', '#b4803c', '#dcb068'];
const VERD = ['#12302a', '#1e4a40', '#2e6858', '#468e76', '#6cb498', '#9ad6b8'];
const TURQ = ['#0e5a5a', '#1ea0a0', '#50e0d8', '#aefcf4', '#ffffff'];
const G_REST = {
  hipX: 0, hipY: 0, lean: 0.04, head: 0, fFx: 6, fFy: 0, fBx: -6, fBy: 0,
  hFx: 8, hFy: 8, hBx: 3, hBy: 9, ta: -1.35, grip: 0, eye: 1, glowK: 0.6, kneel: 0, crack: 0, held: 1,
};
const gpose = (o = {}) => ({ ...G_REST, ...o });

// Bronze mit Grünspan: Grundton aus der Bronzerampe, in Schattenbereichen
// und zusammenhängenden Flecken durch Patina ersetzt. Die Flecken kommen aus
// grobem Wertrauschen (Raster 3 px), damit sie als Flächen lesen und nicht
// als Pixelsprenkel.
function blot(x, y, seed) {
  const gx = x / 3, gy = y / 3, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
}
function patina(p, x, y, k, seed) {
  // k: 0..3 Helligkeitsstufe
  const X = Math.round(x), Y = Math.round(y);
  const n = blot(X, Y, seed % 7 + 3);
  const shade = k <= 1;
  if (n < (shade ? 0.5 : 0.28)) p.px(X, Y, VERD[Math.min(5, k + 1 + (n < 0.14 ? 1 : 0))]);
  else p.px(X, Y, BRZ[k + 1 + (k >= 3 && n > 0.86 ? 1 : 0)]);
}
// Bronzeglied, pixelgenau gerastert wie limb()
function bronzeLimb(p, x0, y0, x1, y1, w0, w1, seed, dark = 0) {
  const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy || 0.0001, len = Math.sqrt(len2);
  let nx = -dy / len, ny = dx / len;
  if (nx + ny > 0) { nx = -nx; ny = -ny; }
  const R = Math.max(w0, w1) / 2 + 1;
  const xa = Math.floor(Math.min(x0, x1) - R), xb = Math.ceil(Math.max(x0, x1) + R);
  const ya = Math.floor(Math.min(y0, y1) - R), yb = Math.ceil(Math.max(y0, y1) + R);
  for (let Y = ya; Y <= yb; Y++) for (let X = xa; X <= xb; X++) {
    const t = Math.max(0, Math.min(1, ((X - x0) * dx + (Y - y0) * dy) / len2));
    const ox = X - (x0 + dx * t), oy = Y - (y0 + dy * t);
    const hw = Math.max(0.62, (w0 + (w1 - w0) * t) / 2);
    if (ox * ox + oy * oy > hw * hw + 0.15) continue;
    const k = ox * nx + oy * ny;
    let lvl = k > hw - 1 ? 3 : k < -hw + 1 ? 0 : k > 0 ? 2 : 1;
    lvl = Math.max(0, lvl - dark);
    patina(p, X, Y, lvl, seed);
  }
}
function barnacles(p, x, y, n, seed) {
  for (let i = 0; i < n; i++) {
    const bx = x + (hash2(i, 1, seed) - 0.5) * 4, by = y + (hash2(i, 2, seed) - 0.5) * 3;
    p.px(bx, by, BARN[1]); p.px(bx - 1, by, BARN[2]); p.px(bx, by + 1, BARN[0]);
  }
}

function trident(p, g, hx, hy, a, glowK) {
  const dx = Math.cos(a), dy = Math.sin(a);
  let nx = -dy, ny = dx; if (nx + ny > 0) { nx = -nx; ny = -ny; }
  bronzeLimb(p, hx - dx * 14, hy - dy * 14, hx + dx * 16, hy + dy * 16, 2, 2, 91);
  // Querstück + drei Zinken mit Widerhaken
  const bx = hx + dx * 16, by = hy + dy * 16;
  bronzeLimb(p, bx - nx * 4, by - ny * 4, bx + nx * 4, by + ny * 4, 2.5, 2.5, 92);
  for (const k of [-3.5, 0, 3.5]) {
    const L = k === 0 ? 9 : 7;
    const sx = bx + nx * k, sy = by + ny * k;
    bronzeLimb(p, sx, sy, sx + dx * L, sy + dy * L, 2, 1, 93 + k);
    p.px(sx + dx * L, sy + dy * L, BRZ[5]);
    p.px(sx + dx * (L - 2) + nx * Math.sign(k || 1), sy + dy * (L - 2) + ny * Math.sign(k || 1), BRZ[4]);
  }
  // leuchtender Edelstein im Querstück
  p.px(bx, by, TURQ[2]);
  if (glowK > 0.1) { g.px(bx, by, TURQ[3]); g.px(bx + nx, by + ny, TURQ[1]); g.px(bx - nx, by - ny, TURQ[1]); }
  // Tangfetzen am Schaft
  const wx = hx + dx * 6, wy = hy + dy * 6;
  p.px(wx, wy + 1, WEED[3]); p.px(wx, wy + 2, WEED[2]); p.px(wx - 0.5, wy + 3, WEED[2]); p.px(wx - 1, wy + 4, WEED[1]);
  return { x: bx + dx * 9, y: by + dy * 9 };
}

function drawGuardian(p, g, P, X) {
  const K = P.kneel;
  const PP = { ...P, hipY: P.hipY + K * 6 };
  const R = rig(PP, GD, GAX, GAY);
  const { hip, chest, pt, legF, legB, shF, shB } = R;
  const meta = {};
  if (K > 0.01) {
    const kx = hip.x - 3 - K * 3, ky = GAY - 1;
    legB.jx += (kx - legB.jx) * K; legB.jy += (ky - legB.jy) * K;
    legB.ex += (kx - 8 - legB.ex) * K; legB.ey += (GAY - legB.ey) * K;
  }
  const hF = { x: chest.x + P.hFx, y: chest.y + P.hFy };
  const hB = P.grip > 0.5 ? { x: hF.x - Math.cos(P.ta) * 7, y: hF.y - Math.sin(P.ta) * 7 } : { x: chest.x + P.hBx, y: chest.y + P.hBy };
  const armF = ik(shF.x, shF.y, hF.x, hF.y, GD.upper, GD.fore, 1);
  const armB = ik(shB.x, shB.y, hB.x, hB.y, GD.upper, GD.fore, 1);
  const gk = P.glowK;

  // --- Rückenflosse / Kamm-Umhang aus Bronzeschuppen (hinten)
  const back = pt(GD.spine - 1, -4);
  for (let i = 0; i < 6; i++) {
    const x = back.x - 1 - i * 0.6, y = back.y + i * 2.5;
    p.ellipse(x, y, 2.5, 1.6, i % 2 ? VERD[1] : VERD[2]); p.px(x - 1, y - 1, VERD[3]);
  }
  // --- hinteres Bein
  bronzeLimb(p, hip.x - 2.5, hip.y, legB.jx, legB.jy, 5, 4.5, 11, 1);
  bronzeLimb(p, legB.jx, legB.jy, legB.ex, legB.ey - 2, 5, 5, 12, 1);
  p.rect(legB.ex - 3, legB.ey - 2, 7, 2, BRZ[1]); p.rect(legB.ex - 3, legB.ey - 2, 7, 1, VERD[1]);
  // --- hinterer Arm
  bronzeLimb(p, shB.x, shB.y, armB.jx, armB.jy, 4.5, 4, 13, 1);
  bronzeLimb(p, armB.jx, armB.jy, armB.ex, armB.ey, 4.5, 4, 14, 1);
  p.ellipse(armB.ex, armB.ey, 2, 2, BRZ[1]);

  // --- Rumpf: Brustpanzer, Schuppenrock
  for (let i = 0; i < 6; i++) {
    const a = pt(-1, -5 + i * 2);
    const hgt = 7 - Math.abs(i - 2.5) * 0.8;
    for (let j = 0; j < hgt; j++) patina(p, a.x, a.y + j, j === 0 ? 3 : i % 2 ? 1 : 2, 21 + i);
    for (let j = 0; j < hgt; j++) patina(p, a.x + 1, a.y + j, j === 0 ? 3 : 2, 27 + i);
    p.px(a.x, a.y + hgt, VERD[1]);
  }
  const hp = pt(0, 0.5), cp = pt(GD.spine, 1);
  bronzeLimb(p, hp.x, hp.y, cp.x, cp.y, 11, 14, 31);
  const q = (u, k, c) => { const o = pt(u, k); p.px(o.x, o.y, c); };
  // Brustplatte: modellierte Muskeln, Gürtel, Wellenornament
  for (let k = -5.5; k <= 6; k += 0.5) { q(1, k, BRZ[1]); q(1.8, k, BRZ[3]); }
  for (let k = -4; k <= 5; k += 2) q(1.4, k, BRZ[5]);
  q(8, 1, BRZ[5]); q(8.5, 2, BRZ[5]); q(8, 3, BRZ[4]); q(7, 4, BRZ[1]); q(6, 1.5, BRZ[1]); q(5, 1.5, BRZ[1]);
  q(4, 3, BRZ[1]); q(4, 0, BRZ[1]);
  // Wellen-Ornament quer über die Brust (leuchtende Einlage)
  for (let k = -4; k <= 5; k += 1) {
    const u = 10 + Math.sin(k * 1.3) * 0.7;
    q(u, k, VERD[0]);
  }
  const rune = pt(6.5, 2.5);
  p.px(rune.x, rune.y, TURQ[1]);
  if (gk > 0.1) { g.px(rune.x, rune.y, TURQ[2]); g.px(rune.x, rune.y - 1, TURQ[0]); g.px(rune.x + 1, rune.y, TURQ[0]); }
  // Risse (Tod) mit türkisem Licht
  if (P.crack > 0) {
    const cr = [[3, -2], [5, -1], [6, 1], [8, 2], [9, 4]];
    for (let i = 0; i < cr.length * P.crack; i++) { q(cr[i][0], cr[i][1], '#081418'); const o = pt(cr[i][0], cr[i][1]); if (gk > 0.1) g.px(o.x, o.y, TURQ[1]); }
  }
  barnacles(p, pt(3, -4).x, pt(3, -4).y, 3, 41);

  // --- vorderes Bein: Beinschiene mit Knieplatte
  bronzeLimb(p, hip.x + 2.5, hip.y, legF.jx, legF.jy, 5.5, 5, 15);
  bronzeLimb(p, legF.jx, legF.jy, legF.ex, legF.ey - 2, 5.5, 5.5, 16);
  p.ellipse(legF.jx, legF.jy, 2.5, 2.2, BRZ[3]); p.px(legF.jx - 1, legF.jy - 1, BRZ[5]);
  p.rect(legF.ex - 3, legF.ey - 2, 8, 2, BRZ[2]); p.rect(legF.ex - 3, legF.ey - 2, 8, 1, BRZ[4]);
  barnacles(p, legF.ex, legF.ey - 4, 2, 43);

  // --- Schulter hinten (Panzer)
  p.ellipse(shB.x - 1, shB.y, 4, 3, VERD[1]); p.ellipse(shB.x - 1.5, shB.y - 0.8, 3, 1.8, VERD[2]);

  // --- Kopf: Helm mit Flossenkamm, Gesichtsmaske, türkise Augen
  const neck = pt(GD.spine + 2, 1);
  const hx = Math.round(neck.x + P.head), hy = Math.round(neck.y - 4);
  // Flossenkamm (fächert nach hinten)
  for (let i = 0; i < 7; i++) {
    const bx = hx - 3 + i * 0.9, by = hy - 4;
    const h = 3 + Math.sin(i / 6 * Math.PI) * 4;
    for (let j = 0; j < h; j++) p.px(bx - j * 0.55, by - j, j === Math.floor(h) - 1 ? VERD[4] : i % 2 ? VERD[2] : VERD[3]);
  }
  // Helm als Pixelkarte: gewölbte Kuppe (Licht oben links), strenge Gesichtsmaske
  // mit Brauenschatten, glühendem Augenschlitz, Nase und schmalem Mund
  const eyeOn = P.eye > 0.3;
  pmap(p, hx - 4, hy - 4, [
    '..hhsshm..',
    '.hsshhmmm.',
    'hshhmmmmmd',
    'hhmmVmdddd',
    'hmmvmdeeEm',
    'dmmmmmmmhs',
    'dhmmvmmmm.',
    '.dmmmmkkd.',
    '..ddmmmd..',
  ], { s: BRZ[5], h: BRZ[4], m: BRZ[3], d: BRZ[2], o: BRZ[1], v: VERD[2], V: VERD[3], k: '#0a1210', e: eyeOn ? TURQ[2] : '#0a1210', E: eyeOn ? TURQ[3] : '#0a1210' });
  // Wangen-/Nackenschutz hinten
  p.rect(hx - 5, hy, 2, 4, BRZ[2]); p.px(hx - 5, hy, BRZ[4]); p.px(hx - 4, hy + 3, VERD[2]);
  if (eyeOn) {
    g.rect(hx + 2, hy, 3, 1, TURQ[3]); g.px(hx + 4, hy, TURQ[4]);
    g.px(hx + 5, hy, TURQ[1]); g.px(hx + 3, hy - 1, TURQ[0]); g.px(hx + 3, hy + 1, TURQ[0]);
    if (gk > 0.9) { g.px(hx + 6, hy, TURQ[1]); g.px(hx + 7, hy, TURQ[0]); }
  }
  meta.eye = { x: hx + 4, y: hy };
  meta.head = { x: hx, y: hy - 8 };
  meta.mouth = { x: hx + 4, y: hy + 3 };
  barnacles(p, hx - 4, hy - 1, 1, 47);

  // --- vorderer Arm + Dreizack
  const drawArm = () => {
    bronzeLimb(p, shF.x, shF.y, armF.jx, armF.jy, 5, 4.5, 17);
    bronzeLimb(p, armF.jx, armF.jy, armF.ex, armF.ey, 5, 4.5, 18);
    p.ellipse(armF.jx, armF.jy, 2, 2, BRZ[3]);
  };
  if (X.smear) smearArc(p, g, shF.x, shF.y, X.smear[0], X.smear[1], 14, 34, COLD, COLD_G, X.smear[2] ?? 1);
  drawArm();
  const tip = P.held > 0.5 ? trident(p, g, hF.x, hF.y, P.ta, gk) : { x: hF.x, y: hF.y };
  p.ellipse(hF.x, hF.y, 2.2, 2.2, BRZ[3]); p.px(hF.x - 1, hF.y - 1, BRZ[5]);
  // Schulterpanzer vorne mit Seepocken
  p.ellipse(shF.x + 0.5, shF.y, 4.5, 3.5, BRZ[2]); p.ellipse(shF.x, shF.y - 1, 3.5, 2.2, BRZ[4]);
  p.px(shF.x - 2, shF.y - 2, BRZ[5]); p.line(shF.x - 3, shF.y + 3, shF.x + 4, shF.y + 3, VERD[2]);
  barnacles(p, shF.x + 1, shF.y - 1, 2, 49);
  // Tang über der Schulter
  p.px(shF.x - 2, shF.y + 3, WEED[3]); p.px(shF.x - 2, shF.y + 4, WEED[2]); p.px(shF.x - 3, shF.y + 5, WEED[2]); p.px(shF.x - 3, shF.y + 6, WEED[1]);
  meta.hand = hF;
  meta.tip = tip;
  return meta;
}

function guardianAnims() {
  const mk = (P, X) => makeFrame(GW, GH, GAX, GAY, drawGuardian, P, X);
  const idle = [];
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU;
    idle.push(mk(gpose({ hipY: Math.sin(a) > 0.4 ? 1 : 0, glowK: 0.5 + Math.sin(a) * 0.4, hFy: 8 + (Math.sin(a) > 0.4 ? 0.5 : 0) })));
  }
  // schwerer, langsamer Schritt – Rumpf sackt beim Aufsetzen
  const walk = [];
  for (let i = 0; i < 8; i++) {
    const ph = i / 8 * TAU, s = Math.sin(ph), c = Math.cos(ph);
    walk.push(mk(gpose({
      fFx: 1 + s * 6, fFy: Math.max(0, -c) * 2.5, fBx: -1 - s * 6, fBy: Math.max(0, c) * 2.5,
      hipY: Math.abs(s) < 0.4 ? 1.5 : 0, lean: 0.08, hFx: 8 + s * 0.8, ta: -1.33 + s * 0.04, hBx: 3 - s * 2, glowK: 0.6,
    }), { fx: i === 2 || i === 6 ? 'step' : null }));
  }
  // langes Ausholen: Dreizack beidhändig weit zurück, Augen glühen auf
  const w1 = gpose({ grip: 1, hFx: 4, hFy: 4, ta: -0.4, lean: 0, glowK: 0.8 });
  const w2 = gpose({ grip: 1, hFx: 0, hFy: 2, ta: -0.3, lean: -0.1, hipX: -1.5, fFx: 8, fBx: -8, glowK: 1 });
  const w3 = gpose({ grip: 1, hFx: -4, hFy: 1, ta: -0.25, lean: -0.16, hipX: -3, hipY: 1, fFx: 9, fFy: 2, fBx: -8, glowK: 1.2 });
  const windup = [mk(G_REST), mk(mixP(G_REST, w1, 0.5)), mk(w1), mk(w2), mk(w3)];
  // Stoß mit Stampfen: vorderer Fuß kracht auf, Zinken schnellen nach vorn
  const s1 = gpose({ grip: 1, hFx: 12, hFy: 4, ta: -0.1, lean: 0.25, hipX: 3, hipY: 1, fFx: 11, fFy: 2, fBx: -8, glowK: 1.2 });
  const s2 = gpose({ grip: 1, hFx: 17, hFy: 6, ta: 0.08, lean: 0.35, hipX: 5, hipY: 3, fFx: 13, fFy: 0, fBx: -8, glowK: 1.2 });
  const s3 = gpose({ grip: 1, hFx: 16, hFy: 7, ta: 0.1, lean: 0.32, hipX: 4.5, hipY: 3, fFx: 13, fBx: -8, glowK: 1 });
  const s4 = gpose({ grip: 0, hFx: 10, hFy: 8, ta: -0.8, lean: 0.15, hipX: 2, hipY: 1, fFx: 9, fBx: -7, glowK: 0.8 });
  const strike = [
    mk(s1, { smear: [-0.5, -0.1, 0.5] }),
    mk(s2, { fx: 'impact' }),
    mk(s3),
    mk(s4),
  ];
  const hurtP = gpose({ lean: -0.12, hipX: -1.5, head: -1, hFx: 6, hFy: 7, ta: -1.6, glowK: 1.3, eye: 1 });
  const hurt = [mk(hurtP), mk(mixP(hurtP, G_REST, 0.5))];
  // Tod: Risse brechen auf, sinkt auf ein Knie, kippt vornüber
  const d1 = gpose({ lean: -0.15, hipX: -2, head: -1, hFx: 7, hFy: 9, ta: -1.8, crack: 0.4, glowK: 1.4 });
  const d2 = gpose({ kneel: 1, lean: 0.25, head: 1, hFx: 12, hFy: 12, ta: 1.35, crack: 0.8, glowK: 1, fFx: 7, fBx: -10 });
  const d3 = gpose({ kneel: 1, lean: 0.45, head: 2, hFx: 13, hFy: 14, ta: 1.4, crack: 1, glowK: 0.6, eye: 0.6, fFx: 7, fBx: -10 });
  const piv = [GAX + 3, GAY - 1];
  const flat = gpose({ lean: 0.05, head: 1, fFx: 3, fBx: -2, hFx: 10, hFy: 12, ta: 1.5, crack: 1, glowK: 0, eye: 0, held: 0 });
  const dropped = (p, g) => { trident(p, g, GAX + 14, GAY - 2, -0.06, 0); return {}; };
  const death = [
    mk(d1), mk(d2, { fx: 'impact' }), mk(d3),
    mk({ ...d3, glowK: 0.4, held: 0 }, { rot: [0.55, ...piv], post: dropped }),
    mk({ ...d3, glowK: 0.2, eye: 0.4, held: 0 }, { rot: [1.15, ...piv], post: dropped }),
    mk({ ...flat, glowK: 0.15 }, { rot: [Math.PI / 2, GAX, GAY - 1], fx: 'impact', post: dropped }),
    mk(flat, { rot: [Math.PI / 2, GAX, GAY - 1], post: dropped }),
  ];
  return {
    idle: new Animation(idle, 5),
    walk: new Animation(walk, 8),
    windup: new Animation(windup, 6, false),
    strike: new Animation(strike, 11, false),
    hurt: new Animation(hurt, 9, false),
    death: new Animation(death, 7, false),
  };
}

// ================================================================ Export

export function createTempleFoes() {
  return {
    drowned: drownedAnims(),
    tide_cultist: cultistAnims(),
    temple_guardian: guardianAnims(),
  };
}
