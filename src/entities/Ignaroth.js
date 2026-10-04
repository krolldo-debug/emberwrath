import { Actor } from './Actor.js';
import { Entity } from './Entity.js';
import { ENEMY_TYPES } from './enemyTypes.js';
import { Telegraph, DamageWave, screenLine } from './Telegraph.js';
import { Light } from '../gfx/Lighting.js';
import { EV } from '../core/events.js';
import { rand, angleDiff } from '../core/math.js';
import { createSlamCrack } from '../sprites/bonelord.js';

let crackDecal = null;
const FIRE = ['#fff0b0', '#ffb640', '#f07a1c', '#c8420c', '#7a2208'];
const WHITE_FIRE = ['#ffffff', '#fff4c8', '#ffc048', '#ff6a14', '#8a2a08'];
const FIRE_RGB = [255, 110, 40];

// Ignaroth, der Glut-Tyrann – Endboss der Glutschmiede (Stufe 20).
// Angriffe (jeder mit Bodenwarnung):
//   Axthieb       weiter Bogen vor ihm, danach brennt eine Feuerspur nach
//   Beben         Axt in den Boden: Kreis; ab Phase 2 Druckwelle, Phase 3 doppelt
//   Feuerstoß     Kegel aus dem Maul, schwenkt langsam dem Helden nach
//   Meteorregen   5–8 verzögerte Einschläge im Raum (einer zielt auf den Helden)
//   Flammensäulen Ring um ihn, breitet sich nach außen aus – mit Lücke
//   Ansturm       ab Phase 2: markierte Bahn, prallt an Wänden ab -> benommen
//   Beschwörung   ab Phase 2: Feuerwichte / Magmahunde
// Phasen: 1 (> 66 %), 2 (66–33 %), 3 (< 33 %, Rüstung bricht auf, hinterlässt Glutflecken).
// Öffentliche Felder wie beim Knochenfürsten: type, def, bossId, level, hp/maxHp,
// phase, engaged, hurtable, adds, home; engage(world), update, die, renderEmissive.
export class Ignaroth extends Actor {
  constructor(x, y, assets) {
    const def = ENEMY_TYPES.ember_tyrant;
    super(x, y, assets.sprites[def.sprites]);
    this.type = 'ember_tyrant';
    this.def = def;
    this.bossId = def.bossId;
    this.team = 'enemy';
    this.level = def.level;
    this.maxHp = this.hp = def.hp;
    this.radius = def.radius; this.mass = def.mass;
    this.hurtRadius = def.hurtRadius; this.bodyHeight = Math.max(def.bodyHeight, 78); // Sprite ist ~88 px hoch (ohne Hörner)
    this.shadowW = def.shadowW; this.material = def.material;
    this.home = { x, y };
    this.facing = 1;
    this.phase = 1;
    this.engaged = false;
    this.hurtable = false;
    this.cooldown = 1.6;
    this.aim = 0;
    this.adds = [];
    this.hazards = [];      // eigene Feuerflächen, Meteore, Säulenringe
    this.pending = [];      // verzögerte Aktionen { t, fn }
    this.timers = { meteor: 3, pillars: 5, summon: 0, charge: 2, breath: 1.5, patch: 1 };
    this.last = '';
    this.hurtAnim = 0;
    this.ghosts = [];
    this.lastFrame = null;
    this.setState('sleep');
    this.animator.play('dormant');
  }

  get enraged() { return this.phase >= 3; }
  // Tempo-Faktor der Ausholzeiten je Phase
  get quick() { return [1, 0.85, 0.72][this.phase - 1]; }

  engage(world) {
    if (this.engaged || this.dead) return;
    this.engaged = true;
    this.world = world;
    this.setState('intro');
    this.animator.play('awaken', true);
    world.bus.emit(EV.BOSS_ENGAGED, { bossId: this.bossId, name: this.def.name });
    world.session.camera?.shake(5);
    world.particles.element(this.x, this.y - 38, 'fire', 30, 16);
    this.coreLight = world.addLight(new Light({ follow: this, offsetY: -55, radius: 90, color: FIRE_RGB, intensity: 0.55, flicker: 0.25, bloom: 0.35 }));
  }

