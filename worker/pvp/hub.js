import {
  PVP_MIN_LEVEL, TIMING, DAILY_REWARDS, START_RATING, seasonAt, dayOf, seasonStart, rate, matchWindow, botRating,
  botSkill, tierOf, goldFor, stormMult, pvpDamage,
} from '../../src/pvp/rules.js';
import { PVP_VERSION, cleanHit, cleanBotResult, cleanMatchId } from '../../src/pvp/protocol.js';
import { arenaStats, arenaClass, arenaRace, maxHitDamage } from '../../src/pvp/arenaStats.js';
import { cleanState, cleanFx, cleanLook, cleanName, LEVEL_MAX } from '../../src/net/protocol.js';
import { nameProblem } from '../../src/net/names.js';
import { makeMerc } from '../../src/finder/mercs.js';
import { makeRng } from '../../src/finder/rng.js';
import { CLASSES, ABILITIES } from '../../src/character/classes.js';

// Kern der Glutarena auf dem Server, ohne Cloudflare-Abhängigkeiten (in Node testbar: worker/pvp/test/hub.test.mjs).
// Das Durable Object (arena.js) reicht Nachrichten, Schließen und den Takt herein.
//   socket: { send(string), close(code, reason) }
//   verify(token) -> Promise<{ uid } | null>
//   profile(uid, charId) -> Promise<{ name, level, classId, raceId } | null>   gespeicherter Charakter
//   store: { get(key) -> Promise<obj|undefined>, put(key, obj) -> Promise }    dauerhafter Speicher (DO-Storage)
//
// Der Server ist im Kampf zwischen zwei echten Spielern die Instanz für Leben, Treffer und Ergebnis:
//   - Leben und Rüstung aus den Arena-Werten (arenaStats.js, aus Klasse und Volk des gespeicherten Charakters)
//   - Treffer meldet der Angreifer (Grundschaden ohne Krit). Geprüft: Kampf läuft, Abstand, Obergrenze je Treffer,
//     Schadensbudget je Sekunde, Unverwundbarkeit nach einem Treffer (wie beim Helden 0,6 s). Krit würfelt der Server.
//   - Kriegsschrei (Schutz) und Schattenschritt/Blinzeln (kurz unverwundbar) liest er aus den Kampfereignissen des
//     Verteidigers, mit Abklingzeit. Unbeugsam und Blutdurst (Krieger) rechnet er selbst.
// Gegen Herausforderer (Bots) kämpft der Client allein; der Server vergibt dafür halbe Wertung bis BOT_RATING_CAP.

const HELLO_TIMEOUT_MS = 10_000;
const NEW_LEVEL_MAX = 3;       // Charakter, den die Cloud nicht kennt: höchstens so stark wie ein neuer Held (worker/moderation.js)
const MAX_MSG = 8192;
const RATE_PER_S = 40, RATE_BURST = 80;
const MAX_DIST = 360;          // Weltpixel zwischen den Kämpfern, weiter trifft nichts (Pfeil 260 + Laufweg + Verzögerung)
const INVULN_MS = 600;         // wie Hero.onHurt
const HEAL_ICD_MS = 1200;      // Blutdurst in der Arena höchstens so oft
const BOT_MIN_MS = 12_000;     // kürzer kann kein Kampf gegen einen Herausforderer gewonnen sein
const BOT_MAX_MS = 6 * 60_000;
const SHOUT_GUARD_MS = 5000, SHOUT_GUARD = 0.6;
const UNBROKEN_MS = 90_000, UNBROKEN_GUARD_MS = 3000, UNBROKEN_GUARD = 0.5;
const IMMUNE_CAST_MS = { shadow_step: 300, blink: 300, assassinate: 300, charge: 180 };
// Dauerschaden (Gift der Giftklingen, nur Schurke): Obergrenze je Takt und eigenes Budget in Takten
// (4 Takte je Vergiftung, alle 0,5 s; neue Treffer frischen auf)
const DOT_TICK_MULT = 0.35 * 1.25, DOT_BURST = 4, DOT_RATE = 2.2;
const DOT_CLASSES = { rogue: true };
const EARLY_LEAVE_MS = 5000;   // wer so kurz nach dem Gong (oder davor) aufgibt: zählt wie nicht angetreten
const PAIR_DAILY = 2;          // gewertete Kämpfe je Paar von Konten und Tag (gegen Absprachen mit Zweitkonten)
const TOP_EVERY_MS = 2000;
const MAX_CHARS = 20;          // Helden je Konto und Saison (8 gleichzeitig, account/CharacterListScene.js; Puffer für gelöschte und neue)
// Schadensbudget je Klasse: Vorrat und Nachfüllen je Sekunde, als Vielfaches von power × pvpDamage(Klasse).
// Etwa das 1,2-Fache dessen, was die Rechnung ohne Fehlschläge ergibt (src/pvp/test/sim.mjs), damit nichts
// Echtes abgelehnt wird. Die Obergrenze je Treffer (maxHitDamage) bleibt die eigentliche Sperre.
const BUDGET = {
  warrior: { burst: 16, rate: 3.4 },
  rogue: { burst: 22, rate: 3.5 },
  ranger: { burst: 17, rate: 5 },
  mage: { burst: 38, rate: 9.7 },
};
const TOP_N = 100;

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const id = (v) => (typeof v === 'string' && /^[a-z0-9_]{1,48}$/.test(v) ? v : null);
const int = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };

