import { NET_VERSION, NET_PATH, PING_MS, PONG_TIMEOUT_MS, MAX_WORLDS } from './protocol.js';

// Eine WebSocket-Verbindung zu genau einem Shard (Zone × Welt), mit Wiederverbinden.
//
//   join(zoneId, world|'auto')   Zone betreten (schließt eine bestehende Verbindung)
//   leave()                      trennen (Dungeon-Instanz, Spiel verlassen)
//   switchWorld(n)               in derselben Zone die Welt wechseln
//   send(msg)                    Nachricht an den Shard (nur wenn verbunden)
//   status                       'off' | 'connecting' | 'online' | 'retry' | 'unavailable' | 'replaced' | 'auth' | 'version'
//   zone, world, cap, selfId     aktueller Shard
//   on(type, fn)                 'status' und alle Servertypen (welcome, join, leave, u, look, chat, resync, full, bye)
//
// hello() liefert die Daten der ersten Nachricht ({ char, look, s }); getToken() ein gültiges Zugriffstoken.
const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000, 30000];

export class NetClient {
  constructor({ getToken, hello, base = defaultBase(), WebSocketImpl = globalThis.WebSocket }) {
    this.getToken = getToken;
    this.hello = hello;
    this.base = base;
    this.WS = WebSocketImpl;
    this.listeners = new Map();
    this.ws = null;
    this.status = 'off';
    this.zone = null; this.world = null; this.cap = 0; this.selfId = null;
    this.wantWorld = 'auto';
    this.exclude = [];
    this.attempt = 0;
    this.retryTimer = null;
    this.pingTimer = null;
    this.pongTimer = null;
    this.gen = 0; // jede neue Verbindung erhöht; Ereignisse alter Sockets werden verworfen
    this.authRetried = false;
  }

  on(type, fn) {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(fn);
    return () => set.delete(fn);
  }
  #emit(type, data) { for (const fn of this.listeners.get(type) ?? []) { try { fn(data); } catch (e) { console.error(e); } } }

