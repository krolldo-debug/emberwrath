import { hash2 } from '../core/math.js';
import { THRONE_KIT } from './foes_throne.js';
import { SPORE_KIT } from './foes_spore.js';
import { WASTES_KIT } from './foes_wastes.js';
import { NEW2_KIT } from './foes_new2.js';
import { STEPPE_KIT } from './foes_steppe.js';
import { FROST_KIT } from './foes_frost.js';

// Sternenglut-Gegner (Teil 1) auf den Rigs anderer Gebiete: gleiche Posen, Frames, Anker und Metadaten wie das
// Vorbild (defs_stars.js spriteBase), aber eigene Körper, Silhouetten und Materialien statt Umfärbung.
// Stil „Leerenbefall“ (wie foes_stars.js): violette Leerenkristalle brechen aus dem Körper, magentafarbene Risse
// und Augen auf der Leuchtebene. Blickrichtung rechts, Anker = Bodenkontakt, Feinraster.

// Gemeinsame Materialien
const CRYS = ['#140a26', '#2a1650', '#4a2a8a', '#7a52c8', '#b896f0', '#f0e4ff'];
const VG = ['#3a0a52', '#7a1ab0', '#b84ae8', '#ec98ff', '#fff0ff'];       // Leuchtebene (violett → weiß)
const MAW = ['#1a0624', '#4a0e5e', '#8a2aa8', '#d070f0', '#ffd8ff'];      // Risse, Rachen, Augen
const RIM_LILAC = '#dcd0ff', BACK_VOID = '#a050e0';

// Leerenkristall: zwei Facetten (Schatten-/Lichtseite), Grat als Glanzlinie, weiße Spitze; Kern leuchtet.
// (x, y) = Fuß, a = Richtung, len/w = Länge/halbe Breite. Fein gezeichnet, bei res 1 ganze Pixel.
function crystal(p, g, x, y, a, len, w, { lit = 1, R = CRYS } = {}) {
  const { poly } = THRONE_KIT;
  const ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
  const S = (s, k) => [x + ux * s + nx * k, y + uy * s + ny * k];
  const lightN = nx * -0.6 + ny * -0.8 > 0 ? 1 : -1;
  const mid = len * 0.32;
  poly(p, [S(0, 0), S(0, -lightN * w * 0.8), S(mid, -lightN * w), S(len, 0)], R[1]);
  poly(p, [S(0, 0), S(0, lightN * w * 0.8), S(mid, lightN * w), S(len, 0)], R[3]);
  // Innenfacette: schmaler heller Keil an der Lichtseite
  poly(p, [S(mid * 0.6, lightN * w * 0.35), S(mid, lightN * w * 0.85), S(len * 0.85, lightN * w * 0.08)], R[4]);
  const a0 = S(len * 0.12, 0), a1 = S(len * 0.94, 0);
  if (p.fine) {
    p.fline(a0[0], a0[1], a1[0], a1[1], R[2]);
    const e0 = S(mid, lightN * w), e1 = S(len, 0);
    p.fline(e0[0], e0[1], e1[0], e1[1], R[5]);
    const d0 = S(mid, -lightN * w); p.fline(d0[0], d0[1], e1[0], e1[1], R[0]);
    const t = S(len - 0.5, 0); p.dot(t[0], t[1], '#ffffff');
  } else {
    p.line(a0[0], a0[1], a1[0], a1[1], R[2]);
    const t = S(len - 0.6, 0); p.px(t[0], t[1], R[5]);
  }
  if (g && lit > 0.2) {
    const c0 = S(len * 0.25, 0), c1 = S(len * 0.7, 0);
    if (g.fine) { g.fline(c0[0], c0[1], c1[0], c1[1], VG[lit > 0.7 ? 2 : 1]); const t = S(len - 0.5, 0); g.dot(t[0], t[1], VG[lit > 0.7 ? 4 : 3]); }
    else g.line(c0[0], c0[1], c1[0], c1[1], VG[1]);
  }
  return { x: S(len, 0)[0], y: S(len, 0)[1] };
}

// Leuchtender Riss (Saum in Weltpixelstärke, heller Kern 1 Feinpixel), Punkte als Liste [x, y]
function rift(p, g, pts, heat = 1) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    if (p.fine) {
      p.fline(x0, y0, x1, y1, heat > 0.5 ? MAW[2] : MAW[1], 1);
      p.fline(x0 + 0.25, y0 + 0.25, x1 + 0.25, y1 + 0.25, heat > 0.75 ? MAW[4] : MAW[3]);
      if (heat > 0.25) { g.fline(x0, y0, x1, y1, VG[heat > 0.7 ? 1 : 0], 1); g.fline(x0 + 0.25, y0 + 0.25, x1 + 0.25, y1 + 0.25, VG[heat > 0.7 ? 3 : 2]); }
    } else { p.line(x0, y0, x1, y1, MAW[3]); if (heat > 0.25) g.line(x0, y0, x1, y1, VG[2]); }
  }
}

// ================================================================ Leerenhund (Rig: Glut-Höllenhund)
// Hager, glatte schieferviolette Haut, gebleichte Schädelmaske mit nach hinten gefegten Kristallhörnern,
// vier große Leerenkristalle auf dem Rückgrat (statt Flammenmähne), leuchtende Rippenrisse, Kristallstachel am
// Schwanz, violetter Rachen.

const HV = ['#0b0816', '#19112e', '#2b1f4a', '#41326c', '#5d4a90', '#8270b8'];
const BONE_V = ['#2c2632', '#5e5468', '#968ca0', '#c8c0cc', '#e8e2e6', '#fdf9f6'];

function houndHead(p, g, nx, ny, P, ex, meta) {
  const { ell, poly } = THRONE_KIT;
  const jaw = P.jaw, up = P.howl, ra = -up * 1.1;
  const c = Math.cos(ra), s = Math.sin(ra);
  const R = (u, v) => [nx + u * c - v * s, ny + u * s + v * c];
  // Schädel (Haut) und lange, schmale Schnauze
  ell(p, nx, ny + 0.3, 4.4, 3.8, HV);
  poly(p, [R(0.5, -1.6), R(8.8, -0.4), R(9.2, 1.3), R(0.5, 2.2)], (x, y) => (y < ny + 0.4 ? HV[3] : HV[2]));
  // Kiefer (öffnet), violetter Rachen
  const ja = jaw * 0.8;
  const J = (u, v) => { const a = ra + ja; return [nx + 0.5 + u * Math.cos(a) - (v + 2) * Math.sin(a), ny + u * Math.sin(a) + (v + 2) * Math.cos(a)]; };
  if (jaw > 0.12) {
    poly(p, [R(1, 1.6), R(8.5, 1.3), J(8, 0), J(1, 0)], MAW[1]);
    poly(p, [R(1.5, 1.9), R(6, 1.8), J(5, -0.3)], MAW[2]);
    for (let u = 2; u < 7.5; u += p.fine ? 0.5 : 1) { const q = R(u, 2.2); g.px(q[0], q[1], VG[jaw > 0.6 ? 2 : 1]); }
  }
  poly(p, [J(0, -0.4), J(8, -0.4), J(7.5, 1.4), J(0, 1.5)], HV[2]);
  if (p.fine) {
    const l0 = J(0.5, 1.3), l1 = J(7.5, 1.2); p.fline(l0[0], l0[1], l1[0], l1[1], HV[0]);
    const k0 = J(0.5, -0.2), k1 = J(7.5, -0.2); p.fline(k0[0], k0[1], k1[0], k1[1], HV[4]);
    // Zähne: helle, nadelspitze Reihe, Fänge vorn
    for (let u = 2.5; u <= 8; u += 1) {
      const fang = u > 6.9, t = R(u, 1.5), t2 = R(u, 2);
      p.dot(t[0], t[1], BONE_V[4]); p.dot(t2[0], t2[1], BONE_V[3]);
      if (fang) { const t3 = R(u, 2.5); p.dot(t3[0], t3[1], BONE_V[2]); }
      const b = J(u - 0.5, -0.6), b2 = J(u - 0.5, -1.1);
      p.dot(b[0], b[1], BONE_V[3]); p.dot(b2[0], b2[1], BONE_V[4]);
    }
  }
  // Schädelmaske aus gebleichtem Knochen: Stirn bis Nasenrücken, harte Lichtkante oben, Schattensaum unten
  poly(p, [R(-3.2, -2.6), R(-0.5, -3.6), R(3.5, -2.6), R(9, -0.6), R(9.2, 0.4), R(4, -0.3), R(1.5, 0.6), R(-2.8, 0.2)], BONE_V[3]);
  poly(p, [R(-2.8, -1), R(1.5, 0.6), R(4, -0.3), R(9.2, 0.4), R(9, 0.9), R(4, 0.4), R(1.5, 1.2), R(-2.8, 0.6)], BONE_V[1]);
  if (p.fine) {
    const a0 = R(-2.8, -2.7), a1 = R(-0.5, -3.6), a2 = R(3.5, -2.6), a3 = R(8.8, -0.7);
    p.fline(a0[0], a0[1], a1[0], a1[1], BONE_V[5]); p.fline(a1[0], a1[1], a2[0], a2[1], BONE_V[5]); p.fline(a2[0], a2[1], a3[0], a3[1], BONE_V[4]);
    const m0 = R(-2, -1.6), m1 = R(8.5, -0.1); p.fline(m0[0], m0[1], m1[0], m1[1], BONE_V[2]);
    // Haarriss in der Maske, aus dem Licht sickert
    rift(p, g, [R(0.5, -3.3), R(1.3, -2.2), R(1, -1.2)], 0.8);
    const ns = R(9.3, 0.3); p.dot(ns[0], ns[1], '#0a0610'); p.dot(ns[0] - 0.5, ns[1] - 0.5, BONE_V[5]);
  }
  meta.mouth = { x: R(9, 1.5 + jaw * 2)[0], y: R(9, 1.5 + jaw * 2)[1] };
  // Kristallhörner: nach hinten gefegt, das nahe größer
  const h0 = R(-1.5, -3.2), h1 = R(0.8, -3.4);
  crystal(p, g, h0[0], h0[1], Math.PI + 0.55 - ra * 0.6 + ra, 6.5, 1.1, { lit: 0.6 });
  crystal(p, g, h1[0], h1[1], Math.PI + 0.85 + ra, 8, 1.4, { lit: 0.9 });
  // Auge: tiefe Höhle in der Maske, magentafarbener Kern
  const ey = R(2.2, -1.2), hurt = ex.hurt;
  p.rect(ey[0] - 1, ey[1] - 0.5, 3.5, 2, '#07040c');
  p.px(ey[0], ey[1], hurt ? '#ffffff' : MAW[3]);
  g.px(ey[0], ey[1], VG[3]); g.px(ey[0] + 1, ey[1], VG[1]); g.px(ey[0] - 1, ey[1], VG[0]);
  if (p.fine) {
    p.dot(ey[0] - 0.5, ey[1], MAW[2]); p.dot(ey[0], ey[1], hurt ? '#ffffff' : MAW[4]); p.dot(ey[0] + 0.5, ey[1], MAW[3]); p.dot(ey[0] + 1, ey[1], MAW[2]);
    p.dot(ey[0], ey[1] + 0.5, MAW[2]); p.dot(ey[0] + 0.5, ey[1] + 0.5, MAW[1]);
    g.dot(ey[0], ey[1], VG[4]); g.dot(ey[0] + 0.5, ey[1], VG[3]);
    const b0 = R(0.2, -2.4), b1 = R(4, -1.8); p.fline(b0[0], b0[1], b1[0], b1[1], BONE_V[1]);
  }
  meta.eye = { x: ey[0], y: ey[1] };
  meta.head = { x: nx, y: ny - 6 };
  // Ohr: kurzer, zerrissener Lappen hinter der Maske
  const e0 = R(-3, -1.2); poly(p, [e0, [e0[0] - 3.5, e0[1] - 1.2], [e0[0] - 0.5, e0[1] + 1.3]], HV[3]);
  if (p.fine) p.fline(e0[0] - 0.5, e0[1] - 0.3, e0[0] - 3, e0[1] - 1, HV[5]);
}

function drawVoidHound(p, g, P, ex) {
  const { ell, cap, ik, furStrands, smearArc, HH } = THRONE_KIT;
  const { AX, AY } = HH;
  const meta = {}, gy = AY;
  const hip = { x: AX - 9 + P.bx, y: gy - 15.5 + P.by + Math.sin(P.pitch) * 8 };
  const sh = { x: AX + 8 + P.bx, y: gy - 18 + P.by - Math.sin(P.pitch) * 8 };
  const heat = Math.min(1.2, P.heat);

  const leg = (bx, by, fx, fy, l1, l2, bend, ramp, far) => {
    const k = ik(bx, by, fx, fy, l1, l2, bend);
    cap(p, bx, by, k.jx, k.jy, far ? 2.2 : 2.7, 1.4, ramp);
    cap(p, k.jx, k.jy, k.ex, k.ey - 1, 1.3, 1.1, ramp);
    p.rect(k.ex - 1, k.ey - 1, 4, 1, ramp[far ? 0 : 2]);
    p.px(k.ex + 3, k.ey - 1, BONE_V[far ? 1 : 3]);
    if (p.fine) {
      // schmale Pfote, zwei lange helle Krallen; Knochensporn am Sprunggelenk
      p.dot(k.ex + 0.5, k.ey - 1, ramp[0]); p.dot(k.ex + 1.5, k.ey - 1, ramp[0]);
      p.dot(k.ex + 3.5, k.ey - 0.5, BONE_V[far ? 1 : 3]); p.dot(k.ex + 3, k.ey - 1, BONE_V[far ? 2 : 5]); p.dot(k.ex + 2, k.ey - 0.5, BONE_V[far ? 1 : 4]);
      if (!far) { p.dot(k.jx - 1, k.jy - 0.5, BONE_V[3]); p.dot(k.jx - 1.5, k.jy - 0.5, BONE_V[4]); p.dot(k.jx - 1, k.jy, BONE_V[2]); }
    }
  };
  const farR = HV.slice(0, 4), nearR = HV.slice(1, 6);
  leg(hip.x + 1, hip.y + 1, AX - 10 + P.hBx, gy - P.hBy, 8.5, 8.5, 1, farR, true);
  leg(sh.x - 1, sh.y + 1, AX + 6 + P.fBx, gy - P.fBy, 8.5, 8.5, -1, farR, true);

  // Peitschenschwanz mit Kristallstachel
  let tx = hip.x - 4, ty = hip.y - 2, ta = 0;
  for (let i = 0; i < 7; i++) {
    ta = Math.PI + 0.35 - i * 0.16 + Math.sin(P.tail + i * 0.7) * 0.28;
    const nx = tx + Math.cos(ta) * 1.9, ny = ty - Math.sin(ta) * 1.9;
    cap(p, tx, ty, nx, ny, 1.3 - i * 0.12, 1.1 - i * 0.12, HV);
    tx = nx; ty = ny;
  }
  crystal(p, g, tx, ty, -ta + 0.1, 5.5, 1.2, { lit: heat });

  // Rumpf: tiefe Brust, eingezogene Taille (Windhund), glatte Haut
  cap(p, hip.x, hip.y, sh.x, sh.y, 3.6, 5.2, HV);
  ell(p, hip.x - 0.5, hip.y - 0.3, 4.6, 4.2, HV);
  ell(p, sh.x, sh.y + 0.8 - P.breath * 0.5, 6, 6.2 + P.breath * 0.5, HV);
  if (p.fine) {
    furStrands(p, hip.x - 3, hip.y - 1, sh.x + 3, sh.y - 1, 4, 22, 41, HV, 1.1);
    // Bauchlinie (harte Schattenkante) und Muskelkante am Schulterblatt
    p.fline(hip.x + 1, hip.y + 3.5, sh.x - 3, sh.y + 5.5, HV[0]);
    p.fline(sh.x - 2.5, sh.y - 3.5, sh.x - 1, sh.y + 2, HV[5]);
  }
  // Rippenrisse: violettes Licht aus dem Inneren
  for (let i = 0; i < 4; i++) {
    const u = 0.42 + i * 0.13, x = hip.x + (sh.x - hip.x) * u, y = hip.y + (sh.y - hip.y) * u;
    const hot = heat * (0.6 + P.breath * 0.4);
    rift(p, g, [[x + 0.3, y - 1.5], [x + 0.9, y + 0.5], [x + 1.6, y + 2.6]], hot);
  }

  // nahe Beine
  leg(hip.x, hip.y + 2, AX - 8 + P.hAx, gy - P.hAy, 8.5, 8.5, 1, nearR, false);
  leg(sh.x + 1, sh.y + 2.5, AX + 9 + P.fAx, gy - P.fAy, 8.5, 8.5, -1, nearR, false);

  // Rückgrat: gebleichte Wirbel, dazwischen vier große Leerenkristalle (nach hinten geneigt, vorn am größten)
  const back = (u) => ({ x: hip.x + (sh.x - hip.x) * u, y: hip.y - 4 + (sh.y - 5.5 - hip.y + 4) * u - Math.sin(u * Math.PI) * 0.6 });
  if (p.fine) for (let i = 0; i <= 8; i++) { const b = back(i / 8); p.dot(b.x, b.y, BONE_V[3]); p.dot(b.x + 0.5, b.y, BONE_V[4]); p.dot(b.x, b.y + 0.5, BONE_V[1]); }
  const grow = P.mane * (0.85 + heat * 0.15);
  for (const [u, len, w, lean] of [[0.12, 4.5, 1.1, -0.25], [0.38, 6.5, 1.4, -0.35], [0.64, 8.5, 1.7, -0.45], [0.88, 7, 1.5, -0.5]]) {
    const b = back(u);
    crystal(p, g, b.x, b.y + 0.8, -Math.PI / 2 + lean - P.howl * 0.15, len * grow, w, { lit: heat });
  }

  // Hals
  const na = -0.55 + P.head - P.pitch * 0.3 - P.howl * 0.9;
  const nx = sh.x + 4 + Math.cos(na) * 4, ny = sh.y - 2 + Math.sin(na) * 4;
  cap(p, sh.x + 2, sh.y - 1, nx, ny, 3.8, 2.9, HV);
  if (p.fine) {
    furStrands(p, sh.x + 1, sh.y - 1, nx, ny, 2.6, 8, 44, HV, 1.1);
    // Kehle: drei Knochenplatten wie ein Halsring
    for (let k = 0; k < 3; k++) { const x = sh.x + 4 + k * 1.2 + Math.cos(na) * 1.5, y = sh.y + 1.5 - k * 0.6; p.dot(x, y, BONE_V[3]); p.dot(x + 0.5, y, BONE_V[4]); p.dot(x, y + 0.5, BONE_V[1]); }
  }
  houndHead(p, g, nx + 2, ny, P, ex, meta);
  if (ex.smear) smearArc(p, g, nx + 2, ny + 2, ex.smear[0], ex.smear[1], 6, 12, [CRYS[3], CRYS[4], '#f8f0ff'], [VG[1], VG[2]], 1);
  return meta;
}

