import { PAL } from '../gfx/Palette.js';
import { Animation } from '../gfx/Sprite.js';
import { FK } from './foes_cinder.js';
import { RK } from './foes_rime.js';

// Gegner des Aschethrons (Obsidianpalast, Stufe 38–40): Thronwache,
// Aschepriester, Glut-Höllenhund und der Wächter des Throns (Elite).
// Unterscheidung: Thronwache = kleiner Hellebardier mit Turmschild, Schaller-Helm, roter Rosshaarbusch;
// Wächter = Koloss mit Zweihänder (beidhändig), gehörntem Großhelm und Flammenbanner auf dem Rücken.
//
// Gleicher Ansatz wie foes_rime.js / foes_cinder.js: Rigs mit Schlüsselposen,
// weich interpoliert; Obsidian + Gold, Glut auf der Leucht-Ebene (frame.glow),
// warmes Randlicht (Gold) oben links und Glut-Gegenlicht rechts für eine klare
// Silhouette auf dunklem Palastboden. Blickrichtung rechts, Anker = Bodenkontakt.

const { GLOW, LAVA, linear, snap, clamp, ell, cap, poly, ik, glowDot, veins, flame, fireball, track, still, dustRing, occlude, robe, hash2, CHAR, VOID } = FK;
const { mixP, shard, halo, spec, stillR, rig, smearArc, TAU } = RK;

// Schwung-Schleier als geschlossene Sichel (ersetzt das gerasterte FK.arcSmear):
// am frischen Ende breit und hell, zum Anfang spitz auslaufend, harte Stufen –
// keine Rasterkrümel, an denen die Kontur ausfranst. Signatur wie FK.arcSmear.
function arcSmear(p, g, cx, cy, a0, a1, r0, r1, cols, seed = 13, glowIt = true) {
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1), span = hi - lo || 1;
  const R1 = Math.ceil(r1);
  for (let y = -R1; y <= R1; y++) for (let x = -R1; x <= R1; x++) {
    const d = Math.hypot(x, y);
    if (d < r0 || d > r1) continue;
    let a = Math.atan2(y, x);
    while (a < lo - Math.PI) a += Math.PI * 2;
    while (a > lo + Math.PI) a -= Math.PI * 2;
    if (a < lo || a > hi) continue;
    const fresh = a1 > a0 ? (a - lo) / span : (hi - a) / span;
    const radial = (d - r0) / (r1 - r0 || 1);
    const th = 0.15 + 0.85 * fresh * fresh;
    if (radial < 1 - th) continue;
    const rr = (radial - (1 - th)) / th;
    p.px(cx + x, cy + y, rr > 0.7 ? cols[2] : rr > 0.3 ? cols[1] : cols[0]);
    if (glowIt && fresh > 0.4 && rr > 0.4) g.px(cx + x, cy + y, rr > 0.7 ? GLOW[3] : GLOW[1]);
  }
}


// ================================================================ Materialien

const OBS = ['#07050b', '#110b17', '#1c1325', '#2a1d36', '#3c2b4c', '#554266', '#7a6690'];
const OBS_D = ['#050308', '#0b0710', '#140e1b', '#1e1627', '#2a1f35'];
const GOLD = ['#3a2208', '#6a4210', '#a06a1c', '#d49a32', '#f2c85a', '#fff0a8'];
const CRIM = ['#1e0508', '#3a0a10', '#5e1218', '#861c20', '#b02c26'];
const ASHR = ['#1e1a1b', '#2e2929', '#403a39', '#554d4a', '#6c625d', '#8a7f78'];
const HIDE = ['#080405', '#110709', '#1b0c0d', '#291313', '#3b1c18', '#54281e'];
const RIM_GOLD = '#ffe0a0', BACK_EMBER = '#ff7a30';
const SMEAR_W = [GOLD[2], GOLD[4], '#fff4d0'];

// Gold-Filigran: kleine Rankenlinie auf einer Fläche
function filigree(p, x, y, w, seed) {
  for (let i = 0; i < w; i++) {
    const yy = y + Math.round(Math.sin(i * 1.3 + seed) * 0.8);
    p.px(x + i, yy, i % 3 === 0 ? GOLD[4] : GOLD[3]);
  }
}

// ================================================================ Thronwache

const TG = { W: 80, H: 64, AX: 34, AY: 56, pad: 10 };
const GD = { legH: 12, thigh: 6.5, shin: 7, spine: 11, upper: 5, fore: 5.5, sh: 1.5, hipW: 1.2 };
const TG_REST = {
  hipX: 0, hipY: 0, lean: 0.05, head: 0, headY: 0, fFx: 4, fFy: 0, fBx: -4, fBy: 0,
  hFx: 5, hFy: 6, hBx: 5, hBy: 4, ha: -1.35, grip: 8, shT: 0, cape: 0.1, capeT: 0, eye: 1, kneel: 0,
};
const tgp = (o) => ({ ...TG_REST, ...o });
const HAL_L = 36; // lange Hellebarde: überragt die Wache deutlich (Silhouette des Hellebardiers)

// Hellebarde: Hand bei (hx,hy), Achse a, grip = Abstand Hand–Schaftende.
function halberd(p, g, hx, hy, a, grip, heat) {
  const c = Math.cos(a), s = Math.sin(a), nx = -s, ny = c;
  const b0 = -grip, b1 = HAL_L - grip;
  // Schaft: dunkles Holz mit Goldringen
  cap(p, hx + c * b0, hy + s * b0, hx + c * b1, hy + s * b1, 0.9, 0.9, ['#140a08', '#24140c', '#3a2214', '#553420']);
  for (const t of [b0 + 1, b1 - 8, b1 - 11]) { p.px(hx + c * t, hy + s * t, GOLD[4]); p.px(hx + c * t + nx * 0.8, hy + s * t + ny * 0.8, GOLD[2]); }
  // Kopf: Axtblatt (Mondsichel) auf der Schlagseite, Haken hinten, Stoßspitze oben
  const hc = { x: hx + c * (b1 - 4), y: hy + s * (b1 - 4) };
  // Blattseite = die Seite, deren Normale nach vorn (rechts) zeigt
  const side = nx > 0 ? 1 : -1;
  const bl = [];
  for (let t = -4; t <= 3; t += 0.5) {
    const f = (t + 4) / 7;
    const reach = 2 + Math.sin(f * Math.PI) * 4.5 + (f > 0.85 ? (f - 0.85) * 10 : 0);
    for (let k = 0.5; k <= reach; k += 0.5) {
      const x = hc.x + c * t + nx * side * k, y = hc.y + s * t + ny * side * k;
      const edge = k > reach - 0.6;
      p.px(x, y, edge ? (t < 0 ? '#fff0c8' : GOLD[4]) : k < 1.5 ? GOLD[2] : k > reach - 1.6 ? OBS[6] : t < -0.5 ? OBS[5] : OBS[4]);
      if (edge && heat > 0.3) g.px(x, y, GLOW[heat > 0.8 ? 3 : 1]);
    }
    bl.push(t);
  }
  // Glutrune im Blatt
  const rx = hc.x + nx * side * 3, ry = hc.y + ny * side * 3;
  p.px(rx, ry, LAVA[3]); g.px(rx, ry, GLOW[3]); p.px(rx + c, ry + s, LAVA[2]); g.px(rx + c, ry + s, GLOW[2]);
  // Haken hinten
  p.line(hc.x - nx * side, hc.y - ny * side, hc.x - nx * side * 4 + c * 1.5, hc.y - ny * side * 4 + s * 1.5, OBS[4]);
  p.px(hc.x - nx * side * 4 + c * 1.5, hc.y - ny * side * 4 + s * 1.5, GOLD[4]);
  // Spitze
  const tip = { x: hx + c * (b1 + 5), y: hy + s * (b1 + 5) };
  shard(p, g, hx + c * (b1 - 1), hy + s * (b1 - 1), a, 6, 1.4, OBS, { base: 0.3 });
  // Tülle gold
  cap(p, hc.x - c * 4.5, hc.y - s * 4.5, hc.x + c * 3, hc.y + s * 3, 1.3, 1.3, GOLD.slice(1, 5));
  return { tip, blade: { x: hc.x + nx * side * 6, y: hc.y + ny * side * 6 } };
}

// Turmschild: Obsidian mit Goldrand und glühender Sonnenscheibe
function towerShield(p, g, x, y, tilt, heat) {
  const w = 4.5 - tilt * 1.5, h = 9;
  const pts = [[x - w, y - h], [x + w, y - h], [x + w, y + h - 3], [x, y + h], [x - w, y + h - 3]];
  poly(p, pts.map(([a, b]) => [a - 1, b - 1]), GOLD[2]);
  poly(p, pts.map(([a, b]) => [a + 1, b + 1]), GOLD[1]);
  poly(p, pts, OBS[3]);
  poly(p, [[x - w + 1, y - h + 1], [x, y - h + 1], [x, y + h - 1], [x - w + 1, y + h - 4]], OBS[4]);
  p.line(x - w, y - h, x + w, y - h, GOLD[5]); p.line(x - w, y - h, x - w, y + h - 3, GOLD[4]);
  p.line(x + w, y - h + 1, x + w, y + h - 3, GOLD[2]); p.line(x - w, y + h - 3, x, y + h, GOLD[3]); p.line(x, y + h, x + w, y + h - 3, GOLD[1]);
  // Sonnenscheibe
  ell(p, x, y - 1, 2.2, 2.2, [LAVA[2], LAVA[3], LAVA[4], LAVA[5]], { bias: 0.1 });
  for (let i = 0; i < 8; i++) { const a = i * TAU / 8; p.px(x + Math.cos(a) * 3.4, y - 1 + Math.sin(a) * 3.4, GOLD[4]); }
  if (heat > 0.2) glowDot(g, x, y - 1, 1.5 + heat * 0.8);
}

