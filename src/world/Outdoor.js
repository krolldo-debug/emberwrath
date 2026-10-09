import { CONFIG } from '../config.js';
import { makeCanvas } from '../gfx/PixelCanvas.js';
import { hash2 } from '../core/math.js';
import { TileMap } from './TileMap.js';
import { groundPixel, vnoise, OUT, FISSURE, BIOME_GROUND, createCliffTiles } from '../sprites/outdoor.js';
import { GROUND_STEPPE } from '../sprites/decor_steppe.js';
import { GROUND_MARSH } from '../sprites/decor_marsh.js';
import { GROUND_FROST } from '../sprites/decor_frost.js';
import { GROUND_WASTES } from '../sprites/decor_wastes.js';
import { GROUND_PEAKS } from '../sprites/decor_peaks.js';

// Wertrauschen mit gemerkter Gitterzelle je Aufrufstelle (Formel wie vnoise, bitgleich): benachbarte
// Pixel liegen fast immer in derselben Zelle, dann entfallen die vier Hashes
const VNC = new Float64Array(12 * 7).fill(NaN);
function vnc(s, x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y), o = s * 7;
  if (VNC[o] !== x0 || VNC[o + 1] !== y0 || VNC[o + 6] !== seed) {
    VNC[o] = x0; VNC[o + 1] = y0; VNC[o + 6] = seed;
    const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed), c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
    VNC[o + 2] = a; VNC[o + 3] = b - a; VNC[o + 4] = c - a; VNC[o + 5] = a - b - c + d;   // wie vnoise gerechnet
  }
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return VNC[o + 2] + VNC[o + 3] * sx + VNC[o + 4] * sy + VNC[o + 5] * sx * sy;
}

// Hochfläche der organischen Gipfel: Grundton (Schnee mit Windrippen) und vereinzelte kleine Felsnasen
// (je 12-px-Zelle höchstens eine, oben verschneit; null = keine)
const DITH = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
// Hex-Farbe -> Zahl, gemerkt (je Pixel kein slice/parseInt)
const HEXI = new Map();
function hexInt(hex) {
  let v = HEXI.get(hex);
  if (v === undefined) { v = parseInt(hex.slice(1), 16); HEXI.set(hex, v); }
  return v;
}
function capBase(px, py, G) {
  const n = vnc(5, px / 9, py / 9, 313) * 0.55 + vnc(6, px / 3, py / 3, 314) * 0.3 + hash2(px, py, 315) * 0.15;
  let k = Math.floor(2.5 + n * 2.6);
  const rip = Math.sin(py * 0.85 + vnc(9, px / 14, py / 10, 316) * 9);
  const ripZone = vnc(10, px / 22, py / 18, 323);
  const dt = DITH[(py & 3) * 4 + (px & 3)] / 16;
  if (ripZone > 0.5 && rip > 0.88 && dt < (ripZone - 0.5) * 3) k -= 1; else if (ripZone > 0.55 && rip < -0.92 && dt < 0.4) k += 1;
  return G[Math.max(0, Math.min(5, k))];
}
function capNose(px, py, G, R) {
  const cx0 = Math.floor(px / 12), cy0 = Math.floor(py / 12);
  if (hash2(cx0, cy0, 317) >= 0.16) return null;
  const rx = cx0 * 12 + 3 + Math.floor(hash2(cx0, cy0, 318) * 6), ry = cy0 * 12 + 3 + Math.floor(hash2(cx0, cy0, 319) * 6);
  const rr = 1.6 + hash2(cx0, cy0, 322) * 1.6, ex = (px - rx) / (rr * 1.3), ey = (py - ry) / rr;
  const q = ex * ex + ey * ey;
  if (q < 1) return ey < -0.3 ? G[4] : ex < -0.2 ? R[4] : ey > 0.45 ? R[2] : R[3];
  if (q < 1.9 && py > ry && Math.abs(ex) < 1) return G[1];          // kurzer Schatten
  return null;
}

// Bodenpaletten der Runde-3-Zonen liegen bei ihren Deko-Sätzen (Import hier, sonst Kreis über decor_ashwood -> outdoor.js)
const GROUNDS = { ...BIOME_GROUND, steppe: GROUND_STEPPE, marsh: GROUND_MARSH, frost: GROUND_FROST, wastes: GROUND_WASTES, peaks: GROUND_PEAKS };
// Felsrampen je Biom (dunkel→hell). Das Plateau nimmt den Boden der Zone (bzw. Schnee), damit Felsen
// als erhöhtes Gelände lesen und nicht als schwarze Löcher.
const CLIFF_ROCK = {
  outdoor: null,
  ashwood: ['#16130f', '#211c17', '#2d2620', '#3a322a', '#4a4036', '#5c5145'],
  cinder: ['#120e10', '#1b1517', '#251d20', '#30262a', '#3d3036', '#4c3c44'],
  steppe: ['#1c140e', '#2a1e14', '#3a2a1c', '#4c3826', '#604832', '#765a40'],
  marsh: ['#121612', '#1a201a', '#232b22', '#2e382c', '#3b4738', '#4b5946'],
  frost: ['#1a2230', '#243044', '#30405a', '#40547a', '#5a7096', '#8098b8'],
  wastes: ['#18110c', '#241a12', '#33251a', '#433123', '#553f2d', '#6a4f39'],
  peaks: ['#16171a', '#212226', '#2d2e33', '#3b3b40', '#4c4a4c', '#605a56'],
};
// Biome, deren Felsgipfel organisch (pixelweise, ohne Kachelkanten) gezeichnet werden
const ORGANIC_CLIFFS = new Set(['frost']);
// Säulenbasalt (level.organicCliffs = 'basalt'), dunkel → hell
// Kachelbare Voronoi-Textur der Basaltsäulenköpfe (128 × 96 px, Zellen ~8 × 6 px), einmal je Sitzung
const HEX_W = 128, HEX_H = 96;
let hexTex = null;
function basaltHex() {
  if (hexTex) return hexTex;
  const NX = HEX_W / 8, NY = HEX_H / 6, n = HEX_W * HEX_H;
  const pt = (cx, cy) => { const wx = ((cx % NX) + NX) % NX, wy = ((cy % NY) + NY) % NY; return [cx * 8 + (cy & 1 ? 4 : 0) + hash2(wx, wy, 401) * 3, cy * 6 + hash2(wx, wy, 402) * 3, wy * NX + wx]; };
  const t = { edge: new Float32Array(n), ox: new Float32Array(n), oy: new Float32Array(n), id: new Int32Array(n) };
  for (let py = 0; py < HEX_H; py++) for (let px = 0; px < HEX_W; px++) {
    const gx = Math.floor(px / 8), gy = Math.floor(py / 6);
    let d1 = 1e9, d2 = 1e9, best = null;
    for (let j = -2; j <= 1; j++) for (let i = -2; i <= 1; i++) {
      const p = pt(gx + i, gy + j), dx = px - p[0], dy = py - p[1], dd = dx * dx + dy * dy;
      if (dd < d1) { d2 = d1; d1 = dd; best = [p, dx, dy]; } else if (dd < d2) d2 = dd;
    }
    const k = py * HEX_W + px;
    t.edge[k] = Math.sqrt(d2) - Math.sqrt(d1); t.ox[k] = best[1]; t.oy[k] = best[2]; t.id[k] = best[0][2];
  }
  return (hexTex = t);
}
// Randrauschen der Basaltmaske: 512 × 512 px kachelbar vorberechnet, blockweise erst bei Bedarf (32 × 32 px)
const BN = 512;
let bnTab = null, bnDone = null;
function basaltN(px, py) {
  const x = px & (BN - 1), y = py & (BN - 1), b = (y >> 5) * (BN >> 5) + (x >> 5);
  if (!bnTab) { bnTab = new Float32Array(BN * BN); bnDone = new Uint8Array((BN >> 5) * (BN >> 5)); }
  if (!bnDone[b]) {
    bnDone[b] = 1;
    const bx = x & ~31, by = y & ~31;
    for (let j = by; j < by + 32; j++) for (let i = bx; i < bx + 32; i++)
      bnTab[j * BN + i] = (vnoise(i / 13, j / 11, 300) - 0.5) * 0.55 + (vnoise(i / 6, j / 6, 301) - 0.5) * 0.35 + (vnoise(i / 2.5, j / 2.5, 302) - 0.5) * 0.14;
  }
  return bnTab[y * BN + x];
}
const BASALT = ['#0b0809', '#141011', '#1d1718', '#271f1f', '#332827', '#43342f', '#56443a', '#6c5646'];
const cliffCache = new Map();
function cliffSet(biome, pal) {
  if (!cliffCache.has(biome)) {
    const rock = CLIFF_ROCK[biome] ?? OUT.rock;
    cliffCache.set(biome, createCliffTiles(6, 31, { rock, cap: pal.cliffCap ?? pal.grass }));
  }
  return cliffCache.get(biome);
}

