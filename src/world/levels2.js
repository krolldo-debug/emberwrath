import { createRng } from '../core/math.js';
import { MapBuilder } from './levels.js';

// Runde-2-Gebiete (INTEGRATION.md §11.1): Aschenwald, Versunkener Tempel,
// Schlackenhöhen, Glutschmiede. Aufbau wie in levels.js: deterministischer
// Bauplan -> Zeichenraster + Metadaten.
//
// Neu gegenüber levels.js:
//   biome      Boden-/Kachelsatz (Außen: BIOME_GROUND, Dungeon: biome_<biome>)
//   decorSet   Außen: Deko-Satz in assets.sprites (Zeichen -> Name über `decor`)
//   decor      Zeichen -> Name eines Eintrags im Deko-Satz (hat Vorrang vor der
//              alten Legende)
//   solid      zusätzliche feste Zeichen (Palisaden, Festungsmauern)
//   objects    Schreine/aufhebbare Dinge (object:interact)

// Unregelmäßiger Felsrand
function rim(m, rng, W, H) {
  for (let x = 0; x < W; x++) {
    const top = 2 + (rng.chance(0.4) ? 1 : 0);
    for (let y = 0; y < top; y++) m.set(x, y, '#');
    const bot = 2 + (rng.chance(0.4) ? 1 : 0);
    for (let y = H - bot; y < H; y++) m.set(x, y, '#');
  }
  for (let y = 0; y < H; y++) {
    const l = 2 + (rng.chance(0.4) ? 1 : 0), r = 2 + (rng.chance(0.4) ? 1 : 0);
    for (let x = 0; x < l; x++) m.set(x, y, '#');
    for (let x = W - r; x < W; x++) m.set(x, y, '#');
  }
}

// Streut Deko auf freies Gras. pick(x, y) -> Zeichen oder null.
function scatter(m, rng, keepClear, pick) {
  const free = (x, y) => {
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (m.get(x + i, y + j) !== ',') return false;
    return true;
  };
  for (let y = 1; y < m.h - 1; y++) {
    for (let x = 1; x < m.w - 1; x++) {
      if (m.get(x, y) !== ',' || keepClear(x, y)) continue;
      const ch = pick(x, y, free(x, y));
      if (ch) m.set(x, y, ch);
    }
  }
}

const inRect = (x, y, r) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
const inEll = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

// Palisaden-/Mauerring mit Lücken. gaps: [{ side: 'n'|'s'|'w'|'e', from, to }]
function ring(m, x0, y0, x1, y1, hCh, vCh, gaps = []) {
  const gap = (side, i) => gaps.some((g) => g.side === side && i >= g.from && i <= g.to);
  for (let x = x0; x <= x1; x++) {
    if (!gap('n', x)) m.set(x, y0, hCh);
    if (!gap('s', x)) m.set(x, y1, hCh);
  }
  for (let y = y0 + 1; y < y1; y++) {
    if (!gap('w', y)) m.set(x0, y, vCh);
    if (!gap('e', y)) m.set(x1, y, vCh);
  }
}

