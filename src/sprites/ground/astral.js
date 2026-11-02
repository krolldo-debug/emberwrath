import { hash2 } from '../../core/math.js';
import { FK, ramp, hxi, D4 } from './kit.js';
import { outdoorGround } from './outdoor.js';
import { paintRamparts } from './ramparts.js';

// Feinraster-Boden der Sternenscherben (level.biome 'astral', Grundstimmung „Morgenschimmer“). Gras ruhig und hell
// (salbeigrün, weich gefleckt, vereinzelte Halme und Blütenblätter wie im Look-Entwurf), Wege aus lavendelgrauem
// Sternsand und Pflaster aus hellem Perlstein zeichnet der Shader der Glutsenke (ground/outdoor.js) mit eigener Palette.
// Neu: der Rand zum Abgrund (dunkle Kante, darüber eine Lichtkante) und die alten Lichtbrücken (schwebende Trittsteine,
// dazwischen der Himmel). Den Abgrund selbst und die Felswände unter den Inseln zeichnet world/Outdoor.js (#islandPixel).

const P_ASTRAL = {
  floor: ramp(['#22303e', '#2e434c', '#3d5a5a', '#507468', '#6c927c', '#97b896', '#b4d0a8']),
  lush: ramp(['#22303e', '#2a3c48', '#344c52', '#3d5a5a', '#466660']),
  worn: ramp(['#3a4450', '#46525a', '#536064', '#626e6e', '#727e78']),
  blade: ramp(['#2e434c', '#3d5a5a', '#507468', '#6c927c', '#97b896', '#c4dcb4']),
  dirt: ramp(['#2e2a40', '#3a3450', '#48425e', '#56506c', '#666080', '#787292', '#8c86a4', '#a29cb8']),
  stone: ramp(['#2a2840', '#3c3a54', '#4a4466', '#605a80', '#7c769c', '#9c97ba', '#c2bed8']),
  pave: ramp(['#3a3858', '#4a4868', '#625f86', '#807ea6', '#a4a2c6', '#cbc9e2', '#f0eefc']),
  mortar: hxi('#2a2840'),
  dust: ramp(['#3a3450', '#443e5a']),
  moss: ramp(['#2e434c', '#3d5a5a', '#466a5c', '#507468']),
  ash: ramp(['#22202c', '#2a2836', '#343240', '#3e3c4a', '#4a4856', '#565464']),
  heat: ramp(['#3a2a36', '#443040']),
  water: ramp(['#141838', '#1c2450', '#243064', '#2c3c78', '#3a4e92', '#5068ae', '#7088c8']),
  bank: ramp(['#2a2838', '#343044', '#3e3a50', '#48445c']),
};
// Splitterweiten (level.biome 'shards'): Glasmoos statt Gras (kühles Silberblau), Blüten werden Glassplitter
const P_SHARDS = {
  ...P_ASTRAL,
  floor: ramp(['#1c2434', '#263446', '#324658', '#40596c', '#587686', '#7e9ca8', '#a8c4cc']),
  lush: ramp(['#1c2434', '#222c3e', '#283648', '#30404e', '#384a58']),
  blade: ramp(['#263446', '#324658', '#40596c', '#587686', '#7e9ca8', '#c4dce4']),
  moss: ramp(['#263446', '#324658', '#3a5060', '#40596c']),
};
const EDGE = hxi('#100c1c');
// Trittsteine der Lichtbrücken: Perlstein, Oberkante hell, Unterseite dunkel mit kleinem Kiel
const SLAB = ramp(['#1e1c30', '#34324c', '#5a5878', '#8a88a8', '#c4c2dc', '#f0eefc']);
const V = FK.VOID, B = FK.BRIDGE, G0 = FK.GRASS, DI = FK.DIRT;
// Blüten im Gras: [Schatten, Blatt, Kern]; in den Splitterweiten Glassplitter (blau, weiß, flieder)
const BLOOM = [ramp(['#9a4474', '#eca0c0', '#ffd8ea']), ramp(['#2484a8', '#8cd8f0', '#e8fbff']), ramp(['#a08840', '#f0dc90', '#fff8d8'])];
const SHARD_BLOOM = [ramp(['#164660', '#5ccbea', '#e8fbff']), ramp(['#5a6a8a', '#c8d4ec', '#ffffff']), ramp(['#4a3a78', '#a890e0', '#ece4ff'])];
// Sternsand (Wege): hell, feinkörnig, Rand eine Stufe dunkler, einzelne funkelnde Körner
const SAND = ramp(['#4e4864', '#625c7a', '#78728e', '#8c86a2', '#a09ab6', '#b8b2cc']);
const GLINT = hxi('#f0eefc');
function sandFine(F, G, K, ki, KW, S) {
  const D = FK.DIRT;
  const e1 = K[ki - 1] !== D || K[ki + 1] !== D || K[ki - KW] !== D || K[ki + KW] !== D;
  const e2 = !e1 && (K[ki - 3] !== D || K[ki + 3] !== D || K[ki - 3 * KW] !== D || K[ki + 3 * KW] !== D);
  if (e1) return SAND[0];
  const h = hash2(F, G, 921);
  if (h > 0.997) return GLINT;
  // Kiesel (je 5 × 4-Feinzelle einer von zehn): Oberseite hell, Unterkante dunkel
  const cx = Math.floor(F / 5), cy = G >> 2, hc = hash2(cx, cy, 922);
  if (hc < 0.1) {
    const lx = F - cx * 5 - 1 - ((hc * 30) & 1), ly = G - (cy << 2) - 1;
    if (ly === 0 && lx >= 0 && lx < 2) return SAND[5];
    if (ly === 1 && lx >= 0 && lx < 2) return SAND[1];
  }
  let t = 0.42 + S.mot[S.wiFast(F, G)] * 0.4 + (h - 0.5) * 0.18 - (e2 ? 0.22 : 0);
  return SAND[Math.max(1, Math.min(4, Math.floor(t * 5 + D4[(G & 3) * 4 + (F & 3)] / 16)))];
}

