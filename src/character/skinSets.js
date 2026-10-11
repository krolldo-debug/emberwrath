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
  nightsteel: ['#0c0a12', '#1e1928', '#332c40', '#544a68', '#9c90b8'],
  gold: ['#4a2f10', '#8a5a18', '#c8922a', '#f0c85a', '#fff4c0'],
  ember: ['#3a0e05', '#7a2208', '#c8420c', '#f07a1c', '#ffd890'],
  blood: ['#1e0408', '#40080e', '#6e101a', '#9c1c24', '#cc3a30'],
  midnight: ['#140f24', '#272044', '#3c3166', '#58498e', '#8070c0'],
  moon: ['#2a3040', '#56607a', '#9aa6c4', '#d6e0f4', '#ffffff'],
  dusk: ['#16112a', '#2a2150', '#433676', '#62529e', '#8c7cc8'],
  spirit: ['#06262a', '#0c4a50', '#1a8a8a', '#4ad8cc', '#d0fff6'],
  forest: ['#0a120a', '#152216', '#213622', '#335032', '#4e6e44'],
  bark: ['#1e100a', '#3a2014', '#5c3420', '#86502e', '#b07a48'],
  leaf: ['#0a2a14', '#16582a', '#2ea84a', '#7ef08a', '#e6ffe0'],
  antler: ['#3a2e20', '#6e5a40', '#a8916c', '#d6c49c', '#f4ead0'],
  feather: ['#2a1a10', '#5a3a20', '#8e6236', '#c49a5a', '#f6ecd8'],
  indigo: ['#05051a', '#0c0c2e', '#16164a', '#24246a', '#3a3a94'],
  star: ['#3a2a08', '#8a6a18', '#e0b444', '#fff0a8', '#ffffff'],
};
const C = SET_RAMPS;

export const SKIN_SETS = [
  { id: 'set_glutthron', classId: 'warrior', name: 'Wehr des Glutthrons',
    desc: 'Schwarzstahl, in der Glut des Aschethrons gehärtet. Goldene Hörner, ein brennender Mantel und eine Klinge mit flüssigem Kern.' },
  { id: 'set_mondsichel', classId: 'rogue', name: 'Schleier der Mondsichel',
    desc: 'Mitternachtsleder mit mondsilbernen Sicheln. Unter der Kapuze leuchten Geisteraugen, die Klingen schneiden wie kaltes Licht.' },
  { id: 'set_hirschkoenig', classId: 'ranger', name: 'Mantel des Hirschkönigs',
    desc: 'Ein Geweih aus altem Elfenbein, ein Federkragen und ein Bogen aus lebendem Holz, an dem Seelenblätter glimmen.' },
  { id: 'set_sternenfeuer', classId: 'mage', name: 'Gewand des Sternenfeuers',
    desc: 'Eine Robe aus Nachthimmel, in der Sterne funkeln. Über dem Haupt schwebt ein Reif aus Glutrunen, der Stab trägt einen gefangenen Stern.' },
];

// Aussehen je Teil (Icon-ID = Item-ID). Felder wie in character/gearLook.js, dazu set = Set-ID (sprites/heroSets.js).
export const SET_LOOKS = {
  // --- Krieger: Wehr des Glutthrons --------------------------------------------------------------------------
  set_glutthron_weapon: { slot: 'weapon', family: 'sword', blade: C.nightsteel, guard: C.gold, grip: C.blood, gem: C.ember,
    core: C.ember, width: 2, guardW: 3, len: 17, fuller: true, set: 'glutthron' },
  set_glutthron_chest: { slot: 'chest', style: 'plate', ramp: C.nightsteel, shoulder: C.nightsteel, trim: C.gold, tabard: C.blood,
    emblem: C.ember, glow: C.ember, cape: C.blood, set: 'glutthron' },
  set_glutthron_head: { slot: 'head', style: 'great', ramp: C.nightsteel, trim: C.gold, glow: C.ember, set: 'glutthron' },
  set_glutthron_hands: { slot: 'hands', style: 'plate', ramp: C.nightsteel, trim: C.gold, glow: C.ember, set: 'glutthron' },
  set_glutthron_feet: { slot: 'feet', style: 'plate', ramp: C.nightsteel, trim: C.gold, set: 'glutthron' },
  // --- Schurke: Schleier der Mondsichel -------------------------------------------------------------------------
  set_mondsichel_weapon: { slot: 'weapon', family: 'dagger', blade: C.moon, guard: C.moon, grip: C.midnight, gem: C.spirit, glow: C.spirit,
    curve: 2.6, len: 8, set: 'mondsichel' },
  set_mondsichel_chest: { slot: 'chest', style: 'leather', ramp: C.midnight, shoulder: C.midnight, trim: C.moon, emblem: C.spirit,
    cape: C.dusk, set: 'mondsichel' },
  set_mondsichel_head: { slot: 'head', style: 'hood', ramp: C.dusk, trim: C.moon, glow: C.spirit, set: 'mondsichel' },
  set_mondsichel_hands: { slot: 'hands', style: 'leather', ramp: C.midnight, trim: C.moon, glow: C.spirit, set: 'mondsichel' },
  set_mondsichel_feet: { slot: 'feet', style: 'leather', ramp: C.midnight, trim: C.moon, set: 'mondsichel' },
  // --- Waldläufer: Mantel des Hirschkönigs ----------------------------------------------------------------------
  set_hirschkoenig_weapon: { slot: 'weapon', family: 'bow', wood: C.antler, long: true, recurve: true, tips: C.leaf, grip: C.forest,
    string: '#c8ffd0', glow: C.leaf, set: 'hirschkoenig' },
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
  set_sternenfeuer_head: { slot: 'head', style: 'halo', ramp: C.gold, gem: C.star, glow: C.ember, set: 'sternenfeuer' },
  set_sternenfeuer_hands: { slot: 'hands', style: 'cloth', ramp: C.indigo, trim: C.gold, glow: C.star, set: 'sternenfeuer' },
  set_sternenfeuer_feet: { slot: 'feet', style: 'cloth', ramp: C.indigo, trim: C.gold, set: 'sternenfeuer' },
};

const SLOT_NAMES = {
  set_glutthron: { weapon: 'Glutthronklinge', chest: 'Brustpanzer des Glutthrons', head: 'Gehörnter Helm des Glutthrons', hands: 'Panzerhandschuhe des Glutthrons', feet: 'Stahlschuhe des Glutthrons' },
  set_mondsichel: { weapon: 'Mondsichelklingen', chest: 'Wams der Mondsichel', head: 'Kapuze der Mondsichel', hands: 'Handwickel der Mondsichel', feet: 'Schleicher der Mondsichel' },
  set_hirschkoenig: { weapon: 'Bogen des Hirschkönigs', chest: 'Federwams des Hirschkönigs', head: 'Geweihkapuze des Hirschkönigs', hands: 'Armschienen des Hirschkönigs', feet: 'Stiefel des Hirschkönigs' },
  set_sternenfeuer: { weapon: 'Stab des gefangenen Sterns', chest: 'Robe des Sternenfeuers', head: 'Runenreif des Sternenfeuers', hands: 'Handschuhe des Sternenfeuers', feet: 'Schuhe des Sternenfeuers' },
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
