import { Actor } from './Actor.js';
import { Entity } from './Entity.js';
import { ENEMY_TYPES } from './enemyTypes.js';
import { Telegraph as TelegraphBase } from './Telegraph.js';
import { Shockwave, SpawnMarker } from './Effects.js';
import { Light } from '../gfx/Lighting.js';
import { EV } from '../core/events.js';
import { rand, pick, angleDiff } from '../core/math.js';
import { DEFS } from './defs_ash_sovereign.js';

// Malgareth, der Aschenfürst – Endboss des Aschethrons (Stufe 40), stärkster Kampf des Spiels.
// Jeder gefährliche Angriff hat eine Bodenwarnung (Telegraph) oder eine eigene, deutliche Warnung.
//
// Phase 1 (> 66 %)  „Der gefallene König“ – am Boden
//   Klingenkombo   2 Hiebe (Bogen), jeder neu gezielt und markiert
//   Glutstoß       markierte Linie, Ausfallschritt nach vorn
//   Aschenwelle    Schwert in den Boden: eine Wand aus Asche rollt eine markierte Bahn entlang
//   Glutspeere     3 schwebende Speere zielen, markierte Linien, fliegen dann los
//   Glutring       (alle Phasen) wer > 3 s im Nahbereich steht: Kreis-Warnmarke r 60 um den Fürsten, dann Glutausbruch
// Phase 2 (66–33 %) „Der Aschenfürst erhebt sich“ – schwebt, Flügel aus Rauch
//   dazu Meteore (markierte Kreise), Feuersäulen (Kaskade entlang markierter Kreise),
//   Thronwachen (throne_guard, höchstens 2), Aschenwelle als Fächer, 5 Speere
// Phase 3 (< 33 %)  „Der Thron zerbricht“ – volle Gestalt
//   Glutrisse brechen die Arena auf (flammen abwechselnd auf, vorher Warnung),
//   Kombos mit 3 Schlägen (Hieb, Rückhand, Stoß), schneller,
//   Weltenbrand: großer Kanal-Angriff, die ganze Arena brennt – nur die goldene Zone ist sicher.
// Öffentliche Felder wie die anderen Bosse: type, def, bossId, level, hp/maxHp, phase, engaged,
// hurtable, adds, home; engage(world), update, die, renderEmissive. World prüft boss.dead.

const FIRE = ['#fff0b0', '#ffb640', '#f07a1c', '#c8420c', '#7a2208'];
const WHITE_FIRE = ['#ffffff', '#fff4c8', '#ffc048', '#ff6a14', '#8a2a08'];
const ASH = ['#d8d0c4', '#b8b0a4', '#8a8279', '#5a524c'];
const GOLDC = ['#fff0a8', '#e8c25a', '#b8862a'];
const FIRE_RGB = [255, 110, 40], GOLD_RGB = [255, 200, 110], WHITE_RGB = [255, 214, 160];
const WARN_FIRE = [255, 120, 40];
const BANNER = '#ffb050';
// Glutring: Nahbereich, Verweildauer bis zum Auslösen, Abklingzeit, Radius der Warnmarke, Schaden je Phase
const WAVE_IMPACT_R = 30; // Aschenwelle: Einschlagkreis vor dem Fürsten
const SLASH_R = 72; // Hieb: Warnbogen und Trefferzone gleich groß
const RING_NEAR = 60, RING_TIME = 3, RING_CD = 6, RING_R = 60, RING_DMG = [160, 190, 225];

// Lichtblitze bleiben lesbar: Leuchten (bloom × Stärke) höchstens 0,4, große Blitze (Radius ≥ 100) kürzer als 0,15 s.
// So überstrahlt kein Angriff den Bildschirm; Held und Warnmarken bleiben sichtbar.
function flashLight(o) {
  const intensity = o.intensity ?? 1;
  const bloom = Math.min(o.bloom ?? 0.25, 0.4 / Math.max(0.01, intensity));
  const ttl = (o.radius ?? 60) >= 100 ? Math.min(o.ttl ?? 0.14, 0.14) : o.ttl;
  return new Light({ ...o, bloom, ttl });
}

// Einschlag ohne den allgemeinen (hellen) Zauber-Einschlag: Ring, Funken, Brandfleck, Ton
function impactFx(world, x, y, r, big = false) {
  world.addEffect(new Shockwave(x, y, { radius: r, color: '#ffb640', life: big ? 0.5 : 0.3 }));
  world.particles.element(x, y, 'fire', big ? 28 : 14, r * 0.5);
  world.decals.scorch(x, y, Math.round(Math.min(18, r * 0.7)));
  world.bus.emit('trapFlame', { x, y });
}

// Warnmarke des Fürsten: Fläche wie üblich, dazu dunkle Kontur (Lit-Pass) und heller Rand (Emissive),
// damit sie auf Glutboden, unter Feuer und neben der hellen Figur klar lesbar bleibt.
// Gleicher Klassenname wie die Basis, damit Prüf- und Analysewerkzeuge sie als Warnung erkennen.
class Telegraph extends TelegraphBase {
  #outline(ctx, cx, cy, grow = 0) {
    const x = this.x - cx, y = this.y - cy;
    ctx.beginPath();
    if (this.shape === 'circle') ctx.ellipse(x, y, this.r + grow, (this.r + grow) * 0.6, 0, 0, Math.PI * 2);
    else if (this.shape === 'arc') {
      ctx.moveTo(x, y);
      for (let i = 0; i <= 18; i++) {
        const a = this.angle - this.arc / 2 + (this.arc * i) / 18;
        ctx.lineTo(x + Math.cos(a) * (this.r + grow), y + Math.sin(a) * (this.r + grow) * 0.6);
      }
      ctx.closePath();
    } else {
      const dx = Math.cos(this.angle), dy = Math.sin(this.angle) * 0.75;
      const nx = -dy, ny = dx, hw = this.width / 2 + grow, L = this.len + grow;
      ctx.moveTo(x + nx * hw - dx * grow, y + ny * hw - dy * grow);
      ctx.lineTo(x + dx * L + nx * hw, y + dy * L + ny * hw);
      ctx.lineTo(x + dx * L - nx * hw, y + dy * L - ny * hw);
      ctx.lineTo(x - nx * hw - dx * grow, y - ny * hw - dy * grow);
      ctx.closePath();
    }
  }
  render(ctx, cx, cy) {
    super.render(ctx, cx, cy);
    ctx.save();
    ctx.globalAlpha = 0.85; ctx.strokeStyle = '#120806'; ctx.lineWidth = 2;
    this.#outline(ctx, cx, cy, 1.5); ctx.stroke();
    ctx.restore();
  }
  renderEmissive(ctx, cx, cy) {
    const k = Math.min(1, this.t / this.duration);
    ctx.save();
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(this.t * 22) * (k > 0.7 ? 1 : 0.2);
    ctx.strokeStyle = k > 0.7 ? '#fff4d8' : '#ffd08a'; ctx.lineWidth = 1;
    this.#outline(ctx, cx, cy, 0); ctx.stroke();
    ctx.restore();
  }
}

// dot = Flächen-Tick (Glutrisse, Glutpfützen): Treffer wird als Tick gekennzeichnet (kein Hitstop/Wackeln).
// Nach dem Tod des Fürsten richtet nichts mehr Schaden an.
function hurtHero(world, owner, damage, dirX, dirY, knockback, heavy = false, dot = false) {
  const h = world.hero;
  if (!h || h.dead || owner?.dead) return false;
  const hit = { damage: Math.round(damage * rand(0.92, 1.08)), dirX, dirY, knockback, source: owner };
  if (dot) hit.dot = true;
  if (!h.takeHit(hit)) return false;
  world.bus.emit('hit', { attacker: owner, target: h, damage: hit.damage, crit: false, heavy: heavy && !dot, dot, dirX, dirY, x: h.x, y: h.centerY, killed: h.dead });
  return true;
}

// Richtungen: `aim` und alle Bahn-Winkel gelten im Bodenraum – Bewegung (cos a, sin a · 0,75),
// passend zur Linien-Warnung (Telegraph 'line' ohne screen). Daher Winkel aus Bildpunkten
// immer als atan2(dy / 0,75, dx) berechnen. Bögen (Hieb) prüft Combat im Ellipsenraum (Höhe 0,6).
const groundAng = (dx, dy) => Math.atan2(dy / 0.75, dx);
const arcAng = (a) => Math.atan2(Math.sin(a) * 0.75 / 0.6, Math.cos(a));
// Lage eines Punktes in einer Linien-Warnung, genau wie Telegraph sie zeichnet: Richtung d = (cos a, sin a · 0,75),
// Quer-Achse n = (−sin a · 0,75, cos a). Gibt den Quer-Abstand in Breiten-Einheiten zurück (Infinity außerhalb der Länge).
function laneDist(px, py, x0, y0, a, len) {
  const c = Math.cos(a), s = Math.sin(a) * 0.75, det = c * c + s * s;
  const rx = px - x0, ry = py - y0;
  const along = (rx * c + ry * s) / det;
  if (along < 0 || along > len) return Infinity;
  return Math.abs((-rx * s + ry * c) / det);
}

// Abstand eines Punktes zu einer Strecke (Boden-Koordinaten)
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}

function ashBurst(world, x, y, n, power = 1) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(10, 50) * power;
    world.particles.spawn({ x: x + rand(-4, 4), y: y + rand(-2, 2), z: rand(0, 8), vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: rand(20, 90) * power, gravity: 60, drag: 2, rise: rand(4, 14), wobble: 14, life: rand(0.8, 1.6), colors: [pick(ASH)], size: Math.random() < 0.3 ? 2 : 1 });
  }
}

// ------------------------------------------------------------------ Boss

export class Malgareth extends Actor {
  constructor(x, y, assets) {
    const def = { ...ENEMY_TYPES.ash_sovereign, ...(DEFS.ash_sovereign ?? {}) };
    super(x, y, assets.sprites[def.sprites]);
    this.flashMax = 0.3; // Trefferblitz gedämpft (große Figur würde den Helden überstrahlen)
    this.type = 'ash_sovereign';
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
    this.cooldown = 1.2;
    this.aim = 0;
    this.adds = [];
    this.hazards = [];
    this.fissures = [];
    this.pending = [];
    this.timers = { spears: 2.5, wave: 4, meteor: 3, pillars: 6, summon: 0, channel: 0, thrust: 1, ring: 3 };
    this.closeT = 0; // wie lange der Held schon dicht am Fürsten steht (Glutring)
    this.last = '';
    this.hurtAnim = 0;
    this.ghosts = [];
    this.lastFrame = null;
    this.combo = null;
    // Animationen im Hintergrund vorbereiten (eine je Takt), damit spätere Phasen nicht ruckeln
    const forms = (s) => ['idle', 'walk', 'slashWindup', 'slash', 'slash2Windup', 'slash2', 'thrustWindup', 'thrust', 'waveWindup', 'wave', 'cast', 'invoke', 'hurt'].map((n) => n + s);
    this.warm = ['awaken', ...forms(''), 'ascend', ...forms('_2'), 'unleash', ...forms('_3'), 'channelUp', 'channel', 'death'];
    this.warmT = 0;
    this.setState('sleep');
    this.animator.play('dormant');
  }

  get enraged() { return this.phase >= 3; }
  get quick() { return [1, 0.86, 0.72][this.phase - 1]; }
  // Animationsname je Gestalt
  #A(name) { return this.phase === 1 ? name : `${name}_${this.phase}`; }
  #play(name, restart = true) { this.animator.play(this.#A(name), restart); }

