import { hash2 } from '../core/math.js';
import { AX, AY, bonelordRig, rigBossSprites, pt, ell, hair, limb, smear } from './bonelord.js';
import { poly, spike, star, drape } from './star_bosses.js';

// Sternenglut-Bosse, Neuzeichnung (03.11.): eigene, größere Gestalten (≈ Malgareths Größe) auf Varkhuls Rig.
// bigRig skaliert die Gelenke des Rigs um den Fußpunkt; gezeichnet wird in den großen Maßen mit eigenen Formen.
// Licht von links oben, Platten mit Kantenlicht, harte Stufen (docs/STYLE.md), Leuchtebene nur aus der Glutrampe.

export const BW = 250, BH = 200, BAX = 104, BAY = 190;
const DIMS = { W: BW, H: BH, AX: BAX, AY: BAY };

export function bigRig(P0, k = 1.5) {
  const r = bonelordRig(P0);
  const X = (x) => BAX + (x - AX) * k, Y = (y) => BAY + (y - AY) * k;
  const pnt = (o) => ({ ...o, x: X(o.x), y: Y(o.y) });
  const seg = (o) => ({ jx: X(o.jx), jy: Y(o.jy), ex: X(o.ex), ey: Y(o.ey) });
  return {
    ...r, k, gy: BAY, hipX: X(r.hipX), hipY: Y(r.hipY), chX: X(r.chX), chY: Y(r.chY),
    legF: seg(r.legF), legB: seg(r.legB), armF: seg(r.armF), armB: seg(r.armB),
    shF: pnt(r.shF), shB: pnt(r.shB), hF: pnt(r.hF), hB: pnt(r.hB), neckX: X(r.neckX), neckY: Y(r.neckY),
  };
}

// Punkt am Rumpf: s entlang der Wirbelsäule ab Hüfte, o quer (nach vorn positiv)
const along = (r, s, o) => ({ x: r.hipX + Math.sin(r.lean) * s + r.perpX * o, y: r.hipY - Math.cos(r.lean) * s + r.perpY * o });
const AL = (r, list) => list.map(([s, o]) => { const q = along(r, s, o); return [q.x, q.y]; });

// ---------------------------------------------------------------- Werkzeuge
const LX = -0.6, LY = -0.8;

// Platte: Stufen nach Lage zum Licht, Kanten zum Licht hell, abgewandte Kanten dunkel.
// ramp: dunkel → hell (≥ 4). o.edge = Kantenbreite, o.flat = schwächerer Verlauf
export function plate(p, pts, ramp, o = {}) {
  const n = ramp.length, edge = o.edge ?? 0.9, k = o.flat ?? 1;
  let cx = 0, cy = 0;
  for (const [x, y] of pts) { cx += x; cy += y; }
  cx /= pts.length; cy /= pts.length;
  let R = 1;
  for (const [x, y] of pts) R = Math.max(R, Math.hypot(x - cx, y - cy));
  const segs = pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    let nx = dy / L, ny = -dx / L;
    if (nx * ((a[0] + b[0]) / 2 - cx) + ny * ((a[1] + b[1]) / 2 - cy) < 0) { nx = -nx; ny = -ny; }
    return { a, dx, dy, L, f: nx * LX + ny * LY };
  });
  const hiA = o.hi ?? 0.74, loA = o.lo ?? 0.44;
  poly(p, pts, (x, y) => {
    let best = Infinity, f = 0;
    for (const s of segs) {
      const t = Math.max(0, Math.min(1, ((x - s.a[0]) * s.dx + (y - s.a[1]) * s.dy) / (s.L * s.L)));
      const d = Math.hypot(x - s.a[0] - s.dx * t, y - s.a[1] - s.dy * t);
      if (d < best) { best = d; f = s.f; }
    }
    // Innenkontur: abgewandte und seitliche Kanten 1 Feinpixel dunkel, Lichtkante 2 Feinpixel hell
    if (f > 0.3 && best < edge) return ramp[n - 1];
    if (f <= 0.3 && best < 0.55) return ramp[0];
    const t = (((x - cx) * LX + (y - cy) * LY) / R) * 0.5 * k + 0.5;
    if (t > 0.86 && o.glint !== false) return ramp[n - 1];
    return t > hiA ? ramp[n - 2] : t < loA ? ramp[1] : ramp[Math.max(1, n - 3)];
  });
}

// Plattenstreifen entlang einer Strecke (Arm, Bein, Schaft): Breite w0 → w1
export function bar(p, x0, y0, x1, y1, w0, w1, ramp, o) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  plate(p, [[x0 + nx * w0 / 2, y0 + ny * w0 / 2], [x1 + nx * w1 / 2, y1 + ny * w1 / 2], [x1 - nx * w1 / 2, y1 - ny * w1 / 2], [x0 - nx * w0 / 2, y0 - ny * w0 / 2]], ramp, o);
}

// Kugel/Buckel mit Licht von links oben und dunklem Rand unten rechts
export function orb(p, cx, cy, rx, ry, ramp) {
  const n = ramp.length;
  p.each(cx - rx - 1, cy - ry - 1, cx + rx + 1, cy + ry + 1, (x, y) => {
    const u = (x - cx) / rx, v = (y - cy) / ry, d = u * u + v * v;
    if (d > 1) return null;
    const l = -(u * LX + v * LY) * -1;   // > 0 zum Licht
    if (d > 0.72 && l < -0.1) return ramp[0];
    if (d < 0.12 && l > 0) return ramp[n - 1];
    const t = l * 0.5 + 0.5 - d * 0.25;
    return ramp[1 + Math.max(0, Math.min(n - 3, Math.floor(t * (n - 2) + 0.35)))];
  });
}

// Facettierter Kristall von der Basis (x0, y0) zur Spitze: Lichtseite und Schattenseite getrennt, Grat hell
export function gem(p, x0, y0, x1, y1, w, ramp) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
  let nx = -dy / L, ny = dx / L;
  if (nx * LX + ny * LY < 0) { nx = -nx; ny = -ny; }
  const h = w / 2, n = ramp.length;
  poly(p, [[x0 + nx * h, y0 + ny * h], [x1, y1], [x0, y0]], (x, y) => {
    const o = (x - x0) * nx + (y - y0) * ny;
    return o < 0.45 ? ramp[n - 1] : ramp[n - 2];
  });
  poly(p, [[x0, y0], [x1, y1], [x0 - nx * h, y0 - ny * h]], (x, y) => {
    const o = -((x - x0) * nx + (y - y0) * ny);
    return o > h * (1 - ((x - x0) * dx + (y - y0) * dy) / (L * L)) - 0.6 ? ramp[0] : ramp[1];
  });
}

// Glühende Fuge (Leuchtebene + Malfläche)
function seam(p, g, pts, glow, k = 2) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    hair(p, x0, y0, x1, y1, glow[k]); hair(g, x0, y0, x1, y1, glow[k + 1] ?? glow[k]);
  }
}

// Schein um einen Punkt in der Leuchtebene (harte Ringe)
function bloom(g, x, y, r, glow) {
  ell(g, x, y, r, r, glow[1]); ell(g, x, y, r * 0.62, r * 0.62, glow[2]); ell(g, x, y, r * 0.32, r * 0.32, glow[3]);
  pt(g, x, y, glow[4]);
}


// ---------------------------------------------------------------- Stilentwürfe: Befall
// V.fx 'void' (Entwurf A Leerenbefall): violette Leerenkristalle brechen aus Rücken und Schultern, magenta Risse.
// V.fx 'ember' (Entwurf C Glutverderbt): glühende Risse wie bei Malgareth, Glutsplitter statt Kristallen.
// spots.back = [[s, o, Winkel relativ zur Wirbelsäule, Länge]], spots.cracks = Linien [[s, o], …] am Rumpf.
const VOIDC = ['#24083e', '#4a1474', '#8a3ac8', '#d29cff', '#fbeeff'];
const EMBC = ['#2a0806', '#6a1606', '#c4420e', '#ff9a30', '#fff0b0'];
function taint(p, g, r, V, glow, spots, stage) {
  if (!V.fx) return;
  const up = Math.atan2(-Math.cos(r.lean), Math.sin(r.lean));
  if (stage === 'back') {
    for (const [s0, o0, a, len] of spots.back ?? []) {
      const b = along(r, s0, o0), ang = up + a;
      const ramp = V.fx === 'void' ? VOIDC : EMBC;
      gem(p, b.x, b.y, b.x + Math.cos(ang) * len, b.y + Math.sin(ang) * len, len * 0.34, ramp);
      gem(p, b.x + 2, b.y + 1, b.x + 2 + Math.cos(ang + 0.5) * len * 0.6, b.y + 1 + Math.sin(ang + 0.5) * len * 0.6, len * 0.26, ramp);
      pt(g, b.x + Math.cos(ang) * len, b.y + Math.sin(ang) * len, glow[3]);
    }
  } else {
    for (const line of spots.cracks ?? []) {
      const pts = line.map(([s0, o0]) => { const q = along(r, s0, o0); return [q.x, q.y]; });
      for (let i = 0; i < pts.length - 1; i++) {
        hair(p, ...pts[i], ...pts[i + 1], glow[2]); hair(g, ...pts[i], ...pts[i + 1], glow[3]);
        hair(p, pts[i][0] + 0.5, pts[i][1], pts[i + 1][0] + 0.5, pts[i + 1][1], glow[1]);
      }
      const e = pts[pts.length - 1]; pt(g, e[0], e[1], glow[4]);
    }
  }
}

