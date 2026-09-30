import { CONFIG } from '../config.js';
import { rand, pick } from '../core/math.js';
import { Entity, getShadow } from '../entities/Entity.js';

const T = CONFIG.tileSize;

// Kleintiere für mehr Leben: Krähen (picken, fliegen auf), Ratten (huschen,
// fliehen), Glutfalter (leuchtende Punkte, umflattern Lichter). Rein
// dekorativ – keine Kollision mit Kämpfern, keine Events, keine Beute.
// Pixelbilder als Zeichenketten (nach rechts blickend), pro Pixel ein fillRect.

const CROW = {
  stand: ['........', '....kkb.', '..kkkke.', '.kkhkk..', 'kk.kk...', '...l.l..'],
  peck: ['........', '........', '..kkkkk.', '.kkhkkeb', 'kk.kk...', '...l.l..'],
  up: ['kk...kk..', '.kk.kk...', '..kkkkkb.', '..kk.....'],
  down: ['.........', '..kkkkkb.', '.kk.kk...', 'kk...kk..'],
};
const CROW_PAL = { k: '#2c2836', h: '#5a5270', b: '#e0b050', e: '#f0e8d8', l: '#6a5040' };
const RAT = {
  a: ['..rrr..', '.rrrrre', 't.l.l..'],
  b: ['..rrr..', 'trrrrre', '..l..l.'],
};
const RAT_PAL = { r: '#6a6272', e: '#f0a0b0', t: '#9a7a80', l: '#3a3440' };

function drawPix(ctx, rows, pal, x, y, flip) {
  const w = rows[0].length, h = rows.length;
  const x0 = Math.round(x - w / 2), y0 = Math.round(y - h);
  for (let j = 0; j < h; j++) {
    const r = rows[j];
    for (let i = 0; i < w; i++) {
      const c = pal[r[i]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(flip ? x0 + w - 1 - i : x0 + i, y0 + j, 1, 1);
    }
  }
}

class Crow extends Entity {
  constructor(x, y) {
    super(x, y);
    this.state = 'ground'; this.t = rand(0, 3); this.z = 0; this.vz = 0;
    this.facing = Math.random() < 0.5 ? -1 : 1; this.next = rand(0.5, 2); this.peck = 0;
  }
  update(dt, world) {
    this.t += dt;
    const h = world.hero;
    const d = Math.hypot(h.x - this.x, h.y - this.y);
    if (this.state === 'ground') {
      const scared = d < 58 || world.enemies.some((e) => !e.dead && e.isEngaged && Math.hypot(e.x - this.x, e.y - this.y) < 50);
      if (scared) {
        this.state = 'fly';
        const a = Math.atan2(this.y - h.y, this.x - h.x) + rand(-0.5, 0.5);
        this.vx = Math.cos(a) * 80; this.vy = Math.sin(a) * 40 - 10; this.vz = 55;
        this.facing = this.vx < 0 ? -1 : 1;
        world.bus.emit('critter', { kind: 'crow', x: this.x, y: this.y });
        return;
      }
      this.next -= dt; this.peck = Math.max(0, this.peck - dt);
      if (this.next <= 0) {
        this.next = rand(0.6, 2.2);
        if (Math.random() < 0.55) this.peck = 0.35;
        else {
          // kleiner Hüpfer
          const nx = this.x + rand(-8, 8), ny = this.y + rand(-4, 4);
          if (!world.dungeon.isWall(Math.floor(nx / T), Math.floor(ny / T))) { this.facing = nx < this.x ? -1 : 1; this.x = nx; this.y = ny; this.z = 2; }
        }
      }
      this.z = Math.max(0, this.z - dt * 20);
    } else {
      this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt; this.vz += 10 * dt;
      if (this.z > 140) this.removed = true;
    }
  }
  render(ctx, cx, cy) {
    const x = this.x - cx, y = this.y - cy;
    if (this.z < 40) {
      const sh = getShadow(6);
      ctx.globalAlpha = 1 - this.z / 40;
      ctx.drawImage(sh, Math.round(x - 3), Math.round(y - 1));
      ctx.globalAlpha = 1;
    }
    let rows;
    if (this.state === 'fly') rows = Math.floor(this.t * 12) % 2 ? CROW.up : CROW.down;
    else rows = this.peck > 0 ? CROW.peck : CROW.stand;
    drawPix(ctx, rows, CROW_PAL, x, y - this.z, this.facing < 0);
  }
}

class Rat extends Entity {
  constructor(x, y) {
    super(x, y);
    this.t = rand(0, 3); this.facing = 1; this.target = null; this.wait = rand(0, 2); this.flee = 0;
  }
  update(dt, world) {
    this.t += dt;
    const h = world.hero, D = world.dungeon;
    const d = Math.hypot(h.x - this.x, h.y - this.y);
    let speed = 26;
    if (d < 64) {
      if (this.flee <= 0) world.bus.emit('critter', { kind: 'rat', x: this.x, y: this.y });
      this.flee = 1.4;
      const a = Math.atan2(this.y - h.y, this.x - h.x) + rand(-0.6, 0.6);
      this.target = { x: this.x + Math.cos(a) * 60, y: this.y + Math.sin(a) * 40 };
    }
    if (this.flee > 0) { this.flee -= dt; speed = 95; }
    if (!this.target) {
      this.wait -= dt;
      if (this.wait <= 0) { this.target = { x: this.x + rand(-40, 40), y: this.y + rand(-24, 24) }; }
      this.moving = false;
      return;
    }
    const dx = this.target.x - this.x, dy = this.target.y - this.y, L = Math.hypot(dx, dy);
    if (L < 2) { this.target = null; this.wait = rand(0.8, 3); this.moving = false; return; }
    const nx = this.x + (dx / L) * speed * dt, ny = this.y + (dy / L) * speed * dt;
    if (D.collidesRect(nx - 2, ny - 1, nx + 2, ny + 1)) { this.target = null; this.wait = rand(0.2, 1); return; }
    this.facing = dx < 0 ? -1 : 1;
    this.x = nx; this.y = ny; this.moving = true;
  }
  render(ctx, cx, cy) {
    const rows = this.moving && Math.floor(this.t * 14) % 2 ? RAT.b : RAT.a;
    drawPix(ctx, rows, RAT_PAL, this.x - cx, this.y - cy + 1, this.facing < 0);
  }
}

// Glutfalter: flattert um einen Ankerpunkt (gern ein Licht), leuchtet nur im Emissive-Pass
class Moth extends Entity {
  constructor(x, y, color) {
    super(x, y);
    this.home = { x, y }; this.t = rand(0, 10); this.color = color; this.sortOffset = 30;
    this.r = rand(10, 26); this.spd = rand(1.2, 2.4) * (Math.random() < 0.5 ? -1 : 1);
  }
  update(dt, world) {
    this.t += dt;
    const h = world.hero;
    // weicht dem Helden ein Stück aus
    const dh = Math.hypot(h.x - this.home.x, h.y - this.home.y);
    const push = dh < 40 ? (40 - dh) * 0.6 : 0;
    const a = Math.atan2(this.home.y - h.y, this.home.x - h.x);
    this.x = this.home.x + Math.cos(this.t * this.spd) * this.r + Math.sin(this.t * 3.1) * 3 + Math.cos(a) * push;
    this.y = this.home.y + Math.sin(this.t * this.spd * 1.3) * this.r * 0.5 + Math.cos(this.t * 2.3) * 2 + Math.sin(a) * push;
  }
  renderEmissive(ctx, cx, cy) {
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy - 14);
    const flap = Math.floor(this.t * 16) % 2;
    ctx.globalAlpha = 0.65 + 0.35 * Math.sin(this.t * 7);
    ctx.fillStyle = this.color[1];
    ctx.fillRect(x - 1 - flap, y, 1, 1); ctx.fillRect(x + 1 + flap, y, 1, 1);
    ctx.fillStyle = this.color[0];
    ctx.fillRect(x, y, 1, 2);
    ctx.globalAlpha = 1;
  }
}

