// Erfolge und Titel (Thread C). Reine Daten + Prüffunktionen auf dem Spielzustand.
// Geprüft wird nach jedem Command von Thread C (logic.js), freigeschaltet über das Slice 'achievements'.
// Erfolg: { name, desc, icon, group, points, title?, goal?, value(state) -> Zahl }
//   freigeschaltet, sobald value(state) >= goal (Standard 1). value liefert zugleich den Fortschritt.
import { EQUIP_SLOTS, ITEMS } from './items.js';
import { activeSets } from './smithing.js';
import { RARE_ENEMIES } from './rares.js';

const st = (s) => s.slices.progress.stats;
const byType = (s, ...types) => types.reduce((n, t) => n + (st(s).byType?.[t] ?? 0), 0);
const rareCount = (s) => Object.keys(s.slices.rares?.kills ?? {}).length;
const done = (s, ids) => ids.filter((id) => s.slices.quests.completed.includes(id)).length;
const A = (group, name, desc, icon, points, value, goal = 1, title = null) => ({ group, name, desc, icon, points, value, goal, title });

const Q_EMBERHOLLOW = ['q_ashen_wolves', 'q_glutfang', 'q_into_catacombs', 'q_spider_silk', 'q_bonelord', 'q_road_east'];
const Q_ASHWOOD = ['q_boar_cull', 'q_bandit_camp', 'q_bandit_chief', 'q_temple_shore', 'q_nerith', 'q_to_the_peaks', 'q_thorn_sap', 'q_lost_satchel', 'q_drowned_relics'];
const Q_PEAKS = ['q_imp_plague', 'q_hound_pack', 'q_behemoth', 'q_forge_gate', 'q_forge_warden', 'q_forge_cores', 'q_ember_drakes', 'q_ignaroth', 'q_obsidian_shards', 'q_rift_seals', 'q_cultist_tomes'];

export const ACHIEVEMENT_GROUPS = { story: 'Geschichte', combat: 'Kampf', loot: 'Beute', craft: 'Handwerk', trial: 'Glutprüfungen' };