  update(dt, world) {
    this.tickTimers(dt);
    this.world = world;
    const hero = world.hero;
    const dx = hero.x - this.x, dy = hero.y - this.y;
    const dist = Math.hypot(dx, dy);
    this.adds = this.adds.filter((a) => !a.removed && !a.dead);
    this.hazards = this.hazards.filter((h) => !h.removed);
    this.hurtAnim = Math.max(0, this.hurtAnim - dt);
    for (const k in this.timers) this.timers[k] -= this.state === 'chase' ? dt : dt * 0.5;
    for (const p of this.pending) { p.t -= dt; if (p.t <= 0) p.fn(); }
    this.pending = this.pending.filter((p) => p.t > 0);
    this.#frameEvents(world);
    for (const g of this.ghosts) g.t += dt;
    this.ghosts = this.ghosts.filter((g) => g.t < 0.32);
    this.#checkPhase(world);
    this.#ambient(dt, world);
    const spd = this.def.speed * [1, 1.12, 1.3][this.phase - 1];

    switch (this.state) {
      case 'sleep':
        this.vx = this.vy = 0;
        if (Math.random() < dt * 3) world.particles.embers(this.x + rand(-10, 10), this.y - rand(8, 30), 1);
        break;

      case 'intro':
        this.vx = this.vy = 0;
        if (this.stateTime < 1.2 && Math.random() < dt * 40) world.particles.embers(this.x + rand(-18, 18), this.y - rand(0, 40), 1);
        if (this.stateTime > 1.85) { this.hurtable = true; this.setState('chase'); }
        break;

      case 'roar':
        this.vx *= 0.7; this.vy *= 0.7;
        if (Math.random() < dt * 50) world.particles.element(this.x + rand(-20, 20), this.y - rand(10, 60), 'fire', 1, 4);
        if (this.stateTime > 1.5) { this.hurtable = true; this.cooldown = 0.4; this.setState('chase'); }
        break;

      case 'chase': {
        if (hero.dead) { this.vx *= 0.8; this.vy *= 0.8; this.animator.play('idle'); break; }
        this.cooldown -= dt;
        let mx = dx / (dist || 1), my = dy / (dist || 1);
        if (!world.dungeon.lineOfSight(this.x, this.y - 2, hero.x, hero.y - 2)) {
          const f = world.flow.direction(this.x, this.y - 2);
          if (f) { mx = f.x; my = f.y; }
        }
        const want = dist > 40 ? spd : 0;
        const k = 1 - Math.exp(-dt * 5);
        this.vx += (mx * want - this.vx) * k;
        this.vy += (my * want - this.vy) * k;
        if (Math.abs(dx) > 3) this.facing = Math.sign(dx);
        this.animator.play(this.hurtAnim > 0 ? 'hurt' : want > 1 ? 'walk' : 'idle');
        // Phase 3: glühende Fußspuren
        if (this.enraged && this.timers.patch <= 0 && want > 1) {
          this.timers.patch = 1.3;
          if (this.hazards.filter((h) => h.patch).length < 9) {
            const f = this.#addHazard(world, new FireField(this.x, this.y, this, { r: 13, duration: 7, damage: 16, delay: 0.3 }));
            f.patch = true;
          }
        }
        if (this.cooldown <= 0) this.#chooseAttack(world, dist);
        break;
      }

      case 'cleaveWindup':
        this.vx *= 0.8; this.vy *= 0.8;
        if (this.stateTime < this.windup * 0.5) {
          this.#track(world, dt, 5);
          if (this.cleaveTele && !this.cleaveTele.removed) this.cleaveTele.angle = this.aim; // Warnbogen folgt
        }
        if (this.stateTime >= this.windup) this.#cleave(world);
        break;

      case 'slamWindup':
        this.vx *= 0.8; this.vy *= 0.8;
        if (Math.random() < dt * 20) { const t = this.#meta('tip'); world.particles.embers(t.x, t.y, 1); }
        if (this.stateTime >= this.windup) this.#slam(world);
        break;

      case 'breathWindup': {
        this.vx *= 0.8; this.vy *= 0.8;
        this.#track(world, dt, 3, true);
        const m = this.#meta('mouth');
        if (Math.random() < dt * 30) world.particles.embers(m.x, m.y, 1);
        if (this.breathTele) this.breathTele.angle = this.aim;
        if (this.stateTime >= this.windup) this.#startBreath(world);
        break;
      }

      case 'breath':
        this.vx *= 0.8; this.vy *= 0.8;
        this.#breathTick(dt, world);
        break;

      case 'castWindup':
        this.vx *= 0.8; this.vy *= 0.8;
        if (Math.random() < dt * 40) { const c = this.#meta('cast'); world.particles.element(c.x, c.y, 'fire', 1, 3); }
        if (this.stateTime >= this.windup) this.#release(world);
        break;

      case 'chargeWindup':
        this.vx *= 0.7; this.vy *= 0.7;
        if (Math.random() < dt * 25) world.particles.dust(this.x - this.facing * 12, this.y, 1, '#4a2e24');
        if (Math.random() < dt * 20) world.particles.embers(this.x - this.facing * 10, this.y - 4, 1);
        if (this.stateTime >= this.windup) {
          this.setState('charge');
          this.animator.play('charge', true);
          this.chargeDrop = 0;
          world.combat.add({ owner: this, team: 'enemy', shape: 'circle', follow: true, offX: 0, offY: -16, x: this.x, y: this.y, r: 17, damage: 120, knockback: 300, heavy: true, ttl: 1.1 });
          world.bus.emit('bossCharge', { actor: this });
        }
        break;

      case 'charge': {
        const sp = 290;
        this.vx = Math.cos(this.aim) * sp; this.vy = Math.sin(this.aim) * sp;
        if (Math.random() < 0.7) world.particles.dust(this.x, this.y, 1, '#4a2e24');
        if (Math.random() < 0.8) world.particles.embers(this.x - Math.cos(this.aim) * 8, this.y - rand(4, 30), 1);
        if (this.stateTime % 0.08 < dt) this.ghosts.push({ frame: this.animator.frame, x: this.x, y: this.y, flip: this.facing < 0, t: 0 });
        if (Math.random() < 0.5) { const m = this.#meta('tip'); world.particles.sparks(m.x, m.y, this.aim + Math.PI, 1, FIRE); }
        // Phase 3: brennende Bahn
        this.chargeDrop += sp * dt;
        if (this.enraged && this.chargeDrop > 22) {
          this.chargeDrop = 0;
          this.#addHazard(world, new FireField(this.x, this.y, this, { r: 12, duration: 3.5, damage: 16, delay: 0.25 }));
        }
        const res = this.integrate(dt, world);
        if (res.hitX || res.hitY || this.stateTime > 1.1) {
          world.combat.hitboxes = world.combat.hitboxes.filter((h) => h.owner !== this);
          if (res.hitX || res.hitY) {
            world.session.camera?.shake(10);
            world.session.hitstop?.(0.14);
            const ix = this.x + Math.cos(this.aim) * 12;
            world.decals.stamp(crackDecal ??= createSlamCrack(), ix, this.y);
            world.decals.scorch(ix, this.y, 14);
            world.particles.bones(ix, this.y, 20, this.aim + Math.PI, 18, ['#18121e', '#261d2e', '#382a42', '#5a1206']);
            world.particles.element(ix, this.y - 12, 'fire', 18, 8);
            world.particles.dust(ix, this.y, 14, '#4a2e24');
            world.addLight(new Light({ x: ix, y: this.y - 10, radius: 110, color: FIRE_RGB, intensity: 1, ttl: 0.35, bloom: 0.6 }));
            world.bus.emit('bossImpact', { x: this.x, y: this.y });
            world.bus.emit('spellImpact', { x: ix, y: this.y, element: 'fire', radius: 30, big: false });
          }
          this.vx = this.vy = 0;
          this.setState('stagger');
          this.animator.play('stagger', true);
        }
        return;
      }

      case 'strike':
        this.vx *= 0.8; this.vy *= 0.8;
        if (this.stateTime >= this.recover) this.setState('chase');
        break;

      case 'stagger':
        this.vx *= 0.7; this.vy *= 0.7;
        if (Math.random() < dt * 8) world.particles.embers(this.x + rand(-8, 8), this.y - rand(30, 60), 1);
        if (this.stateTime >= 1.7) { this.cooldown = 0.5; this.setState('chase'); }
        break;

      case 'dead':
        this.vx *= 0.85; this.vy *= 0.85;
        if (this.stateTime < 3 && Math.random() < 0.6) world.particles.embers(this.x + rand(-24, 24), this.y - rand(0, 20), 1);
        if (this.stateTime < 1.8 && Math.random() < 0.3) world.particles.element(this.x + rand(-10, 10), this.y - rand(10, 50), 'fire', 1, 4);
        break;
    }
    this.integrate(dt, world);
  }

  // ------------------------------------------------------------ Phasen

  #checkPhase(world) {
    if (this.dead || !this.engaged || this.state === 'intro') return;
    const f = this.hp / this.maxHp;
    if (this.phase === 1 && f <= 0.66) {
      this.phase = 2;
      this.#banner(world, 'Ignaroth entfacht die Schmiede', 'Seine Diener steigen aus der Glut');
      this.#roar(world);
      this.#summon(world, ['fire_imp', 'fire_imp', 'magma_hound']);
      this.timers.summon = 24; this.timers.charge = 3;
      world.bus.emit('bossPhase', { bossId: this.bossId, phase: 2 });
    } else if (this.phase === 2 && f <= 0.33) {
      this.phase = 3;
      this.#banner(world, 'Die Rüstung des Tyrannen zerbricht', 'Reines Feuer – weiche den Glutflecken aus');
      this.#roar(world);
      this.#summon(world, ['magma_hound', 'fire_imp', 'magma_hound', 'fire_imp']);
      this.timers.summon = 26; this.timers.charge = 1.5; this.timers.meteor = 2;
      if (this.coreLight) { this.coreLight.color = [255, 200, 140]; this.coreLight.intensity = 0.8; this.coreLight.radius = 110; }
      world.bus.emit('bossPhase', { bossId: this.bossId, phase: 3 });
    }
  }

  #banner(world, title, sub) {
    // wie bossBanner, aber in Glutfarbe
    world.bus.emit(EV.UI_BANNER, { title, sub, color: '#ff9a4a' });
  }

  // Phasenwechsel: unverwundbares Brüllen mit Druckwelle
  #roar(world) {
    world.combat.hitboxes = world.combat.hitboxes.filter((h) => h.owner !== this);
    this.breathTele && (this.breathTele.removed = true);
    this.hurtable = false;
    this.setState('roar');
    this.animator.play('roar', true);
    world.session.slowmo?.(0.45, 0.6);
    this.pending.push({ t: 0.35, fn: () => {
      // Phasenwechsel schadlos (wie bei Varkhul): Welle nur sichtbar, das Brüllen stößt zurück
      world.addEffect(new DamageWave(this.x, this.y, this, { maxR: 150, duration: 0.9, damage: 0, harmless: true, color: [255, 130, 50] }));
      world.particles.ring(this.x, this.y, 14, 40, this.enraged ? WHITE_FIRE : FIRE, 160);
    } });
  }

