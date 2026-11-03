import { hash2 } from '../core/math.js';
import { THRONE_KIT } from './foes_throne.js';
import { SPORE_KIT } from './foes_spore.js';
import { WASTES_KIT } from './foes_wastes.js';
import { NEW2_KIT } from './foes_new2.js';

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

const BIRCH = ['#120d12', '#271e24', '#41353a', '#5f5250', '#827264', '#a6957e', '#cbbb9c'];
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
    if (near) rift(p, g, [[x - 1.5, y - r * 0.6], [x - 0.5, y - 0.5], [x + 1.5, y + 0.5]], 0.7);
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
  if (cracks && rx > 3) chunkRifts(p, g, x, y, rx, ry, seed + 7, Math.min(2, cracks), heat);
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
  ROCK: QUARTZ, ROCK_D: QUARTZ_D, LAVA: VLAVA, GLOW: VG, VOID: '#05040c', glowDot: vGlowDot,
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
const WARDEN_SKIN = {
  ROCK: DEAD, ROCK_D: DEAD_D, LAVA: VLAVA, GLOW: VG, VOID: '#07050a', glowDot: vGlowDot,
  boulder: woodKnot,
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

// ================================================================ Export

const STARS2 = {
  void_wisp: () => NEW2_KIT.rimGlow(() => NEW2_KIT.phaseAnims(drawVoidWisp, WISP_TINT, wispClaw), { top: '#e8e0ff', side: '#a080e0', glowTop: '#8a70c8', glowSide: '#4a1a80', k: 0.28 }),
  splinter_colossus: () => WASTES_KIT.createColossus(SPLINTER_SKIN, { hi: '#e0e8ff', k: 0.36, back: '#3a0e5a' }),
  withered_warden: () => WASTES_KIT.createColossus(WARDEN_SKIN, { hi: '#e8dcc8', k: 0.36, back: '#3a0e5a' }),
  rootbound: () => SPORE_KIT.bruteAnims(drawRootbound),
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
