import { CONFIG } from '../config.js';

const T = CONFIG.tileSize;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const MAX_DIST = 64;

// Flow-Field-Pathfinding: eine Breitensuche vom Helden aus liefert für
// jede Bodenzelle die Distanz. Beliebig viele Gegner navigieren damit
// um Wände und Säulen – bei Kosten O(Zellen) nur bei Zellwechsel des Ziels.
export class FlowField {
  constructor(dungeon) {
    this.d = dungeon;
    this.w = dungeon.w; this.h = dungeon.h;
    this.dist = new Float32Array(this.w * this.h).fill(Infinity);
    this.blocked = new Uint8Array(this.w * this.h);
    this.targetKey = -1;
  }

  // Statische Hindernisse (Säulen etc.) erst nach dem Platzieren bekannt.
  rebuildBlocked() {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const cx = x * T + T / 2, cy = y * T + T / 2;
      let b = this.d.isWall(x, y);
      if (!b) for (const bx of this.d.boxes) if (!bx.off && cx > bx.x0 - 3 && cx < bx.x1 + 3 && cy > bx.y0 - 6 && cy < bx.y1 + 6) { b = true; break; }
      this.blocked[y * this.w + x] = b ? 1 : 0;
    }
    this.targetKey = -1;
  }

  #free(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h && !this.blocked[y * this.w + x]; }

  // Distanzfeld ab Heldenzelle. Ringpuffer mit „steht schon an“-Markierung: jede Zelle höchstens einmal
  // gleichzeitig in der Warteschlange (früher Int32Array(w*h) ohne Markierung – auf offenen Karten mehr
  // Einreihungen als Plätze, überzählige wurden still verworfen). Suche endet bei MAX_DIST Kacheln Wegstrecke
  // (weiter jagt kein Gegner: Leine ≤ 20 Kacheln) – auf 160×104-Karten ein Bruchteil der Zellen.
  update(tx, ty) {
    const gx = Math.floor(tx / T), gy = Math.floor(ty / T);
    const key = gy * this.w + gx;
    if (key === this.targetKey) return;
    this.targetKey = key;
    const dist = this.dist, n = this.w * this.h;
    dist.fill(Infinity);
    if (gx < 0 || gy < 0 || gx >= this.w || gy >= this.h) return;
    const queue = this.queue ??= new Int32Array(n);
    const queued = this.queued ??= new Uint8Array(n);
    queued.fill(0);
    let head = 0, size = 0;
    dist[key] = 0; queue[0] = key; size = 1; queued[key] = 1;
    while (size > 0) {
      const i = queue[head]; head = head + 1 === n ? 0 : head + 1; size--; queued[i] = 0;
      const di = dist[i];
      if (di >= MAX_DIST) continue;
      const x = i % this.w, y = (i / this.w) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (!this.#free(nx, ny)) continue;
        if (dx && dy && (!this.#free(x + dx, y) || !this.#free(x, y + dy))) continue; // keine Ecken schneiden
        const ni = ny * this.w + nx;
        const nd = di + (dx && dy ? 1.414 : 1);
        if (nd < dist[ni]) {
          dist[ni] = nd;
          if (!queued[ni]) { queued[ni] = 1; let tail = head + size; if (tail >= n) tail -= n; queue[tail] = ni; size++; }
        }
      }
    }
  }

  // Richtung (normiert) zur benachbarten Zelle mit geringster Distanz.
  direction(x, y) {
    const gx = Math.floor(x / T), gy = Math.floor(y / T);
    const here = this.dist[gy * this.w + gx];
    let best = here, bx = 0, by = 0;
    for (const [dx, dy] of DIRS) {
      const nx = gx + dx, ny = gy + dy;
      if (!this.#free(nx, ny)) continue;
      if (dx && dy && (!this.#free(gx + dx, gy) || !this.#free(gx, gy + dy))) continue;
      const v = this.dist[ny * this.w + nx];
      if (v < best) { best = v; bx = nx; by = ny; }
    }
    if (best === here) return null;
    const vx = bx * T + T / 2 - x, vy = by * T + T / 2 - y;
    const l = Math.hypot(vx, vy) || 1;
    return { x: vx / l, y: vy / l };
  }
}
