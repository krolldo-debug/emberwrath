import { PAL } from './Palette.js';
import { PixelCanvas, outlineCanvas, makeCanvas } from './PixelCanvas.js';
import { upscale2x, finishFine, FineCanvas, col32, fineRes } from './Fine.js';
import { decorateItemIcon } from './ItemFx.js';
import { installRarityFrames } from './RarityFrame.js';
import { SKILL_ART, SKILL_ART_SIZE } from './SkillArt.js';
import { DYES } from '../character/cosmetics.js';
import { TIER_LOOK, itemLook } from '../character/gearLook.js';
import { drawWeaponIcon } from '../sprites/hero.js';

// Item-, Fähigkeits- und UI-Icons als prozedurale 24×24-Pixel-Art (mit Umriss 26×26).
// Gemeinsam genutzt von HUD (D), Inventar/Beute/Händler (C) und Charaktererstellung (A).
//
//   iconCanvas(id)            -> gecachtes Canvas (26×26 inkl. Umriss)
//   iconUrl(id)               -> Data-URL
//   iconEl(id, cssSize=32)    -> <img> (pixelgenau skaliert)
//   itemIconEl(def, css=40)   -> <span class="ef-item-icon r-<rarity>"> mit Seltenheitsrahmen/Glanz
//   itemIconId(def)           -> Icon-ID eines Items; Ausrüstung zeigt ihr getragenes Aussehen (character/gearLook.js)
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
  ashsteel: ['#1c1a24', '#3c3848', '#666076', '#aaa4ba', '#f4f0fa'],
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
    if (o.runeFuller && Math.abs(vv) < 0.55 && t > 0.06 && t < 0.72) c = o.runes[((u * 1.3) | 0) % 3 ? 3 : 2];   // glimmende Hohlkehle
    else if (o.runes && Math.abs(vv) < 0.5 && t > 0.1 && t < 0.72 && ((u * 1.7) | 0) % 2 === 0) c = o.runes[((u | 0) % 2) ? 3 : 4];
    if (o.rust && hash(x, y, 3) < o.rust) c = pick(M.rusty, 1 + hash(x, y, 9) * 2);
    if (o.glow && edge > 0.62 && vv > 0) c = o.glow[3];
    if (o.glow && !o.calm && t > 0.55 && hash(x, y, 5) < 0.35) c = o.glow[4];
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
  else if (o.glow) { for (const [x, y] of [[cx - 1, cy - 1], [cx + 1, cy + 1], [cx + 2, cy - 2]]) p.px(x, y, o.glow[3]); p.px(cx, cy, o.glow[4]); }
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
    if (o.bands && ((u | 0) === 5 || (u | 0) === 12)) return (o.bands === true ? M.gold : o.bands)[3];
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
  if (o.glow) sparks(p, hx + 1, hy - 1, o.glow);
}
// Funken um eine leuchtende Spitze (Stab, Zauberstab): harte Einzelpixel, kein Schein
function sparks(p, x, y, G) {
  for (const [dx, dy, k] of [[4, -4, 4], [-3, -4, 3], [4, 2, 3], [-4, 1, 4]]) p.px(x + dx, y + dy, G[k]);
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
  if (o.glow) sparks(p, 17, 7, o.glow);
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
  if (o.glow) for (const q of [pts[12], pts[pts.length - 13]]) { p.px(Math.round(q[0]) - 1, Math.round(q[1]) - 1, o.glow[4]); p.px(Math.round(q[0]) - 2, Math.round(q[1]), o.glow[3]); }
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
// Brustteil von vorn aus denselben Teilen wie am Helden (sprites/hero.js drawTorsoHi/drawPauldronHi/drawLowerHi):
// Ärmel in der Wamsfarbe, kleine Schulterkappen bzw. Schulterplatten, Fellkragen, Schulterriemen (Leder),
// Wappenrock schmal über Kette/Platte, als Latz unter dem Gürtel, Glutstein statt Streupixeln.
function armor(p, o) {
  const R = o.ramp, T = o.trim ?? M.gold;
  const plate = o.style === 'plate' || o.style === 'scale', robe = o.style === 'robe';
  const strap = (x, y) => o.style === 'leather' && y >= 5 && y <= 13 && Math.abs((x + 0.5) - (6 + (y - 5) * 1.3)) < 1.1;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const m = torsoMask(x, y, o);
    if (!m) continue;
    const dx = x + 0.5 - 12, ax = Math.abs(dx);
    let c = pick(R, 2.4 - dx / 9 - (y - 10) / 18);
    if (m === 3) c = '#0e0a12';
    if (m === 2) c = T[2];
    if (m === 4) c = pick(R, 1.9 - dx / 8 - (ax > 8 ? 0.4 : 0));                 // Ärmel in der Wamsfarbe
    switch (o.style) {
      case 'robe': if (ax < 1 && y > 4) c = T[3]; if (y === 14) c = T[1]; if (y === (o.long ? 22 : 20)) c = T[2]; break;
      case 'leather': if (m === 1 && ax > 4.6 && ax < 5.4 && y > 5 && y < 14 && y % 2) c = R[4]; break;   // Schnürung
      case 'chain': if (m === 1 && (x + y * 2) % 3 === 0) c = R[0]; if (m === 1 && (x + y * 2) % 3 === 1) c = R[3]; break;
      case 'scale': if (m === 1 && y > 5) { const k = (x + (y % 2) * 1.5) % 3; c = k < 1 ? R[3] : k < 2 ? R[2] : R[0]; } break;
      case 'plate': if (m === 1 && (y === 10 || y === 12)) c = y === 10 ? R[0] : R[4]; if (m === 1 && ax < 0.6 && y < 10) c = R[3]; break;
    }
    if (o.tabard && o.style !== 'leather' && m === 1 && ax < 1.6 && y > 5 && y < (robe ? 20 : 14)) c = ax > 1 ? T[2] : o.tabard[2];
    if (strap(x, y) && m === 1) c = Math.abs((x + 0.5) - (6 + (y - 5) * 1.3)) < 0.5 ? M.leather[2] : M.leather[1];
    if (!robe && (y === 14 || y === 15) && m === 1) c = M.leather[y === 14 ? 2 : 0];   // Gürtel
    // Schulterkappen (Leder) bzw. Schulterplatten (Platte, Kette mit eigener Farbe)
    const sh = o.shoulder && (plate ? y >= 4 && y <= 7 && ax > 5 && ax < 10.4 - (y - 4) * 0.3 : y >= 5 && y <= 6 && ax > 6 && ax < 9.6);
    if (sh && m) c = y === (plate ? 7 : 6) ? o.shoulder[0] : pick(o.shoulder, 3.2 - (y - 4) * 0.5 - dx / 10);
    p.px(x, y, c);
  }
  if (!robe) { rect(p, 14, 14, 2, 2, T[3]); p.px(14, 14, T[4] ?? T[3]); }            // Schnalle
  if (o.style === 'leather') p.px(10, 9, T[3]);                                       // Riemenschnalle
  if (o.tabard && !robe) {
    // Latz unter dem Gürtel mit Zierkante wie am Helden
    for (let y = 16; y < 21; y++) { const w = y < 19 ? 2 : 1; for (let x = 12 - w; x < 12 + w; x++) p.px(x, y, x === 12 - w || x === 11 + w || y === 20 ? T[2] : o.tabard[x < 12 ? 3 : 2]); }
  }
  if (o.fur) for (let x = 6; x < 18; x++) { if (x > 9 && x < 14) continue; p.px(x, 3 + (x & 1), o.fur[(x & 1) + 2]); p.px(x, 4, o.fur[2]); }
  if (o.emblem) gem(p, 11, 8, 1, o.emblem);
  if (o.glow) gem(p, 12, 11, 1, o.glow);
  if (o.rivets) for (const [x, y] of [[7, 8], [16, 8], [7, 12], [16, 12]]) p.px(x, y, M.iron[4]);
  if (o.spikes) {
    const P = o.shoulder ?? o.ramp, G = o.glow ?? P;
    for (const [x, y, k] of [[3, 3, 3], [5, 3, 3], [20, 3, 2], [18, 3, 2]]) p.px(x, y, P[k]);
    for (const [x, y] of [[3, 2], [5, 2], [20, 2], [18, 2]]) p.px(x, y, G[3]);
  }
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
  if (o.style === 'crown') return crownIcon(p, o);
  if (o.style === 'cap') return capIcon(p, o);
  if (o.style === 'circlet') return circletIcon(p, o);
  const great = o.style === 'great';
  const rim = (x) => { let y = 0; for (let k = 4; k <= 19; k++) if (helmMask(x, k, great)) y = k; return y; };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x + 0.5 - 12, dy = y + 0.5 - 12;
    if (!helmMask(x, y, great)) continue;
    let c = pick(R, 3 - (dx + dy) / 8);
    if (o.style === 'nasal' && y >= 10 && Math.abs(dx) < 5 && !(Math.abs(dx) < 1)) c = y < 14 ? '#0c0810' : c;
    if (o.style === 'nasal' && Math.abs(dx) < 1 && y > 8) c = R[4];
    if (o.style === 'nasal' && y === 9) c = (o.trim ?? R)[o.trim ? 3 : 1];
    if (great && (y === 10 || y === 11) && Math.abs(dx) < 6) c = y === 10 ? '#0c0810' : '#1a1220';            // Sehschlitz
    if (great && y === 9 && Math.abs(dx) < 7) c = (o.trim ?? R)[o.trim ? 3 : 1];
    if (great && y > 12 && Math.abs(dx) < 0.6) c = (o.trim ?? R)[o.trim ? 2 : 4];                             // Mittelgrat
    if (great && y > 13 && y < 18 && (y % 2) && Math.abs(dx) > 2 && Math.abs(dx) < 4.5) c = '#0c0810';      // Atemlöcher
    if (o.style === 'hood' && y > 9 && Math.abs(dx) < 4.2) c = y < 16 ? '#0a0610' : c;
    if (o.trim && o.style !== 'hood' && o.style !== 'cap' && y === rim(x)) c = o.trim[2];
    p.px(x, y, c);
  }
  if (o.glow && (great || o.style === 'nasal')) { const ey = great ? 10 : 11; p.px(9, ey, o.glow[4]); p.px(14, ey, o.glow[4]); p.px(10, ey, o.glow[3]); p.px(15, ey, o.glow[3]); }
  if (o.coif) for (let y = 15; y < 22; y++) for (let x = 3; x < 21; x++) {
    const dx = Math.abs(x + 0.5 - 12);
    if (helmMask(x, y, great) && !(y >= 18)) { if (dx < 6) continue; }
    if (dx > 8.6 - (y - 15) * 0.15 || (y < 18 && dx < 6)) continue;
    p.px(x, y, (x + y) % 2 ? R[1] : R[3]);
  }
  if (o.style === 'hood') { for (let y = 17; y < 21; y++) rect(p, 4 + (y - 17), y, 16 - (y - 17) * 2, 1, R[1]); p.px(10, 13, M.yellow[4]); p.px(13, 13, M.yellow[4]); }
  if (o.horns) helmHorns(p);
  if (o.crest) for (let y = 1; y < 6; y++) rect(p, 11, y, 2, 1, o.crest[y < 3 ? 4 : 3]);
  if (o.tail) for (let i = 0; i < 9; i++) { const x = 13 + Math.round(i * 0.8), y = 3 + i; p.px(x, y, (o.crest ?? M.darkleather)[i < 3 ? 3 : 2]); p.px(x + 1, y, (o.crest ?? M.darkleather)[1]); }
  if (o.crown) {
    const C = o.crown, B = o.crownDim ? R : C;
    rect(p, 6, 4, 12, 1, B[3]); rect(p, 6, 5, 12, 1, B[1]);
    for (const x of [6, 11, 16]) { rect(p, x, 1, 2, 3, B[x === 11 ? 4 : 3]); p.px(x + 1, 1, B[1]); }
    if (!o.crownDim) p.px(12, 4, C[4]);
  }
}
// Hörner wie am Helden: dicke Wurzel seitlich am Helm, nach außen und oben gebogen, spitz zulaufend
function helmHorns(p) {
  const B = M.bone;
  for (const dir of [-1, 1]) {
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const x = 12 + dir * (6.6 + t * 4.4 + Math.sin(t * 2.2) * 0.8), y = 10.5 - t * 9.6 + t * t * 2.2;
      const w = 1.9 * (1 - t) + 0.35;
      for (let yy = Math.floor(y - w); yy <= Math.ceil(y + w); yy++) for (let xx = Math.floor(x - w); xx <= Math.ceil(x + w); xx++) {
        if (Math.hypot(xx + 0.5 - x, yy + 0.5 - y) > w) continue;
        const lit = dir < 0 ? (xx + 0.5 - x) > 0 : (xx + 0.5 - x) < 0;
        p.px(xx, yy, B[t > 0.78 ? 4 : t < 0.3 ? (lit ? 2 : 1) : lit ? 3 : 2]);
      }
    }
  }
}
// Lederkappe: glatte Kuppel mit Mittelnaht und Knopf, darunter die vorstehende Krempe (von oben gesehen) mit Steppstichen
function capIcon(p, o) {
  const R = o.ramp;
  for (let y = 4; y < 15; y++) for (let x = 3; x < 21; x++) {
    const dx = x + 0.5 - 12, dy = y + 0.5 - 14.5;
    if (dx * dx / 82 + dy * dy / 66 > 1) continue;
    let c = R[dx < -4 ? 3 : dx < 3 ? 2 : 1];
    if (dy < -4.5 && dx > -5.5 && dx < -1.5) c = R[4];
    if (Math.abs(dx) < 0.6) c = R[0];
    p.px(x, y, c);
  }
  rect(p, 11, 5, 2, 1, R[4]); rect(p, 10, 6, 4, 1, R[1]);
  for (let y = 15; y < 19; y++) {
    const half = [10, 10, 9, 7][y - 15];
    rect(p, 12 - half, y, half * 2, 1, y === 15 ? R[0] : y === 16 ? R[3] : R[2]);
  }
  for (let x = 4; x < 20; x += 2) p.px(x, 17, (o.trim ?? R)[o.trim ? 3 : 1]);
  rect(p, 5, 19, 14, 1, '#0c0810');
}
// Stirnreif wie am Helden: schmales Metallband als vorderer Bogen (Diadem), Stein mittig in eigener Farbe, keine Haube
function circletIcon(p, o) {
  const T = o.ramp, G = o.gem ?? M.blue;
  for (let x = 2; x < 22; x++) {
    const dx = (x + 0.5 - 12) / 10, y = Math.round(10 + 5 * Math.sqrt(Math.max(0, 1 - dx * dx)) - 1.5 * (1 - Math.abs(dx)));
    p.px(x, y - 1, T[dx < -0.3 ? 4 : 3]); p.px(x, y, T[dx < 0.2 ? 2 : 1]); p.px(x, y + 1, T[0]);
  }
  for (const sx of [6, 17]) { p.px(sx, 11, T[4]); p.px(sx, 12, T[2]); }
  for (let y = 9; y < 17; y++) for (let x = 9; x < 15; x++) if (Math.abs(x + 0.5 - 12) + Math.abs(y + 0.5 - 13) < 3.6) p.px(x, y, T[y < 13 ? 3 : 1]);
  gem(p, 12, 13, 2, G);
}
// Kuppel (offener Helm, Kappe, Kapuze) bzw. geschlossener Topfhelm bis zum Kinn
function helmMask(x, y, great) {
  const dx = x + 0.5 - 12, dy = y + 0.5 - 12;
  if (great) return y >= 4 && y <= 19 && (y >= 12 ? Math.abs(dx) <= 7.2 - Math.max(0, y - 17) * 0.8 : dx * dx / 64 + dy * dy / 70 <= 1);
  return dx * dx / 64 + dy * dy / 70 <= 1 && y <= 17 && y >= 4;
}
// Offene Krone (Erfolgsbelohnung „Die Sieben Gefallenen“): Reif mit fünf Zacken und Glutsteinen
function crownIcon(p, o) {
  const R = o.ramp, C = o.crown ?? M.ember;
  for (let y = 12; y < 18; y++) for (let x = 3; x < 21; x++) p.px(x, y, pick(R, (y === 12 ? 4 : y === 17 ? 1 : 3 - (x - 3) / 12)));
  for (const [x, h] of [[3, 4], [7, 6], [11, 9], [15, 6], [19, 4]]) {
    for (let k = 1; k <= h; k++) { p.px(x, 12 - k, R[k > h - 2 ? 4 : 3]); if (k < h - 1) p.px(x + 1, 12 - k, R[2]); }
    p.px(x, 11 - h, C[3]);
  }
  for (const x of [7, 12, 17]) { p.px(x, 14, C[4]); p.px(x + 1, 14, C[2]); p.px(x, 15, C[2]); p.px(x + 1, 15, C[1]); }
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
      p.px(ox + x, y, c);
    }
    if (o.style === 'plate' || o.style === 'mail') p.px(ox + (flip ? 4 : 6), 13, M.gold[3]);
    if (o.glow) gem(p, ox + 5, 13, 1, o.glow);                              // Glutstein auf dem Handrücken wie am Helden
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
    p.px(x, y, c);
  }
  if (o.buckle) { p.rect(5, 12, 9, 1, M.darkleather[1]); p.px(12, 12, M.gold[3]); }
  if (o.glow) gem(p, 13, 16, 1, o.glow);                                   // Glutstein am Knöchel wie am Helden
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

// ---------------------------------------------------------------- Feinfassung 48×48 (Stufe B, Grafikupdate)
// Brust, Kopf, Hände, Füße, Ringe, Amulette und Tränke zeichnen ihre 48er-Fassung selbst (iconCanvas res 2).
// Gleiche Formen, Farben und Ausschnitte wie die 24er-Zeichnungen oben (dieselben Spec-Parameter), aber im Feinraster:
// Kettenringe statt Schachbrett, Plattenkanten mit Glanzlinie, Leder mit Naht, Stoff mit Falten, Steine mit Facetten,
// Glas mit Spiegelung und Flüssigkeitsspiegel. Licht von oben links, nur deckende Palettenfarben.
// Koordinaten: x/y im 24er-Maß (Mitte des Feinpixels), F/G = Feinpixel 0..47. Die 24er-Fassung bleibt unverändert.
const FS = S * 2;
const VOID = '#0c0810';
// Feinpixel-Raster über einen Bereich (24er-Maß): fn(x, y, F, G) -> Farbe|null
function fgrid(p, x0, y0, x1, y1, fn) {
  const F0 = Math.max(0, Math.floor(x0 * 2)), F1 = Math.min(FS, Math.ceil(x1 * 2));
  const G0 = Math.max(0, Math.floor(y0 * 2)), G1 = Math.min(FS, Math.ceil(y1 * 2));
  for (let G = G0; G < G1; G++) for (let F = F0; F < F1; F++) {
    const c = fn((F + 0.5) / 2, (G + 0.5) / 2, F, G);
    if (c) p.put(F, G, col32(c));
  }
}
const fdot = (p, F, G, c) => { if (c) p.put(Math.round(F), Math.round(G), col32(c)); };
// Form aus dem 24er-Raster ins Feinraster mit EPX-Kantenglättung (wie Stufe A, nur für die Silhouette):
// fn(x, y) -> Bereichsnummer (0 = leer); Rückgabe (F, G) -> Bereichsnummer im Feinraster
function epxMask(fn) {
  const m = new Int16Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) m[y * S + x] = fn(x, y) || 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= S || y >= S ? 0 : m[y * S + x]);
  return (F, G) => {
    if (F < 0 || G < 0 || F >= FS || G >= FS) return 0;
    const x = F >> 1, y = G >> 1, E = at(x, y), B = at(x, y - 1), D = at(x - 1, y), R = at(x + 1, y), H = at(x, y + 1);
    if (B === H || D === R) return E;
    if (!(F & 1) && !(G & 1)) return D === B ? D : E;
    if (F & 1 && !(G & 1)) return B === R ? R : E;
    if (!(F & 1)) return D === H ? D : E;
    return H === R ? R : E;
  };
}
// Facettierter Stein (Raute wie gem()): Fassungskante, vier geteilte Facetten, Tafel, Glanzpunkt oben links
function gemFine(p, cx, cy, r, R) {
  const X = cx + 0.5, Y = cy + 0.5, rr = r + 0.5, W = R[4] ?? '#ffffff';
  fgrid(p, X - rr, Y - rr, X + rr, Y + rr, (x, y) => {
    const u = x - X, v = y - Y, d = (Math.abs(u) + Math.abs(v)) / rr;
    if (d > 1) return null;
    if (d > 1 - 0.55 / rr) return u + v < 0 ? (u < 0 && v < 0 ? R[3] : R[2]) : R[0];
    if (d < 0.4) return u < 0 && v < 0 ? W : R[2];
    const side = Math.abs(u) > Math.abs(v);
    if (u < 0 && v < 0) return side ? R[3] : W;
    if (u >= 0 && v >= 0) return side ? R[1] : R[0];
    return u < 0 ? (side ? R[2] : R[1]) : (side ? R[2] : R[3]);
  });
  if (r >= 2) fdot(p, X * 2 - rr * 0.9, Y * 2 - rr * 0.9, '#ffffff');
}
// Glutstein: heißer heller Kern im farbigen Saum (statt Facetten)
function emberFine(p, cx, cy, r, R) {
  const X = cx + 0.5, Y = cy + 0.5, rr = r + 0.5;
  fgrid(p, X - rr, Y - rr, X + rr, Y + rr, (x, y) => {
    const u = x - X, v = y - Y, d = (Math.abs(u) + Math.abs(v)) / rr;
    if (d > 1) return null;
    if (d > 0.68) return u + v > 0.2 ? R[1] : R[2];
    return d > 0.36 ? R[3] : R[4];
  });
}
// Niete: kleine Kuppel aus 2×2 Feinpixeln
function rivetFine(p, x, y, R) { fdot(p, x * 2, y * 2, R[4]); fdot(p, x * 2 + 1, y * 2, R[3]); fdot(p, x * 2, y * 2 + 1, R[2]); fdot(p, x * 2 + 1, y * 2 + 1, R[1]); }
// Kettenringe: versetzte Reihen kleiner Ringe (4×3 Feinpixel), Rückgabe = Helligkeitsversatz zur Grundstufe
function mailK(F, G) {
  const row = (G / 3) | 0, j = G % 3, i = (F + (row & 1) * 2) & 3;
  if (j === 0) return i === 0 ? -1.1 : i === 3 ? 0.2 : 1;
  if (j === 1) return i === 0 ? 0.5 : i === 3 ? -0.6 : -1.6;
  return i === 0 ? -0.2 : i === 3 ? -1.2 : -0.5;
}
// Schuppen: überlappende, unten gerundete Plättchen (6×4 Feinpixel, versetzt), oben im Licht, unten Schattenbogen
const SCALE_K = [
  [-0.3, 0.6, 1.2, 1.2, 0.6, -0.3],
  [-0.7, 0.3, 0.8, 0.6, 0.1, -0.9],
  [-1.3, 0, 0.3, 0.1, -0.4, -1.5],
  [-0.2, -1.4, -0.7, -0.9, -1.6, -0.2],
];
function scaleK(F, G) {
  const row = G >> 2;
  return SCALE_K[G & 3][(F + (row & 1) * 3) % 6];
}

