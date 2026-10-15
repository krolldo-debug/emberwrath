// Fortschrittsbuch: Regeln des Servers (src/ledger/README.md). Ohne DOM; läuft im Worker (worker/ledger.js) und in Tests.
//
// Das Spiel meldet je Command, was er an Erfahrung, Gold und Gegenständen verändert hat (Eintrag, siehe client.js).
// applyEntries prüft jeden Eintrag und führt das Buch:
//   - Abgänge (Ausgeben, Verkaufen, Verbrauchen) gelten immer.
//   - Zugänge gelten nur, soweit der Server sie selbst nachrechnen kann: Kill-Erfahrung nach Formel und Tempo,
//     Beute mit dem Würfel des Servers (rng.js) nachgewürfelt, Questbelohnung aus den Questdaten, Händlerpreise,
//     Rezepte, Tages-/Brett-/Prüfungsbelohnungen mit Tages- und Wochengrenzen, Erfolge einmal.
//   - Was darüber hinausgeht, kommt nicht ins Buch (und wird als Abweichung vermerkt).
// Die Datenbank lässt keinen Spielstand zu, der mehr enthält als das Buch (supabase/migrations/…_fortschrittsbuch.sql).
import { ITEMS, buyPrice } from '../progression/items.js';
import { QUESTS, VENDORS } from '../progression/quests.js';
import { RECIPES } from '../progression/crafting.js';
import { ACHIEVEMENTS, rewardItemId } from '../progression/achievements.js';
import { RARE_ENEMIES, RARE_XP_MULT } from '../progression/rares.js';
import { LEVEL_CAP, totalXpForLevel, killXp, mobXp } from '../progression/xp.js';
import { rollLoot, pickEquipment, pickRewardGear } from '../progression/loot.js';
import { trialRewards, trialSpec, TRIAL_REQUIRES, TRIAL_MAX_TIER } from '../progression/trials.js';
import { loginReward, firstWinReward, challengeReward, STREAK_DAYS } from '../progression/daily.js';
import { boardDay, boardWeek, boardOffers, offerRewards, weekChest, WEEK_GOAL, BOARD_OFFERS } from '../progression/board.js';
import { CHAMPION_XP_MULT } from '../progression/logic.js';
import { CLASSES } from '../character/classes.js';
import { ENEMY_TYPES } from '../entities/enemyTypes.js';
import { goldFor, DAILY_REWARDS } from '../pvp/rules.js';
import { ledgerRng, RNG_LABELS } from './rng.js';
import { COUNTED_MOUNTS, isTracked, upId, enId, BANK_ID } from './values.js';
import { EQUIP_SLOTS } from '../progression/items.js';
import { UPGRADE_MAX, upgradeCost, ENCHANTS } from '../progression/smithing.js';
import { BANK_SIZES, BANK_COSTS } from '../progression/endgame.js';
import { TRIAL_ZONE } from '../progression/trials.js';

export const LEDGER_VERSION = 1;

// Tempo (gegen Bots): Kill-Erfahrung höchstens so schnell wie ein Kill auf eigener Stufe je Sekunde (das Vierfache
// des Spieltempos aus xp.js, 15 Kills je Minute), Vorrat für große Gruppen bis BUCKET_MAX Kills. Bosse, seltene Gegner
// und Truhen mit eigenen Abständen. Zeit zählt nur, solange das Spiel meldet (höchstens GAP_MAX je Lücke).
export const RATE = { perSecond: 1, bucketMax: 180, gapMax: 15 * 60, bossGapS: 120, chestPerSecond: 1 / 12, chestMax: 10, rareFactor: 0.8 };
export const LIMITS = { entries: 400, drops: 400, miss: 30, sessions: 8, tickets: 60 };
export const TRIAL_MIN_S = 45;

const DAY = 86400000;
const intOf = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : 0; };
const posInt = (v) => Math.max(0, intOf(v));
const isId = (v) => typeof v === 'string' && /^[a-z0-9_:-]{1,64}$/i.test(v);
const quest = (id) => (Object.hasOwn(QUESTS, id) ? { ...QUESTS[id], id } : null);
// Gegnerarten, die für die Tötungsziele einer Quest zählen ('*' = alle)
const KILL_TARGETS = new Map();
const killTargets = (id) => {
  if (!KILL_TARGETS.has(id)) KILL_TARGETS.set(id, (QUESTS[id]?.objectives ?? []).filter((o) => o.kind === 'kill').flatMap((o) => [].concat(o.target)));
  return KILL_TARGETS.get(id);
};
const fakeState = (classId) => ({ slices: { character: { classId } } });

export function levelForXp(xp) {
  let l = 1;
  while (l < LEVEL_CAP && xp >= totalXpForLevel(l + 1)) l++;
  return l;
}

