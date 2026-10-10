import { EV } from '../core/events.js';
import { NET_PATH } from '../net/protocol.js';
import { httpBase } from '../platform.js';
import { LEGAL } from '../online/LoginScene.js';
import { tokenUserId } from './sdk.js';

// Konten der CrazyGames-Fassung. Externe Anmeldungen (E-Mail, Google) sind dort nicht erlaubt; gespielt wird
//   - als Gast: ein zufälliger Gast-Schlüssel im Browser steht für ein eigenes Konto auf unserem Server, oder
//   - mit dem CrazyGames-Konto: das signierte Token aus dem SDK steht für ein Konto, das an die CrazyGames-ID gebunden ist.
// Der Welt-Server (POST /net/cg/session, worker/crazygames.js) prüft Schlüssel bzw. Token, legt das Konto bei Bedarf an
// und gibt die Zugangsdaten zurück; angemeldet wird ganz normal bei Supabase. Cloud-Spielstände, Welten, Chat und
// Dungeonsuche funktionieren damit wie auf der Website.
// Meldet sich ein Gast später bei CrazyGames an und gibt es zu diesem CrazyGames-Konto noch keins bei uns, wird
// das Gastkonto übernommen (gleiche Helden, gleiche ID).
const GUEST_KEY = 'emberwrath:cg:guest';

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export class CrazySession {
  constructor(game, sdk, { fetch: f = (...a) => fetch(...a), storage = safeStorage() } = {}) {
    this.game = game;
    this.sdk = sdk;
    this.fetch = f;
    this.storage = storage;
    this.busy = null;
  }

  get online() { return this.game.online; }
  // Konto dieser Fassung? { kind: 'cg'|'guest', cgUserId } oder null (fremdes oder kein Konto)
  kindOf(user) {
    const m = user?.user_metadata ?? {};
    if (m.platform !== 'crazygames') return null;
    return m.cg_user_id ? { kind: 'cg', cgUserId: String(m.cg_user_id) } : { kind: 'guest', cgUserId: null };
  }
  get isGuest() { return this.kindOf(this.online.user)?.kind === 'guest'; }

  guestId() {
    let id = null;
    try { id = this.storage?.getItem(GUEST_KEY); } catch { /* gesperrt */ }
    if (typeof id === 'string' && /^[A-Za-z0-9_-]{22,64}$/.test(id)) return id;
    id = b64url(crypto.getRandomValues(new Uint8Array(24)));
    try { this.storage?.setItem(GUEST_KEY, id); } catch { /* gilt nur in dieser Sitzung */ }
    return id;
  }
  // Nach dem Löschen des Kontos: nächster Start ist ein neuer Gast.
  forgetGuest() { try { this.storage?.removeItem(GUEST_KEY); } catch { /* egal */ } }

  // Passt die gespeicherte Anmeldung zum aktuellen CrazyGames-Zustand?
  matches(user, cgToken) {
    const k = this.kindOf(user);
    if (!k) return false;
    if (cgToken) return k.kind === 'cg' && k.cgUserId === tokenUserId(cgToken);
    return k.kind === 'guest';
  }

  // Beim Start: Eine gespeicherte Anmeldung, die nicht mehr passt (anderer CrazyGames-Nutzer, abgemeldet),
  // wird beendet. Neu angemeldet wird erst mit „Spielen“ (dort stimmt der Spieler den Nutzungsbedingungen zu).
  async reconcile() {
    const o = this.online;
    if (!o.user) return;
    const token = await this.sdk.userToken();
    if (!this.matches(o.user, token)) await o.signOut().catch(() => {});
  }

  // Sorgt für eine passende Anmeldung. Mehrfachaufrufe teilen sich einen Durchlauf.
  ensure() {
    this.busy ??= this.#ensure().finally(() => { this.busy = null; });
    return this.busy;
  }

  async #ensure() {
    const o = this.online;
    const token = await this.sdk.userToken();
    if (o.user && this.matches(o.user, token)) return o.user;
    const guest = this.guestId();
    // Gast meldet sich bei CrazyGames an: Gastkonto mitnehmen, wenn es zu dieser CrazyGames-ID noch keins gibt.
    const link = token && this.isGuest ? await o.client.getAccessToken().catch(() => null) : null;
    let creds = await this.#request({ guest, cg: token ?? undefined, link: link ?? undefined });
    if (!creds.linked && o.user) await o.signOut().catch(() => {});
    try { await o.client.signIn(creds.email, creds.password); } catch (e) {
      if (e?.code !== 'invalid_credentials') throw e;
      // Zugang auf dem Server erneuern (z. B. nach einem Schlüsselwechsel) und noch einmal versuchen.
      creds = await this.#request({ guest, cg: token ?? undefined, repair: true });
      await o.client.signIn(creds.email, creds.password);
    }
    await o.afterSignIn();
    return o.user;
  }

  async #request(body) {
    const base = httpBase();
    let res;
    try {
      res = await this.fetch(`${base}${NET_PATH}/cg/session`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
    } catch { throw Object.assign(new Error('network'), { code: 'network' }); }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.email || !data?.password) throw Object.assign(new Error(data?.error ?? `http_${res.status}`), { code: data?.error ?? 'server', status: res.status });
    return data;
  }

  // Frische Anmeldung desselben Kontos (der Server verlangt sie vor dem Löschen, siehe Online.deleteAccount).
  async reauth() {
    const token = await this.sdk.userToken();
    const creds = await this.#request({ guest: this.guestId(), cg: token ?? undefined });
    await this.online.client.signIn(creds.email, creds.password);
  }

  // Zustimmung zu den Nutzungsbedingungen: Der Klick auf „Spielen“ unter dem Hinweis zählt (wie im Hinweis gesagt).
  async consent() {
    const o = this.online;
    if (!o.needsConsent()) return;
    await o.client.updateUser({ data: { terms_version: LEGAL.termsVersion, terms_accepted_at: new Date().toISOString() } });
  }

  // CrazyGames-Anmeldung mitten im Spiel: Gastkonto übernehmen bzw. zum CrazyGames-Konto wechseln.
  async switchAfterLogin() {
    const o = this.online, g = this.game;
    if (!o.user) return; // noch nicht gestartet: „Spielen“ meldet passend an
    const before = o.user.id;
    if (g.scenes.currentId === 'play') g.saveNow('cg-login');
    await o.sync.flush().catch(() => {});
    await this.ensure();
    if (o.user?.id !== before && g.scenes.currentId !== 'title') g.scenes.go('title');
    else g.bus.emit(EV.ONLINE_CHANGED, { user: o.user, status: o.syncStatus });
  }
}

function safeStorage() {
  try { const s = window.localStorage; s.getItem(GUEST_KEY); return s; } catch { return null; }
}
