import { buildFrame, Animation } from '../gfx/Sprite.js';

// Reittiere (Thread A, INTEGRATION §12.6). Seitenansicht wie die Helden (Blick rechts, links = gespiegelt),
// Licht von oben links. Körperbau aus character/mounts.js (sprite + look), gerastert im feinen Raster
// mit res Feinpixeln je Weltpixel (wie sprites/hero.js, §11.12).
//
// getMountSprites(mountId, def, res) -> { stand (4 Frames), walk (6 Frames) }
// Jeder Frame trägt zusätzlich:
//   frame.seat  = { x, y }  Sattelpunkt relativ zum Fußpunkt (Hüfte des Reiters), wippt mit dem Gang
//   frame.glows = [{ x, y, color, r }]  Augen, Glut, Schatten (Hero.renderEmissive zeichnet sie)

const W = 60, H = 44, AX = 30, AY = 38;
const LX = -0.38, LY = -0.92;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const colorCache = new Map();
function col(c) {
  let v = colorCache.get(c);
  if (v === undefined) {
    const n = parseInt(c.slice(1, 7), 16);
    v = ((0xff << 24) | ((n & 0xff) << 16) | (((n >> 8) & 0xff) << 8) | (n >> 16)) >>> 0;
    colorCache.set(c, v);
  }
  return v;
}

class Raster {
  constructor(s) { this.s = s; this.fw = W * s; this.fh = H * s; this.buf = new Uint32Array(this.fw * this.fh); }
  wx(F) { return (F + 0.5) / this.s - 0.5 - AX; }
  wy(G) { return (G + 0.5) / this.s - 0.5 - AY; }
  fx(x) { return Math.floor((x + 0.5 + AX) * this.s); }
  fy(y) { return Math.floor((y + 0.5 + AY) * this.s); }
  put(F, G, c) { if (c && F >= 0 && G >= 0 && F < this.fw && G < this.fh) this.buf[G * this.fw + F] = col(c); }
  dot(x, y, c) { this.put(this.fx(x), this.fy(y), c); }
  each(x0, y0, x1, y1, fn) {
    const F0 = Math.max(0, this.fx(x0)), F1 = Math.min(this.fw - 1, this.fx(x1));
    const G0 = Math.max(0, this.fy(y0)), G1 = Math.min(this.fh - 1, this.fy(y1));
    for (let G = G0; G <= G1; G++) { const y = this.wy(G); for (let F = F0; F <= F1; F++) fn(this.wx(F), y, F, G); }
  }
  // Kapsel mit Lichtanteil l (-1..1), t entlang, e = Abstand zur Mitte (0..1)
  capsule(x0, y0, x1, y1, r0, r1, shade) {
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1e-6, rm = Math.max(r0, r1);
    this.each(Math.min(x0, x1) - rm - 1, Math.min(y0, y1) - rm - 1, Math.max(x0, x1) + rm + 1, Math.max(y0, y1) + rm + 1, (x, y, F, G) => {
      const t = clamp(((x - x0) * dx + (y - y0) * dy) / L2, 0, 1);
      const ex = x - (x0 + dx * t), ey = y - (y0 + dy * t), d = Math.hypot(ex, ey), r = r0 + (r1 - r0) * t;
      if (d > r + 0.15) return;
      const l = d < 0.01 ? 0.2 : ((ex * LX + ey * LY) / d) * Math.min(1, d / Math.max(0.6, r));
      this.put(F, G, shade(l, t, d / Math.max(0.5, r), x, y));
    });
  }
  ellipse(cx, cy, rx, ry, shade) {
    this.each(cx - rx - 1, cy - ry - 1, cx + rx + 1, cy + ry + 1, (x, y, F, G) => {
      const nx = (x - cx) / rx, ny = (y - cy) / ry, d = nx * nx + ny * ny;
      if (d > 1.04) return;
      const l = (nx * LX + ny * LY) * Math.min(1, Math.sqrt(d) * 1.3);
      this.put(F, G, shade(l, Math.sqrt(d), x, y, nx, ny));
    });
  }
  line(x0, y0, x1, y1, w, c) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * this.s * 1.5)), r = w / 2;
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      const cc = typeof c === 'function' ? c(t) : c;
      if (r <= 0.5 / this.s) this.dot(x, y, cc);
      else this.each(x - r, y - r, x + r, y + r, (px, py, F, G) => { if (Math.hypot(px - x, py - y) <= r + 0.01) this.put(F, G, cc); });
    }
  }
  tri(ax, ay, bx, by, cx, cy, c) {
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(d) < 1e-6) return;
    this.each(Math.min(ax, bx, cx), Math.min(ay, by, cy), Math.max(ax, bx, cx), Math.max(ay, by, cy), (x, y, F, G) => {
      const u = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d, v = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d;
      if (u >= -0.02 && v >= -0.02 && u + v <= 1.02) this.put(F, G, typeof c === 'function' ? c(u, v, x, y) : c);
    });
  }
  blit(ctx) { ctx.putImageData(new ImageData(new Uint8ClampedArray(this.buf.buffer.slice(0)), this.fw, this.fh), 0, 0); }
}

// Farbrampen dunkel -> hell
const COAT = {
  bay: ['#2a140c', '#4a2414', '#6e3a1e', '#945428', '#b8743c'],
  ash: ['#1c1a1e', '#34323a', '#524e58', '#746e7a', '#9a94a0'],
  moss: ['#142010', '#24361c', '#3a5428', '#587838', '#7c9c4c'],
  bone: ['#3a3428', '#6a604c', '#9a8e72', '#c4b898', '#e8dcc0'],
  spore: ['#1a1026', '#2e1c40', '#48306a', '#6a4c94', '#9072b8'],
  frost: ['#3a4a66', '#6a82a4', '#9cb4d0', '#cadcee', '#f0f8ff'],
  coal: ['#0c0a0e', '#1a161c', '#2a242e', '#3e3644', '#5a505e'],
  cinder: ['#140c0c', '#281818', '#3c2622', '#56382e', '#74503e'],
  night: ['#0a0816', '#16122a', '#241e42', '#36305c', '#4c4478'],
};
const MANE = {
  dark: ['#120a08', '#24140e', '#3a2418', '#50341e'],
  soot: ['#0e0c10', '#1e1a22', '#302a36', '#443c4a'],
  reed: ['#2a2a10', '#4a4a1c', '#6e6a2a', '#968e3c'],
  ghost: ['#1a4a2a', '#2e8a4a', '#6ad08a', '#c0ffd0'],
  cap: ['#4a1a3a', '#8a3a6a', '#c86a9a', '#f0a8c8'],
  snow: ['#8aa4c4', '#b8cce4', '#dce8f6', '#ffffff'],
  fire: ['#7a2208', '#c8420c', '#f07a1c', '#ffb640', '#fff0b0'],
  shadow: ['#1a0a2e', '#3a1466', '#6a2cb0', '#a060f0', '#e0b8ff'],
};
const TACK = {
  leather: { strap: ['#1e120c', '#3a2416', '#5a3a22', '#7a5230'], metal: ['#4a4a52', '#7a7a86', '#b0b0bc'], cloth: ['#3a1414', '#6a2020', '#9a3028'] },
  rope: { strap: ['#2a2014', '#4a3a22', '#6e5832', '#927848'], metal: ['#3a3a30', '#6a6a58', '#9a9a80'], cloth: ['#1e2a1a', '#34482a', '#4e6a3c'] },
  iron: { strap: ['#141418', '#2a2a32', '#44444e', '#62626e'], metal: ['#3a3a44', '#6a6c7a', '#a4a6b4'], cloth: ['#1a2a1e', '#2a4a34', '#3e6a4a'] },
  silver: { strap: ['#1e2a3a', '#344a64', '#4e6a8a', '#7090b0'], metal: ['#6a7a8c', '#a4b4c8', '#e0ecf8'], cloth: ['#1a2a4a', '#2a4478', '#4064a4'] },
  gold: { strap: ['#1e120c', '#3a2416', '#5a3a22', '#7a5230'], metal: ['#8a5a18', '#e8a830', '#ffe08a'], cloth: ['#4a0e0e', '#7a1414', '#b02020'] },
};
const EYES = { ghost: '#8affb0', spore: '#e0a0ff', frost: '#c0f0ff', fire: '#ffb640', shadow: '#c07aff' };

