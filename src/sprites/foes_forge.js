import { PAL } from '../gfx/Palette.js';
import { Animation } from '../gfx/Sprite.js';
import { FK } from './foes_cinder.js';

// Gegner der Glutschmiede: Schmiedegolem, Flammenakolyth, Glutdrache und
// der Wächter der Esse (Elite). Gleicher Rig-/Glow-Ansatz wie foes_cinder.js
// (Werkzeuge aus FK). Blickrichtung rechts, Anker = Bodenkontakt.

const {
  GLOW, LAVA, linear, snap, clamp, ell, cap, poly, ik, glowDot, veins, flame,
  track, still, arcSmear, dustRing, occlude, robe, hash2, SMEAR, CHAR, VOID,
} = FK;

// ================================================================ Materialien

const IRON = ['#0f1117', '#1a1e27', '#292e3a', '#3d4351', '#58606f', '#838c9d'];
const IRON_D = ['#0b0c11', '#13161d', '#1d2129', '#2a2f39', '#383e4a'];
const BRASS = ['#2e1c0c', '#553314', '#80521e', '#b07e30', '#d8aa4a', '#f6dc8a'];
const SHINE = PAL.steel[5];
const ACO = ['#170808', '#2c0e0c', '#481610', '#6a2414', '#8e3a1a', '#b25a26'];
const ACO_CH = ['#120a0a', '#201212', '#2e1a16', '#40241c'];
const SKIN = ['#3a2218', '#5e3624', '#8a5238', '#b0724c'];
const DRK = ['#16060a', '#2e0c10', '#4c1416', '#6e2018', '#98321e', '#c0502a'];
const DRK_D = ['#10050a', '#1e080c', '#320e12', '#481614', '#5e1e18'];
const BELLY = ['#4a1c10', '#7a3818', '#a85a24', '#d08a3a', '#f0b860'];
const MEMB = ['#1a060a', '#34100e', '#561a12', '#7e2a16'];
const HORN = PAL.bone;

// Kantiger Block (Licht oben links, abgeschrägte Ecken)
function box(p, x, y, w, h, ramp, o = {}) {
  const { chamfer = 1, bias = 0, noise = 0, seed = 1 } = o;
  x = Math.round(x); y = Math.round(y);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const cx = Math.min(i, w - 1 - i), cy = Math.min(j, h - 1 - j);
      if (cx + cy < chamfer) continue;
      let t = 0.62 - (i / w) * 0.3 - (j / h) * 0.28 + bias;
      if (j === 0) t += 0.28; else if (i === 0) t += 0.16;
      if (j === h - 1) t -= 0.35; else if (i === w - 1) t -= 0.25;
      if (noise) t += (hash2(i, j, seed) - 0.5) * noise;
      p.px(x + i, y + j, ramp[clamp(Math.floor(t * ramp.length), 0, ramp.length - 1)]);
    }
  }
}

// Gedrehter Quader (Hammerkopf, Stiel): Mitte (cx,cy), Achse a, Länge len, Breite wid
function obox(p, cx, cy, a, len, wid, ramp, o = {}) {
  const { bias = 0, face = null } = o;
  const c = Math.cos(a), s = Math.sin(a);
  const R = Math.ceil(Math.hypot(len, wid) / 2) + 1;
  // Seite, deren Normale am ehesten nach links oben zeigt, ist hell
  const nx = -s, ny = c;
  const lightV = nx * -0.6 + ny * -0.8; // >0: +v ist die helle Seite
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
    const u = x + 0.5 - (cx - Math.floor(cx)) + 0 , v0 = y + 0.5 - (cy - Math.floor(cy));
    const lu = u * c + v0 * s, lv = -u * s + v0 * c;
    if (Math.abs(lu) > len / 2 || Math.abs(lv) > wid / 2) continue;
    const across = (lv / (wid / 2)) * (lightV > 0 ? 1 : -1); // 1 = helle Kante
    const along = lu / (len / 2);
    let t = 0.45 + across * 0.3 - along * c * 0.08 + bias;
    if (Math.abs(lv) > wid / 2 - 1) t += across > 0 ? 0.2 : -0.25;
    if (face && Math.abs(lu) > len / 2 - 1) t = face;
    p.px(Math.floor(cx) + x, Math.floor(cy) + y, ramp[clamp(Math.floor(t * ramp.length), 0, ramp.length - 1)]);
  }
}

const rivet = (p, x, y) => { p.px(x, y, BRASS[4]); p.px(x + 1, y + 1, BRASS[1]); };

// Funkenregen (Schmiedeschlag) auf beiden Ebenen
function sparks(p, g, x, y, r, seed, n = 14) {
  for (let i = 0; i < n; i++) {
    const a = -Math.PI * (0.1 + hash2(i, 1, seed) * 0.8);
    const d = r * (0.4 + hash2(i, 2, seed) * 0.8);
    const sx = x + Math.cos(a) * d, sy = y + Math.sin(a) * d * 0.8;
    const l = 1 + Math.floor(hash2(i, 3, seed) * 2);
    for (let k = 0; k < l; k++) {
      const qx = sx - Math.cos(a) * k, qy = sy - Math.sin(a) * k;
      p.px(qx, qy, k ? LAVA[3] : LAVA[5]); g.px(qx, qy, k ? GLOW[2] : GLOW[4]);
    }
  }
}

// ================================================================ Schmiedegolem

const FG = { W: 64, H: 56, AX: 28, AY: 52 };
const FG_REST = {
  hipX: 0, hipY: 0, lean: 0.06, head: 0, heat: 0.8, puff: 0,
  fFx: 5, fFy: 0, fBx: -6, fBy: 0,
  hFx: 13, hFy: 12, hBx: -10, hBy: 11, ham: 0.2, claw: 0.3,
};
const fgp = (o) => ({ ...FG_REST, ...o });

