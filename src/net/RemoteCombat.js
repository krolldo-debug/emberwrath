import { CLASSES } from '../character/classes.js';
import { ABILITY_IMPL, fireProjectile } from '../character/abilities.js';
import { SlashEffect, Afterimage } from '../entities/Effects.js';
import { SLASH_STYLES } from '../sprites/effects.js';
import { CONFIG } from '../config.js';
import { FX_UPGRADED, FX_MULTISHOT, FX_INFERNO, FX_INFERNO_BIG, FX_PIERCE } from './protocol.js';

// Kampf anderer Spieler, nur zur Anzeige (Kampfereignisse siehe protocol.js).
//
// Der Empfänger spielt Grundangriff und Fähigkeit mit demselben Code ab wie der eigene Held (abilities.js), aber in
// einer Sicht auf die Welt ohne Gegner, Trefferzonen, Bildschirmwackeln und Spielstand: Geschosse, Hiebbögen,
// Partikel, Licht und Klang erscheinen, eigene Gegner, Beute und Fortschritt bleiben unberührt. Der anvisierte Gegner
// des Senders steht in der Sicht als unsichtbares Ziel, damit Pfeile dort enden und Flächenzauber dort landen.
//
// Nur für Mitspieler in Bildnähe; weiter entfernte laufen nur mit ihrer Figur-Animation.

const NEAR = 120;              // Weltpixel über den Bildrand hinaus
const TARGET_TTL = 1.6;        // so lange bleibt das unsichtbare Ziel bestehen (Flugzeit der Geschosse)
// Ereignisse, die in der echten Welt ankommen (Partikel, Licht, Klang über Feedback). Alles andere (Hinweise,
// Treffer, Fortschritt) bleibt in der Sicht.
const PASS = new Set(['ability', 'cast', 'shoot', 'swing', 'roll', 'aura', 'spellImpact']);
const NO_CAM = Object.freeze({ shake() {}, kick() {} });
const NO_HITBOXES = { add() {}, update() {}, get hitboxes() { return [{ hitSet: new Set() }]; } };

// Sicht auf ein Objekt mit überschriebenen Feldern; Methoden laufen am Original (wie finder/Party.js makeView).
function view(target, overrides) {
  const bound = new Map();
  return new Proxy(target, {
    get(t, k) {
      if (Object.prototype.hasOwnProperty.call(overrides, k)) return overrides[k];
      const v = t[k];
      if (typeof v !== 'function' || k === 'constructor') return v;
      let b = bound.get(k);
      if (!b || b.src !== v) { b = v.bind(t); b.src = v; bound.set(k, b); }
      return b;
    },
    set(t, k, v) { if (!Object.prototype.hasOwnProperty.call(overrides, k)) t[k] = v; return true; },
  });
}

export class RemoteCombat {
  constructor(session) {
    this.s = session;
    this.world = null;
    this.base = null; // gemeinsame Teile der Sicht je Welt
  }

  // Ereignis eines Mitspielers (RemotePlayer.tick, zeitgleich mit seiner Animation)
  play(r, ev) {
    const w = this.s.world;
    if (!w || !r.animator || r.dead || !this.#near(r)) return;
    const [kind, , id, mrad, fl, tx, ty, th, tr] = ev;
    const ang = mrad / 1000;
    const target = tr ? { id: -1, x: tx, y: ty, centerY: ty - th, bodyHeight: th * 2, hurtRadius: tr, dead: false, rise: 1, hp: 1, maxHp: 1 } : null;
    const v = this.#view(w, target);
    r.stats.upgrades = fl & FX_UPGRADED && kind === 'k' ? { [id]: true } : {};
    r.skillState = {};
    r.aimAngle = ang;
    if (kind === 'a') this.#basic(r, v, id, ang, fl);
    else this.#skill(r, v, id, ang, target);
  }

  // Laufende Aktionen weiterführen (nach RemotePlayer.tick)
  update(dt, remotes) {
    for (const r of remotes) {
      const act = r.action;
      if (act) {
        act.t += dt;
        if (r.animKey !== act.key) r.action = null; // neue Animation beim Sender: Aktion vorbei
        else if (act.step(dt, act.t) === false || act.t >= act.dur) r.action = null;
      }
      // Ausweichrolle: Nachbilder und Staub wie beim eigenen Helden
      if (!r.action && r.animator?.name === 'roll' && !r.dead && this.#near(r)) {
        if (r.rollKey !== r.animKey) { r.rollKey = r.animKey; r.ghostT = 0; this.#view(this.s.world, null).bus.emit('roll', { actor: r }); }
        r.ghostT -= dt;
        if (r.ghostT <= 0) { r.ghostT = 0.035; this.s.world.addEffect(new Afterimage(r.currentFrame(), r.x, r.y, r.facing < 0)); }
      }
    }
  }

  // ------------------------------------------------------------------ intern
  #near(r) {
    const cam = this.s.camera;
    if (!cam) return false;
    const x = r.x - cam.rx, y = r.y - cam.ry;
    return x > -NEAR && y > -NEAR && x < CONFIG.viewWidth + NEAR && y < CONFIG.viewHeight + NEAR;
  }

  #view(w, target) {
    if (this.world !== w) {
      const s = w.session;
      const bus = view(w.bus, { emit: (type, e) => { if (PASS.has(type)) w.bus.emit(type, type === 'spellImpact' ? { ...e, big: false } : e); } });
      this.world = w;
      this.base = { bus, session: view(s, { camera: NO_CAM, hitstop: () => {}, slowmo: () => {}, bus }) };
    }
    const born = w.time;
    const o = {
      ...this.base,
      combat: NO_HITBOXES,
      lighting: { ambientBoost: 0 },
      get enemies() { return target && w.time - born < TARGET_TTL ? [target] : []; },
      // Was die Fähigkeit in die Welt setzt (Geschosse, Fallen, Meteor, Verzögerungen), läuft ebenfalls in der Sicht
      spawn: (e) => {
        const orig = e.update;
        e.update = function (dt, world) { return orig.call(this, dt, world === w ? v : world); };
        e.ghost = true;
        if (e.team === 'hero') e.team = 'remote';
        return w.spawn(e);
      },
    };
    const v = view(w, o);
    return v;
  }

