import { CONFIG } from '../config.js';
import { EV } from '../core/events.js';
import { Hero } from '../entities/Hero.js';
import { DamageWave } from '../entities/Telegraph.js';
import { HazardCloud } from '../entities/Hazards.js';
import { createCompanion } from './companion.js';
import { BotBrain } from './BotBrain.js';
import { FINDER_CONFIG } from './config.js';

// Eine Gruppe in einer Dungeon-Instanz: der eigene Held + Söldner (Hero-Instanzen mit BotBrain).
// Lebt genau so lange wie eine World (Zonenwechsel = neue Party oder Ende).
//
// Gruppenkampf ohne Umbau der Gegner-KI: Gegner und Bosse (Bereich B) lesen ihr Ziel als world.hero. Jeder
// Gegner bekommt deshalb eine eigene Sicht auf die Welt (Proxy), in der world.hero sein aktuelles Ziel in der
// Gruppe ist – gewählt nach Bedrohung (Schaden × Rolle, Tank-Fähigkeiten spotten). Alles andere liest und
// schreibt er wie bisher in der echten Welt. Gegnergeschosse treffen so das nächste Gruppenmitglied auf ihrer
// Bahn. Wo die Welt nur den eigenen Helden prüft (Druckwellen, Gefahrenwolken), prüft die Party die Söldner.
// Söldner selbst sehen die Welt mit eigener Eingabe, eigenem Zielpunkt und ohne Zugriff auf den Spielstand.
const TAUNT = new Set(['battle_shout', 'charge', 'whirlwind', 'earthshatter']);
const MUTED = new Set([EV.UI_TOAST, EV.UI_BANNER, 'character:unlock']);
const NO_STATE = Object.freeze({ slices: Object.freeze({ character: Object.freeze({}), inventory: Object.freeze({}) }), commands: new Map(), commit: () => ({ ok: false }) });

