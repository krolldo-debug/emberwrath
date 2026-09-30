import { GROUP_SIZE, TIMING, ROLES } from './protocol.js';
import { fillWithMercs } from './mercs.js';
import { randomSeed } from './rng.js';

// Gruppenbildung der Dungeon-Suche, ohne Netzwerk (läuft im Durable Object und – falls der Server nicht
// erreichbar ist – im Browser). Regeln:
//   1. Echte Spieler zuerst: aus der Warteschlange eines Dungeons wird eine volle Gruppe (1 Tank + 2 Schaden)
//      gebildet, sobald sie sich aus echten Spielern zusammenstellen lässt.
//   2. Sucht niemand sonst Passendes, füllen Söldner die freien Plätze nach einer kurzen Suche (TIMING.botFillMs).
//   3. Suchen andere Passendes, wird länger auf echte Mitspieler gewartet (humanWaitMs); nach partialMs reicht auch
//      eine Teilgruppe aus echten Spielern, der Rest wird aufgefüllt.
//   4. Bereitschaftsprüfung: jeder echte Spieler bestätigt (readyMs). Wer ablehnt oder nicht antwortet, fliegt aus
//      der Suche; die anderen suchen mit ihrer alten Wartezeit weiter.
//
// humanGroups: Dürfen mehrere echte Spieler in eine Gruppe? Das braucht geteilte Gegner in der Instanz
// (Mehrspieler Stufe 2, src/net/README.md). Bis dahin false: jeder echte Spieler bekommt eine eigene Gruppe mit
// Söldnern, die Warteschlange und ihre Zahlen sind trotzdem echt.
//
// Ereignisse (tick/accept/remove liefern Arrays): { to: ticketId, msg }
export class Matchmaker {
  constructor({ humanGroups = false, now = () => Date.now(), seed = randomSeed, timing = TIMING } = {}) {
    this.humanGroups = humanGroups;
    this.now = now;
    this.seed = seed;
    this.timing = timing;
    this.tickets = new Map(); // id -> ticket
    this.groups = new Map();  // id -> Gruppe in der Bereitschaftsprüfung
    this.nextGroup = 1;
  }

  // ticket = { id, name, level, classId, raceId, role, dungeonId }
  add(t) {
    const now = this.now();
    const [lo, hi] = this.timing.botFillMs;
    const ticket = { ...t, since: t.since ?? now, fillAt: (t.since ?? now) + lo + Math.random() * (hi - lo), group: null };
    this.remove(ticket.id);
    this.tickets.set(ticket.id, ticket);
    return [{ to: ticket.id, msg: { t: 'queued', dungeonId: ticket.dungeonId, role: ticket.role, since: ticket.since, searching: this.searching(ticket.dungeonId) } }];
  }

  // Suche beenden (Abmelden, Verbindung weg). Eine laufende Bereitschaftsprüfung zählt als abgelehnt.
  remove(id) {
    const t = this.tickets.get(id);
    if (!t) return [];
    this.tickets.delete(id);
    return t.group ? this.#dissolve(t.group, id, 'declined') : [];
  }

