import { createRng } from '../core/math.js';
import { MapBuilder } from './levels.js';
import { rim, scatter, ring, dungeonBase, inRect, inEll } from './levels2.js';

// Runde-3-Gebiete (INTEGRATION.md §12.2), Stufe 20–40: Aschensteppe,
// Heulendes Hügelgrab, Faulmarsch, Sporenschlund, Frostzinnen, Reifhöhlen,
// Glutöde, Aschethron. Aufbau wie levels2.js (deterministischer Bauplan ->
// Zeichenraster + Metadaten). Außengebiete 96 × 64 Kacheln (1536 × 1024 px,
// Obergrenze aus §12.2) mit langen Straßen für Reittiere.
//
// Neu: areas[].noMount (Lager: Absitzen, A prüft das in canMount()).
//
// Bodenzeichen außen: ',' Gras/Asche, '.' Erde/Kies/Brandboden, ':' Pflaster,
// '~' Wasser/Lava (fest), '#' Fels. Straßen über Wasser sind Dämme ('.').

const road4 = (m) => (pts, w = 2) => m.path(pts, w, '.', [',', '~']);
const near = (m, x, y, ch, r = 1) => {
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (m.get(x + i, y + j) === ch) return true;
  return false;
};
const box = (r, pad = 1) => (x, y) => x >= r.x - pad && y >= r.y - pad && x < r.x + r.w + pad && y < r.y + r.h + pad;
const each = (list, fn) => list.forEach(([x, y]) => fn(x, y));
const GROUND = new Set([',', '.', ':']);

// Unregelmäßiger Fleck aus einer Grundellipse und versetzten Teilellipsen
function blob(m, rng, cx, cy, rx, ry, ch, only = null, n = 4) {
  m.ellipse(cx, cy, rx, ry, ch, only);
  for (let i = 0; i < n; i++) {
    m.ellipse(cx + rng.range(-rx, rx) * 0.6, cy + rng.range(-ry, ry) * 0.6, rx * rng.range(0.35, 0.65), ry * rng.range(0.35, 0.65), ch, only);
  }
}

// Wegenetz: malt Straßen in die Karte und merkt sie in einer Maske, damit
// die Streudeko einen Rand frei lässt.
function roadNet(m) {
  const mask = new MapBuilder(m.w, m.h, ' ');
  const road = (pts, w = 2, ch = '.', only = [',', '~']) => { m.path(pts, w, ch, only); mask.path(pts, w + 1.2, 'R'); };
  return { road, mask, onRoad: (x, y) => mask.get(x, y) === 'R' };
}

// Prüfhilfe: Marken, für die kein freier Boden gefunden wurde (sollte leer sein)
export const MISPLACED = [];

// Gegner/Marke auf den nächsten freien Boden (3 × 3 nur Boden) setzen –
// nie in Wasser, Fels oder Deko.
function foe(m, x, y, ch) {
  for (let r = 0; r <= 5; r++) {
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
      let ok = true;
      for (let b = -1; b <= 1 && ok; b++) for (let a = -1; a <= 1; a++) if (!GROUND.has(m.get(x + i + a, y + j + b))) { ok = false; break; }
      if (ok) { m.set(x + i, y + j, ch); return; }
    }
  }
  MISPLACED.push(`${ch}@${x},${y}`);
  m.set(x, y, ch);
}

// Streudeko auf Bodenzeichen `grounds`; meidet Straßen und Sperrflächen.
// pick(x, y, ground, free) -> Zeichen oder null; free = 3 × 3 nur Boden.
function strew(m, net, rng, keep, pick, grounds = ',') {
  const G = new Set(grounds);
  const free = (x, y) => {
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (!GROUND.has(m.get(x + i, y + j))) return false;
    return true;
  };
  for (let y = 1; y < m.h - 1; y++) for (let x = 1; x < m.w - 1; x++) {
    const ch = m.get(x, y);
    if (!G.has(ch) || keep(x, y) || net.onRoad(x, y)) continue;
    const r = pick(x, y, ch, free(x, y));
    if (r) m.set(x, y, r);
  }
}

// Kreis aus Zeichen (Steinkreise, Säulenringe)
function circle(m, cx, cy, rx, ry, n, ch, a0 = 0) {
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2;
    m.set(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), ch);
  }
}