function drawThroneGuard(p, g, P, ex) {
  const { AX, AY } = TG;
  const K = P.kneel;
  const R = rig({ ...P, hipY: P.hipY + K * 5 }, GD, AX, AY);
  const { hip, chest, pt, legF, legB, shF, shB } = R;
  const meta = {};
  if (K > 0.01) {
    const kx = hip.x - 2 - K * 2, ky = AY - 2;
    legB.jx += (kx - legB.jx) * K; legB.jy += (ky - legB.jy) * K;
    legB.ex += (kx - 7 - legB.ex) * K; legB.ey += (AY - legB.ey) * K;
  }
  const hF = { x: chest.x + P.hFx, y: chest.y + P.hFy }, hB = { x: chest.x + P.hBx, y: chest.y + P.hBy };
  const armF = ik(shF.x, shF.y, hF.x, hF.y, GD.upper, GD.fore, 1);
  const armB = ik(shB.x, shB.y, hB.x, hB.y, GD.upper, GD.fore, 1);
  const heat = 1;

  // --- 1. Umhang (karminrot, Goldsaum)
  const ct = pt(GD.spine, -2);
  for (let i = 0; i < 7; i++) {
    const len = 14 - K * 4 + (hash2(i, 2, 7) * 2 | 0) - i * 0.3;
    for (let j = 0; j < len; j++) {
      const v = j / len;
      const x = ct.x - 1 - i * 0.8 - P.cape * 8 * v * v + Math.sin(P.capeT + v * 3 + i * 0.6) * 0.8 * v;
      const y = ct.y + j + i * 0.15;
      p.px(x, y, j >= len - 1.5 ? GOLD[2] : i < 2 ? CRIM[3] : i % 3 === 0 ? CRIM[1] : CRIM[2]);
    }
  }
  // --- Hellebarde hinter dem Körper (Ausholen)
  let hal = null;
  const smear = () => { if (ex.smear) smearArc(p, g, shF.x, shF.y + 1, ex.smear[0], ex.smear[1], HAL_L - P.grip - 4, HAL_L - P.grip + 5, SMEAR_W, [GLOW[1], GLOW[3]], 1); };
  if (ex.halBehind) { smear(); hal = halberd(p, g, hF.x, hF.y, P.ha, P.grip, heat); }

  // --- 2. hinteres Bein
  const RB = OBS_D;
  cap(p, hip.x - 1, hip.y, legB.jx, legB.jy, 2.6, 2.3, RB);
  cap(p, legB.jx, legB.jy, legB.ex, legB.ey - 2, 2.3, 2.2, RB);
  poly(p, [[legB.ex - 2, legB.ey], [legB.ex - 2, legB.ey - 2], [legB.ex + 2, legB.ey - 2], [legB.ex + 4, legB.ey]], OBS[2]);
  p.px(legB.jx + 1, legB.jy, GOLD[2]);
  // --- 3. hinterer Arm (Schildarm) – Arm hinter dem Rumpf, Schild davor
  cap(p, shB.x, shB.y, armB.jx, armB.jy, 2.2, 2, RB);
  cap(p, armB.jx, armB.jy, armB.ex, armB.ey, 2, 2.2, RB);

  // --- Schild (hintere Hand): steht hinter dem Rumpf, ragt vorn heraus
  towerShield(p, g, armB.ex + 1, armB.ey + 1, P.shT, heat);
  meta.shield = { x: armB.ex + 1, y: armB.ey };

  // --- 4. Rumpf: Obsidianküraß, Goldkante, Waffenrock
  // Waffenrock (Tabard) vorn/hinten zwischen den Beinen
  for (let j = 0; j < 8 - K * 2; j++) {
    const a = pt(-j * 0.9, 0.6);
    p.rect(a.x - 2.5 + j * P.lean, a.y, 5, 1, j > 5 ? GOLD[2] : j % 3 === 0 ? CRIM[2] : CRIM[3]);
    p.px(a.x - 2.5 + j * P.lean, a.y, CRIM[4]);
  }
  // Tassetten
  for (let i = 0; i < 4; i++) {
    const a = pt(0, -4 + i * 2.6);
    poly(p, [[a.x, a.y], [a.x + 2.5, a.y], [a.x + 2.8, a.y + 4], [a.x - 0.2, a.y + 4]], OBS[i % 2 ? 3 : 4]);
    p.px(a.x + 1, a.y + 4, GOLD[3]);
  }
  const hp = pt(0.5, 0.3), cp = pt(GD.spine - 1, 0.5);
  cap(p, hp.x, hp.y, cp.x, cp.y, 4.2, 5.6, OBS);
  ell(p, cp.x + 0.5, cp.y + 0.8, 5.5, 4.5, OBS, { rot: P.lean, bias: 0.06 });
  const q = (u, k, c) => { const o = pt(u, k); p.px(o.x, o.y, c); };
  for (let k = -4.5; k <= 4.5; k += 0.5) { q(1.2, k, GOLD[2]); q(1.7, k, GOLD[k < 0 ? 4 : 3]); }  // Gürtel
  for (let u = 3; u <= GD.spine; u += 0.5) q(u, 1.8, GOLD[4]);                                   // Brustgrat
  const sun = pt(GD.spine - 3, -0.5);
  p.px(sun.x, sun.y, LAVA[3]); p.px(sun.x + 1, sun.y, LAVA[2]); p.px(sun.x, sun.y + 1, LAVA[2]);
  g.px(sun.x, sun.y, GLOW[3]); g.px(sun.x + 1, sun.y, GLOW[1]); g.px(sun.x, sun.y + 1, GLOW[1]);
  filigree(p, sun.x - 4, sun.y + 3, 8, 1);
  // Glutrisse im Obsidian
  const vc = pt(4, -1.5);
  veins(p, g, vc.x, vc.y, 3, 3, 71, 2, 0.8, { len: 4 });

  // --- 5. vorderes Bein
  occlude(g);
  cap(p, hip.x + 1.5, hip.y, legF.jx, legF.jy, 2.9, 2.6, OBS);
  cap(p, legF.jx, legF.jy, legF.ex, legF.ey - 2, 2.6, 2.4, OBS);
  p.line(legF.jx + 1.5, legF.jy + 1, legF.ex + 1.5, legF.ey - 3, OBS[6]);
  poly(p, [[legF.ex - 2, legF.ey], [legF.ex - 2, legF.ey - 2.5], [legF.ex + 2, legF.ey - 2.5], [legF.ex + 5, legF.ey]], OBS[4]);
  p.line(legF.ex - 2, legF.ey - 2.5, legF.ex + 2, legF.ey - 2.5, GOLD[3]);
  ell(p, legF.jx + 0.5, legF.jy, 2, 2, GOLD.slice(1), { bias: 0.1 });
  occlude(null);


  // --- 7. Helm: spitzer Schaller-Helm (Obsidian), T-Visier mit Glut, karminroter Rosshaarbusch
  // (bewusst anders als der gehörnte Großhelm des Wächters und die Glutkrone des Fürsten)
  const neck = pt(GD.spine + 2, 0.8);
  const hx = Math.round(neck.x + P.head), hy = Math.round(neck.y - 4 + P.headY);
  // Rosshaarbusch: steigt aus der Helmspitze und fällt nach hinten über den Nacken
  const PLUME = ['#ff7a5a', '#e0483a', '#b02c26', '#861c20', '#5e1218'];
  for (let i = 0; i < 8; i++) {
    const L = 11 + i * 0.7;
    for (let j = 0; j < L; j++) {
      const v = j / L;
      const x = hx + 1 - i * 0.3 - v * (6 + P.cape * 3) + Math.sin(P.capeT + v * 3 + i) * 0.6 * v;
      const y = hy - 8 + i * 0.3 - Math.sin(v * Math.PI) * 3.5 + v * 8;
      p.px(x, y, j === 0 ? GOLD[4] : PLUME[Math.min(4, (i >> 1) + (v > 0.75 ? 1 : 0))]);
    }
  }
  ell(p, hx, hy, 3.8, 4.4, OBS, { bias: 0.1 });
  // Helmspitze (Schaller) und Nackenschirm
  poly(p, [[hx - 2.5, hy - 3], [hx + 0.5, hy - 7.5], [hx + 2.5, hy - 3]], OBS[4]);
  p.line(hx - 2, hy - 3.5, hx + 0.5, hy - 7.5, OBS[6]); p.px(hx + 0.5, hy - 8, GOLD[5]);
  poly(p, [[hx - 3.5, hy + 1], [hx - 6, hy + 4], [hx - 3, hy + 4]], OBS[3]); p.line(hx - 6, hy + 4, hx - 3, hy + 4, GOLD[2]);
  poly(p, [[hx - 3.5, hy], [hx + 4, hy - 1], [hx + 4.5, hy + 3], [hx + 1, hy + 5], [hx - 3, hy + 4]], OBS[3]);
  p.line(hx - 3, hy - 1, hx + 4, hy - 2, GOLD[4]);                    // Stirnreif
  p.px(hx + 1, hy - 2, LAVA[3]); g.px(hx + 1, hy - 2, GLOW[2]);
  // T-Visier
  const ec = ex.hurt ? '#ffffff' : LAVA[5];
  p.line(hx - 1, hy - 1, hx + 4, hy - 1, OBS[6]);                       // Visierkante im Licht
  p.rect(hx - 1, hy, 6, 1, VOID); p.rect(hx + 2, hy, 1, 3, VOID);
  p.px(hx + 3, hy + 2, OBS[1]); p.px(hx + 4, hy + 1, OBS[5]);           // Kinnplatte, Atemloch
  if (P.eye > 0.3) {
    p.px(hx, hy, LAVA[3]); p.px(hx + 1, hy, ec); p.px(hx + 3, hy, ec); p.px(hx + 4, hy, LAVA[3]); p.px(hx + 2, hy + 1, LAVA[2]);
    g.px(hx + 1, hy, GLOW[4]); g.px(hx + 3, hy, GLOW[4]); g.px(hx, hy, GLOW[2]); g.px(hx + 4, hy, GLOW[2]); g.px(hx + 2, hy + 1, GLOW[2]);
    if (P.eye > 1.2) g.rect(hx, hy, 5, 1, GLOW[3]);
  }
  p.px(hx - 2, hy - 3, OBS[6]);
  meta.eye = { x: hx + 2, y: hy };
  meta.head = { x: hx, y: hy - 12 };
  meta.mouth = { x: hx + 3, y: hy + 2 };

  // --- 8. vorderer Arm + Hellebarde + Schulterplatte
  const arm = () => {
    occlude(g);
    cap(p, shF.x, shF.y, armF.jx, armF.jy, 2.4, 2.2, OBS);
    cap(p, armF.jx, armF.jy, armF.ex, armF.ey, 2.2, 2.4, OBS);
    p.rect(armF.ex - 1.5, armF.ey - 1.5, 3, 3, OBS[4]); p.px(armF.ex - 1.5, armF.ey - 1.5, GOLD[4]);
    occlude(null);
  };
  if (!ex.halBehind) { smear(); arm(); hal = halberd(p, g, hF.x, hF.y, P.ha, P.grip, heat); p.rect(hF.x - 1.5, hF.y - 1.5, 3, 3, OBS[4]); p.px(hF.x - 1.5, hF.y - 1.5, GOLD[4]); }
  else arm();
  occlude(g);
  ell(p, shF.x + 0.5, shF.y - 0.5, 3.8, 3, OBS, { bias: 0.1 });
  occlude(null);
  p.line(shF.x - 3, shF.y + 1.5, shF.x + 4, shF.y + 1.5, GOLD[3]);
  poly(p, [[shF.x - 1, shF.y - 2.5], [shF.x - 2, shF.y - 6], [shF.x + 1.5, shF.y - 2.5]], GOLD[3]);
  p.line(shF.x - 1, shF.y - 3, shF.x - 2, shF.y - 6, GOLD[5]);
  meta.hand = { x: hF.x, y: hF.y };
  meta.tip = hal.tip;
  p.ctx.clearRect(-20, AY + 1, 200, 40); g.ctx.clearRect(-20, AY + 1, 200, 40);
  return meta;
}

// Gefallene Wache: liegende Rüstung, Schild, Hellebarde (k 0..1)
function drawGuardFallen(p, g, k) {
  const { AX, AY } = TG;
  const gy = AY;
  const cx = AX - 2;
  halberd(p, g, cx - 6, gy - 2, 0.05, 6, 1 - k);
  for (let i = 0; i < 12; i++) p.px(cx - 18 + i, gy - 1 - (i % 3 === 0 ? 1 : 0), i % 2 ? CRIM[2] : CRIM[1]);
  cap(p, cx - 12, gy - 3, cx - 20, gy - 2, 2.4, 2.2, OBS_D);
  ell(p, cx - 3, gy - 4, 7.5, 3.8, OBS, { bias: 0.08 });
  p.line(cx - 9, gy - 6, cx + 3, gy - 7, GOLD[4]);
  const hx = cx + 8;
  ell(p, hx, gy - 4, 3.6, 3.6, OBS, { bias: 0.1 });
  for (let i = 0; i < 5; i++) p.line(hx - 1, gy - 5, hx - 5 + i * 0.5, gy - 9 + i * 0.3, GOLD[3 + (i % 2)]);
  p.rect(hx, gy - 4, 3, 1, k < 0.6 ? LAVA[3] : VOID);
  if (k < 0.6) g.rect(hx, gy - 4, 3, 1, GLOW[2]);
  towerShield(p, g, cx + 16, gy - 8, 1.2, (1 - k) * 0.8);
  return { eye: { x: hx + 1, y: gy - 4 }, head: { x: hx, y: gy - 9 }, hand: { x: cx - 6, y: gy - 2 }, shield: { x: cx + 16, y: gy - 9 }, tip: { x: cx + 28, y: gy - 1 } };
}

