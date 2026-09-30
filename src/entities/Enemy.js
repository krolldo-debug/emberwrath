import { Actor } from './Actor.js';
import { getShadow } from './Entity.js';
import { ENEMY_TYPES } from './enemyTypes.js';
import { SlashEffect } from './Effects.js';
import { Arrow, MagicBolt } from './Projectile.js';
import { Telegraph, DamageWave } from './Telegraph.js';
import { SLASH_STYLES } from '../sprites/effects.js';
import { rand, angleDiff } from '../core/math.js';

// Generische Gegner-KI als Zustandsmaschine:
//   dormant/ceiling (versteckt) -> spawn -> idle (streift umher)
//   idle -> [howl] -> chase -> windup (Telegraph) -> strike -> recover [-> retreat] -> chase
//   chase -> return (zu weit vom Heimatpunkt, Held tot, Ziel verloren) -> idle
// Treffer unterbrechen Angriffe (hurt). Verhalten über ENEMY_TYPES steuerbar.
// opts: { hpScale, home: {x,y}, group, dormant, ambush, respawned }
export class Enemy extends Actor {
  constructor(typeKey, x, y, assets, opts = {}) {
    if (typeof opts === 'number') opts = { hpScale: opts };
    const def = ENEMY_TYPES[typeKey];
    if (!def) throw new Error(`Gegnertyp ${typeKey} unbekannt`);
    super(x, y, assets.sprites[def.sprites]);
    this.type = typeKey;
    this.def = def;
    this.team = 'enemy';
    // Stufe: fest oder Spanne (levels: [min, max]); höhere Stufe = mehr Leben/Schaden/XP
    const base = def.levels?.[0] ?? def.level ?? 1;
    this.level = def.levels ? base + Math.floor(Math.random() * (def.levels[1] - base + 1)) : base;
    this.power = 1 + (this.level - base) * 0.08;
    if (this.level !== base) this.xpOverride = Math.round((def.xp ?? 10) * (1 + (this.level - base) * 0.12));
    this.maxHp = this.hp = Math.round(def.hp * (opts.hpScale ?? 1) * this.power);
    this.specialTimer = rand(2, 4);
    this.special = null;
    this.lastFrame = null;
    this.radius = def.radius; this.mass = def.mass;
    this.hurtRadius = def.hurtRadius; this.bodyHeight = def.bodyHeight;
    this.shadowW = def.shadowW; this.material = def.material;
    this.assets = assets;
    this.home = opts.home ?? { x, y };
    this.group = opts.group ?? null;
    this.cooldown = rand(0.3, 0.9);
    this.strafeSeed = rand(0, 10);
    this.sidestep = Math.random() < 0.5 ? -1 : 1;
    this.aim = 0;
    this.corpseTimer = 0;
    this.alpha = 1;
    this.z = 0;
    this.wanderTimer = rand(0.5, 3);
    this.wanderTarget = null;
    this.lostSight = 0;
    this.stuckTime = 0;
    this.speedBoost = 0;
    this.aggroed = false;
    this.animator.play('idle');
    if (opts.dormant) this.#hide('dormant');
    else if (opts.ambush) this.#hide('ceiling');
    else if (opts.respawned) { this.hurtable = false; this.rise = def.spawnStyle === 'rise' ? 0 : 1; this.alpha = def.spawnStyle === 'rise' ? 1 : 0; this.setState('spawn'); }
    else this.setState('idle');
  }

