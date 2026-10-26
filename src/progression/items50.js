// Gegenstände für Stufe 41–50 (Sternenglut Teil 1). Reine Daten wie items40.js; items.js baut daraus die Items.
//
// Tier 9: 41–45 (Treibende Gärten, Rankengruft), 10: 46–50 (Splitterweiten, Gläserne Hallen, Sternwarte).
// Grundausrüstung erzeugt gear() aus items40.js (TIER_STYLES 9 und 10); epische Teile, Dungeon-Sets, benannte
// Bosswaffen und der legendäre Pool von Königin Ysmeine sind von Hand geschrieben.
// Icons: <visual>_t9 / _t10 (gfx/Icons.js ICON_TIERS, Farben character/gearLook.js TIER_LOOK).
import { gear, MOUNT_ITEM } from './items40.js';

const E = (id, name, ilvl, rarity, icon, desc = '', extra = {}) => ({ id, name, ilvl, rarity, icon, desc, ...extra });

// ---------------------------------------------------------------- episch (Zufallsbeute von Eliten/Bossen)
const EPIC_WEAPONS = {
  sword: [E('moonpetal_blade', 'Mondblütenklinge', 43, 'epic', 'sword_t9', 'In ihrer Schneide schläft ein Blütenblatt, das nur bei Mondlicht aufgeht.')],
  greatsword: [E('anchorbreaker', 'Ankerbrecher', 49, 'epic', 'greatsword_t10', 'Geschmiedet, um die Ketten zu sprengen, mit denen die Inseln an der Leere hängen.')],
  mace: [E('rootmaul', 'Wurzelhammer', 44, 'epic', 'mace_t9', 'Ein Knoten aus versteinerter Wurzel. Er wächst langsam weiter.')],
  dagger: [E('glasswhisper', 'Glasflüstern', 47, 'epic', 'dagger_t10', 'So dünn geschliffen, dass man durch die Klinge die Sterne sieht.')],
  bow: [E('mothwing_bow', 'Falterschwinge', 42, 'epic', 'bow_t9', 'Die Sehne ist aus dem Faden eines Sternfalters gesponnen.')],
  staff: [E('prism_staff', 'Prismenstab', 48, 'epic', 'staff_t10', 'Er bricht jeden Zauber in sieben Farben, bevor er ihn loslässt.')],
};
const EPIC_ARMOR = {
  chest: [
    E('lichtmoss_mantle', 'Lichtmoosmantel', 43, 'epic', 'leather_t9', 'Das Moos auf den Schultern leuchtet, wenn die Leere nah ist.', { family: 'leather' }),
    E('starsteel_bulwark', 'Sternenstahlbollwerk', 48, 'epic', 'plate_t10', 'Nachtblau und schwer. Die Goldkanten erzählen von König Aurels Schmieden.', { family: 'plate' }),
  ],
  head: [E('seers_veil', 'Schleier der Seherin', 47, 'epic', 'hood_t10', 'Wer ihn trägt, sieht für einen Atemzug, wohin der Himmel treibt.', { family: 'cloth' })],
  feet: [E('bridgewalker_boots', 'Brückengänger', 45, 'epic', 'boots_leather_t9', 'Auf den Lichtbrücken rutscht man mit ihnen nie aus.', { family: 'leather', stats: { moveSpeed: 0.05 } })],
};
const EPIC_JEWELRY = {
  ring: [E('anchorstone_ring', 'Ring aus Ankerstein', 46, 'epic', 'ring_t10', 'Ein Splitter vom Ankerstein in Sternhafen. Er zieht sanft nach unten.', { attrs: ['str', 'agi', 'vit'], stats: { critChance: 0.02 } })],
  amulet: [E('moonpond_tear', 'Träne des Mondweihers', 44, 'epic', 'amulet_t9', 'Ein Tropfen aus dem Mondweiher, der nicht trocknen will.', { attrs: ['vit', 'int', 'agi'] })],
};

