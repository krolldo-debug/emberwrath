import { CONFIG } from '../config.js';
import { EV } from '../core/events.js';
import { rand, pick } from '../core/math.js';
import { ExitPortal } from '../entities/Interactive.js';
import { Telegraph } from '../entities/Telegraph.js';
import { FireField } from '../entities/Ignaroth.js';
import { ENEMY_TYPES } from '../entities/enemyTypes.js';

const T = CONFIG.tileSize;

// Glutprüfung (Endgame, INTEGRATION.md / C: progression/trials.js).
// C beschreibt den Lauf (game.progression.trialRun()), zählt Kills und vergibt
// Belohnungen. Hier: Gegner-Nachschub aus dem Pool, jeder eliteEvery-te ein
// Elite, alle auf Stufe run.level mit hpMult; dmgMult wirkt als Schadens-Buff
// auf den Helden (hero.buffs.damageTaken), damit auch Projektile und Boden-
// gefahren der Bosse ohne Sonderwege skaliert werden. Affixe: burning_ground,
// hasty, armored, volatile; unbekannte werden ignoriert.
// Events: trial:boss { bossId } -> Nachschub stoppt, skalierter Boss erscheint.
//         trial:completed / trial:failed -> Rückkehrportal zur Glutsenke.
export class TrialDirector {
  constructor(world, bossClasses) {
    this.world = world;
    this.bossClasses = bossClasses;
    this.run = world.session.game?.progression?.trialRun?.() ?? null;
    this.phase = !this.run ? 'done' : this.run.phase === 'boss' ? 'boss' : this.run.phase === 'clear' ? 'clear' : 'done';
    this.spawned = 0;
    this.spawnTimer = 2.2; // kurze Ruhe zum Orientieren
    this.fireTimer = 4;
    this.aff = new Set(this.run?.affixes ?? []);
    this.exploded = new WeakSet();
    const L = world.dungeon.level;
    const a = L.room;
    world.arena = { x0: a.x * T, y0: a.y * T + T, x1: (a.x + a.w) * T, y1: (a.y + a.h) * T };
    world.bossHandled = true; // Belohnung kommt von C, keine Bosstruhe
    const bus = world.bus;
    this.offs = [
      bus.on('trial:boss', (e) => this.#startBoss(e?.bossId)),
      bus.on('trial:completed', () => this.#finish(true)),
      bus.on('trial:failed', () => this.#finish(false)),
    ];
    if (this.phase === 'boss') queueMicrotask(() => this.#startBoss(this.run.bossId));
    if (this.phase === 'done') queueMicrotask(() => this.#openExit());
  }

  dispose() { for (const off of this.offs) off?.(); }

  get maxAlive() { return Math.min(9, 5 + Math.floor((this.run?.tier ?? 1) / 4)); }

  update(dt) {
    const w = this.world, h = w.hero;
    if (!this.run || h.dead) return;
    // Schadensdruck der Stufe (erneuert, solange der Lauf läuft)
    if (this.phase !== 'done' && this.run.dmgMult > 1) h.buff?.('trial_pressure', 1, { damageTaken: this.run.dmgMult });
    if (this.phase === 'clear') {
      this.spawnTimer -= dt;
      const alive = w.enemies.filter((e) => !e.dead && e.trial).length;
      if (this.spawnTimer <= 0 && alive < this.maxAlive) {
        this.#spawnOne();
        this.spawnTimer = rand(0.7, 1.3) * (alive < 3 ? 0.6 : 1);
      }
    }
    // Brennender Boden: Glutflecken unter dem Helden
    if (this.aff.has('burning_ground') && this.phase !== 'done') {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireTimer = rand(3.2, 4.6);
        const p = w.dungeon.nearestFree(h.x + rand(-20, 20), h.y + rand(-14, 14));
        w.spawn(new Telegraph(p.x, p.y, { shape: 'circle', r: 18, duration: 0.9, color: [255, 120, 40] }));
        w.spawn(new FireField(p.x, p.y, { team: 'enemy', x: p.x, y: p.y }, { r: 18, delay: 0.9, duration: 6, damage: 18, tick: 0.5 }));
      }
    }
    // Explosiv: Gegner zerplatzen kurz nach dem Tod
    if (this.aff.has('volatile')) {
      for (const e of w.enemies) {
        if (!e.dead || !e.trial || this.exploded.has(e)) continue;
        this.exploded.add(e);
        this.#volatile(e.x, e.y);
      }
    }
  }

  #spawnOne() {
    const w = this.world, h = w.hero, run = this.run;
    const pool = (run.pool ?? []).filter((t) => ENEMY_TYPES[t] && t !== run.bossId && w.assets.sprites[ENEMY_TYPES[t].sprites]);
    const elites = (run.elites ?? []).filter((t) => ENEMY_TYPES[t] && w.assets.sprites[ENEMY_TYPES[t].sprites]);
    if (!pool.length) return;
    this.spawned++;
    const every = run.eliteEvery ?? 10;
    const elite = elites.length && this.spawned % every === 0;
    const type = elite ? pick(elites) : pick(pool);
    // Ort: freie Stelle im Raum, nicht direkt am Helden
    const A = w.arena;
    let p = null;
    for (let i = 0; i < 20 && !p; i++) {
      const x = rand(A.x0 + 24, A.x1 - 24), y = rand(A.y0 + 20, A.y1 - 16);
      const d = Math.hypot(x - h.x, y - h.y);
      if (d < 90 || d > 260) continue;
      const q = w.dungeon.nearestFree(x, y, 8);
      if (!w.dungeon.collidesRect(q.x - 6, q.y - 4, q.x + 6, q.y + 2)) p = q;
    }
    if (!p) return;
    const e = w.spawnEnemy(type, p.x, p.y, { respawned: true, home: { x: (A.x0 + A.x1) / 2, y: (A.y0 + A.y1) / 2 } });
    this.#scale(e, run.level ?? 20, run.hpMult ?? 1);
    e.trial = true;
    e.aggroed = true;
    e.leashFree = true;
    w.particles.ring?.(p.x, p.y - 4, 10, 16, ['#fff0b0', '#ffb640', '#f07a1c'], 70);
    w.bus.emit('bossSummon', { count: 1, x: p.x, y: p.y, trial: true });
  }

  // Stufe anheben (wie Enemy: +8 % je Stufe, hier kräftiger, weil die Themen
  // aus früheren Gebieten stammen) und Affixe anwenden.
  #scale(e, level, hpMult) {
    const def = e.def;
    const base = def.levels?.[0] ?? def.level ?? level;
    const up = Math.max(0, level - base);
    e.level = level;
    // Richtwerte von A (character/README.md): Leben ≈ 5 × Heldenkraft, Treffer ≈ 8 % Magier-Leben
    const hpAt = (L) => 5 * (13 + (L - 1) * 5), dmgAt = (L) => 86 + (L - 1) * 16.3;
    e.power = up ? dmgAt(level) / dmgAt(base) : 1;
    const armored = this.aff.has('armored') ? 1.35 : 1;
    e.maxHp = e.hp = Math.round(def.hp * (up ? hpAt(level) / hpAt(base) : 1) * hpMult * armored);
    e.xpOverride = undefined;
    if (this.aff.has('hasty')) e.speedBoost = 9999;
  }

  #volatile(x, y) {
    const w = this.world;
    const dmg = 24;
    w.spawn(new Telegraph(x, y - 2, { shape: 'circle', r: 24, duration: 0.65, color: [255, 150, 60] }));
    w.addEffect({
      t: 0, removed: false,
      update(dt, world) {
        this.t += dt;
        if (this.t < 0.65) return;
        this.removed = true;
        world.particles.ring?.(x, y - 4, 14, 20, ['#ffffff', '#ffe070', '#f07a1c'], 110);
        world.session.camera?.shake(3);
        world.bus.emit('spellImpact', { x, y, element: 'fire', radius: 24 });
        world.combat.add({ owner: { team: 'enemy', x, y }, team: 'enemy', shape: 'circle', follow: false, x, y: y - 4, r: 24, damage: dmg, knockback: 160, ttl: 0.1 });
      },
      render() {}, renderEmissive() {},
    });
  }

  #startBoss(bossId) {
    const w = this.world;
    if (this.phase === 'done' || w.boss) return;
    this.phase = 'boss';
    const id = bossId ?? this.run?.bossId;
    const def = ENEMY_TYPES[id];
    if (!def) return;
    // Übrige Diener ziehen sich in die Glut zurück (ohne Kill-Meldung)
    for (const e of w.enemies) if (e.trial && !e.dead) { e.killReported = true; e.takeHit({ damage: 99999, dirX: 0, dirY: 1, knockback: 0, source: null }); }
    const A = w.arena;
    const bx = (A.x0 + A.x1) / 2, by = A.y0 + (A.y1 - A.y0) * 0.35;
    const Cls = this.bossClasses[id];
    if (!Cls) return;
    const b = new Cls(bx, by, w.assets);
    b.maxHp = b.hp = this.run?.bossHp ?? Math.round(b.maxHp * (this.run?.hpMult ?? 1));
    w.boss = b;
    w.actors.push(b);
    w.enemies.push(b);
    w.particles.ring?.(bx, by - 8, 30, 40, ['#ffffff', '#ffe070', '#f07a1c'], 140);
    w.session.camera?.shake(8);
    w.bus.emit(EV.UI_BANNER, { title: def.name, sub: `Glutprüfung · Stufe ${this.run?.tier ?? 1}`, color: '#ff9a4a' });
    // Sofort in den Kampf (kein Anlaufen durch ein Tor)
    setTimeout(() => { if (!b.dead && !b.engaged) b.engage(w); }, 400);
  }

  #finish() {
    if (this.phase === 'done') return;
    this.phase = 'done';
    const w = this.world;
    for (const e of w.enemies) if (e.trial && !e.dead) { e.killReported = true; e.takeHit({ damage: 99999, dirX: 0, dirY: 1, knockback: 0, source: null }); }
    w.hero.buffs = (w.hero.buffs ?? []).filter((b) => b.id !== 'trial_pressure');
    this.#openExit();
  }

  #openExit() {
    const w = this.world;
    if (this.exit) return;
    const A = w.arena;
    const x = (A.x0 + A.x1) / 2, y = A.y1 - 40;
    this.exit = w.spawn(new ExitPortal(x, y, { id: 'exit_ember_trial', to: { zoneId: 'emberhollow', spawnId: 'from_trial' }, prompt: 'Portal: Glutsenke', range: 22 }, w.assets.props.rune));
    w.interactables.push(this.exit);
  }
}
