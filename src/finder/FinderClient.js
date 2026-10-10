import { FINDER_VERSION, FINDER_PATH } from './protocol.js';
import { wsBase } from '../platform.js';

// Verbindung zur Gruppensuche auf dem Server (Durable Object DungeonFinder, worker/finder/queue.js).
// Nur offen, solange gesucht wird. Ereignisse: on(type, fn) für 'status' und alle Servertypen aus protocol.js.
//   status: 'off' | 'connecting' | 'online' | 'failed'
// 'failed' heißt: Server nicht erreichbar oder keine Anmeldung -> FinderService sucht dann ohne Server weiter
// (dieselbe Gruppenbildung, nur ohne andere Spieler).
const CONNECT_TIMEOUT_MS = 6000;

export class FinderClient {
  constructor({ getToken, base = defaultBase(), WebSocketImpl = globalThis.WebSocket }) {
    this.getToken = getToken;
    this.base = base;
    this.WS = WebSocketImpl;
    this.listeners = new Map();
    this.ws = null;
    this.status = 'off';
    this.gen = 0;
  }

  on(type, fn) {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(fn);
    return () => set.delete(fn);
  }
  #emit(type, data) { for (const fn of this.listeners.get(type) ?? []) { try { fn(data); } catch (e) { console.error(e); } } }
  #setStatus(s) { if (this.status !== s) { this.status = s; this.#emit('status', { status: s }); } }

  // Suche starten: { char, dungeonId, role }
  async start(req) {
    this.stop();
    const gen = ++this.gen;
    this.#setStatus('connecting');
    if (!this.base || !this.WS) { this.#fail(gen, 'unavailable'); return; }
    let token = null;
    try { token = await this.getToken?.(); } catch { token = null; }
    if (gen !== this.gen) return;
    if (!token) { this.#fail(gen, 'auth'); return; }
    let ws;
    try { ws = new this.WS(`${this.base}${FINDER_PATH}`); } catch { this.#fail(gen, 'unavailable'); return; }
    this.ws = ws;
    const timer = setTimeout(() => { if (gen === this.gen && this.status === 'connecting') this.#fail(gen, 'timeout'); }, CONNECT_TIMEOUT_MS);
    ws.onopen = () => {
      if (gen !== this.gen) return;
      ws.send(JSON.stringify({ t: 'hello', v: FINDER_VERSION, token, char: req.char }));
      ws.send(JSON.stringify({ t: 'queue', dungeonId: req.dungeonId, role: req.role }));
    };
    ws.onmessage = (ev) => {
      if (gen !== this.gen) return;
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (!m || typeof m.t !== 'string') return;
      if (m.t === 'queued') { clearTimeout(timer); this.#setStatus('online'); }
      if (m.t === 'bye') { clearTimeout(timer); this.#fail(gen, m.reason ?? 'bye'); return; }
      this.#emit(m.t, m);
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      clearTimeout(timer);
      if (gen !== this.gen) return;
      this.ws = null;
      // Verbindung während der Suche verloren: ohne Server weitersuchen (FinderService entscheidet)
      if (this.status !== 'off') this.#fail(gen, 'closed');
    };
  }

  send(msg) {
    if (this.ws?.readyState !== 1) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  accept(groupId, ok) { return this.send({ t: 'accept', groupId, ok: !!ok }); }

  stop() {
    this.gen++;
    const ws = this.ws;
    this.ws = null;
    if (ws) { try { if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'cancel' })); ws.close(1000, 'bye'); } catch { /* egal */ } }
    this.#setStatus('off');
  }

  #fail(gen, reason) {
    if (gen !== this.gen) return;
    const ws = this.ws;
    this.ws = null;
    if (ws) { try { ws.close(); } catch { /* egal */ } }
    this.gen++;
    this.#setStatus('failed');
    this.#emit('failed', { reason });
  }
}

// Eigene Seite, in der CrazyGames-Fassung www.emberwrath.com (src/platform.js)
function defaultBase() { return wsBase(); }
