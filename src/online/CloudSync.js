// Gleicht die Charaktere eines Online-Kontos mit der Cloud (Tabelle public.characters) ab.
//
// Das Spiel selbst speichert weiter über game.save (SaveStore, localStorage). Ein Online-Konto erscheint dort als
// lokaler Account mit der id 'sb_<Nutzer-ID>'; er ist der Zwischenspeicher auf diesem Gerät. CloudSync
//  - lädt nach der Anmeldung alle Charaktere des Kontos herunter (Cloud-Stand gewinnt, wenn ein anderes Gerät seit dem
//    letzten Abgleich hochgeladen hat; der lokale Stand landet dann in einem Speicherplatz, siehe account/backups.js),
//  - lädt nach jedem Speichern den geänderten Charakter hoch (gebündelt, kurz verzögert),
//  - überträgt Löschungen, auch nachträglich, wenn beim Löschen kein Netz da war,
//  - entfernt lokal, was auf einem anderen Gerät gelöscht wurde.
// Warteschlange und Stand je Konto: localStorage 'emberwrath:online:sync:<Nutzer-ID>' (nicht in Sicherungsdateien).
import { stashSnapshot } from '../account/backups.js';

export const ONLINE_ACCOUNT_PREFIX = 'sb_';
export const accountIdFor = (userId) => `${ONLINE_ACCOUNT_PREFIX}${userId}`;
const SYNC_PREFIX = 'emberwrath:online:sync:';
const UPLOAD_DELAY = 2500;

const iso = (ms) => new Date(ms || Date.now()).toISOString();

export class CloudSync {
  // client: AuthClient, save: SaveStore
  // onRemote(ids): Charaktere wurden mit einem neueren Cloud-Stand (anderes Gerät) überschrieben;
  // stashed[id] nennt dann den Speicherplatz, in dem der vorherige Stand dieses Geräts liegt.
  constructor(client, save, { onStatus = () => {}, onRemote = () => {} } = {}) {
    this.client = client;
    this.save = save;
    this.onStatus = onStatus;
    this.onRemote = onRemote;
    this.stashed = {};
    this.userId = null;
    this.status = 'idle'; // idle | syncing | ok | offline | error
    this.lastError = null;
    this.lastSyncAt = 0;
    this.#timer = 0;
    this.#running = null;
  }

  #timer; #running;

  get accountId() { return this.userId ? accountIdFor(this.userId) : null; }