const band = (A, v) => A[clamp(Math.round(v), 0, A.length - 1)];
const shadeOf = (A, base = 2, k = 1.4, rim = 0.85) => (l, t, e) => band(A, base + l * k - (e > rim ? 0.7 : 0));
const dim = (A) => [A[0], A[0], A[1], A[2], A[3]];

// Zweigelenk-IK
function ik(ax, ay, bx, by, l1, l2, bend) {
  let dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy) || 0.001;
  const max = l1 + l2 - 0.05;
  if (d > max) { bx = ax + (dx / d) * max; by = ay + (dy / d) * max; dx = bx - ax; dy = by - ay; d = max; }
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const a = Math.atan2(dy, dx) - bend * Math.acos(cosA);
  return { jx: ax + Math.cos(a) * l1, jy: ay + Math.sin(a) * l1, ex: bx, ey: by };
}

// Körperbau je Art (Weltpixel, Fußpunkt 0/0, Blick rechts)
const BODY = {
  horse: { legs: 4, rump: [-8, -13.5], chest: [7, -13.5], rB: 5.2, rC: 5.4, hip: [-7.5, -11.5], sh: [6.5, -11.5], up: 5.6, low: 6.2, legR: [1.7, 1.05], hoof: 'hoof',
    neck: [[8.5, -15.5], [12, -23]], neckR: [3.2, 2.1], head: [[12, -24.5], [17.2, -20.2]], headR: [2.5, 1.5], ear: 'horse', tail: 'long', stride: 3.6, lift: 2.6, seat: [-0.5, -18.6] },
  wolf: { legs: 4, rump: [-7, -11], chest: [6, -11.5], rB: 4.2, rC: 5.2, hip: [-6.5, -9.5], sh: [6, -9.5], up: 4.6, low: 5.2, legR: [1.8, 1.1], hoof: 'paw',
    neck: [[8, -13], [11, -16.5]], neckR: [3.6, 2.6], head: [[11.5, -17], [17, -15.2]], headR: [2.9, 1.2], ear: 'wolf', tail: 'bushy', stride: 3.4, lift: 2.4, seat: [-0.5, -15.6] },
  elk: { legs: 4, rump: [-8, -14], chest: [7, -14.5], rB: 5.2, rC: 6.2, hip: [-7.5, -12], sh: [6.5, -12], up: 5.8, low: 6.4, legR: [1.7, 1.0], hoof: 'hoof',
    neck: [[8.5, -16.5], [11.5, -22.5]], neckR: [3.8, 2.4], head: [[11.8, -23.5], [16.8, -20.5]], headR: [2.6, 1.6], ear: 'horse', tail: 'stub', horns: 'antler', stride: 3.4, lift: 2.4, seat: [-0.5, -19.8] },
  strider: { legs: 2, rump: [-5.5, -16], chest: [4.5, -16.5], rB: 5.4, rC: 5, hip: [-0.5, -13.5], up: 7, low: 7.6, legR: [1.5, 0.75], hoof: 'claw',
    neck: [[5, -18], [9.5, -27]], neckR: [2.4, 1.5], head: [[9.2, -28], [12, -27.4]], headR: [1.9, 1.3], beak: true, ear: null, tail: 'plume', stride: 4.2, lift: 3.2, seat: [-1, -21.2] },
  beetle: { legs: 6, shell: true, rump: [-10, -11], chest: [9, -11], rB: 7, rC: 6.4, hip: [-1, -7.5], up: 4.2, low: 5, legR: [1.3, 0.8], hoof: 'claw',
    head: [[11, -11], [16, -10.2]], headR: [3.6, 2.4], horns: 'mandible', ear: null, tail: null, stride: 2.8, lift: 1.8, seat: [-1, -19] },
  drake: { legs: 4, plan: 'drake', rump: [-6.5, -11.6], chest: [6, -12.4], rB: 4.4, rC: 5.2, hip: [-6.5, -9.8], sh: [5.6, -9.6], up: 5.2, low: 5, legR: [2, 1.3], hoof: 'claw',
    neck: [[8, -14], [10.6, -20.2], [13.2, -24.2]], neckR: [3.4, 2.5, 2], head: [[14.2, -25.4], [21, -23.6], [15, -23.4], [20, -22.6]], headR: [2.3, 1], ear: null, horns: 'drake', tail: 'lizard', wings: true, stride: 3, lift: 1.8, seat: [-0.5, -16.8] },
};

// Beinposition im Gang (wie die Helden): Stand vorne -> hinten, Schwung angehoben nach vorne
function footAt(ph, stride, lift) {
  const q = ((ph % TAU) + TAU) % TAU;
  if (q < Math.PI) return [Math.cos(q) * stride, 0];
  const w = q - Math.PI;
  return [-Math.cos(w) * stride, lift * Math.pow(Math.sin(w), 0.8)];
}

