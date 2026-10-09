import { makeCanvas } from '../gfx/PixelCanvas.js';
import { hash2 } from '../core/math.js';
import { PixelFont } from './PixelFont.js';
import { tr } from '../i18n/index.js';

// Gezeichnete Zonenkarte im Pixelstil – Thread D.
// Aus dem Zeichenraster der Zone (level.map), den Deko-Platzierungen und den Flächen entsteht
// eine Karte wie auf altem Pergament: Papierkorn, farbige Lavierung je Gelände, Tuschekanten,
// Wellenstriche im Wasser, Bergspitzen auf Fels, Bäume, Häuser, Zelte und Türme als kleine Symbole.
// Liest nur world.dungeon (rows, terrain, solid, placements, level) – nichts wird geschrieben.
// Neue oder größere Gebiete funktionieren ohne Änderung; Beschriftungen kommen aus
// level.areas[].name (falls gesetzt) oder aus AREA_NAMES.

const INK = [52, 36, 24];
const PAPER = [214, 196, 152];

// Lavierung je Gelände und Biom: [r, g, b, Deckkraft]
const WASH = {
  outdoor: { ground: [124, 146, 82, 0.5], dirt: [170, 132, 84, 0.45], rock: [116, 98, 80, 0.62], water: [66, 116, 150, 0.78] },
  ashwood: { ground: [116, 126, 88, 0.5], dirt: [158, 128, 90, 0.45], rock: [110, 100, 86, 0.62], water: [70, 112, 140, 0.78] },
  cinder: { ground: [134, 110, 92, 0.52], dirt: [156, 108, 80, 0.5], rock: [88, 74, 70, 0.68], water: [210, 72, 26, 0.9] },
  steppe: { ground: [196, 164, 96, 0.42], dirt: [160, 116, 72, 0.45], rock: [128, 104, 78, 0.6], water: [74, 118, 146, 0.78] },
  marsh: { ground: [100, 122, 80, 0.55], dirt: [124, 112, 78, 0.5], rock: [96, 100, 82, 0.62], water: [74, 106, 94, 0.8] },
  frost: { ground: [236, 240, 244, 0.6], dirt: [196, 200, 206, 0.5], rock: [132, 150, 178, 0.66], water: [96, 140, 186, 0.78] },
  wastes: { ground: [164, 102, 70, 0.5], dirt: [134, 66, 46, 0.55], rock: [78, 62, 60, 0.7], water: [214, 74, 24, 0.9] },
};
const PAVE = [226, 210, 172, 0.7];
const ROOF = [146, 60, 44];
const PALISADE = [96, 66, 40];
// Dungeons: heller Boden, schraffierte Wände; Flüssigkeit je Biom
const DUNGEON = {
  crypt: { floor: [228, 214, 176, 0.5], wall: [116, 96, 74, 0.7], liquid: [70, 110, 140, 0.8] },
  temple: { floor: [214, 216, 186, 0.5], wall: [92, 108, 100, 0.7], liquid: [60, 120, 136, 0.8] },
  forge: { floor: [224, 196, 160, 0.5], wall: [112, 82, 68, 0.72], liquid: [206, 76, 28, 0.88] },
  barrow: { floor: [210, 214, 200, 0.5], wall: [92, 100, 106, 0.72], liquid: [70, 104, 120, 0.8] },
  spore: { floor: [206, 214, 170, 0.5], wall: [94, 104, 72, 0.72], liquid: [112, 150, 60, 0.82] },
  rime: { floor: [226, 234, 238, 0.55], wall: [108, 126, 150, 0.72], liquid: [96, 150, 196, 0.8] },
  throne: { floor: [226, 198, 164, 0.5], wall: [104, 72, 62, 0.74], liquid: [210, 80, 30, 0.88] },
};
const LAVA_BIOMES = new Set(['cinder', 'wastes', 'forge', 'throne']);

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
// Städte (Lager mit Händlern) bekommen ein Banner neben dem Namen
const TOWNS = new Set(['ashwood_camp', 'rookwatch', 'steppe_outpost', 'mirefort', 'frosthold', 'last_bastion']);

// Deko-Namen -> Kartensymbol
function glyphKind(name) {
  const n = name.toLowerCase();
  if (/willow/.test(n)) return 'willow';
  if (/snowpine/.test(n)) return 'snowpine';
  if (/pine/.test(n)) return 'pine';
  if (/dead|scorched|birch|stump/.test(n)) return 'deadtree';
  if (/tree/.test(n)) return 'deadtree';
  if (/mushroom/.test(n)) return 'mushroom';
  if (/tent|yurt/.test(n)) return 'tent';
  if (/tower/.test(n)) return 'tower';
  if (/ruin/.test(n)) return 'ruin';
  if (/house|hut|longhouse|stable/.test(n)) return 'house';
  if (/rock|boulder|obsidian|basalt|crystal|shard/.test(n)) return 'rock';
  if (/campfire|forge|geyser|vent/.test(n)) return 'fire';
  if (/grave|stone|cairn|bones|mound/.test(n)) return 'stone';
  if (/reed|grass|bush|bramble|shrub|drift|dune/.test(n)) return 'tuft';
  return null;
}

