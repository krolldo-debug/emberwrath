// VERTRAG (Thread A): übersetzt angelegte Ausrüstung in das Aussehen der Spielfigur.
//   resolveGear(equipment, content) -> gear | null
//   gearKey(gear)                   -> kurzer Schlüssel (Sprite-Cache, Änderungserkennung)
// gear = {
//   weapon: { family, icon, rarity, …Materialien } | null,
//   chest:  { style: 'plate'|'chain'|'scale'|'leather'|'robe', ramp, trim?, shoulder?, tabard?, emblem?, glow?, fur?, rarity },
//   head:   { style: 'cap'|'nasal'|'horned'|'hood', ramp, crest?, rarity },
//   hands:  { style, ramp, glow?, rarity },
//   feet:   { style, ramp, glow?, rarity },
// }
// Die Materialien folgen den Item-Icons (gfx/Icons.js), damit Held, Inventar und
// Beute zusammenpassen. Unbekannte Icons fallen auf Familie + Seltenheit zurück.

export const MAT = {
  rusty: ['#2e1a14', '#5a3626', '#7e5440', '#a07a60', '#c8a484'],
  iron: ['#262a36', '#454c5e', '#69738a', '#9ea9bf', '#e2e8f2'],
  steel: ['#222a42', '#3e4e72', '#6a82b0', '#aec2e6', '#f6faff'],
  bronze: ['#3a2410', '#6a4420', '#9a6a30', '#c89a50', '#f4d898'],
  gold: ['#4a2f10', '#8a5a18', '#c8922a', '#f0c85a', '#fff4c0'],
  silver: ['#30343e', '#5a6272', '#9aa4b6', '#d0d8e6', '#ffffff'],
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
  moss: ['#12200e', '#22381a', '#3a5a2a', '#5e8440', '#9ac070'],
  fur: ['#241e26', '#3e3640', '#5e5462', '#867a88', '#b0a6b2'],
  holy: ['#4a3208', '#9a7018', '#e0b030', '#fff080', '#fffbe0'],
};
const M = MAT;

// Seltenheit -> Ersatzmaterial und Leuchten, wenn ein Icon unbekannt ist.
const RARITY_LOOK = {
  common: { metal: M.iron, wood: M.wood, cloth: M.leather },
  uncommon: { metal: M.steel, wood: M.wood, cloth: M.leather },
  rare: { metal: M.silver, wood: M.darkwood, cloth: M.cloth, gem: M.blue },
  epic: { metal: M.obsidian, wood: M.darkwood, cloth: M.arcaneCloth, gem: M.purple, glow: M.purple },
  legendary: { metal: M.gold, wood: M.darkwood, cloth: M.red, gem: M.ember, glow: M.ember },
};