// Schlackendrache: eigener Bauplan (Seitenansicht, Blick rechts). Langer S-Hals, Keilkopf mit Kiefer und
// zurückgelegten Hörnern, halb gehobene Schwingen mit Fingerknochen, Schuppen mit heller Bauchplatte,
// Rückenzacken, langer Schwanz mit Spaten, Krallen. Schlacke: Kohle-/Obsidianschuppen, glühende Risse.
const SLAG = ['#0e0b0f', '#1d171b', '#2f2629', '#483a37', '#68554d', '#8c7262'];
const SLAG_BELLY = ['#2a1009', '#4e1e0e', '#7a3212', '#a84a18', '#d06a22'];
const SLAG_WING = ['#1e0806', '#3a0f08', '#5e1a0c', '#86280f', '#b03c14', '#d85a1c'];
const DRAKE_HORN = ['#2e2620', '#5a4a3a', '#968066', '#d8c6a4'];
const EMBER = ['#c8420c', '#ff8a30', '#ffb640', '#fff0b0'];

function drawDrake(R, G, B, look, pose) {
  const T = TACK[look.tack] ?? TACK.gold;
  const bob = pose.bob, nod = pose.nod, ph = pose.ph, walk = pose.walk;
  const S = SLAG, Sd = [S[0], S[0], S[1], S[2], S[3], S[4]];
  // Schuppenraster: versetzte Reihen, dunkle Unterkante je Schuppe
  const scale = (x, y) => { const r = Math.floor(y / 1.1), u = (x / 1.3 + r * 0.5) % 1, v = (y / 1.1) % 1; return (v < 0 ? v + 1 : v) > 0.72 && Math.abs((u < 0 ? u + 1 : u) - 0.5) < 0.35 ? -0.7 : 0; };
  // Kapsel mit Bauchseite (unten bzw. vorne) in heller Plattenfarbe
  const seg = (x0, y0, x1, y1, r0, r1, A = S, belly = 0.4, base = 2.3) => {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
    let nx = -dy / L, ny = dx / L; if (ny < 0) { nx = -nx; ny = -ny; }
    R.capsule(x0, y0, x1, y1, r0, r1, (l, t, e, x, y) => {
      const cx = x0 + dx * t, cy = y0 + dy * t, r = Math.max(0.5, r0 + (r1 - r0) * t);
      const side = ((x - cx) * nx + (y - cy) * ny) / r;
      if (belly < 1 && side > belly) {
        const seam = ((t * L) % 1.5) < 0.42 ? 1 : 0;
        return band(SLAG_BELLY, 2.4 + l * 1.2 - seam - (e > 0.9 ? 0.8 : 0));
      }
      return band(A, base + l * 1.7 - (e > 0.86 ? 0.8 : 0) + (e < 0.8 ? scale(x, y) : 0));
    });
  };
  const spike = (x, y, ang, h, w, c0 = S[1], c1 = S[4]) => {
    // Zacke: Basis quer zur Richtung ang (rad, 0 = nach oben), helle linke Flanke
    const ux = Math.sin(ang), uy = -Math.cos(ang), px = -uy, py = ux;
    const tx = x + ux * h, ty = y + uy * h;
    R.tri(x - px * w, y - py * w, x + px * w, y + py * w, tx, ty, (u) => (u > 0.5 ? c1 : c0));
  };

  // ---- Beine: kurz, kräftig, Krallen ----
  const legs = [{ root: [B.hip[0], B.hip[1] + bob], ph: 0, near: true, fore: false }, { root: [B.sh[0], B.sh[1] + bob], ph: Math.PI / 2, near: true, fore: true },
    { root: [B.hip[0], B.hip[1] + bob], ph: Math.PI, near: false, fore: false }, { root: [B.sh[0], B.sh[1] + bob], ph: Math.PI * 1.5, near: false, fore: true }];
  const drawLeg = (L) => {
    const [fx, lift] = walk ? footAt(ph + L.ph, B.stride, B.lift) : [0, 0];
    const ax = L.root[0] + (L.near ? 0.6 : -0.9) + fx, ay = -1.1 - lift;
    const k = ik(L.root[0], L.root[1], ax, ay, B.up, B.low, L.fore ? 1 : -1);
    const A = L.near ? S : Sd;
    const sh = (l, t, e, x, y) => band(A, 2.2 + l * 1.5 - (e > 0.86 ? 0.8 : 0) + scale(x, y));
    if (!L.fore) R.ellipse(L.root[0] - 0.2, L.root[1] - 0.4, 3.8, 3.9, (l, d, x, y) => band(A, 2.3 + l * 1.6 - (d > 0.9 ? 0.8 : 0) + scale(x, y)));
    R.capsule(L.root[0], L.root[1], k.jx, k.jy, L.fore ? 2.3 : 2.6, 1.6, sh);
    R.capsule(k.jx, k.jy, k.ex, k.ey, 1.5, 1.2, sh);
    R.capsule(k.ex - 0.4, k.ey + 0.3, k.ex + 1.4, k.ey + 0.5, 1.1, 0.9, sh);
    const cl = L.near ? DRAKE_HORN[2] : DRAKE_HORN[1];
    for (const o of [0.4, 1.4, 2.3]) R.line(k.ex + o, k.ey + 0.5, k.ex + o + 0.8, k.ey + 1.2, 0.45, cl);
  };
  for (const L of legs) if (!L.near) drawLeg(L);

  // ---- Schwanz: lang, spitz zulaufend, Spaten am Ende ----
  const sway = walk ? 1.6 : 0.6;
  const tp = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    tp.push([B.rump[0] - 2.5 - t * 17, B.rump[1] - 0.6 + bob * (1 - t) + t * 7.5 - t * t * t * 3.2 + Math.sin(ph * (walk ? 1 : 0.5) + t * 3.2) * t * sway]);
  }
  for (let i = 0; i < 10; i++) seg(tp[i][0], tp[i][1], tp[i + 1][0], tp[i + 1][1], 3.3 - i * 0.29, 3.3 - (i + 1) * 0.29, S, 0.45);
  for (let i = 1; i < 9; i += 1) {
    const [x, y] = tp[i], r = 3.3 - i * 0.29, a = Math.atan2(tp[i + 1][1] - y, tp[i + 1][0] - x);
    spike(x, y - r * 0.85, a + Math.PI * 0.5 - 0.5, 1.6 - i * 0.1, 0.55);
  }
  for (let i = 2; i < 9; i++) R.line(tp[i][0], tp[i][1] + 0.3, tp[i + 1][0], tp[i + 1][1] + 0.3 + (i % 2 ? -0.5 : 0.5), 0.45, i % 3 ? EMBER[0] : EMBER[1]);
  G.push({ x: Math.round(tp[5][0]), y: Math.round(tp[5][1]), color: '#ff6a20', r: 2 });
  {
    const [ex, ey] = tp[10], [qx, qy] = tp[9], a = Math.atan2(ey - qy, ex - qx), ux = Math.cos(a), uy = Math.sin(a), px = -uy, py = ux;
    const tip = [ex + ux * 3.4, ey + uy * 3.4], w1 = [ex + ux * 0.8 + px * 1.8, ey + uy * 0.8 + py * 1.8], w2 = [ex + ux * 0.8 - px * 1.8, ey + uy * 0.8 - py * 1.8];
    R.tri(ex, ey, w1[0], w1[1], tip[0], tip[1], S[3]); R.tri(ex, ey, w2[0], w2[1], tip[0], tip[1], S[2]);
    R.line(ex, ey, tip[0], tip[1], 0.5, EMBER[0]);
    G.push({ x: Math.round(tip[0] - ux), y: Math.round(tip[1] - uy), color: '#ff6a20', r: 1.6 });
  }

  // ---- Schwingen: Arm hoch nach hinten, Finger fächern, Flughaut mit Bögen ----
  const flap = walk ? Math.sin(ph) * 1.8 : Math.sin(ph * 0.5) * 0.4;
  const wing = (near) => {
    const o = near ? [0, 0] : [3.2, -2.2], M = near ? SLAG_WING : [SLAG_WING[0], SLAG_WING[0], SLAG_WING[1], SLAG_WING[2], SLAG_WING[3], SLAG_WING[3]];
    const sh = [B.sh[0] - 2.2 + o[0], B.sh[1] - 6.4 + bob + o[1]];
    const wr = [-4 + o[0], -28.6 + bob + flap * 0.6 + o[1]];
    const tips = [[-17.5, -31.5 + flap * 1.4], [-22.5, -24.5 + flap * 1.1], [-20, -17.2 + flap * 0.6], [-13, -15.4 + flap * 0.3]].map(([x, y]) => [x + o[0] * 0.8, y + bob + o[1]]);
    const back = [-7 + o[0] * 0.5, -15.6 + bob + o[1] * 0.5];
    const panels = [[wr, tips[0], tips[1]], [wr, tips[1], tips[2]], [wr, tips[2], tips[3]], [wr, tips[3], back], [wr, back, sh]];
    panels.forEach(([a, b, c], pi) => {
      R.tri(a[0], a[1], b[0], b[1], c[0], c[1], (u, v) => {
        const w = 1 - u - v, s = v + w;
        const cut = pi < 3 ? 0.2 * Math.sin(Math.PI * clamp(v / (s || 1), 0, 1)) : 0;
        if (u < cut) return null;
        if (pi < 3 && u < cut + 0.05) return M[near ? 5 : 3];
        return pi < 3 ? band(M, 1.4 + (1 - u) * 2.6 - pi * 0.2) : band(M, 0.6 + (1 - u) * 1.6 + (pi === 4 ? (1 - v) * 0.8 : 0));
      });
    });
    // Adern (glühend) und Fingerknochen
    if (near) for (let i = 0; i < 3; i++) { const a = tips[i], b = tips[i + 1]; const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; R.line(wr[0] + (m[0] - wr[0]) * 0.25, wr[1] + (m[1] - wr[1]) * 0.25, wr[0] + (m[0] - wr[0]) * 0.7, wr[1] + (m[1] - wr[1]) * 0.7, 0.45, EMBER[0]); }
    const bone = near ? [S[2], S[4], S[5]] : [S[1], S[2], S[3]];
    for (const t of tips) R.line(wr[0], wr[1], t[0], t[1], near ? 0.8 : 0.7, (u) => bone[u < 0.6 ? 1 : 0]);
    R.capsule(sh[0], sh[1], wr[0], wr[1], near ? 1.5 : 1.2, near ? 1.0 : 0.8, (l) => band(bone, 1 + l * 1.4));
    R.line(wr[0], wr[1], wr[0] + 1.6, wr[1] - 1.8, 0.7, near ? DRAKE_HORN[3] : DRAKE_HORN[1]);   // Daumenkralle
    for (const t of tips) R.dot(t[0], t[1], near ? DRAKE_HORN[2] : DRAKE_HORN[1]);
  };
  wing(false);

  // ---- Rumpf: lang, flach, Bauchplatten, glühende Risse ----
  const rump = [B.rump[0], B.rump[1] + bob], chest = [B.chest[0], B.chest[1] + bob];
  seg(rump[0], rump[1], chest[0], chest[1], B.rB, B.rC, S, 0.42);
  for (let i = 0; i < 5; i++) spike(rump[0] - 2.5 + i * 1.6, rump[1] - B.rB - 0.1 - i * 0.12, -0.45, 1.8, 0.6);
  for (const [a, b2, c2, d] of [[-6.5, -9.2, -3.5, -7.6], [-3.5, -7.6, -1.2, -8.4], [0.5, -9, 3, -7.4], [3, -7.4, 5.4, -8.6]]) R.line(a, b2 + bob, c2, d + bob, 0.55, EMBER[1]);
  R.line(-4, -12.8 + bob, -2.2, -11.2 + bob, 0.5, EMBER[0]);
  G.push({ x: -2, y: Math.round(-8 + bob), color: '#ff6a20', r: 4 }, { x: 4, y: Math.round(-8 + bob), color: '#ff8a30', r: 2.5 });

  // ---- Hals (S-Kurve) und Keilkopf ----
  const hn = [nod * 0.3, nod];
  const np = [[B.neck[0][0], B.neck[0][1] + bob], [B.neck[1][0] + hn[0] * 0.5, B.neck[1][1] + bob + hn[1] * 0.5], [B.neck[2][0] + hn[0], B.neck[2][1] + bob + hn[1]]];
  const nr = B.neckR;
  seg(np[0][0], np[0][1], np[1][0], np[1][1], nr[0], nr[1], S, 0.35);
  seg(np[1][0], np[1][1], np[2][0], np[2][1], nr[1], nr[2], S, 0.35);
  for (let i = 0; i < 5; i++) {
    const t = i / 5, a = i < 3 ? np[0] : np[1], b2 = i < 3 ? np[1] : np[2], tt = i < 3 ? t * 5 / 3 : (t * 5 - 3) / 2;
    const x = a[0] + (b2[0] - a[0]) * tt, y = a[1] + (b2[1] - a[1]) * tt, r = i < 3 ? nr[0] + (nr[1] - nr[0]) * tt : nr[1] + (nr[2] - nr[1]) * tt;
    spike(x - r * 0.75, y - r * 0.55, -0.95, 1.7, 0.55);
  }
  const hd = B.head.map(([x, y]) => [x + hn[0], y + bob + hn[1]]);    // [Schädel, Schnauzenspitze, Kieferwinkel, Kinn]
  const jawOpen = walk ? 0 : (Math.sin(ph) > 0.7 ? 0.4 : 0);
  // Unterkiefer, dann Schädel/Schnauze als Keil
  R.capsule(hd[2][0], hd[2][1] + jawOpen, hd[3][0], hd[3][1] + jawOpen * 1.6, 1.3, 0.6, (l, t, e) => band(SLAG_BELLY, 1.8 + l * 1.2 - (e > 0.85 ? 0.8 : 0)));
  R.capsule(hd[0][0], hd[0][1], hd[1][0], hd[1][1], B.headR[0], B.headR[1], (l, t, e, x, y) => band(S, 2.4 + l * 1.8 - (e > 0.86 ? 0.8 : 0) + (e < 0.7 ? scale(x, y) * 0.6 : 0)));
  R.line(hd[2][0] + 0.6, hd[2][1] - 0.6, hd[1][0] + 0.2, hd[1][1] + 0.7 + jawOpen, 0.45, S[0]);        // Maullinie
  R.line(hd[2][0] + 1.6, hd[2][1] - 0.3, hd[2][0] + 3.2, hd[2][1] - 0.15, 0.4, EMBER[1]);              // Glut im Maul
  R.dot(hd[1][0] - 0.3, hd[1][1] - 0.6, S[0]);                                                          // Nüster
  // Hörner: zwei, weit nach hinten gelegt; Kieferstachel
  const horn = (bx, by, len, lift, w, A0) => {
    const mx = bx - len * 0.55, my = by - lift * 0.4, ex = bx - len, ey = by - lift;
    R.capsule(bx, by, mx, my, w, w * 0.7, (l) => band(DRAKE_HORN, A0 + l * 1.4));
    R.capsule(mx, my, ex, ey, w * 0.7, 0.25, (l, t) => band(DRAKE_HORN, A0 + 0.8 + l * 1.2 + t));
  };
  horn(hd[0][0] - 0.4, hd[0][1] - 1.2, 6.2, 3.4, 0.75, 0.6);
  horn(hd[0][0] + 0.6, hd[0][1] - 1.7, 6.8, 4.6, 0.85, 1.3);
  spike(hd[2][0] - 0.6, hd[2][1] + 0.4, -1.9, 2.2, 0.5, S[1], S[3]);
  // Auge: Glut unter dunkler Braue
  const ey = [hd[0][0] + 1.6, hd[0][1] - 0.2];
  R.line(ey[0] - 1, ey[1] - 1.1, ey[0] + 1.3, ey[1] - 0.6, 0.6, S[0]);
  R.dot(ey[0], ey[1], EMBER[2]); R.dot(ey[0] + 0.5, ey[1], EMBER[3]);
  G.push({ x: Math.round(ey[0]), y: Math.round(ey[1]), color: '#ffb640', r: 1.6 }, { x: Math.round(hd[2][0] + 2.4), y: Math.round(hd[2][1]), color: '#ff6a20', r: 1.3 });

  // ---- nahe Schwinge über dem Rücken ----
  wing(true);

  // ---- Sattel (Reiter sitzt zwischen den Schwingen) und Zügel ----
  const sx = B.seat[0], sy = B.seat[1] + bob, by0 = sy + 1.6;
  R.each(sx - 4.5, by0 - 0.5, sx + 4, by0 + 5.5, (x, y, F, Gi) => {
    if (R.buf[Gi * R.fw + F] === 0) return;
    const nx = (x - (sx - 0.25)) / 4.2, bottom = by0 + 3.6 - nx * nx * 1.8;
    if (y > bottom || Math.abs(nx) > 1) return;
    R.put(F, Gi, y > bottom - 0.7 ? T.metal[1] : band(T.cloth, 1.2 + (nx < 0 ? 0.8 : 0) - (y > by0 + 2.4 ? 0.5 : 0)));
  });
  R.capsule(sx - 3, sy + 0.6, sx + 2.6, sy + 0.8, 1.3, 1.4, (l) => band(T.strap, 2 + l));
  R.line(sx - 3.4, sy - 1, sx - 3.1, sy + 0.6, 0.9, T.strap[3]);
  R.line(sx + 2.8, sy - 1.2, sx + 3.2, sy + 0.6, 0.9, T.strap[3]);
  R.line(sx - 0.5, sy + 2, sx - 0.3, sy + 6.8, 0.6, T.strap[1]);
  R.dot(sx - 0.4, sy + 5.4, T.metal[2]);
  const bit = [hd[2][0] + 1.2, hd[2][1] - 0.2];
  R.line(bit[0], bit[1], sx + 3, sy - 0.2, 0.5, T.strap[3]);
  R.dot(bit[0], bit[1], T.metal[2]);

  for (const L of legs) if (L.near) drawLeg(L);
}

