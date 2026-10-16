// Fortschrittsbuch: spielt das echte Spiel (GameState + Commands von Thread C) mit dem Aufzeichner (client.js) und
// prüft mit den Regeln des Servers (rules.js): Ehrliches Spiel landet vollständig im Buch, Schummeln nicht.
//   node src/ledger/test/ledger.test.mjs
import assert from 'node:assert/strict';
import { questStatus, setWorldFeatures, countItem } from '../../progression/selectors.js';
import { ITEMS } from '../../progression/items.js';
import { ENEMY_TYPES } from '../../entities/enemyTypes.js';
import { RARE_ENEMIES } from '../../progression/rares.js';
import { TRIAL_ZONE } from '../../progression/trials.js';
import { boardOffers, WEEK_GOAL } from '../../progression/board.js';
import { valuesOfSlices, valuesOf, COUNTED_MOUNTS } from '../values.js';
import { freshState, openSession, applyEntries, levelForXp, RATE, _test, ACH_CHECK, achievementItem } from '../rules.js';
import { buyPrice, ITEMS as ALL_ITEMS } from '../../progression/items.js';
import { totalXpForLevel as xpFor } from '../../progression/xp.js';
import { ledgerRng } from '../rng.js';
import { ENCHANTS } from '../../progression/smithing.js';
import { ACHIEVEMENTS } from '../../progression/achievements.js';
import { CLASSES } from '../../character/classes.js';
import { DAY, T0, makeGame, bookValues, assertInSync, levelOf, kill, TRASH, playQuest, housekeeping } from './harness.mjs';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('Würfel: gleiche Folge für gleiche Sitzung, Art und Nummer', () => {
  const a = ledgerRng('x', 'loot', 3), b = ledgerRng('x', 'loot', 3), c2 = ledgerRng('x', 'loot', 4);
  const s = [a(), a(), a()];
  assert.deepEqual(s, [b(), b(), b()]);
  assert.notEqual(s[0], c2());
  assert.ok(s.every((x) => x >= 0 && x < 1));
});

test('Werte: Reittiere mit Gegenstand zählen, Questgegenstände nicht', () => {
  assert.ok(Object.keys(COUNTED_MOUNTS).length >= 5);
  const v = valuesOfSlices({ inventory: { slots: [{ itemId: 'minor_potion', qty: 3 }, { itemId: Object.keys(ITEMS).find((id) => ITEMS[id].type === 'quest'), qty: 1 }], equipment: {}, mats: { wolf_pelt: 2 } }, wallet: { gold: 5 }, progress: { xp: 7 } });
  assert.deepEqual(v, { xp: 7, gold: 5, items: { minor_potion: 3, wolf_pelt: 2 } });
});

test('Ehrliche Kampagne bis Stufe 40: Buch = Spielstand, keine Abweichung', () => {
  const g = makeGame({ classId: 'mage' });
  setWorldFeatures(['escort', 'defend']);
  const stats = { quests: 0, skipped: 0 };
  for (let guard = 0; guard < 600 && g.state.slices.progress.level < 40; guard++) {
    const all = g.content.all('quest').filter((q) => questStatus(g.state, g.content, q.id) === 'available');
    let avail = all.filter((q) => !q.repeatable && q.level <= g.state.slices.progress.level + 2).sort((a, b) => a.level - b.level);
    if (!avail.length) avail = all.filter((q) => q.repeatable).sort((a, b) => b.level - a.level);
    if (!avail.length) break;
    playQuest(g, avail[0], stats);
    housekeeping(g);
    assertInSync(g, `nach ${avail[0].id}`);
  }
  assert.ok(g.state.slices.progress.level >= 38, `Stufe ${g.state.slices.progress.level}`);
  assert.ok(stats.quests > 20);
  const sinks = Object.entries(g.server.book.items).filter(([id]) => id.startsWith('^'));
  assert.ok(sinks.some(([id]) => id.startsWith('^up:')) && sinks.some(([id]) => id === '^bank') && sinks.some(([id]) => id.startsWith('^en:')), JSON.stringify(sinks));
  console.log(`    ${sinks.map(([id, n]) => `${id} ${n}`).join(', ')}`);
  console.log(`    Stufe ${g.state.slices.progress.level}, ${stats.quests} Quests, ${g.state.slices.progress.stats.kills} Kills, ${g.state.slices.wallet.gold} Gold, ${g.tap.session.n.loot} Würfe`);
  // Zonenwechsel mit liegengebliebener Bossbeute: Beutebrief, dann aus dem Postfach nehmen
  const drops = kill(g, 'ember_tyrant', { pick: false, secs: 200 });
  assert.ok(drops.length);
  g.c('loot:reset');
  assert.ok(g.state.slices.mail.loot.length);
  assertInSync(g, 'Bossbeute im Postfach');
  g.c('mail:takeLoot', { id: g.state.slices.mail.loot[0].id });
  assertInSync(g, 'Postfach geleert');
});

