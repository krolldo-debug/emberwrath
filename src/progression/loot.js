// Beute (Thread C): Daten und Würfel ohne DOM – derselbe Code kann später auf dem Server laufen.
//
// Seltenheitsgrenzen (verbindlich, INTEGRATION.md §11.5):
//   normale Gegner  6 % Ausrüstung; rare 0,8 % davon und erst ab Stufe 6, epic nie
//   Elite           rare 12 %, epic 1 %
//   Seltene (rares.js) 1 Teil, rare 28 %, epic 2 %, dazu ihr eigenes Beutestück (25 %)
//   Boss            mind. uncommon; epic Varkhul 3 %, Nerith 5 %, Ignaroth 8 %; legendary ≤ 2 % (nur Ignaroth)
//   Truhen          höchstens rare (3 %, Bosstruhe 25 %)
// Items mit `source` (boss/quest/vendor) fallen nie zufällig, nur über BOSS_LOOT bzw. Quests.
import { ITEMS, RARITY_ORDER, WEAPON_CLASSES, itemScore } from './items.js';
import { RARE_ENEMIES, RARE_GOLD_MULT, RARE_WEIGHTS } from './rares.js';

// Gewichte je Quelle. Summe beliebig; Grenzen werden in rarityWeights() erzwungen.
const RARITY_TABLE = {
  // Runde 5 (Nutzerwunsch): Blau soll besonders sein, Lila wirklich selten
  normal: { common: 85, uncommon: 14.2, rare: 0.8 },
  elite: { common: 30, uncommon: 57, rare: 12, epic: 1 },
  chest: { common: 55, uncommon: 42, rare: 3 },
  chest_boss: { uncommon: 75, rare: 25 },
};
const BOSSES = {
  // set: je Kill mit `chance` ein zufälliges Teil des Boss-Sets (sets.js), zusätzlich zu den normalen Teilen.
  bonelord: { weights: { uncommon: 75, rare: 22, epic: 3 }, drops: 2, gold: 12, named: [['varkhul_cleaver', 0.2]], set: { chance: 0.35, pieces: ['varkhul_helm', 'bone_mail', 'varkhul_grips', 'varkhul_greaves'] }, quest: [['q_bonelord', 'varkhul_sigil']] },
  drowned_priestess: { weights: { uncommon: 50, rare: 45, epic: 5 }, drops: 2, gold: 14, named: [['priestess_amulet', 0.05]], set: { chance: 0.35, pieces: ['tide_circlet', 'tide_wraps', 'tide_pearl_ring'] }, quest: [['q_nerith', 'tide_pearl']] },
  // Legendär: höchstens EIN Teil pro Kill, Gesamtchance 1,8 % (bevorzugt passend zur Klasse).
  ember_tyrant: { weights: { rare: 92, epic: 8 }, drops: 3, set: { chance: 0.12, pieces: ['tyrant_helm', 'tyrant_gauntlets', 'tyrant_sabatons'] }, gold: 18, legendary: { chance: 0.018, pool: ['tyrant_plate', 'crown_of_embers_blade', 'nightwhisper', 'starfall', 'worldstaff', 'ember_heart'] }, quest: [['q_ignaroth', 'tyrant_crown']] },
};
export const LEGENDARY_MAX = 0.02;

// Materialien nach Gegnertyp (Vorrang) bzw. Familie. [itemId, Chance, questBoost?]
// Questboosts in Instanzen ohne Respawn so gewählt, dass ein Durchgang fast immer reicht (Glutschmiede: 4 Golems, 7 Drachen).
const TYPE_MATS = {
  wolf: [['wolf_pelt', 0.45], ['wolf_fang', 0.2]],
  wolf_alpha: [['wolf_pelt', 1], ['wolf_fang', 0.8]],
  skeleton: [['bone_dust', 0.45], ['linen', 0.2], ['grave_iron', 0.06]],
  archer: [['bone_dust', 0.4], ['linen', 0.25]],
  spider: [['linen', 0.15]],
  ash_boar: [['wolf_pelt', 0.35], ['wolf_fang', 0.25]],
  bandit: [['linen', 0.3], ['grave_iron', 0.06]],
  bandit_archer: [['linen', 0.3]],
  thorn_crawler: [['thorn_sap', 0.5, 0.75]],
  drowned: [['linen', 0.3], ['temple_relic', 0.22, 0.45]],
  tide_cultist: [['temple_relic', 0.25, 0.45], ['sapphire', 0.02]],
  temple_guardian: [['temple_relic', 0.35, 0.6], ['grave_iron', 0.15]],
  fire_imp: [['ember_ore', 0.08]],
  magma_hound: [['ember_ore', 0.12], ['wolf_fang', 0.2]],
  ash_golem: [['obsidian_shard', 0.5, 0.75], ['ember_ore', 0.1]],
  cinder_cultist: [['cultist_tome', 0.4, 0.6], ['ruby', 0.02]],
  flame_acolyte: [['cultist_tome', 0.35, 0.6], ['ember_ore', 0.08]],
  forge_golem: [['ember_ore', 0.2], ['obsidian_shard', 0.2], ['ember_core', 0.04, 0.6]],
  ember_drake: [['ember_core', 0.1, 0.7], ['ember_ore', 0.2]],
};
const FAMILY_MATS = {
  beast: [['wolf_pelt', 0.35]], undead: [['bone_dust', 0.4]], spider: [['linen', 0.15]], humanoid: [['linen', 0.3]],
};
const ELITE_MATS = [['ember_core', 0.15], ['shadow_essence', 0.08], ['ruby', 0.06], ['sapphire', 0.06], ['amethyst', 0.015]];
// Questgegenstände, die nur während der Quest fallen: [questId, itemId, Chance]
const QUEST_DROPS = {
  spider: [['q_spider_silk', 'spider_silk', 0.85]],  // Katakomben: 5 Spinnen, kein Respawn
};

