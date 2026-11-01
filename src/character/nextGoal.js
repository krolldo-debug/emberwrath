import { CLASSES, ABILITIES } from './classes.js';
import { PASSIVES, TALENT_TIERS } from './talents.js';

// Nächstes Ziel beim Stufenaufstieg (01.11.): Zwischen Stufe 9 und 12 kam nichts Neues, viele hörten dort auf.
// Das Stufen-Banner (ui/Hud.js) nennt statt „Deine Werte sind gestiegen“ die nächste Freischaltung.
// Ohne DOM, damit Tests es prüfen können.
export const RIDING_LEVEL = 20; // Reitunterricht bei Orla (q_first_ride, minLevel 20)

const RANK = { ability: 0, riding: 1, talents: 2, passive: 3 };

// Freischaltungen einer Klasse über `level`, früheste zuerst
export function upcoming(classId, level, { riding = false } = {}) {
  const out = [];
  for (const id of CLASSES[classId]?.abilities ?? []) {
    const a = ABILITIES[id];
    if (a?.level > level) out.push({ kind: 'ability', level: a.level, name: a.name });
  }
  for (const p of PASSIVES[classId] ?? []) if (p.level > level) out.push({ kind: 'passive', level: p.level, name: p.name });
  TALENT_TIERS.forEach((t, i) => { if (i > 0 && t.level > level) out.push({ kind: 'talents', level: t.level, name: t.name }); });
  if (!riding && RIDING_LEVEL > level) out.push({ kind: 'riding', level: RIDING_LEVEL, name: null });
  return out.sort((a, b) => a.level - b.level || RANK[a.kind] - RANK[b.kind]);
}

// Anzeigetext der nächsten Freischaltung oder null (je Art ein ganzer Satz, i18n/README.md)
export function nextGoalText(state) {
  const sl = state?.slices ?? {};
  const level = sl.progress?.level ?? 1;
  const riding = (sl.quests?.completed ?? []).includes('q_first_ride') || (sl.character?.mounts?.owned?.length ?? 0) > 0;
  const n = upcoming(sl.character?.classId, level, { riding })[0];
  if (!n) return null;
  switch (n.kind) {
    case 'ability': return `Als Nächstes auf Stufe ${n.level}: Fähigkeit ${n.name}`;
    case 'passive': return `Als Nächstes auf Stufe ${n.level}: Passive ${n.name}`;
    case 'talents': return `Als Nächstes auf Stufe ${n.level}: Talentreihe ${n.name}`;
    default: return `Als Nächstes auf Stufe ${n.level}: eigenes Reittier`;
  }
}