export class ArenaHub {
  constructor({ verify, profile = null, store, now = () => Date.now(), rnd = Math.random, timing = TIMING } = {}) {
    this.verify = verify;
    this.profile = profile;
    this.store = store;
    this.now = now;
    this.rnd = rnd;
    this.timing = timing;
    this.conns = new Map();    // socket -> Verbindung
    this.queue = new Set();    // suchende Verbindungen
    this.matches = new Map();  // id -> Kampf (echt oder gegen Herausforderer)
    this.byUid = new Map();    // uid -> laufender Kampf (für Wiederverbinden)
    this.seq = 0;
    this.lastStats = 0;
    this.topCache = new Map(); // Saison -> Liste
    this.pairs = new Map();    // Tag:Konto:Konto -> gewertete Kämpfe heute (Kopie aus dem Speicher, für die Paarung)
  }

  get size() { return this.conns.size + this.matches.size; }

  open(socket) {
    this.conns.set(socket, { socket, since: this.now(), uid: null, char: null, look: null, rec: null, state: 'idle', tokens: RATE_BURST, last: this.now(), later: [] });
  }

  async message(socket, raw) {
    const c = this.conns.get(socket);
    if (!c) return;
    if (typeof raw !== 'string' || raw.length > MAX_MSG) { this.#drop(c, 1009, 'zu groß'); return; }
    if (!this.#rate(c)) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    if (!c.uid) {
      if (m.t === 'hello' && !c.authing) await this.#hello(c, m);
      else if (c.authing && c.later.length < 4) c.later.push(m);
      return;
    }
    await this.#handle(c, m);
  }

  async #handle(c, m) {
    switch (m.t) {
      case 'queue': this.#queue(c); break;
      case 'cancel': this.queue.delete(c); if (c.state === 'queued') c.state = 'idle'; break;
      case 'ready': this.#ready(c, m); break;
      case 's': this.#state(c, m); break;
      case 'hit': await this.#hit(c, m); break;
      case 'leave': await this.#leave(c); break;
      case 'botresult': await this.#botResult(c, m); break;
      case 'top':
        if (this.now() - (c.topAt ?? -1e12) < TOP_EVERY_MS) break;
        c.topAt = this.now();
        this.#send(c, { t: 'top', season: seasonAt(this.now()).n, list: await this.publicTop() });
        break;
      default: break; // unbekannte Typen (neuere Clients) ignorieren
    }
  }

  async close(socket) {
    const c = this.conns.get(socket);
    if (!c) return;
    this.conns.delete(socket);
    this.queue.delete(c);
    const mt = c.match;
    if (!mt || mt.done) return;
    if (mt.bot) {
      // Verbindung weg mitten im Kampf gegen einen Herausforderer: zählt als Niederlage (nicht durch Schließen ausweichen)
      if (this.now() - mt.created > 3000) await this.#finishBot(mt, 0, 'left');
      else this.#forget(mt);
      return;
    }
    const f = mt.a.conn === c ? mt.a : mt.b.conn === c ? mt.b : null;
    if (f) { f.gone = this.now(); f.conn = null; }
  }

