import { PAL } from './Palette.js';
import { PixelCanvas, outlineCanvas, makeCanvas } from './PixelCanvas.js';
import { decorateItemIcon } from './ItemFx.js';

// Item-, Fähigkeits- und UI-Icons als prozedurale 24×24-Pixel-Art (mit Umriss 26×26).
// Gemeinsam genutzt von HUD (D), Inventar/Beute/Händler (C) und Charaktererstellung (A).
//
//   iconCanvas(id)            -> gecachtes Canvas (26×26 inkl. Umriss)
//   iconUrl(id)               -> Data-URL
//   iconEl(id, cssSize=32)    -> <img> (pixelgenau skaliert)
//   itemIconEl(def, css=40)   -> <span class="ef-item-icon r-<rarity>"> mit Seltenheitsrahmen/Glanz
//   lootSprite(defOrId)       -> kleines Welt-Sprite (≈12 px, mit Umriss) für Beute am Boden
//   drawLoot(ctx, def, x, y, t, opts) -> Beute-Sprite + Seltenheitsstrahl (Fußpunkt x,y)
//   ICON_IDS                  -> alle bekannten IDs
// Unbekannte IDs fallen auf die Familie vor dem ersten "_" zurück (sword_xyz -> sword), sonst 'bag'.
// Licht fällt von oben links (docs/STYLE.md).

const S = 24;

// ---------------------------------------------------------------- Paletten
const M = {
  rusty: ['#2e1a14', '#5a3626', '#7e5440', '#a07a60', '#c8a484'],
  iron: ['#262a36', '#454c5e', '#69738a', '#9ea9bf', '#e2e8f2'],
  steel: ['#222a42', '#3e4e72', '#6a82b0', '#aec2e6', '#f6faff'],
  bronze: ['#3a2410', '#6a4420', '#9a6a30', '#c89a50', '#f4d898'],
  gold: ['#4a2f10', '#8a5a18', '#c8922a', '#f0c85a', '#fff4c0'],
  silver: ['#30343e', '#5a6272', '#9aa4b6', '#d0d8e6', '#ffffff'],
  copper: ['#3a1a10', '#6e3420', '#a85a34', '#d88a58', '#f8c49a'],
  bone: ['#463d30', '#80755c', '#bcae8e', '#e6dcc0', '#fffbef'],
  obsidian: ['#0c0614', '#20122e', '#3a2058', '#6a3aa0', '#c898ff'],
  frost: ['#18306a', '#3470b8', '#72b8ec', '#bee6ff', '#ffffff'],
  ember: ['#3a0e05', '#7a2208', '#c8420c', '#f07a1c', '#ffd890'],
  wood: ['#2a1810', '#4a2c1a', '#6e4428', '#946038', '#b8844e'],
  darkwood: ['#160c0a', '#2a1a14', '#40281e', '#5a3a2a', '#7a5238'],
  ash: ['#3a3028', '#5e5040', '#867358', '#ad9a78', '#d6c6a2'],
  leather: ['#1f130f', '#36231a', '#523628', '#724e38', '#94704e'],
  darkleather: ['#100a0c', '#1e1418', '#2e2026', '#443038', '#5e4650'],
  cloth: ['#1a1630', '#2c2650', '#443c78', '#6658a8', '#9486d0'],
  arcaneCloth: ['#1c0a30', '#361458', '#582090', '#8840c8', '#c080ff'],
  red: ['#2a0508', '#5a0c14', '#98182a', '#d0303c', '#ff8070'],
  blue: ['#0a1838', '#163070', '#2a58b8', '#5a98f0', '#c0e0ff'],
  green: ['#0a2410', '#16461e', '#2a7a34', '#56b850', '#b8f090'],
  purple: ['#1a0a2e', '#3a1466', '#6a2cb0', '#a060f0', '#e8c8ff'],
  yellow: ['#3a2808', '#7a5810', '#c8a020', '#f0dc50', '#fffac0'],
  moss: ['#12200e', '#22381a', '#3a5a2a', '#5e8440', '#9ac070'],
  paper: ['#5a4830', '#8a7450', '#bca880', '#e2d4ac', '#fff6d8'],
  fur: ['#241e26', '#3e3640', '#5e5462', '#867a88', '#b0a6b2'],
};

// ---------------------------------------------------------------- Zeichenhilfen
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pick = (ramp, t) => ramp[clamp(Math.round(t), 0, ramp.length - 1)];
const hash = (x, y, s = 0) => { const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return n - Math.floor(n); };

// Rastert eine Form im lokalen Koordinatensystem einer Achse (x0,y0)->(x1,y1):
// u = Abstand entlang der Achse, v = seitlicher Abstand (v<0 = obere/linke, beleuchtete Seite).
function axis(p, x0, y0, x1, y1, fn) {
  const L = Math.hypot(x1 - x0, y1 - y0), dx = (x1 - x0) / L, dy = (y1 - y0) / L, nx = -dy, ny = dx;
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const px = x + 0.5 - x0, py = y + 0.5 - y0;
    const c = fn(px * dx + py * dy, px * nx + py * ny, L, x, y);
    if (c) p.px(x, y, c);
  }
  return L;
}

// Kugel mit Licht von oben links
function ball(p, cx, cy, r, ramp, { spec = true } = {}) {
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
    if (d > r) continue;
    const lit = (-dx - dy) / (r * 1.4142) * 0.5 + 0.5 - (d / r) * 0.35;
    p.px(x, y, pick(ramp, 1 + lit * 3));
  }
  if (spec) p.px(Math.round(cx - r * 0.45), Math.round(cy - r * 0.45), ramp[ramp.length - 1]);
}

// Facettierter Edelstein
function gem(p, cx, cy, r, ramp) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    if (Math.abs(x) + Math.abs(y) > r) continue;
    const t = x < 0 && y < 0 ? 3 : x >= 0 && y >= 0 ? 1 : 2;
    p.px(cx + x, cy + y, ramp[t]);
  }
  p.px(cx - 1, cy - 1, ramp[4] ?? '#ffffff');
  if (r > 1) p.px(cx, cy - r + 1, ramp[4] ?? '#ffffff');
}

function rect(p, x, y, w, h, c) { p.rect(x, y, w, h, c); }

// ---------------------------------------------------------------- Schwerter & Dolche
// spec: { blade, guard, grip, pommel, len, width, curve, fuller, jag, rust, runes, glow, gemRamp, guardW, short }
function sword(p, o) {
  const B = o.blade, G = o.guard ?? M.iron, H = o.grip ?? M.leather;
  const x0 = o.short ? 5 : 3, y0 = o.short ? 19 : 21, x1 = o.short ? 18 : 21, y1 = o.short ? 6 : 3;
  const hilt = o.short ? 4.2 : 5.2, guardU = hilt + 1.6;
  axis(p, x0, y0, x1, y1, (u, v, L, x, y) => {
    // Knauf
    if (u >= 0 && u < 1.8 && Math.abs(v) <= 1.4) return u < 0.9 ? pick(G, 3) : pick(G, 1 + (v < 0 ? 2 : 0));
    // Griff mit Wicklung
    if (u >= 1.8 && u < hilt && Math.abs(v) <= 0.75) return ((u * 1.4) | 0) % 2 ? H[v < 0 ? 3 : 1] : H[v < 0 ? 4 : 2];
    // Parierstange
    const gw = o.guardW ?? 4.2;
    if (u >= hilt && u < guardU && Math.abs(v) <= gw) {
      if (o.gemRamp && Math.abs(v) < 1) return o.gemRamp[u < hilt + 0.8 ? 4 : 2];
      return pick(G, (v < 0 ? 3 : 1.5) + (u < hilt + 0.8 ? 0.8 : 0) - Math.abs(v) / gw * 0.8);
    }
    // Klinge
    if (u < guardU || u > L) return null;
    const bl = L - guardU, t = (u - guardU) / bl;
    let w = (o.width ?? 2.2) * (t > 0.78 ? Math.max(0, (1 - t) / 0.22) : 1 - t * 0.12);
    if (o.flame) w *= 0.85 + 0.25 * Math.sin(t * 18);
    const vv = v - (o.curve ?? 0) * t * t * bl * 0.12;
    if (Math.abs(vv) > w + 0.15) return null;
    if (o.jag && Math.abs(vv) > w - 0.9 && ((u * 1.3) | 0) % 2 === 0) return null;
    const edge = vv < 0 ? -vv / Math.max(w, 0.5) : vv / Math.max(w, 0.5);
    let c;
    if (vv < 0 && edge > 0.62) c = B[4];            // beleuchtete Schneide
    else if (vv > 0 && edge > 0.62) c = B[1];       // Schattenschneide
    else if (vv < 0) c = B[3];
    else c = B[2];
    if (o.fuller && Math.abs(vv) < 0.45 && t < 0.72) c = B[1];
    if (o.runes && Math.abs(vv) < 0.5 && t > 0.1 && t < 0.72 && ((u * 1.7) | 0) % 2 === 0) c = o.runes[((u | 0) % 2) ? 3 : 4];
    if (o.rust && hash(x, y, 3) < o.rust) c = pick(M.rusty, 1 + hash(x, y, 9) * 2);
    if (o.glow && edge > 0.62 && vv > 0) c = o.glow[3];
    if (o.glow && t > 0.55 && hash(x, y, 5) < 0.35) c = o.glow[4];
    return c;
  });
}

const SWORDS = {
  sword: { blade: M.iron, guard: M.bronze, fuller: true },
  sword_rusty: { blade: M.iron, guard: M.rusty, grip: M.wood, rust: 0.35, jag: true, width: 2.05 },
  sword_iron: { blade: M.iron, guard: M.iron, fuller: true },
  sword_steel: { blade: M.steel, guard: M.steel, fuller: true, grip: M.darkleather },
  sword_broad: { blade: M.steel, guard: M.bronze, width: 2.95, guardW: 5, fuller: true },
  sword_sabre: { blade: M.silver, guard: M.gold, curve: 1.3, width: 2.05 },
  sword_long: { blade: M.steel, guard: M.iron, width: 1.95, guardW: 3.4, fuller: true },
  sword_bone: { blade: M.bone, guard: M.bone, grip: M.darkleather, jag: true, width: 2.45 },
  sword_rune: { blade: M.steel, guard: M.silver, runes: M.purple, width: 2.35, gemRamp: M.purple },
  sword_ember: { blade: M.iron, guard: M.darkwood, glow: M.ember, flame: true, width: 2.45, gemRamp: M.ember, grip: M.darkleather },
  sword_frost: { blade: M.frost, guard: M.silver, width: 2.45, gemRamp: M.blue, fuller: true },
  sword_obsidian: { blade: M.obsidian, guard: M.obsidian, jag: true, width: 2.55, gemRamp: M.purple, grip: M.darkleather },
  sword_royal: { blade: M.silver, guard: M.gold, width: 2.45, guardW: 5, gemRamp: M.red, fuller: true, grip: M.red },
};
const DAGGERS = {
  dagger: { blade: M.iron, guard: M.bronze, short: true, width: 1.85, guardW: 3 },
  dagger_rusty: { blade: M.iron, guard: M.rusty, grip: M.wood, short: true, rust: 0.4, width: 1.75, guardW: 2.4 },
  dagger_iron: { blade: M.iron, guard: M.iron, short: true, width: 1.85, guardW: 3, fuller: true },
  dagger_curved: { blade: M.silver, guard: M.gold, short: true, curve: 2.2, width: 1.85, guardW: 2.6 },
  dagger_venom: { blade: M.green, guard: M.darkwood, short: true, width: 1.95, guardW: 3, glow: M.green },
  dagger_shadow: { blade: M.obsidian, guard: M.obsidian, short: true, width: 1.95, guardW: 3, jag: true, gemRamp: M.purple },
};