// ---------------------------------------------------------------- Hilfen
function pickWeighted(entries, rng) {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (const [id, w] of entries) { r -= w; if (r < 0) return id; }
  return entries[entries.length - 1][0];
}

// Gewichte mit erzwungenen Grenzen: normale Gegner vor Tier 2 ohne rare, nie epic.
export function rarityWeights(kind, level, bossId) {
  if (kind === 'boss') return { ...(BOSSES[bossId]?.weights ?? { uncommon: 45, rare: 45, epic: 10 }) };
  if (kind === 'rare') return { ...RARE_WEIGHTS };
  const w = { ...(RARITY_TABLE[kind] ?? RARITY_TABLE.normal) };
  if (kind === 'normal') { delete w.epic; delete w.legendary; if (level < 6) delete w.rare; }
  if (kind === 'chest' || kind === 'chest_boss' || kind === 'elite') delete w.legendary;
  if (kind === 'chest' || kind === 'chest_boss') delete w.epic;
  return w;
}

const EQUIP = Object.entries(ITEMS).filter(([, d]) => d.slot && !d.source).map(([id, d]) => ({ id, ...d }));

// Ein zufälliges Ausrüstungsteil passender Stufe und Seltenheit.
// Bevorzugt (60 %) Teile, die die Klasse des Spielers tragen kann.
export function pickEquipment({ level, rarity, classId, rng = Math.random }) {
  let r = RARITY_ORDER.indexOf(rarity);
  for (; r >= 0; r--) {
    const rar = RARITY_ORDER[r];
    for (const spread of [[3, 1], [5, 2], [8, 4], [20, 20]]) {
      let pool = EQUIP.filter((d) => d.rarity === rar && d.ilvl >= level - spread[0] && d.ilvl <= level + spread[1]);
      if (!pool.length) continue;
      if (classId && rng() < 0.6) {
        const fit = pool.filter((d) => !d.classes || d.classes.includes(classId));
        if (fit.length) pool = fit;
      }
      return pool[Math.floor(rng() * pool.length)].id;
    }
  }
  return null;
}

export function potionFor(level) { return level >= 12 ? 'greater_potion' : level >= 6 ? 'healing_potion' : 'minor_potion'; }
export function manaFor(level) { return level >= 8 ? 'mana_potion' : 'minor_mana'; }

