import { hash2 } from '../core/math.js';
import { AX, AY, bonelordRig, rigBossSprites, pt, ell, hair, limb, knob, smear } from './bonelord.js';

// Sternenglut Teil 1: die drei Dungeonbosse auf Varkhuls Rig (sprites/bonelord.js) mit vollem Bewegungssatz für
// entities/Boss.js. Jede Gestalt zeichnet dieselben Posen anders: Ysgarn als alter Baumgärtner mit Sense,
// Kaldris als Kristallritter mit Malgareths Glutsplitter in der Brust, Ysmeine als Schattenelfenkönigin mit Sternglefe.
// Blickrichtung rechts, Licht von links oben, Leuchtebene in der Grundrampe (Phase 3: zweite Rampe).

const HOLE = '#0a060c';

// ---------------------------------------------------------------- Werkzeuge

// Gefülltes Vieleck (Weltkoordinaten); c = Farbe oder fn(x, y) -> Farbe
function poly(p, pts, c) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  p.each(x0, y0, x1, y1, (x, y) => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside ? (typeof c === 'function' ? c(x, y) : c) : null;
  });
}

// Spitzer Splitter/Dorn von (x0, y0) nach (x1, y1), Basisbreite w; ramp = [Schatten, Mitte, Licht, Grat, Kante]
function spike(p, x0, y0, x1, y1, w, ramp) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len, ny = dx / len;
  if (nx + ny > 0) { nx = -nx; ny = -ny; }   // Normale nach links oben = Lichtseite
  const h = w / 2;
  poly(p, [[x0 + nx * h, y0 + ny * h], [x1, y1], [x0 - nx * h, y0 - ny * h]], (x, y) => {
    const o = (x - x0) * nx + (y - y0) * ny, t = ((x - x0) * dx + (y - y0) * dy) / (len * len), hw = h * (1 - t);
    if (Math.abs(o) < 0.3) return ramp[3];
    if (o > hw - 0.55) return ramp[4];
    return o > 0 ? ramp[2] : o < -hw + 0.55 ? ramp[0] : ramp[1];
  });
}

// Fünfzackiger Stern
function star(p, cx, cy, r, c, rot = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < 10; i++) { const a = rot + (i * Math.PI) / 5, q = i % 2 ? r * 0.42 : r; pts.push([cx + Math.cos(a) * q, cy + Math.sin(a) * q]); }
  poly(p, pts, c);
}

// Kleine Blüte: vier Blätter um eine helle Mitte (ramp = Blütenrampe)
function blossom(p, x, y, ramp, big = false) {
  const s = big ? 1 : 0.5;
  for (const [ox, oy, k] of [[-s, 0, 2], [s, 0, 2], [0, -s, 3], [0, s, 1]]) { pt(p, x + ox, y + oy, ramp[k]); if (big) pt(p, x + ox * 0.5, y + oy * 0.5, ramp[k]); }
  pt(p, x, y, ramp[4]);
  if (big) { pt(p, x - s, y - s, ramp[1]); pt(p, x + s, y + s, ramp[0]); }
}

// Schwerer Umhang aus Bahnen (wie Varkhuls Umhang, Rampe mit 5 Stufen). Gibt at(i, v) zurück (Lage auf Bahn i).
function drape(p, P, x0, top0, NC, len0, ramp, { sway = 18, w = 0.95, speckle = 0, seed = 3 } = {}) {
  const q = p.step;
  const geo = (i) => {
    const u = i / (NC - 1), sx = x0 + i * w, top = top0 + Math.abs(u - 0.4) * 3;
    const len = len0 - Math.abs(u - 0.5) * 9 + Math.sin(P.capeT + i * 0.9) * 2.2 + ((hash2(i, 1, seed) * 4) | 0);
    return { u, sx, top, len, x: (v) => sx - P.cape * sway * v * v - (1 - u) * 5 * v + Math.sin(P.capeT * 1.3 + v * 4 + i * 0.4) * 1.4 * v };
  };
  for (let i = 0; i < NC; i++) {
    const { u, top, len, x: X } = geo(i);
    for (let j = 0; j < len; j += q) {
      const v = j / len, x = X(v), fold = Math.sin(i * 1.15 + v * 1.5);
      let s = u < 0.12 ? 4 : u > 0.88 ? 0 : fold > 0.45 ? 3 : fold < -0.45 ? 1 : 2;
      if (v > 0.86 && s > 0) s--;
      if (v < 0.08 && s > 1) s = Math.min(4, s + 1);
      if (speckle && s < 4 && hash2(i * 5 + Math.floor(x * 2), Math.floor((top + j) * 2), seed) < speckle) s++;
      const hi = fold > 0.45 && v < 0.86 ? Math.min(4, s + 1) : s, lo = fold < -0.1 ? Math.max(0, s - 1) : s;
      pt(p, x, top + j, ramp[hi]); pt(p, x + 0.5, top + j, ramp[s]);
      if (i < NC - 1) { pt(p, x + w * 0.6, top + j, ramp[s]); pt(p, x + w, top + j, ramp[lo]); }
    }
  }
  return (i, v) => { const G = geo(i); return { x: G.x(v), y: G.top + G.len * v }; };
}

// Ortspunkt am Rumpf: s entlang der Wirbelsäule ab Hüfte, o quer (nach vorn positiv)
const along = (r, s, o) => ({ x: r.hipX + Math.sin(r.lean) * s + r.perpX * o, y: r.hipY - Math.cos(r.lean) * s + r.perpY * o });

// Zauberglut an der freien Hand
function castGlow(p, g, meta, P, glow) {
  if (P.cast <= 0.05) return;
  const r = 1 + P.cast * 3, { x, y } = meta.cast;
  ell(g, x, y, r + 1, r + 1, glow[1]); ell(g, x, y, r, r, glow[2]);
  ell(g, x, y, Math.max(0.5, r - 1.5), Math.max(0.5, r - 1.5), glow[3]);
  if (p.fine) { ell(g, x - 0.25, y - 0.25, Math.max(0.5, r - 2.6), Math.max(0.5, r - 2.6), glow[4]); pt(p, x, y, glow[3]); }
}

// Leuchtkern (Herz/Splitter/Brosche) mit Puls
function core(p, g, x, y, soul, glow, size = 1) {
  const R = (1.6 + soul * 1.1) * size;
  ell(p, x, y, R, R + 0.6, glow[1]);
  ell(g, x, y, R + 0.8, R + 1.4, glow[1]); ell(g, x, y, R - 0.3, R + 0.2, glow[2]);
  ell(g, x, y - 0.3, Math.max(0.5, R - 1.2), Math.max(0.5, R - 0.9), glow[3]);
  if (p.fine) { ell(p, x, y - 0.3, Math.max(0.5, R - 0.9), Math.max(0.5, R - 0.5), glow[2]); ell(p, x - 0.25, y - 0.5, Math.max(0.5, R - 1.9), Math.max(0.5, R - 1.5), glow[3]); pt(g, x - 0.25, y - 0.5, glow[4]); }
}

// ================================================================ Ysgarn, der Alte Gärtner

const BARK = ['#140e14', '#24181e', '#3a2828', '#563c34', '#76563f', '#9a7652', '#c09c70'];
const MOSS = ['#121e1a', '#1e3226', '#2e4a30', '#44663a', '#628848', '#8cae5c'];
const BLOOM = ['#5a1e46', '#a03a7a', '#d866a6', '#f8a8d0', '#ffe8f4'];
const SCY = ['#1e2a2c', '#3e5652', '#6e9284', '#b4d6c2', '#f4fff8'];
const PINK = ['#4a1238', '#9a2a6a', '#e060a8', '#ffb8dc', '#ffffff'];
const GREEN = ['#0e3a1e', '#2a7a3a', '#5cd068', '#c0ffb0', '#ffffff'];
const barkDark = [BARK[0], BARK[1], BARK[2], BARK[3]];
const barkLight = [BARK[2], BARK[3], BARK[4], BARK[5]];

// Wurzelfuß: vier Wurzeln greifen in den Boden
function rootFoot(p, x, y, ramp, back) {
  for (const [dx, w] of [[-8, 2.6], [-3, 2.2], [5, 2.8], [10, 2.2]]) {
    const ex = x + dx * (back ? 0.85 : 1);
    limb(p, x, y - 3, x + dx * 0.55, y - 1, w + 0.6, w, ramp);
    limb(p, x + dx * 0.55, y - 1, ex, y, w, 0.8, ramp);
  }
  ell(p, x + 1, y - 3, 4, 2.5, ramp[1]);
  if (p.fine) hair(p, x - 2, y - 4.5, x + 3, y - 4.5, ramp[3]);
}