// Brustteil fein (Spec wie armor())
function armorFine(p, o) {
  const R = o.ramp, T = o.trim ?? M.gold, st = o.style, L = M.leather;
  const plate = st === 'plate' || st === 'scale', robe = st === 'robe', yEnd = o.long ? 22 : 20;
  // Bereiche: 1 Rumpf, 2 Kragen, 3 Halsausschnitt, 4 Ärmel, 5 Schulterteil
  const mk = epxMask((x, y) => {
    const m = torsoMask(x, y, o);
    if (!m || !o.shoulder) return m;
    const ax = Math.abs(x + 0.5 - 12);
    return (plate ? y >= 4 && y <= 7 && ax > 5 && ax < 10.4 - (y - 4) * 0.3 : y >= 5 && y <= 6 && ax > 6 && ax < 9.6) ? 5 : m;
  });
  const tabTo = robe ? 20 : 14;
  fgrid(p, 0, 0, S, S, (x, y, F, G) => {
    const m = mk(F, G);
    if (!m) return null;
    const dx = x - 12, ax = Math.abs(dx), r = y | 0;
    const eL = !mk(F - 1, G), eR = !mk(F + 1, G), eT = !mk(F, G - 1), eB = !mk(F, G + 1);
    if (m === 3) return '#0e0a12';
    if (m === 2) return eT ? T[4] ?? T[3] : mk(F, G + 1) === 3 || G === 9 ? T[1] : dx < 0 ? T[3] : T[2];
    if (m === 5) {
      // Schulterteil: Lichtkante oben, Folgeplatte mit Fuge (Platte), Schattenkante unten, Glanzlinie links
      const Sh = o.shoulder, last = mk(F, G + 1) !== 5, top = mk(F, G - 1) !== 5;
      if (last) return Sh[0];
      if (top) return dx < 0 ? Sh[4] : Sh[3];
      let k = 3.2 - (y - 4.5) * 0.5 - dx / 10;
      if (plate && G === 12) return Sh[1];
      if (plate && G === 13) k += 0.9;
      if (plate && dx < 0 && G <= 11 && ax > 7.4 && ax < 8.6) return Sh[4];
      if (eR) k -= 0.8; else if (eL) k += 0.5;
      if (!plate && G === 11 && F % 2 === 0) return Sh[4];
      return pick(Sh, k);
    }
    let k = m === 4 ? 1.9 - dx / 8 - (ax > 8 ? 0.4 : 0) : 2.4 - dx / 9 - (y - 10.5) / 18;
    // Volumen: Kanten oben/links im Licht, unten/rechts im Schatten; Naht zwischen Ärmel und Rumpf
    if (eR || eB) k -= 0.7; else if (eL || eT) k += 0.5;
    if (m === 1 && (mk(F - 1, G) === 4 || mk(F + 1, G) === 4)) k -= 0.9;
    if (m === 4 && (mk(F - 1, G) === 1 || mk(F + 1, G) === 1)) k += 0.4;
    // Gürtel, Schulterriemen und Wappenrock liegen über dem Material
    // Wappenrock schmal (nicht Leder)
    if (o.tabard && st !== 'leather' && m === 1 && ax < 2 && r > 5 && r < tabTo && !(robe && ax < 1)) {
      if (ax >= 1) return ax >= 1.5 ? T[dx < 0 ? 3 : 1] : T[dx < 0 ? 4 : 2] ?? T[3];
      return o.tabard[dx < -0.5 ? 3 : dx < 0.5 ? 2 : 1];
    }
    // Schulterriemen (Leder) mit Steppstich
    if (st === 'leather' && m === 1 && r >= 5 && r <= 13) {
      const d = x - (6 + (y - 5.5) * 1.3);
      if (Math.abs(d) < 1.1) return Math.abs(d) < 0.3 && G % 3 === 0 ? L[3] : d < -0.6 ? L[2] : d > 0.6 ? L[0] : L[1];
    }
    // Gürtel
    if (!robe && (r === 14 || r === 15) && m === 1) return G === 29 && F % 3 === 0 ? L[3] : L[[3, 2, 1, 0][G - 28]];
    switch (st) {
      case 'robe': {
        if (ax < 1 && r > 4) return T[dx < -0.5 ? 4 : dx < 0 ? 3 : dx < 0.5 ? 2 : 1] ?? T[3];   // Zierborte mittig
        if (r === 14) return G === 28 ? T[2] : T[1];                                             // Schärpe
        if (r === yEnd && m === 1) return G % 2 ? T[2] : T[3];                                  // Saum
        if (m === 4 && eB) return T[2];                                                          // Ärmelsaum
        if (r >= 15 && m === 1) {                                                                // Rockfalten, nach unten gespreizt: Schattenkante + Lichtkante
          const fx = dx / (1 + (y - 15) * 0.09);
          for (const c of [-4.6, -2.5, 2.5, 4.6]) {
            if (Math.abs(fx - c) < 0.3 && y > 15.5) k -= 0.9;
            else if (Math.abs(fx - c + 0.55) < 0.27 && y > 16) k += 0.6;
          }
          if (G === 30) k -= 0.5;                                                                 // Schatten unter der Schärpe
        }
        if (m === 1 && r > 4 && dx >= 1 && dx < 1.5) k -= 0.6;                                     // Borte wirft Schatten
        break;
      }
      case 'leather': {
        // Vorderteile mit Naht (Rille + Steppstich), Kratzer
        if (m === 1 && ax > 3.5 && ax < 4 && ((r >= 5 && r < 14) || r >= 16)) return G % 3 === 0 ? R[4] : pick(R, k - 1);
        if (m === 1 && !o.emblem && r >= 5 && r < 9 && ax < 1) {
          if (ax < 0.5) return R[0];                                                             // Schnürung am Kragen
          if (G % 2 === 0) return R[4];
        }
        if ((Math.abs(x - 8.4 - (y - 16.5)) < 0.3 && y > 16 && y < 17.6) || (Math.abs(x - 15.2 + (y - 10) * 0.6) < 0.3 && y > 9.6 && y < 11)) k += 0.9;
        break;
      }
      case 'chain': if (m === 1 || m === 4) k += mailK(F, G); break;
      case 'scale': if (m === 1 && r > 5) k += scaleK(F, G); break;
      case 'plate': {
        if (m !== 1) break;
        if (G === 20 || G === 24 || G === 35) return R[0];                                       // Plattenfugen
        if (G === 21 || G === 25 || G === 36) return pick(R, k + 1.3);                         // Lichtkante der Folgeplatte
        if (r < 10 && r > 4 && ax < 0.5) return dx < 0 ? R[4] : R[1];                           // Grat
        if (r < 10 && r > 4 && Math.abs(dx + 4 + (y - 7) * 0.3) < 0.26) return R[4];            // Glanzlinie links
        if (r < 10 && r > 5 && Math.abs(dx - 3.2 + (y - 7) * 0.3) < 0.26) k += 0.8;             // schwächerer Reflex rechts
        if (r < 10 && dx < 0) k += 0.25;
        break;
      }
    }
    return pick(R, k);
  });
  if (!robe) {
    // Schnalle: Rahmen mit Dorn
    const Tb = [T[4] ?? T[3], T[3], T[2], T[1]];
    [[0, 1, 1, 2], [1, -1, 0, 3], [1, -1, 1, 3], [2, 3, 3, 3]].forEach((row, j) => row.forEach((k, i) => fdot(p, 28 + i, 28 + j, k < 0 ? L[0] : Tb[k])));
  }
  if (st === 'leather') { fdot(p, 20, 18, T[4] ?? T[3]); fdot(p, 21, 18, T[3]); fdot(p, 20, 19, T[2]); fdot(p, 21, 19, T[1]); }
  if (o.tabard && !robe) {
    // Latz unter dem Gürtel, spitz zulaufend, mit Zierkante und Mittelfalte
    fgrid(p, 9, 16, 15, 21, (x, y) => {
      const dx = x - 12, hw = y < 19 ? 2 : 2 - (y - 19) * 0.9;
      if (Math.abs(dx) > hw) return null;
      if (Math.abs(dx) > hw - 0.5 || y > 20.5) return T[dx < 0 ? 3 : 1];
      return o.tabard[dx < -0.5 ? 3 : dx < 0 ? 2 : dx < 0.5 ? 1 : 2];
    });
  }
  if (o.fur) {
    // Fellkragen: Strähnen mit hellen Spitzen und dunklen Zwischenräumen
    for (let F = 12; F < 36; F++) {
      if (F >= 20 && F < 28) continue;
      const top = 6 + [1, 0, 0, 1, 2, 1][F % 6];
      for (let G = top; G < 10; G++) fdot(p, F, G, F % 3 === 2 && G > top ? o.fur[1] : G === top ? o.fur[4] : o.fur[G - top > 1 ? 2 : 3]);
    }
  }
  if (o.emblem) gemFine(p, 11, 8, 1, o.emblem);
  if (o.glow) emberFine(p, 12, 11, 1, o.glow);
  if (o.rivets) for (const [x, y] of [[7, 8], [16, 8], [7, 12], [16, 12]]) rivetFine(p, x, y, M.iron);
  if (o.spikes) {
    const P = o.shoulder ?? o.ramp, Gl = o.glow ?? P;
    for (const x of [3, 5, 18, 20]) {
      const F = x * 2;
      fdot(p, F, 4, Gl[4]); fdot(p, F, 5, Gl[3]); fdot(p, F + 1, 5, Gl[2]);
      fdot(p, F, 6, P[3]); fdot(p, F + 1, 6, P[1]); fdot(p, F, 7, P[3]); fdot(p, F + 1, 7, P[2]);
    }
  }
}

// Kopfteile fein (Spec wie helm())
function helmFine(p, o) {
  if (o.style === 'crown') return crownFine(p, o);
  if (o.style === 'cap') return capFine(p, o);
  if (o.style === 'circlet') return circletFine(p, o);
  const R = o.ramp, Bt = o.trim, great = o.style === 'great', hood = o.style === 'hood', nasal = o.style === 'nasal';
  const mk = epxMask((x, y) => (helmMask(x, y, great) ? 1 : 0));
  const faceN = (x, y) => nasal && y >= 10 && y < 14 && Math.abs(x - 12) < 5 && Math.abs(x - 12) >= 1 && !(y > 13.5 && Math.abs(x - 12) > 4.5);
  const faceH = (x, y) => hood && y >= 10 && y < 16 && Math.abs(x - 12) < 4 - (y < 10.5 ? 1 : y > 15.5 ? 0.5 : 0);
  fgrid(p, 0, 0, S, S, (x, y, F, G) => {
    if (!mk(F, G)) return null;
    const dx = x - 12, dy = y - 12, ax = Math.abs(dx), r = y | 0;
    const eL = !mk(F - 1, G), eR = !mk(F + 1, G), eT = !mk(F, G - 1), eB = !mk(F, G + 1);
    if (faceN(x, y)) return VOID;
    if (faceH(x, y)) return '#0a0610';
    let k = hood ? 2.9 - (dx + dy) / 9 : 2.9 - (dx + dy) / 8.5;
    if (!hood) {
      // Kuppel aus Metall: Glanzbogen oben links, Glanzpunkt, Schattenkante unten rechts
      const nx = dx / 8, ny = dy / 8.4, d = Math.hypot(nx, ny), a = Math.atan2(ny, nx);
      if (r < 10 && d > 0.58 && d < 0.7 && a > -2.8 && a < -1.65) return R[4];
      if (Math.abs(x - 9.75) < 0.5 && Math.abs(y - 7.25) < 0.3) return '#ffffff';
      if (d > 0.82 && nx + ny > 0.3) k -= 0.5;
      if (eR || eB) k -= 0.8; else if (eL || eT) k += 0.4;
    } else {
      // Kapuze aus Stoff: Falten vom Scheitel, gesäumter Rand um das Gesicht
      if (eR || eB) k -= 0.6;
      const s = dx / Math.max(0.5, y - 3);
      if (y < 10.5 || ax > 4.5) {
        if (Math.abs(s + 0.85) < 0.07 || Math.abs(s - 0.8) < 0.07) k -= 0.8;
        else if (Math.abs(s + 0.97) < 0.06 || Math.abs(s - 0.68) < 0.06) k += 0.5;
      }
      if (faceH(x + 0.5, y) || faceH(x - 0.5, y) || faceH(x, y + 0.5) || faceH(x, y + 1)) k += 0.9;
    }
    if (nasal) {
      if (faceN(x - 0.5, y)) k += 0.9; else if (faceN(x + 0.5, y)) k -= 0.6;          // Innenkanten der Wangen
      if (ax < 1 && r > 8) return R[dx < -0.5 ? 4 : dx < 0 ? 3 : dx < 0.5 ? 2 : 1];     // Nasenschutz
    }
    if ((nasal && r === 9) || (great && r === 9 && ax < 7)) {                            // Stirnband
      if (Bt) return G === 18 ? Bt[dx < 0 ? 4 : 3] : (ax > 3 && ax < 3.5) || (ax > 6 && ax < 6.5) ? Bt[4] : Bt[2];
      return G === 18 ? pick(R, k + 0.6) : (ax > 3 && ax < 3.5) || (ax > 6 && ax < 6.5) ? R[4] : R[0];
    }
    if (great) {
      if ((r === 10 || r === 11) && ax < 6) {                                             // Sehschlitz
        if (G < 22 || (G === 22 && ax < 5.5)) return VOID;
        if (G === 22) return '#1a1220';
        return pick(R, k + 1.2);
      }
      if (r > 12 && ax < 0.5 && !(eB)) return dx < 0 ? (Bt ? Bt[3] : R[4]) : (Bt ? Bt[1] : R[2]);   // Mittelgrat
      if ((r === 15 || r === 17) && ((ax >= 2 && ax < 3) || (ax >= 3.5 && ax < 4.5))) return VOID;   // Atemlöcher
      if ((r === 16 || r === 18) && G % 2 === 0 && ((ax >= 2 && ax < 3) || (ax >= 3.5 && ax < 4.5))) k += 0.9;
    }
    // Zierrand an der Unterkante
    if (Bt && !hood && (eB || !mk(F, G + 2))) return eB ? Bt[1] : Bt[3];
    return pick(R, k);
  });
  if (o.glow && (great || nasal)) {
    const G0 = (great ? 10 : 11) * 2, Gl = o.glow;
    for (const F0 of [18, 28]) { fdot(p, F0, G0, Gl[4]); fdot(p, F0 + 1, G0, Gl[4]); fdot(p, F0 + 2, G0, Gl[3]); fdot(p, F0 + 3, G0, Gl[2]); fdot(p, F0, G0 + 1, Gl[3]); fdot(p, F0 + 1, G0 + 1, Gl[3]); fdot(p, F0 + 2, G0 + 1, Gl[2]); }
  }
  if (o.coif) {
    // Kettenkragen aus Ringen, seitlich unter der Kuppel, unten über die Schultern
    const cm = epxMask((x, y) => {
      if (y < 15 || y > 21 || x < 3 || x > 20) return 0;
      const dx = Math.abs(x + 0.5 - 12);
      if (dx > 8.6 - (y - 15) * 0.15 || (y < 18 && dx < 6)) return 0;
      return 1;
    });
    fgrid(p, 2, 14, 22, 23, (x, y, F, G) => {
      if (!cm(F, G)) return null;
      let k = 2.3 - (x - 12) / 10 - (y - 15) / 14 + mailK(F, G);
      if (!cm(F + 1, G) || !cm(F, G + 1)) k -= 0.7;
      return pick(R, k);
    });
  }
  if (hood) {
    // Umhang über den Schultern mit senkrechten Falten
    fgrid(p, 4, 17, 20, 21, (x, y, F, G) => {
      const r = y | 0, x0 = 4 + (r - 17), x1 = 20 - (r - 17);
      if (x < x0 || x >= x1) return null;
      if (G === 34) return R[2];
      if (G === 41 || x >= x1 - 0.5) return R[0];
      const f = (x - 12) / (1 + (y - 17) * 0.1);
      if (Math.abs(Math.abs(f) - 4.2) < 0.25 || Math.abs(f) < 0.25) return R[0];
      if (Math.abs(Math.abs(f) - 4.7) < 0.25 || Math.abs(f + 0.5) < 0.25) return R[2];
      return R[1];
    });
    for (const F of [20, 26]) { fdot(p, F, 26, M.yellow[4]); fdot(p, F + 1, 26, M.yellow[4]); fdot(p, F, 27, M.yellow[3]); fdot(p, F + 1, 27, M.yellow[2]); }
  }
  if (o.horns) hornsFine(p);
  if (o.crest) {
    // Helmbusch: Strähnen mit hellen Spitzen, in der Halterung gefasst
    const C = o.crest;
    fgrid(p, 11, 1, 13, 6, (x, y, F, G) => {
      if (G === 2 && (F === 22 || F === 25)) return null;
      const s = [4, 3, 4, 2][F - 22];
      return C[clamp(s - (G > 6 ? 1 : 0) + (G === 2 ? 1 : 0), 1, 4)];
    });
    fdot(p, 22, 10, R[4]); fdot(p, 23, 10, R[3]); fdot(p, 24, 10, R[2]); fdot(p, 25, 10, R[1]);
  }
  if (o.tail) {
    // Rossschweif: drei Strähnen vom Scheitel nach hinten
    const C = o.crest ?? M.darkleather;
    for (let i = 0; i < 4; i++) p.fline(13 + i * 0.5, 3, 20.5 + i * 0.5, 11.5 - i * 0.3, C[[3, 2, 2, 1][i]]);
    p.fline(13, 3, 16, 5.6, C[4] ?? C[3]);
  }
  if (o.crown) {
    const C = o.crown, B = o.crownDim ? R : C;
    fgrid(p, 6, 4, 18, 6, (x, y, F, G) => B[[4, 3, 2, 1][G - 8]] ?? B[3]);
    for (const x of [6, 11, 16]) {
      const F = x * 2, hi = x === 11 ? 4 : 3;
      fdot(p, F + 1, 2, B[4]); fdot(p, F + 2, 2, B[2]);
      fdot(p, F + 1, 3, B[hi]); fdot(p, F + 2, 3, B[2]);
      for (let G = 4; G < 8; G++) { fdot(p, F, G, B[hi]); fdot(p, F + 1, G, B[3]); fdot(p, F + 2, G, B[2]); fdot(p, F + 3, G, B[1]); }
    }
    if (!o.crownDim) { fdot(p, 24, 8, C[4]); fdot(p, 25, 8, C[3]); fdot(p, 24, 9, C[2]); fdot(p, 25, 9, C[1]); }
  }
}
// Hörner fein: dicke Wurzel, nach außen und oben gebogen, Rillen quer zur Wuchsrichtung, helle Spitze
function hornsFine(p) {
  const B = M.bone, pts = [];
  for (let i = 0; i <= 80; i++) {
    const t = i / 80;
    pts.push([t, 6.6 + t * 4.4 + Math.sin(t * 2.2) * 0.8, 10.5 - t * 9.6 + t * t * 2.2, 1.9 * (1 - t) + 0.35]);
  }
  for (const dir of [-1, 1]) {
    fgrid(p, dir < 0 ? 0 : 12, 0, dir < 0 ? 12 : 24, 13, (x, y) => {
      // nächster Punkt der Mittellinie, in dessen Breite das Feinpixel liegt
      const ax = (x - 12) * dir;
      let best = null, bd = 1e9;
      for (const q of pts) { const d = Math.hypot(ax - q[1], y - q[2]); if (d <= q[3] && d < bd) { bd = d; best = q; } }
      if (!best) return null;
      const [t, cx, cy, w] = best, ox = ax - cx, oy = y - cy;
      const side = (ox * -0.7 + oy * -0.7) / w;                 // >0: zur Helmmitte/oben (Licht), <0: außen/unten
      if (t > 0.82) return side > -0.2 ? B[4] : B[3];
      if (t < 0.72 && (t * 7) % 1 < 0.13) return side > 0.3 ? B[2] : B[1];   // Rillen
      if (side > 0.45 && t > 0.12) return B[4];
      if (side < -0.5) return B[t < 0.3 ? 0 : 1];
      return B[t < 0.3 ? 2 : 3];
    });
  }
}
// Lederkappe fein: Bahnen mit Nähten, Knopf, Krempe mit Steppstich
function capFine(p, o) {
  const R = o.ramp, Tt = o.trim;
  const mk = epxMask((x, y) => {
    if (y >= 4 && y < 15) { const dx = x + 0.5 - 12, dy = y + 0.5 - 14.5; return dx * dx / 82 + dy * dy / 66 <= 1 ? 1 : 0; }
    if (y >= 15 && y < 19) return Math.abs(x + 0.5 - 12) < [10, 10, 9, 7][y - 15] ? 2 : 0;
    return 0;
  });
  fgrid(p, 0, 0, S, S, (x, y, F, G) => {
    const m = mk(F, G);
    if (!m) return null;
    const dx = x - 12, dy = y - 14.5;
    const eR = !mk(F + 1, G), eT = !mk(F, G - 1), eL = !mk(F - 1, G);
    if (m === 1) {
      let k = dx < -4 ? 3 : dx < 3 ? 2 : 1;
      k += -dy / 30;
      if (dy < -4.5 && dx > -5.5 && dx < -1.5) k = 4;                                   // Glanz
      const u = dx / (9.06 * Math.sqrt(Math.max(0.05, 1 - dy * dy / 66)));            // Meridian der Bahn
      if (Math.abs(dx) < 0.5) return dx < 0 ? R[0] : R[1];                               // Mittelnaht
      if (Math.abs(Math.abs(u) - 0.55) < 0.05) return R[0];                              // Seitennähte
      if (Math.abs(Math.abs(u) - 0.55) < 0.12 && G % 3 === 0) return R[4];              // Steppstich
      if (Math.abs(dx) < 1 && G % 3 === 1) return R[3];
      if (eR) k -= 0.7; else if (eT || eL) k += 0.5;
      if (mk(F, G + 1) === 2) k -= 1;
      return pick(R, k);
    }
    // Krempe: Schattenfuge unter der Kuppel, Oberseite im Licht, Steppstich, dunkle Unterkante
    if (mk(F, G - 1) === 1 || G === 30) return R[0];
    if (G === 31) return R[dx < 0 ? 4 : 3];
    if (G === 34 && F % 3 !== 2) return Tt ? Tt[3] : R[1];
    if (!mk(F, G + 1) || G === 37) return R[1];
    return R[dx < -6 ? 3 : 2];
  });
  fgrid(p, 5, 19, 19, 20, (x, y) => (Math.abs(x - 12) < 7 - (y - 19) * 2 ? VOID : null));
  fgrid(p, 11, 5, 13, 7, (x, y, F, G) => (G === 10 ? R[4] : G === 11 ? R[3] : null));
  fdot(p, 21, 12, R[1]); fdot(p, 22, 12, R[1]); fdot(p, 25, 12, R[1]); fdot(p, 26, 12, R[1]);
}
// Stirnreif fein: Metallband als Bogen mit Gravurlinie, Seitenknöpfe, gefasster Stein mittig
function circletFine(p, o) {
  const T = o.ramp, Gm = o.gem ?? M.blue;
  const yc = (x) => { const dx = (x - 12) / 10; return 10.5 + 5 * Math.sqrt(Math.max(0, 1 - dx * dx)) - 1.5 * (1 - Math.abs(dx)); };
  fgrid(p, 2, 6, 22, 18, (x, y) => {
    const o2 = y - yc(x), dx = (x - 12) / 10;
    if (o2 < -1.5 || o2 >= 1.5) return null;
    if (o2 < -1) return T[4];
    if (o2 < -0.5) return T[dx < -0.3 ? 4 : 3];
    if (o2 < 0) return T[dx < 0.2 ? 2 : 1];
    if (o2 < 0.5) return T[0];
    if (o2 < 1) return T[dx < 0.2 ? 2 : 1];
    return T[0];
  });
  for (const sx of [6, 17]) { const F = sx * 2, G = Math.floor(yc(sx + 0.5) * 2) - 1; fdot(p, F, G, T[4]); fdot(p, F + 1, G, T[3]); fdot(p, F, G + 1, T[3]); fdot(p, F + 1, G + 1, T[1]); }
  // Fassung: Raute mit abgeschrägter Kante
  fgrid(p, 8, 9, 16, 17, (x, y) => {
    const d = Math.abs(x - 12) + Math.abs(y - 13);
    if (d >= 3.9) return null;
    if (d > 3.3) return x - 12 + y - 13 < 0 ? T[4] : T[0];
    return y < 13 ? T[3] : T[1];
  });
  gemFine(p, 12, 13 - 0.5, 2, Gm);
}
// Offene Krone fein: Reif mit Gravur, fünf spitze Zacken mit Glutstein, drei Steine im Reif
function crownFine(p, o) {
  const R = o.ramp, C = o.crown ?? M.ember;
  fgrid(p, 3, 12, 21, 18, (x, y, F, G) => {
    if (G === 24) return R[4];
    if (G === 25) return R[3];
    if (G === 35) return R[0];
    if (G === 34) return R[1];
    if (G === 29 && F % 4 !== 3) return R[1];
    if (F === 6 || F === 41) return R[1];
    return pick(R, 3.2 - (x - 3) / 12 - (y - 12) / 10);
  });
  for (const [x, h] of [[3, 4], [7, 6], [11, 9], [15, 6], [19, 4]]) {
    const F = x * 2;
    for (let G = 24 - h * 2; G < 24; G++) {
      const t = (24 - G) / (h * 2), w = t > 0.75 ? 2 : t > 0.4 ? 3 : 4;
      for (let i = 0; i < w; i++) fdot(p, F + i + (w === 2 ? 1 : 0), G, i === 0 ? R[4] : i === w - 1 ? (w === 4 ? R[1] : R[2]) : R[3]);
    }
    const tG = 24 - h * 2 - 2;
    fdot(p, F + 1, tG - 1, C[3]); fdot(p, F, tG, C[3]); fdot(p, F + 1, tG, C[4]); fdot(p, F + 2, tG, C[2]); fdot(p, F + 1, tG + 1, C[2]);
  }
  for (const x of [7, 12, 17]) emberFine(p, x, 14.5, 1, C);
}

