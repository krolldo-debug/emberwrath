import { Actor } from './Actor.js';
import { angleDiff } from '../core/math.js';
import { SlashEffect, Afterimage } from './Effects.js';
import { SLASH_STYLES } from '../sprites/effects.js';
import { EV } from '../core/events.js';
import { ELEMENTS } from '../gfx/Particles.js';
import { Light } from '../gfx/Lighting.js';
import { heroRes } from '../sprites/hero.js';
import { getMountSprites } from '../sprites/mounts.js';
import { canMount, zoneMountable, noMountAt, MOUNT_CAST, MOUNT_REASON_TEXT } from '../character/mounts.js';
import { CONFIG } from '../config.js';
import { ABILITY_IMPL, fireProjectile, heroHitbox, applyPoison } from '../character/abilities.js';

// Konstanten, die für alle Klassen gleich sind (Klassenwerte: character/classes.js)
const H = {
  radius: 5,
  dodgeSpeed: 210, dodgeTime: 0.28, dodgeCooldown: 0.35,
  invulnAfterHit: 0.6,
  combatLinger: 3, // s nach dem letzten Treffer, bis Wut verfällt
};

// Der Spielerheld (Thread A). Klasse und Werte kommen aus createHero():
//   cls   = content 'class' (Grundangriff, Ressource, Fähigkeiten)
//   stats = computeStats() (Leben, Kraft, Rüstung, Krit, Tempo …)
// Zustände: move, attack (Nahkampf-Kombo oder Schuss), skill, roll, hurt, dead.
// Öffentlich für HUD/Touch: hp, maxHp, resource, maxResource, resourceType,
// resourceName, resourceColor, stamina, maxStamina, dead,
// abilities [{ id, name, icon, action, cooldown, cdLeft, cost, ready }], buffs.
// Reiten (§12.6): riding, mountId, mountCast { t, dur } | null (Wirkbalken zeichnet D), Events 'mountCast' (Start), 'footstep' { mount } beim Reiten.
// Der Zustand steht im Slice character.mounts; der Held folgt ihm und committet mount:toggle.
export class Hero extends Actor {
  constructor(x, y, { anims, cls, stats, abilities }) {
    super(x, y, anims);
    this.team = 'hero';
    this.cls = cls;
    this.classId = cls.id;
    this.radius = H.radius;
    this.hurtRadius = 6;
    this.bodyHeight = 18;
    this.shadowW = 14;
    this.mass = 1.4;
    this.material = 'flesh';
    this.state = 'move';
    this.combo = 0;
    this.attackBuffer = 0;
    this.dodgeBuffer = 0;
    this.skillBuffer = [0, 0, 0, 0];
    this.unbrokenCd = 0;
    this.healIcd = 0;
    this.dodgeCd = 0;
    this.aimAngle = 0;
    this.rollDir = { x: 1, y: 0 };
    this.stepTimer = 0;
    this.swingSpawned = false;
    this.ghostTimer = 0;
    this.combatTime = 99;
    this.failNoteTime = 0;
    this.buffs = [];
    this.skill = null;
    this.skillState = {};
    this.riding = false;
    this.mountId = null;
    this.mountCast = null;
    this.mountAnims = null;
    this.mountT = 0;
    this.mountFrame = null;
    this.rideOff = { x: 0, y: 0 };

    const res = cls.resource;
    this.resourceType = res.type;
    this.resourceName = res.name;
    this.resourceColor = res.color;
    this.abilities = abilities.map((a, i) => ({
      id: a.id, name: a.name, icon: a.icon, desc: a.desc, action: `skill${i + 1}`,
      cooldown: a.cooldown, cdLeft: 0, cost: a.cost ?? 0, ready: true, def: a,
      level: a.level ?? 1, locked: false,
    }));
    this.applyStats(stats, { fill: true });
    this.resource = Math.round(this.maxResource * (res.start ?? 1));
    this.stamina = this.maxStamina;
  }

  // Werte übernehmen (Stufenaufstieg, Ausrüstung). fill = voll heilen.
  applyStats(stats, { fill = false } = {}) {
    const ratio = this.maxHp > 0 && !fill ? this.hp / this.maxHp : 1;
    this.stats = stats;
    this.maxHp = stats.maxHp;
    if (!this.dead) this.hp = fill ? stats.maxHp : Math.max(1, Math.min(stats.maxHp, Math.round(stats.maxHp * ratio)));
    this.maxResource = stats.maxResource;
    this.resource = Math.min(this.resource ?? 0, this.maxResource);
    this.maxStamina = stats.maxStamina;
    this.stamina = Math.min(this.stamina ?? stats.maxStamina, stats.maxStamina);
    this.speed = stats.moveSpeed;
    this.level = stats.level;
    for (const a of this.abilities ?? []) {
      a.locked = stats.level < a.level;
      a.cooldown = Math.round(a.def.cooldown * (stats.cooldownMult ?? 1) * 10) / 10;
    }
  }

