// Item-Datenbank (Thread C). Registriert als content 'item'.
//
// Ausrüstung wird aus kompakten Einträgen erzeugt: Name, Gegenstandsstufe (ilvl),
// Seltenheit, Symbol und ein Profil. Die Werte berechnet makeStats() aus ilvl und
// Seltenheit – so bleiben alle 90+ Items über die Stufen 1–20 stimmig, und neue
// Items brauchen nur eine Zeile.
//
// Item-Form (nach dem Erzeugen):
//   { name, type, slot?, family?, rarity, ilvl, reqLevel, tier, icon, stats?, value, stack?,
//     classes?, use?, desc, source? }
//  type    weapon | armor | jewelry | consumable | material | quest
//  slot    weapon | head | chest | hands | feet | ring | amulet
//  classes Klassen-IDs, die die Waffe führen können (fehlt = alle)
//  icon    Symbol-ID aus gfx/Icons.js (Thread D); unbekannte Varianten fallen auf die Familie zurück
//  source  'boss' | 'quest' | 'vendor' | 'trial' | 'rare' – nur von dort erhältlich (nicht in Zufallsbeute)
//  price   fester Kaufpreis (Reittiere bei Orla), sonst value × BUY_FACTOR
// Stufe 21–40: items40.js (Tier 5–8, Sets, Reittier-Gegenstände).
import { WEAPONS_40, ARMOR_40, JEWELRY_40, OTHER_40 } from './items40.js';
import { CLASSES } from '../character/classes.js';

export const RARITIES = {
  common: { name: 'Gewöhnlich', color: '#d8d0c0', order: 0, mult: 1.0, attrs: 0 },
  uncommon: { name: 'Ungewöhnlich', color: '#6ee06a', order: 1, mult: 1.2, attrs: 1 },
  rare: { name: 'Selten', color: '#5aa8ff', order: 2, mult: 1.45, attrs: 2 },
  epic: { name: 'Episch', color: '#c07aff', order: 3, mult: 1.75, attrs: 3 },
  legendary: { name: 'Legendär', color: '#ff9a2a', order: 4, mult: 2.15, attrs: 3 },
};
export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export const ITEM_TYPES = {
  weapon: { name: 'Waffe' },
  armor: { name: 'Rüstung' },
  jewelry: { name: 'Schmuck' },
  consumable: { name: 'Verbrauchsgut' },
  material: { name: 'Material' },
  quest: { name: 'Questgegenstand' },
  mount: { name: 'Reittier' },
};

export const EQUIP_SLOTS = ['weapon', 'head', 'chest', 'hands', 'feet', 'ring', 'amulet'];
export const EQUIP_SLOT_NAMES = { weapon: 'Waffe', head: 'Kopf', chest: 'Brust', hands: 'Hände', feet: 'Füße', ring: 'Ring', amulet: 'Amulett' };

export const FAMILY_NAMES = {
  sword: 'Schwert', greatsword: 'Zweihänder', axe: 'Axt', mace: 'Streitkolben', dagger: 'Dolch', bow: 'Bogen', staff: 'Stab', wand: 'Zauberstab',
  cloth: 'Stoff', leather: 'Leder', mail: 'Kette', plate: 'Platte',
};
// Welche Klassen welche Waffenfamilie führen (Klassen-IDs von Thread A).
export const WEAPON_CLASSES = {
  sword: ['warrior', 'rogue'], greatsword: ['warrior'], axe: ['warrior'], mace: ['warrior'],
  dagger: ['rogue', 'ranger'], bow: ['ranger'], staff: ['mage'], wand: ['mage'],
};

export const STAT_NAMES = {
  power: 'Kraft', armor: 'Rüstung', maxHp: 'Leben', critChance: 'Kritisch', maxResource: 'Ressource', moveSpeed: 'Tempo',
  str: 'Stärke', agi: 'Geschick', int: 'Intellekt', vit: 'Ausdauer',
};
export const STAT_ORDER = ['power', 'armor', 'maxHp', 'str', 'agi', 'int', 'vit', 'critChance', 'maxResource', 'moveSpeed'];
const PCT = new Set(['critChance', 'moveSpeed']);
export function formatStat(key, v) {
  const sign = v >= 0 ? '+' : '−';
  const a = Math.abs(v);
  if (PCT.has(key)) return `${sign}${Math.round(a * 1000) / 10} % ${STAT_NAMES[key]}`;
  return `${sign}${Math.round(a)} ${STAT_NAMES[key] ?? key}`;
}
export function formatStatDelta(key, d) {
  const sign = d >= 0 ? '+' : '−', a = Math.abs(d);
  return PCT.has(key) ? `${sign}${Math.round(a * 1000) / 10} %` : `${sign}${Math.round(a)}`;
}

export const BUY_FACTOR = 4;

// ------------------------------------------------------------------ Werte
// Profile: welche Werte ein Item trägt. attrs = Reihenfolge der Attribute (je Seltenheit mehr).
const WEAPON_PROFILE = {
  sword: { attrs: ['str', 'agi', 'vit'], crit: 0.01 },
  axe: { attrs: ['str', 'vit', 'agi'], powerMult: 1.12 },
  greatsword: { attrs: ['str', 'vit', 'agi'], powerMult: 1.2, hp: 0.3 },
  mace: { attrs: ['str', 'vit', 'int'], hp: 0.5 },
  dagger: { attrs: ['agi', 'str', 'vit'], crit: 0.025, powerMult: 0.9 },
  bow: { attrs: ['agi', 'vit', 'str'], crit: 0.015 },
  staff: { attrs: ['int', 'vit', 'agi'], res: 1, powerMult: 1.05 },
  wand: { attrs: ['int', 'agi', 'vit'], crit: 0.02, powerMult: 0.95 },
};
const ARMOR_MAT = {
  cloth: { mult: 0.5, attrs: ['int', 'vit', 'agi'], res: 0.5 },
  leather: { mult: 0.8, attrs: ['agi', 'vit', 'str'] },
  mail: { mult: 1.1, attrs: ['str', 'vit', 'agi'], hp: 0.3 },
  plate: { mult: 1.35, attrs: ['str', 'vit', 'int'], hp: 0.5 },
};
const SLOT_WEIGHT = { chest: 1, head: 0.55, hands: 0.4, feet: 0.45 };

function round1(v) { return Math.round(v); }