function drawForgeGolem(p, g, P, ex) {
  const { AX, AY } = FG;
  const meta = {};
  const gy = AY;
  const heat = P.heat;
  const hip = { x: AX + P.hipX, y: gy - 12 + P.hipY };
  const lean = P.lean;
  const ch = { x: hip.x + Math.sin(lean) * 13, y: hip.y - Math.cos(lean) * 13 };
  const shF = { x: ch.x + 8, y: ch.y - 6 + lean * 6 }, shB = { x: ch.x - 8, y: ch.y - 7 - lean * 6 };

  const leg = (hx, hy, fx, fy, ramp, back) => {
    const k = ik(hx, hy, fx, fy, 6.5, 6.5, -1);
    cap(p, hx, hy, k.jx, k.jy, 3, 2.6, ramp, { rim: back ? 0 : 1 });
    cap(p, k.jx, k.jy, k.ex, k.ey - 2, 2.4, 2.4, ramp, { rim: back ? 0 : 1 });
    // Kolbenstange vor dem Schienbein
    p.line(k.jx + 2, k.jy + 1, k.ex + 2, k.ey - 3, back ? IRON_D[3] : SHINE);
    box(p, k.ex - 4, k.ey - 4, 10, 4, ramp);
    ell(p, k.jx, k.jy, 2.4, 2.4, back ? BRASS.slice(0, 4) : BRASS, { bias: 0.05 });
    if (!back) rivet(p, k.ex - 2, k.ey - 3);
  };
  // hinten: Bein, Klauenarm
  leg(hip.x - 3, hip.y, AX + P.fBx, gy - P.fBy, IRON_D, true);
  const kb = ik(shB.x, shB.y, ch.x + P.hBx, ch.y + P.hBy, 8, 8, 1);
  cap(p, shB.x, shB.y, kb.jx, kb.jy, 2.8, 2.4, IRON_D);
  cap(p, kb.jx, kb.jy, kb.ex, kb.ey, 2.4, 2.8, IRON_D);
  const ca = Math.atan2(kb.ey - kb.jy, kb.ex - kb.jx);
  for (const d of [-1, 1]) {
    const a = ca + d * (0.35 + P.claw * 0.5);
    const mx = kb.ex + Math.cos(a) * 3, my = kb.ey + Math.sin(a) * 3;
    p.line(kb.ex, kb.ey, mx, my, IRON_D[3]);
    p.line(mx, my, mx + Math.cos(ca) * 3, my + Math.sin(ca) * 3, IRON_D[4]);
  }
  meta.handB = { x: kb.ex, y: kb.ey };
  // Schornsteine auf dem Rücken
  for (let i = 0; i < 2; i++) {
    const bx = ch.x - 7 + i * 4, by = ch.y - 8 - i * 2;
    box(p, bx - 1.5, by - 7 + i, 4, 9 - i, IRON, { chamfer: 0 });
    box(p, bx - 2.5, by - 8 + i, 6, 2, BRASS, { chamfer: 0 });
    p.px(bx, by - 8 + i, VOID); p.px(bx + 1, by - 8 + i, VOID);
    g.px(bx, by - 8 + i, GLOW[2]); g.px(bx + 1, by - 8 + i, GLOW[1]);
    // Glutfunken + Rauch
    const ph = P.puff + i * 1.7;
    for (let k = 0; k < 3; k++) {
      const yy = by - 10 + i - k * 3 - (ph % 1) * 3, xx = bx + Math.sin(ph * 3 + k) * 1.2 - k;
      if (k === 0) { p.px(xx, yy, LAVA[4]); g.px(xx, yy, GLOW[3]); }
      else g.px(xx, yy, GLOW[k === 1 ? 1 : 0]);
    }
  }
  // Becken
  box(p, hip.x - 7, hip.y - 3, 14, 6, IRON);
  p.rect(hip.x - 7, hip.y - 3, 14, 1, BRASS[3]);
  // Rumpf: Kesselkörper
  const tx = Math.round(ch.x - 10), ty = Math.round(ch.y - 9);
  box(p, tx, ty, 20, 18, IRON, { chamfer: 3, bias: 0.04 });
  // Messingbänder mit Nieten
  p.rect(tx + 1, ty + 2, 18, 1, BRASS[3]); p.rect(tx + 1, ty + 3, 18, 1, BRASS[1]);
  p.rect(tx + 1, ty + 14, 18, 1, BRASS[2]);
  for (let i = 2; i < 19; i += 4) { rivet(p, tx + i, ty + 2); p.px(tx + i, ty + 14, BRASS[4]); }
  // Brennofen: runde Messingluke mit Gitterstäben, glühendes Inneres
  const fcx = tx + 7, fcy = ty + 9;
  ell(p, fcx, fcy, 5.2, 5.2, BRASS, { bias: 0.05 });
  const fr = 3.6;
  for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
    const d = Math.hypot(x + 0.5, y + 0.5);
    if (d > fr) continue;
    const hot = (1 - d / fr) * 0.6 + (y > 0 ? 0.15 : 0) + hash2(x, y, 7) * 0.2 + (heat - 0.8) * 0.5;
    const i = hot > 0.65 ? 5 : hot > 0.48 ? 4 : hot > 0.3 ? 3 : 2;
    p.px(fcx + x, fcy + y, LAVA[i]); g.px(fcx + x, fcy + y, GLOW[Math.min(4, i - 1)]);
  }
  for (const bx of [-2, 0, 2]) { p.rect(fcx + bx, fcy - 3, 1, 7, IRON[1]); g.ctx.clearRect(fcx + bx, fcy - 3, 1, 7); p.px(fcx + bx, fcy - 3, IRON[3]); }
  g.ellipse(fcx, fcy, 6.5, 6.5, GLOW[0]); glowDot(g, fcx - 1, fcy + 1, 1.2);
  rivet(p, fcx - 5, fcy - 1); rivet(p, fcx + 4, fcy - 4); rivet(p, fcx + 3, fcy + 4);
  meta.chest = { x: fcx, y: fcy };
  // Kratzer / Nähte
  p.line(tx + 2, ty + 6, tx + 5, ty + 11, IRON[1]); p.px(tx + 3, ty + 5, IRON[5]);

  // vorderes Bein
  leg(hip.x + 3, hip.y + 1, AX + P.fFx, gy - P.fFy, IRON, false);

  // Kopf: Kuppel mit Sehschlitz, halb im Rumpf versenkt
  const hx = ch.x + 3 + P.head, hy = ch.y - 11;
  ell(p, hx, hy, 4.5, 4, IRON, { rim: 1, bias: 0.05 });
  p.rect(hx - 4, hy + 1, 9, 2, BRASS[2]); p.rect(hx - 4, hy + 1, 9, 1, BRASS[4]);
  const ec = ex.hurt ? '#ffffff' : LAVA[4];
  p.rect(hx - 1, hy - 1, 5, 1, ec); p.px(hx + 2, hy - 1, LAVA[5]);
  g.rect(hx - 1, hy - 1, 5, 1, GLOW[3]); g.px(hx + 2, hy - 1, GLOW[4]); g.px(hx + 4, hy - 1, GLOW[1]);
  p.px(hx - 2, hy - 3, IRON[5]);
  meta.eye = { x: hx + 2, y: hy - 1 };
  meta.head = { x: hx, y: hy - 5 };

  // vordere Schulter + Hammerarm
  occlude(g);
  ell(p, shF.x, shF.y, 5, 4.4, IRON, { rim: 1, bias: 0.05 });
  p.rect(shF.x - 4, shF.y + 2, 9, 1, BRASS[3]); rivet(p, shF.x - 2, shF.y - 2);
  const k = ik(shF.x, shF.y + 1, ch.x + P.hFx, ch.y + P.hFy, 8, 8, 1);
  cap(p, shF.x, shF.y + 1, k.jx, k.jy, 2.8, 2.4, IRON, { rim: 1 });
  ell(p, k.jx, k.jy, 2.3, 2.3, BRASS);
  cap(p, k.jx, k.jy, k.ex, k.ey, 2.6, 3, IRON, { rim: 1 });
  occlude(null);
  // Hammerkopf am Handgelenk: Achse quer zum Unterarm, gedreht um ham
  const fa = Math.atan2(k.ey - k.jy, k.ex - k.jx);
  const ha = fa + Math.PI / 2 + P.ham;
  const hcx = k.ex + Math.cos(fa) * 4, hcy = k.ey + Math.sin(fa) * 4;
  obox(p, hcx, hcy, ha, 14, 8, IRON, { face: 0.95, bias: 0.12 });
  obox(p, hcx, hcy, ha, 4, 9, BRASS, { bias: 0.1 });
  // Glühende Schlagfläche
  const fx = hcx + Math.cos(ha) * 6.5, fy = hcy + Math.sin(ha) * 6.5;
  if (heat > 0.9) { p.px(fx, fy, LAVA[3]); g.px(fx, fy, GLOW[2]); }
  meta.hand = { x: fx, y: fy };
  if (ex.smear) arcSmear(p, g, shF.x, shF.y, ex.smear[0], ex.smear[1], 12, 23, SMEAR, 31, false);
  if (ex.impact) {
    dustRing(p, g, fx, gy - 1, ex.impact, 37, [IRON[3], IRON[4], CHAR[3]]);
    sparks(p, g, fx, gy - 2, ex.impact + 4, 41, 16);
  }
  return meta;
}

function drawForgeGolemWreck(p, g, k) {
  const { AX, AY } = FG;
  const gy = AY;
  const heat = 1 - k;
  // umgekippter Kessel
  box(p, AX - 12, gy - 12, 22, 12, IRON, { chamfer: 3 });
  p.rect(AX - 11, gy - 9, 20, 1, BRASS[3]); p.rect(AX - 11, gy - 3, 20, 1, BRASS[2]);
  // offene Ofenklappe
  box(p, AX + 1, gy - 9, 8, 6, BRASS);
  const hot = heat;
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
    const c = hot > 0.6 ? LAVA[3 + (hash2(i, j, 2) > 0.5 ? 1 : 0)] : hot > 0.2 ? LAVA[1 + (hash2(i, j, 2) > 0.5 ? 1 : 0)] : CHAR[1];
    p.px(AX + 2 + i, gy - 8 + j, c);
    if (hot > 0.2) g.px(AX + 2 + i, gy - 8 + j, GLOW[hot > 0.6 ? 3 : 1]);
  }
  // Kopf und Hammer daneben
  ell(p, AX + 15, gy - 4, 4, 3.5, IRON);
  p.rect(AX + 14, gy - 5, 4, 1, hot > 0.3 ? LAVA[3] : IRON[0]);
  if (hot > 0.3) g.rect(AX + 14, gy - 5, 4, 1, GLOW[2]);
  obox(p, AX - 18, gy - 4, 0.1, 12, 7, IRON, { face: 0.9 });
  obox(p, AX - 18, gy - 4, 0.1, 4, 8, BRASS);
  // Schornstein abgebrochen
  box(p, AX - 26, gy - 3, 8, 3, IRON, { chamfer: 0 });
  if (hot > 0.1) { g.px(AX - 4, gy - 14, GLOW[1]); g.px(AX - 3, gy - 17, GLOW[0]); }
  return { eye: { x: AX + 16, y: gy - 5 }, head: { x: AX + 15, y: gy - 8 }, hand: { x: AX - 18, y: gy - 4 }, chest: { x: AX + 5, y: gy - 6 } };
}

function createForgeGolem() {
  const S = { ...FG, draw: drawForgeGolem };
  const idle = [];
  for (let i = 0; i <= 4; i++) {
    const ph = (i / 4) * Math.PI * 2, s = Math.sin(ph);
    idle.push([i / 4, fgp({ hipY: Math.max(0, s), hFy: 12 + Math.max(0, s), hBy: 11 + Math.max(0, s), heat: 0.75 + s * 0.15, puff: i / 4, claw: 0.3 + s * 0.2 }), linear]);
  }
  const walk = [];
  for (let i = 0; i <= 8; i++) {
    const ph = (i / 8) * Math.PI * 2, s = Math.sin(ph), c = Math.cos(ph);
    walk.push([i / 8, fgp({
      hipX: 1, hipY: 1 - Math.abs(c) * 1.5, lean: 0.12, head: s * 0.5, puff: i / 4,
      fFx: 2 + s * 6, fFy: Math.max(0, -c) * 3, fBx: -3 - s * 6, fBy: Math.max(0, c) * 3,
      hFx: 13 - s * 3, hBx: -10 + s * 3, heat: 0.85,
    }), linear]);
  }
  const w1 = fgp({ lean: -0.05, hFx: 8, hFy: -6, ham: 0.4, hBx: -6, hBy: 8, heat: 1, fFx: 6, fBx: -7 });
  const w2 = fgp({ lean: -0.18, hipY: -1, hFx: 2, hFy: -14, ham: 0.7, hBx: -4, hBy: 6, heat: 1.2, fFx: 7, fBx: -8, puff: 0.5 });
  const s1 = fgp({ lean: 0.2, hipY: 1, hFx: 18, hFy: -6, ham: 0.2, hBx: -10, hBy: 10, heat: 1.2, fFx: 8, fBx: -8 });
  const s2 = fgp({ lean: 0.4, hipY: 4, hFx: 18, hFy: 14, ham: -0.2, hBx: -11, hBy: 9, heat: 1.3, fFx: 9, fBx: -9 });
  const s3 = fgp({ lean: 0.36, hipY: 4, hFx: 18, hFy: 14, ham: -0.2, hBx: -11, hBy: 9, heat: 1.1, fFx: 9, fBx: -9 });
  const s4 = fgp({ lean: 0.15, hipY: 1, hFx: 14, hFy: 12, ham: 0.1, heat: 0.9, fFx: 7, fBx: -7 });
  const hurtP = fgp({ lean: -0.15, hipX: -2, head: -1, hFx: 10, hFy: 8, hBx: -12, hBy: 7, heat: 1.3, claw: 1 });
  const d1 = fgp({ lean: -0.25, hipX: -2, hipY: 2, head: -1, hFx: 9, hFy: 7, hBx: -12, hBy: 6, heat: 1.1, claw: 1 });
  const d2 = fgp({ lean: 0.35, hipY: 7, head: 1, hFx: 16, hFy: 14, hBx: 2, hBy: 15, fFx: 7, fBx: -8, heat: 0.6 });
  return {
    idle: new Animation(track(S, idle, 4, { loop: true }), 5),
    walk: new Animation(track(S, walk, 8, { loop: true, extras: { 0: { fx: 'step' }, 4: { fx: 'step' } } }), 9),
    windup: new Animation(track(S, [[0, idle[0][1]], [0.45, w1], [1, w2]], 4), 7, false),
    strike: new Animation(track(S, [[0, s1], [0.25, s2, snap], [0.6, s3], [1, s4]], 5, {
      extras: { 0: { smear: [-1.9, -0.3] }, 1: { fx: 'impact', smear: [-1.2, 0.9], impact: 8 }, 2: { impact: 12 } },
    }), 12, false),
    hurt: new Animation(track(S, [[0, hurtP], [1, fgp({ lean: 0 })]], 2, { extras: { 0: { hurt: true } } }), 8, false),
    death: new Animation([
      ...track(S, [[0, hurtP], [0.5, d1], [1, d2]], 3, { extras: { 0: { hurt: true } } }),
      still(S, (p, g) => drawForgeGolemWreck(p, g, 0), 'impact'),
      still(S, (p, g) => drawForgeGolemWreck(p, g, 0.5)),
      still(S, (p, g) => drawForgeGolemWreck(p, g, 1)),
    ], 7, false),
  };
}


