import { createRng, hash2 } from '../../core/math.js';
import { MapBuilder } from '../levels.js';
import { near, box, each, GROUND, blob, roadNet, MISPLACED, foe, strew, circle } from '../mapkit.js';

// ---------------------------------------------------------------- Glutsenke (Stufe 1–6)
// Ein Dorf im Tal. Der Senkbach stürzt im Norden aus der Klippe, treibt die
// Mühle, fließt mitten durchs Dorf (Marktbrücke) und endet im Schilfweiher im
// Südwesten. Gliederung:
//   Dorf Glutsenke (Mitte)   Marktplatz mit Brunnen, Halle (Maren), Schmiede (Brom),
//                            Marktstände, Wegstein, Häuser mit Gärten, Wachfeuer im Süden
//   Mühlbach (Nord)          Wassermühle am Bach, Steg nach Westen
//   Westfelder (West)        Äcker, Heuhaufen, Vogelscheuche, Hof; Glutkäfer in den Furchen
//   Pfortenhain (Westrand)   Steinkreis um die Glutpforte (Endgame)
//   Nordhang (Nordwest)      Kiefernwald mit Lichtungen, Wölfe
//   Alter Friedhof (Nordost) Gräber, Gruft, Katakombentor in der Klippe
//   Wolfsforst (Ost)         dichter Wald, Waldweg zum Aschenwald, Rudel in Lichtungen, Glutfang
//   Glutfelder (Süd)         verbrannte Senke mit glühenden Spalten, Käfer und Wölfe
//   Schilfweiher (Südwest)   See mit Schilf, Uferpfad
//   Alte Glutkäferhöhle      Geheimecke hinter einer Felsenge am Weiher (Truhe)
// Wege: Hauptstraße Pfortenhain – Marktbrücke – Marktplatz – Waldweg – Aschenwald,
// Nordstraße zum Friedhof/Katakombentor, Schleifen über Mühle/Felder und durch die Glutfelder.
//
// Bodenzeichen: ',' Gras  '.' Erde  ':' Pflaster  '~' Wasser  '=' Glutspalte  '#' Fels  'H' Gebäude.
// Feste Deko-Zeichen (level.solid): T Waldbaum, Y Unterholz, i Zaun senkrecht, B/</> Brückengeländer,
// x Ruinenmauer, q Höhlenmund, W Mühle; 'f' (Zaun waagrecht) ist schon im Grundsatz fest.

// Glatter Wertrauschen-Wert 0..1 (Kachelraster, deterministisch)
export function noise2(x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed), c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// Unregelmäßiger Felsrand (oben dicker), eigene Fassung ohne Abhängigkeit von levels2.js
export function rimRock(m, rng, { top = 3, side = 2, bottom = 2, seed = 7 } = {}) {
  const W = m.w, H = m.h;
  for (let x = 0; x < W; x++) {
    const t = top + Math.round(noise2(x / 5, 0, seed) * 2.2);
    for (let y = 0; y < t; y++) m.set(x, y, '#');
    const b = bottom + Math.round(noise2(x / 4, 9, seed) * 1.6);
    for (let y = H - b; y < H; y++) m.set(x, y, '#');
  }
  for (let y = 0; y < H; y++) {
    const l = side + Math.round(noise2(0, y / 4, seed + 1) * 1.6), r = side + Math.round(noise2(5, y / 4, seed + 1) * 1.6);
    for (let x = 0; x < l; x++) m.set(x, y, '#');
    for (let x = W - r; x < W; x++) m.set(x, y, '#');
  }
}

