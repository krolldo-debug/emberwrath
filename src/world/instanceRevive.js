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

// Lebt noch ein Gruppenmitglied in der Instanz? Söldner (companion) und später echte Mitspieler (partyMember,
// Mehrspieler Stufe 2). Solange ja, gibt es weder Wiederbeleben am Eingang noch ein Zurücksetzen des Bosses:
// die Gruppe kämpft weiter und hebt Gefallene nach dem Kampf auf.
export const groupAlive = (world) => !!world?.actors.some((a) => a !== world.hero && (a.companion || a.partyMember) && !a.dead && !a.removed);

// Wiederbelebungspunkt: etwas vom Eingang ins Innere, damit Held und Gruppe nicht am Kartenrand unter dem HUD stehen.
// Kandidaten im Ring um den Eingang, frei und vom Eingang aus erreichbar; gewinnt der mit dem größten Randabstand.
function inward(d, entry) {
  const edge = (p) => Math.min(p.x, p.y, d.pixelW - p.x, d.pixelH - p.y);
  let best = d.nearestFree(entry.x, entry.y, 6), bv = edge(best);
  for (const r of [40, 64]) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const p = d.nearestFree(entry.x + Math.cos(a) * r, entry.y + Math.sin(a) * r * 0.8, 4);
      if (d.collidesRect(p.x - 6, p.y - 5, p.x + 6, p.y + 3) || !d.reachable(p.x, p.y, entry.x, entry.y)) continue;
      const v = edge(p);
      if (v > bv + 8) { best = p; bv = v; }
    }
  }
  return best;
}

export function reviveInInstance(session) {
  const w = session.world, h = w?.hero, def = session.zone?.def;
  if (!h || !canReviveInInstance(def) || groupAlive(w)) return false;
  const d = w.dungeon;
  const p = inward(d, d.spawns.start ?? d.heroStart);
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
