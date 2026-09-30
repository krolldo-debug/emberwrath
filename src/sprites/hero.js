import { PAL } from '../gfx/Palette.js';
import { buildFrame, Animation } from '../gfx/Sprite.js';
import { MAT, gearKey } from '../character/gearLook.js';
import { DYES, hairStylesFor } from '../character/cosmetics.js';

// Spielerfiguren (Thread A). Eine Skelettfigur mit Hüfte, Rumpf, Kopf und
// zweigliedrigen Armen/Beinen (IK), die für jedes Volk (Körperbau, Gesicht,
// Haar) und jede Klasse (Kleidung, Umhang, Waffe) Frames rastert.
// Die angelegte Ausrüstung (character/gearLook.js) bestimmt Waffenform,
// Material und Leuchten, Rüstungsstil, Helm, Handschuhe und Stiefel.
// Blickrichtung rechts (links = gespiegelt), Licht von oben links (STYLE.md).
//
// getHeroSprites(raceId, classId, variant, gear?, style?) -> {
//   idle, run, atk1, atk2, atk3, cast, spin, roll, dash, hurt, death,
//   slam, lunge, coat, rainshot, plant, summon, hurl }
// style = { dye, hairStyle } aus character/cosmetics.js (Färbung, Frisur).
// Angriffe tragen anim.phases = { windup: [a, b], active: [c, d], recover: [e, f] }
// (Frame-Bereiche), damit der Held die Frames an seine Angriffszeiten koppelt.
// Jeder Frame trägt frame.glows = [{ x, y, color, r }] relativ zum Fußpunkt
// (Augen der Glutgeborenen, Kristalle, epische und legendäre Waffen).

const W = 64, H = 64, AX = 32, AY = 52;     // Frame-Größe, Fußpunkt im Frame
const LX = -0.38, LY = -0.92;               // Richtung zum Licht (oben links)
const TAU = Math.PI * 2;

const M = MAT;
const SKIN_DARK = '#1a1014';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

// --- Völker --------------------------------------------------------------------
// body: Oberschenkel, Schienbein, Knöchel, Rumpf, Brust hinten/vorne, Hals,
//       Ober-/Unterarm, Gliederstärke.
export const RACE_LOOK = {
  human: {
    body: { thigh: 5, shin: 5, ankle: 1.5, torso: 8, back: 3.4, front: 3.6, neck: 1, arm: [4.2, 4], limb: 1 },
    skin: ['#4e3228', '#8a5a44', '#c08a68', '#dcac8a'],
    variants: [
      { hair: ['#24140c', '#43281a', '#6b4226', '#8a5a36'], label: 'Kastanie' },
      { hair: ['#0e0a12', '#1e1824', '#342a3c', '#4a3e54'], label: 'Rabenschwarz' },
      { hair: ['#5a3a12', '#96682a', '#c89a44', '#ecc870'], label: 'Weizenblond' },
    ],
    hairStyle: 'short', face: 'human',
  },
  dwarf: {
    body: { thigh: 3.4, shin: 3.3, ankle: 1.5, torso: 8, back: 4.4, front: 4.6, neck: 0, arm: [3.7, 3.5], limb: 1.3 },
    skin: ['#4a2820', '#8a4e38', '#b87858', '#d89c78'],
    variants: [
      { hair: ['#3e140a', '#6e2812', '#a44420', '#d06a34'], label: 'Kupferrot' },
      { hair: ['#22160e', '#3e2a1a', '#624430', '#80603f'], label: 'Erdbraun' },
      { hair: ['#3a3840', '#6a6670', '#a09ca6', '#d4d0d8'], label: 'Aschgrau' },
    ],
    hairStyle: 'dwarf', face: 'dwarf', beard: true,
  },
  elf: {
    body: { thigh: 5.6, shin: 5.6, ankle: 1.5, torso: 8, back: 3, front: 3.2, neck: 1.5, arm: [4.4, 4.2], limb: 0.88 },
    skin: ['#3a2c4c', '#6e6092', '#a494c4', '#cbc0e6'],
    variants: [
      { hair: ['#50506c', '#8e8eae', '#c8c8e0', '#f2f2fc'], label: 'Mondsilber' },
      { hair: ['#0e0e26', '#1e1e46', '#34346e', '#4e4e98'], label: 'Nachtblau' },
      { hair: ['#2e0c26', '#561a44', '#86306a', '#b04c90'], label: 'Pflaume' },
    ],
    hairStyle: 'long', face: 'elf', ears: true,
  },
  emberborn: {
    body: { thigh: 5, shin: 5, ankle: 1.5, torso: 8.5, back: 4, front: 4.2, neck: 1, arm: [4.3, 4.1], limb: 1.15 },
    skin: ['#1a1418', '#34282e', '#524048', '#6e5a62'],
    variants: [
      { hair: ['#1a1014', '#2c1c22', '#40282e', '#56363e'], accent: PAL.ember, label: 'Glut' },
      { hair: ['#140e1c', '#241a30', '#382848', '#4c3860'], accent: PAL.magic, label: 'Seelenfeuer' },
      { hair: ['#1a1410', '#2e241a', '#463626', '#5e4a34'], accent: ['#3a2a05', '#7a5a10', '#c8a020', '#f0d040', '#fff080', '#fffbe0'], label: 'Goldglut' },
    ],
    hairStyle: 'mane', face: 'emberborn', horns: true, cracks: true,
  },
};

// --- Klassen: Grundausstattung (ohne angelegte Items) ----------------------------
const CRIMSON = ['#2a0a12', '#4a0f1c', '#7a1a26', '#a8283a', '#d0454a'];
export const CLASS_LOOK = {
  warrior: {
    cloth: CRIMSON, trim: M.gold,
    chest: { style: 'padded', ramp: CRIMSON, trim: M.gold, shoulder: M.iron },
    weapon: { family: 'sword', blade: M.iron, guard: M.bronze, fuller: true, rarity: 'common' },
    boots: M.leather, gloves: M.leather, back: 'cape', off: 'shield',
  },
  rogue: {
    cloth: ['#140e1c', '#221832', '#34264a', '#4a3866', '#645088'], trim: M.silver,
    chest: { style: 'leather', ramp: ['#140e14', '#241a22', '#382a34', '#50404a', '#6a5864'] },
    weapon: { family: 'dagger', blade: M.iron, guard: M.iron, rarity: 'common' },
    boots: M.darkleather, gloves: M.darkleather, back: 'scarf', hood: true, off: 'dagger',
  },
  ranger: {
    cloth: ['#101a10', '#1a2a1a', '#284026', '#3a5634', '#54743e'], trim: M.gold,
    chest: { style: 'leather', ramp: M.leather },
    weapon: { family: 'bow', wood: M.wood, rarity: 'common' },
    boots: M.leather, gloves: M.leather, back: 'cloak', quiver: true, cowl: true, off: 'bow',
  },
  mage: {
    cloth: PAL.magic, trim: PAL.ember,
    chest: { style: 'robe', ramp: ['#1c1426', '#2c2038', '#40304e', '#584466', '#72587e'], trim: PAL.ember, emblem: PAL.ember },
    weapon: { family: 'staff', wood: M.wood, top: 'orb', ramp: PAL.ember, rarity: 'common' },
    boots: M.darkleather, gloves: null, back: null, circlet: true, off: 'hand',
  },
};
// Welche Waffenfamilie die Klasse in der Waffenhand führt
const CLASS_WEAPONS = {
  warrior: ['sword', 'axe', 'mace'], rogue: ['sword', 'dagger'], ranger: ['bow', 'dagger'], mage: ['staff', 'wand'],
};

// --- Raster ------------------------------------------------------------------------
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
  constructor() { this.buf = new Uint32Array(W * H); }
  set(x, y, c) {
    if (!c) return;
    const X = Math.round(x) + AX, Y = Math.round(y) + AY;
    if (X >= 0 && Y >= 0 && X < W && Y < H) this.buf[Y * W + X] = col(c);
  }
  has(x, y) {
    const X = Math.round(x) + AX, Y = Math.round(y) + AY;
    return X >= 0 && Y >= 0 && X < W && Y < H && this.buf[Y * W + X] !== 0;
  }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  // Form entlang einer Achse ab (ox, oy) mit Winkel ang. fn(u, lv, v) -> Farbe|null,
  // u = entlang der Achse, lv = quer (negativ = zum Licht gewandte Seite).
  axis(ox, oy, ang, u0, u1, vmax, fn) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const s = (-dy * LX + dx * LY) > 0 ? -1 : 1;
    const xs = [], ys = [];
    for (const u of [u0, u1]) for (const v of [-vmax, vmax]) { xs.push(ox + u * dx - v * dy); ys.push(oy + u * dy + v * dx); }
    const x0 = Math.floor(Math.min(...xs)) - 1, x1 = Math.ceil(Math.max(...xs)) + 1;
    const y0 = Math.floor(Math.min(...ys)) - 1, y1 = Math.ceil(Math.max(...ys)) + 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const rx = x - ox, ry = y - oy;
      const u = rx * dx + ry * dy, v = -rx * dy + ry * dx;
      if (u < u0 || u > u1 || Math.abs(v) > vmax) continue;
      const c = fn(u, v * s, v);
      if (c) this.set(x, y, c);
    }
  }
  // Glied als Kapsel von (x0,y0) nach (x1,y1), Radius r0 -> r1. shade(l, t, e) mit
  // l = Lichtanteil (-1..1), t = Position entlang, e = Abstand zur Mitte (0..1).
  capsule(x0, y0, x1, y1, r0, r1, shade) {
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1e-6;
    const rm = Math.max(r0, r1);
    for (let y = Math.floor(Math.min(y0, y1) - rm - 1); y <= Math.ceil(Math.max(y0, y1) + rm + 1); y++) {
      for (let x = Math.floor(Math.min(x0, x1) - rm - 1); x <= Math.ceil(Math.max(x0, x1) + rm + 1); x++) {
        const t = clamp(((x - x0) * dx + (y - y0) * dy) / L2, 0, 1);
        const px = x0 + dx * t, py = y0 + dy * t;
        const r = r0 + (r1 - r0) * t;
        const ex = x - px, ey = y - py, d = Math.hypot(ex, ey);
        if (d > r + 0.2) continue;
        const l = d < 0.01 ? 0.2 : (ex * LX + ey * LY) / d * Math.min(1, d / Math.max(0.6, r));
        this.set(x, y, shade(l, t, d / Math.max(0.5, r)));
      }
    }
  }
  ellipse(cx, cy, rx, ry, fn) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const nx = (x - cx) / rx, ny = (y - cy) / ry, d = nx * nx + ny * ny;
        if (d > 1.05) continue;
        const c = typeof fn === 'function' ? fn(nx, ny, d) : fn;
        if (c) this.set(x, y, c);
      }
    }
  }
  // Pixelbild aus Zeichenkette(n): map[ch] = Farbe
  stamp(x0, y0, rows, map, flipX = false) {
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      for (let i = 0; i < row.length; i++) {
        const c = map[row[i]];
        if (c) this.set(flipX ? x0 - i : x0 + i, y0 + j, c);
      }
    }
  }
  // Gedrehte Kopie um (px, py) – für Rolle und Sturz (nächster Nachbar)
  rotated(ang, px, py) {
    const out = new Raster();
    const c = Math.cos(-ang), s = Math.sin(-ang);
    for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
      const x = X - AX - px, y = Y - AY - py;
      const sx = Math.round(px + x * c - y * s) + AX, sy = Math.round(py + x * s + y * c) + AY;
      if (sx >= 0 && sy >= 0 && sx < W && sy < H) out.buf[Y * W + X] = this.buf[sy * W + sx];
    }
    return out;
  }
  blit(ctx) {
    ctx.putImageData(new ImageData(new Uint8ClampedArray(this.buf.buffer.slice(0)), W, H), 0, 0);
  }
}

// Schattierung für Glieder/Rundformen aus einer Farbrampe
const tone = (ramp, metal = false) => (l, t, e) => {
  if (metal && l > 0.62 && e > 0.3) return ramp[4] ?? ramp[3];
  if (l > 0.35) return ramp[3];
  if (l > -0.35) return ramp[2];
  return ramp[1];
};
const dimRamp = (r) => [r[0], r[0], r[1], r[2], r[3]];

// Zweigelenk-IK: Gelenkpunkt zwischen a (Wurzel) und b (Ziel), bend = ±1
function ik(ax, ay, bx, by, l1, l2, bend) {
  let dx = bx - ax, dy = by - ay;
  let d = Math.hypot(dx, dy) || 0.001;
  const max = l1 + l2 - 0.05;
  if (d > max) { bx = ax + dx / d * max; by = ay + dy / d * max; dx = bx - ax; dy = by - ay; d = max; }
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const base = Math.atan2(dy, dx), a = base - bend * Math.acos(cosA);
  return { jx: ax + Math.cos(a) * l1, jy: ay + Math.sin(a) * l1, ex: bx, ey: by };
}

