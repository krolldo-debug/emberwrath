// Gründe, täglich wiederzukommen (Runde 10.10.). Reine Regeln + Slice/Commands, ohne DOM; sichtbar im Auftragsbrett.
//
// - Tagesbelohnung: eine Serie über 7 Tage, eine Belohnung je Spieltag (UTC). Ein ausgelassener Tag setzt nichts
//   zurück, die Serie geht einfach beim nächsten Besuch weiter. Nach Tag 7 beginnt sie von vorn.
//   Neue Helden bekommen die erste am Tag nach ihrer Erschaffung (die ersten Minuten bleiben ruhig).
// - Erster Sieg des Tages: der erste Boss, Elite-, Champion- oder seltene Gegner bringt einmal am Tag einen Bonus.
// - Wochenherausforderung: ein Boss der eigenen Region (ab Glutprüfungen: eine Glutprüfung) mit Zusatzregel.
//   Für die Woche festgelegt beim ersten Blick darauf; Belohnung am Auftragsbrett.
// Belohnungen bleiben klein (Gold je Woche ≈ 13 Minuten Spiel auf gleicher Stufe, test/pacing.mjs) und hängen nie am Gold-Shop.
// Der eigentliche Reiz: Tag 7 und die Herausforderung bringen je ein Ausrüstungsteil, vier Herausforderungen eine Färbung.
// Zeit: `now` kommt als Parameter (Serverzeit aus clock.js). Tage und Wochen gehen nie rückwärts.
import { EV } from '../core/events.js';
import { boardDay, boardWeek, boardRegion, mulberry } from './board.js';
import { questXp } from './xp.js';
import { potionFor } from './loot.js';
import { TRIAL_MAX_TIER } from './trials.js';

export const STREAK_DAYS = 7;
export const CHALLENGE_GOAL = 4;          // Erfolg „Wachfeuer“: so viele Wochenherausforderungen
export const BOSS_FAST_S = 150;           // Regel „schnell“ im Bosskampf (eigene Stufe ≈ 100 s, Raserei ab 240 s)
export const TRIAL_FAST_S = 300;          // Regel „schnell“ in der Glutprüfung (Zeitlimit 600 s)
const RULES_BOSS = ['nopotion', 'nodeath', 'fast'];
const RULES_TRIAL = ['nopotion', 'fast'];
// Story-Bosse mit ihrer Stufe: Die Herausforderung nimmt einen der zwei stärksten, die man schon schaffen kann.
const BOSS_LEVELS = { bonelord: 6, drowned_priestess: 12, ember_tyrant: 20, barrow_king: 26, rot_mother: 32, frost_wyrm: 37, ash_sovereign: 40 };

// Goldeinheit wie beim Auftragsbrett (offerRewards)
const unit = (level) => 20 + level * 9;

// Tagesbelohnung für Tag `n` (1…7). gear = ein Ausrüstungsteil, gewürfelt beim Abholen.
export function loginReward(n, level) {
  const u = unit(level), potion = potionFor(level), mats = boardRegion(level).mats;
  switch (n) {
    case 1: return { icon: 'gold', gold: u, items: [] };
    case 2: return { icon: 'potion', gold: 0, items: [{ itemId: potion, qty: 3 }] };
    case 3: return { icon: 'gold', gold: 2 * u, items: [] };
    case 4: return { icon: 'mat', gold: 0, items: mats.slice(0, 2).map((itemId) => ({ itemId, qty: 3 })) };
    case 5: return { icon: 'gold', gold: 2 * u, items: [] };
    case 6: return { icon: 'potion', gold: u, items: [{ itemId: potion, qty: 2 }] };
    default: return { icon: 'chest', gold: 3 * u, items: [], gear: { rarity: 'rare' } };
  }
}

// Erster Sieg des Tages: etwas Erfahrung und Gold, auf Stufe 40 Gold und Glutsplitter
export function firstWinReward(level) {
  const cap = level >= 40;
  return { xp: cap ? 0 : questXp(level, 0.1), gold: unit(level) * (cap ? 3 : 1), items: cap ? [{ itemId: 'ember_shard', qty: 2 }] : [] };
}

