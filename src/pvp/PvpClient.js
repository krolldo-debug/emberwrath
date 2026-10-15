import { PVP_VERSION, PVP_PATH } from './protocol.js';

// Verbindung zur Glutarena (Durable Object PvpArena, worker/pvp/arena.js). Offen ab der Suche bis nach dem Kampf.
// on(type, fn) für 'status' ({ status: 'off'|'connecting'|'online'|'failed' }), 'failed' ({ reason }) und alle
// Servertypen aus protocol.js. Nachrichten vor 'welcome' werden gepuffert.
const CONNECT_TIMEOUT_MS = 7000;

export class PvpClient {
  constructor({ getToken, base = defaultBase(), WebSocketImpl = globalThis.WebSocket }) {
    this.getToken = getToken;
    this.base = base;
    this.WS = WebSocketImpl;
    this.listeners = new Map();
    this.ws = null;
    this.status = 'off';
    this.gen = 0;
    this.outbox = [];
  }

  on(type, fn) {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(fn);
    return () => set.delete(fn);
  }
  #emit(type, data) { for (const fn of this.listeners.get(type) ?? []) { try { fn(data); } catch (e) { console.error(e); } } }
  #setStatus(s) { if (this.status !== s) { this.status = s; this.#emit('status', { status: s }); } }

  get online() { return this.status === 'online' && this.ws?.readyState === 1; }

  // Verbinden (falls nicht schon verbunden). hello = { char, look }
  async connect(hello) {
    if (this.status === 'online' || this.status === 'connecting') return;
    const gen = ++this.gen;
    this.#setStatus('connecting');
    if (!this.base || !this.WS) { this.#fail(gen, 'unavailable'); return; }
    let token = null;
    try { token = await this.getToken?.(); } catch { token = null; }
    if (gen !== this.gen) return;
    if (!token) { this.#fail(gen, 'auth'); return; }
    let ws;
    try { ws = new this.WS(`${this.base}${PVP_PATH}`); } catch { this.#fail(gen, 'unavailable'); return; }
    this.ws = ws;
    const timer = setTimeout(() => { if (gen === this.gen && this.status === 'connecting') this.#fail(gen, 'timeout'); }, CONNECT_TIMEOUT_MS);
    ws.onopen = () => {
      if (gen !== this.gen) return;
      ws.send(JSON.stringify({ t: 'hello', v: PVP_VERSION, token, char: hello.char, look: hello.look }));
    };
    ws.onmessage = (ev) => {
      if (gen !== this.gen) return;
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (!m || typeof m.t !== 'string') return;
      if (m.t === 'welcome') {
        clearTimeout(timer);
        this.#setStatus('online');
        this.#emit('welcome', m);
        for (const x of this.outbox.splice(0)) ws.send(JSON.stringify(x));
        return;
      }
      if (m.t === 'bye') { clearTimeout(timer); this.#fail(gen, m.reason ?? 'bye'); return; }
      this.#emit(m.t, m);
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      clearTimeout(timer);
      if (gen !== this.gen) return;
      this.ws = null;
      if (this.status !== 'off') this.#fail(gen, 'closed');
    };
  }

  // Senden; vor 'welcome' (kurze Verbindungsphase) gepuffert
  send(msg) {
    if (this.online) { this.ws.send(JSON.stringify(msg)); return true; }
    if (this.status === 'connecting' && this.outbox.length < 8) { this.outbox.push(msg); return true; }
    return false;
  }

  close() {
    this.gen++;
    const ws = this.ws;
    this.ws = null;
    this.outbox = [];
    if (ws) { try { ws.close(1000, 'bye'); } catch { /* egal */ } }
    this.#setStatus('off');
  }

  #fail(gen, reason) {
    if (gen !== this.gen) return;
    const ws = this.ws;
    this.ws = null;
    this.outbox = [];
    if (ws) { try { ws.close(); } catch { /* egal */ } }
    this.gen++;
    this.#setStatus('failed');
    this.#emit('failed', { reason });
  }
}

function defaultBase() {
  const loc = globalThis.location;
  if (!loc || !/^https?:$/.test(loc.protocol) || !loc.host) return null;
  return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}`;
}