// Zweighand: drei Zweigfinger, offen beim Zaubern
function twigHand(p, x, y, open, ramp, dir = 1) {
  ell(p, x, y, 2, 1.6, ramp[1]);
  for (let k = -1; k <= 1; k++) {
    const a = -Math.PI / 2 + k * (open ? 0.6 : 0.3) + (dir < 0 ? 0.2 : -0.2), l = open ? 5 : 3;
    limb(p, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 1.4, 0.6, ramp);
    if (open && p.fine) pt(p, x + Math.cos(a) * l, y + Math.sin(a) * l - 0.5, MOSS[4]);
  }
}

// Knorriger Schulterwulst mit Moos und Blüten
function burl(p, x, y, rx, ry, ramp, blooms, sprig) {
  ell(p, x, y, rx, ry, ramp[0]); ell(p, x - 0.5, y - 0.5, rx - 1, ry - 1, ramp[1]); ell(p, x - 1.5, y - 1.2, rx - 3, ry - 2.5, ramp[2]);
  ell(p, x - 0.5, y - ry + 1.5, rx - 1.5, 2, MOSS[2]); ell(p, x - 1, y - ry + 1, rx - 3, 1.2, MOSS[3]);
  if (p.fine) for (let k = 0; k < 9; k++) pt(p, x - rx + 2 + hash2(k, 4, 31) * (rx * 2 - 4), y - ry + 0.5 + hash2(k, 5, 31) * 2, k % 3 ? MOSS[4] : MOSS[5]);
  // Blätterbüschel statt Zweig: kleine spitze Blätter fächern nach oben
  if (sprig) for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + (k - 2) * 0.42 + sprig[1] * 0.05, l = sprig[2] * (0.6 + hash2(k, 1, 33) * 0.4), bx = x + sprig[0] + (k - 2) * 1.2, by = y - ry + 1.5;
    spike(p, bx, by, bx + Math.cos(a) * l, by + Math.sin(a) * l, 2.2, [MOSS[1], MOSS[2], MOSS[4], MOSS[5], MOSS[3]]);
  }
  for (const [bx, by] of blooms) blossom(p, x + bx, y + by, BLOOM, true);
  // Moosfransen hängen über den Rand
  for (let k = -rx + 2; k < rx - 1; k += 2) hair(p, x + k, y + ry - 2, x + k - 0.5, y + ry + 1 + hash2(k | 0, 2, 17) * 2.5, MOSS[k % 4 ? 2 : 3]);
}

// Sense: Holzschaft, Klinge auf der Vorderseite des Schwungs, zum Griff hin gekrümmt. Gibt die Klingenspitze zurück.
function scythe(p, g, hx, hy, a, glow) {
  const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx, fine = p.fine, L = 34;
  limb(p, hx - dx * 9, hy - dy * 9, hx + dx * L, hy + dy * L, 2.6, 2.2, [BARK[1], BARK[3], BARK[4], BARK[5]]);
  // Astknoten und Rankenwicklung am Schaft
  for (const s of [-5, 12, 25]) { pt(p, hx + dx * s, hy + dy * s, BARK[1]); pt(p, hx + dx * s + nx * 0.5, hy + dy * s + ny * 0.5, BARK[6]); }
  if (fine) for (let s = -8; s < -1; s += 1.2) hair(p, hx + dx * s - nx, hy + dy * s - ny, hx + dx * (s + 0.8) + nx, hy + dy * (s + 0.8) + ny, MOSS[2]);
  // Zwinge
  const Ex = hx + dx * L, Ey = hy + dy * L;
  ell(p, Ex, Ey, 2.4, 2.4, BARK[1]); ell(p, Ex - 0.4, Ey - 0.4, 1.4, 1.4, MOSS[3]);
  // Klinge
  const q = p.step, e = Math.max(q, 0.5);
  let tip = { x: Ex, y: Ey };
  for (let u = 0; u <= 1; u += q / 22) {
    const sx = Ex + nx * 19 * u - dx * 8 * u * u, sy = Ey + ny * 19 * u - dy * 8 * u * u;
    let tx = nx * 19 - dx * 16 * u, ty = ny * 19 - dy * 16 * u; const tl = Math.hypot(tx, ty); tx /= tl; ty /= tl;
    let ex = -ty, ey = tx; if (ex * -dx + ey * -dy < 0) { ex = -ex; ey = -ey; }   // Schneide zeigt zum Griff
    const w = 4.2 * Math.pow(1 - u, 0.8) + 0.3;
    for (let k = 0; k <= w; k += 0.5 * q) {
      const c = k < 0.7 ? SCY[1] : k > w - e ? SCY[4] : k < w * 0.45 ? SCY[2] : SCY[3];
      pt(p, sx + ex * k, sy + ey * k, c);
    }
    tip = { x: sx, y: sy };
  }
  // Runen der Klinge (Leuchtebene)
  for (let u = 0.12; u < 0.8; u += 0.17) {
    const sx = Ex + nx * 19 * u - dx * 8 * u * u, sy = Ey + ny * 19 * u - dy * 8 * u * u;
    pt(p, sx, sy, glow[2]); g.px(sx, sy, glow[2]);
    if (fine) { pt(g, sx, sy, glow[4]); pt(g, sx + 0.5, sy, glow[3]); }
  }
  if (fine) blossom(p, Ex - nx * 1.5, Ey - ny * 1.5, BLOOM);
  return tip;
}

