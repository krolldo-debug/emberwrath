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
export function rim(m, rng, W, H) {
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
export function scatter(m, rng, keepClear, pick) {
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

export const inRect = (x, y, r) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
export const inEll = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

// Palisaden-/Mauerring mit Lücken. gaps: [{ side: 'n'|'s'|'w'|'e', from, to }]
export function ring(m, x0, y0, x1, y1, hCh, vCh, gaps = []) {
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

  // Lager der Wächter (Hub): Waldlichtung mit festgetretenem Waldboden statt Pflaster,
  // unregelmäßige Holzpalisade (Nord mit Versatz, West mit Tor), Südosten offen und
  // nur mit Holzstapeln und Karren verbarrikadiert; Feuer im Südwesten, Wachturm im Nordwesten.
  const camp = { x: 6, y: 24, w: 17, h: 15 };
  m.ellipse(14, 31, 7.6, 6.6, '.', [',']);
  m.path([[7, 31.5], [21, 31.5]], 2, '.', [',']);
  m.ellipse(19.5, 36.2, 2.2, 1.3, ',', ['.']); m.ellipse(7.6, 26, 1.4, 1.2, ',', ['.']); m.ellipse(20.5, 25.6, 1.6, 1, ',', ['.']);
  for (let x = 6; x <= 16; x++) m.set(x, 24, 'p');
  m.set(16, 25, 'q');
  for (let x = 16; x <= 22; x++) m.set(x, 26, 'p');
  for (let y = 25; y <= 37; y++) if (y < 30 || y > 33) m.set(6, y, 'q');
  for (let y = 27; y <= 29; y++) m.set(22, y, 'q');
  for (let x = 6; x <= 13; x++) m.set(x, 38, 'p');

  // Banditenlager: Palisade mit Toren West/Süd
  const bandit = { x: 68, y: 26, w: 23, h: 17 };
  m.ellipse(79, 34, 9, 6, '.', [',']);
  ring(m, 68, 26, 90, 42, 'p', 'q', [{ side: 'w', from: 33, to: 35 }, { side: 's', from: 78, to: 80 }]);

  const put = (x, y, ch) => m.set(x, y, ch);
  // Lager der Wächter
  put(8, 26, 'W'); put(12, 26, 'T'); put(19, 28, 'T'); put(17, 30, 'P');
  // Wachfeuer: an der offenen Ostseite (Straße, Barrikade) und zwischen den Zelten im Norden –
  // das Lager ist sonst nur am Kochfeuer im Südwesten beleuchtet
  put(10, 34, 'F'); put(22, 33, 'F'); put(16, 27, 'F'); put(8, 37, 'L'); put(21, 35, 'L'); put(18, 37, 'Q'); put(15, 37, 'L');
  put(14, 28, 'I'); put(13, 35, 'O'); put(17, 34, 'V');
  put(15, 32, '1'); put(11, 32, '2'); put(4, 31, '3');
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
  // Ostausgang (Aschensteppe, Runde 3)
  m.rect(91, 29, 5, 5, ',');

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
  road([[66, 40], [76, 35], [86, 32], [95, 31]]);

  // Feste Rauhwacht (Hub): an die Westklippe gelehnt. Hof aus Ascheboden, Felsplatten nur am
  // Klippenfuß und in der Schmiedeecke (Südost). Mauern mit Türmen an Nord-, Ost- und Südseite.
  const fort = { x: 16, y: 38, w: 23, h: 17 };
  for (let y = 36; y <= 56; y++) {
    const edge = 18 + ((y * 7) % 5 === 0 ? 1 : 0) - (y < 38 || y > 54 ? 2 + ((y * 3) % 2) : 0);
    for (let x = 12; x <= edge; x++) m.set(x, y, '#');
  }
  m.rect(19, 39, 19, 15, '.');
  m.rect(19, 39, 3, 15, ':');
  m.rect(31, 48, 7, 6, ':');
  m.path([[27, 36], [27, 56]], 3, '.', [',', '.']);
  m.path([[37, 46], [40, 46]], 3, '.', [',', '.']);
  for (let x = 19; x <= 38; x++) {
    if (x < 26 || x > 28) { m.set(x, 38, 'w'); m.set(x, 54, 'w'); }
  }
  for (let y = 39; y <= 53; y++) if (y < 45 || y > 47) m.set(38, y, 'v');
  const put = (x, y, ch) => m.set(x, y, ch);
  put(19, 38, 'U'); put(38, 38, 'U'); put(19, 54, 'U'); put(38, 54, 'U');
  put(27, 54, 'G');
  put(24, 41, 'T'); put(35, 42, 'T'); put(22, 45, 'P'); put(31, 41, 'P');
  put(34, 51, 'F'); put(31, 52, 'c'); put(37, 49, 'c'); put(36, 52, 'c'); put(20, 52, 'c');
  put(28, 42, 'C'); put(21, 49, 'Y'); put(32, 48, 'D');
  put(27, 49, '1'); put(25, 50, '2'); put(12, 58, '3');

  // Schmiedetor im Norden
  put(48, 5, 'Z'); put(43, 6, 'e'); put(53, 6, 'e'); put(48, 8, '4');
  put(92, 29, 'P'); put(92, 34, 'P'); put(91, 31, '6');

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
    (x, y) => x >= 84 && y >= 27 && y <= 36,
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
    points: { 1: 'start', 2: 'respawn', 3: 'from_ashwood', 4: 'from_molten_forge', 6: 'from_ashen_steppe' },
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
      { id: 'to_ashen_steppe', x: 95.4, y: 31, range: 28, requires: { level: 20 }, visual: 'road', dir: [1, 0],
        to: { zoneId: 'ashen_steppe', spawnId: 'from_cinder_peaks' }, prompt: 'Ostwärts in die Aschensteppe' },
    ],
  };
}

