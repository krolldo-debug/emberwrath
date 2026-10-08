import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame, SpriteFrame, Animation } from '../gfx/Sprite.js';
import { FK } from './foes_cinder.js';

// Gegner der Glutöde (Stufe 36–40): Aschegeist, Schlackenritter,
// Magmaschlange, Glutadept und der Glutkoloss (Elite).
//
// Gleicher Rig-Ansatz wie foes_cinder.js / foes_forge.js (Werkzeuge aus FK):
// Schlüsselposen, weich interpoliert, Licht von links oben, Leucht-Ebene
// (frame.glow), Metadaten (frame.meta) und Ereignismarken (frame.fx).
// Neu: Randlicht. Die Öde hat dunklen Obsidianboden – jede Figur bekommt
// nach dem Zeichnen eine helle Oberkante (Aschelicht von oben links) und
// einen schwachen Glutsaum an der Unterseite/Rückseite auf der Leuchtebene
// (Widerschein des glühenden Bodens). So bleibt die Silhouette lesbar.
// Blickrichtung rechts, Anker = Bodenkontakt.

const {
  GLOW, LAVA, linear, snap, clamp, sample, ell, cap, poly, ik, glowDot, veins, flame, fireball,
  dustRing, occlude, robe, hash2, SMEAR, OBS, OBS_SHINE, CHAR, VOID, rimGlow,
} = FK;

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


// ================================================================ Rahmen mit Randlicht

const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

// Randlicht als Nachbearbeitung der Farbebene: Pixel mit freier Oberseite/
// linker Seite werden zur Lichtfarbe gezogen, Pixel mit freier Unter-/
// rechter Seite bekommen auf der Leuchtebene einen schwachen Glutsaum.
function rimLight(p, g, rim) {
  const W = p.w, H = p.h;
  const img = p.ctx.getImageData(0, 0, W, H), d = img.data;
  const gimg = g.ctx.getImageData(0, 0, W, H), gd = gimg.data;
  const src = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) src[i] = d[i * 4 + 3] > 40 ? 1 : 0;
  const A = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : src[y * W + x]);
  const [hr, hg, hb] = hex(rim.hi);
  const back = rim.back ? hex(rim.back) : null;
  const k = rim.k ?? 0.4;
  const minY = rim.backFrom ?? 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!src[y * W + x]) continue;
    const i = (y * W + x) * 4;
    if (gd[i + 3] > 0 && gd[i] + gd[i + 1] > 260) continue; // glühende Stellen bleiben
    const top = !A(x, y - 1), left = !A(x - 1, y), tl = !A(x - 1, y - 1);
    let f = 0;
    if (top && left) f = k * 1.25; else if (top) f = k; else if (left) f = k * 0.7; else if (tl) f = k * 0.45;
    if (f > 0) {
      f = Math.min(0.85, f);
      d[i] += (hr - d[i]) * f; d[i + 1] += (hg - d[i + 1]) * f; d[i + 2] += (hb - d[i + 2]) * f;
      continue;
    }
    if (back && y >= minY && (!A(x + 1, y) || !A(x, y + 1)) && gd[i + 3] === 0) {
      gd[i] = back[0]; gd[i + 1] = back[1]; gd[i + 2] = back[2]; gd[i + 3] = 255;
    }
  }
  p.ctx.putImageData(img, 0, 0);
  g.ctx.putImageData(gimg, 0, 0);
}

// Frame bauen: spec = { W, H, AX, AY, pad?, rim? }; draw(p, g) -> meta (absolut)
function makeFrame(S, draw, fx = null) {
  const pad = S.pad ?? 8;
  const W2 = S.W + pad * 2, H2 = S.H + pad * 2;
  const g = new PixelCanvas(W2, H2);
  g.ctx.translate(pad, pad);
  let meta = {};
  const f = buildFrame(W2, H2, S.AX + pad, S.AY + pad, (p) => {
    p.ctx.translate(pad, pad);
    meta = draw(p, g) || {};
    occlude(null);
    if (S.rim) rimLight(p, g, S.rim);
  });
  f.glow = new SpriteFrame(g.canvas, S.AX + pad, S.AY + pad);
  f.meta = {};
  for (const k in meta) f.meta[k] = { dx: Math.round(meta[k].x - S.AX), dy: Math.round(meta[k].y - S.AY) };
  f.fx = fx;
  return f;
}

// n Frames aus einer Keyframe-Spur (wie FK.track, aber mit Randlicht)
function track(S, keys, n, { loop = false, extras = {} } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = loop ? i / n : n === 1 ? 1 : i / (n - 1);
    const P = sample(keys, t);
    const ex = extras[i] || {};
    out.push(makeFrame(S, (p, g) => S.draw(p, g, P, ex, t), ex.fx ?? null));
  }
  return out;
}
const still = (S, draw, fx = null) => makeFrame(S, draw, fx);

// Loop-Spur aus einer Posenfunktion f(phase 0..2π)
function cycle(f, n) {
  const keys = [];
  for (let i = 0; i <= n; i++) keys.push([i / n, f((i / n) * Math.PI * 2, i), linear]);
  return keys;
}

// Pixel der Farbebene zerfallen lassen (Aschegeist-Tod, Auflösung von oben)
function dissolve(p, g, k, seed, top, bottom, ash) {
  const W = p.w, H = p.h;
  const img = p.ctx.getImageData(0, 0, W, H), d = img.data;
  const gimg = g.ctx.getImageData(0, 0, W, H), gd = gimg.data;
  const fall = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (d[i + 3] < 40) continue;
    const h = 1 - clamp((y - top) / (bottom - top), 0, 1); // oben = 1
    const r = hash2(x, y, seed);
    if (r < k * 1.6 - (1 - h) * 0.8) {
      d[i + 3] = 0; gd[i + 3] = 0;
      if (hash2(x, y, seed + 1) < 0.12) fall.push([x, y]);
    }
  }
  p.ctx.putImageData(img, 0, 0);
  g.ctx.putImageData(gimg, 0, 0);
  // fallende Asche und Glutflocken (Koordinaten ohne Polsterung → Transform zurück)
  p.ctx.save(); g.ctx.save();
  p.ctx.setTransform(1, 0, 0, 1, 0, 0); g.ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const [x, y] of fall) {
    const dy = 2 + hash2(x, y, seed + 2) * 5 * k, dx = (hash2(x, y, seed + 3) - 0.7) * 4;
    if (hash2(x, y, seed + 4) < 0.3) { p.px(x + dx, y + dy, LAVA[3]); g.px(x + dx, y + dy, GLOW[2]); }
    else p.px(x + dx, y + dy, ash[1 + Math.floor(hash2(x, y, seed + 5) * (ash.length - 1))]);
  }
  p.ctx.restore(); g.ctx.restore();
}

// ================================================================ Materialien

// Asche (warmes Grau, leicht violett im Schatten)
const ASHW = ['#110e12', '#1d181d', '#2c252a', '#40363a', '#5a4e50', '#7c6f6c'];
const ASHW_D = ['#0d0b0e', '#161217', '#211c21', '#2e272c', '#3d3438'];
const CLAW = ['#171214', '#2b2226', '#473a3c', '#6e5e5c', '#a09088'];
// erkaltete Schlacke (blauschwarz mit rostigem Glanz)
const SLAG = ['#100e14', '#1c1a22', '#2b2733', '#3e3845', '#57505c', '#7a6f78'];
const SLAG_D = ['#09080c', '#111016', '#1a1820', '#25222b', '#322d37'];
const RUST = ['#2a120c', '#4a2014', '#6e341c', '#96502a', '#c07a44'];
// Magmaschlange: Kruste und Bauch
const CRUST = ['#0e0a0c', '#1a1216', '#2a1c1e', '#3e2a26', '#56392e', '#76503a'];
const CRUST_D = ['#0a0709', '#130d10', '#1e1416', '#2a1c1c', '#38251f'];
const BELLY = ['#5a1406', '#9a2608', '#d4480e', '#fc8424', '#ffc450', '#fff0b0'];
// Glutadept: Robe, Maske, Gold
const ROBE = ['#0e080a', '#1a0d10', '#2a1216', '#3e1a1c', '#582622', '#76342a'];
const ROBE_CH = ['#0b090a', '#161213', '#221c1c', '#302826'];
const GOLD = ['#2e1a08', '#5a3610', '#8a5a1a', '#c08a2c', '#e8be52', '#fff0a0'];
const SKIN = ['#2a1612', '#4a2a20', '#6e4030', '#925a40'];
// Koloss: Basaltfels, Obsidiandornen
const ROCK = ['#0f0c0e', '#1b1619', '#2a2226', '#3b3034', '#524448', '#6e5c5c'];
const ROCK_D = ['#0b090b', '#141013', '#1e181b', '#2a2125', '#372c30'];

const RIM_ASH = { hi: '#d9cec6', k: 0.42, back: '#3a0e06' };
const RIM_WARM = { hi: '#e8c8a8', k: 0.38, back: '#3a0e06' };

// Klaue: drei gebogene Krallen ab (x,y) in Richtung a, spread 0..1
function claws(p, g, x, y, a, spread, len, ramp, heat, back) {
  for (let i = -1; i <= 1; i++) {
    const aa = a + i * (0.28 + spread * 0.45);
    let cx = x, cy = y;
    for (let s = 0; s < len; s++) {
      const bend = aa + (s / len) * 0.7; // krümmt sich nach unten
      cx += Math.cos(bend); cy += Math.sin(bend);
      const tip = s >= len - 2;
      p.px(cx, cy, tip ? ramp[back ? 2 : 4] : ramp[back ? 1 : 2 + (s < 2 ? 1 : 0)]);
      if (tip && heat > 1.05 && !back) g.px(cx, cy, GLOW[heat > 1.3 ? 3 : 1]);
    }
  }
}

// Rauch-/Aschefahne (nur Farbebene, grau), steigt mit der Phase
function wisps(p, x, y, ph, n, ramp, seed, h = 8) {
  for (let i = 0; i < n; i++) {
    const u = ((ph / (Math.PI * 2)) + hash2(i, 1, seed)) % 1;
    const yy = y - u * h, xx = x + Math.sin(ph + i * 2.1) * 1.5 - u * 2 + (hash2(i, 2, seed) - 0.5) * 4;
    if (u > 0.85) continue;
    p.px(xx, yy, ramp[u < 0.3 ? 3 : u < 0.6 ? 2 : 1]);
    if (u < 0.5) p.px(xx + 1, yy, ramp[2]);
  }
}

// ================================================================ Aschegeist

const AW = { W: 60, H: 62, AX: 26, AY: 57, rim: RIM_ASH };
const AW_REST = {
  x: 0, bob: 0, lean: 0.1, hover: 15, tail: 0, drift: 0.2, head: 0, headY: 0, jaw: 0.1,
  hFx: 8, hFy: 12, hBx: -1, hBy: 13, claw: 0.3, heat: 1, eye: 1, smoke: 0,
};
const awp = (o) => ({ ...AW_REST, ...o });