// ---------------------------------------------------------------- Äxte & Streitkolben
function haft(p, ramp, len = 1, x0 = 4, y0 = 21) {
  return axis(p, x0, y0, x0 + 16 * len, y0 - 16 * len, (u, v, L) => (u >= 0 && u <= L && Math.abs(v) <= 0.85 ? (v < 0 ? ramp[3] : ramp[1]) : null));
}
function axe(p, o) {
  haft(p, o.haft ?? M.wood);
  const H = o.head;
  axis(p, 4, 21, 20, 5, (u, v, L) => {
    if (u < L - 10 || u > L - 1) return null;
    const k = (u - (L - 10)) / 9; // 0..1 entlang Kopf
    const reach = o.bearded ? 3 + 5 * Math.pow(1 - k, 0.8) * (k > 0.2 ? 1 : k * 5) : 2.5 + 4 * Math.sin(k * Math.PI);
    const back = o.double ? reach : 1.6;
    if (v > reach || v < -back) return null;
    const vv = v > 0 ? v / reach : -v / back;
    if (vv > 0.8) return v > 0 ? (o.glow ? o.glow[4] : H[4]) : H[3];
    return pick(H, 1.5 + (k < 0.5 ? 1 : 0) - vv * 0.5 + (v < 0 ? 1 : 0));
  });
  if (o.glow) for (let i = 0; i < 4; i++) p.px(15 + i, 12 - i + (i % 2), o.glow[3]);
  if (o.spike) { p.px(20, 3, H[4]); p.px(21, 2, H[3]); }
}
const AXES = {
  axe: { head: M.iron },
  axe_hatchet: { head: M.rusty, haft: M.ash },
  axe_iron: { head: M.iron },
  axe_double: { head: M.steel, double: true, haft: M.darkwood, spike: true },
  axe_bearded: { head: M.steel, bearded: true, haft: M.wood },
  axe_ember: { head: M.obsidian, glow: M.ember, double: true, haft: M.darkwood, spike: true },
  axe_bone: { head: M.bone, haft: M.darkleather, bearded: true },
};
function mace(p, o) {
  haft(p, o.haft ?? M.wood, 0.85, 4, 21);
  const H = o.head, cx = 17, cy = 7;
  if (o.club) {
    axis(p, 4, 21, 19, 5, (u, v, L) => (u > L - 9 && u < L && Math.abs(v) < 1.2 + (u - (L - 9)) * 0.28 ? pick(H, 2 + (v < 0 ? 1 : -0.6) - (hash(u | 0, v | 0) < 0.2 ? 1 : 0)) : null));
    p.px(15, 6, H[1]); p.px(18, 9, H[1]);
    return;
  }
  ball(p, cx, cy, o.r ?? 4, H);
  if (o.flanged) for (const [x, y] of [[cx, cy - 6], [cx + 5, cy - 3], [cx + 5, cy + 3], [cx - 5, cy - 3]]) { p.px(x, y, H[3]); p.px(x, y + 1, H[2]); p.px(x + (x > cx ? -1 : 1), y + 1, H[2]); }
  if (o.spikes) for (const [x, y] of [[cx, cy - 6], [cx + 6, cy], [cx, cy + 5], [cx - 6, cy], [cx + 4, cy - 4], [cx - 4, cy - 4], [cx + 4, cy + 4]]) { p.px(x, y, H[4]); }
  if (o.holy) { gem(p, cx, cy, 1, M.yellow); for (const [x, y] of [[cx, cy - 7], [cx + 7, cy], [cx - 7, cy]]) p.px(x, y, M.yellow[4]); }
}
const MACES = {
  mace: { head: M.iron, flanged: true },
  mace_club: { head: M.wood, club: true },
  mace_iron: { head: M.iron, r: 3.5 },
  mace_flanged: { head: M.steel, flanged: true, haft: M.darkwood },
  mace_morningstar: { head: M.iron, spikes: true, haft: M.darkleather },
  mace_holy: { head: M.gold, flanged: true, holy: true, haft: M.bronze },
};

// ---------------------------------------------------------------- Stäbe, Zauberstäbe, Bögen
function staff(p, o) {
  const W = o.wood ?? M.wood;
  axis(p, 3, 23, 18, 6, (u, v, L, x, y) => {
    if (u < 0 || u > L) return null;
    const bend = o.gnarled ? Math.sin(u * 0.9) * 0.6 : 0;
    if (Math.abs(v - bend) > 0.9) return null;
    if (o.bands && ((u | 0) === 5 || (u | 0) === 12)) return M.gold[3];
    return v - bend < 0 ? W[3] : W[1];
  });
  const hx = 18, hy = 5;
  switch (o.top) {
    case 'orb': ball(p, hx + 1, hy - 1, 3.2, o.ramp); p.px(hx - 2, hy + 1, W[3]); p.px(hx + 3, hy + 2, W[2]); p.px(hx + 2, hy + 3, W[3]); break;
    case 'crystal':
      for (let y = -5; y <= 3; y++) for (let x = -2; x <= 2; x++) if (Math.abs(x) <= 2 - Math.max(0, -y - 2) * 0.7) p.px(hx + 1 + x, hy - 1 + y, o.ramp[x < 0 ? 3 : x === 0 ? 4 : 2]);
      p.px(hx - 1, hy + 2, W[3]); p.px(hx + 3, hy + 2, W[2]); break;
    case 'flame':
      for (let y = -6; y <= 2; y++) { const w = Math.max(0, 2.6 - Math.abs(y + 1.5) * 0.45); for (let x = -Math.round(w); x <= Math.round(w); x++) p.px(hx + 1 + x + (y < -3 ? 1 : 0), hy + y, o.ramp[clamp(4 - Math.abs(x) - (y > 0 ? 1 : 0), 1, 4)]); }
      rect(p, hx - 1, hy + 2, 4, 1, M.iron[2]); break;
    case 'skull':
      ball(p, hx + 1, hy - 1, 3, M.bone, { spec: false }); p.px(hx, hy - 1, '#140808'); p.px(hx + 2, hy - 1, '#140808'); rect(p, hx, hy + 2, 3, 1, M.bone[1]);
      if (o.ramp) { p.px(hx, hy - 1, o.ramp[4]); p.px(hx + 2, hy - 1, o.ramp[4]); } break;
    case 'curl':
      for (let a = 0; a < 5.5; a += 0.2) { const r = 3.6 - a * 0.45; p.px(Math.round(hx + 1 + Math.cos(a) * r), Math.round(hy - 1 + Math.sin(a) * r), W[a < 2 ? 3 : 2]); }
      if (o.ramp) gem(p, hx + 1, hy - 1, 1, o.ramp); break;
    case 'arcane':
      for (const [x, y] of [[-3, 0], [3, 0], [0, -4]]) { p.px(hx + 1 + x, hy - 1 + y, M.gold[3]); p.px(hx + 1 + x, hy + y, M.gold[1]); }
      ball(p, hx + 1, hy - 2, 2.4, o.ramp); p.px(hx + 4, hy - 5, o.ramp[4]); p.px(hx - 2, hy - 4, o.ramp[3]); break;
  }
}
const STAFFS = {
  staff: { top: 'orb', ramp: M.purple },
  staff_ash: { wood: M.ash, top: 'curl' },
  staff_gnarled: { wood: M.darkwood, gnarled: true, top: 'curl', ramp: M.green },
  staff_crystal: { wood: M.wood, top: 'crystal', ramp: M.blue, bands: true },
  staff_ember: { wood: M.darkwood, top: 'flame', ramp: M.ember, bands: true },
  staff_frost: { wood: M.silver, top: 'crystal', ramp: M.frost },
  staff_bone: { wood: M.bone, top: 'skull', ramp: M.green },
  staff_arcane: { wood: M.darkwood, top: 'arcane', ramp: M.purple, bands: true },
};
function wand(p, o) {
  const W = o.wood;
  axis(p, 5, 20, 16, 9, (u, v, L) => (u >= 0 && u <= L && Math.abs(v) <= 0.75 + (1 - u / L) * 0.35 ? (u < 4 ? (v < 0 ? M.gold[3] : M.gold[1]) : v < 0 ? W[3] : W[1]) : null));
  if (o.top === 'gem') { gem(p, 17, 8, 2, o.ramp); p.px(20, 5, o.ramp[4]); p.px(14, 5, o.ramp[3]); }
  else if (o.top === 'flame') { ball(p, 17, 8, 2.2, o.ramp); p.px(18, 5, o.ramp[3]); p.px(19, 4, o.ramp[4]); }
  else { ball(p, 17, 8, 1.8, o.ramp); }
}
const WANDS = {
  wand: { wood: M.wood, top: 'flame', ramp: M.ember },
  wand_oak: { wood: M.wood, top: 'orb', ramp: M.green },
  wand_bone: { wood: M.bone, top: 'gem', ramp: M.purple },
  wand_ember: { wood: M.darkwood, top: 'flame', ramp: M.ember },
  wand_crystal: { wood: M.silver, top: 'gem', ramp: M.blue },
};
function bow(p, o) {
  const W = o.wood, span = o.long ? 10 : 8.5, bend = o.recurve ? 1 : 0;
  // Bogenarm als Kurve von oben rechts nach unten links, gespannt nach rechts unten
  const pts = [];
  for (let t = -1; t <= 1.0001; t += 0.02) {
    const along = t * span;
    const off = (1 - t * t) * 4.2 - (o.recurve ? Math.pow(Math.abs(t), 6) * 3 : 0);
    const x = 12 + along * 0.7071 - off * 0.7071 - 1, y = 12 - along * 0.7071 - off * 0.7071;
    pts.push([x, y, Math.abs(t)]);
  }
  for (const [x, y, a] of pts) {
    const th = a < 0.2 ? 1.2 : 0.8;
    for (let k = -th; k <= th; k += 0.5) p.px(x - k * 0.7, y + k * 0.7, k < 0 ? W[3] : W[1]);
  }
  const a = pts[0], b = pts[pts.length - 1];
  p.line(a[0], a[1], b[0], b[1], o.string ?? '#d8d0c0');
  rect(p, 10, 12, 3, 3, o.grip ?? M.leather[3]); p.px(10, 12, M.leather[4]);
  if (o.tips) { p.px(Math.round(a[0]), Math.round(a[1]), o.tips); p.px(Math.round(b[0]), Math.round(b[1]), o.tips); }
  if (o.leaf) for (const [x, y] of [[6, 9], [15, 17], [8, 7]]) { p.px(x, y, M.green[3]); p.px(x + 1, y, M.green[2]); }
  void bend;
}
const BOWS = {
  bow: { wood: M.wood },
  bow_short: { wood: M.ash },
  bow_long: { wood: M.wood, long: true },
  bow_recurve: { wood: M.darkwood, recurve: true, tips: M.gold[3], grip: M.red[3] },
  bow_bone: { wood: M.bone, recurve: true, grip: M.darkleather[3], string: '#a09888' },
  bow_elven: { wood: M.silver, long: true, recurve: true, leaf: true, tips: M.green[4], grip: M.green[2], string: '#e8f0ff' },
};