// Teilgebiete mit eigenem Gras (level.groundZones: Ellipsen in Kacheln { x, y, rx, ry, pal }): Gras, Blüten und
// Blütenblätter je Gebiet, damit nicht jede Insel gleich aussieht. Der Rand verläuft wellig (Rauschfeld S.mot).
const ZONE = {
  // Wurzelbruch: von der Leere krankes Gras, violettgrau, dazwischen Leerenfunken
  blight: { floor: ramp(['#1e1828', '#282034', '#342a42', '#433652', '#564666', '#6e5a7e', '#8c769a']), bloom: [ramp(['#3a1a5a', '#9a6ad8', '#e8d4ff']), ramp(['#2a1640', '#6a3aa8', '#c8a0ff'])], petal: ['#6a3aa8', '#9a6ad8', '#c8a0ff'], at: 0.8 },
  // Hängende Terrassen: gepflegter Rasen in warmem Gold, Blüten gold und weiß
  golden: { floor: ramp(['#262a22', '#343a2c', '#464e36', '#5e6640', '#7a7e4a', '#9a985a', '#bab472']), bloom: [ramp(['#9a6a24', '#f6d888', '#fff8e0']), ramp(['#8a8aa0', '#f4f4ff', '#ffffff']), ramp(['#a04a2a', '#f0a070', '#ffe0c8'])], petal: ['#d8a440', '#f6d888', '#fff4c8'], at: 0.66 },
  // Mondweiher: kühles Mondmoos, blaugrün, Blüten silbern und hellblau
  moon: { floor: ramp(['#141c34', '#1a2842', '#223650', '#2c465e', '#3c5c72', '#567a8c', '#7a9caa']), bloom: [ramp(['#4a6a9a', '#b8d8f0', '#f0fbff']), ramp(['#2484a8', '#8cd8f0', '#e8fbff'])], petal: ['#86a8c8', '#b8d8f0', '#f0fbff'], at: 0.7 },
  // Funkenruh: staubiger Bernsteinboden der Schürfer
  amber: { floor: ramp(['#241c18', '#302620', '#40322a', '#544234', '#6a5440', '#84684e', '#a08060']), bloom: [ramp(['#7a2a0c', '#f08a2c', '#ffd890']), ramp(['#5a3a14', '#d8a440', '#fff4c8'])], petal: ['#c4501a', '#f08a2c', '#ffc060'], at: 0.82 },
  // Singende Grate: Reifglas, fast weiß
  frost: { floor: ramp(['#222c40', '#2e3a52', '#3e4c66', '#54647e', '#72849c', '#96a8bc', '#bccbda']), bloom: [ramp(['#5a7a9a', '#d8ecff', '#ffffff']), ramp(['#2484a8', '#b8f2ff', '#ffffff'])], petal: ['#b8d8f0', '#e8f4ff', '#ffffff'], at: 0.7 },
  // Sternwartenberg: Sternheide, violett und rosa
  heather: { floor: ramp(['#22182a', '#2e1e38', '#3e2848', '#52345a', '#6a446e', '#865a86', '#a678a2']), bloom: [ramp(['#6e2c56', '#e080b8', '#ffd8ea']), ramp(['#4a2a78', '#b48ae0', '#ece4ff'])], petal: ['#c86a98', '#e080b8', '#ffd8ea'], at: 0.62 },
};