  #setStatus(s) {
    if (this.status === s) return;
    this.status = s;
    this.#emit('status', { status: s, zone: this.zone, world: this.world, cap: this.cap });
  }

  get online() { return this.status === 'online'; }

  join(zoneId, world = 'auto') {
    this.#teardown();
    this.zone = zoneId;
    this.world = null; this.selfId = null;
    this.wantWorld = world;
    this.exclude = [];
    this.attempt = 0;
    this.authRetried = false;
    if (!this.base) { this.#setStatus('unavailable'); return; }
    this.#connect();
  }

  switchWorld(n) {
    if (!this.zone || n === this.world) return;
    this.join(this.zone, n);
  }

  leave() {
    this.#teardown();
    this.zone = null; this.world = null; this.selfId = null;
    this.#setStatus('off');
  }

  send(msg) {
    if (this.status !== 'online' || this.ws?.readyState !== 1) return false;
    try { this.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); return true; } catch { return false; }
  }

  // ------------------------------------------------------------------ intern
  async #connect() {
    const gen = ++this.gen;
    this.#setStatus(this.attempt ? 'retry' : 'connecting');
    let token;
    try { token = await this.getToken(); } catch (e) {
      // Ohne Netz (z. B. Laptop aufgeweckt, WLAN noch nicht da) ist das kein Anmeldeproblem: später erneut versuchen.
      if (gen === this.gen && e?.code === 'network') { this.#scheduleRetry(gen); return; }
      token = null;
    }
    if (gen !== this.gen) return;
    if (!token) { this.#setStatus('auth'); return; }
    const q = new URLSearchParams({ zone: this.zone, world: String(this.wantWorld ?? 'auto') });
    if (this.exclude.length) q.set('exclude', this.exclude.join(','));
    let ws;
    try { ws = new this.WS(`${this.base}${NET_PATH}/ws?${q}`); } catch { this.#scheduleRetry(gen); return; }
    this.ws = ws;
    ws.onopen = () => {
      if (gen !== this.gen) return;
      const h = this.hello?.() ?? {};
      ws.send(JSON.stringify({ t: 'hello', v: NET_VERSION, token, zone: this.zone, world: this.wantWorld, ...h }));
    };
    ws.onmessage = (ev) => { if (gen === this.gen) this.#onMessage(ev.data); };
    ws.onclose = () => { if (gen === this.gen) this.#onClose(gen); };
    ws.onerror = () => {};
  }

  #onMessage(raw) {
    if (raw === 'pong') { clearTimeout(this.pongTimer); this.pongTimer = null; return; }
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    switch (m.t) {
      case 'welcome':
        this.world = m.world; this.cap = m.cap; this.selfId = m.id;
        this.wantWorld = m.world; // beim Wiederverbinden dieselbe Welt
        this.exclude = [];
        this.attempt = 0;
        this.authRetried = false;
        this.#startPing();
        this.status = 'online';
        this.#emit('welcome', m);
        this.#emit('status', { status: 'online', zone: this.zone, world: this.world, cap: this.cap });
        return;
      case 'full':
        // Welt voll: nächste freie Welt anfragen (Verbindung schließt der Server).
        if (Number.isInteger(m.world) && !this.exclude.includes(m.world)) this.exclude.push(m.world);
        if (this.exclude.length >= MAX_WORLDS) this.exclude = [];
        this.wantWorld = 'auto';
        this.fullPending = true;
        this.#emit('full', m);
        return;
      case 'bye':
        this.byeReason = m.reason;
        this.#emit('bye', m);
        return;
      default:
        this.#emit(m.t, m);
    }
  }

  #onClose(gen) {
    this.#stopPing();
    this.ws = null;
    const reason = this.byeReason; this.byeReason = null;
    const wasOnline = this.status === 'online';
    if (wasOnline) this.#emit('disconnected', {});
    if (reason === 'replaced') { this.#setStatus('replaced'); return; }
    if (reason === 'version') { this.#setStatus('version'); return; }
    if (reason === 'auth') {
      // Token vielleicht gerade abgelaufen: einmal mit frischem Token versuchen.
      if (this.authRetried) { this.#setStatus('auth'); return; }
      this.authRetried = true;
    }
    // Welt war voll: sofort die nächste. Nur direkt nach „voll“, sonst (Netz weg) normal mit Wartezeit.
    const full = this.fullPending; this.fullPending = false;
    if (full && !wasOnline) { this.#connect(); return; }
    this.#scheduleRetry(gen);
  }

  #scheduleRetry(gen) {
    if (gen !== this.gen || !this.zone) return;
    const wait = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)] * (0.8 + Math.random() * 0.4);
    this.attempt++;
    this.#setStatus('retry');
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => { if (gen === this.gen) this.#connect(); }, wait);
  }

  #startPing() {
    this.#stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState !== 1) return;
      try { this.ws.send('ping'); } catch { return; }
      clearTimeout(this.pongTimer);
      this.pongTimer = setTimeout(() => { try { this.ws?.close(); } catch { /* egal */ } }, PONG_TIMEOUT_MS);
    }, PING_MS);
  }
  #stopPing() { clearInterval(this.pingTimer); clearTimeout(this.pongTimer); this.pingTimer = this.pongTimer = null; }

  #teardown() {
    this.gen++;
    clearTimeout(this.retryTimer); this.retryTimer = null;
    this.#stopPing();
    const ws = this.ws; this.ws = null;
    if (ws) { ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null; try { ws.close(1000, 'leave'); } catch { /* egal */ } }
    if (this.status === 'online') this.#emit('disconnected', {});
  }
}

// ws(s)://<eigene Seite>; ohne http(s) (Datei, eingebettete Vorschau) gibt es keinen Welt-Server.
function defaultBase() {
  const loc = globalThis.location;
  if (!loc || !/^https?:$/.test(loc.protocol) || !loc.host) return null;
  return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}`;
}