// ================================================================ Kaldris, der Splitterfürst

const KAL = {
  B: {
    plate: ['#0a1224', '#142444', '#1e3662', '#2e5288', '#4c7cb4', '#b4dcf6'],
    dark: ['#080e1e', '#101c38', '#1a2c54', '#26406e', '#36588c', '#5a80aa'],
    trim: ['#3a2208', '#7a4a12', '#b8801e', '#e8b840', '#fff0a0'],
    cape: ['#14040c', '#2a0a18', '#44122a', '#601c3a', '#7c2a4c'],
    capeIn: ['#0a0208', '#14060e', '#200a16', '#2c0e1e', '#381426'],
    crystal: ['#103050', '#1c5c8c', '#3498c8', '#80d8f0', '#e8ffff'],
    core: ['#4a1004', '#a83208', '#f07a1c', '#ffc860', '#fff6d8'],
    tabard: ['#14040c', '#2a0a18', '#44122a', '#601c3a', '#8a3052'],
    cape_on: true, crown: 'circlet',
  },
  A: {
    plate: ['#262040', '#423c62', '#6c6890', '#a09ec0', '#d0d0e6', '#f6f6ff'],
    dark: ['#16122a', '#2a2646', '#443f66', '#625e88', '#8682ac', '#aeacd0'],
    trim: ['#2a2a3a', '#5a5a74', '#9a9ab4', '#d0d0e4', '#ffffff'],
    cape: ['#0c0618', '#180c2c', '#261444', '#361e5c', '#4a2a74'],
    tabard: ['#0c0618', '#180c2c', '#261444', '#361e5c', '#56328a'],
    crystal: ['#24083e', '#4a1474', '#8a3ac8', '#d29cff', '#fbeeff'], core: ['#4a0a3a', '#9a1a7a', '#e040b8', '#ffb0e8', '#ffffff'],
    cape_on: true, fx: 'void',
  },
  C: {
    plate: ['#0a0809', '#181314', '#282022', '#3c3132', '#584848', '#8e7a72'],
    dark: ['#060405', '#100c0d', '#1c1616', '#2a2222', '#3c3030', '#5a4a46'],
    trim: ['#2a1008', '#5a2810', '#8a4a1c', '#c07a34', '#f0b060'],
    cape: ['#140606', '#260a08', '#3c120c', '#541a10', '#6e2616'],
    tabard: ['#140606', '#260a08', '#3c120c', '#541a10', '#7a2c18'],
    crystal: ['#1a0604', '#4a1006', '#9a300c', '#ff8a2a', '#fff0b0'], core: ['#4a1004', '#a83208', '#f07a1c', '#ffc860', '#fff6d8'],
    cape_on: true, fx: 'ember',
  },
};

function kaldrisSword(p, g, hx, hy, a, V, glow) {
  const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
  const P = (s, o) => [hx + dx * s + nx * o, hy + dy * s + ny * o];
  // Griff, Knauf, Parierstange
  bar(p, ...P(-11, 0), ...P(2, 0), 3, 3, ['#1a0a10', '#3a1a20', '#5a2a2a', '#7a4034']);
  for (let s = -10; s < 1; s += 2) hair(p, ...P(s, -1.4), ...P(s + 1, 1.4), '#1a0a10');
  gem(p, ...P(-12, 0), ...P(-17, 0), 5, V.crystal);
  plate(p, [P(2, -10), P(4, -11), P(6, -3), P(6, 3), P(4, 11), P(2, 10), P(3.5, 0)], V.trim, { edge: 0.7 });
  // Klinge: zwei Facetten, Grat, helle Schneiden, Spitze
  const Lb = 74;
  plate(p, [P(5, 0), P(5, -5.2), P(Lb * 0.86, -3.4), P(Lb, 0)], [V.crystal[1], V.crystal[2], V.crystal[3], V.crystal[3], V.crystal[4]], { edge: 0.8 });
  plate(p, [P(5, 0), P(Lb, 0), P(Lb * 0.86, 3.4), P(5, 5.2)], [V.crystal[0], V.crystal[1], V.crystal[1], V.crystal[2], V.crystal[3]], { edge: 0.8 });
  // Kern der Klinge: Glutader (Leuchtebene)
  for (let s = 9; s < Lb - 10; s += 0.5) { const [x, y] = P(s, 0.3); pt(p, x, y, glow[2]); if (s % 6 < 3) pt(g, x, y, glow[3]); }
  // Glanzlinie
  for (let s = 12; s < Lb * 0.5; s += 0.5) { const [x, y] = P(s, -4.2 + s * 0.012); pt(p, x, y, V.crystal[4]); }
  // Splitter im Klingenansatz
  gem(p, ...P(8, -4), ...P(15, -10), 3, V.crystal);
  gem(p, ...P(10, 4), ...P(16, 9), 2.6, V.crystal);
  const [tx, ty] = P(Lb, 0);
  return { x: tx, y: ty };
}

function pauldron(p, x, y, r, V, back, shards) {
  const pl = back ? V.dark : V.plate;
  // drei Schienen übereinander, die oberste am größten
  for (let i = 2; i >= 0; i--) {
    const yy = y + i * r * 0.32, rr = r * (1 - i * 0.12);
    plate(p, [[x - rr, yy + 2], [x - rr * 0.8, yy - rr * 0.55], [x, yy - rr * 0.8], [x + rr * 0.85, yy - rr * 0.5], [x + rr, yy + 2], [x + rr * 0.6, yy + rr * 0.42], [x - rr * 0.6, yy + rr * 0.42]], pl, { edge: 0.8 });
    for (let t = -0.8; t <= 0.8; t += 0.04) pt(p, x + t * rr * 0.75, yy + rr * 0.38 - Math.abs(t) * 2, V.trim[back ? 1 : 2]);
  }
  if (shards) for (const [ox, len, a] of shards) gem(p, x + ox, y - r * 0.5, x + ox + Math.cos(a) * len, y - r * 0.5 + Math.sin(a) * len, len * 0.32, V.crystal);
}

function kaldrisLeg(p, hx, hy, L, V, back, step) {
  const pl = back ? V.dark : V.plate;
  bar(p, hx, hy, L.jx, L.jy, 12, 10, pl);                    // Diechling
  bar(p, L.jx, L.jy, L.ex, L.ey - 4, 10, 8, pl);              // Beinröhre
  // Kniekachel mit Flügel
  plate(p, [[L.jx - 5, L.jy - 2], [L.jx, L.jy - 6], [L.jx + 6, L.jy - 2], [L.jx + 5, L.jy + 4], [L.jx - 3, L.jy + 4]], pl, { edge: 0.8 });
  gem(p, L.jx + 3, L.jy - 2, L.jx + 9, L.jy - 7, 3, V.crystal);
  // Schuh: spitz nach vorn
  plate(p, [[L.ex - 7, L.ey - 6], [L.ex + 4, L.ey - 7], [L.ex + 13, L.ey - 1], [L.ex + 13, L.ey], [L.ex - 8, L.ey]], pl, { edge: 0.8 });
  for (let x = -7; x < 12; x += 0.5) pt(p, L.ex + x, L.ey - 0.5, V.trim[back ? 0 : 1]);
}

