// Endgame-Systeme von Thread C: Bank, Erfolge/Titel, Verstärken/Verzaubern, Glutprüfungen.
// Slices und Commands wie in logic.js (ohne DOM, serverfähig). Die Inventar-Hilfen reicht logic.js herein.
import { EV } from '../core/events.js';
import { ITEMS, EQUIP_SLOTS, stackSize } from './items.js';
import { ACHIEVEMENTS, rewardItemId } from './achievements.js';
import { CLASSES } from '../character/classes.js';
import { WARDROBE_EVENT } from '../character/wardrobe.js';
import { UPGRADE_MAX, upgradeCost, ENCHANTS, computeBonus } from './smithing.js';
import { TRIAL_REQUIRES, TRIAL_MAX_TIER, KILL_VALUE, trialSpec, trialRewards } from './trials.js';
import { countItem } from './selectors.js';
import { boardProgress } from './board.js';

export const BANK_SIZES = [16, 24, 32, 40, 48];
export const BANK_COSTS = [200, 600, 1500, 4000]; // Gold für die nächste Erweiterung

// Event-Namen der Glutprüfungen (Architektur trägt sie in EV ein; bis dahin dieselben Strings)
export const TRIAL_EV = {
  STARTED: EV.TRIAL_STARTED ?? 'trial:started',
  PROGRESS: EV.TRIAL_PROGRESS ?? 'trial:progress',
  BOSS: EV.TRIAL_BOSS ?? 'trial:boss',
  COMPLETED: EV.TRIAL_COMPLETED ?? 'trial:completed',
  FAILED: EV.TRIAL_FAILED ?? 'trial:failed',
};
export const ACHIEVEMENT_UNLOCKED = EV.ACHIEVEMENT_UNLOCKED ?? 'achievement:unlocked';

export function recomputeBonus(inv) { inv.bonus = computeBonus(inv); return inv.bonus; }

// Erfolge prüfen; neu freigeschaltete melden. Läuft nach jedem Command von Thread C.
// h = Inventar-Hilfen aus logic.js (addItem) für Belohnungen mit Gegenstand.
export function checkAchievements(s, ctx, h = null) {
  const a = s.slices.achievements;
  if (!a) return [];
  const fresh = [];
  for (const def of ctx.content.all('achievement')) {
    if (a.unlocked[def.id]) {
      // errungen, Belohnung fehlt noch (Erfolg vor Runde 10.10. errungen, oder Speicherstand ohne Vermerk)
      if (def.reward && !a.rewarded?.[def.id]) grantReward(s, ctx, def, h);
      continue;
    }
    let v = 0;
    try { v = def.value(s); } catch { v = 0; }
    if (v >= def.goal) {
      a.unlocked[def.id] = Date.now();
      fresh.push(def.id);
      if (def.reward) grantReward(s, ctx, def, h);
      ctx.bus.emit(ACHIEVEMENT_UNLOCKED, { id: def.id, name: def.name, desc: def.desc, icon: def.icon, points: def.points, title: def.title, reward: def.reward ?? null });
      // Anzeige übernimmt D (ui/Unlocks.js) über 'achievement:unlocked' – kein eigener Toast mehr.
    }
  }
  return fresh;
}

// Belohnung eines Erfolgs vergeben (achievements.js, reward). Einmalig: Vermerk in achievements.rewarded.
// Färbungen brauchen nichts im Spielstand (character/cosmetics.js earnedDye prüft den Erfolg).
export function grantReward(s, ctx, def, h) {
  const a = s.slices.achievements, r = def.reward, ch = s.slices.character;
  if (r.kind === 'look') {
    const w = ch?.wardrobe;
    if (!w) return false;
    if (!w.looks.includes(r.id)) { w.looks.push(r.id); ctx.bus.emit(WARDROBE_EVENT, { itemIds: [r.id], source: 'achievement' }); }
  } else if (r.kind === 'mount') {
    const m = ch?.mounts;
    if (!m || !ctx.content.find('mount', r.id)) return false;
    if (!m.owned.includes(r.id)) {
      m.owned.push(r.id);
      if (!m.active) m.active = r.id;
      ctx.bus.emit(EV.MOUNT_LEARNED, { mountId: r.id, source: 'achievement' });
    }
  } else if (r.kind === 'item') {
    const itemId = rewardItemId(r, CLASSES[ch?.classId]?.primary);
    if (!h?.addItem || !ctx.content.find('item', itemId)) return false;
    // Tasche voll: Questbeutel (wandert in die Tasche, sobald Platz frei wird)
    h.addItem(s, ctx, itemId, 1, 'achievement', { overflow: true });
  }
  (a.rewarded ??= {})[def.id] = Date.now();
  return true;
}