// ---------------------------------------------------------------- Aschenwald
function buildAshwood() {
  const W = 96, H = 64;
  const m = new MapBuilder(W, H, ',');
  const rng = createRng(6161);
  rim(m, rng, W, H);
  // kleine Felsnasen im Wald
  m.ellipse(52, 5, 6, 2.6, '#');
  m.ellipse(30, 45, 2.6, 1.6, '#');
  m.ellipse(58, 24, 2.2, 1.4, '#');
  m.ellipse(4, 12, 3, 5, '#');
  // Ausgänge: West (Glutsenke), Nord (Schlackenhöhen)
  m.rect(0, 30, 4, 4, ',');
  m.rect(78, 0, 8, 5, ',');

  // See mit Tempelruine im Südosten
  m.ellipse(80, 57.5, 11.5, 4.2, '~');

  // Wege
  const road = (pts, w = 2) => m.path(pts, w, '.', [',']);
  road([[0, 31.5], [7, 31.5]]);
  road([[21, 31.5], [34, 30], [46, 31], [58, 33], [69, 34]]);
  road([[34, 30], [38, 22], [40, 14], [52, 10], [66, 8], [76, 6], [81.5, 1]]);
  road([[46, 31], [52, 40], [62, 46], [67, 50], [74, 51]]);
  road([[34, 30], [27, 42], [18, 50]]);
  road([[79, 42], [79, 46], [76, 50]]);

  // Lager der Wächter (Hub): Pflaster, Palisade mit Toren West/Ost
  const camp = { x: 6, y: 24, w: 17, h: 15 };
  m.ellipse(14, 31, 7.2, 6.2, ':', [',', '.']);
  m.path([[7, 31.5], [21, 31.5]], 2, ':', [',', '.']);
  ring(m, 6, 24, 22, 38, 'p', 'q', [{ side: 'w', from: 30, to: 33 }, { side: 'e', from: 30, to: 33 }]);

  // Banditenlager: Palisade mit Toren West/Süd
  const bandit = { x: 68, y: 26, w: 23, h: 17 };
  m.ellipse(79, 34, 9, 6, '.', [',']);
  ring(m, 68, 26, 90, 42, 'p', 'q', [{ side: 'w', from: 33, to: 35 }, { side: 's', from: 78, to: 80 }]);

  const put = (x, y, ch) => m.set(x, y, ch);
  // Lager der Wächter
  put(9, 27, 'T'); put(19, 27, 'T');
  put(14, 26, 'P'); put(14, 31, 'F');
  put(20, 36, 'W'); put(10, 36, 'Q'); put(16, 36, 'L');
  put(14, 28, 'I'); put(18, 32, 'O'); put(10, 32, 'V');
  put(14, 34, '1'); put(12, 33, '2'); put(4, 31, '3');
  // Banditenlager
  put(73, 29, 'K'); put(85, 29, 'K'); put(86, 38, 'K');
  put(79, 28, 'P'); put(79, 33, 'F'); put(72, 39, 'L'); put(75, 40, 'Q');
  [[71, 32], [76, 36], [82, 32], [84, 35], [77, 30], [82, 39], [62, 33], [64, 36]].forEach(([x, y]) => put(x, y, 'x'));
  [[74, 34], [87, 33], [70, 39], [60, 29]].forEach(([x, y]) => put(x, y, 'y'));
  put(80, 36, 'X');
  // Keilerwiese (Mitte-Nord) und Ostwiese
  [[34, 12], [38, 11], [42, 13], [36, 16], [42, 17], [46, 11], [31, 15], [47, 16], [38, 19], [58, 16], [62, 19], [64, 14]]
    .forEach(([x, y]) => put(x, y, 'b'));
  // Dornendickicht (Südwesten)
  [[10, 50], [15, 47], [20, 54], [12, 56], [21, 58], [7, 53], [25, 50]].forEach(([x, y]) => put(x, y, 'c'));
  // Tempelufer
  put(74, 50, 'R'); put(72, 52, '4');
  // Aufstieg nach Norden
  put(79, 4, 'P'); put(84, 4, 'P'); put(81, 6, '5');

  // Schilf am Seeufer
  for (let y = 48; y < H - 1; y++) for (let x = 60; x < W - 1; x++) {
    if (m.get(x, y) !== ',') continue;
    const nearWater = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([i, j]) => m.get(x + i, y + j) === '~');
    if (nearWater && rng.chance(0.35)) m.set(x, y, 'e');
  }

  const clearZones = [
    (x, y) => x >= camp.x - 1 && y >= camp.y - 1 && x <= camp.x + camp.w && y <= camp.y + camp.h,
    (x, y) => x >= bandit.x - 1 && y >= bandit.y - 1 && x <= bandit.x + bandit.w && y <= bandit.y + bandit.h,
    (x, y) => inEll(x, y, 39, 14, 10, 6),
    (x, y) => inEll(x, y, 61, 17, 5, 4),
    (x, y) => x >= 62 && y >= 45 && x <= 90 && y <= 53,        // Ruine und Ufer
    (x, y) => x >= 74 && y <= 9,                                  // Aufstieg
    (x, y) => x <= 5 && y >= 28 && y <= 35,                       // Westausgang
    (x, y) => inEll(x, y, 65, 56, 3, 3),                          // Totem 3
  ];
  const keep = (x, y) => clearZones.some((f) => f(x, y));
  scatter(m, rng, keep, (x, y, free) => {
    const thicket = inEll(x, y, 15, 52, 12, 7.5);
    if (thicket) {
      if (rng.chance(0.13)) return 'n';
      if (free && rng.chance(0.08)) return rng.chance(0.5) ? 'd' : 'o';
      return rng.chance(0.05) ? 'u' : null;
    }
    const nearRoad = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([i, j]) => m.get(x + i, y + j) === '.');
    const deep = (x < 30 && y < 22) || (x > 44 && x < 68 && y > 18 && y < 30) || (y > 40 && x > 28 && x < 60) || (x > 86 && y < 26);
    const pTree = nearRoad ? 0 : deep ? 0.32 : 0.1;
    if (free && rng.chance(pTree)) return rng.chance(0.72) ? 't' : 'd';
    if (rng.chance(0.012)) return 'o';
    if (rng.chance(0.02)) return 'r';
    if (rng.chance(0.03)) return 'u';
    return null;
  });

  return {
    name: 'Der Aschenwald',
    kind: 'outdoor',
    biome: 'ashwood',
    decorSet: 'decor_ashwood',
    map: m.rows(),
    solid: 'pq',
    decor: {
      t: 'charredPines', d: 'deadBirches', o: 'stumps', u: 'ashBushes', n: 'brambles', r: 'rocks', e: 'reeds',
      T: 'tent', K: 'banditTent', p: 'palisade', q: 'palisadeV', W: 'watchtower', P: 'bannerPole',
      F: 'campfireBig', L: 'logPile', Q: 'cart', R: 'templeRuin',
    },
    points: { 1: 'start', 2: 'respawn', 3: 'from_emberhollow', 4: 'from_sunken_temple', 5: 'from_cinder_peaks' },
    npcs: { I: 'warden_ilsa', O: 'herbalist_oona', V: 'trader_vesk' },
    enemies: {
      b: { type: 'ash_boar' }, x: { type: 'bandit' }, y: { type: 'bandit_archer' },
      c: { type: 'thorn_crawler' }, X: { type: 'bandit_chief' },
    },
    respawn: 40,
    areas: [
      { id: 'ashwood_camp', ...camp },
      { id: 'bandit_camp', ...bandit },
      { id: 'temple_shore', x: 62, y: 46, w: 26, h: 10 },
      { id: 'peaks_road', x: 76, y: 2, w: 10, h: 8 },
    ],
    objects: [
      { id: 'ward_totem_1', kind: 'shrine', decor: 'wardTotem', prompt: 'Totem erwecken', x: 65, y: 49 },
      { id: 'ward_totem_2', kind: 'shrine', decor: 'wardTotem', prompt: 'Totem erwecken', x: 89, y: 49 },
      { id: 'ward_totem_3', kind: 'shrine', decor: 'wardTotem', prompt: 'Totem erwecken', x: 65, y: 56 },
      { id: 'lost_satchel', kind: 'item', decor: 'satchel', prompt: 'Tasche aufheben', x: 8, y: 57 },
    ],
    portals: [
      { id: 'to_emberhollow', x: 0.6, y: 31.5, range: 26, visual: 'road', dir: [-1, 0],
        to: { zoneId: 'emberhollow', spawnId: 'from_ashwood' }, prompt: 'Westwärts zur Glutsenke' },
      { id: 'to_sunken_temple', x: 74, y: 49.6, range: 26, requires: { level: 10 },
        to: { zoneId: 'sunken_temple', spawnId: 'start' }, prompt: 'Den Versunkenen Tempel betreten' },
      { id: 'to_cinder_peaks', x: 81.5, y: 1.2, range: 28, requires: { level: 12 }, visual: 'road', dir: [0, -1],
        to: { zoneId: 'cinder_peaks', spawnId: 'from_ashwood' }, prompt: 'Aufstieg zu den Schlackenhöhen' },
    ],
  };
}