// ---------------------------------------------------------------- Aschensteppe (20–25)
// Gliederung: Weideland um den Außenposten (West), ausgetrocknetes Flussbett
// quer durch die Mitte, alte gepflasterte Heerstraße nach Osten (Marsch),
// Hügelkamm vor Khars Kriegslager (Nordost), Staubpfannen mit Riesenknochen
// (Ost/Südost), Steinallee zum Hügelgrab (Südost), Steinkreis (Nordwest),
// Ruine einer Wegstation, verlassene Karawane (Südwest).
function buildAshenSteppe() {
  const W = 96, H = 64;
  const m = new MapBuilder(W, H, ',');
  const rng = createRng(2020);
  rim(m, rng, W, H);
  const net = roadNet(m);
  const road = net.road;

  // Ausgänge: West (Schlackenhöhen), Ost (Faulmarsch)
  m.rect(0, 30, 4, 5, ',');
  m.rect(92, 24, 4, 5, ',');

  // Staubpfannen (nackte Erde) im Osten und Südosten
  blob(m, rng, 72, 39, 11, 5.5, '.', [','], 6);
  blob(m, rng, 86, 54, 6, 4, '.', [','], 3);
  blob(m, rng, 58, 58, 6, 2.6, '.', [','], 3);
  // Zertrampelter Boden um den Steinkreis
  m.ellipse(28, 12, 3.4, 2.4, '.', [',']);

  // Felsen und Hügel: Kamm vor dem Kriegslager mit Pass, Tafelberge
  blob(m, rng, 61, 19, 6.5, 1.8, '#', null, 3);
  blob(m, rng, 87, 19.5, 5, 1.6, '#', null, 2);
  blob(m, rng, 41, 7, 5, 2.4, '#', null, 3);
  blob(m, rng, 13, 54, 5, 2.4, '#', null, 3);
  blob(m, rng, 89, 41, 2.8, 4, '#', null, 2);
  m.ellipse(64, 57, 2.6, 1.6, '#');
  m.ellipse(8, 12, 2.6, 2, '#');

  // Ausgetrocknetes Flussbett (Kies) mit Restpfützen und steilen Uferkanten
  const river = [[53, 1], [51, 8], [55, 14], [50, 23], [44, 30], [42, 37], [46, 44], [44, 51], [48, 57], [46, 63]];
  m.path(river, 4.4, '.', [',']);
  const riverMask = new MapBuilder(W, H, ' ');
  riverMask.path(river, 8, 'B'); riverMask.path(river, 4.4, 'W');
  // ausgewaschene Uferfelsen und zwei Restwasserlöcher
  blob(m, rng, 57.5, 12, 2.2, 1.6, '#', [','], 2);
  blob(m, rng, 38, 41, 1.8, 1.5, '#', [','], 1);
  blob(m, rng, 50, 47, 2, 1.4, '#', [','], 1);
  blob(m, rng, 41, 25, 1.6, 1.2, '#', [','], 1);
  m.ellipse(43, 36.5, 3.2, 1.9, '~');
  m.ellipse(46.5, 50, 2.4, 1.4, '~');

  // Alte Heerstraße: gebrochenes Pflaster auf Erdbankett, steinerne Furt
  const army = [[27, 32], [34, 31.5], [43, 31], [52, 29], [62, 27.5], [72, 26.5], [84, 26], [95, 26]];
  road([[0, 32], [8, 32]], 2.4);
  road(army, 3.2);
  m.path(army.slice(1), 1.6, ':', ['.']);
  for (let y = 0; y < H; y++) for (let x = 30; x < W; x++) if (m.get(x, y) === ':' && rng.chance(0.22)) m.set(x, y, '.');
  m.path([[40, 31.2], [48, 30.2]], 3, ':', ['.', ',']);
  // Pfade (Erde)
  road([[72, 26.5], [73, 21], [73.5, 15]], 2.4);                                    // durch den Pass zum Kriegslager
  road([[18, 40], [20, 46], [28, 50], [38, 51], [50, 51], [60, 52], [68, 53]], 2.2); // Südweg zum Hügelgrab
  road([[62, 27.5], [64, 36], [68, 44], [72, 50]], 2);                              // Abzweig von der Heerstraße
  road([[34, 31.5], [32, 22], [30, 15]], 1.6);                                      // Trampelpfad zum Steinkreis

  // Außenposten (Hub): festgestampfter Lehm, Jurten im Kreis um eine steinerne
  // Feuerstelle, Palisade mit Toren West/Ost/Süd, Stall und Karren im Süden
  const outpost = { x: 8, y: 24, w: 20, h: 17 };
  m.ellipse(18, 32, 8.4, 6.6, '.', [',']);
  m.ellipse(18, 32.3, 1.7, 1.2, ':');
  ring(m, 8, 24, 27, 40, 'p', 'q', [{ side: 'w', from: 31, to: 33 }, { side: 'e', from: 31, to: 33 }, { side: 's', from: 17, to: 19 }]);

  // Kriegslager des Steppenfürsten (Nordost, hinter dem Hügelkamm)
  const war = { x: 66, y: 4, w: 24, h: 12 };
  m.ellipse(78, 10, 11, 5, '.', [',']);
  ring(m, 66, 4, 89, 15, 'p', 'q', [{ side: 's', from: 72, to: 75 }, { side: 'w', from: 9, to: 11 }]);

  // Hügelgrab (Südosten) mit Vorplatz
  const barrow = { x: 65, y: 44, w: 18, h: 14 };
  m.ellipse(74, 53, 7, 3.6, '.', [',']);

  const put = (x, y, ch) => m.set(x, y, ch);
  // Außenposten
  put(12, 27, 'Y'); put(24, 27, 'Y'); put(11, 35, 'Y'); put(25, 36, 'Y'); put(18, 28, 'P'); put(18, 32, 'F');
  put(13, 39, 'S'); put(9, 38, 'h'); put(22, 39, 'Q');
  put(20, 29, 'A'); put(15, 37, 'O'); put(21, 36, 'K'); put(13, 30, 'I');
  put(18, 35, '1'); put(16, 35, '2'); put(4, 32, '3');
  // Kriegslager
  put(70, 7, 'X'); put(86, 7, 'X'); put(78, 6, 'P'); put(78, 10, 'F'); put(72, 13, 'Y'); put(86, 13, 'h');
  put(69, 11, 'W');
  each([[71, 9], [75, 12], [82, 9], [84, 12], [80, 13], [68, 13]], (x, y) => put(x, y, 'x'));
  each([[74, 7], [83, 11], [88, 10]], (x, y) => put(x, y, 'y'));
  put(79, 12, 'Z');
  // Wachtürme am Pass
  put(67, 22, 'W'); put(80, 22, 'P');
  // Hügelgrab: Tor, flankierende Steine, Steinallee entlang des Zugangs
  put(74, 49, 'M'); put(70, 52, 'j'); put(78, 52, 'j'); put(74, 55, '4');
  each([[69, 55], [79, 55], [66, 54], [82, 54]], (x, y) => put(x, y, 's'));
  each([[64, 47], [69, 45], [66, 41], [71, 48]], (x, y) => put(x, y, 's'));
  // Steinkreis (Nordwest)
  circle(m, 28, 12, 4.6, 3.4, 9, 's', 0.3);
  // Ruine einer Wegstation an der Heerstraße
  blob(m, rng, 63, 32, 3.4, 2, ':', [',', '.'], 2);
  each([[60, 30], [66, 30], [60, 34], [66, 34]], (x, y) => put(x, y, 's'));
  put(63, 34, 'b');
  // Brückenpfeiler der alten Furt
  put(39, 29, 's'); put(49, 28, 's');
  // Verlassene Karawane (Südwest)
  put(30, 54, 'Q'); put(34, 56, 'h'); put(27, 56, 'o');
  // Riesenknochen auf den Staubpfannen, ein Schädel am Flussbett
  each([[70, 37], [79, 41], [86, 55]], (x, y) => put(x, y, 'o'));
  put(45, 41, 'o');
  // Lagerfeuer der Bannerwachen (Rauch weithin sichtbar)
  put(38, 21, 'F'); put(58, 42, 'F'); put(84, 35, 'F');
  put(80, 50, 'P');

  // Rand der Marsch (Osten)
  put(90, 23, 'P'); put(90, 29, 'P'); put(92, 26, '5');

  // Gegner (vor der Streudeko, damit Felsen sie nicht einschließen)
  // Bannerwachen und Hinterhalt an der Furt: Plünderer + Schützen
  each([[34, 19], [41, 23], [55, 39], [60, 44], [83, 32], [88, 36], [47, 27], [41, 35], [51, 34]], (x, y) => foe(m, x, y, 'x'));
  each([[37, 17], [56, 37], [87, 32], [44, 26]], (x, y) => foe(m, x, y, 'y'));
  // Hyänenrudel: Staubpfanne, Südost, Karawane
  each([[72, 41], [75, 43], [69, 43], [86, 50], [89, 52], [84, 52], [25, 52], [29, 58], [23, 55]], (x, y) => foe(m, x, y, 'e'));
  // Geier über Steinkreis, Knochenfeldern und Karawane
  each([[25, 8], [33, 15], [66, 36], [80, 44], [33, 59], [38, 45], [58, 8], [12, 16]], (x, y) => foe(m, x, y, 'v'));

  const shrines = [[36, 19], [56, 41], [86, 34]];
  const clear = [box(outpost), box(war), box(barrow, 0), (x, y) => x <= 5 && y >= 28 && y <= 36, (x, y) => x >= 86 && y >= 21 && y <= 31,
    (x, y) => shrines.some(([sx, sy]) => Math.abs(x - sx) <= 2 && Math.abs(y - sy) <= 2)];
  const meadow = (x, y) => x < 38 && y > 14 && y < 50;
  const thorns = (x, y) => inEll(x, y, 18, 56, 10, 5) || inEll(x, y, 58, 9, 6, 4) || inEll(x, y, 90, 46, 4, 6);
  strew(m, net, rng, (x, y) => clear.some((f) => f(x, y)), (x, y, g, free) => {
    const bed = riverMask.get(x, y);
    if (g === '.') {
      // Flussbett: Geröll; Staubpfanne: fast nackt
      if (bed === 'W' && free && rng.chance(0.07)) return 'b';
      if (free && rng.chance(0.012)) return 'b';
      return null;
    }
    if (bed === 'B' && rng.chance(0.3)) return rng.chance(0.75) ? 'g' : 'n';
    if (near(m, x, y, '~', 1) && rng.chance(0.4)) return 'g';
    if (near(m, x, y, '#', 1) && free && rng.chance(0.06)) return 'b';
    if (thorns(x, y) && rng.chance(0.13)) return 'n';
    if (meadow(x, y) && rng.chance(0.11)) return 'g';
    if (free && rng.chance(0.008)) return 'b';
    if (rng.chance(0.035)) return 'g';
    if (rng.chance(0.008)) return 'n';
    return null;
  }, ',.');

  return {
    name: 'Die Aschensteppe',
    kind: 'outdoor',
    biome: 'steppe',
    decorSet: 'decor_steppe',
    map: m.rows(),
    solid: 'pqW',
    decor: {
      g: 'steppeGrass', n: 'thornShrubs', b: 'boulders', o: 'bleachedBones', s: 'standingStones',
      Y: 'yurt', X: 'warTent', p: 'palisade', q: 'palisadeV', W: 'watchtower', P: 'bannerPole',
      F: 'campfireBig', h: 'hayBales', S: 'stable', Q: 'cart', M: 'barrowMound', j: 'standingStones',
    },
    points: { 1: 'start', 2: 'respawn', 3: 'from_cinder_peaks', 4: 'from_howling_barrow', 5: 'from_blighted_marsh' },
    npcs: { A: 'captain_varra', O: 'stablemaster_orla', I: 'nomad_kesh', K: 'trader_imra' },
    enemies: {
      x: { type: 'steppe_raider' }, y: { type: 'raider_archer' }, e: { type: 'dust_hyena' },
      v: { type: 'ash_vulture' }, Z: { type: 'steppe_warlord' },
    },
    respawn: 45,
    areas: [
      { id: 'steppe_outpost', ...outpost, noMount: true },
      { id: 'warlord_camp', ...war },
      { id: 'barrow_gate', ...barrow },
      { id: 'marsh_edge', x: 84, y: 20, w: 12, h: 12 },
    ],
    objects: [
      { id: 'war_banner_1', kind: 'shrine', decor: 'warBanner', prompt: 'Banner niederreißen', x: shrines[0][0], y: shrines[0][1] },
      { id: 'war_banner_2', kind: 'shrine', decor: 'warBanner', prompt: 'Banner niederreißen', x: shrines[1][0], y: shrines[1][1] },
      { id: 'war_banner_3', kind: 'shrine', decor: 'warBanner', prompt: 'Banner niederreißen', x: shrines[2][0], y: shrines[2][1] },
    ],
    portals: [
      { id: 'to_cinder_peaks', x: 0.6, y: 32, range: 26, visual: 'road', dir: [-1, 0],
        to: { zoneId: 'cinder_peaks', spawnId: 'from_ashen_steppe' }, prompt: 'Westwärts zu den Schlackenhöhen' },
      { id: 'to_howling_barrow', x: 74, y: 50.2, range: 26, requires: { level: 23 },
        to: { zoneId: 'howling_barrow', spawnId: 'start' }, prompt: 'Das Heulende Hügelgrab betreten' },
      { id: 'to_blighted_marsh', x: 95.4, y: 26, range: 28, requires: { level: 25 }, visual: 'road', dir: [1, 0],
        to: { zoneId: 'blighted_marsh', spawnId: 'from_ashen_steppe' }, prompt: 'Ostwärts in die Faulmarsch' },
    ],
    signText: 'Ost: Die Faulmarsch · Südost: Das Hügelgrab · Nord: Khars Kriegslager · West: Die Schlackenhöhen',
  };
}

