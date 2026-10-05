import { Matchmaker } from '../../src/finder/matchmaker.js';
import { FINDER_VERSION, TIMING, cleanChar, cleanDungeon, cleanRole, roleAllowed } from '../../src/finder/protocol.js';
import { nameProblem } from '../../src/net/names.js';
import { LEVEL_MAX } from '../../src/net/protocol.js';

// Kern der Gruppensuche auf dem Server, ohne Cloudflare-Abhängigkeiten (in Node testbar, worker/finder/test/).
// Eine Verbindung = ein suchender Spieler = ein Ticket im Matchmaker. Das Durable Object (queue.js) reicht nur
// Nachrichten, Schließen und den Takt herein.
//   socket: { send(string), close(code, reason) }
//   verify(token) -> Promise<{ uid } | null>
//   profile(uid, charId) -> Promise<{ name, level } | null>  gespeicherter Charakter (Name und Stufe, die andere sehen)
// Name und Stufe wie auf dem Welt-Server (worker/shard.js): aus dem Speicherstand, Stufe höchstens eine darüber,
// gesperrte Namen (src/net/names.js) werden zu „Abenteurer“.
const HELLO_TIMEOUT_MS = 10_000;
const MAX_MSG = 4096;
const RATE_PER_S = 5, RATE_BURST = 20;

export class FinderHub {
  constructor({ verify, profile = null, humanGroups = false, now = () => Date.now(), timing = TIMING } = {}) {
    this.verify = verify;
    this.profile = profile;
    this.now = now;
    this.timing = timing;
    this.mm = new Matchmaker({ humanGroups, now, timing });
    this.conns = new Map();   // socket -> Verbindung
    this.byTicket = new Map(); // ticketId -> Verbindung
    this.seq = 0;
    this.lastStats = 0;
  }

  get size() { return this.conns.size; }

  open(socket) {
    this.conns.set(socket, { socket, since: this.now(), uid: null, ticketId: null, char: null, tokens: RATE_BURST, last: this.now(), later: [] });
  }

  async message(socket, raw) {
    const c = this.conns.get(socket);
    if (!c) return;
    if (typeof raw !== 'string' || raw.length > MAX_MSG) { this.#drop(c, 1009, 'zu groß'); return; }
    if (!this.#rate(c)) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    if (!c.uid) {
      // Der Client schickt 'queue' direkt nach 'hello'; bis die Anmeldung geprüft ist, wird gewartet.
      if (m.t === 'hello' && !c.authing) await this.#hello(c, m);
      else if (c.authing && c.later.length < 4) c.later.push(m);
      return;
    }
    this.#handle(c, m);
  }

  #handle(c, m) {
    switch (m.t) {
      case 'queue': this.#queue(c, m); break;
      case 'cancel': this.#emit(this.mm.remove(c.ticketId)); c.ticketId = null; break;
      case 'accept': if (c.ticketId && typeof m.groupId === 'string') this.#emit(this.mm.accept(c.ticketId, m.groupId, !!m.ok)); break;
      default: break; // unbekannte Typen (neuere Clients) ignorieren
    }
  }

  close(socket) {
    const c = this.conns.get(socket);
    if (!c) return;
    this.conns.delete(socket);
    if (c.ticketId) { this.byTicket.delete(c.ticketId); this.#emit(this.mm.remove(c.ticketId)); }
  }

  // Takt (etwa jede Sekunde): Gruppen bilden, Bereitschaft ablaufen lassen, Suchstand melden, Stille trennen.
  tick() {
    const now = this.now();
    for (const c of [...this.conns.values()]) if (!c.uid && now - c.since > HELLO_TIMEOUT_MS) this.#drop(c, 4000, 'hello');
    this.#emit(this.mm.tick());
    if (now - this.lastStats >= this.timing.statsMs) {
      this.lastStats = now;
      for (const c of this.byTicket.values()) {
        const t = this.mm.tickets.get(c.ticketId);
        if (t && !t.group) this.#send(c, { t: 'stats', ...this.mm.stats(t.dungeonId) });
      }
    }
  }

  // ------------------------------------------------------------------ intern
  async #hello(c, m) {
    if (m.v !== FINDER_VERSION) { this.#bye(c, 'version'); return; }
    c.authing = true;
    const user = await this.verify(m.token).catch(() => null);
    if (!this.conns.has(c.socket)) return; // inzwischen getrennt
    if (!user) { this.#bye(c, 'auth'); return; }
    // Dasselbe Konto sucht schon (zweiter Tab, Neuladen): die alte Suche endet.
    for (const o of [...this.conns.values()]) if (o !== c && o.uid === user.uid) this.#bye(o, 'replaced');
    const char = cleanChar(m.char);
    const stored = this.profile ? await this.profile(user.uid, char.id).catch(() => null) : null;
    if (!this.conns.has(c.socket)) return;
    if (stored?.name) char.name = stored.name;
    const levelMax = stored ? Math.min(LEVEL_MAX, stored.level + 1) : LEVEL_MAX;
    char.level = Math.max(stored?.level ?? 1, Math.min(char.level, levelMax));
    if (nameProblem(char.name)) char.name = 'Abenteurer';
    // erst jetzt als angemeldet gelten (bis hierhin wartende 'queue'-Nachrichten laufen unten mit fertigem char)
    c.char = char;
    c.uid = user.uid;
    this.#send(c, { t: 'welcome', v: FINDER_VERSION });
    for (const x of c.later.splice(0)) this.#handle(c, x);
  }

  #queue(c, m) {
    const dungeonId = cleanDungeon(m.dungeonId);
    let role = cleanRole(m.role);
    if (!dungeonId) { this.#send(c, { t: 'cancelled', reason: 'invalid' }); return; }
    if (!roleAllowed(role, c.char.classId)) role = 'dps';
    if (c.ticketId) { this.byTicket.delete(c.ticketId); this.#emit(this.mm.remove(c.ticketId)); }
    c.ticketId = `t${++this.seq}`;
    this.byTicket.set(c.ticketId, c);
    const { name, level, classId, raceId } = c.char;
    this.#emit(this.mm.add({ id: c.ticketId, name, level, classId, raceId, role, dungeonId }));
  }

  #emit(events) {
    for (const { to, msg } of events ?? []) {
      const c = this.byTicket.get(to);
      if (!c) continue;
      // Der Client erkennt sich in der Gruppe an seiner Ticketnummer
      this.#send(c, msg.t === 'proposal' ? { ...msg, you: to } : msg);
      if (msg.t === 'start' || msg.t === 'cancelled') { this.byTicket.delete(to); c.ticketId = null; }
    }
  }

  #rate(c) {
    const now = this.now();
    c.tokens = Math.min(RATE_BURST, c.tokens + (now - c.last) / 1000 * RATE_PER_S);
    c.last = now;
    if (c.tokens < 1) return false;
    c.tokens -= 1;
    return true;
  }

  #send(c, msg) { try { c.socket.send(JSON.stringify(msg)); } catch { /* Verbindung weg: close() räumt auf */ } }

  #bye(c, reason) { this.#send(c, { t: 'bye', reason }); this.#drop(c, 4000 + (reason === 'auth' ? 3 : reason === 'version' ? 2 : 1), reason); }

  #drop(c, code, reason) {
    this.close(c.socket);
    try { c.socket.close(code, reason); } catch { /* schon zu */ }
  }
}