// ================================================================ Flammenakolyth

const AC = { W: 60, H: 56, AX: 22, AY: 52 };
const AC_REST = {
  bob: 0, lean: 0, hem: 0, stepA: 0, stepB: 0, head: 0,
  hFx: 7, hFy: 9, sa: -1.5, blaze: 1, fl: 0, eye: 1, hBx: -3, hBy: 9,
};
const acp = (o) => ({ ...AC_REST, ...o });

// Stab mit Kohlenpfanne; Hand (hx,hy), Winkel a (Richtung zum Kopf des Stabs)
function brazierStaff(p, g, hx, hy, a, blaze, ph) {
  const c = Math.cos(a), s = Math.sin(a);
  const up = 17, down = 7;
  p.line(hx - c * down, hy - s * down, hx + c * up, hy + s * up, PAL.leather[2]);
  p.line(hx - c * down + 1, hy - s * down, hx + c * up + 1, hy + s * up, PAL.leather[1]);
  for (const t of [-6, 5]) { p.px(hx + c * t, hy + s * t, BRASS[3]); p.px(hx + c * t + 1, hy + s * t, BRASS[2]); }
  p.px(hx - c * down, hy - s * down, BRASS[4]);
  // Pfanne: Messingschale mit drei Zacken
  const bx = hx + c * (up + 2), by = hy + s * (up + 2);
  ell(p, bx, by + 1, 3.4, 2, BRASS, { bias: 0.05 });
  p.rect(bx - 3, by - 1, 7, 1, BRASS[4]);
  for (const k of [-3, 0, 3]) { p.px(bx + k, by - 2, BRASS[3]); }
  p.rect(bx - 2, by - 1, 5, 1, LAVA[3]); g.rect(bx - 2, by - 1, 5, 1, GLOW[3]);
  // Flamme richtet sich immer nach oben
  flame(p, g, bx, by - 1, Math.round(4 + blaze * 5), 1.6 + blaze * 0.8, ph, { lean: -0.2, seed: 11, hot: 0.8 + blaze * 0.2 });
  glowDot(g, bx, by - 2 - blaze, 1 + blaze);
  return { x: bx, y: by - 3 - blaze * 2 };
}

function drawAcolyte(p, g, P, ex) {
  const { AX, AY } = AC;
  const meta = {};
  const gy = AY;
  const top = gy - 19 + P.bob;
  const x = AX + P.lean * 2;
  const sh = { x: x + 1 + P.lean * 3, y: top + 1 };
  p.rect(AX - 3 + P.stepB, gy - 2, 4, 2, ACO_CH[1]);
  // hinterer Arm (Hand zur Faust, später zweite Hand am Stab)
  const hB = { x: sh.x + P.hBx, y: sh.y + P.hBy };
  cap(p, sh.x - 3, sh.y + 1, hB.x, hB.y, 2, 2.4, ACO.slice(0, 4));
  p.rect(hB.x - 1, hB.y + 1, 2, 2, SKIN[1]);
  // Robe mit Messingsaum
  robe(p, g, x, top, gy - 1, 4.5, 7.5, P.lean, P.hem, ACO, ACO_CH, 91, 0.6);
  p.rect(AX + 1 + P.stepA, gy - 2, 4, 2, ACO_CH[2]); p.px(AX + 4 + P.stepA, gy - 2, BRASS[3]);
  // Schärpe und Gürtel mit Glutkette
  const by = top + 8;
  for (let k = -5; k <= 5; k++) { p.px(x + k + P.lean * 1.5, by, k < -2 ? BRASS[1] : BRASS[3]); }
  for (let k = -4; k <= 4; k += 2) { p.px(x + k + P.lean * 1.5, by + 1, LAVA[2]); g.px(x + k + P.lean * 1.5, by + 1, GLOW[1]); }
  for (let j = 0; j < 10; j++) p.px(x + 4 + P.lean * (1.5 - j * 0.1), top + 2 + j, j % 3 === 0 ? BRASS[4] : BRASS[2]);
  // Kapuze offen, Gesicht, Messingreif
  const hx = sh.x + 1 + P.head, hy = top - 4;
  ell(p, hx - 1, hy + 0.5, 4.8, 4.6, ACO, { bias: -0.05 });
  ell(p, hx + 1.5, hy + 0.5, 3, 3.4, SKIN, { bias: 0.05 });
  p.rect(hx - 1, hy - 2, 5, 1, BRASS[4]); p.px(hx + 1, hy - 3, LAVA[3]); g.px(hx + 1, hy - 3, GLOW[3]);
  p.px(hx + 3.5, hy + 1.5, SKIN[1]); // Nase-Schatten
  p.rect(hx + 1, hy + 3, 3, 1, SKIN[0]); // Bart/Schatten
  const ec = ex.hurt ? '#ffffff' : LAVA[4];
  if (P.eye > 0.3) { p.px(hx + 2, hy, ec); g.px(hx + 2, hy, GLOW[4]); g.px(hx + 3, hy, GLOW[1]); p.px(hx + 4, hy, SKIN[2]); }
  else p.px(hx + 2, hy, SKIN[0]);
  // Glutmal auf der Wange
  p.px(hx + 1, hy + 2, LAVA[2]); g.px(hx + 1, hy + 2, GLOW[1]);
  meta.eye = { x: hx + 2, y: hy };
  meta.head = { x: hx, y: hy - 5 };
  // vorderer Arm + Stab
  const hF = { x: sh.x + P.hFx, y: sh.y + P.hFy };
  const k = ik(sh.x + 1, sh.y + 1, hF.x, hF.y, 5, 5, P.hFy < 3 ? -1 : 1);
  if (ex.smear) arcSmear(p, g, hF.x, hF.y, ex.smear[0], ex.smear[1], 10, 17, [LAVA[1], LAVA[3], LAVA[5]], 29, true);
  const tip = brazierStaff(p, g, k.ex, k.ey, P.sa, P.blaze, P.fl);
  cap(p, sh.x + 1, sh.y + 1, k.jx, k.jy, 2.2, 2, ACO, { rim: 1, bias: 0.12 });
  cap(p, k.jx, k.jy, k.ex, k.ey, 2, 2.6, ACO, { rim: 1, bias: 0.12 });
  cap(p, sh.x + 1, sh.y + 1, k.jx, k.jy, 2.2, 2, ACO, { bias: 0.12 });
  p.rect(k.ex - 1, k.ey - 1, 2, 2, SKIN[2]); p.px(k.ex - 1, k.ey - 1, SKIN[3]);
  meta.hand = tip;
  return meta;
}

function drawAcolyteCorpse(p, g, k) {
  const { AX, AY } = AC;
  const gy = AY - 1;
  for (let j = 0; j < 5; j++) {
    const hw = 10 - j * 1.6;
    for (let x = -hw; x <= hw; x++) {
      const t = 0.3 + (hw - x) / (2 * hw) * 0.5;
      p.px(AX - 2 + x, gy - j, (j < 2 ? ACO_CH : ACO)[clamp(Math.floor(t * 4), 0, 3)]);
    }
  }
  ell(p, AX + 8, gy - 2, 3.4, 2.6, SKIN);
  p.rect(AX + 6, gy - 5, 5, 1, BRASS[3]);
  // Stab liegt, Pfanne umgekippt, Glut verstreut
  p.line(AX - 14, gy - 1, AX + 2, gy - 3, PAL.leather[2]);
  ell(p, AX - 15, gy - 2, 2.4, 2, BRASS);
  for (let i = 0; i < 5; i++) {
    const ex = AX - 18 - i * 1.6, ey = gy - hash2(i, 1, 4) * 2;
    if (hash2(i, 2, 4) > k * 0.8) { p.px(ex, ey, LAVA[3]); g.px(ex, ey, GLOW[2]); }
  }
  if (k < 0.8) flame(p, g, AX - 17, gy, Math.round(5 * (1 - k)) + 1, 1.4 * (1 - k) + 0.4, k * 7, { seed: 5 });
  return { eye: { x: AX + 9, y: gy - 3 }, head: { x: AX + 8, y: gy - 6 }, hand: { x: AX - 15, y: gy - 4 } };
}