function kaldrisArm(p, A, sh, V, back) {
  const pl = back ? V.dark : V.plate;
  bar(p, sh.x, sh.y, A.jx, A.jy, 8.5, 7.5, pl);
  bar(p, A.jx, A.jy, A.ex, A.ey, 8, 9, pl);
  { const ux = (sh.x - A.jx), uy = (sh.y - A.jy), L0 = Math.hypot(ux, uy) || 1, bx = A.jx - (A.ex - A.jx) / (Math.hypot(A.ex - A.jx, A.ey - A.jy) || 1) * 3;
    plate(p, [[A.jx + uy / L0 * 4, A.jy - ux / L0 * 4], [A.jx + ux / L0 * 4, A.jy + uy / L0 * 4], [A.jx - uy / L0 * 4.5, A.jy + ux / L0 * 4.5], [bx - 2, A.jy + 3]], pl, { edge: 0.7 }); }
  // Stulpe mit Goldrand
  const dx = A.ex - A.jx, dy = A.ey - A.jy, L = Math.hypot(dx, dy) || 1;
  for (let o = -4.5; o <= 4.5; o += 0.5) pt(p, A.jx + dx * 0.62 - dy / L * o, A.jy + dy * 0.62 + dx / L * o, V.trim[back ? 1 : 3]);
  orb(p, A.ex, A.ey, 4.4, 4, pl);
}

function drawKaldris(V) {
  return (p, g, P0, glow, extra = {}) => {
    const r = bigRig(P0, 1.5);
    const { P, gy, hipX, hipY, lean, chX, chY, perpX, perpY, legF, legB, shF, shB, hF, sa, armF, armB, neckX, neckY } = r;
    const meta = {};

    // --- 1. Umhang hinten
    if (V.cape_on) {
      const at = drape(p, P, chX - perpX * 4 - 20, chY - 3, 32, 92 - P.kneel * 18, V.cape, { w: 1, sway: 26 });
      for (let i = 0; i < 32; i++) { const b = at(i, 1); pt(p, b.x, b.y, V.trim[2]); pt(p, b.x, b.y - 0.5, V.trim[1]); }
    }

    const SP = { back: [[33, -10, -0.7, 16], [26, -13, -1.1, 12], [16, -12, -1.4, 9]], cracks: [[[28, 2], [22, 6], [17, 4], [10, 7]], [[30, 12], [24, 9]], [[12, -8], [7, -4], [4, -6]]] };
    taint(p, g, r, V, glow, SP, 'back');
    // --- 2. Hinteres Bein, hinterer Arm mit Schulter
    kaldrisLeg(p, hipX - 3, hipY, legB, V, true);
    pauldron(p, shB.x - 1, shB.y - 1, 10, V, true, [[-6, 9, -2.2], [-1, 12, -1.9]]);
    kaldrisArm(p, armB, shB, V, true);

    // --- 3. Rumpf: Schurz, Brustpanzer, Kragen
    for (let i = 2; i >= 0; i--) {
      const s = 2 - i * 5.5, w = 11 + i * 2.2;
      plate(p, AL(r, [[s + 2, -w], [s + 2, w + 1], [s - 5, w + 2.5], [s - 6, -w - 1.5]]), V.plate, { edge: 0.8 });
      const a = along(r, s - 5.6, -w - 1), b = along(r, s - 4.6, w + 2);
      hair(p, a.x, a.y, b.x, b.y, V.trim[2]);
    }
    plate(p, AL(r, [[3, -9], [3, 9], [12, 12], [24, 17.5], [33, 15], [37, 6], [36, -10], [27, -14], [12, -11]]), V.plate);
    // Mittelgrat und Goldborte
    { const q = AL(r, [[5, 3], [20, 5], [33, 4]]); hair(p, ...q[0], ...q[1], V.plate[1]); hair(p, ...q[1], ...q[2], V.plate[1]); }
    for (let s = 4; s < 34; s += 0.5) { const q = along(r, s, 12.6 + Math.sin(s / 34 * Math.PI) * 3); pt(p, q.x, q.y, V.trim[3]); }
    const wb = along(r, 3.5, -10), we = along(r, 3.5, 10.5);
    hair(p, wb.x, wb.y, we.x, we.y, V.trim[2]); hair(p, wb.x, wb.y + 0.5, we.x, we.y + 0.5, V.trim[1]);
    // Glutsplitter in der Brust: Fassung, Splitter, Risse
    const c = along(r, 23, 6);
    plate(p, [[c.x - 5, c.y], [c.x, c.y - 6], [c.x + 5, c.y], [c.x, c.y + 6]], V.trim, { edge: 0.7 });
    gem(p, c.x, c.y + 3.5, c.x + 0.5, c.y - 4.5, 4, V.core);
    for (const [ex, ey] of [[-9, -4], [7, -7], [6, 8], [-8, 6]]) { hair(p, c.x, c.y, c.x + ex, c.y + ey, V.core[2]); hair(g, c.x, c.y, c.x + ex * 0.6, c.y + ey * 0.6, V.core[3]); }
    bloom(g, c.x, c.y, 2.5 + P.soul * 1.2, V.core);
    meta.chest = { x: c.x, y: c.y };
    // Kragen
    plate(p, AL(r, [[33, -9], [36, 12], [42, 9], [42, -7]]), V.plate, { edge: 0.8 });

    taint(p, g, r, V, glow, SP, 'body');
    // --- 4. Wappenrock zwischen den Beinen, vorderes Bein
    if (V.tabard) {
      const sw = Math.sin(P.capeT) * 1.5 + P.cape * 4, t0 = along(r, 1, 1), t1 = along(r, 1, 10);
      const bot = Math.min(gy - 8, hipY + 34 - P.kneel * 12);
      const pts = [[t0.x, t0.y], [t1.x, t1.y], [t1.x + 2 - sw, bot], [(t0.x + t1.x) / 2 - sw, bot + 3], [t0.x - 1 - sw, bot]];
      plate(p, pts, V.tabard, { edge: 0.6, glint: false });
      for (let t = 0; t <= 1; t += 0.03) { const y = bot - 1.5, x = t0.x - 1 - sw + (t1.x + 3 - t0.x) * t; pt(p, x, y + Math.sin(t * Math.PI) * 3, V.trim[2]); }
      star(p, (t0.x + t1.x) / 2 - sw * 0.5 + 0.5, (t0.y + bot) / 2 + 2, 3.2, V.trim[3]); star(p, (t0.x + t1.x) / 2 - sw * 0.5 + 0.2, (t0.y + bot) / 2 + 1.7, 1.6, V.trim[4]);
    }
    kaldrisLeg(p, hipX + 3, hipY, legF, V, false);
    // Beintasche über dem Oberschenkel
    plate(p, AL(r, [[-3, 2], [-3, 13], [-14, 15], [-15, 4]]), V.plate, { edge: 0.8 });

    // --- 5. Kopf: Topfhelm mit Sehschlitz, Kristallkrone
    const ux = Math.sin(lean), uy = -Math.cos(lean);
    const hx = neckX + ux * 11 + perpX * 1.5 + P.head, hy = neckY + uy * 11;
    const H = (s, o) => [hx + ux * s + perpX * o, hy + uy * s + perpY * o];
    // Helmglocke (hinten rund), Gesichtsplatte mit vorspringendem Visiergrat, Kinnstück
    plate(p, [H(-6, -8), H(-1, -9.5), H(5, -8.5), H(9.5, -4.5), H(11, 1), H(9, 6), H(4, 7.5), H(-2, 6), H(-6, 2)], V.plate);
    plate(p, [H(-9, 1), H(-9.5, 7), H(-6, 10.5), H(0.5, 11.5), H(3.5, 9.5), H(2.5, 3), H(-3, 1.5)], V.plate, { edge: 0.8 });
    plate(p, [H(0, 2), H(3.5, 2.5), H(4, 12.5), H(1.6, 11.5)], V.dark, { edge: 0.6 });
    const eyeOn = P.eye > 0.2;
    for (let o = 3; o <= 11; o += 0.5) { const [x, y] = H(1.8, o); pt(p, x, y, eyeOn ? glow[3] : V.plate[0]); if (eyeOn) { pt(g, x, y, o > 8 ? glow[4] : glow[3]); const [x2, y2] = H(1.2, o); pt(g, x2, y2, glow[1]); } }
    meta.eye = { x: H(1.8, 9)[0], y: H(1.8, 9)[1] };
    for (const [s0, o0] of [[-4, 5.5], [-4, 7.5], [-6.5, 6.5]]) { const [x, y] = H(s0, o0); pt(p, x, y, V.plate[0]); pt(p, x + 0.5, y, V.plate[0]); }
    // Stirnreif eng am Helm, Kristallkrone wächst aus der Helmglocke
    for (let o = -8; o <= 9.5; o += 0.5) { const sY = 5.2 + Math.cos(o / 9 * 1.4) * 1.6, [x, y] = H(sY, o); pt(p, x, y, V.trim[3]); const [x2, y2] = H(sY - 0.6, o); pt(p, x2, y2, V.trim[1]); }
    for (const [o, len, tilt, sb] of [[-7, 9, -0.55, 6], [-3.5, 13, -0.28, 8], [0.5, 18, -0.06, 9], [4.5, 13, 0.18, 8], [8, 8, 0.42, 5]]) {
      const [bx, by] = H(sb, o), a = Math.atan2(uy, ux) + tilt;
      gem(p, bx, by, bx + Math.cos(a) * len, by + Math.sin(a) * len, 4, V.crystal);
      if (len > 15) pt(g, bx + Math.cos(a) * len, by + Math.sin(a) * len, glow[3]);
    }
    meta.head = { x: hx, y: hy - 20 };

    // --- 6. Schwung, vorderer Arm, Schwert, vordere Schulter
    if (extra.smear) smear(p, g, shF.x, shF.y, extra.smear[0], extra.smear[1], 26, 26 + 82, glow, [V.crystal[4], V.crystal[3], '#c8e8ff', '#5a8ab8']);
    let tip;
    if (extra.swordBehind) { tip = kaldrisSword(p, g, hF.x, hF.y, sa, V, glow); kaldrisArm(p, armF, shF, V, false); }
    else { kaldrisArm(p, armF, shF, V, false); tip = kaldrisSword(p, g, hF.x, hF.y, sa, V, glow); orb(p, hF.x, hF.y, 4.2, 3.8, V.plate); }
    pauldron(p, shF.x, shF.y - 1.5, 10.5, V, false, [[-7, 12, -2.25], [-2, 14, -1.95], [4, 9, -1.15]]);
    meta.hand = { x: hF.x, y: hF.y }; meta.tip = tip;
    // Zauberglut an der freien Hand
    meta.cast = { x: armB.ex, y: armB.ey - 6 };
    if (P.cast > 0.05) bloom(g, meta.cast.x, meta.cast.y, 2 + P.cast * 5, glow);
    return meta;
  };
}