function drawVoidHoundCorpse(p, g, k) {
  const { ell, cap, poly, HH } = THRONE_KIT;
  const { AX, AY } = HH;
  const cx = AX - 1, cy = AY - 4, lit = 1 - k;
  for (const [x, a] of [[-8, 0.3], [-4, 0.6], [6, 0.2], [9, 0.5]]) cap(p, cx + x, cy + 2, cx + x + 4 + a * 3, cy + 4, 1.3, 1, HV.slice(0, 4));
  ell(p, cx, cy, 10.5, 4, HV);
  for (let i = 0; i < 4; i++) { const x0 = cx - 3 + i * 2.5; rift(p, g, [[x0, cy - 1.5], [x0 + 0.6, cy + 0.5], [x0 + 1, cy + 2]], lit * 0.9); }
  // Kristalle zerfallen: Stümpfe bleiben, Licht erlischt
  for (const [x, len] of [[-7, 3], [-2, 4.5], [3, 6], [7, 4.5]]) crystal(p, g, cx + x, cy - 3, -Math.PI / 2 - 0.5, len * (1 - k * 0.45), 1.3, { lit });
  ell(p, cx + 12, cy + 1, 3.6, 2.8, HV);
  poly(p, [[cx + 10, cy - 1.5], [cx + 19.5, cy + 0.5], [cx + 19.5, cy + 1.5], [cx + 10, cy + 1]], BONE_V[3]);
  poly(p, [[cx + 10, cy + 1], [cx + 19.5, cy + 1.5], [cx + 19, cy + 3], [cx + 12, cy + 3]], HV[2]);
  if (p.fine) p.fline(cx + 10.5, cy - 1.5, cx + 19, cy + 0.5, BONE_V[5]);
  return { eye: { x: cx + 13, y: cy }, mouth: { x: cx + 19, y: cy + 2 }, head: { x: cx + 12, y: cy - 3 } };
}

// ================================================================ Wurzelgebundener (Rig: Pilzwüterich)
// Gebückter Hüne aus gebleichtem Birkenholz, mit dunklen Wurzelsträngen gefesselt; aus den Schultern bricht ein
// Kranz großer Leerenkristalle, dahinter tote, gegabelte Äste. Knorrengesicht mit zwei glühenden Astlöchern.

const BIRCH = ['#0a080c', '#171117', '#271e25', '#3b3135', '#544846', '#74665a', '#9a8a70'];
const KNOT = ['#0e0a10', '#1e1620', '#33283a', '#4a3c50'];
const CORD = ['#0e0a12', '#1e1626', '#302438', '#46364e', '#5e4a66'];

// Holzmaser längs einer Kapsel: helle Grate, dunkle Furchen, mit festen Lücken; dazu Birkenkerben quer
function birchGrain(p, x0, y0, x1, y1, r0, r1, seed, dim = false) {
  const { axis } = SPORE_KIT;
  const A = axis(x0, y0, x1, y1), q = p.step / A.len;
  const lines = [[0.7, dim ? BIRCH[4] : BIRCH[6]], [0.48, BIRCH[2]], [0.26, dim ? BIRCH[3] : BIRCH[5]], [0.02, BIRCH[1]], [-0.24, dim ? BIRCH[2] : BIRCH[3]], [-0.5, BIRCH[0]]];
  lines.forEach(([o, c], li) => {
    for (let s = 0.06; s <= 0.94; s += q) {
      if (hash2(Math.floor(s * A.len / 3.2), li, seed) < 0.18) continue;
      const r = (r0 + (r1 - r0) * s) * (o + Math.sin(s * A.len * 0.8 + li * 1.9) * 0.07);
      p.dot(x0 + A.ux * s * A.len + A.nx * r, y0 + A.uy * s * A.len + A.ny * r, c);
    }
  });
  // Birkenkerben: kurze dunkle Querstriche auf der Lichtseite
  for (let i = 0; i < Math.round(A.len / 3); i++) {
    const s = 0.12 + hash2(i, seed, 61) * 0.76, o = 0.15 + hash2(i, seed, 62) * 0.5, r = (r0 + (r1 - r0) * s);
    const cx = x0 + A.ux * s * A.len + A.nx * o * r, cy = y0 + A.uy * s * A.len + A.ny * o * r, w = 0.8 + hash2(i, seed, 63) * 1.2;
    p.fline(cx - A.nx * w, cy - A.ny * w, cx + A.nx * w, cy + A.ny * w, BIRCH[1]);
    p.dot(cx - A.nx * w - A.ux * 0.5, cy - A.ny * w - A.uy * 0.5, BIRCH[6]);
  }
}

// Wurzelstrang, der sich um eine Kapsel windet (sichtbar nur vorn): dunkle Kordel mit Glanzgrat
function cordWrap(p, x0, y0, x1, y1, r0, r1, turns, ph) {
  const { axis } = SPORE_KIT;
  const A = axis(x0, y0, x1, y1), n = Math.ceil(A.len * 3);
  for (let i = 0; i <= n; i++) {
    const s = i / n, a = s * turns * Math.PI * 2 + ph, front = Math.cos(a);
    if (front < -0.1) continue;
    const r = (r0 + (r1 - r0) * s) * Math.sin(a) * 0.92;
    const x = x0 + A.ux * s * A.len + A.nx * r, y = y0 + A.uy * s * A.len + A.ny * r;
    if (p.fine) { p.dot(x, y, CORD[2]); p.dot(x + 0.5, y, CORD[1]); p.dot(x, y + 0.5, CORD[0]); p.dot(x - 0.5, y - 0.5, front > 0.6 ? CORD[4] : CORD[3]); p.dot(x, y - 0.5, CORD[3]); }
    else p.px(x, y, CORD[2]);
  }
}

// Holzfaust: Knöchel als Knorren, Wurzelfinger hängen herab
function woodFist(p, g, x, y, r, near) {
  const { ell } = SPORE_KIT;
  const bias = near ? 0 : -0.22;
  ell(p, x, y, r, r * 0.9, BIRCH.slice(1), { bias });
  for (let i = 0; i < 4; i++) {
    const a = -0.8 + i * 0.5, kx = x + Math.cos(a) * (r - 1), ky = y + Math.sin(a) * (r - 1) * 0.9;
    ell(p, kx, ky, 1.7, 1.5, BIRCH.slice(1), { bias: bias + 0.06 });
    if (p.fine) { p.dot(kx - 0.5, ky - 0.5, near ? BIRCH[6] : BIRCH[4]); p.dot(kx + 0.5, ky + 1, BIRCH[0]); }
  }
  if (p.fine) {
    p.fline(x - r * 0.6, y - 0.5, x + 0.5, y + r * 0.5, BIRCH[1]); p.fline(x - r * 0.6, y - 1, x, y + r * 0.5 - 1, near ? BIRCH[5] : BIRCH[3]);
    for (let i = 0; i < 5; i++) {
      const fx = x - 3 + i * 1.5, fy = y + r * 0.7, l = 2 + hash2(i, near ? 1 : 2, 87) * 2.5;
      p.fline(fx, fy, fx - 0.3 + i * 0.2, fy + l, i & 1 ? CORD[2] : CORD[3]); p.dot(fx - 0.3 + i * 0.2, fy + l + 0.5, CORD[0]);
    }
  }
}

function drawRootbound(p, g, P, X) {
  const { ell, capsule, rig, FD, FAX, FAY } = SPORE_KIT;
  const K = P.kneel;
  const R = rig({ ...P, hipY: P.hipY + K * 6 }, FD, FAX, FAY);
  const { hip, pt, legF, legB, shF, shB, armF, armB } = R;
  const meta = {}, glow = P.glow;
  if (K > 0.01) {
    const kx = hip.x - 4 - K * 3, ky = FAY - 2;
    legB.jx += (kx - legB.jx) * K; legB.jy += (ky - legB.jy) * K;
    legB.ex += (kx - 9 - legB.ex) * K; legB.ey += (FAY - legB.ey) * K;
  }
  const BR = BIRCH.slice(1), BRD = BIRCH.slice(0, 6);
  const toes = (x, y, near) => {
    for (let k = 0; k < 4; k++) {
      const tx = x - 4 + k * 3, ex = tx + 2 + k * 0.4;
      if (p.fine) {
        p.fline(tx, y - 2, ex, y - 0.5, near ? CORD[3] : CORD[2], 1); p.fline(tx, y - 2.5, ex, y - 1, near ? CORD[4] : CORD[3]);
        p.dot(ex + 0.5, y - 0.5, CORD[0]);
      } else p.line(tx, y - 2, ex, y - 0.5, CORD[2]);
    }
  };
  const limb = (x0, y0, x1, y1, r0, r1, near, seed) => {
    capsule(p, x0, y0, x1, y1, r0, r1, near ? BR : BRD, { bias: near ? 0 : -0.22 });
    if (p.fine) { birchGrain(p, x0, y0, x1, y1, r0, r1, seed, !near); if (near) cordWrap(p, x0, y0, x1, y1, r0, r1, 0.5, seed); }
  };

  // --- hinterer Arm, hinteres Bein
  limb(shB.x, shB.y, armB.jx, armB.jy, 4.2, 3.6, false, 11);
  limb(armB.jx, armB.jy, armB.ex, armB.ey, 3.6, 4, false, 12);
  woodFist(p, g, armB.ex, armB.ey, 5.2, false);
  limb(hip.x - 3, hip.y, legB.jx, legB.jy, 4.6, 4, false, 13);
  limb(legB.jx, legB.jy, legB.ex, legB.ey - 2, 3.8, 4.4, false, 14);
  toes(legB.ex, legB.ey, false);

  // --- tote Äste hinter dem Rücken (gegabelt, dunkel, helle Bruchkanten)
  const twig = (x, y, a, len, depth) => {
    const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
    if (p.fine) { p.fline(x, y, ex, ey, KNOT[2], depth > 1 ? 1 : 0); p.fline(x - 0.5, y - 0.5, ex - 0.5, ey - 0.5, KNOT[3]); p.dot(ex, ey, BIRCH[4]); }
    else p.line(x, y, ex, ey, KNOT[2]);
    if (depth > 0) { twig(ex, ey, a - 0.45, len * 0.62, depth - 1); twig(ex, ey, a + 0.38, len * 0.55, depth - 1); }
  };
  const nape = pt(FD.spine + 1, -3);
  twig(nape.x - 2, nape.y + 1, -Math.PI / 2 - 0.9 - P.lean * 0.5, 9, 2);
  twig(nape.x + 1, nape.y, -Math.PI / 2 - 0.35 - P.lean * 0.5, 7, 2);

  // --- Rumpf: gedrehter Stamm, von Wurzelsträngen gefesselt
  const hp = pt(0, 0), cpT = pt(FD.spine - 2.5, 0.5);
  capsule(p, hp.x, hp.y, cpT.x, cpT.y, 9.2, 10.6, BR, { bias: -0.06 });
  if (p.fine) {
    birchGrain(p, hp.x, hp.y, cpT.x, cpT.y, 9.2, 10.6, 4);
    cordWrap(p, hp.x, hp.y, cpT.x, cpT.y, 9.2, 10.6, 0.55, 0.9);
  }
  // Astlöcher (dunkle Knorren mit hellem Wulst) und ein klaffender Riss mit Leerenlicht im Bauch
  for (const [u, k, r] of [[4, -5, 1.6], [11, -7, 1.2], [8, 6.5, 1.3]]) {
    const o = pt(u, k);
    ell(p, o.x, o.y, r + 0.9, r + 0.6, BIRCH.slice(3), { bias: 0.1 });
    ell(p, o.x + 0.2, o.y + 0.2, r, r * 0.8, KNOT);
  }
  const rc = [pt(3, 3.5), pt(6, 5.5), pt(8.5, 4.2), pt(11.5, 6.4), pt(13.5, 5.5)].map((o) => [o.x, o.y]);
  rift(p, g, rc, Math.min(1, glow));
  if (p.fine && glow > 0.3) { const m = pt(8.5, 4.6); p.dot(m.x, m.y, MAW[4]); g.dot(m.x, m.y, VG[4]); g.dot(m.x + 0.5, m.y, VG[3]); }

  // --- vorderes Bein
  limb(hip.x + 3, hip.y, legF.jx, legF.jy, 4.8, 4.2, true, 15);
  limb(legF.jx, legF.jy, legF.ex, legF.ey - 2, 4.1, 4.7, true, 16);
  toes(legF.ex + 1, legF.ey, true);

  // Kopf- und Kranzmaße
  const crown = pt(FD.spine + 1.5, -1);
  const hc = pt(FD.spine - 2, 9.5);
  const hx = Math.round(hc.x + P.head), hy = Math.round(hc.y + 1);
  meta.eye = { x: hx + 4, y: hy - 2 };
  meta.mouth = { x: hx + 5, y: hy + 2 };
  meta.head = { x: crown.x, y: crown.y - 16 };

  const drawCrown = () => {
    // Kranz aus Leerenkristallen auf Nacken und Schultern: groß, nach hinten oben, vorn kleinere
    const lean = -P.lean * 0.6 + Math.sin(P.capT) * 0.03 - P.capTilt * 0.15;
    const sc = 1 - K * 0.15;
    for (const [dx, dy, a, len, w] of [[-5, 2, -2.3, 10, 2], [-1, 0, -1.95, 15, 2.6], [3, 1, -1.62, 11, 2.2], [6.5, 3, -1.25, 7, 1.6], [-7.5, 5, -2.65, 6.5, 1.4]]) {
      crystal(p, g, crown.x + dx, crown.y + dy, a + lean, len * sc, w, { lit: glow });
    }
    // Bruchkante, aus der sie wachsen: zersplittertes Holz
    if (p.fine) for (let i = -8; i <= 7; i += 1) { const x = crown.x + i, y = crown.y + 3.5 + Math.abs(i) * 0.12 + (i & 1) * 0.5; p.dot(x, y, BIRCH[5]); p.dot(x, y + 0.5, BIRCH[2]); }
  };
  const drawArm = () => {
    limb(shF.x, shF.y, armF.jx, armF.jy, 5, 4.2, true, 17);
    limb(armF.jx, armF.jy, armF.ex, armF.ey, 4.1, 4.6, true, 18);
  };
  const drawHead = () => {
    // Knorrengesicht: vorgewölbte Holzmaske unter einem schweren Brauenast
    ell(p, hx + 1, hy, 5.2, 4.6, BR, { bias: 0.18 });
    const { capsule: cap2 } = SPORE_KIT;
    cap2(p, hx - 3, hy - 3.5, hx + 6, hy - 2.5, 1.6, 1.2, BIRCH.slice(2), { bias: 0.1 });   // Brauenast
    // Astlöcher als Augen, tief und dunkel, mit glühendem Kern
    const eyeOn = P.eye > 0.3;
    for (const [ex, ey, big] of [[hx + 4, hy - 1, 1], [hx + 0.5, hy - 1, 0]]) {
      ell(p, ex, ey, big ? 1.6 : 1.3, big ? 1.3 : 1.1, KNOT);
      if (eyeOn) {
        p.px(ex, ey, big ? MAW[3] : MAW[2]); g.px(ex, ey, big ? VG[3] : VG[2]);
        if (p.fine) { p.dot(ex, ey, big ? MAW[4] : MAW[3]); g.dot(ex, ey, VG[4]); g.dot(ex + 0.5, ey, VG[2]); }
      }
    }
    // Maul: gezackter Spalt, beim Brüllen offen mit violettem Schimmer
    const my = hy + 2, jw = Math.round(P.jaw * 3);
    p.rect(hx - 0.5, my, 6, 1 + jw, KNOT[0]);
    if (jw > 0) { g.rect(hx + 0.5, my, 4, jw + 1, VG[0]); p.rect(hx + 1, my + jw, 3, 1, MAW[1]); }
    if (p.fine) {
      for (let k = 0; k < 6; k += 1) { p.dot(hx - 0.5 + k, my, k & 1 ? BIRCH[4] : BIRCH[6]); if (jw) p.dot(hx + k, my + jw + 0.5, k & 1 ? BIRCH[5] : BIRCH[3]); }
      p.fline(hx - 3, hy - 4.5, hx + 5.5, hy - 3.5, BIRCH[6]);                     // Licht auf dem Brauenast
      p.fline(hx + 6, hy - 1, hx + 6.5, hy + 1.5, BIRCH[5]);                       // Wangenknorren vorn
      p.fline(hx - 3.5, hy + 1, hx - 1.5, hy + 3.5, BIRCH[2]);
      p.fline(hx, my + 1.5 + jw, hx + 4.5, my + 1.5 + jw, BIRCH[3]);               // Kinnlicht
      // Moosbart: wenige helle Strähnen am Kinn
      for (let i = 0; i < 5; i++) { const bx = hx - 0.5 + i * 1.2, l = 1.5 + hash2(i, 3, 91) * 2; p.fline(bx, my + 2 + jw, bx - 0.3, my + 2 + jw + l, i & 1 ? '#5a7a62' : '#8aa88a'); }
    }
  };
  drawCrown();
  if (armF.ey < hy) { drawHead(); drawArm(); }
  else { drawArm(); drawHead(); }
  woodFist(p, g, armF.ex, armF.ey, 6.2, true);
  meta.hand = { x: armF.ex, y: armF.ey };

  // Aufschlag: Holzsplitter und Kristallstaub
  if (P.puff > 0) {
    const cx = armF.ex + 2, cy = FAY - 2, k = P.puff;
    for (let i = 0; i < 18; i++) {
      const a = Math.PI + (i / 17) * Math.PI, r = (4 + hash2(i, 1, 93) * 10) * (0.5 + k * 0.6);
      const x = cx + Math.cos(a) * r * 1.4, y = cy + Math.sin(a) * r * 0.7;
      if (i % 3 === 0) { p.px(x, y, CRYS[4]); g.px(x, y, VG[2]); }
      else p.px(x, y, i & 1 ? BIRCH[5] : BIRCH[3]);
    }
  }
  return meta;
}

// ================================================================ Koloss-Rig (Glutkoloss): Splitterkoloss und Verdorrter Hüter
// Beide nutzen Posen und Angriffe des Glutkolosses (foes_wastes.js createColossus) mit eigenen Formen statt runder
// Felsen: der Splitterkoloss aus facettierten Glasbrocken mit Leerenkern, der Hüter aus knorrigem Totholz mit
// Maserringen, abgebrochenen Aststümpfen und Kristallwucher.

const VLAVA = ['#2a0a3a', '#5a1a80', '#9a3ad0', '#d070f0', '#f0b0ff', '#ffffff'];   // Leerenkern statt Magma
const vGlowDot = (g, x, y, r) => {
  const { fillEll } = WASTES_KIT;
  if (r <= 0.6) { g.px(x, y, VG[3]); return; }
  fillEll(g, x, y, r + 1, r + 1, VG[0]); fillEll(g, x, y, r, r, VG[1]);
  fillEll(g, x, y, Math.max(0.5, r - 1), Math.max(0.5, r - 1), VG[2]);
  if (r > 1.5) fillEll(g, x, y, Math.max(0.5, r - 2), Math.max(0.5, r - 2), VG[4]);
};
// Risse im Brocken (statt Glutadern): wenige, gezackte Leerenrisse
function chunkRifts(p, g, x, y, rx, ry, seed, n, heat) {
  for (let i = 0; i < n; i++) {
    let px = x + (hash2(i, 1, seed) - 0.5) * rx * 0.9, py = y + (hash2(i, 2, seed) - 0.5) * ry * 0.9, a = hash2(i, 3, seed) * Math.PI * 2;
    const pts = [[px, py]];
    for (let s = 0; s < 3; s++) { a += (hash2(i, s, seed + 5) - 0.5) * 1.6; px += Math.cos(a) * rx * 0.28; py += Math.sin(a) * ry * 0.28; pts.push([px, py]); }
    rift(p, g, pts, Math.min(1, heat));
  }
}

