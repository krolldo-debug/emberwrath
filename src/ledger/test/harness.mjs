// Gemeinsamer Aufbau der Tests des Fortschrittsbuchs: echtes Spiel (GameState + Commands von Thread C) mit Aufzeichner
// (client.js) und Abläufen wie ProgressionSystem. Ohne session: kein Server, die Sitzung öffnet der Test selbst.
import assert from 'node:assert/strict';
import { EventBus } from '../../core/EventBus.js';
import { Content } from '../../core/Content.js';
import { GameState } from '../../core/GameState.js';
import { LocalAuthority } from '../../core/Authority.js';
import { registerProgressionContent, registerProgressionState } from '../../progression/logic.js';
import { countItem } from '../../progression/selectors.js';
import { ITEMS } from '../../progression/items.js';
import { ENCHANTS } from '../../progression/smithing.js';
import { ENEMY_TYPES } from '../../entities/enemyTypes.js';
import { LedgerTap } from '../client.js';
import { valuesOfSlices, valuesOf } from '../values.js';
import { freshState, openSession, applyEntries } from '../rules.js';
export const DAY = 86400000;
export const T0 = Date.UTC(2026, 9, 12, 8); // Montag

// Spielwelt minimal (Threads A/B nachgebildet): Zone, Bosse, Reittiere, Postfach mit Beutebriefen
export function makeGame({ classId = 'mage', seed = 'seed-1', clock = { t: T0 }, session = true } = {}) {
  const bus = new EventBus(), content = new Content();
  const state = new GameState(bus, new LocalAuthority(content), content);
  state.defineSlice('world', { create: () => ({ zoneId: 'emberhollow', bossesDefeated: [] }) });
  state.defineSlice('character', { create: () => ({ name: 'Sim', classId, mounts: { owned: [], active: null, riding: false } }) });
  registerProgressionContent(content);
  // Gegner wie world/index.js
  for (const [id, def] of Object.entries(ENEMY_TYPES)) content.define('enemy', id, { name: def.name, level: def.level ?? def.levels?.[0] ?? 1, levels: def.levels ?? null, xp: def.xp, family: def.family, boss: !!def.boss, bossId: def.bossId ?? null, elite: !!def.elite });
  content.defineAll('mount', Object.fromEntries(Object.values(ITEMS).filter((d) => d.mountId).map((d) => [d.mountId, { name: d.mountId }])));
  let tap = null;
  registerProgressionState(state, { rng: Math.random, roll: (label) => tap?.roll(label) ?? Math.random });
  state.defineCommand('mount:learn', (s, { mountId }) => {
    const m = s.get('character').mounts;
    if (m.owned.includes(mountId)) return { ok: false, known: true };
    m.owned.push(mountId); m.active ??= mountId;
    return { ok: true };
  }, { authoritative: true });
  state.defineSlice('mail', { create: () => ({ loot: [], next: 1 }) });
  state.defineCommand('mail:loot', (s, { drops = [] }) => {
    const m = s.get('mail'), items = [];
    let gold = 0;
    for (const d of drops) { if (d.gold) gold += d.gold; else items.push({ itemId: d.itemId, qty: d.qty }); }
    if (!items.length && !gold) return { ok: false };
    m.loot.push({ id: `b${m.next++}`, items, gold });
    return { ok: true };
  }, { authoritative: true });
  state.defineCommand('mail:takeLoot', (s, { id }) => {
    const m = s.get('mail'), i = m.loot.findIndex((l) => l.id === id);
    if (i < 0) return { ok: false };
    const l = m.loot[i];
    for (const it of l.items) s.commit('inventory:add', { itemId: it.itemId, qty: it.qty, source: 'mail' });
    if (l.gold) s.commit('wallet:addGold', { amount: l.gold, source: 'loot' });
    m.loot.splice(i, 1);
    return { ok: true };
  }, { authoritative: true });
  bus.on('loot:left', ({ drops }) => state.commit('mail:loot', { drops }));
  tap = new LedgerTap(state, { now: () => clock.t }).install();
  const c = (t, p) => state.commit(t, p);
  if (!session) return { state, content, bus, tap, c, clock, classId };

  // Server: Buch aus dem Ausgangsstand, eine Sitzung
  const snap = state.snapshot();
  const v = valuesOf(snap);
  const server = { book: { xp: v.xp, gold: v.gold, items: v.items, state: freshState(snap) }, miss: [] };
  const sid = 'S1';
  openSession(server.book.state, { sid, seed, at: clock.t });
  tap.open({ sid, seed });
  const flush = () => {
    const entries = tap.queue.filter((e) => e.s === sid);
    g0.lastEntries = structuredClone(entries);
    const r = applyEntries(server.book, entries, { classId, now: clock.t + 1000, sid, orders: new Map() });
    assert.ok(!r.error, r.error);
    server.book = r.book;
    server.miss.push(...r.miss);
    tap.confirm(sid, r.accepted);
    return r;
  };
  const g0 = { state, content, bus, tap, server, flush, c, clock, classId };
  return g0;
}

export const bookValues = (b) => ({ xp: b.xp, gold: b.gold, items: Object.fromEntries(Object.entries(b.items).filter(([, q]) => q)) });
export function assertInSync(g, why = '') {
  g.flush();
  const have = valuesOfSlices(g.state.slices), book = bookValues(g.server.book);
  if (g.server.miss.length) { const k = g.server.miss[0].k; const e = g.lastEntries?.find((x) => x.k === k); console.log(JSON.stringify(e)); const n = e?.p?.key?.split(':')[1]; if (n) console.log(JSON.stringify(g.lastEntries.find((x) => x.t === 'loot:roll' && x.r?.[0]?.[1] == n))); }
  if (g.server.miss.length) assert.fail(`${why}: Abweichungen ${JSON.stringify(g.server.miss.slice(0, 5))}`);
  assert.deepEqual(book, have, why);
}