// Handschuhe fein (Spec wie gloves()): Handrücken mit Fingern, Daumen, Stulpe; beide Hände mit Licht von oben links
function glovesFine(p, o) {
  const R = o.ramp, Cf = o.cuff ?? R, Tt = o.trim ?? M.gold;
  const tops = [3.5, 3, 3.5, 4.5];   // Kuppen: Mittelfinger am längsten, kleiner Finger am kürzesten
  // lx = Abstand zur Daumenseite (0..11), Rückgabe Bereich: 1 Finger (+10*i), 2 Daumen, 3 Hand, 4 Stulpe, 5 Fingerfuge
  const part = (lx, y) => {
    if (y >= 17 && y < 22 && lx >= 0 && lx < 11) return 4;
    if (y >= 10 && y < 17 && lx >= 1 && lx < 10) return 3;
    if (y >= 7.5 && y < 12 && lx >= 0.25 && lx < 1.5 && !(y < 8 && lx < 0.75)) return 2;
    for (let i = 0; i < 4; i++) {
      // Finger 4 Feinpixel breit, Kuppe abgerundet; zwischen den Fingern oben ein Spalt, unten eine Falte
      const a = 2 * i + 1.75, b = a + (i < 3 ? 1.5 : 2);
      if (lx >= a && lx < b && y >= tops[i] && y < 10) return 1 + 10 * i;
      if (lx >= b && lx < b + 0.5 && i < 3 && y >= Math.max(tops[i], tops[i + 1]) + 1.5 && y < 10) return 5;
    }
    return 0;
  };
  const glove = (ox, flip) => {
    const at = (x, y) => { const X = x - ox; return X < 0 || X >= 11 ? 0 : part(flip ? 11 - X : X, y); };
    fgrid(p, ox, 2, ox + 11, 22, (x, y, F, G) => {
      const m = at(x, y);
      if (!m) return null;
      const X = x - ox, lx = flip ? 11 - X : X, r = y | 0, fin = m % 10 === 1;
      const eL = !at(x - 0.5, y), eR = !at(x + 0.5, y), eT = !at(x, y - 0.5), eB = !at(x, y + 0.5);
      if (m === 4) {
        // Stulpe: Lichtkante oben, Saum, Schattenkante unten
        let k = 2.6 - X / 7;
        if (G === 34) k += 0.8; else if (G === 35) k -= 0.6;
        if (eB) k -= 0.8; if (eR) k -= 0.6; else if (eL) k += 0.4;
        if (o.style === 'cloth' && r === 19) return G === 38 ? Tt[3] : Tt[1];
        if (o.style === 'cloth' && G > 35 && F % 3 === 0) k -= 0.5;                                   // Strickrippen
        if ((o.style === 'leather' || o.style === 'mail') && G === 37 && F % 2 === 0) return Cf[4];   // Steppstich
        if (o.style === 'plate' && G === 39) return Cf[0];
        if (o.style === 'plate' && G === 40) k += 1;
        return pick(Cf, k);
      }
      let k = 2.8 - X / 6 - (y - 10) / 16;
      if (eR || eB) k -= 0.7; else if (eL || eT) k += 0.5;
      if (m === 5) k -= 1.1;                                                                         // Fingerfuge
      if (fin && y < tops[(m / 10) | 0] + 0.6) k += 0.5;                                            // Fingerkuppe
      if (m === 2 && G === 21) k -= 0.8;                                                             // Daumenfalte
      if (m === 3 && r === 10 && G === 20 && Math.round(lx * 2) % 4 === 1) k += 1;                   // Knöchel
      switch (o.style) {
        case 'plate':
          if (m === 3 && (G === 24 || G === 30)) return R[0];
          if (m === 3 && (G === 25 || G === 31)) return pick(R, k + 1.3);
          if (fin && (G === 12 || G === 17)) return R[1];
          if (fin && (G === 13 || G === 18)) k += 1;
          if (m === 3 && Math.abs(X - 3) < 0.3) return R[4];                                         // Glanzlinie
          break;
        case 'mail': if (m === 3) k += mailK(F, G); else if (fin && G % 4 === 0) k -= 0.8; break;
        case 'leather':
          if (m === 3 && r >= 11 && r < 16 && [3.75, 5.75, 7.75].some((s) => Math.abs(lx - s) < 0.2)) return G % 3 === 0 ? R[4] : pick(R, k - 0.9);
          break;
        case 'cloth': if (m === 3 && r > 10 && Math.abs(Math.sin(X * 1.1 + y * 0.9)) > 0.97) k -= 0.6; break;
      }
      return pick(R, k);
    });
    if (o.style === 'plate' || o.style === 'mail') rivetFine(p, ox + (flip ? 4 : 6), 13, M.gold);
    if (o.glow) emberFine(p, ox + 5, 13, 1, o.glow);
  };
  glove(1, false); glove(12, true);
}

// Stiefel fein (Spec wie boots()): Schaft, gerundete Kappe, Sohle mit Absatz und Rahmennaht
function bootsFine(p, o) {
  const R = o.ramp, Cf = o.cuff ?? R, Tt = o.trim ?? M.gold, D = M.darkleather;
  const toe = (x, y) => ((x - 17) / 4) ** 2 + ((y - 21.5) / 6.5) ** 2 <= 1;
  const inside = (x, y) => (y >= 2 && y < 15 && x >= 5 && x < 14) || (y >= 15 && y < 21 && x >= 5 && (x < 17 || toe(x, y)));
  const fur = o.style === 'leather' && o.cuff && o.cuff !== o.ramp;
  fgrid(p, 4, 1, 22, 22, (x, y, F, G) => {
    if (!inside(x, y)) return null;
    const r = y | 0;
    const eL = !inside(x - 0.5, y), eR = !inside(x + 0.5, y), eT = !inside(x, y - 0.5), eB = !inside(x, y + 0.5);
    // Sohle mit Absatz
    if (r === 20) return G === 40 ? (x < 8.5 ? D[1] : D[2]) : D[0];
    if (x < 8.5 && y >= 19.5) return x > 8 ? D[0] : D[1];
    if (r < 4) {
      // Stulpe: umgeschlagen, Lichtkante oben, Schattenfuge darunter
      let k = 3.2 - (x - 5) / 5;
      if (G === 4) k += 0.6;
      if (eR) k -= 0.8;
      if (G === 7) k -= 1;
      return pick(Cf, k);
    }
    if (fur && G < 10 && F % 3 !== 2 && G - 8 < (F % 2)) return pick(Cf, 2.6 - (x - 5) / 5);   // Fellsträhnen
    // Fuß: flacherer Verlauf als der Schaft, oben im Licht (sonst wird die Kappe zu dunkel)
    let k = r >= 15 ? 2.75 - (x - 5) / 13 - (y - 15) / 7 : 2.8 - (x - 5) / 9 - (y - 10) / 20;
    if (eR || eB) k -= 0.7; else if (eL || eT) k += 0.5;
    if (G === 8) k -= 0.8;                                                                        // Schatten unter der Stulpe
    if (G === 39 && x >= 8.5 && o.style !== 'plate') return F % 2 ? R[4] : pick(R, k - 0.6);    // Rahmennaht
    switch (o.style) {
      case 'plate':
        if (G === 14 || G === 22 || G === 32) return R[0];
        if (G === 15 || G === 23 || G === 33) return pick(R, k + 1.3);
        if (r > 15 && x > 15) {                                                                    // Zehenkappe mit Glanz
          return !toe(x - 0.6, y - 0.6) ? R[4] : R[3];
        }
        if (r >= 4 && r < 15 && x >= 6 && x < 6.5) return R[4];                                   // Glanzlinie am Schienbein
        break;
      case 'mail': if (r > 3 && r < 15) k += mailK(F, G); break;
      case 'leather': {
        if (r >= 5 && r < 14 && x >= 8.5 && x < 10.5) {                                           // Schnürung: Ösen und Querbänder
          const ph = G % 3, edge = x < 9 || x >= 10;
          if (ph === 0) return edge ? R[1] : R[4];
          if (ph === 1 && edge) return R[0];
          k -= 0.4;
        }
        if (Math.abs(y - 13.9 - (x - 12) * 0.45) < 0.25 && x > 11.5 && x < 14) k -= 0.9;          // Knöchelfalten
        if (Math.abs(y - 15 - (x - 13) * 0.45) < 0.25 && x > 13 && x < 16) k -= 0.9;
        break;
      }
      case 'cloth': {
        if (r === 4) return G === 8 ? Tt[3] : Tt[1];
        const w = 8 + Math.sin(x * 1.3) * 0.4, w2 = 11.5 + Math.sin(x * 1.1 + 1) * 0.4;
        if (Math.abs(y - w) < 0.25 || Math.abs(y - w2) < 0.25) k -= 0.8;
        else if (Math.abs(y - w + 0.5) < 0.25 || Math.abs(y - w2 + 0.5) < 0.25) k += 0.5;
        break;
      }
    }
    return pick(R, k);
  });
  if (o.buckle) {
    fgrid(p, 5, 12, 14, 13, (x, y, F, G) => (G === 24 ? D[3] : D[0]));
    const g = M.gold;
    [[4, 4, 3], [3, -1, 2], [2, 2, 1]].forEach((row, j) => row.forEach((k, i) => fdot(p, 23 + i, 23 + j, k < 0 ? D[0] : g[k])));
  }
  if (o.glow) emberFine(p, 13, 16, 1, o.glow);
}