export const ACHIEVEMENTS = {
  // --- Geschichte
  first_quest: A('story', 'Ein Anfang', 'Schließe deine erste Quest ab.', 'scroll', 5, (s) => st(s).questsCompleted),
  hollow_hero: A('story', 'Retter der Glutsenke', 'Schließe alle Quests der Glutsenke ab.', 'seal', 10, (s) => done(s, Q_EMBERHOLLOW), Q_EMBERHOLLOW.length, 'der Glutsenke'),
  ashwood_warden: A('story', 'Hüter des Aschenwalds', 'Schließe alle Quests im Aschenwald ab.', 'map', 15, (s) => done(s, Q_ASHWOOD), Q_ASHWOOD.length, 'Waldhüter'),
  peak_breaker: A('story', 'Bezwinger der Höhen', 'Schließe alle Quests in den Schlackenhöhen ab.', 'map', 20, (s) => done(s, Q_PEAKS), Q_PEAKS.length),
  level_10: A('story', 'Erfahren', 'Erreiche Stufe 10.', 'scroll', 10, (s) => s.slices.progress.level, 10),
  level_20: A('story', 'Legende von Emberwrath', 'Erreiche Stufe 20.', 'seal', 25, (s) => s.slices.progress.level, 20, 'Legende'),
  bounty_hunter: A('story', 'Kopfgeldjäger', 'Erfülle 10 Kopfgelder.', 'letter', 15, (s) => Object.values(s.slices.quests.repeats ?? {}).reduce((a, b) => a + b, 0), 10, 'Kopfgeldjäger'),

  // --- Kampf
  first_blood: A('combat', 'Erstes Blut', 'Besiege deinen ersten Gegner.', 'sword', 5, (s) => st(s).kills),
  wolf_bane: A('combat', 'Wolfsbann', 'Erlege 100 Aschewölfe.', 'fang', 15, (s) => byType(s, 'wolf', 'wolf_alpha'), 100, 'Wolfsbann'),
  bone_breaker: A('combat', 'Knochenbrecher', 'Zerschlage 150 Skelette.', 'bone', 15, (s) => byType(s, 'skeleton', 'archer'), 150),
  slayer_500: A('combat', 'Schlächter', 'Besiege 500 Gegner.', 'sword', 20, (s) => st(s).kills, 500, 'der Schlächter'),
  elite_10: A('combat', 'Elitejäger', 'Besiege 10 Elitegegner.', 'charm_skull', 15, (s) => st(s).eliteKills ?? 0, 10),
  varkhul: A('combat', 'Grabesruhe', 'Besiege Varkhul, den Knochenfürsten.', 'charm_skull', 10, (s) => byType(s, 'bonelord')),
  nerith: A('combat', 'Ebbe', 'Besiege Nerith, die Ertrunkene Priesterin.', 'relic', 15, (s) => byType(s, 'drowned_priestess')),
  ignaroth: A('combat', 'Königsmörder', 'Stürze Ignaroth, den Glut-Tyrannen.', 'ore_ember', 25, (s) => byType(s, 'ember_tyrant'), 1, 'Königsmörder'),
  ignaroth_5: A('combat', 'Tyrannenschreck', 'Besiege Ignaroth fünfmal.', 'ore_ember', 20, (s) => byType(s, 'ember_tyrant'), 5),
  rare_first: A('combat', 'Seltener Fang', 'Besiege einen seltenen Weltgegner.', 'fang', 5, (s) => rareCount(s)),
  rare_all: A('combat', 'Großwildjäger', `Besiege alle ${Object.keys(RARE_ENEMIES).length} seltenen Weltgegner.`, 'charm_skull', 25, (s) => rareCount(s), Object.keys(RARE_ENEMIES).length, 'Großwildjäger'),

  // --- Beute
  first_epic: A('loot', 'Lila Glanz', 'Finde dein erstes episches Item.', 'gem_amethyst', 15, (s) => st(s).epicFound ?? 0),
  first_legendary: A('loot', 'Aus Glut geschmiedet', 'Finde ein legendäres Item.', 'amulet_sun', 30, (s) => st(s).legendaryFound ?? 0, 1, 'der Auserwählte'),
  full_gear: A('loot', 'Voll gerüstet', 'Trage auf allen 7 Plätzen Ausrüstung.', 'plate_iron', 10, (s) => EQUIP_SLOTS.filter((k) => s.slices.inventory.equipment[k]).length, 7),
  all_blue: A('loot', 'Ganz in Blau', 'Trage nur seltene oder bessere Ausrüstung auf allen Plätzen.', 'ring_sapphire', 20,
    (s) => EQUIP_SLOTS.filter((k) => ['rare', 'epic', 'legendary'].includes(ITEMS[s.slices.inventory.equipment[k]]?.rarity)).length, 7),
  set_complete: A('loot', 'Vollständig', 'Trage ein vollständiges Set.', 'seal', 25, (s) => (activeSets(s.slices.inventory.equipment).some((x) => x.count >= x.total) ? 1 : 0), 1, 'Sammler'),
  rich_1000: A('loot', 'Wohlhabend', 'Verdiene insgesamt 1.000 Gold.', 'gold', 10, (s) => st(s).goldEarned, 1000),
  rich_10000: A('loot', 'Glutbaron', 'Verdiene insgesamt 10.000 Gold.', 'gold_pile', 20, (s) => st(s).goldEarned, 10000, 'Glutbaron'),

  // --- Handwerk
  first_craft: A('craft', 'Lehrling der Esse', 'Stelle etwas in der Schmiede her.', 'ore_iron', 5, (s) => st(s).crafted ?? 0),
  crafter_25: A('craft', 'Meister der Esse', 'Stelle 25 Dinge her.', 'ore_ember', 15, (s) => st(s).crafted ?? 0, 25, 'Schmiedemeister'),
  upgrade_5: A('craft', 'Gehärtet', 'Verstärke einen Platz auf +5.', 'ore_ember', 15, (s) => Math.max(0, ...Object.values(s.slices.inventory.upgrades ?? {})), 5),
  upgrade_10: A('craft', 'Unzerbrechlich', 'Verstärke einen Platz auf +10.', 'ore_ember', 30, (s) => Math.max(0, ...Object.values(s.slices.inventory.upgrades ?? {})), 10, 'der Unzerbrechliche'),
  enchanter: A('craft', 'Verzauberer', 'Verzaubere drei Plätze.', 'essence_shadow', 15, (s) => Object.values(s.slices.inventory.enchants ?? {}).filter(Boolean).length, 3),

  // --- Glutprüfungen
  trial_1: A('trial', 'Durch das Feuer', 'Bestehe eine Glutprüfung.', 'ore_ember', 15, (s) => s.slices.trials?.best ?? 0, 1),
  trial_5: A('trial', 'Glutgehärtet', 'Bestehe Glutprüfung 5.', 'ore_ember', 25, (s) => s.slices.trials?.best ?? 0, 5, 'Glutgehärtet'),
  trial_10: A('trial', 'Herr der Esse', 'Bestehe Glutprüfung 10.', 'amulet_sun', 40, (s) => s.slices.trials?.best ?? 0, 10, 'Herr der Esse'),
};