const T = CONFIG.tileSize;
const SOLID = new Set(['#', '~', '=', 'H', 'f']);
const FLOOR = new Set([',', '.', ':']);
const TERRAIN = new Set([',', '.', ':', '#', '~', '=']);
const DECOR = { t: 'pine', d: 'deadtree', r: 'rock', u: 'bush', f: 'fence', g: 'grave', l: 'lamp', F: 'campfire', w: 'well', c: 'crate', S: 'sign' };

// Kachelweise Darstellung (Chunks): Der Boden wird nicht mehr als eine weltgroße Leinwand
// vorgerendert (160×104 Kacheln = 2560×1664 px je Ebene – zu viel für Handys), sondern in
// CHUNK×CHUNK-Stücken, die beim ersten Sichtkontakt entstehen. Um den Sichtbereich herum wird
// in kleinen Zeitscheiben vorgeladen (PRELOAD px Rand, BUDGET ms je Bild), ein LRU-Cache hält
// höchstens MAX_CHUNKS Stücke. Alles wird in Weltkoordinaten berechnet – jedes Stück ist
// pixelgleich mit dem entsprechenden Ausschnitt der früheren Gesamtleinwand (keine Nähte).
const CHUNK = 256;
const PRELOAD = 256;                           // Rand rundum (px, wie bisher); in Laufrichtung zusätzlich LOOKAHEAD
const LOOKAHEAD = 2;                           // Sekunden Vorlauf in Bewegungsrichtung (Reiten ~130 px/s → ~260 px extra)
const BUDGET = 5;
const MAX_CHUNKS = Math.round((32 * 256 * 256) / (CHUNK * CHUNK)); // ≈ 2,1 Mpx Boden im Cache
const OV = 4; // Übersichtsbild: Pixel je Kachel (Minimap/Zonenkarte)

