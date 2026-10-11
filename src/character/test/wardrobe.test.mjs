// Garderobe (Thread A): node src/character/test/wardrobe.test.mjs
import assert from 'node:assert/strict';
import { EventBus } from '../../core/EventBus.js';
import { Content } from '../../core/Content.js';
import { GameState } from '../../core/GameState.js';
import { LocalAuthority } from '../../core/Authority.js';
import { EV } from '../../core/events.js';
import { registerProgressionContent, registerProgressionState } from '../../progression/logic.js';
import { installWardrobe, cleanWardrobe, hasLook, WARDROBE_EVENT, transmogCost, wardrobeCatalog } from '../wardrobe.js';
import { shownEquipment, resolveGear } from '../gearLook.js';

const tick = () => new Promise((r) => setTimeout(r, 0));
function setup(classId = 'warrior') {
  const bus = new EventBus(), content = new Content();
  const state = new GameState(bus, new LocalAuthority(content), content);
  state.defineSlice('world', { create: () => ({ zoneId: 'emberhollow', bossesDefeated: [] }) });
  state.defineSlice('character', {
    create: () => ({ name: 'T', classId, wardrobe: cleanWardrobe(null) }),
    deserialize: (raw) => ({ ...raw, wardrobe: cleanWardrobe(raw.wardrobe, (id) => hasLook(content.find('item', id))) }),
  });
  registerProgressionContent(content);
  registerProgressionState(state, { rng: Math.random });
  const game = { content, state };
  installWardrobe(game);
  const unlocked = [];
  bus.on(WARDROBE_EVENT, (e) => unlocked.push(...e.itemIds));
  return { bus, content, state, game, unlocked, c: (t, p) => state.commit(t, p) };
}
const slotOf = (state, id) => state.slices.inventory.slots.findIndex((s) => s?.itemId === id);

const tests = [];
const test = (n, f) => tests.push([n, f]);

test('Aufheben und Starten schaltet Aussehen frei, Tränke nicht', async () => {
  const { c, state, bus, unlocked } = setup();
  bus.emit(EV.GAME_STARTED, {});
  await tick();
  const w = state.slices.character.wardrobe;
  assert.ok(w.looks.includes('notched_blade') && w.looks.includes('recruit_mail'), 'Startausrüstung gesammelt');
  assert.ok(!w.looks.includes('minor_potion'));
  c('inventory:add', { itemId: 'iron_sword', qty: 1 });
  await tick();
  assert.ok(w.looks.includes('iron_sword'));
  assert.ok(unlocked.includes('iron_sword'));
  const n = w.looks.length;
  c('inventory:add', { itemId: 'iron_sword', qty: 1 });
  await tick();
  assert.equal(w.looks.length, n, 'nichts doppelt');
});

test('Aussehen überlagert die getragene Waffe, bleibt nach dem Verkauf', async () => {
  const { c, state, content } = setup();
  c('inventory:add', { itemId: 'iron_sword', qty: 1 });
  await tick();
  assert.equal(c('wardrobe:show', { slot: 'weapon', itemId: 'iron_sword' }).ok, true);
  assert.equal(shownEquipment(state.slices, content).weapon, 'iron_sword');
  assert.equal(state.slices.inventory.equipment.weapon, 'notched_blade', 'Werte bleiben von der echten Waffe');
  state.slices.inventory.slots[slotOf(state, 'iron_sword')] = null;   // verkauft
  assert.equal(shownEquipment(state.slices, content).weapon, 'iron_sword');
  assert.equal(resolveGear(shownEquipment(state.slices, content), content).weapon.icon, content.get('item', 'iron_sword').icon);
  c('wardrobe:show', { slot: 'weapon', itemId: null });
  assert.equal(shownEquipment(state.slices, content).weapon, 'notched_blade');
});

test('Gesperrt, falscher Platz, fremde Klasse, Helm ausblenden, leerer Platz', async () => {
  const { c, state, content } = setup('warrior');
  c('inventory:add', { itemId: 'short_bow', qty: 1 });
  c('inventory:add', { itemId: 'worn_boots', qty: 1 });
  await tick();
  assert.equal(c('wardrobe:show', { slot: 'weapon', itemId: 'starfall' }).reason, 'locked');
  assert.equal(c('wardrobe:show', { slot: 'head', itemId: 'worn_boots' }).reason, 'slot');
  assert.equal(c('wardrobe:show', { slot: 'weapon', itemId: 'short_bow' }).reason, 'class', 'Krieger führt keinen Bogen');
  assert.equal(c('wardrobe:show', { slot: 'ring', itemId: null }).reason, 'slot');
  assert.equal(c('wardrobe:show', { slot: 'chest', itemId: 'none' }).reason, 'slot');
  state.slices.inventory.equipment.feet = null;
  c('wardrobe:show', { slot: 'feet', itemId: 'worn_boots' });
  assert.equal(shownEquipment(state.slices, content).feet, null, 'ohne getragene Stiefel kein Aussehen');
  state.slices.inventory.equipment.head = 'worn_boots';  // irgendein getragener Kopf
  c('wardrobe:show', { slot: 'head', itemId: 'none' });
  assert.equal(shownEquipment(state.slices, content).head, null, 'Helm ausgeblendet');
});