// ---------------------------------------------------------------- Faulmarsch (25–31)
// Ein echtes Moor: großer Faulsee in der Mitte mit der Insel des Moorgrauens,
// versunkenes Dorf in einer Lagune nördlich der Feste, Ostsumpf mit
// Pfahlhütten, Südsumpf mit dem alten Damm (Karawane). Knüppeldämme und
// Stege (Erdzeichen über Wasser) verbinden Inseln; Schilf an allen Ufern.
function buildBlightedMarsh() {
  const W = 96, H = 64;
  const m = new MapBuilder(W, H, ',');
  const rng = createRng(2525);
  rim(m, rng, W, H);
  const net = roadNet(m);
  const road = net.road;
  // Ausgänge: West (Steppe), Nord (Frostpass)
  m.rect(0, 38, 4, 5, ',');
  m.rect(46, 0, 8, 5, ',');

  // Moorwasser
  blob(m, rng, 55, 35, 15, 9, '~', [','], 8);        // Faulsee
  blob(m, rng, 22, 14, 10, 5.5, '~', [','], 6);      // Lagune des versunkenen Dorfs
  blob(m, rng, 83, 40, 8, 11, '~', [','], 7);        // Ostsumpf
  blob(m, rng, 38, 56, 12, 3.6, '~', [','], 5);      // Südsumpf
  blob(m, rng, 70, 56, 9, 3.4, '~', [','], 4);
  blob(m, rng, 64, 12, 7, 4, '~', [','], 4);         // Nordtümpel
  const pools = [[8, 54, 3, 1.8], [14, 27, 2.4, 1.4], [34, 26, 3, 1.8], [40, 9, 2.6, 1.6], [76, 26, 2.6, 1.6], [90, 12, 2, 1.6],
    [28, 48, 2, 1.3], [86, 58, 2.4, 1.4], [50, 54, 1.8, 1.2], [6, 22, 1.8, 2.4], [32, 4, 2, 1.2], [74, 6, 2.4, 1.2],
    [46, 20, 4.6, 2.2], [60, 22, 3, 1.8], [87, 22, 3.6, 2], [16, 52, 3, 1.6], [8, 28, 2.4, 1.4], [24, 27, 2.4, 1.2], [56, 4, 2.2, 1.2], [38, 47, 2.2, 1.2]];
  pools.forEach(([cx, cy, rx, ry]) => blob(m, rng, cx, cy, rx, ry, '~', [','], 2));
  // Inseln
  blob(m, rng, 54, 33, 5, 3, ',', ['~'], 3);           // Insel des Moorgrauens
  m.ellipse(44, 31, 2.2, 1.4, ',', ['~']);
  m.ellipse(64, 30, 2.4, 1.6, ',', ['~']);
  m.ellipse(62, 41, 2, 1.2, ',', ['~']);
  m.ellipse(17, 11, 3, 1.8, ',', ['~']);
  m.ellipse(27, 16, 3.2, 1.8, ',', ['~']);
  m.ellipse(13, 17, 2.2, 1.4, ',', ['~']);
  blob(m, rng, 85, 30, 3.4, 2.4, ',', ['~'], 2);       // Pfahlhütten-Insel
  blob(m, rng, 84, 47, 3, 2, ',', ['~'], 2);

  // Knüppeldämme und Stege
  road([[0, 40], [8, 40]], 2.4);
  road([[27, 40], [34, 40], [41, 42.5], [48, 43.5], [56, 43], [63, 38], [69, 31], [75, 23], [81, 17], [84, 15]], 2.4); // alter Damm zum Sporentor
  road([[18, 31], [19, 26], [25, 22], [33, 18], [41, 13], [47, 8], [50, 0]], 2.2);                                 // Frostpfad
  road([[52, 43.5], [53, 38], [54, 35]], 1.4);                                     // Steg zur Grauen-Insel
  road([[19, 24], [17, 19], [16, 13], [21, 10], [27, 12], [28, 17]], 1.4);         // Stege durchs versunkene Dorf
  road([[56, 43], [61, 49], [67, 53], [75, 55]], 2);                               // alter Damm nach Süden (Karawane)
  road([[34, 40], [32, 47], [26, 52], [24, 56]], 1.6);                             // Pfad zum Südsumpf
  road([[69, 31], [76, 32], [83, 31]], 1.4);                                       // Steg zu den Pfahlhütten
  road([[81, 31], [82, 38], [84, 46]], 1.4);
  road([[41, 13], [40, 8], [36, 7]], 1.4);                                         // zum Nordtotem

  // Moorfeste (Hub): Pfahlhütten im Wasser, verbunden durch Bohlenstege,
  // Feuerplattform in der Mitte, Palisade
  const fort = { x: 8, y: 32, w: 20, h: 16 };
  m.rect(9, 33, 18, 14, '~');
  m.rect(8, 39, 20, 3, '.');                         // Hauptsteg West–Ost
  m.rect(17, 31, 3, 16, '.');                        // Steg Nord–Süd
  m.ellipse(18, 40, 3.4, 2.4, '.');                  // Feuerplattform
  m.rect(10, 33, 5, 4, '.'); m.rect(22, 33, 5, 4, '.'); m.rect(10, 42, 5, 4, '.'); m.rect(22, 42, 5, 4, '.'); // Hüttenplattformen
  m.rect(14, 43, 3, 2, '.'); m.rect(20, 43, 2, 2, '.');
  ring(m, 8, 32, 27, 47, 'p', 'q', [{ side: 'w', from: 39, to: 41 }, { side: 'e', from: 39, to: 41 }, { side: 'n', from: 17, to: 19 }]);

  const village = { x: 9, y: 5, w: 24, h: 17 };
  const sporeGate = { x: 76, y: 5, w: 16, h: 13 };
  m.ellipse(84, 14, 5.4, 2.8, '.', [',', '~']);

  const put = (x, y, ch) => m.set(x, y, ch);
  // Moorfeste
  put(12, 35, 'H'); put(24, 35, 'H'); put(12, 44, 'H'); put(18, 33, 'P'); put(18, 40, 'F'); put(24, 45, 'W');
  put(16, 38, 'L'); put(20, 42, 'L'); put(10, 40, 'L'); put(26, 40, 'L');
  put(18, 36, 'A'); put(14, 41, 'B'); put(23, 39, 'M');
  put(18, 43, '1'); put(16, 43, '2'); put(4, 40, '3');
  // Versunkenes Dorf: halb versunkene Häuser an den Inselrändern, Laternen an den Stegen
  each([[15, 10], [23, 8], [29, 15], [12, 17], [20, 18]], (x, y) => put(x, y, 'R'));
  put(17, 15, 'L'); put(26, 11, 'L');
  // Sporentor (Nordost)
  put(84, 11, 'G'); put(83, 15, '4'); put(79, 13, 'L'); put(89, 13, 'L');
  // Frostpass
  put(47, 4, 'P'); put(53, 4, 'P'); put(50, 6, '5');
  // Laternen am Damm, Pfahlhütten im Ostsumpf, Hütte am Südende des Damms
  each([[33, 38], [47, 45], [60, 41], [70, 28], [78, 21]], (x, y) => put(x, y, 'L'));
  put(86, 29, 'H'); put(65, 51, 'H');

  // Gegner
  // Moorlauerer neben den Dämmen und Stegen, vier davon bei der Karawane
  each([[37, 43], [45, 41], [50, 46], [58, 46], [70, 38], [73, 34], [73, 26], [79, 20], [29, 21], [37, 16], [44, 11],
    [63, 52], [70, 52], [73, 57], [77, 53]], (x, y) => foe(m, x, y, 'l'));
  // Faulpriester an den Totems
  each([[34, 9], [38, 6], [22, 57], [27, 55], [88, 33], [84, 33]], (x, y) => foe(m, x, y, 's'));
  // Sumpfegel: Dorf, Südsumpf, Ostsumpf
  each([[18, 13], [24, 16], [27, 18], [12, 13], [20, 9], [44, 53], [48, 51], [55, 58], [83, 48], [86, 46], [80, 44]], (x, y) => foe(m, x, y, 'e'));
  // Seuchenkröten in den Sümpfen nördlich der Feste
  each([[9, 26], [13, 29], [28, 26], [31, 30], [16, 21], [24, 20]], (x, y) => foe(m, x, y, 't'));
  foe(m, 55, 32, 'Z');

  const totems = [[36, 8], [24, 58], [86, 32]];
  const caravan = [75, 56];
  // Schilfgürtel an allen Ufern
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (m.get(x, y) !== ',' || net.onRoad(x, y) || box(fort)(x, y)) continue;
    if (near(m, x, y, '~', 1) && rng.chance(0.5)) m.set(x, y, 'r');
  }
  const clear = [box(fort), box(sporeGate, 0), (x, y) => x <= 5 && y >= 36 && y <= 44, (x, y) => x >= 44 && x <= 56 && y <= 8,
    (x, y) => [...totems, caravan].some(([sx, sy]) => Math.abs(x - sx) <= 2 && Math.abs(y - sy) <= 2)];
  strew(m, net, rng, (x, y) => clear.some((f) => f(x, y)), (x, y, g, free) => {
    if (g !== ',') return null;
    const island = near(m, x, y, '~', 3);
    if (free && rng.chance(island ? 0.09 : 0.05)) return 'w';
    if (free && rng.chance(0.03)) return 'd';
    if (rng.chance(0.035)) return 'u';
    if (free && rng.chance(0.012)) return 'k';
    return null;
  });

  return {
    name: 'Die Faulmarsch',
    kind: 'outdoor',
    biome: 'marsh',
    decorSet: 'decor_marsh',
    map: m.rows(),
    solid: 'pqW',
    decor: {
      w: 'willowTrees', d: 'deadStumps', r: 'reeds', u: 'mushrooms', k: 'mossRocks',
      H: 'stiltHut', p: 'palisade', q: 'palisadeV', W: 'watchtower', P: 'bannerPole', F: 'campfireBig',
      R: 'sunkenHouse', G: 'sporeGate', L: 'lanternPost',
    },
    points: { 1: 'start', 2: 'respawn', 3: 'from_ashen_steppe', 4: 'from_spore_hollow', 5: 'from_frostspire' },
    npcs: { A: 'warden_thane', B: 'alchemist_brisa', M: 'trader_moll' },
    enemies: {
      l: { type: 'bog_lurker' }, s: { type: 'rot_shaman' }, e: { type: 'swamp_leech' },
      t: { type: 'plague_toad' }, Z: { type: 'bog_horror' },
    },
    respawn: 45,
    areas: [
      { id: 'mirefort', ...fort, noMount: true },
      { id: 'sunken_village', ...village },
      { id: 'spore_gate', ...sporeGate },
      { id: 'frost_pass', x: 44, y: 1, w: 12, h: 9 },
    ],
    objects: [
      { id: 'rot_totem_1', kind: 'shrine', decor: 'rotTotem', prompt: 'Totem verbrennen', x: totems[0][0], y: totems[0][1] },
      { id: 'rot_totem_2', kind: 'shrine', decor: 'rotTotem', prompt: 'Totem verbrennen', x: totems[1][0], y: totems[1][1] },
      { id: 'rot_totem_3', kind: 'shrine', decor: 'rotTotem', prompt: 'Totem verbrennen', x: totems[2][0], y: totems[2][1] },
      { id: 'lost_caravan', kind: 'item', decor: 'caravanWreck', prompt: 'Wrack durchsuchen', x: caravan[0], y: caravan[1] },
    ],
    portals: [
      { id: 'to_ashen_steppe', x: 0.6, y: 40, range: 26, visual: 'road', dir: [-1, 0],
        to: { zoneId: 'ashen_steppe', spawnId: 'from_blighted_marsh' }, prompt: 'Westwärts in die Aschensteppe' },
      { id: 'to_spore_hollow', x: 84, y: 12.2, range: 26, requires: { level: 29 },
        to: { zoneId: 'spore_hollow', spawnId: 'start' }, prompt: 'Den Sporenschlund betreten' },
      { id: 'to_frostspire', x: 50, y: 1.2, range: 28, requires: { level: 31 }, visual: 'road', dir: [0, -1],
        to: { zoneId: 'frostspire', spawnId: 'from_blighted_marsh' }, prompt: 'Den Frostpass hinauf' },
    ],
    signText: 'Nord: Der Frostpass · Nordost: Der Sporenschlund · West: Die Aschensteppe',
  };
}

