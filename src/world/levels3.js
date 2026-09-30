import { createRng } from '../core/math.js';
import { MapBuilder } from './levels.js';
import { rim, scatter, ring, dungeonBase, inRect, inEll } from './levels2.js';

// Runde-3-Gebiete (INTEGRATION.md §12.2), Stufe 20–40: Aschensteppe,
// Heulendes Hügelgrab, Faulmarsch, Sporenschlund, Frostzinnen, Reifhöhlen,
// Glutöde, Aschethron. Aufbau wie levels2.js (deterministischer Bauplan ->
// Zeichenraster + Metadaten). Außengebiete 96 × 64 Kacheln (1536 × 1024 px,
// Obergrenze aus §12.2) mit langen Straßen für Reittiere.
//
// Neu: areas[].noMount (Lager: Absitzen, A prüft das in canMount()).

const road4 = (m) => (pts, w = 2) => m.path(pts, w, '.', [',', '~']);
const near = (m, x, y, ch, r = 1) => {
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (m.get(x + i, y + j) === ch) return true;
  return false;
};
const box = (r, pad = 1) => (x, y) => x >= r.x - pad && y >= r.y - pad && x < r.x + r.w + pad && y < r.y + r.h + pad;
const each = (list, fn) => list.forEach(([x, y]) => fn(x, y));

// ---------------------------------------------------------------- Aschensteppe (20–25)
function buildAshenSteppe() {
  const W = 96, H = 64;
  const m = new MapBuilder(W, H, ',');
  const rng = createRng(2020);
  rim(m, rng, W, H);
  // Felsgrate und Hügel
  m.ellipse(44, 8, 7, 3, '#');
  m.ellipse(30, 55, 5, 2.4, '#');
  m.ellipse(84, 44, 3.4, 5, '#');
  m.ellipse(56, 30, 2.6, 1.8, '#');
  // Ausgänge: West (Schlackenhöhen), Ost (Faulmarsch)
  m.rect(0, 30, 4, 5, ',');
  m.rect(92, 16, 4, 5, ',');
  // Wasserloch
  m.ellipse(40, 40, 4.5, 2.4, '~');

  const road = road4(m);
  road([[0, 32], [8, 32]]);
  road([[27, 32], [38, 31], [50, 26], [62, 22], [74, 19], [86, 18], [95, 18]]);   // Heerstraße nach Osten
  road([[50, 26], [52, 36], [56, 46], [60, 52]]);                                 // zum Hügelgrab
  road([[62, 22], [66, 14], [74, 10]]);                                           // zum Kriegslager
  road([[38, 31], [34, 42], [24, 48], [14, 52]]);                                 // Südweide

  // Außenposten (Hub): Pflaster, Palisade mit Toren West/Ost, Stall im Süden
  const outpost = { x: 8, y: 24, w: 20, h: 17 };
  m.ellipse(18, 32, 8.4, 6.6, ':', [',', '.']);
  m.path([[8, 32], [27, 32]], 2, ':', [',', '.']);
  ring(m, 8, 24, 27, 40, 'p', 'q', [{ side: 'w', from: 31, to: 33 }, { side: 'e', from: 31, to: 33 }, { side: 's', from: 17, to: 19 }]);

  // Kriegslager des Steppenfürsten (Nordost)
  const war = { x: 66, y: 4, w: 24, h: 12 };
  m.ellipse(78, 10, 11, 5, '.', [',']);
  ring(m, 66, 4, 89, 15, 'p', 'q', [{ side: 's', from: 72, to: 75 }, { side: 'w', from: 9, to: 11 }]);

  // Grabhügel (Süden)
  const barrow = { x: 52, y: 48, w: 18, h: 12 };
  m.ellipse(60, 54, 8, 4.5, '.', [',']);

  const put = (x, y, ch) => m.set(x, y, ch);
  // Außenposten
  put(12, 27, 'Y'); put(24, 27, 'Y'); put(18, 26, 'P'); put(18, 32, 'F');
  put(11, 37, 'S'); put(14, 38, 'h'); put(23, 38, 'Q');
  put(18, 29, 'A'); put(15, 36, 'O'); put(22, 34, 'K'); put(13, 31, 'I');
  put(18, 35, '1'); put(16, 35, '2'); put(4, 32, '3');
  // Kriegslager
  put(70, 7, 'X'); put(86, 7, 'X'); put(78, 6, 'P'); put(78, 10, 'F'); put(72, 13, 'Y'); put(86, 13, 'h');
  put(69, 11, 'W');
  each([[71, 9], [75, 12], [82, 9], [84, 12], [80, 13], [68, 13]], (x, y) => put(x, y, 'x'));
  each([[74, 7], [83, 11], [88, 10]], (x, y) => put(x, y, 'y'));
  put(79, 12, 'Z');
  // Kriegsbanner (Schreine) rund ums Lager
  // Grabhügel
  put(60, 50, 'M'); put(56, 53, 'j'); put(64, 53, 'j'); put(60, 56, '4');
  // Gegner: Räuber am Weg, Hyänenrudel, Geier über der Ebene
  each([[40, 22], [44, 24], [58, 16], [34, 20], [46, 18], [88, 28], [86, 32], [70, 30], [74, 34]], (x, y) => put(x, y, 'x'));
  each([[42, 20], [60, 14], [72, 32], [90, 30]], (x, y) => put(x, y, 'y'));
  each([[30, 46], [33, 48], [28, 50], [44, 52], [47, 50], [45, 55], [76, 48], [79, 50], [74, 52]], (x, y) => put(x, y, 'e'));
  each([[36, 38], [48, 42], [62, 36], [70, 42], [82, 38], [24, 14], [14, 12], [50, 12]], (x, y) => put(x, y, 'v'));
  // Rand der Marsch (Osten)
  put(90, 16, 'P'); put(90, 21, 'P'); put(92, 18, '5');

  const clear = [box(outpost), box(war), box(barrow, 0), (x, y) => x <= 5 && y >= 28 && y <= 36, (x, y) => x >= 86 && y >= 14 && y <= 22];
  scatter(m, rng, (x, y) => clear.some((f) => f(x, y)), (x, y, free) => {
    if (near(m, x, y, '.', 1)) return null;
    if (near(m, x, y, '~', 1) && rng.chance(0.3)) return 'g';
    if (free && rng.chance(0.02)) return 'b';
    if (free && rng.chance(0.012)) return 'o';
    if (free && rng.chance(0.006)) return 's';
    if (rng.chance(0.07)) return 'g';
    if (rng.chance(0.025)) return 'n';
    return null;
  });

  return {
    name: 'Die Aschensteppe',
    kind: 'outdoor',
    biome: 'steppe',
    decorSet: 'decor_steppe',
    map: m.rows(),
    solid: 'pqW',
    decor: {
      g: 'steppeGrass', n: 'thornShrubs', b: 'boulders', o: 'bleachedBones', s: 'standingStones',
      Y: 'yurt', X: 'warTent', p: 'palisade', q: 'palisadeV', W: 'watchtower', P: 'bannerPole',
      F: 'campfireBig', h: 'hayBales', S: 'stable', Q: 'cart', M: 'barrowMound', j: 'standingStones',
    },
    points: { 1: 'start', 2: 'respawn', 3: 'from_cinder_peaks', 4: 'from_howling_barrow', 5: 'from_blighted_marsh' },
    npcs: { A: 'captain_varra', O: 'stablemaster_orla', I: 'nomad_kesh', K: 'trader_imra' },
    enemies: {
      x: { type: 'steppe_raider' }, y: { type: 'raider_archer' }, e: { type: 'dust_hyena' },
      v: { type: 'ash_vulture' }, Z: { type: 'steppe_warlord' },
    },
    respawn: 45,
    areas: [
      { id: 'steppe_outpost', ...outpost, noMount: true },
      { id: 'warlord_camp', ...war },
      { id: 'barrow_gate', ...barrow },
      { id: 'marsh_edge', x: 84, y: 12, w: 12, h: 12 },
    ],
    objects: [
      { id: 'war_banner_1', kind: 'shrine', decor: 'warBanner', prompt: 'Banner niederreißen', x: 63, y: 9 },
      { id: 'war_banner_2', kind: 'shrine', decor: 'warBanner', prompt: 'Banner niederreißen', x: 78, y: 18 },
      { id: 'war_banner_3', kind: 'shrine', decor: 'warBanner', prompt: 'Banner niederreißen', x: 92, y: 9 },
    ],
    portals: [
      { id: 'to_cinder_peaks', x: 0.6, y: 32, range: 26, visual: 'road', dir: [-1, 0],
        to: { zoneId: 'cinder_peaks', spawnId: 'from_ashen_steppe' }, prompt: 'Westwärts zu den Schlackenhöhen' },
      { id: 'to_howling_barrow', x: 60, y: 51.2, range: 26, requires: { level: 23 },
        to: { zoneId: 'howling_barrow', spawnId: 'start' }, prompt: 'Das Heulende Hügelgrab betreten' },
      { id: 'to_blighted_marsh', x: 95.4, y: 18, range: 28, requires: { level: 25 }, visual: 'road', dir: [1, 0],
        to: { zoneId: 'blighted_marsh', spawnId: 'from_ashen_steppe' }, prompt: 'Ostwärts in die Faulmarsch' },
    ],
    signText: 'Ost: Die Faulmarsch · Süd: Das Hügelgrab · West: Die Schlackenhöhen',
  };
}

