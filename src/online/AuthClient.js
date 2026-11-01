// Schlanker Client für Supabase Auth (GoTrue) und die Datenbank-API (PostgREST), ohne Fremdbibliothek.
// Nutzt nur fetch und crypto.subtle; läuft deshalb im Bundle von tools/build.mjs und unter der strengen CSP.
//
// Sitzung (Zugriffs- + Erneuerungstoken) liegt in localStorage unter 'emberwrath:online:session' – bewusst NICHT unter
// dem Präfix 'emberfall:v1:', damit Tokens nie in einer exportierten Sicherungsdatei landen.
// Anmeldungen über Links (E-Mail-Bestätigung, Passwort vergessen, Google) laufen per PKCE:
// Der Browser merkt sich ein Geheimnis (code_verifier), die Rückleitung bringt ?code=…, das gegen eine Sitzung getauscht wird.
// Apple liefert ein ID-Token (in der App aus Apples Anmeldefenster, auf der Website über /net/auth/apple, worker/appleAuth.js),
// das Supabase gegen eine Sitzung tauscht (grant_type=id_token, mit Nonce gegen Wiederverwendung).
//
// Angemeldet bleiben: Das Zugriffstoken gilt eine Stunde, das Erneuerungstoken unbegrenzt, wird aber bei jeder Erneuerung
// ersetzt. Geht die Antwort einer Erneuerung verloren (App wird mitten darin in den Hintergrund geschickt), lehnt der Server
// das alte Token später ab. Deshalb: rechtzeitig erneuern, solange die Seite sichtbar ist (ensureFresh), im Hintergrund nur
// wenn unvermeidbar, und vor dem Abmelden nach einem neueren Token suchen (anderer Tab, Schlüsselbund der App: vault).
const SESSION_KEY = 'emberwrath:online:session';
const PKCE_KEY = 'emberwrath:online:pkce';
const APPLE_KEY = 'emberwrath:online:apple';
const APPLE_AUTHORIZE = 'https://appleid.apple.com/auth/authorize';

export class AuthError extends Error {
  constructor(code, message, status = 0) { super(message); this.code = code; this.status = status; }
}

// Verständliche deutsche Meldungen für die häufigsten Fehler des Dienstes.
const MESSAGES = {
  invalid_credentials: 'E-Mail oder Passwort stimmt nicht.',
  email_not_confirmed: 'Bitte bestätige zuerst deine E-Mail-Adresse über den Link, den wir dir geschickt haben.',
  user_already_exists: 'Zu dieser E-Mail gibt es schon ein Konto. Melde dich an oder setze dein Passwort zurück.',
  email_exists: 'Zu dieser E-Mail gibt es schon ein Konto. Melde dich an oder setze dein Passwort zurück.',
  weak_password: 'Das Passwort ist zu schwach. Nimm mindestens 8 Zeichen mit Buchstaben und Zahlen.',
  email_address_not_authorized: 'An diese Adresse darf der Server noch keine E-Mails schicken. Solange kein eigener Mailversand eingerichtet ist, geht das nur an die E-Mail deines Supabase-Kontos.',
  email_address_invalid: 'Diese E-Mail-Adresse wird nicht akzeptiert.',
  validation_failed: 'Bitte prüfe deine Eingaben.',
  signup_disabled: 'Neue Registrierungen sind gerade abgeschaltet.',
  over_email_send_rate_limit: 'Es wurden gerade zu viele E-Mails verschickt. Bitte versuche es in ein paar Minuten erneut.',
  over_request_rate_limit: 'Zu viele Versuche. Bitte warte einen Moment.',
  same_password: 'Das neue Passwort muss sich vom alten unterscheiden.',
  flow_state_not_found: 'Der Link ist abgelaufen oder wurde in einem anderen Browser geöffnet. Bitte melde dich direkt an.',
  flow_state_expired: 'Der Link ist abgelaufen. Bitte fordere einen neuen an.',
  bad_code_verifier: 'Der Link wurde in einem anderen Browser geöffnet. Öffne ihn dort, wo du ihn angefordert hast, oder melde dich direkt an.',
  otp_expired: 'Der Link ist abgelaufen oder wurde schon benutzt. Bitte fordere einen neuen an.',
  provider_disabled: 'Diese Anmeldeart ist noch nicht freigeschaltet.',
  session_not_found: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.',
  apple_state: 'Die Anmeldung mit Apple ist abgelaufen. Bitte versuche es erneut.',
  reauth_other: 'Das war ein anderes Konto. Bitte bestätige mit dem Konto, das du löschen willst.',
  refresh_token_not_found: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.',
  network: 'Keine Verbindung zum Server. Prüfe deine Internetverbindung.',
  not_configured: 'Online-Konten sind noch nicht eingerichtet.',
  access_denied: 'Die Anmeldung wurde abgebrochen.',
  redirect_failed: 'Die Anmeldung hat nicht geklappt. Bitte versuche es erneut.',
  reauth_required: 'Bitte bestätige das Löschen noch einmal mit deiner Anmeldung.',
  reauthentication_needed: 'Bitte melde dich zur Sicherheit neu an und ändere danach dein Passwort.',
};
export function describeError(e) {
  if (e instanceof AuthError) return MESSAGES[e.code] ?? e.message ?? 'Unbekannter Fehler.';
  return MESSAGES.network;
}

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

