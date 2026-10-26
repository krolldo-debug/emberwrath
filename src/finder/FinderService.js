import { EV } from '../core/events.js';
import { FinderClient } from './FinderClient.js';
import { Matchmaker } from './matchmaker.js';
import { ROLES, roleAllowed } from './protocol.js';
import { FINDER_CONFIG } from './config.js';
import { hireCost, hireable, hireGroup, mercCount } from './hire.js';
import { isStarsOpen } from '../progression/xp.js';

// Dungeon-Gruppensuche über die ganze Spielsitzung (auch über Zonenwechsel): game.finder.
//
// Zustände (state): 'idle' -> 'queued' -> 'proposal' -> 'accepted' -> 'active' -> 'idle'
//                   'idle' -> 'offer' -> 'active' | 'idle'   (Söldner anheuern am Dungeon-Portal, hire.js)
//   queue({ dungeonId, role })   anmelden (Server-Warteschlange; ist der Server nicht erreichbar, sucht der Client
//                                selbst mit derselben Gruppenbildung – dann eben ohne andere Spieler)
//   cancel()                     abmelden
//   respond(ok)                  Bereitschaftsprüfung beantworten
//   leave()                      Gruppe verlassen (Söldner gehen)
//   dungeons(level)              Liste für die Auswahl: [{ id, name, min, max, open }]
//   hire() / solo()              Angebot am Portal annehmen (Gold, Söldnergruppe) oder allein hineingehen
// Ereignisse auf game.bus: 'finder:changed' { state } (Anzeige), 'finder:chat' { from, text, kind }.
const STORE_KEY = 'emberwrath:finder:';
const MERC_READY = [700, 3400];
// Portal betreten (entities/Interactive.js): Hörer dürfen die Reise anhalten (go.held = true)
const PORTAL_ENTER = EV.PORTAL_ENTER ?? 'portal:enter';
const posOf = (o) => (Number.isFinite(o?.x) && Number.isFinite(o?.y) ? { x: o.x, y: o.y } : null);

