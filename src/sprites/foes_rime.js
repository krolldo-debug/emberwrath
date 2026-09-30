import { PAL } from '../gfx/Palette.js';
import { Animation } from '../gfx/Sprite.js';
import { FK } from './foes_cinder.js';

// Gegner der Reifhöhlen (Eiskristallhöhle, Stufe 35–37): Eiselementar,
// Kristallspinne und Erfrorener Ritter.
//
// Gleicher Rig-Ansatz wie foes_ashwood.js / foes_cinder.js: Schlüsselposen
// werden beim Laden weich interpoliert, Material pro Pixel mit Licht von links
// oben schattiert. Leuchtendes Eis (Kerne, Augen, Frostkugeln) liegt auf der
// Leucht-Ebene (frame.glow). Ein Randlicht-Durchgang (rim) hellt die obere/
// linke Kante jeder Figur auf, damit die Silhouette auf dunklem Höhlenboden
// klar lesbar bleibt. Die Werkzeuge (RK) nutzt auch foes_throne.js.
// Blickrichtung rechts, Anker = Bodenkontakt.

const { linear, snap, clamp, ell, cap, poly, ik, track, still, hash2, occlude } = FK;
const TAU = Math.PI * 2;

// ================================================================ Kit

// Randlicht: Pixel mit freier Oberkante/linker Kante werden zur Lichtfarbe
// gezogen (Schlüssellicht), freie rechte Kanten schwach zur Gegenlichtfarbe.
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rim(p, key, keyK = 0.42, back = null, backK = 0.3) {
  const W = p.w, H = p.h;
  const img = p.ctx.getImageData(0, 0, W, H), d = img.data;
  const A = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) A[i] = d[i * 4 + 3] > 40 ? 1 : 0;
  const k = hexRgb(key), b = back ? hexRgb(back) : null;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : A[y * W + x]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!A[y * W + x]) continue;
    const i = (y * W + x) * 4;
    const up = !at(x, y - 1), lf = !at(x - 1, y), ul = !at(x - 1, y - 1);
    let t = 0, c = null;
    if (up || lf) { t = keyK * (up && lf ? 1.15 : up ? 1 : 0.75); c = k; }
    else if (ul) { t = keyK * 0.45; c = k; }
    else if (b && (!at(x + 1, y) || !at(x + 1, y - 1))) { t = backK; c = b; }
    if (!c) continue;
    t = Math.min(0.8, t);
    d[i] += (c[0] - d[i]) * t; d[i + 1] += (c[1] - d[i + 1]) * t; d[i + 2] += (c[2] - d[i + 2]) * t;
  }
  p.ctx.putImageData(img, 0, 0);
}

function mixP(a, b, t) { const o = {}; for (const k in a) o[k] = a[k] + ((b[k] ?? a[k]) - a[k]) * t; return o; }

// Dickes Glied mit Licht von links oben (ramp: 4 Stufen dunkel → hell), wie foes_ashwood.js
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

// Kristallsplitter: Basis (x,y), Richtung a, Länge len, halbe Breite w.
// Zwei Facetten (Licht links oben hell, Schattenseite dunkel), heller Grat,
// weiße Spitze. ramp mind. 5 Stufen. gl: Leuchtfarben für innere Glut (optional).
function shard(p, g, x, y, a, len, w, ramp, o = {}) {
  const { gl = null, tipW = 0, spark = true, base = 0.35 } = o;
  const ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
  const lightN = nx * -0.6 + ny * -0.8 > 0 ? 1 : -1;
  const S = (s, k) => [x + ux * s + nx * k, y + uy * s + ny * k];
  const mid = len * base;
  const L = [S(0, -w * 0.7), S(mid, -w), S(len, -tipW)], R = [S(0, w * 0.7), S(mid, w), S(len, tipW)];
  const n = ramp.length;
  const light = lightN > 0 ? R : L, dark = lightN > 0 ? L : R;
  poly(p, [S(0, 0), dark[0], dark[1], dark[2], S(len, 0)], ramp[Math.max(0, Math.floor(n * 0.3))]);
  poly(p, [S(0, 0), light[0], light[1], light[2], S(len, 0)], ramp[Math.floor(n * 0.62)]);
  // Grat und Kanten
  p.line(S(len * 0.15, 0)[0], S(len * 0.15, 0)[1], S(len * 0.95, 0)[0], S(len * 0.95, 0)[1], ramp[n - 2]);
  p.line(light[1][0], light[1][1], light[2][0], light[2][1], ramp[n - 1]);
  p.line(dark[1][0], dark[1][1], dark[2][0], dark[2][1], ramp[0]);
  if (spark) { const t = S(len - 0.5, 0); p.px(t[0], t[1], '#ffffff'); }
  if (gl) {
    const c = S(len * 0.35, 0);
    g.px(c[0], c[1], gl[1]); const c2 = S(len * 0.55, 0); g.px(c2[0], c2[1], gl[0]);
  }
  return { tip: { x: S(len, 0)[0], y: S(len, 0)[1] } };
}


// Schwung-Schleier wie foes_ashwood.js: überstreicht a0 → a1 um (cx,cy); frisch
// (am Ende) dicht und hell, am Anfang ausgedünnt. sy staucht die Bahn senkrecht.
function smearArc(p, g, cx, cy, a0, a1, r0, r1, cols, gcols, sy = 1) {
  const n = Math.ceil(Math.abs(a1 - a0) * r1 * 1.4) + 2;
  for (let i = 0; i <= n; i++) {
    const f = i / n, a = a0 + (a1 - a0) * f;
    for (let r = r0; r <= r1; r += 0.5) {
      const radial = (r - r0) / (r1 - r0 || 1);
      const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r * sy);
      const dens = f * f * 0.5 + radial * radial * (0.15 + 0.7 * f) - 0.15;
      if (hash2(x + 50, y + 50, 31) > dens) continue;
      p.px(x, y, radial > 0.85 ? cols[2] : radial > 0.55 ? cols[1] : cols[0]);
      if (g && gcols && f > 0.4 && radial > 0.5) g.px(x, y, radial > 0.85 ? gcols[1] : gcols[0]);
    }
  }
}

// Ringförmiger Leuchthof auf der Glow-Ebene (weiche Stufen)
function halo(g, x, y, r, cols) {
  for (let i = 0; i < cols.length; i++) {
    const rr = r * (1 - i / cols.length);
    if (rr < 0.5) { g.px(x, y, cols[i]); continue; }
    g.ellipse(x, y, rr, rr, cols[i]);
  }
}

// Frostnebel/-partikel am Boden (Leucht-Ebene, sehr dunkel = zarter Schimmer)
function frostMist(p, g, x, y, w, ph, seed, cols) {
  for (let i = 0; i < 14; i++) {
    const u = hash2(i, 1, seed) - 0.5, v = hash2(i, 2, seed);
    const xx = x + u * w + Math.sin(ph + i) * 1.2, yy = y - v * 2 - ((ph * 2 + i * 0.7) % 3);
    if (hash2(i, 3, seed) < 0.5) g.px(xx, yy, cols[0]);
    else { g.px(xx, yy, cols[1]); if (p) p.px(xx, yy, cols[2]); }
  }
}

// Frame-Spezifikation mit Randlicht-Durchgang
let S_RIM = 0.34;
function spec(base, draw, rimKey, rimBack) {
  return { ...base, draw: (p, g, P, ex, t) => { const m = draw(p, g, P, ex, t); rim(p, rimKey, S_RIM, rimBack, 0.28); return m; } };
}
function stillR(S, draw, fx, rimKey, rimBack) {
  return still(S, (p, g) => { const m = draw(p, g); rim(p, rimKey, 0.42, rimBack, 0.28); return m; }, fx);
}

// ================================================================ Materialien

const ICE = ['#0b1826', '#132c44', '#1d4664', '#2c6788', '#448eae', '#6cb8d2', '#a6e0ee', '#e2fbff'];
const ICE_D = ['#08111c', '#0e2032', '#16334c', '#204a68', '#2e6686', '#4686a6'];
const FROST = ['#2a7aa8', '#4cb0d8', '#8ae0f4', '#cdf8ff', '#ffffff'];
const IGL = ['#0c3a58', '#2474a4', '#3aa2d2', '#6cd2f2', '#c8f6ff'];   // Leucht-Ebene
const RIM_ICE = '#d8f6ff', BACK_ICE = '#5cc8ec';
const CHIT = ['#06070d', '#0c0f1b', '#141a2c', '#1e2740', '#2c3856', '#3e4d70', '#5a6c90'];
const STEEL_F = ['#0c1018', '#161d2a', '#222d40', '#334258', '#4a5e78', '#6c84a0', '#9cb2c8', '#d4e2ee'];
const CLOTH_F = ['#0e1020', '#171a30', '#232846', '#30395e', '#46547a'];
const VOIDB = '#040810';

