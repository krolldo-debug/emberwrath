// Klassen-Skinsets (Shop, 11.10.): je Klasse ein Set, das nur im Shop erhältlich ist. Reines Aussehen für die Garderobe:
// Die fünf Teile (Waffe, Brust, Kopf, Hände, Füße) lassen sich über die getragene Ausrüstung legen (Transmog), sie haben
// keine Werte und liegen nie in Tasche oder Bank. Freischaltung kontoweit über den Shop-Schlüssel 'look:<setId>'
// (shop/catalog.js DESIGNS, Slice shop.owned).
//   SKIN_SETS            -> [{ id, classId, name, pieces: { slot: itemId } }]
//   SET_ITEMS            -> Item-Definitionen (progression/items.js mischt sie in ITEMS)
//   SET_LOOKS            -> Aussehen je Icon (character/gearLook.js trägt sie in seine Tabellen ein)
//   setOfItem(itemId)    -> Set oder null
//   ownedSetLooks(slices) -> Set der freigeschalteten Set-Teile (Item-IDs)
// Gezeichnet wird in sprites/heroSets.js (Feld set: '<setId>' an jedem Teil).

// Farbrampen (dunkel -> hell). Eigene Rampen je Set, damit jedes Set eine klare Farbe hat:
// Krieger Schwarzstahl/Gold/Glut, Schurke Mitternacht/Mondsilber/Geisterlicht, Waldläufer Wald/Gold/Seelengrün,
// Glutmagier Nachtblau/Gold/Sternenglut.
export const SET_RAMPS = {
  nightsteel: ['#121018', '#262236', '#3c3650', '#605878', '#a89cc8'],
  gold: ['#4a2f10', '#8a5a18', '#c8922a', '#f0c85a', '#fff4c0'],
  ember: ['#3a0e05', '#7a2208', '#c8420c', '#f07a1c', '#ffd890'],
  blood: ['#2a060c', '#5a0c16', '#8c1420', '#b82430', '#e04838'],
  midnight: ['#0e0c18', '#1c1a30', '#2e2a4a', '#48426e', '#7a74a8'],
  veil: ['#0a161c', '#122a34', '#1c4250', '#2a6070', '#4a9aa4'],
  moon: ['#2a3040', '#56607a', '#9aa6c4', '#d6e0f4', '#ffffff'],
  dusk: ['#1a1430', '#2e2658', '#463c80', '#6656a8', '#9888d4'],
  spirit: ['#06262a', '#0c4a50', '#1a8a8a', '#4ad8cc', '#d0fff6'],
  forest: ['#0e1a0e', '#1a2e1a', '#28462a', '#3a623a', '#5a8a50'],
  bark: ['#24140c', '#43261a', '#6a3e26', '#966036', '#c8925a'],
  leaf: ['#0a2a14', '#16582a', '#2ea84a', '#7ef08a', '#e6ffe0'],
  antler: ['#3a2e20', '#6e5a40', '#a8916c', '#d6c49c', '#f4ead0'],
  feather: ['#2a1a10', '#5a3a20', '#8e6236', '#c49a5a', '#f6ecd8'],
  indigo: ['#0a0a24', '#141440', '#20205e', '#30308a', '#4c4cb8'],
  star: ['#3a2a08', '#8a6a18', '#e0b444', '#fff0a8', '#fffbe8'],
};
const C = SET_RAMPS;
// Schneide der Mondsichelklingen (kaltes Licht)
export const MOON_EDGE = '#e9f7ff';
// Glühende Farben: Feinpixel in diesen Farben bilden die harte Leuchtebene der Sets (sprites/heroSets.js) und bleiben
// auch nachts voll hell. Wert = heißere Stufe, in die einzelne Pixel beim Flackern springen (keine Halbtransparenz).
export const SET_GLOW = new Map([
  [C.ember[3], C.ember[4]], [C.ember[4], '#fff6d8'],
  [C.spirit[3], C.spirit[4]], [C.spirit[4], '#f4fffc'],
  [C.leaf[3], C.leaf[4]], [C.leaf[4], '#f6fff0'],
  [C.star[3], C.star[4]], [C.star[4], '#ffffff'],
  [MOON_EDGE, '#ffffff'],
]);