  engage(world) {
    if (this.engaged || this.dead) return;
    this.engaged = true;
    this.world = world;
    this.setState('intro');
    this.animator.play('awaken', true);
    world.bus.emit(EV.BOSS_ENGAGED, { bossId: this.bossId, name: this.def.name });
    world.session.camera?.shake(4);
    ashBurst(world, this.x, this.y - 26, 20);
    this.coreLight = world.addLight(new Light({ follow: this, offsetY: -65, radius: 120, color: FIRE_RGB, intensity: 0.55, flicker: 0.2, bloom: 0.25 }));
    // weiches Füll-Licht von vorn oben: die helle Knochenrüstung bleibt auch im Schatten lesbar
    this.fillLight = world.addLight(new Light({ follow: this, offsetX: 14, offsetY: -72, radius: 96, color: [235, 205, 190], intensity: 0.32, flicker: 0, bloom: 0 }));
  }

  update(dt, world) {
    this.tickTimers(dt);
    this.world = world;
    this.#warmup(dt);
    const hero = world.hero;
    const dx = hero.x - this.x, dy = hero.y - this.y;
    const dist = Math.hypot(dx, dy);
    this.adds = this.adds.filter((a) => !a.removed && !a.dead);
    this.hazards = this.hazards.filter((h) => !h.removed);
    this.hurtAnim = Math.max(0, this.hurtAnim - dt);
    if (this.engaged && !this.dead) for (const k in this.timers) this.timers[k] -= this.state === 'chase' ? dt : dt * 0.5;
    if (this.engaged && !this.dead && this.state !== 'chase') this.timers.ring -= dt * 0.5; // Glutring zählt immer voll
    if (!this.dead) {
      for (const p of this.pending) p.t -= dt;
      const due = this.pending.filter((p) => p.t <= 0);
      this.pending = this.pending.filter((p) => p.t > 0);
      for (const p of due) p.fn();
    }
    for (const g of this.ghosts) g.t += dt;
    this.ghosts = this.ghosts.filter((g) => g.t < 0.3);
    this.#frameEvents(world);
    this.#checkPhase(world);
    // Nahkampf-Druck: wer länger als ~3 s im Nahbereich bleibt, löst den Glutring aus
    if (this.engaged && !this.dead && this.hurtable && !hero.dead && Math.hypot(dx, dy / 0.75) < RING_NEAR) this.closeT += dt;
    else this.closeT = Math.max(0, this.closeT - dt * 1.5);
    this.#ambient(dt, world);
    const spd = this.def.speed * [1, 1.15, 1.3][this.phase - 1];

    switch (this.state) {
      case 'sleep':
        this.vx = this.vy = 0;
        if (Math.random() < dt * 2) world.particles.embers(this.x + rand(-9, 9), this.y - rand(30, 80), 1);
        break;

      case 'intro':
        this.vx = this.vy = 0;
        if (this.stateTime > 0.9 && this.stateTime < 1.4 && Math.random() < dt * 30) world.particles.embers(this.x + rand(-12, 18), this.y - rand(62, 112), 1);
        if (this.stateTime > 2.1) { this.hurtable = true; this.cooldown = 0.6; this.setState('chase'); }
        break;

      case 'transform':
        this.vx *= 0.7; this.vy *= 0.7;
        if (Math.random() < dt * 40) world.particles.element(this.x + rand(-30, 24), this.y - rand(16, 110), 'fire', 1, 4);
        if (Math.random() < dt * 20) ashBurst(world, this.x + rand(-20, 20), this.y - rand(0, 30), 1);
        if (this.animator.finished && this.stateTime > 0.5) {
          this.hurtable = true;
          if (this.phase === 3) this.#beginChannel(world);
          else { this.cooldown = 0.5; this.setState('chase'); }
        }
        break;

      case 'chase': {
        if (hero.dead) { this.vx *= 0.8; this.vy *= 0.8; this.#play('idle', false); break; }
        this.cooldown -= dt;
        let mx = dx / (dist || 1), my = dy / (dist || 1);
        if (!world.dungeon.lineOfSight(this.x, this.y - 2, hero.x, hero.y - 2)) {
          const f = world.flow.direction(this.x, this.y - 2);
          if (f) { mx = f.x; my = f.y; }
        }
        let want = dist > 52 ? spd : 0;
        // Gestalt 3: steht der Held deutlich südlich, gleitet der Fürst seitlich neben ihn auf
        // gleiche Höhe (statt nördlich über ihm zu thronen) – so bleibt die hohe Gestalt im Bild
        if (this.phase === 3 && dy > 26) {
          const side = Math.sign(this.x - hero.x) || this.facing * -1 || 1;
          const tx = hero.x + side * 46 - this.x, ty = hero.y - 12 - this.y, td = Math.hypot(tx, ty);
          if (td > 8) { mx = tx / td; my = ty / td; want = spd; }
        }
        const k = 1 - Math.exp(-dt * 5);
        this.vx += (mx * want - this.vx) * k;
        this.vy += (my * want - this.vy) * k;
        if (Math.abs(dx) > 3) this.facing = Math.sign(dx);
        if (this.hurtAnim > 0) this.#play('hurt', false);
        else this.#play(want > 1 ? 'walk' : 'idle', false);
        if (this.cooldown <= 0) this.#chooseAttack(world, dist);
        break;
      }

      case 'windup':
        this.vx *= 0.8; this.vy *= 0.8;
        if (this.trackUntil && this.stateTime < this.trackUntil) this.#track(world, dt, 4);
        if (this.stateTime >= this.windup) this.onRelease?.(world);
        break;

      case 'lunge': {
        const sp = this.stateTime < 0.16 ? 300 : 300 * Math.max(0, 1 - (this.stateTime - 0.16) * 6);
        this.vx = Math.cos(this.aim) * sp; this.vy = Math.sin(this.aim) * sp * 0.75;
        if (this.stateTime < 0.26 && this.stateTime % 0.06 < dt) this.ghosts.push({ frame: this.animator.frame, x: this.x, y: this.y, flip: this.facing < 0, t: 0 });
        if (this.stateTime >= this.recover) this.#afterStrike(world);
        break;
      }

      case 'strike':
        this.vx *= 0.8; this.vy *= 0.8;
        if (this.stateTime >= this.recover) this.#afterStrike(world);
        break;

      case 'channelUp':
        this.vx *= 0.8; this.vy *= 0.8;
        // zur Mitte der Arena gleiten
        { const c = this.channelSpot ?? this.#arenaCenter(world); this.x += (c.x - this.x) * Math.min(1, dt * 3); this.y += (c.y - this.y) * Math.min(1, dt * 3); }
        if (this.stateTime >= 0.7) { this.setState('channel'); this.animator.play('channel', true); }
        break;

      case 'channel':
        this.vx = this.vy = 0;
        this.#channelTick(dt, world);
        break;

      case 'dead':
        this.vx *= 0.85; this.vy *= 0.85;
        this.#deathTick(dt, world);
        break;
    }
    this.integrate(dt, world);
    // Gestalt 3 nie an die Nordwand: mindestens 40 px unter der Oberkante der Arena
    if (this.phase === 3 && world.arena && !this.dead) this.y = Math.max(this.y, world.arena.y0 + 40);
  }

  // Grafik vorwärmen: im Schlaf gemächlich, im Kampf nur in ruhigen Momenten
  #warmup(dt) {
    if (!this.warm.length) return;
    this.warmT -= dt;
    if (this.warmT > 0) return;
    const calm = this.state === 'sleep' || this.state === 'intro' || (this.state === 'chase' && this.cooldown > 0.3);
    if (!calm) return;
    const name = this.warm.shift();
    void this.animator.anims[name];
    this.warmT = this.state === 'sleep' ? 0.12 : 0.3;
  }

  // ---------------------------------------------------------------- Phasen

  #checkPhase(world) {
    if (this.dead || !this.engaged || ['intro', 'transform', 'channel', 'channelUp'].includes(this.state)) return;
    const f = this.hp / this.maxHp;
    if (this.phase === 1 && f <= 0.66) this.#transform(world, 2);
    else if (this.phase === 2 && f <= 0.33) this.#transform(world, 3);
  }

