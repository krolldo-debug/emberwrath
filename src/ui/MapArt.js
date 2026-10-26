import { makeCanvas } from '../gfx/PixelCanvas.js';
import { hash2 } from '../core/math.js';
import { PixelFont } from './PixelFont.js';

// Gezeichnete Zonenkarte im Pixelstil – Thread D, Neufassung „Kartenwerk“ (17.10.).
// Aus dem Zeichenraster der Zone (level.map), den Deko-Platzierungen und den Flächen entsteht eine farbige
// 16-Bit-Karte: Gebirge mit Relief (Licht von oben links, Schlagschatten nach unten rechts), Wälder aus einzelnen
// Kronen, Wasser mit Tiefe und Brandung, Lava mit Glutbändern, Wege, Felder, Brücken, Städte mit Dächern.
// Dungeons in Draufsicht wie im Spiel: Steinplatten, Mauerfronten mit Ziegeln, Mauerkronen über dunkler Leere.
// Alles hart gepixelt: feste Farbrampen je Biom, Übergänge per Rastermuster (Bayer), kein Alpha.
// Liest nur world.dungeon (rows, terrain, solid, placements, level) – nichts wird geschrieben.
// Neue oder größere Gebiete funktionieren ohne Änderung; Beschriftungen (layoutLabels) kommen aus
// level.areas[].name (falls gesetzt) oder aus AREA_NAMES und werden als Text über die Karte gelegt.

const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const R = (...c) => c.map(hex);

const LAVA = R('#2a0a06', '#6a1608', '#b0300c', '#e8601a', '#ffa840', '#ffe9a0');

// Außengebiete: jede Rampe dunkel → hell. rock: Kontur, Tiefschatten, Schatten, Mitte, Licht, Glanz.
// water: tief, mittel, flach, Brandung. tree: Kontur, dunkel, mittel, hell. roof: dunkel, mittel, hell.
const OUTDOOR = {
  outdoor: {
    ground: R('#4a6532', '#58763a', '#678845'), forest: R('#2c4223', '#36502a', '#425e30'), speck: hex('#88a656'),
    path: R('#6a4e34', '#86683f', '#a28256'), pave: R('#4e4236', '#968a74', '#b2a68c'),
    rock: R('#1e1a18', '#3a322c', '#544840', '#706252', '#8e7e6a', '#ae9e86'),
    water: R('#1c3a58', '#275174', '#346a92', '#a4cce0'), tree: R('#121c0e', '#22401c', '#33592a', '#4a7a36'),
    roof: R('#4e1e14', '#8a3a26', '#b4563a'), crop: R('#9a7e38', '#c2a452'),
  },
  ashwood: {
    ground: R('#434a36', '#4f5740', '#5c654a'), forest: R('#2c3226', '#353d2e', '#404a36'), speck: hex('#6e7a54'),
    path: R('#5a4a3a', '#706048', '#887658'), pave: R('#463e36', '#8a8070', '#a29884'),
    rock: R('#1a1818', '#34302e', '#4a4442', '#625a54', '#7e746a', '#9c9084'),
    water: R('#1e3444', '#29475a', '#375c72', '#94b0bc'), tree: R('#101410', '#24301f', '#33432b', '#4a5c3a'),
    roof: R('#3e1a12', '#74321e', '#9c4a2c'), crop: R('#7a6a3a', '#9a8848'),
  },
  peaks: {
    ground: R('#3e3230', '#4a3c38', '#584842'), forest: R('#2e2422', '#382c28', '#42342e'), speck: hex('#6a5248'),
    path: R('#584234', '#6c5242', '#826452'), pave: R('#46362e', '#806c5e', '#988272'),
    rock: R('#140f10', '#281e1e', '#3a2c2a', '#504038', '#6a5648', '#86705c'),
    water: LAVA, tree: R('#140e0c', '#2a1e18', '#3a2a22', '#4e3a2e'), roof: R('#3a160e', '#6e2c18', '#94402a'), crop: R('#6a5040', '#7e6250'),
  },
  steppe: {
    ground: R('#7e6a40', '#907a4a', '#a28a56'), forest: R('#5e5a34', '#6a663a', '#787442'), speck: hex('#bca468'),
    path: R('#664a30', '#7e5e3e', '#96744e'), pave: R('#5a4632', '#a28e6e', '#baa684'),
    rock: R('#2a1e16', '#4a3828', '#664e38', '#826648', '#9e805a', '#ba9c70'),
    water: R('#22425e', '#2d5878', '#3c7092', '#accedc'), tree: R('#181c0e', '#32401e', '#46562a', '#5e7038'),
    roof: R('#4a1e12', '#84381e', '#ac5430'), crop: R('#a88a44', '#c8aa5a'),
  },
  marsh: {
    ground: R('#4e6238', '#5a7040', '#677e4a'), forest: R('#3c4c2c', '#465834', '#50643c'), speck: hex('#82985a'),
    path: R('#5a4a32', '#6e5c3e', '#82704c'), pave: R('#3a362c', '#7a7462', '#908a76'),
    rock: R('#1a1e18', '#2e342c', '#444c3e', '#5a6450', '#747e66', '#8e987e'),
    water: R('#14262a', '#1c3338', '#264448', '#86aaa0'), calm: true, tree: R('#0e140c', '#20301b', '#2e4225', '#425a30'),
    roof: R('#2e2418', '#54442e', '#6e5c3e'), crop: R('#5a6a3a', '#6e7e46'),
  },
  frost: {
    ground: R('#c2cedb', '#d6e0ea', '#eaf0f6'), forest: R('#acbaca', '#bac8d6', '#cad6e2'), speck: hex('#a2b2c4'),
    path: R('#9aa8b8', '#acb8c6', '#bec8d4'), pave: R('#6a7280', '#b2bac4', '#c8ced8'),
    rock: R('#161e2e', '#2e3a52', '#485874', '#6a7e9c', '#a6b6ce', '#e2eaf4'),
    water: R('#6a9cc0', '#86b2d2', '#a6cae2', '#e4f2fa'), tree: R('#0c1a18', '#1c3832', '#2a5046', '#3c6a5c'),
    roof: R('#3e1c14', '#6e3420', '#8e4a2e'), crop: R('#9aa8b8', '#b0bcca'), ice: true, snow: true,
  },
  wastes: {
    ground: R('#40221c', '#4c2a22', '#58322a'), forest: R('#38201a', '#42261e', '#4c2c22'), speck: hex('#6e3e2e'),
    path: R('#2e1814', '#3a201a', '#462820'), pave: R('#3e302a', '#8a7266', '#a08678'),
    rock: R('#120a0a', '#2a1816', '#42261f', '#5c3628', '#7a4a38', '#9a644c'), ruin: R('#1a0e0c', '#7c6a5e', '#a08a7a', '#c4ac98'),
    water: LAVA, tree: R('#100808', '#281410', '#381e16', '#4a2a1e'), roof: R('#3a140c', '#6a2414', '#8e3a20'), crop: R('#5a3428', '#6c4030'),
  },
};
OUTDOOR.cinder = OUTDOOR.peaks;
const LAVA_BIOMES = new Set(['cinder', 'peaks', 'wastes', 'forge', 'throne']);

// Dungeons: Fuge, Platten (3 Töne), Mauerfront (Fuge + 3 Töne), Mauerkrone, Leere, Flüssigkeit
const WATER_D = R('#1a3048', '#22405c', '#2e5272', '#8cb0c4');
const DUNGEON = {
  crypt: { seam: hex('#2e2824'), floor: R('#564c44', '#62574e', '#6f645a'), face: R('#221c18', '#463c34', '#584c42', '#6c6052'), rim: R('#2a221e', '#7a6c5a', '#94866e'), void: R('#0c090a', '#151012'), liquid: WATER_D },
  temple: { seam: hex('#26302c'), floor: R('#48544e', '#535f58', '#5f6c64'), face: R('#1a2420', '#36443e', '#46564e', '#586a60'), rim: R('#1e2824', '#6e8076', '#8a9c90'), void: R('#080c0b', '#0f1514'), liquid: R('#14363e', '#1c4a54', '#28606a', '#8cc4c8') },
  forge: { seam: hex('#2a1c18'), floor: R('#523a32', '#5e443a', '#6a4e44'), face: R('#1a0f0c', '#36241e', '#482f28', '#5a3c32'), rim: R('#24140f', '#765646', '#94705a'), void: R('#0c0606', '#160c0a'), liquid: LAVA },
  barrow: { seam: hex('#262a2e'), floor: R('#464c50', '#51575c', '#5d6368'), face: R('#181c20', '#32383c', '#42484e', '#545a60'), rim: R('#1c2024', '#6e767e', '#8a929a'), void: R('#090a0c', '#101215'), liquid: R('#162630', '#1e3440', '#284454', '#7c98a8') },
  spore: { seam: hex('#262a1a'), floor: R('#444a30', '#4f5638', '#5b6242'), face: R('#161a10', '#2c321e', '#3a4228', '#4a5434'), rim: R('#1c2014', '#66704a', '#808c5e'), void: R('#090a06', '#10120b'), liquid: R('#2a4a12', '#3e6a1a', '#568a26', '#a8d060') },
  rime: { seam: hex('#4a5a6e'), floor: R('#70849c', '#7e92aa', '#8ca0b8'), face: R('#222e40', '#44546c', '#566882', '#6a7e98'), rim: R('#2a3648', '#a8bace', '#d0dcea'), void: R('#080c12', '#0e141c'), liquid: R('#4a7aa0', '#6292b8', '#80aed0', '#e0f0fa') },
  throne: { seam: hex('#2a1a18'), floor: R('#463230', '#523c38', '#5e4642'), face: R('#160c0a', '#321e1a', '#442a24', '#56362e'), rim: R('#1e100e', '#76544a', '#94705e'), void: R('#0b0606', '#140b0a'), liquid: LAVA },
};

