// Lesende Abfragen auf die Slices von Thread C (progress, inventory, wallet, quests).
// Reine Funktionen ohne Seiteneffekte und ohne DOM – für HUD, Panels, Held, Welt (Questpfad)
// und später den Server. Schreiben geht nur über die Commands in logic.js.
import { LEVEL_CAP, xpToNext, totalXpForLevel } from './xp.js';
import { EQUIP_SLOTS, RARITIES, itemScore } from './items.js';
import { pickRewardGear } from './loot.js';

// --- Stufe / Erfahrung
// progress.xp ist die Gesamt-XP. into/need beziehen sich auf die aktuelle Stufe.
export function xpInfo(state) {
  const p = state.slices.progress;
  const base = totalXpForLevel(p.level);
  const need = xpToNext(p.level);
  const capped = p.level >= LEVEL_CAP;
  const into = p.xp - base;
  return { level: p.level, xp: p.xp, into, need: capped ? 0 : need, frac: capped ? 1 : Math.max(0, Math.min(1, into / need)), capped };
}

// --- Inventar
export function countItem(state, itemId) {
  let n = 0;
  for (const s of state.slices.inventory.slots) if (s?.itemId === itemId) n += s.qty;
  for (const e of state.slices.inventory.questBag ?? []) if (e.itemId === itemId) n += e.qty;
  n += state.slices.inventory.mats?.[itemId] ?? 0;
  return n;
}
// Inhalt des Materialbeutels, nach Stufe der Herkunft (Gegenstandsstufe/Wert) und Name sortiert
export function materialList(state, content) {
  return Object.entries(state.slices.inventory.mats ?? {})
    .map(([itemId, qty]) => ({ itemId, qty, def: content.find('item', itemId) }))
    .filter((e) => e.def && e.qty > 0)
    .sort((a, b) => (a.def.value ?? 0) - (b.def.value ?? 0) || a.def.name.localeCompare(b.def.name, 'de'));
}
export function freeSlots(state) { return state.slices.inventory.slots.filter((s) => !s).length; }