// ---------------------------------------------------------------- Faulmarsch (25–31)
function buildBlightedMarsh() {
  const W = 96, H = 64;
  const m = new MapBuilder(W, H, ',');
  const rng = createRng(2525);
  rim(m, rng, W, H);
  // Ausgänge: West (Steppe), Nord (Frostpass)
  m.rect(0, 38, 4, 5, ',');
  m.rect(66, 0, 8, 5, ',');
  // Moorwasser: viele Tümpel und ein großer Sumpfsee (mit Stegen)
  const pools = [[30, 20, 7, 4], [46, 34, 9, 5.5], [20, 52, 6, 3], [62, 46, 7, 4], [80, 30, 5, 7], [52, 14, 4, 2.4], [38, 50, 3.4, 2]];
  pools.forEach(([cx, cy, rx, ry]) => m.ellipse(cx, cy, rx, ry, '~', [',']));
  // Versunkenes Dorf: Wasser mit Ruinen
  m.ellipse(46, 34, 9, 5.5, '~');

  const road = road4(m);
  road([[0, 40], [8, 40]]);
  road([[27, 40], [36, 42], [46, 42], [56, 40], [66, 36], [70, 26], [70, 14], [70, 0]]); // Knüppeldamm nach Norden
  road([[56, 40], [66, 50], [76, 54], [84, 52]]);                                     // zum Sporentor
  road([[36, 42], [34, 30], [40, 26], [46, 28]]);                                     // Steg ins versunkene Dorf
  road([[27, 40], [22, 30], [18, 18], [26, 10]]);                                     // Nordwestpfad

  // Moorfeste (Hub): Pfahlbauten auf Pflaster, Palisade
  const fort = { x: 8, y: 32, w: 20, h: 16 };
  m.ellipse(18, 40, 8.2, 6.4, ':', [',', '.', '~']);
  m.path([[8, 40], [27, 40]], 2, ':', [',', '.']);
  ring(m, 8, 32, 27, 47, 'p', 'q', [{ side: 'w', from: 39, to: 41 }, { side: 'e', from: 39, to: 41 }, { side: 'n', from: 17, to: 19 }]);

  const village = { x: 36, y: 27, w: 20, h: 14 };
  const sporeGate = { x: 78, y: 48, w: 14, h: 10 };
  m.ellipse(85, 53, 6, 3.4, '.', [',']);

  const put = (x, y, ch) => m.set(x, y, ch);
  // Moorfeste
  put(12, 35, 'H'); put(24, 35, 'H'); put(12, 44, 'H'); put(18, 34, 'P'); put(18, 40, 'F'); put(24, 44, 'W');
  put(15, 43, 'L'); put(21, 36, 'L');
  put(18, 37, 'A'); put(14, 40, 'B'); put(22, 40, 'M');
  put(18, 43, '1'); put(16, 43, '2'); put(4, 40, '3');
  // Versunkenes Dorf (Ruinen im Wasser, Wege dazwischen)
  each([[40, 31], [51, 31], [44, 37], [53, 37]], (x, y) => put(x, y, 'R'));
  // Sporentor
  put(86, 51, 'G'); put(85, 55, '4'); put(80, 53, 'L'); put(90, 53, 'L');
  // Frostpass
  put(67, 4, 'P'); put(73, 4, 'P'); put(70, 6, '5');
  // Gegner
  each([[30, 26], [24, 22], [36, 18], [56, 24], [60, 20], [30, 56], [26, 48], [58, 52], [68, 44], [44, 48]], (x, y) => put(x, y, 'l'));
  each([[40, 29], [52, 29], [48, 39], [42, 39], [56, 34]], (x, y) => put(x, y, 'l'));
  each([[34, 12], [40, 10], [80, 12], [84, 20], [88, 40], [76, 40]], (x, y) => put(x, y, 's'));
  each([[14, 22], [16, 24], [12, 20], [62, 30], [64, 32], [74, 20], [76, 22], [46, 56], [48, 58], [88, 24], [86, 26]], (x, y) => put(x, y, 'e'));
  each([[28, 14], [58, 56], [72, 58], [90, 14], [80, 44], [62, 12]], (x, y) => put(x, y, 't'));
  put(80, 42, 'Z');

  // Schilf an allen Ufern
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (m.get(x, y) !== ',') continue;
    if (near(m, x, y, '~', 1) && !near(m, x, y, '.', 1) && rng.chance(0.32)) m.set(x, y, 'r');
  }
  const clear = [box(fort), box(sporeGate, 0), (x, y) => x <= 5 && y >= 36 && y <= 44, (x, y) => x >= 64 && x <= 76 && y <= 8, box(village, 0)];
  scatter(m, rng, (x, y) => clear.some((f) => f(x, y)), (x, y, free) => {
    if (near(m, x, y, '.', 1)) return null;
    if (free && rng.chance(0.07)) return 'w';
    if (free && rng.chance(0.03)) return 'd';
    if (rng.chance(0.03)) return 'u';
    if (rng.chance(0.015)) return 'k';
    return null;
  });

  return {
    name: 'Die Faulmarsch',
    kind: 'outdoor',
    biome: 'marsh',
    decorSet: 'decor_marsh',
    map: m.rows(),
    solid: 'pqW',
    decor: {
      w: 'willowTrees', d: 'deadStumps', r: 'reeds', u: 'mushrooms', k: 'mossRocks',
      H: 'stiltHut', p: 'palisade', q: 'palisadeV', W: 'watchtower', P: 'bannerPole', F: 'campfireBig',
      R: 'sunkenHouse', G: 'sporeGate', L: 'lanternPost',
    },
    points: { 1: 'start', 2: 'respawn', 3: 'from_ashen_steppe', 4: 'from_spore_hollow', 5: 'from_frostspire' },
    npcs: { A: 'warden_thane', B: 'alchemist_brisa', M: 'trader_moll' },
    enemies: {
      l: { type: 'bog_lurker' }, s: { type: 'rot_shaman' }, e: { type: 'swamp_leech' },
      t: { type: 'plague_toad' }, Z: { type: 'bog_horror' },
    },
    respawn: 45,
    areas: [
      { id: 'mirefort', ...fort, noMount: true },
      { id: 'sunken_village', ...village },
      { id: 'spore_gate', ...sporeGate },
      { id: 'frost_pass', x: 64, y: 1, w: 12, h: 9 },
    ],
    objects: [
      { id: 'rot_totem_1', kind: 'shrine', decor: 'rotTotem', prompt: 'Totem verbrennen', x: 30, y: 12 },
      { id: 'rot_totem_2', kind: 'shrine', decor: 'rotTotem', prompt: 'Totem verbrennen', x: 60, y: 58 },
      { id: 'rot_totem_3', kind: 'shrine', decor: 'rotTotem', prompt: 'Totem verbrennen', x: 88, y: 18 },
      { id: 'lost_caravan', kind: 'item', decor: 'caravanWreck', prompt: 'Wrack durchsuchen', x: 14, y: 56 },
    ],
    portals: [
      { id: 'to_ashen_steppe', x: 0.6, y: 40, range: 26, visual: 'road', dir: [-1, 0],
        to: { zoneId: 'ashen_steppe', spawnId: 'from_blighted_marsh' }, prompt: 'Westwärts in die Aschensteppe' },
      { id: 'to_spore_hollow', x: 86, y: 52.2, range: 26, requires: { level: 29 },
        to: { zoneId: 'spore_hollow', spawnId: 'start' }, prompt: 'Den Sporenschlund betreten' },
      { id: 'to_frostspire', x: 70, y: 1.2, range: 28, requires: { level: 31 }, visual: 'road', dir: [0, -1],
        to: { zoneId: 'frostspire', spawnId: 'from_blighted_marsh' }, prompt: 'Den Frostpass hinauf' },
    ],
    signText: 'Nord: Der Frostpass · Südost: Der Sporenschlund · West: Die Aschensteppe',
  };
}