// Anzeigenamen der heutigen Gebiete (level.areas[].name hat Vorrang). Ausgänge zu anderen
// Zonen werden nicht als Fläche beschriftet, sondern über ihr Portal.
export const AREA_NAMES = {
  ashwood_camp: 'Lager der Wächter', bandit_camp: 'Banditenlager',
  rookwatch: 'Rauhwacht', obsidian_rift: 'Obsidianspalte',
  steppe_outpost: 'Außenposten', warlord_camp: 'Kriegslager',
  mirefort: 'Mirefeste', sunken_village: 'Versunkenes Dorf',
  frosthold: 'Frosthold', troll_caves: 'Trollhöhlen',
  last_bastion: 'Letzte Bastion', colossus_field: 'Kolossfeld',
};
// Städte (Lager mit Händlern) werden größer beschriftet
const TOWNS = new Set(['ashwood_camp', 'rookwatch', 'steppe_outpost', 'mirefort', 'frosthold', 'last_bastion']);

// ------------------------------------------------------------------ Deko-Namen -> Kartensymbol
const GLYPHS = [
  [/mountainpeakbig/, 'peak'], [/mountainpeaksmall/, 'peakSmall'],
  [/steppingstone/, 'rock'],
  [/ruinwall|ruinpier|bridgepier|charredruins|templeruin|fallentower|towerstump|columnstump|fallencolumn|colossus/, 'ruin'],
  [/willow/, 'willow'], [/birch(?!es)|birchclump/, 'birch'],
  [/dead|charred|scorched|drowned(?!boat)|haunted|stump/, 'deadtree'],
  [/pine|conifer/, 'pine'],
  [/oak|broad|deepwood|clump|leaf|tree(?!platform)/, 'tree'],
  [/field|furrow|wheat|cabbage/, 'field'],
  [/dambank/, 'bank'],
  [/walk|boardwalk|bridge(?!stub|rail)|platform/, 'planks'],
  [/palisade|fence|barricade|damstakes|minerail/, 'fence'],
  [/watchtower|tower|lookout/, 'tower'],
  [/cottage|house|hut|longhouse|lodge|stable|mill|mausoleum|kiln|facade|forge$|^forge|stall|den$/, 'house'],
  [/tent|yurt/, 'tent'],
  [/needle|spike|spire|basalt|icepillar|obsidianpillar/, 'spire'],
  [/cave|grotto|mineentrance|gate|arch/, 'cave'],
  [/campfire|fire|brazier|geyser|vent/, 'fire'],
  [/lamp|lantern|wisp/, 'lamp'],
  [/mushroom|shroom/, 'mushroom'],
  [/crystal/, 'crystal'],
  [/cairn|grave|stele|marker|totem|runestone|standingstone|signpost|statue|pole|scarecrow|vertebra|rib|skull|scaffold|column/, 'stone'],
  [/rock|boulder|rubble|slag|crust|shard|ore/, 'rock'],
  [/lily/, 'lily'],
  [/reed|grass|bush|bramble|shrub|thorn|flower/, 'tuft'],
  [/crate|cart|sled|supplies|hay|woodpile|logpile|weaponrack|peltrack|hiderack|netrack|boat|well$/, 'crate'],
];
const kindCache = new Map();
function glyphKind(name) {
  let k = kindCache.get(name);
  if (k !== undefined) return k;
  const n = name.toLowerCase();
  k = GLYPHS.find(([re]) => re.test(n))?.[1] ?? null;
  kindCache.set(name, k);
  return k;
}
const TREES = new Set(['pine', 'tree', 'birch', 'willow', 'deadtree']);

// ------------------------------------------------------------------ Hilfen
function vn(x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed), c = hash2(x0, y0 + 1, seed), e = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + e) * sx * sy;
}
// 4×4-Bayer-Schwelle in −0,5 … 0,5: harte Übergänge zwischen zwei Tönen
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
const bay = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
const pick = (rampArr, v, x, y, amt = 0.85) => rampArr[Math.max(0, Math.min(rampArr.length - 1, Math.floor(v * rampArr.length + bay(x, y) * amt)))];
const mul = (c, k) => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Abstand je Kachel zur nächsten Kachel außerhalb der Maske (Fasen-Näherung, Kachelmaß)
function distField(mask, w, h) {
  const D = new Float32Array(w * h), big = 1e6;
  for (let i = 0; i < w * h; i++) D[i] = mask[i] ? big : 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : D[y * w + x]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!D[i]) continue;
    D[i] = Math.min(D[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.41, at(x + 1, y - 1) + 1.41);
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; if (!D[i]) continue;
    D[i] = Math.min(D[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.41, at(x - 1, y + 1) + 1.41);
  }
  return D;
}
function bilin(D, w, h, fx, fy) {
  fx = Math.max(0, Math.min(w - 1.001, fx)); fy = Math.max(0, Math.min(h - 1.001, fy));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0, i = y0 * w + x0;
  return (D[i] * (1 - ax) + D[i + 1] * ax) * (1 - ay) + (D[i + w] * (1 - ax) + D[i + w + 1] * ax) * ay;
}

// Malfläche: RGBA-Puffer mit Bildgröße, Zeichnen nur innerhalb
class Paint {
  constructor(W, H) { this.W = W; this.H = H; this.img = new ImageData(W, H); this.px = this.img.data; }
  set(x, y, c) {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
    const i = (y * this.W + x) * 4, p = this.px;
    p[i] = c[0]; p[i + 1] = c[1]; p[i + 2] = c[2]; p[i + 3] = 255;
  }
  get(x, y) { const i = (y * this.W + x) * 4; return [this.px[i], this.px[i + 1], this.px[i + 2]]; }
  shade(x, y, k) { if (x < 0 || y < 0 || x >= this.W || y >= this.H) return; this.set(x, y, mul(this.get(x, y), k)); }
  rect(x, y, w, h, c) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c); }
  // Pixelbild aus Zeichenketten; Anker unten mittig. '.' bleibt frei.
  sprite(x, y, rows, pal) {
    const h = rows.length, w = rows[0].length, ox = x - (w >> 1), oy = y - h + 1;
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) { const col = pal[rows[r][c]]; if (col) this.set(ox + c, oy + r, col); }
  }
}

// ------------------------------------------------------------------ Gelände je Kachel
const TERR = 1.05; // Terrassen je Höhenstufe (Fels)
const G = 0, DIRT = 1, PAVE = 2, ROCK = 3, LIQ = 4, FISS = 5, HOUSE = 6, WALL = 7;
const FLOOR = 0, FACE = 8, TOP = 9;

function classify(d) {
  const L = d.level, outdoor = L.kind === 'outdoor';
  const biome = L.biome ?? (outdoor ? 'outdoor' : 'crypt');
  const cls = new Uint8Array(d.w * d.h);
  if (!outdoor) {
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
      const k = d.wallKind ? d.wallKind(x, y) : (d.rows[y][x] === '#' ? 'top' : 'floor');
      cls[y * d.w + x] = k === 'liquid' ? LIQ : k === 'floor' ? FLOOR : k === 'top' ? TOP : FACE;
    }
    return { cls, biome, outdoor };
  }
  const extraSolid = new Set(L.solid ?? []);
  const rockChars = new Set([...(L.rockChars ?? []), ...(L.rockDecor ?? [])]); // Fels, auch unter Gipfel-Deko
  const placed = new Uint8Array(d.w * d.h), fill = new Uint8Array(d.w * d.h);
  for (const p of d.placements) if (p.tx >= 0 && p.ty >= 0 && p.tx < d.w && p.ty < d.h) placed[p.ty * d.w + p.tx] = 1;
  for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
    const ch = d.rows[y][x], i = y * d.w + x;
    if (ch === '#' || rockChars.has(ch)) cls[i] = ROCK;
    else if (ch === '~') cls[i] = LIQ;
    else if (ch === '=') cls[i] = FISS;
    else if (ch === 'H') cls[i] = HOUSE;
    else if (ch === 'f') cls[i] = WALL;
    else {
      // Feste Zeichen ohne eigene Deko füllen dichten Wald (Aschenwald 'z', Glutsenke 'Y'); Spalten '"' malt der Boden
      if (extraSolid.has(ch) && !placed[i] && ch !== '"' && !(L.decor && ch in L.decor)) fill[i] = 1;
      const t = d.terrain[y][x];
      cls[i] = t === ':' ? PAVE : t === '.' ? DIRT : t === '~' ? LIQ : t === '#' ? ROCK : G;
    }
  }
  return { cls, biome, outdoor, fill };
}

