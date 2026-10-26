import { createRng, hash2 } from '../../core/math.js';
import { GROUND, clearAround } from '../mapkit.js';
import { skyMap, isle, bridge, paths, wobble, freeAt, voidDist, rect, inRect, walkPath, ISLAND, VOID } from './kit.js';

// ---------------------------------------------------------------- Die Treibenden Gärten (40–45)
// 200 × 130 Kacheln. König Aurels verwilderte Gartenterrassen treiben als Inseln über dem Morgenhimmel; die Leere
// frisst sie von unten. Gliederung (Hauptquest läuft im Uhrzeigersinn, Nebenquests liegen am Weg):
//  - Ankerhain (Ost, Ankunft über die Lichtbrücke aus Sternhafen): große Insel um den Ankerbaum, dessen Wurzeln die
//    Gärten zusammenhalten. Gärtnerdorf Morgentau (Questknoten, Wegstein) am Platz unter dem Baum.
//  - Wurzelbruch (Mitte): zerbrochene Inselbrocken, nur über Wurzeln und Brücken verbunden; hier bricht die Leere durch.
//  - Hängende Terrassen (Nordwest): drei Gartenterrassen mit Perlsteintreppen, Säulengängen und Aurels Statue; am
//    Ende der obersten Terrasse das Tor zur Rankengruft (Dungeon 42–44), schon vom Ankerhain aus zu sehen.
//  - Mondweiher (Südwest): stille Weiherinsel mit Kristallen und kalten Sternlampen; im Süden die lange Brücke in
//    die Splitterweiten.
// Zeichen: Gras ',', Sternsand '.', Pflaster ':', Weiher '~', Abgrund '_', Brücke '+'.

const W = 200, H = 130;