// ================================================================ Eiselementar

const IE = { W: 50, H: 58, AX: 23, AY: 54, pad: 10 };
const IE_REST = {
  hov: 21, bx: 0, lean: 0, spin: 0, fAx: 9, fAy: 2, bAx: -8, bAy: 3, fR: 0.5, bR: 2.4,
  orb: 0, crack: 0, eye: 1, pulse: 0.5, tail: 0, sh: 0, head: 0,
};
const iep = (o) => ({ ...IE_REST, ...o });

// Schwebende Kristallhand: Unterarm-Splitter + drei Krallen. r = Richtung (Winkel) des Unterarms
function iceHand(p, g, x, y, r, front) {
  const ramp = front ? ICE : ICE_D.concat(ICE[5]);
  // Unterarm: dicker Splitter von hinten zur Hand
  const bx = x - Math.cos(r) * 7, by = y - Math.sin(r) * 7;
  shard(p, g, bx - Math.cos(r) * 2, by - Math.sin(r) * 2, r, 11, 3, ramp, { base: 0.45, tipW: 1.6, spark: false });
  // Krallen
  for (let k = -1; k <= 1; k++) {
    const a = r + k * 0.55;
    shard(p, g, x, y, a, 4.5 + (k === 0 ? 1 : 0), 1.1, ramp, { base: 0.3, spark: front });
  }
  // Gelenkkristall mit Leuchtkern
  p.px(x, y, front ? FROST[2] : FROST[0]);
  g.px(x, y, IGL[front ? 3 : 2]);
}

// Kleiner Umlaufsplitter
function orbiter(p, g, x, y, a, s, front) {
  shard(p, g, x - Math.cos(a) * s, y - Math.sin(a) * s, a, s * 2, s * 0.55, front ? ICE : ICE_D.concat(ICE[5]), { base: 0.5, spark: front });
  if (front) g.px(x, y, IGL[1]);
}

function drawIceElemental(p, g, P, ex) {
  const { AX, AY } = IE;
  const meta = {};
  const gy = AY;
  const cx = AX + P.bx, cy = gy - P.hov;              // Kernmitte
  const L = P.lean;
  const hx = cx + 2 + L * 6 + P.head, hy = cy - 15 + Math.abs(L) * 1.5;
  const hurt = ex.hurt;

  // --- Frostschimmer am Boden
  frostMist(p, g, AX + P.bx * 0.5, gy - 1, 16, P.spin * 3, 7, [IGL[2], IGL[3], ICE[6]]);

  // --- Umlaufsplitter hinten
  const orbs = [0, 1, 2].map((i) => {
    const a = P.spin * TAU + i * TAU / 3;
    return { x: cx + Math.cos(a) * 15, y: cy + 2 + Math.sin(a) * 4.5 - L * Math.cos(a) * 3, a, front: Math.sin(a) > 0, i };
  });
  for (const o of orbs) if (!o.front) orbiter(p, g, o.x, o.y, -1.2 + o.i * 0.9 + P.spin * 2, 2.4, false);

  // --- hintere Hand
  iceHand(p, g, cx + P.bAx, cy + P.bAy, P.bR, false);

  // --- Eiszapfen-Schweif unter dem Rumpf (weht beim Schweben nach hinten)
  const tl = P.tail;
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + 0.25 + tl * 0.5 + (i - 1) * 0.35;
    const bx = cx - 2 + (i - 1) * 3, by = cy + 6;
    shard(p, g, bx, by, a, 9 - Math.abs(i - 1) * 3 + (i === 1 ? 3 : 0), 2.2 - Math.abs(i - 1) * 0.5, ICE_D.concat(ICE[5], ICE[6]), { base: 0.25 });
  }

  // --- Rumpf: Kristall-Geode. Große Außensplitter um einen leuchtenden Kern
  const body = [
    // [Winkel, Länge, halbe Breite, Rampe]
    [-2.75, 9, 4, ICE_D.concat(ICE[5], ICE[6])], [2.5, 10, 4, ICE_D.concat(ICE[5])], [1.85, 10, 4.2, ICE_D.concat(ICE[5])],
    [0.15, 8, 4, ICE_D.concat(ICE[5], ICE[6])], [1.1, 9, 4.2, ICE_D.concat(ICE[5], ICE[6])],
  ];
  // Grundkörper (dunkles Eis), dann Facetten
  ell(p, cx, cy, 7.5, 8.5, ICE_D, { rot: L * 0.3 });
  for (const [a, len, w, ramp] of body) shard(p, g, cx - Math.cos(a) * 2, cy - Math.sin(a) * 2, a + L * 0.3, len, w, ramp, { base: 0.4, tipW: 0.8 });
  // Brustfacetten (vorn, hell)
  poly(p, [[cx - 4 + L * 2, cy - 6], [cx + 5 + L * 3, cy - 5], [cx + 6 + L * 2, cy + 1], [cx + 1, cy + 5], [cx - 5, cy + 1]], ICE[3]);
  poly(p, [[cx - 4 + L * 2, cy - 6], [cx + 1 + L * 3, cy - 6], [cx - 1, cy - 1], [cx - 5, cy + 1]], ICE[5]);
  p.line(cx - 4 + L * 2, cy - 6, cx + 5 + L * 3, cy - 5, ICE[7]);
  p.line(cx - 5, cy + 1, cx + 1, cy + 5, ICE[1]);
  // Kern: pulsierender Frostkern in einer Aussparung
  const pu = P.pulse, cr = 2.2 + pu * 0.8 + P.crack * 0.8;
  const kx = cx + 1 + L * 2, ky = cy - 0.5;
  ell(p, kx, ky, cr + 1, cr + 1.2, [VOIDB, ICE[0]]);
  ell(p, kx, ky, cr, cr, [FROST[1], FROST[2], FROST[3], FROST[4]], { bias: 0.15 });
  p.px(kx - 0.5, ky - 1, '#ffffff');
  halo(g, kx, ky, cr + 0.5 + pu * 0.5, [IGL[2], IGL[3], IGL[4]]);
  meta.core = { x: kx, y: ky };
  // Risse (Treffer/Tod): leuchtende Sprünge vom Kern nach außen
  if (P.crack > 0.05) {
    for (let i = 0; i < 5; i++) {
      let x = kx, y = ky, a = i * 1.3 + 0.4;
      const n = Math.round(3 + P.crack * 6);
      for (let s = 0; s < n; s++) {
        x += Math.cos(a); y += Math.sin(a); a += (hash2(i, s, 91) - 0.5) * 1.2;
        p.px(x, y, s < n * 0.6 ? FROST[3] : FROST[1]); g.px(x, y, IGL[s < n * 0.5 ? 3 : 2]);
      }
    }
  }

  // --- Schulterzacken (klare Silhouette)
  const shB = { x: cx - 5 + L * 3, y: cy - 6 }, shF = { x: cx + 5 + L * 4, y: cy - 5 };
  shard(p, g, shB.x, shB.y, -2.45 - P.sh * 0.2, 10 + P.sh * 2, 3, ICE_D.concat(ICE[5], ICE[6]), { base: 0.3 });
  // Hals
  ell(p, cx + 1 + L * 5, cy - 9, 3, 2.5, ICE_D);

  // --- Kopf: Kristallkrone mit Augenschlitz
  const hh = { x: hx, y: hy };
  shard(p, g, hh.x - 1, hh.y + 1, -1.9, 9, 2.4, ICE, { base: 0.4 });           // hinterer Kronenzacken
  shard(p, g, hh.x + 1, hh.y + 1, -1.45, 11, 2.6, ICE, { base: 0.4 });         // Mittelzacken
  // Gesichtsplatte (keilförmig nach vorn)
  poly(p, [[hh.x - 4, hh.y - 2], [hh.x + 2, hh.y - 4], [hh.x + 6, hh.y], [hh.x + 3, hh.y + 4], [hh.x - 3, hh.y + 3]], ICE[3]);
  poly(p, [[hh.x - 4, hh.y - 2], [hh.x + 2, hh.y - 4], [hh.x + 1, hh.y], [hh.x - 3, hh.y + 1]], ICE[5]);
  p.line(hh.x - 3, hh.y - 2, hh.x + 2, hh.y - 4, ICE[7]);
  p.line(hh.x + 6, hh.y, hh.x + 3, hh.y + 4, ICE[1]);
  shard(p, g, hh.x + 3, hh.y - 1, -0.9, 7, 1.6, ICE, { base: 0.35 });          // vorderer Zacken
  // Augen
  const ec = hurt ? '#ffffff' : FROST[4];
  if (P.eye > 0.3) {
    p.rect(hh.x + 1, hh.y, 4, 1, VOIDB);
    p.px(hh.x + 2, hh.y, ec); p.px(hh.x + 4, hh.y, FROST[3]); p.px(hh.x + 3, hh.y, FROST[2]);
    g.px(hh.x + 2, hh.y, IGL[4]); g.px(hh.x + 4, hh.y, IGL[3]); g.px(hh.x + 3, hh.y, IGL[3]);
  } else p.rect(hh.x + 1, hh.y, 4, 1, VOIDB);
  meta.eye = { x: hh.x + 3, y: hh.y };
  meta.head = { x: hh.x, y: hh.y - 10 };
  meta.mouth = { x: hh.x + 5, y: hh.y + 2 };

  // --- Schulter vorn
  shard(p, g, shF.x - 1, shF.y, -0.75 - P.sh * 0.25, 9 + P.sh * 2, 3, ICE, { base: 0.3 });

  // --- Umlaufsplitter vorn
  for (const o of orbs) if (o.front) orbiter(p, g, o.x, o.y, -1.2 + o.i * 0.9 + P.spin * 2, 2.6, true);

  // --- vordere Hand + Frostkugel
  const hF = { x: cx + P.fAx, y: cy + P.fAy };
  iceHand(p, g, hF.x, hF.y, P.fR, true);
  meta.hand = { x: hF.x + Math.cos(P.fR) * 4, y: hF.y + Math.sin(P.fR) * 4 };
  if (P.orb > 0.2) {
    const ox = ex.orbAt ? ex.orbAt.x : hF.x + Math.cos(P.fR) * 4.5, oy = ex.orbAt ? ex.orbAt.y : hF.y + Math.sin(P.fR) * 4.5 - 1;
    const r = P.orb * 3.4;
    // Sog: Frostfäden laufen zur Kugel
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9 + P.spin * 5, d = r + 2 + ((i * 3 + P.spin * 20) % 6);
      const x = ox + Math.cos(a) * d, y = oy + Math.sin(a) * d * 0.8;
      g.px(x, y, IGL[2]); if (i % 2) p.px(x, y, FROST[2]);
    }
    ell(p, ox, oy, r + 0.6, r + 0.6, [ICE[3], ICE[5]]);
    ell(p, ox, oy, r, r, [FROST[1], FROST[2], FROST[3], FROST[4]], { bias: 0.2 });
    for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + P.spin * 3; p.px(ox + Math.cos(a) * (r + 1.2), oy + Math.sin(a) * (r + 1.2), FROST[4]); }
    halo(g, ox, oy, r + 1, [IGL[2], IGL[3], IGL[4]]);
    meta.hand = { x: ox, y: oy };
  }
  // Frostspur des geworfenen Geschosses
  if (ex.trail) {
    const x1 = meta.hand.x, y1 = meta.hand.y, x0 = x1 - 14, y0 = y1 + 3;
    for (let i = 0; i <= 10; i++) {
      const t = i / 10, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t + Math.sin(t * 9) * 0.6;
      if (hash2(i, 3, 5) < 0.35 + t * 0.6) { p.px(x, y, t > 0.7 ? FROST[3] : FROST[1]); g.px(x, y, IGL[t > 0.7 ? 3 : 2]); }
    }
  }
  return meta;
}