// Außenkarte: Gras, Wege, Pflaster, Wasser, Glutspalten, Klippen.
// Der Boden wird pixelweise mit verrauschten Übergängen erzeugt (keine
// sichtbaren Kachelkanten). Glühende Spalten liegen auf einer eigenen
// Emissive-Ebene, die nach dem Licht gezeichnet wird.
// Vertrag zur World: renderBackground() liefert nur noch ein kleines Übersichtsbild
// (OV px je Kachel, für Minimap/Zonenkarte); den eigentlichen Boden zeichnet
// renderLiquid() (direkt nach dem Hintergrund) aus den Chunks, die Leuchtebene renderEmissive().
export class Outdoor extends TileMap {
  constructor(level) {
    // level.solid: zusätzliche feste Deko-Zeichen (Palisaden, Mauern); Boden darunter wie Nachbarn
    super(level, { solidChars: level.solid ? new Set([...SOLID, ...level.solid]) : SOLID, floorChars: FLOOR, terrainChars: TERRAIN });
    this.biome = 'outdoor';
    this.pal = GROUNDS[level.biome] ?? OUT;
    this.groundBiome = level.biome;
    this.chunked = true;
    this.overview = null;
    this.chunks = new Map();
    this.cols = Math.ceil(this.pixelW / CHUNK);
    this.rowsN = Math.ceil(this.pixelH / CHUNK);
    this.vel = [0, 0];
    this.stats = { sync: 0, miss: 0, async: 0, evicted: 0, maxSyncMs: 0, ms: 0, frames: 0 };
    this.fissureCells = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.rows[y][x] === '=') this.fissureCells.push({ x: x * T + T / 2, y: y * T + T / 2 });
    this.lavaCells = [];
    if (this.pal.lava) for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.rows[y][x] === '~') this.lavaCells.push({ x: x * T + T / 2, y: y * T + T / 2, tx: x, ty: y });
  }

  onCell(ch, x, y, cx, cy) {
    const deco = this.level.decor?.[ch];
    if (deco) { this.placements.push({ type: 'bdecor', name: deco, x: cx, y: cy + 6, tx: x, ty: y }); return; }
    const type = this.level.decor ? null : DECOR[ch];
    if (type) this.placements.push({ type, x: cx, y: cy + 6, tx: x, ty: y });
  }

  // Wasser und Spalten sind niedrig: Pfeile/Blicke gehen darüber hinweg
  lineOfSight(ax, ay, bx, by) {
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 6);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      const tx = Math.floor(x / T), ty = Math.floor(y / T);
      const ch = this.rows[ty]?.[tx];
      if (ch === undefined || ch === '#' || ch === 'H' || this.level.rockChars?.includes(ch)) return false;
      for (const b of this.boxesAt(x, y)) if (!b.off && !b.low && x > b.x0 - 3 && x < b.x1 + 3 && y > b.y0 - 3 && y < b.y1 + 3) return false;
    }
    return true;
  }

  #jitterTerrain(px, py) {
    const jx = px + (vnc(0, px / 7, py / 7, 21) - 0.5) * 9;
    const jy = py + (vnc(1, px / 7, py / 7, 22) - 0.5) * 9;
    return this.terrainAt(Math.floor(jx / T), Math.floor(jy / T));
  }

  // Bodenfarbe eines Weltpixels; ed/i: optional Leuchtebene (RGBA-Puffer) und Index.
  #groundAt(px, py, ed, i) {
    let kind = this.#jitterTerrain(px, py);
    if (kind === '#') kind = ',';
    const pal = this.pal;
    let col;
    if (kind === '=') {
      col = groundPixel('.', px, py, pal).map((v) => v * 0.5);
    } else if (kind === '~' && pal.lava) {
      // Lava: dunkle Kruste im Lit-Pass, glühende Strömung auf der Emissive-Ebene
      const above = this.#jitterTerrain(px, py - 2);
      const flow = vnoise(px / 6 + py / 11, py / 5, 91) * 0.7 + vnoise(px / 2.5, py / 2.5, 92) * 0.3;
      const crust = vnoise(px / 5, py / 4, 93) > 0.66;
      col = crust ? [40, 14, 8] : [120, 34, 10];
      if (above !== '~') col = [22, 12, 12];
      else if (!crust) {
        if (ed) {
          const L = pal.water;
          const k = Math.min(4, 1 + Math.floor(flow * 4.2));
          const c = parseInt(L[k].slice(1), 16);
          ed[i] = (c >> 16) & 255; ed[i + 1] = (c >> 8) & 255; ed[i + 2] = c & 255; ed[i + 3] = k >= 3 ? 255 : 190;
        }
      } else if (ed && hash2(px, py, 94) < 0.25) { ed[i] = 200; ed[i + 1] = 60; ed[i + 2] = 12; ed[i + 3] = 140; }
    } else if (kind === '~') {
      col = groundPixel('~', px, py, pal);
      const above = this.#jitterTerrain(px, py - 3);
      const above1 = this.#jitterTerrain(px, py - 1);
      if (above !== '~') col = [34, 26, 22];
      else if (above1 !== '~') col = [8, 9, 18];
      if (ed && col[2] > 60 && hash2(px, py, 25) < 0.3) { ed[i] = 90; ed[i + 1] = 110; ed[i + 2] = 190; ed[i + 3] = 60; }
    } else col = pal.pixel ? pal.pixel(kind, px, py, this.level) : groundPixel(kind, px, py, pal);
    return col;
  }

  // Liefert das Übersichtsbild (OV px je Kachel) und setzt den Chunk-Cache zurück
  // (auch nach openSecret: Raster geändert).
  renderBackground(assets) {
    this.assets = assets;
    this.chunks.clear();
    this.job = null;
    this.#prepare();
    this.overview = null;
    this.ready = true;
    // Die Karten (ui/MapArt) zeichnen aus dem Raster und lesen world.background nicht mehr; das
    // Übersichtsbild entsteht deshalb erst auf Anfrage (overviewImage()). Rückgabe: 1×1-Platzhalter.
    return makeCanvas(1, 1);
  }

  // Verkleinertes Kartenbild (OV px je Kachel), erst beim ersten Aufruf gebaut; fertige Chunks verfeinern es.
  overviewImage() {
    this.overview ??= this.#buildOverview();
    return this.overview;
  }

  // Einmalige Vorarbeit: Glutspalten-Polylinien abtasten (mit Hüllrechteck), Klippen-/Grasbüschel-Sätze.
  #prepare() {
    const O = this.assets.sprites.outdoor;
    this.tufts = O.tufts;
    const biome = this.groundBiome ?? 'outdoor';
    // Biom-Paletten dürfen eine eigene Felsrampe mitbringen (Frost: pal.cliffRock)
    this.rockR = this.pal.cliffRock ?? CLIFF_ROCK[biome] ?? OUT.rock;
    this.cl = CLIFF_ROCK[biome] ? cliffSet(biome, this.pal) : O.cliff;
    // level.organicCliffs = 'basalt': organische Felsen auch außerhalb der Frostzinnen (Säulenbasalt, Glutöde)
    this.basalt = this.level.organicCliffs === 'basalt';
    this.organic = ORGANIC_CLIFFS.has(biome) || this.basalt;
    // level.paintedCliffs: das Biom malt seine Felsen selbst (pal.paintCliffs je Chunk), keine Kachelklippen
    this.painter = this.level.paintedCliffs && typeof this.pal.paintCliffs === 'function' ? this.pal.paintCliffs : null;
    this.fiss = (this.level.fissures ?? []).map((line) => this.#fissureGeom(line));
    this.rockMask = new Uint8Array(this.w * this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.rows[y][x] === '#') this.rockMask[y * this.w + x] = 1;
    // Deko, die auf dem Fels steht (level.rockDecor, Frost: Gipfel): Hochfläche darunter, keine Wand, kein Wasser
    const rd = this.level.rockDecor;
    if (rd) for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (rd.includes(this.rows[y][x])) { this.rockMask[y * this.w + x] = 1; this.terrain[y][x] = '#'; }
  }

  // Glutspalte entlang einer Polylinie (Tile-Koordinaten): Abtastpunkte des mäandernden Kerns
  // und Seitenrisse – einmal berechnet, je Chunk nur der überlappende Teil gezeichnet.
  #fissureGeom(pts) {
    const P = pts.map(([x, y]) => [x * T + T / 2, y * T + T / 2]);
    let dist = 0;
    const core = [];
    for (let i = 0; i < P.length - 1; i++) {
      const [ax, ay] = P[i], [bx, by] = P[i + 1];
      const len = Math.hypot(bx - ax, by - ay);
      const nx = -(by - ay) / len, ny = (bx - ax) / len;
      for (let s = 0; s < len; s += 0.5) {
        const t = s / len, dd = dist + s;
        const off = (vnoise(dd / 14, 3, 81) - 0.5) * 12 + (vnoise(dd / 4, 7, 82) - 0.5) * 3;
        const x = ax + (bx - ax) * t + nx * off, y = ay + (by - ay) * t + ny * off;
        const w = 2.5 + vnoise(dd / 9, 1, 83) * 2.5;
        core.push([x, y, w, dd]);
      }
      dist += len;
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of core) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    // Seitenrisse reichen höchstens ~12 px weit, Kern ±6 px
    return { core, x0: x0 - 16, y0: y0 - 16, x1: x1 + 16, y1: y1 + 16 };
  }

  // Zeichnet die Teile einer Glutspalte, die das Rechteck [rx0,rx1)×[ry0,ry1) (Welt) berühren.
  // ctx/ectx sind auf Weltkoordinaten transformiert. Reihenfolge wie früher (Kruste, Kern, Glut, Risse).
  #drawFissure(ctx, ectx, f, rx0, ry0, rx1, ry1) {
    const C = FISSURE.crust, E = FISSURE.core;
    const core = f.core;
    const hit = (x, y) => x > rx0 - 8 && x < rx1 + 8 && y > ry0 - 8 && y < ry1 + 8;
    for (const [x, y, w] of core) {
      if (!hit(x, y)) continue;
      ctx.fillStyle = C[0]; ctx.fillRect(Math.round(x - w), Math.round(y - w * 0.7), Math.round(w * 2), Math.round(w * 1.4));
    }
    for (const [x, y, w] of core) {
      if (!hit(x, y)) continue;
      ctx.fillStyle = C[2]; ctx.fillRect(Math.round(x - w * 0.5), Math.round(y - w * 0.35), Math.max(1, Math.round(w)), Math.max(1, Math.round(w * 0.7)));
    }
    for (const [x, y, w, dd] of core) {
      if (!hit(x, y)) continue;
      const heat = vnoise(dd / 6, 5, 84);
      const cw = w > 3.6 ? 2 : 1;
      ctx.fillStyle = E[heat > 0.5 ? 2 : 1]; ctx.fillRect(Math.round(x), Math.round(y), cw, 1);
      if (ectx) { ectx.fillStyle = E[heat > 0.7 ? 5 : heat > 0.4 ? 4 : 3]; ectx.fillRect(Math.round(x), Math.round(y), cw, 1); }
    }
    // Seitenrisse
    for (let i = 0; i < core.length; i += 40) {
      const [x, y] = core[i];
      if (!(x > rx0 - 24 && x < rx1 + 24 && y > ry0 - 24 && y < ry1 + 24)) continue;
      if (hash2(i, 3, 85) < 0.35) continue;
      let cx = x, cy = y;
      const a = hash2(i, 5, 86) * Math.PI * 2;
      for (let k = 0; k < 10; k++) {
        cx += Math.cos(a + (hash2(i, k, 87) - 0.5)); cy += Math.sin(a + (hash2(i, k, 87) - 0.5)) * 0.7;
        ctx.fillStyle = C[0]; ctx.fillRect(Math.round(cx) - 1, Math.round(cy), 3, 1);
        if (k < 6 && ectx) { ectx.fillStyle = E[3]; ectx.fillRect(Math.round(cx), Math.round(cy), 1, 1); }
      }
    }
  }

  // Grasbüschel, Kachelklippen, Schatten und Gebäudeschatten für die Kacheln, deren Zeichnung das
  // Weltrechteck berührt. ctx ist auf Weltkoordinaten transformiert (Zeichnungen außerhalb werden abgeschnitten).
  #drawTiles(ctx, rx0, ry0, rx1, ry1, { tufts = true, cliffs = true } = {}) {
    const tx0 = Math.max(0, Math.floor(rx0 / T) - 2), ty0 = Math.max(0, Math.floor(ry0 / T) - 2);
    const tx1 = Math.min(this.w - 1, Math.floor((rx1 - 1) / T) + 1), ty1 = Math.min(this.h - 1, Math.floor((ry1 - 1) / T) + 1);
    // Deko im Gras
    const tf = this.tufts;
    if (tufts && this.pal.tufts !== false)
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      if (this.rows[y][x] !== ',' && !(this.terrainAt(x, y) === ',' && !SOLID.has(this.rows[y][x]))) continue;
      for (let k = 0; k < 3; k++) {
        const hsh = hash2(x, y, 40 + k);
        if (hsh > 0.45) continue;
        const t = tf[Math.floor(hash2(x, y, 50 + k) * (hsh < 0.04 ? tf.length : 6))];
        ctx.drawImage(t, x * T + Math.floor(hash2(x, y, 60 + k) * 12), y * T + Math.floor(hash2(x, y, 70 + k) * 12));
      }
    }
    if (!cliffs || this.painter) return;
    // Klippen in 3/4-Perspektive (Frostzinnen: organisch, eigener Durchlauf)
    const rockR = this.rockR, cl = this.cl;
    if (!this.organic) {
      for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
        if (this.rows[y][x] !== '#') continue;
        const kind = this.#cliffKind(x, y);
        const h = hash2(x, y, 3);
        const px = x * T, py = y * T;
        if (kind === 'faceLower') ctx.drawImage(cl.lower[Math.floor(h * cl.lower.length)], px, py);
        else if (kind === 'faceUpper') ctx.drawImage(cl.upper[Math.floor(h * cl.upper.length)], px, py);
        else {
          ctx.drawImage(cl.top[Math.floor(h * cl.top.length)], px, py);
          const open = (tx, ty) => this.rows[ty]?.[tx] !== undefined && this.rows[ty][tx] !== '#';
          ctx.fillStyle = rockR[3];
          if (open(x - 1, y)) ctx.fillRect(px, py, 2, T);
          if (open(x + 1, y)) ctx.fillRect(px + T - 2, py, 2, T);
          if (open(x, y - 1)) ctx.fillRect(px, py, T, 2);
          ctx.fillStyle = rockR[5] ?? rockR[4];
          if (open(x - 1, y)) ctx.fillRect(px, py, 1, T);
          if (open(x, y - 1)) ctx.fillRect(px, py, T, 1);
          if (open(x, y + 1) || this.#cliffKind(x, y + 1) === 'faceUpper') { ctx.fillStyle = this.pal.grass[3]; ctx.fillRect(px, py + T - 1, T, 1); }
        }
      }
      // Schatten der Klippen/Gebäude auf dem Boden
      for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
        if (this.rows[y][x] === '#') continue;
        const px = x * T, py = y * T;
        if (this.rows[y - 1]?.[x] === '#') for (let i = 0; i < 8; i++) { ctx.fillStyle = `rgba(4,3,10,${0.55 * (1 - i / 8)})`; ctx.fillRect(px, py + i, T, 1); }
        if (this.rows[y]?.[x - 1] === '#') { ctx.fillStyle = 'rgba(4,3,10,0.35)'; ctx.fillRect(px, py, 4, T); }
        if (this.rows[y]?.[x + 1] === '#') { ctx.fillStyle = 'rgba(4,3,10,0.2)'; ctx.fillRect(px + T - 3, py, 3, T); }
      }
    }
  }

  #drawBuildingShadows(ctx, rx0, ry0, rx1, ry1) {
    for (const b of this.level.buildings ?? []) {
      const x = b.x * T + 6, y = (b.y + b.h) * T - 4;
      if (x > rx1 || x + b.w * T < rx0 || y > ry1 || y + 9 < ry0) continue;
      ctx.fillStyle = 'rgba(4,3,10,0.45)';
      ctx.fillRect(x, y, b.w * T, 9);
    }
  }

  // ------------------------------------------------------------------ Chunks
  // Ein Chunk entsteht als Generator in Zeitscheiben (yield = Pause möglich); #finish rechnet ihn zu Ende.
  *#chunkJob(k) {
    const x0 = k.x0, y0 = k.y0, cw = k.w, ch = k.h;
    const img = new ImageData(cw, ch), d = img.data;
    // Leuchtpuffer nur, wenn Wasser/Lava in Reichweite des Randrauschens liegt
    const eimg = this.#emitsIn(x0, y0, cw, ch) ? new ImageData(cw, ch) : null, ed = eimg?.data;
    // Basalt: Boden unter reinem Felsinneren (vier Felskacheln ringsum) übermalen die Klippen ohnehin
    // (Zellen zwischen vier Kachelmitten, je Chunk einmal vorberechnet)
    let full = null, FW = 0;
    const fx0 = Math.floor((x0 - T / 2) / T), fy0 = Math.floor((y0 - T / 2) / T);
    // Organische Klippen (Frost): unter der Felsmaske übermalt #organicCliffs jedes Pixel – dort keinen
    // Boden rechnen. Zwischen vier Felskacheln ist die Maske 1, sobald das Randrauschen nicht extrem
    // negativ ist (v1 > 0,037 reicht, sonst exakt per #maskAt). Im Randstreifen (nur einige der vier
    // Kacheln Fels, full = 2) entscheidet #maskAt; nicht bei Leuchtebene (Wasser in Reichweite).
    const skipRock = this.organic && !this.basalt;
    if (this.basalt || skipRock) {
      FW = Math.ceil(cw / T) + 2; const FH = Math.ceil(ch / T) + 2; full = new Uint8Array(FW * FH);
      for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) {
        const cx = fx0 + i, cy = fy0 + j, a = this.#rock(cx, cy), b = this.#rock(cx + 1, cy), c = this.#rock(cx, cy + 1), e = this.#rock(cx + 1, cy + 1);
        full[j * FW + i] = a & b & c & e ? 1 : a | b | c | e ? 2 : 0;
      }
    }
    const fcol = full ? Int32Array.from({ length: cw }, (_, lx) => Math.floor((x0 + lx - T / 2) / T) - fx0) : null;
    // Biom-Maler: Pixel, die er ohnehin mit Fels übermalt (pal.paintMask, 1 = Fels), brauchen keinen Boden
    const pm = this.painter && this.pal.paintMask ? this.pal.paintMask(x0, y0, cw, ch, this) : null;
    for (let ly = 0; ly < ch; ly++) {
      const py = y0 + ly, frow = full ? (Math.floor((py - T / 2) / T) - fy0) * FW : 0;
      for (let lx = 0; lx < cw; lx++) {
        const i = (ly * cw + lx) * 4;
        const fv = full ? full[frow + fcol[lx]] : 0;
        if (fv === 1 && (!skipRock || vnc(2, (x0 + lx) / 13, py / 11, 300) > 0.037 || this.#maskAt(x0 + lx, py))) { d[i + 3] = 255; continue; }
        if (fv === 2 && skipRock && !ed && this.#maskAt(x0 + lx, py)) { d[i + 3] = 255; continue; }
        if (pm && pm[ly * cw + lx]) { d[i + 3] = 255; continue; }
        const col = this.#groundAt(x0 + lx, py, ed, i);
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
      }
      if ((ly & 15) === 15) yield;
    }
    const c = makeCanvas(cw, ch), ctx = c.getContext('2d');
    ctx.putImageData(img, 0, 0);
    let e = null, ectx = null;
    const needE = () => { if (!e) { e = makeCanvas(cw, ch); ectx = e.getContext('2d'); if (eimg) ectx.putImageData(eimg, 0, 0); } return ectx; };
    if (eimg) needE();
    const rx1 = x0 + cw, ry1 = y0 + ch;
    ctx.translate(-x0, -y0);
    for (const f of this.fiss) {
      if (f.x1 < x0 || f.x0 > rx1 || f.y1 < y0 || f.y0 > ry1) continue;
      const ex = needE(); ex.setTransform(1, 0, 0, 1, -x0, -y0);
      this.#drawFissure(ctx, ex, f, x0, y0, rx1, ry1);
    }
    yield;
    this.#drawTiles(ctx, x0, y0, rx1, ry1);
    if (this.organic) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (this.basalt) yield* this.#basaltCliffs(ctx, x0, y0, cw, ch);
      else yield* this.#organicCliffs(ctx, this.rockR, x0, y0, cw, ch);
      ctx.translate(-x0, -y0);
    }
    if (this.painter) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      yield* this.painter(ctx, x0, y0, cw, ch, this);
      ctx.translate(-x0, -y0);
    }
    this.#drawBuildingShadows(ctx, x0, y0, rx1, ry1);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (ectx) ectx.setTransform(1, 0, 0, 1, 0, 0);
    k.c = c; k.e = e;
    // Übersichtsbild mit dem exakten Chunk verfeinern
    if (this.overview) {
      const o = this.overview.getContext('2d');
      o.imageSmoothingEnabled = true; o.imageSmoothingQuality = 'high';
      o.drawImage(c, x0 / T * OV, y0 / T * OV, cw / T * OV, ch / T * OV);
      o.imageSmoothingEnabled = false;
      this.overview.version = (this.overview.version ?? 0) + 1;
    }
  }

  // Kann im Weltrechteck etwas auf der Leuchtebene entstehen? (Wasser/Lava ± 1 Kachel Randrauschen)
  #emitsIn(x0, y0, cw, ch) {
    const tx0 = Math.floor(x0 / T) - 1, ty0 = Math.floor(y0 / T) - 1, tx1 = Math.floor((x0 + cw - 1) / T) + 1, ty1 = Math.floor((y0 + ch - 1) / T) + 1;
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) if (this.terrainAt(x, y) === '~') return true;
    return false;
  }

  #chunk(ix, iy) {
    const key = iy * this.cols + ix;
    let k = this.chunks.get(key);
    if (!k) {
      const x0 = ix * CHUNK, y0 = iy * CHUNK;
      k = { key, ix, iy, x0, y0, w: Math.min(CHUNK, this.pixelW - x0), h: Math.min(CHUNK, this.pixelH - y0), c: null, e: null, used: 0, gen: null };
      this.chunks.set(key, k);
    }
    return k;
  }

  #finish(k, sync) {
    if (k.c) return k;
    const t = performance.now();
    k.gen ??= this.#chunkJob(k);
    while (!k.gen.next().done);
    k.gen = null;
    if (this.job === k) this.job = null;
    const ms = performance.now() - t;
    this.stats.ms += ms;
    if (sync) { this.stats.sync++; this.stats.maxSyncMs = Math.max(this.stats.maxSyncMs, ms); } else this.stats.async++;
    return k;
  }

  #range(x0, y0, x1, y1) {
    return [Math.max(0, Math.floor(x0 / CHUNK)), Math.max(0, Math.floor(y0 / CHUNK)), Math.min(this.cols - 1, Math.floor((x1 - 1) / CHUNK)), Math.min(this.rowsN - 1, Math.floor((y1 - 1) / CHUNK))];
  }

  // Boden aus den Chunks zeichnen (World ruft das direkt nach dem Hintergrund).
  renderLiquid(ctx, cx, cy) {
    if (!this.ready) return;
    const Wv = CONFIG.viewWidth, Hv = CONFIG.viewHeight;
    const x = Math.round(cx), y = Math.round(cy), now = performance.now();
    const frame = ++this.stats.frames;
    // Sprung (Ankunft, Teleport, erstes Bild) vs. echter Nachlade-Fehlgriff beim Laufen
    const jump = this.lastView === undefined || Math.abs(x - this.lastView[0]) + Math.abs(y - this.lastView[1]) > 64;
    // Kamerageschwindigkeit (px/s, geglättet) für das Vorladen in Laufrichtung
    if (jump) { this.vel = [0, 0]; } else {
      const dt = Math.max(0.008, Math.min(0.25, (now - this.lastViewAt) / 1000));
      const k = Math.min(1, dt * 4);
      this.vel[0] += ((x - this.lastView[0]) / dt - this.vel[0]) * k;
      this.vel[1] += ((y - this.lastView[1]) / dt - this.vel[1]) * k;
    }
    this.lastView = [x, y]; this.lastViewAt = now;
    const [a0, b0, a1, b1] = this.#range(x, y, x + Wv, y + Hv);
    for (let iy = b0; iy <= b1; iy++) for (let ix = a0; ix <= a1; ix++) {
      const k0 = this.#chunk(ix, iy);
      if (!k0.c && !jump) this.stats.miss++;
      const k = this.#finish(k0, true);
      k.used = frame;
      ctx.drawImage(k.c, k.x0 - x, k.y0 - y);
    }
    this.#preload(x, y, Wv, Hv, frame);
  }

  // Vorladen: fehlende Chunks im Rand um die Sicht, verlängert in Laufrichtung. Vorrang hat, was der
  // vorausgesagten Sicht (in 0,6 s) am nächsten liegt. Zeitscheiben; LRU-Räumung.
  #preload(x, y, Wv, Hv, frame) {
    const [vx, vy] = this.vel;
    const lx = Math.max(-512, Math.min(512, vx * LOOKAHEAD)), ly = Math.max(-512, Math.min(512, vy * LOOKAHEAD));
    const [a0, b0, a1, b1] = this.#range(x - PRELOAD + Math.min(0, lx), y - PRELOAD + Math.min(0, ly), x + Wv + PRELOAD + Math.max(0, lx), y + Hv + PRELOAD + Math.max(0, ly));
    // vorausgesagte Sicht
    const px0 = x + vx * 0.6, py0 = y + vy * 0.6, px1 = px0 + Wv, py1 = py0 + Hv;
    const score = (k) => Math.hypot(Math.max(0, px0 - (k.x0 + k.w), k.x0 - px1), Math.max(0, py0 - (k.y0 + k.h), k.y0 - py1));
    let best = null, bd = Infinity;
    for (let iy = b0; iy <= b1; iy++) for (let ix = a0; ix <= a1; ix++) {
      const k = this.#chunk(ix, iy);
      k.used = Math.max(k.used, frame - 1);
      if (k.c) continue;
      const dd = score(k);
      if (dd < bd) { bd = dd; best = k; }
    }
    // laufende Arbeit fortsetzen, außer ein deutlich dringenderer Chunk ist aufgetaucht (Richtungswechsel)
    const job = this.job && !this.job.c && this.chunks.get(this.job.key) === this.job ? this.job : null;
    if (job && (!best || score(job) <= bd + CHUNK / 2)) best = job;
    if (!best) this.lastFrameAt = performance.now();
    if (best) {
      this.job = best;
      best.gen ??= this.#chunkJob(best);
      // Zeitscheibe: BUDGET ms bzw. 30 % der Bildzeit (schwache Geräte haben lange Bilder und brauchen
      // trotzdem denselben Durchsatz in Chunks/s); doppelt, wenn der Chunk in ≤ 0,6 s ins Bild käme –
      // lieber mehrere etwas längere Bilder als ein Sofort-Rendern mit einem großen Ruckler.
      const t = performance.now();
      const frameMs = (t - (this.lastFrameAt ?? t)) || 16;
      const urgent = score(best) === 0;
      const budget = Math.min(urgent ? 60 : 30, Math.max(BUDGET, frameMs * (urgent ? 0.6 : 0.3)));
      this.lastFrameAt = t;
      let done = false;
      while (performance.now() - t < budget) if (best.gen.next().done) { done = true; break; }
      this.stats.ms += performance.now() - t;
      if (done) { best.gen = null; this.job = null; this.stats.async++; }
    }
    // Räumen: leere Einträge (nie gerendert, nicht in Arbeit) und älteste fertige Chunks über MAX_CHUNKS
    let n = 0;
    for (const k of this.chunks.values()) if (k.c) n++;
    for (const [key, k] of this.chunks) if (!k.c && k !== this.job && k.used < frame - 1) this.chunks.delete(key);
    if (n <= MAX_CHUNKS) return;
    const done = [...this.chunks.values()].filter((k) => k.c && k.used < frame - 1).sort((p, q) => p.used - q.used);
    for (const k of done.slice(0, n - MAX_CHUNKS)) { this.chunks.delete(k.key); this.stats.evicted++; }
  }

  // Emissive-Ebene: glühende Spaltenkerne, Lava, Wasserglanz – pulsierend
  renderEmissive(ctx, cx, cy, time) {
    if (!this.ready) return;
    const Wv = CONFIG.viewWidth, Hv = CONFIG.viewHeight;
    const x = Math.round(cx), y = Math.round(cy);
    const [a0, b0, a1, b1] = this.#range(x, y, x + Wv, y + Hv);
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(time * 1.6);
    for (let iy = b0; iy <= b1; iy++) for (let ix = a0; ix <= a1; ix++) {
      const k = this.chunks.get(iy * this.cols + ix);
      if (k?.e) ctx.drawImage(k.e, k.x0 - x, k.y0 - y);
    }
    ctx.globalAlpha = 1;
  }

  // Prüf-/Messhilfe: Cache-Zustand
  chunkStats() {
    let n = 0, ne = 0, px = 0;
    for (const k of this.chunks.values()) if (k.c) { n++; px += k.w * k.h; if (k.e) { ne++; px += k.w * k.h; } }
    const ov = this.overview ? this.overview.width * this.overview.height : 0;
    return { chunk: CHUNK, chunks: n, withEmissive: ne, mpx: +((px + ov) / 1e6).toFixed(3), overviewPx: ov, total: this.cols * this.rowsN, ...this.stats, ms: Math.round(this.stats.ms), maxSyncMs: +this.stats.maxSyncMs.toFixed(1) };
  }

  // Prüfhilfe: Ausschnitt (Weltpixel) als Leinwand zusammensetzen (Boden bzw. Leuchtebene)
  composeRegion(x0, y0, w, h, layer = 'ground') {
    const c = makeCanvas(w, h), ctx = c.getContext('2d');
    const [a0, b0, a1, b1] = this.#range(x0, y0, x0 + w, y0 + h);
    for (let iy = b0; iy <= b1; iy++) for (let ix = a0; ix <= a1; ix++) {
      const k = this.#finish(this.#chunk(ix, iy), false);
      const src = layer === 'ground' ? k.c : k.e;
      if (src) ctx.drawImage(src, k.x0 - x0, k.y0 - y0);
    }
    return c;
  }

  // ------------------------------------------------------------------ Übersichtsbild
  // Grob (2×2 Abtastungen je Übersichtspixel), ohne die teure Vollauflösung; jeder fertige
  // Chunk ersetzt seinen Bereich danach durch die exakte Verkleinerung.
  #buildOverview() {
    const ow = this.w * OV, oh = this.h * OV, s = T / OV;
    const c = makeCanvas(ow, oh), ctx = c.getContext('2d');
    const img = ctx.createImageData(ow, oh), d = img.data;
    const o1 = Math.floor(s / 4), o2 = Math.floor((3 * s) / 4);
    for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
      const i = (y * ow + x) * 4, bx = x * s, by = y * s;
      // versetzte Abtastung (Schachbrett) statt 2×2: halbe Kosten, die Verkleinerung der Minimap glättet den Rest
      const p = this.#groundAt(bx + ((x ^ y) & 1 ? o1 : o2), by + o1), q = this.#groundAt(bx + ((x ^ y) & 1 ? o2 : o1), by + o2);
      d[i] = (p[0] + q[0]) / 2; d[i + 1] = (p[1] + q[1]) / 2; d[i + 2] = (p[2] + q[2]) / 2; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.setTransform(1 / s, 0, 0, 1 / s, 0, 0);
    for (const f of this.fiss) this.#drawFissure(ctx, null, f, -1e9, -1e9, 1e9, 1e9);
    this.#drawTiles(ctx, 0, 0, this.pixelW, this.pixelH);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.organic) this.#organicOverview(ctx, ow, oh, s);
    ctx.setTransform(1 / s, 0, 0, 1 / s, 0, 0);
    this.#drawBuildingShadows(ctx, 0, 0, this.pixelW, this.pixelH);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    c.version = 0;
    c.worldScale = 1 / s;
    return c;
  }

  // Vereinfachte Frostgipfel fürs Übersichtsbild: Maske je Übersichtspixel, Wand/Hochfläche/Schatten
  #organicOverview(ctx, ow, oh, s) {
    const R = this.basalt ? BASALT : this.rockR, G = this.basalt ? [BASALT[2], BASALT[3], this.pal.grass[1], this.pal.grass[2], this.pal.grass[2], this.pal.grass[3]] : this.pal.grass;
    const M = new Uint8Array(ow * oh);
    for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) M[y * ow + x] = this.#maskAt(x * s + s / 2, y * s + s / 2);
    const img = ctx.getImageData(0, 0, ow, oh), d = img.data;
    const put = (i, hex) => { const v = parseInt(hex.slice(1), 16); d[i] = v >> 16; d[i + 1] = (v >> 8) & 255; d[i + 2] = v & 255; };
    for (let x = 0; x < ow; x++) {
      let run = 999, since = 999;
      const faceH = (24 + Math.floor(vnoise((x * s) / 11, 0.5, 303) * 9)) / s;
      for (let y = oh - 1; y >= 0; y--) {
        const i = (y * ow + x) * 4;
        if (!M[y * ow + x]) { run = 0; continue; }
        run++;
        if (run <= faceH) put(i, R[x > 0 && !M[y * ow + x - 1] ? 4 : run <= 1 ? 0 : 2]);
        else put(i, G[run <= faceH + 1 ? 5 : 3 + (hash2(x, y, 330) < 0.5 ? 1 : 0)]);
      }
      for (let y = 0; y < oh; y++) {
        if (M[y * ow + x]) { since = 0; continue; }
        if (++since <= 2) { const i = (y * ow + x) * 4; d[i] *= 0.65; d[i + 1] *= 0.65; d[i + 2] *= 0.7; }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // Wandmaske der organischen Gipfel (bilinear geglättete Wand + Rauschen) für ein Weltpixel
  #rock(tx, ty) { return (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h || this.rockMask[ty * this.w + tx] === 1) ? 1 : 0; }
  #maskAt(px, py) {
    const fy = py / T - 0.5, ty = Math.floor(fy), ay = fy - ty;
    const fx = px / T - 0.5, tx = Math.floor(fx), ax = fx - tx;
    const a = this.#rock(tx, ty), b = this.#rock(tx + 1, ty), c = this.#rock(tx, ty + 1), d = this.#rock(tx + 1, ty + 1);
    if (!(a | b | c | d)) return 0;
    const f = (a * (1 - ax) + b * ax) * (1 - ay) + (c * (1 - ax) + d * ax) * ay;
    // Die zwei feinen Rauschanteile liegen zusammen in ±0,245: oft entscheidet der grobe allein
    const n1 = (vnc(2, px / 13, py / 11, 300) - 0.5) * 0.55;
    if (f + n1 - 0.2451 > 0.5) return 1;
    if (f + n1 + 0.2451 <= 0.5) return 0;
    const n = n1 + (vnc(3, px / 6, py / 6, 301) - 0.5) * 0.35 + (vnc(4, px / 2.5, py / 2.5, 302) - 0.5) * 0.14;
    return f + n > 0.5 ? 1 : 0;
  }

  // Felsgipfel als ein Stück: weicher, verrauschter Umriss (bilinear geglättete Wandmaske + Rauschen),
  // 3/4-Felswand mit Schichten, Rissen, Schneeüberhang und Eiszapfen, verschneite Hochfläche mit
  // Windrippen und Felsnasen, weicher Schlagschatten und Schneewehe am Fuß. Deterministisch.
  // Chunkweise: ctx ist die Chunk-Leinwand (Ursprung = Welt x0,y0). Die Maske wird mit Rand berechnet
  // (oben 10 px für den Schlagschatten, unten 40 px für die Wandhöhe, seitlich 4 px), damit jedes
  // Pixel exakt wie bei der früheren Gesamtberechnung entsteht.
  *#organicCliffs(ctx, R, x0, y0, cw, ch) {
    const W = this.pixelW, H = this.pixelH, G = this.pal.grass, ICE = this.pal.water;
    const cap = this.pal.capPixel ?? null; // optional: Hochfläche je Pixel umfärben (Grate, Geröll), liefert Hex oder null
    const mx0 = Math.max(0, x0 - 4), mx1 = Math.min(W, x0 + cw + 4);
    const my0 = Math.max(0, y0 - 10), my1 = Math.min(H, y0 + ch + 40);
    const MW = mx1 - mx0, MH = my1 - my0;
    const M = new Uint8Array(MW * MH);
    let any = false;
    for (let py = my0; py < my1; py++) {
      for (let px = mx0; px < mx1; px++) if (this.#maskAt(px, py)) { M[(py - my0) * MW + px - mx0] = 1; any = true; }
      if ((py & 31) === 31) yield;
    }
    if (!any) return;
    // Welt-Koordinaten; außerhalb der Karte zählt als Fels (wie früher)
    const inM = (x, y) => x < 0 || y < 0 || x >= W || y >= H || M[(y - my0) * MW + x - mx0] === 1;
    const img = ctx.getImageData(0, 0, cw, ch), d = img.data;
    const idx = (px, py) => ((py - y0) * cw + px - x0) * 4;
    const put = (i, hex) => { const v = hexInt(hex); d[i] = v >> 16; d[i + 1] = (v >> 8) & 255; d[i + 2] = v & 255; };
    const dark = (i, k) => { d[i] *= 1 - k; d[i + 1] *= 1 - k; d[i + 2] *= 1 - k * 0.8; };
    const dith = (x, y) => DITH[(y & 3) * 4 + (x & 3)] / 16;
    const yIn0 = y0, yIn1 = y0 + ch;
    for (let px = x0; px < x0 + cw; px++) {
      const faceH = 24 + Math.floor(vnoise(px / 11, 0.5, 303) * 9);
      const lipLen = Math.floor(vnoise(px / 2.2, 3.5, 306) * 4.2);
      const icicle = hash2(px, 9, 307) < 0.09 ? 2 + Math.floor(hash2(px, 10, 308) * 4) : 0;
      let run = 999, since = 999;
      for (let py = my1 - 1; py >= my0; py--) {
        if (!M[(py - my0) * MW + px - mx0]) {
          run = 0;
          continue;
        }
        run++;
        if (py < yIn0 || py >= yIn1) continue;
        const i = idx(px, py);
        const b = run; // Abstand zum Fuß (1 = unterste Felszeile)
        if (b <= faceH) {
          // Felswand
          const t = faceH - b;
          // Schräg liegende, unregelmäßige Gesteinsbänder; kurze versetzte Risse; große Facetten
          const s = py + px * 0.18 + vnc(7, px / 10, py / 22, 304) * 7;
          const layer = Math.floor(s / 5), q = s - layer * 5;
          let k = 2;
          const fac = vnc(8, px / 7, py / 6, 320);
          if (fac > 0.64) k = 3; else if (fac < 0.3) k = 1;
          if (q < 0.9) k = Math.max(0, k - 1); else if (q < 1.8 && hash2(px >> 1, layer, 321) < 0.7) k = Math.min(4, k + 1);
          if (hash2(px, layer, 305) < 0.05 || hash2(px - 1, layer, 305) < 0.02) k = 0;
          const hsh = hash2(px, py, 309);
          if (hsh < 0.05) k += hsh < 0.025 ? 1 : -1;
          if (!inM(px - 1, py) || !inM(px - 2, py)) k = Math.max(k, 4);       // Licht von links
          else if (!inM(px + 1, py)) k = Math.min(k, 1);
          if (t > faceH * 0.72) k -= 1;                                         // Wandfuß im Schatten
          if (b <= 3) k = Math.min(k, b === 1 ? 0 : 1);
          put(i, R[Math.max(0, Math.min(5, k))]);
          if (b <= 3 && hash2(px, py, 311) < 0.18) put(i, G[2 + (hash2(px, py, 312) * 2 | 0)]); // Schneegriesel am Fuß
          if (t < lipLen) put(i, G[5 - Math.min(2, t)]);                         // Schneeüberhang
          else if (icicle && t < lipLen + icicle) put(i, t === lipLen + icicle - 1 ? ICE[4] : ICE[3]);
          else if (icicle && px > 0 && t < lipLen + icicle - 1 && t >= lipLen) put(i, R[0]);
        } else {
          // Hochfläche: Schnee mit Windrippen, Felsnasen, weicher Rand
          let col;
          // Schneekante und Ränder übermalen die Hochfläche; den Grundton (Rauschen, Rippel, Felsnasen) und
          // capPixel nur dort rechnen, wo das Ergebnis sichtbar bleibt
          if (b <= faceH + 2) col = b === faceH + 1 ? G[5] : G[4];                       // Schneekante über der Wand
          else {
            const e1 = !inM(px - 1, py) || !inM(px + 1, py) || !inM(px, py - 1);
            const e2 = !e1 && (!inM(px - 2, py) || !inM(px + 2, py) || !inM(px, py - 2));
            if (e1) col = (!inM(px - 1, py) || !inM(px, py - 1)) ? R[4] : R[2];
            else if (e2) col = dith(px, py) < 0.5 ? R[3] : G[1];
            else {
              const nose = capNose(px, py, G, R);
              // capPixel(…, null): Vorabfrage ohne Grundton; null heißt „Grundton nötig“
              const pre = cap && nose === null ? cap(px, py, this.level, null) : null;
              if (pre != null) col = pre;
              else {
                col = nose ?? capBase(px, py, G);
                if (cap) col = cap(px, py, this.level, col) ?? col;
              }
              const e3 = !inM(px - 3, py) || !inM(px + 3, py) || !inM(px, py - 3) || !inM(px, py - 4);
              if (e3 && dith(px, py) < 0.4) col = G[2];
            }
          }
          put(i, col);
        }
      }
      // Schlagschatten und Schneewehe unter dem Wandfuß (zweiter Durchlauf von oben nach unten)
      since = 999;
      for (let py = my0; py < yIn1; py++) {
        if (M[(py - my0) * MW + px - mx0]) { since = 0; continue; }
        since++;
        if (since <= 9 && py >= yIn0) {
          const i = idx(px, py);
          if (since <= 2 && hash2(px, py, 318) < 0.3) { put(i, G[3]); continue; }
          if (dith(px, py) < 1 - since / 9) dark(i, 0.42 * (1 - since / 11));
        }
      }
      if ((px & 63) === 63) yield;
    }
    // Seitenschatten rechts der Felsen
    for (let py = y0; py < yIn1; py++) for (let px = Math.max(1, x0); px < x0 + cw; px++) {
      const m = (py - my0) * MW + px - mx0;
      if (M[m]) continue;
      if (M[m - 1] || (px > 2 && M[m - 3] && dith(px, py) < 0.5)) dark(idx(px, py), 0.25);
    }
    ctx.putImageData(img, 0, 0);
  }

  // Basaltklippen (level.organicCliffs = 'basalt', Glutöde): dieselbe weiche Maske wie die Frostgipfel,
  // aber Säulenbasalt in der Wand (senkrechte Säulen, versetzte Köpfe, Querfugen), auf der Hochfläche
  // sechseckige Säulenköpfe unter Ascheverwehungen. Kein Schnee, keine Eiszapfen. Deterministisch, chunkweise.
  *#basaltCliffs(ctx, x0, y0, cw, ch) {
    const W = this.pixelW, H = this.pixelH, hx = (c) => parseInt(c.slice(1), 16), G = this.pal.grass.map(hx), B = BASALT.map(hx);
    // Maskenfenster nicht an der Karte gekappt (außerhalb gilt Fels): Nachbarabfragen ohne Grenzprüfung
    const mx0 = x0 - 4, mx1 = x0 + cw + 4, my0 = y0 - 10, my1 = y0 + ch + 40;
    const MW = mx1 - mx0, MH = my1 - my0;
    const M = new Uint8Array(MW * MH);
    // Felskacheln im Umkreis? Sonst nichts zu tun (die meisten Chunks)
    let near = false;
    for (let ty = Math.floor(my0 / T) - 1; ty <= Math.floor(my1 / T) + 1 && !near; ty++) for (let tx = Math.floor(mx0 / T) - 1; tx <= Math.floor(mx1 / T) + 1; tx++) if (this.#rock(tx, ty)) { near = true; break; }
    if (!near) return;
    // Maske blockweise: Zellen zwischen vier Kachelmitten sind ganz frei, ganz Fels oder Rand (nur dort Rauschen)
    let any = false;
    const H8 = T / 2;
    for (let cy = Math.floor((my0 - H8) / T); cy * T + H8 < my1; cy++) {
      for (let cx = Math.floor((mx0 - H8) / T); cx * T + H8 < mx1; cx++) {
        const s4 = this.#rock(cx, cy) + this.#rock(cx + 1, cy) + this.#rock(cx, cy + 1) + this.#rock(cx + 1, cy + 1);
        if (!s4) continue;
        const ya = Math.max(my0, cy * T + H8), yb = Math.min(my1, cy * T + H8 + T), xa = Math.max(mx0, cx * T + H8), xb = Math.min(mx1, cx * T + H8 + T);
        for (let py = ya; py < yb; py++) for (let px = xa; px < xb; px++) if (s4 === 4 || this.#basaltMask(px, py)) { M[(py - my0) * MW + px - mx0] = 1; any = true; }
      }
      yield;
    }
    if (!any) return;
    const img = ctx.getImageData(0, 0, cw, ch), d = img.data;
    const idx = (px, py) => ((py - y0) * cw + px - x0) * 4;
    const put = (i, v) => { d[i] = v >> 16; d[i + 1] = (v >> 8) & 255; d[i + 2] = v & 255; };
    const dark = (i, k) => { d[i] *= 1 - k; d[i + 1] *= 1 - k; d[i + 2] *= 1 - k * 0.8; };
    const dith = (x, y) => [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5][(y & 3) * 4 + (x & 3)] / 16;
    // Säulenköpfe: kachelbare Voronoi-Textur (einmal berechnet), je Pixel nur ein Nachschlag
    const HX = basaltHex();
    // Ascheverwehung: Rauschen auf 4-px-Gitter, bilinear (spart je Pixel einen Rauschaufruf)
    const AW = (cw >> 2) + 2, AH = (ch >> 2) + 2, AG = new Float32Array(AW * AH);
    for (let j = 0; j < AH; j++) for (let i = 0; i < AW; i++) AG[j * AW + i] = vnoise((x0 + i * 4) / 12, (y0 + j * 4) / 10, 414);
    const ashAt = (px, py) => {
      const fx = (px - x0) / 4, fy = (py - y0) / 4, i = fx | 0, j = fy | 0, ax = fx - i, ay = fy - j, k = j * AW + i;
      return (AG[k] * (1 - ax) + AG[k + 1] * ax) * (1 - ay) + (AG[k + AW] * (1 - ax) + AG[k + AW + 1] * ax) * ay;
    };
    const yIn0 = y0, yIn1 = y0 + ch;
    for (let px = x0; px < x0 + cw; px++) {
      const mc = px - mx0;
      const faceH = 20 + Math.floor(vnoise(px / 13, 0.5, 403) * 11);
      // Säule dieser Spalte: Breite 4–7 px (verrauschte Grenzen), eigener Ton, eigener Kopf
      const u = px + vnoise(px / 17, 2.5, 404) * 9, ci = Math.floor(u / 5.5), lx = u - ci * 5.5;
      const tone = hash2(ci, 2, 406), brk = Math.floor(hash2(ci, 1, 405) * 5);
      const cross = Math.floor(hash2(ci, 3, 407) * 11);
      let run = 999, since = 999;
      for (let py = my1 - 1; py >= my0; py--) {
        const m = (py - my0) * MW + mc;
        if (!M[m]) { run = 0; continue; }
        run++;
        if (py < yIn0 || py >= yIn1) continue;
        const i = idx(px, py);
        const b = run;
        if (b <= faceH) {
          const t = faceH - b;
          let k = 3 + (tone < 0.28 ? -1 : tone > 0.82 ? 1 : 0);
          if (lx < 0.9) k = 1;                                            // Fuge zwischen Säulen
          else if (lx < 2) k += 2;                                        // Licht von links
          else if (lx > 4.4) k -= 1;
          if ((py + cross) % 11 === 0 && lx >= 0.9) k = 1;                // Querbruch
          else if ((py + cross) % 11 === 1 && lx >= 0.9) k += 1;
          if (hash2(px, py, 409) < 0.05) k += hash2(px, py, 410) < 0.5 ? 1 : -1;
          if (!M[m - 1] || !M[m - 2]) k = Math.max(k, 5);
          else if (!M[m + 1]) k = Math.min(k, 2);
          if (t > faceH * 0.7) k -= 1;                                    // Wandfuß im Schatten
          if (b <= 2) k = Math.min(k, 1);
          let col = B[Math.max(0, Math.min(7, k))];
          if (t < brk) col = t === brk - 1 ? B[6] : G[3 + (hash2(px, py, 411) < 0.4 ? 1 : 0)];   // versetzte Säulenköpfe mit Asche
          else if (t === brk && lx >= 0.9) col = B[Math.min(7, k + 2)];
          if (b <= 3 && hash2(px, py, 412) < 0.22) col = G[1 + (hash2(px, py, 413) * 2 | 0)];   // Aschegriesel am Fuß
          put(i, col);
        } else {
          const t = (py % HEX_H) * HEX_W + (px % HEX_W), e = HX.edge[t], ox = HX.ox[t], oy = HX.oy[t];
          const ash = ashAt(px, py) * 0.8 + hash2(px >> 2, py >> 2, 415) * 0.2;
          const h = hash2(HX.id[t], ((px / HEX_W) | 0) * 31 + ((py / HEX_H) | 0), 416);
          let col;
          if (e < 1.2) col = ash > 0.45 ? G[2] : B[2];                    // Fugen (mit Asche gefüllt)
          else {
            let k = 4 + (h < 0.3 ? -1 : h > 0.8 ? 1 : 0);
            if (ox < -1 && oy < -1) k += 1; else if (ox > 1.5 && oy > 1) k -= 1;
            col = B[k];
            if (e < 2.2 && oy < 0) col = B[Math.min(7, k + 1)];
          }
          // Ascheverwehungen bedecken die Köpfe teilweise
          if (ash > 0.5 && dith(px, py) < (ash - 0.5) * 4.5) col = G[3 + (ash > 0.68 ? 1 : 0) + (hash2(px, py, 417) < 0.12 ? 1 : 0)];
          if (b <= faceH + 2) col = b === faceH + 1 ? B[6] : G[3];        // Kante über der Wand
          else {
            const e1 = !M[m - 1] || !M[m + 1] || !M[m - MW];
            const e2 = !M[m - 2] || !M[m + 2] || !M[m - 2 * MW];
            if (e1) col = (!M[m - 1] || !M[m - MW]) ? B[6] : B[3];
            else if (e2) col = dith(px, py) < 0.5 ? B[5] : col;
          }
          put(i, col);
        }
      }
      // Schlagschatten unter dem Wandfuß
      since = 999;
      for (let py = my0; py < yIn1; py++) {
        if (M[(py - my0) * MW + mc]) { since = 0; continue; }
        since++;
        if (since <= 9 && py >= yIn0) {
          const i = idx(px, py);
          if (since <= 2 && hash2(px, py, 418) < 0.25) { put(i, B[2]); continue; }
          if (dith(px, py) < 1 - since / 9) dark(i, 0.45 * (1 - since / 11));
        }
      }
      if ((px & 63) === 63) yield;
    }
    for (let py = y0; py < yIn1; py++) for (let px = Math.max(1, x0); px < x0 + cw; px++) {
      const m = (py - my0) * MW + px - mx0;
      if (M[m]) continue;
      if (M[m - 1] || (px > 2 && M[m - 3] && dith(px, py) < 0.5)) dark(idx(px, py), 0.25);
    }
    ctx.putImageData(img, 0, 0);
  }

  // Maske der Basaltklippen: wie #maskAt, aber reines Felsinnere ohne Rauschen (spart die Rechnung)
  #basaltMask(px, py) {
    const fy = py / T - 0.5, ty = Math.floor(fy), ay = fy - ty;
    const fx = px / T - 0.5, tx = Math.floor(fx), ax = fx - tx;
    const a = this.#rock(tx, ty), b = this.#rock(tx + 1, ty), c = this.#rock(tx, ty + 1), d = this.#rock(tx + 1, ty + 1);
    const s = a + b + c + d;
    if (s === 0) return 0;
    if (s === 4) return 1;
    const f = (a * (1 - ax) + b * ax) * (1 - ay) + (c * (1 - ax) + d * ax) * ay;
    return f + basaltN(px, py) > 0.5 ? 1 : 0;
  }

  #cliffKind(x, y) {
    const wall = (tx, ty) => tx < 0 || ty < 0 || tx >= this.w || ty >= this.h || this.rows[ty][tx] === '#';
    if (!wall(x, y)) return 'floor';
    if (!wall(x, y + 1) && y + 1 < this.h) return 'faceLower';
    if (wall(x, y - 1) && wall(x, y + 1) && y + 2 < this.h && !wall(x, y + 2)) return 'faceUpper';
    return 'top';
  }
}