// --- Aussehen auflösen -------------------------------------------------------------
// Verbindet Volk, Klasse, Farbvariante und Ausrüstung zu einem Zeichen-Setup.
function resolveLook(raceId, classId, variant, gear, style) {
  const rl = RACE_LOOK[raceId] ?? RACE_LOOK.human;
  const cl = CLASS_LOOK[classId] ?? CLASS_LOOK.warrior;
  const V = rl.variants[variant] ?? rl.variants[0];
  const g = gear ?? {};
  const chest = { ...(g.chest ?? cl.chest) };
  const allowed = CLASS_WEAPONS[classId] ?? CLASS_WEAPONS.warrior;
  let weapon = g.weapon && allowed.includes(g.weapon.family) ? g.weapon : null;
  let sideArm = null;
  if (classId === 'ranger' && weapon?.family === 'dagger') { sideArm = weapon; weapon = null; }
  weapon ??= cl.weapon;
  const off = classId === 'rogue' ? (weapon.family === 'dagger' ? weapon : cl.weapon) : null;
  const head = g.head ?? null;
  // Kosmetik: Färbung für Stoff (Umhang, Kapuze, Robe, Wams), Frisur je Volk
  const dye = style?.dye ? DYES[style.dye]?.ramp : null;
  if (dye && (chest.style === 'robe' || chest.style === 'padded')) chest.ramp = chest.style === 'robe' ? [dye[0], dye[0], dye[1], dye[2], dye[3]] : dye;
  const hairStyle = style?.hairStyle && hairStylesFor(raceId).includes(style.hairStyle) ? style.hairStyle : rl.hairStyle;
  return {
    hairStyle,
    raceId, classId, rl, cl, body: rl.body,
    skin: rl.skin, hair: V.hair, accent: V.accent ?? PAL.ember,
    cloth: dye ?? cl.cloth, trim: chest.trim ?? cl.trim,
    chest, weapon, off, sideArm, head,
    gloves: g.hands?.ramp ?? cl.gloves, glovesMetal: g.hands ? (g.hands.style === 'plate' || g.hands.style === 'mail') : false,
    glovesGlow: g.hands?.glow ?? null,
    boots: g.feet?.ramp ?? cl.boots, bootsMetal: g.feet ? g.feet.style === 'plate' : false,
    bootsGlow: g.feet?.glow ?? null,
    hood: cl.hood && !head, cowl: cl.cowl, circlet: cl.circlet && !head,
    back: cl.back, quiver: cl.quiver, offKind: cl.off,
  };
}

// --- Pose ---------------------------------------------------------------------------
// hipX/hipY: Hüftversatz (hipY > 0 = tiefer), lean: Schulter nach vorne (px),
// breath: Oberkörper tiefer (px), footN/footF: [x, Höhe] naher/ferner Fuß,
// handM/handO: Hand relativ zur nahen/fernen Schulter, wM/wO: Waffenwinkel,
// head: [dx, dy], cape: Aufwehen 0..1, wave: Wellenphase, hurt, glow, handGlow,
// draw: Bogenspannung 0..1, arrow: Pfeil eingelegt, reach: Waffenverkürzung (Drehung),
// kneel: nahes Knie am Boden.
const BASE_POSE = {
  hipX: 0, hipY: 0, lean: 0, breath: 0,
  footN: [1.5, 0], footF: [-2, 0],
  handM: [2, 6], handO: [1, 6], wM: -0.8, wO: 0.6,
  head: [0, 0], cape: 0.15, wave: 0, hurt: 0, glow: 0.3, handGlow: 0, draw: 0, arrow: 0, reach: 1, reachO: 1,
  squint: 0,
};

function mixPose(a, b, t) {
  const o = {};
  for (const k of Object.keys(BASE_POSE)) {
    const va = a[k] ?? BASE_POSE[k], vb = b[k] ?? BASE_POSE[k];
    if (Array.isArray(va)) o[k] = [lerp(va[0], vb[0], t), lerp(va[1], vb[1], t)];
    else if (k === 'wM' || k === 'wO') o[k] = va + angleDelta(va, vb) * t;
    else o[k] = lerp(va, vb, t);
  }
  return o;
}
function angleDelta(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
const ease = (t) => t * t * (3 - 2 * t);

// --- Zeichnen: Figur ---------------------------------------------------------------------
function drawHero(R, G, L, pose) {
  const P = { ...BASE_POSE, ...pose };
  const B = L.body;
  const standHip = B.thigh + B.shin + B.ankle - 0.6;
  const hipY = Math.round(-standHip + P.hipY);
  const hipX = P.hipX;
  const topY = Math.round(hipY - B.torso + P.breath);
  const lean = Math.round(P.lean);
  const cxAt = (y) => hipX + lean * clamp((hipY - y) / (hipY - topY), 0, 1);
  const shX = cxAt(topY);
  const sk = {
    hipX, hipY, topY, lean, cxAt, B,
    shN: { x: shX + B.front * 0.3, y: topY + 1.5 },
    shF: { x: shX - B.back * 0.35, y: topY + 1.5 },
    neck: { x: Math.round(shX + 0.5 + P.head[0]), y: Math.round(topY - B.neck + P.head[1]) },
  };

  // 1) Hinten: Umhang, Mantel, Köcher, langes Haar
  if (L.back === 'cape' || L.back === 'cloak') drawCape(R, L, P, sk);
  if (L.quiver) drawQuiver(R, L, sk);
  drawHairBack(R, L, P, sk);

  // 2) Ferner Arm (hinter dem Körper) + Nebenhanddolch
  const handF = { x: sk.shF.x + P.handO[0], y: sk.shF.y + P.handO[1] };
  const armF = ik(sk.shF.x, sk.shF.y, handF.x, handF.y, B.arm[0], B.arm[1], -1);
  const frontOff = L.offKind === 'shield' || L.offKind === 'bow';
  if (!frontOff) {
    if (L.off) drawWeapon(R, G, L.off, armF.ex, armF.ey, P.wO, P, true, P.reachO);
    drawArm(R, L, sk.shF, armF, true);
    if (L.offKind === 'hand' && P.handGlow > 0) handGlow(R, G, L, armF.ex, armF.ey, P.handGlow);
  }

  // 3) Fernes Bein
  drawLeg(R, L, P, sk, false);
  // 4) Rumpf
  drawTorso(R, L, P, sk);
  // 5) Nahes Bein
  drawLeg(R, L, P, sk, true);
  // 6) Rock, Waffenrock, Gürtel
  drawLower(R, L, P, sk);
  if (L.sideArm) drawSheath(R, L.sideArm, sk);
  // 7) Kopf
  drawHead(R, G, L, P, sk);
  // 8) Schulterstück
  drawPauldron(R, L, sk);
  if (L.back === 'scarf') drawScarf(R, L, P, sk);

  // 9) Schild oder Bogen vorne (ferne Hand)
  if (L.offKind === 'shield') {
    drawArm(R, L, sk.shF, armF, true);
    drawShield(R, L, armF.ex, armF.ey, P);
  }
  let bow = null;
  if (L.offKind === 'bow') {
    drawArm(R, L, sk.shF, armF, true);
    bow = { x: armF.ex, y: armF.ey };
  }

  // 10) Waffenarm
  let hand = { x: sk.shN.x + P.handM[0], y: sk.shN.y + P.handM[1] };
  if (bow) {
    // Zughand: am Bogen (Ruhe) oder an der Sehne (gespannt)
    const pull = P.draw;
    const ca = Math.cos(P.wO), sa = Math.sin(P.wO), sd = -1 - pull * 7;
    if (pull > 0.05 || P.arrow > 0.5) hand = { x: bow.x + sd * ca, y: bow.y + sd * sa };
    const armN = ik(sk.shN.x, sk.shN.y, hand.x, hand.y, B.arm[0], B.arm[1], -1);
    drawBow(R, G, L.weapon, bow.x, bow.y, pull, P.arrow > 0.5, P.wO);
    drawHand(R, L, bow.x, bow.y, true);
    drawArm(R, L, sk.shN, armN, false);
  } else {
    const armN = ik(sk.shN.x, sk.shN.y, hand.x, hand.y, B.arm[0], B.arm[1], -1);
    const behind = L.weapon.family === 'staff';
    if (P.smear) drawSmear(R, L, armN.ex, armN.ey, P.smear[0], P.smear[1]);
    if (behind) drawWeapon(R, G, L.weapon, armN.ex, armN.ey, P.wM, P, false, P.reach);
    if (!behind) drawWeapon(R, G, L.weapon, armN.ex, armN.ey, P.wM, P, false, P.reach);
    drawArm(R, L, sk.shN, armN, false);
    if (L.weapon.family === 'wand' || L.weapon.family === 'staff') drawGrip(R, L, L.weapon, armN.ex, armN.ey, P.wM);
  }
}

// Wischspur der Waffe von Winkel a0 (alt) nach a1 (aktuell), um die Hand: eine Sichel, die zur
// aktuellen Waffenlage hin dicker wird. Außenkante hell, innen dunkler.
const SMEAR_LEN = { sword: 15, dagger: 7, axe: 15, mace: 15, staff: 15, wand: 8 };
function drawSmear(R, L, hx, hy, a0, a1) {
  const w = L.weapon;
  const len = (w.family === 'sword' || w.family === 'dagger' ? w.len : null) ?? SMEAR_LEN[w.family] ?? 12;
  const c = w.glow ?? (w.family === 'staff' || w.family === 'wand' ? L.trim : ['#2e2e38', '#5a5a68', '#9a9cac', '#d0d2dc', '#f4f4f8']);
  const rout = len + 1.5, body = Math.max(3, len * 0.5);
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) * rout * 1.5));
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = a0 + (a1 - a0) * t;
    const ca = Math.cos(a), sa = Math.sin(a);
    const thick = 1 + body * t * t;
    for (let d = 0; d <= thick; d += 0.6) {
      const r = rout - d;
      const col = d < 1.1 ? c[4] ?? c[3] : d < thick * 0.6 ? c[3] : c[2];
      R.set(Math.round(hx + ca * r), Math.round(hy + sa * r), col);
    }
  }
}

// --- Körperteile ----------------------------------------------------------------------------
function drawLeg(R, L, P, sk, near) {
  const B = sk.B, lw = B.limb;
  const foot = near ? P.footN : P.footF;
  const hx = sk.hipX + (near ? 0.9 : -0.9), hy = sk.hipY;
  const ax = foot[0], ay = -B.ankle - foot[1];
  const leg = ik(hx, hy, ax, ay, B.thigh, B.shin, 1);
  const st = L.chest.style;
  const pants = st === 'plate' ? L.chest.ramp : st === 'robe' ? L.cloth : st === 'leather' ? dimRamp(L.chest.ramp) : ['#1a1414', '#2a2020', '#3e302c', '#56443c', '#6e5a4e'];
  const ramp = near ? pants : dimRamp(pants);
  const metal = st === 'plate';
  R.capsule(hx, hy, leg.jx, leg.jy, 1.55 * lw, 1.3 * lw, tone(ramp, metal));
  R.capsule(leg.jx, leg.jy, leg.ex, leg.ey, 1.25 * lw, 1.05 * lw, tone(ramp, metal));
  if (metal || st === 'chain' || st === 'padded') {
    // Kniekachel
    const kr = st === 'plate' ? L.chest.ramp : L.chest.shoulder ?? M.iron;
    const k = near ? kr : dimRamp(kr);
    R.set(leg.jx + 0.6, leg.jy, k[3]); R.set(leg.jx + 0.6, leg.jy + 1, k[2]); R.set(leg.jx - 0.4, leg.jy, k[2]);
  }
  drawBoot(R, L, ax, ay, foot[1], near, leg);
}

function drawBoot(R, L, ax, ay, lift, near, leg) {
  const b = near ? L.boots : dimRamp(L.boots);
  const x = Math.round(ax), y = Math.round(ay);
  // Schaft über dem Knöchel
  R.capsule(leg.jx + (leg.ex - leg.jx) * 0.55, leg.jy + (leg.ey - leg.jy) * 0.55, leg.ex, leg.ey, 1.35 * L.body.limb, 1.35 * L.body.limb, tone(b, L.bootsMetal));
  // Fuß: Zehen nach vorne, angehobener Fuß kippt leicht
  const tilt = lift > 1.2 && ax < leg.jx - 0.5 ? 1 : 0;
  R.rect(x - 1, y, 3, 2, b[2]);
  R.set(x + 2, y + 1 + tilt, b[2]); R.set(x + 2, y + tilt, b[3]);
  R.set(x - 1, y, b[3]); R.set(x, y, b[3]);
  R.rect(x - 1, y + 1, 4, 1, b[1]);
  if (L.bootsMetal) R.set(x + 1, y, b[4] ?? b[3]);
  if (L.bootsGlow && near) R.set(x + 1, y - 1, L.bootsGlow[3]);
}

function drawArm(R, L, sh, arm, far) {
  const B = L.body, lw = B.limb;
  const st = L.chest.style;
  const sleeveBase = st === 'plate' ? L.chest.ramp : st === 'robe' ? L.chest.ramp : st === 'chain' ? L.chest.ramp : st === 'scale' ? L.chest.ramp : st === 'padded' ? L.chest.ramp : L.cloth;
  const sleeve = far ? dimRamp(sleeveBase) : sleeveBase;
  const metal = st === 'plate' || st === 'chain' || st === 'scale';
  R.capsule(sh.x, sh.y, arm.jx, arm.jy, 1.3 * lw, 1.1 * lw, tone(sleeve, metal));
  // Unterarm: Robe = weiter Ärmel, sonst Ärmel/Armschiene
  if (st === 'robe') {
    R.capsule(arm.jx, arm.jy, arm.ex, arm.ey, 1.1 * lw, 1.7 * lw, tone(sleeve));
    const cuff = far ? dimRamp(L.trim) : L.trim;
    R.set(arm.ex - (arm.ex - arm.jx) * 0.2, arm.ey - (arm.ey - arm.jy) * 0.2 + 1, cuff[2]);
  } else {
    const gl = L.gloves ?? L.skin;
    const bracer = far ? dimRamp(gl) : gl;
    R.capsule(arm.jx, arm.jy, arm.ex, arm.ey, 1.1 * lw, 1.05 * lw, tone(sleeve, metal));
    const mx = lerp(arm.jx, arm.ex, 0.45), my = lerp(arm.jy, arm.ey, 0.45);
    if (L.gloves) R.capsule(mx, my, arm.ex, arm.ey, 1.15 * lw, 1.1 * lw, tone(bracer, L.glovesMetal));
  }
  drawHand(R, L, arm.ex, arm.ey, far);
}