function createAcolyte() {
  const S = { ...AC, draw: drawAcolyte };
  const idle = [];
  for (let i = 0; i <= 4; i++) {
    const ph = (i / 4) * Math.PI * 2, s = Math.sin(ph);
    idle.push([i / 4, acp({ bob: Math.max(0, s), hem: ph, hFy: 9 + Math.max(0, s), fl: ph * 2, blaze: 1 + s * 0.15 }), linear]);
  }
  const walk = [];
  for (let i = 0; i <= 6; i++) {
    const ph = (i / 6) * Math.PI * 2, s = Math.sin(ph), c = Math.cos(ph);
    walk.push([i / 6, acp({ bob: 1 - Math.abs(c), lean: 0.35, hem: ph * 2, stepA: s * 3, stepB: -s * 3, hFx: 7, hFy: 8 + Math.max(0, s), sa: -1.4 + s * 0.08, hBx: -4 - s, fl: ph * 2, head: 0.5 }), linear]);
  }
  // Ausholen: Stab hoch, Flamme lodert auf
  const w1 = acp({ lean: -0.2, hFx: 4, hFy: 1, sa: -1.7, blaze: 1.6, hBx: 2, hBy: 4, head: -0.5, fl: 1 });
  const w2 = acp({ lean: -0.35, hFx: 1, hFy: -2, sa: -1.95, blaze: 2.2, hBx: 3, hBy: 2, head: -1, fl: 2 });
  // Stoß: Stab nach vorn, Pfanne zielt auf den Gegner
  const s1 = acp({ lean: 0.5, hFx: 9, hFy: 4, sa: -0.55, blaze: 2, hBx: 4, hBy: 5, stepA: 3, fl: 3 });
  const s2 = acp({ lean: 0.7, hFx: 11, hFy: 5, sa: -0.2, blaze: 1.6, hBx: 6, hBy: 5, stepA: 4, fl: 4 });
  const s3 = acp({ lean: 0.3, hFx: 8, hFy: 6, sa: -0.9, blaze: 1.1, hBx: 0, hBy: 8, stepA: 2, fl: 5 });
  const hurtP = acp({ lean: -0.6, head: -1.5, hFx: 4, hFy: 5, sa: -1.9, blaze: 0.7, eye: 0 });
  const d1 = acp({ lean: -0.8, bob: 1, head: -1.5, hFx: 3, hFy: 3, sa: -2.2, blaze: 0.5, eye: 0 });
  const d2 = acp({ lean: 0.9, bob: 6, head: 1.5, hFx: 9, hFy: 9, sa: -0.3, blaze: 0.3, eye: 0 });
  return {
    idle: new Animation(track(S, idle, 4, { loop: true }), 6),
    walk: new Animation(track(S, walk, 6, { loop: true }), 10),
    windup: new Animation(track(S, [[0, idle[0][1]], [0.5, w1], [1, w2]], 4), 8, false),
    strike: new Animation(track(S, [[0, s1], [0.35, s2, snap], [1, s3]], 4, {
      extras: { 1: { fx: 'impact' } },
    }), 13, false),
    hurt: new Animation(track(S, [[0, hurtP], [1, acp({ lean: -0.2 })]], 2, { extras: { 0: { hurt: true } } }), 10, false),
    death: new Animation([
      ...track(S, [[0, hurtP], [0.4, d1], [1, d2]], 3, { extras: { 0: { hurt: true } } }),
      still(S, (p, g) => drawAcolyteCorpse(p, g, 0), 'impact'),
      still(S, (p, g) => drawAcolyteCorpse(p, g, 0.45)),
      still(S, (p, g) => drawAcolyteCorpse(p, g, 1)),
    ], 8, false),
  };
}


// ================================================================ Glutdrache

const DR = { W: 80, H: 54, AX: 38, AY: 49 };
const DR_REST = {
  bx: 0, by: 0, rear: 0, neck: -0.7, neckL: 1, head: 0, jaw: 0.05, throat: 0.4, wing: 0, tail: 0, fl: 0,
  fAx: 0, fAy: 0, fBx: 0, fBy: 0, hAx: 0, hAy: 0, hBx: 0, hBy: 0,
};
const drp = (o) => ({ ...DR_REST, ...o });

function drakeWing(p, g, sx, sy, raise, ramp, far, heat) {
  // Oberarm nach oben-hinten, drei Finger; angelegt liegen sie schräg über dem
  // Rücken, gespreizt fächern sie nach oben. Adern der Membran glimmen.
  const a0 = -2.0 + raise * 0.55;
  const L0 = far ? 6 : 7;
  const ex = sx + Math.cos(a0) * L0, ey = sy + Math.sin(a0) * L0;
  const fold = [2.75, 2.45, 2.2], open = [-2.75, -2.25, -1.8];
  const lens = far ? [12, 10, 8] : [15, 13, 10];
  const fingers = fold.map((a, i) => {
    const aa = a + (open[i] - a + (open[i] < a - Math.PI ? Math.PI * 2 : 0)) * raise;
    const L = lens[i] * (0.8 + raise * 0.25);
    return [ex + Math.cos(aa) * L, ey + Math.sin(aa) * L];
  });
  const pts = [[sx, sy], [ex, ey], fingers[0]];
  for (let i = 0; i < 2; i++) {
    const a = fingers[i], b = fingers[i + 1];
    pts.push([(a[0] + b[0]) / 2 + (ex - (a[0] + b[0]) / 2) * 0.25, (a[1] + b[1]) / 2 + (ey - (a[1] + b[1]) / 2) * 0.25]);
    pts.push(b);
  }
  pts.push([sx - 5, sy + 3]);
  poly(p, pts, (x, y) => {
    const d = Math.hypot(x - ex, y - ey) / lens[0];
    return ramp[far ? (d > 0.6 ? 0 : 1) : d > 0.7 ? 1 : d > 0.35 ? 2 : 3];
  });
  cap(p, sx, sy, ex, ey, far ? 1.2 : 1.6, 1.2, far ? DRK_D : DRK);
  for (const f of fingers) {
    p.line(ex, ey, f[0], f[1], far ? DRK_D[3] : DRK[4]);
    if (!far && heat > 0.2) {
      const mx = ex + (f[0] - ex) * 0.6, my = ey + (f[1] - ey) * 0.6;
      g.line(ex, ey, mx, my, GLOW[heat > 0.9 ? 2 : 1]);
    }
  }
  // Glimmender Membranrand zwischen den Fingern
  if (!far && heat > 0.6) for (let i = 3; i < pts.length - 1; i += 2) g.px(pts[i][0], pts[i][1], GLOW[1]);
  p.px(ex, ey - 1, HORN[3]); p.px(ex - 1, ey - 2, HORN[4]);
}