// ---------------------------------------------------------------- Frostzinnen (31–36)
function buildFrostspire() {
  const W = 96, H = 64;
  const m = new MapBuilder(W, H, ',');
  const rng = createRng(3131);
  rim(m, rng, W, H);
  // Felsgipfel
  m.ellipse(50, 10, 8, 4, '#');
  m.ellipse(84, 16, 7, 6, '#');
  m.ellipse(34, 30, 3, 2, '#');
  m.ellipse(62, 38, 4, 3, '#');
  m.ellipse(12, 10, 5, 4, '#');
  // Ausgänge: Süd (Marsch), Ost (Abstieg in die Glutöde)
  m.rect(16, 59, 8, 5, ',');
  m.rect(92, 44, 4, 5, ',');
  // Gefrorene Seen (fest)
  m.ellipse(46, 50, 7, 3.2, '~');
  m.ellipse(72, 26, 4, 2.4, '~');

  const road = road4(m);
  road([[20, 63], [20, 54], [24, 46]]);
  road([[36, 38], [48, 40], [60, 44], [74, 46], [86, 46], [95, 46]]);   // Abstieg nach Osten
  road([[30, 32], [26, 22], [20, 16], [22, 8]]);                         // zum Reiftor
  road([[48, 40], [56, 30], [66, 30], [76, 34]]);                        // Trollhöhlen

  // Frosthold (Hub): Festung mit Langhäusern
  const hold = { x: 18, y: 32, w: 20, h: 14 };
  m.rect(19, 33, 18, 12, ':');
  m.path([[24, 46], [27, 44]], 3, ':', [',', '.']);
  m.path([[36, 38], [38, 38]], 3, ':', [',', '.']);
  m.path([[28, 31], [28, 33]], 3, ':', [',', '.']);
  ring(m, 18, 32, 37, 45, 'w', 'v', [{ side: 's', from: 26, to: 28 }, { side: 'e', from: 37, to: 39 }, { side: 'n', from: 27, to: 29 }]);
  const put = (x, y, ch) => m.set(x, y, ch);
  put(18, 32, 'U'); put(37, 32, 'U'); put(18, 45, 'U'); put(37, 45, 'U'); put(27, 45, 'G');
  put(23, 36, 'L'); put(33, 36, 'L'); put(27, 40, 'F'); put(22, 42, 'T'); put(33, 42, 'P');
  put(27, 37, 'A'); put(23, 40, 'B'); put(31, 40, 'M');
  put(27, 42, '1'); put(25, 42, '2'); put(20, 60, '3');

  // Trollhöhlen (Osten), Reiftor (Nordwest)
  const trolls = { x: 66, y: 24, w: 18, h: 16 };
  m.ellipse(74, 32, 8, 5.5, '.', [',']);
  const rime = { x: 16, y: 2, w: 14, h: 10 };
  m.ellipse(22, 7, 5, 3, '.', [',']);
  put(22, 4, 'R'); put(22, 8, '4');
  put(92, 43, 'P'); put(92, 49, 'P'); put(92, 46, '5');

  // Gegner
  each([[70, 30], [78, 30], [74, 36], [80, 36], [68, 34]], (x, y) => put(x, y, 'i'));
  put(76, 33, 'Z');
  each([[44, 22], [48, 24], [46, 26], [56, 18], [60, 20], [58, 16], [12, 26], [14, 22], [10, 24], [80, 56], [84, 54], [82, 58]], (x, y) => put(x, y, 'j'));
  each([[40, 16], [30, 14], [66, 50], [56, 54], [88, 30], [36, 56]], (x, y) => put(x, y, 'h'));
  each([[50, 32], [42, 44], [62, 52], [70, 56], [86, 38], [30, 52], [12, 50], [64, 12]], (x, y) => put(x, y, 's'));

  const clear = [box(hold), box(trolls, 0), box(rime, 0), (x, y) => x >= 14 && x <= 26 && y >= 56, (x, y) => x >= 88 && y >= 40 && y <= 52];
  scatter(m, rng, (x, y) => clear.some((f) => f(x, y)), (x, y, free) => {
    if (near(m, x, y, '.', 1)) return null;
    if (free && rng.chance(0.2) && (y < 24 || x < 14 || (x > 40 && x < 60 && y > 12 && y < 30))) return 't';
    if (free && rng.chance(0.03)) return 't';
    if (free && rng.chance(0.015)) return 'c';
    if (rng.chance(0.02)) return 'k';
    if (rng.chance(0.03)) return 'd';
    return null;
  });

  return {
    name: 'Die Frostzinnen',
    kind: 'outdoor',
    biome: 'frost',
    decorSet: 'decor_frost',
    map: m.rows(),
    solid: 'wvU',
    decor: {
      t: 'snowPines', k: 'frozenRocks', c: 'iceCrystals', d: 'snowDrifts', L: 'longhouse',
      w: 'fortWall', v: 'fortWallV', G: 'fortGate', U: 'fortTower', T: 'tent', P: 'bannerPole', F: 'campfireBig',
      R: 'rimeGate', o: 'trollBones',
    },
    points: { 1: 'start', 2: 'respawn', 3: 'from_blighted_marsh', 4: 'from_rime_caverns', 5: 'from_ember_wastes' },
    npcs: { A: 'jarl_eskil', B: 'hunter_sigrun', M: 'trader_fenn' },
    enemies: {
      i: { type: 'ice_troll' }, j: { type: 'frost_wolf' }, h: { type: 'rime_witch' },
      s: { type: 'snow_stalker', dormant: true }, Z: { type: 'ice_troll_chief' },
    },
    respawn: 45,
    areas: [
      { id: 'frosthold', ...hold, noMount: true },
      { id: 'troll_caves', ...trolls },
      { id: 'rime_gate', ...rime },
      { id: 'wastes_descent', x: 84, y: 40, w: 12, h: 12 },
    ],
    objects: [
      { id: 'frost_beacon_1', kind: 'shrine', decor: 'frostBeacon', prompt: 'Leuchtfeuer entzünden', x: 50, y: 15 },
      { id: 'frost_beacon_2', kind: 'shrine', decor: 'frostBeacon', prompt: 'Leuchtfeuer entzünden', x: 84, y: 24 },
      { id: 'frost_beacon_3', kind: 'shrine', decor: 'frostBeacon', prompt: 'Leuchtfeuer entzünden', x: 58, y: 58 },
    ],
    portals: [
      { id: 'to_blighted_marsh', x: 20, y: 62.4, range: 28, visual: 'road', dir: [0, 1],
        to: { zoneId: 'blighted_marsh', spawnId: 'from_frostspire' }, prompt: 'Hinab in die Faulmarsch' },
      { id: 'to_rime_caverns', x: 22, y: 5.2, range: 26, requires: { level: 34 },
        to: { zoneId: 'rime_caverns', spawnId: 'start' }, prompt: 'Die Reifhöhlen betreten' },
      { id: 'to_ember_wastes', x: 95.4, y: 46, range: 28, requires: { level: 36 }, visual: 'road', dir: [1, 0],
        to: { zoneId: 'ember_wastes', spawnId: 'from_frostspire' }, prompt: 'Abstieg in die Glutöde' },
    ],
    signText: 'Nordwest: Die Reifhöhlen · Ost: Abstieg in die Glutöde · Süd: Die Faulmarsch',
  };
}