function drawMount(R, G, B, look, pose) {
  if (B.plan === 'drake') return drawDrake(R, G, B, look, pose);
  const C = COAT[look.coat] ?? COAT.bay, Mn = MANE[look.mane] ?? MANE.dark, T = TACK[look.tack] ?? TACK.leather;
  const fire = look.mane === 'fire', ghost = look.mane === 'ghost' || look.mane === 'shadow';
  const bob = pose.bob, dy = (p) => [p[0], p[1] + bob];
  const rump = dy(B.rump), chest = dy(B.chest);
  const bodyShade = shadeOf(C, 2.1, 1.35);
  const legShade = (near) => shadeOf(near ? C : dim(C), 2, 1.2);

  // Beine: ferne zuerst (dunkler), nahe nach dem Rumpf
  const legs = [];
  if (B.legs === 4) {
    // Schrittfolge: hinten nah, vorne nah, hinten fern, vorne fern (Viertel versetzt)
    legs.push({ root: dy(B.hip), ph: 0, near: true, fore: false }, { root: dy(B.sh), ph: Math.PI / 2, near: true, fore: true },
      { root: dy(B.hip), ph: Math.PI, near: false, fore: false }, { root: dy(B.sh), ph: Math.PI * 1.5, near: false, fore: true });
  } else if (B.legs === 2) {
    legs.push({ root: dy(B.hip), ph: 0, near: true, fore: false }, { root: dy(B.hip), ph: Math.PI, near: false, fore: false });
  } else {
    for (let i = 0; i < 3; i++) {
      const rx = B.hip[0] + (i - 1) * 6.2;
      legs.push({ root: [rx, B.hip[1] + bob], ph: i * 2.1, near: true, i }, { root: [rx - 0.8, B.hip[1] + bob], ph: i * 2.1 + Math.PI, near: false, i });
    }
  }
  const drawLeg = (L) => {
    const [fx, lift] = pose.walk ? footAt(pose.ph + L.ph, B.stride, B.lift) : [0, 0];
    const baseX = L.root[0] + (B.legs === 6 ? (L.i - 1) * 1.6 : 0) + (L.near ? 0.4 : -0.6);
    const ax = baseX + fx, ay = -0.9 - lift;
    const bend = B.legs === 6 ? -1 : L.fore ? 1 : -1;
    const k = ik(L.root[0], L.root[1], ax, ay, B.up, B.low, bend);
    const sh = legShade(L.near);
    B.legs === 6 && R.capsule(L.root[0], L.root[1], k.jx, k.jy - 1.2, B.legR[0], B.legR[1], sh);
    B.legs !== 6 && R.capsule(L.root[0], L.root[1], k.jx, k.jy, B.legR[0] * (L.fore ? 1.05 : 1.25), B.legR[0] * 0.8, sh);
    R.capsule(k.jx, k.jy + (B.legs === 6 ? -1.2 : 0), k.ex, k.ey, B.legR[0] * 0.75, B.legR[1], sh);
    const hv = L.near ? 0 : 1;
    if (B.hoof === 'hoof') {
      const hc = look.coat === 'bone' ? ['#2a2418', '#4a4030', '#6a5c44'] : ['#0e0a08', '#1e1814', '#34302a'];
      R.capsule(k.ex - 0.3, k.ey + 0.2, k.ex + 0.7, k.ey + 0.6, 1.2, 1.2, (l) => hc[clamp(Math.round(1 + l - hv), 0, 2)]);
      if (look.tack === 'gold' || look.tack === 'silver') R.line(k.ex - 1.1, k.ey - 0.8, k.ex + 1.1, k.ey - 0.8, 0.5, T.metal[1 + (L.near ? 1 : 0)]);
      if (fire || ghost) G.push({ x: Math.round(k.ex), y: Math.round(k.ey), color: fire ? '#ffb640' : look.mane === 'ghost' ? '#8affb0' : '#a060f0', r: 1.5 });
    } else if (B.hoof === 'paw') {
      R.ellipse(k.ex + 0.8, k.ey + 0.3, 1.6, 0.9, (l) => band(L.near ? C : dim(C), 1.6 + l));
    } else {
      const cl = look.coat === 'spore' ? '#e0c8ff' : '#1a1410';
      for (const o of [-0.9, 0.3, 1.5]) R.line(k.ex, k.ey, k.ex + o + 0.7, k.ey + 0.8, 0.45, cl);
    }
  };
  for (const L of legs) if (!L.near) drawLeg(L);

  // Schwanz hinten
  const tailRoot = [rump[0] - B.rB * 0.8, rump[1] - B.rB * 0.35];
  const sw = Math.sin(pose.ph * (pose.walk ? 1 : 0.5) + 0.6) * (pose.walk ? 1.4 : 0.7);
  if (B.tail === 'long') {
    for (let s = -1; s <= 1; s++) {
      const ex = tailRoot[0] - 3 + sw + s * 0.8, ey = tailRoot[1] + 10;
      R.line(tailRoot[0], tailRoot[1], ex, ey, 1.4, (t) => fire ? Mn[clamp(Math.round(4 - t * 3 + s * 0.5), 0, 4)] : Mn[clamp(Math.round(2.6 - t * 1.6 + s * 0.5), 0, Mn.length - 1)]);
    }
    if (fire) G.push({ x: Math.round(tailRoot[0] - 2 + sw), y: Math.round(tailRoot[1] + 6), color: '#ff8a30', r: 3 });
  } else if (B.tail === 'bushy') {
    R.capsule(tailRoot[0], tailRoot[1], tailRoot[0] - 5, tailRoot[1] + 3 + sw, 1.6, 2.2, (l, t) => band(C, 1.6 + l * 1.3 + (t > 0.8 ? 1.5 : 0)));
  } else if (B.tail === 'stub') {
    R.ellipse(tailRoot[0] - 0.5, tailRoot[1] - 0.5, 1.4, 1.1, (l) => band(C, 3 + l));
  } else if (B.tail === 'plume') {
    for (let i = 0; i < 4; i++) R.line(tailRoot[0] + 1, tailRoot[1], tailRoot[0] - 5 - i * 0.6, tailRoot[1] - 5 + i * 2.2 + sw * 0.4, 1.1, (t) => band(Mn, 3 - t * 2 + (i === 0 ? 0.5 : 0)));
  } else if (B.tail === 'lizard') {
    const pts = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([tailRoot[0] - t * 12, tailRoot[1] + t * 7 - Math.sin(t * 3) * 2 + Math.sin(pose.ph * 0.7 + t * 3) * t * 1.4]); }
    for (let i = 0; i < 8; i++) R.capsule(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 2.4 * (1 - i / 9), 2.4 * (1 - (i + 1) / 9), bodyShade);
    for (let i = 1; i < 8; i += 2) R.line(pts[i][0], pts[i][1] - 2.2 * (1 - i / 9), pts[i][0] - 0.8, pts[i][1] - 3.3 * (1 - i / 9) - 0.6, 0.7, C[4]);
  }

  // Flügel (fern, hinter dem Körper)
  if (B.wings) {
    const flap = Math.sin(pose.ph * (pose.walk ? 1 : 0.5)) * 1.2;
    const root = [chest[0] - 2, chest[1] - 4];
    const mid = [root[0] - 3, root[1] - 8 + flap], tip = [root[0] - 10, root[1] - 6 + flap * 1.4];
    // Flughaut in Zacken zwischen den Fingern, darüber der Flügelarm
    const skin = (u, v) => (u > 0.75 ? '#7a2208' : '#4a1a10');
    const ends = [[root[0] - 11, root[1] + 1], [root[0] - 7.5, root[1] + 2.5], [root[0] - 4, root[1] + 2]];
    R.tri(mid[0], mid[1], tip[0], tip[1], ends[0][0], ends[0][1], skin);
    R.tri(mid[0], mid[1], ends[0][0], ends[0][1], ends[1][0], ends[1][1], skin);
    R.tri(mid[0], mid[1], ends[1][0], ends[1][1], ends[2][0], ends[2][1], skin);
    R.tri(mid[0], mid[1], ends[2][0], ends[2][1], root[0], root[1], skin);
    for (const e of ends) R.line(mid[0], mid[1], e[0], e[1], 0.5, '#2a0c08');
    R.line(root[0], root[1], mid[0], mid[1], 1.2, C[3]);
    R.line(mid[0], mid[1], tip[0], tip[1], 0.9, C[3]);
    R.dot(mid[0], mid[1] - 0.6, '#e0d0b0');
  }

  // Rumpf
  if (B.shell) {
    R.ellipse(-0.5, -10.5 + bob, 11, 5.6, (l, d, x, y, nx, ny) => band(C, 1.6 + l * 1.6));
    // Panzer mit Naht und Glanz
    R.ellipse(-0.5, -12.8 + bob, 10.6, 6.4, (l, d, x, y, nx, ny) => (ny > 0.7 ? null : Math.abs(nx + 0.05) < 0.03 ? C[0] : band(C, 2.2 + l * 1.6 + (d < 0.35 && nx < 0 ? 1 : 0))));
  } else {
    R.capsule(rump[0], rump[1], chest[0], chest[1], B.rB, B.rC, (l, t, e, x, y) => bodyShade(l + (y > chest[1] + B.rC * 0.5 ? -0.5 : 0), t, e));
  }
  if (look.coat === 'bone') {
    // Rippen und Wirbel
    for (let i = 0; i < 5; i++) { const x = rump[0] + 4 + i * 2.4; R.line(x, rump[1] - 3.5, x + 0.8, rump[1] + 3, 0.6, i % 2 ? C[1] : C[0]); }
    G.push({ x: Math.round(rump[0] + 7), y: Math.round(rump[1]), color: '#6ad08a', r: 3 });
  }
  if (look.coat === 'cinder' || look.glow === 'fire') {
    // glühende Risse
    for (const [a, b, c2, d] of [[-6, -13, -2, -10], [-1, -14, 2, -11], [3, -12, 6, -14]]) R.line(a, b + bob, c2, d + bob, 0.5, '#ff8a30');
    G.push({ x: 0, y: Math.round(-12 + bob), color: '#ff6a20', r: 4 });
  }
  if (look.glow === 'shadow') G.push({ x: -2, y: Math.round(-12 + bob), color: '#8a40e0', r: 5 });
  if (look.coat === 'spore') {
    // leuchtende Pilze auf dem Panzer
    for (const [x, h] of [[-7.5, 2.6], [-5, 1.6], [6, 2]]) {
      const y0 = -18.6 + Math.abs(x) * 0.28;
      R.line(x, y0 + bob, x, y0 - h + bob, 0.6, '#e8d8f0');
      R.ellipse(x, y0 - 0.4 - h + bob, 1.7, 1, (l) => band(MANE.cap, 2 + l));
      G.push({ x: Math.round(x), y: Math.round(y0 - 1 - h + bob), color: '#e0a0ff', r: 1.5 });
    }
  }

  // Satteldecke und Sattel
  const sx = B.seat[0], sy = B.seat[1] + bob;
  const blanketY = B.shell ? sy + 1 : sy + 1.6;
  R.each(sx - 4.5, blanketY - 0.5, sx + 4, blanketY + 5.5, (x, y, F, Gi) => {
    if (R.buf[Gi * R.fw + F] === 0) return;
    // unten abgerundet, Saum in Metallfarbe
    const nx = (x - (sx - 0.25)) / 4.2, bottom = blanketY + 4.6 - nx * nx * 2.2;
    if (y > bottom || Math.abs(nx) > 1) return;
    const hem = y > bottom - 0.7;
    R.put(F, Gi, hem ? T.metal[1] : band(T.cloth, 1.2 + (nx < 0 ? 0.8 : 0) - (y > blanketY + 3 ? 0.5 : 0)));
  });
  R.capsule(sx - 3, sy + 0.6, sx + 2.6, sy + 0.8, 1.3, 1.4, (l) => band(T.strap, 2 + l));
  R.line(sx - 3.4, sy - 1, sx - 3.1, sy + 0.6, 0.9, T.strap[3]);       // hinterer Zwiesel
  R.line(sx + 2.8, sy - 1.2, sx + 3.2, sy + 0.6, 0.9, T.strap[3]);     // Horn
  R.line(sx - 0.5, sy + 2, sx - 0.3, sy + 6.5, 0.6, T.strap[1]);       // Gurt
  R.dot(sx - 0.4, sy + 6.8, T.metal[2]);

  // Hals und Kopf
  if (B.neck) {
    const n0 = dy(B.neck[0]), n1 = dy([B.neck[1][0] + pose.nod * 0.3, B.neck[1][1] + pose.nod]);
    R.capsule(n0[0], n0[1], n1[0], n1[1], B.neckR[0], B.neckR[1], bodyShade);
    if (B.ear || look.mane) {
      // Mähne entlang des Halses
      if (!B.beak && !B.horns?.startsWith('drake')) {
        const n = 7;
        for (let i = 0; i <= n; i++) {
          const t = i / n, x = n0[0] + (n1[0] - n0[0]) * t - 1.8, y = n0[1] + (n1[1] - n0[1]) * t - (B.neckR[0] + (B.neckR[1] - B.neckR[0]) * t) * 0.7;
          const len = B.ear === 'wolf' ? 1.6 : 2.6 + Math.sin(t * 5 + pose.ph) * 0.5;
          R.line(x + 1, y, x - len * 0.7, y + len * 0.5 + (fire ? -len : 0), 1.1, (u) => fire ? Mn[clamp(Math.round(3 + u * 1.4 - (i % 2)), 0, 4)] : B.ear === 'wolf' ? band(C, 1.3 + u) : Mn[clamp(Math.round(2.5 - u * 2 + (i % 2) * 0.5), 0, Mn.length - 1)]);
        }
        if (fire) G.push({ x: Math.round(n0[0] + (n1[0] - n0[0]) * 0.5 - 2), y: Math.round(n0[1] + (n1[1] - n0[1]) * 0.5 - 3), color: '#ff8a30', r: 3 });
        if (ghost) G.push({ x: Math.round(n0[0] + (n1[0] - n0[0]) * 0.5 - 2), y: Math.round(n0[1] + (n1[1] - n0[1]) * 0.5 - 2), color: EYES[look.mane] ?? '#a060f0', r: 3 });
      }
    }
  }
  const h0 = dy([B.head[0][0] + pose.nod * 0.3, B.head[0][1] + pose.nod]), h1 = dy([B.head[1][0] + pose.nod * 0.3, B.head[1][1] + pose.nod]);
  R.capsule(h0[0], h0[1], h1[0], h1[1], B.headR[0], B.headR[1], bodyShade);
  if (B.beak) R.capsule(h1[0] - 0.4, h1[1], h1[0] + 3.2, h1[1] + 0.6, 1, 0.35, (l) => band(['#6a4a10', '#a07820', '#d8b040', '#f0d870'], 1.5 + l));
  // Ohren, Hörner, Geweih
  if (B.ear === 'horse') { R.line(h0[0] - 0.6, h0[1] - 2, h0[0] - 1.2, h0[1] - 4.2, 1.1, C[2]); R.dot(h0[0] - 1.2, h0[1] - 3.6, C[3]); }
  if (B.ear === 'wolf') { R.line(h0[0] - 0.5, h0[1] - 2.2, h0[0] - 0.9, h0[1] - 5, 1.4, (t) => band(C, 2.5 - t)); R.line(h0[0] + 1.2, h0[1] - 2.2, h0[0] + 1.4, h0[1] - 4.6, 1.1, C[3]); }
  if (B.horns === 'antler') {
    const ice = look.coat === 'frost';
    const A = ice ? ['#3a78c0', '#7ac0f0', '#c0e8ff', '#ffffff'] : ['#3a2a1a', '#6a5030', '#9a7a50', '#c8a878'];
    const base = [h0[0] - 0.4, h0[1] - 2];
    for (const s of [0, 1]) {
      const bx = base[0] + s * 1.2, far = s === 0;
      const tip = [bx - 4, base[1] - 7], mid = [bx - 2, base[1] - 4];
      R.line(bx, base[1], mid[0], mid[1], 0.8, A[far ? 1 : 2]);
      R.line(mid[0], mid[1], tip[0], tip[1], 0.7, A[far ? 1 : 3]);
      R.line(mid[0], mid[1], mid[0] + 2.2, mid[1] - 3, 0.6, A[far ? 1 : 3]);
      R.line(mid[0] - 1, mid[1] - 1.6, mid[0] - 3.4, mid[1] - 2.2, 0.6, A[far ? 1 : 2]);
      if (ice && !far) G.push({ x: Math.round(tip[0]), y: Math.round(tip[1]), color: '#c0f0ff', r: 2 });
    }
  }
  if (B.horns === 'drake') {
    R.line(h0[0] - 0.8, h0[1] - 1.6, h0[0] - 4.2, h0[1] - 3.8, 0.9, (t) => band(['#3a3028', '#6a5a48', '#a89478', '#e0d0b0'], 1 + t * 2.5));
    R.line(h0[0] + 0.6, h0[1] - 2, h0[0] - 2.4, h0[1] - 4.8, 0.8, (t) => band(['#3a3028', '#6a5a48', '#a89478', '#e0d0b0'], 1.5 + t * 2.5));
    // Stacheln den Hals entlang
    if (B.neck) for (let i = 0; i < 4; i++) { const t = i / 4, x = B.neck[0][0] + (B.neck[1][0] - B.neck[0][0]) * t - 1.8, y = B.neck[0][1] + (B.neck[1][1] - B.neck[0][1]) * t - 2.6 + bob; R.line(x, y, x - 1.2, y - 1.4, 0.7, C[3]); }
  }
  if (B.horns === 'mandible') {
    for (const s of [-1, 1]) R.line(h1[0] - 0.5, h1[1] + s * 0.5, h1[0] + 2.8, h1[1] + s * 1.3 - 0.4, 0.8, (t) => band(['#1a1026', '#48306a', '#9072b8', '#e0c8ff'], 1 + t * 2));
    R.line(h0[0] + 0.5, h0[1] - 2.4, h0[0] + 2.8, h0[1] - 5.5, 0.9, (t) => band(C, 2 + t * 2));
  }
  // Auge
  const eye = [h0[0] + (h1[0] - h0[0]) * 0.28, h0[1] + (h1[1] - h0[1]) * 0.28 - B.headR[0] * 0.35];
  const ec = EYES[look.eyes];
  R.dot(eye[0], eye[1], ec ?? '#0a0608');
  if (R.s >= 2) R.dot(eye[0] + 0.5, eye[1], ec ?? '#0a0608');
  if (ec) G.push({ x: Math.round(eye[0]), y: Math.round(eye[1]), color: ec, r: 1.5 });
  else R.dot(eye[0] - 0.2, eye[1] - 0.5, '#f0e8e0');
  // Nüstern und Zaumzeug
  if (!B.beak && B.ear !== 'wolf' && !B.shell) R.dot(h1[0] + 0.4, h1[1] - 0.2, C[0]);
  if (B.ear === 'wolf') R.dot(h1[0] + 1, h1[1] - 0.4, '#0a0608');
  if (!B.shell) {
    const bit = [h1[0] - 1.2, h1[1] + 0.2];
    R.line(h0[0] - 0.4, h0[1] - 1.2, bit[0], bit[1], 0.5, T.strap[2]);              // Backenstück
    R.line(bit[0], bit[1], sx + 3, sy - 0.2, 0.5, T.strap[3]);                      // Zügel
    R.dot(bit[0], bit[1], T.metal[2]);
  } else R.line(h0[0], h0[1] - 1, sx + 3, sy - 0.2, 0.5, T.strap[3]);

  // Nahe Beine
  for (const L of legs) if (L.near) drawLeg(L);
}

