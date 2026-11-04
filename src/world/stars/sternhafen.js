import { skyMap, isle, bridge, pier, ISLAND, vn, voidDist, VOID } from './kit.js';
import { hash2 } from '../../core/math.js';
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

// Die Stadt wird in Stadtkoordinaten gebaut (Mauer x 10–98, y 5–68), danach um OX nach Osten geschoben; um die Mauer
// liegt ein zerklüfteter Inselrand (Buchten, Felsnasen, Sternkristalle) mit kleinen Begleitscherben, damit die Insel als
// Insel lesbar bleibt. Der Sternturm steht westlich davon auf eigener Scherbe. Ab DX (Stadtkoordinaten) der dunkle Bereich
// der Innenräume. Die Räume liegen so weit auseinander (und von der Stadt entfernt), dass das Handybild (gut 36 × 17
// Kacheln) immer nur einen zeigt.
const DX = 116, W = 212, H0 = 86, PAD = 10, OX = 10;

// Inselrand: Abstand zur Mauer je Seite in Kacheln, Wellenhöhe und -maßstab; Begleitscherben [x, y, rx, ry, seed] in
// Stadtkoordinaten; Streudeko [Zeichen, Dichte, Mindestabstand, Abstand zur Mauer, Abstand zur Kante, Gruppenschwelle]
const RIM = {
  margin: { w: 5, e: 5, s: 7, amp: 2.4, scale: 4.5, seed: 7303, taper: 5 },
  shards: [[-8, 48, 2.2, 1.6, 7311], [104, 26, 1.8, 1.4, 7312], [107, 52, 2.6, 1.8, 7313], [12, 80, 2, 1.5, 7314], [70, 81, 1.6, 1.2, 7315]],
  scatter: [['κ', 0.3, 4, 1, 1, 0.62], ['ρ', 0.35, 3, 1, 1, 0.45], ['β', 0.12, 4, 1, 1]],
  koppelY: 71,
};

// Zeichen der Häuser: Bürgerhäuser A–N (fw0–fw13), Häuser der Questgeber P–U
const GEN = FW.map((o, i) => ({ ch: String.fromCharCode(65 + i), o }));
const SP = { hInn: 'P', hSmithy: 'Q', hShop: 'R', hJewel: 'S', hArmory: 'T', hLibrary: 'U' };
const ORDER = [0, 5, 9, 3, 12, 2, 7, 4, 10, 13, 1, 8, 6, 11];