// Höchste Stufe, in der ein Gegnertyp vorkommt (Grundstufe, Spanne, Zonenvarianten, seltene Ausprägung)
const MAX_LEVEL = {};
for (const [id, d] of Object.entries(ENEMY_TYPES)) {
  let m = Math.max(d.level ?? 1, d.levels?.[1] ?? 0);
  for (const v of Object.values(d.zoneVariants ?? {})) m = Math.max(m, v.levels?.[1] ?? v.levels?.[0] ?? 0);
  MAX_LEVEL[id] = m + (d.elite ? 2 : 0); // Eliten ab 20 kämpfen 2 Stufen höher (levelGap.js)
}
for (const r of Object.values(RARE_ENEMIES)) MAX_LEVEL[r.base] = Math.max(MAX_LEVEL[r.base] ?? 1, r.level ?? 1);

// ---------------------------------------------------------------- Buch anlegen
// Neues Buch aus einem gespeicherten Spielstand (Altbestand und neue Charaktere): Werte = Spielstand,
// Merkzettel (Quests, Erfolge, Tagesbelohnung …) aus dem Spielstand, damit nichts doppelt belohnt wird.
export function freshState(snapshot) {
  const sl = snapshot?.slices ?? {};
  const q = sl.quests ?? {}, d = sl.daily ?? {}, b = sl.board ?? {}, t = sl.trials ?? {};
  const active = {};
  for (const id of Object.keys(q.active ?? {})) if (quest(id)) active[id] = { legacy: true, kills: {} };
  return {
    v: LEDGER_VERSION,
    sessions: {},
    drops: {}, tickets: [], chests: 0,
    bucket: { xp: RATE.bucketMax, chest: RATE.chestMax, at: 0 },
    last: 0,
    bosses: {}, rares: { ...(sl.rares?.killedAt ?? {}) },
    quests: { done: (q.completed ?? []).filter((id) => quest(id)), rep: {}, choices: { ...(q.choices ?? {}) }, active },
    ach: Object.keys(sl.achievements?.rewarded ?? {}),
    daily: { day: posInt(d.day), streak: posInt(d.streak), winDay: posInt(d.winDay), cweek: d.cClaimed ? posInt(d.week) : 0 },
    board: { day: posInt(b.day), claimed: Array.isArray(b.done) ? b.done.filter((x) => typeof x === 'string').slice(-BOARD_OFFERS) : [], week: posInt(b.week), weekDone: posInt(b.weekDone), weekClaimed: !!b.weekClaimed },
    trial: { run: null, cleared: Object.fromEntries(Object.keys(t.cleared ?? {}).map((k) => [k, true])), best: posInt(t.best) },
    pvp: { day: 0, n: 0 },
    shop: { credited: [...(sl.shop?.credited ?? [])].slice(-200), revoked: [...(sl.shop?.revoked ?? [])].slice(-200) },
    miss: [],
  };
}

// ---------------------------------------------------------------- Sitzungen
export function openSession(st, { sid, seed, at }) {
  st.sessions[sid] = { seed, k: 0, n: {}, at };
  const ids = Object.keys(st.sessions).sort((a, b) => st.sessions[a].at - st.sessions[b].at);
  while (ids.length > LIMITS.sessions) delete st.sessions[ids.shift()];
  return st.sessions[sid];
}

// ---------------------------------------------------------------- Hauptfunktion
// book = { xp, gold, items, state }, ctx = { classId, now (Serverzeit ms), sid, orders: Map(orderId -> { gold }) }
// Liefert { book, accepted (letztes k), miss: [ … ] }. book wird nicht verändert (Kopie).
export function applyEntries(book, entries, ctx) {
  const b = { xp: intOf(book.xp), gold: intOf(book.gold), items: { ...(book.items ?? {}) }, state: structuredClone(book.state) };
  const st = b.state;
  const ses = st.sessions[ctx.sid];
  if (!ses) return { book: b, accepted: 0, miss: [], error: 'session' };
  const out = { book: b, accepted: ses.k, miss: [] };
  // Uhr: Einträge tragen die Serverzeit des Spiels; nie vor dem letzten Eintrag, nie nach jetzt
  let clock = Math.max(st.last || 0, ctx.now - RATE.gapMax * 1000);
  // Tempo-Vorrat auffüllen: echte Zeit seit der letzten Meldung, höchstens gapMax
  const refill = (at) => {
    const bu = st.bucket;
    const dt = Math.max(0, Math.min(RATE.gapMax, (at - (bu.at || at)) / 1000));
    bu.xp = Math.min(RATE.bucketMax, bu.xp + dt * RATE.perSecond);
    bu.chest = Math.min(RATE.chestMax, bu.chest + dt * RATE.chestPerSecond);
    bu.at = at;
  };
  for (const e of entries.slice(0, LIMITS.entries)) {
    if (!e || typeof e !== 'object' || intOf(e.k) <= ses.k) continue;
    ses.k = intOf(e.k);
    clock = Math.min(ctx.now, Math.max(clock, intOf(e.now)));
    refill(clock);
    const miss = applyOne(b, st, ses, e, { ...ctx, at: clock });
    if (miss) {
      out.miss.push(miss);
      st.miss.push(miss);
      if (st.miss.length > LIMITS.miss) st.miss.splice(0, st.miss.length - LIMITS.miss);
    }
  }
  st.last = clock;
  out.accepted = ses.k;
  return out;
}

