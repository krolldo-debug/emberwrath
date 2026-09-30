import { Actor } from './Actor.js';
import { ENEMY_TYPES } from './enemyTypes.js';
import { BoneSpear } from './Projectile.js';
import { Telegraph, DamageWave, bossBanner } from './Telegraph.js';
import { Light } from '../gfx/Lighting.js';
import { EV } from '../core/events.js';
import { rand, pick, angleDiff } from '../core/math.js';
import { createSlamCrack } from '../sprites/bonelord.js';

let crackDecal = null;

// Varkhul, der Knochenfürst – Boss der Katakomben.
// Angriffsmuster (jedes mit Bodenwarnung):
//   Hieb        weiter Bogen vor ihm (nah)
//   Beben       Schwert in den Boden, Kreis um den Einschlag; ab Phase 2 mit Druckwelle
//   Speere      Fächer aus Knochenspeeren (Distanz), nicht abwehrbar
//   Ruf         ab Phase 2: erweckt Skelette aus den Knochenhaufen
//   Ansturm     ab Phase 3: rennt eine markierte Bahn entlang, prallt an Wänden ab
//               und ist danach kurz benommen (Gelegenheit für freie Treffer)
// Phasen: 1 (>60 % LP), 2 (60–30 %), 3 (<30 %, rasend).
// Für Anzeige und Tests: hp, maxHp, phase, def.name, def.bossId, world.boss.
export class Boss extends Actor {
  constructor(x, y, assets, type = 'bonelord') {
    const def = ENEMY_TYPES[type] ?? ENEMY_TYPES.bonelord;
    super(x, y, assets.sprites[def.sprites] ?? assets.sprites.bonelord);
    this.type = type;
    this.def = def;
    this.bossId = def.bossId;
    this.team = 'enemy';
    this.level = def.level;
    this.maxHp = this.hp = def.hp;
    this.radius = def.radius; this.mass = def.mass;
    this.hurtRadius = def.hurtRadius; this.bodyHeight = def.bodyHeight;
    this.shadowW = def.shadowW; this.material = def.material;
    this.home = { x, y };
    this.facing = 1;
    this.phase = 1;
    this.engaged = false;
    this.hurtable = false;
    this.cooldown = 1.5;
    this.summonTimer = 0;
    this.chargeTimer = 4;
    this.adds = [];
    this.pattern = [];
    this.setState('sleep');
    this.animator.play('dormant');
    this.lastFrame = null;
    this.ghosts = []; // Nachbilder beim Ansturm
  }

  get enraged() { return this.phase >= 3; }

  engage(world) {
    if (this.engaged || this.dead) return;
    this.engaged = true;
    this.setState('intro');
    this.animator.play('awaken', true);
    world.bus.emit(EV.BOSS_ENGAGED, { bossId: this.bossId, name: this.def.name });
    world.session.camera?.shake(4);
    world.particles.magic(this.x, this.y - 30, 24, 16);
    this.coreLight = world.addLight(new Light({ follow: this, offsetY: -36, radius: 70, color: [150, 80, 255], intensity: 0.4, flicker: 0.2, bloom: 0.3 }));
  }