// ---------------------------------------------------------------- Rüstung & Helme
// Oberkörper-Silhouette (Frontansicht), Stil je Material
function torsoMask(x, y, o) {
  const cx = 11.5;
  if (y < 3 || y > (o.long ? 22 : 20)) return 0;
  const dx = Math.abs(x + 0.5 - cx - 0.5);
  if (y < 5) return dx < 3 && dx > 1 ? 2 : dx <= 1 ? 3 : dx < 6.5 && y >= 4 ? 1 : 0;          // Kragen
  if (y < 10) return dx < 10.5 - (y - 5) * 0.25 ? (dx > 6.5 ? 4 : 1) : 0;                       // Schultern+Arme
  if (y < 15) return dx < 7 - (y - 10) * 0.2 ? (dx > 5.6 && y < 13 ? 4 : 1) : dx > 7 && dx < 9.4 && y < 14 ? 4 : 0;
  return dx < 6 + (o.long ? (y - 15) * 0.55 : 0) ? 1 : 0;
}
function armor(p, o) {
  const R = o.ramp, T = o.trim ?? M.gold;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const m = torsoMask(x, y, o);
    if (!m) continue;
    const dx = x + 0.5 - 12;
    let c = pick(R, 2.4 - dx / 9 - (y - 10) / 18);
    if (m === 3) c = '#0e0a12';
    if (m === 2) c = T[2];
    if (m === 4) c = o.shoulder ? pick(o.shoulder, 2.8 - dx / 7) : pick(R, 1.8 - dx / 8);
    switch (o.style) {
      case 'robe': if (Math.abs(dx) < 1 && y > 4) c = T[3]; if (y === 14) c = T[1]; if (y === (o.long ? 22 : 20)) c = T[2]; break;
      case 'leather': if (y === 14 || y === 15) c = M.leather[0]; if (y === 14 && Math.abs(dx) < 1) c = M.gold[3]; if (Math.abs(dx) < 0.6 && y > 5 && y < 13 && y % 2) c = R[0]; break;
      case 'chain': if (m === 1 && (x + y * 2) % 3 === 0) c = R[0]; if (m === 1 && (x + y * 2) % 3 === 1) c = R[3]; break;
      case 'scale': if (m === 1 && y > 5) { const k = (x + (y % 2) * 1.5) % 3; c = k < 1 ? R[3] : k < 2 ? R[2] : R[0]; } break;
      case 'plate': if (m === 1 && (y === 9 || y === 13 || y === 17)) c = R[0]; if (m === 1 && (y === 8 || y === 12 || y === 16)) c = R[4]; if (m === 1 && Math.abs(dx) < 0.6 && y < 14) c = R[3]; break;
    }
    if (o.tabard && m === 1 && Math.abs(dx) < 2.5 && y > 6) c = pick(o.tabard, 2.5 - dx / 3 - (y > 16 ? 0.7 : 0));
    if (o.glow && m === 1 && hash(x, y, 2) < 0.12 && y > 6) c = o.glow[4];
    if (o.glow && m === 1 && (y === 9 || y === 13) && Math.abs(dx) < 4) c = o.glow[3];
    p.px(x, y, c);
  }
  if (o.emblem) gem(p, 11, 10, 1, o.emblem);
  if (o.rivets) for (const [x, y] of [[7, 8], [16, 8], [7, 12], [16, 12]]) p.px(x, y, M.iron[4]);
}
const ARMORS = {
  armor_cloth: { ramp: M.cloth, style: 'robe', trim: M.gold },
  armor_leather: { ramp: M.leather, style: 'leather', shoulder: M.darkleather },
  armor_mail: { ramp: M.iron, style: 'chain', shoulder: M.steel },
  robe_novice: { ramp: M.ash, style: 'robe', trim: M.wood },
  robe_mage: { ramp: M.cloth, style: 'robe', trim: M.gold, long: true, emblem: M.blue },
  robe_arcane: { ramp: M.arcaneCloth, style: 'robe', trim: M.gold, long: true, emblem: M.purple, glow: M.purple },
  leather_jerkin: { ramp: M.leather, style: 'leather' },
  leather_hunter: { ramp: M.moss, style: 'leather', shoulder: M.fur },
  leather_shadow: { ramp: M.darkleather, style: 'leather', shoulder: M.obsidian, emblem: M.purple },
  mail_chain: { ramp: M.iron, style: 'chain', shoulder: M.iron },
  mail_scale: { ramp: M.bronze, style: 'scale', shoulder: M.bronze },
  plate_iron: { ramp: M.iron, style: 'plate', shoulder: M.steel, rivets: true },
  plate_knight: { ramp: M.steel, style: 'plate', shoulder: M.silver, tabard: M.red, rivets: true },
  plate_ember: { ramp: M.obsidian, style: 'plate', shoulder: M.obsidian, glow: M.ember, emblem: M.ember },
};
function helm(p, o) {
  const R = o.ramp;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x + 0.5 - 12, dy = y + 0.5 - 12;
    const inDome = dx * dx / 64 + dy * dy / 70 <= 1 && y <= 17 && y >= 4;
    if (!inDome) continue;
    let c = pick(R, 3 - (dx + dy) / 8);
    if (o.style === 'nasal' && y >= 10 && Math.abs(dx) < 5 && !(Math.abs(dx) < 1)) c = y < 14 ? '#0c0810' : c;
    if (o.style === 'nasal' && Math.abs(dx) < 1 && y > 8) c = R[4];
    if (o.style === 'nasal' && y === 9) c = R[1];
    if (o.style === 'cap' && y > 12) continue;
    if (o.style === 'cap' && y === 12) c = R[1];
    if (o.style === 'hood' && y > 9 && Math.abs(dx) < 4.2) c = y < 16 ? '#0a0610' : c;
    p.px(x, y, c);
  }
  if (o.style === 'hood') { for (let y = 17; y < 21; y++) rect(p, 4 + (y - 17), y, 16 - (y - 17) * 2, 1, R[1]); p.px(10, 13, M.yellow[4]); p.px(13, 13, M.yellow[4]); }
  if (o.horns) for (let i = 0; i < 6; i++) { p.px(4 - (i > 3 ? 1 : 0), 9 - i, M.bone[3 - (i > 3 ? 1 : 0)]); p.px(3 - (i > 3 ? 1 : 0), 9 - i, M.bone[2]); p.px(19 + (i > 3 ? 1 : 0), 9 - i, M.bone[2]); p.px(20 + (i > 3 ? 1 : 0), 9 - i, M.bone[1]); }
  if (o.crest) for (let y = 1; y < 6; y++) rect(p, 11, y, 2, 1, o.crest[y < 3 ? 4 : 3]);
  if (o.style === 'cap') { rect(p, 3, 12, 18, 2, R[1]); rect(p, 3, 12, 18, 1, R[3]); for (let x = 6; x < 19; x += 3) p.px(x, 8, R[1]); p.px(12, 4, R[4]); }
}
const HELMS = {
  helm: { ramp: M.iron, style: 'nasal', crest: M.red },
  helm_cap: { ramp: M.leather, style: 'cap' },
  helm_iron: { ramp: M.iron, style: 'nasal' },
  helm_horned: { ramp: M.steel, style: 'nasal', horns: true },
  hood: { ramp: M.darkleather, style: 'hood' },
};

// Handschuhe (Handrücken, Finger nach oben) und Stiefel (Seitenansicht)
function gloves(p, o) {
  const R = o.ramp;
  const glove = (ox, flip) => {
    for (let y = 3; y < 22; y++) for (let x = 0; x < 11; x++) {
      const lx = flip ? 10 - x : x;
      let inside = false;
      if (y >= 10 && y < 17 && lx >= 1 && lx <= 9) inside = true;            // Handfläche
      if (y >= 3 && y < 10 && lx >= 2 && lx <= 8 && (lx % 2 === 0 || y > 6)) inside = true; // Finger
      if (y >= 7 && y < 12 && lx === 0) inside = true;                       // Daumen
      if (y >= 17 && y < 22 && lx >= 0 && lx <= 10) inside = true;           // Stulpe
      if (!inside) continue;
      let c = pick(R, 2.8 - lx / 6 - (y - 10) / 16);
      if (y >= 17) c = pick(o.cuff ?? R, 2.6 - lx / 7 - (y === 17 ? -0.8 : 0));
      if (o.style === 'plate' && y >= 10 && y < 17 && (y === 12 || y === 15)) c = R[0];
      if (o.style === 'plate' && y < 10 && y % 3 === 0) c = R[1];
      if (o.style === 'mail' && y >= 10 && y < 17 && (x + y) % 2 === 0) c = R[1];
      if (o.style === 'cloth' && y === 19) c = (o.trim ?? M.gold)[2];
      if (o.glow && y >= 10 && y < 17 && hash(x, y, 4) < 0.15) c = o.glow[4];
      p.px(ox + x, y, c);
    }
    if (o.style === 'plate' || o.style === 'mail') p.px(ox + (flip ? 4 : 6), 13, M.gold[3]);
  };
  glove(1, false); glove(12, true);
}
const GLOVES = {
  gloves: { ramp: M.leather, style: 'leather' },
  gloves_cloth: { ramp: M.cloth, style: 'cloth', cuff: M.cloth },
  gloves_leather: { ramp: M.leather, style: 'leather', cuff: M.darkleather },
  gloves_mail: { ramp: M.iron, style: 'mail', cuff: M.leather },
  gloves_plate: { ramp: M.steel, style: 'plate', cuff: M.steel },
  gloves_ember: { ramp: M.obsidian, style: 'plate', cuff: M.obsidian, glow: M.ember },
};
function boots(p, o) {
  const R = o.ramp;
  for (let y = 2; y < 22; y++) for (let x = 2; x < 22; x++) {
    let inside = false;
    if (y < 15 && x >= 5 && x <= 13 - (y < 5 ? 0 : 0)) inside = true;          // Schaft
    if (y >= 15 && y < 21 && x >= 5 && x <= 20 - Math.max(0, 17 - y) * 1.5) inside = true; // Fuß
    if (!inside) continue;
    let c = pick(R, 2.8 - (x - 5) / 9 - (y - 10) / 20);
    if (y < 4) c = pick(o.cuff ?? R, 3.2 - (x - 5) / 5);
    if (y === 20) c = o.sole ?? M.darkleather[1];
    if (o.style === 'plate' && (y === 7 || y === 11 || y === 16)) c = R[0];
    if (o.style === 'plate' && y > 15 && x > 15) c = R[3];
    if (o.style === 'mail' && y > 3 && y < 15 && (x + y) % 2 === 0) c = R[1];
    if (o.style === 'leather' && x === 9 && y > 4 && y < 15 && y % 2) c = M.leather[0];
    if (o.style === 'cloth' && y === 4) c = (o.trim ?? M.gold)[2];
    if (o.glow && y > 3 && hash(x, y, 7) < 0.14) c = o.glow[4];
    p.px(x, y, c);
  }
  if (o.buckle) { p.rect(5, 12, 9, 1, M.darkleather[1]); p.px(12, 12, M.gold[3]); }
}
const BOOTS = {
  boots: { ramp: M.leather, style: 'leather', buckle: true },
  boots_cloth: { ramp: M.cloth, style: 'cloth', cuff: M.cloth },
  boots_leather: { ramp: M.leather, style: 'leather', cuff: M.fur, buckle: true },
  boots_mail: { ramp: M.iron, style: 'mail', cuff: M.leather, buckle: true },
  boots_plate: { ramp: M.steel, style: 'plate', cuff: M.steel },
  boots_ember: { ramp: M.obsidian, style: 'plate', cuff: M.obsidian, glow: M.ember },
};

