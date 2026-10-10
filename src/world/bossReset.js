// Boss nach einer Niederlage der Gruppe zurücksetzen (wie in Online-Rollenspielen üblich):
// Der Boss steht unversehrt und schlafend an seinem Platz, das Arenator ist offen, Beschworene,
// Bodenwarnungen und Gefahrenflächen des Kampfes verschwinden. Alles andere in der Instanz
// (besiegte Gegner, geöffnete Truhen, Beute am Boden) bleibt, wie es war.
//
// Statt jede Bossklasse einzeln zurückzustellen, entsteht eine frische Instanz derselben Klasse am
// Ursprungsplatz. Gruppen-Dungeons (finder/Party.js) skalieren den neuen Boss automatisch, sobald er in
// world.enemies auftaucht (volles Leben, nicht beschworen).
//
// Vertrag: resetBoss(world) -> true, wenn ein laufender Bosskampf zurückgesetzt wurde.
//   world.fightBaseline (Set, von World beim Kampfbeginn gesetzt): Objekte, die schon vor dem Kampf da waren.
import { EV } from '../core/events.js';
import { XpOrb, LootBeam, CoinFountain, SoulWisp } from '../entities/Effects.js';

const KEEP = [XpOrb, LootBeam, CoinFountain, SoulWisp];
const MARGIN = 96;

// Beute, Belohnungseffekte und alles Bedienbare bleibt liegen
function keep(o) {
  if (!o || o.drop || typeof o.interact === 'function') return true;
  return KEEP.some((C) => o instanceof C);
}

export function resetBoss(world) {
  const old = world.boss, a = world.arena;
  if (!old || old.dead || !old.engaged || world.trial) return false;
  const Cls = old.constructor;
  const { x, y } = old.home ?? { x: old.x, y: old.y };

  // Alten Boss still entfernen: als „bereits gemeldet“ markiert, damit weder Beute noch EP noch Quests auslösen.
  // dead = true lässt seine noch ausstehenden Rückrufe (verzögerte Beschwörungen, Folgewellen) ins Leere laufen.
  old.killReported = true;
  old.dead = true;
  old.removed = true;
  if (old.furyAura) { old.furyAura.removed = true; old.furyAura = null; }
  for (const h of old.hazards ?? []) h.removed = true;

  const inArena = (o) => !a || (o.x > a.x0 - MARGIN && o.x < a.x1 + MARGIN && o.y > a.y0 - MARGIN && o.y < a.y1 + MARGIN);
  for (const e of world.enemies) {
    if (e === old || e.dead || !e.summoned || !inArena(e)) continue;
    e.killReported = true; e.removed = true;
  }
  for (const p of world.projectiles) if (p.team === 'enemy') p.removed = true;
  const base = world.fightBaseline;
  for (const list of [world.entities, world.effects]) {
    for (const o of list) {
      if (o === world.rune || o === world.gate || base?.has(o) || keep(o) || !inArena(o)) continue;
      o.removed = true;
    }
  }
  world.fightBaseline = null;

  // Bosse ohne eigene Klasse laufen als Boss mit ihrem Typ (World), die übrigen Klassen ignorieren den Typ
  const fresh = new Cls(x, y, world.assets, old.type);
  world.boss = fresh;
  world.actors.push(fresh);
  world.enemies.push(fresh);
  world.gate?.setClosed(false, world);
  world.bus.emit(EV.BOSS_RESET, { bossId: fresh.bossId });
  return true;
}