  #transform(world, phase) {
    this.#cancel(world);
    const from = this.phase;
    this.phase = phase;
    this.hurtable = false;
    this.setState('transform');
    this.animator.play(from === 1 ? 'ascend' : 'unleash', true);
    world.session.slowmo?.(0.5, 0.6);
    if (phase === 2) {
      world.bus.emit(EV.UI_BANNER, { title: 'Der Aschenfürst erhebt sich', sub: 'Malgareth ruft seine Thronwachen', color: BANNER });
      this.timers.summon = 1.5; this.timers.meteor = 4; this.timers.pillars = 7;
      if (this.coreLight) { this.coreLight.intensity = 0.6; this.coreLight.radius = 135; this.coreLight.offsetY = -80; }
    } else {
      world.bus.emit(EV.UI_BANNER, { title: 'Der Thron zerbricht', sub: 'Die Arena reißt auf – nur das Gold bietet Schutz', color: '#ffe08a' });
      this.timers.channel = 22; this.timers.summon = 14; this.timers.meteor = 5;
      if (this.coreLight) { this.coreLight.color = WHITE_RGB; this.coreLight.intensity = 0.85; this.coreLight.radius = 150; this.coreLight.offsetY = -86; }
    }
    world.bus.emit('bossPhase', { bossId: this.bossId, phase });
  }

  // Laufende Angriffe abbrechen (Phasenwechsel, Tod)
  #cancel(world) {
    world.combat.hitboxes = world.combat.hitboxes.filter((h) => h.owner !== this);
    for (const t of this.teles ?? []) t.removed = true;
    this.teles = [];
    this.combo = null;
    this.onRelease = null;
    this.pending = [];
    for (const h of this.hazards) if (h.cancelable) h.removed = true;
  }

  // ---------------------------------------------------------------- Angriffswahl

  #chooseAttack(world, dist) {
    const hero = world.hero;
    this.aim = groundAng(hero.x - this.x, hero.y - this.y);
    this.facing = Math.cos(this.aim) >= 0 ? 1 : -1;
    const T = this.timers, P = this.phase;
    if (P >= 3 && T.channel <= 0) return this.#beginChannel(world);
    if (this.closeT >= RING_TIME && T.ring <= 0) { T.ring = RING_CD; this.closeT = 0; this.last = 'ring'; return this.#beginRing(world); }
    if (P >= 2 && T.summon <= 0 && this.adds.length < 2) { T.summon = P >= 3 ? rand(17, 21) : rand(16, 20); return this.#beginInvoke(world, 'summon'); }
    const opts = [];
    const add = (id, w) => { if (w > 0) opts.push([id, id === this.last ? w * 0.25 : w]); };
    if (dist < 72) { add('combo', 4); if (T.wave <= 0) add('wave', 1.2); if (P >= 2 && T.pillars <= 0) add('pillars', 1); }
    else if (dist < 150) {
      if (T.thrust <= 0) add('thrust', 2.2);
      if (T.wave <= 0) add('wave', 2.5);
      if (T.spears <= 0) add('spears', 2);
      if (P >= 2 && T.pillars <= 0) add('pillars', 2);
      if (P >= 2 && T.meteor <= 0) add('meteor', 1.6);
    } else {
      if (T.spears <= 0) add('spears', 3);
      if (T.wave <= 0) add('wave', 2);
      if (P >= 2 && T.meteor <= 0) add('meteor', 3);
      if (P >= 2 && T.pillars <= 0) add('pillars', 1.5);
    }
    if (!opts.length) { this.cooldown = 0.3; return; }
    let r = Math.random() * opts.reduce((s, o) => s + o[1], 0), choice = opts[0][0];
    for (const [id, w] of opts) { r -= w; if (r <= 0) { choice = id; break; } }
    this.last = choice;
    const q = this.quick;
    switch (choice) {
      case 'combo': {
        const steps = P >= 3 ? ['slash', 'slash2', 'thrust'] : ['slash', 'slash2'];
        this.combo = { steps, i: 0 };
        return this.#comboStep(world, 0.9 * q);
      }
      case 'thrust': T.thrust = rand(4, 6) * q; this.combo = { steps: ['thrust'], i: 0 }; return this.#comboStep(world, 0.85 * q);
      case 'wave': T.wave = rand(6, 8) * q; return this.#beginWave(world);
      case 'spears': T.spears = rand(6, 8) * q; return this.#beginSpears(world);
      case 'meteor': T.meteor = rand(8.5, 11) * q; return this.#beginInvoke(world, 'meteor');
      case 'pillars': T.pillars = rand(7, 9) * q; return this.#beginInvoke(world, 'pillars');
    }
  }

  #begin(world, anim, windup, onRelease, { track = 0 } = {}) {
    this.setState('windup');
    this.#play(anim);
    this.windup = windup;
    this.trackUntil = track;
    this.onRelease = onRelease;
    world.bus.emit('telegraph', { actor: this, attack: anim });
  }

  #tele(world, x, y, o) {
    const t = world.spawn(new Telegraph(x, y, o));
    (this.teles ??= []).push(t);
    this.teles = this.teles.filter((q) => !q.removed);
    return t;
  }

  // Blick (aim) dem Helden nachführen, höchstens rate rad/s
  #track(world, dt, rate) {
    const h = world.hero;
    const d = angleDiff(this.aim, groundAng(h.x - this.x, h.y - this.y));
    this.aim += Math.max(-rate * dt, Math.min(rate * dt, d));
    this.facing = Math.cos(this.aim) >= 0 ? 1 : -1;
  }

  // ---------------------------------------------------------------- Klingenkombo

  #comboStep(world, wind) {
    const h = world.hero;
    const kind = this.combo.steps[this.combo.i];
    this.aim = groundAng(h.x - this.x, h.y - this.y);
    this.facing = Math.cos(this.aim) >= 0 ? 1 : -1;
    if (kind === 'thrust') {
      const len = Math.min(150, this.#rayLength(world, this.aim));
      this.#tele(world, this.x, this.y, { shape: 'line', angle: this.aim, len, width: 22, duration: wind, follow: null });
      this.thrustLen = len; this.thrustFrom = { x: this.x, y: this.y }; // Treffer genau in der markierten Bahn
      return this.#begin(world, 'thrustWindup', wind, (w) => this.#thrust(w));
    }
    const arc = 2.3;
    const tele = this.#tele(world, this.x, this.y, { shape: 'arc', r: SLASH_R, angle: arcAng(this.aim), arc, duration: wind, follow: this });
    this.#begin(world, kind === 'slash' ? 'slashWindup' : 'slash2Windup', wind, (w) => this.#slash(w, kind === 'slash2'), { track: wind * 0.45 });
    // Warnbogen folgt dem nachgeführten Blick
    this.pending.push(...[0.1, 0.2, 0.3].map((t) => ({ t: wind * t * 1.4, fn: () => { tele.angle = arcAng(this.aim); } })));
  }

  #slash(world, back) {
    this.setState('strike'); this.recover = 0.28;
    this.#play(back ? 'slash2' : 'slash');
    world.combat.add({ owner: this, team: 'enemy', shape: 'arc', follow: false, x: this.x, y: this.y - 10, lift: 10, r: SLASH_R, angle: arcAng(this.aim), arc: 2.3, damage: 104, knockback: 220, heavy: true, ttl: 0.14 });
    this.kbx += Math.cos(this.aim) * 90; this.kby += Math.sin(this.aim) * 90 * 0.75;
    for (let i = 0; i < 9; i++) {
      const a = arcAng(this.aim) - 1.1 + i * 0.27;
      world.particles.sparks(this.x + Math.cos(a) * 54, this.y - 12 + Math.sin(a) * 32, a, 2, this.enraged ? WHITE_FIRE : FIRE);
    }
    world.particles.dust(this.x + Math.cos(this.aim) * 30, this.y + Math.sin(this.aim) * 22, 6, '#4a3e3a');
    world.addLight(flashLight({ x: this.x + Math.cos(this.aim) * 40, y: this.y - 14, radius: 90, color: FIRE_RGB, intensity: 0.8, ttl: 0.22, bloom: 0.4 }));
    world.session.camera?.shake(4);
    world.session.hitstop?.(0.04);
    world.bus.emit('enemySwing', { actor: this, heavy: true });
  }

  #thrust(world) {
    this.setState('lunge'); this.recover = 0.5;
    this.#play('thrust');
    const len = this.thrustLen ?? 120;
    const ca = Math.cos(this.aim), sa = Math.sin(this.aim);
    // Treffer entlang der markierten Linie (Klinge + Glutstrahl)
    const h = world.hero;
    // Fußpunkt in der markierten Bahn (Breite 22, Bodenraum) – wie die Warnung
    const o = this.thrustFrom ?? this;
    if (!h.dead && laneDist(h.x, h.y, o.x, o.y, this.aim, len) <= 11) hurtHero(world, this, 150, ca, sa, 260, true);
    for (let s = 20; s < len; s += 8) {
      const x = this.x + ca * s, y = this.y + sa * s * 0.75;
      world.particles.spawn({ x, y, z: 14, vx: ca * rand(60, 140), vy: sa * rand(40, 90), vz: rand(-10, 20), drag: 4, life: rand(0.25, 0.45), colors: this.enraged ? WHITE_FIRE : FIRE, emissive: true, size: 2, shrink: true });
    }
    world.addEffect(new ThrustFlare(o.x, o.y, this.aim, len, this));
    world.addLight(flashLight({ x: this.x + ca * len * 0.5, y: this.y + sa * len * 0.35, radius: 90, color: FIRE_RGB, intensity: 0.9, ttl: 0.25, bloom: 0.5 }));
    world.session.camera?.shake(5);
    world.bus.emit('enemySwing', { actor: this, heavy: true });
  }

  // Nach einem Schlag: nächster Kombo-Schritt oder zurück zur Verfolgung
  #afterStrike(world) {
    if (this.combo && this.combo.i < this.combo.steps.length - 1) {
      this.combo.i++;
      return this.#comboStep(world, [0.6, 0.55, 0.5][this.phase - 1]);
    }
    this.combo = null;
    this.cooldown = [0.8, 0.55, 0.4][this.phase - 1] + rand(0, 0.35);
    this.setState('chase');
  }


  // ---------------------------------------------------------------- Glutring (bestraft Nahkämpfer)

  // Der Fürst stößt das Schwert in den Boden, ein Ring aus Glut und Asche bricht rings um ihn auf.
  #beginRing(world) {
    const wind = [0.8, 0.7, 0.58][this.phase - 1];
    this.#tele(world, this.x, this.y, { shape: 'circle', r: RING_R, duration: wind, follow: this, color: WARN_FIRE });
    this.#begin(world, 'waveWindup', wind, (w) => this.#ring(w));
  }

  #ring(world) {
    this.setState('strike'); this.recover = 0.6;
    this.#play('wave');
    const h = world.hero, dmg = RING_DMG[this.phase - 1];
    const dx = h.x - this.x, dy = (h.y - this.y) / 0.6, d = Math.hypot(dx, dy) || 1;
    if (!h.dead && d < RING_R + 2) hurtHero(world, this, dmg, dx / d, dy / d * 0.6, 300, true);
    world.addEffect(new Shockwave(this.x, this.y, { radius: RING_R + 4, color: this.enraged ? '#fff4c8' : '#ffb048', life: 0.45 }));
    world.addEffect(new Shockwave(this.x, this.y, { radius: RING_R * 0.6, color: '#f07a1c', life: 0.35 }));
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2, r = RING_R * (0.75 + Math.random() * 0.25);
      const x = this.x + Math.cos(a) * r, y = this.y + Math.sin(a) * r * 0.6;
      world.particles.spawn({ x, y, z: 2, vx: Math.cos(a) * 30, vy: Math.sin(a) * 18, vz: rand(30, 80), gravity: 80, drag: 2, life: rand(0.35, 0.6), colors: this.enraged ? WHITE_FIRE : FIRE, emissive: true, size: 2, shrink: true });
      if (i % 4 === 0) world.decals.scorch(x, y, 6);
    }
    ashBurst(world, this.x, this.y, 18, 1.3);
    world.addLight(flashLight({ x: this.x, y: this.y - 6, radius: 120, color: FIRE_RGB, intensity: 0.9, ttl: 0.14, bloom: 0.4 }));
    world.session.camera?.shake(7);
    world.session.hitstop?.(0.05);
    world.bus.emit('bossSlam', { x: this.x, y: this.y });
  }

  // ---------------------------------------------------------------- Aschenwelle

  #beginWave(world) {
    const q = this.quick;
    const wind = 1.0 * q;
    const angles = this.phase === 1 ? [0] : this.phase === 2 ? [-0.42, 0, 0.42] : [-0.6, -0.3, 0, 0.3, 0.6];
    this.waves = angles.map((o) => {
      const a = this.aim + o, len = Math.min(280, this.#rayLength(world, a));
      this.#tele(world, this.x, this.y, { shape: 'line', angle: a, len, width: this.phase === 1 ? 30 : 22, duration: wind, color: WARN_FIRE });
      return { a, len };
    });
    // Einschlag vor dem Fürsten: eigene Kreiswarnung; Bahnen und Einschlag starten dort, wo gewarnt wurde
    this.waveFrom = { x: this.x, y: this.y };
    const ix = this.x + Math.cos(this.aim) * 28, iy = this.y + Math.sin(this.aim) * 28 * 0.75;
    this.waveImpact = { x: ix, y: iy };
    this.#tele(world, ix, iy, { shape: 'circle', r: WAVE_IMPACT_R, duration: wind, color: WARN_FIRE });
    this.#begin(world, 'waveWindup', wind, (w) => this.#wave(w));
  }

  #wave(world) {
    this.setState('strike'); this.recover = 0.75;
    this.#play('wave');
    const o = this.waveFrom ?? this, { x: ix, y: iy } = this.waveImpact ?? { x: this.x, y: this.y };
    for (const { a, len } of this.waves) {
      this.#hazard(world, new AshWave(o.x + Math.cos(a) * 8, o.y + Math.sin(a) * 6, a, len - 8, this, { width: this.phase === 1 ? 30 : 22, speed: [200, 230, 260][this.phase - 1], damage: 180 }));
    }
    world.combat.add({ owner: this, team: 'enemy', shape: 'circle', follow: false, x: ix, y: iy - 6, lift: 6, r: WAVE_IMPACT_R, damage: 180, knockback: 260, heavy: true, ttl: 0.12 });
    world.particles.dust(ix, iy, 20, '#4a3e3a');
    ashBurst(world, ix, iy, 16, 1.2);
    world.particles.ring(ix, iy, 8, 26, FIRE, 120);
    world.decals.scorch(ix, iy, 16);
    world.addLight(flashLight({ x: ix, y: iy, radius: 110, color: FIRE_RGB, intensity: 1.1, ttl: 0.35, bloom: 0.7 }));
    world.session.hitstop?.(0.08);
    world.session.camera?.shake(9);
    impactFx(world, ix, iy, 30, true);
    world.bus.emit('bossSlam', { x: ix, y: iy });
  }

  // ---------------------------------------------------------------- Glutspeere

  #beginSpears(world) {
    const q = this.quick;
    const n = [3, 5, 5][this.phase - 1];
    const wind = 0.95 * q;
    const h = world.hero;
    const spears = [];
    for (let i = 0; i < n; i++) {
      // Speere erscheinen im Bogen über dem Fürsten und zielen jeder für sich
      const side = (i - (n - 1) / 2);
      const sx = this.x - this.facing * 6 + side * 14, sy = this.y - 4 + Math.abs(side) * 3;
      const lead = i === (n - 1) / 2 ? 0.35 : 0;
      const tx = h.x + (h.vx ?? 0) * lead + side * (this.phase >= 2 ? 18 : 10), ty = h.y + (h.vy ?? 0) * lead;
      const a = groundAng(tx - sx, ty - sy);
      const delay = wind + 0.12 + i * 0.1 * (this.phase >= 3 ? 0.6 : 1);
      const len = Math.min(300, this.#rayLengthFrom(world, sx, sy, a));
      this.#tele(world, sx, sy, { shape: 'line', angle: a, len, width: 9, duration: delay, color: WARN_FIRE });
      spears.push(this.#hazard(world, new EmberSpear(sx, sy, a, this, { delay, damage: 80, len })));
    }
    if (this.phase >= 3) {
      // zweite Salve (Kreuzfeuer): zielt auf die Stelle, an die der Held ausweicht
      this.pending.push({ t: wind + 0.9, fn: () => { if (!this.dead && this.phase >= 3) this.#spearVolley(world, 4); } });
    }
    this.#begin(world, 'cast', wind, (w) => { this.setState('strike'); this.recover = 0.55; w.bus.emit('shoot', { actor: this }); });
    world.bus.emit('cast', { actor: this, element: 'fire' });
  }

  // Speere von den Rändern der Arena auf den Helden
  #spearVolley(world, n) {
    const h = world.hero, A = this.#arena(world);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 + rand(-0.3, 0.3);
      let sx = h.x + Math.cos(a0) * 140, sy = h.y + Math.sin(a0) * 90;
      sx = Math.max(A.x0 + 12, Math.min(A.x1 - 12, sx)); sy = Math.max(A.y0 + 12, Math.min(A.y1 - 8, sy));
      const p = world.dungeon.nearestFree(sx, sy);
      const a = groundAng(h.x - p.x, h.y - p.y);
      const delay = 0.9 + i * 0.08;
      const len = Math.min(320, this.#rayLengthFrom(world, p.x, p.y, a));
      this.#tele(world, p.x, p.y, { shape: 'line', angle: a, len, width: 9, duration: delay, color: WARN_FIRE });
      this.#hazard(world, new EmberSpear(p.x, p.y, a, this, { delay, damage: 80, len }));
    }
    world.bus.emit('cast', { actor: this, element: 'fire' });
  }

  // ---------------------------------------------------------------- Anrufung: Meteore, Säulen, Beschwörung

  #beginInvoke(world, kind) {
    const q = this.quick;
    const wind = kind === 'summon' ? 1.0 : 0.85 * q;
    this.#begin(world, 'invoke', wind, (w) => this.#invoke(w, kind));
    world.bus.emit('cast', { actor: this, element: 'fire' });
    // Warnungen der Säulen und Meteore beginnen sofort mit dem Ausholen
    if (kind === 'pillars') this.#pillars(world, wind);
    if (kind === 'meteor') this.#meteors(world, wind);
    // Beschwörung mit Begleitregen: Thronwachen kommen nie allein
    if (kind === 'summon') this.#meteors(world, wind + 0.3, this.phase >= 3 ? 5 : 3);
  }

  #invoke(world, kind) {
    this.setState('strike'); this.recover = 0.6;
    const t = this.#meta('tip');
    world.addLight(flashLight({ x: t.x, y: t.y, radius: 100, color: FIRE_RGB, intensity: 1, ttl: 0.4, bloom: 0.8 }));
    world.particles.element(t.x, t.y, 'fire', 16, 5);
    if (kind === 'summon') this.#summon(world);
  }

  #meteors(world, wind, count = 0) {
    const h = world.hero, A = this.#arena(world);
    const n = count || [0, 6, 9][this.phase - 1];
    for (let i = 0; i < n; i++) {
      let tx, ty;
      if (i === 0) { tx = h.x + (h.vx ?? 0) * 0.5; ty = h.y + (h.vy ?? 0) * 0.5; }
      else {
        const a = rand(0, Math.PI * 2), r = rand(28, 120);
        tx = (i % 2 ? h.x : this.home.x) + Math.cos(a) * r; ty = (i % 2 ? h.y : this.home.y) + Math.sin(a) * r * 0.65;
      }
      tx = Math.max(A.x0 + 14, Math.min(A.x1 - 14, tx)); ty = Math.max(A.y0 + 12, Math.min(A.y1 - 10, ty));
      const p = world.dungeon.nearestFree(tx, ty);
      const delay = wind + 0.5 + i * 0.17 + rand(0, 0.12);
      const r = i === 0 ? 30 : 24;
      this.#tele(world, p.x, p.y, { shape: 'circle', r, duration: delay, color: WARN_FIRE });
      this.#hazard(world, new ObsidianMeteor(p.x, p.y, this, { delay, damage: i === 0 ? 200 : 160, r, big: i === 0 }));
    }
    world.bus.emit('bossMeteors', { bossId: this.bossId, count: n });
  }

  // Feuersäulen: Kaskaden, die vom Fürsten aus auf den Helden zulaufen (Phase 3: drei Bahnen)
  #pillars(world, wind) {
    const h = world.hero;
    const base = Math.atan2((h.y - this.y) / 0.7, h.x - this.x);
    const lines = this.phase >= 3 ? [-0.55, 0, 0.55] : [0];
    const step = 26, n = this.phase >= 3 ? 8 : 7;
    for (const o of lines) {
      const a = base + o;
      for (let i = 0; i < n; i++) {
        const s = 30 + i * step;
        const x = this.x + Math.cos(a) * s, y = this.y + Math.sin(a) * s * 0.7;
        const tx = Math.floor(x / 16), ty = Math.floor((y - 2) / 16);
        if (world.dungeon.isWall(tx, ty)) break;
        const delay = wind + 0.35 + i * 0.13;
        this.#tele(world, x, y, { shape: 'circle', r: 17, duration: delay, color: WARN_FIRE });
        this.#hazard(world, new FirePillar(x, y, this, { delay, damage: 150, r: 17 }));
      }
    }
    world.bus.emit('bossPillars', { bossId: this.bossId });
  }

  #summon(world) {
    let type = 'throne_guard';
    const def = ENEMY_TYPES[type];
    let hpScale = 1;
    // Figur der Thronwache fehlt noch: Figur des Vorbilds leihen (Werte bleiben die der Thronwache)
    if (def && !(def.sprites in world.assets.sprites) && def.spriteBase && world.assets.sprites[def.spriteBase]?.idle) {
      world.assets.sprites[def.sprites] = world.assets.sprites[def.spriteBase];
    }
    if (!def || !world.assets.sprites[def.sprites]?.idle) {
      // Figur der Thronwache fehlt noch: Vorbild mit gleichen Lebenspunkten
      const base = def?.spriteBase && ENEMY_TYPES[def.spriteBase] ? def.spriteBase : 'bandit';
      hpScale = def ? def.hp / (ENEMY_TYPES[base]?.hp || def.hp) : 1;
      type = ENEMY_TYPES[base] && world.assets.sprites[ENEMY_TYPES[base].sprites]?.idle ? base : 'skeleton';
    }
    const n = Math.min(2, 2 - this.adds.length);
    for (let i = 0; i < n; i++) {
      const a = this.facing > 0 ? Math.PI + (i ? -0.7 : 0.7) : (i ? -0.7 : 0.7);
      const p = world.dungeon.nearestFree(this.x + Math.cos(a) * 60, this.y + Math.sin(a) * 38);
      world.particles.element(p.x, p.y, 'fire', 10, 8);
      const tag = { pending: true };
      this.adds.push(tag);
      world.spawn(new SpawnMarker(p.x, p.y, 0.8, () => {
        this.adds = this.adds.filter((x) => x !== tag);
        if (this.dead) return;
        const e = world.spawnEnemy(type, p.x, p.y, { respawned: true, home: { ...this.home }, hpScale });
        e.aggroed = true; e.summoned = true; e.xpOverride = 40;
        this.adds.push(e);
        world.particles.element(p.x, p.y, 'fire', 18, 10);
        ashBurst(world, p.x, p.y, 12);
        world.addLight(flashLight({ x: p.x, y: p.y - 10, radius: 50, color: FIRE_RGB, intensity: 0.9, ttl: 0.6, bloom: 0.4 }));
      }));
    }
    if (n > 0) world.bus.emit('bossSummon', { bossId: this.bossId, count: n });
  }

  // ---------------------------------------------------------------- Weltenbrand (Kanal, Phase 3)

  #beginChannel(world) {
    this.#cancel(world);
    this.timers.channel = rand(20, 24);
    this.setState('channelUp');
    this.animator.play('channelUp', true);
    const A = this.#arena(world), h = world.hero;
    // Kanalplatz: Mitte der Arena in x, in y nahe der Mitte, aber höchstens knapp nördlich des Helden
    // (der Fürst ist in Gestalt 3 bis ~150 px hoch und muss unter der Boss-Leiste ganz im Bild bleiben)
    const mid = this.channelSpot = this.#channelSpot(world);
    // sichere Zone: weit weg vom Helden, eher seitlich als nord-südlich zum Fürsten,
    // nicht auf einem Glutriss, frei begehbar
    let best = null, bestScore = -1;
    for (let i = 0; i < 24; i++) {
      const x = rand(A.x0 + 36, A.x1 - 36), y = Math.max(A.y0 + 30, Math.min(A.y1 - 22, mid.y + rand(-34, 40)));
      const p = world.dungeon.nearestFree(x, y);
      const dh = Math.hypot(p.x - h.x, p.y - h.y);
      const df = Math.min(99, ...this.fissures.map((f) => f.distTo(p.x, p.y)));
      const db = Math.hypot(p.x - mid.x, (p.y - mid.y) / 0.7);
      const score = Math.min(dh, 140) + Math.min(df, 30) * 2 + Math.min(db, 90) - (dh < 70 ? 200 : 0) - (db < 60 ? 200 : 0);
      if (score > bestScore) { bestScore = score; best = p; }
    }
    const dur = 4.4;
    this.channelDur = dur;
    this.cataclysm = this.#hazard(world, new Cataclysm(best.x, best.y, this, { arena: A, duration: dur + 0.7, damage: 340, r: 30 }));
    world.bus.emit(EV.UI_BANNER, { title: 'Weltenbrand', sub: 'Flieh in den goldenen Kreis!', color: '#ffe08a' });
    world.bus.emit('bossChannel', { bossId: this.bossId, active: true, x: best.x, y: best.y });
    world.bus.emit('cast', { actor: this, element: 'fire' });
  }

  #channelTick(dt, world) {
    const t = this.#meta('tip');
    if (Math.random() < dt * 40) world.particles.spawn({ x: t.x + rand(-3, 3), y: this.y, z: this.y - t.y, vx: rand(-10, 10), vy: 0, vz: rand(40, 90), gravity: 0, drag: 1, life: rand(0.3, 0.6), colors: WHITE_FIRE, emissive: true, size: 2, shrink: true });
    // Glut wird von überall in das Schwert gesogen
    if (Math.random() < dt * 30) {
      const a = rand(0, Math.PI * 2), r = rand(60, 140);
      const x = this.x + Math.cos(a) * r, y = this.y + Math.sin(a) * r * 0.6;
      world.particles.spawn({ x, y, z: 4, vx: (this.x - x) * 1.4, vy: (this.y - y) * 1.4, vz: 30, drag: 0.5, life: 0.7, colors: FIRE, emissive: true });
    }
    if (this.stateTime >= this.channelDur) {
      this.setState('strike'); this.recover = 1.1;
      this.#play('wave');
      world.bus.emit('bossChannel', { bossId: this.bossId, active: false });
    }
  }

  // ---------------------------------------------------------------- Hilfen

  #hazard(world, h) {
    world.spawn(h);
    this.hazards.push(h);
    return h;
  }

  #arena(world) {
    const A = world.arena;
    if (A) return A;
    return { x0: this.home.x - 170, x1: this.home.x + 170, y0: this.home.y - 110, y1: this.home.y + 110 };
  }

  #channelSpot(world) {
    const A = this.#arena(world), h = world.hero;
    const y = Math.max(A.y0 + 56, Math.min(A.y1 - 24, h.y - 24));
    return world.dungeon.nearestFree((A.x0 + A.x1) / 2, y);
  }

  #arenaCenter(world) {
    const A = this.#arena(world);
    return world.dungeon.nearestFree((A.x0 + A.x1) / 2, (A.y0 + A.y1) / 2 + 6);
  }

  #rayLength(world, ang) { return this.#rayLengthFrom(world, this.x, this.y, ang); }

  #rayLengthFrom(world, x0, y0, ang) {
    let len = 0;
    const T = 16;
    while (len < 340) {
      const x = x0 + Math.cos(ang) * (len + 12), y = y0 + Math.sin(ang) * 0.75 * (len + 12);
      if (world.dungeon.isWall(Math.floor(x / T), Math.floor((y - 4) / T))) break;
      len += 6;
    }
    return len + 8;
  }

  #meta(key) {
    const m = this.animator.frame.meta?.[key] ?? { dx: 0, dy: -76 };
    return { x: this.x + m.dx * this.facing, y: this.y + m.dy };
  }

  #spawnFissures(world) {
    const A = this.#arena(world);
    const w = A.x1 - A.x0, h = A.y1 - A.y0;
    const specs = [
      [[0.04, 0.3], [0.3, 0.42], [0.48, 0.3], [0.7, 0.4], [0.96, 0.26]],
      [[0.08, 0.86], [0.28, 0.7], [0.42, 0.78], [0.6, 0.64], [0.8, 0.8], [0.95, 0.72]],
      [[0.2, 0.06], [0.24, 0.3], [0.2, 0.52], [0.3, 0.7]],
      [[0.78, 0.08], [0.72, 0.3], [0.8, 0.5]],
    ];
    specs.forEach((pts, i) => {
      const P = pts.map(([u, v]) => ({ x: A.x0 + u * w + rand(-6, 6), y: A.y0 + v * h + rand(-4, 4) }));
      const f = this.#hazard(world, new EmberFissure(P, this, { offset: 1.5 + i * 1.6, damage: 110 }));
      this.fissures.push(f);
    });
  }

  // ---------------------------------------------------------------- Ereignisse, Umgebung

  #frameEvents(world) {
    const f = this.animator.frame;
    if (f === this.lastFrame) return;
    this.lastFrame = f;
    if (f.fx === 'step') {
      world.particles.dust(this.x + rand(-6, 6), this.y, 4, '#4a3e3a');
      world.session.camera?.shake(1);
      world.bus.emit('bossStep', { x: this.x, y: this.y });
    } else if (f.fx === 'roar') {
      const h = this.#meta('head');
      const cols = this.enraged ? WHITE_FIRE : FIRE;
      world.session.camera?.shake(this.dead ? 6 : 10);
      world.particles.ring(h.x, h.y + 8, 12, 40, cols, 140);
      world.addEffect(new Shockwave(this.x, this.y - 4, { radius: 110, color: this.enraged ? '#fff4c8' : '#ffb048', life: 0.7 }));
      world.addLight(flashLight({ x: h.x, y: h.y, radius: 170, color: this.enraged ? WHITE_RGB : FIRE_RGB, intensity: 1.2, ttl: 0.6, bloom: 0.8 }));
      world.bus.emit('bossRoar', { bossId: this.bossId, x: this.x, y: this.y });
      if (this.dead) return;
      const hero = world.hero, dx = hero.x - this.x, dy = hero.y - this.y, d = Math.hypot(dx, dy) || 1;
      if (this.state === 'transform') {
        // Brüllen beim Gestaltwechsel: ohne Schaden (keine Bodenwarnung möglich), nur Druckwelle und Rückstoß
        world.addEffect(new Shockwave(this.x, this.y, { radius: 150, color: '#ffb048', life: 0.8 }));
        if (d < 120) { hero.kbx += (dx / d) * 220; hero.kby += (dy / d) * 220; }
        ashBurst(world, this.x, this.y - 20, 30, 1.6);
        if (this.phase === 3 && !this.fissures.length) this.#spawnFissures(world);
      } else if (d < 120) { hero.kbx += (dx / d) * 260; hero.kby += (dy / d) * 260; }
    } else if (f.fx === 'cast') {
      const c = this.#meta(this.state === 'windup' && this.animator.name.startsWith('invoke') ? 'tip' : 'cast');
      world.particles.ring(c.x, c.y, 4, 14, FIRE, 60);
    } else if (f.fx === 'impact' && this.dead) {
      world.session.camera?.shake(8);
      world.particles.dust(this.x, this.y, 20, '#4a3e3a');
      ashBurst(world, this.x, this.y - 6, 24, 1.3);
      world.bus.emit('bossImpact', { x: this.x, y: this.y });
    } else if (f.fx === 'crown') {
      // die Krone schlägt auf
      const c = this.#meta('crown');
      world.particles.sparks(c.x, c.y, -Math.PI / 2, 10, ['#ffffff', ...GOLDC]);
      world.particles.ring(c.x, c.y, 3, 12, GOLDC, 50);
      world.addLight(flashLight({ x: c.x, y: c.y, radius: 50, color: GOLD_RGB, intensity: 0.9, ttl: 0.5, bloom: 0.6 }));
      world.session.camera?.shake(3);
      world.bus.emit('bossCrownFall', { bossId: this.bossId, x: c.x, y: c.y });
    } else if (f.fx === 'ash') {
      ashBurst(world, this.x, this.y - 62, 30, 1.2);
    }
  }

  #ambient(dt, world) {
    if (this.state === 'sleep' || this.dead) return;
    const rate = [3, 6, 12][this.phase - 1];
    if (Math.random() < dt * rate) world.particles.embers(this.x + rand(-14, 14), this.y - rand(16, 96), 1);
    if (Math.random() < dt * rate * 0.6) ashBurst(world, this.x + rand(-12, 12), this.y - rand(30, 96), 1, 0.4);
    if (this.phase >= 2 && Math.random() < dt * 14) {
      // Rauch sinkt vom Schwebenden zu Boden
      world.particles.spawn({ x: this.x + rand(-6, 6), y: this.y, z: rand(2, 10), vx: rand(-8, 8), vy: rand(-3, 3), rise: rand(-4, 2), drag: 2, life: rand(0.6, 1.1), colors: ['#3a3040', '#2a2230', '#1c1620'], size: 2, alpha: 0.7, shrink: true });
    }
    if (this.enraged && Math.random() < dt * 12) {
      const c = this.#meta('chest');
      world.particles.spawn({ x: c.x + rand(-3, 3), y: c.y, vx: rand(-8, 8), vy: 0, rise: rand(20, 40), wobble: 20, life: rand(0.3, 0.6), colors: WHITE_FIRE, emissive: true });
    }
  }

  #deathTick(dt, world) {
    const t = this.stateTime;
    if (t < 1.3 && Math.random() < dt * 30) world.particles.element(this.x + rand(-18, 18), this.y - rand(16, 96), 'fire', 1, 4);
    // Zerfall: Asche steigt auf, Glut stiebt
    if (t > 1.9 && t < 4.2) {
      const k = (t - 1.9) / 2.3;
      const y = this.y - 104 * (1 - k);
      for (let i = 0; i < 3; i++) if (Math.random() < 0.8) ashBurst(world, this.x + rand(-14, 12), y + rand(-4, 4), 1, 0.7);
      if (Math.random() < 0.6) world.particles.embers(this.x + rand(-12, 10), y, 1);
    }
    if (t > 4 && t < 9 && Math.random() < dt * 4) world.particles.embers(this.x + rand(-10, 10), this.y - rand(0, 4), 1);
  }

  onHurt(hit) {
    if (this.state === 'sleep') return;
    if (this.state === 'chase' && hit?.heavy && Math.random() < 0.3) this.hurtAnim = 0.25;
    if (this.world && Math.random() < 0.4) ashBurst(this.world, this.x + rand(-7, 7), this.y - rand(30, 80), 2, 0.6);
    this.world?.bus.emit('bossHurt', { actor: this });
  }

  die(hit) {
    super.die(hit);
    this.hurtable = false;
    this.setState('dead');
    this.animator.play('death', true);
    const w = this.world;
    if (!w) return;
    this.#cancel(w);
    for (const a of this.adds) if (a.takeHit && !a.dead) a.takeHit({ damage: 99999, dirX: 0, dirY: 1, knockback: 0, source: this });
    for (const h of this.hazards) h.removed = true;
    this.hazards = []; this.fissures = [];
    w.combat.hitboxes = w.combat.hitboxes.filter((h) => h.owner.team !== 'enemy');
    w.projectiles.forEach((p) => { if (p.owner === this) p.removed = true; });
    w.session.slowmo?.(0.35, 1.6);
    w.session.camera?.shake(10);
    if (this.coreLight) this.coreLight.dead = true;
    if (this.fillLight) this.fillLight.dead = true;
    w.addLight(flashLight({ x: this.x, y: this.y - 76, radius: 220, color: WHITE_RGB, intensity: 1.1, ttl: 1.3, bloom: 0.8 }));
    this.deathLight = w.addLight(new Light({ follow: this, offsetY: -24, radius: 115, color: FIRE_RGB, intensity: 0.9, flicker: 0.25, ttl: 9, bloom: 0.3 }));
    w.particles.ring(this.x, this.y - 62, 10, 50, WHITE_FIRE, 180);
    for (let i = 0; i < 40; i++) w.particles.embers(this.x + rand(-22, 22), this.y - rand(16, 110), 1);
    impactFx(w, this.x, this.y - 30, 70, true);
  }

  // ---------------------------------------------------------------- Zeichnen

  renderEmissive(ctx, cx, cy) {
    for (const g of this.ghosts) {
      const k = 1 - g.t / 0.3;
      g.frame.draw(ctx, g.x - cx, g.y - cy, { flip: g.flip, flash: true, alpha: 0.06 * k });
      g.frame.glow?.draw(ctx, g.x - cx, g.y - cy, { flip: g.flip, alpha: 0.5 * k });
    }
    super.renderEmissive(ctx, cx, cy);
    const f = this.animator.frame;
    const glow = f.glow;
    if (!glow) return;
    const fade = this.dead ? Math.max(0, 1 - Math.max(0, this.stateTime - 4.2) * 0.3) : 1;
    if (fade <= 0) return;
    const heat = this.state === 'channel' || this.state === 'transform' ? 1 : 0.84 + 0.16 * Math.sin(this.stateTime * (this.enraged ? 9 : 5));
    glow.draw(ctx, this.x - cx, this.y - cy, { flip: this.facing < 0, alpha: (this.state === 'sleep' ? 0.5 : heat) * fade });
    // Glanz an der Klinge kurz vor dem Schlag
    if (this.state === 'windup' && this.stateTime > this.windup * 0.55) {
      const t = this.#meta('tip'), k = (this.stateTime - this.windup * 0.55) / (this.windup * 0.45);
      const r = Math.round(2 + k * 6), x = Math.round(t.x - cx), y = Math.round(t.y - cy);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - r, y, r * 2 + 1, 1); ctx.fillRect(x, y - r, 1, r * 2 + 1);
      ctx.fillStyle = this.enraged ? '#fff4c8' : '#ffb048';
      ctx.fillRect(x - 1, y - 1, 3, 3);
    }
    // Kanal: Glutsäule aus der Schwertspitze in den Himmel
    if (this.state === 'channel') {
      const t = this.#meta('tip'), x = Math.round(t.x - cx), y = Math.round(t.y - cy);
      const k = Math.min(1, this.stateTime * 2);
      for (let i = 0; i < 90 * k; i += 1) {
        const w = 1 + Math.round(Math.sin(i * 0.5 + this.stateTime * 20) + 1);
        ctx.globalAlpha = 0.9 * (1 - i / 95);
        ctx.fillStyle = i < 6 ? '#ffffff' : i < 30 ? '#fff4c8' : '#ffb048';
        ctx.fillRect(x - Math.floor(w / 2), y - i, w, 1);
      }
      ctx.globalAlpha = 1;
    }
  }
}