  // Schaden eines Angriffs mit Faktor mult (Fähigkeiten zusätzlich × abilityPower)
  // ability: false (Grundangriff), true oder Fähigkeits-ID (dann zählen auch Talentboni)
  damageFor(mult, ability = false) {
    let d = this.stats.power * mult;
    if (ability) d *= this.stats.abilityPower * (1 + (typeof ability === 'string' ? this.stats.abilityMods?.[ability] ?? 0 : 0));
    // Schattentanz: nächster Angriff nach dem Ausweichen
    const sd = this.buffs.find((b) => b.id === 'shadowdance');
    if (sd) { d *= 1.6; sd.time = Math.min(sd.time, 0.05); }
    return d;
  }

  gainResource(n) { this.resource = Math.min(this.maxResource, this.resource + n); }

  buff(id, duration, mods) {
    this.buffs = this.buffs.filter((b) => b.id !== id);
    this.buffs.push({ id, time: duration, duration, ...mods });
  }

  heal(amount, world) {
    if (this.dead || amount <= 0) return 0;
    const n = Math.min(Math.round(amount), this.maxHp - this.hp);
    this.hp += n;
    world?.bus.emit('heal', { actor: this, amount: n });
    return n;
  }

  // Treffer eines eigenen Angriffs (vom Charakter-System gemeldet) -> Wut
  // Treffer eines eigenen Angriffs (vom Charakter-System gemeldet): Wut, Passive, Gift.
  // e = 'hit'-Event (target, crit, heavy, dot) oder leer.
  onDealtHit(e = {}, world = null) {
    this.combatTime = 0;
    if (e.dot) return;
    const res = this.cls.resource;
    const onHit = this.stats.onHitResource ?? res.onHit ?? 0;
    if (onHit) this.gainResource(onHit);
    const P = this.stats.passives ?? {};
    const ms = this.stats.mastery ?? {};
    if (e.crit && P.opportunist) this.gainResource(6);
    if (e.crit && P.ember_soul) this.gainResource(5);
    if (e.crit && ms.critResource) this.gainResource(ms.critResource);
    if (e.heavy && P.bloodlust && this.healIcd <= 0) { this.healIcd = 0.3; this.heal(this.maxHp * (ms.bloodlustHeal ?? 0.03), world); }
    if (world && e.target && !e.target.dead && this.buffs.some((b) => b.id === 'poison')) applyPoison(this, world, e.target);
  }

  update(dt, world) {
    const input = world.input;
    this.tickTimers(dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.attackBuffer = Math.max(0, this.attackBuffer - dt);
    this.dodgeBuffer = Math.max(0, this.dodgeBuffer - dt);
    for (let i = 0; i < this.skillBuffer.length; i++) this.skillBuffer[i] = Math.max(0, this.skillBuffer[i] - dt);
    this.unbrokenCd = Math.max(0, this.unbrokenCd - dt);
    this.healIcd = Math.max(0, this.healIcd - dt);
    this.failNoteTime = Math.max(0, this.failNoteTime - dt);
    for (const a of this.abilities) { a.cdLeft = Math.max(0, a.cdLeft - dt); a.ready = a.cdLeft <= 0 && this.resource >= a.cost; }
    for (const b of this.buffs) b.time -= dt;
    this.buffs = this.buffs.filter((b) => b.time > 0);
    if (this.unbrokenNote) {
      this.unbrokenNote = false;
      world.bus.emit('aura', { actor: this, element: 'holy' });
      world.bus.emit(EV.UI_TOAST, { text: 'Unbeugsam! Du bleibst stehen.', kind: 'info' });
    }
    if (this.dead) { this.vx = this.vy = 0; this.integrate(dt, world); return; }

    // Ressourcen
    const res = this.cls.resource;
    this.combatTime += dt;
    if (res.type === 'rage') {
      if (this.combatTime > H.combatLinger) this.resource = Math.max(0, this.resource - (res.decay ?? 5) * dt);
    } else {
      this.resource = Math.min(this.maxResource, this.resource + this.stats.resourceRegen * dt);
    }
    if (this.state !== 'roll') this.stamina = Math.min(this.maxStamina, this.stamina + this.stats.staminaRegen * dt);

    if (input.pressed('attack')) this.attackBuffer = 0.2;
    if (input.pressed('dodge')) this.dodgeBuffer = 0.15;
    for (let i = 0; i < this.abilities.length; i++) if (input.pressed(this.abilities[i].action)) this.skillBuffer[i] = 0.2;

    const axis = input.axis();
    this.#updateMount(dt, world, input, axis);
    switch (this.state) {
      case 'move': this.#updateMove(dt, world, axis); break;
      case 'attack': this.#updateAttack(dt, world, axis); break;
      case 'skill': this.#updateSkill(dt, world); break;
      case 'roll': this.#updateRoll(dt, world); break;
      case 'hurt':
        this.vx *= 0.8; this.vy *= 0.8;
        if (this.stateTime > 0.22) this.setState('move');
        break;
    }
    this.integrate(dt, world);
    this.#updateRideFrame(dt);
    this.#weaponFx(dt, world);
    // Bildfeinheit geändert (Qualitätsstufe/Fenstergröße): Sprites in passender Auflösung neu holen
    const lr = heroRes();
    if (lr !== this.lookRes) { if (this.lookRes !== undefined) this.refreshLook?.(); this.lookRes = lr; }
  }

  // --- Reiten (§12.6) -------------------------------------------------------------------
  #mountSlice(world) { return world.session?.state?.slices?.character?.mounts ?? null; }

  #setMount(world, riding) {
    const r = world.session?.state?.commit?.('mount:toggle', { riding });
    if (r && r.ok === false && riding && r.error) world.bus.emit(EV.UI_TOAST, { text: r.error, kind: 'warn' });
    this.#syncMount(world);
    return r;
  }