function drawYsgarn(p, g, P0, glow, extra = {}) {
  const r = bonelordRig(P0);
  const { P, gy, hipX, hipY, lean, chX, chY, perpX, perpY, legF, legB, shF, shB, hF, sa, armF, armB, hx, hy } = r;
  const fine = p.fine, meta = {};

  // --- 1. Moosmantel mit Blüten
  const at = drape(p, P, chX - perpX * 2 - 11, chY - 4, 20, 42 - P.kneel * 12, MOSS, { speckle: 0.07, seed: 41 });
  for (const [i, v] of [[3, 0.35], [7, 0.62], [11, 0.28], [15, 0.55], [5, 0.82], [13, 0.86]]) { const b = at(i, v); blossom(p, b.x, b.y, BLOOM, v < 0.7); }
  for (let i = 1; i < 20; i += 3) { const b = at(i, 1); pt(p, b.x, b.y, MOSS[0]); pt(p, b.x + 0.5, b.y + 0.5, MOSS[1]); hair(p, b.x, b.y, b.x - 1, b.y + 3, BARK[2]); }

  // --- 2. Hinteres Wurzelbein und Zweigarm (dunkler)
  limb(p, hipX - 2, hipY, legB.jx, legB.jy, 6, 5, barkDark);
  limb(p, legB.jx, legB.jy, legB.ex, legB.ey - 2, 5.5, 7, barkDark);
  rootFoot(p, legB.ex, legB.ey, barkDark, true);
  knob(p, legB.jx, legB.jy, 3, barkDark);
  limb(p, shB.x, shB.y, armB.jx, armB.jy, 4, 3.5, barkDark);
  limb(p, armB.jx, armB.jy, armB.ex, armB.ey, 3.5, 3, barkDark);
  twigHand(p, armB.ex, armB.ey, P.cast > 0.3, barkDark, -1);
  meta.cast = { x: armB.ex, y: armB.ey - 4 };

  // --- 3. Stamm mit Wurzelschurz, Rinde, Ranke und Lichtsamen in der Höhlung
  for (let i = 0; i < 6; i++) {
    const x = hipX - 8 + i * 3.2, sw = Math.sin(P.capeT + i * 1.3) * 1.2 + lean * 5, len = 9 + hash2(i, 2, 9) * 5 - Math.abs(i - 2.5) * 0.8;
    limb(p, x, hipY - 1, x + sw * 0.6 - 1, hipY + len, 3, 1, i % 2 ? barkDark : barkLight);
  }
  const top = along(r, 23, 0), bot = along(r, -1, 0);
  limb(p, bot.x, bot.y, top.x, top.y, 15, 19, [BARK[1], BARK[2], BARK[3], BARK[4]]);
  if (fine) {
    // Rindenfurchen: dunkle Fuge, helle Kante links davon
    for (const o of [-6.5, -3.5, -0.5, 2.5, 5.5]) {
      let q0 = null;
      for (let s = 1; s <= 21; s += 1.5) {
        const w = Math.sin(s * 0.55 + o) * 0.6, a = along(r, s, o * (0.8 + s * 0.012) + w);
        if (q0) { hair(p, q0.x, q0.y, a.x, a.y, BARK[1]); if (o < 2) pt(p, a.x - 0.5, a.y, BARK[5]); }
        q0 = a;
      }
    }
  }
  // Moos auf den Schultern
  ell(p, chX - 1, chY + 1.5, 10, 3.5, MOSS[2]); ell(p, chX - 2, chY + 0.8, 8, 2.2, MOSS[3]);
  if (fine) for (let k = 0; k < 14; k++) pt(p, chX - 9 + hash2(k, 1, 43) * 17, chY - 0.5 + hash2(k, 2, 43) * 3, k % 3 ? MOSS[4] : MOSS[5]);
  // Ranke schräg über den Stamm, mit Dornen
  for (let s = 2; s < 20; s += 0.5) {
    const a = along(r, s, -8 + s * 0.8 + Math.sin(s * 0.7) * 1.2);
    pt(p, a.x, a.y, s % 3 < 1.5 ? MOSS[3] : MOSS[2]);
    if (fine && s % 4 === 0) pt(p, a.x + 0.5, a.y - 0.5, MOSS[5]);
  }
  // Höhlung mit Lichtsamen
  const rc = along(r, 14, 1.5);
  ell(p, rc.x, rc.y, 5.8, 7, BARK[4]); ell(p, rc.x + 0.3, rc.y + 0.3, 5, 6.3, BARK[0]); ell(p, rc.x + 0.6, rc.y + 0.8, 4, 5, HOLE);
  core(p, g, rc.x + 0.3, rc.y + 0.8, P.soul, glow);
  if (fine) { pt(p, rc.x - 0.5, rc.y - 2.8, MOSS[4]); pt(p, rc.x + 1, rc.y - 3.2, MOSS[5]); pt(p, rc.x, rc.y - 3.5, MOSS[4]); }
  meta.chest = { x: rc.x, y: rc.y };

  // --- 4. Vorderes Wurzelbein
  limb(p, hipX + 2, hipY, legF.jx, legF.jy, 6.5, 5.5, barkLight);
  limb(p, legF.jx, legF.jy, legF.ex, legF.ey - 2, 6, 7.5, barkLight);
  rootFoot(p, legF.ex, legF.ey, barkLight, false);
  knob(p, legF.jx, legF.jy, 3.2, barkLight);
  ell(p, legF.jx - 0.5, legF.jy - 2.2, 2.6, 1.3, MOSS[3]); pt(p, legF.jx - 1, legF.jy - 2.8, MOSS[5]);

  // --- 5. Hinterer Schulterwulst
  burl(p, shB.x - 2, shB.y + 0.5, 6, 4.2, barkDark, [], [-1, -2, 5]);

  // --- 6. Kopf: Holzmaske mit Astgeweih und Moosbart
  const cx = hx + 8, cy = hy + 8;
  const antler = (pts, w) => {
    for (let i = 0; i < pts.length - 1; i++) limb(p, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w * (1 - i / pts.length), w * (1 - (i + 1) / pts.length) + 0.6, i ? barkLight : barkDark);
  };
  antler([[cx - 3, hy + 3], [cx - 8, hy - 4], [cx - 13, hy - 9], [cx - 15, hy - 16]], 3.4);
  antler([[cx - 8, hy - 4], [cx - 6, hy - 11], [cx - 7, hy - 15]], 2);
  antler([[cx - 12, hy - 8], [cx - 18, hy - 9]], 1.6);
  antler([[cx + 1, hy + 2], [cx + 3, hy - 6], [cx + 1, hy - 12], [cx + 3, hy - 18]], 3.2);
  antler([[cx + 3, hy - 6], [cx + 9, hy - 10], [cx + 12, hy - 11]], 1.8);
  for (const [x, y, big] of [[cx - 15, hy - 16, 1], [cx - 7, hy - 15, 1], [cx - 18, hy - 9, 0], [cx + 3, hy - 18, 1], [cx + 12, hy - 11, 1], [cx - 4, hy - 7, 0], [cx + 6, hy - 8, 0]]) blossom(p, x, y, BLOOM, !!big);
  for (const [x, y] of [[cx - 11, hy - 6], [cx + 1, hy - 14], [cx + 8, hy - 9.5]]) { pt(p, x, y, MOSS[4]); pt(p, x + 0.5, y + 0.5, MOSS[2]); pt(p, x - 0.5, y, MOSS[3]); }
  meta.head = { x: cx - 4, y: hy - 14 };
  // Maske: langes Oval, Licht oben links, Holzmaserung
  ell(p, cx, cy + 1.5, 7.5, 9.5, BARK[1]);
  ell(p, cx - 0.3, cy + 0.9, 6.6, 8.7, BARK[3]);
  ell(p, cx - 1, cy - 1, 4.8, 5.8, BARK[4]);
  ell(p, cx - 1.5, cy - 4, 3, 2, BARK[5]);
  if (fine) for (const o of [-4, -1.5, 2.5]) for (let y = -6; y < 7; y += 0.5) pt(p, cx + o + Math.sin(y * 0.6 + o) * 0.7, cy + y, BARK[2]);
  // Brauenwulst, Nasengrat, Nasenknorren
  for (let x = -4; x <= 7; x += 0.5) { pt(p, cx + x, cy - 2.2 - x * 0.08, x < 4 ? BARK[5] : BARK[4]); pt(p, cx + x, cy - 1.5 - x * 0.08, BARK[1]); }
  for (let y = -1; y <= 3.5; y += 0.5) { pt(p, cx + 3.5, cy + y, BARK[5]); pt(p, cx + 4, cy + y, BARK[2]); }
  ell(p, cx + 6.2, cy + 2, 1.6, 1.4, BARK[4]); pt(p, cx + 5.8, cy + 1.5, BARK[6]); pt(p, cx + 6.5, cy + 3, BARK[1]);
  // Augenhöhlen mit Glimmen
  ell(p, cx + 5.5, cy + 0.2, 1.9, 1.2, HOLE); ell(p, cx - 1.8, cy + 0.2, 1.7, 1.1, HOLE);
  if (P.eye > 0.2) {
    for (const [x, y, k] of [[cx + 5.5, cy, 3], [cx + 6, cy, 2], [cx + 5, cy + 0.5, 2], [cx - 1.8, cy, 2], [cx - 1.3, cy, 1]]) { pt(p, x, y, glow[k]); pt(g, x, y, glow[Math.min(4, k + 1)]); }
    if (P.eye > 0.8) { pt(g, cx + 6.5, cy - 0.5, glow[2]); pt(g, cx + 4.5, cy, glow[1]); }
  }
  meta.eye = { x: cx + 5.5, y: cy };
  // Mund: schmaler Spalt, öffnet sich mit dem Kiefer
  const jaw = P.jaw;
  ell(p, cx + 3.2, cy + 5 + jaw * 0.6, 2, 0.5 + jaw * 1.2, HOLE);
  if (jaw > 0.4) { pt(g, cx + 3.2, cy + 5.2 + jaw, glow[1]); pt(p, cx + 3.2, cy + 5.2 + jaw, glow[1]); }
  // Moosbart hängt bis auf die Brust (nach den Schultern gezeichnet)
  const beard = () => {
    for (let i = 0; i < 11; i++) {
      const x0 = cx - 3 + i * 0.9, y0 = cy + 6 + jaw + Math.abs(i - 5) * 0.3, len = 9 + hash2(i, 3, 47) * 7 - Math.abs(i - 5) * 0.7;
      for (let j = 0; j < len; j += p.step) {
        const v = j / len, x = x0 - P.cape * 4 * v * v - Math.max(0, P.lean) * 6 * v + Math.sin(P.capeT + i + v * 3) * 0.6 * v;
        pt(p, x, y0 + j, MOSS[v > 0.82 ? 1 : i === 1 || i === 6 ? 5 : i % 3 === 0 ? 4 : i % 2 ? 2 : 3]);
      }
    }
    blossom(p, cx + 1, cy + 11 + jaw, BLOOM, true); blossom(p, cx + 4.5, cy + 14 + jaw, BLOOM);
  };

  // --- 7. Schwung-Schleier
  if (extra.smear) { const s = extra.smear; smear(p, g, shF.x, shF.y, s[0], s[1], 14, 14 + 12.5 + 40, glow, [SCY[4], SCY[3], '#e8c8dc', '#8a6a84']); }

  // --- 8. Vorderer Zweigarm, Sense, Schulterwulst
  const drawArm = () => {
    limb(p, shF.x, shF.y, armF.jx, armF.jy, 5, 4.2, barkLight);
    limb(p, armF.jx, armF.jy, armF.ex, armF.ey, 4.5, 4, barkLight);
    knob(p, armF.jx, armF.jy, 2.8, barkLight);
    ell(p, armF.ex, armF.ey, 2.6, 2.4, BARK[3]); pt(p, armF.ex - 1, armF.ey - 1, BARK[5]);
  };
  let tip;
  if (extra.swordBehind) { tip = scythe(p, g, hF.x, hF.y, sa, glow); drawArm(); }
  else {
    drawArm(); tip = scythe(p, g, hF.x, hF.y, sa, glow);
    // Zweigfinger um den Schaft
    for (let k = -1; k <= 1; k++) limb(p, hF.x - 1.5, hF.y + k * 1.2 - 0.5, hF.x + 1.8, hF.y + k * 1.2, 1.4, 1.1, barkLight);
  }
  burl(p, shF.x + 2, shF.y + 0.5, 7, 4.8, barkLight, [[-3.5, -3.5], [2.5, -4]], [0, 2, 6]);
  beard();
  meta.hand = { x: hF.x, y: hF.y };
  meta.tip = tip;
  castGlow(p, g, meta, P, glow);
  return meta;
}