// ---------------------------------------------------------------- Schmuck
function ring(p, o) {
  const B = o.band;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (x + 0.5 - 12) / 7, dy = (y + 0.5 - 14) / 5.2, d = Math.hypot(dx, dy);
    if (d > 1 || d < 0.62) continue;
    p.px(x, y, pick(B, 2.5 - dx * 1.4 - (dy < 0 ? 0.6 : -0.3)));
  }
  if (o.gem) { gem(p, 12, 8, 3, o.gem); rect(p, 10, 11, 5, 1, B[1]); p.px(9, 9, B[3]); p.px(15, 9, B[2]); }
  else { p.px(8, 11, B[4]); p.px(9, 10, B[4]); }
}
function amulet(p, o) {
  const C = o.chain ?? M.gold;
  for (let i = 0; i <= 12; i++) { const t = i / 12, x = 4 + t * 7, y = 2 + Math.sin(t * Math.PI * 0.5) * 9; p.px(x, y, C[i % 2 ? 2 : 3]); p.px(24 - 1 - x, y, C[i % 2 ? 1 : 2]); }
  switch (o.style) {
    case 'bone': ball(p, 12, 16, 3.6, M.bone, { spec: false }); p.px(11, 15, '#140808'); p.px(13, 15, '#140808'); rect(p, 11, 18, 3, 1, M.bone[1]); break;
    case 'sun': ball(p, 12, 16, 3.5, M.gold); for (let a = 0; a < 8; a++) p.px(Math.round(12 + Math.cos(a * 0.785) * 5.5), Math.round(16 + Math.sin(a * 0.785) * 5.5), M.yellow[a % 2 ? 3 : 4]); gem(p, 12, 16, 1, M.red); break;
    default: {
      for (let y = 12; y < 22; y++) for (let x = 7; x < 17; x++) { const dx = x + 0.5 - 12, dy = y + 0.5 - 16.5; if (Math.abs(dx) + Math.abs(dy) * 0.9 < 4.8) p.px(x, y, pick(C, 3 - (dx + dy) / 3)); }
      gem(p, 12, 16, 2, o.gem ?? M.red);
    }
  }
}
function charm(p, o) {
  p.line(12, 1, 12, 5, M.leather[3]); rect(p, 11, 5, 3, 2, M.iron[3]);
  if (o.style === 'skull') { ball(p, 12, 12, 5, M.bone, { spec: false }); rect(p, 9, 11, 2, 2, '#140808'); rect(p, 14, 11, 2, 2, '#140808'); p.px(9, 11, M.green[4]); p.px(14, 11, M.green[4]); rect(p, 10, 16, 5, 2, M.bone[2]); for (const x of [10, 12, 14]) p.px(x, 17, '#140808'); }
  if (o.style === 'feather') { for (let i = 0; i < 14; i++) { const x = 12 + Math.sin(i * 0.25) * 2, y = 7 + i; rect(p, x - 3 + i * 0.12, y, 3, 1, M.red[i < 7 ? 3 : 2]); rect(p, x, y, 3 - i * 0.15, 1, M.red[i < 7 ? 4 : 3]); p.px(x, y, M.bone[3]); } }
  if (o.style === 'tooth') { for (let y = 7; y < 21; y++) { const w = Math.max(0.5, 3.4 - (y - 7) * 0.24); for (let x = -w; x <= w; x++) p.px(12 + x + (y - 7) * 0.2, y, pick(M.bone, 3.2 - x * 0.5 - (y - 7) * 0.06)); } rect(p, 9, 7, 7, 2, M.leather[2]); }
}
const JEWELRY = {
  ring: () => ({ f: ring, o: { band: M.gold, gem: M.blue } }),
  ring_copper: () => ({ f: ring, o: { band: M.copper } }),
  ring_silver: () => ({ f: ring, o: { band: M.silver } }),
  ring_gold: () => ({ f: ring, o: { band: M.gold } }),
  ring_ruby: () => ({ f: ring, o: { band: M.gold, gem: M.red } }),
  ring_sapphire: () => ({ f: ring, o: { band: M.silver, gem: M.blue } }),
  ring_emerald: () => ({ f: ring, o: { band: M.gold, gem: M.green } }),
  ring_amethyst: () => ({ f: ring, o: { band: M.silver, gem: M.purple } }),
  amulet: () => ({ f: amulet, o: { gem: M.red } }),
  amulet_bone: () => ({ f: amulet, o: { style: 'bone', chain: M.leather } }),
  amulet_silver: () => ({ f: amulet, o: { chain: M.silver, gem: M.blue } }),
  amulet_ruby: () => ({ f: amulet, o: { gem: M.red } }),
  amulet_sun: () => ({ f: amulet, o: { style: 'sun' } }),
  charm: () => ({ f: charm, o: { style: 'skull' } }),
  charm_skull: () => ({ f: charm, o: { style: 'skull' } }),
  charm_feather: () => ({ f: charm, o: { style: 'feather' } }),
  charm_tooth: () => ({ f: charm, o: { style: 'tooth' } }),
};

// ---------------------------------------------------------------- Verbrauchsgüter
function potion(p, o) {
  const F = o.fill, size = o.size ?? 2;
  const r = [4.2, 5.2, 6.4][size - 1] ?? 5.2, cy = 23 - r - 1;
  const neckH = [3, 4, 4][size - 1] ?? 4, neckTop = cy - r - neckH + 1;
  // Hals + Korken
  rect(p, 10, neckTop, 4, neckH + 1, '#8a9ab0'); rect(p, 10, neckTop, 1, neckH + 1, '#c8d4e4');
  rect(p, 9, neckTop - 3, 6, 3, M.wood[3]); rect(p, 9, neckTop - 3, 6, 1, M.wood[4]); rect(p, 13, neckTop - 2, 2, 2, M.wood[1]);
  if (size === 3) rect(p, 9, neckTop + 1, 6, 1, M.gold[3]);
  // Bauch: Glas + Flüssigkeit
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(12 - r); x <= 12 + r; x++) {
    const dx = x + 0.5 - 12, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
    if (d > r) continue;
    const level = cy - r * 0.35;
    if (d > r - 1) p.px(x, y, dy < 0 ? '#9aaac0' : '#4a5a74');
    else if (y + 0.5 < level) p.px(x, y, '#1e2436');
    else p.px(x, y, pick(F, 3 - (dx + dy) / r * 1.2));
  }
  p.px(Math.round(12 - r * 0.5), Math.round(cy - r * 0.2), '#ffffff'); p.px(Math.round(12 - r * 0.5), Math.round(cy - r * 0.2) + 1, '#dfe7f2');
  for (let i = 0; i < size; i++) p.px(13 + i, Math.round(cy + i), F[4]); // Bläschen
}
const CONSUMABLES = {
  potion_hp: { f: potion, o: { fill: M.red, size: 2 } },
  potion_hp_s: { f: potion, o: { fill: M.red, size: 1 } },
  potion_hp_m: { f: potion, o: { fill: M.red, size: 2 } },
  potion_hp_l: { f: potion, o: { fill: M.red, size: 3 } },
  potion_mana: { f: potion, o: { fill: M.blue, size: 2 } },
  potion_mana_s: { f: potion, o: { fill: M.blue, size: 1 } },
  potion_mana_m: { f: potion, o: { fill: M.blue, size: 2 } },
  potion_mana_l: { f: potion, o: { fill: M.blue, size: 3 } },
  elixir: { f: potion, o: { fill: M.yellow, size: 3 } },
};