function drawWraith(p, g, P, ex) {
  const { AX, AY } = AW;
  const meta = {};
  const gy = AY;
  const heat = P.heat;
  const waist = { x: AX + P.x, y: gy - P.hover - P.bob };
  const lean = P.lean;
  const ch = { x: waist.x + Math.sin(lean) * 11, y: waist.y - Math.cos(lean) * 11 };
  const shF = { x: ch.x + 3.5, y: ch.y - 4 }, shB = { x: ch.x - 3.5, y: ch.y - 5 };

  const arm = (sh, tx, ty, ramp, back) => {
    const k = ik(sh.x, sh.y, tx, ty, 8, 9, 1);
    cap(p, sh.x, sh.y, k.jx, k.jy, back ? 1.8 : 2.1, 1.5, ramp, { noise: 0.09, seed: back ? 5 : 6 });
    // zerfetzter Ärmel hängt vom Unterarm
    for (let i = 0; i < 4; i++) {
      const u = 0.15 + i * 0.2, sx = k.jx + (k.ex - k.jx) * u, sy = k.jy + (k.ey - k.jy) * u;
      const L = 3 + (i % 2) * 2 + Math.sin(P.tail + i) * 0.8;
      p.line(sx, sy + 1, sx - 1 - P.drift * 1.5, sy + L, ramp[back ? 1 : 2 + (i % 2)]);
    }
    cap(p, k.jx, k.jy, k.ex, k.ey, 1.4, 1.2, ramp, { noise: 0.09, seed: back ? 7 : 8 });
    // Glutriss im Unterarm
    if (!back) {
      const mx = (k.jx + k.ex) / 2, my = (k.jy + k.ey) / 2;
      p.px(mx, my, LAVA[heat > 1.2 ? 3 : 2]); g.px(mx, my, GLOW[heat > 1.2 ? 2 : 1]);
      p.px(k.jx, k.jy, ramp[4]);
    }
    const a = Math.atan2(k.ey - k.jy, k.ex - k.jx);
    ell(p, k.ex, k.ey, 1.6, 1.4, ramp);
    claws(p, g, k.ex, k.ey, a, P.claw, back ? 5 : 7, CLAW, heat, back);
    return { k, a };
  };

  // --- hinterer Arm
  const bArm = arm(shB, ch.x + P.hBx, ch.y + P.hBy, ASHW_D, true);
  meta.handB = { x: bArm.k.ex, y: bArm.k.ey };

  // --- Schleppe: zerfaserte Aschefahne statt Beinen
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
  for (const [x0, y0, x1, y1, u] of tail) cap(p, x0, y0, x1, y1, 5.8 * (1 - u) ** 1.1 + 0.5, 5.8 * (1 - u + 1 / N) ** 1.1 * 0.9 + 0.4, ASHW, { noise: 0.11, seed: 11 });
  // Fransen am Ende
  for (let s = 0; s < 3; s++) {
    let fx = tx + 1, fy = ty - 1 + s;
    for (let j = 0; j < 5; j++) {
      fx -= 1; fy += Math.sin(P.tail * 1.3 + s * 2 + j * 0.9) * 0.8 + (s - 1) * 0.3;
      p.px(fx, fy, ASHW[j < 2 ? 3 : 2]);
    }
  }
  // Glutflocken an den Rändern der Schleppe
  for (let i = 0; i < 5; i++) {
    const [x0, y0, , , u] = tail[Math.min(N - 1, 2 + i)];
    const ox = Math.sin(P.tail * 2 + i * 1.7) * 3, oy = 3 + (i % 2) * 2 + Math.cos(P.tail + i) * 1.5;
    if (hash2(i, Math.floor(P.tail * 2), 3) < 0.6) { p.px(x0 + ox, y0 + oy, LAVA[3]); g.px(x0 + ox, y0 + oy, GLOW[u > 0.5 ? 1 : 2]); }
  }
  // Glimmende Adern in der Schleppe
  for (let i = 0; i < 3; i++) {
    const [x0, y0, x1, y1] = tail[1 + i * 2];
    const x = (x0 + x1) / 2 + (i - 1), y = (y0 + y1) / 2;
    p.px(x, y, LAVA[1]); if (heat > 0.9) { p.px(x + 1, y - 1, LAVA[2]); g.px(x + 1, y - 1, GLOW[1]); }
  }

  // --- Rumpf: gebeugter Brustkorb aus gebackener Asche, Mantelfetzen
  cap(p, waist.x, waist.y, ch.x, ch.y, 4.6, 6.2, ASHW, { noise: 0.1, seed: 13 });
  ell(p, ch.x - 0.5, ch.y, 6.8, 6.4, ASHW, { noise: 0.09, seed: 14, rot: lean });
  // Rippen: kurze helle Bögen, dazwischen Glut
  for (let r = 0; r < 3; r++) {
    const ry = ch.y - 1 + r * 2.4;
    for (let x = 0; x < 4 - r * 0.5; x++) p.px(ch.x + 1 + x + lean * 2, ry + x * 0.3, ASHW[5 - (x > 2 ? 1 : 0)]);
    p.px(ch.x + 1 + lean * 2, ry + 1, LAVA[heat > 1.1 ? 3 : 2]); g.px(ch.x + 1 + lean * 2, ry + 1, GLOW[heat > 1.1 ? 2 : 1]);
  }
  // Glutherz hinter den Rippen
  const hcx = ch.x + 0.5 + lean * 2, hcy = ch.y + 1;
  p.px(hcx, hcy, LAVA[4]); p.px(hcx - 1, hcy, LAVA[3]); p.px(hcx, hcy + 1, LAVA[3]);
  glowDot(g, hcx, hcy, 0.8 + heat * 0.9);
  meta.chest = { x: hcx, y: hcy };
  veins(p, g, waist.x, waist.y - 1, 3.5, 3, 17, 2, heat * 0.7, { len: 4 });

  // Mantelfetzen über Schultern und Rücken (hängen nach hinten)
  poly(p, [[shB.x - 2, shB.y - 1], [shF.x + 2, shF.y - 1], [ch.x - 1, ch.y + 5], [ch.x - 7 - P.drift * 3, ch.y + 7 + Math.sin(P.tail) * 1.5], [ch.x - 6, ch.y]],
    (x, y) => ASHW[(y - ch.y < 0 ? 3 : 2) - (hash2(x, y, 19) < 0.2 ? 1 : 0)]);
  for (let i = 0; i < 3; i++) {
    const bx = ch.x - 5 - i * 1.5 - P.drift * 2, by = ch.y + 5 + i;
    p.line(bx, by, bx - 1 - P.drift * 2, by + 3 + Math.sin(P.tail + i) * 1, ASHW[2]);
  }

  // --- Kopf: Kapuze aus Asche, Schädelmaske, glühende Augen
  const hx = ch.x + 3.5 + lean * 3 + P.head, hy = ch.y - 9.5 + P.headY;
  // Kapuzenzipfel sackt nach hinten
  poly(p, [[hx - 2, hy - 5.5], [hx - 7 - P.drift * 2, hy - 3.5], [hx - 9 - P.drift * 3, hy + 1 + Math.sin(P.tail) * 0.8], [hx - 7 - P.drift * 2, hy + 5], [hx - 3, hy + 4]], (x, y) => ASHW[(y < hy - 2 ? 3 : 2) - (hash2(x, y, 27) < 0.15 ? 1 : 0)]);
  ell(p, hx - 0.5, hy, 5.2, 5.4, ASHW, { noise: 0.08, seed: 21, bias: 0.04 });
  // Gesichtsöffnung
  ell(p, hx + 2, hy + 0.8, 3, 3.6, [VOID, '#1a1014']);
  // Schädelmaske (fahles Knochengrau) im Schatten
  const bone = PAL.bone;
  p.rect(hx + 1, hy - 2, 4, 1, bone[2]); p.px(hx + 1, hy - 2, bone[3]); p.rect(hx + 1, hy - 1, 4, 1, bone[1]);
  p.px(hx + 2, hy, bone[1]); p.px(hx + 4, hy, bone[0]); p.rect(hx + 2, hy + 1, 3, 1, bone[1]); p.px(hx + 3, hy + 1, VOID);
  // Kiefer
  const jy = hy + 3 + P.jaw * 2;
  if (P.jaw > 0.3) { p.rect(hx + 2, hy + 2, 3, jy - hy - 2, VOID); g.rect(hx + 2, hy + 2, 3, jy - hy - 2, GLOW[1]); }
  p.rect(hx + 2, jy, 3, 1, bone[1]); p.px(hx + 4, jy, bone[2]); p.px(hx + 2, jy, bone[0]);
  // Augen
  const ec = ex.hurt ? '#ffffff' : P.eye > 1.2 ? LAVA[5] : LAVA[4];
  p.px(hx + 1, hy, ec); p.px(hx + 3, hy, ec);
  g.px(hx + 1, hy, GLOW[4]); g.px(hx + 3, hy, GLOW[4]); g.px(hx + 1, hy + 1, GLOW[1]); g.px(hx + 3, hy + 1, GLOW[1]);
  if (P.eye > 1.2) { g.px(hx + 1, hy - 1, GLOW[2]); g.px(hx + 3, hy - 1, GLOW[2]); g.px(hx + 5, hy, GLOW[2]); }
  meta.eye = { x: hx + 2, y: hy };
  meta.head = { x: hx, y: hy - 5 };
  meta.mouth = { x: hx + 3, y: jy };
  // Asche weht aus der Kapuze
  wisps(p, hx - 2, hy - 4, P.smoke, 4, ASHW, 23, 9);
  if (hash2(Math.floor(P.smoke * 3), 1, 25) < 0.7) { const sx = hx - 3 + Math.sin(P.smoke) * 2, sy = hy - 7 - (P.smoke % 1) * 3; p.px(sx, sy, LAVA[3]); g.px(sx, sy, GLOW[2]); }

  // --- vorderer Arm mit Klaue
  if (ex.smear) arcSmear(p, g, shF.x, shF.y, ex.smear[0], ex.smear[1], 13, 21, SMEAR, 29, false);
  occlude(g);
  const fArm = arm(shF, ch.x + P.hFx, ch.y + P.hFy, ASHW, false);
  occlude(null);
  // Knochige Schulter
  ell(p, shF.x, shF.y, 2.2, 2, ASHW, { bias: 0.1 });
  meta.hand = { x: fArm.k.ex + Math.cos(fArm.a) * 3, y: fArm.k.ey + Math.sin(fArm.a) * 3 };
  if (P.heat > 1.25) glowDot(g, fArm.k.ex, fArm.k.ey, 0.8);
  if (ex.smear2) arcSmear(p, g, shB.x, shB.y, ex.smear2[0], ex.smear2[1], 12, 18, SMEAR, 31, false);
  return meta;
}

function drawWraithDeath(p, g, P, ex) {
  const meta = drawWraith(p, g, P, ex);
  dissolve(p, g, ex.dis, 41, 0, AW.AY + (AW.pad ?? 8) - 2, ASHW);
  return meta;
}

// Aschehaufen mit glimmender Glut und Krallenresten
function drawWraithAsh(p, g, k) {
  const { AX, AY } = AW;
  const gy = AY;
  const heat = 1 - k;
  for (let j = 0; j < 5; j++) {
    const hw = 10 - j * 2 + (j === 0 ? 2 : 0);
    for (let x = -hw; x <= hw; x++) {
      if (j > 0 && hash2(x, j, 5) < 0.18) continue;
      const t = 0.3 + (hw - x) / (2 * hw + 1) * 0.45 + (j > 2 ? 0.1 : 0) + (hash2(x, j, 6) - 0.5) * 0.2;
      p.px(AX - 1 + x, gy - 1 - j, ASHW[clamp(Math.floor(t * 6), 1, 5)]);
    }
  }
  // Schädelmaske und Krallen
  const bone = PAL.bone;
  p.rect(AX + 6, gy - 3, 3, 2, bone[1]); p.px(AX + 6, gy - 3, bone[2]); p.px(AX + 7, gy - 2, VOID);
  p.line(AX - 10, gy - 1, AX - 6, gy - 2, CLAW[3]); p.line(AX - 9, gy, AX - 5, gy - 1, CLAW[2]);
  // Glut
  for (let i = 0; i < 7; i++) {
    if (hash2(i, 3, 9) > heat * 1.2) continue;
    const x = AX - 7 + hash2(i, 1, 9) * 14, y = gy - 1 - hash2(i, 2, 9) * 3;
    p.px(x, y, LAVA[heat > 0.5 ? 3 : 2]); g.px(x, y, GLOW[heat > 0.5 ? 2 : 1]);
  }
  if (heat > 0.4) glowDot(g, AX, gy - 2, heat * 1.5);
  if (heat > 0.2) wisps(p, AX, gy - 5, k * 9, 3, ASHW, 7, 8);
  return { eye: { x: AX + 7, y: gy - 3 }, head: { x: AX + 7, y: gy - 6 }, hand: { x: AX - 6, y: gy - 2 }, chest: { x: AX, y: gy - 3 } };
}

function createWraith() {
  const S = { ...AW, draw: drawWraith };
  const idle = cycle((ph) => {
    const s = Math.sin(ph), c = Math.cos(ph);
    return awp({ bob: s * 1.4, tail: ph, smoke: ph, hFy: 12 + s, hBy: 13 + s, hFx: 8 + c * 0.5, claw: 0.3 + Math.max(0, c) * 0.4, heat: 0.9 + s * 0.15, headY: -Math.max(0, s) * 0.6 });
  }, 6);
  const walk = cycle((ph) => {
    const s = Math.sin(ph), c = Math.cos(ph);
    return awp({ bob: s * 1.2, lean: 0.35, drift: 0.9, tail: ph * 2, smoke: ph * 2, hFx: 3 + c, hFy: 11, hBx: -5 - c, hBy: 11, claw: 0.1, head: 0.5, heat: 1 });
  }, 6);
  // Ausholen: aufrichten, Klauen weit nach hinten-oben, Augen lodern
  const w1 = awp({ bob: 2, lean: -0.05, drift: 0.3, hFx: 0, hFy: -4, hBx: -6, hBy: -2, claw: 0.8, jaw: 0.6, heat: 1.2, eye: 1.3, head: -0.5, tail: 1, smoke: 1 });
  const w2 = awp({ bob: 3.5, lean: -0.22, x: -2, drift: 0.4, hFx: -3, hFy: -9, hBx: -8, hBy: -6, claw: 1, jaw: 1, heat: 1.45, eye: 1.5, head: -1, headY: -1, tail: 2, smoke: 2 });
  // Hieb: vorschnellen, beide Klauen reißen schräg nach unten
  const s1 = awp({ bob: 1, lean: 0.55, x: 4, drift: 1, hFx: 13, hFy: -2, hBx: 3, hBy: -6, claw: 1, jaw: 0.8, heat: 1.5, eye: 1.4, tail: 3, smoke: 3 });
  const s2 = awp({ bob: -1, lean: 0.7, x: 6, drift: 1.1, hFx: 12, hFy: 10, hBx: 10, hBy: 0, claw: 0.7, jaw: 0.5, heat: 1.4, eye: 1.3, tail: 3.6, smoke: 3.5 });
  const s3 = awp({ bob: -1, lean: 0.6, x: 6, drift: 0.9, hFx: 8, hFy: 13, hBx: 12, hBy: 9, claw: 0.5, jaw: 0.3, heat: 1.2, tail: 4.2, smoke: 4 });
  const s4 = awp({ bob: 0, lean: 0.25, x: 2, drift: 0.5, hFx: 7, hFy: 10, hBx: 1, hBy: 10, claw: 0.3, heat: 1, tail: 5, smoke: 5 });
  const hurtP = awp({ bob: 2, lean: -0.35, x: -3, drift: 0.1, head: -1.5, headY: -1, hFx: 2, hFy: 4, hBx: -6, hBy: 5, claw: 1, jaw: 0.8, heat: 1.6, tail: 2 });
  const d1 = awp({ bob: 3, lean: -0.4, x: -3, drift: 0, head: -1.5, headY: -1, hFx: 0, hFy: -3, hBx: -7, hBy: -1, claw: 1, jaw: 1, heat: 1.8, eye: 1.6, tail: 3 });
  const d2 = awp({ bob: -4, hover: 7, lean: 0.2, x: -1, drift: 0.1, head: 0.5, headY: 2, hFx: 5, hFy: 12, hBx: 0, hBy: 12, claw: 0.2, jaw: 1, heat: 1.2, tail: 4 });
  const SD = { ...AW, draw: drawWraithDeath };
  return {
    idle: new Animation(track(S, idle, 6, { loop: true }), 6),
    walk: new Animation(track(S, walk, 6, { loop: true }), 10),
    windup: new Animation(track(S, [[0, idle[0][1]], [0.45, w1], [1, w2]], 4), 7, false),
    strike: new Animation(track(S, [[0, s1], [0.25, s2, snap], [0.6, s3], [1, s4]], 5, {
      extras: { 0: { smear: [-2.0, -0.4] }, 1: { fx: 'impact', smear: [-1.3, 1.0], smear2: [-1.6, 0.2] }, 2: { smear2: [-0.8, 1.2] } },
    }), 14, false),
    hurt: new Animation(track(S, [[0, hurtP], [1, awp({ lean: -0.05, heat: 1.2 })]], 2, { extras: { 0: { hurt: true } } }), 9, false),
    death: new Animation([
      ...track(S, [[0, hurtP], [1, d1]], 2, { extras: { 0: { hurt: true } } }),
      ...track(SD, [[0, d1], [1, d2]], 4, { extras: { 0: { dis: 0.12 }, 1: { dis: 0.35 }, 2: { dis: 0.6 }, 3: { dis: 0.85 } } }),
      still(S, (p, g) => drawWraithAsh(p, g, 0), 'impact'),
      still(S, (p, g) => drawWraithAsh(p, g, 0.5)),
      still(S, (p, g) => drawWraithAsh(p, g, 1)),
    ], 8, false),
  };
}


// ================================================================ Schlackenritter

const KN = { W: 70, H: 62, AX: 30, AY: 56, rim: RIM_WARM };
const KN_REST = {
  hipX: 0, hipY: 0, lean: 0.06, head: 0, headY: 0, kneel: 0,
  fFx: 6, fFy: 0, fBx: -6, fBy: 0,
  gx: 9, gy: 10, ma: -1.25, heat: 1, visor: 1, cape: 0,
};
const knp = (o) => ({ ...KN_REST, ...o });

// Glühende Fuge zwischen zwei Schlackenplatten (unterbrochen)
function seam(p, g, x0, y0, x1, y1, heat, seed) {
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= n; i++) {
    const x = x0 + (x1 - x0) * (i / n), y = y0 + (y1 - y0) * (i / n);
    const r = hash2(i, 1, seed);
    if (r < 0.18) { p.px(x, y, SLAG[0]); continue; }
    const mid = 1 - Math.abs(i / n - 0.5) * 1.2;
    const h = heat * (0.45 + r * 0.35 + mid * 0.3);
    const c = h > 1.35 ? 4 : h > 0.95 ? 3 : h > 0.55 ? 2 : 1;
    p.px(x, y + (hash2(i, 2, seed) < 0.2 ? 1 : 0), LAVA[c]); g.px(x, y, GLOW[Math.max(0, c - 2)]);
  }
}