// ---------------------------------------------------------------- Würfeln
// enemy = { type, level, family, elite, boss, bossId, rareId }  (Gegner) bzw. { chest: objectId, level }
// questNeed(questId, itemId) -> fehlende Stückzahl (0 = Quest nicht aktiv / fertig)
// Ergebnis: [{ gold } | { itemId, qty, quest? }]
export function rollLoot(enemy, { rng = Math.random, classId = null, questNeed = () => 0 } = {}) {
  const drops = [];
  const lvl = Math.max(1, enemy.level ?? 1);
  const isChest = !!enemy.chest;
  const bossChest = isChest && String(enemy.chest).startsWith('boss');
  const rare = !isChest && !enemy.boss ? RARE_ENEMIES[enemy.rareId] : null;
  const kind = isChest ? (bossChest ? 'chest_boss' : 'chest') : enemy.boss ? 'boss' : rare ? 'rare' : enemy.elite ? 'elite' : 'normal';
  const boss = kind === 'boss' ? BOSSES[enemy.bossId ?? enemy.type] : null;

  // Gold
  const goldMult = kind === 'boss' ? boss?.gold ?? 12 : kind === 'rare' ? RARE_GOLD_MULT : kind === 'elite' ? 4 : kind === 'chest_boss' ? 8 : kind === 'chest' ? 3 : 1;
  if (kind !== 'normal' || rng() < 0.65) {
    const lo = 1 + lvl * 0.6, hi = 3 + lvl * 1.3;
    drops.push({ gold: Math.max(1, Math.round((lo + rng() * (hi - lo)) * goldMult)) });
  }

  // Ausrüstung
  const count = kind === 'boss' ? boss?.drops ?? 2 : kind === 'normal' ? (rng() < 0.06 ? 1 : 0) : 1;
  const weights = Object.entries(rarityWeights(kind, lvl, enemy.bossId ?? enemy.type));
  for (let i = 0; i < count; i++) {
    const rarity = pickWeighted(weights, rng);
    const id = rarity && pickEquipment({ level: lvl, rarity, classId, rng });
    if (id) drops.push({ itemId: id, qty: 1 });
  }
  if (rare?.signature && ITEMS[rare.signature[0]] && rng() < rare.signature[1]) drops.push({ itemId: rare.signature[0], qty: 1 });
  for (const [id, chance] of boss?.named ?? []) if (ITEMS[id] && rng() < chance) drops.push({ itemId: id, qty: 1 });
  if (boss?.set && rng() < boss.set.chance) drops.push({ itemId: boss.set.pieces[Math.floor(rng() * boss.set.pieces.length)], qty: 1 });
  if (boss?.legendary && rng() < Math.min(LEGENDARY_MAX, boss.legendary.chance)) {
    const pool = boss.legendary.pool.filter((id) => ITEMS[id]);
    const fit = pool.filter((id) => !ITEMS[id].classes || !classId || ITEMS[id].classes.includes(classId));
    const from = fit.length && rng() < 0.75 ? fit : pool;
    drops.push({ itemId: from[Math.floor(rng() * from.length)], qty: 1 });
  }

  // Tränke
  if (rng() < (kind === 'normal' ? 0.1 : 0.6)) drops.push({ itemId: potionFor(lvl), qty: kind === 'normal' ? 1 : 2 });
  if (rng() < (kind === 'normal' ? 0.05 : 0.35)) drops.push({ itemId: manaFor(lvl), qty: 1 });
  if ((kind === 'elite' || kind === 'rare') && rng() < 0.08) drops.push({ itemId: 'ember_elixir', qty: 1 });

  // Materialien
  if (!isChest) {
    for (const [id, chance, boost] of TYPE_MATS[enemy.type] ?? FAMILY_MATS[enemy.family] ?? []) {
      const c = boost && questNeed(null, id) > 0 ? boost : chance;
      if (rng() < c) drops.push({ itemId: id, qty: 1 });
    }
    if (kind !== 'normal') for (const [id, chance] of ELITE_MATS) if (rng() < chance) drops.push({ itemId: id, qty: 1 });
  } else if (rng() < 0.5) {
    drops.push({ itemId: lvl >= 12 ? 'ember_ore' : 'grave_iron', qty: 1 + Math.floor(rng() * 2) });
  }

  // Questgegenstände
  for (const [questId, itemId, chance = 1] of [...(QUEST_DROPS[enemy.type] ?? []), ...(boss?.quest ?? [])]) {
    if (questNeed(questId, itemId) > 0 && rng() < chance) drops.push({ itemId, qty: 1, quest: true });
  }
  return drops;
}

// Deterministische Klassenbelohnung für Quests: bestes passendes Teil zu Stufe/Seltenheit/Slot.
// spec = { ilvl, rarity, slot? } ; slot 'weapon' nimmt eine Waffe der Klasse.
export function pickRewardGear(spec, classId, salt = 0) {
  const want = spec.slot;
  let pool = EQUIP.filter((d) => d.rarity === spec.rarity && (!want || d.slot === want));
  const fit = pool.filter((d) => !d.classes || !classId || d.classes.includes(classId));
  if (fit.length) pool = fit;
  if (want === 'weapon' && classId) {
    const own = pool.filter((d) => WEAPON_CLASSES[d.family]?.[0] === classId);
    if (own.length) pool = own;
  }
  if (!pool.length) return null;
  // Nächste Gegenstandsstufe zuerst; bei Gleichstand das stärkere Teil
  pool.sort((a, b) => Math.abs(a.ilvl - spec.ilvl) - Math.abs(b.ilvl - spec.ilvl) || itemScore(b) - itemScore(a) || a.id.localeCompare(b.id));
  const near = pool.filter((d) => Math.abs(d.ilvl - spec.ilvl) <= Math.abs(pool[0].ilvl - spec.ilvl) + 1);
  return near[salt % Math.min(near.length, 2)].id;
}
