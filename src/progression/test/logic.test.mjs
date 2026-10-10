// Logiktests für Thread C (ohne Browser): node src/progression/test/logic.test.mjs
import assert from 'node:assert/strict';
import { EventBus } from '../../core/EventBus.js';
import { Content } from '../../core/Content.js';
import { GameState } from '../../core/GameState.js';
import { LocalAuthority } from '../../core/Authority.js';
import { EV } from '../../core/events.js';
import { registerProgressionContent, registerProgressionState, BAG_SIZE } from '../logic.js';
import { xpInfo, questStatus, npcMarker, trackedQuests, trackedQuestId, questTarget, countItem, findPotionSlot, isUpgrade, vendorStock, questRewardItems, junkSlots, npcIdleLine, sellableSlots } from '../selectors.js';
import { xpToNext, totalXpForLevel, killXp, mobXp, LEVEL_CAP } from '../xp.js';
import { rollLoot, pickRewardGear, rarityWeights, pickEquipment } from '../loot.js';
import { ITEMS, EQUIP_SLOTS, RARITY_ORDER, WEAPON_CLASSES, attrFit } from '../items.js';
import { QUESTS, VENDORS, NPC_LINES } from '../quests.js';
import { RECIPES } from '../crafting.js';
import { runCampaign, expansionReport } from './pacing.mjs';
import { SETS } from '../sets.js';
import { computeBonus, upgradeCost, ENCHANTS } from '../smithing.js';
import { levelGapMult, levelGapTakenMult, applyLevelGap, levelGapTier } from '../levelGap.js';
import { boardOffers, boardDay, boardWeek, offerRewards, WEEK_GOAL, boardHasOffers } from '../board.js';
import { setWorldFeatures, openObjectives } from '../selectors.js';
import { trialSpec, trialChances, trialRewards, trialThemesFor } from '../trials.js';
import { MOUNT_DROPS } from '../loot.js';
import { SOVEREIGN_LEGENDARIES } from '../items40.js';
import { ACHIEVEMENTS } from '../achievements.js';
import { RARE_ENEMIES, rareSpawnsFor } from '../rares.js';

let seed = 7;
const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const CLASSES = ['warrior', 'rogue', 'ranger', 'mage'];
const NPCS = Object.keys(NPC_LINES);

function setup(classId = 'warrior') {
  const bus = new EventBus(), content = new Content();
  const state = new GameState(bus, new LocalAuthority(content), content);
  // world-/character-Slices (Threads A/B) minimal nachbilden
  state.defineSlice('world', { create: () => ({ zoneId: 'emberhollow', bossesDefeated: [] }) });
  state.defineSlice('character', { create: () => ({ name: 'T', classId }) });
  registerProgressionContent(content);
  const api = registerProgressionState(state, { rng });
  const events = [];
  for (const ev of new Set([...Object.values(EV), 'achievement:unlocked', 'trial:started', 'trial:progress', 'trial:boss', 'trial:completed', 'trial:failed', 'rare:killed'])) bus.on(ev, (p) => events.push([ev, p]));
  return { bus, content, state, api, events, c: (t, p) => state.commit(t, p) };
}
const slotOf = (state, itemId) => state.slices.inventory.slots.findIndex((s) => s?.itemId === itemId);

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('Levelkurve bis 40 ist monoton, 1–19 unverändert, Kills skalieren mit dem Stufenabstand', () => {
  assert.equal(LEVEL_CAP, 40);
  assert.equal(xpToNext(1), 100);
  for (let l = 1; l < 20; l++) assert.equal(xpToNext(l), Math.round((100 * Math.pow(l, 1.42)) / 5) * 5, `Stufe ${l} bitgenau`);
  assert.equal(totalXpForLevel(20), 54695);
  for (let l = 1; l < LEVEL_CAP - 1; l++) assert.ok(xpToNext(l + 1) > xpToNext(l));
  assert.equal(xpToNext(LEVEL_CAP), Infinity);
  assert.equal(totalXpForLevel(3), xpToNext(1) + xpToNext(2));
  assert.ok(Math.abs(mobXp(5, { elite: true }) - mobXp(5) * 5) <= 5);
  assert.ok(killXp(100, 1, 7) <= 10, 'graue Gegner geben kaum etwas');
  assert.ok(killXp(100, 9, 7) > 100);
});

test('XP führt zu Levelaufstieg mit Events und endet bei 40', () => {
  const { c, state, events } = setup();
  c('progress:grantXp', { amount: 400, source: 't' });
  assert.equal(state.slices.progress.level, 3); // 100 + 270 = 370 <= 400
  assert.equal(events.filter(([e]) => e === EV.LEVEL_UP).length, 2);
  assert.equal(xpInfo(state).into, 30);
  c('progress:grantXp', { amount: 100_000_000 });
  assert.equal(state.slices.progress.level, 40);
  assert.equal(xpInfo(state).capped, true);
});

test('Neues Spiel: 36 Plätze, 7 Ausrüstungsplätze, Starttränke', () => {
  const { state, content } = setup();
  assert.equal(state.slices.inventory.slots.length, BAG_SIZE);
  assert.deepEqual(Object.keys(state.slices.inventory.equipment).sort(), [...EQUIP_SLOTS].sort());
  assert.equal(countItem(state, 'minor_potion'), 5);
  assert.ok(findPotionSlot(state, content, 10) >= 0);
  for (const cls of CLASSES) {
    const eq = setup(cls).state.slices.inventory.equipment;
    assert.ok(eq.weapon && eq.chest, cls);
    assert.equal(WEAPON_CLASSES[ITEMS[eq.weapon].family][0], cls);
    assert.equal(ITEMS[eq.chest].rarity, 'common');
  }
});

test('Quest: Annehmen, Verfolgen, Fortschritt, Pfadziel, Abgabe', () => {
  const { c, state, content, events } = setup();
  const t0 = questTarget(state, content);
  assert.equal(t0.kind, 'npc'); assert.equal(t0.id, 'elder_maren'); assert.equal(t0.offer, true);
  assert.equal(npcMarker(state, content, 'elder_maren'), 'available');
  c('progress:kill', { type: 'wolf', level: 1 }); // vor Annahme zählt nicht
  assert.equal(c('quest:accept', { questId: 'q_ashen_wolves' }).ok, true);
  assert.equal(trackedQuestId(state, content), 'q_ashen_wolves');
  assert.ok(events.some(([e, p]) => e === EV.QUEST_TRACKED && p.questId === 'q_ashen_wolves'));
  const t1 = questTarget(state, content);
  assert.deepEqual([t1.kind, t1.id, t1.zoneId], ['enemy', 'wolf', 'emberhollow']);
  for (let i = 0; i < 6; i++) c('progress:kill', { type: 'wolf', level: 1 });
  assert.equal(questStatus(state, content, 'q_ashen_wolves'), 'ready');
  assert.equal(npcMarker(state, content, 'elder_maren'), 'ready');
  const t2 = questTarget(state, content);
  assert.deepEqual([t2.kind, t2.id, t2.ready], ['npc', 'elder_maren', true]);
  assert.match(trackedQuests(state, content)[0].hint, /Maren/);
  const gold0 = state.slices.wallet.gold;
  assert.equal(c('quest:turnIn', { questId: 'q_ashen_wolves' }).ok, true);
  assert.equal(state.slices.wallet.gold, gold0 + 12);
  assert.equal(countItem(state, 'leather_jerkin'), 1);
  assert.equal(questStatus(state, content, 'q_into_catacombs'), 'available');
});

test('quest:track wählt aus, Abbrechen fällt auf Hauptquest zurück', () => {
  const { c, state, content } = setup();
  c('quest:accept', { questId: 'q_ashen_wolves' });
  c('quest:turnIn', { questId: 'q_ashen_wolves' }); // nicht fertig
  for (let i = 0; i < 6; i++) c('progress:kill', { type: 'wolf', level: 1 });
  c('quest:turnIn', { questId: 'q_ashen_wolves' });
  c('quest:accept', { questId: 'q_into_catacombs' });
  c('quest:accept', { questId: 'q_spider_silk' });
  assert.equal(trackedQuestId(state, content), 'q_into_catacombs', 'Hauptquest bleibt verfolgt');
  const t = questTarget(state, content);
  assert.deepEqual([t.kind, t.id], ['zone', 'catacombs']);
  assert.equal(c('quest:track', { questId: 'q_spider_silk' }).ok, true);
  assert.equal(questTarget(state, content).id, 'spider');
  c('quest:abandon', { questId: 'q_spider_silk' });
  assert.equal(trackedQuestId(state, content), 'q_into_catacombs');
  assert.equal(c('quest:track', { questId: 'q_gibt_es_nicht' }).ok, false);
});

test('Interagieren zählt jedes Objekt einmal, Pfad zeigt auf das nächste offene', () => {
  const { c, state, content } = setup();
  c('progress:grantXp', { amount: totalXpForLevel(9) });
  for (const q of ['q_ashen_wolves', 'q_into_catacombs', 'q_bonelord', 'q_road_east', 'q_boar_cull', 'q_bandit_camp', 'q_bandit_chief']) state.slices.quests.completed.push(q);
  assert.equal(c('quest:accept', { questId: 'q_temple_shore' }).ok, true);
  const q = QUESTS.q_temple_shore;
  const totem = q.objectives.find((o) => o.kind === 'interact');
  for (const o of q.objectives) if (o.kind === 'reach') c('quest:event', { kind: 'reach', target: [].concat(o.target)[0] });
  c('quest:event', { kind: 'interact', target: 'ward_totem_1' });
  c('quest:event', { kind: 'interact', target: 'ward_totem_1' });
  assert.equal(state.slices.quests.active.q_temple_shore.progress[totem.id], 1);
  const t = questTarget(state, content);
  assert.equal(t.kind, 'object'); assert.equal(t.id, 'ward_totem_2');
  c('quest:event', { kind: 'interact', target: 'ward_totem_2' });
  c('quest:event', { kind: 'interact', target: 'ward_totem_3' });
  assert.equal(questStatus(state, content, 'q_temple_shore'), 'ready');
});

test('Boss vor Annahme besiegt zählt trotzdem (world.bossesDefeated)', () => {
  const { c, state, content } = setup();
  state.slices.progress.level = 5;
  state.slices.quests.completed.push('q_ashen_wolves', 'q_into_catacombs');
  state.slices.world.bossesDefeated.push('bonelord');
  c('quest:accept', { questId: 'q_bonelord' });
  const a = state.slices.quests.active.q_bonelord;
  assert.equal(a.progress.boss, 1);
  assert.equal(questTarget(state, content).objectiveId, 'sigil');
});

