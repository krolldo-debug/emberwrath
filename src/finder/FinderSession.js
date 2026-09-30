import { Party } from './Party.js';
import { FinderHud } from './FinderHud.js';
import { lineFor, replyEvent } from './chatter.js';

// Sitzungssystem 'finder': verbindet die Gruppensuche (game.finder) mit der laufenden Spielsitzung.
// Betritt der Spieler den Dungeon seiner Gruppe, entsteht eine Party (Söldner erscheinen), bei jedem
// Zonenwechsel wird sie neu aufgebaut oder aufgelöst. Außerdem: Chatzeilen der Söldner zur richtigen Zeit.
export class FinderSession {
  constructor(session, finder) {
    this.s = session;
    this.finder = finder;
    this.world = null;
    this.party = null;
    this.queue = [];      // geplante Chatzeilen { at, bot, event | text }
    this.t = 0;
    this.flags = {};
    this.hud = new FinderHud(session, finder, this);
  }

  update(dt) {
    this.t += dt;
    const w = this.s.world;
    if (w && w !== this.world) this.#onWorld(w);
    if (this.party && !this.s.paused) {
      this.party.update(dt);
      this.#situations(dt);
    }
    this.#flushChat();
    this.hud.update(dt);
  }

  draw(ctx) { this.party?.draw(ctx); }

  #onWorld(w) {
    const hadParty = !!this.party;
    const wiped = this.party?.wiped;
    this.party?.dispose();
    this.party = null;
    this.world = w;
    const zoneId = w.zone?.id;
    const f = this.finder;
    if (f.state === 'active' && f.group?.dungeonId === zoneId || f.restore(zoneId)) {
      this.party = new Party(this.s, f.group, { say: (m, text) => this.#post(m, text), event: (name, data) => this.#event(name, data) });
      this.flags = {};
      this.queue = [];
      this.#greet(hadParty);
      return;
    }
    if (hadParty && f.state === 'active') {
      // Dungeon verlassen: die Gruppe löst sich auf
      f.leave(true);
      f.game.bus.emit('finder:chat', { kind: 'sys', text: wiped ? 'Deine Gruppe wurde besiegt und hat sich aufgelöst.' : 'Die Gruppe hat sich aufgelöst.' });
    }
  }

  // ------------------------------------------------------------------ Chat
  #post(member, text) {
    this.finder.game.bus.emit('finder:chat', { from: member, text, kind: 'group' });
  }

  playerSays(text) {
    const c = this.finder.char();
    this.#post({ name: c.name, self: true }, text);
    if (!this.party) return;
    const ev = replyEvent(text);
    if (!ev) return;
    let n = 0;
    for (const b of shuffle(this.party.bots)) {
      if (b.dead || n >= (ev === 'questionBack' ? 1 : 2)) continue;
      if (Math.random() < 0.8 - n * 0.35) { this.#plan(b, ev, 1 + Math.random() * 2.5 + n * 1.2); n++; }
    }
  }

  // Zeile planen: event (chatter.js) oder fester Text
  #plan(bot, event, delay, force = false) {
    this.queue.push({ at: this.t + delay, bot, event, force });
  }

  #flushChat() {
    if (!this.queue.length || !this.party) return;
    const due = this.queue.filter((q) => q.at <= this.t);
    if (!due.length) return;
    this.queue = this.queue.filter((q) => q.at > this.t);
    for (const q of due) {
      if (!this.party.bots.includes(q.bot)) continue;
      const text = lineFor(q.event, q.bot.member.style, { force: q.force });
      if (text) this.party.say(q.bot, text);
    }
  }

  #greet(again) {
    const p = this.party;
    if (!p.bots.length || again) return;
    const bots = shuffle(p.bots);
    // Begrüßung (wie echte Gruppen: nicht alle, nicht gleichzeitig)
    bots.forEach((b, i) => { if (Math.random() < 0.75) this.#plan(b, 'hello', 1.2 + i * 1.4 + Math.random()); });
    const tank = p.bots.find((b) => b.member.role === 'tank');
    if (tank) this.#plan(tank, 'tankLead', 4.5 + Math.random() * 2);
    else this.#plan(bots[0], 'playerTank', 4 + Math.random() * 2);
  }

  #event(name, data) {
    const p = this.party;
    if (!p) return;
    const alive = p.bots.filter((b) => !b.dead);
    const some = () => alive[Math.floor(Math.random() * alive.length)];
    switch (name) {
      case 'bossPull': if (alive.length) this.#plan(some(), 'bossPull', 0.4 + Math.random()); break;
      case 'bossDown':
        shuffle(p.bots).forEach((b, i) => this.#plan(b, 'bossDown', 1 + i * 1.3 + Math.random() * 1.5));
        shuffle(p.bots).forEach((b, i) => { if (Math.random() < 0.7) this.#plan(b, 'thanks', 9 + i * 2 + Math.random() * 3); });
        break;
      case 'botDied': this.#plan(data, 'selfDied', 1 + Math.random() * 1.5); break;
      case 'playerDied': if (alive.length) this.#plan(some(), 'playerDied', 1.2 + Math.random()); break;
      case 'playerRevived': break;
      case 'botRevived': this.#plan(data, 'revived', 0.8 + Math.random()); break;
      case 'levelUp': p.bots.forEach((b, i) => this.#plan(b, 'levelUp', 0.8 + i * 0.9 + Math.random())); break;
      default: break;
    }
  }

  // Lagen, die Mitspieler kommentieren: Boss in Sicht, Boss halb, Spieler lange untätig, wenig Mana, Gruppe tot
  #situations() {
    const p = this.party, w = p.world, b = w.boss, h = p.player, F = this.flags;
    if (b && !b.dead && !b.engaged && !F.bossNear && w.arena) {
      const cx = (w.arena.x0 + w.arena.x1) / 2, cy = (w.arena.y0 + w.arena.y1) / 2;
      if (Math.hypot(h.x - cx, h.y - cy) < 260) { F.bossNear = true; const t = p.bots.find((x) => x.member.role === 'tank') ?? p.bots[0]; if (t) this.#plan(t, 'bossNear', 0.5); }
    }
    if (b?.engaged && !b.dead && !F.bossHalf && b.hp / b.maxHp < 0.5) { F.bossHalf = true; const x = p.bots.find((y) => !y.dead); if (x) this.#plan(x, 'bossHalf', 0.3); }
    if (!p.inCombat && p.playerIdle > 45 && !F.afk) { F.afk = true; const x = p.bots.find((y) => !y.dead); if (x) this.#plan(x, 'afk', 0); }
    if (p.playerIdle < 1) F.afk = false;
    for (const x of p.bots) {
      if (x.resourceType !== 'mana' || x.dead || !p.inCombat) continue;
      if (x.resource / x.maxResource < 0.12 && this.t - (F.mana ?? -99) > 60) { F.mana = this.t; this.#plan(x, 'lowMana', 0.2); }
    }
    if (p.wiped && !F.wipe) { F.wipe = true; const x = p.bots[0]; if (x) this.#plan(x, 'wipe', 1.2, true); }
  }

  dispose() {
    this.party?.dispose();
    this.party = null;
    this.hud.dispose();
  }
}

function shuffle(a) {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