function forestMask(d, fill) {
  const n = new Uint8Array(d.w * d.h), out = new Uint8Array(d.w * d.h);
  for (const pl of d.placements) {
    if (!TREES.has(glyphKind(pl.type === 'bdecor' ? pl.name : pl.type) ?? '')) continue;
    if (pl.tx >= 0 && pl.ty >= 0 && pl.tx < d.w && pl.ty < d.h) n[pl.ty * d.w + pl.tx]++;
  }
  for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
    let c = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < d.w && yy < d.h) c += n[yy * d.w + xx]; }
    out[y * d.w + x] = c >= 3 || fill[y * d.w + x] ? 1 : 0;
  }
  return out;
}

// ------------------------------------------------------------------ Kartenbild
const cache = new WeakMap(); // world -> { key: canvas }

export function renderZoneMap(world, scale, { detail = true, frame = detail } = {}) {
  let entry = cache.get(world);
  if (!entry) { entry = {}; cache.set(world, entry); }
  const key = `${scale}|${detail ? 1 : 0}|${frame ? 1 : 0}`;
  if (entry[key]) return entry[key];
  const d = world.dungeon;
  const { cls, biome, outdoor, fill } = classify(d);
  const W = d.w * scale, H = d.h * scale;
  const P = new Paint(W, H);
  const fine = detail && scale >= 3;
  if (outdoor) paintOutdoor(P, d, cls, fill, biome, scale, fine);
  else paintDungeon(P, d, cls, biome, scale, fine);
  if (frame) drawFrame(P, scale);
  const c = makeCanvas(W, H);
  c.getContext('2d').putImageData(P.img, 0, 0);
  entry[key] = c;
  return c;
}

// ------------------------------------------------------------------ Außengebiete
function paintOutdoor(P, d, cls, fill, biome, s, fine) {
  const pal = OUTDOOR[biome] ?? OUTDOOR.outdoor;
  const lava = LAVA_BIOMES.has(biome);
  const W = P.W, H = P.H, w = d.w, h = d.h;
  const forest = forestMask(d, fill);

  // Gelände je Pixel mit verrauschter Grenze (wirkt gezeichnet statt gekachelt); Bauten bleiben kantig
  const pc = new Uint8Array(W * H);
  const jit = s * 0.42, fq = 1 / (s * 1.7);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const exact = cls[Math.floor(y / s) * w + Math.floor(x / s)];
    if (exact === HOUSE || exact === WALL) { pc[y * W + x] = exact; continue; }
    const jx = x + (vn(x * fq, y * fq, 3) - 0.5) * jit * 2, jy = y + (vn(x * fq, y * fq, 4) - 0.5) * jit * 2;
    const tx = Math.min(w - 1, Math.max(0, Math.floor(jx / s))), ty = Math.min(h - 1, Math.max(0, Math.floor(jy / s)));
    const k = cls[ty * w + tx];
    pc[y * W + x] = k === HOUSE || k === WALL ? G : k;
  }
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 255 : pc[y * W + x]);

  // Höhe im Fels: Abstand zum Rand (Kacheln) plus Grate aus Kammrauschen
  const rockMask = new Uint8Array(w * h), liqMask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) { rockMask[i] = cls[i] === ROCK ? 1 : 0; liqMask[i] = cls[i] === LIQ ? 1 : 0; }
  const rockD = distField(rockMask, w, h), liqD = distField(liqMask, w, h);
  const hp = new Float32Array(W * H);
  const rq = 1 / (s * 3.6), dq = 1 / (s * 1.1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (pc[y * W + x] !== ROCK) continue;
    const base = bilin(rockD, w, h, (x + 0.5) / s - 0.5, (y + 0.5) / s - 0.5);
    const ridge = 1 - Math.abs(vn(x * rq, y * rq, 61) * 2 - 1);
    hp[y * W + x] = Math.min(base, 5) * 0.55 + ridge * Math.min(base, 2.5) * 0.45 + vn(x * dq, y * dq, 62) * 0.06 * Math.min(base, 1.2);
  }

  const gq = 1 / (s * 4.5), gq2 = 1 / (s * 1.2), sh = Math.max(1, Math.round(s * 0.45));
  const shadeAt = (x, y) => { for (let k = 1; k <= sh; k++) { const n = at(x - k, y - k); if (n === ROCK || n === HOUSE || n === WALL) return true; } return false; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, k = pc[i];
    let col;
    if (k === ROCK) {
      const nb = (at(x + 1, y) !== ROCK) || (at(x, y + 1) !== ROCK), nt = (at(x - 1, y) !== ROCK) || (at(x, y - 1) !== ROCK);
      if (nb) col = pal.rock[0];
      else if (nt) col = pal.rock[1];
      else {
        // Harte Stufen: Höhe in Terrassen, Kante nach unten rechts dunkel, nach oben links hell, Flächen in 3 Tönen
        const lv = Math.floor(hp[i] * TERR), lr = Math.floor(hp[i + 1] * TERR), ld = Math.floor(hp[i + W] * TERR);
        const ll = Math.floor(hp[i - 1] * TERR), lu = Math.floor(hp[i - W] * TERR);
        if (lr < lv || ld < lv) col = pal.rock[1];
        else if (ll < lv || lu < lv) col = pal.rock[lv >= 3 ? 5 : 4];
        else {
          const g = (hp[i + 1] - hp[i - 1] + hp[i + W] - hp[i - W]) * s * 0.5;
          col = pal.rock[g > 0.22 ? (lv >= 3 && pal.snow ? 5 : 4) : g < -0.3 ? 2 : 3];
        }
      }
    } else if (k === LIQ) {
      col = liquid(pal, lava, x, y, s, bilin(liqD, w, h, (x + 0.5) / s - 0.5, (y + 0.5) / s - 0.5), at);
    } else if (k === FISS) {
      col = vn(x / 3, y / 3, 41) > 0.56 ? (hash2(x, y, 42) < 0.4 ? LAVA[5] : LAVA[3]) : LAVA[0];
    } else if (k === HOUSE) {
      col = pal.roof[1];
    } else if (k === WALL) {
      // Palisade: Pfähle abwechselnd hell/dunkel, Spitzen oben, Kontur unten
      const up = at(x, y - 1) !== WALL, down = at(x, y + 1) !== WALL;
      col = down ? [34, 22, 14] : up ? [168, 128, 84] : (x & 1) ? [110, 76, 46] : [138, 98, 60];
    } else if (k === DIRT || k === PAVE) {
      let edge = false;
      for (let a = 0; a < 4; a++) { const n = at(x + (a === 0) - (a === 1), y + (a === 2) - (a === 3)); if (n !== DIRT && n !== PAVE && n !== 255) { edge = true; break; } }
      if (k === PAVE && !edge) {
        // Pflaster: versetzte Steine, Fugen dunkel
        const cw = Math.max(2, Math.round(s * 0.6)), chh = Math.max(2, Math.round(s * 0.45));
        const row = Math.floor(y / chh), cx = x + (row & 1) * (cw >> 1);
        col = y % chh === 0 || cx % cw === 0 ? mixc(pal.pave[0], pal.pave[1], 0.45) : hash2(Math.floor(cx / cw), row, 43) < 0.5 ? pal.pave[1] : mixc(pal.pave[1], pal.pave[2], 0.6);
      } else if (edge) col = pal.path[0];
      else {
        const v = vn(x * gq2, y * gq2, 44);
        col = hash2(x, y, 45) < 0.03 ? pal.path[0] : pick(pal.path.slice(1), v, x, y);
      }
    } else {
      // Boden: zwei Rauschlagen, drei Töne; dichter Wald dunkler
      const fx = Math.floor((x + (vn(x / 6, y / 6, 12) - 0.5) * s * 1.4) / s), fy = Math.floor((y + (vn(x / 6, y / 6, 13) - 0.5) * s * 1.4) / s);
      const inForest = forest[Math.max(0, Math.min(h - 1, fy)) * w + Math.max(0, Math.min(w - 1, fx))];
      const v = vn(x * gq, y * gq, 11) * 0.65 + vn(x * gq2, y * gq2, 14) * 0.35;
      col = pick(inForest ? pal.forest : pal.ground, v * 1.15 - 0.08, x, y);
      if (fine && hash2(x, y, 15) < 0.018) col = inForest ? pal.forest[0] : pal.speck;
    }
    if (k !== ROCK && k !== HOUSE && k !== WALL && k !== LIQ && shadeAt(x, y)) col = mul(col, pal === OUTDOOR.frost ? 0.82 : 0.72);
    P.set(x, y, col);
  }

  drawHouses(P, d, cls, s, pal);
  if (fine) drawPlacements(P, d, fill, s, pal, biome);
  else if (s >= 2) {
    // Minimap: Bäume als Tupfen, damit Wälder lesbar bleiben
    for (const pl of d.placements) {
      const kind = glyphKind(pl.type === 'bdecor' ? pl.name : pl.type);
      if (!TREES.has(kind)) continue;
      const x = Math.round((pl.x / (d.pixelW / w)) * s), y = Math.round((pl.y / (d.pixelH / h)) * s) - 1;
      P.set(x, y - 1, pal.tree[3]); P.set(x, y, pal.tree[1]); P.set(x + 1, y, pal.tree[0]);
    }
  }
}

