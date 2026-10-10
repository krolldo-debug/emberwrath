// Erfolge und Titel (Thread C). Reine Daten + Prüffunktionen auf dem Spielzustand.
// Geprüft wird nach jedem Command von Thread C (logic.js), freigeschaltet über das Slice 'achievements'.
// Erfolg: { name, desc, icon, group, points, title?, goal?, reward?, value(state) -> Zahl }
//   freigeschaltet, sobald value(state) >= goal (Standard 1). value liefert zugleich den Fortschritt.
// reward (nur einige schwere Erfolge, Runde 10.10.): { kind, id } – kosmetisch oder gleichwertig zu normaler Beute,
//   nichts aus dem Gold-Shop. Vergeben beim Freischalten in endgame.js (grantReward):
//   'dye'   Färbung aus character/cosmetics.js (DYES[id].achievement = Erfolg), danach frei wählbar im Spiegel
//   'look'  Aussehen für die Garderobe (Item mit lookOnly aus items.js), landet direkt in character.wardrobe.looks
//   'mount' Reittier aus character/mounts.js (MOUNTS[id].achievement), landet in character.mounts.owned
//   'item'  Gegenstand in die Tasche (voll: Questbeutel); byClass = Fassung nach Hauptattribut der Klasse (`<id>_<attr>`)
import { EQUIP_SLOTS, ITEMS } from './items.js';
import { activeSets } from './smithing.js';
import { RARE_ENEMIES } from './rares.js';

