import { createRng, hash2 } from '../../core/math.js';
import { MapBuilder } from '../levels.js';
import { near, each, blob, roadNet, MISPLACED, foe, strew } from '../mapkit.js';

// ---------------------------------------------------------------- Schlackenhöhen (12–20)
// Ein Erzgebirge in drei Stufen, getrennt durch Klippenbänder (3 Kacheln: Felskante + 2 Wandreihen).
// Farben (Biom 'peaks', level.soil): graues Geröll, rostige Erzadern, dunkle Schlacke, Schwefelkrusten;
// Wasser ist kaltes, grünliches Grubenwasser (Erzbach, Erzsee), Glut gibt es nur noch in drei Spalten und an den Schwefelschloten.
//   Stufe 0 (Süden)   Aschehänge mit Bergmannsfriedhof (Ankunft aus dem Aschenwald, Mitte unten),
//                     Schlackenhalden mit Erzbrecher am Erzsee
//   Stufe 1 (Mitte)   Rauhwacht – ein Felsenhorst ohne Mauern, erreichbar über den Seilaufzug von unten
//                     oder durch das Felstor im Osten; Obsidianriss, Erzbach mit Brücken, Ostpass
//   Stufe 2 (Norden)  Alte Schlackenminen, Schmiedetor, Kolosskrater; Adlerhorst (Geheimecke)
// Übergänge: Seilaufzug, Rampen (R1, R2, R3), Serpentinensteig, Stollen hinter dem Horst, Felsrinne zum Adlerhorst.
// Wege sind von Steinmännern, Grubenlampen und Seilgeländern gesäumt; kaum Streudeko abseits.

const W = 128, H = 88;

// Weiches Rauschen für Kanten (deterministisch)
const wob = (x, s) => Math.sin(x * 0.21 + s) * 0.6 + Math.sin(x * 0.53 + s * 2.1) * 0.35 + (hash2(x, 7, s) - 0.5) * 0.5;