// ---------------------------------------------------------------- Glutöde (36–40)
function buildEmberWastes() {
  const W = 96, H = 64;
  const m = new MapBuilder(W, H, ',');
  const rng = createRng(3636);
  rim(m, rng, W, H);
  m.ellipse(40, 50, 6, 3, '#');
  m.ellipse(60, 20, 4, 3, '#');
  m.ellipse(18, 10, 5, 3, '#');
  // Ausgänge: West (Frostzinnen)
  m.rect(0, 18, 4, 5, ',');
  // Lavaströme (fest) mit Dämmen
  m.path([[30, 2], [34, 14], [44, 26], [48, 38], [58, 48], [70, 62]], 2.6, '~', [',']);
  m.path([[96, 30], [84, 34], [72, 36], [58, 48]], 2.2, '~', [',']);
  m.ellipse(76, 52, 3, 2, '~', [',']);

  const road = road4(m);
  road([[0, 20], [8, 20]]);
  road([[26, 20], [36, 20], [46, 24], [56, 28], [64, 24], [72, 16], [80, 10], [80, 5]]); // zur Thronpforte
  road([[46, 24], [52, 36], [62, 40], [74, 44], [84, 48]]);                             // Kolossfeld
  road([[26, 20], [24, 32], [20, 44], [26, 54]]);                                       // Südwestpfad

  // Letzte Bastion (Hub)
  const bastion = { x: 8, y: 12, w: 18, h: 16 };
  m.rect(9, 13, 16, 14, ':');
  m.path([[8, 20], [10, 20]], 3, ':', [',', '.']);
  m.path([[24, 20], [26, 20]], 3, ':', [',', '.']);
  ring(m, 8, 12, 25, 27, 'w', 'v', [{ side: 'w', from: 19, to: 21 }, { side: 'e', from: 19, to: 21 }, { side: 's', from: 16, to: 18 }]);
  const put = (x, y, ch) => m.set(x, y, ch);
  put(8, 12, 'U'); put(25, 12, 'U'); put(8, 27, 'U'); put(25, 27, 'U');
  put(12, 15, 'T'); put(21, 15, 'T'); put(17, 15, 'P'); put(17, 20, 'F'); put(12, 24, 'K'); put(21, 24, 'x'); put(22, 25, 'x');
  put(17, 17, 'A'); put(13, 20, 'B'); put(21, 21, 'M');
  put(17, 23, '1'); put(15, 23, '2'); put(4, 20, '3');

  const field = { x: 66, y: 38, w: 24, h: 18 };
  m.ellipse(78, 46, 10, 6.4, '.', [',']);
  const gate = { x: 72, y: 1, w: 16, h: 9 };
  m.ellipse(80, 6, 6, 3, '.', [',']);
  put(80, 3, 'R'); put(80, 7, '4');

  each([[36, 12], [40, 16], [52, 14], [66, 12], [72, 22], [62, 32], [34, 36], [28, 44], [16, 40], [14, 50]], (x, y) => put(x, y, 'a'));
  each([[56, 26], [60, 30], [70, 18], [74, 12], [86, 14]], (x, y) => put(x, y, 'k'));
  each([[38, 28], [42, 34], [50, 44], [64, 54], [86, 26], [88, 58]], (x, y) => put(x, y, 's'));
  each([[30, 24], [44, 8], [58, 36], [34, 54], [52, 58], [90, 40]], (x, y) => put(x, y, 'c'));
  each([[72, 42], [84, 42], [70, 50], [86, 52], [78, 40]], (x, y) => put(x, y, 'k'));
  put(78, 46, 'Z');

  const clear = [box(bastion), box(field, 0), box(gate, 0), (x, y) => x <= 5 && y >= 15 && y <= 25];
  scatter(m, rng, (x, y) => clear.some((f) => f(x, y)), (x, y, free) => {
    if (near(m, x, y, '.', 1)) return null;
    if (near(m, x, y, '~', 1) && rng.chance(0.08)) return 'o';
    if (free && rng.chance(0.025)) return 'h';
    if (free && rng.chance(0.02)) return 'd';
    if (rng.chance(0.03)) return 'n';
    if (rng.chance(0.012)) return 'y';
    if (free && rng.chance(0.006)) return 'g';
    return null;
  });

  return {
    name: 'Die Glutöde',
    kind: 'outdoor',
    biome: 'wastes',
    decorSet: 'decor_wastes',
    map: m.rows(),
    solid: 'wvU',
    decor: {
      h: 'charredRuins', o: 'obsidianShards', n: 'ashDunes', g: 'emberGeysers', d: 'scorchedTrees', y: 'bonePiles',
      w: 'bastionWall', v: 'bastionWallV', G: 'bastionGate', U: 'bastionTower', T: 'tent', P: 'bannerPole', F: 'forge',
      K: 'forge', x: 'crates', R: 'throneGate',
    },
    points: { 1: 'start', 2: 'respawn', 3: 'from_frostspire', 4: 'from_ashen_throne' },
    npcs: { A: 'marshal_corvane', B: 'pilgrim_aldo', M: 'quartermaster_ryn' },
    enemies: {
      a: { type: 'ash_wraith' }, k: { type: 'cinder_knight' }, s: { type: 'magma_serpent' },
      c: { type: 'ember_cultist_adept' }, Z: { type: 'waste_colossus' },
    },
    respawn: 45,
    areas: [
      { id: 'last_bastion', ...bastion, noMount: true },
      { id: 'colossus_field', ...field },
      { id: 'throne_gate', ...gate },
    ],
    objects: [
      { id: 'ember_obelisk_1', kind: 'shrine', decor: 'emberObelisk', prompt: 'Obelisk löschen', x: 44, y: 12 },
      { id: 'ember_obelisk_2', kind: 'shrine', decor: 'emberObelisk', prompt: 'Obelisk löschen', x: 30, y: 50 },
      { id: 'ember_obelisk_3', kind: 'shrine', decor: 'emberObelisk', prompt: 'Obelisk löschen', x: 90, y: 20 },
    ],
    portals: [
      { id: 'to_frostspire', x: 0.6, y: 20, range: 26, visual: 'road', dir: [-1, 0],
        to: { zoneId: 'frostspire', spawnId: 'from_ember_wastes' }, prompt: 'Hinauf in die Frostzinnen' },
      { id: 'to_ashen_throne', x: 80, y: 4.2, range: 26, requires: { level: 38 },
        to: { zoneId: 'ashen_throne', spawnId: 'start' }, prompt: 'Den Aschethron betreten' },
    ],
    signText: 'Nordost: Der Aschethron · West: Die Frostzinnen',
  };
}

