import { Entity } from './Entity.js';

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