// Streitkolben: Griff (hx,hy), Achse a (zum Kopf). Flanschkopf aus Obsidian mit Glutkern.
function knightMace(p, g, hx, hy, a, heat, back) {
  const c = Math.cos(a), s = Math.sin(a);
  cap(p, hx - c * 7, hy - s * 7, hx + c * 15, hy + s * 15, 1.1, 1.1, SLAG);
  for (let k = -5; k <= 1; k += 2) p.px(hx + c * k, hy + s * k, RUST[2]);
  ell(p, hx - c * 8, hy - s * 8, 1.4, 1.4, RUST);
  const kx = hx + c * 18, ky = hy + s * 18;
  // vier Flansche (zwei sichtbar seitlich, zwei vorn/hinten)
  const na = a + Math.PI / 2;
  for (const [d, len] of [[1, 5.5], [-1, 5.5]]) {
    const bx = kx + Math.cos(na) * d * 2.5, by = ky + Math.sin(na) * d * 2.5;
    poly(p, [[bx - c * 3.5, by - s * 3.5], [bx + Math.cos(na) * d * len * 0.6 - c * 2, by + Math.sin(na) * d * len * 0.6 - s * 2], [bx + Math.cos(na) * d * len * 0.6 + c * 3, by + Math.sin(na) * d * len * 0.6 + s * 3], [bx + c * 3.5, by + s * 3.5]], OBS[3]);
    p.line(bx - c * 3, by - s * 3, bx + Math.cos(na) * d * len * 0.6, by + Math.sin(na) * d * len * 0.6, d < 0 ? OBS_SHINE : OBS[4]);
  }
  ell(p, kx, ky, 3.6, 3.6, OBS, { bias: 0.08 });
  p.px(kx - 1.5, ky - 2, OBS_SHINE);
  // Glutrisse im Kopf
  const hot = heat > 1.3 ? 4 : heat > 0.9 ? 3 : 2;
  p.px(kx, ky, LAVA[hot]); p.px(kx + c, ky + s, LAVA[hot - 1]); p.px(kx - s, ky + c, LAVA[hot - 1]);
  if (!back) { g.px(kx, ky, GLOW[hot]); g.px(kx + c, ky + s, GLOW[hot - 1]); g.px(kx - s, ky + c, GLOW[2]); if (heat > 1.2) glowDot(g, kx, ky, 1.2); }
  // Spitze oben auf dem Kopf
  poly(p, [[kx + c * 3 - s, ky + s * 3 + c], [kx + c * 7, ky + s * 7], [kx + c * 3 + s, ky + s * 3 - c]], OBS[4]);
  return { head: { x: kx, y: ky }, tip: { x: kx + c * 4, y: ky + s * 4 } };
}

function drawKnight(p, g, P, ex) {
  const { AX, AY } = KN;
  const meta = {};
  const gy = AY;
  const heat = P.heat;
  const hip = { x: AX + P.hipX, y: gy - 15 + P.hipY + P.kneel * 6 };
  const lean = P.lean;
  const ch = { x: hip.x + Math.sin(lean) * 13, y: hip.y - Math.cos(lean) * 13 };
  const px = Math.cos(lean), py = Math.sin(lean);
  const shF = { x: ch.x + px * 6, y: ch.y + py * 6 - 3 }, shB = { x: ch.x - px * 6, y: ch.y - py * 6 - 4 };

  const leg = (hx, hy, fx, fy, ramp, back) => {
    let k = ik(hx, hy, fx, fy, 8, 8, -1);
    if (P.kneel > 0.01 && back) {
      const kx = hx - 2, ky = gy - 2;
      k = { jx: k.jx + (kx - k.jx) * P.kneel, jy: k.jy + (ky - k.jy) * P.kneel, ex: k.ex + (kx - 9 - k.ex) * P.kneel, ey: k.ey };
    }
    cap(p, hx, hy, k.jx, k.jy, 3.8, 3.2, ramp, { noise: 0.06, seed: 3 });
    cap(p, k.jx, k.jy, k.ex, k.ey - 3, 3.2, 3.4, ramp, { noise: 0.06, seed: 4 });
    // Sabaton aus Schlackenplatten
    const bx = Math.round(k.ex - 4), by = Math.round(k.ey - 4);
    ell(p, bx + 5, by + 2, 5.5, 2.6, ramp, { bias: 0.04 });
    p.rect(bx, by + 3, 11, 1, ramp[0]);
    // Kniebuckel mit Dorn
    ell(p, k.jx + 1, k.jy, 3, 2.8, ramp, { bias: 0.1 });
    if (!back) {
      poly(p, [[k.jx + 2, k.jy - 1], [k.jx + 6, k.jy - 1], [k.jx + 2, k.jy + 2]], OBS[3]);
      p.px(k.jx + 3, k.jy - 1, OBS_SHINE);
      seam(p, g, k.jx - 2, k.jy + 3, k.jx + 2, k.jy + 3, heat * 0.9, 5);
      seam(p, g, k.ex - 1, k.ey - 5, k.ex + 3, k.ey - 5, heat * 0.8, 6);
    }
  };

  // Streitkolben liegt beim Ausholen hinter dem Körper
  const behind = ex.maceBehind;
  // Griffpunkte
  const G = { x: ch.x + P.gx, y: ch.y + P.gy };
  const kf = ik(shF.x, shF.y, G.x, G.y, 7, 7.5, 1);
  const ca = Math.cos(P.ma), sa = Math.sin(P.ma);
  const B = { x: kf.ex - ca * 5, y: kf.ey - sa * 5 };
  const kb = ik(shB.x, shB.y, B.x, B.y, 7, 7.5, 1);

  // --- Umhang (zerschlissen, Glutsaum) hinter allem
  const cx0 = shB.x - 1, cy0 = shB.y;
  const clen = 20;
  poly(p, [[cx0 - 1, cy0 - 1], [cx0 + 6, cy0], [hip.x - 2 - P.cape * 4, hip.y + 8], [hip.x - 9 - P.cape * 6, hip.y + 6 + Math.sin(P.cape * 3) ], [cx0 - 5 - P.cape * 3, cy0 + clen * 0.5]],
    (x, y) => CHAR[clamp(2 - Math.floor((y - cy0) / 8) + (hash2(x, y, 33) < 0.15 ? -1 : 0), 0, 3)]);
  for (let i = 0; i < 6; i++) {
    const x = hip.x - 3 - i * 1.3 - P.cape * (4 + i * 0.4), y = hip.y + 7 + ((i * 3) % 2) - i * 0.3;
    if (hash2(i, 2, 35) < 0.6) { p.px(x, y, LAVA[2]); g.px(x, y, GLOW[1]); }
  }

  // --- hinten: Bein, Arm
  leg(hip.x - 3, hip.y, AX + P.fBx, gy - P.fBy, SLAG_D, true);
  let mace;
  if (behind) mace = knightMace(p, g, kf.ex, kf.ey, P.ma, heat, true);
  cap(p, shB.x, shB.y, kb.jx, kb.jy, 2.8, 2.4, SLAG_D);
  cap(p, kb.jx, kb.jy, kb.ex, kb.ey, 2.4, 2.6, SLAG_D);
  ell(p, kb.ex, kb.ey, 2.2, 2.2, SLAG_D.concat(SLAG[4]));

  // --- Rumpf: Schöße, Brustpanzer mit glühenden Fugen
  for (let i = 0; i < 4; i++) {
    const tx = hip.x - 7 + i * 4, ty = hip.y + 1;
    const sw = lean * 2;
    ell(p, tx + 2 + sw * 0.5, ty + 3, 2.4, 3.8 - Math.abs(i - 1.5) * 0.5, i % 2 ? SLAG : SLAG_D.concat(SLAG[4]), { noise: 0.05, seed: 40 + i });
  }
  seam(p, g, hip.x - 7, hip.y + 1, hip.x + 7, hip.y + 1, heat * 0.8, 41);
  ell(p, hip.x, hip.y - 1, 7.5, 3.5, SLAG, { noise: 0.05, seed: 42 });
  ell(p, ch.x, ch.y + 1, 9, 9.5, SLAG, { rot: lean, noise: 0.07, seed: 43, bias: 0.05 });
  // Plattenfugen quer und längs
  seam(p, g, ch.x - 8 + px * 0, ch.y - 3 + py * -8, ch.x + 7, ch.y - 4 + py * 7, heat, 44);
  seam(p, g, ch.x - 7, ch.y + 4 - py * 7, ch.x + 7, ch.y + 4 + py * 7, heat * 0.9, 45);
  seam(p, g, ch.x + 1, ch.y - 3, ch.x + 1 + py * 7, ch.y + 4, heat * 1.1, 46);
  // helle Plattenkanten (erkaltete Schlacke glänzt rostig)
  p.line(ch.x - 7, ch.y - 5 - py * 7, ch.x + 5, ch.y - 6 + py * 5, SLAG[5]);
  p.px(ch.x - 5, ch.y + 2, RUST[3]); p.px(ch.x + 4, ch.y + 6, RUST[2]);
  // Glutkern hinter der Brustfuge
  const cxx = ch.x + 1, cyy = ch.y + 0.5;
  p.px(cxx, cyy, LAVA[heat > 1.2 ? 5 : 4]); g.px(cxx, cyy, GLOW[4]);
  glowDot(g, cxx, cyy, 0.6 + heat * 0.8);
  meta.chest = { x: cxx, y: cyy };

  // --- vorderes Bein
  leg(hip.x + 3, hip.y + 1, AX + P.fFx, gy - P.fFy, SLAG, false);

  // --- Helm: Topfhelm aus Schlacke, T-Visier, nach hinten geschwungene Hörner
  const hx = ch.x + px * 2 + P.head, hy = ch.y - 12 + P.headY;
  ell(p, hx - 1, hy + 6, 5, 2.5, SLAG_D.concat(SLAG[4])); // Halsberge
  ell(p, hx, hy - 1.5, 5, 4, SLAG, { bias: 0.08, noise: 0.04, seed: 47 });
  p.rect(hx - 5, hy - 1, 10, 6, SLAG[3]);
  ell(p, hx, hy + 1, 5, 4.5, SLAG, { bias: 0.02, noise: 0.05, seed: 48 });
  // Horn nach hinten
  for (let i = 0; i < 7; i++) { const x = hx - 3 - i * 0.9, y = hy - 1 - i * 1.3 + i * i * 0.05; p.rect(x, y, i < 4 ? 2 : 1, 1, i < 2 ? OBS[3] : OBS[4]); if (i > 2) p.px(x + 1, y + 1, OBS[2]); }
  p.px(hx - 9, hy - 9, OBS_SHINE);
  // Visier
  const vs = P.visor, ec = ex.hurt ? '#ffffff' : LAVA[5];
  p.rect(hx, hy, 5, 1, VOID); p.rect(hx + 2, hy, 1, 4, VOID);
  if (vs > 0.2) {
    p.rect(hx + 1, hy, 4, 1, vs > 0.8 ? ec : LAVA[3]); p.px(hx + 2, hy + 1, LAVA[3]); p.px(hx + 2, hy + 2, LAVA[2]);
    g.rect(hx + 1, hy, 4, 1, GLOW[vs > 0.8 ? 4 : 2]); g.px(hx + 2, hy + 1, GLOW[2]); g.px(hx + 2, hy + 2, GLOW[1]);
    if (vs > 1.2) { g.rect(hx, hy - 1, 6, 3, GLOW[1]); g.rect(hx + 1, hy, 4, 1, GLOW[4]); }
  }
  seam(p, g, hx - 4, hy + 3, hx - 1, hy + 4, heat * 0.7, 49);
  p.px(hx - 3, hy - 4, SLAG[5]); p.px(hx - 2, hy - 5, SLAG[5]);
  meta.eye = { x: hx + 3, y: hy };
  meta.head = { x: hx, y: hy - 7 };

  // --- Streitkolben vorn + vorderer Arm
  if (ex.smear) arcSmear(p, g, shF.x, shF.y, ex.smear[0], ex.smear[1], 16, 30, SMEAR, 51, false);
  if (!behind) mace = knightMace(p, g, kf.ex, kf.ey, P.ma, heat, false);
  occlude(g);
  cap(p, shF.x, shF.y, kf.jx, kf.jy, 3, 2.6, SLAG, { noise: 0.05, seed: 52 });
  cap(p, kf.jx, kf.jy, kf.ex, kf.ey, 2.6, 2.9, SLAG, { noise: 0.05, seed: 53 });
  ell(p, kf.ex, kf.ey, 2.5, 2.5, SLAG, { bias: 0.1 });
  occlude(null);
  seam(p, g, kf.jx - 1, kf.jy + 1, kf.jx + 2, kf.jy - 1, heat * 0.9, 54);
  // Schulterplatte: großer Schlackenbuckel mit Obsidiandornen
  occlude(g);
  ell(p, shF.x, shF.y - 1, 6, 4.8, SLAG, { bias: 0.1, noise: 0.06, seed: 55 });
  occlude(null);
  seam(p, g, shF.x - 5, shF.y + 1, shF.x + 5, shF.y + 2, heat, 56);
  for (const [dx, h] of [[-3, 5], [0, 6], [3, 4]]) poly(p, [[shF.x + dx - 1.2, shF.y - 3], [shF.x + dx - 1 - h * 0.3, shF.y - 3 - h], [shF.x + dx + 1.2, shF.y - 3]], OBS[3]);
  p.line(shF.x - 1, shF.y - 3, shF.x - 2.8, shF.y - 8.5, OBS_SHINE);

  meta.hand = { x: kf.ex, y: kf.ey };
  meta.tip = mace.tip;
  if (ex.impact) {
    dustRing(p, g, mace.head.x, gy - 1, ex.impact, 57, [SLAG[3], SLAG[4], CHAR[3]]);
    for (let i = 0; i < 12; i++) {
      const a = -Math.PI * (0.1 + hash2(i, 1, 58) * 0.8), d = (ex.impact + 3) * (0.4 + hash2(i, 2, 58) * 0.8);
      const x = mace.head.x + Math.cos(a) * d, y = gy - 2 + Math.sin(a) * d * 0.7;
      p.px(x, y, LAVA[4]); g.px(x, y, GLOW[3]);
    }
  }
  return meta;
}

// Zusammengebrochene Rüstung: Platten, Helm, Kolben, erkaltende Fugen
function drawKnightFallen(p, g, k) {
  const { AX, AY } = KN;
  const gy = AY;
  const heat = 1 - k;
  // Umhang am Boden
  poly(p, [[AX - 22, gy], [AX - 16, gy - 4], [AX + 4, gy - 5], [AX + 8, gy]], CHAR[1]);
  // Beine liegen
  cap(p, AX - 18, gy - 3, AX - 8, gy - 4, 3, 3.2, SLAG_D);
  cap(p, AX - 16, gy - 2, AX - 6, gy - 2, 3, 3.2, SLAG);
  // Rumpf auf dem Bauch
  ell(p, AX, gy - 5, 10, 5.5, SLAG, { noise: 0.07, seed: 43 });
  seam(p, g, AX - 8, gy - 6, AX + 8, gy - 7, heat, 44);
  seam(p, g, AX - 2, gy - 9, AX + 1, gy - 2, heat * 0.8, 45);
  ell(p, AX + 5, gy - 8, 5.5, 4, SLAG, { bias: 0.08, noise: 0.06, seed: 55 });
  // Helm abgerollt
  const hx = AX + 15 + k * 3;
  ell(p, hx, gy - 4, 4.6, 4, SLAG, { noise: 0.05, seed: 48 });
  p.rect(hx + 1, gy - 5, 3, 1, heat > 0.3 ? LAVA[3] : VOID); if (heat > 0.3) g.rect(hx + 1, gy - 5, 3, 1, GLOW[2]);
  for (let i = 0; i < 4; i++) p.px(hx - 3 - i, gy - 7 - i * 0.7, OBS[4]);
  // Kolben daneben
  knightMace(p, g, AX - 10, gy - 11, 0.12, heat * 0.9, false);
  if (heat > 0.3) for (let i = 0; i < 3; i++) g.px(AX - 1 + i, gy - 13 - i * 2 - k * 3, GLOW[0]);
  return { eye: { x: hx + 2, y: gy - 5 }, head: { x: hx, y: gy - 9 }, chest: { x: AX, y: gy - 6 }, hand: { x: AX - 10, y: gy - 11 }, tip: { x: AX + 12, y: gy - 9 } };
}