// ------------------------------------------------------------------ Gefahren

// Glutstoß: kurzer Feuerstrahl entlang der Linie (nur Optik; Treffer prüft der Boss)
class ThrustFlare extends Entity {
  constructor(x, y, angle, len, owner) { super(x, y); Object.assign(this, { angle, len, owner }); this.t = 0; }
  update(dt) { this.t += dt; if (this.t > 0.3) this.removed = true; }
  renderEmissive(ctx, cx, cy) {
    const k = this.t / 0.3, ca = Math.cos(this.angle), sa = Math.sin(this.angle) * 0.75;
    const L = this.len * Math.min(1, this.t * 12);
    ctx.globalAlpha = 1 - k;
    for (let s = 14; s < L; s += 1) {
      const x = Math.round(this.x + ca * s - cx), y = Math.round(this.y + sa * s - cy - 12 + (s / this.len) * 8);
      const w = s > L - 6 ? 1 : 3;
      ctx.fillStyle = '#ff6a14'; ctx.fillRect(x, y - 1, 1, w);
      ctx.fillStyle = s % 3 ? '#ffc048' : '#fff4c8'; ctx.fillRect(x, y, 1, 1);
    }
    ctx.globalAlpha = 1;
  }
}

// Aschenwelle: eine Wand aus Asche und Glut rollt eine markierte Bahn entlang (trifft einmal)
export class AshWave extends Entity {
  constructor(x, y, angle, len, owner, { width = 28, speed = 210, damage = 150 } = {}) {
    super(x, y);
    Object.assign(this, { angle, len, owner, width, speed, damage });
    this.t = 0; this.s = 0; this.hitDone = false; this.lastMark = 0; this.sortOffset = 2; this.cancelable = true;
    this.cos = Math.cos(angle); this.sin = Math.sin(angle);
  }
  #pt(s, k) {
    const gx = this.cos * s - this.sin * k, gy = this.sin * s + this.cos * k;
    return { x: this.x + gx, y: this.y + gy * 0.75 };
  }
  update(dt, world) {
    this.t += dt;
    this.s = Math.min(this.len, this.t * this.speed);
    if (this.owner.dead) { this.removed = true; return; }
    const hw = this.width / 2;
    for (let i = 0; i < 2; i++) {
      const p = this.#pt(this.s, rand(-hw, hw));
      world.particles.spawn({ x: p.x, y: p.y, z: rand(2, 12), vx: this.cos * rand(20, 50), vy: this.sin * rand(10, 30), rise: rand(6, 20), wobble: 12, drag: 2, life: rand(0.5, 0.9), colors: [pick(ASH)], size: 2, shrink: true });
    }
    if (Math.random() < 0.7) { const p = this.#pt(this.s, rand(-hw, hw)); world.particles.embers(p.x, p.y, 1); }
    if (this.s - this.lastMark > 10) { this.lastMark = this.s; const p = this.#pt(this.s - 4, rand(-hw * 0.5, hw * 0.5)); world.decals.scorch(p.x, p.y, 7); }
    if (this.s >= this.len) {
      this.removed = true;
      const p = this.#pt(this.len, 0);
      ashBurst(world, p.x, p.y, 14, 1.2);
      world.particles.element(p.x, p.y - 4, 'fire', 10, 8);
      return;
    }
    const h = world.hero;
    if (this.hitDone || h.dead) return;
    const rx = h.x - this.x, ry = (h.y - this.y) / 0.75;
    const along = rx * this.cos + ry * this.sin, perp = -rx * this.sin + ry * this.cos;
    if (Math.abs(along - this.s) < 10 && Math.abs(perp) < hw + 4) {
      if (hurtHero(world, this.owner, this.damage, this.cos, this.sin, 280, true)) this.hitDone = true;
      else if (h.dodgedTimer > 0) this.hitDone = true;
    }
  }
  renderEmissive(ctx, cx, cy) {
    const hw = this.width / 2, hot = this.owner.phase >= 3;
    const grow = Math.min(1, this.t * 6);
    for (let d = 7; d >= 0; d--) {
      ctx.globalAlpha = 0.95 - d * 0.09;
      for (let k = -hw; k <= hw; k += 1) {
        const p = this.#pt(this.s - d * 1.6, k);
        const edge = 1 - Math.abs(k) / (hw + 1);
        const h = Math.round((9 + 9 * Math.sqrt(edge)) * (0.8 + 0.2 * Math.sin(k * 1.3 + this.t * 26)) * grow * (1 - d * 0.1));
        const x = Math.round(p.x - cx), y = Math.round(p.y - cy);
        ctx.fillStyle = '#3a3034'; ctx.fillRect(x, y - Math.round(h * 0.55), 1, Math.round(h * 0.55));
        ctx.fillStyle = d < 3 ? '#8a8279' : '#5a524c'; ctx.fillRect(x, y - Math.round(h * 0.9), 1, Math.round(h * 0.35));
        ctx.fillStyle = d === 0 ? (hot ? '#fff4c8' : '#ffb048') : '#f07a1c'; ctx.fillRect(x, y - h, 1, d < 2 ? 2 : 1);
        if (d === 0 && (k + Math.floor(this.t * 20)) % 4 === 0) { ctx.fillStyle = '#ff6a14'; ctx.fillRect(x, y - 2, 1, 2); }
      }
    }
    ctx.globalAlpha = 1;
  }
}

// Glutspeer: schwebt zielend, fliegt dann die markierte Linie entlang
export class EmberSpear extends Entity {
  constructor(x, y, angle, owner, { delay = 1, damage = 70, len = 300, speed = 360 } = {}) {
    super(x, y);
    Object.assign(this, { angle, owner, delay, damage, len, speed });
    this.t = 0; this.s = 0; this.z = 26; this.hitDone = false; this.sortOffset = 3000; this.cancelable = true;
    this.x0 = x; this.y0 = y; this.stuck = 0;
  }
  update(dt, world) {
    this.t += dt;
    if (this.owner.dead) { this.removed = true; return; }
    if (this.t < this.delay) {
      this.z = 26 - 8 * (this.t / this.delay) ** 2;
      if (Math.random() < dt * 14) world.particles.spawn({ x: this.x, y: this.y, z: this.z, vx: 0, vy: 0, rise: 10, life: 0.3, colors: FIRE, emissive: true });
      return;
    }
    if (this.stuck > 0) { this.stuck -= dt; if (this.stuck <= 0) this.removed = true; return; }
    const ca = Math.cos(this.angle), sa = Math.sin(this.angle) * 0.75;
    this.s += this.speed * dt;
    this.z = Math.max(8, this.z - dt * 30);
    this.x = this.x0 + ca * this.s; this.y = this.y0 + sa * this.s;
    if (Math.random() < 0.8) world.particles.spawn({ x: this.x - ca * 6, y: this.y - sa * 6, z: this.z, vx: -ca * 30, vy: -sa * 30, rise: 6, life: 0.25, colors: FIRE, emissive: true });
    const h = world.hero;
    if (!this.hitDone && !h.dead && Math.hypot(h.x - this.x, h.y - this.y) < (h.hurtRadius ?? 6) + 5) {
      if (hurtHero(world, this.owner, this.damage, ca, sa, 150)) { this.hitDone = true; this.#burst(world); this.removed = true; return; }
      if (h.dodgedTimer > 0) this.hitDone = true;
    }
    if (this.s >= this.len - 4) {
      this.stuck = 0.6;
      this.#burst(world);
    }
  }
  #burst(world) {
    world.particles.element(this.x, this.y - this.z * 0.5, 'fire', 10, 4);
    world.decals.scorch(this.x, this.y, 5);
    world.addLight(flashLight({ x: this.x, y: this.y, radius: 40, color: FIRE_RGB, intensity: 0.8, ttl: 0.2, bloom: 0.3 }));
    world.bus.emit('arrowStuck', { x: this.x, y: this.y });
  }
  render(ctx, cx, cy) {
    ctx.fillStyle = 'rgba(4,2,8,0.45)';
    ctx.fillRect(Math.round(this.x - cx - 3), Math.round(this.y - cy), 7, 1);
  }
  renderEmissive(ctx, cx, cy) {
    const flying = this.t >= this.delay;
    const grow = Math.min(1, this.t / 0.25);
    const ca = Math.cos(this.angle), sa = Math.sin(this.angle) * 0.75;
    const n = Math.hypot(ca, sa) || 1, ux = ca / n, uy = sa / n;
    const L = Math.round(16 * grow);
    const bx = this.x - cx, by = this.y - this.z - cy;
    const fade = this.stuck > 0 ? this.stuck / 0.6 : 1;
    // Schweif
    if (flying && this.stuck <= 0) for (let i = 1; i < 10; i++) {
      ctx.globalAlpha = 0.6 * (1 - i / 10);
      ctx.fillStyle = i < 4 ? '#ffb048' : '#c8420c';
      ctx.fillRect(Math.round(bx - ux * (L / 2 + i * 2)), Math.round(by - uy * (L / 2 + i * 2)), 1, 1);
    }
    ctx.globalAlpha = fade;
    for (let i = -L / 2; i <= L / 2; i += 0.5) {
      const x = Math.round(bx + ux * i), y = Math.round(by + uy * i);
      const tip = i > L / 2 - 4;
      ctx.fillStyle = tip ? '#fff4c8' : i < -L / 2 + 3 ? '#8a2a08' : '#ff6a14';
      ctx.fillRect(x, y, 1, 1);
      if (!tip && i > -L / 2 + 2) { ctx.fillStyle = '#ffc048'; ctx.fillRect(x, y - 1, 1, 1); }
    }
    // Glühender Kern kurz vor dem Abflug
    if (!flying && this.t > this.delay - 0.3) {
      const x = Math.round(bx + ux * L / 2), y = Math.round(by + uy * L / 2);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 2, y, 5, 1); ctx.fillRect(x, y - 2, 1, 5);
    }
    ctx.globalAlpha = 1;
  }
}