// Wasser/Eis/Lava eines Pixels: Tiefe aus dem Abstand zum Ufer, Brandung am Rand
function liquid(pal, lava, x, y, s, depth, at) {
  const r = lava ? LAVA : pal.water;
  let shore = 0;
  for (let k = 1; k <= 2 && !shore; k++) if (at(x + k, y) !== LIQ || at(x - k, y) !== LIQ || at(x, y + k) !== LIQ || at(x, y - k) !== LIQ) shore = k;
  if (lava) {
    if (shore === 1) return LAVA[0];
    if (shore === 2 && hash2(x, y, 81) < 0.6) return LAVA[1];
    const flow = vn(x / (s * 1.6) + y / (s * 3), y / (s * 1.1), 82);
    if (vn(x / (s * 1.1), y / (s * 1.1), 83) > 0.64) return vn(x / 2, y / 2, 84) > 0.7 ? LAVA[2] : LAVA[1]; // Krustenschollen
    const t = Math.floor(2 + Math.min(depth, 3) * 0.45 + flow * 1.5 + bay(x, y) * 0.8);
    return LAVA[t >= 5 ? (hash2(x, y, 90) < 0.3 ? 5 : 4) : Math.max(2, t)];
  }
  if (pal.ice) {
    if (shore === 1) return r[3];
    const crack = 1 - Math.abs(vn(x / (s * 1.4), y / (s * 1.4), 85) * 2 - 1);
    if (crack > 0.94) return r[0];
    if (hash2(x, y, 86) < 0.012) return [255, 255, 255];
    return pick([r[1], r[2], r[3]], 0.85 - Math.min(depth, 3) * 0.18 + vn(x / (s * 2), y / (s * 2), 87) * 0.25, x, y);
  }
  if (pal.pit) { if (shore === 1) return mul(r[0], 0.6); if (shore === 2) return r[0]; }
  if (shore === 1) return r[3];
  if (shore === 2 && hash2(x, y, 88) < 0.45) return r[2];
  // Wellenstriche: kleine „~“ in hellerem Ton
  const cx = Math.floor(x / 7), cy = Math.floor(y / 5);
  if (s >= 3 && hash2(cx, cy, 31) < (pal.calm ? 0.1 : 0.3)) {
    const u = x - (cx * 7 + Math.floor(hash2(cx, cy, 32) * 3)), v = y - (cy * 5 + 2);
    if ((v === 0 && (u === 0 || u === 3)) || (v === -1 && (u === 1 || u === 2))) return r[3];
  }
  return pick([r[0], r[1], r[2]], 1 - Math.min(depth, 3.2) / 3.2 + (vn(x / (s * 2), y / (s * 2), 89) - 0.5) * 0.3, x, y);
}

// Häuser aus 'H'-Flächen: Satteldach mit First, Schindeln, Kontur und Traufschatten
function drawHouses(P, d, cls, s, pal) {
  const seen = new Uint8Array(d.w * d.h);
  for (let ty = 0; ty < d.h; ty++) for (let tx = 0; tx < d.w; tx++) {
    const i = ty * d.w + tx;
    if (cls[i] !== HOUSE || seen[i]) continue;
    let x0 = tx, x1 = tx, y0 = ty, y1 = ty;
    const stack = [i]; seen[i] = 1;
    while (stack.length) {
      const j = stack.pop(), x = j % d.w, y = (j - x) / d.w;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, n = ny * d.w + nx;
        if (nx >= 0 && ny >= 0 && nx < d.w && ny < d.h && !seen[n] && cls[n] === HOUSE) { seen[n] = 1; stack.push(n); }
      }
    }
    roofBlock(P, x0 * s, y0 * s, (x1 - x0 + 1) * s, (y1 - y0 + 1) * s, pal);
  }
}
function roofBlock(P, x, y, w, h, pal) {
  const [rd, rm, rl] = pal.roof, ink = [26, 14, 10], mid = Math.ceil(h / 2);
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    let c = yy < mid ? rl : rm;
    if (yy === mid - 1) c = mul(rl, 1.18);
    else if ((yy % 2 === 0) && ((xx + (yy % 4 === 0 ? 1 : 0)) % 3 === 0)) c = yy < mid ? rm : rd;
    if (pal.snow && yy < mid - 1) c = (xx + yy) % 5 === 0 ? [196, 210, 224] : [236, 242, 248];
    if (xx === 0 || yy === 0 || xx === w - 1 || yy === h - 1) c = ink;
    P.set(x + xx, y + yy, c);
  }
  for (let xx = 1; xx <= w; xx++) P.shade(x + xx, y + h, 0.7);
  for (let yy = 1; yy < h; yy++) P.shade(x + w, y + yy, 0.7);
}

// ------------------------------------------------------------------ Symbole (Außengebiete)
function drawPlacements(P, d, fill, s, pal, biome) {
  const TW = d.pixelW / d.w;
  const big = s >= 5;
  // Waldfüllung: Bäume der häufigsten Art der Zone, leicht versetzt
  const count = {};
  for (const pl of d.placements) { const name = pl.type === 'bdecor' ? pl.name : pl.type, k = glyphKind(name); if (k === 'tree' || k === 'pine') count[name] = (count[name] ?? 0) + 1; }
  const filler = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0];
  const extra = [];
  if (filler) for (let ty = 0; ty < d.h; ty++) for (let tx = 0; tx < d.w; tx++) {
    if (!fill[ty * d.w + tx]) continue;
    // ein bis zwei Kronen je Kachel, frei versetzt: kein Raster sichtbar
    for (let k = 0; k < 2; k++) {
      if (hash2(tx, ty, 74 + k) < (k ? 0.55 : 0.12)) continue;
      extra.push({ type: 'bdecor', name: filler, tx, ty, x: (tx + hash2(tx, ty, 72 + k * 9)) * TW, y: (ty + 0.2 + hash2(tx, ty, 73 + k * 9) * 0.9) * TW + 6 });
    }
  }
  const list = [...d.placements, ...extra].sort((a, b) => a.y - b.y || a.x - b.x);
  // Flächen (Felder, Stege) zuerst, dann alles Stehende von hinten nach vorn
  for (const pl of list) {
    const kind = glyphKind(pl.type === 'bdecor' ? pl.name : pl.type);
    if (kind === 'field') field(P, pl.tx * s, pl.ty * s, s, pal, pl.name ?? '');
    else if (kind === 'planks') planks(P, pl.tx * s, pl.ty * s, s);
    else if (kind === 'bank') bank(P, pl.tx * s, pl.ty * s, s, pal);
    else if (kind === 'lily') { const x = pl.tx * s + (s >> 1), y = pl.ty * s + (s >> 1); P.set(x, y, [70, 120, 60]); P.set(x + 1, y, [96, 150, 74]); }
  }
  for (const pl of list) {
    const kind = glyphKind(pl.type === 'bdecor' ? pl.name : pl.type);
    if (!kind || kind === 'field' || kind === 'planks' || kind === 'bank' || kind === 'lily') continue;
    const seed = pl.tx * 31 + pl.ty * 17 + (pl.x | 0);
    // Bäume leicht versetzt, damit gesetzte Wälder kein Raster zeigen
    const jx = TREES.has(kind) ? Math.round((hash2(seed, 6, 77) - 0.5) * s * 0.8) : 0, jy = TREES.has(kind) ? Math.round((hash2(seed, 7, 78) - 0.5) * s * 0.6) : 0;
    const x = Math.round((pl.x / TW) * s) + jx, y = Math.round(((pl.y - 6) / TW) * s + s * 0.35) + jy;
    switch (kind) {
      case 'pine': conifer(P, x, y, big, pal, biome === 'frost' || /snow/i.test(pl.name ?? '')); break;
      case 'tree': case 'birch': case 'willow': roundTree(P, x, y, big, pal, kind, seed); break;
      case 'deadtree': deadTree(P, x, y, big, pal); break;
      case 'peak': peak(P, x, y + Math.round(s * 0.4), Math.round(s * 2.3) + 2, pal, seed); break;
      case 'peakSmall': peak(P, x, y + Math.round(s * 0.3), Math.round(s * 1.4) + 2, pal, seed); break;
      case 'spire': if (!/needle/i.test(pl.name ?? '') || hash2(seed, 4, 74) < 0.3) spire(P, x, y, big, pal, seed); break;
      case 'house': house(P, x, y, big, pal); break;
      case 'tent': tent(P, x, y, big, pal); break;
      case 'tower': tower(P, x, y, big, pal); break;
      case 'ruin': ruin(P, pl.tx * s, pl.ty * s, s, pal, seed); break;
      case 'fence': fence(P, pl.tx * s, pl.ty * s, s, /v$/i.test(pl.name ?? '') || /V/.test(pl.name ?? '')); break;
      case 'cave': cave(P, x, y, big, pal); break;
      case 'fire': fire(P, x, y, big); break;
      case 'lamp': P.set(x, y - 2, LAVA[5]); P.set(x, y - 1, LAVA[3]); P.set(x, y, [30, 20, 14]); break;
      case 'mushroom': mushroom(P, x, y); break;
      case 'crystal': crystal(P, x, y, big); break;
      case 'stone': stone(P, x, y, big, pal); break;
      case 'rock': if (big || hash2(seed, 2, 63) < 0.5) rock(P, x, y, big, pal); break;
      case 'tuft': if (hash2(seed, 1, 61) < 0.4) tuft(P, x, y, pal); break;
      case 'crate': if (big && hash2(seed, 3, 64) < 0.6) crate(P, x, y); break;
      default: break;
    }
  }
}

