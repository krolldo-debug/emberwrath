import { Entity, getShadow } from '../entities/Entity.js';
import { Animator } from '../gfx/Sprite.js';
import { INTERP_DELAY_MS, EXTRAPOLATE_MS, FLAG_DEAD, FLAG_RIDING } from './protocol.js';

// Ein anderer Spieler in derselben Zone und Welt. Liegt in world.entities (wird y-sortiert gezeichnet und beleuchtet,
// nimmt aber nicht am Kampf teil). Position und Animation kommen als Zustände vom Server und werden mit
// INTERP_DELAY_MS Verzögerung zwischen zwei Zuständen interpoliert.
//
// Die Uhr des Senders (s[6]) wird über den kleinsten beobachteten Versatz auf die eigene Uhr abgebildet;
// so bleibt die Bewegung gleichmäßig, auch wenn Pakete gebündelt oder unregelmäßig ankommen.
const MAX_SAMPLES = 40;
const FX_STALE_MS = 1500; // Kampfereignisse, die so weit hinter der Darstellung liegen, verfallen (z. B. nach Tab-Pause)
const SNAP_DIST = 96; // größere Sprünge (Wiederbeleben, Portal) nicht interpolieren

export class RemotePlayer extends Entity {
  constructor(info) {
    super(info.s?.[0] ?? 0, info.s?.[1] ?? 0);
    this.netId = info.id;
    this.k = info.k ?? null; // dauerhafter Schlüssel des Kontos (Ignorieren)
    this.name = info.name ?? '';
    this.level = info.level ?? 1;
    this.look = info.look ?? null;
    this.lookKey = '';
    this.anims = null;      // Figur wird verzögert gebaut (NetSession: höchstens eine pro Frame)
    this.animator = null;
    this.facing = 1;
    this.flags = 0;
    this.samples = [];
    this.offset = null;     // eigene Uhr - Senderuhr (ms)
    this.animKey = '';
    this.shadowW = 14;
    this.alpha = 0;         // sanftes Einblenden
    this.team = 'remote';
    // Kampf zur Anzeige (RemoteCombat): wartende Ereignisse und Felder, die abilities.js an einem Helden erwartet
    this.fx = [];
    this.onFx = null;
    this.action = null;
    this.stats = { upgrades: {}, passives: {}, mastery: {}, critChance: 0 };
    this.skillState = {};
    this.aimAngle = 0;
    this.vx = 0; this.vy = 0; this.kbx = 0; this.kby = 0; this.invuln = 0;
    this.abilities = [];
    if (info.s) this.push(info.s);
  }

  // abilities.js ruft diese am Helden auf; bei Mitspielern ohne Wirkung (Schaden und Werte rechnet ihr eigenes Spiel)
  damageFor() { return 0; }
  buff() {}
  gainResource() {}
  currentFrame() { return this.animator?.frame; }

  // Wie Hero.setPhaseFrame: Frame innerhalb der Angriffsphase, damit Angriffe genauso aussehen wie beim Sender
  setPhaseFrame(phase, k) {
    const anim = this.animator?.current;
    if (!anim?.frames?.length) return;
    const n = anim.frames.length;
    const r = anim.phases?.[phase] ?? (phase === 'windup' ? [0, 0] : phase === 'active' ? [1, Math.max(1, n - 2)] : [n - 1, n - 1]);
    const span = r[1] - r[0] + 1;
    const fi = r[0] + Math.min(span - 1, Math.floor(Math.max(0, Math.min(1, k)) * span));
    this.animator.time = (fi + 0.5) / anim.fps;
  }

  // Kampfereignisse [k, t, …] (protocol.js); abgespielt, sobald die Darstellung ihren Zeitpunkt erreicht
  pushFx(list) {
    for (const e of list) this.fx.push(e);
    if (this.fx.length > 12) this.fx.splice(0, this.fx.length - 12);
  }

  get dead() { return (this.flags & FLAG_DEAD) !== 0; }
  get riding() { return (this.flags & FLAG_RIDING) !== 0 || /^ride/.test(this.animator?.name ?? ''); }

  setAnims(anims) {
    this.anims = anims;
    const prev = this.animator;
    this.animator = new Animator(anims);
    this.animator.play(prev?.name && anims[prev.name] ? prev.name : 'idle');
    if (prev) this.animator.time = prev.time;
  }