export function buildDriftingGardens() {
  const m = skyMap(W, H);
  const rng = createRng(4401);
  const put = (x, y, ch) => m.set(Math.round(x), Math.round(y), ch);
  const get = (x, y) => m.get(x, y);
  const keepList = [];
  const keep = (f) => keepList.push(f);
  const kept = (x, y) => keepList.some((f) => f(x, y));
  const chests = [];

  // ------------------------------------------------------------ Inseln
  // Ankerhain: große Hauptinsel mit Nebeninseln, die zusammen eine Fläche bilden
  isle(m, 160, 62, 27, 21, 11, { wob: 0.18 });
  isle(m, 178, 48, 12, 9, 12);
  isle(m, 174, 80, 13, 9, 13);
  isle(m, 143, 46, 11, 8, 14);
  // Wurzelbruch: Brocken verschiedener Größe zwischen Ankerhain und dem Westen
  const shards = [[118, 62, 10, 7, 21], [104, 74, 8, 6, 22], [124, 82, 9, 6, 23], [108, 92, 11, 7, 24], [92, 60, 7, 5, 25], [130, 98, 7, 5, 26], [90, 84, 6, 4, 27], [117, 108, 8, 5, 28]];
  for (const [x, y, rx, ry, s] of shards) isle(m, x, y, rx, ry, s, { wob: 0.3 });
  // Hängende Terrassen: drei große Terrassen (Ost unten, Mitte, West oben) und Gartenlauben-Inseln
  isle(m, 96, 30, 17, 11, 31, { wob: 0.14 });
  isle(m, 66, 24, 18, 12, 32, { wob: 0.14 });
  isle(m, 34, 22, 17, 12, 33, { wob: 0.16 });
  isle(m, 116, 18, 7, 5, 34);
  isle(m, 52, 42, 6, 4, 35);
  // Mondweiher: runde Weiherinsel mit Buchten, im Osten eine Landzunge, im Süden der Brückenkopf
  isle(m, 52, 92, 26, 19, 41, { wob: 0.2 });
  isle(m, 78, 102, 10, 8, 42);
  isle(m, 36, 114, 10, 6, 43);
  isle(m, 22, 82, 8, 7, 44);
  // Treibsteine ohne Weg (Tiefe; einige tragen Kristalle oder einen Baum)
  const drift = [[140, 20, 4, 3], [186, 22, 5, 3], [190, 104, 4, 3], [150, 112, 6, 3], [70, 62, 4, 3], [10, 50, 4, 3], [12, 120, 5, 3], [100, 120, 4, 2], [160, 96, 3, 2], [80, 6, 4, 2], [130, 40, 3, 2], [196, 76, 3, 2]];
  drift.forEach(([x, y, rx, ry], i) => isle(m, x, y, rx, ry, 60 + i, { wob: 0.35 }));

  // ------------------------------------------------------------ Brücken (Trittsteine)
  bridge(m, [[200, 62], [186, 62]], 3);                       // aus Sternhafen
  bridge(m, [[133, 62], [127, 62]], 2);                       // Ankerhain → Wurzelbruch
  bridge(m, [[110, 66], [107, 69]], 2);
  bridge(m, [[110, 78], [117, 80]], 2);
  bridge(m, [[121, 88], [115, 90]], 2);
  bridge(m, [[100, 70], [95, 64]], 2);
  bridge(m, [[124, 90], [128, 94]], 2);
  bridge(m, [[112, 99], [116, 104]], 2);
  bridge(m, [[98, 90], [94, 87]], 2);
  bridge(m, [[95, 56], [96, 42]], 2);                         // Wurzelbruch → Terrassen
  bridge(m, [[150, 52], [148, 52]], 2);
  bridge(m, [[110, 24], [114, 20]], 2);
  bridge(m, [[80, 27], [83, 28]], 3);                         // Terrassen untereinander (zur Treppe s. u.)
  bridge(m, [[48, 22], [51, 23]], 3);
  bridge(m, [[56, 34], [53, 39]], 2);
  bridge(m, [[51, 45], [50, 74]], 2);                         // Terrassen → Mondweiher (lange Brücke)
  bridge(m, [[86, 86], [77, 88]], 2);                         // Wurzelbruch → Mondweiher
  bridge(m, [[76, 96], [77, 95]], 2);
  bridge(m, [[42, 108], [40, 110]], 2);
  bridge(m, [[29, 86], [31, 88]], 2);
  bridge(m, [[36, 119], [36, 130]], 3);                       // in die Splitterweiten
  // Wurzelbrücken: dünne Erdstege (Sand), wo Wurzeln die Brocken verbinden
  m.path([[112, 58], [111, 57]], 2, ',', [VOID]);

  // ------------------------------------------------------------ Wege
  const net = paths(m);
  const { sand, pave } = net;
  // Ankerhain: Pflaster vom Brückenkopf zum Dorfplatz, Sandwege zu den Brücken
  pave(wobble([[187, 62], [176, 61], [168, 60]], 1, 4402), 3);
  sand(wobble([[160, 60], [146, 62], [134, 62]], 1.2, 4403), 2);
  sand(wobble([[162, 64], [168, 74], [174, 82]], 1.5, 4404), 2);
  sand(wobble([[166, 56], [176, 48]], 1, 4405), 2);
  sand(wobble([[156, 56], [149, 52], [143, 47]], 1, 4406), 2);
  // Wurzelbruch: Sandpfade über die Brocken
  sand(wobble([[126, 62], [114, 62], [110, 66]], 1, 4411), 2);
  sand(wobble([[106, 70], [104, 76], [109, 78]], 1, 4412), 2);
  sand(wobble([[118, 80], [124, 84], [122, 88]], 1, 4413), 2);
  sand(wobble([[114, 90], [106, 92], [98, 90]], 1, 4414), 2);
  sand(wobble([[100, 70], [94, 62], [95, 56]], 1, 4415), 2);
  // Terrassen: Perlsteinwege mit Treppenabsätzen (Plätze), Säulengang auf der Mittelterrasse
  pave(wobble([[96, 42], [96, 32], [84, 28]], 0.6, 4421), 3);
  pave(wobble([[79, 27], [66, 25], [52, 23]], 0.6, 4422), 3);
  pave(wobble([[47, 22], [34, 21], [24, 17]], 0.6, 4423), 3);
  pave([[96, 30], [108, 24], [112, 22]], 2);
  sand(wobble([[60, 30], [56, 34]], 0.8, 4424), 2);
  // Mondweiher: Sandpfad um die Weiher, Pflaster am Brückenkopf
  sand(wobble([[50, 76], [48, 84], [40, 92], [42, 102], [52, 106], [64, 100], [66, 90], [58, 82], [50, 76]], 1.2, 4431), 2);
  sand(wobble([[66, 92], [76, 92], [78, 88]], 1, 4432), 2);
  sand(wobble([[40, 92], [30, 88]], 1, 4433), 2);
  pave(wobble([[44, 106], [38, 112], [36, 119]], 0.6, 4434), 3);

  // ------------------------------------------------------------ Gärtnerdorf Morgentau (Ankerhain)
  const village = rect(150, 50, 30, 22);
  m.ellipse(166, 60, 7, 4.5, ':', [',', '.']);
  // Ankerbaum nordwestlich des Platzes (Wahrzeichen, von weit zu sehen); Wurzeln fächern zum Rand
  put(156, 52, 'Y');
  for (const [x, y] of [[150, 56], [152, 47], [161, 48], [147, 50]]) put(x, y, 'X');
  keep(inRect(rect(149, 44, 14, 12)));
  // Dorfplatz: Brunnen-Laternen, Wegstein, Händler, Gärtner
  const waystone = { x: 170, y: 58 };
  put(170, 60, '5');
  for (const [x, y] of [[160, 57], [172, 57], [160, 63], [172, 63]]) put(x, y, 'L');
  put(164, 58, 'N');            // Hüterin Veyra (Hauptquest)
  put(168, 64, 'M');            // Händlerin
  put(176, 55, 'G');            // Gärtner Ben (Nebenquests)
  put(158, 66, 'H');            // Kräuterkundige
  put(174, 64, 'Q');            // Wegweiser
  // Gärtnerhäuschen (Lauben) und Beete rings um den Platz
  for (const [x, y] of [[154, 64], [178, 66], [180, 58], [152, 58]]) put(x, y, 'V');
  for (const [x, y] of [[156, 68], [162, 69], [176, 70], [182, 62]]) put(x, y, 'B');
  put(166, 61, '1'); put(166, 66, '2');
  put(185, 62, '3');             // aus Sternhafen
  keep(inRect(village));

  // ------------------------------------------------------------ Hängende Terrassen
  const tLow = rect(80, 19, 33, 22), tMid = rect(48, 12, 36, 24), tHigh = rect(17, 10, 34, 24);
  // Säulengänge entlang der Pflasterwege, Bögen an den Treppen
  for (let x = 58; x <= 76; x += 6) { put(x, 22, 'P'); put(x, 28, 'P'); }
  put(82, 27, 'U'); put(50, 22, 'U'); put(90, 36, 'u');
  // Aurels Statue auf der Mittelterrasse, Laternen ringsum
  m.ellipse(66, 25, 4.5, 3, ':', [',', '.']);
  put(66, 23, 'O');
  for (const [x, y] of [[61, 25], [71, 25]]) put(x, y, 'L');
  // zerfallene Mauern und Beete auf der unteren Terrasse
  for (const [x, y] of [[88, 22], [102, 34], [104, 26], [90, 34]]) put(x, y, 'W');
  // oberste Terrasse: Tor zur Rankengruft (von Ranken überwuchert)
  m.ellipse(23, 16, 5, 3.4, ':', [',', '.']);
  put(22, 13, 'Z');
  put(23, 19, '4');
  keep(inRect(rect(16, 9, 14, 12)));
  // Laube auf der Nebeninsel: Truhe
  chests.push({ x: 117, y: 17 });
  put(119, 16, 'T'); put(114, 16, 'B');
  chests.push({ x: 52, y: 42 });

  // ------------------------------------------------------------ Mondweiher
  m.ellipse(52, 92, 7, 4.5, '~', [',']);
  m.ellipse(44, 98, 3.5, 2.2, '~', [',']);
  m.ellipse(60, 96, 3, 2, '~', [',']);
  for (const [x, y] of [[46, 88], [58, 88], [62, 99], [47, 101], [38, 96]]) put(x, y, 'K');
  for (const [x, y] of [[50, 80], [56, 104], [64, 92], [42, 90]]) put(x, y, 'J');
  // Mondaltar (Questobjekt) am Nordufer
  const moonAltar = { x: 52, y: 85 };
  // Brückenkopf im Süden: Ruinentor
  put(36, 116, 'U');
  put(38, 112, '6');
  // Eremitin am Westufer
  put(26, 84, 'E');
  put(22, 80, 'T'); put(18, 84, 'K');
  chests.push({ x: 80, y: 104 });

  // ------------------------------------------------------------ Wurzelbruch
  // Wurzeln über die Brocken, Leerenrisse (Questobjekte) auf drei Brocken
  for (const [x, y] of [[116, 60], [104, 72], [126, 84], [110, 94], [92, 82], [128, 98], [120, 107]]) put(x, y, 'X');
  const rifts = [[120, 64], [106, 90], [130, 99]];

  // ------------------------------------------------------------ Streudeko
  const vd = voidDist(m, 4);
  const towns = [inRect(village, 2)];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (get(x, y) !== ',' || kept(x, y) || towns.some((f) => f(x, y)) || !freeAt(m, net, x, y)) continue;
    const d = vd(x, y), h = hash2(x, y, 4490), n = hash2(Math.floor(x / 6), Math.floor(y / 5), 4491);
    if (d < 2) { if (h < 0.05) put(x, y, 'B'); continue; }
    const inTerr = inRect(tLow)(x, y) || inRect(tMid)(x, y) || inRect(tHigh)(x, y);
    const inMoon = x < 84 && y > 70;
    if (n > 0.62 && h < 0.16 && d >= 3) put(x, y, 'T');                                 // Blütenhaine
    else if (h < 0.025) put(x, y, inMoon ? 'K' : 'B');
    else if (h < 0.037) put(x, y, 'R');
    else if (inTerr && h < 0.047) put(x, y, hash2(x, y, 4492) < 0.5 ? 'P' : 'W');
    else if (inMoon && h < 0.05) put(x, y, 'J');
  }

  // ------------------------------------------------------------ Gegner (Gruppen je Teilgebiet)
  const foes = [];
  const group = (cx, cy, list, r = 3) => {
    for (const ch of list) {
      for (let k = 0; k < 30; k++) {
        const x = Math.round(cx + rng.range(-r, r)), y = Math.round(cy + rng.range(-r, r));
        if (!freeAt(m, net, x, y) || towns.some((f) => f(x, y)) || foes.some(([a, b]) => Math.hypot(a - x, b - y) < 2.2)) continue;
        put(x, y, ch); foes.push([x, y]); break;
      }
    }
  };
  // Ankerhain-Rand (40–41): Blütenpirscher
  for (const [x, y] of [[140, 64], [146, 72], [158, 76], [170, 78], [178, 82], [180, 46], [172, 44], [140, 44], [150, 78], [186, 70]]) group(x, y, ['a', 'a'], 3);
  // Wurzelbruch (41–43): Leerenirrlichter, Wurzelgebundene, Rankenschrecken
  for (const [x, y] of [[118, 60], [104, 74], [124, 82], [108, 92], [92, 60], [130, 98], [90, 84], [117, 108]]) group(x, y, ['w', 'r', 'v'], 4);
  // Hängende Terrassen (42–44): Gartenwächter, Rankenschrecken
  for (const [x, y] of [[100, 26], [92, 34], [104, 32], [72, 18], [60, 18], [76, 30], [58, 30], [40, 26], [30, 26], [36, 16], [44, 18]]) group(x, y, ['g', 'v', 'v'], 4);
  // Mondweiher (44–45): Sternfalter, Blütenpirscher
  for (const [x, y] of [[40, 84], [62, 84], [68, 96], [56, 108], [38, 104], [48, 110], [74, 102], [32, 92]]) group(x, y, ['m', 'm', 'a'], 4);

  // Questziele der zweiten Runde: Veyras Schutzsteine im Ankerhain, Isells Lichtmoos im Wurzelbruch, Seraphes
  // Sternschnuppen auf Terrassen und am Weiher, Veyras Siegel an der letzten Narbe im Wurzelbruch (Verteidigung)
  const wardStones = [[148, 44], [136, 68], [171, 79]];
  const lightMoss = [[94, 57], [99, 71], [113, 91], [103, 95], [84, 97]];
  const fallenStars = [[27, 12], [45, 19], [56, 76], [34, 89]];
  const seal = [120, 81];

  // Freiraum um Marken und Portale
  const spots = [[166, 61], [166, 66], [185, 62], [164, 58], [168, 64], [176, 55], [158, 66], [22, 15], [36, 122], [199, 62], moonAltar.x ? [moonAltar.x, moonAltar.y] : null, ...rifts, ...wardStones, ...lightMoss, ...fallenStars, seal].filter(Boolean);
  clearAround(m, spots, 'TBKRPWJX', { r: 2, south: 3 });

  // ------------------------------------------------------------ Questziele (progression/questsStars.js)
  const SOLID = 'TBKLJPRWUuOQYXVZ';
  // Pells Saatbeutel: Ankerhain und Rand zum Wurzelbruch; Oddas Mondkristalle: Ufer, Weiherinsel, Landzunge
  const seedBags = [[141, 52], [150, 41], [182, 76], [132, 58]];
  const moonCrystals = [[45, 90], [59, 93], [52, 98], [80, 96]];
  // Eskorte „Brens Ableger“: vom Dorfplatz über die Wurzelbrücke zum ersten Leerenriss
  const escortPath = walkPath(m, SOLID, [175, 57], [118, 62]);
  const amb = (f) => Math.round((escortPath.length - 1) * f);

  return {
    name: 'Die Treibenden Gärten',
    kind: 'outdoor',
    biome: 'astral',
    sky: 'morgen',
    island: ISLAND,
    decorSet: 'decor_astral',
    map: m.rows(),
    solid: SOLID,
    decor: {
      T: 'blossomTrees', B: 'bushes', K: 'crystals', L: 'lantern', J: 'starLamp', P: 'ruinPillars', R: 'roseRocks',
      W: 'ruinWalls', U: 'ruinArch', u: 'ruinArchBroken', O: 'aurelStatue', Q: 'signpost', Y: 'anchorTree', X: 'roots',
      V: 'gardenHut', Z: 'vineGate',
    },
    points: { 1: 'start', 2: 'respawn', 3: 'from_sternhafen', 4: 'from_rankengruft', 5: 'waystone', 6: 'from_splitterweiten' },
    waystone,
    chests,
    npcs: { N: 'warden_veyra', M: 'trader_pell', G: 'gardener_bren', H: 'herbalist_isell', E: 'hermit_odda' },
    enemies: {
      a: { type: 'bloom_stalker' }, w: { type: 'void_wisp' }, r: { type: 'rootbound' }, v: { type: 'vine_horror' },
      g: { type: 'garden_golem' }, m: { type: 'star_moth' },
    },
    respawn: 45,
    areas: [
      { id: 'morgentau', name: 'Morgentau', ...village, noMount: true, town: true },
      { id: 'anchor_grove', name: 'Ankerhain', x: 132, y: 38, w: 60, h: 52 },
      { id: 'root_break', name: 'Wurzelbruch', x: 84, y: 52, w: 50, h: 62 },
      { id: 'hanging_terraces', name: 'Hängende Terrassen', x: 16, y: 6, w: 108, h: 40 },
      { id: 'moon_pond', name: 'Mondweiher', x: 14, y: 70, w: 76, h: 52 },
    ],
    objects: [
      { id: 'moon_altar', kind: 'shrine', decor: 'moonAltar', name: 'Mondaltar', prompt: 'Den Mondaltar berühren', ...moonAltar },
      ...rifts.map(([x, y], i) => ({ id: `void_rift_${i + 1}`, kind: 'shrine', decor: 'voidRift', name: 'Leerenriss', prompt: 'Den Leerenriss versiegeln', x, y })),
      ...seedBags.map(([x, y], i) => ({ id: `seed_bag_${i + 1}`, kind: 'item', set: 'decor_ashwood', decor: 'satchel', name: 'Saatbeutel', prompt: 'Saatbeutel aufheben', x, y })),
      ...moonCrystals.map(([x, y], i) => ({ id: `moon_crystal_${i + 1}`, kind: 'item', decor: 'crystals', name: 'Mondkristall', prompt: 'Mondkristall abbrechen', x, y })),
      ...wardStones.map(([x, y], i) => ({ id: `ward_stone_${i + 1}`, kind: 'shrine', set: 'decor_ashwood', decor: 'runeStone', name: 'Schutzstein', prompt: 'Das Schutzzeichen erneuern', x, y })),
      ...lightMoss.map(([x, y], i) => ({ id: `light_moss_${i + 1}`, kind: 'item', decor: 'bushes', name: 'Lichtmoos', prompt: 'Lichtmoos ernten', x, y })),
      ...fallenStars.map(([x, y], i) => ({ id: `fallen_star_${i + 1}`, kind: 'item', set: 'decor_shards', decor: 'shardRocks', name: 'Sternschnuppe', prompt: 'Die Sternschnuppe aufheben', x, y })),
      { id: 'veyra_seal', kind: 'shrine', set: 'decor_ashwood', decor: 'wardTotem', name: 'Veyras Siegel', prompt: 'Das Siegel setzen', x: seal[0], y: seal[1] },
    ],
    questRoutes: {
      escort_bren_cutting: {
        kind: 'escort',
        path: escortPath,
        clearPath: 5,
        ambush: [{ at: amb(0.4), type: 'bloom_stalker', n: 2 }, { at: amb(0.7), type: 'void_wisp', n: 2 }, { at: amb(0.9), type: 'rootbound', n: 2 }],
      },
      // q_veyra_last_seal: Veyra schließt die letzte Narbe im Wurzelbruch, Wurzelgebundene drängen aus der Leere
      defend_root_scar: { kind: 'defend', at: [119, 83], spawns: [[115, 80], [126, 79], [127, 86], [114, 86]], foe: 'rootbound', seconds: 90 },
    },
    portals: [
      { id: 'to_sternhafen', x: 199.4, y: 62, range: 26, visual: 'road', dir: [1, 0],
        to: { zoneId: 'sternhafen', spawnId: 'from_gardens' }, prompt: 'Über die Lichtbrücke nach Sternhafen' },
      { id: 'to_rankengruft', x: 22, y: 14.2, range: 24, requires: { level: 42 },
        to: { zoneId: 'rankengruft', spawnId: 'start' }, prompt: 'Die Rankengruft betreten' },
      { id: 'to_splitterweiten', x: 36, y: 129.4, range: 26, visual: 'road', dir: [0, 1], requires: { level: 44 },
        to: { zoneId: 'splitterweiten', spawnId: 'from_gardens' }, prompt: 'Über die Brücke in die Splitterweiten' },
    ],
    signText: 'Ost: Lichtbrücke nach Sternhafen · Nordwest: Hängende Terrassen und Rankengruft · Südwest: Mondweiher und Splitterweiten',
  };
}