// --- Splitterkoloss: facettierter Glasbrocken (gleiche Signatur wie boulder)
const QUARTZ = ['#0e1026', '#1a2044', '#283468', '#3e5290', '#5e78b4', '#8ea8d6', '#cadcf4'];
const QUARTZ_D = ['#0a0b1c', '#121630', '#1c2246', '#28305c', '#363e74'];
function glassChunk(p, g, x, y, rx, ry, ramp, seed, heat, cracks = 2, o = {}) {
  const { poly, ln } = WASTES_KIT;
  const rot = o.rot ?? 0, n = 7, cr = Math.cos(rot), sr = Math.sin(rot);
  const P = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + hash2(i, 1, seed) * 0.5 - 0.25 + seed * 0.37;
    const k = 0.88 + hash2(i, 2, seed) * 0.2;
    const u = Math.cos(a) * rx * k, v = Math.sin(a) * ry * k;
    P.push([x + u * cr - v * sr, y + u * sr + v * cr]);
  }
  if (o.rim) poly(p, P.map(([a, b]) => [x + (a - x) * (1 + 1 / rx), y + (b - y) * (1 + 1 / ry)]), ramp[0]);
  // Facetten vom (nach oben links versetzten) Mittelpunkt aus; Helligkeit nach Ausrichtung zum Licht
  const cx = x - rx * 0.18, cy = y - ry * 0.22, m = ramp.length, bias = o.bias ?? 0;
  for (let i = 0; i < n; i++) {
    const A = P[i], B = P[(i + 1) % n];
    const mx = (A[0] + B[0]) / 2 - x, my = (A[1] + B[1]) / 2 - y, L = Math.hypot(mx, my) || 1;
    const d = (mx / L) * -0.6 + (my / L) * -0.8 + bias * 2;   // > 0: zum Licht
    const k = d > 0.55 ? m - 2 : d > 0.1 ? m - 3 : d > -0.4 ? m - 4 : m - 5;
    poly(p, [[cx, cy], A, B], ramp[Math.max(1, k)]);
    if (p.fine) {
      ln(p, A[0], A[1], B[0], B[1], d > 0.1 ? ramp[m - 1] : ramp[Math.max(0, k - 1)]);
      if (d > 0.3) ln(p, cx, cy, A[0], A[1], ramp[m - 2]);
    }
  }
  if (p.fine) {
    // Innenfacette: kleiner heller Keil, Glanzpunkt
    poly(p, [[cx, cy], [cx - rx * 0.35, cy - ry * 0.1], [cx - rx * 0.05, cy - ry * 0.45]], ramp[m - 1]);
    p.dot(cx - rx * 0.2, cy - ry * 0.25, '#ffffff');
  }
  if (cracks && rx > 10) chunkRifts(p, g, x, y, rx, ry, seed + 7, 1, heat);
}
function glassHead(p, g, hx, hy, P, ex) {
  glassChunk(p, g, hx, hy, 6.5, 5.5, QUARTZ, 150, 0.6, 0, { rim: 1 });
  // Krone aus drei Kristallen statt Stirnwulst
  crystal(p, g, hx - 3, hy - 3, -2.1, 7, 1.6, { lit: 1 });
  crystal(p, g, hx + 0.5, hy - 4.5, -1.75, 9, 1.8, { lit: 1 });
  crystal(p, g, hx + 4, hy - 3, -1.3, 5, 1.3, { lit: 1 });
  // Sehschlitz: schwarzes Band, zwei magentafarbene Kerne
  p.rect(hx, hy - 1, 7, 2, '#05040c');
  for (const u of [2, 4.5]) { p.px(hx + u, hy, ex.hurt ? '#ffffff' : MAW[3]); g.px(hx + u, hy, VG[3]); g.px(hx + u, hy - 1, VG[1]); if (p.fine) { p.dot(hx + u, hy, MAW[4]); g.dot(hx + u, hy, VG[4]); } }
  const jo = Math.round(P.jaw * 3);
  if (jo > 0) { p.rect(hx + 1, hy + 2, 5, jo, '#05040c'); p.rect(hx + 2, hy + 2, 3, jo, MAW[2]); g.rect(hx + 2, hy + 2, 3, jo, VG[2]); }
  return { eye: { x: hx + 3, y: hy - 1 }, head: { x: hx, y: hy - 12 }, mouth: { x: hx + 5, y: hy + 3 } };
}
const SPLINTER_SKIN = {
  ROCK: QUARTZ, ROCK_D: QUARTZ_D, LAVA: VLAVA, GLOW: VG, VOID: '#05040c', glowDot: vGlowDot, cap: (...a) => WASTES_KIT.cap(...a),
  boulder: glassChunk,
  shard: (p, g, bx, by, a, h, w, heat) => crystal(p, g, bx, by, a, h * 1.2, w * 1.05, { lit: heat }),
  head: glassHead,
};

// --- Verdorrter Hüter: Totholz-Knorren (gleiche Signatur wie boulder)
const DEAD = ['#100c0e', '#1f1719', '#33272a', '#4a3b3a', '#64524c', '#836e60', '#a8927c'];
const DEAD_D = ['#0c090b', '#171113', '#231b1d', '#302628', '#3e3232'];
const LICHEN = ['#4e6a5a', '#7e9c84', '#b4ccb0'];
function woodKnot(p, g, x, y, rx, ry, ramp, seed, heat, cracks = 2, o = {}) {
  const { ell, cap } = WASTES_KIT;
  ell(p, x, y, rx, ry, ramp, { rot: o.rot ?? 0, bias: o.bias ?? 0, rim: o.rim ?? 0 });
  // abgebrochene Aststümpfe brechen die runde Silhouette
  if (rx > 4.5) for (let i = 0; i < (rx > 9 ? 2 : 1); i++) {
    const a = -2.6 + hash2(i, 1, seed) * 1.8, sx = x + Math.cos(a) * rx * 0.85, sy = y + Math.sin(a) * ry * 0.85;
    const l = 2 + hash2(i, 2, seed) * rx * 0.35, ex = sx + Math.cos(a) * l, ey = sy + Math.sin(a) * l;
    cap(p, sx, sy, ex, ey, 1.6, 1, ramp);
    if (p.fine) { p.dot(ex, ey, ramp[ramp.length - 1]); p.dot(ex + 0.5, ey + 0.5, ramp[2]); }
  }
  if (p.fine) {
    // Maserringe (Burl): Bögen auf der Lichtseite hell, auf der Schattenseite dunkel
    for (const k of [0.78, 0.55, 0.32]) {
      for (let a = -Math.PI; a < Math.PI; a += 0.12 / Math.max(1, rx * k * 0.3)) {
        if (hash2(Math.floor(a * 3), Math.round(k * 10), seed) < 0.25) continue;
        const lit = Math.cos(a + 2.2) > 0.2;
        const qx = x + Math.cos(a) * rx * k + 0.25, qy = y + Math.sin(a) * ry * k * 0.92 + 0.25;
        p.dot(qx, qy, lit ? ramp[ramp.length - 2] : ramp[1]);
      }
    }
    // Flechten: helle, flache Flecken oben
    for (let i = 0; i < Math.round(rx / 3); i++) {
      const a = -2.4 + hash2(i, 5, seed) * 1.4, qx = x + Math.cos(a) * rx * 0.6, qy = y + Math.sin(a) * ry * 0.6;
      p.dot(qx, qy, LICHEN[2]); p.dot(qx + 0.5, qy, LICHEN[1]); p.dot(qx, qy + 0.5, LICHEN[0]); p.dot(qx - 0.5, qy + 0.5, LICHEN[1]);
    }
  }
  if (cracks && rx > 8) chunkRifts(p, g, x, y, rx, ry, seed + 7, 1, heat * 0.8);
}
function deadBranch(p, g, bx, by, a, h, w) {
  const { cap } = WASTES_KIT;
  const ex = bx + Math.cos(a) * h, ey = by + Math.sin(a) * h;
  cap(p, bx, by, ex, ey, w * 0.8, w * 0.35, DEAD);
  const mx = bx + Math.cos(a) * h * 0.55, my = by + Math.sin(a) * h * 0.55, b = a + 0.7;
  cap(p, mx, my, mx + Math.cos(b) * h * 0.4, my + Math.sin(b) * h * 0.4, w * 0.4, w * 0.25, DEAD);
  if (p.fine) { p.dot(ex, ey, DEAD[6]); p.fline(bx - 0.5, by - 0.5, ex - 0.5, ey - 0.5, DEAD[5]); }
}
function wardenHead(p, g, hx, hy, P, ex) {
  woodKnot(p, g, hx, hy, 6.5, 5.5, DEAD, 150, 0.5, 0, { rim: 1 });
  // Geweih aus toten Ästen, ein Kristall bricht durch die Stirn
  deadBranch(p, g, hx - 3, hy - 3, -2.3, 10, 2.4);
  deadBranch(p, g, hx + 2, hy - 4, -1.5, 8, 2);
  crystal(p, g, hx - 0.5, hy - 4, -1.9, 7, 1.5, { lit: 1 });
  // hohles Gesicht: tiefe Rindenhöhle, zwei Lichtpunkte
  const { ell } = WASTES_KIT;
  ell(p, hx + 3, hy + 0.5, 3.6, 2.8, ['#07050a', '#140e14', '#21181c']);
  for (const u of [1.8, 4.4]) { p.px(hx + u, hy, ex.hurt ? '#ffffff' : MAW[3]); g.px(hx + u, hy, VG[3]); if (p.fine) { p.dot(hx + u, hy, MAW[4]); g.dot(hx + u, hy, VG[4]); g.dot(hx + u + 0.5, hy, VG[2]); } }
  const jo = Math.round(P.jaw * 3);
  if (jo > 0) { p.rect(hx + 1.5, hy + 2, 3.5, jo, '#07050a'); g.rect(hx + 2, hy + 2, 2.5, jo, VG[1]); }
  // Moosbart aus hängenden Flechten
  if (p.fine) for (let i = 0; i < 6; i++) { const bx = hx - 1 + i * 1.3, l = 2 + hash2(i, 4, 151) * 3; p.fline(bx, hy + 3.5, bx - 0.4, hy + 3.5 + l, LICHEN[i & 1 ? 0 : 1]); p.dot(bx, hy + 3.5, LICHEN[2]); }
  return { eye: { x: hx + 3, y: hy - 1 }, head: { x: hx, y: hy - 12 }, mouth: { x: hx + 5, y: hy + 3 } };
}
// Schlanker, gebeugter Baumkörper: Glieder als dünne Äste mit Maserung, Brocken auf gut die Hälfte verkleinert,
// lange Astarme mit Zweigkrallen statt Fäusten, Wurzelfüße
function woodCap(p, x0, y0, x1, y1, r0, r1, ramp, o = {}) {
  const { cap } = WASTES_KIT;
  const k = 0.5, R0 = r0 * k, R1 = r1 * k;
  cap(p, x0, y0, x1, y1, R0, R1, ramp, { ...o, rim: o.rim ? 0.6 : 0 });
  if (!p.fine) return;
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, n = Math.ceil(L * 2);
  for (const [o2, c] of [[-0.45, ramp[ramp.length - 1]], [0.1, ramp[1]], [0.55, ramp[0]]]) for (let i = 1; i < n; i++) {
    if (hash2(i >> 2, Math.round(o2 * 10), 17) < 0.2) continue;
    const t = i / n, r = R0 + (R1 - R0) * t;
    p.dot(x0 + dx * t + nx * o2 * r, y0 + dy * t + ny * o2 * r, c);
  }
}
const wardenKnot = (p, g, x, y, rx, ry, ramp, seed, heat, cracks, o) => woodKnot(p, g, x, y, rx * 0.55, ry * 0.75, ramp, seed, heat, cracks, o);
function wardenClaw(p, g, x, y, r, ry, ramp, seed) {
  const { ell } = WASTES_KIT;
  ell(p, x, y - 1, 2.6, 2.2, ramp);
  for (let i = 0; i < 4; i++) {
    const a = 0.3 + i * 0.42, l = 6 + (i === 1 ? 2 : 0) - (i === 3 ? 1.5 : 0);
    deadBranch(p, g, x + Math.cos(a) * 1.5, y - 1 + Math.sin(a) * 1.5, a, l, 1.5);
  }
  if (p.fine) p.dot(x - 1, y - 2, ramp[ramp.length - 1]);
}
const WARDEN_SKIN = {
  ROCK: DEAD, ROCK_D: DEAD_D, LAVA: VLAVA, GLOW: VG, VOID: '#07050a', glowDot: vGlowDot,
  boulder: wardenKnot, cap: woodCap, fist: wardenClaw, lift: 5, spine: 4, arm: 4,
  // Rücken und Schultern: abwechselnd Kristallwucher und tote Äste
  shard: (p, g, bx, by, a, h, w, heat) => ((Math.round(bx * 3 + by) & 1) ? crystal(p, g, bx, by, a, h * 1.1, w, { lit: heat }) : deadBranch(p, g, bx, by, a, h * 1.15, w * 1.2)),
  head: wardenHead,
};

// ================================================================ Leerenirrlicht (Rig: Phasengeist)
// Schwebende Gestalt aus bleichen Schleiern mit Porzellanmaske; im offenen Brustkorb glimmt ein Leerenkristall,
// über dem Kopf kreisen drei Splitter. Statt Klingen: Hände mit drei langen Kristallkrallen.

const VEIL = ['#140f20', '#261e3a', '#3e325c', '#5e5082', '#8676aa', '#b2a6d0', '#e2dcf2'];
const WISP_TINT = { dis: [CRYS[4], VEIL[5], MAW[3], CRYS[3]], left: [150, 110, 230], right: [210, 80, 220] };

// Kralle: drei Kristalle aus der Hand, gefächert um Richtung a; liefert die Spitze der längsten
function wispClaw(p, g, x, y, a, len, back, glowK) {
  let tip = null;
  for (const [da, k, w] of [[-0.32, 0.7, 0.8], [0.3, 0.62, 0.75], [0, 1, 1.05]]) {
    const t = crystal(p, g, x, y, a + da, len * 0.72 * k, w * (back ? 0.85 : 1), { lit: back ? 0.4 : 0.5 + glowK * 0.4 });
    if (k === 1) tip = t;
  }
  return tip;
}

function drawVoidWisp(p, g, P, X) {
  const { ik, ell, cap, poly, clamp, smearArc, PWS } = NEW2_KIT;
  const { AX, AY } = PWS;
  const meta = {};
  const waist = { x: AX + P.x, y: AY - P.hover - 12 - P.bob };
  const L = P.lean;
  const ch = { x: waist.x + Math.sin(L) * 11, y: waist.y - Math.cos(L) * 11 };
  const shF = { x: ch.x + 2.5, y: ch.y - 2 }, shB = { x: ch.x - 2.5, y: ch.y - 2.5 };

  // --- hinterer Arm mit Kralle
  const armB = ik(shB.x, shB.y, ch.x + P.hBx, ch.y + P.hBy, 6.5, 7, 1);
  cap(p, shB.x, shB.y, armB.jx, armB.jy, 1.1, 0.9, VEIL.slice(0, 5));
  cap(p, armB.jx, armB.jy, armB.ex, armB.ey, 0.9, 0.8, VEIL.slice(0, 5));
  const tipB = wispClaw(p, g, armB.ex, armB.ey, P.aB, 10, true, 1);

  // --- Schleier statt Beinen: breite, helle Bahnen, nach hinten wehend, ausgefranst
  for (let i = 0; i < 7; i++) {
    const f = i / 6, x0 = waist.x - 3.5 + f * 7, y0 = waist.y - 1;
    const len = 11 + (hash2(i, 1, 71) * 5 | 0) - Math.abs(f - 0.45) * 5;
    let x = x0, y = y0;
    for (let s = 0; s < len; s++) {
      const v = s / len;
      x += -P.drift * 0.65 * v - 0.1 + Math.sin(P.t + i * 1.1 + v * 3) * 0.4;
      y += 1;
      const w = (1 - v) * 1.7 + 0.35, tone = (k) => clamp(Math.round(5 - v * 3 - (k > 0 ? 1 : 0) + (i % 2 ? -1 : 0)), 0, 6);
      if (p.fine) {
        for (let k = -w; k <= w; k += 0.5) p.rect(Math.round((x + k) * 2) / 2, y, 0.5, 1, VEIL[tone(k)]);
        p.dot(x - w, y, VEIL[clamp(Math.round(6 - v * 2), 0, 6)]);
        if (s === len - 1) {
          p.fline(x - 0.5, y + 0.5, x - 0.75, y + 1.5, VEIL[3]);
          if (hash2(i, 3, Math.round(P.t * 3)) < 0.5) { p.dot(x, y + 1.5, MAW[3]); g.dot(x, y + 1.5, VG[3]); g.dot(x, y + 2, VG[1]); }
        }
        continue;
      }
      for (let k = -w; k <= w; k += 0.5) p.px(x + k, y, VEIL[tone(k)]);
    }
  }
  // --- Rumpf: Schleierleib, oben breiter (Mantel), Faltenlinien; offener Brustkorb mit Leerenkristall
  cap(p, waist.x, waist.y, ch.x, ch.y, 3.2, 4.8, VEIL, { bias: -0.08 });
  if (p.fine) for (const [o, c] of [[-2.2, VEIL[5]], [-0.6, VEIL[1]], [1.6, VEIL[2]]]) p.fline(waist.x + o * 0.7, waist.y, ch.x + o, ch.y + 2.5, c);
  const hx0 = ch.x + 1.2 + L * 3, hy0 = ch.y + 1.2;
  ell(p, hx0, hy0, 2.6, 3, ['#05030a', '#0c0816']);
  if (g.fine) { for (const [dx, dy, c] of [[0, 0, VG[2]], [0, -1, VG[1]], [0, 1, VG[1]], [-1, 0, VG[0]], [1, 0, VG[0]]]) g.px(hx0 + dx, hy0 + dy, c); }
  crystal(p, g, hx0 - 0.5, hy0 + 2.2, -Math.PI / 2 + 0.2, 5, 1.4, { lit: 1 });
  for (let r = 0; r < 3; r++) {
    const ry = hy0 - 2 + r * 1.8;
    if (p.fine) {
      p.fline(hx0 - 3, ry + 0.4, hx0 - 1.2, ry - 0.2, BONE_V[4]); p.fline(hx0 + 1.2, ry - 0.2, hx0 + 3, ry + 0.4, BONE_V[3]);
      p.fline(hx0 - 3, ry + 0.9, hx0 - 1.2, ry + 0.4, BONE_V[1]);
    } else { p.px(hx0 - 2, ry, BONE_V[4]); p.px(hx0 + 2, ry, BONE_V[3]); }
  }
  // Schulterschleier: zwei spitze Zipfel nach hinten
  for (const [sx, sy, a] of [[shB.x - 1, shB.y, -2.5], [shF.x - 0.5, shF.y - 0.5, -2.1]]) {
    const aa = a - P.drift * 0.25, ex = sx + Math.cos(aa) * 5, ey = sy + Math.sin(aa) * 5;
    poly(p, [[sx - 1, sy + 1], [ex, ey], [sx + 1.5, sy]], VEIL[4]);
    if (p.fine) { p.fline(sx - 1, sy + 0.5, ex, ey, VEIL[6]); p.dot(ex, ey, VEIL[6]); }
  }
  // --- Kopf: Kapuze aus Schleier, davor eine glatte Porzellanmaske mit Riss
  const hx = ch.x + 2.5 + L * 3 + P.head, hy = ch.y - 7 + P.headY;
  poly(p, [[hx - 3.8, hy + 3.5], [hx - 3, hy - 3], [hx - 5 - P.drift * 3, hy - 7.5], [hx + 1, hy - 4.5], [hx + 3.5, hy - 1], [hx + 3, hy + 3.5]], (x, y) => VEIL[(y < hy - 3 ? 4 : 3) - (x > hx + 1 ? 1 : 0)]);
  // Maske: schmales Oval, Lichtkante links oben, Schatten rechts; mandelförmige Augenhöhlen
  ell(p, hx + 1.4, hy + 0.6, 2.2, 3.4, BONE_V.slice(1), { bias: 0.05 });
  if (p.fine) {
    p.fline(hx - 3, hy - 3, hx - 5 - P.drift * 3, hy - 7.5, VEIL[6]);
    for (let a = -2.5; a <= -0.6; a += 0.15) p.dot(hx + 1.4 + Math.cos(a) * 2.2, hy + 0.6 + Math.sin(a) * 3.4, BONE_V[5]);
    p.fline(hx + 1.6, hy + 3, hx + 2.8, hy + 2.2, BONE_V[1]);                                   // Kinnschatten
    rift(p, g, [[hx + 2.2, hy - 3.2], [hx + 1.9, hy - 1.8]], 0.7);                            // Haarriss über dem Auge
  }
  for (const ex of [hx + 0.4, hx + 2.6]) {
    if (p.fine) { p.fline(ex - 0.5, hy - 0.5, ex + 0.75, hy, '#08040e', 1); p.dot(ex - 0.25, hy + 0.5, BONE_V[2]); }
    else p.px(ex, hy, '#08040e');
    if (P.eye > 0.2) { p.px(ex, hy, P.eye > 1.2 ? MAW[4] : MAW[3]); g.px(ex, hy, VG[3]); if (p.fine) { p.dot(ex, hy - 0.25, '#ffffff'); g.dot(ex, hy - 0.25, VG[4]); } }
  }
  // Splitterkranz über dem Kopf, kreist mit t
  for (let i = 0; i < 3; i++) {
    const a = P.t * 0.8 + i * (Math.PI * 2 / 3), sx = hx + 0.5 + Math.cos(a) * 4.5, sy = hy - 7 + Math.sin(a) * 1.2;
    crystal(p, g, sx, sy + 1.2, -Math.PI / 2 + Math.cos(a) * 0.2, 2.6, 0.7, { lit: 1 });
  }
  meta.eye = { x: hx + 2, y: hy };
  meta.head = { x: hx - 1, y: hy - 10 };
  meta.mouth = { x: hx + 2, y: hy + 2 };

  // --- vorderer Arm
  if (X.smear) smearArc(p, g, shF.x, shF.y, X.smear[0], X.smear[1], 11, 19, [CRYS[3], CRYS[4], CRYS[5]], [VG[1], VG[2]], X.smear[2] ?? 1);
  if (X.smear2) smearArc(p, g, shB.x, shB.y, X.smear2[0], X.smear2[1], 10, 16, [MAW[1], MAW[2], MAW[3]], [VG[0], VG[1]], X.smear2[2] ?? 1);
  const armF = ik(shF.x, shF.y, ch.x + P.hFx, ch.y + P.hFy, 6.5, 7, 1);
  cap(p, shF.x, shF.y, armF.jx, armF.jy, 1.3, 1.0, VEIL);
  cap(p, armF.jx, armF.jy, armF.ex, armF.ey, 1.0, 0.9, VEIL);
  const tipF = wispClaw(p, g, armF.ex, armF.ey, P.aF, 13, false, 1 + P.flick);
  ell(p, shF.x, shF.y, 1.7, 1.5, VEIL.slice(2));
  meta.hand = { x: armF.ex, y: armF.ey };
  meta.tip = tipF; meta.tipB = tipB;
  return meta;
}