function createThroneGuard() {
  const S = spec(TG, drawThroneGuard, RIM_GOLD, BACK_EMBER);
  const idleA = tgp({ hFx: 5, hFy: 7, ha: -1.4, grip: 9 });
  const idleB = tgp({ hFx: 5, hFy: 8, ha: -1.36, grip: 9, hipY: 1, lean: 0.08, hBy: 5, headY: 1, capeT: Math.PI });
  const idle = [];
  for (let i = 0; i < 6; i++) idle.push(mixP(idleA, idleB, (1 - Math.cos(i / 6 * TAU)) / 2));
  const walk = [];
  for (let i = 0; i <= 8; i++) {
    const ph = (i / 8) * TAU, sn = Math.sin(ph), c = Math.cos(ph);
    walk.push([i / 8, tgp({
      hipY: -Math.abs(c) * 1 + 0.5, lean: 0.1, fFx: 1 + sn * 4.5, fFy: Math.max(0, -c) * 2, fBx: -1 - sn * 4.5, fBy: Math.max(0, c) * 2,
      hFx: 5 + sn * 0.8, hFy: 7, ha: -1.3 + sn * 0.05, grip: 9, hBx: 5 - sn, cape: 0.4, capeT: ph, head: sn * 0.3,
    }), linear]);
  }
  // Ausholen: Hellebarde hoch über die Schulter nach hinten, Schild vor
  const w1 = tgp({ lean: -0.05, hipX: -1, hFx: 1, hFy: -4, ha: -2.2, grip: 10, hBx: 6, hBy: 3, shT: 0.5, fFx: 5, fBx: -5, eye: 1.3 });
  const w2 = tgp({ lean: -0.18, hipX: -1.5, hipY: 1, hFx: -2, hFy: -6, ha: -2.75, grip: 11, hBx: 7, hBy: 2, shT: 0.8, fFx: 6, fBx: -6, cape: 0.3, capeT: 1, eye: 1.5 });
  // Hieb: schräg von oben nach vorn-unten, Klinge fegt durch
  const s1 = tgp({ lean: 0.18, hipX: 1.5, hipY: 1, hFx: 7, hFy: -2, ha: -0.9, grip: 10, hBx: 2, hBy: 5, fFx: 7, fBx: -6, cape: 0.6, capeT: 2, eye: 1.5 });
  const s2 = tgp({ lean: 0.32, hipX: 3, hipY: 2, hFx: 10, hFy: 5, ha: 0.25, grip: 10, hBx: 0, hBy: 6, fFx: 8, fBx: -6, cape: 0.8, capeT: 3, eye: 1.3 });
  const s3 = tgp({ lean: 0.28, hipX: 2.5, hipY: 2, hFx: 10, hFy: 6, ha: 0.45, grip: 10, hBx: 1, hBy: 6, fFx: 8, fBx: -6, cape: 0.5, capeT: 4 });
  const s4 = tgp({ lean: 0.12, hipX: 1, hipY: 1, hFx: 7, hFy: 6, ha: -0.5, grip: 9, fFx: 6, fBx: -5, capeT: 5 });
  const hurtP = tgp({ lean: -0.2, hipX: -1.5, head: -1, headY: -1, hFx: 3, hFy: 6, ha: -1.7, hBx: 3, hBy: 3, shT: 1, eye: 1.4, cape: 0.3 });
  const d1 = tgp({ lean: -0.3, hipX: -2, head: -1.5, hFx: 3, hFy: 7, ha: -1.9, hBx: 2, hBy: 5, eye: 1.2 });
  const d2 = tgp({ kneel: 1, lean: 0.2, head: 1, headY: 1, hFx: 8, hFy: 10, ha: -0.4, hBx: 4, hBy: 9, eye: 0.7, fFx: 5, fBx: -7 });
  const d3 = tgp({ kneel: 1, lean: 0.45, head: 2, headY: 2, hFx: 10, hFy: 12, ha: 0.2, hBx: 6, hBy: 11, eye: 0.35, fFx: 5, fBx: -7 });
  return {
    idle: new Animation(idle.map((P) => track(S, [[0, P], [1, P]], 1)[0]), 6),
    walk: new Animation(track(S, walk, 8, { loop: true }), 10),
    windup: new Animation(track(S, [[0, idleA], [0.5, w1], [1, w2]], 4, { extras: { 3: { halBehind: true } } }), 8, false),
    strike: new Animation(track(S, [[0, s1], [0.3, s2, snap], [0.65, s3], [1, s4]], 4, {
      extras: { 0: { smear: [-2.1, -0.9] }, 1: { fx: 'impact', smear: [-1.2, 0.3] }, 2: { smear: [0, 0.5] } },
    }), 14, false),
    hurt: new Animation(track(S, [[0, hurtP], [1, idleA]], 2, { extras: { 0: { hurt: true } } }), 10, false),
    death: new Animation([
      ...track(S, [[0, hurtP], [0.35, d1], [0.7, d2, snap], [1, d3]], 4, { extras: { 0: { hurt: true }, 2: { fx: 'impact' } } }),
      stillR(S, (p, g) => drawGuardFallen(p, g, 0), 'impact', RIM_GOLD, BACK_EMBER),
      stillR(S, (p, g) => drawGuardFallen(p, g, 0.5), null, RIM_GOLD, BACK_EMBER),
      stillR(S, (p, g) => drawGuardFallen(p, g, 1), null, RIM_GOLD, BACK_EMBER),
    ], 8, false),
  };
}


// ================================================================ Glut-Höllenhund

const HH = { W: 66, H: 44, AX: 28, AY: 38, pad: 10 };
const HH_REST = {
  bx: 0, by: 0, pitch: 0, head: 0, jaw: 0.15, tail: 0, heat: 0.8, breath: 0, fl: 0, mane: 1, howl: 0,
  fAx: 0, fAy: 0, fBx: 0, fBy: 0, hAx: 0, hAy: 0, hBx: 0, hBy: 0,
};
const hhp = (o) => ({ ...HH_REST, ...o });

function hellHead(p, g, nx, ny, P, ex, meta) {
  const jaw = P.jaw, up = P.howl;
  const ra = -up * 1.1;                               // Kopf nach oben drehen (Heulen)
  const c = Math.cos(ra), s = Math.sin(ra);
  const R = (u, v) => [nx + u * c - v * s, ny + u * s + v * c];
  // Schädel
  ell(p, nx, ny, 4.8, 4, HIDE, { noise: 0.09, seed: 31 });
  // Schnauze (lang, flach)
  poly(p, [R(1, -2.2), R(8.5, -0.8), R(9, 1.4), R(1, 2)], (x, y) => (y < ny + 0 ? HIDE[4] : HIDE[3]));
  const ln = [R(2, -2.2), R(8, -1)]; p.line(ln[0][0], ln[0][1], ln[1][0], ln[1][1], HIDE[5]);
  const nose = R(9, -0.4); p.px(nose[0], nose[1], '#0a0406');
  // Kiefer (öffnet), Glutrachen
  const ja = jaw * 0.8;
  const J = (u, v) => { const a = ra + ja; return [nx + 0.5 + u * Math.cos(a) - (v + 2) * Math.sin(a), ny + u * Math.sin(a) + (v + 2) * Math.cos(a)]; };
  if (jaw > 0.12) {
    poly(p, [R(1, 1.6), R(8.5, 1.4), J(8, 0), J(1, 0)], LAVA[2]);
    poly(p, [R(1.5, 2), R(6, 2), J(5, -0.3)], LAVA[4]);
    for (let u = 2; u < 8; u++) { const q = R(u, 2); g.px(q[0], q[1], GLOW[3]); const q2 = J(u, -0.3); g.px(q2[0], q2[1], GLOW[2]); }
    const inn = R(3, 3); glowDot(g, inn[0], inn[1], 1 + jaw);
  }
  poly(p, [J(0, -0.5), J(8, -0.5), J(7.5, 1.5), J(0, 1.6)], HIDE[2]);
  // Zähne
  for (const u of [3, 5, 7.5]) { const t = R(u, 1.8); p.px(t[0], t[1], PAL.bone[3]); const b = J(u - 0.5, -0.8); p.px(b[0], b[1], PAL.bone[2]); }
  meta.mouth = { x: R(9, 1.5 + jaw * 2)[0], y: R(9, 1.5 + jaw * 2)[1] };
  // Hörner nach hinten
  const h0 = R(-1, -3);
  for (let i = 0; i < 5; i++) { const x = h0[0] - i * 1.1, y = h0[1] - 1.2 * i + i * i * 0.28; p.rect(x, y, 2 - (i > 2 ? 1 : 0), 1, i < 2 ? PAL.bone[1] : PAL.bone[2 + (i > 3 ? 1 : 0)]); }
  // Ohr
  const e0 = R(-2, -2); poly(p, [e0, [e0[0] - 4, e0[1] - 2], [e0[0] + 1, e0[1] - 1]], HIDE[3]);
  // Augen: Glut
  const ey = R(2, -1.3), ec = ex.hurt ? '#ffffff' : LAVA[5];
  p.rect(ey[0] - 1, ey[1] - 1, 4, 3, VOID);
  const bw = R(0.5, -3); p.line(bw[0], bw[1], bw[0] + 4 * c, bw[1] + 4 * s, HIDE[5]);   // Brauenwulst im Licht
  p.px(ey[0] - 1, ey[1], LAVA[2]);
  p.px(ey[0], ey[1], ec); p.px(ey[0] + 1, ey[1], LAVA[3]);
  g.px(ey[0], ey[1], GLOW[4]); g.px(ey[0] + 1, ey[1], GLOW[3]); g.px(ey[0] - 1, ey[1], GLOW[1]); g.px(ey[0] + 2, ey[1], GLOW[1]);
  meta.eye = { x: ey[0], y: ey[1] };
  meta.head = { x: nx, y: ny - 5 };
}

function drawHellhound(p, g, P, ex) {
  const { AX, AY } = HH;
  const meta = {};
  const gy = AY;
  const hip = { x: AX - 9 + P.bx, y: gy - 15 + P.by + Math.sin(P.pitch) * 8 };
  const sh = { x: AX + 8 + P.bx, y: gy - 17 + P.by - Math.sin(P.pitch) * 8 };
  const heat = P.heat;

  const leg = (bx, by, fx, fy, l1, l2, bend, ramp, far) => {
    const k = ik(bx, by, fx, fy, l1, l2, bend);
    cap(p, bx, by, k.jx, k.jy, far ? 2.4 : 2.9, 1.7, ramp);
    cap(p, k.jx, k.jy, k.ex, k.ey - 1, 1.6, 1.3, ramp);
    p.rect(k.ex - 1, k.ey - 1, 4, 1, ramp[far ? 1 : 3]);
    p.px(k.ex + 3, k.ey - 1, PAL.bone[far ? 1 : 3]);       // Krallen
    if (!far && heat > 0.3) { p.px(k.jx, k.jy, LAVA[2]); g.px(k.jx, k.jy, GLOW[1]); }
  };
  const farR = HIDE.slice(0, 4), nearR = HIDE.slice(1, 6);
  leg(hip.x + 1, hip.y + 1, AX - 10 + P.hBx, gy - P.hBy, 8, 8.5, 1, farR, true);
  leg(sh.x - 1, sh.y + 1, AX + 6 + P.fBx, gy - P.fBy, 8, 8, -1, farR, true);

  // Schwanz mit Flammenquaste
  let tx = hip.x - 4, ty = hip.y - 2;
  for (let i = 0; i < 6; i++) {
    const a = Math.PI + 0.5 - i * 0.2 + Math.sin(P.tail + i * 0.7) * 0.3;
    const nx = tx + Math.cos(a) * 2, ny = ty - Math.sin(a) * 2;
    cap(p, tx, ty, nx, ny, 1.7 - i * 0.2, 1.4 - i * 0.2, HIDE);
    tx = nx; ty = ny;
  }
  flame(p, g, tx, ty + 1, Math.round(5 + heat * 2), 1.6, P.fl, { lean: -0.5, seed: 9, hot: 0.7 + heat * 0.3 });

  // Rumpf: hager, Rippen glühen durch die verkohlte Haut
  cap(p, hip.x, hip.y, sh.x, sh.y, 4.4, 5.4, HIDE, { noise: 0.09, seed: 11 });
  ell(p, hip.x - 0.5, hip.y, 5, 4.6, HIDE, { noise: 0.09, seed: 12 });
  ell(p, sh.x, sh.y + 0.5 - P.breath * 0.5, 6, 5.8 + P.breath * 0.5, HIDE, { noise: 0.09, seed: 13 });
  // Rippen
  for (let i = 0; i < 4; i++) {
    const u = 0.35 + i * 0.15, x = hip.x + (sh.x - hip.x) * u, y = hip.y + (sh.y - hip.y) * u;
    for (let j = 0; j < 4; j++) {
      const px_ = x + j * 0.35 + 0.5, py_ = y - 1 + j;
      const hot = heat * (0.6 + P.breath * 0.4);
      p.px(px_, py_, hot > 0.6 ? LAVA[3] : LAVA[1]); g.px(px_, py_, GLOW[hot > 0.8 ? 3 : 2]);
    }
  }
  const mid = { x: (hip.x + sh.x) / 2, y: (hip.y + sh.y) / 2 };
  veins(p, g, hip.x - 1, hip.y, 4, 3.5, 47, 2, heat, { len: 5 });

  // nahe Beine
  leg(hip.x, hip.y + 2, AX - 8 + P.hAx, gy - P.hAy, 8, 8.5, 1, nearR, false);
  leg(sh.x + 1, sh.y + 2, AX + 9 + P.fAx, gy - P.fAy, 8, 8, -1, nearR, false);

  // Brennende Mähne entlang Rücken und Nacken
  for (let i = 0; i < 7; i++) {
    const u = i / 6, x = hip.x + 1 + (sh.x + 3 - hip.x) * u, y = hip.y - 4 + (sh.y - 5 - hip.y + 4) * u - Math.sin(u * Math.PI) * 0.8;
    const h = Math.round((2 + u * 5 + (hash2(i, 1, 5) * 2 | 0)) * P.mane * (0.8 + heat * 0.3));
    flame(p, g, x, y, h, 1.3 + u * 0.8, P.fl + i * 0.9, { lean: -0.45 - Math.max(0, P.bx) * 0.05 - P.howl * 0.2, seed: 20 + i, hot: 0.6 + heat * 0.4 });
  }

  // Hals + goldenes Stachelhalsband
  const na = -0.55 + P.head - P.pitch * 0.3 - P.howl * 0.9;
  const nx = sh.x + 4 + Math.cos(na) * 4, ny = sh.y - 2 + Math.sin(na) * 4;
  cap(p, sh.x + 2, sh.y - 1, nx, ny, 4, 3.2, HIDE, { noise: 0.09, seed: 14 });
  const cx = sh.x + 3 + Math.cos(na) * 2, cy = sh.y - 1.5 + Math.sin(na) * 2;
  for (let k = -3; k <= 3; k++) {
    const x = cx + Math.cos(na + Math.PI / 2) * k, y = cy + Math.sin(na + Math.PI / 2) * k;
    p.px(x, y, k < 0 ? GOLD[4] : GOLD[2]); p.px(x + Math.cos(na) * 0.8, y + Math.sin(na) * 0.8, GOLD[3]);
    if (k % 2 === 0) p.px(x - Math.cos(na) * 1.3, y - Math.sin(na) * 1.3, GOLD[5]);
  }
  hellHead(p, g, nx + 2, ny, P, ex, meta);
  if (ex.smear) smearArc(p, g, nx + 2, ny + 2, ex.smear[0], ex.smear[1], 6, 12, SMEAR_W, [GLOW[1], GLOW[2]], 1);
  return meta;
}