export class FinderService {
  constructor(game) {
    this.game = game;
    this.state = 'idle';
    this.req = null;          // { dungeonId, role, since }
    this.searching = null;    // echte Suchende laut Server (null = unbekannt)
    this.group = null;        // aktuelle/angebotene Gruppe
    this.ready = new Set();   // bereite Mitglieder (ticketId/merc-id)
    this.origin = null;       // Rückweg: { zoneId, x, y } – Stelle, an der man der Gruppe beigetreten ist
    this.mode = 'server';
    this.client = new FinderClient({ getToken: async () => (game.online?.user ? game.online.client.getAccessToken() : null) });
    this.client.on('queued', (m) => { this.searching = m.searching; this.#changed(); });
    this.client.on('stats', (m) => { this.searching = m.searching; this.#changed(); });
    this.client.on('proposal', (m) => this.#proposal(m.group, m.you));
    this.client.on('ready', (m) => { this.ready.add(m.ticketId); this.#changed(); });
    this.client.on('start', (m) => this.#start(m.group));
    this.client.on('requeued', () => { this.state = 'queued'; this.group = null; this.ready.clear(); this.#note('Ein Mitspieler hat abgelehnt. Die Suche geht weiter.'); this.#changed(); });
    this.client.on('cancelled', (m) => this.#stopSearch(m.reason === 'timeout' ? 'Die Bereitschaftsprüfung ist abgelaufen.' : null));
    this.client.on('failed', () => { if (this.state === 'queued' || this.state === 'proposal' || this.state === 'accepted') this.#local(); });
    this.timer = setInterval(() => this.#tick(), 250);
    game.bus.on('online:changed', ({ user }) => { if (!user && this.state !== 'idle') this.cancel(); });
    game.bus.on(EV.SCENE_CHANGE, (e) => { if (e?.to !== 'play' && this.state !== 'idle') this.cancel(true); });
    // Wer den Gruppen-Dungeon verlässt (Ausgangsportal, Menü, „Zurück“), landet wieder dort, wo er beigetreten ist
    game.bus.on(EV.ZONE_TRAVEL_PLAN, (p) => this.#redirect(p));
    game.bus.on(PORTAL_ENTER, (go) => { if (this.#offer(go)) go.held = true; });
  }

  // ------------------------------------------------------------------ Auswahl
  dungeons(level) {
    const out = [];
    for (const z of this.game.content.all('zone')) {
      if (!z.instanced || z.kind !== 'dungeon' || !z.bossId || z.trial) continue;
      if (z.expansion && !isStarsOpen()) continue; // Sternenglut noch geschlossen
      const m = String(z.recommendedLevel ?? '').match(/(\d+)\D+(\d+)/);
      const min = m ? +m[1] : 1, max = m ? +m[2] : min;
      out.push({ id: z.id, name: z.name, min, max, open: level >= Math.max(1, min - 2), bossId: z.bossId });
    }
    return out.sort((a, b) => a.min - b.min);
  }

  // Passender Dungeon für "Zufällig": der höchste, der zur Stufe passt
  randomFor(level) {
    const open = this.dungeons(level).filter((d) => d.open);
    const fit = open.filter((d) => level <= d.max + 3);
    const pool = fit.length ? fit.slice(-2) : open.slice(-1);
    return pool[Math.floor(Math.random() * pool.length)] ?? null;
  }

  char() {
    const s = this.game.state.slices;
    return {
      id: this.game.state.meta?.characterId ?? '', name: s.character?.name ?? 'Held', level: s.progress?.level ?? 1,
      classId: s.character?.classId ?? 'warrior', raceId: s.character?.raceId ?? 'human',
    };
  }

  // ------------------------------------------------------------------ Suche
  queue({ dungeonId, role }) {
    const c = this.char();
    const zone = this.game.content.find('zone', dungeonId);
    const d = this.dungeons(c.level).find((x) => x.id === dungeonId);
    if (!zone || !d) return { ok: false, error: 'Unbekannter Dungeon.' };
    if (!d.open) return { ok: false, error: `${d.name} ist ab Stufe ${Math.max(1, d.min - 2)} erreichbar.` };
    if (!roleAllowed(role, c.classId)) return { ok: false, error: `${ROLES[role]?.name ?? 'Diese Rolle'} können nur Krieger übernehmen.` };
    if (this.game.pvp?.busy) return { ok: false, error: 'Du bist gerade in der Glutarena.' };
    if (this.state === 'active') this.leave(true);
    this.origin = this.#here() ?? this.origin;
    this.offerTo = null;
    this.req = { dungeonId, role, since: Date.now() };
    this.state = 'queued';
    this.searching = null;
    this.group = null;
    this.ready.clear();
    this.mode = 'server';
    this.local = null;
    this.client.start({ char: c, dungeonId, role });
    this.#changed();
    return { ok: true };
  }

  cancel(silent = false) {
    if (this.state === 'offer') return this.#dropOffer();
    if (this.state === 'active') return this.leave();
    this.client.stop();
    this.local = null;
    this.#stopSearch(silent ? null : 'Suche beendet.');
  }

  respond(ok) {
    if (this.state !== 'proposal' || !this.group) return;
    const me = this.group.members.find((m) => m.kind === 'player' && m.self);
    if (!ok) {
      if (this.mode === 'server') this.client.accept(this.group.id, false);
      this.client.stop();
      this.local = null;
      this.#stopSearch('Gruppe abgelehnt.');
      return;
    }
    // Söldner in der vorgeschlagenen Gruppe kosten wie am Portal (16.10.); echte Mitspieler nichts
    const mercs = mercCount(this.group);
    if (mercs) {
      const r = this.game.state.commit('finder:hire', { dungeonId: this.group.dungeonId, mercs });
      if (!r?.ok) { this.#changed(); return; }
      if (r.cost) this.game.sfx?.play?.('coin');
    }
    this.state = 'accepted';
    if (me) this.ready.add(me.ticketId);
    if (this.mode === 'server') this.client.accept(this.group.id, true);
    else this.#emitAll(this.local.accept(me.ticketId, this.group.id, true));
    this.#changed();
  }

  // ------------------------------------------------------------------ Söldner anheuern
  // Allein durch das Portal eines Gruppen-Dungeons (nicht über die Suche): erst das Angebot zeigen, die Reise wartet.
  #offer(go) {
    if (this.state === 'offer') return go?.zoneId === this.offerTo?.zoneId; // Angebot steht schon
    const zone = this.game.content.find('zone', go?.zoneId);
    if (this.state !== 'idle' || this.game.pvp?.busy || !hireable(zone) || FINDER_CONFIG.hireOffer === false) return false;
    const here = this.#here();
    if (!here) return false; // Treppen innerhalb eines Dungeons: kein Angebot
    this.offerTo = { zoneId: zone.id, spawnId: go.spawnId ?? 'start', x: here.x, y: here.y };
    this.group = hireGroup(this.char(), zone.id);
    this.hireCost = hireCost(zone, mercCount(this.group));
    this.state = 'offer';
    this.game.sfx?.play?.('ui');
    this.#changed();
    return true;
  }

  // Annehmen: Gold zahlen (Command finder:hire, Preis rechnet der Command selbst), dann mit der Gruppe hinein
  hire() {
    if (this.state !== 'offer' || !this.group) return { ok: false };
    const r = this.game.state.commit('finder:hire', { dungeonId: this.group.dungeonId, mercs: mercCount(this.group) });
    if (!r?.ok) { this.#changed(); return r ?? { ok: false }; }
    if (r.cost) this.game.sfx?.play?.('coin');
    const to = this.offerTo;
    this.offerTo = null;
    this.#begin(this.group, to?.spawnId);
    return r;
  }

  // Ablehnen: allein hinein wie bisher
  solo() {
    if (this.state !== 'offer') return;
    const to = this.offerTo;
    this.#dropOffer();
    if (to) this.game.bus.emit(EV.ZONE_TRAVEL, { zoneId: to.zoneId, spawnId: to.spawnId });
  }

  #dropOffer() {
    this.state = 'idle';
    this.group = null;
    this.offerTo = null;
    this.#changed();
  }

  // Gruppe verlassen: Söldner verabschieden sich, im Dungeon bleibt man (Ausgang über das Portal)
  leave(silent = false) {
    if (this.state !== 'active') return;
    this.state = 'idle';
    this.group = null;
    this.#store(null);
    if (!silent) this.#note('Du hast die Gruppe verlassen.');
    this.#changed();
  }

  // Zurück an die Stelle, an der man beigetreten ist
  returnHome() {
    const o = this.origin;
    const to = o?.zoneId ?? this.game.scenes?.current?.zone?.def?.respawnZone;
    this.leave(true);
    if (to) this.game.bus.emit(EV.ZONE_TRAVEL, { zoneId: to, spawnId: 'respawn', pos: o?.zoneId === to ? posOf(o) : null });
  }

  // Aktuelle Stelle des Helden außerhalb von Instanzen (sonst null)
  #here() {
    const s = this.game.scenes?.current, z = s?.zone, h = s?.world?.hero;
    if (!z || z.def?.instanced) return null;
    return h && Number.isFinite(h.x) && Number.isFinite(h.y) ? { zoneId: z.zoneId, x: Math.round(h.x), y: Math.round(h.y) } : { zoneId: z.zoneId };
  }

  // Zonenwechsel aus dem Gruppen-Dungeon in ein offenes Gebiet: stattdessen zur Beitrittsstelle
  #redirect(p) {
    const o = this.origin;
    if (this.state !== 'active' || !o?.zoneId || !this.group || p.fromZoneId !== this.group.dungeonId) return;
    if (this.game.content.find('zone', p.zoneId)?.instanced || !this.game.content.find('zone', o.zoneId)) return;
    p.zoneId = o.zoneId;
    p.spawnId = 'respawn';
    p.pos = posOf(o);
  }

  // ------------------------------------------------------------------ intern
  #tick() {
    if (this.local && (this.state === 'queued' || this.state === 'proposal' || this.state === 'accepted')) this.#emitAll(this.local.tick());
    // Söldner bestätigen die Bereitschaft nach und nach; der Start wartet auf alle
    if (this.group && (this.state === 'proposal' || this.state === 'accepted')) {
      const now = Date.now();
      let changed = false;
      for (const m of this.group.members) if (m.kind === 'merc' && !this.ready.has(m.id) && now >= m.readyAt) { this.ready.add(m.id); changed = true; }
      if (this.pendingStart && this.group.members.every((m) => this.ready.has(m.kind === 'merc' ? m.id : m.ticketId))) {
        const g = this.pendingStart;
        this.pendingStart = null;
        this.#begin(g);
        return;
      }
      if (changed) this.#changed();
    }
  }

  // Server nicht erreichbar: dieselbe Gruppenbildung im Browser (ohne andere Spieler)
  #local() {
    if (this.mode === 'local') return;
    this.mode = 'local';
    this.searching = null;
    this.local = new Matchmaker({ humanGroups: false });
    const c = this.char();
    this.localId = `me_${Date.now().toString(36)}`;
    this.#emitAll(this.local.add({ id: this.localId, name: c.name, level: c.level, classId: c.classId, raceId: c.raceId, role: this.req.role, dungeonId: this.req.dungeonId, since: this.req.since }));
    this.group = null;
    this.ready.clear();
    this.state = 'queued';
    this.#changed();
  }

  #emitAll(events) {
    for (const { to, msg } of events ?? []) {
      if (msg.t === 'proposal') this.#proposal(msg.group, to);
      else if (msg.t === 'start') this.#start(msg.group);
      else if (msg.t === 'cancelled') this.#stopSearch(msg.reason === 'timeout' ? 'Die Bereitschaftsprüfung ist abgelaufen.' : null);
    }
  }

  #proposal(group, you) {
    const c = this.char();
    // eigener Eintrag: die eigene Anmeldung (you), zur Sicherheit sonst der Spieler mit meinem Namen
    let mine = group.members.some((m) => m.kind === 'player' && m.ticketId === you);
    for (const m of group.members) {
      if (m.kind === 'player' && (mine ? m.ticketId === you : m.name === c.name)) { m.self = true; mine = true; }
      if (m.kind === 'merc') m.readyAt = Date.now() + MERC_READY[0] + Math.random() * (MERC_READY[1] - MERC_READY[0]);
    }
    this.group = group;
    this.ready.clear();
    this.state = 'proposal';
    this.game.sfx?.play?.('quest');
    this.#changed();
  }

  #start(group) {
    // Söldner-Bereitschaft aus dem Angebot übernehmen, dann warten, bis alle ihr Häkchen haben
    const old = this.group;
    if (old && old.id === group.id) for (const m of group.members) { const o = old.members.find((x) => (x.id ?? x.ticketId) === (m.id ?? m.ticketId)); if (o) { m.self = o.self; m.readyAt = o.readyAt; } }
    this.group = group;
    this.pendingStart = group;
    for (const m of group.members) if (m.kind === 'player' && !m.self) this.ready.add(m.ticketId);
    this.#tick();
  }

  #begin(group, spawnId = 'start') {
    this.origin = this.#here() ?? this.origin;
    this.client.stop();
    this.local = null;
    this.state = 'active';
    this.group = group;
    this.startedAt = Date.now();
    this.#store({ group, origin: this.origin, at: this.startedAt });
    this.#changed();
    this.game.bus.emit(EV.ZONE_TRAVEL, { zoneId: group.dungeonId, spawnId });
  }

  #stopSearch(note) {
    this.state = 'idle';
    this.req = null;
    this.group = null;
    this.pendingStart = null;
    this.ready.clear();
    this.local = null;
    if (note) this.#note(note);
    this.#changed();
  }

  // Wiederherstellen nach Neuladen: aktive Gruppe gehört zu diesem Charakter und diesem Dungeon
  restore(zoneId) {
    if (this.state !== 'idle') return this.state === 'active' && this.group?.dungeonId === zoneId;
    const saved = this.#load();
    if (!saved || saved.group?.dungeonId !== zoneId) { this.#store(null); return false; }
    this.group = saved.group;
    this.origin = saved.origin ?? null;
    this.startedAt = saved.at ?? Date.now();
    this.state = 'active';
    this.#changed();
    return true;
  }

  #key() { return STORE_KEY + (this.game.state.meta?.characterId ?? ''); }
  #store(v) { try { if (v) sessionStorage.setItem(this.#key(), JSON.stringify(v)); else sessionStorage.removeItem(this.#key()); } catch { /* ohne Speicher */ } }
  #load() { try { return JSON.parse(sessionStorage.getItem(this.#key()) ?? 'null'); } catch { return null; } }

  #note(text) { this.game.bus.emit('finder:chat', { kind: 'sys', text }); }
  #changed() { this.game.bus.emit('finder:changed', { state: this.state }); }

  get labelMercs() { return FINDER_CONFIG.labelMercs; }
}
