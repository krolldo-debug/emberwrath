import { createRng, hash2 } from '../../core/math.js';
import { MapBuilder } from '../levels.js';
import { near, box, each, blob, roadNet, foe, strew, circle } from '../mapkit.js';
import { noise2, rimRock, forestFill, bridgeH, waterSpan, sealPockets } from './emberhollow.js';

// ---------------------------------------------------------------- Der Aschenwald (Stufe 6–12)
// Ein Mischwald statt eines Nadelteppichs: Tannenhorste im Norden und an der Schlucht,
// rostrotes Laub in der Mitte, Birkenhaine im Westen; dazwischen Lichtungen, zwei
// Bachläufe und eine Insel. Man kommt von Westen durch den Birkenhain und folgt dem
// Laternenweg ein gutes Stück, bis das Baumlager der Wächter auf seiner Lichtung liegt.
// Teilgebiete (Bildschirm ≈ 40×22 Kacheln, jedes hat etwas Eigenes):
//   Birkenhain (West)          Ankunft, weiße Birken, Steinmänner am Weg
//   Wächterlager (West-Mitte)  Baumlager: Plattformen in alten Tannen, Zeltkreis ums Feuer
//   Keilerwiese (Nordwest)     weite Wiese mit Findlingen, Keiler; Aussicht am Nordhang
//   Flüsterhain (Nord)         Runensteinkreis, bleiche Bäume, Leuchtpilze
//   Aschenschlucht / Aufstieg  Hängebrücke, Wegzoll, Weg zu den Schlackenhöhen
//   Wildererversteck           Geheimecke hinter einer Felsenge (Nordost)
//   Köhlerplatz (Mitte)        rauchende Meiler, von Banditen besetzt, Glutkäfer an der Glut
//   Rabenruine (Ost)           Banditenlager in der Burgruine, Rask im Burghof
//   Alter Steinbruch           Felskessel mit Käfern und Dornkriechern
//   Mühleninsel                Bach teilt sich um eine Insel mit Mühlenruine
//   Quelle / Keilersuhle (SO)  Quellteich des Ostbachs, umgestürzter Turm, Suhle der Keiler
//   Kahlschlag (Süd)           Stümpfe und Holzstapel, Keiler
//   Dornendickicht (Südwest)   Dornen, alte Eiche, Einsiedlerruine mit Oonas Tasche
//   Tempelufer (Südost)        See mit Tempelruine und drei Schutztotems