function drawHellhoundCorpse(p, g, k) {
  const { AX, AY } = HH;
  const cx = AX - 1, cy = AY - 4;
  for (const [x, a] of [[-8, 0.3], [-4, 0.6], [6, 0.2], [9, 0.5]]) cap(p, cx + x, cy + 2, cx + x + 4 + a * 3, cy + 4, 1.5, 1.2, HIDE.slice(0, 4));
  ell(p, cx, cy, 11, 4.4, HIDE, { noise: 0.09, seed: 12 });
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { const x = cx - 3 + i * 2.5 + j * 0.3, y = cy - 1 + j; if ((1 - k) > 0.2) { p.px(x, y, LAVA[k < 0.5 ? 3 : 1]); g.px(x, y, GLOW[k < 0.5 ? 2 : 1]); } else p.px(x, y, HIDE[0]); }
  ell(p, cx + 12, cy + 1, 3.8, 3, HIDE, { noise: 0.09, seed: 31 });
  poly(p, [[cx + 13, cy], [cx + 20, cy + 1], [cx + 20, cy + 3], [cx + 13, cy + 3]], HIDE[3]);
  for (let i = 0; i < 4; i++) p.px(cx + 10 - i, cy - 3 - i * 0.6, PAL.bone[2]);
  const ember = 1 - k;
  for (let i = 0; i < 6; i++) { const x = cx - 8 + i * 3.5, y = cy - 4; if (ember > 0.15) flame(p, g, x, y, Math.round(1 + ember * 4 * hash2(i, 1, 3)), 1, k * 8 + i, { seed: 50 + i, hot: ember }); }
  return { eye: { x: cx + 13, y: cy }, mouth: { x: cx + 19, y: cy + 2 }, head: { x: cx + 12, y: cy - 3 } };
}

function createHellhound() {
  const S = spec(HH, drawHellhound, RIM_GOLD, BACK_EMBER);
  const idle = [];
  for (let i = 0; i <= 6; i++) {
    const ph = (i / 6) * TAU, sn = Math.sin(ph);
    idle.push([i / 6, hhp({ by: sn * 0.6, breath: (sn + 1) / 2, jaw: 0.2 + Math.max(0, sn) * 0.35, tail: ph, heat: 0.75 + sn * 0.2, head: sn * 0.05, fl: ph * 1.5 }), linear]);
  }
  // Galopp (Rudeljäger): Paare gemeinsam
  const walk = [];
  for (let i = 0; i <= 6; i++) {
    const ph = (i / 6) * TAU, sn = Math.sin(ph), c = Math.cos(ph);
    walk.push([i / 6, hhp({
      by: -Math.abs(c) * 1.4 + 0.7, pitch: sn * 0.07, head: -sn * 0.08, jaw: 0.4, tail: ph * 2, heat: 0.9, fl: ph * 2, mane: 1.1,
      fAx: sn * 5, fAy: Math.max(0, c) * 3.5, fBx: sn * 4, fBy: Math.max(0, c) * 3,
      hAx: -sn * 5, hAy: Math.max(0, -c) * 3.5, hBx: -sn * 4, hBy: Math.max(0, -c) * 3,
    }), linear]);
  }
  const w1 = hhp({ by: 2, pitch: -0.08, head: 0.3, jaw: 0.7, heat: 1, fAx: 2, fBx: 1, hAx: 1, hBx: 1, fl: 1, mane: 1.3 });
  const w2 = hhp({ by: 4, bx: -2, pitch: -0.14, head: 0.45, jaw: 1, heat: 1.2, fAx: 4, fBx: 3, hAx: 2, hBx: 2, tail: 2, breath: 1, fl: 2, mane: 1.5 });
  const s1 = hhp({ by: -4, bx: 7, pitch: 0.28, head: -0.2, jaw: 1.2, heat: 1.2, fAx: 10, fAy: 6, fBx: 8, fBy: 5, hAx: -5, hAy: 1, hBx: -6, tail: 3, fl: 3, mane: 1.4 });
  const s2 = hhp({ by: -2, bx: 10, pitch: 0.12, head: 0.15, jaw: 0.1, heat: 1.2, fAx: 11, fAy: 3, fBx: 9, fBy: 2, hAx: -2, hAy: 3, hBx: -3, hBy: 2, tail: 4, fl: 4, mane: 1.2 });
  const s3 = hhp({ by: 1, bx: 6, pitch: -0.04, head: 0.1, jaw: 0.3, heat: 0.9, fAx: 5, fBx: 4, hAx: 2, hBx: 1, tail: 5, fl: 5 });
  const s4 = hhp({ bx: 3, jaw: 0.3, heat: 0.8, fAx: 2, fBx: 1, tail: 6, fl: 6 });
  // Heulen: Kopf in den Nacken, Mähne lodert auf
  const h1 = hhp({ by: 1, howl: 0.6, head: -0.2, jaw: 0.5, heat: 1.1, mane: 1.4, fl: 1, fAx: 1, pitch: -0.08 });
  const h2 = hhp({ by: 2, howl: 1, head: -0.4, jaw: 1, heat: 1.4, mane: 1.9, fl: 2, fAx: 1, pitch: -0.14, breath: 1 });
  const hurtP = hhp({ by: 1, bx: -2, pitch: 0.16, head: -0.45, jaw: 1, heat: 1.3, fAx: -1, fAy: 2, tail: 1, fl: 1, mane: 1.3 });
  const d1 = hhp({ by: 2, bx: -2, pitch: 0.22, head: -0.5, jaw: 1, heat: 1, fAx: 1, fAy: 3, fBy: 2, fl: 2, mane: 1 });
  const d2 = hhp({ by: 7, bx: -1, pitch: -0.12, head: 0.5, jaw: 0.8, heat: 0.7, fAx: 5, fBx: 4, hAx: -3, hBx: -2, fl: 3, mane: 0.6 });
  return {
    idle: new Animation(track(S, idle, 6, { loop: true }), 7),
    walk: new Animation(track(S, walk, 6, { loop: true, extras: { 0: { fx: 'step' }, 3: { fx: 'step' } } }), 13),
    windup: new Animation(track(S, [[0, idle[0][1]], [0.5, w1], [1, w2]], 4), 10, false),
    strike: new Animation(track(S, [[0, s1], [0.25, s2, snap], [0.6, s3], [1, s4]], 4, {
      extras: { 0: { smear: [-1.1, 0.5] }, 1: { fx: 'impact', smear: [-0.3, 1.1] } },
    }), 14, false),
    howl: new Animation([...track(S, [[0, idle[0][1]], [0.35, h1], [0.6, h2, snap], [0.85, { ...h2, fl: 4 }], [1, { ...h2, fl: 6, jaw: 0.8 }]], 7, { extras: { 3: { fx: 'roar' } } })], 8, false),
    hurt: new Animation(track(S, [[0, hurtP], [1, hhp({ bx: -1, head: -0.2, jaw: 0.5 })]], 2, { extras: { 0: { hurt: true } } }), 10, false),
    death: new Animation([
      ...track(S, [[0, hurtP], [0.5, d1], [1, d2]], 3, { extras: { 0: { hurt: true } } }),
      stillR(S, (p, g) => drawHellhoundCorpse(p, g, 0), 'impact', RIM_GOLD, BACK_EMBER),
      stillR(S, (p, g) => drawHellhoundCorpse(p, g, 0.45), null, RIM_GOLD, BACK_EMBER),
      stillR(S, (p, g) => drawHellhoundCorpse(p, g, 1), null, RIM_GOLD, BACK_EMBER),
    ], 8, false),
  };
}


// ================================================================ Aschepriester

const AP = { W: 60, H: 62, AX: 28, AY: 54, pad: 10 };
const AP_REST = {
  bob: 0, lean: 0, hem: 0, head: 0, hFx: 5, hFy: 9, hBx: -5, hBy: 3, ball: 0, fl: 0, cens: 0, eye: 1, cast: 0, stepA: 0, stepB: 0, wind: 0, hB2: 0,
};
const app = (o) => ({ ...AP_REST, ...o });

// Weihrauchfass an einer Kette, glimmend, mit Rauch
function censer(p, g, hx, hy, ang, fl) {
  const L = 7, x = hx + Math.sin(ang) * L, y = hy + Math.cos(ang) * L;
  for (let i = 1; i < L; i++) { const t = i / L; p.px(hx + (x - hx) * t, hy + (y - hy) * t, i % 2 ? GOLD[2] : GOLD[3]); }
  ell(p, x, y + 1.5, 2.2, 2, GOLD.slice(1), { bias: 0.1 });
  p.px(x - 1, y + 1, LAVA[3]); p.px(x + 1, y + 2, LAVA[2]); p.px(x, y + 2, LAVA[4]);
  glowDot(g, x, y + 1.5, 1.4);
  poly(p, [[x - 1, y - 0.5], [x, y - 2], [x + 1, y - 0.5]], GOLD[4]);
  // Rauch steigt auf (Ascheflocken + Funken)
  for (let i = 0; i < 6; i++) {
    const yy = y - 2 - i * 1.6 - ((fl * 2) % 1.6), xx = x + Math.sin(fl + i * 0.9) * (0.5 + i * 0.35) - i * 0.3;
    p.px(xx, yy, i < 2 ? ASHR[4] : ASHR[3]);
    if (i % 3 === 1) { p.px(xx + 1, yy, LAVA[3]); g.px(xx + 1, yy, GLOW[2]); }
  }
  return { x, y: y + 1.5 };
}