// Zerborstener Elementar: Splitterhaufen, Kern erlischt (k 0..1)
function drawIceHeap(p, g, k) {
  const { AX, AY } = IE;
  const gy = AY - 1;
  const heat = 1 - k;
  const bits = [
    [-12, 0, -2.6, 7, 2], [-7, 0, -1.9, 9, 2.6], [-2, 0, -1.4, 6, 2.2], [3, 0, -1.2, 10, 2.8], [8, 0, -0.5, 7, 2],
    [12, 0, -0.9, 5, 1.6], [-15, 0, -2.9, 5, 1.6], [0, -1, -2.2, 5, 1.8], [16, 0, -0.3, 4, 1.4],
  ];
  for (const [dx, dy, a, len, w] of bits) shard(p, g, AX + dx, gy + dy, a, len * (0.85 + (1 - k) * 0.15), w, dx % 2 ? ICE_D.concat(ICE[5], ICE[6]) : ICE, { base: 0.35 });
  // Kopfplatte liegt schräg
  poly(p, [[AX + 5, gy - 3], [AX + 11, gy - 5], [AX + 13, gy - 1], [AX + 6, gy]], ICE[4]);
  p.line(AX + 5, gy - 3, AX + 11, gy - 5, ICE[7]);
  p.rect(AX + 8, gy - 3, 3, 1, heat > 0.4 ? FROST[2] : VOIDB);
  // erlöschender Kern
  const r = 1.2 + heat * 1.8;
  ell(p, AX - 1, gy - 3, r, r, heat > 0.3 ? [FROST[0], FROST[1], FROST[2], FROST[3]] : [ICE[1], ICE[2], ICE[3]]);
  if (heat > 0.1) halo(g, AX - 1, gy - 3, r * heat, heat > 0.5 ? [IGL[2], IGL[3], IGL[4]] : [IGL[2], IGL[3]]);
  // Frostnebel
  if (k < 0.8) frostMist(p, g, AX, gy, 26 * (1 - k * 0.5), k * 5, 13, [IGL[2], IGL[3], ICE[5]]);
  return { eye: { x: AX + 9, y: gy - 3 }, head: { x: AX + 8, y: gy - 7 }, hand: { x: AX - 1, y: gy - 3 }, core: { x: AX - 1, y: gy - 3 } };
}

function createIceElemental() {
  const S = spec(IE, drawIceElemental, RIM_ICE, BACK_ICE);
  const idle = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, ph = t * TAU, s = Math.sin(ph);
    idle.push([t, iep({ hov: 21 - s * 1.5, spin: t, pulse: 0.5 + 0.5 * Math.sin(ph * 2), fAy: 2 - s * 1.2, bAy: 3 - Math.sin(ph + 1) * 1.2, fR: 0.5 + s * 0.1, bR: 2.4 - s * 0.1, tail: Math.sin(ph + 0.8) * 0.2, sh: Math.max(0, s) * 0.5 }), linear]);
  }
  const walk = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, ph = t * TAU, s = Math.sin(ph * 2);
    walk.push([t, iep({ hov: 20 - s * 1, bx: 1, lean: 0.25, spin: t * 1.5, pulse: 0.6 + 0.3 * s, fAx: 10, fAy: 4 - s, fR: 0.9, bAx: -10, bAy: 5, bR: 2.7, tail: 0.6 + s * 0.1, head: 1 }), linear]);
  }
  // Ausholen: Hände weit auseinander, dann vorn zusammen – die Frostkugel wächst
  const w0 = idle[0][1];
  const w1 = iep({ hov: 23, bx: -1, lean: -0.2, spin: 0.2, pulse: 1, fAx: 6, fAy: -8, fR: -1.2, bAx: -11, bAy: -4, bR: -2.4, orb: 0.5, tail: -0.2, sh: 1, head: -1 });
  const w2 = iep({ hov: 24, bx: -2, lean: -0.35, spin: 0.4, pulse: 1.4, fAx: 3, fAy: -11, fR: -1.6, bAx: -10, bAy: -8, bR: -2.2, orb: 1, tail: -0.3, sh: 1.5, head: -1.5 });
  // Wurf: Arm schnellt nach vorn, Kugel fliegt ab
  const s1 = iep({ hov: 21, bx: 3, lean: 0.35, spin: 0.55, pulse: 1.2, fAx: 15, fAy: -3, fR: -0.1, bAx: -9, bAy: 1, bR: 2.8, orb: 0, tail: 0.6, sh: 0.4, head: 1.5 });
  const s2 = iep({ hov: 20, bx: 2, lean: 0.3, spin: 0.65, pulse: 0.8, fAx: 14, fAy: 0, fR: 0.2, bAx: -9, bAy: 3, bR: 2.6, tail: 0.5, head: 1 });
  const s3 = iep({ hov: 21, bx: 0, lean: 0.05, spin: 0.75, pulse: 0.6, fAx: 10, fAy: 2, fR: 0.5, tail: 0.1 });
  const hurtP = iep({ hov: 23, bx: -3, lean: -0.45, spin: 0.1, crack: 0.6, pulse: 1.5, fAx: 5, fAy: -4, fR: -1, bAx: -12, bAy: -1, bR: -2.6, sh: 1, head: -2 });
  const d1 = iep({ hov: 22, bx: -2, lean: -0.5, crack: 1, pulse: 2, fAx: 8, fAy: -8, fR: -1.3, bAx: -12, bAy: -6, bR: -2.4, sh: 2, head: -2 });
  const d2 = iep({ hov: 14, bx: 0, lean: 0.4, crack: 1.4, pulse: 2.4, fAx: 12, fAy: 6, fR: 1.2, bAx: -12, bAy: 8, bR: 2, sh: 2.5, tail: 0.8, eye: 0 });
  return {
    idle: new Animation(track(S, idle, 8, { loop: true }), 8),
    walk: new Animation(track(S, walk, 8, { loop: true }), 10),
    windup: new Animation(track(S, [[0, w0], [0.45, w1], [1, w2]], 5), 8, false),
    strike: new Animation(track(S, [[0, s1], [0.3, s2, snap], [1, s3]], 4, {
      extras: { 0: { fx: 'cast', trail: true } },
    }), 12, false),
    hurt: new Animation(track(S, [[0, hurtP], [1, iep({ hov: 21, lean: -0.1, crack: 0.2 })]], 2, { extras: { 0: { hurt: true } } }), 10, false),
    death: new Animation([
      ...track(S, [[0, hurtP], [0.45, d1], [1, d2]], 4, { extras: { 0: { hurt: true }, 1: { hurt: true } } }),
      stillR(S, (p, g) => drawIceHeap(p, g, 0), 'impact', RIM_ICE, BACK_ICE),
      stillR(S, (p, g) => drawIceHeap(p, g, 0.4), null, RIM_ICE, BACK_ICE),
      stillR(S, (p, g) => drawIceHeap(p, g, 0.75), null, RIM_ICE, BACK_ICE),
      stillR(S, (p, g) => drawIceHeap(p, g, 1), null, RIM_ICE, BACK_ICE),
    ], 9, false),
  };
}


