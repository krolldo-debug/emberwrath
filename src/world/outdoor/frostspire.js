import { createRng, hash2 } from '../../core/math.js';
import { MapBuilder } from '../levels.js';
import { rim } from '../levels2.js';
import { near, each, blob, roadNet, foe, strew } from '../mapkit.js';

// ---------------------------------------------------------------- Frostzinnen (31–36), Runde 6
// Ein Gebirge, kein Schneefeld; alle Wege führen durch Engstellen. Teilgebiete:
//   Marschsteig (S, Ankunft aus der Faulmarsch; erst ein Stück Weg durch die
//   Klamm) · Frosthold (Langhaus-Weiler im Talkessel unter dem Pass, Thingkreis
//   in der Mitte, Eisfall an der Nordwand) · Jägerwald mit Sigruns Jagdhütte (W)
//   · Eisgrotten (Höhlengänge im Westmassiv) · Serpentinenpass (Passstraße mit
//   Kehren am Hang, Zollwarte, Aussichtskanzel mit Leuchtfeuer) · Zinnensattel
//   (Passhöhe mit Felsnadeln und Eisteich) · Reiftor (NW) · Gletscherfeld (NO,
//   Spalten mit Schneebrücken, verlassenes Expeditionslager) · Trollhöhlen ·
//   Eisspiegelsee (Karsee) · Wühlerfelder (SO) · Glutabstieg (O, zur Glutöde).
//
// Runde 6 („von Hand gestaltet“):
// - Keine durchlaufenden Felsbänder mehr. Die Massive sind von Karen (Schneemulden, unbetretbar
//   umschlossen) durchsetzt; der Fels dazwischen bildet Grate in wechselnder Richtung und Dicke.
//   Die Ränder der Massive sind großräumig ausgebuchtet (Felsnasen, Buchten), einzelne Felsen
//   stehen frei auf den Schneefeldern.
// - Die Passstraße ist eine Gasse mit wechselnder Breite (Engstellen 2–3 Kacheln, Rastplätze an
//   den Kehren, Ausbuchtungen), unregelmäßigen Kanten und einer darin pendelnden Spur; am Rand Wehen.
// - Gipfel stehen in Gruppen auf den Karen (große und kleine Formen gemischt, nie in Reihen).
// - level.soil färbt den Boden (siehe GROUND_FROST in sprites/decor_frost.js): Neu-/Altschnee,
//   apere Erde, Nadelwaldboden, Gletschereis, Geröll, Wegwehen, Eis- und Höhlenboden.
//
// Zugefrorener See: begehbare Dekozeichen ohne Sprite ('I') bzw. mit Rissen
// ('J'); Zellen ohne Boden-Nachbarn bekommen level.baseFloor = '~' (Eis).
// Der See grenzt im Norden, Westen und Osten an Fels und ist nur nach Süden offen.

// Zeichen
//   Boden: ',' Schnee  '.' festgetretener Schnee/Weg  ':' Pflaster  '#' Fels
//   Punkte 1 start 2 respawn 3 from_blighted_marsh 4 from_rime_caverns 5 from_ember_wastes 6 waystone
//   Gebirge (fest): 'N' großer Gipfel  'G' kleiner Gipfel/Grat  'S' Felsnadel  ']' großer Eisfall  'm' Eisfall
//   See: 'I' Eis  'J' Eis mit Rissen  'O' Eisloch  'X' Fischerhütte  'Y' eingefrorenes Boot
//   Begehbare Bodendecals: 'l' Eisteich  'y' Spuren
//   Gletscher: Spaltenzeichen (siehe CREV)  'n' '$' '%' Schneebrücke (begehbar)
//   Höhlen: 'q' Eiszapfenvorhang (begehbar)  'p' Eissäule  'C' Trollhöhle  'E' Grottenmund  'u' Höhlenfeuer
//   Weiler: 'L' Langhaus  ')' Sodenhaus  '(' Runenstein  'K' Vorräte  'V' Schlitten  'a' Waffengestell  'U' Wachturm
//   Ruinen/Lager: 'Q' Zollwarte  '^' Mauerrest  '[' kalte Feuerstelle  'T' Zelt
//   Wald/Hütte: 'D' Jagdhütte  'r' Fellgestell  'W' Holzstapel  'g' Steinmann  '|' Wegstange  'x' tote Kiefer

// Glattes Wertrauschen 0..1 (Kartenformen)
function vn(x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed), c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
const smooth = (t) => t * t * (3 - 2 * t);

// Catmull-Rom durch Stützpunkte; jede Probe kennt ihr Segment (für Breitenprofile)
function spline(pts, step = 0.5) {
  const P = [pts[0], ...pts, pts[pts.length - 1]], out = [];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let s = 0; s < n; s++) {
      const t = s / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0[0], p1[0], p2[0], p3[0]), y: f(p0[1], p1[1], p2[1], p3[1]), seg: i - 1, t });
    }
  }
  const e = pts[pts.length - 1];
  out.push({ x: e[0], y: e[1], seg: pts.length - 1, t: 0 });
  return out;
}

// Schachbrett-Abstand jeder Zelle zur nächsten Quellzelle (zwei Durchläufe)
function distField(W, H, isSource) {
  const D = new Int16Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) D[y * W + x] = isSource(x, y) ? 0 : 999;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; let d = D[i];
    if (x > 0) d = Math.min(d, D[i - 1] + 1);
    if (y > 0) { d = Math.min(d, D[i - W] + 1); if (x > 0) d = Math.min(d, D[i - W - 1] + 1); if (x < W - 1) d = Math.min(d, D[i - W + 1] + 1); }
    D[i] = d;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x; let d = D[i];
    if (x < W - 1) d = Math.min(d, D[i + 1] + 1);
    if (y < H - 1) { d = Math.min(d, D[i + W] + 1); if (x < W - 1) d = Math.min(d, D[i + W + 1] + 1); if (x > 0) d = Math.min(d, D[i + W - 1] + 1); }
    D[i] = d;
  }
  return D;
}

