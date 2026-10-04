import { Actor } from './Actor.js';
import { Entity } from './Entity.js';
import { ENEMY_TYPES } from './enemyTypes.js';
import { Telegraph, DamageWave, bossBanner } from './Telegraph.js';
import { Shockwave, SpawnMarker } from './Effects.js';
import { Light } from '../gfx/Lighting.js';
import { EV } from '../core/events.js';
import { rand, pick, angleDiff } from '../core/math.js';

// Nerith, die Ertrunkene Priesterin – Boss des Versunkenen Tempels (Stufe 12).
// Angriffsmuster (jedes mit Bodenwarnung):
//   Dreizack-Schwung  weiter Bogen vor ihr (nah)
//   Flutwelle         markierte Bahn zum Helden, danach rollt eine Welle entlang (Ausweichrolle!)
//   Strudel           3–5 verzögerte Kreise an/um die Position des Helden, brechen als Fontäne aus
//   Perlen-Salve      Fächer (oder in Phase 2 auch Spirale) aus leuchtenden Wasserkugeln
//   Abtauchen         versinkt (unverwundbar), Ring an der Heldenposition, taucht dort mit Wucht auf
// Phase 2 (≤ 50 % LP, „Die Flut steigt“): Brüllen mit Druckwelle, beschwört Ertrunkene,
// schnellere Muster, zusätzliche Strudel während anderer Angriffe, Auftauchen mit Druckwelle.
// Für Anzeige und Tests: hp, maxHp, phase, def.name, bossId, world.boss.

const WATER_FX = ['#ffffff', '#c6eaf6', '#76bcdc', '#3886b2'];
const FOAM = ['#ffffff', '#c6eaf6', '#a0fff0'];
const WET = ['#0a192a', '#113352', '#16304a'];
const TEAL_LIGHT = [60, 200, 220], FLOOD_LIGHT = [90, 150, 255];
const WARN_WATER = [70, 180, 255];

// Tropfen und Gischt (steigen hoch, fallen zurück)
function spray(world, x, y, count, power = 1, colors = WATER_FX) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2), s = rand(10, 60) * power;
    world.particles.spawn({
      x: x + rand(-3, 3), y: y + rand(-2, 2), z: rand(0, 4), vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6,
      vz: rand(60, 170) * power, gravity: 380, drag: 1, life: rand(0.5, 1.0), colors: [pick(colors)],
      size: Math.random() < 0.3 ? 2 : 1, emissive: true, decal: Math.random() < 0.3 ? pick(WET) : null,
    });
  }
}
function ripple(world, x, y, r, colors = ['#c6eaf6', '#76bcdc', '#3886b2']) {
  world.particles.ring(x, y, r, Math.round(10 + r * 0.6), colors, 40 + r * 2);
}

// ------------------------------------------------------------------ Projektile / Effekte