// ---------------------------------------------------------------- Dungeon-Sets (sets.js) und benannte Bosswaffen
const SET_ARMOR = {
  chest: [
    E('gardener_jerkin', 'Rindenwams des Alten Gärtners', 44, 'rare', 'leather_t9', 'Ysgarns Rinde, weich geworden, seit die Leere aus ihr gewichen ist.', { family: 'leather', source: 'boss', set: 'gardener' }),
    E('kaldris_cuirass', 'Splitterharnisch des Kaldris', 48, 'rare', 'plate_t10', 'Jede Platte ist ein Spiegel. Kaldris sah sich gern von allen Seiten.', { family: 'plate', source: 'boss', set: 'splinterlord' }),
    E('ysmeine_gown', 'Sternengewand der Königin', 50, 'epic', 'cloth_t10', 'Ysmeines Kleid. Die Sterne darin stehen anders als am Himmel.', { family: 'cloth', source: 'boss', set: 'nightqueen' }),
  ],
  head: [
    E('gardener_cap', 'Rindenkappe des Alten Gärtners', 44, 'rare', 'hood_t9', '', { family: 'leather', source: 'boss', set: 'gardener' }),
    E('kaldris_helm', 'Splitterkrone des Kaldris', 48, 'rare', 'helm_t10', 'Eine Krone aus Sternsplittern, die er sich selbst aufsetzte.', { family: 'plate', source: 'boss', set: 'splinterlord' }),
    E('ysmeine_circlet', 'Diadem der Schattenkönigin', 50, 'epic', 'hood_t10', '', { family: 'cloth', source: 'boss', set: 'nightqueen' }),
  ],
  hands: [
    E('gardener_grips', 'Rindengriffe des Alten Gärtners', 44, 'rare', 'gloves_leather_t9', '', { family: 'leather', source: 'boss', set: 'gardener' }),
    E('kaldris_gauntlets', 'Splitterfäuste des Kaldris', 48, 'rare', 'gloves_plate_t10', '', { family: 'plate', source: 'boss', set: 'splinterlord' }),
    E('ysmeine_gloves', 'Handschuhe der Schattenkönigin', 50, 'epic', 'gloves_cloth_t10', '', { family: 'cloth', source: 'boss', set: 'nightqueen' }),
  ],
  feet: [
    E('gardener_boots', 'Wurzelstiefel des Alten Gärtners', 44, 'rare', 'boots_leather_t9', '', { family: 'leather', source: 'boss', set: 'gardener', stats: { moveSpeed: 0.02 } }),
    E('kaldris_sabatons', 'Splittersabatons des Kaldris', 48, 'rare', 'boots_plate_t10', '', { family: 'plate', source: 'boss', set: 'splinterlord' }),
    E('ysmeine_slippers', 'Schuhe der Schattenkönigin', 50, 'epic', 'boots_cloth_t10', '', { family: 'cloth', source: 'boss', set: 'nightqueen' }),
  ],
};
const NAMED_WEAPONS = {
  staff: [E('ysgarn_staff', 'Ysgarns Pflanzstab', 44, 'rare', 'staff_t9', 'Mit ihm setzte der Alte Gärtner den ersten Samen der Gärten.', { source: 'boss', stats: { maxResource: 24 } })],
  bow: [E('ysgarn_bough', 'Bogen aus Ysgarns Ast', 44, 'rare', 'bow_t9', 'Ein Ast, der sich nach dem Fall des Gärtners von selbst gebogen hat.', { source: 'boss', stats: { critChance: 0.015 } })],
  greatsword: [E('kaldris_edge', 'Splitterschneide', 48, 'rare', 'greatsword_t10', 'Kaldris’ Klinge. Wer hineinsieht, sieht sich selbst, nur ein wenig eitler.', { source: 'boss', stats: { maxHp: 40 } })],
  dagger: [E('kaldris_shard', 'Kaldris’ letzter Splitter', 48, 'rare', 'dagger_t10', 'Er summt leise mit einer Stimme, die nicht seine ist.', { source: 'boss', stats: { critChance: 0.02 } })],
};

