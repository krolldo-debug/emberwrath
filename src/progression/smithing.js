// Verstärken und Verzaubern (Thread C) – Gold-Sinks für das Endgame.
// Beides gilt für den AUSRÜSTUNGSPLATZ, nicht für das einzelne Teil: Wer ein besseres Schwert
// anlegt, verliert nichts. (Items sind reine IDs ohne Instanzdaten.)
// Wirkung: computeBonus(inventory) -> Stat-Summe aus Sets, Verstärkung und Verzauberung;
// liegt als state.slices.inventory.bonus bereit, computeStats (Thread A) addiert es.
import { ITEMS, EQUIP_SLOTS } from './items.js';
import { SETS } from './sets.js';

export const UPGRADE_MAX = 15;
export const UPGRADE_PCT = 0.04; // je Stufe: fester Grundwert + 4 % des Hauptwerts des angelegten Teils (ab +11 nur 2 %)
// Hauptwert je Platz und fester Zuwachs je Stufe (wirkt auch bei leerem oder schwachem Teil)
const UPGRADE_MAIN = { weapon: ['power', 1.2], head: ['armor', 1.5], chest: ['armor', 2], hands: ['armor', 1.2], feet: ['armor', 1.2], ring: ['maxHp', 8], amulet: ['maxHp', 10] };

// Stufen +11 bis +15 (Stufe 20–40): Materialien der neuen Gebiete, damit Gold allein (auch gekauftes) nicht reicht.
const HIGH_UPGRADES = [
  { gold: 5000, mat: 'bog_iron', qty: 3, reqLevel: 22 },
  { gold: 6500, mat: 'bog_iron', qty: 5, reqLevel: 26 },
  { gold: 8500, mat: 'rime_crystal', qty: 3, reqLevel: 30 },
  { gold: 11000, mat: 'rime_crystal', qty: 5, reqLevel: 34 },
  { gold: 14000, mat: 'magma_scale', qty: 5, reqLevel: 38 },
];
// Wirksame Prozentstufen: bis +10 voll, darüber halb
const pctSteps = (lvl) => Math.min(lvl, 10) + Math.max(0, lvl - 10) * 0.5;

// Kosten der nächsten Stufe (current -> current + 1)
export function upgradeCost(current) {
  const hi = HIGH_UPGRADES[current - 10];
  if (hi) return { gold: hi.gold, mats: [{ itemId: hi.mat, qty: hi.qty }], reqLevel: hi.reqLevel };
  const gold = Math.round((60 * Math.pow(1.6, current)) / 10) * 10;
  const mat = current < 3 ? 'grave_iron' : current < 6 ? 'ember_ore' : current < 9 ? 'ember_core' : 'ember_shard';
  const qty = current < 3 ? 2 + current : current < 6 ? current - 1 : current < 9 ? current - 5 : 5;
  return { gold, mats: [{ itemId: mat, qty }], reqLevel: 5 + current * 1.5 | 0 };
}