// Obsidianmeteor: fällt nach der Warnzeit schräg vom Himmel, Phase 3: Glutfleck bleibt
export class ObsidianMeteor extends Entity {
  constructor(x, y, owner, { delay = 1.2, damage = 130, r = 24, big = false }) {
    super(x, y);
    Object.assign(this, { owner, delay, damage, r, big });
    this.t = 0; this.fall = 0.5; this.sortOffset = 4000; this.cancelable = true;
  }
  #pos(k) { const H = 190 * (1 - k); return [this.x + H * 0.4, this.y - H]; }
  update(dt, world) {
    this.t += dt;
    if (this.owner.dead) { this.removed = true; return; }
    const k = (this.t - (this.delay - this.fall)) / this.fall;
    if (k > 0 && k < 1 && Math.random() < 0.9) {
      const [mx, my] = this.#pos(k);
      world.particles.spawn({ x: mx, y: my, vx: rand(-10, 10), vy: rand(-10, 10), rise: 4, life: rand(0.2, 0.4), colors: Math.random() < 0.5 ? FIRE : ['#5a524c', '#3a3034'], emissive: Math.random() < 0.6, size: 2, shrink: true });
    }
    if (this.t >= this.delay) {
      this.removed = true;
      const { x, y } = this;
      world.combat.add({ owner: this.owner, team: 'enemy', shape: 'circle', follow: false, x, y: y - 6, lift: 6, r: this.r, damage: this.damage, knockback: 220, heavy: true, ttl: 0.1 });
      world.particles.bones(x, y, 6, -Math.PI / 2, 12, ['#0c0a10', '#1a1622', '#2a2434', '#8e2408']);
      world.particles.element(x, y - 4, 'fire', 22, 10);
      world.particles.ring(x, y, 6, 22, FIRE, 120);
      ashBurst(world, x, y, 10, 1);
      world.decals.scorch(x, y, 16);
      world.addLight(flashLight({ x, y, radius: 110, color: [255, 140, 60], intensity: 1.1, ttl: 0.4, bloom: 0.7 }));
      world.session.camera?.shake(this.big ? 8 : 4);
      if (this.big) world.session.hitstop?.(0.05);
      impactFx(world, x, y, this.r, this.big);
      world.bus.emit('bossMeteor', { x, y });
      if (this.owner.phase >= 3) world.spawn(new EmberPatch(x, y, this.owner, { r: 14, duration: 4, damage: 40 }));
    }
  }
  renderEmissive(ctx, cx, cy) {
    const k = (this.t - (this.delay - this.fall)) / this.fall;
    if (k <= 0 || k >= 1) return;
    const [mx, my] = this.#pos(k);
    const x = Math.round(mx - cx), y = Math.round(my - cy);
    for (let i = 1; i < 16; i++) {
      ctx.globalAlpha = 0.85 * (1 - i / 16);
      ctx.fillStyle = i < 4 ? '#fff0b0' : i < 8 ? '#ffb640' : i < 12 ? '#f07a1c' : '#7a2208';
      ctx.fillRect(Math.round(x + i * 0.8), Math.round(y - i * 2), i < 6 ? 4 : 2, 2);
    }
    ctx.globalAlpha = 1;
    const s = this.big ? 4 : 3;
    ctx.fillStyle = '#1a1622'; ctx.fillRect(x - s, y - s, s * 2 + 1, s * 2 + 1);
    ctx.fillStyle = '#40384e'; ctx.fillRect(x - s, y - s, s, s);
    ctx.fillStyle = '#ffb048'; ctx.fillRect(x - s, y + s, s * 2 + 1, 1); ctx.fillRect(x + s, y - s, 1, s * 2 + 1);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x + s - 1, y + s - 1, 2, 2);
  }
}