// Sicht auf ein Objekt mit überschriebenen Feldern; Methoden laufen am Original (private Felder bleiben gültig).
export function makeView(target, overrides) {
  const bound = new Map();
  return new Proxy(target, {
    get(t, k) {
      if (Object.prototype.hasOwnProperty.call(overrides, k)) return overrides[k];
      const v = t[k];
      if (typeof v !== 'function' || k === 'constructor') return v;
      let b = bound.get(k);
      if (!b || b.src !== v) { b = v.bind(t); b.src = v; bound.set(k, b); }
      return b;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

export class Party {
  constructor(session, group, hooks = {}) {
    this.session = session;
    this.world = session.world;
    this.group = group;
    this.hooks = hooks;            // { say(member, text), event(name, data) }
    this.player = this.world.hero;
    this.playerMember = group.members.find((m) => m.kind === 'player') ?? { role: 'dps' };
    this.bots = [];
    this.brains = [];
    this.threat = new Map();       // Gegner -> { table: Map(Mitglied -> Wert), target }
    this.views = new WeakMap();
    this.wrapped = new Set();
    this.t = 0;
    this.ooc = 10;                 // Sekunden außerhalb des Kampfes
    this.inCombat = false;
    this.playerDir = { x: 1, y: 0 };
    this.playerIdle = 0;
    this.playerTarget = null;
    this.speaking = new Map();     // Söldner -> Sekunden Sprechsymbol
    this.offs = [];
    this.#spawnBots();
    this.#listen();
  }

  get tank() { return this.playerMember.role === 'tank' ? this.player : this.bots.find((b) => b.member.role === 'tank') ?? null; }
  get tankBrain() { return this.brains.find((br) => br.role === 'tank') ?? null; }
  get leaderIsBot() { return this.playerMember.role !== 'tank' && !!this.tankBrain; }
  get members() { return [this.player, ...this.bots]; }
  alive() { return this.members.filter((m) => !m.dead); }

  // ------------------------------------------------------------------ Aufbau
  #spawnBots() {
    const w = this.world, h = this.player;
    const mercs = this.group.members.filter((m) => m.kind === 'merc');
    mercs.forEach((m, i) => {
      const p = w.dungeon.nearestFree(h.x + (i ? 14 : -14), h.y + 10, 6);
      const bot = createCompanion(this.session, m, p.x, p.y);
      bot.facing = h.facing;
      const brain = new BotBrain(bot, this);
      bot.brain = brain;
      this.#wrapBot(bot, brain);
      w.actors.push(bot);
      this.bots.push(bot);
      this.brains.push(brain);
      w.particles.magic?.(p.x, p.y - 8, 10, 8);
    });
  }

  #wrapBot(bot, brain) {
    const s = this.session, party = this;
    const bus = makeView(s.bus, { emit: (type, p) => { if (!MUTED.has(type)) s.bus.emit(type, p); } });
    const sessionView = makeView(s, {
      state: NO_STATE, bus,
      get camera() { return party.#camView(); },
      hitstop: () => {}, slowmo: () => {},
    });
    const view = makeView(this.world, { hero: bot, input: brain.input, get aim() { return brain.aim; }, session: sessionView, bus });
    bot.view = view;
    bot.update = function (dt) { return Hero.prototype.update.call(this, dt, view); };
  }

  // Fähigkeiten der Söldner rütteln den Bildschirm nur leicht und halten das Spiel nie an
  #camView() {
    const cam = this.session.camera;
    if (!cam) return null;
    if (this.cam?.src !== cam) this.cam = { src: cam, view: makeView(cam, { shake: (v) => cam.shake?.(v * 0.3), kick: () => {} }) };
    return this.cam.view;
  }

  // Neue Gegner/Geschosse bekommen ihre Gruppen-Sicht (auch Beschworene, die mitten im Kampf erscheinen)
  #wrapNew() {
    const w = this.world, party = this;
    for (const e of w.enemies) {
      if (this.wrapped.has(e)) continue;
      this.wrapped.add(e);
      const boss = e === w.boss || !!e.def?.boss;
      if (!e.summoned && e.hp === e.maxHp) {
        const k = boss ? FINDER_CONFIG.bossHpScale : FINDER_CONFIG.hpScale;
        e.maxHp = Math.round(e.maxHp * k); e.hp = e.maxHp;
      }
      const view = makeView(w, { get hero() { return party.targetOf(e) ?? party.player; } });
      this.views.set(e, view);
      const own = Object.prototype.hasOwnProperty.call(e, 'update') ? e.update : null;
      const orig = own ?? Object.getPrototypeOf(e).update;
      e.update = function (dt, world) { return orig.call(this, dt, world === w ? view : world); };
      e.partyRestore = () => { if (own) e.update = own; else delete e.update; };
    }
    for (const p of w.projectiles) {
      if (p.team !== 'enemy' || this.wrapped.has(p)) continue;
      this.wrapped.add(p);
      const view = makeView(w, { get hero() { return party.nearestMember(p); } });
      const orig = p.update;
      p.update = function (dt, world) { return orig.call(this, dt, world === w ? view : world); };
    }
  }

  // ------------------------------------------------------------------ Ereignisse
  #listen() {
    const bus = this.session.bus;
    const on = (ev, fn) => this.offs.push(bus.on(ev, fn));
    on('hit', (e) => this.#onHit(e));
    on('ability', (e) => {
      const a = e.actor;
      if (a !== this.tank || !TAUNT.has(e.abilityId)) return;
      for (const en of this.world.enemies) {
        if (en.dead || Math.hypot(en.x - a.x, en.y - a.y) > 90) continue;
        const s = this.#threat(en);
        let max = 0;
        for (const v of s.table.values()) max = Math.max(max, v);
        s.table.set(a, max * 1.3 + 30);
      }
    });
    on(EV.BOSS_ENGAGED, () => this.#gatherInArena());
    on(EV.BOSS_DEFEATED, () => this.hooks.event?.('bossDown'));
    on(EV.LEVEL_UP, () => this.hooks.event?.('levelUp'));
  }

  #onHit(e) {
    const src = this.memberOf(e.attacker);
    const tgt = e.target;
    if (src && tgt?.team === 'enemy') {
      const s = this.#threat(tgt);
      const mult = (src === this.tank ? 3.2 : 1) * (src.dead ? 0 : 1);
      s.table.set(src, (s.table.get(src) ?? 0) + (e.damage ?? 1) * mult);
      if (src === this.player) this.playerTarget = tgt;
      else if (src.view) src.onDealtHit(e, src.view); // Wut, Passive, Gift wie beim eigenen Helden
    }
    if (tgt?.companion && this.bots.includes(tgt) && e.killed) this.hooks.event?.('botDied', tgt);
    if (tgt === this.player && e.killed) this.hooks.event?.('playerDied');
  }

  memberOf(a) {
    if (!a) return null;
    if (a === this.player || this.bots.includes(a)) return a;
    const h = a.hero ?? a.owner;
    if (h && h !== a) return this.memberOf(h);
    return null;
  }

  #threat(e) {
    let s = this.threat.get(e);
    if (!s) this.threat.set(e, (s = { table: new Map(), target: null }));
    return s;
  }

  targetOf(e) { return this.threat.get(e)?.target ?? null; }

  nearestMember(p) {
    let best = null, bd = Infinity;
    for (const m of this.alive()) { const d = Math.hypot(m.x - p.x, m.y - p.y); if (d < bd) { bd = d; best = m; } }
    return best ?? this.player;
  }

  // ------------------------------------------------------------------ Tick (vor world.update)
  update(dt) {
    const w = this.world;
    this.t += dt;
    this.#trackPlayer(dt);
    this.#wrapNew();
    this.#updateCombat(dt);
    this.#updateTargets();
    for (const br of this.brains) br.update(dt, w, this.t);
    this.#botHazards(dt);
    this.#lifeAndDeath(dt);
    for (const [b, t] of this.speaking) { if (t - dt <= 0) this.speaking.delete(b); else this.speaking.set(b, t - dt); }
  }

  #trackPlayer(dt) {
    const h = this.player;
    const sp = Math.hypot(h.vx ?? 0, h.vy ?? 0);
    if (sp > 12 && !h.dead) { this.playerDir = { x: h.vx / sp, y: h.vy / sp }; this.playerIdle = 0; }
    else this.playerIdle += dt;
    if (this.playerTarget?.dead) this.playerTarget = null;
  }

  // Aktive Gegner der Gruppe: angegriffen/aufmerksam, sichtbar, in der Nähe eines Gruppenmitglieds
  foes() {
    if (this.foeCache?.t === this.t) return this.foeCache.list;
    const w = this.world, alive = this.alive();
    const list = [];
    for (const e of w.enemies) {
      if (e.dead || e.removed || e.isHidden || (e.rise ?? 1) < 1 || e.state === 'return' || e.state === 'spawn') continue;
      const boss = e === w.boss;
      if (boss ? !e.engaged : !e.aggroed) continue;
      if (!alive.some((m) => Math.hypot(m.x - e.x, m.y - e.y) < 330)) continue;
      list.push(e);
    }
    this.foeCache = { t: this.t, list };
    return list;
  }

  #updateCombat(dt) {
    this.inCombat = this.foes().length > 0;
    this.ooc = this.inCombat ? 0 : this.ooc + dt;
    if (this.inCombat && !this.wasInCombat) this.hooks.event?.('combat');
    this.wasInCombat = this.inCombat;
  }

  // Ziel je Gegner: ruhend -> nächstes Mitglied (wer zuerst kommt, wird bemerkt);
  // im Kampf -> höchste Bedrohung (mit Trägheit), tote/ferne Mitglieder zählen nicht.
  #updateTargets() {
    const w = this.world, alive = this.alive();
    for (const e of w.enemies) {
      if (e.dead) continue;
      const s = this.#threat(e);
      if (!alive.length) { s.target = this.player; continue; }
      const boss = e === w.boss;
      const engaged = boss ? e.engaged : e.aggroed && e.state !== 'return';
      if (boss && !e.engaged) { s.target = this.player; continue; }
      if (!engaged) { s.target = nearest(alive, e); continue; }
      let best = null, bv = 0;
      for (const m of alive) {
        const v = s.table.get(m) ?? 0;
        if (v > bv && Math.hypot(m.x - e.x, m.y - e.y) < 340) { bv = v; best = m; }
      }
      const cur = s.target && !s.target.dead ? s.target : null;
      if (!best) s.target = cur ?? nearest(alive, e);
      else if (cur && cur !== best && (s.table.get(cur) ?? 0) * 1.15 >= bv) s.target = cur;
      else s.target = best;
    }
  }

  // Druckwellen und Gefahrenwolken prüfen in der Welt nur den eigenen Helden – für Söldner hier dasselbe.
  #botHazards(dt) {
    const w = this.world;
    for (const b of this.bots) {
      if (b.dead) continue;
      for (const e of w.effects) {
        if (!(e instanceof DamageWave) || e.removed) continue;
        e.botHits ??= new Set();
        if (e.botHits.has(b)) continue;
        const dx = b.x - e.x, dy = (b.y - e.y) / 0.6, d = Math.hypot(dx, dy);
        if (Math.abs(d - e.r) >= 7) continue;
        const l = d || 1;
        const hit = { damage: e.damage, dirX: dx / l, dirY: dy / l, knockback: 160, source: e.owner };
        if (b.takeHit(hit)) { e.botHits.add(b); this.#emitHit(e.owner, b, hit, true); }
        else if (b.dodgedTimer > 0) e.botHits.add(b);
      }
      for (const c of w.entities) {
        if (!(c instanceof HazardCloud) || c.removed) continue;
        c.botCool ??= new Map();
        const cool = (c.botCool.get(b) ?? 0.3) - dt;
        c.botCool.set(b, cool);
        const grow = Math.min(1, c.t * 3);
        if (cool > 0 || Math.hypot((b.x - c.x) / c.radius, (b.y - c.y) / (c.radius * 0.6)) > grow) continue;
        c.botCool.set(b, c.tick);
        const hit = { damage: Math.round(c.damage * (0.9 + Math.random() * 0.2)), dirX: 0, dirY: -1, knockback: 0, source: c.owner, dot: true };
        if (c.element === 'frost') b.buff?.('frost_slow', 1.5, { moveSpeed: 0.7 });
        if (b.takeHit(hit)) this.#emitHit(c.owner, b, hit, false, true);
      }
    }
  }

  #emitHit(attacker, target, hit, heavy, dot = false) {
    this.session.bus.emit('hit', { attacker, target, damage: hit.damage, crit: false, heavy, dot, dirX: hit.dirX, dirY: hit.dirY, x: target.x, y: target.centerY, killed: target.dead });
  }

  // Tod und Wiederaufstehen: Wer fällt, steht nach dem Kampf wieder auf. Solange ein Söldner noch kämpft,
  // wartet der eigene Held auf das Kampfende statt am Eingang neu zu erscheinen. Fallen alle, gilt die normale
  // Wiederbelebung (am Friedhof außerhalb), und die Gruppe löst sich auf.
  #lifeAndDeath(dt) {
    const s = this.session, h = this.player;
    const botsAlive = this.bots.some((b) => !b.dead);
    const after = FINDER_CONFIG.reviveAfter;
    if (h.dead && botsAlive) {
      s.deadTime = Math.min(s.deadTime ?? 0, 1);
      h.partyDown = (h.partyDown ?? 0) + dt;
      if (this.ooc > after && h.partyDown > after) {
        h.partyDown = 0;
        h.revive(FINDER_CONFIG.reviveHp);
        s.deadTime = 0;
        this.world.bus.emit('aura', { actor: h, element: 'holy' });
        this.world.bus.emit(EV.PLAYER_RESPAWNED, { zoneId: this.world.zone.id, spawnId: null, inPlace: true });
        this.hooks.event?.('playerRevived');
      }
    }
    if (!h.dead) h.partyDown = 0;
    this.wiped = h.dead && !botsAlive;
    for (const b of this.bots) {
      if (b.dead) {
        b.partyDown = (b.partyDown ?? 0) + dt;
        if (!this.wiped && !h.dead && this.ooc > after && b.partyDown > after && b.animator.finished) {
          b.partyDown = 0;
          b.revive(FINDER_CONFIG.reviveHp);
          this.world.bus.emit('aura', { actor: b, element: 'holy' });
          this.hooks.event?.('botRevived', b);
        }
        continue;
      }
      // Durchatmen nach dem Kampf (Söldner essen und trinken wie Spieler)
      if (this.ooc > 2.5) {
        b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.08 * dt);
        if (b.resourceType === 'mana') b.resource = Math.min(b.maxResource, b.resource + b.maxResource * 0.1 * dt);
      }
    }
  }

  // Boss-Tor schließt sich hinter dem Spieler: Söldner kurz davor kommen mit hinein
  #gatherInArena() {
    const a = this.world.arena, h = this.player;
    if (!a) return;
    for (const b of this.bots) {
      if (b.dead) continue;
      const inside = b.x > a.x0 && b.x < a.x1 && b.y > a.y0 + 4 && b.y < a.y1;
      if (inside || Math.hypot(b.x - h.x, b.y - h.y) > 260) continue;
      const p = this.world.dungeon.nearestFree(h.x + (Math.random() - 0.5) * 24, h.y + 10, 6);
      b.x = p.x; b.y = p.y; b.vx = b.vy = 0;
    }
    this.hooks.event?.('bossPull');
  }

  // ------------------------------------------------------------------ Hilfen für BotBrain
  centroid(except) {
    const ms = this.alive().filter((m) => m !== except);
    if (!ms.length) return { x: this.player.x, y: this.player.y };
    let x = 0, y = 0;
    for (const m of ms) { x += m.x; y += m.y; }
    return { x: x / ms.length, y: y / ms.length };
  }

  slotFor(brain) {
    if (brain.role === 'tank' && this.leaderIsBot) return { ahead: 30, side: 0 };
    const i = this.brains.filter((b) => b.role !== 'tank').indexOf(brain);
    return { ahead: -20, side: i === 0 ? 16 : -16 };
  }

  // Weg zum Spieler um Wände herum (Flussfeld der Welt zeigt immer zum eigenen Helden)
  pathDir(bot) { return this.world.flow.direction(bot.x, bot.y - 2); }

  // Ruhende Gegner nahe beim Spieler, die der Tank anlocken kann
  pullable(bot, hero) {
    if (hero.dead || this.ooc < 2.5 || hero.hp / hero.maxHp < 0.55) return null;
    if (Math.hypot(bot.x - hero.x, bot.y - hero.y) > 100) return null;
    const w = this.world;
    let best = null, bd = Infinity;
    for (const e of w.enemies) {
      if (e.dead || e === w.boss || e.isHidden || (e.rise ?? 1) < 1 || e.aggroed || e.state !== 'idle') continue;
      const dh = Math.hypot(e.x - hero.x, e.y - hero.y);
      const db = Math.hypot(e.x - bot.x, e.y - bot.y);
      if (dh > 150 || db > 170 || !w.dungeon.lineOfSight(bot.x, bot.y - 6, e.x, e.y - 6)) continue;
      if (db < bd) { bd = db; best = e; }
    }
    return best;
  }

  // Festgefahrener Söldner: weit weg und außer Sicht -> zum Spieler aufschließen
  unstick(bot) {
    const h = this.player, cam = this.session.camera;
    const far = Math.hypot(bot.x - h.x, bot.y - h.y) > 160;
    const onScreen = cam && bot.x > cam.x - 10 && bot.x < cam.x + CONFIG.viewWidth + 10 && bot.y > cam.y - 10 && bot.y < cam.y + CONFIG.viewHeight + 30;
    const p = this.world.dungeon.nearestFree(h.x - this.playerDir.x * 20 + (Math.random() - 0.5) * 16, h.y - this.playerDir.y * 16 + 6, 6);
    if (far && !onScreen) { bot.x = p.x; bot.y = p.y; bot.vx = bot.vy = 0; }
  }

  say(bot, text) {
    if (!text) return;
    this.speaking.set(bot, 3.5);
    this.hooks.say?.(bot.member, text);
  }

  // ------------------------------------------------------------------ Zeichnen (Namensschilder)
  draw(ctx) {
    const cam = this.session.camera, font = this.session.font;
    if (!cam || !font) return;
    const cx = cam.rx, cy = cam.ry;
    for (const b of this.bots) {
      const x = Math.round(b.x - cx), y = Math.round(b.y - cy - 34);
      if (x < -60 || y < -10 || x > CONFIG.viewWidth + 60 || y > CONFIG.viewHeight + 40) continue;
      const lvl = String(b.level), name = b.name;
      const tag = FINDER_CONFIG.labelMercs;
      const wl = font.measure(lvl), wn = font.measure(name, 1, true), total = wl + 3 + wn + (tag ? 7 : 0);
      let x0 = Math.round(x - total / 2);
      ctx.globalAlpha = b.dead ? 0.45 : 0.95;
      if (tag) { drawBadge(ctx, x0, y); x0 += 7; }
      font.draw(ctx, lvl, x0, y, { color: '#f2c14e', outline: true });
      font.draw(ctx, name, x0 + wl + 3, y, { color: b.dead ? '#a8a0a0' : '#8fe08a', outline: true, raw: true });
      if (this.speaking.has(b)) drawSpeech(ctx, x0 + wl + 3 + wn + 3, y - 1, this.t);
      // kleine Lebensleiste unter dem Namen, sobald angeschlagen
      if (!b.dead && b.hp < b.maxHp) {
        const w = 18, f = Math.max(0, b.hp / b.maxHp);
        ctx.fillStyle = '#0b0710'; ctx.fillRect(x - w / 2 - 1, y + 7, w + 2, 3);
        ctx.fillStyle = f > 0.35 ? '#5ad07a' : '#e05a4a'; ctx.fillRect(x - w / 2, y + 8, Math.round(w * f), 1);
      }
      ctx.globalAlpha = 1;
    }
  }

  dispose() {
    for (const off of this.offs) off();
    this.offs = [];
    const w = this.world;
    for (const e of w.enemies) e.partyRestore?.();
    for (const b of this.bots) b.removed = true;
    w.actors = w.actors.filter((a) => !this.bots.includes(a));
  }
}

function nearest(list, p) {
  let best = null, bd = Infinity;
  for (const m of list) { const d = Math.hypot(m.x - p.x, m.y - p.y); if (d < bd) { bd = d; best = m; } }
  return best;
}

// Söldner-Abzeichen: kleines Schild mit Münze (5×6 Pixel), dezent in Messing
function drawBadge(ctx, x, y) {
  ctx.fillStyle = '#0b0710';
  ctx.fillRect(x - 1, y - 1, 7, 7);
  ctx.fillStyle = '#8a6a30';
  ctx.fillRect(x, y, 5, 4); ctx.fillRect(x + 1, y + 4, 3, 1); ctx.fillRect(x + 2, y + 5, 1, 1);
  ctx.fillStyle = '#e8c25a';
  ctx.fillRect(x + 2, y + 1, 1, 2);
}

// Sprechsymbol: drei Punkte, die nacheinander aufleuchten
function drawSpeech(ctx, x, y, t) {
  ctx.fillStyle = '#0b0710';
  ctx.fillRect(x - 1, y + 1, 9, 5);
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = Math.floor(t * 4) % 3 === i ? '#ffffff' : '#9a90a8';
    ctx.fillRect(x + i * 3, y + 2, 2, 2);
  }
}