function collapseKaldris(V) {
  return (p, g, k, glow) => {
    const gy = BAY, cx = BAX;
    kaldrisSword(p, g, cx - 30, gy - 3, -0.04, V, glow);
    for (let i = 0; i < 9; i++) {
      const x = cx - 22 + hash2(i, 1, 51) * 44, y = gy - 3 - hash2(i, 2, 51) * 6, s = 5 + hash2(i, 3, 51) * 5;
      plate(p, [[x - s, y], [x - s * 0.5, y - s * 0.7], [x + s * 0.6, y - s * 0.6], [x + s, y + 1]], i % 2 ? V.plate : V.dark);
    }
    for (let i = 0; i < 7; i++) gem(p, cx - 18 + i * 6, gy - 2, cx - 20 + i * 6 + hash2(i, 4, 51) * 6, gy - 10 - hash2(i, 5, 51) * 10 * (1 - k * 0.5), 3, V.crystal);
  };
}


// ================================================================ Ysgarn, der Alte Gärtner

const YSG = {
  B: {
    bark: ['#140c0e', '#2a1a18', '#432a22', '#5e3e2c', '#80583a', '#b08a5c'],
    barkB: ['#0c0708', '#1c1210', '#2c1e18', '#3e2a20', '#523a28', '#6e5034'],
    moss: ['#0e1a14', '#1a3022', '#2a4a2c', '#3e6a36', '#5a8c44', '#8ab45a'],
    hat: ['#1a1408', '#3a2c12', '#5e4a1e', '#86702e', '#b09a46', '#e0cc7a'],
    bloom: ['#5a1e46', '#a03a7a', '#d866a6', '#f8a8d0', '#ffe8f4'],
    blade: ['#1a2a28', '#3a5a52', '#6a9a86', '#a8d8c0', '#eefff6'],
    lamp: ['#4a1238', '#9a2a6a', '#e060a8', '#ffb8dc', '#ffffff'],
  },
  A: {
    bark: ['#2a2432', '#463e50', '#6e6474', '#9e9298', '#ccc0bc', '#f0e8e0'],
    barkB: ['#1a1622', '#2e2838', '#463e50', '#625868', '#80748a', '#a094a8'],
    moss: ['#1a1a24', '#2e3040', '#4a4c60', '#6a6c86', '#9294b0', '#c4c4dc'],
    hat: ['#1c1426', '#36284a', '#54406e', '#76609a', '#9e88c0', '#d0c0ec'],
    bloom: ['#4a0a3a', '#9a1a7a', '#e040b8', '#ffb0e8', '#ffffff'],
    blade: ['#24083e', '#4a1474', '#8a3ac8', '#d29cff', '#fbeeff'],
    lamp: ['#4a0a3a', '#9a1a7a', '#e040b8', '#ffb0e8', '#ffffff'], fx: 'void',
  },
  C: {
    bark: ['#080606', '#141010', '#221a18', '#34261e', '#4a3626', '#6e5034'],
    barkB: ['#050404', '#0c0a0a', '#161210', '#221a16', '#30241c', '#463426'],
    moss: ['#0c0a0a', '#1a1414', '#2a2020', '#3e3030', '#584444', '#7a625c'],
    hat: ['#100a08', '#22160e', '#3a2614', '#56381c', '#7a5028', '#a8743a'],
    bloom: ['#4a0e06', '#a8280c', '#f0602a', '#ffb070', '#fff4d8'],
    blade: ['#1a0604', '#4a1006', '#9a300c', '#ff8a2a', '#fff0b0'],
    lamp: ['#4a0e06', '#a8280c', '#f0602a', '#ffb070', '#fff4d8'], fx: 'ember',
  },
};

// Rindenrillen entlang einer Strecke
function grooves(p, x0, y0, x1, y1, w, c, seed) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  for (let k = -w / 2 + 1.5; k < w / 2 - 1; k += 2.2) {
    const a = 0.1 + hash2(Math.round(k * 3), 1, seed) * 0.25, b = 0.55 + hash2(Math.round(k * 3), 2, seed) * 0.4;
    hair(p, x0 + dx * a + nx * k, y0 + dy * a + ny * k, x0 + dx * b + nx * (k + 0.4), y0 + dy * b + ny * (k + 0.4), c);
  }
}

function ysgarnLeg(p, hx, hy, L, V, back) {
  const bk = back ? V.barkB : V.bark;
  bar(p, hx, hy, L.jx, L.jy, 14, 12, bk); grooves(p, hx, hy, L.jx, L.jy, 14, bk[1], back ? 3 : 4);
  bar(p, L.jx, L.jy, L.ex, L.ey - 3, 12, 15, bk); grooves(p, L.jx, L.jy, L.ex, L.ey - 3, 12, bk[1], back ? 5 : 6);
  orb(p, L.jx, L.jy, 6.5, 5.5, bk);
  // Wurzelfuß: Wurzeln greifen in den Boden
  for (const [dx, w] of [[-12, 4], [-5, 4.5], [6, 5], [14, 4]]) { bar(p, L.ex, L.ey - 4, L.ex + dx * 0.6, L.ey - 1, w + 1.5, w, bk, { edge: 0.6 }); bar(p, L.ex + dx * 0.6, L.ey - 1, L.ex + dx, L.ey, w, 1.5, bk, { edge: 0.6 }); }
}

function ysgarnArm(p, A, sh, V, back) {
  const bk = back ? V.barkB : V.bark;
  bar(p, sh.x, sh.y, A.jx, A.jy, 11.5, 9, bk); grooves(p, sh.x, sh.y, A.jx, A.jy, 10, bk[1], back ? 7 : 8);
  bar(p, A.jx, A.jy, A.ex, A.ey, 9, 6.5, bk); grooves(p, A.jx, A.jy, A.ex, A.ey, 9, bk[1], back ? 9 : 10);
  ell(p, A.jx, A.jy, 4.6, 4.6, bk[2]); ell(p, A.jx - 1, A.jy - 1, 2.4, 2, bk[3]); pt(p, A.jx + 1, A.jy + 1.5, bk[0]);
  // Zweigfinger
  for (let k = -1; k <= 1; k++) { const a = Math.atan2(A.ey - A.jy, A.ex - A.jx) + k * 0.55; bar(p, A.ex, A.ey, A.ex + Math.cos(a) * 7, A.ey + Math.sin(a) * 7, 2.6, 1, bk, { edge: 0.5 }); }
}