// ---------------------------------------------------------------- Einzelne Motive
const DRAW = {
  food(p) { DRAW.food_bread(p); },
  food_bread(p) {
    for (let y = 8; y < 19; y++) for (let x = 3; x < 21; x++) { const dx = (x + 0.5 - 12) / 8.5, dy = (y + 0.5 - 14) / 5; const d = dx * dx + dy * dy; if (d <= 1) p.px(x, y, pick(M.bronze, 3.4 - (dx + dy) * 1.2 - (d > 0.8 ? 1 : 0))); }
    for (const x of [7, 11, 15]) { p.line(x, 10, x + 2, 12, M.bronze[1]); p.px(x, 10, M.bronze[4]); }
  },
  food_meat(p) {
    for (let y = 5; y < 18; y++) for (let x = 3; x < 17; x++) { const dx = (x + 0.5 - 10) / 6.5, dy = (y + 0.5 - 11) / 5.5; if (dx * dx + dy * dy <= 1) p.px(x, y, pick(['#3a1410', '#6a2418', '#9a3a28', '#c05a40', '#e08a6a'], 3.4 - (dx + dy) * 1.3)); }
    rect(p, 5, 8, 6, 2, '#e8c0a0'); p.line(15, 15, 20, 20, M.bone[3]); p.line(16, 15, 21, 20, M.bone[2]); ball(p, 20, 20, 1.8, M.bone, { spec: false });
  },
  scroll(p) {
    rect(p, 5, 4, 14, 16, M.paper[3]); for (let y = 4; y < 20; y++) p.px(18, y, M.paper[2]);
    rect(p, 3, 2, 18, 3, M.paper[2]); rect(p, 3, 2, 18, 1, M.paper[4]); rect(p, 3, 19, 18, 3, M.paper[2]); rect(p, 3, 21, 18, 1, M.paper[1]);
    for (let y = 7; y < 17; y += 2) { let x = 7; while (x < 16) { const l = 1 + ((x * 7 + y) % 3); rect(p, x, y, l, 1, M.paper[0]); x += l + 1; } }
    rect(p, 14, 18, 3, 5, M.red[3]); ball(p, 15, 18, 1.6, M.red, { spec: false });
  },
  letter(p) {
    rect(p, 3, 6, 18, 13, M.paper[3]); p.line(3, 6, 12, 13, M.paper[1]); p.line(20, 6, 12, 13, M.paper[1]);
    rect(p, 3, 18, 18, 1, M.paper[1]); ball(p, 12, 13, 2.2, M.red); p.px(11, 12, M.red[4]);
  },
  map(p) {
    for (let y = 4; y < 20; y++) rect(p, 3, y, 18, 1, (y % 5 === 0) ? M.paper[2] : M.paper[3]);
    for (const x of [8, 14]) for (let y = 4; y < 20; y++) p.px(x, y, M.paper[1]);
    p.line(5, 16, 9, 12, M.red[3]); p.line(9, 12, 13, 14, M.red[3]); p.line(13, 14, 17, 8, M.red[3]);
    p.line(16, 7, 18, 9, M.red[4]); p.line(18, 7, 16, 9, M.red[4]); rect(p, 5, 6, 2, 2, M.green[2]); rect(p, 11, 17, 3, 1, M.blue[3]);
  },
  spider_silk(p) {
    ball(p, 12, 13, 7, ['#6a6480', '#9a94b0', '#c8c4d8', '#e8e6f4', '#ffffff'], { spec: false });
    for (let i = 0; i < 5; i++) p.line(6 + i, 8 + i * 2, 18 - i, 9 + i * 2, '#9a94b0');
    p.line(12, 1, 12, 6, '#d8d4e8'); p.px(9, 9, '#ffffff'); p.px(10, 8, '#ffffff');
  },
  bone(p) {
    axis(p, 4, 20, 20, 4, (u, v, L) => (u > 2.5 && u < L - 2.5 && Math.abs(v) <= 1.3 ? (v < 0 ? M.bone[4] : M.bone[2]) : null));
    for (const [x, y] of [[4, 18], [6, 20], [18, 4], [20, 6]]) ball(p, x, y, 2.2, M.bone, { spec: false });
  },
  fang(p) {
    for (let y = 3; y < 22; y++) { const w = Math.max(0.3, 4 - (y - 3) * 0.2); for (let x = -w; x <= w; x++) p.px(9 + x + (y - 3) * 0.35, y, pick(M.bone, 3.4 - x * 0.45 - (y - 3) * 0.04)); }
    rect(p, 4, 3, 10, 2, M.bone[1]); p.px(7, 6, M.bone[4]);
  },
  pelt(p) {
    for (let y = 3; y < 22; y++) for (let x = 2; x < 22; x++) {
      const dx = (x + 0.5 - 12) / 8, dy = (y + 0.5 - 12.5) / 7.5; let d = dx * dx + dy * dy;
      const leg = (Math.abs(Math.abs(dx) - 0.95) < 0.25 && Math.abs(Math.abs(dy) - 0.85) < 0.3);
      if (d > 1 && !leg) continue;
      p.px(x, y, pick(M.fur, 3 - (dx + dy) * 0.9 + (hash(x, y) < 0.25 ? -1 : 0)));
    }
    for (let y = 6; y < 19; y += 3) p.line(9, y, 15, y + 1, M.fur[1]);
  },
  cloth(p) {
    for (let y = 6; y < 19; y++) rect(p, 3 + (y % 2), y, 17, 1, pick(M.cloth, 3 - (y - 6) / 6));
    rect(p, 3, 6, 18, 2, M.cloth[4]); p.line(4, 18, 20, 18, M.cloth[0]); rect(p, 15, 3, 2, 17, M.gold[2]);
  },
  ore(p) { DRAW.ore_iron(p); },
  ore_iron(p) {
    ball(p, 11, 13, 7.5, ['#1a1622', '#252030', '#312a3d', '#4d4459', '#6f667c'], { spec: false });
    for (const [x, y] of [[8, 10], [13, 13], [10, 16], [15, 9], [7, 14]]) { p.px(x, y, M.rusty[3]); p.px(x + 1, y, M.iron[4]); p.px(x, y + 1, M.rusty[1]); }
  },
  ore_ember(p) {
    ball(p, 11, 13, 7.5, ['#140a0c', '#241418', '#342024', '#4a3034', '#6a4a4a'], { spec: false });
    for (const [x, y] of [[8, 10], [13, 13], [10, 16], [15, 9], [7, 14], [12, 8]]) { p.px(x, y, M.ember[3]); p.px(x + 1, y, M.ember[4]); p.px(x, y + 1, M.ember[2]); }
  },
  gem(p) { DRAW.gem_ruby(p); },
  gem_ruby(p) { bigGem(p, M.red); },
  gem_sapphire(p) { bigGem(p, M.blue); },
  gem_amethyst(p) { bigGem(p, M.purple); },
  essence_shadow(p) {
    ball(p, 12, 13, 6.5, M.obsidian);
    for (let a = 0; a < 6.28; a += 0.4) p.px(Math.round(12 + Math.cos(a) * 8.5), Math.round(13 + Math.sin(a) * 8.5), a % 1.2 < 0.4 ? M.purple[4] : M.purple[2]);
    p.px(10, 11, '#ffffff');
  },
  dust(p) {
    for (let y = 12; y < 21; y++) for (let x = 3; x < 21; x++) { const dx = (x + 0.5 - 12) / 8.5, dy = (y + 0.5 - 20) / 7; if (dx * dx + dy * dy <= 1) p.px(x, y, pick(M.bone, 2.6 - dx - dy * 0.5 + (hash(x, y) < 0.3 ? -1 : 0))); }
    for (const [x, y] of [[8, 9], [14, 7], [11, 5], [17, 10]]) p.px(x, y, M.bone[3]);
  },
  key(p) { DRAW.key_iron(p); },
  key_iron(p) { keyShape(p, M.iron); },
  key_bone(p) { keyShape(p, M.bone, true); },
  seal(p) {
    ball(p, 12, 12, 8, M.red);
    for (let a = 0; a < 6.28; a += 0.35) p.px(Math.round(12 + Math.cos(a) * 8.3), Math.round(12 + Math.sin(a) * 8.3), M.red[a < 3 ? 2 : 1]);
    ball(p, 12, 12, 4, M.gold); p.px(12, 9, M.bone[4]); rect(p, 10, 11, 5, 1, M.gold[1]); p.px(12, 14, M.gold[0]);
  },
  relic(p) {
    ball(p, 12, 10, 7, M.bone, { spec: false });
    rect(p, 7, 14, 10, 6, M.bone[2]); rect(p, 7, 14, 10, 1, M.bone[3]);
    rect(p, 8, 8, 3, 3, '#140808'); rect(p, 13, 8, 3, 3, '#140808'); p.px(9, 9, M.purple[4]); p.px(14, 9, M.purple[4]);
    p.px(11, 12, '#140808'); p.px(12, 12, '#140808'); for (const x of [8, 10, 12, 14]) rect(p, x, 17, 1, 3, M.bone[1]);
    rect(p, 5, 3, 14, 1, M.gold[3]); for (const x of [6, 12, 17]) { p.px(x, 2, M.gold[4]); p.px(x, 1, M.gold[3]); }
  },
  gold(p) {
    const coin = (cx, cy) => { for (let y = -2; y <= 2; y++) for (let x = -4; x <= 4; x++) if ((x * x) / 20 + (y * y) / 6 <= 1) p.px(cx + x, cy + y, pick(M.gold, 3.2 - (x + y) / 3)); rect(p, cx - 4, cy + 2, 9, 1, M.gold[1]); p.px(cx - 2, cy - 1, M.gold[4]); };
    coin(8, 18); coin(15, 18); coin(11, 15); coin(14, 12); coin(9, 10);
  },
  gold_pile(p) {
    for (let y = 8; y < 22; y++) for (let x = 2; x < 22; x++) { const dx = (x + 0.5 - 12) / 10, dy = (y + 0.5 - 21) / 12; if (dx * dx + dy * dy <= 1) p.px(x, y, pick(M.gold, 3.2 - dx * 1.2 - dy * 0.6 + (hash(x, y) < 0.3 ? -1 : 0))); }
    for (const [x, y] of [[8, 12], [13, 10], [16, 15], [6, 17], [11, 16]]) { p.px(x, y, M.gold[4]); p.px(x + 1, y, M.yellow[4]); }
    gem(p, 12, 13, 1, M.red);
  },
  bag(p) {
    for (let y = 8; y < 22; y++) for (let x = 3; x < 21; x++) { const dx = (x + 0.5 - 12) / 8, dy = (y + 0.5 - 15.5) / 6.5; if (dx * dx + dy * dy <= 1) p.px(x, y, pick(M.leather, 3.2 - (dx + dy) * 1.3)); }
    rect(p, 9, 4, 6, 4, M.leather[2]); rect(p, 9, 4, 2, 4, M.leather[3]); rect(p, 7, 3, 10, 2, M.leather[3]);
    rect(p, 8, 8, 8, 1, M.gold[2]); p.px(10, 8, M.gold[4]);
  },
  // --- UI-Symbole (HUD-Knöpfe)
  ui_bag(p) { DRAW.bag(p); ball(p, 16, 16, 2.2, M.gold); },
  ui_character(p) {
    // Büste: Kopf, Kapuzenumhang, Schulterpanzer mit Goldbrosche
    for (let y = 13; y < 23; y++) for (let x = 2; x < 22; x++) { const dx = (x + 0.5 - 12) / 10, dy = (y + 0.5 - 23) / 10; if (dx * dx + dy * dy <= 1) p.px(x, y, pick(M.red, 3 - dx * 1.4 - (y - 13) / 8)); }
    for (const sx of [5, 19]) for (let y = 13; y < 18; y++) for (let x = sx - 4; x <= sx + 4; x++) { const dx = (x - sx) / 4.5, dy = (y + 0.5 - 16) / 3; if (dx * dx + dy * dy <= 1) p.px(x, y, pick(M.steel, 3.2 - dx - dy * 0.8)); }
    for (let y = 2; y < 15; y++) for (let x = 5; x < 19; x++) { const dx = (x + 0.5 - 12) / 6.4, dy = (y + 0.5 - 9) / 7; if (dx * dx + dy * dy <= 1) p.px(x, y, pick(M.red, 3.2 - dx * 1.5 - dy)); }
    for (let y = 5; y < 14; y++) for (let x = 8; x < 16; x++) { const dx = (x + 0.5 - 12) / 3.8, dy = (y + 0.5 - 9.6) / 4.4; if (dx * dx + dy * dy <= 1) p.px(x, y, pick(['#3a2418', '#6a4230', '#a8745a', '#d8a080', '#f0c8a8'], 3 - dx * 1.2 - dy * 0.6)); }
    rect(p, 9, 5, 6, 2, '#2a1c14'); p.px(10, 9, '#140c08'); p.px(13, 9, '#140c08'); rect(p, 11, 12, 2, 1, '#6a4230');
    ball(p, 12, 17, 1.8, M.gold);
  },
  ui_quests(p) {
    rect(p, 5, 3, 15, 18, '#3a1418'); rect(p, 5, 3, 15, 1, '#6a2a2a'); rect(p, 5, 3, 2, 18, '#2a0a0e');
    rect(p, 7, 4, 12, 16, M.paper[3]); rect(p, 18, 4, 1, 16, M.paper[1]);
    for (let y = 7; y < 18; y += 2) rect(p, 9, y, 7 - (y % 4 ? 2 : 0), 1, M.paper[1]);
    rect(p, 15, 2, 2, 8, M.red[3]); p.px(15, 10, M.red[2]); p.px(16, 10, '#00000000');
    p.px(12, 13, M.gold[3]);
  },
  ui_menu(p) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - 12, dy = y + 0.5 - 12, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const tooth = Math.cos(a * 8) > 0.2 ? 9.5 : 7.5;
      if (d > tooth || d < 3.2) continue;
      p.px(x, y, pick(M.iron, 2.6 - (dx + dy) / 9 + (d < 5 ? -0.6 : 0)));
    }
    ball(p, 12, 12, 2.2, M.gold, { spec: false });
  },
  ui_map(p) { DRAW.map(p); },
  ui_talents(p) {
    // Talentbaum: drei Reihen Knoten, mit Goldlinien verbunden, der oberste glüht
    const nodes = [[12, 4], [6, 11], [18, 11], [4, 19], [12, 19], [20, 19]];
    for (const [a, b] of [[0, 1], [0, 2], [1, 3], [1, 4], [2, 4], [2, 5]]) { p.line(nodes[a][0], nodes[a][1], nodes[b][0], nodes[b][1], M.gold[1]); p.line(nodes[a][0] + 1, nodes[a][1], nodes[b][0] + 1, nodes[b][1], M.gold[2]); }
    nodes.forEach(([x, y], i) => { gem(p, x, y, 2.6, i === 0 ? M.ember : i < 3 ? M.gold : M.purple); });
  },
  ui_achievements(p) {
    // Pokal mit Lorbeer
    for (let y = 3; y < 13; y++) { const w = 7 - Math.max(0, y - 8) * 1.1; for (let x = -w; x <= w; x++) p.px(12 + x, y, pick(M.gold, 3.4 - x / 3 - (y - 3) / 8)); }
    for (const sx of [-1, 1]) for (let a = 0; a < 3.2; a += 0.15) p.px(12 + sx * (7 + Math.sin(a) * 3), 5 + a * 1.3, M.gold[2]);
    rect(p, 11, 13, 3, 4, M.gold[2]); rect(p, 12, 13, 1, 4, M.gold[3]); rect(p, 7, 17, 11, 2, M.gold[3]); rect(p, 6, 19, 13, 3, M.darkwood[3]); rect(p, 6, 19, 13, 1, M.darkwood[4]);
    rect(p, 7, 4, 2, 5, M.gold[4]); p.px(8, 3, '#ffffff'); gem(p, 12, 8, 1.6, M.red);
  },
  ui_dodge(p) {
    boots(p, { ramp: M.leather, style: 'leather', cuff: M.fur });
    for (const [y, l] of [[8, 5], [12, 3], [16, 4]]) { rect(p, 0, y, l, 1, M.blue[3]); p.px(l, y, M.blue[4]); }
  },
  ui_interact(p) {
    // offene Hand
    for (let y = 4; y < 22; y++) for (let x = 3; x < 21; x++) {
      const palm = y >= 11 && y < 21 && x >= 6 && x <= 17;
      const finger = y >= 4 && y < 12 && [7, 10, 13, 16].some((fx) => x >= fx && x <= fx + 1) && !(x >= 16 && y < 6);
      const thumb = y >= 11 && y < 16 && x >= 3 && x <= 6 && x - 3 >= (15 - y) * 0.6;
      if (!(palm || finger || thumb)) continue;
      p.px(x, y, pick(['#5a3a30', '#8a5a44', '#c08a68', '#e0ac88', '#f4d0b0'], 3.2 - (x - 6) / 8 - (y - 10) / 14));
    }
    rect(p, 6, 20, 12, 2, M.leather[2]);
  },
};
function bigGem(p, R) {
  for (let y = 4; y < 21; y++) for (let x = 3; x < 21; x++) {
    const dx = x + 0.5 - 12, dy = y + 0.5 - 12;
    if (y < 9) { if (Math.abs(dx) < 4 + (y - 4) * 1.1) p.px(x, y, y < 6 ? R[4] : Math.abs(dx) < 3 ? R[3] : dx < 0 ? R[3] : R[2]); continue; }
    const w = 9.5 - (y - 9) * 0.82;
    if (Math.abs(dx) < w) p.px(x, y, dx < -w * 0.35 ? R[3] : dx > w * 0.35 ? R[1] : R[2]);
  }
  rect(p, 5, 9, 14, 1, R[4]); p.px(9, 6, '#ffffff'); p.px(8, 7, '#ffffff'); p.px(10, 12, R[4]);
}
function keyShape(p, R, bone) {
  for (let y = 2; y < 12; y++) for (let x = 2; x < 12; x++) { const d = Math.hypot(x + 0.5 - 7, y + 0.5 - 7); if (d <= 4.6 && d >= 2.2) p.px(x, y, pick(R, 3 - (x + y - 14) / 4)); }
  axis(p, 9, 9, 21, 21, (u, v, L) => (u >= 0 && u < L && Math.abs(v) < 1.1 ? (v < 0 ? R[3] : R[1]) : null));
  rect(p, 16, 18, 2, 4, R[2]); rect(p, 19, 15, 4, 2, R[2]); rect(p, 13, 16, 2, 3, R[2]);
  if (bone) { p.px(6, 6, M.purple[4]); } else p.px(5, 4, R[4]);
}