// ================================================================ Steppenräuber-Rig: Wahnsinniger Schürfer und Schattenelfen-Späherin
// Schürfer: gebeugter Bergmann in staubigem Kittel, Grubenhelm mit violett leuchtender Lampe, wirrer weißer Bart,
// ein Sack voller Leerenkristalle auf dem Rücken, Spitzhacke mit Kristallklinge statt Säbel.
// Späherin: schlanke Schattenelfe in Kapuzenmantel mit Silbersaum, langes Ohr, weißer Zopf, Langbogen mit
// Kristallgriff und Kristallpfeil statt Reiterbogen.

const COAT = ['#141019', '#231c2a', '#372d40', '#4e4358', '#6a5e72', '#8a7e90'];
const PSKIN = ['#2a1c22', '#4a323a', '#6e5054', '#94726e', '#b8968a', '#d6b8a8'];
const BEARD = ['#2a2830', '#55525c', '#8a8690', '#bcb8c0', '#e8e6ec'];
const LEATH = ['#1b110b', '#2e1d12', '#46301e', '#61442b', '#7e5a39', '#9c7349'];
const BURLAP = ['#1e1814', '#352a22', '#4e4032', '#6a5844', '#8a7458', '#a8916e'];
const IRON = ['#16161e', '#2c2c38', '#46465a', '#6a6a82', '#9898b0', '#d0d0e0'];
const HAFT = ['#26180e', '#3f2a18', '#5a3e24', '#7a5834', '#96703f'];
const CLOAK = ['#0e0a18', '#1c1430', '#2c2248', '#403466', '#5a4c88', '#7e70b0'];
const SILVER = ['#3a3e54', '#6a7090', '#a4aac4', '#e2e6f6'];
const ESKIN = ['#2a2434', '#4a4058', '#6e6280', '#958aa8', '#bcb2cc', '#e0d8ec'];
const EHAIR = ['#4a4658', '#8a86a0', '#c4c0d8', '#f4f2fc'];

// Spitzhacke: Stiel entlang a von der Hand, Kopf quer am Ende (vorn Kristallklinge, hinten Eisenspitze)
function pickaxe(p, g, hx, hy, a) {
  const { cap, poly } = STEPPE_KIT;
  const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
  const ex = hx + dx * 9, ey = hy + dy * 9;
  cap(p, hx - dx * 2.5, hy - dy * 2.5, ex, ey, 0.75, 0.7, HAFT);
  if (p.fine) { p.fline(hx - dx * 2 - nx * 0.4, hy - dy * 2 - ny * 0.4, ex - nx * 0.4, ey - ny * 0.4, HAFT[4]); for (let s = -1.5; s < 1.5; s += 0.6) p.dot(hx + dx * s, hy + dy * s, LEATH[1]); }
  // Kopf: Eisenhülse, nach hinten Eisenspitze, nach vorn (Schlagrichtung = Normale) Kristallklinge
  const sgn = -1;   // Schlag geht zur Außenseite des Bogens
  poly(p, [[ex - dx + nx, ey - dy + ny], [ex + dx * 1.2 + nx, ey + dy * 1.2 + ny], [ex + dx * 1.2 - nx, ey + dy * 1.2 - ny], [ex - dx - nx, ey - dy - ny]], IRON[3]);
  poly(p, [[ex - nx * sgn * 1, ey - ny * sgn * 1], [ex - nx * sgn * 5 - dx * 1.5, ey - ny * sgn * 5 - dy * 1.5], [ex - nx * sgn * 1 + dx, ey - ny * sgn * 1 + dy]], IRON[2]);
  if (p.fine) { p.fline(ex - dx + nx, ey - dy + ny, ex + dx + nx, ey + dy + ny, IRON[5]); p.dot(ex - nx * sgn * 4.5 - dx * 1.2, ey - ny * sgn * 4.5 - dy * 1.2, IRON[5]); }
  const tip = crystal(p, g, ex + nx * sgn * 1, ey + ny * sgn * 1, Math.atan2(ny * sgn, nx * sgn) + 0.25, 6, 1.4, { lit: 1 });
  return tip;
}

// Langbogen: schlanker, hoher Bogen aus dunklem Holz, Silberspitzen, Kristall am Griff; Sehne, Pfeil mit Kristallspitze
function elfBow(p, g, hx, hy, a, draw, nock, arrow) {
  const ax = Math.sin(a), ay = -Math.cos(a), fx = Math.cos(a), fy = Math.sin(a), fine = p.fine;
  const bend = 0.055 + draw * 0.05;
  let top = null, bot = null;
  for (let s = -8.5; s <= 8.5; s += fine ? 0.25 : 0.5) {
    const as = Math.abs(s), b = -(s * s) * bend * 0.5 + (as > 7 ? (as - 7) * 0.9 : 0);
    const x = hx + ax * s + fx * b, y = hy + ay * s + fy * b, tip = as > 7.5;
    if (s === -7.5) top = [x, y]; if (s === 7.5) bot = [x, y];
    if (fine) {
      p.dot(x, y, tip ? SILVER[3] : as < 1 ? CRYS[3] : HAFT[3]); p.dot(x + fx * 0.5, y + fy * 0.5, tip ? SILVER[1] : as < 1 ? CRYS[2] : HAFT[1]);
      if (!tip && as > 1 && Math.abs(as - 4) < 0.13) p.dot(x, y, SILVER[2]);
    } else p.px(x, y, tip ? SILVER[2] : HAFT[2]);
  }
  crystal(p, g, hx - fx * 0.5, hy - fy * 0.5 + 1, -Math.PI / 2 + a, 2.2, 0.8, { lit: 0.8 });
  const sx = nock ? nock.x : (top[0] + bot[0]) / 2 - fx * 1.2, sy = nock ? nock.y : (top[1] + bot[1]) / 2 - fy * 1.2;
  const ln = fine ? (x0, y0, x1, y1, c) => p.fline(x0 + 0.25, y0 + 0.25, x1 + 0.25, y1 + 0.25, c) : p.line.bind(p);
  ln(top[0], top[1], sx, sy, '#d8d4ec'); ln(sx, sy, bot[0], bot[1], '#d8d4ec');
  let tipPt = { x: hx + fx * 2, y: hy + fy * 2 };
  if (arrow && nock) {
    const tx = hx + fx * 3, ty = hy + fy * 3;
    ln(nock.x, nock.y, tx, ty, SILVER[2]);
    const t = crystal(p, g, tx, ty, a, 2.5, 0.7, { lit: 1 });
    g.px(t.x, t.y, VG[3]);
    if (fine) { p.dot(nock.x - 0.5, nock.y - 1, CLOAK[5]); p.dot(nock.x - 0.5, nock.y + 0.5, CLOAK[3]); p.dot(nock.x - 1, nock.y - 0.5, SILVER[3]); }
    tipPt = t;
  }
  return tipPt;
}

function drawStarRaider(p, g, P, X, archer) {
  const { ell, cap, poly, smearArc, dust, rig, strokes, mantle, RS, RD } = STEPPE_KIT;
  const R = rig(P, RD, RS.AX, RS.AY);
  const { hip, pt, legF, legB, shF, shB, armF, armB } = R;
  const meta = {};
  const neck = pt(RD.spine + 2, 0.5);
  const hx = Math.round(neck.x + P.head + (archer ? 0 : 0.5)), hy = Math.round(neck.y - 3 + (archer ? 0 : 0.5));
  const SK = archer ? ESKIN : PSKIN, CL = archer ? CLOAK : COAT;

  // --- 1. hinten: Mantel (Späherin) bzw. Kristallsack (Schürfer)
  if (archer) mantle(p, pt(RD.spine + 0.5, -1.5), 6, 13, P, [CLOAK[0], CLOAK[1], CLOAK[2], CLOAK[3], CLOAK[4], SILVER[2]], 9, 0.7);
  else {
    const sk = pt(RD.spine - 2.5, -3.8);
    for (const [dx, dy, a, l] of [[-1.5, -2, -2.2, 6], [0.5, -2.8, -1.75, 8], [2, -2, -1.35, 5]]) crystal(p, g, sk.x + dx, sk.y + dy, a, l, 1.3, { lit: 0.9 });
    ell(p, sk.x, sk.y, 3.4, 3.8, BURLAP);
    if (p.fine) {
      for (let k = -2; k <= 2; k += 1) p.fline(sk.x + k * 0.9 - 0.5, sk.y - 3, sk.x + k * 1.1, sk.y + 3.2, k < 0 ? BURLAP[4] : BURLAP[1]);
      p.fline(sk.x - 3, sk.y - 2.5, sk.x + 2.5, sk.y - 3.2, LEATH[4]);              // Zugschnur
      p.dot(sk.x - 1.5, sk.y + 1, BURLAP[0]); p.dot(sk.x + 1, sk.y + 2, BURLAP[0]); // Flicken-Naht
    }
  }

  // --- 2. hinteres Bein, hinterer Arm
  cap(p, hip.x - 1, hip.y, legB.jx, legB.jy, archer ? 1.4 : 1.7, archer ? 1.2 : 1.4, CL.slice(0, 4));
  cap(p, legB.jx, legB.jy, legB.ex, legB.ey - 1.5, 1.25, 1.2, LEATH.slice(0, 4));
  p.rect(legB.ex - 1, legB.ey - 1, 3, 1, LEATH[0]);
  cap(p, shB.x, shB.y, armB.jx, armB.jy, 1.2, 1.0, CL.slice(0, 4));
  cap(p, armB.jx, armB.jy, armB.ex, armB.ey, 1.0, 0.9, SK.slice(0, 4));

  // --- 3. Rumpf
  const hp = pt(0, 0), cp = pt(RD.spine, 0.3);
  if (archer) {
    // eng anliegender Wams, Silbersaum, Gürtel mit Kristallschnalle
    cap(p, hp.x, hp.y, cp.x, cp.y, 2.3, 2.7, CLOAK);
    if (p.fine) {
      for (let u = 1; u <= 7; u += 0.5) { const o = pt(u, 1.2); p.dot(o.x, o.y, SILVER[u < 4 ? 2 : 1]); }
      for (let k = -2; k <= 2; k += 0.5) { const o = pt(1.4, k); p.dot(o.x, o.y, LEATH[2]); const o2 = pt(1.9, k); p.dot(o2.x, o2.y, LEATH[4]); }
      const b = pt(1.6, 1.2); p.dot(b.x, b.y, CRYS[4]); g.dot(b.x, b.y, VG[2]);
    }
    // Rockschöße: zwei spitze Bahnen
    for (const [k, c] of [[-1.5, CLOAK[2]], [1.2, CLOAK[3]]]) { const a = pt(0.5, k); poly(p, [[a.x - 1.2, a.y], [a.x + 1.2, a.y], [a.x - 0.5 - P.cape * 2, a.y + 5]], c); if (p.fine) p.fline(a.x - 1.2, a.y, a.x - 0.5 - P.cape * 2, a.y + 5, SILVER[1]); }
  } else {
    // Kittel: fleckig, Riemen über der Brust, Werkzeuggürtel
    cap(p, hp.x, hp.y, cp.x, cp.y, 3.1, 3.3, COAT);
    for (let i = 0; i < 4; i++) {   // ausgefranster Kittelsaum
      const a = pt(-0.5, -2.6 + i * 1.7), l = 2.5 + (i & 1);
      p.rect(a.x - 0.5, a.y, 1.5, l, COAT[i & 1 ? 2 : 3]);
      if (p.fine) { p.dot(a.x + 0.5, a.y + l, COAT[1]); p.dot(a.x - 0.5, a.y + l - 0.5, COAT[4]); }
    }
    if (p.fine) {
      for (let u = 1.5; u <= 7.5; u += 0.5) { const o = pt(u, -2.5 + u * 0.7); p.dot(o.x, o.y, LEATH[4]); const o2 = pt(u - 0.4, -2.5 + u * 0.7 + 0.4); p.dot(o2.x, o2.y, LEATH[1]); }  // Riemen
      for (let k = -3; k <= 3; k += 0.5) { const o = pt(1.3, k); p.dot(o.x, o.y, LEATH[3]); }                                              // Gürtel
      const pa = pt(4.5, -1.5); p.dot(pa.x, pa.y, COAT[1]); p.dot(pa.x + 0.5, pa.y + 0.5, COAT[1]); p.dot(pa.x - 0.5, pa.y, COAT[5]);     // Flicken
      // Leerenbefall: Kristallsplitter brechen aus der Schulter
      const s0 = pt(RD.spine - 1.5, -1); crystal(p, g, s0.x, s0.y, -2.2 + P.lean, 3.5, 0.9, { lit: 0.8 });
    }
  }

  // --- 4. vorderes Bein
  cap(p, hip.x + 1, hip.y, legF.jx, legF.jy, archer ? 1.5 : 1.8, archer ? 1.3 : 1.5, archer ? CLOAK : COAT);
  cap(p, legF.jx, legF.jy, legF.ex, legF.ey - 1.5, 1.35, 1.3, LEATH);
  p.rect(legF.ex - 1, legF.ey - 1, archer ? 4 : 3.5, 1, LEATH[1]);
  if (p.fine) {
    p.fline(legF.jx - 1.25, legF.jy - 0.25, legF.jx + 1, legF.jy - 0.25, archer ? SILVER[2] : LEATH[5]);   // Stulpe
    p.fline(legF.ex - 1, legF.ey - 0.5, legF.ex + 2.5, legF.ey - 0.5, LEATH[0]);
    if (!archer) { const m = { x: (hip.x + legF.jx) / 2, y: (hip.y + legF.jy) / 2 }; p.dot(m.x, m.y, COAT[1]); p.dot(m.x + 0.5, m.y, COAT[5]); p.dot(m.x, m.y + 0.5, COAT[4]); }  // Knieflicken
  }

  // --- 5. Kopf
  ell(p, hx + 0.5, hy + 0.5, archer ? 2.9 : 3.1, archer ? 3.2 : 3.2, SK, { bias: 0.06 });
  const eyeOn = P.eye > 0.5;
  if (archer) {
    // Kapuze, darunter langes Ohr; Gesicht im Schatten, helle Augen
    if (p.fine) {
      p.fline(hx + 1.5, hy - 0.5, hx + 3.5, hy - 0.5, ESKIN[1]);
      if (eyeOn) { p.dot(hx + 2.5, hy, '#f0e8ff'); p.dot(hx + 3, hy, VG[3]); g.dot(hx + 3, hy, VG[3]); g.dot(hx + 2.5, hy, VG[1]); }
      else p.fline(hx + 2, hy + 0.5, hx + 3.5, hy + 0.5, ESKIN[0]);
      p.dot(hx + 4, hy + 1, ESKIN[5]); p.dot(hx + 4, hy + 1.5, ESKIN[3]);       // Nasenspitze
      p.dot(hx + 3, hy + 2.5, '#6a3a5a'); p.dot(hx + 2.5, hy + 2.5, ESKIN[1]);  // Mund
      p.fline(hx + 1.5, hy + 1.5, hx + 1, hy + 3, ESKIN[2]);                    // Wangenschatten
    } else if (eyeOn) { p.px(hx + 2, hy, '#f0e8ff'); g.px(hx + 2, hy, VG[2]); }
    // Ohr: lang, spitz nach hinten oben, aus der Kapuze
    poly(p, [[hx - 1, hy + 0.5], [hx - 5.5, hy - 3.5], [hx - 0.5, hy - 0.5]], ESKIN[3]);
    if (p.fine) { p.fline(hx - 1, hy, hx - 5.5, hy - 3.5, ESKIN[5]); p.fline(hx - 1, hy + 0.5, hx - 4.5, hy - 2.5, ESKIN[1]); }
    // Kapuze: spitz nach hinten, Silbersaum an der Öffnung
    poly(p, [[hx - 2.8, hy + 2.5], [hx - 2.5, hy - 2.5], [hx - 5.5 - P.cape * 2, hy - 6], [hx + 1, hy - 4.2], [hx + 3.6, hy - 2.5], [hx + 3.6, hy - 1.2], [hx + 0.5, hy - 1.8], [hx - 0.5, hy + 2.5]], (x, y) => CLOAK[y < hy - 3 ? 4 : 3]);
    if (p.fine) {
      p.fline(hx - 0.5, hy + 2.5, hx + 0.5, hy - 1.8, SILVER[2]); p.fline(hx + 0.5, hy - 1.8, hx + 3.6, hy - 1.2, SILVER[3]);
      p.fline(hx - 2.5, hy - 2.5, hx - 5.5 - P.cape * 2, hy - 6, CLOAK[5]); p.fline(hx - 2, hy - 1.5, hx - 2.5, hy + 2, CLOAK[1]);
      // weißer Zopf über die Schulter
      for (let j = 0; j < 5; j++) { const x = hx + 0.5 - j * 0.3, y = hy + 3 + j * 0.9; p.dot(x, y, EHAIR[j & 1 ? 2 : 3]); p.dot(x + 0.5, y, EHAIR[1]); }
    }
    meta.head = { x: hx, y: hy - 7 };
  } else {
    // Gesicht: hager, ein irr aufgerissenes Auge, eines glüht violett; wirrer Bart
    if (p.fine) {
      if (eyeOn) {
        p.dot(hx + 1.5, hy, '#f2ecf0'); p.dot(hx + 2, hy, '#140810');                 // weit aufgerissen
        p.dot(hx + 3, hy, MAW[3]); p.dot(hx + 3.5, hy, MAW[4]); g.dot(hx + 3, hy, VG[3]); g.dot(hx + 3.5, hy, VG[4]); g.dot(hx + 4, hy, VG[1]);
      } else p.fline(hx + 1.5, hy + 0.5, hx + 3.5, hy + 0.5, PSKIN[0]);
      p.fline(hx + 1, hy - 0.5, hx + 2, hy - 1, BEARD[3]); p.dot(hx + 3, hy - 0.5, BEARD[2]);  // buschige Braue
      p.dot(hx + 4, hy + 0.5, PSKIN[5]); p.dot(hx + 4.5, hy + 1, PSKIN[4]); p.dot(hx + 4, hy + 1.5, PSKIN[2]);   // Knollennase
      p.dot(hx + 1, hy + 1, PSKIN[1]); p.dot(hx + 1.5, hy + 1.5, PSKIN[2]);                                       // eingefallene Wange
    } else if (eyeOn) { p.px(hx + 3, hy, MAW[3]); g.px(hx + 3, hy, VG[3]); }
    const jw = Math.round(P.jaw * 1.5);
    // Bart: zottelige Strähnen nach unten, beim Schreien offener Mund
    ell(p, hx + 2.2, hy + 3 + jw / 2, 2.6, 2 + jw / 2, BEARD, { bias: 0.1 });   // Bartmasse
    if (p.fine) for (let i = 0; i < 4; i++) {                                     // einzelne Zotteln mit hellen Kanten
      const bx = hx + 0.8 + i * 1.1, l = 3 + hash2(i, 1, 33) * 1.5 + jw, by = hy + 2;
      p.fline(bx, by, bx - 0.4, by + l, BEARD[i & 1 ? 2 : 4]); p.dot(bx - 0.5, by + l + 0.5, BEARD[1]);
    }
    if (jw) { p.rect(hx + 2.5, hy + 2, 1.5, jw, '#1a0810'); if (p.fine) p.dot(hx + 3, hy + 2, '#d8d0c0'); }
    // Grubenhelm: Eisenkuppel mit Krempe, vorn Lampe (violettes Leerenlicht)
    ell(p, hx + 0.3, hy - 2.6, 3.6, 2.4, IRON, { bias: 0.05 });
    p.rect(hx - 3.5, hy - 1.2, 8, 1, IRON[2]);
    const lx = hx + 3.5, ly = hy - 3;
    p.rect(lx - 0.5, ly - 1, 2, 2, LEATH[2]);
    p.px(lx + 1, ly - 0.5, MAW[3]); g.px(lx + 1, ly - 0.5, VG[3]); g.px(lx + 2, ly - 0.5, VG[1]);
    if (p.fine) {
      p.fline(hx - 2.5, hy - 4, hx + 1.5, hy - 4.8, IRON[5]); p.fline(hx - 3.5, hy - 1.2, hx + 4.5, hy - 1.2, IRON[4]); p.fline(hx - 3.5, hy - 0.7, hx + 4.5, hy - 0.7, IRON[0]);
      p.dot(hx - 1.5, hy - 3, IRON[1]); p.dot(hx - 1, hy - 3.5, IRON[1]);   // Delle
      p.dot(lx + 1, ly - 0.5, '#ffffff'); p.dot(lx + 1.5, ly, MAW[4]); g.dot(lx + 1, ly - 0.5, VG[4]); g.dot(lx + 2.5, ly - 0.5, VG[2]); g.dot(lx + 3.5, ly - 0.5, VG[0]);
      // wirre Haare unter dem Helm
      for (let i = 0; i < 4; i++) p.fline(hx - 3 + i * 0.3, hy - 0.5, hx - 4 - i * 0.2, hy + 1 + i * 0.6, BEARD[i & 1 ? 2 : 3]);
    }
    meta.head = { x: hx, y: hy - 6 };
  }
  meta.eye = { x: hx + 2, y: hy };
  meta.mouth = { x: hx + 4, y: hy + 2 };

  // --- 6. vorderer Arm + Waffe
  const drawArm = () => {
    cap(p, shF.x, shF.y, armF.jx, armF.jy, archer ? 1.3 : 1.45, archer ? 1.1 : 1.25, CL);
    cap(p, armF.jx, armF.jy, armF.ex, armF.ey, archer ? 1.0 : 1.15, archer ? 0.95 : 1.05, archer ? CLOAK.slice(1) : SK);
    if (p.fine) {
      const mx = (shF.x + armF.jx) / 2, my = (shF.y + armF.jy) / 2;
      p.fline(mx - 1, my - 0.25, mx + 0.5, my + 0.25, CL[CL.length - 1]); p.fline(mx - 0.5, my + 0.5, mx + 1, my + 0.75, CL[1]);
      if (archer) { const bx = armF.jx + (armF.ex - armF.jx) * 0.5, by = armF.jy + (armF.ey - armF.jy) * 0.5; p.dot(bx, by - 0.5, SILVER[3]); p.dot(bx + 0.5, by, SILVER[1]); }
    }
  };
  const hand = (x, y) => { ell(p, x, y, 1.1, 1.1, SK); if (p.fine) { p.dot(x - 0.5, y - 0.5, SK[5]); p.dot(x + 0.5, y + 0.5, SK[1]); } };
  if (archer) {
    drawArm();
    const nock = P.draw > 0.02 || P.arrow > 0.5 ? { x: armB.ex, y: armB.ey } : null;
    const tip = elfBow(p, g, armF.ex, armF.ey, P.bowA, P.draw, nock, P.arrow > 0.5);
    hand(armF.ex, armF.ey);
    if (nock) hand(armB.ex, armB.ey);
    meta.hand = tip;
  } else {
    if (X.smear) smearArc(p, g, shF.x, shF.y + 1, X.smear[0], X.smear[1], 6, 16, [CRYS[3], CRYS[4], '#f4ecff'], [VG[1], VG[2]], X.smear[2] ?? 1);
    drawArm();
    const tip = pickaxe(p, g, armF.ex, armF.ey, P.wa);
    hand(armF.ex, armF.ey);
    meta.hand = { x: armF.ex, y: armF.ey };
    meta.tip = tip;
  }
  if (X.dust) dust(p, RS.AX + X.dust, RS.AY, 7, 3, [BURLAP[2], BURLAP[3], CRYS[4], BURLAP[1]], 12);
  return meta;
}