function drawDrake(p, g, P, ex) {
  const { AX, AY } = DR;
  const meta = {};
  const gy = AY;
  const heat = P.throat;
  const hip = { x: AX - 8 + P.bx, y: gy - 12 + P.by };
  const sh = { x: AX + 7 + P.bx, y: gy - 13 + P.by - P.rear * 8 };

  const leg = (bx, by, fx, fy, ramp, front, far) => {
    const k = ik(bx, by, fx, fy, 6, 6.5, front ? 1 : -1);
    cap(p, bx, by, k.jx, k.jy, far ? 2.4 : 3, 2, ramp, { rim: far ? 0 : 1 });
    cap(p, k.jx, k.jy, k.ex, k.ey - 1, 1.8, 1.6, ramp, { rim: far ? 0 : 1 });
    p.rect(k.ex - 1, k.ey - 1, 4, 1, ramp[far ? 1 : 3]);
    for (let i = 0; i < 3; i++) p.px(k.ex + 2 + i * 0.7, k.ey - 1 + (i === 2 ? 0 : 0), HORN[far ? 1 : 3 + (i === 0 ? 1 : 0)]);
  };
  // ferne Beine, ferner Flügel
  leg(hip.x + 1, hip.y + 1, AX - 10 + P.hBx, gy - P.hBy, DRK_D, false, true);
  leg(sh.x - 1, sh.y + 2, AX + 5 + P.fBx, gy - P.fBy, DRK_D, true, true);
  drakeWing(p, g, sh.x - 3, sh.y - 3, P.wing, MEMB, true, heat);

  // Schwanz: lang, auslaufend, Spatenspitze
  let tx = hip.x - 4, ty = hip.y - 1;
  const N = 11;
  for (let i = 0; i < N; i++) {
    const u = i / N;
    const a = Math.PI - 0.15 + u * 0.5 + Math.sin(P.tail + u * 3) * 0.25 * u;
    const nx = tx + Math.cos(a) * 2.2, ny = ty - Math.sin(a) * 2.2 + 0.4;
    cap(p, tx, ty, nx, ny, 3 - u * 2.2, 2.8 - u * 2.2, DRK);
    if (i % 2 === 0 && i < N - 2) p.px(tx, ty - (3 - u * 2.2), HORN[2]);
    tx = nx; ty = ny;
  }
  poly(p, [[tx + 1, ty - 1], [tx - 4, ty - 3], [tx - 3, ty + 1], [tx + 1, ty + 1]], DRK[4]);
  p.px(tx - 2, ty - 1, LAVA[2]); g.px(tx - 2, ty - 1, GLOW[1]);

  // Rumpf: Schuppen oben, heller Bauch
  cap(p, hip.x, hip.y, sh.x, sh.y, 5, 5.6, DRK, { noise: 0.12, seed: 3 });
  ell(p, hip.x - 1, hip.y, 5.8, 5, DRK, { noise: 0.12, seed: 4 });
  ell(p, sh.x, sh.y + 0.5, 5.6, 5.8, DRK, { noise: 0.12, seed: 5 });
  // Bauchplatten
  const bl = 12;
  for (let i = 0; i <= bl; i++) {
    const u = i / bl, x = hip.x - 3 + (sh.x - hip.x + 4) * u, y = hip.y + 3.5 + (sh.y - hip.y) * u + Math.sin(u * Math.PI) * 0.8;
    p.px(x, y, BELLY[i % 3 === 0 ? 1 : 2]); p.px(x, y + 1, BELLY[1]);
    if (i % 3 === 0) p.px(x, y - 1, BELLY[0]);
  }
  // Schuppenreihen
  for (let i = 0; i < 12; i++) {
    const u = i / 11, x = hip.x - 2 + (sh.x - hip.x + 2) * u, y = hip.y - 2 + (sh.y - hip.y) * u;
    p.px(x + (i % 2), y + (i % 3) - 1, DRK[5]);
  }
  // Rückenzacken
  for (let i = 0; i < 6; i++) {
    const u = i / 5, x = hip.x - 3 + (sh.x - hip.x + 2) * u, y = hip.y - 5 + (sh.y - hip.y) * u - Math.sin(u * Math.PI) * 0.8;
    poly(p, [[x - 1, y + 1], [x - 2.5, y - 2 - (i % 2)], [x + 1, y + 1]], HORN[2]); p.px(x - 1, y - 1, HORN[3]);
  }

  // nahe Beine
  leg(hip.x, hip.y + 2, AX - 7 + P.hAx, gy - P.hAy, DRK, false, false);
  leg(sh.x + 1, sh.y + 3, AX + 9 + P.fAx, gy - P.fAy, DRK, true, false);

  // Hals: drei Glieder, glühende Kehle auf der Unterseite
  const nL = 4.2 * P.neckL;
  let nx = sh.x + 3, ny = sh.y - 2;
  const segs = [];
  for (let i = 0; i < 3; i++) {
    const a = P.neck + i * 0.28;
    const qx = nx + Math.cos(a) * nL, qy = ny + Math.sin(a) * nL;
    segs.push([nx, ny, qx, qy]);
    nx = qx; ny = qy;
  }
  segs.forEach(([x0, y0, x1, y1], i) => cap(p, x0, y0, x1, y1, 3.6 - i * 0.5, 3.1 - i * 0.5, DRK, { noise: 0.1, seed: 6 + i }));
  segs.forEach(([x0, y0, x1, y1], i) => {
    const d = Math.hypot(x1 - x0, y1 - y0) || 1;
    const ox = -(y1 - y0) / d, oy = (x1 - x0) / d; // Unterseite (rechts der Laufrichtung)
    const r = 2.6 - i * 0.5;
    for (let t = 0; t <= 1; t += 0.25) {
      const x = x0 + (x1 - x0) * t + ox * r, y = y0 + (y1 - y0) * t + oy * r;
      if (heat > 0.25) {
        const hot = heat > 1.2 ? 4 : heat > 0.8 ? 3 : 2;
        p.px(x, y, LAVA[hot]); g.px(x, y, GLOW[hot - 1]);
        if (heat > 0.9) { p.px(x - ox, y - oy, LAVA[hot - 1]); g.px(x - ox, y - oy, GLOW[hot - 2]); }
      } else p.px(x, y, BELLY[1]);
    }
  });
  if (heat > 0.8) glowDot(g, (segs[1][0] + segs[1][2]) / 2, (segs[1][1] + segs[1][3]) / 2 + 2, heat * 1.5);
  meta.throat = { x: segs[1][2], y: segs[1][3] + 2 };

  // Kopf
  const ha = 0.18 + P.head;
  const hc = Math.cos(ha), hs = Math.sin(ha);
  const H = (u, v) => [nx + u * hc - v * hs, ny + u * hs + v * hc];
  ell(p, nx, ny, 3.6, 3.2, DRK, { noise: 0.1, seed: 9, rim: 1 });
  // Hörner nach hinten
  const h1 = H(-5, -4), h2 = H(-1, -3);
  p.line(h2[0], h2[1], h1[0], h1[1], HORN[3]); p.px(h1[0], h1[1], HORN[4]);
  const h3 = H(-4, -1.5); p.line(nx - 1, ny, h3[0], h3[1], HORN[2]);
  // Oberkiefer (Schnauze)
  poly(p, [H(0, -2.6), H(7.5, -1), H(8, 0.8), H(0, 1.2)], (x, y) => (y < H(4, -1)[1] ? DRK[4] : DRK[3]));
  const nost = H(7, -1); p.px(nost[0], nost[1], VOID);
  // Maul offen
  const ja = P.jaw * 0.7;
  const jc = Math.cos(ha + ja), js = Math.sin(ha + ja);
  const J = (u, v) => [nx + u * jc - v * js, ny + 1.2 * 1 + u * js + v * jc];
  if (P.jaw > 0.1) {
    poly(p, [H(1, 1.2), H(7.5, 0.8), J(7, 0), J(1, 0)], LAVA[2]);
    poly(p, [H(1.5, 1.2), H(6, 1), J(5, -0.2)], LAVA[4]);
    for (let u = 2; u < 7; u++) { const q = J(u, -0.3); g.px(q[0], q[1], GLOW[3]); const q2 = H(u, 1.3); g.px(q2[0], q2[1], GLOW[2]); }
  }
  poly(p, [J(0, 0), J(7, 0), J(6.5, 1.8), J(0, 2)], DRK[2]);
  for (const u of [3, 5.5]) { const t1 = H(u, 1.2), t2 = J(u + 0.5, 0); p.px(t1[0], t1[1], HORN[4]); p.px(t2[0], t2[1], HORN[3]); }
  const m = H(8.5, 1 + P.jaw * 2);
  meta.mouth = { x: m[0], y: m[1] };
  // Auge
  const e = H(2, -1.8);
  const ec = ex.hurt ? '#ffffff' : LAVA[4];
  p.px(e[0], e[1], ec); g.px(e[0], e[1], GLOW[4]); p.px(e[0] - 1, e[1] - 1, DRK[5]);
  meta.eye = { x: e[0], y: e[1] };
  meta.head = { x: nx, y: ny - 5 };

  // naher Flügel (angelegt oder gehoben)
  drakeWing(p, g, sh.x - 2, sh.y - 3, P.wing, MEMB, false, heat);

  if (ex.smear) arcSmear(p, g, sh.x + 2, sh.y, ex.smear[0], ex.smear[1], 9, 16, SMEAR, 51, false);
  if (ex.breath) {
    // kurzer Glutstoß vor dem Maul (Partikel übernimmt das Spiel)
    const k = ex.breath;
    for (let i = 0; i < 4; i++) {
      const r = 0.8 + i * 0.5;
      const x = m[0] + Math.cos(ha + 0.2) * (1 + i * 2.2), y = m[1] + Math.sin(ha + 0.2) * (1 + i * 2.2) + Math.sin(k * 2 + i * 1.7) * 0.7;
      ell(p, x, y, r, r * 0.8, [LAVA[2], LAVA[3], LAVA[4], LAVA[5]], { bias: 0.15 });
      glowDot(g, x, y, r);
    }
  }
  return meta;
}

function drawDrakeCorpse(p, g, k) {
  const { AX, AY } = DR;
  const gy = AY - 3;
  const heat = 1 - k;
  // ausgebreiteter Flügel am Boden
  poly(p, [[AX - 4, gy - 3], [AX - 16, gy - 8], [AX - 12, gy - 3], [AX - 22, gy - 2], [AX - 10, gy + 1]], MEMB[2]);
  p.line(AX - 4, gy - 3, AX - 16, gy - 8, DRK[3]); p.line(AX - 4, gy - 3, AX - 22, gy - 2, DRK[3]);
  // Schwanz geschwungen
  for (let i = 0; i < 10; i++) { const x = AX - 8 - i * 2.2, y = gy + 1 - Math.sin(i * 0.4) * 1.5; ell(p, x, y, 2.6 - i * 0.2, 2 - i * 0.12, DRK); }
  ell(p, AX, gy - 1, 9, 4.2, DRK, { noise: 0.12, seed: 4 });
  for (let x = -6; x <= 6; x += 2) p.px(AX + x, gy + 2, BELLY[2]);
  // Hals und Kopf liegen flach
  cap(p, AX + 7, gy - 2, AX + 15, gy, 3, 2.4, DRK);
  poly(p, [[AX + 14, gy - 2], [AX + 22, gy - 1], [AX + 22, gy + 1], [AX + 14, gy + 2]], DRK[3]);
  p.line(AX + 13, gy - 2, AX + 9, gy - 5, HORN[3]);
  p.px(AX + 16, gy - 1, heat > 0.4 ? LAVA[3] : VOID); if (heat > 0.4) g.px(AX + 16, gy - 1, GLOW[2]);
  if (heat > 0.1) { for (let x = 8; x <= 14; x += 2) { p.px(AX + x, gy + 1, LAVA[heat > 0.5 ? 3 : 1]); g.px(AX + x, gy + 1, GLOW[heat > 0.5 ? 2 : 0]); } }
  return { eye: { x: AX + 16, y: gy - 1 }, mouth: { x: AX + 22, y: gy }, head: { x: AX + 17, y: gy - 4 }, throat: { x: AX + 11, y: gy } };
}

function createDrake() {
  const S = { ...DR, draw: drawDrake };
  const idle = [];
  for (let i = 0; i <= 4; i++) {
    const ph = (i / 4) * Math.PI * 2, s = Math.sin(ph);
    idle.push([i / 4, drp({ by: Math.max(0, s) * 0.6, neck: -0.7 + s * 0.05, throat: 0.45 + Math.max(0, s) * 0.35, tail: ph, wing: 0.05 + Math.max(0, s) * 0.08, jaw: Math.max(0, -s) * 0.2 }), linear]);
  }
  const walk = [];
  for (let i = 0; i <= 8; i++) {
    const ph = (i / 8) * Math.PI * 2, s = Math.sin(ph), c = Math.cos(ph);
    walk.push([i / 8, drp({
      by: -Math.abs(c) * 1 + 0.5, neck: -0.6 + s * 0.06, head: -s * 0.05, tail: ph * 1.5, throat: 0.5, wing: 0.1,
      fAx: s * 4, fAy: Math.max(0, c) * 3, hBx: s * 4, hBy: Math.max(0, c) * 3,
      fBx: -s * 4, fBy: Math.max(0, -c) * 3, hAx: -s * 4, hAy: Math.max(0, -c) * 3,
    }), linear]);
  }
  // Ausholen: aufbäumen, Luft holen, Flügel spreizen
  const w1 = drp({ rear: 0.5, bx: -1, neck: -1.2, head: -0.3, throat: 1, wing: 0.6, jaw: 0.2, fAx: 2, fAy: 3, fBx: 1, fBy: 2, tail: 1 });
  const w2 = drp({ rear: 0.9, bx: -2, neck: -1.6, head: -0.7, throat: 1.4, wing: 1, jaw: 0.4, fAx: 3, fAy: 6, fBx: 2, fBy: 5, hAx: -1, hBx: -1, tail: 2 });
  // Biss: nach vorn schnappen, Klaue
  const s1 = drp({ rear: 0.3, bx: 4, neck: -0.25, head: 0.15, neckL: 1.25, throat: 1.2, wing: 0.7, jaw: 1.1, fAx: 7, fAy: 3, fBx: 4, tail: 3 });
  const s2 = drp({ rear: 0, bx: 6, by: 1, neck: 0.05, head: 0.25, neckL: 1.3, throat: 1, wing: 0.4, jaw: 0.05, fAx: 8, fBx: 5, hAx: 1, tail: 4 });
  const s3 = drp({ bx: 3, neck: -0.45, neckL: 1.1, throat: 0.7, wing: 0.2, jaw: 0.2, fAx: 4, fBx: 2, tail: 5 });
  // Feueratem (Loop): Kopf vorgestreckt, Maul offen, Kehle glüht
  const breath = [];
  for (let i = 0; i <= 4; i++) {
    const ph = (i / 4) * Math.PI * 2, s = Math.sin(ph);
    breath.push([i / 4, drp({ bx: 2, by: 1, neck: -0.45 + s * 0.04, head: 0.05, neckL: 1.25, jaw: 0.95 + s * 0.1, throat: 1.5 + s * 0.2, wing: 0.55 + s * 0.08, tail: ph, fAx: 4, fBx: 2 }), linear]);
  }
  const hurtP = drp({ rear: 0.3, bx: -3, neck: -1.5, head: -0.4, jaw: 1, throat: 1.2, wing: 0.9, fAy: 2 });
  const d1 = drp({ rear: 0.5, bx: -3, neck: -1.7, head: -0.5, jaw: 1, throat: 1, wing: 1 });
  const d2 = drp({ rear: 0, by: 5, neck: 0.3, head: 0.4, jaw: 0.6, throat: 0.5, wing: 0.3, fAx: 5, fBx: 4, hAx: -3, hBx: -2 });
  return {
    idle: new Animation(track(S, idle, 4, { loop: true }), 6),
    walk: new Animation(track(S, walk, 8, { loop: true, extras: { 0: { fx: 'step' }, 4: { fx: 'step' } } }), 12),
    windup: new Animation(track(S, [[0, idle[0][1]], [0.5, w1], [1, w2]], 4), 8, false),
    strike: new Animation(track(S, [[0, s1], [0.3, s2, snap], [1, s3]], 4, {
      extras: { 0: { smear: [-1.4, 0.3] }, 1: { fx: 'impact', smear: [-0.6, 0.9] } },
    }), 14, false),
    breath: new Animation(track(S, breath, 4, { loop: true, extras: { 0: { breath: 1 }, 1: { breath: 2 }, 2: { breath: 3 }, 3: { breath: 4 } } }), 10),
    hurt: new Animation(track(S, [[0, hurtP], [1, drp({ bx: -1, neck: -0.9, jaw: 0.3 })]], 2, { extras: { 0: { hurt: true } } }), 10, false),
    death: new Animation([
      ...track(S, [[0, hurtP], [0.4, d1], [1, d2]], 3, { extras: { 0: { hurt: true } } }),
      still(S, (p, g) => drawDrakeCorpse(p, g, 0), 'impact'),
      still(S, (p, g) => drawDrakeCorpse(p, g, 0.5)),
      still(S, (p, g) => drawDrakeCorpse(p, g, 1)),
    ], 8, false),
  };
}


