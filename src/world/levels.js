import { createRng } from '../core/math.js';

// Level-Layouts. Jede Zone hat ein Raster aus Zeichen (1 Zeichen = 16 px) und
// dazu Metadaten (benannte Punkte, Gegner, NPCs, Flächen, Portale, Gebäude).
// Die Raster werden hier einmalig und deterministisch per Bauplan erzeugt –
// das ist lesbarer und robuster als 60×50 handgetippte Zeichen.
// LEVELS.<key>.map ist danach ein ganz normales Array von Zeilen.
//
// Gemeinsame Legende (beide Umgebungen):
//   #  Wand / Fels (fest)
//   1..8  benannte Punkte (level.points)    9  Boss
//   Gegner-/NPC-Markierungen: level.enemies / level.npcs (Zeichen -> Definition)
// Dungeon:  .  Boden   T Wandfackel  b Banner  k Ketten  D Treppe (auf Wandfläche)
//           P Säule  B Feuerschale  c Kerzen  x Knochen  R Runenkreis  C Truhe
//           G Knochentor  W Spinnennetz  O Kokon  Z Sarkophag  Y Knochenthron
// Außen:    , Gras  . Pfad  : Pflaster  ~ Wasser  = Glutspalte  H Gebäudegrund
//           t Tanne  d toter Baum  r Fels  u Busch  f Zaun  g Grabstein
//           l Laterne  F Lagerfeuer  w Brunnen  c Kiste  S Wegweiser

export class MapBuilder {
  constructor(w, h, fill) {
    this.w = w; this.h = h;
    this.g = Array.from({ length: h }, () => Array(w).fill(fill));
  }
  in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { return this.in(x, y) ? this.g[y][x] : '#'; }
  set(x, y, ch) { if (this.in(x, y)) this.g[y][x] = ch; }
  rect(x, y, w, h, ch) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, ch); }
  ellipse(cx, cy, rx, ry, ch, only = null) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1 && (!only || only.includes(this.get(x, y)))) this.set(x, y, ch);
      }
    }
  }
  // Dicke Polylinie (Pfade, Spalten). width in Tiles.
  path(points, width, ch, only = null) {
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, ay] = points[i], [bx, by] = points[i + 1];
      const steps = Math.ceil(Math.hypot(bx - ax, by - ay) * 2);
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
        this.ellipse(x, y, width / 2, width / 2, ch, only);
      }
    }
  }
  rows() { return this.g.map((r) => r.join('')); }
}