function collapseYsgarn(p, g, k, glow) {
  const gy = AY, cx = AX + 2;
  scythe(p, g, cx + 30, gy - 2, Math.PI - 0.03, glow);   // Sense liegt hinter dem Haufen
  ell(p, cx - 2, gy - 2, 18 + k * 6, 4, MOSS[1]); ell(p, cx - 4, gy - 3, 13 + k * 4, 2.8, MOSS[2]);
  for (let i = 0; i < 14; i++) pt(p, cx - 16 + hash2(i, 1, 51) * 28, gy - 4.5 + hash2(i, 2, 51) * 3, MOSS[4]);
  // zerbrochene Äste und Wurzeln
  for (let i = 0; i < 16; i++) {
    const a = hash2(i, 2, 5) * Math.PI, rr = 4 + hash2(i, 3, 5) * (12 + k * 8);
    const x = cx + Math.cos(a) * rr - 4, y = gy - 3 - hash2(i, 4, 5) * (7 * (1 - k * 0.6));
    const l = 4 + hash2(i, 6, 5) * 6, ang = hash2(i, 7, 5) * Math.PI;
    limb(p, x, y, x + Math.cos(ang) * l, y + Math.sin(ang) * l * 0.6, 3.6, 1.8, i % 2 ? barkDark : barkLight);
  }
  // Stammstück mit Höhlung, Samen erlischt
  limb(p, cx - 12, gy - 6 + k * 2, cx + 2, gy - 7 + k * 2, 9 - k * 2, 10 - k * 2, [BARK[1], BARK[2], BARK[3], BARK[4]]);
  ell(p, cx - 5, gy - 7 + k * 2, 2.6, 3 - k, HOLE);
  if (k < 0.8) core(p, g, cx - 5, gy - 7 + k * 2, 0.6 - k * 0.6, glow, 0.8);
  // Maske liegt
  ell(p, cx + 12, gy - 6 + k * 2, 7, 5, BARK[3]); ell(p, cx + 11, gy - 7 + k * 2, 5, 3.5, BARK[4]);
  ell(p, cx + 10, gy - 7 + k * 2, 1.4, 1, HOLE); ell(p, cx + 15, gy - 7 + k * 2, 1.4, 1, HOLE);
  limb(p, cx + 7, gy - 9 + k * 2, cx + 2, gy - 15 + k * 3, 2.5, 1, barkLight); blossom(p, cx + 2, gy - 15 + k * 3, BLOOM, true);
  // Blüten verstreut
  for (let i = 0; i < 7; i++) blossom(p, cx - 20 + hash2(i, 9, 53) * 44, gy - 3 - hash2(i, 8, 53) * 4, BLOOM, i % 2 === 0);
}

// ================================================================ Kaldris, der Splitterfürst

const GLASS = ['#0a1826', '#12304a', '#1e5274', '#3a84a8', '#6cbcd8', '#b0e8f4', '#f4feff'];
const PLATE = ['#0c1020', '#182034', '#263452', '#3a5276', '#5c7ca2'];
const NAVY = ['#060a16', '#0c1428', '#14203c', '#1e2e52', '#2c4068'];
const EMBER = ['#4a0e06', '#a8280c', '#f0602a', '#ffb070', '#fff4d8'];
const CYAN = ['#0e3a5a', '#2a7ab0', '#5ccbea', '#c8f6ff', '#ffffff'];
const MAGENTA = ['#3a0e4a', '#8a2aa0', '#d860e8', '#f8c0ff', '#ffffff'];
const shardLight = [GLASS[1], GLASS[3], GLASS[4], GLASS[6], GLASS[5]];
const shardDark = [GLASS[0], GLASS[1], GLASS[3], GLASS[4], GLASS[2]];

// Kristall-Großschwert: Griff aus dunklem Stahl, Parierstange aus Splittern, facettierte Glasklinge
const KBLADE = 46;
function crystalSword(p, g, hx, hy, a, glow) {
  const dx = Math.cos(a), dy = Math.sin(a);
  let nx = -dy, ny = dx; if (nx + ny > 0) { nx = -nx; ny = -ny; }
  const q = p.step, fine = p.fine, e = Math.max(q, 0.5);
  limb(p, hx - dx * 7, hy - dy * 7, hx + dx, hy + dy, 2, 2, [PLATE[0], PLATE[1], PLATE[2], PLATE[3]]);
  if (fine) for (let s = -6.5; s <= 0; s += 1.5) hair(p, hx + dx * s - nx * 0.9, hy + dy * s - ny * 0.9, hx + dx * (s + 0.7) + nx * 0.9, hy + dy * (s + 0.7) + ny * 0.9, GLASS[3]);
  spike(p, hx - dx * 7.5, hy - dy * 7.5, hx - dx * 11, hy - dy * 11, 3, shardLight);
  spike(p, hx + dx * 2.5 + nx * 0.5, hy + dy * 2.5 + ny * 0.5, hx + dx * 1 + nx * 8, hy + dy * 1 + ny * 8, 3, shardLight);
  spike(p, hx + dx * 2.5 - nx * 0.5, hy + dy * 2.5 - ny * 0.5, hx + dx * 1 - nx * 8, hy + dy * 1 - ny * 8, 3, shardDark);
  ell(p, hx + dx * 2.5, hy + dy * 2.5, 2, 2, PLATE[1]); pt(p, hx + dx * 2.5, hy + dy * 2.5, glow[2]); pt(g, hx + dx * 2.5, hy + dy * 2.5, glow[3]);
  const bx = hx + dx * 4, by = hy + dy * 4;
  for (let s = 0; s <= KBLADE; s += 0.5 * q) {
    const f = s / KBLADE, hw0 = 3.8 - 1.3 * f - (f > 0.84 ? (f - 0.84) * 21 : 0);
    if (hw0 <= 0.2) continue;
    const hw = fine ? hw0 + 0.25 : hw0;
    for (let k = -hw; k <= hw; k += 0.5 * q) {
      let c;
      if (k > hw - e) c = GLASS[5];
      else if (k < -hw + e) c = GLASS[1];
      else if (Math.abs(k) < 0.5 * q + 0.1) c = GLASS[6];
      else c = k > 0 ? GLASS[4] : GLASS[2];
      // innere Bruchflächen: helle Querbänder
      if (c === GLASS[2] && ((s + k * 1.5) % 9) < 0.6) c = GLASS[3];
      if (c === GLASS[4] && hash2(Math.round(s * 2), Math.round(k * 2), 61) < 0.04) c = GLASS[6];
      pt(p, bx + dx * s + nx * k, by + dy * s + ny * k, c);
    }
  }
  for (let s = 4; s < KBLADE - 5; s += 4) {
    pt(g, bx + dx * s, by + dy * s, glow[1]);
    if (s % 8 === 0) { pt(g, bx + dx * s, by + dy * s, glow[3]); pt(p, bx + dx * s, by + dy * s, glow[3]); }
  }
  return { x: bx + dx * KBLADE, y: by + dy * KBLADE };
}

// Kristallbüschel auf einer Schulterplatte
function crystalPauldron(p, x, y, rx, ry, ramp, shards) {
  const pts = [[x - rx, y + 1], [x - rx * 0.6, y - ry], [x + rx * 0.4, y - ry * 1.1], [x + rx, y - ry * 0.1], [x + rx * 0.75, y + ry], [x - rx * 0.7, y + ry * 0.9]];
  poly(p, pts, (X, Y) => {
    const u = (X - x) / rx, v = (Y - y) / ry;
    if (Math.abs(v + 0.25 - u * 0.15) < 0.09) return GLASS[4];
    if (v < -0.25 + u * 0.15) return u < 0.1 ? PLATE[4] : ramp[2];
    if (Math.abs(u - 0.15) < 0.07) return GLASS[3];
    return u < 0.15 ? ramp[1] : ramp[0];
  });
  for (let l = 1; l <= 2; l++) for (let xx = -rx * 0.7 + l; xx < rx * 0.75 - l * 0.5; xx += p.step) { pt(p, x + xx, y + ry * 0.9 + l * 1.5, l === 1 ? ramp[1] : ramp[0]); pt(p, x + xx, y + ry * 0.9 + l * 1.5 - 0.5, GLASS[l === 1 ? 4 : 3]); }
  for (const [sx, h, lean2, w] of shards) spike(p, x + sx, y - ry + 2, x + sx + lean2, y - ry + 2 - h, w, shardLight);
}

