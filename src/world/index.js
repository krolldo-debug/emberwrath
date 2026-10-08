import { EV } from '../core/events.js';
import { ZONES, NPCS } from './zones.js';
import { LEVELS } from './levels.js';
import { LEVELS2 } from './levels2.js';
import { LEVELS3 } from './levels3.js';
import { ENEMY_TYPES } from '../entities/enemyTypes.js';
import { createWolfSprites } from '../sprites/wolf.js';
import { createBonelordSprites } from '../sprites/bonelord.js';
import { createNpcSprites } from '../sprites/npcs.js';
import { createCryptSprites } from '../sprites/crypt.js';
import { createOutdoorSprites } from '../sprites/outdoor.js';
import { createAshwoodFoes } from '../sprites/foes_ashwood.js';
import { createTempleFoes } from '../sprites/foes_temple.js';
import { createCinderFoes } from '../sprites/foes_cinder.js';
import { createForgeFoes } from '../sprites/foes_forge.js';
import { createNerithSprites } from '../sprites/nerith.js';
import { createIgnarothSprites } from '../sprites/ignaroth.js';
import { createNpcSprites2 } from '../sprites/npcs2.js';
import { createSteppeFoes } from '../sprites/foes_steppe.js';
import { createMarshFoes } from '../sprites/foes_marsh.js';
import { createFrostFoes } from '../sprites/foes_frost.js';
import { createRimeFoes } from '../sprites/foes_rime.js';
import { createThroneFoes } from '../sprites/foes_throne.js';
import { createBarrowFoes } from '../sprites/foes_barrow.js';
import { createSporeFoes } from '../sprites/foes_spore.js';
import { createWastesFoes } from '../sprites/foes_wastes.js';
import { createNew1Foes } from '../sprites/foes_new1.js';
import { createNew2Foes } from '../sprites/foes_new2.js';
import { createUlgrimSprites } from '../sprites/barrow_king.js';
import { createSkalvyrSprites } from '../sprites/frost_wyrm.js';
import { createRotMotherSprites } from '../sprites/rot_mother.js';
import { createMalgarethSprites } from '../sprites/ash_sovereign.js';
import { createNpcSprites3 } from '../sprites/npcs3.js';
import { createAshwoodDecor } from '../sprites/decor_ashwood.js';
import { createPeaksDecor } from '../sprites/decor_peaks.js';
import { createBiomeTiles } from '../sprites/biomes.js';
import { createBiomeTiles3 as createBiomesBarrowSpore } from '../sprites/biomes_barrow_spore.js';
import { createSteppeDecor } from '../sprites/decor_steppe.js';
import { createMarshDecor } from '../sprites/decor_marsh.js';
import { createFrostDecor } from '../sprites/decor_frost.js';
import { createWastesDecor } from '../sprites/decor_wastes.js';
import { createBiomeTiles3 as createBiomesRimeThrone } from '../sprites/biomes_rime_throne.js';
import { createVillageProps } from '../sprites/village.js';
import { createWaystoneSprites } from '../sprites/waystone.js';
import { createBoardSprites } from '../sprites/board.js';
import { createCaravanSprites } from '../sprites/caravan.js';
import { installQuestRuns } from './questRuns.js';