const TRUNK = [58, 38, 24];
function conifer(P, x, y, big, pal, snow) {
  const [o, dk, md, lt] = pal.tree, sn = [236, 242, 248], sn2 = [196, 210, 224];
  const tiers = big ? [[0, 1, 2], [1, 2, 3], [2, 3, 4]] : [[0, 1], [1, 2]];
  const rows = tiers.reduce((n, t) => n + t.length, 0);
  // Schatten nach unten rechts
  for (let u = 0; u <= (big ? 3 : 2); u++) P.shade(x + u, y + 1, 0.72);
  let row = 0;
  for (const tier of tiers) tier.forEach((hw, k) => {
    const yy = y - rows + row;
    for (let u = -hw; u <= hw; u++) {
      let c;
      if (u === -hw || u === hw) c = o;
      else if (k === tier.length - 1) c = u < 0 ? md : dk;
      else c = u < 0 ? (u < -hw / 2 || k === 0 ? lt : md) : u === 0 ? md : dk;
      if (snow && u > -hw && u < hw && (k === 0 || (u < 0 && k < tier.length - 1))) c = u <= 0 ? sn : sn2;
      P.set(x + u, yy, hw === 0 ? (snow ? sn : o) : c);
    }
    row++;
  });
  P.set(x, y, TRUNK);
}
function roundTree(P, x, y, big, pal, kind, seed) {
  let [o, dk, md, lt] = pal.tree;
  if (kind === 'birch') { md = mul(md, 1.25); lt = mul(lt, 1.3); }
  // Krone mit Kontur nur unten rechts: dicht stehende Bäume verschmelzen zu einem Blätterdach mit Buckeln
  const r = big ? 3 + (hash2(seed, 5, 76) < 0.35 ? 1 : 0) : 2, cy = y - r;
  for (let u = 0; u <= r; u++) P.shade(x + u + 1, y + 1, 0.72);
  const inside = (u, v) => u * u + v * v <= r * r + r * 0.7;
  for (let v = -r; v <= r; v++) for (let u = -r; u <= r; u++) {
    if (!inside(u, v)) continue;
    const edgeBR = !inside(u + 1, v) || !inside(u, v + 1), edgeTL = !inside(u - 1, v) || !inside(u, v - 1);
    const sum = u + v + (hash2(seed + u, v, 65) < 0.2 ? 1 : 0);
    const c = edgeBR ? o : edgeTL ? (u + v < 0 ? md : dk) : sum <= -r ? lt : sum <= 0 ? md : dk;
    P.set(x + u, cy + v, c);
  }
  P.set(x - (r >> 1), cy - (r >> 1), mul(lt, 1.2));
  if (kind === 'willow') for (let u = -r + 1; u < r; u += 2) { P.set(x + u, cy + r + 1, dk); if (big) P.set(x + u, cy + r + 2, o); }
}
function deadTree(P, x, y, big, pal) {
  const ink = mul(pal.tree[0], 1), br = [74, 56, 44];
  const pts = big ? [[0, 0], [0, -1], [0, -2], [0, -3], [0, -4], [-1, -4], [-2, -5], [1, -3], [2, -4], [2, -5], [0, -5], [-1, -2]] : [[0, 0], [0, -1], [0, -2], [-1, -3], [1, -2], [1, -3]];
  for (const [u, v] of pts) { P.set(x + u + 1, y + v, ink); P.set(x + u, y + v, br); }
}
// Gipfel: Licht links, Schatten rechts, Grat leicht rechts der Mitte, Schneekappe im Frost
function peak(P, x, y, hgt, pal, seed) {
  const rk = pal.rock, snow = !!pal.snow;
  const sl = [244, 248, 252], sm = [218, 228, 240], sd = [176, 192, 212];
  for (let r = 0; r < hgt; r++) {
    const half = Math.round(r * 0.85) + (r > 2 && hash2(seed, r, 66) < 0.25 ? 1 : 0);
    const ridge = Math.round(r * 0.16), yy = y - hgt + r, cap = snow && r < hgt * (0.38 + hash2(seed, 0, 67) * 0.12);
    for (let u = -half; u <= half; u++) {
      let c;
      if (u === -half) c = rk[1];
      else if (u === half) c = rk[0];
      else if (u < ridge) c = cap ? sl : (r > 1 && (u + r) % 4 === 0 ? rk[3] : rk[4]);
      else if (u === ridge) c = cap ? sm : rk[3];
      else c = cap ? sd : ((u - ridge + r) % 3 === 0 ? rk[1] : rk[2]);
      P.set(x + u, yy, c);
    }
  }
}
function spire(P, x, y, big, pal, seed) {
  const rk = pal.rock, hgt = big ? 5 + Math.floor(hash2(seed, 0, 68) * 3) : 3;
  for (let r = 0; r < hgt; r++) {
    const yy = y - hgt + r, wide = r > hgt * 0.5;
    P.set(x, yy, r === 0 ? rk[5] : rk[4]); P.set(x + 1, yy, rk[1]);
    if (wide) { P.set(x - 1, yy, rk[0]); P.set(x + 2, yy, rk[0]); }
    else { P.set(x - 1, yy, rk[0]); P.set(x + 2, yy, rk[0]); }
  }
  P.shade(x + 2, y + 1, 0.72); P.shade(x + 3, y + 1, 0.72);
}