function drawHand(R, L, x, y, far) {
  const base = L.gloves ?? L.skin;
  const h = far ? dimRamp(base) : base;
  const X = Math.round(x), Y = Math.round(y);
  R.rect(X - 1, Y - 1, 2, 2, h[2]);
  R.set(X - 1, Y - 1, h[3]);
  R.set(X, Y, h[1]);
  if (L.glovesGlow && !far) R.set(X, Y - 1, L.glovesGlow[3]);
}

function handGlow(R, G, L, x, y, k) {
  const T = L.trim;
  R.set(x + 1, y - 2, T[4] ?? T[3]); R.set(x, y - 3, T[3]); R.set(x + 2, y - 3, T[2]);
  G.push({ x: Math.round(x + 1), y: Math.round(y - 2), color: T[4] ?? T[3], r: 1.5 + k * 2.5 });
}

// Rumpf zeilenweise: Brust breit, Taille schmal, Material je Stil
function drawTorso(R, L, P, sk) {
  const { topY, hipY, B } = sk;
  const C = L.chest, st = C.style, A = C.ramp;
  const rows = hipY - topY + 1;
  for (let r = 0; r < rows; r++) {
    const y = topY + r, v = r / Math.max(1, rows - 1);
    const cx = sk.cxAt(y);
    const back = B.back * (v < 0.1 ? 0.78 : v < 0.55 ? 1 : 1 - (v - 0.55) * 0.35);
    const front = B.front * (v < 0.1 ? 0.7 : v < 0.45 ? 1 : 1 - (v - 0.45) * 0.3);
    const x0 = Math.round(cx - back), x1 = Math.round(cx + front);
    for (let x = x0; x <= x1; x++) {
      const u = (x - x0) / Math.max(1, x1 - x0); // 0 = Rücken, 1 = Brust
      R.set(x, y, torsoColor(L, st, A, u, v, x, y, r, rows, x0, x1));
    }
  }
  // Details
  const cxTop = sk.cxAt(topY);
  const midX = (y) => Math.round(sk.cxAt(y) + B.front * 0.35);
  if (st === 'plate') {
    // Brustglanz, Bauchreifen
    R.set(midX(topY + 2) - 1, topY + 2, A[4]); R.set(midX(topY + 2) - 2, topY + 3, A[4]);
    for (const k of [0.62, 0.78]) {
      const y = Math.round(lerp(topY, hipY, k));
      for (let x = Math.round(sk.cxAt(y) - B.back + 1); x <= Math.round(sk.cxAt(y) + B.front); x++) R.set(x, y, A[1]);
    }
    if (C.tabard) {
      for (let y = topY + 3; y <= hipY; y++) { const x = midX(y); R.set(x, y, C.tabard[2]); R.set(x + 1, y, C.tabard[1]); }
    }
    if (C.emblem) { const x = midX(topY + 3); R.set(x, topY + 3, C.emblem[3]); R.set(x + 1, topY + 3, C.emblem[2]); }
  } else if (st === 'chain') {
    if (C.tabard || L.classId === 'warrior') {
      const T = C.tabard ?? L.cloth;
      for (let y = topY + 2; y <= hipY; y++) { const x = midX(y); R.set(x - 1, y, T[3]); R.set(x, y, T[2]); R.set(x + 1, y, T[1]); }
      R.set(midX(topY + 4), topY + 4, L.trim[3]);
    }
  } else if (st === 'padded') {
    // Steppnähte und Wappen
    for (let y = topY + 2; y < hipY - 1; y += 2) for (let x = Math.round(sk.cxAt(y) - B.back + 1); x <= Math.round(sk.cxAt(y) + B.front - 1); x += 2) R.set(x, y, A[1]);
    const x = midX(topY + 3);
    R.set(x, topY + 3, L.trim[3]); R.set(x, topY + 4, L.trim[2]); R.set(x - 1, topY + 4, L.trim[2]); R.set(x + 1, topY + 4, L.trim[2]); R.set(x, topY + 5, L.trim[1]);
  } else if (st === 'leather') {
    // Schnürung vorne, Kragen aus Stoff, Brustgurt
    const cl = L.cloth;
    R.set(Math.round(cxTop + B.front - 1), topY, cl[3]); R.set(Math.round(cxTop + B.front - 2), topY, cl[2]); R.set(Math.round(cxTop + B.front - 1), topY + 1, cl[2]);
    for (let y = topY + 2; y < hipY - 1; y += 2) R.set(Math.round(sk.cxAt(y) + B.front - 1), y, A[4] ?? A[3]);
    for (let i = 0; i <= rows - 3; i++) {
      const y = topY + i, x = Math.round(lerp(sk.cxAt(topY) - B.back + 1, sk.cxAt(hipY) + B.front - 1, i / (rows - 3)));
      R.set(x, y, M.leather[1]); R.set(x + 1, y, M.leather[3]);
      if (i === Math.round((rows - 3) / 2)) R.set(x + 1, y, L.trim[3]);
    }
    if (C.fur) { const x0 = Math.round(cxTop - B.back); for (let x = x0; x <= x0 + 3; x++) R.set(x, topY - 1 + (x & 1), C.fur[(x & 1) + 2]); }
    if (C.emblem) R.set(midX(topY + 3), topY + 3, C.emblem[3]);
  } else if (st === 'scale') {
    for (let y = topY + 1; y < hipY - 1; y++) for (let x = Math.round(sk.cxAt(y) - B.back + 1); x <= Math.round(sk.cxAt(y) + B.front); x++) {
      if (((x + (y >> 1)) & 1) === 0 && (y & 1) === 0) R.set(x, y, A[1]);
    }
  } else if (st === 'robe') {
    // V-Ausschnitt mit Borte, Emblem
    const T = C.trim ?? L.trim;
    const nx = Math.round(cxTop + B.front * 0.4);
    R.set(nx, topY, L.skin[2]); R.set(nx + 1, topY, L.skin[1]); R.set(nx, topY + 1, L.skin[1]);
    for (let i = 0; i < 3; i++) { R.set(nx - 1 - (i > 1 ? 1 : 0), topY + i, T[2]); R.set(nx + 1 + (i > 0 ? 1 : 0), topY + i + 1, T[1]); }
    for (let y = topY + 3; y <= hipY; y++) R.set(midX(y) + 1, y, T[2]);
    if (C.emblem) { const x = midX(topY + 4) - 1; R.set(x, topY + 4, C.emblem[3]); R.set(x, topY + 5, C.emblem[2]); }
  }
  if (C.glow) {
    const x = midX(topY + 3);
    R.set(x, topY + 4, C.glow[3]);
    sk.chestGlow = { x, y: topY + 4, color: C.glow[3] };
  }
  // Gürtel
  const by = hipY - 1;
  if (st !== 'robe' || true) {
    const belt = st === 'robe' ? L.cloth : M.leather;
    for (let x = Math.round(sk.cxAt(by) - B.back); x <= Math.round(sk.cxAt(by) + B.front); x++) R.set(x, by, belt[st === 'robe' ? 3 : 1]);
    const bx = Math.round(sk.cxAt(by) + B.front - 1);
    const buckle = st === 'robe' ? L.trim : C.trim ?? M.gold;
    R.set(bx, by, buckle[3]);
    if (st !== 'robe') R.set(bx - 3, by + 1, M.leather[2]), R.set(bx - 3, by + 2, M.leather[1]); // Tasche
  }
}

function torsoColor(L, st, A, u, v, x, y, r, rows, x0, x1) {
  // Grundschattierung: oben/hinten heller (Licht oben links), Brustseite dunkler, unten dunkler
  const top = r === 0;
  const edgeBack = x === x0, edgeFront = x === x1;
  let i = 2;
  if (u < 0.3 && v < 0.6) i = 3;
  if (u > 0.78 || v > 0.85) i = 1;
  if (top && !edgeFront) i = 3;
  if (edgeFront) i = 1;
  if (edgeBack && v > 0.2) i = 2;
  if (st === 'plate') {
    if (u > 0.45 && u < 0.6 && v < 0.55) i = 3;       // Grat der Brustplatte
    if (top && u > 0.2 && u < 0.5) i = 4;
  } else if (st === 'chain') {
    // Kettengeflecht
    if ((x + y) & 1) i = Math.max(1, i - 1);
  } else if (st === 'robe' || st === 'padded' || st === 'leather') {
    if (i === 4) i = 3;
  }
  return A[clamp(i, 0, A.length - 1)];
}

// Unterteil: Robe (Rock bis zu den Knöcheln), Waffenrock/Kettenschurz, Beintaschen
function drawLower(R, L, P, sk) {
  const st = L.chest.style, B = sk.B;
  const hy = sk.hipY;
  const cx = sk.cxAt(hy);
  const fN = P.footN[0], fF = P.footF[0];
  if (st === 'robe') {
    const A = L.chest.ramp, T = L.chest.trim ?? L.trim;
    const bot = -1 - Math.min(P.footN[1], P.footF[1]) * 0.5;
    const top = hy - 1;
    const front0 = cx + B.front - 0.5, back0 = cx - B.back + 0.5;
    const frontB = Math.max(fN, fF) + 2.2, backB = Math.min(fN, fF) - 2.2 - P.cape * 2;
    const n = Math.max(1, Math.round(bot - top));
    for (let j = 0; j <= n; j++) {
      const y = top + j, k = j / n;
      const xa = Math.round(lerp(back0, backB, k)), xb = Math.round(lerp(front0, frontB, k));
      for (let x = xa; x <= xb; x++) {
        const u = (x - xa) / Math.max(1, xb - xa);
        let c = A[u < 0.25 ? 3 : u > 0.8 ? 1 : 2];
        // Falten
        if (k > 0.3 && Math.round(x - lerp(cx, (fN + fF) / 2, k)) % 3 === 0) c = A[1];
        if (j === n || j === n - 1 && (x & 1)) c = T[j === n ? 2 : 1];
        R.set(x, y, c);
      }
      // Vorderkante mit Borte
      R.set(Math.round(lerp(cx + B.front * 0.35 + 1, (fN + frontB) / 2, k)), y, T[2]);
    }
    return;
  }
  // Waffenrock-/Kettenschurz über den Oberschenkeln
  const skirt = st === 'plate' ? L.chest.ramp : st === 'chain' ? L.chest.ramp : st === 'scale' ? L.chest.ramp : st === 'padded' ? L.chest.ramp : L.chest.ramp;
  const len = st === 'leather' ? 2 : 3;
  for (let j = 0; j < len; j++) {
    const y = hy + j;
    const xa = Math.round(cx - B.back + 0.5 - j * 0.3 + Math.min(0, fF) * 0.15 * j), xb = Math.round(cx + B.front - 0.5 + Math.max(0, fN) * 0.2 * j);
    for (let x = xa; x <= xb; x++) {
      let i = x - xa < 1 ? 3 : xb - x < 1 ? 1 : 2;
      if (st === 'chain' && ((x + y) & 1)) i = 1;
      if (st === 'plate' && j === 1) i = Math.max(1, i - 1);
      if (j === len - 1 && ((x - xa) % 3 === 2)) continue;
      R.set(x, y, skirt[i]);
    }
  }
  if (L.classId === 'warrior' || L.chest.tabard) {
    // Wappenrock-Latz vorne
    const T = L.chest.tabard ?? L.cloth;
    const x = Math.round(cx + B.front * 0.35);
    for (let j = 0; j < 5; j++) { R.set(x - 1 + (j > 3 ? 1 : 0), hy + j, T[2]); R.set(x + (j > 3 ? 1 : 0), hy + j, T[1]); }
    R.set(x - 1, hy + 4, L.trim[2]);
  }
}

function drawPauldron(R, L, sk) {
  const st = L.chest.style;
  const S = L.chest.shoulder;
  const x = Math.round(sk.shN.x), y = Math.round(sk.topY);
  if (st === 'plate' || (S && st !== 'leather')) {
    const A = S ?? L.chest.ramp;
    const big = st === 'plate' ? 1 : 0;   // Platte: breiteres, gestuftes Schulterstück
    R.ellipse(x, y + 1, 2.6 + big * 0.8, 2 + big * 0.4, (nx, ny) => (nx * LX + ny * LY > 0.3 ? A[3] : nx * LX + ny * LY > -0.3 ? A[2] : A[1]));
    R.set(x - 1, y - 1, A[4] ?? A[3]);
    for (let i = -2 - big; i <= 2 + big; i++) R.set(x + i, y + 2 + big, A[1]);
    R.set(x + 2, y + 3 + big, A[2]); R.set(x - 2, y + 3 + big, A[2]); R.set(x, y + 3 + big, A[2]);
    if (L.trim && st === 'plate') { R.set(x + 1, y, L.trim[3]); for (let i = -2; i <= 2; i++) R.set(x + i, y + 1 + big, L.trim[2]); }
    if (L.chest.spikes) {
      const Sp = L.chest.glow ?? A;
      R.set(x - 1, y - 2, A[3]); R.set(x - 2, y - 3, Sp[3]); R.set(x + 1, y - 2, A[3]); R.set(x + 1, y - 3, Sp[4] ?? Sp[3]);
    }
  } else if (st === 'leather') {
    const A = S ?? L.chest.ramp;
    R.rect(x - 2, y, 4, 2, A[2]); R.rect(x - 2, y, 3, 1, A[3]); R.set(x + 1, y + 1, A[1]);
    if (L.chest.fur) { R.set(x - 2, y - 1, L.chest.fur[3]); R.set(x - 1, y - 1, L.chest.fur[2]); R.set(x, y - 1, L.chest.fur[3]); }
  } else if (st === 'robe') {
    const A = L.chest.ramp, T = L.chest.trim ?? L.trim;
    R.rect(x - 2, y, 4, 2, A[3]); R.set(x + 1, y + 1, A[2]); R.set(x - 2, y + 1, T[2]); R.set(x + 1, y + 2, T[2]);
  }
}