  #hide(state) {
    this.setState(state);
    this.hurtable = false;
    this.solid = false;
    this.rise = 0; // Held zielt nicht auf versteckte Gegner
    if (state === 'dormant') { this.animator.play('death'); this.animator.time = 99; }
    if (state === 'ceiling') this.z = 70;
  }

  get isHidden() { return this.state === 'dormant' || this.state === 'ceiling'; }
  get isEngaged() { return ['chase', 'windup', 'strike', 'recover', 'retreat', 'hurt', 'howl', 'special', 'charging'].includes(this.state); }

  // Greift den Helden an (Sicht, Treffer, Alarm des Rudels).
  aggro(world, { alertGroup = true } = {}) {
    if (this.dead || this.state === 'return') return;
    if (this.state === 'dormant') {
      this.setState('spawn'); this.solid = true; this.rise = 0;
      this.animator.play('idle');
      world.bus.emit('spawnStart', { actor: this });
    } else if (this.state === 'ceiling') {
      this.setState('drop'); this.rise = 1; this.solid = true;
      world.bus.emit('ambush', { actor: this });
    } else if (this.state === 'idle') {
      if ((this.def.howl || this.def.roar) && !this.aggroed) {
        this.setState('howl');
        this.animator.play(this.def.roar && this.animator.anims.roar ? 'roar' : 'howl', true);
        world.bus.emit(this.def.roar ? 'roar' : 'howl', { actor: this });
        if (this.def.roar) { world.session.camera?.shake(3); world.particles.ring(this.x, this.y - this.bodyHeight * 0.6, 8, 20, ['#fff0b0', '#ffb640', '#f07a1c'], 70); }
      }
      else this.setState('chase');
    }
    if (!this.aggroed) world.bus.emit('aggro', { actor: this });
    this.aggroed = true;
    this.lostSight = 0;
    if (alertGroup) world.spawner?.alert(this, world);
  }

  update(dt, world) {
    this.tickTimers(dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.speedBoost = Math.max(0, this.speedBoost - dt);
    this.world = world;
    this.#frameEvents(world);
    if (!this.font) this.font = world.session?.font;
    if (this.rareId) this.nearHero = Math.hypot(world.hero.x - this.x, world.hero.y - this.y) < 130;
    const hero = world.hero;
    const dx = hero.x - this.x, dy = hero.y - this.y;
    const dist = Math.hypot(dx, dy);
    const toHero = Math.atan2(hero.centerY - this.centerY, dx);
    const A = this.def.attack;
    const homeDist = Math.hypot(this.x - this.home.x, this.y - this.home.y);

    switch (this.state) {
      case 'dormant':
        if (!hero.dead && dist < this.def.aggro * 0.62) this.aggro(world);
        break;

      case 'ceiling':
        if (!hero.dead && dist < 54) this.aggro(world);
        break;

      case 'drop':
        this.z = Math.max(0, 70 - (this.stateTime / 0.35) * 70);
        if (this.z <= 0) {
          this.hurtable = true;
          world.particles.dust(this.x, this.y, 6);
          world.bus.emit('land', { actor: this });
          this.cooldown = 0;
          this.#beginWindup(world, toHero);
        }
        break;

      case 'spawn':
        if (this.def.spawnStyle === 'rise') {
          this.rise = Math.min(1, this.stateTime / 0.7);
          if (Math.random() < 0.5) world.particles.dust(this.x + rand(-5, 5), this.y, 1);
        } else {
          this.alpha = Math.min(1, this.stateTime / 0.6);
        }
        if (this.rise >= 1 && this.alpha >= 1) {
          this.hurtable = true;
          this.setState(this.aggroed ? 'chase' : 'idle');
        }
        break;

      case 'idle': {
        this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.1 * dt);
        if (!hero.dead && dist < this.def.aggro && world.dungeon.lineOfSight(this.x, this.y - 6, hero.x, hero.y - 6)) { this.aggro(world); break; }
        this.#wander(dt, world);
        break;
      }

      case 'howl':
        this.vx *= 0.8; this.vy *= 0.8;
        if (Math.abs(dx) > 2) this.facing = Math.sign(dx);
        if (this.stateTime > (this.def.roar ? this.def.roarTime ?? 1.1 : 0.8)) {
          if (this.def.howl) world.spawner?.rally(this, world);
          this.setState('chase');
        }
        break;

      case 'chase': {
        if (hero.dead || (homeDist > this.def.leash && !this.leashFree)) { this.#returnHome(world); break; }
        let mx = dx / (dist || 1), my = dy / (dist || 1);
        let speed = this.def.speed * (this.speedBoost > 0 ? 1.25 : 1);
        const clearPath = world.dungeon.lineOfSight(this.x, this.y - 2, hero.x, hero.y - 2);
        const hasLos = A.kind !== 'ranged' || world.dungeon.lineOfSight(this.x, this.y - 8, hero.x, hero.centerY);
        this.lostSight = clearPath ? 0 : this.lostSight + dt;
        if (this.lostSight > 5 && dist > this.def.aggro * 2 && !this.leashFree) { this.#returnHome(world); break; }
        if (!clearPath) {
          const f = world.flow.direction(this.x, this.y - 2);
          if (f) { mx = f.x; my = f.y; }
        }
        if (A.kind === 'ranged') {
          // Fernkämpfer: Abstand halten, nach dem Schuss seitlich umsetzen,
          // an Wänden entlang ausweichen und nicht auf Artgenossen stehen
          const px = -dy / (dist || 1), py = dx / (dist || 1);
          if (dist < A.minRange) {
            mx = -dx / (dist || 1) + px * this.sidestep * 0.35; my = -dy / (dist || 1) + py * this.sidestep * 0.35; speed *= 0.9;
            const D = world.dungeon, ax = this.x + mx * 10, ay = this.y + my * 10;
            if (D.collidesRect(ax - 4, ay - 3, ax + 4, ay + 1)) { mx = px * this.sidestep; my = py * this.sidestep; speed *= 1.1; }
          } else if (dist < A.range * 0.85 && hasLos) {
            if (this.cooldown > 0.25) { mx = px * this.sidestep; my = py * this.sidestep; speed *= 0.55; }
            else speed = 0;
          }
          for (const o of world.enemies) {
            if (o === this || o.dead || o.def.attack?.kind !== 'ranged') continue;
            const ox = this.x - o.x, oy = this.y - o.y, od = Math.hypot(ox, oy);
            if (od > 0 && od < 20) { mx += ox / od * 0.8; my += oy / od * 0.8; if (speed === 0) speed = this.def.speed * 0.4; }
          }
          const l = Math.hypot(mx, my) || 1; mx /= l; my /= l;
        }
        // Rudeltiere umkreisen den Helden, solange sie nicht angreifen dürfen
        const waiting = this.cooldown > 0 || !(world.spawner?.canAttack(this) ?? true);
        if (this.def.strafe && dist < 90 && clearPath) {
          const s = Math.sin(world.time * 2.2 + this.strafeSeed);
          const px = -my, py = mx;
          const orbit = waiting && dist < 60 ? 1.4 : 0.9;
          mx += px * s * orbit; my += py * s * orbit;
          if (waiting && dist < 40) { mx -= dx / (dist || 1) * 0.8; my -= dy / (dist || 1) * 0.8; }
          const l = Math.hypot(mx, my) || 1; mx /= l; my /= l;
        }
        if (A.kind === 'melee' && dist < A.range * 0.7) speed *= 0.2;
        const k = 1 - Math.exp(-dt * 8);
        this.vx += (mx * speed - this.vx) * k;
        this.vy += (my * speed - this.vy) * k;
        if (Math.abs(dx) > 2) this.facing = Math.sign(dx);
        this.animator.play(speed > 1 ? 'walk' : 'idle');
        this.specialTimer -= dt;
        const sp = this.def.specials?.find((x) => dist < x.range && dist >= (x.minRange ?? 0));
        if (sp && this.specialTimer <= 0 && !waiting && clearPath) { this.#beginSpecial(world, sp, toHero); break; }
        const inRange = dist < A.range && (A.kind !== 'ranged' || dist >= A.minRange * 0.6);
        if (inRange && hasLos && !waiting) this.#beginWindup(world, toHero);
        break;
      }

      case 'special':
        this.#updateSpecial(dt, world, toHero);
        break;

      case 'charging': {
        const C = this.charge;
        this.vx = Math.cos(this.aim) * C.speed; this.vy = Math.sin(this.aim) * C.speed;
        if (Math.random() < 0.6) world.particles.dust(this.x, this.y, 1, C.dust ?? '#5a5060');
        const res = this.integrate(dt, world);
        if (res.hitX || res.hitY || this.stateTime >= C.duration) {
          world.combat.hitboxes = world.combat.hitboxes.filter((h) => h.owner !== this);
          if (res.hitX || res.hitY) {
            world.session.camera?.shake(4);
            world.particles.dust(this.x + Math.cos(this.aim) * 8, this.y, 10, '#4d4459');
            world.bus.emit('chargeImpact', { actor: this, x: this.x, y: this.y });
          }
          this.vx = this.vy = 0;
          this.setState('recover');
          this.recoverOverride = res.hitX || res.hitY ? (C.stun ?? 1.2) : null;
          this.animator.play(res.hitX || res.hitY ? 'hurt' : 'idle', true);
        }
        return;
      }

      case 'windup': {
        this.vx *= 0.8; this.vy *= 0.8;
        if (this.stateTime < A.windup * 0.7) {
          this.aim += angleDiff(this.aim, toHero) * Math.min(1, dt * 10);
          if (Math.abs(dx) > 2) this.facing = Math.sign(dx);
        }
        if (this.stateTime >= A.windup) this.#strike(world);
        break;
      }

      case 'strike':
        if (A.kind === 'breath') {
          this.#breathTick(dt, world, toHero);
          if (this.stateTime >= A.active) { this.setState('recover'); this.animator.play('idle'); }
          break;
        }
        if (A.kind === 'lunge') {
          const t = this.stateTime / A.active;
          const sp = A.lungeSpeed * (1 - t * 0.6);
          this.vx = Math.cos(this.aim) * sp; this.vy = Math.sin(this.aim) * sp;
        } else {
          this.vx *= 0.85; this.vy *= 0.85;
        }
        if (this.stateTime >= A.active) {
          this.setState('recover');
          this.animator.play('idle');
        }
        break;

      case 'recover':
        this.vx *= 0.82; this.vy *= 0.82;
        if (this.stateTime >= (this.recoverOverride ?? A.recover)) {
          this.recoverOverride = null;
          this.cooldown = A.cooldown * rand(0.8, 1.3);
          if (Math.random() < 0.6) this.sidestep = -this.sidestep;
          if (this.def.hitAndRun) { this.setState('retreat'); this.retreatAng = Math.atan2(-dy, -dx) + rand(-0.7, 0.7); }
          else this.setState('chase');
        }
        break;

      case 'retreat': {
        const sp = this.def.speed * 0.9;
        const k = 1 - Math.exp(-dt * 8);
        this.vx += (Math.cos(this.retreatAng) * sp - this.vx) * k;
        this.vy += (Math.sin(this.retreatAng) * sp - this.vy) * k;
        this.animator.play('walk');
        if (Math.abs(this.vx) > 2) this.facing = Math.sign(this.vx);
        if (this.stateTime >= this.def.hitAndRun) this.setState('chase');
        break;
      }

      case 'hurt':
        this.vx *= 0.8; this.vy *= 0.8;
        if (this.stateTime >= this.def.hurtTime) { this.cooldown = Math.max(this.cooldown, 0.35); this.setState('chase'); }
        break;

      case 'return': {
        this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.6 * dt);
        const hx = this.home.x - this.x, hy = this.home.y - this.y;
        const d = Math.hypot(hx, hy);
        const sp = this.def.speed * 1.25;
        this.vx = (hx / (d || 1)) * sp; this.vy = (hy / (d || 1)) * sp;
        if (Math.abs(hx) > 2) this.facing = Math.sign(hx);
        this.animator.play('walk');
        const before = { x: this.x, y: this.y };
        this.integrate(dt, world);
        this.stuckTime = Math.hypot(this.x - before.x, this.y - before.y) < sp * dt * 0.3 ? this.stuckTime + dt : 0;
        if (d < 6 || this.stuckTime > 1.5) {
          if (d >= 6) { this.x = this.home.x; this.y = this.home.y; }
          this.hp = this.maxHp; this.hurtable = true; this.aggroed = false;
          this.vx = this.vy = 0;
          this.setState('idle');
          this.animator.play('idle');
        }
        return;
      }

      case 'dead':
        this.vx *= 0.85; this.vy *= 0.85;
        if (this.animator.finished) {
          this.corpseTimer += dt;
          // Leiche wird Teil des Bodens (Dekal) – der Ort erzählt den Kampf
          if (this.corpseTimer > 0.6) {
            world.decals.stampFrame(this.currentFrame(), this.x, this.y, this.facing < 0, 0.9);
            this.removed = true;
          }
        }
        break;
    }
    this.integrate(dt, world);
  }

  #wander(dt, world) {
    const W = this.def.wander;
    if (!W) { this.vx *= 0.8; this.vy *= 0.8; this.animator.play('idle'); return; }
    this.wanderTimer -= dt;
    if (!this.wanderTarget && this.wanderTimer <= 0) {
      const a = rand(0, Math.PI * 2), r = rand(4, W);
      this.wanderTarget = { x: this.home.x + Math.cos(a) * r, y: this.home.y + Math.sin(a) * r * 0.7 };
    }
    if (this.wanderTarget) {
      const tx = this.wanderTarget.x - this.x, ty = this.wanderTarget.y - this.y;
      const d = Math.hypot(tx, ty);
      const sp = this.def.speed * 0.3;
      const before = { x: this.x, y: this.y };
      this.vx = (tx / (d || 1)) * sp; this.vy = (ty / (d || 1)) * sp;
      if (Math.abs(tx) > 1) this.facing = Math.sign(tx);
      this.animator.play('walk');
      this.stuckTime = Math.hypot(this.x - before.x, this.y - before.y) < 0.01 && this.stateTime > 0.2 ? this.stuckTime + dt : 0;
      if (d < 3 || this.stuckTime > 1) { this.wanderTarget = null; this.wanderTimer = rand(2, 5); this.stuckTime = 0; }
    } else {
      this.vx *= 0.8; this.vy *= 0.8;
      this.animator.play('idle');
    }
  }

  #returnHome(world) {
    this.setState('return');
    this.hurtable = false;
    this.stuckTime = 0;
    world.bus.emit('evade', { actor: this });
  }

  #beginWindup(world, toHero) {
    this.aim = toHero;
    this.setState('windup');
    this.animator.play('windup', true);
    world.bus.emit('telegraph', { actor: this });
    const A = this.def.attack;
    if (A.kind === 'charge') world.spawn(new Telegraph(this.x, this.y, { shape: 'line', angle: toHero, len: A.chargeSpeed * A.active, width: 16, duration: A.windup }));
    if (A.kind === 'slam') {
      const ox = this.x + Math.cos(toHero) * (A.offset ?? 14), oy = this.y + Math.sin(toHero) * (A.offset ?? 14) * 0.6;
      this.slamAt = { x: ox, y: oy };
      world.spawn(new Telegraph(ox, oy, { shape: 'circle', r: A.radius, duration: A.windup }));
    }
    if (A.kind === 'breath') world.spawn(new Telegraph(this.x, this.y - 2, { shape: 'arc', r: A.reach, angle: toHero, arc: A.arc, duration: A.windup }));
  }

  #dmg(v) { return Math.round(v * this.power); }

  // Frame-Marken der Sprites (Schritte schwerer Gegner)
  #frameEvents(world) {
    const f = this.animator.frame;
    if (f === this.lastFrame) return;
    this.lastFrame = f;
    if (f.fx === 'step' && this.mass >= 2.5 && !this.dead) {
      world.particles.dust(this.x, this.y, 2, '#4d4459');
      const h = world.hero;
      if (Math.hypot(h.x - this.x, h.y - this.y) < 140) world.session.camera?.shake(this.def.elite ? 1.2 : 0.6);
    }
  }

  // Mündungspunkt aus Frame-Metadaten (Hand, Maul) oder grob geschätzt
  #muzzle(key) {
    const m = this.animator.frame.meta?.[key] ?? this.animator.frame.meta?.hand;
    if (m) return { x: this.x + m.dx * this.facing, y: this.y + m.dy };
    return { x: this.x + this.facing * 8, y: this.y - 12 };
  }

  #breathTick(dt, world, toHero) {
    const A = this.def.attack;
    this.vx *= 0.8; this.vy *= 0.8;
    this.aim += angleDiff(this.aim, toHero) * Math.min(1, dt * (A.track ?? 1.2));
    if (Math.abs(Math.cos(this.aim)) > 0.2) this.facing = Math.sign(Math.cos(this.aim));
    this.breathT = (this.breathT ?? 0) - dt;
    const m = this.#muzzle('mouth');
    for (let i = 0; i < 3; i++) {
      const a = this.aim + rand(-A.arc / 2, A.arc / 2), sp = rand(80, 150);
      world.particles.spawn({ x: m.x, y: m.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, drag: 2, life: rand(0.25, 0.5), colors: A.element === 'water' ? ['#ffffff', '#b8f0ff', '#50c8e0'] : ['#fff4d8', '#ffb070', '#f0602a', '#8a1a08'], emissive: true });
    }
    if (this.breathT <= 0) {
      this.breathT = A.tick ?? 0.15;
      world.combat.add({ owner: this, team: 'enemy', shape: 'arc', follow: false, x: this.x, y: this.y - 8, r: A.reach, angle: this.aim, arc: A.arc, damage: this.#dmg(A.damage), knockback: 40, ttl: 0.08 });
    }
  }

  #beginSpecial(world, sp, toHero) {
    this.special = sp;
    this.aim = toHero;
    this.setState('special');
    this.specialPhase = 'windup';
    this.tickT = 0;
    const anim = this.animator.anims[sp.anim] ? sp.anim : 'windup';
    this.animator.play(sp.kind === 'spin' ? 'windup' : anim, true);
    world.bus.emit('telegraph', { actor: this, special: sp.kind });
    if (sp.kind === 'slam') {
      this.slamAt = { x: this.x + this.facing * (sp.offset ?? 16), y: this.y + 2 };
      world.spawn(new Telegraph(this.slamAt.x, this.slamAt.y, { shape: 'circle', r: sp.radius, duration: sp.windup }));
    } else if (sp.kind === 'spin') {
      world.spawn(new Telegraph(this.x, this.y, { shape: 'circle', r: sp.radius, duration: sp.windup, follow: this }));
    } else if (sp.kind === 'charge') {
      world.spawn(new Telegraph(this.x, this.y, { shape: 'line', angle: toHero, len: sp.speed * sp.duration, width: 22, duration: sp.windup }));
    }
  }

  #updateSpecial(dt, world, toHero) {
    const sp = this.special;
    if (this.specialPhase === 'windup') {
      this.vx *= 0.8; this.vy *= 0.8;
      if (sp.kind !== 'charge' && this.stateTime < sp.windup * 0.6 && Math.abs(Math.cos(toHero)) > 0.1) this.facing = Math.sign(Math.cos(toHero));
      if (this.stateTime < sp.windup) return;
      this.specialPhase = 'active';
      this.stateTime = 0;
      if (sp.kind === 'slam') {
        const { x, y } = this.slamAt;
        if (!this.animator.anims[sp.anim]) this.animator.play('strike', true);
        world.combat.add({ owner: this, team: 'enemy', shape: 'circle', follow: false, x, y: y - 4, r: sp.radius, damage: this.#dmg(sp.damage), knockback: 220, heavy: true, ttl: 0.12 });
        world.particles.dust(x, y, 16, '#4d4459');
        world.particles.ring(x, y, 8, sp.radius * 0.6, sp.colors ?? ['#fff0b0', '#ffb640', '#f07a1c'], 100);
        world.decals.scorch?.(x, y, sp.radius * 0.35);
        world.session.camera?.shake(6);
        world.session.hitstop?.(0.05);
        if (sp.wave) world.addEffect(new DamageWave(x, y, this, { maxR: sp.wave, duration: 0.8, damage: this.#dmg(sp.damage * 0.5), color: sp.waveColor ?? [255, 140, 60] }));
        world.bus.emit('spellImpact', { x, y, element: sp.element ?? 'fire', radius: sp.radius, big: true });
      } else if (sp.kind === 'spin') {
        this.animator.play(this.animator.anims.spin ? 'spin' : 'strike', true);
        world.bus.emit('enemySwing', { actor: this, heavy: true });
      } else if (sp.kind === 'charge') {
        this.charge = { speed: sp.speed, duration: sp.duration, stun: sp.stun ?? 1.4 };
        this.setState('charging');
        this.animator.play(this.animator.anims.charge ? 'charge' : 'walk', true);
        world.combat.add({ owner: this, team: 'enemy', shape: 'circle', follow: true, offX: 0, offY: -8, x: this.x, y: this.y, r: 14, damage: this.#dmg(sp.damage), knockback: 240, heavy: true, ttl: sp.duration });
        this.specialTimer = sp.cooldown;
        return;
      }
      return;
    }
    // aktiv
    if (sp.kind === 'spin') {
      const d = Math.hypot(world.hero.x - this.x, world.hero.y - this.y) || 1;
      const s = this.def.speed * (sp.speedMul ?? 0.8);
      const k = 1 - Math.exp(-dt * 6);
      this.vx += ((world.hero.x - this.x) / d * s - this.vx) * k;
      this.vy += ((world.hero.y - this.y) / d * s - this.vy) * k;
      this.tickT -= dt;
      if (this.tickT <= 0) {
        this.tickT = 0.28;
        world.combat.add({ owner: this, team: 'enemy', shape: 'circle', follow: true, offX: 0, offY: -8, x: this.x, y: this.y, r: sp.radius, damage: this.#dmg(sp.damage), knockback: 160, ttl: 0.1 });
        world.particles.ring(this.x, this.y - 10, 6, sp.radius * 0.8, ['#fff0b0', '#ffb640', '#f07a1c'], 60);
      }
      if (this.stateTime >= sp.duration) this.#endSpecial();
    } else {
      this.vx *= 0.8; this.vy *= 0.8;
      if (this.stateTime >= (sp.recover ?? 0.8)) this.#endSpecial();
    }
  }

  #endSpecial() {
    this.specialTimer = this.special.cooldown;
    this.cooldown = Math.max(this.cooldown, 0.6);
    this.special = null;
    this.setState('chase');
    this.animator.play('idle');
  }

  #strike(world) {
    const A = this.def.attack;
    this.setState('strike');
    this.animator.play('strike', true);
    const dx = Math.cos(this.aim), dy = Math.sin(this.aim);
    if (A.kind === 'melee') {
      this.kbx += dx * A.lunge; this.kby += dy * A.lunge;
      world.combat.add({
        owner: this, team: 'enemy', shape: 'arc', follow: true, offX: dx * 3, offY: -8 + dy * 3,
        x: this.x, y: this.y - 8, r: A.reach, angle: this.aim, arc: A.arc,
        damage: this.#dmg(A.damage), knockback: A.knockback, ttl: A.active,
      });
      world.addEffect(new SlashEffect(this, this.aim, SLASH_STYLES.enemy, false, A.active + 0.1, true));
      world.bus.emit('enemySwing', { actor: this });
    } else if (A.kind === 'lunge') {
      world.combat.add({
        owner: this, team: 'enemy', shape: 'circle', follow: true, offX: dx * 6, offY: -5,
        x: this.x, y: this.y, r: (A.hitRadius ?? 9) + (this.def.elite ? 3 : 0), damage: this.#dmg(A.damage), knockback: A.knockback, ttl: A.active,
      });
      world.bus.emit('lunge', { actor: this });
    } else if (A.kind === 'ranged') {
      const m = this.animator.frame.meta?.hand ? this.#muzzle('hand') : { x: this.x + this.facing * 8, y: this.y - 12 };
      const ang = Math.atan2(world.hero.centerY - m.y, world.hero.x - m.x);
      if (A.projectile === 'bolt') {
        const n = A.count ?? 1, spread = A.spread ?? 0.3;
        for (let i = 0; i < n; i++) {
          const a = n > 1 ? ang - spread / 2 + (spread * i) / (n - 1) : ang;
          world.addProjectile(new MagicBolt(m.x, m.y + 12, a, A.projectileSpeed, this.#dmg(A.damage), this, A.element, { homing: A.homing ?? 0 }));
        }
        world.bus.emit('cast', { actor: this, element: A.element });
      } else {
        world.addProjectile(new Arrow(m.x, m.y + 10, ang, A.projectileSpeed, this.#dmg(A.damage), this, this.assets.sprites.arrow));
        world.bus.emit('shoot', { actor: this });
      }
    } else if (A.kind === 'charge') {
      this.charge = { speed: A.chargeSpeed, duration: A.active, stun: A.stun ?? 1.0 };
      this.setState('charging');
      this.animator.play(this.animator.anims.charge ? 'charge' : 'walk', true);
      world.combat.add({ owner: this, team: 'enemy', shape: 'circle', follow: true, offX: 0, offY: -6, x: this.x, y: this.y, r: A.hitRadius ?? 11, damage: this.#dmg(A.damage), knockback: A.knockback, heavy: true, ttl: A.active });
      world.bus.emit('lunge', { actor: this });
    } else if (A.kind === 'slam') {
      const { x, y } = this.slamAt ?? { x: this.x + this.facing * 14, y: this.y };
      world.combat.add({ owner: this, team: 'enemy', shape: 'circle', follow: false, x, y: y - 4, r: A.radius, damage: this.#dmg(A.damage), knockback: A.knockback, heavy: true, ttl: 0.12 });
      world.particles.dust(x, y, 10, '#4d4459');
      if (A.colors) world.particles.ring(x, y, 6, A.radius * 0.6, A.colors, 80);
      world.session.camera?.shake(3);
      world.bus.emit('enemySwing', { actor: this, heavy: true });
    } else if (A.kind === 'breath') {
      this.breathT = 0;
      this.animator.play(this.animator.anims.breath ? 'breath' : 'strike', true);
      world.bus.emit('cast', { actor: this, element: A.element ?? 'fire' });
    }
  }

  takeHit(hit) {
    const ok = super.takeHit(hit);
    if (ok && !this.dead && !this.aggroed && this.world) this.aggro(this.world);
    return ok;
  }

  onHurt(hit) {
    if (this.state === 'idle' || this.state === 'howl') { this.setState('hurt'); this.animator.play('hurt', true); return; }
    // Schwere Treffer unterbrechen immer, leichte nur außerhalb des Zuschlags
    if (this.state === 'strike' && !hit.heavy) return;
    if (this.state === 'charging' || this.state === 'special' || (this.def.elite && !hit.heavy) || this.def.stagger === false) return;
    this.setState('hurt');
    this.animator.play('hurt', true);
  }

  die(hit) {
    super.die(hit);
    this.hurtable = false;
    this.setState('dead');
    this.animator.play('death', true);
  }

  // Seltene Gegner (look = { scale, tint }): größer und eingefärbt.
  drawSprite(ctx, cx, cy, opts = {}) {
    if (!this.look || this.rise < 1) return super.drawSprite(ctx, cx, cy, opts);
    const f = this.currentFrame(), flip = this.facing < 0;
    const img = opts.flash ? (flip ? f.flashFlipped : f.flash) : tintedCanvas(f, this.look.tint, flip);
    drawScaled(ctx, f, img, this.x - cx, this.y - cy - (this.z ?? 0), flip, this.look.scale, opts.alpha ?? 1);
  }

  render(ctx, cx, cy) {
    if (this.state === 'ceiling' || this.state === 'drop') {
      // Faden von oben + Spinne in der Höhe
      const x = Math.round(this.x - cx), y = Math.round(this.y - cy - this.z);
      ctx.fillStyle = 'rgba(200,196,215,0.35)';
      ctx.fillRect(x, y - 120, 1, 112);
      if (this.state === 'drop') {
        const sh = getShadow(this.shadowW);
        ctx.drawImage(sh, Math.round(this.x - cx - sh.width / 2), Math.round(this.y - cy - sh.height / 2));
      }
      this.currentFrame().draw(ctx, this.x - cx, this.y - cy - this.z, { flip: this.facing < 0, alpha: this.state === 'ceiling' ? 0.55 : 1 });
      return;
    }
    if (this.state === 'dormant') { this.currentFrame().draw(ctx, this.x - cx, this.y - cy, { flip: this.facing < 0 }); return; }
    if (this.alpha < 1) ctx.globalAlpha = this.alpha;
    if (this.state === 'return') ctx.globalAlpha = 0.7;
    super.render(ctx, cx, cy);
    ctx.globalAlpha = 1;
  }

  renderEmissive(ctx, cx, cy) {
    if (this.isHidden) {
      if (this.state === 'ceiling') {
        // nur zwei glimmende Augen verraten die Spinne
        ctx.fillStyle = 'rgba(255,60,40,0.55)';
        ctx.fillRect(Math.round(this.x - cx + this.def.eye.x * this.facing), Math.round(this.y - cy - this.z + this.def.eye.y), 2, 1);
      }
      return;
    }
    super.renderEmissive(ctx, cx, cy);
    const gf = this.currentFrame().glow;
    const galpha = this.dead ? Math.max(0, 1 - this.stateTime * 0.8) : this.alpha;
    if (gf && this.rise >= 1) {
      if (this.look && gf.canvas) drawScaled(ctx, gf, this.facing < 0 ? gf.flipped : gf.canvas, this.x - cx, this.y - cy - this.z, this.facing < 0, this.look.scale, galpha);
      else gf.draw(ctx, this.x - cx, this.y - cy - this.z, { flip: this.facing < 0, alpha: galpha });
    }
    if (this.rise < 1 || this.dead || this.alpha < 1) return;
    const e = this.def.eye, sc = this.look?.scale ?? 1;
    const ex = Math.round(this.x - cx + e.x * sc * this.facing), ey = Math.round(this.y - cy + e.y * sc - this.z);
    const tele = this.state === 'windup' || (this.state === 'special' && this.specialPhase === 'windup');
    if (!gf || tele) {
      ctx.fillStyle = tele ? 'rgba(255,90,60,0.9)' : 'rgba(255,60,40,0.35)';
      ctx.fillRect(ex - 1, ey - 1, 3, 3);
    }
    if (tele) {
      ctx.fillStyle = '#fff0c0';
      ctx.fillRect(ex, ey, 1, 1);
      const k = this.stateTime / (this.state === 'special' ? this.special.windup : this.def.attack.windup);
      if (k > 0.55) {
        ctx.fillStyle = `rgba(255,${Math.round(200 - k * 120)},80,${0.5 + k * 0.5})`;
        const top = Math.round(this.y - cy - this.bodyHeight - 12);
        const x = Math.round(this.x - cx);
        ctx.fillRect(x, top, 1, 4); ctx.fillRect(x, top + 5, 1, 1);
      }
    }
    // HP-Balken mit Stufe nach Treffern / im Kampf
    if (this.hpBarTimer > 0 || ((this.def.elite || this.rareId) && this.isEngaged)) {
      const big = this.def.elite || this.rareId;
      const w = big ? 22 : 16;
      const x = Math.round(this.x - cx - w / 2), y = Math.round(this.y - cy - this.bodyHeight - 8);
      ctx.globalAlpha = big && this.isEngaged ? 1 : Math.min(1, this.hpBarTimer * 2);
      ctx.fillStyle = '#0b0710'; ctx.fillRect(x - 1, y - 1, w + 2, 4);
      ctx.fillStyle = '#3a1418'; ctx.fillRect(x, y, w, 2);
      const fill = Math.max(1, Math.round((w * this.hp) / this.maxHp));
      ctx.fillStyle = '#d0454a'; ctx.fillRect(x, y, fill, 2);
      ctx.fillStyle = '#ff8a80'; ctx.fillRect(x, y, fill, 1);
      if (this.font) this.font.draw(ctx, String(this.level), x - 2, y - 2, { color: this.def.elite || this.rareId ? '#ffd84a' : '#c8c2d0', align: 'right', shadow: true });
      ctx.globalAlpha = 1;
    }
    // Namensschild seltener Gegner (in der Nähe oder im Kampf)
    if (this.rareId && this.font && (this.isEngaged || this.nearHero)) {
      const x = Math.round(this.x - cx), y = Math.round(this.y - cy - this.bodyHeight - 17);
      this.font.draw(ctx, this.rareName.toUpperCase(), x, y - 7, { color: this.look?.tint ?? '#ffd84a', align: 'center', shadow: true });
      if (this.rareTitle) this.font.draw(ctx, this.rareTitle.toUpperCase(), x, y, { color: '#c8b8a0', align: 'center', shadow: true });
    }
  }

  // Aus C's rareSpawns(): Werte, Größe, Farbton, Name
  makeRare(r) {
    this.rareId = r.rareId;
    this.rareName = r.name ?? this.def.name;
    this.rareTitle = r.title ?? '';
    this.level = r.level ?? this.level;
    this.maxHp = this.hp = Math.round(this.maxHp * (r.hpMult ?? 1));
    this.power *= r.dmgMult ?? 1;
    const s = r.scale ?? 1;
    this.look = { scale: s, tint: r.tint ?? null };
    this.bodyHeight = Math.round(this.bodyHeight * s);
    this.hurtRadius = Math.round(this.hurtRadius * s);
    this.radius = Math.round(this.radius * Math.min(s, 1.25));
    this.shadowW = Math.round(this.shadowW * s);
    this.mass *= s * s;
    this.xpOverride = undefined;
  }
}

// Eingefärbte Kopien je Frame (einmal pro Frame/Farbe/Richtung gebaut)
const TINTS = new WeakMap();
function tintedCanvas(f, tint, flip) {
  const src = flip ? f.flipped : f.canvas;
  if (!tint) return src;
  let m = TINTS.get(f);
  if (!m) { m = new Map(); TINTS.set(f, m); }
  const key = tint + (flip ? '|f' : '');
  let c = m.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'color';
    g.globalAlpha = 0.55;
    g.fillStyle = tint; g.fillRect(0, 0, c.width, c.height);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(src, 0, 0);
    m.set(key, c);
  }
  return c;
}

function drawScaled(ctx, f, img, x, y, flip, s, alpha) {
  const ax = flip ? f.canvas.width - f.ax : f.ax;
  s /= f.res ?? 1; // Texel je Weltpixel (§11.12)
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.drawImage(img, Math.round(x - ax * s), Math.round(y - f.ay * s), Math.round(img.width * s), Math.round(img.height * s));
  if (alpha !== 1) ctx.globalAlpha = 1;
}
