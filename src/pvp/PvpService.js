import { EV } from '../core/events.js';
import { PvpClient } from './PvpClient.js';
import { PVP_PATH } from './protocol.js';
import { cleanLook } from '../net/protocol.js';
import { lookOf } from '../net/NetSession.js';
import { PVP_MIN_LEVEL, ARENA_ZONE, TIMING, START_RATING, seasonAt, tierOf, tierIndex } from './rules.js';

// Glutarena über die ganze Spielsitzung: game.pvp (src/pvp/README.md).
//
// Zustände (state): 'idle' -> 'queued' -> 'match' (Reise in die Arena, Kampf) -> 'result' -> 'idle'
//   queue()          gewertete Suche 1 gegen 1 (ab Stufe PVP_MIN_LEVEL, nur angemeldet)
//   cancel()         Suche beenden
//   leave()          Kampf aufgeben (zählt als Niederlage) und zurück
//   match            { id, kind: 'net'|'bot', side, foe, go: Startzeit (performance.now) | null, result }
//   me               eigene Wertung (vom Server; vorher der zuletzt gespeicherte Stand aus dem Slice 'pvp')
//   top()            Bestenliste der Saison (GET /net/arena/top, 60 s zwischengespeichert)
// Ereignisse auf game.bus: 'pvp:changed' { state }, 'pvp:end' { result, reason, delta, gold, me }.
// Der Kampf selbst läuft in der Arena-Sitzung (ArenaSession.js), die sich hier die Nachrichten holt.
const posOf = (o) => (Number.isFinite(o?.x) && Number.isFinite(o?.y) ? { x: o.x, y: o.y } : null);
const REASON_TEXT = {
  auth: 'Für die Arena musst du angemeldet sein.',
  level: `Die Arena öffnet ab Stufe ${PVP_MIN_LEVEL}.`,
  replaced: 'Die Arena wurde in einem anderen Fenster geöffnet.',
  version: 'Bitte lade das Spiel neu, um die Arena zu betreten.',
  char: 'Dein Held ist noch nicht gespeichert. Versuche es gleich noch einmal.',
};