// ---------------------------------------------------------------- Frostzinnen (31–36)
function buildFrostspire() {
  const W = 96, H = 64;
  const m = new MapBuilder(W, H, ',');
  const rng = createRng(3131);
  rim(m, rng, W, H);
  // Felsgipfel
  m.ellipse(50, 10, 8, 4, '#');
  m.ellipse(84, 16, 7, 6, '#');
  m.ellipse(34, 30, 3, 2, '#');
  m.ellipse(62, 38, 4, 3, '#');
  m.ellipse(12, 10, 5, 4, '#');
  // Ausgänge: Süd (Marsch), Ost (Abstieg in die Glutöde)
  m.rect(16, 59, 8, 5, ',');
  m.rect(92, 44, 4, 5, ',');
  // Gefrorene Seen (fest)
  m.ellipse(46, 50, 7, 3.2, '~');
  m.ellipse(72, 26, 4, 2.4, '~');

  const road = road4(m);
  road([[20, 63], [20, 54], [24, 46]]);
  road([[36, 38], [48, 40], [60, 44], [74, 46], [86, 46], [95, 46]]);   // Abstieg nach Osten
  road([[30, 32], [26, 22], [20, 16], [22, 8]]);                         // zum Reiftor
  road([[48, 40], [56, 30], [66, 30], [76, 34]]);                        // Trollhöhlen

  // Frosthold (Hub): Festung mit Langhäusern
  const hold = { x: 18, y: 32, w: 20, h: 14 };
  // Schneehof: Steinpflaster nur auf Wegen und um das Feuer, sonst Schnee
  m.path([[27.5, 45], [27.5, 32]], 3, ':', [',', '.']);
  m.path([[20, 38], [38, 38]], 2.6, ':', [',', '.']);
  m.ellipse(27.5, 40.5, 3.4, 2.2, ':', [',', '.']);
  m.path([[24, 46], [27, 44]], 3, ':', [',', '.']);
  m.path([[36, 38], [38, 38]], 3, ':', [',', '.']);
  m.path([[28, 31], [28, 33]], 3, ':', [',', '.']);
  ring(m, 18, 32, 37, 45, 'w', 'v', [{ side: 's', from: 26, to: 28 }, { side: 'e', from: 37, to: 39 }, { side: 'n', from: 27, to: 29 }]);
  const put = (x, y, ch) => m.set(x, y, ch);
  put(18, 32, 'U'); put(37, 32, 'U'); put(18, 45, 'U'); put(37, 45, 'U'); put(27, 45, 'G');
  put(23, 36, 'L'); put(33, 36, 'L'); put(27, 40, 'F'); put(22, 42, 'T'); put(33, 42, 'P');
  put(27, 37, 'A'); put(24, 43, 'B'); put(31, 43, 'M');
  put(27, 42, '1'); put(25, 42, '2'); put(20, 60, '3');

  // Trollhöhlen (Osten), Reiftor (Nordwest)
  const trolls = { x: 66, y: 24, w: 18, h: 16 };
  m.ellipse(74, 32, 8, 5.5, '.', [',']);
  const rime = { x: 16, y: 2, w: 14, h: 10 };
  m.ellipse(22, 7, 5, 3, '.', [',']);
  put(22, 4, 'R'); put(22, 8, '4');
  put(92, 43, 'P'); put(92, 49, 'P'); put(92, 46, '5');

  // Gegner
  each([[70, 30], [78, 30], [74, 36], [80, 36], [68, 34]], (x, y) => put(x, y, 'i'));
  put(76, 33, 'Z');
  each([[44, 22], [48, 24], [46, 26], [56, 18], [60, 20], [58, 16], [12, 26], [14, 22], [10, 24], [80, 56], [84, 54], [82, 58]], (x, y) => put(x, y, 'j'));
  each([[40, 16], [30, 14], [66, 50], [56, 54], [88, 30], [36, 56]], (x, y) => put(x, y, 'h'));
  each([[50, 32], [42, 44], [62, 52], [70, 56], [86, 38], [30, 52], [12, 50], [64, 12]], (x, y) => put(x, y, 's'));

  const clear = [box(hold), box(trolls, 0), box(rime, 0), (x, y) => x >= 14 && x <= 26 && y >= 56, (x, y) => x >= 88 && y >= 40 && y <= 52];
  scatter(m, rng, (x, y) => clear.some((f) => f(x, y)), (x, y, free) => {
    if (near(m, x, y, '.', 1)) return null;
    if (free && rng.chance(0.2) && (y < 24 || x < 14 || (x > 40 && x < 60 && y > 12 && y < 30))) return 't';
    if (free && rng.chance(0.03)) return 't';
    if (free && rng.chance(0.015)) return 'c';
    if (rng.chance(0.02)) return 'k';
    if (rng.chance(0.03)) return 'd';
    return null;
  });

  return {
    name: 'Die Frostzinnen',
    kind: 'outdoor',
    biome: 'frost',
    decorSet: 'decor_frost',
    map: m.rows(),
    solid: 'wvU',
    decor: {
      t: 'snowPines', k: 'frozenRocks', c: 'iceCrystals', d: 'snowDrifts', L: 'longhouse',
      w: 'fortWall', v: 'fortWallV', G: 'fortGate', U: 'fortTower', T: 'tent', P: 'bannerPole', F: 'campfireBig',
      R: 'rimeGate', o: 'trollBones',
    },
    points: { 1: 'start', 2: 'respawn', 3: 'from_blighted_marsh', 4: 'from_rime_caverns', 5: 'from_ember_wastes' },
    npcs: { A: 'jarl_eskil', B: 'hunter_sigrun', M: 'trader_fenn' },
    enemies: {
      i: { type: 'ice_troll' }, j: { type: 'frost_wolf' }, h: { type: 'rime_witch' },
      s: { type: 'snow_stalker', dormant: true }, Z: { type: 'ice_troll_chief' },
    },
    respawn: 45,
    areas: [
      { id: 'frosthold', ...hold, noMount: true },
      { id: 'troll_caves', ...trolls },
      { id: 'rime_gate', ...rime },
      { id: 'wastes_descent', x: 84, y: 40, w: 12, h: 12 },
    ],
    objects: [
      { id: 'frost_beacon_1', kind: 'shrine', decor: 'frostBeacon', prompt: 'Leuchtfeuer entzünden', x: 50, y: 15 },
      { id: 'frost_beacon_2', kind: 'shrine', decor: 'frostBeacon', prompt: 'Leuchtfeuer entzünden', x: 84, y: 24 },
      { id: 'frost_beacon_3', kind: 'shrine', decor: 'frostBeacon', prompt: 'Leuchtfeuer entzünden', x: 58, y: 58 },
    ],
    portals: [
      { id: 'to_blighted_marsh', x: 20, y: 62.4, range: 28, visual: 'road', dir: [0, 1],
        to: { zoneId: 'blighted_marsh', spawnId: 'from_frostspire' }, prompt: 'Hinab in die Faulmarsch' },
      { id: 'to_rime_caverns', x: 22, y: 5.2, range: 26, requires: { level: 34 },
        to: { zoneId: 'rime_caverns', spawnId: 'start' }, prompt: 'Die Reifhöhlen betreten' },
      { id: 'to_ember_wastes', x: 95.4, y: 46, range: 28, requires: { level: 36 }, visual: 'road', dir: [1, 0],
        to: { zoneId: 'ember_wastes', spawnId: 'from_frostspire' }, prompt: 'Abstieg in die Glutöde' },
    ],
    signText: 'Nordwest: Die Reifhöhlen · Ost: Abstieg in die Glutöde · Süd: Die Faulmarsch',
  };
}

