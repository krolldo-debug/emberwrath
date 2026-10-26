import { dungeonBase } from '../levels2.js';

// wie mapkit.each, mit Zähler (abwechselnde Gegnerarten)
const each = (list, fn) => list.forEach(([x, y], i) => fn(x, y, i));

// Dungeons der Sternenscherben, Teil 1 (Stufe 42–50). Aufbau wie levels3.js (dungeonBase: Räume, Gänge, Wandleuchter
// auf den Nordwänden). Wanddeko liegt auf Mauerzeichen (T Leuchter, b Banner, k hängende Wurzeln), damit die Mauer fest
// bleibt; Bodendeko über level.decor. Jeder Dungeon: Treppe zurück (D), Arena mit Tor (G, gateRow), ein verborgener
// Raum hinter einer Geheimwand ($, Hebel), Truhen (C), Boss-Marke 9.

// ---------------------------------------------------------------- Rankengruft (42–44)
// Gruft unter König Aurels Gartenterrassen. Vorhalle der Gärtner -> Teichhalle (Seerosenteich) -> Orangerie ->
// Gruftreihen (überwachsene Särge) -> Herzgarten (Arena, Ysgarns Herzknospe). Seitenweg: Wurzelkammer mit
// verborgener Samenkammer.
export function buildRankengruft() {
  const W = 64, H = 56;
  const { m, room, hall, torches, put } = dungeonBase(W, H, 4242);
  room(4, 4, 14, 9);                   // A Vorhalle der Gärtner
  room(24, 3, 24, 14);                 // B Teichhalle
  room(53, 4, 8, 15);                  // F Orangerie
  room(34, 24, 27, 10);                // C Gruftreihen
  room(14, 39, 32, 14);                // G Herzgarten (Arena)
  room(3, 21, 13, 12);                 // D Wurzelkammer
  hall(18, 7, 6, 3); hall(48, 8, 5, 3); hall(55, 19, 3, 5); hall(40, 34, 3, 5);
  hall(9, 13, 3, 8);
  // Verborgene Samenkammer östlich der Wurzelkammer
  m.rect(20, 24, 9, 7, '.');
  for (let y = 26; y <= 28; y++) { put(16, y, '$'); put(17, y, '$'); put(18, y, '$'); put(19, y, '$'); }
  torches(6);
  // Seerosenteich, Wasserrinne in der Orangerie
  m.ellipse(36, 10, 7, 3.4, '~', ['.']);
  m.rect(56, 6, 2, 5, '~');

  // A
  put(10, 3, 'D'); put(11, 3, 'D'); put(10, 6, '1'); put(13, 6, '2');
  put(5, 5, 'I'); put(16, 5, 'I'); put(5, 11, 'U'); put(16, 11, 'U'); put(6, 8, 'o');
  // B Teichhalle: Säulen ums Wasser, Leuchtblüten am Ufer
  each([[26, 5], [46, 5], [26, 15], [46, 15]], (x, y) => put(x, y, 'I'));
  each([[29, 7], [43, 7], [30, 14], [42, 13]], (x, y) => put(x, y, 'L'));
  put(36, 15, 'S'); put(25, 10, 'q'); put(47, 11, 'q');
  each([[30, 4], [40, 4], [31, 12], [41, 12], [36, 6]], (x, y, i) => put(x, y, i % 2 ? 'v' : 'w'));
  put(28, 10, 'r'); put(44, 10, 'r');
  // F Orangerie: Urnen, Wächter
  put(54, 5, 'U'); put(60, 5, 'U'); put(54, 17, 'L'); put(60, 15, 'L'); put(59, 12, 'q');
  put(58, 9, 'g'); put(54, 12, 's'); put(60, 9, 's');
  put(59, 17, 'C');
  // C Gruftreihen: zwei Reihen Särge, Dornenpriesterinnen
  each([[37, 26], [43, 26], [49, 26], [55, 26], [37, 31], [43, 31], [49, 31], [55, 31]], (x, y) => put(x, y, 'K'));
  put(35, 28, 'H'); put(60, 30, 'H'); put(59, 25, 'y');
  each([[40, 28], [46, 29], [52, 28], [58, 28]], (x, y, i) => put(x, y, i % 2 ? 'p' : 'r'));
  put(46, 25, 'v'); put(52, 32, 'w');
  for (let x = 40; x <= 42; x++) put(x, 38, 'G');
  // D Wurzelkammer
  put(4, 22, 'o'); put(14, 31, 'o'); put(5, 30, 'H'); put(13, 23, 'X'); put(8, 26, 'L');
  put(6, 24, 'r'); put(12, 28, 'r'); put(9, 30, 'v');
  // Samenkammer: Truhe, Statue, Leuchtblüten, eingeschlafener Wächter
  put(27, 25, 'C'); put(21, 25, 'S'); put(24, 29, 'L'); put(28, 29, 'X'); put(23, 27, 'g');
  // G Herzgarten: Herzknospe im Norden, Säulenkranz, Dornendickicht
  put(30, 41, 'Q');
  each([[16, 41], [43, 41], [16, 51], [43, 51]], (x, y) => put(x, y, 'I'));
  each([[20, 44], [39, 44], [22, 50], [37, 50]], (x, y) => put(x, y, 'L'));
  put(15, 46, 'H'); put(44, 46, 'H');
  put(30, 47, '9');
  each([[7, 20], [13, 20], [39, 23], [51, 23], [25, 38], [31, 38]], (x, y) => put(x, y, 'k'));

  return {
    name: 'Die Rankengruft',
    kind: 'dungeon',
    biome: 'thorn',
    map: m.rows(),
    decor: {
      T: 'sconce', k: 'hangingRoots',
      I: 'thornPillar', U: 'bloomUrn', L: 'lampFlower', K: 'seedCoffin', H: 'thornThicket', Q: 'heartBud',
      o: 'roots', q: 'roseRocks', y: 'ruinPillars', S: 'aurelStatue', X: 'crystals',
    },
    points: { 1: 'start', 2: 'respawn' },
    enemies: {
      r: { type: 'rootbound' }, v: { type: 'vine_horror' }, w: { type: 'void_wisp' }, p: { type: 'thorn_priest' },
      s: { type: 'bloom_stalker' }, g: { type: 'garden_golem' },
      9: { type: 'ysgarn', boss: true },
    },
    respawn: Infinity,
    areas: [{ id: 'gruft_teich', x: 24, y: 3, w: 24, h: 14 }, { id: 'gruft_reihen', x: 34, y: 24, w: 27, h: 10 }],
    arena: { x: 14, y: 39, w: 32, h: 14, gateRow: 38 },
    secrets: [{ id: 'seed_chamber', lever: { x: 14, y: 22 } }],
    portals: [{
      id: 'to_drifting_gardens', x: 10.5, y: 3.2, range: 22,
      to: { zoneId: 'drifting_gardens', spawnId: 'from_rankengruft' }, prompt: 'Zurück in die Treibenden Gärten',
    }],
  };
}

