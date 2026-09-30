import { CONFIG } from '../config.js';
import { makeCanvas } from '../gfx/PixelCanvas.js';
import { hash2 } from '../core/math.js';
import { TileMap } from './TileMap.js';
import { groundPixel, vnoise, OUT, FISSURE, BIOME_GROUND } from '../sprites/outdoor.js';
import { GROUND_STEPPE } from '../sprites/decor_steppe.js';
import { GROUND_MARSH } from '../sprites/decor_marsh.js';
import { GROUND_FROST } from '../sprites/decor_frost.js';
import { GROUND_WASTES } from '../sprites/decor_wastes.js';

// Bodenpaletten der Runde-3-Zonen liegen bei ihren Deko-Sätzen (Import hier, sonst Kreis über decor_ashwood -> outdoor.js)
const GROUNDS = { ...BIOME_GROUND, steppe: GROUND_STEPPE, marsh: GROUND_MARSH, frost: GROUND_FROST, wastes: GROUND_WASTES };
// Felsfarbe je Biom: die Klippenkacheln sind dunkler Stein mit Graskante; im Schnee sonst schwarze Löcher
const CLIFF_TINT = { frost: { top: ['#b8c8dc', 0.62], face: ['#6a7a94', 0.35] } };
const tintCache = new Map();
function tinted(list, [color, alpha], key) {
  if (!tintCache.has(key)) tintCache.set(key, list.map((src) => {
    const c = makeCanvas(src.width, src.height), x = c.getContext('2d');
    x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-atop'; x.globalAlpha = alpha; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
    return c;
  }));
  return tintCache.get(key);
}

const T = CONFIG.tileSize;
const SOLID = new Set(['#', '~', '=', 'H', 'f']);
const FLOOR = new Set([',', '.', ':']);
const TERRAIN = new Set([',', '.', ':', '#', '~', '=']);
const DECOR = { t: 'pine', d: 'deadtree', r: 'rock', u: 'bush', f: 'fence', g: 'grave', l: 'lamp', F: 'campfire', w: 'well', c: 'crate', S: 'sign' };