// --- Waffen ------------------------------------------------------------------
const WEAPONS = {
  // Schwerter: blade/guard/grip, width 1..2 (Klingenbreite), len (Klingenlänge), curve, jag, fuller, runes, glow, gem
  sword: { blade: M.iron, guard: M.bronze, fuller: true },
  sword_rusty: { blade: M.rusty, guard: M.rusty, grip: M.wood, jag: true, len: 12 },
  sword_iron: { blade: M.iron, guard: M.iron, fuller: true },
  sword_steel: { blade: M.steel, guard: M.steel, grip: M.darkleather, fuller: true },
  sword_broad: { blade: M.steel, guard: M.bronze, width: 2, guardW: 3, fuller: true },
  sword_sabre: { blade: M.silver, guard: M.gold, curve: 1.6 },
  sword_long: { blade: M.steel, guard: M.iron, len: 16, fuller: true },
  sword_bone: { blade: M.bone, guard: M.bone, grip: M.darkleather, jag: true, width: 2 },
  sword_rune: { blade: M.steel, guard: M.silver, runes: M.purple, gem: M.purple },
  sword_ember: { blade: M.iron, guard: M.darkwood, grip: M.darkleather, glow: M.ember, flame: true, width: 2, gem: M.ember },
  sword_frost: { blade: M.frost, guard: M.silver, width: 2, gem: M.blue, glow: M.frost, fuller: true },
  sword_obsidian: { blade: M.obsidian, guard: M.obsidian, grip: M.darkleather, jag: true, width: 2, gem: M.purple, glow: M.purple },
  sword_royal: { blade: M.silver, guard: M.gold, grip: M.red, width: 2, guardW: 3, len: 16, gem: M.red, glow: M.ember, fuller: true },

  dagger: { blade: M.iron, guard: M.bronze },
  dagger_rusty: { blade: M.rusty, guard: M.rusty, grip: M.wood },
  dagger_iron: { blade: M.iron, guard: M.iron },
  dagger_curved: { blade: M.silver, guard: M.gold, curve: 2 },
  dagger_venom: { blade: M.green, guard: M.darkwood, glow: M.green },
  dagger_shadow: { blade: M.obsidian, guard: M.obsidian, jag: true, gem: M.purple, glow: M.purple },

  // Äxte: head, haft, double, bearded, spike, glow
  axe: { head: M.iron },
  axe_hatchet: { head: M.rusty, haft: M.ash },
  axe_iron: { head: M.iron },
  axe_double: { head: M.steel, haft: M.darkwood, double: true, spike: true },
  axe_bearded: { head: M.steel, haft: M.wood, bearded: true },
  axe_ember: { head: M.obsidian, haft: M.darkwood, double: true, spike: true, glow: M.ember },
  axe_bone: { head: M.bone, haft: M.darkleather, bearded: true },

  // Kolben: head, haft, kind club|round|flanged|spiked, holy
  mace: { head: M.iron, kind: 'flanged' },
  mace_club: { head: M.wood, kind: 'club' },
  mace_iron: { head: M.iron, kind: 'round' },
  mace_flanged: { head: M.steel, haft: M.darkwood, kind: 'flanged' },
  mace_morningstar: { head: M.iron, haft: M.darkleather, kind: 'spiked' },
  mace_holy: { head: M.gold, haft: M.bronze, kind: 'flanged', glow: M.holy },

  // Stäbe/Zauberstäbe: wood, top curl|crystal|flame|skull|arcane|orb|gem, ramp (Kristall/Glut)
  staff: { wood: M.wood, top: 'orb', ramp: M.purple },
  staff_ash: { wood: M.ash, top: 'curl', ramp: M.ember },
  staff_gnarled: { wood: M.darkwood, top: 'curl', ramp: M.green, gnarled: true },
  staff_crystal: { wood: M.wood, top: 'crystal', ramp: M.blue, bands: M.silver },
  staff_ember: { wood: M.darkwood, top: 'flame', ramp: M.ember, bands: M.gold },
  staff_frost: { wood: M.silver, top: 'crystal', ramp: M.frost },
  staff_bone: { wood: M.bone, top: 'skull', ramp: M.green },
  staff_arcane: { wood: M.darkwood, top: 'arcane', ramp: M.purple, bands: M.gold },
  wand: { wood: M.wood, top: 'flame', ramp: M.ember },
  wand_oak: { wood: M.wood, top: 'orb', ramp: M.green },
  wand_bone: { wood: M.bone, top: 'gem', ramp: M.purple },
  wand_ember: { wood: M.darkwood, top: 'flame', ramp: M.ember },
  wand_crystal: { wood: M.silver, top: 'gem', ramp: M.blue },

  // Bögen: wood, long, recurve, tips, grip, string, glow
  bow: { wood: M.wood },
  bow_short: { wood: M.ash },
  bow_long: { wood: M.wood, long: true },
  bow_recurve: { wood: M.darkwood, recurve: true, tips: M.gold, grip: M.red },
  bow_bone: { wood: M.bone, recurve: true, grip: M.darkleather, string: '#a09888' },
  bow_elven: { wood: M.silver, long: true, recurve: true, tips: M.green, grip: M.green, string: '#e8f0ff', glow: M.green },
};

// --- Rüstung -----------------------------------------------------------------
const CHESTS = {
  robe_novice: { style: 'robe', ramp: M.ash, trim: M.wood },
  robe_mage: { style: 'robe', ramp: M.cloth, trim: M.gold, emblem: M.blue },
  robe_arcane: { style: 'robe', ramp: M.arcaneCloth, trim: M.gold, emblem: M.purple, glow: M.purple },
  leather_jerkin: { style: 'leather', ramp: M.leather },
  leather_hunter: { style: 'leather', ramp: M.moss, fur: M.fur },
  leather_shadow: { style: 'leather', ramp: M.darkleather, shoulder: M.obsidian, emblem: M.purple },
  mail_chain: { style: 'chain', ramp: M.iron, shoulder: M.iron },
  mail_scale: { style: 'scale', ramp: M.bronze, shoulder: M.bronze },
  plate_iron: { style: 'plate', ramp: M.iron, shoulder: M.steel },
  plate_knight: { style: 'plate', ramp: M.steel, shoulder: M.silver, tabard: M.red, trim: M.gold },
  plate_ember: { style: 'plate', ramp: M.obsidian, shoulder: M.obsidian, glow: M.ember, emblem: M.ember, trim: M.ember },
};
const CHEST_BY_FAMILY = { cloth: 'robe', leather: 'leather', mail: 'chain', plate: 'plate' };