export function ysgarnScythe(p, g, hx, hy, a, V, glow) {
  const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
  const P = (s, o) => [hx + dx * s + nx * o, hy + dy * s + ny * o];
  bar(p, ...P(-16, 0), ...P(42, 0), 4, 3.4, V.bark, { edge: 0.6 });
  for (const s of [-8, 14, 30]) { const [x, y] = P(s, 0); orb(p, x, y, 2.4, 2.4, V.bark); }
  for (let s = -14; s < -2; s += 1.6) hair(p, ...P(s, -2), ...P(s + 1, 2), V.moss[3]);
  // Klinge: am Schaftende, zum Griff gekrümmt, Schneide innen hell
  const [ex, ey] = P(42, 0);
  let tip = { x: ex, y: ey };
  const out = [], inn = [];
  for (let u = 0; u <= 1.0001; u += 0.05) {
    const bx = ex - nx * 30 * u - dx * 14 * u * u, by = ey - ny * 30 * u - dy * 14 * u * u, w = 7.5 * Math.pow(Math.max(0, 1 - u), 0.75) + 0.4;
    let tx = -nx * 30 - dx * 28 * u, ty = -ny * 30 - dy * 28 * u; const tl = Math.hypot(tx, ty); tx /= tl; ty /= tl;
    let ox = -ty, oy = tx; if (ox * -dx + oy * -dy < 0) { ox = -ox; oy = -oy; }
    out.push([bx, by]); inn.push([bx + ox * w, by + oy * w]); tip = { x: bx, y: by };
  }
  plate(p, [...out, ...inn.reverse()], V.blade, { edge: 0.9 });
  for (let i = 2; i < out.length - 4; i += 3) { const [x, y] = out[i]; pt(p, x, y, glow[2]); pt(g, x, y, glow[3]); }
  orb(p, ex, ey, 3.6, 3.6, V.moss);
  blossom2(p, ex - nx * 3, ey - ny * 3, V.bloom, true);
  return tip;
}

function blossom2(p, x, y, ramp, big) {
  const s = big ? 1.2 : 0.7;
  for (const [ox, oy, k] of [[-s, 0, 2], [s, 0, 2], [0, -s, 3], [0, s, 1], [-s * 0.7, -s * 0.7, 3], [s * 0.7, s * 0.7, 1]]) { pt(p, x + ox, y + oy, ramp[k]); if (big) pt(p, x + ox * 1.6, y + oy * 1.6, ramp[k]); }
  pt(p, x, y, ramp[4]);
}

function drawYsgarn(V) {
  return (p, g, P0, glow, extra = {}) => {
    const r = bigRig(P0, 1.5);
    const { P, gy, hipX, hipY, lean, chX, chY, perpX, perpY, legF, legB, shF, shB, hF, sa, armF, armB, neckX, neckY } = r;
    const meta = {};
    const ux = Math.sin(lean), uy = -Math.cos(lean);

    // --- 1. Moosmantel hinten, mit Blüten
    const at = drape(p, P, chX - perpX * 4 - 22, chY - 6, 34, 74 - P.kneel * 16, V.moss, { w: 1, sway: 22, speckle: 0.14, seed: 41 });
    for (const [i, v] of [[4, 0.3], [9, 0.62], [14, 0.22], [19, 0.5], [25, 0.35], [30, 0.7], [7, 0.85], [22, 0.88]]) { const b = at(i, v); blossom2(p, b.x, b.y, V.bloom, v < 0.6); }
    for (let i = 1; i < 34; i += 2) { const b = at(i, 1); hair(p, b.x, b.y, b.x - 1, b.y + 3 + hash2(i, 1, 9) * 4, V.moss[2]); }

    const SP = { back: [[34, -12, -0.6, 18], [24, -15, -1.0, 14], [12, -14, -1.4, 10]], cracks: [[[34, 4], [26, 1], [20, 3], [12, -1], [4, 2]], [[30, 12], [24, 14], [18, 12]], [[10, 10], [4, 13]]] };
    taint(p, g, r, V, glow, SP, 'back');
    // --- 2. Hinteres Bein und Arm
    ysgarnLeg(p, hipX - 3, hipY, legB, V, true);
    ysgarnArm(p, armB, shB, V, true);

    // --- 3. Rumpf: knorriger Stamm, Bauch nach vorn, Astloch mit Lichtsamen
    const trunk = AL(r, [[-6, -11], [-6, 12], [8, 16], [22, 17], [34, 13], [40, 4], [38, -10], [26, -15], [10, -14]]);
    plate(p, trunk, V.bark, { lo: 0.5 });
    for (let k = -10; k <= 14; k += 3) { const a0 = along(r, -4, k), a1 = along(r, 36 - Math.abs(k - 2) * 0.6, k * 0.8); hair(p, a0.x, a0.y, a1.x, a1.y, V.bark[1]); if (k % 2 === 0) hair(p, a0.x + 0.5, a0.y, a1.x + 0.5, a1.y, V.bark[4]); }
    const hole = along(r, 18, 7);
    orb(p, hole.x, hole.y, 5, 6, [V.bark[0], V.bark[0], V.bark[1], V.bark[1], V.bark[2]]);
    const seed = { x: hole.x + 0.5, y: hole.y + 0.5 };
    ell(p, seed.x, seed.y, 2.6, 3.2, glow[2]); ell(p, seed.x - 0.5, seed.y - 0.5, 1.4, 1.8, glow[3]); pt(p, seed.x - 0.8, seed.y - 1, glow[4]);
    bloom(g, seed.x, seed.y, 1.8 + P.soul * 0.9, glow);
    meta.chest = seed;
    // Gürtel aus Ranke, Laterne am Gürtel
    for (let o = -11; o <= 16; o += 0.5) { const q = along(r, 1 + Math.sin(o * 0.7) * 0.6, o); pt(p, q.x, q.y, V.moss[3]); const q2 = along(r, 0, o); pt(p, q2.x, q2.y, V.moss[1]); }
    const lp = along(r, -1, 13);
    hair(p, lp.x, lp.y, lp.x + 1, lp.y + 6, V.bark[1]);
    plate(p, [[lp.x - 2.5, lp.y + 6], [lp.x + 4.5, lp.y + 6], [lp.x + 4, lp.y + 13], [lp.x - 2, lp.y + 13]], V.bark, { edge: 0.6 });
    ell(p, lp.x + 1, lp.y + 9.5, 2, 2.5, V.lamp[2]); pt(p, lp.x + 0.5, lp.y + 9, V.lamp[4]); pt(g, lp.x + 0.5, lp.y + 9, glow[4]); pt(g, lp.x + 1, lp.y + 9.5, glow[3]); pt(g, lp.x + 1, lp.y + 10, glow[2]);

    taint(p, g, r, V, glow, SP, 'body');
    // --- 4. Vorderes Bein
    ysgarnLeg(p, hipX + 3, hipY, legF, V, false);

    // --- 5. Kopf: Rindengesicht unter dem Hut aus Flechtwerk, Moosbart, Geweih aus Ästen
    const hx = neckX + ux * 9 + perpX * 4 + P.head, hy = neckY + uy * 9;
    const H = (s, o) => [hx + ux * s + perpX * o, hy + uy * s + perpY * o];
    // Äste hinter dem Hut
    for (const [o, len, tilt, kinks] of [[-6, 24, -0.55, 2], [-1, 28, -0.2, 3], [4, 22, 0.3, 2]]) {
      let [x, y] = H(6, o), a = Math.atan2(uy, ux) + tilt;
      for (let k = 0; k < kinks; k++) {
        const l = len / kinks, x2 = x + Math.cos(a) * l, y2 = y + Math.sin(a) * l;
        bar(p, x, y, x2, y2, 4.4 - k * 1.2, 3.2 - k * 1.1, V.bark, { edge: 0.5 });
        const sa2 = a + (k % 2 ? 0.7 : -0.7); bar(p, x2, y2, x2 + Math.cos(sa2) * 6, y2 + Math.sin(sa2) * 6, 2, 0.8, V.bark, { edge: 0.5 });
        blossom2(p, x2 + Math.cos(sa2) * 6, y2 + Math.sin(sa2) * 6, V.bloom, k === kinks - 1);
        x = x2; y = y2; a += k % 2 ? -0.35 : 0.35;
      }
      blossom2(p, x, y, V.bloom, true);
    }
    // Gesicht: breite Rindenmaske, tiefe Augenhöhlen unter der Krempe, Aststumpf als Nase
    plate(p, [H(-8, -6), H(-9, 4), H(-6, 10), H(0, 11), H(4, 9.5), H(4, -6), H(-2, -8)], V.bark, { lo: 0.5 });
    for (const o of [-3, 0.5]) { const [x0, y0] = H(-7.5, o), [x1, y1] = H(2.5, o + 0.6); hair(p, x0, y0, x1, y1, V.bark[1]); }
    plate(p, [H(2.6, 1), H(3.6, 11), H(1.4, 11), H(0.6, 2)], V.bark, { edge: 0.6, glint: false });
    bar(p, ...H(-1.5, 8.5), ...H(-4, 14), 3.8, 2.2, V.bark, { edge: 0.5 });
    const eyeOn = P.eye > 0.2;
    for (const [s0, o0] of [[0.4, 3.2], [0.4, 8]]) {
      const [x, y] = H(s0, o0); ell(p, x, y, 2.2, 1.6, V.bark[0]);
      if (eyeOn) { pt(p, x, y, glow[3]); pt(p, x + 0.5, y, glow[4]); pt(g, x, y, glow[4]); pt(g, x + 0.5, y, glow[3]); pt(g, x - 0.5, y, glow[2]); }
    }
    meta.eye = { x: H(0.4, 8)[0], y: H(0.4, 8)[1] };
    // Moosbart in Strähnen
    for (let o = -6; o <= 10; o += 0.8) {
      const [x, y] = H(-6.5 - Math.abs(o - 3) * 0.25, o), len = 8 + (1 - Math.abs(o - 3) / 9) * 13 + hash2(Math.round(o * 2) + 20, 3, 13) * 4;
      hair(p, x, y, x - ux * len - perpX * 2, y - uy * len + 1, V.moss[2 + (Math.round(o * 2) % 3)]);
    }
    if (P.jaw > 0.4) { const [x, y] = H(-6, 5.5); ell(p, x, y, 2.6, 1.4, V.bark[0]); }
    // Hut: breite Krempe aus Flechtwerk, Kuppe, Blütenband
    plate(p, [H(3, -14), H(7.5, -12), H(9, 0), H(8, 14), H(4, 18), H(2.5, 10), H(3, -4)], V.hat, { edge: 0.8 });
    plate(p, [H(7, -8), H(14, -6), H(17, 0), H(15, 5), H(8, 7)], V.hat, { edge: 0.8 });
    for (let o = -12; o < 16; o += 2) { const [x, y] = H(5.5, o), [x2, y2] = H(4, o + 1.5); hair(p, x, y, x2, y2, V.hat[1]); }
    for (let o = -7; o <= 6; o += 2.5) { const [x, y] = H(8.2, o); blossom2(p, x, y, V.bloom, false); }
    meta.head = { x: hx, y: hy - 24 };

    // --- 6. Schwung, vorderer Arm mit Sense
    if (extra.smear) smear(p, g, shF.x, shF.y, extra.smear[0], extra.smear[1], 26, 26 + 80, glow, [V.blade[4], V.blade[3], '#f8d0e8', '#7a9a8a']);
    let tip;
    if (extra.swordBehind) { tip = ysgarnScythe(p, g, hF.x, hF.y, sa, V, glow); ysgarnArm(p, armF, shF, V, false); }
    else { ysgarnArm(p, armF, shF, V, false); tip = ysgarnScythe(p, g, hF.x, hF.y, sa, V, glow); orb(p, hF.x, hF.y, 3.6, 3.2, V.bark); }
    // Schulterwulst mit Moos
    orb(p, shF.x, shF.y - 1, 8, 6.5, V.bark);
    plate(p, [[shF.x - 8, shF.y - 3], [shF.x - 3, shF.y - 8], [shF.x + 5, shF.y - 7.5], [shF.x + 8.5, shF.y - 2], [shF.x + 3, shF.y - 1]], V.moss, { edge: 0.6 });
    for (let k = -7; k < 8; k += 2) hair(p, shF.x + k, shF.y - 2, shF.x + k - 0.5, shF.y + 2 + hash2(k + 9, 1, 3) * 3, V.moss[2]);
    blossom2(p, shF.x - 2, shF.y - 6, V.bloom, true); blossom2(p, shF.x + 4, shF.y - 5, V.bloom, false);
    meta.hand = { x: hF.x, y: hF.y }; meta.tip = tip;
    meta.cast = { x: armB.ex, y: armB.ey - 6 };
    if (P.cast > 0.05) bloom(g, meta.cast.x, meta.cast.y, 2 + P.cast * 5, glow);
    return meta;
  };
}

