import { EV } from '../core/events.js';
import { ONLINE_CONFIG } from './config.js';
import { AuthClient, describeError } from './AuthClient.js';
import { CloudSync, accountIdFor, displayNameOf, ONLINE_ACCOUNT_PREFIX } from './CloudSync.js';
import { LoginScene } from './LoginScene.js';
import { AdminScene } from './AdminScene.js';

// Online-Konten (Supabase): Anmeldung, Cloud-Spielstände, Admin-Übersicht. Siehe docs/ONLINE.md.
//
// game.online (für andere Bereiche):
//   configured           true, wenn src/online/config.js ausgefüllt ist
//   user                 angemeldeter Nutzer oder null   ({ id, email, user_metadata, … })
//   displayName          Anzeigename des Kontos
//   accountId            lokale Account-ID des Kontos ('sb_<id>') oder null
//   syncStatus           'idle' | 'syncing' | 'ok' | 'offline' | 'error'
//   isAdmin()            Promise<boolean>, fragt den Server (Recht steckt in der Datenbank, nicht im Client)
//   open(mode)           Anmeldeseite öffnen: 'login' | 'register' | 'account'
//   play()               mit dem Online-Konto zur Charakterliste
//   isOnlineAccount(id)  gehört eine lokale Account-ID zu einem Online-Konto?
// Szenen: 'login' { mode }, 'admin'.
// Bus-Event EV.ONLINE_CHANGED ('online:changed') { user, status } bei An-/Abmeldung und Sync-Status.
// Adressen: …#anmelden, …#registrieren, …#konto, …#admin öffnen die jeweilige Seite (Startseite verlinkt dorthin).
const ROUTES = { anmelden: ['login', { mode: 'login' }], registrieren: ['login', { mode: 'register' }], konto: ['login', { mode: 'account' }], admin: ['admin', {}] };

