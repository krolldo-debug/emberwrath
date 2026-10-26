import { hash2 } from '../../core/math.js';
import { FK, ramp, hxi, D4 } from './kit.js';
import { outdoorGround } from './outdoor.js';

// Feinraster-Boden der Sternenscherben (level.biome 'astral', Grundstimmung „Morgenschimmer“). Gras ruhig und hell
// (salbeigrün, weich gefleckt, vereinzelte Halme und Blütenblätter wie im Look-Entwurf), Wege aus lavendelgrauem
// Sternsand und Pflaster aus hellem Perlstein zeichnet der Shader der Glutsenke (ground/outdoor.js) mit eigener Palette.
// Neu: der Rand zum Abgrund (dunkle Kante, darüber eine Lichtkante) und die Lichtbrücken (schwebende Trittsteine,
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
const BASE = outdoorGround(P_ASTRAL);
const GRASS = P_ASTRAL.floor, PETAL = [hxi('#c86a98'), hxi('#eca0c0'), hxi('#ffd8ea')];
const EDGE = hxi('#100c1c'), RIM = GRASS[5], RIM2 = GRASS[4];
// Trittsteine der Lichtbrücken: Perlstein, Oberkante hell, Unterseite dunkel mit kleinem Kiel
const SLAB = ramp(['#1e1c30', '#34324c', '#5a5878', '#8a88a8', '#c4c2dc', '#f0eefc']);
const V = FK.VOID, B = FK.BRIDGE, G0 = FK.GRASS;

function* astralSetup(x0, y0, cw, ch, K, KW, M, world) {
  const S = yield* BASE.fineSetup(x0, y0, cw, ch, K, KW, M, world);
  // weiche Flecken im Gras (wie im Entwurf: groß und flach, darüber eine feinere Lage)
  S.mot = S.noise([[4, 22, 14, 901, 0.6], [2, 7, 4.5, 902, 0.4]]);
  return S;
}

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

function astralFine(kind, F, G, K, ki, KW, S) {
  if (kind === B) return bridgeFine(F, G);
  if (kind === V) return -2;
  // Rand zum Abgrund: eine Feinzeile dunkle Kante, an der Oberkante zwei Zeilen Licht (Gras im Gegenlicht)
  if (K[ki - KW] === V || K[ki - 1] === V || K[ki + 1] === V) return EDGE;
  if (K[ki + KW] === V) return RIM;
  if (kind !== G0) return BASE.finePixel(kind, F, G, K, ki, KW, S);
  if (K[ki - 2 * KW] === V) return RIM;
  if (K[ki - 3 * KW] === V) return RIM2;
  // Gras: weich gefleckt, Dither auf Weltpixeln (ruhig wie im Entwurf), Halme und Blütenblätter vereinzelt
  const h = hash2(F, G, 905);
  if (h > 0.9986) return PETAL[(F + G) % 3];
  if (h > 0.996 || hash2(F, G + 1, 905) > 0.996) return GRASS[5];
  const t = 0.2 + S.mot[S.wiFast(F, G)] * 0.72;
  const x = F >> 1, y = G >> 1;
  return GRASS[Math.max(0, Math.min(5, Math.floor(t * 5 + D4[(y & 3) * 4 + (x & 3)] / 16)))];
}

export const FINE_ASTRAL = {
  // Weltpixel-Paletten (Qualität „Niedrig“, Übersichtskarte)
  grass: ['#2e434c', '#3d5a5a', '#507468', '#6c927c', '#6c927c', '#97b896'],
  dirt: ['#3a3450', '#48425e', '#56506c', '#666080', '#787292', '#8c86a4'],
  water: ['#1c2450', '#243064', '#2c3c78', '#3a4e92', '#5068ae'],
  tufts: false,
  finePixel: astralFine,
  fineSetup: astralSetup,
  fineTufts: false,
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