function collapseYsgarn(V) {
  return (p, g, k, glow) => {
    const gy = BAY, cx = BAX;
    ysgarnScythe(p, g, cx - 34, gy - 3, -0.05, V, glow);
    for (let i = 0; i < 8; i++) { const x = cx - 26 + i * 7, y = gy - 3; bar(p, x, y, x + 8 + hash2(i, 1, 7) * 6, y - 2 - hash2(i, 2, 7) * 6 * (1 - k * 0.6), 6, 3, i % 2 ? V.bark : V.barkB); }
    for (let i = 0; i < 10; i++) blossom2(p, cx - 24 + hash2(i, 3, 7) * 48, gy - 4 - hash2(i, 4, 7) * 8, V.bloom, i % 3 === 0);
  };
}

// ================================================================ Königin Ysmeine

const YSM = {
  B: {
    gown: ['#06081a', '#0c1230', '#141c48', '#1e2a64', '#2c3c84', '#4a5ca8'],
    cape: ['#05060f', '#0a0e22', '#121836', '#1a224a', '#26305e'],
    skin: ['#2a2048', '#463a6e', '#6a5a96', '#9282bc', '#bcb0e0', '#e2dcf8'],
    hair: ['#3a3a5a', '#6a6a90', '#a4a6c8', '#d4d8ee', '#f8faff'],
    trim: ['#3a2208', '#7a4a12', '#b8801e', '#e8b840', '#fff0a0'],
    steel: ['#1e2236', '#3a4060', '#646c94', '#a0a8cc', '#e4e8fa'],
  },
  A: {
    gown: ['#24203c', '#3c3660', '#5e5888', '#8a86b2', '#b8b6d8', '#e4e4f6'],
    cape: ['#0c0618', '#180c2c', '#261444', '#361e5c', '#4a2a74'],
    skin: ['#3a3450', '#5e5676', '#8a82a2', '#b4aec8', '#dcd8ea', '#f8f6ff'],
    hair: ['#4a4a64', '#7a7a9a', '#b0b0cc', '#dedef0', '#ffffff'],
    trim: ['#2a2a3a', '#5a5a74', '#9a9ab4', '#d0d0e4', '#ffffff'],
    steel: ['#24083e', '#4a1474', '#8a3ac8', '#d29cff', '#fbeeff'], fx: 'void',
  },
  C: {
    gown: ['#060404', '#100a0a', '#1c1212', '#2a1a18', '#3e2620', '#5a382a'],
    cape: ['#040202', '#0c0606', '#160a08', '#22100c', '#301610'],
    skin: ['#1e1a1c', '#363034', '#524a4e', '#74686a', '#9c8e8c', '#c4b4ae'],
    hair: ['#1a0c0a', '#3a1610', '#6a2a16', '#a84a20', '#e88a3a'],
    trim: ['#2a1008', '#5a2810', '#8a4a1c', '#c07a34', '#f0b060'],
    steel: ['#1a0604', '#4a1006', '#9a300c', '#ff8a2a', '#fff0b0'], fx: 'ember',
  },
};