// Grafik erst beim ersten Zugriff erzeugen (spart Ladezeit: jede Zone
// braucht nur ihre eigenen Gegner und Deko).
function lazyAsset(assets, key, factory) {
  if (key in assets.sprites) throw new Error(`Asset ${key} doppelt definiert`);
  Object.defineProperty(assets.sprites, key, {
    configurable: true, enumerable: true,
    get() {
      const value = factory();
      Object.defineProperty(assets.sprites, key, { value, writable: true, configurable: true, enumerable: true });
      return value;
    },
  });
}
const FOE_GROUPS = {
  foes_ashwood: [createAshwoodFoes, ['ash_boar', 'bandit', 'bandit_archer', 'thorn_crawler', 'bandit_chief']],
  foes_temple: [createTempleFoes, ['drowned', 'tide_cultist', 'temple_guardian']],
  foes_cinder: [createCinderFoes, ['fire_imp', 'magma_hound', 'ash_golem', 'cinder_cultist', 'magma_behemoth']],
  foes_forge: [createForgeFoes, ['forge_golem', 'flame_acolyte', 'ember_drake', 'forge_warden']],
  foes_steppe: [createSteppeFoes, ['steppe_raider', 'raider_archer', 'dust_hyena', 'ash_vulture', 'steppe_warlord']],
  foes_marsh: [createMarshFoes, ['bog_lurker', 'rot_shaman', 'swamp_leech', 'plague_toad', 'bog_horror']],
  foes_frost: [createFrostFoes, ['ice_troll', 'frost_wolf', 'rime_witch', 'snow_stalker', 'ice_troll_chief']],
  foes_rime: [createRimeFoes, ['ice_elemental', 'crystal_spider', 'frozen_knight']],
  foes_throne: [createThroneFoes, ['throne_guard', 'ash_priest', 'ember_hellhound', 'throne_sentinel']],
  foes_barrow: [createBarrowFoes, ['barrow_wight', 'grave_hound', 'bone_archer', 'wight_caller']],
  foes_spore: [createSporeFoes, ['sporeling', 'fungal_brute', 'spore_caster']],
  foes_wastes: [createWastesFoes, ['ash_wraith', 'cinder_knight', 'magma_serpent', 'ember_cultist_adept', 'waste_colossus']],
  foes_new1: [createNew1Foes, ['ember_beetle', 'bandit_shieldbearer', 'cinder_sapper', 'cliff_harpy']],
  foes_new2: [createNew2Foes, ['dust_shaman', 'dust_totem', 'gnoll_trapper', 'bog_slime', 'bog_slime_small', 'marsh_hag', 'frost_revenant', 'snow_burrower', 'cinder_bombardier', 'phase_wraith']],
};

