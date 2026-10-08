import { Actor } from './Actor.js';
import { getShadow } from './Entity.js';
import { ENEMY_TYPES } from './enemyTypes.js';
import { SlashEffect } from './Effects.js';
import { Arrow, MagicBolt, NetShot, LobBomb } from './Projectile.js';
import { Telegraph, DamageWave } from './Telegraph.js';
import { SLASH_STYLES } from '../sprites/effects.js';
import { rand, angleDiff } from '../core/math.js';
import { HazardCloud, NetSnare } from './Hazards.js';
import { levelGapColor } from '../progression/levelGap.js';

const CLOUD_TELE = { poison: [120, 220, 90], frost: [140, 200, 255], fire: [255, 140, 60], spore: [190, 130, 240], curse: [190, 90, 230] };

// Fehlt einer Figur eine Animation (neue Gegner, Platzhalter-Figuren), wird der Reihe nach
// auf diese ausgewichen (Animationsvertrag R5): nie Absturz.
const ANIM_FALLBACK = {
  dig: ['windup'], mound: ['idle'], emerge: ['strike'], block: ['idle'], fuse: ['walk'], dive: ['strike', 'walk'],
  cast: ['windup'], throw: ['strike'], vanish: ['hurt', 'windup'], appear: ['strike', 'idle'], shatter: ['hurt'],
  howl: ['idle'], roar: ['howl', 'idle'], spin: ['strike'], charge: ['walk'], breath: ['strike'], slam: ['strike'],
  walk: ['idle'], windup: ['idle'], strike: ['windup', 'idle'], hurt: ['idle'], death: ['hurt', 'idle'],
};
// Neue Spezialangriffe (Runde 5); Phasen laufen in #updateNewSpecial
const NEW_KINDS = new Set(['burrow', 'bash', 'explode', 'totem', 'heal', 'net', 'blink', 'curse', 'icestrike', 'refreeze']);

// Champion-Gegner: seltene Elite-Varianten normaler Gegner (Kräfte = affixes)
export const CHAMPION_AFFIXES = {
  feuerspur: { label: 'Feuerspur', color: '#ff8a3a' },
  schildwall: { label: 'Schildwall', color: '#6ab8ff' },
  blinzeln: { label: 'Blinzeln', color: '#b070ff' },
  rudelrufer: { label: 'Rudelrufer', color: '#ffd84a' },
  frostaura: { label: 'Frostaura', color: '#a8e8ff' },
  vampir: { label: 'Vampir', color: '#e0303a' },
  flink: { label: 'Flink', color: '#70f0a0' },
  dornen: { label: 'Dornen', color: '#c8a060' },
};
export const CHAMPION = { hp: 2.8, damage: 1.3, scale: 1.3, chanceOutdoor: 0.03, chanceDungeon: 0.25, minLevel: 5 };

// Darf dieser Gegner Champion werden? (keine Bosse, Elite, Seltene, Totems, Beschworene, Teilstücke)
export function canBeChampion(e) {
  const d = e?.def;
  return !!d && !e.dead && !d.boss && !d.elite && !d.static && !d.noChampion && !e.rareId && !e.summoned && !e.champion && (e.level ?? 1) >= CHAMPION.minLevel;
}