// Wochenherausforderung: festgelegt aus Woche + Stufe (für alle gleich) und dem Prüfungsstand des Helden
export function weeklyChallenge(week, level, trials = null) {
  const rng = mulberry(week * 4513 + 29);
  if (trials?.open) {
    const rule = RULES_TRIAL[Math.floor(rng() * RULES_TRIAL.length)];
    return { kind: 'trial', target: '*', tier: Math.max(1, Math.min(TRIAL_MAX_TIER, (trials.best | 0) - 1)), rule };
  }
  const ids = Object.keys(BOSS_LEVELS).filter((id) => BOSS_LEVELS[id] <= level + 1);
  const bosses = ids.length ? ids.slice(-2) : ['bonelord'];
  const target = bosses[Math.floor(rng() * bosses.length)];
  return { kind: 'boss', target, tier: 0, rule: RULES_BOSS[Math.floor(rng() * RULES_BOSS.length)] };
}

export function challengeReward(level) {
  return { gold: unit(level) * 6, items: level >= 20 ? [{ itemId: 'ember_shard', qty: 5 }] : [], gear: { rarity: 'rare', epic: 0.15 } };
}

// Anzeigetexte: Ziel als Name, Regel als eigener kurzer Satz (Übersetzung: ein String je Satz)
export function challengeText(c, content) {
  const title = c.kind === 'trial' ? `Glutprüfung ${c.tier}` : content.find('enemy', c.target)?.name ?? c.target;
  const rule = c.rule === 'fast' ? (c.kind === 'trial' ? 'In unter 5 Minuten.' : 'In unter 150 Sekunden.')
    : c.rule === 'nodeath' ? 'Ohne zu fallen.' : 'Ohne Heiltrank.';
  return { title, rule };
}

// ---------------------------------------------------------------- Slice und Commands
// daily = { day, streak, rounds, winDay, week, challenge, cDone, cClaimed, cTotal, fight }
// day = letzter Tag mit Tagesbelohnung, streak = deren Platz in der Serie (1…7), rounds = vollendete Serien
// fight = laufender Bosskampf / laufende Prüfung für die Regeln { t0, potion, died }
const CHALLENGE_KINDS = ['boss', 'trial'];
const ALL_RULES = new Set([...RULES_BOSS, ...RULES_TRIAL]);
const cleanChallenge = (c) => (c && CHALLENGE_KINDS.includes(c.kind) && ALL_RULES.has(c.rule) && typeof c.target === 'string' && /^[a-z_*]{1,32}$/.test(c.target)
  ? { kind: c.kind, target: c.target, tier: Math.max(0, Math.min(TRIAL_MAX_TIER, c.tier | 0)), rule: c.rule } : null);