// Zusätzliches Randlicht des Schlackenritters auf der Leuchtebene: die Rüstung ist
// fast schwarz, die Lichtkarte der Öde schluckt das Randlicht der Farbebene.
// Heller Ascheschein oben, Glutsaum an den Seiten – unabhängig von der Beleuchtung.
const KNIGHT_RIM = { top: '#e8c8a8', side: '#a06040', glowTop: '#a08a7a', glowSide: '#7a3418', k: 0.12 };

function createKnight() {
  const S = { ...KN, draw: drawKnight };
  const idle = cycle((ph) => {
    const s = Math.sin(ph);
    return knp({ hipY: Math.max(0, s) * 0.8, lean: 0.06 + s * 0.015, gy: 10 + Math.max(0, s), headY: Math.max(0, s) * 0.8, heat: 0.95 + s * 0.15, cape: s * 0.2 });
  }, 4);
  const walk = cycle((ph) => {
    const s = Math.sin(ph), c = Math.cos(ph);
    return knp({
      hipX: 1, hipY: 1 - Math.abs(c) * 1.6, lean: 0.14 + s * 0.02, head: s * 0.4, headY: Math.abs(c) * 0.8,
      fFx: 2 + s * 7, fFy: Math.max(0, -c) * 3.5, fBx: -3 - s * 7, fBy: Math.max(0, c) * 3.5,
      gx: 9 - s * 1.5, gy: 10 + Math.abs(c), ma: -1.2 - s * 0.08, cape: 0.5 + c * 0.3,
    });
  }, 8);
  // Ausholen: Kolben über die Schulter weit nach hinten
  const w1 = knp({ lean: -0.04, hipX: -1, gx: 2, gy: -8, ma: -2.2, fFx: 8, fBx: -8, heat: 1.2, cape: 0.3 });
  const w2 = knp({ lean: -0.2, hipX: -2, hipY: -1, gx: -2, gy: -12, ma: -2.9, fFx: 9, fBx: -9, fBy: 1, heat: 1.45, visor: 1.3, cape: 0.6 });
  // Schlag: senkrecht in den Boden vor sich
  const s1 = knp({ lean: 0.2, hipX: 2, hipY: 1, gx: 10, gy: -10, ma: -1.1, fFx: 11, fBx: -9, heat: 1.5, visor: 1.3, cape: 0.2 });
  const s2 = knp({ lean: 0.5, hipX: 4, hipY: 5, gx: 13, gy: 8, ma: 0.55, fFx: 12, fBx: -10, heat: 1.6, visor: 1.4, cape: -0.3 });
  const s3 = knp({ lean: 0.47, hipX: 4, hipY: 5, gx: 13, gy: 9, ma: 0.6, fFx: 12, fBx: -10, heat: 1.3, cape: -0.2 });
  const s4 = knp({ lean: 0.18, hipX: 2, hipY: 2, gx: 10, gy: 9, ma: -0.6, fFx: 9, fBx: -8, heat: 1.05, cape: 0 });
  const hurtP = knp({ lean: -0.16, hipX: -3, head: -1.5, headY: -1, gx: 6, gy: 6, ma: -1.6, visor: 1.6, heat: 1.5, cape: 0.6 });
  const d1 = knp({ lean: -0.26, hipX: -3, head: -1.5, headY: -1, gx: 5, gy: 6, ma: -1.8, visor: 1.3, heat: 1.4, cape: 0.8 });
  const d2 = knp({ lean: 0.4, kneel: 1, hipY: 3, head: 1, headY: 2, gx: 12, gy: 12, ma: 0.4, visor: 0.8, heat: 0.9 });
  const d3 = knp({ lean: 0.85, kneel: 1, hipY: 7, head: 2, headY: 4, gx: 14, gy: 12, ma: 0.1, visor: 0.3, heat: 0.6 });
  return rimGlow({
    idle: new Animation(track(S, idle, 4, { loop: true }), 5),
    walk: new Animation(track(S, walk, 8, { loop: true, extras: { 0: { fx: 'step' }, 4: { fx: 'step' } } }), 9),
    windup: new Animation(track(S, [[0, idle[0][1]], [0.45, w1], [1, w2]], 4, { extras: { 2: { maceBehind: true }, 3: { maceBehind: true } } }), 7, false),
    strike: new Animation(track(S, [[0, s1], [0.25, s2, snap], [0.6, s3], [1, s4]], 5, {
      extras: { 0: { smear: [-2.4, -0.9] }, 1: { fx: 'impact', smear: [-1.6, 0.75], impact: 8 }, 2: { impact: 12 } },
    }), 12, false),
    hurt: new Animation(track(S, [[0, hurtP], [1, knp({ lean: 0 })]], 2, { extras: { 0: { hurt: true } } }), 8, false),
    death: new Animation([
      ...track(S, [[0, hurtP], [0.3, d1], [0.65, d2, snap], [1, d3]], 4, { extras: { 0: { hurt: true }, 2: { fx: 'impact' } } }),
      still(S, (p, g) => drawKnightFallen(p, g, 0), 'impact'),
      still(S, (p, g) => drawKnightFallen(p, g, 0.5)),
      still(S, (p, g) => drawKnightFallen(p, g, 1)),
    ], 7, false),
  }, KNIGHT_RIM);
}


// ================================================================ Magmaschlange

const MS = { W: 92, H: 60, AX: 40, AY: 54, rim: RIM_WARM };
const MS_REST = {
  bx: 0, rise: 0.7, coil: 0, nx: 0, ny: 0, head: 0.25, jaw: 0.05, throat: 0.5, wave: 0, amp: 1.5, hood: 0.3, heat: 1, tail: 0,
};
const msp = (o) => ({ ...MS_REST, ...o });

const qbez = (a, c, b, t) => ({ x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x, y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y });

// Wirbelsäule der Schlange als Punktliste mit Radius
function serpentSpine(P, gy, AX) {
  const pts = [];
  const N = 30;
  const cx = AX - 9 + P.bx * 0.5, cy = gy - 7;
  // v: 0 = Halsansatz … 1 = Schwanzspitze. Der Leib liegt in gut einer
  // Windung am Boden (Spirale, zweite Lage etwas höher und enger), die
  // Schwanzspitze läuft nach hinten links aus. d = Tiefe (+1 vorn).
  for (let i = N; i >= 0; i--) {
    const v = i / N;
    const th = v * Math.PI * 2.25 + P.coil;
    const rip = Math.sin(P.wave + v * 9) * P.amp * 0.5;
    let rx = 17 - v * 5 + rip, ry = 6 - v * 1.5;
    let x = cx + Math.cos(th) * rx, y = cy + Math.sin(th) * ry - v * 5;
    // Schwanzspitze: löst sich aus der Windung nach links
    if (v > 0.78) { const k = (v - 0.78) / 0.22; x -= k * k * 10; y += k * 3; }
    pts.push({ x, y, r: 0.8 + 5.6 * (1 - v) ** 0.55 * (v > 0.75 ? 1 - (v - 0.75) * 2.8 : 1), v, d: Math.sin(th) + v * 1.3 });
  }
  const base = pts[pts.length - 1];
  const C = { x: base.x + 6, y: gy - 13 - P.rise * 8 };
  const H = { x: base.x + 5 + P.nx, y: gy - 30 - P.rise * 12 + P.ny };
  const M = 11;
  for (let i = 1; i <= M; i++) {
    const t = i / M, q = qbez(base, C, H, t);
    pts.push({ x: q.x, y: q.y, r: 6 - t * 1.9, neck: t });
  }
  return pts;
}

// Ein Leibsegment: Kruste, glühende Bauchnaht, Magmaringe zwischen den Schuppenringen
function serpentSeg(p, g, a, b, i, crust, heat, thr) {
  cap(p, a.x, a.y, b.x, b.y, a.r, b.r, crust, { noise: 0.09, seed: 60 + (i % 5) });
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
  let nx = -dy / d, ny = dx / d; if (ny < 0) { nx = -nx; ny = -ny; }
  const hh = heat * (b.neck != null ? 0.8 + thr * 0.45 : 0.85);
  const c = hh > 1.2 ? 4 : hh > 0.8 ? 3 : hh > 0.4 ? 2 : 1;
  for (let t = 0; t < 1; t += 0.5) {
    const r = a.r + (b.r - a.r) * t;
    if (r < 1.5) continue;
    const x = a.x + dx * t + nx * (r - 1), y = a.y + dy * t + ny * (r - 1);
    p.px(x, y, BELLY[c]); p.px(x - nx, y - ny, BELLY[c - 1]);
    if (heat > 0.25) { g.px(x, y, GLOW[Math.min(4, c - 1)]); if (c > 2) g.px(x - nx, y - ny, GLOW[c - 3]); }
  }
  // Krustenrisse (unregelmäßig, Schuppenfugen)
  if (a.r > 2.4 && hash2(i, 5, 62) < 0.7) {
    const cc = heat > 1.15 ? 3 : heat > 0.5 ? 2 : 0;
    const k0 = (hash2(i, 6, 62) - 0.7) * a.r;
    const x = a.x + nx * k0, y = a.y + ny * k0;
    const L = 2 + Math.floor(hash2(i, 7, 62) * 2);
    for (let s = 0; s < L; s++) {
      const qx = x + dx / d * s * 0.8 + nx * (s % 2) * 0.6, qy = y + dy / d * s * 0.8 + ny * (s % 2) * 0.6;
      p.px(qx, qy, cc ? LAVA[cc - (s === 0 ? 1 : 0)] : CRUST[0]);
      if (cc) g.px(qx, qy, GLOW[Math.max(0, cc - 2)]);
    }
  }
}

function drawSerpent(p, g, P, ex) {
  const { AX, AY } = MS;
  const meta = {};
  const gy = AY;
  const heat = P.heat, thr = P.throat;
  const pts = serpentSpine(P, gy, AX);
  const cool = clamp(1 - heat, 0, 1); // 1 = erkaltet (Tod)
  const crust = cool > 0.5 ? CRUST_D : CRUST;
  // Reihenfolge: Windungen nach Tiefe (hinten zuerst), Hals zuletzt
  const order = [];
  for (let i = 0; i < pts.length - 1; i++) order.push(i);
  const key = (i) => (pts[i + 1].neck != null ? 99 : (pts[i].d + pts[i + 1].d) / 2);
  order.sort((x, y) => key(x) - key(y));
  for (const i of order) serpentSeg(p, g, pts[i], pts[i + 1], i, crust, heat, thr);
  // Rückenplatten aus Obsidian entlang des Rückens
  for (let i = 0; i < pts.length - 2; i += 3) {
    const a = pts[i], b = pts[i + 1];
    if (a.neck == null) continue;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    let nx = -dy / d, ny = dx / d; if (ny > 0) { nx = -nx; ny = -ny; }
    const h = 1.5 + a.r * 0.3;
    const bx = a.x + nx * (a.r - 1), by = a.y + ny * (a.r - 1);
    poly(p, [[bx - dx / d * 1.5, by - dy / d * 1.5], [bx + nx * h - dx / d * 1.5, by + ny * h - dy / d * 1.5], [bx + dx / d * 1.5, by + dy / d * 1.5]], OBS[3]);
    p.px(bx + nx * (h - 1) - dx / d, by + ny * (h - 1) - dy / d, OBS_SHINE);
  }
  // Tropfendes Magma unter dem Bauch
  for (let i = 0; i < 3 && heat > 0.5; i++) {
    const a = pts[7 + i * 3];
    if (a.y + a.r < gy - 3) continue;
    p.px(a.x, a.y + a.r, LAVA[3]); g.px(a.x, a.y + a.r, GLOW[2]); p.px(a.x + 1, a.y + a.r, LAVA[2]);
  }
  const neckMid = pts[pts.length - 6];
  meta.throat = { x: neckMid.x + 3, y: neckMid.y + 3 };
  if (thr > 0.9) glowDot(g, neckMid.x + 2, neckMid.y + 3, thr * 1.4);

  // --- Kopf
  const H = pts[pts.length - 1];
  const ha = P.head;
  const hc = Math.cos(ha), hs = Math.sin(ha);
  const T = (u, v) => [H.x + (u * hc - v * hs) * 1.25, H.y + (u * hs + v * hc) * 1.25];
  // Kragen (Kobra-Haube): breite Krustenplatte hinter dem Kopf, gespreizt
  // durch hood; innen glühende Zeichnung
  const hood = P.hood;
  const nk = pts[pts.length - 4];
  const hw = 2 + hood * 3, hh = 5.5 + hood * 2.8;
  const hcx = (nk.x + H.x) / 2 - 1.5, hcy = (nk.y + H.y) / 2 + 0.5;
  const hr = Math.atan2(H.y - nk.y, H.x - nk.x) + Math.PI / 2;
  ell(p, hcx - 1, hcy, hw + 1, hh, crust, { rot: hr, noise: 0.07, seed: 72, bias: 0.1 });
  if (hood > 0.2) {
    // Innenhaut der Haube: dunkelrote Membran mit Glutadern
    const iw = hw - 0.6, ih = hh - 1.6;
    ell(p, hcx, hcy + 0.5, iw, ih, heat > 0.3 ? [BELLY[0], BELLY[0], BELLY[1]] : CRUST_D, { rot: hr, bias: -0.1 });
    if (heat > 0.3) {
      const hotc = thr > 1 ? 4 : 3;
      for (const sgn of [-1, 1]) {
        const qx = hcx + 0.5, qy = hcy + sgn * ih * 0.45;
        p.px(qx, qy, LAVA[hotc]); p.px(qx - 1, qy, LAVA[hotc - 1]); g.px(qx, qy, GLOW[hotc]); g.px(qx - 1, qy, GLOW[2]);
      }
      for (let j = -ih + 1; j <= ih - 1; j += 1) if (hash2(1, Math.round(j), 73) < 0.6) { p.px(hcx - 0.5, hcy + j, LAVA[1]); g.px(hcx - 0.5, hcy + j, GLOW[0]); }
      g.ellipse(hcx, hcy, iw, ih, GLOW[0]);
    }
  }
  p.line(hcx - hw - 1, hcy - hh + 2, hcx - hw, hcy + hh - 2, OBS[3]);
  ell(p, H.x, H.y, 5.2, 4.6, crust, { noise: 0.07, seed: 70, bias: 0.05 });
  // Oberkiefer: breiter Keil
  poly(p, [T(-1, -3.4), T(5, -2.6), T(9.5, -0.8), T(9.5, 0.8), T(0, 1.2)], (x, y) => (y < T(4, -1.5)[1] ? crust[4] : crust[3]));
  p.line(...T(0, -3.2), ...T(6, -2.4), crust[5]);
  const nos = T(8.5, -0.8); p.px(nos[0], nos[1], VOID);
  // Maul
  const ja = P.jaw * 0.75;
  const jc = Math.cos(ha + ja), js = Math.sin(ha + ja);
  const J = (u, v) => [H.x + (u * jc - v * js) * 1.25, H.y + 1.7 + (u * js + v * jc) * 1.25];
  if (P.jaw > 0.1) {
    poly(p, [T(1, 1.2), T(9, 0.8), J(8.5, 0), J(1, 0)], LAVA[3]);
    poly(p, [T(2, 1.2), T(7, 1), J(6, -0.3)], LAVA[5]);
    for (let u = 1; u < 9; u++) { const q = J(u, -0.4); g.px(q[0], q[1], GLOW[3]); const q2 = T(u, 1.3); g.px(q2[0], q2[1], GLOW[u < 6 ? 4 : 2]); }
  }
  poly(p, [J(0, 0), J(8.5, 0), J(8, 1.8), J(0, 2.2)], crust[2]);
  const jl = J(1, 2); const jr = J(7, 1.6); p.line(jl[0], jl[1], jr[0], jr[1], BELLY[heat > 0.5 ? 2 : 0]);
  if (heat > 0.5) g.line(jl[0], jl[1], jr[0], jr[1], GLOW[1]);
  // Giftzähne
  for (const u of [7.5]) { const a = T(u, 1.2), b = J(u, 0); p.px(a[0], a[1] + 1, PAL.bone[3]); p.px(b[0], b[1] - 1, PAL.bone[2]); }
  // Magmatropfen vom Kinn
  if (heat > 0.6) { const d = J(3, 2.4); const L = 1 + Math.floor(((P.wave * 0.8) % 1) * 3); for (let k = 0; k < L; k++) { p.px(d[0], d[1] + k, LAVA[4 - (k > 1 ? 1 : 0)]); g.px(d[0], d[1] + k, GLOW[2]); } }
  const m = T(10, 1 + P.jaw * 2.5);
  meta.mouth = { x: m[0], y: m[1] };
  // Auge mit Brauenwulst
  const e = T(3, -1.8);
  const ec = ex.hurt ? '#ffffff' : heat < 0.3 ? CRUST[1] : LAVA[5];
  p.rect(e[0] - 1, e[1] - 1, 4, 3, VOID);                                   // Augenhöhle
  p.px(e[0], e[1], ec); p.px(e[0] + 1, e[1], heat < 0.3 ? CRUST[1] : LAVA[4]); p.px(e[0] - 1, e[1], heat < 0.3 ? CRUST[1] : LAVA[2]);
  if (heat >= 0.3) { g.px(e[0], e[1], GLOW[4]); g.px(e[0] + 1, e[1], GLOW[3]); g.px(e[0] - 1, e[1], GLOW[1]); g.px(e[0], e[1] + 1, GLOW[1]); }
  const br = T(1.5, -3.4); p.line(br[0], br[1], br[0] + 4 * hc, br[1] + 4 * hs, OBS[4]);
  p.line(br[0], br[1] - 1, br[0] + 3 * hc, br[1] + 3 * hs - 1, OBS[5] ?? OBS_SHINE);
  // Schuppenplatten auf dem Schädel (helle Kanten oben)
  for (const u of [-1.5, 1, 3.5]) { const q = T(u, -4); p.px(q[0], q[1], crust[5]); p.px(q[0] + 1, q[1], crust[4]); }
  meta.eye = { x: e[0], y: e[1] };
  meta.head = { x: H.x, y: H.y - 7 };

  if (ex.smear) arcSmear(p, g, H.x - 6, H.y + 2, ex.smear[0], ex.smear[1], 8, 15, SMEAR, 71, false);
  if (ex.breath) {
    const k = ex.breath;
    for (let i = 0; i < 4; i++) {
      const r = 0.9 + i * 0.55;
      const x = m[0] + Math.cos(ha + 0.25) * (1 + i * 2.4), y = m[1] + Math.sin(ha + 0.25) * (1 + i * 2.4) + Math.sin(k * 2 + i * 1.7) * 0.8;
      ell(p, x, y, r, r * 0.8, [LAVA[2], LAVA[3], LAVA[4], LAVA[5]], { bias: 0.15 });
      glowDot(g, x, y, r);
    }
  }
  return meta;
}