// ---------------------------------------------------------------- Dungeons
// Gemeinsamer Aufbau wie Tempel/Glutschmiede: Räume, Gänge, Arena mit Tor (G)
// und Bossmarke 9, Eingangstreppe D mit Rückportal.

function buildHowlingBarrow() {
  const W = 64, H = 56;
  const { m, room, hall, torches, put } = dungeonBase(W, H, 2424);
  room(4, 4, 12, 8);    // A Eingang
  room(22, 4, 16, 9);   // B Gräberhalle
  room(4, 18, 14, 12);  // C Knochengrube
  room(24, 19, 14, 11); // D Rufer-Kapelle
  room(44, 5, 15, 13);  // E Totenwacht
  room(44, 24, 13, 9);  // F Vorkammer (barrow_crypt)
  room(38, 38, 22, 15); // G Grabkammer des Königs (Arena)
  hall(16, 7, 6, 3); hall(9, 12, 3, 6); hall(38, 8, 6, 3); hall(18, 23, 6, 3);
  hall(38, 25, 6, 3); hall(49, 18, 3, 6); hall(47, 33, 4, 5);
  torches(6);
  // Grabwasser
  m.ellipse(10, 24, 2.4, 1.6, '~', ['.']);
  m.rect(24, 24, 2, 3, '~');

  put(9, 3, 'D'); put(10, 3, 'D'); put(9, 6, '1'); put(12, 6, '2');
  // A
  put(5, 5, 'S'); put(14, 5, 'S'); put(5, 10, 'U'); put(14, 10, 'c');
  // B: Grabreihen
  each([[24, 6], [28, 6], [32, 6], [36, 6], [24, 11], [28, 11], [32, 11], [36, 11]], (x, y) => put(x, y, 'K'));
  each([[26, 8], [34, 8], [30, 10]], (x, y) => put(x, y, 'w'));
  put(30, 6, 'a');
  // C
  each([[6, 20], [15, 20], [6, 28], [15, 28]], (x, y) => put(x, y, 'P'));
  put(11, 22, 'x'); put(8, 26, 'x'); put(13, 26, 'x'); put(10, 28, 'b'); put(14, 24, 'h'); put(6, 23, 'h');
  // D
  put(31, 20, 'B'); put(26, 21, 'U'); put(36, 21, 'U'); put(31, 26, 'r'); put(28, 24, 'w'); put(34, 24, 'w'); put(31, 28, 'a');
  // E
  each([[46, 7], [56, 7], [46, 15], [56, 15]], (x, y) => put(x, y, 'P'));
  each([[48, 9], [54, 9], [51, 12], [48, 14], [54, 14]], (x, y) => put(x, y, 'w'));
  put(51, 8, 'a'); put(51, 16, 'h'); put(47, 11, 'b');
  // F
  put(45, 25, 'S'); put(55, 25, 'S'); put(48, 28, 'w'); put(53, 28, 'w'); put(50, 30, 'r'); put(55, 31, 'C');
  for (let x = 47; x <= 50; x++) put(x, 37, 'G');
  // G – Arena
  each([[41, 41], [56, 41], [41, 50], [56, 50]], (x, y) => put(x, y, 'P'));
  put(39, 39, 'B'); put(58, 39, 'B'); put(39, 51, 'B'); put(58, 51, 'B');
  put(49, 40, 'Y'); put(49, 43, '9'); put(45, 50, 'j'); put(53, 50, 'j');
  // Druckplatten
  put(18, 8, '^'); put(19, 8, '^'); put(10, 15, '^'); put(41, 26, '^'); put(49, 21, '^');

  return {
    name: 'Das Heulende Hügelgrab',
    kind: 'dungeon',
    biome: 'barrow',
    map: m.rows(),
    decor: {
      S: 'standingStone', P: 'rootPillar', U: 'burialUrn', b: 'bonePile', B: 'ghostBrazier', Y: 'barrowThrone',
      K: 'cairn', j: 'weaponOffering',
    },
    points: { 1: 'start', 2: 'respawn' },
    enemies: {
      w: { type: 'barrow_wight' }, a: { type: 'bone_archer' }, h: { type: 'grave_hound' }, r: { type: 'wight_caller' },
      x: { type: 'barrow_wight', dormant: true },
      9: { type: 'barrow_king', boss: true },
    },
    respawn: Infinity,
    areas: [{ id: 'barrow_crypt', x: 44, y: 24, w: 13, h: 9 }],
    arena: { x: 38, y: 38, w: 22, h: 15, gateRow: 37 },
    traps: { '^': { kind: 'spike' } },
    trapDamage: 60,
    portals: [{
      id: 'to_ashen_steppe', x: 9.5, y: 3.2, range: 22,
      to: { zoneId: 'ashen_steppe', spawnId: 'from_howling_barrow' }, prompt: 'Zurück in die Aschensteppe',
    }],
  };
}