// Ring fein: Reif mit Querschnitt (Vorderseite hell, Innenseite dunkel), Glanzbogen, Stein mit Krappen
function ringFine(p, o) {
  const B = o.band;
  fgrid(p, 4, 8, 20, 20, (x, y) => {
    const dx = (x - 12) / 7, dy = (y - 14) / 5.2, d = Math.hypot(dx, dy);
    if (d > 1 || d < 0.62) return null;
    const t = (d - 0.62) / 0.38, a = Math.atan2(dy, dx);
    let k = 2.5 - dx * 1.4 - (dy < 0 ? 0.6 : -0.3);
    if (dy >= 0) { k += t > 0.25 && t < 0.6 ? 0.5 : 0; if (t > 0.86) k -= 0.8; }               // Vorderseite gewölbt
    else if (t < 0.18) k -= 0.6;                                                               // Innenkante hinten
    if (t > 0.3 && t < 0.62 && a > 2.15 && a < 2.75) return B[4];                              // Glanzbogen links vorn
    if (t > 0.55 && t < 0.85 && a > -2.6 && a < -2.15) return B[4];                            // Lichtkante hinten
    return pick(B, k);
  });
  if (o.gem) {
    // Fassung mit Krappen, darauf der facettierte Stein
    fgrid(p, 9.5, 10.5, 14.5, 12, (x, y, F, G) => (G === 21 ? B[3] : B[1]));
    gemFine(p, 12, 8, 3, o.gem);
    for (const [F, G] of [[17, 15], [30, 15], [23, 8]]) { fdot(p, F, G, B[4]); fdot(p, F + 1, G, B[2]); fdot(p, F, G + 1, B[2]); }
  } else { fdot(p, 17, 22, '#ffffff'); }
}
// Amulett fein: Gliederkette, Öse, Anhänger mit abgeschrägter Fassung und Filigranpunkten
function amuletFine(p, o) {
  const C = o.chain ?? M.gold;
  for (const side of [-1, 1]) {
    let s = 0;
    for (let i = 0; i <= 80; i++) {
      const t = i / 80, x = 4.5 + t * 7, y = 2.5 + Math.sin(t * Math.PI * 0.5) * 9;
      const X = side < 0 ? x : 24 - x, F = Math.floor(X * 2), G = Math.floor(y * 2);
      const link = Math.floor(s / 1.1) % 2;
      if (link) { fdot(p, F, G, C[side < 0 ? 4 : 3]); fdot(p, F + side, G + 1, C[1]); }
      else fdot(p, F, G, C[side < 0 ? 2 : 1]);
      s += Math.hypot(7, Math.cos(t * Math.PI * 0.5) * 9 * Math.PI * 0.5) / 80;
    }
  }
  switch (o.style) {
    case 'bone': {
      const Bn = M.bone;
      fgrid(p, 8, 12, 16, 21, (x, y) => {
        const dx = x - 12, dy = y - 16, d = Math.hypot(dx, dy);
        const jaw = y > 18 && y < 19.5 && Math.abs(dx) < 1.6;
        if (d > 3.6 && !jaw) return null;
        if (Math.abs(Math.abs(dx) - 1) < 0.75 && dy > -1.4 && dy < 0.4) return dy < -0.8 ? '#2a1414' : '#140808';   // Augenhöhlen
        if (Math.abs(dx) < 0.3 && dy > 0.8 && dy < 1.6) return '#140808';                                         // Nase
        if (jaw) return Math.round(x * 2) % 2 ? Bn[1] : Bn[3];                                                    // Zähne
        return pick(Bn, 3 - (dx + dy) / 3.6 - (d > 3.1 ? 0.8 : 0) + (dx + dy < -3 ? 0.6 : 0));
      });
      break;
    }
    case 'sun': {
      const G = M.gold, Y = M.yellow;
      for (let a = 0; a < 8; a++) {
        const ca = Math.cos(a * 0.785), sa = Math.sin(a * 0.785);
        for (let rr = 3.8; rr < 6.2; rr += 0.25) fdot(p, (12 + ca * rr) * 2, (16.5 + sa * rr) * 2, Y[rr > 5.2 ? 4 : a % 2 ? 3 : 4]);
      }
      fgrid(p, 8, 12, 17, 21, (x, y) => {
        const dx = x - 12, dy = y - 16.5, d = Math.hypot(dx, dy);
        if (d > 3.6) return null;
        if (d > 3.1) return dx + dy < 0 ? G[4] : G[1];
        if (Math.abs(d - 2.2) < 0.25) return G[1];                                                               // Gravurring
        return pick(G, 3 - (dx + dy) / 4);
      });
      gemFine(p, 12, 16, 1, M.red);
      break;
    }
    default: {
      fgrid(p, 6, 11, 18, 22, (x, y) => {
        const dx = x - 12, dy = y - 16.5, d = Math.abs(dx) + Math.abs(dy) * 0.9;
        if (d >= 4.8) return null;
        if (d > 4.1) return dx + dy < 0 ? C[4] : dx - dy > 0 && dy < 0 ? C[3] : C[0];                           // Schräge Kante
        if (d > 3.6) return dx + dy < 0 ? C[2] : C[1];
        return pick(C, 3 - (dx + dy) / 3);
      });
      for (const [F, G] of [[24, 25], [24, 41], [16, 33], [32, 33]]) fdot(p, F, G, C[4]);                      // Filigran
      gemFine(p, 12, 16, 2, o.gem ?? M.red);
    }
  }
  // Öse am Kettenende
  fdot(p, 23, 22, C[3]); fdot(p, 24, 22, C[3]); fdot(p, 22, 23, C[4]); fdot(p, 25, 23, C[1]);
}
// Trank fein: Glas mit Randlicht, Flüssigkeit mit Spiegel und Lichtbündelung unten rechts, Spiegelung, Bläschen, Korken mit Maserung
function potionFine(p, o) {
  const F0 = o.fill, size = o.size ?? 2;
  const r = [4.2, 5.2, 6.4][size - 1] ?? 5.2, cy = 23 - r - 1;
  const neckH = [3, 4, 4][size - 1] ?? 4, nt = Math.round(cy - r - neckH + 1);
  const level = cy - r * 0.35, wd = M.wood;
  // Hals: Glas mit Lichtkante links, Schatten rechts, Lippe oben
  fgrid(p, 10, nt, 14, nt + neckH + 1, (x, y, F) => ['#e8f0f8', '#c8d4e4', '#9aaac0', '#8a9ab0', '#8a9ab0', '#8a9ab0', '#6a7a94', '#4a5a74'][F - 20]);
  fgrid(p, 9.5, nt, 14.5, nt + 0.5, (x) => (x < 11 ? '#e8f0f8' : x > 13.5 ? '#6a7a94' : '#c8d4e4'));
  // Korken: abgerundet, Maserung, Schattenseite
  fgrid(p, 9, nt - 3, 15, nt, (x, y, F, G) => {
    const top = G === (nt - 3) * 2, bot = G === nt * 2 - 1;
    if ((top || bot) && (F === 18 || F === 29)) return null;
    if (top) return wd[4];
    if (F >= 27) return wd[1];
    if (bot) return wd[2];
    if ((F * 3 + G * 5) % 7 === 0) return wd[2];
    return F < 20 ? wd[4] : wd[3];
  });
  if (size === 3) fgrid(p, 9, nt + 1, 15, nt + 2, (x, y, F, G) => (G === (nt + 1) * 2 ? (F > 25 ? M.gold[2] : M.gold[4]) : F > 25 ? M.gold[1] : M.gold[2]));
  // Bauch
  fgrid(p, 12 - r - 0.5, cy - r - 0.5, 12 + r + 0.5, cy + r + 0.5, (x, y) => {
    const dx = x - 12, dy = y - cy, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    if (d > r) return null;
    if (d > r - 0.5) return dy < 0 ? (dx < 0 ? '#c8d4e4' : '#9aaac0') : dx < -r * 0.5 ? '#6a7a94' : '#4a5a74';   // Glaskante
    if (d > r * 0.66 && d < r * 0.66 + 0.5 && a > -2.6 && a < -1.75) return '#ffffff';                       // Spiegelung
    if (y < level) return d > r - 1 ? '#2a3248' : '#1e2436';                                                  // leerer Teil
    if (y < level + 0.5) return F0[4];                                                                        // Flüssigkeitsspiegel
    if (d > r - 1) return F0[1];
    let k = 3 - (dx + dy) / r * 1.2;
    if (d > r * 0.45 && d < r * 0.8 && a > 0.3 && a < 1.3) k += 1;                                           // Lichtbündelung
    return pick(F0, k);
  });
  // Glanzpunkt und Bläschen
  fdot(p, (12 - r * 0.5) * 2, (cy - r * 0.15) * 2, '#ffffff');
  fdot(p, (12 - r * 0.5) * 2, (cy - r * 0.15) * 2 + 1, '#dfe7f2');
  for (let i = 0; i < size + 1; i++) {
    const bx = (12.6 + i * 0.9) * 2, by = (cy + 0.5 + (i % 2) * 1.2 - i * 0.4) * 2;
    if (by / 2 > level + 0.6) { fdot(p, bx, by, F0[4]); if (i % 2 === 0) fdot(p, bx + 1, by + 1, F0[2]); }
  }
}

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
// ---------------------------------------------------------------- Stufe 21–40: Tier 5–8 (INTEGRATION.md §12.7)
// Jede Stufe trägt die Farben ihres Gebiets: 5 Aschensteppe (Bronze, Kriegsrot), 6 Faulmarsch (Moos, Knochen, Gift),
// 7 Frostzinnen (Frost, Silber), 8 Glutöde (Obsidian, Gold, Glut). IDs: <visual>_t5 … _t8; Rüstung zusätzlich
// helm_tN / hood_tN, gloves_<stil>_tN, boots_<stil>_tN (stil: cloth, leather, mail, plate), ring_tN, amulet_tN.
// Fehlt eine Stufe (z. B. _t9), nimmt resolve() die nächstniedrigere (§12.7).
// Farben je Stufe: character/gearLook.js TIER_LOOK (dieselbe Quelle wie am Helden).
export const ICON_TIERS = Object.freeze([5, 6, 7, 8]);
for (const n of ICON_TIERS) {
  const T = TIER_LOOK[n], t = `_t${n}`;
  const blade = { blade: T.metal, guard: T.trim, gemRamp: T.gem, grip: T.grip, fuller: !T.jag, jag: !!T.jag, glow: T.glow, width: 2.4 };
  SWORDS[`sword${t}`] = blade;
  SWORDS[`greatsword${t}`] = { ...blade, width: 2.95, guardW: 5 };
  DAGGERS[`dagger${t}`] = { ...blade, short: true, width: 1.95, guardW: 3, curve: n === 5 ? 1.8 : 0, fuller: false };
  AXES[`axe${t}`] = { head: T.metal, haft: T.wood, double: n >= 7, bearded: n === 5, spike: n >= 6, glow: T.glow };
  MACES[`mace${t}`] = { head: T.metal, haft: T.wood, flanged: n === 5 || n === 7, spikes: n === 6 || n === 8, r: 4 };
  STAFFS[`staff${t}`] = { wood: T.wood, top: T.top, ramp: n === 6 ? M.green : n === 7 ? M.frost : T.gem, bands: n >= 7, gnarled: n === 6 };
  WANDS[`wand${t}`] = { wood: T.wood, top: n === 7 ? 'gem' : n === 6 ? 'orb' : 'flame', ramp: T.gem };
  BOWS[`bow${t}`] = { wood: T.wood, recurve: n >= 6, long: n === 7, tips: T.trim[3], grip: T.gem[3], string: n === 7 ? '#e8f0ff' : undefined };
  ARMORS[`cloth${t}`] = { ramp: T.cloth, style: 'robe', trim: T.trim, long: n >= 7, emblem: T.gem, glow: T.glow };
  ARMORS[`leather${t}`] = { ramp: T.leather, style: 'leather', shoulder: T.fur, emblem: n >= 7 ? T.gem : undefined };
  ARMORS[`mail${t}`] = { ramp: T.metal, style: n === 6 ? 'scale' : 'chain', shoulder: T.trim };
  ARMORS[`plate${t}`] = { ramp: T.metal, style: 'plate', shoulder: T.trim, rivets: true, tabard: n === 5 ? M.red : undefined, emblem: n >= 7 ? T.gem : undefined, glow: T.glow };
  HELMS[`helm${t}`] = { ramp: T.metal, style: 'nasal', horns: n === 5 || n === 8, crest: n === 7 ? M.blue : undefined };
  HELMS[`hood${t}`] = { ramp: n === 7 ? M.fur : T.leather, style: 'hood' };
  const styleRamp = { cloth: T.cloth, leather: T.leather, mail: T.metal, plate: T.metal };
  for (const st of ['cloth', 'leather', 'mail', 'plate']) {
    GLOVES[`gloves_${st}${t}`] = { ramp: styleRamp[st], style: st, cuff: st === 'leather' ? T.fur : T.trim, trim: T.trim, glow: st === 'plate' ? T.glow : undefined };
    BOOTS[`boots_${st}${t}`] = { ramp: styleRamp[st], style: st, cuff: st === 'leather' ? T.fur : T.trim, trim: T.trim, buckle: st === 'leather' || st === 'mail', glow: st === 'plate' ? T.glow : undefined };
  }
  GLOVES[`gloves${t}`] = GLOVES[`gloves_plate${t}`];
  BOOTS[`boots${t}`] = BOOTS[`boots_plate${t}`];
  JEWELRY[`ring${t}`] = () => ({ f: ring, o: { band: n === 6 ? M.silver : T.trim, gem: T.gem } });
  JEWELRY[`amulet${t}`] = () => ({ f: amulet, o: { chain: n === 6 ? M.silver : T.trim, gem: T.gem } });
}

// Zweihänder Stufe 8 (Königsfall, Aschefall): wie die Klinge am Helden – Aschestahl, Goldparier, Glutstein,
// glimmende Runen in der Hohlkehle, glühende Gegenschneide.
SWORDS.greatsword_t8 = { blade: M.ashsteel, guard: M.gold, gemRamp: M.ember, grip: M.red, runes: M.ember, runeFuller: true, glow: M.ember, calm: true, width: 2.95, guardW: 5 };

// ---------------------------------------------------------------- Reittiere (mount_<id>, §12.6)
// Kopf und Hals im Profil (Blick nach rechts), aus Ellipsen und Kapseln zusammengesetzt.
// spec: { hide, mane, maneStyle ('hair'|'ruff'|'fire'), kind ('horse'|'wolf'|'bird'|'drake'), eye, ears, antlers, horns,
//         spikes, bone, bridle, mouthGlow, beak }
const inEll = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
function inCapsule(x, y, x0, y0, r0, x1, y1, r1) {
  const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy;
  const t = clamp(((x - x0) * dx + (y - y0) * dy) / L2, 0, 1);
  const px = x0 + dx * t, py = y0 + dy * t;
  return Math.hypot(x - px, y - py) <= r0 + (r1 - r0) * t;
}
const MOUNT_SHAPES = {
  // Hals (Kapsel), Wange (Ellipse), Nasenrücken (Kapsel), Maul (Ellipse)
  horse: { neck: [6, 24, 5.2, 11, 10, 3.6], cheek: [12.5, 9.5, 4.2, 3.8], bridge: [13, 8, 3, 19.5, 14.5, 2.3], muzzle: [19.6, 15, 2.8, 2.5], eye: [13, 8], nostril: [21, 15], ears: [[10.5, 3.5], [12.5, 3]] },
  wolf: { neck: [5, 24, 5.8, 10, 12, 4.4], cheek: [11.5, 11, 4.6, 4], bridge: [12, 10, 3.2, 21.5, 11.5, 1.6], muzzle: [20.5, 12.5, 2, 1.6], eye: [13, 9], nostril: [22, 11], ears: [[9, 3], [12, 3.5]] },
  bird: { neck: [7, 24, 3.4, 12, 9, 2.4], cheek: [13.5, 7.5, 3.2, 2.8], bridge: [14, 7, 1.6, 23, 10, 0.6], muzzle: [0, 0, 0, 0], eye: [14, 7], nostril: null, ears: null },
  drake: { neck: [6, 24, 5, 11, 10.5, 3.4], cheek: [12.5, 9.5, 4, 3.6], bridge: [13, 8.5, 3, 21, 13, 1.8], muzzle: [20.5, 13.5, 2.2, 2], eye: [13.5, 8], nostril: [22, 12.5], ears: null },
};
function mountHead(p, o) {
  const R = o.hide, N = o.mane ?? R, K = MOUNT_SHAPES[o.kind ?? 'horse'];
  const inNeck = (x, y) => inCapsule(x, y, K.neck[0], K.neck[1], K.neck[2], K.neck[3], K.neck[4], K.neck[5]);
  const inHead = (x, y) => inEll(x, y, K.cheek[0], K.cheek[1], K.cheek[2], K.cheek[3])
    || inCapsule(x, y, K.bridge[0], K.bridge[1], K.bridge[2], K.bridge[3], K.bridge[4], K.bridge[5])
    || (K.muzzle[2] > 0 && inEll(x, y, K.muzzle[0], K.muzzle[1], K.muzzle[2], K.muzzle[3]));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const X = x + 0.5, Y = y + 0.5, head = inHead(X, Y), neck = inNeck(X, Y);
    if (!head && !neck) continue;
    // Licht von oben links, Unterseite dunkler, Hals etwas dunkler als der Kopf
    let lvl = 2.9 - (Y - 10) / 9 - (X - 12) / 14 - (neck && !head ? 0.4 : 0);
    if (head && !inHead(X, Y + 1.2)) lvl -= 0.9;                 // Kinnlinie
    if (head && !inHead(X - 1.2, Y) && !neck) lvl += 0.6;        // Stirnkante
    let c = pick(R, lvl);
    if (o.bone && neck && !head && ((y + (x >> 1)) % 3 === 0) && inNeck(X - 1.5, Y) && inNeck(X + 1.5, Y)) c = '#140c10';   // Rippen
    if (o.bone && head && Y > K.cheek[1] + 2 && X > K.cheek[0] + 2 && (x % 2 === 0)) c = '#140c10';                          // Zähne
    if (o.belly && neck && !head && X > K.neck[0] + 1.5 && inNeck(X + 1.6, Y)) c = pick(o.belly, lvl);
    p.px(x, y, c);
  }
  // Maulspalte, Nüstern
  if (K.nostril) p.px(K.nostril[0], K.nostril[1], R[0]);
  if (K.muzzle[2] > 0) p.line(Math.round(K.muzzle[0] - 3), Math.round(K.muzzle[1] + 1), Math.round(K.muzzle[0] + 1), Math.round(K.muzzle[1] + 1), o.mouthGlow ? o.mouthGlow[3] : R[0]);
  if (o.mouthGlow) p.px(Math.round(K.muzzle[0]), Math.round(K.muzzle[1] + 1), o.mouthGlow[4]);
  if (o.beak) { p.line(15, 7, 23, 10, o.beak[3]); p.line(15, 8, 22, 10, o.beak[2]); p.px(23, 10, o.beak[1]); }
  // Ohren: spitze Dreiecke
  if (o.ears && K.ears) for (const [ex, ey] of K.ears) {
    const h = o.ears === 'tall' ? 5 : 4;
    for (let k = 0; k < h; k++) { const w = Math.max(0, 1.6 - k * 0.45); for (let dx = -w; dx <= w; dx += 1) p.px(Math.round(ex + dx + k * 0.25), Math.round(ey + 2 - k), k === h - 1 ? R[4] : dx < 0 ? R[3] : R[1]); }
    p.px(Math.round(ex + 0.5), Math.round(ey + 1), o.earIn ?? R[0]);
  }
  // Mähne entlang des Nackens (links vom Hals) und Schopf auf der Stirn
  if (o.maneStyle) {
    const [nx0, ny0, , nx1, ny1, r1] = K.neck;
    for (let i = 0; i <= 18; i++) {
      const t = i / 18, x = nx0 + (nx1 - nx0) * t - (K.neck[2] + (r1 - K.neck[2]) * t) * 0.8, y = ny0 + (ny1 - ny0) * t - 1.5;
      const len = o.maneStyle === 'fire' ? 2 + Math.round(hash(i, 3, 7) * 3) : o.maneStyle === 'ruff' ? 2 + (i % 2) : 2 + (i % 3 === 0 ? 1 : 0);
      for (let k = 0; k < len; k++) {
        const col = o.maneStyle === 'fire' ? N[clamp(4 - k, 1, 4)] : N[clamp(3 - k + (i % 2), 0, 4)];
        p.px(Math.round(x - k * 0.9), Math.round(y - k * (o.maneStyle === 'fire' ? 0.9 : 0.35)), col);
      }
    }
    if (o.kind !== 'wolf') for (let k = 0; k < 3; k++) p.px(12 + k, 5 + k, N[3 - (k >> 1)]);   // Schopf
  }
  if (o.antlers) {
    const A = o.antlers;
    p.line(11, 5, 7, 0, A[3]); p.line(9, 3, 5, 3, A[2]); p.line(8, 1, 6, -1, A[4]);
    p.line(13, 4, 17, 0, A[3]); p.line(15, 2, 19, 2, A[2]); p.line(16, 1, 15, -1, A[4]);
  }
  if (o.horns) { const Hn = o.horns; p.line(11, 6, 6, 2, Hn[3]); p.line(11, 7, 6, 3, Hn[1]); p.px(5, 1, Hn[4]); p.line(13, 5, 11, 1, Hn[2]); p.px(11, 0, Hn[4]); }
  if (o.spikes) for (let i = 0; i < 5; i++) { const x = K.neck[0] - K.neck[2] + 1 + i * 1.3, y = 21 - i * 3; p.px(Math.round(x - 1), Math.round(y), o.spikes[3]); p.px(Math.round(x - 2), Math.round(y - 1), o.spikes[4]); }
  // Auge (mit Glühen bei magischen Reittieren)
  const E = o.eye ?? ['#140c10'];
  p.px(K.eye[0], K.eye[1], E[0]);
  if (E[1]) { p.px(K.eye[0] + 1, K.eye[1], E[1]); p.px(K.eye[0], K.eye[1] - 1, E[1]); }
  else p.px(K.eye[0] + 1, K.eye[1] - 1, R[4]);
  // Zaumzeug
  if (o.bridle) { p.line(12, 11, 18, 13, o.bridle[2]); p.line(14, 6, 13, 11, o.bridle[2]); p.px(13, 11, M.gold[4]); }
}
// Sporenkäfer: runder Panzer mit Pilzhüten, Blick nach rechts
function mountBeetle(p, o = {}) {
  const S1 = o.shell ?? ['#10200e', '#20401a', '#3a6a28', '#62a040', '#a8e070'];
  for (let y = 6; y < 22; y++) for (let x = 2; x < 20; x++) {
    const dx = (x + 0.5 - 10.5) / 8.5, dy = (y + 0.5 - 14) / 7;
    if (dx * dx + dy * dy > 1) continue;
    let c = pick(S1, 3 - (dx + dy) * 1.2);
    if (Math.abs(x + 0.5 - 10.5 - (y - 14) * 0.2) < 0.6 && y < 20) c = o.seam ?? S1[0];
    p.px(x, y, c);
  }
  const head = o.head ?? M.darkleather, eye = o.eye ?? M.green[4];
  ball(p, 19.5, 15, 3, head); p.px(21, 14, eye); p.px(20, 13, eye);
  p.line(21, 12, 23, 9, head[3]); p.line(20, 12, 21, 8, head[2]);
  if (o.gems) {
    // Glutsteine statt Pilze
    for (const [x, y] of [[7, 12], [11, 9], [14, 13]]) { ball(p, x, y, 1.6, o.gems); p.px(x - 1, y - 1, o.gems[4]); }
    for (const x of [5, 9, 13, 16]) { p.px(x, 21, head[1]); p.px(x - 1, 22, head[1]); }
    return;
  }
  for (const [x, y, r] of [[6, 7, 3], [11, 5, 3.6], [15, 8, 2.4]]) {
    for (let yy = -r; yy <= 0; yy++) for (let xx = -r; xx <= r; xx++) if (xx * xx + yy * yy * 1.8 <= r * r) p.px(Math.round(x + xx), Math.round(y + yy), pick(M.red, 3.2 + yy / r - xx / (r * 2)));
    p.px(Math.round(x - 1), Math.round(y - r + 1), '#fff0e0'); p.px(Math.round(x + 1), Math.round(y - 1), '#fff0e0');
    rect(p, Math.round(x), Math.round(y) + 1, 1, 2, M.paper[3]);
  }
  for (const x of [5, 9, 13, 16]) { p.px(x, 21, M.darkleather[1]); p.px(x - 1, 22, M.darkleather[1]); }
}
const EYE_GLOW = (R) => ['#140c10', R[4]];
const MOUNTS = {
  mount_steppe_horse: { kind: 'horse', hide: M.bronze, mane: M.darkwood, maneStyle: 'hair', ears: true, bridle: M.red },
  mount_ash_wolf: { kind: 'wolf', hide: M.ash, mane: M.fur, maneStyle: 'ruff', ears: 'tall', eye: ['#140c10', '#ffb640'], belly: M.paper },
  mount_marsh_strider: { kind: 'bird', hide: M.moss, mane: M.green, maneStyle: 'ruff', beak: M.yellow, eye: ['#140c10', '#f0dc50'], spikes: M.green },
  mount_bone_stallion: { kind: 'horse', hide: M.bone, mane: M.green, maneStyle: 'fire', ears: true, bone: true, eye: EYE_GLOW(M.green) },
  mount_frost_elk: { kind: 'horse', hide: M.frost, mane: M.silver, maneStyle: 'ruff', ears: true, antlers: M.silver, eye: ['#0a1838', '#ffffff'] },
  mount_golden_stag: { kind: 'horse', hide: ['#24120a', '#462412', '#6e3c1e', '#9a5e30', '#c8884a'], mane: M.paper, maneStyle: 'ruff', ears: true, antlers: M.gold, bridle: M.gold, eye: ['#140c10', '#ffe08a'] },
  mount_ember_charger: { kind: 'horse', hide: M.darkwood, mane: M.ember, maneStyle: 'fire', ears: true, bridle: M.gold, eye: EYE_GLOW(M.ember) },
  mount_cinder_drake: { kind: 'drake', hide: M.obsidian, horns: M.bone, spikes: M.ember, eye: EYE_GLOW(M.ember), mouthGlow: M.ember, belly: M.ember },
  mount_nightmare_steed: { kind: 'horse', hide: M.darkleather, mane: M.purple, maneStyle: 'fire', ears: true, eye: EYE_GLOW(M.purple), mouthGlow: M.purple },
  // Seltenste Bossbeute (Runde 07.10.)
  mount_hellhound: { kind: 'wolf', hide: ['#080405', '#140a0a', '#261210', '#3e1c16', '#5e2a1c'], mane: M.ember, maneStyle: 'fire', ears: 'tall', horns: M.bone, eye: EYE_GLOW(M.ember), mouthGlow: M.ember, belly: ['#3a0e05', '#7a2208', '#c8420c', '#f07a1c', '#ffd890'] },
  mount_rime_drake: { kind: 'drake', hide: ['#1a2c4a', '#3a6290', '#7eaad0', '#c4e2f6', '#ffffff'], horns: M.silver, spikes: M.frost, eye: ['#0a1838', '#ffffff'], mouthGlow: M.frost, belly: M.frost },
  // Exklusive Shop-Designs (character/mounts.js)
  mount_phoenix_wing: { kind: 'drake', hide: ['#5a1208', '#8c220c', '#c04412', '#e8822a', '#ffc85a'], horns: M.gold, spikes: ['#86180a', '#c4340e', '#ec6416', '#ffa22e', '#ffe48a'], eye: ['#3a0804', '#fff0b0'], mouthGlow: M.gold, belly: M.gold },
  mount_astral_stallion: { kind: 'horse', hide: ['#08081e', '#12163a', '#1c265e', '#2a3a8a', '#4660bc'], mane: ['#3a58c0', '#7c9cf0', '#c4d8ff', '#e8f0ff', '#ffffff'], maneStyle: 'fire', ears: true, bridle: M.silver, eye: ['#0a1030', '#ffffff'] },
  mount_soul_wolf: { kind: 'wolf', hide: ['#081a1e', '#10343a', '#1a5458', '#287c7a', '#4eb2a2'], mane: ['#147060', '#26b48c', '#78f2c4', '#b8fae0', '#e4fff4'], maneStyle: 'fire', ears: 'tall', eye: ['#041410', '#7affd4'], belly: ['#10343a', '#1a5458', '#287c7a', '#4eb2a2', '#8ad8c0'] },
};
for (const [id, o] of Object.entries(MOUNTS)) DRAW[id] = (p) => mountHead(p, o);
DRAW.mount_spore_beetle = mountBeetle;
DRAW.mount_ember_scarab = (p) => mountBeetle(p, { shell: ['#3a1e08', '#6a4012', '#a8701c', '#e0a832', '#fff0a0'], seam: M.ember[3], head: M.bronze, eye: M.ember[4], gems: M.ember });
DRAW.mount = DRAW.mount_steppe_horse;
// Krone der Gefallenen (Erfolg „Die Sieben Gefallenen“): offene Goldkrone mit fünf Zacken und Glutsteinen
DRAW.crown_fallen = (p) => {
  const G = M.gold, E = M.ember;
  rect(p, 3, 14, 18, 5, G[2]); rect(p, 3, 14, 18, 1, G[4]); rect(p, 3, 15, 18, 1, G[3]); rect(p, 3, 18, 18, 1, G[1]); rect(p, 3, 19, 18, 1, G[0]);
  for (const [x, top] of [[3, 9], [7, 7], [11, 4], [16, 7], [20, 9]]) {
    const w = x === 11 ? 2 : 1;
    rect(p, x, top + 1, w, 14 - top - 1, G[3]); if (w === 1) p.px(x, 14, G[3]);
    p.px(x, top + 1, G[4]);
    rect(p, x - (w === 1 ? 1 : 0), top - 1, w === 1 ? 3 : 2, 2, G[3]); p.px(x, top - 1, G[4]);
  }
  for (const [x, w] of [[4, 3], [8, 3], [13, 3], [17, 3]]) rect(p, x, 13 - (x === 8 || x === 13 ? 2 : 1), w, x === 8 || x === 13 ? 3 : 2, G[2]);
  for (const [x, c] of [[6, E[3]], [11, E[4]], [12, E[3]], [17, E[3]]]) { p.px(x, 16, c); p.px(x, 17, E[2]); }
  p.px(11, 15, E[4] ?? E[3]);
};
// Färbungen aus Erfolgen (character/cosmetics.js): hängendes Tuch in den Farben der Färbung
function dyeCloth(p, R) {
  rect(p, 5, 3, 14, 2, M.gold[2]); rect(p, 5, 3, 14, 1, M.gold[4]); p.px(4, 3, M.gold[1]); p.px(19, 3, M.gold[1]);
  for (let y = 5; y < 21; y++) for (let x = 6; x < 18; x++) {
    const tail = y >= 17 && Math.abs(x - 11.5) < (y - 16) * 1.4;   // Schwalbenschwanz unten
    if (tail) continue;
    const fold = (x - 6) % 4;                                       // senkrechte Falten
    let k = fold === 0 ? 1 : fold === 1 ? 3 : 2;
    if (x === 6) k = 0;
    if (y === 5) k = Math.min(4, k + 1);
    if (fold === 1 && y < 9) k = 4;                                 // Licht oben links
    p.px(x, y, R[Math.min(R.length - 1, k)]);
  }
}
for (const [id, d] of Object.entries(DYES)) DRAW[`dye_${id}`] = (p) => dyeCloth(p, d.ramp);
// Knopf „Reittier“: Hufeisen
DRAW.ui_mount = (p) => {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x + 0.5 - 12, dy = y + 0.5 - 11, d = Math.hypot(dx, dy);
    if (d < 5.2 || d > 9 || (dy > 2 && Math.abs(dx) < 5.5)) continue;
    if (dy > 9) continue;
    p.px(x, y, pick(M.silver, 3 - (dx + dy) / 8 - (d > 8 ? 1 : 0)));
  }
  for (const [x, y] of [[5, 8], [5, 13], [18, 8], [18, 13], [8, 4], [15, 4]]) p.px(x, y, M.darkleather[0]);
  rect(p, 3, 18, 5, 2, M.silver[2]); rect(p, 16, 18, 5, 2, M.silver[2]);
};

