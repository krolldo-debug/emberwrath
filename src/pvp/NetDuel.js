import { RemotePlayer } from '../net/RemotePlayer.js';
import { RemoteCombat } from '../net/RemoteCombat.js';
import { getHeroSprites, heroRes } from '../sprites/hero.js';
import { resolveGear } from '../character/gearLook.js';
import { spriteStyle } from '../character/cosmetics.js';
import { SEND_HZ, IDLE_RESEND_S, FX_MAX, FX_UPGRADED, FX_MULTISHOT, FX_INFERNO, FX_INFERNO_BIG, FX_PIERCE, cleanFx } from '../net/protocol.js';

// Kampf gegen einen echten Spieler (src/pvp/README.md). Der Server ist die Instanz für Leben und Ergebnis:
//   - NetRival: der Gegner. Position, Animation und Kampfereignisse kommen vom Server (wie andere Spieler in der
//     Welt, net/RemotePlayer.js); er steht aber in world.actors und world.enemies, damit eigene Hiebe, Geschosse und
//     die Zielhilfe ihn treffen. Ein Treffer wird nicht hier abgezogen, sondern dem Server gemeldet (onHit); die
//     Antwort 'hp' setzt das Leben (serverHp). Gifttakte, die hier am Leben ziehen, gehen ebenso als Treffer hinaus.
//   - DuelLink: eigener Zustand und eigene Kampfereignisse an den Server (für die Anzeige beim Gegner), so wie
//     net/NetSession.js es für die Welt tut.
const STRAIGHT = new Set(['volley', 'piercing_shot', 'fan_of_knives', 'fireball']);

export class NetRival extends RemotePlayer {
  constructor(foe, x, y, { max, onHit }) {
    const look = { ...(foe.look ?? {}), classId: foe.classId, raceId: foe.raceId };
    super({ id: 'rival', name: foe.name, level: 40, look, s: [x, y, x > 0 ? -1 : 1, 'idle', 0, 0, 0] });
    this.rival = true;
    this.team = 'foe';
    this.classId = foe.classId;
    this.hurtable = true;
    this.hurtRadius = 6;
    this.bodyHeight = 18;
    this.radius = 5;
    this.solid = false;
    this.rise = 1;
    this.material = 'flesh';
    this.killReported = true;
    this.groupScaled = true; // keine Dungeon-Skalierung (finder/groupScale.js)
    this.maxHp = max;
    this.srvHp = max;
    this.downed = false;
    this.onHit = onHit;
    this.flash = 0;
    this.hpBarTimer = 0;
  }

  get centerY() { return this.y - this.bodyHeight / 2; }
  get dead() { return this.downed || super.dead; }
  get hp() { return this.srvHp; }
  // Gifttakte (character/abilities.js Poison) ziehen direkt am Leben: als Treffer an den Server
  set hp(v) {
    const d = this.srvHp - v;
    if (d > 0 && !this.downed) this.onHit?.({ d, dot: true });
  }

  takeHit(hit) {
    if (this.downed || this.animator?.name === 'roll') return false;
    // Grundschaden ohne Krit melden; den Krit würfelt der Server
    this.onHit?.({ d: hit.crit ? hit.damage / 1.8 : hit.damage, heavy: !!hit.heavy, dot: !!hit.levelGap && !hit.knockback });
    return false;
  }

  serverHp(hp, max) {
    this.srvHp = Math.max(0, hp);
    this.maxHp = max || this.maxHp;
    if (this.srvHp <= 0) this.downed = true;
  }

  tick(dt, now) {
    super.tick(dt, now);
    this.flash = Math.max(0, this.flash - dt);
    this.hpBarTimer = Math.max(0, this.hpBarTimer - dt);
  }
}

// Figur aus dem Abbild (wie net/NetSession.js buildAnims)
export function rivalAnims(game, look) {
  const c = game.content;
  const full = look ? { ...look, gear: resolveGear(look.items ?? null, c) } : look;
  const custom = game.character?.animsForLook;
  if (typeof custom === 'function') { try { const a = custom(full, heroRes()); if (a?.idle) return a; } catch (e) { console.warn(e); } }
  const raceId = c.find('race', full?.raceId) ? full.raceId : 'human';
  const classId = c.find('class', full?.classId) ? full.classId : 'warrior';
  try { return getHeroSprites(raceId, classId, full?.appearance?.variant ?? 0, full?.gear ?? null, spriteStyle(full?.appearance), heroRes()); } catch { return getHeroSprites(raceId, classId, 0, null, null, heroRes()); }
}