test('Tempo: Bot mit 20 Kills je Sekunde bekommt nur den Vorrat plus 1 Kill je Sekunde', () => {
  const g = makeGame({ classId: 'warrior' });
  for (let i = 0; i < 2000; i++) kill(g, 'wolf', { secs: 0.05 });
  g.flush();
  const xp = g.state.slices.progress.xp, booked = g.server.book.xp;
  assert.ok(xp > booked * 2, `Spiel ${xp} Buch ${booked}`);
  assert.ok(g.server.miss.length > 0);
});

test('Schummeln: erfundenes Gold, Gegenstände, Erfahrung und Beute kommen nicht ins Buch', () => {
  const g = makeGame({ classId: 'rogue' });
  kill(g, 'wolf');
  assertInSync(g, 'Start');
  const before = bookValues(g.server.book);
  g.c('wallet:addGold', { amount: 100000, source: 'console' });
  g.c('inventory:add', { itemId: 'minor_potion', qty: 50 });
  g.c('progress:grantXp', { amount: 50000 });
  g.c('progress:kill', { type: 'ash_sovereign', level: 40, isBoss: true, now: g.clock.t }); // Stufe zu hoch für Zone/Spieler? Boss 40 ist erlaubt …
  g.flush();
  const after = bookValues(g.server.book);
  assert.equal(after.gold, before.gold);
  assert.equal(after.items.minor_potion ?? 0, before.items.minor_potion ?? 0);
  assert.ok(after.xp - before.xp < 50000);
  // Beute ohne Kill und Beute, die der Würfel nicht ergibt
  const t = g.tap;
  const k0 = t.session.k;
  t.queue.push({ s: 'S1', k: k0 + 1, t: 'loot:roll', p: { source: 'kill', id: 'wolf', level: 1 }, r: [['loot', (t.session.n.loot ?? 0) + 1]], res: { drops: [{ it: 'tyrant_plate', q: 1 }] }, now: g.clock.t });
  t.queue.push({ s: 'S1', k: k0 + 2, t: 'loot:claim', p: { key: `S1:${(t.session.n.loot ?? 0) + 1}:0` }, d: { i: { tyrant_plate: 1 } }, now: g.clock.t });
  t.session.k += 2; t.session.n.loot = (t.session.n.loot ?? 0) + 1;
  g.flush();
  assert.equal(g.server.book.items.tyrant_plate ?? 0, 0);
});

test('Schmiede und Bank: nur bezahlte Verstärkung, Verzauberung und Bankausbau kommen ins Buch', () => {
  const g = makeGame({ classId: 'warrior' });
  g.c('wallet:addGold', { amount: 50000, source: 'console' }); // nicht im Buch: die Schmiede kann davon nicht bezahlt werden
  const t = g.tap;
  // Gemeldet ohne Bezahlung (ehrliche Ausgaben spielt die Kampagne über housekeeping)
  const k0 = t.session.k;
  t.queue.push({ s: 'S1', k: k0 + 1, t: 'smith:upgrade', p: { slot: 'chest' }, d: { i: { '^up:chest': 5 } }, now: g.clock.t });
  t.queue.push({ s: 'S1', k: k0 + 2, t: 'smith:enchant', p: { slot: 'weapon', enchantId: Object.keys(ENCHANTS)[0] }, d: { i: { [`^en:weapon:${Object.keys(ENCHANTS)[0]}`]: 1 } }, now: g.clock.t });
  t.queue.push({ s: 'S1', k: k0 + 3, t: 'bank:expand', p: {}, d: { i: { '^bank': 3 } }, now: g.clock.t });
  t.session.k += 3;
  g.flush();
  assert.equal(g.server.book.items['^up:chest'] ?? 0, 0);
  assert.equal(g.server.book.items[`^en:weapon:${Object.keys(ENCHANTS)[0]}`] ?? 0, 0);
  assert.ok((g.server.book.items['^bank'] ?? 0) <= 1);
});