// Erkaltete Schlange: flach am Boden, Kruste grau, Glut erlischt
function drawSerpentDead(p, g, k) {
  const P = msp({ rise: -0.6, nx: 6, ny: 13, head: 0.05, jaw: 0.5, throat: 0.3 * (1 - k), heat: 0.9 - k * 0.85, amp: 2, wave: 1.3, hood: 0 });
  return drawSerpent(p, g, P, {});
}

function createSerpent() {
  const S = { ...MS, draw: drawSerpent };
  const idle = cycle((ph) => {
    const s = Math.sin(ph), c = Math.cos(ph);
    return msp({ rise: 0.5 + s * 0.06, nx: c * 1.2, ny: -s * 0.8, head: 0.25 + s * 0.05, wave: ph * 0.5, tail: ph, amp: 1.5, throat: 0.5 + Math.max(0, s) * 0.4, jaw: Math.max(0, -s) * 0.25, hood: 0.3 + Math.max(0, s) * 0.15 });
  }, 6);
  const walk = cycle((ph) => {
    const s = Math.sin(ph);
    return msp({ rise: 0.3, nx: 2 + s * 1.5, ny: 2 + Math.cos(ph * 2) * 0.6, head: 0.2, wave: ph * 2, amp: 2.6, throat: 0.6, hood: 0.15, bx: s * 1 });
  }, 8);
  // Ausholen: aufrichten, Kragen spreizen, Kehle glüht
  const w1 = msp({ rise: 0.9, nx: -3, ny: -2, head: 0.05, jaw: 0.35, throat: 1.1, hood: 0.8, amp: 1.2, wave: 0.6, bx: -1 });
  const w2 = msp({ rise: 1.2, nx: -6, ny: -3, head: -0.15, jaw: 0.6, throat: 1.5, hood: 1.2, amp: 1, wave: 1, bx: -2 });
  // Biss: nach vorn schnellen
  const s1 = msp({ rise: 0.5, nx: 10, ny: 3, head: 0.35, jaw: 1.1, throat: 1.2, hood: 0.9, wave: 1.3, bx: 3 });
  const s2 = msp({ rise: 0.2, nx: 15, ny: 8, head: 0.5, jaw: 0.1, throat: 1, hood: 0.6, wave: 1.5, bx: 5 });
  const s3 = msp({ rise: 0.35, nx: 8, ny: 4, head: 0.3, jaw: 0.25, throat: 0.8, hood: 0.4, wave: 1.8, bx: 2 });
  // Feueratem (Loop): Kopf vor, Maul weit offen
  const breath = cycle((ph) => {
    const s = Math.sin(ph);
    return msp({ rise: 0.55, nx: 7, ny: 3 + s * 0.4, head: 0.3 + s * 0.03, jaw: 1 + s * 0.1, throat: 1.6 + s * 0.2, hood: 1 + s * 0.1, wave: ph * 0.5, amp: 1.2, bx: 2 });
  }, 4);
  const hurtP = msp({ rise: 0.9, nx: -6, ny: -1, head: -0.35, jaw: 0.9, throat: 1.3, hood: 1, wave: 0.4, bx: -3 });
  const d1 = msp({ rise: 1.1, nx: -7, ny: -3, head: -0.5, jaw: 1, throat: 1.2, hood: 1.1, wave: 0.8, bx: -3 });
  const d2 = msp({ rise: -0.2, nx: 4, ny: 9, head: 0.2, jaw: 0.7, throat: 0.6, hood: 0.3, wave: 1.2, amp: 2, heat: 0.95 });
  return {
    idle: new Animation(track(S, idle, 6, { loop: true }), 6),
    walk: new Animation(track(S, walk, 8, { loop: true }), 11),
    windup: new Animation(track(S, [[0, idle[0][1]], [0.5, w1], [1, w2]], 4), 7, false),
    strike: new Animation(track(S, [[0, s1], [0.3, s2, snap], [1, s3]], 4, {
      extras: { 0: { smear: [-1.4, 0.2] }, 1: { fx: 'impact', smear: [-0.8, 0.9] } },
    }), 13, false),
    breath: new Animation(track(S, breath, 4, { loop: true, extras: { 0: { breath: 1 }, 1: { breath: 2 }, 2: { breath: 3 }, 3: { breath: 4 } } }), 10),
    hurt: new Animation(track(S, [[0, hurtP], [1, msp({ rise: 0.6, nx: -2, jaw: 0.3 })]], 2, { extras: { 0: { hurt: true } } }), 10, false),
    death: new Animation([
      ...track(S, [[0, hurtP], [0.4, d1], [1, d2]], 3, { extras: { 0: { hurt: true } } }),
      still(S, (p, g) => drawSerpentDead(p, g, 0), 'impact'),
      still(S, (p, g) => drawSerpentDead(p, g, 0.5)),
      still(S, (p, g) => drawSerpentDead(p, g, 1)),
    ], 8, false),
  };
}


// ================================================================ Glutadept

const AD = { W: 52, H: 50, AX: 24, AY: 45, rim: RIM_WARM };
const AD_REST = {
  bob: 0, lean: 0, hem: 0, stepA: 0, stepB: 0, head: 0, headY: 0,
  hFx: 7, hFy: 7, hBx: -5, hBy: 8, ball: 1.2, orb: 0, halo: 1, eye: 1, glyph: 0, sleeve: 0,
};
const adp = (o) => ({ ...AD_REST, ...o });

