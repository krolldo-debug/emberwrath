import { DurableObject } from 'cloudflare:workers';
import { verifyToken } from '../auth.js';
import { ONLINE_CONFIG } from '../../src/online/config.js';
import { ArenaHub } from './hub.js';

// Durable Object der Glutarena: eine Instanz ('main') für Suche, Kämpfe und Wertung (src/pvp/README.md).
// Die Logik steckt in hub.js; hier nur Verbindungen, Takt, Speicher und die öffentliche Bestenliste.
//
// Speicher: Wertungen, Tageszähler und Bestenliste im Speicher des Objekts (SQLite, im Gratis-Tarif enthalten).
// Keine Datenbank-Migration nötig. Name, Stufe, Klasse und Volk liest der Server aus dem gespeicherten Charakter
// (Supabase, Secret SUPABASE_SERVICE_ROLE_KEY wie der Welt-Server). Ist der Charakter dort nicht zu finden, gibt es
// keinen Zutritt (Wertungen sind öffentlich); fehlt das Secret, gelten die Angaben des Clients.
//
// Kosten: Takt (250 ms) nur, solange jemand verbunden ist oder ein Kampf läuft; sonst wird das Objekt entladen.
// Im Kampf sendet jeder Spieler etwa 8 Zustände je Sekunde, eingehende Nachrichten zählen 20:1 als Anfrage.
const TICK_MS = 250;
const PER_IP = 4, TOTAL_MAX = 2000;

export class PvpArena extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    const storage = ctx.storage;
    this.hub = new ArenaHub({
      verify: (token) => verifyToken(token, {
        supabaseUrl: env.SUPABASE_URL || ONLINE_CONFIG.supabaseUrl,
        anonKey: env.SUPABASE_ANON_KEY || ONLINE_CONFIG.supabaseAnonKey,
      }),
      profile: (uid, charId) => loadArenaChar(env, uid, charId),
      store: { get: (k) => storage.get(k), put: (k, v) => storage.put(k, v) },
    });
    this.timer = null;
    this.ips = new Map(); // socket -> Adresse
  }

  // Vom Worker (worker/index.js): WebSocket-Upgrade oder GET /top
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/top')) {
      return new Response(JSON.stringify({ list: await this.hub.publicTop() }), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=30' } });
    }
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket erwartet', { status: 426 });
    const ip = request.headers.get('CF-Connecting-IP') ?? '';
    if (this.hub.conns.size >= TOTAL_MAX) return new Response('Gerade zu viele Verbindungen', { status: 503 });
    if (ip) {
      let open = 0;
      for (const [sock, v] of this.ips) {
        const c = this.hub.conns.get(sock);
        if (!c) this.ips.delete(sock); else if (v === ip && !c.uid) open++;
      }
      if (open >= PER_IP) return new Response('Zu viele Verbindungen', { status: 429 });
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();
    this.hub.open(server);
    this.ips.set(server, ip);
    server.addEventListener('message', (ev) => { this.hub.message(server, ev.data).catch((e) => console.error('pvp', e?.message)); });
    const gone = () => { this.hub.close(server).catch(() => {}); this.ips.delete(server); this.#pace(); };
    server.addEventListener('close', gone);
    server.addEventListener('error', gone);
    this.#pace();
    return new Response(null, { status: 101, webSocket: client });
  }

  #pace() {
    if (this.hub.size && !this.timer) {
      this.timer = setInterval(() => { this.hub.tick().catch((e) => console.error(e)).finally(() => this.#pace()); }, TICK_MS);
    } else if (!this.hub.size && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

// Gespeicherter Charakter -> { name, level, classId, raceId } | null (nicht gefunden, Fehler) | undefined (kein Secret) (wie worker/moderation.js loadCharacter, mit Klasse und Volk)
async function loadArenaChar(env, uid, charId) {
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!key) return undefined; // ohne Secret (Entwicklung): Angaben des Clients
  if (!/^[0-9a-f-]{36}$/i.test(uid) || !/^[A-Za-z0-9_-]{1,64}$/.test(String(charId ?? ''))) return null;
  const base = String(env.SUPABASE_URL || ONLINE_CONFIG.supabaseUrl).replace(/\/$/, '');
  try {
    const r = await fetch(`${base}/rest/v1/characters?user_id=eq.${uid}&id=eq.${encodeURIComponent(charId)}&select=name,level,class_id,race_id&limit=1`, {
      headers: { apikey: key, ...(key.startsWith('eyJ') ? { authorization: `Bearer ${key}` } : {}) },
    });
    if (!r.ok) return null;
    const row = (await r.json())?.[0];
    return row ? { name: String(row.name ?? ''), level: Number(row.level) || 1, classId: row.class_id ?? null, raceId: row.race_id ?? null } : null;
  } catch { return null; }
}