test('Seltenheitsgrenzen (Runde 5: Blau besonders, Lila selten) halten statistisch', () => {
  const N = 20000;
  const tally = (enemy, classId = 'mage') => {
    const t = Object.fromEntries(RARITY_ORDER.map((r) => [r, 0])); let gear = 0, legKills = 0;
    for (let i = 0; i < N; i++) {
      const drops = rollLoot(enemy, { rng, classId });
      if (drops.some((d) => ITEMS[d.itemId]?.rarity === 'legendary')) legKills++;
      for (const d of drops) {
        const def = d.itemId && ITEMS[d.itemId];
        if (def?.slot) { t[def.rarity]++; gear++; }
      }
    }
    return { t, gear, legKills };
  };
  const low = tally({ type: 'wolf', level: 2, family: 'beast' });
  assert.equal(low.t.rare + low.t.epic + low.t.legendary, 0, 'Tier 1: keine blauen Drops');
  const mid = tally({ type: 'bandit', level: 9, family: 'humanoid' });
  assert.equal(mid.t.epic + mid.t.legendary, 0, 'normale Gegner nie episch');
  // Blau je Kill unverändert (6 % × 0,8 %); Weiße normaler Gegner fallen als Gold, kommen also nicht mehr in die Zählung
  assert.ok(mid.t.rare / N <= 0.0009, `rare je Kill ${mid.t.rare / N}`);
  assert.equal(mid.t.common, 0, 'keine weißen Teile von normalen Gegnern');
  const elite = tally({ type: 'bandit_chief', level: 9, elite: true });
  assert.ok(elite.t.epic / elite.gear <= 0.015, `elite epic ${elite.t.epic / elite.gear}`);
  assert.ok(Math.abs(elite.t.rare / elite.gear - 0.12) < 0.03, `elite rare ${elite.t.rare / elite.gear}`);
  assert.equal(elite.t.legendary, 0);
  const chest = tally({ chest: 'chest_7', level: 12 });
  assert.equal(chest.t.epic + chest.t.legendary, 0, 'Truhen höchstens rare');
  const varkhul = tally({ type: 'bonelord', level: 6, boss: true, bossId: 'bonelord' });
  assert.equal(varkhul.t.common, 0);
  const ve = varkhul.t.epic / varkhul.gear;
  assert.ok(ve >= 0.01 && ve <= 0.05, `Varkhul episch ${ve}`);
  assert.equal(varkhul.t.legendary, 0);
  const nerith = tally({ type: 'drowned_priestess', level: 12, boss: true, bossId: 'drowned_priestess' });
  assert.equal(nerith.t.common, 0, 'Bosse mindestens grün');
  assert.ok(nerith.t.epic / nerith.gear <= 0.07, `Nerith episch ${nerith.t.epic / nerith.gear}`);
  const tyr = tally({ type: 'ember_tyrant', level: 20, boss: true, bossId: 'ember_tyrant' });
  assert.ok(tyr.legKills > 0 && tyr.legKills / N <= 0.02 + 0.003, `legendär je Kill ${tyr.legKills / N}`);
  assert.ok(tyr.t.epic / tyr.gear >= 0.05 && tyr.t.epic / tyr.gear <= 0.13, `Ignaroth episch ${tyr.t.epic / tyr.gear}`);
  assert.equal(rarityWeights('normal', 3).rare, undefined);
});

test('Questgegenstände fallen nur während der Quest, Bosse lassen ihr Siegel fallen', () => {
  const { c, state } = setup();
  let r = c('loot:roll', { source: 'kill', id: 'spider', level: 3, x: 0, y: 0 });
  assert.ok(!r.drops.some((d) => d.itemId === 'spider_silk'));
  state.slices.quests.completed.push('q_ashen_wolves');
  c('quest:accept', { questId: 'q_spider_silk' });
  let silk = 0;
  for (let i = 0; i < 30 && silk < 3; i++) { c('loot:roll', { source: 'kill', id: 'spider', level: 3 }); silk = countItem(state, 'spider_silk'); }
  assert.equal(silk, 3, 'Seide landet direkt im Inventar');
  assert.equal(questStatus(state, state.content ?? setup().content, 'q_spider_silk'), 'ready');
  state.slices.quests.completed.push('q_into_catacombs');
  c('quest:accept', { questId: 'q_bonelord' });
  c('loot:roll', { source: 'kill', id: 'bonelord', level: 6, isBoss: true, bossId: 'bonelord' });
  assert.equal(countItem(state, 'varkhul_sigil'), 1);
});

test('Ausrüsten prüft Klasse und Stufe; Verbesserungspfeil', () => {
  const { c, state, content } = setup('mage');
  c('inventory:add', { itemId: 'ashguard_sabre' });
  const s1 = slotOf(state, 'ashguard_sabre');
  assert.equal(c('inventory:equip', { slot: s1 }).reason, 'class');
  const staff = Object.entries(ITEMS).find(([, d]) => d.family === 'staff' && d.reqLevel >= 5)[0];
  c('inventory:add', { itemId: staff });
  assert.equal(isUpgrade(state, content, staff), false, 'Stufe zu niedrig -> kein Pfeil');
  assert.equal(c('inventory:equip', { slot: slotOf(state, staff) }).reason, 'level');
  c('progress:grantXp', { amount: totalXpForLevel(ITEMS[staff].reqLevel) });
  assert.equal(isUpgrade(state, content, staff), true);
  const r = c('inventory:equip', { slot: slotOf(state, staff) });
  assert.equal(r.ok, true); assert.equal(r.slot, 'weapon');
  assert.equal(state.slices.inventory.equipment.weapon, staff);
  assert.equal(c('inventory:unequip', { slot: 'weapon' }).ok, true);
});

test('Belohnungsausrüstung passt zur Klasse und ist deterministisch', () => {
  for (const cls of CLASSES) {
    for (const q of Object.values(QUESTS)) for (const [i, g] of (q.rewards.gear ?? []).entries()) {
      const id = pickRewardGear(g, cls, i);
      assert.ok(id, `${q.title} ${cls}`);
      const d = ITEMS[id];
      assert.ok(!d.classes || d.classes.includes(cls), `${q.title}: ${id} passt nicht zu ${cls}`);
      assert.ok(Math.abs(d.ilvl - g.ilvl) <= 3, `${q.title}: ${id} ilvl ${d.ilvl} statt ${g.ilvl}`);
      if (g.slot) assert.equal(d.slot, g.slot);
      assert.equal(d.rarity, g.rarity);
      assert.equal(pickRewardGear(g, cls, i), id);
    }
    const w = pickRewardGear({ ilvl: 10, rarity: 'rare', slot: 'weapon' }, cls);
    assert.equal(WEAPON_CLASSES[ITEMS[w].family][0], cls, `Hauptwaffe für ${cls}`);
  }
  const { state, content } = setup('ranger');
  assert.ok(questRewardItems(state, content, 'q_glutfang').some((it) => ITEMS[it.itemId].family === 'bow'));
});

test('Händler: nur gewöhnlich/ungewöhnlich, kaufen, verkaufen, Plunder', () => {
  const { c, state, content } = setup();
  for (const v of Object.keys(VENDORS)) for (const id of vendorStock(content, v)) {
    assert.ok(['common', 'uncommon'].includes(ITEMS[id].rarity) || ITEMS[id].type === 'mount', `${v}: ${id}`);
  }
  assert.ok(vendorStock(content, 'trader_vesk').some((id) => ITEMS[id].slot));
  c('wallet:addGold', { amount: 100 });
  const r = c('shop:buy', { vendorId: 'smith_brom', itemId: 'minor_potion' });
  assert.equal(r.ok, true); assert.equal(countItem(state, 'minor_potion'), 6);
  assert.equal(c('shop:buy', { vendorId: 'smith_brom', itemId: 'ember_elixir' }).reason, 'stock');
  const [commonId, common] = Object.entries(ITEMS).find(([, d]) => d.slot === 'ring' && d.rarity === 'common');
  c('progress:grantXp', { amount: totalXpForLevel(common.reqLevel) });
  common.id = commonId;
  c('inventory:add', { itemId: common.id }); c('inventory:add', { itemId: common.id });
  assert.equal(junkSlots(state, content).length, 0, 'neue Beute ist nie Plunder');
  c('inventory:seen', {});
  c('inventory:equip', { slot: slotOf(state, common.id) }); // eines anlegen -> das andere ist keine Verbesserung
  assert.equal(junkSlots(state, content).length, 1);
  const g0 = state.slices.wallet.gold;
  const j = c('shop:sellJunk', { vendorId: 'smith_brom' });
  assert.equal(j.count, 1); assert.equal(state.slices.wallet.gold, g0 + common.value);
  c('inventory:add', { itemId: 'spider_silk' });
  assert.equal(c('shop:sell', { vendorId: 'smith_brom', slot: slotOf(state, 'spider_silk') }).ok, false);
});

test('Schmiede: Rezepte gültig, Herstellen verbraucht Material und Gold', () => {
  for (const [id, r] of Object.entries(RECIPES)) {
    assert.ok(ITEMS[r.result], id);
    for (const m of r.mats) assert.ok(ITEMS[m.itemId], `${id}: ${m.itemId}`);
    if (ITEMS[r.result].slot && r.group !== 'shards') assert.ok(RARITY_ORDER.indexOf(ITEMS[r.result].rarity) <= 2, `${id} höchstens rare`);
  }
  const { c, state } = setup();
  assert.equal(c('craft:make', { recipeId: 'brew_minor_potion' }).reason, 'gold');
  c('wallet:addGold', { amount: 5 });
  assert.equal(c('craft:make', { recipeId: 'brew_minor_potion' }).reason, 'mats');
  c('inventory:add', { itemId: 'bone_dust', qty: 2 });
  assert.equal(c('craft:make', { recipeId: 'brew_minor_potion' }).ok, true);
  assert.equal(countItem(state, 'minor_potion'), 7);
  assert.equal(countItem(state, 'bone_dust'), 0);
  assert.equal(state.slices.wallet.gold, 3);
  assert.equal(c('craft:make', { recipeId: 'forge_forge_axe' }).reason, 'level');
});