// ---------------------------------------------------------------- Schlackenhöhen
function buildCinderPeaks() {
  const W = 96, H = 64;
  const m = new MapBuilder(W, H, ',');
  const rng = createRng(1717);
  rim(m, rng, W, H);
  // Nordwand um das Schmiedetor, Basaltnasen
  m.rect(38, 0, 21, 5, '#');
  m.ellipse(12, 6, 6, 3, '#');
  m.ellipse(90, 40, 4, 6, '#');
  m.ellipse(60, 56, 4, 2.4, '#');
  // Südausgang (Aschenwald)
  m.rect(9, 59, 6, 5, ',');

  // Lavafluss (fest), danach Dämme für die Wege
  m.path([[2, 22], [14, 26], [26, 30], [40, 32], [52, 30], [62, 33], [72, 40], [84, 47], [94, 49]], 3, '~', [',']);
  m.ellipse(20, 12, 3, 1.8, '~', [',']);
  m.ellipse(70, 52, 2.6, 1.6, '~', [',']);

  const road = (pts, w = 2) => m.path(pts, w, '.', [',', '~']);
  road([[11.5, 63], [12, 58], [19, 56.5], [27, 56]]);
  road([[27, 37], [28, 32], [34, 26], [44, 20], [48, 12], [48, 6]]);
  road([[39, 46], [50, 44], [56, 42]]);
  road([[44, 20], [58, 18], [70, 20], [78, 24]]);
  road([[56, 42], [66, 40]]);

  // Feste Rauhwacht (Hub)
  const fort = { x: 16, y: 38, w: 23, h: 17 };
  m.rect(17, 39, 21, 15, ':');
  m.path([[27, 36], [27, 56]], 3, ':', [',', '.']);
  m.path([[37, 46], [40, 46]], 3, ':', [',', '.']);
  ring(m, 16, 38, 38, 54, 'w', 'v', [
    { side: 'n', from: 26, to: 28 }, { side: 's', from: 26, to: 28 }, { side: 'e', from: 45, to: 47 },
  ]);
  const put = (x, y, ch) => m.set(x, y, ch);
  put(16, 38, 'U'); put(38, 38, 'U'); put(16, 54, 'U'); put(38, 54, 'U');
  put(27, 54, 'G');
  put(20, 42, 'T'); put(34, 42, 'T'); put(20, 45, 'P'); put(34, 45, 'P');
  put(33, 51, 'F'); put(20, 51, 'c'); put(23, 52, 'c'); put(36, 50, 'c');
  put(27, 42, 'C'); put(21, 48, 'Y'); put(31, 48, 'D');
  put(27, 50, '1'); put(25, 50, '2'); put(12, 58, '3');

  // Schmiedetor im Norden
  put(48, 5, 'Z'); put(43, 6, 'e'); put(53, 6, 'e'); put(48, 8, '4');

  // Obsidianriss
  const rift = { x: 55, y: 35, w: 15, h: 11 };
  m.ellipse(62, 40, 6, 4, ':', [',']);
  // Kolosskrater im Osten
  m.ellipse(81, 20, 9.5, 6.5, ':', [',', '.']);
  for (let a = 0; a < Math.PI * 2; a += 0.34) {
    const x = Math.round(81 + Math.cos(a) * 10.5), y = Math.round(20 + Math.sin(a) * 7.2);
    if (Math.abs(a - Math.PI) < 0.5) continue; // Zugang von Westen
    if (m.get(x, y) === ',' || m.get(x, y) === '.') m.set(x, y, 'k');
  }
  put(81, 20, 'M');

  // Gegner
  [[34, 24], [37, 21], [41, 22], [44, 17], [31, 20], [10, 14], [13, 17], [8, 18], [15, 11], [52, 22], [56, 16], [24, 20], [6, 34], [10, 38]]
    .forEach(([x, y]) => put(x, y, 'i'));
  [[50, 25], [58, 22], [66, 16], [70, 23], [74, 26], [88, 28], [62, 12], [72, 12], [48, 52], [52, 57]]
    .forEach(([x, y]) => put(x, y, 'h'));
  [[58, 42], [66, 43], [61, 37], [45, 40], [46, 50]].forEach(([x, y]) => put(x, y, 'g'));
  [[64, 45], [56, 44], [70, 38], [38, 21], [58, 22], [80, 34], [86, 56]].forEach(([x, y]) => put(x, y, 'u'));

  const clearZones = [
    (x, y) => x >= fort.x - 1 && y >= fort.y - 1 && x <= fort.x + fort.w && y <= fort.y + fort.h,
    (x, y) => x >= 40 && x <= 56 && y <= 10,
    (x, y) => inEll(x, y, 62, 40, 7, 5),
    (x, y) => inEll(x, y, 81, 20, 11.5, 8),
    (x, y) => x >= 8 && x <= 16 && y >= 55,
  ];
  const keep = (x, y) => clearZones.some((f) => f(x, y));
  scatter(m, rng, keep, (x, y, free) => {
    const nearRoad = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([i, j]) => m.get(x + i, y + j) === '.');
    const nearLava = [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0]].some(([i, j]) => m.get(x + i, y + j) === '~');
    if (inRect(x, y, { x: 50, y: 31, w: 26, h: 18 }) && free && rng.chance(0.14)) return 's';
    if (nearRoad) return null;
    if (nearLava && rng.chance(0.1)) return 'r';
    if (free && rng.chance(0.045)) return rng.chance(0.55) ? 'k' : 't';
    if (rng.chance(0.03)) return 'a';
    if (rng.chance(0.012)) return 'r';
    return null;
  });

  return {
    name: 'Die Schlackenhöhen',
    kind: 'outdoor',
    biome: 'cinder',
    decorSet: 'decor_peaks',
    map: m.rows(),
    solid: 'wvU',
    decor: {
      t: 'deadTrees', k: 'basaltColumns', s: 'obsidianSpikes', r: 'lavaRocks', a: 'ashDrifts',
      w: 'fortWall', v: 'fortWallV', G: 'fortGate', U: 'fortTower', T: 'tent', P: 'bannerPole',
      F: 'forge', c: 'crates', e: 'lavaVent', Z: 'forgeGate',
    },
    points: { 1: 'start', 2: 'respawn', 3: 'from_ashwood', 4: 'from_molten_forge' },
    npcs: { C: 'commander_hale', Y: 'seer_ysolde', D: 'quartermaster_dunn' },
    enemies: {
      i: { type: 'fire_imp' }, h: { type: 'magma_hound' }, g: { type: 'ash_golem' },
      u: { type: 'cinder_cultist' }, M: { type: 'magma_behemoth' },
    },
    respawn: 40,
    areas: [
      { id: 'rookwatch', ...fort },
      { id: 'obsidian_rift', ...rift },
      { id: 'forge_gate', x: 42, y: 5, w: 13, h: 7 },
    ],
    objects: [
      { id: 'rift_seal_1', kind: 'shrine', decor: 'riftSeal', prompt: 'Siegel erneuern', x: 57, y: 39 },
      { id: 'rift_seal_2', kind: 'shrine', decor: 'riftSeal', prompt: 'Siegel erneuern', x: 67, y: 39 },
      { id: 'rift_seal_3', kind: 'shrine', decor: 'riftSeal', prompt: 'Siegel erneuern', x: 62, y: 44 },
    ],
    portals: [
      { id: 'to_ashwood', x: 11.5, y: 62.4, range: 28, visual: 'road', dir: [0, 1],
        to: { zoneId: 'ashwood', spawnId: 'from_cinder_peaks' }, prompt: 'Hinab in den Aschenwald' },
      { id: 'to_molten_forge', x: 48, y: 4.9, range: 26, requires: { level: 17 },
        to: { zoneId: 'molten_forge', spawnId: 'start' }, prompt: 'Die Glutschmiede betreten' },
    ],
  };
}