// Waldmasse: feste Zeichen. Randkacheln und jede zweite Innenkachel tragen einen
// Baum (treeCh), der Rest ist Unterholz (fillCh) – so wird der Wald dicht, ohne
// tausende Sprites. dense(x, y) -> 0..1 Dichte, keep(x, y) -> frei lassen.
export function forestFill(m, dense, keep, treeCh, fillCh, seed = 3) {
  const F = new Uint8Array(m.w * m.h);
  for (let y = 1; y < m.h - 1; y++) for (let x = 1; x < m.w - 1; x++) {
    if (m.get(x, y) !== ',' || keep(x, y)) continue;
    const d = dense(x, y);
    if (d <= 0) continue;
    const n = noise2(x / 3.2, y / 3.2, seed) * 0.65 + hash2(x, y, seed + 1) * 0.35;
    if (n < d) F[y * m.w + x] = 1;
  }
  // Einzelkacheln und dünne Zungen entfernen (Wald liest sich als Masse)
  for (let pass = 0; pass < 2; pass++) for (let y = 1; y < m.h - 1; y++) for (let x = 1; x < m.w - 1; x++) {
    if (!F[y * m.w + x]) continue;
    let nb = 0;
    for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) nb += F[(y + j) * m.w + x + i] || m.get(x + i, y + j) === '#' ? 1 : 0;
    if (nb <= 1) F[y * m.w + x] = 0;
  }
  for (let y = 1; y < m.h - 1; y++) for (let x = 1; x < m.w - 1; x++) {
    if (!F[y * m.w + x]) continue;
    let edge = false;
    for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!F[(y + j) * m.w + x + i] && m.get(x + i, y + j) !== '#') edge = true;
    const tree = edge ? true : ((x + (y >> 1)) % 2 === 0 && hash2(x, y, seed + 3) < 0.85);
    m.set(x, y, tree ? treeCh : fillCh);
  }
}

// Brücke über einen senkrecht fließenden Bach (Weg läuft Ost–West, 2 Zeilen breit ab y0).
// Geländer-Segmente sitzen in der Zeile darüber (feste Zeichen, Sprite reicht über den Steg),
// damit der Held auf dem Steg immer vor der Brücke gezeichnet wird.
export function bridgeH(m, y0, x0, x1, chL = '<', chM = 'B', chR = '>') {
  for (let x = x0; x <= x1; x++) { m.set(x, y0, '.'); m.set(x, y0 + 1, '.'); }
  for (let x = x0; x <= x1; x++) m.set(x, y0 - 1, x === x0 ? chL : x === x1 ? chR : chM);
  // Straßen, die breiter als der Steg sind, nicht übers Wasser laufen lassen
  for (let x = x0 + 1; x < x1; x++) if (m.get(x, y0 + 3) === '~' && m.get(x, y0 + 2) === '.') m.set(x, y0 + 2, '~');
}

// Wasserspalten in Zeile y bestimmen (für Brücken)
export function waterSpan(m, y, xa, xb) {
  let a = -1, b = -1;
  for (let x = xa; x <= xb; x++) if (m.get(x, y) === '~') { if (a < 0) a = x; b = x; }
  return [a, b];
}

// Alles, was vom Start aus nicht erreichbar ist und leer ist, wird Wald/Fels (keine toten Taschen).
export function sealPockets(m, start, solidSet, fillCh) {
  const W = m.w, H = m.h, seen = new Uint8Array(W * H), q = [start];
  seen[start[1] * W + start[0]] = 1;
  while (q.length) {
    const [x, y] = q.pop();
    for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + i, ny = y + j;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny * W + nx] || solidSet.has(m.get(nx, ny))) continue;
      seen[ny * W + nx] = 1; q.push([nx, ny]);
    }
  }
  let n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!seen[y * W + x] && GROUND.has(m.get(x, y))) { m.set(x, y, fillCh); n++; }
  return n;
}