function buildSporeHollow() {
  const W = 64, H = 58;
  const { m, hall, torches, put, rng } = dungeonBase(W, H, 3030);
  // Organische Höhlen statt Rechteckräume
  const cave = (cx, cy, rx, ry) => { m.ellipse(cx, cy, rx, ry, '.'); for (let i = 0; i < 5; i++) m.ellipse(cx + rng.range(-rx * 0.6, rx * 0.6), cy + rng.range(-ry * 0.5, ry * 0.5), rx * 0.45, ry * 0.45, '.'); };
  m.rect(4, 4, 10, 7, '.');           // A Eingang
  cave(24, 9, 8, 5);                   // B Brutkammer
  cave(10, 25, 7, 6);                  // C Schleimgrube
  cave(30, 26, 8, 6);                  // D Pilzwald
  cave(50, 12, 8, 6);                  // E Sporenkammer
  cave(52, 30, 6, 4.4);                // F Vorhöhle (mother_nest)
  m.rect(38, 40, 22, 15, '.');         // G Nest (Arena)
  hall(13, 7, 6, 3); hall(8, 11, 3, 9); hall(31, 8, 12, 3); hall(16, 25, 8, 3);
  hall(37, 27, 10, 3); hall(51, 17, 3, 9); hall(47, 34, 4, 6);
  torches(8);
  // Schleim (Flüssigkeit, fest)
  m.ellipse(10, 27, 2.6, 1.6, '~', ['.']);
  m.ellipse(30, 29, 2, 1.2, '~', ['.']);
  m.ellipse(42.5, 48, 1.6, 1.2, '~', ['.']); m.ellipse(55.5, 48, 1.6, 1.2, '~', ['.']);

  put(8, 3, 'D'); put(9, 3, 'D'); put(8, 6, '1'); put(11, 6, '2');
  put(5, 5, 'M'); put(12, 9, 'g');
  // B
  each([[20, 7], [28, 7], [24, 12]], (x, y) => put(x, y, 'M'));
  each([[22, 9], [26, 9], [24, 7], [20, 11], [28, 11]], (x, y) => put(x, y, 's'));
  put(27, 12, 'o');
  // C
  each([[7, 22], [13, 22], [8, 29]], (x, y) => put(x, y, 'M'));
  put(13, 27, 'b'); put(10, 21, 'c'); put(6, 25, 's'); put(14, 25, 's');
  // D
  each([[25, 22], [35, 22], [26, 30], [34, 31]], (x, y) => put(x, y, 'M'));
  put(30, 23, 'b'); put(28, 26, 'c'); put(33, 27, 'c'); put(31, 24, 'f'); put(24, 26, 'o');
  // E
  each([[46, 9], [54, 9], [50, 16]], (x, y) => put(x, y, 'M'));
  put(50, 12, 'f'); put(47, 13, 'c'); put(53, 13, 'c'); put(50, 9, 's'); put(55, 12, 'C');
  // F
  put(48, 29, 'P'); put(56, 29, 'P'); put(52, 31, 'f'); put(50, 28, 'c');
  for (let x = 47; x <= 50; x++) put(x, 39, 'G');
  // G – Nest
  each([[41, 43], [56, 43], [41, 52], [56, 52]], (x, y) => put(x, y, 'M'));
  put(39, 41, 'o'); put(58, 41, 'o'); put(39, 53, 'o'); put(58, 53, 'o');
  put(49, 42, 'A'); put(49, 46, '9');

  return {
    name: 'Der Sporenschlund',
    kind: 'dungeon',
    biome: 'spore',
    map: m.rows(),
    decor: {
      M: 'giantMushroom', o: 'sporePod', P: 'fungalPillar', g: 'glowMoss', b: 'cocoonHusk', A: 'rotAltar',
    },
    points: { 1: 'start', 2: 'respawn' },
    enemies: {
      s: { type: 'sporeling' }, f: { type: 'fungal_brute' }, c: { type: 'spore_caster' },
      9: { type: 'rot_mother', boss: true },
    },
    respawn: Infinity,
    areas: [{ id: 'mother_nest', x: 46, y: 26, w: 12, h: 9 }],
    arena: { x: 38, y: 40, w: 22, h: 15, gateRow: 39 },
    portals: [{
      id: 'to_blighted_marsh', x: 8.5, y: 3.2, range: 22,
      to: { zoneId: 'blighted_marsh', spawnId: 'from_spore_hollow' }, prompt: 'Zurück in die Faulmarsch',
    }],
  };
}