// ---------------------------------------------------------------- Feinfassung: Material, Quest, Anhänger, Reittiere, Farben
// Paket 8 des Grafikupdates (docs/STYLE.md „Feinraster“ §6): jedes übrige Motiv bekommt eine handfeine 48er-Fassung mit
// derselben Silhouette wie die 24er-Zeichnung oben. Neu im Feinraster: Maserung und Kratzer, Nähte als Punktlinie,
// Facetten mit Glanzkante, heißer Kern in Glut und Magie, Fell in Strähnen. Licht von oben links, nur deckende Farben.
// Koordinaten wie bei den Feinfassungen oben: x/y im 24er-Maß (Mitte des Feinpixels), F/G = Feinpixel 0..47.
function segT(x, y, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
  return clamp(((x - x0) * dx + (y - y0) * dy) / L2, 0, 1);
}
function segD(x, y, x0, y0, x1, y1) {
  const t = segT(x, y, x0, y0, x1, y1);
  return Math.hypot(x - x0 - (x1 - x0) * t, y - y0 - (y1 - y0) * t);
}
// Feine Linie im 24er-Maß, dicht je Feinpixel (fn(t) -> Farbe oder feste Farbe)
function fl(p, x0, y0, x1, y1, c) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
  for (let i = 0; i <= n; i++) {
    const t = i / n, col = typeof c === 'function' ? c(t, i) : c;
    fdot(p, Math.floor((x0 + (x1 - x0) * t) * 2), Math.floor((y0 + (y1 - y0) * t) * 2), col);
  }
}
// Funkelstern aus Feinpixeln: Kern + kurze Strahlen
function twinkle(p, F, G, arm = 1, core = '#ffffff', ray = core) {
  fdot(p, F, G, core);
  for (let k = 1; k <= arm; k++) { fdot(p, F - k, G, ray); fdot(p, F + k, G, ray); fdot(p, F, G - k, ray); fdot(p, F, G + k, ray); }
}
// Kugelförmige Schattierung: Stufe für einen Punkt (dx, dy relativ, r Radius), Licht oben links
const domeK = (dx, dy, r, base = 2.7, s = 1.25) => base - (dx + dy) / r * s;

// --- Speisen
function breadFine(p) {
  const C = M.bronze, crumb = M.paper;
  fgrid(p, 3, 8, 21, 20, (x, y) => {
    const dx = (x - 12) / 8.5, dy = (y - 14) / 5, d = dx * dx + dy * dy;
    if (d > 1) return null;
    for (const cx of [7.5, 11.5, 15.5]) {
      if (d > 0.72) break;
      const e = segD(x, y, cx, 10, cx + 2.2, 12.6);
      if (e < 0.75) {
        const side = (x - cx) - (y - 10) * 0.85;
        return e < 0.3 ? crumb[2] : side < 0 ? C[1] : crumb[3];   // Schnitt: Schattenkante links, Krume rechts
      }
    }
    let k = 3.3 - (dx + dy) * 1.3;
    if (d > 0.8) k -= dy > -0.2 ? 1.1 : 0.3;                       // Randkruste
    if (dy > 0.6) k -= 0.5;                                        // Unterseite
    if (d < 0.5 && dx < -0.1 && dy < -0.15 && dy > -0.55) k += 0.6; // Glanz der Kruste
    return pick(C, k);
  });
  for (const [F, G] of [[13, 19], [19, 18], [26, 18], [31, 19], [22, 20], [35, 21], [10, 24], [28, 21], [16, 22]]) fdot(p, F, G, '#fff4dc');   // Mehlstaub
}
function meatFine(p) {
  const R = ['#3a1410', '#6a2418', '#9a3a28', '#c05a40', '#e08a6a'], fat = ['#a07a60', '#d8b090', '#f0d4b8', '#fff0e0'];
  fgrid(p, 13, 13, 23, 23, (x, y) => {
    const knob = Math.hypot(x - 20.3, y - 20.3) < 2.1 || Math.hypot(x - 21.6, y - 18.6) < 1.5 || Math.hypot(x - 18.6, y - 21.6) < 1.5;
    const sh = segD(x, y, 15, 15, 20, 20) < 1.05;
    if (!knob && !sh) return null;
    const v = (x - y) * 0.7;
    return pick(M.bone, knob ? domeK(x - 20.3, y - 20.3, 2.2, 3) : 3 + v * 0.8);
  });
  fgrid(p, 3, 5, 17, 18, (x, y) => {
    const dx = (x - 10) / 6.5, dy = (y - 11) / 5.5, d = dx * dx + dy * dy;
    if (d > 1) return null;
    if (d > 0.8 && dy < 0.1) return fat[clamp(Math.round(2.6 - (dx + dy) * 1.4), 0, 3)];         // Fettkappe oben
    if (d > 0.72 && d <= 0.8 && dy < 0.1) return R[1];
    let k = 3.1 - (dx + dy) * 1.4;
    const fib = Math.abs(((x * 0.8 + y * 1.6) % 2.4 + 2.4) % 2.4 - 1.2);                            // Fasern quer
    if (d < 0.68 && fib < 0.2) k -= 1.1;
    if (d < 0.5 && dx < -0.15 && dy < -0.1 && fib > 0.85) k += 0.7;                                  // feuchter Glanz
    if (d > 0.82) k -= 0.7;
    return pick(R, k);
  });
  fdot(p, 11, 13, '#ffffff'); fdot(p, 12, 13, fat[2]); fdot(p, 11, 14, fat[2]);
}

// --- Papier
function paperK(F, G) { return hash(F >> 3, G, 4) < 0.05 ? -0.5 : 0; }   // vereinzelte Papierfasern (8 Feinpixel lang)
function scrollFine(p) {
  const P = M.paper;
  fgrid(p, 5, 4, 19, 20, (x, y, F, G) => {
    let k = 3 - (x - 5) / 26 + paperK(F, G);
    if (x > 18) k = 1.6;                                                // rechte Schattenkante
    return pick(P, k);
  });
  // Schrift: Zeilen aus kurzen Glyphen, die letzte Zeile kürzer
  for (let row = 0; row < 6; row++) {
    const G = 15 + row * 3, end = row === 5 ? 26 : 32;
    let F = 13;
    while (F < end) {
      const l = 1 + Math.floor(hash(F, G, 2) * 4);
      for (let i = 0; i < l && F + i < end; i++) { fdot(p, F + i, G, P[0]); if (hash(F + i, G, 6) < 0.3) fdot(p, F + i, G - 1, P[1]); }
      F += l + 1;
    }
  }
  // Rollen oben und unten: Zylinder mit Licht oben, Stirnseiten als Spirale
  for (const [y0, y1] of [[2, 5], [19, 22]]) {
    fgrid(p, 3, y0, 21, y1, (x, y) => {
      const v = (y - y0) / (y1 - y0);
      if (x < 4) return v < 0.5 ? P[2] : P[1];                         // Stirnseite
      if (Math.abs(x - 3.75) < 0.3 && Math.abs(v - 0.5) < 0.2) return P[0];
      return pick(P, v < 0.22 ? 4 : v < 0.5 ? 3 : v < 0.8 ? 2 : 1);
    });
  }
  // Siegelband mit Wachs
  fgrid(p, 14, 18, 17, 23.5, (x, y) => (y > 22.5 && Math.abs(x - 15.5) < 0.8 ? null : x < 15 ? M.red[3] : x < 16 ? M.red[2] : M.red[1]));
  fgrid(p, 13, 15.5, 18, 20.5, (x, y) => {
    const dx = x - 15.5, dy = y - 18, d = Math.hypot(dx, dy) + Math.sin(Math.atan2(dy, dx) * 5) * 0.2;
    if (d > 2.3) return null;
    if (d > 1.9) return dx + dy < 0 ? M.red[3] : M.red[1];
    if (d < 1.2) return dx + dy < -0.4 ? M.red[2] : dx + dy > 0.6 ? M.red[4] : M.red[3];   // Prägung: Mulde
    return pick(M.red, 3 - (dx + dy) / 2);
  });
}
function letterFine(p) {
  const P = M.paper;
  fgrid(p, 3, 6, 21, 19, (x, y, F, G) => {
    const flapL = y - 6 < (x - 3) * 0.78, flapR = y - 6 < (21 - x) * 0.78;
    let k = 3 + paperK(F, G) - (y - 6) / 30;
    if (flapL && flapR) k += 0.6;                                       // Klappe oben (näher am Licht)
    const eL = Math.abs((y - 6) - (x - 3) * 0.78), eR = Math.abs((y - 6) - (21 - x) * 0.78);
    if (y > 6.5 && y < 13.4 && (eL < 0.4 || eR < 0.4)) return x < 12 ? P[1] : P[0];          // Falzkante
    if (y > 6.5 && y < 13.4 && (eL < 0.9 || eR < 0.9) && !(flapL && flapR)) k -= 0.7;          // Schatten unter der Klappe
    const fL = (y - 19) + (x - 3) * 0.6, fR = (y - 19) + (21 - x) * 0.6;                       // untere Falze
    if (Math.abs(fL) < 0.35 || Math.abs(fR) < 0.35) return P[2];
    if (y > 18.4) k = 1;
    if (x > 20.4) k = Math.min(k, 1.8);
    return pick(P, k);
  });
  // Wachssiegel mit Flammenprägung, Kordel
  fl(p, 3.2, 13.6, 9.6, 13.2, M.red[1]); fl(p, 14.6, 13.2, 20.8, 13.8, M.red[1]);
  fgrid(p, 9, 10, 15.5, 16.5, (x, y) => {
    const dx = x - 12.2, dy = y - 13.2, d = Math.hypot(dx, dy) + Math.sin(Math.atan2(dy, dx) * 6 + 1) * 0.22;
    if (d > 2.9) return null;
    if (d > 2.4) return dx + dy < 0 ? M.red[3] : M.red[1];
    const flame = Math.abs(dx) < 1.1 - (dy + 1.2) * 0.3 && dy > -1.6 && dy < 1.3;
    if (flame) return dx > 0.1 ? M.red[4] : M.red[1];                // erhabene Flamme: Licht rechts unten = Mulde
    return pick(M.red, 3 - (dx + dy) / 3);
  });
}
function mapFine(p) {
  const P = M.paper;
  const torn = (x, y) => hash(Math.floor(x * 2), Math.floor(y * 2), 11) < 0.35;
  fgrid(p, 3, 4, 21, 20, (x, y, F, G) => {
    if ((x < 3.5 || x > 20.5 || y < 4.5 || y > 19.5) && torn(x, y)) return null;   // ausgefranster Rand
    const panel = x < 8 ? 0 : x < 14 ? 1 : 2;
    let k = [3, 2.6, 3.2][panel] + paperK(F, G);
    if (Math.abs(x - 8) < 0.3 || Math.abs(x - 14) < 0.3) return panel === 1 ? P[3] : P[1];   // Faltkanten
    if (Math.abs(y - 12) < 0.25) k -= 0.6;
    // Land (Grün) und See (Blau)
    const land = Math.hypot((x - 7) / 3.2, (y - 7.5) / 2.4) + Math.sin(x * 2.1) * 0.12 < 1;
    if (land) return y < 7.5 ? M.green[3] : M.green[2];
    const lake = Math.hypot((x - 17.5) / 2.2, (y - 16.5) / 1.6) < 1;
    if (lake) return x + y < 34 ? M.blue[3] : M.blue[2];
    return pick(P, k);
  });
  // Fluss vom See nach links unten
  fl(p, 15.6, 16.8, 12, 18.2, M.blue[3]); fl(p, 12, 18.2, 8.5, 17.6, M.blue[3]);
  // Weg (gestrichelt) und Ziel-X
  const pts = [[5, 16], [9, 12], [13, 14], [17, 8.5]];
  let s = 0;
  for (let i = 0; i < 3; i++) fl(p, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], () => ((s++ >> 1) % 2 ? null : M.red[3]));
  fl(p, 16, 7, 18.6, 9.6, M.red[4]); fl(p, 18.6, 7, 16, 9.6, M.red[4]); fl(p, 16.5, 7, 19.1, 9.6, M.red[2]);
  // Kompassrose unten links
  twinkle(p, 11, 34, 2, M.gold[4], M.gold[2]); fdot(p, 11, 31, M.red[3]);
}

// --- Tierisches
function silkFine(p) {
  const W = ['#5a5470', '#8a84a2', '#b8b4cc', '#dedcec', '#ffffff'];
  fgrid(p, 5, 6, 19, 20.5, (x, y) => {
    const dx = (x - 12) / 7, dy = (y - 13) / 7.2, d = dx * dx + dy * dy;
    if (d > 1) return null;
    let k = domeK(dx, dy, 1, 2.4, 1.3);
    const s = (((y - x * 0.5 + dx * dx * 2.5) * 0.8) % 1 + 1) % 1;                     // Fadenwicklung, um die Kugel gebogen
    if (s < 0.16) k += 1.1; else if (s < 0.28) k -= 0.8;
    if (d > 0.86) k -= 0.6;
    return pick(W, k);
  });
  fl(p, 12, 0.5, 12, 6.2, W[3]); fl(p, 12.5, 1, 12.5, 6.2, W[1]);
  twinkle(p, 17, 17, 1); fdot(p, 18, 18, W[3]);
}
function boneFine(p) {
  const B = M.bone;
  const knobs = [[4, 18], [6, 20], [18, 4], [20, 6]];
  fgrid(p, 1.5, 1.5, 22.5, 22.5, (x, y) => {
    const sd = segD(x, y, 5.5, 18.5, 18.5, 5.5);
    let inK = null;
    for (const [kx, ky] of knobs) if (Math.hypot(x - kx - 0.5, y - ky - 0.5) < 2.3) inK = [kx + 0.5, ky + 0.5];
    if (!inK && sd > 1.35) return null;
    if (inK && sd > 1.35) return pick(B, domeK(x - inK[0], y - inK[1], 2.3, 3.1, 1.4));
    const v = ((x - 5.5) + (y - 18.5)) / Math.SQRT2;                 // quer zur Achse: <0 oben links
    if (v < -0.85) return B[4];
    if (v > 0.9) return B[1];
    return v < -0.2 ? B[3] : B[2];
  });
  fl(p, 9.5, 12.5, 10.5, 13.2, B[1]); fl(p, 10.5, 13.2, 10.8, 14.2, B[1]);                     // Haarriss
}
function fangFine(p) {
  const B = M.bone, Rt = ['#3a281c', '#5a4030', '#806048', '#a08060'];
  fgrid(p, 3, 3, 18, 22.5, (x, y) => {
    const t = (y - 3) / 19, w = Math.max(0.3, 4 - (y - 3) * 0.2), c = 9.5 + (y - 3) * 0.35, u = (x - c) / w;
    if (Math.abs(u) > 1) return null;
    if (y < 5.4) return Rt[clamp(Math.round(2.4 - u * 1.4 - (y - 3)), 0, 3)];                    // Wurzel, oben dunkler
    let k = 3.3 - u * 1.3 - t * 0.6;
    if (y < 6) k -= 0.8;                                                                          // Zahnhals
    if (u < -0.35 && u > -0.7 && t < 0.75) k = 4.2;
    if (Math.abs(u - 0.25) < 0.12 && t > 0.1 && t < 0.6) k -= 1;
    if (t > 0.88) k += 0.5;
    return pick(B, k);
  });
}
function peltFine(p) {
  const R = M.fur;
  fgrid(p, 2, 3, 22, 22, (x, y, F, G) => {
    const dx = (x - 12) / 8, dy = (y - 12.5) / 7.5, d = dx * dx + dy * dy;
    const leg = Math.abs(Math.abs(dx) - 0.95) < 0.25 && Math.abs(Math.abs(dy) - 0.85) < 0.3;
    const tuftEdge = d > 0.92 && d <= 1 && (Math.floor(Math.atan2(dy, dx) * 9) % 2 === 0);      // gezackter Fellrand
    if ((d > 1 || tuftEdge) && !leg) return null;
    if (leg && d > 1) {
      const out = Math.max(Math.abs(Math.abs(dx) - 0.95) / 0.25, Math.abs(Math.abs(dy) - 0.85) / 0.3);
      if (out > 0.7 && Math.abs(dy) > 0.95 && F % 2 === 0) return '#e8e0d0';                       // Krallen
      return pick(R, 2.4 - dy * 0.5 - out * 0.8);
    }
    let k = domeK(dx, dy, 1, 3, 0.9);
    // Strähnen: vom Rückgrat schräg nach außen, je Strähne Lichtkante und Schattenfuge
    const lane = (Math.abs(x - 12) - (y - 12.5) * 0.45 * Math.sign(x - 12 || 1)) * 1.25;
    const fr = ((lane % 1) + 1) % 1;
    if (fr < 0.2) k -= 1; else if (fr < 0.38) k += 0.6;
    if (Math.abs(dx) < 0.07 && Math.abs(dy) < 0.8) k -= 1;                                          // Rückenstreif
    if (d > 0.8) k -= 0.6;
    return pick(R, k);
  });
}
function clothFine(p) {
  const C = M.cloth, G = M.gold;
  fgrid(p, 3, 6, 21, 19, (x, y, F, Gy) => {
    const off = Math.floor(y) % 2 ? 0.5 : 0;
    if (x < 3 + off) return null;
    const layer = (y - 6) % 2;                                                                   // Lagen des Ballens
    let k = 3 - (y - 6) / 6.5;
    if (layer < 0.5) k += 0.6; else if (layer > 1.5) k -= 0.8;
    if (x < 3.6 + off && Gy % 2) return C[0];                                                    // Fransen
    if (Math.abs(x - 17.5) < 1.2) return null;                                                   // Band darüber
    if ((F + Gy * 3) % 13 === 0) k -= 0.4;                                                       // Webstruktur
    return pick(C, k);
  });
  fgrid(p, 16.2, 3, 18.8, 20, (x, y, F, Gy) => {
    let c = x < 17 ? G[4] : x > 18.2 ? G[1] : G[2];
    if (Math.abs(x - 17.5) < 0.3 && Gy % 3 === 0) c = G[0];                                      // Naht
    return c;
  });
}

