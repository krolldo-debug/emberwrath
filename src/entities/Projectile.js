import { Entity } from './Entity.js';
import { HazardCloud } from './Hazards.js';

// Pfeil: fliegt in Höhe z über dem Boden, bleibt in Wänden stecken,
// kann vom Schwert des Helden abgewehrt werden.
export class Arrow extends Entity {
  constructor(x, y, angle, speed, damage, owner, sprite) {
    super(x, y);
    this.angle = angle;
    this.vx = Math.cos(angle) * speed; this.vy = Math.sin(angle) * speed;
    this.z = 10; this.damage = damage; this.owner = owner;
    this.team = owner.team; this.sprite = sprite;
    this.stuck = false; this.life = 3; this.deflectable = true;
  }
  update(dt, world) {
    this.life -= dt;
    if (this.life <= 0) { this.removed = true; return; }
    if (this.stuck) return;
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    const T = 16;
    if (world.dungeon.isWall(Math.floor(nx / T), Math.floor((ny - this.z * 0.5) / T))) {
      this.stuck = true; this.life = 1.2;
      world.particles.dust(this.x, this.y - this.z, 3);
      world.bus.emit('arrowStuck', { x: this.x, y: this.y });
      return;
    }
    this.x = nx; this.y = ny;
    const h = world.hero;
    if (!h.dead && Math.hypot(h.x - this.x, h.centerY - (this.y - this.z * 0.2)) < h.hurtRadius + 2) {
      const hit = { damage: this.damage, dirX: Math.cos(this.angle), dirY: Math.sin(this.angle), knockback: 90, source: this.owner };
      if (h.takeHit(hit)) {
        world.bus.emit('hit', { attacker: this.owner, target: h, damage: hit.damage, crit: false, heavy: false, dirX: hit.dirX, dirY: hit.dirY, x: h.x, y: h.centerY, killed: h.dead });
        this.removed = true;
      }
    }
  }
  deflect(world) {
    this.removed = true;
    world.bus.emit('deflect', { x: this.x, y: this.y - this.z });
  }
  render(ctx, cx, cy) {
    ctx.fillStyle = 'rgba(4,2,8,0.4)';
    ctx.fillRect(Math.round(this.x - cx) - 2, Math.round(this.y - cy), 4, 1);
    ctx.save();
    ctx.translate(Math.round(this.x - cx), Math.round(this.y - this.z - cy));
    ctx.rotate(Math.round(this.angle / (Math.PI / 8)) * (Math.PI / 8));
    ctx.drawImage(this.sprite, -7, -1);
    ctx.restore();
  }
}

// Knochenspeer des Knochenfürsten: schneller, nicht abwehrbar (ausweichen!),
// zersplittert an Wänden. Leuchtet violett.
export class BoneSpear extends Entity {
  constructor(x, y, angle, speed, damage, owner) {
    super(x, y);
    this.angle = angle;
    this.vx = Math.cos(angle) * speed; this.vy = Math.sin(angle) * speed;
    this.z = 14; this.damage = damage; this.owner = owner;
    this.team = owner.team; this.life = 2.2; this.deflectable = false; this.stuck = false;
  }
  update(dt, world) {
    this.life -= dt;
    if (this.life <= 0) { this.removed = true; return; }
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    if (world.dungeon.isWall(Math.floor(nx / 16), Math.floor((ny - this.z * 0.5) / 16))) {
      this.removed = true;
      world.particles.bones(this.x, this.y, this.z, this.angle + Math.PI, 4, ['#80755c', '#bcae8e', '#e6dcc0']);
      world.bus.emit('arrowStuck', { x: this.x, y: this.y });
      return;
    }
    this.x = nx; this.y = ny;
    if (Math.random() < dt * 30) world.particles.spawn({ x: this.x, y: this.y - this.z, vx: 0, vy: 0, rise: 4, life: 0.3, colors: ['#e0b8ff', '#a060f0'], emissive: true });
    const h = world.hero;
    if (!h.dead && Math.hypot(h.x - this.x, h.centerY - (this.y - this.z * 0.3)) < h.hurtRadius + 3) {
      const hit = { damage: this.damage, dirX: Math.cos(this.angle), dirY: Math.sin(this.angle), knockback: 120, source: this.owner };
      if (h.takeHit(hit)) {
        world.bus.emit('hit', { attacker: this.owner, target: h, damage: hit.damage, crit: false, heavy: false, dirX: hit.dirX, dirY: hit.dirY, x: h.x, y: h.centerY, killed: h.dead });
        this.removed = true;
      }
    }
  }
  render(ctx, cx, cy) {
    ctx.fillStyle = 'rgba(4,2,8,0.4)';
    ctx.fillRect(Math.round(this.x - cx) - 3, Math.round(this.y - cy), 6, 1);
    const x = this.x - cx, y = this.y - this.z - cy;
    const dx = Math.cos(this.angle), dy = Math.sin(this.angle);
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = i > 9 ? '#fffbef' : i > 5 ? '#e6dcc0' : '#bcae8e';
      ctx.fillRect(Math.round(x - dx * (11 - i)), Math.round(y - dy * (11 - i)), 1, 1);
    }
  }
  renderEmissive(ctx, cx, cy) {
    const x = this.x - cx, y = this.y - this.z - cy;
    ctx.fillStyle = 'rgba(200,140,255,0.8)';
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
  }
}

