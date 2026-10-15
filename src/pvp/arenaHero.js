import { Hero } from '../entities/Hero.js';
import { arenaStats } from './arenaStats.js';
import { pvpDamage, stormMult } from './rules.js';

// Held in der Arena (eigener Held und Herausforderer): Arena-Werte, Arena-Schaden, gedrosselte Heilung und
// „Niederlage“ statt Tod. Wer fällt, geht in die Knie (Zustand 'down', Todesanimation), stirbt aber nicht:
// kein Todesbildschirm, keine Wiederbelebung, kein Eintrag „gestorben“ im Tagesauftrag.
//
//   armHero(hero, { stormAt, healLocal, onDown })
//     stormAt()   ms Kampfzeit für den Glutsturm (nur gegen Herausforderer; im echten Kampf rechnet der Server)
//     healLocal   false: Heilung kommt nur vom Server (echter Kampf)
//     onDown(h)   Rückruf beim Fallen
//   holdHero(hero, on)   vor dem Gong: stehen bleiben (Zustand 'wait'), danach wieder frei
const HEAL_ICD_S = 1.2; // Blutdurst in der Arena höchstens so oft (Server: HEAL_ICD_MS)

export function armHero(hero, { stormAt = null, healLocal = true, onDown = null } = {}) {
  const stats = arenaStats(hero.classId, hero.raceId);
  hero.arenaStats = stats;
  // Ausrüstungs- und Stufenänderungen rechnen sonst die normalen Werte neu (character/createHero.js): hier gelten
  // immer die Arena-Werte; wer gefallen ist, bleibt bei 0 Leben
  hero.applyStats = function (_stats, opts) {
    Hero.prototype.applyStats.call(this, stats, opts);
    if (this.downed) this.hp = 0;
  };
  hero.applyStats(stats, { fill: true });
  hero.resource = Math.round(hero.maxResource * (hero.cls.resource.start ?? 1));
  hero.stamina = hero.maxStamina;
  for (const a of hero.abilities) a.cdLeft = 0;
  hero.buffs = [];
  hero.unbrokenCd = 0;
  const factor = pvpDamage(hero.classId);
  hero.damageFor = function (mult, ability = false) {
    return Hero.prototype.damageFor.call(this, mult, ability) * factor * (stormAt ? stormMult(stormAt()) : 1);
  };
  let lastHeal = -1e9;
  hero.heal = function (amount, world) {
    if (!healLocal || this.downed) return 0;
    const t = world?.time ?? performance.now() / 1000;
    if (t - lastHeal < HEAL_ICD_S) return 0;
    const n = Hero.prototype.heal.call(this, amount, world);
    if (n > 0) lastHeal = t;
    return n;
  };
  hero.die = function () {
    if (this.downed) return;
    this.downed = true;
    this.hp = 0;
    this.hurtable = false;
    this.solid = false;
    this.skill = null;
    this.vx = this.vy = 0;
    this.setState('down');
    this.animator.play('death', true);
    onDown?.(this);
  };
  return hero;
}

export function holdHero(hero, on) {
  if (hero.downed) return;
  if (on) {
    if (hero.state !== 'wait') { hero.setState('wait'); hero.vx = hero.vy = 0; hero.skill = null; hero.animator.play('idle', true); }
  } else if (hero.state === 'wait') hero.setState('move');
}
