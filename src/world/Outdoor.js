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
      if (ch === undefined || ch === '#' || ch === 'H') return false;
      for (const b of this.boxesAt(x, y)) if (!b.off && !b.low && x > b.x0 - 3 && x < b.x1 + 3 && y > b.y0 - 3 && y < b.y1 + 3) return false;
    }
    return true;
  }

  #jitterTerrain(px, py) {
    const jx = px + (vnoise(px / 7, py / 7, 21) - 0.5) * 9;
    const jy = py + (vnoise(px / 7, py / 7, 22) - 0.5) * 9;
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
    this.rockR = CLIFF_ROCK[biome] ?? OUT.rock;
    this.cl = CLIFF_ROCK[biome] ? cliffSet(biome, this.pal) : O.cliff;
    this.organic = ORGANIC_CLIFFS.has(biome);
    this.fiss = (this.level.fissures ?? []).map((line) => this.#fissureGeom(line));
    this.rockMask = new Uint8Array(this.w * this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.rows[y][x] === '#') this.rockMask[y * this.w + x] = 1;
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
    if (!cliffs) return;
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
    for (let ly = 0; ly < ch; ly++) {
      const py = y0 + ly;
      for (let lx = 0; lx < cw; lx++) {
        const i = (ly * cw + lx) * 4;
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
      yield* this.#organicCliffs(ctx, this.rockR, x0, y0, cw, ch);
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
    const R = this.rockR, G = this.pal.grass;
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
    const n = (vnoise(px / 13, py / 11, 300) - 0.5) * 0.55 + (vnoise(px / 6, py / 6, 301) - 0.5) * 0.35 + (vnoise(px / 2.5, py / 2.5, 302) - 0.5) * 0.14;
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
    const put = (i, hex) => { const v = parseInt(hex.slice(1), 16); d[i] = v >> 16; d[i + 1] = (v >> 8) & 255; d[i + 2] = v & 255; };
    const dark = (i, k) => { d[i] *= 1 - k; d[i + 1] *= 1 - k; d[i + 2] *= 1 - k * 0.8; };
    const dith = (x, y) => [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5][(y & 3) * 4 + (x & 3)] / 16;
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
          const s = py + px * 0.18 + vnoise(px / 10, py / 22, 304) * 7;
          const layer = Math.floor(s / 5), q = s - layer * 5;
          let k = 2;
          const fac = vnoise(px / 7, py / 6, 320);
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
          const n = vnoise(px / 9, py / 9, 313) * 0.55 + vnoise(px / 3, py / 3, 314) * 0.3 + hash2(px, py, 315) * 0.15;
          let k = Math.floor(2.5 + n * 2.6);
          const rip = Math.sin(py * 0.85 + vnoise(px / 14, py / 10, 316) * 9);
          const ripZone = vnoise(px / 22, py / 18, 323);
          if (ripZone > 0.5 && rip > 0.88 && dith(px, py) < (ripZone - 0.5) * 3) k -= 1; else if (ripZone > 0.55 && rip < -0.92 && dith(px, py) < 0.4) k += 1;
          let col = G[Math.max(0, Math.min(5, k))];
          // vereinzelte kleine Felsnasen (je 12-px-Zelle höchstens eine), oben verschneit
          const cx0 = Math.floor(px / 12), cy0 = Math.floor(py / 12);
          if (hash2(cx0, cy0, 317) < 0.16) {
            const rx = cx0 * 12 + 3 + Math.floor(hash2(cx0, cy0, 318) * 6), ry = cy0 * 12 + 3 + Math.floor(hash2(cx0, cy0, 319) * 6);
            const rr = 1.6 + hash2(cx0, cy0, 322) * 1.6, ex = (px - rx) / (rr * 1.3), ey = (py - ry) / rr;
            const q = ex * ex + ey * ey;
            if (q < 1) col = ey < -0.3 ? G[4] : ex < -0.2 ? R[4] : ey > 0.45 ? R[2] : R[3];
            else if (q < 1.9 && py > ry && Math.abs(ex) < 1) col = G[1];          // kurzer Schatten
          }
          if (b <= faceH + 2) col = b === faceH + 1 ? G[5] : G[4];                       // Schneekante über der Wand
          else {
            const e1 = !inM(px - 1, py) || !inM(px + 1, py) || !inM(px, py - 1);
            const e2 = !inM(px - 2, py) || !inM(px + 2, py) || !inM(px, py - 2);
            const e3 = !inM(px - 3, py) || !inM(px + 3, py) || !inM(px, py - 3) || !inM(px, py - 4);
            if (e1) col = (!inM(px - 1, py) || !inM(px, py - 1)) ? R[4] : R[2];
            else if (e2) col = dith(px, py) < 0.5 ? R[3] : G[1];
            else if (e3 && dith(px, py) < 0.4) col = G[2];
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

  #cliffKind(x, y) {
    const wall = (tx, ty) => tx < 0 || ty < 0 || tx >= this.w || ty >= this.h || this.rows[ty][tx] === '#';
    if (!wall(x, y)) return 'floor';
    if (!wall(x, y + 1) && y + 1 < this.h) return 'faceLower';
    if (wall(x, y - 1) && wall(x, y + 1) && y + 2 < this.h && !wall(x, y + 2)) return 'faceUpper';
    return 'top';
  }
}