const TREES = new Set(['pine', 'snowpine', 'willow', 'deadtree']);

function forestMask(d) {
  const T = d.pixelW / d.w, n = new Uint8Array(d.w * d.h), out = new Uint8Array(d.w * d.h);
  for (const pl of d.placements) {
    if (!TREES.has(glyphKind(pl.type === 'bdecor' ? pl.name : pl.type) ?? '')) continue;
    const tx = Math.floor(pl.x / T), ty = Math.floor(pl.y / T);
    if (tx >= 0 && ty >= 0 && tx < d.w && ty < d.h) n[ty * d.w + tx]++;
  }
  for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
    let c = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < d.w && yy < d.h) c += n[yy * d.w + xx]; }
    out[y * d.w + x] = c >= 4 ? 1 : 0;
  }
  return out;
}

// ------------------------------------------------------------------ Gelände je Kachel
function classify(d) {
  const L = d.level, outdoor = L.kind === 'outdoor';
  const biome = L.biome ?? (outdoor ? 'outdoor' : 'crypt');
  const lava = LAVA_BIOMES.has(biome);
  const extraSolid = new Set(L.solid ?? []);
  const rockChars = new Set(L.rockChars ?? []);   // Biome, die Fels selbst malen (z. B. Steppe '%'), zeigen ihn als Fels statt Palisade
  const cls = new Array(d.w * d.h);
  for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
    const ch = d.rows[y][x], i = y * d.w + x;
    if (!outdoor) {
      cls[i] = ch === '#' ? 'dwall' : ch === '~' ? (lava ? 'lava' : 'water') : d.solid[i] && ch !== '~' && /[#]/.test(ch) ? 'dwall' : 'floor';
      continue;
    }
    if (ch === '#' || rockChars.has(ch)) cls[i] = 'rock';
    else if (ch === '~') cls[i] = lava ? 'lava' : 'water';
    else if (ch === '=') cls[i] = 'fissure';
    else if (ch === 'H') cls[i] = 'house';
    else if (ch === 'f' || extraSolid.has(ch)) cls[i] = 'wall';
    else {
      const t = d.terrain[y][x];
      cls[i] = t === ':' ? 'pave' : t === '.' ? 'dirt' : t === '~' ? (lava ? 'lava' : 'water') : t === '#' ? 'rock' : 'ground';
    }
  }
  return { cls, biome, outdoor };
}

function vn(x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed), c = hash2(x0, y0 + 1, seed), e = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + e) * sx * sy;
}

// Kategorien, zwischen denen eine Tuschekante gezogen wird
const EDGE_GROUP = { ground: 0, dirt: 0, pave: 0, house: 0, fissure: 0, floor: 0, rock: 1, water: 2, lava: 3, wall: 4, dwall: 5 };

// ------------------------------------------------------------------ Kartenbild
const cache = new WeakMap(); // world -> { key: canvas }