// ================================================================ Kristallspinne

const CS = { W: 74, H: 40, AX: 32, AY: 35, pad: 8 };
const CS_REST = { t: 0, amp: 0, bob: 0, crouch: 0, rear: 0, lunge: 0, fang: 0, curl: 0, sink: 0, glow: 0.7, abd: 0, pal: 0, eye: 1 };
const csp = (o) => ({ ...CS_REST, ...o });
const CRYS = ['#0e2436', '#1a4460', '#2a6e8e', '#48a2c0', '#7ed4e8', '#c4f4fc', '#ffffff'];
// Beinansätze relativ zur Kopfbrust, Ruhe-Fuß-x relativ zur Körpermitte
const SP_LEGS = [
  { ax: 3, fx: 24, kh: 9 }, { ax: 1, fx: 14, kh: 11 }, { ax: -1, fx: -8, kh: 11 }, { ax: -3, fx: -21, kh: 9 },
];

function spiderLeg(p, g, bx, by, fx, fy, kh, ramp, near, P, i) {
  // Knie hoch über dem Körper (Spinnenbogen), Unterschenkel zum Fuß
  const kx = bx + (fx - bx) * 0.32, ky = by - kh * (1 - P.curl * 0.7);
  let fX = fx, fY = fy;
  if (P.curl > 0) { fX = fx + (bx - fx) * P.curl * 0.8; fY = fy + (by - 6 - fy) * P.curl; }
  limb(p, bx, by, kx, ky, near ? 3 : 2.5, 2.2, ramp);
  limb(p, kx, ky, fX, fY, 2.2, 1.2, ramp);
  // Kristalldorn am Knie
  shard(p, g, kx, ky, -Math.PI / 2 - (fx > bx ? -0.4 : 0.4), near ? 4 : 3, 1, near ? CRYS : CRYS.slice(0, 5).concat(CRYS[4]), { base: 0.3, spark: near });
  p.px(fX, fY, near ? CRYS[4] : CRYS[2]);
  if (near && P.glow > 0.4) g.px(kx, ky - 1, IGL[1]);
}

function drawCrystalSpider(p, g, P, ex) {
  const { AX, AY } = CS;
  const meta = {};
  const gy = AY;
  const ox = AX + P.lunge;
  const top = gy - 11 + P.crouch + P.bob + P.sink;   // Rückenlinie der Kopfbrust
  const ch = { x: ox + 5, y: top + 3 - P.rear * 3 };
  const ab = { x: ox - 7, y: top - 0.5 + P.rear * 1.5 };
  const hurt = ex.hurt;

  const legs = (near) => {
    SP_LEGS.forEach((L, i) => {
      const ph = P.t * TAU + (i % 2 ? Math.PI : 0) + (near ? 0 : Math.PI);
      let sw = Math.sin(ph) * 3 * P.amp, lift = Math.max(0, Math.cos(ph)) * 2.5 * P.amp;
      let fx = ox + L.fx * (near ? 1 : 0.8) + sw + (near ? 1 : -2), fy = gy - lift - (near ? 0 : 2);
      if (i === 0 && P.rear > 0) { fx += P.rear * 3; fy -= P.rear * 13; }
      if (i === 1 && P.rear > 0) { fx += P.rear * 2; fy -= P.rear * 6; }
      const bx = ch.x + L.ax - 2 + (near ? 0.5 : -0.5), by = ch.y + (near ? 1 : 0);
      spiderLeg(p, g, bx, by, fx, fy, L.kh + (i === 0 ? P.rear * 3 : 0), near ? [CHIT[3], CHIT[4], CHIT[5], CRYS[3]] : [CHIT[1], CHIT[2], CHIT[3], CHIT[4]], near, P, i);
    });
  };
  legs(false);

  // --- Hinterleib: dunkler Panzer, Kristalldrusen
  ell(p, ab.x, ab.y, 10, 7 - P.sink * 0.3, CHIT, { rot: -0.15 + P.rear * 0.15, noise: 0.15, seed: 5 });
  // Leuchtende Zeichnung (Rautenmuster)
  const gl = P.glow;
  for (let i = 0; i < 3; i++) {
    const x = ab.x - 5 + i * 3.5, y = ab.y + 2 - i * 0.6;
    p.px(x, y, gl > 0.3 ? FROST[1] : CHIT[3]); p.px(x + 1, y - 1, gl > 0.3 ? FROST[2] : CHIT[3]); p.px(x + 1, y + 1, gl > 0.3 ? FROST[0] : CHIT[2]);
    if (gl > 0.3) { g.px(x, y, IGL[2]); g.px(x + 1, y - 1, IGL[gl > 0.8 ? 4 : 3]); g.px(x + 1, y + 1, IGL[1]); }
  }
  // Spinnwarzen
  p.px(ab.x - 10, ab.y + 2, CHIT[3]); p.px(ab.x - 11, ab.y + 3, CHIT[2]);
  // Kristalldrusen auf dem Rücken (von hinten nach vorn, größer werdend)
  const cr = [[-7, -2.35, 5], [-4, -2.0, 8], [-1, -1.75, 10], [2, -1.45, 7], [4, -1.2, 5], [-2, -2.3, 6]];
  cr.forEach(([dx, a, len], i) => {
    const bx = ab.x + dx, by = ab.y - 4.5 + Math.abs(dx) * 0.15;
    shard(p, g, bx, by, a + P.rear * 0.2, len * (1 - P.sink * 0.03), 1.8 + len * 0.12, CRYS, { base: 0.3, gl: gl > 0.3 ? [IGL[1], IGL[gl > 0.8 ? 3 : 2]] : null });
  });
  // innere Glut der Drusen (Hof)

  // --- Kopfbrust
  ell(p, ch.x, ch.y, 6, 4.2, CHIT, { rot: -P.rear * 0.4, noise: 0.12, seed: 9 });
  p.line(ch.x - 4, ch.y - 3, ch.x + 2, ch.y - 4, CHIT[6]);
  // Kristallkamm auf dem Kopf
  shard(p, g, ch.x - 1, ch.y - 3, -1.9, 4, 1.3, CRYS, { base: 0.3 });
  shard(p, g, ch.x + 1.5, ch.y - 3.5, -1.6, 3, 1.1, CRYS, { base: 0.3 });
  // Augen: Gruppe aus 6 Punkten
  const ex0 = ch.x + 4 + P.rear, ey0 = ch.y - 2 - P.rear;
  const ec = hurt ? '#ffffff' : FROST[4];
  const eyes = [[0, 0, 1], [2, 0.5, 1], [1, -1, 0], [-1, -0.5, 0], [2.5, 1.5, 0], [0.5, 1, 0]];
  for (const [dx, dy, big] of eyes) {
    const x = ex0 + dx, y = ey0 + dy;
    p.px(x, y, P.eye > 0.3 ? (big ? ec : FROST[2]) : CHIT[0]);
    if (P.eye > 0.3) g.px(x, y, IGL[big ? 4 : 3]);
  }
  meta.eye = { x: ex0 + 1, y: ey0 };
  meta.head = { x: ch.x + 2, y: ch.y - 7 };
  // Taster
  const pl = P.pal;
  p.line(ch.x + 5, ch.y + 1, ch.x + 8 + pl, ch.y + 2 - pl * 2, CHIT[4]); p.px(ch.x + 8 + pl, ch.y + 3 - pl * 2, CHIT[5]);
  // Kieferklauen: Kristallspitzen, öffnen sich
  const fa = 0.3 + P.fang * 0.9;
  for (const side of [-1, 1]) {
    const bx = ch.x + 5 + (side > 0 ? 1 : 0), by = ch.y + 2;
    const a = Math.PI / 2 - 0.25 - side * fa * 0.5 - P.rear * 0.4;
    limb(p, bx, by, bx + Math.cos(a) * 3, by + Math.sin(a) * 3, 2.2, 1.8, side > 0 ? [CHIT[2], CHIT[3], CHIT[4], CHIT[5]] : [CHIT[1], CHIT[2], CHIT[3], CHIT[4]]);
    const tx = bx + Math.cos(a) * 3, ty = by + Math.sin(a) * 3;
    shard(p, g, tx, ty, a - side * 0.9, 3, 0.8, CRYS, { base: 0.2, spark: side > 0 });
  }
  meta.mouth = { x: ch.x + 7, y: ch.y + 4 };

  legs(true);
  if (ex.smear) smearArc(p, g, ch.x + 2, ch.y + 1, ex.smear[0], ex.smear[1], 6, 12, [ICE[4], ICE[6], ICE[7]], [IGL[1], IGL[2]], 1);
  return meta;
}