// ---------------------------------------------------------------- Dungeon-Helfer
export function dungeonBase(W, H, seed) {
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
// Überflutete Tempelanlage: Vorhof -> überfluteter Säulengang -> Große Halle mit
// Wasserbecken und Insel (Herzstück) -> Seitenschreine (Statuenhalle W,
// Kultkammer NO, Heiligtum O) -> Altarhalle (Arena). Im Süden eine geflutete
// Krypta mit Trittstein-Damm, im Südwesten die verborgene Schatzkammer.
function buildSunkenTemple() {
  const W = 64, H = 56;
  const { m, room, hall, torches, put } = dungeonBase(W, H, 303);
  const bevel = (x, y, w, h, k) => {
    for (let j = 0; j < k; j++) for (let i = 0; i < k - j; i++) {
      put(x + i, y + j, '#'); put(x + w - 1 - i, y + j, '#');
      put(x + i, y + h - 1 - j, '#'); put(x + w - 1 - i, y + h - 1 - j, '#');
    }
  };
  // Räume
  room(4, 4, 12, 8);    // A Vorhof
  room(20, 4, 22, 7);   // B Säulengang (überflutet)
  room(3, 16, 11, 14);  // C Statuenhalle (Seitenschrein West)
  room(18, 15, 26, 18); // D Große Halle mit Becken
  room(46, 21, 12, 10); // F Heiligtum (temple_sanctum)
  room(38, 36, 22, 16); // G Altarhalle (Arena)
  m.ellipse(52.5, 10.2, 7.2, 5.6, '.'); // E Kultkammer (rund)
  m.rect(15, 37, 21, 14, '.');          // K Geflutete Krypta
  // Gänge
  hall(16, 6, 4, 3);    // A -> B
  hall(8, 12, 3, 4);    // A -> C
  hall(30, 11, 2, 4);   // B -> D (Achse auf die Insel)
  hall(42, 6, 4, 3);    // B -> E
  hall(14, 22, 4, 3);   // C -> D
  hall(44, 23, 2, 3);   // D -> F
  hall(51, 15, 3, 6);   // E -> F
  hall(47, 31, 4, 5);   // F -> G (Tor)
  hall(24, 33, 2, 4);   // D -> K
  bevel(18, 15, 26, 18, 3);
  bevel(38, 36, 22, 16, 2);
  bevel(3, 16, 11, 14, 1);
  torches(5);
  // Fackeln der runden Kultkammer
  for (const x of [47, 50, 55, 58]) if (m.get(x, 6) === '#' && m.get(x, 7) === '.') put(x, 6, 'T');
  for (const x of [48, 51, 54, 57]) if (m.get(x, 5) === '#' && m.get(x, 6) === '.') put(x, 5, 'T');

  // --- Wasser
  // A: zwei Weihwasserbecken
  m.rect(5, 9, 2, 2, '~'); m.rect(13, 9, 2, 2, '~');
  // B: Mittelkanal mit Säulen im Wasser, Brücke auf der Achse
  m.rect(22, 6, 18, 3, '~'); m.rect(30, 6, 2, 3, '.');
  for (const x of [24, 27, 34, 37]) put(x, 7, 'I');
  // C: langes Spiegelbecken
  m.rect(7, 19, 3, 8, '~');
  // D: großes Becken, Insel, Dämme N/S
  m.ellipse(30.5, 24, 8.4, 4.8, '~');
  m.ellipse(30.5, 24, 2.8, 1.6, '.');
  m.rect(30, 19, 2, 4, '.'); m.rect(30, 25, 2, 5, '.');
  // E: Ritualbecken
  m.ellipse(52.5, 11.5, 2.3, 1.3, '~');
  // F: zwei kleine Becken
  m.rect(47, 22, 2, 2, '~'); m.rect(55, 22, 2, 2, '~');
  // G: Seitenkanäle und Becken neben dem Altar
  m.rect(39, 39, 2, 9, '~'); m.rect(57, 39, 2, 9, '~');
  m.rect(43, 49, 3, 2, '~'); m.rect(52, 49, 3, 2, '~');
  // K: Krypta geflutet, Trittstein-Damm im Zickzack, Schrein-Absatz NO
  m.rect(15, 39, 21, 12, '~');
  m.path([[24.5, 38], [24.5, 41.5], [19, 43], [19, 47.5], [26.5, 48], [32, 45.5], [32, 41]], 2, '.');
  m.rect(29, 37, 7, 3, '.');
  m.ellipse(26.5, 44, 1.6, 1.2, '.'); // kleine Insel (Urne)

  put(9, 3, 'D'); put(10, 3, 'D');
  put(9, 6, '1'); put(12, 6, '2');
  // A – Vorhof
  put(5, 5, 'U'); put(14, 5, 'U'); put(4, 8, 'K'); put(15, 11, 'w'); put(7, 11, 'h');
  // B – Säulengang
  put(21, 4, 'B'); put(40, 4, 'B'); put(23, 10, 'K'); put(39, 10, 'w'); put(26, 4, 'h');
  put(25, 9, 'd'); put(35, 4, 'd'); put(33, 9, 'z'); put(38, 5, 'u'); put(28, 4, 'x');
  // C – Statuenhalle
  put(4, 18, 'S'); put(12, 18, 'S'); put(4, 23, 'S'); put(4, 27, 'S'); put(12, 27, 'S');
  put(8, 28, 'A'); put(6, 17, 'B'); put(11, 17, 'B');
  put(5, 21, 'z'); put(11, 25, 'z'); put(11, 20, 'd'); put(5, 25, 'g');
  put(12, 29, 'C'); put(4, 29, 'U'); put(5, 28, 'x');
  // D – Große Halle: Säulenring ums Becken, Statue auf der Insel
  for (const [x, y] of [[21, 18], [26, 17], [35, 17], [40, 18], [21, 29], [26, 31], [35, 31], [40, 29], [20, 22], [20, 26], [41, 22], [41, 26]]) put(x, y, 'I');
  put(30, 23, 'S'); put(28, 24, 'B'); put(33, 24, 'B');
  put(19, 18, 'B'); put(42, 18, 'B'); put(19, 30, 'B'); put(42, 30, 'B');
  put(22, 25, 'K'); put(39, 23, 'w'); put(23, 31, 'h'); put(37, 16, 'x');
  put(31, 25, 'g'); put(23, 20, 'd'); put(38, 28, 'd'); put(24, 29, 'z'); put(37, 20, 'u');
  // E – Kultkammer
  put(52, 6, 'A'); put(49, 7, 'B'); put(56, 7, 'B');
  put(47, 10, 'U'); put(58, 10, 'U'); put(48, 14, 'K'); put(57, 14, 'w');
  put(49, 10, 'u'); put(56, 10, 'u'); put(52, 14, 'u'); put(54, 8, 'g'); put(50, 13, 'd');
  put(58, 12, 'C'); put(46, 12, 'x');
  // F – Heiligtum
  put(50, 22, 'S'); put(53, 22, 'S'); put(46, 29, 'U'); put(57, 29, 'U');
  put(48, 26, 'z'); put(55, 26, 'd'); put(52, 28, 'x'); put(57, 25, 'h');
  for (let x = 47; x <= 50; x++) put(x, 35, 'G');
  // G – Altarhalle
  [[42, 39], [55, 39], [42, 46], [55, 46]].forEach(([x, y]) => put(x, y, 'I'));
  put(40, 38, 'B'); put(57, 38, 'B'); put(41, 50, 'B'); put(56, 50, 'B');
  put(49, 50, 'A'); put(47, 50, 'U'); put(51, 50, 'U');
  put(49, 44, '9'); put(49, 40, 'R');
  put(45, 37, 'K'); put(53, 37, 'w'); put(44, 48, 'x'); put(54, 42, 'h');
  // K – Geflutete Krypta
  put(26, 44, 'U'); put(34, 38, 'A'); put(30, 38, 'C'); put(35, 37, 'B'); put(16, 37, 'B');
  put(19, 45, 'd'); put(26, 48, 'z'); put(32, 41, 'u'); put(23, 37, 'x');
  for (const x of [17, 22, 27, 32]) if (m.get(x, 36) === '#') put(x, 36, 'T');
  // Verborgene Schatzkammer (Hebel an der Nordwand der Statuenhalle)
  m.rect(3, 36, 10, 7, '.'); m.rect(5, 30, 2, 6, '.');
  put(5, 30, '$'); put(6, 30, '$');
  put(4, 35, 'T'); put(11, 35, 'T');
  put(8, 37, 'A'); put(8, 40, 'C'); put(4, 41, 'U'); put(11, 41, 'U'); put(4, 37, 'K'); put(11, 38, 'w'); put(10, 40, 'd');
  // Druckplatten
  put(30, 9, '^'); put(31, 5, '^'); put(45, 24, '^'); put(5, 33, '^'); put(6, 34, '^'); put(52, 19, '^'); put(19, 44, '^');

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
    areas: [{ id: 'temple_sanctum', x: 46, y: 21, w: 12, h: 10 }],
    arena: { x: 38, y: 36, w: 22, h: 16, gateRow: 35 },
    traps: { '^': { kind: 'spike' } },
    trapDamage: 22,
    secrets: [{ id: 'temple_vault', lever: { x: 12, y: 16 } }],
    portals: [{
      id: 'to_ashwood', x: 9.5, y: 3.2, range: 22,
      to: { zoneId: 'ashwood', spawnId: 'from_sunken_temple' },
      prompt: 'Zum Aschenwald hinaufsteigen',
    }],
  };
}

