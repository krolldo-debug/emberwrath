// Spiellogik von Thread C: Slices und Commands für Erfahrung, Inventar, Gold,
// Quests, Beute, Händler und Schmiede. Ohne DOM, damit sie in Node getestet und später
// auf einem Server ausgeführt werden kann.
//
// Alles, was Belohnung oder Fortschritt ist, ist `authoritative` (XP, Gold, Beute,
// Quest-Abschluss, Kauf/Verkauf, Verbrauch, Herstellen). Ein späterer ServerAuthority
// berechnet diese Commands selbst; der Client schickt dann nur noch die Absicht.
import { EV } from '../core/events.js';
import { LEVEL_CAP, totalXpForLevel, killXp, mobXp } from './xp.js';
import { ITEMS, EQUIP_SLOTS, RARITIES, stackSize, buyPrice, equipSlotFor, canUseClass, itemScore } from './items.js';
import { QUESTS, NPC_LINES, VENDORS } from './quests.js';
import { rollLoot, BOSS_QUEST_GRANTS } from './loot.js';
import { RECIPES } from './crafting.js';
import { countItem, npcShortName, questStatus, questRewardItems, vendorStock, trackedQuestId, junkSlots, isUpgrade, sellableSlots, SELL_TIERS } from './selectors.js';
import { ACHIEVEMENTS } from './achievements.js';
import { ENCHANTS } from './smithing.js';
import { RARE_ENEMIES, RARE_XP_MULT } from './rares.js';
import { registerEndgameState, checkAchievements, trialKill, recomputeBonus } from './endgame.js';

export const BAG_SIZE = 36;
const START_ITEMS = [{ itemId: 'minor_potion', qty: 5 }, { itemId: 'hearth_bread', qty: 3 }];
// Startausrüstung je Klasse (common), damit die Figur von Anfang an Waffe und Rüstung zeigt.
export const STARTER_GEAR = {
  warrior: { weapon: 'notched_blade', chest: 'recruit_mail' },
  rogue: { weapon: 'rusty_dagger', chest: 'padded_vest' },
  ranger: { weapon: 'short_bow', chest: 'padded_vest' },
  mage: { weapon: 'ashwood_staff', chest: 'novice_robe' },
};

// Inhalte registrieren (Items, Quests, Händler, Rezepte). NPC-Namen legt Thread B als content 'npc' an;
// NPC_LINES dient als Rückfall für Namen und Grußtexte.
export function registerProgressionContent(content) {
  content.defineAll('item', ITEMS);
  content.defineAll('quest', QUESTS);
  content.defineAll('vendor', VENDORS);
  content.defineAll('recipe', RECIPES);
  content.defineAll('achievement', ACHIEVEMENTS);
  for (const [id, line] of Object.entries(NPC_LINES)) content.define('npcLine', id, line);
}

// --- Hilfen (nur innerhalb von Command-Handlern verwenden)
function bag(s) { return s.get('inventory').slots; }

// Questbeutel: Questgegenstände und Sammelobjekte aktiver Quests, die nicht mehr in die Tasche passen.
// Er hat keine Größe, zählt bei countItem mit und wird geleert, sobald in der Tasche Platz ist (settleQuestBag).
function questBagFor(s, content, itemId) {
  const def = content.find('item', itemId);
  if (!def) return false;
  if (def.type === 'quest') return true;
  const q = s.get('quests');
  return Object.keys(q.active).some((id) => content.find('quest', id)?.objectives.some((o) => o.kind === 'collect' && o.target === itemId && countItem(s, itemId) < o.count));
}
function settleQuestBag(s, content) {
  const inv = s.get('inventory');
  if (!inv.questBag?.length) return;
  for (const e of inv.questBag) {
    const max = stackSize(content.get('item', e.itemId));
    for (const slot of inv.slots) if (e.qty > 0 && slot?.itemId === e.itemId && slot.qty < max) { const k = Math.min(e.qty, max - slot.qty); slot.qty += k; e.qty -= k; }
    for (let i = 0; i < inv.slots.length && e.qty > 0; i++) if (!inv.slots[i]) { const k = Math.min(e.qty, max); inv.slots[i] = { itemId: e.itemId, qty: k, n: true }; e.qty -= k; }
  }
  inv.questBag = inv.questBag.filter((e) => e.qty > 0);
}

function capacityFor(s, content, itemId) {
  if (questBagFor(s, content, itemId)) return Infinity;
  const max = stackSize(content.get('item', itemId));
  let n = 0;
  for (const slot of bag(s)) {
    if (!slot) n += max;
    else if (slot.itemId === itemId) n += max - slot.qty;
  }
  return n;
}

// Passen alle Items (mit Stapeln) gleichzeitig hinein?
function fitsAll(s, content, items, removeFirst = []) {
  const slots = bag(s).map((sl) => (sl ? { ...sl } : null));
  for (const { itemId, qty } of removeFirst) {
    let left = qty;
    for (let i = slots.length - 1; i >= 0 && left > 0; i--) {
      if (slots[i]?.itemId !== itemId) continue;
      const k = Math.min(left, slots[i].qty); slots[i].qty -= k; left -= k;
      if (slots[i].qty <= 0) slots[i] = null;
    }
  }
  for (const { itemId, qty } of items) {
    const max = stackSize(content.get('item', itemId));
    let left = qty;
    for (const sl of slots) if (left > 0 && sl?.itemId === itemId && sl.qty < max) { const k = Math.min(left, max - sl.qty); sl.qty += k; left -= k; }
    for (let i = 0; i < slots.length && left > 0; i++) if (!slots[i]) { const k = Math.min(left, max); slots[i] = { itemId, qty: k }; left -= k; }
    if (left > 0) return false;
  }
  return true;
}