export function makeStats({ slot, family, ilvl: L, rarity, attrs: attrOverride, extra = {} }) {
  const r = RARITIES[rarity];
  const m = r.mult;
  const st = {};
  const attrVal = Math.max(1, round1((1 + L * 0.45) * m * 0.6));
  let attrs = [];
  if (slot === 'weapon') {
    const p = WEAPON_PROFILE[family];
    st.power = Math.max(1, round1((1.5 + L * 0.75) * m * (p.powerMult ?? 1)));
    if (p.crit && r.order >= 1) st.critChance = Math.round(p.crit * m * 1000) / 1000;
    if (p.hp) st.maxHp = round1((3 + L * 2) * m * p.hp);
    if (p.res) st.maxResource = round1((4 + L * 1.2) * m);
    attrs = p.attrs;
  } else if (SLOT_WEIGHT[slot]) {
    const mat = ARMOR_MAT[family];
    st.armor = Math.max(1, round1((2 + L * 1.1) * SLOT_WEIGHT[slot] * mat.mult * m));
    if (mat.hp && slot === 'chest') st.maxHp = round1((4 + L * 2.4) * m * mat.hp);
    if (mat.res && slot === 'chest') st.maxResource = round1((3 + L) * m * mat.res);
    attrs = mat.attrs;
  } else if (slot === 'ring') {
    st.power = Math.max(1, round1((0.5 + L * 0.3) * m));
    attrs = ['vit', 'str', 'agi'];
  } else if (slot === 'amulet') {
    st.maxHp = round1((3 + L * 2.2) * m);
    attrs = ['vit', 'int', 'str'];
  }
  const list = attrOverride ?? attrs;
  for (let i = 0; i < Math.min(r.attrs, list.length); i++) {
    const k = list[i];
    st[k] = (st[k] ?? 0) + (i === 0 ? attrVal : Math.max(1, round1(attrVal * 0.6)));
  }
  for (const [k, v] of Object.entries(extra)) st[k] = (st[k] ?? 0) + v;
  return st;
}

// Tier nach INTEGRATION.md §11.5/§12.7: 1 = Stufe 1–5, 2 = 6–11, 3 = 12–16, 4 = 17–20, danach je 5 Stufen eins mehr
export function tierOf(ilvl) { return ilvl <= 5 ? 1 : ilvl <= 11 ? 2 : ilvl <= 16 ? 3 : ilvl <= 20 ? 4 : 4 + Math.ceil((ilvl - 20) / 5); }
export function itemValue(ilvl, rarity) { const m = RARITIES[rarity].mult; return Math.max(1, Math.round((2 + ilvl * 1.8) * m * m)); }

// ------------------------------------------------------------------ Ausrüstung
// [id, name, ilvl, rarity, icon, desc?, extra?]  – extra: { attrs, stats, source }
const E = (id, name, ilvl, rarity, icon, desc = '', extra = {}) => ({ id, name, ilvl, rarity, icon, desc, ...extra });