// ---------------------------------------------------------------- Dungeon-Helfer
function dungeonBase(W, H, seed) {
  const m = new MapBuilder(W, H, '#');
  const rooms = [];
  const room = (x, y, w, h) => { m.rect(x, y, w, h, '.'); rooms.push({ x, y, w, h }); };
  const hall = (x, y, w, h) => m.rect(x, y, w, h, '.');
  const rng = createRng(seed);
  // Wandfackeln auf den Nordwänden (nach allen Räumen aufrufen)
  const torches = (every = 5) => {
    for (const r of rooms) {
      for (let x = r.x + 2; x < r.x + r.w - 1; x += every) {
        const y = r.y - 1;
        if (m.get(x, y) === '#' && m.get(x, y + 1) === '.') m.set(x, y, 'T');
      }
    }
  };
  return { m, room, hall, rng, torches, put: (x, y, ch) => m.set(x, y, ch) };
}

// ---------------------------------------------------------------- Versunkener Tempel
function buildSunkenTemple() {
  const W = 64, H = 56;
  const { m, room, hall, torches, put } = dungeonBase(W, H, 303);
  room(4, 4, 12, 8);    // A Vorhof
  room(22, 3, 16, 10);  // B Flutgang
  room(4, 18, 13, 12);  // C Statuenhalle
  room(22, 18, 16, 12); // D Großes Becken
  room(44, 6, 14, 12);  // E Kultkammer
  room(44, 22, 12, 9);  // F Heiligtum (temple_sanctum)
  room(38, 36, 22, 16); // G Arena
  hall(16, 7, 6, 3); hall(8, 12, 3, 6); hall(38, 8, 6, 3); hall(17, 23, 5, 3);
  hall(38, 25, 6, 3); hall(49, 18, 3, 4); hall(47, 31, 4, 5);
  torches(5);

  // Wasser (fest, niedrig) mit Brücken
  m.rect(22, 7, 16, 2, '~'); m.rect(29, 7, 2, 2, '.');
  m.ellipse(30, 24, 5, 2.8, '~', ['.']);
  m.ellipse(42.5, 44, 1.6, 1.3, '~', ['.']); m.ellipse(55.5, 44, 1.6, 1.3, '~', ['.']);
  m.rect(4, 22, 2, 4, '~');

  put(9, 3, 'D'); put(10, 3, 'D');
  put(9, 6, '1'); put(12, 6, '2');
  // A
  put(5, 5, 'U'); put(14, 5, 'U'); put(5, 10, 'K'); put(14, 10, 'w');
  // B
  put(23, 4, 'B'); put(36, 11, 'B'); put(26, 5, 'I'); put(33, 5, 'I'); put(26, 11, 'I'); put(33, 11, 'I');
  put(25, 5, 'd'); put(35, 10, 'd'); put(31, 4, 'd'); put(28, 11, 'z'); put(36, 4, 'C'); put(23, 11, 'h');
  // C
  put(6, 19, 'S'); put(14, 19, 'S'); put(6, 28, 'S'); put(14, 28, 'S');
  put(10, 23, 'g'); put(8, 20, 'z'); put(13, 26, 'z'); put(5, 28, 'C'); put(11, 27, 'x'); put(15, 23, 'K');
  // D
  [[24, 20], [36, 20], [24, 28], [36, 28]].forEach(([x, y]) => put(x, y, 'I'));
  put(26, 19, 'd'); put(34, 28, 'd'); put(28, 28, 'u'); put(33, 19, 'u'); put(37, 24, 'g');
  put(23, 24, 'w'); put(30, 28, 'h'); put(25, 22, 'K');
  // E
  put(45, 7, 'B'); put(56, 7, 'B'); put(50, 7, 'A');
  put(47, 10, 'u'); put(54, 10, 'u'); put(50, 14, 'u'); put(51, 11, 'g'); put(46, 15, 'd');
  put(56, 16, 'C'); put(45, 16, 'U'); put(57, 12, 'x');
  // F – Heiligtum
  put(45, 23, 'S'); put(54, 23, 'S'); put(46, 27, 'z'); put(53, 27, 'z'); put(50, 25, 'd');
  put(45, 29, 'w'); put(54, 29, 'K');
  for (let x = 47; x <= 50; x++) put(x, 35, 'G');
  // G – Arena
  [[41, 39], [56, 39], [41, 48], [56, 48]].forEach(([x, y]) => put(x, y, 'I'));
  put(39, 37, 'B'); put(58, 37, 'B'); put(39, 50, 'B'); put(58, 50, 'B');
  put(49, 37, 'A'); put(49, 41, '9'); put(49, 46, 'R');
  put(44, 50, 'x'); put(54, 37, 'K'); put(44, 37, 'w');
  // Verborgene Schatzkammer unter der Statuenhalle (Hebel an der Nordwand von C)
  m.rect(6, 38, 11, 7, '.'); m.rect(9, 30, 2, 8, '.');
  put(9, 30, '$'); put(10, 30, '$');
  put(7, 37, 'T'); put(14, 37, 'T');
  put(11, 39, 'A'); put(11, 42, 'C'); put(7, 43, 'U'); put(15, 43, 'U'); put(7, 39, 'K'); put(15, 40, 'w'); put(14, 41, 'd');
  // Druckplatten
  put(29, 9, '^'); put(30, 6, '^'); put(40, 26, '^'); put(9, 34, '^'); put(10, 35, '^'); put(49, 20, '^');

  return {
    name: 'Der Versunkene Tempel',
    kind: 'dungeon',
    biome: 'temple',
    map: m.rows(),
    decor: {
      S: 'statue', I: 'pillar', K: 'coral', w: 'seaweed', h: 'shells', B: 'brazierTeal', A: 'altar', U: 'urn', x: 'drownedBones',
    },
    points: { 1: 'start', 2: 'respawn' },
    enemies: {
      d: { type: 'drowned' }, z: { type: 'drowned', dormant: true },
      u: { type: 'tide_cultist' }, g: { type: 'temple_guardian' },
      9: { type: 'drowned_priestess', boss: true },
    },
    respawn: Infinity,
    areas: [{ id: 'temple_sanctum', x: 44, y: 22, w: 12, h: 9 }],
    arena: { x: 38, y: 36, w: 22, h: 16, gateRow: 35 },
    traps: { '^': { kind: 'spike' } },
    trapDamage: 22,
    secrets: [{ id: 'temple_vault', lever: { x: 11, y: 18 } }],
    portals: [{
      id: 'to_ashwood', x: 9.5, y: 3.2, range: 22,
      to: { zoneId: 'ashwood', spawnId: 'from_sunken_temple' },
      prompt: 'Zum Aschenwald hinaufsteigen',
    }],
  };
}