// Bestand je Zone
const LIFE = {
  emberhollow: { crow: 9, moth: 0 },
  ashwood: { crow: 10, moth: 6 },
  cinder_peaks: { crow: 4, moth: 16 },
  catacombs: { rat: 9 },
  sunken_temple: { rat: 6, moth: 8, mothColor: ['#e8fff8', '#60e0d0'] },
  molten_forge: { rat: 4, moth: 12 },
};

export class AmbientLife {
  constructor(world) {
    this.world = world;
    this.cfg = LIFE[world.zone.id] ?? null;
    this.list = [];
    this.timer = 3;
    if (!this.cfg) return;
    for (const kind of ['crow', 'rat', 'moth']) for (let i = 0; i < (this.cfg[kind] ?? 0); i++) this.#spawn(kind, false);
  }

  #freeSpot(far) {
    const w = this.world, D = w.dungeon, h = w.hero;
    for (let i = 0; i < 30; i++) {
      const tx = Math.floor(rand(1, D.w - 1)), ty = Math.floor(rand(1, D.h - 1));
      if (D.isWall(tx, ty)) continue;
      const x = tx * T + rand(3, 13), y = ty * T + rand(4, 14);
      if (D.collidesRect(x - 3, y - 2, x + 3, y + 1)) continue;
      if (D.terrainAt?.(tx, ty) === '~' || D.isLiquid?.(tx, ty)) continue;
      const d = h ? Math.hypot(h.x - x, h.y - y) : 999;
      if (d < (far ? 220 : 90)) continue;
      return { x, y };
    }
    return null;
  }

  #spawn(kind, far) {
    const w = this.world;
    let p;
    if (kind === 'moth') {
      // bevorzugt an Lichtquellen (Lagerfeuer, Kohlebecken, Lava)
      const lights = w.lights.filter((l) => !l.follow && l.ttl === Infinity && l.radius > 30);
      const l = lights.length && Math.random() < 0.8 ? pick(lights) : null;
      p = l ? { x: l.x + rand(-12, 12), y: l.y + 16 + rand(-6, 6) } : this.#freeSpot(far);
    } else p = this.#freeSpot(far);
    if (!p) return;
    const c = kind === 'crow' ? new Crow(p.x, p.y) : kind === 'rat' ? new Rat(p.x, p.y)
      : new Moth(p.x, p.y, this.cfg.mothColor ?? ['#fff0b0', '#f07a1c']);
    c.critter = kind;
    this.list.push(c);
    w.spawn(c);
  }

  update(dt) {
    if (!this.cfg) return;
    this.list = this.list.filter((c) => !c.removed);
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 4;
    // Aufgeflogene Krähen kommen außerhalb der Sicht nach und nach zurück
    const n = this.list.filter((c) => c.critter === 'crow').length;
    if (n < (this.cfg.crow ?? 0)) this.#spawn('crow', true);
  }
}