const WEAPONS = {
  sword: [
    E('notched_blade', 'Schartige Klinge', 1, 'common', 'sword_rusty', 'Hat schon bessere Tage gesehen. Schneidet trotzdem.'),
    E('iron_sword', 'Eisenschwert', 3, 'uncommon', 'sword_iron'),
    E('militia_sword', 'Milizschwert', 4, 'common', 'sword_iron'),
    E('soldier_sword', 'Soldatenschwert', 5, 'common', 'sword_iron'),
    E('ashguard_sabre', 'Säbel der Aschewacht', 6, 'rare', 'sword_sabre', 'Getragen von den Wachen, die einst das Tor der Senke hielten.'),
    E('steel_blade', 'Stahlklinge', 8, 'uncommon', 'sword_steel'),
    E('bandit_sabre', 'Banditensäbel', 9, 'common', 'sword_sabre'),
    E('tidebound_sword', 'Gezeitenschwert', 11, 'rare', 'sword_rune', 'Salzkristalle wachsen auf der Klinge und fallen nie ab.'),
    E('borderwatch_broadsword', 'Breitschwert der Grenzwacht', 10, 'rare', 'sword_broad', 'Breit genug, um einen Pfeil abzufangen.'),
    E('tempered_longsword', 'Gehärtetes Langschwert', 12, 'uncommon', 'sword_long'),
    E('runeblade', 'Runenklinge', 13, 'rare', 'sword_rune', 'Die Runen glühen, wenn Untote in der Nähe sind.'),
    E('ember_blade', 'Glutklinge', 14, 'epic', 'sword_ember', 'Die Schneide glimmt, als hätte sie die Esse nie verlassen.'),
    E('cinder_blade', 'Schlackenklinge', 15, 'uncommon', 'sword_steel'),
    E('bonebreaker_longsword', 'Knochenbrecher', 16, 'rare', 'sword_bone'),
    E('forged_longsword', 'Essengeschmiedetes Langschwert', 18, 'uncommon', 'sword_long'),
    E('frostbite', 'Frostbiss', 17, 'epic', 'sword_frost', 'Wo sie trifft, bleibt Reif auf der Haut.'),
    E('obsidian_edge', 'Obsidianschneide', 19, 'epic', 'sword_obsidian', 'Aus dem schwarzen Glas geschlagen, das der Vulkan unter Emberwrath ausspuckt.'),
    E('crown_of_embers_blade', 'Emberwrath, Klinge der Könige', 20, 'legendary', 'sword_royal', 'Die Klinge, nach der das Land benannt ist. Sie wärmt die Hand ihres Trägers und verbrennt alle anderen.', { source: 'boss' }),
  ],
  greatsword: [
    E('ashen_greatsword', 'Aschenzweihänder', 7, 'uncommon', 'sword_broad'),
    E('borderlord_greatsword', 'Zweihänder des Grenzherrn', 12, 'rare', 'sword_long', 'Zu schwer für einen Arm. Genau richtig für zwei.'),
    E('obsidian_greatsword', 'Obsidianzweihänder', 18, 'epic', 'sword_obsidian', 'Schwarzes Glas, geschliffen zu einer Schneide, die nie stumpf wird.'),
  ],
  axe: [
    E('woodcutter_axe', 'Holzfälleraxt', 1, 'common', 'axe_hatchet', 'Für Holz gemacht. Wölfe sind auch aus Holz, wenn man fest genug zuschlägt.'),
    E('iron_axe', 'Eisenaxt', 4, 'uncommon', 'axe_iron'),
    E('varkhul_cleaver', 'Varkhuls Schlächterbeil', 6, 'rare', 'axe_bone', 'Violettes Feuer kriecht über die Klinge des Knochenfürsten.', { source: 'boss' }),
    E('northman_axe', 'Bärtige Axt', 8, 'rare', 'axe_bearded', 'Der Bart der Klinge hakt sich in Schilde – und in Rippen.'),
    E('double_axe', 'Doppelaxt', 11, 'uncommon', 'axe_double'),
    E('cinder_axe', 'Schlackenaxt', 16, 'uncommon', 'axe_iron'),
    E('forge_axe', 'Essenaxt', 19, 'rare', 'axe_ember'),
    E('bonesplitter', 'Knochenspalter', 13, 'rare', 'axe_bone'),
    E('ashmaw', 'Aschenschlund', 18, 'epic', 'axe_ember', 'Jeder Hieb lässt einen Funkenregen zurück.'),
    E('borka_cleaver', 'Borkas Spalter', 9, 'rare', 'axe_bearded', 'In den Griff sind drei Kerben geschnitten. Eine für jeden Hauptmann.', { source: 'rare', stats: { critChance: 0.02 } }),
  ],
  mace: [
    E('cudgel', 'Knüppel', 2, 'common', 'mace_club'),
    E('iron_mace', 'Eisenkolben', 5, 'uncommon', 'mace_iron'),
    E('bandit_club', 'Beschlagener Knüppel', 8, 'common', 'mace_club'),
    E('gravewarden_mace', 'Streitkolben des Gruftwächters', 9, 'rare', 'mace_flanged', 'Schwer genug, um Knochen zu Staub zu schlagen.'),
    E('morningstar', 'Morgenstern', 12, 'uncommon', 'mace_morningstar'),
    E('cryptwarden_star', 'Gruftstern', 15, 'rare', 'mace_morningstar', 'Die Stacheln sind mit geweihtem Silber überzogen.'),
    E('sunhammer', 'Sonnenhammer', 18, 'epic', 'mace_holy', 'Ein Relikt der alten Sonnenpriester. Untote weichen vor ihm zurück.'),
    E('cinderfist_maul', 'Schlackenfaust', 15, 'rare', 'mace_flanged', "Asch'raks eigene Faust, abgeschlagen und an einen Stiel geschmiedet.", { source: 'rare', stats: { maxHp: 25 } }),
  ],
  dagger: [
    E('rusty_dagger', 'Rostiger Dolch', 1, 'common', 'dagger_rusty'),
    E('wolfsbane_dagger', 'Wolfsbann-Dolch', 3, 'uncommon', 'dagger_iron', 'Schmal und schnell. Die Jäger der Glutsenke schwören darauf.'),
    E('iron_dirk', 'Eisendolch', 6, 'common', 'dagger_iron'),
    E('tidebound_dagger', 'Gezeitendolch', 11, 'uncommon', 'dagger_curved'),
    E('cinder_knife', 'Schlackenmesser', 17, 'rare', 'dagger_venom', 'Heiß genug, um Wunden sofort zu versiegeln – das hilft dem Opfer nur nicht.'),
    E('desert_kris', 'Krummdolch', 8, 'rare', 'dagger_curved', 'Die gewellte Klinge reißt Wunden, die nicht heilen wollen.'),
    E('venomfang', 'Giftzahn', 11, 'rare', 'dagger_venom', 'Aus dem Giftzahn einer Katakombenspinne geschliffen.'),
    E('steel_stiletto', 'Stahlstilett', 14, 'uncommon', 'dagger_iron'),
    E('shadowstrike', 'Schattenstich', 16, 'epic', 'dagger_shadow', 'Man hört ihn nicht. Man spürt ihn nur.'),
    E('ashfang', 'Aschfang', 19, 'epic', 'dagger_curved', 'In der Glutschmiede gehärtet. Die Klinge glüht, wenn Blut fließt.'),
    E('nightwhisper', 'Nachtflüstern', 20, 'legendary', 'dagger_shadow', 'Man sagt, die Klinge flüstere die Namen derer, die sie noch töten wird.', { source: 'boss' }),
  ],
  bow: [
    E('short_bow', 'Kurzbogen', 1, 'common', 'bow_short'),
    E('hunter_bow', 'Jägerbogen', 4, 'uncommon', 'bow_short'),
    E('longbow', 'Langbogen', 7, 'uncommon', 'bow_long'),
    E('recurve_bow', 'Reflexbogen', 9, 'rare', 'bow_recurve', 'Die doppelt geschwungenen Wurfarme schicken Pfeile durch Kettenhemden.'),
    E('yew_longbow', 'Eibenlangbogen', 12, 'common', 'bow_long'),
    E('cinder_bow', 'Schlackenbogen', 15, 'uncommon', 'bow_recurve'),
    E('forge_longbow', 'Essenlangbogen', 19, 'rare', 'bow_long'),
    E('bone_bow', 'Knochenbogen', 13, 'rare', 'bow_bone', 'Die Sehne ist aus Spinnenseide gedreht.'),
    E('moonsong', 'Mondsang', 17, 'epic', 'bow_elven', 'Ein Elfenbogen, dessen Sehne im Mondlicht summt.'),
    E('cinderstorm_bow', 'Schlackensturm', 19, 'epic', 'bow_recurve', 'Pfeile von dieser Sehne ziehen eine Spur aus Funken.'),
    E('starfall', 'Sternenfall', 20, 'legendary', 'bow_elven', 'Jeder Pfeil zieht einen Schweif aus Licht hinter sich her.', { source: 'boss' }),
  ],
  staff: [
    E('ashwood_staff', 'Eschenholzstab', 1, 'common', 'staff_ash', 'Leicht, biegsam, riecht nach Asche.'),
    E('gnarled_staff', 'Knorriger Stab', 4, 'uncommon', 'staff_gnarled'),
    E('crystal_staff', 'Kristallstab', 7, 'rare', 'staff_crystal', 'Der Kristall bündelt Mana wie eine Linse das Licht.'),
    E('adept_staff', 'Stab des Adepten', 10, 'uncommon', 'staff_gnarled'),
    E('tide_staff', 'Gezeitenstab', 11, 'rare', 'staff_crystal', 'Man hört in ihm das Meer, weit weg vom Meer.'),
    E('cinder_staff', 'Schlackenstab', 14, 'uncommon', 'staff_ember'),
    E('bone_staff', 'Knochenstab', 12, 'rare', 'staff_bone', 'Ein Nekromant hat ihn geschnitzt. Er summt noch.'),
    E('frostspire_staff', 'Frostspitze', 15, 'rare', 'staff_frost', 'Eiskalt, selbst in der Hitze der Schlackenhöhen.'),
    E('ember_staff', 'Glutstab', 15, 'epic', 'staff_ember', 'Die Spitze brennt, ohne je zu verlöschen.'),
    E('frost_staff', 'Stab des Winters', 18, 'epic', 'staff_frost', 'Die Luft um ihn herum friert zu kleinen Sternen.'),
    E('worldstaff', 'Arkaner Weltenstab', 20, 'legendary', 'staff_arcane', 'In seinem Kern kreisen winzige Welten.', { source: 'boss' }),
  ],
  wand: [
    E('oak_wand', 'Eichenzauberstab', 2, 'common', 'wand_oak'),
    E('tide_wand', 'Gezeitenzauberstab', 9, 'common', 'wand_crystal'),
    E('cinder_wand', 'Schlackenzauberstab', 14, 'uncommon', 'wand_ember'),
    E('forge_wand', 'Essenzauberstab', 19, 'rare', 'wand_ember'),
    E('bone_wand', 'Knochenzauberstab', 6, 'uncommon', 'wand_bone'),
    E('crystal_wand', 'Kristallzauberstab', 11, 'rare', 'wand_crystal', 'Scharf geschliffen, bricht er das Licht in sieben Farben.'),
    E('ember_wand', 'Glutzauberstab', 16, 'epic', 'wand_ember', 'Funken tropfen von seiner Spitze wie Wasser.'),
    E('scribe_quill', 'Feder des Knochenschreibers', 5, 'rare', 'wand_bone', 'Sie schreibt von selbst weiter, wenn man sie loslässt.', { source: 'rare', stats: { maxResource: 10 } }),
  ],
};

