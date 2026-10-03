import { DurableObject } from 'cloudflare:workers';
import { MAX_WORLDS } from '../src/net/protocol.js';

// Verzeichnis der Welten: ein einziges Objekt kennt die Belegung aller Shards (Zone × Welt) und verteilt neue Spieler.
// Die Shards melden ihre Spielerzahl bei jedem Betreten/Verlassen und alle 60 s. Einträge ohne Meldung seit
// STALE_MS gelten als leer. Die Zahlen sind ein Hinweis: die Obergrenze prüft der Shard selbst („full“ → nächste Welt).
// Gehalten wird alles im Speicher; nach einem Neustart füllt es sich über die Meldungen von selbst wieder.
const STALE_MS = 150_000;

export class Directory extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.zones = new Map(); // zoneId -> Map(world -> { n, at })
  }

  #entry(zone, world) {
    let z = this.zones.get(zone);
    if (!z) this.zones.set(zone, (z = new Map()));
    let e = z.get(world);
    if (!e) z.set(world, (e = { n: 0, at: 0 }));
    return e;
  }

  #count(e, now) {
    return now - e.at < STALE_MS ? e.n : 0;
  }

  #list(zone, cap, now) {
    const z = this.zones.get(zone) ?? new Map();
    const out = [];
    for (const [world, e] of z) { const n = this.#count(e, now); if (n > 0 || world === 1) out.push({ world, n: Math.min(n, cap), cap }); }
    if (!out.some((w) => w.world === 1)) out.push({ world: 1, n: 0, cap });
    return out.sort((a, b) => a.world - b.world);
  }

  // Welt für einen Spieler wählen: gewünschte Welt, sonst die niedrigste Welt mit Platz
  // (so füllen sich Welten, statt dass sich Spieler auf viele leere verteilen). exclude = gerade als voll gemeldet.
  assign(zone, pref, cap, exclude = []) {
    const now = Date.now();
    const skip = new Set(exclude);
    let world = null;
    // Gewünschte Welt (Wiederverbinden, Zonenwechsel, Weltwahl) immer versuchen: nur der Shard weiß, ob dort gerade
    // dasselbe Konto noch mit einer alten Verbindung steht. Ist sie wirklich voll, antwortet er „full“.
    if (Number.isInteger(pref) && pref >= 1 && pref <= MAX_WORLDS && !skip.has(pref)) world = pref;
    for (let w = 1; world == null && w <= MAX_WORLDS; w++) {
      if (!skip.has(w) && this.#count(this.#entry(zone, w), now) < cap) world = w;
    }
    world ??= 1 + Math.floor(Math.random() * MAX_WORLDS);
    // Kein Platz wird hier belegt: zu diesem Zeitpunkt ist die Anmeldung noch nicht geprüft. Gezählt wird ein Spieler
    // erst, wenn der Shard ihn angenommen hat und seine neue Spielerzahl meldet (direkt nach „welcome“). Kommen viele gleichzeitig,
    // antwortet der Shard über der Obergrenze mit „full“ und der Client nimmt die nächste Welt.
    return { world, worlds: this.#list(zone, cap, now) };
  }

  report(zone, world, n) {
    const e = this.#entry(zone, world);
    e.n = n; e.at = Date.now();
    if (n === 0 && world !== 1) this.zones.get(zone)?.delete(world);
  }

  list(zone, cap) { return this.#list(zone, cap, Date.now()); }

  // Gesamtüberblick (für /net/status): Spieler je Zone und Welt.
  overview() {
    const now = Date.now(), out = {};
    for (const [zone, z] of this.zones) {
      for (const [world, e] of z) { const n = now - e.at < STALE_MS ? e.n : 0; if (n) (out[zone] ??= {})[world] = n; }
    }
    return out;
  }
}
