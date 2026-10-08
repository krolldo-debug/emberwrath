import { CONFIG } from '../config.js';
import { Dungeon } from './Dungeon.js';
import { Outdoor } from './Outdoor.js';
import { LEVELS } from './levels.js';
import { LEVELS2 } from './levels2.js';
import { LEVELS3 } from './levels3.js';
import { TrialDirector } from './TrialDirector.js';
import { AmbientLife } from './Ambient.js';
import { ENEMY_TYPES } from '../entities/enemyTypes.js';
import { Spawner } from './Spawner.js';
import { placeObjects } from './placeObjects.js';
import { Decals } from '../gfx/Decals.js';
import { ParticleSystem } from '../gfx/Particles.js';
import { LightingSystem, Light } from '../gfx/Lighting.js';
import { CombatSystem } from '../systems/Combat.js';
import { separateActors } from '../systems/Physics.js';
import { createHero } from '../character/createHero.js';
import { EV } from '../core/events.js';
import { Enemy } from '../entities/Enemy.js';
import { Boss } from '../entities/Boss.js';
import { Nerith } from '../entities/Nerith.js';
import { Ignaroth } from '../entities/Ignaroth.js';
import { Ulgrim } from '../entities/Ulgrim.js';
import { Skalvyr } from '../entities/Skalvyr.js';
import { RotMother } from '../entities/RotMother.js';
import { Malgareth } from '../entities/Malgareth.js';

// Bossklasse je Gegnertyp (Marker im Level)
const BOSS_CLASSES = { bonelord: Boss, drowned_priestess: Nerith, ember_tyrant: Ignaroth, barrow_king: Ulgrim, rot_mother: RotMother, frost_wyrm: Skalvyr, ash_sovereign: Malgareth };
import { Chest, ExitPortal } from '../entities/Interactive.js';
import { FlowField } from './FlowField.js';
import { QuestGuide } from './QuestGuide.js';
import { updateBossFury } from './bossFury.js';
import { rand, pick } from '../core/math.js';

const T = CONFIG.tileSize;

// Die Spielwelt EINER Zone(-Instanz): besitzt Karte, Entities, Licht, Partikel,
// Dekale, Gegnergruppen, NPCs und Interaktionen und legt Update- und
// Render-Reihenfolge fest.
// Vertrag (docs/INTEGRATION.md): new World(session, zoneDef, { spawnId, pos })
//   hero, actors, enemies, props, effects, projectiles, entities, lights, particles, decals,
//   lighting, combat, dungeon, time, aim, zone, session, pixelW, pixelH
//   spawn(entity), spawnEnemy(type, x, y, opts), addEffect, addLight, addProjectile,
//   update(dt), render(ctx, cx, cy, debug), dispose()
// Zusätzlich: npcs, interactables, boss (Actor mit hp/maxHp/phase oder null), gate,
//   spawner, prompt (aktuelles Interaktionsziel), state, bus, input.
export class World {
  constructor(session, zone, { spawnId = 'start', pos = null } = {}) {
    this.session = session;
    this.zone = zone;
    this.assets = session.assets;
    this.bus = session.bus;
    this.input = session.input;
    this.state = session.state;
    this.time = 0;
    this.aim = null;
    this.view = { x: 0, y: 0 };
    this.entities = []; // sonstige Objekte mit update/render (Beute, NPCs, Tore, Warnflächen …)
    this.interactables = [];
    this.npcs = [];
    this.boss = null;
    this.prompt = null;

    const level = LEVELS[zone.level] ?? LEVELS2[zone.level] ?? LEVELS3[zone.level];
    if (!level) throw new Error(`Level ${zone.level} unbekannt`);
    this.dungeon = level.kind === 'outdoor' ? new Outdoor(level) : new Dungeon(level);
    this.decals = new Decals(this.dungeon.pixelW, this.dungeon.pixelH);
    this.particles = new ParticleSystem(this.decals);
    this.lighting = new LightingSystem(CONFIG.viewWidth, CONFIG.viewHeight, zone.ambient ?? CONFIG.lighting.ambient);
    this.combat = new CombatSystem(this.bus);

    this.lights = [];
    this.actors = [];
    this.enemies = [];
    this.props = [];
    this.effects = [];
    this.projectiles = [];

    this.background = this.#renderBackground();
    placeObjects(this);
    this.#scatterDetail();
    this.flow = new FlowField(this.dungeon);
    this.flow.rebuildBlocked();
    this.guidePath = [];
    this.guide = new QuestGuide(this);
    this.trial = zone.trial ? new TrialDirector(this, BOSS_CLASSES) : null;

    // Startpunkt: gespeicherte Position (nur wenn frei) > benannter Spawn > Start
    let s = this.dungeon.spawns[spawnId] ?? this.dungeon.spawns.start ?? this.dungeon.heroStart;
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) s = this.dungeon.nearestFree(pos.x, pos.y);
    this.hero = createHero(session, s.x, s.y);
    this.actors.push(this.hero);
    this.life = new AmbientLife(this);