function drawCape(R, L, P, sk) {
  const C = L.cloth, B = sk.B;
  const cloak = L.back === 'cloak';
  const top = sk.topY - (cloak ? 1 : 0);
  const sx = sk.cxAt(top) - B.back + 1;
  const hemY = cloak ? -2 : -4;
  const flare = P.cape;
  const hemBack = sx - 2 - flare * 7 - (cloak ? 1 : 0);
  const hemFront = sk.hipX - 1 - flare * 2;
  const rows = Math.max(1, hemY - top);
  for (let j = 0; j <= rows; j++) {
    const k = j / rows, y = top + j;
    const wave = Math.sin(P.wave + j * 0.35) * k * (0.6 + flare * 1.2);
    const xa = Math.round(lerp(sx, hemBack, Math.pow(k, 0.8)) + wave), xb = Math.round(lerp(sk.cxAt(y) + 0.5, hemFront, k));
    for (let x = xa; x <= xb; x++) {
      const u = (x - xa) / Math.max(1, xb - xa);
      let c = C[u < 0.2 ? 3 : u > 0.7 ? 1 : 2];
      if (k > 0.25 && Math.round((x - xa) + k * 2 + P.wave * 0.6) % 3 === 0) c = C[1]; // Falten
      if (j === rows) c = ((x + Math.round(P.wave)) & 1) ? C[1] : C[0];
      R.set(x, y, c);
    }
  }
  if (!cloak) { R.set(Math.round(sx), top, L.trim[3]); } // Schließe
}

function drawQuiver(R, L, sk) {
  const x = Math.round(sk.cxAt(sk.topY) - sk.B.back - 1), y = sk.topY - 3;
  // schräg über dem Rücken
  for (let j = 0; j < 10; j++) {
    const xx = x + Math.round(j * 0.35);
    R.set(xx, y + j, M.leather[2]); R.set(xx + 1, y + j, M.leather[3]); R.set(xx - 1, y + j, M.leather[1]);
  }
  R.set(x + 1, y + 3, L.trim[3]); R.set(x + 2, y + 7, L.trim[2]);
  // Befiederung
  R.set(x - 1, y - 1, '#e8e0d0'); R.set(x, y - 2, '#c83a2a'); R.set(x + 1, y - 1, '#e8e0d0'); R.set(x + 2, y - 2, '#d8d0c0');
}

function drawScarf(R, L, P, sk) {
  const C = L.cloth;
  const x0 = sk.neck.x - 2, y0 = sk.neck.y + 1;
  for (let i = 0; i < 7; i++) {
    const x = x0 - i, y = y0 + Math.round(Math.sin(P.wave * 1.3 + i * 0.9) * (0.6 + P.cape)) + (i >> 1);
    R.set(x, y, C[i < 3 ? 3 : 2]); R.set(x, y + 1, C[1]);
  }
  R.rect(sk.neck.x - 2, y0 - 1, 4, 2, C[3]); R.set(sk.neck.x + 1, y0, C[2]);
}

function drawSheath(R, w, sk) {
  const x = Math.round(sk.cxAt(sk.hipY) - sk.B.back), y = sk.hipY - 1;
  R.line(x, y, x - 3, y + 4, M.leather[2]); R.set(x + 1, y - 1, (w.guard ?? M.iron)[3]); R.set(x + 1, y - 2, M.leather[1]);
}

// --- Kopf -----------------------------------------------------------------------------
// Gesichter in Dreiviertelansicht (nach rechts), 9×9, Anker: Halsansatz = Spalte 4, unter Zeile 8.
// s/S/L Haut dunkel/mittel/hell, k Hautschatten, e Auge, w Glanz, b Braue, m Mund, n Nase
const FACES = {
  human: [
    '...SSS...',
    '..SSSSS..',
    '.SSSSSSS.',
    '.SSSSSSSL',
    '.sSSSbSSb',
    '.sSSSeSSe',
    '.ksSSSSSn',
    '..ksSSSm.',
    '...kssS..',
  ],
  elf: [
    '...SSS...',
    '..SSSSS..',
    '.SSSSSSS.',
    '.SSSSSSSL',
    '.sSSSbSbb',
    '.sSSSeSSe',
    '.ksSSSSSn',
    '..ksSSSm.',
    '....ksS..',
  ],
  dwarf: [
    '...SSS...',
    '..SSSSS..',
    '.SSSSSSS.',
    '.SSSSSSSS',
    '.sSSSbbbb',
    '.sSSSeSSe',
    '.ksSSSSnn',
    '..ksSSSnn',
    '...kssS..',
  ],
  emberborn: [
    '...SSS...',
    '..SSSSS..',
    '.SSSSSSS.',
    '.SSSSSSSL',
    '.sSSSbSbb',
    '.sSaSeSSe',
    '.ksSaSSSn',
    '..ksSSSm.',
    '...kssS..',
  ],
};
// Frisuren: h/H/G/g = Haar dunkel..hell, t = Akzent (Glutspitzen). Gleiches Raster wie FACES,
// Zeilen darüber mit negativem Index über extraTop.
const HAIR = {
  short: { top: 1, rows: [
    '...HHGH..',
    '..HHGGgH.',
    '.HHHGGGHG',
    'hHHHGGHHH',
    'hHHHH..H.',
    'hhHH.....',
    'hhH......',
    '.h.......',
  ] },
  long: { top: 1, rows: [
    '..HHHGH..',
    '.HHHGGgH.',
    'HHHGGGGHG',
    'HHHHGGHH.',
    'HHHHH..H.',
    'hHHH.....',
    'hhHH.....',
    'hhH......',
    'hh.......',
  ] },
  dwarf: { top: 1, rows: [
    '..HHGH...',
    '.HHGGgH..',
    'HHHGGGHH.',
    'hHHHGHH..',
    'hHHH.....',
    'hhH......',
    'hh.......',
  ] },
  crop: { top: 1, rows: [
    '...hHH...',
    '..hHHGH..',
    '.hHHGGH..',
    'hhHH...h.',
    'hh.......',
  ] },
  tail: { top: 1, rows: [
    '...HHGH..',
    '..HHGGgH.',
    '.HHHGGGHG',
    'hHHHGGHH.',
    'hHHH...H.',
    'hhH......',
  ] },
  mohawk: { top: 4, rows: [
    '....tt...',
    '...tHGt..',
    '...HHGg..',
    '..hHGGH..',
    '.hhHGGH..',
    'hh.hHH...',
    'h........',
  ] },
  mane: { top: 3, rows: [
    '...t.t...',
    '..tH.Ht..',
    '..HHHGt..',
    '.HHHGGHH.',
    'hHHGGGHH.',
    'hHHHHHH..',
    'thHHH....',
    'hhH......',
    'thh......',
    '.h.......',
  ] },
};

function drawHairBack(R, L, P, sk) {
  if (L.hairStyle === 'tail' && !L.hood && !(L.head && L.head.style !== 'cap')) {
    // Zopf: vom Hinterkopf, schwingt mit dem Umhang
    const h = L.hair, x = sk.neck.x - 4, y = sk.neck.y - 7;
    const sw = P.cape * 2.5;
    R.set(x, y, L.trim[2]);
    for (let j = 1; j < 8; j++) {
      const xx = Math.round(x - 1 - j * 0.35 * (1 + sw * 0.6));
      R.set(xx, y + j, h[j & 1 ? 1 : 2]); if (j < 6) R.set(xx + 1, y + j, h[0]);
    }
    return;
  }
  if (L.hairStyle !== 'long' || L.hood || (L.head && L.head.style !== 'cap')) return;
  const h = L.hair, x = sk.neck.x - 4, y = sk.neck.y - 6;
  const sw = Math.round(P.cape * 2);
  for (let j = 0; j < 9; j++) {
    const xx = x - Math.round(j * 0.25 * (1 + P.cape)) - (j > 5 ? sw : 0);
    R.set(xx, y + j, h[1]); R.set(xx + 1, y + j, h[2]); R.set(xx - 1, y + j, h[0]);
  }
}

function drawHead(R, G, L, P, sk) {
  const x0 = sk.neck.x - 4, y0 = sk.neck.y - 9;
  const S = L.skin, Hh = L.hair, acc = L.accent;
  const hurt = P.hurt > 0.5;
  const eyeCol = L.rl.cracks ? (hurt ? '#ffffff' : acc[4]) : hurt ? S[0] : SKIN_DARK;
  const face = FACES[L.rl.face] ?? FACES.human;
  R.stamp(x0, y0, face, {
    S: S[2], s: S[1], L: S[3], k: S[0], e: eyeCol, b: L.rl.cracks ? S[0] : Hh[0], m: S[0], n: S[3], a: acc[2],
  });
  if (hurt) { R.set(x0 + 5, y0 + 5, S[0]); R.set(x0 + 8, y0 + 5, S[0]); R.set(x0 + 7, y0 + 7, S[0]); }
  if (L.rl.cracks) {
    G.push({ x: x0 + 8, y: y0 + 5, color: acc[4], r: 1.5 });
    R.set(x0 + 5, y0 + 5, acc[3]);
  }
  // Hals
  R.set(sk.neck.x, sk.neck.y, S[1]); R.set(sk.neck.x + 1, sk.neck.y, S[1]);
  // Bart (Zwerg)
  if (L.rl.beard) {
    const B = [
      '.....hHGG',
      '....hHHGG',
      '...hHHGHG',
      '...hHHHG.',
      '....hHHG.',
      '.....hH..',
      '......h..',
    ];
    R.stamp(x0, y0 + 6, B, { h: Hh[0], H: Hh[1], G: Hh[2], g: Hh[3] });
    R.set(x0 + 7, y0 + 6, Hh[3]); R.set(x0 + 8, y0 + 6, Hh[2]);
    if (L.classId === 'warrior' || L.classId === 'rogue') R.set(x0 + 6, y0 + 10, L.trim[3]); // Bartring
  }

  const helm = L.head;
  if (L.hood) drawHood(R, L, x0, y0, P);
  else if (helm && helm.style !== 'cap') drawHelm(R, G, L, helm, x0, y0);
  else {
    const hs = HAIR[L.hairStyle] ?? HAIR.short;
    const swing = Math.round(P.cape);
    const rows = hs.rows.map((r, j) => (j >= hs.top + 5 && swing ? r.slice(swing) + '.'.repeat(0) : r));
    R.stamp(x0 - (0), y0 - hs.top, rows, { h: Hh[0], H: Hh[1], G: Hh[2], g: Hh[3], t: L.rl.cracks ? acc[3] : Hh[3] });
    if (L.hairStyle === 'mane' || (L.hairStyle === 'mohawk' && L.rl.cracks)) {
      G.push({ x: x0 + 3, y: y0 - 3, color: acc[3], r: 1 });
    }
    if (helm?.style === 'cap') drawHelm(R, G, L, helm, x0, y0);
  }
  // Ohren (über dem Haar)
  if (!L.hood && !(helm && helm.style !== 'cap')) {
    if (L.rl.ears) {
      R.set(x0 + 3, y0 + 5, S[2]); R.set(x0 + 2, y0 + 4, S[2]); R.set(x0 + 1, y0 + 3, S[2]); R.set(x0, y0 + 2, S[3]); R.set(x0 - 1, y0 + 1, S[3]); R.set(x0 - 2, y0, S[3]); R.set(x0 + 2, y0 + 5, S[1]); R.set(x0 + 1, y0 + 4, S[1]); R.set(x0, y0 + 3, S[1]);
    } else {
      R.set(x0 + 3, y0 + 5, S[2]); R.set(x0 + 3, y0 + 6, S[1]);
    }
  }
  if (L.rl.horns && !(L.hood)) {
    const Bn = M.bone;
    const hx = x0 + 4, hy = y0;
    R.set(hx, hy - 1, Bn[2]); R.set(hx - 1, hy - 2, Bn[3]); R.set(hx - 2, hy - 3, Bn[3]); R.set(hx - 3, hy - 3, Bn[2]); R.set(hx - 4, hy - 2, Bn[1]);
    R.set(hx - 1, hy - 1, Bn[1]); R.set(hx - 2, hy - 2, Bn[2]);
  } else if (L.rl.horns && L.hood) {
    R.set(x0 + 3, y0 - 2, M.bone[3]); R.set(x0 + 2, y0 - 3, M.bone[2]);
  }
  if (L.circlet) {
    const T = L.trim;
    for (let i = 4; i <= 7; i++) R.set(x0 + i, y0 + 3, T[i < 6 ? 1 : 2]);
    R.set(x0 + 7, y0 + 3, T[4] ?? T[3]);
    G.push({ x: x0 + 7, y: y0 + 3, color: T[4] ?? T[3], r: 1.5 });
  }
  if (L.cowl && !helm) {
    const C = L.cloth;
    R.rect(x0 + 1, y0 + 8, 6, 2, C[2]); R.rect(x0 + 1, y0 + 8, 5, 1, C[3]); R.set(x0, y0 + 7, C[2]); R.set(x0, y0 + 8, C[1]); R.set(x0 + 1, y0 + 7, C[3]);
  }
}

function drawHood(R, L, x0, y0, P) {
  const C = L.cloth;
  const rows = [
    '...HHHG...',
    '..HHHGGG..',
    '.HHHHGGGG.',
    'HHHHHGGGgs',
    'HHHHHkkkks',
    'hHHHHk..ks',
    'hHHHk...ks',
    'hhHHk..mmm',
    '.hHHHmmmmm',
    '..hHHmmmm.',
  ];
  R.stamp(x0 - 1, y0 - 1, rows, { h: C[0], H: C[1], G: C[2], g: C[3], k: '#0c0810', s: C[1], m: C[1] });
  // Augen im Schatten
  const eye = L.rl.cracks ? L.accent[4] : '#d8d0c0';
  R.set(x0 + 5, y0 + 5, eye); R.set(x0 + 7, y0 + 5, eye);
  R.set(x0 + 6, y0 + 5, L.skin[1]); R.set(x0 + 8, y0 + 5, L.skin[2]);
  R.set(x0 + 6, y0 + 4, L.skin[0]); R.set(x0 + 7, y0 + 4, L.skin[1]);
  // Zipfel
  R.set(x0 - 2, y0 + 3 + Math.round(P.cape), C[1]); R.set(x0 - 3, y0 + 4 + Math.round(P.cape), C[0]);
}