// ================================================================ Wächter der Esse (Elite)

const WD = { W: 116, H: 90, AX: 52, AY: 84, pad: 12 };
const WD_REST = {
  hipX: 0, hipY: 0, lean: 0.05, head: 0, headY: 0, kneel: 0,
  fFx: 7, fFy: 0, fBx: -8, fBy: 0,
  hFx: 10, hFy: 14, ham: 0.78, hBx: -12, hBy: 10, visor: 1, heat: 1, vent: 0,
};
const wdp = (o) => ({ ...WD_REST, ...o });
const THIGH = 10, SHIN = 10, SPINE = 17, UPPER = 10, FORE = 10, HAFT = 24;

// Amboss-Schild: Oberfläche (poliert), Horn nach vorn, Taille, Fuß
function anvil(p, g, cx, cy, heat, dir = 1) {
  const t = Math.round(cy - 10), x = Math.round(cx);
  // Horn
  const hx0 = dir > 0 ? x + 8 : x - 10;
  poly(p, [[hx0, t], [hx0 + dir * 10, t + 2], [hx0, t + 5]], IRON[3]);
  p.line(hx0, t, hx0 + dir * 10, t + 1.5, IRON[5]);
  // Kopfplatte (polierte Bahn), Taille, Fuß
  box(p, x - 10, t, 19, 6, IRON, { chamfer: 1, bias: 0.08 });
  p.rect(x - 9, t, 17, 1, SHINE);
  box(p, x - 4, t + 6, 8, 6, IRON_D, { chamfer: 0, bias: 0.1 });
  box(p, x - 8, t + 12, 16, 5, IRON, { chamfer: 1 });
  p.rect(x - 8, t + 16, 16, 1, BRASS[2]);
  p.rect(x - 8, t + 12, 16, 1, BRASS[3]);
  // Glühende Schmiedenaht
  const hot = heat > 1.2 ? 4 : heat > 0.8 ? 3 : 2;
  for (let i = -8; i <= 6; i++) if (hash2(i, 3, 17) > 0.3) { p.px(x + i, t + 3, LAVA[hot]); g.px(x + i, t + 3, GLOW[hot - 1]); }
  rivet(p, x - 3, t + 8); rivet(p, x + 1, t + 8);
  return { x: x, y: t };
}

function wardenHammer(p, g, hx, hy, a, heat, behind) {
  const c = Math.cos(a), s = Math.sin(a);
  // Stiel: Eisen mit Lederwicklung
  cap(p, hx - c * 5, hy - s * 5, hx + c * HAFT, hy + s * HAFT, 1.2, 1.2, IRON);
  for (let k = -4; k <= 3; k += 2) p.px(hx + c * k, hy + s * k, PAL.leather[3]);
  p.px(hx - c * 6, hy - s * 6, BRASS[4]);
  // Kopf quer zum Stiel
  const kx = hx + c * (HAFT + 2), ky = hy + s * (HAFT + 2);
  const ha = a + Math.PI / 2;
  obox(p, kx, ky, ha, 17, 11, IRON, { face: 0.95, bias: 0.1 });
  obox(p, kx, ky, ha, 3, 12, BRASS, { bias: 0.1 });
  obox(p, kx + Math.cos(ha) * 6, ky + Math.sin(ha) * 6, ha, 2, 12, BRASS);
  obox(p, kx - Math.cos(ha) * 6, ky - Math.sin(ha) * 6, ha, 2, 12, BRASS);
  // Glutrune in der Mitte
  const hot = heat > 1.2 ? 4 : 3;
  p.px(kx, ky, LAVA[hot]); p.px(kx + c, ky + s, LAVA[hot - 1]); p.px(kx - c, ky - s, LAVA[hot - 1]);
  if (!behind) { g.px(kx, ky, GLOW[hot]); g.px(kx + c, ky + s, GLOW[2]); g.px(kx - c, ky - s, GLOW[2]); }
  // Schlagflächen
  const f1 = { x: kx + Math.cos(ha) * 8.5, y: ky + Math.sin(ha) * 8.5 };
  const f2 = { x: kx - Math.cos(ha) * 8.5, y: ky - Math.sin(ha) * 8.5 };
  return { head: { x: kx, y: ky }, face: f1.y > f2.y ? f1 : f2 };
}