  update(dt, world) {
    this.tickTimers(dt);
    this.world = world;
    const hero = world.hero;
    const dx = hero.x - this.x, dy = hero.y - this.y;
    const dist = Math.hypot(dx, dy);
    this.adds = this.adds.filter((a) => !a.removed);
    this.#frameEvents(world);
    this.#updateGhosts(dt);
    this.#checkPhase(world);
    const spd = this.def.speed * (this.enraged ? 1.35 : 1);

    switch (this.state) {
      case 'sleep':
        this.vx = this.vy = 0;
        break;

      case 'intro':
        this.vx = this.vy = 0;
        if (this.stateTime < 1 && Math.random() < dt * 30) world.particles.magic(this.x + rand(-14, 14), this.y - rand(0, 20), 1, 6);
        if (this.stateTime > 1.75) { this.hurtable = true; this.setState('chase'); }
        break;

      case 'roar':
        this.vx *= 0.7; this.vy *= 0.7;
        if (Math.random() < dt * 40) world.particles.magic(this.x + rand(-20, 20), this.y - rand(10, 60), 1, 6);
        if (this.enraged && Math.random() < dt * 30) world.particles.embers(this.x + rand(-16, 16), this.y - rand(0, 40), 1);
        if (this.stateTime > 1.25) { this.hurtable = true; this.cooldown = 0.3; this.setState('chase'); }
        break;

      case 'chase': {
        if (hero.dead) { this.vx *= 0.8; this.vy *= 0.8; this.animator.play('idle'); break; }
        this.cooldown -= dt;
        this.summonTimer -= dt;
        this.chargeTimer -= dt;
        let mx = dx / (dist || 1), my = dy / (dist || 1);
        if (!world.dungeon.lineOfSight(this.x, this.y - 2, hero.x, hero.y - 2)) {
          const f = world.flow.direction(this.x, this.y - 2);
          if (f) { mx = f.x; my = f.y; }
        }
        const want = dist > 34 ? spd : 0;
        const k = 1 - Math.exp(-dt * 6);
        this.vx += (mx * want - this.vx) * k;
        this.vy += (my * want - this.vy) * k;
        if (Math.abs(dx) > 3) this.facing = Math.sign(dx);
        this.animator.play(want > 1 ? 'walk' : 'idle');
        if (this.cooldown <= 0) this.#chooseAttack(world, dist);
        break;
      }

      case 'cleaveWindup':
        this.vx *= 0.8; this.vy *= 0.8;
        if (this.stateTime < 0.45) this.aim += angleDiff(this.aim, Math.atan2(dy, dx)) * Math.min(1, dt * 6);
        if (this.stateTime >= this.windup) this.#cleave(world);
        break;

      case 'slamWindup':
        this.vx *= 0.8; this.vy *= 0.8;
        if (this.stateTime >= this.windup) this.#slam(world);
        break;

      case 'castWindup':
        this.vx *= 0.8; this.vy *= 0.8;
        if (Math.random() < dt * 40) world.particles.magic(this.x - this.facing * 4, this.y - 48, 1, 6);
        if (this.stateTime >= this.windup) this.#release(world);
        break;

      case 'chargeWindup':
        this.vx *= 0.7; this.vy *= 0.7;
        if (Math.random() < dt * 25) world.particles.dust(this.x - this.facing * 10, this.y, 1, '#6e6450');
        if (this.stateTime >= this.windup) {
          this.setState('charge');
          this.animator.play('charge', true);
          world.combat.add({ owner: this, team: 'enemy', shape: 'circle', follow: true, offX: 0, offY: -12, x: this.x, y: this.y, r: 16, damage: 24, knockback: 260, heavy: true, ttl: 1.0 });
          world.bus.emit('bossCharge', { actor: this });
        }
        break;

      case 'charge': {
        const sp = 270;
        this.vx = Math.cos(this.aim) * sp; this.vy = Math.sin(this.aim) * sp;
        if (Math.random() < 0.7) world.particles.dust(this.x, this.y, 1, '#6e6450');
        if (this.stateTime % 0.06 < dt) this.ghosts.push({ frame: this.animator.frame, x: this.x, y: this.y, flip: this.facing < 0, t: 0 });
        if (Math.random() < 0.5) { const m = this.#meta('tip'); world.particles.sparks(m.x, m.y, this.aim + Math.PI, 1, ['#ffffff', '#e6dcc0', '#a060f0']); }
        const res = this.integrate(dt, world);
        if (res.hitX || res.hitY || this.stateTime > 1.0) {
          world.combat.hitboxes = world.combat.hitboxes.filter((h) => h.owner !== this);
          if (res.hitX || res.hitY) {
            world.session.camera?.shake(9);
            world.session.hitstop?.(0.12);
            world.decals.stamp(crackDecal ??= createSlamCrack(), this.x + Math.cos(this.aim) * 12, this.y);
            world.particles.bones(this.x, this.y, 20, this.aim + Math.PI, 10, ['#80755c', '#bcae8e']);
            world.particles.dust(this.x + Math.cos(this.aim) * 10, this.y, 14, '#4d4459');
            world.bus.emit('bossImpact', { x: this.x, y: this.y });
          }
          this.vx = this.vy = 0;
          this.setState('stagger');
          this.animator.play('stagger', true);
        }
        return;
      }

      case 'strike':
        this.vx *= 0.8; this.vy *= 0.8;
        if (this.stateTime >= this.recover) { this.setState('chase'); }
        break;

      case 'stagger':
        this.vx *= 0.7; this.vy *= 0.7;
        if (Math.random() < dt * 6) world.particles.magic(this.x, this.y - 58, 1, 8);
        if (this.stateTime >= 1.5) { this.cooldown = 0.6; this.setState('chase'); }
        break;

      case 'dead':
        this.vx *= 0.85; this.vy *= 0.85;
        if (Math.random() < 0.5 && this.stateTime < 1.6) world.particles.magic(this.x + rand(-10, 10), this.y - rand(10, 50), 1, 4);
        break;
    }
    this.integrate(dt, world);
  }

  #checkPhase(world) {
    if (this.dead || !this.engaged) return;
    const f = this.hp / this.maxHp;
    if (this.phase === 1 && f <= 0.6) {
      this.phase = 2;
      bossBanner(world, 'Varkhul ruft die Toten', 'Die Gebeine im Saal erheben sich');
      this.summonTimer = 0;
      this.#roar(world);
      world.bus.emit('bossPhase', { bossId: this.bossId, phase: 2 });
    } else if (this.phase === 2 && f <= 0.3) {
      this.phase = 3;
      bossBanner(world, 'Varkhul rast vor Zorn', 'Weiche seinem Ansturm aus');
      this.chargeTimer = 0.5;
      this.#roar(world);
      world.bus.emit('bossPhase', { bossId: this.bossId, phase: 3 });
    }
  }

