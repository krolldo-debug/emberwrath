import { animationsOf } from '../gfx/Sprite.js';

// Figuren-Frames nach dem Zonenwechsel in kleinen Häppchen nachbauen. Die Sprite-Dateien legen ihre Frames
// aufgeschoben an (gfx/Sprite.js LazyFrame): Der Zonenwechsel baut nur, was das erste Bild zeigt, der Rest entsteht
// hier nach und nach – nahe Figuren zuerst, Ruhe- und Laufbilder vor Angriffen. Was gebraucht wird, bevor es hier
// dran war, baut die Animation sofort selbst (nie ein leeres Bild). Nähert sich der Held dem Boss, kommt dieser vor.
//
//   const warm = new SpriteWarmer(world);   warm.add(actor) (später erschienene Gegner)   warm.update(dt)

const DELAY = 0.3;       // s nach dem Betreten: erst ruhig ankommen lassen
const SLICE_MS = 3;      // Arbeit je Bild (mindestens ein Frame)
const BOSS_SLICE_MS = 6; // in Bossnähe
const BOSS_NEAR = 560;   // px Abstand Held–Boss, ab dem der Boss Vorrang hat
const GAP_MS = 12;       // Mindestabstand zwischen zwei Häppchen (Wanduhr: höchstens eins je Bild, auch beim Nachholen)
const DUTY = 3;          // nach einem langen Häppchen (schwaches Handy) das Dreifache pausieren: ≤ ¼ der Zeit
const FIRST = ['idle', 'walk', 'dormant', 'sleep', 'rest'];

export class SpriteWarmer {
  constructor(world) {
    this.world = world;
    this.queue = null;   // [Animation], wird abgearbeitet
    this.boss = null;    // Animationen des Bosses (eigene Liste, Vorrang in seiner Nähe)
    this.seen = new WeakSet();
    this.wait = DELAY;
    this.nextAt = 0;
  }

  #anims(actor) {
    const A = actor?.animator?.anims;
    if (!A || this.seen.has(A)) return [];
    this.seen.add(A);
    const list = animationsOf(A);
    const rank = (a) => { const k = Object.keys(A).find((n) => A[n] === a); const i = FIRST.indexOf(k); return i < 0 ? FIRST.length : i; };
    return list.filter((a) => a.pending).sort((a, b) => rank(a) - rank(b));
  }

  #collect() {
    const w = this.world, h = w.hero;
    const d = (a) => Math.hypot(a.x - h.x, a.y - h.y);
    this.queue = [];
    this.boss = w.boss ? this.#anims(w.boss) : [];
    const actors = [...w.actors, ...(w.npcs ?? [])].filter((a) => a !== w.boss).sort((a, b) => d(a) - d(b));
    for (const a of actors) this.queue.push(...this.#anims(a));
  }

  // Später erschienene Figur (Nachschub, Beschwörung): hinten anstellen
  add(actor) {
    if (this.queue) this.queue.push(...this.#anims(actor));
  }

  get done() { return !!this.queue && !this.queue.length && !this.boss.length; }

  update(dt) {
    if (this.wait > 0) { this.wait -= dt; return; }
    if (!this.queue) this.#collect();
    if (performance.now() < this.nextAt) return;
    if (!this.queue.length && !this.boss.length) return;
    const w = this.world, b = w.boss;
    const nearBoss = !!b && this.boss.length > 0 && Math.hypot(b.x - w.hero.x, b.y - w.hero.y) < BOSS_NEAR;
    const lists = nearBoss ? [this.boss, this.queue] : [this.queue, this.boss];
    const t0 = performance.now(), budget = nearBoss ? BOSS_SLICE_MS : SLICE_MS;
    let built = 0;
    for (const L of lists) {
      while (L.length) {
        if (built && performance.now() - t0 >= budget) break;
        if (L[0].warmOne()) built++;
        else L.shift();
      }
      if (built && performance.now() - t0 >= budget) break;
    }
    const end = performance.now();
    this.nextAt = end + Math.max(GAP_MS, (end - t0) * DUTY);
  }
}