const ARMOR = {
  chest: [
    E('novice_robe', 'Novizenrobe', 1, 'common', 'robe_novice', '', { family: 'cloth' }),
    E('padded_vest', 'Gepolsterte Weste', 1, 'common', 'leather_jerkin', 'Besser als nichts. Knapp.', { family: 'leather' }),
    E('recruit_mail', 'Rekrutenkettenhemd', 1, 'common', 'mail_chain', 'Ausgegeben an jeden, der eine Waffe halten kann.', { family: 'mail' }),
    E('leather_jerkin', 'Wolfslederwams', 3, 'uncommon', 'leather_jerkin', 'Aus den Fellen der Aschewölfe genäht.', { family: 'leather' }),
    E('chain_shirt', 'Kettenhemd', 4, 'common', 'mail_chain', '', { family: 'mail' }),
    E('mage_robe', 'Magierrobe', 6, 'uncommon', 'robe_mage', '', { family: 'cloth' }),
    E('ashguard_hauberk', 'Halsberge der Aschewacht', 6, 'rare', 'mail_chain', 'Die Ringe sind mit Glutstaub geschwärzt.', { family: 'mail' }),
    E('emberweave_robe', 'Glutgewebte Robe', 7, 'rare', 'robe_arcane', 'Die Fäden glimmen schwach, wenn Magie in der Nähe ist.', { family: 'cloth' }),
    E('nightstalker_vest', 'Weste des Nachtpirschers', 7, 'rare', 'leather_shadow', '', { family: 'leather' }),
    E('bone_mail', 'Knochenpanzer', 6, 'rare', 'mail_scale', 'Geflochten aus den Rippen jener, die zu früh gingen.', { family: 'mail', source: 'boss', set: 'bonelord' }),
    E('scale_armor', 'Schuppenpanzer', 7, 'uncommon', 'mail_scale', '', { family: 'mail' }),
    E('hunter_leather', 'Jägerleder', 8, 'uncommon', 'leather_hunter', '', { family: 'leather' }),
    E('iron_cuirass', 'Eisenharnisch', 10, 'rare', 'plate_iron', 'Schwer, laut und sehr, sehr sicher.', { family: 'plate' }),
    E('circle_robe', 'Robe des Zirkels', 11, 'rare', 'robe_mage', 'In den Saum sind Schutzglyphen gestickt.', { family: 'cloth' }),
    E('shadow_leather', 'Schattenleder', 13, 'rare', 'leather_shadow', 'Schluckt Licht und Geräusche gleichermaßen.', { family: 'leather' }),
    E('knight_plate', 'Ritterharnisch', 14, 'rare', 'plate_knight', 'Das Wappen darauf ist längst verblasst.', { family: 'plate' }),
    E('tidebound_robe', 'Gezeitenrobe', 12, 'uncommon', 'robe_mage', '', { family: 'cloth' }),
    E('cinder_leather', 'Schlackenleder', 15, 'uncommon', 'leather_hunter', '', { family: 'leather' }),
    E('cinder_mail', 'Schlackenkettenhemd', 16, 'uncommon', 'mail_scale', '', { family: 'mail' }),
    E('forge_plate', 'Essenplatte', 18, 'rare', 'plate_knight', '', { family: 'plate' }),
    E('forge_robe', 'Essenrobe', 19, 'rare', 'robe_arcane', '', { family: 'cloth' }),
    E('arcane_robe', 'Arkane Robe', 17, 'epic', 'robe_arcane', 'Die Sterne auf dem Stoff bewegen sich, wenn man nicht hinsieht.', { family: 'cloth' }),
    E('nightstalker_coat', 'Mantel der Nachtpirscher', 18, 'epic', 'leather_shadow', 'Getragen von jenen, die nie gesehen werden wollten.', { family: 'leather' }),
    E('cryptlord_plate', 'Plattenharnisch des Gruftfürsten', 19, 'epic', 'plate_ember', 'Kalt wie ein Grab und fast ebenso unzerbrechlich.', { family: 'plate' }),
    E('tyrant_plate', 'Harnisch des Tyrannen', 20, 'legendary', 'plate_ember', 'Ignaroths eigene Rüstung. Die Glut darin ist noch nicht erloschen.', { family: 'plate', source: 'boss', set: 'tyrant' }),
    E('emberwarden_mail', 'Brustpanzer des Glutwächters', 20, 'epic', 'plate_ember', 'Verliehen jenen, die die Glutprüfungen überstehen.', { family: 'plate', source: 'trial', set: 'emberwarden' }),
    E('emberwing_scale', 'Schuppenhemd der Glutschwinge', 19, 'rare', 'mail_scale', 'Aus den Schuppen der Drachenmutter. Sie glühen noch.', { family: 'mail', source: 'rare', stats: { maxHp: 40, armor: 4 } }),
    E('cinder_robe', 'Schlackenrobe', 18, 'uncommon', 'robe_novice', '', { family: 'cloth' }),
    E('last_ember_robe', 'Robe der letzten Glut', 40, 'rare', 'cloth_t8', 'Die Magier der Bastion tragen sie bis zum letzten Funken.', { family: 'cloth' }),
  ],
  head: [
    E('varkhul_helm', 'Krone des Knochenfürsten', 6, 'rare', 'helm_horned', 'Ein Reif aus Knochen, der sich um den Schädel schließt.', { family: 'mail', source: 'boss', set: 'bonelord' }),
    E('tide_circlet', 'Stirnreif der Gezeiten', 12, 'rare', 'hood', 'Salzkristalle glitzern im Stoff.', { family: 'cloth', source: 'boss', set: 'tide' }),
    E('tyrant_helm', 'Helm des Tyrannen', 20, 'epic', 'helm_horned', 'Die Hörner glühen, wenn der Träger zürnt.', { family: 'plate', source: 'boss', set: 'tyrant' }),
    E('emberwarden_helm', 'Helm des Glutwächters', 20, 'epic', 'helm_iron', '', { family: 'plate', source: 'trial', set: 'emberwarden' }),
    E('leather_cap', 'Lederkappe', 2, 'common', 'helm_cap', '', { family: 'leather' }),
    E('wanderer_hood', 'Kapuze des Wanderers', 5, 'uncommon', 'hood', '', { family: 'cloth' }),
    E('iron_helm', 'Eisenhelm', 7, 'uncommon', 'helm_iron', '', { family: 'plate' }),
    E('bandit_hood', 'Banditenkapuze', 9, 'common', 'hood', '', { family: 'leather' }),
    E('cinder_helm', 'Schlackenhelm', 14, 'uncommon', 'helm_iron', '', { family: 'mail' }),
    E('forge_helm', 'Essenhelm', 19, 'rare', 'helm_iron', '', { family: 'plate' }),
    E('horned_helm', 'Gehörnter Helm', 11, 'rare', 'helm_horned', 'Die Hörner stammen von einem Tier, das niemand benennen konnte.', { family: 'mail' }),
    E('warden_helm', 'Helm der Grenzwacht', 10, 'uncommon', 'helm_iron', '', { family: 'mail' }),
    E('tidecaller_hood', 'Kapuze der Gezeitenrufer', 11, 'uncommon', 'hood', 'Riecht nach Salz und altem Weihrauch.', { family: 'cloth' }),
    E('shadow_hood', 'Kapuze der Schatten', 15, 'rare', 'hood', '', { family: 'leather' }),
    E('cryptlord_crown', 'Krone des Gruftfürsten', 18, 'epic', 'helm_horned', 'Eine Krone für einen König, der nicht sterben durfte.', { family: 'plate' }),
    // Ergänzungen Release-Runde: Leder und Stoff für Schurke, Waldläufer und Magier in jeder Stufenlage
    E('leather_cap', 'Lederkappe', 7, 'uncommon', 'helm_cap', '', { family: 'leather' }),
    E('stalker_cap', 'Pirscherkappe', 13, 'uncommon', 'helm_cap', '', { family: 'leather' }),
    E('trackers_hood', 'Kapuze des Spurenlesers', 9, 'rare', 'hood', 'Der Rand ist mit Wolfshaar besetzt.', { family: 'leather' }),
    E('runeweave_hood', 'Runengewebte Kapuze', 9, 'rare', 'hood', 'Silberne Zeichen laufen um den Saum.', { family: 'cloth' }),
    E('ashsilk_cowl', 'Ascheseidenhaube', 15, 'rare', 'hood', '', { family: 'cloth' }),
    E('cinder_cowl', 'Schlackenhaube', 18, 'uncommon', 'hood', '', { family: 'cloth' }),
  ],
  hands: [
    E('varkhul_grips', 'Knochengriffe', 6, 'rare', 'gloves_mail', 'Kalt, egal wie lange man sie trägt.', { family: 'mail', source: 'boss', set: 'bonelord' }),
    E('tide_wraps', 'Gezeitenwickel', 12, 'rare', 'gloves_leather', 'Immer ein wenig feucht.', { family: 'leather', source: 'boss', set: 'tide' }),
    E('tyrant_gauntlets', 'Stulpen des Tyrannen', 20, 'epic', 'gloves_ember', 'Was sie greifen, beginnt zu schmelzen.', { family: 'plate', source: 'boss', set: 'tyrant' }),
    E('emberwarden_gauntlets', 'Stulpen des Glutwächters', 20, 'epic', 'gloves_plate', '', { family: 'plate', source: 'trial', set: 'emberwarden' }),
    E('leather_gloves', 'Lederhandschuhe', 2, 'common', 'gloves_leather', '', { family: 'leather' }),
    E('chain_gloves', 'Kettenhandschuhe', 6, 'uncommon', 'gloves_mail', '', { family: 'mail' }),
    E('bandit_gloves', 'Banditenhandschuhe', 8, 'common', 'gloves_leather', '', { family: 'leather' }),
    E('cinder_gloves', 'Schlackenhandschuhe', 16, 'uncommon', 'gloves_mail', '', { family: 'mail' }),
    E('forge_gauntlets', 'Essenstulpen', 19, 'rare', 'gloves_plate', '', { family: 'plate' }),
    E('borderwatch_gauntlets', 'Stulpen der Grenzwacht', 10, 'rare', 'gloves_plate', '', { family: 'plate' }),
    E('silk_gloves', 'Seidenhandschuhe', 14, 'uncommon', 'gloves_cloth', '', { family: 'cloth' }),
    E('ember_grips', 'Glutgreifer', 17, 'epic', 'gloves_ember', 'Die Finger glühen dunkelrot, wenn sie eine Waffe halten.', { family: 'mail' }),
    E('thornmother_grips', 'Dornenmutters Griff', 10, 'rare', 'gloves_leather', 'Kleine Dornen wachsen nach innen. Man gewöhnt sich daran.', { family: 'leather', source: 'rare', stats: { critChance: 0.015 } }),
    E('leather_gloves', 'Lederhandschuhe', 5, 'uncommon', 'gloves_leather', '', { family: 'leather' }),
    E('suede_grips', 'Wildledergriffe', 7, 'rare', 'gloves_leather', '', { family: 'leather' }),
    E('linen_gloves', 'Leinenhandschuhe', 6, 'uncommon', 'gloves_cloth', '', { family: 'cloth' }),
    E('shadow_grips', 'Schattengriffe', 12, 'uncommon', 'gloves_leather', '', { family: 'leather' }),
    E('stalker_grips', 'Griffe des Pirschers', 15, 'rare', 'gloves_leather', '', { family: 'leather' }),
    E('rune_gloves', 'Runenhandschuhe', 9, 'rare', 'gloves_cloth', '', { family: 'cloth' }),
    E('embersilk_gloves', 'Glutseidenhandschuhe', 16, 'rare', 'gloves_cloth', '', { family: 'cloth' }),
    E('cinder_wraps', 'Schlackenwickel', 18, 'uncommon', 'gloves_cloth', '', { family: 'cloth' }),
  ],
  feet: [
    E('varkhul_greaves', 'Schienen des Knochenfürsten', 6, 'rare', 'boots_mail', '', { family: 'mail', source: 'boss', set: 'bonelord' }),
    E('tyrant_sabatons', 'Sabatons des Tyrannen', 20, 'epic', 'boots_ember', 'Jeder Schritt hinterlässt eine glimmende Spur.', { family: 'plate', source: 'boss', set: 'tyrant' }),
    E('emberwarden_boots', 'Stiefel des Glutwächters', 20, 'epic', 'boots_plate', '', { family: 'plate', source: 'trial', set: 'emberwarden' }),
    E('worn_boots', 'Abgetragene Stiefel', 1, 'common', 'boots_leather', '', { family: 'leather' }),
    E('traveler_boots', 'Wanderstiefel', 5, 'uncommon', 'boots_leather', '', { family: 'leather', stats: { moveSpeed: 0.02 } }),
    E('ironshod_boots', 'Eisenbeschlagene Stiefel', 9, 'rare', 'boots_plate', '', { family: 'plate' }),
    E('bandit_boots', 'Banditenstiefel', 8, 'common', 'boots_leather', '', { family: 'leather' }),
    E('cinder_boots', 'Schlackenstiefel', 15, 'uncommon', 'boots_plate', '', { family: 'mail' }),
    E('forge_greaves', 'Essenschienen', 19, 'rare', 'boots_plate', '', { family: 'plate' }),
    E('ranger_boots', 'Stiefel des Waldläufers', 13, 'uncommon', 'boots_leather', '', { family: 'leather', stats: { moveSpeed: 0.03 } }),
    E('shadowstep_boots', 'Schattenschritt', 16, 'epic', 'boots_leather', 'Wer sie trägt, hinterlässt keine Spuren.', { family: 'leather', stats: { moveSpeed: 0.06 } }),
    E('chain_greaves', 'Kettenschienen', 5, 'uncommon', 'boots_mail', '', { family: 'mail' }),
    E('linen_shoes', 'Leinenschuhe', 5, 'uncommon', 'boots_cloth', '', { family: 'cloth' }),
    E('temple_sandals', 'Tempelsandalen', 11, 'uncommon', 'boots_cloth', 'Das Leder ist vom Salzwasser hell geworden.', { family: 'cloth' }),
    E('silk_slippers', 'Seidenschuhe', 17, 'uncommon', 'boots_cloth', '', { family: 'cloth' }),
    E('hunters_boots', 'Jägerstiefel', 8, 'rare', 'boots_leather', '', { family: 'leather', stats: { moveSpeed: 0.02 } }),
    E('rune_slippers', 'Runenschuhe', 9, 'rare', 'boots_cloth', '', { family: 'cloth' }),
    E('nightstalker_boots', 'Stiefel des Nachtpirschers', 15, 'rare', 'boots_leather', '', { family: 'leather', stats: { moveSpeed: 0.02 } }),
    E('ashsilk_slippers', 'Ascheseidenschuhe', 15, 'rare', 'boots_cloth', '', { family: 'cloth' }),
    E('drifter_sandals', 'Sandalen der Wanderprediger', 21, 'uncommon', 'boots_cloth_t5', 'Sie haben mehr Asche gesehen als jeder Soldat.', { family: 'cloth' }),
  ],
};