export const SKIN_SETS = [
  { id: 'set_glutthron', classId: 'warrior', name: 'Wehr des Glutthrons',
    desc: 'Schwarzstahl, in der Glut des Aschethrons gehärtet. Goldene Hörner, ein brennender Mantel und eine Klinge mit flüssigem Kern.' },
  { id: 'set_mondsichel', classId: 'rogue', name: 'Schleier der Mondsichel',
    desc: 'Mitternachtsleder mit mondsilbernen Sicheln. Unter der Kapuze leuchten Geisteraugen, die Klingen schneiden wie kaltes Licht.' },
  { id: 'set_hirschkoenig', classId: 'ranger', name: 'Mantel des Hirschkönigs',
    desc: 'Eine Geweihkrone aus altem Elfenbein, ein Waldmantel und ein Bogen aus lebendem Holz, an dem Seelenblätter glimmen.' },
  { id: 'set_sternenfeuer', classId: 'mage', name: 'Gewand des Sternenfeuers',
    desc: 'Eine Robe aus Nachthimmel, in der Sterne funkeln. Ein Sternenhut, Glutrunen kreisen um den Träger, der Stab hält einen gefangenen Stern.' },
];

// Aussehen je Teil (Icon-ID = Item-ID). Felder wie in character/gearLook.js, dazu set = Set-ID (sprites/heroSets.js).
export const SET_LOOKS = {
  // --- Krieger: Wehr des Glutthrons --------------------------------------------------------------------------
  set_glutthron_weapon: { slot: 'weapon', family: 'sword', blade: C.nightsteel, guard: C.gold, grip: C.blood, gem: C.ember,
    width: 3, len: 17, set: 'glutthron' },
  set_glutthron_chest: { slot: 'chest', style: 'plate', ramp: C.nightsteel, shoulder: C.nightsteel, trim: C.gold, tabard: C.blood,
    emblem: C.ember, glow: C.ember, cape: C.blood, set: 'glutthron' },
  set_glutthron_head: { slot: 'head', style: 'great', ramp: C.nightsteel, trim: C.gold, glow: C.ember, set: 'glutthron' },
  set_glutthron_hands: { slot: 'hands', style: 'plate', ramp: C.nightsteel, trim: C.gold, glow: C.ember, set: 'glutthron' },
  set_glutthron_feet: { slot: 'feet', style: 'plate', ramp: C.nightsteel, trim: C.gold, set: 'glutthron' },
  // --- Schurke: Schleier der Mondsichel -------------------------------------------------------------------------
  set_mondsichel_weapon: { slot: 'weapon', family: 'dagger', blade: C.moon, guard: C.moon, grip: C.midnight, gem: C.spirit,
    len: 9, set: 'mondsichel' },
  set_mondsichel_chest: { slot: 'chest', style: 'leather', ramp: C.midnight, shoulder: C.midnight, trim: C.moon, emblem: C.spirit,
    cape: C.veil, set: 'mondsichel' },
  set_mondsichel_head: { slot: 'head', style: 'hood', ramp: C.dusk, trim: C.moon, glow: C.spirit, set: 'mondsichel' },
  set_mondsichel_hands: { slot: 'hands', style: 'leather', ramp: C.midnight, trim: C.moon, glow: C.spirit, set: 'mondsichel' },
  set_mondsichel_feet: { slot: 'feet', style: 'leather', ramp: C.midnight, trim: C.moon, set: 'mondsichel' },
  // --- Waldläufer: Mantel des Hirschkönigs ----------------------------------------------------------------------
  set_hirschkoenig_weapon: { slot: 'weapon', family: 'bow', wood: C.bark, long: true, recurve: true, tips: C.leaf, grip: C.forest,
    string: C.bark[3], set: 'hirschkoenig' },
  set_hirschkoenig_chest: { slot: 'chest', style: 'leather', ramp: C.bark, shoulder: C.feather, trim: C.gold, emblem: C.leaf,
    cape: C.forest, set: 'hirschkoenig' },
  set_hirschkoenig_head: { slot: 'head', style: 'antlers', ramp: C.forest, trim: C.gold, glow: C.leaf, set: 'hirschkoenig' },
  set_hirschkoenig_hands: { slot: 'hands', style: 'leather', ramp: C.bark, trim: C.gold, set: 'hirschkoenig' },
  set_hirschkoenig_feet: { slot: 'feet', style: 'leather', ramp: C.bark, trim: C.gold, set: 'hirschkoenig' },
  // --- Glutmagier: Gewand des Sternenfeuers ----------------------------------------------------------------------
  set_sternenfeuer_weapon: { slot: 'weapon', family: 'staff', wood: C.indigo, top: 'star', ramp: C.star, bands: C.gold, glow: C.star,
    set: 'sternenfeuer' },
  set_sternenfeuer_chest: { slot: 'chest', style: 'robe', ramp: C.indigo, trim: C.gold, emblem: C.ember, glow: C.star,
    cape: C.indigo, back: 'cape', set: 'sternenfeuer' },
  set_sternenfeuer_head: { slot: 'head', style: 'hat', ramp: C.indigo, trim: C.gold, gem: C.star, set: 'sternenfeuer' },
  set_sternenfeuer_hands: { slot: 'hands', style: 'cloth', ramp: C.indigo, trim: C.gold, glow: C.star, set: 'sternenfeuer' },
  set_sternenfeuer_feet: { slot: 'feet', style: 'cloth', ramp: C.indigo, trim: C.gold, set: 'sternenfeuer' },
};