function createCrystalSpider() {
  const S = spec(CS, drawCrystalSpider, RIM_ICE, BACK_ICE);
  const idle = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6, ph = t * TAU, s = Math.sin(ph);
    idle.push([t, csp({ bob: Math.max(0, s) * 0.8, glow: 0.65 + 0.35 * Math.sin(ph), pal: Math.max(0, Math.sin(ph * 2)), fang: Math.max(0, s) * 0.2 }), linear]);
  }
  const walk = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6, ph = t * TAU;
    walk.push([t, csp({ t, amp: 1, bob: Math.abs(Math.sin(ph * 2)) * -0.8 + 0.4, glow: 0.8, pal: 0.5 }), linear]);
  }
  // Ausholen: aufbäumen, Vorderbeine hoch, Klauen auf
  const w1 = csp({ rear: 0.6, crouch: 1, lunge: -1, fang: 0.6, glow: 1, pal: 1 });
  const w2 = csp({ rear: 1, crouch: 2, lunge: -2.5, fang: 1, glow: 1.2, pal: 1.5 });
  // Sprungbiss
  const s1 = csp({ rear: 0.3, crouch: -2, lunge: 6, fang: 1, glow: 1.2, t: 0.25, amp: 1 });
  const s2 = csp({ rear: -0.2, crouch: 0, lunge: 8, fang: 0, glow: 1, t: 0.5, amp: 0.6 });
  const s3 = csp({ rear: 0, crouch: 0.5, lunge: 4, fang: 0.2, glow: 0.8 });
  const s4 = csp({ lunge: 1, glow: 0.7 });
  const hurtP = csp({ rear: 0.5, crouch: 1, lunge: -3, fang: 1, glow: 1.3, curl: 0.2 });
  const d1 = csp({ rear: 0.7, crouch: 1, lunge: -3, fang: 1, glow: 1.2, curl: 0.3 });
  const d2 = csp({ rear: 0.2, sink: 3, lunge: -2, fang: 0.5, glow: 0.7, curl: 0.7, eye: 0.5 });
  const d3 = csp({ rear: 0, sink: 5, lunge: -2, fang: 0.2, glow: 0.35, curl: 1, eye: 0 });
  const d4 = csp({ rear: 0, sink: 5.5, lunge: -2, fang: 0.2, glow: 0, curl: 1.05, eye: 0 });
  return {
    idle: new Animation(track(S, idle, 6, { loop: true }), 7),
    walk: new Animation(track(S, walk, 6, { loop: true }), 16),
    windup: new Animation(track(S, [[0, idle[0][1]], [0.5, w1], [1, w2]], 4), 9, false),
    strike: new Animation(track(S, [[0, s1], [0.3, s2, snap], [0.65, s3], [1, s4]], 4, {
      extras: { 0: { smear: [-1.2, 0.2] }, 1: { fx: 'impact', smear: [-0.6, 1.2] } },
    }), 14, false),
    hurt: new Animation(track(S, [[0, hurtP], [1, csp({ lunge: -1, glow: 0.8 })]], 2, { extras: { 0: { hurt: true } } }), 10, false),
    death: new Animation(track(S, [[0, hurtP], [0.25, d1], [0.6, d2], [0.85, d3], [1, d4]], 7, { extras: { 0: { hurt: true }, 4: { fx: 'impact' } } }), 9, false),
  };
}


// ================================================================ Erfrorener Ritter

// Humanoides Rig (wie foes_ashwood.js): Gelenkpunkte aus einer Pose.
function rig(P, D, AX, AY) {
  const hip = { x: AX + P.hipX, y: AY - D.legH + P.hipY };
  const sL = Math.sin(P.lean), cL = Math.cos(P.lean);
  const pt = (u, k) => ({ x: hip.x + sL * u + cL * k, y: hip.y - cL * u + sL * k });
  const chest = pt(D.spine, 0);
  const fF = { x: AX + P.fFx, y: AY - P.fFy }, fB = { x: AX + P.fBx, y: AY - P.fBy };
  const legF = ik(hip.x + D.hipW, hip.y, fF.x, fF.y, D.thigh, D.shin, -1);
  const legB = ik(hip.x - D.hipW, hip.y, fB.x, fB.y, D.thigh, D.shin, -1);
  const shF = pt(D.spine - 1, D.sh), shB = pt(D.spine - 1, -D.sh);
  return { hip, chest, pt, sL, cL, legF, legB, shF, shB };
}

const FKN = { W: 100, H: 84, AX: 44, AY: 76, pad: 12 };
const KD = { legH: 16, thigh: 8.5, shin: 9, spine: 14, upper: 7, fore: 7, sh: 2, hipW: 2 };
const FK_REST = {
  hipX: 0, hipY: 0, lean: 0.06, head: 0, headY: 0, fFx: 6, fFy: 0, fBx: -6, fBy: 0,
  hFx: 8, hFy: 9, sw: -1.2, cape: 0.1, capeT: 0, kneel: 0, eye: 1, burst: 0,
};
const fkp = (o) => ({ ...FK_REST, ...o });
const SWORD_L = 24;

// Frostkruste: Eisschicht mit kleinen Kristallen auf einer Fläche (Kreis um x,y)
function frostCrust(p, g, x, y, r, seed, n = 6) {
  for (let i = 0; i < n; i++) {
    const a = hash2(i, 1, seed) * TAU, d = hash2(i, 2, seed) * r;
    const px_ = x + Math.cos(a) * d, py_ = y + Math.sin(a) * d * 0.8;
    p.px(px_, py_, i % 3 === 0 ? ICE[6] : ICE[4]);
    if (i % 2 === 0) p.px(px_ + 1, py_, ICE[5]);
  }
}

// Eiszapfen hängen von einer Kante (x0..x1 auf Höhe y)
function icicles(p, x0, y0, x1, y1, seed, maxL = 4) {
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 2));
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    const L = 1 + Math.floor(hash2(i, 5, seed) * maxL);
    for (let j = 0; j < L; j++) p.px(x, y + j, j === L - 1 ? ICE[6] : j === 0 ? ICE[3] : ICE[5]);
  }
}