export function buildSternhafen() {
  const V = RIM;
  const m = skyMap(W, H0);
  const put = (x, y, ch) => m.set(x, y, ch);
  const floors = [], rooms = [], dark = [], roofs = [], interiors = [];
  // Gassen: Weg mit Grasrand (earth/gravel/worn, pw = Wegbreite in Kacheln), Pflaster nur am Ankerplatz und unter Toren
  const lane = (x, y, w, h, k = 'cobble', pw) => { m.rect(x, y, w, h, ':'); floors.push({ r: [x, y, w, h], k, pw }); };
  const block = (x, y, w, h) => { m.rect(x, y, w, h, '#'); roofs.push([x, y, w, h]); };

  // ------------------------------------------------------------ Inseln
  m.rect(10, 5, 89, 64, ',');                         // Stadtscherbe
  m.rect(39, 5, 23, 8, '_');                          // hinter der Burg: Himmel
  m.rect(81, 5, 6, 11, '_'); m.rect(82, 7, 5, 9, ','); // Brückenkopf hinter dem versiegelten Tor

  // ------------------------------------------------------------ Dachlandschaft und Gassen
  block(12, 5, 27, 11); block(62, 5, 19, 11); block(87, 5, 10, 11);  // hinter Zeile 0
  block(12, 21, 85, 12);                               // hinter Zeile 1
  block(12, 37, 26, 12); block(63, 37, 34, 12);        // hinter Zeile 2 (Mitte: Ankerplatz)
  block(12, 53, 85, 10);                               // hinter Zeile 3
  m.rect(12, 16, 85, 1, '#'); m.rect(12, 33, 85, 1, '#'); m.rect(12, 49, 85, 1, '#'); m.rect(12, 63, 85, 1, '#');
  roofs.push([12, 16, 85, 1], [12, 33, 85, 1], [12, 49, 85, 1], [12, 63, 85, 1]);
  m.rect(39, 13, 23, 4, ',');                          // Burggrund (unzugänglich, die Burg steht darauf)
  m.rect(81, 16, 7, 1, '#'); m.rect(87, 16, 1, 1, '#');
  lane(12, 17, 85, 4, 'gravel', 2.4);                  // Burggasse (Kies zur Burg)
  lane(12, 34, 85, 3, 'earth', 1.7);                   // Mittelgasse
  lane(38, 37, 25, 13);                                // Ankerplatz
  lane(12, 50, 85, 3, 'earth', 2.1);                   // Schmiedegasse
  lane(12, 64, 85, 3, 'worn', 2.3);                    // Torplatz (altes Pflaster)
  // Durchgänge: Weg über die ganze Breite, je eine Kachel in die Gassen hinein (liegt über deren Grasrand)
  const pass = (x, y, w, h, k) => { m.rect(x, y, w, h, ':'); floors.push({ r: [x, y - 1, w, h + 2], k, pw: w }); };
  for (const [x, w] of [[22, 2], [48, 5], [77, 2]]) { pass(x, 21, w, 12, w > 2 ? 'gravel' : 'earth'); pass(x, 53, w, 10, w > 2 ? 'worn' : 'earth'); }
  for (const [x, w] of [[22, 2], [77, 2]]) pass(x, 37, w, 12, 'earth');
  for (const x of [22, 23, 48, 49, 50, 51, 52, 77, 78]) { put(x, 33, ':'); put(x, 63, ':'); }
  for (const x of [22, 23, 77, 78]) put(x, 49, ':');
  lane(83, 8, 3, 8, 'gravel', 2); put(83, 16, ':'); put(84, 16, ':'); put(85, 16, ':');   // hinter dem Siegeltor
  // Stadtmauer: Ost- und Westmauer von oben (Krone mit Zinnen), Südmauer mit Außenseite; Durchlässe für Brücken,
  // Südtor, Luftschiffsteg und Koppel
  m.rect(10, 5, 2, 64, '#'); m.rect(97, 5, 2, 64, '#'); m.rect(10, 67, 89, 2, '#');
  lane(10, 34, 2, 3, 'earth', 1.7); lane(10, 17, 2, 3, 'gravel', 2.4); lane(48, 67, 4, 2); lane(26, 67, 2, 2, 'earth', 2); lane(85, 67, 2, 2, 'earth', 2);

  // ------------------------------------------------------------ Brücken und Steg
  bridge(m, [[84, 0], [84, 8]], 3, 'light');          // versiegelte Lichtbrücke (Teil 2)

  // ------------------------------------------------------------ Häuserzeilen
  // Bürgerhäuser füllen einen Abschnitt lückenlos (Varianten im Wechsel, jedes dritte springt eine Kachel zurück);
  // Häuser der Questgeber stehen an festen Stellen und bekommen eine Tür zu ihrem Innenraum.
  let gi = 0, nth = 0;
  const doors = {};
  const place = (ch, o, s, y, jog = false) => {
    const tx = houseAnchor(o, s), n = o.w / 16;
    if (jog) { for (let x = s; x < s + n; x++) put(x, y, ':'); floors.push({ r: [s, y, n, 1], k: 'cobble' }); put(tx, y - 1, ch); } else put(tx, y, ch);
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
  put(81, 16, 'z'); put(86, 16, 'Z');                  // versiegeltes Tor (Bogen über 83–85)
  put(47, 68, 'Y'); put(52, 68, 'Z');                  // Südtor in der Mauer

  // ------------------------------------------------------------ Ankerplatz
  put(50, 43, 'o');                                    // Ankerbrunnen
  // Sternentor (Glutbogen) in der Achse Südtor – Ankerplatz – Burg, am Kopf des Durchgangs vom Torplatz
  put(50, 52, 'g'); put(40, 44, '!'); put(40, 42, 'y');
  const waystone = { x: 60, y: 41 };
  put(60, 43, '5');
  put(50, 54, '1'); put(50, 47, '2'); put(13, 35, '3'); put(50, 66, '4');
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

  // ------------------------------------------------------------ Figuren draußen
  put(52, 54, ']');                                    // Hauptmann Halvard am Sternentor
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
    [[10, 3, 'r'], [7, 3, 's'], [13, 3, 's'], [2, 4, 'x'], [18, 4, 'x'], [1, 9, 'k'], [19, 9, 'k'], [4, 3, 'O'], [16, 3, 'O'], [4, 8, '!'], [16, 8, '!'], [10, 5, '6']], [9, 4, 3, 7]);
  room('gasthaus', 'Zum Fallenden Stern', doors.hInn, 132, 23, 19, 10, 'A', [3, 15],
    [[6, 4, 'l'], [15, 3, 'm'], [11, 3, 'c'], [5, 8, 'a'], [13, 8, 'a'], [7, 6, 'h'], [17, 7, 'f'], [1, 8, 'i'], [3, 3, 'e'], [9, 3, '`'], [17, 3, ';'], [7, 8, 'h'], [11, 8, 'h'], [15, 8, 'h'], [6, 3, '7']], [8, 5, 6, 2]);
  room('bibliothek', 'Bibliothek', doors.hLibrary, 132, 44, 13, 10, 'C', [6],
    [[1, 3, 'u'], [3, 3, 'u'], [9, 3, 'u'], [11, 3, 'u'], [6, 6, 'v'], [11, 8, 'k'], [1, 8, 'j'], [7, 3, '`'], [6, 5, ')']], [3, 5, 7, 3]);
  room('sternturm', 'Sternturm', { x: 5 - OX, y: 16 }, 132, 65, 11, 10, 'B', [5],
    [[5, 4, 't'], [8, 3, 'u'], [2, 7, 'v'], [9, 8, 'j'], [1, 3, 'k'], [3, 3, "'"], [3, 6, '[']], [3, 5, 5, 3]);
  room('schmiede', 'Schmiede', doors.hSmithy, 172, 2, 13, 10, 'A', [3, 9],
    [[6, 3, 'p'], [6, 7, 'n'], [10, 3, 'q'], [2, 4, 'f'], [10, 8, 'i'], [1, 8, 'j'], [3, 3, '@'], [4, 7, '(']]);
  room('kraemer', 'Krämerladen', doors.hShop, 172, 23, 13, 9, 'A', [6],
    [[6, 4, 'l'], [2, 3, 'e'], [10, 3, 'e'], [11, 7, 'f'], [1, 7, 'i'], [1, 5, 'm'], [4, 3, ';'], [8, 3, ';'], [6, 3, '8']], [4, 5, 5, 2]);
  room('juwelier', 'Juwelierstube', doors.hJewel, 172, 44, 11, 9, 'C', [5],
    [[3, 5, 'w'], [7, 5, 'w'], [5, 3, 'e'], [9, 7, 'j'], [1, 7, 'k'], [2, 3, '>'], [8, 3, '`'], [5, 4, '9']], [3, 6, 5, 1]);
  room('ruestkammer', 'Rüstkammer', doors.hArmory, 172, 65, 13, 9, 'B', [6],
    [[2, 3, 'q'], [10, 3, 'q'], [5, 3, 'x'], [7, 3, 'x'], [11, 7, 'j'], [1, 7, 'f'], [4, 3, '@'], [10, 6, 'f'], [3, 6, 'j'], [6, 5, '0']]);

  // ------------------------------------------------------------ Inselrand (ab hier echte Kachelkoordinaten)
  shiftGrid(m, OX);
  for (const f of floors) f.r[0] += OX;
  for (const o of rooms) { o.r[0] += OX; if (o.rug) o.rug[0] += OX; o.win = o.win.map((k) => k + OX); }
  for (const d of roofs) d[0] += OX;
  for (const d of dark) d[0] += OX;
  for (const i of interiors) for (const o of [i.door, i.room, i.spawn, i.exit]) o.x += OX;
  for (const o of [waystone, board, vault]) o.x += OX;
  for (const b of m.bridges ?? []) { if (b.h) { b.a0 += OX; b.a1 += OX; } else { b.c0 += OX; b.c1 += OX; } }
  const R = { x0: 10 + OX, x1: 98 + OX, y0: 5, y1: 68 };
  rim(m, R, V);
  isle(m, 5, 16, 4.6, 3.4, 5101, { wob: 0.08 });      // Sternturm-Scherbe
  V.shards.forEach(([x, y, rx, ry, seed]) => isle(m, x + OX, y, rx, ry, seed, { wob: 0.3 }));
  // Wege über den Inselrand von den Mauerdurchlässen bis zur Kante
  const edgeW = (y) => { let x = R.x0 - 1; while (m.get(x - 1, y) !== VOID) x--; return x; };
  const edgeS = (x) => { let y = R.y1 + 1; while (m.get(x, y + 1) !== VOID) y++; return y; };
  const rimLane = (x, y, w, h, k, pw) => { m.rect(x, y, w, h, ':'); floors.push({ r: [x, y, w, h], k, pw }); };
  { const e = Math.max(edgeW(17), edgeW(18), edgeW(19)); rimLane(e, 17, R.x0 - e, 3, 'gravel', 2.4); bridge(m, [[e - 1, 18], [e, 18]], 3, 'stone'); }
  { const e = Math.max(edgeW(34), edgeW(35), edgeW(36)); rimLane(e, 34, R.x0 - e, 3, 'earth', 1.7); bridge(m, [[0, 35], [e - 1, 35]], 3, 'light'); }
  { const gx = 48 + OX, e = Math.min(edgeS(gx), edgeS(gx + 1), edgeS(gx + 2), edgeS(gx + 3)); rimLane(gx, R.y1 + 1, 4, e - R.y1, 'worn', 2.3); bridge(m, [[50 + OX, e + 1], [50 + OX, H0]], 3, 'stone'); }
  { const px = 26 + OX, e = Math.min(edgeS(px), edgeS(px + 1)); rimLane(px, R.y1 + 1, 2, e - R.y1, 'earth', 2); const dock = pier(m, px, e + 1, 6, [0, 1]); put(dock[0], dock[1], 'd'); }
  // Koppel südlich vom Torplatz
  const kx = 82 + OX, ky = V.koppelY;
  rimLane(85 + OX, R.y1 + 1, 2, ky - R.y1, 'earth', 2);
  for (let x = kx; x <= kx + 12; x++) { put(x, ky, '-'); put(x, ky + 4, '-'); }
  for (let y = ky + 1; y <= ky + 3; y++) { put(kx, y, '|'); put(kx + 12, y, '|'); }
  put(kx + 3, ky, ':'); put(kx + 4, ky, ':');
  put(kx + 8, ky + 2, '<');
  put(5, 16, 'W');                                     // Sternturm
  scatter(m, R, V, floors, interiors);

  const decor = {
    V: 'castle', W: 'starTowerM', X: 'stableM', Y: 'gateL', Z: 'gateR', z: 'gateSealed', o: 'anchorWell', g: 'glutbogen', d: 'airships',
    a: 'fTable', b: 'fBed', c: 'fHearth', e: 'fCupboard', f: 'fBarrels', h: 'fStool', i: 'fSacks', j: 'fChest', k: 'fPlant', l: 'fCounter',
    m: 'fKegs', n: 'fAnvil', p: 'fForge', q: 'fRack', r: 'fThrone', s: 'fBanner', t: 'fTelescope', u: 'fBooks', v: 'fDesk', w: 'fCase', x: 'fArmor',
    y: 'planters', '!': 'bench', '%': 'lamp', '&': 'crates', $: 'marketStall', '*': 'farmCart', '^': 'woodpile', '?': 'signpost', '<': 'haystack',
    '-': 'paddockH', '|': 'paddockV',
    // Inselrand (griechische Zeichen, die lateinischen sind vergeben)
    'β': 'bushes', 'ρ': 'roseRocks', 'κ': 'crystals',
    // Wandschmuck (begehbar, hängt an der Rückwand)
    '@': 'wShield', ';': 'wShelf', '>': 'wPicture', "'": 'wStarmap', '`': 'wSconce', O: 'wTapestry',
  };
  const WALLDECO = '@;>\'`O';
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
    solid: Object.keys(decor).filter((c) => !WALLDECO.includes(c) && c !== 'g').join(''),   // Glutbogen: nur Pfeiler fest
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
      { id: 'sternhafen_anker', name: 'Ankerplatz', x: 36 + OX, y: 21, w: 29, h: 32, noMount: true, town: true },
      { id: 'sternhafen_markt', name: 'Sternmarkt', x: 63 + OX, y: 21, w: 35, h: 32, noMount: true, town: true },
      { id: 'sternhafen_gassen', name: 'Schmiedegasse', x: 10 + OX, y: 21, w: 27, h: 47, noMount: true, town: true },
      { id: 'palace_heights', name: 'Palasthöhe', x: 34 + OX, y: 12, w: 32, h: 9, noMount: true },
      { id: 'star_tower', name: 'Sternturm', x: 0, y: 11, w: 11 + OX, h: 11, noMount: true },
      { id: 'star_stables', name: 'Sternställe', x: 78 + OX, y: 53, w: 20, h: H0 - 53 },
      { id: 'sealed_bridge', name: 'Versiegelte Brücke', x: 78 + OX, y: 5, w: 12, h: 16 },
    ],
    objects: [
      { id: 'sternhafen_vault', kind: 'bank', decor: 'starVault', prompt: 'Sternbank öffnen', ...vault },
      // Am Ankerbrunnen (Deko „o“): ohne eigenes Bild, nur der Punkt zum Berühren (Kapitel 9 und 10)
      { id: 'anchor_stone', kind: 'shrine', over: true, name: 'Ankerstein', prompt: 'Den Ankerstein berühren', x: 50 + OX, y: 44 },
    ],
    portals: [
      { id: 'to_ember_wastes', x: 50 + OX, y: 51.4, range: 26,
        to: { zoneId: 'ember_wastes', spawnId: 'from_sternhafen' }, prompt: 'Durch das Sternentor zurück in die Glutöde' },
      { id: 'to_gardens', x: 0.6, y: 35, range: 26, visual: 'road', dir: [-1, 0],
        to: { zoneId: 'drifting_gardens', spawnId: 'from_sternhafen' }, prompt: 'Über die Lichtbrücke in die Treibenden Gärten' },
      { id: 'to_splitterweiten', x: 50 + OX, y: H0 - 0.6, range: 26, visual: 'road', dir: [0, 1], requires: { level: 44 },
        to: { zoneId: 'splitterweiten', spawnId: 'from_sternhafen' }, prompt: 'Über die Brücke in die Splitterweiten' },
    ],
    signText: 'West: Treibende Gärten · Süd: Splitterweiten · Nord: Palast · Nordost: versiegelte Brücke',
  }, PAD);
}