test('Kopfgeld ist wiederholbar', () => {
  const { c, state, content } = setup();
  const id = 'q_bounty_emberhollow', q = QUESTS[id];
  state.slices.progress.level = q.minLevel ?? q.level;
  for (const r of [...(q.requires ?? []), 'q_glutfang', 'q_spider_silk', 'q_beacon_stones']) state.slices.quests.completed.push(r);
  assert.equal(npcMarker(state, content, q.giver), 'repeatable');
  for (let round = 0; round < 2; round++) {
    assert.equal(c('quest:accept', { questId: id }).ok, true);
    for (const o of q.objectives) for (let i = 0; i < o.count; i++) c('progress:kill', { type: [].concat(o.target)[0], level: q.level });
    assert.equal(c('quest:turnIn', { questId: id }).ok, true);
    assert.equal(questStatus(state, content, id), 'available');
  }
  assert.equal(state.slices.quests.repeats[id], 2);
});

test('Speichern/Laden: Rundlauf, Bereinigung und Migration alter Stände', () => {
  const { c, state } = setup();
  c('progress:grantXp', { amount: 300 });
  c('quest:accept', { questId: 'q_ashen_wolves' });
  c('progress:kill', { type: 'wolf' });
  c('wallet:addGold', { amount: 42 });
  const snap = JSON.parse(JSON.stringify(state.snapshot()));
  snap.slices.inventory.slots[5] = { itemId: 'gibt_es_nicht', qty: 1 };
  snap.slices.quests.active.q_weg = { status: 'active', progress: {} };
  const b = setup();
  b.state.load(snap);
  assert.equal(b.state.slices.progress.xp, state.slices.progress.xp);
  assert.equal(b.state.slices.wallet.gold, 42);
  assert.equal(b.state.slices.quests.active.q_ashen_wolves.progress.wolves, 1);
  assert.equal(b.state.slices.inventory.slots[5], null);
  assert.equal(b.state.slices.quests.active.q_weg, undefined);
  // Runde-1-Spielstand: 24 Plätze, armor/trinket
  const old = JSON.parse(JSON.stringify(snap));
  old.slices.inventory = { slots: Array(24).fill(null), equipment: { weapon: null, armor: 'leather_jerkin', trinket: 'brom_ring' } };
  old.slices.inventory.slots[0] = { itemId: 'minor_potion', qty: 2 };
  const m = setup();
  m.state.load(old);
  const inv = m.state.slices.inventory;
  assert.equal(inv.slots.length, BAG_SIZE);
  assert.equal(inv.equipment.chest, 'leather_jerkin');
  assert.equal(inv.equipment.ring, 'brom_ring');
  assert.equal(countItem(m.state, 'minor_potion'), 2);
});

test('Inhalte: Quests, NPCs, Händler und Items sind konsistent', () => {
  const ids = new Set(Object.keys(QUESTS));
  for (const q of Object.values(QUESTS)) {
    assert.ok(NPCS.includes(q.giver), `${q.id} giver ${q.giver}`);
    if (q.turnInNpc) assert.ok(NPCS.includes(q.turnInNpc), q.id);
    for (const r of q.requires ?? []) assert.ok(ids.has(r), `${q.id} requires ${r}`);
    for (const it of q.rewards.items ?? []) assert.ok(ITEMS[it.itemId], `${q.id}: ${it.itemId}`);
    for (const o of q.objectives) {
      assert.ok(o.zone, `${q.id}/${o.id} ohne Zone`);
      if (o.kind === 'collect') { assert.ok(ITEMS[o.target], o.target); assert.ok(o.from?.length, `${q.id}/${o.id} ohne from`); }
    }
    assert.ok(q.rewards.xp > 0, q.id);
  }
  for (const v of Object.keys(VENDORS)) assert.ok(NPCS.includes(v));
  for (const [id, d] of Object.entries(ITEMS)) {
    assert.ok(d.name && d.icon && d.rarity && d.type, id);
    if (d.slot) { assert.ok(EQUIP_SLOTS.includes(d.slot), id); assert.ok(d.ilvl >= 1 && d.ilvl <= LEVEL_CAP, id); assert.ok(d.reqLevel <= d.ilvl, id); }
  }
  // Vielfalt je Tier: mindestens 2 Schwerter
  for (const tier of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const swords = Object.values(ITEMS).filter((d) => d.family === 'sword' && d.tier === tier && !d.source);
    assert.ok(swords.length >= 2, `Tier ${tier}: ${swords.length} Schwerter`);
  }
});

test('Kampagne: Tempo-Richtwerte aus §11.4', () => {
  const r = runCampaign({ until: 'q_ignaroth' });
  const m = r.milestones;
  console.log(`    Varkhul ${m.q_bonelord}, Ende Aschenwald ${m.q_temple_shore}, Nerith ${m.q_nerith}, Wächter ${m.q_forge_warden}, Ignaroth ${m.q_ignaroth}; Questanteil ${(r.questShare * 100).toFixed(0)} %`);
  assert.ok(m.q_bonelord >= 5 && m.q_bonelord <= 7);
  assert.ok(m.q_temple_shore >= 9 && m.q_temple_shore <= 11);
  assert.ok(m.q_nerith >= 11 && m.q_nerith <= 13);
  assert.ok(m.q_forge_warden >= 16 && m.q_forge_warden <= 18);
  assert.ok(m.q_ignaroth >= 19);
  assert.ok(r.questShare >= 0.5 && r.questShare <= 0.72);
});

test('Erweiterung 20–40: Tempo, Quest-Anteil und Gold (§12.1, §12.6)', () => {
  const x = expansionReport();
  const per = Object.values(x.full.minutesPerLevel);
  console.log(`    20→40 ${x.hours20to40.toFixed(1)} h, Quest-Anteil ${(x.questShare * 100).toFixed(0)} %, je Stufe ${Math.min(...per).toFixed(0)}–${Math.max(...per).toFixed(0)} min, ${x.full.bounties} Kopfgelder`);
  assert.equal(x.full.level, 40);
  assert.ok(x.hours20to40 >= 4.8 && x.hours20to40 <= 6.5, `${x.hours20to40} h`);
  assert.ok(x.questShare >= 0.62 && x.questShare <= 0.75, `Quest-Anteil ${x.questShare}`);
  // Die Geschichte endet kurz vor 40, nicht mit zwei Stufen Kopfgeld
  assert.ok(x.full.milestones.q_homecoming >= 39, `Heimkehr auf Stufe ${x.full.milestones.q_homecoming}`);
  const avg = per.reduce((a, b) => a + b, 0) / per.length;
  assert.ok(avg >= 13 && avg <= 22, `Schnitt ${avg} min je Stufe`);
  assert.ok(Math.max(...per) <= 32, 'keine extremen Ausreißer');
  // Reittier-Preise: selten ≈ 3–4 h bei 75 % des verkauften Beutewerts, episch erst gegen 40
  const rare = ITEMS.mount_steppe_horse.price, epic = ITEMS.mount_ember_charger.price;
  const realistic = x.goldPerHour25to35 * 0.75;
  assert.ok(rare / realistic >= 3 && rare / realistic <= 4, `seltenes Reittier ${rare} = ${(rare / realistic).toFixed(1)} h`);
  // Glutross: Prestige nach Malgareth, braucht auch nach 40 noch Gold aus Prüfungen und Kopfgeldern
  assert.ok(x.goldAt(40) * 0.75 < epic && x.goldAt(40) >= epic * 0.8, 'episches Reittier erst nach 40');
  assert.equal(ITEMS.mount_ember_charger.reqQuest, 'q_ash_sovereign');
  assert.equal(ITEMS.mount_steppe_horse.reqQuest, 'q_first_ride');
  assert.equal(ITEMS.mount_ember_charger.reqLevel, 40);
});

test('Erweiterung: Quests, Kette und Inhalte bis 40', () => {
  const chain = ['q_ignaroth', 'q_new_horizons', 'q_steppe_raiders', 'q_barrow_king', 'q_into_the_marsh', 'q_rot_mother', 'q_frost_pass', 'q_frost_wyrm', 'q_the_wastes', 'q_ash_sovereign'];
  for (let i = 1; i < chain.length; i++) assert.ok(QUESTS[chain[i]], chain[i]);
  assert.deepEqual(QUESTS.q_new_horizons.requires, ['q_ignaroth']);
  assert.ok(QUESTS.q_ash_sovereign.objectives.some((o) => o.target === 'sovereign_crown'));
  assert.equal(QUESTS.q_first_ride.giver, 'stablemaster_orla');
  assert.equal(QUESTS.q_first_ride.minLevel, 20);
  assert.ok(!QUESTS.q_first_ride.rewards.items?.some((it) => ITEMS[it.itemId].type === 'mount'), 'kein Gratis-Reittier');
  const byGiver = {};
  for (const q of Object.values(QUESTS)) if (q.level >= 20 && !q.repeatable) (byGiver[q.giver] ??= []).push(q);
  for (const giver of ['captain_varra', 'warden_thane', 'jarl_eskil', 'marshal_corvane']) {
    const n = byGiver[giver].filter((q) => q.main).length;
    assert.ok(n >= 6 && n <= 8, `${giver}: ${n} Hauptquests`);
  }
  for (const giver of ['nomad_kesh', 'alchemist_brisa', 'hunter_sigrun', 'pilgrim_aldo']) assert.ok(byGiver[giver].length >= 4 && byGiver[giver].length <= 8, `${giver}: ${byGiver[giver].length}`);
  for (const b of ['q_bounty_steppe', 'q_bounty_marsh', 'q_bounty_frost', 'q_bounty_wastes']) assert.ok(QUESTS[b].repeatable);
  // Tiers 5–8 nach §12.7, reqLevel = ilvl − 1 wie bisher
  assert.equal(ITEMS.nomad_sword.tier, 5); assert.equal(ITEMS.bog_sword.tier, 6); assert.equal(ITEMS.jarl_sword.tier, 7); assert.equal(ITEMS.waste_sword.tier, 8);
  for (const d of Object.values(ITEMS)) if (d.slot && d.ilvl > 20) assert.ok(/_t[5-8]$/.test(d.icon), `${d.name}: ${d.icon}`);
  assert.equal(SOVEREIGN_LEGENDARIES.length, 6);
  for (const id of SOVEREIGN_LEGENDARIES) { assert.equal(ITEMS[id].rarity, 'legendary'); assert.equal(ITEMS[id].ilvl, 40); }
  for (const id of ['superior_potion', 'supreme_potion', 'greater_mana', 'supreme_mana']) assert.ok(ITEMS[id]);
});