// --- Erze, Steine, Essenzen
const ORE_SEEDS = [[7, 9], [11, 7.5], [15, 9.5], [8, 13.5], [12.5, 12.5], [16.5, 14], [9, 17.5], [13.5, 17], [5.5, 12]];
function oreFine(p, rock, vein, hot) {
  fgrid(p, 3, 5, 19.5, 21, (x, y) => {
    const dx = x - 11, dy = y - 13, a = Math.atan2(dy, dx);
    const r = 7.5 + Math.sin(a * 3 + 0.4) * 0.6 + Math.cos(a * 5) * 0.35;
    if (Math.hypot(dx, dy) > r) return null;
    let b1 = 1e9, b2 = 1e9, bi = 0;
    ORE_SEEDS.forEach(([sx, sy], i) => { const e = Math.hypot(x - sx, y - sy); if (e < b1) { b2 = b1; b1 = e; bi = i; } else if (e < b2) b2 = e; });
    const [sx, sy] = ORE_SEEDS[bi];
    const crack = b2 - b1 < 0.32;
    if (crack) {
      if (vein && hot && (bi + Math.floor(x)) % 3 !== 0) return b2 - b1 < 0.14 ? hot[4] : hot[3];   // glühende Risse
      return rock[0];
    }
    // Facettenlicht: Facette zeigt in Richtung Saat−Mitte, Licht oben links; Kante zur Mitte heller
    let k = 2.2 - ((sx - 11) + (sy - 13)) / 6 - (b1 > 1.6 ? 0.4 : 0);
    if (b2 - b1 < 0.6 && ((x - sx) + (y - sy)) < 0) k += 0.8;
    if (Math.hypot(dx, dy) > r - 0.6) k -= 0.7;
    return pick(rock, k);
  });
  if (vein && !hot) {
    for (const [x, y] of [[8, 10], [13, 13], [10, 16], [15, 9], [7, 14]]) {
      const F = x * 2, G = y * 2;
      fdot(p, F, G, vein[4]); fdot(p, F + 1, G, vein[3]); fdot(p, F + 2, G + 1, vein[2]); fdot(p, F, G + 1, vein[2]); fdot(p, F + 1, G + 1, M.rusty[2]); fdot(p, F - 1, G + 1, M.rusty[1]);
    }
  }
  if (hot) for (const [F, G] of [[17, 15], [27, 25], [21, 33], [31, 19]]) { fdot(p, F, G, hot[4]); fdot(p, F + 1, G, '#ffffff'); fdot(p, F, G + 1, hot[3]); }
}
function bigGemFine(p, R) {
  const W = '#ffffff';
  fgrid(p, 3, 4, 21, 21, (x, y) => {
    const dx = x - 12;
    if (y < 9) {                                                                                 // Krone
      const w = 4 + (y - 4) * 1.1;
      if (Math.abs(dx) > w) return null;
      if (y < 4.5) return R[4];
      const u = dx / w;
      if (y < 6.6 && Math.abs(dx) < 3.2) return dx < -1.2 ? W : dx < 1.4 ? R[4] : R[3];     // Tafel
      if (u < -0.62) return R[3];
      if (u > 0.62) return R[1];
      const star = Math.abs(Math.abs(dx) - (y - 6.6) * 1.4 - 1.6) < 0.45;                   // Sternfacetten
      return star ? (dx < 0 ? R[4] : R[2]) : dx < 0 ? R[3] : R[2];
    }
    if (y < 9.5) return dx < -4 ? R[4] : dx < 4 ? R[3] : R[2];                                  // Rundiste
    const w = 9.5 - (y - 9) * 0.82;
    if (Math.abs(dx) > w || w <= 0) return null;
    const u = dx / w, f = Math.floor((u + 1) * 3);                                             // 6 Pavillonfacetten
    const fu = (u + 1) * 3 - f;
    if (fu < 0.09 && f > 0) return R[0];
    let c = [R[3], R[4], R[2], R[2], R[1], R[0]][clamp(f, 0, 5)];
    if (f === 1 && y > 15) c = R[3];
    if (f === 2 && y < 12 && fu > 0.4) c = R[3];                                               // Lichtreflex innen
    return c;
  });
  twinkle(p, 15, 12, 2); twinkle(p, 34, 23, 1, R[4], R[3]);
}
function essenceFine(p) {
  const O = M.obsidian, P = M.purple;
  fgrid(p, 5, 6, 19.5, 20.5, (x, y) => {
    const dx = x - 12.5, dy = y - 13.5, d = Math.hypot(dx, dy);
    if (d > 6.6) return null;
    const a = Math.atan2(dy, dx), sw = Math.sin(a * 2 + d * 0.95);                             // Wirbel im Inneren
    if (d < 5.6 && sw > 0.72) return d < 2.6 ? P[4] : P[3];
    if (d < 5.6 && sw > 0.5) return P[2];
    let k = domeK(dx, dy, 6.6, 2.6, 1.4);
    if (d > 6) k = dx + dy < 0 ? 3 : 0.5;
    return pick(O, k);
  });
  twinkle(p, 20, 20, 1); fdot(p, 21, 21, P[4]);
  // umkreisende Seelenfunken in drei Größen
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * 6.283 + 0.3, F = Math.floor((12.5 + Math.cos(a) * 8.6) * 2), G = Math.floor((13.5 + Math.sin(a) * 8.6) * 2);
    if (i % 3 === 0) { fdot(p, F, G, P[4]); fdot(p, F + 1, G, P[3]); fdot(p, F, G + 1, P[3]); fdot(p, F + 1, G + 1, P[2]); }
    else fdot(p, F, G, i % 3 === 1 ? P[3] : P[2]);
  }
}
function dustFine(p) {
  const B = M.bone;
  fgrid(p, 3, 12, 21, 21, (x, y, F, G) => {
    const dx = (x - 12) / 8.5, dy = (y - 20) / 7, d = dx * dx + dy * dy;
    if (d > 1) return null;
    let k = 3 - dx * 1.1 - dy * 0.4;
    const ter = Math.abs(d - 0.45) < 0.035 || Math.abs(d - 0.75) < 0.03;                           // Rutschkanten im Häufchen
    if (ter) k -= 0.9;
    if (d > 0.9) k -= 0.6;
    if (hash(F, G, 2) > 0.96) k += 1.2;                                                             // einzelne Glitzerkörner
    return pick(B, k);
  });
  for (const [F, G] of [[17, 18], [29, 14], [35, 20], [13, 26]]) fdot(p, F, G, B[4]);
  twinkle(p, 23, 11, 1, '#ffffff', B[3]); twinkle(p, 30, 21, 0);
}

// --- Schlüssel, Siegel, Reliquie
function keyFine(p, R, bone) {
  fgrid(p, 1.5, 1.5, 12.5, 12.5, (x, y) => {
    const dx = x - 7, dy = y - 7, d = Math.hypot(dx, dy);
    if (d > 4.7 || d < (bone ? 2.4 : 2.2)) {
      if (!bone && d < 2.2) {
        const a = Math.atan2(dy, dx), r = 1.1 + Math.abs(Math.cos(a * 2)) * 0.9;
        if (d < r && d > r - 0.7) return dx + dy < 0 ? R[3] : R[1];
      }
      return null;
    }
    const t = (d - 2.2) / 2.5;
    let k = 3 - (dx + dy) / 4.7 * 1.3;
    if (t > 0.3 && t < 0.6 && dx + dy < -2) k = 4.4;
    if (t < 0.15 || t > 0.88) k -= 0.8;
    return pick(R, k);
  });
  // Schaft und Bart in Achsenkoordinaten: u entlang (0..L), v quer (positiv = unten links)
  const x0 = 9.6, y0 = 9.6, x1 = 21, y1 = 21, L = Math.hypot(x1 - x0, y1 - y0);
  fgrid(p, 8, 8, 23.5, 23.5, (x, y) => {
    const u = ((x - x0) + (y - y0)) / Math.SQRT2, v = ((x - x0) - (y - y0)) / -Math.SQRT2;
    if (u < 0 || u > L) return null;
    const shaft = Math.abs(v) < 1.05;
    const bit = v > 0 && v < 3.6 && ((u > L - 4.2 && u < L - 2.6) || (u > L - 1.8 && u < L) || (u > L - 2.6 && u < L - 1.8 && v < 2.2));
    if (!shaft && !bit) return null;
    if (Math.abs(u - 2.4) < 0.3 || Math.abs(u - 3.3) < 0.3) return R[1];                             // Zierringe
    if (shaft) return v < -0.5 ? R[4] : v < 0.2 ? R[3] : v < 0.7 ? R[2] : R[1];
    if (v > 3.1 || u > L - 0.4) return R[0];
    return (u - (L - 4.2)) % 1.6 < 0.4 ? R[3] : R[2];
  });
  if (bone) { fgrid(p, 5, 5, 9, 9, (x, y) => { const d = Math.hypot(x - 7, y - 7); return d < 1.3 ? (d < 0.6 ? '#ffffff' : M.purple[4]) : d < 1.9 ? M.purple[2] : null; }); }
  else { fdot(p, 9, 7, '#ffffff'); fdot(p, 10, 7, R[4]); }
}
function sealFine(p) {
  const R = M.red, G = M.gold;
  fgrid(p, 2.5, 2.5, 21.5, 22.5, (x, y) => {
    const dx = x - 12, dy = y - 12, a = Math.atan2(dy, dx);
    const r = 8.6 + Math.sin(a * 7 + 0.5) * 0.35 + (dy > 0 ? Math.max(0, Math.sin(a * 3) * 1.2) * (hash(Math.round(a * 3), 1) > 0.5 ? 1 : 0) : 0);  // Tropfen unten
    const d = Math.hypot(dx, dy);
    if (d > r) return null;
    if (d > 7.3 && d < 7.9) return dx + dy < 0 ? R[1] : R[3];                                  // Prägerand (Mulde)
    if (d > 7.9) return pick(R, 3.1 - (dx + dy) / 8 * 1.5);
    return pick(R, 2.4 - (dx + dy) / 8);
  });
  fgrid(p, 7.5, 7.5, 16.5, 16.5, (x, y) => {
    const dx = x - 12, dy = y - 12, d = Math.hypot(dx, dy);
    if (d > 4.3) return null;
    if (d > 3.7) return dx + dy < 0 ? G[4] : G[1];
    // erhabene Krone: drei Zacken über einem Band
    const band = dy > 0.4 && dy < 1.8 && Math.abs(dx) < 2.6;
    const spike = dy <= 0.4 && dy > -2.4 && [-2, 0, 2].some((cx) => Math.abs(dx - cx) < 0.75 - (0.4 - dy) * 0.18);
    if (band || spike) {
      const lit = (band && dy < 0.9) || (spike && dx < [-2, 0, 2].find((cx) => Math.abs(dx - cx) < 1));
      return lit ? G[4] : G[3];
    }
    if ((band || spike) === false && dy > 1.8 && dy < 2.3 && Math.abs(dx) < 2.6) return G[0];   // Schlagschatten
    return pick(G, 2.4 - (dx + dy) / 6);
  });
}
function relicFine(p) {
  const B = M.bone, Gd = M.gold, P = M.purple, VO = '#140808';
  fgrid(p, 4, 3, 20, 21, (x, y) => {
    const dx = x - 12, cr = Math.hypot(dx / 7, (y - 10) / 7) <= 1, jaw = y >= 14 && y < 20 && Math.abs(dx) < 5 - Math.max(0, y - 18) * 1.2;
    if (!cr && !jaw) return null;
    for (const ex of [-2.8, 2.8]) {                                                             // Augenhöhlen
      const e = Math.hypot((x - 12 - ex) / 1.9, (y - 10) / 1.7);
      if (e < 1) {
        const g = Math.hypot(x - 12 - ex + 0.2, y - 10.2);
        return g < 0.45 ? '#ffffff' : g < 0.9 ? P[4] : g < 1.3 ? P[2] : e > 0.8 && y < 10 ? '#2a1414' : VO;
      }
    }
    if (Math.abs(dx) < 1 - (y - 12) * 0.35 && y > 11.8 && y < 14.2) return y < 12.5 ? '#2a1414' : VO;  // Nase
    if (jaw && y >= 16.5 && y < 19.5) {
      const tooth = ((x - 7.6) % 2 + 2) % 2;
      if (tooth < 0.5 || Math.abs(y - 17.8) < 0.25) return VO;
      return y < 17.8 ? B[3] : B[2];
    }
    let k = cr ? domeK(dx, y - 9, 7, 3, 1.1) : 2.2 - dx / 8;
    if (cr && !jaw && y > 13.5) k -= 0.8;
    if (Math.abs(x - 15.2 - (y - 5) * 0.4) < 0.25 && y > 5 && y < 8.5) return B[1];           // Riss
    return pick(B, k);
  });
  // Goldreif mit drei Zacken und Steinen
  fgrid(p, 4.5, 0.5, 19.5, 4.6, (x, y) => {
    if (y > 3) return Math.abs(x - 12) < 7 ? (y < 3.5 ? Gd[4] : y < 4 ? Gd[3] : Gd[1]) : null;
    for (const cx of [6.5, 12.5, 17.5]) {
      const w = (3 - y) * 0.45 + 0.4;
      if (Math.abs(x - cx) < w && y > 0.9) return x < cx ? Gd[4] : Gd[2];
    }
    return null;
  });
  for (const cx of [6.5, 12.5, 17.5]) { fdot(p, cx * 2, 1, Gd[4]); }
  gemFine(p, 12, 3, 0.8, M.ember);
}

// --- Gold und Beutel
function coinFine(p, cx, cy) {
  fgrid(p, cx - 4.5, cy - 2.5, cx + 5, cy + 3.5, (x, y) => {
    const dx = x - cx - 0.5, dy = y - cy - 0.5, e = dx * dx / 20 + dy * dy / 6;
    const side = dy > 0 && dx * dx / 20 + (dy - 1) * (dy - 1) / 6 <= 1 && e > 1;               // Münzkante
    if (e > 1 && !side) return null;
    if (side) return Math.floor((x - cx) * 2) % 2 ? M.gold[1] : M.gold[2];                       // Riffelrand
    if (e > 0.72) return dx + dy < 0 ? M.gold[4] : M.gold[2];
    if (Math.abs(e - 0.3) < 0.08) return M.gold[2];                                              // Prägering
    return pick(M.gold, 3.3 - (dx + dy) / 3.2);
  });
  fdot(p, (cx - 2) * 2, (cy - 1) * 2 + 1, '#ffffff');
}
function goldFine(p) { for (const [x, y] of [[8, 18], [15, 18], [11, 15], [14, 12], [9, 10]]) coinFine(p, x, y); twinkle(p, 22, 21, 1); }
function goldPileFine(p) {
  const G = M.gold;
  // Untergrund des Haufens
  fgrid(p, 2, 8, 22, 22, (x, y) => {
    const dx = (x - 12) / 10, dy = (y - 21) / 12;
    return dx * dx + dy * dy > 1 ? null : pick(G, 1.6 - dx * 0.8);
  });
  // Münzen von hinten nach vorn: versetzte Reihen, jede mit Rand, Prägung, Lichtkante
  const coins = [];
  for (let row = 0; row < 7; row++) {
    const cy = 10.2 + row * 1.75;
    for (let cx = 3.4 + (row % 2) * 1.5; cx < 21; cx += 3) {
      const jx = (hash(row, Math.round(cx), 3) - 0.5) * 0.8, X = cx + jx, dx = (X - 12) / 10, dy = (cy + 0.6 - 21) / 12;
      if (dx * dx + dy * dy < 0.86) coins.push([X, cy]);
    }
  }
  for (const [cx, cy] of coins) fgrid(p, cx - 1.8, cy - 1.1, cx + 1.8, cy + 1.4, (x, y) => {
    const e = ((x - cx) / 1.7) ** 2 + ((y - cy) / 0.95) ** 2;
    const edge = ((x - cx) / 1.7) ** 2 + ((y - cy - 0.45) / 0.95) ** 2;
    if (e > 1 && edge > 1) return null;
    if (e > 1) return G[1];
    if (e > 0.6) return (x - cx) + (y - cy) * 1.6 < 0 ? G[4] : G[2];
    return (x - cx) < -0.3 ? G[4] : G[3];
  });
  gemFine(p, 12, 13, 1.2, M.red);
  gemFine(p, 7, 17, 0.7, M.blue);
  twinkle(p, 16, 21, 2); twinkle(p, 32, 30, 1); fdot(p, 21, 33, '#ffffff');
}
function bagFine(p) {
  const L = M.leather, G = M.gold;
  fgrid(p, 3, 7.5, 21, 22, (x, y, F, Gy) => {
    const dx = (x - 12) / 8, dy = (y - 15.5) / 6.5, d = dx * dx + dy * dy;
    if (d > 1) return null;
    let k = 3.3 - (dx + dy) * 1.35;
    if (y < 12.5) { const f = Math.sin((x - 12) * 1.4) * (12.5 - y) / 4; k += f * 1.2; }               // Raffung unter dem Band
    if (Math.abs(d - 0.8) < 0.05 && dy > -0.2 && F % 3 === 0) return L[0];                              // Naht unten
    if (d > 0.88) k -= 0.8;
    return pick(L, k);
  });
  // Hals: gerafft, nach oben ausgestellt, gezackter Saum
  fgrid(p, 7.5, 3, 16.5, 8.4, (x, y, F) => {
    const w = 2.2 + (8 - y) * 0.42, dx = x - 12;
    if (Math.abs(dx) > w) return null;
    if (y < 3.8 && ((F >> 1) % 2)) return null;
    const f = ((dx / w + 1) * 3.5) % 1;
    if (y < 4.4) return L[4];
    return f < 0.25 ? L[1] : f < 0.6 ? L[3] : L[2];
  });
  // Zugband: Goldkordel mit Quaste
  fgrid(p, 8.6, 7.6, 15.4, 9, (x, y, F) => ((F + Math.floor(y * 2)) % 3 === 0 ? G[1] : y < 8.3 ? G[4] : G[2]));
  fl(p, 15, 9, 16.2, 12, G[3]); fl(p, 15.5, 9, 16.7, 12, G[1]);
  fgrid(p, 15.2, 12, 18, 14.2, (x, y) => (Math.hypot(x - 16.5, y - 13) < 1 ? (x + y < 29.3 ? G[4] : G[2]) : null));
  twinkle(p, 14, 21, 1, '#fff4c8', L[4]);
}
function crownFallenFine(p) {
  const G = M.gold, E = M.ember;
  fgrid(p, 2, 3, 22, 20.5, (x, y, F) => {
    // Zacken mit Kugelspitzen
    for (const [cx, top] of [[3.5, 9], [7.5, 7], [12, 4], [16.5, 7], [20.5, 9]]) {
      const w = cx === 12 ? 1.4 : 1;
      if (Math.hypot(x - cx, y - top) < (cx === 12 ? 1.4 : 1.1)) return x + y < cx + top - 0.4 ? G[4] : G[2];
      if (y > top && y < 14 && Math.abs(x - cx) < w * (0.6 + (y - top) / 14)) return x < cx - 0.1 ? G[4] : x > cx + w * 0.4 ? G[1] : G[3];
    }
    // Bögen zwischen den Zacken
    for (const [cx, h] of [[5.5, 1.6], [9.7, 2.6], [14.3, 2.6], [18.5, 1.6]]) if (y > 14 - h * Math.cos((x - cx) / 2.2) && y < 14 && Math.abs(x - cx) < 2.2) return y < 14 - h * Math.cos((x - cx) / 2.2) + 0.6 ? G[3] : G[1];
    if (y < 14 || y > 20 || x < 3 || x > 21) return null;
    // Reif mit Gravur und Kante
    if (y < 14.5) return G[4];
    if (y < 15.2) return G[3];
    if (y > 19.4) return G[0];
    if (y > 18.6) return G[1];
    if ((F % 6 === 0) && y > 15.6 && y < 18.2) return G[1];
    return x < 6 ? G[3] : G[2];
  });
  for (const cx of [6.5, 12, 17.5]) emberFine(p, cx - 0.5, 16.5, cx === 12 ? 1.4 : 1, E);
}