// Leuchtende Wasserkugel. Nicht abwehrbar – ausweichen. Zerplatzt an Wänden.
export class PearlOrb extends Entity {
  constructor(x, y, angle, speed, damage, owner, { curve = 0, delay = 0 } = {}) {
    super(x, y);
    this.angle = angle; this.speed = speed; this.curve = curve; this.delay = delay;
    this.z = 14; this.damage = damage; this.owner = owner; this.team = owner.team;
    this.life = 3; this.deflectable = false; this.stuck = false; this.t = 0;
  }
  update(dt, world) {
    this.t += dt;
    if (this.t < this.delay) return;
    this.life -= dt;
    if (this.life <= 0 || this.owner.dead) { this.#pop(world); return; }
    this.angle += this.curve * dt;
    const sp = this.speed * Math.min(1, 0.4 + (this.t - this.delay) * 3);
    const nx = this.x + Math.cos(this.angle) * sp * dt, ny = this.y + Math.sin(this.angle) * sp * dt;
    if (world.dungeon.isWall(Math.floor(nx / 16), Math.floor((ny - this.z * 0.5) / 16))) { this.#pop(world); return; }
    this.x = nx; this.y = ny;
    if (Math.random() < dt * 25) world.particles.spawn({ x: this.x + rand(-1, 1), y: this.y, z: this.z, vx: 0, vy: 0, vz: 0, gravity: 120, life: 0.35, colors: ['#a0fff0', '#76bcdc', '#3886b2'], emissive: true });
    const h = world.hero;
    if (!h.dead && Math.hypot(h.x - this.x, h.centerY - (this.y - this.z * 0.3)) < h.hurtRadius + 3) {
      const hit = { damage: this.damage, dirX: Math.cos(this.angle), dirY: Math.sin(this.angle), knockback: 110, source: this.owner };
      if (h.takeHit(hit)) {
        world.bus.emit('hit', { attacker: this.owner, target: h, damage: hit.damage, crit: false, heavy: false, dirX: hit.dirX, dirY: hit.dirY, x: h.x, y: h.centerY, killed: h.dead });
        this.#pop(world);
      }
    }
  }
  #pop(world) {
    this.removed = true;
    spray(world, this.x, this.y, 6, 0.6, ['#ffffff', '#a0fff0', '#76bcdc']);
    world.bus.emit('arrowStuck', { x: this.x, y: this.y });
  }
  render(ctx, cx, cy) {
    if (this.t < this.delay) return;
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    ctx.fillStyle = 'rgba(4,2,8,0.4)';
    ctx.fillRect(x - 2, y, 5, 1);
  }
  renderEmissive(ctx, cx, cy) {
    if (this.t < this.delay) return;
    const x = Math.round(this.x - cx), y = Math.round(this.y - this.z - cy);
    const flood = this.owner.phase >= 2;
    const pulse = Math.sin(this.t * 18) > 0;
    // Schweif
    for (let i = 1; i <= 4; i++) {
      ctx.fillStyle = i < 3 ? (flood ? 'rgba(96,168,255,0.6)' : 'rgba(46,200,204,0.6)') : 'rgba(30,90,140,0.4)';
      ctx.fillRect(Math.round(x - Math.cos(this.angle) * i * 2), Math.round(y - Math.sin(this.angle) * i * 2), 1, 1);
    }
    ctx.fillStyle = flood ? '#2050d0' : '#0e7888';
    ctx.fillRect(x - 2, y - 1, 5, 3); ctx.fillRect(x - 1, y - 2, 3, 5);
    ctx.fillStyle = flood ? '#c8e6ff' : '#a0fff0';
    ctx.fillRect(x - 1, y - 1, 3, 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - (pulse ? 1 : 0), y - 1, 1, 1);
  }
}

// Flutwelle: rollt eine markierte Bahn entlang, trifft den Helden höchstens einmal.
export class TideWave extends Entity {
  constructor(x, y, angle, len, owner, { width = 26, speed = 210, damage = 30 } = {}) {
    super(x, y);
    Object.assign(this, { angle, len, owner, width, speed, damage });
    this.t = 0; this.s = 0; this.hitDone = false; this.lastSplat = 0; this.sortOffset = 2;
    this.cos = Math.cos(angle); this.sin = Math.sin(angle);
  }
  // Boden-Koordinaten (wie Telegraph 'line': y gestaucht mit 0,75)
  #pt(s, k) {
    const gx = this.cos * s - this.sin * k, gy = this.sin * s + this.cos * k;
    return { x: this.x + gx, y: this.y + gy * 0.75 };
  }
  update(dt, world) {
    this.t += dt;
    this.s = Math.min(this.len, this.t * this.speed);
    if (this.owner.dead) { this.removed = true; return; }
    const hw = this.width / 2;
    // Schaum an der Front, nasse Spur
    for (let i = 0; i < 3; i++) {
      const p = this.#pt(this.s, rand(-hw, hw));
      world.particles.spawn({ x: p.x, y: p.y, z: rand(2, 9), vx: this.cos * rand(20, 60), vy: this.sin * rand(10, 40), vz: rand(20, 80), gravity: 300, life: rand(0.3, 0.6), colors: [pick(FOAM)], emissive: true });
    }
    if (this.s - this.lastSplat > 9) {
      this.lastSplat = this.s;
      const p = this.#pt(this.s - 6, rand(-hw * 0.6, hw * 0.6));
      world.decals.splat(p.x, p.y, WET, 4);
    }
    if (this.s >= this.len) {
      this.removed = true;
      const p = this.#pt(this.len, 0);
      spray(world, p.x, p.y, 18, 1.1);
      ripple(world, p.x, p.y, 10);
      return;
    }
    const h = world.hero;
    if (this.hitDone || h.dead) return;
    const rx = h.x - this.x, ry = (h.y - this.y) / 0.75;
    const along = rx * this.cos + ry * this.sin, perp = -rx * this.sin + ry * this.cos;
    if (Math.abs(along - this.s) < 9 && Math.abs(perp) < hw + 4) {
      const hit = { damage: this.damage, dirX: this.cos, dirY: this.sin, knockback: 280, source: this.owner };
      if (h.takeHit(hit)) {
        this.hitDone = true;
        world.bus.emit('hit', { attacker: this.owner, target: h, damage: hit.damage, crit: false, heavy: true, dirX: hit.dirX, dirY: hit.dirY, x: h.x, y: h.centerY, killed: h.dead });
        spray(world, h.x, h.y, 12, 1);
      } else if (h.dodgedTimer > 0) this.hitDone = true;
    }
  }
  renderEmissive(ctx, cx, cy) {
    const hw = this.width / 2;
    const flood = this.owner.phase >= 2;
    // Wasserkörper hinter der Front
    for (let b = 1; b <= 16; b += 1) {
      const s = this.s - b;
      if (s < 0) break;
      ctx.globalAlpha = 0.45 * (1 - b / 17);
      ctx.fillStyle = b < 4 ? '#3886b2' : '#1c5882';
      for (let k = -hw; k <= hw; k += 1) {
        const p = this.#pt(s, k);
        ctx.fillRect(Math.round(p.x - cx), Math.round(p.y - cy - 1), 1, 1);
      }
    }
    // Kamm: mehrere Säulenreihen (dick), vorn überschlagende Schaumkrone
    for (let d = 5; d >= 0; d--) {
      ctx.globalAlpha = 0.95 - d * 0.08;
      for (let k = -hw; k <= hw; k += 1) {
        const p = this.#pt(this.s - d * 1.5, k);
        const edge = 1 - Math.abs(k) / (hw + 1);
        const h = Math.round((8 + 7 * Math.sqrt(edge)) * (0.85 + 0.15 * Math.sin(k * 0.9 + this.t * 24)) * Math.min(1, this.t * 6) * (1 - d * 0.12));
        const x = Math.round(p.x - cx), y = Math.round(p.y - cy);
        ctx.fillStyle = flood ? '#2050d0' : '#1c5882'; ctx.fillRect(x, y - Math.round(h * 0.5), 1, Math.round(h * 0.5));
        ctx.fillStyle = flood ? '#60a8ff' : '#3886b2'; ctx.fillRect(x, y - Math.round(h * 0.85), 1, Math.round(h * 0.35));
        ctx.fillStyle = d === 0 ? '#ffffff' : '#c6eaf6'; ctx.fillRect(x, y - h, 1, d < 2 ? 2 : 1);
      }
    }
    // Überschlag: Schaumkante vor der Front
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#ffffff';
    for (let k = -hw + 1; k < hw; k += 1) {
      if ((k + Math.floor(this.t * 20)) % 3 === 0) continue;
      const p = this.#pt(this.s + 1.5, k);
      const edge = 1 - Math.abs(k) / (hw + 1);
      const h = Math.round((8 + 7 * Math.sqrt(edge)) * Math.min(1, this.t * 6));
      ctx.fillRect(Math.round(p.x - cx), Math.round(p.y - cy) - h + 1, 1, 1);
    }
    ctx.globalAlpha = 1;
  }
}