// ---------------------------------------------------------------- Glutöde (36–40)
// Gliederung: Letzte Bastion (West), Pilgerstraße über eine Basaltbrücke des
// großen Lavastroms nach Osten, Obsidianfeld (Nord), Aschedünen (Südwest),
// verbranntes Dorf (Süd), Geysirfeld am Lavasee (Südost), Kolossfeld mit
// Prozessionsweg zum Throntor (Nordost).
function buildEmberWastes() {
  const W = 96, H = 64;
  const m = new MapBuilder(W, H, ',');
  const rng = createRng(3636);
  rim(m, rng, W, H);
  const net = roadNet(m);
  const road = net.road;
  // Ausgang: West (Frostzinnen)
  m.rect(0, 18, 4, 5, ',');

  // Basaltkuppen
  blob(m, rng, 54, 6, 3.4, 1.8, '#', null, 2);
  blob(m, rng, 30, 38, 2.6, 1.6, '#', null, 2);
  blob(m, rng, 64, 30, 3, 1.8, '#', null, 2);
  blob(m, rng, 92, 30, 2.4, 3, '#', null, 1);
  m.ellipse(8, 58, 3, 2, '#');
  m.ellipse(35, 4, 2.4, 1.4, '#');

  // Brandboden (rötliche Erde): Kolossfeld, Geysirfeld, Brandflächen
  blob(m, rng, 79, 19, 11, 7, '.', [','], 6);
  blob(m, rng, 80, 48, 9, 6, '.', [','], 5);
  blob(m, rng, 46, 52, 8, 4.6, '.', [','], 4);
  blob(m, rng, 20, 44, 6, 3, '.', [','], 3);

  // Lavaströme (fest): großer Strom Nord -> Süd, Nebenarm aus Osten, Lavasee
  m.path([[37, 1], [39, 9], [44, 16], [46, 25], [50, 33], [56, 41], [60, 50], [62, 63]], 3, '~', [',', '.']);
  m.path([[95, 38], [86, 37.5], [76, 40], [66, 41], [57, 42]], 2.2, '~', [',', '.']);
  blob(m, rng, 81, 55, 5.5, 2.8, '~', [',', '.'], 3);
  m.ellipse(74, 50, 1.6, 1, '~');
  m.ellipse(87, 47, 1.4, 1, '~');
  m.ellipse(48, 9, 1.6, 1, '~');

  // Straßen: Pilgerstraße mit Basaltbrücke, Südweg durch Dünen und Dorf,
  // Querweg über den Nebenarm, Prozessionsweg zum Throntor
  road([[0, 20], [8, 20]], 2.4);
  const pilgrim = [[26, 20], [34, 21], [42, 20.5], [50, 21], [58, 20], [66, 19.5], [74, 19]];
  road(pilgrim, 2.8);
  m.path(pilgrim.slice(1), 1.4, ':', ['.']);
  for (let y = 16; y < 25; y++) for (let x = 28; x < 76; x++) if (m.get(x, y) === ':' && rng.chance(0.3)) m.set(x, y, '.');
  road([[17, 28], [18, 36], [24, 43], [34, 47], [44, 50], [53, 49], [62, 46], [70, 45], [78, 46]], 2.2);
  road([[80, 45], [82, 37], [80, 28], [79, 24]], 2);
  road([[50, 21], [51, 14], [49, 10]], 1.6);
  m.path([[79, 26], [79, 13], [80, 7]], 3, ':', [',', '.']);
  net.mask.path([[79, 26], [79, 13], [80, 7]], 4, 'R');

  // Letzte Bastion (Hub)
  const bastion = { x: 8, y: 12, w: 18, h: 16 };
  // Brandboden mit Basaltplatten-Kreuz zwischen den Toren, Windschutzmauern
  m.rect(9, 13, 16, 14, '.');
  m.path([[8, 20], [26, 20]], 3, ':', [',', '.']);
  m.path([[17, 13], [17, 28]], 3, ':', [',', '.']);
  for (let y = 13; y < 27; y++) for (let x = 9; x < 25; x++) if (m.get(x, y) === '.' && (x * 7 + y * 13) % 11 === 0) m.set(x, y, ':');
  ring(m, 8, 12, 25, 27, 'w', 'v', [{ side: 'w', from: 19, to: 21 }, { side: 'e', from: 19, to: 21 }, { side: 's', from: 16, to: 18 }]);
  const put = (x, y, ch) => m.set(x, y, ch);
  put(8, 12, 'U'); put(25, 12, 'U'); put(8, 27, 'U'); put(25, 27, 'U');
  for (const x of [10, 11, 12, 13, 21, 22, 23]) put(x, 15, 'w');
  put(12, 17, 'T'); put(22, 17, 'T'); put(17, 14, 'P'); put(17, 20, 'F'); put(12, 24, 'K'); put(22, 24, 'x'); put(23, 25, 'x');
  put(17, 17, 'A'); put(12, 19, 'B'); put(20, 24, 'M');
  put(17, 23, '1'); put(15, 23, '2'); put(4, 20, '3');

  // Kolossfeld vor dem Throntor
  const field = { x: 67, y: 10, w: 25, h: 19 };
  const gate = { x: 72, y: 1, w: 16, h: 9 };
  m.ellipse(80, 6, 5, 2.4, ':', [',', '.']);
  put(80, 3, 'R'); put(80, 7, '4');
  each([[76, 8], [84, 8], [76, 13], [83, 13]], (x, y) => put(x, y, 'P'));
  // Prozessionsweg: Obsidiansplitter als Spalier, Knochenhaufen gefallener Pilger
  each([[77, 16], [82, 16], [76, 21], [83, 21]], (x, y) => put(x, y, 'o'));
  each([[71, 14], [88, 13], [73, 24], [87, 24], [69, 19]], (x, y) => put(x, y, 'y'));
  each([[70, 11], [89, 19], [86, 27]], (x, y) => put(x, y, 'h'));
  // Verbranntes Dorf: Pflasterreste, Ruinen in Straßenzügen, verkohlte Bäume
  blob(m, rng, 46, 52, 5, 2.6, ':', ['.', ','], 3);
  for (let y = 46; y < 58; y++) for (let x = 38; x < 56; x++) if (m.get(x, y) === ':' && rng.chance(0.3)) m.set(x, y, '.');
  each([[40, 47], [46, 46], [52, 46], [41, 55], [47, 56], [53, 54]], (x, y) => put(x, y, 'h'));
  each([[38, 51], [55, 51], [44, 58]], (x, y) => put(x, y, 'd'));
  // Geysirfeld am Lavasee
  each([[74, 46], [78, 43], [84, 44], [86, 50], [76, 52], [71, 49], [89, 54], [82, 51]], (x, y) => put(x, y, 'g'));
  // Brücke: Banner der Pilger an beiden Enden
  put(40, 18, 'P'); put(48, 23, 'P');

  // Gegner
  // Aschengeister rund um die Bastion und auf dem Kolossfeld
  each([[30, 14], [30, 26], [13, 32], [24, 32], [28, 8], [5, 10], [69, 12], [90, 11], [68, 26], [90, 26]], (x, y) => foe(m, x, y, 'a'));
  // Schlackenritter: Streifen auf der Pilgerstraße, Wache am Kolossfeld
  each([[36, 23], [38, 18], [53, 18], [55, 23], [62, 17], [64, 22], [76, 11], [84, 11], [73, 25], [86, 25]], (x, y) => foe(m, x, y, 'k'));
  // Magmaschlangen an den Lavaufern
  each([[42, 12], [43, 27], [53, 36], [63, 53], [70, 38], [86, 57]], (x, y) => foe(m, x, y, 's'));
  // Glutadepten zwischen den Obelisken
  const obelisks = [[52, 10], [22, 49], [88, 46]];
  each([[50, 8], [55, 11], [20, 47], [25, 51], [85, 45], [90, 49]], (x, y) => foe(m, x, y, 'c'));
  foe(m, 79, 18, 'Z');

  const clear = [box(bastion), box(gate, 0), (x, y) => x <= 5 && y >= 15 && y <= 25,
    (x, y) => obelisks.some(([sx, sy]) => Math.abs(x - sx) <= 2 && Math.abs(y - sy) <= 2), (x, y) => inEll(x, y, 79, 18, 7, 4)];
  const dunes = (x, y) => inEll(x, y, 18, 50, 15, 9);
  const obsidian = (x, y) => inEll(x, y, 52, 8, 11, 5);
  const ruins = (x, y) => inEll(x, y, 46, 52, 10, 6);
  const geysers = (x, y) => inEll(x, y, 80, 49, 11, 7);
  strew(m, net, rng, (x, y) => clear.some((f) => f(x, y)), (x, y, g, free) => {
    if (near(m, x, y, '~', 1)) return free && rng.chance(0.03) ? 'o' : rng.chance(0.07) ? 'o' : null;
    if (obsidian(x, y) && rng.chance(0.1)) return 'o';
    if (dunes(x, y) && rng.chance(0.13)) return 'n';
    if (ruins(x, y) && free && rng.chance(0.04)) return rng.chance(0.5) ? 'd' : 'y';
    if (geysers(x, y) && free && rng.chance(0.02)) return 'g';
    if (g === '.') return free && rng.chance(0.006) ? 'y' : null;
    if (rng.chance(0.022)) return 'n';
    if (free && rng.chance(0.008)) return 'd';
    if (free && rng.chance(0.006)) return 'h';
    if (rng.chance(0.006)) return 'y';
    return null;
  }, ',.');

  return {
    name: 'Die Glutöde',
    kind: 'outdoor',
    biome: 'wastes',
    decorSet: 'decor_wastes',
    map: m.rows(),
    solid: 'wvU',
    decor: {
      h: 'charredRuins', o: 'obsidianShards', n: 'ashDunes', g: 'emberGeysers', d: 'scorchedTrees', y: 'bonePiles',
      w: 'bastionWall', v: 'bastionWallV', G: 'bastionGate', U: 'bastionTower', T: 'tent', P: 'bannerPole', F: 'forge',
      K: 'forge', x: 'crates', R: 'throneGate',
    },
    points: { 1: 'start', 2: 'respawn', 3: 'from_frostspire', 4: 'from_ashen_throne' },
    npcs: { A: 'marshal_corvane', B: 'pilgrim_aldo', M: 'quartermaster_ryn' },
    enemies: {
      a: { type: 'ash_wraith' }, k: { type: 'cinder_knight' }, s: { type: 'magma_serpent' },
      c: { type: 'ember_cultist_adept' }, Z: { type: 'waste_colossus' },
    },
    respawn: 45,
    areas: [
      { id: 'last_bastion', ...bastion, noMount: true },
      { id: 'colossus_field', ...field },
      { id: 'throne_gate', ...gate },
    ],
    objects: [
      { id: 'ember_obelisk_1', kind: 'shrine', decor: 'emberObelisk', prompt: 'Obelisk löschen', x: obelisks[0][0], y: obelisks[0][1] },
      { id: 'ember_obelisk_2', kind: 'shrine', decor: 'emberObelisk', prompt: 'Obelisk löschen', x: obelisks[1][0], y: obelisks[1][1] },
      { id: 'ember_obelisk_3', kind: 'shrine', decor: 'emberObelisk', prompt: 'Obelisk löschen', x: obelisks[2][0], y: obelisks[2][1] },
    ],
    portals: [
      { id: 'to_frostspire', x: 0.6, y: 20, range: 26, visual: 'road', dir: [-1, 0],
        to: { zoneId: 'frostspire', spawnId: 'from_ember_wastes' }, prompt: 'Hinauf in die Frostzinnen' },
      { id: 'to_ashen_throne', x: 80, y: 4.2, range: 26, requires: { level: 38 },
        to: { zoneId: 'ashen_throne', spawnId: 'start' }, prompt: 'Den Aschethron betreten' },
    ],
    signText: 'Nordost: Kolossfeld und Aschethron · West: Die Frostzinnen',
  };
}

// ---------------------------------------------------------------- Dungeons
// Gemeinsamer Aufbau wie Tempel/Glutschmiede: Räume, Gänge, Arena mit Tor (G)
// und Bossmarke 9, Eingangstreppe D mit Rückportal.

// Wandfackeln auf Mauerfronten mit Boden davor (für frei geformte Dungeons)
function wallTorches(m, every = 6, seed = 0) {
  for (let y = 1; y < m.h - 1; y++) for (let x = 1; x < m.w - 1; x++) {
    if ((x + y * 3 + seed) % every) continue;
    if (m.get(x, y) !== '#' || m.get(x - 1, y) !== '#' || m.get(x + 1, y) !== '#') continue;
    if (m.get(x, y + 1) !== '.' || m.get(x - 1, y + 1) !== '.' || m.get(x + 1, y + 1) !== '.') continue;
    m.set(x, y, 'T');
  }
}