function house(P, x, y, big, pal) {
  const [rd, rm, rl] = pal.roof, snow = pal.snow;
  const pp = { o: [26, 14, 10], R: snow ? [236, 242, 248] : rl, r: snow ? [190, 204, 220] : rm, d: rd, w: [168, 142, 104], v: [122, 98, 70], y: [255, 210, 122] };
  const rows = big
    ? ['....o....', '...oRo...', '..oRRro..', '.oRRRrro.', 'oRRRRrrro', 'odddddddo', '.owwyvvo.', '.owwovyo.', '.ooooooo.']
    : ['..o..', '.oRro', 'oRRro', 'odddo', 'owyvo', 'ooooo'];
  for (let u = 1; u <= (big ? 5 : 3); u++) P.shade(x + u, y + 1, 0.7);
  P.sprite(x, y, rows, pp);
}
function tent(P, x, y, big, pal) {
  const pp = { o: [30, 20, 14], T: [204, 178, 132], t: [150, 122, 84], d: [52, 34, 22] };
  const rows = big ? ['...o...', '..oTo..', '.oTTto.', 'oTTdtto', 'ooodooo'] : ['..o..', '.oTo.', 'oTdto', 'ooooo'];
  P.shade(x + 1, y + 1, 0.72); P.shade(x + 2, y + 1, 0.72); P.shade(x + 3, y + 1, 0.72);
  P.sprite(x, y, rows, pp);
}
function tower(P, x, y, big, pal) {
  const st = pal.rock;
  const pp = { o: [22, 16, 14], S: mul(st[4], 1.05), s: st[3], y: [255, 206, 112], R: pal.roof[2], r: pal.roof[1] };
  const rows = big
    ? ['..o..', '.oRo.', 'oRRro', 'ooooo', 'oSSso', 'oSyso', 'oSSso', 'oSsso', 'oSSso', 'ooooo']
    : ['.o.', 'oRo', 'ooo', 'oyo', 'oSo', 'ooo'];
  for (let u = 1; u <= 3; u++) P.shade(x + u, y + 1, 0.7);
  P.sprite(x, y, rows, pp);
}
function ruin(P, x0, y0, s, pal, seed) {
  // Mauerstück: heller Steinblock auf der Kachel, oben zerbrochen, Kontur dunkel
  const st = pal.ruin ?? [pal.rock[0], pal.pave[1], pal.pave[2], mul(pal.pave[2], 1.15)];
  const top = Math.round(s * (0.2 + hash2(seed, 1, 69) * 0.3));
  for (let yy = top; yy < s; yy++) for (let xx = 0; xx < s; xx++) {
    if (yy === top && hash2(seed + xx, 2, 70) < 0.4) continue;
    const edge = xx === 0 || xx === s - 1 || yy === s - 1 || yy === top;
    const mortar = yy % 2 === 0 && (xx + (yy % 4 === 0 ? 1 : 0)) % 3 === 0;
    P.set(x0 + xx, y0 + yy, edge ? st[0] : yy <= top + 1 ? st[3] : mortar ? st[1] : st[2]);
  }
  for (let yy = top + 1; yy <= s; yy++) P.shade(x0 + s, y0 + yy, 0.7);
}
function fence(P, x0, y0, s, vertical) {
  const post = [126, 88, 54], dark = [70, 46, 28], ink = [30, 20, 12];
  if (vertical) {
    const xx = x0 + (s >> 1);
    for (let yy = 0; yy < s; yy++) { P.set(xx - 1, y0 + yy, ink); P.set(xx, y0 + yy, yy % 2 ? post : dark); P.set(xx + 1, y0 + yy, ink); }
    return;
  }
  const yb = y0 + (s >> 1) + 1;
  for (let xx = 0; xx < s; xx++) {
    const tall = xx % 2 === 0 ? 3 : 2;
    for (let k = 0; k < tall; k++) P.set(x0 + xx, yb - k, k === tall - 1 ? [176, 132, 84] : xx % 2 ? dark : post);
    P.set(x0 + xx, yb + 1, ink);
  }
}
function planks(P, x0, y0, s) {
  // Steg: ruhige Bretter, nur jede dritte Reihe eine Fuge
  const a = [132, 96, 58], b = [108, 78, 46];
  for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) P.set(x0 + xx, y0 + yy, (y0 + yy) % 3 === 2 ? b : a);
}
function bank(P, x0, y0, s, pal) {
  for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) P.set(x0 + xx, y0 + yy, yy === 0 ? pal.path[2] : pal.path[1]);
}
function field(P, x0, y0, s, pal, name) {
  const furrow = /furrow/i.test(name), cab = /cabbage/i.test(name);
  for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) {
    let c = yy % 2 ? [84, 58, 34] : (furrow ? [110, 78, 46] : pal.crop[(xx + yy) % 3 === 0 ? 0 : 1]);
    if (cab && yy % 2 === 0) c = xx % 2 ? [76, 120, 56] : [98, 146, 68];
    P.set(x0 + xx, y0 + yy, c);
  }
}
function cave(P, x, y, big, pal) {
  const rk = pal.rock, pp = { o: rk[0], l: rk[4], m: rk[3], k: [8, 6, 8] };
  const rows = big ? ['.ollmo.', 'olkkkmo', 'olkkkmo', 'olkkkmo'] : ['olmo', 'okko', 'okko'];
  P.sprite(x, y, rows, pp);
}
function fire(P, x, y, big) {
  P.set(x, y - 2, LAVA[5]); P.set(x - 1, y - 1, LAVA[3]); P.set(x, y - 1, LAVA[4]); P.set(x + 1, y - 1, LAVA[3]);
  P.set(x - 1, y, [40, 24, 16]); P.set(x, y, LAVA[2]); P.set(x + 1, y, [40, 24, 16]);
  if (big) P.set(x, y - 3, LAVA[3]);
}
function mushroom(P, x, y) {
  const cap = [176, 96, 150];
  P.set(x - 1, y - 2, [40, 20, 36]); P.set(x, y - 2, mul(cap, 1.25)); P.set(x + 1, y - 2, cap); P.set(x + 2, y - 2, [40, 20, 36]);
  P.set(x, y - 3, [40, 20, 36]); P.set(x + 1, y - 3, [40, 20, 36]);
  P.set(x, y - 1, [232, 220, 192]); P.set(x, y, [40, 20, 36]);
}
function crystal(P, x, y, big) {
  P.set(x, y - 3, [232, 244, 255]); P.set(x, y - 2, [168, 208, 240]); P.set(x + 1, y - 2, [96, 140, 196]); P.set(x, y - 1, [168, 208, 240]); P.set(x + 1, y - 1, [96, 140, 196]);
  P.set(x - 1, y - 1, [40, 60, 96]); P.set(x + 2, y - 1, [40, 60, 96]); P.set(x, y, [40, 60, 96]); P.set(x + 1, y, [40, 60, 96]);
  if (big) { P.set(x - 1, y - 2, [40, 60, 96]); P.set(x + 2, y - 2, [40, 60, 96]); }
}
function stone(P, x, y, big, pal) {
  const rk = pal.rock;
  P.set(x, y - 2, rk[5]); P.set(x, y - 1, rk[4]); P.set(x + 1, y - 2, rk[2]); P.set(x + 1, y - 1, rk[2]);
  P.set(x - 1, y, rk[0]); P.set(x, y, rk[3]); P.set(x + 1, y, rk[1]); P.set(x + 2, y, rk[0]);
  if (big) { P.set(x, y - 3, rk[0]); P.set(x + 1, y - 3, rk[0]); }
  P.shade(x + 2, y + 1, 0.75);
}
function rock(P, x, y, big, pal) {
  const rk = pal.rock;
  P.set(x - 1, y - 1, rk[0]); P.set(x, y - 1, rk[5]); P.set(x + 1, y - 1, rk[3]); P.set(x + 2, y - 1, rk[0]);
  P.set(x - 1, y, rk[0]); P.set(x, y, rk[4]); P.set(x + 1, y, rk[2]); P.set(x + 2, y, rk[0]);
  if (big) { P.set(x, y - 2, rk[0]); P.set(x + 1, y - 2, rk[0]); }
  P.shade(x, y + 1, 0.75); P.shade(x + 1, y + 1, 0.75); P.shade(x + 2, y + 1, 0.75);
}
function tuft(P, x, y, pal) {
  const c = pal.forest[0], l = pal.speck;
  P.set(x - 1, y, c); P.set(x, y - 1, l); P.set(x, y, c); P.set(x + 1, y - 1, c);
}
function crate(P, x, y) {
  P.set(x, y - 1, [150, 110, 66]); P.set(x + 1, y - 1, [110, 78, 46]); P.set(x, y, [110, 78, 46]); P.set(x + 1, y, [70, 48, 28]);
}

