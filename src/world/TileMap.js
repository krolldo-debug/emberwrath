import { CONFIG } from '../config.js';

const T = CONFIG.tileSize;
const BOX_CELL = 32;
const BOX_PAD = 5;   // ≥ größter Sichtlinien-Rand (TileMap 4 px, Outdoor 3 px)
const NO_BOXES = [];

// Gemeinsame Grundlage für Dungeon- und Außenkarten: Raster, Kollision,
// Sichtlinie, benannte Punkte und Markierungen (Gegner, NPCs).
// Unterklassen legen fest, welche Zeichen fest sind (solidChars), was
// ein Zeichen als Deko bedeutet (onCell) und wie der Hintergrund aussieht.
export class TileMap {
  constructor(level, { solidChars, floorChars, terrainChars = null }) {
    this.level = level;
    this.rows = level.map;
    this.h = this.rows.length;
    this.w = this.rows[0].length;
    this.pixelW = this.w * T;
    this.pixelH = this.h * T;
    this.solid = new Uint8Array(this.w * this.h);
    this.terrain = []; // Untergrund je Zelle (Markierungen/Deko ersetzt)
    this.placements = []; // { type, x, y, tx, ty } – Deko/Objekte für die World
    this.spawns = {};     // benannte Punkte (Welt-Pixel)
    this.enemyMarks = []; // { type, x, y, ...opts }
    this.npcMarks = [];   // { npcId, x, y }
    this.boxes = [];      // statische Kollisionsboxen (Säulen, Bäume …)
    this.solidChars = solidChars;
    this.floorChars = floorChars;
    this.terrainChars = terrainChars ?? new Set([...solidChars, ...floorChars]);
    this.#parse();
    this.heroStart = this.spawns.start ?? { x: this.pixelW / 2, y: this.pixelH / 2 };
  }

  #parse() {
    const L = this.level;
    for (let y = 0; y < this.h; y++) {
      const row = this.rows[y];
      if (row.length !== this.w) throw new Error(`Level-Zeile ${y} hat falsche Breite`);
      const trow = [];
      for (let x = 0; x < this.w; x++) {
        const ch = row[x];
        const cx = x * T + T / 2, cy = y * T + T / 2;
        this.solid[y * this.w + x] = this.solidChars.has(ch) ? 1 : 0;
        trow.push(this.terrainChars.has(ch) ? ch : null);
        if (L.points?.[ch]) this.spawns[L.points[ch]] = { x: cx, y: cy + 4 };
        else if (L.enemies?.[ch]) this.enemyMarks.push({ ...L.enemies[ch], x: cx, y: cy + 4, tx: x, ty: y });
        else if (L.npcs?.[ch]) this.npcMarks.push({ npcId: L.npcs[ch], x: cx, y: cy + 4 });
        else this.onCell(ch, x, y, cx, cy);
      }
      this.terrain.push(trow);
    }
    // Untergrund unter Markierungen/Deko = häufigster Boden der Nachbarn
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.terrain[y][x] !== null) continue;
        const count = {};
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
          const c = this.terrain[y + dy]?.[x + dx];
          if (c && this.floorChars.has(c)) count[c] = (count[c] ?? 0) + 1;
        }
        const best = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
        this.terrain[y][x] = best ? best[0] : this.level.baseFloor ?? [...this.floorChars][0];
      }
    }
  }

  // Unterklassen: Zeichen -> placements / boxes
  onCell(ch, x, y, cx, cy) {}

  terrainAt(x, y) { return this.terrain[y]?.[x] ?? '#'; }

  isWall(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return true;
    return this.solid[ty * this.w + tx] === 1;
  }

  // Raster der statischen Boxen (Zellen à BOX_CELL px, jede Box in allen Zellen ihres um BOX_PAD
  // vergrößerten Rechtecks). Boxen werden nur angehängt (placeObjects) und nie verschoben; `off`
  // wird bei der Abfrage geprüft. Neu gebaut, sobald sich die Anzahl ändert. Vorher prüften
  // Sichtlinie und Kollision bei jedem Schritt ALLE Boxen (300+ auf großen Karten).
  #grid = null;
  #gridLen = -1;
  #boxGrid() {
    if (this.#gridLen === this.boxes.length && this.#grid) return this.#grid;
    const cols = Math.ceil(this.pixelW / BOX_CELL), rows = Math.ceil(this.pixelH / BOX_CELL);
    const cells = new Array(cols * rows);
    const cx = (x) => Math.max(0, Math.min(cols - 1, Math.floor(x / BOX_CELL)));
    const cy = (y) => Math.max(0, Math.min(rows - 1, Math.floor(y / BOX_CELL)));
    for (const b of this.boxes) {
      for (let j = cy(b.y0 - BOX_PAD); j <= cy(b.y1 + BOX_PAD); j++) for (let i = cx(b.x0 - BOX_PAD); i <= cx(b.x1 + BOX_PAD); i++) (cells[j * cols + i] ??= []).push(b);
    }
    this.#grid = { cols, rows, cells, cx, cy };
    this.#gridLen = this.boxes.length;
    return this.#grid;
  }

  // Boxen, die einen Punkt (± BOX_PAD) berühren können
  boxesAt(x, y) {
    const g = this.#boxGrid();
    return g.cells[g.cy(y) * g.cols + g.cx(x)] ?? NO_BOXES;
  }

  // Prüft, ob ein Rechteck (Welt-Pixel) mit Wand oder statischer Box kollidiert.
  collidesRect(x0, y0, x1, y1) {
    const tx0 = Math.floor(x0 / T), ty0 = Math.floor(y0 / T);
    const tx1 = Math.floor((x1 - 0.001) / T), ty1 = Math.floor((y1 - 0.001) / T);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (this.isWall(tx, ty)) return true;
    const g = this.#boxGrid();
    for (let j = g.cy(y0); j <= g.cy(y1); j++) for (let i = g.cx(x0); i <= g.cx(x1); i++) {
      const list = g.cells[j * g.cols + i];
      if (list) for (const b of list) if (!b.off && x0 < b.x1 && x1 > b.x0 && y0 < b.y1 && y1 > b.y0) return true;
    }
    return false;
  }

  // Sichtlinie (grob, per Tile-Sampling) – für Fernkampf-KI und Aggro.
  // Niedrige Hindernisse (b.low) blockieren die Sicht nicht.
  lineOfSight(ax, ay, bx, by) {
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 6);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      if (this.isWall(Math.floor(x / T), Math.floor(y / T))) return false;
      for (const b of this.boxesAt(x, y)) if (!b.off && !b.low && x > b.x0 - 4 && x < b.x1 + 4 && y > b.y0 - 4 && y < b.y1 + 4) return false;
    }
    return true;
  }

  // Wandklassifikation für die 3/4-Perspektive.
  wallKind(x, y) {
    if (!this.isWall(x, y)) return 'floor';
    if (!this.isWall(x, y + 1) && y + 1 < this.h) return 'faceLower';
    if (this.isWall(x, y - 1) && this.isWall(x, y + 1) && y + 2 < this.h && !this.isWall(x, y + 2)) return 'faceUpper';
    return 'top';
  }

  // Nächste freie Bodenposition (für Beschwörungen, Respawns)
  nearestFree(x, y, r = 5) {
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    for (let d = 0; d <= 4; d++) {
      for (let j = -d; j <= d; j++) for (let i = -d; i <= d; i++) {
        const px = (tx + i) * T + T / 2, py = (ty + j) * T + T / 2 + 4;
        if (!this.collidesRect(px - r, py - r, px + r, py + r * 0.5)) return { x: px, y: py };
      }
    }
    return { x, y };
  }
}
