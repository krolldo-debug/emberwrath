// Garderobe (Thread A): node src/character/test/wardrobe.test.mjs
import assert from 'node:assert/strict';
import { EventBus } from '../../core/EventBus.js';
import { Content } from '../../core/Content.js';
import { GameState } from '../../core/GameState.js';
import { LocalAuthority } from '../../core/Authority.js';
import { EV } from '../../core/events.js';
import { registerProgressionContent, registerProgressionState } from '../../progression/logic.js';
import { installWardrobe, cleanWardrobe, hasLook, WARDROBE_EVENT } from '../wardrobe.js';
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

let fail = 0;
for (const [n, f] of tests) {
  try { await f(); console.log('ok ', n); } catch (e) { fail++; console.log('FAIL', n, '\n', e); }
}
console.log(fail ? `${fail} Tests rot` : `alle ${tests.length} Tests grün`);
process.exitCode = fail ? 1 : 0;
