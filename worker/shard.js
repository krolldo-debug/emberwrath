import { DurableObject } from 'cloudflare:workers';
import { verifyToken } from './auth.js';
import { ONLINE_CONFIG } from '../src/online/config.js';
import { filterChat } from '../src/net/chatFilter.js';
import { REPORT_REASONS, saveReport, activeMutes, loadCharacter } from './moderation.js';
import { nameProblem } from '../src/net/names.js';
import { ITEMS } from '../src/progression/items.js';
import {
  NET_VERSION, BROADCAST_MS, LOOK_MIN_MS, cleanState, cleanLook, cleanChat, cleanLevel, cleanText, shardName,
  REPORT_NOTE_MAX, LEVEL_MAX, NAME_MAX,
} from '../src/net/protocol.js';

// Ein Shard = eine offene Zone in einer Welt ('<zoneId>~<welt>'), ein Durable Object.
// Stufe 1: Der Shard verteilt Position, Animation, Aussehen und Chat der Spieler an alle anderen im selben Shard.
// Gegner, Beute und Kampf rechnet noch jeder Client selbst (Stufe 2: serverseitig, siehe src/net/README.md).
//
// Kosten: WebSocket-Hibernation. Solange niemand etwas sendet (alle stehen), schläft das Objekt und kostet keine
// Laufzeit; 'ping' beantwortet Cloudflare selbst, ohne das Objekt zu wecken.
const HELLO_TIMEOUT_MS = 10_000;
const PENDING_PER_IP = 4;
const REPORT_MS = 60_000;
const RATE_PER_S = 30, RATE_BURST = 60, ABUSE_DROPS = 300;
const CHAT_GAP_MS = 1200, CHAT_BURST = 3;
// Moderation: letzte Nachrichten je Spieler als Beleg für Meldungen (nur im Speicher), auch kurz nach dem Verlassen.
const EVIDENCE_MSGS = 10, GONE_KEEP_MS = 10 * 60_000;
const REPORTS_PER_WINDOW = 6, REPORT_WINDOW_MS = 10 * 60_000;
const QUEUE_PREFIX = 'report:', QUEUE_MAX = 2000;
// Obergrenzen für Speicher im Objekt (Schutz vor Aufblähen durch viele kurze Besuche)
const GONE_MAX = 200, LIMITS_MAX = 2000;

// Ausrüstung im Aussehen nur mit echten Gegenständen am richtigen Platz (Katalog src/progression/items.js)
const isItem = (slot, id) => Object.hasOwn(ITEMS, id) && ITEMS[id].slot === slot;

