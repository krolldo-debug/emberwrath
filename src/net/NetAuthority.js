import { LocalAuthority } from '../core/Authority.js';

// Authority mit Welt-Server (Stufe 1). Gleiche Form wie LocalAuthority (core/Authority.js):
//   execute()      Stufe 1: weiter lokal (Kampf, Beute, Quests rechnet der Client). Stufe 2 schickt authoritative
//                  Commands an den Shard und wendet dessen Antwort an.
//   joinZone(id)   offenes Gebiet -> Verbindung zum Shard (Zone × Welt); Dungeon-Instanz -> keine Verbindung (Stufe 1)
//   leaveZone()    trennt
//   sendIntent(i)  { type: 'state', s } -> eigener Zustand an den Shard
//   remotePlayers() andere Spieler im Shard: [{ id, name, level, look, s }]
//   on(event, fn)  'playerJoined' | 'playerLeft' | 'snapshot' | 'status'
export class NetAuthority extends LocalAuthority {
  constructor(content, client) {
    super(content);
    this.client = client;
    this.mode = 'online';
    this.online = true;
    this.lastWorld = 'auto'; // beim Zonenwechsel dieselbe Welt-Nummer bevorzugen
    this.roster = new Map();
    client.on('welcome', (m) => {
      this.lastWorld = m.world;
      this.roster.clear();
      for (const p of m.players ?? []) this.roster.set(p.id, p);
      if (this.zone) { this.zone.world = m.world; this.zone.capacity = m.cap; this.zone.population = this.roster.size + 1; }
    });
    client.on('join', (m) => { this.roster.set(m.p.id, m.p); this.#pop(); });
    client.on('leave', (m) => { this.roster.delete(m.id); this.#pop(); });
    client.on('look', (m) => { const p = this.roster.get(m.id); if (p) { p.look = m.look; p.level = m.level; } });
    client.on('u', (m) => { for (const s of m.s ?? []) { const p = this.roster.get(s[0]); if (p) p.s = s.slice(1); } });
    client.on('disconnected', () => { this.roster.clear(); this.#pop(); });
  }

  #pop() { if (this.zone) this.zone.population = this.client.online ? this.roster.size + 1 : 1; }

  joinZone(zoneId) {
    const z = super.joinZone(zoneId);
    const def = this.content.find('zone', zoneId);
    this.roster.clear();
    if (def && !def.instanced) {
      z.instanceId = `${zoneId}#net`;
      z.shared = true;
      this.client.join(zoneId, this.lastWorld);
    } else {
      z.shared = false;
      this.client.leave();
    }
    return z;
  }

  leaveZone() {
    super.leaveZone();
    this.roster.clear();
    this.client.leave();
  }

  sendIntent(intent) {
    if (intent?.type === 'state') this.client.send({ t: 's', s: intent.s });
  }

  remotePlayers() { return [...this.roster.values()]; }

  on(event, fn) {
    const map = { playerJoined: 'join', playerLeft: 'leave', snapshot: 'u', status: 'status' };
    return map[event] ? this.client.on(map[event], fn) : () => {};
  }
}