function drawAshPriest(p, g, P, ex) {
  const { AX, AY } = AP;
  const meta = {};
  const gy = AY;
  const top = gy - 23 + P.bob;
  const x = AX + P.lean * 2;
  const sh = { x: x + 1 + P.lean * 3, y: top + 1 };

  // --- Glutfeld-Siegel am Boden (Zauber)
  if (P.cast > 0.05) {
    const r = 6 + P.cast * 12, cx = AX + 2, cy = gy - 1;
    for (let i = 0; i < 48; i++) {
      const a = i / 48 * TAU + P.fl * 0.2;
      const xx = cx + Math.cos(a) * r, yy = cy + Math.sin(a) * r * 0.35;
      if (hash2(i, 1, 3) < 0.8) { p.px(xx, yy, i % 4 ? LAVA[2] : LAVA[4]); g.px(xx, yy, GLOW[i % 4 ? 2 : 3]); }
    }
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * TAU + P.fl * 0.3, xx = cx + Math.cos(a) * r * 0.6, yy = cy + Math.sin(a) * r * 0.2;
      p.px(xx, yy, LAVA[3]); g.px(xx, yy, GLOW[3]);
      flame(p, g, xx, yy, Math.round(2 + P.cast * 3), 0.9, P.fl + k, { seed: 60 + k, hot: 0.7 });
    }
  }

  // Füße
  p.rect(AX - 4 + P.stepB, gy - 2, 4, 2, CHAR[1]);
  // --- hinterer Ärmel + Weihrauchfass
  const hB = { x: sh.x + P.hBx, y: sh.y + P.hBy };
  cap(p, sh.x - 3, sh.y + 1, hB.x, hB.y, 2.4, 2.8, ASHR.slice(0, 4));
  p.rect(hB.x - 1, hB.y + 1, 2, 2, GOLD[2]);
  const cz = censer(p, g, hB.x, hB.y + 2, P.cens, P.fl);
  meta.censer = cz;

  // --- Robe: Asche, glimmender Saum, Goldstola
  robe(p, g, x, top, gy - 1, 5, 9.5, P.lean, P.hem, ASHR, CHAR, 83);
  p.rect(AX + 1 + P.stepA, gy - 2, 4, 2, CHAR[2]); p.px(AX + 4 + P.stepA, gy - 2, CHAR[3]);
  for (let j = 0; j < 19; j++) {
    const sx = x + 2.5 + P.lean * (2 - j * 0.12);
    p.px(sx, top + 3 + j, GOLD[j % 5 === 0 ? 4 : 3]); p.px(sx + 1, top + 3 + j, GOLD[1]);
    if (j % 5 === 2) { p.px(sx, top + 3 + j, LAVA[3]); g.px(sx, top + 3 + j, GLOW[2]); }
  }
  // Gürtelkordel
  for (let k = -5; k <= 5; k++) p.px(x + k + P.lean * 1.5, top + 9 + Math.abs(k) * 0.1, k < -1 ? GOLD[2] : GOLD[3]);
  p.px(x - 3 + P.lean, top + 10, GOLD[3]); p.px(x - 3 + P.lean, top + 11, GOLD[2]); p.px(x - 3 + P.lean, top + 12, GOLD[4]);
  // Goldener Schulterkragen
  ell(p, sh.x - 0.5, sh.y + 1, 6, 2.6, GOLD.slice(1), { bias: 0.05 });
  for (let k = -5; k <= 5; k += 2) p.px(sh.x - 0.5 + k, sh.y + 3, GOLD[1]);

  // --- Kopf: Kapuze, Goldmaske, hohe Mitra mit Glutjuwel
  const hx = sh.x + 1.5 + P.head, hy = top - 4;
  ell(p, hx - 0.5, hy, 4.4, 4.4, ASHR, { bias: -0.05 });
  poly(p, [[hx - 4, hy - 1], [hx - 7 - P.wind * 2, hy + 4 + P.wind], [hx - 2, hy + 3]], ASHR[2]);
  ell(p, hx + 1.5, hy + 0.5, 2.8, 3.4, [VOID, CHAR[0]]);
  // Maske (Sonnenantlitz)
  const mx = hx + 2, my = hy - 2;
  poly(p, [[mx - 1, my], [mx + 3.5, my - 0.5], [mx + 3.8, my + 3.5], [mx + 1.5, my + 5.5], [mx - 1, my + 4]], (xx, yy) => (xx < mx + 0.5 ? GOLD[2] : yy < my + 2 ? GOLD[4] : GOLD[3]));
  p.px(mx + 2, my + 3, GOLD[1]); p.px(mx + 1, my + 4, GOLD[1]);
  const ec = ex.hurt ? '#ffffff' : LAVA[5];
  if (P.eye > 0.3) {
    p.px(mx, my + 1.5, ec); p.px(mx + 2, my + 1.5, ec);
    g.px(mx, my + 1.5, GLOW[4]); g.px(mx + 2, my + 1.5, GLOW[4]); g.px(mx + 1, my + 1.5, GLOW[1]);
  } else { p.px(mx, my + 1.5, VOID); p.px(mx + 2, my + 1.5, VOID); }
  meta.eye = { x: mx + 1, y: my + 1.5 };
  // Mitra
  const mt = { x: hx, y: hy - 3 };
  poly(p, [[mt.x - 3.5, mt.y + 1], [mt.x - 2.5, mt.y - 7], [mt.x + 0.5, mt.y - 10], [mt.x + 3, mt.y - 7], [mt.x + 3.5, mt.y + 1]], GOLD[3]);
  poly(p, [[mt.x - 3.5, mt.y + 1], [mt.x - 2.5, mt.y - 7], [mt.x + 0.5, mt.y - 10], [mt.x - 0.5, mt.y + 1]], GOLD[4]);
  p.line(mt.x - 2.5, mt.y - 7, mt.x + 0.5, mt.y - 10, GOLD[5]);
  p.line(mt.x - 3.5, mt.y + 1, mt.x + 3.5, mt.y + 1, GOLD[1]);
  // Seitenzacken
  p.line(mt.x - 3, mt.y - 2, mt.x - 5, mt.y - 6, GOLD[4]); p.px(mt.x - 5, mt.y - 7, GOLD[5]);
  p.line(mt.x + 3, mt.y - 2, mt.x + 5, mt.y - 5, GOLD[3]); p.px(mt.x + 5, mt.y - 6, GOLD[4]);
  // Juwel
  p.px(mt.x, mt.y - 4, LAVA[4]); p.px(mt.x, mt.y - 3, LAVA[2]); p.px(mt.x + 1, mt.y - 4, LAVA[3]);
  glowDot(g, mt.x, mt.y - 4, 1 + P.cast * 0.8);
  meta.head = { x: hx, y: hy - 14 };

  // --- vorderer Ärmel, Hand, Glutkugel
  const hF = { x: sh.x + P.hFx, y: sh.y + P.hFy };
  const k = ik(sh.x + 1, sh.y + 1, hF.x, hF.y, 5.5, 5.5, P.hFy < 3 ? -1 : 1);
  cap(p, sh.x + 1, sh.y + 1, k.jx, k.jy, 2.4, 2.2, ASHR, { rim: 1, bias: 0.15 });
  cap(p, k.jx, k.jy, k.ex, k.ey, 2.2, 3, ASHR, { rim: 1, bias: 0.15 });
  p.px(k.ex, k.ey + 2, GOLD[3]); p.px(k.ex + 1, k.ey + 2, GOLD[4]);           // Goldsaum am Ärmel
  p.rect(k.ex, k.ey - 0.5, 2, 2, '#6a5a50'); p.px(k.ex + 1, k.ey - 1, '#8a7868');
  meta.hand = { x: k.ex + 1, y: k.ey - 3 };
  if (P.ball > 0.3 && !ex.thrown) fireball(p, g, k.ex + 1, k.ey - 2 - P.ball * 0.6, P.ball, P.fl);
  if (ex.thrown) {
    const t = ex.thrown;
    fireball(p, g, k.ex + 3 + t * 6, k.ey - 1, 2.4, P.fl);
    for (let i = 1; i < 4; i++) { p.px(k.ex + 3 + t * 6 - i * 2, k.ey - 1 + (i % 2), LAVA[3 - (i >> 1)]); g.px(k.ex + 3 + t * 6 - i * 2, k.ey - 1 + (i % 2), GLOW[2]); }
    meta.hand = { x: k.ex + 3 + t * 6, y: k.ey - 1 };
  }
  // Zweite erhobene Hand beim Zauber (hB2: hintere Hand über dem Kopf)
  if (P.hB2 > 0.3) { p.rect(sh.x - 4, sh.y - 8 * P.hB2, 2, 2, '#6a5a50'); glowDot(g, sh.x - 3, sh.y - 9 * P.hB2, 1); }
  if (ex.smear) arcSmear(p, g, sh.x, sh.y, ex.smear[0], ex.smear[1], 6, 11, [LAVA[1], LAVA[3], LAVA[5]], 29, true);
  return meta;
}

function drawPriestCorpse(p, g, k) {
  const { AX, AY } = AP;
  const gy = AY - 1;
  for (let j = 0; j < 5; j++) {
    const hw = 12 - j * 1.8;
    for (let x = -hw; x <= hw; x++) {
      const t = 0.3 + (hw - x) / (2 * hw) * 0.5 - j * 0.02;
      p.px(AX + x, gy - j, (j < 2 ? CHAR : ASHR)[clamp(Math.floor(t * 4), 0, 3)]);
    }
  }
  for (let x = -8; x <= 6; x++) p.px(AX + x, gy - 4 + Math.abs(x) * 0.05, GOLD[x % 3 === 0 ? 4 : 2]);
  // Maske + Mitra liegen daneben
  poly(p, [[AX + 10, gy - 5], [AX + 15, gy - 4], [AX + 15, gy - 1], [AX + 10, gy - 1]], GOLD[3]);
  p.px(AX + 12, gy - 3, k < 0.5 ? LAVA[4] : VOID); p.px(AX + 14, gy - 3, VOID);
  if (k < 0.5) g.px(AX + 12, gy - 3, GLOW[3]);
  poly(p, [[AX + 16, gy], [AX + 22, gy - 2], [AX + 24, gy], [AX + 22, gy + 0.5]], GOLD[4]);
  censer(p, g, AX - 16, gy - 7, 0, k * 5);
  for (let i = 0; i < 7; i++) { const x = AX - 9 + i * 3, y = gy - hash2(i, 1, 3) * 3; if (hash2(i, 2, 3) > k) { p.px(x, y, LAVA[2]); g.px(x, y, GLOW[2]); } }
  return { eye: { x: AX + 12, y: gy - 3 }, hand: { x: AX + 8, y: gy - 2 }, head: { x: AX + 12, y: gy - 6 } };
}

function createAshPriest() {
  const S = spec(AP, drawAshPriest, RIM_GOLD, BACK_EMBER);
  const idle = [];
  for (let i = 0; i <= 6; i++) {
    const ph = (i / 6) * TAU, sn = Math.sin(ph);
    idle.push([i / 6, app({ bob: Math.max(0, sn), hem: ph, hFy: 10 + Math.max(0, sn), ball: 1.8 + sn * 0.3, fl: ph * 2, wind: sn * 0.3, cens: sn * 0.35 }), linear]);
  }
  const walk = [];
  for (let i = 0; i <= 6; i++) {
    const ph = (i / 6) * TAU, sn = Math.sin(ph), c = Math.cos(ph);
    walk.push([i / 6, app({ bob: -Math.abs(c) + 1, lean: 0.35, hem: ph * 2, stepA: sn * 3, stepB: -sn * 3, hFx: 6 + sn, hFy: 9, hBx: -6 - sn, fl: ph * 2, wind: 1, head: 0.5, cens: -0.3 + sn * 0.5, ball: 1.5 }), linear]);
  }
  // Ausholen: Hand über den Kopf, Glutkugel wächst
  const w1 = app({ lean: -0.2, hFx: 0, hFy: -5, hBx: 3, hBy: 7, ball: 2.8, fl: 1, wind: 0.4, head: -0.5, cens: 0.4 });
  const w2 = app({ lean: -0.45, hFx: -4, hFy: -9, hBx: 5, hBy: 5, ball: 4, fl: 2, wind: 0.6, head: -1, cens: 0.7 });
  const s1 = app({ lean: 0.5, hFx: 9, hFy: -3, hBx: -6, hBy: 9, ball: 3.2, fl: 3, wind: 1, head: 0.5, stepA: 3, cens: -0.6 });
  const s2 = app({ lean: 0.7, hFx: 11, hFy: 5, hBx: -7, hBy: 10, ball: 0, fl: 4, wind: 1.2, head: 1, stepA: 3, cens: -0.9 });
  const s3 = app({ lean: 0.3, hFx: 7, hFy: 8, hBx: -5, hBy: 10, ball: 0, fl: 5, wind: 0.5, stepA: 2, cens: -0.3 });
  // Glutfeld wirken: beide Hände hoch, Siegel am Boden wächst
  const c1 = app({ lean: -0.15, hFx: 3, hFy: -8, hBx: -3, hBy: -6, hB2: 1, ball: 2.5, fl: 1, cast: 0.3, head: -0.6, cens: 0.2, wind: 0.5 });
  const c2 = app({ lean: -0.3, hFx: 2, hFy: -12, hBx: -3, hBy: -8, hB2: 1.3, ball: 3.5, fl: 2, cast: 0.8, head: -1, cens: 0.4, wind: 0.8, bob: -1 });
  const c3 = app({ lean: 0.4, hFx: 9, hFy: 10, hBx: -6, hBy: 10, ball: 0, fl: 3, cast: 1.1, head: 1, cens: -0.5, wind: 1 });
  const hurtP = app({ lean: -0.6, head: -1.5, hFx: 3, hFy: 3, hBx: -6, hBy: 6, ball: 0.8, eye: 0, wind: 1, cens: 0.8 });
  const d1 = app({ lean: -0.8, bob: 1, head: -1.5, hFx: 5, hFy: 0, hBx: -7, hBy: 2, ball: 0, eye: 0, wind: 1.2, cens: 1.2 });
  const d2 = app({ lean: 0.9, bob: 7, head: 1.5, hFx: 9, hFy: 9, hBx: 0, hBy: 11, ball: 0, eye: 0, cens: -0.6 });
  return {
    idle: new Animation(track(S, idle, 6, { loop: true }), 7),
    walk: new Animation(track(S, walk, 6, { loop: true }), 9),
    windup: new Animation(track(S, [[0, idle[0][1]], [0.5, w1], [1, w2]], 4), 7, false),
    strike: new Animation(track(S, [[0, s1], [0.35, s2, snap], [1, s3]], 4, {
      extras: { 0: { fx: 'cast', smear: [-2.6, -1.0] }, 1: { thrown: 0.3, smear: [-1.8, 0.2] }, 2: { thrown: 1 } },
    }), 13, false),
    cast: new Animation(track(S, [[0, idle[0][1]], [0.35, c1], [0.75, c2], [1, c3, snap]], 7, { extras: { 6: { fx: 'impact' } } }), 7, false),
    hurt: new Animation(track(S, [[0, hurtP], [1, app({ lean: -0.2 })]], 2, { extras: { 0: { hurt: true } } }), 10, false),
    death: new Animation([
      ...track(S, [[0, hurtP], [0.4, d1], [1, d2]], 3, { extras: { 0: { hurt: true } } }),
      stillR(S, (p, g) => drawPriestCorpse(p, g, 0), 'impact', RIM_GOLD, BACK_EMBER),
      stillR(S, (p, g) => drawPriestCorpse(p, g, 0.45), null, RIM_GOLD, BACK_EMBER),
      stillR(S, (p, g) => drawPriestCorpse(p, g, 1), null, RIM_GOLD, BACK_EMBER),
    ], 8, false),
  };
}