// Ein Eintrag: Zugänge berechnen, mit der Meldung abgleichen, buchen. Rückgabe: Abweichung oder null.
function applyOne(b, st, ses, e, ctx) {
  const d = cleanDelta(e.d);
  const p = e.p && typeof e.p === 'object' ? e.p : {};
  const lv = levelForXp(b.xp);
  const allow = { xp: 0, gold: 0, items: {} };
  const give = (id, q = 1) => { if (isTracked(id) && q > 0) allow.items[id] = (allow.items[id] ?? 0) + q; };
  const env = { b, st, ses, e, p, d, lv, allow, give, ctx, trial: e.z === TRIAL_ZONE, rolls: consumeRolls(ses, e.r) };

  switch (e.t) {
    // Vom Server selbst gebucht (Auktionshaus, Postfach der Datenbank, Rückbuchung im Shop): Die Datenbank spiegelt diese
    // Buchungen ins Buch (Trigger), das Spiel übernimmt sie nur. Hier nichts buchen.
    case 'market:apply': case 'shop:revoke': return null;
    case 'progress:kill': ruleKill(env); break;
    case 'loot:roll': ruleRoll(env); break;
    case 'loot:claim': ruleClaim(env); break;
    case 'loot:reset': ruleReset(env); break;
    case 'quest:accept': ruleQuestAccept(env); break;
    case 'quest:abandon': delete st.quests.active[p.questId]; break;
    case 'quest:turnIn': ruleTurnIn(env); break;
    case 'shop:buy': ruleBuy(env); break;
    case 'shop:sell': case 'shop:sellJunk': case 'inventory:sell': case 'inventory:sellJunk': case 'inventory:sellMat': ruleSell(env); break;
    case 'craft:make': ruleCraft(env); break;
    case 'trial:start': ruleTrialStart(env); break;
    case 'trial:fail': case 'trial:leave': if (st.trial.run && e.t === 'trial:leave') st.trial.run = null; else if (st.trial.run) st.trial.run.failed = true; break;
    case 'daily:login': ruleDailyLogin(env); break;
    case 'daily:claimChallenge': ruleChallenge(env); break;
    case 'board:claim': ruleBoardClaim(env); break;
    case 'board:claimWeek': ruleBoardWeek(env); break;
    case 'wallet:addGold': ruleWalletGold(env); break;
    case 'shop:credit': ruleShopCredit(env); break;
    case 'smith:upgrade': ruleUpgrade(env); break;
    case 'smith:enchant': ruleEnchant(env); break;
    case 'bank:expand': ruleBankExpand(env); break;
    default: break; // alle anderen: nur Abgänge zählen
  }
  ruleAchievements(env);
  return book(env);
}

// Gemeldete Änderung gegen erlaubte Zugänge buchen
function book({ b, d, allow, e }) {
  const over = {};
  const xpIn = Math.max(0, Math.min(d.xp, allow.xp));
  if (d.xp > 0) { b.xp += xpIn; if (d.xp > xpIn) over.x = d.xp - xpIn; } else b.xp += d.xp;
  if (b.xp > totalXpForLevel(LEVEL_CAP)) b.xp = totalXpForLevel(LEVEL_CAP);
  if (d.gold > 0) { const g = Math.min(d.gold, allow.gold); b.gold += g; if (d.gold > g) over.g = d.gold - g; } else b.gold += d.gold;
  for (const [id, q] of Object.entries(d.items)) {
    const have = b.items[id] ?? 0;
    if (q > 0) {
      const ok = Math.min(q, allow.items[id] ?? 0);
      if (ok) b.items[id] = have + ok;
      if (q > ok) (over.i ??= {})[id] = q - ok;
    } else {
      const left = have + q;
      if (left > 0) b.items[id] = left; else delete b.items[id];
    }
  }
  return Object.keys(over).length ? { k: e.k, t: e.t, at: e.now, ...over } : null;
}