const SLOT_NAMES = {
  set_glutthron: { weapon: 'Glutthronklinge', chest: 'Brustpanzer des Glutthrons', head: 'Gehörnter Helm des Glutthrons', hands: 'Panzerhandschuhe des Glutthrons', feet: 'Stahlschuhe des Glutthrons' },
  set_mondsichel: { weapon: 'Mondsichelklingen', chest: 'Wams der Mondsichel', head: 'Kapuze der Mondsichel', hands: 'Handwickel der Mondsichel', feet: 'Schleicher der Mondsichel' },
  set_hirschkoenig: { weapon: 'Bogen des Hirschkönigs', chest: 'Federwams des Hirschkönigs', head: 'Geweihkapuze des Hirschkönigs', hands: 'Armschienen des Hirschkönigs', feet: 'Stiefel des Hirschkönigs' },
  set_sternenfeuer: { weapon: 'Stab des gefangenen Sterns', chest: 'Robe des Sternenfeuers', head: 'Sternenhut des Sternenfeuers', hands: 'Handschuhe des Sternenfeuers', feet: 'Schuhe des Sternenfeuers' },
};
const FAMILY = { warrior: 'plate', rogue: 'leather', ranger: 'leather', mage: 'cloth' };
export const SET_SLOTS = ['weapon', 'chest', 'head', 'hands', 'feet'];

// Item-Definitionen: lookOnly, keine Werte, nur für die Klasse des Sets.
export const SET_ITEMS = {};
for (const s of SKIN_SETS) {
  s.pieces = {};
  for (const slot of SET_SLOTS) {
    const id = `${s.id}_${slot}`;
    const look = SET_LOOKS[id];
    s.pieces[slot] = id;
    SET_ITEMS[id] = {
      name: SLOT_NAMES[s.id][slot], type: slot === 'weapon' ? 'weapon' : 'armor', slot, icon: id,
      family: slot === 'weapon' ? look.family : FAMILY[s.classId], classes: [s.classId], rarity: 'legendary',
      desc: s.desc, skinSet: s.id, source: 'shop', lookOnly: true, ilvl: 1, reqLevel: 1, tier: 1, value: 0, stats: {},
    };
  }
}

const SET_BY_ID = new Map(SKIN_SETS.map((s) => [s.id, s]));
export const findSkinSet = (id) => SET_BY_ID.get(id) ?? null;
export const setOfItem = (itemId) => (SET_ITEMS[itemId] ? SET_BY_ID.get(SET_ITEMS[itemId].skinSet) ?? null : null);
export const setForClass = (classId) => SKIN_SETS.find((s) => s.classId === classId) ?? null;
// Shop-Schlüssel des Sets (shop/catalog.js DESIGNS.items, Slice shop.owned)
export const setShopKey = (setId) => `look:${setId}`;

// Freigeschaltete Set-Teile des Kontos (aus dem Shop-Slice). Kontoweit: gilt für jeden Charakter der passenden Klasse.
export function ownedSetLooks(slices) {
  const out = new Set();
  for (const k of slices?.shop?.owned ?? []) {
    if (!k.startsWith('look:')) continue;
    const s = SET_BY_ID.get(k.slice(5));
    if (s) for (const id of Object.values(s.pieces)) out.add(id);
  }
  return out;
}