function drawHelm(R, G, L, helm, x0, y0) {
  const A = helm.ramp;
  if (helm.style === 'cap') {
    const rows = [
      '..HHGG...',
      '.HHGGgG..',
      'HHHGGGGG.',
      'hhhhhhhhh',
    ];
    R.stamp(x0, y0 - 1, rows, { h: A[1], H: A[2], G: A[3], g: A[4] ?? A[3] });
    return;
  }
  if (helm.style === 'hood') {
    drawHood(R, { ...L, cloth: A }, x0, y0, { cape: 0 });
    return;
  }
  if (helm.style === 'great') {
    // Geschlossener Topfhelm mit Sehschlitz
    const rows = [
      '...HGGg..',
      '..HHGGgG.',
      '.HHHGGGGG',
      'hHHHGGGGG',
      'hHHHkkkkG',
      'hHHHGGGGG',
      'hHHHGGGG.',
      '.hhhhhhh.',
    ];
    R.stamp(x0, y0 - 1, rows, { h: A[1], H: A[2], G: A[3], g: A[4] ?? A[3], k: '#0c0810' });
    R.set(x0 + 6, y0 + 4, A[4] ?? A[3]); R.set(x0 + 7, y0 + 4, A[2]);
  } else {
  // Nasalhelm / gehörnter Helm
  const rows = [
    '...HGGg..',
    '..HHGGgG.',
    '.HHHGGGGG',
    'hHHHGGGGG',
    'hhhhhhhhh',
    'hHH....h.',
    'hH.....h.',
    '.h.......',
  ];
  R.stamp(x0, y0 - 1, rows, { h: A[1], H: A[2], G: A[3], g: A[4] ?? A[3] });
  R.set(x0 + 4, y0 + 1, A[4] ?? A[3]);
  }
  if (helm.style === 'horned') {
    const Bn = M.bone;
    R.set(x0 + 2, y0 - 2, Bn[3]); R.set(x0 + 1, y0 - 3, Bn[3]); R.set(x0 + 1, y0 - 4, Bn[2]); R.set(x0 + 2, y0 - 5, Bn[1]);
    R.set(x0 + 6, y0 - 2, Bn[3]); R.set(x0 + 7, y0 - 3, Bn[3]); R.set(x0 + 7, y0 - 4, Bn[2]); R.set(x0 + 6, y0 - 5, Bn[1]);
  }
  if (helm.crown) {
    // Glutkrone: drei Zacken über dem Helm, leuchtend
    const C = helm.crown;
    for (const [dx, hgt] of [[2, 2], [4, 3], [6, 2]]) for (let i = 1; i <= hgt; i++) R.set(x0 + dx, y0 - 1 - i, C[i === hgt ? 4 : 3]);
    G.push({ x: x0 + 4, y: y0 - 4, color: C[3], r: 1.6 });
  }
  if (helm.crest && !helm.crown) {
    // Helmbusch: nach hinten wehend
    const C = helm.crest;
    const pts = helm.style === 'horned' ? [[4, -3], [3, -3], [2, -2], [1, -2], [0, -1], [-1, 0]] : [[5, -2], [4, -3], [3, -3], [2, -3], [1, -2], [0, -2], [-1, -1], [-1, 0], [-2, 1]];
    pts.forEach(([dx, dy], i) => { R.set(x0 + dx, y0 + dy, C[i < 2 ? 4 : i % 2 ? 3 : 2] ?? C[3]); if (i > 1) R.set(x0 + dx, y0 + dy + 1, C[1]); });
  }
  if (helm.rarity === 'epic' || helm.rarity === 'legendary') {
    const g = helm.rarity === 'epic' ? M.purple : M.ember;
    R.set(x0 + 5, y0 + 2, g[3]);
    G.push({ x: x0 + 5, y: y0 + 2, color: g[3], r: 1.2 });
  }
}

// --- Waffen ------------------------------------------------------------------------------
function drawWeapon(R, G, w, hx, hy, ang, P, far, reach = 1) {
  const f = w.family;
  if (f === 'sword') drawBlade(R, G, w, hx, hy, ang, (w.len ?? 15) * reach, far);
  else if (f === 'dagger') drawBlade(R, G, { ...w, short: true }, hx, hy, ang, (w.len ?? 7) * reach, far);
  else if (f === 'axe') drawAxe(R, G, w, hx, hy, ang, reach, far);
  else if (f === 'mace') drawMace(R, G, w, hx, hy, ang, reach, far);
  else if (f === 'staff') drawStaff(R, G, w, hx, hy, ang, P.glow, far);
  else if (f === 'wand') drawWand(R, G, w, hx, hy, ang, P.glow);
}

// Waffenachse für die animierten Seltenheits-Effekte (entities/Hero.js): Hand, Winkel, Bereich u0..u1 entlang der Achse.
// Wird als Eintrag mit axis: true in G gesammelt und in makeFrame als frame.weapon abgelegt.
function weaponAxis(G, w, hx, hy, ang, u0, u1, far) {
  if (far || !w.fx) return;
  G.push({ axis: true, x: hx, y: hy, ang, u0, u1, fx: w.fx, tier: w.tier ?? 0 });
}

function drawBlade(R, G, w, hx, hy, ang, len, far) {
  const Bl = far ? dimRamp(w.blade ?? M.iron) : w.blade ?? M.iron;
  const Gd = w.guard ?? M.iron, Gr = w.grip ?? M.leather;
  const width = w.width ?? 1;
  const half = width >= 3 ? 1.8 : width >= 2 ? 1.35 : 1;
  const gw = w.short ? 1.8 : (w.guardW ?? 2.8);
  const curve = w.curve ?? 0;
  R.axis(hx, hy, ang, -3.2, len + 1.5, Math.max(gw, half + Math.abs(curve) + 0.6), (u, lv) => {
    if (u < -2.2) return Math.abs(lv) < 1 ? Gd[lv < 0 ? 3 : 2] : null;          // Knauf
    if (u < 0.6) return Math.abs(lv) < 0.7 ? Gr[lv < 0 ? 3 : 1] : null;         // Griff
    if (w.great && u < 1.7 && Math.abs(lv) > gw - 1 && Math.abs(lv) <= gw + 0.3) return Gd[3]; // Zweihänder: Parierhaken
    if (u < 1.7) {                                                            // Parierstange
      if (Math.abs(lv) > gw) return null;
      if (w.gem && Math.abs(lv) < 0.6) return w.gem[3];
      return Gd[lv < 0 ? 3 : Math.abs(lv) > gw - 0.8 ? 1 : 2];
    }
    if (u > len) return null;
    const t = (u - 1.7) / Math.max(1, len - 1.7);
    const off = curve * t * t;
    const vv = lv - off;
    let hw = half * (t > 0.8 ? Math.max(0.15, (1 - t) / 0.2) : 1);
    if (w.flame) hw *= 0.85 + 0.3 * Math.sin(t * 14);
    if (Math.abs(vv) > hw + 0.25) return null;
    if (w.jag && Math.abs(vv) > hw - 0.4 && Math.round(u) % 2 === 0) return null;
    let c = vv < -0.2 ? Bl[4] ?? Bl[3] : vv > 0.35 ? Bl[1] : Bl[3];
    if (half > 1 && Math.abs(vv) < 0.35) c = Bl[2];
    if (w.fuller && Math.abs(vv) < 0.3 && t < 0.7 && half > 1) c = Bl[1];
    if (w.runes && Math.abs(vv) < 0.5 && t > 0.15 && t < 0.7 && Math.round(u) % 2 === 0) c = w.runes[3];
    if (w.glow && !far && t > 0.3 && vv > 0.1) c = w.glow[3];
    return c;
  });
  weaponAxis(G, w, hx, hy, ang, 1.7, len, far);
  if (w.glow && !far) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const k = w.shine >= 2 ? 3 : 2;
    for (let i = 1; i <= k; i++) {
      const u = 1.7 + (len - 1.7) * (i / (k + 0.5));
      G.push({ x: Math.round(hx + dx * u), y: Math.round(hy + dy * u), color: w.glow[3], r: w.shine >= 2 ? 3 : 2 });
    }
  }
  if (w.gem && !far && (w.rarity === 'epic' || w.rarity === 'legendary')) {
    G.push({ x: Math.round(hx + Math.cos(ang) * 1.2), y: Math.round(hy + Math.sin(ang) * 1.2), color: w.gem[3], r: 1 });
  }
}

function drawAxe(R, G, w, hx, hy, ang, reach, far) {
  const Hd = far ? dimRamp(w.head ?? M.iron) : w.head ?? M.iron;
  const Hf = w.haft ?? M.wood;
  const L = 14 * reach;
  R.axis(hx, hy, ang, -3, L + 1.2, 6.2, (u, lv, v) => {
    // Stiel
    if (u < L && Math.abs(lv) < 0.7) return Hf[lv < 0 ? 3 : 2];
    const hu = u - (L - 4.4);
    if (hu < 0 || hu > 5.6) return null;
    // Blatt nach vorne (+v), bei Doppelaxt beidseitig
    const side = v >= 0 ? 1 : -1;
    if (side < 0 && !w.double) {
      if (w.spike && Math.abs(v) < 2.8 && hu > 1.9 && hu < 3.7) return Hd[2];
      return Math.abs(v) < 1.6 && hu > 1.2 && hu < 4.4 ? Hd[1] : null;
    }
    const av = Math.abs(v);
    const reachV = 4.5 + (w.bearded ? (hu < 2.5 ? 1.2 : 0) : 0);
    const width = av < 1.6 ? 2.4 : 1.2 + (av - 1.6) * 1.1;         // Blatt wird zur Schneide breiter
    if (av > reachV + 0.5 || Math.abs(hu - 2.8) > width + 0.3) return null;
    if (av > reachV - 0.5) return Hd[4] ?? Hd[3];                  // Schneide
    if (w.glow && !far && av > reachV - 1.5) return w.glow[3];
    return Hd[lv < 0 ? 3 : 2];
  });
  if (w.glow && !far) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    G.push({ x: Math.round(hx + dx * (L - 1.6) - dy * 4.4), y: Math.round(hy + dy * (L - 1.6) + dx * 4.4), color: w.glow[3], r: 2.5 });
  }
  weaponAxis(G, w, hx, hy, ang, L - 4.4, L + 1, far);
}

function drawMace(R, G, w, hx, hy, ang, reach, far) {
  const Hd = far ? dimRamp(w.head ?? M.iron) : w.head ?? M.iron;
  const Hf = w.haft ?? M.wood;
  const L = 12 * reach;
  const dx = Math.cos(ang), dy = Math.sin(ang);
  R.axis(hx, hy, ang, -3, L, 0.8, (u, lv) => Hf[lv < 0 ? 3 : 2]);
  const cx = hx + dx * (L + 2), cy = hy + dy * (L + 2);
  const r = 3;
  if (w.kind === 'club') {
    R.capsule(hx + dx * (L - 4), hy + dy * (L - 4), cx, cy, 1.7, 3, tone(Hd));
  } else {
    if (w.kind === 'flanged') for (let i = 0; i < 4; i++) { const a = ang + i * Math.PI / 2 + 0.4; R.line(cx + Math.cos(a) * 2.5, cy + Math.sin(a) * 2.5, cx + Math.cos(a) * 4.1, cy + Math.sin(a) * 4.1, Hd[2]); }
    if (w.kind === 'spiked') for (let i = 0; i < 8; i++) { const a = i * TAU / 8; R.line(cx + Math.cos(a) * 2.5, cy + Math.sin(a) * 2.5, cx + Math.cos(a) * 4.3, cy + Math.sin(a) * 4.3, Hd[i % 2 ? 2 : 3]); }
    R.ellipse(cx, cy, r, r, (nx, ny) => { const l = -(nx * LX + ny * LY) * -1; return l > 0.4 ? Hd[4] ?? Hd[3] : l > -0.2 ? Hd[3] : Hd[2]; });
  }
  if (w.glow && !far) G.push({ x: Math.round(cx), y: Math.round(cy), color: w.glow[3], r: 3 });
  weaponAxis(G, w, hx, hy, ang, L - 1, L + 5, far);
}

function drawStaff(R, G, w, hx, hy, ang, glow, far) {
  const Wd = w.wood ?? M.wood, K = w.ramp ?? PAL.ember;
  const dx = Math.cos(ang), dy = Math.sin(ang);
  R.axis(hx, hy, ang, -11, 13, 0.8, (u, lv) => {
    if (w.bands && (Math.abs(u - 9) < 0.6 || Math.abs(u + 2) < 0.6)) return w.bands[3];
    if (w.gnarled && Math.round(u) % 5 === 0) return Wd[1];
    return Wd[lv < 0 ? 3 : 2];
  });
  const tx = hx + dx * 15.5, ty = hy + dy * 15.5;
  const top = w.top ?? 'orb';
  if (top === 'curl') {
    R.axis(hx, hy, ang, 12.5, 16, 2.2, (u, lv, v) => (Math.abs(v - (u - 12.5) * 0.6) < 0.7 || (u > 15 && Math.abs(v) < 2) ? Wd[3] : null));
    R.set(tx - dy * 0.5, ty + dx * 0.5, K[3]);
  } else if (top === 'skull') {
    R.ellipse(tx, ty, 2, 2, (nx, ny) => (ny < 0.3 ? M.bone[3] : M.bone[2]));
    R.set(tx + 0.5, ty, '#0c0810'); R.set(tx - 0.8, ty, '#0c0810');
  } else {
    // Klauen + Kristall/Kugel/Flamme
    R.axis(hx, hy, ang, 12.5, 16.5, 2.4, (u, lv, v) => (Math.abs(Math.abs(v) - 1.8) < 0.6 && u > 13.2 ? Wd[lv < 0 ? 3 : 2] : null));
    if (top === 'crystal' || top === 'arcane') {
      R.axis(tx - dx * 1.5, ty - dy * 1.5, ang, 0, 4.2, 1.3, (u, lv) => (Math.abs(lv) < 1.3 - u * 0.25 ? K[lv < 0 ? 4 : u > 2.5 ? 2 : 3] : null));
    } else if (top === 'flame') {
      R.ellipse(tx, ty, 1.5, 1.8, (nx, ny) => (ny < -0.3 ? K[4] ?? K[3] : K[3]));
      R.set(tx + dx * 2, ty + dy * 2, K[2]);
    } else {
      R.ellipse(tx, ty, 1.6, 1.6, (nx, ny) => (nx + ny < -0.6 ? K[4] ?? K[3] : K[3]));
    }
  }
  if (!far) G.push({ x: Math.round(tx), y: Math.round(ty), color: K[3], r: 1.5 + glow * 2.5 + (w.shine ?? 0) * 0.5 });
  weaponAxis(G, w, hx, hy, ang, 13, 18, far);
}