// ================================================================ Gläserner Gefangener (Rig: Aschegeist)
// In Glas erstarrte, verhüllte Trauergestalt der Gläsernen Hallen: Kapuze, Faltenwurf und Körper aus kaltem Glas
// mit harten Glanzstreifen; hinter dem Brustglas die gefangene Seele (violette Flamme); an den Handgelenken
// Eisenschellen mit gesprengten Kettengliedern, Krallen aus Glassplittern. Statt Beinen eine Schleppe, die nach
// unten in schwebende Scherben zerfällt. Augen magenta, darunter eine Lichtträne.

const GLS = ['#080a1a', '#10142e', '#1a2248', '#283466', '#3a4c88', '#5a74ae', '#94b4dc', '#e4f0ff'];
const GLS_D = ['#0a0a1a', '#12142c', '#1c2044', '#28305c', '#384274'];
const GLS_FACE = ['#3a4680', '#5e72a8', '#8ca4cc', '#bcd0ea', '#eef6ff'];
const GLS_CRYS = ['#10142c', '#22305a', '#3a5088', '#6a88c0', '#a8c4ea', '#f4faff'];
const GLS_CRYS_D = ['#0c0e20', '#181e3c', '#26305a', '#3a4a7c', '#5468a0', '#7a92c6'];
const SMEAR_GLASS = ['#4a4a8a', '#a8b4e8', '#f4f6ff'];
const SOUL_HOLE = ['#0a0612', '#140a24', '#20103a'];

// Facettierter Glaskörper: Ellipse aus Dreiecksflächen um einen Scheitel oben links, jede Fläche eine Stufe nach
// ihrer Lage zum Licht, Grate hell auf der Licht-, dunkel auf der Schattenseite (geschliffenes Glas statt glatter Form).
function facetBlob(p, cx, cy, rx, ry, rot, n, seed, R) {
  const { ell, poly } = WASTES_KIT;
  ell(p, cx, cy, rx, ry, R, { rot });
  const c = Math.cos(rot), s = Math.sin(rot), V = [];
  for (let i = 0; i < n; i++) {
    const a = ((i + hash2(i, 1, seed) * 0.45) / n) * Math.PI * 2, k = 0.9 + hash2(i, 2, seed) * 0.1;
    const u = Math.cos(a) * rx * k, v = Math.sin(a) * ry * k;
    V.push([cx + u * c - v * s, cy + u * s + v * c]);
  }
  const A = [cx - rx * 0.2, cy - ry * 0.3], top = R.length - 2;
  for (let i = 0; i < n; i++) {
    const a = V[i], b = V[(i + 1) % n];
    const mx = (a[0] + b[0]) / 2 - cx, my = (a[1] + b[1]) / 2 - cy, l = Math.hypot(mx, my) || 1;
    const t = 0.5 + 0.5 * ((mx / l) * -0.6 + (my / l) * -0.8);
    poly(p, [A, a, b], R[Math.max(1, Math.min(top, Math.round(1 + t * (top - 1))))]);
  }
  for (const a of V) {
    const lit = (a[0] - cx) * -0.6 + (a[1] - cy) * -0.8 > 0;
    if (p.fine) p.fline(A[0], A[1], a[0], a[1], lit ? R[top] : R[1]); else p.line(A[0], A[1], a[0], a[1], lit ? R[top] : R[1]);
  }
  if (p.fine) p.dot(A[0], A[1], R[top + 1]); else p.px(A[0], A[1], R[top + 1]);
  return A;
}

