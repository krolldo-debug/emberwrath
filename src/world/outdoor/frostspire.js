import { createRng, hash2 } from '../../core/math.js';
import { MapBuilder } from '../levels.js';
import { rim } from '../levels2.js';
import { near, box, each, blob, roadNet, foe, strew } from '../mapkit.js';

// ---------------------------------------------------------------- Frostzinnen (31–36), Runde 5/2
// Ein Gebirge, kein Schneefeld: Die Massive sind in Felsstufen gegliedert
// (Schneeterrassen, Gipfel), alle Wege führen durch Engstellen. Teilgebiete:
//   Marschsteig (S, Ankunft aus der Faulmarsch; erst ein Stück Weg durch die
//   Klamm) · Frosthold (Langhaus-Weiler im Talkessel unter dem Pass, Thingkreis
//   in der Mitte, Eisfall an der Nordwand) · Jägerwald mit Sigruns Jagdhütte (W)
//   · Eisgrotten (Höhlengänge im Westmassiv) · Serpentinenpass (Passstraße mit
//   Kehren am Hang, Zollwarte, Aussichtskanzel mit Leuchtfeuer) · Zinnensattel
//   (Passhöhe mit Felsnadeln und Eisteich) · Reiftor (NW) · Gletscherfeld (NO,
//   Spalten mit Schneebrücken, verlassenes Expeditionslager) · Trollhöhlen ·
//   Eisspiegelsee (Karsee) · Wühlerfelder (SO) · Glutabstieg (O, zur Glutöde).
//
// Zugefrorener See: begehbare Dekozeichen ohne Sprite ('I') bzw. mit Rissen
// ('J'); Zellen ohne Boden-Nachbarn bekommen level.baseFloor = '~' (Eis).
// Der See grenzt im Norden, Westen und Osten an Fels und ist nur nach Süden offen.
//
// Felsstufen: Innerhalb der Massive liegen feste Schneeterrassen ('_', kein Fels),
// über denen der Boden-Renderer eine Felswand zeichnet. So lesen die Massive als
// gestuftes Gebirge statt als Hochfläche; Gipfel ('N') stehen auf den Terrassen.