// Catmull-Rom: geschwungene Wege aus wenigen Stützpunkten
function curve(pts, n = 5) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export function buildCinderPeaks() {
  const m = new MapBuilder(W, H, ',');
  const rng = createRng(1717);
  const put = (x, y, ch) => m.set(x, y, ch);
  const fill = (x0, y0, x1, y1, ch) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m.set(x, y, ch); };

  // ------------------------------------------------ Felsrand
  const rimTop = (x) => {
    if (x <= 38) return 7 + Math.round(wob(x, 1) * 0.9);        // Minenwand (hoch, mit Stolleneingängen)
    if (x >= 55 && x <= 73) return 5;                            // Schmiedetor: gerade Wand
    if (x >= 84) return 5 + Math.round(Math.abs(wob(x, 2)));     // Krater
    return 4 + Math.round(Math.abs(wob(x, 3)) * 1.4);
  };
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < rimTop(x); y++) put(x, y, '#');
    const bot = 2 + (hash2(x, 1, 11) < 0.4 ? 1 : 0);
    if (x < 57 || x > 63) for (let y = H - bot; y < H; y++) put(x, y, '#');
  }
  for (let y = 0; y < H; y++) {
    const l = 2 + (hash2(1, y, 12) < 0.4 ? 1 : 0), r = 2 + (hash2(2, y, 13) < 0.4 ? 1 : 0);
    for (let x = 0; x < l; x++) put(x, y, '#');
    if (y < 42 || y > 46) for (let x = W - r; x < W; x++) put(x, y, '#');
  }

  // ------------------------------------------------ Klippenbänder
  // Band A trennt Stufe 0 / 1. Unter der Feste verläuft es gerade (Mauer direkt an der Kante).
  const bandA = (x) => (x <= 34 ? 57 : x <= 50 ? Math.round(57 + (x - 34) * 0.19) : 60 + Math.round(wob(x, 4) * 1.3));
  const gapA = (x) => (x >= 41 && x <= 44) || (x >= 79 && x <= 82) || (x >= 16 && x <= 19);
  for (let x = 0; x < W; x++) if (!gapA(x)) for (let k = 0; k < 3; k++) put(x, bandA(x) + k, '#');
  // Band B trennt Stufe 1 / 2 (Lücke für den Stollen und Rampe R3; Serpentinen gesondert)
  const bandB = (x) => 30 + Math.round(wob(x, 5) * 0.8);
  const gapB = (x) => (x >= 21 && x <= 23) || (x >= 84 && x <= 87) || (x >= 36 && x <= 61);
  for (let x = 0; x < W; x++) if (!gapB(x)) for (let k = 0; k < 3; k++) put(x, bandB(x) + k, '#');

  // Serpentinensteig: Seitenwände und drei versetzte Felsbänder, Lücken je 4 Kacheln
  fill(36, 29, 37, 44, '#'); fill(60, 29, 61, 44, '#');
  fill(38, 42, 55, 44, '#');  // L1, Lücke rechts (56–59)
  fill(42, 36, 59, 38, '#');  // L2, Lücke links (38–41)
  fill(38, 30, 55, 32, '#');  // L3, Lücke rechts (56–59)

  // ------------------------------------------------ Rauhwacht: Felsenhorst (Stufe 1), keine Mauern
  const fort = { x: 4, y: 37, w: 30, h: 20 };
  fill(2, 34, 5, 56, '#');                                  // Westklippe
  // Ostflanke: Felsrippe mit natürlichem Felstor (y 45–47)
  for (let y = 36; y <= 56; y++) { const t = 32 + Math.round(wob(y, 8) * 0.9); if (y < 45 || y > 47) for (let x = t; x <= t + 2; x++) put(x, y, '#'); }
  blob(m, rng, 18, 47, 11.5, 7, '.', [','], 3);             // festgetretener Lagerboden
  blob(m, rng, 8, 40, 2.2, 1.6, '#', [',', '.'], 2);        // Felsnadeln im Horst
  blob(m, rng, 29, 52, 1.8, 1.4, '#', [',', '.'], 2);
  // Stollenhof zwischen Horst und Band B
  fill(6, 34, 31, 36, '.');

  // ------------------------------------------------ Kolosskrater (Stufe 2, Nordost)
  const CX = 104, CY = 16;
  for (let y = 2; y < 32; y++) for (let x = 84; x < 126; x++) {
    const d = ((x - CX) / 17) ** 2 + ((y - CY) / 11.5) ** 2;
    const a = Math.atan2(y - CY, x - CX);
    const ring = d >= 0.74 && d <= 1.05 + wob(x + y, 6) * 0.08;
    const westGap = Math.abs(Math.abs(a) - Math.PI) < 0.2 && y >= 13 && y <= 19;
    if (ring && !westGap) put(x, y, '#');
    else if (d < 0.74) put(x, y, '.');
  }
  blob(m, rng, 111, 20, 5.2, 3.2, '~', null, 3);    // Quelle im Krater
  // Ostflanke massiv bis zum Adlerhorst
  fill(119, 2, 127, 31, '#');

  // ------------------------------------------------ Adlerhorst (Geheimecke): Felsrinne + Felsnase über dem Ostpass
  fill(112, 30, 127, 40, '#');
  fill(116, 32, 125, 37, ',');
  m.path([[117, 15], [121, 13.5], [123, 16], [123, 22], [122.5, 27], [121.5, 31]], 1.6, '.', null);

  // ------------------------------------------------ Erzbach vom Krater in den Erzsee
  const lava = [[110, 22], [107, 27], [104, 31], [100, 36], [95, 41], [92, 46], [92, 51], [94, 56], [96, 60], [98.5, 65], [102, 70]];
  m.path(lava, 3.2, '~', null);
  blob(m, rng, 108, 75, 11, 6.2, '~', [',', '#'], 5);   // Erzsee
  m.ellipse(31, 66, 2.6, 1.5, '~', [',']);               // Tümpel
  m.ellipse(13, 24, 2.4, 1.4, '~', [',']);
  m.ellipse(74, 12, 2.2, 1.3, '~', [',']);

  // Felsnasen (Basaltstöcke) auf allen Stufen
  for (const [x, y, a, b] of [[12, 66, 2.6, 1.6], [64, 77, 2.4, 1.4], [86, 80, 3, 1.6], [48, 84, 2, 1.2], [118, 54, 2.4, 1.6], [104, 53, 1.8, 1.4], [8, 14, 2.2, 1.4], [46, 9, 2.6, 1.4], [79, 9, 2, 1.2], [70, 40, 1.8, 1.2]]) blob(m, rng, x, y, a, b, '#', [','], 2);

  // ------------------------------------------------ Obsidianriss (Stufe 1, Mitte)
  const rift = { x: 62, y: 36, w: 19, h: 20 };
  blob(m, rng, 71, 46, 8.5, 5.8, '.', [','], 4);
  m.ellipse(71, 46.5, 3.2, 2.2, ':', ['.']);
  // Bodenflecken: Geröll und Schlacke (Erde) als Mosaik
  for (const [x, y, a, b] of [[14, 74, 7, 3.5], [52, 77, 8, 3], [90, 72, 9, 4], [113, 66, 6, 2.5], [100, 50, 5, 4], [20, 16, 11, 5], [8, 24, 4, 3], [33, 25, 4, 2.5], [76, 24, 6, 3], [64, 16, 5, 3], [26, 68, 5, 2.5], [112, 52, 6, 3]]) blob(m, rng, x, y, a, b, '.', [','], 3);
  // Glutspalten (Spalten mit Glutkern, fest)
  const fissures = [
    [[66, 41], [69, 42.5], [72, 41], [76, 42]],
    [[96, 9], [99, 11], [103, 9.5]],
    [[44, 14], [47, 17], [45, 21]],
  ];
  for (const f of fissures) m.path(f, 1, '=', [',', ':']);

  // ------------------------------------------------ Straßen
  const net = roadNet(m);
  const road = (pts, w = 2.6, ch = '.') => net.road(pts, w, ch, [',', '~', ':', '=']);
  const mainS = curve([[60, 87.5], [59, 81], [53, 75], [44, 71], [34, 68], [25, 64], [19, 61], [17.5, 58]]);
  road(mainS, 3);                                                                            // Hauptweg Süd -> Seilaufzug
  road(curve([[44, 71], [43, 64], [42.5, 56], [43, 51]]), 2.8);                              // Abzweig -> R1
  road([[17.5, 58], [17.5, 52], [18, 49]], 2.4);                                             // Aufzug -> Wachfeuer
  road(curve([[43, 51], [38, 47.5], [33, 46], [26, 47], [20, 48]]), 2.6);                     // Felstor -> Wachfeuer
  road([[43, 51], [52, 53], [62, 54.5], [74, 54], [82, 50], [86, 47], [96, 46], [104, 45], [116, 44.5], [127.5, 44.5]], 3); // Ost (Steppe)
  road([[43, 51], [50, 47.5], [57.5, 46.5], [57.5, 40], [52, 40], [40, 40], [39.5, 34], [52, 34], [57.5, 34], [57.5, 27.5], [62, 22], [64, 14], [64, 8]], 2.4); // Serpentinen -> Schmiedetor
  road([[57.5, 27.5], [48, 25], [36, 22], [26, 19], [14, 16]], 2.2);                         // Minenweg
  road([[26, 19], [22.5, 24], [22, 30], [22, 34], [20, 36.5]], 2);                           // Stollen
  road([[62, 22], [74, 19], [86, 17], [93, 16], [100, 16]], 2.4);                            // Kraterweg
  road([[84, 50], [86, 41], [86, 34], [86.5, 29], [87, 22], [86, 17]], 2.4);                 // Rampe R3
  road(curve([[59, 81], [65, 75], [74, 68], [80.5, 64], [80.5, 57], [82, 52]]), 2.4);        // Rampe R2
  road([[74, 68], [84, 67], [91, 67], [104, 67], [114, 65.5], [120, 66]], 2.2);              // Schlackenhalden (Brücke B2)

  // Brücken über den Lavastrom: Spannweite aus der Lava der drei Reihen
  const bridges = [];
  const bridgeEW = (row, xc, len) => {
    const x0 = xc - Math.floor(len / 2);
    for (let y = row; y < row + 3; y++) for (let x = x0; x < x0 + len; x++) put(x, y, '.');
    bridges.push({ x: x0, y: row, len });
    put(x0 + 2, row, 'B');
  };
  bridgeEW(45, 92, 6);
  bridgeEW(66, 99, 6);

  // Rampen: Steinstufen; die Marke sitzt auf der Kachel über der Lücke (Bild beginnt eine Reihe tiefer)
  const ramps = [];
  const ramp = (x0, yTop, w = 4, h = 3) => {
    fill(x0, yTop, x0 + w - 1, yTop + h - 1, ':');
    ramps.push({ x: x0, y: yTop, w, h });
    put(x0 + 1, yTop - 1, h === 4 ? 'Q' : 'R');
  };
  ramp(41, bandA(41)); ramp(79, Math.min(bandA(79), bandA(82)), 4, 4);
  ramp(84, Math.min(bandB(84), bandB(87)), 4, 4);
  ramp(56, 42); ramp(38, 36); ramp(56, 30);
  // Gerade Kanten an den Rampen (keine Felszacken in der Lücke)
  for (const r of ramps) for (let y = r.y; y < r.y + r.h; y++) { if (m.get(r.x - 1, y) !== '#') put(r.x - 1, y, '#'); if (m.get(r.x + r.w, y) !== '#') put(r.x + r.w, y, '#'); }

  // ------------------------------------------------ Rauhwacht: Zeltlager um das Wachfeuer
  // Seilaufzug: Bohlensteg durch die Lücke im Band A, Winde oben, Korb unten
  fill(16, bandA(16), 19, bandA(16) + 2, '.');
  put(17, bandA(16) - 1, 'E');
  put(22, 55, '^'); put(22, 61, '_');
  each([[11, 41], [25, 41], [10, 52], [26, 50], [16, 39]], (x, y) => put(x, y, 'T'));
  put(18, 47, 'F'); put(21, 43, 'P'); put(14, 44, 'P'); put(30, 44, 'P'); put(30, 48, 'P');
  put(24, 54, 'c'); put(27, 54, 'c'); put(8, 54, 'c'); put(13, 54, 'o');
  put(7, 44, 'b'); put(28, 46, 'b'); put(24, 46, 'b');
  put(18, 43, 'C'); put(8, 46, 'Y'); put(25, 53, 'D');
  put(19, 50, '1'); put(15, 50, '2');
  const waystone = { x: 12, y: 47 };
  put(12, 49, '7');
  // Seilgeländer an der Südkante des Horsts (Lücke am Aufzug)
  for (let x = 6; x <= 30; x++) if ((x < 15 || x > 20) && m.get(x, 56) === ',' || (x < 15 || x > 20) && m.get(x, 56) === '.') put(x, 56, '|');
  // Stollenhof
  put(8, 35, 'o'); put(28, 35, 'K'); put(12, 35, 'c');

  // ------------------------------------------------ Alte Schlackenminen (Stufe 2, West)
  const mineAt = (x) => { let y = 0; while (m.get(x, y) === '#') y++; return y; };
  for (const mx of [9, 30]) {
    const my = mineAt(mx);
    fill(mx - 2, my, mx + 2, my + 1, '.');
    put(mx, my, 'm');
    for (let y = my + 2; y < my + 7; y++) put(mx, y, 'q');
  }
  // Stollenmund am Band B (Grubenstützen links/rechts), Loren, Abraum
  put(20, 28, 'j'); put(24, 28, 'j'); put(20, 35, 'j'); put(24, 35, 'j');
  each([[13, 19], [34, 13], [6, 26]], (x, y) => put(x, y, 'o'));
  each([[18, 11], [27, 26], [4, 18], [38, 17], [16, 27]], (x, y) => put(x, y, 'K'));
  each([[15, 12], [33, 23], [11, 23]], (x, y) => put(x, y, 'c'));
  each([[24, 12], [6, 21], [31, 18]], (x, y) => put(x, y, 'j'));

  // ------------------------------------------------ Schmiedetor (Stufe 2, Mitte)
  put(64, 5, 'Z'); put(58, 7, 'e'); put(70, 7, 'e'); put(64, 8, '4');
  put(60, 11, 'b'); put(68, 11, 'b');
  // Serpentinen: Steinmänner an den Kehren, Feuerschalen an den Rampen
  each([[54, 46], [41, 39], [54, 33], [59, 26]], (x, y) => put(x, y, 'n'));
  each([[55, 41], [43, 35], [55, 29]], (x, y) => put(x, y, 'b'));
  // Rampen R1/R2/R3: Feuerschalen/Steinmänner am Fuß
  put(40, bandA(40) + 3, 'n'); put(46, bandA(46) + 3, 'l'); put(78, bandA(78) + 3, 'n'); put(83, 66, 'l'); put(83, 36, 'n');

  // ------------------------------------------------ Kolosskrater: Basaltsäulen am Innenrand
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const x = Math.round(CX + Math.cos(a) * 13.2), y = Math.round(CY + Math.sin(a) * 8.4);
    if (Math.abs(a - Math.PI) < 0.45 || m.get(x, y) !== ':') continue;
    if (hash2(i, 3, 19) < 0.7) put(x, y, 'k');
  }
  put(101, 15, 'M');

  // ------------------------------------------------ Adlerhorst
  put(119, 33, 'L'); put(124, 33, 'n'); put(117, 36, 'K');
  const caches = [{ id: 'chest_cinder_eyrie', x: 122, y: 35 }];

  // ------------------------------------------------ Ostpass, Glutspalt, Schlackenhalden
  put(124, 41, 'P'); put(124, 48, 'P'); put(124, 44, '6');
  put(110, 48, 'T'); put(113, 49, 'c'); put(108, 51, 'b');   // verlassener Posten
  each([[96, 64], [112, 63], [118, 70], [88, 76], [76, 80], [92, 72]], (x, y) => put(x, y, 'K'));
  each([[93, 38], [99, 55], [88, 54], [96, 31]], (x, y) => put(x, y, 'e'));
  // Aschehänge
  put(60, 84, '3');
  put(56, 84, 'n'); put(64, 84, 'n');
  // Bergmannsfriedhof auf den Aschehängen: zwei Reihen Gräber, Grubenlampen am Eingang
  m.ellipse(28, 77, 8, 4, '.', [',']);
  each([[23, 75], [27, 75], [31, 75], [25, 79], [29, 79], [33, 79]], (x, y) => put(x, y, 'O'));
  put(20, 77, 'l'); put(36, 77, 'n'); put(34, 74, 'o');
  // Erzbrecher am Erzsee
  m.ellipse(92, 80, 6, 3.2, '.', [',']);
  put(92, 79, 'V'); put(86, 80, 'K');

  // ------------------------------------------------ Questobjekte (Thread C): freie Bodenkachel suchen und freihalten
  const spots = [];
  const spot = (x, y) => {
    for (let r = 0; r <= 4; r++) for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
      let ok = true;
      for (let b = -1; b <= 1 && ok; b++) for (let a = -1; a <= 1; a++) if (!',.:'.includes(m.get(x + i + a, y + j + b))) { ok = false; break; }
      if (ok) { spots.push([x + i, y + j]); return [x + i, y + j]; }
    }
    MISPLACED.push(`obj@${x},${y}`); return [x, y];
  };
  const seal1 = spot(65, 44), seal2 = spot(77, 45), seal3 = spot(71, 50), circleAt = spot(71, 46);
  const sluiceDam = spot(97, 70), sluiceBridge = spot(87, 43), sluiceFalls = spot(106, 28);
  const nest1 = spot(52, 57), nest2 = spot(50, 28), nest3 = spot(112, 57);
  const riftSpawns = [spot(60, 47), spot(82, 46), spot(71, 57), spot(71, 34)];

  // ------------------------------------------------ Gegner (vor der Streudeko)
  // i Feuerwicht, h Magmahund, g Aschegolem, u Kultist, x Schlackensprenger, y Klippenharpyie
  // Aschehänge: Wichte + erste Sprenger
  each([[30, 72], [36, 74], [12, 70], [15, 74], [48, 77], [21, 74], [40, 82]], (x, y) => foe(m, x, y, 'i'));
  each([[28, 66], [56, 66], [9, 62]], (x, y) => foe(m, x, y, 'x'));
  // Schlackenhalden: Sprenger, Hunde, Wichte
  each([[106, 64], [114, 68], [90, 82], [72, 77]], (x, y) => foe(m, x, y, 'x'));
  each([[110, 63], [118, 64], [84, 72]], (x, y) => foe(m, x, y, 'h'));
  each([[70, 73], [80, 82], [97, 84]], (x, y) => foe(m, x, y, 'i'));
  // Serpentinensteig: Harpyien kreisen, Wichte in den Kehren
  each([[46, 40], [50, 34], [44, 27]], (x, y) => foe(m, x, y, 'y'));
  each([[49, 39], [45, 33], [52, 41], [53, 28]], (x, y) => foe(m, x, y, 'i'));
  // Obsidianriss: Golems + Kultisten + eine Harpyie
  each([[63, 42], [80, 44], [65, 53], [77, 54], [78, 39]], (x, y) => foe(m, x, y, 'g'));
  each([[64, 49], [77, 50], [68, 39], [74, 39]], (x, y) => foe(m, x, y, 'u'));
  foe(m, 66, 38, 'y');
  // Glutspalt: Magmahunde, Wichte, ein Kultist
  each([[88, 40], [97, 50], [90, 55], [100, 40]], (x, y) => foe(m, x, y, 'h'));
  each([[85, 44], [96, 53]], (x, y) => foe(m, x, y, 'i'));
  foe(m, 98, 36, 'u');
  // Ostpass: Harpyien, Hunde, ein Sprenger
  each([[108, 38], [114, 52], [104, 56]], (x, y) => foe(m, x, y, 'y'));
  each([[111, 41], [106, 47], [110, 51]], (x, y) => foe(m, x, y, 'h'));
  foe(m, 110, 54, 'x');
  // Alte Minen: Sprenger, Golems, Kultisten
  each([[11, 14], [30, 14], [18, 22]], (x, y) => foe(m, x, y, 'x'));
  each([[26, 15], [8, 24], [34, 26]], (x, y) => foe(m, x, y, 'g'));
  each([[14, 18], [31, 21], [6, 17]], (x, y) => foe(m, x, y, 'u'));
  // Schmiedetor: Kultisten, Wichte, Harpyie
  each([[51, 14], [77, 15], [52, 20], [76, 21]], (x, y) => foe(m, x, y, 'u'));
  each([[56, 19], [72, 19], [47, 17]], (x, y) => foe(m, x, y, 'i'));
  foe(m, 80, 13, 'y');
  // Kolosskrater: Hunde um den Koloss, ein Wicht
  each([[97, 11], [109, 12], [96, 20], [106, 22]], (x, y) => foe(m, x, y, 'h'));
  foe(m, 113, 13, 'i');
  // Harpyiennester über den Straßen: je zwei bis drei Harpyien
  each([[48, 55], [56, 56]], (x, y) => foe(m, x, y, 'y'));
  each([[116, 55], [108, 56]], (x, y) => foe(m, x, y, 'y'));
  // Adlerhorst: Nestwächterin
  foe(m, 118, 33, 'y');

  // ------------------------------------------------ Klippenwände: Basaltsäulen über die zwei Wandreihen
  // Marke auf der untersten Wandkachel (fest über level.solid), Bild deckt Wand + Schlagschatten.
  const skipFace = (x, y) => (x >= 55 && x <= 73 && y <= 6) || ((x >= 6 && x <= 12) || (x >= 27 && x <= 33)) && y <= 9;
  for (let y = 1; y < H - 1; y++) for (let x = 0; x < W; x++) {
    if (m.get(x, y) !== '#' || m.get(x, y - 1) !== '#' || skipFace(x, y)) continue;
    const below = m.get(x, y + 1);
    if (below === '#' || below === '~' || below === '=' || below === 'X') continue;
    put(x, y, 'X');
  }

  // ------------------------------------------------ Wegdeko: Steinmänner, Grubenlampen, Seilgeländer entlang der Wege
  const lineMarks = (pts, every, chs, side = 2.4, skip = () => false) => {
    let acc = every * 0.5, flip = 1, n = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const len = Math.hypot(bx - ax, by - ay); if (!len) continue;
      for (let s2 = 0; s2 < len; s2 += 0.5) {
        acc += 0.5; if (acc < every) continue;
        const t = s2 / len, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
        const nx = -(by - ay) / len, ny = (bx - ax) / len;
        const tx = Math.round(x + nx * side * flip), ty = Math.round(y + ny * side * flip);
        if (skip(tx, ty) || !',.'.includes(m.get(tx, ty)) || near(m, tx, ty, '~', 1) || net.onRoad(tx, ty) && m.get(tx, ty) === '.') continue;
        put(tx, ty, chs[n++ % chs.length]); acc = 0; flip = -flip;
      }
    }
  };
  const inFort = (x, y) => x >= fort.x && x <= fort.x + fort.w && y >= 33 && y <= fort.y + fort.h;
  const nearSpot = (x, y) => spots.some(([sx, sy]) => Math.abs(x - sx) <= 2 && Math.abs(y - sy) <= 2);
  const skipM = (x, y) => inFort(x, y) || nearSpot(x, y) || ramps.some((r) => x >= r.x - 1 && x <= r.x + r.w && y >= r.y - 2 && y <= r.y + r.h + 1);
  lineMarks(mainS, 7, ['n', 'l'], 2.6, skipM);
  lineMarks([[57.5, 27.5], [48, 25], [36, 22], [26, 19], [14, 16]], 6, ['l'], 2.2, skipM);            // Minenweg: Grubenlampen
  lineMarks([[43, 51], [52, 53], [62, 54.5], [74, 54], [82, 50], [86, 47], [96, 46], [104, 45], [116, 44.5], [126, 44.5]], 8, ['n'], 2.6, skipM);
  lineMarks([[62, 22], [74, 19], [86, 17], [93, 16]], 7, ['n'], 2.4, skipM);
  // Seilgeländer an den Kehren des Serpentinensteigs (Kante über dem tieferen Band)
  for (let x = 39; x <= 54; x += 1) { if (m.get(x, 41) === ',' && x % 2 === 0) put(x, 41, '|'); if (m.get(x, 35) === ',' && x % 2 === 1 && x > 42) put(x, 35, '|'); }

  // ------------------------------------------------ Streudeko (sparsam, in Gruppen)
  const L0 = (x, y) => y > bandA(x) + 2, L2 = (x, y) => y < bandB(x) && !(x >= 36 && x <= 61 && y > 27);
  const inRift = (x, y) => ((x - 71) / 10) ** 2 + ((y - 46) / 7) ** 2 <= 1;
  const inCrater = (x, y) => ((x - CX) / 17) ** 2 + ((y - CY) / 11.5) ** 2 <= 1;
  const keep = (x, y) => inFort(x, y)
    || (x >= 56 && x <= 72 && y <= 11) || (x >= 112 && y >= 31 && y <= 38)
    || (x >= 54 && x <= 66 && y >= 78) || (x >= 118 && y >= 40 && y <= 48) || (x >= 18 && x <= 26 && y >= 26 && y <= 36)
    || ramps.some((r) => x >= r.x - 1 && x <= r.x + r.w && y >= r.y - 2 && y <= r.y + r.h + 1)
    || bridges.some((b) => x >= b.x - 1 && x <= b.x + b.len && y >= b.y - 1 && y <= b.y + 3)
    || (x >= 14 && x <= 23 && y >= 54 && y <= 63) || nearSpot(x, y);
  const grove = (x, y, s3) => hash2(x >> 3, y >> 3, s3) < 0.3;     // Gruppen statt Gleichverteilung
  strew(m, net, rng, keep, (x, y, g, free) => {
    const wet = near(m, x, y, '~', 1);
    if (g === ':') return inRift(x, y) && free && rng.chance(0.1) ? 's' : null;
    if (g === '.') {
      if (inRift(x, y)) return free && rng.chance(0.1) ? 's' : null;
      if (inCrater(x, y)) return free && rng.chance(0.03) ? 'k' : null;
      return null;
    }
    if (g !== ',') return null;
    if (wet) return rng.chance(0.06) ? 'a' : null;
    if (inRift(x, y)) return free && rng.chance(0.07) ? 's' : null;
    if (L2(x, y) && x < 40) return free && grove(x, y, 41) && rng.chance(0.06) ? (rng.chance(0.5) ? 'K' : 'j') : null;   // Minen: Abraum, Stützen
    if (L2(x, y)) return free && grove(x, y, 42) && rng.chance(0.08) ? 'k' : null;                                      // Basaltgruppen
    if (L0(x, y)) {                                                                                                       // Hänge: tote Haine, Halden
      if (x > 70) return free && grove(x, y, 43) && rng.chance(0.06) ? 'K' : null;
      return free && grove(x, y, 44) && rng.chance(0.12) ? 't' : rng.chance(0.01) ? 'a' : null;
    }
    return free && grove(x, y, 45) && rng.chance(0.07) ? (rng.chance(0.6) ? 'k' : 't') : null;
  }, ',:.');

  // ------------------------------------------------ Bodenarten (level.soil, nur Färbung)
  const soil = new MapBuilder(W, H, ' ');
  blob(soil, rng, 20, 17, 18, 9, 'o', null, 5);                        // Erzadern um die Minen
  soil.path([[9, 8], [9, 14], [14, 18]], 3, 'o'); soil.path([[30, 8], [30, 14], [26, 19]], 3, 'o');
  blob(soil, rng, 100, 74, 26, 12, 's', null, 6);                      // Schlackenhalden und Erzsee-Ufer
  blob(soil, rng, 71, 46, 11, 8, 's', null, 4);                        // Obsidianriss: dunkles Glas
  blob(soil, rng, 64, 10, 10, 4.5, 'y', null, 3);                      // Schwefel am Schmiedetor
  blob(soil, rng, CX, CY, 14, 9, 'y', null, 4);                        // Schwefelkrater
  blob(soil, rng, 49, 36, 13, 10, 'g', null, 3);                       // Serpentinen: heller Kies
  blob(soil, rng, 18, 47, 12, 8, 'g', null, 3);                        // Horst
  blob(soil, rng, 28, 77, 9, 5, 'g', null, 2);                         // Bergmannsfriedhof: heller Kies
  soil.path(lava, 6, 'g');                                             // heller Kies am Erzbach
  for (const [x, y] of [[93, 38], [99, 55], [88, 54], [96, 31], [58, 7], [70, 7]]) soil.ellipse(x, y, 3, 2, 'y');

  return {
    name: 'Die Schlackenhöhen',
    kind: 'outdoor',
    biome: 'peaks',
    decorSet: 'decor_peaks',
    map: m.rows(),
    soil: soil.rows(),
    solid: 'X',
    decor: {
      t: 'deadTrees', k: 'basaltColumns', s: 'obsidianSpikes', r: 'lavaRocks', a: 'ashDrifts',
      T: 'tent', P: 'bannerPole',
      F: 'forge', c: 'crates', e: 'lavaVent', Z: 'forgeGate',
      m: 'mineEntrance', q: 'mineRails', o: 'mineCart', j: 'pitProps', K: 'slagHeap', R: 'rampSteps', Q: 'rampSteps4',
      B: 'lavaBridge', n: 'cairn', b: 'brazier', L: 'lookoutSpyglass', X: 'basaltFace',
      E: 'liftRamp', '^': 'liftWinch', _: 'liftCage', '|': 'ropeFence', l: 'mineLamp', O: 'minerGrave', V: 'oreCrusher',
    },
    points: { 1: 'start', 2: 'respawn', 3: 'from_ashwood', 4: 'from_molten_forge', 6: 'from_ashen_steppe', 7: 'waystone' },
    waystone,
    npcs: { C: 'commander_hale', Y: 'seer_ysolde', D: 'quartermaster_dunn' },
    enemies: {
      i: { type: 'fire_imp' }, h: { type: 'magma_hound' }, g: { type: 'ash_golem' },
      u: { type: 'cinder_cultist' }, M: { type: 'magma_behemoth' },
      x: { type: 'cinder_sapper' }, y: { type: 'cliff_harpy' },
    },
    respawn: 40,
    fissures,
    areas: [
      { id: 'rookwatch', name: 'Rauhwacht', town: true, ...fort },
      { id: 'obsidian_rift', name: 'Obsidianriss', ...rift },
      { id: 'forge_gate', name: 'Schmiedetor', x: 56, y: 5, w: 17, h: 8 },
      { id: 'ash_slopes', name: 'Aschehänge', x: 2, y: 62, w: 68, h: 24 },
      { id: 'slag_fields', name: 'Schlackenhalden', x: 70, y: 62, w: 56, h: 24 },
      { id: 'serpentine', name: 'Serpentinensteig', x: 36, y: 26, w: 26, h: 20 },
      { id: 'lava_cleft', name: 'Glutspalt', x: 81, y: 34, w: 21, h: 24 },
      { id: 'east_pass', name: 'Ostpass', x: 102, y: 41, w: 24, h: 18 },
      { id: 'old_mines', name: 'Alte Schlackenminen', x: 2, y: 6, w: 34, h: 24 },
      { id: 'colossus_crater', name: 'Kolosskrater', x: 87, y: 4, w: 32, h: 25 },
      { id: 'eagle_eyrie', name: 'Adlerhorst', x: 115, y: 31, w: 11, h: 7 },
      { id: 'rope_lift', name: 'Seilaufzug', x: 13, y: 54, w: 12, h: 9 },
      { id: 'miners_graves', name: 'Bergmannsfriedhof', x: 19, y: 72, w: 18, h: 10 },
      { id: 'ore_crusher', name: 'Erzbrecher am Erzsee', x: 84, y: 76, w: 14, h: 8 },
    ],
    objects: [
      { id: 'rift_seal_1', kind: 'shrine', decor: 'riftSeal', name: 'Siegel der Glut', prompt: 'Siegel der Glut erneuern', x: seal1[0], y: seal1[1] },
      { id: 'rift_seal_2', kind: 'shrine', decor: 'riftSeal', name: 'Siegel der Asche', prompt: 'Siegel der Asche erneuern', x: seal2[0], y: seal2[1] },
      { id: 'rift_seal_3', kind: 'shrine', decor: 'riftSeal', name: 'Siegel des Feuers', prompt: 'Siegel des Feuers erneuern', x: seal3[0], y: seal3[1] },
      { id: 'rift_circle', kind: 'shrine', decor: 'riftCircle', name: 'Ritualkreis', prompt: 'Ritual mit Ysolde beginnen', x: circleAt[0], y: circleAt[1] },
      { id: 'sluice_dam', kind: 'shrine', decor: 'sluiceGate', name: 'Schleuse am Damm', prompt: 'Schleuse am Damm öffnen', x: sluiceDam[0], y: sluiceDam[1] },
      { id: 'sluice_bridge', kind: 'shrine', decor: 'sluiceGate', name: 'Schleuse an der Brücke', prompt: 'Schleuse an der Brücke öffnen', x: sluiceBridge[0], y: sluiceBridge[1] },
      { id: 'sluice_falls', kind: 'shrine', decor: 'sluiceGate', name: 'Schleuse am Glutfall', prompt: 'Schleuse am Wasserfall öffnen', x: sluiceFalls[0], y: sluiceFalls[1] },
      { id: 'harpy_nest_1', kind: 'shrine', decor: 'harpyNest', name: 'Harpyiennest', prompt: 'Nest zerstören', x: nest1[0], y: nest1[1] },
      { id: 'harpy_nest_2', kind: 'shrine', decor: 'harpyNest', name: 'Harpyiennest', prompt: 'Nest zerstören', x: nest2[0], y: nest2[1] },
      { id: 'harpy_nest_3', kind: 'shrine', decor: 'harpyNest', name: 'Harpyiennest', prompt: 'Nest zerstören', x: nest3[0], y: nest3[1] },
      ...caches.map((c) => ({ id: c.id, kind: 'chest', decor: 'hiddenCache', prompt: 'Versteck öffnen', x: c.x, y: c.y })),
    ],
    caches,
    // Abläufe (Thread C): Ritual im Obsidianriss verteidigen, Kultisten-Wellen aus vier Richtungen
    questRoutes: {
      defend_rift_ritual: { kind: 'defend', at: circleAt, spawns: riftSpawns, foe: 'cinder_cultist', seconds: 90 },
    },
    portals: [
      { id: 'to_ashwood', x: 60.5, y: 87.4, range: 28, visual: 'road', dir: [0, 1],
        to: { zoneId: 'ashwood', spawnId: 'from_cinder_peaks' }, prompt: 'Hinab in den Aschenwald' },
      { id: 'to_molten_forge', x: 64, y: 4.9, range: 26, requires: { level: 17 },
        to: { zoneId: 'molten_forge', spawnId: 'start' }, prompt: 'Die Glutschmiede betreten' },
      { id: 'to_ashen_steppe', x: 127.4, y: 44.5, range: 28, requires: { level: 20 }, visual: 'road', dir: [1, 0],
        to: { zoneId: 'ashen_steppe', spawnId: 'from_cinder_peaks' }, prompt: 'Ostwärts in die Aschensteppe' },
    ],
  };
}
