import { DurableObject } from 'cloudflare:workers';
import { verifyToken } from './auth.js';
import { ONLINE_CONFIG } from '../src/online/config.js';
import { filterChat } from '../src/net/chatFilter.js';
import { REPORT_REASONS, saveReport, activeMute } from './moderation.js';
import {
  NET_VERSION, BROADCAST_MS, cleanState, cleanLook, cleanName, cleanChat, cleanLevel, cleanText, REPORT_NOTE_MAX,
} from '../src/net/protocol.js';

// Ein Shard = eine offene Zone in einer Welt ('<zoneId>~<welt>'), ein Durable Object.
// Stufe 1: Der Shard verteilt Position, Animation, Aussehen und Chat der Spieler an alle anderen im selben Shard.
// Gegner, Beute und Kampf rechnet noch jeder Client selbst (Stufe 2: serverseitig, siehe src/net/README.md).
//
// Kosten: WebSocket-Hibernation. Solange niemand etwas sendet (alle stehen), schläft das Objekt und kostet keine
// Laufzeit; 'ping' beantwortet Cloudflare selbst, ohne das Objekt zu wecken.
const HELLO_TIMEOUT_MS = 10_000;
const REPORT_MS = 60_000;
const RATE_PER_S = 30, RATE_BURST = 60, ABUSE_DROPS = 300;
const CHAT_GAP_MS = 1200, CHAT_BURST = 3;
// Moderation: letzte Nachrichten je Spieler als Beleg für Meldungen (nur im Speicher), auch kurz nach dem Verlassen.
const EVIDENCE_MSGS = 10, GONE_KEEP_MS = 10 * 60_000;
const REPORTS_PER_WINDOW = 6, REPORT_WINDOW_MS = 10 * 60_000;
const QUEUE_PREFIX = 'report:';