function drawAdept(p, g, P, ex) {
  const { AX, AY } = AD;
  const meta = {};
  const gy = AY;
  const top = gy - 20 + P.bob;
  const x = AX + P.lean * 2;
  const sh = { x: x + 1 + P.lean * 3, y: top + 1 };
  const hx = sh.x + 1 + P.head, hy = top - 5 + P.headY;

  // Bodenglyphe (Glutfeld-Beschwörung)
  if (P.glyph > 0.05) {
    const r = 6 + P.glyph * 9;
    for (let a = 0; a < Math.PI * 2; a += 0.09) {
      const qx = AX + 6 + Math.cos(a) * r, qy = gy + Math.sin(a) * r * 0.45;
      if (hash2(Math.round(a * 30), 1, 81) < 0.25) continue;
      p.px(qx, qy, LAVA[P.glyph > 0.7 ? 4 : 3]); g.px(qx, qy, GLOW[P.glyph > 0.7 ? 3 : 2]);
    }
    for (let k = 0; k < 5; k++) {
      const a = k * 1.2566 + P.glyph, qx = AX + 6 + Math.cos(a) * r * 0.6, qy = gy + Math.sin(a) * r * 0.27;
      p.px(qx, qy, LAVA[4]); g.px(qx, qy, GLOW[3]);
    }
  }

  // Schwebendes Glutbuch hinter der Schulter (aufgeschlagen, Seiten glühen,
  // Funken steigen auf). Hebt sich beim Wirken (halo) und wippt mit orb.
  const book = () => {
    const bx0 = Math.round(sh.x - 17 - P.lean * 2), by0 = Math.round(top - 7 + Math.sin(P.orb) * 1.5 - (P.halo - 1) * 4);
    const hot = P.halo > 1.3;
    // Glutschein unter dem Buch
    for (let i = 0; i < 3; i++) g.px(bx0 + 3 + i, by0 + 5 + (i === 1 ? 1 : 0), GLOW[1]);
    // Einband (Leder, Goldecken), Unterseite
    p.rect(bx0, by0 + 2, 9, 2, ROBE[3]); p.rect(bx0, by0 + 3, 9, 1, ROBE[1]);
    p.px(bx0, by0 + 2, GOLD[3]); p.px(bx0 + 8, by0 + 2, GOLD[3]); p.px(bx0 + 4, by0 + 3, GOLD[4]);
    // Seiten als flaches V (Mittelfalz tiefer)
    for (let i = 1; i <= 7; i++) {
      const d = Math.abs(i - 4), yt = by0 + (d === 0 ? 2 : d === 1 ? 1 : 0);
      for (let yy = yt; yy <= by0 + 1 + (d === 0 ? 1 : 0); yy++) p.px(bx0 + i, yy, d === 0 ? '#8a6a40' : i < 4 ? '#e8d4a8' : '#f4e6c0');
    }
    // Glutrunen auf den Seiten
    for (const [i, yy] of [[2, 1], [6, 0], [3, 0]]) { p.px(bx0 + i, by0 + yy, LAVA[hot ? 5 : 4]); g.px(bx0 + i, by0 + yy, GLOW[hot ? 4 : 3]); }
    // Lesebändchen
    p.px(bx0 + 6, by0 + 4, LAVA[2]); p.px(bx0 + 6, by0 + 5, LAVA[1]);
    // Flämmchen und Funken aus dem Falz
    flame(p, g, bx0 + 4, by0 + 1, 2 + Math.round(P.halo * 1.5), 0.8 + (P.halo - 1) * 0.6, P.orb * 2, { lean: -0.2, seed: 91, hot: 0.6 });
    for (let i = 0; i < 3; i++) {
      const f = ((P.orb / (Math.PI * 2)) * 2 + i / 3) % 1;
      const qx = bx0 + 3 + i * 1.5 + Math.sin(P.orb * 2 + i) * 1.2, qy = by0 - 2 - f * 7;
      if (f < 0.85) { p.px(qx, qy, LAVA[f < 0.4 ? 5 : 3]); g.px(qx, qy, GLOW[f < 0.4 ? 4 : 2]); }
    }
    if (hot) glowDot(g, bx0 + 4, by0, 2);
  };
  book();

  // Füße
  p.rect(AX - 3 + P.stepB, gy - 2, 4, 2, ROBE_CH[1]);
  // hinterer Arm (weiter Ärmel)
  const hB = { x: sh.x + P.hBx, y: sh.y + P.hBy };
  cap(p, sh.x - 3, sh.y + 1, hB.x, hB.y, 2, 2.8 + P.sleeve * 0.5, ROBE.slice(0, 4));
  p.rect(hB.x - 1, hB.y + 2, 2, 2, SKIN[1]);
  flame(p, g, hB.x, hB.y + 1, 3 + Math.round(P.halo), 1, P.orb * 2, { lean: -0.2, seed: 83, hot: 0.7 });

  // Robe: dunkles Rot, Saum verkohlt, Goldborte
  robe(p, g, x, top, gy - 1, 4.5, 8, P.lean, P.hem, ROBE, ROBE_CH, 85, 0.8);
  p.rect(AX + 1 + P.stepA, gy - 2, 4, 2, ROBE_CH[2]);
  // Goldborte vorn + Runen
  for (let j = 0; j < 18; j++) {
    const yy = top + 2 + j, xx = x + 3 + P.lean * (1.5 - j * 0.12) + j * 0.12;
    if (yy > gy - 3) break;
    p.px(xx, yy, j % 4 === 0 ? GOLD[4] : GOLD[2]);
    if (j === 6 || j === 11 || j === 15) { p.px(xx - 2, yy, LAVA[3]); p.px(xx - 2, yy + 1, LAVA[2]); g.px(xx - 2, yy, GLOW[2]); }
  }
  // Gürtel mit Goldschnalle
  const by = top + 8;
  for (let k = -5; k <= 5; k++) p.px(x + k + P.lean * 1.5, by, k < -2 ? GOLD[1] : GOLD[2]);
  p.rect(x + 1 + P.lean * 1.5, by - 1, 2, 3, GOLD[4]); p.px(x + 1 + P.lean * 1.5, by, LAVA[4]); g.px(x + 1 + P.lean * 1.5, by, GLOW[3]);

  // Mantel mit Obsidian-Schulterdornen
  poly(p, [[sh.x - 6, sh.y - 1], [sh.x + 4, sh.y - 1], [sh.x + 5, sh.y + 4], [sh.x - 7, sh.y + 6]], (px2, py2) => ROBE[py2 < sh.y + 1 ? 4 : 3]);
  for (const [dx, h] of [[-5, 4], [-2, 5], [2, 3]]) {
    poly(p, [[sh.x + dx - 1, sh.y], [sh.x + dx - 1.5, sh.y - h], [sh.x + dx + 1, sh.y]], OBS[3]);
    p.px(sh.x + dx - 1, sh.y - h + 1, OBS_SHINE);
  }

  // Kapuze: weit und rund, darauf eine Zackenkrone aus Gold (Rang des Adepten)
  poly(p, [[hx - 5, hy + 4], [hx - 6.5, hy], [hx - 5.5, hy - 4], [hx - 2, hy - 6], [hx + 2, hy - 5], [hx + 4, hy - 1], [hx + 4, hy + 2], [hx + 3, hy + 5]],
    (px2, py2) => ROBE[clamp(4 - Math.floor((px2 - (hx - 6)) / 4) - (py2 > hy + 2 ? 1 : 0), 1, 5)]);
  p.line(hx - 5.5, hy - 3, hx - 2, hy - 5.5, ROBE[5]);
  // Kronreif
  const cy0 = hy - 5;
  for (let k = -5; k <= 3; k++) { p.px(hx + k, cy0 + Math.abs(k + 1) * 0.12, k < -2 ? GOLD[2] : GOLD[3]); p.px(hx + k, cy0 + 1 + Math.abs(k + 1) * 0.12, GOLD[1]); }
  // Zacken (hinten dunkler, vorn höher), Spitzen glühen
  for (const [dx, h, c] of [[-4.5, 3, 2], [-1.5, 5, 4], [1.5, 4, 3]]) {
    for (let j = 1; j <= h; j++) {
      const w = j < h - 1 ? 1 : 0;
      p.px(hx + dx - j * 0.15, cy0 - j, GOLD[c]);
      if (w) p.px(hx + dx - j * 0.15 + 1, cy0 - j, GOLD[Math.max(1, c - 2)]);
    }
    p.px(hx + dx - h * 0.15, cy0 - h - 1, LAVA[5]); g.px(hx + dx - h * 0.15, cy0 - h - 1, GLOW[c > 3 ? 4 : 3]);
  }
  // Glutstein in der Krone
  p.px(hx - 1.5, cy0, LAVA[4]); g.px(hx - 1.5, cy0, GLOW[4]); g.px(hx - 1.5, cy0 - 1, GLOW[2]);
  // Goldmaske mit Glutriss und V-Augenschlitzen
  // Kapuzenschatten rahmt die Maske (Kontrast), Maske selbst gedämpftes Gold
  ell(p, hx + 0.8, hy + 0.6, 3.4, 3.9, [VOID, ROBE[0]]);
  ell(p, hx + 1.2, hy + 0.5, 2.6, 3.2, GOLD.slice(0, 5), { bias: 0.02 });
  p.px(hx + 2.5, hy + 3, GOLD[1]); p.px(hx + 3, hy + 2, GOLD[1]);
  // V-Augenschlitze: dunkle Kerbe, innen tiefer (zorniger Blick), glühender Kern
  const ec = ex.hurt ? '#ffffff' : LAVA[4];
  p.px(hx, hy - 1, VOID); p.px(hx + 1, hy, VOID); p.px(hx + 3, hy, VOID); p.px(hx + 4, hy - 1, VOID);
  p.px(hx + 2, hy - 1, GOLD[4]);                                  // Nasengrat im Licht
  if (P.eye > 0.3) {
    p.px(hx + 1, hy, ec); p.px(hx + 3, hy, ec); p.px(hx, hy - 1, LAVA[2]); p.px(hx + 4, hy - 1, LAVA[2]);
    g.px(hx + 1, hy, GLOW[4]); g.px(hx + 3, hy, GLOW[4]); g.px(hx, hy - 1, GLOW[2]); g.px(hx + 4, hy - 1, GLOW[2]);
    if (P.halo > 1.3) { g.px(hx + 5, hy, GLOW[2]); g.px(hx + 1, hy - 1, GLOW[1]); }
  }
  // Glutriss quer über die Maske, schmaler Mundschlitz
  p.line(hx + 1, hy + 1.5, hx + 2, hy + 3, LAVA[2]); g.px(hx + 1, hy + 2, GLOW[1]);
  p.line(hx + 2, hy + 2.5, hx + 3, hy + 2.5, VOID);
  p.px(hx, hy - 2, GOLD[5]);
  meta.eye = { x: hx + 2, y: hy };
  meta.head = { x: hx - 1, y: hy - 11 };


  // vorderer Arm, Hand mit Feuerkugel
  const hF = { x: sh.x + P.hFx, y: sh.y + P.hFy };
  const k = ik(sh.x + 1, sh.y + 1, hF.x, hF.y, 5, 5.5, P.hFy < 3 ? -1 : 1);
  if (ex.smear) arcSmear(p, g, sh.x, sh.y, ex.smear[0], ex.smear[1], 8, 14, [LAVA[1], LAVA[3], LAVA[5]], 87, true);
  cap(p, sh.x + 1, sh.y + 1, k.jx, k.jy, 2.2, 2.2, ROBE, { bias: 0.12 });
  cap(p, k.jx, k.jy, k.ex, k.ey, 2.2, 3 + P.sleeve * 0.6, ROBE, { bias: 0.12 });
  p.px(k.ex + 1, k.ey + 2, GOLD[3]);
  p.rect(k.ex, k.ey - 1, 2, 2, SKIN[2]); p.px(k.ex + 1, k.ey - 1, SKIN[3]);
  const bx = k.ex + 2.5, bY = k.ey - 2 - P.ball;
  if (P.ball > 0.4) fireball(p, g, bx, bY, P.ball, P.orb * 3 + P.ball);
  meta.hand = { x: bx, y: bY };
  if (ex.flash) { glowDot(g, bx + 2, bY, 3); for (let i = 0; i < 6; i++) { const a = i * 1.047, qx = bx + 2 + Math.cos(a) * 5, qy = bY + Math.sin(a) * 4; p.px(qx, qy, LAVA[4]); g.px(qx, qy, GLOW[3]); } }
  return meta;
}

function drawAdeptCorpse(p, g, k) {
  const { AX, AY } = AD;
  const gy = AY - 1;
  for (let j = 0; j < 5; j++) {
    const hw = 11 - j * 1.8;
    for (let x = -hw; x <= hw; x++) {
      const t = 0.3 + (hw - x) / (2 * hw) * 0.5;
      p.px(AX - 2 + x, gy - j, (j < 2 ? ROBE_CH : ROBE)[clamp(Math.floor(t * 4), 0, 3)]);
    }
  }
  p.line(AX - 10, gy - 3, AX + 4, gy - 4, GOLD[2]);
  // Maske liegt daneben
  ell(p, AX + 11, gy - 1.5, 2.6, 2, GOLD, { bias: 0.05 });
  p.px(AX + 10, gy - 2, VOID); p.px(AX + 12, gy - 2, VOID);
  // Glutmotten sinken und erlöschen
  for (let i = 0; i < 3; i++) {
    const x = AX - 6 + i * 6, y = gy - 6 + k * 5 - i;
    if (k < 0.9) { p.px(x, y, LAVA[k < 0.5 ? 4 : 2]); g.px(x, y, GLOW[k < 0.5 ? 3 : 1]); }
  }
  if (k < 0.7) flame(p, g, AX + 5, gy, Math.round(4 * (1 - k)) + 1, 1.2 * (1 - k) + 0.4, k * 7, { seed: 9 });
  return { eye: { x: AX + 11, y: gy - 2 }, head: { x: AX + 11, y: gy - 5 }, hand: { x: AX + 5, y: gy - 3 } };
}

function createAdept() {
  const S = { ...AD, draw: drawAdept };
  const idle = cycle((ph) => {
    const s = Math.sin(ph);
    return adp({ bob: Math.max(0, s) * 0.8, hem: ph, orb: ph, hFy: 7 + Math.max(0, s), ball: 1.2 + s * 0.2, halo: 1 + s * 0.1 });
  }, 6);
  const walk = cycle((ph) => {
    const s = Math.sin(ph), c = Math.cos(ph);
    return adp({ bob: 1 - Math.abs(c), lean: 0.3, hem: ph * 2, stepA: s * 3, stepB: -s * 3, hFx: 6, hFy: 8 + Math.max(0, s), hBx: -6 - s, orb: ph, ball: 1, head: 0.5 });
  }, 6);
  // Ausholen: Kugel sammeln, Glut lodert, Motten beschleunigen
  const w1 = adp({ lean: -0.2, hFx: 4, hFy: 2, hBx: 3, hBy: 4, ball: 1.8, halo: 1.3, orb: 1.5, head: -0.5, sleeve: 0.5 });
  const w2 = adp({ lean: -0.35, hFx: 2, hFy: -3, hBx: 4, hBy: 1, ball: 2.6, halo: 1.6, orb: 3, head: -1, headY: -0.5, sleeve: 1 });
  // Wurf: Hand nach vorn, Kugel löst sich (Projektil vom Spiel)
  const s1 = adp({ lean: 0.5, hFx: 11, hFy: 3, hBx: -6, hBy: 6, ball: 0.3, halo: 1.5, orb: 4, stepA: 3, sleeve: 0.8 });
  const s2 = adp({ lean: 0.55, hFx: 12, hFy: 4, hBx: -7, hBy: 7, ball: 0, halo: 1.2, orb: 4.8, stepA: 3.5, sleeve: 0.5 });
  const s3 = adp({ lean: 0.2, hFx: 8, hFy: 6, hBx: -5, hBy: 8, ball: 0.7, halo: 1, orb: 5.6, stepA: 1 });
  // Glutfeld: Arme hoch, dann beide Hände zum Boden – Glyphe flammt auf
  const c1 = adp({ lean: -0.3, hFx: 3, hFy: -8, hBx: -2, hBy: -7, ball: 1.5, halo: 1.5, orb: 1, headY: -1, sleeve: 1 });
  const c2 = adp({ lean: -0.35, hFx: 4, hFy: -10, hBx: -1, hBy: -9, ball: 2.4, halo: 1.9, orb: 2.5, headY: -1.5, sleeve: 1, glyph: 0.2 });
  const c3 = adp({ lean: 0.5, bob: 3, hFx: 9, hFy: 14, hBx: 5, hBy: 14, ball: 0.2, halo: 1.6, orb: 4, head: 1, headY: 1, glyph: 0.9 });
  const c4 = adp({ lean: 0.45, bob: 3, hFx: 9, hFy: 14, hBx: 5, hBy: 14, ball: 0, halo: 1.2, orb: 5, head: 1, headY: 1, glyph: 1 });
  const c5 = adp({ lean: 0.1, bob: 1, hFx: 7, hFy: 8, hBx: -4, hBy: 8, ball: 0.8, halo: 1, orb: 6, glyph: 0.5 });
  const hurtP = adp({ lean: -0.6, head: -1.5, hFx: 3, hFy: 4, hBx: -7, hBy: 4, ball: 0.4, halo: 0.6, eye: 0 });
  const d1 = adp({ lean: -0.8, bob: 1, head: -1.5, hFx: 2, hFy: 1, hBx: -7, hBy: 2, ball: 0, halo: 0.5, eye: 0 });
  const d2 = adp({ lean: 0.9, bob: 7, head: 1.5, headY: 2, hFx: 9, hFy: 10, hBx: 3, hBy: 12, ball: 0, halo: 0.3, eye: 0 });
  return {
    idle: new Animation(track(S, idle, 6, { loop: true }), 6),
    walk: new Animation(track(S, walk, 6, { loop: true }), 10),
    windup: new Animation(track(S, [[0, idle[0][1]], [0.5, w1], [1, w2]], 5), 8, false),
    strike: new Animation(track(S, [[0, s1], [0.35, s2, snap], [1, s3]], 4, {
      extras: { 0: { fx: 'impact', flash: true, smear: [-1.6, -0.2] } },
    }), 12, false),
    // 10 Frames bei 9 fps: Hände schlagen in Frame 8 auf (≈ 0,9–1,0 s = windup des Glutfelds)
    cast: new Animation(track(S, [[0, idle[0][1]], [0.25, c1], [0.72, c2], [0.86, c3, snap], [0.93, c4], [1, c5]], 10, {
      extras: { 8: { fx: 'impact' } },
    }), 9, false),
    hurt: new Animation(track(S, [[0, hurtP], [1, adp({ lean: -0.2 })]], 2, { extras: { 0: { hurt: true } } }), 10, false),
    death: new Animation([
      ...track(S, [[0, hurtP], [0.4, d1], [1, d2]], 3, { extras: { 0: { hurt: true } } }),
      still(S, (p, g) => drawAdeptCorpse(p, g, 0), 'impact'),
      still(S, (p, g) => drawAdeptCorpse(p, g, 0.45)),
      still(S, (p, g) => drawAdeptCorpse(p, g, 1)),
    ], 8, false),
  };
}


// ================================================================ Der Glutkoloss (Elite)

const CO = { W: 132, H: 106, AX: 60, AY: 97, pad: 14, rim: { hi: '#f0d0b0', k: 0.36, back: '#3a0e06' } };
const CO_REST = {
  hipX: 0, hipY: 0, lean: 0.12, head: 0, headY: 0, jaw: 0.1, core: 1, vent: 0.4, kneel: 0,
  fFx: 10, fFy: 0, fBx: -10, fBy: 0,
  hFx: 17, hFy: 22, hBx: -13, hBy: 21, fist: 0, trail: 0,
};
const cop = (o) => ({ ...CO_REST, ...o });

// Fels mit Facetten, Rauschen und Glutrissen
function boulder(p, g, x, y, rx, ry, ramp, seed, heat, cracks = 2, o = {}) {
  ell(p, x, y, rx, ry, ramp, { noise: 0.09, seed, ...o });
  // Facettenkanten oben links
  const n = Math.max(2, Math.round(rx / 2));
  for (let i = 0; i < n; i++) {
    const a = -2.4 + (i / n) * 1.3 + (hash2(i, 1, seed) - 0.5) * 0.3;
    const fx = x + Math.cos(a) * rx * 0.72, fy = y + Math.sin(a) * ry * 0.72;
    p.px(fx, fy, ramp[ramp.length - 1]); p.px(fx + 1, fy + 1, ramp[ramp.length - 3]);
  }
  if (cracks && rx > 3) veins(p, g, x, y, rx, ry, seed + 7, cracks, heat, { len: Math.round((rx + ry) * 0.55) });
}