export function renderZoneMap(world, scale, { detail = true, frame = detail } = {}) {
  let entry = cache.get(world);
  if (!entry) { entry = {}; cache.set(world, entry); }
  const key = `${scale}|${detail ? 1 : 0}|${frame ? 1 : 0}`;
  if (entry[key]) return entry[key];
  const d = world.dungeon;
  const { cls, biome, outdoor } = classify(d);
  const W = d.w * scale, H = d.h * scale;
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H), px = img.data;
  const wash = outdoor ? (WASH[biome] ?? WASH.outdoor) : null;
  const dun = outdoor ? null : (DUNGEON[biome] ?? DUNGEON.crypt);

  // Walddichte je Kachel: dichte Baumgruppen bekommen eine dunklere Laubfläche, Lichtungen bleiben hell
  const forest = outdoor ? forestMask(d) : null;

  // Gelände je Pixel mit leicht verrauschter Grenze (wirkt gezeichnet statt gekachelt)
  const pc = new Array(W * H);
  const jit = Math.max(0.5, scale * 0.45);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const jx = x + (vn(x / (scale * 1.6), y / (scale * 1.6), 3) - 0.5) * jit * 2;
    const jy = y + (vn(x / (scale * 1.6), y / (scale * 1.6), 4) - 0.5) * jit * 2;
    const tx = Math.min(d.w - 1, Math.max(0, Math.floor(jx / scale))), ty = Math.min(d.h - 1, Math.max(0, Math.floor(jy / scale)));
    let k = cls[ty * d.w + tx];
    // Mauern, Häuser und Palisaden bleiben kantig
    const exact = cls[Math.floor(y / scale) * d.w + Math.floor(x / scale)];
    if (exact === 'wall' || exact === 'house' || k === 'wall' || k === 'house') k = exact;
    pc[y * W + x] = k;
  }

  const mix = (i, col, a) => { px[i] += (col[0] - px[i]) * a; px[i + 1] += (col[1] - px[i + 1]) * a; px[i + 2] += (col[2] - px[i + 2]) * a; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, k = pc[y * W + x];
    // Papier: Flecken, Fasern, feines Korn, dunklere Ränder
    const blot = vn(x / 22, y / 22, 7) * 0.6 + vn(x / 7, y / 7, 8) * 0.4;
    const grain = hash2(x, y, 9);
    const ex = Math.min(x, W - 1 - x) / W, ey = Math.min(y, H - 1 - y) / H;
    const vig = Math.min(1, Math.min(ex, ey) * 9);
    const p = 0.84 + blot * 0.16 + (grain < 0.08 ? -0.06 : 0) - (1 - vig) * 0.18;
    px[i] = PAPER[0] * p; px[i + 1] = PAPER[1] * p; px[i + 2] = PAPER[2] * p; px[i + 3] = 255;
    // Lavierung: ungleichmäßig wie mit dem Pinsel aufgetragen
    const brush = 0.82 + vn(x / 5, y / 5, 10) * 0.3;
    if (outdoor) {
      if (k === 'ground') {
        mix(i, wash.ground, wash.ground[3] * brush);
        const fx = Math.floor((x + (vn(x / 6, y / 6, 12) - 0.5) * scale * 1.6) / scale), fy = Math.floor((y + (vn(x / 6, y / 6, 13) - 0.5) * scale * 1.6) / scale);
        if (forest[Math.max(0, Math.min(d.h - 1, fy)) * d.w + Math.max(0, Math.min(d.w - 1, fx))]) mix(i, biome === 'frost' ? [150, 176, 168] : [58, 84, 46], 0.32 * brush);
      }
      else if (k === 'dirt') mix(i, wash.dirt, wash.dirt[3] * brush);
      else if (k === 'pave') { mix(i, wash.ground, wash.ground[3] * 0.5); mix(i, PAVE, PAVE[3]); }
      else if (k === 'rock') mix(i, wash.rock, wash.rock[3] * brush);
      else if (k === 'water' || k === 'lava') {
        const col = k === 'lava' && !LAVA_BIOMES.has(biome) ? [200, 72, 30] : wash.water;
        mix(i, col, Math.min(1, col[3] * brush));
      } else if (k === 'fissure') { mix(i, wash.ground, wash.ground[3]); mix(i, [96, 30, 20], 0.75); }
      else if (k === 'house') mix(i, ROOF, 0.9);
      else if (k === 'wall') mix(i, PALISADE, 0.92);
    } else {
      if (k === 'floor') mix(i, dun.floor, dun.floor[3] * brush);
      else if (k === 'dwall') {
        mix(i, dun.wall, dun.wall[3] * brush);
        // Schraffur in Wänden
        if ((x + y) % 4 === 0) mix(i, INK, 0.28);
      } else mix(i, dun.liquid, dun.liquid[3]);
    }
  }

  // Tuschekanten zwischen Geländegruppen (eine Pixelreihe auf der dunkleren Seite)
  const grp = (k) => EDGE_GROUP[k] ?? 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = pc[y * W + x], g = grp(k);
    if (g === 0) continue;
    let edge = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (grp(pc[ny * W + nx]) !== g) { edge = true; break; }
    }
    if (!edge) continue;
    const i = (y * W + x) * 4;
    const a = k === 'water' ? 0.55 : k === 'lava' ? 0.7 : k === 'dwall' ? 0.85 : 0.72;
    mix(i, k === 'water' ? [36, 54, 72] : k === 'lava' ? [70, 20, 10] : INK, a);
  }
  // Ufer: helle Brandungslinie im Wasser direkt neben der Kante
  if (scale >= 3) for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const k = pc[y * W + x];
    if (k !== 'water') continue;
    let near = false;
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) { const n = pc[(y + dy) * W + x + dx]; if (n && n !== 'water' && n !== 'lava') near = true; }
    if (near && pc[y * W + x + 1] === 'water' && pc[y * W + x - 1] === 'water' && pc[(y + 1) * W + x] === 'water' && pc[(y - 1) * W + x] === 'water') mix((y * W + x) * 4, [200, 220, 226], 0.35);
  }
  // Wellenstriche im Wasser, Krusten in Lava, Riss in Glutspalten, Pflaster gestrichelt
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = pc[y * W + x], i = (y * W + x) * 4;
    if ((k === 'water' || k === 'lava') && scale >= 3) {
      const cx = Math.floor(x / 7), cy = Math.floor(y / 5);
      if (hash2(cx, cy, 31) < 0.35) {
        const ox = cx * 7 + Math.floor(hash2(cx, cy, 32) * 3), oy = cy * 5 + 2;
        const u = x - ox, v = y - oy;
        // kleine „~“-Welle: 4 Pixel, mittig eine Stufe höher
        if ((v === 0 && (u === 0 || u === 3)) || (v === -1 && (u === 1 || u === 2))) {
          if (pc[(y + 1) * W + x] === k && pc[(y - 2) * W + x] === k) mix(i, k === 'lava' ? [255, 196, 90] : [30, 54, 76], k === 'lava' ? 0.7 : 0.55);
        }
      }
    }
    if (k === 'fissure' && vn(x / 3, y / 3, 41) > 0.55) mix(i, [255, 120, 40], 0.65);
    if (k === 'pave' && scale >= 3 && (x + y) % 3 !== 0) {
      let edge = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = pc[(y + dy) * W + x + dx]; if (n && n !== 'pave' && n !== 'house' && n !== 'wall') edge = true; }
      if (edge) mix(i, INK, 0.4);
    }
  }
  ctx.putImageData(img, 0, 0);

  if (detail && scale >= 3) {
    const at = (tx, ty) => cls[ty * d.w + tx];
    if (outdoor) drawMountains(ctx, d, at, scale, biome);
    drawHouses(ctx, d, cls, scale);
    drawPlacements(ctx, d, scale, biome, outdoor, forest);
  }
  else if (outdoor && scale >= 2) {
    // Minimap: Bäume als zweifarbige Tupfen, damit Wälder lesbar bleiben
    const T = d.pixelW / d.w;
    for (const pl of d.placements) {
      const kind = glyphKind(pl.type === 'bdecor' ? pl.name : pl.type);
      if (kind !== 'pine' && kind !== 'snowpine' && kind !== 'willow' && kind !== 'deadtree') continue;
      const x = Math.round((pl.x / T) * scale), y = Math.round((pl.y / T) * scale) - 1;
      if (kind === 'deadtree') { put(ctx, x, y, 'rgba(52,36,24,0.7)'); continue; }
      const g = biome === 'frost' ? [70, 104, 92] : biome === 'ashwood' ? [70, 84, 58] : [52, 96, 52];
      put(ctx, x, y - 1, rgb(g, 1.3)); put(ctx, x, y, rgb(g, 0.75)); put(ctx, x + 1, y, rgb(g, 0.6));
    }
  }
  if (frame) drawFrame(ctx, W, H, scale);
  entry[key] = c;
  return c;
}