// Öffentlicher, dauerhafter Schlüssel eines Kontos für „Ignorieren“ (verrät die Konto-ID nicht).
async function ignoreKey(uid) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`emberwrath-ignore:${uid}`));
  return [...new Uint8Array(d).slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class ZoneShard extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.players = new Map(); // WebSocket -> Spieler
    this.dirty = new Set();
    this.flushTimer = null;
    this.seq = 0;
    this.zone = null; this.world = null;
    this.capacity = Number(env.SHARD_CAPACITY) || 40;
    this.gone = new Map(); // id -> { uid, name, msgs, at } gerade gegangene Spieler (Meldung bleibt möglich)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    // Nach dem Aufwachen aus dem Ruhezustand: Spieler aus den Anhängen der offenen Verbindungen wiederherstellen.
    for (const ws of ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (!a) continue;
      if (a.zone) { this.zone = a.zone; this.world = a.world; }
      if (a.id) {
        this.seq = Math.max(this.seq, a.id);
        this.players.set(ws, { ...a, look: null, needLook: true, tokens: RATE_BURST, last: Date.now(), drops: 0, chat: [] });
      } else this.players.set(ws, { pending: true, since: a.since ?? Date.now(), zone: a.zone, world: a.world });
    }
  }

  // Nur vom Worker (worker/index.js) aufgerufen: WebSocket-Upgrade mit ?zone=&world=
  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket erwartet', { status: 426 });
    this.zone ??= url.searchParams.get('zone');
    this.world ??= Number(url.searchParams.get('world'));
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    const since = Date.now();
    server.serializeAttachment({ since, zone: this.zone, world: this.world });
    this.players.set(server, { pending: true, since });
    setTimeout(() => this.#dropStalePending(), HELLO_TIMEOUT_MS + 50);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    const p = this.players.get(ws);
    if (!p || typeof raw !== 'string' || raw.length > 16_384) { this.#close(ws, 1009, 'zu groß'); return; }
    if (!this.#rate(p)) { if (p.drops > ABUSE_DROPS) this.#bye(ws, 'kick'); return; }
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    if (p.pending) { if (m.t === 'hello' && !p.authing) await this.#hello(ws, p, m); return; }
    switch (m.t) {
      case 's': {
        const s = cleanState(m.s);
        if (s) { p.s = s; this.#markDirty(ws); }
        break;
      }
      case 'look': {
        const look = cleanLook(m.look);
        p.level = cleanLevel(m.level ?? p.level);
        if (look) p.look = look;
        p.needLook = false;
        this.#attach(ws, p);
        this.#broadcast({ t: 'look', id: p.id, level: p.level, look: p.look }, ws);
        break;
      }
      case 'chat': {
        const text = cleanChat(m.text);
        const now = Date.now();
        if (!text) break;
        if (p.mute && Date.parse(p.mute.until) > now) { this.#send(ws, { t: 'notice', kind: 'muted', until: p.mute.until, reason: p.mute.reason }); break; }
        p.chat = (p.chat ?? []).filter((t) => now - t < CHAT_GAP_MS * CHAT_BURST);
        if (p.chat.length >= CHAT_BURST) break;
        p.chat.push(now);
        const shown = filterChat(text).text;
        (p.msgs ??= []).push({ text, shown: shown !== text ? shown : undefined, at: now });
        if (p.msgs.length > EVIDENCE_MSGS) p.msgs.shift();
        this.#broadcast({ t: 'chat', id: p.id, name: p.name, text: shown, at: now });
        break;
      }
      case 'report': await this.#reportPlayer(ws, p, m); break;
      default: break; // unbekannte Typen (neuere Clients) ignorieren
    }
  }

  async webSocketClose(ws, code, reason) { this.#remove(ws); this.#close(ws, 1000, 'bye'); }
  async webSocketError(ws) { this.#remove(ws); }

  async alarm() {
    this.#dropStalePending();
    const n = this.#count();
    await this.#report();
    const queued = await this.#flushReports();
    if (n > 0 || queued > 0) await this.ctx.storage.setAlarm(Date.now() + REPORT_MS);
  }

  // Meldung eines Spielers (DSA Art. 16). Der Beleg (letzte Nachrichten) kommt vom Server, nicht vom Client.
  async #reportPlayer(ws, p, m) {
    const now = Date.now();
    const ack = (ok, error) => this.#send(ws, { t: 'reported', id: m.id, ok, error });
    p.reports = (p.reports ?? []).filter((t) => now - t < REPORT_WINDOW_MS);
    if (p.reports.length >= REPORTS_PER_WINDOW) { ack(false, 'rate'); return; }
    if (!REPORT_REASONS.includes(m.reason)) { ack(false, 'reason'); return; }
    let target = null;
    for (const q of this.players.values()) if (!q.pending && q.id === m.id) target = q;
    for (const [id, g] of this.gone) if (now - g.at > GONE_KEEP_MS) this.gone.delete(id);
    target ??= this.gone.get(m.id) ?? null;
    if (!target || target.uid === p.uid) { ack(false, 'target'); return; }
    p.reports.push(now);
    const row = {
      reporter_id: p.uid, reporter_name: p.name, reported_id: target.uid, reported_name: target.name,
      zone: this.zone ?? '', world: this.world ?? 1, reason: m.reason, note: cleanText(m.note, REPORT_NOTE_MAX),
      messages: (target.msgs ?? []).map((x) => ({ text: x.text, ...(x.shown ? { shown: x.shown } : {}), at: new Date(x.at).toISOString() })),
      good_faith: m.goodFaith === true, created_at: new Date(now).toISOString(),
    };
    try { await saveReport(this.env, row); } catch {
      // Später erneut senden (Alarm); bis dahin im Speicher des Shards
      await this.ctx.storage.put(`${QUEUE_PREFIX}${now}-${p.id}`, row);
      if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + REPORT_MS);
    }
    ack(true);
  }

  async #flushReports() {
    const queued = await this.ctx.storage.list({ prefix: QUEUE_PREFIX, limit: 50 });
    let left = queued.size;
    for (const [key, row] of queued) {
      try { await saveReport(this.env, row); await this.ctx.storage.delete(key); left--; } catch { break; }
    }
    return left;
  }

  // ------------------------------------------------------------------ intern
  async #hello(ws, p, m) {
    if (m.v !== NET_VERSION) { this.#bye(ws, 'version'); this.players.delete(ws); this.#report(); return; }
    p.authing = true;
    const user = await verifyToken(m.token, {
      supabaseUrl: this.env.SUPABASE_URL || ONLINE_CONFIG.supabaseUrl,
      anonKey: this.env.SUPABASE_ANON_KEY || ONLINE_CONFIG.supabaseAnonKey,
    });
    if (!this.players.has(ws)) return; // inzwischen getrennt
    if (!user) { this.#bye(ws, 'auth'); this.players.delete(ws); this.#report(); return; }
    // Dasselbe Konto verbindet sich neu (Neuladen, zweiter Tab): alte Verbindung ersetzen.
    for (const [other, q] of this.players) if (other !== ws && !q.pending && q.uid === user.uid) { this.#bye(other, 'replaced'); this.#remove(other); }
    if (this.#count() >= this.capacity) { this.#send(ws, { t: 'full', zone: this.zone, world: this.world }); this.#close(ws, 4001, 'full'); this.players.delete(ws); this.#report(); return; }

    const ch = m.char && typeof m.char === 'object' ? m.char : {};
    const [k, mute] = await Promise.all([ignoreKey(user.uid), activeMute(this.env, user.uid)]);
    if (!this.players.has(ws)) return;
    const player = {
      id: ++this.seq, uid: user.uid, k, mute, msgs: [], name: cleanName(ch.name), level: cleanLevel(ch.level),
      look: cleanLook(m.look), s: cleanState(m.s) ?? [0, 0, 1, 'idle', 0, 0, 0],
      zone: this.zone, world: this.world,
      tokens: RATE_BURST, last: Date.now(), drops: 0, chat: [],
    };
    this.players.set(ws, player);
    this.#attach(ws, player);
    const others = [];
    for (const [other, q] of this.players) if (other !== ws && !q.pending) others.push(this.#public(q));
    this.#send(ws, { t: 'welcome', v: NET_VERSION, id: player.id, k: player.k, zone: this.zone, world: this.world, cap: this.capacity, players: others });
    if (mute) this.#send(ws, { t: 'notice', kind: 'muted', until: mute.until, reason: mute.reason });
    // Nach einem Aufwachen fehlt das Aussehen der bisherigen Spieler: nachfordern.
    for (const [other, q] of this.players) if (!q.pending && q.needLook) { q.needLook = false; this.#send(other, { t: 'resync' }); }
    this.#broadcast({ t: 'join', p: this.#public(player) }, ws);
    await this.#report();
    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + REPORT_MS);
  }

  #public(q) { return { id: q.id, k: q.k, name: q.name, level: q.level, look: q.look, s: q.s }; }

  #count() { let n = 0; for (const q of this.players.values()) if (!q.pending) n++; return n; }

  #rate(p) {
    const now = Date.now();
    p.tokens = Math.min(RATE_BURST, (p.tokens ?? RATE_BURST) + ((now - (p.last ?? now)) / 1000) * RATE_PER_S);
    p.last = now;
    if (p.tokens < 1) { p.drops = (p.drops ?? 0) + 1; return false; }
    p.tokens -= 1;
    return true;
  }

  #markDirty(ws) {
    this.dirty.add(ws);
    this.flushTimer ??= setTimeout(() => this.#flush(), BROADCAST_MS);
  }

  #flush() {
    this.flushTimer = null;
    if (!this.dirty.size) return;
    const s = [];
    for (const ws of this.dirty) {
      const p = this.players.get(ws);
      if (!p || p.pending) continue;
      s.push([p.id, ...p.s]);
      this.#attach(ws, p);
    }
    this.dirty.clear();
    if (s.length) this.#broadcast({ t: 'u', s });
  }

  // Anhang überlebt den Ruhezustand (max. 2 KB): alles außer dem Aussehen.
  #attach(ws, p) {
    try { ws.serializeAttachment({ id: p.id, uid: p.uid, k: p.k, mute: p.mute ?? null, name: p.name, level: p.level, s: p.s, zone: this.zone, world: this.world }); } catch { /* egal */ }
  }

  #broadcast(msg, except = null) {
    const data = JSON.stringify(msg);
    for (const [ws, q] of this.players) if (ws !== except && !q.pending) { try { ws.send(data); } catch { /* getrennt */ } }
  }

  #send(ws, msg) { try { ws.send(JSON.stringify(msg)); } catch { /* getrennt */ } }
  #close(ws, code, reason) { try { ws.close(code, reason); } catch { /* schon zu */ } }
  #bye(ws, reason) { this.#send(ws, { t: 'bye', reason }); this.#close(ws, 4000, reason); }

  #remove(ws) {
    const p = this.players.get(ws);
    if (!p) return;
    this.players.delete(ws);
    this.dirty.delete(ws);
    if (p.pending) return;
    if (p.msgs?.length) this.gone.set(p.id, { uid: p.uid, name: p.name, msgs: p.msgs, at: Date.now() });
    this.#broadcast({ t: 'leave', id: p.id });
    this.#report();
  }

  #dropStalePending() {
    const now = Date.now();
    let dropped = false;
    for (const [ws, p] of this.players) if (p.pending && !p.authing && now - p.since > HELLO_TIMEOUT_MS) { this.#close(ws, 4002, 'hello'); this.players.delete(ws); dropped = true; }
    if (dropped) this.#report();
  }

  async #report() {
    if (!this.zone || !this.world || !this.env.DIRECTORY) return;
    try { await this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName('main')).report(this.zone, this.world, this.#count()); } catch { /* nur ein Hinweis */ }
  }
}