// Glutfleck (brennender Boden): schadet im Takt, solange man darin steht
class EmberPatch extends Entity {
  constructor(x, y, owner, { r = 14, duration = 4, damage = 40, tick = 0.5 }) {
    super(x, y);
    Object.assign(this, { owner, r, duration, damage, tick });
    this.t = 0; this.cool = 0; this.sortOffset = -19500; this.seed = Math.random() * 100;
  }
  update(dt, world) {
    this.t += dt;
    if (this.t >= this.duration || this.owner.dead) { this.removed = true; return; }
    if (Math.random() < dt * 6) { const a = rand(0, 6.28), r = rand(0, this.r); world.particles.embers(this.x + Math.cos(a) * r, this.y + Math.sin(a) * r * 0.6, 1); }
    this.cool -= dt;
    const h = world.hero;
    if (this.cool <= 0 && !h.dead && Math.hypot(h.x - this.x, (h.y - this.y) / 0.6) < this.r) if (hurtHero(world, this.owner, this.damage, 0, -1, 30, false, true)) this.cool = this.tick;
  }
  renderEmissive(ctx, cx, cy) {
    const fade = Math.min(1, this.t * 5, (this.duration - this.t) * 1.5);
    const n = Math.round(this.r * 1.8);
    for (let i = 0; i < n; i++) {
      const a = i * 2.39 + this.seed, r = ((i * 0.618 + this.seed) % 1) * this.r;
      const fl = Math.sin(this.t * 9 + i * 1.7) * 0.5 + 0.5, hgt = Math.round((2 + fl * 4) * fade);
      const px = Math.round(this.x + Math.cos(a) * r - cx), py = Math.round(this.y + Math.sin(a) * r * 0.6 - cy);
      ctx.globalAlpha = 0.9 * fade;
      ctx.fillStyle = '#c8420c'; ctx.fillRect(px, py - hgt, 1, hgt);
      ctx.fillStyle = '#ffb640'; ctx.fillRect(px, py - Math.round(hgt * 0.5), 1, Math.max(1, Math.round(hgt * 0.4)));
    }
    ctx.globalAlpha = 1;
  }
}