// Thread B – Welt: Zonen, Karten, Gegner, NPCs, Boss, world-Slice.
//
// Slice 'world' (gespeichert):
//   { zoneId, spawnId, pos: {x,y}|null, flags: { [key]: true }, bossesDefeated: [bossId] }
//   pos wird beim Speichern aus der laufenden Welt übernommen (nur in offenen
//   Zonen; in Instanzen startet man nach dem Laden am Eingang).
// Commands:
//   world:enterZone      { zoneId, spawnId }         (PlayScene beim Zonenwechsel)
//   world:setFlag        { key, value = true }       (Truhen, entdeckte Flächen …)
//   world:bossDefeated ★ { bossId, x, y }            -> EV.BOSS_DEFEATED
export function installWorld(game) {
  const { content, state, assets } = game;

  for (const [id, def] of Object.entries(ZONES)) content.define('zone', id, def);
  for (const [id, def] of Object.entries(NPCS)) content.define('npc', id, def);
  // Karten als Inhalt (Minimap, Wegführung über Zonengrenzen)
  for (const [id, def] of Object.entries({ ...LEVELS, ...LEVELS2, ...LEVELS3 })) content.define('level', id, def);
  for (const [id, def] of Object.entries(ENEMY_TYPES)) {
    content.define('enemy', id, { name: def.name, level: def.level ?? def.levels?.[0] ?? 1, levels: def.levels ?? null, xp: def.xp, family: def.family, boss: !!def.boss, bossId: def.bossId ?? null, elite: !!def.elite });
  }

  assets.define('wolf', () => createWolfSprites('wolf'));
  assets.define('wolf_alpha', () => createWolfSprites('alpha'));
  assets.define('bonelord', createBonelordSprites);
  assets.define('npcs', createNpcSprites);
  assets.define('crypt', createCryptSprites);
  assets.define('outdoor', createOutdoorSprites);
  for (const [group, [factory, keys]] of Object.entries(FOE_GROUPS)) {
    lazyAsset(assets, group, factory);
    for (const k of keys) lazyAsset(assets, k, () => assets.sprites[group][k]);
  }
  lazyAsset(assets, 'nerith', createNerithSprites);
  lazyAsset(assets, 'ignaroth', createIgnarothSprites);
  lazyAsset(assets, 'barrow_king', createUlgrimSprites);
  lazyAsset(assets, 'frost_wyrm', createSkalvyrSprites);
  lazyAsset(assets, 'rot_mother', createRotMotherSprites);
  lazyAsset(assets, 'ash_sovereign', createMalgarethSprites);
  lazyAsset(assets, 'npcs2', createNpcSprites2);
  lazyAsset(assets, 'npcs3', createNpcSprites3);
  lazyAsset(assets, 'village', createVillageProps);
  lazyAsset(assets, 'waystone', createWaystoneSprites);
  lazyAsset(assets, 'quest_board', createBoardSprites);
  lazyAsset(assets, 'caravan', createCaravanSprites); // Eskorte/Verteidigen: Karren, Planwagen, Ritualkreis
  lazyAsset(assets, 'decor_ashwood', createAshwoodDecor);
  lazyAsset(assets, 'decor_peaks', createPeaksDecor);
  lazyAsset(assets, 'biome_temple', () => createBiomeTiles('temple'));
  lazyAsset(assets, 'biome_forge', () => createBiomeTiles('forge'));

  // Runde 3: Platzhalter, solange eigene Grafik fehlt (Gegner -> Vorbild, Deko/Biom -> verwandter Satz)
  for (const [id, def] of Object.entries(ENEMY_TYPES)) {
    if (def.spriteBase && !(def.sprites in assets.sprites)) lazyAsset(assets, def.sprites, () => assets.sprites[def.spriteBase]);
  }
  lazyAsset(assets, 'decor_steppe', createSteppeDecor);
  lazyAsset(assets, 'decor_marsh', createMarshDecor);
  lazyAsset(assets, 'decor_frost', createFrostDecor);
  lazyAsset(assets, 'decor_wastes', createWastesDecor);
  lazyAsset(assets, 'biome_barrow', () => createBiomesBarrowSpore('barrow'));
  lazyAsset(assets, 'biome_spore', () => createBiomesBarrowSpore('spore'));
  lazyAsset(assets, 'biome_rime', () => createBiomesRimeThrone('rime'));
  lazyAsset(assets, 'biome_throne', () => createBiomesRimeThrone('throne'));

  const startZone = Object.keys(ZONES).find((k) => ZONES[k].start);
  const live = { session: null };

  state.defineSlice('world', {
    create: () => ({ zoneId: startZone, spawnId: 'start', pos: null, flags: {}, bossesDefeated: [] }),
    serialize: (s) => {
      const out = structuredClone(s);
      const w = live.session?.world;
      if (w && w.zone.id === s.zoneId && !w.hero.dead) {
        if (w.zone.instanced) { out.pos = null; out.spawnId = 'start'; }
        else out.pos = { x: Math.round(w.hero.x), y: Math.round(w.hero.y) };
      }
      return out;
    },
    deserialize: (json) => {
      const s = { zoneId: startZone, spawnId: 'start', pos: null, flags: {}, bossesDefeated: [], ...json };
      if (!content.find('zone', s.zoneId)) { s.zoneId = startZone; s.spawnId = 'start'; s.pos = null; }
      if (typeof s.flags !== 'object' || !s.flags) s.flags = {};
      if (!Array.isArray(s.bossesDefeated)) s.bossesDefeated = [];
      return s;
    },
  });

  state.defineCommand('world:enterZone', (s, { zoneId, spawnId }) => {
    const w = s.get('world');
    if (w.zoneId !== zoneId || w.spawnId !== spawnId) w.pos = null;
    w.zoneId = zoneId; w.spawnId = spawnId;
  });
  state.defineCommand('world:setFlag', (s, { key, value = true }) => {
    s.get('world').flags[key] = value;
  });
  state.defineCommand('world:bossDefeated', (s, { bossId, x, y }, ctx) => {
    const w = s.get('world');
    const first = !w.bossesDefeated.includes(bossId);
    if (first) w.bossesDefeated.push(bossId);
    ctx.bus.emit(EV.BOSS_DEFEATED, { bossId, x, y, first });
    return { first };
  }, { authoritative: true });

  // Hält die laufende Sitzung für serialize() fest (Position beim Speichern).
  // Wegsteine: 'travel:go' { zoneId } (Reisemenü, Panel 'travel' von D) -> Abreise am Wegstein der
  // aktuellen Welt (prüft Freischaltung und Kampf, Lichtsäule ~0,6 s, dann EV.ZONE_TRAVEL).
  // Ankunft über Spawn 'waystone' -> Lichtsäule am Helden.
  game.addSessionSystem('world', (session) => {
    live.session = session;
    session.bus.on('travel:go', (e) => {
      const w = session.world;
      if (!w || !e?.zoneId) return;
      if (w.waystone) w.waystone.depart(w, e.zoneId);
    });
    session.bus.on(EV.ZONE_ENTER, (e) => {
      if (e?.spawnId !== 'waystone') return;
      const w = session.world;
      if (w?.waystone) { w.waystone.unlock(w); w.waystone.arrive(w); }
    });
    return {
      update(dt, s) { if (s.paused && s.world?.waystone?.departing) s.world.waystone.tickPaused(dt, s.world); },
      dispose() { if (live.session === session) live.session = null; },
    };
  }, 5);

  // Eskorte und Verteidigen (questRuns.js, Vertrag C §4); meldet game.progression.setWorldFeatures beim Weltstart.
  installQuestRuns(game);
}