// Heulendes Hügelgrab: verwinkelte Grabgänge statt Rasterräume. Eingang mit
// Grabnischen-Galerie, runde Grabkammern (Knochengrube, Rufer-Kapelle im
// Steinkreis, Totenwacht), lange Sarkophag-Halle, Vorkammer und Grabkammer
// des Königs (Arena) im Nordosten; das Tor liegt in deren Südwand, der Thron
// an der Nordwand gegenüber.
function buildHowlingBarrow() {
  const W = 64, H = 56;
  const { m, put } = dungeonBase(W, H, 2424);
  const cave = (cx, cy, rx, ry) => m.ellipse(cx, cy, rx, ry, '.');
  const tunnel = (pts, w = 2.4) => m.path(pts, w, '.');

  // A Eingang (rund) mit Treppe
  cave(10, 7, 6, 3.2); m.rect(8, 4, 4, 2, '.');
  // B Grabnischen-Galerie: Gang mit Nischen nach Nord und Süd
  m.rect(21, 5, 17, 4, '.');
  for (const x of [23, 29, 35]) m.rect(x, 3, 2, 2, '.');
  for (const x of [26, 32]) m.rect(x, 9, 2, 2, '.');
  tunnel([[15, 7], [22, 7]], 2.6);
  // C1 Knochengrube
  cave(11, 22, 6.5, 5);
  tunnel([[8, 10], [6, 13], [8, 16], [10, 18]], 2.6);
  // C2 Rufer-Kapelle (Steinkreis)
  cave(31, 23, 6.2, 4.8);
  tunnel([[17, 22], [21, 20], [26, 22]], 2.4);
  tunnel([[31, 9], [33, 13], [31, 18]], 2.2);
  // C3 Totenwacht
  cave(14, 42, 7.5, 5.5);
  tunnel([[9, 26], [7, 31], [10, 37]], 2.4);
  // Sarkophag-Halle
  m.rect(27, 38, 22, 11, '.');
  tunnel([[21, 43], [28, 43.5]], 2.8);
  tunnel([[32, 27], [36, 32], [37, 38]], 2.2);
  // F Vorkammer (barrow_crypt) und Gang aus der Halle herauf
  m.rect(44, 18, 14, 8, '.');
  tunnel([[48, 43], [54, 42], [57, 36], [54, 30], [51, 25]], 2.4);
  // Beinhaus unter der Halle und Seitengrab am Aufgang
  cave(38, 52, 7, 2.4); tunnel([[38, 48], [38, 51]], 2.2);
  cave(57, 48, 3.6, 2.6); tunnel([[54, 42], [56, 46]], 2);
  // G Grabkammer des Königs (Arena), Tor in der Südwand
  const arena = { x: 40, y: 2, w: 22, h: 15 };
  m.rect(arena.x, arena.y, arena.w, arena.h, '.');
  m.rect(49, 17, 4, 1, '.');
  // Verborgene Ahnenkammer unter der Totenwacht (Hebel an deren Nordwand)
  m.rect(14, 49, 2, 2, '.'); m.rect(9, 51, 13, 3, '.');
  // Grabwasser
  m.ellipse(11, 23, 2.2, 1.3, '~');
  m.rect(37, 46, 2, 2, '~'); m.rect(37, 39, 2, 2, '~');
  wallTorches(m, 6);

  put(9, 3, 'D'); put(10, 3, 'D'); put(9, 6, '1'); put(12, 6, '2');
  // A
  put(5, 6, 'S'); put(15, 5, 'S'); put(6, 9, 'U'); put(14, 9, 'c');
  // B: Hügelgräber in den Nischen, Urnen, Truhe am Ende
  each([[24, 3], [30, 3], [36, 3], [27, 10], [33, 10]], (x, y) => put(x, y, 'K'));
  put(22, 6, 'U'); put(37, 8, 'C'); put(21, 8, 'b');
  put(26, 6, 'w'); put(34, 7, 'w'); put(30, 7, 'a');
  // C1 Knochengrube: schlafende Wiedergänger zwischen Knochenhaufen
  each([[6, 20], [16, 20], [7, 26], [15, 26], [11, 19]], (x, y) => put(x, y, 'b'));
  put(8, 22, 'x'); put(14, 23, 'x'); put(11, 26, 'x'); put(13, 20, 'w');
  // C2 Rufer-Kapelle: Steinkreis um zwei Totenrufer
  circle(m, 31, 23, 5, 3.6, 8, 'S', 0.4);
  put(29, 23, 'r'); put(33, 23, 'r'); put(31, 21, 'B'); put(28, 26, 'w'); put(34, 20, 'w');
  // C3 Totenwacht: Wurzelsäulen, Grabhunde
  each([[9, 39], [19, 39], [9, 45], [19, 45]], (x, y) => put(x, y, 'P'));
  put(14, 38, 'U'); put(14, 46, 'U');
  put(12, 41, 'h'); put(16, 42, 'h'); put(14, 44, 'h'); put(11, 44, 'w');
  // Sarkophag-Halle: zwei Reihen Sarkophage, Geisterbecken an den Enden
  each([[30, 41], [34, 41], [42, 41], [46, 41], [30, 47], [34, 47], [42, 47], [46, 47]], (x, y) => put(x, y, 'Z'));
  put(28, 39, 'B'); put(47, 39, 'B'); put(28, 47, 'B'); put(47, 45, 'B');
  put(38, 43, 'j');
  put(32, 44, 'w'); put(36, 42, 'w'); put(40, 45, 'w'); put(44, 43, 'w'); put(45, 39, 'a');
  // Beinhaus und Seitengrab
  each([[32, 52], [44, 52], [35, 53], [41, 51]], (x, y) => put(x, y, 'b'));
  put(38, 53, 'U'); put(31, 51, 'U'); put(45, 51, 'c'); put(58, 49, 'C'); put(55, 48, 'K'); put(59, 47, 'U');
  // Ahnenkammer hinter der Geheimwand
  put(14, 48, '$'); put(15, 48, '$');
  put(15, 52, 'C'); put(11, 52, 'j'); put(20, 51, 'B'); put(10, 51, 'B'); put(18, 53, 'U'); put(12, 53, 'K');
  // F Vorkammer
  put(45, 19, 'S'); put(56, 19, 'S'); put(45, 24, 'U'); put(56, 24, 'c');
  put(48, 22, 'w'); put(54, 22, 'w'); put(51, 20, 'a'); put(57, 22, 'C');
  for (let x = 49; x <= 52; x++) put(x, 17, 'G');
  // G – Arena
  each([[43, 5], [58, 5], [43, 14], [58, 14]], (x, y) => put(x, y, 'P'));
  put(41, 3, 'B'); put(60, 3, 'B'); put(41, 15, 'B'); put(60, 15, 'B');
  put(51, 4, 'Y'); put(51, 8, '9'); put(47, 14, 'j'); put(55, 14, 'j');
  each([[45, 3], [56, 3]], (x, y) => put(x, y, 'K'));
  // Druckplatten in den Gängen
  put(7, 13, '^'); put(7, 14, '^'); put(32, 13, '^'); put(56, 36, '^'); put(55, 37, '^'); put(24, 43, '^');

  return {
    name: 'Das Heulende Hügelgrab',
    kind: 'dungeon',
    biome: 'barrow',
    map: m.rows(),
    decor: {
      S: 'standingStone', P: 'rootPillar', U: 'burialUrn', b: 'bonePile', B: 'ghostBrazier', Y: 'barrowThrone',
      K: 'cairn', j: 'weaponOffering',
    },
    points: { 1: 'start', 2: 'respawn' },
    enemies: {
      w: { type: 'barrow_wight' }, a: { type: 'bone_archer' }, h: { type: 'grave_hound' }, r: { type: 'wight_caller' },
      x: { type: 'barrow_wight', dormant: true },
      9: { type: 'barrow_king', boss: true },
    },
    respawn: Infinity,
    areas: [{ id: 'barrow_crypt', x: 44, y: 18, w: 14, h: 8 }],
    arena: { ...arena, gateRow: 17 },
    traps: { '^': { kind: 'spike' } },
    trapDamage: 60,
    secrets: [{ id: 'barrow_ancestors', lever: { x: 16, y: 37 } }],
    portals: [{
      id: 'to_ashen_steppe', x: 9.5, y: 3.2, range: 22,
      to: { zoneId: 'ashen_steppe', spawnId: 'from_howling_barrow' }, prompt: 'Zurück in die Aschensteppe',
    }],
  };
}