const HEADS = {
  helm_cap: { style: 'cap', ramp: M.leather },
  helm_iron: { style: 'nasal', ramp: M.iron },
  helm_horned: { style: 'horned', ramp: M.steel },
  hood: { style: 'hood', ramp: M.darkleather },
};
const HANDS = {
  gloves_cloth: { style: 'cloth', ramp: M.cloth },
  gloves_leather: { style: 'leather', ramp: M.leather },
  gloves_mail: { style: 'mail', ramp: M.iron },
  gloves_plate: { style: 'plate', ramp: M.steel },
  gloves_ember: { style: 'plate', ramp: M.obsidian, glow: M.ember },
};
const FEET = {
  boots_cloth: { style: 'cloth', ramp: M.cloth },
  boots_leather: { style: 'leather', ramp: M.leather },
  boots_iron: { style: 'plate', ramp: M.iron },
  boots_mail: { style: 'mail', ramp: M.iron },
  boots_plate: { style: 'plate', ramp: M.steel },
  boots_shadow: { style: 'leather', ramp: M.darkleather, glow: M.purple },
  boots_ember: { style: 'plate', ramp: M.obsidian, glow: M.ember },
};

const FAMILY_MAT = { plate: 'metal', mail: 'metal', leather: 'cloth', cloth: 'cloth' };

function itemOf(entry, content) {
  const id = typeof entry === 'string' ? entry : entry?.itemId;
  return id ? content.find('item', id) : null;
}

// Element des Waffen-Effekts (Flammen, Frost, Schatten …) aus dem Icon, sonst aus der Leuchtfarbe
const FX_BY_ICON = [
  ['ember', 'fire'], ['cinder', 'fire'], ['royal', 'fire'], ['sun', 'holy'], ['frost', 'frost'], ['obsidian', 'shadow'], ['shadow', 'shadow'],
  ['holy', 'holy'], ['venom', 'poison'], ['elven', 'nature'], ['arcane', 'arcane'], ['rune', 'arcane'], ['bone', 'shadow'],
];
function lookElement(look, def) {
  const icon = `${def.id ?? ''} ${look.icon ?? ''}`;
  for (const [k, el] of FX_BY_ICON) if (icon.includes(k)) return el;
  const g = look.glow ?? look.gem;
  if (g === M.ember || g === M.red) return 'fire';
  if (g === M.frost || g === M.blue) return 'frost';
  if (g === M.green) return 'poison';
  if (g === M.holy) return 'holy';
  return 'arcane';
}

// VERTRAG (für gfx/ItemFx.js u. a.): Element eines Items wie am Helden.
// fxElement(itemDef) -> 'fire'|'frost'|'shadow'|'holy'|'poison'|'nature'|'arcane'
// Gilt für jede Seltenheit (auch gewöhnliche Items bekommen ein Element); ob ein Effekt gezeigt wird, entscheidet der Aufrufer.
export function fxElement(def) {
  if (!def) return 'arcane';
  const R = RARITY_LOOK[def.rarity] ?? RARITY_LOOK.common;
  const base = def.slot === 'weapon' ? WEAPONS[def.icon] : CHESTS[def.icon] ?? HEADS[def.icon] ?? HANDS[def.icon] ?? FEET[def.icon];
  return lookElement({ icon: def.icon, glow: base?.glow ?? base?.ramp ?? R.glow, gem: base?.gem ?? R.gem }, def);
}