function drawWarden(p, g, P, ex) {
  const { AX, AY } = WD;
  const meta = {};
  const gy = AY;
  const heat = P.heat;
  const hip = { x: AX - 2 + P.hipX, y: gy - 21 + P.hipY + P.kneel * 8 };
  const lean = P.lean;
  const ch = { x: hip.x + Math.sin(lean) * SPINE, y: hip.y - Math.cos(lean) * SPINE };
  const px = Math.cos(lean), py = Math.sin(lean);
  const shF = { x: ch.x + px * 7, y: ch.y + py * 7 - 2 }, shB = { x: ch.x - px * 7, y: ch.y - py * 7 - 3 };

  const leg = (hx, hy, fx, fy, ramp, back) => {
    let k = ik(hx, hy, fx, fy, THIGH, SHIN, -1);
    if (P.kneel > 0.01 && back) {
      const kx = hx - 3, ky = gy - 2;
      k = { jx: k.jx + (kx - k.jx) * P.kneel, jy: k.jy + (ky - k.jy) * P.kneel, ex: k.ex + (kx - 11 - k.ex) * P.kneel, ey: k.ey };
    }
    cap(p, hx, hy, k.jx, k.jy, 4.2, 3.6, ramp, { rim: back ? 0 : 1 });
    cap(p, k.jx, k.jy, k.ex, k.ey - 3, 3.8, 3.4, ramp, { rim: back ? 0 : 1 });
    // Beinschiene: heller Grat
    if (!back) p.line(k.jx + 2, k.jy + 2, k.ex + 2, k.ey - 4, SHINE);
    // Sabaton
    box(p, k.ex - 4, k.ey - 4, 12, 4, ramp, { chamfer: 1 });
    p.rect(k.ex - 4, k.ey - 1, 12, 1, back ? IRON_D[0] : BRASS[1]);
    // Kniekachel
    ell(p, k.jx + 1, k.jy, 3.2, 3, back ? BRASS.slice(0, 4) : BRASS, { bias: 0.05 });
    p.px(k.jx + 3, k.jy - 1, back ? BRASS[2] : BRASS[5]);
  };
  const armIK = (sh, h) => ik(sh.x, sh.y, h.x, h.y, UPPER, FORE, 1);

  // --- hinten: Bein, Schildarm
  leg(hip.x - 3, hip.y, AX + P.fBx, gy - P.fBy, IRON_D, true);
  const hB = { x: ch.x + P.hBx, y: ch.y + P.hBy };
  const kb = armIK(shB, hB);
  cap(p, shB.x, shB.y, kb.jx, kb.jy, 3.2, 2.8, IRON_D);
  cap(p, kb.jx, kb.jy, kb.ex, kb.ey, 2.8, 3, IRON_D);
  // Schulterschlote hinten
  for (let i = 0; i < 2; i++) {
    const vx = ch.x - 6 + i * 4, vy = ch.y - 9 - i;
    box(p, vx - 1, vy - 5, 3, 6, IRON_D, { chamfer: 0 });
    p.px(vx, vy - 5, VOID);
    flame(p, g, vx, vy - 6, Math.round(2 + P.vent * 4 + heat), 1 + P.vent * 0.5, P.vent * 3 + i * 2 + ex.t * 6, { lean: -0.3, seed: 30 + i, hot: 0.6 + P.vent * 0.4 });
  }

  // --- Amboss-Schild in der hinteren Hand (seitlich hinter dem Körper, Horn nach hinten)
  const shield = anvil(p, g, kb.ex - 2, kb.ey + 3, heat, -1);
  meta.shield = { x: shield.x, y: shield.y + 2 };
  meta.handB = { x: kb.ex, y: kb.ey };
  cap(p, kb.jx, kb.jy, kb.ex, kb.ey, 2.8, 3, IRON_D);
  box(p, kb.ex - 2, kb.ey - 2, 5, 5, IRON_D.concat(IRON[4]), { chamfer: 1 });

  ell(p, shB.x - 1, shB.y, 5.5, 4.5, IRON_D.concat(IRON[4]), { bias: 0.05 });
  // --- Rumpf: Tassetten, Brustpanzer, Brennofen
  for (let i = 0; i < 5; i++) {
    const tx = hip.x - 8 + i * 3.6, ty = hip.y + 1;
    const sw = Math.sin(ex.t * 6 + i) * 0.5 + lean * 3;
    box(p, tx + sw * 0.3, ty, 4, 8 - Math.abs(i - 2), i % 2 ? IRON : IRON_D.concat(IRON[4]), { chamfer: 0 });
    p.rect(tx + sw * 0.3, ty + 7 - Math.abs(i - 2), 4, 1, BRASS[2]);
  }
  ell(p, hip.x, hip.y - 1, 9, 4, IRON, { bias: 0.02 });
  p.rect(hip.x - 9, hip.y - 2, 18, 2, PAL.leather[1]); box(p, hip.x - 2, hip.y - 3, 5, 4, BRASS);
  ell(p, ch.x, ch.y + 2, 11, 11, IRON, { rot: lean, bias: 0.06 });
  // Brustgrat + Messingkante
  p.line(ch.x - 9, ch.y - 5, ch.x + 7, ch.y - 7, BRASS[3]); p.line(ch.x - 9, ch.y - 4, ch.x + 7, ch.y - 6, BRASS[1]);
  p.line(ch.x - 10, ch.y + 9, ch.x + 8, ch.y + 9, BRASS[2]);
  // Ofengitter in der Brust
  const fcx = ch.x - 3 + px * 2, fcy = ch.y + 2;
  box(p, fcx - 5, fcy - 5, 10, 10, BRASS, { chamfer: 2 });
  for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
    if (Math.abs(i) + Math.abs(j) > 5) continue;
    const hot = (1 - Math.hypot(i, j) / 5) * 0.5 + (j > 0 ? 0.15 : 0) + hash2(i, j, 9) * 0.2 + (heat - 1) * 0.4;
    const c = hot > 0.6 ? 5 : hot > 0.45 ? 4 : hot > 0.3 ? 3 : 2;
    p.px(fcx + i, fcy + j, LAVA[c]); g.px(fcx + i, fcy + j, GLOW[Math.min(4, c - 1)]);
  }
  for (const bx of [-2, 0, 2]) { p.rect(fcx + bx, fcy - 3, 1, 7, IRON[1]); g.ctx.clearRect(fcx + bx, fcy - 3, 1, 7); }
  g.ellipse(fcx, fcy, 7 + heat, 7 + heat, GLOW[0]);
  glowDot(g, fcx - 1, fcy + 1, 0.8 + heat);
  meta.chest = { x: fcx, y: fcy };
  for (const [rx, ry] of [[-8, 1], [-7, 6], [7, -2], [8, 4]]) rivet(p, ch.x + rx, ch.y + ry);

  // --- vorderes Bein
  occlude(g);
  leg(hip.x + 3, hip.y + 1, AX + P.fFx, gy - P.fFy, IRON, false);
  occlude(null);

  // --- vorderer Arm + Hammer
  const hF = { x: ch.x + P.hFx, y: ch.y + P.hFy };
  const kf = armIK(shF, hF);
  const behind = ex.hammerBehind;
  let hm;
  const drawArm = () => {
    occlude(g);
    cap(p, shF.x, shF.y, kf.jx, kf.jy, 3.4, 3, IRON, { rim: 1 });
    cap(p, kf.jx, kf.jy, kf.ex, kf.ey, 3, 3.4, IRON, { rim: 1 });
    ell(p, kf.jx, kf.jy, 2.6, 2.6, BRASS);
    box(p, kf.ex - 3, kf.ey - 3, 6, 6, IRON, { chamfer: 1, bias: 0.05 }); // Panzerhandschuh
    occlude(null);
  };
  if (ex.smear) arcSmear(p, g, shF.x, shF.y, ex.smear[0], ex.smear[1], 18, 18 + FORE + HAFT * 0.9, SMEAR, 61, false);
  if (behind) { hm = wardenHammer(p, g, kf.ex, kf.ey, P.ham, heat, true); drawArm(); }
  else { drawArm(); occlude(g); hm = wardenHammer(p, g, kf.ex, kf.ey, P.ham, heat, false); occlude(null); wardenHammerGlow(g, hm, heat); p.rect(kf.ex - 2, kf.ey - 2, 4, 4, IRON[3]); p.px(kf.ex - 2, kf.ey - 2, IRON[5]); }
  // Schulterplatte vorn (groß, mit Messingrand und Dorn)
  occlude(g);
  ell(p, shF.x + 1, shF.y - 1, 7, 5.5, IRON, { rim: 1, bias: 0.08 });
  occlude(null);
  p.line(shF.x - 5, shF.y + 3, shF.x + 7, shF.y + 3, BRASS[3]);
  p.line(shF.x - 5, shF.y + 4, shF.x + 7, shF.y + 4, BRASS[1]);
  for (let i = -3; i <= 5; i += 4) rivet(p, shF.x + i, shF.y + 2);
  poly(p, [[shF.x - 2, shF.y - 5], [shF.x + 1, shF.y - 12], [shF.x + 3, shF.y - 5]], IRON[3]);
  p.line(shF.x - 1, shF.y - 6, shF.x + 1, shF.y - 12, SHINE);
  // --- hintere Schulterplatte, Helm
  const hx = ch.x + px * 3 + P.head, hy = ch.y - 13 + P.headY;
  // Halsberge
  ell(p, hx - 1, hy + 6, 6, 3, IRON_D.concat(IRON[4]));
  // Helmglocke
  ell(p, hx, hy, 6, 6.5, IRON, { rim: 1, bias: 0.08 });
  p.rect(hx - 5, hy - 1, 11, 1, BRASS[3]); p.rect(hx - 5, hy, 11, 1, BRASS[1]);
  // Messingkamm
  for (let i = 0; i < 6; i++) { const cx = hx - 4 + i * 1.5, cy = hy - 6 + Math.abs(i - 2.5) * 0.6; p.rect(cx, cy - 3 + Math.abs(i - 2.5) * 0.5, 1, 3, i < 3 ? BRASS[4] : BRASS[3]); }
  // Hörner seitlich (nach vorn gebogen)
  for (let i = 0; i < 5; i++) { const x = hx - 5 - i * 0.6, y = hy - 2 - i * 1.2 + i * i * 0.18; p.rect(x, y, 2 - (i > 3 ? 1 : 0), 1, i < 2 ? BRASS[3] : BRASS[4]); }
  // Visier: Kreuzschlitz mit Glut dahinter
  const vs = P.visor, ec = ex.hurt ? '#ffffff' : LAVA[5];
  p.rect(hx + 0, hy + 1, 7, 2, VOID); p.rect(hx + 3, hy + 1, 1, 4, VOID);
  if (vs > 0.2) {
    p.rect(hx + 1, hy + 1, 5, 1, vs > 0.8 ? ec : LAVA[3]); p.rect(hx + 1, hy + 2, 5, 1, LAVA[2]); p.px(hx + 3, hy + 3, LAVA[3]);
    g.rect(hx + 1, hy + 1, 5, 1, GLOW[vs > 0.8 ? 4 : 2]); g.rect(hx + 1, hy + 2, 5, 1, GLOW[2]); g.rect(hx + 3, hy + 1, 1, 3, GLOW[2]); g.rect(hx, hy, 7, 3, GLOW[0]);
    if (vs > 1.2) { g.rect(hx + 1, hy - 1, 6, 5, GLOW[1]); g.rect(hx + 2, hy + 1, 3, 1, GLOW[4]); }
  }
  for (let i = 0; i < 3; i++) p.px(hx + 4, hy + 3 + i, IRON[1]); // Atemlöcher
  p.px(hx - 3, hy - 4, SHINE); p.px(hx - 2, hy - 5, IRON[5]);
  meta.eye = { x: hx + 3, y: hy + 1 };
  meta.head = { x: hx, y: hy - 9 };

  meta.hand = { x: kf.ex, y: kf.ey };
  meta.tip = hm.face;
  if (ex.impact) {
    dustRing(p, g, hm.face.x, gy - 1, ex.impact, 63, [IRON[3], IRON[4], CHAR[3]]);
    sparks(p, g, hm.face.x, gy - 2, ex.impact + 5, 67, 22);
  }
  if (ex.roarFx) {
    for (let r = 5; r < 16; r += 4) for (let a = -0.8; a <= 0.8; a += 0.12) {
      const x = meta.eye.x + 3 + Math.cos(a) * (r + ex.roarFx * 3), y = meta.eye.y + Math.sin(a) * (r + ex.roarFx * 3);
      if (hash2(Math.round(a * 20), r, 8) < 0.55) g.px(x, y, GLOW[r < 8 ? 2 : 1]);
    }
  }
  return meta;
}

// Glow-Ersatzleinwand: zeichnet nichts (nur für den Glow-Nachtrag des Schilds)
class FakeCanvas { px() {} rect() {} line() {} ellipse() {} }
function wardenHammerGlow(g, hm, heat) {
  const hot = heat > 1.2 ? 4 : 3;
  g.px(hm.head.x, hm.head.y, GLOW[hot]);
  if (heat > 1.1) glowDot(g, hm.face.x, hm.face.y, 1);
}