test('Erweiterung: volle Stufe-20-Stände steigen nach dem Update weiter', () => {
  const { state } = setup();
  const snap = JSON.parse(JSON.stringify(state.snapshot()));
  snap.slices.progress = { level: 20, xp: totalXpForLevel(20), xpNext: totalXpForLevel(20), stats: {} };
  const b = setup();
  b.state.load(snap);
  assert.equal(b.state.slices.progress.level, 20);
  assert.equal(b.state.slices.progress.xpNext, totalXpForLevel(21));
  assert.equal(xpInfo(b.state).capped, false);
  b.c('progress:grantXp', { amount: xpToNext(20) });
  assert.equal(b.state.slices.progress.level, 21);
});

test('Reittiere: Kauf bei Orla, Lernen per Gegenstand, Drops nur von Bossen', () => {
  const { c, state, content } = setup();
  // Minimaler Ersatz für Thread A (character.mounts + mount:learn)
  state.slices.character.mounts = { owned: [], active: null, riding: false };
  state.defineCommand('mount:learn', (s, { mountId }) => {
    const m = s.get('character').mounts;
    if (m.owned.includes(mountId)) return { ok: false, known: true };
    m.owned.push(mountId); m.active ??= mountId; return { ok: true, mountId };
  });
  const stock = vendorStock(content, 'stablemaster_orla');
  assert.deepEqual(stock, ['mount_steppe_horse', 'mount_ash_wolf', 'mount_ember_charger']);
  c('progress:grantXp', { amount: totalXpForLevel(20) });
  c('wallet:addGold', { amount: 400000 });
  // Gold allein reicht nicht: erst Reitunterricht, das Glutross erst nach Malgareth
  assert.equal(c('shop:buy', { vendorId: 'stablemaster_orla', itemId: 'mount_steppe_horse' }).reason, 'quest');
  state.slices.quests.completed.push('q_first_ride');
  assert.equal(c('shop:buy', { vendorId: 'stablemaster_orla', itemId: 'mount_ember_charger' }).reason, 'level');
  state.slices.progress.level = 40;
  assert.equal(c('shop:buy', { vendorId: 'stablemaster_orla', itemId: 'mount_ember_charger' }).reason, 'quest');
  state.slices.progress.level = 20;
  c('wallet:addGold', { amount: -399000 });
  assert.equal(c('shop:buy', { vendorId: 'stablemaster_orla', itemId: 'mount_steppe_horse' }).reason, 'gold');
  c('wallet:addGold', { amount: 399000 });
  const r = c('shop:buy', { vendorId: 'stablemaster_orla', itemId: 'mount_steppe_horse' });
  assert.equal(r.ok, true); assert.equal(r.price, 75000);
  const used = c('inventory:use', { slot: slotOf(state, 'mount_steppe_horse') });
  assert.equal(used.ok, true); assert.equal(used.mountId, 'steppe_horse');
  assert.equal(countItem(state, 'mount_steppe_horse'), 0);
  assert.deepEqual(state.slices.character.mounts.owned, ['steppe_horse']);
  // Schon bekannt: Gegenstand bleibt
  c('inventory:add', { itemId: 'mount_steppe_horse', qty: 1 });
  assert.equal(c('inventory:use', { slot: slotOf(state, 'mount_steppe_horse') }).reason, 'known');
  assert.equal(countItem(state, 'mount_steppe_horse'), 1);
  // Beritten kein Trank
  state.slices.character.mounts.riding = true;
  assert.equal(c('inventory:use', { slot: slotOf(state, 'minor_potion') }).reason, 'riding');
  // Drops: fünf Dungeonbosse und das Moorgrauen, 1 % bzw. 0,5 %; Höllenhund und Reifschwinge je 0,4 %
  assert.deepEqual(Object.keys(MOUNT_DROPS).sort(), ['ash_sovereign', 'barrow_king', 'bog_horror', 'ember_tyrant', 'frost_wyrm', 'rot_mother']);
  assert.equal(MOUNT_DROPS.ash_sovereign[1], 0.005);
  let n = 0;
  for (let i = 0; i < 20000; i++) if (rollLoot({ type: 'barrow_king', level: 26, boss: true, bossId: 'barrow_king' }, { rng }).some((d) => d.itemId === 'mount_bone_stallion')) n++;
  assert.ok(n > 120 && n < 290, `Knochenhengst ${n}/20000`);
  const rate = (bossId, level, itemId) => { let k = 0; for (let i = 0; i < 50000; i++) if (rollLoot({ type: bossId, level, boss: true, bossId }, { rng }).some((d) => d.itemId === itemId)) k++; return k; };
  const hh = rate('ember_tyrant', 20, 'mount_hellhound'), rd = rate('frost_wyrm', 37, 'mount_rime_drake'), fe = rate('frost_wyrm', 37, 'mount_frost_elk');
  assert.ok(hh > 120 && hh < 290, `Höllenhund ${hh}/50000`);
  assert.ok(rd > 120 && rd < 290, `Reifschwinge ${rd}/50000`);
  assert.ok(fe > 380 && fe < 620, `Frostelch weiter 1 % (${fe}/50000)`);
  for (let i = 0; i < 3000; i++) assert.ok(!rollLoot({ chest: 'boss_x', level: 30 }, { rng }).some((d) => ITEMS[d.itemId]?.type === 'mount'), 'kein Reittier in Truhen');
});

test('Aschenfürst: Flammenkrone kommt bei boss:defeated, nicht als Beute', () => {
  const { c, state } = setup();
  c('progress:grantXp', { amount: totalXpForLevel(39) });
  state.slices.quests.active.q_ash_sovereign = { status: 'active', progress: {} };
  for (let i = 0; i < 200; i++) assert.ok(!rollLoot({ type: 'ash_sovereign', level: 40, boss: true, bossId: 'ash_sovereign' }, { rng, questNeed: () => 1 }).some((d) => d.itemId === 'sovereign_crown'));
  assert.equal(c('quest:bossReward', { bossId: 'bonelord' }).ok, false);
  c('quest:event', { kind: 'boss', target: 'ash_sovereign' });
  assert.equal(c('quest:bossReward', { bossId: 'ash_sovereign' }).ok, true);
  assert.equal(countItem(state, 'sovereign_crown'), 1);
  assert.equal(c('quest:bossReward', { bossId: 'ash_sovereign' }).ok, false, 'nur einmal');
  assert.equal(questStatus(state, state.content ?? null, 'q_ash_sovereign') ?? 'ready', 'ready');
});

test('Glutprüfungen skalieren mit der Spielerstufe, Albtraumross ab Prüfungsstufe 20', () => {
  const a = trialSpec(5, 3, 20), b = trialSpec(5, 3, 40);
  assert.equal(a.level, 20); assert.equal(b.level, 40);
  assert.ok(b.bossHp > a.bossHp * 1.9);
  let steed = 0;
  for (let i = 0; i < 20000; i++) {
    const r = trialRewards(20, { rng, level: 36 });
    if (r.items.some((it) => it.itemId === 'mount_nightmare_steed')) steed++;
    if (i < 200) for (const it of r.items) if (ITEMS[it.itemId].slot && ITEMS[it.itemId].rarity !== 'legendary') assert.ok(ITEMS[it.itemId].ilvl >= 30, it.itemId);
  }
  assert.ok(steed > 20 && steed < 110, `Albtraumross ${steed}/20000`);
  assert.ok(!trialRewards(19, { rng: () => 0, level: 40 }).items.some((it) => it.itemId === 'mount_nightmare_steed'));
});

test('Sets: Teile existieren, Boni wirken ab der Teilzahl, Bossbeute liefert Setteile', () => {
  for (const [id, set] of Object.entries(SETS)) for (const p of set.pieces) assert.equal(ITEMS[p]?.set, id, `${id}: ${p}`);
  const eq = { head: 'varkhul_helm', chest: 'bone_mail', hands: null, feet: null };
  assert.deepEqual(computeBonus({ equipment: { head: 'varkhul_helm' } }), {});
  assert.deepEqual(computeBonus({ equipment: eq }), SETS.bonelord.bonuses[0].stats);
  const full = computeBonus({ equipment: { ...eq, hands: 'varkhul_grips', feet: 'varkhul_greaves' } });
  assert.equal(full.maxHp, 60); assert.equal(full.vit, 4);
  const { c, state } = setup();
  let pieces = 0;
  for (let i = 0; i < 40; i++) for (const d of c('loot:roll', { source: 'kill', id: 'bonelord', level: 6, isBoss: true, bossId: 'bonelord' }).drops) if (ITEMS[d.itemId]?.set === 'bonelord') pieces++;
  assert.ok(pieces >= 10 && pieces <= 32, `Setteile ${pieces}/40`);
  // Angelegtes Set landet in inventory.bonus
  state.slices.progress.level = 10;
  for (const id of ['varkhul_helm', 'bone_mail']) { c('inventory:add', { itemId: id }); c('inventory:equip', { slot: slotOf(state, id) }); }
  assert.equal(state.slices.inventory.bonus.vit, 4);
  c('inventory:unequip', { slot: 'head' });
  assert.equal(state.slices.inventory.bonus.vit, undefined);
});

