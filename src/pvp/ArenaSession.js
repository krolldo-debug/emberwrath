import { EV } from '../core/events.js';
import { CONFIG } from '../config.js';
import { ARENA_ZONE, TIMING, stormMult } from './rules.js';
import { arenaStats } from './arenaStats.js';
import { armHero, holdHero } from './arenaHero.js';
import { createBotRival } from './BotRival.js';
import { NetRival, DuelLink, rivalAnims } from './NetDuel.js';
import { ArenaHud } from './ArenaHud.js';
import { FINDER_CONFIG } from '../finder/config.js';

// Sitzungssystem 'pvp': die Glutarena in der laufenden Spielsitzung (src/pvp/README.md).
// Betritt der Held die Arena mit einem laufenden Kampf (game.pvp.match), richtet es den Kampf ein:
//   eigener Held mit Arena-Werten, Gegner (Herausforderer: BotRival, echter Spieler: NetRival + DuelLink),
//   Gong, Kampfzeit, Glutsturm, Ergebnis und Rückkehr an die Stelle, an der man gesucht hat.
// Ohne Kampf in der Arena (z. B. nach Neuladen) geht es sofort zurück.
// Läuft vor dem Fortschritt (Reihenfolge 5): In der Arena wirken keine Heiltränke.
export class ArenaSession {
  constructor(session, pvp) {
    this.s = session;
    this.pvp = pvp;
    this.game = session.game;
    this.world = null;
    this.duel = null;
    this.hud = null;
    this.offs = [
      session.bus.on('hit', (e) => this.#onHit(e)),
      this.game.bus.on('pvp:end', (e) => this.#onEnd(e)),
    ];
  }

  get active() { return !!this.duel; }

  update(dt) {
    this.hud ??= new ArenaHud(this.s, this.pvp, this);
    const w = this.s.world;
    if (w !== this.world) this.#onWorld(w);
    const d = this.duel;
    if (d) {
      // Tränke wirken in der Arena nicht (Taste H; der Knopf läuft über progression.usePotion, siehe index.js)
      if (this.s.input.pressed('potion')) { this.s.input.pressedQueue?.delete('potion'); this.#potionNote(); }
      this.#tick(dt, d);
    }
    this.hud.update(dt);
  }

  draw(ctx) { if (this.duel) this.#nameplate(ctx, this.duel); }

  dispose() {
    for (const off of this.offs) off();
    this.#end();
    this.hud?.dispose();
  }

  // ------------------------------------------------------------------ Aufbau
  #onWorld(w) {
    this.#end();
    this.world = w;
    if (w?.zone?.id !== ARENA_ZONE) return;
    const m = this.pvp.match;
    if (!m || m.result) { this.pvp.returnHome(); return; }
    const hero = w.hero;
    const sp = w.dungeon.spawns;
    const mine = m.side === 'b' ? sp.east : sp.start, theirs = m.side === 'b' ? sp.start : sp.east;
    const d = { match: m, kind: m.kind, hero, rival: null, link: null, go: null, t: 0, over: false, local: null, leaveAt: null };
    this.duel = d;
    const fightMs = () => (d.go != null ? Math.max(0, performance.now() - d.go) : 0);
    d.fightMs = fightMs;
    armHero(hero, { stormAt: m.kind === 'bot' ? fightMs : null, healLocal: m.kind === 'bot', onDown: () => this.#down(d, hero) });
    holdHero(hero, true);
    hero.facing = theirs.x < hero.x ? -1 : 1;
    if (m.kind === 'bot') {
      const bot = createBotRival(this.s, m.foe, theirs.x, theirs.y, hero);
      armHero(bot, { stormAt: fightMs, healLocal: true, onDown: () => this.#down(d, bot) });
      holdHero(bot, true);
      d.rival = bot;
    } else {
      const st = arenaStats(m.foe?.classId, m.foe?.raceId);
      const rival = new NetRival(m.foe ?? {}, theirs.x, theirs.y, { max: st.maxHp, onHit: (h) => this.#sendHit(d, h) });
      rival.facing = hero.x < theirs.x ? -1 : 1;
      rival.setAnims(rivalAnims(this.game, rival.look));
      rival.alpha = 1;
      w.actors.push(rival);
      w.enemies.push(rival);
      d.rival = rival;
      d.link = new DuelLink(this.s, this.pvp, rival);
      d.offHp = this.pvp.on('hp', (msg) => this.#serverHp(d, msg));
    }
    this.pvp.arrived();
    this.hud.begin(d);
  }

  #end() {
    const d = this.duel;
    if (!d) return;
    this.duel = null;
    d.link?.dispose();
    d.offHp?.();
    const w = this.world;
    if (w && d.rival) {
      d.rival.removed = true;
      w.actors = w.actors.filter((a) => a !== d.rival);
      w.enemies = w.enemies.filter((a) => a !== d.rival);
    }
    this.hud?.finish();
  }

  // ------------------------------------------------------------------ Ablauf
  #tick(dt, d) {
    const m = d.match, hero = d.hero, rival = d.rival;
    if (this.pvp.match !== m && !d.over) { this.pvp.returnHome(); return; }
    // Gong: vorher stehen beide still
    const now = performance.now();
    if (d.go == null && m.go != null && now >= m.go) {
      d.go = m.go;
      holdHero(hero, false);
      if (m.kind === 'bot') holdHero(rival, false);
      this.s.sfx?.play?.('quest');
    }
    if (d.go == null) { holdHero(hero, true); if (m.kind === 'bot') holdHero(rival, true); }
    if (m.kind === 'bot' && d.go != null && !d.over) {
      rival.brain.update(dt, this.s.world);
      if (d.fightMs() >= TIMING.matchMs) this.#timeUp(d);
    }
    d.link?.update(dt);
    // Ergebnis gezeigt: nach einer Weile zurück
    if (d.leaveAt != null && now >= d.leaveAt) { d.leaveAt = null; this.pvp.returnHome(); }
  }

  get storm() {
    const d = this.duel;
    return d?.go != null && !d.over ? stormMult(d.fightMs()) : 1;
  }

  // Jemand fällt. Gegen Herausforderer entscheidet das hier; im echten Kampf meldet der Server das Ergebnis.
  #down(d, who) {
    if (d.over) return;
    if (d.kind !== 'bot') return;
    const won = who !== d.hero;
    this.#localResult(d, won ? 1 : 0);
  }

  #timeUp(d) {
    const a = d.hero.hp / d.hero.maxHp, b = d.rival.hp / d.rival.maxHp;
    this.#localResult(d, Math.abs(a - b) < 0.005 ? 0.5 : a > b ? 1 : 0);
  }

  #localResult(d, score) {
    d.over = true;
    d.local = score;
    holdHero(d.hero, true);
    if (!d.rival.downed) holdHero(d.rival, true);
    this.pvp.botResult(score, Math.round((d.hero.hp / d.hero.maxHp) * 100));
    this.hud.result({ result: score === 1 ? 'win' : score === 0 ? 'loss' : 'draw', reason: 'ko', pending: true });
    d.leaveAt = performance.now() + TIMING.resultMs + 2000;
  }

  #onEnd(e) {
    const d = this.duel;
    if (!d) return;
    d.over = true;
    holdHero(d.hero, true);
    this.hud.result(e);
    d.leaveAt = performance.now() + TIMING.resultMs;
  }

  // ------------------------------------------------------------------ Echter Kampf
  #sendHit(d, h) {
    if (d.over || d.go == null || d.hero.downed) return;
    this.pvp.send({ t: 'hit', d: Math.round(h.d * 10) / 10, ...(h.dot ? { dot: 1 } : {}), ...(h.heavy ? { heavy: 1 } : {}) });
  }

  // Leben vom Server: eigener Held (Treffer des Gegners, Heilung) oder Gegner (eigener Treffer bestätigt)
  #serverHp(d, msg) {
    const mine = msg.side === d.match.side;
    const hero = d.hero, rival = d.rival, w = this.s.world;
    const dmg = Math.max(0, Number(msg.dmg) || 0);
    const hp = Math.max(0, Number(msg.hp) || 0);
    if (mine) {
      if (msg.heal) { const n = Math.max(0, hp - hero.hp); hero.hp = Math.min(hero.maxHp, hp); if (n) w.bus.emit('heal', { actor: hero, amount: n }); return; }
      hero.hp = Math.min(hero.maxHp, hp);
      if (!dmg) return;
      const dx = hero.x - rival.x, dy = hero.y - rival.y, l = Math.hypot(dx, dy) || 1;
      const hit = { damage: dmg, crit: !!msg.crit, heavy: !!msg.heavy, dot: !!msg.dot, dirX: dx / l, dirY: dy / l };
      hero.flash = 0.1;
      hero.combatTime = 0;
      if (!msg.dot) {
        const res = hero.cls.resource;
        if (res.onHurt) hero.gainResource(res.onHurt);
        hero.kbx += hit.dirX * (msg.heavy ? 90 : 50); hero.kby += hit.dirY * (msg.heavy ? 90 : 50);
      }
      if (msg.ub) { hero.buff('unbroken', 3, { damageTaken: 0.5 }); hero.unbrokenNote = true; }
      if (hp <= 0) hero.die();
      else if (!msg.dot) hero.onHurt(hit);
      w.bus.emit('hit', { attacker: rival, target: hero, damage: dmg, crit: hit.crit, heavy: hit.heavy, dot: hit.dot, dirX: hit.dirX, dirY: hit.dirY, x: hero.x, y: hero.centerY, killed: false });
      return;
    }
    const before = rival.hp;
    rival.serverHp(hp, msg.max);
    if (msg.heal) { if (hp > before) w.bus.emit('heal', { actor: rival, amount: hp - before }); return; }
    if (!dmg) return;
    rival.flash = 0.1;
    rival.hpBarTimer = 2.5;
    if (msg.dot) return; // Gifttakt: Zahl hat der Gift-Effekt schon gezeigt
    const dx = rival.x - hero.x, dy = rival.y - hero.y, l = Math.hypot(dx, dy) || 1;
    w.bus.emit('hit', { attacker: hero, target: rival, damage: dmg, crit: !!msg.crit, heavy: !!msg.heavy || !!msg.crit, dirX: dx / l, dirY: dy / l, x: rival.x - (dx / l) * 3, y: rival.centerY, killed: hp <= 0 });
  }

  // ------------------------------------------------------------------ Kleinigkeiten
  // Treffer des Herausforderers: Wut, Passive und Gift wie beim eigenen Helden (character/createHero.js)
  #onHit(e) {
    const d = this.duel;
    if (!d || d.kind !== 'bot') return;
    const b = d.rival, a = e.attacker;
    if (a === b || (a && a.hero === b)) b.onDealtHit(e, b.view);
  }

  #potionNote() {
    const now = performance.now();
    if (now - (this.potionAt ?? -1e9) < 2000) return;
    this.potionAt = now;
    this.s.bus.emit(EV.UI_TOAST, { text: 'In der Arena wirken keine Tränke.', kind: 'warn' });
  }

