import { DurableObject } from 'cloudflare:workers';
import { verifyToken } from '../auth.js';
import { ONLINE_CONFIG } from '../../src/online/config.js';
import { FinderHub } from './hub.js';

// Durable Object der Dungeonsuche: eine Instanz ('main') für alle Dungeons, damit die Warteschlange echt ist.
// Die Logik steckt in hub.js (Matchmaker aus src/finder/matchmaker.js), hier nur Verbindungen und Takt.
//
// Kosten: Verbindungen bestehen nur während der Suche (einige Sekunden bis wenige Minuten). Solange jemand sucht,
// läuft ein Sekundentakt; ohne Suchende gibt es keinen Takt und das Objekt wird entladen. Deshalb bewusst ohne
// WebSocket-Hibernation (die Suche braucht den Takt ohnehin). Gratis-Tarif: siehe src/finder/README.md.
const TICK_MS = 1000;

export class DungeonFinder extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.hub = new FinderHub({
      humanGroups: env.FINDER_HUMAN_GROUPS === 'true',
      verify: (token) => verifyToken(token, {
        supabaseUrl: env.SUPABASE_URL || ONLINE_CONFIG.supabaseUrl,
        anonKey: env.SUPABASE_ANON_KEY || ONLINE_CONFIG.supabaseAnonKey,
      }),
    });
    this.timer = null;
  }

  // Nur vom Worker (worker/index.js) aufgerufen: WebSocket-Upgrade
  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket erwartet', { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();
    this.hub.open(server);
    server.addEventListener('message', (ev) => { this.hub.message(server, ev.data).catch(() => {}); });
    server.addEventListener('close', () => { this.hub.close(server); this.#pace(); });
    server.addEventListener('error', () => { this.hub.close(server); this.#pace(); });
    this.#pace();
    return new Response(null, { status: 101, webSocket: client });
  }

  // Takt nur, solange Verbindungen offen sind
  #pace() {
    if (this.hub.size && !this.timer) {
      this.timer = setInterval(() => { try { this.hub.tick(); } catch (e) { console.error(e); } this.#pace(); }, TICK_MS);
    } else if (!this.hub.size && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