// Nonce für Apple: Apple bekommt den SHA-256-Wert (Hex), Supabase den Klartext und vergleicht beide.
export async function noncePair() {
  const raw = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const hashed = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))));
  return { raw, hashed };
}

const hidden = () => globalThis.document?.visibilityState === 'hidden';

async function pkcePair() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  return { verifier, challenge: b64url(digest) };
}

function safeStorage() {
  try { const s = window.localStorage; s.getItem(SESSION_KEY); return s; } catch { return null; }
}

export class AuthClient {
  // opts: { url, anonKey, storage?, fetch?, location?, vault?, webAuth? }
  //   vault    zweiter, dauerhafter Ablageort der Sitzung ({ load(): Promise<session|null>, save(session), clear() }),
  //            in der App der Schlüsselbund (src/app/auth.js)
  //   webAuth  (url) => Promise<Rückleitungs-URL>: Anbieter-Anmeldung in eigenem Fenster statt Seitenwechsel (App)
  //   webAuthRedirect  Rückleitungsadresse für webAuth
  constructor({ url, anonKey, storage = safeStorage(), fetch: f = (...a) => fetch(...a), location: loc = window.location, vault = null, webAuth = null, webAuthRedirect = null }) {
    this.url = (url ?? '').replace(/\/+$/, '');
    this.anonKey = anonKey ?? '';
    this.storage = storage;
    this.fetch = f;
    this.location = loc;
    this.vault = vault;
    this.webAuth = webAuth;
    this.webAuthRedirect = webAuthRedirect;
    this.session = null;
    this.listeners = new Set();
    this.#refreshing = null;
    this.session = this.#readSession();
  }

  #refreshing;

  get configured() { return !!(this.url && this.anonKey); }
  get user() { return this.session?.user ?? null; }

  // fn(event, session) mit event 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'USER_UPDATED' | 'PASSWORD_RECOVERY' | 'SESSION_RESTORED'
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  #emit(event) { for (const fn of this.listeners) { try { fn(event, this.session); } catch (e) { console.error(e); } } }

  // Adresse, auf die Anbieter und E-Mail-Links zurückleiten: die aktuelle Seite ohne Abfrage/Anker (z. B. …/spielen/).
  redirectUrl(extra = '') { return `${this.location.origin}${this.location.pathname}${extra}`; }

