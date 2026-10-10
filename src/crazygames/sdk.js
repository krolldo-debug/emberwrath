// Dünne Hülle um das CrazyGames-SDK v3 (https://docs.crazygames.com/sdk/intro/).
// Die Lade-Seite der CrazyGames-Fassung bindet https://sdk.crazygames.com/crazygames-sdk-v3.js ein.
// Fehlt das SDK (blockiert, andere Adresse, Tests) oder meldet es environment 'disabled', geben alle Aufrufe
// still „nichts“ zurück: Das Spiel startet dann als Gast, nur ohne CrazyGames-Konto.
const INIT_TIMEOUT_MS = 4000;

export class CrazySdk {
  constructor(win = globalThis) {
    this.win = win;
    this.sdk = null;
    this.ready = this.#init();
  }

  async #init() {
    const sdk = this.win.CrazyGames?.SDK;
    if (!sdk?.init) return false;
    try {
      // init() kann hängen, wenn die Seite nicht bei CrazyGames läuft: nie länger warten als nötig.
      await Promise.race([sdk.init(), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), INIT_TIMEOUT_MS))]);
    } catch { return false; }
    if (sdk.environment === 'disabled') return false;
    this.sdk = sdk;
    return true;
  }

  get environment() { return this.sdk?.environment ?? 'none'; }

  // Kann der Spieler hier ein CrazyGames-Konto benutzen? (nicht in jeder Einbettung)
  async accountAvailable() {
    if (!(await this.ready)) return false;
    const v = this.sdk.user?.isUserAccountAvailable;
    try { return typeof v === 'function' ? !!(await v.call(this.sdk.user)) : !!v; } catch { return false; }
  }

  // { username, profilePictureUrl } oder null (nicht angemeldet / nicht verfügbar)
  async user() {
    if (!(await this.accountAvailable())) return null;
    try { return (await this.sdk.user.getUser()) ?? null; } catch { return null; }
  }

  // Signiertes Token des angemeldeten CrazyGames-Nutzers (1 h gültig; das SDK erneuert es selbst) oder null.
  async userToken() {
    if (!(await this.user())) return null;
    try { return (await this.sdk.user.getUserToken()) || null; } catch { return null; }
  }

  // Anmelde-Fenster von CrazyGames. -> Nutzer oder null (abgebrochen, nicht verfügbar)
  async login() {
    if (!(await this.accountAvailable())) return null;
    try { return (await this.sdk.user.showAuthPrompt()) ?? null; } catch { return null; }
  }

  // fn(user) nach einer Anmeldung. (Abmelden lädt bei CrazyGames die ganze Seite neu.)
  async onLogin(fn) {
    if (!(await this.ready)) return;
    try { this.sdk.user?.addAuthListener?.(fn); } catch { /* egal */ }
  }

  // Pflicht, sobald das SDK eingebunden ist: Spielbeginn und -ende melden (Basic Launch: gameplayStart).
  async gameplay(on) {
    if (!(await this.ready)) return;
    try { if (on) this.sdk.game?.gameplayStart?.(); else this.sdk.game?.gameplayStop?.(); } catch { /* egal */ }
  }

  async loadingStop() {
    if (!(await this.ready)) return;
    try { this.sdk.game?.loadingStop?.(); } catch { /* egal */ }
  }
}

// Inhalt eines CrazyGames-Tokens lesen (ohne Prüfung; geprüft wird auf dem Server, worker/crazygames.js).
export function tokenUserId(token) {
  try {
    const p = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof p.userId === 'string' || typeof p.userId === 'number' ? String(p.userId) : null;
  } catch { return null; }
}