// ---------------------------------------------------------------- Glutsenke
function buildEmberhollow() {
  const W = 64, H = 40;
  const m = new MapBuilder(W, H, ',');
  const rng = createRng(4242);

  // Felsrand mit unregelmäßiger Kante; im Norden höher (Klippe der Katakomben)
  for (let x = 0; x < W; x++) {
    const top = 2 + (rng.chance(0.35) ? 1 : 0) + (x >= 38 && x <= 58 ? 2 : 0);
    for (let y = 0; y < top; y++) m.set(x, y, '#');
    const bot = 1 + (rng.chance(0.4) ? 1 : 0);
    for (let y = H - bot; y < H; y++) m.set(x, y, '#');
  }
  for (let y = 0; y < H; y++) {
    const l = 1 + (rng.chance(0.4) ? 1 : 0), r = 1 + (rng.chance(0.4) ? 1 : 0);
    for (let x = 0; x < l; x++) m.set(x, y, '#');
    for (let x = W - r; x < W; x++) m.set(x, y, '#');
  }
  // Klippennase um das Tor, damit die Wand dort gerade verläuft
  m.rect(44, 0, 9, 5, '#');

  // Wasser und Wege
  m.ellipse(8, 32, 4.6, 2.6, '~');
  m.path([[20, 21], [20, 34]], 2, '.', [',']);
  m.path([[20, 21], [30, 22], [38, 20], [44, 13], [48, 6]], 2, '.', [',']);
  m.path([[38, 20], [44, 26], [48, 30]], 2, '.', [',']);
  m.path([[20, 21], [11, 24]], 2, '.', [',']);
  m.path([[20, 21], [21, 9]], 2, '.', [',']);
  m.ellipse(20, 21, 5.5, 3.6, ':', [',', '.']);
  m.ellipse(48, 7, 3.2, 1.8, ':', [',', '.']);
  // Glutspalten im Osten – der Name der Senke
  const fissures = [
    [[58, 6], [55, 13], [58, 21], [57, 24.5]],
    [[56.6, 29], [56, 30], [58, 35]],
    [[36, 36], [39, 34], [38, 31]],
  ];
  for (const f of fissures) m.path(f, 1, '=', [',']);
  // Ostausgang zum Aschenwald: Weg durch den Wald, Lücke in der Klippe
  m.rect(61, 23, 3, 5, ',');
  m.path([[48, 30], [56, 27], [63.5, 25]], 2, '.', [',', '=']);

  // Gebäude (Grundfläche fest, Sprite zeichnet Decor)
  m.rect(12, 14, 7, 3, 'H');
  m.rect(25, 15, 6, 3, 'H');

  // Zaun am Dorfrand (mit Lücke für den Weg)
  for (let x = 12; x <= 29; x++) if (x < 18 || x > 22) m.set(x, 29, 'f');
  for (let y = 25; y <= 28; y++) m.set(12, y, 'f');

  // Feste Deko
  const put = (x, y, ch) => m.set(x, y, ch);
  put(21, 22, 'w');
  [[15, 20], [26, 20], [18, 25], [31, 23], [42, 16], [22, 28]].forEach(([x, y]) => put(x, y, 'l'));
  put(9, 24, 'F');
  put(32, 20, 'S');
  [[32, 16], [32, 17], [24, 18]].forEach(([x, y]) => put(x, y, 'c'));
  // Friedhof vor den Katakomben
  for (const [x, y] of [[38, 7], [40, 7], [42, 7], [38, 9], [40, 9], [42, 10], [39, 11], [41, 12]]) put(x, y, 'g');

  // Benannte Punkte, NPCs, Gegner
  put(19, 24, '1'); // start
  put(11, 26, '2'); // respawn (am Lagerfeuer)
  put(48, 8, '3');  // from_catacombs
  put(60, 25, '4'); // from_ashwood
  put(8, 22, '5');  // from_trial (vor der Glutpforte)
  put(15, 18, 'M'); // Maren vor der Halle
  put(27, 19, 'N'); // Brom vor der Schmiede
  // Aschewölfe: drei Rudel in Lichtungen des Südostwalds
  // (v = Aschewolf, A = Rudelführer; w ist schon der Brunnen)
  [[46, 29], [49, 30], [47, 32]].forEach(([x, y]) => put(x, y, 'v'));
  [[40, 33], [42, 34]].forEach(([x, y]) => put(x, y, 'v'));
  [[52, 34], [50, 36], [54, 36]].forEach(([x, y], i) => put(x, y, i === 0 ? 'A' : 'v'));
  [[33, 11], [35, 12]].forEach(([x, y]) => put(x, y, 'v'));

  // Bäume und Kleinzeug: dichter Wald im Südosten und Nordwesten,
  // Lichtungen und Wege bleiben frei.
  const clear = [[47, 30, 3.6], [41, 33, 2.6], [55, 28, 3.2], [34, 12, 2.6], [20, 21, 7], [11, 25, 3.5], [48, 8, 4], [8, 32, 5.6], [61, 25, 2.5], [8, 20.5, 2.6]];
  const free = (x, y, r = 1) => {
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (m.get(x + i, y + j) !== ',') return false;
    return true;
  };
  for (let y = 2; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (m.get(x, y) !== ',') continue;
      if (clear.some(([cx, cy, r]) => Math.hypot(x - cx, y - cy) < r)) continue;
      const forestSE = x > 33 && y > 23;
      const forestNW = x < 11 && y < 16;
      const forestN = y < 8 && x < 36;
      const edge = x < 4 || x > W - 5 || y > H - 4;
      let pTree = forestSE || forestNW ? 0.3 : forestN || edge ? 0.2 : 0.035;
      if (x > 10 && x < 34 && y > 11 && y < 30) pTree = 0.0; // Dorf
      const nb = free(x, y, 1);
      if (nb && rng.chance(pTree)) { m.set(x, y, rng.chance(forestSE ? 0.25 : 0.4) ? 'd' : 't'); continue; }
      if (rng.chance(0.018)) m.set(x, y, 'r');
      else if (rng.chance(0.025) && !(x > 10 && x < 34 && y > 11 && y < 30)) m.set(x, y, 'u');
    }
  }

  return {
    name: 'Glutsenke',
    kind: 'outdoor',
    map: m.rows(),
    points: { 1: 'start', 2: 'respawn', 3: 'from_catacombs', 4: 'from_ashwood', 5: 'from_trial' },
    npcs: { M: 'elder_maren', N: 'smith_brom' },
    enemies: { v: { type: 'wolf' }, A: { type: 'wolf_alpha' } },
    respawn: 32,
    fissures,
    buildings: [
      { kind: 'hall', x: 12, y: 14, w: 7, h: 3 },
      { kind: 'smithy', x: 25, y: 15, w: 6, h: 3 },
    ],
    cryptGate: { x: 48, y: 4 }, // Tile der Wandfläche, Mitte des Tors
    areas: [{ id: 'catacombs_gate', x: 44, y: 5, w: 9, h: 5 }],
    objects: [
      { id: 'village_chest', kind: 'bank', set: 'village', decor: 'bankChest', prompt: 'Gemeinschaftstruhe öffnen', x: 20, y: 17 },
      { id: 'appearance_mirror', kind: 'mirror', set: 'village', decor: 'mirror', prompt: 'Aussehen ändern', x: 31, y: 19 },
      { id: 'trial_portal', kind: 'trial', set: 'village', decor: 'emberGate', prompt: 'Glutpforte: Glutprüfungen (ab Stufe 20)', x: 8, y: 20 },
    ],
    portals: [{
      id: 'to_catacombs', x: 48, y: 5.2, range: 26,
      to: { zoneId: 'catacombs', spawnId: 'start' },
      prompt: 'Die Katakomben betreten',
    }, {
      id: 'to_ashwood', x: 63.2, y: 25, range: 26, visual: 'road', dir: [1, 0], requires: { level: 6 },
      to: { zoneId: 'ashwood', spawnId: 'from_emberhollow' },
      prompt: 'Ostwärts in den Aschenwald',
    }],
  };
}