function ysmeineGlaive(p, g, hx, hy, a, V, glow) {
  const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
  const P = (s, o) => [hx + dx * s + nx * o, hy + dy * s + ny * o];
  bar(p, ...P(-26, 0), ...P(46, 0), 3, 3, V.steel, { edge: 0.5 });
  for (const s of [-22, -4, 30]) bar(p, ...P(s, 0), ...P(s + 3, 0), 4.4, 4.4, V.trim, { edge: 0.5 });
  gem(p, ...P(-26, 0), ...P(-32, 0), 4, [V.trim[1], V.trim[2], V.trim[3], V.trim[4], V.trim[4]]);
  // Blattklinge, leicht geschwungen, und Mondsichel als Parier
  const [bx, by] = P(46, 0);
  const top = [], bot = [];
  for (let u = 0; u <= 1.0001; u += 0.05) { const uu = Math.min(1, u); top.push(P(46 + uu * 30, -3.4 * (1 - uu) - Math.sin(uu * Math.PI) * 1.6)); bot.push(P(46 + uu * 30, 3 * (1 - uu) * (1 - uu) + Math.sin(uu * Math.PI) * 0.8)); }
  plate(p, [...top, ...bot.reverse()], V.steel, { edge: 0.9 });
  for (let u = 0.1; u < 0.8; u += 0.1) { const [x, y] = P(46 + u * 30, -0.6); pt(p, x, y, glow[2]); pt(g, x, y, glow[3]); }
  for (let t = -1; t <= 1; t += 0.04) { const a2 = t * 1.35, [x, y] = P(44 + Math.cos(a2) * -3, Math.sin(a2) * 8); pt(p, x, y, V.trim[3]); const [x2, y2] = P(44.6 + Math.cos(a2) * -3.6, Math.sin(a2) * 8.6); pt(p, x2, y2, V.trim[1]); }
  star(p, bx - 1, by, 3.4, V.trim[3]); star(p, bx - 1.3, by - 0.3, 1.7, V.trim[4]); star(g, bx - 1, by, 2.6, glow[2]); pt(g, bx - 1, by, glow[4]);
  const [tx, ty] = P(76, -0.5);
  return { x: tx, y: ty };
}

function drawYsmeine(V) {
  return (p, g, P0, glow, extra = {}) => {
    const r = bigRig(P0, 1.5);
    const { P, gy, hipX, hipY, lean, chX, chY, perpX, perpY, legF, legB, shF, shB, hF, sa, armF, armB, neckX, neckY } = r;
    const meta = {};
    const ux = Math.sin(lean), uy = -Math.cos(lean);

    // --- 1. Sternenmantel hinten
    const at = drape(p, P, chX - perpX * 4 - 24, chY - 4, 38, 96 - P.kneel * 16, V.cape, { w: 1, sway: 28, seed: 77 });
    for (let i = 0; i < 26; i++) { const b = at(1 + (i * 7) % 36, 0.15 + hash2(i, 1, 79) * 0.8); pt(p, b.x, b.y, i % 4 ? V.hair[3] : V.trim[4]); if (i % 5 === 0) star(p, b.x, b.y, 1.6, V.trim[3]); }
    for (let i = 0; i < 38; i++) { const b = at(i, 1); pt(p, b.x, b.y, V.trim[2]); }

    const SP = { back: [[30, -9, -0.5, 14], [22, -11, -1.0, 11]], cracks: [[[28, 3], [20, 6], [12, 3]], [[0, 2], [-12, 5], [-24, 3], [-34, 8]], [[-4, -4], [-18, -8], [-30, -6]]] };
    taint(p, g, r, V, glow, SP, 'back');
    // --- 2. Sternkragen hinter dem Kopf: Fächer aus Strahlen
    const nk = { x: neckX - perpX * 2, y: neckY };
    for (let k = 0; k < 7; k++) {
      const a = Math.atan2(uy, ux) - 1.75 + k * 0.3, len = 16 + (k === 4 ? 7 : k % 2 ? 2 : 5);
      gem(p, nk.x + Math.cos(a) * 4, nk.y + Math.sin(a) * 4, nk.x + Math.cos(a) * len, nk.y + Math.sin(a) * len, 4.2, [V.gown[2], V.gown[3], V.gown[4], V.trim[3], V.trim[4]]);
      pt(g, nk.x + Math.cos(a) * len, nk.y + Math.sin(a) * len, glow[3]);
    }

    // --- 3. Hinterer Arm
    bar(p, shB.x, shB.y, armB.jx, armB.jy, 6, 5, V.gown);
    bar(p, armB.jx, armB.jy, armB.ex, armB.ey, 5, 7, V.gown);
    orb(p, armB.ex, armB.ey, 2.6, 2.4, V.skin);

    // --- 4. Kleid: weite Glocke bis zum Boden, die Füße treten vorn darunter hervor
    const back = Math.min(legB.ex, legF.ex) - 16, front = Math.max(legF.ex, legB.ex) + 14, sw = Math.sin(P.capeT) * 2;
    plate(p, [[legF.ex + 2, gy - 3], [legF.ex + 12, gy - 3], [legF.ex + 12, gy], [legF.ex + 1, gy]], V.steel, { edge: 0.5 });
    const gown = [...AL(r, [[2, -9], [2, 10]]), [front + sw, gy - 1], [(front + back) / 2, gy + 1], [back + sw, gy]];
    plate(p, gown, V.gown, { lo: 0.5, hi: 0.8 });
    { const f0 = along(r, 2, 2), f1 = along(r, 2, 10); plate(p, [[f0.x, f0.y], [f1.x, f1.y], [front + sw - 2, gy - 2], [legF.ex - 6 + sw, gy - 2]], [V.gown[1], V.gown[3], V.gown[4], V.gown[4], V.gown[5]], { edge: 0.6, glint: false }); }
    // Falten
    for (let k = 0; k < 6; k++) { const t = (k + 0.5) / 6, top = along(r, 1, -8 + t * 18), bx = back + (front - back) * t + sw; hair(p, top.x, top.y + 3, bx, gy - 2, V.gown[k % 2 ? 1 : 4]); }
    // Saum und Sternbild
    for (let x = back + sw; x <= front + sw; x += 0.5) { pt(p, x, gy - 1.5, V.trim[3]); pt(p, x, gy - 2, V.trim[2]); }
    const cons = [[0.25, 0.55], [0.38, 0.4], [0.52, 0.48], [0.6, 0.66], [0.75, 0.6]];
    let prev = null;
    for (const [tx, ty] of cons) {
      const x = back + (front - back) * tx + sw * ty, y = hipY + (gy - hipY) * ty;
      if (prev) hair(p, prev[0], prev[1], x, y, V.gown[5]);
      star(p, x, y, 1.8, V.trim[4]); pt(g, x, y, glow[3]); prev = [x, y];
    }

    // --- 5. Mieder, Gürtel, Brosche
    plate(p, AL(r, [[0, -8], [0, 9], [14, 11], [28, 12], [34, 8], [35, -6], [28, -9], [12, -8]]), V.gown);
    for (const o of [-6, 8]) { const a0 = along(r, 30, o), a1 = along(r, 2, 1); hair(p, a0.x, a0.y, a1.x, a1.y, V.trim[2]); }
    for (let o = -8; o <= 9; o += 0.5) { const q = along(r, 1, o); pt(p, q.x, q.y, V.trim[3]); const q2 = along(r, 0, o); pt(p, q2.x, q2.y, V.trim[1]); }
    const br = along(r, 24, 4);
    star(p, br.x, br.y, 4, V.trim[3]); star(p, br.x - 0.3, br.y - 0.3, 2, V.trim[4]); bloom(g, br.x, br.y, 2 + P.soul, glow);
    meta.chest = br;
    // Hals
    bar(p, ...[along(r, 33, 2).x, along(r, 33, 2).y], neckX + perpX * 1.5, neckY - 1, 5, 4, V.skin, { edge: 0.5 });

    taint(p, g, r, V, glow, SP, 'body');
    // --- 6. Kopf: Profil, langes Silberhaar, spitzes Ohr, Sternenkrone
    const hx = neckX + ux * 10 + perpX * 3 + P.head, hy = neckY + uy * 10, HK = 1.22;
    const H = (s, o) => [hx + (ux * s + perpX * o) * HK, hy + (uy * s + perpY * o) * HK];
    // Haar: lange Silbermähne fällt über den Rücken, weht mit dem Mantel
    const hs = P.cape * 8 + Math.sin(P.capeT) * 2;
    const mane = [H(9.5, -1), H(7, -8), H(0, -11), H(-8, -13 - hs * 0.3), H(-16, -11.5 - hs * 0.6), H(-24, -13.5 - hs), H(-32, -11 - hs * 1.2), H(-36, -7 - hs * 1.3), H(-30, -6 - hs), H(-22, -3 - hs * 0.6), H(-14, -3.5), H(-8, -1), H(-4, 1)];
    plate(p, mane, V.hair, { lo: 0.5, hi: 0.8 });
    for (let k = 0; k < 7; k++) { const o0 = -9 + k * 1.4; let prev = H(4, o0); for (let s0 = 2; s0 > -34 + k * 3; s0 -= 4) { const q = H(s0, o0 - (2 - s0) * 0.08 - hs * (2 - s0) / 36 + Math.sin(s0 * 0.3 + k) * 0.6); hair(p, ...prev, ...q, k % 2 ? V.hair[1] : V.hair[3]); prev = q; } }
    // Ohr: lang und spitz nach hinten oben
    gem(p, ...H(0.5, 0.5), ...H(6, -12), 3.6, V.skin);
    // Gesicht im Profil: Stirn, Nase, Lippen, Kinn
    plate(p, [H(7, 0), H(6, 5.5), H(3.5, 7.2), H(1, 7.4), H(-1.2, 9.6), H(-2.2, 8.2), H(-3.4, 8.5), H(-4.4, 7.7), H(-5.2, 8), H(-6.8, 7.6), H(-8.4, 4.5), H(-7, 0.5), H(-1, -1.5)], V.skin, { lo: 0.42, hi: 0.66 });
    for (const [s0, o0] of [[-3.8, 7.4], [-3.8, 6.9]]) pt(p, ...H(s0, o0), '#5a2a5a');
    pt(p, ...H(-1.8, 8.4), V.skin[1]);
    const eyeOn = P.eye > 0.2;
    for (let k = 0; k <= 2; k += 0.5) { const [x, y] = H(2.3 - k * 0.1, 3.6 + k); pt(p, x, y, eyeOn ? (k > 0.8 ? glow[4] : glow[3]) : V.skin[1]); if (eyeOn) pt(g, x, y, glow[3]); }
    for (let k = -0.5; k <= 3; k += 0.5) pt(p, ...H(3.4 + k * 0.12, 3.2 + k), V.hair[0]);
    const [ex, ey] = H(2.3, 4.6);
    meta.eye = { x: ex, y: ey };
    // Stirnhaar: Scheitel und Strähne bis zur Wange
    plate(p, [H(10, -2), H(9.5, 4), H(7.4, 6.8), H(5.2, 6.2), H(6.4, 2.6), H(3, -0.5), H(-3, -1.5), H(4, -6)], V.hair, { edge: 0.8 });
    // Krone: Reif mit drei hohen Sternspitzen
    for (let o = -5; o <= 7; o += 0.5) { const [x, y] = H(6.6 + Math.sin((o + 5) / 12 * Math.PI) * 0.8, o); pt(p, x, y, V.trim[3]); const [x2, y2] = H(6, o); pt(p, x2, y2, V.trim[1]); }
    for (const [o, len] of [[-3, 9], [1.5, 14], [5.5, 9]]) {
      const [bx, by] = H(7, o), [tx, ty] = H(7 + len, o + (o - 1.5) * 0.25);
      gem(p, bx, by, tx, ty, 3, V.trim); star(p, tx, ty, len > 10 ? 3.2 : 2.2, V.trim[4]); star(g, tx, ty, len > 10 ? 2.6 : 1.8, glow[2]); pt(g, tx, ty, glow[4]);
    }
    meta.head = { x: hx, y: hy - 26 };

    // --- 7. Schwung, vorderer Arm mit Glefe, Schulter
    if (extra.smear) smear(p, g, shF.x, shF.y, extra.smear[0], extra.smear[1], 26, 26 + 76, glow, [V.trim[4], V.steel[3], '#d8d0f0', '#6a64a0']);
    const arm = () => {
      bar(p, shF.x, shF.y, armF.jx, armF.jy, 6, 5.5, V.gown);
      bar(p, armF.jx, armF.jy, armF.ex, armF.ey, 5.5, 8, V.gown);
      for (let t = 0.7; t <= 1; t += 0.05) pt(p, armF.jx + (armF.ex - armF.jx) * t, armF.jy + (armF.ey - armF.jy) * t + 3, V.trim[3]);
    };
    let tip;
    if (extra.swordBehind) { tip = ysmeineGlaive(p, g, hF.x, hF.y, sa, V, glow); arm(); }
    else { arm(); tip = ysmeineGlaive(p, g, hF.x, hF.y, sa, V, glow); orb(p, hF.x, hF.y, 2.6, 2.4, V.skin); }
    plate(p, [[shF.x - 6, shF.y + 2], [shF.x - 3, shF.y - 4], [shF.x + 4, shF.y - 4.5], [shF.x + 7, shF.y + 1], [shF.x + 3, shF.y + 4]], V.steel, { edge: 0.8 });
    for (let x = -5; x <= 6; x += 0.5) pt(p, shF.x + x, shF.y + 3 - Math.abs(x) * 0.15, V.trim[3]);
    meta.hand = { x: hF.x, y: hF.y }; meta.tip = tip;
    meta.cast = { x: armB.ex, y: armB.ey - 6 };
    if (P.cast > 0.05) bloom(g, meta.cast.x, meta.cast.y, 2 + P.cast * 5, glow);
    return meta;
  };
}