function cleanDelta(raw) {
  const d = { xp: intOf(raw?.x), gold: intOf(raw?.g), items: {} };
  if (raw?.i && typeof raw.i === 'object') {
    let n = 0;
    for (const [id, q] of Object.entries(raw.i)) {
      if (++n > 200) break;
      const v = intOf(q);
      if (v && isTracked(id)) d.items[id] = v;
    }
  }
  return d;
}

// Würfe des Eintrags [[label, n], …]: jeder gemeldete Wurf zählt die Nummernfolge der Sitzung weiter, auch wenn
// die Regel danach nichts vergibt. Gültig ist nur genau die nächste Nummer; eine Lücke (verlorener Eintrag) setzt
// die Folge dort fort, der Wurf selbst gilt nicht (Aussuchen günstiger Nummern bringt nichts).
const ROLL_LABELS = new Set(RNG_LABELS);
function consumeRolls(ses, raw) {
  const out = {};
  for (const r of Array.isArray(raw) ? raw.slice(0, 20) : []) {
    if (!Array.isArray(r) || !ROLL_LABELS.has(r[0])) continue;
    const label = r[0], n = posInt(r[1]), next = (ses.n[label] ?? 0) + 1;
    if (!n) { (out[label] ??= []).push(null); continue; } // ohne Sitzung gewürfelt
    if (n < next) { (out[label] ??= []).push(null); continue; }
    ses.n[label] = n;
    (out[label] ??= []).push(n === next ? { n, rng: ledgerRng(ses.seed, label, n) } : null);
  }
  return out;
}
// Preis bezahlt: im Eintrag abgegeben UND im Buch vorhanden (Ausgeben von Gold oder Gegenständen, die der Server nicht
// kennt, bringt nichts; Abgänge buchen höchstens bis 0)
function paid({ b, d }, gold, mats = []) {
  if (gold > 0 && (d.gold > -gold || b.gold < gold)) return false;
  return mats.every((m) => (d.items[m.itemId] ?? 0) <= -m.qty && (b.items[m.itemId] ?? 0) >= m.qty);
}
const takeRoll = (env, label) => env.rolls[label]?.shift() ?? null;

const trim = (a, n) => { if (a.length > n) a.splice(0, a.length - n); };
const counted = (id) => Object.hasOwn(ITEMS, id);

// ---------------------------------------------------------------- Kampf
// Gegner aus den Daten des Servers; vom Spiel nur Typ, Stufe (geprüft), seltene Variante, Champion, Zone.
function enemyOf(env, p) {
  const type = p.type ?? p.id;
  const def = typeof type === 'string' && Object.hasOwn(ENEMY_TYPES, type) ? ENEMY_TYPES[type] : null;
  if (!def) return null;
  const run = env.st.trial.run;
  const trial = env.trial && !!run;
  const rareId = typeof p.rareId === 'string' && RARE_ENEMIES[p.rareId]?.base === type ? p.rareId : undefined;
  if (p.rareId && !rareId) return null;
  const level = intOf(p.level) || def.level || 1;
  const max = trial ? Math.max(MAX_LEVEL[type] ?? 1, run.level ?? 40) : p.summoned ? env.lv + 5 : (MAX_LEVEL[type] ?? 1);
  if (level < 1 || level > Math.max(max, 1)) return null;
  const boss = !!def.boss;
  return { type, level, family: def.family, elite: !!def.elite || !!rareId, boss, bossId: def.bossId ?? (boss ? type : undefined), rareId: boss ? undefined : rareId, champion: !!p.champion && !boss && !rareId, summoned: !!p.summoned, trial };
}

// Beutescheine: jeder bestätigte Kill legt einen Schein in die Reihe, jeder Wurf für einen Gegner löst den ältesten
// passenden ein (übersprungene ältere verfallen). So gehört jeder Wurf zu genau einem Kill.
const ticketKey = (en) => `${en.type}:${en.level}:${en.rareId ?? ''}:${en.champion ? 1 : 0}:${en.trial ? 1 : 0}`;
function takeTicket(st, key) {
  const i = st.tickets.indexOf(key);
  if (i < 0) return false;
  st.tickets.splice(0, i + 1);
  return true;
}

