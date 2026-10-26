import { createRng, hash2 } from '../../core/math.js';
import { clearAround } from '../mapkit.js';
import { skyMap, isle, bridge, paths, wobble, freeAt, voidDist, rect, inRect, ISLAND } from './kit.js';

// ---------------------------------------------------------------- Sternhafen (Hauptstadt der Sternenscherben)
// 128 × 100 Kacheln. Weiße Perlsteinstadt auf der größten Scherbe, um den schwebenden Ankerstein gebaut. Kein
// Kampfgebiet: Händler, Handwerk, Questgeber, Wegstein, Auftragsbrett, Auktionshaus, Post und Gewandmeisterin.
// Viertel (vom Ankerplatz in der Mitte aus):
//  - Ankerplatz (Mitte): Ankerbrunnen, Sternentor zurück in die Glutöde (Westseite), Wegstein (Ostseite),
//    Hauptmann der Sternwacht empfängt Neuankömmlinge. Ausrufer.
//  - Palasthöhe (Nord): Prachtstraße über die Palastbrücke zum Palast der Fürstin Amarys, Arenameisterin im
//    Vorhof. Nordwestlich auf eigener Scherbe der Sternturm (Sternkundige Seraphe).
//  - Markt (Südost): Marktstände, Händler, Juwelierin, Sternbank; Auktionshaus, Post, Gewandmeisterin.
//  - Schmiedegasse (Südwest): Schmiede der Zwergin Brunna, Rüstmeister, Handwerkerhäuser.
//  - Gasthaus „Zum Fallenden Stern“ (Süd): Auftragsbrett, Wirtin; Treffpunkt für Gruppen und Söldner.
//  - Ställe (Ost): Sternstall mit Koppel, Stallmeister Corvin (Sternrösser).
//  - Brücken: West Lichtbrücke in die Treibenden Gärten, Süd (Brückentor) in die Splitterweiten,
//    Nordost die versiegelte Brücke (öffnet sich mit Teil 2).
// Zeichen: Gras ',', Sternsand '.', Pflaster ':', Abgrund '_', Brücke '+'.

const W = 128, H = 100;