// ================================================================ Wächter des Throns (Elite)

const SN = { W: 140, H: 112, AX: 62, AY: 100, pad: 14 };
const SD = { legH: 22, thigh: 12, shin: 12.5, spine: 19, upper: 10, fore: 10.5, sh: 3, hipW: 4 };
const SN_REST = {
  hipX: 0, hipY: 0, lean: 0.06, head: 0, headY: 0, fFx: 9, fFy: 0, fBx: -9, fBy: 0,
  hFx: 12, hFy: 16, sw: -1.1, hBx: -10, hBy: 16, heat: 1, visor: 1, kneel: 0, spin: -1, crk: 0, two: 0, ban: 0,
};
const snp = (o) => ({ ...SN_REST, ...o });
const BLADE = 38;

// Obsidian-Großschwert: Hand (hx,hy), Winkel a, Verkürzung ls (Wirbel).
function obsidianBlade(p, g, hx, hy, a, ls, heat) {
  const c = Math.cos(a) * ls, s = Math.sin(a) * ls;
  const nx = -Math.sin(a), ny = Math.cos(a);
  // Knauf + Griff (Gold/Leder)
  cap(p, hx - c * 7, hy - s * 7, hx + c * 3, hy + s * 3, 1.4, 1.4, ['#140a08', '#24140c', '#3a2214', '#553420']);
  ell(p, hx - c * 8, hy - s * 8, 2.2, 2.2, GOLD, { bias: 0.1 });
  p.px(hx - c * 8, hy - s * 8, LAVA[3]); g.px(hx - c * 8, hy - s * 8, GLOW[2]);
  // Parierstange: geschwungene Goldflügel
  for (const side of [-1, 1]) {
    for (let k = 0; k <= 7; k += 0.5) {
      const bend = (k * k) * 0.06;
      const x = hx + c * (4 + bend) + nx * side * k, y = hy + s * (4 + bend) + ny * side * k;
      p.px(x, y, k > 6 ? GOLD[5] : side > 0 ? GOLD[2] : GOLD[4]); p.px(x + c * 0.8, y + s * 0.8, GOLD[side > 0 ? 1 : 3]);
    }
  }
  ell(p, hx + c * 4.5, hy + s * 4.5, 1.8, 1.8, [LAVA[2], LAVA[3], LAVA[4], LAVA[5]]); glowDot(g, hx + c * 4.5, hy + s * 4.5, 1.5);
  // Klinge: Obsidian, facettiert, Glutkante
  const b0 = 6, b1 = BLADE;
  const lightSide = nx * -0.6 + ny * -0.8 > 0 ? 1 : -1;
  for (let t = b0; t <= b1; t += 0.5) {
    const f = (t - b0) / (b1 - b0);
    const hw = 3.4 - f * 1.1 - (f > 0.86 ? (f - 0.86) * 20 : 0);
    if (hw <= 0) continue;
    for (let k = -hw; k <= hw; k += 0.5) {
      const x = hx + c * t + nx * k, y = hy + s * t + ny * k;
      const lk = k * lightSide;
      const edge = Math.abs(k) > hw - 0.7;
      let col = lk > 0 ? (lk < 1 ? OBS[6] : OBS[4]) : lk > -1 ? OBS[3] : OBS[2];
      if (edge) col = lk > 0 ? (heat > 0.4 ? LAVA[4] : OBS[6]) : (heat > 0.4 ? LAVA[2] : OBS[1]);
      p.px(x, y, col);
      if (edge && heat > 0.4) g.px(x, y, GLOW[lk > 0 ? 3 : 1]);
    }
  }
  // Glutrunen in der Mittelkehle
  for (let t = b0 + 3; t < b1 - 6; t += 3) {
    const x = hx + c * t, y = hy + s * t;
    p.px(x, y, LAVA[heat > 0.8 ? 4 : 3]); g.px(x, y, GLOW[heat > 0.8 ? 4 : 2]);
    p.px(x + c, y + s, LAVA[2]); g.px(x + c, y + s, GLOW[1]);
  }
  return { tip: { x: hx + c * b1, y: hy + s * b1 }, mid: { x: hx + c * (b1 * 0.6), y: hy + s * (b1 * 0.6) } };
}

// Kantige Obsidianplatte (Schulter, Knie): gedrehtes Polygon mit Goldrand
function plate(p, x, y, pts, rimC = GOLD[3]) {
  const P2 = pts.map(([a, b]) => [x + a, y + b]);
  poly(p, P2, OBS[3]);
  // helle Facette oben links
  const cx = P2.reduce((a, q) => a + q[0], 0) / P2.length, cy = P2.reduce((a, q) => a + q[1], 0) / P2.length;
  poly(p, P2.map(([a, b]) => [cx + (a - cx) * 0.7 - 1, cy + (b - cy) * 0.7 - 1]), OBS[5]);
  for (let i = 0; i < P2.length; i++) {
    const a = P2[i], b = P2[(i + 1) % P2.length];
    const top = (a[1] + b[1]) / 2 < cy;
    p.line(a[0], a[1], b[0], b[1], top ? rimC : GOLD[1]);
  }
}

// Flammenbanner auf dem Rücken des Wächters: Stange hinter der Schulter, Tuch in Violett/Gold
// mit Glutflamme, oben eine echte Flamme. sway = Wehen (Pose), t = Zeit
function flameBanner(p, g, bx, by, sway, t, heat) {
  const top = by - 50;
  // Stange (dunkles Holz, Goldringe), Spitze mit Glutschale
  for (let y = top; y <= by; y++) { p.px(bx, y, '#24140c'); p.px(bx + 1, y, y % 9 === 0 ? GOLD[3] : '#3a2214'); }
  p.rect(bx - 2, top - 1, 6, 2, GOLD[3]); p.line(bx - 2, top - 1, bx + 3, top - 1, GOLD[5]);
  // Querstange
  p.line(bx - 18, top + 3, bx + 1, top + 3, GOLD[2]); p.px(bx - 18, top + 3, GOLD[5]); p.px(bx - 19, top + 2, GOLD[4]);
  // Tuch: hängt von der Querstange, weht nach hinten (links), Schwalbenschwanz unten
  const W = 17, Hh = 30;
  for (let i = 0; i <= W; i++) {
    const u = i / W;
    const len = Hh - (u > 0.3 && u < 0.7 ? 5 * (1 - Math.abs(u - 0.5) / 0.2) : 0);
    for (let j = 0; j < len; j++) {
      const v = j / Hh;
      const x = bx - 1 - i - sway * v * 3 + Math.sin(t * 5 + v * 4 + u * 2) * v * 1.2, y = top + 4 + j;
      const edge = i === 0 || j >= len - 1;
      const fold = Math.sin(u * 9 + v * 3 - t * 4);
      let c = edge ? (j >= len - 1 ? GOLD[3] : GOLD[4]) : fold > 0.55 ? OBS[5] : fold > -0.2 ? OBS[4] : OBS[3];
      if (i === W) c = OBS[2];
      if (!edge && j > 1 && j < 3) c = GOLD[4];
      if (!edge && j >= len - 3 && j < len - 1) c = GOLD[2];
      p.px(x, y, c);
    }
  }
  // gestickte Flamme (Glut) in der Mitte des Tuchs
  const fx = bx - 1 - W / 2, fy = top + 18;
  const F = [[0, -8], [0, -7], [-1, -6], [1, -6], [-1, -5], [0, -5], [2, -5], [-2, -4], [-1, -4], [0, -4], [1, -4], [2, -3], [-2, -3], [-1, -3], [0, -3], [1, -3], [-3, -1], [-2, -2], [-1, -2], [0, -2], [1, -2], [2, -2], [3, -1], [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1]];
  for (const [dx, dy] of F) { const x = fx + dx - sway * ((fy + dy - top) / Hh) * 3, y = fy + dy; const inner = Math.abs(dx) <= 1 && dy > -4; p.px(x, y, inner ? LAVA[5] : dy < -4 ? LAVA[4] : LAVA[3]); g.px(x, y, GLOW[inner ? 3 : 2]); }
  // echte Flamme auf der Stangenspitze
  flame(p, g, bx + 0.5, top - 2, Math.round(6 + heat * 3), 2, t * 7, { seed: 11, hot: heat });
}

