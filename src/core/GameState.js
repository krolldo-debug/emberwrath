import { EV } from './events.js';

export const SAVE_VERSION = 1;

// Der EINZIGE Spielzustand. Er ist in "Slices" aufgeteilt, die jeweils genau
// einem Bereich gehören (character, progress, inventory, wallet, quests, world).
//
// Regeln:
//  - Lesen darf jeder: state.get('inventory') bzw. state.slices.inventory.
//  - Schreiben nur über Commands: state.commit('inventory:add', { itemId, qty }).
//    Ein Command gehört dem Bereich, der die Slice besitzt, und wird dort per
//    defineCommand registriert. Darstellung (Render/UI) committet nie direkt,
//    sondern löst höchstens Spielaktionen aus (Buttons -> commit).
//  - Jeder Command läuft über die Authority (core/Authority.js). Lokal wird er
//    sofort angewendet; ein späterer Server kann ihn prüfen oder ablehnen.
//  - Nach jedem Command: EV.STATE_CHANGED mit { type, payload, result }.
//  - Nur Slices werden gespeichert. Laufzeitobjekte (Entities, Partikel) gehören
//    nicht in den Zustand.
export class GameState {
  constructor(bus, authority, content) {
    this.bus = bus;
    this.authority = authority;
    this.ctx = { bus, content };
    this.sliceDefs = new Map();
    this.commands = new Map();
    this.slices = {};
    this.meta = GameState.#emptyMeta();
    this.log = []; // letzte Commands (Debug)
  }

  static #emptyMeta() {
    return { accountId: null, characterId: null, createdAt: 0, savedAt: 0, playTime: 0, version: SAVE_VERSION };
  }

  // def: { create(init) -> Objekt, serialize?(slice) -> JSON, deserialize?(json, version) -> Objekt }
  defineSlice(name, def) {
    if (this.sliceDefs.has(name)) throw new Error(`Slice ${name} doppelt definiert`);
    this.sliceDefs.set(name, def);
    this.slices[name] = def.create({});
  }

  // handler(state, payload, ctx) -> result ; ctx = { bus, content }
  // opts.authoritative: Belohnungen/Fortschritt, die ein Server später selbst berechnen muss.
  defineCommand(type, handler, opts = {}) {
    if (this.commands.has(type)) throw new Error(`Command ${type} doppelt definiert`);
    this.commands.set(type, { handler, authoritative: !!opts.authoritative });
  }

  get(name) {
    const s = this.slices[name];
    if (!s) throw new Error(`Slice ${name} unbekannt`);
    return s;
  }

  commit(type, payload = {}) {
    const cmd = this.commands.get(type);
    if (!cmd) throw new Error(`Command ${type} unbekannt`);
    const result = this.authority.execute({ type, payload, authoritative: cmd.authoritative }, () => cmd.handler(this, payload, this.ctx));
    this.log.push({ type, payload, t: Date.now() });
    if (this.log.length > 50) this.log.shift();
    this.bus.emit(EV.STATE_CHANGED, { type, payload, result });
    return result;
  }

  // Neues Spiel: alle Slices frisch, init wird an create() durchgereicht
  // (z. B. { character: { name, raceId, classId } }).
  reset(init = {}) {
    this.meta = GameState.#emptyMeta();
    for (const [name, def] of this.sliceDefs) this.slices[name] = def.create(init[name] ?? {});
  }

  snapshot() {
    const data = {};
    for (const [name, def] of this.sliceDefs) {
      const s = this.slices[name];
      data[name] = def.serialize ? def.serialize(s) : structuredClone(s);
    }
    return { meta: { ...this.meta, version: SAVE_VERSION }, slices: data };
  }

  load(snap) {
    const version = snap?.meta?.version ?? 0;
    this.meta = { ...GameState.#emptyMeta(), ...snap.meta, version: SAVE_VERSION };
    for (const [name, def] of this.sliceDefs) {
      const raw = snap.slices?.[name];
      if (raw == null) { this.slices[name] = def.create({}); continue; }
      this.slices[name] = def.deserialize ? def.deserialize(raw, version) : { ...def.create({}), ...structuredClone(raw) };
    }
  }
}
