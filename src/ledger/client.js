// Fortschrittsbuch im Spiel (src/ledger/README.md): zeichnet je Command auf, was er an Erfahrung, Gold und
// Gegenständen verändert, und liefert die Würfel des Servers für Beute und Belohnungen. Ohne DOM und ohne Netz
// (das macht index.js), damit Tests das echte Spiel samt Server-Regeln in Node durchspielen können.
//
// Eintrag: { u: Nummer im Spielstand, s: Sitzung, k: laufende Nummer der Sitzung, t: Command, p: Angaben, d: { x, g, i } Änderung, r: [[Art, Nummer]],
//            res: Ergebnis (Beute), a: neu belohnte Erfolge, z: Zone, now: Serverzeit }
// Die Warteschlange liegt in state.meta.ledger.q und wird mit jedem Spielstand gespeichert: Was im gespeicherten
// Stand steckt, steht auch in seiner Warteschlange (CloudSync schickt sie vor dem Hochladen).
import { valuesOfSlices, diffValues, isZero } from './values.js';
import { ledgerRng } from './rng.js';

export const QUEUE_MAX = 3000;
const ROLE = new Set([
  'progress:kill', 'loot:roll', 'loot:claim', 'loot:reset', 'quest:accept', 'quest:abandon', 'quest:turnIn',
  'trial:start', 'trial:fail', 'trial:leave', 'daily:login', 'board:claim', 'board:claimWeek', 'daily:claimChallenge',
  'shop:credit', 'shop:revoke',
]);

const prim = (v) => (typeof v === 'string' ? v.slice(0, 80) : typeof v === 'number' ? (Number.isFinite(v) ? v : 0) : typeof v === 'boolean' ? v : undefined);
function cleanPayload(p) {
  const out = {};
  if (!p || typeof p !== 'object') return out;
  for (const [k, v] of Object.entries(p)) {
    if (k === 'x' || k === 'y') continue;
    const c = prim(v);
    if (c !== undefined) out[k] = c;
    else if (k === 'champion' && v) out.champion = true;
  }
  return out;
}
const rewardedKeys = (s) => Object.keys(s.slices.achievements?.rewarded ?? {});

export class LedgerTap {
  // now(): Serverzeit (progression/clock.js serverNow), onCommitted(entry|null): nach jedem äußeren Command
  constructor(state, { now = () => Date.now(), onCommitted = () => {} } = {}) {
    this.state = state;
    this.now = now;
    this.onCommitted = onCommitted;
    this.session = null; // { sid, seed, k, n: { Art: Nummer } }
    this.depth = 0;
    this.cur = null;
    this.drops = new Map(); // dropId -> Schlüssel beim Server
    this.enabled = true;    // aus: nichts aufzeichnen (abgemeldet, Offline-Konto)
  }

  get book() {
    const m = this.state.meta;
    if (!m.ledger || !Array.isArray(m.ledger.q)) m.ledger = { q: [], u: 0 };
    return m.ledger;
  }
  get queue() { return this.book.q; }
  get lastU() { return this.book.u | 0; }