function makeSetup(BASE) { return function* astralSetup(x0, y0, cw, ch, K, KW, M, world) {
  const S = yield* BASE.fineSetup(x0, y0, cw, ch, K, KW, M, world);
  // weiche Flecken im Gras (wie im Entwurf: groß und flach, darüber eine feinere Lage)
  S.mot = S.noise([[4, 22, 14, 901, 0.6], [2, 7, 4.5, 902, 0.4]]);
  // Blumeninseln im Gras (rosa, himmelblau, blassgelb je Fleck)
  S.flo = S.noise([[4, 26, 20, 907, 0.75], [2, 6, 6, 908, 0.25]]);
  // Teilgebiet je Weltpixel (0 = Grundgras)
  const Z = world?.level?.groundZones;
  if (Z?.length) {
    const zone = new Uint8Array(S.n), T = 16;
    S.zp = Z.map((z) => ZONE[z.pal]);
    for (let i = 0; i < S.n; i++) {
      const tx = (S.fx0 + (i % S.fw)) / T, ty = (S.fy0 + Math.floor(i / S.fw)) / T, lim = 1 + (S.mot[i] - 0.5) * 0.7;
      for (let k = 0; k < Z.length; k++) {
        const z = Z[k], dx = (tx - z.x) / z.rx, dy = (ty - z.y) / z.ry;
        if (dx * dx + dy * dy < lim) { zone[i] = k + 1; break; }
      }
    }
    S.zone = zone;
  }
  return S;
}; }

// Lichtbrücke: je Kachel (32 Feinpixel) ein Trittstein 26 × 18 Feinpixel, leicht versetzt, Ecken abgeschrägt, darunter
// eine dunkle Seite mit spitz zulaufendem Kiel. Rückgabe -2 = durchsichtig (der Abgrund darunter).
function bridgeFine(F, G) {
  const col = F >> 5, row = G >> 5, s = hash2(col, row, 611);
  const lx = (F & 31) - 3 - Math.floor(s * 3), ly = (G & 31) - 2 - Math.floor(hash2(col, row, 613) * 3);
  if (lx < 0 || lx >= 26 || ly < 0) return -2;
  const ex = Math.min(lx, 25 - lx);
  if (ly < 18) {
    const ey = Math.min(ly, 17 - ly);
    if (ex + ey < 3) return -2;
    if (ly === 0 || (ex + ey === 3 && ly < 9)) return SLAB[5];
    if (lx === 0 || ly === 1) return SLAB[s < 0.5 ? 4 : 5];
    if (ly === 17 || lx === 25) return SLAB[2];
    // Sternrune in jedem dritten Stein
    if (s > 0.66 && ((lx === 13 && ly >= 6 && ly <= 11) || (ly === 9 && lx >= 10 && lx <= 16))) return SLAB[5];
    return SLAB[hash2(F >> 2, G >> 2, 612) < 0.12 ? 3 : 4];
  }
  // Seite und Kiel
  const k = ly - 18;
  if (k < 3) return ex === 0 ? SLAB[1] : SLAB[2];
  if (ex >= (k - 2) * 3) return k < 6 ? SLAB[1] : SLAB[0];
  return -2;
}