export function buildSternhafen() {
  const m = skyMap(W, H);
  const rng = createRng(5101);
  const put = (x, y, ch) => m.set(Math.round(x), Math.round(y), ch);
  const get = (x, y) => m.get(x, y);
  const keepList = [];
  const keep = (f) => keepList.push(f);
  const kept = (x, y) => keepList.some((f) => f(x, y));

  // ------------------------------------------------------------ Inseln
  isle(m, 64, 52, 44, 30, 51, { wob: 0.08 });          // Stadtscherbe
  isle(m, 64, 10, 22, 8, 52, { wob: 0.1 });            // Palasthöhe
  isle(m, 30, 20, 9, 6, 53, { wob: 0.14 });            // Sternturm
  isle(m, 100, 36, 7, 4, 54, { wob: 0.1 });            // Brückenkopf Nordost
  isle(m, 40, 81, 7, 4, 55, { wob: 0.1 });             // Brückenkopf Süd
  isle(m, 18, 50, 5, 4, 56, { wob: 0.1 });             // Brückenkopf West
  isle(m, 11, 50, 7, 3.5, 57, { wob: 0.1 });           // Landzunge West (kurze Lichtbrücke zum Kartenrand)
  isle(m, 40, 90, 5, 5.5, 58, { wob: 0.1 });           // Landzunge Süd
  isle(m, 100, 15, 6, 10, 59, { wob: 0.12 });          // Wachtfels vor der versiegelten Brücke
  // Treibsteine mit Gärten (Tiefe, ohne Weg)
  const drift = [[112, 18, 5, 3], [10, 30, 4, 3], [116, 84, 6, 3], [12, 78, 5, 3], [86, 92, 4, 2], [92, 8, 3, 2], [8, 8, 3, 2], [120, 60, 3, 2]];
  drift.forEach(([x, y, rx, ry], i) => isle(m, x, y, rx, ry, 80 + i, { wob: 0.3 }));

  // ------------------------------------------------------------ Brücken
  bridge(m, [[0, 50], [6, 50]], 3, 'light');          // Lichtbrücke aus den Gärten
  bridge(m, [[32, 25], [32, 33]], 2, 'stone');         // zum Sternturm
  bridge(m, [[100, 25], [100, 33]], 3, 'light');       // versiegelte Lichtbrücke (Teil 2) zum Wachtfels, dahinter weiter
  bridge(m, [[100, 0], [100, 6]], 3, 'light');
  bridge(m, [[40, 95], [40, 100]], 3, 'stone');        // in die Splitterweiten

  // ------------------------------------------------------------ Straßen
  const net = paths(m);
  const { pave } = net;
  // Ankerplatz
  m.ellipse(64, 50, 12, 7.5, ':', [',', '.']);
  // Prachtstraße zum Palast über den Steindamm (fester Grat mit Felswänden), Palastvorhof
  m.path([[64, 26], [64, 16]], 5, ',', ['_']);
  pave([[64, 43], [64, 18]], 5);
  m.ellipse(64, 15, 12, 3, ':', [',', '.']);
  // Hauptstraßen
  pave([[5, 50], [52, 50]], 3);                        // Westtor → Platz
  pave([[76, 50], [92, 50]], 3);                       // Platz → Ställe
  pave([[64, 57], [64, 74]], 4);                       // Platz → Gasthaus
  pave([[40, 68], [40, 95]], 3);                       // Südtor
  // Gassen im Raster (Häuserzeilen entstehen unten an ihren Nordseiten)
  pave([[34, 31], [94, 31]], 2);                       // Nordgasse (quer über die Prachtstraße)
  pave([[28, 40], [61, 40]], 2);                       // Nordwest
  pave([[67, 40], [100, 40]], 2);                      // Nordost
  pave([[100, 40], [100, 35]], 3);                     // zur versiegelten Brücke
  pave([[24, 59], [61, 59]], 2);                       // Schmiedegasse
  pave([[26, 68], [61, 68]], 2);                       // Untere Gasse
  pave([[67, 59], [100, 59]], 2);                      // Marktgasse
  pave([[68, 77], [94, 77]], 2);                       // Südostgasse
  pave([[28, 40], [28, 50]], 2); pave([[86, 59], [86, 77]], 2);
  // Plätze der Viertel
  m.ellipse(84, 63, 8, 3.5, ':', [',', '.']);          // Markt
  m.ellipse(44, 60, 6, 2.5, ':', [',', '.']);          // Schmiedeplatz
  m.ellipse(64, 76, 9, 3, ':', [',', '.']);            // vor dem Gasthaus

  // ------------------------------------------------------------ Ankerplatz
  put(64, 50, 'O');                                    // Ankerbrunnen (Questziel: Objekt anchor_stone davor)
  put(55, 46, 'R');                                    // Sternentor (Glutöde)
  const waystone = { x: 73, y: 47 };
  put(73, 49, '5');
  put(55, 48, '1'); put(64, 56, '2');
  for (const [x, y] of [[57, 45], [71, 45], [57, 55], [71, 55]]) put(x, y, 'L');
  for (const [x, y] of [[60, 43], [68, 43]]) put(x, y, 'Y');
  for (const [x, y] of [[54, 54], [74, 53]]) put(x, y, 'T');
  put(60, 47, 'H');                                    // Hauptmann Halvard (empfängt am Tor)
  put(68, 54, 'r');                                    // Ausrufer Fenn
  put(76, 48, 'Q');                                    // Wegweiser
  keep(inRect(rect(50, 42, 28, 16)));

  // ------------------------------------------------------------ Palasthöhe
  put(64, 13, 'K');                                    // Palast
  put(66, 16, 'N');                                    // Fürstin Amarys
  put(55, 16, 'D');                                    // Arenameisterin Sora
  for (const [x, y] of [[59, 25], [69, 25], [59, 33], [69, 33], [59, 41], [69, 41]]) put(x, y, 'J');
  for (const [x, y] of [[60, 17], [68, 17]]) put(x, y, 'Y');
  for (const [x, y] of [[50, 16], [78, 16]]) put(x, y, 'T');
  keep(inRect(rect(44, 2, 40, 18)));
  // Sternturm
  put(30, 20, 'Z');
  put(33, 23, 'E');                                    // Seraphe
  put(24, 21, 's');                                    // Tobin, Marens Sohn (Nebenquest „Ein Brief für Maren“)
  put(27, 23, 'J');
  keep(inRect(rect(24, 14, 13, 12)));

  // ------------------------------------------------------------ Wohnviertel Nord (Bürgerhäuser an den Straßen)

  // ------------------------------------------------------------ Ställe (Ost)
  m.ellipse(97, 48, 6, 1.6, ':', [',', '.']);          // Stallhof
  put(98, 47, 'S');
  put(92, 47, 'V');                                    // Stallmeister Corvin
  // Koppel südlich des Stallhofs
  for (let x = 93; x <= 105; x++) { put(x, 50, 'f'); put(x, 57, 'f'); }
  for (let y = 51; y <= 56; y++) { put(93, y, 'j'); put(105, y, 'j'); }
  put(93, 51, ':'); put(93, 52, ':');                  // Gatter zur Straße
  keep(inRect(rect(92, 42, 15, 16)));

  // ------------------------------------------------------------ Markt (Südost)
  for (const [x, y] of [[78, 62], [84, 61], [90, 65], [80, 66]]) put(x, y, 'm');
  put(84, 64, 'M');                                    // Händler Lio
  put(76, 64, 'p');                                    // Juwelierin Ysolde
  const vault = { x: 92, y: 62 };                      // Sternbank (Tresor an der Hauswand)
  for (const [x, y] of [[74, 61], [94, 61]]) put(x, y, 'L');
  keep(inRect(rect(72, 60, 24, 8)));

  // ------------------------------------------------------------ Schmiedegasse (Südwest)
  put(44, 57, 'F');
  put(49, 60, 'G');                                    // Brunna
  put(38, 61, 'q');                                    // Rüstmeister Tamsin
  keep(inRect(rect(40, 51, 10, 7)));

  // ------------------------------------------------------------ Gasthaus (Süd)
  put(64, 74, 'I');
  const board = { x: 58, y: 76 };
  put(69, 76, 'W');                                    // Wirtin Mirela
  for (const [x, y] of [[54, 77], [74, 77]]) put(x, y, 'L');
  put(61, 78, 'n'); put(72, 78, 'n');
  keep(inRect(rect(52, 66, 24, 14)));

  // ------------------------------------------------------------ Tore und Brückenköpfe
  put(40, 82, 'U');                                    // Südtor
  put(40, 91, '4');
  put(100, 37, 'X');                                   // versiegelte Brücke
  for (const [x, y] of [[96, 37], [104, 37]]) put(x, y, 'Y');
  put(9, 50, '3');                                     // aus den Gärten
  for (const [x, y] of [[18, 47], [18, 53]]) put(x, y, 'Y');
  for (const [x, y] of [[23, 48], [23, 52], [37, 83], [43, 83]]) put(x, y, 'L');

  // ------------------------------------------------------------ Häuserzeilen
  // Bürgerhäuser an den Nordseiten der Straßen: Tür zur Straße, Fläche darüber frei (das Haus ragt ~5 Kacheln
  // hoch), Abstand zur Inselkante und zueinander. Nicht auf Palasthöhe und Sternturm.
  const vd0 = voidDist(m, 4);
  const houses = [];
  const noHouse = [inRect(rect(44, 0, 40, 27)), inRect(rect(20, 10, 20, 18)), inRect(rect(91, 41, 17, 18)), inRect(rect(50, 42, 28, 16)), inRect(rect(56, 69, 16, 10)), inRect(rect(38, 51, 12, 7))];
  const lot = (x, y) => {
    if (noHouse.some((f) => f(x, y))) return false;
    for (let j = -5; j <= 0; j++) for (let i = -2; i <= 2; i++) if (get(x + i, y + j) !== ',') return false;
    if (vd0(x, y - 3) < 2 || vd0(x, y) < 2) return false;
    // Tür zur Straße: direkt davor Pflaster, oder ein Vorgarten (eine Grasreihe) und dann Pflaster
    const front = (k) => [-1, 0, 1].every((i) => get(x + i, y + k) === ':');
    return front(1) || (front(2) && [-1, 0, 1].every((i) => get(x + i, y + 1) === ','));
  };
  for (let y = 28; y < H - 8; y++) for (let x = 20; x < W - 16; x++) {
    if (!lot(x, y) || houses.some(([a, b]) => Math.abs(a - x) < 6 && Math.abs(b - y) < 6)) continue;
    put(x, y, 'A'); houses.push([x, y]);
    keep(inRect(rect(x - 2, y - 5, 5, 6)));
  }

  // ------------------------------------------------------------ Grün: Blütenbäume, Büsche, Balustraden am Rand
  const vd = voidDist(m, 3);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (get(x, y) !== ',' || kept(x, y) || !freeAt(m, net, x, y)) continue;
    const d = vd(x, y), h = hash2(x, y, 5190);
    if (d === 1 && h < 0.18 && y > 30) put(x, y, 'b');        // Balustrade an der Südkante (Blick in den Himmel)
    else if (d < 2) { if (h < 0.06) put(x, y, 'B'); }
    else if (h < 0.035) put(x, y, 'e');
    else if (h < 0.06) put(x, y, 'B');
    else if (h < 0.068) put(x, y, 'k');
  }
  // Treibsteine: je ein Baum oder Kristall
  drift.forEach(([x, y], i) => put(x, y, i % 2 ? 'C' : 'e'));

  // Freiraum vor Türen, Toren und Questgebern
  const spots = [[64, 51], [55, 47], [55, 48], [64, 56], [73, 49], [9, 50], [40, 91], [40, 83], [64, 75], [58, 77], [66, 17], [55, 17], [33, 24], [92, 48], [84, 65], [49, 61], [100, 38], [24, 22],
    ...houses.map(([x, y]) => [x, y + 1])];
  clearAround(m, spots, 'eBkbnC', { r: 2, south: 2 });

  return {
    name: 'Sternhafen',
    kind: 'outdoor',
    biome: 'astral',
    sky: 'morgen',
    island: ISLAND,
    decorSet: 'decor_astral',
    map: m.rows(),
    bridges: m.bridges ?? [],
    solid: 'AIKZFSOURXmYTBCLJQkfjbne',
    decor: {
      A: 'starHouses', I: 'starInn', K: 'starPalace', Z: 'starTower', F: 'starForge', S: 'starStable', O: 'anchorWell',
      U: 'bridgeGate', X: 'sealedGate', R: 'starGate', m: 'starStalls', Y: 'starBanner', T: 'treePlanter', B: 'bushes',
      C: 'crystals', e: 'blossomTrees', L: 'lantern', J: 'starLamp', Q: 'signpost', k: 'flowerBoxes', f: 'paddockH', j: 'paddockV',
      b: 'balustrade', n: 'parkBench',
    },
    points: { 1: 'start', 2: 'respawn', 3: 'from_gardens', 4: 'from_splitterweiten', 5: 'waystone' },
    waystone,
    board,
    npcs: {
      N: 'lady_amarys', E: 'seer_seraphe', H: 'captain_halvard', D: 'arena_master_sora', G: 'smith_brunna', V: 'stablemaster_corvin',
      W: 'innkeeper_mirela', M: 'trader_lio', p: 'jeweler_ysolde', q: 'quartermaster_tamsin', r: 'herald_fenn', s: 'scholar_tobin',
    },
    enemies: {},
    areas: [
      { id: 'sternhafen_anker', name: 'Ankerplatz', x: 44, y: 26, w: 52, h: 30, noMount: true, town: true },
      { id: 'sternhafen_markt', name: 'Sternmarkt', x: 70, y: 56, w: 38, h: 24, noMount: true, town: true },
      { id: 'sternhafen_gassen', name: 'Schmiedegasse', x: 24, y: 56, w: 46, h: 26, noMount: true, town: true },
      { id: 'palace_heights', name: 'Palasthöhe', x: 40, y: 0, w: 48, h: 26, noMount: true },
      { id: 'star_tower', name: 'Sternturm', x: 20, y: 12, w: 20, h: 16, noMount: true },
      { id: 'star_stables', name: 'Sternställe', x: 90, y: 38, w: 18, h: 18 },
      { id: 'sealed_bridge', name: 'Versiegelte Brücke', x: 95, y: 30, w: 11, h: 9 },
    ],
    objects: [
      { id: 'sternhafen_vault', kind: 'bank', decor: 'starVault', prompt: 'Sternbank öffnen', ...vault },
      // Am Ankerbrunnen (Deko „O“): ohne eigenes Bild, nur der Punkt zum Berühren (Kapitel 9 und 10)
      { id: 'anchor_stone', kind: 'shrine', over: true, name: 'Ankerstein', prompt: 'Den Ankerstein berühren', x: 64, y: 51 },
    ],
    portals: [
      { id: 'to_ember_wastes', x: 55, y: 43.6, range: 26,
        to: { zoneId: 'ember_wastes', spawnId: 'from_sternhafen' }, prompt: 'Durch das Sternentor zurück in die Glutöde' },
      { id: 'to_gardens', x: 0.6, y: 50, range: 26, visual: 'road', dir: [-1, 0],
        to: { zoneId: 'drifting_gardens', spawnId: 'from_sternhafen' }, prompt: 'Über die Lichtbrücke in die Treibenden Gärten' },
      { id: 'to_splitterweiten', x: 40, y: 99.4, range: 26, visual: 'road', dir: [0, 1], requires: { level: 44 },
        to: { zoneId: 'splitterweiten', spawnId: 'from_sternhafen' }, prompt: 'Über die Brücke in die Splitterweiten' },
    ],
    signText: 'West: Treibende Gärten · Süd: Splitterweiten · Nord: Palast · Nordost: versiegelte Brücke',
  };
}
