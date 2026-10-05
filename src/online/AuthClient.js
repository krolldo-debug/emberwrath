// Schlanker Client für Supabase Auth (GoTrue) und die Datenbank-API (PostgREST), ohne Fremdbibliothek.
// Nutzt nur fetch und crypto.subtle; läuft deshalb im Bundle von tools/build.mjs und unter der strengen CSP.
//
// Sitzung (Zugriffs- + Erneuerungstoken) liegt in localStorage unter 'emberwrath:online:session' – bewusst NICHT unter
// dem Präfix 'emberfall:v1:', damit Tokens nie in einer exportierten Sicherungsdatei landen.
// Anmeldungen über Links (E-Mail-Bestätigung, Passwort vergessen, Google) laufen per PKCE:
// Der Browser merkt sich ein Geheimnis (code_verifier), die Rückleitung bringt ?code=…, das gegen eine Sitzung getauscht wird.
const SESSION_KEY = 'emberwrath:online:session';
const PKCE_KEY = 'emberwrath:online:pkce';

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

async function pkcePair() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  return { verifier, challenge: b64url(digest) };
}

function safeStorage() {
  try { const s = window.localStorage; s.getItem(SESSION_KEY); return s; } catch { return null; }
}

export class AuthClient {
  // opts: { url, anonKey, storage?, fetch?, location? }
  constructor({ url, anonKey, storage = safeStorage(), fetch: f = (...a) => fetch(...a), location: loc = window.location }) {
    this.url = (url ?? '').replace(/\/+$/, '');
    this.anonKey = anonKey ?? '';
    this.storage = storage;
    this.fetch = f;
    this.location = loc;
    this.session = null;
    this.listeners = new Set();
    this.#refreshing = null;
    this.session = this.#readSession();
  }

  #refreshing;

  get configured() { return !!(this.url && this.anonKey); }
  get user() { return this.session?.user ?? null; }

  // fn(event, session) mit event 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'USER_UPDATED' | 'PASSWORD_RECOVERY'
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
    this.#emit(event);
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
      body: { email, password, data: { ...meta, display_name: displayName }, code_challenge: challenge, code_challenge_method: 's256' },
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
  async signInWithProvider(provider, intent = 'oauth') {
    if (!this.configured) throw new AuthError('not_configured', MESSAGES.not_configured);
    const { verifier, challenge } = await pkcePair();
    this.#savePkce(verifier, intent);
    const q = new URLSearchParams({ provider, redirect_to: this.redirectUrl(), code_challenge: challenge, code_challenge_method: 's256' });
    this.location.assign(`${this.url}/auth/v1/authorize?${q}`);
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
  async getAccessToken() {
    if (!this.session) throw new AuthError('session_not_found', MESSAGES.session_not_found, 401);
    if (this.session.expires_at - 60 > Date.now() / 1000) return this.session.access_token;
    this.#refreshing ??= this.#refresh().finally(() => { this.#refreshing = null; });
    return (await this.#refreshing).access_token;
  }

  async #refresh() {
    const rt = this.session?.refresh_token;
    try {
      const d = await this.#request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: rt } });
      const session = this.#fromTokenResponse(d);
      this.#store(session, 'TOKEN_REFRESHED');
      return session;
    } catch (e) {
      // Nur bei abgelehntem Token abmelden; ohne Netz bleibt die Sitzung für später erhalten.
      // Zu viele Anfragen (429, z. B. viele Spieler hinter einer Adresse) ist kein abgelehntes Token.
      if (e.code !== 'network' && e.status >= 400 && e.status < 500 && e.status !== 429 && e.status !== 408) this.#store(null, 'SIGNED_OUT');
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
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    const code = url.searchParams.get('code');
    const err = url.searchParams.get('error_description') ?? hash.get('error_description');
    const errCode = url.searchParams.get('error_code') ?? hash.get('error_code') ?? url.searchParams.get('error') ?? hash.get('error');
    if (!code && !errCode && !err) return null;
    const pkce = this.#readPkce();
    const intent = pkce?.intent ?? null;
    for (const k of ['code', 'error', 'error_code', 'error_description', 'type']) url.searchParams.delete(k);
    const cleanHash = errCode || err ? '' : url.hash;
    try { window.history.replaceState(null, '', `${url.pathname}${url.search}${cleanHash}`); } catch { /* egal */ }
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
      this.#clearPkce();
      return { intent, error: e };
    }
  }

  // ---------------------------------------------------------------- Datenbank
  // PostgREST: rest('/characters?select=id', { method, body, prefer })
  async rest(path, { method = 'GET', body, prefer, keepalive = false } = {}) {
    const token = await this.getAccessToken();
    return this.#request(`/rest/v1${path}`, { method, body, token, keepalive, headers: prefer ? { Prefer: prefer } : {} });
  }
  rpc(fn, args = {}) { return this.rest(`/rpc/${fn}`, { method: 'POST', body: args }); }
}