function drawKaldris(p, g, P0, glow, extra = {}) {
  const r = bonelordRig(P0);
  const { P, gy, hipX, hipY, lean, chX, chY, perpX, perpY, legF, legB, shF, shB, hF, sa, armF, armB, hx, hy } = r;
  const fine = p.fine, meta = {};

  // --- 1. Nachtblauer Umhang, darüber ein Behang aus hängenden Glassplittern
  drape(p, P, chX - perpX * 2 - 11, chY - 3, 20, 40 - P.kneel * 12, NAVY, { seed: 63 });
  for (let i = 0; i < 9; i++) {
    const u = i / 8, x0 = chX - perpX * 2 - 10 + i * 2.2, y0 = chY - 2 + Math.abs(u - 0.4) * 2;
    const len = 15 + hash2(i, 1, 67) * 12 - Math.abs(u - 0.5) * 6;
    const ex = x0 - P.cape * 9 - (1 - u) * 3 + Math.sin(P.capeT + i * 0.8) * 1.2;
    spike(p, x0, y0, ex, y0 + len, 3.2, i % 2 ? shardDark : shardLight);
  }

  // --- 2. Hinteres Bein und Arm (dunkler)
  const plDark = [PLATE[0], PLATE[0], PLATE[1], PLATE[2]];
  limb(p, hipX - 2, hipY, legB.jx, legB.jy, 5.5, 4.5, plDark);
  limb(p, legB.jx, legB.jy, legB.ex, legB.ey - 2, 6.5, 6, [GLASS[0], GLASS[1], GLASS[2], GLASS[3]]);
  poly(p, [[legB.ex - 3, legB.ey - 4], [legB.ex + 4, legB.ey - 4], [legB.ex + 9, legB.ey], [legB.ex - 3, legB.ey]], (x, y) => (y < legB.ey - 3 ? GLASS[3] : x > legB.ex + 3 ? GLASS[1] : GLASS[2]));
  spike(p, legB.jx, legB.jy, legB.jx + 4, legB.jy - 4, 3, shardDark);
  limb(p, shB.x, shB.y, armB.jx, armB.jy, 3.5, 3.5, plDark);
  limb(p, armB.jx, armB.jy, armB.ex, armB.ey, 4.5, 4, [GLASS[0], GLASS[1], GLASS[2], GLASS[3]]);
  ell(p, armB.ex, armB.ey, 2.2, 2, PLATE[1]);
  const open = P.cast > 0.3 || P.grip > 0.5;
  for (let k = -1; k <= 1; k++) spike(p, armB.ex + k * 1.2, armB.ey - 0.5, armB.ex + k * (open ? 2.6 : 1.4), armB.ey - (open ? 5 : 3), 1.4, shardLight);
  meta.cast = { x: armB.ex, y: armB.ey - 4 };

  // --- 3. Facettierter Brustpanzer mit Glutsplitter, Schöße aus Glasplatten
  for (let i = 0; i < 5; i++) {
    const a = along(r, 0, -7 + i * 3.4), sw = Math.sin(P.capeT + i) * 0.8 + lean * 4, len = 10 - Math.abs(i - 2) * 1.2;
    spike(p, a.x, a.y, a.x + sw * 0.4 + 0.5, a.y + len, 4, i % 2 ? shardDark : shardLight);
  }
  const T = [[22.5, -8], [24, -2], [22.5, 8.5], [15, 10.5], [6, 7.5], [0, 6.5], [-1.5, 0], [-1, -6.5], [8, -8], [16, -9]].map(([s, o]) => { const a = along(r, s, o); return [a.x, a.y]; });
  const sl = Math.sin(lean), cl = Math.cos(lean);
  poly(p, T, (x, y) => {
    const dx = x - hipX, dy = y - hipY, s = dx * sl - dy * cl, o = dx * perpX + dy * perpY;
    if (Math.abs(o + 2.5) < 0.3 || Math.abs(o - 1.5) < 0.3) return o < 0 ? GLASS[3] : GLASS[5];
    if (Math.abs(s - 12 + o * 0.4) < 0.3 && o > 1.5) return GLASS[4];
    if (s > 20.5) return o < 1.5 ? PLATE[4] : PLATE[3];
    if (o < -2.5) return PLATE[3];
    if (o < 1.5) return s > 9 ? PLATE[2] : PLATE[1];
    return s > 12 - o * 0.4 ? PLATE[3] : PLATE[1];
  });
  // Glaseinlagen an den Schultern und Gürtel aus Kristall
  for (const o of [-6, 5]) { const a = along(r, 19, o); spike(p, a.x, a.y + 1.5, a.x, a.y - 2.5, 3, shardLight); }
  for (let o = -7; o <= 7; o += p.step) { const a = along(r, 0.5, o); pt(p, a.x, a.y, Math.abs(o) < 1.5 ? GLASS[5] : GLASS[2]); const b = along(r, 1.3, o); pt(p, b.x, b.y, GLASS[3]); }
  // Glutsplitter: Riss in der Platte, darin Malgareths Splitter (bleibt glutrot, auch in Phase 3)
  const rc = along(r, 13.5, 2);
  if (fine) for (const [ax, ay] of [[-4, -3], [4, -2], [3.5, 3.5], [-3, 4], [0, -5]]) hair(p, rc.x, rc.y, rc.x + ax, rc.y + ay, PLATE[0]);
  const pulse = 0.8 + P.soul * 0.35;
  poly(p, [[rc.x, rc.y - 4 * pulse], [rc.x + 1.8, rc.y - 0.5], [rc.x + 0.4, rc.y + 3.5 * pulse], [rc.x - 1.6, rc.y + 0.5]], (x) => (x < rc.x - 0.3 ? EMBER[2] : x > rc.x + 0.6 ? EMBER[1] : EMBER[3]));
  ell(g, rc.x, rc.y, 2.5 * pulse + 0.5, 4 * pulse, EMBER[1]); ell(g, rc.x, rc.y, 1.3 * pulse, 2.8 * pulse, EMBER[2]);
  ell(g, rc.x, rc.y - 0.5, 0.7, 1.6 * pulse, EMBER[3]); pt(g, rc.x, rc.y - 0.5, EMBER[4]); pt(p, rc.x, rc.y - 0.5, EMBER[4]);
  meta.chest = { x: rc.x, y: rc.y };

  // --- 4. Vorderes Bein: Kristallschiene, Knie mit Splitterdorn, kantiger Stiefel
  const plLight = [PLATE[1], PLATE[2], PLATE[3], PLATE[4]];
  limb(p, hipX + 2, hipY, legF.jx, legF.jy, 6, 5, plLight);
  limb(p, legF.jx, legF.jy, legF.ex, legF.ey - 2, 7, 6, [GLASS[1], GLASS[2], GLASS[3], GLASS[5]]);
  if (fine) { const mx = (legF.jx + legF.ex) / 2, my = (legF.jy + legF.ey) / 2; hair(p, legF.jx, legF.jy + 2, mx, my, GLASS[6]); hair(p, mx + 1, my - 2, mx + 2.5, my, GLASS[1]); }
  poly(p, [[legF.ex - 3, legF.ey - 4.5], [legF.ex + 4, legF.ey - 4.5], [legF.ex + 10, legF.ey], [legF.ex - 3, legF.ey]], (x, y) => (y < legF.ey - 3.5 ? GLASS[5] : x > legF.ex + 4 ? GLASS[2] : GLASS[3]));
  spike(p, legF.jx, legF.jy, legF.jx + 5, legF.jy - 5, 3.4, shardLight);
  knob(p, legF.jx, legF.jy, 2.6, [GLASS[1], GLASS[2], GLASS[4], GLASS[5]]);

  // --- 5. Hintere Schulterplatte
  crystalPauldron(p, shB.x - 2, shB.y, 6.5, 5, [PLATE[0], PLATE[1], PLATE[2]], [[-3, 8, -3, 3], [1, 6, -1, 2.5]]);

  // --- 6. Kristallhelm mit Splitterkamm, Sehschlitz glimmt
  for (const [x, h, l2, w] of [[3, 9, -4, 3], [6, 14, -3, 3.6], [9.5, 17, -1, 3.8], [13, 11, 1.5, 3]]) spike(p, hx + x, hy + 2.5, hx + x + l2, hy + 2.5 - h, w, shardLight);
  meta.head = { x: hx + 8, y: hy - 12 };
  const jawOff = P.jaw * 1.4;
  poly(p, [[hx + 1.5, hy + 3], [hx + 5.5, hy], [hx + 12, hy], [hx + 16, hy + 3.5], [hx + 17.5, hy + 8], [hx + 15.5, hy + 11], [hx + 4, hy + 12], [hx + 1, hy + 9]], (x, y) => {
    const X = x - hx, Y = y - hy;
    if (Math.abs(X - 11.5) < 0.3) return GLASS[4];
    if (Y < 2.2) return PLATE[4];
    return X < 6 ? PLATE[3] : X < 11.5 ? PLATE[2] : PLATE[1];
  });
  poly(p, [[hx + 4, hy + 11.5 + jawOff], [hx + 15.5, hy + 10.5 + jawOff], [hx + 14, hy + 14.5 + jawOff], [hx + 8, hy + 16 + jawOff], [hx + 4.5, hy + 14.5 + jawOff]], (x, y) => (y - hy - jawOff < 12.5 ? GLASS[4] : x - hx < 9 ? PLATE[2] : PLATE[1]));
  if (jawOff > 0.5) for (let x = 5; x < 15; x += p.step) pt(p, hx + x, hy + 11.5 + jawOff * 0.5, HOLE);
  // Sehschlitz
  for (let x = 8.5; x <= 17; x += p.step) { pt(p, hx + x, hy + 6.5, HOLE); pt(p, hx + x, hy + 7, HOLE); }
  if (P.eye > 0.2) for (const [x, k] of [[13, 3], [13.5, 4], [14, 3], [14.5, 2], [15, 2], [15.5, 1], [10, 2], [10.5, 1]]) { pt(p, hx + x, hy + 6.5, glow[Math.max(1, k - 1)]); pt(g, hx + x, hy + 6.5, glow[k]); pt(g, hx + x, hy + 7, glow[Math.max(0, k - 1)]); }
  if (fine) { hair(p, hx + 2, hy + 3, hx + 5.5, hy + 0.5, GLASS[5]); pt(p, hx + 6, hy + 0.5, GLASS[6]); }
  meta.eye = { x: hx + 14, y: hy + 6.5 };

  // --- 7. Schwung-Schleier
  if (extra.smear) { const s = extra.smear; smear(p, g, shF.x, shF.y, s[0], s[1], 14, 14 + 12.5 + KBLADE * 0.95, glow, [GLASS[6], GLASS[5], '#a8dcf0', '#4a7a9c']); }

  // --- 8. Vorderer Arm, Kristallschwert, Schulterplatte
  const drawArm = () => {
    limb(p, shF.x, shF.y, armF.jx, armF.jy, 4.5, 4, plLight);
    limb(p, armF.jx, armF.jy, armF.ex, armF.ey, 5.5, 5, [GLASS[1], GLASS[2], GLASS[3], GLASS[5]]);
    knob(p, armF.jx, armF.jy, 2.5, [PLATE[1], PLATE[2], PLATE[3], PLATE[4]]);
    spike(p, armF.jx + (armF.ex - armF.jx) * 0.4, armF.jy + (armF.ey - armF.jy) * 0.4, armF.jx - 3, armF.jy - 3, 2.6, shardLight);
  };
  let tip;
  if (extra.swordBehind) { tip = crystalSword(p, g, hF.x, hF.y, sa, glow); drawArm(); }
  else {
    drawArm(); tip = crystalSword(p, g, hF.x, hF.y, sa, glow);
    p.rect(hF.x - 2, hF.y - 2, 4, 4, PLATE[2]); pt(p, hF.x - 2, hF.y - 2, PLATE[4]);
    if (fine) { hair(p, hF.x - 1.5, hF.y - 0.5, hF.x + 1.5, hF.y - 0.5, PLATE[0]); hair(p, hF.x - 1.5, hF.y + 1, hF.x + 1.5, hF.y + 1, PLATE[0]); }
  }
  crystalPauldron(p, shF.x + 2, shF.y, 8, 5.5, [PLATE[1], PLATE[2], PLATE[3]], [[-2, 11, -2, 3.6], [2.5, 8, 2, 3], [6, 5, 3, 2.4]]);
  meta.hand = { x: hF.x, y: hF.y };
  meta.tip = tip;
  castGlow(p, g, meta, P, glow);
  return meta;
}