function buildSporeHollow() {
  const W = 64, H = 58;
  const { m, hall, torches, put, rng } = dungeonBase(W, H, 3030);
  // Organische Höhlen statt Rechteckräume
  const cave = (cx, cy, rx, ry) => { m.ellipse(cx, cy, rx, ry, '.'); for (let i = 0; i < 5; i++) m.ellipse(cx + rng.range(-rx * 0.6, rx * 0.6), cy + rng.range(-ry * 0.5, ry * 0.5), rx * 0.45, ry * 0.45, '.'); };
  m.rect(4, 4, 10, 7, '.');           // A Eingang
  cave(24, 9, 8, 5);                   // B Brutkammer
  cave(10, 25, 7, 6);                  // C Schleimgrube
  cave(30, 26, 8, 6);                  // D Pilzwald
  cave(50, 12, 8, 6);                  // E Sporenkammer
  cave(52, 30, 6, 4.4);                // F Vorhöhle (mother_nest)
  m.rect(38, 40, 22, 15, '.');         // G Nest (Arena)
  hall(13, 7, 6, 3); hall(8, 11, 3, 9); hall(31, 8, 12, 3); hall(16, 25, 8, 3);
  hall(37, 27, 10, 3); hall(51, 17, 3, 9); hall(47, 34, 4, 6);
  // Kokonkammer (Nebenweg unter der Schleimgrube) und verborgener Sporenhort
  m.path([[10, 30], [11, 34], [13, 38]], 2.2, '.');
  m.ellipse(14, 42, 6.4, 3.6, '.');
  m.rect(22, 42, 4, 2, '.');
  m.ellipse(30, 44, 5, 3.4, '.');
  torches(8);
  // Schleim (Flüssigkeit, fest)
  m.ellipse(10, 27, 2.6, 1.6, '~', ['.']);
  m.ellipse(30, 29, 2, 1.2, '~', ['.']);
  m.ellipse(42.5, 48, 1.6, 1.2, '~', ['.']); m.ellipse(55.5, 48, 1.6, 1.2, '~', ['.']);

  put(8, 3, 'D'); put(9, 3, 'D'); put(8, 6, '1'); put(11, 6, '2');
  put(5, 5, 'M'); put(12, 9, 'g');
  // B
  each([[20, 7], [28, 7], [24, 12]], (x, y) => put(x, y, 'M'));
  each([[22, 9], [26, 9], [24, 7], [20, 11], [28, 11]], (x, y) => put(x, y, 's'));
  put(27, 12, 'o');
  // C
  each([[7, 22], [13, 22], [8, 29]], (x, y) => put(x, y, 'M'));
  put(13, 27, 'b'); put(10, 21, 'c'); put(6, 25, 's'); put(14, 25, 's');
  // D
  each([[25, 22], [35, 22], [26, 30], [34, 31]], (x, y) => put(x, y, 'M'));
  put(30, 23, 'b'); put(28, 26, 'c'); put(33, 27, 'c'); put(31, 24, 'f'); put(24, 26, 'o');
  // E
  each([[46, 9], [54, 9], [50, 16]], (x, y) => put(x, y, 'M'));
  put(50, 12, 'f'); put(47, 13, 'c'); put(53, 13, 'c'); put(50, 9, 's'); put(55, 12, 'C');
  // F
  put(48, 29, 'P'); put(56, 29, 'P'); put(52, 31, 'f'); put(50, 28, 'c');
  for (let x = 47; x <= 50; x++) put(x, 39, 'G');
  // G – Nest
  each([[41, 43], [56, 43], [41, 52], [56, 52]], (x, y) => put(x, y, 'M'));
  put(39, 41, 'o'); put(58, 41, 'o'); put(39, 53, 'o'); put(58, 53, 'o');
  put(49, 42, 'A'); put(49, 46, '9');
  // Kokonkammer: Truhe zwischen Kokons, Hebel an der Nordwand
  put(9, 44, 'C'); put(12, 40, 'b'); put(18, 44, 'b'); put(16, 45, 'g'); put(7, 42, 'o');
  put(21, 42, '$'); put(21, 43, '$');
  // Sporenhort hinter der Geheimwand
  put(30, 41, 'A'); put(30, 44, 'C'); put(27, 43, 'o'); put(33, 46, 'o'); put(34, 42, 'M'); put(26, 46, 'g');
  // Truhe im Pilzwald
  put(36, 24, 'C');

  return {
    name: 'Der Sporenschlund',
    kind: 'dungeon',
    biome: 'spore',
    map: m.rows(),
    decor: {
      M: 'giantMushroom', o: 'sporePod', P: 'fungalPillar', g: 'glowMoss', b: 'cocoonHusk', A: 'rotAltar',
    },
    points: { 1: 'start', 2: 'respawn' },
    enemies: {
      s: { type: 'sporeling' }, f: { type: 'fungal_brute' }, c: { type: 'spore_caster' },
      9: { type: 'rot_mother', boss: true },
    },
    respawn: Infinity,
    areas: [{ id: 'mother_nest', x: 46, y: 26, w: 12, h: 9 }],
    arena: { x: 38, y: 40, w: 22, h: 15, gateRow: 39 },
    secrets: [{ id: 'spore_hoard', lever: { x: 17, y: 39 } }],
    portals: [{
      id: 'to_blighted_marsh', x: 8.5, y: 3.2, range: 22,
      to: { zoneId: 'blighted_marsh', spawnId: 'from_spore_hollow' }, prompt: 'Zurück in die Faulmarsch',
    }],
  };
}

function buildRimeCaverns() {
  const W = 66, H = 58;
  const { m, room, hall, torches, put, rng } = dungeonBase(W, H, 3535);
  const cave = (cx, cy, rx, ry) => { m.ellipse(cx, cy, rx, ry, '.'); for (let i = 0; i < 4; i++) m.ellipse(cx + rng.range(-rx * 0.5, rx * 0.5), cy + rng.range(-ry * 0.5, ry * 0.5), rx * 0.5, ry * 0.5, '.'); };
  room(4, 4, 12, 8);                  // A Eingang
  cave(26, 9, 9, 5);                  // B Kristallgrotte
  room(4, 19, 14, 12);                // C Gefrorene Halle
  cave(30, 26, 8, 6);                 // D Eissee
  room(46, 5, 15, 13);                // E Ritterhalle
  cave(53, 30, 6, 4.4);               // F Vorhöhle (wyrm_lair)
  room(38, 40, 24, 15);               // G Hort des Frostwurms (Arena)
  hall(16, 7, 5, 3); hall(9, 12, 3, 7); hall(35, 8, 11, 3); hall(18, 24, 6, 3);
  hall(38, 27, 10, 3); hall(52, 18, 3, 8); hall(48, 34, 4, 6);
  // Eisgrotte (Nebenweg unter der Gefrorenen Halle) und verborgener Eishort
  m.path([[10, 30], [11, 34], [12, 37]], 2.2, '.');
  m.ellipse(12, 40, 6.4, 3.4, '.');
  m.rect(20, 40, 4, 2, '.');
  m.ellipse(28, 42, 5, 3.4, '.');
  torches(7);
  m.ellipse(30, 27, 4, 2.2, '~', ['.']);
  m.rect(4, 24, 2, 3, '~');

  put(9, 3, 'D'); put(10, 3, 'D'); put(9, 6, '1'); put(12, 6, '2');
  put(5, 5, 'I'); put(14, 5, 'I'); put(5, 10, 'K'); put(14, 10, 'n');
  // B
  each([[20, 7], [32, 7], [26, 12]], (x, y) => put(x, y, 'K'));
  each([[22, 9], [30, 9], [26, 7]], (x, y) => put(x, y, 'e'));
  put(28, 11, 's'); put(24, 11, 's');
  // C
  each([[6, 20], [15, 20], [6, 29], [15, 29]], (x, y) => put(x, y, 'I'));
  put(8, 23, 'F'); put(13, 26, 'F'); put(10, 25, 'q'); put(12, 21, 's'); put(7, 27, 'e'); put(15, 24, 'n');
  // D
  put(24, 22, 'K'); put(36, 30, 'K'); put(26, 30, 'e'); put(34, 22, 's'); put(36, 25, 's'); put(24, 26, 'u');
  // E
  each([[47, 6], [59, 6], [47, 16], [59, 16]], (x, y) => put(x, y, 'I'));
  put(50, 9, 'q'); put(56, 9, 'q'); put(53, 13, 'q'); put(49, 14, 'F'); put(57, 14, 'F'); put(53, 7, 'B'); put(59, 11, 'C');
  // F
  put(50, 28, 'K'); put(56, 28, 'K'); put(53, 31, 'e'); put(51, 32, 's');
  for (let x = 48; x <= 51; x++) put(x, 39, 'G');
  // G – Hort
  each([[41, 43], [58, 43], [41, 52], [58, 52]], (x, y) => put(x, y, 'I'));
  put(39, 41, 'B'); put(60, 41, 'B'); put(39, 53, 'B'); put(60, 53, 'B');
  put(50, 42, 'u'); put(50, 46, '9');
  // Eisgrotte: Truhe, Kristalle, Hebel an der Nordwand
  put(7, 41, 'C'); put(9, 38, 'K'); put(16, 42, 'K'); put(10, 43, 'w');
  put(19, 40, '$'); put(19, 41, '$');
  // Eishort hinter der Geheimwand: im Eis eingeschlossene Wächter
  put(28, 40, 'B'); put(28, 42, 'C'); put(25, 41, 'F'); put(31, 41, 'F'); put(30, 44, 'w'); put(26, 44, 'K');
  // Truhe in der Kristallgrotte
  put(33, 12, 'C');

  return {
    name: 'Die Reifhöhlen',
    kind: 'dungeon',
    biome: 'rime',
    map: m.rows(),
    decor: {
      I: 'iceColumn', K: 'crystalCluster', F: 'frozenWarrior', n: 'icicles', B: 'frostBrazier', u: 'frozenFall', w: 'snowPile',
    },
    points: { 1: 'start', 2: 'respawn' },
    enemies: {
      e: { type: 'ice_elemental' }, s: { type: 'crystal_spider' }, q: { type: 'frozen_knight' },
      9: { type: 'frost_wyrm', boss: true },
    },
    respawn: Infinity,
    areas: [{ id: 'wyrm_lair', x: 47, y: 26, w: 12, h: 9 }],
    arena: { x: 38, y: 40, w: 24, h: 15, gateRow: 39 },
    secrets: [{ id: 'rime_hoard', lever: { x: 14, y: 37 } }],
    traps: { '^': { kind: 'spike' } },
    trapDamage: 80,
    portals: [{
      id: 'to_frostspire', x: 9.5, y: 3.2, range: 22,
      to: { zoneId: 'frostspire', spawnId: 'from_rime_caverns' }, prompt: 'Zurück in die Frostzinnen',
    }],
  };
}