// Obsidiandorn (Kristall), Basis (bx,by), Winkel a
function shard(p, g, bx, by, a, h, w, heat) {
  const tx = bx + Math.cos(a) * h, ty = by + Math.sin(a) * h;
  const nx = -Math.sin(a) * w, ny = Math.cos(a) * w;
  poly(p, [[bx - nx, by - ny], [tx, ty], [bx + nx, by + ny]], (x, y) => ((x - bx) * -Math.sin(a) + (y - by) * Math.cos(a) < 0 ? OBS[4] : OBS[2]));
  p.line(bx - nx * 0.4, by - ny * 0.4, tx, ty, OBS_SHINE);
  if (heat > 0.5) { p.px(bx, by, LAVA[3]); g.px(bx, by, GLOW[2]); }
}

function drawColossus(p, g, P, ex) {
  const { AX, AY } = CO;
  const meta = {};
  const gy = AY;
  const core = P.core;
  const heat = 0.55 + core * 0.3;
  const hip = { x: AX + P.hipX, y: gy - 26 + P.hipY + P.kneel * 9 };
  const lean = P.lean;
  const ch = { x: hip.x + Math.sin(lean) * 22, y: hip.y - Math.cos(lean) * 22 };
  const px = Math.cos(lean), py = Math.sin(lean);
  const shF = { x: ch.x + px * 13, y: ch.y + py * 13 - 7 }, shB = { x: ch.x - px * 12, y: ch.y - py * 12 - 9 };

  const leg = (hx, hy, fx, fy, ramp, back, seed) => {
    let k = ik(hx, hy, fx, fy, 12, 12, -1);
    if (P.kneel > 0.01 && !back) {
      const kx = hx + 6, ky = gy - 3;
      k = { jx: k.jx + (kx - k.jx) * P.kneel, jy: k.jy + (ky - k.jy) * P.kneel, ex: k.ex + (kx - 12 - k.ex) * P.kneel, ey: k.ey };
    }
    cap(p, hx, hy, k.jx, k.jy, 6.5, 5.6, ramp, { noise: 0.08, seed });
    cap(p, k.jx, k.jy, k.ex, k.ey - 4, 5.4, 6, ramp, { noise: 0.08, seed: seed + 1 });
    boulder(p, g, k.jx + 1, k.jy, 5, 4.4, ramp, seed + 2, heat * (back ? 0.5 : 0.9), back ? 0 : 1);
    // Fuß: flacher Felsblock
    boulder(p, g, k.ex + 3, k.ey - 3, 8.5, 3.8, ramp, seed + 3, heat * 0.6, back ? 0 : 1);
    if (!back) { p.px(k.ex + 10, k.ey - 2, OBS[4]); p.px(k.ex + 11, k.ey - 1, OBS[3]); }
  };
  const arm = (sh, tx, ty, ramp, back, seed) => {
    const k = ik(sh.x, sh.y, tx, ty, 15, 16, 1);
    cap(p, sh.x, sh.y, k.jx, k.jy, 6, 5, ramp, { noise: 0.08, seed, rim: back ? 0 : 1 });
    boulder(p, g, (sh.x + k.jx) / 2, (sh.y + k.jy) / 2, 5.5, 5, ramp, seed + 1, heat * (back ? 0.4 : 0.9), back ? 0 : 1);
    cap(p, k.jx, k.jy, k.ex, k.ey, 5.2, 6.2, ramp, { noise: 0.08, seed: seed + 2, rim: back ? 0 : 1 });
    boulder(p, g, k.jx, k.jy, 4.4, 4.4, ramp, seed + 3, heat * 0.8, back ? 0 : 1);
    // Faust
    const fr = 7.5 + P.fist * 0.8;
    const fx = k.ex + (back ? 0 : 1), fy = k.ey + 2;
    boulder(p, g, fx, fy, fr, fr * 0.88, ramp, seed + 4, heat * (back ? 0.7 : 1.15), back ? 1 : 3, { rim: back ? 0 : 1 });
    // glühende Knöchel
    const a = Math.atan2(k.ey - k.jy, k.ex - k.jx);
    for (let i = -1; i <= 1; i++) {
      const qx = fx + Math.cos(a + i * 0.5) * (fr - 1.5), qy = fy + Math.sin(a + i * 0.5) * (fr - 1.5);
      const c = heat > 1.2 ? 4 : 3;
      p.px(qx, qy, LAVA[back ? c - 1 : c]); g.px(qx, qy, GLOW[back ? 1 : c - 1]);
    }
    // Magma tropft von der Faust
    if (!back && heat > 0.9) {
      const L = 1 + Math.floor(((ex.t ?? 0) * 3 + seed) % 3);
      for (let j = 0; j < L; j++) { p.px(fx + 1, fy + fr * 0.85 + j, LAVA[j === L - 1 ? 4 : 3]); g.px(fx + 1, fy + fr * 0.85 + j, GLOW[2]); }
    }
    return { k, fx, fy, fr };
  };

  // --- hinten: Bein, Arm, Schulterfels
  leg(hip.x - 5, hip.y, AX + P.fBx, gy - P.fBy, ROCK_D, true, 100);
  const bA = arm(shB, ch.x + P.hBx, ch.y + P.hBy, ROCK_D, true, 110);
  meta.handB = { x: bA.fx, y: bA.fy };
  boulder(p, g, shB.x, shB.y, 8, 7, ROCK_D, 120, heat * 0.5, 1);
  shard(p, g, shB.x - 3, shB.y - 4, -2.0, 9, 2.2, heat);
  shard(p, g, shB.x + 1, shB.y - 5, -1.75, 7, 1.8, heat);

  // --- Rückenkamm: Obsidiankristalle, Rauch und Glut aus Spalten
  for (let i = 0; i < 4; i++) {
    const u = i / 3;
    const bx = hip.x - 10 + (ch.x - hip.x - 8) * u - py * 3, by = hip.y - 6 + (ch.y - hip.y - 6) * u - 2;
    shard(p, g, bx, by, -2.3 + u * 0.4 + lean * 0.4, 6 + u * 5, 1.8 + u * 0.4, heat);
    const ph = P.vent + i * 1.3;
    for (let k = 0; k < 3; k++) {
      const yy = by - 6 - k * 3 - ((ph * 2) % 1) * 3, xx = bx - 2 + Math.sin(ph * 3 + k) * 1.2 - k;
      if (k === 0) { p.px(xx, yy, LAVA[4]); g.px(xx, yy, GLOW[3]); } else g.px(xx, yy, GLOW[k === 1 ? 1 : 0]);
    }
  }

  // --- Becken und Rumpf
  boulder(p, g, hip.x, hip.y, 11, 6.5, ROCK, 130, heat * 0.8, 2);
  boulder(p, g, ch.x - 2 + py * 4, ch.y + 9, 13, 9, ROCK, 131, heat * 0.8, 2, { rot: lean });
  boulder(p, g, ch.x, ch.y, 17, 14, ROCK, 132, heat, 3, { rot: lean, bias: 0.04 });
  // Magmakern: Spalt in der Brust, von Felsplatten eingefasst
  const kx = ch.x + px * 4, ky = ch.y + 2;
  const kr = 4.5 + core * 1.2;
  for (let j = -Math.ceil(kr); j <= kr; j++) for (let i = -Math.ceil(kr * 0.8); i <= kr * 0.8; i++) {
    const d = Math.hypot(i / 0.8, j) / kr;
    if (d > 1 || hash2(i, j, 133) < d * 0.35) continue;
    const hot = (1 - d) * 0.7 + (j > 0 ? 0.1 : 0) + hash2(i, j, 134) * 0.2 + (core - 1) * 0.35;
    const c = hot > 0.72 ? 5 : hot > 0.52 ? 4 : hot > 0.32 ? 3 : 2;
    p.px(kx + i, ky + j, LAVA[c]); g.px(kx + i, ky + j, GLOW[Math.min(4, c - 1)]);
  }
  if (core > 1.25) g.ellipse(kx, ky, kr + (core - 1.25) * 4, kr + (core - 1.25) * 4, GLOW[0]);
  glowDot(g, kx, ky, 0.5 + core * 1.6);
  // Felsplatten, die den Kern halb verdecken
  poly(p, [[kx - 7, ky - 7], [kx + 1, ky - 5 - core], [kx - 1, ky - 1], [kx - 6, ky]], (x, y) => ROCK[y < ky - 4 ? 5 : 3]);
  poly(p, [[kx + 2, ky + 3 + core * 0.5], [kx + 8, ky + 1], [kx + 7, ky + 7], [kx + 1, ky + 7]], ROCK[2]);
  p.line(kx - 7, ky - 7, kx + 1, ky - 6 - core, ROCK[5]);
  // Strahlen: Risse vom Kern nach außen
  for (let i = 0; i < 5; i++) {
    const a = -2.6 + i * 1.2 + hash2(i, 1, 135) * 0.4;
    for (let r = kr; r < kr + 5 + core * 3; r++) {
      const x = kx + Math.cos(a + r * 0.05) * r, y = ky + Math.sin(a + r * 0.05) * r;
      const c = r < kr + 3 ? 3 : 2;
      p.px(x, y, LAVA[c]); g.px(x, y, GLOW[c - 1]);
    }
  }
  meta.chest = { x: kx, y: ky };

  // --- vorderes Bein
  leg(hip.x + 5, hip.y + 1, AX + P.fFx, gy - P.fFy, ROCK, false, 140);

  // --- vorderer Arm, Schulterfels mit Kristallen
  if (ex.smear) arcSmear(p, g, shF.x, shF.y, ex.smear[0], ex.smear[1], 20, 36, SMEAR, 161, false);
  occlude(g);
  const fA = arm(shF, ch.x + P.hFx, ch.y + P.hFy, ROCK, false, 170);
  occlude(null);
  // Glut der Faust nach dem Verdecken wieder aufsetzen
  for (let i = -1; i <= 1; i++) {
    const a = Math.atan2(fA.k.ey - fA.k.jy, fA.k.ex - fA.k.jx);
    const qx = fA.fx + Math.cos(a + i * 0.5) * (fA.fr - 1.5), qy = fA.fy + Math.sin(a + i * 0.5) * (fA.fr - 1.5);
    g.px(qx, qy, GLOW[heat > 1.2 ? 3 : 2]);
  }
  if (heat > 1.1) glowDot(g, fA.fx + 1, fA.fy + 1, 1 + (heat - 1.1) * 3);
  occlude(g);
  boulder(p, g, shF.x, shF.y, 9, 7.5, ROCK, 180, heat, 2, { rim: 1, bias: 0.05 });
  occlude(null);
  shard(p, g, shF.x - 4, shF.y - 5, -1.95, 11, 2.4, heat);
  shard(p, g, shF.x + 1, shF.y - 6, -1.6, 8, 2, heat);
  shard(p, g, shF.x + 5, shF.y - 4, -1.2, 5, 1.5, heat);
  // --- Kopf: klein, tief zwischen den Schultern, schwerer Stirnwulst
  const hx = ch.x + px * 5 + py * 8 + P.head, hy = ch.y - 16 + py * 5 + P.headY;
  boulder(p, g, hx, hy, 6.5, 5.5, ROCK, 150, heat * 0.7, 1, { rim: 1 });
  // Stirnwulst mit Obsidianhörnern
  p.rect(hx - 5, hy - 3, 11, 2, ROCK[4]); p.rect(hx - 4, hy - 3, 9, 1, ROCK[5]);
  shard(p, g, hx - 3, hy - 3, -2.2, 6, 1.6, heat);
  shard(p, g, hx + 1, hy - 4, -1.9, 4, 1.3, heat);
  // Augen
  const ec = ex.hurt ? '#ffffff' : LAVA[5];
  p.rect(hx, hy - 1, 7, 2, VOID);                                              // Schattenband unter dem Wulst
  p.px(hx + 1, hy - 1, LAVA[3]); p.px(hx + 2, hy, ec); p.px(hx + 4, hy, ec); p.px(hx + 5, hy - 1, LAVA[3]);
  p.px(hx + 2, hy - 1, LAVA[4]); p.px(hx + 4, hy - 1, LAVA[4]);
  g.px(hx + 2, hy, GLOW[4]); g.px(hx + 4, hy, GLOW[4]); g.px(hx + 2, hy - 1, GLOW[3]); g.px(hx + 4, hy - 1, GLOW[3]);
  g.px(hx + 1, hy - 1, GLOW[2]); g.px(hx + 5, hy - 1, GLOW[2]);
  g.rect(hx, hy - 2, 7, 3, GLOW[0]);
  p.px(hx + 3, hy, ROCK[3]); p.px(hx + 3, hy + 1, ROCK[4]);                    // Nasenrücken
  p.px(hx - 3, hy, ROCK[5]); p.px(hx - 2, hy + 1, ROCK[4]);                    // Wangenkante im Licht
  // Maul: glühender Spalt, öffnet sich beim Brüllen
  const jo = Math.round(P.jaw * 4);
  p.rect(hx, hy + 2, 6, 1 + jo, VOID);
  if (jo > 0) {
    p.rect(hx + 1, hy + 2, 4, jo, LAVA[3]); p.rect(hx + 2, hy + 2, 2, jo, LAVA[5]); g.rect(hx + 1, hy + 2, 4, jo, GLOW[3]);
    // Steinzähne oben und unten
    p.px(hx + 1, hy + 2, ROCK[5]); p.px(hx + 4, hy + 2, ROCK[5]); p.px(hx + 2, hy + 1 + jo, ROCK[4]); p.px(hx + 5, hy + 1 + jo, ROCK[4]);
  }
  else { p.rect(hx + 1, hy + 2, 4, 1, LAVA[2]); g.rect(hx + 1, hy + 2, 4, 1, GLOW[1]); }
  p.rect(hx - 1, hy + 3 + jo, 8, 2, ROCK[2]); p.px(hx + 6, hy + 3 + jo, ROCK[3]);
  meta.eye = { x: hx + 3, y: hy - 1 };
  meta.head = { x: hx, y: hy - 10 };
  meta.mouth = { x: hx + 5, y: hy + 3 };

  meta.hand = { x: fA.fx, y: fA.fy };
  meta.tip = { x: fA.fx + fA.fr, y: fA.fy };

  if (ex.trail) {
    // Glutschweif beim Ansturm (hinter dem Koloss)
    for (let i = 0; i < 16; i++) {
      const x = hip.x - 16 - hash2(i, 1, 190) * 22, y = gy - 4 - hash2(i, 2, 190) * 40;
      const c = hash2(i, 3, 190) < 0.4 ? 4 : 3;
      p.px(x, y, LAVA[c]); g.px(x, y, GLOW[c - 1]); if (i % 3 === 0) { p.px(x - 1, y, LAVA[2]); g.px(x - 1, y, GLOW[1]); }
    }
    dustRing(p, g, AX + P.fBx, gy - 1, 6, 191, [ROCK[3], ROCK[4], CHAR[3]], false);
  }
  if (ex.impact) {
    const ix = ex.impactX === 'both' ? (fA.fx + bA.fx) / 2 : fA.fx;
    dustRing(p, g, ix, gy - 1, ex.impact, 193, [ROCK[3], ROCK[4], CHAR[3]]);
    for (let i = 0; i < 20; i++) {
      const a = -Math.PI * (0.08 + hash2(i, 1, 194) * 0.84), d = (ex.impact + 4) * (0.35 + hash2(i, 2, 194) * 0.8);
      const x = ix + Math.cos(a) * d, y = gy - 2 + Math.sin(a) * d * 0.75;
      p.px(x, y, LAVA[hash2(i, 3, 194) < 0.4 ? 5 : 4]); g.px(x, y, GLOW[3]);
      if (i % 4 === 0) { p.px(x, y + 1, ROCK[3]); }
    }
    if (ex.crack) {
      // Glutrisse im Boden
      for (let s2 = 0; s2 < 5; s2++) {
        let cx2 = ix, cy2 = gy - 1, a = -Math.PI + s2 * 0.8 + hash2(s2, 1, 195) * 0.4;
        for (let st = 0; st < ex.crack; st++) {
          cx2 += Math.cos(a); cy2 += Math.sin(a) * 0.4; a += (hash2(s2, st, 196) - 0.5) * 0.9;
          p.px(cx2, cy2, LAVA[st < 4 ? 4 : 3]); g.px(cx2, cy2, GLOW[st < 4 ? 3 : 2]);
        }
      }
    }
  }
  if (ex.roarFx) {
    for (let r = 6; r < 22; r += 5) for (let a = -0.9; a <= 0.9; a += 0.1) {
      const x = meta.mouth.x + 3 + Math.cos(a) * (r + ex.roarFx * 4), y = meta.mouth.y + Math.sin(a) * (r + ex.roarFx * 4);
      if (hash2(Math.round(a * 20), r, 197) < 0.5) g.px(x, y, GLOW[r < 11 ? 2 : 1]);
    }
  }
  return meta;
}