  #basic(r, v, combo, ang, fl) {
    const basic = CLASSES[r.look?.classId]?.basic;
    if (!basic) return;
    const melee = basic.kind === 'melee';
    const a = melee ? basic.combo[combo] ?? basic.combo[0] : { ...basic.shot, active: 0.04 };
    if (Math.abs(Math.cos(ang)) > 0.15) r.facing = Math.sign(Math.cos(ang));
    let done = false;
    r.action = {
      key: r.animKey, t: 0, dur: a.windup + a.active + a.recover,
      step: (dt, t) => {
        if (t < a.windup) r.setPhaseFrame('windup', t / a.windup);
        else if (t < a.windup + a.active) r.setPhaseFrame('active', (t - a.windup) / a.active);
        else r.setPhaseFrame('recover', (t - a.windup - a.active) / a.recover);
        if (done || t < a.windup) return;
        done = true;
        if (melee) {
          const great = !!r.anims?.greatWeapon;
          const style = great ? (a.heavy ? SLASH_STYLES.greatHeavy : SLASH_STYLES.great) : a.heavy ? SLASH_STYLES.heroHeavy : SLASH_STYLES.hero;
          if (great) for (const e of this.s.world.effects) if (e instanceof SlashEffect && e.owner === r) e.removed = true;
          v.addEffect(new SlashEffect(r, ang, style, combo === 1, a.active + 0.08));
          v.bus.emit('swing', { actor: r, heavy: !!a.heavy, angle: ang });
          return;
        }
        const opts = { speed: a.speed, damage: 0, knockback: 0, range: a.range };
        if (fl & FX_PIERCE) opts.pierce = 1;
        if (a.projectile === 'bolt' && fl & FX_INFERNO) opts.explode = { r: fl & FX_INFERNO_BIG ? 24 : 18, damage: 0, knockback: 0, skipDirect: true };
        fireProjectile(r, v, a.projectile, ang, opts);
        if (a.projectile === 'arrow' && fl & FX_MULTISHOT) for (const off of [-0.14, 0.14]) fireProjectile(r, v, 'arrow', ang + off, opts);
        v.bus.emit(a.projectile === 'bolt' ? 'swing' : 'shoot', { actor: r, heavy: false, angle: ang });
      },
    };
    r.action.step(0, 0);
  }

  #skill(r, v, id, ang, target) {
    const impl = ABILITY_IMPL[id];
    if (!impl) return;
    // Meucheln: der Sender meldet die Richtung nach dem Sprung hinter das Ziel; von hier aus zählt die zum Ziel
    if (id === 'assassinate' && target) ang = Math.atan2(target.centerY - (r.y - 8), target.x - r.x);
    if (Math.abs(Math.cos(ang)) > 0.15) r.facing = Math.sign(Math.cos(ang));
    const def = { id, mult: 0 };
    impl.start?.(r, v, ang, def);
    v.bus.emit('ability', { actor: r, abilityId: id });
    if (!impl.update) return;
    r.action = { key: r.animKey, t: 0, dur: impl.duration, step: (dt, t) => impl.update(r, v, dt, t, def) };
  }
}