// --- Anhänger (Charms)
function charmFine(p, o) {
  const L = M.leather, I = M.iron, B = M.bone;
  fl(p, 12, 0.5, 12, 5, (t, i) => (i % 3 === 0 ? L[1] : L[3])); fl(p, 12.5, 0.5, 12.5, 5, L[2]);
  fgrid(p, 10.5, 4.6, 14.5, 7.2, (x, y) => { const d = Math.hypot((x - 12.5) / 1.8, (y - 5.9) / 1.2); return d < 1 && d > 0.45 ? (y < 5.9 ? I[4] : I[2]) : null; });
  if (o.style === 'skull') {
    fgrid(p, 6.5, 6.5, 18, 19, (x, y) => {
      const dx = x - 12.5, cr = Math.hypot(dx / 5, (y - 12) / 4.8) <= 1, jaw = y > 15 && y < 18.4 && Math.abs(dx) < 2.8;
      if (!cr && !jaw) return null;
      for (const ex of [-2, 2]) { const e = Math.hypot(x - 12.5 - ex, y - 12); if (e < 1.4) return e < 0.5 ? M.green[4] : e < 0.9 ? M.green[2] : '#140808'; }
      if (Math.abs(dx) < 0.6 && y > 13.8 && y < 15) return '#140808';
      if (jaw && y > 16.4 && (((x - 10) % 1.2 + 1.2) % 1.2 < 0.45 || y > 17.8)) return '#140808';
      return pick(B, cr ? domeK(dx, y - 11, 5, 3, 1.2) : 2);
    });
  }
  if (o.style === 'feather') {
    const R = M.red;
    fgrid(p, 6, 6.5, 19, 22.5, (x, y, F, G) => {
      const t = (y - 7) / 15;
      if (t < 0 || t > 1) return null;
      const cx = 12.5 + Math.sin(t * 2.6) * 1.6, dx = x - cx;
      const wl = 0.4 + 3.1 * Math.sin(Math.min(1, t / 0.86) * Math.PI) ** 0.6, wr = wl * 0.75;   // linke Fahne breiter
      if (dx < -wl || dx > wr) return null;
      if (t > 0.86 && Math.abs(dx) > 0.35) return null;                                              // Kielende frei
      if (Math.abs(dx) < 0.3) return t < 0.86 ? B[4] : B[2];                                         // Kiel
      const barb = (((y + Math.abs(dx) * 0.9) * 1.4) % 1 + 1) % 1;                                  // Fahnenäste schräg zum Kiel
      let k = dx < 0 ? 3.5 : 2.3;
      if (barb < 0.22) k -= 1.1;
      if (Math.abs(dx) > (dx < 0 ? wl : wr) - 0.55) k -= 0.7;
      if (dx < 0 && Math.abs(barb - 0.6) < 0.06 && t < 0.5) return R[4];
      if (Math.abs(dx) > (dx < 0 ? wl : wr) * 0.7 && t > 0.3 && t < 0.4 && dx < 0) return null;     // eine Kerbe in der Fahne
      return pick(R, k - t * 0.7);
    });
  }
  if (o.style === 'tooth') {
    fgrid(p, 7, 6.5, 18, 21.5, (x, y) => {
      const t = (y - 7) / 14, w = Math.max(0.4, 3.4 - (y - 7) * 0.24), c = 12.5 + (y - 7) * 0.2, u = (x - c) / w;
      if (Math.abs(u) > 1 || t > 1) return null;
      let k = 3.3 - u * 1.3 - t * 0.5;
      if (u < -0.3 && u > -0.65 && t < 0.7) k = 4.2;
      return pick(B, k);
    });
    fgrid(p, 8.5, 6.5, 16.5, 9.2, (x, y, F, G) => ((F + G) % 3 === 0 ? L[1] : y < 7.4 ? L[4] : L[2]));
  }
}

// --- Färbungen (hängendes Tuch)
function dyeFine(p, R) {
  const G = M.gold;
  fgrid(p, 6, 5, 18, 21, (x, y, F, Gy) => {
    const tail = y >= 17 && Math.abs(x - 12) < (y - 16) * 1.4;
    if (tail) return null;
    const f = ((x - 6) % 4 + 4) % 4;                                                             // Falten 4 breit
    let k = f < 0.5 ? 0.6 : f < 1.5 ? 3.2 : f < 2.5 ? 2.4 : 1.6;
    if (f >= 1 && f < 1.5 && y < 10) k = 4;                                                      // Glanz oben
    if (x < 6.5) k = 0;
    if (y < 5.5) k += 0.7;
    if (Gy % 2 === 0 && y > 16.2 && y < 16.7) return G[2];                                       // Saumborte
    if (Math.abs(y - 16) < 0.25 && F % 2 === 0) return G[3];
    return R[clamp(Math.round(k), 0, R.length - 1)];
  });
  // Stange mit Knäufen
  fgrid(p, 3.5, 2.5, 20.5, 5, (x, y) => {
    if (x < 5 || x > 19) return Math.hypot(x - (x < 5 ? 4.3 : 19.7), y - 3.8) < 1.1 ? (x + y < (x < 5 ? 7.5 : 23) ? G[4] : G[1]) : null;
    return y < 3.4 ? G[4] : y < 4.1 ? G[3] : y < 4.6 ? G[2] : G[1];
  });
}

// --- Reittiere (Kopf und Hals, wie mountHead)
function mountHeadFine(p, o) {
  const R = o.hide, N = o.mane ?? R, K = MOUNT_SHAPES[o.kind ?? 'horse'];
  const inNeck = (x, y) => inCapsule(x, y, K.neck[0], K.neck[1], K.neck[2], K.neck[3], K.neck[4], K.neck[5]);
  const inHead = (x, y) => inEll(x, y, K.cheek[0], K.cheek[1], K.cheek[2], K.cheek[3])
    || inCapsule(x, y, K.bridge[0], K.bridge[1], K.bridge[2], K.bridge[3], K.bridge[4], K.bridge[5])
    || (K.muzzle[2] > 0 && inEll(x, y, K.muzzle[0], K.muzzle[1], K.muzzle[2], K.muzzle[3]));
  const furry = o.kind === 'wolf';
  const scaly = o.kind === 'drake';
  fgrid(p, 0, 0, S, S, (x, y, F, G) => {
    const head = inHead(x, y), neck = inNeck(x, y);
    if (!head && !neck) return null;
    let lvl = 2.9 - (y - 10) / 9 - (x - 12) / 14 - (neck && !head ? 0.4 : 0);
    if (head && !inHead(x, y + 0.9)) lvl -= 0.9;                                                 // Kinnlinie
    if (head && !inHead(x - 0.8, y) && !neck) lvl += 0.7;                                        // Stirnkante
    if (head && !inHead(x - 0.4, y - 0.4) && !neck) lvl += 0.5;
    if (head && neck && !inNeck(x - 0.6, y + 0.6)) lvl -= 0.6;                                   // Halsfalte unter der Wange
    if (furry && neck && !head && ((((y - x * 0.55) % 1.6) + 1.6) % 1.6) < 0.3 && hash(Math.floor((y - x * 0.55) / 1.6), Math.floor(x / 1.5), 9) < 0.4) lvl -= 0.7;   // Fellstriche
    if (scaly && ((F + (G >> 1) * 2) % 4 === 0) && (G % 2 === 0)) lvl -= 0.6;                    // Schuppen
    if (!furry && !scaly && neck && !head && inNeck(x + 1.2, y) && !inNeck(x + 1.9, y)) lvl += 0.6;   // Glanz am Halsrücken
    let c = pick(R, lvl);
    if (o.bone && neck && !head && ((Math.floor(y * 2) + Math.floor(x)) % 5 < 1.2) && inNeck(x - 1.5, y) && inNeck(x + 1.5, y)) c = '#140c10';   // Rippen
    if (o.bone && head && y > K.cheek[1] + 2 && x > K.cheek[0] + 2 && (F % 3 === 0)) c = '#140c10';                                          // Zähne
    if (o.belly && neck && !head && x > K.neck[0] + 1.5 && inNeck(x + 1.4, y)) c = pick(o.belly, lvl + (G % 3 === 0 ? -0.6 : 0));
    return c;
  });
  // Maulspalte, Nüstern
  if (K.nostril) { fdot(p, K.nostril[0] * 2, K.nostril[1] * 2, R[0]); fdot(p, K.nostril[0] * 2 + 1, K.nostril[1] * 2, R[0]); fdot(p, K.nostril[0] * 2, K.nostril[1] * 2 - 1, R[1]); }
  if (K.muzzle[2] > 0) {
    fl(p, K.muzzle[0] - 3, K.muzzle[1] + 1.2, K.muzzle[0] + 1.6, K.muzzle[1] + 1.2, o.mouthGlow ? o.mouthGlow[3] : R[0]);
    if (o.mouthGlow) { fl(p, K.muzzle[0] - 1.5, K.muzzle[1] + 1.2, K.muzzle[0] + 0.8, K.muzzle[1] + 1.2, o.mouthGlow[4]); fdot(p, (K.muzzle[0] + 1.6) * 2, (K.muzzle[1] + 1.8) * 2, o.mouthGlow[3]); }
  }
  if (o.beak) {
    fgrid(p, 14.5, 6.5, 24, 11, (x, y) => {
      const d = segD(x, y, 15, 7.6, 23.2, 10.2), w = 0.95 - segT(x, y, 15, 7.6, 23.2, 10.2) * 0.7;
      if (d > w) return null;
      return y < 7.6 + (x - 15) * 0.32 ? o.beak[4] : y > 8.4 + (x - 15) * 0.25 ? o.beak[1] : o.beak[3];
    });
    fl(p, 16, 8.4, 21.5, 9.8, o.beak[0]);
  }
  // Ohren
  if (o.ears && K.ears) for (const [ex, ey] of K.ears) {
    const h = o.ears === 'tall' ? 5 : 4;
    fgrid(p, ex - 2, ey + 3 - h, ex + 3, ey + 3, (x, y) => {
      const k = (ey + 3 - y), w = Math.max(0, 1.7 - k * 0.42), cx = ex + 0.5 + k * 0.25;
      if (k < 0 || k > h || Math.abs(x - cx) > w) return null;
      if (Math.abs(x - cx - 0.2) < w * 0.45 && k > 0.6 && k < h - 1) return o.earIn ?? (o.eye?.[1] && o.eye[1] !== '#ffffff' ? R[0] : '#5a3a3a');   // Ohrinneres
      return k > h - 0.8 ? R[4] : x < cx ? R[3] : R[1];
    });
  }
  // Mähne: Strähnen im Feinraster, jede mit Licht- und Schattenkante
  if (o.maneStyle) {
    const [nx0, ny0, nr0, nx1, ny1, r1] = K.neck;
    for (let i = 0; i <= 54; i++) {
      const t = i / 54, x = nx0 + (nx1 - nx0) * t - (nr0 + (r1 - nr0) * t) * 0.8, y = ny0 + (ny1 - ny0) * t - 1.5;
      const fire = o.maneStyle === 'fire', ruff = o.maneStyle === 'ruff';
      const len = fire ? 2.2 + hash(i, 3, 7) * 3.2 : ruff ? 2 + (i % 3) * 0.6 : 2.2 + (i % 4 === 0 ? 1 : 0) + hash(i, 1) * 0.6;
      const n = Math.ceil(len * 2);
      for (let k = 0; k < n; k++) {
        const s = k / n, X = x - s * len * 0.95, Y = y - s * len * (fire ? 0.95 : ruff ? 0.5 : 0.38) + Math.sin(s * 3 + i) * (fire ? 0.3 : 0.15);
        const lane = i % 4, col = fire ? N[clamp(Math.round(4.2 - s * 3 - (lane === 3 ? 1 : 0)), 1, 4)] : N[clamp(Math.round(3 - s * 2 + (lane === 0 ? 1 : 0) - (lane === 2 ? 1 : 0)), 0, 4)];
        fdot(p, Math.floor(X * 2), Math.floor(Y * 2), col); fdot(p, Math.floor(X * 2) + 1, Math.floor(Y * 2), col);
      }
    }
    if (o.kind !== 'wolf') for (let k = 0; k < 7; k++) { fdot(p, 24 + k, 10 + k, N[k < 3 ? 4 : 3]); fdot(p, 25 + k, 10 + k, N[2]); fdot(p, 23 + k, 11 + k, N[1]); }   // Schopf
  }
  if (o.antlers) {
    const A = o.antlers;
    const bar = (x0, y0, x1, y1) => { fl(p, x0, y0, x1, y1, A[3]); fl(p, x0 + 0.5, y0 + 0.5, x1 + 0.5, y1 + 0.5, A[1]); fdot(p, Math.floor(x1 * 2), Math.floor(y1 * 2), A[4]); };
    bar(11, 5, 7, 0.2); bar(9.2, 2.8, 5, 2.6); bar(8, 1.3, 6.3, -0.5); bar(13, 4.2, 17, 0.2); bar(15, 2.2, 19.4, 2); bar(16, 1.2, 15.2, -0.5);
  }
  if (o.horns) {
    const Hn = o.horns;
    fgrid(p, 4.5, 0, 14, 8, (x, y) => {
      const d1 = segD(x, y, 11.5, 6.6, 5.6, 1.6), t1 = segT(x, y, 11.5, 6.6, 5.6, 1.6), w1 = 1.1 - t1 * 0.8;
      const d2 = segD(x, y, 13.2, 5.4, 11.2, 0.6), t2 = segT(x, y, 13.2, 5.4, 11.2, 0.6), w2 = 0.9 - t2 * 0.6;
      if (d1 < w1) return ((t1 * 9) % 1 < 0.2) ? Hn[1] : y < 6.6 - (11.5 - x) * 0.85 ? Hn[4] : Hn[2];   // Rillen
      if (d2 < w2) return x < 12.2 - (5.4 - y) * 0.42 ? Hn[3] : Hn[1];
      return null;
    });
  }
  if (o.spikes) for (let i = 0; i < 5; i++) {
    const x = K.neck[0] - K.neck[2] + 1 + i * 1.3, y = 21 - i * 3;
    fgrid(p, x - 3, y - 2, x + 0.5, y + 1, (X, Y) => { const d = segD(X, Y, x - 0.5, y + 0.4, x - 2.4, y - 1.4), t = segT(X, Y, x - 0.5, y + 0.4, x - 2.4, y - 1.4); return d < 0.75 - t * 0.6 ? (t > 0.6 ? o.spikes[4] : X + Y < x + y - 1.6 ? o.spikes[3] : o.spikes[2]) : null; });
  }
  // Auge: Augapfel, Pupille, Glanzpunkt; magische Reittiere mit heißem Kern
  const E = o.eye ?? ['#140c10'], ex = K.eye[0] * 2, ey = K.eye[1] * 2;
  fdot(p, ex - 1, ey - 1, R[0]); fdot(p, ex, ey - 1, R[0]); fdot(p, ex + 1, ey - 1, R[0]); fdot(p, ex + 2, ey, R[1]);   // Lidkante
  if (E[1]) {
    fdot(p, ex, ey, E[1]); fdot(p, ex + 1, ey, '#ffffff'); fdot(p, ex, ey + 1, E[1]); fdot(p, ex + 1, ey + 1, E[1]); fdot(p, ex + 2, ey + 1, E[1]); fdot(p, ex - 1, ey, E[0]);
  } else {
    fdot(p, ex, ey, E[0]); fdot(p, ex + 1, ey, E[0]); fdot(p, ex, ey + 1, E[0]); fdot(p, ex + 1, ey + 1, '#2a1c1c'); fdot(p, ex, ey, '#ffffff');
  }
  // Zaumzeug mit Nieten
  if (o.bridle) {
    const Bd = o.bridle;
    fl(p, 12, 11.2, 18.5, 13.4, Bd[2]); fl(p, 12, 11.7, 18.5, 13.9, Bd[1]);
    fl(p, 14.2, 6, 13, 11.4, Bd[2]); fl(p, 14.7, 6, 13.5, 11.4, Bd[1]);
    for (const [F, G] of [[26, 23], [33, 25], [28, 16]]) { fdot(p, F, G, M.gold[4]); fdot(p, F + 1, G + 1, M.gold[2]); }
  }
}
function mountBeetleFine(p, o = {}) {
  const S1 = o.shell ?? ['#10200e', '#20401a', '#3a6a28', '#62a040', '#a8e070'];
  const head = o.head ?? M.darkleather, eye = o.eye ?? M.green[4];
  // Beine
  for (const x of [5, 9, 13, 16]) { fl(p, x, 19.5, x - 0.8, 22.4, head[1]); fdot(p, (x - 1.4) * 2, 45, head[2]); }
  fgrid(p, 2, 6, 19, 22, (x, y, F, G) => {
    const dx = (x - 10.5) / 8.5, dy = (y - 14) / 7, d = dx * dx + dy * dy;
    if (d > 1) return null;
    const seam = x - 10.5 - (y - 14) * 0.2;
    if (Math.abs(seam) < 0.3 && y < 20) return o.seam ?? S1[0];
    if (Math.abs(seam) < 0.7 && y < 20) return seam < 0 ? S1[1] : S1[4];
    let k = domeK(dx, dy, 1, 3.1, 1.25);
    if (Math.abs(d - 0.55) < 0.04 && dx + dy < 0) k += 1;                                       // Glanzbogen
    if ((F * 3 + G * 7) % 29 === 0) k -= 1;                                                      // Poren
    if (d > 0.86) k -= 0.7;
    return pick(S1, k);
  });
  fgrid(p, 16, 11.5, 23.5, 18.5, (x, y) => { const d = Math.hypot(x - 20, y - 15.5); return d < 3 ? pick(head, domeK(x - 20, y - 15.5, 3, 3, 1.3)) : null; });
  fdot(p, 43, 28, eye); fdot(p, 42, 27, eye); fdot(p, 42, 28, '#ffffff'); fdot(p, 41, 26, eye);
  fl(p, 21.5, 12.5, 23.5, 9, head[3]); fl(p, 20.5, 12.5, 21.4, 8, head[2]); fdot(p, 47, 17, head[4]); fdot(p, 42, 15, head[4]);
  if (o.gems) {
    for (const [x, y] of [[7, 12], [11, 9], [14, 13]]) emberFine(p, x - 0.5, y - 0.5, 1.7, o.gems);
    return;
  }
  // Pilzhüte mit Lamellen und Tupfen, Stiele
  for (const [x, y, r] of [[6, 7, 3], [11, 5, 3.6], [15, 8, 2.4]]) {
    fgrid(p, x - 0.5, y + 0.5, x + 1, y + 3, (X) => (X < x + 0.2 ? M.paper[4] : M.paper[2]));
    fgrid(p, x - r, y - r, x + r + 1, y + 1, (X, Y) => {
      const xx = X - x - 0.5, yy = Y - y - 0.5;
      if (yy > 0.5 || xx * xx + yy * yy * 1.8 > r * r) return null;
      if (yy > 0) return ((Math.floor(X * 2)) % 2) ? M.paper[1] : M.paper[2];                  // Lamellen
      const sp = [[-0.5, -0.6], [0.4, -0.3], [-0.1, -0.85]].some(([u, v]) => Math.hypot(xx / r - u, yy / r - v) < 0.17);
      if (sp) return '#fff0e0';
      return pick(M.red, 3.4 + yy / r * 0.6 - xx / (r * 1.6) + (yy < -r * 0.75 ? 0.6 : 0));
    });
  }
}

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
// Feinfassung (res 2): Familien mit eigener 48er-Zeichnung; REG_FINE[id]() liefert die 48×48-Leinwand
const REG_FINE = {};
const fineIcon = (fn, o) => () => { const p = new FineCanvas(S, S, 2); fn(p, o); return p.canvas; };
for (const [id, o] of Object.entries(ARMORS)) REG_FINE[id] = fineIcon(armorFine, o);
for (const [id, o] of Object.entries(HELMS)) REG_FINE[id] = fineIcon(helmFine, o);
for (const [id, o] of Object.entries(GLOVES)) REG_FINE[id] = fineIcon(glovesFine, o);
for (const [id, o] of Object.entries(BOOTS)) REG_FINE[id] = fineIcon(bootsFine, o);
for (const [id, mk] of Object.entries(JEWELRY)) { const { f, o } = mk(); const fn = f === ring ? ringFine : f === amulet ? amuletFine : null; if (fn) REG_FINE[id] = fineIcon(fn, o); }
for (const [id, { f, o }] of Object.entries(CONSUMABLES)) if (f === potion) REG_FINE[id] = fineIcon(potionFine, o);
for (const [id, mk] of Object.entries(JEWELRY)) { const { f, o } = mk(); if (f === charm) REG_FINE[id] = fineIcon(charmFine, o); }
for (const [id, o] of Object.entries(MOUNTS)) REG_FINE[id] = fineIcon(mountHeadFine, o);
REG_FINE.mount_spore_beetle = fineIcon(mountBeetleFine, {});
REG_FINE.mount_ember_scarab = fineIcon(mountBeetleFine, { shell: ['#3a1e08', '#6a4012', '#a8701c', '#e0a832', '#fff0a0'], seam: M.ember[3], head: M.bronze, eye: M.ember[4], gems: M.ember });
REG_FINE.mount = REG_FINE.mount_steppe_horse;
for (const [id, d] of Object.entries(DYES)) REG_FINE[`dye_${id}`] = fineIcon(dyeFine, d.ramp);
Object.assign(REG_FINE, Object.fromEntries(Object.entries({
  food_bread: breadFine, food_meat: meatFine, scroll: scrollFine, letter: letterFine, map: mapFine, spider_silk: silkFine, bone: boneFine,
  fang: fangFine, pelt: peltFine, cloth: clothFine, essence_shadow: essenceFine, dust: dustFine, seal: sealFine, relic: relicFine,
  gold: goldFine, gold_pile: goldPileFine, bag: bagFine, crown_fallen: crownFallenFine,
  ore_iron: (p) => oreFine(p, ['#1a1622', '#252030', '#312a3d', '#4d4459', '#6f667c'], M.iron),
  ore_ember: (p) => oreFine(p, ['#140a0c', '#241418', '#342024', '#4a3034', '#6a4a4a'], true, M.ember),
  gem_ruby: (p) => bigGemFine(p, M.red), gem_sapphire: (p) => bigGemFine(p, M.blue), gem_amethyst: (p) => bigGemFine(p, M.purple),
  key_iron: (p) => keyFine(p, M.iron), key_bone: (p) => keyFine(p, M.bone, true),
}).map(([id, fn]) => [id, fineIcon(fn)])));
for (const [alias, target] of Object.entries({ food: 'food_bread', ore: 'ore_iron', gem: 'gem_ruby', key: 'key_iron', ui_map: 'map' })) REG_FINE[alias] ??= REG_FINE[target];
// Familien-Aliase für die Rückfallsuche
for (const [alias, target] of Object.entries({ robe: 'robe_mage', leather: 'leather_jerkin', plate: 'plate_iron', essence: 'essence_shadow', potion: 'potion_hp', armor: 'armor_mail', hood: 'hood', greatsword: 'sword_long', cloth: 'armor_cloth', mail: 'mail_chain' })) {
  REG[alias] ??= REG[target];
  if (REG[alias] === REG[target] && REG_FINE[target]) REG_FINE[alias] ??= REG_FINE[target];
}