// Öffentlicher, dauerhafter Schlüssel eines Kontos für „Ignorieren“: HMAC mit einem Geheimnis des Servers, damit
// niemand ihn aus einer bekannten Konto-ID ausrechnen kann. Geheimnis: NET_KEY_SECRET, sonst das Service-Secret.
let hmacKey = null, hmacFor = null;
async function ignoreKey(env, uid) {
  const secret = String(env.NET_KEY_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || 'emberwrath-ignore');
  if (hmacFor !== secret) {
    hmacKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    hmacFor = secret;
  }
  const d = await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(`ignore:${uid}`));
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
    this.limits = new Map(); // uid -> { chat: [ms], reports: [ms] } Grenzen je Konto (gelten auch nach Neuverbinden)
    this.mutes = new Map(); // uid -> { until, reason } zuletzt bekannte Chatsperre (bleibt bei Störung bestehen)
    this.lookTimer = null;
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    // Nach dem Aufwachen aus dem Ruhezustand: Spieler aus den Anhängen der offenen Verbindungen wiederherstellen.
    for (const ws of ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (!a) continue;
      if (a.zone) { this.zone = a.zone; this.world = a.world; }
      if (a.id) {
        this.seq = Math.max(this.seq, a.id);
        this.players.set(ws, { ...a, look: null, needLook: true, tokens: RATE_BURST, last: Date.now(), drops: 0, chat: [] });
        if (a.mute) this.mutes.set(a.uid, a.mute);
      } else this.players.set(ws, { pending: true, since: a.since ?? Date.now(), ip: a.ip ?? '', zone: a.zone, world: a.world });
    }
  }

  // Nur vom Worker (worker/index.js) aufgerufen: WebSocket-Upgrade mit ?zone=&world=
  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket erwartet', { status: 426 });
    this.zone ??= url.searchParams.get('zone');
    this.world ??= Number(url.searchParams.get('world'));
    // Noch nicht angemeldete Verbindungen je Adresse begrenzen (sonst ließe sich eine Welt mit leeren Sockets füllen)
    const ip = request.headers.get('CF-Connecting-IP') ?? '';
    if (ip) {
      let open = 0;
      for (const q of this.players.values()) if (q.pending && q.ip === ip) open++;
      if (open >= PENDING_PER_IP) return new Response('Zu viele Verbindungen', { status: 429 });
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    const since = Date.now();
    server.serializeAttachment({ since, ip, zone: this.zone, world: this.world });
    this.players.set(server, { pending: true, since, ip });
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
        // Nur bei Änderung weitergeben und höchstens alle LOOK_MIN_MS; eine spätere Änderung kommt nach (#flushLooks)
        const look = cleanLook(m.look, isItem);
        p.level = Math.min(cleanLevel(m.level ?? p.level), p.levelMax ?? LEVEL_MAX);
        if (look) p.look = look;
        p.needLook = false;
        this.#attach(ws, p);
        const key = JSON.stringify([p.level, p.look]);
        if (key === p.lookKey) { p.lookDue = false; break; }
        p.lookDue = true;
        this.#flushLooks();
        break;
      }
      case 'chat': {
        const text = cleanChat(m.text);
        const now = Date.now();
        if (!text) break;
        const mute = this.mutes.get(p.uid);
        if (mute && Date.parse(mute.until) > now) { this.#send(ws, { t: 'notice', kind: 'muted', until: mute.until, reason: mute.reason }); break; }
        const lim = this.#limits(p.uid);
        lim.chat = lim.chat.filter((t) => now - t < CHAT_GAP_MS * CHAT_BURST);
        if (lim.chat.length >= CHAT_BURST) break;
        lim.chat.push(now);
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
    await this.#refreshMutes();
    const queued = await this.#flushReports();
    if (n > 0 || queued > 0) await this.ctx.storage.setAlarm(Date.now() + REPORT_MS);
  }

  // Vom Verzeichnis (worker/directory.js) aufgerufen: dasselbe Konto ist jetzt in einem anderen Gebiet oder einer
  // anderen Welt angemeldet. Hier abmelden; ein Konto steht immer nur in einem Shard.
  kick(uid) {
    for (const [ws, q] of this.players) if (q.uid === uid) { this.#bye(ws, 'replaced'); this.#remove(ws, { release: false }); }
  }

  // Chatsperren aller Anwesenden neu lesen (jede Minute). Bei Störung bleiben die bekannten Sperren bestehen.
  async #refreshMutes() {
    const uids = [];
    for (const q of this.players.values()) if (q.uid && !q.pending) uids.push(q.uid);
    if (!uids.length) return;
    const fresh = await activeMutes(this.env, uids);
    if (!fresh) return;
    for (const [ws, q] of this.players) {
      if (!q.uid || q.pending) continue;
      const m = fresh.get(q.uid) ?? null, had = this.mutes.get(q.uid) ?? null;
      if (m) this.mutes.set(q.uid, m); else this.mutes.delete(q.uid);
      if (m && (!had || had.until !== m.until)) this.#send(ws, { t: 'notice', kind: 'muted', until: m.until, reason: m.reason });
      if (JSON.stringify(m) !== JSON.stringify(q.mute ?? null)) { q.mute = m; this.#attach(ws, q); }
    }
  }

  #limits(uid) {
    let l = this.limits.get(uid);
    if (!l) {
      if (this.limits.size >= LIMITS_MAX) {
        const now = Date.now();
        for (const [k, v] of this.limits) if (!v.chat.some((t) => now - t < REPORT_WINDOW_MS) && !v.reports.some((t) => now - t < REPORT_WINDOW_MS)) this.limits.delete(k);
        while (this.limits.size >= LIMITS_MAX) this.limits.delete(this.limits.keys().next().value);
      }
      this.limits.set(uid, (l = { chat: [], reports: [] }));
    }
    return l;
  }

  // Meldung eines Spielers (DSA Art. 16). Der Beleg (letzte Nachrichten) kommt vom Server, nicht vom Client.
  async #reportPlayer(ws, p, m) {
    const now = Date.now();
    const ack = (ok, error) => this.#send(ws, { t: 'reported', id: m.id, ok, error });
    const lim = this.#limits(p.uid);
    lim.reports = lim.reports.filter((t) => now - t < REPORT_WINDOW_MS);
    if (lim.reports.length >= REPORTS_PER_WINDOW) { ack(false, 'rate'); return; }
    if (!REPORT_REASONS.includes(m.reason)) { ack(false, 'reason'); return; }
    let target = null;
    for (const q of this.players.values()) if (!q.pending && q.id === m.id) target = q;
    for (const [id, g] of this.gone) if (now - g.at > GONE_KEEP_MS) this.gone.delete(id);
    target ??= this.gone.get(m.id) ?? null;
    if (!target || target.uid === p.uid) { ack(false, 'target'); return; }
    lim.reports.push(now);
    const row = {
      reporter_id: p.uid, reporter_name: p.name, reported_id: target.uid, reported_name: target.name,
      zone: this.zone ?? '', world: this.world ?? 1, reason: m.reason, note: cleanText(m.note, REPORT_NOTE_MAX),
      messages: (target.msgs ?? []).map((x) => ({ text: x.text, ...(x.shown ? { shown: x.shown } : {}), at: new Date(x.at).toISOString() })),
      good_faith: m.goodFaith === true, created_at: new Date(now).toISOString(),
    };
    try { await saveReport(this.env, row); } catch {
      // Später erneut senden (Alarm); bis dahin im Speicher des Shards. Ist die Warteschlange voll (lange Störung),
      // wird die Meldung abgelehnt; der Hinweis im Spiel verweist dann auf den Support.
      const queued = await this.ctx.storage.list({ prefix: QUEUE_PREFIX, limit: QUEUE_MAX });
      if (queued.size >= QUEUE_MAX) { console.error('Meldewarteschlange voll', this.zone, this.world); ack(false, 'store'); return; }
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
    // Dasselbe Konto verbindet sich neu (Neuladen, zweiter Tab, zwei gleichzeitige Anmeldungen): die ältere Verbindung
    // ersetzen, auch wenn sie selbst noch in der Anmeldung steckt.
    for (const [other, q] of this.players) {
      if (other === ws || q.uid !== user.uid) continue;
      this.#bye(other, 'replaced');
      if (q.pending) this.players.delete(other); else this.#remove(other, { release: false });
    }
    // Platz belegen, bevor weiter gewartet wird (sonst passen zwei gleichzeitige Anmeldungen über die Obergrenze)
    if (this.#count() >= this.capacity) { this.#send(ws, { t: 'full', zone: this.zone, world: this.world }); this.#close(ws, 4001, 'full'); this.players.delete(ws); this.#report(); return; }
    p.uid = user.uid;
    p.reserved = true;

    const ch = m.char && typeof m.char === 'object' ? m.char : {};
    const [k, mutes, stored] = await Promise.all([ignoreKey(this.env, user.uid), activeMutes(this.env, [user.uid]), loadCharacter(this.env, user.uid, ch.id)]);
    if (this.players.get(ws) !== p) return; // inzwischen getrennt oder ersetzt
    if (mutes) { const mm = mutes.get(user.uid); if (mm) this.mutes.set(user.uid, mm); else this.mutes.delete(user.uid); }
    const mute = this.mutes.get(user.uid) ?? null;
    // Name und Stufe, die andere sehen: aus dem gespeicherten Charakter (Supabase). Die Stufe darf um eine über dem letzten
    // Speicherstand liegen (Aufstieg seit dem letzten Autosave). Ohne Speicherstand (neuer Charakter, Störung): Angaben
    // des Clients, aber geprüft. Reservierte oder anstößige Namen sieht niemand; dann „Abenteurer XXXX“.
    let name = cleanText(stored?.name || ch.name, NAME_MAX);
    const blocked = nameProblem(name);
    if (blocked) name = `Abenteurer ${k.slice(0, 4).toUpperCase()}`;
    const levelMax = stored ? Math.min(LEVEL_MAX, stored.level + 1) : LEVEL_MAX;
    const level = Math.max(stored?.level ?? 1, Math.min(cleanLevel(ch.level), levelMax));
    const player = {
      id: ++this.seq, uid: user.uid, k, mute, msgs: [], name, level, levelMax,
      look: cleanLook(m.look, isItem), s: cleanState(m.s) ?? [0, 0, 1, 'idle', 0, 0, 0],
      zone: this.zone, world: this.world,
      tokens: RATE_BURST, last: Date.now(), drops: 0, chat: [],
    };
    player.lookKey = JSON.stringify([player.level, player.look]);
    player.lookAt = Date.now();
    this.players.set(ws, player);
    this.#attach(ws, player);
    const others = [];
    for (const [other, q] of this.players) if (other !== ws && !q.pending) others.push(this.#public(q));
    this.#send(ws, { t: 'welcome', v: NET_VERSION, id: player.id, k: player.k, zone: this.zone, world: this.world, cap: this.capacity, players: others });
    if (mute) this.#send(ws, { t: 'notice', kind: 'muted', until: mute.until, reason: mute.reason });
    if (blocked) this.#send(ws, { t: 'notice', kind: 'name', reason: blocked, name });
    // Nach einem Aufwachen fehlt das Aussehen der bisherigen Spieler: nachfordern.
    for (const [other, q] of this.players) if (!q.pending && q.needLook) { q.needLook = false; this.#send(other, { t: 'resync' }); }
    this.#broadcast({ t: 'join', p: this.#public(player) }, ws);
    await this.#report();
    await this.#claim(player.uid);
    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + REPORT_MS);
  }

  #public(q) { return { id: q.id, k: q.k, name: q.name, level: q.level, look: q.look, s: q.s }; }

  // Belegte Plätze: angemeldete Spieler und solche, deren Anmeldung geprüft ist und gerade abgeschlossen wird
  #count() { let n = 0; for (const q of this.players.values()) if (!q.pending || q.reserved) n++; return n; }

  // Aussehen verteilen, gedrosselt je Spieler
  #flushLooks() {
    const now = Date.now();
    let next = Infinity;
    for (const [ws, q] of this.players) {
      if (q.pending || !q.lookDue) continue;
      const at = (q.lookAt ?? 0) + LOOK_MIN_MS;
      if (at > now) { next = Math.min(next, at); continue; }
      q.lookDue = false; q.lookAt = now;
      q.lookKey = JSON.stringify([q.level, q.look]);
      this.#broadcast({ t: 'look', id: q.id, level: q.level, look: q.look }, ws);
    }
    if (next < Infinity && !this.lookTimer) this.lookTimer = setTimeout(() => { this.lookTimer = null; this.#flushLooks(); }, next - now + 5);
  }

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
    try { ws.serializeAttachment({ id: p.id, uid: p.uid, k: p.k, mute: this.mutes.get(p.uid) ?? p.mute ?? null, name: p.name, level: p.level, levelMax: p.levelMax, s: p.s, zone: this.zone, world: this.world }); } catch { /* egal */ }
  }

  #broadcast(msg, except = null) {
    const data = JSON.stringify(msg);
    for (const [ws, q] of this.players) if (ws !== except && !q.pending) { try { ws.send(data); } catch { /* getrennt */ } }
  }

  #send(ws, msg) { try { ws.send(JSON.stringify(msg)); } catch { /* getrennt */ } }
  #close(ws, code, reason) { try { ws.close(code, reason); } catch { /* schon zu */ } }
  #bye(ws, reason) { this.#send(ws, { t: 'bye', reason }); this.#close(ws, 4000, reason); }

  #remove(ws, { release = true } = {}) {
    const p = this.players.get(ws);
    if (!p) return;
    this.players.delete(ws);
    this.dirty.delete(ws);
    if (p.pending) { if (p.reserved) this.#report(); return; }
    if (p.msgs?.length) {
      this.gone.set(p.id, { uid: p.uid, name: p.name, msgs: p.msgs, at: Date.now() });
      while (this.gone.size > GONE_MAX) this.gone.delete(this.gone.keys().next().value);
    }
    this.#broadcast({ t: 'leave', id: p.id });
    this.#report();
    if (release) this.#release(p.uid);
  }

  // Ein Konto, ein Shard: beim Verzeichnis anmelden; steht das Konto noch in einem anderen Shard, dort abmelden.
  async #claim(uid) {
    if (!this.env.DIRECTORY || !uid) return;
    try {
      const prev = await this.#directory().claim(uid, this.zone, this.world);
      if (prev && this.env.ZONE_SHARD) await this.env.ZONE_SHARD.get(this.env.ZONE_SHARD.idFromName(shardName(prev.zone, prev.world))).kick(uid);
    } catch (e) { console.error('claim', e?.message); }
  }

  #release(uid) {
    if (!this.env.DIRECTORY || !uid) return;
    const done = this.#directory().release(uid, this.zone, this.world).catch(() => {});
    this.ctx.waitUntil?.(done);
  }

  #directory() { return this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName('main')); }

  #dropStalePending() {
    const now = Date.now();
    let dropped = false;
    for (const [ws, p] of this.players) if (p.pending && !p.authing && now - p.since > HELLO_TIMEOUT_MS) { this.#close(ws, 4002, 'hello'); this.players.delete(ws); dropped = true; }
    if (dropped) this.#report();
  }

  async #report() {
    if (!this.zone || !this.world || !this.env.DIRECTORY) return;
    try { await this.#directory().report(this.zone, this.world, this.#count()); } catch { /* nur ein Hinweis */ }
  }
}
