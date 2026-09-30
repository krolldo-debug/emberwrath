// Inhalts-Register: alle datengetriebenen Definitionen (Völker, Klassen, Items,
// Quests, Gegner, Zonen, NPCs …) werden hier unter Art + ID abgelegt.
// Jeder Bereich registriert seine Inhalte in seinem install(); gelesen wird überall
// nur per ID. Später kann derselbe Datensatz auch serverseitig geladen werden.
export class Content {
  constructor() {
    this.kinds = new Map();
  }
  define(kind, id, def) {
    if (!this.kinds.has(kind)) this.kinds.set(kind, new Map());
    const m = this.kinds.get(kind);
    if (m.has(id)) throw new Error(`Content ${kind}:${id} doppelt definiert`);
    const entry = Object.freeze({ ...def, id });
    m.set(id, entry);
    return entry;
  }
  defineAll(kind, map) { for (const [id, def] of Object.entries(map)) this.define(kind, id, def); }
  get(kind, id) {
    const d = this.kinds.get(kind)?.get(id);
    if (!d) throw new Error(`Content ${kind}:${id} unbekannt`);
    return d;
  }
  find(kind, id) { return this.kinds.get(kind)?.get(id) ?? null; }
  all(kind) { return [...(this.kinds.get(kind)?.values() ?? [])]; }
}