// Magisches Geschoss der Zauberer (Wasser, Feuer, Gift): leuchtende Kugel mit
// Schweif. Nicht abwehrbar – ausweichen. Zerplatzt an Wänden.
const BOLT_COLORS = {
  water: ['#ffffff', '#b8f0ff', '#50c8e0', '#1a6a8a'],
  fire: ['#fff4d8', '#ffb070', '#f0602a', '#8a1a08'],
  poison: ['#f8ffc0', '#c8f060', '#70b030', '#2a5010'],
  shadow: ['#ffffff', '#e0b8ff', '#a060f0', '#3a1466'],
  frost: ['#ffffff', '#d8f4ff', '#78c0f0', '#1e4a8a'],
  spore: ['#f8e8ff', '#d0a0ff', '#9a58d8', '#3a1a5a'],
  dust: ['#fff8e0', '#f0d8a0', '#c8a060', '#5a4228'],
  curse: ['#ffffff', '#e8b8ff', '#a050c8', '#3a1450'],
};
export class MagicBolt extends Entity {
  constructor(x, y, angle, speed, damage, owner, element = 'fire', { radius = 3, homing = 0, life = 2.4 } = {}) {
    super(x, y);
    this.angle = angle; this.speed = speed;
    this.vx = Math.cos(angle) * speed; this.vy = Math.sin(angle) * speed;
    this.z = 12; this.damage = damage; this.owner = owner; this.team = owner.team;
    this.element = element; this.colors = BOLT_COLORS[element] ?? BOLT_COLORS.fire;
    this.radius = radius; this.homing = homing; this.life = life; this.t = 0;
    this.deflectable = false;
  }
  update(dt, world) {
    this.life -= dt; this.t += dt;
    if (this.life <= 0) { this.#burst(world); return; }
    const h = world.hero;
    if (this.homing && !h.dead) {
      const want = Math.atan2(h.centerY - (this.y - this.z * 0.3), h.x - this.x);
      let d = want - this.angle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.angle += Math.max(-this.homing * dt, Math.min(this.homing * dt, d));
      this.vx = Math.cos(this.angle) * this.speed; this.vy = Math.sin(this.angle) * this.speed;
    }
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    if (world.dungeon.isWall(Math.floor(nx / 16), Math.floor((ny - this.z * 0.5) / 16)) && !world.dungeon.isLiquid?.(Math.floor(nx / 16), Math.floor((ny - this.z * 0.5) / 16))) { this.#burst(world); return; }
    this.x = nx; this.y = ny;
    if (Math.random() < dt * 40) world.particles.spawn({ x: this.x + (Math.random() - 0.5) * 3, y: this.y - this.z, vx: -this.vx * 0.1, vy: -this.vy * 0.1, rise: 3, life: 0.35, colors: this.colors.slice(1), emissive: true });
    if (!h.dead && Math.hypot(h.x - this.x, h.centerY - (this.y - this.z * 0.3)) < h.hurtRadius + this.radius) {
      const hit = { damage: this.damage, dirX: Math.cos(this.angle), dirY: Math.sin(this.angle), knockback: 110, source: this.owner };
      if (h.takeHit(hit)) {
        world.bus.emit('hit', { attacker: this.owner, target: h, damage: hit.damage, crit: false, heavy: false, dirX: hit.dirX, dirY: hit.dirY, x: h.x, y: h.centerY, killed: h.dead });
        this.#burst(world);
      }
    }
  }
  #burst(world) {
    this.removed = true;
    world.particles.ring(this.x, this.y - this.z, 6, 10, this.colors, 60);
    world.bus.emit('spellImpact', { x: this.x, y: this.y, element: this.element, radius: 8, big: false });
  }
  render(ctx, cx, cy) {
    ctx.fillStyle = 'rgba(4,2,8,0.4)';
    ctx.fillRect(Math.round(this.x - cx) - 2, Math.round(this.y - cy), 5, 1);
  }
  renderEmissive(ctx, cx, cy) {
    const x = Math.round(this.x - cx), y = Math.round(this.y - this.z - cy);
    const r = this.radius + (Math.sin(this.t * 20) > 0 ? 1 : 0);
    const dx = Math.cos(this.angle), dy = Math.sin(this.angle);
    ctx.fillStyle = this.colors[3];
    for (let i = 1; i < 6; i++) ctx.fillRect(Math.round(x - dx * i * 2) - 1, Math.round(y - dy * i * 2) - 1, 2, 2);
    ctx.fillStyle = this.colors[2]; ctx.fillRect(x - r, y - r + 1, r * 2, r * 2 - 2); ctx.fillRect(x - r + 1, y - r, r * 2 - 2, r * 2);
    ctx.fillStyle = this.colors[1]; ctx.fillRect(x - r + 1, y - r + 1, r * 2 - 2, r * 2 - 2);
    ctx.fillStyle = this.colors[0]; ctx.fillRect(x - 1, y - 1, 2, 2);
  }
}

// Netzwurf (Fallensteller): fliegt geradlinig im Bildraum (wie die Linienwarnung mit screen: true),
// trifft nur, wer mit den Füßen auf der Bahn steht, und hält das Ziel fest (hero.buff 'rooted').
export class NetShot extends Entity {
  constructor(x, y, angle, speed, len, owner, { damage = 1, root = 1.2, radius = 6, onRoot = null } = {}) {
    super(x, y);
    this.angle = angle; this.speed = speed; this.owner = owner; this.team = owner.team;
    this.dirX = Math.cos(angle); this.dirY = Math.sin(angle);
    this.life = len / speed; this.t = 0;
    Object.assign(this, { damage, root, hitR: radius, onRoot });
    this.z = 8; this.deflectable = false;
  }
  update(dt, world) {
    this.t += dt;
    if (this.t >= this.life) { this.#drop(world); return; }
    this.x += this.dirX * this.speed * dt; this.y += this.dirY * this.speed * dt;
    const h = world.hero;
    if (h.dead) return;
    if (Math.hypot(h.x - this.x, (h.y - this.y) / 0.75) > this.hitR) return;
    const hit = { damage: this.damage, dirX: this.dirX, dirY: this.dirY, knockback: 0, source: this.owner };
    if (h.takeHit(hit)) {
      world.bus.emit('hit', { attacker: this.owner, target: h, damage: hit.damage, crit: false, heavy: false, dirX: hit.dirX, dirY: hit.dirY, x: h.x, y: h.centerY, killed: h.dead });
      h.buff?.('rooted', this.root, { moveSpeed: 0 });
      h.vx = 0; h.vy = 0;
      this.onRoot?.(h, world);
      this.removed = true;
    } else if (h.dodgedTimer > 0) this.removed = true;
  }
  #drop(world) {
    this.removed = true;
    world.particles.dust(this.x, this.y, 3, '#8a6e40');
  }
  render(ctx, cx, cy) {
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    ctx.fillStyle = 'rgba(4,2,8,0.4)'; ctx.fillRect(x - 3, y, 7, 1);
    // aufgespanntes Netz: Raute mit Maschen, dreht sich im Flug
    const yy = y - this.z, s = Math.sin(this.t * 14) > 0 ? 1 : 0;
    ctx.fillStyle = '#2a1c10';
    for (let i = -4; i <= 4; i++) { ctx.fillRect(x + i, yy - (4 - Math.abs(i)) + 1, 1, 1); ctx.fillRect(x + i, yy + (4 - Math.abs(i)) + 1, 1, 1); }
    ctx.fillStyle = '#c8aa70';
    for (let i = -4; i <= 4; i++) { ctx.fillRect(x + i, yy - (4 - Math.abs(i)), 1, 1); ctx.fillRect(x + i, yy + (4 - Math.abs(i)), 1, 1); }
    ctx.fillStyle = '#8a6e40';
    for (let i = -2; i <= 2; i += 2) { ctx.fillRect(x + i + s, yy - 2, 1, 5); ctx.fillRect(x - 2, yy + i, 5, 1); }
  }
}

// Bogenwurf (Aschebombardier): fliegt in fester Zeit zu einem festen Zielpunkt (dort liegt die
// Kreiswarnung), schlägt genau in diesem Kreis ein und hinterlässt kurz brennenden Boden.
export class LobBomb extends Entity {
  constructor(x, y, tx, ty, flight, owner, { damage = 20, radius = 22, element = 'fire', burn = null, height = 46 } = {}) {
    super(x, y);
    Object.assign(this, { x0: x, y0: y, tx, ty, flight, owner, damage, radius, element, burn, height });
    this.team = owner.team; this.t = 0; this.z = 12; this.deflectable = false;
  }
  update(dt, world) {
    this.t += dt;
    const k = Math.min(1, this.t / this.flight);
    this.x = this.x0 + (this.tx - this.x0) * k; this.y = this.y0 + (this.ty - this.y0) * k;
    this.z = 12 * (1 - k) + this.height * 4 * k * (1 - k);
    if (Math.random() < dt * 30) world.particles.spawn({ x: this.x, y: this.y - this.z, vx: 0, vy: 0, rise: 6, life: 0.4, colors: ['#fff0b0', '#ffb640', '#5a4a50'], emissive: true });
    if (k < 1) return;
    this.removed = true;
    const o = this.owner;
    // Trefferkreis = Warnkreis (Fußpunkt in der Ellipse, lift 0)
    if (o && !o.dead) world.combat.add({ owner: o, team: 'enemy', shape: 'circle', follow: false, x: this.tx, y: this.ty, lift: 0, r: this.radius, damage: this.damage, knockback: 150, heavy: true, ttl: 0.1 });
    world.particles.ring(this.tx, this.ty, 8, 18, ['#fff0b0', '#ffb640', '#f07a1c', '#5a2a10'], 110);
    world.particles.dust(this.tx, this.ty, 10, '#3a3036');
    world.decals.scorch?.(this.tx, this.ty, this.radius * 0.4);
    world.session?.camera?.shake(2.5);
    world.bus.emit('spellImpact', { x: this.tx, y: this.ty, element: this.element, radius: this.radius, big: false });
    if (this.burn) world.spawn(new HazardCloud(this.tx, this.ty, o, { radius: this.burn.radius, duration: this.burn.duration, damage: this.burn.damage, tick: 0.5, element: 'fire' }));
  }
  render(ctx, cx, cy) {
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    ctx.fillStyle = 'rgba(4,2,8,0.45)'; ctx.fillRect(x - 2, y, 5, 2);
    const yy = Math.round(y - this.z);
    ctx.fillStyle = '#140a0c'; ctx.fillRect(x - 3, yy - 2, 6, 5); ctx.fillRect(x - 2, yy - 3, 4, 7);
    ctx.fillStyle = '#4a3a40'; ctx.fillRect(x - 2, yy - 2, 4, 4);
    ctx.fillStyle = '#6a5a60'; ctx.fillRect(x - 2, yy - 2, 2, 1);
  }
  renderEmissive(ctx, cx, cy) {
    const x = Math.round(this.x - cx), yy = Math.round(this.y - cy - this.z);
    ctx.fillStyle = Math.sin(this.t * 30) > 0 ? '#fff0b0' : '#ffb640';
    ctx.fillRect(x + 1, yy - 4, 1, 2);
  }
}