  // Takt (etwa alle 250 ms): Gegner finden, Bereitschaft, Kampfzeit, Verbindungsabbrüche
  async tick() {
    // Ein Takt kann auf den Speicher warten; der nächste beginnt erst danach (kein Kampf wird doppelt beendet)
    if (this.ticking) return;
    this.ticking = true;
    try { await this.#tick(); } finally { this.ticking = false; }
  }

  async #tick() {
    const now = this.now();
    for (const c of [...this.conns.values()]) if (!c.uid && now - c.since > HELLO_TIMEOUT_MS) this.#drop(c, 4000, 'hello');
    this.#pair(now);
    for (const mt of [...this.matches.values()]) {
      if (mt.done) continue;
      if (mt.bot) { if (now - mt.created > BOT_MAX_MS) await this.#finishBot(mt, 0, 'absent'); continue; }
      await this.#advance(mt, now);
    }
    if (now - this.lastStats >= 4000) {
      this.lastStats = now;
      for (const c of this.queue) this.#send(c, { t: 'stats', searching: this.queue.size });
    }
  }

  // ------------------------------------------------------------------ Anmeldung
  async #hello(c, m) {
    if (m.v !== PVP_VERSION) { this.#bye(c, 'version'); return; }
    c.authing = true;
    const user = await this.verify(m.token).catch(() => null);
    if (!this.conns.has(c.socket)) return;
    if (!user) { this.#bye(c, 'auth'); return; }
    const raw = m.char && typeof m.char === 'object' ? m.char : {};
    const charId = typeof raw.id === 'string' && ID_RE.test(raw.id) ? raw.id : '';
    if (!charId) { this.#bye(c, 'auth'); return; }
    // Gespeicherter Charakter, falls die Cloud ihn liefert. Kennt sie ihn nicht (erfunden, noch nie hochgeladen), zählt er
    // wie ein neuer Held (NEW_LEVEL_MAX, zu niedrig für die Arena). Nur bei einer Störung gelten die Angaben des Clients;
    // gegen erfundene Charaktere dann höchstens MAX_CHARS Wertungen je Konto und Saison.
    const found = this.profile ? await this.profile(user.uid, charId).catch(() => null) : null;
    const stored = found?.missing ? null : found;
    if (!this.conns.has(c.socket)) return;
    if (!(await this.#claim(user.uid, charId))) { this.#bye(c, 'many'); return; }
    if (!this.conns.has(c.socket)) return;
    // Name, Stufe, Klasse und Volk aus dem Speicherstand (Stufe höchstens eine darüber, wie auf dem Welt-Server)
    const levelMax = stored ? Math.min(LEVEL_MAX, stored.level + 1) : found?.missing ? NEW_LEVEL_MAX : LEVEL_MAX;
    const char = {
      id: charId,
      name: cleanName(stored?.name || raw.name),
      level: Math.max(stored?.level ?? 1, Math.min(int(raw.level, 1, LEVEL_MAX, 1), levelMax)),
      classId: arenaClass(stored?.classId ?? id(raw.classId)),
      raceId: arenaRace(stored?.raceId ?? id(raw.raceId)),
    };
    if (nameProblem(char.name)) char.name = 'Abenteurer';
    if (char.level < PVP_MIN_LEVEL) { this.#bye(c, 'level'); return; }
    // Dasselbe Konto schon verbunden (zweiter Tab, Neuladen): die alte Verbindung endet, ein laufender Kampf geht weiter
    // (close() meldet den alten Kämpfer als weg; Wiederverbinden mit demselben Charakter übernimmt ihn)
    for (const o of [...this.conns.values()]) if (o !== c && o.uid === user.uid) this.#bye(o, 'replaced');
    c.uid = user.uid;
    c.char = char;
    c.look = cleanLook(m.look);
    if (c.look) { c.look.classId = char.classId; c.look.raceId = char.raceId; }
    c.rec = await this.#loadRec(c.uid, char);
    if (!this.conns.has(c.socket)) return;
    this.#send(c, { t: 'welcome', v: PVP_VERSION, me: await this.#me(c), season: seasonAt(this.now()) });
    this.#resume(c);
    for (const x of c.later.splice(0)) await this.#handle(c, x);
  }

  // Laufender Kampf nach Neuverbinden
  #resume(c) {
    const mt = this.byUid.get(c.uid);
    if (!mt || mt.done || mt.bot) return;
    const f = mt.a.uid === c.uid ? mt.a : mt.b.uid === c.uid ? mt.b : null;
    if (!f || f.charId !== c.char.id) return;
    f.conn = c; f.gone = null;
    c.match = mt; c.state = 'match';
    const foe = f === mt.a ? mt.b : mt.a;
    this.#send(c, { t: 'match', id: mt.id, side: f.side, foe: foe.info, resume: true, phase: mt.phase });
    if (mt.phase !== 'ready') this.#send(c, { t: 'go', in: Math.max(0, mt.startAt - this.now()) });
    for (const x of [f, foe]) this.#send(c, { t: 'hp', side: x.side, hp: x.hp, max: x.max, dmg: 0 });
  }

  // ------------------------------------------------------------------ Suche
  #queue(c) {
    if (c.state === 'match' && c.match && !c.match.done) return;
    c.state = 'queued';
    c.queuedAt = this.now();
    c.match = null;
    this.queue.add(c);
    this.#send(c, { t: 'queued', searching: this.queue.size });
  }

  // Echte Gegner zuerst: ähnliche Wertung, Fenster wächst mit der Wartezeit. Sonst nach botAfterMs ein Herausforderer.
  #pair(now) {
    const list = [...this.queue].sort((x, y) => x.queuedAt - y.queuedAt);
    const used = new Set();
    for (const a of list) {
      if (used.has(a)) continue;
      let best = null, bestGap = Infinity;
      for (const b of list) {
        if (b === a || used.has(b) || b.uid === a.uid) continue;
        if ((this.pairs.get(this.#pairKey(a.uid, b.uid, now)) ?? 0) >= PAIR_DAILY) continue;
        const gap = Math.abs(a.rec.rating - b.rec.rating);
        const win = Math.min(matchWindow(now - a.queuedAt), matchWindow(now - b.queuedAt));
        if (gap <= win && gap < bestGap) { best = b; bestGap = gap; }
      }
      if (best) { used.add(a); used.add(best); this.#startMatch(a, best, now); continue; }
      if (now - a.queuedAt >= this.timing.botAfterMs) { used.add(a); this.#startBot(a, now); }
    }
  }

  #fighter(c, side) {
    const st = arenaStats(c.char.classId, c.char.raceId);
    const b = BUDGET[st.classId] ?? BUDGET.warrior;
    const unit = st.power * pvpDamage(st.classId);
    return {
      conn: c, uid: c.uid, charId: c.char.id, side, stats: st, hp: st.maxHp, max: st.maxHp,
      info: { name: c.char.name, level: c.char.level, classId: c.char.classId, raceId: c.char.raceId, look: c.look, rating: c.rec.rating },
      pos: null, ready: false, gone: null,
      invulnUntil: 0, immuneUntil: 0, guardUntil: 0, guardMult: 1, ubReady: 0, lastShout: -1e12, lastHeal: -1e12,
      budget: unit * b.burst, budgetMax: unit * b.burst, budgetRate: unit * b.rate, budgetAt: 0,
      maxHit: maxHitDamage(st), dealt: 0,
      dotMax: unit * DOT_TICK_MULT, dot: DOT_BURST, dotAt: 0, casts: {},
    };
  }

  #startMatch(ca, cb, now) {
    this.queue.delete(ca); this.queue.delete(cb);
    const mt = { id: this.#newId(), bot: false, created: now, phase: 'ready', startAt: 0, done: false };
    mt.a = this.#fighter(ca, 'a');
    mt.b = this.#fighter(cb, 'b');
    this.matches.set(mt.id, mt);
    for (const f of [mt.a, mt.b]) {
      f.conn.state = 'match'; f.conn.match = mt;
      this.byUid.set(f.uid, mt);
      const foe = f === mt.a ? mt.b : mt.a;
      this.#send(f.conn, { t: 'match', id: mt.id, side: f.side, foe: foe.info });
    }
  }

  #startBot(c, now) {
    this.queue.delete(c);
    const seed = Math.floor(this.rnd() * 0xffffffff) >>> 0;
    const merc = makeMerc(makeRng(seed), { role: 'dps', level: 40, takenNames: new Set([c.char.name.toLowerCase()]) });
    const rating = botRating(c.rec.rating, this.rnd);
    const mt = { id: this.#newId(), bot: true, conn: c, uid: c.uid, created: now, rating, done: false };
    this.matches.set(mt.id, mt);
    c.state = 'match'; c.match = mt;
    const foe = { name: merc.name, level: 40, classId: merc.classId, raceId: merc.raceId, look: merc.look, rating, bot: true, seed, skill: botSkill(rating) };
    this.#send(c, { t: 'bot', id: mt.id, foe });
  }

  // ------------------------------------------------------------------ Kampf (echt)
  #ready(c, m) {
    const mt = c.match;
    if (!mt || mt.bot || mt.done || cleanMatchId(m.id) !== mt.id) return;
    const f = mt.a.conn === c ? mt.a : mt.b;
    f.ready = true;
    if (mt.phase === 'ready' && mt.a.ready && mt.b.ready) {
      mt.phase = 'countdown';
      mt.startAt = this.now() + this.timing.countdownMs;
      for (const x of [mt.a, mt.b]) this.#send(x.conn, { t: 'go', in: this.timing.countdownMs });
    }
  }

  async #advance(mt, now) {
    if (mt.phase === 'ready' && now - mt.created > this.timing.readyMs) {
      const a = mt.a.ready, b = mt.b.ready;
      if (a && !b) await this.#finish(mt, mt.a, 'absent');
      else if (b && !a) await this.#finish(mt, mt.b, 'absent');
      else await this.#finish(mt, null, 'absent', { void: true });
      return;
    }
    if (mt.phase === 'countdown' && now >= mt.startAt) mt.phase = 'fight';
    for (const f of [mt.a, mt.b]) {
      if (f.gone && now - f.gone > this.timing.graceMs) { await this.#finish(mt, f === mt.a ? mt.b : mt.a, mt.phase !== 'fight' || f.gone - mt.startAt < EARLY_LEAVE_MS ? 'absent' : 'left'); return; }
    }
    if (mt.phase === 'fight' && now - mt.startAt >= this.timing.matchMs) {
      const pa = mt.a.hp / mt.a.max, pb = mt.b.hp / mt.b.max;
      await this.#finish(mt, Math.abs(pa - pb) < 0.005 ? null : pa > pb ? mt.a : mt.b, 'time');
    }
  }

  #state(c, m) {
    const mt = c.match;
    if (!mt || mt.bot || mt.done) return;
    const f = mt.a.conn === c ? mt.a : mt.b.conn === c ? mt.b : null;
    if (!f) return;
    const s = cleanState(m.s);
    if (!s) return;
    const now = this.now();
    f.pos = { x: s[0], y: s[1] };
    const fx = cleanFx(m.fx);
    for (const e of fx) {
      if (e[0] !== 'k') continue;
      if (e[2] === 'battle_shout' && f.stats.classId === 'warrior') {
        const cd = 14_000 * (f.stats.cooldownMult ?? 1) * 0.9;
        if (now - f.lastShout >= cd) { f.lastShout = now; f.guardUntil = now + SHOUT_GUARD_MS; f.guardMult = SHOUT_GUARD; }
      }
      // Kurz unverwundbar nur mit einer Fähigkeit der eigenen Klasse und nach deren Abklingzeit
      const imm = IMMUNE_CAST_MS[e[2]];
      if (imm && CLASSES[f.stats.classId]?.abilities.includes(e[2])) {
        const cd = (ABILITIES[e[2]]?.cooldown ?? 10) * 1000 * (f.stats.cooldownMult ?? 1) * 0.9;
        if (now - (f.casts[e[2]] ?? -1e12) >= cd) { f.casts[e[2]] = now; f.immuneUntil = Math.max(f.immuneUntil, now + imm); }
      }
    }
    const foe = f === mt.a ? mt.b : mt.a;
    if (foe.conn) this.#send(foe.conn, fx.length ? { t: 'u', s, fx } : { t: 'u', s });
  }

  async #hit(c, m) {
    const mt = c.match;
    if (!mt || mt.bot || mt.done || mt.phase !== 'fight') return;
    const A = mt.a.conn === c ? mt.a : mt.b.conn === c ? mt.b : null;
    if (!A) return;
    const B = A === mt.a ? mt.b : mt.a;
    const h = cleanHit(m);
    if (!h || A.hp <= 0 || B.hp <= 0) return;
    const now = this.now();
    if (A.pos && B.pos && Math.hypot(A.pos.x - B.pos.x, A.pos.y - B.pos.y) > MAX_DIST) return;
    let d;
    if (h.dot) {
      // Gifttakt: nur Schurken, höchstens ein Takt der Giftklingen, eigenes Budget in Takten
      if (!DOT_CLASSES[A.stats.classId]) return;
      d = Math.min(h.d, A.dotMax);
      A.dot = Math.min(DOT_BURST, A.dot + Math.max(0, now - (A.dotAt || now)) / 1000 * DOT_RATE);
      A.dotAt = now;
      if (A.dot < 1) return;
      A.dot -= 1;
    } else {
      d = Math.min(h.d, A.maxHit);
      // Schadensbudget (füllt sich je Sekunde nach)
      A.budget = Math.min(A.budgetMax, A.budget + Math.max(0, now - (A.budgetAt || now)) / 1000 * A.budgetRate);
      A.budgetAt = now;
      if (d > A.budget) return;
      if (now < B.invulnUntil || now < B.immuneUntil) return;
      A.budget -= d;
    }
    const crit = !h.dot && this.rnd() < (A.stats.critChance ?? 0);
    let dmg = d * (crit ? 1.8 : 1) * (h.dot ? 1 : 1 - B.stats.damageReduction);
    if (now < B.guardUntil) dmg *= B.guardMult;
    dmg *= stormMult(now - mt.startAt);
    dmg = Math.max(1, Math.round(dmg));
    let ub = false;
    if (dmg >= B.hp && B.stats.passives?.unbroken && now >= B.ubReady) {
      ub = true;
      dmg = Math.max(0, B.hp - 1);
      B.ubReady = now + UNBROKEN_MS;
      B.guardUntil = now + UNBROKEN_GUARD_MS; B.guardMult = UNBROKEN_GUARD;
    }
    B.hp = Math.max(0, B.hp - dmg);
    if (!h.dot) B.invulnUntil = now + INVULN_MS;
    A.dealt += dmg;
    this.#both(mt, { t: 'hp', side: B.side, hp: B.hp, max: B.max, dmg, crit, dot: h.dot, heavy: h.heavy, ...(ub ? { ub: 1 } : {}) });
    // Blutdurst: schwere Treffer heilen den Krieger (nur große Treffer zählen als schwer)
    const heavyOk = h.heavy && d >= A.stats.power * pvpDamage(A.stats.classId) * 1.2;
    if (!h.dot && heavyOk && A.stats.passives?.bloodlust && now - A.lastHeal >= HEAL_ICD_MS && A.hp > 0 && A.hp < A.max) {
      A.lastHeal = now;
      const heal = Math.min(A.max - A.hp, Math.round(A.max * (A.stats.mastery?.bloodlustHeal ?? 0.03)));
      A.hp += heal;
      this.#both(mt, { t: 'hp', side: A.side, hp: A.hp, max: A.max, dmg: 0, heal });
    }
    if (B.hp <= 0) await this.#finish(mt, A, 'ko');
  }

  async #leave(c) {
    const mt = c.match;
    if (!mt || mt.done) { this.queue.delete(c); c.state = 'idle'; return; }
    if (mt.bot) { await this.#finishBot(mt, 0, 'left'); return; }
    const f = mt.a.conn === c ? mt.a : mt.b;
    await this.#finish(mt, f === mt.a ? mt.b : mt.a, this.#early(mt) ? 'absent' : 'left');
  }

  // Kampf noch nicht richtig begonnen: Aufgeben/Abbruch zählt wie nicht angetreten (nur der Gehende verliert)
  #early(mt) { return mt.phase !== 'fight' || this.now() - mt.startAt < EARLY_LEAVE_MS; }

  // Ergebnis eines echten Kampfes: Wertung beider, Tagesbelohnung, Bestenliste
  async #finish(mt, winner, reason, { void: nothing = false } = {}) {
    if (mt.done) return;
    mt.done = true;
    mt.phase = 'done';
    const fighters = [mt.a, mt.b];
    const recs = await Promise.all(fighters.map((f) => this.#recFor(f)));
    // Dasselbe Paar von Konten zählt nur PAIR_DAILY-mal am Tag (Absprachen mit Zweitkonten)
    if (!nothing) {
      const pk = this.#pairKey(mt.a.uid, mt.b.uid, this.now());
      const n = Math.max(this.pairs.get(pk) ?? 0, (await this.store.get(pk).catch(() => 0)) ?? 0);
      if (n >= PAIR_DAILY) nothing = true;
      else { this.pairs.set(pk, n + 1); await this.store.put(pk, n + 1).catch(() => {}); }
    }
    const out = [];
    for (let i = 0; i < 2; i++) {
      const f = fighters[i], foe = fighters[1 - i], rec = recs[i], foeRec = recs[1 - i];
      // Nicht angetreten: nur wer fehlte, verliert; wer da war, bekommt nichts (keine Siege über Zweitkonten)
      const score = winner ? (winner === f ? 1 : 0) : 0.5;
      const counts = !nothing && !(reason === 'absent' && winner === f);
      let delta = 0, gold = 0;
      if (counts) {
        const r = rate(rec.rating, foeRec.rating, score, { games: rec.games });
        delta = r.delta;
        rec.rating = r.rating;
        rec.games++;
        if (score === 1) rec.wins++; else if (score === 0) rec.losses++; else rec.draws++;
        rec.best = Math.max(rec.best, rec.rating);
        rec.name = f.info.name;
        rec.updated = this.now();
        await this.#saveRec(rec);
        if (reason !== 'absent') gold = await this.#reward(f.uid, f.info.level, score);
      }
      out.push({ f, rec, delta, gold, result: score === 1 ? 'win' : score === 0 ? 'loss' : 'draw', counts });
    }
    for (const o of out) {
      const c = o.f.conn;
      if (c) {
        this.#send(c, { t: 'end', id: mt.id, result: o.counts || reason !== 'absent' ? o.result : 'void', reason, me: this.#meOf(o.rec, c.daily), delta: o.delta, gold: o.gold });
        c.state = 'idle'; c.match = null;
      }
      if (this.byUid.get(o.f.uid) === mt) this.byUid.delete(o.f.uid);
    }
    this.matches.delete(mt.id);
  }

  // ------------------------------------------------------------------ Kampf gegen Herausforderer
  async #botResult(c, m) {
    const r = cleanBotResult(m);
    const mt = c.match;
    if (!r || !mt?.bot || mt.done || mt.id !== r.id) return;
    let score = r.score;
    // Ein Sieg in wenigen Sekunden ist nicht möglich: als ungültig verwerfen (keine Wertung)
    if (score > 0 && this.now() - mt.created < BOT_MIN_MS) score = -1;
    await this.#finishBot(mt, score, 'ko');
  }

  async #finishBot(mt, score, reason) {
    if (mt.done) return;
    mt.done = true;
    const c = mt.conn;
    const rec = await this.#recForUid(mt.uid, c?.char);
    let delta = 0, gold = 0;
    if (rec && score >= 0) {
      const r = rate(rec.rating, mt.rating, score, { games: rec.games, bot: true });
      delta = r.delta;
      rec.rating = r.rating;
      rec.games++;
      if (score === 1) rec.wins++; else if (score === 0) rec.losses++; else rec.draws++;
      rec.best = Math.max(rec.best, rec.rating);
      rec.updated = this.now();
      await this.#saveRec(rec);
      if (reason !== 'left' || score > 0) gold = await this.#reward(mt.uid, c?.char?.level ?? 1, score);
    }
    if (c && this.conns.has(c.socket)) {
      this.#send(c, { t: 'end', id: mt.id, result: score === 1 ? 'win' : score === 0.5 ? 'draw' : score === 0 ? 'loss' : 'void', reason, me: rec ? this.#meOf(rec, c.daily) : null, delta, gold });
      c.state = 'idle'; c.match = null;
    }
    this.matches.delete(mt.id);
  }

  #forget(mt) { mt.done = true; this.matches.delete(mt.id); }

  // ------------------------------------------------------------------ Wertung, Speicher
  #key(season, uid, charId) { return `r:${season}:${uid}:${charId}`; }

  async #loadRec(uid, char) {
    const season = seasonAt(this.now()).n;
    const cur = await this.store.get(this.#key(season, uid, char.id)).catch(() => null);
    if (cur) return { ...cur, name: char.name, classId: char.classId };
    const prev = season > 1 ? await this.store.get(this.#key(season - 1, uid, char.id)).catch(() => null) : null;
    const rating = seasonStart(prev?.rating ?? START_RATING);
    return { uid, charId: char.id, name: char.name, classId: char.classId, season, rating, wins: 0, losses: 0, draws: 0, games: 0, best: rating, updated: 0 };
  }

  // Wertung zum Kampfende (Saisonwechsel während des Kampfes: neue Saison mit Startwert)
  async #recFor(f) {
    const c = f.conn;
    return this.#recForUid(f.uid, c?.char ?? { id: f.charId, name: f.info.name, classId: f.info.classId }, c?.rec);
  }

  async #recForUid(uid, char, cached = null) {
    const season = seasonAt(this.now()).n;
    if (cached && cached.season === season) return cached;
    const c = [...this.conns.values()].find((x) => x.uid === uid && x.char?.id === char?.id);
    if (c?.rec?.season === season) return c.rec;
    if (!char?.id) return null;
    const rec = await this.#loadRec(uid, char);
    if (c) c.rec = rec;
    return rec;
  }

  // Charakter für die Saison anmelden; false, wenn das Konto schon MAX_CHARS andere Helden in der Arena hat
  async #claim(uid, charId) {
    const key = `a:${seasonAt(this.now()).n}:${uid}`;
    const list = (await this.store.get(key).catch(() => null)) ?? [];
    if (list.includes(charId)) return true;
    if (list.length >= MAX_CHARS) return false;
    await this.store.put(key, [...list, charId]).catch(() => {});
    return true;
  }

  async #saveRec(rec) {
    await this.store.put(this.#key(rec.season, rec.uid, rec.charId), rec).catch((e) => console.error('pvp save', e?.message));
    for (const c of this.conns.values()) if (c.uid === rec.uid && c.char?.id === rec.charId) c.rec = rec;
    const list = await this.top(rec.season);
    const k = `${rec.uid}:${rec.charId}`;
    const next = list.filter((x) => x.k !== k);
    if (rec.games > 0) next.push({ k, name: rec.name, classId: rec.classId, rating: rec.rating, wins: rec.wins, losses: rec.losses });
    next.sort((x, y) => y.rating - x.rating || y.wins - x.wins);
    next.length = Math.min(next.length, TOP_N);
    this.topCache.set(rec.season, next);
    await this.store.put(`top:${rec.season}`, next).catch(() => {});
  }

  // Bestenliste der Saison (ohne Konto-Schlüssel)
  async top(season = seasonAt(this.now()).n) {
    let list = this.topCache.get(season);
    if (!list) {
      list = (await this.store.get(`top:${season}`).catch(() => null)) ?? [];
      this.topCache.set(season, list);
    }
    return list;
  }

  async publicTop(season = seasonAt(this.now()).n, n = 50) {
    return (await this.top(season)).slice(0, n).map(({ name, classId, rating, wins, losses }) => ({ name, classId, rating, wins, losses }));
  }

  // Tagesbelohnung: Gold für die ersten DAILY_REWARDS Kämpfe am Tag (je Konto)
  async #reward(uid, level, score) {
    const key = `d:${dayOf(this.now())}:${uid}`;
    const n = (await this.store.get(key).catch(() => 0)) ?? 0;
    for (const c of this.conns.values()) if (c.uid === uid) c.daily = Math.min(DAILY_REWARDS, n + 1);
    if (n >= DAILY_REWARDS) return 0;
    await this.store.put(key, n + 1).catch(() => {});
    return goldFor(level, score);
  }