// Facettierte Schleppe: Querschnitte entlang der Mittellinie, je Abschnitt eine helle obere und eine dunkle untere
// Fläche mit Grat dazwischen, Kerben zwischen den Abschnitten.
function facetChain(p, pts, R) {
  const { poly } = WASTES_KIT;
  const E = pts.map(([x, y, r], i) => {
    const q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
    let nx = -(q[1] - o[1]), ny = q[0] - o[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    if (nx * -0.6 + ny * -0.8 < 0) { nx = -nx; ny = -ny; }
    return { U: [x + nx * r, y + ny * r], M: [x + nx * r * 0.2, y + ny * r * 0.2], L: [x - nx * r, y - ny * r] };
  });
  for (let i = 0; i < E.length - 1; i++) {
    const a = E[i], b = E[i + 1], alt = i & 1;
    poly(p, [a.U, b.U, b.M, a.M], R[5 - alt]);
    poly(p, [a.M, b.M, b.L, a.L], R[3 - alt]);
    if (p.fine) { p.fline(a.M[0], a.M[1], b.M[0], b.M[1], R[6]); if (i) p.fline(a.M[0], a.M[1], a.L[0], a.L[1], R[1]); }
  }
}

function drawGlassPrisoner(p, g, P, ex) {
  const { ell, cap, poly, ik, arcSmear, occlude, AW } = WASTES_KIT;
  const { AX, AY } = AW;
  const meta = {};
  const fl = (x0, y0, x1, y1, c) => (p.fine ? p.fline(x0, y0, x1, y1, c) : p.line(x0, y0, x1, y1, c));
  const dt = (x, y, c) => (p.fine ? p.dot(x, y, c) : p.px(x, y, c));
  const heat = P.heat;
  const waist = { x: AX + P.x, y: AY - P.hover - P.bob };
  const lean = P.lean;
  const ch = { x: waist.x + Math.sin(lean) * 11, y: waist.y - Math.cos(lean) * 11 };
  const shF = { x: ch.x + 3.5, y: ch.y - 4 }, shB = { x: ch.x - 3.5, y: ch.y - 5 };
  // Glanzstreifen an der Lichtseite einer Kapsel (Licht von links oben)
  const sheen = (x0, y0, x1, y1, r, c = GLS[7], c2 = GLS[6]) => {
    let nx = -(y1 - y0), ny = x1 - x0; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    if (nx * -0.6 + ny * -0.8 < 0) { nx = -nx; ny = -ny; }
    const o = r * 0.55;
    fl(x0 + nx * o, y0 + ny * o, x1 + nx * o * 0.8, y1 + ny * o * 0.8, c2);
    if (p.fine) p.fline(x0 + nx * (o + 0.5), y0 + ny * (o + 0.5), x0 + (x1 - x0) * 0.5 + nx * (o + 0.5), y0 + (y1 - y0) * 0.5 + ny * (o + 0.5), c);
  };
  // Faltenwurf aus Glas: harte Bahnen, oben im Licht
  const folds = (cx, top) => (x, y) => GLS[y < top ? 4 : 3];

  const arm = (sh, tx, ty, back) => {
    const R = back ? GLS_D : GLS;
    const k = ik(sh.x, sh.y, tx, ty, 8, 9, 1);
    const a = Math.atan2(k.ey - k.jy, k.ex - k.jx);
    // gesprungener Glasärmel: zwei spitze Zacken hängen vom Oberarm
    for (let i = 0; i < 2; i++) {
      const u = 0.35 + i * 0.35, sx = sh.x + (k.jx - sh.x) * u, sy = sh.y + (k.jy - sh.y) * u;
      const L = 3.5 + i * 1.5 + Math.sin(P.tail + i) * 0.5;
      poly(p, [[sx - 1.2, sy], [sx + 1, sy], [sx - 0.8 - P.drift * 1.5, sy + L]], back ? GLS_D[2] : GLS[i ? 3 : 4]);
      if (!back) fl(sx - 0.8, sy + 0.5, sx - 0.8 - P.drift * 1.2, sy + L - 1, GLS[6]);
    }
    cap(p, sh.x, sh.y, k.jx, k.jy, back ? 1.7 : 2, 1.4, R, { bias: back ? 0 : 0.04 });
    cap(p, k.jx, k.jy, k.ex, k.ey, 1.3, 1.1, R);
    if (!back) { sheen(sh.x, sh.y, k.jx, k.jy, 2); sheen(k.jx, k.jy, k.ex, k.ey, 1.3, GLS[6], GLS[5]); }
    // Splitterklaue: drei Glassplitter als Finger
    for (let i = -1; i <= 1; i++) {
      const aa = a + 0.2 + i * (0.3 + P.claw * 0.45);
      crystal(p, null, k.ex, k.ey, aa, (back ? 4 : 5.5) - Math.abs(i) * 0.8, back ? 0.8 : 1, { lit: 0, R: back ? GLS_CRYS_D : GLS_CRYS });
    }
    ell(p, k.ex, k.ey, 1.5, 1.3, R);
    // Eisenschelle mit gesprengter Kette (schwingt nach)
    const sx = k.jx + (k.ex - k.jx) * 0.7, sy = k.jy + (k.ey - k.jy) * 0.7;
    ell(p, sx, sy, 2, 1.1, back ? IRON.slice(0, 4) : IRON, { rot: a + Math.PI / 2 });
    if (!back && p.fine) { const c = Math.cos(a + Math.PI / 2), s2 = Math.sin(a + Math.PI / 2); p.fline(sx - c * 1.5 - 0.3, sy - s2 * 1.5, sx + c * 1.5 - 0.3, sy + s2 * 1.5, IRON[5]); }
    let lx = sx - 0.5, ly = sy + 1.5;
    for (let i = 0; i < (back ? 2 : 3); i++) {
      const sw = Math.sin(P.tail * 1.4 + i * 0.9) * 0.6 - P.drift * 0.8;
      const nx = lx + sw, ny = ly + 1.6;
      if (p.fine) {
        if (i & 1) { p.rect(nx - 0.5, ny - 1, 1, 2, IRON[back ? 1 : 3]); p.dot(nx - 0.5, ny - 1, IRON[back ? 2 : 5]); }
        else { p.rect(nx - 1, ny - 0.5, 2, 1, IRON[back ? 1 : 2]); p.dot(nx - 0.5, ny - 0.5, IRON[0]); p.dot(nx - 1, ny - 0.5, IRON[back ? 2 : 4]); }
      } else p.px(nx, ny, IRON[back ? 1 : 3]);
      lx = nx; ly = ny;
    }
    if (!back && p.fine) { p.dot(lx - 0.5, ly + 0.5, IRON[4]); p.dot(lx, ly + 1, IRON[2]); }   // gesprengtes Glied
    return { k, a };
  };

  // --- hinterer Arm
  const bArm = arm(shB, ch.x + P.hBx, ch.y + P.hBy, true);
  meta.handB = { x: bArm.k.ex, y: bArm.k.ey };

  // --- Schleppe: Glas, das nach unten in Scherben zerfällt
  const N = 9;
  let tx = waist.x, ty = waist.y;
  const tail = [];
  for (let i = 1; i <= N; i++) {
    const u = i / N;
    const nx = waist.x - u * (4 + P.drift * 12) + Math.sin(P.tail + u * 4) * u * 2.2;
    const ny = waist.y + Math.sin(u * Math.PI * 0.75) * (P.hover - 8 - P.drift * 3) + Math.sin(P.tail * 0.5 + u * 3) * u * 1.2;
    tail.push([tx, ty, nx, ny, u]);
    tx = nx; ty = ny;
  }
  const chain = [[waist.x, waist.y, 4.4]];
  for (const [, , x1, y1, u] of tail) { if (u > 0.5) break; chain.push([x1, y1, 4.4 * (1 - u) ** 1.2 + 0.5]); }
  for (let i = 0; i < chain.length - 1; i++) cap(p, chain[i][0], chain[i][1], chain[i + 1][0], chain[i + 1][1], chain[i][2], chain[i + 1][2], GLS);
  facetChain(p, chain, GLS);
  // Bruchkante (gezackt) und schwebende Scherben mit Abstand, nach unten kleiner
  const [, , ex4, ey4] = tail[3];
  const ta = Math.atan2(tail[4][3] - ey4, tail[4][2] - ex4);
  for (let i = -1; i <= 1; i++) crystal(p, null, ex4 + i * 1.2, ey4 - 0.5, ta + i * 0.5, 2.2 - Math.abs(i) * 0.6, 1.1, { lit: 0, R: GLS_CRYS });
  for (let i = 0; i < 6; i++) {
    const [x0, y0, x1, y1] = tail[Math.min(N - 1, 4 + i)];
    const da = Math.atan2(y1 - y0, x1 - x0);
    const sw = Math.sin(P.tail * 1.5 + i * 1.3);
    const bx = x0 + (hash2(i, 1, 51) - 0.5) * 4 - P.drift * i * 0.3, by = y0 + 1.5 + i * 0.7 + sw * 0.6;
    const L = 3.4 - i * 0.4, W = 1.3 - i * 0.14;
    crystal(p, null, bx, by, da + (hash2(i, 2, 51) - 0.5) * 1.4 + Math.PI * (i & 1), L, W, { lit: 0, R: i > 2 ? GLS_CRYS_D : GLS_CRYS });
  }

  // --- Rumpf: gebeugter Glaskörper, dahinter die gefangene Seele
  cap(p, waist.x, waist.y, ch.x, ch.y, 4.2, 5.6, GLS, { bias: 0.02 });
  facetBlob(p, ch.x - 0.5, ch.y, 6.6, 6.2, lean, 7, 61, GLS);
  crystal(p, null, ch.x - 4, ch.y - 2, -2.6 - lean * 0.4, 6.5, 1.6, { lit: 0, R: GLS_CRYS });          // Glasdornen am Rücken
  crystal(p, null, ch.x - 5, ch.y + 1.5, -2.9 - lean * 0.4, 4.5, 1.2, { lit: 0, R: GLS_CRYS_D });
  // Faltenwurf über Schultern und Rücken
  poly(p, [[shB.x - 2, shB.y - 1], [shF.x + 2, shF.y - 1], [ch.x - 1, ch.y + 5], [ch.x - 7 - P.drift * 3, ch.y + 7 + Math.sin(P.tail) * 1.5], [ch.x - 6, ch.y]], folds(ch.x, ch.y - 1));
  fl(shB.x - 2, shB.y - 1, ch.x - 6, ch.y, GLS[1]);
  fl(shB.x - 1, shB.y - 1.5, shF.x + 1, shF.y - 1.5, GLS[6]);
  for (let i = 0; i < 2; i++) {                                 // Faltenkanten: Schattenlinie mit Lichtgrat
    const fx = ch.x - 2 - i * 2.5, fy = ch.y - 3 + i;
    fl(fx, fy, fx - 2 - P.drift * 2 - i, fy + 7 + Math.sin(P.tail + i) * 0.8, GLS[1]);
    if (p.fine) p.fline(fx + 0.5, fy, fx - 1.5 - P.drift * 2 - i, fy + 6.5 + Math.sin(P.tail + i) * 0.8, GLS[5]);
  }
  for (let i = 0; i < 2; i++) {
    const bx = ch.x - 5 - i * 1.5 - P.drift * 2, by = ch.y + 5 + i;
    poly(p, [[bx - 0.8, by], [bx + 0.8, by], [bx - 1 - P.drift * 2, by + 3.5 + Math.sin(P.tail + i)]], GLS[2 + i]);
  }
  const hcx = ch.x + 1.5 + lean * 2, hcy = ch.y + 1.5;
  ell(p, hcx, hcy, 3, 3.8, SOUL_HOLE, { rot: lean });
  const fk = 0.85 + Math.sin(P.smoke * 2) * 0.12 + (heat - 1) * 0.6;
  poly(p, [[hcx - 2, hcy + 2.6], [hcx + 2, hcy + 2.6], [hcx + 1.5, hcy - 0.2], [hcx + 0.2 + Math.sin(P.smoke) * 0.7, hcy - 3 * fk], [hcx - 1.4, hcy - 0.6]], CRYS[3]);
  poly(p, [[hcx - 1, hcy + 2.2], [hcx + 1.1, hcy + 2.2], [hcx + 0.2 + Math.sin(P.smoke) * 0.4, hcy - 1.4 * fk]], CRYS[4]);
  dt(hcx, hcy + 1, '#ffffff'); dt(hcx + 0.5, hcy + 1, CRYS[5]);
  if (g.fine) { g.dot(hcx, hcy + 1, VG[4]); g.dot(hcx, hcy, VG[3]); g.dot(hcx + 0.5, hcy + 0.5, VG[3]); g.dot(hcx - 0.5, hcy + 1.5, VG[2]); g.dot(hcx + 0.5, hcy - 1, VG[1]); g.dot(hcx - 1, hcy + 0.5, VG[1]); g.dot(hcx + 1, hcy + 1.5, VG[1]); }
  else { g.px(hcx, hcy, VG[2]); g.px(hcx, hcy + 1, VG[3]); }
  fl(hcx - 2, hcy - 1, hcx + 1, hcy - 3.5, GLS[6]);           // Spiegelung auf dem Brustglas
  if (p.fine) p.fline(hcx - 1.5, hcy + 0.5, hcx - 0.5, hcy - 0.5, GLS[5]);
  rift(p, g, [[hcx + 1.5, hcy - 1.5], [hcx + 2.5, hcy - 3], [hcx + 2.2, hcy - 4.5]], 0.5 + (heat - 1));
  meta.chest = { x: hcx, y: hcy };

  // --- Kopf: Glaskapuze, gesprungene Gesichtsmaske, magenta Augen mit Lichtträne
  const hx = ch.x + 3.5 + lean * 3 + P.head, hy = ch.y - 9.5 + P.headY;
  poly(p, [[hx - 2, hy - 5.5], [hx - 7 - P.drift * 2, hy - 3.5], [hx - 9 - P.drift * 3, hy + 1 + Math.sin(P.tail) * 0.8], [hx - 7 - P.drift * 2, hy + 5], [hx - 3, hy + 4]], folds(hx, hy - 2));
  facetBlob(p, hx - 0.5, hy, 5.2, 5.4, 0, 7, 67, GLS);
  ell(p, hx + 2, hy + 0.8, 2.9, 3.6, ['#06040c', '#100a1a']);
  ell(p, hx + 3.4, hy + 1, 2.3, 3.1, GLS_FACE, { bias: 0.04 });
  const jo = P.jaw * 1.4;
  const ec = ex.hurt ? '#ffffff' : P.eye > 1.2 ? MAW[4] : MAW[3];
  if (p.fine) {
    p.fline(hx + 2, hy - 1, hx + 3.5, hy - 1.5, GLS_FACE[4]);                       // Stirnglanz
    p.fline(hx + 2.5, hy - 0.5, hx + 3.5, hy - 0.5, GLS_FACE[1]);                   // Braue (gesenkt, trauernd)
    p.dot(hx + 3, hy, ec); p.dot(hx + 3.5, hy, ex.hurt ? ec : MAW[2]);
    p.dot(hx + 4.5, hy + 0.5, GLS_FACE[4]); p.dot(hx + 5, hy + 1, GLS_FACE[3]); p.dot(hx + 4.5, hy + 1.5, GLS_FACE[1]);   // Nase
    p.dot(hx + 3, hy + 1, MAW[2]); p.dot(hx + 3, hy + 2, MAW[3]);                                                       // Lichtträne
    g.dot(hx + 3, hy, VG[4]); g.dot(hx + 3.5, hy, VG[3]); g.dot(hx + 3, hy + 1, VG[1]); g.dot(hx + 3, hy + 2, VG[2]);
    p.rect(hx + 3.5, hy + 2.5, 1.5, 0.5 + jo, '#100616'); if (jo > 0.4) g.rect(hx + 3.5, hy + 3, 1.5, jo, VG[0]);
    p.fline(hx + 1.5, hy - 1.5, hx + 2.5, hy + 0.5, GLS[1]); p.fline(hx + 2.5, hy + 0.5, hx + 2, hy + 2.5, GLS[1]);       // Sprung in der Maske
  } else {
    p.px(hx + 3, hy, ec); g.px(hx + 3, hy, VG[3]); p.px(hx + 3, hy + 1, MAW[2]);
    p.px(hx + 4, hy + 2, '#100616');
  }
  if (P.eye > 1.2) { g.px(hx + 2, hy, VG[1]); g.px(hx + 4, hy, VG[1]); }
  meta.eye = { x: hx + 3, y: hy };
  meta.head = { x: hx, y: hy - 5 };
  meta.mouth = { x: hx + 4, y: hy + 2.5 + jo };
  // --- vorderer Arm
  if (ex.smear) arcSmear(p, g, shF.x, shF.y, ex.smear[0], ex.smear[1], 13, 21, SMEAR_GLASS, 29, false);
  occlude(g);
  const fArm = arm(shF, ch.x + P.hFx, ch.y + P.hFy, false);
  occlude(null);
  ell(p, shF.x, shF.y, 2.2, 2, GLS, { bias: 0.1 });
  crystal(p, null, shF.x - 0.5, shF.y - 0.5, -2.2 - lean * 0.5, 4.2, 1.1, { lit: 0, R: GLS_CRYS });   // Splitter brechen aus der Schulter
  crystal(p, null, shF.x + 0.5, shF.y - 0.8, -1.7 - lean * 0.5, 2.6, 0.8, { lit: 0, R: GLS_CRYS });
  meta.hand = { x: fArm.k.ex + Math.cos(fArm.a) * 3, y: fArm.k.ey + Math.sin(fArm.a) * 3 };
  if (ex.smear2) arcSmear(p, g, shB.x, shB.y, ex.smear2[0], ex.smear2[1], 12, 18, SMEAR_GLASS, 31, false);
  return meta;
}

// Scherbenhaufen: zersprungene Statue, Maskenstück, Schelle; die Seele steigt auf und verlischt
function drawGlassRemains(p, g, k) {
  const { ell, AW } = WASTES_KIT;
  const { AX, AY } = AW, gy = AY;
  for (let i = 0; i < 10; i++) {
    const x = AX - 11 + hash2(i, 1, 71) * 22, a = -Math.PI / 2 + (hash2(i, 2, 71) - 0.5) * (i < 3 ? 1.2 : 2.6);
    const big = i < 3 ? 2 : 0;
    crystal(p, null, x, gy - 0.5, a, 2 + big + hash2(i, 3, 71) * 2.5, 0.9 + big * 0.25 + hash2(i, 4, 71) * 0.5, { lit: 0, R: i & 1 ? GLS_CRYS_D : GLS_CRYS });
  }
  ell(p, AX + 6.5, gy - 1.6, 2.2, 1.6, GLS_FACE, { rot: 0.3 });
  if (p.fine) { p.dot(AX + 6.5, gy - 2, '#100616'); p.fline(AX + 5.5, gy - 2.5, AX + 7, gy - 0.5, GLS[1]); }
  ell(p, AX - 7.5, gy - 1, 1.8, 1.2, IRON);
  if (p.fine) { p.dot(AX - 7.5, gy - 1, IRON[0]); p.rect(AX - 5.5, gy - 1, 1, 1, IRON[3]); p.rect(AX - 4, gy - 1.5, 1, 1, IRON[2]); }
  const s = 1 - k;
  if (s > 0.1) {
    const sx = AX + Math.sin(k * 6) * 0.8, sy = gy - 4 - k * 9;
    const { poly } = WASTES_KIT;
    poly(p, [[sx - s * 1.4, sy + 1.5], [sx + s * 1.4, sy + 1.5], [sx, sy - 2.5 * s]], CRYS[s > 0.5 ? 3 : 2]);
    p.px(sx, sy + 0.5, s > 0.5 ? CRYS[5] : CRYS[4]);
    g.px(sx, sy, VG[s > 0.5 ? 3 : 1]); g.px(sx, sy + 1, VG[s > 0.5 ? 2 : 0]);
  }
  return { eye: { x: AX + 7, y: gy - 2 }, head: { x: AX + 7, y: gy - 5 }, hand: { x: AX - 7, y: gy - 2 }, chest: { x: AX, y: gy - 3 } };
}

// ================================================================ Sternseherin (Rig: Aschepriester)
// Seherin der Sternwarte: nachtblaue Robe mit eingestickten Sternen und einem Sternbild, Silberstola, verbundene
// Augen mit Silberstickerei und leuchtendem Stirnstern, langes silbernes Haar, Mondsichel-Diadem. In der hinteren
// Hand schwingt ein Astrolabium an der Kette (statt Weihrauchfass), vorn sammelt sie einen Sternenfunken (statt
// Glutkugel); ihr Zauber zeichnet ein Sternbild als Siegel auf den Boden.

const NIGHT = ['#08081a', '#10122e', '#1a1e46', '#262e62', '#36427e', '#4c5c9e', '#6a7cbc'];
const NIGHT_HEM = ['#0a0820', '#140e34', '#20164a', '#2e1f60'];
const STEEL = ['#1e2236', '#3a3e54', '#6a7090', '#a4aac4', '#e2e6f6', '#ffffff'];
const STARLIGHT = ['#3a1a7a', '#7a5ad8', '#c8b8ff', '#ffffff'];
const MSKIN = ['#3a2c3a', '#6a5464', '#a08898', '#d0b8c4', '#f0e0e8', '#fff4f8'];   // mondbleiche Haut
const SMEAR_STAR = ['#4a3a9a', '#a898f0', '#f4f0ff'];

// Vierstrahliger Stern (Funkeln): Kern weiß, Strahlen nach außen dunkler; Leuchtebene darunter
function sparkle(p, g, x, y, r, glow = true) {
  const dt = (X, Y, c) => (p.fine ? p.dot(X, Y, c) : p.px(X, Y, c)), q = p.fine ? 0.5 : 1;
  for (let i = q; i <= r; i += q) {
    const c = i <= r * 0.4 ? STARLIGHT[3] : i <= r * 0.75 ? STARLIGHT[2] : STARLIGHT[1];
    dt(x + i, y, c); dt(x - i, y, c); dt(x, y + i, c); dt(x, y - i, c);
    if (glow && i <= r * 0.6) { const gc = VG[i <= r * 0.3 ? 3 : 1]; if (g.fine) { g.dot(x + i, y, gc); g.dot(x - i, y, gc); g.dot(x, y + i, gc); g.dot(x, y - i, gc); } else { g.px(x + i, y, gc); g.px(x - i, y, gc); } }
  }
  dt(x, y, '#ffffff');
  if (glow) { if (g.fine) g.dot(x, y, VG[4]); else g.px(x, y, VG[4]); }
}

// Sternenfunke in der Hand: Kugel aus Sternenlicht mit Strahlenkreuz, wächst mit r
function starOrb(p, g, x, y, r, ph) {
  if (r < 0.5) return;
  const { ell } = THRONE_KIT;
  ell(p, x, y, r * 0.8, r * 0.8, [STARLIGHT[0], STARLIGHT[1], STARLIGHT[2], STARLIGHT[3]], { bias: 0.15 });
  sparkle(p, g, x, y, r * 1.4 + Math.sin(ph * 2) * 0.5);
  for (let i = 0; i < 3; i++) {
    const a = ph * 0.8 + i * 2.1, rr = r + 1.5;
    const sx = x + Math.cos(a) * rr, sy = y + Math.sin(a) * rr * 0.7;
    if (p.fine) { p.dot(sx, sy, STARLIGHT[2]); g.dot(sx, sy, VG[2]); } else p.px(sx, sy, STARLIGHT[2]);
  }
  if (g.fine) for (let a = 0; a < 6.28; a += 0.5) g.dot(x + Math.cos(a) * r, y + Math.sin(a) * r, VG[1]);
}

// Astrolabium an der Kette: zwei gekreuzte Silberringe um einen Sternkern
function astrolabe(p, g, hx, hy, ang, ph) {
  const L = 7, x = hx + Math.sin(ang) * L, y = hy + Math.cos(ang) * L + 2;
  for (let i = p.fine ? 0.5 : 1; i < L; i += p.fine ? 0.5 : 1) {
    const t = i / L, c = p.fine ? ((i * 2) % 2 ? STEEL[1] : STEEL[3]) : (i % 2 ? STEEL[2] : STEEL[3]);
    if (p.fine) p.dot(hx + (x - hx) * t, hy + (y - 2 - hy) * t, c); else p.px(hx + (x - hx) * t, hy + (y - 2 - hy) * t, c);
  }
  const ring = (rx, ry, rot, lit, dark) => {
    const n = Math.ceil((rx + ry) * 4 * (p.fine ? 2 : 1)), c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, u = Math.cos(a) * rx, v = Math.sin(a) * ry;
      const X = x + u * c - v * s, Y = y + u * s + v * c, col = Math.sin(a) < -0.2 || Math.cos(a) < -0.6 ? lit : dark;
      if (p.fine) p.dot(X, Y, col); else p.px(X, Y, col);
    }
  };
  ring(3, 3, 0, STEEL[4], STEEL[2]);
  ring(3, 1.2, ph * 0.6 + 0.6, STEEL[3], STEEL[1]);
  sparkle(p, g, x, y, 1.5);
  return { x, y };
}