// Strudel: dreht sich während der Warnzeit, bricht dann als Fontäne aus.
export class Whirlpool extends Entity {
  constructor(x, y, owner, { r = 24, delay = 1.1, damage = 24 } = {}) {
    super(x, y);
    Object.assign(this, { owner, r, delay, damage });
    this.t = 0; this.sortOffset = -19500; this.burst = false;
  }
  update(dt, world) {
    this.t += dt;
    if (this.owner.dead) { this.removed = true; return; }
    if (!this.burst && Math.random() < dt * 20) {
      const a = rand(0, Math.PI * 2), rr = rand(0.3, 1) * this.r;
      world.particles.spawn({ x: this.x + Math.cos(a) * rr, y: this.y + Math.sin(a) * rr * 0.6, vx: -Math.sin(a) * 30, vy: Math.cos(a) * 18, drag: 3, life: 0.4, colors: ['#a0fff0', '#76bcdc'], emissive: true });
    }
    if (!this.burst && this.t >= this.delay) {
      this.burst = true;
      const o = this.owner;
      world.combat.add({ owner: o, team: 'enemy', shape: 'circle', follow: false, x: this.x, y: this.y - 6, lift: 6, r: this.r * 0.9, damage: this.damage, knockback: 170, heavy: false, ttl: 0.12 });
      spray(world, this.x, this.y, 26, 1.3);
      for (let i = 0; i < 10; i++) world.particles.spawn({ x: this.x + rand(-4, 4), y: this.y, z: rand(0, 6), vx: rand(-8, 8), vy: rand(-4, 4), vz: rand(160, 240), gravity: 420, life: rand(0.6, 0.9), colors: ['#ffffff', '#c6eaf6'], size: 2, emissive: true });
      ripple(world, this.x, this.y, this.r * 0.6);
      world.decals.splat(this.x, this.y, WET, 8);
      world.addLight(new Light({ x: this.x, y: this.y - 10, radius: 60, color: o.phase >= 2 ? FLOOD_LIGHT : TEAL_LIGHT, intensity: 0.9, ttl: 0.3, bloom: 0.5 }));
      world.session.camera?.shake(3);
      world.bus.emit('spellImpact', { x: this.x, y: this.y, element: 'water', radius: this.r });
    }
    if (this.t >= this.delay + 0.5) this.removed = true;
  }
  renderEmissive(ctx, cx, cy) {
    const x = this.x - cx, y = this.y - cy;
    if (this.burst) {
      // Fontäne
      const k = (this.t - this.delay) / 0.5;
      const h = Math.round(34 * Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5) * (1 - k * 0.6));
      ctx.globalAlpha = 1 - k;
      for (let i = -4; i <= 4; i++) {
        const hh = h - Math.abs(i) * 3;
        if (hh <= 0) continue;
        ctx.fillStyle = Math.abs(i) > 2 ? '#3886b2' : '#76bcdc';
        ctx.fillRect(Math.round(x + i), Math.round(y - hh), 1, hh);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(x + i), Math.round(y - hh), 1, 1);
      }
      ctx.globalAlpha = 1;
      return;
    }
    // Spiralarme
    const k = Math.min(1, this.t / this.delay);
    const flood = this.owner.phase >= 2;
    ctx.fillStyle = flood ? '#60a8ff' : '#2ec8cc';
    for (let arm = 0; arm < 3; arm++) {
      for (let s = 0; s < 1; s += 0.04) {
        const a = arm * 2.094 + s * 4.2 - this.t * (4 + k * 8);
        const rr = (1 - s) * this.r * (0.95 - 0.2 * (1 - k));
        ctx.globalAlpha = (0.25 + 0.6 * k) * (1 - s * 0.6);
        ctx.fillRect(Math.round(x + Math.cos(a) * rr), Math.round(y + Math.sin(a) * rr * 0.6), 1, 1);
      }
    }
    ctx.globalAlpha = 0.5 + 0.5 * k;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(x) - 1, Math.round(y), 3, 1);
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------ Boss

export class Nerith extends Actor {
  constructor(x, y, assets) {
    const def = ENEMY_TYPES.drowned_priestess;
    super(x, y, assets.sprites[def.sprites]);
    this.type = 'drowned_priestess';
    this.def = def;
    this.bossId = def.bossId;
    this.team = 'enemy';
    this.level = def.level;
    this.maxHp = this.hp = def.hp;
    this.radius = def.radius; this.mass = def.mass;
    this.hurtRadius = def.hurtRadius; this.bodyHeight = def.bodyHeight;
    this.shadowW = def.shadowW; this.material = def.material;
    this.assets = assets;
    this.home = { x, y };
    this.facing = 1;
    this.phase = 1;
    this.engaged = false;
    this.hurtable = false;
    this.cooldown = 1.4;
    this.summonTimer = 0;
    this.diveTimer = 7;
    this.adds = [];
    this.timers = [];
    this.last = null;
    this.hidden = false;
    this.hurtAnim = 0;
    this.aim = 0;
    this.setState('sleep');
    this.animator.play('dormant');
    this.lastFrame = null;
  }