// Zusammengebrochene Rüstung: Helm, Schild, Hammer, erkaltender Ofen
function drawWardenFallen(p, g, k) {
  const { AX, AY } = WD;
  const gy = AY;
  const heat = 1 - k;
  const cx = AX;
  // Beine/Tassetten liegend
  for (let i = 0; i < 4; i++) box(p, cx - 22 + i * 5, gy - 5, 6, 5, i % 2 ? IRON : IRON_D.concat(IRON[4]), { chamfer: 1 });
  // Brustpanzer auf der Seite
  ell(p, cx - 2, gy - 7, 12, 7, IRON, { bias: 0.05 });
  p.line(cx - 12, gy - 9, cx + 8, gy - 12, BRASS[3]);
  box(p, cx - 6, gy - 11, 9, 8, BRASS, { chamfer: 2 });
  for (let j = 0; j < 6; j++) for (let i = 0; i < 7; i++) {
    const hot = heat * (0.6 + hash2(i, j, 4) * 0.4);
    const c = hot > 0.7 ? 4 : hot > 0.45 ? 3 : hot > 0.2 ? 1 : 0;
    p.px(cx - 5 + i, gy - 10 + j, c ? LAVA[c] : CHAR[1]);
    if (c) g.px(cx - 5 + i, gy - 10 + j, GLOW[Math.max(0, c - 1)]);
  }
  // Helm weggerollt
  const hx = cx + 16 + k * 4;
  ell(p, hx, gy - 5, 5.5, 5, IRON, { bias: 0.05 });
  p.rect(hx - 4, gy - 6, 9, 1, BRASS[3]);
  p.rect(hx + 1, gy - 4, 4, 1, heat > 0.3 ? LAVA[3] : VOID); if (heat > 0.3) g.rect(hx + 1, gy - 4, 4, 1, GLOW[2]);
  // Schild steht schräg, Hammer liegt
  anvil(p, g, cx - 30, gy - 5, heat * 0.8);
  wardenHammer(p, g, cx + 4, gy - 2, 0.02, heat, false);
  // Rauch
  for (let i = 0; i < 4; i++) if (heat > 0.2) g.px(cx - 3 + i, gy - 16 - i * 2 - k * 4, GLOW[0]);
  return {
    eye: { x: hx + 2, y: gy - 4 }, head: { x: hx, y: gy - 10 }, chest: { x: cx - 2, y: gy - 8 },
    hand: { x: cx + 4, y: gy - 2 }, handB: { x: cx - 30, y: gy - 5 }, shield: { x: cx - 30, y: gy - 10 }, tip: { x: cx + 30, y: gy - 2 },
  };
}

function createWarden() {
  const S = { ...WD, draw: (p, g, P, ex, t) => drawWarden(p, g, P, { ...ex, t }) };
  const idle = [];
  for (let i = 0; i <= 6; i++) {
    const ph = (i / 6) * Math.PI * 2, s = Math.sin(ph);
    idle.push([i / 6, wdp({ hipY: Math.max(0, s), lean: 0.05 + s * 0.015, hFy: 14 + Math.max(0, s), hBy: 12 + Math.max(0, s), headY: Math.max(0, s), heat: 0.95 + s * 0.15, visor: 1, vent: 0.3 + Math.max(0, s) * 0.3 }), linear]);
  }
  const walk = [];
  for (let i = 0; i <= 8; i++) {
    const ph = (i / 8) * Math.PI * 2, s = Math.sin(ph), c = Math.cos(ph);
    walk.push([i / 8, wdp({
      hipX: 1, hipY: 1 - Math.abs(c) * 2, lean: 0.12 + s * 0.02, head: s * 0.5, headY: Math.abs(c),
      fFx: 3 + s * 8, fFy: Math.max(0, -c) * 4, fBx: -4 - s * 8, fBy: Math.max(0, c) * 4,
      hFx: 11 - s * 2, hFy: 13, ham: 0.72 - s * 0.08, hBx: -12 + s * 2, hBy: 10, vent: 0.5,
    }), linear]);
  }
  // Hieb: Hammer über die Schulter, dann schräg nach vorn-unten
  const w1 = wdp({ lean: -0.05, hipX: -1, hFx: 4, hFy: -6, ham: -1.6, hBx: -11, hBy: 9, fFx: 9, fBx: -9, heat: 1.2, vent: 0.6 });
  const w2 = wdp({ lean: -0.18, hipX: -2, hipY: -1, hFx: -2, hFy: -12, ham: -2.5, hBx: -12, hBy: 8, fFx: 10, fBx: -10, heat: 1.4, visor: 1.3, vent: 0.8 });
  const s1 = wdp({ lean: 0.2, hipX: 2, hipY: 2, hFx: 16, hFy: -6, ham: -0.6, hBx: -13, hBy: 10, fFx: 12, fBx: -10, heat: 1.4, visor: 1.3 });
  const s2 = wdp({ lean: 0.38, hipX: 4, hipY: 5, hFx: 18, hFy: 10, ham: 0.72, hBx: -14, hBy: 11, fFx: 13, fBx: -11, heat: 1.5, visor: 1.3 });
  const s3 = wdp({ lean: 0.34, hipX: 4, hipY: 5, hFx: 17, hFy: 11, ham: 0.72, hBx: -13, hBy: 11, fFx: 13, fBx: -11, heat: 1.2 });
  const s4 = wdp({ lean: 0.15, hipX: 2, hipY: 2, hFx: 12, hFy: 13, ham: 0.8, fFx: 10, fBx: -9 });
  // Brüllen: Schild und Hammer ausgebreitet, Visier und Schlote lodern
  const r1 = wdp({ lean: -0.08, hFx: 14, hFy: 2, ham: -0.9, hBx: -15, hBy: 4, headY: -1, visor: 1.5, heat: 1.4, vent: 1 });
  const r2 = wdp({ lean: -0.22, hipY: -1, hFx: 16, hFy: -6, ham: -1.3, hBx: -17, hBy: 0, headY: -2, head: -1, visor: 2, heat: 1.9, vent: 1.6 });
  // Bodenschlag: Hammer steil hoch, dann senkrecht in den Boden
  const sl1 = wdp({ lean: -0.1, hipY: -1, hFx: 6, hFy: -16, ham: -1.75, hBx: -12, hBy: 8, heat: 1.3, visor: 1.2, vent: 0.8 });
  const sl2 = wdp({ lean: -0.25, hipY: -3, hFx: 2, hFy: -20, ham: -2.15, hBx: -12, hBy: 6, heat: 1.6, visor: 1.5, fBy: 2, vent: 1.2 });
  const sl3 = wdp({ lean: 0.45, hipY: 7, hFx: 20, hFy: 0, ham: 1.3, hBx: -13, hBy: 12, heat: 1.9, visor: 1.6, fFx: 12, fBx: -11, vent: 1.4 });
  const sl4 = wdp({ lean: 0.42, hipY: 7, hFx: 20, hFy: 0, ham: 1.3, hBx: -13, hBy: 12, heat: 1.5, visor: 1.2, fFx: 12, fBx: -11, vent: 1 });
  const sl5 = wdp({ lean: 0.15, hipY: 2, hFx: 12, hFy: 13, ham: 0.8, heat: 1.1, vent: 0.5 });
  const hurtP = wdp({ lean: -0.18, hipX: -3, head: -2, headY: -1, hFx: 7, hFy: 10, ham: 0.95, hBx: -13, hBy: 8, visor: 1.6, heat: 1.5 });
  const d1 = wdp({ lean: -0.28, hipX: -4, head: -2, headY: -1, hFx: 6, hFy: 10, ham: 1.0, hBx: -14, hBy: 8, visor: 1.3, heat: 1.4 });
  const d2 = wdp({ lean: 0.4, kneel: 1, hipY: 3, head: 1, headY: 2, hFx: 16, hFy: 12, ham: 0.5, hBx: -9, hBy: 16, visor: 0.8, heat: 0.9 });
  const d3 = wdp({ lean: 0.8, kneel: 1, hipY: 8, head: 2, headY: 4, hFx: 20, hFy: 12, ham: 0.15, hBx: -3, hBy: 16, visor: 0.3, heat: 0.6 });
  return {
    idle: new Animation(track(S, idle, 6, { loop: true }), 5),
    walk: new Animation(track(S, walk, 8, { loop: true, extras: { 0: { fx: 'step' }, 4: { fx: 'step' } } }), 8),
    windup: new Animation(track(S, [[0, idle[0][1]], [0.45, w1], [1, w2]], 5, { extras: { 3: { hammerBehind: true }, 4: { hammerBehind: true } } }), 8, false),
    strike: new Animation(track(S, [[0, s1], [0.25, s2, snap], [0.6, s3], [1, s4]], 5, {
      extras: { 0: { smear: [-2.4, -0.6] }, 1: { fx: 'impact', smear: [-1.5, 0.95], impact: 9 }, 2: { impact: 13 } },
    }), 12, false),
    roar: new Animation(track(S, [[0, idle[0][1]], [0.3, r1], [0.5, r2, snap], [0.85, { ...r2, vent: 1.8 }], [1, wdp({ ...r1, visor: 1.2 })]], 7, {
      extras: { 3: { fx: 'roar', roarFx: 1 }, 4: { roarFx: 2 }, 5: { roarFx: 3 } },
    }), 7, false),
    slam: new Animation(track(S, [[0, idle[0][1]], [0.25, sl1], [0.45, sl2], [0.6, sl3, snap], [0.8, sl4], [1, sl5]], 8, {
      extras: { 1: { hammerBehind: true }, 2: { hammerBehind: true }, 3: { smear: [-2.2, 1.4] }, 4: { fx: 'impact', impact: 16 }, 5: { impact: 22 } },
    }), 9, false),
    hurt: new Animation(track(S, [[0, hurtP], [1, wdp({ lean: 0 })]], 2, { extras: { 0: { hurt: true } } }), 8, false),
    death: new Animation([
      ...track(S, [[0, hurtP], [0.3, d1], [0.65, d2, snap], [1, d3]], 4, { extras: { 0: { hurt: true }, 2: { fx: 'impact' } } }),
      still(S, (p, g) => drawWardenFallen(p, g, 0), 'impact'),
      still(S, (p, g) => drawWardenFallen(p, g, 0.5)),
      still(S, (p, g) => drawWardenFallen(p, g, 1)),
    ], 6, false),
  };
}

// ================================================================ Export

const FORGE = {
  forge_golem: createForgeGolem,
  flame_acolyte: createAcolyte,
  ember_drake: createDrake,
  forge_warden: createWarden,
};

// only (optional): nur eine Figur erzeugen (Vorschau/Werkzeuge).
// Jede Figur wird erst beim ersten Zugriff gezeichnet und dann gecacht, damit
// eine Zone nur die Gegner erzeugt, die sie wirklich braucht.
export function createForgeFoes(only) {
  const out = {};
  for (const k in FORGE) {
    if (only && only !== k) continue;
    Object.defineProperty(out, k, {
      configurable: true, enumerable: true,
      get() {
        const v = FORGE[k]();
        Object.defineProperty(out, k, { value: v, writable: true, configurable: true, enumerable: true });
        return v;
      },
    });
  }
  return out;
}
