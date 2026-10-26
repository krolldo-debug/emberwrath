import { createRng, hash2 } from '../../core/math.js';
import { clearAround } from '../mapkit.js';
import { skyMap, isle, bridge, paths, wobble, freeAt, voidDist, rect, inRect, walkPath, ISLAND } from './kit.js';

// ---------------------------------------------------------------- Die Splitterweiten (45–50)
// 200 × 130 Kacheln. Wo Aurels Himmelsreich zerbrach: ein Feld aus Kristallscherben, kühles Glasmoos statt Gras.
// Gliederung (Hauptquest im Uhrzeigersinn von Nord nach Südost):
//  - Scherbenfeld (Nord, 45–46): viele kleine Scherbeninseln mit Kristallen, Ankunft über zwei Brücken (aus den
//    Gärten im Nordwesten, aus Sternhafen im Norden). Scherbenkriecher und irre Schürfer.
//  - Schürferlager Funkenruh (Mitte-West, Questknoten, Wegstein): Zelte, Loren, Förderkran am Inselrand.
//  - Singende Grate (Ost, 46–47): lange schmale Grate mit singenden Kristalltürmen; am Ende das Tor der Gläsernen
//    Hallen (Dungeon 46–48). Glaswächter und Prismenelementare.
//  - Spiegelsee (Südwest, 47–48): große Seeinsel mit Spiegelsteinen. Leerenhunde, Statuengeister, Schattenläufer.
//  - Sternwartenberg (Südost, 49–50): hohe Insel mit der Ruine der Sternwarte (Dungeon 49–50). Sternseher und
//    Splitterkolosse.
// Zeichen: Glasmoos ',', Sternsand '.', Pflaster ':', See '~', Abgrund '_', Brücke '+'.

const W = 200, H = 130;