// ---------------------------------------------------------------- Katakomben
function buildCatacombs() {
  const W = 60, H = 50;
  const m = new MapBuilder(W, H, '#');
  const rooms = [];
  const room = (x, y, w, h) => { m.rect(x, y, w, h, '.'); rooms.push({ x, y, w, h }); };
  const hall = (x, y, w, h) => m.rect(x, y, w, h, '.');

  room(3, 4, 12, 8);    // A Eingangsgruft
  room(22, 4, 16, 10);  // B Knochenhalle
  room(3, 20, 14, 12);  // C Spinnennest
  room(22, 20, 17, 11); // D Grabkammer
  room(45, 20, 8, 10);  // E Vorkammer
  room(40, 35, 18, 13); // F Thronsaal (Boss)
  hall(15, 7, 7, 3);    // A -> B
  hall(7, 12, 3, 8);    // A -> C
  hall(29, 14, 3, 6);   // B -> D
  hall(17, 25, 5, 3);   // C -> D
  hall(39, 24, 6, 3);   // D -> E
  hall(47, 30, 4, 5);   // E -> F (Knochentor)

  // Wanddeko auf den oberen Wänden jedes Raums
  const rng = createRng(77);
  for (const r of rooms) {
    for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
      const y = r.y - 1;
      if (m.get(x, y) !== '#' || m.get(x, y + 1) !== '.') continue;
      const k = (x - r.x) % 4;
      if (k === 1) m.set(x, y, 'T');
      else if (k === 3 && rng.chance(0.5)) m.set(x, y, rng.chance(0.5) ? 'b' : 'k');
    }
  }
  const put = (x, y, ch) => m.set(x, y, ch);
  // A – Eingangsgruft: Treppe nach oben, ruhig
  put(8, 3, 'D'); put(9, 3, 'D');
  put(8, 6, '1'); put(11, 6, '2');
  put(4, 5, 'c'); put(13, 10, 'x'); put(4, 10, 'B');
  // B – Knochenhalle
  [[25, 7], [34, 7], [25, 11], [34, 11]].forEach(([x, y]) => put(x, y, 'P'));
  put(23, 5, 'B'); put(36, 12, 'B');
  put(29, 6, 's'); put(31, 10, 's'); put(27, 9, 'z'); put(33, 9, 'z'); put(36, 5, 'a');
  put(30, 12, 'x'); put(23, 12, 'x'); put(35, 5, 'c');
  // C – Spinnennest
  put(4, 21, 'W'); put(15, 21, 'W'); put(15, 31, 'W'); put(10, 21, 'W');
  put(5, 23, 'O'); put(14, 30, 'O'); put(7, 30, 'O'); put(13, 22, 'O');
  put(7, 24, 'p'); put(12, 24, 'p'); put(10, 28, 'p'); put(14, 26, 'p'); put(5, 27, 'p');
  put(4, 30, 'C'); put(9, 26, 'x');
  // D – Grabkammer
  [[25, 22], [28, 22], [32, 22], [35, 22]].forEach(([x, y]) => put(x, y, 'Z'));
  put(24, 28, 'a'); put(36, 28, 'a'); put(29, 26, 's'); put(32, 27, 's'); put(26, 25, 'z');
  put(37, 21, 'C'); put(23, 21, 'c'); put(30, 29, 'c'); put(38, 29, 'x');
  // E – Vorkammer (boss_hall)
  put(46, 21, 'B'); put(51, 21, 'B'); put(46, 27, 'z'); put(51, 25, 'z'); put(48, 24, 'x');
  // Knochentor am Übergang zum Thronsaal
  for (let x = 47; x <= 50; x++) put(x, 34, 'G');
  // F – Thronsaal
  [[43, 38], [54, 38], [43, 44], [54, 44]].forEach(([x, y]) => put(x, y, 'P'));
  put(41, 36, 'B'); put(56, 36, 'B'); put(41, 46, 'B'); put(56, 46, 'B');
  put(48, 36, 'Y'); put(48, 39, '9'); put(49, 42, 'R');
  put(45, 46, 'x'); put(52, 36, 'x'); put(44, 41, 'c'); put(53, 41, 'c');
  // Verborgene Gruft südlich der Grabkammer (Hebel an der Nordwand von D)
  m.rect(22, 37, 11, 7, '.'); m.rect(26, 31, 2, 6, '.');
  put(26, 31, '$'); put(27, 31, '$');
  put(23, 36, 'T'); put(31, 36, 'T');
  put(27, 40, 'C'); put(23, 38, 'c'); put(31, 38, 'c'); put(30, 42, 'x'); put(24, 42, 'x');
  put(24, 40, 'z'); put(30, 40, 'z');
  // Druckplatten
  put(18, 8, '^'); put(20, 7, '^'); put(26, 34, '^'); put(27, 35, '^'); put(19, 26, '^'); put(9, 15, '^');

  return {
    name: 'Die Katakomben',
    kind: 'dungeon',
    map: m.rows(),
    points: { 1: 'start', 2: 'respawn' },
    enemies: {
      s: { type: 'skeleton' },
      z: { type: 'skeleton', dormant: true },
      a: { type: 'archer' },
      p: { type: 'spider', ambush: true },
      9: { type: 'bonelord', boss: true },
    },
    respawn: Infinity, // Instanz: besiegte Gegner bleiben liegen
    areas: [{ id: 'boss_hall', x: 45, y: 20, w: 8, h: 10 }],
    arena: { x: 40, y: 35, w: 18, h: 13, gateRow: 34 },
    traps: { '^': { kind: 'spike' } },
    trapDamage: 14,
    secrets: [{ id: 'catacombs_crypt', lever: { x: 33, y: 20 } }],
    portals: [{
      id: 'to_emberhollow', x: 8.5, y: 4.2, range: 22,
      to: { zoneId: 'emberhollow', spawnId: 'from_catacombs' },
      prompt: 'Zur Glutsenke hinaufsteigen',
    }],
  };
}

export const LEVELS = {
  emberhollow: buildEmberhollow(),
  catacombs: buildCatacombs(),
};