// Aschethron: monumentale Nord-Süd-Achse. Vorhof (Süden, Treppe) -> Säulenhalle
// mit Lavagräben und Brücke -> Halle des Wächters -> Thronsaal (Arena) im
// Norden, Thron an der Nordwand, Tor in der Südwand. Seitenflügel: Wachstube
// und Hundezwinger (West), Priesterhalle und Schatzkammer (Ost).
function buildAshenThrone() {
  const W = 68, H = 62;
  const { m, put } = dungeonBase(W, H, 4040);
  const R = (x, y, w, h, ch = '.') => m.rect(x, y, w, h, ch);

  const arena = { x: 21, y: 2, w: 26, h: 18 };
  R(arena.x, arena.y, arena.w, arena.h);  // G Thronsaal (sovereign_hall)
  R(32, 20, 4, 1);                        // Tordurchgang
  R(24, 21, 20, 9);                       // E Halle des Wächters
  R(31, 30, 6, 2);                        // Achse
  R(22, 32, 24, 16);                      // B Säulenhalle
  R(31, 48, 6, 4);                        // Achse
  R(24, 52, 20, 7);                       // A Vorhof
  R(4, 33, 14, 13); R(18, 38, 4, 3);      // C Wachstube + Tür
  R(4, 20, 14, 10); R(9, 30, 3, 3); R(18, 24, 6, 3);   // Hundezwinger + Gänge
  R(50, 33, 14, 13); R(46, 38, 4, 3);     // D Priesterhalle + Tür
  R(50, 20, 14, 10); R(56, 30, 3, 3); R(44, 24, 6, 3); // Schatzkammer + Gänge
  // Verborgene Schatzkammer über der Schatzkammer (Hebel an deren Nordwand)
  R(56, 15, 2, 4); R(50, 6, 13, 9);
  // Lavagräben (fest): Längsgräben der Säulenhalle, Quergraben mit Brücke,
  // Becken in der Wächterhalle und im Thronsaal
  R(25, 34, 2, 12, '~'); R(41, 34, 2, 12, '~');
  R(27, 39, 14, 2, '~'); R(31, 39, 6, 2, '.');
  R(26, 27, 3, 2, '~'); R(39, 27, 3, 2, '~');
  m.ellipse(25.5, 12, 1.6, 1.6, '~'); m.ellipse(42.5, 12, 1.6, 1.6, '~');
  wallTorches(m, 5, 2);

  put(27, 51, 'D'); put(28, 51, 'D'); put(27, 54, '1'); put(29, 54, '2');
  // A Vorhof: Statuen an der Achse, Glutbecken
  // (keine Wachen im Vorhof: Gegner stehen mind. 12 Kacheln vom Ankunftspunkt)
  put(30, 53, 'S'); put(37, 53, 'S'); put(25, 53, 'B'); put(42, 53, 'B'); put(42, 57, 'R'); put(25, 57, 'n');
  // B Säulenhalle: zwei Säulenreihen, Glutrisse im Boden
  each([[28, 33], [39, 33], [28, 36], [39, 36], [28, 43], [39, 43], [28, 46], [39, 46]], (x, y) => put(x, y, 'I'));
  each([[33, 44], [35, 35]], (x, y) => put(x, y, 'e'));
  put(23, 33, 'B'); put(44, 33, 'B'); put(23, 46, 'B'); put(44, 46, 'B');
  put(31, 36, 'g'); put(36, 36, 'g'); put(34, 33, 'p');
  // Brückenwache südlich des Quergrabens (aus dem Vorhof hierher verlegt)
  put(31, 42, 'g'); put(36, 42, 'g'); put(37, 44, 'g');
  // C Wachstube
  put(6, 34, 'R'); put(15, 34, 'R'); put(5, 44, 'B'); put(16, 44, 'k');
  put(8, 38, 'g'); put(13, 41, 'g'); put(10, 43, 'h');
  // Hundezwinger
  put(5, 21, 'k'); put(16, 21, 'k'); put(6, 27, 'x'); put(15, 26, 'x'); put(11, 22, 'x');
  put(8, 24, 'h'); put(13, 26, 'h');
  // D Priesterhalle
  put(51, 34, 'S'); put(62, 34, 'S'); put(54, 34, 'n'); put(59, 34, 'n'); put(51, 44, 'B'); put(62, 44, 'B');
  put(56, 40, 'e');
  put(53, 38, 'p'); put(60, 38, 'p'); put(57, 43, 'p');
  // Schatzkammer
  put(51, 21, 'B'); put(62, 21, 'B'); put(60, 23, 'C'); put(53, 27, 'R'); put(62, 27, 'k');
  put(57, 25, 'g');
  // Nebentruhen in Wachstube und Zwinger
  put(14, 45, 'C'); put(16, 28, 'C');
  // Verborgene Schatzkammer
  put(56, 19, '$'); put(57, 19, '$');
  put(56, 8, 'C'); put(51, 7, 'B'); put(61, 7, 'B'); put(53, 7, 'S'); put(59, 7, 'S'); put(52, 13, 'R'); put(60, 13, 'R');
  // E Halle des Wächters
  put(26, 22, 'S'); put(41, 22, 'S'); put(30, 22, 'n'); put(37, 22, 'n'); put(25, 28, 'B'); put(42, 28, 'B');
  put(34, 25, 'W');
  for (let x = 32; x <= 35; x++) put(x, 20, 'G');
  // G – Thronsaal
  each([[24, 5], [43, 5], [24, 16], [43, 16]], (x, y) => put(x, y, 'I'));
  put(22, 3, 'B'); put(45, 3, 'B'); put(22, 18, 'B'); put(45, 18, 'B');
  put(30, 6, 'n'); put(38, 6, 'n');
  put(34, 3, 'A'); put(34, 9, '9');
  each([[28, 3], [40, 3]], (x, y) => put(x, y, 'k'));
  // Druckplatten / Flammendüsen
  put(32, 49, '^'); put(35, 50, '^'); put(19, 39, '^'); put(48, 39, '^'); put(10, 31, '^');

  return {
    name: 'Der Aschethron',
    kind: 'dungeon',
    biome: 'throne',
    map: m.rows(),
    decor: {
      I: 'obsidianPillar', B: 'goldBrazier', S: 'ashStatue', k: 'chainHang', R: 'trophyRack', n: 'banner', A: 'throneDais',
      e: 'emberCrack',
    },
    points: { 1: 'start', 2: 'respawn' },
    enemies: {
      g: { type: 'throne_guard' }, p: { type: 'ash_priest' }, h: { type: 'ember_hellhound' }, W: { type: 'throne_sentinel' },
      9: { type: 'ash_sovereign', boss: true },
    },
    respawn: Infinity,
    areas: [{ id: 'sovereign_hall', ...arena }],
    arena: { ...arena, gateRow: 20 },
    traps: { '^': { kind: 'spike' } },
    trapDamage: 90,
    secrets: [{ id: 'throne_vault', lever: { x: 52, y: 20 } }],
    portals: [{
      id: 'to_ember_wastes', x: 27.5, y: 51.2, range: 22,
      to: { zoneId: 'ember_wastes', spawnId: 'from_ashen_throne' }, prompt: 'Zurück in die Glutöde',
    }],
  };
}

// Fertige Level-Definition um n Kachelzeilen nach unten schieben: oben n Zeilen
// massive Wand (fill) einfügen und alle Kachel-/Pixel-y-Koordinaten mitziehen.
// Marken im Raster (points/Spawns, Gegner, NPCs, Deko, Truhen, Tore, Fallen)
// wandern mit dem Raster; verschoben werden zusätzlich alle Objekte mit
// numerischem y (areas, arena, objects, portals, secrets[].lever, buildings,
// Lichter …), arena.gateRow, y0/y1 und Polylinien in fissures ([x, y]-Paare).
// Rückportale anderer Zonen zielen per spawnId auf Marken – unberührt.
// Gedacht für Arenen an der Kartenoberkante: so hat die Kamera Platz über dem
// Boss (sie ist auf die Karte begrenzt).
const SHIFT_SKIP = new Set(['map', 'decor', 'enemies', 'npcs', 'points', 'traps', 'to', 'dir', 'requires']);
export function shiftLevelDown(level, n, fill = '#') {
  if (!n) return level;
  const w = level.map[0].length;
  const pad = Array.from({ length: n }, () => fill.repeat(w));
  const seen = new WeakSet(); // geteilte Objekte nur einmal verschieben
  const walk = (o) => {
    if (!o || typeof o !== 'object' || seen.has(o)) return;
    seen.add(o);
    if (Array.isArray(o)) { o.forEach(walk); return; }
    for (const k of ['y', 'y0', 'y1', 'gateRow']) if (typeof o[k] === 'number') o[k] += n;
    for (const [k, v] of Object.entries(o)) {
      if (SHIFT_SKIP.has(k) || !v || typeof v !== 'object') continue;
      if (k === 'fissures') { for (const line of v) for (const p of line) p[1] += n; continue; }
      walk(v);
    }
  };
  walk(level);
  level.map = [...pad, ...level.map];
  return level;
}

// Ruhige Ankunft: kein (Nicht-Boss-)Gegner näher als r Kacheln an einem
// benannten Punkt (Start, Respawn, from_*). Zu nahe Marken wandern per
// Breitensuche über begehbaren Boden zur nächsten freien Stelle (3 × 3 Boden)
// außerhalb des Radius – bleiben also im selben Gelände, nur weiter weg.
// Gibt die Verschiebungen zurück (Prüfhilfe).
export const CALMED = [];
export function calmArrivals(id, level, r = 12) {
  const rows = level.map.map((row) => [...row]);
  const H = rows.length, W = rows[0].length;
  const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? rows[y][x] : '#');
  const walk = level.kind === 'outdoor' ? GROUND : new Set(['.']);
  const pts = [];
  rows.forEach((row, y) => row.forEach((ch, x) => { if (level.points?.[ch]) pts.push([x, y]); }));
  const far = (x, y) => pts.every(([px, py]) => Math.hypot(x - px, y - py) >= r);
  const free = (x, y) => { for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (!walk.has(at(x + i, y + j))) return false; return true; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = rows[y][x], e = level.enemies?.[ch];
    if (!e || e.boss || far(x, y)) continue;
    // Untergrund der Marke aus den Nachbarn
    const nb = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].filter((c) => walk.has(c));
    rows[y][x] = nb[0] ?? [...walk][0];
    const seen = new Set([y * W + x]), q = [[x, y]];
    let to = null;
    for (let k = 0; k < q.length && !to; k++) {
      const [cx, cy] = q[k];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy, key = ny * W + nx;
        if (seen.has(key) || !walk.has(at(nx, ny))) continue;
        seen.add(key); q.push([nx, ny]);
        if (far(nx, ny) && free(nx, ny)) { to = [nx, ny]; break; }
      }
    }
    if (!to) { rows[y][x] = ch; MISPLACED.push(`${id}:${ch}@${x},${y} (Ankunft)`); continue; }
    rows[to[1]][to[0]] = ch;
    CALMED.push(`${id}: ${e.type} ${x},${y} -> ${to[0]},${to[1]}`);
  }
  level.map = rows.map((row) => row.join(''));
  return level;
}

const RAW3 = {
  ashen_steppe: buildAshenSteppe(),
  howling_barrow: shiftLevelDown(buildHowlingBarrow(), 8),
  blighted_marsh: buildBlightedMarsh(),
  spore_hollow: buildSporeHollow(),
  frostspire: buildFrostspire(),
  rime_caverns: buildRimeCaverns(),
  ember_wastes: buildEmberWastes(),
  ashen_throne: shiftLevelDown(buildAshenThrone(), 8),
};
export const LEVELS3 = Object.fromEntries(Object.entries(RAW3).map(([id, L]) => [id, calmArrivals(id, L, 12)]));