function collapseKaldris(p, g, k, glow) {
  const gy = AY, cx = AX + 2;
  crystalSword(p, g, cx + 6, gy - 2, Math.PI - 0.03, glow);   // Schwert liegt hinter dem Splitterhaufen
  ell(p, cx - 2, gy - 2, 17 + k * 6, 3.5, NAVY[1]); ell(p, cx - 4, gy - 3, 12 + k * 4, 2.5, NAVY[2]);
  // Splitterhaufen
  for (let i = 0; i < 18; i++) {
    const x = cx - 18 + hash2(i, 1, 71) * (30 + k * 10), y = gy - 2 - hash2(i, 2, 71) * 3;
    const h = (5 + hash2(i, 3, 71) * 10) * (1 - k * 0.4), l2 = (hash2(i, 4, 71) - 0.5) * 8;
    spike(p, x, y, x + l2, y - h, 3 + hash2(i, 5, 71) * 2, i % 3 ? shardLight : shardDark);
  }
  // Brustplatte und Schulterplatten liegen
  ell(p, cx - 6, gy - 4, 7, 3.5, PLATE[2]); ell(p, cx - 7, gy - 5, 5, 2, PLATE[3]);
  ell(p, cx - 16, gy - 3, 5, 2.5, PLATE[1]); ell(p, cx + 2, gy - 2.5, 6, 2.5, PLATE[2]);
  // Helm liegt
  poly(p, [[cx + 8, gy - 2], [cx + 9, gy - 9 + k * 2], [cx + 15, gy - 11 + k * 2], [cx + 20, gy - 7 + k * 2], [cx + 19, gy - 2]], (x) => (x < cx + 13 ? PLATE[3] : PLATE[1]));
  for (let x = cx + 13; x < cx + 19; x += p.step) pt(p, x, gy - 6 + k * 2, HOLE);
  // der Glutsplitter liegt frei und glüht weiter
  const sx = cx - 6, sy = gy - 8;
  poly(p, [[sx, sy - 4], [sx + 1.8, sy], [sx + 0.4, sy + 3.5], [sx - 1.6, sy + 0.5]], (x) => (x < sx - 0.3 ? EMBER[2] : x > sx + 0.6 ? EMBER[1] : EMBER[3]));
  ell(g, sx, sy, 3.5, 5, EMBER[1]); ell(g, sx, sy, 1.6, 3, EMBER[2]); pt(g, sx, sy - 0.5, EMBER[4]); pt(p, sx, sy - 0.5, EMBER[4]);
}

// ================================================================ Königin Ysmeine

const SKIN = ['#1e1630', '#2e2248', '#44346a', '#5e4c8c', '#8070b0', '#a898d0'];
const GOWN = ['#08071a', '#100e2c', '#1a1844', '#26245e', '#363478', '#4a4a96'];
const HAIR = ['#3e4058', '#626680', '#8e92ae', '#bcc0d8', '#e8eaf8'];
const GOLD = ['#4a300c', '#86601c', '#c49434', '#ecc862', '#fff0b8'];
const STEEL = ['#2a2c48', '#565a8a', '#9498c8', '#d4d8f4', '#ffffff'];
const GGLOW = ['#3a2a0a', '#9a7020', '#ecc862', '#fff4c8', '#ffffff'];
const VGLOW = ['#2a1050', '#6a2cb0', '#a060f0', '#e0b8ff', '#ffffff'];
const sleeve = [GOWN[1], GOWN[2], GOWN[3], GOWN[4]];