test('Verstärken und Verzaubern: Kosten, Grenzen, Bonus, Speichern', () => {
  const { c, state } = setup('warrior');
  state.slices.progress.level = 20;
  assert.equal(c('smith:upgrade', { slot: 'weapon' }).reason, 'gold');
  c('wallet:addGold', { amount: 100000 });
  assert.equal(c('smith:upgrade', { slot: 'weapon' }).reason, 'mats');
  c('inventory:add', { itemId: 'grave_iron', qty: 20 });
  c('inventory:add', { itemId: 'ember_ore', qty: 30 });
  c('inventory:add', { itemId: 'ember_core', qty: 20 });
  c('inventory:add', { itemId: 'ember_shard', qty: 50 });
  for (let i = 0; i < 10; i++) assert.equal(c('smith:upgrade', { slot: 'weapon' }).ok, true, `Stufe ${i + 1}`);
  // +11 bis +15: Stufe und Materialien der neuen Gebiete
  assert.equal(c('smith:upgrade', { slot: 'weapon' }).reason, 'level');
  const p10 = state.slices.inventory.bonus.power;
  state.slices.progress.level = 40;
  assert.equal(c('smith:upgrade', { slot: 'weapon' }).reason, 'mats');
  c('wallet:addGold', { amount: 100000 });
  c('inventory:add', { itemId: 'bog_iron', qty: 8 });
  c('inventory:add', { itemId: 'rime_crystal', qty: 8 });
  c('inventory:add', { itemId: 'magma_scale', qty: 5 });
  for (let i = 10; i < 15; i++) assert.equal(c('smith:upgrade', { slot: 'weapon' }).ok, true, `Stufe ${i + 1}`);
  assert.equal(c('smith:upgrade', { slot: 'weapon' }).reason, 'max');
  assert.ok(state.slices.inventory.bonus.power > p10, 'über +10 wirkt weiter');
  for (let i = 10; i < 15; i++) assert.ok(upgradeCost(i).gold >= upgradeCost(i - 1).gold, `Kosten steigen bei +${i + 1}`);
  state.slices.progress.level = 20;
  assert.ok(state.slices.inventory.bonus.power >= 1);
  assert.ok(upgradeCost(9).gold > upgradeCost(0).gold * 20, 'Gold-Sink wächst');
  assert.equal(c('smith:enchant', { slot: 'weapon', enchantId: 'bulwark' }).reason, 'slot');
  assert.equal(c('smith:enchant', { slot: 'weapon', enchantId: 'ember_edge' }).ok, true);
  const p0 = state.slices.inventory.bonus.power;
  assert.ok(p0 >= ENCHANTS.ember_edge.stats.power);
  const b = setup('warrior');
  b.state.load(JSON.parse(JSON.stringify(state.snapshot())));
  assert.equal(b.state.slices.inventory.upgrades.weapon, 15);
  assert.equal(b.state.slices.inventory.enchants.weapon, 'ember_edge');
  assert.equal(b.state.slices.inventory.bonus.power, p0);
});

test('Stufenabstand: weit über der eigenen Stufe kaum Schaden, viel erlittener Schaden', () => {
  assert.equal(levelGapMult(30, 30), 1);
  assert.ok(levelGapMult(38, 40) >= 0.9 && levelGapTakenMult(40, 38) <= 1.15, 'zwei Stufen bleiben fair');
  assert.ok(levelGapMult(24, 40) <= 0.05 && levelGapTakenMult(40, 24) >= 3.9, 'Stufe 24 gegen Malgareth chancenlos');
  assert.ok(Math.abs(levelGapMult(37, 40) - 0.79) < 1e-9 && Math.abs(levelGapMult(36, 40) - 0.66) < 1e-9);
  assert.ok(Math.abs(levelGapMult(35, 40) - 0.40) < 1e-9 && Math.abs(levelGapTakenMult(40, 35) - 2.4) < 1e-9, 'fünf Stufen darunter: ×0,40 / ×2,4');
  for (let g = 0; g < 15; g++) assert.ok(levelGapMult(20, 20 + g + 1) <= levelGapMult(20, 20 + g) && levelGapTakenMult(20 + g + 1, 20) >= levelGapTakenMult(20 + g, 20), `monoton ${g}`);
  assert.ok(levelGapMult(40, 10) <= 1.25 && levelGapTakenMult(10, 40) >= 0.6);
  // Treffer: nur zwischen Teams, nur einmal, mindestens 1
  const hero = { team: 'hero', level: 24 }, boss = { team: 'enemy', level: 40 };
  const hit = applyLevelGap({ damage: 100, source: hero }, boss);
  assert.equal(hit.damage, 5);
  assert.equal(applyLevelGap(hit, boss).damage, 5, 'kein zweites Mal');
  // Geschoss und Trefferzone: Stufe des Schützen zählt
  assert.equal(applyLevelGap({ damage: 100, source: { team: 'hero', hero } }, boss).damage, 5, 'Geschoss des Helden');
  assert.equal(applyLevelGap({ damage: 100, source: { team: 'hero', owner: hero } }, boss).damage, 5, 'Explosion des Helden');
  assert.equal(applyLevelGap({ damage: 100, source: { owner: boss } }, hero).damage, 400, 'Geschoss des Bosses');
  assert.equal(applyLevelGap({ damage: 100, source: boss }, hero).damage, 400);
  assert.equal(applyLevelGap({ damage: 100, source: boss }, { team: 'enemy', level: 1 }).damage, 100, 'eigenes Team');
  assert.equal(applyLevelGap({ damage: 100, source: null }, hero).damage, 100, 'ohne Quelle');
  assert.equal(applyLevelGap({ damage: 3, source: hero }, boss).damage, 1);
  assert.equal(levelGapTier(24, 40), 'skull');
  assert.equal(levelGapTier(30, 30), 'even');
  assert.equal(levelGapTier(30, 20), 'trivial');
});

test('Questvielfalt: Reihenfolge, Benutzen, Erkunden, Eskorte und Entscheidungen', () => {
  const { c, state, content, events } = setup();
  const q = state.slices.quests;
  const done = (...ids) => q.completed.push(...ids);
  // Reihenfolge: falsches Siegel setzt zurück, richtige Folge erfüllt
  done('q_ashen_wolves', 'q_road_east', 'q_to_the_peaks', 'q_obsidian_shards');
  state.slices.progress.level = 14;
  assert.equal(c('quest:accept', { questId: 'q_rift_seals' }).ok, true);
  const seq = QUESTS.q_rift_seals.objectives[0].target;
  c('quest:event', { kind: 'interact', target: seq[0] });
  c('quest:event', { kind: 'interact', target: seq[2] });
  assert.equal(q.active.q_rift_seals.progress.seals, 0, 'falsch: von vorn');
  assert.ok(events.some(([e, p]) => e === EV.UI_TOAST && /Asche/.test(p.text)));
  assert.equal(questTarget(state, content).id, seq[0], 'Pfad zum nächsten richtigen Siegel');
  for (const id of seq) c('quest:event', { kind: 'interact', target: id });
  assert.equal(q.active.q_rift_seals.status, 'ready');
  // Benutzen: Gegenstand bei Annahme, wird verbraucht, jedes Objekt einmal
  assert.equal(c('quest:accept', { questId: 'q_poisoned_wells' }).ok, true);
  assert.equal(countItem(state, 'clean_salts'), 2);
  c('quest:event', { kind: 'interact', target: 'well_village' });
  c('quest:event', { kind: 'interact', target: 'well_village' });
  assert.equal(q.active.q_poisoned_wells.progress.wells, 1);
  assert.equal(countItem(state, 'clean_salts'), 1);
  c('quest:event', { kind: 'interact', target: 'well_mill' });
  assert.equal(q.active.q_poisoned_wells.status, 'ready');
  // Erkunden: mehrere Flächen, jede einmal, Pfad zur nächsten offenen
  done('q_boar_cull'); state.slices.progress.level = 7;
  c('quest:accept', { questId: 'q_ashwood_lookouts' });
  c('quest:event', { kind: 'reach', target: 'ashwood_lookout_n' });
  c('quest:event', { kind: 'reach', target: 'ashwood_lookout_n' });
  assert.equal(q.active.q_ashwood_lookouts.progress.posts, 1);
  // Eskorte: verborgen, bis die Welt sie kann; Fehlschlag setzt zurück
  done('q_bandit_camp'); state.slices.progress.level = 9;
  setWorldFeatures([]);
  assert.equal(questStatus(state, content, 'q_vesk_cart'), 'locked');
  setWorldFeatures(['escort', 'defend']);
  assert.equal(c('quest:accept', { questId: 'q_vesk_cart' }).ok, true);
  assert.ok(openObjectives(state, content).some((o) => o.kind === 'escort' && o.start?.id === 'vesk_cart' && !o.done));
  c('quest:event', { kind: 'escortFailed', target: 'escort_vesk_cart' });
  c('quest:event', { kind: 'escort', target: 'escort_vesk_cart' });
  assert.equal(q.active.q_vesk_cart.status, 'ready');
  setWorldFeatures([]);
  // Entscheidung: ohne Wahl keine Abgabe, Wahl schaltet genau eine Folgequest frei, überlebt Speichern
  done('q_bandit_chief'); state.slices.progress.level = 10;
  c('quest:accept', { questId: 'q_bandit_ledger' });
  c('quest:event', { kind: 'interact', target: 'bandit_strongbox' });
  assert.equal(c('quest:turnIn', { questId: 'q_bandit_ledger' }).reason, 'choice');
  const g0 = state.slices.wallet.gold;
  assert.equal(c('quest:turnIn', { questId: 'q_bandit_ledger', choice: 'expose' }).ok, true);
  assert.equal(state.slices.wallet.gold - g0, QUESTS.q_bandit_ledger.rewards.gold + 60);
  assert.equal(questStatus(state, content, 'q_vesk_penance'), 'available');
  assert.equal(questStatus(state, content, 'q_vesk_debt'), 'locked');
  state.load(JSON.parse(JSON.stringify(state.snapshot())));
  assert.equal(state.slices.quests.choices.q_bandit_ledger, 'expose');
  // Inhalt: jede Entscheidung hat Folgen, jede Reihenfolge passt zu count, Weltobjekte sind benannt
  for (const [id, d] of Object.entries(QUESTS)) {
    for (const o of d.objectives) if (o.kind === 'sequence') assert.equal(o.count, o.target.length, id);
    for (const ch of d.choices ?? []) assert.ok(ch.label && ch.hint, id);
    if (d.requiresChoice) assert.ok(QUESTS[d.requiresChoice[0]]?.choices?.some((x) => x.id === d.requiresChoice[1]), id);
  }
});

test('Champions: mindestens grün, ×4 Erfahrung, zählen fürs Auftragsbrett', () => {
  let green = 0, rare = 0, epic = 0, gear = 0;
  for (let i = 0; i < 4000; i++) {
    const d = rollLoot({ type: 'bandit', level: 12, family: 'humanoid', champion: true }, { rng, classId: 'warrior' });
    const g = d.filter((x) => ITEMS[x.itemId]?.slot);
    assert.ok(g.length >= 1 && g.every((x) => ITEMS[x.itemId].rarity !== 'common' && ITEMS[x.itemId].rarity !== 'legendary'));
    for (const x of g) { gear++; const r = ITEMS[x.itemId].rarity; if (r === 'uncommon') green++; if (r === 'rare') rare++; if (r === 'epic') epic++; }
  }
  assert.ok(rare / 4000 > 0.1 && rare / 4000 < 0.2 && epic / 4000 < 0.02, `blau ${rare / 4000} lila ${epic / 4000}`);
  const { c, state } = setup();
  state.slices.progress.level = 12;
  const a = c('progress:kill', { type: 'bandit', level: 12 }).xp;
  const b = c('progress:kill', { type: 'bandit', level: 12, champion: { affixes: ['flink'] } }).xp;
  assert.ok(Math.abs(b / a - 4) < 0.2, `${b} / ${a}`);
});