  // Name über dem Gegner (ohne Stufe: in der Arena haben alle dieselben Werte; Name in Rot; Herausforderer mit Söldner-Abzeichen wie in der Dungeonsuche)
  #nameplate(ctx, d) {
    const r = d.rival, cam = this.s.camera, font = this.s.font;
    if (!r || !cam || !font) return;
    const x = Math.round(r.x - cam.rx), y = Math.round(r.y - cam.ry - 34);
    if (x < -60 || y < -10 || x > CONFIG.viewWidth + 60 || y > CONFIG.viewHeight + 40) return;
    const tag = d.kind === 'bot' && FINDER_CONFIG.labelMercs;
    const name = r.name ?? '';
    const wn = font.measure(name, 1, true), total = wn + (tag ? 7 : 0);
    let x0 = Math.round(x - total / 2);
    ctx.globalAlpha = r.downed ? 0.5 : 0.95;
    if (tag) { badge(ctx, x0, y); x0 += 7; }
    font.draw(ctx, name, x0, y, { color: '#ff8a6a', outline: true, raw: true });
    ctx.globalAlpha = 1;
  }
}

// Söldner-Abzeichen (wie finder/Party.js): kleines Schild mit Münze
function badge(ctx, x, y) {
  ctx.fillStyle = '#0b0710'; ctx.fillRect(x - 1, y - 1, 7, 7);
  ctx.fillStyle = '#8a6a30'; ctx.fillRect(x, y, 5, 4); ctx.fillRect(x + 1, y + 4, 3, 1); ctx.fillRect(x + 2, y + 5, 1, 1);
  ctx.fillStyle = '#e8c25a'; ctx.fillRect(x + 2, y + 1, 1, 2);
}