function drawSentinel(p, g, P, ex) {
  const { AX, AY } = SN;
  const K = P.kneel;
  const R = rig({ ...P, hipY: P.hipY + K * 10 }, SD, AX, AY);
  const { hip, chest, pt, legF, legB, shF, shB } = R;
  const meta = {};
  const heat = P.heat;
  if (K > 0.01) {
    const kx = hip.x - 4 - K * 3, ky = AY - 3;
    legB.jx += (kx - legB.jx) * K; legB.jy += (ky - legB.jy) * K;
    legB.ex += (kx - 14 - legB.ex) * K; legB.ey += (AY - legB.ey) * K;
  }
  // Schwerthand (vorn), Faust (hinten) – im Wirbel führen beide Hände das Schwert
  const hF = { x: chest.x + P.hFx, y: chest.y + P.hFy };
  let swA = P.sw, swL = 1;
  const spinning = P.spin >= 0;
  if (spinning) {
    const ph = P.spin * TAU, vx = Math.cos(ph), vy = Math.sin(ph) * 0.38;
    swA = Math.atan2(vy, vx); swL = Math.max(0.3, Math.hypot(vx, vy));
    hF.x = chest.x + 2 + vx * 11; hF.y = chest.y + 9 + vy * 11;
  }
  const hB = ex.twoHand || spinning || P.two > 0.5 ? { x: hF.x - Math.cos(swA) * 6 * swL, y: hF.y - Math.sin(swA) * 6 * swL } : { x: chest.x + P.hBx, y: chest.y + P.hBy };
  const armF = ik(shF.x, shF.y, hF.x, hF.y, SD.upper, SD.fore, 1);
  const armB = ik(shB.x, shB.y, hB.x, hB.y, SD.upper, SD.fore, 1);
  const behind = spinning ? Math.sin(P.spin * TAU) < 0 : !!ex.bladeBehind;

  // --- Ketten hängen von den Schultern (hinten)
  for (let i = 0; i < 2; i++) {
    const c0 = pt(SD.spine - 2, -5 - i * 3);
    for (let j = 0; j < 9 - K * 3; j++) {
      const x = c0.x - 1 - j * 0.4 + Math.sin(ex.t * 6 + j * 0.6 + i) * 0.4 * j * 0.15, y = c0.y + j * 2;
      p.px(x, y, j % 2 ? GOLD[2] : GOLD[3]); p.px(x, y + 1, j % 2 ? GOLD[1] : GOLD[4]);
    }
  }
  // --- Flammenbanner auf dem Rücken (hinter allem)
  { const bp = pt(SD.spine + 1, -7); flameBanner(p, g, bp.x - 1, bp.y + 10, 0.6 + P.ban + Math.sin(ex.t * 3) * 0.3, ex.t, heat); }
  // --- Klinge hinten
  let bl = null;
  const smear = () => {
    if (!ex.smear) return;
    const [a0, a1, sy] = ex.smear;
    smearArc(p, g, ex.smearC ? chest.x + ex.smearC.x : shF.x, ex.smearC ? chest.y + ex.smearC.y : shF.y, a0, a1, ex.smearR0 ?? 26, ex.smearR1 ?? (SD.upper + SD.fore + BLADE - 6), [LAVA[2], LAVA[4], LAVA[5]], [GLOW[2], GLOW[3]], sy ?? 1);
  };
  if (behind) { smear(); bl = obsidianBlade(p, g, hF.x, hF.y, swA, swL, heat); }

  // --- hinteres Bein
  const RB = OBS_D.concat(OBS[5]);
  cap(p, hip.x - 3, hip.y, legB.jx, legB.jy, 5.5, 5, RB);
  cap(p, legB.jx, legB.jy, legB.ex, legB.ey - 4, 5, 4.6, RB);
  poly(p, [[legB.ex - 5, legB.ey], [legB.ex - 5, legB.ey - 5], [legB.ex + 4, legB.ey - 5], [legB.ex + 9, legB.ey]], OBS[2]);
  plate(p, legB.jx, legB.jy, [[-3, -3], [3, -4], [4, 2], [-2, 3]], GOLD[2]);
  // --- hinterer Arm
  cap(p, shB.x, shB.y, armB.jx, armB.jy, 4.5, 4, RB);
  cap(p, armB.jx, armB.jy, armB.ex, armB.ey, 4, 4.5, RB);
  ell(p, armB.ex, armB.ey, 3.6, 3.6, RB, { bias: 0.05 });
  // hintere Schulterplatte
  plate(p, shB.x - 2, shB.y - 1, [[-6, -4], [4, -6], [7, 1], [-4, 5]], GOLD[2]);

  // --- Rumpf: massiver Obsidiankörper, Goldbänder, Glutkern
  for (let i = 0; i < 5; i++) {                                   // Tassetten
    const a = pt(0, -9 + i * 4.4);
    poly(p, [[a.x, a.y], [a.x + 4.4, a.y], [a.x + 4.8, a.y + 9 - Math.abs(i - 2)], [a.x - 0.4, a.y + 9 - Math.abs(i - 2)]], OBS[i % 2 ? 3 : 4]);
    p.line(a.x - 0.4, a.y + 9 - Math.abs(i - 2), a.x + 4.8, a.y + 9 - Math.abs(i - 2), GOLD[2]);
    p.px(a.x + 1, a.y + 1, OBS[6]);
  }
  const hp = pt(1, 0), cp = pt(SD.spine - 3, 0.5);
  cap(p, hp.x, hp.y, cp.x, cp.y, 8, 11, OBS, { noise: 0.05, seed: 3 });
  ell(p, cp.x + 1, cp.y, 12.5, 10, OBS, { rot: P.lean, bias: 0.05, noise: 0.05, seed: 4 });
  const q = (u, k, c) => { const o = pt(u, k); p.px(o.x, o.y, c); };
  for (let k = -9; k <= 9; k += 0.5) { q(2, k, GOLD[2]); q(2.7, k, GOLD[k < 0 ? 4 : 3]); }          // Gürtel
  for (let k = -10; k <= 10; k += 0.5) q(SD.spine - 9 + Math.abs(k) * 0.12, k, GOLD[k < -2 ? 4 : 3]); // Brustband
  // Filigran
  const fl0 = pt(SD.spine - 5, -7); filigree(p, fl0.x, fl0.y, 6, 2);
  const fl1 = pt(SD.spine - 5, 4); filigree(p, fl1.x, fl1.y, 5, 4);
  // Glutkern (Sonne im Brustpanzer)
  const cc = pt(SD.spine - 4, 1);
  ell(p, cc.x, cc.y, 4.2, 4.2, GOLD.slice(1), { bias: 0.05 });
  const hot = heat;
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
    if (i * i + j * j > 5) continue;
    const v = (1 - Math.hypot(i, j) / 3) * 0.6 + hot * 0.3 + hash2(i, j, 5) * 0.15;
    const ci = v > 0.8 ? 5 : v > 0.6 ? 4 : v > 0.4 ? 3 : 2;
    p.px(cc.x + i, cc.y + j, LAVA[ci]); g.px(cc.x + i, cc.y + j, GLOW[Math.min(4, ci - 1)]);
  }
  for (let i = 0; i < 8; i++) { const a = i * TAU / 8; p.px(cc.x + Math.cos(a) * 5.5, cc.y + Math.sin(a) * 5.5, GOLD[4]); }
  meta.chest = { x: cc.x, y: cc.y };
  // Glutrisse im Obsidian
  veins(p, g, cp.x - 3, cp.y + 3, 9, 7, 23, 3 + Math.round(P.crk * 4), 0.7 + P.crk * 0.5, { len: 6 });
  const lg = pt(3, -3); veins(p, g, lg.x, lg.y, 5, 4, 27, 1 + Math.round(P.crk * 2), 0.8, { len: 4 });

  // --- vorderes Bein
  occlude(g);
  cap(p, hip.x + 3, hip.y, legF.jx, legF.jy, 6, 5.5, OBS, { rim: 0 });
  cap(p, legF.jx, legF.jy, legF.ex, legF.ey - 4, 5.5, 5, OBS);
  p.line(legF.jx + 3, legF.jy + 2, legF.ex + 3, legF.ey - 5, OBS[6]);
  poly(p, [[legF.ex - 5, legF.ey], [legF.ex - 5, legF.ey - 5], [legF.ex + 4, legF.ey - 5], [legF.ex + 10, legF.ey]], OBS[4]);
  p.line(legF.ex - 5, legF.ey - 5, legF.ex + 4, legF.ey - 5, GOLD[3]); p.line(legF.ex + 4, legF.ey - 5, legF.ex + 10, legF.ey, GOLD[2]);
  plate(p, legF.jx + 1, legF.jy, [[-4, -4], [4, -5], [5, 3], [-3, 4]]);
  p.px(legF.jx + 1, legF.jy, LAVA[3]); g.px(legF.jx + 1, legF.jy, GLOW[2]);
  occlude(null);

  // --- Kopf: gekrönter Helm mit Glutschlitz
  const neck = pt(SD.spine + 2, 1.5);
  const hx = Math.round(neck.x + P.head), hy = Math.round(neck.y - 5 + P.headY);
  ell(p, hx - 1, hy + 5, 5.5, 3, OBS_D.concat(OBS[5]));
  ell(p, hx, hy, 6, 6.8, OBS, { bias: 0.1 });
  poly(p, [[hx - 6, hy], [hx + 6.5, hy - 1], [hx + 7, hy + 4], [hx + 2, hy + 7], [hx - 5, hy + 6]], OBS[3]);
  poly(p, [[hx - 6, hy], [hx, hy - 0.5], [hx - 1, hy + 6], [hx - 5, hy + 6]], OBS[4]);
  // Gehörnter Großhelm (keine Krone – die trägt nur der Fürst): flacher Scheitel mit Goldgrat,
  // zwei mächtige Stierhörner, die nach oben-vorn schwingen
  p.rect(hx - 6, hy - 4, 13, 2, OBS[4]); p.line(hx - 6, hy - 4, hx + 6, hy - 4, OBS[6]); p.line(hx - 6, hy - 3, hx + 6, hy - 3, GOLD[3]);
  for (let i = -5; i <= 5; i++) p.px(hx + i * 0.5, hy - 5 - (5 - Math.abs(i)) * 0.35, GOLD[i < 0 ? 5 : 4]);
  for (const side of [-1, 1]) {
    const bx = hx + (side < 0 ? -5 : 5), by = hy - 2;
    for (let k = 0; k <= 12; k += 0.5) {
      const f = k / 12;
      const x = bx + side * (k * 0.75 - f * f * 3) + (side < 0 ? -1 : 0), y = by - k * 0.55 - f * f * 6;
      const w = Math.max(0.5, 1.8 * (1 - f));
      for (let q = -w; q <= w; q += 0.5) p.px(x, y + q, f > 0.8 ? GOLD[5] : q < 0 ? (side < 0 ? OBS[5] : OBS[6]) : (side < 0 ? OBS[2] : OBS[3]));
      if (f > 0.85) g.px(x, y, GLOW[1]);
    }
    p.px(bx, by, GOLD[3]); p.px(bx, by + 1, GOLD[2]);
  }
  p.px(hx, hy - 4, LAVA[4]); g.px(hx, hy - 4, GLOW[3]);
  // Visierschlitz
  const vs = P.visor, ec = ex.hurt ? '#ffffff' : LAVA[5];
  p.rect(hx + 0, hy + 1, 7, 2, VOID);
  for (let i = -4; i <= -1; i += 3) p.px(hx + i, hy + 2, GOLD[4]);           // Nieten
  if (vs > 0.2) {
    // ein glühender Schlitz (zwei heiße Augenpunkte), darunter tiefer Schatten
    p.rect(hx + 1, hy + 1, 5, 1, LAVA[3]); p.rect(hx + 1, hy + 2, 5, 1, VOID);
    p.px(hx + 2, hy + 1, ec); p.px(hx + 4, hy + 1, ec); p.px(hx + 3, hy + 1, LAVA[4]);
    g.rect(hx + 1, hy + 1, 5, 1, GLOW[vs > 0.8 ? 4 : 2]); g.rect(hx + 1, hy + 2, 5, 1, GLOW[2]);
    if (vs > 1.2) { g.rect(hx + 1, hy + 1, 7, 2, GLOW[3]); g.rect(hx + 2, hy + 1, 5, 1, GLOW[4]); }
  }
  meta.eye = { x: hx + 3, y: hy + 1 };
  meta.head = { x: hx, y: hy - 14 };
  meta.mouth = { x: hx + 5, y: hy + 4 };

  // --- vorderer Arm + Schwert + große Schulterplatte
  const arm = () => {
    occlude(g);
    cap(p, shF.x, shF.y, armF.jx, armF.jy, 5, 4.5, OBS);
    cap(p, armF.jx, armF.jy, armF.ex, armF.ey, 4.5, 5, OBS);
    plate(p, armF.jx, armF.jy, [[-3, -2], [3, -3], [3, 3], [-3, 2]], GOLD[3]);
    ell(p, armF.ex, armF.ey, 3.8, 3.8, OBS, { bias: 0.1 });
    p.px(armF.ex - 2, armF.ey - 2, GOLD[4]);
    occlude(null);
  };
  if (!behind) { smear(); arm(); bl = obsidianBlade(p, g, hF.x, hF.y, swA, swL, heat); ell(p, hF.x, hF.y, 3, 3, OBS, { bias: 0.1 }); p.px(hF.x - 1, hF.y - 2, GOLD[4]); }
  else arm();
  occlude(g);
  // Schulterplatte etwas tiefer und nach hinten gesetzt, Dorn hinten: der Helm mit
  // dem Glutvisier bleibt frei sichtbar (vorher verdeckte die Platte das Gesicht)
  plate(p, shF.x - 1, shF.y + 1, [[-7, -2], [2, -5], [7, -1], [6, 5], [-5, 5]], GOLD[4]);
  occlude(null);
  poly(p, [[shF.x - 5, shF.y - 3], [shF.x - 6, shF.y - 12], [shF.x - 2, shF.y - 4]], OBS[4]);
  p.line(shF.x - 5, shF.y - 4, shF.x - 6, shF.y - 12, OBS[6]); p.px(shF.x - 6, shF.y - 12, GOLD[5]);
  p.px(shF.x + 1, shF.y + 1, LAVA[3]); g.px(shF.x + 1, shF.y + 1, GLOW[2]);
  meta.hand = { x: hF.x, y: hF.y };
  meta.tip = bl.tip;

  // --- Brüllen: Hitzewellen vor dem Visier
  if (ex.roarFx) {
    for (let r = 6; r < 22; r += 5) for (let a = -0.8; a <= 0.8; a += 0.1) {
      const x = meta.eye.x + 4 + Math.cos(a) * (r + ex.roarFx * 3), y = meta.eye.y + Math.sin(a) * (r + ex.roarFx * 3);
      if (hash2(Math.round(a * 20), r, 8) < 0.5) g.px(x, y, GLOW[r < 10 ? 2 : 1]);
    }
    for (let i = 0; i < 10; i++) { const x = cc.x + (hash2(i, 1, 3) - 0.5) * 30, y = cc.y - hash2(i, 2, 3) * 30 * ex.roarFx * 0.4; p.px(x, y, LAVA[4]); g.px(x, y, GLOW[3]); }
  }
  // --- Einschlag: Glut bricht aus dem Boden
  if (ex.erupt) {
    const bx = ex.eruptX != null ? AX + ex.eruptX : bl.tip.x, gy = AY - 1;
    dustRing(p, g, bx, gy, 8 + ex.erupt * 14, 63, [OBS[3], OBS[5], CHAR[3]]);
    for (let i = 0; i < 6; i++) {
      const xx = bx + (i - 2.5) * (2 + ex.erupt * 3);
      flame(p, g, xx, gy, Math.round((5 + hash2(i, 1, 9) * 10) * ex.erupt * (1 - Math.abs(i - 2.5) / 4)), 2, ex.erupt * 4 + i, { seed: 70 + i, hot: 1 });
    }
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.45, d = 3 + ex.erupt * 6;
      shard(p, g, bx + Math.cos(a) * d * 1.6, gy, a, (4 + hash2(i, 3, 9) * 5) * ex.erupt, 1.6, OBS, { base: 0.3, gl: [GLOW[1], GLOW[2]] });
    }
  }
  p.ctx.clearRect(-20, AY + 1, 300, 60); g.ctx.clearRect(-20, AY + 1, 300, 60);
  return meta;
}