// Summe aller Ausrüstungsboni: { power, armor, maxHp, critChance, str, … }
export function equipmentBonus(state, content) {
  const out = {};
  const eq = state.slices.inventory?.equipment ?? {};
  for (const slot of EQUIP_SLOTS) {
    const def = eq[slot] ? content.find('item', eq[slot]) : null;
    for (const [k, v] of Object.entries(def?.stats ?? {})) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}

// Ist ein Item eine Verbesserung gegenüber dem Getragenen? (für den grünen Pfeil im Inventar)
export function isUpgrade(state, content, itemId) {
  const def = content.find('item', itemId);
  if (!def?.slot) return false;
  const cls = state.slices.character?.classId;
  if (def.classes && cls && !def.classes.includes(cls)) return false;
  if ((def.reqLevel ?? 1) > state.slices.progress.level) return false;
  const worn = state.slices.inventory.equipment[def.slot];
  return !worn || itemScore(def) > itemScore(content.find('item', worn)) + 0.5;
}

// Plunder: gewöhnliche Ausrüstung, die weder neu noch eine Verbesserung ist -> [slotIndex]
export function junkSlots(state, content) {
  const out = [];
  state.slices.inventory.slots.forEach((it, i) => {
    const d = it && content.find('item', it.itemId);
    if (d?.slot && d.rarity === 'common' && !it.n && !isUpgrade(state, content, it.itemId)) out.push(i);
  });
  return out;
}

// Schnellverkauf: Ausrüstung bis zur Seltenheit upTo ('common' | 'uncommon'), die keine Verbesserung ist
// (auch neue Teile). Nie Quest-/Verbrauchsgüter/Materialien.
export const SELL_TIERS = { common: 0, uncommon: 1 };
export function sellableSlots(state, content, upTo = 'common') {
  const max = SELL_TIERS[upTo] ?? 0, out = [];
  state.slices.inventory.slots.forEach((it, i) => {
    const d = it && content.find('item', it.itemId);
    if (d?.slot && d.value && RARITIES[d.rarity].order <= max && !isUpgrade(state, content, it.itemId)) out.push(i);
  });
  return out;
}
export function sellValue(state, content, slots) {
  return slots.reduce((g, i) => { const it = state.slices.inventory.slots[i]; const d = it && content.find('item', it.itemId); return g + (d && d.type !== 'quest' ? (d.value || 0) * it.qty : 0); }, 0);
}

// Bester Heiltrank (Taste H): kleinster, der reicht, sonst größter.
export function findPotionSlot(state, content, missingHp = Infinity) {
  let best = -1, bestHeal = 0, fit = -1, fitHeal = Infinity;
  state.slices.inventory.slots.forEach((s, i) => {
    const def = s && content.find('item', s.itemId);
    const heal = def?.type === 'consumable' ? def.use?.heal ?? 0 : 0;
    if (heal <= 0) return;
    if (heal > bestHeal) { best = i; bestHeal = heal; }
    if (heal >= missingHp && heal < fitHeal) { fit = i; fitHeal = heal; }
  });
  return fit >= 0 ? fit : best;
}
export function potionCount(state, content) {
  let n = 0;
  for (const s of state.slices.inventory.slots) {
    const def = s && content.find('item', s.itemId);
    if (def?.type === 'consumable' && def.use?.heal) n += s.qty;
  }
  return n;
}

// --- Quests
export function turnInOf(def) { return def.turnInNpc ?? def.turnIn ?? def.giver; }

// 'locked' | 'available' | 'active' | 'ready' | 'completed'
// Welche Questfunktionen die Welt kann (B meldet sie über game.progression.setWorldFeatures(['escort', 'defend'])).
export const WORLD_FEATURES = new Set();
export function setWorldFeatures(list) { WORLD_FEATURES.clear(); for (const f of list ?? []) WORLD_FEATURES.add(f); }

export function questStatus(state, content, questId) {
  const q = state.slices.quests;
  const a = q.active[questId];
  if (a) return a.status;
  const def = content.find('quest', questId);
  if (!def) return 'locked';
  if (!def.repeatable && q.completed.includes(questId)) return 'completed';
  if ((def.requires ?? []).some((r) => !q.completed.includes(r))) return 'locked';
  // Folgequest nur für eine bestimmte Entscheidung: requiresChoice = [questId, choiceId]
  if (def.requiresChoice && q.choices?.[def.requiresChoice[0]] !== def.requiresChoice[1]) return 'locked';
  // Quests mit Weltfunktionen (Eskorte, Verteidigen), die B noch nicht gemeldet hat, bleiben verborgen
  if (def.needs && !WORLD_FEATURES.has(def.needs)) return 'locked';
  if ((def.minLevel ?? 1) > state.slices.progress.level) return 'locked';
  return 'available';
}

// Quests, die ein NPC anbietet oder annimmt: [{ def, status }]
export function questsForNpc(state, content, npcId) {
  const out = [];
  for (const def of content.all('quest')) {
    const status = questStatus(state, content, def.id);
    if (status === 'available' && def.giver === npcId) out.push({ def, status });
    else if ((status === 'active' || status === 'ready') && (def.giver === npcId || turnInOf(def) === npcId)) out.push({ def, status });
  }
  const rank = { ready: 0, available: 1, active: 2 };
  return out.sort((a, b) => rank[a.status] - rank[b.status] || (b.def.main ? 1 : 0) - (a.def.main ? 1 : 0) || !!a.def.repeatable - !!b.def.repeatable || a.def.level - b.def.level);
}

// Markierung über einem NPC: 'ready' (goldenes ?), 'available' (!), 'repeatable' (blaues !), 'active' (graues ?) oder null.
export function npcMarker(state, content, npcId) {
  const list = questsForNpc(state, content, npcId);
  if (list.some((e) => e.status === 'ready' && turnInOf(e.def) === npcId)) return 'ready';
  if (list.some((e) => e.status === 'available' && !e.def.repeatable)) return 'available';
  if (list.some((e) => e.status === 'available')) return 'repeatable';
  if (list.some((e) => e.status === 'active')) return 'active';
  return null;
}

// Anzeigename eines NPCs: content 'npc' (Thread B), sonst die Texte von Thread C.
export function npcName(content, npcId) {
  const n = content.find('npc', npcId);
  if (n?.name) return n.title ? `${n.name}, ${n.title}` : n.name;
  return content.find('npcLine', npcId)?.name ?? npcId;
}
export function npcShortName(content, npcId) {
  return content.find('npc', npcId)?.name ?? content.find('npcLine', npcId)?.name ?? npcId;
}

// Daten für Quest-Tracker (HUD) und Questlog.
// [{ id, title, status, level, main, tracked, summary, hint, objectives: [{ id, text, current, count, done }] }]
export function trackedQuests(state, content) {
  const out = [];
  const tracked = trackedQuestId(state, content);
  for (const [id, a] of Object.entries(state.slices.quests.active)) {
    const def = content.find('quest', id);
    if (!def) continue;
    const objectives = def.objectives.map((o) => {
      const current = Math.min(o.count, a.progress[o.id] ?? 0);
      return { id: o.id, text: o.text, current, count: o.count, done: current >= o.count };
    });
    const hint = a.status === 'ready' ? `Abgeben bei ${npcShortName(content, turnInOf(def))}` : null;
    out.push({ id, title: def.title, status: a.status, level: def.level ?? 1, main: !!def.main, repeatable: !!def.repeatable, tracked: id === tracked, summary: def.summary, hint, objectives });
  }
  // Verfolgte zuerst, dann Hauptquests, dann nach Stufe
  return out.sort((a, b) => b.tracked - a.tracked || b.main - a.main || a.level - b.level);
}

// Verfolgte Quest: gewählte, sonst die erste aktive Hauptquest, sonst irgendeine aktive.
export function trackedQuestId(state, content) {
  const q = state.slices.quests;
  if (q.tracked && q.active[q.tracked]) return q.tracked;
  const ids = Object.keys(q.active);
  if (!ids.length) return null;
  const main = ids.filter((id) => content.find('quest', id)?.main);
  const pick = (main.length ? main : ids).sort((a, b) => (content.find('quest', a)?.level ?? 0) - (content.find('quest', b)?.level ?? 0));
  return pick[0];
}

// Ziel für den Questpfad (INTEGRATION.md §11.6):
// null | { questId, objectiveId, title, text, zoneId, kind, type, id, ids?, ready }
//   kind/type: 'npc' | 'area' | 'enemy' | 'object' | 'boss' | 'zone'
//   id: npcId | areaId | Gegnertyp | objectId | bossId | zoneId ; ids = alle Kandidaten (Gegnertypen, Objekte)
// Ohne verfolgte Quest: nächster NPC mit neuer Quest (Einstieg), sonst null.
export function questTarget(state, content) {
  const q = state.slices.quests;
  const questId = trackedQuestId(state, content);
  const npcZone = (npcId) => content.find('npc', npcId)?.zoneId ?? null;
  const mk = (o) => ({ ...o, type: o.kind });
  // Gewünschter Weg zu einem Questgeber (quest:guide) hat Vorrang
  const g = q.guide && content.find('quest', q.guide);
  if (g && questStatus(state, content, g.id) === 'available') {
    return mk({ questId: g.id, objectiveId: null, title: g.title, text: `Neue Quest bei ${npcShortName(content, g.giver)}`, zoneId: npcZone(g.giver), kind: 'npc', id: g.giver, ready: false, offer: true });
  }
  if (!questId) {
    const zoneId = state.slices.world?.zoneId;
    let best = null;
    for (const def of content.all('quest')) {
      if (questStatus(state, content, def.id) !== 'available') continue;
      const z = npcZone(def.giver);
      const score = (def.repeatable ? 1000 : 0) + (z === zoneId ? 0 : 100) + (def.main ? 0 : 10) + def.level;
      if (!best || score < best.score) best = { score, def, z };
    }
    if (!best) return null;
    return mk({ questId: best.def.id, objectiveId: null, title: best.def.title, text: `Neue Quest bei ${npcShortName(content, best.def.giver)}`, zoneId: best.z, kind: 'npc', id: best.def.giver, ready: false, offer: true });
  }
  const def = content.get('quest', questId);
  const a = q.active[questId];
  if (a.status === 'ready') {
    const npc = turnInOf(def);
    return mk({ questId, objectiveId: null, title: def.title, text: `Abgeben bei ${npcShortName(content, npc)}`, zoneId: npcZone(npc), kind: 'npc', id: npc, ready: true });
  }
  const o = def.objectives.find((x) => (a.progress[x.id] ?? 0) < x.count);
  if (!o) return null;
  const base = { questId, objectiveId: o.id, title: def.title, text: o.text, zoneId: o.zone ?? null, ready: false };
  const list = Array.isArray(o.target) ? o.target : [o.target];
  switch (o.kind) {
    case 'kill': return mk({ ...base, kind: 'enemy', id: list[0], ids: list });
    case 'collect': return mk({ ...base, kind: 'enemy', id: o.from?.[0] ?? null, ids: o.from ?? [], itemId: o.target });
    case 'boss': return mk({ ...base, kind: 'boss', id: o.target });
    case 'interact': {
      const seen = a.seen?.[o.id] ?? [];
      const open = list.filter((x) => !seen.includes(x));
      return mk({ ...base, kind: 'object', id: open[0] ?? list[0], ids: open });
    }
    case 'talk': return mk({ ...base, kind: 'npc', id: o.target, zoneId: o.zone ?? npcZone(o.target) });
    case 'reach': {
      // Zonenziel ('zone:<id>') hat Vorrang: B führt zum Portal dorthin. Sonst die Fläche in o.zone.
      const zoneT = list.find((x) => x.startsWith('zone:'));
      if (zoneT) return mk({ ...base, kind: 'zone', id: zoneT.slice(5), zoneId: zoneT.slice(5) });
      const seenA = a.seen?.[o.id] ?? [];
      const openA = list.filter((x) => !seenA.includes(x));
      return mk({ ...base, kind: 'area', id: openA[0] ?? list[0], ids: openA });
    }
    case 'use': {
      const seen = a.seen?.[o.id] ?? [];
      const open = list.filter((x) => !seen.includes(x));
      return mk({ ...base, kind: 'object', id: open[0] ?? list[0], ids: open, itemId: o.item ?? null });
    }
    // Reihenfolge: zum nächsten richtigen Objekt führen
    case 'sequence': return mk({ ...base, kind: 'object', id: list[Math.min(a.progress[o.id] ?? 0, list.length - 1)], ids: list });
    // Eskorte/Verteidigen: Startpunkt ist ein NPC oder Objekt (o.start = { kind: 'npc'|'object', id })
    case 'escort': case 'defend': return mk({ ...base, kind: o.start?.kind ?? 'object', id: o.start?.id ?? o.target });
    default: return null;
  }
}

// Belohnungsgegenstände einer Quest, inkl. aufgelöster Klassen-Ausrüstung (deterministisch).
export function questRewardItems(state, content, questId) {
  const def = content.find('quest', questId);
  if (!def) return [];
  const classId = state.slices.character?.classId ?? null;
  const out = [...(def.rewards?.items ?? [])];
  (def.rewards?.gear ?? []).forEach((spec, i) => {
    const id = pickRewardGear(spec, classId, i);
    if (id) out.push({ itemId: id, qty: 1 });
  });
  return out;
}

// Warenangebot eines Händlers: feste Waren + Ausrüstung (common/uncommon) der Stufenspanne.
export function vendorStock(content, vendorId) {
  const v = content.find('vendor', vendorId);
  if (!v) return [];
  if (v.gear === false) return [...(v.goods ?? [])];
  const [lo, hi] = v.levels ?? [1, 20];
  const gear = content.all('item')
    .filter((d) => d.slot && !d.source && (d.rarity === 'common' || d.rarity === 'uncommon') && d.ilvl >= lo && d.ilvl <= hi)
    .sort((a, b) => (a.slot === 'weapon' ? 0 : 1) - (b.slot === 'weapon' ? 0 : 1) || a.ilvl - b.ilvl || RARITIES[a.rarity].order - RARITIES[b.rarity].order);
  return [...(v.goods ?? []), ...gear.map((d) => d.id)];
}

// Gesprächszeile eines NPC nach Fortschritt: letzte Zeile aus NPC_LINES[npcId].lines, deren Quest abgeschlossen ist.
export function npcIdleLine(state, content, npcId) {
  const line = content.find('npcLine', npcId);
  const done = state.slices.quests?.completed ?? [];
  let text = line?.idle ?? null;
  for (const [questId, t] of line?.lines ?? []) if (!questId || done.includes(questId)) text = t;
  return text;
}

// Offene Ziele aller aktiven Quests für die Welt (B): Eskorte/Verteidigen starten, Objekte hervorheben.
// -> [{ questId, objectiveId, kind, target, start?, item?, done }]
export function openObjectives(state, content) {
  const out = [];
  for (const [questId, a] of Object.entries(state.slices.quests.active)) {
    const def = content.find('quest', questId);
    for (const o of def?.objectives ?? []) {
      out.push({ questId, objectiveId: o.id, kind: o.kind, target: o.target, start: o.start ?? null, item: o.item ?? null, zone: o.zone ?? null, done: (a.progress[o.id] ?? 0) >= o.count });
    }
  }
  return out;
}