// Glutprüfung: Kill zählen (aus progress:kill). trialTime = Sekunden seit Start (vom Sitzungssystem).
export function trialKill(s, ctx, { type, elite, isBoss, bossId, trialTime }, h) {
  const tr = s.slices.trials, run = tr?.run;
  if (!run || s.slices.world?.zoneId !== 'ember_trial') return;
  if (run.phase === 'clear' && !isBoss) {
    run.value = Math.min(run.target, run.value + (elite ? KILL_VALUE.elite : KILL_VALUE.normal));
    ctx.bus.emit(TRIAL_EV.PROGRESS, { value: run.value, target: run.target, timeLeft: Math.max(0, run.timeLimit - (trialTime ?? 0)) });
    if (run.value >= run.target) { run.phase = 'boss'; ctx.bus.emit(TRIAL_EV.BOSS, { bossId: run.bossId, tier: run.tier }); }
  } else if (run.phase === 'boss' && isBoss && (bossId ?? type) === run.bossId) {
    const firstClear = !tr.cleared[run.tier];
    const rewards = trialRewards(run.tier, { rng: h.rng, classId: s.slices.character?.classId ?? null, firstClear, level: s.slices.progress.level });
    run.phase = 'done';
    run.time = Math.round(trialTime ?? 0);
    run.rewards = rewards;
    tr.best = Math.max(tr.best, run.tier);
    (tr.bosses ??= {})[run.bossId] = Math.max(tr.bosses[run.bossId] ?? 0, run.tier);   // höchste Stufe je Herrscher (Erfolg „Die Sieben Gefallenen“)
    tr.runs++;
    const prev = tr.cleared[run.tier];
    tr.cleared[run.tier] = prev ? Math.min(prev, run.time || prev) : run.time || 1;
    h.addGold(s, ctx, rewards.gold, `trial:${run.tier}`);
    for (const it of rewards.items) {
      const got = h.addItem(s, ctx, it.itemId, it.qty, 'trial');
      if (got < it.qty) h.bankOverflow(s, it.itemId, it.qty - got);
    }
    ctx.bus.emit(TRIAL_EV.COMPLETED, { tier: run.tier, time: run.time, rewards, firstClear });
    boardProgress(s, ctx, { kind: 'trial', tier: run.tier });
  }
}

const cleanBosses = (raw) => Object.fromEntries(Object.entries(raw && typeof raw === 'object' ? raw : {})
  .filter(([id, t]) => /^[a-z_]{1,32}$/.test(id) && Number.isFinite(t) && t > 0).map(([id, t]) => [id, Math.min(TRIAL_MAX_TIER, t | 0)]));

