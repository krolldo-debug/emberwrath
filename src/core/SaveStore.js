// Lokale Speicherung (localStorage). Demo-Accounts sind reine Profile auf
// DIESEM Gerät: kein Passwort, keine Verschlüsselung, keine Synchronisierung.
//
// Schlüssel:
//   emberfall:v1:index              { accounts: [{ id, name, createdAt }], last: { accountId, characterId } }
//   emberfall:v1:acc:<accountId>    { characters: { [characterId]: snapshot } }
// snapshot = GameState.snapshot() plus summary { name, raceId, classId, level, zoneId }.
const PREFIX = 'emberfall:v1:';

export class SaveStore {
  constructor(storage = SaveStore.#detect()) {
    this.storage = storage;
    this.persistent = storage !== SaveStore.memory;
  }

  static memory = (() => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null }; })();

  static #detect() {
    try {
      const s = window.localStorage;
      const k = `${PREFIX}probe`;
      s.setItem(k, '1'); s.removeItem(k);
      return s;
    } catch { return SaveStore.memory; }
  }

  #read(key, fallback) {
    try { const raw = this.storage.getItem(PREFIX + key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
  }
  #write(key, value) {
    try { this.storage.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch { return false; }
  }

  #index() { return this.#read('index', { accounts: [], last: null }); }

  // --- Accounts
  listAccounts() { return this.#index().accounts; }
  getAccount(id) { return this.listAccounts().find((a) => a.id === id) ?? null; }
  createAccount(name) {
    const idx = this.#index();
    const acc = { id: `acc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: String(name).trim().slice(0, 24), createdAt: Date.now() };
    idx.accounts.push(acc);
    this.#write('index', idx);
    this.#write(`acc:${acc.id}`, { characters: {} });
    return acc;
  }
  deleteAccount(id) {
    const idx = this.#index();
    idx.accounts = idx.accounts.filter((a) => a.id !== id);
    if (idx.last?.accountId === id) idx.last = null;
    this.#write('index', idx);
    try { this.storage.removeItem(`${PREFIX}acc:${id}`); } catch { /* egal */ }
  }

  // --- Charaktere (Spielstände)
  listCharacters(accountId) {
    const data = this.#read(`acc:${accountId}`, { characters: {} });
    return Object.entries(data.characters).map(([id, s]) => ({ id, ...s.summary, savedAt: s.meta?.savedAt ?? 0 }))
      .sort((a, b) => b.savedAt - a.savedAt);
  }
  loadCharacter(accountId, characterId) {
    return this.#read(`acc:${accountId}`, { characters: {} }).characters[characterId] ?? null;
  }
  saveCharacter(accountId, characterId, snapshot, summary) {
    const data = this.#read(`acc:${accountId}`, { characters: {} });
    data.characters[characterId] = { ...snapshot, summary };
    const ok = this.#write(`acc:${accountId}`, data);
    if (ok) this.setLast(accountId, characterId);
    if (ok) this.bus?.emit('save:character', { accountId, characterId });
    return ok;
  }
  // opts.fromSync: Löschung kommt vom Server-Abgleich (kein erneuter Upload).
  deleteCharacter(accountId, characterId, opts = {}) {
    const data = this.#read(`acc:${accountId}`, { characters: {} });
    delete data.characters[characterId];
    this.#write(`acc:${accountId}`, data);
    this.bus?.emit('save:deleted', { accountId, characterId, fromSync: !!opts.fromSync });
  }

  // --- Dauerhaftigkeit und Sicherung
  // Bittet den Browser, den Speicher dieser Seite nicht bei Platzmangel zu räumen
  // (auf einer eigenen Domain wirksam; im Artifact/Iframe meist ohne Wirkung).
  async requestPersistence() {
    try { return this.persistent && !!(await navigator.storage?.persist?.()); } catch { return false; }
  }

  // Alle Emberfall-Daten dieses Geräts als JSON-Objekt (Accounts, Charaktere, Speicherplätze, Einstellungen).
  exportAll() {
    const entries = {};
    try {
      for (let i = 0; i < this.storage.length; i++) {
        const k = this.storage.key(i);
        if (k?.startsWith(PREFIX)) entries[k.slice(PREFIX.length)] = JSON.parse(this.storage.getItem(k));
      }
    } catch { /* Speicher nicht lesbar: leere Sicherung */ }
    return { format: 'emberfall-save', version: 1, exportedAt: new Date().toISOString(), entries };
  }

  // Spielt eine Sicherung ein. Vorhandene Accounts/Charaktere bleiben, gleiche IDs werden überschrieben.
  // Liefert { ok, accounts, characters } oder { ok: false, reason }.
  importAll(data) {
    if (!data || data.format !== 'emberfall-save' || typeof data.entries !== 'object') return { ok: false, reason: 'format' };
    const e = data.entries;
    const idx = this.#index();
    let accounts = 0, characters = 0;
    for (const acc of e.index?.accounts ?? []) {
      if (!acc?.id || typeof acc.id !== 'string') continue;
      if (!idx.accounts.some((a) => a.id === acc.id)) { idx.accounts.push({ id: acc.id, name: String(acc.name ?? 'Account').slice(0, 24), createdAt: acc.createdAt ?? Date.now() }); accounts++; }
    }
    for (const [key, value] of Object.entries(e)) {
      if (key === 'index' || key === 'probe' || /[^\w:.-]/.test(key)) continue;
      if (key.startsWith('acc:')) {
        const cur = this.#read(key, { characters: {} });
        const chars = value?.characters ?? {};
        characters += Object.keys(chars).length;
        if (!this.#write(key, { ...cur, characters: { ...cur.characters, ...chars } })) return { ok: false, reason: 'full' };
      } else if (!this.#write(key, value)) return { ok: false, reason: 'full' };
    }
    if (!idx.last && e.index?.last) idx.last = e.index.last;
    this.#write('index', idx);
    return { ok: true, accounts, characters };
  }

  // --- "Fortsetzen"
  setLast(accountId, characterId) { const idx = this.#index(); idx.last = { accountId, characterId }; this.#write('index', idx); }
  getLast() {
    const last = this.#index().last;
    if (!last?.characterId || !this.loadCharacter(last.accountId, last.characterId)) return null;
    return last;
  }
}