function makeFine(P, bloom0, petal, bloomAt0) {
  const BASE = outdoorGround(P), GRASS0 = P.floor, PETAL0 = petal.map(hxi);
  for (const z of Object.values(ZONE)) z.PETAL ??= z.petal.map(hxi);
  return { BASE, fine: function astralFine(kind, F, G, K, ki, KW, S) {
  const zi = S.zone ? S.zone[S.wiFast(F, G)] : 0, Z = zi ? S.zp[zi - 1] : null;
  const GRASS = Z ? Z.floor : GRASS0, RIM = GRASS[5], RIM2 = GRASS[4];
  if (kind === B) return bridgeFine(F, G);
  if (kind === V) return -2;
  // Rand zum Abgrund: eine Feinzeile dunkle Kante, an der Oberkante zwei Zeilen Licht (Gras im Gegenlicht)
  if (K[ki - KW] === V || K[ki - 1] === V || K[ki + 1] === V) return EDGE;
  if (K[ki + KW] === V) return RIM;
  if (kind === DI) return sandFine(F, G, K, ki, KW, S);
  if (kind !== G0) return BASE.finePixel(kind, F, G, K, ki, KW, S);
  if (K[ki - 2 * KW] === V) return RIM;
  if (K[ki - 3 * KW] === V) return RIM2;
  // Gras: weich gefleckt, Dither auf Weltpixeln (ruhig wie im Entwurf), Halme und Blütenblätter vereinzelt
  const h = hash2(F, G, 905);
  if (h > 0.9986) return (Z ? Z.PETAL : PETAL0)[(F + G) % 3];
  if (h > 0.996 || hash2(F, G + 1, 905) > 0.996) return GRASS[5];
  const wi = S.wiFast(F, G), t = 0.2 + S.mot[wi] * 0.72;
  const x = F >> 1, y = G >> 1;
  // Blüten: in Blumeninseln je 4 × 4-Feinzelle höchstens eine (Kreuz aus hellem Kern und Blättern)
  const fl = S.flo[wi], bloomAt = Z ? Z.at : bloomAt0, bloom = Z ? Z.bloom : bloom0;
  if (fl > bloomAt) {
    const cx = F >> 2, cy = G >> 2, hc = hash2(cx, cy, 909);
    if (hc < (fl - bloomAt) * 2.6) {
      const bx = (cx << 2) + 1 + ((hc * 97) & 1), by = (cy << 2) + 1 + ((hc * 53) & 1), dx = F - bx, dy = G - by;
      const kind3 = Math.floor(hash2(Math.floor(F / 40), Math.floor(G / 40), 910) * bloom.length), BL = bloom[kind3];
      if (dx === 0 && dy === 0) return BL[2];
      if (Math.abs(dx) + Math.abs(dy) === 1) return dy === 1 ? BL[0] : BL[1];
      if (dx === 0 && dy === 2) return GRASS[2];
    }
  }
  return GRASS[Math.max(0, Math.min(5, Math.floor(t * 5 + D4[(y & 3) * 4 + (x & 3)] / 16)))];
} };
}

const ASTRAL = makeFine(P_ASTRAL, BLOOM, ['#c86a98', '#eca0c0', '#ffd8ea'], 0.74);
const SHARDS = makeFine(P_SHARDS, SHARD_BLOOM, ['#5ccbea', '#b8f2ff', '#ffffff'], 0.7);
export const FINE_ASTRAL = {
  // Weltpixel-Paletten (Qualität „Niedrig“, Übersichtskarte)
  grass: ['#2e434c', '#3d5a5a', '#507468', '#6c927c', '#6c927c', '#97b896'],
  dirt: ['#3a3450', '#48425e', '#56506c', '#666080', '#787292', '#8c86a4'],
  water: ['#1c2450', '#243064', '#2c3c78', '#3a4e92', '#5068ae'],
  tufts: false,
  finePixel: ASTRAL.fine,
  fineSetup: makeSetup(ASTRAL.BASE),
  fineTufts: false,
  // Stadtmauern, Terrassen und Treppen (nur mit level.paintedCliffs, siehe ramparts.js)
  paintCliffs: paintRamparts,
  // Felswände unter den Inseln (world/Outdoor.js #islandPixel): Wand oben hell (Morgenlicht von unten rosa),
  // Kiel dunkel, Kristalle leuchten
  island: {
    face: ramp(['#1c1834', '#28224a', '#352d5e', '#443a72', '#584a88', '#6e5c9e']),
    keel: ramp(['#141028', '#1e1838', '#2a2048', '#3a2c5c']),
    rim: hxi('#d8909a'),
    root: hxi('#342640'),
    crystal: [[22, 132, 168], [92, 203, 234], [184, 242, 255], [255, 255, 255]],
    edge: EDGE,
  },
};

// Splitterweiten: gleiche Inselkanten und Brücken, Boden kühl und gläsern, Felswände mit mehr Kristall
export const FINE_SHARDS = {
  ...FINE_ASTRAL,
  grass: ['#263446', '#324658', '#40596c', '#587686', '#587686', '#7e9ca8'],
  finePixel: SHARDS.fine,
  fineSetup: makeSetup(SHARDS.BASE),
  island: {
    ...FINE_ASTRAL.island,
    face: ramp(['#161a30', '#1e2444', '#283056', '#343e6a', '#444e80', '#586296']),
    rim: hxi('#8cc8e8'),
  },
};