// ---------------------------------------------------------------- Gläserne Hallen (46–48)
// Palast des Splitterfürsten. Vorhof -> Halle der Gefangenen (Menschen in Glas) -> Spiegelgalerie zwischen zwei
// Abgründen -> Prismensaal -> Abgrundsaal mit Glasbrücke -> Thronsaal (Arena, Splitterthron). Verborgen: Schatzkammer
// unter dem Prismensaal.
export function buildGlassHalls() {
  const W = 66, H = 60;
  const { m, room, hall, torches, put } = dungeonBase(W, H, 4646);
  room(4, 4, 14, 9);                   // A Vorhof
  room(22, 3, 20, 13);                 // B Halle der Gefangenen
  room(46, 3, 16, 24);                 // C Spiegelgalerie
  room(40, 32, 22, 12);                // D Prismensaal
  room(4, 24, 26, 15);                 // E Abgrundsaal
  room(6, 45, 34, 12);                 // F Thronsaal (Arena)
  hall(18, 7, 4, 3); hall(42, 8, 4, 3); hall(52, 27, 3, 5); hall(30, 36, 10, 3); hall(16, 39, 3, 6);
  // Schatzkammer unter dem Prismensaal
  m.rect(42, 47, 12, 7, '.');
  for (let x = 46; x <= 48; x++) { put(x, 44, '$'); put(x, 45, '$'); put(x, 46, '$'); }
  torches(6);
  // Abgründe: Galerie zwischen zwei Spalten, Becken im Prismensaal, Abgrund mit Brücke
  m.rect(46, 12, 2, 12, '~'); m.rect(60, 6, 2, 18, '~');
  m.ellipse(51, 38, 5, 2.4, '~');
  m.ellipse(17, 31, 10.5, 5.2, '~');
  m.rect(6, 30, 24, 3, '.');

  // A
  put(10, 3, 'D'); put(11, 3, 'D'); put(10, 6, '1'); put(13, 6, '2');
  put(5, 5, 'I'); put(16, 5, 'I'); put(5, 11, 'L'); put(16, 11, 'L'); put(8, 10, 'o');
  // B Halle der Gefangenen: zwei Reihen Gläserner Gefangener, einige erwachen
  each([[24, 5], [29, 5], [34, 5], [39, 5], [24, 13], [29, 13], [34, 13], [39, 13]], (x, y) => put(x, y, 'F'));
  each([[27, 9], [32, 8], [37, 10]], (x, y) => put(x, y, 's'));
  put(32, 11, 'e'); put(41, 9, 'X'); put(23, 9, 'X');
  // C Spiegelgalerie
  each([[50, 6], [57, 6], [50, 12], [57, 12], [50, 18], [57, 18]], (x, y) => put(x, y, 'M'));
  each([[53, 9], [54, 15], [53, 21]], (x, y, i) => put(x, y, i % 2 ? 'e' : 'f'));
  put(55, 24, 'a'); put(52, 24, 'a'); put(54, 4, 'L'); put(61, 25, 'C');
  // D Prismensaal: Prismenlampen ums Becken
  each([[45, 35], [57, 35], [45, 41], [57, 41]], (x, y) => put(x, y, 'L'));
  put(41, 33, 'I'); put(60, 33, 'I'); put(41, 42, 'V'); put(60, 42, 'V');
  each([[48, 34], [55, 40], [44, 38]], (x, y, i) => put(x, y, i === 2 ? 'e' : 'f'));
  put(58, 38, 'a');
  // E Abgrundsaal: Brücke mit Krabblern, Kristalle am Rand
  each([[11, 31], [17, 31], [23, 31]], (x, y) => put(x, y, 'a'));
  put(5, 25, 'o'); put(28, 25, 'o'); put(5, 37, 'X'); put(28, 37, 'V'); put(26, 36, 's'); put(8, 36, 'f');
  put(7, 26, 'F'); put(25, 26, 'F');
  for (let x = 16; x <= 18; x++) put(x, 44, 'G');
  // Schatzkammer
  put(47, 52, 'C'); put(43, 48, 'F'); put(52, 48, 'F'); put(44, 52, 'o'); put(51, 52, 'X'); put(47, 49, 'e');
  // F Thronsaal: Splitterthron im Norden, Säulen, Gefangene als Zeugen
  put(26, 46, 'Q');
  each([[8, 47], [37, 47], [8, 55], [37, 55]], (x, y) => put(x, y, 'I'));
  each([[12, 50], [33, 50]], (x, y) => put(x, y, 'L'));
  put(7, 51, 'F'); put(38, 51, 'F');
  put(23, 51, '9');

  return {
    name: 'Die Gläsernen Hallen',
    kind: 'dungeon',
    biome: 'glass',
    map: m.rows(),
    decor: {
      T: 'sconce', b: 'glassBanner',
      I: 'glassPillar', F: 'glassPrisoner', L: 'prismLamp', Q: 'splinterThrone', M: 'mirrorStones', o: 'shardRocks',
      X: 'crystals', V: 'shardSpire',
    },
    points: { 1: 'start', 2: 'respawn' },
    enemies: {
      s: { type: 'statue_wraith' }, e: { type: 'glass_sentinel' }, f: { type: 'prism_elemental' }, a: { type: 'shard_crawler' },
      9: { type: 'kaldris', boss: true },
    },
    respawn: Infinity,
    areas: [{ id: 'hall_prisoners', x: 22, y: 3, w: 20, h: 13 }, { id: 'hall_mirrors', x: 46, y: 3, w: 16, h: 24 }],
    arena: { x: 6, y: 45, w: 34, h: 12, gateRow: 44 },
    secrets: [{ id: 'shard_vault', lever: { x: 60, y: 43 } }],
    portals: [{
      id: 'to_splitterweiten', x: 10.5, y: 3.2, range: 22,
      to: { zoneId: 'splitterweiten', spawnId: 'from_glass_halls' }, prompt: 'Zurück in die Splitterweiten',
    }],
  };
}