// ---------------------------------------------------------------- Glutschmiede
// Schmiede im Berg: Einfahrt -> Gießerei (Gießrinne, Tiegel) -> Hauptschmiedehalle
// mit Lavarinnen, Brücken und großer Esse -> Erzlager (Höhle) im Westen,
// Schlackenhalde im Süden über zwei Förderschächte -> Halle des Wächters ->
// Vorhalle -> Schmelzkammer (Arena). Verborgene Waffenkammer unter dem Erzlager.
function buildMoltenForge() {
  const W = 68, H = 60;
  const { m, room, hall, torches, put } = dungeonBase(W, H, 404);
  const bevel = (x, y, w, h, k) => {
    for (let j = 0; j < k; j++) for (let i = 0; i < k - j; i++) {
      put(x + i, y + j, '#'); put(x + w - 1 - i, y + j, '#');
      put(x + i, y + h - 1 - j, '#'); put(x + w - 1 - i, y + h - 1 - j, '#');
    }
  };
  // Räume
  room(4, 4, 12, 8);    // A Einfahrt
  room(21, 3, 20, 9);   // B Gießerei
  room(20, 15, 26, 22); // H Hauptschmiedehalle
  room(46, 4, 17, 15);  // E Halle des Wächters (warden_hall)
  room(48, 23, 14, 12); // F Vorhalle (tyrant_throne)
  room(40, 40, 24, 17); // G Schmelzkammer (Arena)
  // Erzlager (Höhle) und Schlackenhalde
  m.ellipse(9.5, 23.5, 6.4, 5.2, '.'); m.ellipse(9.5, 29.5, 5.6, 3.4, '.');
  m.ellipse(27.5, 49, 10.2, 5.6, '.'); m.ellipse(20.5, 47, 3.5, 3, '.');
  // Gänge und Förderschächte
  hall(16, 6, 5, 3);                              // A -> B
  m.path([[9.5, 11], [9.5, 14], [10, 18]], 3, '.'); // A -> C (Schacht)
  hall(24, 12, 3, 3); hall(35, 12, 3, 3);         // B -> H
  hall(41, 7, 5, 3);                              // B -> E
  m.path([[14, 30], [20, 30]], 3, '.');           // C -> H
  hall(46, 29, 2, 3);                             // H -> F
  hall(53, 19, 3, 4);                             // E -> F
  hall(51, 35, 4, 5);                             // F -> G (Tor)
  m.path([[24, 36], [24, 44]], 3, '.');           // H -> S (West-Förderschacht)
  m.path([[35, 36], [35, 40], [33, 45]], 3, '.'); // H -> S (Ost-Förderschacht)
  bevel(20, 15, 26, 22, 3);
  bevel(46, 4, 17, 15, 2);
  bevel(40, 40, 24, 17, 2);
  bevel(48, 23, 14, 12, 1);
  torches(6);

  // --- Lava
  // B: Gießrinne vor dem Gießstand, zwei Stege
  m.rect(22, 6, 18, 1, '~'); m.rect(26, 6, 2, 1, '.'); m.rect(34, 6, 2, 1, '.');
  // H: Querrinne mit zwei Brücken, Zulauf von Norden, große Esse im Süden
  m.rect(20, 25, 26, 2, '~'); m.rect(25, 25, 3, 2, '.'); m.rect(38, 25, 3, 2, '.');
  m.rect(32, 15, 2, 10, '~'); m.rect(32, 19, 2, 2, '.');
  m.ellipse(32.5, 31, 3.1, 1.8, '~');
  // E: zwei Abstichgruben
  m.ellipse(49.5, 11.5, 1.2, 2, '~'); m.ellipse(59.5, 11.5, 1.2, 2, '~');
  // F: Rinne an der Ostwand
  m.rect(60, 25, 1, 8, '~');
  // G: Lavagräben an den Seiten, Gießrinne im Süden
  m.rect(41, 43, 2, 10, '~'); m.rect(61, 43, 2, 10, '~');
  m.rect(47, 54, 11, 2, '~'); m.rect(52, 54, 1, 2, '~');
  // S: Schlackenbecken
  m.ellipse(28.5, 50.5, 2.6, 1.5, '~');

  put(9, 3, 'D'); put(10, 3, 'D');
  put(9, 6, '1'); put(12, 6, '2');
  // A – Einfahrt
  put(5, 5, 'Q'); put(14, 5, 'W'); put(5, 10, 'B'); put(14, 10, 's'); put(4, 8, 'j'); put(15, 8, 'Q');
  // B – Gießerei: Tiegel auf dem Gießstand, Ambosse auf dem Arbeitsboden
  put(23, 4, 'U'); put(30, 4, 'U'); put(37, 4, 'U'); put(32, 3, 'E'); put(39, 4, 'B'); put(21, 4, 'B');
  put(24, 9, 'N'); put(30, 9, 'N'); put(37, 9, 'N'); put(22, 11, 'p'); put(40, 11, 'p');
  put(27, 8, 'a'); put(36, 4, 'a'); put(33, 10, 'f'); put(28, 11, 'r'); put(40, 3, 'C');
  // H – Hauptschmiedehalle
  [[23, 18], [42, 18], [23, 33], [42, 33], [29, 22], [36, 22]].forEach(([x, y]) => put(x, y, 'I'));
  put(28, 31, 'N'); put(37, 31, 'N'); put(32, 34, 'N'); put(30, 28, 'U'); put(35, 28, 'U');
  put(21, 21, 'B'); put(44, 21, 'B'); put(21, 30, 'j'); put(44, 34, 'j'); put(26, 15, 'p'); put(39, 15, 'p'); put(44, 27, 'E');
  put(27, 19, 'r'); put(39, 20, 'r'); put(36, 33, 'r'); put(41, 29, 'a'); put(30, 17, 'h');
  // C – Erzlager
  put(5, 20, 'Q'); put(14, 21, 'Q'); put(4, 26, 's'); put(14, 25, 's'); put(6, 31, 'Q'); put(12, 32, 's'); put(9, 24, 'j');
  put(5, 24, 'B'); put(13, 23, 'B');
  put(7, 22, 'h'); put(12, 27, 'h'); put(6, 28, 'f'); put(11, 21, 'r'); put(4, 29, 'C');
  // S – Schlackenhalde
  put(19, 46, 's'); put(20, 50, 's'); put(36, 48, 's'); put(33, 52, 's'); put(23, 53, 'Q'); put(30, 44, 'Q');
  put(19, 48, 'B'); put(35, 51, 'B');
  put(27, 46, 'r'); put(33, 49, 'r'); put(22, 48, 'f'); put(28, 54, 'C');
  // E – Halle des Wächters
  [[49, 6], [59, 6], [49, 16], [59, 16]].forEach(([x, y]) => put(x, y, 'I'));
  put(52, 4, 'E'); put(56, 4, 'E'); put(54, 4, 'B'); put(47, 8, 'W'); put(61, 8, 'W'); put(47, 14, 'W'); put(61, 14, 'W');
  put(54, 11, '8'); put(51, 15, 'f'); put(58, 14, 'a'); put(61, 16, 'C');
  // F – Vorhalle
  put(49, 24, 'B'); put(58, 24, 'B'); put(51, 33, 'p'); put(57, 33, 'j'); put(54, 25, 'E');
  put(52, 28, 'r'); put(56, 30, 'f'); put(59, 33, 'C');
  for (let x = 51; x <= 54; x++) put(x, 39, 'G');
  // G – Schmelzkammer
  [[45, 43], [58, 43], [45, 51], [58, 51]].forEach(([x, y]) => put(x, y, 'I'));
  put(42, 41, 'B'); put(61, 41, 'B'); put(43, 54, 'B'); put(60, 54, 'B');
  put(49, 53, 'U'); put(55, 53, 'U'); put(52, 53, 'E'); put(48, 41, 'p'); put(56, 41, 'p');
  put(52, 46, '9'); put(52, 50, 'R'); put(44, 47, 's'); put(59, 47, 'j');
  // Verborgene Waffenkammer unter dem Erzlager (Hebel an der Nordwand)
  m.rect(3, 39, 11, 7, '.'); m.rect(8, 33, 2, 6, '.');
  put(8, 33, '$'); put(9, 33, '$');
  put(4, 38, 'T'); put(12, 38, 'T');
  put(8, 42, 'C'); put(4, 40, 'W'); put(12, 40, 'W'); put(4, 44, 'U'); put(13, 44, 's'); put(11, 43, 'f');
  // Flammendüsen (J nach rechts, L nach unten) und Druckplatten
  put(17, 6, 'L'); put(19, 6, 'L'); put(48, 30, 'J'); put(39, 24, 'L'); put(8, 36, '^'); put(9, 37, '^'); put(54, 20, '^'); put(24, 40, '^');

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
      { id: 'warden_hall', x: 46, y: 4, w: 17, h: 15 },
      { id: 'tyrant_throne', x: 48, y: 23, w: 14, h: 12 },
    ],
    arena: { x: 40, y: 40, w: 24, h: 17, gateRow: 39 },
    traps: { '^': { kind: 'spike' }, J: { kind: 'jet', dir: [1, 0], len: 64 }, L: { kind: 'jet', dir: [0, 1], len: 40 } },
    trapDamage: 32,
    secrets: [{ id: 'forge_armory', lever: { x: 13, y: 20 } }],
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