  // Neuer Zustand [x, y, f, a, n, fl, t]
  push(s, now = performance.now()) {
    const t = s[6] || now;
    const d = now - t;
    if (this.offset == null || d < this.offset) this.offset = d;
    else this.offset += (d - this.offset) * 0.002; // langsam nachziehen, falls die Leitung dauerhaft langsamer wird
    const last = this.samples[this.samples.length - 1];
    if (last && t < last.t) return; // veraltet
    this.samples.push({ t, x: s[0], y: s[1], f: s[2], a: s[3], n: s[4], fl: s[5] });
    if (this.samples.length > MAX_SAMPLES) this.samples.shift();
  }

  // World.update ruft update(dt, world) nur ohne Pause auf; andere Spieler sollen aber auch weiterlaufen, während
  // das eigene Inventar offen ist. Deshalb treibt die Netz-Sitzung tick() an.
  update() {}

  tick(dt, now = performance.now()) {
    this.alpha = Math.min(1, this.alpha + dt * 4);
    this.animator?.update(dt);
    const S = this.samples;
    if (!S.length) return;
    const T = now - (this.offset ?? 0) - INTERP_DELAY_MS;
    // Letzten Zustand <= T suchen; ältere werden verworfen (bis auf einen).
    let i = 0;
    while (i + 1 < S.length && S[i + 1].t <= T) i++;
    if (i > 0) { this.prev = S[i - 1]; S.splice(0, i); }
    const a = S[0], b = S[1];
    if (b && T > a.t && Math.hypot(b.x - a.x, b.y - a.y) < SNAP_DIST) {
      const k = Math.min(1, (T - a.t) / Math.max(1, b.t - a.t));
      this.x = a.x + (b.x - a.x) * k;
      this.y = a.y + (b.y - a.y) * k;
    } else if (!b && this.prev && a.a === 'run' && T > a.t) {
      // Nächster Zustand verspätet: kurz in Laufrichtung weiter (nur beim Laufen; beim Anhalten kommt ein neuer Zustand)
      const p = this.prev, span = Math.max(1, a.t - p.t);
      const k = Math.min(T - a.t, EXTRAPOLATE_MS) / span;
      this.x = a.x + (a.x - p.x) * k;
      this.y = a.y + (a.y - p.y) * k;
    } else { this.x = a.x; this.y = a.y; }
    this.facing = a.f;
    this.flags = a.fl;
    this.#playAnim(a.a, a.n);
    while (this.fx.length && this.fx[0][1] <= T) {
      const e = this.fx.shift();
      if (T - e[1] < FX_STALE_MS) this.onFx?.(this, e);
    }
  }

  #playAnim(name, n) {
    const key = `${name}#${n}`;
    if (!this.animator || key === this.animKey) return;
    this.animKey = key;
    const anims = this.anims;
    let use = anims[name] ? name : /^atk/.test(name) && anims.atk1 ? 'atk1' : 'idle';
    if (this.dead && anims.death) use = 'death';
    this.animator.play(use, true);
  }

  render(ctx, cx, cy) {
    if (!this.animator) return;
    const f = this.animator.frame;
    if (!f) return;
    const a = this.alpha;
    if (a < 1) ctx.globalAlpha = a;
    const sh = getShadow(/^ride/.test(this.animator.name) ? 26 : this.shadowW); // Reittier: breiterer Schatten
    ctx.drawImage(sh, Math.round(this.x - cx - sh.width / 2), Math.round(this.y - cy - sh.height / 2));
    f.draw(ctx, this.x - cx, this.y - cy, { flip: this.facing < 0 });
    if (a < 1) ctx.globalAlpha = 1;
  }

  // Leuchtpunkte des Frames (Augen, Stabkristall) wie beim eigenen Helden.
  renderEmissive(ctx, cx, cy) {
    const f = this.animator?.frame;
    if (!f?.glows?.length || (this.dead && this.animator.finished)) return;
    for (const g of f.glows) {
      const x = Math.round(this.x - cx + g.x * this.facing - (this.facing < 0 ? 1 / (f.res ?? 1) : 0));
      const y = Math.round(this.y - cy + g.y);
      ctx.globalAlpha = 0.9 * this.alpha;
      ctx.fillStyle = g.color;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.globalAlpha = 1;
  }
}