// Test-/Konsolenhilfe: spawnChampion(world, 'bandit', x, y, ['feuerspur', 'dornen'])
export function spawnChampion(world, type, x, y, affixes = null) {
  const e = world.spawnEnemy(type, x, y, { home: { x, y } });
  return e.makeChampion(affixes);
}

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
    this.lvlPower = this.power = 1 + (this.level - base) * 0.08;
    this.dmgMul = 1; // Schadensfaktor aus Zonenvariante/Champion (power = lvlPower · dmgMul)
    if (this.level !== base) this.xpOverride = Math.round((def.xp ?? 10) * (1 + (this.level - base) * 0.12));
    this.maxHp = this.hp = Math.round(def.hp * (opts.hpScale ?? 1) * this.power);
    this.specialTimer = def.specialStart ?? rand(2, 4);
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
    this.guardFace = this.facing; // Schildträger: Schildseite (dreht verzögert)
    if (def.flying) this.z = def.flying.hover ?? 12;
    this.#play('idle');
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
    if (state === 'dormant') { this.#play('death'); this.animator.time = 99; }
    if (state === 'ceiling') this.z = 70;
  }

  get isHidden() { return this.state === 'dormant' || this.state === 'ceiling'; }
  // Lauftempo (Champion „flink“ +35 %)
  get moveSpeed() { return this.def.speed * (this.speedMul ?? 1); }
  get displayLabel() { return this.displayName ?? this.def.name; }

  // Animation mit Ausweichliste; ohne Eispanzer (bare) bevorzugt <name>_bare
  #play(name, restart = false) {
    const A = this.animator.anims;
    const pick = (n) => (this.bare && A[n + '_bare'] ? n + '_bare' : A[n] ? n : null);
    let n = pick(name);
    if (!n) for (const f of ANIM_FALLBACK[name] ?? []) if ((n = pick(f))) break;
    if (!n) n = A.idle ? 'idle' : Object.keys(A)[0];
    this.animator.play(n, restart);
  }
  #has(name) { return !!this.animator.anims[name]; }
  get isEngaged() { return ['chase', 'windup', 'strike', 'recover', 'retreat', 'hurt', 'howl', 'special', 'charging'].includes(this.state); }

  // Greift den Helden an (Sicht, Treffer, Alarm des Rudels).
  aggro(world, { alertGroup = true } = {}) {
    if (this.dead || this.state === 'return') return;
    if (this.state === 'dormant') {
      this.setState('spawn'); this.solid = true; this.rise = 0;
      this.#play('idle');
      world.bus.emit('spawnStart', { actor: this });
    } else if (this.state === 'ceiling') {
      this.setState('drop'); this.rise = 1; this.solid = true;
      world.bus.emit('ambush', { actor: this });
    } else if (this.state === 'idle') {
      if ((this.def.howl || this.def.roar) && !this.aggroed) {
        this.setState('howl');
        this.#play(this.def.roar && this.animator.anims.roar ? 'roar' : 'howl', true);
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
    if (!this.inited) this.#init(world);
    if (this.rareId || this.champion) this.nearHero = Math.hypot(world.hero.x - this.x, world.hero.y - this.y) < 130;
    this.blockT = Math.max(0, (this.blockT ?? 0) - dt);
    if (this.armorMax) { this.armorFlash = Math.max(0, (this.armorFlash ?? 0) - dt); if (this.bare && !this.dead) this.bareT = (this.bareT ?? 0) + dt; }
    if (this.def.static) { this.#updateStatic(dt, world); return; }
    if (this.champion && !this.dead && !this.isHidden) this.#championTick(dt, world);
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
        if (this.def.flying) { this.#flyChase(dt, world, dx, dy, dist); break; }
        let mx = dx / (dist || 1), my = dy / (dist || 1);
        let speed = this.moveSpeed * (this.speedBoost > 0 ? 1.25 : 1);
        const clearPath = world.dungeon.lineOfSight(this.x, this.y - 2, hero.x, hero.y - 2);
        const hasLos = A.kind !== 'ranged' || world.dungeon.lineOfSight(this.x, this.y - 8, hero.x, hero.centerY);
        this.lostSight = clearPath ? 0 : this.lostSight + dt;
        if (this.lostSight > 5 && dist > this.def.aggro * 2 && !this.leashFree) { this.#returnHome(world); break; }
        // Bewegung: Die Sichtlinie sieht über Lava/Wasser und niedrige Hindernisse hinweg,
        // laufen kann man dort aber nicht. Darum zusätzlich ein begehbarer Strahl (eigener
        // Fußabdruck) und eine Hänger-Erkennung; in beiden Fällen führt das Flow-Field.
        const moved = Math.hypot(this.x - (this.chasePrev?.x ?? this.x), this.y - (this.chasePrev?.y ?? this.y));
        const wanted = (this.chaseWant ?? 0) * dt;
        this.chasePrev = { x: this.x, y: this.y };
        if (wanted > 0.05 && moved < wanted * 0.3 && dist > A.range * 0.7) this.stuckTime += dt;
        else this.stuckTime = Math.max(0, this.stuckTime - dt * 0.5);
        // Völlig festgeklemmt (z. B. breiter Körper in Deko eingekeilt): auf freien Boden schieben
        this.frozen = wanted > 0.05 && moved < 0.01 && dist > A.range * 0.7 ? (this.frozen ?? 0) + dt : 0;
        if (this.frozen > 1.5) {
          const p = world.dungeon.nearestFree?.(this.x + Math.sign(dx) * 6, this.y + Math.sign(dy) * 4, Math.max(6, this.radius ?? 6));
          if (p) { this.x = p.x; this.y = p.y; }
          this.frozen = 0;
        }
        if (this.stuckTime > 0.4) {
          // Hängt er schon auf dem Umweg (z. B. breiter Körper in enger Lücke): seitlich abgleiten
          if (this.detour > 0) { this.slide = 0.7; this.sidestep = -this.sidestep; }
          this.detour = 1.5; this.stuckTime = 0;
        }
        this.detour = Math.max(0, (this.detour ?? 0) - dt);
        this.slide = Math.max(0, (this.slide ?? 0) - dt);
        this.walkCheck = (this.walkCheck ?? 0) - dt;
        if (this.walkCheck <= 0) { this.walkCheck = 0.25; this.walkClear = clearPath && this.#walkRay(world, hero.x, hero.y); }
        const walkable = clearPath && this.walkClear;
        if (!walkable || this.detour > 0) {
          const f = world.flow.direction(this.x, this.y - 2);
          if (f) { mx = f.x; my = f.y; }
          // Kein Landweg (z. B. Held hinter Lava): Nahkämpfer geben auf und setzen sich zurück
          // (heilen sich wie beim Leinen-Rückzug), statt sich gefahrlos töten zu lassen.
          const noWay = !f && !walkable && dist > A.range;
          this.unreach = noWay || (this.detour > 0 && moved < wanted * 0.3 && !walkable) ? (this.unreach ?? 0) + dt : 0;
          if (this.unreach > 2.5 && A.kind !== 'ranged' && !this.leashFree) { this.unreach = 0; this.#returnHome(world); break; }
        } else this.unreach = 0;
        if (this.slide > 0) { const px = -my * this.sidestep, py = mx * this.sidestep; mx = px * 0.85 + mx * 0.15; my = py * 0.85 + my * 0.15; }
        // Kiter: wer ihn bedrängt (zu nah > 1,6 s), wird trotzdem beschossen
        this.kiteT = this.def.kite && dist < (A.minRange ?? 0) ? (this.kiteT ?? 0) + dt : 0;
        if (A.kind === 'ranged') {
          // Fernkämpfer: Abstand halten, nach dem Schuss seitlich umsetzen,
          // an Wänden entlang ausweichen und nicht auf Artgenossen stehen
          const px = -dy / (dist || 1), py = dx / (dist || 1);
          if (dist < A.minRange) {
            mx = -dx / (dist || 1) + px * this.sidestep * 0.35; my = -dy / (dist || 1) + py * this.sidestep * 0.35; speed *= this.def.kite ? 1.15 : 0.9;
            const D = world.dungeon, ax = this.x + mx * 10, ay = this.y + my * 10;
            if (D.collidesRect(ax - 4, ay - 3, ax + 4, ay + 1)) { mx = px * this.sidestep; my = py * this.sidestep; speed *= 1.1; }
          } else if (dist < A.range * 0.85 && hasLos) {
            if (this.cooldown > 0.25) { mx = px * this.sidestep; my = py * this.sidestep; speed *= 0.55; }
            else speed = 0;
          }
          for (const o of world.enemies) {
            if (o === this || o.dead || o.def.attack?.kind !== 'ranged') continue;
            const ox = this.x - o.x, oy = this.y - o.y, od = Math.hypot(ox, oy);
            if (od > 0 && od < 20) { mx += ox / od * 0.8; my += oy / od * 0.8; if (speed === 0) speed = this.moveSpeed * 0.4; }
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
        // Geplanter Anlauf-Angriff (charge mit minRange): erst Abstand gewinnen
        const plan = this.specialTimer <= 0 ? this.nextSpecial : null;
        const backOff = plan?.minRange && dist < plan.minRange + 6 && walkable;
        if (backOff) {
          mx = -dx / (dist || 1); my = -dy / (dist || 1); speed = this.moveSpeed * 0.75;
          const ax = this.x + mx * 10, ay = this.y + my * 10;
          if (world.dungeon.collidesRect(ax - 4, ay - 3, ax + 4, ay + 1)) { const px = -my * this.sidestep, py = mx * this.sidestep; mx = px; my = py; }
        } else if (A.kind === 'melee' && dist < A.range * 0.7) speed *= 0.2;
        const k = 1 - Math.exp(-dt * 8);
        this.vx += (mx * speed - this.vx) * k;
        this.vy += (my * speed - this.vy) * k;
        this.chaseWant = speed;
        if (Math.abs(dx) > 2) this.facing = Math.sign(dx);
        this.#play(this.blockT > 0 ? 'block' : speed > 1 ? this.def.walkAnim ?? 'walk' : 'idle');
        this.specialTimer -= dt;
        // Schildträger greift nur an, wenn der Held vor dem Schild steht
        const front = !this.def.shield || Math.sign(dx || 1) === this.guardFace;
        // Spezialangriff: Sobald der Timer abläuft, wird der nächste geplant – zufällig unter
        // allen außer dem zuletzt benutzten (sonst kämen zweite Spezialangriffe nie dran).
        // Passt der geplante 3,5 s lang nicht (Reichweite), darf jeder passende kommen.
        let sp = null;
        const SPS = this.def.specials;
        if (SPS?.length && this.specialTimer <= 0) {
          const ready = (x) => this.#specialReady(x, world);
          if (this.nextSpecial && !ready(this.nextSpecial)) this.nextSpecial = null;
          if (!this.nextSpecial) {
            let pool = SPS.length > 1 ? SPS.filter((x) => x !== this.lastSpecial && ready(x)) : SPS.filter(ready);
            if (!pool.length) pool = SPS.filter(ready);
            this.nextSpecial = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
            this.planWait = 0;
          }
          this.planWait += dt;
          const fits = (x) => dist < x.range && dist >= (x.minRange ?? 0) && ready(x);
          if (this.nextSpecial && fits(this.nextSpecial)) sp = this.nextSpecial;
          else if (this.planWait > 3.5) sp = SPS.find(fits) ?? null;
          if (!this.nextSpecial) this.specialTimer = 0.5;
        }
        if (sp && this.specialTimer <= 0 && !waiting && clearPath && (front || sp.kind !== 'bash')) { this.#beginSpecial(world, sp, toHero); break; }
        const inRange = A.range > 0 && dist < A.range && (A.kind !== 'ranged' || dist >= A.minRange * 0.6 || this.kiteT > 1.6);
        if (inRange && hasLos && !waiting && front) this.#beginWindup(world, toHero);
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
          this.#play(res.hitX || res.hitY ? 'hurt' : 'idle', true);
        }
        return;
      }

      case 'windup': {
        this.vx *= 0.8; this.vy *= 0.8;
        if (this.def.flying) this.vx = this.vy = 0;
        if (this.stateTime < A.windup * 0.7 && !A.fixed) {
          this.aim += angleDiff(this.aim, toHero) * Math.min(1, dt * 10);
          if (Math.abs(dx) > 2) this.facing = Math.sign(dx);
        }
        if (this.stateTime >= A.windup) this.#strike(world);
        break;
      }

      case 'strike':
        if (A.kind === 'breath') {
          this.#breathTick(dt, world, toHero);
          if (this.stateTime >= A.active) { this.setState('recover'); this.#play('idle'); }
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
          this.#play('idle');
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
        const sp = this.moveSpeed * (this.def.flying ? 1.1 : 0.9);
        const k = 1 - Math.exp(-dt * 8);
        this.vx += (Math.cos(this.retreatAng) * sp - this.vx) * k;
        this.vy += (Math.sin(this.retreatAng) * sp - this.vy) * k;
        this.#play('walk');
        if (Math.abs(this.vx) > 2) this.facing = Math.sign(this.vx);
        if (this.stateTime >= this.def.hitAndRun) this.setState('chase');
        break;
      }

      case 'diving': {
        const D = this.dive;
        this.vx = Math.cos(this.aim) * D.speed; this.vy = Math.sin(this.aim) * D.speed;
        if (Math.random() < 0.5) world.particles.dust(this.x, this.y, 1, '#6a6070');
        if (this.stateTime >= D.dur) {
          world.combat.hitboxes = world.combat.hitboxes.filter((h) => h.owner !== this);
          this.vx = this.vy = 0;
          this.setState('recover');
          this.#play('idle', true);
          world.particles.dust(this.x, this.y, 6, '#5a5060');
        }
        break;
      }

      case 'hurt':
        this.vx *= 0.8; this.vy *= 0.8;
        if (this.stateTime >= (this.hurtOverride ?? this.def.hurtTime)) { this.hurtOverride = null; this.cooldown = Math.max(this.cooldown, 0.35); this.setState('chase'); }
        break;

      case 'return': {
        this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.6 * dt);
        const hx = this.home.x - this.x, hy = this.home.y - this.y;
        const d = Math.hypot(hx, hy);
        const sp = this.moveSpeed * 1.25;
        this.vx = (hx / (d || 1)) * sp; this.vy = (hy / (d || 1)) * sp;
        if (Math.abs(hx) > 2) this.facing = Math.sign(hx);
        this.#play('walk');
        const before = { x: this.x, y: this.y };
        this.integrate(dt, world);
        this.stuckTime = Math.hypot(this.x - before.x, this.y - before.y) < sp * dt * 0.3 ? this.stuckTime + dt : 0;
        if (d < 6 || this.stuckTime > 1.5) {
          if (d >= 6) { this.x = this.home.x; this.y = this.home.y; }
          this.hp = this.maxHp; this.hurtable = true; this.aggroed = false;
          this.vx = this.vy = 0;
          this.setState('idle');
          this.#play('idle');
        }
        return;
      }

      case 'dead':
        this.vx *= 0.85; this.vy *= 0.85;
        if (this.#updateDeadExtras(dt, world)) break;
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
    this.#postUpdate(dt, world, dx);
    this.integrate(dt, world);
  }

  #wander(dt, world) {
    const W = this.def.wander;
    if (!W) { this.vx *= 0.8; this.vy *= 0.8; this.#play('idle'); return; }
    this.wanderTimer -= dt;
    if (!this.wanderTarget && this.wanderTimer <= 0) {
      const a = rand(0, Math.PI * 2), r = rand(4, W);
      this.wanderTarget = { x: this.home.x + Math.cos(a) * r, y: this.home.y + Math.sin(a) * r * 0.7 };
    }
    if (this.wanderTarget) {
      const tx = this.wanderTarget.x - this.x, ty = this.wanderTarget.y - this.y;
      const d = Math.hypot(tx, ty);
      const sp = this.moveSpeed * 0.3;
      const before = { x: this.x, y: this.y };
      this.vx = (tx / (d || 1)) * sp; this.vy = (ty / (d || 1)) * sp;
      if (Math.abs(tx) > 1) this.facing = Math.sign(tx);
      this.#play('walk');
      this.stuckTime = Math.hypot(this.x - before.x, this.y - before.y) < 0.01 && this.stateTime > 0.2 ? this.stuckTime + dt : 0;
      if (d < 3 || this.stuckTime > 1) { this.wanderTarget = null; this.wanderTimer = rand(2, 5); this.stuckTime = 0; }
    } else {
      this.vx *= 0.8; this.vy *= 0.8;
      this.#play('idle');
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
    this.#play('windup', true);
    world.bus.emit('telegraph', { actor: this });
    const A = this.def.attack;
    if (A.kind === 'charge') world.spawn(new Telegraph(this.x, this.y, { shape: 'line', angle: toHero, len: A.chargeSpeed * A.active, width: 16, duration: A.windup, screen: true }));
    if (A.kind === 'slam') {
      const ox = this.x + Math.cos(toHero) * (A.offset ?? 14), oy = this.y + Math.sin(toHero) * (A.offset ?? 14) * 0.6;
      this.slamAt = { x: ox, y: oy };
      world.spawn(new Telegraph(ox, oy, { shape: 'circle', r: A.radius, duration: A.windup }));
    }
    if (A.kind === 'breath') world.spawn(new Telegraph(this.x, this.y - 2, { shape: 'arc', r: A.reach, angle: toHero, arc: A.arc, duration: A.windup }));
    const h = world.hero, gAng = Math.atan2(h.y - this.y, h.x - this.x), gDist = Math.hypot(h.x - this.x, h.y - this.y);
    if (A.kind === 'dive') {
      // Sturzflug: Bahn steht beim Ausholen fest (keine Nachführung), Bildraum wie die Bewegung
      this.aim = gAng;
      this.diveLen = Math.min(A.maxLen ?? 200, gDist + (A.overshoot ?? 28));
      world.spawn(new Telegraph(this.x, this.y, { shape: 'line', angle: gAng, len: this.diveLen, width: (A.hitRadius ?? 9) * 2 + 2, duration: A.windup, screen: true }));
    }
    if (A.projectile === 'lob') {
      // Bogenwurf: Ziel ist der Standort beim Ausholen; Warnung liegt bis zum Einschlag
      this.lobAt = { x: h.x, y: h.y };
      world.spawn(new Telegraph(h.x, h.y, { shape: 'circle', r: A.radius, duration: A.windup + A.flight }));
    }
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

  // Begehbarer Strahl zum Ziel: Fußabdruck entlang der Strecke gegen Wände, Lava/Wasser
  // und alle Boxen (auch niedrige) prüfen – anders als die Sichtlinie.
  #walkRay(world, tx, ty) {
    const D = world.dungeon, ax = this.x, ay = this.y;
    const L = Math.hypot(tx - ax, ty - ay), steps = Math.ceil(L / 5);
    const r = Math.min(4, this.radius ?? 4);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (L * (1 - t) < 6) break; // am Ziel selbst nicht prüfen
      const x = ax + (tx - ax) * t, y = ay + (ty - ay) * t;
      if (D.collidesRect(x - r, y - 2, x + r, y + 1)) return false;
    }
    return true;
  }

  #beginSpecial(world, sp, toHero) {
    this.special = sp;
    this.lastSpecial = sp;
    this.nextSpecial = null;
    this.aim = toHero;
    this.setState('special');
    this.specialPhase = 'windup';
    this.tickT = 0;
    const anim = this.animator.anims[sp.anim] ? sp.anim : 'windup';
    this.#play(sp.kind === 'spin' ? 'windup' : anim, true);
    world.bus.emit('telegraph', { actor: this, special: sp.kind });
    if (NEW_KINDS.has(sp.kind)) { this.#beginNewSpecial(world, sp); return; }
    if (sp.kind === 'slam') {
      this.slamAt = { x: this.x + this.facing * (sp.offset ?? 16), y: this.y + 2 };
      world.spawn(new Telegraph(this.slamAt.x, this.slamAt.y, { shape: 'circle', r: sp.radius, duration: sp.windup }));
    } else if (sp.kind === 'spin') {
      world.spawn(new Telegraph(this.x, this.y, { shape: 'circle', r: sp.radius, duration: sp.windup, follow: this }));
    } else if (sp.kind === 'charge') {
      world.spawn(new Telegraph(this.x, this.y, { shape: 'line', angle: toHero, len: sp.speed * sp.duration, width: 22, duration: sp.windup, screen: true }));
    } else if (sp.kind === 'cloud') {
      // Wolke dort, wo der Held beim Ausholen steht
      this.cloudAt = { x: world.hero.x, y: world.hero.y };
      world.spawn(new Telegraph(this.cloudAt.x, this.cloudAt.y, { shape: 'circle', r: sp.radius, duration: sp.windup, color: CLOUD_TELE[sp.element] }));
    } else if (sp.kind === 'summon') {
      world.particles.magic?.(this.x, this.y - 14, 12, 10);
    }
  }

  #updateSpecial(dt, world, toHero) {
    const sp = this.special;
    if (NEW_KINDS.has(sp.kind)) { this.#updateNewSpecial(dt, world, sp); return; }
    if (this.specialPhase === 'windup') {
      this.vx *= 0.8; this.vy *= 0.8;
      if (sp.kind !== 'charge' && this.stateTime < sp.windup * 0.6 && Math.abs(Math.cos(toHero)) > 0.1) this.facing = Math.sign(Math.cos(toHero));
      if (this.stateTime < sp.windup) return;
      this.specialPhase = 'active';
      this.stateTime = 0;
      if (sp.kind === 'slam') {
        const { x, y } = this.slamAt;
        if (!this.animator.anims[sp.anim]) this.#play('strike', true);
        world.combat.add({ owner: this, team: 'enemy', shape: 'circle', follow: false, x, y: y - 4, r: sp.radius, damage: this.#dmg(sp.damage), knockback: 220, heavy: true, ttl: 0.12 });
        world.particles.dust(x, y, 16, '#4d4459');
        world.particles.ring(x, y, 8, sp.radius * 0.6, sp.colors ?? ['#fff0b0', '#ffb640', '#f07a1c'], 100);
        world.decals.scorch?.(x, y, sp.radius * 0.35);
        world.session.camera?.shake(6);
        world.session.hitstop?.(0.05);
        if (sp.wave) world.addEffect(new DamageWave(x, y, this, { maxR: sp.wave, duration: 0.8, damage: this.#dmg(sp.damage * 0.5), color: sp.waveColor ?? [255, 140, 60] }));
        world.bus.emit('spellImpact', { x, y, element: sp.element ?? 'fire', radius: sp.radius, big: true });
      } else if (sp.kind === 'spin') {
        this.#play(this.animator.anims.spin ? 'spin' : 'strike', true);
        world.bus.emit('enemySwing', { actor: this, heavy: true });
      } else if (sp.kind === 'charge') {
        this.charge = { speed: sp.speed, duration: sp.duration, stun: sp.stun ?? 1.4 };
        this.setState('charging');
        this.#play(this.animator.anims.charge ? 'charge' : 'walk', true);
        world.combat.add({ owner: this, team: 'enemy', shape: 'circle', follow: true, offX: 0, offY: -8, x: this.x, y: this.y, r: 14, damage: this.#dmg(sp.damage), knockback: 240, heavy: true, ttl: sp.duration });
        this.specialTimer = sp.cooldown;
        return;
      } else if (sp.kind === 'cloud') {
        if (!this.animator.anims[sp.anim]) this.#play('strike', true);
        const { x, y } = this.cloudAt;
        world.spawn(new HazardCloud(x, y, this, { radius: sp.radius, duration: sp.duration ?? 5, damage: this.#dmg(sp.damage), tick: sp.tick ?? 0.5, element: sp.element ?? 'poison' }));
        world.bus.emit('spellImpact', { x, y, element: sp.element ?? 'poison', radius: sp.radius, big: false });
      } else if (sp.kind === 'summon') {
        if (!this.animator.anims[sp.anim]) this.#play('strike', true);
        this.summons = (this.summons ?? []).filter((e) => !e.dead && !e.removed);
        const n = Math.min(sp.count ?? 1, (sp.max ?? 3) - this.summons.length);
        for (let i = 0; i < n; i++) {
          const a = (i / Math.max(1, n)) * Math.PI * 2 + rand(-0.4, 0.4);
          const p = world.dungeon.nearestFree?.(this.x + Math.cos(a) * 22, this.y + Math.sin(a) * 14, 4) ?? { x: this.x, y: this.y };
          const e = world.spawnEnemy(sp.type, p.x, p.y, { home: { x: this.home.x, y: this.home.y }, summoned: true });
          e.leashFree = this.leashFree;
          e.xpOverride = Math.max(1, Math.round((e.def.xp ?? 10) * 0.2));
          this.summons.push(e);
          world.particles.magic?.(p.x, p.y - 6, 10, 8);
        }
        world.bus.emit('enemySummon', { actor: this, type: sp.type, count: n });
      }
      return;
    }
    // aktiv
    if (sp.kind === 'spin') {
      const d = Math.hypot(world.hero.x - this.x, world.hero.y - this.y) || 1;
      const s = this.moveSpeed * (sp.speedMul ?? 0.8);
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
    this.#play('idle');
  }

  #strike(world) {
    const A = this.def.attack;
    this.setState('strike');
    this.#play('strike', true);
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
    } else if (A.kind === 'ranged' && A.projectile !== 'lob') {
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
      this.#play(this.animator.anims.charge ? 'charge' : 'walk', true);
      world.combat.add({ owner: this, team: 'enemy', shape: 'circle', follow: true, offX: 0, offY: -6, x: this.x, y: this.y, r: A.hitRadius ?? 11, damage: this.#dmg(A.damage), knockback: A.knockback, heavy: true, ttl: A.active });
      world.bus.emit('lunge', { actor: this });
    } else if (A.kind === 'slam') {
      const { x, y } = this.slamAt ?? { x: this.x + this.facing * 14, y: this.y };
      world.combat.add({ owner: this, team: 'enemy', shape: 'circle', follow: false, x, y: y - 4, r: A.radius, damage: this.#dmg(A.damage), knockback: A.knockback, heavy: true, ttl: 0.12 });
      world.particles.dust(x, y, 10, '#4d4459');
      if (A.colors) world.particles.ring(x, y, 6, A.radius * 0.6, A.colors, 80);
      world.session.camera?.shake(3);
      world.bus.emit('enemySwing', { actor: this, heavy: true });
    } else if (A.kind === 'dive') {
      this.dive = { speed: A.speed, dur: this.diveLen / A.speed };
      this.setState('diving');
      this.#play('dive', true);
      world.combat.add({ owner: this, team: 'enemy', shape: 'circle', follow: true, offX: 0, offY: 0, x: this.x, y: this.y, r: A.hitRadius ?? 9, damage: this.#dmg(A.damage), knockback: A.knockback ?? 150, heavy: true, ttl: this.dive.dur });
      world.bus.emit('lunge', { actor: this });
    } else if (A.projectile === 'lob') {
      this.#play('throw', true);
      const m = this.animator.frame.meta?.hand ? this.#muzzle('hand') : { x: this.x + this.facing * 6, y: this.y - 14 };
      const t = this.lobAt ?? { x: world.hero.x, y: world.hero.y };
      world.addProjectile(new LobBomb(m.x, this.y, t.x, t.y, A.flight, this, { damage: this.#dmg(A.damage), radius: A.radius, burn: A.burn ? { radius: Math.round(A.radius * 0.7), duration: A.burn, damage: this.#dmg(A.damage * 0.15) } : null }));
      world.bus.emit('cast', { actor: this, element: 'fire' });
    } else if (A.kind === 'breath') {
      this.breathT = 0;
      this.#play(this.animator.anims.breath ? 'breath' : 'strike', true);
      world.bus.emit('cast', { actor: this, element: A.element ?? 'fire' });
    }
  }

  takeHit(hit) {
    if (this.dead || this.invuln > 0 || !this.hurtable) return false;
    const w = this.world;
    // Champion „Schildwall“: Schutzblase schluckt Schaden, bis sie bricht
    const cs = this.champState;
    if (cs?.bubble > 0) {
      cs.bubbleHp -= hit.damage;
      cs.bubbleHit = 0.15;
      w?.particles.sparks(this.x, this.y - this.bodyHeight * 0.5, Math.atan2(-hit.dirY, -hit.dirX), 5, ['#ffffff', '#c8e8ff', '#6ab8ff']);
      if (cs.bubbleHp > 0) { if (!this.aggroed && w) this.aggro(w); return false; }
      cs.bubble = 0; hit.damage = Math.max(1, Math.round(-cs.bubbleHp));
      w?.particles.ring(this.x, this.y - this.bodyHeight * 0.5, 10, 14, ['#ffffff', '#c8e8ff', '#6ab8ff'], 90);
    }
    // Schildträger: Treffer von vorn (Schildseite) −80 %, keine Betäubung
    const G = this.def.shield;
    if (G && !hit.dot && this.state !== 'hurt') {
      const from = Math.atan2(-hit.dirY, -hit.dirX), front = this.guardFace > 0 ? 0 : Math.PI;
      if (Math.abs(angleDiff(front, from)) <= (G.arc ?? 2.4) / 2) {
        hit.damage = Math.max(1, Math.round(hit.damage * (G.front ?? 0.2)));
        hit.knockback *= 0.25; hit.heavy = false; hit.noStagger = true;
        this.blockT = 0.4;
        if (w && (this.blockFx ?? 0) <= w.time) { this.blockFx = w.time + 0.25; w.bus.emit('deflect', { x: this.x + this.guardFace * 7, y: this.y - this.bodyHeight * 0.55 }); }
      }
    }
    // Eispanzer: eigener Wert; solange er hält, kommt nur ein Bruchteil durch (schwere Treffer brechen schneller)
    const R = this.def.armor;
    if (R && this.armor > 0 && !hit.dot) {
      this.armor -= hit.damage * (hit.heavy ? R.heavyMul ?? 1.5 : 1);
      this.armorFlash = 0.15;
      hit.damage = Math.max(1, Math.round(hit.damage * (R.intake ?? 0.25)));
      hit.knockback *= 0.3; hit.noStagger = true;
      w?.particles.sparks(this.x, this.y - this.bodyHeight * 0.5, Math.atan2(-hit.dirY, -hit.dirX), 4, ['#ffffff', '#d8f4ff', '#78c0f0']);
      if (this.armor <= 0) this.#shatter(w);
    }
    const dmg = hit.damage;
    const ok = super.takeHit(hit);
    // Champion „Dornen“: wirft 15 % des Nahkampfschadens zurück (nur Hiebe aus nächster Nähe)
    const src = hit.source;
    if (ok && this.champion?.affixes.includes('dornen') && src && src.team !== 'enemy' && !hit.dot && !src.dead && Math.hypot(src.x - this.x, src.y - this.y) < 48) {
      const back = { damage: Math.max(1, Math.round(dmg * 0.15)), dirX: -hit.dirX, dirY: -hit.dirY, knockback: 0, source: this, dot: true };
      if (src.takeHit?.(back)) w?.bus.emit('hit', { attacker: this, target: src, damage: back.damage, crit: false, dot: true, dirX: 0, dirY: 0, x: src.x, y: src.centerY, killed: src.dead });
      w?.particles.sparks(src.x, src.centerY, Math.atan2(src.y - this.y, src.x - this.x), 4, ['#fff0c0', '#c8a060', '#6a4a20']);
    }
    if (ok && !this.dead && !this.aggroed && w) this.aggro(w);
    return ok;
  }

  onHurt(hit) {
    if (this.shatterNow) { this.shatterNow = false; return; }
    if (hit?.noStagger || this.def.static) return;
    if (this.state === 'idle' || this.state === 'howl') { this.setState('hurt'); this.#play('hurt', true); return; }
    // Schwere Treffer unterbrechen immer, leichte nur außerhalb des Zuschlags
    if (this.state === 'strike' && !hit.heavy) return;
    if (this.state === 'charging' || this.state === 'special' || ((this.def.elite || this.champion) && !hit.heavy) || this.def.stagger === false) return;
    this.setState('hurt');
    this.#play('hurt', true);
  }

  die(hit) {
    // Schlackensprenger: Getötet während die Lunte brennt -> die Ladung geht trotzdem hoch (Warnung liegt schon)
    const sp = this.special;
    if (this.state === 'special' && sp?.kind === 'explode' && this.specialPhase === 'windup' && !this.exploded) {
      this.pendingBlast = { t: Math.max(0, sp.windup - this.stateTime), sp };
    }
    this.#unhideAll();
    super.die(hit);
    this.hurtable = false;
    this.setState('dead');
    this.#play('death', true);
    this.offHit?.(); this.offHit = null;
  }

  // ------------------------------------------------------------------ Runde 5: neue Verhaltensweisen
  // Erster Takt: Zonenvariante (gleiche Typ-ID, andere Stufe je Zone), Eispanzer, Totem
  #init(world) {
    this.inited = true;
    if (!this.rareId) this.#applyZoneVariant(world);
    if (this.def.armor) { this.armorMax = this.armor = Math.round(this.maxHp * (this.def.armor.share ?? 0.5)); this.bare = false; }
    if (this.def.static) this.aggroed = true; // Gruppe/Söldner greifen Totems an
  }

  // def.zoneVariants = { <zoneId>: { levels: [a, b], hp, damage, xp } } – Werte der Grundstufe a
  #applyZoneVariant(world) {
    const v = this.def.zoneVariants?.[world.zone?.id];
    if (!v) return;
    const lo = v.levels?.[0] ?? this.level, hi = v.levels?.[1] ?? lo;
    const L = lo + Math.floor(Math.random() * (hi - lo + 1));
    const hpFactor = this.maxHp / (this.def.hp * this.lvlPower); // hpScale, Gruppe, Champion bleiben erhalten
    this.level = L;
    this.lvlPower = 1 + (L - lo) * 0.08;
    this.maxHp = this.hp = Math.round(v.hp * this.lvlPower * hpFactor);
    this.dmgMul *= v.damage / (this.def.attack?.damage || v.damage);
    this.power = this.lvlPower * this.dmgMul;
    this.xpOverride = Math.round(v.xp * (1 + (L - lo) * 0.12));
    this.variant = world.zone.id;
  }

  // Stufe nachträglich setzen (Teilstücke, gerufene Begleiter übernehmen die Stufe des Verursachers)
  setLevelTo(L) {
    const base = this.def.levels?.[0] ?? this.def.level ?? 1;
    const f = this.maxHp / (this.def.hp * this.lvlPower);
    this.level = L;
    this.lvlPower = 1 + (L - base) * 0.08;
    this.power = this.lvlPower * this.dmgMul;
    this.maxHp = this.hp = Math.max(1, Math.round(this.def.hp * this.lvlPower * f));
    this.xpOverride = L !== base ? Math.max(1, Math.round((this.def.xp ?? 10) * (1 + (L - base) * 0.12))) : undefined;
    return this;
  }

  #scaleBody(s) {
    this.bodyHeight = Math.round(this.bodyHeight * s);
    this.hurtRadius = Math.round(this.hurtRadius * s);
    this.radius = Math.round(this.radius * Math.min(s, 1.25));
    this.shadowW = Math.round(this.shadowW * s);
    this.mass *= s * s;
  }

  // Champion (Datenvertrag: enemy.champion = { affixes, labels, color }, enemy.displayName)
  makeChampion(affixes = null) {
    if (this.champion) return this;
    const keys = Object.keys(CHAMPION_AFFIXES);
    let list = (affixes ?? []).filter((a) => CHAMPION_AFFIXES[a]);
    if (!list.length) {
      const n = this.level >= 20 && Math.random() < 0.5 ? 2 : 1;
      while (list.length < n) { const k = keys[Math.floor(Math.random() * keys.length)]; if (!list.includes(k)) list.push(k); }
    }
    this.champion = { affixes: list, labels: list.map((a) => CHAMPION_AFFIXES[a].label), color: CHAMPION_AFFIXES[list[0]].color };
    this.displayName = `${this.def.name}, Champion`;
    this.champState = { t: 0, trailT: 0.3, wallT: 2, bubble: 0, bubbleHp: 0, bubbleHit: 0, blinkT: 1.2, blink: null, called: false, ghosts: [], ghostT: 0 };
    this.maxHp = this.hp = Math.round(this.maxHp * CHAMPION.hp);
    if (this.armorMax) this.armorMax = this.armor = Math.round(this.armorMax * CHAMPION.hp);
    this.dmgMul *= CHAMPION.damage;
    this.power = this.lvlPower * this.dmgMul;
    if (list.includes('flink')) this.speedMul = (this.speedMul ?? 1) * 1.35;
    this.#scaleBody(CHAMPION.scale);
    this.look = { scale: (this.look?.scale ?? 1) * CHAMPION.scale, tint: this.look?.tint ?? null };
    return this;
  }

  #championTick(dt, world) {
    const A = this.champion.affixes, S = this.champState, h = world.hero;
    S.t += dt;
    const eng = this.aggroed && this.isEngaged && !h.dead;
    const dist = Math.hypot(h.x - this.x, h.y - this.y);
    S.bubbleHit = Math.max(0, S.bubbleHit - dt);
    if (this.vampLink) { this.vampLink.t -= dt; if (this.vampLink.t <= 0) this.vampLink = null; }
    if (A.includes('vampir') && !this.offHit) this.offHit = world.bus.on('hit', (e) => this.#vampHit(e, world));
    // Feuerspur: Glutflecken, die 0,6 s als blinkender Rand warnen, bevor sie brennen
    if (A.includes('feuerspur') && eng && Math.hypot(this.vx, this.vy) > 12) {
      S.trailT -= dt;
      if (S.trailT <= 0) {
        S.trailT = 0.45;
        world.spawn(new HazardCloud(this.x, this.y, this, { radius: 11, duration: 3.4, damage: Math.max(1, Math.round(this.#dmg(this.def.attack?.damage ?? 20) * 0.12)), tick: 0.5, element: 'fire', arm: 0.6 }));
      }
    }
    // Schildwall: alle ~8 s eine Schutzblase (2,5 s), die 20 % Leben schluckt
    if (A.includes('schildwall')) {
      S.bubble = Math.max(0, S.bubble - dt);
      S.wallT -= dt;
      if (eng && S.wallT <= 0 && S.bubble <= 0) {
        S.wallT = 8; S.bubble = 2.5; S.bubbleHp = Math.round(this.maxHp * 0.2);
        world.particles.ring(this.x, this.y - this.bodyHeight * 0.5, 10, 16, ['#ffffff', '#c8e8ff', '#6ab8ff'], 40);
      }
    }
    // Blinzeln: Ziel neben dem Helden flimmert 0,6 s, dann Sprung (kein Schaden; danach normaler Angriff mit Warnung)
    if (A.includes('blinzeln')) {
      S.blinkT -= dt;
      if (S.blink) {
        S.blink.t += dt;
        if (!['chase', 'recover', 'retreat'].includes(this.state)) S.blink = null;
        else if (S.blink.t >= 0.6) {
          world.particles.magic?.(this.x, this.y - 8, 10, 8);
          this.x = S.blink.x; this.y = S.blink.y; this.vx = this.vy = 0; this.kbx = this.kby = 0;
          world.particles.magic?.(this.x, this.y - 8, 12, 8);
          this.cooldown = Math.max(this.cooldown, 0.45);
          S.blink = null; S.blinkT = 7;
        }
      } else if (eng && S.blinkT <= 0 && this.state === 'chase' && dist > 56) {
        const p = this.#pickNear(world, h, 26);
        if (p) S.blink = { x: p.x, y: p.y, t: 0 }; else S.blinkT = 1.5;
      }
    }
    // Rudelrufer: einmal bei 50 % Leben zwei Begleiter (keine Champions, Stufe wie der Rufer)
    if (A.includes('rudelrufer') && !S.called && this.hp < this.maxHp * 0.5) {
      S.called = true;
      const type = this.def.packType ?? this.type;
      for (let i = 0; i < 2; i++) {
        const a = i * Math.PI + rand(-0.6, 0.6);
        const p = world.dungeon.nearestFree?.(this.x + Math.cos(a) * 24, this.y + Math.sin(a) * 14, 5) ?? { x: this.x, y: this.y };
        const e = world.spawnEnemy(type, p.x, p.y, { home: { x: this.home.x, y: this.home.y }, respawned: true });
        e.summoned = true; e.leashFree = this.leashFree; e.aggroed = true;
        e.setLevelTo(this.level);
        world.particles.ring(p.x, p.y - 4, 6, 10, ['#fff0b0', '#ffd84a', '#b8862a'], 50);
      }
      world.particles.ring(this.x, this.y - this.bodyHeight * 0.6, 10, 18, ['#fff0b0', '#ffd84a', '#b8862a'], 80);
      world.bus.emit('howl', { actor: this });
    }
    // Frostaura: verlangsamt im sichtbaren Ring (70 px)
    if (A.includes('frostaura') && !h.dead && this.aggroed && Math.hypot(h.x - this.x, (h.y - this.y) / 0.6) < 70) h.buff?.('champ_frost', 0.25, { moveSpeed: 0.7 });
    // Flink: Nachbilder
    if (A.includes('flink')) {
      S.ghostT -= dt;
      if (S.ghostT <= 0 && Math.hypot(this.vx, this.vy) > 20) {
        S.ghostT = 0.06;
        S.ghosts.push({ x: this.x, y: this.y, z: this.z, f: this.currentFrame(), flip: this.facing < 0, t: 0 });
        if (S.ghosts.length > 4) S.ghosts.shift();
      }
      for (const g of S.ghosts) g.t += dt;
      S.ghosts = S.ghosts.filter((g) => g.t < 0.3);
    }
  }

  #vampHit(e, world) {
    if (this.dead || this.removed) { this.offHit?.(); this.offHit = null; return; }
    if (e.attacker !== this || !e.target || e.target.team === 'enemy' || !(e.damage > 0)) return;
    const n = Math.min(this.maxHp - this.hp, Math.max(1, Math.round(e.damage * 0.25)));
    this.vampLink = { x: e.target.x, y: e.target.centerY, t: 0.5 };
    if (n <= 0) return;
    this.hp += n;
    world.bus.emit('heal', { actor: this, amount: n });
  }

  // Freier Platz in ~r um den Helden mit Sichtlinie (Blinzeln)
  #pickNear(world, h, r) {
    const D = world.dungeon, out = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, x = h.x + Math.cos(a) * r, y = h.y + Math.sin(a) * r * 0.7;
      if (this.#free(world, x, y) && D.lineOfSight(h.x, h.y - 4, x, y - 4)) out.push({ x, y });
    }
    return out.length ? out[Math.floor(Math.random() * out.length)] : null;
  }

  #free(world, x, y) {
    const r = Math.max(4, Math.min(6, this.radius ?? 5));
    return x > 10 && y > 10 && x < world.pixelW - 10 && y < world.pixelH - 6 && !world.dungeon.collidesRect(x - r, y - 3, x + r, y + 1);
  }

  // Nach jedem Takt: Schildseite (verzögert drehen) und Flughöhe
  #postUpdate(dt, world, dx) {
    if (this.def.shield && !this.dead) {
      const want = Math.abs(dx) > 3 ? Math.sign(dx) : this.guardFace;
      if (want !== this.guardFace && !['special', 'windup', 'strike'].includes(this.state)) {
        this.turnT = (this.turnT ?? 0) + dt;
        if (this.turnT >= (this.def.shield.turnDelay ?? 0.7)) { this.guardFace = want; this.turnT = 0; }
      } else this.turnT = 0;
      this.facing = this.guardFace;
    }
    if (this.def.flying) {
      const H = this.def.flying.hover ?? 12, st = this.state;
      const target = this.dead || st === 'diving' || st === 'recover' ? 0 : st === 'windup' ? H + 8 : H + Math.sin((world.time + this.strafeSeed) * 4) * 1.5;
      const rate = st === 'diving' ? (H + 8) / Math.max(0.1, this.dive?.dur ?? 0.3) : this.dead ? 70 : 28;
      this.z += Math.max(-rate * dt, Math.min(rate * dt, target - this.z));
    }
  }

  // Flieger bewegen sich frei über Hindernisse (Kartenrand begrenzt); tot fallen sie normal
  integrate(dt, world) {
    if (!this.def.flying || this.dead) return super.integrate(dt, world);
    this.x += (this.vx + this.kbx) * dt; this.y += (this.vy + this.kby) * dt;
    const f = Math.exp(-dt * 11);
    this.kbx *= f; this.kby *= f;
    this.x = Math.max(10, Math.min(world.pixelW - 10, this.x));
    this.y = Math.max(14, Math.min(world.pixelH - 6, this.y));
    return { hitX: false, hitY: false };
  }

  // Flieger: kreist im Abstand um den Helden, stößt herab, wenn er darf
  #flyChase(dt, world, dx, dy, dist) {
    const A = this.def.attack, F = this.def.flying;
    if (dist > this.def.aggro * 2.5 && !this.leashFree) { this.#returnHome(world); return; }
    if (this.orbitA === undefined) this.orbitA = Math.atan2(-dy, -dx);
    this.orbitA += dt * (F.orbitSpeed ?? 0.8) * this.sidestep;
    const R = F.orbit ?? 64, h = world.hero;
    const tx = h.x + Math.cos(this.orbitA) * R, ty = h.y + Math.sin(this.orbitA) * R * 0.7;
    const ox = tx - this.x, oy = ty - this.y, od = Math.hypot(ox, oy);
    const sp = od > 4 ? this.moveSpeed * Math.min(1.2, od / 40 + 0.35) : 0;
    const k = 1 - Math.exp(-dt * 5);
    this.vx += ((ox / (od || 1)) * sp - this.vx) * k;
    this.vy += ((oy / (od || 1)) * sp - this.vy) * k;
    if (Math.abs(dx) > 2) this.facing = Math.sign(dx);
    this.#play('walk');
    const waiting = this.cooldown > 0 || !(world.spawner?.canAttack(this) ?? true);
    if (!waiting && dist < A.range && dist >= (A.minRange ?? 0)) this.#beginWindup(world, Math.atan2(dy, dx));
  }

  // Zusätze im Todeszustand; true = Leichen-Logik überspringen
  #updateDeadExtras(dt, world) {
    if (this.pendingBlast) {
      this.pendingBlast.t -= dt;
      if (this.pendingBlast.t <= 0) { const sp = this.pendingBlast.sp; this.pendingBlast = null; this.#explodeNow(world, sp, false); }
      return true;
    }
    if (this.exploded) {
      this.blastT = (this.blastT ?? 0) - dt;
      if (this.blastT <= 0) this.removed = true;
      return true;
    }
    // Moorschleim: zerfällt in kleine Schleime (die nicht weiter teilen)
    const T = this.def.split;
    if (T && !this.splitDone) {
      this.splitDone = true;
      for (let i = 0; i < (T.count ?? 2); i++) {
        const a = (i / (T.count ?? 2)) * Math.PI * 2 + rand(-0.5, 0.5);
        const p = world.dungeon.nearestFree?.(this.x + Math.cos(a) * 10, this.y + Math.sin(a) * 6, 4) ?? { x: this.x, y: this.y };
        const e = world.spawnEnemy(T.type, p.x, p.y, { home: { x: this.home.x, y: this.home.y }, group: this.group });
        e.summoned = true; e.leashFree = this.leashFree;
        e.setLevelTo(this.level);
        e.invuln = 0.35;
        e.kbx = Math.cos(a) * 90; e.kby = Math.sin(a) * 60;
        e.cooldown = 0.8;
        e.aggro(world, { alertGroup: false });
        world.particles.dust(p.x, p.y, 4, '#4a5a30');
      }
      world.particles.ring(this.x, this.y - 4, 8, 14, ['#c8e070', '#7a9a38', '#3a4a1a'], 70);
    }
    return false;
  }

  // Ortsfeste Gegner (Staubtotem): heilen Verbündete im Ring, vergehen nach einiger Zeit
  #updateStatic(dt, world) {
    const T = this.def.totem ?? {};
    this.vx = this.vy = 0; this.kbx = this.kby = 0;
    if (this.state === 'dead') {
      if (this.animator.finished) { this.corpseTimer += dt; if (this.corpseTimer > 0.4) this.removed = true; }
      return;
    }
    if (this.state === 'spawn') {
      this.rise = Math.min(1, this.stateTime / 0.5);
      if (Math.random() < 0.5) world.particles.dust(this.x + rand(-4, 4), this.y, 1, '#8a7050');
      if (this.rise >= 1) { this.hurtable = true; this.setState('idle'); }
      return;
    }
    if (this.state !== 'idle') this.setState('idle');
    this.#play('idle');
    this.lifeLeft = (this.lifeLeft ?? T.life ?? 25) - dt;
    if (this.lifeLeft <= 0) { this.killReported = true; this.hp = 0; this.die({}); return; } // vergeht: kein Abschuss
    this.pulseVis = Math.max(0, (this.pulseVis ?? 0) - dt);
    this.pulseT = (this.pulseT ?? 0.8) - dt;
    if (this.pulseT > 0) return;
    this.pulseT = T.every ?? 2; this.pulseVis = 0.6;
    const R = T.radius ?? 80;
    for (const e of world.enemies) {
      if (e.dead || e.def.static || e.isHidden || e.hp >= e.maxHp) continue;
      if (Math.hypot(e.x - this.x, (e.y - this.y) / 0.6) > R) continue;
      const n = Math.max(1, Math.round(e.maxHp * (T.heal ?? 0.05)));
      e.hp = Math.min(e.maxHp, e.hp + n);
      world.bus.emit('heal', { actor: e, amount: n });
    }
    world.particles.ring(this.x, this.y - 10, 6, 10, ['#fff8e0', '#f0d8a0', '#c8a060'], 50);
  }

  #specialReady(sp, world) {
    if (sp.kind === 'heal') return !!this.#healTarget(world, sp);
    if (sp.kind === 'totem') { this.totems = (this.totems ?? []).filter((e) => !e.dead && !e.removed); return this.totems.length < (sp.max ?? 1); }
    if (sp.kind === 'refreeze') return !!this.bare && (this.bareT ?? 0) >= (sp.after ?? 12);
    return true;
  }

  #healTarget(world, sp) {
    let best = null, bv = sp.below ?? 0.7;
    for (const e of world.enemies) {
      if (e.dead || e.def.static || e.isHidden || e.hp / e.maxHp >= bv) continue;
      if (Math.hypot(e.x - this.x, e.y - this.y) > (sp.radius ?? 120)) continue;
      bv = e.hp / e.maxHp; best = e;
    }
    return best;
  }

  #phase(p) { this.specialPhase = p; this.stateTime = 0; }
  #hideUnder() { this.burrowed = true; this.hurtable = false; this.solid = false; this.rise = 0; }
  #goneStart() { this.gone = true; this.hurtable = false; this.solid = false; this.rise = 0; this.alpha = 0; }
  #unhideAll() {
    if (!this.burrowed && !this.gone) return;
    this.burrowed = false; this.gone = false; this.rise = 1; this.alpha = 1;
    if (!this.dead) { this.hurtable = true; this.solid = true; }
  }

  // Sofortschaden in einer Bodenellipse (Fußpunkt, wie Telegraph circle) – unabhängig davon, ob der Verursacher noch lebt
  #blast(world, x, y, r, damage, kb) {
    for (const a of world.actors) {
      if (a.team !== 'hero' || a.dead || !a.hurtable) continue;
      const dx = a.x - x, dy = (a.y - y) / 0.6, d = Math.hypot(dx, dy);
      if (d > r) continue;
      const hit = { damage: Math.max(1, Math.round(damage * rand(0.9, 1.1))), dirX: dx / (d || 1), dirY: dy / (d || 1), knockback: kb, heavy: true, source: this };
      if (a.takeHit(hit)) world.bus.emit('hit', { attacker: this, target: a, damage: hit.damage, crit: false, heavy: true, dirX: hit.dirX, dirY: hit.dirY, x: a.x, y: a.centerY, killed: a.dead });
    }
  }

  // Treffer in der Linienwarnung (Bodenraum, Geometrie exakt wie Telegraph 'line' ohne screen)
  #lineStrike(world, x, y, ang, len, width, damage, kb) {
    const c = Math.cos(ang), s = Math.sin(ang) * 0.75, m2 = c * c + s * s;
    for (const a of world.actors) {
      if (a.team !== 'hero' || a.dead || !a.hurtable) continue;
      const rx = a.x - x, ry = a.y - y;
      const u = (c * rx + s * ry) / m2, v = (-s * rx + c * ry) / m2;
      if (u < 0 || u > len || Math.abs(v) > width / 2) continue;
      const hit = { damage: Math.max(1, Math.round(damage * rand(0.9, 1.1))), dirX: Math.cos(ang), dirY: Math.sin(ang), knockback: kb, heavy: true, source: this };
      if (a.takeHit(hit)) world.bus.emit('hit', { attacker: this, target: a, damage: hit.damage, crit: false, heavy: true, dirX: hit.dirX, dirY: hit.dirY, x: a.x, y: a.centerY, killed: a.dead });
    }
  }

  #explodeNow(world, sp, self) {
    const { x, y } = this.blastAt ?? { x: this.x, y: this.y };
    this.exploded = true;
    this.#blast(world, x, y, sp.radius, this.#dmg(sp.damage), sp.knockback ?? 220);
    world.particles.ring(x, y - 4, 12, 26, ['#ffffff', '#fff0b0', '#ffb640', '#f07a1c', '#5a2a10'], 150);
    world.particles.dust(x, y, 16, '#3a3036');
    world.particles.embers?.(x, y - 4, 10);
    world.decals.scorch?.(x, y, sp.radius * 0.45);
    world.session?.camera?.shake(6);
    world.bus.emit('spellImpact', { x, y, element: 'fire', radius: sp.radius, big: true });
    // Mit eigener Explosionsanimation (strike) bleibt die Figur bis zu deren Ende sichtbar, sonst verschwindet sie sofort
    const anim = this.#has('strike') && sp.blastAnim ? sp.blastAnim : 0;
    this.blastT = anim;
    if (!anim) this.alpha = 0;
    if (self && !this.dead) { this.hp = 0; this.die({ damage: 0, dirX: 0, dirY: 0, knockback: 0 }); }
    if (anim) this.#play('strike', true);
  }

  #shatter(w) {
    this.armor = 0; this.bare = true; this.bareT = 0;
    if (this.state !== 'special' && this.state !== 'charging' && this.state !== 'diving') {
      this.setState('hurt');
      this.hurtOverride = this.def.armor.stun ?? 1.2;
      this.#play('shatter', true);
      this.shatterNow = true;
    }
    if (!w) return;
    w.particles.ring(this.x, this.y - this.bodyHeight * 0.5, 14, 22, ['#ffffff', '#d8f4ff', '#78c0f0', '#1e4a8a'], 120);
    w.bus.emit('spellImpact', { x: this.x, y: this.y, element: 'frost', radius: 18, big: true });
    w.session?.camera?.shake(3);
  }

  // Ziel des Blinzelns: hinter dem Helden (Phasengeist) oder freie Uferstelle mit Sicht (Sumpfhexe)
  #pickBlink(world, sp) {
    const h = world.hero, D = world.dungeon;
    if (sp.behind) {
      const f = h.facing || 1;
      for (const [ox, oy] of [[-f * 22, 0], [-f * 18, 9], [-f * 18, -9], [0, 16], [0, -16], [f * 22, 0]]) {
        const x = h.x + ox, y = h.y + oy;
        if (this.#free(world, x, y) && D.lineOfSight(h.x, h.y - 4, x, y - 4)) return { x, y };
      }
      return { x: this.x, y: this.y };
    }
    let fallback = null;
    for (let i = 0; i < 48; i++) {
      const a = rand(0, Math.PI * 2), r = rand(sp.minDist ?? 64, sp.maxDist ?? 130);
      const x = h.x + Math.cos(a) * r, y = h.y + Math.sin(a) * r * 0.75;
      if (!this.#free(world, x, y) || !D.lineOfSight(x, y - 6, h.x, h.y - 6)) continue;
      if (Math.hypot(x - this.home.x, y - this.home.y) > this.def.leash * 0.85) continue;
      const tx = Math.floor(x / 16), ty = Math.floor(y / 16);
      if ([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([a2, b2]) => D.rows?.[ty + b2]?.[tx + a2] === '~')) return { x, y };
      fallback ??= { x, y };
    }
    return fallback ?? { x: this.x, y: this.y };
  }

  #beginNewSpecial(world, sp) {
    const h = world.hero;
    const gAng = Math.atan2(h.y - this.y, h.x - this.x), eAng = Math.atan2((h.y - this.y) / 0.6, h.x - this.x);
    switch (sp.kind) {
      case 'burrow':
        this.#play('dig', true);
        world.particles.dust(this.x, this.y, 6, sp.trailColor ?? '#5a4636');
        break;
      case 'bash':
        this.bashAng = eAng;
        world.spawn(new Telegraph(this.x, this.y, { shape: 'arc', r: sp.reach, angle: eAng, arc: sp.arc, duration: sp.windup }));
        break;
      case 'explode':
        this.blastAt = { x: this.x, y: this.y };
        this.#play('windup', true);
        world.spawn(new Telegraph(this.x, this.y, { shape: 'circle', r: sp.radius, duration: sp.windup }));
        break;
      case 'totem':
        world.particles.magic?.(this.x, this.y - 14, 10, 10);
        break;
      case 'heal':
        this.healTarget = this.#healTarget(world, sp);
        break;
      case 'net':
        this.netAng = gAng;
        world.spawn(new Telegraph(this.x, this.y, { shape: 'line', angle: gAng, len: sp.len, width: sp.width, duration: sp.windup, screen: true }));
        break;
      case 'blink':
        this.blinkTo = this.#pickBlink(world, sp);
        this.#play('vanish', true);
        break;
      case 'curse':
        this.curseAt = { x: h.x, y: h.y };
        world.spawn(new Telegraph(h.x, h.y, { shape: 'circle', r: sp.radius, duration: sp.windup, color: CLOUD_TELE.curse }));
        break;
      case 'icestrike':
        this.iceAng = Math.atan2((h.y - this.y) / 0.75, h.x - this.x);
        world.spawn(new Telegraph(this.x, this.y, { shape: 'line', angle: this.iceAng, len: sp.len, width: sp.width, duration: sp.windup, color: [140, 200, 255] }));
        break;
      case 'refreeze':
        world.particles.ring(this.x, this.y - this.bodyHeight * 0.5, 16, 12, ['#ffffff', '#d8f4ff', '#78c0f0'], -30);
        break;
    }
  }

  #updateNewSpecial(dt, world, sp) {
    const P = this.specialPhase, t = this.stateTime, h = world.hero;
    const still = () => { this.vx *= 0.8; this.vy *= 0.8; };
    const done = (r = sp.recover ?? 0.6) => { still(); if (t >= r) this.#endSpecial(); };
    switch (sp.kind) {
      case 'burrow': {
        if (P === 'windup') {
          still();
          if (Math.random() < 0.5) world.particles.dust(this.x + rand(-4, 4), this.y, 1, sp.trailColor ?? '#5a4636');
          if (t >= sp.windup) { this.#hideUnder(); this.#phase('travel'); this.#play('mound', true); }
          return;
        }
        if (P === 'travel') {
          const dx = h.x - this.x, dy = h.y - this.y, d = Math.hypot(dx, dy);
          let mx = dx / (d || 1), my = dy / (d || 1);
          this.walkCheck = (this.walkCheck ?? 0) - dt;
          if (this.walkCheck <= 0) { this.walkCheck = 0.25; this.walkClear = this.#walkRay(world, h.x, h.y); }
          if (!this.walkClear) { const f = world.flow.direction(this.x, this.y - 2); if (f) { mx = f.x; my = f.y; } }
          this.vx = mx * sp.speed; this.vy = my * sp.speed;
          if (Math.abs(dx) > 2) this.facing = Math.sign(dx);
          if (Math.random() < 0.7) world.particles.dust(this.x + rand(-4, 4), this.y + rand(-1, 1), 1, sp.trailColor ?? '#5a4636');
          if (d < 5 || t >= (sp.maxTravel ?? 3)) {
            this.vx = this.vy = 0;
            this.emergeAt = { x: this.x, y: this.y };
            world.spawn(new Telegraph(this.x, this.y, { shape: 'circle', r: sp.radius, duration: sp.warn ?? 0.75, color: sp.color }));
            world.bus.emit('telegraph', { actor: this, special: 'burrow' });
            this.#phase('warn');
          }
          return;
        }
        if (P === 'warn') {
          this.vx = this.vy = 0; this.kbx = this.kby = 0;
          if (Math.random() < 0.6) world.particles.dust(this.x + rand(-sp.radius * 0.6, sp.radius * 0.6), this.y + rand(-3, 3), 1, sp.trailColor ?? '#5a4636');
          if (t >= (sp.warn ?? 0.75)) {
            const { x, y } = this.emergeAt;
            this.x = x; this.y = y;
            this.#unhideAll();
            this.#play('emerge', true);
            world.combat.add({ owner: this, team: 'enemy', shape: 'circle', follow: false, x, y, lift: 0, r: sp.radius, damage: this.#dmg(sp.damage), knockback: sp.knockback ?? 180, heavy: true, ttl: 0.12 });
            world.particles.ring(x, y - 2, 10, sp.radius * 0.7, sp.colors ?? ['#bca080', '#7a6048', '#3a2a20'], 110);
            world.particles.dust(x, y, 12, sp.trailColor ?? '#5a4636');
            world.session?.camera?.shake(sp.radius > 22 ? 4 : 2);
            world.bus.emit('enemySwing', { actor: this, heavy: true });
            this.#phase('recover');
          }
          return;
        }
        done(sp.recover ?? 0.7);
        return;
      }
      case 'bash':
        if (P === 'windup') {
          still();
          if (t >= sp.windup) {
            this.#play('strike', true);
            world.combat.add({ owner: this, team: 'enemy', shape: 'arc', follow: false, x: this.x, y: this.y, lift: 0, r: sp.reach, angle: this.bashAng, arc: sp.arc, damage: this.#dmg(sp.damage), knockback: sp.knockback ?? 260, heavy: true, ttl: 0.1 });
            world.particles.dust(this.x + this.guardFace * 10, this.y, 6, '#5a5060');
            world.bus.emit('enemySwing', { actor: this, heavy: true });
            this.#phase('active');
          }
          return;
        }
        done(sp.recover ?? 0.6);
        return;
      case 'explode':
        this.vx = this.vy = 0;
        if (Math.random() < 0.8) world.particles.embers?.(this.x + this.facing * 3, this.y - this.bodyHeight + 2, 1);
        if (t >= sp.windup && !this.exploded) this.#explodeNow(world, sp, true);
        return;
      case 'totem':
        if (P === 'windup') {
          still();
          if (t >= sp.windup) {
            const a = Math.atan2(this.y - h.y, this.x - h.x);
            const p = world.dungeon.nearestFree?.(this.x + Math.cos(a) * 18, this.y + Math.sin(a) * 10, 5) ?? { x: this.x, y: this.y };
            const e = world.spawnEnemy(sp.type, p.x, p.y, { home: { x: p.x, y: p.y }, respawned: true });
            e.summoned = true; e.leashFree = true;
            e.setLevelTo(this.level);
            this.totems = [...(this.totems ?? []), e];
            world.particles.magic?.(p.x, p.y - 8, 14, 10);
            world.bus.emit('enemySummon', { actor: this, type: sp.type, count: 1 });
            this.#phase('active');
          }
          return;
        }
        done(sp.recover ?? 0.6);
        return;
      case 'heal':
        if (P === 'windup') {
          still();
          const T = this.healTarget;
          if (T && !T.dead && Math.random() < 0.6) world.particles.spawn({ x: T.x + rand(-6, 6), y: T.y - rand(0, T.bodyHeight), vx: 0, vy: 0, rise: 18, life: 0.6, colors: ['#ffffff', '#c8ffa0', '#70c050'], emissive: true });
          if (t >= sp.windup) {
            if (T && !T.dead) {
              const n = Math.min(T.maxHp - T.hp, Math.max(1, Math.round(T.maxHp * (sp.amount ?? 0.2))));
              T.hp += n;
              world.bus.emit('heal', { actor: T, amount: n });
            }
            this.#phase('active');
          }
          return;
        }
        done(sp.recover ?? 0.5);
        return;
      case 'net':
        if (P === 'windup') {
          still();
          if (t >= sp.windup) {
            this.#play('throw', true);
            world.addProjectile(new NetShot(this.x, this.y, this.netAng, sp.speed ?? 230, sp.len, this, {
              damage: this.#dmg(sp.damage), root: sp.root ?? 1.2, radius: sp.width / 2 - 1,
              onRoot: (target, w) => w.spawn(new NetSnare(target, sp.root ?? 1.2)),
            }));
            world.bus.emit('shoot', { actor: this });
            this.#phase('active');
          }
          return;
        }
        done(sp.recover ?? 0.5);
        return;
      case 'blink': {
        const to = this.blinkTo;
        if (P === 'windup') {
          still();
          this.alpha = Math.max(0.2, 1 - t / sp.windup) * (Math.sin(t * 40) > 0 ? 1 : 0.6);
          if (t >= sp.windup) {
            world.particles.magic?.(this.x, this.y - 10, 10, 8);
            this.#goneStart();
            if (sp.behind) world.spawn(new Telegraph(to.x, to.y, { shape: 'circle', r: sp.radius, duration: sp.warn, color: [170, 90, 255] }));
            this.#phase('gone');
          }
          return;
        }
        if (P === 'gone') {
          this.vx = this.vy = 0; this.kbx = this.kby = 0;
          if (Math.random() < 0.7) world.particles.spawn({ x: to.x + rand(-5, 5), y: to.y - rand(0, 18), vx: 0, vy: 0, rise: 10, life: 0.4, colors: sp.colors ?? ['#ffffff', '#d0a0ff', '#7040b0'], emissive: true });
          if (t >= sp.warn) {
            this.x = to.x; this.y = to.y;
            this.#unhideAll();
            this.facing = Math.sign(h.x - this.x) || 1;
            this.#play('appear', true);
            if (sp.behind) {
              world.combat.add({ owner: this, team: 'enemy', shape: 'circle', follow: false, x: to.x, y: to.y, lift: 0, r: sp.radius, damage: this.#dmg(sp.damage), knockback: sp.knockback ?? 170, heavy: true, ttl: 0.1 });
              world.addEffect(new SlashEffect(this, Math.atan2(h.centerY - this.centerY, h.x - this.x), SLASH_STYLES.enemy, false, 0.2, true));
              world.bus.emit('enemySwing', { actor: this, heavy: true });
            }
            world.particles.magic?.(this.x, this.y - 10, 12, 10);
            this.#phase('active');
          }
          return;
        }
        still();
        if (t >= (sp.recover ?? 0.5)) {
          this.#endSpecial();
          const nx = sp.then && this.def.specials.find((x) => x.kind === sp.then);
          if (nx) { this.nextSpecial = nx; this.specialTimer = 0.25; }
        }
        return;
      }
      case 'curse':
        if (P === 'windup') {
          still();
          if (t >= sp.windup) {
            const c = this.curseAt;
            world.spawn(new HazardCloud(c.x, c.y, this, { radius: sp.radius, duration: sp.duration ?? 4, damage: this.#dmg(sp.damage), tick: 0.5, element: 'curse', slow: sp.slow ?? 0.6 }));
            world.bus.emit('spellImpact', { x: c.x, y: c.y, element: 'poison', radius: sp.radius, big: false });
            this.#phase('active');
          }
          return;
        }
        done(sp.recover ?? 0.5);
        return;
      case 'icestrike':
        if (P === 'windup') {
          still();
          if (t >= sp.windup) {
            this.#play('strike', true);
            this.#lineStrike(world, this.x, this.y, this.iceAng, sp.len, sp.width, this.#dmg(sp.damage), sp.knockback ?? 160);
            const c = Math.cos(this.iceAng), s = Math.sin(this.iceAng) * 0.75;
            for (let u = 6; u < sp.len; u += 9) world.particles.ring(this.x + c * u, this.y + s * u - 2, 3, 4, ['#ffffff', '#d8f4ff', '#78c0f0'], 50);
            world.session?.camera?.shake(2);
            world.bus.emit('spellImpact', { x: this.x + c * sp.len * 0.5, y: this.y + s * sp.len * 0.5, element: 'frost', radius: 14, big: false });
            this.#phase('active');
          }
          return;
        }
        done(sp.recover ?? 0.7);
        return;
      case 'refreeze':
        if (P === 'windup') {
          still();
          if (Math.random() < 0.7) { const a = rand(0, Math.PI * 2); world.particles.spawn({ x: this.x + Math.cos(a) * 16, y: this.y - 10 + Math.sin(a) * 8, vx: -Math.cos(a) * 30, vy: -Math.sin(a) * 15, life: 0.45, colors: ['#ffffff', '#d8f4ff', '#78c0f0'], emissive: true }); }
          if (t >= sp.windup) {
            this.armor = this.armorMax; this.bare = false; this.bareT = 0;
            world.particles.ring(this.x, this.y - this.bodyHeight * 0.5, 10, 16, ['#ffffff', '#d8f4ff', '#78c0f0'], 60);
            this.#play('idle', true);
            this.#phase('active');
          }
          return;
        }
        done(0.4);
        return;
    }
  }

  // ------------------------------------------------------------------ Zeichnen (Runde 5)
  // Erd-/Schneehügel des eingegrabenen Gegners (eigene Animation 'mound', sonst Pixelhügel)
  #renderMound(ctx, cx, cy) {
    if (this.#has('mound')) { this.currentFrame().draw(ctx, this.x - cx, this.y - cy, { flip: this.facing < 0 }); return; }
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    const snow = this.special?.trail === 'snow';
    const [dark, mid, lite] = snow ? ['#2a3446', '#b8c8dc', '#ffffff'] : ['#1a120e', '#5a4636', '#8a6e50'];
    const w = this.radius >= 8 ? 9 : 6, H = this.radius >= 8 ? 5 : 3;
    const wob = Math.sin(this.stateTime * 20) > 0 ? 1 : 0;
    ctx.fillStyle = 'rgba(4,2,8,0.45)'; ctx.fillRect(x - w - 1, y, 2 * w + 3, 2);
    for (let i = -w; i <= w; i++) {
      const hgt = Math.max(1, Math.round(H * (1 - (i / (w + 1)) ** 2)) + ((i + wob) % 3 === 0 ? 1 : 0));
      ctx.fillStyle = dark; ctx.fillRect(x + i, y - hgt - 1, 1, hgt + 2);
      ctx.fillStyle = mid; ctx.fillRect(x + i, y - hgt, 1, hgt);
      ctx.fillStyle = lite; ctx.fillRect(x + i, y - hgt, 1, 1);
    }
    // Brocken, die vom Hügel rollen
    ctx.fillStyle = mid;
    ctx.fillRect(x - w - 2 + wob, y - 1, 2, 1); ctx.fillRect(x + w + 1 - wob, y, 2, 1);
  }

  // Heilring des Totems (Boden, zart)
  #renderTotemArea(ctx, cx, cy) {
    if (this.dead || this.rise < 1) return;
    const R = this.def.totem.radius ?? 80, x = this.x - cx, y = this.y - cy;
    const n = Math.round(R * 1.4);
    ctx.fillStyle = '#d8b878';
    for (let i = 0; i < n; i++) {
      if ((i + Math.floor(this.stateTime * 6)) % 4) continue;
      const a = (i / n) * Math.PI * 2;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(Math.round(x + Math.cos(a) * R), Math.round(y + Math.sin(a) * R * 0.6), 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  // Champion: farbiger Bodenring, Frostaura-Ring, Dornenkranz
  #renderChampionGround(ctx, cx, cy) {
    const C = this.champion, x = this.x - cx, y = this.y - cy, t = this.champState.t;
    const ring = (R, color, alpha, step = 1, dark = true) => {
      const n = Math.max(16, Math.round(R * 2.4));
      for (let i = 0; i < n; i += step) {
        const a = (i / n) * Math.PI * 2, px = Math.round(x + Math.cos(a) * R), py = Math.round(y + Math.sin(a) * R * 0.6);
        if (dark) { ctx.globalAlpha = alpha * 0.8; ctx.fillStyle = '#0b0710'; ctx.fillRect(px, py + 1, 1, 1); }
        ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.fillRect(px, py, 1, 1);
      }
    };
    // Bodenfleck in Championfarbe unter dem Schatten (der Leuchtring selbst liegt im Emissive-Pass)
    const R = this.#champR();
    ctx.globalAlpha = 0.4 + 0.12 * Math.sin(t * 5); ctx.fillStyle = C.color;
    ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y), R, R * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    ring(R + 2, '#0b0710', 0.8, 1, false);
    for (const d of [0, 1, 2]) ring(R - d, d === 1 ? lighten(C.color, 0.45) : C.color, 0.95, 1, false);
    if (C.affixes.includes('frostaura')) ring(70, '#a8e8ff', 0.35 + 0.1 * Math.sin(t * 3), 2);
    if (C.affixes.includes('dornen')) {
      ctx.fillStyle = '#c8a060';
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + t * 0.5, px = Math.round(x + Math.cos(a) * (R + 3)), py = Math.round(y + Math.sin(a) * (R + 3) * 0.6);
        ctx.globalAlpha = 0.9; ctx.fillStyle = '#2a1c10'; ctx.fillRect(px, py - 2, 1, 3);
        ctx.fillStyle = '#e0c890'; ctx.fillRect(px, py - 3, 1, 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  // Kleine Pixelkrone (7×5) in Championfarbe mit dunkler Kontur
  #renderCrown(ctx, x, y, col, pulse) {
    const rows = ['1.1.1.1', '1111111', '1111111', '.11111.'];
    const lite = lighten(col, 0.5);
    ctx.globalAlpha = 0.9; ctx.fillStyle = '#0b0710';
    rows.forEach((r, j) => { for (let i = 0; i < 7; i++) if (r[i] === '1') ctx.fillRect(x - 3 + i - 1, y + j, 3, 1), ctx.fillRect(x - 3 + i, y + j - 1, 1, 3); });
    ctx.globalAlpha = 1;
    rows.forEach((r, j) => { for (let i = 0; i < 7; i++) if (r[i] === '1') { ctx.fillStyle = j === 1 ? lite : col; ctx.fillRect(x - 3 + i, y + j, 1, 1); } });
    ctx.fillStyle = pulse > 0.6 ? '#ffffff' : lite; ctx.fillRect(x, y + 2, 1, 1);
  }

  // Leuchtring am Boden: ca. 1,6 × Körperbreite (Schattenbreite)
  #champR() { return Math.max(9, Math.round(this.shadowW * 0.8)); }

  // Leuchtende Umrisse, Nachbilder, Blase, Blutfaden
  #renderChampionFx(ctx, cx, cy) {
    const C = this.champion, S = this.champState, f = this.currentFrame(), flip = this.facing < 0, sc = this.look?.scale ?? 1;
    // Leuchtring im späten Pass (über Nachbarn, die davor stehen): 3 px breit, hell, dunkle Außenkante.
    // Vorn halbtransparent, damit Figuren davor lesbar bleiben; der Bogen hinter den eigenen Beinen bleibt frei.
    const x = this.x - cx, y = this.y - cy, R = this.#champR(), pulse = 0.5 + 0.5 * Math.sin(S.t * 4);
    C.affixes.forEach((a, i) => {
      const col = CHAMPION_AFFIXES[a].color, core = lighten(col, 0.55), r0 = R + i * 4, n = Math.max(32, Math.round(r0 * 3.2));
      for (let j = 0; j < n; j++) {
        const an = (j / n) * Math.PI * 2, sn = Math.sin(an), cs = Math.cos(an);
        if (sn < -0.15 && Math.abs(cs) < 0.7) continue; // hinter den Beinen
        const front = sn > 0.15, base = front ? 0.6 : 0.9;
        const P = (rr) => [Math.round(x + cs * rr), Math.round(y + sn * rr * 0.6)];
        let [px, py] = P(r0 + 1);
        ctx.globalAlpha = base * 0.9; ctx.fillStyle = '#0b0710'; ctx.fillRect(px, py + 1, 1, 1);
        ctx.globalAlpha = base; ctx.fillStyle = col; ctx.fillRect(px, py, 1, 1);
        [px, py] = P(r0); ctx.fillStyle = core; ctx.globalAlpha = base * (0.75 + 0.25 * pulse); ctx.fillRect(px, py, 1, 1);
        [px, py] = P(r0 - 1); ctx.fillStyle = col; ctx.globalAlpha = base; ctx.fillRect(px, py, 1, 1);
        const glint = (Math.sin(an * 3 - S.t * 5) + 1) / 2;
        if (glint > 0.92) { [px, py] = P(r0); ctx.globalAlpha = base; ctx.fillStyle = '#ffffff'; ctx.fillRect(px, py, 1, 1); }
      }
    });
    ctx.globalAlpha = 1;
    for (const g of S.ghosts) drawSil(ctx, g.f, CHAMPION_AFFIXES.flink.color, g.flip, g.x - cx, g.y - cy - (g.z ?? 0), sc, 0.35 * (1 - g.t / 0.3), 0);
    // Umrisslinie um die ganze Figur in jedem Frame: Schein (3 Texel, zart), Linie (2 Texel, Kraftfarbe), heller Innenrand (1 Texel).
    // Bei zwei Kräften wechselt die Farbe alle 0,8 s.
    const oc = CHAMPION_AFFIXES[C.affixes[Math.floor(S.t / 0.8) % C.affixes.length]].color;
    const ox = this.x - cx, oy = this.y - cy - (this.z ?? 0);
    drawSil(ctx, f, oc, flip, ox, oy, sc, 0.25 + 0.12 * pulse, 3);
    drawSil(ctx, f, oc, flip, ox, oy, sc, 1, 2);
    drawSil(ctx, f, lighten(oc, 0.6), flip, ox, oy, sc, 0.8 + 0.2 * pulse, 1);
    // Krone über dem Kopf
    this.#renderCrown(ctx, Math.round(ox), Math.round(oy - this.bodyHeight - 15), oc, pulse); // zwischen HP-Balken und Namensschild
    if (S.bubble > 0) {
      const x = Math.round(this.x - cx), y = Math.round(this.y - cy - this.bodyHeight * 0.5 - (this.z ?? 0));
      const rx = Math.round(this.hurtRadius + 6), ry = Math.round(this.bodyHeight * 0.5 + 5);
      const n = Math.round((rx + ry) * 2.2), a0 = S.t * 1.5;
      ctx.fillStyle = S.bubbleHit > 0 ? '#ffffff' : '#9ad0ff';
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        ctx.globalAlpha = (S.bubble < 0.5 && Math.sin(S.t * 30) > 0 ? 0.3 : 0.75) * (0.6 + 0.4 * Math.sin(a * 3 + a0));
        ctx.fillRect(Math.round(x + Math.cos(a) * rx), Math.round(y + Math.sin(a) * ry), 1, 1);
      }
      ctx.globalAlpha = 0.2; ctx.fillStyle = '#6ab8ff';
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (this.vampLink) {
      const L = this.vampLink, x0 = L.x - cx, y0 = L.y - cy, x1 = this.x - cx, y1 = this.centerY - cy - (this.z ?? 0);
      const n = Math.max(4, Math.round(Math.hypot(x1 - x0, y1 - y0) / 2));
      ctx.fillStyle = '#ff4050';
      for (let i = 0; i <= n; i++) {
        const k = i / n;
        ctx.globalAlpha = (L.t / 0.5) * (0.5 + 0.5 * Math.sin(k * 12 - S.t * 20));
        ctx.fillRect(Math.round(x0 + (x1 - x0) * k), Math.round(y0 + (y1 - y0) * k + Math.sin(k * Math.PI) * -6), 1, 1);
      }
      ctx.globalAlpha = 1;
    }
  }

  // Warnungen ohne eigene Bodenfläche: Lunte, Blinzel-Ziel, Totempuls
  #renderWarnings(ctx, cx, cy) {
    const t = this.world?.time ?? 0;
    // Lunte des Schlackensprengers (glimmt, im Countdown hell flackernd)
    if (this.def.fuse && !this.dead && this.aggroed && !this.exploded) {
      const hot = this.state === 'special' && this.special?.kind === 'explode';
      const m = this.animator.frame.meta?.fuse, e = m ? { x: m.dx, y: m.dy } : this.def.fuse, sc = this.look?.scale ?? 1;
      const x = Math.round(this.x - cx + e.x * sc * this.facing), y = Math.round(this.y - cy + e.y * sc - (this.z ?? 0));
      ctx.fillStyle = Math.sin(t * (hot ? 50 : 18)) > 0 ? '#ffffff' : '#ffb640';
      ctx.fillRect(x, y, hot ? 2 : 1, hot ? 2 : 1);
      if (hot) { ctx.globalAlpha = 0.5; ctx.fillStyle = '#ff7020'; ctx.fillRect(x - 1, y - 1, 4, 4); ctx.globalAlpha = 1; }
    }
    // Blinzel-Ziel: flimmernde Säule am Zielort (Hexe/Geist)
    if (this.state === 'special' && this.special?.kind === 'blink' && this.blinkTo && (this.specialPhase === 'gone' || this.specialPhase === 'windup')) {
      flicker(ctx, this.blinkTo.x - cx, this.blinkTo.y - cy, t, this.special.colors?.[1] ?? '#d0a0ff', this.bodyHeight);
    }
    // Champion „Blinzeln“: Umriss am Ziel flimmert vor dem Sprung
    const B = this.champState?.blink;
    if (B) {
      flicker(ctx, B.x - cx, B.y - cy, t, CHAMPION_AFFIXES.blinzeln.color, this.bodyHeight);
      drawSil(ctx, this.currentFrame(), CHAMPION_AFFIXES.blinzeln.color, this.facing < 0, B.x - cx, B.y - cy, this.look?.scale ?? 1, Math.sin(t * 30) > 0 ? 0.55 : 0.25, false);
    }
    // Totem: Heilpuls
    if (this.def.totem && this.pulseVis > 0) {
      const k = 1 - this.pulseVis / 0.6, R = (this.def.totem.radius ?? 80) * k, x = this.x - cx, y = this.y - cy;
      const n = Math.max(12, Math.round(R * 1.6));
      ctx.fillStyle = '#fff0b0';
      ctx.globalAlpha = 0.8 * (1 - k);
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; ctx.fillRect(Math.round(x + Math.cos(a) * R), Math.round(y + Math.sin(a) * R * 0.6), 1, 1); }
      ctx.globalAlpha = 1;
    }
  }

  // Seltene Gegner (look = { scale, tint }): größer und eingefärbt.
  drawSprite(ctx, cx, cy, opts = {}) {
    if (!this.look || this.rise < 1) return super.drawSprite(ctx, cx, cy + (this.z ?? 0), opts);
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
    if (this.burrowed) { this.#renderMound(ctx, cx, cy); return; }
    if (this.gone) return; // weggeblinzelt: nur das Flimmern am Ziel (Emissive)
    if (this.def.totem) this.#renderTotemArea(ctx, cx, cy);
    if (this.champion && !this.dead) this.#renderChampionGround(ctx, cx, cy);
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
    this.#renderWarnings(ctx, cx, cy);
    if (this.burrowed || this.gone || (this.exploded && !(this.blastT > 0))) return;
    if (this.champion && !this.dead && this.rise >= 1) this.#renderChampionFx(ctx, cx, cy);
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
    if (this.hpBarTimer > 0 || ((this.def.elite || this.rareId || this.champion) && this.isEngaged)) {
      const big = this.def.elite || this.rareId || this.champion;
      const w = big ? 22 : 16;
      const x = Math.round(this.x - cx - w / 2), y = Math.round(this.y - cy - this.bodyHeight - 8);
      ctx.globalAlpha = big && this.isEngaged ? 1 : Math.min(1, this.hpBarTimer * 2);
      ctx.fillStyle = '#0b0710'; ctx.fillRect(x - 1, y - 1, w + 2, 4);
      ctx.fillStyle = '#3a1418'; ctx.fillRect(x, y, w, 2);
      const fill = Math.max(1, Math.round((w * this.hp) / this.maxHp));
      ctx.fillStyle = '#d0454a'; ctx.fillRect(x, y, fill, 2);
      ctx.fillStyle = '#ff8a80'; ctx.fillRect(x, y, fill, 1);
      if (this.font) this.font.draw(ctx, String(this.level), x - 2, y - 2, { color: this.world?.hero ? levelGapColor(this.world.hero.level, this.level) : '#c8c2d0', align: 'right', shadow: true });
      // Eispanzer: eigene Leiste über dem Leben (eisblau), blinkt bei Treffern
      if (this.armorMax && this.armor > 0) {
        const af = Math.max(1, Math.round((w * this.armor) / this.armorMax));
        ctx.fillStyle = '#0b0710'; ctx.fillRect(x - 1, y - 4, w + 2, 3);
        ctx.fillStyle = '#1e3a5a'; ctx.fillRect(x, y - 3, w, 1);
        ctx.fillStyle = this.armorFlash > 0 ? '#ffffff' : '#9ad8ff'; ctx.fillRect(x, y - 3, af, 1);
      }
      ctx.globalAlpha = 1;
    }
    // Namensschild der Champions: Name + Kräfte in Kraftfarbe
    if (this.champion && this.font && (this.isEngaged || this.nearHero)) {
      const x = Math.round(this.x - cx), y = Math.round(this.y - cy - this.bodyHeight - 23); // Platz für die Krone
      this.font.draw(ctx, this.displayLabel.toUpperCase(), x, y - 7, { color: this.champion.color, align: 'center', shadow: true });
      this.font.draw(ctx, this.champion.labels.join(' · ').toUpperCase(), x, y, { color: '#d8ccb8', align: 'center', shadow: true });
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
    this.dmgMul *= r.dmgMult ?? 1;
    this.power = this.lvlPower * this.dmgMul;
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

// Champion-Umriss (outline = true: 1 Weltpixel breiter Rand) bzw. Silhouette (Nachbild) in einer Farbe
const SILS = new WeakMap();
// outline: 0 = volle Silhouette (Nachbild), n = Umrisslinie n Texel breit (rund, durchgehend, auch diagonal)
function silCanvas(f, color, flip, outline) {
  let m = SILS.get(f);
  if (!m) { m = new Map(); SILS.set(f, m); }
  const T = outline === true ? 1 : +outline || 0;
  const key = color + (flip ? '|f' : '') + '|' + T;
  let c = m.get(key);
  if (!c) {
    const src = flip ? f.flipped : f.canvas, r = f.res ?? 1, pad = Math.max(1, T) * r;
    c = document.createElement('canvas');
    c.width = src.width + 2 * pad; c.height = src.height + 2 * pad;
    const g = c.getContext('2d');
    // Umriss nur an der Außenkontur: innere Transparenz-Löcher zählen als Körper
    const solid = T ? solidMask(src) : src;
    if (T) {
      for (let dy = -T; dy <= T; dy++) for (let dx = -T; dx <= T; dx++) if (dx * dx + dy * dy <= T * T + 0.6) g.drawImage(solid, pad + dx * r, pad + dy * r);
    } else g.drawImage(src, pad, pad);
    g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    if (T) { g.globalCompositeOperation = 'destination-out'; g.drawImage(solid, pad, pad); }
    c.pad = pad;
    m.set(key, c);
  }
  return c;
}
// Maske der Figur mit gefüllten Innenlöchern (Flutfüllung von außen über transparente Pixel)
const SOLIDS = new WeakMap();
function solidMask(src) {
  let c = SOLIDS.get(src);
  if (c) return c;
  const w = src.width, h = src.height;
  c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const a = src.getContext ? src.getContext('2d').getImageData(0, 0, w, h).data : null;
  if (!a) { g.drawImage(src, 0, 0); SOLIDS.set(src, c); return c; }
  const out = new Uint8Array(w * h), q = new Int32Array(w * h);
  let qh = 0, qt = 0;
  const push = (i) => { if (!out[i] && a[i * 4 + 3] < 40) { out[i] = 1; q[qt++] = i; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (qh < qt) {
    const i = q[qh++], x = i % w;
    if (x > 0) push(i - 1); if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w); if (i < w * (h - 1)) push(i + w);
  }
  const img = g.createImageData(w, h), d = img.data;
  for (let i = 0; i < w * h; i++) if (!out[i]) { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255; d[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  SOLIDS.set(src, c);
  return c;
}
function drawSil(ctx, f, color, flip, x, y, s, alpha, outline) {
  if (!f?.canvas || alpha <= 0) return;
  const c = silCanvas(f, color, flip, outline), r = f.res ?? 1;
  const ax = (flip ? f.canvas.width - f.ax : f.ax) + c.pad, ay = f.ay + c.pad, k = s / r;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(c, Math.round(x - ax * k), Math.round(y - ay * k), Math.round(c.width * k), Math.round(c.height * k));
  ctx.globalAlpha = 1;
}
// Farbe zu Weiß mischen (heller Innenrand des Umrisses, Ringkern)
function lighten(hex, k) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const L = (v) => Math.round(v + (255 - v) * k);
  return `rgb(${L(r)},${L(g)},${L(b)})`;
}
// Flimmernde Lichtsäule (Ziel eines Teleports)
function flicker(ctx, x, y, t, color, h) {
  const H = Math.max(12, Math.round(h * 0.9));
  ctx.save();
  for (let i = 0; i < 5; i++) {
    const px = Math.round(x - 4 + i * 2 + Math.sin(t * 9 + i) * 1.2);
    const len = Math.round(H * (0.5 + 0.5 * Math.abs(Math.sin(t * 7 + i * 1.7))));
    ctx.globalAlpha = Math.sin(t * 31 + i) > -0.3 ? 0.75 : 0.25;
    ctx.fillStyle = color; ctx.fillRect(px, Math.round(y - len), 1, len);
  }
  ctx.globalAlpha = 0.7; ctx.fillStyle = '#0b0710';
  ctx.fillRect(Math.round(x - 6), Math.round(y) + 1, 13, 1);
  ctx.fillStyle = color; ctx.fillRect(Math.round(x - 5), Math.round(y), 11, 1);
  ctx.restore();
}