// overflow: was nicht passt, kommt in den Questbeutel (Questbelohnungen – die Abgabe klappt immer)
function addItem(s, ctx, itemId, qty, source, { overflow = false } = {}) {
  const max = stackSize(ctx.content.get('item', itemId));
  const slots = bag(s);
  let left = qty;
  for (const slot of slots) {
    if (left <= 0) break;
    if (slot && slot.itemId === itemId && slot.qty < max) { const k = Math.min(left, max - slot.qty); slot.qty += k; left -= k; }
  }
  for (let i = 0; i < slots.length && left > 0; i++) {
    if (!slots[i]) { const k = Math.min(left, max); slots[i] = { itemId, qty: k, n: true }; left -= k; }
  }
  if (left > 0 && (overflow || questBagFor(s, ctx.content, itemId))) {
    const inv = s.get('inventory');
    inv.questBag ??= [];
    const e = inv.questBag.find((x) => x.itemId === itemId);
    if (e) e.qty += left; else inv.questBag.push({ itemId, qty: left });
    left = 0;
  }
  const added = qty - left;
  if (added > 0) {
    const st = s.get('progress').stats;
    if (source === 'loot' || source === 'quest' || source === 'trial') st.itemsLooted += added;
    const rar = ctx.content.get('item', itemId).rarity;
    if (['loot', 'quest', 'trial', 'craft'].includes(source) && (rar === 'epic' || rar === 'legendary') && ctx.content.get('item', itemId).slot) st[`${rar}Found`] = (st[`${rar}Found`] ?? 0) + added;
    ctx.bus.emit(EV.ITEM_ADDED, { itemId, qty: added, source });
    refreshQuests(s, ctx);
  }
  return added;
}

function removeItem(s, ctx, itemId, qty) {
  const slots = bag(s);
  let left = qty;
  const qb = s.get('inventory').questBag ?? [];
  for (const e of qb) if (e.itemId === itemId && left > 0) { const k = Math.min(left, e.qty); e.qty -= k; left -= k; }
  if (qb.length) s.get('inventory').questBag = qb.filter((e) => e.qty > 0);
  for (let i = slots.length - 1; i >= 0 && left > 0; i--) {
    const slot = slots[i];
    if (slot?.itemId !== itemId) continue;
    const k = Math.min(left, slot.qty);
    slot.qty -= k; left -= k;
    if (slot.qty <= 0) slots[i] = null;
  }
  const removed = qty - left;
  if (removed > 0) { ctx.bus.emit(EV.ITEM_REMOVED, { itemId, qty: removed }); refreshQuests(s, ctx); }
  return removed;
}

function takeFromSlot(s, ctx, index, qty) {
  const slot = bag(s)[index];
  if (!slot) return null;
  const k = Math.min(qty, slot.qty);
  slot.qty -= k;
  if (slot.qty <= 0) bag(s)[index] = null;
  ctx.bus.emit(EV.ITEM_REMOVED, { itemId: slot.itemId, qty: k });
  refreshQuests(s, ctx);
  return { itemId: slot.itemId, qty: k };
}

function addGold(s, ctx, delta, source) {
  const w = s.get('wallet');
  w.gold = Math.max(0, w.gold + delta);
  if (delta > 0) s.get('progress').stats.goldEarned += delta;
  ctx.bus.emit(EV.GOLD_CHANGED, { delta, total: w.gold, source });
}

function grantXp(s, ctx, amount, source) {
  const p = s.get('progress');
  if (amount <= 0 || p.level >= LEVEL_CAP) return 0;
  p.xp += amount;
  ctx.bus.emit(EV.XP_GAINED, { amount, total: p.xp, source });
  while (p.level < LEVEL_CAP && p.xp >= totalXpForLevel(p.level + 1)) {
    p.level++;
    p.xpNext = totalXpForLevel(Math.min(LEVEL_CAP, p.level + 1));
    ctx.bus.emit(EV.LEVEL_UP, { level: p.level });
  }
  if (p.level >= LEVEL_CAP) { p.xp = totalXpForLevel(LEVEL_CAP); p.xpNext = p.xp; }
  return amount;
}

function setTracked(s, ctx, questId) {
  const q = s.get('quests');
  if (q.tracked === questId) return;
  q.tracked = questId;
  ctx.bus.emit(EV.QUEST_TRACKED ?? 'quest:tracked', { questId });
}

// Ziele neu bewerten, die sich aus dem Zustand ergeben (Sammeln, Boss), und
// zwischen 'active' und 'ready' umschalten.
function refreshQuests(s, ctx) {
  const q = s.get('quests');
  for (const [questId, a] of Object.entries(q.active)) {
    const def = ctx.content.find('quest', questId);
    if (!def) continue;
    for (const o of def.objectives) {
      let v = a.progress[o.id] ?? 0;
      if (o.kind === 'collect') v = Math.min(o.count, countItem(s, o.target));
      else if (o.kind === 'boss' && (s.slices.world?.bossesDefeated ?? []).includes(o.target) && a.bossSeen) v = o.count;
      setProgress(ctx, questId, a, o, v);
    }
    const done = def.objectives.every((o) => (a.progress[o.id] ?? 0) >= o.count);
    if (done && a.status === 'active') { a.status = 'ready'; ctx.bus.emit(EV.QUEST_READY, { questId }); }
    else if (!done && a.status === 'ready') a.status = 'active';
  }
}

