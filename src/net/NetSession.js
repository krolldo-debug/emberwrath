import { EV } from '../core/events.js';
import { CONFIG } from '../config.js';
import { getHeroSprites, heroRes } from '../sprites/hero.js';
import { resolveGear } from '../character/gearLook.js';
import { spriteStyle } from '../character/cosmetics.js';
import { RemotePlayer } from './RemotePlayer.js';
import { NetHud } from './NetHud.js';
import { SEND_HZ, IDLE_RESEND_S, FLAG_DEAD, FLAG_RIDING, FLAG_COMBAT, cleanLook } from './protocol.js';

// Sitzungssystem 'net' (eine Spielsitzung = PlayScene): verbindet NetClient und Welt.
//  - andere Spieler als RemotePlayer in world.entities (auch nach Zonenwechsel), Figuren aus ihrem Abbild
//  - eigener Zustand (Position, Richtung, Animation, Flags) höchstens SEND_HZ pro Sekunde, nur bei Änderung
//  - Aussehen/Ausrüstung/Stufe bei Änderung
//  - Namensschilder über anderen Spielern, HUD (Welt, Spielerzahl, Weltwechsel, Zonen-Chat)
const MAX_FINE = 12; // höchstens so viele fremde Figuren in voller Feinheit, der Rest einfacher (Speicher auf Handys)

// Abbild des eigenen Helden (INTEGRATION §12.9). Solange hero.snapshotLook() fehlt, aus dem Spielstand.
export function lookOf(session) {
  const hero = session.world?.hero;
  if (typeof hero?.snapshotLook === 'function') { try { return hero.snapshotLook(); } catch { /* Rückfall */ } }
  const st = session.state.slices, ch = st.character ?? {}, ap = ch.appearance ?? {};
  const mounts = ch.mounts ?? {};
  return {
    raceId: hero?.raceId ?? ch.raceId ?? null, classId: ch.classId ?? null,
    appearance: { variant: ap.variant ?? 0, dye: ap.dye ?? null, hairStyle: ap.hairStyle ?? null },
    gear: resolveGear(st.inventory?.equipment, session.content),
    mountId: mounts.active ?? null, riding: !!mounts.riding,
  };
}

// Figur eines fremden Spielers aus seinem Abbild. Bereich A kann game.character.animsForLook(look, res) bereitstellen
// (z. B. mit Reittier); sonst die normale Heldenfigur.
function buildAnims(game, look, res) {
  const custom = game.character?.animsForLook;
  if (typeof custom === 'function') { try { const a = custom(look, res); if (a?.idle) return a; } catch (e) { console.warn(e); } }
  const c = game.content;
  const raceId = c.find('race', look?.raceId) ? look.raceId : 'human';
  const classId = c.find('class', look?.classId) ? look.classId : 'warrior';
  try {
    return getHeroSprites(raceId, classId, look?.appearance?.variant ?? 0, look?.gear ?? null, spriteStyle(look?.appearance), res);
  } catch (e) {
    console.warn('Figur eines Mitspielers nicht darstellbar', e);
    return getHeroSprites(raceId, classId, 0, null, null, res);
  }
}