// ---------------------------------------------------------------- Fähigkeiten (skill_*)
// Quadratisches Emblem: Hintergrund in Elementfarbe mit Vignette, darauf ein helles Symbol.
function skillBase(p, R) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x + 0.5 - 12, dy = y + 0.5 - 12, d = Math.hypot(dx, dy * 1.05);
    p.px(x, y, pick(R, 2.4 - d / 7 - (dx + dy) / 30));
  }
  for (let i = 0; i < S; i++) { p.px(i, 0, R[3]); p.px(0, i, R[3]); p.px(i, S - 1, R[0]); p.px(S - 1, i, R[0]); }
}
const SKILLS = {
  skill_fireball(p) {
    skillBase(p, M.ember);
    for (let i = 0; i < 9; i++) { const w = 3.2 - i * 0.3; for (let k = -w; k <= w; k++) p.px(8 - i * 0.6 + k * 0.7, 16 - i * 0.9 - k * 0.7 + (i % 2), M.ember[i < 3 ? 3 : 2]); }
    ball(p, 14, 10, 4.2, ['#7a2208', '#f07a1c', '#ffb640', '#fff0b0', '#ffffff']);
  },
  skill_frostbolt(p) {
    skillBase(p, M.blue);
    for (let a = 0; a < 6; a++) { const ang = a * Math.PI / 3; for (let r = 0; r < 8; r++) p.px(12 + Math.cos(ang) * r, 12 + Math.sin(ang) * r, r > 5 ? M.frost[3] : M.frost[4]); p.px(12 + Math.cos(ang) * 5 + Math.cos(ang + 1) * 2, 12 + Math.sin(ang) * 5 + Math.sin(ang + 1) * 2, M.frost[3]); }
    ball(p, 12, 12, 2, M.frost);
  },
  skill_nova(p) {
    skillBase(p, M.purple);
    for (let a = 0; a < 6.28; a += 0.12) for (const r of [8, 5]) p.px(12 + Math.cos(a) * r, 12 + Math.sin(a) * r, r === 8 ? M.purple[4] : M.purple[3]);
    ball(p, 12, 12, 2.4, M.purple);
  },
  skill_lightning(p) {
    skillBase(p, M.blue);
    const pts = [[15, 2], [9, 11], [14, 11], [8, 22]];
    for (let i = 0; i < 3; i++) { p.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], '#ffffff'); p.line(pts[i][0] + 1, pts[i][1], pts[i + 1][0] + 1, pts[i + 1][1], M.yellow[4]); }
  },
  skill_heal(p) {
    skillBase(p, M.green);
    rect(p, 9, 4, 6, 16, M.green[4]); rect(p, 4, 9, 16, 6, M.green[4]); rect(p, 10, 5, 4, 14, '#ffffff'); rect(p, 5, 10, 14, 4, '#ffffff');
  },
  skill_holy(p) {
    skillBase(p, M.yellow);
    for (let a = 0; a < 12; a++) { const ang = a * Math.PI / 6; for (let r = 5; r < (a % 2 ? 9 : 11); r++) p.px(12 + Math.cos(ang) * r, 12 + Math.sin(ang) * r, M.yellow[a % 2 ? 3 : 4]); }
    ball(p, 12, 12, 4, ['#8a5a18', '#e8a830', '#ffd66a', '#fff0b0', '#ffffff']);
  },
  skill_shield(p) {
    skillBase(p, M.iron);
    for (let y = 4; y < 21; y++) { const w = y < 13 ? 7 : 7 - (y - 13) * 0.9; for (let x = -w; x <= w; x++) p.px(12 + x, y, pick(M.steel, 3 - x / 5 - (y - 4) / 14)); }
    rect(p, 11, 5, 2, 14, M.gold[3]); rect(p, 6, 10, 12, 2, M.gold[3]); p.px(12, 11, M.red[4]);
  },
  skill_charge(p) {
    skillBase(p, M.red);
    for (const [y, l] of [[7, 8], [11, 11], [15, 7]]) { rect(p, 2, y, l, 1, M.red[4]); rect(p, 2, y + 1, l - 2, 1, M.red[3]); }
    for (let i = 0; i < 6; i++) { rect(p, 12 + i, 5 + i, 2, 1, '#ffffff'); rect(p, 12 + i, 19 - i, 2, 1, '#ffffff'); }
  },
  skill_whirlwind(p) {
    skillBase(p, M.red);
    for (let a = 0; a < 9; a += 0.08) { const r = 1 + a * 1.05; p.px(12 + Math.cos(a * 1.6) * r, 12 + Math.sin(a * 1.6) * r * 0.9, a > 6 ? '#ffffff' : M.red[4]); }
  },
  skill_rage(p) {
    skillBase(p, M.red);
    ball(p, 12, 12, 6, ['#3a0808', '#7a1414', '#c02828', '#ff5a40', '#ffc0a0']);
    rect(p, 8, 10, 3, 1, '#140808'); rect(p, 13, 10, 3, 1, '#140808'); rect(p, 9, 15, 6, 1, '#140808');
    for (const [x, y] of [[5, 4], [19, 4], [4, 12], [20, 12]]) { p.px(x, y, M.ember[4]); p.px(x, y + 1, M.ember[3]); }
  },
  skill_arrows(p) {
    skillBase(p, M.moss);
    for (const o of [-5, 0, 5]) { p.line(4 + o, 20, 16 + o, 8, M.wood[4]); rect(p, 15 + o, 5, 3, 3, M.iron[4]); p.px(4 + o, 20, M.red[4]); p.px(5 + o, 20, M.red[3]); }
  },
  skill_poison(p) {
    skillBase(p, M.green);
    for (let y = 4; y < 20; y++) { const w = y < 12 ? (y - 4) * 0.55 : 4.4 - (y - 12) * 0.1 - Math.max(0, y - 16); for (let x = -w; x <= w; x++) p.px(12 + x, y, pick(M.green, 3.6 - x / 3 - (y - 4) / 10)); }
    p.px(10, 13, '#ffffff'); p.px(10, 14, M.green[4]);
  },
  skill_stealth(p) {
    skillBase(p, M.obsidian);
    ball(p, 12, 12, 7, M.obsidian, { spec: false });
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (Math.hypot(x + 0.5 - 15, y + 0.5 - 10) < 6.5 && Math.hypot(x + 0.5 - 12, y + 0.5 - 12) < 7) p.px(x, y, M.obsidian[1]);
    p.px(9, 11, M.purple[4]); p.px(12, 11, M.purple[4]);
  },
  skill_shadow(p) {
    skillBase(p, M.obsidian);
    for (let a = 0; a < 6.28; a += 0.07) { const r = 3 + 5 * Math.abs(Math.sin(a * 2.5)); p.px(12 + Math.cos(a) * r, 12 + Math.sin(a) * r, M.purple[r > 6 ? 3 : 4]); }
    ball(p, 12, 12, 2.4, M.purple);
  },
  skill_slash(p) {
    skillBase(p, M.iron);
    for (let a = -1.2; a < 1.2; a += 0.05) { const r = 9; p.px(8 + Math.cos(a) * r, 12 + Math.sin(a) * r, '#ffffff'); p.px(7 + Math.cos(a) * r, 12 + Math.sin(a) * r, M.steel[3]); }
    sword(p, { blade: M.steel, guard: M.gold, short: true, width: 1.8, guardW: 3 });
  },
  skill_shout(p) {
    skillBase(p, M.red);
    // brüllender Mund mit Schallwellen
    for (let y = 7; y < 18; y++) for (let x = 3; x < 12; x++) { const dx = (x + 0.5 - 7) / 4.2, dy = (y + 0.5 - 12.5) / 5.2; if (dx * dx + dy * dy <= 1) p.px(x, y, pick(['#2a0606', '#5a0e0e', '#c02828', '#ff6a50', '#ffc0a0'], 3 - dx - dy)); }
    rect(p, 5, 10, 4, 5, '#140404'); rect(p, 5, 10, 4, 1, '#f4ead0'); rect(p, 5, 14, 4, 1, '#d8c8a8');
    for (const r of [4, 7, 10]) for (let a = -0.8; a <= 0.8; a += 0.06) p.px(9 + Math.cos(a) * r, 12.5 + Math.sin(a) * r, r === 10 ? M.ember[3] : '#ffffff');
  },
  skill_knives(p) {
    skillBase(p, M.obsidian);
    for (const a of [-0.9, -0.45, 0, 0.45, 0.9]) {
      const ang = -Math.PI / 2 + a;
      for (let r = 3; r < 11; r++) p.px(12 + Math.cos(ang) * r, 20 + Math.sin(ang) * r, r > 8 ? '#ffffff' : M.steel[3]);
      p.px(12 + Math.cos(ang) * 3 + 1, 20 + Math.sin(ang) * 3, M.gold[3]);
    }
    ball(p, 12, 20, 1.6, M.purple, { spec: false });
  },
  skill_pierce(p) {
    skillBase(p, M.moss);
    for (let x = 2; x < 22; x++) { p.px(x, 12, x > 16 ? M.iron[4] : M.wood[4]); if (x < 16) p.px(x, 13, M.wood[2]); }
    rect(p, 18, 10, 2, 5, M.iron[4]); rect(p, 20, 11, 2, 3, '#ffffff'); rect(p, 2, 10, 3, 1, M.red[4]); rect(p, 2, 15, 3, 1, M.red[3]);
    for (const x of [8, 13]) { for (let y = 5; y < 20; y++) if (Math.abs(y - 12.5) > 2) p.px(x, y, M.moss[1]); p.px(x - 1, 9, '#ffffff'); p.px(x + 1, 16, '#ffffff'); }
  },
  skill_flame_nova(p) {
    skillBase(p, M.ember);
    for (let a = 0; a < 6.28; a += 0.05) { const r = 8 + Math.sin(a * 7) * 1.4; p.px(12 + Math.cos(a) * r, 12 + Math.sin(a) * r, M.yellow[4]); p.px(12 + Math.cos(a) * (r - 1), 12 + Math.sin(a) * (r - 1), M.ember[4]); }
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; p.px(12 + Math.cos(a) * 10, 12 + Math.sin(a) * 10, '#ffffff'); }
    ball(p, 12, 12, 3, ['#7a2208', '#f07a1c', '#ffb640', '#fff0b0', '#ffffff']);
  },
  skill_blink(p) {
    skillBase(p, M.purple);
    // Nachbilder -> Figur
    const fig = (cx, c1, c2) => { ball(p, cx, 8, 2, [c1, c1, c2, c2, c2], { spec: false }); rect(p, cx - 2, 11, 5, 6, c1); rect(p, cx - 2, 11, 2, 6, c2); rect(p, cx - 2, 17, 2, 3, c1); rect(p, cx + 1, 17, 2, 3, c1); };
    fig(6, M.purple[1], M.purple[2]); fig(11, M.purple[2], M.purple[3]); fig(17, '#d8c8ff', '#ffffff');
    for (const [x, y] of [[20, 5], [21, 13], [14, 4], [22, 9]]) p.px(x, y, '#ffffff');
  },
  // --- Runde 4: Fähigkeiten ab Stufe 4/12 (Thread A)
  skill_earthshatter(p) {
    skillBase(p, M.rusty);
    // gespaltener Boden: Schollen links/rechts, glühender Riss, fliegende Brocken
    for (let y = 13; y < 23; y++) for (let x = 1; x < 23; x++) {
      const crack = 12 + Math.sin(y * 1.3) * 1.6;
      const d = Math.abs(x + 0.5 - crack);
      if (d < 1.1) p.px(x, y, y < 16 ? M.yellow[4] : M.ember[4]);
      else if (d < 2) p.px(x, y, M.ember[3]);
      else p.px(x, y, pick(M.ash, 3 - (y - 13) / 4 - (x < crack ? 0 : 0.8)));
    }
    for (let x = 1; x < 23; x++) p.px(x, 13, M.ash[4]);
    for (const [x, y, r] of [[6, 8, 1.8], [17, 6, 1.6], [11, 4, 1.2], [20, 11, 1]]) ball(p, x, y, r, M.ash, { spec: false });
    for (const [x, y] of [[9, 10], [14, 9], [12, 7]]) p.px(x, y, M.ember[4]);
  },
  skill_assassinate(p) {
    skillBase(p, M.obsidian);
    // Dolch sticht von oben, Blutstropfen, Fadenkreuz-Ring
    for (let a = 0; a < 6.28; a += 0.06) p.px(12 + Math.cos(a) * 8.5, 14 + Math.sin(a) * 8.5, M.red[3]);
    for (const [dx, dy] of [[0, -10], [0, 10], [-10, 0], [10, 0]]) rect(p, 12 + dx * 0.85 - (dx ? 1 : 0), 14 + dy * 0.85 - (dy ? 1 : 0), dx ? 3 : 1, dy ? 3 : 1, M.red[4]);
    for (let y = 1; y < 15; y++) { p.px(11, y, y > 12 ? M.steel[4] : M.steel[3]); p.px(12, y, '#ffffff'); p.px(13, y, M.steel[2]); }
    rect(p, 8, 1, 8, 2, M.gold[3]); rect(p, 11, 0, 3, 1, M.leather[3]);
    p.px(12, 15, '#ffffff'); p.px(12, 16, M.red[4]); rect(p, 11, 17, 3, 2, M.red[3]); p.px(12, 19, M.red[2]);
  },
  skill_fire_trap(p) {
    skillBase(p, M.moss);
    // Tellerfalle mit Zacken, darüber Glut
    for (let y = 13; y < 21; y++) for (let x = 2; x < 22; x++) { const dx = (x + 0.5 - 12) / 9.5, dy = (y + 0.5 - 17) / 3.6; if (dx * dx + dy * dy <= 1) p.px(x, y, pick(M.iron, 3 - dy * 1.5 - Math.abs(dx))); }
    for (let x = 4; x < 21; x += 3) { p.px(x, 13, M.iron[4]); p.px(x, 12, M.iron[3]); p.px(x, 11, '#ffffff'); }
    for (let y = 3; y < 15; y++) { const w = Math.max(0, 4.5 - Math.abs(y - 10) * 0.6 - (y < 7 ? (7 - y) * 0.6 : 0)); for (let x = -w; x <= w; x++) p.px(12 + x, y, pick(M.ember, 4 - Math.abs(x) / 1.6 - (y > 12 ? 1 : 0))); }
    p.px(12, 3, '#fff0b0'); p.px(9, 6, M.ember[4]); p.px(16, 7, M.ember[3]);
  },
  skill_arrow_rain(p) {
    skillBase(p, M.moss);
    // Regen aus Pfeilen, schräg herab auf den Boden
    rect(p, 1, 20, 22, 2, M.moss[1]);
    for (const [x0, y0, l] of [[4, 1, 10], [10, 3, 12], [16, 0, 11], [7, 9, 9], [19, 8, 9], [13, 11, 8]]) {
      for (let i = 0; i < l; i++) p.px(x0 - i * 0.35, y0 + i, i > l - 3 ? M.iron[4] : M.wood[4]);
      p.px(x0 - l * 0.35 + 1, y0 + l - 2, M.iron[3]); p.px(x0 - l * 0.35 - 1, y0 + l - 2, M.iron[3]);
      p.px(x0, y0, M.red[4]); p.px(x0 + 1, y0, M.red[3]);
    }
    for (const x of [4, 9, 15, 18]) p.px(x, 19, M.moss[4]);
  },
  skill_meteor(p) {
    skillBase(p, M.ember);
    // Schweif von rechts oben
    for (let i = 0; i < 16; i++) { const cx = 21 - i * 0.8, cy = 1 + i * 0.8, w = 0.6 + i * 0.22; for (let k = -w; k <= w; k++) p.px(cx + k * 0.7, cy - k * 0.7, i < 5 ? M.ember[2] : i < 11 ? M.ember[3] : M.yellow[4]); }
    ball(p, 9, 15, 5, ['#1a0c08', '#3a1e14', '#6a3a24', '#a8582c', '#ffb640']);
    for (const [x, y] of [[7, 13], [10, 16], [8, 17]]) p.px(x, y, M.ember[4]);
    for (const [x, y] of [[3, 21], [15, 21], [2, 16], [16, 18]]) p.px(x, y, M.yellow[4]);
  },
  skill_poison_blades(p) {
    skillBase(p, M.green);
    // zwei gekreuzte Klingen, von denen Gift tropft
    for (const s of [1, -1]) {
      for (let i = 0; i < 15; i++) { const x = 12 + s * (6 - i * 0.8), y = 3 + i; p.px(x, y, i < 11 ? (i % 3 ? M.steel[3] : '#ffffff') : M.leather[3]); if (i < 11) p.px(x + s, y, M.green[3]); }
      rect(p, 12 + s * -5 - 1, 14, 3, 1, M.gold[3]);
    }
    for (const [x, y] of [[6, 18], [18, 19], [12, 21]]) { p.px(x, y, M.green[4]); p.px(x, y + 1, M.green[3]); }
  },
  // --- Passive (runde Goldfassung statt Kante, damit sie von aktiven Fähigkeiten unterscheidbar sind)
  passive_bloodlust(p) { passiveBase(p, M.red); for (let y = 5; y < 19; y++) { const w = y < 11 ? (y - 5) * 0.6 : 3.8 - Math.max(0, y - 15) * 1.1; for (let x = -w; x <= w; x++) p.px(12 + x, y, pick(M.red, 4 - x / 2 - (y - 5) / 7)); } p.px(10, 12, '#ffffff'); for (const x of [7, 17]) { p.line(x, 5, x + (x < 12 ? 2 : -2), 10, '#f4ead0'); } },
  passive_unbroken(p) { passiveBase(p, M.iron); DRAW_SHIELD(p); p.line(12, 6, 10, 11, '#140808'); p.line(10, 11, 13, 14, '#140808'); for (const [x, y] of [[12, 7], [11, 10]]) p.px(x + 1, y, M.yellow[4]); },
  passive_opportunist(p) { passiveBase(p, M.obsidian); for (let a = 0; a < 8; a++) { const ang = a * Math.PI / 4; for (let r = 2; r < (a % 2 ? 6 : 9); r++) p.px(12 + Math.cos(ang) * r, 12 + Math.sin(ang) * r, a % 2 ? M.yellow[3] : M.yellow[4]); } ball(p, 12, 12, 2, M.gold); },
  passive_shadow_dance(p) { passiveBase(p, M.obsidian); for (const [cx, c] of [[8, M.purple[2]], [12, M.purple[3]], [16, '#e8d8ff']]) { ball(p, cx, 8, 1.8, [c, c, c, c, c], { spec: false }); p.line(cx, 10, cx - 2, 16, c); p.line(cx, 11, cx + 3, 13, c); p.line(cx - 2, 16, cx - 3, 19, c); p.line(cx - 1, 15, cx + 2, 19, c); } },
  passive_piercing_arrows(p) { passiveBase(p, M.moss); for (let x = 3; x < 21; x++) p.px(x, 12, x > 16 ? M.iron[4] : M.wood[4]); rect(p, 18, 10, 2, 5, M.iron[4]); for (const x of [8, 13]) { rect(p, x, 7, 2, 10, M.moss[1]); p.px(x, 12, '#ffffff'); } },
  passive_multishot(p) { passiveBase(p, M.moss); for (const a of [-0.45, 0, 0.45]) { for (let r = 0; r < 13; r++) p.px(5 + Math.cos(a) * r, 12 + Math.sin(a) * r, r > 10 ? M.iron[4] : M.wood[4]); p.px(5, 12, M.red[4]); } },
  passive_ember_soul(p) { passiveBase(p, M.ember); for (let y = 6; y < 20; y++) for (let x = 4; x < 21; x++) { const X = (x + 0.5 - 12) / 7, Y = (y + 0.5 - 12) / 7; const v = Math.pow(X * X + Y * Y - 0.35, 3) - X * X * Y * Y * Y * 1.2; if (v <= 0) p.px(x, 24 - y, pick(M.ember, 4 - Math.hypot(X, Y) * 2.5)); } p.px(10, 10, '#ffffff'); },
  passive_inferno(p) { passiveBase(p, M.ember); for (let y = 3; y < 21; y++) { const w = Math.max(0, 7 - Math.abs(y - 15) * 0.7 - (y < 9 ? (9 - y) * 0.6 : 0)); for (let x = -w; x <= w; x++) p.px(12 + x + Math.sin(y * 0.8) * 1.2, y, pick(M.ember, 4.2 - Math.abs(x) / 2 - (y - 3) / 10)); } ball(p, 12, 16, 2.4, ['#f07a1c', '#ffb640', '#fff0b0', '#ffffff', '#ffffff']); },
};