  get enraged() { return this.phase >= 2; }
  get #tempo() { return this.phase >= 2 ? 0.75 : 1; }

  engage(world) {
    if (this.engaged || this.dead) return;
    this.engaged = true;
    this.world = world;
    this.setState('intro');
    this.animator.play('awaken', true);
    world.bus.emit(EV.BOSS_ENGAGED, { bossId: this.bossId, name: this.def.name });
    world.session.camera?.shake(4);
    spray(world, this.x, this.y, 24, 1);
    ripple(world, this.x, this.y, 14);
    this.coreLight = world.addLight(new Light({ follow: this, offsetY: -40, radius: 95, color: TEAL_LIGHT, intensity: 0.6, flicker: 0.15, bloom: 0.3 }));
  }

  // Verzögerte Aktion (läuft unabhängig vom Zustand weiter)
  #after(t, fn) { this.timers.push({ t, fn }); }

  update(dt, world) {
    this.tickTimers(dt);
    this.world = world;
    const hero = world.hero;
    const dx = hero.x - this.x, dy = hero.y - this.y;
    const dist = Math.hypot(dx, dy);
    this.adds = this.adds.filter((a) => !a.removed && !a.dead);
    this.hurtAnim = Math.max(0, this.hurtAnim - dt);
    if (!this.dead && this.timers.length) {
      for (const tm of this.timers) tm.t -= dt;
      const due = this.timers.filter((tm) => tm.t <= 0);
      this.timers = this.timers.filter((tm) => tm.t > 0);
      for (const tm of due) tm.fn(world);
    }
    this.#frameEvents(world);
    this.#checkPhase(world);
    this.#ambient(dt, world);
    const spd = this.def.speed * (this.enraged ? 1.25 : 1);

    switch (this.state) {
      case 'sleep':
        this.vx = this.vy = 0;
        if (Math.random() < dt * 2) ripple(world, this.x + rand(-6, 6), this.y, 6, ['#3886b2', '#1c5882']);
        break;

      case 'intro':
        this.vx = this.vy = 0;
        if (this.stateTime < 1.1 && Math.random() < dt * 30) spray(world, this.x + rand(-10, 10), this.y, 1, 0.8);
        if (this.stateTime > 1.7) { this.hurtable = true; this.setState('chase'); }
        break;

      case 'roar':
        this.vx *= 0.7; this.vy *= 0.7;
        if (Math.random() < dt * 40) world.particles.element(this.x + rand(-18, 18), this.y - rand(10, 60), 'frost', 1, 2);
        if (this.stateTime > 1.3) { this.hurtable = true; this.cooldown = 0.2; this.setState('chase'); }
        break;

      case 'chase': {
        if (hero.dead) { this.vx *= 0.8; this.vy *= 0.8; this.animator.play('idle'); break; }
        this.cooldown -= dt;
        this.summonTimer -= dt;
        this.diveTimer -= dt;
        let mx = dx / (dist || 1), my = dy / (dist || 1);
        if (!world.dungeon.lineOfSight(this.x, this.y - 2, hero.x, hero.y - 2)) {
          const f = world.flow.direction(this.x, this.y - 2);
          if (f) { mx = f.x; my = f.y; }
        }
        const want = dist > 58 ? spd : 0;
        const k = 1 - Math.exp(-dt * 5);
        this.vx += (mx * want - this.vx) * k;
        this.vy += (my * want - this.vy) * k;
        if (Math.abs(dx) > 3) this.facing = Math.sign(dx);
        if (this.hurtAnim <= 0) this.animator.play(want > 1 ? 'walk' : 'idle');
        if (this.cooldown <= 0) this.#chooseAttack(world, dist);
        break;
      }

      case 'sweepWindup':
        this.vx *= 0.8; this.vy *= 0.8;
        if (this.stateTime < this.windup * 0.55) {
          this.aim += angleDiff(this.aim, Math.atan2(dy, dx)) * Math.min(1, dt * 6);
          this.facing = Math.cos(this.aim) >= 0 ? 1 : -1;
          if (this.sweepTele && !this.sweepTele.removed) this.sweepTele.angle = this.aim; // Warnbogen folgt
        }
        if (this.stateTime >= this.windup) this.#sweep(world);
        break;

      case 'castWindup':
        this.vx *= 0.8; this.vy *= 0.8;
        if (Math.random() < dt * 40) {
          const m = this.#meta('pearl');
          world.particles.spawn({ x: m.x + rand(-6, 6), y: m.y + rand(-6, 6), vx: 0, vy: 0, rise: rand(-20, -8), wobble: 10, life: 0.4, colors: this.enraged ? ['#ffffff', '#c8e6ff', '#60a8ff'] : ['#ffffff', '#a0fff0', '#2ec8cc'], emissive: true });
        }
        if (this.stateTime >= this.windup) this.#release(world);
        break;

      case 'dive':
        this.vx *= 0.7; this.vy *= 0.7;
        if (this.stateTime > 0.35 && this.hurtable) {
          this.hurtable = false;
          spray(world, this.x, this.y, 20, 1.1);
          ripple(world, this.x, this.y, 12);
        }
        if (this.stateTime >= 0.8) this.#submerge(world);
        break;

      case 'submerged': {
        this.vx = this.vy = 0;
        const k = Math.min(1, this.stateTime / this.diveTime);
        const e = k * k * (3 - 2 * k);
        this.x = this.from.x + (this.target.x - this.from.x) * e;
        this.y = this.from.y + (this.target.y - this.from.y) * e;
        if (Math.random() < dt * 22) world.particles.spawn({ x: this.x + rand(-5, 5), y: this.y + rand(-3, 3), vx: 0, vy: 0, rise: rand(6, 16), wobble: 6, life: rand(0.3, 0.6), colors: ['#c6eaf6', '#76bcdc'], emissive: true });
        if (this.stateTime >= this.diveTime) this.#emerge(world);
        return; // unter Wasser: keine Kollision
      }

      case 'emerge':
        this.vx *= 0.8; this.vy *= 0.8;
        if (this.stateTime > 0.25 && !this.hurtable) this.hurtable = true;
        if (this.stateTime >= 0.66) { this.cooldown = (this.enraged ? 0.5 : 0.9); this.setState('chase'); }
        break;

      case 'strike':
        this.vx *= 0.8; this.vy *= 0.8;
        if (this.stateTime >= this.recover) this.setState('chase');
        break;

      case 'dead':
        this.vx *= 0.85; this.vy *= 0.85;
        if (this.stateTime < 1.3 && Math.random() < dt * 30) spray(world, this.x + rand(-10, 10), this.y - rand(0, 4), 1, 0.7);
        break;
    }
    this.integrate(dt, world);
  }

