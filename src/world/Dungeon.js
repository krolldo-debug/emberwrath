import { CONFIG } from '../config.js';
import { makeCanvas } from '../gfx/PixelCanvas.js';
import { createFloorTiles, createWallFaceTiles, createWallTopTile } from '../sprites/tiles.js';
import { hash2 } from '../core/math.js';
import { TileMap } from './TileMap.js';

const T = CONFIG.tileSize;
const SOLID = new Set(['#', 'T', 'b', 'k', 'D', '~', '$']); // $ = verborgener Durchgang (öffnet per Hebel)
const FLOOR = new Set(['.']);

// Dungeon-Karte: Steinboden, Mauern in 3/4-Perspektive, Wanddeko.
// Objekte (Fackeln, Säulen, Truhen …) werden als "placements" an die World gemeldet.
export class Dungeon extends TileMap {
  constructor(level) {
    super(level, { solidChars: SOLID, floorChars: FLOOR });
    this.biome = 'dungeon';
    this.biomeKey = level.biome ?? null; // 'temple' | 'forge' | null (Katakomben)
    this.liquidCells = [];
    // m: Uferbits der 8 Nachbarn (N,O,S,W,NO,SO,SW,NW keine Flüssigkeit) für Randkacheln
    const NB = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.rows[y][x] === '~') this.liquidCells.push({ x, y, top: this.rows[y - 1]?.[x] !== '~', m: NB.reduce((m, [dx, dy], i) => m | (this.rows[y + dy]?.[x + dx] !== '~' ? 1 << i : 0), 0) });
  }

  isLiquid(tx, ty) { return this.rows[ty]?.[tx] === '~'; }

  // Wasser/Lava ist fest, verdeckt aber keine Sicht (Geschosse fliegen darüber)
  lineOfSight(ax, ay, bx, by) {
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 6);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      const tx = Math.floor(x / T), ty = Math.floor(y / T);
      if (this.isWall(tx, ty) && !this.isLiquid(tx, ty)) return false;
      for (const b of this.boxes) if (!b.off && !b.low && x > b.x0 - 4 && x < b.x1 + 4 && y > b.y0 - 4 && y < b.y1 + 4) return false;
    }
    return true;
  }

  // Liquid zählt für die Wand-Perspektive als Boden (keine Mauerfront davor)
  wallKind(x, y) {
    if (this.isLiquid(x, y)) return 'liquid';
    const wall = (tx, ty) => this.isWall(tx, ty) && !this.isLiquid(tx, ty);
    if (!wall(x, y)) return 'floor';
    if (!wall(x, y + 1) && y + 1 < this.h) return 'faceLower';
    if (wall(x, y - 1) && wall(x, y + 1) && y + 2 < this.h && !wall(x, y + 2)) return 'faceUpper';
    return 'top';
  }

  onCell(ch, x, y, cx, cy) {
    const P = (type, px = cx, py = cy) => this.placements.push({ type, x: px, y: py, tx: x, ty: y });
    const deco = this.level.decor?.[ch];
    if (deco) { this.placements.push({ type: 'bdecor', name: deco, x: cx, y: cy + 6, tx: x, ty: y }); return; }
    const trap = this.level.traps?.[ch];
    if (trap) { this.placements.push({ type: 'trap', trap, x: cx, y: cy + 2, tx: x, ty: y }); return; }
    switch (ch) {
      case 'T': P('torch', cx, y * T + 5); break;
      case 'b': P('banner', cx, y * T - 10); break;
      case 'k': P('chains', cx, y * T - 8); break;
      case 'D': P('stairs', x * T, y * T + T); break;
      case 'P': P('pillar', cx, cy + 5); break;
      case 'B': P('brazier', cx, cy + 4); break;
      case 'c': P('candles', cx, cy + 3); break;
      case 'x': P('bones', cx, cy + 3); break;
      case 'R': P('rune', cx, cy); break;
      case 'C': P('chest', cx, cy + 5); break;
      case 'G': P('gate', cx, y * T + T); break;
      case 'W': P('web'); break;
      case 'O': P('cocoon', cx, cy + 5); break;
      case 'Z': P('sarcophagus', cx, cy + 10); break;
      case 'Y': P('throne', cx + T / 2, cy + 6); break;
    }
  }

  renderBackground(props, crypt, biome = null) {
    const floor = biome?.floor ?? createFloorTiles();
    const faces = biome?.faces ?? createWallFaceTiles();
    const top = biome?.top ?? createWallTopTile();
    const edge = biome?.topEdge ?? '#3a3346', edgeLight = biome?.topEdgeLight ?? '#4b4259';
    this.biomeTiles = biome;
    const c = makeCanvas(this.pixelW, this.pixelH);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const kind = this.wallKind(x, y);
        const h = hash2(x, y, 3);
        const px = x * T, py = y * T;
        if (kind === 'liquid') {
          const L = biome?.liquid;
          if (L?.tile) {
            // Randkacheln sind außerhalb der organischen Uferlinie durchsichtig: Boden darunter legen
            const mt = floor[Math.floor(hash2(x >> 1, y >> 1, 3) * floor.length)];
            ctx.drawImage(mt, (x & 1) * T, (y & 1) * T, T, T, px, py, T, T);
            ctx.drawImage(L.tile(x, y, 0, this.liquidCells.find((c) => c.x === x && c.y === y).m), px, py);
          }
          else if (L) { ctx.drawImage(L.frames[0], px, py); if (this.rows[y - 1]?.[x] !== '~' && L.edge) ctx.drawImage(L.edge, px, py); }
          else { ctx.fillStyle = '#0a0d1e'; ctx.fillRect(px, py, T, T); }
          continue;
        }
        if (kind === 'floor') {
          // Makrotile je 2x2-Block wählen, Viertel passend zur Zelle zeichnen
          const mt = floor[Math.floor(hash2(x >> 1, y >> 1, 3) * floor.length)];
          ctx.drawImage(mt, (x & 1) * T, (y & 1) * T, T, T, px, py, T, T);
        }
        else if (kind === 'faceLower') ctx.drawImage(faces.lower[Math.floor(h * faces.lower.length)], px, py);
        else if (kind === 'faceUpper') ctx.drawImage(faces.upper[Math.floor(h * faces.upper.length)], px, py);
        else ctx.drawImage(top, px, py);
      }
    }

    biome?.decorate?.(ctx, this); // biomeigene Bodenzier/Ufer mit Kartenwissen

    // Kanten der Wandkronen + Schlagschatten/AO auf dem Boden
    const organic = !!biome?.liquid?.tile;
    const open = (tx, ty) => { const k = this.wallKind(tx, ty); return k === 'floor' || k === 'faceLower' || k === 'faceUpper' || k === 'liquid'; };
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const px = x * T, py = y * T;
        const kind = this.wallKind(x, y);
        if (kind === 'top') {
          ctx.fillStyle = edge;
          if (open(x, y + 1)) ctx.fillRect(px, py + T - 2, T, 2);
          if (open(x - 1, y)) ctx.fillRect(px, py, 1, T);
          if (open(x + 1, y)) ctx.fillRect(px + T - 1, py, 1, T);
          if (open(x, y - 1)) ctx.fillRect(px, py, T, 1);
          ctx.fillStyle = edgeLight;
          if (open(x, y + 1)) ctx.fillRect(px, py + T - 2, T, 1);
        }
        if (kind === 'faceUpper' && !this.isWall(x, y - 1)) {
          ctx.fillStyle = edge; ctx.fillRect(px, py, T, 2);
        }
        if (kind !== 'floor') continue;
        // Schlagschatten nur von echten Mauern – Becken mit organischem Ufer (Lava) sind fest,
        // werfen aber keinen Schatten (sonst entsteht um jedes Becken ein dunkler Kachelrahmen)
        const hw = (tx, ty) => this.isWall(tx, ty) && !(organic && this.isLiquid(tx, ty));
        if (hw(x, y - 1)) {
          for (let i = 0; i < 7; i++) {
            ctx.fillStyle = `rgba(6,4,12,${0.6 * (1 - i / 7)})`;
            ctx.fillRect(px, py + i, T, 1);
          }
        }
        if (hw(x - 1, y)) { ctx.fillStyle = 'rgba(6,4,12,0.45)'; ctx.fillRect(px, py, 3, T); ctx.fillStyle = 'rgba(6,4,12,0.2)'; ctx.fillRect(px + 3, py, 2, T); }
        if (hw(x + 1, y)) { ctx.fillStyle = 'rgba(6,4,12,0.45)'; ctx.fillRect(px + T - 3, py, 3, T); ctx.fillStyle = 'rgba(6,4,12,0.2)'; ctx.fillRect(px + T - 5, py, 2, T); }
        if (hw(x, y + 1)) { ctx.fillStyle = 'rgba(6,4,12,0.3)'; ctx.fillRect(px, py + T - 2, T, 2); }
        if (!biome && this.isWall(x - 1, y) && this.isWall(x, y - 1) && hash2(x, y, 9) < 0.7) ctx.drawImage(props.cobwebL, px, py);
        if (!biome && this.isWall(x + 1, y) && this.isWall(x, y - 1) && hash2(x, y, 9) < 0.7) ctx.drawImage(props.cobwebR, px + T - 14, py);
      }
    }

    // Statische Deko direkt in den Hintergrund backen
    for (const pl of this.placements) {
      if (pl.type === 'banner') props.banner.draw(ctx, pl.x, pl.y);
      if (pl.type === 'chains') props.chains.draw(ctx, pl.x, pl.y);
      if (pl.type === 'web') {
        const w = crypt.webs[Math.floor(hash2(pl.tx, pl.ty, 5) * crypt.webs.length)];
        ctx.drawImage(w, Math.round(pl.x - w.width / 2), Math.round(pl.y - w.height / 2));
      }
    }
    // Treppe: einmal pro zusammenhängendem Paar
    const stairs = this.placements.filter((p) => p.type === 'stairs');
    if (stairs.length) {
      const x0 = Math.min(...stairs.map((s) => s.x)), y0 = stairs[0].y;
      const s = crypt.stairs;
      ctx.drawImage(s, Math.round(x0 + stairs.length * T / 2 - s.width / 2), y0 - s.height);
    }
    return c;
  }

  // Animiertes Wasser/Lava über dem gebackenen Hintergrund (nur sichtbare Zellen)
  renderLiquid(ctx, cx, cy, time) {
    const L = this.biomeTiles?.liquid;
    if (!L || !this.liquidCells.length) return;
    const W = CONFIG.viewWidth, H = CONFIG.viewHeight;
    for (const c of this.liquidCells) {
      const px = c.x * T - cx, py = c.y * T - cy;
      if (px < -T || py < -T || px > W || py > H) continue;
      const f = Math.floor(time * 4 + (L.tile ? 0 : hash2(c.x, c.y, 31) * 4)) % L.frames.length;
      ctx.drawImage(L.tile ? L.tile(c.x, c.y, f, c.m) : L.frames[f], Math.round(px), Math.round(py));
      const dark = 0.78 - this.#flow(c, time);
      if (dark > 0.02) {
        // nur die Flüssigkeit abdunkeln (Maske der Uferform), nicht den Ufersaum der Randkachel
        if (L.shade) { ctx.globalAlpha = dark; ctx.drawImage(L.shade(c.x, c.y, c.m), Math.round(px), Math.round(py)); ctx.globalAlpha = 1; }
        else { ctx.fillStyle = `rgba(10,4,6,${dark.toFixed(3)})`; ctx.fillRect(Math.round(px), Math.round(py), T, T); }
      }
      if (c.top && L.edge) ctx.drawImage(L.edge, Math.round(px), Math.round(py));
    }
  }

  #flow(c, time) {
    const w = Math.sin(c.x * 0.55 + c.y * 0.35 - time * 0.9) * 0.5 + Math.sin(c.x * 0.21 - c.y * 0.6 + time * 0.6 + hash2(c.x, c.y, 33) * 2) * 0.5;
    return 0.62 + w * 0.3 + (hash2(c.x, c.y, 35) - 0.5) * 0.16;
  }

  renderEmissive(ctx, cx, cy, time) {
    const L = this.biomeTiles?.liquid;
    if (!L?.glow || !this.liquidCells.length) return;
    const W = CONFIG.viewWidth, H = CONFIG.viewHeight;
    for (const c of this.liquidCells) {
      const px = c.x * T - cx, py = c.y * T - cy;
      if (px < -T || py < -T || px > W || py > H) continue;
      const f = Math.floor(time * 4 + (L.glowTile ? 0 : hash2(c.x, c.y, 31) * 4)) % L.glow.length;
      // Langsame Helligkeitswellen über die Fläche, damit das Kachelmuster nicht gleichförmig pulsiert
      ctx.globalAlpha = this.#flow(c, time);
      ctx.drawImage(L.glowTile ? L.glowTile(c.x, c.y, f, c.m) : L.glow[f], Math.round(px), Math.round(py));
    }
    ctx.globalAlpha = 1;
  }
}