function passiveBase(p, R) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x + 0.5 - 12, dy = y + 0.5 - 12, d = Math.hypot(dx, dy);
    if (d > 12) continue;
    if (d > 10.6) p.px(x, y, pick(M.gold, 3.4 - (dx + dy) / 8));
    else if (d > 10) p.px(x, y, M.gold[0]);
    else p.px(x, y, pick(R, 2.2 - d / 6 - (dx + dy) / 30));
  }
}
function DRAW_SHIELD(p) {
  for (let y = 5; y < 20; y++) { const w = y < 12 ? 6 : 6 - (y - 12) * 0.8; for (let x = -w; x <= w; x++) p.px(12 + x, y, pick(M.steel, 3 - x / 5 - (y - 5) / 14)); }
  rect(p, 11, 6, 2, 12, M.gold[3]);
}

// Fähigkeits-ID (Thread A, character/classes.js) -> Emblem. Unbekannte IDs nutzen def.icon.
export const ABILITY_ICONS = Object.freeze({
  whirlwind: 'skill_whirlwind', battle_shout: 'skill_shout', charge: 'skill_charge', shield_wall: 'skill_shield',
  shadow_step: 'skill_shadow', fan_of_knives: 'skill_knives', poison: 'skill_poison', stealth: 'skill_stealth',
  volley: 'skill_arrows', piercing_shot: 'skill_pierce',
  flame_nova: 'skill_flame_nova', blink: 'skill_blink', fireball: 'skill_fireball', frostbolt: 'skill_frostbolt',
  frost_nova: 'skill_frostbolt', lightning: 'skill_lightning', heal: 'skill_heal', holy_light: 'skill_holy',
  // Runde 4: Stufe 4 / 12
  earthshatter: 'skill_earthshatter', poison_blades: 'skill_poison_blades', assassinate: 'skill_assassinate',
  fire_trap: 'skill_fire_trap', arrow_rain: 'skill_arrow_rain', meteor: 'skill_meteor',
  // Passive (Stufe 8 / 16)
  bloodlust: 'passive_bloodlust', unbroken: 'passive_unbroken', opportunist: 'passive_opportunist', shadow_dance: 'passive_shadow_dance',
  piercing_arrows: 'passive_piercing_arrows', multishot: 'passive_multishot', ember_soul: 'passive_ember_soul', inferno: 'passive_inferno',
});
export function abilityIcon(abilityId, def) {
  return ABILITY_ICONS[abilityId] ?? (def?.icon?.startsWith?.('skill_') ? def.icon : null) ?? def?.icon ?? 'skill_slash';
}

