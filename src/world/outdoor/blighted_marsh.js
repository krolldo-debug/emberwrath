import { createRng } from '../../core/math.js';
import { MapBuilder } from '../levels.js';
import { rim } from '../levels2.js';
import { near, box, each, blob, roadNet, foe, strew } from '../mapkit.js';

// ---------------------------------------------------------------- Faulmarsch (25–31), Runde 5 / Review 2
// Inselarchipel: Grundfläche ist Wasser, alles Land sind Inseln. Verbunden
// durch geschwungene Knüppeldämme (Hauptwege, reittauglich), knorrige
// Bohlenstege (Engstellen) und Furten. Teilgebiete:
//   Marschufer (W, Ankunft aus der Steppe, erst ein Stück Damm) ·
//   Mirefeste (Pfahldorf auf Stelzen mitten in der Lagune, Lehmhügel mit Feuer) ·
//   Nebelinseln mit dem Egelnest (Mitte) · Versunkenes Dorf (NW) ·
//   Schilfinseln (N) · Frostpass (N-Ausgang) · Sporentor (NO) ·
//   Nebelsee mit der Insel des Moorgrauens (O, nur über einen langen Steg) ·
//   Pfahlsumpf (O) · Pilzwald (SW) mit der Hexenhütte (Geheimecke) ·
//   Alter Damm (S/SO) mit der verlorenen Karawane.
//
// Bohlenstege: Begehbare Stegzellen liegen über Wasser (level.baseFloor = '~').
// Jede Zelle zeichnet die Bretter der Zelle DARUNTER (ab ihrem Anker), damit
// der Held auf einem Steg nie von Brettern überdeckt wird. Über der obersten
// Stegzeile steht deshalb eine feste Trägerzelle im Wasser (bzw. ein
// begehbarer Anleger an Land). Die Zeichen der Stegzellen werden je Lage
// (Brettrichtung, offene Enden) erzeugt (Unicode ab U+0100, siehe walkChar).