function buildRimeCaverns() {
  const W = 66, H = 58;
  const { m, room, hall, torches, put, rng } = dungeonBase(W, H, 3535);
  const cave = (cx, cy, rx, ry) => { m.ellipse(cx, cy, rx, ry, '.'); for (let i = 0; i < 4; i++) m.ellipse(cx + rng.range(-rx * 0.5, rx * 0.5), cy + rng.range(-ry * 0.5, ry * 0.5), rx * 0.5, ry * 0.5, '.'); };
  room(4, 4, 12, 8);                  // A Eingang
  cave(26, 9, 9, 5);                  // B Kristallgrotte
  room(4, 19, 14, 12);                // C Gefrorene Halle
  cave(30, 26, 8, 6);                 // D Eissee
  room(46, 5, 15, 13);                // E Ritterhalle
  cave(53, 30, 6, 4.4);               // F Vorhöhle (wyrm_lair)
  room(38, 40, 24, 15);               // G Hort des Frostwurms (Arena)
  hall(16, 7, 5, 3); hall(9, 12, 3, 7); hall(35, 8, 11, 3); hall(18, 24, 6, 3);
  hall(38, 27, 10, 3); hall(52, 18, 3, 8); hall(48, 34, 4, 6);
  torches(7);
  m.ellipse(30, 27, 4, 2.2, '~', ['.']);
  m.rect(4, 24, 2, 3, '~');

  put(9, 3, 'D'); put(10, 3, 'D'); put(9, 6, '1'); put(12, 6, '2');
  put(5, 5, 'I'); put(14, 5, 'I'); put(5, 10, 'K'); put(14, 10, 'n');
  // B
  each([[20, 7], [32, 7], [26, 12]], (x, y) => put(x, y, 'K'));
  each([[22, 9], [30, 9], [26, 7]], (x, y) => put(x, y, 'e'));
  put(28, 11, 's'); put(24, 11, 's');
  // C
  each([[6, 20], [15, 20], [6, 29], [15, 29]], (x, y) => put(x, y, 'I'));
  put(8, 23, 'F'); put(13, 26, 'F'); put(10, 25, 'q'); put(12, 21, 's'); put(7, 27, 'e'); put(15, 24, 'n');
  // D
  put(24, 22, 'K'); put(36, 30, 'K'); put(26, 30, 'e'); put(34, 22, 's'); put(36, 25, 's'); put(24, 26, 'u');
  // E
  each([[47, 6], [59, 6], [47, 16], [59, 16]], (x, y) => put(x, y, 'I'));
  put(50, 9, 'q'); put(56, 9, 'q'); put(53, 13, 'q'); put(49, 14, 'F'); put(57, 14, 'F'); put(53, 7, 'B'); put(59, 11, 'C');
  // F
  put(50, 28, 'K'); put(56, 28, 'K'); put(53, 31, 'e'); put(51, 32, 's');
  for (let x = 48; x <= 51; x++) put(x, 39, 'G');
  // G – Hort
  each([[41, 43], [58, 43], [41, 52], [58, 52]], (x, y) => put(x, y, 'I'));
  put(39, 41, 'B'); put(60, 41, 'B'); put(39, 53, 'B'); put(60, 53, 'B');
  put(50, 42, 'u'); put(50, 46, '9');

  return {
    name: 'Die Reifhöhlen',
    kind: 'dungeon',
    biome: 'rime',
    map: m.rows(),
    decor: {
      I: 'iceColumn', K: 'crystalCluster', F: 'frozenWarrior', n: 'icicles', B: 'frostBrazier', u: 'frozenFall', w: 'snowPile',
    },
    points: { 1: 'start', 2: 'respawn' },
    enemies: {
      e: { type: 'ice_elemental' }, s: { type: 'crystal_spider' }, q: { type: 'frozen_knight' },
      9: { type: 'frost_wyrm', boss: true },
    },
    respawn: Infinity,
    areas: [{ id: 'wyrm_lair', x: 47, y: 26, w: 12, h: 9 }],
    arena: { x: 38, y: 40, w: 24, h: 15, gateRow: 39 },
    traps: { '^': { kind: 'spike' } },
    trapDamage: 80,
    portals: [{
      id: 'to_frostspire', x: 9.5, y: 3.2, range: 22,
      to: { zoneId: 'frostspire', spawnId: 'from_rime_caverns' }, prompt: 'Zurück in die Frostzinnen',
    }],
  };
}