// ---------------------------------------------------------------- Sternwarte (49–50)
// Die alte Sternwarte, Sitz Königin Ysmeines. Eingangshalle -> Bibliothek -> Kartenraum -> Planetarium ->
// Fernrohrgalerie (zur offenen Seite hin der Himmel) -> Kuppelsaal (Arena, Sternpodest). Verborgen: Archiv hinter
// der Bibliothek.
export function buildObservatory() {
  const W = 64, H = 58;
  const { m, room, hall, torches, put } = dungeonBase(W, H, 4949);
  room(4, 4, 12, 9);                   // A Eingangshalle
  room(21, 3, 22, 12);                 // B Bibliothek
  room(48, 3, 12, 12);                 // C Kartenraum
  room(40, 21, 20, 14);                // D Planetarium
  room(4, 18, 24, 14);                 // E Fernrohrgalerie
  room(4, 39, 36, 16);                 // F Kuppelsaal (Arena)
  hall(16, 7, 5, 3); hall(43, 7, 5, 3); hall(52, 15, 3, 6); hall(28, 26, 12, 3); hall(14, 32, 3, 7);
  // Verborgenes Archiv südlich der Bibliothek
  m.rect(30, 18, 8, 5, '.');
  for (let y = 15; y <= 17; y++) { put(32, y, '$'); put(33, y, '$'); }
  torches(6);
  // Offener Himmel: Westseite der Galerie, Ecken des Planetariums
  m.rect(4, 19, 2, 12, '~');
  each([[41, 22], [58, 22], [41, 33], [58, 33]], (x, y) => { put(x, y, '~'); put(x + (x < 50 ? 1 : -1), y, '~'); });

  // A
  put(9, 3, 'D'); put(10, 3, 'D'); put(9, 6, '1'); put(12, 6, '2');
  put(5, 5, 'U'); put(14, 5, 'U'); put(5, 11, 'S'); put(14, 11, 'S');
  // B Bibliothek: Regale an der Nordwand und in Reihen
  each([[24, 4], [30, 4], [36, 4], [41, 4]], (x, y) => put(x, y, 'N'));
  each([[25, 9], [31, 9], [37, 9]], (x, y) => put(x, y, 'N'));
  put(22, 13, 'K'); put(41, 13, 'U');
  each([[28, 7], [34, 7], [28, 12], [38, 12]], (x, y, i) => put(x, y, i % 2 ? 'r' : 't'));
  // C Kartenraum
  put(51, 6, 'K'); put(57, 6, 'K'); put(54, 10, 'U'); put(49, 13, 'M'); put(58, 13, 'C');
  put(51, 9, 't'); put(57, 10, 'h'); put(54, 13, 'h');
  // D Planetarium: Planetenmodell in der Mitte, Wächter
  put(50, 29, 'Q');
  each([[44, 25], [56, 25], [44, 31], [56, 31]], (x, y) => put(x, y, 'L'));
  each([[46, 28], [54, 28], [50, 24], [50, 33]], (x, y, i) => put(x, y, i < 2 ? 'e' : i === 2 ? 't' : 'r'));
  // E Fernrohrgalerie: Fernrohre zur offenen Seite
  each([[9, 21], [9, 26], [9, 30]], (x, y) => put(x, y, 'E'));
  put(26, 19, 'N'); put(26, 30, 'M'); put(18, 19, 'U');
  each([[14, 22], [18, 26], [22, 23], [15, 29]], (x, y, i) => put(x, y, i % 2 ? 'h' : 'r'));
  put(23, 30, 't');
  for (let x = 14; x <= 16; x++) put(x, 38, 'G');
  // Archiv: Truhe, Globus, Kartentisch
  put(36, 19, 'C'); put(31, 19, 'U'); put(34, 21, 'K'); put(31, 21, 'X');
  // F Kuppelsaal: Sternpodest in der Mitte, Lampen, Kristalle
  put(22, 47, 'A');
  each([[6, 41], [37, 41], [6, 53], [37, 53]], (x, y) => put(x, y, 'X'));
  each([[11, 44], [33, 44], [11, 51], [33, 51]], (x, y) => put(x, y, 'S'));
  put(22, 46, '9');

  return {
    name: 'Die Sternwarte',
    kind: 'dungeon',
    biome: 'vault',
    map: m.rows(),
    decor: {
      T: 'sconce', b: 'starBanner',
      N: 'bookshelf', Q: 'orrery', E: 'telescope', U: 'starGlobe', K: 'chartDesk', A: 'queenDais', L: 'lensStand',
      M: 'crateStack', X: 'crystals', S: 'starLamp',
    },
    points: { 1: 'start', 2: 'respawn' },
    enemies: {
      r: { type: 'shadow_ranger' }, t: { type: 'star_seer' }, h: { type: 'void_hound' }, e: { type: 'glass_sentinel' },
      9: { type: 'ysmeine', boss: true },
    },
    respawn: Infinity,
    areas: [{ id: 'obs_library', x: 21, y: 3, w: 22, h: 12 }, { id: 'obs_planetarium', x: 40, y: 21, w: 20, h: 14 }],
    arena: { x: 4, y: 39, w: 36, h: 16, gateRow: 38 },
    secrets: [{ id: 'star_archive', lever: { x: 42, y: 12 } }],
    portals: [{
      id: 'to_splitterweiten', x: 9.5, y: 3.2, range: 22,
      to: { zoneId: 'splitterweiten', spawnId: 'from_observatory' }, prompt: 'Zurück in die Splitterweiten',
    }],
  };
}