// Verzauberungen: je Platz eine aktive; Neuverzaubern ersetzt sie.
export const ENCHANTS = {
  keen_edge: { name: 'Glutschärfe', slots: ['weapon'], stats: { power: 6 }, gold: 250, mats: [{ itemId: 'ember_ore', qty: 2 }], level: 10 },
  ember_edge: { name: 'Tyrannenfeuer', slots: ['weapon'], stats: { power: 12, critChance: 0.02 }, gold: 900, mats: [{ itemId: 'ember_shard', qty: 6 }], level: 20 },
  precision: { name: 'Präzision', slots: ['weapon', 'ring', 'hands'], stats: { critChance: 0.03 }, gold: 400, mats: [{ itemId: 'ruby', qty: 1 }], level: 12 },
  bulwark: { name: 'Bollwerk', slots: ['chest', 'head'], stats: { armor: 12 }, gold: 300, mats: [{ itemId: 'grave_iron', qty: 4 }], level: 8 },
  vigor: { name: 'Lebenskraft', slots: ['chest', 'head', 'amulet'], stats: { maxHp: 45, vit: 3 }, gold: 350, mats: [{ itemId: 'wolf_pelt', qty: 6 }], level: 8 },
  swiftness: { name: 'Windschritt', slots: ['feet'], stats: { moveSpeed: 0.05 }, gold: 500, mats: [{ itemId: 'shadow_essence', qty: 1 }], level: 10 },
  might: { name: 'Stärke des Bären', slots: ['hands', 'ring', 'amulet'], stats: { str: 6 }, gold: 300, mats: [{ itemId: 'wolf_fang', qty: 4 }], level: 8 },
  grace: { name: 'Anmut der Katze', slots: ['hands', 'ring', 'amulet'], stats: { agi: 6 }, gold: 300, mats: [{ itemId: 'thorn_sap', qty: 4 }], level: 8 },
  insight: { name: 'Einsicht', slots: ['head', 'ring', 'amulet'], stats: { int: 6, maxResource: 15 }, gold: 300, mats: [{ itemId: 'temple_relic', qty: 3 }], level: 10 },
  warden_ward: { name: 'Wächtersegen', slots: ['chest', 'feet', 'hands'], stats: { armor: 18, maxHp: 60 }, gold: 1200, mats: [{ itemId: 'ember_shard', qty: 8 }], level: 20 },
  // Stufe 20–40: aus den Materialien der neuen Gebiete
  steppe_might: { name: 'Kraft der Steppe', slots: ['hands', 'ring', 'amulet'], stats: { str: 12 }, gold: 1500, mats: [{ itemId: 'hyena_hide', qty: 10 }], level: 24 },
  ancestor_vigor: { name: 'Ahnenkraft', slots: ['chest', 'head', 'amulet'], stats: { maxHp: 110, vit: 6 }, gold: 1800, mats: [{ itemId: 'barrow_bone', qty: 10 }], level: 25 },
  marsh_grace: { name: 'Sumpfgewandtheit', slots: ['hands', 'ring', 'amulet'], stats: { agi: 12 }, gold: 1500, mats: [{ itemId: 'leech_ichor', qty: 10 }], level: 26 },
  spore_insight: { name: 'Sporenweisheit', slots: ['head', 'ring', 'amulet'], stats: { int: 12, maxResource: 30 }, gold: 1500, mats: [{ itemId: 'spore_cap', qty: 8 }], level: 28 },
  rime_bite: { name: 'Reifbiss', slots: ['weapon'], stats: { power: 18, critChance: 0.02 }, gold: 2500, mats: [{ itemId: 'rime_crystal', qty: 4 }], level: 30 },
  troll_hide: { name: 'Trollhaut', slots: ['chest', 'head'], stats: { armor: 28, maxHp: 90 }, gold: 2000, mats: [{ itemId: 'troll_fat', qty: 10 }], level: 31 },
  stalker_step: { name: 'Pirscherschritt', slots: ['feet'], stats: { moveSpeed: 0.07 }, gold: 3000, mats: [{ itemId: 'frost_pelt', qty: 12 }, { itemId: 'crystal_silk', qty: 2 }], level: 33 },
  magma_edge: { name: 'Magmaglut', slots: ['weapon'], stats: { power: 26, critChance: 0.03 }, gold: 5000, mats: [{ itemId: 'magma_scale', qty: 6 }, { itemId: 'adept_sigil', qty: 6 }], level: 37 },
  pilgrim_ward: { name: 'Pilgersegen', slots: ['chest', 'feet', 'hands'], stats: { armor: 34, maxHp: 140 }, gold: 4500, mats: [{ itemId: 'pilgrim_relic', qty: 10 }], level: 38 },
};

// Aktive Setboni: [{ setId, name, count, total, bonuses: [{ count, stats, active }] }]
export function activeSets(equipment) {
  const counts = {};
  for (const slot of EQUIP_SLOTS) {
    const set = ITEMS[equipment?.[slot]]?.set;
    if (set) counts[set] = (counts[set] ?? 0) + 1;
  }
  return Object.entries(counts).map(([setId, count]) => {
    const def = SETS[setId];
    return { setId, name: def.name, count, total: def.pieces.length, bonuses: def.bonuses.map((b) => ({ ...b, active: count >= b.count })) };
  });
}

function add(out, stats, f = 1) {
  for (const [k, v] of Object.entries(stats ?? {})) out[k] = (out[k] ?? 0) + v * f;
}
const round = (out) => { for (const k of Object.keys(out)) out[k] = Math.round(out[k] * 1000) / 1000; return out; };

// Zusatzwerte des Inventars. inv = { equipment, upgrades, enchants }
export function computeBonus(inv) {
  const out = {};
  for (const s of activeSets(inv.equipment)) for (const b of s.bonuses) if (b.active) add(out, b.stats);
  for (const slot of EQUIP_SLOTS) {
    const lvl = inv.upgrades?.[slot] ?? 0;
    const def = ITEMS[inv.equipment?.[slot]];
    if (lvl > 0) {
      const [k, flat] = UPGRADE_MAIN[slot];
      add(out, { [k]: Math.round(lvl * flat + (def?.stats?.[k] ?? 0) * UPGRADE_PCT * pctSteps(lvl)) });
    }
    const ench = ENCHANTS[inv.enchants?.[slot]];
    if (ench) add(out, ench.stats);
  }
  return round(out);
}

// Zusatzwerte nur eines Platzes (für die Anzeige im Schmiede-Panel)
export function slotBonus(inv, slot) {
  return computeBonus({ equipment: { [slot]: inv.equipment?.[slot] }, upgrades: { [slot]: inv.upgrades?.[slot] }, enchants: { [slot]: inv.enchants?.[slot] } });
}