function drawStarSeer(p, g, P, ex) {
  const { ell, cap, poly, ik, robe, L, GL, AP } = THRONE_KIT;
  const { AX, AY } = AP;
  const meta = {};
  const gy = AY;
  const top = gy - 23 + P.bob;
  const x = AX + P.lean * 2;
  const sh = { x: x + 1 + P.lean * 3, y: top + 1 };
  const dt = (X, Y, c) => (p.fine ? p.dot(X, Y, c) : p.px(X, Y, c));

  // --- Sternbild-Siegel am Boden (Zauber): Ring aus Sternpunkten, verbunden zu einem Sternbild
  if (P.cast > 0.05) {
    const r = 6 + P.cast * 12, cx = AX + 2, cy = gy - 1;
    const n = Math.ceil(r * 5);
    for (let i = 0; i < n; i++) {
      if (i % 3 === 2) continue;
      const a = (i / n) * THRONE_KIT.TAU + P.fl * 0.15, xx = cx + Math.cos(a) * r, yy = cy + Math.sin(a) * r * 0.35;
      dt(xx, yy, i % 3 ? CRYS[3] : CRYS[4]); if (g.fine) g.dot(xx, yy, VG[1]); else g.px(xx, yy, VG[1]);
    }
    const S7 = [];
    for (let k = 0; k < 7; k++) { const a = k * 0.9 + 0.4 + P.fl * 0.15, rr = r * (0.35 + hash2(k, 1, 91) * 0.55); S7.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.35]); }
    for (let k = 0; k < 6; k++) { GL(p, S7[k][0], S7[k][1], S7[k + 1][0], S7[k + 1][1], CRYS[3]); if (g.fine) g.fline(S7[k][0], S7[k][1], S7[k + 1][0], S7[k + 1][1], VG[0]); }
    for (const [sx, sy] of S7) sparkle(p, g, sx, sy, 1 + P.cast * 1.2);
  }

  // Füße
  p.rect(AX - 4 + P.stepB, gy - 2, 4, 2, NIGHT[1]);
  // --- hinterer Ärmel + Astrolabium
  const hB = { x: sh.x + P.hBx, y: sh.y + P.hBy };
  cap(p, sh.x - 3, sh.y + 1, hB.x, hB.y, 2.4, 2.8, NIGHT.slice(0, 4));
  p.rect(hB.x - 1, hB.y + 1, 2, 2, MSKIN[2]);
  meta.censer = astrolabe(p, g, hB.x, hB.y + 2, P.cens, P.fl);

  // --- Robe: Nachtblau, eingestickte Sterne, Silbersaum
  robe(p, g, x, top, gy - 1, 5, 9.5, P.lean, P.hem, NIGHT, NIGHT_HEM, 83, 0);
  p.rect(AX + 1 + P.stepA, gy - 2, 4, 2, NIGHT[2]); p.px(AX + 4 + P.stepA, gy - 2, NIGHT[4]);
  const H = gy - 1 - top;
  const robeAt = (j, k) => [x + P.lean * (H - j) * 0.35 + k + Math.sin(P.hem + (j / H) * 2) * (j / H) * 1.4, top + j];
  // Saumborte: Silberlinie über dem dunklen Saum
  for (let k = -8; k <= 8; k += p.fine ? 0.5 : 1) {
    const j = H * 0.7, hw = 5 + 4.5 * Math.pow(0.7, 0.8);
    if (Math.abs(k) > hw) continue;
    const [X, Y] = robeAt(j, k);
    dt(X, Y, k < 0 ? STEEL[3] : STEEL[2]);
  }
  // eingestickte Sterne (fest auf dem Stoff) und ein Sternbild
  const stars = [[4, -2], [7, 2.5], [10, -3.5], [12, 1], [14.5, -1.5], [9, 4.5], [5.5, 3]];
  for (let i = 0; i < stars.length; i++) {
    const [j, k] = stars[i], [X, Y] = robeAt(j, k);
    const tw = Math.sin(P.fl * 1.5 + i * 1.7) > 0.6;
    if (p.fine) { p.dot(X, Y, tw ? '#ffffff' : STEEL[4]); if (tw) { p.dot(X - 0.5, Y, STEEL[3]); p.dot(X + 0.5, Y, STEEL[3]); g.dot(X, Y, VG[2]); } }
    else p.px(X, Y, STEEL[3]);
  }
  if (p.fine) for (let i = 0; i < 3; i++) { const a = robeAt(...stars[i]), b = robeAt(...stars[i + 1]); p.fline(a[0], a[1], b[0], b[1], NIGHT[5]); }
  // Silberstola mit Sternsteinen
  for (let j = 0; j < 19; j++) {
    const sx = x + 2.5 + P.lean * (2 - j * 0.12);
    p.px(sx, top + 3 + j, CLOAK[4]); p.px(sx + 1, top + 3 + j, CLOAK[2]);
    if (j % 6 === 3) { p.px(sx, top + 3 + j, CRYS[3]); g.px(sx, top + 3 + j, VG[1]); if (p.fine) { p.dot(sx, top + 3 + j, CRYS[5]); g.dot(sx, top + 3 + j, VG[3]); } }
    if (p.fine) { p.dot(sx, top + 3 + j, STEEL[3]); p.dot(sx + 1.5, top + 3 + j, STEEL[1]); }
  }
  // Gürtel: Silberkette
  for (let k = -5; k <= 5; k++) p.px(x + k + P.lean * 1.5, top + 9 + Math.abs(k) * 0.1, k < -1 ? STEEL[2] : STEEL[3]);
  if (p.fine) { const by = Math.round(top + 9); for (let k = -5; k <= 5; k++) { const xx = Math.round(x + k + P.lean * 1.5); p.dot(xx + 0.5, by + 0.5, STEEL[0]); p.dot(xx, by, k < -1 ? STEEL[3] : STEEL[4]); } }
  // Schulterumhang mit Silbersaum und Mondspange
  ell(p, sh.x - 0.5, sh.y + 1, 6, 2.6, NIGHT.slice(1), { bias: 0.08 });
  for (let k = -5; k <= 5; k += p.fine ? 0.5 : 1) dt(sh.x - 0.5 + k, sh.y + 3 - Math.abs(k) * 0.08, STEEL[k < 0 ? 3 : 2]);
  ell(p, sh.x + 2, sh.y + 1.5, 1.2, 1.2, STEEL.slice(1), { bias: 0.1 });
  dt(sh.x + 2.5, sh.y + 1.5, NIGHT[1]);

  // --- Kopf: Kapuze, silbernes Haar, verbundene Augen, Stirnstern, Mondsichel-Diadem
  const hx = sh.x + 1.5 + P.head, hy = top - 4;
  // Haar weht hinten aus der Kapuze
  for (let i = 0; i < 3; i++) {
    const bx = hx - 1 - i * 0.8, by = hy + 3;
    const tx = bx - 1.5 - P.wind * 2.5 - i * 0.3, ty = by + 7 + i * 1.2 + Math.sin(P.hem + i) * 0.6;
    L(p, bx, by, tx, ty, EHAIR[i === 1 ? 2 : 1]);
    if (p.fine && i !== 2) p.fline(bx + 0.5, by, tx + 0.5, ty - 1, EHAIR[3]);
  }
  ell(p, hx - 0.5, hy, 4.4, 4.4, NIGHT, { bias: 0.02 });
  poly(p, [[hx - 4, hy - 1], [hx - 6.5 - P.wind * 2, hy + 4 + P.wind], [hx - 2, hy + 3]], NIGHT[2]);
  GL(p, hx - 4, hy - 1.5, hx - 1.5, hy - 4, NIGHT[6]);
  ell(p, hx + 1.5, hy + 0.5, 2.8, 3.4, ['#04040c', NIGHT[0]]);
  // Gesicht im Profil (helle Haut), Haarsträhne an der Wange
  const fx = hx + 2.2, fy = hy - 1.5;
  poly(p, [[fx - 1, fy], [fx + 2.6, fy - 0.3], [fx + 3, fy + 2], [fx + 3.6, fy + 2.8], [fx + 2.8, fy + 3.3], [fx + 2.6, fy + 4.4], [fx + 1, fy + 5.4], [fx - 1, fy + 4.6]],
    (xx, yy) => (xx < fx + 0.3 ? MSKIN[2] : yy < fy + 2.5 ? MSKIN[4] : MSKIN[3]));
  // Augenbinde: dunkles Band mit gesticktem Silberauge
  p.rect(fx - 1, fy + 1, 4, 1.5, CLOAK[3]);
  if (p.fine) {
    p.fline(fx - 1, fy + 1, fx + 3, fy + 1, CLOAK[4]); p.fline(fx - 1, fy + 2.5, fx + 3, fy + 2.5, CLOAK[1]);
    p.dot(fx + 1.5, fy + 1.5, STEEL[4]); p.dot(fx + 1, fy + 2, STEEL[2]); p.dot(fx + 2, fy + 2, STEEL[2]);
    p.dot(fx + 3, fy + 2.8, MSKIN[5]); p.dot(fx + 2.5, fy + 4, MSKIN[1]);              // Nasenspitze, Mund
    p.fline(fx - 0.5, fy + 3, fx, fy + 5, EHAIR[2]);                                  // Strähne
  }
  // Stirnstern (das dritte Auge)
  const ec = ex.hurt ? '#ffffff' : P.eye > 0.3 ? CRYS[5] : CRYS[2];
  dt(fx + 1, fy + 0.2, ec);
  if (P.eye > 0.3) { if (g.fine) { g.dot(fx + 1, fy + 0.2, VG[4]); g.dot(fx + 0.5, fy + 0.2, VG[2]); g.dot(fx + 1.5, fy + 0.2, VG[2]); g.dot(fx + 1, fy - 0.3, VG[1]); } else g.px(fx + 1, fy, VG[3]); }
  meta.eye = { x: fx + 1, y: fy + 1.5 };
  // Mondsichel-Diadem über der Kapuze
  const mx = hx, my = hy - 3, cr = 3.8;
  const n = p.fine ? 28 : 14;
  for (let i = 0; i <= n; i++) {
    const a = Math.PI * (0.15 + 0.7 * (i / n)), th = Math.sin((i / n) * Math.PI) * 1.4;
    const X = mx + Math.cos(a + Math.PI) * cr, Y = my - Math.sin(a) * cr * 0.95 + 0.5;
    if (p.fine) { for (let o = 0; o <= th; o += 0.5) p.dot(X, Y - o, o < 0.5 ? STEEL[2] : o > th - 0.5 ? STEEL[4] : STEEL[3]); }
    else { p.px(X, Y, STEEL[3]); if (th > 0.8) p.px(X, Y - 1, STEEL[4]); }
  }
  sparkle(p, g, mx - 3.4, my - 1.6, 1.5);
  meta.head = { x: hx, y: hy - 11 };

  // --- vorderer Ärmel, Hand, Sternenfunke
  const hF = { x: sh.x + P.hFx, y: sh.y + P.hFy };
  const k = ik(sh.x + 1, sh.y + 1, hF.x, hF.y, 5.5, 5.5, P.hFy < 3 ? -1 : 1);
  cap(p, sh.x + 1, sh.y + 1, k.jx, k.jy, 2.4, 2.2, NIGHT, { rim: 1, bias: 0.12 });
  cap(p, k.jx, k.jy, k.ex, k.ey, 2.2, 3, NIGHT, { rim: 1, bias: 0.12 });
  p.px(k.ex, k.ey + 2, STEEL[3]); p.px(k.ex + 1, k.ey + 2, STEEL[4]);
  p.rect(k.ex, k.ey - 0.5, 2, 2, MSKIN[3]); p.px(k.ex + 1, k.ey - 1, MSKIN[4]);
  if (p.fine) {
    const ux = k.ex - k.jx, uy = k.ey - k.jy, ul = Math.hypot(ux, uy) || 1, nx = -uy / ul, ny = ux / ul;
    p.fline(k.jx + nx * -0.8 + ux * 0.2, k.jy + ny * -0.8 + uy * 0.2, k.jx + nx * -0.8 + ux * 0.8, k.jy + ny * -0.8 + uy * 0.8, NIGHT[6]);
    p.fline(k.jx + nx * 0.9 + ux * 0.25, k.jy + ny * 0.9 + uy * 0.25, k.jx + nx * 0.9 + ux * 0.8, k.jy + ny * 0.9 + uy * 0.8, NIGHT[1]);
    p.fline(sh.x + 1, sh.y + 2, k.jx - 0.5, k.jy, NIGHT[5]);
    const hx0 = Math.round(k.ex * 2) / 2, hy0 = Math.round((k.ey - 0.5) * 2) / 2;
    p.dot(hx0 + 0.5, hy0 + 0.5, MSKIN[1]); p.dot(hx0, hy0, MSKIN[5]);
  }
  meta.hand = { x: k.ex + 1, y: k.ey - 3 };
  if (P.ball > 0.3 && !ex.thrown) starOrb(p, g, k.ex + 1, k.ey - 2 - P.ball * 0.6, P.ball * 0.85, P.fl);
  if (ex.thrown) {
    const t = ex.thrown, ox = k.ex + 3 + t * 6, oy = k.ey - 1;
    starOrb(p, g, ox, oy, 2.2, P.fl);
    for (let i = 1; i < 4; i++) { const sx = ox - i * 2, sy = oy + (i % 2); dt(sx, sy, STARLIGHT[3 - i]); if (g.fine) g.dot(sx, sy, VG[2]); else g.px(sx, sy, VG[1]); }
    meta.hand = { x: ox, y: oy };
  }
  if (P.hB2 > 0.3) { p.rect(sh.x - 4, sh.y - 8 * P.hB2, 2, 2, MSKIN[3]); sparkle(p, g, sh.x - 3, sh.y - 9 * P.hB2, 2); }
  if (ex.smear) WASTES_KIT.arcSmear(p, g, sh.x, sh.y, ex.smear[0], ex.smear[1], 6, 11, SMEAR_STAR, 29, false);
  return meta;
}

// Zusammengesunkene Robe, Diadem und Astrolabium; der Stirnstern verlischt
function drawStarSeerCorpse(p, g, k) {
  const { ell, poly, AP } = THRONE_KIT;
  const { AX, AY } = AP, gy = AY - 1;
  for (let j = 0; j < 5; j++) {
    const hw = 12 - j * 1.8;
    for (let x = -hw; x <= hw; x++) {
      const t = 0.3 + (hw - x) / (2 * hw) * 0.5 - j * 0.02;
      p.px(AX + x, gy - j, (j < 2 ? NIGHT_HEM : NIGHT.slice(1, 5))[Math.max(0, Math.min(3, Math.floor(t * 4)))]);
    }
  }
  for (let x = -8; x <= 6; x++) p.px(AX + x, gy - 4 + Math.abs(x) * 0.05, STEEL[x % 3 === 0 ? 4 : 2]);
  for (const [sx, sy] of [[-6, -2], [-1, -3], [3, -1], [7, -2]]) p.px(AX + sx, gy + sy, STEEL[3]);
  for (let i = 0; i < 7; i++) p.px(AX + 9 + i, gy - 3 + Math.abs(i - 3) * 0.3, EHAIR[i & 1 ? 1 : 2]);
  ell(p, AX + 11, gy - 2.5, 2, 1.8, MSKIN.slice(1, 5));
  p.rect(AX + 10, gy - 3, 3, 1, CLOAK[3]);
  const s = 1 - k;
  if (s > 0.15) sparkle(p, g, AX + 11, gy - 4 - k * 4, 1 + s);
  ell(p, AX - 15, gy - 2, 3, 3, [STEEL[1], STEEL[2], STEEL[3]]);
  ell(p, AX - 15, gy - 2, 2, 2, [NIGHT[0], NIGHT[1]]);
  poly(p, [[AX + 16, gy], [AX + 20, gy - 3], [AX + 22, gy - 1], [AX + 19, gy]], STEEL[3]);
  return { eye: { x: AX + 11, y: gy - 3 }, hand: { x: AX + 8, y: gy - 2 }, head: { x: AX + 11, y: gy - 6 } };
}

// ================================================================ Dornenpriesterin (Rig: Reifhexe)
// Priesterin der Rankengruft: moosgrüne Robe, um die sich Dornenranken winden (zwei magentafarbene Blüten),
// Kragen aus großen Blättern, borkenfahle Haut, Haar aus hängendem Moos, Dornenkrone. Ihr Stab ist ein
// gewundener Dornenast mit einer Leerenblüte, um die beim Zauber Blütenblätter kreisen; das Bodenfeld lässt
// Dornen aus der Erde brechen.

const PROBE = ['#0a0e0c', '#121a16', '#1c2822', '#283830', '#364a3e', '#4a6050'];
const VINE = ['#0c120c', '#1a2818', '#2c4226', '#44603a', '#668650'];
const BSKIN = ['#1a1c1a', '#2e322c', '#4a5046', '#6c7462', '#949c86', '#c4c8b0'];
const MOSSH = ['#0c120c', '#182416', '#283a22', '#3c5230', '#567044'];
const DWOOD = ['#120c0e', '#22181a', '#342628', '#4a3a38', '#665048'];
const THORN_R = [0, '#1a1214', '#2e2226', 0, '#5a4646', '#cfc2a4'];
const LEAF_R = [0, '#12221a', '#1e3a26', 0, '#36603c', '#6e9e5e'];
const PETAL_R = [0, MAW[1], MAW[2], 0, MAW[3], MAW[4]];
const PETAL_G = [0, 0, 0, VG[2], VG[3], VG[4]];

// Kleine Blüte: fünf Blätter um einen leuchtenden Kern
function blossom(p, g, x, y, r = 1, lit = 1) {
  const { fd } = FROST_KIT;
  for (let i = 0; i < 5; i++) {
    const a = i * 1.2566 - 1.57, X = p.snap(x + Math.cos(a) * r), Y = p.snap(y + Math.sin(a) * r);
    fd(p, X, Y, i < 2 ? MAW[4] : MAW[3]); if (r > 1.2) fd(p, p.snap(x + Math.cos(a) * r * 0.5), p.snap(y + Math.sin(a) * r * 0.5), MAW[2]);
  }
  const X = p.snap(x), Y = p.snap(y);
  fd(p, X, Y, '#ffffff'); if (lit) { fd(g, X, Y, VG[4]); fd(g, X + 0.5, Y, VG[2]); fd(g, X, Y + 0.5, VG[2]); fd(g, X - 0.5, Y, VG[1]); }
}

// Dornenstab: gewundener Schwarzdornast mit Stacheln, oben eine Gabel, die die Leerenblüte hält
function drawThornStaff(p, g, hx, hy, a, cast, orbit) {
  const { put, fd, fl, shard } = FROST_KIT;
  const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
  let lx = nx, ly = ny; if (lx + ly > 0) { lx = -lx; ly = -ly; }
  const q = p.fine ? 0.25 : 1;
  for (let s = -13; s <= 9; s += q) {
    const w = Math.sin(s * 0.9) * 0.6;
    const x = hx + dx * s + nx * w, y = hy + dy * s + ny * w;
    put(p, x + lx * 0.5, y + ly * 0.5, (s * 4 | 0) % 9 === 0 ? DWOOD[2] : DWOOD[4]);
    put(p, x, y, DWOOD[2]);
    put(p, x - lx * 0.5, y - ly * 0.5, DWOOD[0]);
  }
  // Stacheln wechselseitig
  for (let s = -10, k = 0; s <= 7; s += 3.4, k++) {
    const sd = k & 1 ? 1 : -1, w = Math.sin(s * 0.9) * 0.6;
    const bx = hx + dx * s + nx * (w + sd * 0.6), by = hy + dy * s + ny * (w + sd * 0.6);
    if (p.fine) shard(p, null, bx, by, bx + nx * sd * 1.8 + dx * 0.8, by + ny * sd * 1.8 + dy * 0.8, 0.5, null, THORN_R);
    else p.px(bx + nx * sd, by + ny * sd, THORN_R[5]);
  }
  // Gabel und Blüte
  const cx = hx + dx * 11.5, cy = hy + dy * 11.5;
  for (const sd of [-1, 1]) {
    const x0 = hx + dx * 8.5, y0 = hy + dy * 8.5, x1 = cx + nx * sd * 2.4 + dx, y1 = cy + ny * sd * 2.4 + dy;
    if (p.fine) { fl(p, x0, y0, x1, y1, DWOOD[2], 0.5); fl(p, x0 + lx * 0.25, y0 + ly * 0.25, x1 + lx * 0.25, y1 + ly * 0.25, DWOOD[4]); shard(p, null, x1, y1, x1 + dx * 1.6 + nx * sd * 0.4, y1 + dy * 1.6 + ny * sd * 0.4, 0.45, null, THORN_R); }
    else p.line(x0, y0, x1, y1, DWOOD[3]);
  }
  const c0 = { x: cx + dx * 1.5, y: cy + dy * 1.5 };
  const glow = cast > 0.1;
  for (let i = 0; i < 6; i++) {
    const pa = a + (i - 2.5) * 0.62, len = 2.6 + (i === 2 || i === 3 ? 0.8 : 0) + cast * 0.6;
    if (p.fine) shard(p, glow ? g : null, c0.x, c0.y, c0.x + Math.cos(pa) * len, c0.y + Math.sin(pa) * len, 0.95, glow ? (cast > 0.7 ? 0.2 : 0.6) : null, PETAL_R, PETAL_G);
    else p.px(c0.x + Math.cos(pa) * 2, c0.y + Math.sin(pa) * 2, MAW[3]);
  }
  const X = p.snap(c0.x), Y = p.snap(c0.y);
  fd(p, X, Y, '#ffffff'); fd(p, X + 0.5, Y, MAW[4]); fd(p, X, Y + 0.5, MAW[4]); fd(p, X - 0.5, Y, CRYS[4]);
  fd(g, X, Y, VG[4]); fd(g, X + 0.5, Y, VG[3]); fd(g, X, Y + 0.5, VG[3]); fd(g, X - 0.5, Y, VG[2]); fd(g, X, Y - 0.5, VG[2]);
  if (cast > 0.4) {
    const r = 2.5 + cast * 3;
    for (let i = 0; i < 40; i++) {
      const aa = (i / 40) * Math.PI * 2 + orbit;
      if (i % 10 > 6) continue;
      fd(g, p.snap(c0.x + 0.5 + Math.cos(aa) * r), p.snap(c0.y + 0.5 + Math.sin(aa) * r), i % 10 < 3 ? VG[2] : VG[1]);
    }
  }
  // kreisende Blütenblätter
  for (let i = 0; i < 3; i++) {
    const aa = orbit + (i * Math.PI * 2) / 3;
    const ox = c0.x + Math.cos(aa) * (5 + cast * 2), oy = c0.y + Math.sin(aa) * (2.5 + cast);
    const front = Math.sin(aa) > 0, X2 = p.snap(ox), Y2 = p.snap(oy);
    fd(p, X2, Y2, front ? MAW[4] : MAW[2]); fd(p, X2 + 0.5, Y2 + 0.5, front ? MAW[3] : MAW[1]); fd(p, X2 - 0.5, Y2 + 0.5, MAW[2]);
    if (front) fd(g, X2, Y2, VG[2]);
  }
  return c0;
}