function weaponLook(def) {
  // Zweihänder (family 'greatsword') ist fürs Aussehen ein großes Schwert
  const great = def.family === 'greatsword';
  const family = great ? 'sword' : def.family ?? String(def.icon ?? '').split('_')[0];
  const rarity = def.rarity ?? 'common';
  const R = RARITY_LOOK[rarity] ?? RARITY_LOOK.common;
  const base = WEAPONS[def.icon] ?? WEAPONS[family] ?? {};
  const known = !!WEAPONS[def.icon];
  const look = { family, icon: def.icon, rarity, ...base };
  // Unbekanntes Icon: Material nach Seltenheit, damit „lila“ auch lila aussieht.
  if (!known) {
    if (family === 'sword' || family === 'dagger') { look.blade = R.metal; look.guard = rarity === 'legendary' ? M.gold : R.metal; }
    if (family === 'axe' || family === 'mace') look.head = R.metal;
    if (family === 'staff' || family === 'wand' || family === 'bow') look.wood = R.wood;
    if (R.gem && !look.gem) look.gem = R.gem;
    if (R.glow && !look.glow) look.glow = R.glow;
  }
  // Ab episch leuchtet jede Waffe ein wenig, legendäre deutlich.
  if (!look.glow && (rarity === 'epic' || rarity === 'legendary')) look.glow = look.ramp ?? look.gem ?? R.glow;
  look.shine = rarity === 'legendary' ? 2 : rarity === 'epic' ? 1 : 0;
  if (great) Object.assign(look, { great: true, len: Math.max(look.len ?? 15, 19), width: 3, guardW: 3.8, fuller: true });
  // Effektstufe am Helden (entities/Hero.js): 1 = selten (Glanzlicht), 2 = episch (Flammen/Glühen), 3 = legendär (stark)
  look.tier = rarity === 'legendary' ? 3 : rarity === 'epic' ? 2 : rarity === 'rare' ? 1 : 0;
  if (look.tier >= 1 && !look.gem) look.gem = rarity === 'rare' ? M.blue : R.gem;
  if (look.tier >= 1) look.fx = lookElement(look, def);
  return look;
}

function armorLook(table, def, fallbackStyle) {
  const base = table[def.icon];
  const rarity = def.rarity ?? 'common';
  const R = RARITY_LOOK[rarity] ?? RARITY_LOOK.common;
  if (base) return { ...base, rarity };
  const kind = FAMILY_MAT[def.family] ?? 'cloth';
  const style = fallbackStyle(def);
  return { style, ramp: kind === 'metal' ? R.metal : def.family === 'cloth' ? M.cloth : M.leather, glow: R.glow, rarity };
}

export function resolveGear(equipment, content) {
  if (!equipment || !content) return null;
  const get = (slot) => itemOf(equipment[slot] ?? (slot === 'chest' ? equipment.armor : null), content);
  const gear = { weapon: null, chest: null, head: null, hands: null, feet: null };
  const w = get('weapon');
  if (w) gear.weapon = weaponLook(w);
  const c = get('chest');
  if (c) {
    gear.chest = armorLook(CHESTS, c, (d) => CHEST_BY_FAMILY[d.family] ?? 'leather');
    const R = RARITY_LOOK[gear.chest.rarity];
    if (!gear.chest.trim && (gear.chest.rarity === 'rare' || gear.chest.rarity === 'epic' || gear.chest.rarity === 'legendary')) gear.chest.trim = gear.chest.rarity === 'rare' ? M.silver : M.gold;
    if (!gear.chest.glow && R.glow && gear.chest.rarity === 'legendary') gear.chest.glow = R.glow;
    // Schwere Rüstung ab episch: Dornen auf den Schulterstücken
    if ((gear.chest.style === 'plate' || gear.chest.style === 'scale') && (gear.chest.rarity === 'epic' || gear.chest.rarity === 'legendary')) gear.chest.spikes = true;
  }
  const h = get('head');
  if (h) {
    gear.head = armorLook(HEADS, h, (d) => (d.family === 'plate' || d.family === 'mail' ? 'nasal' : d.family === 'cloth' ? 'hood' : 'cap'));
    const hd = gear.head;
    // Plattenhelm = geschlossener Topfhelm; ab selten Helmbusch, legendär mit Glutkrone
    if (hd.style === 'nasal' && h.family === 'plate') hd.style = 'great';
    if (hd.style !== 'hood' && hd.style !== 'cap') {
      const plume = { rare: M.red, epic: M.purple, legendary: M.ember }[hd.rarity];
      if (plume && !hd.crest) hd.crest = plume;
      if (hd.rarity === 'legendary') hd.crown = M.ember;
    }
  }
  const g = get('hands');
  if (g) gear.hands = armorLook(HANDS, g, (d) => d.family ?? 'leather');
  const f = get('feet');
  if (f) gear.feet = armorLook(FEET, f, (d) => d.family ?? 'leather');
  return gear;
}

export function gearKey(gear) {
  if (!gear) return '-';
  const k = (x) => (x ? `${x.icon ?? x.style}:${x.rarity}${x.great ? ':g' : ''}` : '');
  return [k(gear.weapon), gear.chest ? `${gear.chest.style}:${gear.chest.ramp?.[2]}:${gear.chest.rarity}` : '',
    gear.head ? `${gear.head.style}:${gear.head.ramp?.[2]}:${gear.head.rarity}` : '', gear.hands ? gear.hands.ramp?.[2] : '', gear.feet ? gear.feet.ramp?.[2] : ''].join('|');
}