export function registerEndgameState(state, h) {
  const auth = { authoritative: true };
  const def = h.def;

  // ---------------------------------------------------------------- Bank
  state.defineSlice('bank', {
    create: () => ({ size: BANK_SIZES[0], slots: Array(BANK_SIZES[0]).fill(null) }),
    deserialize: (raw) => {
      const size = BANK_SIZES.includes(raw.size) ? raw.size : BANK_SIZES[0];
      const slots = Array(size).fill(null);
      (raw.slots ?? []).slice(0, size).forEach((sl, i) => {
        if (sl && Object.hasOwn(ITEMS, sl.itemId) && sl.qty > 0) slots[i] = { itemId: sl.itemId, qty: Math.min(sl.qty | 0, stackSize(ITEMS[sl.itemId])) };
      });
      return { size, slots };
    },
  });
  // Stapeln, dann erster freier Platz. Gibt die eingelagerte Menge zurück.
  const toBank = (s, content, itemId, qty) => {
    const b = s.get('bank'), max = stackSize(content.get('item', itemId));
    let left = qty;
    for (const sl of b.slots) if (left > 0 && sl?.itemId === itemId && sl.qty < max) { const k = Math.min(left, max - sl.qty); sl.qty += k; left -= k; }
    for (let i = 0; i < b.slots.length && left > 0; i++) if (!b.slots[i]) { const k = Math.min(left, max); b.slots[i] = { itemId, qty: k }; left -= k; }
    return qty - left;
  };
  h.bankOverflow = (s, itemId, qty) => toBank(s, { get: (_t, id) => ITEMS[id] }, itemId, qty);

  def('bank:deposit', (s, { slot }, ctx) => {
    const it = h.bag(s)[slot];
    if (!it) return { ok: false };
    if (ctx.content.find('item', it.itemId)?.type === 'quest') return { ok: false, reason: 'quest' };
    const n = toBank(s, ctx.content, it.itemId, it.qty);
    if (!n) return { ok: false, reason: 'full' };
    h.takeFromSlot(s, ctx, slot, n);
    return { ok: true, qty: n };
  });
  def('bank:withdraw', (s, { slot }, ctx) => {
    const b = s.get('bank'), it = b.slots[slot];
    if (!it) return { ok: false };
    const n = h.addItem(s, ctx, it.itemId, it.qty, 'bank');
    if (!n) return { ok: false, reason: 'full' };
    it.qty -= n;
    if (it.qty <= 0) b.slots[slot] = null;
    return { ok: true, qty: n };
  });
  // Alle Materialien auf einmal einlagern
  def('bank:depositMaterials', (s, _p, ctx) => {
    let count = 0;
    h.bag(s).forEach((it, i) => {
      if (!it || ctx.content.find('item', it.itemId)?.type !== 'material') return;
      const n = toBank(s, ctx.content, it.itemId, it.qty);
      if (n) { h.takeFromSlot(s, ctx, i, n); count += n; }
    });
    return { ok: count > 0, count };
  });
  def('bank:sort', (s, _p, ctx) => {
    const b = s.get('bank');
    const items = b.slots.filter(Boolean);
    b.slots = Array(b.size).fill(null);
    items.sort((x, y) => (ctx.content.get('item', x.itemId).type).localeCompare(ctx.content.get('item', y.itemId).type) || x.itemId.localeCompare(y.itemId));
    for (const it of items) toBank(s, ctx.content, it.itemId, it.qty);
    return { ok: true };
  });
  def('bank:expand', (s, _p, ctx) => {
    const b = s.get('bank');
    const step = BANK_SIZES.indexOf(b.size);
    if (step < 0 || step >= BANK_SIZES.length - 1) return { ok: false, reason: 'max' };
    const cost = BANK_COSTS[step];
    if (s.get('wallet').gold < cost) return { ok: false, reason: 'gold' };
    h.addGold(s, ctx, -cost, 'bank:expand');
    b.size = BANK_SIZES[step + 1];
    while (b.slots.length < b.size) b.slots.push(null);
    return { ok: true, size: b.size };
  }, auth);

  // ---------------------------------------------------------------- Erfolge
  state.defineSlice('achievements', {
    // rewarded: Erfolge, deren Belohnung vergeben ist (fehlt in alten Spielständen -> wird nachgeholt)
    create: () => ({ unlocked: {}, title: null, rewarded: {} }),
    deserialize: (raw) => {
      const unlocked = {}, rewarded = {};
      for (const [id, t] of Object.entries(raw.unlocked ?? {})) if (Object.hasOwn(ACHIEVEMENTS, id)) unlocked[id] = t;
      for (const [id, t] of Object.entries(raw.rewarded ?? {})) if (unlocked[id] && ACHIEVEMENTS[id].reward) rewarded[id] = t;
      const title = raw.title && unlocked[raw.title] && ACHIEVEMENTS[raw.title].title ? raw.title : null;
      return { unlocked, title, rewarded };
    },
  });
  def('achievement:title', (s, { id }, ctx) => {
    const a = s.get('achievements');
    if (id && (!a.unlocked[id] || !ctx.content.find('achievement', id)?.title)) return { ok: false };
    a.title = id ?? null;
    return { ok: true };
  });

  // ---------------------------------------------------------------- Verstärken / Verzaubern
  def('smith:upgrade', (s, { slot }, ctx) => {
    const inv = s.get('inventory');
    if (!EQUIP_SLOTS.includes(slot)) return { ok: false };
    const cur = inv.upgrades[slot] ?? 0;
    if (cur >= UPGRADE_MAX) return { ok: false, reason: 'max' };
    const cost = upgradeCost(cur);
    if (s.get('progress').level < cost.reqLevel) return { ok: false, reason: 'level', need: cost.reqLevel };
    if (s.get('wallet').gold < cost.gold) return { ok: false, reason: 'gold' };
    for (const m of cost.mats) if (countItem(s, m.itemId) < m.qty) return { ok: false, reason: 'mats' };
    for (const m of cost.mats) h.removeItem(s, ctx, m.itemId, m.qty);
    h.addGold(s, ctx, -cost.gold, `upgrade:${slot}`);
    inv.upgrades[slot] = cur + 1;
    recomputeBonus(inv);
    return { ok: true, level: cur + 1 };
  }, auth);
  def('smith:enchant', (s, { slot, enchantId }, ctx) => {
    const inv = s.get('inventory'), e = ENCHANTS[enchantId];
    if (!e || !e.slots.includes(slot)) return { ok: false, reason: 'slot' };
    if (inv.enchants[slot] === enchantId) return { ok: false, reason: 'same' };
    if (s.get('progress').level < e.level) return { ok: false, reason: 'level', need: e.level };
    if (s.get('wallet').gold < e.gold) return { ok: false, reason: 'gold' };
    for (const m of e.mats) if (countItem(s, m.itemId) < m.qty) return { ok: false, reason: 'mats' };
    for (const m of e.mats) h.removeItem(s, ctx, m.itemId, m.qty);
    h.addGold(s, ctx, -e.gold, `enchant:${slot}`);
    inv.enchants[slot] = enchantId;
    recomputeBonus(inv);
    return { ok: true };
  }, auth);

  // ---------------------------------------------------------------- Glutprüfungen
  state.defineSlice('trials', {
    create: () => ({ best: 0, runs: 0, cleared: {}, bosses: {}, run: null }),
    // Ein laufender Versuch überlebt kein Neuladen.
    deserialize: (raw) => ({ best: Math.max(0, raw.best | 0), runs: Math.max(0, raw.runs | 0), cleared: { ...raw.cleared }, bosses: cleanBosses(raw.bosses), run: null }),
  });
  def('trial:start', (s, { tier }, ctx) => {
    const tr = s.get('trials');
    if (s.get('progress').level < TRIAL_REQUIRES.level || !s.get('quests').completed.includes(TRIAL_REQUIRES.quest)) return { ok: false, reason: 'locked' };
    const t = tier | 0;
    if (t < 1 || t > Math.min(TRIAL_MAX_TIER, tr.best + 1)) return { ok: false, reason: 'tier' };
    if (tr.run && tr.run.phase !== 'done' && tr.run.phase !== 'failed') return { ok: false, reason: 'running' };
    const seed = 1 + Math.floor(h.rng() * 1e6);
    tr.run = { runId: `tr${seed}`, ...trialSpec(t, seed, s.get('progress').level, s.get('quests').completed), value: 0, phase: 'clear', time: 0 };
    ctx.bus.emit(TRIAL_EV.STARTED, { run: tr.run });
    return { ok: true, run: tr.run };
  }, auth);
  def('trial:fail', (s, { reason = 'time' }, ctx) => {
    const run = s.get('trials').run;
    if (!run || run.phase === 'done' || run.phase === 'failed') return { ok: false };
    run.phase = 'failed';
    run.failReason = reason;
    ctx.bus.emit(TRIAL_EV.FAILED, { reason, tier: run.tier });
    return { ok: true };
  }, auth);
  // Lauf beenden (Zone verlassen). Das Ergebnis bleibt für das Panel als `last` (nicht gespeichert).
  def('trial:leave', (s) => {
    const tr = s.get('trials');
    if (tr.run) tr.last = tr.run;
    tr.run = null;
    return { ok: true };
  });
}