test('Bezahlen mit Gold oder Gegenständen, die das Buch nicht kennt, bringt nichts; Erfolge nur mit erfüllter Bedingung', () => {
  const g = makeGame({ classId: 'warrior' });
  const t = g.tap;
  const push = (e) => { t.queue.push({ s: 'S1', k: ++t.session.k, now: g.clock.t, p: {}, ...e }); };
  g.flush();
  g.server.book.xp = xpFor(35); g.server.book.gold = 1000; // Stufe und Gold reichen, Zutaten fehlen im Buch
  const gold0 = g.server.book.gold, price = buyPrice(ALL_ITEMS.minor_potion) * 500;
  assert.ok(price > gold0);
  for (let i = 0; i < 20; i++) push({ t: 'craft:make', p: { recipeId: 'brew_supreme_potion' }, d: { g: -20, i: { troll_fat: -2, spore_cap: -1, supreme_potion: 2 } } });
  push({ t: 'shop:buy', p: { vendorId: 'smith_brom', itemId: 'minor_potion', qty: 500 }, d: { g: -price, i: { minor_potion: 500 } } });
  push({ t: 'inventory:sort', a: ['upgrade_15'], d: { i: { forge_heart_str: 1 } } });
  g.flush();
  const b = g.server.book;
  assert.equal(b.items.supreme_potion ?? 0, 0, 'Rezept ohne Zutaten im Buch');
  assert.ok((b.items.minor_potion ?? 0) <= 5, 'Kauf auf Pump');
  assert.equal(b.items.forge_heart_str ?? 0, 0, 'Erfolg ohne +15');
  assert.ok(b.gold <= gold0);
  assert.ok(!b.state.ach.includes('upgrade_15'), 'Erfolg bleibt offen, bis die Bedingung erfüllt ist');
});

test('Jede Erfolgsbelohnung, die das Buch zählt, hat eine Prüfung des Servers', () => {
  for (const id of Object.keys(ACHIEVEMENTS)) {
    for (const cls of Object.keys(CLASSES)) if (achievementItem(id, cls)) assert.ok(ACH_CHECK[id], `${id} (${cls}) ohne Prüfung`);
  }
});

test('Wiederholt gemeldete Einträge zählen einmal', () => {
  const g = makeGame();
  for (let i = 0; i < 5; i++) kill(g, 'wolf');
  const copy = structuredClone(g.tap.queue);
  g.flush();
  const xp = g.server.book.xp;
  const r = applyEntries(g.server.book, copy, { classId: g.classId, now: g.clock.t + 2000, sid: 'S1', orders: new Map() });
  assert.equal(r.book.xp, xp);
});

test('Seltene Gegner, Champions, Truhen, Bosstruhe', () => {
  const g = makeGame({ classId: 'ranger' });
  g.c('progress:grantXp', { amount: 0 });
  const rare = Object.entries(RARE_ENEMIES).find(([, r]) => r.level <= 5);
  kill(g, rare[1].base, { level: rare[1].level, rareId: rare[0] });
  kill(g, 'wolf', { champion: true });
  g.clock.t += 20000;
  const r = g.c('loot:roll', { source: 'chest', id: 'chest_a', level: 1 });
  for (const x of r.drops) if (x.dropId) g.c('loot:claim', { dropId: x.dropId });
  assertInSync(g, 'Seltene, Champion, Truhe');
  // Gleicher seltener Gegner sofort wieder: keine Erfahrung
  const xp = g.server.book.xp;
  kill(g, rare[1].base, { level: rare[1].level, rareId: rare[0] });
  g.flush();
  assert.equal(g.server.book.xp, xp);
});