  // ------------------------------------------------------------ Angriffswahl

  #chooseAttack(world, dist) {
    const hero = world.hero;
    this.aim = Math.atan2(hero.y - this.y, hero.x - this.x);
    const T = this.timers, P = this.phase;
    if (P >= 2 && T.summon <= 0 && this.adds.length < 3) {
      T.summon = rand(22, 28);
      return this.#beginCast(world, 'summon');
    }
    const opts = [];
    const add = (id, w) => { if (w > 0) opts.push([id, id === this.last ? w * 0.25 : w]); };
    if (dist < 60) { add('cleave', 3); add('slam', 2); if (T.breath <= 0) add('breath', 1); if (T.pillars <= 0) add('pillars', 1.5); }
    else if (dist < 140) {
      if (T.breath <= 0) add('breath', 3);
      if (dist < 95) add('slam', 1.2);
      if (T.pillars <= 0) add('pillars', 2);
      if (T.meteor <= 0) add('meteor', 2);
      if (P >= 2 && T.charge <= 0 && dist > 70) add('charge', 2.5);
    } else {
      if (T.meteor <= 0) add('meteor', 3);
      if (P >= 2 && T.charge <= 0) add('charge', 3);
    }
    if (!opts.length) { this.cooldown = 0.35; return; } // weiter annähern
    let r = Math.random() * opts.reduce((s, o) => s + o[1], 0), pick = opts[0][0];
    for (const [id, w] of opts) { r -= w; if (r <= 0) { pick = id; break; } }
    this.last = pick;
    const q = this.quick;
    switch (pick) {
      case 'cleave': {
        const w = 0.85 * q;
        this.cleaveTele = world.spawn(new Telegraph(this.x, this.y - 4, { shape: 'arc', r: 62, angle: this.aim, arc: 2.4, duration: w, follow: this }));
        return this.#begin(world, 'cleaveWindup', 'cleaveWindup', w);
      }
      case 'slam': {
        const w = 1.05 * q;
        const ix = this.x + Math.cos(this.aim) * 26, iy = this.y + Math.sin(this.aim) * 16 + 2;
        this.facing = Math.cos(this.aim) >= 0 ? 1 : -1;
        this.impact = { x: ix, y: iy };
        world.spawn(new Telegraph(ix, iy, { shape: 'circle', r: 48, duration: w }));
        if (P >= 2) world.spawn(new Telegraph(ix, iy, { shape: 'circle', r: 150, duration: w, color: [255, 150, 60] }));
        return this.#begin(world, 'slamWindup', 'slamWindup', w);
      }
      case 'breath': {
        T.breath = rand(6, 8) * q;
        const w = 0.9 * q;
        this.aim = Math.atan2((hero.y - this.y) / 0.6, hero.x - this.x); // Kegelwinkel im Ellipsenraum (wie Telegraph)
        this.breathTele = world.spawn(new Telegraph(this.x, this.y - 2, { shape: 'arc', r: 112, angle: this.aim, arc: 0.85, duration: w, follow: this, color: [255, 120, 40] }));
        return this.#begin(world, 'breathWindup', 'breathWindup', w);
      }
      case 'meteor': T.meteor = rand(9, 12) * q; return this.#beginCast(world, 'meteor');
      case 'pillars': T.pillars = rand(8, 11) * q; return this.#beginCast(world, 'pillars');
      case 'charge': {
        T.charge = rand(7, 10) * q;
        const w = 1.0 * q;
        const len = this.#rayLength(world, this.aim);
        this.facing = Math.cos(this.aim) >= 0 ? 1 : -1;
        world.spawn(new Telegraph(this.x, this.y, { shape: 'line', screen: true, angle: this.aim, len, width: 40, duration: w }));
        return this.#begin(world, 'chargeWindup', 'chargeWindup', w);
      }
    }
  }

  #begin(world, state, anim, windup) {
    this.setState(state);
    this.animator.play(anim, true);
    this.windup = windup;
    world.bus.emit('telegraph', { actor: this, attack: state });
  }

  #beginCast(world, kind) {
    this.castKind = kind;
    this.#begin(world, 'castWindup', 'cast', 0.9 * this.quick);
    world.bus.emit('cast', { actor: this, element: 'fire' });
  }

  // Blick (aim) dem Helden nachführen, höchstens rate rad/s
  // ell: Winkel im Ellipsenraum (für Kegel, die wie die Bodenwarnung geprüft werden)
  #track(world, dt, rate, ell = false) {
    const h = world.hero;
    const want = Math.atan2((h.y - this.y) / (ell ? 0.6 : 1), h.x - this.x);
    const d = angleDiff(this.aim, want);
    this.aim += Math.max(-rate * dt, Math.min(rate * dt, d));
    this.facing = Math.cos(this.aim) >= 0 ? 1 : -1;
  }

  // ------------------------------------------------------------ Angriffe

  #cleave(world) {
    this.setState('strike'); this.recover = this.enraged ? 0.5 : 0.75;
    this.animator.play('cleave', true);
    world.combat.add({ owner: this, team: 'enemy', shape: 'arc', follow: false, x: this.x, y: this.y - 10, r: 62, angle: this.aim, arc: 2.4, damage: 95, knockback: 260, heavy: true, ttl: 0.14 });
    this.kbx += Math.cos(this.aim) * 100; this.kby += Math.sin(this.aim) * 100;
    for (let i = 0; i < 9; i++) {
      const a = this.aim - 1.2 + i * 0.3;
      world.particles.sparks(this.x + Math.cos(a) * 46, this.y - 8 + Math.sin(a) * 28, a, 2, FIRE);
    }
    world.particles.dust(this.x + Math.cos(this.aim) * 24, this.y + Math.sin(this.aim) * 14, 8, '#4a2e24');
    world.session.camera?.shake(5);
    world.session.hitstop?.(0.05);
    world.addLight(new Light({ x: this.x + Math.cos(this.aim) * 30, y: this.y - 10, radius: 80, color: FIRE_RGB, intensity: 0.8, ttl: 0.25, bloom: 0.4 }));
    // Feuerspur: eine Linie in Schlagrichtung brennt nach – erst nach 0,65 s und mit eigener
    // Warnung, damit man nach dem Hieb (und dem Rückstoß entlang der Spur) heraus kann
    const sl = screenLine(this.aim, 92), delay = 0.65;
    world.spawn(new Telegraph(this.x, this.y, { shape: 'line', angle: sl.angle, len: sl.len, width: 14, duration: delay, color: [255, 120, 40] }));
    this.#addHazard(world, new FireField(this.x, this.y, this, { line: true, angle: sl.angle, len: sl.len, width: 14, duration: this.enraged ? 3 : 2.2, damage: 21, delay }));
    world.bus.emit('enemySwing', { actor: this, heavy: true });
  }

  #slam(world) {
    this.setState('strike'); this.recover = this.enraged ? 0.6 : 0.9;
    this.animator.play('slam', true);
    const { x, y } = this.impact;
    world.combat.add({ owner: this, team: 'enemy', shape: 'circle', follow: false, x, y: y - 6, lift: 6, r: 48, damage: 110, knockback: 240, heavy: true, ttl: 0.12 });
    world.particles.dust(x, y, 22, '#4a2e24');
    world.particles.bones(x, y, 4, -Math.PI / 2, 14, ['#18121e', '#261d2e', '#382a42', '#5a1206']);
    world.particles.ring(x, y, 8, 30, FIRE, 130);
    world.particles.element(x, y - 4, 'fire', 24, 12);
    world.decals.scorch(x, y, 20);
    world.decals.stamp(crackDecal ??= createSlamCrack(), x, y);
    world.session.hitstop?.(0.1);
    world.session.camera?.shake(11);
    world.addLight(new Light({ x, y, radius: 120, color: FIRE_RGB, intensity: 1.2, ttl: 0.4, bloom: 0.8 }));
    if (this.phase >= 2) world.addEffect(new DamageWave(x, y, this, { maxR: 150, duration: 0.95, damage: 55, color: [255, 120, 40] }));
    if (this.phase >= 3) this.pending.push({ t: 0.45, fn: () => { if (!this.dead) world.addEffect(new DamageWave(x, y, this, { maxR: 170, duration: 1.0, damage: 45, color: [255, 220, 150] })); } });
    world.bus.emit('spellImpact', { x, y, element: 'fire', radius: 48, big: true });
    world.bus.emit('bossSlam', { x, y });
  }

  #startBreath(world) {
    this.setState('breath');
    this.animator.play('breath', true);
    this.breathDur = [2.4, 2.7, 3.1][this.phase - 1];
    this.breathTick = 0;
    this.breathTele && (this.breathTele.removed = true);
    this.breathTele = world.spawn(new Telegraph(this.x, this.y - 2, { shape: 'arc', r: 112, angle: this.aim, arc: 0.85, duration: this.breathDur, follow: this, color: [255, 150, 60] }));
    this.breathLight = world.addLight(new Light({ x: this.x, y: this.y, radius: 90, color: FIRE_RGB, intensity: 0.9, flicker: 0.3, ttl: this.breathDur, bloom: 0.5 }));
    world.bus.emit('bossBreath', { actor: this, active: true });
    world.bus.emit('cast', { actor: this, element: 'fire' });
  }

  #breathTick(dt, world) {
    this.#track(world, dt, [0.5, 0.65, 0.85][this.phase - 1], true);
    if (this.breathTele) this.breathTele.angle = this.aim;
    const m = this.#meta('mouth');
    const ca = Math.cos(this.aim), sa = Math.sin(this.aim);
    if (this.breathLight) { this.breathLight.x = this.x + ca * 55; this.breathLight.y = this.y + sa * 33; }
    // Flammenstrom: Partikel vom Maul in Blickrichtung (Höhe z sinkt zum Boden)
    const z0 = this.y - m.y;
    for (let i = 0; i < 3; i++) {
      const a = this.aim + rand(-0.33, 0.33), s = rand(150, 230);
      world.particles.spawn({
        x: m.x, y: this.y, z: z0, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: -z0 * 1.2, gravity: 0,
        life: rand(0.45, 0.62), colors: this.enraged ? WHITE_FIRE : FIRE, emissive: true, size: Math.random() < 0.4 ? 2 : 1, drag: 1.6, rise: 6,
      });
    }
    if (Math.random() < dt * 6) world.decals.scorch(this.x + ca * rand(30, 100), this.y + sa * rand(18, 60), 6);
    this.breathTick -= dt;
    if (this.breathTick <= 0) {
      this.breathTick = 0.28;
      world.combat.add({ owner: this, team: 'enemy', shape: 'arc', follow: false, x: this.x, y: this.y - 8, r: 110, angle: this.aim, arc: 0.8, damage: 30, knockback: 50, heavy: false, ttl: 0.08 });
    }
    if (this.stateTime >= this.breathDur) {
      this.breathTele && (this.breathTele.removed = true);
      this.breathTele = null;
      if (this.breathLight) this.breathLight.dead = true;
      world.bus.emit('bossBreath', { actor: this, active: false });
      this.setState('strike'); this.recover = 0.5;
      this.animator.play('idle', true);
    }
  }

  #release(world) {
    this.setState('strike'); this.recover = 0.55;
    const kind = this.castKind;
    const c = this.#meta('cast');
    world.addLight(new Light({ x: c.x, y: c.y, radius: 90, color: FIRE_RGB, intensity: 1, ttl: 0.4, bloom: 0.7 }));
    world.particles.element(c.x, c.y, 'fire', 16, 5);
    if (kind === 'summon') {
      const types = this.phase >= 3 ? ['magma_hound', 'fire_imp', 'fire_imp'] : ['fire_imp', 'magma_hound'];
      this.#summon(world, types);
      return;
    }
    if (kind === 'meteor') {
      const h = world.hero;
      const n = [5, 6, 8][this.phase - 1];
      for (let i = 0; i < n; i++) {
        let tx, ty;
        if (i === 0) { tx = h.x + h.vx * 0.5; ty = h.y + h.vy * 0.5; }
        else {
          const a = rand(0, Math.PI * 2), r = rand(30, 130);
          tx = (i % 2 ? h.x : this.home.x) + Math.cos(a) * r; ty = (i % 2 ? h.y : this.home.y) + Math.sin(a) * r * 0.65;
        }
        const A = world.arena;
        if (A) { tx = Math.max(A.x0 + 16, Math.min(A.x1 - 16, tx)); ty = Math.max(A.y0 + 12, Math.min(A.y1 - 10, ty)); }
        const p = world.dungeon.nearestFree(tx, ty);
        const delay = 1.15 + i * 0.16 + rand(0, 0.15);
        world.spawn(new Telegraph(p.x, p.y, { shape: 'circle', r: 24, duration: delay, color: [255, 110, 40] }));
        this.#addHazard(world, new Meteor(p.x, p.y, this, { delay, damage: 85, r: 24, big: i === 0 }));
      }
      world.bus.emit('bossMeteors', { bossId: this.bossId, count: n });
      return;
    }
    if (kind === 'pillars') {
      const h = world.hero;
      const toHero = Math.atan2((h.y - this.y) / 0.6, h.x - this.x);
      // Lücke nie direkt beim Helden – er muss laufen oder rollen
      const gap = toHero + Math.PI * rand(0.5, 1.5);
      this.#addHazard(world, new FlameRing(this.x, this.y, this, { gap, gapWidth: 0.75, delay: 0.8 * this.quick, damage: 70, maxR: 175 }));
      if (this.phase >= 2) this.#addHazard(world, new FlameRing(this.x, this.y, this, { gap: gap + Math.PI * rand(0.6, 1.4), gapWidth: 0.7, delay: 0.8 * this.quick + (this.enraged ? 0.9 : 1.2), damage: 70, maxR: 175 }));
      world.bus.emit('bossPillars', { bossId: this.bossId });
    }
  }

  #summon(world, types) {
    this.adds = this.adds.filter((a) => !a.removed && !a.dead);
    const n = Math.max(0, Math.min(types.length, 3 - this.adds.length)); // höchstens 3 Diener gleichzeitig
    for (let i = 0; i < n; i++) {
      let type = types[i];
      if (!world.assets.sprites[type]?.idle) type = 'skeleton';
      const a = (i / n) * Math.PI * 2 + rand(-0.4, 0.4);
      const p = world.dungeon.nearestFree(this.home.x + Math.cos(a) * 75, this.home.y + Math.sin(a) * 48);
      const e = world.spawnEnemy(type, p.x, p.y, { respawned: true, home: { ...this.home } });
      e.aggroed = true; e.summoned = true; e.xpOverride = 20;
      this.adds.push(e);
      world.particles.element(p.x, p.y, 'fire', 16, 10);
      world.addLight(new Light({ x: p.x, y: p.y, radius: 40, color: FIRE_RGB, intensity: 0.8, ttl: 0.6, bloom: 0.3 }));
    }
    if (n > 0) world.bus.emit('bossSummon', { bossId: this.bossId, count: n });
  }

  #addHazard(world, h) {
    world.spawn(h);
    this.hazards.push(h);
    return h;
  }

  #rayLength(world, ang) {
    let len = 0;
    const T = 16;
    while (len < 320) {
      const x = this.x + Math.cos(ang) * (len + 14), y = this.y + Math.sin(ang) * (len + 14);
      if (world.dungeon.isWall(Math.floor(x / T), Math.floor((y - 4) / T))) break;
      len += 6;
    }
    return len + 10;
  }

  // Position eines Rig-Punkts (head, hand, tip, chest, eye, mouth, cast) in Weltkoordinaten
  #meta(key) {
    const m = this.animator.frame.meta?.[key] ?? { dx: 0, dy: -55 };
    return { x: this.x + m.dx * this.facing, y: this.y + m.dy };
  }

  #ambient(dt, world) {
    if (this.state === 'sleep' || this.dead) return;
    const rate = [3, 5, 12][this.phase - 1];
    if (Math.random() < dt * rate) world.particles.embers(this.x + rand(-18, 18), this.y - rand(12, 62), 1);
    if (this.enraged && Math.random() < dt * 10) {
      const c = this.#meta('chest');
      world.particles.spawn({ x: c.x + rand(-3, 3), y: c.y, vx: rand(-8, 8), vy: 0, rise: rand(20, 40), wobble: 20, life: rand(0.3, 0.6), colors: WHITE_FIRE, emissive: true });
    }
  }

  #frameEvents(world) {
    const f = this.animator.frame;
    if (f === this.lastFrame) return;
    this.lastFrame = f;
    if (f.fx === 'step') {
      world.particles.dust(this.x + rand(-8, 8), this.y, 5, '#4a2e24');
      if (this.phase >= 2) world.particles.embers(this.x + rand(-6, 6), this.y, 2);
      world.session.camera?.shake(this.state === 'charge' ? 2.5 : 1.5);
      world.bus.emit('bossStep', { x: this.x, y: this.y });
    } else if (f.fx === 'roar') {
      world.session.camera?.shake(9);
      const h = this.#meta('head');
      world.particles.ring(h.x, h.y + 8, 12, 40, this.enraged ? WHITE_FIRE : FIRE, 130);
      world.addLight(new Light({ x: h.x, y: h.y, radius: 160, color: this.enraged ? [255, 210, 150] : FIRE_RGB, intensity: 1.1, ttl: 0.55, bloom: 0.8 }));
      world.bus.emit('bossRoar', { bossId: this.bossId, x: this.x, y: this.y });
      const hero = world.hero, dx = hero.x - this.x, dy = hero.y - this.y, d = Math.hypot(dx, dy) || 1;
      if (!hero.dead && d < 120) { hero.kbx += (dx / d) * 280; hero.kby += (dy / d) * 280; }
    } else if (f.fx === 'cast') {
      const c = this.#meta('cast');
      world.particles.ring(c.x, c.y, 4, 14, FIRE, 60);
    } else if (f.fx === 'impact' && this.dead) {
      world.session.camera?.shake(7);
      world.particles.dust(this.x, this.y, 18, '#4a2e24');
      world.particles.element(this.x, this.y - 6, 'fire', 16, 14);
    }
  }

  onHurt(hit) {
    if (this.state === 'sleep') return;
    if (this.state === 'chase' && hit?.heavy && Math.random() < 0.3) this.hurtAnim = 0.25;
    this.world?.bus.emit('bossHurt', { actor: this });
  }

  die(hit) {
    super.die(hit);
    this.hurtable = false;
    this.setState('dead');
    this.animator.play('death', true);
    const w = this.world;
    if (!w) return;
    for (const a of this.adds) if (!a.dead) a.takeHit({ damage: 99999, dirX: 0, dirY: 1, knockback: 0, source: this });
    for (const h of this.hazards) h.removed = true;
    this.hazards = []; this.pending = [];
    if (this.breathTele) this.breathTele.removed = true;
    if (this.breathLight) this.breathLight.dead = true;
    w.combat.hitboxes = w.combat.hitboxes.filter((h) => h.owner.team !== 'enemy');
    w.projectiles.forEach((p) => { if (p.owner === this) p.removed = true; });
    w.session.slowmo?.(0.3, 1.8);
    w.session.camera?.shake(10);
    if (this.coreLight) this.coreLight.dead = true;
    // Der Kern birst: Lichtblitz, Glutfontäne, Lavalache
    w.addLight(new Light({ x: this.x, y: this.y - 38, radius: 200, color: [255, 190, 120], intensity: 1.4, ttl: 1.4, bloom: 1 }));
    w.addLight(new Light({ x: this.x, y: this.y - 4, radius: 70, color: FIRE_RGB, intensity: 0.7, flicker: 0.3, ttl: 8, bloom: 0.3 }));
    for (let i = 0; i < 50; i++) w.particles.embers(this.x + rand(-20, 20), this.y - rand(12, 75), 1);
    w.particles.ring(this.x, this.y - 38, 10, 48, WHITE_FIRE, 170);
    w.decals.scorch(this.x, this.y, 30);
    w.bus.emit('spellImpact', { x: this.x, y: this.y - 25, element: 'fire', radius: 70, big: true });
  }

  // Flammenstrahl aus dem Maul: vom Maul schräg zum Boden, fächert auf, flackert
  #drawBreath(ctx, cx, cy) {
    const m = this.#meta('mouth');
    const ca = Math.cos(this.aim), sa = Math.sin(this.aim);
    const grow = Math.min(1, this.stateTime * 6), fade = Math.min(1, (this.breathDur - this.stateTime) * 4);
    const L = 112 * grow;
    const ex = this.x + ca * L, ey = this.y + sa * L * 0.6;
    let nx = -sa * 0.6, ny = ca; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    const cols = this.enraged ? ['#ffffff', '#fff4c8', '#ffc048', '#ff6a14', '#8a2a08'] : ['#fff0b0', '#ffb640', '#f07a1c', '#c8420c', '#7a2208'];
    const t = Math.floor(this.stateTime * 20);
    for (let s = 0; s <= L; s += 1.5) {
      const k = s / 112;
      const kk = Math.min(1, s / (L || 1));
      // Mittellinie: Maul -> Boden, leicht durchhängend
      const x = m.x + (ex - m.x) * kk, y = m.y + (ey - m.y) * kk + Math.sin(kk * Math.PI) * 4;
      const w = 2 + k * 36;
      for (let j = -w; j <= w; j += 1.4) {
        const e = Math.abs(j) / w;
        const h = ((Math.round(s * 3.1) * 73856093) ^ (Math.round(j * 5) * 19349663) ^ (t * 83492791)) >>> 0;
        const rnd = (h % 1000) / 1000;
        if (rnd < e * e * 0.95 + k * 0.3) continue;
        const ci = Math.min(4, Math.floor(e * 2.2 + k * 2.2 + rnd * 0.8));
        ctx.globalAlpha = (0.95 - k * 0.35) * fade;
        ctx.fillStyle = cols[ci];
        ctx.fillRect(Math.round(x + nx * j - cx), Math.round(y + ny * j * 0.6 - cy), k > 0.5 && rnd > 0.8 ? 2 : 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  #glowFrame() {
    const f = this.animator.frame;
    return this.enraged ? f.glowEnraged : f.glow;
  }

  renderEmissive(ctx, cx, cy) {
    for (const g of this.ghosts) {
      const k = 1 - g.t / 0.32;
      g.frame.draw(ctx, g.x - cx, g.y - cy, { flip: g.flip, flash: true, alpha: 0.1 * k });
      const gl = this.enraged ? g.frame.glowEnraged : g.frame.glow;
      gl?.draw(ctx, g.x - cx, g.y - cy, { flip: g.flip, alpha: 0.5 * k });
    }
    super.renderEmissive(ctx, cx, cy);
    const glow = this.#glowFrame();
    if (!glow) return;
    const fade = this.dead ? Math.max(0, 1 - Math.max(0, this.stateTime - 1.5) * 0.25) : 1;
    if (fade <= 0) return;
    const heat = this.state === 'breath' || this.state === 'roar' ? 1 : 0.82 + 0.18 * Math.sin(this.stateTime * 5);
    glow.draw(ctx, this.x - cx, this.y - cy, { flip: this.facing < 0, alpha: (this.state === 'sleep' ? 0.55 : heat) * fade });
    // Glanz an der Axt kurz vor dem Schlag
    if (/Windup$/.test(this.state) && this.state !== 'breathWindup' && this.stateTime > this.windup * 0.6) {
      const t = this.#meta('tip'), k = (this.stateTime - this.windup * 0.6) / (this.windup * 0.4);
      const r = Math.round(2 + k * 5), x = Math.round(t.x - cx), y = Math.round(t.y - cy);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - r, y, r * 2 + 1, 1); ctx.fillRect(x, y - r, 1, r * 2 + 1);
      ctx.fillStyle = this.enraged ? '#fff4c8' : '#ffb048';
      ctx.fillRect(x - 1, y - 1, 3, 3);
    }
    if (this.state === 'breath') this.#drawBreath(ctx, cx, cy);
    // Maulglut vor dem Feuerstoß
    if (this.state === 'breathWindup' || this.state === 'breath') {
      const m = this.#meta('mouth');
      const r = this.state === 'breath' ? 3 : Math.round(1 + (this.stateTime / this.windup) * 2);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = this.enraged ? '#fff4c8' : '#ffb048';
      ctx.fillRect(Math.round(m.x - cx - r / 2), Math.round(m.y - cy - r / 2), r, r);
      ctx.globalAlpha = 1;
    }
    // Benommen: kreisende Funken über dem Kopf
    if (this.state === 'stagger') {
      const h = this.#meta('head');
      ctx.fillStyle = '#ffe070';
      for (let i = 0; i < 3; i++) {
        const a = this.stateTime * 6 + (i * Math.PI * 2) / 3;
        ctx.fillRect(Math.round(h.x - cx + Math.cos(a) * 12), Math.round(h.y - cy - 8 + Math.sin(a) * 3), 2, 1);
      }
    }
  }
}