// Sternglefe: schlanker Schaft, Stern als Zier, gebogene Klinge mit Goldschneide
function glaive(p, g, hx, hy, a, glow) {
  const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx, fine = p.fine, L = 31, q = p.step;
  limb(p, hx - dx * 11, hy - dy * 11, hx + dx * L, hy + dy * L, 1.9, 1.7, [STEEL[0], STEEL[1], STEEL[2], STEEL[3]]);
  for (const s of [-10.5, -3, 3, L - 3]) { limb(p, hx + dx * s, hy + dy * s, hx + dx * (s + 1.2), hy + dy * (s + 1.2), 2.8, 2.8, [GOLD[0], GOLD[1], GOLD[2], GOLD[3]]); }
  const Ex = hx + dx * (L + 1.5), Ey = hy + dy * (L + 1.5);
  // Klinge: Halbmond, Rücken auf der Vorderseite des Schwungs gewölbt
  let tip = { x: Ex, y: Ey };
  for (let s = 0; s <= 17; s += 0.5 * q) {
    const f = s / 17, bow = Math.sin(f * Math.PI) * 2.6, w = 2.8 * (1 - Math.pow(f, 1.6)) + 0.2;
    const cx = Ex + dx * s + nx * bow, cy = Ey + dy * s + ny * bow;
    for (let k = -w; k <= w; k += 0.5 * q) {
      const c = k < -w + 0.55 ? GOLD[3] : k > w - 0.55 ? STEEL[1] : Math.abs(k) < 0.3 ? STEEL[4] : k < 0 ? STEEL[3] : STEEL[2];
      pt(p, cx + nx * k, cy + ny * k, c);
    }
    tip = { x: cx, y: cy };
  }
  // Stern an der Klingenwurzel (Leuchtebene)
  star(p, Ex, Ey, 3.6, GOLD[3], a); star(p, Ex - 0.3, Ey - 0.3, 2, GOLD[4], a);
  star(g, Ex, Ey, 3, glow[1], a); ell(g, Ex, Ey, 1.2, 1.2, glow[3]); pt(g, Ex, Ey, glow[4]);
  if (fine) for (let s = 3; s < 14; s += 3.5) { const f = s / 17, bow = Math.sin(f * Math.PI) * 2.6; pt(g, Ex + dx * s + nx * bow, Ey + dy * s + ny * bow, glow[2]); }
  return tip;
}

function drawYsmeine(p, g, P0, glow, extra = {}) {
  const r = bonelordRig(P0);
  const { P, gy, hipX, hipY, lean, chX, chY, perpX, legF, legB, shF, shB, hF, sa, armF, armB, neckX, neckY, hx, hy } = r;
  const fine = p.fine, meta = {};
  const cx = hx + 9, cy = hy + 8;

  // --- 1. Sternenhimmel-Umhang mit hohem Kragen
  const at = drape(p, P, chX - perpX * 2 - 12, chY - 3, 23, 47 - P.kneel * 12, GOWN, { seed: 81 });
  for (let i = 0; i < 23; i++) for (const v of [0.18, 0.41, 0.63, 0.84]) {
    if (hash2(i, Math.round(v * 100), 83) > 0.32) continue;
    const s = at(i, v + (hash2(i, 7, 83) - 0.5) * 0.1), big = hash2(i, Math.round(v * 10), 85) < 0.3;
    pt(p, s.x, s.y, big ? GOLD[4] : HAIR[3]);
    if (big) { pt(g, s.x, s.y, glow[3]); if (fine) { pt(g, s.x - 0.5, s.y, glow[1]); pt(g, s.x + 0.5, s.y, glow[1]); pt(g, s.x, s.y - 0.5, glow[1]); pt(g, s.x, s.y + 0.5, glow[1]); } }
  }
  for (let i = 0; i < 9; i++) {
    const x = hx - 3 + i * 1.6, h = 9 + (i % 2 ? 0 : 4) - Math.abs(i - 3) * 0.6;
    spike(p, x, chY + 1, x - 1.2 + i * 0.2, chY + 1 - h, 2.4, [GOWN[1], GOWN[2], GOWN[4], GOWN[5], GOWN[3]]);
    if (i % 2 === 0) { pt(p, x - 1.2 + i * 0.2, chY + 1 - h, GOLD[3]); pt(g, x - 1.2 + i * 0.2, chY + 1 - h, glow[2]); }
  }

  // --- 2. Langes Silberhaar fällt über den Umhang
  drape(p, { ...P, cape: P.cape * 0.6 }, cx - 9, cy - 5, 9, 22 + (chY - hy) * 0.4 - P.kneel * 4, HAIR, { sway: 10, w: 0.85, seed: 87 });

  // --- 3. Hinterer Arm (Ärmel), freie Hand
  limb(p, shB.x, shB.y, armB.jx, armB.jy, 3, 3, [GOWN[0], GOWN[1], GOWN[2], GOWN[3]]);
  limb(p, armB.jx, armB.jy, armB.ex, armB.ey, 3, 3.6, [GOWN[0], GOWN[1], GOWN[2], GOWN[3]]);
  ell(p, armB.ex, armB.ey, 1.5, 1.4, SKIN[2]);
  const open = P.cast > 0.3;
  for (let k = -1; k <= 1; k++) limb(p, armB.ex, armB.ey, armB.ex + k * (open ? 1.6 : 0.7), armB.ey - (open ? 4 : 2.5), 1, 0.7, [SKIN[1], SKIN[2], SKIN[3], SKIN[4]]);
  meta.cast = { x: armB.ex, y: armB.ey - 4 };

  // --- 4. Rock: weit bis zum Boden, folgt den Füßen; Goldsaum, Sternstickerei
  const backHem = Math.min(legB.ex, legF.ex) - 8, frontHem = Math.max(legF.ex, legB.ex) + 8;
  ell(p, legF.ex + 5, gy - 1, 3.5, 1.2, GOWN[0]); pt(p, legF.ex + 8.5, gy - 1, GOLD[3]);
  poly(p, [[hipX - 6.5, hipY - 2], [hipX + 6.5, hipY - 2], [hipX + 8.5, hipY + 5], [frontHem, gy - 0.5], [(frontHem + backHem) / 2, gy + 0.5], [backHem, gy], [hipX - 9.5, hipY + 6]], (x, y) => {
    if (y > gy - 1.6) return y > gy - 0.7 ? GOLD[1] : GOLD[3];
    const v = (y - hipY) / (gy - hipY), fold = Math.sin((x - hipX) * (0.9 - v * 0.35) + v * 2 + P.capeT * 0.4);
    let s = x < hipX - 4 - v * 3 ? 1 : x > hipX + 3 + v * 4 ? 2 : 3;
    if (fold > 0.55) s++; else if (fold < -0.55) s--;
    if (s >= 2 && hash2(Math.floor(x * 2), Math.floor(y * 2), 89) < 0.012) return HAIR[4];
    return GOWN[Math.max(0, Math.min(5, s))];
  });
  for (let i = 0; i < 7; i++) {
    const x = backHem + 3 + hash2(i, 1, 91) * (frontHem - backHem - 6), y = hipY + 6 + hash2(i, 2, 91) * (gy - hipY - 10);
    star(p, x, y, 1.4, GOLD[3]); pt(g, x, y, glow[2]);
  }

  // --- 5. Mieder mit Goldborte, Sternbrosche, Hals
  limb(p, hipX, hipY - 1, chX, chY + 2, 8, 11, [GOWN[1], GOWN[2], GOWN[3], GOWN[4]]);
  const w1 = along(r, 1, 0);
  for (const o of [-5, 5]) { const s = along(r, 21, o); hair(p, s.x, s.y, w1.x, w1.y, GOLD[2]); if (fine) hair(p, s.x + 0.5, s.y, w1.x + 0.5, w1.y, GOLD[3]); }
  for (let o = -5; o <= 5; o += p.step) { const b = along(r, 0, o); pt(p, b.x, b.y, GOLD[2]); const b2 = along(r, 0.6, o); pt(p, b2.x, b2.y, GOLD[3]); }
  limb(p, chX + 0.5, chY + 1, neckX + 1.5, neckY - 1, 3.2, 2.6, [SKIN[1], SKIN[2], SKIN[3], SKIN[4]]);
  const rc = along(r, 16, 1.5);
  star(p, rc.x, rc.y, 3, GOLD[2]); star(p, rc.x - 0.2, rc.y - 0.2, 1.8, GOLD[3]);
  core(p, g, rc.x, rc.y, P.soul, glow, 0.45);
  meta.chest = { x: rc.x, y: rc.y };

  // --- 6. Hintere Schulter: Mondsichel aus Silber
  ell(p, shB.x - 1, shB.y, 3.6, 2.6, STEEL[0]); ell(p, shB.x - 1.4, shB.y - 0.4, 2.8, 1.8, STEEL[1]);
  for (let x = -3.5; x <= 2.5; x += p.step) pt(p, shB.x - 1 + x, shB.y + 2.4, GOLD[1]);

  // --- 7. Kopf: Gesicht im Profil, Haarkappe, spitzes Ohr, Stirnreif mit Stern
  ell(p, cx + 0.5, cy + 0.5, 5, 5.8, SKIN[3]);
  poly(p, [[cx - 1, cy + 2.5], [cx + 4.6, cy + 2.6], [cx + 4.2, cy + 5.6], [cx + 2.2, cy + 7.3], [cx, cy + 6.4]], (x, y) => (y > cy + 6 || x < cx + 0.8 ? SKIN[2] : SKIN[3]));
  ell(p, cx + 2.2, cy + 0.2, 2.6, 3.6, SKIN[4]);
  poly(p, [[cx + 4.4, cy - 1.4], [cx + 6.6, cy + 1.8], [cx + 4.4, cy + 2.2]], (x) => (x > cx + 5.6 ? SKIN[3] : SKIN[4]));
  pt(p, cx + 2.5, cy + 2, SKIN[5]); pt(p, cx + 5, cy - 0.5, SKIN[5]); pt(p, cx + 5, cy + 2.3, SKIN[1]);
  // Haarkappe mit Scheitellinie, Koteletten hinter der Wange
  poly(p, [[cx + 4.5, cy - 3.6], [cx + 2.5, cy - 6.2], [cx - 3, cy - 6.8], [cx - 6.2, cy - 4], [cx - 6.6, cy + 1.5], [cx - 5, cy + 5.5], [cx - 1.8, cy + 3.5], [cx - 0.4, cy - 0.8], [cx + 1.8, cy - 3.2]], (x, y) => {
    const t = (x - cx) * 0.55 + (y - cy) * 0.3, k = Math.round(t * 1.6) % 3;
    if (y < cy - 5.6 && x < cx + 1.5) return HAIR[4];
    return k === 0 ? HAIR[1] : x < cx - 3 ? HAIR[2] : HAIR[3];
  });
  // spitzes Ohr ragt aus dem Haar
  poly(p, [[cx - 1.4, cy - 0.6], [cx - 0.2, cy + 2.4], [cx - 9.5, cy - 5.6]], (x, y) => ((x - cx) * 0.45 + (y - cy) > -1.6 ? SKIN[2] : SKIN[4]));
  if (fine) hair(p, cx - 1.2, cy + 0.8, cx - 7.5, cy - 4.2, SKIN[1]);
  // Auge, Braue, Lippen
  for (let x = 2; x <= 4.6; x += p.step) pt(p, cx + x, cy - 1.3 - (x - 3) * 0.15, GOWN[0]);
  for (let x = 1.6; x <= 4.8; x += p.step) pt(p, cx + x, cy - 2.6 - (x - 1.6) * 0.3, HAIR[3]);
  if (P.eye > 0.2) for (const [x, k] of [[3.2, 3], [3.7, 4], [4.2, 3], [2.7, 2]]) { pt(p, cx + x, cy - 0.7, glow[k]); pt(g, cx + x, cy - 0.7, glow[k]); }
  else for (let x = 2.5; x < 4.6; x += p.step) pt(p, cx + x, cy - 0.7, SKIN[1]);
  const jaw = P.jaw;
  for (let x = 3.4; x < 4.8; x += p.step) pt(p, cx + x, cy + 3.8, '#6a3a6a');
  if (jaw > 0.4) { pt(p, cx + 3.9, cy + 4.4, HOLE); pt(p, cx + 4.4, cy + 4.4, HOLE); }
  meta.eye = { x: cx + 3.7, y: cy - 0.7 };
  // Stirnreif am Haaransatz, Stern vorn
  for (let x = -5.5; x <= 4; x += p.step) { const y = cy - 4 - Math.sin(((x + 5.5) / 9.5) * Math.PI) * 1.4; pt(p, cx + x, y, GOLD[2]); pt(p, cx + x, y - 0.5, GOLD[3]); }
  for (const x of [-4, -1.5]) spike(p, cx + x, cy - 5.2, cx + x - 0.3, cy - 7.8, 1.4, [GOLD[0], GOLD[1], GOLD[3], GOLD[4], GOLD[2]]);
  star(p, cx + 1.6, cy - 6.6, 3, GOLD[3]); star(p, cx + 1.4, cy - 6.8, 1.6, GOLD[4]);
  star(g, cx + 1.6, cy - 6.6, 2.4, glow[2]); pt(g, cx + 1.6, cy - 6.6, glow[4]); pt(g, cx + 1.1, cy - 6.6, glow[3]);
  meta.head = { x: cx, y: cy - 12 };

  // --- 8. Schwung-Schleier
  if (extra.smear) { const s = extra.smear; smear(p, g, shF.x, shF.y, s[0], s[1], 14, 14 + 12.5 + 44, glow, [GOLD[4], STEEL[3], '#d8d0f0', '#6a64a0']); }

  // --- 9. Vorderer Arm, Sternglefe, Schulter
  const drawArm = () => {
    limb(p, shF.x, shF.y, armF.jx, armF.jy, 3.4, 3.2, sleeve);
    limb(p, armF.jx, armF.jy, armF.ex, armF.ey, 3.2, 4, sleeve);
    for (let t = 0.6; t <= 1; t += p.step / 6) pt(p, armF.jx + (armF.ex - armF.jx) * t, armF.jy + (armF.ey - armF.jy) * t + 1.6, GOLD[2]);
  };
  let tip;
  if (extra.swordBehind) { tip = glaive(p, g, hF.x, hF.y, sa, glow); drawArm(); }
  else { drawArm(); tip = glaive(p, g, hF.x, hF.y, sa, glow); ell(p, hF.x, hF.y, 1.8, 1.6, SKIN[3]); pt(p, hF.x - 1, hF.y - 1, SKIN[5]); }
  ell(p, shF.x + 1, shF.y, 4.2, 3, STEEL[1]); ell(p, shF.x + 0.6, shF.y - 0.5, 3.3, 2.2, STEEL[2]);
  for (let a = 3.4; a < 4.9; a += 0.1) pt(p, shF.x + 0.6 + Math.cos(a) * 2.8, shF.y - 0.5 + Math.sin(a) * 1.7, STEEL[4]);
  for (let x = -3; x <= 4.5; x += p.step) pt(p, shF.x + x, shF.y + 2.8, GOLD[2]);
  meta.hand = { x: hF.x, y: hF.y };
  meta.tip = tip;
  castGlow(p, g, meta, P, glow);
  return meta;
}