  async #me(c) {
    const n = (await this.store.get(`d:${dayOf(this.now())}:${c.uid}`).catch(() => 0)) ?? 0;
    c.daily = n;
    return this.#meOf(c.rec, n);
  }

  #meOf(rec, daily = 0) {
    return {
      rating: rec.rating, wins: rec.wins, losses: rec.losses, draws: rec.draws, games: rec.games, best: rec.best,
      tier: tierOf(rec.rating).id, bestTier: tierOf(rec.best).id, season: rec.season, daily: daily ?? 0,
    };
  }

  // ------------------------------------------------------------------ intern
  #pairKey(u1, u2, now) {
    const day = dayOf(now);
    if (this.pairsDay !== day) { this.pairs.clear(); this.pairsDay = day; }
    return `p:${day}:${u1 < u2 ? `${u1}:${u2}` : `${u2}:${u1}`}`;
  }

  #newId() { return `m${(++this.seq).toString(36)}${Math.floor(this.rnd() * 1e9).toString(36)}`.slice(0, 24); }

  #both(mt, msg) { for (const f of [mt.a, mt.b]) if (f.conn) this.#send(f.conn, msg); }

  #rate(c) {
    const now = this.now();
    c.tokens = Math.min(RATE_BURST, c.tokens + (now - c.last) / 1000 * RATE_PER_S);
    c.last = now;
    if (c.tokens < 1) return false;
    c.tokens -= 1;
    return true;
  }

  #send(c, msg) { try { c.socket.send(JSON.stringify(msg)); } catch { /* Verbindung weg: close() räumt auf */ } }

  #bye(c, reason) { this.#send(c, { t: 'bye', reason }); this.#drop(c, 4000 + ({ auth: 3, version: 2, level: 4, many: 5 }[reason] ?? 1), reason); }

  #drop(c, code, reason) {
    this.close(c.socket);
    try { c.socket.close(code, reason); } catch { /* schon zu */ }
  }
}