function setProgress(ctx, questId, a, o, value) {
  const v = Math.max(0, Math.min(o.count, value));
  if ((a.progress[o.id] ?? 0) === v) return;
  a.progress[o.id] = v;
  ctx.bus.emit(EV.QUEST_PROGRESS, { questId, objectiveId: o.id, current: v, required: o.count });
}

function matches(target, value) { return Array.isArray(target) ? target.includes(value) : target === value || target === '*'; }

// Zählbare Ereignisse (kill, reach, boss, interact, talk) auf alle aktiven Quests anwenden.
function recordQuestEvent(s, ctx, kind, target, n = 1) {
  const q = s.get('quests');
  for (const [questId, a] of Object.entries(q.active)) {
    const def = ctx.content.find('quest', questId);
    for (const o of def?.objectives ?? []) {
      if (o.kind !== kind || !matches(o.target, target)) continue;
      if (kind === 'interact') {
        // Jedes Objekt zählt nur einmal
        a.seen ??= {};
        const seen = (a.seen[o.id] ??= []);
        if (seen.includes(target)) continue;
        seen.push(target);
      }
      if (kind === 'boss') a.bossSeen = true;
      setProgress(ctx, questId, a, o, (a.progress[o.id] ?? 0) + n);
    }
  }
  refreshQuests(s, ctx);
}

function questNeed(s, ctx) {
  return (questId, itemId) => {
    const q = s.get('quests');
    const ids = questId ? [questId] : Object.keys(q.active);
    let need = 0;
    for (const id of ids) {
      if (!q.active[id]) continue;
      const o = ctx.content.find('quest', id)?.objectives.find((x) => x.kind === 'collect' && x.target === itemId);
      if (o) need = Math.max(need, o.count - countItem(s, itemId));
    }
    return need;
  };
}

// Alte Spielstände: armor/trinket -> neue Plätze; nicht passende Teile zurück in die Tasche.
function migrateEquipment(raw, slots) {
  const eq = Object.fromEntries(EQUIP_SLOTS.map((k) => [k, null]));
  const leftovers = [];
  for (const [k, id] of Object.entries(raw ?? {})) {
    const def = id && ITEMS[id];
    if (!def) continue;
    const target = def.slot;
    if (target && (k === target || k === 'armor' || k === 'trinket' || k === 'weapon') && !eq[target]) eq[target] = id;
    else leftovers.push(id);
  }
  for (const id of leftovers) { const i = slots.indexOf(null); if (i >= 0) slots[i] = { itemId: id, qty: 1 }; }
  return eq;
}