// ------------------------------------------------------------------ Dungeons
function paintDungeon(P, d, cls, biome, s, fine) {
  const pal = DUNGEON[biome] ?? DUNGEON.crypt;
  const lava = LAVA_BIOMES.has(biome);
  const W = P.W, H = P.H, w = d.w, h = d.h;
  const tc = (tx, ty) => (tx < 0 || ty < 0 || tx >= w || ty >= h ? TOP : cls[ty * w + tx]);
  // Mauerkrone = Wand-Oberseite neben Begehbarem; tiefer drinnen Leere
  const rim = new Uint8Array(w * h);
  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
    if (tc(tx, ty) !== TOP) continue;
    for (let dy = -1; dy <= 1 && !rim[ty * w + tx]; dy++) for (let dx = -1; dx <= 1; dx++) if (tc(tx + dx, ty + dy) !== TOP) { rim[ty * w + tx] = 1; break; }
  }
  const liqMask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) liqMask[i] = cls[i] === LIQ ? 1 : 0;
  const liqD = distField(liqMask, w, h);
  const kindAt = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return TOP; return cls[Math.floor(y / s) * w + Math.floor(x / s)]; };
  const atLiq = (x, y) => (kindAt(x, y) === LIQ ? LIQ : 0);
  const bh = Math.max(2, Math.round(s / 3)), bw = bh * 2;
  const sh = Math.max(1, Math.round(s * 0.4));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const tx = Math.floor(x / s), ty = Math.floor(y / s), k = cls[ty * w + tx];
    let col;
    if (k === TOP) {
      if (!rim[ty * w + tx]) col = hash2(x >> 1, y >> 1, 91) < 0.08 ? pal.void[1] : pal.void[0];
      else {
        const nVoid = (xx, yy) => { const a = Math.floor(xx / s), b = Math.floor(yy / s); return tc(a, b) === TOP && !rim[b * w + a]; };
        const nOpen = (xx, yy) => kindAt(xx, yy) !== TOP;
        if (nOpen(x + 1, y) || nOpen(x - 1, y) || nOpen(x, y + 1) || nOpen(x, y - 1)) col = pal.rim[0];
        else if (nVoid(x + 1, y) || nVoid(x - 1, y) || nVoid(x, y + 1) || nVoid(x, y - 1)) col = pal.rim[0];
        else col = nOpen(x + 2, y + 2) || nOpen(x - 2, y) || nOpen(x, y - 2) ? pal.rim[2] : pick([pal.rim[1], pal.rim[2]], vn(x / s, y / s, 92), x, y);
      }
    } else if (k === FACE) {
      // Mauerfront: Ziegelreihen, oben eine helle Kante, unten eine dunkle Fußlinie
      const above = kindAt(x, y - 1), below = kindAt(x, y + 1);
      const row = Math.floor(y / bh), cx = x + (row & 1) * (bw >> 1);
      if (above === TOP) col = pal.face[3];
      else if (below !== FACE) col = pal.face[0];
      else if (y % bh === 0 || cx % bw === 0) col = pal.face[0];
      else col = hash2(Math.floor(cx / bw), row, 93) < 0.35 ? pal.face[1] : pal.face[2];
    } else if (k === LIQ) {
      col = liquid({ water: pal.liquid, pit: true }, lava, x, y, s, bilin(liqD, w, h, (x + 0.5) / s - 0.5, (y + 0.5) / s - 0.5), atLiq);
    } else {
      // Steinplatten je Kachel, versetzt; Fugen, Töne je Platte, feine Risse
      const off = (ty & 1) * (s >> 1), sx = Math.floor((x + off) / s);
      if ((x + off) % s === 0 || y % s === 0) col = pal.seam;
      else {
        const t = hash2(sx, ty, 94);
        col = pal.floor[t < 0.3 ? 0 : t < 0.75 ? 1 : 2];
        if (fine && hash2(x, y, 95) < 0.02) col = pal.seam;
      }
    }
    // Schatten der Wände auf Boden und Flüssigkeit (Licht oben links)
    if (k === FLOOR || k === LIQ) {
      let shadow = false;
      for (let q = 1; q <= sh && !shadow; q++) { const n = kindAt(x - q, y - q); if (n === TOP || n === FACE) shadow = true; }
      if (!shadow && kindAt(x - 1, y) !== FLOOR && kindAt(x - 1, y) !== LIQ) shadow = true;
      if (shadow) col = mul(col, 0.68);
    }
    P.set(x, y, col);
  }
  if (fine) {
    const TW = d.pixelW / w;
    for (const pl of [...d.placements].sort((a, b) => a.y - b.y)) {
      const name = (pl.type === 'bdecor' ? pl.name : pl.type).toLowerCase();
      const x = Math.round((pl.x / TW) * s), y = Math.round(((pl.y - 6) / TW) * s + s * 0.35);
      dungeonGlyph(P, name, x, y, s, pal, pl);
    }
  }
}

function dungeonGlyph(P, n, x, y, s, pal, pl) {
  const big = s >= 5, ink = [14, 10, 10], st = pal.face;
  if (/pillar|column/.test(n)) {
    const pp = { o: ink, l: mul(pal.rim[2], 1.05), m: pal.rim[1], d: st[2] };
    P.sprite(x, y, big ? ['.ooo.', 'olmmo', 'olmdo', 'olmdo', 'ooooo'] : ['ooo', 'olo', 'ooo'], pp);
    P.shade(x + 2, y + 1, 0.7); P.shade(x + 3, y + 1, 0.7);
  } else if (/brazier/.test(n)) {
    P.set(x, y - 3, LAVA[5]); P.set(x - 1, y - 2, LAVA[3]); P.set(x, y - 2, LAVA[4]); P.set(x + 1, y - 2, LAVA[3]);
    P.set(x - 1, y - 1, ink); P.set(x, y - 1, [120, 100, 80]); P.set(x + 1, y - 1, ink); P.set(x, y, ink);
  } else if (/torch/.test(n)) {
    P.set(x, y - 1, LAVA[5]); P.set(x, y, LAVA[3]);
  } else if (/candles/.test(n)) {
    P.set(x, y, LAVA[4]); if (big) P.set(x + 2, y + 1, LAVA[4]);
  } else if (/stairs/.test(n)) {
    for (let k = 0; k < 4; k++) for (let u = 0; u < s; u++) P.set(Math.round(pl.x / 16 * s) - s + u, y - 4 + k * 2, k % 2 ? ink : pal.rim[2]);
  } else if (/sarcophag|altar|dais|throne|anvil|crucible|urn/.test(n)) {
    const pp = { o: ink, l: pal.rim[2], m: pal.rim[1], g: [216, 170, 72] };
    P.sprite(x, y, /throne|dais/.test(n) ? ['.ogo.', 'olllo', 'olmmo', 'ooooo'] : big ? ['ooooo', 'olllo', 'olmmo', 'ooooo'] : ['ooo', 'olo', 'ooo'], pp);
  } else if (/statue|standingstone|warrior|cairn/.test(n)) {
    P.set(x, y - 3, pal.rim[2]); P.set(x, y - 2, pal.rim[2]); P.set(x + 1, y - 2, st[2]); P.set(x, y - 1, pal.rim[1]); P.set(x + 1, y - 1, st[1]);
    P.set(x - 1, y, ink); P.set(x, y, ink); P.set(x + 1, y, ink); P.set(x + 2, y, ink);
  } else if (/chest/.test(n)) {
    P.sprite(x, y, ['oooo', 'oggo', 'oyyo', 'oooo'], { o: ink, g: [232, 186, 80], y: [168, 112, 40] });
  } else if (/gate/.test(n)) {
    for (let u = -2; u <= 2; u++) for (let v = 0; v < 3; v++) P.set(x + u, y - v, u % 2 === 0 ? [150, 150, 160] : ink);
  } else if (/mushroom|pod|shroom/.test(n)) {
    mushroom(P, x, y);
  } else if (/crystal|icicle|icecolumn/.test(n)) {
    crystal(P, x, y, big);
  } else if (/rune/.test(n)) {
    P.set(x, y - 1, [160, 110, 240]); P.set(x - 1, y, [160, 110, 240]); P.set(x + 1, y, [160, 110, 240]); P.set(x, y + 1, [160, 110, 240]); P.set(x, y, [236, 220, 255]);
  } else if (/embercrack/.test(n)) {
    P.set(x - 1, y, LAVA[3]); P.set(x, y, LAVA[5]); P.set(x + 1, y - 1, LAVA[3]);
  } else if (/banner/.test(n)) {
    P.set(x, y - 2, [150, 40, 30]); P.set(x, y - 1, [150, 40, 30]); P.set(x + 1, y - 2, [110, 26, 20]);
  }
}

