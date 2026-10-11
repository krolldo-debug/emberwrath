import { SET_LOOKS, ownedSetLooks } from './skinSets.js';

// VERTRAG (Thread A): übersetzt angelegte Ausrüstung in das Aussehen der Spielfigur.
//   resolveGear(equipment, content) -> gear | null
//   gearKey(gear)                   -> kurzer Schlüssel (Sprite-Cache, Änderungserkennung)
// gear = {
//   weapon: { family, icon, rarity, …Materialien } | null,
//   chest:  { style: 'plate'|'chain'|'scale'|'leather'|'robe', ramp, trim?, shoulder?, tabard?, emblem?, glow?, fur?, rarity },
//   head:   { style: 'cap'|'nasal'|'horned'|'great'|'hood', ramp, trim?, crest?, tail?, crown?, crownDim?, coif?, glow?, rarity },
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
  ashsteel: ['#1c1a24', '#3c3848', '#666076', '#aaa4ba', '#f4f0fa'],
  copper: ['#3a1a10', '#6e3420', '#a85a34', '#d88a58', '#f8c49a'],
};
const M = MAT;

// Ausrüstung Stufe 21–40 (Icons <familie>_t5 … _t8): jede Stufe trägt die Farben ihres Gebiets.
// 5 Aschensteppe (Bronze, Kriegsrot), 6 Faulmarsch (Eisen, Knochen, Gift), 7 Frostzinnen (Frost, Silber),
// 8 Glutöde (Obsidian, Gold, Glut). Eine Quelle für Held und Item-Bild (gfx/Icons.js).
export const TIER_LOOK = {
  5: { metal: M.bronze, trim: M.copper, gem: M.red, wood: M.ash, cloth: M.red, leather: M.leather, fur: M.fur, top: 'orb', grip: M.red },
  6: { metal: M.iron, trim: M.bone, gem: M.green, wood: M.darkwood, cloth: M.moss, leather: M.darkleather, fur: M.moss, top: 'skull', grip: M.darkleather, jag: true },
  7: { metal: M.frost, trim: M.silver, gem: M.blue, wood: M.silver, cloth: M.blue, leather: M.fur, fur: M.silver, top: 'crystal', grip: M.blue },
  8: { metal: M.obsidian, trim: M.gold, gem: M.ember, wood: M.darkwood, cloth: M.red, leather: M.darkleather, fur: M.obsidian, top: 'flame', grip: M.darkleather, glow: M.ember },
};
export const LOOK_TIERS = [5, 6, 7, 8];

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
  // Zweihänder ab Stufe 34 (Icon greatsword_t7/t8): eigene Klingenoptik statt Seltenheits-Ersatz
  greatsword_t7: { blade: M.frost, guard: M.silver, grip: M.darkleather, gem: M.blue, glow: M.frost, runes: M.frost },
  greatsword_t8: { blade: M.ashsteel, guard: M.iron, grip: M.darkleather, gem: M.ember, runes: M.ember },
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
// Kopfteile Stufe 21–40 in den Farben ihrer Icons (gfx/Icons.js TIER_LOOK). mail = offene Haube mit Kettenkragen,
// plate = Helm. 5 Steppe (Bronze, Hörner), 6 Moor (Eisen, Knochen), 7 Frost (Stahl, blauer Kamm), 8 Glut (Obsidian, Gold).
const TIER_HEAD = {
  helm_t5: { mail: { style: 'nasal', ramp: M.bronze, trim: M.iron }, plate: { style: 'horned', ramp: M.bronze, trim: M.iron } },
  helm_t6: { mail: { style: 'nasal', ramp: M.iron, trim: M.bone }, plate: { style: 'great', ramp: M.iron, trim: M.bone } },
  helm_t7: { mail: { style: 'nasal', ramp: M.steel, trim: M.silver, crest: M.blue }, plate: { style: 'great', ramp: M.steel, trim: M.silver, crest: M.blue } },
  helm_t8: { mail: { style: 'horned', ramp: M.obsidian, trim: M.gold }, plate: { style: 'great', ramp: M.obsidian, trim: M.gold, glow: M.ember } },
};
function tierHead(tier, def) {
  const base = tier[def.family];
  const rarity = def.rarity ?? 'common';
  // gewöhnlich ohne Zierrand, ab ungewöhnlich mit
  return { ...base, trim: rarity === 'common' ? null : base.trim, rarity };
}
// Benannte Bosshelme mit eigenem Merkmal
const HEAD_NAMED = {
  khar_helm: { crest: M.darkleather, tail: true },                       // Pferdeschweif
  hillking_helm: { crown: M.iron, crownDim: true, crest: null },        // eiserne Krone
  gorm_helm: { style: 'horned', crest: null },
  sovereign_helm: { crown: M.ember, crest: null },
  // Erfolgsbelohnung „Die Sieben Gefallenen“ (Garderobe): heller Königshelm mit weißgoldener Krone
  tide_circlet: { style: 'circlet', ramp: M.silver, gem: M.blue, trim: null, crest: null, crown: null, coif: false },   // Stirnreif statt Kapuze
  fallen_crown: { style: 'crown', ramp: M.gold, crown: M.ember, glow: M.ember, trim: null, crest: null, coif: false },   // offene Goldkrone (sprites/hero.js drawCrownHi)
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

// Stufe 21–40 in den Gebietsfarben (TIER_LOOK). accent = Steinfarbe, die ab „selten“ eingesetzt wird.
for (const n of LOOK_TIERS) {
  const T = TIER_LOOK[n], t = `_t${n}`;
  const blade = { blade: T.metal, guard: T.trim, grip: T.grip, accent: T.gem, fuller: !T.jag, jag: !!T.jag, glow: T.glow };
  WEAPONS[`sword${t}`] = blade;
  WEAPONS[`greatsword${t}`] ??= blade;
  WEAPONS[`dagger${t}`] = { ...blade, curve: n === 5 ? 2 : 0, fuller: false };
  WEAPONS[`axe${t}`] = { head: T.metal, haft: T.wood, double: n >= 7, bearded: n === 5, spike: n >= 6, glow: T.glow };
  WEAPONS[`mace${t}`] = { head: T.metal, haft: T.wood, kind: n === 5 || n === 7 ? 'flanged' : 'spiked' };
  WEAPONS[`staff${t}`] = { wood: T.wood, top: T.top, ramp: n === 6 ? M.green : n === 7 ? M.frost : T.gem, bands: n >= 7 ? T.trim : null, gnarled: n === 6 };
  WEAPONS[`wand${t}`] = { wood: T.wood, top: n === 7 ? 'gem' : n === 6 ? 'orb' : 'flame', ramp: T.gem };
  WEAPONS[`bow${t}`] = { wood: T.wood, recurve: n >= 6, long: n === 7, tips: T.trim, grip: T.gem, string: n === 7 ? '#e8f0ff' : undefined };
  CHESTS[`cloth${t}`] = { style: 'robe', ramp: T.cloth, trim: T.trim, emblem: T.gem, glow: T.glow };
  CHESTS[`leather${t}`] = { style: 'leather', ramp: T.leather, fur: T.fur, emblem: n >= 7 ? T.gem : undefined };
  CHESTS[`mail${t}`] = { style: n === 6 ? 'scale' : 'chain', ramp: T.metal, shoulder: T.trim };
  CHESTS[`plate${t}`] = { style: 'plate', ramp: T.metal, shoulder: T.trim, tabard: n === 5 ? M.red : undefined, emblem: n >= 7 ? T.gem : undefined, glow: T.glow };
  HEADS[`hood${t}`] = { style: 'hood', ramp: n === 7 ? M.fur : T.leather };
  const styleRamp = { cloth: T.cloth, leather: T.leather, mail: T.metal, plate: T.metal };
  for (const st of ['cloth', 'leather', 'mail', 'plate']) {
    HANDS[`gloves_${st}${t}`] = { style: st, ramp: styleRamp[st], glow: st === 'plate' ? T.glow : undefined };
    FEET[`boots_${st}${t}`] = { style: st, ramp: styleRamp[st], glow: st === 'plate' ? T.glow : undefined };
  }
}
// Klassen-Skinsets (character/skinSets.js): Aussehen je Icon, ohne Seltenheits-Zier (das Set bringt seine eigene mit)
const SET_TABLE = { weapon: WEAPONS, chest: CHESTS, head: HEADS, hands: HANDS, feet: FEET };
for (const [icon, { slot, ...look }] of Object.entries(SET_LOOKS)) SET_TABLE[slot][icon] = look;
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

// Benannte Waffen mit eigener Optik (überschreibt das Icon-Aussehen)
const WEAPON_NAMED = {
  // Königsfall: geschwärzter Aschestahl, Goldparier, Glutrunen in der Hohlkehle, glühende Schneide
  kingsbane: { blade: M.ashsteel, guard: M.gold, grip: M.red, gem: M.ember, glow: M.ember, runes: M.ember, edge: M.ember, wings: true },
};

// Stufen-Teile (Icon *_t5 … _t8) teilen sich ein Icon je Familie; die Bauart steht im Namen. Damit „Säbel“ krumm,
// „Langbogen“ lang und „Morgenstern“ stachelig aussieht – am Helden und im Item-Bild gleich.
const CUTS = {
  blade: { width: 2 }, sabre: { curve: 2.6 }, scimitar: { curve: 3.4, width: 2 },
  claymore: { guardW: 5.4, fuller: false },
  hatchet: { double: false, bearded: false, spike: false },
  mace: { kind: 'flanged' }, morningstar: { kind: 'spiked' }, hammer: { kind: 'round' },
  stiletto: { width: 1, curve: 0 }, kris: { flame: true, curve: 0 },
  bow: { long: false }, longbow: { long: true },
  quarterstaff: { top: 'curl' }, lantern: { top: 'flame' },
  rod: (b) => ({ top: b.top === 'orb' ? 'gem' : 'orb' }),
  cap: { style: 'cap' },
};
const TIER_ICON = /_t\d+$/;
function cutOf(def, base = {}) {
  if (!TIER_ICON.test(def.icon ?? '')) return null;
  const id = def.base ?? def.id ?? '';
  const k = /_([a-z]+)$/.exec(id)?.[1], c = CUTS[k];
  return c ? { cut: k, ...(typeof c === 'function' ? c(base) : c) } : null;
}

function weaponLook(def) {
  // Zweihänder (family 'greatsword') ist fürs Aussehen ein großes Schwert
  const great = def.family === 'greatsword';
  const family = great ? 'sword' : def.family ?? String(def.icon ?? '').split('_')[0];
  const rarity = def.rarity ?? 'common';
  const R = RARITY_LOOK[rarity] ?? RARITY_LOOK.common;
  const base = WEAPONS[def.icon] ?? WEAPONS[family] ?? {};
  // Skinset: eigene harte Leuchtebene (sprites/heroSets.js), kein weicher Seltenheits-Schein
  if (base.set) return { family: base.family ?? family, icon: def.icon, rarity, ...base, shine: 0, tier: 0 };
  const known = !!WEAPONS[def.icon] || !!WEAPON_NAMED[def.id];
  const look = { family, icon: def.icon, rarity, ...base, ...cutOf(def, base), ...WEAPON_NAMED[def.id] };
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
  if (great) Object.assign(look, { great: true, len: Math.max(look.len ?? 15, 22), width: 3, guardW: 4.4, fuller: true });
  // Episch und legendär mit eigener Zier (am Helden und im Item-Bild): Runen und breitere Parierstange, Bogen mit
  // geschwungenen Enden, Axt mit Dorn, Kolben mit Stacheln, Stab mit Bändern; legendär zusätzlich Gold und Doppelblatt.
  // Selten: Bögen mit blauen Wurfarmspitzen (der Stein sitzt sonst nur an Klingen sichtbar)
  if (rarity === 'rare' && family === 'bow') look.tips = M.blue;
  if (rarity === 'epic' || rarity === 'legendary') {
    const leg = rarity === 'legendary';
    if (family === 'sword' || family === 'dagger') {
      look.runes ??= look.glow ?? R.glow;
      look.guardW = (look.guardW ?? 2.8) + (leg ? 1.4 : 0.8);
      if (leg) look.guard = M.gold;
    }
    if (family === 'bow') { look.recurve = true; look.tips ??= leg ? M.gold : R.gem; if (leg) look.long = true; }
    if (family === 'axe') { look.spike = true; if (leg) look.double = true; }
    if (family === 'mace' && look.kind !== 'club') look.kind = 'spiked';
    if (family === 'staff') look.bands ??= leg ? M.gold : M.silver;
  }
  // Effektstufe am Helden (entities/Hero.js): 1 = selten (Glanzlicht), 2 = episch (Flammen/Glühen), 3 = legendär (stark)
  look.tier = rarity === 'legendary' ? 3 : rarity === 'epic' ? 2 : rarity === 'rare' ? 1 : 0;
  if (look.tier >= 1 && !look.gem) look.gem = look.accent ?? (rarity === 'rare' ? M.blue : R.gem);
  delete look.accent;
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

// Aussehen eines einzelnen Teils: { slot, look } | null. Gleiche Regeln wie am Helden – die Item-Bilder
// (gfx/Icons.js itemIconId) werden daraus gezeichnet, damit Platz und Figur immer zusammenpassen.
export function itemLook(def) {
  const slot = def?.slot === 'armor' ? 'chest' : def?.slot;
  if (!def || !SLOT_LOOK[slot]) return null;
  return { slot, look: SLOT_LOOK[slot](def) };
}

function chestLook(c) {
  const look = armorLook(CHESTS, c, (d) => CHEST_BY_FAMILY[d.family] ?? 'leather');
  if (look.set) return look;
  const R = RARITY_LOOK[look.rarity] ?? RARITY_LOOK.common;
  if (!look.trim && (look.rarity === 'rare' || look.rarity === 'epic' || look.rarity === 'legendary')) look.trim = look.rarity === 'rare' ? M.silver : M.gold;
  if (!look.glow && R.glow && look.rarity === 'legendary') look.glow = R.glow;
  // Schwere Rüstung ab episch: Dornen auf den Schulterstücken
  if ((look.style === 'plate' || look.style === 'scale') && (look.rarity === 'epic' || look.rarity === 'legendary')) look.spikes = true;
  // Episch: violetter Wappenrock mit Stein; legendär: roter Wappenrock mit Glutstein, goldene Schultern und Kante
  if (look.rarity === 'epic' || look.rarity === 'legendary') {
    const leg = look.rarity === 'legendary';
    look.tabard ??= leg ? M.red : M.arcaneCloth;
    look.emblem ??= leg ? M.ember : M.purple;
    if (leg) { look.shoulder = M.gold; look.trim = M.gold; }
  }
  return look;
}
function headLook(h) {
  if (HEADS[h.icon]?.set) return { ...HEADS[h.icon], rarity: h.rarity ?? 'legendary' };
  const tier = TIER_HEAD[h.icon];
  const hd = tier && (h.family === 'mail' || h.family === 'plate') ? tierHead(tier, h) : armorLook(HEADS, h, (d) => (d.family === 'plate' || d.family === 'mail' ? 'nasal' : d.family === 'cloth' ? 'hood' : 'cap'));
  if (hd.style === 'hood' && cutOf(h)?.style) hd.style = cutOf(h).style;   // „Kappe“ statt Kapuze
  if (hd.style === 'nasal' && h.family === 'plate' && !tier) hd.style = 'great';
  if (hd.style === 'nasal' && h.family === 'mail') hd.coif = true;
  if (hd.style !== 'hood' && hd.style !== 'cap') {
    // Selten: Zierrand; episch: schmaler Kamm in Violett; legendär: Glutkrone. Keine Federbüsche (sahen wie Zipfelmützen aus).
    if (hd.rarity === 'rare' && !hd.trim) hd.trim = M.gold;
    if (hd.rarity === 'epic' && !hd.crest && !hd.crown) hd.crest = M.purple;
    if (hd.rarity === 'legendary') hd.crown = M.ember;
  }
  return Object.assign(hd, HEAD_NAMED[h.id]);
}
// Hände und Füße: ab selten ein Zierband an Stulpe und Knöcheln (Silber, ab episch Gold), ab episch ein Leuchtstein
const LIMB_TRIM = { rare: M.silver, epic: M.gold, legendary: M.gold };
function limbLook(table, def) {
  const look = armorLook(table, def, (d) => d.family ?? 'leather');
  if (look.set) return look;
  look.trim ??= LIMB_TRIM[look.rarity] ?? null;
  if (look.rarity === 'epic' || look.rarity === 'legendary') look.glow ??= RARITY_LOOK[look.rarity].glow;
  return look;
}
const SLOT_LOOK = {
  weapon: weaponLook,
  chest: chestLook,
  head: headLook,
  hands: (g) => limbLook(HANDS, g),
  feet: (f) => limbLook(FEET, f),
};

export function resolveGear(equipment, content) {
  if (!equipment || !content) return null;
  const get = (slot) => itemOf(equipment[slot] ?? (slot === 'chest' ? equipment.armor : null), content);
  const gear = { weapon: null, chest: null, head: null, hands: null, feet: null };
  for (const slot of Object.keys(gear)) {
    const def = get(slot);
    if (def) gear[slot] = SLOT_LOOK[slot](def);
  }
  return gear;
}

// Jede sichtbare Eigenschaft geht in den Schlüssel ein (Farbrampen über ihren Mittelton), damit zwei Teile mit
// gleichem Icon, aber anderer Form oder Zierde nie dasselbe Sprite aus dem Cache bekommen.
const partKey = (x) => (x ? Object.keys(x).sort().map((k) => { const v = x[k]; return v == null || v === false ? '' : Array.isArray(v) ? v[2] : v === true ? k : `${v}`; }).join(':') : '');
export function gearKey(gear) {
  if (!gear) return '-';
  return [partKey(gear.weapon), partKey(gear.chest), partKey(gear.head), partKey(gear.hands), partKey(gear.feet)].join('|');
}

// ---------------------------------------------------------------- Garderobe (character/wardrobe.js)
// Sichtbare Ausrüstung: getragene Teile, überlagert mit dem gewählten Aussehen aus character.wardrobe.
//   shownEquipment(slices, content) -> { weapon, chest, head, hands, feet } (Item-IDs, wie inventory.equipment)
// Ein Aussehen gilt nur, wenn im Platz etwas getragen wird, es freigeschaltet ist und die Klasse es führen darf.
// shown.head === 'none' blendet den Helm aus. Alle Darstellungen (eigener Held, Mehrspieler-Look) nehmen das hier.
export const LOOK_SLOTS = ['weapon', 'chest', 'head', 'hands', 'feet'];
export const HIDE_LOOK = 'none';
const idOf = (e) => (typeof e === 'string' ? e : e?.itemId ?? null);
export function lookAllowed(def, slot, classId) {
  if (!def || !LOOK_SLOTS.includes(slot)) return false;
  const s = def.slot === 'armor' ? 'chest' : def.slot;
  if (s !== slot) return false;
  return !def.classes || !classId || def.classes.includes(classId);
}
// Schlüssel für „sieht gleich aus“ (Garderobe fasst danach zusammen): nur Felder, die der Held wirklich zeichnet.
// Seltenheit und Schimmer zählen nicht (epische/legendäre Zier steht in eigenen Feldern), Steine nur an Klingen,
// Stäbe zeichnen weder Stein noch Leuchten in Pixeln; leere Werte (undefined/null/false) gelten als gleich.
const UNDRAWN = new Set(['rarity', 'tier', 'shine', 'fx', 'cut', 'icon']);
const BLADES = new Set(['sword', 'dagger', 'greatsword']);
export function lookShapeKey(slot, look) {
  if (!look) return 'null';
  const fam = look.family;
  const skip = (f) => UNDRAWN.has(f) || (slot === 'weapon' && ((f === 'gem' && !BLADES.has(fam)) || ((f === 'glow' || f === 'gem') && (fam === 'staff' || fam === 'wand'))));
  const dflt = (f) => look[f] == null || look[f] === false || (f === 'width' && look[f] === 1) || (f === 'top' && fam === 'wand');
  return JSON.stringify(Object.keys(look).sort().filter((f) => !skip(f) && !dflt(f)).map((f) => [f, look[f]]));
}

export function shownEquipment(slices, content) {
  const eq = slices?.inventory?.equipment ?? {};
  const ch = slices?.character ?? {}, w = ch.wardrobe;
  const out = {};
  let sets = null;
  for (const slot of LOOK_SLOTS) {
    const worn = idOf(eq[slot] ?? (slot === 'chest' ? eq.armor : null));
    out[slot] = worn;
    const want = w?.shown?.[slot];
    if (!worn || !want) continue;
    if (want === HIDE_LOOK) { if (slot === 'head') out[slot] = null; continue; }
    // Gesammelt, oder Teil eines gekauften Skinsets (kontoweit über slices.shop, character/skinSets.js)
    if (SET_LOOKS[want] ? !(sets ??= ownedSetLooks(slices)).has(want) : !w.looks?.includes(want)) continue;
    if (lookAllowed(content?.find('item', want), slot, ch.classId)) out[slot] = want;
  }
  return out;
}
