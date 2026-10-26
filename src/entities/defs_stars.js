// Sternenscherben Teil 1 (Stufe 40–50): Gegner der Treibenden Gärten, der Splitterweiten und ihrer Dungeons.
// Abgeleitet wie Runde 3 (enemyTypes3.js derive: Verhalten und Maße vom Vorbild, Leben/Schaden auf die Stufe
// skaliert). Figuren: umgefärbte Sätze der Vorbilder (recolor, sprites/recolor.js), bis eigene Figuren kommen.
import { derive } from './enemyTypes3.js';

// Farbrampen der Umfärbung (dunkel → hell); accent färbt kräftige Farben (Augen, Glut) in eine eigene Rampe
const PINK_FUR = ['#2a1a2e', '#4a2a48', '#6e3a62', '#9a5482', '#c47aa4', '#eaaccc', '#fbe0ee'];
const VOID = ['#0e0818', '#1e1234', '#34205a', '#503486', '#7454b4', '#a48ae0', '#dccbff'];
const BARK = ['#141018', '#241a2c', '#342640', '#3d5a5a', '#507468', '#6c927c', '#a4c4a0'];
const THORN = ['#16141c', '#2a2a36', '#2e434c', '#3d5a5a', '#6c927c', '#c86a98', '#ffd8ea'];
const PEARL = ['#1c1a2c', '#2a2840', '#4a4466', '#7c769c', '#9c97ba', '#c2bed8', '#f4f2fc'];
const MOTH = ['#1a1630', '#2c2650', '#4a4078', '#6e64a4', '#9c94cc', '#cdc8ec', '#ffffff'];
const GLASS = ['#0a1c2a', '#123248', '#1e5274', '#3a84a8', '#6cbcd8', '#b0e8f4', '#f4feff'];
const SAND = ['#1e1a24', '#342c3a', '#4e4252', '#6e5e6a', '#94807e', '#bea89a', '#e8d8c4'];
const CYAN = { ramp: ['#1c6c8c', '#3ab4d8', '#9cf0ff', '#ffffff'] };
const MAGENTA = { ramp: ['#7a2a8a', '#c25ad8', '#f0a8ff', '#ffffff'] };
const GOLDEN = { ramp: ['#8a5a1a', '#d8a440', '#f6d888', '#ffffff'] };

export function createStarEnemies(T) {
  const d = (base, id, name, L, o = {}) => derive(T, base, id, name, L, o);
  return {
    // --- Treibende Gärten (40–45)
    bloom_stalker: d('frost_wolf', 'bloom_stalker', 'Blütenpirscher', [40, 43], { family: 'beast', howl: true, recolor: { ramp: PINK_FUR, accent: CYAN } }),
    void_wisp: d('phase_wraith', 'void_wisp', 'Leerenirrlicht', [41, 43], { family: 'undead', spawnStyle: 'fade', hp: 0.85, recolor: { ramp: VOID, accent: MAGENTA } }),
    rootbound: d('fungal_brute', 'rootbound', 'Wurzelgebundener', [41, 44], { family: 'plant', material: 'wood', recolor: { ramp: BARK, accent: MAGENTA } }),
    vine_horror: d('plague_toad', 'vine_horror', 'Rankenschrecken', [41, 44], { family: 'plant', recolor: { ramp: THORN, accent: MAGENTA } }),
    garden_golem: d('cinder_knight', 'garden_golem', 'Gartenwächter', [42, 44], { family: 'construct', material: 'stone', recolor: { ramp: PEARL, accent: CYAN, gamma: 0.6 } }),
    star_moth: d('ash_vulture', 'star_moth', 'Sternfalter', [43, 45], { family: 'beast', recolor: { ramp: MOTH, accent: CYAN } }),
    withered_warden: d('waste_colossus', 'withered_warden', 'Der Verdorrte Hüter', 44, { family: 'plant', material: 'wood', recolor: { ramp: BARK, accent: MAGENTA } }),
    // --- Rankengruft (42–44)
    thorn_priest: d('rime_witch', 'thorn_priest', 'Dornenpriesterin', [42, 44], { family: 'plant', recolor: { ramp: THORN, accent: MAGENTA } }),
    // --- Splitterweiten (45–50)
    shard_crawler: d('crystal_spider', 'shard_crawler', 'Splitterkrabbler', [45, 48], { family: 'spider', material: 'chitin', recolor: { ramp: GLASS, accent: MAGENTA } }),
    mad_prospector: d('steppe_raider', 'mad_prospector', 'Wahnsinniger Schürfer', [45, 48], { family: 'human', recolor: { ramp: SAND, accent: CYAN } }),
    glass_sentinel: d('frozen_knight', 'glass_sentinel', 'Glaswächter', [46, 49], { family: 'construct', material: 'stone', recolor: { ramp: GLASS, accent: GOLDEN, gamma: 0.75 } }),
    prism_elemental: d('ice_elemental', 'prism_elemental', 'Prismengeist', [46, 49], { family: 'construct', material: 'stone', recolor: { ramp: GLASS, accent: MAGENTA } }),
    void_hound: d('ember_hellhound', 'void_hound', 'Leerenhund', [47, 50], { family: 'demon', recolor: { ramp: VOID, accent: MAGENTA } }),
    splinter_colossus: d('waste_colossus', 'splinter_colossus', 'Der Splitterkoloss', 49, { family: 'construct', material: 'stone', recolor: { ramp: GLASS, accent: MAGENTA } }),
    // --- Gläserne Hallen (46–48) und Sternwarte (49–50)
    statue_wraith: d('ash_wraith', 'statue_wraith', 'Gläserner Gefangener', [46, 48], { family: 'undead', spawnStyle: 'rise', recolor: { ramp: GLASS, accent: CYAN } }),
    shadow_ranger: d('raider_archer', 'shadow_ranger', 'Schattenelfen-Späherin', [49, 50], { family: 'human', recolor: { ramp: VOID, accent: CYAN } }),
    star_seer: d('ash_priest', 'star_seer', 'Sternseherin', [49, 50], { family: 'human', recolor: { ramp: MOTH, accent: GOLDEN } }),
  };
}