function ruleKill(env) {
  const { st, p, allow, lv, ctx } = env;
  const en = enemyOf(env, p);
  if (!en) return;
  // Bosse und seltene Gegner: Abstand nach Serverzeit (Abbilder in der Glutprüfung: eigene Regel unten)
  if (en.boss && !en.summoned && !en.trial) {
    const last = st.bosses[en.bossId] ?? 0;
    if (ctx.at - last < RATE.bossGapS * 1000) return;
  }
  // Glutprüfung: ein Boss je Lauf
  if (en.boss && !en.summoned && en.trial) {
    if (st.trial.run.boss) return;
    st.trial.run.boss = true;
  }
  if (en.rareId) {
    const last = st.rares[en.rareId] ?? 0;
    if (ctx.at - last < (RARE_ENEMIES[en.rareId].respawn ?? 300) * 1000 * RATE.rareFactor) return;
  }
  const base = en.rareId ? mobXp(en.level) * RARE_XP_MULT
    : mobXp(en.level, { elite: en.elite, boss: en.boss }) * (en.summoned ? 0.2 : 1) * (en.champion ? CHAMPION_XP_MULT : 1);
  const xp = killXp(base, en.level, lv);
  // Tempo: Kosten in Kills auf eigener Stufe
  const cost = Math.max(0.2, xp / Math.max(1, mobXp(lv)));
  if (st.bucket.xp < cost) return;
  st.bucket.xp -= cost;
  allow.xp += lv >= LEVEL_CAP ? 0 : xp;
  if (en.boss && !en.summoned && !en.trial) st.bosses[en.bossId] = ctx.at;
  if (en.rareId) st.rares[en.rareId] = ctx.at;
  if (!en.summoned) {
    st.tickets.push(ticketKey(en));
    trim(st.tickets, LIMITS.tickets);
    if (en.boss && !en.trial) st.chests = Math.min(4, st.chests + 1);
  }
  // Quests: Kills für Tötungsziele zählen
  for (const [id, a] of Object.entries(st.quests.active)) {
    if (!a.legacy && killTargets(id).some((t) => t === '*' || t === en.type)) a.kills[en.type] = Math.min(999, (a.kills[en.type] ?? 0) + 1);
  }
  // Belohnungen danach rechnet das Spiel mit der Stufe nach der Kill-Erfahrung
  const lvNow = levelForXp(env.b.xp + allow.xp);
  // Glutprüfung abgeschlossen (Boss der Prüfung): Belohnung aus dem Würfel des Servers
  const run = st.trial.run;
  let trialDone = false;
  if (run && en.boss && en.trial && !run.failed && !run.done) {
    const roll = takeRoll(env, 'trial');
    if (roll) {
      run.done = trialDone = true;
      if (ctx.at - run.at >= TRIAL_MIN_S * 1000) {
        const r = trialRewards(run.tier, { rng: roll.rng, classId: ctx.classId, firstClear: !st.trial.cleared[run.tier], level: lvNow });
        allow.gold += r.gold;
        for (const it of r.items) env.give(it.itemId, it.qty);
        st.trial.cleared[run.tier] = true;
        st.trial.best = Math.max(st.trial.best, run.tier);
      }
    }
  }
  // Erster Sieg des Tages (daily.js dailyWin)
  const today = boardDay(ctx.at);
  if ((en.boss || en.elite || en.champion || en.rareId || trialDone) && !en.summoned && today > st.daily.winDay) {
    st.daily.winDay = today;
    const r = firstWinReward(lvNow);
    allow.xp += lvNow >= LEVEL_CAP ? 0 : r.xp; allow.gold += r.gold;
    for (const it of r.items) env.give(it.itemId, it.qty);
  }
}

function ruleRoll(env) {
  const { st, p, e, ctx, lv } = env;
  const roll = takeRoll(env, 'loot');
  let enemy;
  if (p.source === 'chest') {
    const id = String(p.id ?? 'chest').slice(0, 64);
    const level = intOf(p.level) || lv;
    if (level < 1 || level > lv + 3) return;
    if (id.startsWith('boss')) {
      if (!(st.chests > 0)) return;
      st.chests--;
    } else {
      if (st.bucket.chest < 1) return;
      st.bucket.chest -= 1;
    }
    enemy = { chest: id, level };
    if (env.trial && st.trial.run) enemy.trial = true;
  } else {
    const en = enemyOf(env, { ...p, type: p.id });
    if (!en || en.summoned || !takeTicket(st, ticketKey(en))) return;
    enemy = { type: en.type, level: en.level, family: en.family, elite: en.elite, boss: en.boss, bossId: en.bossId, rareId: en.rareId, champion: en.champion };
    if (en.trial) enemy.trial = true;
  }
  if (!roll) return;
  // Questbedarf ist Sache des Spiels: hier immer „gebraucht“ (höhere Materialchance, Questgegenstände am Ende).
  // Das ergibt dieselben Würfe wie im Spiel und höchstens zusätzliche Treffer.
  const rolled = rollLoot(enemy, { rng: roll.rng, classId: ctx.classId, questNeed: () => 1 });
  // Gemeldete Beutestücke dem Wurf zuordnen (nach Inhalt); nur Gefundenes liegt danach beim Server bereit
  const pool = rolled.map((x) => ({ ...x }));
  const boss = !!enemy.boss || String(enemy.chest ?? '').startsWith('boss');
  const drops = Array.isArray(e.res?.drops) ? e.res.drops.slice(0, 40) : [];
  drops.forEach((dr, i) => {
    if (!dr || dr.auto) return; // Questgegenstand direkt in der Tasche: zählt nicht
    const j = pool.findIndex((x) => (dr.g ? x.gold === intOf(dr.g) : x.itemId === dr.it && (x.qty ?? 1) === intOf(dr.q)));
    if (j < 0) return;
    const x = pool.splice(j, 1)[0];
    st.drops[`${ctx.sid}:${roll.n}:${i}`] = x.gold ? { g: x.gold, b: boss } : { it: x.itemId, q: x.qty ?? 1, b: boss };
  });
  const keys = Object.keys(st.drops);
  if (keys.length > LIMITS.drops) for (const k of keys.slice(0, keys.length - LIMITS.drops)) delete st.drops[k];
}