// Zerborstener Wächter: Obsidiantrümmer, gehörnter Helm, Schwert (k 0..1)
function drawSentinelRubble(p, g, k) {
  const { AX, AY } = SN;
  const gy = AY;
  const heat = 1 - k;
  // umgestürztes Flammenbanner hinter den Trümmern
  for (let x = AX - 50; x <= AX - 6; x++) { p.px(x, gy - 2, '#3a2214'); p.px(x, gy - 3, (x % 9) ? '#24140c' : GOLD[3]); }
  for (let i = 0; i < 14; i++) for (let j = 0; j < 7; j++) p.px(AX - 44 + i + j * 0.4, gy - 4 - j * 0.6 + (i % 4 === 0 ? 1 : 0), j === 6 || i === 0 ? GOLD[3] : (i + j) % 5 === 0 ? OBS[5] : OBS[4]);
  if (heat > 0.2) flame(p, g, AX - 50, gy - 3, Math.round(1 + heat * 3), 1.2, k * 5, { seed: 12, hot: heat });
  obsidianBlade(p, g, AX + 6, gy - 3, -0.04, 1, heat * 0.8);
  const chunks = [[-26, 5, 4], [-18, 7, 6], [-8, 9, 8], [4, 8, 7], [14, 6, 5], [-30, 4, 3], [22, 5, 4]];
  for (const [dx, rx, ry] of chunks) ell(p, AX + dx, gy - ry * 0.8, rx, ry, OBS, { noise: 0.07, seed: dx + 50 });
  for (const [dx, rx] of chunks) veins(p, g, AX + dx, gy - 4, rx, 3, dx + 90, 2, heat * 0.9, { len: 4, dark: CHAR[1] });
  plate(p, AX - 12, gy - 16, [[-7, -3], [3, -7], [9, -2], [7, 5], [-5, 5]], GOLD[3]);
  // Brustkern verglimmt
  ell(p, AX - 4, gy - 12, 4, 4, GOLD.slice(1));
  ell(p, AX - 4, gy - 12, 2.2, 2.2, heat > 0.3 ? [LAVA[2], LAVA[3], LAVA[4]] : [CHAR[1], CHAR[2]]);
  if (heat > 0.1) glowDot(g, AX - 4, gy - 12, 1 + heat * 2);
  // Gehörnter Helm liegt davor
  const cx = AX + 20;
  ell(p, cx, gy - 4, 5, 4, OBS, { bias: 0.1 });
  p.line(cx - 5, gy - 6, cx + 5, gy - 6, GOLD[3]); p.rect(cx + 1, gy - 4, 4, 1, heat > 0.3 ? LAVA[3] : VOID);
  for (const side of [-1, 1]) for (let k = 0; k <= 7; k += 0.5) { const f = k / 7; p.px(cx + side * (4 + k * 0.7), gy - 6 - k * 0.5 - f * f * 3, f > 0.8 ? GOLD[5] : OBS[5]); }
  for (let i = 0; i < 6; i++) if (heat > 0.2) flame(p, g, AX - 22 + i * 8, gy - 6, Math.round(1 + heat * 4 * hash2(i, 2, 7)), 1.2, k * 6 + i, { seed: 80 + i, hot: heat });
  return { eye: { x: AX - 4, y: gy - 12 }, head: { x: cx, y: gy - 10 }, hand: { x: AX + 6, y: gy - 3 }, chest: { x: AX - 4, y: gy - 12 }, tip: { x: AX + 44, y: gy - 3 } };
}

function createSentinel() {
  const S = spec(SN, (p, g, P, ex, t) => drawSentinel(p, g, P, { ...ex, t }), RIM_GOLD, BACK_EMBER);
  const idle = [];
  for (let i = 0; i <= 6; i++) {
    const ph = (i / 6) * TAU, sn = Math.sin(ph);
    idle.push([i / 6, snp({ two: 1, hipY: Math.max(0, sn), lean: 0.06 + sn * 0.012, hFx: 9, hFy: 12 + Math.max(0, sn), headY: Math.max(0, sn), heat: 0.9 + sn * 0.15, visor: 1, sw: -1.32 + sn * 0.03, ban: sn * 0.3 }), linear]);
  }
  const walk = [];
  for (let i = 0; i <= 8; i++) {
    const ph = (i / 8) * TAU, sn = Math.sin(ph), c = Math.cos(ph);
    walk.push([i / 8, snp({
      hipX: 1, hipY: 1.5 - Math.abs(c) * 2.5, lean: 0.12 + sn * 0.02, head: sn * 0.5, headY: Math.abs(c),
      fFx: 3 + sn * 10, fFy: Math.max(0, -c) * 5, fBx: -4 - sn * 10, fBy: Math.max(0, c) * 5,
      two: 1, hFx: 10 - sn * 1.5, hFy: 12, sw: -1.25 - sn * 0.05, ban: 0.6,
    }), linear]);
  }
  // Hieb: Schwert über die Schulter, dann schräg nach vorn-unten
  const w1 = snp({ lean: -0.05, hipX: -1, hFx: 4, hFy: -6, sw: -1.9, fFx: 11, fBx: -11, heat: 1.2 });
  const w2 = snp({ lean: -0.2, hipX: -2, hipY: -1, hFx: -3, hFy: -12, sw: -2.7, fFx: 12, fBx: -12, heat: 1.4, visor: 1.3 });
  const s1 = snp({ lean: 0.2, hipX: 3, hipY: 2, hFx: 18, hFy: -6, sw: -0.6, fFx: 15, fBx: -12, heat: 1.4, visor: 1.3 });
  const s2 = snp({ lean: 0.38, hipX: 5, hipY: 6, hFx: 20, hFy: 12, sw: 0.55, fFx: 16, fBx: -13, heat: 1.5, visor: 1.3 });
  const s3 = snp({ ...s2, lean: 0.34, hFy: 13, heat: 1.2 });
  const s4 = snp({ lean: 0.15, hipX: 2, hipY: 2, hFx: 14, hFy: 16, sw: -0.3, fFx: 12, fBx: -11 });
  // Brüllen
  const r1 = snp({ lean: -0.08, hFx: 16, hFy: 4, sw: -0.9, hBx: -17, hBy: 6, headY: -1, visor: 1.5, heat: 1.4 });
  const r2 = snp({ lean: -0.24, hipY: -1, hFx: 18, hFy: -6, sw: -1.25, hBx: -19, hBy: -2, headY: -3, head: -1, visor: 2, heat: 1.9, crk: 1 });
  // Bodenstoß (slam): Schwert senkrecht hoch, dann mit der Spitze in den Boden
  const sl1 = snp({ lean: -0.08, hipY: -1, hFx: 8, hFy: -16, sw: -1.62, heat: 1.3, visor: 1.2 });
  const sl2 = snp({ lean: -0.2, hipY: -3, hFx: 6, hFy: -22, sw: -1.6, heat: 1.7, visor: 1.5, fBy: 2, crk: 0.5 });
  const sl3 = snp({ lean: 0.4, hipY: 10, hFx: 20, hFy: 4, sw: 1.52, heat: 2, visor: 1.8, fFx: 15, fBx: -13, crk: 1 });
  const sl4 = snp({ ...sl3, lean: 0.38, heat: 1.6, visor: 1.3 });
  const sl5 = snp({ lean: 0.15, hipY: 3, hFx: 14, hFy: 16, sw: -0.4, heat: 1.1 });
  // Wirbel (spin): Schwert kreist waagerecht um den Körper
  const spin = [];
  for (let i = 0; i < 8; i++) {
    const ph = i / 8, a1 = ph * TAU;
    spin.push(snp({ spin: ph, lean: 0.05, hipY: 3, fFx: 12 + Math.sin(a1) * 2, fBx: -12 + Math.sin(a1) * 2, fFy: i % 4 === 0 ? 1.5 : 0, head: Math.cos(a1) * 1, heat: 1.5, visor: 1.4 }));
  }
  const hurtP = snp({ lean: -0.18, hipX: -3, head: -2, headY: -1, hFx: 9, hFy: 14, sw: -0.8, hBx: -13, hBy: 12, visor: 1.6, heat: 1.5, crk: 0.6 });
  const d1 = snp({ lean: -0.28, hipX: -4, head: -2, hFx: 8, hFy: 14, sw: -0.4, hBx: -14, hBy: 12, visor: 1.3, heat: 1.4, crk: 1 });
  const d2 = snp({ lean: 0.4, kneel: 1, hipY: 3, head: 1, headY: 2, hFx: 18, hFy: 16, sw: 1.52, visor: 0.8, heat: 0.9, crk: 1.4 });
  const d3 = snp({ lean: 0.6, kneel: 1, hipY: 6, head: 2, headY: 4, hFx: 19, hFy: 16, sw: 1.5, visor: 0.3, heat: 0.6, crk: 1.6 });
  const T = (keys, n, o) => track(S, keys, n, o);
  return {
    idle: new Animation(T(idle, 6, { loop: true }), 5),
    walk: new Animation(T(walk, 8, { loop: true, extras: { 0: { fx: 'step' }, 4: { fx: 'step' } } }), 7),
    windup: new Animation(T([[0, idle[0][1]], [0.45, w1], [1, w2]], 5, { extras: { 3: { bladeBehind: true }, 4: { bladeBehind: true } } }), 8, false),
    strike: new Animation(T([[0, s1], [0.25, s2, snap], [0.6, s3], [1, s4]], 5, {
      extras: { 0: { smear: [-2.3, -0.7] }, 1: { fx: 'impact', smear: [-1.4, 0.6] }, 2: { smear: [0.2, 0.6] } },
    }), 12, false),
    roar: new Animation(T([[0, idle[0][1]], [0.3, r1], [0.5, r2, snap], [0.85, { ...r2, heat: 2 }], [1, snp({ ...r1, visor: 1.2 })]], 8, {
      extras: { 3: { fx: 'roar', roarFx: 1 }, 4: { roarFx: 2 }, 5: { roarFx: 3 }, 6: { roarFx: 4 } },
    }), 7, false),
    slam: new Animation(T([[0, idle[0][1]], [0.25, sl1], [0.45, sl2], [0.6, sl3, snap], [0.8, sl4], [1, sl5]], 9, {
      extras: { 1: { twoHand: true }, 2: { twoHand: true }, 3: { twoHand: true }, 4: { twoHand: true, smear: [-1.7, 0.1] }, 5: { twoHand: true, fx: 'impact', erupt: 0.6 }, 6: { twoHand: true, erupt: 1 }, 7: { erupt: 0.7 } },
    }), 9, false),
    spin: new Animation(spin.map((P, i) => T([[0, P], [1, P]], 1, { extras: { 0: { smear: [i / 8 * TAU - 2.2, i / 8 * TAU, 0.38], smearC: { x: 2, y: 9 }, smearR0: 30, smearR1: 48, fx: i % 4 === 0 ? 'step' : null } } })[0]), 16),
    hurt: new Animation(T([[0, hurtP], [1, snp({ lean: 0 })]], 2, { extras: { 0: { hurt: true } } }), 8, false),
    death: new Animation([
      ...T([[0, hurtP], [0.3, d1], [0.65, d2, snap], [1, d3]], 4, { extras: { 0: { hurt: true }, 2: { fx: 'impact', erupt: 0.4 } } }),
      stillR(S, (p, g) => drawSentinelRubble(p, g, 0), 'impact', RIM_GOLD, BACK_EMBER),
      stillR(S, (p, g) => drawSentinelRubble(p, g, 0.45), null, RIM_GOLD, BACK_EMBER),
      stillR(S, (p, g) => drawSentinelRubble(p, g, 1), null, RIM_GOLD, BACK_EMBER),
    ], 6, false),
  };
}

// ================================================================ Export

const THRONE = {
  throne_guard: createThroneGuard,
  ash_priest: createAshPriest,
  ember_hellhound: createHellhound,
  throne_sentinel: createSentinel,
};

// only (optional): nur eine Figur erzeugen. Jede Figur wird erst beim ersten
// Zugriff gezeichnet und dann gecacht (wie createForgeFoes).
export function createThroneFoes(only) {
  const out = {};
  for (const k in THRONE) {
    if (only && only !== k) continue;
    Object.defineProperty(out, k, {
      configurable: true, enumerable: true,
      get() {
        const v = THRONE[k]();
        Object.defineProperty(out, k, { value: v, writable: true, configurable: true, enumerable: true });
        return v;
      },
    });
  }
  return out;
}