export function buildAshwood() {
  const W = 128, H = 88;
  const m = new MapBuilder(W, H, ',');
  const rng = createRng(6163);
  rimRock(m, rng, { top: 3, side: 2, bottom: 2, seed: 61 });
  const net = roadNet(m);
  const road = net.road;
  const put = (x, y, ch) => m.set(x, y, ch);

  // --- Felsen: Nordrand-Nasen, Steinbruch, Wildererversteck
  blob(m, rng, 30, 5, 4, 2.2, '#', null, 2);
  blob(m, rng, 122, 32, 3, 5, '#', null, 3);
  blob(m, rng, 60, 85, 6, 2.4, '#', null, 2);
  // Steinbruch: Felskessel mit Öffnung nach Norden
  const quarry = { cx: 70, cy: 56 };
  blob(m, rng, 70, 56.5, 8, 5.5, '#', null, 4);
  m.ellipse(70, 56.5, 5.6, 3.6, '.');
  m.rect(68, 50, 4, 4, ',');
  // Wildererversteck
  m.rect(110, 3, 3, 14, '#');
  m.rect(113, 14, 13, 3, '#');
  m.ellipse(118.5, 9, 4.6, 3.6, ',');
  m.rect(110, 9, 5, 2, ',');

  // Keilerwiese: Suhltümpel und Findlingsgruppe
  blob(m, rng, 14, 18, 3.2, 2, '~', null, 2);
  blob(m, rng, 36, 24, 2.6, 1.8, '#', null, 2);
  // --- Aschenschlucht (Ost–West): Felswand Nord, Bach, Felskante Süd
  const gy = (x) => 23.5 + Math.sin(x * 0.11) * 1.6 + Math.sin(x * 0.037 + 1) * 1.2;
  for (let x = 44; x <= 125; x++) {
    const c = gy(x), taper = x < 50 ? (50 - x) * 0.35 : 0;
    const n0 = Math.round(c - 3.4 + taper), w0 = Math.round(c - 0.6), w1 = Math.round(c + 1.6), s1 = Math.round(c + 2.3 - taper * 0.3);
    for (let y = n0; y < w0; y++) m.set(x, y, '#');
    for (let y = w0; y <= w1; y++) m.set(x, y, '~');
    if (x > 47) m.set(x, s1, '#');
  }
  // Aschbach: aus der Schlucht nach Süden, teilt sich um die Mühleninsel, mündet in den Tempelsee
  m.path([[45, 24], [42, 30], [43.5, 36], [44.5, 42], [43, 49], [45, 55], [50, 59.5]], 2.6, '~');
  m.path([[50, 59.5], [50.5, 64], [51.5, 69.5], [57, 74.5]], 2.2, '~');           // Westarm
  m.path([[50, 59.5], [57, 60], [63.5, 63.5], [64.5, 69.5], [57, 74.5]], 2.2, '~'); // Ostarm
  m.path([[57, 74.5], [64, 75.5], [71, 76]], 2.6, '~');
  // Tempelsee
  blob(m, rng, 90, 77.5, 15, 6, '~', null, 5);
  m.ellipse(76, 76, 5, 3, '~');
  // Ostbach: Quellteich, kurzer Lauf in den See
  m.ellipse(112, 62.5, 3.2, 2.2, '~');
  m.path([[111, 64], [108, 67.5], [104.5, 71.5]], 2, '~');
  // Keilersuhle: Schlammtümpel in der Südostecke
  m.ellipse(119, 77, 3.4, 2.2, '~');

  const spanMain = waterSpan(m, 41, 36, 52);
  const WATER0 = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m.get(x, y) === '~') WATER0[y * W + x] = 1;

  // ---------------------------------------------------------------- Wege (geschwungen, mit Zweck)
  m.rect(0, 60, 3, 5, ',');                                          // Westausgang
  m.rect(100, 0, 8, 4, ',');                                         // Nordausgang (Aufstieg)
  // Laternenweg: Ankunft – Birkenhain – Baumlager
  road([[0, 62], [6, 62], [11, 60], [15, 56.5], [19, 52.5], [24, 49.5], [28, 47]], 2.4);
  // Aschenpfad: Lager – Bachbrücke – Hirschstein – Rabenruine
  road([[30, 42], [35, 41.5], [40, 41.5]], 2.4);
  road([[49, 41.5], [53, 40.5]], 2.4);
  road([[53, 40.5], [58, 43], [64, 45.5], [71, 46.5], [79, 48], [88, 46.5]], 2.4);
  // Nordweg: Hirschstein – Köhlerplatz – Hängebrücke
  road([[53, 40.5], [55, 36], [59, 33], [65, 31.5], [71, 32.5], [76.5, 31.5]], 2.4);
  const bx = 77;
  let r0 = 99, r1 = -1;
  for (let y = 10; y < 34; y++) if (m.get(bx, y) === '#' || m.get(bx, y) === '~' || m.get(bx + 1, y) === '#' || m.get(bx + 1, y) === '~') { r0 = Math.min(r0, y); r1 = Math.max(r1, y); }
  m.rect(bx, r0, 2, r1 - r0 + 1, '.');
  road([[77.5, r0 - 0.5], [80, 15], [87, 11.5], [95, 8.5], [101, 6], [104, 3], [104, 0]], 2.4);  // Aufstieg
  road([[77.5, r1 + 0.5], [76.5, 31.5]], 2);
  // Nordschleife: Lager – Keilerwiese – Flüsterhain – Aufstieg; Abzweig zur Aussicht am Nordhang
  road([[28, 35], [26.5, 28], [29, 21], [35, 16], [44, 12], [53, 10], [62, 9.5], [70, 10.5], [76, 12.5], [80, 15]], 2);
  road([[29, 21], [24, 14], [21, 7]], 1.6);
  road([[62, 9.5], [62, 16]], 1.6);
  road([[95, 8.5], [103, 12], [108, 10]], 1.6);                       // zum Wildererversteck
  m.rect(108, 9, 5, 2, '.');
  // Südweg: Hirschstein – Mühleninsel (Furten über beide Arme) – Tempelufer
  road([[53, 41], [55, 47], [55.5, 53], [57.5, 58], [58, 63], [58.5, 67]], 1.8);
  road([[58.5, 66], [63, 65.5], [69, 64], [76, 62.5], [83, 63.5], [89, 65.5]], 1.8);
  road([[66, 49], [69, 52]], 1.6);                                   // in den Steinbruch
  // Westschleife: Insel – Westfurt – Kahlschlag-Abzweig – alte Eiche – Laternenweg
  road([[58, 66], [53, 67], [47, 68.5], [40, 71], [32, 73], [26, 71.5], [21, 67], [17, 62], [13, 59.5]], 1.8);
  road([[45, 69], [48, 75], [51, 79]], 1.6);                           // Kahlschlag
  road([[30, 73], [24, 77], [14, 80], [10, 80.5]], 1.4);               // Einsiedlerruine
  // Ruine Süd – Tempelufer, Quelle, Suhle
  road([[100.5, 57], [97, 61], [92, 64.5], [90, 66]], 1.8);
  road([[100.5, 57], [106, 59], [110, 59.5], [116, 62], [117.5, 68], [118, 73]], 1.6);
  road([[88, 47], [89, 47]], 2);
  // Ruine Nord: Mauerlücke zum Schluchtrand
  road([[101, 36], [102.5, 32.5], [105, 30.5]], 1.4);
  // Uferpfad zum Bachversteck
  road([[49, 42], [48.5, 46], [47.5, 50]], 1.4);

  // Brücke über den Aschbach, Furten (Trittsteine) wo Wege Wasser kreuzen
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (WATER0[y * W + x] && m.get(x, y) === '.') put(x, y, 'i');
  bridgeH(m, 41, spanMain[0] - 1, spanMain[1] + 1);
  m.path([[38, 41.5], [spanMain[0] - 1, 41.5]], 2, '.', [',']);
  m.path([[spanMain[1] + 1, 41.5], [50, 41.5]], 2, '.', [',']);

  // ---------------------------------------------------------------- Wächterlager: Baumlager um eine Lichtung
  const camp = { x: 17, y: 32, w: 25, h: 19 };
  blob(m, rng, 29, 42, 10.5, 7.5, '.', [','], 3);
  m.ellipse(29, 42, 11.5, 8.4, ',', ['.']);
  blob(m, rng, 29, 42, 9.5, 6.5, '.', [','], 2);
  m.ellipse(29, 42.5, 2.2, 1.5, ':');
  // Plattform-Tannen am Lichtungsrand (Leitern), Zeltkreis ums Feuer
  each([[20, 37], [38, 36], [37, 49], [19, 47]], (x, y) => put(x, y, 'N'));
  put(29, 42, 'F');
  each([[24, 39], [34, 39], [23, 45], [33, 46]], (x, y) => put(x, y, 'T'));
  put(29, 37, 'P'); put(26, 49, 'L'); put(35, 44, 'L');
  // Laternen und Steinmänner führen vom Westrand herein
  each([[5, 60], [12, 58], [17, 53], [22, 50]], (x, y) => put(x, y, 'S'));
  each([[9, 63], [14, 54]], (x, y) => put(x, y, 'J'));
  // Nordschleife: Steinmänner
  each([[27, 31], [31, 18], [42, 14], [55, 11], [73, 11]], (x, y) => put(x, y, 'J'));
  put(52, 38, 'r'); put(54, 38, 'J');                                // Hirschstein

  // ---------------------------------------------------------------- Köhlerplatz (von Banditen besetzt)
  blob(m, rng, 63, 35.5, 7.5, 4.5, '.', [','], 3);
  each([[58, 36], [67, 34], [63, 39]], (x, y) => put(x, y, 'C'));
  put(61, 31, 'L'); put(70, 37, 'L'); put(66, 30, 'K');

  // ---------------------------------------------------------------- Rabenruine
  const ruin = { x: 87, y: 35, w: 31, h: 22 };
  blob(m, rng, 102, 46, 13, 9, '.', [','], 4);
  m.ellipse(102, 46, 6, 4, ':', [',', '.']);
  for (let x = 88; x <= 116; x++) {
    const n = hash2(x, 1, 91), s = hash2(x, 2, 91);
    if (x < 99 || x > 104) put(x, 36, n < 0.12 ? '.' : 'w');
    if (x < 99 || x > 102) put(x, 56, s < 0.1 ? '.' : 'w');
  }
  for (let y = 37; y <= 55; y++) {
    if (y < 45 || y > 48) put(88, y, hash2(1, y, 92) < 0.1 ? '.' : 'v');
    put(116, y, hash2(2, y, 92) < 0.08 ? '.' : 'v');
  }
  put(88, 36, 'M'); put(116, 36, 'M'); put(116, 56, 'M');
  m.rect(99, 36, 4, 1, '.'); m.rect(88, 45, 1, 4, '.'); m.rect(99, 56, 4, 1, '.');
  for (let x = 106; x <= 111; x++) put(x, 41, 'w');
  for (let y = 42; y <= 44; y++) put(111, y, 'v');
  for (let x = 92; x <= 95; x++) put(x, 51, 'w');
  put(91, 39, 'K'); put(113, 39, 'K'); put(113, 52, 'K'); put(94, 54, 'K'); put(108, 53, 'K');
  put(108, 43, 'K');                                                  // Zelt des Anführers
  put(102, 42, 'P'); put(102, 46, 'F'); put(96, 44, 'Q'); put(108, 48, 'L'); put(91, 48, 'P');

  // ---------------------------------------------------------------- Weitere Orte
  // Tempelufer
  put(90, 67, 'R'); put(84, 69, 'P'); put(96, 69, 'P');
  // Aufstieg
  put(101, 4, 'P'); put(107, 4, 'P');
  // Flüsterhain
  m.ellipse(62, 10, 7, 4.2, ',');
  circle(m, 62, 10.5, 5.8, 3.6, 7, 'k', 0.35);
  put(62, 9, '.'); put(56, 10, '.'); put(68, 10, '.');
  each([[54, 7], [70, 13], [57, 15], [71, 6]], (x, y) => put(x, y, 'j'));
  // Mühleninsel: Mühlenruine
  m.ellipse(57.5, 67, 4.5, 4.5, '.', [',']);
  put(58, 67, 'a'); put(55, 70, 'L'); put(61, 70, 'o');
  // Steinbruch: Findlinge
  each([[66, 57], [73, 55], [71, 59]], (x, y) => put(x, y, 'r'));
  // Kahlschlag: Stümpfe, Holzstapel
  m.ellipse(52, 80, 7, 3.6, ',');
  each([[48, 79], [55, 78], [56, 81], [50, 82], [53, 77]], (x, y) => put(x, y, 'o'));
  put(46, 81, 'L'); put(58, 80, 'L');
  // Quelle (Aussicht Ost), umgestürzter Turm, Suhle
  put(114, 69, 'Y');
  // Alte Eiche, Aussichtsfels Nordhang
  put(24, 70, 'G');
  put(23, 4, 'r'); put(19, 4, 'P');
  each([[10, 10], [38, 18], [20, 26]], (x, y) => put(x, y, 'l'));
  each([[34, 23], [39, 25], [37, 27], [12, 16], [17, 20]], (x, y) => put(x, y, 'r'));
  // Einsiedlerruine im Dornendickicht (Geheimecke mit Oonas Tasche)
  for (let x = 6; x <= 12; x++) if (x !== 9) put(x, 78, 'w');
  for (let y = 79; y <= 82; y++) put(5, y, 'v');
  // Bachversteck: kleine Uferstelle
  m.ellipse(47.5, 50, 1.6, 1.2, ',');
  const thicket = { x: 3, y: 66, w: 34, h: 19 };

  // ---------------------------------------------------------------- Punkte, NPCs
  put(29, 45, '1');   // start (am Feuer)
  put(26, 44, '2');   // respawn
  put(3, 62, '3');    // from_emberhollow
  put(88, 70, '4');   // from_sunken_temple
  put(104, 5, '5');   // from_cinder_peaks
  put(33, 49, '6');   // waystone
  const waystone = { x: 32, y: 47 };
  put(31, 39, 'I');   // Ilsa
  put(22, 42, 'O');   // Oona
  put(37, 44, 'V');   // Vesk

  // ---------------------------------------------------------------- Gegner
  // b Aschekeiler, x Bandit, y Banditenschütze, c Dornkriecher, X Rask, g Glutkäfer, s Schildträger
  each([[16, 14], [22, 10], [33, 22], [38, 8], [12, 24], [20, 22], [40, 26]], (x, y) => foe(m, x, y, 'b'));   // Keilerwiese
  each([[58, 12], [66, 8], [64, 14]], (x, y) => foe(m, x, y, 'c')); foe(m, 70, 8, 'g'); foe(m, 44, 9, 'b'); // Flüsterhain
  each([[90, 10], [98, 12]], (x, y) => foe(m, x, y, 'x')); foe(m, 93, 7, 's'); foe(m, 84, 13, 'y');      // Aufstieg
  each([[73, 34], [81, 33]], (x, y) => foe(m, x, y, 'x')); foe(m, 79, 15, 'y');                          // Hängebrücke
  each([[60, 34], [67, 37]], (x, y) => foe(m, x, y, 'x')); foe(m, 64, 32, 'y'); foe(m, 69, 35, 's');      // Köhlerplatz
  each([[57, 38], [62, 37], [65, 39], [69, 33]], (x, y) => foe(m, x, y, 'g'));                           // Käfer an den Meilern
  each([[92, 41], [97, 47], [107, 46], [104, 51], [96, 53], [110, 38], [113, 47], [100, 39]], (x, y) => foe(m, x, y, 'x')); // Ruine
  each([[94, 38], [114, 43], [110, 54]], (x, y) => foe(m, x, y, 'y'));
  each([[90, 46], [101, 38], [101, 54]], (x, y) => foe(m, x, y, 's'));
  foe(m, 103, 47, 'X');
  each([[68, 56], [72, 57], [70, 55]], (x, y) => foe(m, x, y, 'g')); each([[67, 54], [73, 58]], (x, y) => foe(m, x, y, 'c')); // Steinbruch
  each([[55, 64], [61, 65]], (x, y) => foe(m, x, y, 'c')); foe(m, 57, 71, 'g');                          // Mühleninsel
  each([[50, 79], [54, 81], [56, 78]], (x, y) => foe(m, x, y, 'b'));                                      // Kahlschlag
  each([[10, 70], [16, 76], [28, 78], [32, 69], [8, 74]], (x, y) => foe(m, x, y, 'c'));                  // Dornendickicht
  each([[80, 66], [100, 66]], (x, y) => foe(m, x, y, 'b'));                                               // Tempelufer
  each([[116, 76], [121, 74]], (x, y) => foe(m, x, y, 'b'));                                              // Keilersuhle

  // ---------------------------------------------------------------- Wald: drei Arten, viel Luft
  const clearings = [
    [26, 18, 13, 9], [62, 10.5, 8.5, 5.4], [118.5, 9, 4, 3.2], [113, 9.5, 2.5, 1.2], [104, 6, 6, 4], [86, 12, 6, 4],
    [102, 46, 16, 11.5], [92, 71, 20, 7], [29, 42, 13, 9.5], [4, 62, 4, 3], [63, 35.5, 9, 6], [70, 56.5, 8.5, 6],
    [57.5, 67, 6, 6], [52, 80, 8, 4.4], [112, 62, 6.5, 4.5], [118, 75, 6, 4], [114, 69, 5, 2.5], [24, 70, 6, 4.4],
    [9, 80, 6, 3.4], [47.5, 50, 2.6, 2], [21, 5.5, 4.5, 2.6], [78, 34, 6, 3], [53, 40, 4, 3], [105, 30.5, 3.5, 2.2],
    [12, 57, 5, 4], [36, 63, 5, 3.4], [84, 57, 4, 3], [26, 58, 3.5, 2.5], [120, 46, 3, 3], [76, 72, 4, 2],
  ];
  const inClear = (x, y) => clearings.some(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1);
  const keep = (x, y) => box(camp, 0)(x, y) || box(ruin, 1)(x, y) || inClear(x, y) || net.onRoad(x, y) || near(m, x, y, '~', 1) || near(m, x, y, 'i', 1);
  // Artengrenzen mit Rauschen (keine geraden Kanten), an den Grenzen gemischt
  const wob = (x, y, k) => (noise2(x / 7, y / 7, k) - 0.5) * 12 + (noise2(x / 2.5, y / 2.5, k + 1) - 0.5) * 4;
  const north = (x, y) => y + wob(x, y, 31) < 30 || x + wob(x, y, 33) > 109;      // Tannenhorste an Schlucht und Ostrand
  const west = (x, y) => x + wob(x, y, 35) < 24 && y + wob(x, y, 37) > 48;        // Birkenhain
  const meadow = (x, y) => y + wob(x, y, 39) < 30 && x + wob(x, y, 41) < 44;      // Keilerwiese (licht)
  const thick = (x, y) => box(thicket, 0)(x + Math.round(wob(x, y, 43) * 0.4), y + Math.round(wob(x, y, 45) * 0.4));
  const fray = (x, y) => (noise2(x / 3, y / 3, 47) - 0.5) * 0.34;
  forestFill(m, (x, y) => {
    const d = meadow(x, y) ? 0.3 : thick(x, y) ? 0.3 : north(x, y) ? 0.62 : west(x, y) ? 0.58 : 0.68;
    return d + fray(x, y);
  }, keep, 'Z', 'z', 21);
  // Art je Kachel: Punktwerte mit Grenzrauschen und Zufall, damit sich Laub und Tannen an den Rändern mischen
  const species = (x, y) => {
    const j = (hash2(x, y, 51) - 0.5) * 9;
    const c = Math.max(30 - (y + wob(x, y, 31)), (x + wob(x, y, 33)) - 109) + j;
    const b = Math.min(24 - (x + wob(x, y, 35)), (y + wob(x, y, 37)) - 48) + j * 0.8;
    if (c > 0 && c >= b) return 'Z';
    if (b > 0) return 'D';
    return hash2(x, y, 52) < 0.12 ? 'Z' : 'U';                         // vereinzelte Tannen im Laub
  };
  const isF = (x, y) => { const ch = m.get(x, y); return ch === 'Z' || ch === 'z'; };
  const F = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (isF(x, y)) F.push([x, y]);
  for (const [x, y] of F) {
    let edge = false;
    for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!isF(x + i, y + j) && m.get(x + i, y + j) !== '#') edge = true;
    // Innen kein Schachbrett mehr: zufällige Lücken, Bäume versetzt
    const tree = edge || hash2(x, y, 53) < 0.46;
    m.set(x, y, tree ? species(x, y) : 'z');
  }
  strew(m, net, rng, (x, y) => box(camp, 0)(x, y) || (x > 99 && x < 106 && y < 8), (x, y, g, free) => {
    if (g === '.') {
      if (box(ruin, 0)(x, y)) return free && rng.chance(0.025) ? 'r' : null;
      if (Math.hypot(x - 52, y - 80) < 8) return free && rng.chance(0.05) ? 'o' : null;
      return null;
    }
    if (near(m, x, y, '~', 1)) return rng.chance(0.38) ? 'e' : rng.chance(0.1) ? 'r' : null;
    if (thick(x, y)) {
      if (rng.chance(0.16)) return 'n';
      if (free && rng.chance(0.05)) return rng.chance(0.5) ? 'd' : 'o';
      return rng.chance(0.05) ? 'u' : null;
    }
    if (inClear(x, y) && x > 54 && x < 72 && y < 18) return rng.chance(0.06) ? 'm' : free && rng.chance(0.03) ? 'd' : null; // Hain
    if (west(x, y)) return free && rng.chance(0.05) ? 'd' : rng.chance(0.04) ? 'u' : rng.chance(0.03) ? 'm' : null;
    if (y < 30 && x < 44) return free && rng.chance(0.022) ? 'r' : free && rng.chance(0.02) ? 'l' : rng.chance(0.02) ? 'u' : null;
    if (free && (near(m, x, y, 'U', 2) || near(m, x, y, 'Z', 2) || near(m, x, y, 'D', 2)) && rng.chance(0.09)) {
      const sp = species(x, y);
      return sp === 'Z' ? 't' : sp === 'D' ? 'd' : 'W';                // vorgelagerte Einzelbäume
    }
    if (near(m, x, y, 'U', 1) || near(m, x, y, 'Z', 1)) return rng.chance(0.06) ? (rng.chance(0.6) ? 'u' : 'o') : null;
    if (free && rng.chance(0.035)) return north(x, y) ? 't' : rng.chance(0.7) ? 'W' : 'd';
    if (rng.chance(0.015)) return 'r';
    if (rng.chance(0.02)) return 'u';
    return null;
  }, ',.');
  for (let y = r0 - 1; y < r1; y++) put(bx, y, y === r0 - 1 ? 'A' : y === r1 - 1 ? 'E' : 'h');

  // ---------------------------------------------------------------- Eskorte: Vesks Karren zum Aufstieg
  const routeLine = [[38, 45], [39, 42], [44, 41.5], [49, 41.5], [53, 40.5], [55, 36], [59, 33], [65, 31.5], [71, 32.5], [76.5, 31.5],
    [77.5, r1 + 0.5], [77.5, r0 - 0.5], [80, 15], [87, 11.5], [95, 8.5], [101, 6], [104, 3]];
  const path = [];
  for (let i = 0; i < routeLine.length - 1; i++) {
    const [ax, ay] = routeLine[i], [bx2, by2] = routeLine[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx2 - ax, by2 - ay) / 7));
    for (let k = 0; k < n; k++) path.push([Math.round(ax + ((bx2 - ax) * k) / n), Math.round(ay + ((by2 - ay) * k) / n)]);
  }
  path.push(routeLine[routeLine.length - 1]);
  const nearest = (x, y) => path.reduce((bi, p, i) => (Math.hypot(p[0] - x, p[1] - y) < Math.hypot(path[bi][0] - x, path[bi][1] - y) ? i : bi), 0);
  const escort = {
    kind: 'escort', path,
    ambush: [
      { at: nearest(62, 32), type: 'bandit', n: 3 },                       // Köhlerplatz
      { at: nearest(77.5, r1 + 0.5), type: 'bandit_shieldbearer', n: 3 },  // Südende der Hängebrücke
      { at: nearest(95, 8.5), type: 'bandit', n: 3 },                      // am Aufstieg
    ],
  };

  const SOLID = new Set(['#', '~', '=', 'H', 'f', 'Z', 'z', 'U', 'D', 'N', 'C', 'a', 'w', 'v', 'M', 'B', '<', '>', 'k', 'Y', 'G']);
  sealPockets(m, [29, 45], SOLID, 'Z');

  return {
    name: 'Der Aschenwald',
    kind: 'outdoor',
    biome: 'ashwood',
    decorSet: 'decor_ashwood',
    map: m.rows(),
    solid: 'ZzUDNCawvMkYG<>B',
    decor: {
      t: 'charredPines', d: 'deadBirches', o: 'stumps', u: 'ashBushes', n: 'brambles', r: 'rocks', e: 'reeds',
      T: 'tent', K: 'banditTent', P: 'bannerPole', F: 'campfireBig', L: 'logPile', Q: 'cart', R: 'templeRuin',
      Z: 'deepWood', U: 'broadClump', D: 'birchClump', W: 'broadleaf', N: 'treePlatform', C: 'charcoalKiln', J: 'cairn', S: 'lanternPost', a: 'millRuin',
      w: 'ruinWall', v: 'ruinWallV', M: 'ruinTower', '<': 'logBridgeL', B: 'logBridgeM', '>': 'logBridgeR',
      A: 'ropeBridgeN', h: 'ropeBridge', E: 'ropeBridgeS', i: 'steppingStones', k: 'runeStone', j: 'hauntedTree',
      m: 'glowShrooms', l: 'fallenTree', Y: 'fallenTower', G: 'ancientOak',
    },
    points: { 1: 'start', 2: 'respawn', 3: 'from_emberhollow', 4: 'from_sunken_temple', 5: 'from_cinder_peaks', 6: 'waystone' },
    npcs: { I: 'warden_ilsa', O: 'herbalist_oona', V: 'trader_vesk' },
    enemies: {
      b: { type: 'ash_boar' }, x: { type: 'bandit' }, y: { type: 'bandit_archer' },
      c: { type: 'thorn_crawler' }, X: { type: 'bandit_chief' },
      g: { type: 'ember_beetle' }, s: { type: 'bandit_shieldbearer' },
    },
    respawn: 40,
    questRoutes: { escort_vesk_cart: escort },
    waystone,
    areas: [
      { id: 'ashwood_camp', name: 'Wächterlager', town: true, ...camp },
      { id: 'bandit_camp', name: 'Rabenruine', ...ruin },
      { id: 'temple_shore', name: 'Tempelufer', x: 74, y: 62, w: 34, h: 22 },
      { id: 'peaks_road', name: 'Aufstieg zu den Höhen', x: 96, y: 2, w: 14, h: 10 },
      { id: 'birch_grove', name: 'Birkenhain', x: 3, y: 50, w: 20, h: 16 },
      { id: 'boar_meadow', name: 'Keilerwiese', x: 8, y: 6, w: 36, h: 24 },
      { id: 'whisper_grove', name: 'Flüsterhain', x: 50, y: 4, w: 25, h: 14 },
      { id: 'ash_gorge', name: 'Aschenschlucht', x: 44, y: 18, w: 82, h: 12 },
      { id: 'charcoal_glade', name: 'Köhlerplatz', x: 55, y: 30, w: 17, h: 11 },
      { id: 'old_quarry', name: 'Alter Steinbruch', x: 62, y: 50, w: 17, h: 12 },
      { id: 'mill_island', name: 'Mühleninsel', x: 52, y: 61, w: 12, h: 13 },
      { id: 'clear_cut', name: 'Kahlschlag', x: 44, y: 75, w: 17, h: 9 },
      { id: 'boar_wallow', name: 'Keilersuhle', x: 112, y: 70, w: 13, h: 12 },
      { id: 'thorn_thicket', name: 'Dornendickicht', ...thicket },
      { id: 'poacher_hideout', name: 'Wildererversteck', x: 113, y: 4, w: 12, h: 10 },
      { id: 'ashwood_lookout_n', name: 'Aussicht am Nordhang', x: 18, y: 3, w: 6, h: 6 },
      { id: 'ashwood_lookout_e', name: 'Quelle des Ostbachs', x: 108, y: 58, w: 6, h: 6 },
      { id: 'ashwood_lookout_s', name: 'Alte Eiche', x: 21, y: 67, w: 6, h: 6 },
    ],
    objects: [
      { id: 'ward_totem_1', kind: 'shrine', decor: 'wardTotem', prompt: 'Totem erwecken', x: 79, y: 69 },
      { id: 'ward_totem_2', kind: 'shrine', decor: 'wardTotem', prompt: 'Totem erwecken', x: 100, y: 68 },
      { id: 'ward_totem_3', kind: 'shrine', decor: 'wardTotem', prompt: 'Totem erwecken', x: 108, y: 79 },
      { id: 'lost_satchel', kind: 'item', decor: 'satchel', prompt: 'Tasche aufheben', x: 9, y: 80 },
      { id: 'poacher_cache', kind: 'chest', prompt: 'Truhe öffnen', x: 120, y: 8 },
      { id: 'vesk_cart', kind: 'shrine', decor: 'cart', name: 'Vesks Karren', prompt: 'Karren zu den Schlackenhöhen geleiten', x: 39, y: 46 },
      { id: 'bandit_strongbox', kind: 'shrine', decor: 'strongbox', name: 'Rasks Truhe', prompt: 'Truhe des Anführers aufbrechen', x: 110, y: 44 },
      { id: 'weapon_crate_1', kind: 'shrine', decor: 'weaponCrate', name: 'Waffenkiste', prompt: 'Waffenkiste zerschlagen', x: 34, y: 9 },
      { id: 'weapon_crate_2', kind: 'shrine', decor: 'weaponCrate', name: 'Waffenkiste', prompt: 'Waffenkiste zerschlagen', x: 69, y: 31 },
      { id: 'weapon_crate_3', kind: 'shrine', decor: 'weaponCrate', name: 'Waffenkiste', prompt: 'Waffenkiste zerschlagen', x: 41, y: 70 },
      { id: 'weapon_crate_4', kind: 'shrine', decor: 'weaponCrate', name: 'Waffenkiste', prompt: 'Waffenkiste zerschlagen', x: 85, y: 13 },
      { id: 'bandit_cache_tower', kind: 'shrine', decor: 'cacheTower', name: 'Versteck unter dem Turm', prompt: 'Versteck unter dem Turm durchsuchen', x: 118, y: 70 },
      { id: 'bandit_cache_brook', kind: 'shrine', decor: 'cacheBrook', name: 'Versteck am Bach', prompt: 'Versteck am Bach durchsuchen', x: 47, y: 51 },
    ],
    portals: [
      { id: 'to_emberhollow', x: 0.6, y: 62, range: 26, visual: 'road', dir: [-1, 0],
        to: { zoneId: 'emberhollow', spawnId: 'from_ashwood' }, prompt: 'Westwärts zur Glutsenke' },
      { id: 'to_sunken_temple', x: 90, y: 66.6, range: 26, requires: { level: 10 },
        to: { zoneId: 'sunken_temple', spawnId: 'start' }, prompt: 'Den Versunkenen Tempel betreten' },
      { id: 'to_cinder_peaks', x: 104, y: 1.2, range: 28, requires: { level: 12 }, visual: 'road', dir: [0, -1],
        to: { zoneId: 'cinder_peaks', spawnId: 'from_ashwood' }, prompt: 'Aufstieg zu den Schlackenhöhen' },
    ],
  };
}