// Außenkarte: Gras, Wege, Pflaster, Wasser, Glutspalten, Klippen.
// Der Boden wird pixelweise mit verrauschten Übergängen erzeugt (keine
// sichtbaren Kachelkanten). Glühende Spalten liegen auf einer eigenen
// Emissive-Ebene, die nach dem Licht gezeichnet wird.
export class Outdoor extends TileMap {
  constructor(level) {
    // level.solid: zusätzliche feste Deko-Zeichen (Palisaden, Mauern); Boden darunter wie Nachbarn
    super(level, { solidChars: level.solid ? new Set([...SOLID, ...level.solid]) : SOLID, floorChars: FLOOR, terrainChars: TERRAIN });
    this.biome = 'outdoor';
    this.pal = GROUNDS[level.biome] ?? OUT;
    this.groundBiome = level.biome;
    this.emissive = null;
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
      for (const b of this.boxes) if (!b.off && !b.low && x > b.x0 - 3 && x < b.x1 + 3 && y > b.y0 - 3 && y < b.y1 + 3) return false;
    }
    return true;
  }

  #jitterTerrain(px, py) {
    const jx = px + (vnoise(px / 7, py / 7, 21) - 0.5) * 9;
    const jy = py + (vnoise(px / 7, py / 7, 22) - 0.5) * 9;
    return this.terrainAt(Math.floor(jx / T), Math.floor(jy / T));
  }

  renderBackground(assets) {
    const O = assets.sprites.outdoor;
    const W = this.pixelW, H = this.pixelH;
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(W, H);
    const d = img.data;
    const em = makeCanvas(W, H);
    const ectx = em.getContext('2d');
    const eimg = ectx.createImageData(W, H);
    const ed = eimg.data;

    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const i = (py * W + px) * 4;
        let kind = this.#jitterTerrain(px, py);
        if (kind === '#') kind = ',';
        let col;
        const pal = this.pal;
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
            const L = pal.water;
            const k = Math.min(4, 1 + Math.floor(flow * 4.2));
            const c = parseInt(L[k].slice(1), 16);
            ed[i] = (c >> 16) & 255; ed[i + 1] = (c >> 8) & 255; ed[i + 2] = c & 255; ed[i + 3] = k >= 3 ? 255 : 190;
          } else if (hash2(px, py, 94) < 0.25) { ed[i] = 200; ed[i + 1] = 60; ed[i + 2] = 12; ed[i + 3] = 140; }
        } else if (kind === '~') {
          col = groundPixel('~', px, py, pal);
          const above = this.#jitterTerrain(px, py - 3);
          const above1 = this.#jitterTerrain(px, py - 1);
          if (above !== '~') col = [34, 26, 22];
          else if (above1 !== '~') col = [8, 9, 18];
          if (col[2] > 60 && hash2(px, py, 25) < 0.3) { ed[i] = 90; ed[i + 1] = 110; ed[i + 2] = 190; ed[i + 3] = 60; }
        } else col = groundPixel(kind, px, py, pal);
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    ectx.putImageData(eimg, 0, 0);
    this.emissive = em;
    for (const line of this.level.fissures ?? []) this.#drawFissure(ctx, ectx, line);

    // Deko im Gras
    const tufts = O.tufts;
    if (this.pal.tufts !== false)
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.rows[y][x] !== ',' && !(this.terrainAt(x, y) === ',' && !SOLID.has(this.rows[y][x]))) continue;
      for (let k = 0; k < 3; k++) {
        const hsh = hash2(x, y, 40 + k);
        if (hsh > 0.45) continue;
        const t = tufts[Math.floor(hash2(x, y, 50 + k) * (hsh < 0.04 ? tufts.length : 6))];
        ctx.drawImage(t, x * T + Math.floor(hash2(x, y, 60 + k) * 12), y * T + Math.floor(hash2(x, y, 70 + k) * 12));
      }
    }

    // Klippen in 3/4-Perspektive
    const tint = CLIFF_TINT[this.groundBiome];
    const cl = tint ? { top: tinted(O.cliff.top, tint.top, this.groundBiome + ':top'), upper: tinted(O.cliff.upper, tint.face, this.groundBiome + ':upper'), lower: tinted(O.cliff.lower, tint.face, this.groundBiome + ':lower') } : O.cliff;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.rows[y][x] !== '#') continue;
      const kind = this.#cliffKind(x, y);
      const h = hash2(x, y, 3);
      const px = x * T, py = y * T;
      if (kind === 'faceLower') ctx.drawImage(cl.lower[Math.floor(h * cl.lower.length)], px, py);
      else if (kind === 'faceUpper') ctx.drawImage(cl.upper[Math.floor(h * cl.upper.length)], px, py);
      else {
        ctx.drawImage(cl.top[Math.floor(h * cl.top.length)], px, py);
        const open = (tx, ty) => this.rows[ty]?.[tx] !== undefined && this.rows[ty][tx] !== '#';
        ctx.fillStyle = OUT.rock[3];
        if (open(x - 1, y)) ctx.fillRect(px, py, 2, T);
        if (open(x + 1, y)) ctx.fillRect(px + T - 2, py, 2, T);
        if (open(x, y - 1)) ctx.fillRect(px, py, T, 2);
        ctx.fillStyle = OUT.rock[4];
        if (open(x - 1, y)) ctx.fillRect(px, py, 1, T);
        if (open(x, y - 1)) ctx.fillRect(px, py, T, 1);
        if (open(x, y + 1) || this.#cliffKind(x, y + 1) === 'faceUpper') { ctx.fillStyle = (tint ? this.pal : OUT).grass[3]; ctx.fillRect(px, py + T - 1, T, 1); }
      }
    }
    // Schatten der Klippen/Gebäude auf dem Boden
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.rows[y][x] === '#') continue;
      const px = x * T, py = y * T;
      if (this.rows[y - 1]?.[x] === '#') for (let i = 0; i < 8; i++) { ctx.fillStyle = `rgba(4,3,10,${0.55 * (1 - i / 8)})`; ctx.fillRect(px, py + i, T, 1); }
      if (this.rows[y]?.[x - 1] === '#') { ctx.fillStyle = 'rgba(4,3,10,0.35)'; ctx.fillRect(px, py, 4, T); }
      if (this.rows[y]?.[x + 1] === '#') { ctx.fillStyle = 'rgba(4,3,10,0.2)'; ctx.fillRect(px + T - 3, py, 3, T); }
    }
    for (const b of this.level.buildings ?? []) {
      ctx.fillStyle = 'rgba(4,3,10,0.45)';
      ctx.fillRect(b.x * T + 6, (b.y + b.h) * T - 4, b.w * T, 9);
    }
    return c;
  }

  // Glutspalte entlang einer Polylinie (Tile-Koordinaten): verkohlter Rand,
  // mäandernder Glutkern (auch auf der Emissive-Ebene) und kleine Seitenrisse.
  #drawFissure(ctx, ectx, pts) {
    const C = FISSURE.crust, E = FISSURE.core;
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
    for (const [x, y, w] of core) {
      ctx.fillStyle = C[0]; ctx.fillRect(Math.round(x - w), Math.round(y - w * 0.7), Math.round(w * 2), Math.round(w * 1.4));
    }
    for (const [x, y, w] of core) {
      ctx.fillStyle = C[2]; ctx.fillRect(Math.round(x - w * 0.5), Math.round(y - w * 0.35), Math.max(1, Math.round(w)), Math.max(1, Math.round(w * 0.7)));
    }
    for (const [x, y, w, dd] of core) {
      const heat = vnoise(dd / 6, 5, 84);
      const cw = w > 3.6 ? 2 : 1;
      ctx.fillStyle = E[heat > 0.5 ? 2 : 1]; ctx.fillRect(Math.round(x), Math.round(y), cw, 1);
      ectx.fillStyle = E[heat > 0.7 ? 5 : heat > 0.4 ? 4 : 3]; ectx.fillRect(Math.round(x), Math.round(y), cw, 1);
    }
    // Seitenrisse
    for (let i = 0; i < core.length; i += 40) {
      const [x, y, , dd] = core[i];
      if (hash2(i, 3, 85) < 0.35) continue;
      let cx = x, cy = y;
      const a = hash2(i, 5, 86) * Math.PI * 2;
      for (let k = 0; k < 10; k++) {
        cx += Math.cos(a + (hash2(i, k, 87) - 0.5)); cy += Math.sin(a + (hash2(i, k, 87) - 0.5)) * 0.7;
        ctx.fillStyle = C[0]; ctx.fillRect(Math.round(cx) - 1, Math.round(cy), 3, 1);
        if (k < 6) { ectx.fillStyle = E[3]; ectx.fillRect(Math.round(cx), Math.round(cy), 1, 1); }
      }
    }
  }

  #cliffKind(x, y) {
    const wall = (tx, ty) => tx < 0 || ty < 0 || tx >= this.w || ty >= this.h || this.rows[ty][tx] === '#';
    if (!wall(x, y)) return 'floor';
    if (!wall(x, y + 1) && y + 1 < this.h) return 'faceLower';
    if (wall(x, y - 1) && wall(x, y + 1) && y + 2 < this.h && !wall(x, y + 2)) return 'faceUpper';
    return 'top';
  }

  // Emissive-Ebene: glühende Spaltenkerne, pulsierend
  renderEmissive(ctx, cx, cy, time) {
    if (!this.emissive) return;
    const Wv = CONFIG.viewWidth, Hv = CONFIG.viewHeight;
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(time * 1.6);
    ctx.drawImage(this.emissive, Math.round(cx), Math.round(cy), Wv, Hv, 0, 0, Wv, Hv);
    ctx.globalAlpha = 1;
  }
}