const st = (s) => s.slices.progress.stats;
const byType = (s, ...types) => types.reduce((n, t) => n + (st(s).byType?.[t] ?? 0), 0);
const rareCount = (s) => Object.keys(s.slices.rares?.kills ?? {}).length;
const done = (s, ids) => ids.filter((id) => s.slices.quests.completed.includes(id)).length;
const A = (group, name, desc, icon, points, value, goal = 1, title = null, reward = null) => ({ group, name, desc, icon, points, value, goal, title, reward });
const kills = (s, type) => byType(s, type);
const RARE_MASTER = 10;        // Herr der Jagd: jeden seltenen Gegner so oft
const TRIAL_BOSS_TIER = 15;    // Die Sieben Gefallenen: Herrscher in Glutprüfung ab dieser Stufe
const BOSSES = ['bonelord', 'drowned_priestess', 'ember_tyrant', 'barrow_king', 'rot_mother', 'frost_wyrm', 'ash_sovereign'];

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
  level_30: A('story', 'Veteran', 'Erreiche Stufe 30.', 'seal', 15, (s) => s.slices.progress.level, 30),
  level_40: A('story', 'Glutgeboren', 'Erreiche Stufe 40.', 'amulet_sun', 30, (s) => s.slices.progress.level, 40, 'Glutgeboren'),
  homecoming: A('story', 'Heimkehr', 'Beende die Geschichte von Emberwrath.', 'seal', 30, (s) => done(s, ['q_homecoming'])),
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
  ulgrim: A('combat', 'Hügelruhe', 'Besiege Ulgrim, den Hügelkönig.', 'charm_skull', 20, (s) => kills(s, 'barrow_king')),
  rot_mother: A('combat', 'Ausgebrannt', 'Besiege Mutter Fäulnis.', 'essence_shadow', 20, (s) => kills(s, 'rot_mother')),
  skalvyr: A('combat', 'Tauwetter', 'Besiege Skalvyr, den Frostwurm.', 'gem_sapphire', 25, (s) => kills(s, 'frost_wyrm')),
  malgareth: A('combat', 'Thronsturz', 'Stürze Malgareth, den Aschenfürsten.', 'amulet_sun', 40, (s) => kills(s, 'ash_sovereign'), 1, 'Thronbrecher'),
  all_bosses: A('combat', 'Die Sieben Gefallenen', `Besiege alle sieben Herrscher in Glutprüfung ${TRIAL_BOSS_TIER} oder höher.`, 'relic', 50,
    (s) => BOSSES.filter((t) => (s.slices.trials?.bosses?.[t] ?? 0) >= TRIAL_BOSS_TIER).length, BOSSES.length, null, { kind: 'look', id: 'fallen_crown' }),
  // Schaltet die Färbung Wachfeuer frei (character/cosmetics.js, DYES.watchfire.achievement); bewusst ohne reward, die Vitrine bleibt bei sechs
  weekly_4: A('combat', 'Wachfeuer', 'Meistere vier Wochenherausforderungen.', 'amulet_sun', 30, (s) => s.slices.daily?.cTotal ?? 0, 4),
  slayer_5000: A('combat', 'Unaufhaltsam', 'Besiege 5.000 Gegner.', 'sword', 40, (s) => st(s).kills, 5000, 'der Unaufhaltsame', { kind: 'dye', id: 'bloodmoon' }),
  champion_50: A('combat', 'Championsbrecher', 'Besiege 50 Champions.', 'charm_skull', 25, (s) => st(s).championKills ?? 0, 50, 'Championsbrecher'),
  rare_first: A('combat', 'Seltener Fang', 'Besiege einen seltenen Weltgegner.', 'fang', 5, (s) => rareCount(s)),
  rare_all: A('combat', 'Großwildjäger', `Besiege alle ${Object.keys(RARE_ENEMIES).length} seltenen Weltgegner.`, 'charm_skull', 25, (s) => rareCount(s), Object.keys(RARE_ENEMIES).length, 'Großwildjäger'),
  rare_master: A('combat', 'Herr der Jagd', `Besiege jeden der ${Object.keys(RARE_ENEMIES).length} seltenen Weltgegner ${RARE_MASTER}-mal.`, 'charm_skull', 50,
    (s) => Object.keys(RARE_ENEMIES).reduce((n, k) => n + Math.min(RARE_MASTER, s.slices.rares?.kills?.[k] ?? 0), 0), Object.keys(RARE_ENEMIES).length * RARE_MASTER, 'Herr der Jagd', { kind: 'mount', id: 'golden_stag' }),

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
  upgrade_15: A('craft', 'Meisterhand', 'Verstärke einen Platz auf +15.', 'amulet_sun', 50, (s) => Math.max(0, ...Object.values(s.slices.inventory.upgrades ?? {})), 15, 'Meisterschmied', { kind: 'item', id: 'forge_heart', byClass: true }),
  enchanter: A('craft', 'Verzauberer', 'Verzaubere drei Plätze.', 'essence_shadow', 15, (s) => Object.values(s.slices.inventory.enchants ?? {}).filter(Boolean).length, 3),

  // --- Glutprüfungen
  trial_1: A('trial', 'Durch das Feuer', 'Bestehe eine Glutprüfung.', 'ore_ember', 15, (s) => s.slices.trials?.best ?? 0, 1),
  trial_5: A('trial', 'Glutgehärtet', 'Bestehe Glutprüfung 5.', 'ore_ember', 25, (s) => s.slices.trials?.best ?? 0, 5, 'Glutgehärtet'),
  trial_10: A('trial', 'Herr der Esse', 'Bestehe Glutprüfung 10.', 'amulet_sun', 40, (s) => s.slices.trials?.best ?? 0, 10, 'Herr der Esse'),
  trial_20: A('trial', 'Glutfürst', 'Bestehe Glutprüfung 20.', 'ore_ember', 50, (s) => s.slices.trials?.best ?? 0, 20, 'Glutfürst', { kind: 'mount', id: 'ember_scarab' }),
  trial_30: A('trial', 'Unverlöschlich', 'Bestehe Glutprüfung 30.', 'amulet_sun', 60, (s) => s.slices.trials?.best ?? 0, 30, 'der Unverlöschliche', { kind: 'dye', id: 'whiteflame' }),
};

// Erfolge mit Belohnung, ungefähr in der Reihenfolge, in der man sie erreicht (Vitrine im Fenster)
const REWARD_ORDER = ['rare_master', 'all_bosses', 'slayer_5000', 'trial_20', 'upgrade_15', 'trial_30'];
export const REWARD_ACHIEVEMENTS = [...REWARD_ORDER, ...Object.keys(ACHIEVEMENTS).filter((id) => ACHIEVEMENTS[id].reward && !REWARD_ORDER.includes(id))];

// Gegenstand einer Belohnung für eine Klasse (byClass: Fassung nach Hauptattribut, sonst die ID selbst)
export function rewardItemId(reward, primary) {
  if (!reward || reward.kind !== 'item') return null;
  return reward.byClass ? `${reward.id}_${['str', 'agi', 'int'].includes(primary) ? primary : 'str'}` : reward.id;
}