// ------------------------------------------------------------------ Rahmen und Windrose
const GOLD = R('#3a2410', '#8a6230', '#c89a4a', '#f2d48a');
function drawFrame(P, s) {
  const W = P.W, H = P.H, ink = [10, 6, 4];
  // Randschatten: nach innen gerastert dunkler
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const e = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (e < 3 || e > 8) continue;
    if (bay(x, y) < (8 - e) / 7 - 0.55) P.shade(x, y, 0.62);
  }
  const ring = (k, c, c2 = c) => {
    for (let x = k; x < W - k; x++) { P.set(x, k, c); P.set(x, H - 1 - k, c2); }
    for (let y = k; y < H - k; y++) { P.set(k, y, c); P.set(W - 1 - k, y, c2); }
  };
  ring(0, ink); ring(1, GOLD[2], GOLD[1]); ring(2, ink);
  // Ecken: kleine Goldrauten
  for (const [cx, cy] of [[2, 2], [W - 3, 2], [2, H - 3], [W - 3, H - 3]]) {
    for (let v = -3; v <= 3; v++) for (let u = -3; u <= 3; u++) {
      const m = Math.abs(u) + Math.abs(v);
      if (m > 3) continue;
      P.set(cx + u, cy + v, m === 3 ? ink : m === 0 ? GOLD[3] : u + v < 0 ? GOLD[3] : GOLD[2]);
    }
  }
  compass(P, W - 12 - 3 * s, 14 + 3 * s, Math.max(6, Math.min(12, Math.round(s * 1.8))));
}
function compass(P, cx, cy, r) {
  const ink = [20, 12, 8], red = R('#5a140c', '#a8321e', '#e0603a');
  // Ring aus Goldpunkten
  for (let a = 0; a < 64; a++) { const an = (a / 64) * Math.PI * 2; if (a % 2) P.set(Math.round(cx + Math.cos(an) * (r - 2)), Math.round(cy + Math.sin(an) * (r - 2)), GOLD[2]); }
  const arm = (dx, dy, len, lit, dark) => {
    for (let k = 0; k <= len; k++) {
      const hw = Math.round((len - k) * 0.3);
      for (let u = -hw; u <= hw; u++) {
        const x = cx + dx * k + (dy !== 0 ? u : 0) + (dx !== 0 && dy !== 0 ? 0 : 0), y = cy + dy * k + (dx !== 0 ? u : 0);
        P.set(x, y, Math.abs(u) === hw && hw > 0 ? ink : (u < 0) === (dx + dy > 0) ? lit : dark);
      }
    }
  };
  // Nebenspitzen diagonal
  for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) for (let k = 1; k <= Math.round(r * 0.5); k++) { P.set(cx + dx * k, cy + dy * k, k === Math.round(r * 0.5) ? ink : GOLD[1]); }
  arm(0, 1, r, GOLD[3], GOLD[1]); arm(1, 0, r, GOLD[3], GOLD[1]); arm(-1, 0, r, GOLD[3], GOLD[1]); arm(0, -1, r + 2, red[2], red[1]);
  P.set(cx, cy, GOLD[3]);
  // „N“ über der Nordspitze
  const nx = cx - 1, ny = cy - r - 8;
  for (let k = 0; k < 4; k++) { P.set(nx - 1, ny + k, GOLD[3]); P.set(nx + 2, ny + k, GOLD[3]); P.set(nx - 2, ny + k, ink); P.set(nx + 3, ny + k, ink); }
  P.set(nx, ny + 1, GOLD[3]); P.set(nx + 1, ny + 2, GOLD[3]);
}

// ------------------------------------------------------------------ Beschriftungen
// Liefert [{ text, x, y, kind: 'town'|'area'|'portal' }] in Kachelkoordinaten (Mitte der Fläche
// bzw. Portal etwas zur Kartenmitte hin versetzt). Texte sind Inhalte des Spiels (Zonen- und
// Gebietsnamen) und werden beim Anzeigen übersetzt.
export function mapLabels(world, content) {
  const d = world.dungeon, L = d.level, T = d.pixelW / d.w, out = [];
  for (const a of L.areas ?? []) {
    const text = a.name ?? AREA_NAMES[a.id];
    if (!text) continue;
    const cx = a.x + a.w / 2, cy = a.y + a.h / 2;
    out.push({ text, anchorX: cx, anchorY: cy, kind: a.town || TOWNS.has(a.id) ? 'town' : 'area' });
  }
  for (const e of world.entities ?? []) {
    const to = e.to?.zoneId; if (!to) continue;
    const z = content?.find?.('zone', to); if (!z?.name) continue;
    // Anker etwas zur Kartenmitte hin, damit der Name neben und nicht auf dem Portal steht
    let x = e.x / T, y = e.y / T;
    const dx = d.w / 2 - x, dy = d.h / 2 - y, len = Math.hypot(dx, dy) || 1;
    x += (dx / len) * 1.5; y += (dy / len) * 1.5;
    x = Math.min(d.w - 6, Math.max(6, x)); y = Math.min(d.h - 4, Math.max(4, y));
    out.push({ text: z.name, anchorX: x, anchorY: y, kind: 'portal' });
  }
  return out;
}

// Beschriftung im Pixelstil: Bitmap-Schrift (PixelFont, Umlaute mit Punkten darüber) mit 1 px harter Kontur und
// Fußschatten, in eine eigene Ebene so groß wie das Kartenbild. Jede Beschriftung sucht sich unter mehreren Lagen die
// mit den wenigsten Hindernissen: Häuser, Mauern, Marker (avoid: [[x, y, r]] in Kartenpixeln), Rand und andere Namen.
// Ausgänge bleiben dicht an ihrem Portal. z = Bildschirmzoom: auf kleinen Schirmen wird die Schrift größer gezeichnet.
const FONT = new PixelFont();
const LABEL = { town: ['#ffd98a', '#1c0c04'], area: ['#f4e8cc', '#1a100a'], portal: ['#e2ccff', '#1a0a2a'] };
const PENALTY = { [HOUSE]: 4, [WALL]: 4, [ROCK]: 0.3, [LIQ]: 0.4, [TOP]: 0.5, [FACE]: 1 };
// Lagen in Kacheln um den Anker: Namen bleiben an ihrem Ort, egal wie groß die Schrift im Verhältnis zur Karte ist
const NEAR = [[0, 0], [0, -1.5], [0, 1.5], [-2, 0], [2, 0], [-2, -1.5], [2, -1.5], [-2, 1.5], [2, 1.5], [0, -3], [0, 3]];
const WIDE = [...NEAR, [0, -3], [0, 3], [-4, 0], [4, 0], [-3, -3], [3, -3], [-3, 3], [3, 3], [0, -5], [0, 5], [0, -7], [0, 7]];

export function renderLabels(world, content, scale, z, avoid = [], translate = (t) => t) {
  const d = world.dungeon, W = d.w * scale, H = d.h * scale;
  const { cls } = classify(d);
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  const order = { town: 0, area: 1, portal: 2 };
  const placed = [];
  for (const l of mapLabels(world, content).sort((a, b) => order[a.kind] - order[b.kind])) {
    const f = l.kind === 'town' ? Math.max(2, Math.round(3 / z)) : Math.max(1, Math.round(2 / z));
    const text = translate(l.text);
    const up = FONT.ascent(text, true);
    const tw = labelWidth(text, f) + 2, th = (5 + up) * f + 3;
    const ax = l.anchorX * scale, ay = l.anchorY * scale;
    let best = null;
    for (const [ox, oy] of l.kind === 'portal' ? NEAR : WIDE) {
      const cx = ax + ox * scale, cy = ay + oy * scale;
      const x0 = Math.round(cx - tw / 2), y0 = Math.round(cy - th / 2), x1 = x0 + tw, y1 = y0 + th;
      let score = Math.hypot(ox, oy) * 3;
      if (x0 < 6 || y0 < 6 || x1 > W - 6 || y1 > H - 6) score += 400;
      for (let ty = Math.max(0, Math.floor(y0 / scale)); ty <= Math.min(d.h - 1, Math.floor(y1 / scale)); ty++) {
        for (let tx = Math.max(0, Math.floor(x0 / scale)); tx <= Math.min(d.w - 1, Math.floor(x1 / scale)); tx++) score += PENALTY[cls[ty * d.w + tx]] ?? 0;
      }
      for (const [mx, my, r, wgt = 60] of avoid) if (mx + r > x0 && mx - r < x1 && my + r > y0 && my - r < y1) score += wgt;
      for (const p of placed) if (p[0] < x1 + 6 && p[2] + 6 > x0 && p[1] < y1 + 3 && p[3] + 3 > y0) score += 1000;
      if (!best || score < best.score) best = { score, x0, y0, x1, y1 };
    }
    // Kein freier Platz (kleine Karte, viele Namen): Gebietsname weglassen statt über andere zu schreiben
    if (best.score >= 1000 && l.kind === 'area') continue;
    // nie aus dem Bild schieben
    const x0 = Math.max(4, Math.min(W - tw - 4, best.x0)), y0 = Math.max(4, Math.min(H - th - 4, best.y0));
    placed.push([x0, y0, x0 + tw, y0 + th]);
    const [col, ink] = LABEL[l.kind], tx = x0 + 1, ty = y0 + 1 + up * f;
    drawLabel(ctx, text, tx, ty, f, col, ink);
  }
  return c;
}
// Buchstaben einzeln mit 1 px Extra-Abstand, damit die Kontur zwischen ihnen frei bleibt
const labelWidth = (text, f) => [...text].reduce((w, ch) => w + FONT.measure(ch, f, true) + f + 1, -f - 1);
function drawLabel(ctx, text, x, y, f, col, ink) {
  for (const pass of [ink, col]) {
    let cx = x;
    for (const ch of text) {
      if (pass === ink) for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, 2], [1, 2], [-1, 2]]) FONT.draw(ctx, ch, cx + ox, y + oy, { color: ink, scale: f, raw: true });
      else FONT.draw(ctx, ch, cx, y, { color: col, scale: f, raw: true });
      cx += FONT.measure(ch, f, true) + f + 1;
    }
  }
}