// Zweihänder im Eis: Griff bei (hx,hy), Winkel a. Klinge von Eiskristallen überwachsen.
function iceGreatsword(p, g, hx, hy, a, glow) {
  const c = Math.cos(a), s = Math.sin(a), nx = -s, ny = c;
  // Knauf + Griff
  cap(p, hx - c * 5, hy - s * 5, hx + c * 2, hy + s * 2, 1.1, 1.1, CLOTH_F);
  ell(p, hx - c * 6, hy - s * 6, 1.6, 1.6, STEEL_F, { bias: 0.1 });
  // Parierstange
  cap(p, hx + c * 3 - nx * 5, hy + s * 3 - ny * 5, hx + c * 3 + nx * 5, hy + s * 3 + ny * 5, 1.2, 1.2, STEEL_F, { bias: 0.1 });
  p.px(hx + c * 3 + nx * 5, hy + s * 3 + ny * 5, ICE[6]); p.px(hx + c * 3 - nx * 5, hy + s * 3 - ny * 5, ICE[5]);
  // Klinge: Stahlkern
  const b0 = 4, b1 = SWORD_L;
  for (let t = b0; t <= b1; t += 0.5) {
    const f = (t - b0) / (b1 - b0);
    const hw = 1.9 - f * 0.7 - (f > 0.88 ? (f - 0.88) * 12 : 0);
    for (let k = -hw; k <= hw; k += 0.5) {
      const light = nx * -0.6 + ny * -0.8 > 0 ? k : -k;
      const col = Math.abs(k) > hw - 0.6 ? (light > 0 ? STEEL_F[7] : STEEL_F[2]) : light > 0 ? STEEL_F[5] : STEEL_F[4];
      p.px(hx + c * t + nx * k, hy + s * t + ny * k, col);
    }
  }
  // Hohlkehle mit Frostrune (Leuchten)
  for (let t = b0 + 1; t < b1 - 5; t += 1) {
    const x = hx + c * t, y = hy + s * t;
    p.px(x, y, t % 3 === 0 ? FROST[2] : STEEL_F[3]);
    if (glow > 0.2 && t % 3 === 0) g.px(x, y, IGL[glow > 0.8 ? 3 : 2]);
  }
  // Eisbewuchs: Kristalle wachsen schräg aus der Klinge
  const growth = [[8, 1, 0.7, 4], [12, -1, -0.8, 3], [15, 1, 0.9, 5], [19, -1, -0.6, 3], [21, 1, 0.5, 3], [10, -1, -1.1, 2]];
  for (const [t, side, da, len] of growth) {
    const bx = hx + c * t + nx * side * 1.2, by = hy + s * t + ny * side * 1.2;
    const ang = Math.atan2(ny * side, nx * side) + da * 0.6 * side + 0.35;
    shard(p, g, bx, by, ang, len, 1.1, ICE, { base: 0.3 });
  }
  const tip = { x: hx + c * b1, y: hy + s * b1 };
  if (glow > 0.5) { g.px(tip.x, tip.y, IGL[3]); }
  return tip;
}