test('Tagesbelohnung, Auftragsbrett, Wochentruhe, Glutprüfung', () => {
  const g = makeGame({ classId: 'warrior' });
  g.c('progress:grantXp', { amount: 0 });
  // Stufe 20 und Geschichte bis Ignaroth als Altbestand (Buch neu angelegt)
  const s = g.state;
  s.slices.progress.level = 20; s.slices.progress.xp = 54695;
  s.slices.quests.completed.push('q_ignaroth');
  Object.assign(s.slices.board, { day: 0, week: 0 }); // Brett beim Anlegen auf Date.now(), hier zählt die Testuhr ab T0
  const snap = s.snapshot(), v = valuesOf(snap);
  g.server.book = { xp: v.xp, gold: v.gold, items: v.items, state: freshState(snap) };
  openSession(g.server.book.state, { sid: 'S1', seed: 'seed-1', at: g.clock.t });
  g.tap.open({ sid: 'S1', seed: 'seed-1' });
  g.tap.state.meta.ledger.q = [];
  let weekly = 0;
  for (let day = 0; day < 8; day++) {
    g.clock.t = T0 + day * DAY + 3600000;
    g.c('daily:login', { now: g.clock.t });
    g.c('board:sync', { now: g.clock.t });
    for (const o of boardOffers(Math.floor(g.clock.t / DAY), s.slices.board.level)) {
      g.c('board:accept', { offerId: o.id, now: g.clock.t });
      s.slices.board.taken[o.id] = o.count; // Fortschritt (Kills/Sammeln) hier abgekürzt
      g.c('board:claim', { offerId: o.id, now: g.clock.t });
    }
    if (s.slices.board.weekDone >= WEEK_GOAL && g.c('board:claimWeek', { now: g.clock.t }).ok) weekly++;
    kill(g, 'steppe_warlord', { level: 25 }); // erster Sieg des Tages (Elite)
    assertInSync(g, `Tag ${day}`);
  }
  assert.ok(s.slices.daily.rounds >= 1);
  assert.equal(weekly, 1);
  // Glutprüfung Stufe 1
  g.clock.t += 60000;
  const st = g.c('trial:start', { tier: 1 });
  assert.ok(st.ok, JSON.stringify(st));
  s.slices.world.zoneId = TRIAL_ZONE;
  const run = s.slices.trials.run;
  for (let i = 0; run.phase === 'clear' && i < 200; i++) kill(g, run.pool[i % run.pool.length], { level: run.level, secs: 2 });
  assert.equal(run.phase, 'boss');
  kill(g, run.bossId, { level: run.level, secs: 30 });
  assert.equal(run.phase, 'done');
  g.c('trial:leave');
  s.slices.world.zoneId = 'ashen_steppe';
  g.c('loot:reset');
  assertInSync(g, 'Glutprüfung');
});

test('Neue Sitzung: Einträge vor dem Öffnen bekommen die Sitzung, frühere Sitzung wird noch angenommen', () => {
  const g = makeGame();
  for (let i = 0; i < 3; i++) kill(g, 'wolf');
  // Neuladen: alte Einträge bleiben in der Warteschlange, neue Sitzung S2
  g.tap.close();
  kill(g, 'wolf'); // ohne Sitzung: Beute wartet im echten Spiel (ProgressionSystem), hier ohne Beute aufheben
  openSession(g.server.book.state, { sid: 'S2', seed: 'seed-2', at: g.clock.t });
  g.tap.open({ sid: 'S2', seed: 'seed-2' });
  for (let i = 0; i < 3; i++) kill(g, 'wolf');
  for (const sid of ['S1', 'S2']) {
    const r = applyEntries(g.server.book, g.tap.queue.filter((e) => e.s === sid), { classId: g.classId, now: g.clock.t + 1000, sid, orders: new Map() });
    g.server.book = r.book;
    g.tap.confirm(sid, r.accepted);
  }
  assert.equal(g.tap.queue.length, 0);
  assert.equal(g.server.book.xp, g.state.slices.progress.xp);
});

test('Gegnerstufen: höchste Stufe je Typ deckt alle Varianten ab', () => {
  for (const [id, d] of Object.entries(ENEMY_TYPES)) assert.ok(_test.MAX_LEVEL[id] >= (d.levels?.[1] ?? d.level ?? 1), id);
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(54695), 20);
  assert.ok(RATE.perSecond > 0);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`ok  ${name}`); } catch (e) { failed++; console.log(`FEHLER  ${name}\n  ${e.stack?.split('\n').slice(0, 6).join('\n  ')}`); }
}
if (failed) { console.log(`${failed} von ${tests.length} Tests fehlgeschlagen`); process.exit(1); }
console.log(`alle ${tests.length} Tests grün`);