test('Laden bereinigt, Paneldaten fassen gleiches Aussehen zusammen', async () => {
  const { state, content, game } = setup();
  state.load({ meta: {}, slices: { character: { name: 'T', classId: 'warrior', wardrobe: { looks: ['iron_sword', 'iron_sword', 'gibts_nicht', 'minor_potion', 'BAD ID', 7], shown: { weapon: 'iron_sword', head: 'none', chest: 'starfall' } } } } });
  const w = state.slices.character.wardrobe;
  assert.deepEqual(w.looks, ['iron_sword']);
  assert.deepEqual(w.shown, { weapon: 'iron_sword', chest: null, head: 'none', hands: null, feet: null });
  const e = game.character.wardrobe.entries('weapon');
  assert.equal(e.current, 'iron_sword');
  assert.equal(e.list.length, 1);
  assert.equal(e.list[0].shown, true);
  assert.ok(game.character.previewGear({ weapon: null }));
  // zwei Teile mit identischem Aussehen -> ein Eintrag
  const items = content.all('item').filter((d) => d.slot === 'weapon');
  const byLook = new Map();
  for (const d of items) { const k = JSON.stringify(resolveGear({ weapon: d.id }, content).weapon); byLook.set(k, [...(byLook.get(k) ?? []), d.id]); }
  const twin = [...byLook.values()].find((v) => v.length > 1);
  if (twin) {
    w.looks.push(...twin);
    const ids = game.character.wardrobe.entries('weapon').list.map((x) => x.itemId);
    assert.equal(ids.filter((id) => twin.includes(id)).length, 1, `gleiches Aussehen einmal (${twin.join(', ')})`);
  }
});

test('Skinsets: nur gekauft, nur eigene Klasse, ganzes Set anlegen', async () => {
  const { c, state, content, game } = setup('warrior');
  state.slices.shop = { owned: [] };
  const sword = 'set_glutthron_weapon';
  assert.ok(content.find('item', sword)?.lookOnly, 'Set-Teile sind Inhalte');
  // nie über Beute/Tasche freischaltbar
  c('wardrobe:unlock', { itemIds: [sword] });
  assert.ok(!state.slices.character.wardrobe.looks.includes(sword));
  assert.equal(c('wardrobe:show', { slot: 'weapon', itemId: sword }).reason, 'locked');
  assert.equal(c('wardrobe:showSet', { setId: 'set_glutthron' }).reason, 'locked');
  assert.ok(!game.character.wardrobe.entries('weapon').list.some((x) => x.itemId === sword));
  // gekauft: kontoweit über den Shop-Slice
  state.slices.shop.owned = ['look:set_glutthron'];
  const e = game.character.wardrobe.entries('weapon');
  assert.equal(e.list[0].itemId, sword, 'Set steht vorn');
  assert.equal(e.list[0].setId, 'set_glutthron');
  assert.equal(c('wardrobe:showSet', { setId: 'set_glutthron' }).ok, true);
  assert.equal(shownEquipment(state.slices, content).weapon, sword);
  assert.equal(shownEquipment(state.slices, content).chest, 'set_glutthron_chest');
  // Set immer komplett, auch ohne Helm, Handschuhe, Stiefel; Kopf über „Helm ausblenden“ abschaltbar
  const eq = state.slices.inventory.equipment;
  for (const k of ['head', 'hands', 'feet']) eq[k] = null;
  const bare = shownEquipment(state.slices, content);
  assert.deepEqual([bare.head, bare.hands, bare.feet], ['set_glutthron_head', 'set_glutthron_hands', 'set_glutthron_feet']);
  state.slices.character.wardrobe.shown.head = 'none';
  assert.equal(shownEquipment(state.slices, content).head, null, 'Helm ausgeblendet');
  state.slices.character.wardrobe.shown.head = 'set_glutthron_head';
  // gesammeltes Aussehen bleibt an ein getragenes Teil gebunden
  const keep = eq.weapon;
  eq.weapon = null;
  state.slices.character.wardrobe.looks.push('iron_sword');
  state.slices.character.wardrobe.shown.weapon = 'iron_sword';
  assert.equal(shownEquipment(state.slices, content).weapon, null);
  state.slices.character.wardrobe.shown.weapon = sword;
  assert.equal(shownEquipment(state.slices, content).weapon, sword, 'Set-Waffe auch ohne getragene Waffe');
  eq.weapon = keep;
  assert.equal(c('wardrobe:showSet', { setId: 'set_mondsichel' }).reason, 'class');
  // nicht mehr bezahlt: nicht mehr sichtbar, Laden behält es nicht in looks
  state.slices.shop.owned = [];
  assert.notEqual(shownEquipment(state.slices, content).weapon, sword);
  const clean = cleanWardrobe({ looks: [sword, 'iron_sword'], shown: { weapon: sword, chest: 'set_glutthron_head' } }, (id) => hasLook(content.find('item', id)));
  assert.deepEqual(clean.looks, ['iron_sword']);
  assert.equal(clean.shown.weapon, sword, 'gewählt bleibt, gilt aber nur mit Kauf');
  assert.equal(clean.shown.chest, null, 'falscher Platz verworfen');
});

