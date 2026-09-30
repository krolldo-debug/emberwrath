import { EV } from '../core/events.js';
import { ZONES, NPCS } from './zones.js';
import { LEVELS } from './levels.js';
import { LEVELS2 } from './levels2.js';
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
import { createAshwoodDecor } from '../sprites/decor_ashwood.js';
import { createPeaksDecor } from '../sprites/decor_peaks.js';
import { createBiomeTiles } from '../sprites/biomes.js';
import { createVillageProps } from '../sprites/village.js';

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
  for (const [id, def] of Object.entries({ ...LEVELS, ...LEVELS2 })) content.define('level', id, def);
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
  lazyAsset(assets, 'npcs2', createNpcSprites2);
  lazyAsset(assets, 'village', createVillageProps);
  lazyAsset(assets, 'decor_ashwood', createAshwoodDecor);
  lazyAsset(assets, 'decor_peaks', createPeaksDecor);
  lazyAsset(assets, 'biome_temple', () => createBiomeTiles('temple'));
  lazyAsset(assets, 'biome_forge', () => createBiomeTiles('forge'));

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
  game.addSessionSystem('world', (session) => {
    live.session = session;
    return { dispose() { if (live.session === session) live.session = null; } };
  }, 5);
}