export function buildSplitterweiten() {
  const m = skyMap(W, H);
  const rng = createRng(6101);
  const put = (x, y, ch) => m.set(Math.round(x), Math.round(y), ch);
  const get = (x, y) => m.get(x, y);
  const keepList = [];
  const keep = (f) => keepList.push(f);
  const kept = (x, y) => keepList.some((f) => f(x, y));
  const chests = [];

  // ------------------------------------------------------------ Inseln
  // Scherbenfeld: Ankunftsinseln und Scherben verschiedener Größe
  isle(m, 46, 16, 12, 8, 11, { wob: 0.2 });                 // Ankunft aus den Gärten
  isle(m, 118, 15, 13, 8, 12, { wob: 0.2 });                // Ankunft aus Sternhafen
  const shards = [[74, 18, 9, 6], [92, 26, 8, 5], [64, 32, 7, 5], [140, 22, 8, 6], [106, 36, 9, 6], [30, 34, 8, 6], [78, 41, 6, 4], [128, 38, 7, 5]];
  shards.forEach(([x, y, rx, ry], i) => isle(m, x, y, rx, ry, 20 + i, { wob: 0.3 }));
  // Funkenruh
  isle(m, 58, 58, 17, 11, 31, { wob: 0.12 });
  isle(m, 38, 54, 6, 4, 32);
  // Singende Grate: lange schmale Grate (je zwei überlappende Ellipsen), Torinsel im Nordosten
  const ridges = [[152, 46, 18, 4], [170, 58, 16, 4], [150, 70, 18, 4], [172, 84, 14, 4], [160, 34, 10, 3.5]];
  ridges.forEach(([x, y, rx, ry], i) => { isle(m, x - rx * 0.4, y - 1, rx * 0.7, ry, 40 + i, { wob: 0.15 }); isle(m, x + rx * 0.4, y + 1, rx * 0.7, ry, 45 + i, { wob: 0.15 }); });
  isle(m, 184, 28, 9, 7, 50, { wob: 0.12 });                // Tor der Gläsernen Hallen
  // Spiegelsee
  isle(m, 50, 100, 28, 17, 61, { wob: 0.14 });
  isle(m, 86, 112, 9, 6, 62);
  isle(m, 20, 86, 7, 5, 63);
  // Sternwartenberg
  isle(m, 146, 108, 22, 15, 71, { wob: 0.12 });
  isle(m, 118, 98, 8, 5, 72);
  isle(m, 112, 72, 9, 7, 73);                               // Zwischeninsel (Grate ↔ Berg ↔ Funkenruh)
  // Landzungen zu den Ausgängen (kurze Brücken zum Kartenrand)
  isle(m, 46, 6, 4.5, 3.5, 74, { wob: 0.1 });
  isle(m, 118, 6, 4.5, 3.5, 75, { wob: 0.1 });
  // Treibsteine (Tiefe)
  const drift = [[10, 12, 4, 3], [190, 8, 4, 2], [196, 110, 3, 2], [100, 124, 5, 2], [8, 120, 4, 3], [132, 60, 3, 2], [90, 80, 4, 2], [20, 64, 3, 2], [176, 122, 4, 2], [62, 6, 3, 2]];
  drift.forEach(([x, y, rx, ry], i) => isle(m, x, y, rx, ry, 90 + i, { wob: 0.35 }));

  // ------------------------------------------------------------ Brücken
  // Scherbenfeld Hängebrücken, Funkenruh und Spiegelsee Holz, zu Toren und Berg Stein
  bridge(m, [[46, 0], [46, 3]], 3, 'wood');                 // aus den Gärten
  bridge(m, [[118, 0], [118, 3]], 3, 'stone');              // aus Sternhafen
  bridge(m, [[57, 17], [66, 18]], 2, 'rope');
  bridge(m, [[82, 20], [86, 23]], 2, 'rope');
  bridge(m, [[100, 26], [106, 20]], 2, 'rope');
  bridge(m, [[131, 18], [133, 20]], 2, 'wood');
  bridge(m, [[95, 31], [101, 33]], 2, 'rope');
  bridge(m, [[114, 36], [122, 37]], 2, 'rope');
  bridge(m, [[66, 37], [64, 47]], 2, 'wood');               // Scherbenfeld → Funkenruh
  bridge(m, [[36, 40], [38, 50]], 2, 'wood');
  bridge(m, [[42, 22], [34, 29]], 2, 'rope');
  bridge(m, [[75, 44], [75, 54]], 2, 'rope');
  bridge(m, [[146, 27], [152, 32]], 2, 'stone');            // Scherbenfeld → Grate
  bridge(m, [[134, 41], [140, 44]], 2, 'rope');
  bridge(m, [[168, 33], [178, 30]], 2, 'stone');            // zur Torinsel
  bridge(m, [[164, 49], [166, 55]], 2, 'rope');             // Grate untereinander
  bridge(m, [[160, 61], [156, 67]], 2, 'rope');
  bridge(m, [[162, 73], [166, 81]], 2, 'rope');
  isle(m, 89, 67, 4, 3, 76, { wob: 0.2 });                 // Pfeilerinsel auf halbem Weg
  bridge(m, [[70, 67], [85, 67]], 2, 'wood');               // Funkenruh → Zwischeninsel
  bridge(m, [[93, 67], [104, 67]], 2, 'wood');
  bridge(m, [[120, 72], [138, 70]], 2, 'wood');             // Zwischeninsel → Grate
  bridge(m, [[112, 79], [116, 93]], 2, 'stone');            // Zwischeninsel → Berg
  bridge(m, [[125, 99], [130, 102]], 2, 'stone');
  bridge(m, [[54, 69], [52, 84]], 3, 'wood');               // Funkenruh → Spiegelsee
  bridge(m, [[77, 106], [80, 109]], 2, 'wood');
  bridge(m, [[26, 88], [28, 92]], 2, 'rope');
  bridge(m, [[94, 113], [126, 110]], 2, 'stone');           // Spiegelsee → Berg (lange Brücke)

  // ------------------------------------------------------------ Wege
  const net = paths(m);
  const { sand, pave } = net;
  sand(wobble([[46, 10], [48, 18], [58, 18]], 1, 6102), 2);
  sand(wobble([[118, 9], [116, 18], [106, 22]], 1, 6103), 2);
  sand(wobble([[66, 18], [76, 18], [84, 22]], 1, 6104), 2);
  sand(wobble([[88, 25], [96, 28], [100, 32]], 1, 6105), 2);
  sand(wobble([[102, 34], [108, 36], [114, 36]], 1, 6106), 2);
  sand(wobble([[64, 30], [66, 36]], 0.6, 6107), 2);
  sand(wobble([[132, 20], [140, 22], [146, 27]], 1, 6108), 2);
  // Funkenruh: Lagerplatz aus festgetretenem Sand, Wege zu den Brücken
  m.ellipse(58, 57, 9, 5.5, '.', [',']);
  sand(wobble([[64, 47], [62, 52]], 0.5, 6111), 2);
  sand(wobble([[50, 58], [40, 54]], 0.8, 6112), 2);
  sand(wobble([[66, 59], [75, 60]], 0.8, 6113), 2);
  sand(wobble([[56, 62], [54, 69]], 0.6, 6114), 2);
  sand(wobble([[64, 54], [72, 52]], 0.6, 6115), 2);
  // Grate: schmale Pfade entlang der Grate
  for (const [x, y, rx] of ridges) sand(wobble([[x - rx * 0.95, y - 1], [x + rx * 0.95, y + 1]], 0.6, 6120 + x), 1.6);
  sand(wobble([[178, 29], [184, 31]], 0.5, 6130), 2);
  // Spiegelsee: Uferweg
  sand(wobble([[52, 84], [44, 90], [32, 96], [34, 108], [50, 114], [66, 110], [72, 100], [62, 88], [52, 84]], 1.2, 6140), 2);
  sand(wobble([[66, 110], [77, 106]], 0.8, 6141), 2);
  sand(wobble([[32, 96], [27, 91]], 0.6, 6142), 2);
  // Sternwartenberg: Pflaster hinauf zur Sternwarte
  pave(wobble([[130, 103], [140, 106], [146, 100], [148, 96]], 0.6, 6150), 3);
  sand(wobble([[146, 106], [158, 112], [164, 106]], 1, 6151), 2);
  sand(wobble([[116, 93], [120, 98]], 0.5, 6152), 2);
  sand(wobble([[104, 70], [112, 72], [120, 72]], 0.8, 6153), 2);

  // ------------------------------------------------------------ Schürferlager Funkenruh
  const camp = rect(44, 48, 30, 20);
  const waystone = { x: 62, y: 55 };
  put(62, 57, '5');
  put(58, 57, 'F');                                         // Lagerfeuer
  put(56, 55, 'N');                                         // Vorarbeiterin Dagna (Hauptquest)
  put(53, 59, 'M');                                         // Händler Bosk
  put(65, 60, 'P');                                         // Schürfer Kel
  put(50, 55, 'C');                                         // Kartografin Mira
  const board = { x: 60, y: 61 };
  for (const [x, y] of [[48, 52], [54, 50], [68, 52], [70, 58], [48, 62], [62, 65]]) put(x, y, 'T');
  for (const [x, y] of [[52, 52], [66, 63], [46, 58]]) put(x, y, 'x');
  for (const [x, y] of [[72, 55], [50, 65]]) put(x, y, 'o');
  put(68, 56, 'l');                                         // Lore
  put(74, 62, 'D');                                         // Förderkran am Rand
  for (const [x, y] of [[57, 52], [61, 52], [55, 62]]) put(x, y, 'L');
  put(58, 60, '1'); put(60, 59, '2');
  keep(inRect(camp));

  // ------------------------------------------------------------ Scherbenfeld
  for (const [x, y] of shards) { put(x + 2, y - 1, 'K'); }
  for (const [x, y] of [[50, 12], [40, 18], [112, 12], [124, 18], [76, 15], [94, 23], [142, 19], [108, 33], [30, 31]]) put(x, y, 'c');
  put(46, 12, '3'); put(118, 11, '4');
  chests.push({ x: 82, y: 40 }, { x: 28, y: 36 });
  put(48, 20, 'Q'); put(116, 20, 'Q');

  // ------------------------------------------------------------ Singende Grate
  for (const [x, y, rx] of ridges) { put(x - rx * 0.55, y - 2, 'S'); put(x + rx * 0.6, y, 'S'); }
  put(184, 26, 'G');                                        // Tor der Gläsernen Hallen
  put(184, 30, '6');
  put(152, 44, 'E');                                        // Klangweise Lun
  keep(inRect(rect(178, 20, 13, 13)));
  chests.push({ x: 176, y: 86 });

  // ------------------------------------------------------------ Spiegelsee
  m.ellipse(50, 100, 13, 7, '~', [',']);
  m.ellipse(38, 104, 4, 2.5, '~', [',']);
  for (const [x, y] of [[58, 107], [44, 108]]) put(x, y, 'R');
  // Drei Spiegelsteine am Ufer sind Questobjekte (Kapitel 12): West, Ost, Nord
  const mirrorStones = [[40, 95], [62, 96], [50, 92]];
  put(30, 100, 'I');                                        // Spiegelhüterin Ilse
  for (const [x, y] of [[34, 98], [64, 104]]) put(x, y, 'J');
  chests.push({ x: 86, y: 112 }, { x: 20, y: 86 });

  // ------------------------------------------------------------ Sternwartenberg
  put(148, 98, 'O');                                        // Sternwarte (Dungeon)
  put(148, 102, '7');
  put(140, 103, 'A');                                       // Astronom Tovan
  // Aurels Linsen (Questobjekte, Reihenfolge West, Ost, Süd)
  const lenses = [[136, 104], [158, 104], [140, 112]];
  for (const [x, y] of [[144, 104], [152, 104]]) put(x, y, 'J');
  keep(inRect(rect(136, 88, 26, 16)));

  // ------------------------------------------------------------ Streudeko
  const vd = voidDist(m, 4);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (get(x, y) !== ',' || kept(x, y) || !freeAt(m, net, x, y)) continue;
    const d = vd(x, y), h = hash2(x, y, 6190), n = hash2(Math.floor(x / 6), Math.floor(y / 5), 6191);
    if (d < 2) { if (h < 0.05) put(x, y, 'k'); continue; }
    const inLake = x < 90 && y > 76, inRidge = x > 132 && y < 92, inMount = x > 112 && y > 90;
    if (n > 0.6 && h < 0.13 && d >= 3) put(x, y, 'g');                      // Glashaine
    else if (h < 0.025) put(x, y, inRidge ? 's' : 'c');
    else if (h < 0.045) put(x, y, 'k');
    else if (inLake && h < 0.055) put(x, y, 'R');
    else if (inMount && h < 0.052) put(x, y, 'k');
  }

  // ------------------------------------------------------------ Gegner
  const foes = [];
  const group = (cx, cy, list, r = 3) => {
    for (const ch of list) {
      for (let k = 0; k < 30; k++) {
        const x = Math.round(cx + rng.range(-r, r)), y = Math.round(cy + rng.range(-r, r));
        if (!freeAt(m, net, x, y) || kept(x, y) || foes.some(([a, b]) => Math.hypot(a - x, b - y) < 2.2)) continue;
        put(x, y, ch); foes.push([x, y]); break;
      }
    }
  };
  // Scherbenfeld (45–46): Scherbenkriecher, irre Schürfer
  for (const [x, y] of [[74, 20], [92, 27], [64, 32], [140, 24], [106, 38], [30, 36], [128, 39], [80, 16], [70, 34]]) group(x, y, ['a', 'a', 'b'], 3);
  // Singende Grate (46–47): Glaswächter, Prismenelementare
  for (const [x, y, rx] of ridges) { group(x - rx * 0.5, y, ['e', 'f'], 2); group(x + rx * 0.5, y, ['e', 'f', 'f'], 2); }
  group(182, 32, ['e', 'f'], 3);
  // Spiegelsee (47–48): Leerenhunde, Statuengeister, Schattenläufer
  for (const [x, y] of [[36, 92], [66, 92], [70, 106], [56, 114], [36, 110], [26, 100], [44, 88], [82, 112]]) group(x, y, ['h', 'w', 'r'], 4);
  // Sternwartenberg (49–50): Sternseher, Splitterkolosse
  for (const [x, y] of [[130, 108], [160, 114], [166, 104], [150, 118], [134, 116], [118, 98], [112, 72]]) group(x, y, ['t', 't', 'z'], 4);

  // Questziele der zweiten Runde: Bosks Kisten und die Krabblernester im Scherbenfeld, Luns Echosteine auf den Graten,
  // Kels Claimpfahl (Verteidigung) auf der Insel nördlich von Funkenruh, Harriks letztes Lager an der Ostkante
  const crates = [[42, 10], [96, 24], [126, 11], [116, 14]];
  const nests = [[53, 11], [69, 20], [110, 10], [35, 14]];
  const echoStones = [[149, 67], [166, 55], [182, 58]];
  const claimStake = [62, 30], harrikCamp = [133, 36];

  // Freiraum um Marken und Portale
  const spots = [[46, 12], [118, 11], [58, 60], [60, 59], [62, 57], [184, 30], [148, 102], [56, 56], [53, 60], [65, 61], [50, 56], [152, 45], [30, 101], [140, 104], [60, 62], ...mirrorStones, ...lenses, ...crates, ...nests, ...echoStones, claimStake, harrikCamp];
  clearAround(m, spots, 'gckRsabefhwrtz', { r: 2, south: 3 });
  // Eskorte „Miras Messgang“: von Funkenruh über die Westbrücken zur Westscherbe
  const SOLID = 'KSGOTxoDlLJYgcksRQF';
  const miraPath = walkPath(m, SOLID, [50, 57], [27, 34]);
  const amb = (f) => Math.round((miraPath.length - 1) * f);

  return {
    name: 'Die Splitterweiten',
    kind: 'outdoor',
    biome: 'shards',
    sky: 'morgen',
    island: ISLAND,
    decorSet: 'decor_shards',
    map: m.rows(),
    bridges: m.bridges ?? [],
    solid: SOLID,
    decor: {
      K: 'shardSpire', S: 'singingSpires', G: 'glassGate', O: 'observatory', T: 'prospectorTents', x: 'crateStack', o: 'oreHeaps',
      D: 'derrick', l: 'mineCart', L: 'lantern', J: 'starLamp', Y: 'lensStand', g: 'glassTrees', c: 'crystals', k: 'shardRocks',
      s: 'singingSpires', R: 'mirrorStones', Q: 'signpost', F: 'shardCampfire',
    },
    points: { 1: 'start', 2: 'respawn', 3: 'from_gardens', 4: 'from_sternhafen', 5: 'waystone', 6: 'from_glass_halls', 7: 'from_observatory' },
    waystone,
    board,
    chests,
    npcs: { N: 'foreman_dagna', M: 'trader_bosk', P: 'prospector_kel', C: 'cartographer_mira', E: 'echo_sage_lun', I: 'mirror_keeper_ilse', A: 'astronomer_tovan' },
    enemies: {
      a: { type: 'shard_crawler' }, b: { type: 'mad_prospector' }, e: { type: 'glass_sentinel' }, f: { type: 'prism_elemental' },
      h: { type: 'void_hound' }, w: { type: 'statue_wraith' }, r: { type: 'shadow_ranger' }, t: { type: 'star_seer' }, z: { type: 'splinter_colossus' },
    },
    respawn: 45,
    areas: [
      { id: 'funkenruh', name: 'Funkenruh', ...camp, noMount: true, town: true },
      { id: 'shard_field', name: 'Scherbenfeld', x: 18, y: 4, w: 136, h: 42 },
      { id: 'singing_ridges', name: 'Singende Grate', x: 132, y: 22, w: 66, h: 70 },
      { id: 'mirror_lake', name: 'Spiegelsee', x: 12, y: 78, w: 86, h: 46 },
      { id: 'observatory_hill', name: 'Sternwartenberg', x: 108, y: 88, w: 64, h: 38 },
      // Miras Vermessungspunkte (Nebenquest)
      { id: 'survey_west', name: 'Westscherbe', x: 22, y: 30, w: 10, h: 8 },
      { id: 'survey_arch', name: 'Gläserner Bogen', x: 98, y: 32, w: 12, h: 8 },
      { id: 'survey_east', name: 'Ostklippe', x: 134, y: 18, w: 12, h: 7 },
      { id: 'harrik_camp', name: 'Harriks Lager', x: harrikCamp[0] - 4, y: harrikCamp[1] - 4, w: 9, h: 8 },
    ],
    objects: [
      ...mirrorStones.map(([x, y], i) => ({ id: `mirror_stone_${i + 1}`, kind: 'shrine', decor: 'mirrorStones', name: 'Spiegelstein', prompt: 'Den Spiegelstein ausrichten', x, y })),
      ...lenses.map(([x, y], i) => ({ id: `star_lens_${i + 1}`, kind: 'shrine', decor: 'lensStand', name: 'Sternlinse', prompt: 'Die Linse ausrichten', x, y })),
      // Kels Schürferbeutel auf den Scherbeninseln
      ...[[67, 14], [88, 28], [63, 35], [124, 38]].map(([x, y], i) => ({ id: `prospector_pack_${i + 1}`, kind: 'item', set: 'decor_ashwood', decor: 'satchel', name: 'Schürferbeutel', prompt: 'Schürferbeutel aufheben', x, y })),
      ...crates.map(([x, y], i) => ({ id: `supply_crate_${i + 1}`, kind: 'item', decor: 'crateStack', name: 'Bosks Kiste', prompt: 'Die Kiste bergen', x, y })),
      ...nests.map(([x, y], i) => ({ id: `crawler_nest_${i + 1}`, kind: 'shrine', decor: 'oreHeaps', name: 'Krabblernest', prompt: 'Das Nest zerschlagen', x, y })),
      ...echoStones.map(([x, y], i) => ({ id: `echo_stone_${i + 1}`, kind: 'shrine', decor: 'singingSpires', name: 'Echostein', prompt: 'Den Echostein anschlagen', x, y })),
      { id: 'kel_claim_stake', kind: 'shrine', decor: 'mineCart', name: 'Kels Claimpfahl', prompt: 'Den Claim verteidigen', x: claimStake[0], y: claimStake[1] },
      { id: 'harrik_journal', kind: 'item', set: 'decor_ashwood', decor: 'satchel', name: 'Harriks Tagebuch', prompt: 'Das Tagebuch aufheben', x: harrikCamp[0], y: harrikCamp[1] },
    ],
    questRoutes: {
      // Kapitel 11 (q_ridge_song): Lun singt das Lied der Grate, Prismenelementare kommen über den Grat
      defend_ridge_song: { kind: 'defend', at: [152, 46], spawns: [[140, 45], [163, 46], [146, 43], [158, 43]], foe: 'prism_elemental', seconds: 90 },
      // q_kel_rival: Kel hält seinen Claim gegen die wahnsinnigen Schürfer
      defend_kel_claim: { kind: 'defend', at: [63, 32], spawns: [[59, 30], [69, 30], [60, 34], [68, 34]], foe: 'mad_prospector', seconds: 90 },
      // q_mira_escort: Mira vermisst die Westscherbe, Krabbler und Schürfer lauern auf den Scherben
      escort_mira_survey: {
        kind: 'escort',
        path: miraPath,
        clearPath: 5,
        ambush: [{ at: amb(0.35), type: 'shard_crawler', n: 2 }, { at: amb(0.65), type: 'mad_prospector', n: 2 }, { at: amb(0.9), type: 'shard_crawler', n: 3 }],
      },
    },
    portals: [
      { id: 'to_gardens', x: 46, y: 0.6, range: 26, visual: 'road', dir: [0, -1],
        to: { zoneId: 'drifting_gardens', spawnId: 'from_splitterweiten' }, prompt: 'Über die Brücke in die Treibenden Gärten' },
      { id: 'to_sternhafen', x: 118, y: 0.6, range: 26, visual: 'road', dir: [0, -1],
        to: { zoneId: 'sternhafen', spawnId: 'from_splitterweiten' }, prompt: 'Über die Brücke nach Sternhafen' },
      { id: 'to_glass_halls', x: 184, y: 27.4, range: 26, requires: { level: 46 },
        to: { zoneId: 'glass_halls', spawnId: 'start' }, prompt: 'Die Gläsernen Hallen betreten' },
      { id: 'to_observatory', x: 148, y: 99.4, range: 26, requires: { level: 49 },
        to: { zoneId: 'observatory', spawnId: 'start' }, prompt: 'Die Sternwarte betreten' },
    ],
    signText: 'Nord: Brücken nach Sternhafen und in die Gärten · Ost: Singende Grate · Süd: Spiegelsee · Südost: Sternwartenberg',
  };
}
