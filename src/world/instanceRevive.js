// Wiederbeleben in einer Dungeon-Instanz: Der Held steht am Eingang derselben Instanz wieder auf, statt
// draußen am Friedhof. Besiegte Gegner bleiben besiegt, so lässt sich der Dungeon (mit der Gruppe) beenden.
// Lief gerade ein Bosskampf, wird der Boss zurückgesetzt (bossReset.js). Die Gruppe (finder/Party.js) hört auf
// EV.PLAYER_RESPAWNED mit inInstance und holt ihre Söldner an den Eingang.
//
// Vertrag: canReviveInInstance(zoneDef) und reviveInInstance(session) -> true, wenn wiederbelebt wurde.
import { EV } from '../core/events.js';
import { resetBoss } from './bossReset.js';

// Instanzierte Dungeons ja, Glutprüfungen nein (dort endet der Lauf mit dem Tod)
export const canReviveInInstance = (def) => !!def?.instanced && !def.trial;

export function reviveInInstance(session) {
  const w = session.world, h = w?.hero, def = session.zone?.def;
  if (!h || !canReviveInInstance(def)) return false;
  const d = w.dungeon;
  const entry = d.spawns.start ?? d.heroStart;
  const p = d.nearestFree(entry.x, entry.y, 6);
  resetBoss(w);
  h.x = p.x; h.y = p.y; h.vx = h.vy = 0;
  h.revive(1);
  if (h.resourceType === 'mana') h.resource = h.maxResource;
  h.invuln = Math.max(h.invuln ?? 0, 2);
  session.deadTime = 0;
  session.camera?.snapTo(h.x, h.y);
  w.particles.magic?.(h.x, h.y - 8, 16, 10);
  w.bus.emit('aura', { actor: h, element: 'holy' });
  w.bus.emit(EV.PLAYER_RESPAWNED, { zoneId: def.id, spawnId: 'start', inInstance: true });
  return true;
}