export class Online {
  constructor(game, config = ONLINE_CONFIG) {
    this.game = game;
    this.config = config;
    this.client = new AuthClient({ url: config.supabaseUrl, anonKey: config.supabaseAnonKey });
    this.sync = new CloudSync(this.client, game.save, { onStatus: () => this.#changed() });
    this.notice = null; // einmalige Meldung für die Anmeldeseite { kind, text }
    this.#admin = null;
    this.client.onChange((event) => {
      if (event === 'SIGNED_OUT') { this.#admin = null; this.sync.stop(); }
      if (event === 'SIGNED_IN') this.#admin = null;
      this.#changed();
    });
  }

  #admin;
  #providers = null;
  #providersLoad = null;

  get configured() { return this.client.configured; }
  get user() { return this.client.user; }
  get displayName() { return displayNameOf(this.user); }
  get accountId() { return this.user ? accountIdFor(this.user.id) : null; }
  get syncStatus() { return this.sync.status; }
  // Aktive Schnellanmeldungen: Server-Einstellung (sobald geladen), sonst config.providers.
  get providers() { return this.#providers ?? this.config.providers ?? {}; }

  // Fragt einmal beim Server nach, welche Anbieter aktiv sind. Promise<{ google }>.
  loadProviders() {
    this.#providersLoad ??= this.client.fetchSettings()
      .then((s) => {
        const ext = s?.external;
        if (ext && typeof ext === 'object') this.#providers = { google: ext.google === true };
        return this.providers;
      })
      .catch(() => { this.#providersLoad = null; return this.providers; });
    return this.#providersLoad;
  }
  isOnlineAccount(id) { return typeof id === 'string' && id.startsWith(ONLINE_ACCOUNT_PREFIX); }

  #changed() { this.game.bus.emit(EV.ONLINE_CHANGED, { user: this.user, status: this.sync.status }); }

  isAdmin() {
    if (!this.user || !this.configured) return Promise.resolve(false);
    // Nur ein „ja“ wird gemerkt; ein „nein“ wird beim nächsten Mal neu erfragt (Recht kann nachträglich vergeben werden).
    this.#admin ??= this.client.rpc('is_admin').then((r) => { if (r !== true) this.#admin = null; return r === true; })
      .catch(() => { this.#admin = null; return false; });
    return this.#admin;
  }

  open(mode = this.user ? 'account' : 'login') { this.game.scenes.go('login', { mode }); }

  // Mit dem Online-Konto spielen: lokalen Zwischenspeicher-Account einloggen, dann Charakterliste.
  play() {
    if (!this.user) { this.open('login'); return; }
    this.sync.ensureLocalAccount(this.user);
    this.game.login(this.accountId);
    this.game.scenes.go('characters', { from: 'login' });
  }

  // Nach erfolgreicher Anmeldung (Formular oder Rückleitung).
  async afterSignIn() {
    if (!this.user) return;
    this.sync.ensureLocalAccount(this.user);
    try { await this.sync.start(this.user); } catch { /* Status zeigt es an; lokal spielbar */ }
  }

  async signOut() {
    let flushed = true;
    try { await this.sync.flush(); } catch { flushed = false; }
    const accId = this.accountId;
    const removed = flushed && this.sync.forgetLocal();
    if (this.game.account?.id === accId) this.game.logout();
    await this.client.signOut();
    return { removedLocalCopy: removed };
  }

  // Konto endgültig löschen (Server löscht Konto + Charaktere), danach lokale Kopie entfernen.
  async deleteAccount() {
    await this.client.rpc('delete_my_account');
    const accId = this.accountId, uid = this.user?.id;
    this.sync.stop();
    if (this.game.account?.id === accId) this.game.logout();
    this.game.save.deleteAccount(accId);
    try { this.game.save.storage.removeItem(`emberwrath:online:sync:${uid}`); } catch { /* egal */ }
    await this.client.signOut();
  }

  // Bereits übernommene lokale Charaktere ('<accountId>:<characterId>'), damit sie nicht erneut angeboten werden.
  copiedLocal() {
    try { return JSON.parse(this.game.save.storage.getItem(`emberwrath:online:copied:${this.user?.id}`) ?? '[]'); } catch { return []; }
  }

  // Eigenen lokalen Charakter (Demo-Account) als Kopie ins Online-Konto übernehmen.
  copyLocalCharacter(fromAccountId, characterId) {
    const save = this.game.save;
    const rec = save.loadCharacter(fromAccountId, characterId);
    if (!rec || !this.user) return null;
    const accId = this.sync.ensureLocalAccount(this.user);
    const { summary, ...snap } = JSON.parse(JSON.stringify(rec));
    const newId = `chr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    snap.meta = { ...snap.meta, accountId: accId, characterId: newId, savedAt: Date.now() };
    if (!save.saveCharacter(accId, newId, snap, summary)) return null;
    const copied = this.copiedLocal();
    copied.push(`${fromAccountId}:${characterId}`);
    try { save.storage.setItem(`emberwrath:online:copied:${this.user.id}`, JSON.stringify(copied)); } catch { /* egal */ }
    return newId;
  }

  // Beim Start: gespeicherte Sitzung fortsetzen, Rückleitungen auswerten, Adress-Anker öffnen.
  async boot() {
    if (!this.configured) { this.#route(); return; }
    let result = null;
    try { result = await this.client.handleRedirect(); } catch (e) { result = { error: e }; }
    if (result?.error) {
      this.notice = { kind: 'error', text: describeError(result.error) };
      this.game.scenes.go('login', { mode: result.intent === 'recovery' ? 'forgot' : 'login' });
      return;
    }
    if (result?.session) {
      if (result.intent === 'recovery') { this.game.scenes.go('login', { mode: 'newPassword' }); this.afterSignIn(); return; }
      this.notice = { kind: 'ok', text: result.intent === 'signup' ? 'E-Mail bestätigt. Willkommen in Emberwrath!' : `Angemeldet als ${this.displayName}.` };
      this.game.scenes.go('login', { mode: 'account' });
      this.afterSignIn();
      return;
    }
    if (this.user) this.afterSignIn();
    this.#route();
  }

  #route() {
    const key = decodeURIComponent(window.location.hash.replace(/^#/, '')).toLowerCase();
    const r = ROUTES[key];
    if (!r) return;
    try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* egal */ }
    this.game.scenes.go(r[0], r[1]);
  }
  routeFromHash() { this.#route(); }
}

export function installOnline(game) {
  const online = new Online(game);
  game.online = online;
  game.scenes.register('login', (g) => new LoginScene(g));
  game.scenes.register('admin', (g) => new AdminScene(g));

  // Jedes lokale Speichern/Löschen eines Online-Charakters landet in der Upload-Warteschlange
  // (Events von SaveStore; Löschungen aus dem Abgleich tragen fromSync und werden nicht zurückgeschickt).
  game.bus.on(EV.SAVE_CHARACTER, ({ accountId, characterId }) => {
    if (accountId === online.sync.accountId) online.sync.markDirty(characterId);
  });
  game.bus.on(EV.SAVE_DELETED, ({ accountId, characterId, fromSync }) => {
    if (!fromSync && accountId === online.sync.accountId) online.sync.markDeleted(characterId);
  });

  window.addEventListener('online', () => { if (online.user) online.sync.syncAll().catch(() => {}); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') online.sync.flush().catch(() => {}); });
  window.addEventListener('storage', (e) => { if (e.key === 'emberwrath:online:session') online.client.syncFromStorage(); });
  window.addEventListener('hashchange', () => online.routeFromHash());

  // Erst nach game.start('title') auswerten, sonst überschreibt der Titel die Zielseite.
  setTimeout(() => { online.boot(); }, 0);
}