const JEWELRY = {
  ring: [
    E('copper_ring', 'Kupferring', 3, 'common', 'ring_copper'),
    E('brom_ring', 'Broms Schmiedering', 4, 'rare', 'ring_gold', 'Brom hat ihn aus Spinnenseide und Glutstahl gefertigt.', { source: 'quest', attrs: ['str', 'vit'] }),
    E('silver_ring', 'Silberring', 6, 'uncommon', 'ring_silver'),
    E('ruby_ring', 'Rubinring', 9, 'rare', 'ring_ruby', '', { attrs: ['str', 'vit'] }),
    E('gold_ring', 'Goldring', 12, 'uncommon', 'ring_gold'),
    E('tide_pearl_ring', 'Perlenring der Gezeiten', 12, 'rare', 'ring_sapphire', 'Nerith trug ihn, bevor die Flut kam.', { source: 'boss', set: 'tide', attrs: ['int', 'vit'] }),
    E('iron_band', 'Eisenreif', 9, 'common', 'ring_copper'),
    E('cinder_band', 'Schlackenreif', 17, 'uncommon', 'ring_silver'),
    E('sapphire_ring', 'Saphirring', 14, 'rare', 'ring_sapphire', '', { attrs: ['int', 'vit'] }),
    E('emerald_ring', 'Smaragdring', 16, 'rare', 'ring_emerald', '', { attrs: ['agi', 'vit'] }),
    E('amethyst_seal', 'Amethystsiegel', 19, 'epic', 'ring_amethyst', 'Das Siegel eines Erzmagiers, der zu viel wusste.', { attrs: ['int', 'agi', 'vit'], stats: { critChance: 0.02 } }),
    E('salt_crown_ring', 'Reif des Salzkönigs', 12, 'rare', 'ring_sapphire', 'Mehr blieb von seiner Krone nicht übrig.', { source: 'rare', attrs: ['int', 'vit'], stats: { maxHp: 20 } }),
    E('hunters_band', 'Reif des Jägers', 7, 'rare', 'ring_silver', '', { attrs: ['agi', 'vit'] }),
    E('moonstone_ring', 'Mondsteinring', 8, 'rare', 'ring_sapphire', '', { attrs: ['int', 'vit'] }),
    E('ironwill_ring', 'Ring des eisernen Willens', 17, 'rare', 'ring_gold', '', { attrs: ['str', 'vit'] }),
    E('fire_opal_ring', 'Feueropalring', 18, 'rare', 'ring_ruby', 'Im Stein tanzt ein Funke, der nie erlischt.', { attrs: ['int', 'vit'] }),
  ],
  amulet: [
    E('bone_amulet', 'Knochenamulett', 2, 'common', 'amulet_bone'),
    E('silver_amulet', 'Silberamulett', 5, 'uncommon', 'amulet_silver'),
    E('ash_charm', 'Aschetalisman', 8, 'uncommon', 'charm_tooth', 'Ein Splitter aus dem Herdfeuer der Glutsenke.', { stats: { critChance: 0.02 } }),
    E('ruby_amulet', 'Rubinamulett', 10, 'rare', 'amulet_ruby', '', { attrs: ['str', 'vit'] }),
    E('feather_charm', 'Federtalisman', 13, 'rare', 'charm_feather', 'Leicht wie der Wind, den er beschwört.', { attrs: ['agi', 'vit'], stats: { moveSpeed: 0.03 } }),
    E('skull_charm', 'Schädeltalisman', 15, 'uncommon', 'charm_skull'),
    E('wolf_tooth_charm', 'Wolfszahnkette', 4, 'uncommon', 'charm_tooth', 'Aus den Zähnen der Aschewölfe gefädelt.', { attrs: ['agi', 'vit'] }),
    E('greymaw_fang', 'Graumauls Reißzahn', 4, 'rare', 'charm_tooth', 'So lang wie ein Finger und noch immer scharf.', { source: 'rare', attrs: ['agi', 'str'] }),
    E('priestess_amulet', 'Amulett der Priesterin', 12, 'epic', 'amulet_silver', 'Wasser perlt darauf, auch wenn es trocken ist.', { source: 'boss', set: 'tide', attrs: ['int', 'vit', 'agi'] }),
    E('forge_pendant', 'Essenanhänger', 19, 'rare', 'amulet_ruby'),
    E('sun_amulet', 'Sonnenamulett', 17, 'epic', 'amulet_sun', 'Wärmt wie ein Sommermorgen, selbst in den tiefsten Grüften.'),
    E('ember_heart', 'Glutherz', 20, 'legendary', 'amulet_ruby', 'Es pocht warm in der Hand, wie ein zweites Herz. Die letzte Glut des alten Königs.', { source: 'boss', set: 'tyrant', stats: { critChance: 0.03 } }),
    E('acolyte_charm', 'Amulett des Akolythen', 9, 'rare', 'amulet_silver', '', { attrs: ['int', 'vit'] }),
    E('fang_charm', 'Zahnamulett', 6, 'rare', 'charm_tooth', 'Drei Wolfszähne an einer Lederschnur.', { attrs: ['agi', 'vit'] }),
    E('wolfsbane_amulet', 'Wolfsbann-Amulett', 17, 'rare', 'amulet_bone', '', { attrs: ['str', 'vit'] }),
    E('falcon_amulet', 'Falkenamulett', 17, 'rare', 'charm_feather', 'Eine Falkenfeder, in Silber gefasst.', { attrs: ['agi', 'vit'] }),
  ],
};

