import { skyMap, isle, bridge, pier, ISLAND } from './kit.js';
import { FW, SPECIAL, houseAnchor, houseDoor } from '../../sprites/decor_altstadt.js';

// ---------------------------------------------------------------- Sternhafen (Hauptstadt der Sternenscherben)
// Mittelalterliche Fachwerk-Altstadt auf der größten Scherbe. Häuser stehen Wand an Wand an den Nordseiten der
// Gassen (Draufsicht 3/4: man sieht nur die Schauseiten nach Süden), dahinter liegt die Dachlandschaft der Hinterhäuser
// (feste Kacheln '#', von ramparts.js als Dächer gemalt). Schmale Durchgänge verbinden die Gassen.
// Von Nord nach Süd:
//  - Burg der Fürstin Amarys (Nordrand, Mitte), westlich auf eigener Scherbe der Sternturm, nordöstlich das
//    versiegelte Tor mit der Lichtbrücke (öffnet sich mit Teil 2).
//  - Burggasse mit Burgvorplatz (Arenameisterin Sora), Burgstraße hinunter zum
//  - Ankerplatz: Ankerbrunnen, Sternentor zurück in die Glutöde (West), Wegstein (Ost), Auftragsbrett, Sternbank.
//    Am Platz das Gasthaus „Zum Fallenden Stern“ und die Bibliothek; östlich in der Mittelgasse Krämer und Juwelierin.
//  - Schmiedegasse (Südwest): Schmiede und Rüstkammer. Torplatz mit Südtor und Brücke in die Splitterweiten,
//    Sternstall mit Koppel (Südost), Luftschiffsteg (Südwest). West: Lichtbrücke in die Treibenden Gärten.
// Begehbare Häuser: level.interiors (Tür außen, Raum im dunklen Bereich östlich der Stadt, Ankunft, Ausgang; Kacheln).
// Die Questgeber stehen teils drinnen. Zeichen: Gras ',', Pflaster ':', Abgrund '_', Brücke '+', Mauer/Dach '#'.

// Stadt x 10–98 (mit Mauer), östlich davon Himmel; ab DX der dunkle Bereich der Innenräume. Die Räume liegen so weit
// auseinander (und von der Stadt entfernt), dass das Handybild (gut 36 × 17 Kacheln) immer nur einen zeigt.
const DX = 112, W = 212, H0 = 80, PAD = 10;

// Zeichen der Häuser: Bürgerhäuser A–N (fw0–fw13), Häuser der Questgeber P–U
const GEN = FW.map((o, i) => ({ ch: String.fromCharCode(65 + i), o }));
const SP = { hInn: 'P', hSmithy: 'Q', hShop: 'R', hJewel: 'S', hArmory: 'T', hLibrary: 'U' };
const ORDER = [0, 5, 9, 3, 12, 2, 7, 4, 10, 13, 1, 8, 6, 11];