function collapseYsmeine(V) {
  return (p, g, k, glow) => {
    const gy = BAY, cx = BAX;
    ysmeineGlaive(p, g, cx - 28, gy - 3, -0.03, V, glow);
    plate(p, [[cx - 26, gy], [cx - 18, gy - 7 + k * 3], [cx, gy - 9 + k * 4], [cx + 18, gy - 5 + k * 2], [cx + 26, gy]], V.gown);
    for (let i = 0; i < 24; i++) { if (hash2(i, 3, 95) < k * 0.7) continue; const x = cx - 22 + hash2(i, 4, 95) * 44, y = gy - 8 - hash2(i, 5, 95) * (24 + k * 40); pt(p, x, y, V.hair[4]); pt(g, x, y, glow[3]); }
  };
}
const CYAN = ['#0a3a52', '#1a7aa0', '#40c8e8', '#b8f4ff', '#ffffff'];
const MAGENTA = ['#4a0a3a', '#9a1a7a', '#e040b8', '#ffb0e8', '#ffffff'];

const COLLAPSE_META = { head: { dx: 18, dy: -14 }, chest: { dx: -6, dy: -9 }, hand: { dx: -30, dy: -6 }, tip: { dx: 30, dy: -6 }, eye: { dx: 18, dy: -12 }, cast: { dx: 0, dy: -9 } };

const EMBER = ['#4a0e06', '#a8280c', '#f0602a', '#ffb070', '#fff4d8'];
const VIOLET = ['#3a1466', '#6a2cb0', '#a060f0', '#e0b8ff', '#ffffff'];
// Glutrampe (Phase 1–2) und zweite Rampe (Phase 3) je Entwurf
const GLOWS = {
  kaldris: { A: [MAGENTA, CYAN], B: [CYAN, MAGENTA], C: [EMBER, VIOLET] },
  ysgarn: { A: [MAGENTA, VIOLET], B: [null, null], C: [EMBER, VIOLET] },
  ysmeine: { A: [MAGENTA, CYAN], B: [null, null], C: [EMBER, VIOLET] },
};
export const createKaldrisSprites = (v = 'B') => rigBossSprites(drawKaldris(KAL[v]), collapseKaldris(KAL[v]), ...GLOWS.kaldris[v], { ...DIMS, collapseMeta: COLLAPSE_META });
const PINK = ['#4a1238', '#9a2a6a', '#e060a8', '#ffb8dc', '#ffffff'];
const GREEN = ['#0e3a1e', '#2a7a3a', '#5cd068', '#c0ffb0', '#ffffff'];
const GGLOW = ['#4a3008', '#a8741a', '#f0c040', '#fff0a0', '#ffffff'];
const VGLOW = ['#3a1466', '#6a2cb0', '#a060f0', '#e0b8ff', '#ffffff'];
GLOWS.ysgarn.B = [PINK, GREEN]; GLOWS.ysmeine.B = [GGLOW, VGLOW];
export const createYsgarnSprites = (v = 'B') => rigBossSprites(drawYsgarn(YSG[v]), collapseYsgarn(YSG[v]), ...GLOWS.ysgarn[v], { ...DIMS, collapseMeta: COLLAPSE_META });
export const createYsmeineSprites = (v = 'B') => rigBossSprites(drawYsmeine(YSM[v]), collapseYsmeine(YSM[v]), ...GLOWS.ysmeine[v], { ...DIMS, collapseMeta: COLLAPSE_META });