  // ---------------------------------------------------------------- Phasen

  #checkPhase(world) {
    if (this.dead || !this.engaged || this.phase >= 2) return;
    if (!['chase', 'strike', 'sweepWindup', 'castWindup'].includes(this.state)) return;
    if (this.hp / this.maxHp > 0.5) return;
    this.phase = 2;
    bossBanner(world, 'Die Flut steigt', 'Nerith ruft die Ertrunkenen aus der Tiefe');
    this.summonTimer = 0;
    this.diveTimer = Math.min(this.diveTimer, 5);
    world.combat.hitboxes = world.combat.hitboxes.filter((h) => h.owner !== this);
    this.hurtable = false;
    this.setState('roar');
    this.animator.play('roar', true);
    world.session.slowmo?.(0.5, 0.5);
    if (this.coreLight) { this.coreLight.color = FLOOD_LIGHT; this.coreLight.intensity = 0.6; this.coreLight.radius = 95; }
    world.bus.emit('bossPhase', { bossId: this.bossId, phase: 2 });
  }

  // ---------------------------------------------------------------- Angriffswahl

  #chooseAttack(world, dist) {
    const hero = world.hero;
    const ang = Math.atan2(hero.y - this.y, hero.x - this.x);
    this.aim = ang;
    this.facing = Math.cos(ang) >= 0 ? 1 : -1;
    const T = this.#tempo;
    if (this.phase >= 2 && this.summonTimer <= 0 && this.adds.length < 2) {
      return this.#beginCast(world, 'summon', 1.0);
    }
    if (this.diveTimer <= 0 && dist > 36) {
      this.diveTimer = rand(10, 13) * T;
      return this.#beginDive(world);
    }
    if (dist < 52 && Math.random() < 0.7) return this.#beginSweep(world);
    const options = [];
    if (dist < 240) options.push('wave', 'wave');
    options.push('pearls', 'pearls', 'whirl', 'whirl');
    if (this.phase >= 2) options.push('spiral', 'spiral');
    let kind = pick(options);
    if (kind === this.last) kind = pick(options);
    this.last = kind;
    if (kind === 'wave') return this.#beginWave(world, ang);
    if (kind === 'whirl') return this.#beginCast(world, 'whirl', 0.7 * T);
    if (kind === 'spiral') return this.#beginCast(world, 'spiral', 0.85);
    return this.#beginCast(world, 'pearls', 0.8 * T);
  }

  // Zusatz-Strudel in Phase 2 während anderer Angriffe
  #floodExtra(world, chance = 0.5) {
    if (this.phase < 2 || Math.random() > chance) return;
    const h = world.hero;
    const n = 2;
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), r = i === 0 ? 0 : rand(24, 40);
      this.#whirl(world, h.x + Math.cos(a) * r, h.y + Math.sin(a) * r * 0.6, 1.0 + i * 0.25);
    }
  }

  #whirl(world, x, y, delay) {
    const p = world.dungeon.nearestFree(x, y);
    const r = 24;
    world.spawn(new Telegraph(p.x, p.y, { shape: 'circle', r, duration: delay, color: WARN_WATER }));
    world.spawn(new Whirlpool(p.x, p.y, this, { r, delay, damage: 24 }));
  }

  #beginSweep(world) {
    const T = this.#tempo;
    const wind = 0.8 * T;
    this.sweepTele = world.spawn(new Telegraph(this.x, this.y - 4, { shape: 'arc', r: 54, angle: this.aim, arc: 2.5, duration: wind, follow: this }));
    this.#begin(world, 'sweepWindup', 'sweepWindup', wind);
    this.#floodExtra(world, 0.35);
  }

  #beginWave(world, ang) {
    const T = this.#tempo;
    const wind = 0.95 * T;
    const len = Math.min(260, this.#rayLength(world, ang));
    this.wave = { angle: ang, len };
    world.spawn(new Telegraph(this.x, this.y, { shape: 'line', angle: ang, len, width: 28, duration: wind, color: [90, 160, 255] }));
    this.#begin(world, 'castWindup', 'cast', wind, { wave: true });
    world.bus.emit('cast', { actor: this, element: 'water' });
    this.#floodExtra(world, 0.5);
  }

  #beginCast(world, kind, wind) {
    const o = { [kind]: true };
    if (kind === 'pearls') {
      const n = this.phase >= 2 ? 7 : 5, spread = 1.0;
      // Phase 2: zweite, versetzte Salve wird ebenfalls angezeigt
      const offs = this.phase >= 2 ? [0, spread / (n - 1) / 2] : [0];
      for (let j = 0; j < n * offs.length; j++) {
        const i = j % n, a = this.aim - spread / 2 + (spread * i) / (n - 1) + offs[(j / n) | 0];
        // genau auf der Perlenbahn (Start wie #release; Treffer ~5 px unter der Bodenspur)
        world.spawn(new Telegraph(this.x + Math.cos(a) * 10, this.y + Math.sin(a) * 6 + 5, { shape: 'line', screen: true, angle: a, len: 150, width: offs.length > 1 ? 4 : 7, duration: wind, color: WARN_WATER }));
      }
      this.#floodExtra(world, 0.4);
    } else if (kind === 'spiral') {
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; world.spawn(new Telegraph(this.x + Math.cos(a) * 8, this.y + Math.sin(a) * 5 + 5, { shape: 'line', screen: true, angle: a, len: 70, width: 4, duration: wind, color: WARN_WATER })); }
    } else if (kind === 'whirl') {
      // Strudel setzen sofort ein, Nerith lenkt sie mit erhobenem Stab
      const h = world.hero, n = this.phase >= 2 ? 5 : 3, T = this.#tempo;
      const lead = { x: h.x + (h.vx ?? 0) * 0.35, y: h.y + (h.vy ?? 0) * 0.35 };
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand(-0.4, 0.4), r = i === 0 ? 0 : rand(30, 46);
        const c = i === 0 ? lead : { x: h.x + Math.cos(a) * r, y: h.y + Math.sin(a) * r * 0.65 };
        this.#whirl(world, c.x, c.y, (1.1 + i * 0.22) * T);
      }
      world.bus.emit('bossWhirlpool', { bossId: this.bossId, count: n });
    }
    this.#begin(world, 'castWindup', 'cast', wind, o);
    world.bus.emit('cast', { actor: this, element: 'water' });
  }

  #beginDive(world) {
    this.cooldown = 0.6;
    this.setState('dive');
    this.animator.play('dive', true);
    world.combat.hitboxes = world.combat.hitboxes.filter((h) => h.owner !== this);
    world.bus.emit('bossDive', { bossId: this.bossId, x: this.x, y: this.y });
  }

  #submerge(world) {
    const h = world.hero;
    const p = world.dungeon.nearestFree(h.x, h.y);
    this.from = { x: this.x, y: this.y };
    this.target = { x: p.x, y: p.y };
    this.diveTime = (this.enraged ? 0.95 : 1.2);
    this.hidden = true; this.solid = false; this.hurtable = false;
    this.setState('submerged');
    world.spawn(new Telegraph(p.x, p.y, { shape: 'circle', r: 40, duration: this.diveTime }));
    world.bus.emit('telegraph', { actor: this, attack: 'emerge' });
  }

  #emerge(world) {
    const { x, y } = this.target;
    this.x = x; this.y = y;
    this.hidden = false; this.solid = true;
    this.setState('emerge');
    this.animator.play('emerge', true);
    const h = world.hero;
    if (Math.abs(h.x - x) > 3) this.facing = Math.sign(h.x - x);
    world.combat.add({ owner: this, team: 'enemy', shape: 'circle', follow: false, x, y: y - 6, lift: 6, r: 40, damage: 42, knockback: 300, heavy: true, ttl: 0.14 });
    spray(world, x, y, 50, 1.6);
    ripple(world, x, y, 18);
    world.addEffect(new Shockwave(x, y - 2, { radius: 46, color: '#c6eaf6', life: 0.5 }));
    world.decals.splat(x, y, WET, 12);
    world.session.hitstop?.(0.09);
    world.session.camera?.shake(8);
    world.addLight(new Light({ x, y: y - 20, radius: 110, color: this.enraged ? FLOOD_LIGHT : TEAL_LIGHT, intensity: 1.1, ttl: 0.4, bloom: 0.7 }));
    if (this.phase >= 2) world.addEffect(new DamageWave(x, y, this, { maxR: 110, duration: 0.85, damage: 16, color: [90, 170, 255] }));
    world.bus.emit('spellImpact', { x, y, element: 'water', radius: 40, big: true });
    world.bus.emit('bossEmerge', { bossId: this.bossId, x, y });
  }

  #begin(world, state, anim, windup, opts = {}) {
    this.setState(state);
    this.animator.play(anim, true);
    this.windup = windup;
    this.castOpts = opts;
    this.cooldown = (this.enraged ? 0.55 : 1.0) + rand(0, 0.5);
    world.bus.emit('telegraph', { actor: this, attack: state });
  }

  // ---------------------------------------------------------------- Ausführung

  #sweep(world) {
    this.setState('strike'); this.recover = this.enraged ? 0.45 : 0.7;
    this.animator.play('sweep', true);
    world.combat.add({ owner: this, team: 'enemy', shape: 'arc', follow: false, x: this.x, y: this.y - 12, r: 54, angle: this.aim, arc: 2.5, damage: 34, knockback: 240, heavy: true, ttl: 0.14 });
    this.kbx += Math.cos(this.aim) * 70; this.kby += Math.sin(this.aim) * 70;
    for (let i = 0; i < 9; i++) {
      const a = this.aim - 1.2 + i * 0.3;
      world.particles.sparks(this.x + Math.cos(a) * 42, this.y - 10 + Math.sin(a) * 26, a, 2, ['#ffffff', '#c6eaf6', '#76bcdc']);
    }
    spray(world, this.x + Math.cos(this.aim) * 30, this.y + Math.sin(this.aim) * 16, 14, 0.9);
    world.session.camera?.shake(4);
    world.bus.emit('enemySwing', { actor: this, heavy: true });
  }

  #release(world) {
    const o = this.castOpts;
    this.setState('strike'); this.recover = this.enraged ? 0.45 : 0.6;
    const m = this.#meta('pearl');
    world.addLight(new Light({ x: m.x, y: m.y, radius: 70, color: this.enraged ? FLOOD_LIGHT : TEAL_LIGHT, intensity: 1, ttl: 0.25, bloom: 0.6 }));
    if (o.summon) {
      this.summonTimer = rand(20, 24);
      this.recover = 0.8;
      const first = !this.summonedOnce; this.summonedOnce = true;
      const n = first ? 3 : 2;
      const type = this.#addType(world);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand(-0.4, 0.4);
        const p = world.dungeon.nearestFree(this.home.x + Math.cos(a) * 70, this.home.y + Math.sin(a) * 45);
        spray(world, p.x, p.y, 10, 0.8);
        world.spawn(new SpawnMarker(p.x, p.y, 0.7, () => {
          if (this.dead) return;
          const e = world.spawnEnemy(type, p.x, p.y, { respawned: true, home: { ...this.home } });
          e.aggroed = true; e.summoned = true; e.xpOverride = 12;
          this.adds.push(e);
          spray(world, p.x, p.y, 16, 1);
          ripple(world, p.x, p.y, 8);
        }));
      }
      world.bus.emit('bossSummon', { bossId: this.bossId, count: n });
      return;
    }
    if (o.wave) {
      const { angle, len } = this.wave;
      world.addEffect(new TideWave(this.x + Math.cos(angle) * 6, this.y + Math.sin(angle) * 4, angle, len - 6, this, { width: 28, speed: this.enraged ? 250 : 210, damage: 30 }));
      spray(world, this.x + Math.cos(angle) * 12, this.y + Math.sin(angle) * 8, 20, 1.2);
      world.session.camera?.shake(5);
      world.bus.emit('bossWave', { bossId: this.bossId, angle });
      return;
    }
    if (o.pearls) {
      const n = this.phase >= 2 ? 7 : 5, spread = 1.0;
      const fire = (off, delay) => {
        for (let i = 0; i < n; i++) {
          const a = this.aim - spread / 2 + (spread * i) / (n - 1) + off;
          world.addProjectile(new PearlOrb(this.x + Math.cos(a) * 10, this.y + Math.sin(a) * 6, a, 140, 15, this, { delay }));
        }
      };
      fire(0, 0);
      if (this.phase >= 2) fire(spread / (n - 1) / 2, 0.3);
      world.bus.emit('shoot', { actor: this });
      return;
    }
    if (o.spiral) {
      const n = 10;
      for (let ring = 0; ring < 3; ring++) {
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + ring * 0.2;
          world.addProjectile(new PearlOrb(this.x + Math.cos(a) * 8, this.y + Math.sin(a) * 5, a, 95, 12, this, { delay: ring * 0.35, curve: 0.5 }));
        }
      }
      world.bus.emit('shoot', { actor: this });
      this.recover = 0.9;
      return;
    }
    if (o.whirl) {
      spray(world, m.x, m.y + 10, 8, 0.6);
    }
  }

  #addType(world) {
    try {
      if (ENEMY_TYPES.drowned && world.assets.sprites.drowned?.idle) return 'drowned';
    } catch (e) { /* Grafik fehlt noch */ }
    return 'skeleton';
  }

  #rayLength(world, ang) {
    let len = 0;
    const T = 16;
    while (len < 320) {
      const x = this.x + Math.cos(ang) * (len + 12), y = this.y + Math.sin(ang) * 0.75 * (len + 12);
      if (world.dungeon.isWall(Math.floor(x / T), Math.floor((y - 4) / T))) break;
      len += 6;
    }
    return len + 8;
  }

  #meta(key) {
    const m = this.animator.frame.meta?.[key] ?? { dx: 0, dy: -40 };
    return { x: this.x + m.dx * this.facing, y: this.y + m.dy };
  }

  #frameEvents(world) {
    const f = this.animator.frame;
    if (f === this.lastFrame) return;
    this.lastFrame = f;
    if (f.fx === 'roar') {
      const h = this.#meta('head');
      if (this.dead) { spray(world, h.x, h.y + 10, 20, 1); return; }
      world.session.camera?.shake(8);
      const cols = this.enraged ? ['#ffffff', '#c8e6ff', '#60a8ff'] : ['#ffffff', '#a0fff0', '#2ec8cc'];
      world.particles.ring(h.x, h.y + 8, 12, 36, cols, 120);
      world.addEffect(new Shockwave(this.x, this.y - 4, { radius: 90, color: this.enraged ? '#c8e6ff' : '#a0fff0', life: 0.7 }));
      world.addLight(new Light({ x: h.x, y: h.y, radius: 150, color: this.enraged ? FLOOD_LIGHT : TEAL_LIGHT, intensity: 1, ttl: 0.5, bloom: 0.7 }));
      spray(world, this.x, this.y, 30, 1.4);
      world.bus.emit('bossRoar', { bossId: this.bossId, x: this.x, y: this.y });
      // Druckwelle stößt den Helden zurück (kein Schaden)
      const hero = world.hero, dx = hero.x - this.x, dy = hero.y - this.y, d = Math.hypot(dx, dy) || 1;
      if (!hero.dead && d < 110) { hero.kbx += (dx / d) * 260; hero.kby += (dy / d) * 260; }
    } else if (f.fx === 'cast') {
      const m = this.#meta('pearl');
      world.particles.ring(m.x, m.y, 4, 12, this.enraged ? ['#ffffff', '#c8e6ff', '#60a8ff'] : ['#ffffff', '#a0fff0', '#2ec8cc'], 70);
    } else if (f.fx === 'impact') {
      if (this.dead) { world.session.camera?.shake(5); spray(world, this.x, this.y, 30, 1.2); ripple(world, this.x, this.y, 16); }
      else if (this.state === 'emerge') ripple(world, this.x, this.y, 22);
    }
  }

  #ambient(dt, world) {
    if (this.hidden || this.state === 'sleep') return;
    // Tropfen fallen aus den Wasserschleiern
    if (Math.random() < dt * 8) {
      world.particles.spawn({ x: this.x + rand(-9, 9), y: this.y, z: rand(2, 12), vx: 0, vy: 0, vz: 0, gravity: 260, life: 0.6, colors: ['#76bcdc', '#3886b2'], decal: Math.random() < 0.2 ? '#113352' : null });
    }
    if (this.enraged && !this.dead && Math.random() < dt * 10) {
      world.particles.spawn({ x: this.x + rand(-22, 22), y: this.y - rand(0, 50), vx: rand(-6, 6), vy: 0, rise: rand(8, 20), wobble: 12, life: rand(0.6, 1.2), colors: ['#ffffff', '#c8e6ff', '#60a8ff'], emissive: true });
    }
  }

  onHurt() {
    if (this.state === 'sleep') return;
    if (this.state === 'chase' && this.hurtAnim <= 0 && Math.random() < 0.35) {
      this.animator.play('hurt', true);
      this.hurtAnim = 0.25;
    }
    if (this.world && Math.random() < 0.5) spray(this.world, this.x, this.y - 20, 4, 0.6);
    this.world?.bus.emit('bossHurt', { actor: this });
  }

  die(hit) {
    super.die(hit);
    this.hurtable = false;
    this.hidden = false;
    this.timers = [];
    this.setState('dead');
    this.animator.play('death', true);
    const w = this.world;
    if (!w) return;
    for (const a of this.adds) if (!a.dead) a.takeHit({ damage: 9999, dirX: 0, dirY: 1, knockback: 0, source: this });
    w.combat.hitboxes = w.combat.hitboxes.filter((h) => h.owner.team !== 'enemy');
    w.projectiles.forEach((p) => { if (p.owner === this) p.removed = true; });
    w.session.slowmo?.(0.3, 1.6);
    w.session.camera?.shake(8);
    if (this.coreLight) this.coreLight.dead = true;
    w.addLight(new Light({ x: this.x, y: this.y - 40, radius: 180, color: [120, 220, 255], intensity: 1.2, ttl: 1.4, bloom: 0.9 }));
    spray(w, this.x, this.y - 10, 40, 1.4);
    for (let i = 0; i < 30; i++) w.particles.element(this.x + rand(-12, 12), this.y - rand(10, 50), 'frost', 1, 3);
  }

  render(ctx, cx, cy) {
    if (this.hidden) return;
    super.render(ctx, cx, cy);
  }

  renderEmissive(ctx, cx, cy) {
    if (this.hidden) {
      // Wellenringe und Blasen über der abgetauchten Priesterin
      const x = this.x - cx, y = this.y - cy;
      ctx.save();
      for (let i = 0; i < 3; i++) {
        const k = ((this.stateTime * 1.6 + i / 3) % 1);
        ctx.globalAlpha = 0.6 * (1 - k);
        ctx.strokeStyle = this.enraged ? '#60a8ff' : '#2ec8cc';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y), 4 + k * 16, (4 + k * 16) * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
      return;
    }
    super.renderEmissive(ctx, cx, cy);
    const f = this.animator.frame;
    const glow = this.enraged ? f.glowEnraged : f.glow;
    if (!glow) return;
    const fade = this.dead ? Math.max(0, 1 - this.stateTime * 0.45) : 1;
    if (fade <= 0) return;
    const pulse = 0.82 + 0.18 * Math.sin(this.stateTime * (this.enraged ? 9 : 5));
    glow.draw(ctx, this.x - cx, this.y - cy, { flip: this.facing < 0, alpha: (this.state === 'sleep' ? 0.45 : pulse) * fade });
    // Glanz an der Perle / Dreizackspitze kurz vor dem Angriff
    if (/Windup$/.test(this.state) && this.stateTime > this.windup * 0.55) {
      const t = this.#meta(this.state === 'sweepWindup' ? 'tip' : 'pearl');
      const k = (this.stateTime - this.windup * 0.55) / (this.windup * 0.45);
      const r = Math.round(2 + k * 5), x = Math.round(t.x - cx), y = Math.round(t.y - cy);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - r, y, r * 2 + 1, 1); ctx.fillRect(x, y - r, 1, r * 2 + 1);
      ctx.fillStyle = this.enraged ? '#c8e6ff' : '#a0fff0';
      ctx.fillRect(x - 1, y - 1, 3, 3);
    }
  }
}