// ---------------------------------------------------------------- Glutschmiede
function buildMoltenForge() {
  const W = 68, H = 60;
  const { m, room, hall, torches, put } = dungeonBase(W, H, 404);
  room(4, 4, 12, 8);    // A Einfahrt
  room(22, 3, 18, 11);  // B Gießerei
  room(4, 19, 14, 12);  // C Erzstollen
  room(24, 20, 16, 12); // D Drachengrube
  room(46, 5, 16, 14);  // E Halle des Wächters (warden_hall)
  room(46, 24, 14, 11); // F Vorhalle (tyrant_throne)
  room(40, 40, 24, 17); // G Thron der Glut (Arena)
  hall(16, 7, 6, 3); hall(8, 12, 3, 7); hall(40, 8, 6, 3); hall(18, 24, 6, 3);
  hall(40, 27, 6, 3); hall(52, 19, 3, 5); hall(51, 35, 4, 5);
  torches(6);

  // Lava (fest, niedrig) mit Brücke
  m.rect(22, 9, 18, 2, '~'); m.rect(30, 9, 2, 2, '.');
  m.ellipse(32, 26, 4.2, 2.6, '~', ['.']);
  m.ellipse(44.5, 48, 1.4, 2.4, '~', ['.']); m.ellipse(59.5, 48, 1.4, 2.4, '~', ['.']);

  put(9, 3, 'D'); put(10, 3, 'D');
  put(9, 6, '1'); put(12, 6, '2');
  // A
  put(5, 5, 'Q'); put(14, 10, 's'); put(5, 10, 'B'); put(14, 5, 'W');
  // B – Gießerei
  put(24, 5, 'U'); put(37, 5, 'U'); put(27, 12, 'N'); put(35, 12, 'N'); put(31, 5, 'E'); put(23, 12, 'p'); put(38, 12, 'p');
  put(26, 7, 'f'); put(34, 6, 'a'); put(37, 12, 'a'); put(29, 12, 'r'); put(38, 4, 'C');
  // C – Erzstollen
  put(6, 20, 'Q'); put(15, 29, 'Q'); put(5, 25, 's'); put(16, 21, 's'); put(10, 29, 'j');
  put(9, 22, 'h'); put(13, 24, 'h'); put(7, 27, 'f'); put(14, 27, 'r'); put(5, 29, 'C');
  // D – Drachengrube
  [[25, 21], [38, 21], [25, 30], [38, 30]].forEach(([x, y]) => put(x, y, 'I'));
  put(27, 23, 'r'); put(37, 26, 'r'); put(30, 30, 'r'); put(34, 21, 'a'); put(26, 27, 'j'); put(36, 29, 's');
  // E – Halle des Wächters
  [[48, 7], [59, 7], [48, 16], [59, 16]].forEach(([x, y]) => put(x, y, 'I'));
  put(53, 6, 'W'); put(56, 6, 'W'); put(50, 6, 'B'); put(61, 12, 'E');
  put(54, 11, '8'); put(50, 13, 'f'); put(58, 13, 'a'); put(60, 17, 'C');
  // F – Vorhalle
  put(47, 25, 'B'); put(58, 25, 'B'); put(49, 30, 'r'); put(56, 30, 'r'); put(52, 27, 'h'); put(55, 33, 'f');
  put(47, 33, 'p'); put(58, 33, 'C'); put(52, 25, 'j');
  for (let x = 51; x <= 54; x++) put(x, 39, 'G');
  // G – Arena
  [[43, 43], [60, 43], [43, 53], [60, 53]].forEach(([x, y]) => put(x, y, 'I'));
  put(41, 41, 'B'); put(62, 41, 'B'); put(41, 55, 'B'); put(62, 55, 'B');
  put(48, 41, 'U'); put(57, 41, 'U'); put(52, 41, 'E');
  put(52, 45, '9'); put(52, 50, 'R'); put(46, 55, 's'); put(58, 55, 'j');
  // Verborgene Waffenkammer unter dem Erzstollen (Hebel an der Nordwand von C)
  m.rect(5, 37, 12, 7, '.'); m.rect(10, 31, 2, 6, '.');
  put(10, 31, '$'); put(11, 31, '$');
  put(6, 36, 'T'); put(15, 36, 'T');
  put(11, 40, 'C'); put(7, 38, 'W'); put(15, 38, 'W'); put(6, 42, 'U'); put(16, 42, 's'); put(14, 41, 'f');
  // Flammendüsen (J nach rechts, L nach unten) und Druckplatten
  put(18, 7, 'L'); put(20, 7, 'L'); put(46, 29, 'J'); put(41, 27, 'L'); put(10, 34, '^'); put(11, 35, '^'); put(53, 21, '^');

  return {
    name: 'Die Glutschmiede',
    kind: 'dungeon',
    biome: 'forge',
    map: m.rows(),
    decor: {
      N: 'anvil', I: 'forgePillar', j: 'chains', U: 'crucible', W: 'weaponRack', Q: 'oreCart', B: 'brazierForge',
      E: 'gear', s: 'slagPile', p: 'pipes',
    },
    points: { 1: 'start', 2: 'respawn' },
    enemies: {
      f: { type: 'forge_golem' }, a: { type: 'flame_acolyte' }, r: { type: 'ember_drake' }, h: { type: 'magma_hound' },
      8: { type: 'forge_warden' },
      9: { type: 'ember_tyrant', boss: true },
    },
    respawn: Infinity,
    areas: [
      { id: 'warden_hall', x: 46, y: 5, w: 16, h: 14 },
      { id: 'tyrant_throne', x: 46, y: 24, w: 14, h: 11 },
    ],
    arena: { x: 40, y: 40, w: 24, h: 17, gateRow: 39 },
    traps: { '^': { kind: 'spike' }, J: { kind: 'jet', dir: [1, 0], len: 64 }, L: { kind: 'jet', dir: [0, 1], len: 40 } },
    trapDamage: 32,
    secrets: [{ id: 'forge_armory', lever: { x: 11, y: 19 } }],
    portals: [{
      id: 'to_cinder_peaks', x: 9.5, y: 3.2, range: 22,
      to: { zoneId: 'cinder_peaks', spawnId: 'from_molten_forge' },
      prompt: 'Zu den Schlackenhöhen hinaufsteigen',
    }],
  };
}