  #syncMount(world) {
    const m = this.#mountSlice(world);
    const riding = !!(m?.riding && m.active), id = m?.active ?? null;
    if (riding === this.riding && id === this.mountId && (this.mountAnims || !riding)) return;
    this.riding = riding;
    this.mountId = id;
    const def = id ? world.session.content.find('mount', id) : null;
    this.mountDef = def;
    this.mountAnims = riding ? getMountSprites(id, def, heroRes()) : null;
    this.mountRes = heroRes();
    this.shadowW = riding ? 26 : 14;
    this.bodyHeight = riding ? 30 : 18;
    if (riding) { this.animator.play('ride', true); this.mountT = 0; }
    else if (this.state === 'move') this.animator.play('idle', true);
  }

  #updateMount(dt, world, input, axis) {
    this.worldRef = world;
    this.#syncMount(world);
    if (this.dead) return;
    if (this.riding && this.mountRes !== heroRes()) { this.mountAnims = getMountSprites(this.mountId, this.mountDef, heroRes()); this.mountRes = heroRes(); }
    const moving = Math.hypot(axis.x, axis.y) > 0.1;
    // Zone ohne Reiten (Dungeon, Prüfung) oder noMount-Fläche: absitzen
    if (this.riding && (!zoneMountable(world.zone) || noMountAt(world, this.x, this.y))) this.#setMount(world, false);
    if (input.pressed('mount')) {
      if (this.riding) this.#setMount(world, false);
      else if (this.mountCast) this.mountCast = null;
      else {
        const c = canMount(world.session.state.slices, world.session.content, this, world);
        if (!c.ok) world.bus.emit(EV.UI_TOAST, { text: MOUNT_REASON_TEXT[c.reason] ?? 'Du kannst gerade nicht aufsitzen', kind: 'warn' });
        else if (this.state !== 'move') { /* erst Angriff/Fähigkeit beenden */ }
        else if (moving) world.bus.emit(EV.UI_TOAST, { text: 'Bleib stehen, um aufzusitzen', kind: 'warn' });
        else { this.mountCast = { t: 0, dur: MOUNT_CAST }; world.bus.emit('mountCast', { actor: this, mountId: this.#mountSlice(world)?.active ?? null }); }
      }
    }
    if (this.mountCast) {
      const wants = this.attackBuffer > 0 || this.dodgeBuffer > 0 || this.skillBuffer.some((b) => b > 0);
      if (moving || wants || this.state !== 'move') {
        this.mountCast = null;
        world.bus.emit(EV.UI_TOAST, { text: 'Aufsitzen abgebrochen', kind: 'warn' });
      } else {
        this.mountCast.t += dt;
        this.vx *= 0.8; this.vy *= 0.8;
        if (this.mountCast.t >= this.mountCast.dur) {
          this.mountCast = null;
          const c = canMount(world.session.state.slices, world.session.content, this, world);
          if (c.ok) this.#setMount(world, true);
          else world.bus.emit(EV.UI_TOAST, { text: MOUNT_REASON_TEXT[c.reason] ?? '', kind: 'warn' });
        }
      }
    }
    if (!this.riding) return;
    // Beritten: Angriff, Fähigkeit oder Ausweichen sitzt nur ab (ohne die Aktion auszuführen)
    if (this.attackBuffer > 0 || this.dodgeBuffer > 0 || this.skillBuffer.some((b) => b > 0)) {
      this.attackBuffer = 0; this.dodgeBuffer = 0; this.skillBuffer.fill(0);
      this.#setMount(world, false);
    }
  }

  // Tempo-Faktor aus Buffs/Debuffs: hero.buff(id, dauer, { moveSpeed: 0.7 }) bremst auf 70 % (auch beritten, mehrere multiplizieren)
  get buffSpeed() { let m = 1; for (const b of this.buffs) if (typeof b.moveSpeed === 'number') m *= b.moveSpeed; return Math.max(0.1, m); }

  // Tempo-Bonus des Reittiers (zusätzlich zur Ausrüstungs-Obergrenze)
  get rideSpeed() { return this.riding ? 1 + (this.mountDef?.speed ?? 0.6) : 1; }

  // Reittier-Frame und Versatz des Reiters (Sattelpunkt minus Hüfte der Sitz-Pose)
  #updateRideFrame(dt) {
    if (!this.riding || !this.mountAnims) { this.mountFrame = null; this.rideOff = { x: 0, y: 0 }; return; }
    const walking = Math.hypot(this.vx, this.vy) > 12;
    const anim = walking ? this.mountAnims.walk : this.mountAnims.stand;
    this.mountT += dt * (walking ? Math.min(1.6, Math.hypot(this.vx, this.vy) / 150) : 1);
    this.mountFrame = anim.frameAt(this.mountT);
    const hip = this.currentFrame()?.hip ?? { x: 0, y: -10 };
    this.rideOff = { x: (this.mountFrame.seat.x - hip.x) * (this.facing < 0 ? -1 : 1), y: this.mountFrame.seat.y - hip.y };
  }

  // Seltenheits-Effekte der Waffe (Stufe aus character/gearLook.js, Achse aus frame.weapon):
  // episch = Funken/Flammen je Element + Licht, legendär = doppelt so dicht und heller.
  #weaponFx(dt, world) {
    const a = this.dead ? null : this.currentFrame()?.weapon;
    const tier = a?.tier ?? 0;
    const el = ELEMENTS[a?.fx] ?? ELEMENTS.arcane;
    if (tier >= 2 && world.addLight) {
      if (!this.weaponLight || this.weaponLight.dead) this.weaponLight = world.addLight(new Light({ follow: this, offsetY: -12, radius: 30, intensity: 0, flicker: 0.3, bloom: 0.15 }));
      const L = this.weaponLight;
      // Bogen liegt vor dem Körper: Licht und Funken gedämpft, sonst überstrahlt er die Figur
      const dim = a.arc ? 0.5 : 1;
      L.color = el.light; L.radius = (tier >= 3 ? 42 : 30) * (a.arc ? 0.75 : 1); L.intensity = (tier >= 3 ? 0.6 : 0.4) * dim;
      L.flicker = a.fx === 'fire' ? 0.35 : 0.15;
    } else if (this.weaponLight) this.weaponLight.intensity = 0;
    if (tier < 2 || !world.particles || this.state === 'roll') return;
    this.fxAcc = (this.fxAcc ?? 0) + dt * (tier >= 3 ? 30 : 16) * (a.arc ? 0.4 : 1);
    const f = this.facing < 0 ? -1 : 1;
    const dx = Math.cos(a.ang), dy = Math.sin(a.ang);
    while (this.fxAcc >= 1) {
      this.fxAcc -= 1;
      const u = a.u0 + Math.random() * (a.u1 - a.u0);
      const side = Math.random() * 2 - 1 + (a.arc ? a.arc * (1 - ((2 * (u - a.u0)) / (a.u1 - a.u0) - 1) ** 2) : 0);
      const x = this.x + this.rideOff.x + (a.x + dx * u - dy * side) * f - (f < 0 ? 1 / (this.currentFrame().res ?? 1) : 0);
      const y = this.y + this.rideOff.y + a.y + dy * u + dx * side;
      const c = el.colors;
      const r = (lo, hi) => lo + Math.random() * (hi - lo);
      if (a.fx === 'fire') world.particles.spawn({ x, y, vx: r(-4, 4), rise: r(18, 34), wobble: 18, life: r(0.25, 0.55), colors: [c[0], c[1], c[2], c[3], c[4]], emissive: true });
      else if (a.fx === 'frost') world.particles.spawn({ x, y, vx: r(-5, 5), vy: r(-2, 6), rise: r(-6, 2), life: r(0.4, 0.8), colors: [c[0], c[1], c[2]], emissive: true });
      else if (a.fx === 'poison') world.particles.spawn({ x, y, vx: r(-2, 2), rise: r(-14, -6), life: r(0.3, 0.6), colors: [c[1], c[2], c[3]], emissive: true });
      else world.particles.spawn({ x, y, vx: r(-4, 4), rise: r(6, el.rise + 10), wobble: 12, life: r(0.35, 0.8), colors: [c[0], c[1], c[2], c[3]], emissive: true });
    }
  }

  #tryDodge(world, axis) {
    const cost = this.stats.dodgeCost;
    if (this.dodgeBuffer <= 0 || this.dodgeCd > 0 || this.stamina < cost) return false;
    this.dodgeBuffer = 0;
    this.stamina -= cost;
    const dir = axis.x || axis.y ? axis : { x: this.facing, y: 0 };
    const len = Math.hypot(dir.x, dir.y) || 1;
    this.rollDir = { x: dir.x / len, y: dir.y / len };
    if (Math.abs(this.rollDir.x) > 0.1) this.facing = Math.sign(this.rollDir.x);
    this.setState('roll');
    if (this.stats.passives?.shadow_dance) this.buff('shadowdance', 2.3, {});
    this.animator.play('roll', true);
    this.invuln = H.dodgeTime + 0.04;
    world.bus.emit('roll', { actor: this });
    return true;
  }

  #trySkill(world, axis) {
    for (let i = 0; i < this.abilities.length; i++) {
      if (this.skillBuffer[i] <= 0) continue;
      const a = this.abilities[i];
      const impl = ABILITY_IMPL[a.id];
      if (!impl) { this.skillBuffer[i] = 0; continue; }
      if (a.locked) {
        this.skillBuffer[i] = 0;
        if (this.failNoteTime <= 0) { this.failNoteTime = 1.2; world.bus.emit(EV.UI_TOAST, { text: `${a.name} wird auf Stufe ${a.level} freigeschaltet`, kind: 'warn' }); }
        continue;
      }
      if (a.cdLeft > 0 || this.resource < a.cost) {
        this.skillBuffer[i] = 0;
        if (this.failNoteTime <= 0) {
          this.failNoteTime = 1.2;
          const text = a.cdLeft > 0 ? `${a.name} lädt noch (${a.cdLeft.toFixed(1)} s)` : `Nicht genug ${this.resourceName}`;
          world.bus.emit(EV.UI_TOAST, { text, kind: 'warn' });
        }
        continue;
      }
      this.skillBuffer[i] = 0;
      this.resource -= a.cost;
      a.cdLeft = a.cooldown;
      this.aimAngle = this.#computeAim(world, axis, this.cls.basic.kind === 'ranged' ? 180 : 70);
      const c = Math.cos(this.aimAngle);
      if (Math.abs(c) > 0.15) this.facing = Math.sign(c);
      this.skill = { impl, def: a.def, dur: impl.duration };
      this.skillState = {};
      this.setState('skill');
      this.animator.play(impl.anim, true);
      this.vx *= 0.3; this.vy *= 0.3;
      impl.start(this, world, this.aimAngle, a.def);
      world.bus.emit('ability', { actor: this, abilityId: a.id });
      return true;
    }
    return false;
  }

  #updateMove(dt, world, axis) {
    const sp = this.speed * this.rideSpeed * this.buffSpeed;
    const k = 1 - Math.exp(-dt * 18);
    this.vx += (axis.x * sp - this.vx) * k;
    this.vy += (axis.y * sp - this.vy) * k;
    const moving = Math.hypot(axis.x, axis.y) > 0.1;
    if (this.riding) {
      if (moving && Math.abs(axis.x) > 0.1) this.facing = Math.sign(axis.x);
      this.animator.play(moving ? 'rideRun' : 'ride');   // Name für Mitspieler: Reittier steht bzw. läuft
      if (moving) { this.stepTimer -= dt; if (this.stepTimer <= 0) { this.stepTimer = 0.3; world.bus.emit('footstep', { actor: this, mount: this.mountId }); } }
      return;
    }
    if (moving) {
      if (Math.abs(axis.x) > 0.1) this.facing = Math.sign(axis.x);
      this.animator.play('run');
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) { this.stepTimer = 0.22; world.bus.emit('footstep', { actor: this }); }
    } else {
      this.animator.play('idle');
      this.stepTimer = 0;
    }
    if (world.aim && !moving) this.facing = world.aim.x < this.x ? -1 : 1;
    if (this.#tryDodge(world, axis)) return;
    if (this.#trySkill(world, axis)) return;
    if (this.attackBuffer > 0) this.#startAttack(world, 0, axis);
  }

  // Zielrichtung: Maus > Bewegungsrichtung > Blickrichtung, dann Zielhilfe
  // auf den besten Gegner im Sichtkegel (wichtig für Touch).
  #computeAim(world, axis, range = 52) {
    let ang;
    if (world.aim) ang = Math.atan2(world.aim.y - (this.y - 8), world.aim.x - this.x);
    else if (axis.x || axis.y) ang = Math.atan2(axis.y, axis.x);
    else ang = this.facing > 0 ? 0 : Math.PI;
    const cone = world.aim ? 0.5 : 0.95;
    let best = null, bestScore = Infinity;
    for (const e of world.enemies) {
      if (e.dead || e.rise < 1) continue;
      const dx = e.x - this.x, dy = e.centerY - (this.y - 8);
      const d = Math.hypot(dx, dy);
      if (d > range) continue;
      const da = Math.abs(angleDiff(ang, Math.atan2(dy, dx)));
      if (da > cone) continue;
      const score = d + da * 30;
      if (score < bestScore) { bestScore = score; best = Math.atan2(dy, dx); }
    }
    return best ?? ang;
  }

  #startAttack(world, comboIndex, axis) {
    const basic = this.cls.basic;
    this.attackBuffer = 0;
    this.combo = comboIndex;
    this.atk = basic.kind === 'melee' ? basic.combo[comboIndex] : { ...basic.shot, active: 0.04 };
    this.aimAngle = this.#computeAim(world, axis, basic.kind === 'melee' ? 52 : basic.shot.range * 0.8);
    const c = Math.cos(this.aimAngle);
    if (Math.abs(c) > 0.15) this.facing = Math.sign(c);
    this.setState('attack');
    this.animator.play(`atk${comboIndex + 1}`, true);
    this.swingSpawned = false;
    this.vx *= 0.3; this.vy *= 0.3;
  }

  #updateAttack(dt, world, axis) {
    const a = this.atk;
    const t = this.stateTime;
    const tActive = a.windup, tRecover = a.windup + a.active, tEnd = tRecover + a.recover;
    if (t < tActive) this.setPhaseFrame('windup', t / a.windup);
    else if (t < tRecover) this.setPhaseFrame('active', (t - tActive) / a.active);
    else this.setPhaseFrame('recover', (t - tRecover) / a.recover);

    if (t < tActive) {
      this.vx *= 0.7; this.vy *= 0.7;
    } else if (!this.swingSpawned) {
      this.swingSpawned = true;
      if (this.cls.basic.kind === 'melee') this.#meleeStrike(world, a);
      else this.#shoot(world, a);
    } else {
      const f = Math.exp(-dt * 14);
      this.vx *= f; this.vy *= f;
    }

    const melee = this.cls.basic.kind === 'melee';
    const last = melee ? this.cls.basic.combo.length - 1 : 0;
    if (t >= tRecover) {
      if (this.#tryDodge(world, axis)) return;
      if (this.#trySkill(world, axis)) return;
      const canChain = t >= tRecover + a.recover * 0.35 && this.combo < last;
      if (this.attackBuffer > 0 && canChain) { this.#startAttack(world, this.combo + 1, axis); return; }
    }
    if (t >= tEnd) {
      if (this.attackBuffer > 0) { this.#startAttack(world, this.combo < last ? this.combo + 1 : 0, axis); return; }
      this.setState('move');
    }
  }

  // Angriffsanimationen tragen phases = { windup, active, recover } (Frame-Bereiche);
  // k = Fortschritt 0..1 innerhalb der Phase. Auch von Fähigkeiten genutzt.
  setPhaseFrame(phase, k) {
    const anim = this.animator.current;
    const n = anim.frames.length;
    const r = anim.phases?.[phase] ?? (phase === 'windup' ? [0, 0] : phase === 'active' ? [1, Math.max(1, n - 2)] : [n - 1, n - 1]);
    const span = r[1] - r[0] + 1;
    const fi = r[0] + Math.min(span - 1, Math.floor(Math.max(0, Math.min(1, k)) * span));
    this.animator.time = (fi + 0.5) / anim.fps;
  }

  // Neue Sprites (z. B. nach Ausrüstungswechsel), laufende Animation bleibt erhalten.
  setAnims(anims) {
    const a = this.animator;
    a.anims = anims;
    a.current = anims[a.name] ?? anims.idle;
  }

  #meleeStrike(world, a) {
    const dx = Math.cos(this.aimAngle), dy = Math.sin(this.aimAngle);
    this.vx = dx * a.lunge; this.vy = dy * a.lunge;
    heroHitbox(this, world, {
      shape: 'arc', x: this.x + dx * 4, y: this.y - 8 + dy * 4, follow: true, offX: dx * 4, offY: -8 + dy * 4,
      r: a.reach, angle: this.aimAngle, arc: a.arc,
      damage: this.damageFor(a.mult), knockback: a.knockback, heavy: !!a.heavy, ttl: a.active,
    });
    const style = a.heavy ? SLASH_STYLES.heroHeavy : SLASH_STYLES.hero;
    world.addEffect(new SlashEffect(this, this.aimAngle, style, this.combo === 1, a.active + 0.08));
    world.bus.emit('swing', { actor: this, heavy: !!a.heavy, angle: this.aimAngle });
  }

  #shoot(world, a) {
    const dx = Math.cos(this.aimAngle), dy = Math.sin(this.aimAngle);
    this.vx = -dx * 20; this.vy = -dy * 20;
    const P = this.stats.passives ?? {};
    // early: Bonus auf niedrigen Stufen, läuft zwischen from und to auf 0 aus (Waldläufer vor Mehrfachschuss)
    const E = a.early, lv = this.level ?? 1;
    const early = E ? E.pct * Math.max(0, Math.min(1, (E.to - lv) / (E.to - E.from))) : 0;
    const dmg = this.damageFor(a.mult * (1 + early));
    const opts = { speed: a.speed, damage: dmg, knockback: a.knockback, range: a.range };
    if (a.projectile === 'arrow' && P.piercing_arrows) opts.pierce = 1;
    const ms = this.stats.mastery ?? {};
    const inf = ms.infernoPct ?? 0.5;
    if (a.projectile === 'bolt' && P.inferno) opts.explode = { r: inf > 0.5 ? 24 : 18, damage: dmg * inf, knockback: 90, skipDirect: true };
    fireProjectile(this, world, a.projectile, this.aimAngle, opts);
    if (a.projectile === 'arrow' && P.multishot) {
      for (const off of [-0.14, 0.14]) fireProjectile(this, world, 'arrow', this.aimAngle + off, { ...opts, damage: dmg * (ms.multishotPct ?? 0.25) });
    }
    world.bus.emit(a.projectile === 'bolt' ? 'swing' : 'shoot', { actor: this, heavy: false, angle: this.aimAngle });
  }

  #updateSkill(dt, world) {
    const s = this.skill;
    const t = this.stateTime;
    if (s.impl.update) s.impl.update(this, world, dt, t, s.def);
    else { const f = Math.exp(-dt * 10); this.vx *= f; this.vy *= f; }
    if (t >= s.dur) {
      this.skill = null;
      if (Math.abs(this.vx) < 1 && Math.abs(this.vy) < 1) this.vx = this.vy = 0;
      this.setState('move');
    }
  }

  #updateRoll(dt, world) {
    const k = 1 - this.stateTime / H.dodgeTime;
    const sp = H.dodgeSpeed * (0.45 + 0.55 * k) * (this.speed / 88);
    this.vx = this.rollDir.x * sp;
    this.vy = this.rollDir.y * sp;
    this.ghostTimer -= dt;
    if (this.ghostTimer <= 0) {
      this.ghostTimer = 0.035;
      world.addEffect(new Afterimage(this.currentFrame(), this.x, this.y, this.facing < 0));
    }
    if (this.stateTime >= H.dodgeTime) {
      this.dodgeCd = H.dodgeCooldown;
      this.vx *= 0.35; this.vy *= 0.35;
      this.setState('move');
      world.bus.emit('rollEnd', { actor: this });
    }
  }

  // Rüstung und Schutz-Buffs mindern den Schaden (hit.damage wird angepasst,
  // damit Anzeige und Rechnung übereinstimmen).
  takeHit(hit) {
    if (this.state === 'roll' || (this.state === 'skill' && this.invuln > 0)) {
      if (hit.source?.team !== 'hero') this.dodgedTimer = 0.4;
      return false;
    }
    if (this.dead || this.invuln > 0 || !this.hurtable) return false;
    let mult = 1 - this.stats.damageReduction;
    for (const b of this.buffs) if (b.damageTaken) mult *= b.damageTaken;
    hit.damage = Math.max(1, Math.round(hit.damage * mult));
    // Unbeugsam: tödlicher Treffer lässt 1 Leben übrig
    if (hit.damage >= this.hp && this.stats.passives?.unbroken && this.unbrokenCd <= 0) {
      this.unbrokenCd = 90;
      hit.damage = Math.max(0, this.hp - 1);
      this.buff('unbroken', 3, { damageTaken: 0.5 });
      this.unbrokenNote = true;
    }
    const res = this.cls.resource;
    if (res.onHurt) this.gainResource(res.onHurt);
    this.combatTime = 0;
    const hitOk = super.takeHit(hit);
    // Jeder erlittene Treffer wirft ab und bricht das Aufsitzen ab
    if (hitOk !== false) {
      this.mountCast = null;
      if (this.riding && this.worldRef) this.#setMount(this.worldRef, false);
    }
    return hitOk;
  }

  onHurt(hit) {
    // Boden- und Wolkenschaden (hit.dot): weder Betäubung noch Unverwundbarkeit, sonst schützt eine Glutfläche vor Bossangriffen
    if (hit?.dot) return;
    this.invuln = H.invulnAfterHit;
    if (this.state === 'skill') return; // Fähigkeiten werden nicht unterbrochen
    if (this.state !== 'attack' || this.combo < 2) {
      this.setState('hurt');
      this.animator.play('hurt', true);
    }
  }

  die() {
    this.mountCast = null;
    if (this.riding && this.worldRef) this.#setMount(this.worldRef, false);
    super.die();
    this.hurtable = false;
    this.skill = null;
    this.setState('dead');
    this.animator.play('death', true);
  }

  // Nach Wiederbelebung/Zonenwechsel wird ein neuer Held erzeugt; revive()
  // steht für Systeme bereit, die den Helden an Ort und Stelle zurückholen.
  revive(fraction = 1) {
    this.dead = false; this.solid = true; this.hurtable = true;
    this.hp = Math.max(1, Math.round(this.maxHp * fraction));
    this.setState('move');
    this.animator.play('idle', true);
  }

  // Beritten: erst das Reittier, dann der Reiter auf dem Sattel
  drawSprite(ctx, cx, cy, opts = {}) {
    const mf = this.mountFrame;
    if (!this.riding || !mf || this.dead) return super.drawSprite(ctx, cx, cy, opts);
    const x = this.x - cx, y = this.y - cy, flip = this.facing < 0;
    mf.draw(ctx, x, y, { flip, ...opts });
    this.currentFrame().draw(ctx, x + this.rideOff.x, y + this.rideOff.y, { flip, ...opts });
  }

  render(ctx, cx, cy) {
    const blink = this.invuln > 0 && this.state !== 'roll' && this.state !== 'skill' && !this.dead && Math.floor(this.invuln * 20) % 2 === 0;
    if (blink) ctx.globalAlpha = 0.45;
    super.render(ctx, cx, cy);
    ctx.globalAlpha = 1;
  }

  renderEmissive(ctx, cx, cy) {
    // Treffer-Blitz nur angedeutet (halbtransparent, klingt schnell ab)
    if (this.flash > 0) this.drawSprite(ctx, cx, cy, { flash: true, alpha: Math.min(0.4, this.flash * 5) });
    if (this.dead && this.animator.finished) return;
    // Leuchtpunkte des Frames (Augen der Glutgeborenen, Stabkristall, Zauberhand)
    const f = this.currentFrame();
    const glows = [];
    for (const g of f.glows ?? []) glows.push([g, this.rideOff.x, this.rideOff.y, f]);
    if (this.riding && this.mountFrame) for (const g of this.mountFrame.glows ?? []) glows.push([g, 0, 0, this.mountFrame]);
    if (glows.length) {
      for (const [g, ox, oy, gf] of glows) {
        const x = Math.round(this.x - cx + ox + g.x * this.facing - (this.facing < 0 ? 1 / (gf.res ?? 1) : 0));
        const y = Math.round(this.y - cy + oy + g.y);
        const r = Math.max(1, Math.min(4, Math.round(g.r)));
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = g.color;
        ctx.fillRect(x - r, y - r + 1, r * 2 + 1, r * 2 - 1);
        ctx.fillRect(x - r + 1, y - r, r * 2 - 1, r * 2 + 1);
        ctx.globalAlpha = 0.9;
        ctx.fillRect(x, y, 1, 1);
      }
      ctx.globalAlpha = 1;
    }
    this.#renderWeaponFx(ctx, cx, cy, f);
    // Schutz-Aura (Kriegsschrei)
    if (this.buffs.some((b) => b.id === 'guard')) {
      const t = performance.now() / 1000;
      ctx.globalAlpha = 0.25 + 0.1 * Math.sin(t * 8);
      ctx.strokeStyle = '#ffb640';
      ctx.beginPath();
      ctx.ellipse(Math.round(this.x - cx), Math.round(this.y - cy - 1), 11, 4, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // Leuchten an der Waffe: selten = wandernder Glanz, episch/legendär = flackernde Aura und Flammenzungen.
  #renderWeaponFx(ctx, cx, cy, frame) {
    const a = frame.weapon;
    if (!a || !a.tier) return;
    const t = performance.now() / 1000;
    const f = this.facing < 0 ? -1 : 1;
    const dx = Math.cos(a.ang), dy = Math.sin(a.ang);
    const bend = (u) => (a.arc ? a.arc * (1 - ((2 * (u - a.u0)) / (a.u1 - a.u0) - 1) ** 2) : 0); // Bogen gekrümmt
    // Feinraster des Spielbilds (Überabtastung, INTEGRATION §11.12): Funken und Zungen feiner als ein Weltpixel
    const q = Math.max(1, Math.min(3, CONFIG.renderScale ?? 1)), P = 1 / q;
    const snap = (v) => Math.round(v * q) / q;
    const ox = this.rideOff.x, oy = this.rideOff.y;
    const px = (u, s = 0) => snap(this.x - cx + ox + (a.x + dx * u - dy * (s + bend(u))) * f - (f < 0 ? 1 / (frame.res ?? 1) : 0));
    const py = (u, s = 0) => snap(this.y - cy + oy + a.y + dy * u + dx * (s + bend(u)));
    const el = ELEMENTS[a.fx] ?? ELEMENTS.arcane, c = el.colors;
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    if (a.tier >= 2) {
      // weiche Aura entlang der Waffe
      const strong = a.tier >= 3;
      const dim = a.arc ? 0.45 : 1;   // Bogen: schwächere Aura, Zungen nur an den Enden
      for (let u = a.u0; u <= a.u1; u += a.arc ? 3 : 1.5) {
        const n = 0.5 + 0.5 * Math.sin(t * 11 + u * 1.7) * Math.sin(t * 7.3 - u);
        const x = px(u), y = py(u);
        ctx.globalAlpha = ((strong ? 0.1 : 0.06) + n * 0.06) * dim;
        ctx.fillStyle = c[2];
        ctx.fillRect(x - 2, y - 1, 5, 3); ctx.fillRect(x - 1, y - 2, 3, 5);
        ctx.globalAlpha = ((strong ? 0.12 : 0.07) + n * 0.08) * dim;
        ctx.fillStyle = c[1];
        ctx.fillRect(x - 1, y - 1, 3, 3);
      }
      // Flammenzungen (Feuer, Heilig) bzw. Funkeln (andere Elemente)
      const tongues = a.fx === 'fire' || a.fx === 'holy';
      const n = a.arc ? 2 : strong ? 7 : 5;
      for (let i = 0; i < n; i++) {
        const u = a.arc ? (i ? a.u1 - 0.5 : a.u0 + 0.5) : a.u0 + (a.u1 - a.u0) * ((i + 0.5) / n);
        const ph = t * (tongues ? 9 : 4) + i * 2.39;
        const h = tongues ? Math.max(0, Math.round((1 + 2.6 * (0.5 + 0.5 * Math.sin(ph)) + (strong ? 1 : 0)) * q * 0.8)) : 0;
        const x = px(u), y = py(u);
        if (tongues) {
          for (let k = 0; k <= h; k++) {
            const kk = k / Math.max(1, h);
            ctx.globalAlpha = 0.9 - kk * 0.5;
            ctx.fillStyle = kk < 0.25 ? c[0] : kk < 0.8 ? c[1] : c[3];
            const wdt = q > 1 && kk < 0.5 ? 2 * P : P;
            ctx.fillRect(x + snap(Math.sin(ph * 0.7 + kk * 3) * 0.6), y - (k + 1) * P, wdt, P);
          }
        } else if (Math.sin(ph) > 0.6) {
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = c[0];
          ctx.fillRect(x, y, P, P);
          ctx.globalAlpha = 0.45;
          ctx.fillStyle = c[1];
          ctx.fillRect(x - 2 * P, y, 5 * P, P); ctx.fillRect(x, y - 2 * P, P, 5 * P);
        }
      }
    }
    // Glanzlicht, das über die Waffe wandert (ab selten)
    const period = a.tier >= 2 ? 1.6 : 2.4;
    const p = ((t + (this.id ?? 0) * 0.37) % period) / 0.4;
    if (p < 1) {
      const u = a.u0 + (a.u1 - a.u0) * p;
      const x = px(u), y = py(u);
      const r1 = q > 1 ? 2 : 1, r2 = q > 1 ? 5 : 2;
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, P, P);
      ctx.globalAlpha = 0.5;
      ctx.fillRect(x - r1 * P, y, (2 * r1 + 1) * P, P); ctx.fillRect(x, y - r1 * P, P, (2 * r1 + 1) * P);
      ctx.globalAlpha = 0.2;
      ctx.fillRect(x - r2 * P, y, (2 * r2 + 1) * P, P); ctx.fillRect(x, y - r2 * P, P, (2 * r2 + 1) * P);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = prev;
  }
}