  #chooseAttack(world, dist) {
    const hero = world.hero;
    const ang = Math.atan2(hero.y - this.y, hero.x - this.x);
    this.aim = ang;
    if (this.phase >= 2 && this.summonTimer <= 0 && this.adds.length < 3) return this.#begin(world, 'castWindup', 'cast', 1.0, { summon: true });
    if (this.phase >= 3 && this.chargeTimer <= 0 && dist > 60) {
      this.chargeTimer = rand(7, 10);
      const len = this.#rayLength(world, ang);
      world.spawn(new Telegraph(this.x, this.y, { shape: 'line', angle: ang, len, width: 28, duration: 0.95 }));
      return this.#begin(world, 'chargeWindup', 'chargeWindup', 0.95);
    }
    if (dist < 50) {
      if (Math.random() < 0.6) {
        world.spawn(new Telegraph(this.x, this.y - 4, { shape: 'arc', r: 50, angle: ang, arc: 2.6, duration: this.enraged ? 0.6 : 0.8, follow: this }));
        return this.#begin(world, 'cleaveWindup', 'cleaveWindup', this.enraged ? 0.6 : 0.8);
      }
      return this.#beginSlam(world);
    }
    if (dist < 150 && Math.random() < 0.55) return this.#begin(world, 'castWindup', 'cast', this.enraged ? 0.6 : 0.8, { spears: true });
    if (dist < 90) return this.#beginSlam(world);
    this.cooldown = 0.4; // weiter annähern
  }

  #beginSlam(world) {
    const ix = this.x + this.facing * 22, iy = this.y + 2;
    this.impact = { x: ix, y: iy };
    world.spawn(new Telegraph(ix, iy, { shape: 'circle', r: 44, duration: this.enraged ? 0.75 : 1.0 }));
    this.#begin(world, 'slamWindup', 'slamWindup', this.enraged ? 0.75 : 1.0);
  }

  #begin(world, state, anim, windup, opts = {}) {
    this.setState(state);
    this.animator.play(anim, true);
    this.windup = windup;
    this.castOpts = opts;
    if (opts.spears || opts.summon) world.bus.emit('cast', { actor: this, element: 'shadow' });
    if (opts.spears) {
      const n = this.phase >= 2 ? 7 : 5, spread = 0.9;
      for (let i = 0; i < n; i++) {
        const a = this.aim - spread / 2 + (spread * i) / (n - 1);
        world.spawn(new Telegraph(this.x, this.y - 2, { shape: 'line', angle: a, len: 150, width: 5, duration: windup, color: [190, 120, 255] }));
      }
    }
    world.bus.emit('telegraph', { actor: this, attack: state });
  }

  #cleave(world) {
    this.setState('strike'); this.recover = this.enraged ? 0.45 : 0.7;
    this.animator.play('cleave', true);
    world.combat.add({ owner: this, team: 'enemy', shape: 'arc', follow: false, x: this.x, y: this.y - 10, r: 52, angle: this.aim, arc: 2.6, damage: 20, knockback: 240, heavy: true, ttl: 0.14 });
    this.kbx += Math.cos(this.aim) * 90; this.kby += Math.sin(this.aim) * 90;
    for (let i = 0; i < 7; i++) {
      const a = this.aim - 1.2 + i * 0.4;
      world.particles.sparks(this.x + Math.cos(a) * 40, this.y - 8 + Math.sin(a) * 24, a, 2, ['#ffffff', '#e0b8ff', '#a060f0']);
    }
    world.particles.dust(this.x + Math.cos(this.aim) * 20, this.y + Math.sin(this.aim) * 12, 8, '#4d4459');
    world.session.camera?.shake(4);
    world.bus.emit('enemySwing', { actor: this, heavy: true });
  }

  #slam(world) {
    this.setState('strike'); this.recover = this.enraged ? 0.55 : 0.85;
    this.animator.play('slam', true);
    const { x, y } = this.impact;
    world.combat.add({ owner: this, team: 'enemy', shape: 'circle', follow: false, x, y: y - 4, r: 44, damage: 18, knockback: 220, heavy: true, ttl: 0.12 });
    world.particles.dust(x, y, 20, '#4d4459');
    world.particles.bones(x, y, 4, -Math.PI / 2, 8, ['#80755c', '#bcae8e', '#e6dcc0']);
    world.particles.ring(x, y, 8, 24, ['#e0b8ff', '#a060f0', '#6a2cb0'], 110);
    world.decals.scorch(x, y, 14);
    world.decals.stamp(crackDecal ??= createSlamCrack(), x, y);
    world.particles.bones(x, y, 10, -Math.PI / 2, 14, ['#3e364b', '#4d4459', '#5f566b']);
    world.session.hitstop?.(0.08);
    world.addLight(new Light({ x, y, radius: 90, color: [170, 110, 255], intensity: 1, ttl: 0.3, bloom: 0.6 }));
    world.session.camera?.shake(9);
    if (this.phase >= 2) world.addEffect(new DamageWave(x, y, this, { maxR: 120, duration: 0.9, damage: 12 }));
    world.bus.emit('spellImpact', { x, y, element: 'shadow', radius: 44, big: true });
    world.bus.emit('bossSlam', { x, y });
  }

  #release(world) {
    const o = this.castOpts;
    this.setState('strike'); this.recover = 0.6;
    if (o.summon) {
      this.summonTimer = rand(16, 20);
      const n = this.phase >= 3 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand(-0.4, 0.4);
        const p = world.dungeon.nearestFree(this.home.x + Math.cos(a) * 70, this.home.y + Math.sin(a) * 45);
        const e = world.spawnEnemy('skeleton', p.x, p.y, { respawned: true, home: { ...this.home } });
        e.aggroed = true; e.summoned = true; e.xpOverride = 5;
        this.adds.push(e);
        world.particles.magic(p.x, p.y, 14, 10);
      }
      world.bus.emit('bossSummon', { bossId: this.bossId, count: n });
      return;
    }
    if (o.spears) {
      const n = this.phase >= 2 ? 7 : 5, spread = 0.9;
      const hx = this.x + this.facing * 6, hy = this.y - 2;
      for (let i = 0; i < n; i++) {
        const a = this.aim - spread / 2 + (spread * i) / (n - 1);
        world.addProjectile(new BoneSpear(hx + Math.cos(a) * 12, hy + Math.sin(a) * 8, a, 155, 10, this));
      }
      world.bus.emit('shoot', { actor: this });
    }
  }

  #rayLength(world, ang) {
    let len = 0;
    const T = 16;
    while (len < 320) {
      const x = this.x + Math.cos(ang) * (len + 12), y = this.y + Math.sin(ang) * (len + 12);
      if (world.dungeon.isWall(Math.floor(x / T), Math.floor((y - 4) / T))) break;
      len += 6;
    }
    return len + 8;
  }

  // Position eines Rig-Punkts (head, hand, tip, chest, eye, cast) in Weltkoordinaten
  #meta(key) {
    const m = this.animator.frame.meta?.[key] ?? { dx: 0, dy: -40 };
    return { x: this.x + m.dx * this.facing, y: this.y + m.dy };
  }

  // Frame-Marken der Animation auslösen (Schritte, Brüllen)
  #frameEvents(world) {
    const f = this.animator.frame;
    if (f === this.lastFrame) return;
    this.lastFrame = f;
    if (f.fx === 'step') {
      world.particles.dust(this.x + rand(-6, 6), this.y, 4, '#4d4459');
      world.session.camera?.shake(this.state === 'charge' ? 2 : 1);
      world.bus.emit('bossStep', { x: this.x, y: this.y });
    } else if (f.fx === 'roar') {
      world.session.camera?.shake(8);
      const h = this.#meta('head');
      world.particles.ring(h.x, h.y + 6, 12, 36, this.enraged ? ['#fff4d8', '#ffb070', '#f0602a'] : ['#ffffff', '#e0b8ff', '#a060f0'], 120);
      world.addLight(new Light({ x: h.x, y: h.y, radius: 140, color: this.enraged ? [255, 110, 60] : [170, 100, 255], intensity: 1, ttl: 0.5, bloom: 0.7 }));
      world.bus.emit('bossRoar', { bossId: this.bossId, x: this.x, y: this.y });
      // Druckwelle stößt den Helden zurück (kein Schaden)
      const hero = world.hero, dx = hero.x - this.x, dy = hero.y - this.y, d = Math.hypot(dx, dy) || 1;
      if (!hero.dead && d < 110) { hero.kbx += (dx / d) * 260; hero.kby += (dy / d) * 260; }
    } else if (f.fx === 'impact' && this.dead) {
      world.session.camera?.shake(6);
      world.particles.dust(this.x, this.y, 16, '#4d4459');
    }
  }

  #updateGhosts(dt) {
    for (const g of this.ghosts) g.t += dt;
    this.ghosts = this.ghosts.filter((g) => g.t < 0.3);
  }

  // Phasenwechsel: kurzes, unverwundbares Brüllen mit Druckwelle
  #roar(world) {
    world.combat.hitboxes = world.combat.hitboxes.filter((h) => h.owner !== this);
    this.hurtable = false;
    this.setState('roar');
    this.animator.play('roar', true);
    world.session.slowmo?.(0.5, 0.5);
  }

  onHurt() {
    if (this.state === 'sleep') return;
    this.world?.bus.emit('bossHurt', { actor: this });
  }

  die(hit) {
    super.die(hit);
    this.hurtable = false;
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
    // Die Seele entweicht
    w.addLight(new Light({ x: this.x, y: this.y - 40, radius: 180, color: [190, 130, 255], intensity: 1.2, ttl: 1.2, bloom: 0.9 }));
    for (let i = 0; i < 40; i++) w.particles.magic(this.x + rand(-12, 12), this.y - rand(20, 50), 1, 4);
  }

  render(ctx, cx, cy) {
    super.render(ctx, cx, cy);
  }

  #glowFrame() {
    const f = this.animator.frame;
    return this.enraged ? f.glowEnraged : f.glow;
  }

  renderEmissive(ctx, cx, cy) {
    // Nachbilder des Ansturms
    for (const g of this.ghosts) {
      g.frame.draw(ctx, g.x - cx, g.y - cy, { flip: g.flip, flash: true, alpha: 0.28 * (1 - g.t / 0.3) });
    }
    super.renderEmissive(ctx, cx, cy);
    const glow = this.#glowFrame();
    if (!glow) return;
    const fade = this.dead ? Math.max(0, 1 - this.stateTime * 0.6) : 1;
    if (fade <= 0) return;
    const pulse = 0.8 + 0.2 * Math.sin(this.stateTime * 6);
    glow.draw(ctx, this.x - cx, this.y - cy, { flip: this.facing < 0, alpha: (this.state === 'sleep' ? 0.5 : pulse) * fade });
    // Glanz an der Klingenspitze kurz vor dem Schlag
    if (/Windup$/.test(this.state) && this.stateTime > this.windup * 0.6) {
      const t = this.#meta('tip'), k = (this.stateTime - this.windup * 0.6) / (this.windup * 0.4);
      const r = Math.round(2 + k * 4), x = Math.round(t.x - cx), y = Math.round(t.y - cy);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - r, y, r * 2 + 1, 1); ctx.fillRect(x, y - r, 1, r * 2 + 1);
      ctx.fillStyle = this.enraged ? '#ffb070' : '#e0b8ff';
      ctx.fillRect(x - 1, y - 1, 3, 3);
    }
    // Benommen: kreisende Funken über dem Kopf
    if (this.state === 'stagger') {
      const h = this.#meta('head');
      ctx.fillStyle = '#ffe070';
      for (let i = 0; i < 3; i++) {
        const a = this.stateTime * 6 + (i * Math.PI * 2) / 3;
        ctx.fillRect(Math.round(h.x - cx + Math.cos(a) * 9), Math.round(h.y - cy - 6 + Math.sin(a) * 3), 2, 1);
      }
    }
  }
}