function drawWand(R, G, w, hx, hy, ang, glow) {
  const Wd = w.wood ?? M.wood, K = w.ramp ?? PAL.ember;
  const dx = Math.cos(ang), dy = Math.sin(ang);
  R.axis(hx, hy, ang, -2, 7, 0.6, (u, lv) => Wd[lv < 0 ? 3 : 2]);
  const tx = hx + dx * 8, ty = hy + dy * 8;
  R.set(tx, ty, K[3]); R.set(tx - dx, ty - dy, K[2]); R.set(tx + dx * 0.8 - dy * 0.8, ty + dy * 0.8 + dx * 0.8, K[4] ?? K[3]);
  G.push({ x: Math.round(tx), y: Math.round(ty), color: K[3], r: 1 + glow * 2.5 });
  weaponAxis(G, w, hx, hy, ang, 6, 9.5, false);
}

// Stab/Zauberstab: Finger über dem Schaft
function drawGrip(R, L, w, x, y, ang) {
  const h = L.gloves ?? L.skin;
  R.set(x + Math.cos(ang) * 1.2, y + Math.sin(ang) * 1.2, h[2]);
}

function drawBow(R, G, w, bx, by, pull, arrow, tiltA) {
  // Bogen im lokalen System (x = nach vorne, y = entlang des Bogens), um den Griff gedreht
  const Wd = w.wood ?? M.wood;
  const long = !!w.long, rec = !!w.recurve;
  const half = long ? 11 : 9;
  const a = tiltA ?? 0, ca = Math.cos(a), sa = Math.sin(a);
  const T = (x, y) => ({ x: bx + x * ca - y * sa, y: by + x * sa + y * ca });
  const pts = [];
  for (let i = -half; i <= half; i++) {
    const t = i / half;
    let x = 3.2 * (1 - t * t) + pull * 0.8 * (1 - t * t);
    if (rec && Math.abs(t) > 0.8) x -= (Math.abs(t) - 0.8) * 6;
    pts.push({ ...T(x, i), t, lx: x, ly: i });
  }
  for (const p of pts) {
    const grip = Math.abs(p.t) < 0.12;
    R.set(p.x, p.y, grip ? (w.grip ?? M.leather)[3] : Wd[Math.abs(p.t) > 0.85 ? 3 : 2]);
    if (!grip && Math.abs(p.t) < 0.8) { const q = T(p.lx + 1, p.ly); R.set(q.x, q.y, Wd[1]); }
  }
  const top = pts[0], bot = pts[pts.length - 1];
  if (w.tips) { R.set(top.x, top.y, w.tips[3]); R.set(bot.x, bot.y, w.tips[3]); }
  const s = T(-1 - pull * 7, 0);
  const str = w.string ?? '#d8d0c0';
  R.line(top.x, top.y, s.x, s.y, str);
  R.line(s.x, s.y, bot.x, bot.y, str);
  if (arrow) {
    const tip = T(8, 0);
    R.line(s.x, s.y, tip.x, tip.y, M.wood[3]);
    R.set(tip.x, tip.y, M.iron[4]); const h1 = T(7, -1), h2 = T(7, 1); R.set(h1.x, h1.y, M.iron[3]); R.set(h2.x, h2.y, M.iron[3]);
    const f1 = T(-pull * 7, -1), f2 = T(1 - pull * 7, -1), f3 = T(-pull * 7, 1);
    R.set(f1.x, f1.y, '#e8e0d0'); R.set(f2.x, f2.y, '#c83a2a'); R.set(f3.x, f3.y, '#e8e0d0');
  }
  weaponAxis(G, w, bx, by, a + Math.PI / 2, -half + 1, half - 1, false);
  if (w.fx && G.length) G[G.length - 1].arc = -3.2 - pull * 0.8;   // Bogen: Achse folgt der Krümmung
  if (w.glow) { const g1 = T(2, -half + 2), g2 = T(2, half - 2); G.push({ x: Math.round(g1.x), y: Math.round(g1.y), color: w.glow[3], r: 1.5 }, { x: Math.round(g2.x), y: Math.round(g2.y), color: w.glow[3], r: 1.5 }); }
  return s;
}

function drawShield(R, L, x, y, P) {
  // Heraldischer Schild in Dreiviertelansicht, vor dem Körper
  const C = L.cloth, Rim = M.iron, T = L.trim;
  const cx = Math.round(x + 1), cy = Math.round(y);
  const rows = [
    'rrrrrr',
    'rlffdr',
    'rlffdr',
    'rlfbdr',
    'rlffdr',
    'rlffdr',
    '.rffr.',
    '.rfdr.',
    '..rr..',
  ];
  R.stamp(cx - 3, cy - 4, rows, { r: Rim[2], l: C[3], f: C[2], d: C[1], b: T[3] });
  R.set(cx - 3, cy - 4, Rim[4]); R.set(cx - 2, cy - 4, Rim[3]); R.set(cx - 1, cy - 4, Rim[3]);
  R.set(cx + 2, cy - 3, Rim[1]); R.set(cx + 2, cy - 2, Rim[1]);
  // Wappen: Glutflamme
  R.set(cx - 1, cy - 2, T[2]); R.set(cx - 1, cy - 1, T[3]); R.set(cx, cy - 1, T[2]); R.set(cx - 1, cy + 1, T[2]);
}

// --- Frames -----------------------------------------------------------------------------
function makeFrame(L, pose, post) {
  let R = new Raster();
  let G = [];
  drawHero(R, G, L, pose);
  if (post) ({ R, G } = post(R, G));
  const f = buildFrame(W, H, AX, AY, (p) => R.blit(p.ctx));
  f.glows = G.filter((g) => !g.axis);
  f.weapon = G.find((g) => g.axis) ?? null;  // Waffenachse für Seltenheits-Effekte (Hero.renderEmissive)
  return f;
}

function rotateFrame(ang, px, py) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return (R, G) => ({
    R: R.rotated(ang, px, py),
    G: G.map((g) => {
      const x = g.x - px, y = g.y - py;
      if (g.axis) return { ...g, x: px + x * c - y * s, y: py + x * s + y * c, ang: g.ang + ang };
      return { ...g, x: Math.round(px + x * c - y * s), y: Math.round(py + x * s + y * c) };
    }),
  });
}

// --- Posen je Klasse -------------------------------------------------------------------------
function stanceFor(L) {
  const k = L.classId, f = L.weapon.family;
  if (k === 'ranger') return { handO: [4, 5], wO: 0.5, handM: [3, 3], footN: [2, 0], footF: [-2.5, 0] };
  if (k === 'mage') {
    return f === 'wand'
      ? { handM: [2.5, 5], wM: 0.5, handO: [0.5, 6], footN: [1.5, 0], footF: [-2, 0] }
      : { handM: [3, 4.5], wM: -1.45, handO: [0.5, 6.5], footN: [1.5, 0], footF: [-2, 0] };
  }
  if (k === 'rogue') return { hipY: 1, lean: 1, handM: [3.5, 4], wM: f === 'dagger' ? 0.35 : -0.55, handO: [2.5, 4.5], wO: 0.4, footN: [2.5, 0], footF: [-2.5, 0] };
  // Krieger: Schild vor dem Körper. Schwert kampfbereit schräg nach vorne oben,
  // Axt, Kolben und Zweihänder ruhen auf der Schulter (klar erkennbare Umrisse).
  if (f === 'sword' && !L.weapon.great) return { handM: [3, 5.5], wM: -1.05, handO: [4.5, 3], footN: [2, 0], footF: [-2.5, 0] };
  return { handM: [1.5, 3.5], wM: L.weapon.great ? -2.3 : -2.45, handO: [4.5, 3], footN: [2, 0], footF: [-2.5, 0] };
}

// Animationen werden erst beim ersten Zugriff gerastert (Ausrüstungswechsel ohne Ruckler).
function buildSet(L) {
  const stance = stanceFor(L);
  const S = (o = {}) => ({ ...stance, ...o });
  const frame = (o, post) => makeFrame(L, S(o), post);
  const k = L.classId;
  let atk = null;
  const attacks = () => (atk ??= attackSet(L, S));
  const makers = {
    idle: () => new Animation(idleFrames(L, stance, frame, k), 6),
    run: () => new Animation(runFrames(L, stance, frame, k), 15),
    atk1: () => withPhases(new Animation(attacks().atk1, 1, false), attacks().phases),
    atk2: () => withPhases(new Animation(attacks().atk2, 1, false), attacks().phases),
    atk3: () => withPhases(new Animation(attacks().atk3, 1, false), attacks().phases),
    cast: () => new Animation(castSet(L, S), 12, false),
    spin: () => new Animation(spinSet(L, S), 16),
    roll: () => new Animation(rollFrames(frame), 22),
    dash: () => new Animation(dashFrames(L, stance, frame), 14),
    // Eigene Posen der Stufe-4/12-Fähigkeiten (alle mit phases, gesteuert über hero.setPhaseFrame)
    slam: () => skillAnim(L, S, 'slam'),
    lunge: () => skillAnim(L, S, 'lunge'),
    coat: () => skillAnim(L, S, 'coat'),
    rainshot: () => skillAnim(L, S, 'rainshot'),
    plant: () => skillAnim(L, S, 'plant'),
    summon: () => skillAnim(L, S, 'summon'),
    hurl: () => skillAnim(L, S, 'hurl'),
    hurt: () => new Animation(hurtFrames(stance, frame), 10, false),
    death: () => new Animation(deathFrames(stance, frame), 9, false),
  };
  const set = {};
  for (const [name, make] of Object.entries(makers)) {
    Object.defineProperty(set, name, {
      enumerable: true, configurable: true,
      get() { const v = make(); Object.defineProperty(set, name, { value: v, enumerable: true }); return v; },
    });
  }
  return set;
}

function idleFrames(L, stance, frame, k) {
  // 4 Frames, Atmen 1 px, Umhang/Haar leicht bewegt
  return [0, 1, 2, 3].map((i) => {
    const b = i === 1 || i === 2 ? 1 : 0;
    const hm = stance.handM ?? BASE_POSE.handM;
    return frame({ breath: b, wave: i * 1.57, cape: 0.12 + 0.05 * Math.sin(i * 1.57), glow: 0.35 + 0.2 * Math.sin(i * 1.57),
      handM: [hm[0], hm[1] + b * 0.5], handGlow: k === 'mage' ? 0.25 : 0 });
  });
}

function runFrames(L, stance, frame, k) {
  // 8 Frames Laufzyklus: Standbein schiebt nach hinten (am Boden), Schwungbein holt mit
  // angehobenem Knie nach vorne aus. Hüfte sinkt beim Aufsetzen, Arme schwingen gegengleich.
  const B = L.body, legLen = B.thigh + B.shin;
  const stride = legLen * (k === 'rogue' ? 0.5 : 0.44);
  const lift = Math.max(2.4, legLen * 0.34);
  const hm = stance.handM ?? BASE_POSE.handM, ho = stance.handO ?? BASE_POSE.handO;
  const foot = (ph) => {
    const q = ((ph % TAU) + TAU) % TAU;
    if (q < Math.PI) return [Math.cos(q) * stride, 0];                 // Stand: vorne -> hinten
    const w = q - Math.PI;                                             // Schwung: hinten -> vorne
    return [-Math.cos(w) * stride, lift * Math.pow(Math.sin(w), 0.7) + (w < 1.2 ? (1.2 - w) * 0.8 : 0)];
  };
  const run = [];
  for (let i = 0; i < 8; i++) {
    const ph = (i / 8) * TAU;
    const c = Math.cos(ph), s2 = Math.abs(Math.sin(ph));
    const [nx, nl] = foot(ph), [fx, fl] = foot(ph + Math.PI);
    const bob = Math.round(1.6 * (1 - s2));  // unten beim Aufsetzen, oben im Durchgang
    const shield = L.offKind === 'shield', bow = L.offKind === 'bow';
    run.push(frame({
      hipY: (stance.hipY ?? 0) + bob - (s2 > 0.9 ? 1 : 0), lean: 2 + (k === 'rogue' ? 1 : 0),
      breath: bob > 0 ? 1 : 0, head: [0.5, bob > 0 ? 0 : -0.5],
      footN: [nx + 0.5, nl], footF: [fx - 0.5, fl],
      handM: k === 'ranger' ? [hm[0] - c * 1.2, hm[1] + s2 * 0.3] : [hm[0] - c * 2.6, hm[1] - Math.abs(c) * 0.8],
      handO: shield || bow ? [ho[0] + c * 1, ho[1] - s2 * 0.4] : [ho[0] + c * 3, ho[1] - 0.5 - Math.abs(c) * 0.6],
      wM: (stance.wM ?? BASE_POSE.wM) - c * 0.18,
      cape: 0.6 + 0.2 * s2, wave: ph * 2, glow: 0.35,
    }));
  }
  return run;
}