// Leere Himmelszeilen oben (Burg und Turm ragen weit nach oben); verschiebt alle Kachelangaben. Der dunkle Bereich der
// Innenräume reicht bis zum oberen Rand.
function shiftY(L, n) {
  const W0 = L.map[0].length;
  L.map = [...Array.from({ length: n }, () => '_'.repeat(DX + OX) + '#'.repeat(W0 - DX - OX)), ...L.map];
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

function shiftGrid(m, n) {
  for (const row of m.g) row.unshift(...Array(n).fill(VOID));
  m.w += n;
}

// Inselrand um die Stadtmauer (R = Mauer in Kacheln): Abstand zur Mauer je Seite (west/ost/süd) mit welliger Kante;
// oben (Norden) läuft der Rand weich in die Dachkante aus. Füllt nur Abgrund.
function rim(m, R, V) {
  const { w: mw, e: me, s: ms, amp = 1, scale = 4, seed = 7100, taper = 5 } = V.margin;
  for (let y = R.y0; y < m.h; y++) for (let x = 0; x < R.x1 + 20; x++) {
    if (m.get(x, y) !== VOID) continue;
    const dx = x < R.x0 ? R.x0 - x : x > R.x1 ? x - R.x1 : 0, dy = y > R.y1 ? y - R.y1 : 0;
    if (!dx && !dy) continue;
    const t = Math.min(1, (y - R.y0 + 1) / taper), k = t * t * (3 - 2 * t);
    const n = (vn(x, y, scale, seed) - 0.5) * 2 * amp + (vn(x, y, scale * 0.45, seed + 3) - 0.5) * amp * 0.6;
    const mx = Math.max(0.5, ((x < R.x0 ? mw : me) + n) * k), my = Math.max(0.5, ms + n);
    if (Math.hypot(dx / mx, dy / my) <= 1) m.set(x, y, ',');
  }
}

// Streudeko auf dem Inselrand: Bäume, Büsche, Felsen mit Abstand zu Kante, Mauer, Wegen, Haustüren und untereinander
function scatter(m, R, V, floors, interiors) {
  const S = V.scatter;
  const vd = voidDist(m, 4);
  const onFloor = (x, y) => floors.some(({ r: [fx, fy, fw, fh] }) => x >= fx - 1 && y >= fy - 1 && x <= fx + fw && y <= fy + fh);
  const near = (x, y) => Math.max(x < R.x0 ? R.x0 - x : x > R.x1 ? x - R.x1 : 0, y > R.y1 ? y - R.y1 : 0);
  const placed = [];
  for (const [ch, dens, minD, gap, edge, clu = 0] of S) {
    for (let y = R.y0 + 1; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      if (m.get(x, y) !== ',' || near(x, y) < gap || vd(x, y) < edge || onFloor(x, y)) continue;
      if (x >= R.x0 && x <= R.x1 && y <= R.y1) continue;
      if (interiors.some(({ door: d }) => Math.abs(x - d.x) <= 1 && y > d.y && y <= d.y + 2)) continue;
      if (hash2(x, y, V.margin.seed + ch.charCodeAt(0)) > dens) continue;
      if (clu && vn(x, y, 5, V.margin.seed + 50) < clu) continue;
      if (placed.some(([px, py, d]) => Math.hypot(px - x, py - y) < Math.max(d, minD))) continue;
      m.set(x, y, ch); placed.push([x, y, minD]);
    }
  }
}