// --- Registrierung
export function registerProgressionState(state, { rng = Math.random } = {}) {
  const emptyStats = () => ({ kills: 0, bossKills: 0, eliteKills: 0, questsCompleted: 0, goldEarned: 0, itemsLooted: 0, crafted: 0, epicFound: 0, legendaryFound: 0, byType: {} });

  state.defineSlice('progress', {
    create: () => ({ level: 1, xp: 0, xpNext: totalXpForLevel(2), stats: emptyStats() }),
    deserialize: (raw) => {
      const level = Math.max(1, Math.min(LEVEL_CAP, raw.level | 0 || 1));
      const xp = Math.max(totalXpForLevel(level), raw.xp | 0);
      return { level, xp, xpNext: totalXpForLevel(Math.min(LEVEL_CAP, level + 1)), stats: { ...emptyStats(), ...raw.stats } };
    },
  });

  state.defineSlice('inventory', {
    create: () => {
      const slots = Array(BAG_SIZE).fill(null);
      START_ITEMS.forEach((it, i) => { slots[i] = { ...it }; });
      // Die Charakter-Slice (Thread A) ist bei reset() schon neu angelegt (A wird vor C installiert).
      const starter = STARTER_GEAR[state.slices.character?.classId] ?? {};
      const inv = { slots, equipment: Object.fromEntries(EQUIP_SLOTS.map((k) => [k, starter[k] ?? null])), upgrades: {}, enchants: {}, questBag: [], autoSell: null };
      recomputeBonus(inv);
      return inv;
    },
    // Unbekannte Items werden beim Laden verworfen, alte Ausrüstungsplätze migriert, Tasche auf 36 erweitert.
    deserialize: (raw) => {
      const known = (id) => id && Object.hasOwn(ITEMS, id);
      const slots = Array(BAG_SIZE).fill(null);
      let i = 0;
      for (const sl of raw.slots ?? []) {
        if (i >= BAG_SIZE) break;
        if (sl && known(sl.itemId) && sl.qty > 0) slots[i] = { itemId: sl.itemId, qty: Math.min(sl.qty | 0, stackSize(ITEMS[sl.itemId])), ...(sl.n ? { n: true } : {}) };
        i++;
      }
      const upgrades = {}, enchants = {};
      for (const k of EQUIP_SLOTS) {
        const u = raw.upgrades?.[k] | 0;
        if (u > 0) upgrades[k] = Math.min(10, u);
        if (raw.enchants?.[k]) enchants[k] = raw.enchants[k];
      }
      const questBag = (raw.questBag ?? []).filter((e) => known(e?.itemId) && e.qty > 0).map((e) => ({ itemId: e.itemId, qty: e.qty | 0 }));
      const inv = { slots, equipment: migrateEquipment(raw.equipment, slots), upgrades, enchants, questBag, autoSell: Object.hasOwn(SELL_TIERS, raw.autoSell ?? '') ? raw.autoSell : null };
      for (const k of Object.keys(enchants)) if (!ENCHANTS[enchants[k]]?.slots.includes(k)) delete enchants[k];
      recomputeBonus(inv);
      return inv;
    },
  });

  state.defineSlice('wallet', { create: () => ({ gold: 0 }), deserialize: (raw) => ({ gold: Math.max(0, raw.gold | 0) }) });

  state.defineSlice('quests', {
    create: () => ({ active: {}, completed: [], repeats: {}, tracked: null, guide: null }),
    deserialize: (raw) => {
      const active = {};
      for (const [id, a] of Object.entries(raw.active ?? {})) {
        if (!Object.hasOwn(QUESTS, id)) continue;
        active[id] = { status: a.status === 'ready' ? 'ready' : 'active', progress: { ...a.progress }, ...(a.seen ? { seen: a.seen } : {}), ...(a.bossSeen ? { bossSeen: true } : {}) };
      }
      const completed = (raw.completed ?? []).filter((id) => Object.hasOwn(QUESTS, id));
      return { active, completed, repeats: { ...raw.repeats }, tracked: active[raw.tracked] ? raw.tracked : null, guide: Object.hasOwn(QUESTS, raw.guide ?? '') ? raw.guide : null };
    },
  });

  // Seltene Weltgegner (rares.js): letzter Kill (ms) und Anzahl je Gegner
  state.defineSlice('rares', {
    create: () => ({ killedAt: {}, kills: {} }),
    deserialize: (raw) => {
      const pick = (o) => Object.fromEntries(Object.entries(o ?? {}).filter(([id, v]) => Object.hasOwn(RARE_ENEMIES, id) && Number.isFinite(v)));
      return { killedAt: pick(raw.killedAt), kills: pick(raw.kills) };
    },
  });

  const auth = { authoritative: true };
  // Nach jedem Command: Erfolge prüfen (günstig: ~30 Zahlenvergleiche)
  const def = (type, fn, opts) => state.defineCommand(type, (s, p, ctx) => {
    const r = fn(s, p, ctx);
    settleQuestBag(s, ctx.content);
    checkAchievements(s, ctx);
    return r;
  }, opts);
  // Hilfen für endgame.js (Bank, Schmiede, Glutprüfungen)
  const helpers = { def, rng, bag, addItem, removeItem, takeFromSlot, addGold, fitsAll, capacityFor };

  // --- Erfahrung
  def('progress:grantXp', (s, { amount, source }, ctx) => grantXp(s, ctx, amount | 0, source), auth);

  // Ein besiegter Gegner: XP (nach Stufe/Elite/Boss), Statistik, Quest-Fortschritt.
  // summoned: beschworene Diener (Boss-Adds) geben nur 20 % Erfahrung, zählen aber für Quests.
  // rareId: seltener Weltgegner (rares.js) – ×8 Erfahrung, Wiederkehr ab `now` (ms)
  def('progress:kill', (s, { type, level, isBoss, bossId, elite, summoned, trialTime, rareId, now = 0 }, ctx) => {
    const p = s.get('progress');
    const enemy = ctx.content.find('enemy', type);
    const lvl = level ?? enemy?.level ?? p.level;
    const isElite = elite ?? enemy?.elite ?? false;
    const boss = isBoss ?? enemy?.boss ?? false;
    p.stats.kills++;
    p.stats.byType[type] = (p.stats.byType[type] ?? 0) + 1;
    if (boss) p.stats.bossKills++;
    if (isElite) p.stats.eliteKills++;
    const rare = !boss && !summoned && Object.hasOwn(RARE_ENEMIES, rareId ?? '') ? rareId : null;
    if (rare) {
      const r = s.get('rares');
      r.kills[rare] = (r.kills[rare] ?? 0) + 1;
      r.killedAt[rare] = now;
      ctx.bus.emit('rare:killed', { rareId: rare, name: RARE_ENEMIES[rare].name });
    }
    const base = rare ? mobXp(lvl) * RARE_XP_MULT : mobXp(lvl, { elite: isElite, boss }) * (summoned ? 0.2 : 1);
    const gained = grantXp(s, ctx, killXp(base, lvl, p.level), `kill:${type}`);
    recordQuestEvent(s, ctx, 'kill', type);
    trialKill(s, ctx, { type, elite: isElite, isBoss: boss, bossId: bossId ?? enemy?.bossId ?? (boss ? type : undefined), trialTime }, helpers);
    if (boss) recordQuestEvent(s, ctx, 'boss', bossId ?? enemy?.bossId ?? type);
    return { xp: gained };
  }, auth);

  // Erreichte Fläche / betretene Zone / besiegter Boss / benutztes Objekt / Gespräch -> Quest-Fortschritt
  def('quest:event', (s, { kind, target }, ctx) => recordQuestEvent(s, ctx, kind, target), auth);
  // Boss besiegt: Questgegenstand direkt vergeben, wenn die Quest ihn noch braucht (z. B. Flammenkrone des Aschenfürsten)
  def('quest:bossReward', (s, { bossId }, ctx) => {
    const got = [];
    for (const [questId, itemId] of BOSS_QUEST_GRANTS[bossId] ?? []) {
      const q = s.get('quests').active[questId];
      const need = ctx.content.find('quest', questId)?.objectives.find((o) => o.kind === 'collect' && o.target === itemId)?.count ?? 1;
      if (!q || countItem(s, itemId) >= need) continue;
      addItem(s, ctx, itemId, need - countItem(s, itemId), 'boss', { overflow: true });
      got.push(itemId);
    }
    return { ok: got.length > 0, items: got };
  }, auth);

  // --- Quests
  def('quest:accept', (s, { questId }, ctx) => {
    if (questStatus(s, ctx.content, questId) !== 'available') return { ok: false, reason: 'unavailable' };
    const a = { status: 'active', progress: {} };
    s.get('quests').active[questId] = a;
    const quest = ctx.content.get('quest', questId);
    // 'reach'-Ziele, die schon erfüllt sind (man steht bereits in der Zielzone)
    const zoneId = s.slices.world?.zoneId;
    for (const o of quest.objectives) {
      if (o.kind === 'reach' && zoneId && matches(o.target, `zone:${zoneId}`)) a.progress[o.id] = o.count;
    }
    // Boss schon besiegt (z. B. vor Annahme): zählt rückwirkend
    if ((s.slices.world?.bossesDefeated ?? []).some((b) => quest.objectives.some((o) => o.kind === 'boss' && o.target === b))) a.bossSeen = true;
    ctx.bus.emit(EV.QUEST_ACCEPTED, { questId });
    if (s.get('quests').guide === questId) s.get('quests').guide = null;
    // Neue Hauptquests oder erste Quest automatisch verfolgen
    const tracked = s.get('quests').tracked;
    if (!tracked || !s.get('quests').active[tracked] || (quest.main && !ctx.content.find('quest', tracked)?.main)) setTracked(s, ctx, questId);
    refreshQuests(s, ctx);
    return { ok: true };
  });

  def('quest:track', (s, { questId }, ctx) => {
    if (questId && !s.get('quests').active[questId]) return { ok: false };
    s.get('quests').guide = null;
    setTracked(s, ctx, questId ?? null);
    return { ok: true };
  });

  // Questpfad zu einem Questgeber (verfügbare Quest, z. B. Neben- oder Kopfgeldquest). null = aus.
  def('quest:guide', (s, { questId }, ctx) => {
    if (questId && questStatus(s, ctx.content, questId) !== 'available') return { ok: false };
    s.get('quests').guide = questId ?? null;
    ctx.bus.emit(EV.QUEST_TRACKED ?? 'quest:tracked', { questId: questId ?? s.get('quests').tracked, guide: true });
    return { ok: true };
  });

  def('quest:abandon', (s, { questId }, ctx) => {
    const q = s.get('quests');
    if (!q.active[questId]) return { ok: false };
    delete q.active[questId];
    if (q.tracked === questId) setTracked(s, ctx, trackedQuestId(s, ctx.content));
    return { ok: true };
  });

  def('quest:turnIn', (s, { questId }, ctx) => {
    const q = s.get('quests');
    const a = q.active[questId];
    if (!a || a.status !== 'ready') return { ok: false, reason: 'notReady' };
    const quest = ctx.content.get('quest', questId);
    const rewards = quest.rewards ?? {};
    const collect = quest.objectives.filter((o) => o.kind === 'collect').map((o) => ({ itemId: o.target, qty: o.count }));
    const items = questRewardItems(s, ctx.content, questId);

    const availBefore = new Set(ctx.content.all('quest').filter((x) => questStatus(s, ctx.content, x.id) === 'available').map((x) => x.id));
    delete q.active[questId];
    if (quest.repeatable) q.repeats[questId] = (q.repeats[questId] ?? 0) + 1;
    else q.completed.push(questId);
    if (!q.completed.includes(questId) && quest.repeatable && !q.completed.includes(questId)) { /* wiederholbar: nie „abgeschlossen“ */ }
    for (const c of collect) removeItem(s, ctx, c.itemId, c.qty);
    if (rewards.gold) addGold(s, ctx, rewards.gold, `quest:${questId}`);
    // Volle Tasche: Belohnung geht in den Questbeutel und wandert zurück, sobald Platz ist
    const before = (s.get('inventory').questBag ?? []).reduce((n, e) => n + e.qty, 0);
    for (const it of items) addItem(s, ctx, it.itemId, it.qty ?? 1, 'quest', { overflow: true });
    const overflow = (s.get('inventory').questBag ?? []).reduce((n, e) => n + e.qty, 0) - before;
    if (overflow > 0) ctx.bus.emit(EV.UI_TOAST, { text: 'Tasche voll – die Belohnung liegt im Questbeutel (Inventar)', kind: 'warn', icon: 'bag' });
    s.get('progress').stats.questsCompleted++;
    if (q.tracked === questId) setTracked(s, ctx, trackedQuestId(s, ctx.content));
    ctx.bus.emit(EV.QUEST_COMPLETED, { questId, rewards: { ...rewards, items } });
    if (rewards.xp) grantXp(s, ctx, rewards.xp, `quest:${questId}`);
    // reachLevel: das Ende der Geschichte hebt garantiert auf diese Stufe (Glutprüfungen ab 20)
    if (rewards.reachLevel && s.get('progress').level < rewards.reachLevel) grantXp(s, ctx, totalXpForLevel(rewards.reachLevel) - s.get('progress').xp, `quest:${questId}`);
    refreshQuests(s, ctx);
    // Neu freigeschaltete Quests ansagen (Nebenquests und Kopfgelder sollen auffallen)
    if (!quest.repeatable) {
      const fresh = ctx.content.all('quest').filter((x) => !availBefore.has(x.id) && questStatus(s, ctx.content, x.id) === 'available');
      for (const x of fresh.slice(0, 3)) ctx.bus.emit(EV.UI_TOAST, { text: `Neue ${x.repeatable ? 'Kopfgeldquest' : x.main ? 'Quest' : 'Nebenquest'}: ${x.title} – ${npcShortName(ctx.content, x.giver)}`, kind: 'quest', icon: x.repeatable ? 'letter' : 'scroll' });
    }
    return { ok: true, rewards: { ...rewards, items }, overflow };
  }, auth);

  // --- Inventar
  def('inventory:add', (s, { itemId, qty = 1, source = 'debug' }, ctx) => ({ added: addItem(s, ctx, itemId, qty, source) }), auth);
  def('inventory:remove', (s, { itemId, qty = 1 }, ctx) => ({ removed: removeItem(s, ctx, itemId, qty) }), auth);

  // Umsortieren / Stapeln (kein Fortschritt, daher nicht authoritative)
  def('inventory:move', (s, { from, to }, ctx) => {
    const slots = bag(s);
    if (from === to || !slots[from] || to < 0 || to >= slots.length) return { ok: false };
    const a = slots[from], b = slots[to];
    if (b && b.itemId === a.itemId) {
      const max = stackSize(ctx.content.get('item', a.itemId));
      const k = Math.min(a.qty, max - b.qty);
      b.qty += k; a.qty -= k;
      if (a.qty <= 0) slots[from] = null;
    } else { slots[to] = a; slots[from] = b; }
    return { ok: true };
  });

  // Sortieren: Ausrüstung (Slot, dann Stärke), Verbrauch, Material, Quest; Stapel zusammenführen.
  def('inventory:sort', (s, _p, ctx) => {
    const inv = s.get('inventory');
    const merged = new Map();
    const singles = [];
    for (const sl of inv.slots) {
      if (!sl) continue;
      const d = ctx.content.get('item', sl.itemId);
      if (stackSize(d) > 1) merged.set(sl.itemId, (merged.get(sl.itemId) ?? 0) + sl.qty);
      else singles.push({ ...sl });
    }
    const items = [...singles];
    for (const [itemId, qty] of merged) {
      const max = stackSize(ctx.content.get('item', itemId));
      for (let left = qty; left > 0; left -= max) items.push({ itemId, qty: Math.min(max, left) });
    }
    const typeRank = { weapon: 0, armor: 1, jewelry: 2, consumable: 3, material: 4, quest: 5 };
    const slotRank = Object.fromEntries(EQUIP_SLOTS.map((k, i) => [k, i]));
    items.sort((a, b) => {
      const da = ctx.content.get('item', a.itemId), db = ctx.content.get('item', b.itemId);
      return (typeRank[da.type] ?? 9) - (typeRank[db.type] ?? 9)
        || (slotRank[da.slot] ?? 9) - (slotRank[db.slot] ?? 9)
        || RARITIES[db.rarity].order - RARITIES[da.rarity].order
        || itemScore(db) - itemScore(da)
        || (db.ilvl ?? 0) - (da.ilvl ?? 0)
        || a.itemId.localeCompare(b.itemId);
    });
    inv.slots = Array(inv.slots.length).fill(null);
    items.forEach((it, i) => { inv.slots[i] = it; });
    return { ok: true };
  });

  // „Neu“-Markierungen entfernen (beim Öffnen/Schließen des Inventars)
  def('inventory:seen', (s) => { for (const sl of bag(s)) if (sl?.n) delete sl.n; });

  def('inventory:equip', (s, { slot }, ctx) => {
    const inv = s.get('inventory');
    const it = inv.slots[slot];
    const item = it && ctx.content.find('item', it.itemId);
    const eqSlot = equipSlotFor(item);
    if (!eqSlot) return { ok: false, reason: 'notEquippable' };
    if (!canUseClass(item, s.slices.character?.classId)) return { ok: false, reason: 'class' };
    if ((item.reqLevel ?? 1) > s.get('progress').level) return { ok: false, reason: 'level', need: item.reqLevel };
    const prev = inv.equipment[eqSlot];
    inv.equipment[eqSlot] = it.itemId;
    inv.slots[slot] = prev ? { itemId: prev, qty: 1 } : null;
    recomputeBonus(inv);
    ctx.bus.emit(EV.ITEM_EQUIPPED, { slot: eqSlot, itemId: it.itemId, previous: prev });
    return { ok: true, slot: eqSlot, previous: prev };
  });

  def('inventory:unequip', (s, { slot }, ctx) => {
    const inv = s.get('inventory');
    const itemId = inv.equipment[slot];
    if (!itemId) return { ok: false };
    const free = inv.slots.indexOf(null);
    if (free < 0) return { ok: false, reason: 'full' };
    inv.slots[free] = { itemId, qty: 1 };
    inv.equipment[slot] = null;
    recomputeBonus(inv);
    ctx.bus.emit(EV.ITEM_EQUIPPED, { slot, itemId: null, previous: itemId });
    return { ok: true };
  });

  // Verbrauchen. Die Wirkung (Heilen, Ressource) wendet das Fortschrittssystem am Helden an (ITEM_USED).
  def('inventory:use', (s, { slot }, ctx) => {
    const it = bag(s)[slot];
    const item = it && ctx.content.find('item', it.itemId);
    // Reittier-Gegenstand (§12.6): mount:learn von Thread A; bekannt → Hinweis, Gegenstand bleibt (verkaufbar)
    if (item?.type === 'mount') {
      if (!s.commands?.has('mount:learn')) return { ok: false, reason: 'unavailable' };
      if (s.slices.character?.mounts?.owned?.includes(item.mountId)) return { ok: false, reason: 'known' };
      const r = s.commit('mount:learn', { mountId: item.mountId });
      if (!r?.ok) return { ok: false, reason: r?.known ? 'known' : 'unavailable' };
      takeFromSlot(s, ctx, slot, 1);
      return { ok: true, mountId: item.mountId };
    }
    if (item?.type !== 'consumable' || !item.use) return { ok: false };
    if (s.slices.character?.mounts?.riding) return { ok: false, reason: 'riding' };   // §12.6: beritten kein Trank
    if ((item.reqLevel ?? 1) > s.get('progress').level) return { ok: false, reason: 'level' };
    takeFromSlot(s, ctx, slot, 1);
    ctx.bus.emit(EV.ITEM_USED, { itemId: item.id, effect: item.use });
    return { ok: true, effect: item.use };
  }, auth);

  def('inventory:discard', (s, { slot, qty }, ctx) => {
    const it = bag(s)[slot];
    if (!it) return { ok: false };
    if (ctx.content.find('item', it.itemId)?.type === 'quest') return { ok: false, reason: 'quest' };
    takeFromSlot(s, ctx, slot, qty ?? it.qty);
    return { ok: true };
  });

  // --- Gold
  def('wallet:addGold', (s, { amount, source }, ctx) => addGold(s, ctx, amount | 0, source), auth);

  // --- Händler
  def('shop:buy', (s, { vendorId, itemId, qty = 1 }, ctx) => {
    if (!vendorStock(ctx.content, vendorId).includes(itemId)) return { ok: false, reason: 'stock' };
    const def = ctx.content.get('item', itemId);
    if (def.type === 'mount' && (def.reqLevel ?? 1) > s.get('progress').level) return { ok: false, reason: 'level' };
    const price = buyPrice(def) * qty;
    if (s.get('wallet').gold < price) return { ok: false, reason: 'gold' };
    if (capacityFor(s, ctx.content, itemId) < qty) return { ok: false, reason: 'full' };
    addGold(s, ctx, -price, `buy:${itemId}`);
    addItem(s, ctx, itemId, qty, 'shop');
    return { ok: true, price };
  }, auth);

  def('shop:sell', (s, { vendorId, slot, qty }, ctx) => {
    if (!ctx.content.find('vendor', vendorId)) return { ok: false };
    const it = bag(s)[slot];
    const item = it && ctx.content.find('item', it.itemId);
    if (!item || item.type === 'quest' || !item.value) return { ok: false, reason: 'unsellable' };
    const taken = takeFromSlot(s, ctx, slot, qty ?? it.qty);
    const gold = item.value * taken.qty;
    addGold(s, ctx, gold, `sell:${item.id}`);
    return { ok: true, gold };
  }, auth);

  // Schnellverkauf überall (Inventar): gewählte Plätze. Questgegenstände nie.
  def('inventory:sell', (s, { slots = [] }, ctx) => {
    let gold = 0, count = 0;
    for (const i of [...new Set(slots)]) {
      const it = bag(s)[i], d = it && ctx.content.find('item', it.itemId);
      if (!d || d.type === 'quest' || !d.value) continue;
      gold += d.value * it.qty; count += it.qty;
      takeFromSlot(s, ctx, i, it.qty);
    }
    if (gold) addGold(s, ctx, gold, 'sell:inventory');
    return { ok: count > 0, gold, count };
  }, auth);
  // Alles Weiße (bzw. Weiße + Grüne) verkaufen, außer Verbesserungen
  def('inventory:sellJunk', (s, { upTo = 'common' }, ctx) => {
    let gold = 0, count = 0;
    for (const i of sellableSlots(s, ctx.content, upTo)) {
      const it = bag(s)[i], d = ctx.content.find('item', it.itemId);
      gold += d.value * it.qty; count += it.qty;
      takeFromSlot(s, ctx, i, it.qty);
    }
    if (gold) addGold(s, ctx, gold, 'sell:junk');
    return { ok: count > 0, gold, count };
  }, auth);
  // Automatisch verkaufen beim Aufsammeln: null | 'common' | 'uncommon'
  def('inventory:autoSell', (s, { mode = null }) => {
    s.get('inventory').autoSell = Object.hasOwn(SELL_TIERS, mode ?? '') ? mode : null;
    return { ok: true, mode: s.get('inventory').autoSell };
  });

  // Plunder verkaufen: gewöhnliche Ausrüstung, die keine Verbesserung ist, und Materialien ohne Rezept-/Questbedarf nicht.
  def('shop:sellJunk', (s, { vendorId }, ctx) => {
    if (!ctx.content.find('vendor', vendorId)) return { ok: false };
    let gold = 0, count = 0;
    for (const i of junkSlots(s, ctx.content)) {
      const it = bag(s)[i], d = ctx.content.find('item', it.itemId);
      gold += d.value * it.qty; count += it.qty;
      takeFromSlot(s, ctx, i, it.qty);
    }
    if (gold) addGold(s, ctx, gold, 'sell:junk');
    return { ok: count > 0, gold, count };
  }, auth);

  // --- Schmiede (Rezepte in crafting.js)
  def('craft:make', (s, { recipeId }, ctx) => {
    const r = ctx.content.find('recipe', recipeId);
    if (!r) return { ok: false, reason: 'unknown' };
    if ((r.level ?? 1) > s.get('progress').level) return { ok: false, reason: 'level' };
    if (s.get('wallet').gold < (r.gold ?? 0)) return { ok: false, reason: 'gold' };
    for (const m of r.mats) if (countItem(s, m.itemId) < m.qty) return { ok: false, reason: 'mats' };
    const out = { itemId: r.result, qty: r.qty ?? 1 };
    if (!fitsAll(s, ctx.content, [out], r.mats)) return { ok: false, reason: 'full' };
    for (const m of r.mats) removeItem(s, ctx, m.itemId, m.qty);
    if (r.gold) addGold(s, ctx, -r.gold, `craft:${recipeId}`);
    addItem(s, ctx, out.itemId, out.qty, 'craft');
    s.get('progress').stats.crafted++;
    return { ok: true, ...out };
  }, auth);

  // --- Beute
  // Gewürfelte, noch nicht aufgehobene Beute. Lebt nur zur Laufzeit (ein Server hielte
  // dieselbe Liste pro Instanz); wird beim Zonenwechsel geleert.
  const ledger = new Map();
  let nextDrop = 1;

  // source: 'kill' (id = Gegnertyp) oder 'chest' (id = objectId). Questgegenstände
  // wandern direkt ins Inventar, alles andere wird als Beute in die Welt gelegt.
  def('loot:roll', (s, { source = 'kill', id, level, elite, isBoss, bossId, family, rareId, x = 0, y = 0 }, ctx) => {
    const e = source === 'kill' ? ctx.content.find('enemy', id) : null;
    const lvl = level ?? e?.level ?? s.get('progress').level;
    const enemy = source === 'chest'
      ? { chest: String(id ?? 'chest'), level: lvl }
      : { type: id, level: lvl, family: family ?? e?.family, elite: elite ?? e?.elite, boss: isBoss ?? e?.boss, bossId: bossId ?? e?.bossId ?? (isBoss ? id : undefined), rareId };
    const drops = rollLoot(enemy, { rng, classId: s.slices.character?.classId ?? null, questNeed: questNeed(s, ctx) });
    const out = [];
    for (const d of drops) {
      if (d.quest && addItem(s, ctx, d.itemId, d.qty, 'loot') === d.qty) { out.push({ ...d, auto: true }); continue; }
      const drop = { dropId: `d${nextDrop++}`, ...d };
      ledger.set(drop.dropId, drop);
      out.push(drop);
    }
    ctx.bus.emit(EV.LOOT_DROPPED, { x, y, drops: out });
    return { drops: out };
  }, auth);

  def('loot:claim', (s, { dropId }, ctx) => {
    const d = ledger.get(dropId);
    if (!d) return { ok: false, reason: 'gone' };
    if (d.gold) { addGold(s, ctx, d.gold, 'loot'); ledger.delete(dropId); return { ok: true, gold: d.gold }; }
    // Auto-Verkauf: Ausrüstung bis zur gewählten Seltenheit, die keine Verbesserung ist, wird sofort zu Gold
    const mode = s.get('inventory').autoSell, def = ctx.content.find('item', d.itemId);
    if (mode && def?.slot && def.value && RARITIES[def.rarity].order <= SELL_TIERS[mode] && !isUpgrade(s, ctx.content, d.itemId)) {
      const gold = def.value * d.qty;
      addGold(s, ctx, gold, 'sell:auto');
      s.get('progress').stats.itemsLooted += d.qty;
      ledger.delete(dropId);
      ctx.bus.emit('item:autoSold', { itemId: d.itemId, qty: d.qty, gold });
      return { ok: true, itemId: d.itemId, qty: d.qty, sold: true, gold };
    }
    if (capacityFor(s, ctx.content, d.itemId) < d.qty) return { ok: false, reason: 'full' };
    addItem(s, ctx, d.itemId, d.qty, 'loot');
    ledger.delete(dropId);
    return { ok: true, itemId: d.itemId, qty: d.qty };
  }, auth);

  def('loot:reset', () => { ledger.clear(); });

  registerEndgameState(state, helpers);
  return { ledger };
}