// ---------------------------------------------------------------- Glutprüfung
// Offene Arena für den Gegner-Nachschub (TrialDirector). Keine festen Gegner.
function buildEmberTrial() {
  const W = 50, H = 38;
  const { m, room, torches, put } = dungeonBase(W, H, 505);
  const r = { x: 4, y: 5, w: 42, h: 29 };
  room(r.x, r.y, r.w, r.h);
  torches(5);
  // Lavabecken in den Ecken und Säulen als Deckung
  m.ellipse(10, 11, 2.2, 1.5, '~', ['.']); m.ellipse(39.5, 11, 2.2, 1.5, '~', ['.']);
  m.ellipse(10, 28, 2.2, 1.5, '~', ['.']); m.ellipse(39.5, 28, 2.2, 1.5, '~', ['.']);
  [[16, 13], [33, 13], [16, 26], [33, 26]].forEach(([x, y]) => put(x, y, 'I'));
  [[5, 6], [44, 6], [5, 32], [44, 32], [24, 6], [25, 6]].forEach(([x, y]) => put(x, y, 'B'));
  [[20, 6], [29, 6]].forEach(([x, y]) => put(x, y, 'U'));
  [[7, 19], [42, 19], [21, 32], [28, 32]].forEach(([x, y]) => put(x, y, 's'));
  [[12, 20], [37, 20]].forEach(([x, y]) => put(x, y, 'j'));
  put(24, 20, '1'); put(25, 22, '2');
  put(24, 24, 'R');
  return {
    name: 'Glutprüfung',
    kind: 'dungeon',
    biome: 'forge',
    map: m.rows(),
    decor: { I: 'forgePillar', B: 'brazierForge', U: 'crucible', s: 'slagPile', j: 'chains' },
    points: { 1: 'start', 2: 'respawn' },
    enemies: {},
    respawn: Infinity,
    room: r,
    portals: [],
  };
}

export const LEVELS2 = {
  ember_trial: buildEmberTrial(),
  ashwood: buildAshwood(),
  cinder_peaks: buildCinderPeaks(),
  sunken_temple: buildSunkenTemple(),
  molten_forge: buildMoltenForge(),
};