function rollFrames(frame) {
  // gekauerte Pose, um die Körpermitte gedreht
  const tuck = { hipY: 6, lean: 3, breath: 1, footN: [2, 3.5], footF: [0.5, 3], handM: [3, 3], handO: [3.5, 3.5], head: [1, 2], wM: 0.9, wO: 0.9, cape: 0.2, reach: 0.7, reachO: 0.7 };
  const roll = [];
  for (let i = 0; i < 6; i++) roll.push(frame({ ...tuck, cape: 0.2 + i * 0.1 }, rotateFrame((i / 6) * TAU, 0, -8)));
  return roll;
}

function dashFrames(L, stance, frame) {
  // Sturmangriff/Sprint: weit vorgebeugt, Schild bzw. Waffe voran
  const shield = L.offKind === 'shield';
  return [0, 1, 2].map((i) => {
    const c = Math.cos((i / 3) * TAU);
    return frame({
      hipY: 2, lean: 4, head: [1, 1], footN: [3 - c * 3, c < 0 ? 1.5 : 0], footF: [-3 + c * 3, c > 0 ? 1.5 : 0],
      handO: shield ? [6, 1] : [-3, 4], handM: shield ? [0, 6] : [6, 1], wM: shield ? 1.4 : 0.1, wO: 0.3,
      cape: 0.9, wave: i * 2,
    });
  });
}

function hurtFrames(stance, frame) {
  return [
    frame({ hurt: 1, lean: -2, hipX: -1, head: [-1, 0], handM: [0, 3], handO: [-1, 2], wM: (stance.wM ?? -0.8) - 0.6, cape: 0.5, wave: 2, footN: [2.5, 0], footF: [-2.5, 0] }),
    frame({ hurt: 1, lean: -1, head: [-1, 0], handM: [1, 4.5], handO: [0.5, 3], wM: (stance.wM ?? -0.8) - 0.3, cape: 0.35, wave: 3 }),
  ];
}

function deathFrames(stance, frame) {
  // Einknicken, auf die Knie, nach hinten kippen, liegen
  const dz = stance.wM ?? -0.8;
  return [
    frame({ hurt: 1, lean: -2, hipX: -1, head: [-1, -1], handM: [0, 2], handO: [-1, 2], wM: dz - 0.7, cape: 0.5, wave: 2 }),
    frame({ hurt: 1, hipY: 3, lean: 1, head: [0, 1], handM: [2, 6], handO: [1, 6], wM: 1.2, cape: 0.3, footN: [3, 0], footF: [-2.5, 0] }),
    frame({ hurt: 1, hipY: 5, lean: 2, head: [1, 1], handM: [3, 7], handO: [2, 7], wM: 1.5, cape: 0.2, footN: [4, 0], footF: [-3, 0.5] }),
    frame({ hurt: 1, hipY: 5, lean: 0, head: [0, 0], handM: [0, 5], handO: [-1, 5], wM: 1.9, cape: 0.2, footN: [4, 0], footF: [-3, 0.5] }, rotateFrame(-0.6, 0, 0)),
    frame({ hurt: 1, hipY: 4, lean: 0, head: [0, 0], handM: [-1, 4], handO: [-2, 3], wM: 2.4, cape: 0.1, footN: [3, 0], footF: [-1, 0] }, rotateFrame(-1.35, 0, 0)),
    frame({ hurt: 1, hipY: 3, lean: 0, head: [0, 1], handM: [-2, 5], handO: [-2, 4], wM: 2.6, cape: 0, footN: [3, 0], footF: [0, 0] }, rotateFrame(-Math.PI / 2, 0, -1)),
  ];
}

function withPhases(anim, phases) { anim.phases = phases; return anim; }

// Keyframes -> Frames: keys = [pose, pose, ...] in Frame-Reihenfolge
function frames(L, S, keys) { return keys.map((o) => makeFrame(L, S(o))); }

function attackSet(L, S) {
  const k = L.classId;
  const phases = { windup: [0, 1], active: [2, 3], recover: [4, 5] };
  if (k === 'ranger') {
    // Pfeil ziehen – spannen – lösen – nachschwingen
    const keys = [
      { wO: 0, draw: 0.25, arrow: 1, handO: [5, 2], lean: 0 },
      { wO: 0, draw: 1, arrow: 1, handO: [5.5, 2], lean: -1, head: [0, 0], cape: 0.3 },
      { wO: 0, draw: 0, arrow: 0, handO: [6, 2], lean: 1, handM: [-3, 1], cape: 0.45, wave: 1 },
      { wO: 0, draw: 0, handO: [5.5, 2.2], lean: 1, handM: [-2, 2], cape: 0.4, wave: 2 },
      { wO: 0, draw: 0, handO: [5, 2.1], lean: 0, handM: [0, 3], cape: 0.3, wave: 3 },
      { wO: 0, draw: 0, handO: [4.5, 2], handM: [3, 3], cape: 0.2, wave: 4 },
    ];
    const f = frames(L, S, keys);
    return { atk1: f, atk2: f, atk3: f, phases: { windup: [0, 1], active: [2, 2], recover: [3, 5] } };
  }
  if (k === 'mage') {
    const wand = L.weapon.family === 'wand';
    const keys = wand ? [
      { handM: [0, 2], wM: -1.8, handO: [2, 3], handGlow: 0.5, glow: 0.6, lean: -1 },
      { handM: [-1, -1], wM: -2.4, handO: [3, 2], handGlow: 1, glow: 1, lean: -1, cape: 0.2 },
      { handM: [6, 1], wM: -0.1, handO: [1, 4], handGlow: 0.6, glow: 1, lean: 2, footN: [3, 0], cape: 0.4 },
      { handM: [6.5, 1.5], wM: 0, handO: [0.5, 5], handGlow: 0.3, glow: 0.8, lean: 2, footN: [3, 0], cape: 0.45 },
      { handM: [4.5, 3], wM: 0.3, handO: [0.5, 6], glow: 0.5, lean: 1, cape: 0.3 },
      { glow: 0.4, cape: 0.2 },
    ] : [
      { handM: [1, 4], wM: -1.85, handO: [3, 3], handGlow: 0.5, glow: 0.6, lean: -1 },
      { handM: [0, 2], wM: -2.1, handO: [4, 1], handGlow: 1, glow: 1, lean: -1, cape: 0.2 },
      { handM: [6, 2], wM: -0.55, handO: [2, 4], handGlow: 0.6, glow: 1, lean: 2, footN: [3, 0], cape: 0.4 },
      { handM: [6.5, 2.5], wM: -0.45, handO: [1.5, 5], handGlow: 0.3, glow: 0.8, lean: 2, footN: [3, 0], cape: 0.45 },
      { handM: [4.5, 3.5], wM: -0.9, handO: [1, 6], glow: 0.5, lean: 1, cape: 0.3 },
      { glow: 0.4, cape: 0.2 },
    ];
    const f = frames(L, S, keys);
    return { atk1: f, atk2: f, atk3: f, phases };
  }
  if (k === 'rogue') {
    const main = (a) => a;
    return {
      atk1: frames(L, S, [
        { handM: [0, 4], wM: 0.2, lean: 0 },
        { handM: [-2, 3], wM: 0.1, lean: -1, footN: [3, 0] },
        { handM: [7, 1], wM: -0.05, lean: 2, footN: [4, 0], footF: [-3, 0], cape: 0.5, wave: 1 },
        { handM: [7.5, 1.5], wM: 0, lean: 2, footN: [4, 0], footF: [-3, 0], cape: 0.6, wave: 2 },
        { handM: [5, 3], wM: 0.25, lean: 1, footN: [3, 0], cape: 0.4, wave: 3 },
        main({ cape: 0.25, wave: 4 }),
      ]),
      atk2: frames(L, S, [
        { handO: [0, 4], wO: 0.3, lean: 0 },
        { handO: [-2, 3], wO: 0.2, lean: -1, footN: [3, 0] },
        { handO: [8, 1], wO: 0, lean: 2, footN: [4, 0], footF: [-3, 0], cape: 0.5, wave: 1, handM: [1, 5] },
        { handO: [8, 1.5], wO: 0.05, lean: 2, footN: [4, 0], footF: [-3, 0], cape: 0.6, wave: 2, handM: [1, 5] },
        { handO: [5, 3], wO: 0.3, lean: 1, footN: [3, 0], cape: 0.4, wave: 3 },
        { cape: 0.25, wave: 4 },
      ]),
      atk3: frames(L, S, [
        { hipY: 3, handM: [0, -1], wM: -2, handO: [-1, 0], wO: -2, lean: -1 },
        { hipY: 0, handM: [-1, -5], wM: -2.4, handO: [-2, -4], wO: -2.4, lean: 0, footN: [2, 1.5], footF: [-2, 1], cape: 0.3 },
        { hipY: 2, handM: [6, 0], wM: 0.3, handO: [6, 1], wO: 0.5, lean: 3, footN: [4, 0], footF: [-4, 0], cape: 0.7, wave: 1, smear: [-2.4, 0.3] },
        { hipY: 4, handM: [6, 5], wM: 1.1, handO: [5, 5], wO: 1.2, lean: 3, footN: [4.5, 0], footF: [-4.5, 0], cape: 0.8, wave: 2, smear: [-0.6, 1.1] },
        { hipY: 3, handM: [5, 5], wM: 1, handO: [4, 5], wO: 1, lean: 2, footN: [4, 0], footF: [-4, 0], cape: 0.5, wave: 3 },
        { hipY: 1, cape: 0.3, wave: 4 },
      ]),
      phases,
    };
  }
  // Krieger (Schwert, Axt, Kolben)
  const wBase = S().wM;
  return {
    atk1: frames(L, S, [
      { handM: [0, 1], wM: -1.8, lean: -1, handO: [3, 4] },
      { handM: [-2, -3], wM: -2.5, lean: -1, handO: [3.5, 4], footN: [3, 0], cape: 0.2 },
      { handM: [6, -2], wM: -0.6, lean: 2, footN: [4, 0], footF: [-3, 0], handO: [2, 5], cape: 0.5, wave: 1, smear: [-2.5, -0.6] },
      { handM: [7, 2], wM: 0.55, lean: 2, hipY: 1, footN: [4, 0], footF: [-3, 0], handO: [2, 5], cape: 0.65, wave: 2, smear: [-1.3, 0.55] },
      { handM: [5, 5], wM: 1.25, lean: 1, hipY: 1, footN: [3, 0], footF: [-3, 0], handO: [3, 4], cape: 0.5, wave: 3 },
      { handM: [3, 5], wM: wBase + 0.4, cape: 0.3, wave: 4 },
    ]),
    atk2: frames(L, S, [
      { handM: [3, 6], wM: 1.3, lean: -1, hipY: 1, handO: [2, 3] },
      { handM: [1, 7], wM: 1.9, lean: -1, hipY: 1, handO: [2, 2], footN: [3, 0], cape: 0.2 },
      { handM: [7, 1], wM: -0.4, lean: 2, footN: [4, 0], footF: [-3, 0], handO: [1, 5], cape: 0.5, wave: 1, smear: [1.9, -0.4] },
      { handM: [5, -3], wM: -1.25, lean: 1, footN: [4, 0], footF: [-3, 0], handO: [1, 5], cape: 0.6, wave: 2, smear: [0.4, -1.25] },
      { handM: [3, -2], wM: -1.6, lean: 0, footN: [3, 0], handO: [2, 4], cape: 0.45, wave: 3 },
      { wM: wBase - 0.2, cape: 0.3, wave: 4 },
    ]),
    atk3: frames(L, S, [
      { hipY: 3, handM: [0, 1], wM: -2.2, lean: -1, handO: [3, 4], footN: [3, 0], footF: [-3, 0] },
      { hipY: -1, handM: [-1, -7], wM: -2.8, lean: -1, handO: [3, 2], footN: [3, 1.5], footF: [-2, 0.5], cape: 0.3 },
      { hipY: 1, handM: [5, -5], wM: -1.1, lean: 2, handO: [2, 4], footN: [4, 0], footF: [-4, 0], cape: 0.6, wave: 1, smear: [-2.8, -1.1] },
      { hipY: 4, handM: [7, 3], wM: 0.85, lean: 3, handO: [2, 5], footN: [5, 0], footF: [-4.5, 0], cape: 0.85, wave: 2, smear: [-1.6, 0.85] },
      { hipY: 4, handM: [6, 6], wM: 1.3, lean: 3, handO: [2, 5], footN: [5, 0], footF: [-4.5, 0], cape: 0.6, wave: 3 },
      { hipY: 2, handM: [4, 5], wM: 0.6, lean: 1, footN: [3, 0], footF: [-3, 0], cape: 0.35, wave: 4 },
    ]),
    phases,
  };
}