test('Auftragsbrett: Tagesrotation fest, Fortschritt, Belohnung, Wochentruhe', () => {
  const day = boardDay(Date.now()) + 1, now = day * 86400000 + 3600e3;
  assert.equal(boardDay(now), day);
  assert.deepEqual(boardOffers(day, 22), boardOffers(day, 22), 'für alle gleich');
  assert.notDeepEqual(boardOffers(day, 22), boardOffers(day + 1, 22), 'jeden Tag neu');
  for (let d = day; d < day + 60; d++) for (const lvl of [3, 15, 27, 40]) {
    const o = boardOffers(d, lvl);
    assert.equal(o.length, 3);
    assert.equal(new Set(o.map((x) => x.kind)).size, 3, 'nie zweimal dieselbe Art');
    if (lvl < 40) assert.ok(!o.some((x) => x.kind === 'trial'));
  }
  assert.ok(offerRewards(boardOffers(day, 40)[0], 40).xp === 0, 'auf 40 Gold statt Erfahrung');
  assert.equal(boardWeek(Date.UTC(2026, 9, 5)), boardWeek(Date.UTC(2026, 9, 11, 23)), 'Montag bis Sonntag');
  assert.notEqual(boardWeek(Date.UTC(2026, 9, 11, 23)), boardWeek(Date.UTC(2026, 9, 12, 1)));

  const { c, state } = setup();
  state.slices.progress.level = 12;
  c('board:sync', { now });
  const b = state.slices.board;
  assert.equal(b.level, 12);
  assert.ok(boardHasOffers(state, now));
  const offers = boardOffers(day, 12);
  const kill = offers.find((o) => o.kind === 'kill' || o.kind === 'elite' || o.kind === 'gather') ?? offers[0];
  assert.equal(c('board:accept', { offerId: kill.id, now }).ok, true);
  assert.equal(c('board:claim', { offerId: kill.id, now }).reason, 'notReady');
  for (let i = 0; i < kill.count; i++) {
    if (kill.kind === 'gather') state.commit('inventory:add', { itemId: kill.target[0], qty: 1, source: 'loot' });
    else c('progress:kill', { type: kill.target[0], level: 12 });
  }
  const g0 = state.slices.wallet.gold;
  assert.equal(c('board:claim', { offerId: kill.id, now }).ok, true);
  assert.ok(state.slices.wallet.gold > g0);
  assert.equal(c('board:claim', { offerId: kill.id, now }).ok, false, 'nur einmal');
  // Stufenaufstieg am selben Tag ändert die Aufträge nicht mehr
  state.slices.progress.level = 20;
  c('board:sync', { now });
  assert.equal(state.slices.board.level, 12);
  // Rückwärts geht die Zeit nicht, nächster Tag setzt zurück
  c('board:sync', { now: now - 86400000 });
  assert.equal(state.slices.board.day, day);
  c('board:sync', { now: now + 86400000 });
  assert.equal(state.slices.board.done.length, 0);
  assert.equal(state.slices.board.level, 20);
  // Wochentruhe
  assert.equal(c('board:claimWeek', { now: now + 86400000 }).reason, 'notReady');
  state.slices.board.weekDone = WEEK_GOAL;
  const r = c('board:claimWeek', { now: now + 86400000 });
  assert.equal(r.ok, true);
  assert.ok(r.gear && ['uncommon', 'rare'].includes(ITEMS[r.gear].rarity));
  assert.equal(c('board:claimWeek', { now: now + 86400000 }).ok, false);
  state.load(JSON.parse(JSON.stringify(state.snapshot())));
  assert.equal(state.slices.board.weekClaimed, true);
});

test('Bank: einlagern, entnehmen, erweitern, Materialien', () => {
  const { c, state } = setup();
  const bank = () => state.slices.bank;
  assert.equal(bank().size, 16);
  c('inventory:add', { itemId: 'wolf_pelt', qty: 5 });
  c('inventory:add', { itemId: 'bone_dust', qty: 3 });
  c('inventory:add', { itemId: 'spider_silk', qty: 1 });
  assert.equal(c('bank:deposit', { slot: slotOf(state, 'spider_silk') }).reason, 'quest');
  // Materialien liegen im Materialbeutel, nicht in der Tasche
  assert.equal(state.slices.inventory.mats.wolf_pelt, 5);
  assert.equal(c('bank:depositMaterials', {}).count, 0);
  c('inventory:add', { itemId: 'cudgel', qty: 1 });
  assert.equal(c('bank:deposit', { slot: slotOf(state, 'cudgel') }).ok, true);
  // Altes Material in der Kiste wandert beim Entnehmen in den Materialbeutel
  bank().slots[5] = { itemId: 'linen', qty: 4 };
  assert.equal(c('bank:withdraw', { slot: 5 }).qty, 4);
  assert.equal(state.slices.inventory.mats.linen, 4);
  assert.equal(countItem(state, 'wolf_pelt'), 5);
  assert.equal(c('bank:expand', {}).reason, 'gold');
  c('wallet:addGold', { amount: 200 });
  assert.equal(c('bank:expand', {}).size, 24);
  assert.equal(bank().slots.length, 24);
  assert.equal(state.slices.wallet.gold, 0);
  const b = setup(); b.state.load(JSON.parse(JSON.stringify(state.snapshot())));
  assert.equal(b.state.slices.bank.size, 24);
  assert.equal(b.state.slices.bank.slots.filter(Boolean).length, 1);
});

test('Erfolge: schalten automatisch frei, Titel wählbar, Event', () => {
  const { c, state, content, events } = setup();
  for (const [id, a] of Object.entries(ACHIEVEMENTS)) { assert.ok(a.name && a.icon && a.goal >= 1, id); assert.equal(typeof a.value(state), 'number', id); }
  c('progress:kill', { type: 'wolf', level: 1 });
  assert.ok(state.slices.achievements.unlocked.first_blood);
  assert.ok(events.some(([e, p]) => e === 'achievement:unlocked' && p.id === 'first_blood'));
  assert.ok(events.some(([e, p]) => e === 'achievement:unlocked' && p.id === 'first_blood'));
  assert.ok(!events.some(([e, p]) => e === EV.UI_TOAST && /Erfolg/.test(p.text)), 'Anzeige macht D');
  for (let i = 0; i < 99; i++) c('progress:kill', { type: 'wolf', level: 1 });
  assert.ok(state.slices.achievements.unlocked.wolf_bane);
  assert.equal(c('achievement:title', { id: 'first_blood' }).ok, false, 'kein Titel');
  assert.equal(c('achievement:title', { id: 'wolf_bane' }).ok, true);
  assert.equal(state.slices.achievements.title, 'wolf_bane');
  c('inventory:add', { itemId: 'sun_amulet' });
  assert.equal(state.slices.progress.stats.epicFound, 0, 'nur Beute zählt');
  c('loot:roll', { source: 'kill', id: 'bonelord', level: 6, isBoss: true, bossId: 'bonelord' });
  assert.equal(content.all('achievement').length, Object.keys(ACHIEVEMENTS).length);
});

test('Erfolge mit Belohnung: einmalig vergeben, nachgeholt, Gegenstand nach Klasse', () => {
  const { c, state, content, events } = setup('mage');
  content.defineAll('mount', { golden_stag: { name: 'Goldhirsch', achievement: 'rare_all' }, ember_scarab: { name: 'Glutskarabäus', achievement: 'trial_20' } });
  Object.assign(state.slices.character, { wardrobe: { looks: [], shown: {} }, mounts: { owned: [], active: null, riding: false } });
  const rewards = Object.entries(ACHIEVEMENTS).filter(([, a]) => a.reward);
  assert.ok(rewards.length >= 6 && rewards.length <= 8, 'nur einige schwere Erfolge');
  for (const [id, a] of rewards) {
    assert.ok(a.goal > 1 || a.points >= 40, `${id}: schwer`);
    if (a.reward.kind === 'look') assert.ok(ITEMS[a.reward.id]?.lookOnly && ITEMS[a.reward.id].source, id);
    if (a.reward.kind === 'item') for (const k of ['str', 'agi', 'int']) assert.equal(ITEMS[`${a.reward.id}_${k}`]?.source, 'achievement', id);
  }
  // Belohnungs-Items fallen nie zufällig
  for (let i = 0; i < 300; i++) c('loot:roll', { source: 'kill', id: 'skeleton', level: 40, elite: true });
  assert.ok(!state.slices.inventory.slots.some((x) => ITEMS[x?.itemId]?.source === 'achievement'));
  state.slices.inventory.slots.fill(null);
  // Großwildjäger -> Reittier, Die Sieben Gefallenen -> Garderobe, Unaufhaltsam -> Färbung (nur Erfolg)
  for (const k of Object.keys(RARE_ENEMIES)) state.slices.rares.kills[k] = 1;
  for (const t of ['bonelord', 'drowned_priestess', 'ember_tyrant', 'barrow_king', 'rot_mother', 'frost_wyrm', 'ash_sovereign']) state.slices.progress.stats.byType[t] = 1;
  state.slices.progress.stats.kills = 4999;
  c('progress:kill', { type: 'wolf', level: 1 });
  const a = state.slices.achievements, ch = state.slices.character;
  assert.ok(a.unlocked.rare_all && a.unlocked.all_bosses && a.unlocked.slayer_5000);
  assert.deepEqual(ch.mounts.owned, ['golden_stag']);
  assert.equal(ch.mounts.active, 'golden_stag');
  assert.deepEqual(ch.wardrobe.looks, ['fallen_crown']);
  assert.ok(a.rewarded.rare_all && a.rewarded.all_bosses && a.rewarded.slayer_5000);
  const ev = events.find(([e, p]) => e === 'achievement:unlocked' && p.id === 'rare_all');
  assert.deepEqual(ev[1].reward, { kind: 'mount', id: 'golden_stag' });
  assert.ok(events.some(([e, p]) => e === EV.MOUNT_LEARNED && p.mountId === 'golden_stag' && p.source === 'achievement'));
  // kein zweites Mal
  c('progress:kill', { type: 'wolf', level: 1 });
  assert.equal(ch.mounts.owned.length, 1);
  assert.equal(ch.wardrobe.looks.length, 1);
  // Meisterhand: Amulett in der Fassung der Klasse; volle Tasche -> Questbeutel
  state.slices.inventory.slots.fill({ itemId: 'minor_potion', qty: 20 });
  state.slices.inventory.upgrades.weapon = 15;
  c('progress:kill', { type: 'wolf', level: 1 });
  assert.ok(a.rewarded.upgrade_15);
  assert.ok(state.slices.inventory.questBag.some((x) => x.itemId === 'forge_heart_int'));
  // alter Spielstand: Erfolg schon errungen, Belohnung fehlt -> wird nachgeholt; Speichern/Laden behält den Vermerk
  const raw = JSON.parse(JSON.stringify(a));
  delete raw.rewarded.rare_all;
  ch.mounts.owned = []; ch.mounts.active = null;
  Object.assign(a, { rewarded: raw.rewarded });
  c('progress:kill', { type: 'wolf', level: 1 });
  assert.deepEqual(ch.mounts.owned, ['golden_stag'], 'nachgeholt');
  assert.equal(events.filter(([e, p]) => e === 'achievement:unlocked' && p.id === 'rare_all').length, 1, 'keine zweite Ansage');
});

