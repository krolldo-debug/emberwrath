import { createRng, hash2 } from '../../core/math.js';
import { MapBuilder } from '../levels.js';
import { near, each, blob, roadNet, MISPLACED, foe, strew } from '../mapkit.js';

// ---------------------------------------------------------------- Schlackenhöhen (12–20)
// Ein Erzgebirge in drei Höhenstufen. Runde 6: Die Stufen entstehen aus einem Höhenfeld (LV) statt aus
// schnurgeraden Klippenbändern. Jede Terrassenkante ist eine geschwungene Linie mit Vorsprüngen und Buchten;
// ihre Wandhöhe (1–3 Kacheln) wechselt mit dem Gelände und läuft zu den Hangwegen hin flach aus.
// Die Kanten reichen nicht über die ganze Breite: Hangwege (Geröllhänge) verbinden die Stufen natürlich,
// nur am Seilaufzug und an der Steintreppe (R2) bleibt die Wand ungebrochen. Fünf Hänge teilen die Südkante.
// Der Kartenrand ist eine breite, unregelmäßige Bergflanke mit Felssporen, an deren Fuß Geröll liegt.
// Runde 6b: Alle Felsen sind '#'; das Biom malt sie selbst in den Boden (level.paintedCliffs + level.elev,
// Maler in decor_peaks.js, braucht VORSCHLAG_Outdoor.js.diff): weicher Umriss, Felswände mit unregelmäßiger
// Oberkante, Bergflanken in Stufen, Felsbrocken an Wandfuß und Wandenden – keine Wand-Sprites mehr.
// Farben (Biom 'peaks', level.soil): Süden dunkler Basalt, Mitte (u) helle Asche, Norden (v) rostige Schlacke;
// dazu rostige Erzadern, dunkle Schlacke, Schwefelkrusten, 'r'/'p' Geröll am Wandfuß, 'h' Hangweg.
//   Stufe 0 (Süden)   Aschehänge mit Bergmannsfriedhof (Ankunft aus dem Aschenwald, Mitte unten),
//                     Schlackenhalden mit Erzbrecher am Erzsee
//   Stufe 1 (Mitte)   Rauhwacht – ein Felsenhorst ohne Mauern, erreichbar über den Seilaufzug von unten
//                     oder durch das Felstor im Osten; Obsidianriss, Erzbach mit Brücken, Ostpass
//   Stufe 2 (Norden)  Alte Schlackenminen, Schmiedetor, Kolosskrater; Adlerhorst (Geheimecke)
// Übergänge: Seilaufzug, Hangweg am Riss (R1), Steintreppe (R2), Hangweg am Glutspalt (R3),
// Serpentinensteig durch den Felsstock, Stollen hinter dem Horst, Felsrinne zum Adlerhorst, Osthang,
// Geröllhänge am Erzbach-Fall und am Erzsee.

const W = 128, H = 88;
const MASS = 9;

// Weiches 1D-Rauschen 0..1 (deterministisch)
const sn = (x, s, f) => {
  const t = x / f, i = Math.floor(t), u = t - i, w = u * u * (3 - 2 * u);
  return hash2(i, 0, s) * (1 - w) + hash2(i + 1, 0, s) * w;
};
// Weiches 2D-Rauschen 0..1
const sn2 = (x, y, s, f) => {
  const tx = x / f, ty = y / f, i = Math.floor(tx), j = Math.floor(ty), u = tx - i, v = ty - j;
  const a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v);
  const h = (p, q) => hash2(p, q, s);
  return (h(i, j) * (1 - a) + h(i + 1, j) * a) * (1 - b) + (h(i, j + 1) * (1 - a) + h(i + 1, j + 1) * a) * b;
};

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
// Geschlossene Kurve (Umriss) aus Stützpunkten
function loop(pts, n = 6) {
  const out = [], N = pts.length;
  for (let i = 0; i < N; i++) {
    const p0 = pts[(i - 1 + N) % N], p1 = pts[i], p2 = pts[(i + 1) % N], p3 = pts[(i + 2) % N];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}
const inside = (poly, x, y) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
// Kantenverlauf als Funktion von x (Stützpunkte nach x geordnet), mit feinem Zittern
function profile(pts, seed, amp = 0.9) {
  const s = curve(pts, 8), out = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    let y = s[0][1];
    for (let i = 0; i < s.length - 1; i++) {
      const [ax, ay] = s[i], [bx, by] = s[i + 1];
      if (x >= ax && x <= bx && bx > ax) { y = ay + ((by - ay) * (x - ax)) / (bx - ax); break; }
      if (x > bx) y = by;
    }
    out[x] = y + (sn(x, seed, 2.6) - 0.5) * amp + (hash2(x, 3, seed) - 0.5) * 0.12;
  }
  return out;
}