function castSet(L, S) {
  const k = L.classId;
  if (k === 'warrior') {
    // Kriegsschrei: Waffe hoch, Brust raus
    return frames(L, S, [
      { hipY: 2, lean: 1, handM: [2, 3], wM: -1.2, handO: [3, 4] },
      { hipY: 0, lean: -1, head: [0, -1], handM: [1, -7], wM: -1.5, handO: [4, 2], cape: 0.4, wave: 1 },
      { hipY: 0, lean: -2, head: [-1, -1], handM: [1, -8], wM: -1.55, handO: [4, 1], cape: 0.6, wave: 2, footN: [3, 0], footF: [-3, 0] },
      { hipY: 0, lean: -1, head: [-1, -1], handM: [1, -7], wM: -1.5, handO: [4, 2], cape: 0.5, wave: 3, footN: [3, 0], footF: [-3, 0] },
      { hipY: 1, lean: 0, handM: [2, 2], wM: -1.1, cape: 0.3, wave: 4 },
    ]);
  }
  if (k === 'mage') {
    const up = L.weapon.family === 'wand' ? -2.2 : -1.55;
    return frames(L, S, [
      { hipY: 1, handM: [2, 1], wM: up, handO: [3, 1], handGlow: 0.7, glow: 0.8 },
      { hipY: -1, handM: [1, -5], wM: up, handO: [2, -5], handGlow: 1, glow: 1, head: [0, -1], cape: 0.3, footN: [2, 0.5], footF: [-2, 0.5] },
      { hipY: 3, handM: [5, 4], wM: -1.3, handO: [5, 5], handGlow: 1, glow: 1, lean: 2, cape: 0.7, wave: 1, footN: [3, 0], footF: [-3, 0] },
      { hipY: 3, handM: [5, 4.5], wM: -1.3, handO: [5, 5.5], handGlow: 0.6, glow: 0.8, lean: 2, cape: 0.55, wave: 2, footN: [3, 0], footF: [-3, 0] },
      { hipY: 1, handGlow: 0.3, glow: 0.5, cape: 0.3, wave: 3 },
    ]);
  }
  // Schurke/Waldläufer: kurzes Sammeln, Schwung
  return frames(L, S, [
    { hipY: 2, handM: [1, 3], handO: [1, 3], lean: 1 },
    { hipY: 0, handM: [3, -3], handO: [2, -2], wM: -1.6, wO: -1.6, lean: -1, cape: 0.4, wave: 1 },
    { hipY: 2, handM: [6, 2], handO: [6, 2], wM: 0.3, wO: 0.3, lean: 2, cape: 0.6, wave: 2 },
    { hipY: 2, handM: [5, 3], handO: [5, 3], wM: 0.5, wO: 0.5, lean: 1, cape: 0.45, wave: 3 },
    { hipY: 1, cape: 0.3, wave: 4 },
  ]);
}

// Fähigkeits-Posen: { keys, phases }. Jede Pose ist klassenspezifisch gedacht, fällt aber für
// andere Klassen nicht aus (gleiche Parameter, andere Waffe).
function skillAnim(L, S, name) {
  const wand = L.weapon.family === 'wand';
  const DEF = {
    // Erdspalter: Sprung, Waffe hinter den Kopf, mit ganzer Wucht in den Boden
    slam: {
      phases: { windup: [0, 1], active: [2, 3], recover: [4, 5] },
      keys: [
        { hipY: 4, lean: 0, handM: [-1, -1], wM: -2.5, handO: [2, 4], footN: [3, 0], footF: [-3, 0], cape: 0.2 },
        { hipY: -5, lean: -1, head: [0, -1], handM: [-2, -9], wM: -3.0, handO: [3, 1], footN: [2, 3.5], footF: [-2, 2.5], cape: 0.1, wave: 1 },
        { hipY: -2, lean: 3, handM: [6, -5], wM: -0.9, handO: [3, 3], footN: [3, 1.5], footF: [-3, 1], cape: 0.55, wave: 2, smear: [-3.0, -0.9] },
        { hipY: 6, lean: 4, head: [1, 1], handM: [8, 6], wM: 1.2, handO: [3, 5], footN: [5, 0], footF: [-5, 0], cape: 0.95, wave: 3, smear: [-1.6, 1.2] },
        { hipY: 6, lean: 4, head: [1, 1], handM: [8, 6.5], wM: 1.25, handO: [3, 5], footN: [5, 0], footF: [-5, 0], cape: 0.6, wave: 4 },
        { hipY: 3, lean: 2, handM: [5, 5], wM: 0.8, handO: [3, 4], footN: [3, 0], footF: [-3, 0], cape: 0.35, wave: 5 },
      ],
    },
    // Todesstoß: tief geduckt, beide Klingen über dem Kopf, dann nach vorne unten gerammt
    lunge: {
      phases: { windup: [0, 1], active: [2, 3], recover: [4, 5] },
      keys: [
        { hipY: 5, lean: 2, handM: [0, -1], wM: -2.2, handO: [-1, 0], wO: -2.2, footN: [3, 0], footF: [-3, 0], cape: 0.3 },
        { hipY: 3, lean: -1, head: [0, -1], handM: [-2, -6], wM: -2.7, handO: [-3, -5], wO: -2.7, footN: [3, 0.5], footF: [-3, 0], cape: 0.2, wave: 1 },
        { hipY: 5, lean: 4, head: [1, 1], handM: [8, 3], wM: 0.7, handO: [7, 4], wO: 0.9, footN: [5, 0], footF: [-5, 0], cape: 0.9, wave: 2, smear: [-2.7, 0.7] },
        { hipY: 6, lean: 4, head: [1, 1], handM: [8, 6], wM: 1.3, handO: [7, 6], wO: 1.4, footN: [5.5, 0], footF: [-5, 0], cape: 0.75, wave: 3 },
        { hipY: 4, lean: 2, handM: [6, 5], wM: 1.0, handO: [4, 5], wO: 1.0, footN: [4, 0], footF: [-4, 0], cape: 0.45, wave: 4 },
        { hipY: 1, lean: 1, cape: 0.3, wave: 5 },
      ],
    },
    // Giftklingen: Klingen vor der Brust kreuzen, aneinander wetzen, aufreißen
    coat: {
      phases: { windup: [0, 0], active: [1, 2], recover: [3, 3] },
      keys: [
        { hipY: 2, lean: 0, handM: [3, 1], wM: -1.9, handO: [4, 1], wO: -1.2, footN: [2, 0], footF: [-2, 0] },
        { hipY: 2, lean: 1, handM: [5, 0], wM: -0.9, handO: [2, 2], wO: -2.0, cape: 0.3, wave: 1, smear: [-1.9, -0.9] },
        { hipY: 1, lean: 1, handM: [6, 4], wM: 0.5, handO: [-4, 4], wO: 2.6, cape: 0.55, wave: 2, footN: [3, 0], footF: [-3, 0], smear: [-0.9, 0.5] },
        { hipY: 1, lean: 1, cape: 0.3, wave: 3 },
      ],
    },
    // Pfeilhagel: Bogen steil in den Himmel, voll gespannt, lösen, Rückstoß
    rainshot: {
      phases: { windup: [0, 1], active: [2, 2], recover: [3, 4] },
      keys: [
        { hipY: 1, lean: -1, head: [-1, -1], handO: [3, -2], wO: -0.9, draw: 0.4, arrow: 1, footN: [3, 0], footF: [-3, 0] },
        { hipY: 2, lean: -2, head: [-1, -1], handO: [3, -3], wO: -1.0, draw: 1, arrow: 1, footN: [3, 0], footF: [-3, 0], cape: 0.2 },
        { hipY: 1, lean: -2, head: [-1, -1], handO: [3.5, -3.5], wO: -1.0, draw: 0, arrow: 0, footN: [3, 0], footF: [-3, 0], cape: 0.45, wave: 1 },
        { hipY: 1, lean: -1, head: [-1, -1], handO: [3, -2.5], wO: -0.85, draw: 0, footN: [3, 0], footF: [-3, 0], cape: 0.35, wave: 2 },
        { hipY: 0, lean: 0, handO: [4, 1], wO: 0.1, cape: 0.25, wave: 3 },
      ],
    },
    // Sprengfalle: in die Hocke, Falle mit der Zughand in den Boden drücken, aufstehen
    plant: {
      phases: { windup: [0, 0], active: [1, 2], recover: [3, 3] },
      keys: [
        { hipY: 3, lean: 2, handM: [4, 5], handO: [3, 4], wO: 0.6, footN: [3, 0], footF: [-3, 0] },
        { hipY: 7, lean: 4, head: [1, 1], handM: [7, 10], handO: [2, 6], wO: 0.9, footN: [4, 0], footF: [-3.5, 0], cape: 0.3, wave: 1 },
        { hipY: 7, lean: 4, head: [1, 1], handM: [8, 10.5], handO: [2, 6], wO: 0.9, footN: [4, 0], footF: [-3.5, 0], cape: 0.25, wave: 2 },
        { hipY: 3, lean: 1, handM: [4, 4], handO: [4, 3], wO: 0.5, footN: [3, 0], footF: [-3, 0], cape: 0.2, wave: 3 },
      ],
    },
    // Meteor: Arme ausbreiten, Stab senkrecht in den Himmel, Glut bündeln, nach vorne herabreißen
    summon: {
      phases: { windup: [0, 2], active: [3, 3], recover: [4, 5] },
      keys: [
        { hipY: 2, handM: [4, 2], wM: wand ? -2.0 : -1.6, handO: [-3, 2], handGlow: 0.6, glow: 0.7, footN: [3, 0], footF: [-3, 0], cape: 0.25 },
        { hipY: -1, head: [0, -1], lean: -1, handM: [1, -7], wM: -1.57, handO: [0, -7], handGlow: 1.3, glow: 1, footN: [3, 0], footF: [-3, 0], cape: 0.45, wave: 1 },
        { hipY: -2, head: [0, -2], lean: -1, handM: [1, -8], wM: -1.57, handO: [0, -8], handGlow: 1.8, glow: 1, footN: [3, 0.5], footF: [-3, 0.5], cape: 0.6, wave: 2 },
        { hipY: 4, head: [1, 1], lean: 4, handM: [8, 2], wM: wand ? 0.2 : -0.35, handO: [7, 3], handGlow: 1, glow: 1, footN: [5, 0], footF: [-4, 0], cape: 0.95, wave: 3, smear: [-1.57, wand ? 0.2 : -0.35] },
        { hipY: 4, head: [1, 1], lean: 3, handM: [7.5, 3], wM: wand ? 0.3 : -0.3, handO: [6, 4], handGlow: 0.5, glow: 0.7, footN: [5, 0], footF: [-4, 0], cape: 0.6, wave: 4 },
        { hipY: 2, lean: 1, handGlow: 0.25, glow: 0.45, footN: [3, 0], footF: [-3, 0], cape: 0.3, wave: 5 },
      ],
    },
    // Feuerball: Stab weit hinter den Kopf, Glut bündeln, mit großem Schritt nach vorne schleudern
    hurl: {
      phases: { windup: [0, 1], active: [2, 3], recover: [4, 5] },
      keys: [
        { hipY: 1, lean: -1, handM: [-1, 0], wM: wand ? -2.4 : -2.1, handO: [3, 3], handGlow: 0.8, glow: 0.7, footN: [2, 0], footF: [-3, 0] },
        { hipY: 2, lean: -2, head: [-1, 0], handM: [-4, -4], wM: wand ? -2.8 : -2.6, handO: [4, 2], handGlow: 1.4, glow: 1, footN: [3, 0], footF: [-4, 0], cape: 0.2, wave: 1 },
        { hipY: 3, lean: 4, head: [1, 0], handM: [7, 0], wM: wand ? -0.1 : -0.35, handO: [-2, 5], handGlow: 0.8, glow: 1, footN: [5, 0], footF: [-4.5, 0], cape: 0.85, wave: 2, smear: [wand ? -2.8 : -2.6, wand ? -0.1 : -0.35] },
        { hipY: 3, lean: 4, head: [1, 0], handM: [7.5, 0.5], wM: wand ? 0 : -0.3, handO: [-2, 5.5], handGlow: 0.4, glow: 0.9, footN: [5, 0], footF: [-4.5, 0], cape: 0.7, wave: 3 },
        { hipY: 2, lean: 2, handM: [5, 3], wM: wand ? 0.2 : -0.7, handO: [0, 6], handGlow: 0.2, glow: 0.6, footN: [3, 0], footF: [-3, 0], cape: 0.45, wave: 4 },
        { hipY: 0, lean: 0, glow: 0.4, cape: 0.25, wave: 5 },
      ],
    },
  }[name];
  return withPhases(new Animation(frames(L, S, DEF.keys), 12, false), DEF.phases);
}

function spinSet(L, S) {
  // Wirbel: Waffe(n) waagrecht nach vorne, verkürzt, nach hinten, verkürzt
  const k = L.classId;
  const two = k === 'rogue';
  return frames(L, S, [
    { hipY: 2, lean: 2, handM: [7, 0], wM: 0, handO: two ? [-6, 1] : [3, 4], wO: Math.PI, cape: 0.7, wave: 0, footN: [3.5, 0], footF: [-3.5, 0] },
    { hipY: 2, lean: 1, handM: [3, 2], wM: 0.2, reach: 0.45, handO: two ? [-2, 2] : [3, 4], wO: Math.PI, reachO: 0.45, cape: 0.8, wave: 1.5, footN: [3, 0], footF: [-3, 0] },
    { hipY: 2, lean: -1, handM: [-6, 0], wM: Math.PI, handO: two ? [6, 1] : [2, 4], wO: 0, cape: 0.9, wave: 3, footN: [3.5, 0], footF: [-3.5, 0] },
    { hipY: 2, lean: 0, handM: [-2, 2], wM: Math.PI - 0.2, reach: 0.45, handO: two ? [3, 2] : [3, 4], wO: 0, reachO: 0.45, cape: 0.8, wave: 4.5, footN: [3, 0], footF: [-3, 0] },
  ]);
}

// --- Öffentliche API ----------------------------------------------------------------------
const cache = new Map();

export function getHeroSprites(raceId = 'human', classId = 'warrior', variant = 0, gear = null, style = null) {
  const rl = RACE_LOOK[raceId] ?? RACE_LOOK.human;
  const v = Math.max(0, Math.min(rl.variants.length - 1, variant | 0));
  const key = `${raceId}|${classId}|${v}|${gearKey(gear)}|${style?.dye ?? ''}|${style?.hairStyle ?? ''}`;
  let set = cache.get(key);
  if (!set) {
    set = buildSet(resolveLook(raceId, classId, v, gear, style));
    cache.set(key, set);
    if (cache.size > 40) cache.delete(cache.keys().next().value);
  }
  return set;
}

// Rückwärtskompatibel für Assets.js (Standardfigur: menschlicher Krieger).
export function createHeroSprites() {
  return getHeroSprites('human', 'warrior', 0);
}