// Säbel und Krummsäbel sind die Schwerter der Schurken: Beweglichkeit zuerst (Breitschwerter bleiben Stärke für Krieger)
const AGILE_SWORD = /sabre|scimitar|kris|rapier/;
const AGILE_SWORD_ATTRS = ['agi', 'str', 'vit'];

// Passt das Hauptattribut eines Teils zur Klasse? (Teile ohne Stärke/Beweglichkeit/Intelligenz passen immer.)
export function attrFit(def, classId) {
  const primary = CLASSES[classId]?.primary, st = def?.stats;
  if (!primary || !st) return true;
  const best = Math.max(st.str ?? 0, st.agi ?? 0, st.int ?? 0);
  return best === 0 || (st[primary] ?? 0) === best;
}

function withLists(base, extra) {
  const out = {};
  for (const [k, list] of Object.entries(base)) out[k] = [...list];
  for (const [k, list] of Object.entries(extra)) out[k] = [...(out[k] ?? []), ...list];
  return out;
}

// ------------------------------------------------------------------ Varianten (Runde 08.10.)
// Nutzer: „Mehr Variationen bei Rüstung und Waffen“. Jede grüne und blaue Zufallsbeute (ohne source/Set) gibt es
// zusätzlich in zwei Fassungen mit Beinamen: andere Attribute und ein kleiner Zusatzwert.
// ID `<basis>_<variante>`, Felder `variant` und `base` (A kann daran Farbtöne im Aussehen festmachen).
export const VARIANTS = {
  bear: { suffix: 'des Bären', attrs: ['str', 'vit', 'agi'], extra: (L, m) => ({ maxHp: Math.round((3 + L * 1.6) * m * 0.5) }) },
  guard: { suffix: 'des Wächters', attrs: ['vit', 'str', 'int'], extra: (L, m) => ({ armor: Math.max(1, Math.round((2 + L * 0.6) * m * 0.5)) }) },
  fox: { suffix: 'des Fuchses', attrs: ['agi', 'vit', 'str'], extra: (_L, m) => ({ critChance: Math.round(0.008 * m * 1000) / 1000 }) },
  hawk: { suffix: 'des Falken', attrs: ['agi', 'int', 'vit'], extra: (L, m) => ({ power: Math.max(1, Math.round((0.5 + L * 0.2) * m)) }) },
  owl: { suffix: 'der Eule', attrs: ['int', 'vit', 'agi'], extra: (L, m) => ({ maxResource: Math.max(2, Math.round((2 + L * 0.6) * m)) }) },
  ember: { suffix: 'der Glut', attrs: ['int', 'agi', 'str'], extra: (_L, m) => ({ critChance: Math.round(0.008 * m * 1000) / 1000 }) },
};
const VARIANTS_FOR = {
  sword: ['bear', 'fox'], greatsword: ['bear', 'guard'], axe: ['bear', 'guard'], mace: ['bear', 'guard'],
  dagger: ['fox', 'hawk'], bow: ['hawk', 'fox'], staff: ['owl', 'ember'], wand: ['owl', 'ember'],
  cloth: ['owl', 'ember'], leather: ['fox', 'hawk'], mail: ['bear', 'hawk'], plate: ['bear', 'guard'],
};
function addVariants(out) {
  for (const [id, d] of Object.entries(out)) {
    if (d.source || d.set || (d.rarity !== 'uncommon' && d.rarity !== 'rare') || (d.type !== 'weapon' && d.type !== 'armor')) continue;
    for (const v of VARIANTS_FOR[d.family] ?? []) {
      const V = VARIANTS[v], vid = `${id}_${v}`;
      if (out[vid]) continue;
      const m = RARITIES[d.rarity].mult;
      out[vid] = { ...d, name: `${d.name} ${V.suffix}`, variant: v, base: id,
        stats: makeStats({ slot: d.slot, family: d.family, ilvl: d.ilvl, rarity: d.rarity, attrs: V.attrs, extra: V.extra(d.ilvl, m) }) };
    }
  }
}