    // Gegner: platzierte Gruppen, Boss separat
    this.spawner = new Spawner(this, this.dungeon.enemyMarks, {
      respawn: level.respawn ?? Infinity,
      maxAttackers: level.kind === 'outdoor' ? 2 : 3,
    });
    this.#spawnRares(spawnId);
    const bossMark = this.dungeon.enemyMarks.find((m) => m.boss);
    if (bossMark) {
      // Bosse ohne eigene Klasse (noch in Arbeit) laufen mit Varkhuls Logik und ihren eigenen Werten
      const Cls = BOSS_CLASSES[bossMark.type];
      this.boss = Cls ? new Cls(bossMark.x, bossMark.y, this.assets) : new Boss(bossMark.x, bossMark.y, this.assets, bossMark.type);
      this.actors.push(this.boss);
      this.enemies.push(this.boss);
      const a = level.arena;
      this.arena = a ? { x0: a.x * T, y0: a.y * T + T, x1: (a.x + a.w) * T, y1: (a.y + a.h) * T } : null;
    }

    const L = CONFIG.lighting;
    this.addLight(new Light({ follow: this.hero, offsetY: -10, radius: L.heroLightRadius, color: L.heroLightColor, intensity: level.kind === 'outdoor' ? 0.6 : 0.85, flicker: 0.05, bloom: 0 }));
  }

  // Verstreute Knochen & Blutflecken im Dungeon, Laub und Steinchen draußen
  #scatterDetail() {
    const d = this.dungeon;
    const n = d.biome === 'dungeon' ? 90 : 0;
    for (let i = 0; i < n; i++) {
      const tx = Math.floor(rand(2, d.w - 2)), ty = Math.floor(rand(2, d.h - 2));
      if (d.isWall(tx, ty)) continue;
      const x = tx * T + rand(2, 14), y = ty * T + rand(2, 14);
      if (Math.random() < 0.3) this.decals.splat(x, y, ['#1e0a0e', '#2a0e12', '#35141a'], rand(3, 6));
      else for (let k = 0; k < 3; k++) this.decals.pixel(x + rand(-4, 4), y + rand(-2, 2), pick(['#6e6450', '#a89a7c', '#3b3328']));
    }
  }

  // Seltene Weltgegner (C: game.progression.rareSpawns). Ort je Hinweis:
  // 'deep' = Markierung des Typs am weitesten vom Eingang, 'path' = mittlere,
  // 'boss' = nächste zum Boss. Stehen etwas neben der Markierung, um nicht mit
  // der normalen Gruppe zu verschmelzen.
  #spawnRares(spawnId) {
    const list = this.session.game?.progression?.rareSpawns?.(this.zone.id) ?? [];
    if (!list.length) return;
    const d = this.dungeon;
    const entry = d.spawns[spawnId] ?? d.spawns.start ?? d.heroStart;
    const boss = d.enemyMarks.find((m) => m.boss);
    for (const r of list) {
      if (!ENEMY_TYPES[r.type]) continue;
      // nie direkt an einem Ankunftspunkt (sonst Aggro beim Betreten der Zone)
      const pts = Object.values(d.spawns);
      const calm = (m) => !m.boss && pts.every((p) => Math.hypot(m.x - p.x, m.y - p.y) > 12 * 16);
      let marks = d.enemyMarks.filter((m) => m.type === r.type && calm(m));
      if (!marks.length) marks = d.enemyMarks.filter(calm);
      if (!marks.length) continue;
      const dist = (m, p) => Math.hypot(m.x - p.x, m.y - p.y);
      let m;
      if (r.spawn === 'boss' && boss) m = marks.reduce((a, b) => (dist(b, boss) < dist(a, boss) ? b : a));
      else {
        const sorted = [...marks].sort((a, b) => dist(a, entry) - dist(b, entry));
        m = r.spawn === 'path' ? sorted[Math.floor(sorted.length / 2)] : sorted[sorted.length - 1];
      }
      const p = d.nearestFree(m.x + 22, m.y + 10, 8);
      const e = this.spawnEnemy(r.type, p.x, p.y, { home: { x: p.x, y: p.y } });
      e.makeRare(r);
    }
  }

  #renderBackground() {
    const level = this.dungeon.level;
    return level.kind === 'outdoor'
      ? this.dungeon.renderBackground(this.assets)
      : this.dungeon.renderBackground(this.assets.props, this.assets.sprites.crypt, level.biome ? this.assets.sprites['biome_' + level.biome] : null);
  }

  // Verborgener Durchgang (level.secrets[{ id, char='$', lever }]): Mauerfelder werden Boden.
  openSecret(id) {
    const sc = this.dungeon.level.secrets?.find((x) => x.id === id);
    this.openedSecrets ??= new Set();
    if (!sc || this.openedSecrets.has(id)) return;
    this.openedSecrets.add(id);
    const d = this.dungeon, ch = sc.char ?? '$';
    const cells = [];
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) if (d.rows[y][x] === ch) { d.solid[y * d.w + x] = 0; d.terrain[y][x] = '.'; cells.push([x, y]); }
    this.background = this.#renderBackground();
    this.flow.rebuildBlocked();
    for (const [x, y] of cells) this.particles.dust(x * T + T / 2, y * T + T / 2, 6, '#5a5068');
    this.session.camera?.shake(5);
    this.bus.emit('secretOpen', { id, x: cells[0]?.[0] * T, y: cells[0]?.[1] * T });
    this.bus.emit(EV.UI_TOAST, { text: 'Ein verborgener Durchgang öffnet sich.', kind: 'info' });
  }

  get pixelW() { return this.dungeon.pixelW; }
  get pixelH() { return this.dungeon.pixelH; }

  spawn(entity) { this.entities.push(entity); return entity; }
  addLight(l) { this.lights.push(l); return l; }
  addEffect(e) { this.effects.push(e); return e; }
  addProjectile(p) { this.projectiles.push(p); return p; }

  // opts: { hpScale, home, group, dormant, ambush, respawned } (Zahl = hpScale, Altform)
  spawnEnemy(type, x, y, opts = {}) {
    const e = new Enemy(type, x, y, this.assets, opts);
    this.actors.push(e);
    this.enemies.push(e);
    return e;
  }

  runeSurge() {
    if (!this.rune) return;
    this.rune.surge = 0.8;
    if (this.runeLight) this.runeLight.intensity = 1.2;
    this.particles.ring(this.rune.x, this.rune.y, 20, 30, ['#ffffff', '#e0b8ff', '#a060f0'], 40);
  }

  update(dt) {
    this.time += dt;
    this.flow.update(this.hero.x, this.hero.y - 2);
    for (const a of this.actors) a.update(dt, this);
    for (const p of this.projectiles) p.update(dt, this);
    for (const p of this.props) p.update(dt, this);
    for (const e of this.effects) e.update(dt, this);
    for (const e of this.entities) e.update(dt, this);
    this.combat.update(dt, this);
    this.#reportKills();
    this.spawner.update(dt);
    this.#updateBossArena();
    updateBossFury(this, dt);
    separateActors(this.actors, this.dungeon);
    this.particles.update(dt);
    for (const l of this.lights) l.update(dt, this.time);
    if (this.runeLight) this.runeLight.intensity += (0.45 - this.runeLight.intensity) * Math.min(1, dt * 1.5);
    this.lighting.ambientBoost = Math.max(0, this.lighting.ambientBoost - dt * 2.5);
    this.#ambientParticles(dt);
    this.#updateInteraction();
    this.guide.update(dt);
    this.trial?.update(dt);
    this.life.update(dt);

    this.actors = this.actors.filter((a) => !a.removed);
    this.enemies = this.enemies.filter((a) => !a.removed);
    this.projectiles = this.projectiles.filter((p) => !p.removed);
    this.effects = this.effects.filter((e) => !e.removed);
    this.entities = this.entities.filter((e) => !e.removed);
    this.lights = this.lights.filter((l) => !l.dead);
  }

  // Nächstes Interaktionsziel in Reichweite -> Hinweis (EV.UI_PROMPT) und Aktion 'interact'.
  #updateInteraction() {
    const h = this.hero;
    let best = null, bestD = Infinity;
    if (!h.dead) {
      for (const it of this.interactables) {
        if (it.removed || !it.canInteract(this)) continue;
        const d = Math.hypot(it.x - h.x, (it.y - h.y) * 1.3);
        if (d <= it.interactRange && d < bestD) { best = it; bestD = d; }
      }
    }
    if (best !== this.prompt) {
      this.prompt = best;
      if (best) {
        const a = best.promptAnchor();
        this.bus.emit(EV.UI_PROMPT, { text: best.prompt(this), x: a.x, y: a.y, action: 'interact' });
      } else this.bus.emit(EV.UI_PROMPT, null);
    }
    if (best && this.input.pressed('interact')) {
      best.interact(this);
      // Hinweis neu bewerten (Truhe offen, Zonenwechsel …)
      this.prompt = null;
      this.bus.emit(EV.UI_PROMPT, null);
    }
  }

  #updateBossArena() {
    const b = this.boss, a = this.arena, h = this.hero;
    if (!b || !a) return;
    if (!b.engaged && !b.dead && !h.dead && h.x > a.x0 && h.x < a.x1 && h.y > a.y0 + 8 && h.y < a.y1) {
      b.engage(this);
      this.gate?.setClosed(true, this);
    }
    if (b.dead && !this.bossHandled) {
      this.bossHandled = true;
      this.gate?.setClosed(false, this);
      this.state.commit('world:bossDefeated', { bossId: b.bossId, x: b.x, y: b.y });
      // Ausgang und Belohnungstruhe erscheinen
      const rune = this.rune ?? { x: (a.x0 + a.x1) / 2, y: (a.y0 + a.y1) / 2 };
      const outZone = this.zone.respawnZone ?? 'emberhollow';
      const outName = this.session.content.find('zone', outZone)?.name ?? outZone;
      const exit = this.spawn(new ExitPortal(rune.x, rune.y, { id: `exit_${this.zone.id}`, to: { zoneId: outZone, spawnId: `from_${this.zone.id}` }, prompt: `Portal: ${outName}`, range: 22 }, this.assets.props.rune));
      this.interactables.push(exit);
      const cx = b.home.x, cy = b.home.y - 18;
      const chest = this.spawn(new Chest(cx, cy, { id: `boss_${b.bossId}`, sprites: Chest.sprites(this.assets), persistent: false }));
      this.interactables.push(chest);
      this.particles.magic(cx, cy, 20, 12);
      this.runeSurge();
    }
  }

  // Jeder Gegner wird genau einmal als besiegt gemeldet (Quests, XP, Beute hören darauf).
  #reportKills() {
    for (const e of this.enemies) {
      if (!e.dead || e.killReported) continue;
      e.killReported = true;
      const def = e.def ?? {};
      this.bus.emit(EV.ENEMY_KILLED, {
        enemyId: e.id, type: e.type, level: e.level ?? def.level ?? 1, x: e.x, y: e.y,
        zoneId: this.zone.id, isBoss: !!def.boss, bossId: def.bossId, xp: e.xpOverride ?? def.xp ?? 10,
        elite: !!def.elite || !!e.rareId, summoned: !!e.summoned, rareId: e.rareId,
        champion: e.champion ? { affixes: [...e.champion.affixes], level: e.level } : undefined,
      });
    }
  }

  dispose() {
    this.guide.dispose();
    this.trial?.dispose();
    this.bus.emit(EV.UI_PROMPT, null);
  }

  #ambientParticles(dt) {
    const W = CONFIG.viewWidth, H = CONFIG.viewHeight, v = this.view;
    if (this.dungeon.biome === 'outdoor') {
      // Aufsteigende Glut aus den Spalten, Asche in der Luft, Glühwürmchen
      const cells = this.dungeon.fissureCells;
      if (cells.length && Math.random() < dt * 12) {
        const c = cells[Math.floor(Math.random() * cells.length)];
        if (c.x > v.x - 20 && c.x < v.x + W + 20 && c.y > v.y - 20 && c.y < v.y + H + 40) this.particles.embers(c.x + rand(-6, 6), c.y + rand(-4, 4), 1);
      }
      if (Math.random() < dt * 8) {
        this.particles.spawn({ x: v.x + rand(0, W), y: v.y + rand(0, H), vx: rand(4, 10), vy: rand(-1, 2), rise: rand(-3, 2), wobble: 8, life: rand(3, 6), colors: ['#6a6070', '#8a8090'], alpha: 0.3 });
      }
      if (Math.random() < dt * 3) {
        this.particles.spawn({ x: v.x + rand(0, W), y: v.y + rand(0, H), vx: rand(-5, 5), vy: rand(-3, 3), rise: rand(0, 4), wobble: 14, life: rand(2, 4), colors: ['#c8f0a0', '#90d070'], alpha: 0.7, emissive: true });
      }
      return;
    }
    if (Math.random() < dt * 14) {
      this.particles.spawn({
        x: v.x + rand(0, W), y: v.y + rand(0, H),
        vx: rand(-4, 4), vy: rand(-2, 2), rise: rand(1, 4), wobble: 6,
        life: rand(3, 6), colors: ['#8a7aa0'], alpha: 0.35, emissive: true,
      });
    }
  }

  render(ctx, cx, cy, debug = false) {
    const W = CONFIG.viewWidth, H = CONFIG.viewHeight;
    this.view.x = cx; this.view.y = cy;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    // Außenkarten (Outdoor.chunked) zeichnen ihren Boden kachelweise in renderLiquid; background ist dort nur das Übersichtsbild
    if (!this.dungeon.chunked) ctx.drawImage(this.background, cx, cy, W, H, 0, 0, W, H);
    this.dungeon.renderLiquid?.(ctx, cx, cy, this.time);
    // Dekal-Ebene kachelweise (gfx/Decals.js render); Altform: eine weltgroße Leinwand
    if (this.decals.render) this.decals.render(ctx, cx, cy, W, H); else ctx.drawImage(this.decals.canvas, cx, cy, W, H, 0, 0, W, H);
    this.particles.drawShadows(ctx, cx, cy);
    this.guide.render(ctx, cx, cy);

    // Y-sortierte Szene (Tiefenwirkung in der 3/4-Perspektive); statische Deko nur, wenn sichtbar
    const vis = (o) => o.x > cx - 80 && o.x < cx + W + 80 && o.y > cy - 20 && o.y < cy + H + 110;
    const drawables = [...this.props.filter(vis), ...this.entities, ...this.actors, ...this.projectiles];
    drawables.sort((a, b) => a.sortY - b.sortY);
    for (const d of drawables) d.render(ctx, cx, cy);
    this.particles.drawLit(ctx, cx, cy);

    this.lighting.apply(ctx, cx, cy, this.lights);

    // Emissive-Pass: alles, was selbst leuchtet
    this.dungeon.renderEmissive?.(ctx, cx, cy, this.time);
    this.guide.renderEmissive(ctx, cx, cy);
    for (const e of this.effects) if (e === this.rune) e.renderEmissive(ctx, cx, cy);
    for (const d of drawables) if (d.renderEmissive) d.renderEmissive(ctx, cx, cy);
    this.particles.drawEmissive(ctx, cx, cy);
    for (const e of this.effects) if (e !== this.rune) e.renderEmissive(ctx, cx, cy);
    this.lighting.bloom(ctx, cx, cy, this.lights);

    if (debug) {
      this.combat.debugDraw(ctx, cx, cy);
      ctx.strokeStyle = 'rgba(80,255,120,0.7)';
      for (const a of this.actors) { ctx.beginPath(); ctx.arc(a.x - cx, a.centerY - cy, a.hurtRadius, 0, Math.PI * 2); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(80,160,255,0.6)';
      for (const b of this.dungeon.boxes) if (!b.off) ctx.strokeRect(b.x0 - cx, b.y0 - cy, b.x1 - b.x0, b.y1 - b.y0);
    }
  }
}