// ------------------------------------------------------------ Gefahrenflächen

function hurtHero(world, owner, damage, dirX, dirY, knockback, heavy = false, dot = false) {
  const h = world.hero;
  if (h.dead) return false;
  const hit = { damage: Math.round(damage * rand(0.9, 1.1)), dirX, dirY, knockback, source: owner, dot };
  if (!h.takeHit(hit)) return false;
  world.bus.emit('hit', { attacker: owner, target: h, damage: hit.damage, crit: false, heavy, dirX, dirY, x: h.x, y: h.centerY, killed: h.dead });
  return true;
}

// Brennender Boden (Kreis oder Linie). Schadet in Takten, solange man darin steht.
export class FireField extends Entity {
  constructor(x, y, owner, { r = 12, line = false, angle = 0, len = 80, width = 14, duration = 2, damage = 25, delay = 0, tick = 0.45 }) {
    super(x, y);
    Object.assign(this, { owner, r, line, angle, len, width, duration, damage, delay, tick });
    this.t = 0; this.cool = 0; this.sortOffset = -19500;
    this.seed = Math.random() * 100;
  }
  #inside(px, py) {
    if (!this.line) return Math.hypot(px - this.x, (py - this.y) / 0.6) < this.r;
    const dx = Math.cos(this.angle), dy = Math.sin(this.angle) * 0.75;
    const L = Math.hypot(dx, dy); const ux = dx / L, uy = dy / L;
    const rx = px - this.x, ry = py - this.y;
    const along = rx * ux + ry * uy, across = Math.abs(-rx * uy + ry * ux);
    return along > 0 && along < this.len * L && across < this.width / 2 + 2;
  }
  #point(k) {
    // Punkt auf der Fläche (für Partikel/Flammen): k in 0..1
    if (!this.line) { const a = k * 37.7 + this.seed, r = ((k * 7.3 + this.seed) % 1) * this.r; return [this.x + Math.cos(a) * r, this.y + Math.sin(a) * r * 0.6]; }
    const s = k * this.len;
    return [this.x + Math.cos(this.angle) * s, this.y + Math.sin(this.angle) * s * 0.75];
  }
  update(dt, world) {
    this.t += dt;
    if (this.t >= this.delay + this.duration) { this.removed = true; if (this.light) this.light.dead = true; return; }
    if (this.t < this.delay) return;
    if (!this.light) {
      const [lx, ly] = this.line ? this.#point(0.5) : [this.x, this.y];
      this.light = world.addLight(new Light({ x: lx, y: ly, radius: this.line ? this.len * 0.7 : this.r * 2.4, color: [255, 110, 40], intensity: 0.55, flicker: 0.35, ttl: this.duration, bloom: 0.15 }));
      if (this.line) for (let k = 0; k <= 1; k += 0.12) { const [x, y] = this.#point(k); world.decals.scorch(x, y, 6); }
      else world.decals.scorch(this.x, this.y, this.r * 0.8);
    }
    const n = this.line ? 14 : 5;
    if (Math.random() < dt * n) { const [x, y] = this.#point(Math.random()); world.particles.embers(x, y, 1); }
    this.cool -= dt;
    const h = world.hero;
    if (this.cool <= 0 && !h.dead && !this.owner?.dead && this.#inside(h.x, h.y)) {
      if (hurtHero(world, this.owner, this.damage, 0, -1, 30, false, true)) this.cool = this.tick; // Flächen-Tick (dot)
    }
  }
  renderEmissive(ctx, cx, cy) {
    if (this.t < this.delay) return;
    const life = this.t - this.delay, rem = this.duration - life;
    const fade = Math.min(1, life * 6, rem * 1.5);
    const n = this.line ? Math.round(this.len / 3) : Math.round(this.r * 1.6);
    const tt = this.t * 9;
    for (let i = 0; i < n; i++) {
      const k = i / n;
      let [x, y] = this.#point(k);
      if (this.line) { const off = (((i * 7919) % 11) / 11 - 0.5) * this.width * 0.8; x += -Math.sin(this.angle) * off; y += Math.cos(this.angle) * off * 0.6; }
      const fl = Math.sin(tt + i * 1.7 + this.seed) * 0.5 + 0.5;
      const hgt = Math.round((2 + fl * 5) * fade);
      const px = Math.round(x - cx), py = Math.round(y - cy);
      ctx.globalAlpha = 0.9 * fade;
      ctx.fillStyle = '#c8420c'; ctx.fillRect(px, py - hgt, 1, hgt);
      ctx.fillStyle = '#ffb640'; ctx.fillRect(px, py - Math.round(hgt * 0.6), 1, Math.max(1, Math.round(hgt * 0.4)));
      if (fl > 0.8) { ctx.fillStyle = '#fff0b0'; ctx.fillRect(px, py - 1, 1, 1); }
    }
    ctx.globalAlpha = 1;
  }
}

// Meteor: fällt nach der Warnzeit schräg vom Himmel und schlägt ein.
export class Meteor extends Entity {
  constructor(x, y, owner, { delay = 1.2, damage = 80, r = 24, big = false }) {
    super(x, y);
    Object.assign(this, { owner, delay, damage, r, big });
    this.t = 0; this.fall = 0.45; this.sortOffset = 4000;
  }
  update(dt, world) {
    this.t += dt;
    const k = (this.t - (this.delay - this.fall)) / this.fall;
    if (k > 0 && k < 1 && Math.random() < 0.8) {
      const [mx, my] = this.#pos(k);
      world.particles.spawn({ x: mx, y: my, vx: rand(-10, 10), vy: rand(-10, 10), rise: 4, life: rand(0.2, 0.4), colors: FIRE, emissive: true, size: 2, shrink: true });
    }
    if (this.t >= this.delay) {
      this.removed = true;
      const { x, y } = this;
      world.combat.add({ owner: this.owner, team: 'enemy', shape: 'circle', follow: false, x, y: y - 6, lift: 6, r: this.r, damage: this.damage, knockback: 200, heavy: true, ttl: 0.1 });
      world.particles.bones(x, y, 6, -Math.PI / 2, 10, ['#18121e', '#382a42', '#5a1206', '#8e2408']);
      world.particles.element(x, y - 4, 'fire', 22, 10);
      world.particles.ring(x, y, 6, 20, FIRE, 110);
      world.decals.scorch(x, y, 14);
      world.addLight(new Light({ x, y, radius: 100, color: [255, 140, 60], intensity: 1.1, ttl: 0.4, bloom: 0.7 }));
      world.session.camera?.shake(this.big ? 7 : 4);
      if (this.big) world.session.hitstop?.(0.05);
      world.bus.emit('spellImpact', { x, y, element: 'fire', radius: this.r, big: this.big });
      world.bus.emit('bossMeteor', { x, y });
    }
  }
  #pos(k) {
    const H = 170 * (1 - k);
    return [this.x - H * 0.45, this.y - H];
  }
  renderEmissive(ctx, cx, cy) {
    const k = (this.t - (this.delay - this.fall)) / this.fall;
    if (k <= 0 || k >= 1) return;
    const [mx, my] = this.#pos(k);
    const x = Math.round(mx - cx), y = Math.round(my - cy);
    // Schweif
    for (let i = 1; i < 14; i++) {
      ctx.globalAlpha = 0.8 * (1 - i / 14);
      ctx.fillStyle = i < 4 ? '#ffb640' : i < 8 ? '#f07a1c' : '#7a2208';
      ctx.fillRect(Math.round(x - i * 0.45 * 2), Math.round(y - i * 2), i < 5 ? 3 : 2, 2);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#382a42'; ctx.fillRect(x - 2, y - 2, 5, 5);
    ctx.fillStyle = '#fff0b0'; ctx.fillRect(x - 1, y - 1, 3, 3);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y - 1, 1, 1);
  }
}