function buildAshenThrone() {
  const W = 68, H = 62;
  const { m, room, hall, torches, put } = dungeonBase(W, H, 4040);
  room(4, 4, 12, 8);    // A Vorhof
  room(22, 3, 18, 10);  // B Säulengang
  room(4, 18, 14, 12);  // C Wachstube
  room(24, 18, 16, 12); // D Priesterhalle
  room(46, 4, 16, 14);  // E Halle des Wächters (throne_sentinel)
  room(46, 24, 16, 10); // F Thronvorhalle
  room(38, 40, 26, 18); // G Thronsaal (sovereign_hall, Arena)
  hall(16, 7, 6, 3); hall(9, 12, 3, 6); hall(40, 8, 6, 3); hall(18, 23, 6, 3);
  hall(40, 26, 6, 3); hall(53, 18, 3, 6); hall(49, 34, 4, 6);
  torches(5);
  // Glutrisse (Lava, fest)
  m.rect(28, 23, 8, 2, '~'); m.rect(31, 23, 2, 2, '.');
  m.ellipse(42.5, 50, 1.6, 1.6, '~', ['.']); m.ellipse(59.5, 50, 1.6, 1.6, '~', ['.']);

  put(9, 3, 'D'); put(10, 3, 'D'); put(9, 6, '1'); put(12, 6, '2');
  put(5, 5, 'S'); put(14, 5, 'S'); put(5, 10, 'B'); put(14, 10, 'B');
  // B
  each([[24, 5], [28, 5], [32, 5], [36, 5], [24, 11], [28, 11], [32, 11], [36, 11]], (x, y) => put(x, y, 'I'));
  each([[26, 8], [34, 8], [30, 6]], (x, y) => put(x, y, 'g'));
  put(30, 10, 'h');
  // C
  put(6, 19, 'k'); put(15, 19, 'k'); put(6, 28, 'R'); put(15, 28, 'B');
  each([[8, 22], [13, 22], [10, 26]], (x, y) => put(x, y, 'g')); put(12, 28, 'h');
  // D
  each([[26, 19], [37, 19], [26, 28], [37, 28]], (x, y) => put(x, y, 'I'));
  put(30, 20, 'p'); put(34, 20, 'p'); put(32, 27, 'p'); put(28, 27, 'h'); put(36, 26, 'C');
  // E – Wächter
  each([[48, 6], [60, 6], [48, 16], [60, 16]], (x, y) => put(x, y, 'I'));
  put(54, 5, 'S'); put(50, 10, 'n'); put(58, 10, 'n'); put(54, 11, 'W');
  // F
  put(47, 25, 'k'); put(61, 25, 'k'); put(50, 28, 'g'); put(58, 28, 'g'); put(54, 30, 'p'); put(48, 32, 'e'); put(60, 32, 'e');
  for (let x = 49; x <= 52; x++) put(x, 39, 'G');
  // G – Thronsaal
  each([[41, 43], [60, 43], [41, 54], [60, 54]], (x, y) => put(x, y, 'I'));
  put(39, 41, 'B'); put(62, 41, 'B'); put(39, 56, 'B'); put(62, 56, 'B');
  put(47, 44, 'n'); put(55, 44, 'n');
  put(51, 42, 'T'); put(51, 41, 'A'); put(51, 47, '9');
  // Druckplatten / Flammendüsen
  put(19, 8, '^'); put(20, 8, '^'); put(10, 15, '^'); put(43, 27, '^'); put(54, 21, '^');

  return {
    name: 'Der Aschethron',
    kind: 'dungeon',
    biome: 'throne',
    map: m.rows(),
    decor: {
      I: 'obsidianPillar', B: 'goldBrazier', S: 'ashStatue', k: 'chainHang', R: 'trophyRack', n: 'banner', A: 'throneDais',
      e: 'emberCrack',
    },
    points: { 1: 'start', 2: 'respawn' },
    enemies: {
      g: { type: 'throne_guard' }, p: { type: 'ash_priest' }, h: { type: 'ember_hellhound' }, W: { type: 'throne_sentinel' },
      9: { type: 'ash_sovereign', boss: true },
    },
    respawn: Infinity,
    areas: [{ id: 'sovereign_hall', x: 38, y: 40, w: 26, h: 18 }],
    arena: { x: 38, y: 40, w: 26, h: 18, gateRow: 39 },
    traps: { '^': { kind: 'spike' } },
    trapDamage: 90,
    portals: [{
      id: 'to_ember_wastes', x: 9.5, y: 3.2, range: 22,
      to: { zoneId: 'ember_wastes', spawnId: 'from_ashen_throne' }, prompt: 'Zurück in die Glutöde',
    }],
  };
}

export const LEVELS3 = {
  ashen_steppe: buildAshenSteppe(),
  howling_barrow: buildHowlingBarrow(),
  blighted_marsh: buildBlightedMarsh(),
  spore_hollow: buildSporeHollow(),
  frostspire: buildFrostspire(),
  rime_caverns: buildRimeCaverns(),
  ember_wastes: buildEmberWastes(),
  ashen_throne: buildAshenThrone(),
};