// Ysmeine vergeht zu Sternenstaub: Kleid und Umhang sinken zusammen, Reif und Glefe bleiben liegen.
function collapseYsmeine(p, g, k, glow) {
  const gy = AY, cx = AX + 2;
  glaive(p, g, cx + 16, gy - 2, Math.PI - 0.03, glow);   // Glefe liegt hinter dem Kleid
  ell(p, cx - 3, gy - 2, 20 + k * 5, 4.5 - k, GOWN[1]); ell(p, cx - 4, gy - 3.5, 15 + k * 3, 3.5 - k, GOWN[2]);
  ell(p, cx - 6, gy - 5 + k * 2, 9 - k * 2, 3.5 - k, GOWN[3]); ell(p, cx - 7, gy - 6 + k * 2, 5, 2, GOWN[4]);
  for (let x = -18; x < 14; x += p.step) pt(p, cx + x, gy - 1 + Math.sin(x * 0.4) * 0.6, GOLD[2]);
  for (let i = 0; i < 14; i++) { const x = cx - 20 + hash2(i, 1, 93) * 36, y = gy - 3 - hash2(i, 2, 93) * 4; pt(p, x, y, i % 3 ? HAIR[3] : GOLD[4]); }
  // Silberhaar liegt ausgebreitet
  for (let i = 0; i < 7; i++) for (let t = 0; t < 1; t += p.step / 12) pt(p, cx + 6 + t * 12, gy - 3 - i * 0.5 + Math.sin(t * 5 + i) * 0.7, HAIR[i % 2 ? 2 : 3]);
  // Stirnreif mit Stern
  for (let x = 0; x < 9; x += p.step) pt(p, cx + 20 + x, gy - 2, GOLD[3]);
  star(p, cx + 24, gy - 4, 3, GOLD[3]); star(g, cx + 24, gy - 4, 2.4, glow[2]);
  // aufsteigender Sternenstaub, wird weniger
  for (let i = 0; i < 26; i++) {
    if (hash2(i, 3, 95) < k * 0.7) continue;
    const x = cx - 16 + hash2(i, 4, 95) * 30, y = gy - 6 - hash2(i, 5, 95) * (20 + k * 30);
    pt(p, x, y, i % 4 ? HAIR[4] : GOLD[4]); pt(g, x, y, glow[i % 3 ? 2 : 3]);
    if (p.fine && i % 3 === 0) { pt(g, x - 0.5, y, glow[1]); pt(g, x + 0.5, y, glow[1]); pt(g, x, y - 0.5, glow[1]); pt(g, x, y + 0.5, glow[1]); }
  }
}

// ---------------------------------------------------------------- Sätze

export const createYsgarnSprites = () => rigBossSprites(drawYsgarn, collapseYsgarn, PINK, GREEN);
export const createKaldrisSprites = () => rigBossSprites(drawKaldris, collapseKaldris, CYAN, MAGENTA);
export const createYsmeineSprites = () => rigBossSprites(drawYsmeine, collapseYsmeine, GGLOW, VGLOW);
