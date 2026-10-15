import { deriveStats } from '../character/stats.js';
import { CLASSES, ABILITIES } from '../character/classes.js';
import { RACES } from '../character/races.js';
import { TALENTS } from '../character/talents.js';
import { ARENA_LEVEL, pvpDamage } from './rules.js';

// Werte in der Arena (Client und Arena-Server rechnen dasselbe): Stufe 40, alle Talente, Arena-Rüstung der Klasse.
// Ausrüstung und echte Stufe zählen nicht; Volk und Klasse schon. Der Server prüft damit Treffer und rechnet Leben.
//
// Arena-Rüstung: entspricht einem seltenen bis epischen Satz der Stufen 36–40 (Mittel der passenden Gegenstände).
// Bewusst fest eingetragen, damit neue Beute die Arena nicht verschiebt.
export const ARENA_GEAR = {
  warrior: { power: 72, str: 46, agi: 37, int: 35, vit: 75, maxHp: 205, armor: 149, critChance: 0.02, maxResource: 21 },
  rogue: { power: 69, str: 42, agi: 45, int: 36, vit: 71, maxHp: 185, armor: 146, critChance: 0.04, maxResource: 21 },
  ranger: { power: 73, str: 36, agi: 49, int: 37, vit: 73, maxHp: 177, armor: 146, critChance: 0.04, maxResource: 21 },
  mage: { power: 71, str: 34, agi: 37, int: 52, vit: 71, maxHp: 177, armor: 146, critChance: 0.024, maxResource: 85 },
};

// Inhalte ohne Spiel-Registry (Server): dieselben Daten, die character/index.js registriert
const CONTENT = {
  find(kind, id) {
    const src = kind === 'race' ? RACES : kind === 'class' ? CLASSES : null;
    return src && Object.hasOwn(src, id) ? { ...src[id], id } : null;
  },
  get(kind, id) { return this.find(kind, id); },
};

export const arenaClass = (id) => (Object.hasOwn(CLASSES, id) ? id : 'warrior');
export const arenaRace = (id) => (Object.hasOwn(RACES, id) ? id : 'human');

// Alle Talente auf höchstem Rang (cleanTalents in deriveStats kürzt auf die Punkte der Stufe 40)
function allTalents(classId) {
  const out = {};
  for (const [id, def] of Object.entries(TALENTS[classId] ?? {})) out[id] = def.max;
  return out;
}

const cache = new Map();
export function arenaStats(classId, raceId) {
  const c = arenaClass(classId), r = arenaRace(raceId);
  const key = `${c}|${r}`;
  let s = cache.get(key);
  if (!s) {
    s = deriveStats({ raceId: r, classId: c, level: ARENA_LEVEL, equipment: null, bonus: ARENA_GEAR[c], talents: allTalents(c) }, CONTENT);
    cache.set(key, s);
  }
  return s;
}

// Größter Faktor eines einzelnen Treffers (Grundangriff oder Fähigkeit inkl. Talentbonus), für die Prüfung auf dem Server
export function maxHitMult(stats) {
  const cls = CLASSES[stats.classId];
  let m = 0;
  const b = cls.basic;
  if (b.kind === 'melee') for (const c of b.combo) m = Math.max(m, c.mult);
  else m = Math.max(m, b.shot.mult * (1 + (b.shot.early?.pct ?? 0)));
  for (const id of cls.abilities) {
    const a = ABILITIES[id];
    if (!a?.mult) continue;
    m = Math.max(m, a.mult * stats.abilityPower * (1 + (stats.abilityMods?.[id] ?? 0)));
  }
  if (stats.passives?.shadow_dance) m *= 1.6; // Schattentanz: nächster Angriff nach dem Ausweichen
  return m;
}

// Obergrenze für den Grundschaden eines Treffers, wie ihn der Client meldet (vor Krit, nach pvpDamage, mit Streuung)
export function maxHitDamage(stats) {
  return stats.power * maxHitMult(stats) * pvpDamage(stats.classId) * 1.12 * 1.05;
}