test('Glutprüfung: Freischaltung, Fortschritt, Boss, Belohnung, Scheitern', () => {
  const { c, state, events } = setup('mage');
  assert.equal(c('trial:start', { tier: 1 }).reason, 'locked');
  c('progress:grantXp', { amount: 1e7 });
  state.slices.quests.completed.push('q_ignaroth');
  assert.equal(c('trial:start', { tier: 2 }).reason, 'tier');
  const r = c('trial:start', { tier: 1 });
  assert.equal(r.ok, true);
  const run = state.slices.trials.run;
  assert.ok(run.pool.length && run.bossId && run.target === 60);
  state.slices.world.zoneId = 'ember_trial';
  for (let i = 0; i < 40; i++) c('progress:kill', { type: run.pool[0], level: 20, trialTime: 100 });
  for (let i = 0; i < 5; i++) c('progress:kill', { type: run.elites[0], level: 20, elite: true, trialTime: 150 });
  assert.equal(run.phase, 'boss');
  assert.ok(events.some(([e, p]) => e === 'trial:boss' && p.bossId === run.bossId));
  const gold0 = state.slices.wallet.gold;
  c('progress:kill', { type: run.bossId, level: 20, isBoss: true, bossId: run.bossId, trialTime: 212.4 });
  assert.equal(run.phase, 'done');
  assert.equal(run.time, 212);
  assert.equal(state.slices.trials.best, 1);
  assert.ok(state.slices.wallet.gold >= gold0 + 210);
  assert.ok(countItem(state, 'ember_shard') >= 9, 'Splitter inkl. Erstabschluss');
  assert.ok(state.slices.achievements.unlocked.trial_1);
  c('trial:leave', {});
  assert.equal(c('trial:start', { tier: 2 }).ok, true);
  assert.equal(c('trial:fail', { reason: 'death' }).ok, true);
  assert.equal(state.slices.trials.run.phase, 'failed');
  assert.equal(state.slices.trials.best, 1);
  // Skalierung und Chancen
  assert.ok(trialSpec(10).hpMult > trialSpec(1).hpMult);
  for (let seed = 1; seed <= 3; seed++) { const b = trialSpec(1, seed).bossHp; assert.ok(b >= 8000 && b <= 10000, `Boss Stufe 1: ${b}`); }
  assert.ok(trialSpec(10, 2).bossHp > trialSpec(1, 2).bossHp * 3);
  assert.equal(trialSpec(3, 5).affixes.length, 1);
  assert.deepEqual(trialSpec(4, 9), trialSpec(4, 9), 'deterministisch');
  // Themen 20–40 erst nach dem Story-Boss: eine Prüfung darf keinen Questboss vorwegnehmen.
  assert.deepEqual(trialThemesFor(40), ['undead', 'tide', 'ember']);
  assert.deepEqual(trialThemesFor(40, ['q_barrow_king', 'q_rot_mother', 'q_frost_wyrm', 'q_ash_sovereign']).length, 7);
  assert.deepEqual(trialThemesFor(25, ['q_barrow_king', 'q_rot_mother']), ['undead', 'tide', 'ember', 'barrow']);
  assert.ok(trialChances(30).legendary <= 0.06 && trialChances(30).epic <= 0.4);
});

test('Seltene Weltgegner: Spawn, XP, eigene Beute, Wiederkehr, Erfolge', () => {
  for (const [id, r] of Object.entries(RARE_ENEMIES)) {
    assert.ok(ITEMS[r.signature[0]]?.source === 'rare', `${id}: eigenes Beutestück`);
    assert.ok(RARITY_ORDER.indexOf(ITEMS[r.signature[0]].rarity) <= RARITY_ORDER.indexOf('rare'), 'Signatur höchstens blau');
  }
  // Signaturstücke fallen nie zufällig
  for (let i = 0; i < 3000; i++) for (const d of rollLoot({ type: 'wolf', level: 10, elite: i % 2 === 0 }, { rng })) assert.notEqual(ITEMS[d.itemId]?.source, 'rare');
  // Seltenheit: mind. grün, lila ≤ 3 %, Signatur ~40 %
  let epic = 0, sig = 0, gear = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) {
    for (const d of rollLoot({ type: 'wolf_alpha', level: 4, elite: true, rareId: 'greymaw' }, { rng })) {
      const it = ITEMS[d.itemId];
      if (d.itemId === 'greymaw_fang') { sig++; continue; }
      if (!it?.slot) continue;
      gear++;
      assert.ok(it.rarity !== 'common' && it.rarity !== 'legendary', it.rarity);
      if (it.rarity === 'epic') epic++;
    }
  }
  assert.ok(gear >= N * 0.95 && epic / gear <= 0.035, `epic ${epic}/${gear}`);
  assert.ok(Math.abs(sig / N - 0.25) < 0.03, `Signatur ${sig / N}`);
  // Spawn: nie besiegt → immer; direkt danach → nie; nach Ablauf → mit Chance
  assert.equal(rareSpawnsFor('emberhollow', null, 0)[0]?.rareId, 'greymaw');
  assert.equal(rareSpawnsFor('emberhollow', null, 0, Math.random, 2).length, 0);  // nicht in den ersten Minuten
  const { state, c, events } = setup();
  const r = c('progress:kill', { type: 'wolf_alpha', level: 4, elite: true, rareId: 'greymaw', now: 1000 });
  assert.ok(r.xp >= mobXp(4) * 7, 'seltene geben ×8 Erfahrung');
  assert.equal(state.slices.rares.kills.greymaw, 1);
  assert.ok(events.some(([ev, p]) => ev === 'rare:killed' && p.rareId === 'greymaw'));
  assert.ok(state.slices.achievements.unlocked.rare_first);
  assert.equal(rareSpawnsFor('emberhollow', state.slices.rares, 2000).length, 0);
  assert.equal(rareSpawnsFor('emberhollow', state.slices.rares, 1000 + 301e3, () => 0.1).length, 1);
  assert.equal(rareSpawnsFor('emberhollow', state.slices.rares, 1000 + 301e3, () => 0.9).length, 0);
  // Unbekannte rareId und Bosse zählen nicht
  c('progress:kill', { type: 'bonelord', level: 6, isBoss: true, rareId: 'greymaw', now: 5 });
  c('progress:kill', { type: 'wolf', level: 1, rareId: 'nope' });
  assert.equal(state.slices.rares.kills.greymaw, 1);
  // Speichern/Laden
  const snap = JSON.parse(JSON.stringify(state.snapshot()));
  snap.slices.rares.kills.bogus = 3;
  state.load(snap);
  assert.deepEqual(state.slices.rares.kills, { greymaw: 1 });
  for (const id of Object.keys(RARE_ENEMIES)) c('progress:kill', { type: RARE_ENEMIES[id].base, level: 20, rareId: id, now: 9 });
  assert.ok(state.slices.achievements.unlocked.rare_all);
});

test('NPC-Gesprächszeilen folgen dem Fortschritt', () => {
  const { state, content } = setup();
  const first = npcIdleLine(state, content, 'elder_maren');
  assert.ok(first && first.includes('Glut'));
  state.slices.quests.completed.push('q_ashen_wolves', 'q_bonelord');
  assert.ok(npcIdleLine(state, content, 'elder_maren').includes('Flammenkrone'));
  for (const [id, line] of Object.entries(NPC_LINES)) for (const [q] of line.lines ?? []) assert.ok(!q || QUESTS[q], `${id}: unbekannte Quest ${q}`);
});

test('Questbeutel: Sammelobjekte bei voller Tasche, zählt für Quests, leert sich', () => {
  const { state, c, content } = setup();
  state.slices.quests.completed.push('q_ashen_wolves', 'q_road_east', 'q_to_the_peaks');
  state.slices.progress.level = 13;
  assert.equal(c('quest:accept', { questId: 'q_obsidian_shards' }).ok, true);
  const inv = state.slices.inventory;
  inv.slots = inv.slots.map(() => ({ itemId: 'copper_ring', qty: 1 }));
  // Materialien passen immer (Materialbeutel), auch bei voller Tasche
  assert.equal(c('inventory:add', { itemId: 'linen', qty: 1 }).added, 1);
  c('inventory:add', { itemId: 'obsidian_shard', qty: 3 });
  assert.equal(countItem(state, 'obsidian_shard'), 3);
  assert.deepEqual(inv.questBag, []);
  const q = content.get('quest', 'q_obsidian_shards').objectives[0];
  c('inventory:add', { itemId: 'obsidian_shard', qty: q.count });
  assert.equal(state.slices.quests.active.q_obsidian_shards.status, 'ready');
  // Questgegenstände ohne Platz: Questbeutel, wandert zurück, sobald Platz frei ist
  c('inventory:add', { itemId: 'varkhul_sigil', qty: 1 });
  assert.deepEqual(inv.questBag, [{ itemId: 'varkhul_sigil', qty: 1 }]);
  inv.slots[0] = null; inv.slots[1] = null;
  c('inventory:sort', {});
  assert.ok(inv.slots.some((x) => x?.itemId === 'varkhul_sigil'));
  // Speichern/Laden; alte Spielstände mit Material in der Tasche werden umgelagert
  const snap = JSON.parse(JSON.stringify(state.snapshot()));
  snap.slices.inventory.slots[1] = { itemId: 'wolf_pelt', qty: 7 };
  state.load(snap);
  assert.equal(countItem(state, 'obsidian_shard'), 3 + q.count);
  assert.equal(state.slices.inventory.mats.wolf_pelt, 7);
  assert.ok(!state.slices.inventory.slots.some((x) => x?.itemId === 'wolf_pelt'));
  // Abgabe nimmt auch aus dem Questbeutel
  c('quest:turnIn', { questId: 'q_obsidian_shards' });
  assert.ok(state.slices.quests.completed.includes('q_obsidian_shards') || state.slices.quests.active.q_obsidian_shards);
});