export class NetSession {
  constructor(session, net) {
    this.s = session;
    this.game = session.game;
    this.net = net;
    this.client = net.client;
    this.remotes = new Map(); // netId -> RemotePlayer
    this.world = null;
    this.buildQueue = [];
    this.sendTimer = 0;
    this.lastSent = null;
    this.lastSentAt = 0;
    this.animSeq = 0;
    this.animName = '';
    this.animTime = 0;
    this.lookJson = '';
    this.lookCheck = 0;
    this.hud = new NetHud(session, net);
    const c = this.client;
    this.offs = [
      c.on('welcome', (m) => { this.#clear(); for (const p of m.players ?? []) this.#add(p); this.lookJson = ''; this.lastSent = null; this.hud.onWelcome(m, this.remotes.size); }),
      c.on('join', (m) => { this.#add(m.p); this.hud.population(this.remotes.size); }),
      c.on('leave', (m) => { this.#remove(m.id); this.hud.population(this.remotes.size); }),
      c.on('u', (m) => { const now = performance.now(); for (const s of m.s ?? []) this.remotes.get(s[0])?.push(s.slice(1), now); }),
      c.on('look', (m) => this.#setLook(m.id, m.look, m.level)),
      c.on('chat', (m) => { const r = this.remotes.get(m.id); this.hud.chat(m, m.id === c.selfId, r ? { id: r.netId, k: r.k, name: r.name } : { id: m.id, name: m.name }); }),
      c.on('resync', () => { this.lookJson = ''; this.lastSent = null; }),
      c.on('disconnected', () => this.#clear()),
      c.on('status', (e) => this.hud.status(e, this.remotes.size)),
    ];
    this.hud.status({ status: c.status, zone: c.zone, world: c.world, cap: c.cap }, 0);
    // Aussehen bei Ausrüstungs-/Stufenwechsel sofort prüfen
    session.bus.on(EV.STATE_CHANGED, () => { this.lookCheck = 0; });
  }

  // Daten für die erste Nachricht an einen Shard
  hello() {
    const st = this.s.state.slices;
    const look = cleanLook(lookOf(this.s));
    this.lookJson = JSON.stringify([st.progress?.level ?? 1, look]);
    this.lastSent = null;
    return {
      char: { id: this.s.state.meta.characterId, name: st.character?.name ?? '', level: st.progress?.level ?? 1 },
      look, s: this.#ownState(performance.now()),
    };
  }

  update(dt) {
    const world = this.s.world;
    if (world !== this.world) { this.world = world; for (const r of this.remotes.values()) this.#attach(r); }
    // eine Figur pro Frame bauen (kein Ruckeln, wenn viele Spieler auf einmal erscheinen)
    const next = this.buildQueue.shift();
    if (next && this.remotes.get(next.netId) === next) this.#build(next);
    const now = performance.now();
    for (const r of this.remotes.values()) r.tick(dt, now);
    if (this.client.online && world?.hero) this.#sendOwn(dt, now);
    this.hud.update(dt);
  }

  // Namensschilder (Weltpixel, nach Welt und Licht gezeichnet)
  draw(ctx) {
    const cam = this.s.camera, font = this.s.font;
    if (!cam || !font || !this.remotes.size) return;
    const cx = cam.rx, cy = cam.ry, W = CONFIG.viewWidth, H = CONFIG.viewHeight;
    for (const r of this.remotes.values()) {
      if (!r.animator || r.alpha < 0.3) continue;
      const x = Math.round(r.x - cx), y = Math.round(r.y - cy - (r.riding ? 42 : 34));
      if (x < -40 || y < -10 || x > W + 40 || y > H + 40) continue;
      const lvl = String(r.level), name = r.name;
      const wl = font.measure(lvl), wn = font.measure(name), total = wl + 3 + wn;
      const x0 = Math.round(x - total / 2);
      ctx.globalAlpha = r.dead ? 0.5 : 0.95 * r.alpha;
      font.draw(ctx, lvl, x0, y, { color: '#f2c14e', outline: true });
      font.draw(ctx, name, x0 + wl + 3, y, { color: '#9fd8ff', outline: true });
      ctx.globalAlpha = 1;
    }
  }

  dispose() {
    for (const off of this.offs) off();
    this.#clear();
    this.hud.dispose();
  }

  // ------------------------------------------------------------------ intern
  #add(p) {
    if (!p || p.id === this.client.selfId) return;
    this.#remove(p.id);
    const r = new RemotePlayer(p);
    this.remotes.set(p.id, r);
    this.#attach(r);
    this.buildQueue.push(r);
  }

  #remove(id) {
    const r = this.remotes.get(id);
    if (!r) return;
    this.remotes.delete(id);
    r.removed = true;
    const list = this.world?.entities;
    const i = list ? list.indexOf(r) : -1;
    if (i >= 0) list.splice(i, 1);
  }

  #clear() { for (const id of [...this.remotes.keys()]) this.#remove(id); this.buildQueue = []; }

  #attach(r) {
    const w = this.world;
    if (w && !w.entities.includes(r)) { r.removed = false; w.entities.push(r); }
  }

  #setLook(id, look, level) {
    const r = this.remotes.get(id);
    if (!r) return;
    r.level = level ?? r.level;
    const key = JSON.stringify(look ?? null);
    if (key === r.lookKey) return;
    r.look = look;
    if (!this.buildQueue.includes(r)) this.buildQueue.push(r);
  }

  #build(r) {
    const key = JSON.stringify(r.look ?? null);
    let fine = 0;
    for (const o of this.remotes.values()) if (o !== r && o.fine) fine++;
    r.fine = fine < MAX_FINE;
    r.lookKey = key;
    r.setAnims(buildAnims(this.game, r.look, r.fine ? heroRes() : 1));
  }

  #ownState(now) {
    const h = this.s.world?.hero;
    if (!h) return [0, 0, 1, 'idle', 0, 0, Math.round(now)];
    const a = h.animator;
    const name = a?.name || 'idle';
    if (name !== this.animName || (a && a.time + 1e-6 < this.animTime)) this.animSeq++;
    this.animName = name; this.animTime = a?.time ?? 0;
    const ch = this.s.state.slices.character ?? {};
    let fl = 0;
    if (h.dead) fl |= FLAG_DEAD;
    if (h.riding ?? ch.mounts?.riding) fl |= FLAG_RIDING;
    if ((h.combatTime ?? 99) < 3) fl |= FLAG_COMBAT;
    return [Math.round(h.x), Math.round(h.y), h.facing < 0 ? -1 : 1, name, this.animSeq, fl, Math.round(now)];
  }

  #sendOwn(dt, now) {
    // Aussehen/Stufe höchstens einmal pro Sekunde prüfen (oder sofort nach einer Zustandsänderung)
    this.lookCheck -= dt;
    if (this.lookCheck <= 0) {
      this.lookCheck = 1;
      const level = this.s.state.slices.progress?.level ?? 1;
      const look = cleanLook(lookOf(this.s));
      const json = JSON.stringify([level, look]);
      if (json !== this.lookJson && this.client.send({ t: 'look', level, look })) this.lookJson = json;
    }
    const s = this.#ownState(now);
    const prev = this.lastSent;
    const animChanged = !prev || prev[3] !== s[3] || prev[4] !== s[4] || prev[5] !== s[5];
    const moved = !prev || prev[0] !== s[0] || prev[1] !== s[1] || prev[2] !== s[2];
    const since = now - this.lastSentAt;
    const due = (moved && since >= 1000 / SEND_HZ) || (animChanged && since >= 50) || since >= IDLE_RESEND_S * 1000;
    if (!due) return;
    if (this.client.send({ t: 's', s })) { this.lastSent = s; this.lastSentAt = now; }
  }
}