export const ICON_IDS = Object.freeze(Object.keys(REG).filter((k) => !k.startsWith('ui_') && !k.startsWith('skill_') && !k.startsWith('passive_')));
export const SKILL_ICON_IDS = Object.freeze(Object.keys(SKILLS));

function resolve(id) {
  if (id && REG[id]) return id;
  // Stufen-Icons: fehlt _tN, die nächstniedrigere Stufe ab 5, sonst die Form ohne Stufe (gloves_plate_t9 → gloves_plate_t8)
  const m = id ? /^(.*)_t(\d+)$/.exec(String(id)) : null;
  if (m) {
    for (let n = +m[2] - 1; n >= 5; n--) if (REG[`${m[1]}_t${n}`]) return `${m[1]}_t${n}`;
    if (REG[m[1]]) return m[1];
  }
  const fam = id ? String(id).split('_')[0] : '';
  return REG[fam] ? fam : 'bag';
}

// ---------------------------------------------------------------- Item-Bild = getragenes Aussehen
// Ausrüstung (Waffe, Brust, Kopf, Hände, Füße) wird aus character/gearLook.js itemLook(def) gezeichnet: Form aus der
// Icon-Tabelle oben, Materialien, Steine, Leuchten, Zierrand, Kamm und Krone wie am Helden. Gleiches Aussehen am
// Helden ergibt dasselbe Bild, unterschiedliches Aussehen ein unterschiedliches. Seltenheit zeigt zusätzlich der Rahmen.
//   itemIconId(def) -> Icon-ID für iconEl/iconUrl/iconCanvas (Ausrüstung: 'look:<n>', sonst def.icon)
const tone = (R, k = 3) => (R ? R[k] : undefined);
function shapeOf(table, look, family) {
  const id = resolve(look.icon);
  return table[id] ?? table[family] ?? Object.values(table)[0];
}
// Waffen: dieselbe Zeichenfunktion wie in der Hand des Helden (sprites/hero.js drawWeaponIcon)
function weaponIcon(L) {
  return ['heroWeapon', L];
}
const LOOK_ICON = {
  weapon: weaponIcon,
  chest: (L) => ['armor', { long: shapeOf(ARMORS, L, L.style === 'robe' ? 'robe_mage' : `armor_${L.style}`).long, style: L.style, ramp: L.ramp, trim: L.trim ?? M.gold,
    shoulder: L.shoulder ?? null, fur: L.fur ?? null, tabard: L.tabard ?? null, emblem: L.emblem ?? null, glow: L.glow ?? null, spikes: !!L.spikes }],
  head: (L) => ['helm', { ramp: L.ramp, style: L.style === 'horned' ? 'nasal' : L.style, horns: L.style === 'horned', trim: L.trim ?? null, crest: L.crest ?? null,
    crown: L.crown ?? null, crownDim: !!L.crownDim, coif: !!L.coif, tail: !!L.tail, glow: L.glow ?? null, gem: L.gem ?? null }],
  hands: (L) => ['gloves', { ...shapeOf(GLOVES, L, `gloves_${L.style}`), style: L.style, ramp: L.ramp, cuff: L.trim ?? L.ramp, trim: L.trim ?? null, glow: L.glow ?? null }],
  feet: (L) => ['boots', { ...shapeOf(BOOTS, L, `boots_${L.style}`), style: L.style, ramp: L.ramp, cuff: L.trim ?? L.ramp, trim: L.trim ?? null, glow: L.glow ?? null }],
};
const DRAW_FN = { heroWeapon: (p, L) => drawWeaponIcon((x, y, c) => p.px(x, y, c), L, p.w), armor, helm, gloves, boots };
// Feinraster: Familien, die ihre 48er-Fassung selbst zeichnen (sonst 24er-Bild ×2 hochskaliert, gfx/Fine.js).
// Waffen über dieselbe Quelle wie am Helden (48er-PixelCanvas), Brust/Kopf/Hände/Füße über die Feinfassung oben.
const FINE_LOOK = {
  heroWeapon: (o) => () => { const p = new PixelCanvas(S * 2, S * 2); DRAW_FN.heroWeapon(p, o); return p.canvas; },
  armor: (o) => fineIcon(armorFine, o), helm: (o) => fineIcon(helmFine, o), gloves: (o) => fineIcon(glovesFine, o), boots: (o) => fineIcon(bootsFine, o),
};
const lookIds = new Map();   // JSON der Zeichenoptionen -> 'look:<n>'
const defIds = new Map();    // id|icon|rarity -> Icon-ID
export function itemIconId(def) {
  if (!def) return 'bag';
  const k = `${def.id ?? ''}|${def.icon ?? ''}|${def.rarity ?? ''}|${def.slot ?? ''}|${def.family ?? ''}`;
  let id = defIds.get(k);
  if (id) return id;
  id = def.icon;
  const r = def.type === 'weapon' || def.type === 'armor' ? itemLook(def) : null;
  const spec = r && LOOK_ICON[r.slot]?.(r.look);
  if (spec) {
    const key = JSON.stringify(spec);
    id = lookIds.get(key);
    if (!id) {
      id = `look:${lookIds.size}`;
      lookIds.set(key, id);
      const [f, o] = spec;
      REG[id] = (p) => DRAW_FN[f](p, o);
      if (FINE_LOOK[f]) REG_FINE[id] = FINE_LOOK[f](o);
    }
  }
  defIds.set(k, id);
  return id;
}

const canvasCache = new Map();
const urlCache = new Map();

// Feinraster (docs/STYLE.md „Feinraster“): Item-Bilder gibt es in zwei Feinheiten. res 2 = 48×48 (+ Umriss 50×50) für
// Bildschirme, die je Bildpunkt der 24er-Fassung mindestens 2 Gerätepixel zeigen (Retina, Handy, große Plätze).
// Form und Ausschnitt sind gleich, nur feiner: Waffen zeichnen sich selbst in 48 (gleiche Quelle wie am Helden),
// die übrigen Familien werden bis zu ihrer Überarbeitung ×2 hochskaliert und bekommen Lichtkante + feinen Umriss.
export function iconRes() { return (window.devicePixelRatio || 1) >= 1.5 ? 2 : 1; }

// 48er-Bild mit Umriss (50×50) mittig auf 52×52: genau 2 Feinpixel je Bildpunkt der 26er-Fassung, damit es im Platz
// (26 × --fpx CSS-px) ganzzahlig skaliert wird wie Rahmen und Effektstreifen (sonst ungleich breite Feinpixel).
function padFine(c) {
  const o = makeCanvas(c.width + 2, c.height + 2);
  o.getContext('2d').drawImage(c, 1, 1);
  return o;
}

export function iconCanvas(id, res = iconRes()) {
  const key = SKILL_ART[id] ? id : resolve(id);   // Embleme ohne Eintrag im Register (z. B. attack_<klasse>) direkt
  const ck = res > 1 ? `${key}@2` : key;
  let c = canvasCache.get(ck);
  if (!c) {
    if (SKILL_ART[key]) {
      // Fähigkeiten (Runde 6): 48×48-Embleme mit eigenem Rahmen, ohne Umriss
      const p = new PixelCanvas(SKILL_ART_SIZE, SKILL_ART_SIZE);
      SKILL_ART[key](p);
      c = p.canvas;
    } else if (res > 1 && REG_FINE[key]) {
      c = padFine(outlineCanvas(finishFine(REG_FINE[key](), { rim: 0.22, shade: 0.2 })));
    } else if (res > 1) {
      const p = new PixelCanvas(S, S);
      REG[key](p);
      c = padFine(outlineCanvas(finishFine(upscale2x(p.canvas), { rim: 0.22, shade: 0.2 })));
    } else {
      const p = new PixelCanvas(S, S);
      REG[key](p);
      c = outlineCanvas(p.canvas);
    }
    canvasCache.set(ck, c);
  }
  return c;
}

export function iconUrl(id, res = iconRes()) {
  const key = SKILL_ART[id] ? id : resolve(id);
  const ck = res > 1 ? `${key}@2` : key;
  let u = urlCache.get(ck);
  if (!u) { u = iconCanvas(key, res).toDataURL(); urlCache.set(ck, u); }
  return u;
}

// Ohne Angabe: Items mit eigener Feinfassung zeigen sie, sobald ein Bildpunkt der 26er-Fassung ≥ 2 Gerätepixel breit ist
// (auch am Desktop-Bildschirm); alles andere wie bisher nach devicePixelRatio.
export function iconEl(id, cssSize = 32, res = !SKILL_ART[id] && REG_FINE[resolve(id)] && cssSize / 26 * (window.devicePixelRatio || 1) >= 2 ? 2 : iconRes()) {
  const img = document.createElement('img');
  img.src = iconUrl(id, res);
  img.alt = '';
  img.className = 'ef-icon';
  img.width = cssSize; img.height = cssSize;
  img.draggable = false;
  return img;
}

let fineWatch = null;
function watchFine(img, id, res0) {
  if (typeof ResizeObserver !== 'function') return;
  fineWatch ??= new ResizeObserver((entries) => {
    for (const e of entries) {
      const w = e.contentRect.width;
      if (!w) continue;
      fineWatch.unobserve(e.target);
      const res = (w / 26) * (window.devicePixelRatio || 1) >= 2 ? 2 : 1, el = e.target;
      if (el.dataset.res !== String(res)) { el.src = iconUrl(el.dataset.icon, res); el.dataset.res = String(res); }
    }
  });
  img.dataset.icon = id;
  img.dataset.res = String(res0);
  fineWatch.observe(img);
}

// Item-Icon mit Seltenheitsrahmen (Aussehen in ui/theme.css: .ef-item-icon).
// Ab 24 px pixelgenau: ein gemeinsamer ganzzahliger Faktor --fpx (CSS-px je Bildpunkt) für Icon (26 Bildpunkte),
// Rahmen (gfx/RarityFrame.js) und Effektstreifen (gfx/ItemFx.js). Das Icon steht mittig und darf am Rand
// unter den Rahmen laufen. Panels mit festen Platzgrößen setzen --fpx per CSS selbst.
export function itemIconEl(def, cssSize = 40) {
  const span = document.createElement('span');
  const rarity = def?.rarity ?? 'common';
  span.className = `ef-item-icon r-${rarity}`;
  span.dataset.rarity = rarity;
  span.style.setProperty('--size', `${cssSize}px`);
  const u = cssSize >= 24 ? Math.max(1, Math.floor(cssSize / 24)) : 0;
  // Feinfassung, sobald ein Bildpunkt der 26er-Fassung mindestens 2 Gerätepixel breit ist – auch am Desktop-Bildschirm
  // (großer Platz, --fpx 2) und nicht erst bei devicePixelRatio ≥ 1,5. Panels setzen --fpx teils per CSS: die
  // tatsächliche Breite prüft fineWatch nach dem ersten Layout und tauscht die Fassung bei Bedarf (einmalig).
  const id = itemIconId(def), dev = (u ? u : cssSize * 0.8 / 26) * (window.devicePixelRatio || 1);
  const res = dev >= 2 ? 2 : 1, img = iconEl(id, u ? 26 * u : Math.round(cssSize * 0.8), res);
  if (u) watchFine(img, id, res);
  span.append(img);
  if (u) { span.classList.add('px'); span.style.setProperty('--fpx', `${u}px`); }
  if (def?.name) span.title = def.name;
  // Ab ungewöhnlich: gezeichneter Seltenheitsrahmen, ab episch mit Aufleuchten in Stufen (zweites Bild)
  if (rarity !== 'common' && u) {
    installRarityFrames();
    span.classList.add('framed');
    span.append(Object.assign(document.createElement('i'), { className: 'ef-frame' }));
    if (rarity === 'epic' || rarity === 'legendary') span.append(Object.assign(document.createElement('i'), { className: 'ef-frame lit' }));
  }
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
  const toneId = def && def.gold == null ? itemIconId(def) : id;   // Farbton wie das Item-Bild (getragenes Aussehen)
  const key = `${kind}|${resolve(toneId)}`;
  let c = lootCache.get(key);
  if (c) return c;
  const t = iconTone(toneId);
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

// Seltene Beute am Boden: Sprite mit 1-px-Kante in Seltenheitsfarbe statt schwarzem Umriss (11.10.)
const rimCache = new Map();
function rimSprite(spr, rarity, rw = 1) {
  let byRar = rimCache.get(spr);
  if (!byRar) { byRar = new Map(); rimCache.set(spr, byRar); }
  let c = byRar.get(rarity);
  if (c) return c;
  const [r, g, b] = rarityRgb(rarity);
  const sil = makeCanvas(spr.width, spr.height), sx = sil.getContext('2d');
  sx.drawImage(spr, 0, 0);
  sx.globalCompositeOperation = 'source-in';
  sx.fillStyle = `rgb(${r},${g},${b})`; sx.fillRect(0, 0, sil.width, sil.height);
  c = makeCanvas(spr.width + rw * 2, spr.height + rw * 2);
  const cx = c.getContext('2d');
  for (let r = 1; r <= rw; r++) for (const [dx, dy] of [[-r, 0], [r, 0], [0, -r], [0, r], ...(r > 1 ? [[-1, -1], [1, -1], [-1, 1], [1, 1]] : [])]) cx.drawImage(sil, rw + dx, rw + dy);
  cx.drawImage(spr, rw, rw);
  byRar.set(rarity, c);
  return c;
}

// Lichtsäule über liegender Beute: Höhe, halbe Kernbreite, halbe Breite (Pixel). Deckende Palettenpixel, nach oben
// per geordnetem Raster (Bayer 4×4) ausgedünnt statt halbtransparent; das Raster wandert nach oben (Säule steigt).
const LOOT_PILLAR = { uncommon: [14, -1, 0], rare: [28, 0, 1], epic: [44, 0, 2], legendary: [62, 1, 3] };
// Säulenfarben je Seltenheit: Rand, innen, Kern, Funke (dieselben Töne wie die Rahmen, gfx/RarityFrame.js)
const LOOT_PAL = {
  uncommon: ['#3e9a3a', '#7ad870', '#c8ffb8', '#ffffff'],
  rare: ['#3a7ad8', '#7ab0ff', '#d0e8ff', '#ffffff'],
  epic: ['#8a3ae0', '#c888ff', '#f6e6ff', '#ffe0f4'],
  legendary: ['#c85a0c', '#ff9a1a', '#ffd860', '#fff2b0'],
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const lit = (x, y, d) => BAYER[(y & 3) * 4 + (x & 3)] < d * 16;

// Beute zeichnen: Fußpunkt (x, y) in Bildschirm-Pixeln, bob = Höhe über dem Boden.
// Ab "uncommon" steigt eine Pixelsäule in Seltenheitsfarbe auf, ab "rare" mit farbiger Kante am Gegenstand;
// "epic"/"legendary" mit breiterer Säule, zweitem Bodenring und aufsteigenden Funken.
// opts.emissive: im Emissive-Pass nur Säule/Funken zeichnen (nach der Beleuchtung; Verdeckung: LootDrop.renderEmissive).
export function drawLoot(ctx, def, x, y, t = 0, { bob = 0, emissive = false } = {}) {
  const rarity = def?.gold != null ? 'common' : def?.rarity ?? 'common';
  const order = { rare: 1, epic: 2, legendary: 3 }[rarity] ?? 0;
  x = Math.round(x); y = Math.round(y);
  if (!emissive) {
    if (fineRes() > 1) {
      // Feinraster: das Item-Bild selbst (24er-Fassung = 12 Weltpixel), Kante in Seltenheitsfarbe ab selten
      const ic = iconCanvas(def?.gold != null || !def ? 'gold' : itemIconId(def), 1), spr = order ? rimSprite(ic, rarity, 2) : ic;
      const w = spr.width / 2, h = spr.height / 2;
      ctx.drawImage(spr, x - w / 2, Math.round((y - h - bob + 2 + (order ? 0.5 : 0)) * 2) / 2, w, h);
      return;
    }
    const spr = order ? rimSprite(lootSprite(def), rarity) : lootSprite(def);
    ctx.drawImage(spr, x - (spr.width >> 1), Math.round(y - spr.height - bob + 2 + (order ? 1 : 0)));
    return;
  }
  if (rarity === 'common') return;
  const pal = LOOT_PAL[rarity];
  const [tall, core, mid] = LOOT_PILLAR[rarity];
  const strong = Math.sin(t * 3) > -0.2; // zwei feste Helligkeitsstufen statt weichem Pulsieren
  const rise = Math.floor(t * 10);
  for (let j = 0; j < tall; j++) {
    const row = y - 3 - j, f = 1 - j / tall;
    // Dichte in festen Stufen: unten fast voll, oben vereinzelt
    const d = Math.ceil(f * 6) / 6 * (strong ? 0.8 : 0.66);
    for (let i = -mid - (order ? 1 : 0); i <= mid + (order ? 1 : 0); i++) {
      const a = Math.abs(i), edge = a > mid;
      const k = a <= core ? 2 : a <= mid - 1 || mid === 0 ? 1 : 0;
      if (!lit(x + i, row + rise, edge ? d * 0.35 : a <= core ? Math.min(1, d + 0.2) : d)) continue;
      ctx.fillStyle = pal[edge ? 0 : k];
      ctx.fillRect(x + i, row, 1, 1);
    }
  }
  // Bodenring aus kreisenden Pixelfunken; ab episch ein zweiter, gegenläufiger Ring
  const rings = order >= 2 ? [[7, 2.5, 1], [11, 4, -0.7]] : [[7, 2.5, 1]];
  for (const [rx, ry, dir] of rings) {
    const n = Math.round(rx * 2.4);
    for (let a = 0; a < n; a++) {
      if ((a + Math.floor(t * 10)) % 3 === 0) continue;
      ctx.fillStyle = a % 2 && order ? pal[strong ? 2 : 1] : pal[strong ? 1 : 0];
      ctx.fillRect(Math.round(x + Math.cos(a / n * 6.283 + t * dir) * rx), Math.round(y + Math.sin(a / n * 6.283 + t * dir) * ry), 1, 1);
    }
  }
  if (order >= 2) {
    for (let k = 0; k < 2 + order; k++) {
      const ph = (t * 0.8 + k / (2 + order)) % 1;
      ctx.fillStyle = pal[ph < 0.6 ? 3 : 1];
      ctx.fillRect(Math.round(x + Math.sin(k * 2.1 + t) * (mid + 3)), Math.round(y - 4 - ph * tall * 0.8), 1, 1);
    }
  }
  if (order === 3) legendaryCrown(ctx, pal, x, y, t);
}

// Legendär hebt sich deutlich von Episch ab: Flammenzungen im Kreis hinter und neben der Beute (in festen Stufen
// flackernd) und vier Runen, die auf dem Außenring wandern. Im Feinraster mit Feinpixeln, sonst ganze Weltpixel.
function legendaryCrown(ctx, pal, x, y, t) {
  const s = fineRes() > 1 ? 0.5 : 1, q = (v) => Math.round(v / s) * s;
  const step = Math.floor(t * 9);
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * 0.92 + i / 8 * Math.PI * 1.16;          // hintere Hälfte des Rings, etwas um die Seiten herum
    const fx = x + Math.cos(a) * 8, fy = y + Math.sin(a) * 3;
    const ph = (step + i * 3) % 4, h = 3.5 + ((i * 5) % 3) * 1.2 + (ph < 2 ? ph : 3 - ph) + (i === 4 ? 2 : 0);
    for (let j = 0; j < h; j += s) {
      const u = j / h, w = Math.max(s, (1 - u * u) * 2.4), sway = Math.sin(u * 3 + i + step * 0.7) * 0.5 * u;
      ctx.fillStyle = u > 0.78 ? pal[3] : u < 0.3 ? pal[2] : pal[1];
      ctx.fillRect(q(fx + sway - w / 2), q(fy - j - s), Math.max(s, q(w)), s);
      if (w > 1.2 && u < 0.6) { ctx.fillStyle = pal[0]; ctx.fillRect(q(fx + sway + w / 2 - s), q(fy - j - s), s, s); }   // Schattenkante rechts
    }
  }
  // Runen auf dem Außenring
  for (let i = 0; i < 4; i++) {
    const a = t * 0.6 + i * Math.PI / 2, rx = x + Math.cos(a) * 12, ry = y + Math.sin(a) * 4.5;
    ctx.fillStyle = pal[3]; ctx.fillRect(q(rx), q(ry - 1.5), s, 2); ctx.fillRect(q(rx - s), q(ry - 1), s * 3, s);
    ctx.fillStyle = pal[0]; ctx.fillRect(q(rx + s), q(ry + 0.5), s, s);
  }
  // Funkelstern an der Säulenspitze (zwei feste Stufen)
  const top = y - 3 - LOOT_PILLAR.legendary[0] * 0.92, big = step % 6 < 3;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(q(x), q(top), s, s);
  ctx.fillStyle = pal[3];
  for (let k = 1; k <= (big ? 3 : 2); k++) { ctx.fillRect(q(x - k * s), q(top), s, s); ctx.fillRect(q(x + k * s), q(top), s, s); ctx.fillRect(q(x), q(top - k * s), s, s); ctx.fillRect(q(x), q(top + k * s), s, s); }
}