test('Questabgabe bei voller Tasche: Belohnung in den Questbeutel', () => {
  const { state, c, events } = setup('mage');
  const inv = state.slices.inventory;
  c('quest:accept', { questId: 'q_ashen_wolves' });
  for (let i = 0; i < 6; i++) c('progress:kill', { type: 'wolf', level: 1 });
  inv.slots = inv.slots.map(() => ({ itemId: 'copper_ring', qty: 1 }));
  const r = c('quest:turnIn', { questId: 'q_ashen_wolves' });
  assert.equal(r.ok, true);
  assert.ok(r.overflow >= 2 && state.slices.quests.completed.includes('q_ashen_wolves'));
  assert.ok(inv.questBag.some((e) => e.itemId === 'leather_jerkin'));
  assert.ok(events.some(([e, p]) => e === EV.UI_TOAST && /Questbeutel/.test(p.text)));
  inv.slots[0] = null; inv.slots[1] = null; inv.slots[2] = null;
  c('inventory:sort', {});
  assert.ok(inv.slots.some((x) => x?.itemId === 'leather_jerkin'));
  assert.ok(countItem(state, 'minor_potion') >= 2);
});

test('Auffindbarkeit: Hinführen zu Questgebern, neue Quests melden, Stufe 20 am Ende', () => {
  const { state, c, content, events } = setup();
  c('quest:accept', { questId: 'q_ashen_wolves' });
  for (let i = 0; i < 6; i++) c('progress:kill', { type: 'wolf', level: 1 });
  c('quest:turnIn', { questId: 'q_ashen_wolves' });
  assert.ok(events.some(([e, p]) => e === EV.UI_TOAST && /^Neue /.test(p.text)), 'neue Quests angesagt: ' + events.filter(([e]) => e === EV.UI_TOAST).map(([, p]) => p.text).join(' / '));
  c('quest:accept', { questId: 'q_into_catacombs' });
  assert.equal(questTarget(state, content).questId, 'q_into_catacombs');
  state.slices.progress.level = 4;
  assert.equal(c('quest:guide', { questId: 'q_spider_silk' }).ok, true, 'guide');
  const t = questTarget(state, content);
  assert.equal(t.id, 'smith_brom'); assert.ok(t.offer);
  c('quest:accept', { questId: 'q_spider_silk' });
  assert.equal(state.slices.quests.guide, null);
  assert.equal(c('quest:guide', { questId: 'q_ignaroth' }).ok, false);
  // Ende der Geschichte hebt auf 20
  const r = setup();
  r.state.slices.progress.level = 17; r.state.slices.progress.xp = totalXpForLevel(17);
  r.state.slices.quests.active.q_ignaroth = { status: 'active', progress: { boss: 1 } };
  r.c('inventory:add', { itemId: 'tyrant_crown', qty: 1 });
  const tr = r.c('quest:turnIn', { questId: 'q_ignaroth' }); assert.equal(tr.ok, true, JSON.stringify(tr));
  assert.equal(r.state.slices.progress.level, 20);
});

test('Schnellverkauf: Auswahl, Weiße verkaufen, Auto-Verkauf beim Aufsammeln', () => {
  const { state, c, content } = setup('warrior');
  const inv = state.slices.inventory;
  for (const id of ['cudgel', 'militia_sword', 'iron_mace', 'minor_mana', 'spider_silk']) c('inventory:add', { itemId: id, qty: 1 });
  const g0 = state.slices.wallet.gold;
  // Weiße verkaufen: nur gewöhnliche Ausrüstung ohne Verbesserung
  const junk = sellableSlots(state, content, 'common').map((i) => inv.slots[i].itemId);
  assert.ok(!junk.includes('iron_mace') && !junk.includes('minor_mana') && !junk.includes('spider_silk'));
  const r = c('inventory:sellJunk', { upTo: 'common' });
  assert.equal(r.ok, true);
  assert.equal(state.slices.wallet.gold, g0 + r.gold);
  // Mehrfachauswahl: Questgegenstände bleiben
  const slots = [slotOf(state, 'iron_mace'), slotOf(state, 'minor_mana'), slotOf(state, 'spider_silk')];
  const r2 = c('inventory:sell', { slots });
  assert.equal(r2.count, 2);
  assert.ok(slotOf(state, 'spider_silk') >= 0 && slotOf(state, 'iron_mace') < 0);
  // Auto-Verkauf
  c('inventory:autoSell', { mode: 'common' });
  c('progress:grantXp', { amount: 4000 });
  state.slices.inventory.equipment.weapon = 'steel_blade';
  const before = state.slices.inventory.slots.filter(Boolean).length;
  let sold = 0, kept = 0;
  for (let i = 0; i < 400 && (sold < 3 || kept < 1); i++) {
    const roll = c('loot:roll', { source: 'kill', id: 'bandit', level: 9, elite: true });
    for (const d of roll.drops) if (d.dropId && d.itemId && ITEMS[d.itemId].slot) {
      const cl = c('loot:claim', { dropId: d.dropId });
      if (cl.sold) { sold++; assert.equal(ITEMS[d.itemId].rarity, 'common'); } else kept++;
    }
  }
  assert.ok(sold >= 3 && kept >= 1, `sold ${sold} kept ${kept}`);
  const snap = JSON.parse(JSON.stringify(state.snapshot()));
  state.load(snap);
  assert.equal(state.slices.inventory.autoSell, 'common');
  assert.ok(state.slices.inventory.slots.filter(Boolean).length >= before);
});

let fail = 0;
test('Release-Runde: Schmiede 20–40, neue Questgegenstände, Händler mit Schmiede', () => {
  // Jedes Rezept und jede Verzauberung nutzt vorhandene Gegenstände; gecraftete Ausrüstung höchstens selten (außer Glutsplitter)
  for (const [id, r] of Object.entries(RECIPES)) {
    assert.ok(ITEMS[r.result], `${id}: Ergebnis`);
    for (const m of r.mats) assert.ok(ITEMS[m.itemId], `${id}: ${m.itemId}`);
    if (r.group !== 'shards' && ITEMS[r.result].slot) assert.ok(RARITY_ORDER.indexOf(ITEMS[r.result].rarity) <= RARITY_ORDER.indexOf('rare'), id);
  }
  for (const [id, e] of Object.entries(ENCHANTS)) for (const m of e.mats) assert.ok(ITEMS[m.itemId], `${id}: ${m.itemId}`);
  // Jede Klasse kann in jedem Tier ab 20 eine Waffe schmieden
  for (const cls of ['warrior', 'rogue', 'ranger', 'mage']) {
    for (const lvl of [23, 28, 33, 38]) {
      assert.ok(Object.values(RECIPES).some((r) => ITEMS[r.result].slot === 'weapon' && Math.abs(r.level - lvl) <= 3 && (!ITEMS[r.result].classes || ITEMS[r.result].classes.includes(cls))), `${cls} ${lvl}`);
    }
  }
  // Neue Questgegenstände fallen während der Quest
  for (const [qid, item, type] of [['q_imra_cargo', 'spice_bale', 'steppe_raider'], ['q_moll_crates', 'moll_crate', 'bog_lurker'], ['q_fenn_claws', 'stalker_claw', 'snow_stalker'], ['q_witch_charms', 'witch_charm', 'rime_witch'], ['q_bastion_supplies', 'bastion_supplies', 'ash_wraith']]) {
    assert.equal(ITEMS[item].type, 'quest');
    assert.ok(QUESTS[qid].objectives.some((o) => o.target === item && o.from.includes(type)), qid);
    const drops = rollLoot({ type, level: 30 }, { rng: () => 0.01, questNeed: (q, i) => (i === item ? 1 : 0) });
    assert.ok(drops.some((d) => d.itemId === item), `${item} fällt`);
  }
  // Unterwegs gibt es überall eine Schmiede
  for (const v of ['trader_imra', 'trader_moll', 'trader_fenn', 'quartermaster_ryn']) assert.equal(VENDORS[v].craft, true, v);
  assert.equal(QUESTS.q_homecoming.turnInNpc, 'commander_hale');

  // Hauptattribut (Fund aus Thread A): Säbel sind Schurkenschwerter, Belohnungen und Beute passen zur Klasse
  assert.ok(ITEMS.ashguard_sabre.stats.agi > (ITEMS.ashguard_sabre.stats.str ?? 0) && ITEMS.barrow_scimitar.stats.agi > (ITEMS.barrow_scimitar.stats.str ?? 0));
  for (const cls of ['warrior', 'rogue', 'ranger', 'mage']) {
    let n = 0, ok = 0;
    for (const q of Object.values(QUESTS)) for (const [i, g] of (q.rewards.gear ?? []).entries()) { n++; if (attrFit(ITEMS[pickRewardGear(g, cls, i)], cls)) ok++; }
    assert.ok(ok / n >= 0.95, `${cls}: ${ok}/${n} Belohnungen mit passendem Hauptattribut`);
    let seed = 1, fit = 0;
    const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let k = 0; k < 400; k++) if (attrFit(ITEMS[pickEquipment({ level: 5 + (k % 36), rarity: 'rare', classId: cls, rng })], cls)) fit++;
    assert.ok(fit / 400 >= 0.7, `${cls}: ${fit}/400 Beuteteile passen`);
  }
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`ok  ${name}`); } catch (e) { fail++; console.log(`FAIL ${name}\n    ${e.stack.split('\n').slice(0, 3).join('\n    ')}`); }
}
console.log(fail ? `${fail} von ${tests.length} fehlgeschlagen` : `alle ${tests.length} Tests grün`);
process.exit(fail ? 1 : 0);