export function buildFrostspire() {
  const W = 152, H = 104;
  const m = new MapBuilder(W, H, ',');
  const soil = new MapBuilder(W, H, ' ');
  const rng = createRng(3136);
  rim(m, rng, W, H);
  const net = roadNet(m);
  const road = (pts, w = 2.4) => net.road(pts, w, '.', [',', '#']);
  const put = (x, y, ch) => m.set(x, y, ch);
  const rock = (cx, cy, rx, ry, n = 3) => blob(m, rng, cx, cy, rx, ry, '#', [','], n);
  const clear = (cx, cy, rx, ry, n = 3) => blob(m, rng, cx, cy, rx, ry, ',', ['#'], n);
  const carve = (pts, w, ch = '.') => m.path(pts, w, ch, ['#', ',']);
  const curve = (pts, step = 0.5) => spline(pts, step).map((s) => [s.x, s.y]);
  const disc = (cx, cy, r, fn) => {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r && m.in(x, y)) fn(x, y);
    }
  };
  // Gasse mit wechselnder Breite: prof[i] = [Gassenbreite, Spurbreite] am Stützpunkt i (Kacheln).
  // Die Gasse wird aus dem Fels geschnitten (Schnee, Wehen am Rand), die Spur pendelt darin.
  const lane = (pts, prof, { seed = 1, track = '.', jag = 1.1 } = {}) => {
    const S = spline(pts, 0.25);
    let dist = 0;
    for (let k = 0; k < S.length; k++) {
      const s = S[k], a = S[Math.max(0, k - 3)], b = S[Math.min(S.length - 1, k + 3)];
      if (k) dist += Math.hypot(s.x - S[k - 1].x, s.y - S[k - 1].y);
      const l = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / l, ny = (b.x - a.x) / l;
      const p0 = prof[Math.min(prof.length - 1, s.seg)], p1 = prof[Math.min(prof.length - 1, s.seg + 1)], u = smooth(s.t);
      const cw = p0[0] + (p1[0] - p0[0]) * u, tw = p0[1] + (p1[1] - p0[1]) * u;
      const r = Math.max(1.05, cw / 2 + (vn(dist / 2.6, 0.5, seed) - 0.5) * jag * Math.min(1, cw / 3.5));
      disc(s.x, s.y, r, (x, y) => { if (m.get(x, y) === '#') { put(x, y, ','); soil.set(x, y, 'w'); } });
      if (!track) continue;
      const swing = (vn(dist / 5, 3.5, seed + 1) - 0.5) * Math.max(0, cw - tw - 0.6) * 0.8;
      const tx = s.x + nx * swing, ty = s.y + ny * swing;
      // Spur nur innerhalb der Gasse (bzw. auf offenem Schnee) – sie verbreitert die Engstellen nicht
      disc(tx, ty, Math.max(0.78, tw / 2), (x, y) => { if (m.get(x, y) === ',') put(x, y, track); });
      disc(s.x, s.y, 0.6, (x, y) => { if (m.get(x, y) === ',') put(x, y, track); });
      disc(tx, ty, tw / 2 + 0.9, (x, y) => net.mask.set(x, y, 'R'));
    }
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
  // Südrand: Felsnasen in den Wühlerfeldern und im Jägerwald
  rock(126, 101, 7, 2); rock(4, 66, 3, 5); rock(26, 100, 6, 2);

  // ------------------------------------------------ Frosthold: Talkessel unter dem Pass
  const bowl = { cx: 58, cy: 82, rx: 19, ry: 11 };
  clear(bowl.cx, bowl.cy, bowl.rx, bowl.ry, 5);
  m.ellipse(bowl.cx, bowl.cy, bowl.rx - 1, bowl.ry - 1, ',', ['#']);
  // Klamm im Südosten: der einzige Fahrweg in den Kessel
  const gorge = [[90, 103], [89, 98], [86, 93], [81, 90], [76, 87], [70, 85]];
  lane(gorge, [[6, 0], [5, 0], [3.6, 0], [5.2, 0], [4.4, 0], [5, 0]], { seed: 11, track: null });
  // Westpforte zum Jägerwald (schmaler Fußweg)
  lane([[41, 85], [36, 84], [31, 82], [24, 80]], [[4, 0], [2.6, 0], [3.4, 0], [4, 0]], { seed: 12, track: null });

  // ------------------------------------------------ Serpentinenpass: Passstraße mit Kehren
  // Eine aus dem Hang geschnittene Gasse. Die Kehren sind verschieden: A (W) ein weiter Rastplatz,
  // B (O) eng und steil, C (W) der Platz vor der Zollwarte, D (O) mit dem Stichweg zur Kanzel.
  // Dazwischen Engstellen (2–3 Kacheln) und Ausbuchtungen.
  const passPts = [
    [60, 72], [59, 67], [56, 63.5], [51, 62], [46, 60.5],                 // 0–4  Kesselhals, erster Schenkel
    [41.5, 57.5], [42.5, 53.5], [47, 52], [53, 52.5], [59, 51],            // 5–9  Kehre A (Rastplatz)
    [64, 49], [70, 48.5], [76, 47.5], [80.5, 45.5],                        // 10–13 zweiter Schenkel, Engstelle
    [81.5, 42.5], [78.5, 40.5], [73, 40.2], [67, 38.4], [61, 38.6], [55, 37],   // 14–19 Kehre B (eng), dritter Schenkel
    [50.5, 35], [48.5, 31.5], [52, 29.2], [58, 28.8], [64, 27.4], [70, 26.2],    // 20–25 Kehre C (Zollwarte), vierter Schenkel
    [74.5, 23.6], [74.6, 20.2], [71, 17.8], [66.5, 15.4], [64, 11],        // 26–30 Kehre D, Felstor, Sattel
  ];
  const passProf = [
    [5, 2.6], [3, 2], [2.2, 1.6], [4.6, 2.2], [6, 2.4],
    [8.5, 2.8], [8, 2.6], [5.4, 2.4], [4, 2.2], [5.6, 2.2],
    [3, 2], [2.2, 1.6], [4.4, 2.2], [5.2, 2.4],
    [4.4, 2.4], [3.8, 2.2], [2.6, 1.8], [5, 2.2], [7, 2.4], [4.2, 2.2],
    [7.5, 3], [7, 2.8], [5, 2.4], [2.6, 1.8], [2.2, 1.6], [4.6, 2.2],
    [6.4, 2.6], [4.4, 2.2], [3, 1.8], [2, 1.6], [5, 2.4],
  ];
  lane(passPts, passProf, { seed: 21 });
  // Aussichtskanzel mit Leuchtfeuer (Stichweg von Kehre D)
  lane([[74.5, 23.6], [78, 26.4], [81, 27]], [[3.4, 1.6], [2.4, 1.4], [3, 1.6]], { seed: 22 });
  m.ellipse(82, 27, 3.2, 2.4, ',', ['#']);
  // Alte Abkürzung: steiler Fußpfad zwischen dem zweiten und dritten Schenkel (Ruinenrast)
  lane([[66, 49.5], [67.5, 45.5], [69, 41.5], [69, 39]], [[2.4, 0], [2.2, 0], [2.6, 0], [2.4, 0]], { seed: 23, track: null });

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

  // ------------------------------------------------ Gletscherfeld: Grate, die das Eis teilen
  // Drei Felsgrate ragen aus dem Eis (Nunatakker): einer von der Nordkante nach Süden, einer von
  // der Ostkante schräg nach Südwesten, einer vom Trollmassiv nach Norden. Dazwischen fließt das Eis.
  const ridge = (pts, w0, w1, seed) => {
    const S = spline(pts, 0.25), n = S.length;
    S.forEach((s, k) => {
      const u = k / Math.max(1, n - 1);
      const r = Math.max(0.7, w0 + (w1 - w0) * u + (vn(k / 9, 0.5, seed) - 0.5) * 1.1);
      disc(s.x, s.y, r, (x, y) => { if (m.get(x, y) === ',') put(x, y, '#'); });
    });
  };
  ridge([[107, 0], [108, 5], [111, 10], [112.5, 14.5]], 3, 1.1, 3401);
  ridge([[152, 12], [147, 15.5], [142.5, 17.5], [139.5, 18.5]], 2.8, 1, 3402);
  ridge([[124, 38], [124.5, 33], [123, 28.5]], 2.6, 1, 3403);

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

  // ------------------------------------------------ Ränder der Massive: großräumig ausgebuchtet
  // Wo offener Schnee an Fels grenzt (fern von Wegen, Bauten und Punkten), wächst der Fels in
  // Nasen vor oder weicht in Buchten zurück – Kanten laufen nicht mehr gerade. Buchten nur in
  // dickem Fels (keine Durchbrüche).
  const beacons = [[82, 26], [132, 12], [116, 93]];
  const tunnels = [[108, 98], [123, 95], [137, 99]];
  const pois = [...beacons, ...tunnels, defendAt, ...defendSpawns, [lodge.x, lodge.y], [waystone.x, waystone.y], [47, 33], [53, 36], [58, 4], [122, 3], [92, 84], [8, 93],
    [98, 24], [102, 25], [138, 33], [134, 34], [130, 89], [100, 101], [141, 72], [52, 6], [79, 5], [74, 11], [120, 24], [143, 21], [114, 13], [97, 4], [140, 4]];
  {
    const prot = new Uint8Array(W * H);
    const mark = (cx, cy, r) => { for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if (m.in(x, y)) prot[y * W + x] = 1; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = m.get(x, y); if (c !== ',' && c !== '#') mark(x, y, 2); }
    for (const [x, y] of pois) mark(x, y, 3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inLake(x, y) || ((x - bowl.cx) / (bowl.rx + 1)) ** 2 + ((y - bowl.cy) / (bowl.ry + 1)) ** 2 <= 1) prot[y * W + x] = 1;
    const dRock = distField(W, H, (x, y) => m.get(x, y) === '#');
    const dOpen = distField(W, H, (x, y) => m.get(x, y) !== '#');
    const runH = new Int16Array(W * H), runV = new Int16Array(W * H);
    for (let y = 0; y < H; y++) { let x = 0; while (x < W) { if (m.get(x, y) !== '#') { x++; continue; } let e = x; while (e < W && m.get(e, y) === '#') e++; for (let i = x; i < e; i++) runH[y * W + i] = e - x; x = e; } }
    for (let x = 0; x < W; x++) { let y = 0; while (y < H) { if (m.get(x, y) !== '#') { y++; continue; } let e = y; while (e < H && m.get(x, e) === '#') e++; for (let i = y; i < e; i++) runV[i * W + x] = e - y; y = e; } }
    const set = [];
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
      const i = y * W + x;
      if (prot[i]) continue;
      const c = m.get(x, y);
      // Kartenrand: im Norden und Süden dicker und welliger
      const edge = Math.max(0, 7 - Math.min(y, H - 1 - y, x, W - 1 - x)) / 7;
      const f = vn(x / 12, y / 9, 3171) * 0.8 + vn(x / 5.5, y / 5, 3172) * 0.2 + edge * 0.16;
      if (c === ',') {
        const k = Math.floor((f - 0.54) * 10);
        if (k >= 1 && dRock[i] <= k) set.push([x, y, '#']);
      } else if (c === '#') {
        const k = Math.floor((0.44 - f) * 10);
        if (k >= 1 && dOpen[i] <= k && Math.min(runH[i], runV[i]) >= 2 * k + 5) set.push([x, y, ',']);
      }
    }
    for (const [x, y, ch] of set) put(x, y, ch);
  }
  // Glätten: Kerben im Fels füllen, Felszacken und kleine Felsinseln abtragen – große, ruhige
  // Formen statt vieler kurzer Felsstriche (nur fern von Wegen, Bauten und Punkten).
  {
    const prot = new Uint8Array(W * H);
    const mark = (cx, cy, r) => { for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if (m.in(x, y)) prot[y * W + x] = 1; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = m.get(x, y);
      if ((c !== ',' && c !== '#') || soil.get(x, y) === 'w') mark(x, y, 1);
    }
    for (const [x, y] of pois) mark(x, y, 3);
    for (let it = 0; it < 2; it++) {
      const set = [];
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        if (prot[y * W + x]) continue;
        let n = 0;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if ((i || j) && m.get(x + i, y + j) === '#') n++;
        const c = m.get(x, y);
        if (c === ',' && n >= 6) set.push([x, y, '#']);
        else if (c === '#' && n <= 2) set.push([x, y, ',']);
      }
      for (const [x, y, ch] of set) put(x, y, ch);
    }
    // kleine Felsinseln (nicht am Kartenrand) verschwinden
    const seen = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (seen[y * W + x] || m.get(x, y) !== '#') continue;
      const comp = [[x, y]]; seen[y * W + x] = 1;
      let edge = false;
      for (let k = 0; k < comp.length; k++) {
        const [cx, cy] = comp[k];
        if (cx === 0 || cy === 0 || cx === W - 1 || cy === H - 1) edge = true;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (m.in(nx, ny) && !seen[ny * W + nx] && m.get(nx, ny) === '#') { seen[ny * W + nx] = 1; comp.push([nx, ny]); }
        }
      }
      if (!edge && comp.length < 24) for (const [cx, cy] of comp) put(cx, cy, ',');
    }
  }

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
  // Pass: Zollwarte an Kehre C, Mauerreste, Eisfälle an den Hangwänden
  put(47, 33, 'Q'); put(53, 36, '^');
  each([[71, 52], [57, 40], [46, 64]], (x, y) => {
    for (let dy = 0; dy <= 3; dy++) if (m.get(x, y + dy) !== '#' && m.get(x, y + dy - 1) === '#' && m.get(x, y + dy) !== '.') { put(x, y + dy, 'm'); break; }
  });
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
  // Pass: Rastplätze an den Kehren (Steinmann, Feuerstelle, Vorräte), Spuren auf der Straße
  put(40, 55, 'g'); put(44, 51, '['); put(43, 50, 'K');
  put(50, 30, 'g'); put(84, 41, 'g');
  each([[56, 52], [62, 38], [69, 27]], (x, y) => { if (m.get(x, y) === '.') put(x, y, 'y'); });

  // ------------------------------------------------ Gegner
  const F = (list, ch) => each(list, (x, y) => foe(m, x, y, ch));
  // Jägerwald: Wölfe, ein Pirscher
  F([[8, 90], [12, 95], [24, 93], [6, 62], [24, 64]], 'j'); F([[22, 97]], 's');
  // Eisgrotten
  F([[20, 45], [24, 32], [10, 25]], 'e'); F([[32, 53], [15, 34]], 'h'); F([[11, 49], [31, 41]], 's');
  // Reiftor
  F([[16, 13], [36, 12], [40, 7]], 'e'); F([[12, 6]], 'h');
  // Serpentinenpass: Wölfe an den Kehren, Pirscher, Trolle
  F([[44, 56], [80, 44]], 'j'); F([[66, 49], [65, 39]], 's'); F([[51, 33], [74, 22]], 'i'); F([[56, 52]], 'j');
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
  F([[104, 96], [110, 101], [112, 95]], 'b'); F([[120, 99], [127, 93], [126, 99]], 'b'); F([[134, 95], [141, 97], [139, 92]], 'b');
  F([[118, 90], [98, 84]], 'j');
  F([[78, 30], [84, 23]], 'e'); F([[117, 97]], 's');

  // ------------------------------------------------ Gletscherspalten: Fächer quer zur Fließrichtung
  // Das Eis fließt von der Nordkante talwärts (zwischen den Graten nach Süden und Südwesten). Die
  // Spalten stehen quer dazu in Fächern, talwärts gewölbt, verschieden lang und breit; längere haben
  // eine Schneebrücke. Gezeichnet werden sie vom Boden (level.crevasses, siehe frostPixel); die
  // Zellen darunter sind fest ('"'), Brückenzellen bleiben begehbar.
  const crevasses = [];
  {
    const open = (x, y) => {
      if (m.get(x, y) !== ',' || net.onRoad(x, y)) return false;
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) { const c = m.get(x + i, y + j); if (c !== ',' && c !== '#' && c !== '"') return false; }
      return true;
    };
    // Fächer: Mittelpunkt, Fließrichtung (Grad, 90 = Süden), Radien, halbe Spannweiten (rad), Breite
    const fans = [
      [97, 1, 104, [5, 7.5, 10.5, 13.5], [0.8, 0.62, 0.7, 0.5], 7.5, 3501],
      [119, 2, 92, [5.5, 8.5, 12, 15.5, 19.5], [0.75, 0.55, 0.62, 0.45, 0.4], 8, 3502],
      [140, 20, 118, [3.5, 6.5, 9.5], [0.9, 0.7, 0.6], 6.5, 3503],
      [134, 4, 72, [3.5, 6], [0.8, 0.8], 5, 3504],
      [105, 20, 128, [4, 7], [0.8, 0.6], 6, 3505],
    ];
    for (const [cx, cy, deg, radii, spans, wmax, seed] of fans) {
      radii.forEach((R0, ri) => {
        const span = spans[ri], phi = deg * Math.PI / 180;
        const pts = [];
        for (let th = -span; th <= span + 1e-6; th += 0.4 / R0) {
          const u = (th + span) / (2 * span);
          const R = R0 + (vn(th * 3 + ri * 7, 0.5, seed) - 0.5) * 1.2;
          const w = wmax * (0.75 + 0.5 * hash2(ri, seed, 3510)) * Math.pow(Math.sin(Math.PI * u), 0.7) * (0.75 + 0.5 * vn(th * 5, ri, seed + 1));
          pts.push({ x: cx + Math.cos(phi + th) * R, y: cy + Math.sin(phi + th) * R * 0.8, w: +w.toFixed(2) });
        }
        // Länge in Kacheln; ab 9 eine Schneebrücke
        let len = 0; for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
        const bridge = len >= 9 ? 0.3 + hash2(ri, seed, 3511) * 0.4 : -1;
        const bridgeCells = new Set(), cells = new Set();
        let acc = 0;
        for (let k = 0; k < pts.length; k++) {
          if (k) acc += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
          const p = pts[k], r = (p.w + 1.5) / 16;
          const onBridge = bridge >= 0 && Math.abs(acc / len - bridge) * len < 0.9;
          for (let y = Math.floor(p.y - r); y <= Math.floor(p.y + r); y++) for (let x = Math.floor(p.x - r); x <= Math.floor(p.x + r); x++) {
            const nx = Math.max(x, Math.min(p.x, x + 1)), ny = Math.max(y, Math.min(p.y, y + 1));
            if ((nx - p.x) ** 2 + (ny - p.y) ** 2 > r * r) continue;
            (onBridge ? bridgeCells : cells).add(y * W + x);
          }
        }
        for (const k of cells) if (!bridgeCells.has(k) && open(k % W, Math.floor(k / W))) put(k % W, Math.floor(k / W), '"');
        crevasses.push(pts);
      });
    }
  }

  // ------------------------------------------------ Unerreichbarer Boden wird Fels
  // (Taschen hinter Felsnasen oder Spalten: dort sollen weder Tiere noch Ausweichpunkte landen)
  {
    const SOLIDS = new Set(['#', '~', '=', 'H', 'f', '"', ...'wvUOXYz/7>890!?&*+<-;@pDrWgmxuKVa_NGSQ^|()[]L']);
    const seen = new Uint8Array(W * H);
    let sx = 0, sy = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m.get(x, y) === '1') { sx = x; sy = y; }
    const q = [[sx, sy]]; seen[sy * W + sx] = 1;
    for (let k = 0; k < q.length; k++) {
      const [x, y] = q[k];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!m.in(nx, ny) || seen[ny * W + nx] || SOLIDS.has(m.get(nx, ny))) continue;
        seen[ny * W + nx] = 1; q.push([nx, ny]);
      }
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!seen[y * W + x] && ',.:'.includes(m.get(x, y))) put(x, y, '#');
  }

  // ------------------------------------------------ Bodenarten (level.soil, nur Färbung)
  const forest = (x, y) => x < 34 && y > 56;
  const glacier = (x, y) => x > 88 && y < 37;
  const pineSlope = (x, y) => x >= 78 && x <= 100 && y >= 80 && y <= 97;
  {
    const S = (x, y, ch, only = null) => { if (!only || only.includes(soil.get(x, y))) soil.set(x, y, ch); };
    const paint = (cx, cy, rx, ry, ch, n = 3, only = null) => blob(soil, rng, cx, cy, rx, ry, ch, only, n);
    // Jägerwald und Kiefernhang: Nadelboden mit Schneeflecken; an der Hütte festgetretene Erde
    for (let y = 56; y < H; y++) for (let x = 0; x < 35; x++) if (forest(x, y) && vn(x / 6, y / 6, 3190) < 0.8) S(x, y, 'f', [' ']);
    paint(89, 88, 10, 7, 'f', 4, [' ']);
    paint(15, 79, 6, 3.4, 'e', 2);
    // Frosthold: verharschter Altschnee, apere Stellen vor den Häusern und am Thingplatz
    paint(bowl.cx, bowl.cy, bowl.rx - 2, bowl.ry - 2, 'a', 4, [' ']);
    for (const [x, y, rx, ry] of [[58, 78, 6, 2.4], [46, 82, 4, 2], [70, 82, 4, 2], [58, 87, 6, 2.2], [47, 89, 3, 2], [68, 89, 3, 2], [64, 85, 3, 1.6], [73, 88, 3, 1.6]]) paint(x, y, rx, ry, 'e', 2);
    // Klamm: unten warme, aperen Hänge (zur Faulmarsch), Geröll an den Wänden
    soil.path(curve([[90, 103], [89, 98], [86, 93], [82, 91]], 0.5), 8, 'e');
    paint(80, 92, 4, 3, 'e', 2);
    // Glutabstieg: je weiter nach Osten, desto aperer
    for (const [x, y, rx, ry] of [[146, 92, 5, 4], [141, 97, 4, 2.4], [147, 80, 3, 4], [142, 71, 3, 2.4], [145, 64, 2.4, 2]]) paint(x, y, rx, ry, 'e', 3);
    // Wühlerfelder: aufgewühlte Erde um die Baue
    for (const [x, y] of tunnels) paint(x, y, 4.5, 2.6, 'e', 3);
    for (const [x, y] of [[104, 99], [113, 97], [118, 93], [129, 97], [133, 92], [140, 100]]) paint(x, y, 2.2, 1.4, 'e', 2);
    // Gletscher: Neuschnee, dazwischen Bänder aus blankem Gletschereis
    for (let y = 2; y < 37; y++) for (let x = 88; x < W; x++) if (glacier(x, y)) S(x, y, 'n', [' ']);
    // Eisströme: breite Bänder blanken Gletschereises in Fließrichtung zwischen den Graten
    for (const [pts, w0, seed] of [
      [[[93, 2], [97, 9], [96, 17], [93, 26], [90, 34]], 3.4, 3711],
      [[[117, 2], [119, 9], [118, 18], [120, 27], [118, 35]], 4, 3712],
      [[[128, 2], [131, 10], [134, 19], [139, 27], [143, 34]], 3, 3713],
      [[[101, 20], [107, 27], [112, 33]], 2.4, 3714],
    ]) {
      const SP = spline(pts, 0.25);
      SP.forEach((p, k) => disc(p.x, p.y, Math.max(1.2, w0 + (vn(k / 10, 0.5, seed) - 0.5) * 3), (x, y) => {
        if (glacier(x, y) && ' n'.includes(soil.get(x, y))) soil.set(x, y, 'g');
      }));
    }
    // Sattel und Reiftor: frischer Schnee, Eis vor dem Tor
    paint(66, 8, 22, 5, 'n', 4, [' ']); paint(26, 9, 12, 5, 'n', 3, [' ']); paint(44, 9, 7, 3, 'n', 2, [' ']);
    paint(26, 7, 5, 2, 'g', 2); paint(58, 5, 4, 1.6, 'g', 2);
    // windgefegte, apere Stellen am Sattel und auf dem Reiftor-Plateau (Erde, Halme, Steine)
    for (const [x, y, rx, ry] of [[48, 7, 3, 1.6], [63, 10.5, 3, 1.4], [76, 6, 3.4, 1.6], [85, 11, 2.2, 1.4], [35, 4, 2.6, 1.4], [8, 8, 3, 2], [17, 11, 2.6, 1.4], [70, 4, 2, 1.2]]) paint(x, y, rx, ry, 'e', 3);
    // Pass: apere, sonnige Flecken an den Rastplätzen
    paint(42, 54, 3.4, 2.4, 'e', 2); paint(50, 32, 3, 2, 'e', 2); paint(75, 22, 2, 1.6, 'e', 1); paint(82, 27, 2.6, 1.8, 'e', 2);
    // Seeufer: Altschnee
    paint(110, 81, 22, 2.6, 'a', 3, [' ']);
    // Höhlen: Eisboden in den Grotten, dunkler Fels in den Trollhöhlen
    for (let y = 15; y < 63; y++) for (let x = 2; x < 38; x++) if (m.get(x, y) !== ',' || y > 18) if (!forest(x, y)) S(x, y, 'i', [' ', 'n']);
    for (let y = 37; y < 64; y++) for (let x = 88; x < 150; x++) if (m.get(x, y) !== ',' && !inLake(x, y)) S(x, y, 't', [' ']);
    // Geröll am Fuß der Felswände (unter den Wänden, fleckig)
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (m.get(x, y) !== ',' || net.onRoad(x, y)) continue;
      const wall = m.get(x, y - 1) === '#' || (m.get(x, y - 2) === '#' && vn(x / 4, y / 4, 3191) > 0.45);
      if (wall && vn(x / 5, y / 5, 3192) > 0.42 && ' anw'.includes(soil.get(x, y))) S(x, y, 's');
    }
  }

  // ------------------------------------------------ Bewuchs
  const keepPts = [...beacons, ...tunnels, [waystone.x, waystone.y], [waystone.x + 1, waystone.y], defendAt, ...defendSpawns, [lodge.x, lodge.y], [58, 4], [122, 3], [92, 84], [8, 93]];
  const hold2 = [(x, y) => ((x - bowl.cx) / (bowl.rx + 1)) ** 2 + ((y - bowl.cy) / (bowl.ry + 1)) ** 2 <= 1,
    (x, y) => x >= 84 && x <= 95 && y >= 94, (x, y) => x >= 143 && y >= 82 && y <= 90,
    (x, y) => x >= 16 && x <= 36 && y <= 13, (x, y) => inLake(x, y) || (y >= 78 && y <= 83 && x >= 88 && x <= 132),
    (x, y) => keepPts.some(([sx, sy]) => Math.abs(x - sx) <= 3 && Math.abs(y - sy) <= 2),
    (x, y) => x >= 7 && x <= 23 && y >= 74 && y <= 84, (x, y) => x >= 94 && x <= 104 && y >= 22 && y <= 29];
  const keep = (x, y) => hold2.some((f) => f(x, y));
  // Baumgruppen (Krummholz und Fichteninseln) auch oben und in der Mitte: dunkler Nadelboden, dichte Bäume
  const grove = (x, y) => !glacier(x, y) && !inLake(x, y) && !forest(x, y) && !pineSlope(x, y) && vn(x / 6.5, y / 5.5, 3305) > 0.75 && soil.get(x, y) !== 'w';
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (m.get(x, y) === ',' && grove(x, y) && !keep(x, y) && ' nas'.includes(soil.get(x, y))) soil.set(x, y, 'f');
  let crystals = 0;
  strew(m, net, rng, keep, (x, y, g, free) => {
    if (g !== ',') return null;
    const so = soil.get(x, y);
    if (forest(x, y) || pineSlope(x, y)) {
      // Baumgruppen und Lichtungen statt Gleichverteilung
      const dens = vn(x / 5.5, y / 5, 3301);
      if (free && rng.chance(dens > 0.52 ? 0.55 : dens > 0.36 ? 0.18 : 0.03)) return 't';
      if (free && rng.chance(0.015)) return 'x';
      if (rng.chance(0.02)) return 'd';
      return null;
    }
    if (glacier(x, y)) {
      if (free && crystals < 15 && so === 'g' && rng.chance(0.07)) { crystals++; return 'c'; }
      if (rng.chance(0.025)) return 'd';
      if (free && rng.chance(0.008)) return 'k';
      return null;
    }
    const nearRock = near(m, x, y, '#', 1);
    if (so === 'f' && grove(x, y)) return free && rng.chance(vn(x / 6.5, y / 5.5, 3305) > 0.8 ? 0.5 : 0.25) ? 't' : null;
    if (so === 'w') return nearRock && rng.chance(0.12) ? 'd' : null;          // Wehen an der Gassenwand
    if (so === 's') return free && rng.chance(0.05) ? 'k' : rng.chance(0.03) ? 'd' : null;
    if (free && rng.chance(nearRock ? 0.012 : 0.003)) return 't';
    if (free && rng.chance(0.004)) return 'x';
    if (rng.chance(nearRock ? 0.04 : 0.012)) return 'd';
    if (free && rng.chance(0.005)) return 'k';
    if (free && crystals < 15 && rng.chance(0.004)) { crystals++; return 'c'; }
    return null;
  });
  // Steinmänner an den Kehren, Wegstangen entlang der Passstraße und der Klamm
  each([[38, 58], [84, 45], [47, 36], [78, 21], [21, 14], [45, 11], [88, 95]], (x, y) => { if (m.get(x, y) === ',' || m.get(x, y) === '.') put(x, y, 'g'); });
  // Wegstangen am Rand der Passstraße und der Klamm: etwa alle 7 Kacheln, abwechselnd links und
  // rechts, auf festem Schnee neben der Spur (nie in der Spur, nie auf Engstellen)
  {
    const S = [...spline(passPts, 0.5), ...spline(gorge, 0.5)];
    let acc = 0, side = 1;
    for (let k = 1; k < S.length - 1; k++) {
      acc += Math.hypot(S[k].x - S[k - 1].x, S[k].y - S[k - 1].y);
      if (acc < 7) continue;
      const a = S[Math.max(0, k - 2)], b = S[Math.min(S.length - 1, k + 2)];
      const l = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / l, ny = (b.x - a.x) / l;
      for (let d = 1.5; d <= 4; d += 0.5) {
        const x = Math.round(S[k].x + nx * d * side), y = Math.round(S[k].y + ny * d * side);
        if (m.get(x, y) !== ',' || net.onRoad(x, y) || m.get(x, y + 1) === '#') continue;
        let open = 0;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (!'#|'.includes(m.get(x + i, y + j))) open++;
        if (open < 6) continue;
        put(x, y, '|'); acc = 0; side = -side; break;
      }
    }
  }
  each([[98, 91], [112, 89], [128, 88], [32, 84], [26, 82]], (x, y) => {
    for (const [dx, dy] of [[0, -2], [0, 2], [0, -1], [0, 1], [-1, -2], [1, 2]]) {
      const c = m.get(x + dx, y + dy);
      if ((c === ',' || c === '.') && m.get(x + dx, y + dy + 1) !== '#' && !net.onRoad(x + dx, y + dy)) { put(x + dx, y + dy, '|'); break; }
    }
  });

  // See: Löcher, Hütten, Risse, dann alles übrige Seeeis begehbar ohne Sprite
  each([[98, 70], [116, 66], [124, 72], [106, 74], [114, 77]], (x, y) => { if (m.get(x, y) === ',') put(x, y, 'O'); });
  each([[102, 72], [119, 70]], (x, y) => { if (m.get(x, y) === ',') put(x, y, 'X'); });
  if (m.get(108, 63) === ',') put(108, 63, 'Y');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inLake(x, y) || m.get(x, y) !== ',') continue;
    put(x, y, rng.chance(0.1) ? 'J' : 'I');
  }

  // ------------------------------------------------ Gipfelketten auf den Massiven
  // Die Gipfel stehen auf dem Fels (level.rockDecor: der Boden darunter bleibt Hochfläche) entlang
  // von Kammlinien in wechselnder Richtung – Nord-Süd-Grate, schräge Rücken, kurze Querkämme. Große
  // und kleine Formen wechseln unregelmäßig; nichts davon verdeckt begehbaren Boden.
  let spines = [];
  {
    const walk = (x, y) => { const c = m.get(x, y); return c !== undefined && c !== '#' && !'NGS'.includes(c); };
    const BIG = [92, 76, 112, 84, 98, 104], SMALL = [50, 58, 66, 44, 74];
    const fits = (x, y, big) => {
      if (m.get(x, y) !== '#') return false;
      const wpx = big ? BIG[Math.floor(hash2(x, y, 11) * 6)] : SMALL[Math.floor(hash2(x, y, 11) * 5)];
      const r = Math.ceil((wpx / 2 - 6) / 16), up = Math.ceil(((big ? 100 : 58) - 6) / 16);
      // Fuß: unter dem Gipfel noch eine Felsreihe (sonst steht er auf der Wandkante)
      for (let dx = -1; dx <= 1; dx++) if (walk(x + dx, y + 1)) return false;
      for (let dy = -up; dy <= 0; dy++) { const rr = Math.round(r * Math.min(1, 1 + (dy + 1) / up) + 0.2); for (let dx = -rr; dx <= rr; dx++) if (walk(x + dx, y + dy)) return false; }
      return true;
    };
    const placed = [];
    const free = (x, y, dx, dy) => !placed.some(([px, py]) => Math.abs(px - x) < dx && Math.abs(py - y) < dy);
    spines = [
      // Westmassiv: Nord-Süd-Grat am Kartenrand, schräger Rücken über den Grotten
      [[4, 18], [5, 27], [3.5, 36], [5, 46], [4, 54]],
      [[22, 17], [28, 23], [33, 29], [35, 36]],
      [[18, 38], [24, 40], [28, 38]],
      // Passberg: Zinnenkamm über dem Felstor, Ostgrat (Nord-Süd), Rücken zwischen den Schenkeln
      [[38, 21], [45, 18], [52, 20], [58, 17.5]],
      [[77, 19], [83, 15.5], [89, 18]],
      [[87.5, 23], [88, 31], [86.5, 39], [88, 46]],
      [[57, 35], [66, 32], [74, 33.5], [80, 31]],
      [[39, 47], [38.5, 40], [41, 30]],
      [[47, 67], [53, 69], [44, 64]],
      // Ostsporn zwischen Kessel und See (schräg), Trollmassiv (Nord- und Südkamm), Ostrand
      [[80, 55], [84, 61], [88, 68], [87, 75]],
      [[90, 41], [99, 40.5], [108, 42], [116, 40]],
      [[91, 58], [100, 59.5], [112, 57], [124, 58.5], [134, 57]],
      [[148, 38], [149, 46], [147.5, 56]],
      // Grate im Gletscher
      [[108, 2], [110, 8], [112, 12.5]],
      [[150, 13], [145, 16], [141, 18]],
      [[124, 36], [124, 31]],
      // Rücken zwischen Jägerwald und Kessel (Nord-Süd), Südrand, Fels an den Wühlerfeldern
      [[35, 66], [36, 74], [35, 90], [36.5, 98]],
      [[42, 99], [52, 100], [62, 99], [74, 100], [84, 99]],
      [[103, 93], [103.5, 100]],
      [[2, 64], [2, 76], [2.5, 88], [2, 98]],
      // unterer Passberg: schräger Rücken zum Ostsporn
      [[61, 64], [69, 59], [77, 53]],
    ];
    // Abstände entlang des Kamms unregelmäßig (2,8–6,4 Kacheln), seitlich versetzt; ab und zu ein
    // kleiner Vorgipfel schräg davor. Große Formen nur, wo der Fels breit genug ist.
    const tryAt = (cx, cy, big) => {
      const cand = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) cand.push([Math.round(cx) + dx, Math.round(cy) + dy, Math.abs(dx) + Math.abs(dy) * 1.3]);
      cand.sort((p, q) => p[2] - q[2]);
      for (const [x, y] of cand) {
        if (big ? !(free(x, y, 4, 3) && fits(x, y, true)) : !(free(x, y, 3, 2) && fits(x, y, false))) continue;
        put(x, y, big ? 'N' : 'G'); placed.push([x, y]); return [x, y];
      }
      return null;
    };
    // Gruppen statt Reihen: alle 5–10 Kacheln ein Leitgipfel (groß, wenn Platz), dazu ein bis zwei
    // kleinere Vorgipfel seitlich davor; dazwischen bleibt der Grat frei.
    spines.forEach((pts, si) => {
      const S = spline(pts, 0.25);
      let acc = 99, gap = hash2(si, 1, 3600) * 4, k0 = 0;
      for (let k = 0; k < S.length; k++) {
        if (k) acc += Math.hypot(S[k].x - S[k - 1].x, S[k].y - S[k - 1].y);
        if (acc < gap) continue;
        const h = (j) => hash2(si * 1000 + k0, j, 3601);
        k0++;
        const a = S[Math.max(0, k - 2)], b = S[Math.min(S.length - 1, k + 2)];
        const l = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / l, ny = (b.x - a.x) / l;
        const off = (h(1) - 0.5) * 3.4;
        const at = tryAt(S[k].x + nx * off, S[k].y + ny * off, h(2) < 0.7) ?? tryAt(S[k].x, S[k].y, false);
        if (!at) continue;
        const side = h(4) < 0.5 ? -1 : 1;
        if (h(3) < 0.75) tryAt(at[0] + side * (2 + h(6) * 1.5), at[1] + 1 + h(7), false);
        if (h(3) < 0.3) tryAt(at[0] - side * (2.5 + h(8) * 1.5), at[1] + h(9) * 1.5, h(10) < 0.3);
        acc = 0; gap = 5.5 + h(5) * 5;
      }
    });
  }

  // Hochflächen (level.soil auf Felszellen; der Renderer färbt damit die Plateaus, siehe
  // GROUND_FROST.capPixel): Hängegletscher am Gletscherfeld, apere warme Felsflecken über den
  // Südwänden, Nadelwald auf den unteren Hängen, sonst großflächig Neu- und Altschnee.
  {
    const dOpen = distField(W, H, (x, y) => m.get(x, y) !== '#' && !'NGS'.includes(m.get(x, y)));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (m.get(x, y) !== '#' && !'NG'.includes(m.get(x, y))) continue;
      // Abstand zur nächsten Südwand (offener Boden unterhalb)
      let south = 99;
      for (let j = 1; j <= 4; j++) { const c = m.get(x, y + j); if (c !== undefined && c !== '#' && !'NGS'.includes(c)) { south = j; break; } }
      const mid = vn(x / 6, y / 5, 3702);
      let ch = ' ';
      const warm = 0.6 - Math.min(0.1, x / W * 0.1) - (y > 50 ? 0.04 : 0);
      if (south <= 3 && mid > warm) ch = 'e';
      const forestBelt = (y > 52 && vn(x / 9, y / 7, 3703) > 0.54) || (y > 12 && y <= 52 && vn(x / 8, y / 6, 3704) > 0.68);
      if (forestBelt && dOpen[y * W + x] >= 1 && !(x > 84 && y < 40)) ch = 'f';
      if (x >= 84 && y < 42 && vn(x / 7, y / 5, 3252) > 0.47) ch = 'g';
      soil.set(x, y, ch);
    }
    // Grate: blanker, warmgrauer Fels entlang der Kammlinien (macht ihre Richtung auf der Karte lesbar)
    spines.forEach((pts, si) => spline(pts, 0.25).forEach((p, k) => {
      const r = 1.3 + vn(k / 7, si, 3720) * 1.6;
      disc(p.x, p.y, r, (x, y) => { if ((m.get(x, y) === '#' || 'NG'.includes(m.get(x, y))) && soil.get(x, y) !== 'g') soil.set(x, y, 'r'); });
    }));
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
    soil: soil.rows(),
    solid: 'wvUOXYz/7>890!?&*+<-;@pDrWgmxuKVa_NGSQ^|()[]L"',
    // Gipfel stehen auf dem Fels: Boden darunter = Hochfläche (VORSCHLAG_Outdoor.diff)
    rockDecor: 'NG',
    // Gletscherspalten als Polylinien (Kacheln; w = halbe Breite in px), gezeichnet von frostPixel
    crevasses,
    decor: {
      t: 'snowPines', k: 'frozenRocks', c: 'iceCrystals', d: 'snowDrifts', L: 'longhouse',
      U: 'fortTower', T: 'tent', P: 'bannerPole', F: 'campfireBig',
      R: 'rimeGate', o: 'trollBones',
      I: null, J: 'iceCracks', O: 'iceHole', X: 'fishHut', Y: 'frozenBoat',
      q: 'icicleCurtain', p: 'icePillar', C: 'trollCave', E: 'grottoMouth', u: 'caveFire',
      K: 'supplies', V: 'sled', a: 'weaponRack',
      D: 'huntLodge', r: 'peltRack', W: 'woodPile', g: 'cairn', m: 'iceFall', x: 'deadPine',
      _: 'ledgeSnow', N: 'mountainPeakBig', G: 'mountainPeakSmall', S: 'rockSpire', ']': 'frozenCascade', l: 'frozenPond', y: 'tracks',
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