function ruleClaim(env) {
  const { st, p, e } = env;
  const key = typeof p.key === 'string' ? p.key : null;
  const dr = key && Object.hasOwn(st.drops, key) ? st.drops[key] : null;
  if (!dr) return;
  delete st.drops[key];
  if (dr.g) { env.allow.gold += dr.g; return; }
  // Auto-Verkauf: statt des Stücks dessen Verkaufswert
  if (e.res?.sold) { env.allow.gold += (ITEMS[dr.it]?.value ?? 0) * dr.q; return; }
  env.give(dr.it, dr.q);
}

// Zone verlassen: Beute verfällt. Bossbeute schreibt das Spiel im selben Schritt als Beutebrief ins Postfach (mail:loot).
function ruleReset(env) {
  const { st } = env;
  for (const [k, dr] of Object.entries(st.drops)) {
    if (dr.b) { if (dr.g) env.allow.gold += dr.g; else env.give(dr.it, dr.q); }
    delete st.drops[k];
  }
}

// ---------------------------------------------------------------- Quests
function ruleQuestAccept(env) {
  const { st, p } = env;
  const q = quest(p.questId);
  if (!q || (!q.repeatable && st.quests.done.includes(q.id))) return;
  if ((q.requires ?? []).some((r) => !st.quests.done.includes(r))) return;
  st.quests.active[q.id] = { kills: {} };
  for (const it of q.startItems ?? []) env.give(it.itemId, it.qty);
}

function ruleTurnIn(env) {
  const { st, p, lv, ctx, allow } = env;
  const q = quest(p.questId);
  const a = q && st.quests.active[q.id];
  if (!q || !a) return;
  delete st.quests.active[q.id];
  if (!q.repeatable && st.quests.done.includes(q.id)) return;
  if ((q.requires ?? []).some((r) => !st.quests.done.includes(r))) return;
  if (q.requiresChoice && st.quests.choices[q.requiresChoice[0]] !== q.requiresChoice[1]) return;
  if ((q.minLevel ?? 1) > lv) return;
  // Tötungsziele: der Server hat die Kills seit der Annahme selbst gezählt (Altbestand vor dem Buch: vertraut)
  if (!a.legacy) {
    for (const o of q.objectives) {
      if (o.kind !== 'kill') continue;
      const targets = [].concat(o.target);
      const n = targets.includes('*') ? Object.values(a.kills).reduce((s, x) => s + x, 0) : targets.reduce((s, t) => s + (a.kills[t] ?? 0), 0);
      if (n < o.count) return;
    }
  }
  const picked = q.choices ? q.choices.find((c) => c.id === p.choice) : null;
  if (q.choices && !picked) return;
  if (q.repeatable) st.quests.rep[q.id] = (st.quests.rep[q.id] ?? 0) + 1;
  else st.quests.done.push(q.id);
  if (picked) st.quests.choices[q.id] = picked.id;
  const rw = q.rewards ?? {}, pr = picked?.rewards ?? {};
  allow.gold += (rw.gold ?? 0) + (pr.gold ?? 0);
  let xp = (rw.xp ?? 0) + (pr.xp ?? 0);
  if (rw.reachLevel) xp = Math.max(xp, totalXpForLevel(rw.reachLevel) - env.b.xp);
  allow.xp += lv >= LEVEL_CAP ? 0 : xp;
  for (const it of rw.items ?? []) env.give(it.itemId, it.qty ?? 1);
  (rw.gear ?? []).forEach((spec, i) => { const id = pickRewardGear(spec, ctx.classId, i); if (id) env.give(id, 1); });
  for (const it of pr.items ?? []) env.give(it.itemId, it.qty ?? 1);
}

// ---------------------------------------------------------------- Händler, Verkauf, Schmiede
function vendorHas(vendorId, itemId) {
  const v = VENDORS[vendorId];
  if (!v) return false;
  if ((v.goods ?? []).includes(itemId)) return true;
  if (v.gear === false) return false;
  const [lo, hi] = v.levels ?? [1, 20];
  const d = ITEMS[itemId];
  return !!d?.slot && !d.source && (d.rarity === 'common' || d.rarity === 'uncommon') && d.ilvl >= lo && d.ilvl <= hi;
}