  #key() { return `${SYNC_PREFIX}${this.userId}`; }
  #state() {
    try { const d = JSON.parse(this.save.storage.getItem(this.#key()) ?? 'null'); if (d) return { synced: d.synced ?? {}, sent: d.sent ?? {}, dirty: d.dirty ?? [], deleted: d.deleted ?? [] }; } catch { /* neu */ }
    return { synced: {}, sent: {}, dirty: [], deleted: [] };
  }
  #setState(s) { try { this.save.storage.setItem(this.#key(), JSON.stringify(s)); } catch { /* voll: nächster Abgleich holt es nach */ } }
  #set(status, error = null) { this.status = status; this.lastError = error; this.onStatus(status, error); }

  // Konto aktivieren (nach Anmeldung) und vollständig abgleichen.
  async start(user) {
    this.userId = user.id;
    this.ensureLocalAccount(user);
    return this.syncAll();
  }
  stop() { clearTimeout(this.#timer); this.userId = null; this.#set('idle'); }

  // Lokaler Account für das Online-Konto; Name = Anzeigename bzw. Teil der E-Mail vor dem @.
  ensureLocalAccount(user) {
    const id = accountIdFor(user.id);
    const name = displayNameOf(user);
    if (this.save.getAccount(id)) return id;
    this.save.importAll({
      format: 'emberfall-save', version: 1,
      entries: { index: { accounts: [{ id, name, createdAt: Date.parse(user.created_at) || Date.now() }] }, [`acc:${id}`]: { characters: {} } },
    });
    return id;
  }

  // Aufruf nach jedem lokalen Speichern / Löschen (siehe index.js).
  markDirty(characterId) {
    if (!this.userId) return;
    const s = this.#state();
    if (!s.dirty.includes(characterId)) s.dirty.push(characterId);
    s.deleted = s.deleted.filter((id) => id !== characterId);
    this.#setState(s);
    this.schedule();
  }
  markDeleted(characterId) {
    if (!this.userId) return;
    const s = this.#state();
    s.dirty = s.dirty.filter((id) => id !== characterId);
    if (!s.deleted.includes(characterId)) s.deleted.push(characterId);
    this.#setState(s);
    this.schedule(0);
  }
  schedule(delay = UPLOAD_DELAY) {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => { this.flush().catch(() => {}); }, delay);
  }

  // Ausstehende Uploads und Löschungen senden.
  async flush() {
    if (!this.userId) return;
    if (this.#running) return this.#running.then(() => this.flush());
    this.#running = this.#flush().finally(() => { this.#running = null; });
    return this.#running;
  }

  async #flush() {
    const todo = this.#state();
    if (!todo.dirty.length && !todo.deleted.length) return;
    const acc = this.accountId;
    const doneDeletes = new Set(), uploaded = new Map(), adopted = new Set();
    this.#set('syncing');
    try {
      for (const id of todo.deleted) {
        await this.client.rest(`/characters?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
        doneDeletes.add(id);
      }
      let rows = todo.dirty.map((id) => this.#row(acc, id)).filter(Boolean);
      if (rows.length) {
        // Hat ein anderes Gerät seit unserem letzten Abgleich hochgeladen? Dann gewinnt die Cloud,
        // der Stand dieses Geräts wandert in einen Speicherplatz (sonst überschreibt ein altes Fenster neuen Fortschritt).
        const remote = await this.client.rest(`/characters?select=id,saved_at&id=in.(${rows.map((r) => `"${encodeURIComponent(r.id)}"`).join(',')})`);
        const changed = (remote ?? []).filter((r) => this.#changedElsewhere(todo, r.id, Date.parse(r.saved_at) || 0)).map((r) => r.id);
        if (changed.length) {
          for (const id of await this.#adopt(acc, changed, true)) adopted.add(id);
          rows = rows.filter((r) => !changed.includes(r.id));
        }
      }
      if (rows.length) {
        const st = this.#state();
        st.sent = { ...st.sent };
        for (const r of rows) st.sent[r.id] = Date.parse(r.saved_at);
        this.#setState(st);
        await this.client.rest('/characters?on_conflict=user_id,id', { method: 'POST', body: rows, prefer: 'resolution=merge-duplicates,return=minimal', keepalive: true });
        for (const r of rows) uploaded.set(r.id, Date.parse(r.saved_at));
      }
      this.lastSyncAt = Date.now();
      this.#set('ok');
    } catch (e) {
      this.#set(e?.code === 'network' ? 'offline' : 'error', e);
      if (e?.code === 'network') this.schedule(30_000);
      throw e;
    } finally {
      // Neu Markiertes (während des Sendens gespeichert) bleibt in der Warteschlange.
      const now = this.#state();
      for (const id of doneDeletes) delete now.synced[id];
      for (const [id, at] of uploaded) { now.synced[id] = at; delete now.sent[id]; }
      now.deleted = now.deleted.filter((id) => !doneDeletes.has(id));
      now.dirty = now.dirty.filter((id) => !adopted.has(id) && !(todo.dirty.includes(id) && (!this.save.loadCharacter(acc, id)
        || (uploaded.has(id) && uploaded.get(id) >= (this.save.loadCharacter(acc, id)?.meta?.savedAt ?? 0)))));
      this.#setState(now);
      if (adopted.size) this.onRemote([...adopted]);
    }
  }

  // Wurde der Cloud-Stand seit unserem letzten Abgleich von jemand anderem geschrieben?
  // Vergleich nur mit Zeitstempeln, die selbst aus der Cloud stammen bzw. von uns gesendet wurden (keine Geräteuhren).
  #changedElsewhere(s, id, cloudAt) {
    const base = s.synced[id];
    if (base == null) return false; // unbekannt (erster Abgleich): syncAll entscheidet nach Zeit
    return cloudAt !== base && cloudAt !== s.sent?.[id];
  }

  // Cloud-Stand der Charaktere übernehmen; mit stash bleibt der lokale Stand in einem Speicherplatz erhalten.
  // -> übernommene IDs
  async #adopt(acc, ids, stash) {
    const rows = await this.client.rest(`/characters?select=id,saved_at,snapshot&id=in.(${ids.map((id) => `"${encodeURIComponent(id)}"`).join(',')})`);
    const incoming = {}, at = {};
    for (const r of rows ?? []) {
      if (!r.snapshot?.slices) continue;
      incoming[r.id] = r.snapshot; at[r.id] = Date.parse(r.saved_at) || 0;
      delete this.stashed[r.id];
      if (stash) {
        const local = this.save.loadCharacter(acc, r.id);
        const slot = local ? stashSnapshot(this.save, acc, r.id, local) : null;
        if (slot != null) this.stashed[r.id] = slot;
      }
    }
    const got = Object.keys(incoming);
    if (!got.length) return [];
    const res = this.save.importAll({ format: 'emberfall-save', version: 1, entries: { [`acc:${acc}`]: { characters: incoming } } });
    if (!res.ok) throw Object.assign(new Error('Browser-Speicher voll'), { code: 'storage_full' });
    const s = this.#state();
    for (const id of got) { s.synced[id] = at[id]; delete s.sent[id]; }
    s.dirty = s.dirty.filter((id) => !got.includes(id));
    this.#setState(s);
    return got;
  }

  #row(acc, id) {
    const rec = this.save.loadCharacter(acc, id);
    if (!rec) return null;
    const sum = rec.summary ?? {};
    return {
      user_id: this.userId, id,
      name: String(sum.name ?? '?').slice(0, 40) || '?',
      race_id: sum.raceId ?? null, class_id: sum.classId ?? null,
      level: Math.max(1, Math.min(100, Math.floor(rec.slices?.progress?.level ?? sum.level ?? 1))),
      zone_id: sum.zoneId ?? null,
      snapshot: rec,
      saved_at: iso(rec.meta?.savedAt),
    };
  }

  // Vollständiger Abgleich in beide Richtungen.
  async syncAll() {
    if (!this.userId) return;
    const acc = this.accountId;
    this.#set('syncing');
    try {
      await this.flush().catch(() => {}); // erst ausstehende Löschungen, damit sie nicht zurückkommen
      const remote = await this.client.rest('/characters?select=id,saved_at');
      const s = this.#state();
      const remoteIds = new Set();
      const take = [], conflicts = [];
      for (const r of remote ?? []) {
        remoteIds.add(r.id);
        if (s.deleted.includes(r.id)) continue;
        const cloudAt = Date.parse(r.saved_at) || 0;
        const local = this.save.loadCharacter(acc, r.id);
        const localAt = local?.meta?.savedAt ?? 0;
        if (!local) take.push(r.id);
        else if (this.#changedElsewhere(s, r.id, cloudAt)) (s.dirty.includes(r.id) ? conflicts : take).push(r.id);
        else if (s.synced[r.id] == null && cloudAt > localAt) take.push(r.id);
        else {
          if (localAt > cloudAt && !s.dirty.includes(r.id)) s.dirty.push(r.id);
          s.synced[r.id] = Math.max(cloudAt, s.synced[r.id] ?? 0);
        }
      }
      this.#setState(s);
      const adopted = [...await this.#adopt(acc, take, false), ...await this.#adopt(acc, conflicts, true)];
      const s2 = this.#state();
      for (const c of this.save.listCharacters(acc)) {
        if (remoteIds.has(c.id)) continue;
        const knownAt = s2.synced[c.id];
        if (knownAt && (c.savedAt ?? 0) <= knownAt) {
          // War schon in der Cloud und wurde dort gelöscht (anderes Gerät): lokal entfernen.
          this.save.deleteCharacter(acc, c.id, { fromSync: true });
          delete s2.synced[c.id];
        } else if (!s2.dirty.includes(c.id)) s2.dirty.push(c.id);
      }
      this.#setState(s2);
      if (adopted.length) this.onRemote(adopted);
      await this.flush();
      this.lastSyncAt = Date.now();
      this.#set('ok');
    } catch (e) {
      this.#set(e?.code === 'network' ? 'offline' : 'error', e);
      if (e?.code === 'network') this.schedule(30_000);
      throw e;
    }
  }

  // Beim Abmelden: lokale Kopie entfernen, sofern nichts Ungesendetes mehr darin steckt.
  // -> true, wenn entfernt wurde
  forgetLocal() {
    const s = this.#state();
    if (s.dirty.length || s.deleted.length) return false;
    this.save.deleteAccount(this.accountId);
    try { this.save.storage.removeItem(this.#key()); } catch { /* egal */ }
    return true;
  }
  get pending() { const s = this.#state(); return s.dirty.length + s.deleted.length; }
}

export function displayNameOf(user) {
  const m = user?.user_metadata ?? {};
  const raw = m.display_name || m.full_name || m.name || (user?.email ?? 'Spieler').split('@')[0];
  return String(raw).trim().slice(0, 24) || 'Spieler';
}