function drawFrozenKnight(p, g, P, ex) {
  const { AX, AY } = FKN;
  const K = P.kneel;
  const PP = { ...P, hipY: P.hipY + K * 6 };
  const R = rig(PP, KD, AX, AY);
  const { hip, chest, pt, legF, legB, shF, shB } = R;
  const meta = {};
  if (K > 0.01) {
    const kx = hip.x - 3 - K * 2, ky = AY - 2;
    legB.jx += (kx - legB.jx) * K; legB.jy += (ky - legB.jy) * K;
    legB.ex += (kx - 9 - legB.ex) * K; legB.ey += (AY - legB.ey) * K;
  }
  // Hände am Griff (zweihändig)
  const hF = { x: chest.x + P.hFx, y: chest.y + P.hFy };
  const hB = { x: hF.x - Math.cos(P.sw) * 4, y: hF.y - Math.sin(P.sw) * 4 };
  const armF = ik(shF.x, shF.y, hF.x, hF.y, KD.upper, KD.fore, 1);
  const armB = ik(shB.x, shB.y, hB.x, hB.y, KD.upper, KD.fore, 1);
  const behind = !!ex.swordBehind;

  // --- 1. erstarrter Umhang (steif, gezackter Saum mit Eiszapfen)
  const ct = pt(KD.spine + 1, -2.5);
  const capeLen = 19 - K * 5;
  const cw = [];
  for (let i = 0; i < 9; i++) {
    const u = i / 8;
    const len = capeLen + (hash2(i, 2, 31) * 3 | 0) - u * 2;
    for (let j = 0; j < len; j++) {
      const v = j / len;
      const x = ct.x - 2 - i * 0.8 - P.cape * 9 * v * v + Math.sin(P.capeT + v * 2 + i * 0.5) * 0.5 * v;
      const y = ct.y + j + i * 0.2;
      const c = (i + j) % 7 === 0 ? CLOTH_F[0] : i < 2 ? CLOTH_F[3] : i % 3 === 0 ? CLOTH_F[1] : CLOTH_F[2];
      p.px(x, y, v > 0.82 ? (hash2(i, j, 5) < 0.5 ? ICE[3] : ICE[2]) : c);
      if (j === Math.floor(len) - 1) cw.push([x, y + 1]);
    }
  }
  for (let i = 0; i < cw.length; i++) if (i % 2 === 0) icicles(p, cw[i][0], cw[i][1], cw[i][0], cw[i][1], 40 + i, 3);

  // --- Schwert hinter dem Körper (Ausholen)
  let tip = null;
  const smear = () => { if (ex.smear) smearArc(p, g, shF.x, shF.y, ex.smear[0], ex.smear[1], 16, 12 + SWORD_L, [ICE[4], ICE[6], ICE[7]], [IGL[1], IGL[3]], 1); };
  if (behind) { smear(); tip = iceGreatsword(p, g, hF.x, hF.y, P.sw, 1); }

  // --- 2. hinteres Bein
  const legRampB = STEEL_F.slice(0, 5);
  cap(p, hip.x - 2, hip.y, legB.jx, legB.jy, 3.4, 3, legRampB);
  cap(p, legB.jx, legB.jy, legB.ex, legB.ey - 2.5, 3, 2.8, legRampB);
  FK.poly(p, [[legB.ex - 3, legB.ey], [legB.ex - 3, legB.ey - 3], [legB.ex + 3, legB.ey - 3], [legB.ex + 6, legB.ey]], STEEL_F[2]);
  ell(p, legB.jx, legB.jy, 2.3, 2.3, legRampB);
  // --- 3. hinterer Arm
  cap(p, shB.x, shB.y, armB.jx, armB.jy, 2.6, 2.4, legRampB);
  cap(p, armB.jx, armB.jy, armB.ex, armB.ey, 2.4, 2.6, legRampB);

  // --- 4. Rumpf: Plattenpanzer, Faltenrock aus Stahlschuppen
  for (let i = 0; i < 5; i++) {
    const a = pt(-0.5, -5 + i * 2.5);
    const sw = P.lean * 3;
    FK.poly(p, [[a.x + sw * 0.3, a.y], [a.x + 2.6 + sw * 0.3, a.y], [a.x + 2.8 + sw * 0.5, a.y + 6 - Math.abs(i - 2) * 0.6], [a.x + sw * 0.5, a.y + 6 - Math.abs(i - 2) * 0.6]], STEEL_F[i % 2 ? 3 : 4]);
    p.px(a.x + sw * 0.3, a.y, STEEL_F[6]);
    p.px(a.x + 1 + sw * 0.5, a.y + 5 - Math.abs(i - 2) * 0.6, ICE[5]);
  }
  const hp = pt(0.5, 0.5), cp = pt(KD.spine - 1, 0.5);
  cap(p, hp.x, hp.y, cp.x, cp.y, 5.5, 7.5, STEEL_F, { rim: 0 });
  ell(p, cp.x + 0.5, cp.y + 1, 7, 5.5, STEEL_F, { rot: P.lean, bias: 0.05 });
  // Brustgrat + Gürtel
  const q = (u, k, c) => { const o = pt(u, k); p.px(o.x, o.y, c); };
  for (let u = 4; u <= KD.spine + 1; u += 0.5) q(u, 2.5, STEEL_F[7]);
  for (let k = -6; k <= 6; k += 0.5) { q(1.5, k, CLOTH_F[1]); q(2, k, CLOTH_F[2]); }
  q(1.8, 3, STEEL_F[6]); q(1.8, 2.5, STEEL_F[5]);
  // Frostkruste auf Brust und Schulter, gesprungener Eispanzer mit blauem Schimmer
  const fc = pt(KD.spine - 3, -1);
  frostCrust(p, g, fc.x, fc.y, 4, 11, 9);
  const fc2 = pt(5, 3);
  frostCrust(p, g, fc2.x, fc2.y, 2.5, 12, 5);
  // Kern: blaues Frostherz leuchtet durch einen Riss im Panzer
  const hc = pt(KD.spine - 3.5, 2.5);
  p.px(hc.x, hc.y, FROST[3]); p.px(hc.x + 1, hc.y + 1, FROST[1]); p.px(hc.x - 1, hc.y + 1, FROST[0]); p.px(hc.x, hc.y + 2, FROST[1]);
  g.px(hc.x, hc.y, IGL[3]); g.px(hc.x + 1, hc.y + 1, IGL[2]); g.px(hc.x, hc.y + 2, IGL[1]); g.px(hc.x - 1, hc.y + 1, IGL[1]);
  meta.chest = { x: hc.x, y: hc.y };

  // --- 5. vorderes Bein (Beinschiene, Kniekachel, Sabaton)
  occlude(g);
  cap(p, hip.x + 2, hip.y, legF.jx, legF.jy, 3.8, 3.3, STEEL_F);
  cap(p, legF.jx, legF.jy, legF.ex, legF.ey - 2.5, 3.3, 3, STEEL_F);
  p.line(legF.jx + 2, legF.jy + 2, legF.ex + 2, legF.ey - 3, STEEL_F[7]);
  FK.poly(p, [[legF.ex - 3, legF.ey], [legF.ex - 3, legF.ey - 3], [legF.ex + 3, legF.ey - 3], [legF.ex + 7, legF.ey]], STEEL_F[4]);
  p.line(legF.ex - 2, legF.ey - 3, legF.ex + 3, legF.ey - 3, STEEL_F[6]);
  ell(p, legF.jx + 1, legF.jy, 2.8, 2.6, STEEL_F, { bias: 0.1 });
  shard(p, g, legF.jx + 1, legF.jy - 1, -0.7, 3, 1, ICE, { base: 0.3 });
  icicles(p, legF.jx - 1, legF.jy + 2, legF.jx + 2, legF.jy + 2, 7, 2);
  occlude(null);

  // --- 6. hintere Schulterplatte
  ell(p, shB.x - 1, shB.y, 4.5, 3.5, STEEL_F.slice(0, 6), { bias: 0.05 });

  // --- 7. Helm: Topfhelm mit Eiskrone und Sehschlitz
  const neck = pt(KD.spine + 2, 1);
  const hx = Math.round(neck.x + P.head), hy = Math.round(neck.y - 5 + P.headY);
  ell(p, hx - 1, hy + 4, 4, 2.2, STEEL_F.slice(0, 5));         // Halsberge
  ell(p, hx, hy, 5, 5.5, STEEL_F, { bias: 0.08 });
  FK.poly(p, [[hx - 5, hy - 1], [hx + 5, hy - 1], [hx + 5, hy + 4], [hx - 5, hy + 5]], STEEL_F[4]);
  FK.poly(p, [[hx - 5, hy - 1], [hx - 1, hy - 1], [hx - 1, hy + 5], [hx - 5, hy + 5]], STEEL_F[5]);
  p.line(hx - 5, hy - 1, hx + 5, hy - 1, STEEL_F[7]);
  p.line(hx + 1, hy - 5, hx + 1, hy + 4, STEEL_F[6]);              // Grat
  // Eiskrone: Zapfen wachsen aus dem Helm
  shard(p, g, hx - 3, hy - 3, -2.1, 6, 1.4, ICE, { base: 0.3 });
  shard(p, g, hx, hy - 4, -1.65, 8, 1.6, ICE, { base: 0.3 });
  shard(p, g, hx + 3, hy - 3, -1.2, 5, 1.2, ICE, { base: 0.3 });
  frostCrust(p, g, hx - 2, hy - 1, 2, 13, 4);
  // Sehschlitz mit kaltem Glimmen
  const ec = ex.hurt ? '#ffffff' : FROST[4];
  p.rect(hx, hy + 1, 5, 1, VOIDB);
  if (P.eye > 0.3) {
    p.px(hx + 2, hy + 1, ec); p.px(hx + 4, hy + 1, FROST[2]);
    g.px(hx + 2, hy + 1, IGL[4]); g.px(hx + 4, hy + 1, IGL[3]); g.px(hx + 3, hy + 1, IGL[2]);
    if (P.eye > 1.2) { g.rect(hx + 1, hy + 1, 5, 1, IGL[3]); g.px(hx + 6, hy + 1, IGL[1]); }
  }
  for (let i = 0; i < 3; i++) p.px(hx + 3, hy + 3 + i * 0.7, VOIDB);
  icicles(p, hx - 4, hy + 5, hx + 3, hy + 5, 17, 3);
  meta.eye = { x: hx + 3, y: hy + 1 };
  meta.head = { x: hx, y: hy - 11 };
  meta.mouth = { x: hx + 4, y: hy + 3 };

  // --- 8. vorderer Arm + Zweihänder + Schulterplatte
  const arm = () => {
    occlude(g);
    cap(p, shF.x, shF.y, armF.jx, armF.jy, 3, 2.7, STEEL_F);
    cap(p, armF.jx, armF.jy, armF.ex, armF.ey, 2.7, 3, STEEL_F);
    ell(p, armF.jx, armF.jy, 2.2, 2.2, STEEL_F, { bias: 0.1 });
    FK.poly(p, [[armF.ex - 2.5, armF.ey - 2.5], [armF.ex + 2.5, armF.ey - 2.5], [armF.ex + 2.5, armF.ey + 2.5], [armF.ex - 2.5, armF.ey + 2.5]], STEEL_F[4]);
    p.px(armF.ex - 2, armF.ey - 2, STEEL_F[7]);
    occlude(null);
  };
  if (!behind) { smear(); arm(); tip = iceGreatsword(p, g, hF.x, hF.y, P.sw, 1); p.rect(hF.x - 1.5, hF.y - 1.5, 3, 3, STEEL_F[4]); p.px(hF.x - 1.5, hF.y - 1.5, STEEL_F[6]); }
  else arm();
  // Schulterplatte vorn mit Eiszapfen
  occlude(g);
  ell(p, shF.x + 0.5, shF.y - 0.5, 5, 4, STEEL_F, { bias: 0.1 });
  occlude(null);
  p.line(shF.x - 4, shF.y + 2, shF.x + 5, shF.y + 2, STEEL_F[2]);
  frostCrust(p, g, shF.x - 1, shF.y - 2, 2.5, 19, 5);
  icicles(p, shF.x - 4, shF.y + 3, shF.x + 4, shF.y + 3, 21, 4);
  meta.hand = { x: hF.x, y: hF.y };
  meta.tip = tip;

  // --- Einschlag: Eissplitter brechen aus dem Boden
  if (ex.burst) {
    const bx = ex.burstX ?? tip.x, gy = AY;
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.32;
      const d = 2 + hash2(i, 1, 51) * 5 * ex.burst;
      shard(p, g, bx + Math.cos(a) * d * 1.8, gy - 1, a, (3 + hash2(i, 2, 51) * 6) * ex.burst, 1.4, ICE, { base: 0.3, gl: [IGL[1], IGL[2]] });
    }
    frostMist(p, g, bx, gy - 1, 22 * ex.burst, ex.burst * 4, 53, [IGL[2], IGL[3], ICE[6]]);
  }
  p.ctx.clearRect(-20, AY + 1, 200, 40); g.ctx.clearRect(-20, AY + 1, 200, 40);
  return meta;
}

