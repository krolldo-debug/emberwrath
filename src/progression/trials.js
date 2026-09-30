// Glutprüfungen (Thread C): wiederholbares Endgame ab Stufe 20, Format siehe README.md / INTEGRATION.md.
// Reine Funktionen: Laufbeschreibung (für Thread B) und Belohnung. Kein DOM, serverfähig.
import { ITEMS } from './items.js';
import { pickEquipment, potionFor } from './loot.js';
import { SOVEREIGN_LEGENDARIES } from './items40.js';

export const TRIAL_ZONE = 'ember_trial';
export const TRIAL_REQUIRES = { level: 20, quest: 'q_ignaroth' };
export const TRIAL_MAX_TIER = 30;
export const KILL_VALUE = { normal: 1, elite: 4 };
export const LEGENDARIES = ['tyrant_plate', 'crown_of_embers_blade', 'nightwhisper', 'starfall', 'worldstaff', 'ember_heart'];
// Ab Stufe 20 skalieren Gegnerstufe, Boss-Leben, Gold und Beute-ilvl mit der Spielerstufe (§12.1); die Prüfungsstufen bleiben.
// Ab Spielerstufe 38 kommt der legendäre Pool des Aschenfürsten dazu. Albtraumross ab Prüfungsstufe 20: 0,3 % je Abschluss.
export const TRIAL_MOUNT = { itemId: 'mount_nightmare_steed', minTier: 20, chance: 0.003 };
export function trialLevel(level) { return Math.max(20, Math.min(40, level | 0 || 20)); }
export function trialLevelScale(level) { return 1 + (trialLevel(level) - 20) * 0.05; }

// Themen: Gegnertypen von Thread B (§11.3); der letzte ist der Boss.
export const TRIAL_THEMES = {
  undead: { name: 'Gruft der Knochen', pool: ['skeleton', 'archer', 'spider'], elites: ['wolf_alpha'], bossId: 'bonelord', bossHp: 0.9 },
  tide: { name: 'Versunkene Hallen', pool: ['drowned', 'tide_cultist', 'temple_guardian'], elites: ['bandit_chief'], bossId: 'drowned_priestess', bossHp: 1 },
  ember: { name: 'Herz der Esse', pool: ['fire_imp', 'magma_hound', 'ash_golem', 'forge_golem', 'flame_acolyte', 'ember_drake'], elites: ['magma_behemoth', 'forge_warden'], bossId: 'ember_tyrant', bossHp: 1.1 },
};
export const TRIAL_AFFIXES = {
  burning_ground: 'Brennender Boden',
  hasty: 'Hast – Gegner sind schneller',
  armored: 'Gepanzert – Gegner halten mehr aus',
  volatile: 'Explosiv – Gegner zerplatzen beim Tod',
};

// Kleiner deterministischer Zufall aus einer Zahl
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Lebenspunkte des Prüfungsbosses auf Stufe 1, unabhängig vom Story-Boss (def.hp):
// Stufe 20 mit epischer Ausrüstung macht effektiv rund 250–300 Schaden/s → 30–40 s auf Stufe 1,
// ab Stufe ~4 im Zielbereich 40–60 s (mit Verstärkungen/Sets entsprechend höher).
export const TRIAL_BOSS_HP = 9000;

// Laufbeschreibung für Stufe `tier` (1…). B spawnt danach; C zählt Fortschritt und vergibt Belohnung.
export function trialSpec(tier, seed = 1, playerLevel = 20) {
  const lvl = trialLevel(playerLevel), scale = trialLevelScale(lvl);
  const t = Math.max(1, Math.min(TRIAL_MAX_TIER, tier | 0));
  const r = mulberry(seed * 7919 + t);
  const themeIds = Object.keys(TRIAL_THEMES);
  const themeId = themeIds[(seed + t) % themeIds.length];
  const theme = TRIAL_THEMES[themeId];
  const affixIds = Object.keys(TRIAL_AFFIXES);
  const affixes = [];
  const nAff = t >= 8 ? 2 : t >= 3 ? 1 : 0;
  while (affixes.length < nAff) { const a = affixIds[Math.floor(r() * affixIds.length)]; if (!affixes.includes(a)) affixes.push(a); }
  return {
    tier: t, seed, theme: themeId, name: theme.name, level: lvl,
    hpMult: Math.round((1 + 0.25 * (t - 1)) * 100) / 100,
    dmgMult: Math.round((1 + 0.12 * (t - 1)) * 100) / 100,
    pool: [...theme.pool], elites: [...theme.elites], eliteEvery: Math.max(6, 12 - Math.floor(t / 2)),
    target: 60, bossId: theme.bossId, timeLimit: 600, affixes,
    // Absolute Boss-Lebenspunkte (schon mit hpMult); B setzt b.maxHp = run.bossHp
    bossHp: Math.round(TRIAL_BOSS_HP * scale * (theme.bossHp ?? 1) * (1 + 0.25 * (t - 1)) / 100) * 100,
  };
}

// Belohnung (deterministisch aus rng). firstClear = Stufe zum ersten Mal geschafft.
// Episch 10 % + 2 %/Stufe (≤ 40 %), legendär 1 % + 0,5 %/Stufe (≤ 6 %) – Ausnahme von §11.5 nur fürs Endgame.
export function trialChances(tier) {
  return { epic: Math.min(0.4, 0.1 + 0.02 * tier), legendary: Math.min(0.06, 0.01 + 0.005 * tier) };
}
export function trialRewards(tier, { rng = Math.random, classId = null, firstClear = false, level = 20 } = {}) {
  const lvl = trialLevel(level);
  const gold = Math.round((150 + 60 * tier) * trialLevelScale(lvl));
  const shards = 3 + tier + (firstClear ? 5 : 0);
  const items = [{ itemId: 'ember_shard', qty: shards }, { itemId: potionFor(lvl), qty: 2 }];
  const { epic, legendary } = trialChances(tier);
  const pieces = tier >= 5 ? 2 : 1;
  for (let i = 0; i < pieces; i++) {
    const roll = rng();
    if (roll < legendary) {
      const all = lvl >= 38 ? [...LEGENDARIES, ...SOVEREIGN_LEGENDARIES] : LEGENDARIES;
      const fit = all.filter((id) => !ITEMS[id].classes || !classId || ITEMS[id].classes.includes(classId));
      const pool = fit.length ? fit : all;
      items.push({ itemId: pool[Math.floor(rng() * pool.length)], qty: 1 });
    } else {
      const id = pickEquipment({ level: lvl, rarity: roll < legendary + epic ? 'epic' : 'rare', classId, rng });
      if (id) items.push({ itemId: id, qty: 1 });
    }
  }
  if (tier >= TRIAL_MOUNT.minTier && ITEMS[TRIAL_MOUNT.itemId] && rng() < TRIAL_MOUNT.chance) items.push({ itemId: TRIAL_MOUNT.itemId, qty: 1 });
  return { gold, shards, items };
}