export function buildEmberhollow() {
  const W = 100, H = 70;
  const m = new MapBuilder(W, H, ',');
  const rng = createRng(4243);
  rimRock(m, rng, { top: 3, side: 2, bottom: 2, seed: 41 });
  const net = roadNet(m);
  const road = net.road;
  const put = (x, y, ch) => m.set(x, y, ch);

  // --- Gelände: Klippe der Katakomben (Nordost), Felsnasen am Nordhang, Höhlenfels (Südwest)
  m.rect(65, 0, 15, 8, '#');
  blob(m, rng, 63, 6, 3, 2.2, '#', null, 2);
  blob(m, rng, 82, 6.5, 3.2, 2.4, '#', null, 2);
  blob(m, rng, 90, 5, 5, 3, '#', null, 3);
  blob(m, rng, 14, 5, 4, 2.4, '#', null, 2);
  blob(m, rng, 27, 4.5, 3, 1.8, '#', null, 2);
  // Höhlenfels: Felsrücken um die Geheimecke, nur eine schmale Enge von Osten
  blob(m, rng, 8, 57, 6.5, 4, '#', null, 3);
  m.rect(2, 52, 14, 3, '#');
  m.rect(14, 54, 3, 13, '#');
  m.ellipse(8.5, 62.5, 5.2, 3.6, ',');               // Höhlenkessel (frei)
  m.rect(14, 61, 3, 2, ',');                         // Felsenge (2 breit)

  // --- Senkbach: Quelle in der Nordklippe, Mühle, Marktbrücke, Schilfweiher
  const brook = [[39, 1], [38.5, 6], [40.5, 11], [39.5, 17], [41, 23], [40.5, 29], [40, 34], [37.5, 39], [37.5, 45], [34, 50], [29, 55]];
  m.path(brook, 2.7, '~');
  m.path([[39, 0], [39, 4]], 3.2, '~');
  blob(m, rng, 24, 58, 9, 4.6, '~', null, 4);          // Schilfweiher
  m.ellipse(31, 56.5, 3, 2, '~');

  const spanMarket = waterSpan(m, 33, 34, 46), spanMill = waterSpan(m, 18, 33, 47);

  // --- Glutfelder: verbrannte Senke mit Spalten
  blob(m, rng, 58, 58, 12, 6, '.', [','], 6);
  const fissures = [
    [[46, 55], [49.5, 58], [48.5, 62], [51, 66]],
    [[60, 52.5], [63, 56], [61.5, 60.5]],
    [[66.5, 63.5], [70, 60], [74, 62.5]],
    [[93, 9.5], [91.5, 15], [94.5, 21]],
  ];
  for (const f of fissures) m.path(f, 1, '=', [',', '.']);

  // --- Straßen
  // Hauptstraße West–Ost (Pfortenhain – Marktbrücke – Marktplatz – Waldweg – Aschenwald)
  m.rect(96, 34, 4, 6, ',');                                         // Lücke im Ostrand
  m.rect(0, 28, 3, 0, ',');
  road([[11, 31], [20, 31.5], [29, 32], [36, 32.5], [44, 33], [50, 33.5]], 2.6);
  road([[60, 34], [68, 35], [76, 36.5], [84, 36], [91, 37], [99.6, 37]], 2.6);
  // Nordstraße: Marktplatz – zwischen Halle und Schmiede – Friedhof – Katakombentor
  road([[56, 30], [56.5, 23], [58, 18], [64, 15.5], [70, 13], [72, 9]], 2.4);
  // Mühlweg mit Steg nach Westen, Feldweg zurück zur Hauptstraße (Schleife)
  road([[57, 19], [50, 18.5], [45, 17.5]], 2);
  road([[35, 18.5], [29, 19], [24, 22], [22, 27], [22, 31.5]], 2);
  // Nordhangpfad (vom Feldweg in den Wald, Lichtungen)
  road([[29, 19], [27, 14], [21, 11], [12, 12], [8, 18], [9, 24]], 1.8);
  // Weiherpfad (West) und Weg zur Felsenge
  road([[24, 32], [25, 38], [22, 44], [17, 48], [18.5, 51.5], [21, 52]], 1.8);
  // Bohlensteg quer über den Weiher zur Felsenge (2 breit, Segmente je Zeile darüber)
  road([[17, 48], [19.5, 51]], 1.6);
  m.rect(19, 52, 2, 10, '.'); m.rect(15, 61, 5, 2, '.');
  // Südweg durch die Glutfelder (Schleife zurück zum Waldweg)
  road([[55, 38], [55, 45], [53.5, 51], [56, 57], [63, 61.5], [71, 58], [77, 51], [80, 44], [80, 37]], 2);
  // Pfade in den Wolfsforst
  road([[84, 36], [86, 30], [87, 25]], 1.8);
  road([[86, 38], [88, 45], [87.5, 50], [88, 56]], 1.8);
  // Friedhofsweg (Ost) und Rundweg
  road([[70, 13], [76, 15], [82, 15.5], [84, 19], [80, 23], [72, 22], [64, 16]], 1.6);

  // Brücken über den Senkbach (vor dem Pflaster, Geländer in der Zeile darüber)
  bridgeH(m, 32, spanMarket[0] - 1, spanMarket[1] + 1);                  // Marktbrücke (Hauptstraße)
  bridgeH(m, 17, spanMill[0] - 1, spanMill[1] + 1, '{', 'b', '}');         // Mühlsteg
  m.rect(44, 17, 2, 2, '.');
  m.path([[44, 18], [37, 18.5]], 2, '.', [',']);

  // --- Dorf Glutsenke: Marktplatz (Pflaster), Halle, Schmiede
  const village = { x: 43, y: 21, w: 31, h: 26 };
  blob(m, rng, 56, 33.5, 9, 5.6, ':', [',', '.'], 3);
  m.ellipse(56, 33.5, 7, 4.4, ':', [',', '.']);
  m.path([[56, 30], [56.5, 24]], 2.4, ':', [',', '.']);
  m.path([[45, 33.2], [50, 33.5]], 2.6, ':', ['.']);
  m.path([[61, 34.2], [67, 35]], 2.6, ':', ['.']);
  m.path([[55, 38], [55, 43]], 2, ':', [',', '.']);
  m.ellipse(55, 45.5, 3.4, 2.4, '.', [',']);          // Wachfeuerplatz
  // Gebäude (Grundfläche fest; Sprite zeichnet placeObjects)
  m.rect(47, 24, 7, 3, 'H');                          // Halle
  m.rect(59, 25, 6, 3, 'H');                          // Schmiede
  m.ellipse(50.5, 28.6, 3.5, 1.4, ':', [',', '.']);    // Vorplatz Halle
  m.ellipse(62, 29.6, 3, 1.3, '.', [',']);              // Vorplatz Schmiede

  // Katakombentor: Vorplatz
  m.ellipse(72, 9.6, 4.2, 2, ':', [',', '.']);
  // Pfortenhain: Steinkreis um die Glutpforte
  m.ellipse(10, 30.5, 5.2, 3.6, ':', [',', '.']);
  m.ellipse(10, 30.5, 6.6, 4.8, '.', [',']);

  // --- Westfelder: Äcker (Furchen-Deko auf Erde), Feldraine bleiben Gras
  const fields = [
    { x: 25, y: 23, w: 8, h: 6, ch: 'k' }, { x: 25, y: 35, w: 9, h: 5, ch: 'K' }, { x: 13, y: 21, w: 7, h: 6, ch: 'k' },
    { x: 13, y: 35, w: 7, h: 5, ch: 'j' }, { x: 30, y: 41, w: 5, h: 4, ch: 'j' },
  ];
  for (const f of fields) m.rect(f.x, f.y, f.w, f.h, '.');

  // ---------------------------------------------------------------- Deko (fest platziert)
  // Dorf
  // Dorfbrunnen: Questobjekt well_village (siehe objects)
  each([[49, 31], [63, 31], [50, 37], [61, 37], [56, 28], [45, 31], [66, 36], [53, 43], [58, 43], [40, 30], [43, 36]], (x, y) => put(x, y, 'l'));
  each([[51, 36], [60, 37.0]], (x, y) => put(x, Math.round(y), 'm'));   // Marktstände
  put(52, 31, 'c'); put(60, 31, 'c'); put(66, 28, 'c'); put(46, 28, 'L');
  put(47, 39, 'C'); put(66, 39, 'D'); put(70, 31, 'C'); put(68, 25, 'D');
  put(64, 44, 'C');
  put(69, 42, 'L'); put(49, 42, 'Q'); put(71, 35, 'S'); put(46, 34, 'S');
  // Gärten an den Häusern: kleine Beete mit Zaun
  m.rect(43, 40, 3, 2, '.'); each([[43, 40], [44, 40], [45, 40], [43, 41], [44, 41], [45, 41]], (x, y) => put(x, y, 'n'));
  for (let x = 42; x <= 46; x++) put(x, 42, 'f');
  for (let x = 68; x <= 72; x++) if (x !== 70) put(x, 28, 'f');
  // Wachfeuer (Respawn) im Süden des Dorfes
  put(56, 45, 'F'); put(58, 46, 'o');
  // Mühle am Bach (Ostufer, Rad im Wasser) und Mühlenteich-Ufer
  put(44, 14, 'W');
  put(47, 16, 'h'); put(48, 13, 'c'); put(46, 12, 'L');
  // Westfelder: Hof, Heu, Vogelscheuche, Zäune an den Feldrainen
  put(18, 30, 'D'); put(19, 33, 'h'); put(16, 33, 'h'); put(28, 30, 'Q');
  put(29, 26, 's'); put(16, 24, 's'); put(29, 37, 'h'); put(34, 22, 'h');
  for (let x = 24; x <= 34; x++) if (x !== 29) put(x, 22, 'f');
  for (let y = 23; y <= 28; y++) put(24, y, 'i');
  for (let x = 12; x <= 20; x++) if (x !== 16) put(x, 20, 'f');
  for (let x = 12; x <= 20; x++) if (x < 15 || x > 17) put(x, 41, 'f');
  // Pfortenhain: Steinkreis, Fackeln
  circle(m, 10, 30.5, 5.6, 4, 8, 'J', 0.4);
  put(5, 29, '.'); put(15, 31, '.');                  // Durchgang im Kreis (West/Ost frei)
  // Friedhof: Gräber in Reihen, Gruft, Laterne, eiserner Zaun
  const grave = { x: 61, y: 11, w: 22, h: 10 };
  for (const [x0, y0, n] of [[74, 17, 5], [74, 19, 5], [62, 12, 3], [62, 14, 3], [61, 17, 3], [76, 11, 3]]) {
    for (let i = 0; i < n; i++) { const x = x0 + i * 2 + (hash2(i, y0, 5) < 0.3 ? 1 : 0); if (m.get(x, y0) === ',') put(x, y0, 'g'); }
  }
  put(81, 12, 'X'); put(67, 18, 'X');
  put(69, 10, 'l'); put(75, 10, 'l'); put(78, 21, 'd'); put(66, 20, 'd');
  // Glutfelder: verkohlte Bäume, Asche, Glutstein
  each([[48, 52], [52, 61], [66, 53], [69, 66], [58, 64], [45, 60], [72, 55]], (x, y) => put(x, y, 'd'));
  each([[50, 56], [61, 55], [70, 63], [56, 66]], (x, y) => put(x, y, 'r'));
  // Schilfweiher: Steg, Boot? – Uferdeko folgt beim Streuen (Schilf)
  put(20, 51, 'o');
  for (let y = 52; y <= 60; y++) if (m.get(19, y + 1) === '.' && (m.get(18, y + 1) === '~' || m.get(21, y + 1) === '~')) put(19, y, 'z');
  // Geheimecke: Höhlenmund im Fels, Truhe, Knochen
  put(6, 59, 'q');
  put(4, 63, 'r'); put(12, 64, 'o');
  // Wolfsforst: Wolfsbau (Knochen, umgestürzter Baum)
  put(91, 58, 'o'); put(85, 59, 'o'); put(90, 27, 'o');
  // Obstwiese südlich der Felder (Apfelbäume in Reihen, Zaun, Heu)
  for (let x = 21; x <= 28; x++) if (x !== 24 && x !== 25) put(x, 43, 'f');
  each([[24, 45], [27, 45], [30, 45], [25, 48], [28, 48], [31, 48], [24, 51], [27, 50]], (x, y) => put(x, y, 'O'));
  put(33, 46, 'h'); put(22, 47, 'Q'); put(30, 50, 'L');
  // Pilzring im Nordhang
  circle(m, 16, 9, 1.6, 1.1, 7, 'p', 0.2);

  // ---------------------------------------------------------------- Punkte, NPCs
  put(56, 36, '1');   // start (Marktplatz, vor dem Brunnen)
  put(53, 46, '2');   // respawn (Wachfeuer)
  put(72, 11, '3');   // from_catacombs
  put(95, 37, '4');   // from_ashwood
  put(10, 32, '5');   // from_trial (vor der Glutpforte)
  put(60, 36, '6');   // waystone (vor dem Wegstein)
  const waystone = { x: 60, y: 34 };
  put(50, 28, 'M');   // Maren vor der Halle
  put(61, 29, 'N');   // Brom vor der Schmiede

  // ---------------------------------------------------------------- Gegner (vor dem Wald)
  // v Aschewolf, A Rudelführer Glutfang, e Glutkäfer
  // Nordhang: zwei kleine Rudel
  each([[20, 9], [23, 10], [11, 14], [13, 16]], (x, y) => foe(m, x, y, 'v'));
  // Friedhof: Wölfe zwischen den Gräbern, ein Käfer aus einem offenen Grab
  each([[84, 18], [81, 22]], (x, y) => foe(m, x, y, 'v'));
  foe(m, 61, 18, 'e');
  // Wolfsforst: Lichtung Nord, Lichtung Süd, Wolfsbau mit Glutfang
  each([[86, 26], [89, 24], [84, 28]], (x, y) => foe(m, x, y, 'v'));
  each([[87, 46], [90, 49]], (x, y) => foe(m, x, y, 'v'));
  foe(m, 88, 57, 'A'); each([[85, 56], [91, 55]], (x, y) => foe(m, x, y, 'v'));
  // Glutfelder: Käfer in den Spalten, ein Wolf am Rand
  each([[52, 58], [57, 60], [64, 58], [68, 61]], (x, y) => foe(m, x, y, 'e'));
  foe(m, 74, 56, 'v');
  // Westfelder: Käfer in den Furchen (weit genug vom Dorf)
  each([[30, 25], [27, 37]], (x, y) => foe(m, x, y, 'e'));
  // Alte Glutkäferhöhle: Nest
  each([[8, 61], [10, 63]], (x, y) => foe(m, x, y, 'e'));

  // ---------------------------------------------------------------- Wald und Streudeko
  const villageClear = box(village, 1);
  const clearings = [
    [86, 26, 4.4, 3.2], [88, 48, 3.6, 3.4], [88, 57, 4.6, 3.4], [21, 10, 4.2, 2.8], [12, 15, 3.4, 3], [16, 9, 2.6, 2],
    [72, 9.6, 6, 3.2], [10, 30.5, 7.5, 5.5], [78, 37, 3, 3], [94, 37, 4, 4], [56, 6, 3.2, 2.2], [93, 34, 2.2, 1.6], [5, 21, 2.2, 1.6],
  ];
  const inClear = (x, y) => clearings.some(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1);
  const keep = (x, y) => villageClear(x, y) || inClear(x, y) || box(grave, 0)(x, y) || net.onRoad(x, y)
    || fields.some((f) => box(f, 1)(x, y)) || (x > 10 && x < 36 && y > 19 && y < 46) || near(m, x, y, '~', 1) || near(m, x, y, '=', 1)
    || (x > 42 && x < 76 && y > 48 && y < 68 && noise2(x / 4, y / 4, 77) > 0.3);
  const dense = (x, y) => {
    if (x > 74 && y > 19) return 0.72;                       // Wolfsforst
    if (x < 36 && y < 19) return 0.62;                       // Nordhang
    if (x < 21 && y > 41) return 0.6;                        // Weiherwald
    if (y > 63) return 0.6;                                  // Südrand
    if (x > 82 && y < 20) return 0.55;                       // hinter dem Friedhof
    if (x > 64 && x < 76 && y > 38) return 0.5;              // Waldzunge Südost
    if (x > 34 && x < 46 && y > 36) return 0.35;             // Bachufer Süd
    if (x > 46 && x < 64 && y < 19) return 0.4;              // Mühlwald
    return 0;
  };
  forestFill(m, dense, keep, 'T', 'Y', 12);

  // Rand-Wald dicht an die Felsen (Kanten verschwimmen)
  strew(m, net, rng, (x, y) => villageClear(x, y) || inClear(x, y), (x, y, g, free) => {
    if (g === '.') {
      if (m.get(x, y) === '.' && x > 42 && y > 48 && free && rng.chance(0.03)) return 'r';
      return null;
    }
    if (near(m, x, y, '~', 1)) return rng.chance(0.42) ? 'R' : null;               // Schilf am Wasser
    if (near(m, x, y, '#', 1) && rng.chance(0.18)) return free ? (rng.chance(0.5) ? 't' : 'r') : 'u';
    if (near(m, x, y, 'T', 1) && rng.chance(0.08)) return rng.chance(0.6) ? 'u' : (free ? 't' : null);
    if (x > 42 && x < 76 && y > 48) return free && rng.chance(0.03) ? 'd' : rng.chance(0.03) ? 'r' : null; // Glutfelder
    if (box(grave, 0)(x, y)) return rng.chance(0.05) ? 'u' : null;
    if (x > 10 && x < 36 && y > 19 && y < 46) return rng.chance(0.02) ? 'n' : rng.chance(0.01) && free ? 'O' : null;  // Feldraine
    if (free && rng.chance(0.03)) return rng.chance(0.55) ? 't' : 'O';
    if (rng.chance(0.02)) return 'u';
    if (rng.chance(0.012)) return 'r';
    if (rng.chance(0.015)) return 'n';
    return null;
  }, ',.');
  // Äcker: Furchen-Deko auf die Felder (nach dem Streuen, damit sie geschlossen wirken)
  for (const f of fields) for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) {
    if (m.get(x, y) === '.' && !(x === 30 && y === 25) && !(x === 27 && y === 37)) m.set(x, y, f.ch);
  }

  const BEACON = { east: [93, 34], north: [56, 5], west: [5, 21] };
  const SOLID = new Set(['#', '~', '=', 'H', 'f', 'T', 'Y', 'i', 'B', '<', '>', 'b', '{', '}', 'x', 'q', 'W', 'X', 'J']);
  sealPockets(m, [56, 36], SOLID, 'T');

  return {
    name: 'Glutsenke',
    kind: 'outdoor',
    decorSet: 'village',
    map: m.rows(),
    solid: 'TYiB<>b{}xqWXJ',
    decor: {
      t: 'valleyPines', T: 'forestPines', d: 'deadTrees', r: 'rocks', u: 'bushes', O: 'oaks', n: 'flowers',
      f: 'fenceH', i: 'fenceV', g: 'graves', X: 'mausoleum', l: 'lamp', F: 'campfire', w: 'well', c: 'crates', S: 'signpost',
      W: 'watermill', '<': 'bridgeL', B: 'bridgeM', '>': 'bridgeR', '{': 'footbridgeL', b: 'footbridgeM', '}': 'footbridgeR',
      k: 'wheatField', K: 'cabbageField', j: 'furrowField', h: 'haystack', s: 'scarecrow', C: 'cottage', D: 'cottageB',
      m: 'marketStall', L: 'woodpile', Q: 'farmCart', o: 'fallenLog', R: 'reeds', J: 'standingStones', q: 'caveMouth',
      p: 'mushrooms', z: 'boardwalk',
    },
    points: { 1: 'start', 2: 'respawn', 3: 'from_catacombs', 4: 'from_ashwood', 5: 'from_trial', 6: 'waystone' },
    npcs: { M: 'elder_maren', N: 'smith_brom' },
    enemies: { v: { type: 'wolf' }, A: { type: 'wolf_alpha' }, e: { type: 'ember_beetle' } },
    respawn: 32,
    fissures,
    waystone,
    buildings: [
      { kind: 'hall', x: 47, y: 24, w: 7, h: 3 },
      { kind: 'smithy', x: 59, y: 25, w: 6, h: 3 },
    ],
    cryptGate: { x: 72, y: 7 },
    areas: [
      { id: 'ember_village', name: 'Dorf Glutsenke', town: true, ...village },
      { id: 'catacombs_gate', name: 'Katakombentor', x: 66, y: 8, w: 13, h: 5 },
      { id: 'old_graveyard', name: 'Alter Friedhof', ...grave },
      { id: 'mill_brook', name: 'Mühlbach', x: 34, y: 8, w: 16, h: 12 },
      { id: 'west_fields', name: 'Westfelder', x: 11, y: 20, w: 25, h: 26 },
      { id: 'ember_gate_grove', name: 'Pfortenhain', x: 3, y: 25, w: 11, h: 11 },
      { id: 'north_slope', name: 'Nordhang', x: 3, y: 5, w: 30, h: 14 },
      { id: 'wolf_forest', name: 'Wolfsforst', x: 76, y: 22, w: 21, h: 42 },
      { id: 'ember_fields', name: 'Glutfelder', x: 43, y: 49, w: 33, h: 18 },
      { id: 'reed_pond', name: 'Schilfweiher', x: 14, y: 51, w: 22, h: 13 },
      { id: 'beetle_cave', name: 'Alte Glutkäferhöhle', x: 3, y: 58, w: 11, h: 9 },
    ],
    objects: [
      { id: 'village_chest', kind: 'bank', set: 'village', decor: 'bankChest', prompt: 'Gemeinschaftstruhe öffnen', x: 55, y: 27 },
      { id: 'appearance_mirror', kind: 'mirror', set: 'village', decor: 'mirror', prompt: 'Aussehen ändern', x: 66, y: 30 },
      { id: 'trial_portal', kind: 'trial', set: 'village', decor: 'emberGate', prompt: 'Glutpforte: Glutprüfungen (ab Stufe 20)', x: 10, y: 29 },
      { id: 'beetle_cave_cache', kind: 'chest', prompt: 'Truhe öffnen', x: 9, y: 60 },
      // Questobjekte (Thread C): Reinsalz in die Brunnen, Feuersteine in der Reihenfolge Ost → Nord → West
      { id: 'well_village', kind: 'shrine', decor: 'saltWell', name: 'Dorfbrunnen', prompt: 'Reinsalz streuen (Dorfbrunnen)', x: 56, y: 33 },
      { id: 'well_mill', kind: 'shrine', decor: 'saltWell', name: 'Brunnen an der Mühle', prompt: 'Reinsalz streuen (Mühlbrunnen)', x: 49, y: 15 },
      { id: 'beacon_east', kind: 'shrine', decor: 'beacon', name: 'Feuerstein Ost', prompt: 'Feuerstein im Osten entzünden', x: BEACON.east[0], y: BEACON.east[1] },
      { id: 'beacon_north', kind: 'shrine', decor: 'beacon', name: 'Feuerstein Nord', prompt: 'Feuerstein im Norden (unter dem Berg) entzünden', x: BEACON.north[0], y: BEACON.north[1] },
      { id: 'beacon_west', kind: 'shrine', decor: 'beacon', name: 'Feuerstein West', prompt: 'Feuerstein im Westen entzünden', x: BEACON.west[0], y: BEACON.west[1] },
    ],
    portals: [{
      id: 'to_catacombs', x: 72, y: 8.2, range: 26,
      to: { zoneId: 'catacombs', spawnId: 'start' },
      prompt: 'Die Katakomben betreten',
    }, {
      id: 'to_ashwood', x: 99.2, y: 37, range: 26, visual: 'road', dir: [1, 0], requires: { level: 6 },
      to: { zoneId: 'ashwood', spawnId: 'from_emberhollow' },
      prompt: 'Ostwärts in den Aschenwald',
    }],
    signText: 'Ost: Waldweg zum Aschenwald · Nord: Friedhof und Katakomben · West: Westfelder und Glutpforte · Süd: Glutfelder',
  };
}