// Zeichen
//   Boden: ',' Gras/Moos  '.' Erde/Damm/Lehm  '~' Moorwasser  '#' Fels
//   Punkte 1 start 2 respawn 3 from_ashen_steppe 4 from_spore_hollow 5 from_frostspire 6 waystone
//   Furt: '%' (begehbar)   Dammufer (fest): 'K' 'Q' 'Y' 'J'
//   Wasser (fest): 'o' Seerosen  'O' versunkenes Dach  'x' Nebelschwaden  'y' Bootswrack  'n' ertrunkener Baum
//                  'i' Irrlicht  'H' Pfahlhütte  'W' Wachturm  'L' Laterne  'b' Kahn  'N' Fischnetze  'E' Egelgelege
export function buildBlightedMarsh() {
  const W = 152, H = 104;
  const m = new MapBuilder(W, H, '~');
  const rng = createRng(2526);
  rim(m, rng, W, H);
  const net = roadNet(m);
  const put = (x, y, ch) => m.set(x, y, ch);
  const land = (cx, cy, rx, ry, n = 3) => blob(m, rng, cx, cy, rx, ry, ',', ['~'], n);
  const rock = (cx, cy, rx, ry, n = 2) => blob(m, rng, cx, cy, rx, ry, '#', [',', '~'], n);
  // Catmull-Rom-Kurve durch Stützpunkte (organische Wege)
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
  const road = (pts, w = 2.6) => net.road(curve(pts), w);
  // Wassermaske vor den Wegen: Dämme über Wasser erkennen
  const wet = new MapBuilder(W, H, ' ');

  // ------------------------------------------------ Land
  // Marschufer (Westen) mit Ankunft aus der Steppe
  land(9, 58, 8, 30, 7); land(13, 37, 6, 7, 3); land(12, 77, 7, 7, 3);
  m.rect(0, 63, 6, 6, ',');
  // Mirefeste: Lehmhügel mitten in der Lagune, kleine Hütteninseln
  m.ellipse(62, 52, 7.4, 4.6, ',', ['~']);
  m.ellipse(62, 52, 5.6, 3.4, '.', [',']);
  land(55, 40, 2.6, 1.8, 1);                         // Wachturminsel
  // Nebelinseln und das Egelnest (Mitte)
  land(92, 52, 5.4, 3.8, 3);                         // Egelnest
  land(86, 40, 3.2, 2.2, 2); land(97, 44, 2.6, 1.8, 1); land(84, 61, 3.6, 2.4, 2); land(99, 62, 2.6, 1.8, 1);
  land(78, 34, 2.2, 1.4, 1); land(104, 54, 1.8, 1.4, 1);
  // Versunkenes Dorf: kleine Inseln in der Lagune (A–F) und die Kapelleninsel
  land(25, 9, 4.2, 2.8, 2); land(35, 7, 3, 2, 2); land(46, 10, 4.2, 2.6, 2);
  land(28, 19, 3.6, 2.4, 2); land(41, 21, 4.2, 2.6, 2); land(52.5, 19, 3.8, 2.6, 2);
  land(56.5, 5, 2.6, 1.8, 1);
  // Schilfinseln mit Hexeninsel und Schmuggler-Inseln
  land(67, 27, 4, 2.6, 2); land(75, 21, 4.6, 3, 3); land(83, 15, 6, 3.8, 3); land(70, 12, 4.4, 3, 2);
  land(91, 25, 9, 5, 2); land(61, 18, 3.4, 2.2, 2);
  land(100, 22, 2.2, 1.4, 1); land(62, 6, 2.2, 1.4, 1); land(20, 33, 2, 1.3, 1);
  // Frostpass (Nordufer) mit Felsnasen
  land(100, 8, 10, 6.5, 4); m.rect(96, 0, 8, 5, ',');
  rock(91, 3, 4, 2.4); rock(110, 4, 4.6, 3); rock(106, 1, 3, 2);
  // Sporentor-Insel (felsig, Tor in der Nordwand)
  land(131, 19, 14.5, 11, 5); land(122, 22, 6, 4, 2);
  rock(132, 4, 11, 3.4, 3); rock(144, 10, 4, 6, 2); rock(120, 9, 3, 2.4, 1);
  // Nebelsee: Insel des Moorgrauens
  land(114, 50, 6.4, 4.2, 3); land(108, 40, 1.8, 1.2, 1); land(120, 61, 2, 1.3, 1);
  // Pfahlsumpf: Inseln P1–P6
  land(130, 66, 4.6, 3.2, 3); land(129, 50, 4.6, 3.2, 3); land(139, 41, 5, 3.4, 3);
  land(141, 58, 4.4, 3, 2); land(127, 38, 3.4, 2.4, 2); land(139, 73, 4, 2.6, 2);
  // Pilzwald (große Insel im Südwesten) und Hexeninsel in der Ecke
  land(31, 86, 21, 11, 7); land(48, 76, 6, 4, 3); land(20, 74, 5, 4, 2);
  land(8.5, 96, 4.2, 3, 2);
  // Alter Damm: Seiteninseln und die Karawaneninsel
  land(76, 88, 4, 2.4, 2); land(102, 90, 5, 3, 2); land(121, 86, 3.4, 2.2, 2);
  land(139, 93, 6.4, 4.4, 3);
  // Kleine Schilf- und Weideninseln in den offenen Lagunen (Reiherinsel, Schlangenschilf, Südschilf)
  land(30, 46, 3.6, 2.4, 2); land(40, 40, 2, 1.4, 1); land(25, 55, 2.2, 1.4, 1);
  land(70, 70, 3.4, 2.2, 2); land(92, 73, 4, 2.6, 2); land(81, 66, 1.8, 1.2, 1);
  land(64, 96, 3, 2, 2); land(90, 95, 3.4, 2.2, 2); land(117, 97, 2.6, 1.6, 1); land(72, 38, 2, 1.3, 1);
  m.rect(14, 82, 4, 4, '~');                          // Kanal Marschufer/Pilzwald offen halten
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m.get(x, y) === '~') wet.set(x, y, 'w');

  // ------------------------------------------------ Knüppeldämme (geschwungen, 3 breit)
  road([[0, 66], [8, 66], [16, 68], [24, 70], [32, 67], [38, 62], [42, 58]], 3);    // Ankunft -> Lagune
  road([[56, 49], [52, 44], [50, 38], [46, 33], [38, 30], [28, 29], [18, 31], [14, 33]], 3); // Feste -> Norddamm (West)
  road([[50, 38], [58, 33], [64, 30], [67, 27]], 2.8);                                // -> Schilfinseln
  road([[62, 57], [60, 63], [56, 68], [52, 73], [48, 76]], 3);                         // Feste -> Pilzwald-Insel
  road([[56, 68], [62, 74], [70, 80], [82, 83], [96, 82], [110, 79], [122, 80], [132, 83], [138, 88], [140, 92]], 3); // Alter Damm
  road([[108, 12], [116, 11], [122, 13], [128, 15]], 3);                               // Frostpass -> Sporentor
  // Pfade über Land
  road([[10, 64], [12, 52], [12, 44], [14, 33]], 2);                                   // Marschufer Nord
  road([[16, 68], [14, 74], [17, 78]], 1.8);                                           // Marschufer Süd
  road([[67, 27], [71, 24], [75, 21]], 2.2); road([[75, 21], [80, 18], [83, 16]], 2.2);
  road([[92, 12], [97, 10], [100, 6], [100, 0]], 2.6); road([[100, 9], [104, 11], [108, 12]], 2.4);
  road([[128, 15], [131, 14]], 2.4);
  road([[48, 76], [42, 74], [34, 76], [27, 81], [24, 88], [28, 94], [38, 95], [46, 90], [50, 82], [48, 76]], 1.8); // Pilzwald-Rundweg
  road([[24, 86], [17, 89]], 1.4);
  road([[140, 92], [140, 94]], 2);
  // Furten
  const fordMask = new MapBuilder(W, H, ' ');
  const ford = (pts, w = 2.2) => { const c = curve(pts); fordMask.path(c, w, 'F'); net.mask.path(c, w + 1, 'R'); };
  ford([[83, 16], [88, 13], [92, 12]]);
  ford([[61, 18], [64, 22], [67, 26]], 1.8);
  ford([[70, 12], [75, 13], [80, 15]], 1.8);
  ford([[76, 22], [82, 24], [87, 24]], 1.8);
  ford([[17, 78], [19, 75]], 1.8);
  ford([[13, 91], [11, 93], [10, 94]], 2.2);                                           // versteckt: zur Hexenhütte
  ford([[74, 81], [76, 86]], 1.8); ford([[101, 81], [102, 87]], 1.8); ford([[121, 80], [121, 84]], 1.8);
  ford([[86, 42], [89, 47], [91, 49]], 1.8);                                           // Nebelinsel -> Egelnest
  ford([[94, 56], [91, 59], [86, 60]], 1.8);
  ford([[95, 49], [97, 46]], 1.6);
  ford([[94, 57], [97, 60], [99, 62]], 1.8);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (fordMask.get(x, y) !== 'F') continue;
    if (m.get(x, y) === '~') put(x, y, '%');
    else if (m.get(x, y) === ',') put(x, y, '.');
  }

  // ------------------------------------------------ Bohlenstege (geschwungen, knorrig)
  const walkMask = new MapBuilder(W, H, ' ');
  const isDeck = (x, y) => walkMask.get(x, y) === 'D';
  // pts: Stützpunkte; die Zwischenpunkte werden leicht verschoben (knorrig)
  const walk = (pts, w = 1.9) => {
    const j = pts.map(([x, y], i) => (i === 0 || i === pts.length - 1 ? [x, y] : [x + rng.range(-0.8, 0.8), y + rng.range(-0.8, 0.8)]));
    const tmp = new MapBuilder(W, H, ' ');
    tmp.path(curve(j, 0.35), w, 'S');
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (tmp.get(x, y) !== 'S') continue;
      const c = m.get(x, y);
      if (c === '~' || c === '%') walkMask.set(x, y, 'D');
      else if (c === ',') put(x, y, '.');
    }
  };
  const plat = (cx, cy, rx, ry) => { for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 && m.get(x, y) === '~') walkMask.set(x, y, 'D'); };
  // Mirefeste: Stege vom Lehmhügel zu den Pfahlhütten, Anleger und Markt
  const huts = [[50, 45], [69, 43], [77, 49], [72, 61], [53, 61], [46, 60]];
  walk([[42, 58], [46, 57], [50, 55], [55, 53]], 2.2);                 // Damm -> Hügel (Westanleger)
  walk([[58, 49], [55, 48], [52, 48], [50, 47]]);                      // Hütte NW
  walk([[64, 48], [66, 46], [69, 45]]);                                // Hütte N
  walk([[68, 51], [72, 51], [76, 51], [77, 51]]);                      // Hütte O (über den Markt)
  plat(73, 52.5, 3.2, 2.2);                                            // Marktplattform
  walk([[66, 56], [69, 58], [72, 60], [72, 63]]);                      // Hütte SO
  walk([[58, 56], [55, 59], [53, 63]]);                                // Hütte SW
  walk([[56, 49], [55, 45], [55, 42]], 1.7);                           // Wachturminsel
  walk([[77, 51], [82, 50], [86, 51], [88, 52]], 1.8);                 // Ost: zu den Nebelinseln und dem Egelnest
  // Versunkenes Dorf
  walk([[28, 9], [31, 7], [33, 8]], 1.7); walk([[37, 8], [40, 10], [43, 10]], 1.7);
  walk([[26, 11], [24, 14], [27, 17]], 1.7); walk([[49, 12], [51, 15], [51, 17]], 1.7);
  walk([[31, 20], [34, 21], [37, 21]], 1.7); walk([[43, 23], [42, 26], [44, 29]], 1.7);
  walk([[29, 21], [28, 25], [29, 28]], 1.7); walk([[52, 7], [53, 6], [55, 6]], 1.5); walk([[49, 9], [51, 7]], 1.5);
  // Nebelsee: der lange Steg zur Insel des Moorgrauens
  walk([[110, 80], [111, 74], [108, 69], [111, 63], [113, 57], [114, 55]], 1.8);
  // Pfahlsumpf
  walk([[124, 66], [122, 62], [126, 57], [129, 54]], 1.8);            // P1 -> P2
  walk([[133, 48], [136, 46], [137, 44]], 1.8);                       // P2 -> P3
  walk([[127, 41], [128, 44], [129, 47]], 1.8);                       // P5 -> P2
  walk([[140, 45], [142, 50], [141, 55]], 1.8);                       // P3 -> P4
  walk([[132, 68], [135, 71], [136, 72]], 1.8);                       // P1 -> P6
  walk([[129, 69], [129, 74], [128, 79]], 1.8);                       // P1 -> Alter Damm
  walk([[139, 38], [138, 33], [136, 29]], 1.8);                       // P3 -> Sporentor
  walk([[131, 39], [134, 41], [135, 41]], 1.7);                       // P5 -> P3
  walk([[120, 50], [123, 50], [125, 50]], 1.7);                       // Moorgrauen-Insel -> P2 (Hinterausgang)

  // Stegzellen setzen: Zeichen je Rolle (Bretter darunter / Kante) und Lage
  const decorMap = {
    w: 'willowTrees', d: 'deadStumps', r: 'reeds', u: 'mushrooms', k: 'mossRocks',
    H: 'stiltHut', W: 'watchtower', P: 'bannerPole', F: 'campfireBig',
    R: 'sunkenHouse', G: 'sporeGate', L: 'lanternPost', '%': 'fordShallows',
    K: 'damBankN', Q: 'damBankS', Y: 'damStakesL', J: 'damStakesR', o: 'lilyPads', O: 'sunkenRoof', x: 'mistWisps', y: 'drownedBoat',
    m: 'giantShroom', X: 'witchHut', n: 'drownedTree', i: 'willWisp', g: 'marshGraves',
    b: 'mooredBoat', N: 'netRack', E: 'leechClutch', T: 'dryingRack',
  };
  let solid = 'WKQYJoOxyXniHLbNET';
  const walkChars = {};
  let nextCh = 0x100;
  const walkChar = (name, isSolid) => {
    const k = name + (isSolid ? '#' : '');
    if (!walkChars[k]) { const c = String.fromCharCode(nextCh++); walkChars[k] = c; decorMap[c] = name; if (isSolid) solid += c; }
    return walkChars[k];
  };
  {
    const ground = (x, y) => ',.:'.includes(m.get(x, y)) || m.get(x, y) === '%';
    const cont = (x, y) => isDeck(x, y) || ground(x, y);
    const boardsFor = (x, y) => {                      // Bretter der Stegzelle (x, y)
      const h = isDeck(x - 1, y) || isDeck(x + 1, y), v = isDeck(x, y - 1) || isDeck(x, y + 1);
      if (h && !v) return `walkX${+cont(x, y - 1)}${+cont(x, y + 1)}`;
      return `walkY${+cont(x - 1, y)}${+cont(x + 1, y)}`;
    };
    const cells = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (isDeck(x, y)) cells.push([x, y, isDeck(x, y + 1) ? boardsFor(x, y + 1) : `walkRim${+cont(x - 1, y)}${+cont(x + 1, y)}`, false]);
      else if (isDeck(x, y + 1)) {
        const c = m.get(x, y);
        if (c === '~' || c === '%') cells.push([x, y, boardsFor(x, y + 1), true]);           // Träger im Wasser
        else if (c === ',' || c === '.') cells.push([x, y, boardsFor(x, y + 1), false]);     // Anleger an Land
      }
    }
    for (const [x, y, name, s] of cells) put(x, y, walkChar(name, s));
    // knorrige Pfähle neben den Stegen
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (m.get(x, y) !== '~' || isDeck(x, y + 1) || isDeck(x, y)) continue;
      if ((isDeck(x - 1, y) || isDeck(x + 1, y)) && rng.chance(0.12)) put(x, y, walkChar('walkPost', true));
    }
  }
  const freeWater = (x, y) => m.get(x, y) === '~' && !isDeck(x, y + 1);

  // Dammufer: Böschung mit Faschinen über und unter den Dämmen (nur über Wasser)
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (m.get(x, y) !== '.' || wet.get(x, y) !== 'w') continue;
    if (m.get(x, y - 1) === '~') put(x, y - 1, 'K');
    if (m.get(x, y + 1) === '~') put(x, y + 1, 'Q');
    if (m.get(x - 1, y) === '~' && m.get(x, y - 1) !== '~') put(x - 1, y, 'Y');
    if (m.get(x + 1, y) === '~' && m.get(x, y - 1) !== '~') put(x + 1, y, 'J');
  }

  // ------------------------------------------------ Mirefeste: Pfahldorf
  // Hütte im Wasser neben dem Steg-Ende (Leiter zum Steg), nie auf einer Träger- oder Stegzelle
  const placeNear = (x0, y0, ch, prefer) => {
    const cand = [];
    for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
      const x = x0 + i, y = y0 + j;
      if (!freeWater(x, y) || isDeck(x, y)) continue;
      cand.push([(prefer(x, y) ? 0 : 100) + i * i + j * j, x, y]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    if (cand.length) put(cand[0][1], cand[0][2], ch);
    return cand.length ? [cand[0][1], cand[0][2]] : null;
  };
  for (const [x, y] of huts) placeNear(x, y, 'H', (hx, hy) => isDeck(hx, hy + 2) || isDeck(hx - 1, hy + 1) || isDeck(hx + 1, hy + 1));
  put(55, 40, 'W');                                   // Wachturm auf der kleinen Insel
  put(62, 51, 'F'); put(59, 49, 'P'); put(65, 49, 'P');
  put(62, 49, 'A'); put(57, 53, 'B'); put(67, 54, 'M');
  put(62, 55, '1'); put(60, 55, '2');
  const waystone = { x: 66, y: 51 };                  // Stein auf 66–67 × 50–51, Ankunft davor
  put(66, 53, '6');
  // Boote, Netze, Trockengestelle und Laternen im Wasser rund um das Dorf
  each([[48, 50], [75, 56], [58, 59], [70, 47]], (x, y) => { if (freeWater(x, y)) put(x, y, 'b'); });
  each([[52, 51], [74, 45], [66, 60], [44, 58]], (x, y) => { if (freeWater(x, y)) put(x, y, 'N'); });
  each([[57, 47], [69, 56]], (x, y) => { if (m.get(x, y) === ',' || m.get(x, y) === '.') put(x, y, 'T'); });
  each([[45, 56], [51, 53], [60, 46], [71, 49], [79, 50], [70, 58], [56, 58]], (x, y) => { if (freeWater(x, y)) put(x, y, 'L'); });

  put(4, 66, '3');
  // Versunkenes Dorf: halb versunkene Häuser an Inselrändern, Dächer im Wasser
  each([[24, 10], [36, 8], [47, 11], [27, 20], [42, 22], [52, 20]], (x, y) => put(x, y, 'R'));
  each([[22, 15], [46, 16], [33, 13], [38, 16], [20, 20], [48, 25], [35, 25], [56, 13], [23, 25], [31, 3], [39, 13]], (x, y) => { if (freeWater(x, y)) put(x, y, 'O'); });
  put(57, 4, 'R');
  // Sporentor
  put(132, 11, 'G'); put(131, 15, '4'); put(126, 13, 'L'); put(138, 13, 'L');
  // Frostpass
  put(97, 4, 'P'); put(103, 4, 'P'); put(100, 5, '5');
  // Laternen entlang der Dämme
  each([[18, 66], [30, 68], [40, 60], [46, 33], [30, 28], [58, 66], [72, 79], [92, 81], [110, 78], [126, 80], [136, 86]], (x, y) => {
    for (const [dx, dy] of [[0, -2], [0, 2], [0, -3], [0, 3]]) if (freeWater(x + dx, y + dy) || m.get(x + dx, y + dy) === ',') { put(x + dx, y + dy, 'L'); break; }
  });
  // Pfahlsumpf: verlassene Pfahlhütten, Hexenhütte, Wracks
  each([[127, 47], [143, 56], [137, 71]], (x, y) => { if (freeWater(x, y)) put(x, y, 'H'); });
  put(7, 96, 'X');
  each([[82, 46], [99, 57], [88, 70], [24, 64], [146, 80], [104, 36], [80, 64], [75, 73], [60, 94], [96, 97], [35, 49], [110, 96]], (x, y) => { if (freeWater(x, y)) put(x, y, 'y'); });

  // ------------------------------------------------ Gegner
  const F = (list, ch) => each(list, (x, y) => foe(m, x, y, ch));
  // Marschufer
  F([[13, 34], [10, 50], [7, 80]], 'l'); F([[16, 38], [14, 78], [10, 46]], 'e');
  // Versunkenes Dorf
  F([[25, 9], [35, 7], [46, 10], [28, 19], [41, 21], [52, 19]], 'e');
  F([[47, 10], [41, 20], [29, 18], [24, 8]], 't');
  F([[45, 9], [52, 19], [25, 10], [45, 21]], 'j');
  F([[50, 18]], 'h');
  // Schilfinseln
  F([[83, 13], [72, 11], [86, 16]], 's'); F([[66, 26], [75, 20], [61, 17]], 'l');
  // Frostpass
  F([[113, 10], [90, 13]], 'l'); F([[108, 14]], 't');
  // Sporentor
  F([[124, 28], [132, 29], [140, 27]], 'j'); F([[116, 12], [144, 24]], 's'); F([[120, 26], [136, 29]], 't');
  // Nebelinseln und Egelnest: Egel, Schleime, Lauerer
  F([[91, 52], [94, 52], [92, 55], [88, 51]], 'e'); F([[93, 50], [96, 54]], 'j'); F([[86, 40], [84, 61]], 'l'); F([[98, 62]], 't');
  // Insel des Moorgrauens
  F([[111, 51], [117, 51]], 'j');
  foe(m, 114, 49, 'Z');
  // Pfahlsumpf
  F([[129, 50], [139, 41], [127, 38], [141, 58]], 's'); F([[131, 51], [137, 43], [130, 66]], 'h');
  F([[128, 67], [142, 59], [139, 73]], 't'); F([[127, 51], [140, 42]], 'e');
  // Pilzwald
  F([[30, 78], [22, 88], [40, 92], [46, 80], [33, 86]], 'j'); F([[26, 92], [48, 86], [20, 74]], 't');
  F([[28, 82], [42, 76], [36, 96], [16, 86]], 'e'); F([[24, 90], [28, 94]], 's'); F([[50, 75]], 'h');
  // Alter Damm
  F([[136, 92], [141, 90], [143, 95], [138, 96], [134, 94], [141, 97]], 'l'); F([[96, 82], [118, 80]], 'l');
  F([[76, 88], [102, 90], [121, 86]], 'e');

  // Egelnest: Gelege auf der Insel (nach den Gegnern, nur auf freiem Boden)
  each([[90, 50], [95, 51], [92, 55], [97, 53], [88, 53]], (x, y) => { if (m.get(x, y) === ',') put(x, y, 'E'); });

  // ------------------------------------------------ Objekte
  const totems = [[82, 13], [24, 92], [139, 39]];
  const caravan = [141, 93];
  const caches = { witch: [9, 97], chapel: [56, 6] };
  const Q = {
    lanternRed: [38, 21],      // am Ende des Stegs zur Insel E (Versunkenes Dorf)
    lanternGreen: [12, 45],    // an der Weide am Marschufer
    lanternBlue: [70, 10],     // am Moosfelsen auf der Schmuggler-Insel
    lanternWhite: [14, 35],    // am Grab der Ertrunkenen (Nordspitze des Marschufers)
    cauldron: [91, 25],        // im Schilf der Hexeninsel (Schilfinseln Ost)
    huts: [[71, 14], [62, 19], [94, 12]], // Stelzenhütten im Nordmoor
  };
  put(11, 44, 'w'); put(69, 9, 'k');
  each([[12, 33], [15, 33], [11, 36], [16, 36], [13, 37]], (x, y) => put(x, y, 'g'));
  F([[85, 24], [97, 25], [88, 28]], 'h');
  each([[89, 23], [90, 23], [93, 23], [94, 24], [89, 27], [93, 27], [94, 26], [88, 25]], (x, y) => { if (m.get(x, y) === ',') put(x, y, 'r'); });

  // ------------------------------------------------ Bewuchs
  const village = { x: 44, y: 38, w: 36, h: 28 };
  const hold = [(x, y) => x >= 54 && x <= 70 && y >= 47 && y <= 57, (x, y) => x <= 6 && y >= 62 && y <= 70, (x, y) => x >= 94 && x <= 106 && y <= 7,
    (x, y) => x >= 124 && x <= 140 && y >= 7 && y <= 16,
    (x, y) => [...totems, caravan, caches.witch, caches.chapel, Q.lanternRed, Q.lanternGreen, Q.lanternBlue, Q.lanternWhite, Q.cauldron, ...Q.huts].some(([sx, sy]) => Math.abs(x - sx) <= 2 && Math.abs(y - sy) <= 2)];
  const keep = (x, y) => hold.some((f) => f(x, y));
  const shroomWood = (x, y) => x < 58 && y > 66;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (m.get(x, y) !== ',' || net.onRoad(x, y) || keep(x, y)) continue;
    const hidden = x >= 9 && x <= 16 && y >= 86 && y <= 94;
    if (near(m, x, y, '~', 1) && rng.chance(hidden ? 0.9 : shroomWood(x, y) ? 0.35 : 0.55)) put(x, y, 'r');
  }
  strew(m, net, rng, keep, (x, y, g, free) => {
    if (g !== ',') return null;
    if (shroomWood(x, y)) {
      if (free && rng.chance(0.16)) return 'm';
      if (rng.chance(0.08)) return 'u';
      if (free && rng.chance(0.02)) return 'd';
      return null;
    }
    const island = near(m, x, y, '~', 3);
    if (free && rng.chance(island ? 0.09 : 0.06)) return 'w';
    if (free && rng.chance(0.03)) return 'd';
    if (rng.chance(0.03)) return 'u';
    if (free && rng.chance(0.012)) return 'k';
    return null;
  });
  // Wasser: Seerosen, Nebelschwaden, Irrlichter, ertrunkene Bäume, Schilfinseln im offenen Wasser
  const deep = (x, y) => { for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (m.get(x + i, y + j) !== '~' || isDeck(x + i, y + j)) return false; return true; };
  const mist = (x, y) => x > 78 && x < 126 && y > 32 && y < 76;
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    if (!deep(x, y)) continue;
    if (mist(x, y) && rng.chance(0.06)) put(x, y, 'x');
    else if ((mist(x, y) || box({ x: 18, y: 2, w: 42, h: 28 }, 0)(x, y)) && rng.chance(0.014)) put(x, y, 'i');
    else if (rng.chance(0.016)) put(x, y, 'n');
    else if (near(m, x, y, 'r', 2) && rng.chance(0.07)) put(x, y, 'o');
    else if (rng.chance(0.008)) put(x, y, 'o');
  }

  return {
    name: 'Die Faulmarsch',
    kind: 'outdoor',
    biome: 'marsh',
    decorSet: 'decor_marsh',
    baseFloor: '~',
    map: m.rows(),
    solid,
    decor: decorMap,
    points: { 1: 'start', 2: 'respawn', 3: 'from_ashen_steppe', 4: 'from_spore_hollow', 5: 'from_frostspire', 6: 'waystone' },
    waystone,
    npcs: { A: 'warden_thane', B: 'alchemist_brisa', M: 'trader_moll' },
    enemies: {
      l: { type: 'bog_lurker' }, s: { type: 'rot_shaman' }, e: { type: 'swamp_leech' },
      t: { type: 'plague_toad' }, j: { type: 'bog_slime' }, h: { type: 'marsh_hag' }, Z: { type: 'bog_horror' },
    },
    respawn: 45,
    areas: [
      { id: 'mirefort', name: 'Mirefeste', town: true, ...village, noMount: true },
      { id: 'marsh_shore', name: 'Marschufer', x: 2, y: 26, w: 19, h: 58 },
      { id: 'sunken_village', name: 'Versunkenes Dorf', x: 18, y: 2, w: 42, h: 28 },
      { id: 'reed_isles', name: 'Schilfinseln', x: 60, y: 6, w: 38, h: 26 },
      { id: 'frost_pass', name: 'Frostpass', x: 90, y: 0, w: 22, h: 14 },
      { id: 'spore_gate', name: 'Sporentor', x: 116, y: 4, w: 32, h: 26 },
      { id: 'mist_isles', name: 'Nebelinseln', x: 80, y: 33, w: 26, h: 33 },
      { id: 'mist_lake', name: 'Nebelsee', x: 106, y: 33, w: 18, h: 43 },
      { id: 'horror_isle', name: 'Insel des Moorgrauens', x: 107, y: 45, w: 15, h: 11 },
      { id: 'stilt_marsh', name: 'Pfahlsumpf', x: 124, y: 33, w: 24, h: 45 },
      { id: 'fungal_wood', name: 'Pilzwald', x: 13, y: 66, w: 31, h: 35 },
      { id: 'witch_hut', name: 'Hexenhütte', x: 3, y: 91, w: 11, h: 10 },
      { id: 'old_dam', name: 'Alter Damm', x: 52, y: 70, w: 96, h: 31 },
      { id: 'spore_glade_1', name: 'Westliche Sporenlichtung', x: 116, y: 17, w: 6, h: 6 },
      { id: 'spore_glade_2', name: 'Östliche Sporenlichtung', x: 138, y: 16, w: 6, h: 6 },
      { id: 'spore_glade_3', name: 'Südliche Sporenlichtung', x: 128, y: 24, w: 6, h: 6 },
    ],
    objects: [
      // Reihenfolge-Rätsel (Thread C): Knochen -> Moos -> Schlamm
      { id: 'rot_totem_1', kind: 'shrine', decor: 'rotTotemBone', name: 'Knochentotem', prompt: 'Knochentotem verbrennen', x: totems[0][0], y: totems[0][1] },
      { id: 'rot_totem_2', kind: 'shrine', decor: 'rotTotemMoss', name: 'Moostotem', prompt: 'Moostotem verbrennen', x: totems[1][0], y: totems[1][1] },
      { id: 'rot_totem_3', kind: 'shrine', decor: 'rotTotemMud', name: 'Schlammtotem', prompt: 'Schlammtotem verbrennen', x: totems[2][0], y: totems[2][1] },
      // Laternen-Rätsel: Rot (am Steg) -> Grün (am Baum) -> Blau (am Stein) -> Weiß (am Grab)
      { id: 'lantern_red', kind: 'shrine', decor: 'lanternRed', tint: 'red', name: 'Rote Laterne', prompt: 'Rote Laterne am Steg entzünden', x: Q.lanternRed[0], y: Q.lanternRed[1] },
      { id: 'lantern_green', kind: 'shrine', decor: 'lanternGreen', tint: 'green', name: 'Grüne Laterne', prompt: 'Grüne Laterne am Baum entzünden', x: Q.lanternGreen[0], y: Q.lanternGreen[1] },
      { id: 'lantern_blue', kind: 'shrine', decor: 'lanternBlue', tint: 'blue', name: 'Blaue Laterne', prompt: 'Blaue Laterne am Stein entzünden', x: Q.lanternBlue[0], y: Q.lanternBlue[1] },
      { id: 'lantern_white', kind: 'shrine', decor: 'lanternWhite', tint: 'white', name: 'Weiße Laterne', prompt: 'Weiße Laterne am Grab entzünden', x: Q.lanternWhite[0], y: Q.lanternWhite[1] },
      { id: 'hag_cauldron', kind: 'shrine', decor: 'hagCauldron', name: 'Hexenkessel', prompt: 'Hexenkessel umstoßen', x: Q.cauldron[0], y: Q.cauldron[1] },
      { id: 'smuggler_hut_1', kind: 'shrine', decor: 'stiltHut', name: 'Schmugglerhütte', prompt: 'Schmugglerhütte durchsuchen', x: Q.huts[0][0], y: Q.huts[0][1] },
      { id: 'smuggler_hut_2', kind: 'shrine', decor: 'stiltHut', name: 'Schmugglerhütte', prompt: 'Schmugglerhütte durchsuchen', x: Q.huts[1][0], y: Q.huts[1][1] },
      { id: 'smuggler_hut_3', kind: 'shrine', decor: 'stiltHut', name: 'Schmugglerhütte', prompt: 'Schmugglerhütte durchsuchen', x: Q.huts[2][0], y: Q.huts[2][1] },
      { id: 'lost_caravan', kind: 'item', decor: 'caravanWreck', prompt: 'Wrack durchsuchen', x: caravan[0], y: caravan[1] },
      { id: 'marsh_witch_cache', kind: 'chest', decor: 'witchChest', prompt: 'Hexentruhe öffnen', x: caches.witch[0], y: caches.witch[1] },
      { id: 'sunken_chapel_cache', kind: 'chest', decor: 'chapelChest', prompt: 'Opferstock aufbrechen', x: caches.chapel[0], y: caches.chapel[1] },
    ],
    portals: [
      { id: 'to_ashen_steppe', x: 0.6, y: 66, range: 26, visual: 'road', dir: [-1, 0],
        to: { zoneId: 'ashen_steppe', spawnId: 'from_blighted_marsh' }, prompt: 'Westwärts in die Aschensteppe' },
      { id: 'to_spore_hollow', x: 132, y: 12.2, range: 26, requires: { level: 29 },
        to: { zoneId: 'spore_hollow', spawnId: 'start' }, prompt: 'Den Sporenschlund betreten' },
      { id: 'to_frostspire', x: 100, y: 1.2, range: 28, requires: { level: 31 }, visual: 'road', dir: [0, -1],
        to: { zoneId: 'frostspire', spawnId: 'from_blighted_marsh' }, prompt: 'Den Frostpass hinauf' },
    ],
    signText: 'Nord: Der Frostpass · Nordost: Der Sporenschlund · Ost: Nebelinseln, Nebelsee und Pfahlsumpf · Süd: Pilzwald und Alter Damm · West: Die Aschensteppe',
  };
}