export function buildCinderPeaks() {
  const m = new MapBuilder(W, H, ',');
  const rng = createRng(1717);
  const put = (x, y, ch) => m.set(x, y, ch);
  const fill = (x0, y0, x1, y1, ch) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m.set(x, y, ch); };

  // ================================================================ Höhenfeld
  // LV: 0 Süden, 1 Mitte, 2 Norden, MASS = Felsmasse (Rand, Felsstock, Krater, Felsnasen)
  const LV = new Uint8Array(W * H);
  const lv = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? MASS : LV[y * W + x]);
  const setLV = (x, y, v) => { if (x >= 0 && y >= 0 && x < W && y < H) LV[y * W + x] = v; };
  const shape = (pts, v, n = 6) => {
    const p = loop(pts, n);
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (const [x, y] of p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, Math.ceil(y1)); y++)
      for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(W - 1, Math.ceil(x1)); x++) if (inside(p, x + 0.5, y + 0.5)) setLV(x, y, v);
  };
  const ell = (cx, cy, rx, ry, v, seed = 0) => {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
      const a = Math.atan2(y - cy, x - cx), e = 1 + Math.sin(a * 3 + seed) * 0.12 + Math.sin(a * 5 + seed * 1.7) * 0.07;
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= e * e) setLV(x, y, v);
    }
  };

  // Terrassenkanten (Fußlinie: erste Reihe der tieferen Stufe)
  const footA = profile([
    [-2, 61], [3, 63], [7, 66], [11, 64.5], [14, 61.5], [17, 60], [20, 60.5], [24, 61.5], [27, 60.5], [30, 57.5], [34, 56.5], [38, 58],
    [43, 59], [48, 59.5], [52, 62.5], [55, 65.5], [58, 65.5], [61, 62.5], [64, 60.5], [67, 60], [70, 62], [74, 63], [77, 63], [80, 62.5],
    [83, 63], [86, 64.5], [89, 65], [92, 64], [95, 62], [98, 59.5], [102, 60.5], [106, 63.5], [110, 64.5], [114, 63.5], [118, 60.5],
    [121, 61], [124, 62], [130, 62],
  ], 401, 0.35);
  const footB = profile([
    [-2, 33], [4, 35], [8, 32], [12, 29.5], [15, 30.5], [18, 33.5], [21, 33], [24, 32], [28, 29.5], [31, 31], [35, 31],
    [60, 31], [63, 30.5], [66, 29.5], [69, 29.2], [72, 30.6], [75, 30], [78, 27.5], [81, 28], [84, 30], [87, 31.5], [90, 30.5], [93, 32.5],
    [96, 34.5], [99, 34], [102, 33], [106, 31], [111, 31], [130, 31],
  ], 402, 0.3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) LV[y * W + x] = y >= Math.round(footA[x]) ? 0 : y >= Math.round(footB[x]) ? 1 : 2;

  // ---------------------------------------------- Bergflanken (Kartenrand)
  // Dicke der Flanke: zwei Rauschlagen (lange Rücken, kurze Zacken), an Ausgängen und Lager begrenzt
  const flank = (t, seed, lo, hi) => Math.max(lo, Math.min(hi, lo + Math.round((sn(t, seed, 9) * 0.7 + sn(t, seed + 1, 3.2) * 0.3) * (hi - lo) + (hash2(t, seed, 99) - 0.5) * 1.8)));
  const rimTop = (x) => {
    if (x >= 57 && x <= 71) return 5;                                                    // Schmiedetor
    if (x <= 38) return flank(x, 11, 6, 10);                                              // Minenwand
    return flank(x, 12, 4, 10);
  };
  const rimBot = (x) => (x >= 57 && x <= 63 ? 0 : x === 56 || x === 64 ? 3 : x >= 18 && x <= 38 ? flank(x, 13, 3, 6) : flank(x, 13, 3, 9));
  const rimL = (y) => (y >= 33 && y <= 58 ? flank(y, 14, 3, 5) : flank(y, 14, 3, 9));
  const rimR = (y) => (y >= 42 && y <= 46 ? 0 : (y === 41 || y === 47) ? 3 : flank(y, 15, 3, 9));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (y < rimTop(x) || y >= H - rimBot(x) || x < rimL(y) || x >= W - rimR(y)) setLV(x, y, MASS);
  }
  // Felssporen der Flanken (unregelmäßige Umrisse)
  shape([[-2, 76], [5, 74.5], [7.5, 78], [6, 82], [9, 86], [-2, 90]], MASS);               // Südwestecke
  shape([[8, 90], [10, 84.5], [14, 83.2], [17, 86], [19, 90]], MASS);
  shape([[33, 90], [36, 85.5], [41, 84.3], [44, 86.6], [46, 90]], MASS);
  shape([[44, 90], [47, 82.6], [50, 82], [52, 85], [55, 90]], MASS);
  shape([[66, 90], [68, 85.4], [73, 84], [76, 86], [79, 90]], MASS);
  shape([[84, 90], [86, 86.2], [90, 85.8], [92, 90]], MASS);
  shape([[104, 90], [107, 84.4], [113, 83.6], [117, 85.5], [119, 90]], MASS);
  shape([[118, 90], [120, 81], [124, 77.5], [130, 76], [130, 90]], MASS);                 // Südostecke
  shape([[130, 70], [125, 68.8], [123.5, 66], [126, 63.5], [130, 63]], MASS);
  shape([[130, 56], [124.5, 55], [123, 52], [126, 49.5], [130, 49]], MASS);
  shape([[130, 40], [125.5, 39], [124, 36], [126, 33], [130, 32]], MASS);
  shape([[-2, 12], [4, 11], [6.5, 14.5], [4, 18.5], [-2, 19]], MASS);                      // Westflanke
  shape([[-2, 24], [3.6, 23.6], [5, 26], [3, 29], [-2, 30]], MASS);
  shape([[-2, 63], [5, 63.5], [8.5, 67], [7.5, 71], [3, 72.5], [-2, 73]], MASS);
  shape([[40, -2], [41, 6], [44, 9.5], [48, 9.2], [50, 6], [52, -2]], MASS);                // Nordwand
  shape([[73, -2], [74.5, 7], [77, 11], [80.5, 11.6], [83.5, 9], [86, -2]], MASS);
  shape([[130, 66], [124.5, 67.5], [122.4, 71], [124, 75.5], [130, 77]], MASS);
  // Ostflanke über dem Krater: kein Lineal mehr, Grate und Rinnen
  for (let y = 0; y < 32; y++) {
    const e = 118 + Math.round(sn(y, 16, 4) * 3.2 - (y > 22 ? (y - 22) * 0.35 : 0));
    for (let x = e; x < W; x++) setLV(x, y, MASS);
  }

  // ---------------------------------------------- Felsmassen im Inneren
  // Serpentinensteig: ein Felsstock zwischen Mitte und Norden, der Steig wird später hineingeschnitten
  shape([[35, 27], [41, 25.5], [49, 26.6], [56, 25.2], [61, 27.5], [62.6, 33], [61.4, 39], [62.4, 44], [58.5, 47],
    [54, 45.4], [50, 46.9], [45.5, 44.8], [41, 46.2], [37.5, 44.4], [34.4, 42], [33.6, 36], [34.6, 30]], MASS, 5);
  // Rauhwacht: Westklippe und Ostgrat mit Felstor
  for (let y = 33; y <= 58; y++) for (let x = 0; x <= 3 + Math.round(sn(y, 17, 4.5) * 2.4); x++) setLV(x, y, MASS);
  const rib = [[33.6, 33], [33, 37], [32.4, 41], [33.4, 44.2]];
  const rib2 = [[33.6, 48], [32.6, 51], [32.2, 54], [33.6, 57.5]];
  for (const pts of [rib, rib2]) for (const [x, y] of curve(pts, 6)) ell(x, y, 1.7 + sn(y, 18, 3) * 0.8, 1.1, MASS, y);
  // Kolosskrater: Ring mit Lücke im Westen
  const CX = 104, CY = 16;
  for (let y = 2; y < 32; y++) for (let x = 84; x < 126; x++) {
    const d = ((x - CX) / 17) ** 2 + ((y - CY) / 11.5) ** 2;
    const a = Math.atan2(y - CY, x - CX);
    const ring = d >= 0.74 - sn2(x, y, 31, 4) * 0.08 && d <= 1.02 + (sn2(x, y, 32, 3) - 0.5) * 0.28;
    const westGap = Math.abs(Math.abs(a) - Math.PI) < 0.2 && y >= 13 && y <= 19;
    if (ring && !westGap) setLV(x, y, MASS);
    else if (d < 0.74) setLV(x, y, 2);
  }
  // Adlerhorst-Felsnase (Geheimecke) über dem Ostpass
  shape([[110.6, 30], [116, 28.5], [123, 29], [128, 30], [128, 41], [122, 41.4], [117, 40.6], [112.6, 39.8], [111.2, 35]], MASS);
  // Felsnasen (Basaltstöcke) auf allen Stufen
  for (const [x, y, a, b, s] of [[12, 67, 2.6, 1.7, 1], [64, 77, 2.6, 1.5, 2], [86, 80.5, 3, 1.7, 3], [118, 54, 2.5, 1.7, 4], [104, 53, 1.9, 1.5, 5],
    [8, 14, 2.4, 1.5, 6], [46, 13, 1.8, 1.2, 7], [79, 11, 2.2, 1.3, 8], [70, 40, 1.3, 1.1, 9], [27, 13, 1.6, 1.1, 10], [16, 79, 1.5, 1.1, 11],
    [38, 70, 1.7, 1.1, 12], [97, 77.5, 1.4, 1, 13], [55, 20.5, 1.6, 1.1, 14], [92, 23, 1.8, 1.2, 15]]) ell(x, y, a, b, MASS, s);

  // Hangwege: Hier entstehen keine Wände, die Stufen gehen über Geröllhänge ineinander über
  const slopes = [
    { x: 43.5, y: 58.5, rx: 5.2, ry: 3.8 },      // R1 am Riss (Hauptweg zum Felstor und zum Ostpass)
    { x: 87, y: 31.5, rx: 4.8, ry: 3.6 },        // R3 am Glutspalt (zum Kolosskrater)
    { x: 123.5, y: 62, rx: 3.6, ry: 3.6 },       // Osthang zwischen Schlackenhalden und Ostpass
    { x: 93.5, y: 62.5, rx: 3.8, ry: 3.1 },      // Geröllhang am Erzbach-Fall
    { x: 108, y: 63.5, rx: 4.2, ry: 3 },         // Geröllhang am Erzsee
    { x: 66, y: 29.8, rx: 6, ry: 3.2 },       // Geröllhang am Nordende des Risses
  ];
  const onSlope = (x, y, pad = 0) => slopes.some((s) => ((x - s.x) / (s.rx + pad)) ** 2 + ((y - s.y) / (s.ry + pad)) ** 2 <= 1);

  // ---------------------------------------------- Höhenfeld -> Zeichen
  // Südkante: Wand mit k Wandreihen (1–3) und c Kappenreihen auf der höheren Stufe; Seiten-/Rückkanten: 1 Kachel Fels.
  const K = new Map();             // Wandfuß (x,y) -> Wandhöhe in Kacheln
  const tall = (x, y) => (x <= 36 && y > 50) ? 3 : 0;           // Horst: hohe Klippe
  const kAt = (x, y, diff) => {
    let k = tall(x, y) || (diff >= 2 ? 3 : 2);
    const n = sn(x, y < 46 ? 21 : 28, 9);
    if (!tall(x, y)) k += n > 0.62 ? 1 : n < 0.22 ? -1 : 0;
    // zu den Hangwegen hin flacher
    for (let d = 1; d <= 5; d++) if (onSlope(x - d, y) || onSlope(x + d, y)) { k = Math.min(k, Math.ceil(d / 2)); break; }
    return Math.max(1, Math.min(3, k));
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (lv(x, y) === MASS) put(x, y, '#');
  for (let x = 0; x < W; x++) for (let y = 0; y < H - 1; y++) {
    const u = lv(x, y), v = lv(x, y + 1);
    if (u === MASS || v === MASS || u <= v || onSlope(x, y)) continue;
    const k = kAt(x, y, u - v), c = 0;
    for (let j = 0; j < k + c; j++) if (lv(x, y - j) === u) put(x, y - j, '#');
    K.set(y * W + x, k);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = lv(x, y);
    if (u === MASS || onSlope(x, y)) continue;
    const lowSide = [lv(x - 1, y), lv(x + 1, y), lv(x, y - 1)].some((v) => v !== MASS && v < u);
    if (lowSide) put(x, y, '#');
  }

  // ================================================================ Gelände
  blob(m, rng, 18, 47, 11.5, 7, '.', [','], 3);             // festgetretener Lagerboden
  blob(m, rng, 8, 40, 2.2, 1.6, '#', [',', '.'], 2);        // Felsnadeln im Horst
  blob(m, rng, 29, 53, 1.6, 1.2, '#', [',', '.'], 2);
  m.path(curve([[7, 35.5], [13, 35], [20, 35.6], [26, 35.2], [31, 35.8]]), 2.2, '.', [',']);   // Stollenhof zwischen Horst und Minenwand
  const fort = { x: 4, y: 37, w: 30, h: 20 };

  // Kraterboden: festgetretene Schwefelerde
  for (let y = 2; y < 32; y++) for (let x = 84; x < 126; x++) if (((x - CX) / 17) ** 2 + ((y - CY) / 11.5) ** 2 < 0.74 && m.get(x, y) === ',') put(x, y, '.');
  // Adlerhorst: Mulde in der Felsnase, Felsrinne aus dem Krater
  for (let y = 31; y <= 38; y++) for (let x = 115; x <= 125; x++) if (((x - 120.2) / 5.4) ** 2 + ((y - 34.6) / 3.6) ** 2 <= 1) put(x, y, ',');
  m.path([[117, 15], [120.5, 13.6], [122.6, 16], [122.4, 22], [121.6, 27], [120.6, 31.5]], 1.6, '.', null);

  // Erzbach vom Krater in den Erzsee
  const lava = [[110, 22], [107, 27], [104, 31], [100, 36], [95, 41], [92, 46], [92, 51], [94, 56], [96, 60], [98.5, 65], [102, 70]];
  m.path(lava, 3.2, '~', null);
  blob(m, rng, 108, 75, 11, 6.2, '~', [',', '#'], 5);   // Erzsee
  m.ellipse(31, 66, 2.6, 1.5, '~', [',']);               // Tümpel
  m.ellipse(13, 24, 2.4, 1.4, '~', [',']);
  m.ellipse(74, 12, 2.2, 1.3, '~', [',']);

  // Obsidianriss (Stufe 1, Mitte)
  const rift = { x: 62, y: 36, w: 19, h: 20 };
  blob(m, rng, 71, 46, 8.5, 5.8, '.', [','], 4);
  m.ellipse(71, 46.5, 3.2, 2.2, ':', ['.']);
  for (const [x, y, a, b] of [[14, 74, 7, 3.5], [52, 77, 8, 3], [90, 72, 9, 4], [113, 66, 6, 2.5], [100, 50, 5, 4], [20, 16, 11, 5], [8, 24, 4, 3], [33, 25, 4, 2.5], [76, 24, 6, 3], [64, 16, 5, 3], [26, 68, 5, 2.5], [112, 52, 6, 3]]) blob(m, rng, x, y, a, b, '.', [','], 3);
  // Glutspalten: drei feste Spalten (wenige Glutzellen = wenige Lichter) und Glutrisse im Boden (nur Bild)
  const fissures = [
    [[66, 41], [69, 42.5], [72, 41], [76, 42]],
    [[96, 9], [99, 11], [103, 9.5]],
    [[44, 15], [46.5, 17.5], [45, 21]],
    [[84.5, 47.5], [86.5, 51], [85.5, 55], [88, 57.5]],          // Glutspalt
    [[99, 39], [101.5, 42], [104.5, 42.5]],
    [[78, 67.5], [82, 70], [84.5, 74], [83, 77.5]],               // Schlackenhalden
  ];
  for (const f of fissures.slice(0, 3)) m.path(f, 1, '=', [',', ':']);

  // ================================================================ Straßen
  const net = roadNet(m);
  const road = (pts, w = 2.6, ch = '.') => net.road(pts, w, ch, [',', '~', ':', '=']);
  const mainS = curve([[60, 87.5], [59, 81], [53, 75], [44, 71], [34, 68], [25, 64.5], [19.5, 62], [17.5, 58]]);
  road(mainS, 3);                                                                            // Hauptweg Süd -> Seilaufzug
  const hangR1 = curve([[44, 71], [43.5, 65], [41.5, 61.5], [43, 58], [45, 55], [43, 51]]);
  road(hangR1, 2.8);                                                                         // Hangweg R1
  road([[17.5, 58], [17.5, 52], [18, 49]], 2.4);                                             // Aufzug -> Wachfeuer
  road(curve([[43, 51], [38, 47.5], [33, 46], [26, 47], [20, 48]]), 2.6);                     // Felstor -> Wachfeuer
  const eastRoad = [[43, 51], [52, 53], [62, 54.5], [74, 54], [82, 50], [86, 47], [96, 46], [104, 45], [116, 44.5], [127.5, 44.5]];
  road(eastRoad, 3);                                                                         // Ost (Steppe)
  // Serpentinensteig: geschwungene Kehren durch den Felsstock (statt Treppen)
  const serp = curve([[50, 48.5], [56.5, 47], [59.2, 44], [57.5, 40.8], [52.5, 41.6], [47.5, 40.2], [43, 39.8], [40, 37.6], [40.8, 34.4], [45, 33], [50, 34], [55, 32.4], [57.6, 30.6], [58.6, 28], [61, 23.5]], 6);
  m.path(serp, 3.3, '.', null);
  for (const [x, y, r] of [[58.2, 42.2, 2.4], [40.5, 36, 2.3], [57.6, 30.2, 2.2]]) m.ellipse(x, y, r, r * 0.9, '.', null);   // Kehren
  road([[43, 51], [50, 48]], 2.4);
  road([[61, 23.5], [62, 22], [64, 14], [64, 8]], 2.4);
  road([[58, 27.5], [48, 25], [36, 22], [26, 19], [14, 16]], 2.2);                         // Minenweg
  road([[26, 19], [22.5, 24], [22, 30], [22, 34], [20, 36.5]], 2);                           // Stollen
  road([[62, 22], [74, 19], [86, 17], [93, 16], [100, 16]], 2.4);                            // Kraterweg
  const hangR3 = curve([[84, 50], [86, 41], [85.5, 35.5], [88.5, 31.5], [87, 26], [87, 22], [86, 17]]);
  road(hangR3, 2.6);                                                                         // Hangweg R3
  road(curve([[59, 81], [65, 75], [74, 68], [80.5, 64.5], [80.5, 57], [82, 52]]), 2.4);      // Steintreppe R2
  road([[74, 68], [84, 67.5], [91, 67], [104, 67], [114, 65.5], [120, 66]], 2.2);            // Schlackenhalden (Brücke B2)
  road(curve([[120, 66], [123, 63], [123, 58], [121.5, 50], [122, 46]]), 2);                  // Osthang

  // Brücken über den Erzbach
  const bridges = [];
  const bridgeEW = (row, xc, len) => {
    const x0 = xc - Math.floor(len / 2);
    for (let y = row; y < row + 3; y++) for (let x = x0; x < x0 + len; x++) put(x, y, '.');
    bridges.push({ x: x0, y: row, len });
    put(x0 + 2, row, 'B');
  };
  bridgeEW(45, 92, 6);
  bridgeEW(66, 99, 6);

  // Steintreppe R2: in die Wand gehauen; die Marke sitzt auf der Kachel über der Lücke
  const ramps = [];
  const ramp = (x0, yTop, w = 4, h = 3) => {
    fill(x0, yTop, x0 + w - 1, yTop + h - 1, ':');
    ramps.push({ x: x0, y: yTop, w, h });
    put(x0 + 1, yTop - 1, h === 4 ? 'Q' : 'R');
    for (let y = yTop; y < yTop + h; y++) { put(x0 - 1, y, '#'); put(x0 + w, y, '#'); }
  };
  { let y = 40; while (m.get(80, y + 1) !== '#') y++; while (m.get(80, y + 1) === '#') y++; const f = y + 1; ramp(79, f - 3, 4, 3); fill(78, f, 83, f, '.'); }

  // ================================================================ Rauhwacht: Zeltlager um das Wachfeuer
  // Seilaufzug: Bohlensteg durch die Klippe, Winde oben, Korb unten
  const liftTop = (() => { let y = 50; while (m.get(17, y) !== '#') y++; return y; })();
  const liftFoot = (() => { let y = liftTop; while (m.get(17, y) === '#') y++; return y; })();
  fill(16, liftTop, 19, liftFoot - 1, '.');
  put(17, liftTop - 1, 'E');
  put(22, liftTop - 2, '^'); put(22, liftFoot + 1, '_');
  each([[11, 41], [25, 41], [10, 52], [26, 50], [16, 39]], (x, y) => put(x, y, 'T'));
  put(18, 47, 'F'); put(21, 43, 'P'); put(14, 44, 'P'); put(30, 44, 'P'); put(30, 48, 'P');
  put(24, 54, 'c'); put(27, 54, 'c'); put(8, 54, 'c'); put(13, 54, 'o');
  put(7, 44, 'b'); put(28, 46, 'b'); put(24, 46, 'b');
  put(18, 43, 'C'); put(8, 46, 'Y'); put(25, 53, 'D');
  put(19, 50, '1'); put(15, 50, '2');
  const waystone = { x: 12, y: 47 };
  put(12, 49, '7');
  // Seilgeländer an der Klippenkante des Horsts (Lücke am Aufzug)
  for (let x = 6; x <= 31; x++) {
    if (x >= 15 && x <= 20) continue;
    let y = 50; while (y < H && m.get(x, y + 1) !== '#') y++;
    if (y < 60 && ',.'.includes(m.get(x, y)) && (x + y) % 5 !== 0) put(x, y, '|');
  }
  // Stollenhof
  put(8, 35, 'o'); put(28, 35, 'K'); put(12, 35, 'c');

  // ================================================================ Alte Schlackenminen (Stufe 2, West)
  const mineAt = (x) => { let y = 0; while (m.get(x, y) === '#') y++; return y; };
  const mines = [];
  for (const mx of [9, 30]) {
    const my = mineAt(mx);
    fill(mx - 2, my, mx + 2, my + 1, '.');
    put(mx, my, 'm'); mines.push([mx, my]);
    for (let y = my + 2; y < my + 7; y++) put(mx, y, 'q');
  }
  // Stollen durch die Minenwand (Grubenstützen links/rechts)
  for (let y = 27; y <= 34; y++) for (let x = 21; x <= 23; x++) put(x, y, '.');
  put(20, 28, 'j'); put(24, 28, 'j'); put(20, 35, 'j'); put(24, 35, 'j');
  each([[13, 19], [34, 13], [6, 26]], (x, y) => put(x, y, 'o'));
  each([[18, 11], [27, 26], [8, 19], [38, 17], [16, 27]], (x, y) => put(x, y, 'K'));
  each([[15, 12], [33, 23], [11, 23]], (x, y) => put(x, y, 'c'));
  each([[24, 12], [6, 21], [31, 18]], (x, y) => put(x, y, 'j'));

  // ================================================================ Schmiedetor (Stufe 2, Mitte)
  put(64, 5, 'Z'); put(58, 7, 'e'); put(70, 7, 'e'); put(64, 8, '4');
  put(60, 11, 'b'); put(68, 11, 'b');
  // Serpentinen: Steinmänner an den Kehren, Feuerschalen an den Hangwegen
  each([[55, 47], [42, 38], [55, 34], [59, 25]], (x, y) => put(x, y, 'n'));
  each([[59, 41], [41, 33], [56, 29]], (x, y) => put(x, y, 'b'));
  put(40, 62, 'n'); put(46, 63, 'l'); put(78, 64, 'n'); put(83, 66, 'l'); put(84, 37, 'n');

  // Kolosskrater: Basaltsäulen am Innenrand
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const x = Math.round(CX + Math.cos(a) * 13.2), y = Math.round(CY + Math.sin(a) * 8.4);
    if (Math.abs(a - Math.PI) < 0.45 || m.get(x, y) !== '.') continue;
    if (hash2(i, 3, 19) < 0.7) put(x, y, 'k');
  }
  put(101, 15, 'M');

  // Adlerhorst
  put(119, 33, 'L'); put(124, 34, 'n'); put(117, 36, 'K');
  const caches = [{ id: 'chest_cinder_eyrie', x: 122, y: 35 }];

  // Ostpass, Glutspalt, Schlackenhalden
  put(124, 41, 'P'); put(124, 48, 'P'); put(124, 44, '6');
  put(110, 48, 'T'); put(113, 49, 'c'); put(108, 51, 'b');   // verlassener Posten
  each([[96, 64], [112, 63], [118, 70], [88, 76], [76, 80], [92, 72]], (x, y) => put(x, y, 'K'));
  each([[93, 38], [99, 55], [88, 54], [96, 36]], (x, y) => put(x, y, 'e'));
  // Aschehänge
  put(60, 84, '3');
  put(56, 83, 'n'); put(64, 83, 'n');
  // Bergmannsfriedhof auf den Aschehängen: zwei Reihen Gräber, Grubenlampen am Eingang
  m.ellipse(28, 77, 8, 4, '.', [',']);
  each([[23, 75], [27, 75], [31, 75], [25, 79], [29, 79], [33, 79]], (x, y) => put(x, y, 'O'));
  put(20, 77, 'l'); put(36, 77, 'n'); put(34, 74, 'o');
  // Erzbrecher am Erzsee
  m.ellipse(92, 80, 6, 3.2, '.', [',']);
  put(92, 79, 'V'); put(86, 77, 'K');

  // ================================================================ Questobjekte (Thread C): freie Bodenkachel suchen und freihalten
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
  const nest1 = spot(52, 58), nest2 = spot(51, 22), nest3 = spot(112, 57);
  const riftSpawns = [spot(60, 47), spot(82, 46), spot(71, 57), spot(71, 34)];

  // ================================================================ Gegner (vor der Streudeko)
  // i Feuerwicht, h Magmahund, g Aschegolem, u Kultist, x Schlackensprenger, y Klippenharpyie
  each([[30, 72], [36, 74], [12, 71], [15, 74], [48, 77], [21, 74], [40, 81]], (x, y) => foe(m, x, y, 'i'));
  each([[28, 66], [56, 66], [12, 70]], (x, y) => foe(m, x, y, 'x'));
  each([[106, 64], [114, 68], [90, 82], [72, 77]], (x, y) => foe(m, x, y, 'x'));
  each([[110, 63], [118, 64], [84, 72]], (x, y) => foe(m, x, y, 'h'));
  each([[70, 73], [80, 82], [97, 82]], (x, y) => foe(m, x, y, 'i'));
  // Serpentinensteig: Harpyien kreisen, Wichte in den Kehren
  each([[46, 40], [52, 33], [48, 24], [55, 23]], (x, y) => foe(m, x, y, 'y'));    // zwei davon am Nest über dem Steig
  each([[49, 40], [45, 34], [53, 40], [53, 28]], (x, y) => foe(m, x, y, 'i'));
  // Obsidianriss
  each([[63, 42], [80, 44], [65, 53], [77, 54], [78, 39]], (x, y) => foe(m, x, y, 'g'));
  each([[64, 49], [77, 50], [68, 39], [74, 39]], (x, y) => foe(m, x, y, 'u'));
  foe(m, 66, 38, 'y');
  // Glutspalt
  each([[88, 40], [97, 50], [90, 55], [100, 40]], (x, y) => foe(m, x, y, 'h'));
  each([[85, 44], [96, 53]], (x, y) => foe(m, x, y, 'i'));
  foe(m, 98, 36, 'u');
  // Ostpass
  each([[108, 38], [114, 52], [104, 56]], (x, y) => foe(m, x, y, 'y'));
  each([[111, 41], [106, 47], [110, 51]], (x, y) => foe(m, x, y, 'h'));
  foe(m, 110, 54, 'x');
  // Alte Minen
  each([[11, 14], [30, 14], [18, 22]], (x, y) => foe(m, x, y, 'x'));
  each([[26, 15], [8, 24], [34, 26]], (x, y) => foe(m, x, y, 'g'));
  each([[14, 18], [31, 21], [6, 17]], (x, y) => foe(m, x, y, 'u'));
  // Schmiedetor
  each([[51, 14], [77, 15], [52, 20], [76, 21]], (x, y) => foe(m, x, y, 'u'));
  each([[56, 18], [72, 19], [47, 18]], (x, y) => foe(m, x, y, 'i'));
  foe(m, 80, 14, 'y');
  // Kolosskrater
  each([[97, 11], [109, 12], [96, 20], [106, 22]], (x, y) => foe(m, x, y, 'h'));
  foe(m, 113, 13, 'i');
  // Harpyiennester über den Straßen
  each([[48, 55], [57, 56]], (x, y) => foe(m, x, y, 'y'));
  each([[116, 56], [108, 56]], (x, y) => foe(m, x, y, 'y'));
  // Adlerhorst: Nestwächterin
  foe(m, 118, 33, 'y');

  // ================================================================ Wegdeko
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
        if (skip(tx, ty) || !',.'.includes(m.get(tx, ty)) || near(m, tx, ty, '~', 1) || near(m, tx, ty, '#', 0) || net.onRoad(tx, ty) && m.get(tx, ty) === '.') continue;
        if (m.get(tx, ty + 1) === '#') continue;
        put(tx, ty, chs[n++ % chs.length]); acc = 0; flip = -flip;
      }
    }
  };
  const inFort = (x, y) => x >= fort.x && x <= fort.x + fort.w && y >= 33 && y <= fort.y + fort.h;
  const nearSpot = (x, y) => spots.some(([sx, sy]) => Math.abs(x - sx) <= 2 && Math.abs(y - sy) <= 2);
  const skipM = (x, y) => inFort(x, y) || nearSpot(x, y) || onSlope(x, y, 1) || ramps.some((r) => x >= r.x - 1 && x <= r.x + r.w && y >= r.y - 2 && y <= r.y + r.h + 1);
  lineMarks(mainS, 7, ['n', 'l'], 2.6, skipM);
  lineMarks([[58, 27.5], [48, 25], [36, 22], [26, 19], [14, 16]], 6, ['l'], 2.2, skipM);            // Minenweg: Grubenlampen
  lineMarks(eastRoad.map(([x, y]) => [Math.min(x, 126), y]), 8, ['n'], 2.6, skipM);
  lineMarks([[62, 22], [74, 19], [86, 17], [93, 16]], 7, ['n'], 2.4, skipM);
  // Seilgeländer an den Kehren des Serpentinensteigs: wo der Steig an einer Abbruchkante entlangführt
  for (const [x0, x1, yA, yB] of [[44, 55, 41, 43], [42, 53, 35, 36]]) for (let x = x0; x <= x1; x++) {
    for (let y = yA; y <= yB; y++) if (m.get(x, y) === '.' && m.get(x, y + 1) === '#' && x % 2 === 0) { put(x, y, '|'); break; }
  }

  // ================================================================ Bodenarten (level.soil, nur Färbung)
  const soil = new MapBuilder(W, H, ' ');
  blob(soil, rng, 20, 17, 18, 9, 'o', null, 5);                        // Erzadern um die Minen
  soil.path([[9, 8], [9, 14], [14, 18]], 3, 'o'); soil.path([[30, 8], [30, 14], [26, 19]], 3, 'o');
  blob(soil, rng, 100, 74, 26, 12, 's', null, 6);                      // Schlackenhalden und Erzsee-Ufer
  blob(soil, rng, 71, 46, 11, 8, 's', null, 4);                        // Obsidianriss: dunkles Glas
  blob(soil, rng, 64, 10, 10, 4.5, 'y', null, 3);                      // Schwefel am Schmiedetor
  blob(soil, rng, CX, CY, 14, 9, 'y', null, 4);                        // Schwefelkrater
  blob(soil, rng, 18, 47, 12, 8, 'g', null, 3);                        // Horst
  blob(soil, rng, 28, 77, 9, 5, 'g', null, 2);                         // Bergmannsfriedhof: heller Kies
  soil.path(lava, 6, 'g');                                             // heller Kies am Erzbach
  for (const [x, y] of [[93, 38], [99, 55], [88, 54], [96, 36], [58, 7], [70, 7]]) soil.ellipse(x, y, 3, 2, 'y');
  // Schlackekegel unter Minen und Schmiedetor: dunkle Halden, die den Hang hinunterlaufen
  for (const pts of [[[9, 9], [7, 13], [6, 18]], [[30, 9], [33, 12], [36, 15]], [[58, 8], [54, 11], [50, 13]], [[70, 8], [74, 10], [79, 14]], [[86, 63], [84, 70], [80, 74]], [[106, 62], [109, 66]]]) {
    const c = curve(pts, 6);
    c.forEach(([x, y], i) => soil.ellipse(x, y, 1.2 + i * 0.22, 0.9 + i * 0.12, 's'));
  }
  // Höhenstufen leicht abgestuft: oben heller, ausgewaschener Schotter (liest sich als Terrasse)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (soil.get(x, y) === ' ') { const l = lv(x, y); if (l === 1) soil.set(x, y, 'u'); else if (l === 2) soil.set(x, y, 'v'); }
  // Hangwege: Geröllhang mit Höhenlinien
  for (const s of slopes) soil.ellipse(s.x, s.y, s.rx + 1, s.ry + 1, 'h');
  for (const [x, y, r] of [[58.2, 42.2, 2.6], [40.5, 36, 2.6], [57.6, 30.2, 2.4]]) soil.ellipse(x, y, r, r, 'h');
  // Geröll am Wandfuß: dicht direkt unter der Wand, locker weiter draußen (Kegel unter hohen Wänden)
  for (let y = 1; y < H - 1; y++) for (let x = 0; x < W; x++) {
    if (m.get(x, y) !== '#' || m.get(x, y + 1) === '#') continue;
    const k = K.get(y * W + x) ?? 2;
    const reach = 1 + (k >= 3 ? 1 : 0) + (sn(x, 41 + y, 3) > 0.6 ? 1 : 0);
    for (let j = 1; j <= reach + 1; j++) {
      const ch = j <= reach ? 'r' : 'p';
      if (',.'.includes(m.get(x, y + j)) || m.get(x, y + j) !== '#') { if (soil.get(x, y + j) !== 'h') soil.set(x, y + j, ch); }
    }
  }

  // ================================================================ Höhen für die gemalten Felsen (level.elev)
  // Felskacheln einer Stufenkante tragen die Höhe der oberen Stufe; freistehende Felsen und Felsmassen '9'
  // (bekommen eine hohe Wand), aus Felsmassen geschnittene Wege gelten als Mittelstufe.
  const elev = [];
  for (let y = 0; y < H; y++) {
    let row = '';
    for (let x = 0; x < W; x++) {
      const l = lv(x, y), c = m.get(x, y);
      if (c !== '#') { row += l === MASS ? '1' : String(l); continue; }
      if (l === MASS) { row += '9'; continue; }
      let edge = false;
      for (let j = -1; j <= 1 && !edge; j++) for (let i = -1; i <= 1; i++) { const v = lv(x + i, y + j); if (v !== MASS && v < l) { edge = true; break; } }
      row += edge ? String(l) : '9';
    }
    elev.push(row);
  }

  // ================================================================ Streudeko (sparsam, in Gruppen)
  const L0 = (x, y) => lv(x, y) === 0, L2 = (x, y) => lv(x, y) === 2;
  const inRift = (x, y) => ((x - 71) / 10) ** 2 + ((y - 46) / 7) ** 2 <= 1;
  const inCrater = (x, y) => ((x - CX) / 17) ** 2 + ((y - CY) / 11.5) ** 2 <= 1;
  const keep = (x, y) => inFort(x, y)
    || (x >= 56 && x <= 72 && y <= 11) || (x >= 112 && y >= 31 && y <= 38)
    || (x >= 54 && x <= 66 && y >= 78) || (x >= 118 && y >= 40 && y <= 48) || (x >= 18 && x <= 26 && y >= 26 && y <= 36)
    || ramps.some((r) => x >= r.x - 1 && x <= r.x + r.w && y >= r.y - 2 && y <= r.y + r.h + 1)
    || bridges.some((b) => x >= b.x - 1 && x <= b.x + b.len && y >= b.y - 1 && y <= b.y + 3)
    || (x >= 14 && x <= 23 && y >= 54 && y <= 64) || nearSpot(x, y) || onSlope(x, y, 1);
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

  return {
    name: 'Die Schlackenhöhen',
    kind: 'outdoor',
    biome: 'peaks',
    decorSet: 'decor_peaks',
    map: m.rows(),
    soil: soil.rows(),
    elev,
    paintedCliffs: true,
    decor: {
      t: 'deadTrees', k: 'basaltColumns', s: 'obsidianSpikes', r: 'lavaRocks', a: 'ashDrifts',
      T: 'tent', P: 'bannerPole',
      F: 'forge', c: 'crates', e: 'lavaVent', Z: 'forgeGate',
      m: 'mineEntrance', q: 'mineRails', o: 'mineCart', j: 'pitProps', K: 'slagHeap', R: 'rampSteps', Q: 'rampSteps4',
      B: 'lavaBridge', n: 'cairn', b: 'brazier', L: 'lookoutSpyglass',
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