// Feuersäule: nach der Warnzeit bricht eine hohe Flammensäule aus dem Boden
export class FirePillar extends Entity {
  constructor(x, y, owner, { delay = 1, damage = 120, r = 17 }) {
    super(x, y);
    Object.assign(this, { owner, delay, damage, r });
    this.t = 0; this.sortOffset = 2; this.cancelable = true; this.burst = false;
  }
  update(dt, world) {
    this.t += dt;
    if (this.owner.dead) { this.removed = true; return; }
    if (!this.burst && this.t >= this.delay) {
      this.burst = true;
      world.combat.add({ owner: this.owner, team: 'enemy', shape: 'circle', follow: false, x: this.x, y: this.y - 6, lift: 6, r: this.r, damage: this.damage, knockback: 180, heavy: true, ttl: 0.2 });
      world.particles.element(this.x, this.y - 10, 'fire', 14, 6);
      world.decals.scorch(this.x, this.y, 10);
      world.addLight(flashLight({ x: this.x, y: this.y - 20, radius: 70, color: FIRE_RGB, intensity: 1, ttl: 0.45, bloom: 0.6 }));
      world.session.camera?.shake(2);
      impactFx(world, this.x, this.y, this.r, false);
    }
    if (this.t >= this.delay + 0.55) this.removed = true;
  }
  renderEmissive(ctx, cx, cy) {
    if (!this.burst) return;
    const k = (this.t - this.delay) / 0.55;
    const H = Math.round(70 * Math.sin(Math.min(1, k * 2.2) * Math.PI / 2) * (1 - k * 0.5));
    const x = this.x - cx, y = this.y - cy;
    const hot = this.owner.phase >= 3;
    ctx.globalAlpha = Math.min(1, (1 - k) * 2);
    for (let i = -6; i <= 6; i++) {
      const hh = Math.round(H * (1 - (i * i) / 49) * (0.85 + 0.15 * Math.sin(i * 2 + this.t * 30)));
      if (hh <= 0) continue;
      const e = Math.abs(i);
      ctx.fillStyle = e > 4 ? '#8a2a08' : e > 2 ? '#f07a1c' : '#ffb640';
      ctx.fillRect(Math.round(x + i), Math.round(y - hh), 1, hh);
      if (e < 2) { ctx.fillStyle = hot ? '#ffffff' : '#fff0b0'; ctx.fillRect(Math.round(x + i), Math.round(y - hh * 0.8), 1, Math.round(hh * 0.8)); }
    }
    ctx.globalAlpha = 1;
  }
}