function makeFrame(B, look, pose, res) {
  const R = new Raster(res), G = [];
  drawMount(R, G, B, look, pose);
  const f = buildFrame(W * res, H * res, AX * res, AY * res, (p) => R.blit(p.ctx));
  if (res > 1) f.res = res;
  f.seat = { x: B.seat[0], y: B.seat[1] + pose.bob };
  f.glows = G;
  return f;
}

function buildSet(B, look, res) {
  const stand = [0, 1, 2, 3].map((i) => makeFrame(B, look, { walk: false, ph: i * (TAU / 4), bob: i === 1 || i === 2 ? 0.35 : 0, nod: i === 2 ? 0.5 : 0 }, res));
  const walk = [0, 1, 2, 3, 4, 5].map((i) => {
    const ph = (i / 6) * TAU;
    return makeFrame(B, look, { walk: true, ph, bob: Math.round(Math.abs(Math.sin(ph * 2)) * 2) / 2 - 0.5, nod: Math.sin(ph * 2) * 0.8 }, res);
  });
  return { stand: new Animation(stand, 5), walk: new Animation(walk, 11) };
}

// Reiter + Reittier als ein Frame (für fremde Spieler, die nur frame.draw/glows kennen).
// Versatz = Sattelpunkt minus Hüfte der Sitz-Pose; gespiegelt wird beides um den Fußpunkt.
class RideFrame {
  constructor(mount, rider) {
    this.mount = mount; this.rider = rider;
    this.res = rider.res ?? 1;
    this.ox = mount.seat.x - (rider.hip?.x ?? 0); this.oy = mount.seat.y - (rider.hip?.y ?? -10);
    this.glows = [...(mount.glows ?? []), ...(rider.glows ?? []).map((g) => ({ ...g, x: g.x + this.ox, y: g.y + this.oy }))];
    this.weapon = rider.weapon ? { ...rider.weapon, x: rider.weapon.x + this.ox, y: rider.weapon.y + this.oy } : null;
  }
  draw(ctx, x, y, opts = {}) {
    this.mount.draw(ctx, x, y, opts);
    this.rider.draw(ctx, x + (opts.flip ? -this.ox : this.ox), y + this.oy, opts);
  }
}
// riderAnim = Helden-Animation 'ride', mountAnim = stand/walk -> Animation mit RideFrames
export function composeRide(riderAnim, mountAnim) {
  const n = mountAnim.frames.length, r = riderAnim.frames;
  return new Animation(mountAnim.frames.map((m, i) => new RideFrame(m, r[i % r.length])), mountAnim.fps);
}

const cache = new Map();
// def = content 'mount' (sprite, look). Ohne def: Platzhalter-Pferd.
export function getMountSprites(mountId, def = null, res = 1) {
  const key = `${res}|${mountId}`;
  let set = cache.get(key);
  if (!set) {
    const B = BODY[def?.sprite] ?? BODY.horse;
    set = buildSet(B, def?.look ?? {}, res);
    cache.set(key, set);
    if (cache.size > 12) cache.delete(cache.keys().next().value);
  }
  return set;
}