test('Gewandmeisterin: kostet Gold je Platz, alles oder nichts, zurück und ausblenden frei', async () => {
  const { c, state, content, game } = setup();
  c('inventory:add', { itemId: 'iron_sword', qty: 1 });
  c('inventory:add', { itemId: 'varkhul_helm', qty: 1 });
  await tick();
  const wr = game.character.wardrobe, wallet = state.slices.wallet;
  const price = transmogCost(content.get('item', 'notched_blade').ilvl);
  assert.equal(wr.price('weapon'), price, 'Preis nach Stufe des getragenen Teils');
  assert.ok(transmogCost(40) > transmogCost(20) && transmogCost(20) > transmogCost(1), 'steigt mit der Stufe');
  wallet.gold = price - 1;
  assert.deepEqual(c('wardrobe:transmog', { changes: { weapon: 'iron_sword' } }), { ok: false, reason: 'gold', cost: price });
  assert.equal(state.slices.character.wardrobe.shown.weapon, null, 'nichts angelegt');
  wallet.gold = 1000;
  // leerer Kopfplatz: gesammelter Helm geht nicht, dann bleibt auch die Waffe unverändert
  assert.equal(state.slices.inventory.equipment.head ?? null, null);
  assert.equal(c('wardrobe:transmog', { changes: { weapon: 'iron_sword', head: 'varkhul_helm' } }).reason, 'empty');
  assert.equal(state.slices.character.wardrobe.shown.weapon, null);
  assert.equal(wallet.gold, 1000);
  const r = c('wardrobe:transmog', { changes: { weapon: 'iron_sword', head: 'none' } });
  assert.deepEqual(r, { ok: true, cost: price, slots: ['weapon', 'head'] }, 'Helm ausblenden kostet nichts');
  assert.equal(wallet.gold, 1000 - price);
  assert.equal(shownEquipment(state.slices, content).weapon, 'iron_sword');
  assert.equal(c('wardrobe:transmog', { changes: { weapon: 'iron_sword' } }).cost, 0, 'schon angelegt: keine Änderung');
  assert.equal(c('wardrobe:transmog', { changes: { weapon: null, head: null } }).cost, 0, 'zurück zum echten Aussehen frei');
  assert.equal(wallet.gold, 1000 - price);
  assert.equal(shownEquipment(state.slices, content).weapon, 'notched_blade');
  assert.equal(c('wardrobe:transmog', { changes: { weapon: 'starfall' } }).reason, 'locked', 'nicht gesammelt');
});

test('Gewandmeisterin: Skinset auch über leeren Plätzen, nur gekauft', async () => {
  const { c, state, game } = setup();
  state.slices.shop = { owned: [] };
  state.slices.wallet.gold = 100000;
  const set = { weapon: 'set_glutthron_weapon', head: 'set_glutthron_head', feet: 'set_glutthron_feet' };
  assert.equal(c('wardrobe:transmog', { changes: set }).reason, 'locked');
  state.slices.shop.owned = ['look:set_glutthron'];
  const cost = game.character.wardrobe.cost(set);
  const r = c('wardrobe:transmog', { changes: set });
  assert.equal(r.ok, true);
  assert.equal(r.cost, cost);
  assert.equal(state.slices.wallet.gold, 100000 - cost);
  assert.equal(state.slices.character.wardrobe.shown.head, 'set_glutthron_head');
});

test('Sammlung: Gesammeltes zuerst, Fehlendes mit Herkunft, nur eigene Klasse', async () => {
  const { c, state, content, bus } = setup('ranger');
  bus.emit(EV.GAME_STARTED, {});
  await tick();
  const all = wardrobeCatalog(state.slices, content, 'weapon');
  const owned = all.filter((e) => e.owned);
  assert.ok(owned.length >= 1 && all.length > owned.length);
  assert.ok(all.slice(0, owned.length).every((e) => e.owned), 'Gesammeltes vorn');
  assert.ok(all.every((e) => content.get('item', e.itemId).family === 'bow' || content.get('item', e.itemId).skinSet), 'Waldläufer: nur Bögen');
  const star = all.find((e) => e.itemId === 'starfall');
  assert.equal(star.owned, false);
  assert.equal(star.source, 'Bossbeute');
  c('wardrobe:unlock', { itemIds: ['starfall'] });
  assert.equal(wardrobeCatalog(state.slices, content, 'weapon').find((e) => e.itemId === 'starfall').owned, true);
  assert.equal(new Set(all.map((e) => e.itemId)).size, all.length, 'jedes Aussehen einmal');
});

let fail = 0;
for (const [n, f] of tests) {
  try { await f(); console.log('ok ', n); } catch (e) { fail++; console.log('FAIL', n, '\n', e); }
}
console.log(fail ? `${fail} Tests rot` : `alle ${tests.length} Tests grün`);
process.exitCode = fail ? 1 : 0;