// Zeichen
//   Boden: ',' Schnee  '.' festgetretener Schnee/Weg  ':' Pflaster  '#' Fels
//   Punkte 1 start 2 respawn 3 from_blighted_marsh 4 from_rime_caverns 5 from_ember_wastes 6 waystone
//   Gebirge (fest): '_' Schneeterrasse  'N' Gipfel  'S' Felsnadel  ']' großer Eisfall  'm' Eisfall
//   See: 'I' Eis  'J' Eis mit Rissen  'O' Eisloch  'X' Fischerhütte  'Y' eingefrorenes Boot
//   Begehbare Bodendecals: 'l' Eisteich  'y' Spuren
//   Gletscher: Spaltenzeichen (siehe CREV)  'n' '$' '%' Schneebrücke (begehbar)
//   Höhlen: 'q' Eiszapfenvorhang (begehbar)  'p' Eissäule  'C' Trollhöhle  'E' Grottenmund  'u' Höhlenfeuer
//   Weiler: 'L' Langhaus  ')' Sodenhaus  '(' Runenstein  'K' Vorräte  'V' Schlitten  'a' Waffengestell  'U' Wachturm
//   Ruinen/Lager: 'Q' Zollwarte  '^' Mauerrest  '[' kalte Feuerstelle  'T' Zelt
//   Wald/Hütte: 'D' Jagdhütte  'r' Fellgestell  'W' Holzstapel  'g' Steinmann  '|' Wegstange  'x' tote Kiefer
export function buildFrostspire() {
  const W = 152, H = 104;
  const m = new MapBuilder(W, H, ',');
  const rng = createRng(3136);
  rim(m, rng, W, H);
  const net = roadNet(m);
  const road = (pts, w = 2.4) => net.road(pts, w, '.', [',', '#']);
  const put = (x, y, ch) => m.set(x, y, ch);
  const rock = (cx, cy, rx, ry, n = 3) => blob(m, rng, cx, cy, rx, ry, '#', [','], n);
  const clear = (cx, cy, rx, ry, n = 3) => blob(m, rng, cx, cy, rx, ry, ',', ['#'], n);
  const carve = (pts, w, ch = '.') => m.path(pts, w, ch, ['#', ',']);
  // Catmull-Rom: geschwungene Wege durch Stützpunkte
  const curve = (pts, step = 0.5) => {
    const P = [pts[0], ...pts, pts[pts.length - 1]], out = [];
    for (let i = 1; i < P.length - 2; i++) {
      const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
      const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
      for (let s = 0; s < n; s++) {
        const t = s / n, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  };

  // ------------------------------------------------ Massive
  // Westmassiv (Eisgrotten)
  m.rect(2, 19, 35, 38, '#');
  rock(20, 57, 13, 3); rock(37, 38, 4, 12); rock(6, 17, 5, 3); rock(30, 18, 6, 2);
  // Passberg (Mitte): breiter Fuß über dem Talkessel, nach oben schmaler
  m.rect(37, 15, 52, 54, '#');
  rock(62, 70, 20, 3); rock(40, 13, 6, 3); rock(86, 14, 4, 3);
  // Ostmassiv (Trollhöhlen) mit Fels um den Karsee
  m.rect(86, 37, 64, 42, '#');
  rock(118, 37, 22, 3, 4); rock(92, 34, 6, 4);
  // Ostsporn und Südrücken des Talkessels
  rock(80, 76, 5, 9); rock(60, 98, 20, 4); rock(36, 82, 4, 13); rock(39, 97, 6, 4); rock(97, 98, 4, 4);
  // Nordrand: Felszacken am Sattel und am Gletscher
  rock(147, 8, 4, 6); rock(90, 3, 4, 2); rock(110, 3, 5, 2);
  // Südrand: Felsnasen in den Wühlerfelder und im Jägerwald
  rock(126, 101, 7, 2); rock(4, 66, 3, 5); rock(26, 100, 6, 2);

  // ------------------------------------------------ Frosthold: Talkessel unter dem Pass
  const bowl = { cx: 58, cy: 82, rx: 19, ry: 11 };
  clear(bowl.cx, bowl.cy, bowl.rx, bowl.ry, 5);
  m.ellipse(bowl.cx, bowl.cy, bowl.rx - 1, bowl.ry - 1, ',', ['#']);
  // Klamm im Südosten: der einzige Fahrweg in den Kessel
  const gorge = [[90, 103], [89, 98], [86, 93], [81, 90], [76, 87], [70, 85]];
  m.path(curve(gorge, 0.4), 4.2, ',', ['#']);
  // Westpforte zum Jägerwald (schmaler Fußweg)
  m.path(curve([[41, 85], [36, 84], [31, 82], [24, 80]], 0.4), 3.2, ',', ['#']);

  // ------------------------------------------------ Serpentinenpass: Passstraße mit Kehren
  // Kehren wechseln Seite und Höhe; jeder Schenkel steigt leicht an, die Kehren sind
  // gerundete Wendeplatten mit Steinmann und Wegstangen.
  const passPts = [
    [60, 72], [59, 67], [55, 63], [48, 61],              // erster Schenkel nach Westen
    [44, 58], [47, 55], [55, 54], [65, 52], [75, 50],    // Kehre 1 (W), zweiter Schenkel nach Osten
    [81, 47], [79, 43], [71, 41], [61, 40], [53, 38],    // Kehre 2 (O), dritter Schenkel
    [49, 35], [52, 31], [59, 29], [67, 28],              // Kehre 3 (W, Zollwarte), vierter Schenkel
    [74, 25], [73, 21], [67, 18], [63, 15], [64, 11],    // Kehre 4 (O), Schlussstück zum Sattel
  ];
  m.path(curve(passPts, 0.35), 3.4, '.', ['#', ',']);
  const hairpins = [[45, 57.5], [80.5, 45], [50, 34.5], [74, 23]];
  for (const [x, y] of hairpins) m.ellipse(x, y, 4, 3, '.', ['#', ',']);
  // Aussichtskanzel mit Leuchtfeuer (Stichweg von der vierten Kehre)
  m.path(curve([[74, 25], [78, 27], [81, 27]], 0.4), 2.6, '.', ['#', ',']);
  m.ellipse(82, 27, 3.2, 2.4, ',', ['#']);
  // Alte Abkürzung: steiler Fußpfad zwischen Kehre 1 und 2 (Ruinenrast)
  m.path(curve([[66, 52], [68, 47], [69, 43]], 0.4), 2, ',', ['#']);
  // Felsstufen unter den Schenkeln (unregelmäßig), damit die Hangkanten nicht gerade laufen
  for (const [x, y] of [[57, 58], [66, 57], [72, 55], [52, 47], [62, 45], [70, 46], [60, 34], [66, 33], [56, 24], [62, 22]]) rock(x, y, rng.range(2.4, 4), 1.6, 1);

  // ------------------------------------------------ Zinnensattel (Passhöhe) und Reiftor-Plateau
  m.ellipse(66, 8, 22, 5.4, ',', ['#']);
  clear(44, 9, 8, 4, 3);
  m.ellipse(26, 9, 12, 5, ',', ['#']);
  clear(14, 12, 6, 3, 2);
  // Gletscherzugang vom Sattel nach Osten
  clear(86, 8, 6, 5, 3);

  // ------------------------------------------------ Eisgrotten (Gänge im Westmassiv)
  const grotto = [[16, 61], [15, 55], [11, 49], [15, 44], [22, 44], [30, 47], [33, 41], [30, 35], [24, 32], [15, 33], [9, 29], [10, 24], [17, 21], [20, 15]];
  carve(curve(grotto, 0.4), 3.2);
  m.ellipse(20, 44, 5, 3.2, '.', ['#']);    // Säulenhalle
  m.ellipse(25, 32, 5.4, 3.4, '.', ['#']);  // Eisdom
  m.ellipse(10, 49, 3, 2.4, '.', ['#']);
  carve([[30, 47], [33, 52], [32, 54]], 2.4); // Seitengang (Sackgasse mit Hexennest)
  m.ellipse(32, 53, 3, 2, '.', ['#']);

  // ------------------------------------------------ Trollhöhlen (Gänge im Ostmassiv)
  carve(curve([[120, 33], [120, 40], [115, 46], [108, 49]], 0.4), 3.2);
  m.ellipse(105, 50, 8, 4.4, '.', ['#']);   // Halle des Häuptlings
  m.ellipse(94, 45, 4, 3, '.', ['#']);      // Knochenkammer
  carve([[100, 48], [94, 45]], 2.6);
  carve(curve([[112, 50], [122, 47], [130, 49], [137, 51]], 0.4), 3);
  m.ellipse(138, 50, 6, 4, '.', ['#']);     // Wolfsgrube
  carve(curve([[140, 53], [143, 58], [143, 63]], 0.4), 3.2);
  m.rect(138, 63, 12, 25, ',');             // Ostflanke zwischen Höhlen und Straße
  rock(146, 70, 3, 5, 2);

  // ------------------------------------------------ Eisspiegelsee (Karsee)
  const lake = { cx: 110, cy: 70, rx: 19, ry: 9.4 };
  const inLake = (x, y) => ((x - lake.cx) / lake.rx) ** 2 + ((y - lake.cy) / lake.ry) ** 2 <= 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inLake(x, y)) put(x, y, ',');
  m.rect(88, 79, 50, 4, ',');                // Südufer offen
  m.ellipse(110, 81, 23, 2.6, ',', ['#']);
  // Felsgelände zwischen Kessel und See: Kiefernhang mit Bachrinne
  clear(88, 86, 9, 5, 3);

  // ------------------------------------------------ Gletscherfeld: Spalten mit Schneebrücken
  const crev = new Map();
  const crevasse = (pts, bridges = []) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      for (let x = ax; x < bx || (i === pts.length - 2 && x === bx); x++) {
        const y = Math.round(ay + (by - ay) * (x - ax) / (bx - ax));
        if (m.get(x, y) === ',') crev.set(y * W + x, bridges.some((b) => Math.abs(b - x) <= 1));
      }
    }
  };
  crevasse([[93, 20], [100, 18], [112, 20], [124, 16], [136, 18], [150, 15]], [104, 130]);
  crevasse([[99, 29], [106, 31], [116, 28], [126, 31], [138, 27], [150, 29]], [110, 140]);
  crevasse([[95, 9], [101, 11], [107, 10]]);
  crevasse([[118, 7], [126, 9], [131, 8]]);
  crevasse([[132, 24], [138, 22]]);
  const CREV = { SS: 'z', SU: '/', SD: '7', SN: '>', US: '8', UU: '9', UD: '0', UN: '!', DS: '?', DU: '&', DD: '*', DN: '+', NS: '<', NU: '-', ND: ';', NN: '@' };
  {
    const has = (x, y) => crev.has(y * W + x);
    const side = (x, y, dx) => has(x + dx, y) ? 'S' : has(x + dx, y - 1) ? 'U' : has(x + dx, y + 1) ? 'D' : 'N';
    for (const [k, bridge] of crev) {
      const x = k % W, y = Math.floor(k / W);
      if (bridge) {
        const gapL = has(x - 1, y) && !crev.get(y * W + x - 1), gapR = has(x + 1, y) && !crev.get(y * W + x + 1);
        put(x, y, gapL ? '$' : gapR ? '%' : 'n');
      } else put(x, y, CREV[side(x, y, -1) + side(x, y, 1)]);
    }
  }
  for (const [bx, by] of [[104, 18], [130, 17], [110, 30], [140, 28]]) {
    for (const dy of [-3, 3]) for (const dx of [-2, 2, -3, 3]) { const x = bx + dx, y = by + dy; if (m.get(x, y) === ',' && m.get(x, y + 1) === ',' && m.get(x, y - 1) === ',') { put(x, y, 'g'); break; } }
  }

  // ------------------------------------------------ Wege im Süden
  m.rect(86, 98, 8, 6, ',');                 // Süd: Marschsteig (Ankunft)
  m.rect(144, 83, 8, 7, ',');                // Ost: Glutabstieg
  road(curve(gorge, 0.4), 2.8);
  road(curve([[86, 93], [94, 90], [104, 88], [118, 86], [132, 86], [143, 86], [151, 86]], 0.4), 2.6);
  road(curve([[143, 86], [144, 76], [143, 66]], 0.4), 2.2);
  road(curve([[41, 85], [36, 84], [31, 82], [24, 80], [19, 80]], 0.4), 2.2);
  road(curve([[104, 88], [108, 84], [110, 81]], 0.4), 2);    // Stichweg ans Seeufer

  // ------------------------------------------------ Frosthold: Langhaus-Weiler
  // Häuser im Halbrund um den Thingplatz, Pfade (festgetretener Schnee) zu den Türen,
  // Pflaster nur auf dem Thingplatz. Kein Palisadenring: der Kessel ist die Mauer.
  m.ellipse(58, 83, 4.6, 2.8, ':', [',', '.']);
  const paths = [
    [[70, 85], [66, 84], [62, 83]],                 // vom Klammweg auf den Platz
    [[58, 81], [58, 78]],                           // Jarlshalle
    [[54, 83], [50, 82], [46, 81]],                 // Langhaus West
    [[62, 82], [66, 81], [70, 81]],                 // Langhaus Ost
    [[56, 85], [52, 88], [47, 90]],                 // Sodenhaus SW
    [[60, 85], [63, 88], [67, 90]],                 // Sodenhaus SO
    [[46, 81], [43, 84], [41, 85]],                 // zur Westpforte
    [[60, 73], [59, 76], [58, 78]],                 // Passstraße zur Halle
  ];
  for (const p of paths) m.path(curve(p, 0.4), 2, '.', [',']);
  put(58, 76, 'L'); put(46, 79, 'L'); put(70, 79, 'L');
  put(46, 91, ')'); put(68, 91, ')');
  put(58, 83, 'F');
  each([[53, 81], [63, 81], [53, 85], [63, 85], [58, 87]], (x, y) => put(x, y, '('));
  put(58, 79, 'A'); put(65, 86, 'M');
  put(57, 85, '1'); put(55, 86, '2');
  const waystone = { x: 72, y: 87 };
  put(72, 89, '6');
  put(77, 86, 'U'); put(75, 91, 'P'); put(52, 78, 'P'); put(64, 78, 'P');
  each([[67, 87], [41, 80], [72, 82]], (x, y) => put(x, y, 'K'));
  each([[63, 88], [44, 87]], (x, y) => put(x, y, 'V'));
  each([[50, 85], [66, 84]], (x, y) => put(x, y, 'a'));
  each([[40, 88], [75, 80], [51, 91]], (x, y) => put(x, y, 'W'));
  each([[43, 76], [73, 76]], (x, y) => put(x, y, 'r'));
  put(66, 73, ']');                                 // Eisfall an der Nordwand des Kessels
  put(90, 99, '3');
  put(147, 86, '5');

  // ------------------------------------------------ Jägerwald mit Sigruns Jagdhütte
  const lodge = { x: 14, y: 76 };
  m.ellipse(15, 79, 7, 4.4, ',', ['#']);
  put(lodge.x, lodge.y, 'D'); put(20, 77, 'r'); put(9, 77, 'W'); put(10, 81, 'r'); put(20, 82, 'F');
  put(16, 79, 'B');
  const defendAt = [15, 80];
  const defendSpawns = [[15, 92], [26, 73], [5, 72], [26, 87]];

  // ------------------------------------------------ Reiftor
  put(26, 5, 'R'); put(26, 9, '4');
  each([[20, 8], [32, 8], [21, 12], [31, 12]], (x, y) => put(x, y, 'p'));

  // ------------------------------------------------ Höhlendeko
  for (let y = 18; y < 58; y++) for (let x = 3; x < 38; x++) {
    if (m.get(x, y) !== '.' || m.get(x, y - 1) !== '#') continue;
    if (rng.chance(0.38)) put(x, y, 'q');
  }
  each([[18, 43], [22, 45], [24, 31], [27, 33]], (x, y) => put(x, y, 'p'));
  for (let y = 38; y < 64; y++) for (let x = 88; x < 148; x++) {
    if (m.get(x, y) !== '.' || m.get(x, y - 1) !== '#') continue;
    if (rng.chance(0.22)) put(x, y, 'q');
  }
  put(143, 62, 'C'); put(16, 59, 'E');
  put(104, 47, 'u'); put(137, 48, 'u');
  each([[100, 52], [109, 53], [96, 44], [92, 46], [135, 53], [141, 49]], (x, y) => put(x, y, 'o'));

  // ------------------------------------------------ Points of Interest
  // Pass: Zollwarte an Kehre 3, Mauerreste, Eisfälle an den Hangwänden
  put(47, 33, 'Q'); put(53, 36, '^');
  each([[71, 52], [57, 40]], (x, y) => { if (m.get(x, y) === '.' && m.get(x, y - 1) === '#') put(x, y, 'm'); });
  // Sattel: Felsnadeln, Eisteich, Spuren
  each([[52, 6], [79, 5], [74, 11]], (x, y) => put(x, y, 'S'));
  put(58, 4, 'l');
  each([[44, 8], [70, 6]], (x, y) => put(x, y, 'y'));
  // Gletscher: verlassenes Expeditionslager, Felsnadeln, Eisteich, Ruine
  put(98, 24, 'T'); put(102, 25, '['); put(100, 27, 'V'); put(96, 26, 'K');
  each([[120, 24], [143, 21], [114, 13]], (x, y) => put(x, y, 'S'));
  put(122, 3, 'l');
  put(138, 33, 'Q'); put(134, 34, '^');
  each([[108, 14], [126, 22], [146, 26]], (x, y) => put(x, y, 'y'));
  each([[97, 4], [140, 4]], (x, y) => put(x, y, 'm'));
  // Seeufer und Ostflanke
  put(92, 84, 'l'); put(141, 72, 'S');
  each([[124, 83], [139, 78]], (x, y) => put(x, y, 'y'));
  // Wühlerfelder: aufgewühlter Schnee, Ruine einer Hütte
  put(130, 89, '^'); put(100, 101, 'S');
  // Jägerwald: Eisteich und Jägerpfad
  put(8, 93, 'l'); put(24, 66, 'y');

  // ------------------------------------------------ Gegner
  const F = (list, ch) => each(list, (x, y) => foe(m, x, y, ch));
  // Jägerwald: Wölfe, ein Pirscher
  F([[8, 90], [12, 95], [24, 93], [6, 62], [24, 64]], 'j'); F([[22, 97]], 's');
  // Eisgrotten
  F([[20, 45], [24, 32], [10, 25]], 'e'); F([[32, 53], [15, 34]], 'h'); F([[11, 49], [31, 41]], 's');
  // Reiftor
  F([[16, 13], [36, 12], [40, 7]], 'e'); F([[12, 6]], 'h');
  // Serpentinenpass: Wölfe an den Kehren, Pirscher, Trolle
  F([[45, 57], [80, 45]], 'j'); F([[66, 53], [63, 40]], 's'); F([[50, 34], [74, 23]], 'i'); F([[56, 54]], 'j');
  // Zinnensattel
  F([[62, 8], [82, 10]], 'h'); F([[48, 10]], 'e');
  // Gletscherfeld
  F([[100, 12], [124, 12], [140, 9], [118, 24]], 'e'); F([[134, 32], [104, 24]], 'h'); F([[112, 34], [130, 22]], 'b'); F([[146, 34]], 's');
  // Trollhöhlen
  F([[96, 45], [103, 52], [124, 48], [134, 51], [140, 49], [118, 42]], 'i'); F([[141, 52], [137, 48]], 'j');
  foe(m, 106, 49, 'Z');
  // Eisspiegelsee
  F([[100, 68], [104, 66], [118, 72], [122, 68], [112, 64], [96, 74]], 'j'); F([[110, 75], [126, 74]], 's');
  // Glutabstieg
  F([[144, 72], [140, 96]], 's'); F([[146, 78]], 'i');

  // ------------------------------------------------ Objekte
  const beacons = [[82, 26], [132, 12], [116, 93]];
  const tunnels = [[108, 98], [123, 95], [137, 99]];
  F([[104, 96], [110, 101], [112, 95]], 'b'); F([[120, 99], [127, 93], [126, 99]], 'b'); F([[134, 95], [141, 97], [139, 92]], 'b');
  F([[118, 90], [98, 84]], 'j');
  F([[78, 30], [84, 23]], 'e'); F([[117, 97]], 's');

  // ------------------------------------------------ Bewuchs
  const keepPts = [...beacons, ...tunnels, [waystone.x, waystone.y], [waystone.x + 1, waystone.y], defendAt, ...defendSpawns, [lodge.x, lodge.y], [58, 4], [122, 3], [92, 84], [8, 93]];
  const hold2 = [(x, y) => ((x - bowl.cx) / (bowl.rx + 1)) ** 2 + ((y - bowl.cy) / (bowl.ry + 1)) ** 2 <= 1,
    (x, y) => x >= 84 && x <= 95 && y >= 94, (x, y) => x >= 143 && y >= 82 && y <= 90,
    (x, y) => x >= 16 && x <= 36 && y <= 13, (x, y) => inLake(x, y) || (y >= 78 && y <= 83 && x >= 88 && x <= 132),
    (x, y) => keepPts.some(([sx, sy]) => Math.abs(x - sx) <= 3 && Math.abs(y - sy) <= 2),
    (x, y) => x >= 7 && x <= 23 && y >= 74 && y <= 84, (x, y) => x >= 94 && x <= 104 && y >= 22 && y <= 29];
  const keep = (x, y) => hold2.some((f) => f(x, y));
  const forest = (x, y) => x < 34 && y > 56;
  const glacier = (x, y) => x > 88 && y < 37;
  const pineSlope = (x, y) => x >= 78 && x <= 100 && y >= 80 && y <= 97;
  strew(m, net, rng, keep, (x, y, g, free) => {
    if (g !== ',') return null;
    if (forest(x, y) || pineSlope(x, y)) {
      if (free && rng.chance(forest(x, y) ? 0.2 : 0.12)) return 't';
      if (free && rng.chance(0.02)) return 'x';
      if (rng.chance(0.03)) return 'd';
      return null;
    }
    if (glacier(x, y)) {
      if (free && rng.chance(0.02)) return 'c';
      if (rng.chance(0.03)) return 'd';
      if (free && rng.chance(0.008)) return 'k';
      return null;
    }
    const nearRock = near(m, x, y, '#', 1);
    if (free && rng.chance(nearRock ? 0.04 : 0.02)) return 't';
    if (free && rng.chance(0.01)) return 'x';
    if (rng.chance(nearRock ? 0.06 : 0.025)) return 'd';
    if (free && rng.chance(0.012)) return 'k';
    if (free && rng.chance(0.006)) return 'c';
    return null;
  });
  // Steinmänner an den Kehren, Wegstangen entlang der Passstraße und der Klamm
  each([[42, 56], [84, 45], [47, 36], [77, 22], [21, 14], [45, 11], [88, 95]], (x, y) => { if (m.get(x, y) === ',' || m.get(x, y) === '.') put(x, y, 'g'); });
  {
    const marks = [[57, 66], [50, 63], [58, 56], [68, 54], [77, 52], [74, 43], [63, 42], [56, 31], [64, 30], [69, 20], [65, 16], [87, 97], [82, 92], [78, 89], [98, 91], [112, 89], [128, 88], [32, 84], [26, 82]];
    for (const [x, y] of marks) {
      // neben dem Weg auf festem Boden, nicht im Weg
      for (const [dx, dy] of [[0, -2], [0, 2], [0, -1], [0, 1], [-1, -2], [1, 2]]) {
        const c = m.get(x + dx, y + dy);
        if ((c === ',' || c === '.') && m.get(x + dx, y + dy + 1) !== '#' && !net.onRoad(x + dx, y + dy)) { put(x + dx, y + dy, '|'); break; }
      }
    }
  }

  // See: Löcher, Hütten, Risse, dann alles übrige Seeeis begehbar ohne Sprite
  each([[98, 70], [116, 66], [124, 72], [106, 74], [114, 77]], (x, y) => { if (m.get(x, y) === ',') put(x, y, 'O'); });
  each([[102, 72], [119, 70]], (x, y) => { if (m.get(x, y) === ',') put(x, y, 'X'); });
  if (m.get(108, 63) === ',') put(108, 63, 'Y');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inLake(x, y) || m.get(x, y) !== ',') continue;
    put(x, y, rng.chance(0.07) ? 'J' : 'I');
  }

  // ------------------------------------------------ Felsstufen und Gipfel in den Massiven
  // Höhenlinien (wellig, ~6 Zeilen Abstand) werden zu Schneeterrassen; über jeder
  // Terrasse zeichnet der Renderer eine Felswand. Gipfel nur dort, wo darüber kein
  // begehbarer Boden liegt (sie würden sonst den Weg verdecken).
  const level = (x, y) => Math.floor((y + Math.sin(x / 9.3) * 2.4 + Math.sin(x / 4.1 + 1.7) * 0.8) / 6.5);
  const R = (x, y) => m.get(x, y) === '#';
  const ledges = [];
  for (let y = 4; y < H - 4; y++) for (let x = 3; x < W - 3; x++) {
    if (!R(x, y) || level(x, y) === level(x, y - 1)) continue;
    if (!(R(x, y - 1) && R(x, y - 2) && R(x, y - 3) && R(x, y + 1) && R(x, y + 2))) continue;
    if (!R(x - 1, y) || !R(x + 1, y)) continue;
    ledges.push([x, y]);
  }
  for (const [x, y] of ledges) put(x, y, '_');
  const walkable = (c) => !'#_NS'.includes(c) && c !== undefined;
  const peaks = [];
  for (const [x, y] of ledges) {
    if (hash2(x, y, 3141) > 0.3) continue;
    if (peaks.some(([px, py]) => Math.abs(px - x) < 5 && Math.abs(py - y) < 5)) continue;
    let clearAbove = true;
    for (let dy = -7; dy <= 0 && clearAbove; dy++) for (let dx = -3; dx <= 3; dx++) { const c = m.get(x + dx, y + dy); if (c !== '#' && c !== '_' && c !== 'N' && walkable(c)) { clearAbove = false; break; } }
    if (!clearAbove) continue;
    peaks.push([x, y]); put(x, y, 'N');
  }

  const areas = [
    { id: 'frosthold', name: 'Frosthold', town: true, x: 40, y: 72, w: 37, h: 21, noMount: true },
    { id: 'marsh_path', name: 'Marschsteig', x: 78, y: 88, w: 18, h: 14 },
    { id: 'pine_wood', name: 'Jägerwald', x: 3, y: 57, w: 31, h: 44 },
    { id: 'ice_grotto', name: 'Eisgrotten', x: 3, y: 18, w: 35, h: 39 },
    { id: 'rime_gate', name: 'Reiftor', x: 8, y: 3, w: 32, h: 13 },
    { id: 'switchback_pass', name: 'Serpentinenpass', x: 38, y: 14, w: 50, h: 58 },
    { id: 'frost_saddle', name: 'Zinnensattel', x: 40, y: 3, w: 48, h: 11 },
    { id: 'glacier', name: 'Gletscherfeld', x: 88, y: 3, w: 61, h: 34 },
    { id: 'troll_caves', name: 'Trollhöhlen', x: 88, y: 37, w: 60, h: 23 },
    { id: 'frozen_lake', name: 'Eisspiegelsee', x: 88, y: 60, w: 44, h: 23 },
    { id: 'burrow_fields', name: 'Wühlerfelder', x: 96, y: 88, w: 44, h: 14 },
    { id: 'wastes_descent', name: 'Glutabstieg', x: 136, y: 60, w: 14, h: 40 },
  ];

  return {
    name: 'Die Frostzinnen',
    kind: 'outdoor',
    biome: 'frost',
    decorSet: 'decor_frost',
    baseFloor: '~',
    map: m.rows(),
    solid: 'wvUOXYz/7>890!?&*+<-;@pDrWgmxuKVa_NSQ^|()[]L',
    decor: {
      t: 'snowPines', k: 'frozenRocks', c: 'iceCrystals', d: 'snowDrifts', L: 'longhouse',
      U: 'fortTower', T: 'tent', P: 'bannerPole', F: 'campfireBig',
      R: 'rimeGate', o: 'trollBones',
      I: null, J: 'iceCracks', O: 'iceHole', X: 'fishHut', Y: 'frozenBoat',
      ...Object.fromEntries(Object.entries(CREV).map(([k, ch]) => [ch, `crev${k}`])), n: 'snowBridge', $: 'snowBridgeL', '%': 'snowBridgeR', q: 'icicleCurtain', p: 'icePillar', C: 'trollCave', E: 'grottoMouth', u: 'caveFire',
      K: 'supplies', V: 'sled', a: 'weaponRack',
      D: 'huntLodge', r: 'peltRack', W: 'woodPile', g: 'cairn', m: 'iceFall', x: 'deadPine',
      _: 'ledgeSnow', N: 'mountainPeak', S: 'rockSpire', ']': 'frozenCascade', l: 'frozenPond', y: 'tracks',
      Q: 'ruinTower', '^': 'ruinWall', '[': 'coldFire', '(': 'runeStone', ')': 'sodHut', '|': 'markerPole',
    },
    points: { 1: 'start', 2: 'respawn', 3: 'from_blighted_marsh', 4: 'from_rime_caverns', 5: 'from_ember_wastes', 6: 'waystone' },
    npcs: { A: 'jarl_eskil', B: 'hunter_sigrun', M: 'trader_fenn' },
    enemies: {
      i: { type: 'ice_troll' }, j: { type: 'frost_wolf' }, h: { type: 'rime_witch' },
      s: { type: 'snow_stalker', dormant: true }, Z: { type: 'ice_troll_chief' },
      e: { type: 'frost_revenant' }, b: { type: 'snow_burrower' },
    },
    respawn: 45,
    waystone,
    areas,
    objects: [
      ...beacons.map(([x, y], i) => ({ id: `frost_beacon_${i + 1}`, kind: 'shrine', decor: 'frostBeacon', name: 'Leuchtfeuer', prompt: 'Brandöl gießen', x, y })),
      ...tunnels.map(([x, y], i) => ({ id: `burrow_tunnel_${i + 1}`, kind: 'shrine', decor: 'burrowHole', name: 'Wühlerbau', prompt: 'Sprengpulver legen', x, y })),
    ],
    questRoutes: {
      defend_sigrun_lodge: { kind: 'defend', at: defendAt, spawns: defendSpawns, foe: 'frost_revenant', seconds: 120 },
    },
    portals: [
      { id: 'to_blighted_marsh', x: 90, y: 102.4, range: 28, visual: 'road', dir: [0, 1],
        to: { zoneId: 'blighted_marsh', spawnId: 'from_frostspire' }, prompt: 'Hinab in die Faulmarsch' },
      { id: 'to_rime_caverns', x: 26, y: 6.2, range: 26, requires: { level: 34 },
        to: { zoneId: 'rime_caverns', spawnId: 'start' }, prompt: 'Die Reifhöhlen betreten' },
      { id: 'to_ember_wastes', x: 151.4, y: 86, range: 28, requires: { level: 36 }, visual: 'road', dir: [1, 0],
        to: { zoneId: 'ember_wastes', spawnId: 'from_frostspire' }, prompt: 'Abstieg in die Glutöde' },
    ],
    signText: 'Nord: Passstraße über die Kehren zum Zinnensattel und Reiftor · West: Jägerwald und Eisgrotten · Ost: Eisspiegelsee und Glutabstieg · Süd: Klamm hinab zur Faulmarsch',
  };
}
