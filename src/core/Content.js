// Inhalts-Register: alle datengetriebenen Definitionen (Völker, Klassen, Items,
// Quests, Gegner, Zonen, NPCs …) werden hier unter Art + ID abgelegt.
// Jeder Bereich registriert seine Inhalte in seinem install(); gelesen wird überall
// nur per ID. Später kann derselbe Datensatz auch serverseitig geladen werden.
const LAZY = Symbol('lazy');

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
  // Wie define, aber factory() läuft erst beim ersten Lesen (teure Inhalte wie Karten: kürzerer Start auf dem Handy).
  defineLazy(kind, id, factory) {
    if (!this.kinds.has(kind)) this.kinds.set(kind, new Map());
    const m = this.kinds.get(kind);
    if (m.has(id)) throw new Error(`Content ${kind}:${id} doppelt definiert`);
    m.set(id, { [LAZY]: factory });
  }
  get(kind, id) {
    const d = this.find(kind, id);
    if (!d) throw new Error(`Content ${kind}:${id} unbekannt`);
    return d;
  }
  find(kind, id) {
    const m = this.kinds.get(kind), d = m?.get(id);
    if (!d?.[LAZY]) return d ?? null;
    const entry = Object.freeze({ ...d[LAZY](), id });
    m.set(id, entry);
    return entry;
  }
  all(kind) { return [...(this.kinds.get(kind)?.keys() ?? [])].map((id) => this.find(kind, id)); }
}