function buildEquipment() {
  const out = {};
  const weapons = withLists(WEAPONS, WEAPONS_40), armor = withLists(ARMOR, ARMOR_40), jewelry = withLists(JEWELRY, JEWELRY_40);
  for (const [family, list] of Object.entries(weapons)) {
    for (const e of list) {
      out[e.id] = {
        name: e.name, type: 'weapon', slot: 'weapon', family, visual: family, rarity: e.rarity, ilvl: e.ilvl, icon: e.icon, desc: e.desc,
        classes: WEAPON_CLASSES[family], source: e.source, set: e.set,
        stats: makeStats({ slot: 'weapon', family, ilvl: e.ilvl, rarity: e.rarity, attrs: e.attrs ?? (family === 'sword' && AGILE_SWORD.test(e.id) ? AGILE_SWORD_ATTRS : undefined), extra: e.stats }),
      };
    }
  }
  for (const [slot, list] of Object.entries(armor)) {
    for (const e of list) {
      out[e.id] = {
        name: e.name, type: 'armor', slot, family: e.family, visual: e.family, rarity: e.rarity, ilvl: e.ilvl, icon: e.icon, desc: e.desc, source: e.source, set: e.set,
        stats: makeStats({ slot, family: e.family, ilvl: e.ilvl, rarity: e.rarity, attrs: e.attrs, extra: e.stats }),
      };
    }
  }
  for (const [slot, list] of Object.entries(jewelry)) {
    for (const e of list) {
      out[e.id] = {
        name: e.name, type: 'jewelry', slot, rarity: e.rarity, ilvl: e.ilvl, icon: e.icon, desc: e.desc, source: e.source, set: e.set,
        stats: makeStats({ slot, ilvl: e.ilvl, rarity: e.rarity, attrs: e.attrs, extra: e.stats }),
      };
    }
  }
  addVariants(out);
  for (const [id, d] of Object.entries(out)) {
    if (!d.stats) throw new Error(`Item ${id} ohne Werte`);
    d.reqLevel = Math.max(1, d.ilvl - 1);
    d.tier = tierOf(d.ilvl);
    d.value = itemValue(d.ilvl, d.rarity);
  }
  return out;
}