// ------------------------------------------------------------------ Symbole
const put = (ctx, x, y, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); };
const rgb = (c, k = 1) => `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;

// Bergspitzen auf Felsflächen: nur dort, wo der Fels mindestens 2×2 Kacheln dick ist
function drawMountains(ctx, d, at, s, biome) {
  const snow = biome === 'frost';
  const rock = (WASH[biome] ?? WASH.outdoor).rock;
  const light = rgb(rock, snow ? 1.7 : 1.35), dark = rgb(rock, 0.62), ink = rgb(INK);
  const step = 2;
  for (let ty = 0; ty < d.h - 1; ty += step) for (let tx = 0; tx < d.w - 1; tx += step) {
    const ox = tx + (hash2(tx, ty, 51) < 0.5 ? 0 : 1), oy = ty + (hash2(tx, ty, 52) < 0.5 ? 0 : 1);
    if (ox >= d.w - 1 || oy >= d.h - 1) continue;
    const solid2 = at(ox, oy) === 'rock' && at(ox + 1, oy) === 'rock' && at(ox, oy + 1) === 'rock' && at(ox + 1, oy + 1) === 'rock';
    const thin = !solid2 && at(ox, oy) === 'rock' && at(ox, oy + 1) === 'rock';
    if (!solid2 && !thin) continue;
    if (hash2(ox, oy, 53) < 0.18) continue;
    const big = solid2 && hash2(ox, oy, 54) < 0.45;
    const hgt = big ? Math.round(s * 1.6) : Math.round(s * 1.15);
    const cx = Math.round((ox + (solid2 ? 1 : 0.5)) * s + (hash2(ox, oy, 55) - 0.5) * s * (solid2 ? 1 : 0.4)), base = Math.round((oy + 1.7) * s);
    for (let r = 0; r <= hgt; r++) {
      const half = Math.round(r * 0.9);
      for (let u = -half; u <= half; u++) {
        const edge = u === -half || u === half;
        const capped = snow ? r < hgt * 0.4 : r < 2;
        put(ctx, cx + u, base - hgt + r, edge ? ink : u < 0 ? (capped && snow ? '#f4f6f8' : light) : (capped && snow ? '#c8d4e2' : dark));
      }
    }
    // Schraffur auf der Schattenseite
    for (let r = 2; r < hgt; r += 2) put(ctx, cx + Math.round(r * 0.45), base - hgt + r, ink);
  }
}

// Häuser: jede zusammenhängende H-Fläche bekommt ein Dach mit First und Giebel
function drawHouses(ctx, d, cls, s) {
  const seen = new Uint8Array(d.w * d.h);
  for (let ty = 0; ty < d.h; ty++) for (let tx = 0; tx < d.w; tx++) {
    const i = ty * d.w + tx;
    if (cls[i] !== 'house' || seen[i]) continue;
    let x0 = tx, x1 = tx, y0 = ty, y1 = ty;
    const stack = [i]; seen[i] = 1;
    while (stack.length) {
      const j = stack.pop(), x = j % d.w, y = (j - x) / d.w;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, n = ny * d.w + nx;
        if (nx >= 0 && ny >= 0 && nx < d.w && ny < d.h && !seen[n] && cls[n] === 'house') { seen[n] = 1; stack.push(n); }
      }
    }
    house(ctx, x0 * s, y0 * s, (x1 - x0 + 1) * s, (y1 - y0 + 1) * s);
  }
}
function house(ctx, x, y, w, h) {
  const ink = rgb(INK);
  ctx.fillStyle = rgb(ROOF, 1.12); ctx.fillRect(x, y, w, Math.ceil(h / 2));
  ctx.fillStyle = rgb(ROOF, 0.78); ctx.fillRect(x, y + Math.ceil(h / 2), w, Math.floor(h / 2));
  ctx.fillStyle = ink;
  ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
  ctx.fillStyle = rgb(ROOF, 1.4); ctx.fillRect(x + 1, y + Math.ceil(h / 2) - 1, w - 2, 1); // First
  // Schindeln
  ctx.fillStyle = rgb(ROOF, 0.6);
  for (let yy = y + 2; yy < y + h - 1; yy += 2) for (let xx = x + 1 + ((yy - y) % 4 === 0 ? 1 : 0); xx < x + w - 1; xx += 3) ctx.fillRect(xx, yy, 1, 1);
}

function drawPlacements(ctx, d, s, biome, outdoor, forest) {
  const T = d.pixelW / d.w;
  const list = [...d.placements].sort((a, b) => a.y - b.y);
  for (const pl of list) {
    const name = pl.type === 'bdecor' ? pl.name : pl.type;
    const x = Math.round((pl.x / T) * s), y = Math.round((pl.y / T) * s);
    if (!outdoor) { dungeonGlyph(ctx, pl.type === 'bdecor' ? pl.name : pl.type, x, y, s, biome); continue; }
    const kind = glyphKind(name);
    // In dichtem Wald nur etwa jeden zweiten Baum zeichnen: Laubfläche trägt die Masse, Bäume bilden Gruppen
    if (TREES.has(kind) && forest?.[pl.ty * d.w + pl.tx] && hash2(pl.tx, pl.ty, 71) < 0.42) continue;
    if (kind) glyph(ctx, kind, x, y - Math.round(s * 0.4), s, biome, pl.tx * 31 + pl.ty);
  }
}

function glyph(ctx, kind, x, y, s, biome, seed) {
  const ink = rgb(INK);
  const big = s >= 4;
  switch (kind) {
    case 'pine': case 'snowpine': {
      const g = biome === 'frost' || kind === 'snowpine' ? [70, 104, 92] : biome === 'ashwood' ? [70, 84, 58] : [52, 96, 52];
      const hgt = big ? 7 : 5;
      for (let r = 0; r < hgt; r++) {
        const half = Math.floor((r + 1) / 2) + (r > hgt - 3 ? 0 : 0);
        for (let u = -half; u <= half; u++) put(ctx, x + u, y - hgt + r + 1, u === -half || u === half ? ink : u < 0 ? rgb(g, 1.35) : rgb(g, 0.8));
      }
      if (kind === 'snowpine' || biome === 'frost') { put(ctx, x, y - hgt + 1, '#f4f6f8'); put(ctx, x - 1, y - hgt + 3, '#f4f6f8'); }
      put(ctx, x, y + 1, ink);
      break;
    }
    case 'willow': {
      const g = [84, 112, 66];
      for (let v = -3; v <= 0; v++) for (let u = -3; u <= 3; u++) if (u * u + (v + 1.5) * (v + 1.5) * 2 < 10) put(ctx, x + u, y + v - 2, Math.abs(u) === 3 || v === -3 ? ink : u < 0 ? rgb(g, 1.3) : rgb(g, 0.85));
      for (let u = -2; u <= 2; u += 2) put(ctx, x + u, y - 1, rgb(g, 0.7));
      put(ctx, x, y, ink);
      break;
    }
    case 'deadtree': {
      put(ctx, x, y, ink); put(ctx, x, y - 1, ink); put(ctx, x, y - 2, ink); put(ctx, x, y - 3, ink);
      put(ctx, x - 1, y - 3, ink); put(ctx, x - 2, y - 4, ink); put(ctx, x + 1, y - 2, ink); put(ctx, x + 2, y - 3, ink);
      if (big) { put(ctx, x, y - 4, ink); put(ctx, x + 2, y - 4, ink); }
      break;
    }
    case 'mushroom': {
      const cap = [150, 90, 140];
      for (let u = -2; u <= 2; u++) put(ctx, x + u, y - 2, Math.abs(u) === 2 ? ink : rgb(cap, u < 0 ? 1.3 : 0.9));
      for (let u = -1; u <= 1; u++) put(ctx, x + u, y - 3, ink);
      put(ctx, x, y - 1, '#e8dcc0'); put(ctx, x, y, ink);
      break;
    }
    case 'tent': {
      const col = [188, 160, 116];
      for (let r = 0; r < 4; r++) for (let u = -r; u <= r; u++) put(ctx, x + u, y - 3 + r, u === -r || u === r || r === 3 ? ink : u < 0 ? rgb(col, 1.15) : rgb(col, 0.8));
      put(ctx, x, y - 1, ink); put(ctx, x, y, ink);
      break;
    }
    case 'tower': {
      ctx.fillStyle = ink; ctx.fillRect(x - 2, y - 6, 5, 7);
      ctx.fillStyle = '#9a8a74'; ctx.fillRect(x - 1, y - 5, 3, 5);
      ctx.fillStyle = ink; ctx.fillRect(x - 2, y - 7, 1, 1); ctx.fillRect(x, y - 7, 1, 1); ctx.fillRect(x + 2, y - 7, 1, 1);
      put(ctx, x, y - 3, '#ffd070');
      break;
    }
    case 'house': {
      house(ctx, x - 3, y - 4, 7, 5);
      break;
    }
    case 'ruin': {
      // eingestürzte Mauerecke
      ctx.fillStyle = ink; ctx.fillRect(x - 3, y - 1, 5, 1); ctx.fillRect(x - 3, y - 4, 1, 3); ctx.fillRect(x - 1, y - 2, 1, 1); ctx.fillRect(x + 1, y - 3, 1, 2);
      put(ctx, x + 3, y, ink);
      break;
    }
    case 'rock': {
      const r = biome === 'frost' ? [150, 170, 196] : [128, 116, 104];
      put(ctx, x - 1, y - 1, ink); put(ctx, x, y - 2, ink); put(ctx, x + 1, y - 1, ink); put(ctx, x + 2, y, ink); put(ctx, x - 2, y, ink);
      put(ctx, x, y - 1, rgb(r, 1.3)); put(ctx, x - 1, y, rgb(r, 1.2)); put(ctx, x, y, rgb(r)); put(ctx, x + 1, y, rgb(r, 0.8));
      break;
    }
    case 'fire': {
      put(ctx, x, y - 2, '#ffd070'); put(ctx, x - 1, y - 1, '#ff8a2a'); put(ctx, x, y - 1, '#ffe8a0'); put(ctx, x + 1, y - 1, '#ff8a2a'); put(ctx, x, y, '#c04010');
      break;
    }
    case 'stone': {
      put(ctx, x, y - 1, ink); put(ctx, x, y, ink);
      break;
    }
    case 'tuft': {
      if (hash2(seed, 1, 61) < 0.5) break; // nur jede zweite Stelle, sonst zu unruhig
      const col = biome === 'frost' ? [170, 184, 200] : biome === 'wastes' || biome === 'cinder' ? [110, 86, 74] : [78, 96, 56];
      put(ctx, x - 1, y, rgb(col)); put(ctx, x, y - 1, rgb(col)); put(ctx, x + 1, y, rgb(col));
      break;
    }
    default: break;
  }
}

function dungeonGlyph(ctx, name, x, y, s, biome) {
  const ink = rgb(INK), n = name.toLowerCase();
  if (/pillar|column/.test(n)) { ctx.fillStyle = ink; ctx.fillRect(x - 1, y - 2, 3, 3); ctx.fillStyle = '#9a8a74'; ctx.fillRect(x, y - 1, 1, 1); }
  else if (/brazier|candles|campfire/.test(n)) { put(ctx, x, y - 2, '#ff8a2a'); put(ctx, x, y - 1, '#ffe08a'); }
  else if (/stairs/.test(n)) { ctx.fillStyle = ink; for (let k = 0; k < 3; k++) ctx.fillRect(x - 2 + k, y - 3 + k * 2, 5 - k * 2 + 1, 1); }
  else if (/sarcophag|altar|throne|dais/.test(n)) { ctx.fillStyle = ink; ctx.fillRect(x - 2, y - 2, 5, 3); ctx.fillStyle = '#b8a888'; ctx.fillRect(x - 1, y - 1, 3, 1); }
  else if (/statue|stone|cairn|warrior/.test(n)) { ctx.fillStyle = ink; ctx.fillRect(x, y - 3, 1, 3); ctx.fillRect(x - 1, y - 1, 3, 1); }
  else if (/mushroom|pod/.test(n)) { put(ctx, x - 1, y - 2, rgb([150, 90, 140])); put(ctx, x, y - 2, rgb([150, 90, 140])); put(ctx, x + 1, y - 2, rgb([150, 90, 140])); put(ctx, x, y - 1, ink); }
  else if (/crystal|ice/.test(n)) { put(ctx, x, y - 3, '#e8f4ff'); put(ctx, x, y - 2, '#a8d0f0'); put(ctx, x - 1, y - 1, '#a8d0f0'); put(ctx, x + 1, y - 1, ink); }
}

// Doppelter Tuscherahmen mit Ecken und Windrose oben rechts
function drawFrame(ctx, W, H, s) {
  const ink = rgb(INK), soft = 'rgba(52,36,24,0.55)';
  ctx.fillStyle = ink;
  ctx.fillRect(0, 0, W, 2); ctx.fillRect(0, H - 2, W, 2); ctx.fillRect(0, 0, 2, H); ctx.fillRect(W - 2, 0, 2, H);
  ctx.fillStyle = soft;
  ctx.fillRect(4, 4, W - 8, 1); ctx.fillRect(4, H - 5, W - 8, 1); ctx.fillRect(4, 4, 1, H - 8); ctx.fillRect(W - 5, 4, 1, H - 8);
  // Eckornamente
  for (const [cx, cy, sx, sy] of [[4, 4, 1, 1], [W - 5, 4, -1, 1], [4, H - 5, 1, -1], [W - 5, H - 5, -1, -1]]) {
    ctx.fillStyle = ink;
    for (let k = 0; k < 6; k++) ctx.fillRect(cx + sx * k, cy + sy * k, 1, 1);
    ctx.fillRect(cx + sx * 2, cy, 1, 1); ctx.fillRect(cx, cy + sy * 2, 1, 1);
    ctx.fillStyle = '#8a2a1a'; ctx.fillRect(cx + sx * 3, cy + sy * 3, 1, 1);
  }
  compass(ctx, W - 10 - 4 * s, 10 + 4 * s, Math.max(6, s * 3));
}
function compass(ctx, cx, cy, r) {
  const ink = rgb(INK), red = '#8a2a1a', pale = 'rgba(244,232,200,0.9)';
  // Ring
  ctx.fillStyle = 'rgba(52,36,24,0.5)';
  for (let a = 0; a < 48; a++) { const an = (a / 48) * Math.PI * 2; ctx.fillRect(Math.round(cx + Math.cos(an) * (r - 1)), Math.round(cy + Math.sin(an) * (r - 1)), 1, 1); }
  // Vier Spitzen: Nord rot, Rest Tusche; je eine helle und eine dunkle Hälfte
  const arm = (dx, dy, len, col) => {
    for (let k = 0; k <= len; k++) {
      const w = Math.round((len - k) * 0.35);
      for (let u = -w; u <= w; u++) {
        const x = cx + dx * k + (dy !== 0 ? u : 0), y = cy + dy * k + (dx !== 0 ? u : 0);
        ctx.fillStyle = u === 0 ? col : (u < 0) === (dx + dy > 0) ? pale : col;
        ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
    }
  };
  arm(0, 1, r, ink); arm(1, 0, r, ink); arm(-1, 0, r, ink); arm(0, -1, r + 2, red);
  ctx.fillStyle = ink; ctx.fillRect(cx, cy, 1, 1);
  // „N“ über der Nordspitze
  const nx = cx - 1, ny = cy - r - 7;
  ctx.fillStyle = ink;
  ctx.fillRect(nx - 1, ny, 1, 4); ctx.fillRect(nx + 2, ny, 1, 4); ctx.fillRect(nx, ny + 1, 1, 1); ctx.fillRect(nx + 1, ny + 2, 1, 1);
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
    out.push({ text, x: cx, y: cy, anchorX: cx, anchorY: cy, kind: a.town || TOWNS.has(a.id) ? 'town' : 'area' });
  }
  for (const e of world.entities ?? []) {
    const to = e.to?.zoneId; if (!to) continue;
    const z = content?.find?.('zone', to); if (!z?.name) continue;
    // Anker etwas zur Kartenmitte hin, damit der Name neben und nicht auf dem Portal steht
    let x = e.x / T, y = e.y / T;
    const dx = d.w / 2 - x, dy = d.h / 2 - y, len = Math.hypot(dx, dy) || 1;
    x += (dx / len) * 4; y += (dy / len) * 3;
    x = Math.min(d.w - 6, Math.max(6, x)); y = Math.min(d.h - 4, Math.max(4, y));
    out.push({ text: z.name, x, y, anchorX: x, anchorY: y, kind: 'portal' });
  }
  return out;
}

// ------------------------------------------------------------------ Beschriftung im Pixelstil
// Zeichnet die Namen mit der Pixelschrift in eine eigene Ebene (gleiche Größe wie das Kartenbild).
// Jede Beschriftung sucht sich unter mehreren Lagen die mit den wenigsten Hindernissen: Mauern,
// Häuser, Fels, Wasser, Marker (avoid: [[x, y, r]] in Kartenpixeln), Rand und andere Namen.
// z = Bildschirmzoom: auf kleinen Schirmen wird die Schrift größer gezeichnet, damit sie lesbar bleibt.
const FONT = new PixelFont();
const LABEL_INK = { town: '#5a1a10', area: '#2e1e12', portal: '#3e1e66' };
const PENALTY = { wall: 6, house: 6, rock: 1.2, water: 1.5, lava: 2, dwall: 2 };
const UMLAUT = { Ä: 'A', Ö: 'O', Ü: 'U' };

// Pixelschrift mit Umlauten als Grundbuchstabe plus zwei Punkte darüber (die 5-px-Glyphen sind dafür zu klein)
function drawText(ctx, text, x, y, f, color) {
  let cx = x;
  for (const ch0 of text) {
    const ch = ch0 === 'ß' ? 'ß' : ch0.toUpperCase();
    const base = UMLAUT[ch] ?? ch;
    let gw;
    if (ch === 'ß') {
      // eigene Glyphe zeichnen: PixelFont macht aus ß sonst „SS“
      const gl = FONT.glyphs['ß']; ctx.fillStyle = color;
      gl.rows.forEach((row, ry) => [...row].forEach((p, rx) => { if (p === '#') ctx.fillRect(cx + rx * f, y + ry * f, f, f); }));
      gw = gl.w * f;
    } else { FONT.draw(ctx, base, cx, y, { color, scale: f }); gw = FONT.measure(base, f); }
    if (UMLAUT[ch]) { ctx.fillStyle = color; ctx.fillRect(cx, y - 2 * f, f, f); ctx.fillRect(cx + gw - f, y - 2 * f, f, f); }
    cx += gw + f;
  }
}
const measureText = (text, f) => [...text].reduce((w, ch0) => { const ch = ch0 === 'ß' ? 'ß' : ch0.toUpperCase(); return w + (ch === 'ß' ? FONT.glyphs['ß'].w * f : FONT.measure(UMLAUT[ch] ?? ch, f)) + f; }, -f);

export function renderLabels(world, content, scale, z, avoid = []) {
  const d = world.dungeon, W = d.w * scale, H = d.h * scale, T = d.pixelW / d.w;
  const { cls } = classify(d);
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  const placed = [];
  const order = { town: 0, area: 1, portal: 2 };
  const labels = mapLabels(world, content).sort((a, b) => order[a.kind] - order[b.kind]);
  for (const l of labels) {
    const f = l.kind === 'town' ? Math.max(1, Math.round(3 / z)) : Math.max(1, Math.round(2 / z));
    const text = tr(l.text);
    const tw = measureText(text, f) + (l.kind === 'town' ? 5 * f : 0), th = 7 * f;
    const ax = l.anchorX * scale, ay = l.anchorY * scale;
    const cands = [];
    for (const [ox, oy] of [[0, 0], [0, -1.6], [0, 1.6], [0, -3], [0, 3], [-0.7, 0], [0.7, 0], [-0.7, -1.8], [0.7, -1.8], [-0.7, 1.8], [0.7, 1.8], [0, -4.5], [0, 4.5]]) cands.push([ax + ox * tw, ay + oy * th]);
    let best = null;
    for (const [cx, cy] of cands) {
      const x0 = Math.round(cx - tw / 2) - 2, y0 = Math.round(cy - th / 2) - 2, x1 = x0 + tw + 4, y1 = y0 + th + 4;
      let score = Math.hypot(cx - ax, cy - ay) * 0.04;
      if (x0 < 8 || y0 < 8 || x1 > W - 8 || y1 > H - 8) score += 400;
      for (let ty = Math.max(0, Math.floor(y0 / scale)); ty <= Math.min(d.h - 1, Math.floor(y1 / scale)); ty++) {
        for (let tx = Math.max(0, Math.floor(x0 / scale)); tx <= Math.min(d.w - 1, Math.floor(x1 / scale)); tx++) score += PENALTY[cls[ty * d.w + tx]] ?? 0;
      }
      for (const [mx, my, r] of avoid) if (mx + r > x0 && mx - r < x1 && my + r > y0 && my - r < y1) score += 60;
      for (const p of placed) if (p[0] < x1 && p[2] > x0 && p[1] < y1 && p[3] > y0) score += 200;
      if (!best || score < best.score) best = { score, x0, y0, x1, y1 };
    }
    placed.push([best.x0, best.y0, best.x1, best.y1]);
    const tx = best.x0 + 2, ty = best.y0 + 2 + 2 * f;
    // Pergament-Plakette mit Tuschekante hinter jedem Namen: lesbar auf jedem Gelände
    const px0 = best.x0, py0 = best.y0, pw = best.x1 - best.x0, ph = best.y1 - best.y0;
    ctx.fillStyle = 'rgba(40,26,16,0.35)'; ctx.fillRect(px0 + 1, py0 + 1, pw, ph);
    ctx.fillStyle = '#2e1e12'; ctx.fillRect(px0, py0, pw, ph);
    ctx.fillStyle = l.kind === 'town' ? '#f2e6c8' : '#eadcb8'; ctx.fillRect(px0 + 1, py0 + 1, pw - 2, ph - 2);
    let textX = tx;
    if (l.kind === 'town') {
      // kleines Banner vor dem Stadtnamen
      const bx = tx, by = ty - f;
      ctx.fillStyle = '#8a2a1a'; ctx.fillRect(bx, by, 3 * f, 5 * f);
      ctx.fillStyle = '#f2e6c8'; ctx.fillRect(bx + f, by + 4 * f, f, f);
      ctx.fillStyle = '#3a1a10'; ctx.fillRect(bx, by, f, 6 * f);
      textX = tx + 5 * f;
    }
    drawText(ctx, text, textX, ty, f, LABEL_INK[l.kind]);
  }
  return c;
}