// Trümmerhaufen: Felsen, Kristalle, erkaltender Kern
function drawColossusRubble(p, g, k) {
  const { AX, AY } = CO;
  const gy = AY;
  const heat = 1.1 * (1 - k);
  const rocks = [[-30, 4, 6, 1], [-20, 6, 8, 0], [-8, 8, 10, 1], [6, 9, 11, 0], [20, 6, 8, 1], [31, 4, 6, 0], [-14, 15 - k * 3, 7, 0], [2, 17 - k * 4, 8, 1], [16, 13 - k * 3, 6, 0], [40, 2, 4, 1]];
  rocks.forEach(([x, h, r, d], i) => boulder(p, g, AX + x, gy - h + (k * (i % 3)), r, r * 0.85, d ? ROCK : ROCK_D, 200 + i, heat, r > 6 ? 2 : 1));
  // Kristalle ragen heraus
  shard(p, g, AX - 16, gy - 12, -2.1, 9, 2.2, heat);
  shard(p, g, AX + 12, gy - 16, -1.4, 11, 2.4, heat);
  shard(p, g, AX + 26, gy - 8, -0.9, 7, 1.8, heat);
  // Kern: glüht nach, erlischt
  const kx = AX + 3, ky = gy - 12 - (1 - k) * 4;
  if (heat > 0.1) {
    ell(p, kx, ky, 4, 3.4, heat > 0.6 ? [LAVA[2], LAVA[3], LAVA[4], LAVA[5]] : [LAVA[0], LAVA[1], LAVA[2], LAVA[3]]);
    glowDot(g, kx, ky, 1 + heat * 2.5);
  } else ell(p, kx, ky, 4, 3.4, ROCK_D);
  // Kopf liegt vorn
  const hx = AX + 30, hy = gy - 5;
  boulder(p, g, hx, hy, 5.5, 4.6, ROCK, 220, heat * 0.5, 0);
  p.rect(hx + 1, hy - 1, 2, 1, heat > 0.3 ? LAVA[3] : VOID); if (heat > 0.3) g.rect(hx + 1, hy - 1, 2, 1, GLOW[2]);
  for (let i = 0; i < 5; i++) if (heat > 0.2) g.px(kx - 2 + i, ky - 8 - i * 2 - k * 5, GLOW[0]);
  return { eye: { x: hx + 2, y: hy - 1 }, head: { x: hx, y: hy - 6 }, chest: { x: kx, y: ky }, hand: { x: AX + 20, y: gy - 6 }, handB: { x: AX - 20, y: gy - 6 }, mouth: { x: hx + 4, y: hy + 1 }, tip: { x: AX + 26, y: gy - 6 } };
}

function createColossus() {
  const S = { ...CO, draw: (p, g, P, ex, t) => drawColossus(p, g, P, { ...ex, t }) };
  const idle = cycle((ph) => {
    const s = Math.sin(ph);
    return cop({ hipY: Math.max(0, s) * 1.2, lean: 0.12 + s * 0.015, hFy: 22 + Math.max(0, s) * 1.5, hBy: 21 + Math.max(0, s) * 1.5, headY: Math.max(0, s), core: 0.95 + s * 0.2, vent: ph / 3 });
  }, 6);
  const walk = cycle((ph) => {
    const s = Math.sin(ph), c = Math.cos(ph);
    return cop({
      hipX: 1, hipY: 1.5 - Math.abs(c) * 2.5, lean: 0.2 + s * 0.03, head: s * 0.8, headY: Math.abs(c) * 1.2,
      fFx: 5 + s * 11, fFy: Math.max(0, -c) * 5, fBx: -5 - s * 11, fBy: Math.max(0, c) * 5,
      hFx: 17 - s * 5, hFy: 22 - Math.max(0, -s) * 2, hBx: -13 + s * 5, hBy: 21 - Math.max(0, s) * 2, core: 1, vent: ph / 2,
    });
  }, 8);
  // Hieb: Faust weit zurück und hoch, dann schräger Schwinger nach vorn-unten
  const w1 = cop({ lean: 0.02, hipX: -2, hFx: 2, hFy: -6, hBx: -8, hBy: 16, fFx: 13, fBx: -11, core: 1.2, fist: 0.6, vent: 0.5 });
  const w2 = cop({ lean: -0.14, hipX: -4, hipY: -1, hFx: -8, hFy: -18, hBx: -4, hBy: 12, fFx: 14, fBx: -12, core: 1.45, fist: 1, headY: -1, jaw: 0.3, vent: 1 });
  const s1 = cop({ lean: 0.25, hipX: 2, hipY: 2, hFx: 24, hFy: -8, hBx: -15, hBy: 16, fFx: 16, fBx: -12, core: 1.5, fist: 1, jaw: 0.5, vent: 1.3 });
  const s2 = cop({ lean: 0.45, hipX: 5, hipY: 6, hFx: 28, hFy: 26, hBx: -16, hBy: 18, fFx: 17, fBx: -13, core: 1.55, fist: 1, jaw: 0.4, vent: 1.5 });
  const s3 = cop({ lean: 0.42, hipX: 5, hipY: 6, hFx: 27, hFy: 27, hBx: -15, hBy: 19, fFx: 17, fBx: -13, core: 1.3, fist: 0.8, vent: 1.7 });
  const s4 = cop({ lean: 0.2, hipX: 2, hipY: 2, hFx: 19, hFy: 22, hBx: -13, hBy: 21, fFx: 13, fBx: -11, core: 1.05, vent: 2 });
  // Brüllen: Arme auseinander, Brust auf, Kern lodert
  const r1 = cop({ lean: -0.05, hFx: 22, hFy: 4, hBx: -22, hBy: 4, headY: -2, jaw: 0.6, core: 1.5, fist: 0.5, vent: 1 });
  const r2 = cop({ lean: -0.22, hipY: -1, hFx: 25, hFy: -8, hBx: -24, hBy: -8, headY: -4, head: -1, jaw: 1, core: 2, fist: 1, vent: 2 });
  // Bodenschlag: beide Fäuste über den Kopf, lange halten (Telegraph), dann hinunter
  const sl1 = cop({ lean: 0, hipY: -1, hFx: 10, hFy: -22, hBx: 2, hBy: -20, headY: -1, jaw: 0.3, core: 1.3, fist: 0.8, vent: 1 });
  const sl2 = cop({ lean: -0.15, hipY: -2, hFx: 6, hFy: -30, hBx: -2, hBy: -28, headY: -2, jaw: 0.5, core: 1.6, fist: 1, fBy: 1, vent: 1.5 });
  const sl2b = cop({ lean: -0.17, hipY: -2, hFx: 5, hFy: -31, hBx: -3, hBy: -29, headY: -2, jaw: 0.6, core: 1.95, fist: 1, fBy: 1, vent: 2.5 });
  const sl3 = cop({ lean: 0.55, hipX: 4, hipY: 9, hFx: 26, hFy: 34, hBx: 18, hBy: 34, headY: 2, jaw: 0.8, core: 2, fist: 1, fFx: 15, fBx: -12, vent: 3 });
  const sl4 = cop({ lean: 0.52, hipX: 4, hipY: 9, hFx: 26, hFy: 34, hBx: 18, hBy: 34, headY: 2, jaw: 0.4, core: 1.6, fist: 1, fFx: 15, fBx: -12, vent: 3.5 });
  const sl5 = cop({ lean: 0.25, hipX: 2, hipY: 3, hFx: 20, hFy: 24, hBx: -6, hBy: 24, core: 1.2, fFx: 13, fBx: -11, vent: 4 });
  // Ansturm vorbereiten: Schulter senken, mit dem Fuß scharren
  const b1 = cop({ lean: 0.45, hipY: 4, hFx: 14, hFy: 26, hBx: -18, hBy: 18, headY: 3, fFx: 14, fBx: -16, core: 1.3, jaw: 0.3, vent: 1 });
  const b2 = cop({ lean: 0.55, hipY: 5, hFx: 13, hFy: 28, hBx: -20, hBy: 16, headY: 4, fFx: 15, fBx: -20, fBy: 3, core: 1.6, jaw: 0.5, vent: 2 });
  const charge = cycle((ph) => {
    const s = Math.sin(ph), c = Math.cos(ph);
    return cop({
      lean: 0.6 + s * 0.03, hipX: 3, hipY: 4 - Math.abs(c) * 2.5, headY: 4, head: 1,
      fFx: 8 + s * 14, fFy: Math.max(0, -c) * 6, fBx: -6 - s * 14, fBy: Math.max(0, c) * 6,
      hFx: 16 + s * 3, hFy: 18, hBx: -24 - s * 3, hBy: 12, core: 1.6, jaw: 0.5, fist: 1, vent: ph,
    });
  }, 6);
  const hurtP = cop({ lean: -0.12, hipX: -4, head: -2, headY: -1, hFx: 12, hFy: 16, hBx: -16, hBy: 16, jaw: 0.6, core: 1.8 });
  const d1 = cop({ lean: -0.2, hipX: -4, head: -2, headY: -2, hFx: 10, hFy: 12, hBx: -17, hBy: 13, jaw: 1, core: 2 });
  const d2 = cop({ lean: 0.45, kneel: 1, hipY: 3, head: 1, headY: 3, hFx: 22, hFy: 30, hBx: -8, hBy: 30, jaw: 0.5, core: 1.4 });
  const d3 = cop({ lean: 0.8, kneel: 1, hipY: 7, head: 2, headY: 5, hFx: 26, hFy: 26, hBx: 8, hBy: 28, jaw: 0.3, core: 1 });
  return {
    idle: new Animation(track(S, idle, 6, { loop: true }), 5),
    walk: new Animation(track(S, walk, 8, { loop: true, extras: { 0: { fx: 'step' }, 4: { fx: 'step' } } }), 7),
    windup: new Animation(track(S, [[0, idle[0][1]], [0.45, w1], [1, w2]], 5), 8, false),
    strike: new Animation(track(S, [[0, s1], [0.25, s2, snap], [0.6, s3], [1, s4]], 5, {
      extras: { 0: { smear: [-2.2, -0.5] }, 1: { fx: 'impact', smear: [-1.5, 0.95], impact: 10 }, 2: { impact: 15 } },
    }), 12, false),
    roar: new Animation(track(S, [[0, idle[0][1]], [0.3, r1], [0.5, r2, snap], [0.85, { ...r2, core: 2.2 }], [1, cop({ ...r1, jaw: 0.4, core: 1.3 })]], 7, {
      extras: { 3: { fx: 'roar', roarFx: 1 }, 4: { roarFx: 2 }, 5: { roarFx: 3 } },
    }), 6, false),
    // 12 Frames bei 9 fps: Einschlag in Frame 9 (≈ 1,0–1,1 s = windup des Spezialangriffs)
    slam: new Animation(track(S, [[0, idle[0][1]], [0.18, sl1], [0.36, sl2], [0.7, sl2b], [0.8, sl3, snap], [0.9, sl4], [1, sl5]], 12, {
      extras: { 8: { smear: [-2.4, 1.2] }, 9: { fx: 'impact', impact: 16, impactX: 'both', crack: 6 }, 10: { impact: 23, impactX: 'both', crack: 10 }, 11: { impactX: 'both', crack: 12, impact: 0.01 } },
    }), 9, false),
    brace: new Animation(track(S, [[0, idle[0][1]], [0.4, b1], [0.7, b2], [1, { ...b1, core: 1.7 }]], 5, { extras: { 2: { fx: 'step' }, 4: { fx: 'step' } } }), 6, false),
    charge: new Animation(track(S, charge, 6, { loop: true, extras: { 0: { fx: 'step', trail: 1 }, 1: { trail: 1 }, 2: { trail: 1 }, 3: { fx: 'step', trail: 1 }, 4: { trail: 1 }, 5: { trail: 1 } } }), 12),
    hurt: new Animation(track(S, [[0, hurtP], [1, cop({ lean: 0.08 })]], 2, { extras: { 0: { hurt: true } } }), 8, false),
    death: new Animation([
      ...track(S, [[0, hurtP], [0.3, d1], [0.65, d2, snap], [1, d3]], 4, { extras: { 0: { hurt: true }, 2: { fx: 'impact' } } }),
      still(S, (p, g) => drawColossusRubble(p, g, 0), 'impact'),
      still(S, (p, g) => drawColossusRubble(p, g, 0.4)),
      still(S, (p, g) => drawColossusRubble(p, g, 1)),
    ], 6, false),
  };
}

// ================================================================ Export

const WASTES = {
  ash_wraith: createWraith,
  cinder_knight: createKnight,
  magma_serpent: createSerpent,
  ember_cultist_adept: createAdept,
  waste_colossus: createColossus,
};

// only (optional): nur eine Figur erzeugen (Vorschau/Werkzeuge).
// Jede Figur wird erst beim ersten Zugriff gezeichnet und dann gecacht.
export function createWastesFoes(only) {
  const out = {};
  for (const k in WASTES) {
    if (only && only !== k) continue;
    Object.defineProperty(out, k, {
      configurable: true, enumerable: true,
      get() {
        const v = WASTES[k]();
        Object.defineProperty(out, k, { value: v, writable: true, configurable: true, enumerable: true });
        return v;
      },
    });
  }
  return out;
}