function ruleBuy(env) {
  const { p, d } = env;
  const id = p.itemId, qty = Math.max(1, posInt(p.qty ?? 1));
  if (!vendorHas(p.vendorId, id)) return;
  if (!paid(env, buyPrice(ITEMS[id]) * qty)) return;
  env.give(id, qty);
}

// Verkauf: Gold höchstens zum Verkaufswert der abgegebenen Stücke, soweit das Buch sie kennt
function ruleSell(env) {
  const { b, d } = env;
  for (const [id, q] of Object.entries(d.items)) {
    if (q >= 0) continue;
    const def = ITEMS[id];
    if (!def || def.type === 'quest' || !def.value) continue;
    env.allow.gold += def.value * Math.min(-q, b.items[id] ?? 0);
  }
}

function ruleCraft(env) {
  const { p, d } = env;
  const r = RECIPES[p.recipeId];
  if (!r || (r.level ?? 1) > env.lv) return;
  if (!paid(env, r.gold ?? 0, r.mats.filter((m) => m.itemId !== r.result))) return;
  env.give(r.result, r.qty ?? 1);
}

// ---------------------------------------------------------------- Glutprüfung, Tagesbelohnung, Auftragsbrett
function ruleTrialStart(env) {
  const { st, p, lv, ctx } = env;
  const t = posInt(p.tier);
  if (lv < TRIAL_REQUIRES.level || !st.quests.done.includes(TRIAL_REQUIRES.quest)) return;
  if (t < 1 || t > Math.min(TRIAL_MAX_TIER, st.trial.best + 1)) return;
  const spec = trialSpec(t, 1, lv, st.quests.done);
  st.trial.run = { tier: t, at: ctx.at, level: spec.level ?? lv };
}

function gearRoll(env, label, level, rarityOf) {
  const roll = takeRoll(env, label);
  if (!roll) return null;
  return pickEquipment({ level, rarity: rarityOf(roll.rng), classId: env.ctx.classId, rng: roll.rng });
}

function ruleDailyLogin(env) {
  const { st, e, lv, allow } = env;
  const today = boardDay(env.ctx.at);
  if (today <= st.daily.day) return;
  st.daily.day = today;
  if (e.res?.quiet && !st.daily.streak) return;
  st.daily.streak = st.daily.streak % STREAK_DAYS + 1;
  const r = loginReward(st.daily.streak, lv);
  allow.gold += r.gold;
  for (const it of r.items) env.give(it.itemId, it.qty);
  if (r.gear) { const id = gearRoll(env, 'daily', lv, (rng) => (r.gear.epic && rng() < r.gear.epic ? 'epic' : r.gear.rarity)); if (id) env.give(id, 1); }
}

function ruleChallenge(env) {
  const { st, lv, allow } = env;
  const week = boardWeek(env.ctx.at);
  if (st.daily.cweek >= week) return;
  st.daily.cweek = week;
  const r = challengeReward(lv);
  allow.gold += r.gold;
  for (const it of r.items) env.give(it.itemId, it.qty);
  const id = gearRoll(env, 'daily', lv, (rng) => (r.gear.epic && rng() < r.gear.epic ? 'epic' : r.gear.rarity));
  if (id) env.give(id, 1);
}

function boardRoll(st, at) {
  const bd = st.board, d = boardDay(at), w = boardWeek(at);
  if (w > bd.week) { bd.week = w; bd.weekDone = 0; bd.weekClaimed = false; }
  if (d > bd.day) { bd.day = d; bd.claimed = []; }
  return bd;
}

function ruleBoardClaim(env) {
  const { st, p, lv, allow } = env;
  const bd = boardRoll(st, env.ctx.at);
  const id = String(p.offerId ?? '');
  if (!id.startsWith(`${bd.day}_`) || bd.claimed.includes(id) || bd.claimed.length >= BOARD_OFFERS) return;
  const idx = posInt(id.slice(id.indexOf('_') + 1));
  if (idx >= BOARD_OFFERS) return;
  // Die Aufträge hängen an der Stufe zu Tagesbeginn: höchste mögliche Belohnung für diesen Platz bis zur eigenen Stufe
  let best = null;
  for (let L = 1; L <= lv; L++) {
    const o = boardOffers(bd.day, L)[idx];
    if (!o) continue;
    const r = offerRewards(o, lv);
    if (!best || r.gold + r.xp > best.gold + best.xp) best = r;
  }
  if (!best) return;
  bd.claimed.push(id);
  bd.weekDone++;
  allow.gold += best.gold; allow.xp += best.xp;
  for (const it of best.items) env.give(it.itemId, it.qty);
}