// ---------------------------------------------------------------- Register
const REG = {};
for (const [id, o] of Object.entries(SWORDS)) REG[id] = (p) => sword(p, o);
for (const [id, o] of Object.entries(DAGGERS)) REG[id] = (p) => sword(p, o);
for (const [id, o] of Object.entries(AXES)) REG[id] = (p) => axe(p, o);
for (const [id, o] of Object.entries(MACES)) REG[id] = (p) => mace(p, o);
for (const [id, o] of Object.entries(STAFFS)) REG[id] = (p) => staff(p, o);
for (const [id, o] of Object.entries(WANDS)) REG[id] = (p) => wand(p, o);
for (const [id, o] of Object.entries(BOWS)) REG[id] = (p) => bow(p, o);
for (const [id, o] of Object.entries(ARMORS)) REG[id] = (p) => armor(p, o);
for (const [id, o] of Object.entries(HELMS)) REG[id] = (p) => helm(p, o);
for (const [id, o] of Object.entries(GLOVES)) REG[id] = (p) => gloves(p, o);
for (const [id, o] of Object.entries(BOOTS)) REG[id] = (p) => boots(p, o);
for (const [id, mk] of Object.entries(JEWELRY)) { const { f, o } = mk(); REG[id] = (p) => f(p, o); }
for (const [id, { f, o }] of Object.entries(CONSUMABLES)) REG[id] = (p) => f(p, o);
Object.assign(REG, DRAW, SKILLS);
// Familien-Aliase für die Rückfallsuche
for (const [alias, target] of Object.entries({ robe: 'robe_mage', leather: 'leather_jerkin', plate: 'plate_iron', essence: 'essence_shadow', potion: 'potion_hp', armor: 'armor_mail', hood: 'hood' })) REG[alias] ??= REG[target];

export const ICON_IDS = Object.freeze(Object.keys(REG).filter((k) => !k.startsWith('ui_') && !k.startsWith('skill_') && !k.startsWith('passive_')));
export const SKILL_ICON_IDS = Object.freeze(Object.keys(SKILLS));

function resolve(id) {
  if (id && REG[id]) return id;
  const fam = id ? String(id).split('_')[0] : '';
  return REG[fam] ? fam : 'bag';
}

const canvasCache = new Map();
const urlCache = new Map();

export function iconCanvas(id) {
  const key = resolve(id);
  let c = canvasCache.get(key);
  if (!c) {
    const p = new PixelCanvas(S, S);
    REG[key](p);
    c = outlineCanvas(p.canvas);
    canvasCache.set(key, c);
  }
  return c;
}

export function iconUrl(id) {
  const key = resolve(id);
  let u = urlCache.get(key);
  if (!u) { u = iconCanvas(key).toDataURL(); urlCache.set(key, u); }
  return u;
}

export function iconEl(id, cssSize = 32) {
  const img = document.createElement('img');
  img.src = iconUrl(id);
  img.alt = '';
  img.className = 'ef-icon';
  img.width = cssSize; img.height = cssSize;
  img.draggable = false;
  return img;
}

// Item-Icon mit Seltenheitsrahmen (Aussehen in ui/theme.css: .ef-item-icon).
export function itemIconEl(def, cssSize = 40) {
  const span = document.createElement('span');
  const rarity = def?.rarity ?? 'common';
  span.className = `ef-item-icon r-${rarity}`;
  span.dataset.rarity = rarity;
  span.style.setProperty('--size', `${cssSize}px`);
  span.append(iconEl(def?.icon, Math.round(cssSize * 0.8)));
  if (def?.name) span.title = def.name;
  // Ab selten: animierte Effektebenen im Thema des Items (gfx/ItemFx.js)
  return decorateItemIcon(span, def);
}

// ---------------------------------------------------------------- Beute am Boden
export const RARITY_COLORS = {
  common: '#d8d0c0', uncommon: '#6ee06a', rare: '#5aa8ff', epic: '#c07aff', legendary: '#ff9a2a',
};
const RARITY_RGB = {
  common: [230, 220, 200], uncommon: [110, 224, 106], rare: [90, 168, 255], epic: [192, 122, 255], legendary: [255, 154, 42],
};
export function rarityRgb(r) { return RARITY_RGB[r] ?? RARITY_RGB.common; }

function lootKind(def, id) {
  const icon = def?.icon ?? id ?? '';
  if (def?.gold != null || icon.startsWith('gold')) return 'gold';
  const fam = icon.split('_')[0];
  if (['sword', 'dagger', 'axe', 'mace'].includes(fam)) return 'blade';
  if (['staff', 'wand', 'bow'].includes(fam)) return 'rod';
  if (['potion', 'elixir'].includes(fam)) return 'potion';
  if (['armor', 'robe', 'leather', 'mail', 'plate', 'helm', 'hood', 'cloth', 'pelt', 'gloves', 'boots'].includes(fam)) return 'armor';
  if (['ring', 'amulet', 'charm', 'gem'].includes(fam)) return 'jewel';
  if (['scroll', 'letter', 'map', 'seal'].includes(fam)) return 'scroll';
  return 'bag';
}

// Hauptfarbe eines Icons (für die Mini-Sprites): mittlerer Farbton der sichtbaren Pixel.
const toneCache = new Map();
function iconTone(id) {
  const key = resolve(id);
  if (toneCache.has(key)) return toneCache.get(key);
  const c = iconCanvas(key), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let best = null, bestSat = -1;
  const buckets = new Map();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 200) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx < 40) continue;
    const k = `${r >> 5},${g >> 5},${b >> 5}`;
    const e = buckets.get(k) ?? { n: 0, r, g, b, sat: (mx - mn) / mx };
    e.n++; buckets.set(k, e);
  }
  for (const e of buckets.values()) { const s = e.n * (0.4 + e.sat); if (s > bestSat) { bestSat = s; best = e; } }
  const tone = best ? [best.r, best.g, best.b] : [180, 170, 150];
  toneCache.set(key, tone);
  return tone;
}
const shade = ([r, g, b], k) => `rgb(${clamp(Math.round(r * k), 0, 255)},${clamp(Math.round(g * k), 0, 255)},${clamp(Math.round(b * k), 0, 255)})`;

const lootCache = new Map();
export function lootSprite(defOrId) {
  const def = typeof defOrId === 'object' ? defOrId : null;
  const id = def ? (def.gold != null ? 'gold' : def.icon) : defOrId;
  const kind = lootKind(def, id);
  const key = `${kind}|${resolve(id)}`;
  let c = lootCache.get(key);
  if (c) return c;
  const t = iconTone(id);
  const p = new PixelCanvas(14, 10);
  const c0 = shade(t, 0.45), c1 = shade(t, 0.75), c2 = shade(t, 1), c3 = shade(t, 1.35);
  switch (kind) {
    case 'gold':
      for (const [x, y] of [[2, 6], [6, 6], [4, 4], [9, 6], [7, 3]]) { p.rect(x, y, 3, 2, M.gold[2]); p.rect(x, y, 3, 1, M.gold[3]); p.px(x, y, M.gold[4]); }
      break;
    case 'blade':
      p.line(1, 8, 12, 2, c2); p.line(2, 8, 13, 2, c1); p.px(12, 2, c3); p.px(11, 3, c3);
      p.line(2, 5, 5, 8, M.bronze[3]); p.rect(0, 8, 2, 2, M.leather[3]);
      break;
    case 'rod':
      p.line(1, 9, 11, 3, M.wood[3]); p.line(2, 9, 12, 3, M.wood[1]); p.rect(11, 1, 3, 3, c2); p.px(11, 1, c3);
      break;
    case 'potion':
      p.rect(6, 1, 2, 2, M.wood[3]); p.rect(6, 3, 2, 1, '#8a9ab0'); p.ellipse(7, 7, 3, 2.5, c1); p.rect(5, 6, 4, 2, c2); p.px(5, 6, '#ffffff');
      break;
    case 'armor':
      p.rect(3, 3, 8, 6, c1); p.rect(1, 3, 12, 2, c2); p.rect(3, 3, 8, 1, c3); p.rect(6, 2, 2, 2, '#0e0a12'); p.rect(3, 8, 8, 1, c0);
      break;
    case 'jewel':
      p.ellipse(7, 6, 3, 2.5, M.gold[2]); p.ctx.clearRect(6, 6, 3, 1); p.rect(6, 2, 3, 3, c2); p.px(6, 2, '#ffffff');
      break;
    case 'scroll':
      p.rect(3, 3, 8, 5, M.paper[3]); p.rect(2, 2, 10, 2, M.paper[2]); p.rect(2, 7, 10, 2, M.paper[2]); p.rect(9, 7, 2, 3, M.red[3]);
      break;
    default:
      p.ellipse(7, 6, 4.5, 3.5, M.leather[2]); p.ellipse(6, 5, 3, 2, M.leather[3]); p.rect(5, 1, 4, 2, M.leather[2]); p.rect(4, 3, 6, 1, c2);
  }
  c = outlineCanvas(p.canvas);
  lootCache.set(key, c);
  return c;
}

// Beute zeichnen: Fußpunkt (x, y) in Bildschirm-Pixeln, bob = Höhe über dem Boden.
// Ab "uncommon" steigt ein schmaler Strahl in Seltenheitsfarbe auf, "epic"/"legendary" funkeln.
// opts.emissive: im Emissive-Pass nur Strahl/Funkeln zeichnen (nach der Beleuchtung).
export function drawLoot(ctx, def, x, y, t = 0, { bob = 0, emissive = false } = {}) {
  const rarity = def?.gold != null ? 'common' : def?.rarity ?? 'common';
  const spr = lootSprite(def);
  x = Math.round(x); y = Math.round(y);
  if (!emissive) {
    ctx.drawImage(spr, x - (spr.width >> 1), Math.round(y - spr.height - bob + 2));
    return;
  }
  if (rarity === 'common') return;
  const [r, g, b] = rarityRgb(rarity);
  const tall = rarity === 'uncommon' ? 18 : rarity === 'rare' ? 28 : 40;
  const pulse = 0.75 + 0.25 * Math.sin(t * 3);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < tall; i++) {
    const k = 1 - i / tall;
    ctx.fillStyle = `rgba(${r},${g},${b},${(0.55 * k * k * pulse).toFixed(3)})`;
    ctx.fillRect(x - 1, y - 3 - i, 3, 1);
    if (i < tall * 0.6) { ctx.fillStyle = `rgba(255,255,255,${(0.35 * k * pulse).toFixed(3)})`; ctx.fillRect(x, y - 3 - i, 1, 1); }
  }
  // Bodenring
  ctx.fillStyle = `rgba(${r},${g},${b},${(0.35 * pulse).toFixed(3)})`;
  for (let a = 0; a < 16; a++) ctx.fillRect(Math.round(x + Math.cos(a / 16 * 6.283 + t) * 7), Math.round(y + Math.sin(a / 16 * 6.283 + t) * 2.5), 1, 1);
  if (rarity === 'epic' || rarity === 'legendary') {
    for (let k = 0; k < 3; k++) {
      const ph = (t * 0.8 + k / 3) % 1;
      ctx.fillStyle = `rgba(255,255,255,${(1 - ph).toFixed(3)})`;
      ctx.fillRect(Math.round(x + Math.sin(k * 2.1 + t) * 5), Math.round(y - 4 - ph * tall * 0.8), 1, 1);
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}