  accept(id, groupId, ok) {
    const t = this.tickets.get(id);
    const g = this.groups.get(groupId);
    if (!t || !g || t.group !== groupId) return [];
    if (!ok) { this.tickets.delete(id); return [{ to: id, msg: { t: 'cancelled', reason: 'declined' } }, ...this.#dissolve(groupId, id, 'declined')]; }
    g.accepted.add(id);
    const out = [];
    for (const m of g.players) out.push({ to: m.ticketId, msg: { t: 'ready', groupId, ticketId: id } });
    if (g.players.every((m) => g.accepted.has(m.ticketId))) {
      this.groups.delete(groupId);
      const group = this.#public(g);
      for (const m of g.players) { this.tickets.delete(m.ticketId); out.push({ to: m.ticketId, msg: { t: 'start', group } }); }
    }
    return out;
  }

  searching(dungeonId) {
    let n = 0;
    for (const t of this.tickets.values()) if (!dungeonId || t.dungeonId === dungeonId) n++;
    return n;
  }

  tick() {
    const now = this.now();
    const out = [];
    // Abgelaufene Bereitschaftsprüfungen
    for (const g of [...this.groups.values()]) {
      if (now < g.expires) continue;
      for (const m of g.players) {
        if (g.accepted.has(m.ticketId)) continue;
        this.tickets.delete(m.ticketId);
        out.push({ to: m.ticketId, msg: { t: 'cancelled', reason: 'timeout' } });
      }
      out.push(...this.#dissolve(g.id, null, 'timeout'));
    }
    // Neue Gruppen je Dungeon
    const byDungeon = new Map();
    for (const t of this.tickets.values()) {
      if (t.group) continue;
      let q = byDungeon.get(t.dungeonId);
      if (!q) byDungeon.set(t.dungeonId, (q = []));
      q.push(t);
    }
    for (const q of byDungeon.values()) {
      q.sort((a, b) => a.since - b.since);
      if (this.humanGroups) {
        // 1. volle Gruppen aus echten Spielern
        for (let g = pickFull(q); g; g = pickFull(q)) out.push(...this.#form(g, now));
        // 3. Teilgruppen nach partialMs
        while (q.length >= 2 && now - q[0].since >= this.timing.partialMs) {
          const g = pickPartial(q);
          if (!g) break;
          out.push(...this.#form(g, now));
        }
      }
      // 2./3. einzelne Spieler mit Söldnern auffüllen
      for (const t of [...q]) {
        const others = this.humanGroups && q.some((o) => o !== t && fits([t], o));
        const due = others ? t.since + this.timing.humanWaitMs : t.fillAt;
        if (now < due) continue;
        q.splice(q.indexOf(t), 1);
        out.push(...this.#form([t], now));
      }
    }
    return out;
  }

  // Suchstand für die Anzeige
  stats(dungeonId) { return { searching: this.searching(dungeonId), total: this.tickets.size }; }

  // ------------------------------------------------------------------ intern
  #form(tickets, now) {
    const players = tickets.map((t) => ({ kind: 'player', ticketId: t.id, name: t.name, level: t.level, classId: t.classId, raceId: t.raceId, role: t.role }));
    const seed = this.seed();
    const mercs = fillWithMercs(players, { seed, size: GROUP_SIZE });
    const g = {
      id: `g${this.nextGroup++}_${(seed % 100000).toString(36)}`,
      dungeonId: tickets[0].dungeonId, seed, expires: now + this.timing.readyMs,
      players, mercs, accepted: new Set(),
    };
    this.groups.set(g.id, g);
    for (const t of tickets) t.group = g.id;
    const group = this.#public(g);
    return players.map((m) => ({ to: m.ticketId, msg: { t: 'proposal', group } }));
  }

  // Gruppe auflösen: die übrigen suchen mit ihrer alten Wartezeit weiter.
  #dissolve(groupId, leaverId, reason) {
    const g = this.groups.get(groupId);
    if (!g) return [];
    this.groups.delete(groupId);
    const out = [];
    for (const m of g.players) {
      if (m.ticketId === leaverId) continue;
      const t = this.tickets.get(m.ticketId);
      if (!t) continue;
      t.group = null;
      out.push({ to: t.id, msg: { t: 'requeued', reason } });
    }
    return out;
  }

  #public(g) {
    // Reihenfolge: Tank zuerst, dann Schaden; innerhalb gleich: echte Spieler vor Söldnern
    const members = [...g.players, ...g.mercs].sort((a, b) => (a.role === b.role ? (a.kind === 'player' ? -1 : 1) : a.role === 'tank' ? -1 : 1));
    return { id: g.id, dungeonId: g.dungeonId, seed: g.seed, expires: g.expires, members };
  }
}

// Passt Spieler o zu einer Teilgruppe? (höchstens 1 Tank, höchstens 2 Schaden)
function fits(members, o) {
  const tanks = members.filter((m) => m.role === 'tank').length + (o.role === 'tank' ? 1 : 0);
  const dps = members.filter((m) => m.role !== 'tank').length + (o.role !== 'tank' ? 1 : 0);
  return tanks <= ROLES.tank.slots && dps <= ROLES.dps.slots;
}

// Volle Gruppe (ältester Spieler zuerst). Entfernt die gewählten aus q.
function pickFull(q) {
  const g = [];
  for (const t of q) { if (fits(g, t)) g.push(t); if (g.length === GROUP_SIZE) break; }
  if (g.length < GROUP_SIZE) return null;
  for (const t of g) q.splice(q.indexOf(t), 1);
  return g;
}

// Teilgruppe ab zwei Spielern, angeführt vom am längsten Wartenden.
function pickPartial(q) {
  const g = [q[0]];
  for (const t of q.slice(1)) { if (fits(g, t)) g.push(t); if (g.length === GROUP_SIZE - 1) break; }
  if (g.length < 2) return null;
  for (const t of g) q.splice(q.indexOf(t), 1);
  return g;
}