export function buildSternhafen() {
  const m = skyMap(W, H0);
  const put = (x, y, ch) => m.set(x, y, ch);
  const floors = [], rooms = [], dark = [], roofs = [], interiors = [];
  const lane = (x, y, w, h, k = 'cobble') => { m.rect(x, y, w, h, ':'); floors.push({ r: [x, y, w, h], k }); };
  const block = (x, y, w, h) => { m.rect(x, y, w, h, '#'); roofs.push([x, y, w, h]); };

  // ------------------------------------------------------------ Inseln
  m.rect(10, 5, 89, 64, ',');                         // Stadtscherbe
  m.rect(39, 5, 23, 8, '_');                          // hinter der Burg: Himmel
  isle(m, 5, 16, 4.6, 3.4, 5101, { wob: 0.08 });      // Sternturm-Scherbe
  m.rect(81, 5, 6, 11, '_'); m.rect(82, 7, 5, 9, ','); // Brückenkopf hinter dem versiegelten Tor
  isle(m, 88, 72, 7.5, 3.4, 5102, { wob: 0.06 });     // Koppel
  m.rect(81, 69, 15, 2, ',');

  // ------------------------------------------------------------ Dachlandschaft und Gassen
  block(12, 5, 27, 11); block(62, 5, 19, 11); block(87, 5, 10, 11);  // hinter Zeile 0
  block(12, 21, 85, 12);                               // hinter Zeile 1
  block(12, 37, 26, 12); block(63, 37, 34, 12);        // hinter Zeile 2 (Mitte: Ankerplatz)
  block(12, 53, 85, 10);                               // hinter Zeile 3
  m.rect(12, 16, 85, 1, '#'); m.rect(12, 33, 85, 1, '#'); m.rect(12, 49, 85, 1, '#'); m.rect(12, 63, 85, 1, '#');
  roofs.push([12, 16, 85, 1], [12, 33, 85, 1], [12, 49, 85, 1], [12, 63, 85, 1]);
  m.rect(39, 13, 23, 4, ',');                          // Burggrund (unzugänglich, die Burg steht darauf)
  m.rect(81, 16, 7, 1, '#'); m.rect(87, 16, 1, 1, '#');
  lane(12, 17, 85, 4);                                 // Burggasse
  lane(12, 34, 85, 3);                                 // Mittelgasse
  lane(38, 37, 25, 13);                                // Ankerplatz
  lane(12, 50, 85, 3);                                 // Schmiedegasse
  lane(12, 64, 85, 3);                                 // Torplatz
  for (const [x, w] of [[22, 2], [48, 5], [77, 2]]) { lane(x, 21, w, 12); lane(x, 53, w, 10); }   // Durchgänge
  for (const [x, w] of [[22, 2], [77, 2]]) lane(x, 37, w, 12);
  for (const x of [22, 23, 48, 49, 50, 51, 52, 77, 78]) { put(x, 33, ':'); put(x, 63, ':'); }
  for (const x of [22, 23, 77, 78]) put(x, 49, ':');
  lane(83, 8, 3, 8); put(83, 16, ':'); put(84, 16, ':'); put(85, 16, ':');   // hinter dem Siegeltor
  // Stadtmauer: Ost- und Westmauer von oben (Krone mit Zinnen), Südmauer mit Außenseite; Durchlässe für Brücken,
  // Südtor, Luftschiffsteg und Koppel
  m.rect(10, 5, 2, 64, '#'); m.rect(97, 5, 2, 64, '#'); m.rect(10, 67, 89, 2, '#');
  lane(10, 34, 2, 3); lane(10, 17, 2, 3); lane(48, 67, 4, 2); lane(26, 67, 2, 2); lane(85, 67, 2, 2);

  // ------------------------------------------------------------ Brücken und Steg
  bridge(m, [[0, 35], [10, 35]], 3, 'light');         // Lichtbrücke aus den Gärten
  bridge(m, [[9, 18], [10, 18]], 3, 'stone');         // zum Sternturm
  bridge(m, [[84, 0], [84, 8]], 3, 'light');          // versiegelte Lichtbrücke (Teil 2)
  bridge(m, [[50, 69], [50, H0]], 3, 'stone');        // in die Splitterweiten
  const dock = pier(m, 26, 69, 6, [0, 1]);

  // ------------------------------------------------------------ Häuserzeilen
  // Bürgerhäuser füllen einen Abschnitt lückenlos (Varianten im Wechsel, jedes dritte springt eine Kachel zurück);
  // Häuser der Questgeber stehen an festen Stellen und bekommen eine Tür zu ihrem Innenraum.
  let gi = 0, nth = 0;
  const doors = {};
  const place = (ch, o, s, y, jog = false) => {
    const tx = houseAnchor(o, s), n = o.w / 16;
    if (jog) { for (let x = s; x < s + n; x++) put(x, y, ':'); put(tx, y - 1, ch); } else put(tx, y, ch);
    return { x: houseDoor(o, s), y: jog ? y - 1 : y };
  };
  const fill = (y, x0, x1) => {
    let x = x0;
    while (x <= x1) {
      const left = x1 - x + 1;
      let g = null;
      for (let k = 0; k < ORDER.length; k++) {
        const c = GEN[ORDER[(gi + k) % ORDER.length]], r = left - c.o.w / 16;
        if (r === 0 || r >= 4) { g = c; gi = (gi + k + 1) % ORDER.length; break; }
      }
      if (!g) break;
      place(g.ch, g.o, x, y, nth++ % 3 === 1);
      x += g.o.w / 16;
    }
  };
  const special = (key, s, y) => { doors[key] = place(SP[key], SPECIAL[key], s, y); };
  // Zeile 0 (Burggasse)
  fill(16, 13, 38); fill(16, 62, 80); fill(16, 88, 95);
  // Zeile 1 (Mittelgasse und Nordrand des Ankerplatzes)
  fill(33, 13, 21); fill(33, 24, 37); special('hInn', 38, 33);
  special('hLibrary', 53, 33); fill(33, 59, 65); special('hShop', 66, 33); special('hJewel', 72, 33);
  fill(33, 79, 95);
  // Zeile 2 (Schmiedegasse)
  fill(49, 13, 21); special('hSmithy', 24, 49); special('hArmory', 31, 49); fill(49, 63, 76); fill(49, 79, 95);
  // Zeile 3 (Torplatz), Sternstall am Ostende
  fill(63, 13, 21); fill(63, 24, 47); fill(63, 53, 76); fill(63, 79, 83);
  put(89, 63, 'X');

  // ------------------------------------------------------------ Burg, Turm, Tore
  put(50, 16, 'V');                                    // Burg (Tor zum Thronsaal)
  put(5, 16, 'W');                                     // Sternturm
  put(81, 16, 'z'); put(86, 16, 'Z');                  // versiegeltes Tor (Bogen über 83–85)
  put(47, 68, 'Y'); put(52, 68, 'Z');                  // Südtor in der Mauer
  put(dock[0], dock[1], 'd');                          // Luftschiff am Steg

  // ------------------------------------------------------------ Ankerplatz
  put(50, 43, 'o');                                    // Ankerbrunnen
  put(40, 41, 'g');                                    // Sternentor (Glutöde)
  const waystone = { x: 60, y: 41 };
  put(60, 43, '5');
  put(41, 44, '1'); put(50, 47, '2'); put(13, 35, '3'); put(50, 66, '4');
  const board = { x: 45, y: 38 };
  const vault = { x: 57, y: 38 };
  for (const [x, y] of [[44, 47], [56, 47]]) put(x, y, '$');
  for (const [x, y] of [[38, 37], [62, 37], [38, 49], [62, 49]]) put(x, y, '%');
  for (const [x, y] of [[47, 40], [53, 40]]) put(x, y, 'y');

  // ------------------------------------------------------------ Gassenleben (dezent)
  const life = [
    // Burggasse: Pflanzkästen, Laternen, Banner am Burgtor, Bänke
    [44, 17, 's'], [56, 17, 's'], [16, 17, 'y'], [30, 17, 'y'], [67, 17, 'y'], [92, 17, 'y'], [26, 20, '%'], [72, 20, '%'], [36, 20, '!'], [64, 20, '!'],
    // Mittelgasse
    [15, 37 - 1, '?'], [18, 34, 'f'], [33, 34, 'y'], [68, 36, '$'], [86, 34, 'f'], [93, 36, '&'], [28, 36, '%'], [82, 36, '%'],
    // Schmiedegasse
    [21, 50, '^'], [33, 52, '*'], [37, 50, '&'], [66, 50, 'y'], [74, 52, '%'], [86, 50, 'f'], [16, 52, '%'], [92, 52, '!'],
    // Torplatz
    [14, 64, 'f'], [30, 66, '%'], [45, 66, '%'], [55, 66, '%'], [60, 64, 'y'], [70, 66, '!'], [40, 64, '&'],
  ];
  for (const [x, y, c] of life) put(x, y, c);
  // Koppel südlich vom Torplatz
  for (let x = 82; x <= 94; x++) { put(x, 70, '-'); put(x, 74, '-'); }
  for (let y = 71; y <= 73; y++) { put(82, y, '|'); put(94, y, '|'); }
  put(85, 70, ':'); put(86, 70, ':');
  put(90, 72, '<');

  // ------------------------------------------------------------ Figuren draußen
  put(42, 43, ']');                                    // Hauptmann Halvard am Sternentor
  put(53, 46, '/');                                    // Ausrufer Fenn
  put(45, 19, '{');                                    // Arenameisterin Sora vor der Burg
  put(86, 65, '}');                                    // Stallmeister Corvin

  // ------------------------------------------------------------ Innenräume (dunkler Bereich im Osten)
  m.rect(DX, 0, W - DX, H0, '#'); dark.push([DX, 0, W - DX, H0]);
  const room = (id, name, door, x, y, w, h, s, win, furn, rug = null) => {
    m.rect(x + 1, y + 3, w - 2, h - 4, ':');
    const ex = x + Math.floor(w / 2);
    put(ex, y + h - 1, ':');
    rooms.push({ r: [x, y, w, h], s, win: win.map((k) => x + k), rug: rug && [x + rug[0], y + rug[1], rug[2], rug[3]] });
    for (const [dx, dy, c] of furn) put(x + dx, y + dy, c);
    interiors.push({ id, name, door: { ...door }, room: { x, y, w, h }, spawn: { x: ex, y: y + h - 2 }, exit: { x: ex, y: y + h - 1 } });
  };
  // Möbel: a Tisch, b Bett, c Kamin, e Schrank, f Fässer, h Hocker, i Säcke, j Truhe, k Pflanze, l Theke, m Zapffässer,
  // n Amboss, p Esse, q Waffenständer, r Thron, s Banner, t Fernrohr, u Bücherregal, v Schreibpult, w Vitrine, x Rüstung
  room('thronsaal', 'Thronsaal', { x: 50, y: 16 }, 132, 2, 21, 12, 'B', [3, 17],
    [[10, 3, 'r'], [7, 3, 's'], [13, 3, 's'], [2, 4, 'x'], [18, 4, 'x'], [1, 9, 'k'], [19, 9, 'k'], [10, 5, '6']], [9, 4, 3, 7]);
  room('gasthaus', 'Zum Fallenden Stern', doors.hInn, 132, 23, 19, 10, 'A', [3, 15],
    [[6, 4, 'l'], [15, 3, 'm'], [11, 3, 'c'], [5, 8, 'a'], [13, 8, 'a'], [7, 6, 'h'], [17, 7, 'f'], [1, 8, 'i'], [3, 3, 'e'], [6, 3, '7']]);
  room('bibliothek', 'Bibliothek', doors.hLibrary, 132, 44, 13, 10, 'C', [6],
    [[1, 3, 'u'], [3, 3, 'u'], [9, 3, 'u'], [11, 3, 'u'], [6, 6, 'v'], [11, 8, 'k'], [1, 8, 'j'], [6, 5, ')']]);
  room('sternturm', 'Sternturm', { x: 5, y: 16 }, 132, 65, 11, 10, 'B', [5],
    [[5, 4, 't'], [8, 3, 'u'], [2, 7, 'v'], [9, 8, 'j'], [1, 3, 'k'], [3, 6, '[']]);
  room('schmiede', 'Schmiede', doors.hSmithy, 172, 2, 13, 10, 'A', [3, 9],
    [[6, 3, 'p'], [6, 7, 'n'], [10, 3, 'q'], [2, 4, 'f'], [10, 8, 'i'], [1, 8, 'j'], [4, 7, '(']]);
  room('kraemer', 'Krämerladen', doors.hShop, 172, 23, 13, 9, 'A', [6],
    [[6, 4, 'l'], [2, 3, 'e'], [10, 3, 'e'], [11, 7, 'f'], [1, 7, 'i'], [8, 7, 'm'], [6, 3, '8']]);
  room('juwelier', 'Juwelierstube', doors.hJewel, 172, 44, 11, 9, 'C', [5],
    [[3, 5, 'w'], [7, 5, 'w'], [5, 3, 'e'], [9, 7, 'j'], [1, 7, 'k'], [5, 4, '9']]);
  room('ruestkammer', 'Rüstkammer', doors.hArmory, 172, 65, 13, 9, 'B', [6],
    [[2, 3, 'q'], [10, 3, 'q'], [5, 3, 'x'], [7, 3, 'x'], [11, 7, 'j'], [1, 7, 'f'], [6, 5, '0']]);

  const decor = {
    V: 'castle', W: 'starTowerM', X: 'stableM', Y: 'gateL', Z: 'gateR', z: 'gateSealed', o: 'anchorWell', g: 'starGate', d: 'airships',
    a: 'fTable', b: 'fBed', c: 'fHearth', e: 'fCupboard', f: 'fBarrels', h: 'fStool', i: 'fSacks', j: 'fChest', k: 'fPlant', l: 'fCounter',
    m: 'fKegs', n: 'fAnvil', p: 'fForge', q: 'fRack', r: 'fThrone', s: 'fBanner', t: 'fTelescope', u: 'fBooks', v: 'fDesk', w: 'fCase', x: 'fArmor',
    y: 'planters', '!': 'bench', '%': 'lamp', '&': 'crates', $: 'marketStall', '*': 'farmCart', '^': 'woodpile', '?': 'signpost', '<': 'haystack',
    '-': 'paddockH', '|': 'paddockV',
  };
  GEN.forEach((g, i) => { decor[g.ch] = 'fw' + i; });
  for (const [k, ch] of Object.entries(SP)) decor[ch] = k;

  return shiftY({
    name: 'Sternhafen',
    kind: 'outdoor',
    biome: 'astral',
    sky: 'morgen',
    island: ISLAND,
    decorSet: 'decor_altstadt',
    map: m.rows(),
    bridges: m.bridges ?? [],
    paintedCliffs: true,
    ramparts: { floors, rooms, dark, roofs, quays: true, stone: 'rubble' },
    interiors,
    solid: Object.keys(decor).join(''),
    decor,
    points: { 1: 'start', 2: 'respawn', 3: 'from_gardens', 4: 'from_splitterweiten', 5: 'waystone' },
    waystone,
    board,
    npcs: {
      6: 'lady_amarys', '[': 'seer_seraphe', ']': 'captain_halvard', '{': 'arena_master_sora', '(': 'smith_brunna', '}': 'stablemaster_corvin',
      7: 'innkeeper_mirela', 8: 'trader_lio', 9: 'jeweler_ysolde', 0: 'quartermaster_tamsin', '/': 'herald_fenn', ')': 'scholar_tobin',
    },
    enemies: {},
    areas: [
      { id: 'sternhafen_anker', name: 'Ankerplatz', x: 36, y: 21, w: 29, h: 32, noMount: true, town: true },
      { id: 'sternhafen_markt', name: 'Sternmarkt', x: 63, y: 21, w: 35, h: 32, noMount: true, town: true },
      { id: 'sternhafen_gassen', name: 'Schmiedegasse', x: 10, y: 21, w: 27, h: 47, noMount: true, town: true },
      { id: 'palace_heights', name: 'Palasthöhe', x: 34, y: 12, w: 32, h: 9, noMount: true },
      { id: 'star_tower', name: 'Sternturm', x: 0, y: 11, w: 13, h: 11, noMount: true },
      { id: 'star_stables', name: 'Sternställe', x: 78, y: 53, w: 20, h: 23 },
      { id: 'sealed_bridge', name: 'Versiegelte Brücke', x: 78, y: 5, w: 12, h: 16 },
    ],
    objects: [
      { id: 'sternhafen_vault', kind: 'bank', decor: 'starVault', prompt: 'Sternbank öffnen', ...vault },
      // Am Ankerbrunnen (Deko „o“): ohne eigenes Bild, nur der Punkt zum Berühren (Kapitel 9 und 10)
      { id: 'anchor_stone', kind: 'shrine', over: true, name: 'Ankerstein', prompt: 'Den Ankerstein berühren', x: 50, y: 44 },
    ],
    portals: [
      { id: 'to_ember_wastes', x: 40, y: 38.6, range: 26,
        to: { zoneId: 'ember_wastes', spawnId: 'from_sternhafen' }, prompt: 'Durch das Sternentor zurück in die Glutöde' },
      { id: 'to_gardens', x: 0.6, y: 35, range: 26, visual: 'road', dir: [-1, 0],
        to: { zoneId: 'drifting_gardens', spawnId: 'from_sternhafen' }, prompt: 'Über die Lichtbrücke in die Treibenden Gärten' },
      { id: 'to_splitterweiten', x: 50, y: H0 - 0.6, range: 26, visual: 'road', dir: [0, 1], requires: { level: 44 },
        to: { zoneId: 'splitterweiten', spawnId: 'from_sternhafen' }, prompt: 'Über die Brücke in die Splitterweiten' },
    ],
    signText: 'West: Treibende Gärten · Süd: Splitterweiten · Nord: Palast · Nordost: versiegelte Brücke',
  }, PAD);
}

// Leere Himmelszeilen oben (Burg und Turm ragen weit nach oben); verschiebt alle Kachelangaben. Der dunkle Bereich der
// Innenräume reicht bis zum oberen Rand.
function shiftY(L, n) {
  const W0 = L.map[0].length;
  L.map = [...Array.from({ length: n }, () => '_'.repeat(DX) + '#'.repeat(W0 - DX)), ...L.map];
  const sy = (o) => { if (o && typeof o.y === 'number') o.y += n; };
  [L.waystone, L.board, ...L.objects, ...L.portals].forEach(sy);
  for (const f of L.ramparts.floors) f.r[1] += n;
  for (const o of L.ramparts.rooms) { o.r[1] += n; if (o.rug) o.rug[1] += n; }
  for (const d of L.ramparts.roofs) d[1] += n;
  for (const d of L.ramparts.dark) { d[3] += d[1] + n; d[1] = 0; }
  for (const i of L.interiors) [i.door, i.room, i.spawn, i.exit].forEach(sy);
  for (const b of L.bridges) { if (b.h) { b.c0 += n; b.c1 += n; } else { b.a0 += n; b.a1 += n; } }
  for (const a of L.areas) a.y += n;
  return L;
}