// Glutriss (Phase 3): Zickzack über den Arenaboden, glimmt dauerhaft, bricht in Abständen aus.
// Vor jedem Ausbruch: 1,1 s Warnung (Linien-Telegraphen + Aufglühen).
export class EmberFissure extends Entity {
  constructor(points, owner, { offset = 2, damage = 90, period = 6.5 }) {
    super(points[0].x, points[0].y);
    Object.assign(this, { points, owner, damage, period });
    this.t = -offset; this.sortOffset = -19800; this.cycleT = 0; this.phaseState = 'idle'; this.hitDone = false;
    this.open = 0; this.stamped = false;
  }
  distTo(x, y) {
    let d = 1e9;
    for (let i = 0; i < this.points.length - 1; i++) { const a = this.points[i], b = this.points[i + 1]; d = Math.min(d, segDist(x, y, a.x, a.y, b.x, b.y)); }
    return d;
  }
  #warn(world, dur) {
    for (let i = 0; i < this.points.length - 1; i++) {
      const a = this.points[i], b = this.points[i + 1];
      const ang = Math.atan2((b.y - a.y) / 0.75, b.x - a.x), len = Math.hypot(b.x - a.x, (b.y - a.y) / 0.75);
      world.spawn(new Telegraph(a.x, a.y, { shape: 'line', angle: ang, len, width: 16, duration: dur, color: WARN_FIRE }));
    }
    world.bus.emit('telegraph', { actor: this.owner, attack: 'fissure' });
  }
  update(dt, world) {
    this.t += dt;
    this.open = Math.min(1, this.open + dt * 1.5);
    if (this.owner.dead) { this.removed = true; return; }
    if (!this.stamped) {
      this.stamped = true;
      for (let i = 0; i < this.points.length - 1; i++) {
        const a = this.points[i], b = this.points[i + 1];
        for (let s = 0; s <= 1; s += 0.1) world.decals.scorch(a.x + (b.x - a.x) * s, a.y + (b.y - a.y) * s, 5);
      }
      world.session.camera?.shake(6);
      world.bus.emit('bossImpact', { x: this.x, y: this.y });
    }
    if (Math.random() < dt * 5) { const p = this.#rand(); world.particles.embers(p.x, p.y, 1); }
    // Während des Weltenbrands ruhen die Risse
    const channel = this.owner.state === 'channel' || this.owner.state === 'channelUp';
    if (this.t < 0) return;
    const c = this.t % this.period;
    const warnAt = this.period - 1.6, eruptAt = this.period - 0.5;
    if (this.phaseState === 'idle' && c >= warnAt && c < eruptAt && !channel) { this.phaseState = 'warn'; this.#warn(world, eruptAt - c); }
    else if (this.phaseState === 'warn' && c >= eruptAt) {
      this.phaseState = 'erupt'; this.hitDone = false;
      for (let i = 0; i < 8; i++) { const p = this.#rand(); world.particles.element(p.x, p.y - 4, 'fire', 4, 4); }
      world.addLight(flashLight({ x: this.#mid().x, y: this.#mid().y, radius: 140, color: FIRE_RGB, intensity: 0.9, ttl: 0.5, bloom: 0.5 }));
      world.session.camera?.shake(3);
      impactFx(world, this.#mid().x, this.#mid().y, 20, false);
    } else if (this.phaseState === 'erupt' && c < warnAt) this.phaseState = 'idle';
    if (this.phaseState === 'erupt' && !this.hitDone) {
      const h = world.hero;
      if (!h.dead && this.distTo(h.x, h.y) < 9) {
        if (hurtHero(world, this.owner, this.damage, 0, -1, 160, true, true)) this.hitDone = true;
        else if (h.dodgedTimer > 0) this.hitDone = true;
      }
    }
  }
  #mid() { return this.points[Math.floor(this.points.length / 2)]; }
  #rand() {
    const i = Math.floor(Math.random() * (this.points.length - 1)), a = this.points[i], b = this.points[i + 1], s = Math.random();
    return { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s };
  }
  renderEmissive(ctx, cx, cy) {
    const c = this.t < 0 ? 0 : this.t % this.period;
    const warn = this.phaseState === 'warn', erupt = this.phaseState === 'erupt';
    const ek = erupt ? Math.max(0, 1 - (c - (this.period - 0.5)) / 0.5) : 0;
    for (let i = 0; i < this.points.length - 1; i++) {
      const a = this.points[i], b = this.points[i + 1];
      const L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.ceil(L);
      for (let s = 0; s <= n * this.open; s++) {
        const k = s / n;
        const jit = ((s * 7919 + i * 31) % 5) - 2;
        const x = Math.round(a.x + (b.x - a.x) * k - cx), y = Math.round(a.y + (b.y - a.y) * k - cy + jit * 0.4);
        const pulse = warn ? 0.5 + 0.5 * Math.sin(this.t * 24) : 0;
        ctx.fillStyle = '#5a1406'; ctx.fillRect(x, y - 1, 1, 3);
        ctx.fillStyle = warn && pulse > 0.5 ? '#ffc048' : '#f0661a'; ctx.fillRect(x, y, 1, 1);
        if ((s + i) % 4 === 0) { ctx.fillStyle = '#ffb048'; ctx.fillRect(x, y, 1, 1); }
        if (erupt) {
          const hh = Math.round((6 + 14 * Math.abs(Math.sin(s * 0.9 + this.t * 20))) * ek);
          ctx.fillStyle = '#f07a1c'; ctx.fillRect(x, y - hh, 1, hh);
          ctx.fillStyle = '#fff0b0'; ctx.fillRect(x, y - Math.round(hh * 0.5), 1, Math.round(hh * 0.4));
        }
      }
    }
  }
}

// Weltenbrand: die ganze Arena glüht auf und brennt, nur der goldene Kreis ist sicher.
export class Cataclysm extends Entity {
  constructor(x, y, owner, { arena, duration = 5, damage = 230, r = 30 }) {
    super(x, y);
    Object.assign(this, { owner, arena, duration, damage, r });
    this.t = 0; this.fired = false; this.sortOffset = -19900; this.cancelable = false;
    this.fireAt = duration - 0.7;
  }
  update(dt, world) {
    this.t += dt;
    if (this.owner.dead) { this.removed = true; if (this.light) this.light.dead = true; if (this.redLight) this.redLight.dead = true; return; }
    if (!this.light) {
      this.light = world.addLight(new Light({ x: this.x, y: this.y - 10, radius: this.r * 2.4, color: GOLD_RGB, intensity: 0.8, flicker: 0.1, ttl: this.duration, bloom: 0.4 }));
      const A = this.arena;
      this.redLight = world.addLight(new Light({ x: (A.x0 + A.x1) / 2, y: (A.y0 + A.y1) / 2, radius: Math.max(A.x1 - A.x0, A.y1 - A.y0) * 0.7, color: [255, 60, 30], intensity: 0.3, flicker: 0.2, ttl: this.duration, bloom: 0 }));
    }
    const k = Math.min(1, this.t / this.fireAt);
    if (this.redLight) this.redLight.intensity = 0.15 + 0.3 * k;
    const A = this.arena;
    // Warnfunken über dem ganzen Boden, außer im Kreis
    if (!this.fired && Math.random() < 0.9) {
      const x = rand(A.x0, A.x1), y = rand(A.y0, A.y1);
      if (!this.#inside(x, y)) world.particles.spawn({ x, y, vx: 0, vy: 0, rise: rand(10, 30) * (0.5 + k), wobble: 10, life: rand(0.4, 0.8), colors: FIRE, emissive: true });
    }
    // goldene Funken steigen im Kreis auf
    if (!this.fired && Math.random() < dt * 20) { const a = rand(0, 6.28), r = rand(0, this.r); world.particles.spawn({ x: this.x + Math.cos(a) * r, y: this.y + Math.sin(a) * r * 0.6, vx: 0, vy: 0, rise: rand(16, 34), wobble: 8, life: rand(0.6, 1.1), colors: ['#ffffff', ...GOLDC], emissive: true }); }
    if (!this.fired && this.t >= this.fireAt) {
      this.fired = true;
      const h = world.hero;
      if (!h.dead && !this.#inside(h.x, h.y)) hurtHero(world, this.owner, this.damage, 0, -1, 200, true);
      for (let i = 0; i < 60; i++) {
        const x = rand(A.x0, A.x1), y = rand(A.y0, A.y1);
        if (this.#inside(x, y)) continue;
        world.particles.element(x, y - 4, 'fire', 2, 4);
        if (i % 5 === 0) world.decals.scorch(x, y, 8);
      }
      world.addLight(flashLight({ x: (A.x0 + A.x1) / 2, y: (A.y0 + A.y1) / 2, radius: 320, color: WHITE_RGB, intensity: 1.3, ttl: 0.6, bloom: 1 }));
      world.session.camera?.shake(14);
      world.session.hitstop?.(0.12);
      impactFx(world, this.owner.x, this.owner.y, 140, true);
      world.bus.emit('bossCataclysm', { bossId: this.owner.bossId });
    }
    if (this.t >= this.duration || this.owner.dead) { this.removed = true; if (this.light) this.light.dead = true; if (this.redLight) this.redLight.dead = true; }
  }
  #inside(x, y) { return Math.hypot(x - this.x, (y - this.y) / 0.6) < this.r; }
  // Lit-Pass: Arena rot getönt (füllt sich), Kreis ausgespart
  render(ctx, cx, cy) {
    const A = this.arena;
    const k = Math.min(1, this.t / this.fireAt);
    const burn = this.fired ? Math.max(0, 1 - (this.t - this.fireAt) / 0.7) : 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(A.x0 - cx, A.y0 - 8 - cy, A.x1 - A.x0, A.y1 - A.y0 + 8);
    ctx.ellipse(this.x - cx, this.y - cy, this.r, this.r * 0.6, 0, 0, Math.PI * 2);
    // Ausbruch: kurzer Blitz (höchstens 38 %, 0,12 s), danach nur noch dunkles Nachglühen
    const since = this.t - this.fireAt;
    ctx.globalAlpha = this.fired ? (since < 0.12 ? 0.38 : 0.2 * burn) : 0.12 + 0.26 * k;
    ctx.fillStyle = this.fired ? (since < 0.12 ? '#ffb048' : '#a8300a') : '#c8300c';
    ctx.fill('evenodd');
    // der sichere Kreis leuchtet golden
    if (!this.fired) {
      ctx.globalAlpha = 0.22 + 0.12 * Math.sin(this.t * 10);
      ctx.fillStyle = '#e8c25a';
      ctx.beginPath(); ctx.ellipse(this.x - cx, this.y - cy, this.r, this.r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  // Emissive: pulsierender Goldkreis mit Strahlen, beim Ausbruch Flammenmeer
  renderEmissive(ctx, cx, cy) {
    const x = this.x - cx, y = this.y - cy;
    const k = Math.min(1, this.t / this.fireAt);
    ctx.save();
    if (!this.fired) {
      const pulse = 0.6 + 0.4 * Math.sin(this.t * (8 + k * 16));
      ctx.globalAlpha = 0.7 + 0.3 * pulse;
      ctx.strokeStyle = '#fff0a8'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y, this.r, this.r * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = '#e8c25a'; ctx.globalAlpha = pulse;
      ctx.beginPath(); ctx.ellipse(x, y, this.r - 4, (this.r - 4) * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
      // Runen-Zacken auf dem Ring
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + this.t * 0.8; ctx.fillRect(Math.round(x + Math.cos(a) * (this.r + 2)), Math.round(y + Math.sin(a) * (this.r + 2) * 0.6), 1, 1); }
      // Lichtsäule über dem Kreis
      for (let i = 0; i < 60; i++) {
        ctx.globalAlpha = 0.25 * (1 - i / 60) * pulse;
        ctx.fillStyle = '#fff0a8';
        ctx.fillRect(Math.round(x - 6), Math.round(y - i), 13, 1);
      }
      // Pfeile vom Rand der Arena zeigen zum Kreis (wenn der Held weit weg ist)
      const h = this.owner.world?.hero;
      if (h && !this.#inside(h.x, h.y)) {
        const a = Math.atan2(this.y - h.y, this.x - h.x);
        ctx.globalAlpha = 0.9; ctx.fillStyle = '#fff0a8';
        for (let s = 12; s < 34; s += 4) ctx.fillRect(Math.round(h.x - cx + Math.cos(a) * s), Math.round(h.y - cy - 6 + Math.sin(a) * s * 0.6), 2, 1);
      }
      // Glutzungen, die mit der Zeit höher werden
      const A = this.arena;
      for (let i = 0; i < 48; i++) {
        const gx = A.x0 + ((i * 0.6180339) % 1) * (A.x1 - A.x0);
        const gy = A.y0 + ((i * 0.4142135) % 1) * (A.y1 - A.y0);
        if (this.#inside(gx, gy)) continue;
        const fl = 0.5 + 0.5 * Math.sin(this.t * 11 + i * 2.1);
        const hh = Math.round((1 + 3 * k) * fl);
        const px = Math.round(gx - cx), py = Math.round(gy - cy);
        ctx.globalAlpha = (0.35 + 0.5 * k) * (0.5 + fl * 0.5);
        ctx.fillStyle = '#c8420c'; ctx.fillRect(px - 1, py - 1, 3, 1);
        ctx.fillStyle = k > 0.75 ? '#ffb048' : '#f0661a'; ctx.fillRect(px, py - 1 - hh, 1, hh + 1);
      }
    } else {
      const b = Math.max(0, 1 - (this.t - this.fireAt) / 0.7);
      const A = this.arena;
      ctx.globalAlpha = 0.8 * b;
      for (let i = 0; i < 160; i++) {
        const gx = A.x0 + ((i * 0.6180339) % 1) * (A.x1 - A.x0), gy = A.y0 + ((i * 0.7548776) % 1) * (A.y1 - A.y0);
        if (this.#inside(gx, gy)) continue;
        const hh = Math.round(10 + 16 * Math.abs(Math.sin(i * 1.7 + this.t * 20)));
        ctx.fillStyle = '#f07a1c'; ctx.fillRect(Math.round(gx - cx), Math.round(gy - cy - hh), 2, hh);
        ctx.fillStyle = '#fff0b0'; ctx.fillRect(Math.round(gx - cx), Math.round(gy - cy - hh * 0.5), 1, Math.round(hh * 0.4));
      }
    }
    ctx.restore();
  }
}