// Dornenfeld: Ring aus der Erde brechender Dornen, magentafarbener Leuchtsaum
function thornRing(p, g, cx, cy, r, s) {
  if (s <= 0.02) return;
  const { fd, shard } = FROST_KIT;
  const n = Math.ceil(r * 6);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, rr = r + (hash2(i, 5, 87) - 0.5) * 1.2;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.38;
    if (hash2(i, 6, 87) > s) continue;
    const X = p.snap(x), Y = p.snap(y);
    fd(g, X, Y, VG[1]); fd(g, X + 0.5, Y, VG[0]);
    if (i % 3 === 0) {
      const h = 2 + hash2(i, 7, 87) * 2.5, lean = (hash2(i, 8, 87) - 0.5) * 1.6;
      if (p.fine) shard(p, null, x, y + 0.5, x + lean, y - h, 0.8, null, THORN_R);
      else { p.px(x, y, DWOOD[3]); p.px(x, y - 1, THORN_R[5]); }
      fd(p, X, Y + 0.5, VINE[1]);
    }
  }
}

function drawThornPriest(p, g, P, X) {
  const { rig, HD, HAX, HAY, put, fd, fl, ell, volEll, limb, shard } = FROST_KIT;
  const K = P.kneel;
  const R = rig({ ...P, hipY: P.hipY + K * 5 }, HD, HAX, HAY);
  const { pt, legF, legB, shF, shB, armF, armB } = R;
  const meta = {};

  // --- Haar aus hängendem Moos, mit kleinen Blättern
  const neck = pt(HD.spine + 1.5, 1);
  const hx = Math.round(neck.x + P.head), hy = Math.round(neck.y - 3 + P.headY);
  for (let i = 0; i < 8; i++) {
    const len = 9 + (hash2(i, 1, 34) * 5 | 0) - K * 3;
    for (let j = 0; j < len - 0.25; j += p.fine ? 0.5 : 1) {
      const v = j / len;
      const x = hx - 2 - i * 0.5 - v * 3 + Math.sin(P.hairT + v * 3 + i * 0.7) * 1.2 * v, y = hy - 2 + j + i * 0.25;
      put(p, x, y, v < 0.2 ? MOSSH[4] : v > 0.78 ? MOSSH[0] : i % 3 === 2 ? MOSSH[1] : i % 2 ? MOSSH[2] : MOSSH[3]);
      if (p.fine && v < 0.7) put(p, x + 0.5, y, i % 3 === 2 ? MOSSH[0] : MOSSH[1]);
      if (p.fine && i % 3 === 1 && Math.abs(v - 0.55) < 0.04) { fd(p, p.snap(x - 0.5), p.snap(y), LEAF_R[4]); fd(p, p.snap(x - 1), p.snap(y + 0.5), LEAF_R[2]); }
    }
  }
  // --- hinterer Arm: Borkenhand mit Zweigfingern
  limb(p, shB.x, shB.y, armB.jx, armB.jy, 2.5, 2, [PROBE[0], PROBE[1], PROBE[1], PROBE[2]]);
  limb(p, armB.jx, armB.jy, armB.ex, armB.ey, 2, 1.5, [BSKIN[0], BSKIN[1], BSKIN[1], BSKIN[2]]);
  for (let i = 0; i < 3; i++) {
    const x0 = armB.ex + (i - 1) * 0.6 + P.claw * 0.5, y0 = armB.ey + 0.5;
    if (p.fine) fl(p, x0, y0, x0 + (i - 1) * 0.8 + P.claw, y0 + 1.8 + (i === 1 ? 0.5 : 0), i === 1 ? BSKIN[3] : BSKIN[2]);
    else p.px(armB.ex + i - 1 + P.claw, armB.ey + 1 + (i === 1 ? 1 : 0), BSKIN[2]);
  }
  if (P.claw > 0.3 || P.cast > 0.6) {
    for (let i = 0; i < 4; i++) { const aa = P.orbit * 1.7 + i * 1.6; fd(g, p.snap(armB.ex + Math.cos(aa) * 2), p.snap(armB.ey + Math.sin(aa) * 2), i % 2 ? VG[3] : VG[2]); }
    put(p, armB.ex, armB.ey, MAW[4]); fd(g, p.snap(armB.ex), p.snap(armB.ey), VG[4]);
  }

  // --- Füße
  for (const [L, c] of [[legB, PROBE[0]], [legF, PROBE[1]]]) { p.rect(L.ex - 1, L.ey - 1, 3, 1, c); p.px(L.ex + 1, L.ey - 1, '#241a1c'); }

  // --- Robe (A-Linie, Bahnen in Stufen, zweifarbige Falten)
  const top = pt(HD.spine - 0.5, 0);
  const feetX = HAX + P.hipX + (P.fFx + P.fBx) * 0.3;
  const bottom = HAY - 1 - Math.max(0, (P.fFy + P.fBy) * 0.3);
  const y0 = Math.round(top.y), y1 = Math.round(bottom);
  const q = p.fine ? 0.5 : 1;
  const geo = (y) => {
    const t = Math.min(1, (y - y0) / Math.max(1, y1 - y0));
    return { t, cx: top.x + (feetX - top.x) * t - P.hem * t * t * 2, hw: 3.5 + t * 4.2 + Math.sin(P.hem * 2 + t * 4) * 0.4 * t + K * 2 * t };
  };
  for (let y = y0; y <= y1 + (p.fine ? 0.5 : 0); y += q) {
    const { t, cx, hw } = geo(y), W2 = 2 * hw;
    for (let x = Math.floor((cx - hw) / q) * q; x <= cx + hw + 1; x += q) {
      const xc = x + q / 2;
      if (xc < cx - hw || xc > cx + hw + 1) continue;
      const u = (xc - 0.5 - (cx - hw)) / W2, pxw = (v) => Math.abs(u - v) * W2;
      let c = u < 0.12 ? PROBE[4] : u < 0.4 ? PROBE[3] : u < 0.78 ? PROBE[2] : PROBE[1];
      if (t > 0.3) { if (pxw(0.33 + Math.sin(P.hem + t * 2) * 0.03) < 0.25) c = PROBE[1]; else if (p.fine && pxw(0.33 - 0.5 / W2) < 0.25) c = PROBE[4]; }
      if (t > 0.45) { if (pxw(0.66) < 0.25) c = PROBE[0]; else if (p.fine && pxw(0.66 - 0.5 / W2) < 0.25) c = PROBE[3]; }
      if (p.fine) fd(p, x, y, c); else p.px(x, y, c);
    }
  }
  // Saum: zerfranst, Wurzelfasern schleifen am Boden
  const hemCx = feetX - P.hem * 2, hemHw = 7.7 + K * 2;
  for (let x = Math.round(hemCx - hemHw); x <= Math.round(hemCx + hemHw) + (p.fine ? 0.5 : 0); x += q) {
    const xi = Math.round(x * 2), j = hash2(Math.round(x - 0.25) - Math.round(hemCx), 3, 36);
    put(p, x, y1 - 1, xi % 3 ? PROBE[1] : PROBE[0]);
    if (j > 0.5 && xi % 2 === 0) { put(p, x, y1, VINE[1]); if (p.fine && j > 0.8) fd(p, x + 0.5, y1 + 0.5, VINE[0]); }
  }
  // Dornenranken winden sich um die Robe (nur die vordere Hälfte), zwei Blüten
  for (const ph of [0, 3.1]) {
    let prev = null;
    for (let y = y0 + 2; y <= y1 - 1; y += q) {
      const { t, cx, hw } = geo(y), a = ph + t * 7.5 + P.hem * 0.3, c = Math.cos(a);
      const x = cx + 0.5 + Math.sin(a) * hw * 0.92;
      if (c < 0) { prev = null; continue; }
      if (prev && p.fine) fl(p, prev[0], prev[1], x, y, c > 0.6 ? VINE[3] : VINE[2]);
      else put(p, x, y, VINE[2]);
      if (p.fine) fd(p, p.snap(x), p.snap(y + 0.5), VINE[0]);
      const step = Math.round((y - y0) / q);
      if (p.fine && step % 5 === 0) shard(p, null, x, y, x + (Math.sin(a) > 0 ? 1.2 : -1.2), y - 0.9, 0.35, null, THORN_R);
      prev = [x, y];
    }
  }
  if (p.fine) { const a1 = geo(y0 + (y1 - y0) * 0.42), a2 = geo(y0 + (y1 - y0) * 0.78); blossom(p, g, a1.cx + 2.5, y0 + (y1 - y0) * 0.42, 1); blossom(p, g, a2.cx - 3, y0 + (y1 - y0) * 0.78, 0.9, 0.6); }
  // Gürtel: geflochtene Ranke mit Samenkapsel
  const bl = pt(3, 0);
  for (let k = -3.5; k <= 3.5; k += p.fine ? 0.25 : 0.5) { const o = pt(3, k); put(p, o.x, o.y, (k * 4 & 1) ? VINE[2] : VINE[3]); if (p.fine) { const o2 = pt(2.6, k); put(p, o2.x, o2.y, VINE[1]); } }
  ell(p, bl.x + 1.5, bl.y + 2.5, 0.9, 1.3, DWOOD[3]);
  if (p.fine) { fd(p, p.snap(bl.x + 1), p.snap(bl.y + 2), DWOOD[4]); fd(p, p.snap(bl.x + 1.5), p.snap(bl.y + 3), MAW[3]); fd(g, p.snap(bl.x + 1.5), p.snap(bl.y + 3), VG[2]); }

  // --- Blattkragen über den Schultern
  const col = pt(HD.spine, 0);
  ell(p, col.x, col.y + 0.5, 4.6, 2.2, LEAF_R[1]);
  if (p.fine) {
    for (let i = 0; i < 7; i++) {
      const u = (i / 6) * 2 - 1, bx = col.x + u * 4 - 0.5, by = col.y - 0.8 + Math.abs(u) * 0.3;
      const a = 1.57 + u * 0.9 + 0.2;
      shard(p, null, bx, by, bx + Math.cos(a) * 3.2, by + Math.sin(a) * 3.2, 1.05, null, i & 1 ? LEAF_R : [0, LEAF_R[1], LEAF_R[2], 0, LEAF_R[4], '#8ab874']);
    }
  } else { p.line(col.x - 4, col.y + 1, col.x + 4, col.y + 1, LEAF_R[4]); p.line(col.x - 4, col.y + 2, col.x + 4, col.y + 2, LEAF_R[2]); }

  // --- Kopf: borkenfahle Haut, Magenta-Augen, Dornenkrone
  const eyeOn = P.eye > 0.3, open = P.jaw > 0.5;
  ell(p, hx - 1.5, hy - 0.2, 2.2, 3.4, MOSSH[2]);
  ell(p, hx - 1.9, hy - 1.4, 1.4, 1.8, MOSSH[3]);
  const FACE = [[-3, 'hHH32.'], [-2, 'h2343.'], [-1, 'hE*E3.'], [0, 'h1232 '], [1, 'h12m2.'], [2, '.122..'], [3, '..1...']];
  const fc = { h: MOSSH[2], H: MOSSH[4], E: BSKIN[0], m: '#1a0c14' };
  for (const [dy, row] of FACE) for (let i = 0; i < row.length; i++) {
    let ch = row[i];
    if (ch === '.' || ch === ' ') continue;
    if (ch === '*') ch = eyeOn ? '*' : 'E';
    const c = ch === '*' ? MAW[4] : fc[ch] ?? BSKIN[+ch];
    p.px(hx + i, hy + dy, c);
  }
  p.px(hx + 5, hy, BSKIN[3]); p.px(hx + 5, hy + 1, BSKIN[1]);
  const ex = hx + 2, ey = hy - 1;
  if (p.fine) {
    const F = (x, y, c) => fd(p, hx + x, hy + y, c);
    F(1, -1.5, BSKIN[4]); F(1.5, -1.5, BSKIN[5]); F(2, -1.5, BSKIN[5]); F(2.5, -1.5, BSKIN[4]); F(3, -1.5, BSKIN[3]);
    F(1, -1, BSKIN[0]); F(1, -0.5, BSKIN[0]); F(3, -1, BSKIN[0]); F(3, -0.5, BSKIN[1]);
    if (eyeOn) {
      F(1.5, -1, MAW[2]); F(2, -1, MAW[4]); F(2.5, -1, MAW[3]); F(1.5, -0.5, MAW[3]); F(2, -0.5, '#ffffff'); F(2.5, -0.5, MAW[2]);
      for (const [x, y, c] of [[2, -0.5, VG[4]], [2, -1, VG[3]], [1.5, -0.5, VG[2]], [2.5, -0.5, VG[2]], [1, -0.5, VG[0]], [3, -0.5, VG[0]]]) fd(g, hx + x, hy + y, c);
    } else { F(1.5, -0.5, BSKIN[1]); F(2, -0.5, BSKIN[2]); F(2.5, -0.5, BSKIN[1]); }
    F(3.5, -1, BSKIN[5]); F(4, -0.5, BSKIN[5]); F(4.5, 0, BSKIN[4]); F(5, 0, BSKIN[3]); F(5, 0.5, BSKIN[2]); F(4.5, 1, BSKIN[0]);
    F(1.5, 0, BSKIN[3]); F(2, 0, BSKIN[4]); F(1.5, 0.5, BSKIN[0]); F(1.5, 1, BSKIN[0]); F(2, 1.5, BSKIN[1]);
    F(3, 0.5, BSKIN[1]); F(2.5, 0, BSKIN[2]);                                                                // Borkenriss auf der Wange
    if (!open) { F(2.5, 1, '#1a0c14'); F(3, 1, '#1a0c14'); F(3.5, 1, '#1a0c14'); F(3, 1.5, BSKIN[3]); F(3.5, 1.5, BSKIN[2]); }
    else { F(2.5, 1, '#1a0c14'); F(3, 1, MAW[1]); F(3.5, 1, '#1a0c14'); F(3, 1.5, MAW[1]); F(3, 2, '#1a0c14'); fd(g, hx + 3, hy + 1.5, VG[0]); }
    F(2, 2.5, BSKIN[1]); F(2.5, 2.5, BSKIN[3]); F(2, 3, BSKIN[0]);
    fl(p, hx + 1, hy - 3, hx, hy - 1.5, MOSSH[4]); fl(p, hx, hy - 1, hx - 0.5, hy + 2.5, MOSSH[3]); fl(p, hx - 0.5, hy, hx - 1, hy + 3, MOSSH[1]);
  } else if (eyeOn) g.px(ex, ey, VG[3]);
  meta.eye = { x: ex, y: ey };
  meta.mouth = { x: hx + 3, y: hy + 2 };
  // Dornenkrone: geflochtener Reif, fünf gekrümmte Dornen, eine Blüte an der Schläfe
  if (p.fine) {
    for (let x = hx - 1.5; x <= hx + 3.5; x += 0.5) { fd(p, x, hy - 4, (x * 2) % 2 ? DWOOD[3] : DWOOD[2]); fd(p, x, hy - 3.5, DWOOD[0]); }
    for (const [cx, h, lean] of [[-1.5, 2, -0.8], [0, 3, -0.5], [1, 4.2, 0.1], [2.2, 3, 0.6], [3.3, 2, 1]]) shard(p, null, hx + cx, hy - 4.2, hx + cx + lean, hy - 4 - h, h > 4 ? 0.75 : 0.6, null, THORN_R);
    blossom(p, g, hx - 1.5, hy - 3.5, 1.1);
  } else { p.line(hx - 1, hy - 4, hx + 3, hy - 4, DWOOD[2]); for (const cx of [-1, 1, 3]) p.px(hx + cx, hy - 5, THORN_R[5]); }
  meta.head = { x: hx, y: hy - 10 };

  // --- vorderer Arm mit Blattstulpe + Dornenstab
  limb(p, shF.x, shF.y, armF.jx, armF.jy, 3, 3, [PROBE[1], PROBE[2], PROBE[3], PROBE[4]]);
  limb(p, armF.jx, armF.jy, armF.jx + (armF.ex - armF.jx) * 0.6, armF.jy + (armF.ey - armF.jy) * 0.6, 3, 4, [PROBE[1], PROBE[2], PROBE[3], PROBE[4]]);
  const cu = { x: armF.jx + (armF.ex - armF.jx) * 0.62, y: armF.jy + (armF.ey - armF.jy) * 0.62 };
  if (p.fine) {
    const m = { x: armF.jx + (armF.ex - armF.jx) * 0.3, y: armF.jy + (armF.ey - armF.jy) * 0.3 };
    fl(p, armF.jx - 0.5, armF.jy + 0.5, m.x - 0.5, m.y + 0.5, PROBE[1]); fl(p, armF.jx - 1, armF.jy, m.x - 1, m.y, PROBE[5]);
    for (let i = -1; i <= 1; i++) shard(p, null, cu.x + i * 1.1, cu.y - 0.5, cu.x + i * 1.6, cu.y + 2, 0.7, null, LEAF_R);
  } else { p.px(cu.x, cu.y, LEAF_R[4]); p.px(cu.x + 1, cu.y + 1, LEAF_R[2]); }
  volEll(p, shF.x, shF.y, 1.8, 1.4, LEAF_R[2], LEAF_R[1], LEAF_R[4]);
  if (X.noStaff) { p.rect(armF.ex - 1, armF.ey - 1, 2, 2, BSKIN[2]); return meta; }
  const c = drawThornStaff(p, g, armF.ex, armF.ey, P.sa, P.cast, P.orbit);
  p.rect(armF.ex - 1, armF.ey - 1, 2, 2, BSKIN[2]); p.px(armF.ex - 1, armF.ey - 1, BSKIN[4]); p.px(armF.ex + 1, armF.ey, BSKIN[1]);
  meta.hand = c;
  return meta;
}

// ================================================================ Export

const STARS2 = {
  mad_prospector: () => STEPPE_KIT.raiderAnims(false, drawStarRaider),
  shadow_ranger: () => STEPPE_KIT.raiderAnims(true, drawStarRaider),
  void_wisp: () => NEW2_KIT.rimGlow(() => NEW2_KIT.phaseAnims(drawVoidWisp, WISP_TINT, wispClaw), { top: '#e8e0ff', side: '#a080e0', glowTop: '#8a70c8', glowSide: '#4a1a80', k: 0.28 }),
  splinter_colossus: () => WASTES_KIT.createColossus(SPLINTER_SKIN, { hi: '#e0e8ff', k: 0.36, back: '#3a0e5a' }),
  withered_warden: () => WASTES_KIT.createColossus(WARDEN_SKIN, { hi: '#e8dcc8', k: 0.36, back: '#3a0e5a' }),
  rootbound: () => SPORE_KIT.bruteAnims(drawRootbound),
  thorn_priest: () => FROST_KIT.rimeWitchAnims({ draw: drawThornPriest, staff: drawThornStaff, ring: thornRing }),
  star_seer: () => THRONE_KIT.createAshPriest({ draw: drawStarSeer, corpse: drawStarSeerCorpse, rim: '#e0e4ff', back: '#9a5ae0' }),
  statue_wraith: () => WASTES_KIT.createWraith({ draw: drawGlassPrisoner, remains: drawGlassRemains, dust: GLS, hot: [CRYS[4], CRYS[3], VG[3], VG[1]], rim: { hi: '#e0e8ff', k: 0.4, back: '#3a0e5a' } }),
  void_hound: () => THRONE_KIT.createHellhound({ draw: drawVoidHound, corpse: drawVoidHoundCorpse, rim: RIM_LILAC, back: BACK_VOID }),
};

// Jede Figur wird erst beim ersten Zugriff gezeichnet und dann gecacht (wie createThroneFoes)
export function createStarFoes2() {
  const out = {};
  for (const k in STARS2) {
    Object.defineProperty(out, k, {
      configurable: true, enumerable: true,
      get() {
        const v = STARS2[k]();
        Object.defineProperty(out, k, { value: v, writable: true, configurable: true, enumerable: true });
        return v;
      },
    });
  }
  return out;
}