export function registerDailyState(state, h) {
  const auth = { authoritative: true };
  const def = h.def;
  state.defineSlice('daily', {
    create: () => ({ day: 0, streak: 0, rounds: 0, winDay: 0, week: 0, challenge: null, cDone: false, cClaimed: false, cTotal: 0, fight: null }),
    deserialize: (raw) => ({
      day: Math.max(0, raw.day | 0), streak: Math.max(0, Math.min(STREAK_DAYS, raw.streak | 0)), rounds: Math.max(0, raw.rounds | 0),
      winDay: Math.max(0, raw.winDay | 0), week: Math.max(0, raw.week | 0), challenge: cleanChallenge(raw.challenge),
      cDone: !!raw.cDone, cClaimed: !!raw.cClaimed, cTotal: Math.max(0, raw.cTotal | 0), fight: null,
    }),
  });

  const gear = (s, level, g) => {
    if (!g) return null;
    const rarity = g.epic && h.rng() < g.epic ? 'epic' : g.rarity;
    return h.pickEquipment({ level, rarity, classId: s.slices.character?.classId ?? null, rng: h.rng });
  };
  const grant = (s, ctx, r, gearId, source) => {
    if (r.gold) h.addGold(s, ctx, r.gold, source);
    if (r.xp) h.grantXp(s, ctx, r.xp, source);
    for (const it of r.items) h.addItem(s, ctx, it.itemId, it.qty, 'quest', { overflow: true });
    if (gearId) h.addItem(s, ctx, gearId, 1, 'quest', { overflow: true });
  };

  // Neue Woche: neue Herausforderung. Nie rückwärts.
  const rollWeek = (s, now) => {
    const d = s.get('daily'), w = boardWeek(now);
    if (w > d.week || !d.challenge) {
      const tr = s.slices.trials;
      const open = !!tr && s.slices.progress.level >= 20 && s.slices.quests.completed.includes('q_ignaroth');
      d.week = Math.max(d.week, w);
      d.challenge = weeklyChallenge(d.week, s.slices.progress.level, { open, best: tr?.best ?? 0 });
      d.cDone = false; d.cClaimed = false;
    }
    return d;
  };
  h.dailyRoll = rollWeek;

  def('daily:sync', (s, { now }) => { if (now) rollWeek(s, now); return { ok: true }; });

  // Tagesbelohnung. isNew: frisch erschaffener Held – heute nur merken, die erste Belohnung kommt morgen.
  def('daily:login', (s, { now, isNew = false }, ctx) => {
    if (!now) return { ok: false };
    const d = rollWeek(s, now), today = boardDay(now);
    if (today <= d.day) return { ok: false };
    d.day = today;
    if (isNew && !d.streak) return { ok: false, quiet: true };
    d.streak = d.streak % STREAK_DAYS + 1;
    if (d.streak === STREAK_DAYS) d.rounds++;
    const level = s.get('progress').level;
    const r = loginReward(d.streak, level);
    const gearId = gear(s, level, r.gear);
    grant(s, ctx, r, gearId, 'daily:login');
    ctx.bus.emit('daily:reward', { streak: d.streak, gold: r.gold, items: r.items, gearId });
    return { ok: true, streak: d.streak, gold: r.gold, items: r.items, gearId };
  }, auth);

  // Bosskampf beginnt / Prüfung beginnt: Regeln ab hier prüfen
  def('daily:engage', (s, { now, bossId = null }) => {
    s.get('daily').fight = { t0: now || 0, bossId, potion: false, died: false };
    return { ok: true };
  });
  def('daily:mark', (s, { potion = false, died = false }) => {
    const f = s.get('daily').fight;
    if (f) { f.potion ||= !!potion; f.died ||= !!died; }
    return { ok: true };
  });

  def('daily:claimChallenge', (s, { now }, ctx) => {
    if (!now) return { ok: false };
    const d = rollWeek(s, now);
    if (!d.cDone || d.cClaimed) return { ok: false, reason: 'notReady' };
    const level = s.get('progress').level;
    const r = challengeReward(level);
    const gearId = gear(s, level, r.gear);
    d.cClaimed = true;
    grant(s, ctx, r, gearId, 'daily:challenge');
    ctx.bus.emit('daily:changed', { challenge: true });
    return { ok: true, gold: r.gold, items: r.items, gearId };
  }, auth);
}

// Aus progress:kill (logic.js): erster Sieg des Tages und Wochenherausforderung.
// e = { now, boss, bossId, elite, champion, rare, inTrial, trial: { tier, time } | null }
export function dailyWin(s, ctx, h, e) {
  const d = s.slices.daily;
  if (!d || !e.now) return;
  const today = boardDay(e.now), level = s.slices.progress.level;
  if ((e.boss || e.elite || e.champion || e.rare || e.trial) && today > d.winDay) {
    d.winDay = today;
    const r = firstWinReward(level);
    if (r.gold) h.addGold(s, ctx, r.gold, 'daily:win');
    if (r.xp) h.grantXp(s, ctx, r.xp, 'daily:win');
    for (const it of r.items) h.addItem(s, ctx, it.itemId, it.qty, 'quest', { overflow: true });
    ctx.bus.emit('daily:firstWin', r);
  }
  h.dailyRoll(s, e.now);
  const c = d.challenge, f = d.fight;
  if (!c || d.cDone) return;
  let hit = false;
  if (c.kind === 'boss' && e.boss && !e.inTrial && e.bossId === c.target) {
    const secs = f?.t0 ? (e.now - f.t0) / 1000 : Infinity;
    hit = c.rule === 'nopotion' ? !!f && !f.potion : c.rule === 'nodeath' ? !!f && !f.died : secs <= BOSS_FAST_S;
  } else if (c.kind === 'trial' && e.trial && e.trial.tier >= c.tier) {
    hit = c.rule === 'nopotion' ? !!f && !f.potion : e.trial.time <= TRIAL_FAST_S;
  }
  if (!hit) return;
  d.cDone = true;
  d.cTotal++;
  ctx.bus.emit('daily:changed', { challenge: true });
  ctx.bus.emit(EV.UI_TOAST, { text: 'Wochenherausforderung geschafft. Hol dir die Belohnung am Auftragsbrett.', kind: 'quest', icon: 'letter' });
}

// Leucht-Hinweis am Brett: Wochenherausforderung erfüllt, aber nicht abgeholt
export function dailyHasReward(state) {
  const d = state.slices.daily;
  return !!d && d.cDone && !d.cClaimed;
}