export class PvpService {
  constructor(game) {
    this.game = game;
    this.state = 'idle';
    this.me = null;
    this.season = seasonAt();
    this.searching = null;
    this.match = null;
    this.origin = null;
    this.since = 0;
    this.topCache = null;
    this.client = new PvpClient({ getToken: async () => (game.online?.user ? game.online.client.getAccessToken() : null) });
    const c = this.client;
    c.on('welcome', (m) => { this.me = m.me; this.season = m.season ?? this.season; this.#record(null, m.me); this.#changed(); });
    c.on('queued', (m) => { this.searching = m.searching; this.#changed(); });
    c.on('stats', (m) => { this.searching = m.searching; this.#changed(); });
    c.on('match', (m) => this.#begin({ id: m.id, kind: 'net', side: m.side === 'b' ? 'b' : 'a', foe: m.foe, resume: !!m.resume }));
    c.on('bot', (m) => this.#begin({ id: m.id, kind: 'bot', side: 'a', foe: m.foe }));
    c.on('go', (m) => { if (this.match) { this.match.go = performance.now() + Math.max(0, Number(m.in) || 0); this.#changed(); } });
    c.on('end', (m) => this.#end(m));
    c.on('top', (m) => { this.topCache = { at: Date.now(), list: m.list ?? [] }; this.game.bus.emit('pvp:top', this.topCache.list); });
    c.on('failed', ({ reason }) => this.#failed(reason));
    game.bus.on('online:changed', ({ user }) => { if (!user) this.#reset(); });
    game.bus.on(EV.SCENE_CHANGE, (e) => { if (e?.to !== 'play' && this.state !== 'idle') this.#reset(); });
    // Wer die Arena während des Kampfes verlässt, gibt auf; danach geht es an die Stelle zurück, an der man gesucht hat
    game.bus.on(EV.ZONE_TRAVEL_PLAN, (p) => this.#redirect(p));
  }

  get busy() { return this.state !== 'idle' && this.state !== 'result'; }
  get inArena() { return this.game.scenes?.current?.zone?.zoneId === ARENA_ZONE; }

  char() {
    const s = this.game.state.slices;
    return {
      id: this.game.state.meta?.characterId ?? '', name: s.character?.name ?? 'Held', level: s.progress?.level ?? 1,
      classId: s.character?.classId ?? 'warrior', raceId: s.character?.raceId ?? 'human',
    };
  }

  // Eigene Wertung: Server, sonst der zuletzt gespeicherte Stand
  rating() {
    if (this.me) return this.me;
    const p = this.game.state.slices.pvp;
    const season = seasonAt().n;
    const r = p?.season === season ? p.rating : START_RATING;
    return { rating: r, wins: p?.season === season ? p.seasonWins ?? 0 : 0, losses: p?.season === season ? p.seasonLosses ?? 0 : 0, games: 0, best: r, tier: tierOf(r).id, season, daily: 0 };
  }

  // ------------------------------------------------------------------ Suche
  queue() {
    const c = this.char();
    if (c.level < PVP_MIN_LEVEL) return { ok: false, error: `Die Arena öffnet ab Stufe ${PVP_MIN_LEVEL}.` };
    if (!this.game.online?.user) return { ok: false, error: 'Für die Arena musst du angemeldet sein.' };
    if (this.game.finder && this.game.finder.state !== 'idle') return { ok: false, error: 'Du bist gerade in der Dungeonsuche.' };
    if (this.state === 'queued') return { ok: true };
    if (this.state === 'match' || (this.inArena && this.state !== 'result')) return { ok: false, error: 'Du kämpfst gerade.' };
    this.origin = this.#here() ?? this.origin;
    this.state = 'queued';
    this.since = Date.now();
    this.searching = null;
    this.match = null;
    this.#connect();
    this.client.send({ t: 'queue' });
    this.#changed();
    return { ok: true };
  }

  cancel() {
    if (this.state !== 'queued') return;
    this.client.send({ t: 'cancel' });
    this.state = 'idle';
    this.#changed();
    this.#closeSoon();
  }

  // Aufgeben (Menü, Ausgang): zählt als Niederlage
  leave() {
    if (!this.match || this.match.result) { this.returnHome(); return; }
    this.client.send({ t: 'leave' });
    this.match.left = true;
  }

  // Bestenliste (Server-Liste, sonst leer)
  async top() {
    if (this.topCache && Date.now() - this.topCache.at < 60_000) return this.topCache.list;
    try {
      const loc = globalThis.location;
      const r = await fetch(`${loc.origin}${PVP_PATH}/top`, { headers: { accept: 'application/json' } });
      const j = r.ok ? await r.json() : null;
      this.topCache = { at: Date.now(), list: Array.isArray(j?.list) ? j.list : [] };
    } catch { this.topCache = { at: Date.now() - 50_000, list: this.topCache?.list ?? [] }; }
    return this.topCache.list;
  }

  // Für die Arena-Sitzung
  send(msg) { return this.client.send(msg); }
  on(type, fn) { return this.client.on(type, fn); }

  // Angekommen (Arena-Sitzung): beim echten Kampf dem Server melden
  arrived() {
    const m = this.match;
    if (!m) return;
    if (m.kind === 'net') this.client.send({ t: 'ready', id: m.id });
    else if (!m.go) { m.go = performance.now() + TIMING.countdownMs; this.#changed(); }
  }

  // Ergebnis gegen einen Herausforderer (Arena-Sitzung)
  botResult(score, hpPct) {
    const m = this.match;
    if (!m || m.kind !== 'bot' || m.reported) return;
    m.reported = true;
    this.client.send({ t: 'botresult', id: m.id, score, hp: Math.round(hpPct) });
  }

  // Zurück an die Stelle, an der man gesucht hat
  returnHome() {
    const o = this.origin;
    const to = o?.zoneId ?? 'emberhollow';
    this.match = null;
    if (this.state !== 'queued') this.state = 'idle';
    this.#changed();
    this.#closeSoon();
    if (this.inArena) this.game.bus.emit(EV.ZONE_TRAVEL, { zoneId: to, spawnId: 'respawn', pos: posOf(o) });
  }

  // ------------------------------------------------------------------ intern
  #connect() {
    clearTimeout(this.closeTimer);
    const session = this.game.scenes?.current;
    const look = session?.world ? cleanLook(lookOf(session)) : null;
    this.client.connect({ char: this.char(), look });
  }

  // Verbindung nach dem Kampf/der Suche kurz offen lassen (schnelles Weitersuchen), dann schließen
  #closeSoon() {
    clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => { if (this.state === 'idle' || this.state === 'result') this.client.close(); }, 20_000);
  }

  #begin(match) {
    const resumed = match.resume && this.match?.id === match.id;
    if (!resumed) {
      this.match = { ...match, go: null, result: null };
      this.state = 'match';
      this.game.sfx?.play?.('quest');
    }
    this.#changed();
    if (!this.inArena) this.game.bus.emit(EV.ZONE_TRAVEL, { zoneId: ARENA_ZONE, spawnId: match.side === 'b' ? 'east' : 'start' });
  }

  #end(m) {
    const match = this.match;
    if (match && m.id && match.id !== m.id) return;
    if (m.me) this.me = m.me;
    const gold = Math.max(0, Math.min(1000, Number(m.gold) || 0));
    if (match) match.result = { result: m.result, reason: m.reason, delta: m.delta ?? 0, gold, me: m.me };
    this.state = 'result';
    this.#record(m.result, m.me);
    if (gold > 0) this.game.state.commit('wallet:addGold', { amount: gold, source: 'pvp' });
    this.game.bus.emit('pvp:end', { result: m.result, reason: m.reason, delta: m.delta ?? 0, gold, me: m.me });
    this.#changed();
    // Ohne Arena-Sitzung (z. B. Gegner nicht angetreten, bevor man ankam): gleich zurück
    if (!this.inArena) { this.match = null; this.state = 'idle'; this.#changed(); this.#closeSoon(); }
  }

  // Ergebnis und Wertung im Spielstand (Erfolge, Anzeige vor der nächsten Verbindung)
  #record(result, me) {
    const st = this.game.state;
    if (!st.commands.has('pvp:record')) return;
    st.commit('pvp:record', { result: result ?? null, rating: me?.rating, best: me?.best, season: me?.season, tier: me ? tierIndex(me.bestTier ?? me.tier) : null, wins: me?.wins, losses: me?.losses });
  }

  #failed(reason) {
    const wasMatch = this.state === 'match' && this.match && !this.match.result;
    if (this.state === 'queued' || wasMatch || REASON_TEXT[reason]) {
      const text = REASON_TEXT[reason] ?? (wasMatch ? 'Die Verbindung zur Arena ist abgebrochen.' : 'Die Arena ist gerade nicht erreichbar.');
      this.game.bus.emit(EV.UI_TOAST, { text, kind: 'warn' });
    }
    if (this.state === 'queued') this.state = 'idle';
    // Im Kampf: die Arena-Sitzung zeigt das Ende; ein echter Kampf läuft auf dem Server weiter (Wiederverbinden)
    if (wasMatch && this.match.kind === 'net') this.#retry();
    this.#changed();
  }

  // Im Kampf kurz nach dem Abbruch einmal neu verbinden (der Server wartet TIMING.graceMs)
  #retry() {
    if (this.retrying) return;
    this.retrying = true;
    setTimeout(() => { this.retrying = false; if (this.state === 'match' && this.match && !this.match.result) this.#connect(); }, 1500);
  }

  #reset() {
    this.client.close();
    this.state = 'idle';
    this.match = null;
    this.#changed();
  }

  #here() {
    const s = this.game.scenes?.current, z = s?.zone, h = s?.world?.hero;
    if (!z || z.def?.instanced) return null;
    return h && Number.isFinite(h.x) && Number.isFinite(h.y) ? { zoneId: z.zoneId, x: Math.round(h.x), y: Math.round(h.y) } : { zoneId: z.zoneId };
  }

  // Arena verlassen: laufender Kampf gilt als aufgegeben; Ziel ist die Stelle, an der man gesucht hat
  #redirect(p) {
    if (p.fromZoneId !== ARENA_ZONE || p.zoneId === ARENA_ZONE) return;
    if (this.match && !this.match.result && !this.match.left) { this.client.send({ t: 'leave' }); this.match.left = true; }
    const o = this.origin;
    if (!o?.zoneId || !this.game.content.find('zone', o.zoneId)) return;
    p.zoneId = o.zoneId;
    p.spawnId = 'respawn';
    p.pos = posOf(o);
  }

  #changed() { this.game.bus.emit('pvp:changed', { state: this.state }); }
}