function ruleBoardWeek(env) {
  const { st, lv, allow } = env;
  const bd = boardRoll(st, env.ctx.at);
  if (bd.weekClaimed || bd.weekDone < WEEK_GOAL) return;
  bd.weekClaimed = true;
  const chest = weekChest(lv);
  allow.gold += chest.gold;
  for (const m of chest.mats) env.give(m.itemId, m.qty);
  const id = gearRoll(env, 'board', lv, (rng) => (rng() < chest.gear.rare ? 'rare' : 'uncommon'));
  if (id) env.give(id, 1);
}

// ---------------------------------------------------------------- Gold aus anderen Quellen
function ruleWalletGold(env) {
  const { st, p, lv, allow } = env;
  if (p.source !== 'pvp') return; // Shop, Postfach: über ihre eigenen Commands; Konsole: nie
  const day = boardDay(env.ctx.at);
  if (st.pvp.day !== day) { st.pvp.day = day; st.pvp.n = 0; }
  if (st.pvp.n >= DAILY_REWARDS) return;
  st.pvp.n++;
  allow.gold += goldFor(lv, 1);
}

function ruleShopCredit(env) {
  const { st, p, ctx, allow } = env;
  const o = ctx.orders?.get?.(p.orderId);
  if (!o || st.shop.credited.includes(p.orderId)) return;
  st.shop.credited.push(p.orderId);
  trim(st.shop.credited, 200);
  allow.gold += posInt(o.gold);
}

// ---------------------------------------------------------------- Erfolge
// ---------------------------------------------------------------- Schmiede, Bank
// Verstärkung, Verzauberung und Bankausbau zählen nur, wenn der Preis im selben Eintrag bezahlt wurde.
function ruleUpgrade(env) {
  const { b, p, d, lv } = env;
  if (!EQUIP_SLOTS.includes(p.slot)) return;
  const cur = b.items[upId(p.slot)] ?? 0;
  if (cur >= UPGRADE_MAX) return;
  const cost = upgradeCost(cur);
  if (lv >= cost.reqLevel && paid(env, cost.gold, cost.mats)) env.give(upId(p.slot), 1);
}
function ruleEnchant(env) {
  const { p, d, lv } = env;
  const e = Object.hasOwn(ENCHANTS, p.enchantId) ? ENCHANTS[p.enchantId] : null;
  if (!e || !e.slots.includes(p.slot) || !EQUIP_SLOTS.includes(p.slot)) return;
  if (lv >= e.level && paid(env, e.gold, e.mats)) env.give(enId(p.slot, p.enchantId), 1);
}
function ruleBankExpand(env) {
  const step = env.b.items[BANK_ID] ?? 0;
  if (step < BANK_SIZES.length - 1 && paid(env, BANK_COSTS[step])) env.give(BANK_ID, 1);
}

// Erfolge mit Belohnung, die das Buch zählt: Bedingung prüft der Server selbst (ACH_CHECK). Ohne Prüfung keine Buchung;
// der Test verlangt für jede gezählte Belohnung eine Prüfung.
export const ACH_CHECK = {
  upgrade_15: ({ b, allow }) => EQUIP_SLOTS.some((k) => (b.items[upId(k)] ?? 0) + (allow.items[upId(k)] ?? 0) >= UPGRADE_MAX),
  trial_20: ({ st }) => st.trial.best >= 20,
};
export function achievementItem(id, classId) {
  const r = ACHIEVEMENTS[id]?.reward;
  if (r?.kind === 'item') { const item = rewardItemId(r, CLASSES[classId]?.primary); return counted(item) && isTracked(item) ? item : null; }
  if (r?.kind === 'mount') return COUNTED_MOUNTS[r.id] ?? null;
  return null;
}
function ruleAchievements(env) {
  const { st, e, ctx } = env;
  for (const id of Array.isArray(e.a) ? e.a.slice(0, 20) : []) {
    if (!Object.hasOwn(ACHIEVEMENTS, id) || !ACHIEVEMENTS[id].reward || st.ach.includes(id)) continue;
    const item = achievementItem(id, ctx.classId);
    if (item && !ACH_CHECK[id]?.(env)) continue;
    st.ach.push(id);
    if (item) env.give(item, 1);
  }
}

// Bestellungen, die der Worker vor applyEntries nachschlagen muss
export function ordersNeeded(entries) {
  const ids = new Set();
  for (const e of entries ?? []) if (e?.t === 'shop:credit' && typeof e.p?.orderId === 'string' && /^[0-9a-f-]{36}$/i.test(e.p.orderId)) ids.add(e.p.orderId);
  return [...ids].slice(0, 20);
}

export const _test = { MAX_LEVEL, enemyOf, vendorHas, DAY };