// Ring aus Flammensäulen, der sich vom Boss nach außen ausbreitet – mit einer Lücke.
export class FlameRing extends Entity {
  constructor(x, y, owner, { gap = 0, gapWidth = 0.7, delay = 0.8, damage = 70, maxR = 170, speed = 105 }) {
    super(x, y);
    Object.assign(this, { owner, gap, gapWidth, delay, damage, maxR, speed });
    this.t = 0; this.hitDone = false; this.sortOffset = -19400;
  }
  get r() { return 18 + Math.max(0, this.t - this.delay) * this.speed; }
  inGap(a) { return Math.abs(angleDiff(this.gap, a)) < this.gapWidth / 2; }
  update(dt, world) {
    this.t += dt;
    if (this.t < this.delay) return;
    if (!this.started) {
      this.started = true;
      this.light = world.addLight(new Light({ follow: this, radius: 120, color: [255, 110, 40], intensity: 0.5, flicker: 0.3, bloom: 0.2 }));
      world.bus.emit('spellImpact', { x: this.x, y: this.y, element: 'fire', radius: 30, big: false });
    }
    const r = this.r;
    if (r > this.maxR) { this.removed = true; if (this.light) this.light.dead = true; return; }
    if (Math.random() < 0.9) {
      const a = Math.random() * Math.PI * 2;
      if (!this.inGap(a)) world.particles.embers(this.x + Math.cos(a) * r, this.y + Math.sin(a) * r * 0.6, 1);
    }
    const h = world.hero;
    if (this.hitDone || h.dead) return;
    const dx = h.x - this.x, dy = (h.y - this.y) / 0.6;
    const d = Math.hypot(dx, dy);
    if (Math.abs(d - r) < 8 && !this.inGap(Math.atan2(dy, dx))) {
      const l = d || 1;
      if (hurtHero(world, this.owner, this.damage, dx / l, dy / l, 170, true)) this.hitDone = true;
      else if (h.dodgedTimer > 0) this.hitDone = true;
    }
  }
  renderEmissive(ctx, cx, cy) {
    const world = this.owner.world;
    const T = 16;
    if (this.t < this.delay) {
      // Warnung: pulsierender Ring am Startradius, Lücke dunkel, Pfeil in die Lücke
      const k = this.t / this.delay;
      const n = 48, r0 = 18 + k * 10;
      ctx.fillStyle = '#ff6a28';
      ctx.globalAlpha = 0.5 + 0.4 * Math.sin(this.t * 24);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        if (this.inGap(a)) continue;
        ctx.fillRect(Math.round(this.x - cx + Math.cos(a) * r0), Math.round(this.y - cy + Math.sin(a) * r0 * 0.6), 2, 1);
      }
      ctx.fillStyle = '#ffe0a0';
      for (let s = 20; s < 60; s += 4) ctx.fillRect(Math.round(this.x - cx + Math.cos(this.gap) * s), Math.round(this.y - cy + Math.sin(this.gap) * s * 0.6), 1, 1);
      ctx.globalAlpha = 1;
      return;
    }
    const r = this.r;
    const n = Math.max(16, Math.round((r * Math.PI * 2 * 0.8) / 7));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      if (this.inGap(a)) continue;
      const x = this.x + Math.cos(a) * r, y = this.y + Math.sin(a) * r * 0.6;
      if (world && world.dungeon.isWall(Math.floor(x / T), Math.floor((y - 2) / T))) continue;
      const fl = Math.sin(this.t * 14 + i * 2.3) * 0.5 + 0.5;
      const hgt = Math.round(9 + fl * 9);
      const px = Math.round(x - cx), py = Math.round(y - cy);
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = '#7a2208'; ctx.fillRect(px - 1, py - hgt, 3, hgt);
      ctx.fillStyle = '#f07a1c'; ctx.fillRect(px - 1, py - Math.round(hgt * 0.8), 3, Math.round(hgt * 0.8));
      ctx.fillStyle = '#ffb640'; ctx.fillRect(px, py - Math.round(hgt * 0.7), 1, Math.round(hgt * 0.7));
      ctx.fillStyle = '#fff0b0'; ctx.fillRect(px, py - 3, 1, 3);
      if (fl > 0.7) { ctx.fillStyle = '#ffb640'; ctx.fillRect(px, py - hgt - 2, 1, 1); }
    }
    ctx.globalAlpha = 1;
  }
}