// Spieler-Abläufe wie ProgressionSystem: Kill → progress:kill + loot:roll, alles aufheben
export const levelOf = (type) => { const d = ENEMY_TYPES[type]; return d.levels ? d.levels[0] : d.level ?? 1; };
export function kill(g, type, { level = levelOf(type), rareId, champion = false, summoned = false, pick = true, secs = 4 } = {}) {
  const d = ENEMY_TYPES[type];
  g.clock.t += secs * 1000;
  const bossId = d.bossId ?? (d.boss ? type : undefined);
  g.c('progress:kill', { type, level, isBoss: !!d.boss, bossId, elite: !!d.elite || !!rareId, summoned, rareId, champion: champion ? { affixes: ['flink'] } : null, now: g.clock.t });
  if (summoned) return [];
  const r = g.c('loot:roll', { source: 'kill', id: type, level, elite: !!d.elite || !!rareId, isBoss: !!d.boss, bossId, rareId, champion });
  if (d.boss) g.c('quest:event', { kind: 'boss', target: bossId });
  if (d.boss) g.c('quest:bossReward', { bossId });
  if (pick) for (const x of r.drops) if (x.dropId) g.c('loot:claim', { dropId: x.dropId });
  return r.drops;
}

// Kampagne (wie progression/test/pacing.mjs, aber mit echter Beute statt inventory:add)
export const TRASH = {
  emberhollow: ['wolf'], catacombs: ['skeleton', 'archer'], ashwood: ['bandit', 'ash_boar'], sunken_temple: ['drowned', 'tide_cultist'], cinder_peaks: ['fire_imp', 'magma_hound'], molten_forge: ['forge_golem', 'flame_acolyte'],
  ashen_steppe: ['steppe_raider', 'dust_hyena'], howling_barrow: ['barrow_wight', 'grave_hound'], blighted_marsh: ['bog_lurker', 'swamp_leech'], spore_hollow: ['sporeling', 'fungal_brute'],
  frostspire: ['frost_wolf', 'ice_troll'], rime_caverns: ['ice_elemental', 'crystal_spider'], ember_wastes: ['ash_wraith', 'cinder_knight'], ashen_throne: ['throne_guard', 'ash_priest'],
};
export function playQuest(g, q, stats) {
  const { state, c } = g;
  c('quest:accept', { questId: q.id });
  for (const o of q.objectives) {
    if (o.zone) { if (state.slices.world.zoneId !== o.zone) c('loot:reset'); state.slices.world.zoneId = o.zone; }
    const zone = state.slices.world.zoneId;
    const targets = [].concat(o.target);
    for (let i = 0; i < o.count; i++) {
      const trash = TRASH[zone] ?? ['wolf'];
      const t = targets[i % targets.length];
      if (o.kind === 'kill') { kill(g, t === '*' ? trash[0] : t); kill(g, trash[i % trash.length]); }
      else if (o.kind === 'boss') { state.slices.world.bossesDefeated.push(o.target); kill(g, o.target, { secs: 150 }); }
      else if (o.kind === 'collect') {
        const from = o.from?.length ? o.from : trash;
        for (let k = 0; k < 400 && countItem(state, o.target) < o.count; k++) kill(g, from[k % from.length], { secs: ENEMY_TYPES[from[k % from.length]]?.boss ? 150 : 4 });
        if (countItem(state, o.target) < o.count) { stats.skipped++; return false; }
        break;
      } else if (o.kind === 'talk') c('quest:event', { kind: 'talk', target: o.target });
      else if (o.kind === 'reach') { c('quest:event', { kind: 'reach', target: targets[i] ?? targets[0] }); kill(g, trash[0]); }
      else if (o.kind === 'interact' || o.kind === 'sequence' || o.kind === 'use') { c('quest:event', { kind: 'interact', target: targets[i] ?? targets[0] }); kill(g, trash[0]); }
      else if (o.kind === 'escort' || o.kind === 'defend') { c('quest:event', { kind: o.kind, target: o.target }); for (let k = 0; k < 4; k++) kill(g, trash[k % trash.length]); }
    }
  }
  const r = c('quest:turnIn', { questId: q.id, choice: q.choices?.[0]?.id ?? null });
  if (!r.ok) { c('quest:abandon', { questId: q.id }); stats.skipped++; return false; }
  stats.quests++;
  return true;
}

// Haushalt: Plunder verkaufen, Tränke kaufen, Material einlagern, gelegentlich herstellen
export function housekeeping(g) {
  const { c, state } = g;
  c('shop:sellJunk', { vendorId: 'smith_brom' });
  c('inventory:sellJunk', { upTo: 'uncommon' });
  if (state.slices.wallet.gold > 300) c('shop:buy', { vendorId: 'smith_brom', itemId: 'minor_potion', qty: 2 });
  c('bank:depositMaterials');
  c('inventory:sort');
  // Goldausgaben, die bleiben (Buchposten ^bank, ^up:, ^en:)
  if (state.slices.wallet.gold > 3000) c('bank:expand');
  for (const slot of ['weapon', 'chest', 'ring']) if (state.slices.wallet.gold > 2000) c('smith:upgrade', { slot });
  if (!state.slices.inventory.enchants.weapon && state.slices.wallet.gold > 3000) {
    const id = Object.keys(ENCHANTS).find((k) => ENCHANTS[k].slots.includes('weapon') && ENCHANTS[k].level <= state.slices.progress.level);
    if (id) c('smith:enchant', { slot: 'weapon', enchantId: id });
  }
}