  // ---------------------------------------------------------------- Speicherung der Sitzung
  #readSession() {
    try { const raw = this.storage?.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
  }
  #store(session, event) {
    this.session = session;
    try {
      if (session) this.storage?.setItem(SESSION_KEY, JSON.stringify(session));
      else this.storage?.removeItem(SESSION_KEY);
    } catch { /* Speicher gesperrt: Sitzung gilt nur bis zum Neuladen */ }
    if (session) this.vault?.save(session); else this.vault?.clear();
    this.#emit(event);
  }

  // Beim Start (App): Sitzung aus dem Tresor übernehmen, wenn der Speicher der Seite leer ist oder ein älteres Token hält.
  // Umgekehrt landet eine vorhandene Sitzung im Tresor (erster Start nach dem Update auf App 1.1).
  async restore() {
    if (!this.vault) return;
    const saved = await this.vault.load();
    const was = this.session?.user?.id ?? null;
    if (saved?.refresh_token && saved.user && (!this.session || (saved.expires_at ?? 0) > (this.session.expires_at ?? 0))) {
      this.session = saved;
      try { this.storage?.setItem(SESSION_KEY, JSON.stringify(saved)); } catch { /* egal */ }
      this.#emit(was === saved.user.id ? 'TOKEN_REFRESHED' : 'SESSION_RESTORED'); // keine frische Anmeldung (Konto löschen)
    } else if (this.session && saved?.refresh_token !== this.session.refresh_token) this.vault.save(this.session);
  }
  // Anmeldung oder Abmeldung in einem anderen Tab übernehmen.
  syncFromStorage() {
    const next = this.#readSession();
    const was = this.session?.user?.id ?? null;
    this.session = next;
    const now = next?.user?.id ?? null;
    if (was !== now) this.#emit(now ? 'SIGNED_IN' : 'SIGNED_OUT');
  }

  #fromTokenResponse(d) {
    if (!d?.access_token) return null;
    const expiresAt = d.expires_at ?? Math.floor(Date.now() / 1000) + (d.expires_in ?? 3600);
    return { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: expiresAt, user: d.user ?? null };
  }

  // ---------------------------------------------------------------- HTTP
  async #request(path, { method = 'GET', body, token, headers = {}, keepalive = false } = {}) {
    if (!this.configured) throw new AuthError('not_configured', MESSAGES.not_configured);
    let res;
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    try {
      res = await this.fetch(`${this.url}${path}`, {
        method,
        headers: {
          apikey: this.anonKey,
          // Nur mit Nutzer-Token; ohne Token bestimmt der apikey die Rolle (neue sb_publishable_-Schlüssel sind kein JWT).
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body: payload,
        // keepalive: Anfrage überlebt das Schließen des Tabs; Browser erlauben das nur für kleine Körper (64 KB gesamt).
        ...(keepalive && (payload?.length ?? 0) < 60_000 ? { keepalive: true } : {}),
      });
    } catch { throw new AuthError('network', MESSAGES.network); }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const code = data?.error_code ?? data?.code ?? (res.status === 429 ? 'over_request_rate_limit' : data?.error) ?? `http_${res.status}`;
      const msg = data?.msg ?? data?.message ?? data?.error_description ?? `Fehler ${res.status}`;
      throw new AuthError(String(code), msg, res.status);
    }
    return data;
  }

  // ---------------------------------------------------------------- Anmeldung
  async signUp(email, password, displayName, meta = {}) {
    const { verifier, challenge } = await pkcePair();
    this.#savePkce(verifier, 'signup');
    const d = await this.#request(`/auth/v1/signup?redirect_to=${encodeURIComponent(this.redirectUrl())}`, {
      method: 'POST',
      body: { email, password, data: { ...meta, display_name: displayName, lang: document.documentElement.lang === 'de' ? 'de' : 'en' }, code_challenge: challenge, code_challenge_method: 's256' },
    });
    const session = this.#fromTokenResponse(d);
    if (session) { this.#clearPkce(); this.#store(session, 'SIGNED_IN'); return { session, needsConfirmation: false }; }
    return { session: null, needsConfirmation: true };
  }

  async signIn(email, password) {
    const d = await this.#request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
    const session = this.#fromTokenResponse(d);
    this.#store(session, 'SIGNED_IN');
    return session;
  }

  // Öffentliche Auth-Einstellungen des Projekts: welche Anmeldearten in Supabase aktiv sind
  // ({ external: { email, google, … } }). So schalten sich die Knöpfe frei, sobald der Anbieter
  // im Dashboard eingerichtet ist, ohne neue Version.
  async fetchSettings() {
    if (!this.configured) return null;
    return this.#request('/auth/v1/settings');
  }

  // Leitet zu Google weiter. Zurück kommt der Browser mit ?code=… auf dieselbe Seite (handleRedirect()).
  // intent 'reauth': erneute Anmeldung als Bestätigung (z. B. vor dem Löschen des Kontos)
  // Mit webAuth (App): Anmeldung im eigenen Fenster, danach sofort angemeldet → { intent, session }.
  async signInWithProvider(provider, intent = 'oauth') {
    if (!this.configured) throw new AuthError('not_configured', MESSAGES.not_configured);
    const { verifier, challenge } = await pkcePair();
    this.#savePkce(verifier, intent);
    const redirect = this.webAuth ? this.webAuthRedirect : this.redirectUrl();
    const q = new URLSearchParams({ provider, redirect_to: redirect, code_challenge: challenge, code_challenge_method: 's256' });
    if (!this.webAuth) { this.location.assign(`${this.url}/auth/v1/authorize?${q}`); return null; }
    const back = await this.webAuth(`${this.url}/auth/v1/authorize?${q}`);
    const result = await this.#fromRedirect(new URL(back));
    if (!result) throw new AuthError('redirect_failed', MESSAGES.redirect_failed);
    if (result.error) throw result.error;
    return result;
  }

  // ID-Token eines Anbieters (Apple) gegen eine Sitzung tauschen. nonce = Klartext (Apple bekam den SHA-256-Wert).
  async signInWithIdToken(provider, idToken, nonce) {
    const d = await this.#request('/auth/v1/token?grant_type=id_token', { method: 'POST', body: { provider, id_token: idToken, nonce } });
    const session = this.#fromTokenResponse(d);
    this.#store(session, 'SIGNED_IN');
    return session;
  }

  // Website: weiter zu Apple. Apple schickt das Ergebnis per POST an redirectUri (worker/appleAuth.js), der Worker leitet
  // mit #apple_id_token=… auf das Spiel zurück (handleRedirect). Nonce und state bleiben bis dahin in diesem Browser.
  async signInWithAppleWeb({ clientId, redirectUri }, intent = 'oauth') {
    const { raw, hashed } = await noncePair();
    const state = b64url(crypto.getRandomValues(new Uint8Array(18)));
    try { this.storage?.setItem(APPLE_KEY, JSON.stringify({ nonce: raw, state, intent, at: Date.now() })); } catch { /* egal */ }
    const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code id_token', scope: 'name email', response_mode: 'form_post', state, nonce: hashed });
    this.location.assign(`${APPLE_AUTHORIZE}?${q}`);
  }

  async requestPasswordReset(email) {
    const { verifier, challenge } = await pkcePair();
    this.#savePkce(verifier, 'recovery');
    await this.#request(`/auth/v1/recover?redirect_to=${encodeURIComponent(this.redirectUrl())}`, {
      method: 'POST', body: { email, code_challenge: challenge, code_challenge_method: 's256' },
    });
  }

  async updateUser(attrs) {
    const token = await this.getAccessToken();
    const user = await this.#request('/auth/v1/user', { method: 'PUT', body: attrs, token });
    this.#store({ ...this.session, user }, 'USER_UPDATED');
    return user;
  }

  async signOut() {
    const token = this.session?.access_token;
    this.#store(null, 'SIGNED_OUT');
    if (token) { try { await this.#request('/auth/v1/logout?scope=local', { method: 'POST', token }); } catch { /* lokal ist abgemeldet */ } }
  }

  // Gültiges Zugriffstoken; erneuert es rechtzeitig (eine Erneuerung gleichzeitig).
  // Im Hintergrund wird nur erneuert, wenn das Token wirklich abläuft: dort friert iOS die Seite oft mitten in der Anfrage ein.
  async getAccessToken() {
    if (!this.session) throw new AuthError('session_not_found', MESSAGES.session_not_found, 401);
    const left = this.session.expires_at - Date.now() / 1000;
    if (left > 60 || (left > 10 && hidden())) return this.session.access_token;
    return (await this.#refreshOnce()).access_token;
  }

  // Erneuert vorab, wenn das Token in weniger als marginS Sekunden abläuft (nur bei sichtbarer Seite aufrufen).
  async ensureFresh(marginS = 600) {
    if (!this.session || this.session.expires_at - marginS > Date.now() / 1000) return;
    try { await this.#refreshOnce(); } catch { /* ohne Netz: später erneut */ }
  }

  #refreshOnce() {
    this.#refreshing ??= this.#refresh().finally(() => { this.#refreshing = null; });
    return this.#refreshing;
  }

  async #refresh(retried = false) {
    const rt = this.session?.refresh_token;
    try {
      const d = await this.#request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: rt } });
      const session = this.#fromTokenResponse(d);
      this.#store(session, 'TOKEN_REFRESHED');
      return session;
    } catch (e) {
      // Nur bei abgelehntem Token abmelden; ohne Netz bleibt die Sitzung für später erhalten.
      // Zu viele Anfragen (429, z. B. viele Spieler hinter einer Adresse) ist kein abgelehntes Token.
      if (e.code !== 'network' && e.status >= 400 && e.status < 500 && e.status !== 429 && e.status !== 408) {
        // Vorher nach einem neueren Token suchen: ein anderer Tab oder der Schlüsselbund der App hat es vielleicht schon.
        if (!retried) {
          const newer = [this.#readSession(), await this.vault?.load().catch(() => null)]
            .find((c) => c?.refresh_token && c.refresh_token !== rt && c.user?.id === this.session?.user?.id);
          if (newer) { this.session = newer; return this.#refresh(true); }
        }
        this.#store(null, 'SIGNED_OUT');
      }
      throw e;
    }
  }

  // Frisches Nutzerobjekt vom Server (z. B. nach Bestätigung der E-Mail).
  async fetchUser() {
    const token = await this.getAccessToken();
    const user = await this.#request('/auth/v1/user', { token });
    this.#store({ ...this.session, user }, 'USER_UPDATED');
    return user;
  }

  // ---------------------------------------------------------------- Rückleitung (?code=… bzw. #error=…)
  #savePkce(verifier, intent) { try { this.storage?.setItem(PKCE_KEY, JSON.stringify({ verifier, intent, at: Date.now() })); } catch { /* egal */ } }
  #clearPkce() { try { this.storage?.removeItem(PKCE_KEY); } catch { /* egal */ } }
  #readPkce() { try { return JSON.parse(this.storage?.getItem(PKCE_KEY) ?? 'null'); } catch { return null; } }

  // Wertet eine Rückleitung aus und entfernt die Parameter aus der Adresszeile.
  // -> null (keine Rückleitung) | { intent: 'signup'|'recovery'|'oauth'|'reauth'|null, session } | { intent, error }
  async handleRedirect() {
    const url = new URL(this.location.href);
    const apple = await this.#fromAppleRedirect(url);
    if (apple) return apple;
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    const errCode = url.searchParams.get('error_code') ?? hash.get('error_code') ?? url.searchParams.get('error') ?? hash.get('error');
    const pending = url.searchParams.get('code') || errCode || url.searchParams.get('error_description') || hash.get('error_description');
    if (pending) {
      const clean = new URL(url);
      for (const k of ['code', 'error', 'error_code', 'error_description', 'type']) clean.searchParams.delete(k);
      try { window.history.replaceState(null, '', `${clean.pathname}${clean.search}${errCode ? '' : clean.hash}`); } catch { /* egal */ }
    }
    return this.#fromRedirect(url);
  }

  // Rückleitung (Adresse der Seite oder, in der App, aus dem Anmeldefenster) gegen eine Sitzung tauschen.
  async #fromRedirect(url) {
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    const code = url.searchParams.get('code');
    const err = url.searchParams.get('error_description') ?? hash.get('error_description');
    const errCode = url.searchParams.get('error_code') ?? hash.get('error_code') ?? url.searchParams.get('error') ?? hash.get('error');
    if (!code && !errCode && !err) return null;
    const pkce = this.#readPkce();
    const intent = pkce?.intent ?? null;
    // Fehler aus der Adresse: nur bekannte Codes mit eigenem Text zeigen, nie den Text aus der URL (sonst lässt sich
    // über einen präparierten Link beliebiger Text ins Anmeldefenster schreiben). Die gespeicherte PKCE-Anfrage bleibt
    // erhalten, damit ein fremder Fehler-Link einen noch offenen Bestätigungslink nicht unbrauchbar macht.
    if (!code) {
      const known = Object.hasOwn(MESSAGES, errCode ?? '') ? errCode : 'redirect_failed';
      return { intent, error: new AuthError(known, MESSAGES[known]) };
    }
    if (!pkce?.verifier) return { intent, error: new AuthError('bad_code_verifier', MESSAGES.bad_code_verifier) };
    try {
      const d = await this.#request('/auth/v1/token?grant_type=pkce', { method: 'POST', body: { auth_code: code, code_verifier: pkce.verifier } });
      const session = this.#fromTokenResponse(d);
      this.#clearPkce();
      this.#store(session, intent === 'recovery' ? 'PASSWORD_RECOVERY' : 'SIGNED_IN');
      return { intent, session };
    } catch (e) {
      // Gespeicherte Anfrage behalten: ein fremder Link mit erfundenem ?code= soll einen noch offenen
      // Bestätigungs- oder Rücksetz-Link nicht unbrauchbar machen (der Code ist ohnehin aus der Adresse entfernt).
      return { intent, error: e };
    }
  }

  // Website: Rückkehr von Apple über den Worker (#apple_id_token=…&state=… bzw. #apple_error=…).
  async #fromAppleRedirect(url) {
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    const token = hash.get('apple_id_token'), failed = hash.get('apple_error');
    if (!token && !failed) return null;
    try { window.history.replaceState(null, '', `${url.pathname}${url.search}`); } catch { /* egal */ }
    let saved = null;
    try { saved = JSON.parse(this.storage?.getItem(APPLE_KEY) ?? 'null'); } catch { /* egal */ }
    const intent = saved?.intent ?? null;
    if (failed) return { intent, error: new AuthError(failed === 'user_cancelled_authorize' ? 'access_denied' : 'redirect_failed', failed === 'user_cancelled_authorize' ? MESSAGES.access_denied : MESSAGES.redirect_failed) };
    // state schützt davor, dass ein fremder Link eine Anmeldung unterschiebt
    if (!saved?.nonce || saved.state !== hash.get('state')) return { intent, error: new AuthError('apple_state', MESSAGES.apple_state) };
    try { this.storage?.removeItem(APPLE_KEY); } catch { /* egal */ }
    try {
      const session = await this.signInWithIdToken('apple', token, saved.nonce);
      return { intent, session, name: hash.get('name') ?? '' };
    } catch (e) { return { intent, error: e }; }
  }

  // ---------------------------------------------------------------- Datenbank
  // PostgREST: rest('/characters?select=id', { method, body, prefer })
  async rest(path, { method = 'GET', body, prefer, keepalive = false } = {}) {
    const token = await this.getAccessToken();
    return this.#request(`/rest/v1${path}`, { method, body, token, keepalive, headers: prefer ? { Prefer: prefer } : {} });
  }
  rpc(fn, args = {}) { return this.rest(`/rpc/${fn}`, { method: 'POST', body: args }); }
}