  install() {
    const st = this.state, orig = st.commit.bind(st);
    st.commit = (type, payload = {}) => {
      if (this.depth > 0 || !this.enabled) return orig(type, payload); // innere Commands zählen zum äußeren
      this.depth++;
      const before = valuesOfSlices(st.slices), ach = rewardedKeys(st);
      this.cur = { r: [] };
      let result, entry = null;
      try {
        result = orig(type, payload);
        return result;
      } finally {
        this.depth--;
        const cur = this.cur;
        this.cur = null;
        try { entry = this.#record(type, payload, result, before, ach, cur); } catch { entry = null; }
        this.onCommitted(entry);
      }
    };
    return this;
  }

  // Würfel für eine Belohnung. Nur innerhalb eines Commands; ohne Sitzung zufällig (der Server bestätigt das nicht).
  roll(label) {
    const s = this.session, cur = this.cur;
    if (!cur) return Math.random;
    if (!s) { cur.r.push([label, 0]); return Math.random; }
    const n = (s.n[label] ?? 0) + 1;
    s.n[label] = n;
    cur.r.push([label, n]);
    return ledgerRng(s.seed, label, n);
  }

  // Neue Sitzung vom Server: Einträge ohne Sitzung (vor dem Öffnen) bekommen sie nachträglich.
  // baseU: Das Buch beginnt mit einem hochgeladenen Stand, der die Einträge bis baseU schon enthält.
  open({ sid, seed, baseU = null }) {
    this.session = { sid, seed, k: 0, n: {} };
    if (baseU != null) this.book.q = this.queue.filter((e) => !(e.s == null && (e.u | 0) <= baseU));
    for (const e of this.queue) if (e.s == null) { e.s = sid; e.k = ++this.session.k; }
    this.drops.clear();
  }
  // Ohne Buch (Server noch nicht eingerichtet): Warteschlange klein halten
  trimUnsent(max) { const q = this.queue; if (q.length > max) q.splice(0, q.length - max); }
  close() { this.session = null; this.drops.clear(); }
  get ready() { return !!this.session; }

  // Der Server hat Einträge bis k der Sitzung sid übernommen
  confirm(sid, k) {
    const q = this.queue;
    const keep = q.filter((e) => !(e.s === sid && e.k <= k));
    if (keep.length !== q.length) this.book.q = keep;
  }

  // Spielstand neu geladen (anderer Charakter, Cloud-Stand): Würfelfolge der Sitzung bleibt, Beutezettel nicht
  reset() { this.drops.clear(); }

  #record(type, payload, result, before, ach0, cur) {
    const st = this.state;
    const d = diffValues(before, valuesOfSlices(st.slices));
    const a = rewardedKeys(st).filter((id) => !ach0.includes(id));
    const r = cur?.r ?? [];
    const failed = result && typeof result === 'object' && result.ok === false;
    if (type === 'loot:reset') this.drops.clear();
    if (!r.length && !a.length && isZero(d) && (failed || !ROLE.has(type))) return null;
    if (failed && type === 'loot:claim') return null;
    const book = this.book;
    book.u = (book.u | 0) + 1;
    const e = { u: book.u, s: this.session?.sid ?? null, k: 0, t: type, p: cleanPayload(payload), now: Math.floor(this.now()) };
    if (e.s) e.k = ++this.session.k;
    if (!isZero(d)) e.d = { ...(d.xp ? { x: d.xp } : {}), ...(d.gold ? { g: d.gold } : {}), ...(Object.keys(d.items).length ? { i: d.items } : {}) };
    if (r.length) e.r = r;
    if (a.length) e.a = a;
    const z = st.slices.world?.zoneId;
    if (z) e.z = z;
    if (type === 'loot:roll') {
      const drops = Array.isArray(result?.drops) ? result.drops : [];
      e.res = { drops: drops.map((x) => (x.gold ? { g: x.gold } : { it: x.itemId, q: x.qty ?? 1, ...(x.auto ? { auto: 1 } : {}) })) };
      const n = r.find((x) => x[0] === 'loot')?.[1];
      if (e.s && n) drops.forEach((x, i) => { if (x.dropId) this.drops.set(x.dropId, `${e.s}:${n}:${i}`); });
    } else if (type === 'loot:claim') {
      const key = this.drops.get(payload?.dropId);
      if (key) { e.p.key = key; this.drops.delete(payload.dropId); }
      if (result?.sold) e.res = { sold: 1 };
    } else if (type === 'daily:login' && result?.quiet) e.res = { quiet: 1 };
    else if (type === 'mail:loot' && Array.isArray(payload?.drops)) e.p.drops = payload.drops.slice(0, 60).map((x) => ({ itemId: x.itemId, qty: x.qty, gold: x.gold }));
    const q = this.queue;
    q.push(e);
    if (q.length > QUEUE_MAX) q.splice(0, q.length - QUEUE_MAX);
    return e;
  }
}