export class DuelLink {
  constructor(session, pvp, rival) {
    this.s = session;
    this.pvp = pvp;
    this.rival = rival;
    this.combat = new RemoteCombat(session);
    rival.onFx = (who, e) => this.combat.play(who, e);
    this.fx = [];
    this.lastSent = null;
    this.lastSentAt = 0;
    this.animSeq = 0;
    this.animName = '';
    this.animTime = 0;
    this.offs = [
      pvp.on('u', (m) => {
        if (Array.isArray(m.s)) rival.push(m.s, performance.now());
        if (Array.isArray(m.fx)) rival.pushFx(cleanFx(m.fx));
      }),
      session.bus.on('ability', (e) => { if (e.actor === session.world?.hero) this.#queueFx('k', e.abilityId, e.actor); }),
    ];
  }

  update(dt) {
    const now = performance.now();
    this.rival.tick(dt, now);
    this.combat.update(dt, [this.rival]);
    const s = this.#ownState(now);
    const prev = this.lastSent;
    const animChanged = !prev || prev[3] !== s[3] || prev[4] !== s[4];
    const moved = !prev || prev[0] !== s[0] || prev[1] !== s[1] || prev[2] !== s[2];
    const since = now - this.lastSentAt;
    const fx = this.fx.length > 0;
    const due = (moved && since >= 1000 / SEND_HZ) || ((animChanged || fx) && since >= 50) || since >= IDLE_RESEND_S * 1000;
    if (!due) return;
    const msg = fx ? { t: 's', s, fx: cleanFx(this.fx) } : { t: 's', s };
    if (this.pvp.send(msg)) { this.lastSent = s; this.lastSentAt = now; this.fx = []; }
  }

  dispose() { for (const off of this.offs) off(); this.offs = []; }

  #ownState(now) {
    const h = this.s.world?.hero;
    if (!h) return [0, 0, 1, 'idle', 0, 0, Math.round(now)];
    const a = h.animator, name = a?.name || 'idle';
    if (name !== this.animName || (a && a.time + 0.03 < this.animTime)) {
      this.animSeq++;
      if (h.state === 'attack' && /^atk/.test(name)) this.#queueFx('a', h.combo ?? 0, h, now);
    }
    this.animName = name; this.animTime = a?.time ?? 0;
    for (const e of this.fx) if (e[1] == null) e[1] = Math.round(now);
    return [Math.round(h.x), Math.round(h.y), h.facing < 0 ? -1 : 1, name, this.animSeq, 0, Math.round(now)];
  }

  // Kampfereignis [k, t, id, ang, fl, tx, ty, th, tr] (net/protocol.js); Ziel ist immer der Gegner
  #queueFx(kind, id, h, now = null) {
    const ang = h.aimAngle ?? (h.facing < 0 ? Math.PI : 0);
    const st = h.stats ?? {}, P = st.passives ?? {};
    let fl = 0;
    if (kind === 'k' && st.upgrades?.[id]) fl |= FX_UPGRADED;
    if (kind === 'a') {
      if (P.multishot) fl |= FX_MULTISHOT;
      if (P.piercing_arrows) fl |= FX_PIERCE;
      if (P.inferno) fl |= FX_INFERNO | ((st.mastery?.infernoPct ?? 0.5) > 0.5 ? FX_INFERNO_BIG : 0);
    }
    const basic = h.cls?.basic;
    const ranged = kind === 'a' ? basic?.kind === 'ranged' : STRAIGHT.has(id);
    const t = kind === 'a' && !ranged ? null : this.rival;
    this.fx.push([kind, now == null ? null : Math.round(now), id, Math.round(ang * 1000), fl,
      t ? Math.round(t.x) : 0, t ? Math.round(t.y) : 0, t ? Math.round(t.y - t.centerY) : 0, t ? 6 : 0]);
    if (this.fx.length > FX_MAX) this.fx.shift();
  }
}