// Gefallener Ritter: zerbrochener Eispanzer, Helm, Schwert im Boden (k 0..1)
function drawKnightFallen(p, g, k) {
  const { AX, AY } = FKN;
  const gy = AY;
  const cx = AX;
  // Umhang flach
  for (let i = 0; i < 20; i++) for (let j = 0; j < 3; j++) p.px(cx - 20 + i, gy - 1 - j + (i % 4 === 0 ? 1 : 0), j === 2 ? CLOTH_F[3] : CLOTH_F[1 + (i % 2)]);
  // Rumpfplatte liegend
  ell(p, cx - 4, gy - 5, 10, 5, STEEL_F, { bias: 0.05 });
  p.line(cx - 12, gy - 8, cx + 4, gy - 9, STEEL_F[7]);
  frostCrust(p, g, cx - 5, gy - 7, 5, 61, 12);
  // Beine
  cap(p, cx - 14, gy - 3, cx - 24, gy - 2, 3, 2.6, STEEL_F.slice(0, 6));
  FK.poly(p, [[cx - 28, gy], [cx - 28, gy - 4], [cx - 24, gy - 4], [cx - 24, gy]], STEEL_F[3]);
  // Helm gerollt
  const hx = cx + 10 + k * 2;
  ell(p, hx, gy - 5, 4.5, 4.5, STEEL_F, { bias: 0.08 });
  p.rect(hx - 1, gy - 4, 4, 1, VOIDB);
  if (k < 0.5) { p.px(hx + 1, gy - 4, FROST[2]); g.px(hx + 1, gy - 4, IGL[2]); }
  shard(p, g, hx - 2, gy - 8, -2.3, 4, 1.2, ICE, { base: 0.3 });
  // Schwert steckt schräg im Boden
  iceGreatsword(p, g, cx + 22, gy - 22 + k * 0, 1.35, 1 - k);
  // Eisbruchstücke
  for (let i = 0; i < 7; i++) {
    const x = cx - 18 + i * 6 + hash2(i, 1, 63) * 3, a = -Math.PI / 2 + (hash2(i, 2, 63) - 0.5) * 1.6;
    shard(p, g, x, gy - 1, a, 3 + hash2(i, 3, 63) * 4, 1.3, i % 2 ? ICE : ICE_D.concat(ICE[5], ICE[6]), { base: 0.3 });
  }
  // Frostherz verlischt
  const heat = 1 - k;
  if (heat > 0.1) { p.px(cx - 2, gy - 6, FROST[3]); halo(g, cx - 2, gy - 6, 0.5 + heat * 1.2, [IGL[2], IGL[3], IGL[4]]); }
  if (k < 0.8) frostMist(p, g, cx, gy, 40, k * 6, 67, [IGL[2], IGL[3], ICE[5]]);
  return { eye: { x: hx + 1, y: gy - 4 }, head: { x: hx, y: gy - 10 }, hand: { x: cx + 22, y: gy - 22 }, chest: { x: cx - 2, y: gy - 6 }, tip: { x: cx + 26, y: gy } };
}

function createFrozenKnight() {
  const S = spec(FKN, drawFrozenKnight, RIM_ICE, BACK_ICE);
  // Ruhe: Schwert gesenkt vor dem Körper, schweres Atmen (Frosthauch)
  const idleA = fkp({ hFx: 6, hFy: 12, sw: -0.95 });
  const idleB = fkp({ hFx: 6, hFy: 13, sw: -0.88, hipY: 1, lean: 0.09, headY: 1, capeT: Math.PI });
  const idle = [];
  for (let i = 0; i < 6; i++) idle.push(mixP(idleA, idleB, (1 - Math.cos(i / 6 * TAU)) / 2));
  const walk = [];
  for (let i = 0; i <= 8; i++) {
    const ph = (i / 8) * TAU, sn = Math.sin(ph), c = Math.cos(ph);
    walk.push([i / 8, fkp({
      hipY: -Math.abs(c) * 1.2 + 1, lean: 0.12, fFx: 1 + sn * 6.5, fFy: Math.max(0, -c) * 2.5, fBx: -1 - sn * 6.5, fBy: Math.max(0, c) * 2.5,
      hFx: 7 + sn * 0.8, hFy: 12, sw: -0.9 + sn * 0.06, cape: 0.2, capeT: ph, head: sn * 0.4, headY: Math.abs(c) * 0.5,
    }), linear]);
  }
  // Ausholen: Zweihänder steil über den Kopf gerissen
  const w1 = fkp({ lean: -0.05, hipX: -1, hFx: 3, hFy: -8, sw: -1.9, fFx: 8, fBx: -8, cape: 0.15, eye: 1.3 });
  const w2 = fkp({ lean: -0.22, hipX: -2, hipY: 1, hFx: -1, hFy: -14, sw: -2.55, fFx: 9, fBx: -9, fBy: 1, cape: 0.25, capeT: 1, eye: 1.6, headY: -1 });
  const w3 = fkp({ ...w2, lean: -0.26, hFx: -3, hFy: -14, sw: 2.9, eye: 1.8 });
  // Schlag: senkrecht in den Boden – Eis bricht hervor
  const s1 = fkp({ lean: 0.2, hipX: 2, hipY: 2, hFx: 8, hFy: -10, sw: -0.8, fFx: 11, fBx: -9, cape: 0.6, capeT: 2, eye: 1.8 });
  const s2 = fkp({ lean: 0.48, hipX: 4, hipY: 6, hFx: 11, hFy: 3, sw: 1.2, fFx: 12, fBx: -11, cape: 0.9, capeT: 3, eye: 1.8 });
  const s3 = fkp({ ...s2, lean: 0.46, capeT: 4, eye: 1.4 });
  const s4 = fkp({ lean: 0.22, hipX: 2, hipY: 3, hFx: 9, hFy: 8, sw: 1.1, fFx: 10, fBx: -9, cape: 0.4, capeT: 5 });
  const hurtP = fkp({ lean: -0.16, hipX: -2, head: -1.5, headY: -1, hFx: 5, hFy: 10, sw: -0.6, eye: 1.4, cape: 0.3 });
  const d1 = fkp({ lean: -0.26, hipX: -2, head: -2, hFx: 5, hFy: 11, sw: -0.2, eye: 1.2 });
  const d2 = fkp({ kneel: 1, lean: 0.25, head: 1.5, headY: 1, hFx: 10, hFy: 13, sw: 0.5, eye: 0.8, fFx: 7, fBx: -9 });
  const d3 = fkp({ kneel: 1, lean: 0.5, head: 2.5, headY: 2, hFx: 11, hFy: 15, sw: 0.35, eye: 0.4, fFx: 7, fBx: -9 });
  return {
    idle: new Animation(idle.map((P) => track(S, [[0, P], [1, P]], 1)[0]), 5),
    walk: new Animation(track(S, walk, 8, { loop: true, extras: { 0: { fx: 'step' }, 4: { fx: 'step' } } }), 8),
    windup: new Animation([
      ...track(S, [[0, idleA], [0.5, w1], [1, w2]], 4, { extras: { 3: { swordBehind: true } } }),
      ...track(S, [[0, w3], [1, w3]], 1, { extras: { 0: { swordBehind: true } } }),
    ], 8, false),
    strike: new Animation(track(S, [[0, s1], [0.25, s2, snap], [0.6, s3], [1, s4]], 5, {
      extras: { 0: { smear: [-2.4, -1.0] }, 1: { fx: 'impact', smear: [-1.0, 1.1], burst: 0.7 }, 2: { burst: 1 }, 3: { burst: 0.8 } },
    }), 11, false),
    hurt: new Animation(track(S, [[0, hurtP], [1, idleA]], 2, { extras: { 0: { hurt: true } } }), 9, false),
    death: new Animation([
      ...track(S, [[0, hurtP], [0.35, d1], [0.7, d2, snap], [1, d3]], 4, { extras: { 0: { hurt: true }, 2: { fx: 'impact' } } }),
      stillR(S, (p, g) => drawKnightFallen(p, g, 0), 'impact', RIM_ICE, BACK_ICE),
      stillR(S, (p, g) => drawKnightFallen(p, g, 0.5), null, RIM_ICE, BACK_ICE),
      stillR(S, (p, g) => drawKnightFallen(p, g, 1), null, RIM_ICE, BACK_ICE),
    ], 7, false),
  };
}

// ================================================================ Export

const RIME = {
  ice_elemental: createIceElemental,
  crystal_spider: createCrystalSpider,
  frozen_knight: createFrozenKnight,
};

// only (optional): nur eine Figur erzeugen. Jede Figur wird erst beim ersten
// Zugriff gezeichnet und dann gecacht (wie createForgeFoes).
export function createRimeFoes(only) {
  const out = {};
  for (const k in RIME) {
    if (only && only !== k) continue;
    Object.defineProperty(out, k, {
      configurable: true, enumerable: true,
      get() {
        const v = RIME[k]();
        Object.defineProperty(out, k, { value: v, writable: true, configurable: true, enumerable: true });
        return v;
      },
    });
  }
  return out;
}

// Werkzeugkasten für foes_throne.js
export const RK = { rim, mixP, limb, shard, halo, spec, stillR, rig, smearArc, TAU };