// ---------------------------------------------------------------- legendärer Pool von Königin Ysmeine (ilvl 50)
export const YSMEINE_LEGENDARIES = ['aurels_oath', 'nightglass', 'starpath', 'eye_of_ysmeine', 'starheart'];
const LEGENDARY_WEAPONS = {
  greatsword: [E('aurels_oath', 'Aurels Eid', 50, 'legendary', 'greatsword_t10', 'König Aurels Schwert. Er schwor darauf, die Glut bis an ihren Ursprung zu verfolgen.', { source: 'boss' })],
  dagger: [E('nightglass', 'Nachtglas', 50, 'legendary', 'dagger_t10', 'Aus dem Fenster der Sternwarte geschnitten, durch das Ysmeine zu lange sah.', { source: 'boss' })],
  bow: [E('starpath', 'Sternenpfad', 50, 'legendary', 'bow_t10', 'Seine Pfeile ziehen eine Spur aus Licht, der man nachgehen kann.', { source: 'boss' })],
  staff: [E('eye_of_ysmeine', 'Auge der Königin', 50, 'legendary', 'staff_t10', 'Im Kristall liegt ein Blick, der den Stern Azhuron gesehen hat.', { source: 'boss' })],
};
const LEGENDARY_JEWELRY = {
  amulet: [E('starheart', 'Sternenherz', 50, 'legendary', 'amulet_t10', 'Ein Funke des Ankersteins in Gold gefasst. Er schlägt im Takt der treibenden Inseln.', { source: 'boss', attrs: ['vit', 'str', 'agi', 'int'], stats: { critChance: 0.03 } })],
};

function merge(...tables) {
  const out = {};
  for (const t of tables) for (const [k, list] of Object.entries(t)) (out[k] ??= []).push(...list);
  return out;
}
const TIERS = [9, 10].map(gear);
export const WEAPONS_50 = merge(...TIERS.map((t) => t.weapons), EPIC_WEAPONS, NAMED_WEAPONS, LEGENDARY_WEAPONS);
export const ARMOR_50 = merge(...TIERS.map((t) => t.armor), EPIC_ARMOR, SET_ARMOR);
export const JEWELRY_50 = merge(...TIERS.map((t) => t.jewelry), EPIC_JEWELRY, LEGENDARY_JEWELRY);

// ---------------------------------------------------------------- Verbrauch und Material
export const OTHER_50 = {
  starlight_potion: { name: 'Sternenlichttrank', type: 'consumable', rarity: 'uncommon', ilvl: 41, icon: 'potion_hp_l', use: { heal: 1300 }, stack: 100, value: 60, desc: 'Stellt 1.300 Leben wieder her.' },
  starlight_mana: { name: 'Sternenlicht-Manatrank', type: 'consumable', rarity: 'uncommon', ilvl: 41, icon: 'potion_mana_l', use: { resource: 240 }, stack: 100, value: 52, desc: 'Stellt 240 Ressource wieder her.' },
  // Treibende Gärten
  lichtmoss: { name: 'Lichtmoos', type: 'material', rarity: 'common', icon: 'ore_moss', stack: 50, value: 18, desc: 'Es leuchtet schwach, auch in völliger Dunkelheit.' },
  heartwood_sap: { name: 'Kernholzharz', type: 'material', rarity: 'common', icon: 'gem_amber', stack: 50, value: 20, desc: 'Goldenes Harz aus den Wurzeln über dem Abgrund.' },
  void_bloom: { name: 'Leerenblüte', type: 'material', rarity: 'uncommon', icon: 'essence_shadow', stack: 50, value: 46, desc: 'Eine Blüte, die die Leere verdorben hat. Sie riecht nach kaltem Rauch.' },
  // Splitterweiten
  star_shard: { name: 'Sternsplitter', type: 'material', rarity: 'common', icon: 'gem_starglass', stack: 50, value: 22, desc: 'Ein Splitter aus den Kristallebenen. Er summt leise.' },
  prism_dust: { name: 'Prismenstaub', type: 'material', rarity: 'common', icon: 'dust', stack: 50, value: 22, desc: 'Feiner Staub, der in allen Farben glitzert.' },
  void_glass: { name: 'Leerenglas', type: 'material', rarity: 'uncommon', icon: 'gem_void', stack: 50, value: 52, desc: 'Schwarzes Glas mit einem violetten Kern. Es ist nie ganz still.' },
  // Reittiere (character/mounts.js): zwei beim Stallmeister in Sternhafen, eins selten von Kaldris (loot.js)
  mount_sky_ray: MOUNT_ITEM('sky_ray', 'Muschelpfeife: Himmelsrochen', 'rare', 5000, { source: 'vendor', reqLevel: 40, price: 120000 }),
  mount_moon_lynx: MOUNT_ITEM('moon_lynx', 'Silberglöckchen: Mondluchs', 'rare', 5000, { source: 'vendor', reqLevel: 50, price: 250000 }),
  mount_crystal_ram: MOUNT_ITEM('crystal_ram', 'Kristallhorn: Kristallwidder', 'epic', 12000, { source: 'boss', reqLevel: 40 }),
};