// ------------------------------------------------------------------ Verbrauch, Material, Quest
const OTHER = {
  minor_potion: { name: 'Kleiner Heiltrank', type: 'consumable', rarity: 'common', ilvl: 1, icon: 'potion_hp_s', use: { heal: 40 }, stack: 20, value: 2, desc: 'Stellt 40 Leben wieder her.' },
  healing_potion: { name: 'Heiltrank', type: 'consumable', rarity: 'common', ilvl: 6, icon: 'potion_hp_m', use: { heal: 100 }, stack: 20, value: 6, desc: 'Stellt 100 Leben wieder her.' },
  greater_potion: { name: 'Großer Heiltrank', type: 'consumable', rarity: 'uncommon', ilvl: 12, icon: 'potion_hp_l', use: { heal: 220 }, stack: 20, value: 14, desc: 'Stellt 220 Leben wieder her.' },
  minor_mana: { name: 'Kleiner Manatrank', type: 'consumable', rarity: 'common', ilvl: 1, icon: 'potion_mana_s', use: { resource: 35 }, stack: 20, value: 2, desc: 'Stellt 35 Ressource (Mana, Energie oder Wut) wieder her.' },
  mana_potion: { name: 'Manatrank', type: 'consumable', rarity: 'common', ilvl: 8, icon: 'potion_mana_m', use: { resource: 70 }, stack: 20, value: 7, desc: 'Stellt 70 Ressource wieder her.' },
  ember_elixir: { name: 'Glutelixier', type: 'consumable', rarity: 'rare', ilvl: 10, icon: 'elixir', use: { heal: 9999, resource: 9999 }, stack: 5, value: 30, desc: 'Füllt Leben und Ressource vollständig auf.' },
  hearth_bread: { name: 'Herdbrot', type: 'consumable', rarity: 'common', ilvl: 1, icon: 'food_bread', use: { heal: 25 }, stack: 20, value: 1, desc: 'Frisch aus Marens Ofen. Stellt 25 Leben wieder her.' },

  wolf_pelt: { name: 'Aschewolfsfell', type: 'material', rarity: 'common', icon: 'pelt', stack: 50, value: 2, desc: 'Grau vom Ascheregen. Brom verarbeitet es.' },
  wolf_fang: { name: 'Wolfszahn', type: 'material', rarity: 'common', icon: 'fang', stack: 50, value: 2, desc: 'Scharf und fest. Gut für Talismane.' },
  bone_dust: { name: 'Knochenstaub', type: 'material', rarity: 'common', icon: 'dust', stack: 50, value: 2, desc: 'Fein gemahlen. Alchemisten zahlen dafür.' },
  linen: { name: 'Grableinen', type: 'material', rarity: 'common', icon: 'cloth', stack: 50, value: 2, desc: 'Vergilbtes Tuch aus den Grabkammern.' },
  grave_iron: { name: 'Grabeisen', type: 'material', rarity: 'uncommon', icon: 'ore_iron', stack: 50, value: 5, desc: 'Schwarzes Eisen aus den Tiefen der Katakomben.' },
  ember_ore: { name: 'Glut-Erz', type: 'material', rarity: 'uncommon', icon: 'ore_ember', stack: 50, value: 12, desc: 'Warm wie ein Herdstein. Brom kann damit Waffen veredeln.' },
  shadow_essence: { name: 'Schattenessenz', type: 'material', rarity: 'uncommon', icon: 'essence_shadow', stack: 50, value: 14, desc: 'Bleibt übrig, wenn ein Schattenwesen vergeht.' },
  ruby: { name: 'Rubin', type: 'material', rarity: 'uncommon', icon: 'gem_ruby', stack: 50, value: 20, desc: 'Ein roher, blutroter Edelstein.' },
  sapphire: { name: 'Saphir', type: 'material', rarity: 'uncommon', icon: 'gem_sapphire', stack: 50, value: 20, desc: 'Ein roher, tiefblauer Edelstein.' },
  amethyst: { name: 'Amethyst', type: 'material', rarity: 'rare', icon: 'gem_amethyst', stack: 50, value: 40, desc: 'Selten und begehrt. In ihm schläft alte Magie.' },

  thorn_sap: { name: 'Dornensaft', type: 'material', rarity: 'common', icon: 'potion_mana_s', stack: 50, value: 3, desc: 'Klebriger, grüner Saft der Dornenkriecher. Oona braut daraus Gegengift.' },
  temple_relic: { name: 'Tempelrelikt', type: 'material', rarity: 'uncommon', icon: 'relic', stack: 50, value: 8, desc: 'Ein Götzenbild aus dem Versunkenen Tempel, salzverkrustet.' },
  obsidian_shard: { name: 'Obsidiansplitter', type: 'material', rarity: 'uncommon', icon: 'gem_amethyst', stack: 50, value: 8, desc: 'Scharfkantig und schwarz. Aus den Leibern der Aschengolems.' },
  cultist_tome: { name: 'Kultistenfolio', type: 'material', rarity: 'uncommon', icon: 'scroll', stack: 50, value: 8, desc: 'Verbrannte Seiten voller Beschwörungen an Ignaroth.' },
  ember_core: { name: 'Glutkern', type: 'material', rarity: 'rare', icon: 'ore_ember', stack: 50, value: 25, desc: 'Das pochende Herz eines Glutwesens. Begehrt bei jedem Schmied.' },
  ember_shard: { name: 'Glutsplitter', type: 'material', rarity: 'epic', icon: 'essence', stack: 999, value: 0, desc: 'Lohn der Glutprüfungen. Brom tauscht sie gegen Wächterausrüstung und Verzauberungen.' },

  spider_silk: { name: 'Spinnenseide', type: 'quest', rarity: 'common', icon: 'spider_silk', stack: 20, value: 0, desc: 'Zäh und klebrig. Brom braucht drei Bündel davon.' },
  tide_pearl: { name: 'Gezeitenperle', type: 'quest', rarity: 'epic', icon: 'gem_sapphire', stack: 1, value: 0, desc: 'Neriths Herz, zu Perle erstarrt. Ilsa muss sie sehen.' },
  tyrant_crown: { name: 'Krone des Tyrannen', type: 'quest', rarity: 'legendary', icon: 'relic', stack: 1, value: 0, desc: 'Die glühende Krone Ignaroths. Kommandant Hale wird es kaum glauben.' },
  varkhul_sigil: { name: 'Varkhuls Siegel', type: 'quest', rarity: 'epic', icon: 'seal', stack: 1, value: 0, desc: 'Das Siegel des Knochenfürsten. Maren wird es sehen wollen.' },
};

const EQUIPMENT = buildEquipment();
for (const id of Object.keys(OTHER_40)) if (EQUIPMENT[id] || OTHER[id]) throw new Error(`Item-ID ${id} doppelt`);
export const ITEMS = { ...EQUIPMENT, ...OTHER, ...OTHER_40 };
for (const d of [...Object.values(OTHER), ...Object.values(OTHER_40)]) { d.ilvl = d.ilvl ?? 1; d.reqLevel = d.reqLevel ?? 1; d.tier = tierOf(d.ilvl); }

export function stackSize(def) { return Math.max(1, def?.stack ?? 1); }
export function buyPrice(def) { return def.price ?? Math.max(1, Math.round((def.value || 1) * BUY_FACTOR)); }
export function isEquippable(def) { return !!def?.slot; }
export function equipSlotFor(def) { return def?.slot ?? null; }
export function canUseClass(def, classId) { return !def?.classes || !classId || def.classes.includes(classId); }
export function typeLabel(def) {
  if (def.slot === 'weapon') return FAMILY_NAMES[def.family] ?? 'Waffe';
  if (def.type === 'armor') return `${EQUIP_SLOT_NAMES[def.slot]} · ${FAMILY_NAMES[def.family] ?? ''}`.replace(/ · $/, '');
  if (def.type === 'jewelry') return EQUIP_SLOT_NAMES[def.slot];
  return ITEM_TYPES[def.type]?.name ?? def.type;
}
// Grobe Stärke eines Items, um Beute und Ausrüstung zu vergleichen (Sortierung, „Besser“-Pfeil).
export function itemScore(def) {
  const s = def?.stats ?? {};
  return (s.power ?? 0) * 2 + (s.armor ?? 0) + (s.maxHp ?? 0) * 0.25 + ((s.str ?? 0) + (s.agi ?? 0) + (s.int ?? 0) + (s.vit ?? 0)) * 1.2
    + (s.critChance ?? 0) * 200 + (s.maxResource ?? 0) * 0.2 + (s.moveSpeed ?? 0) * 150;
}
