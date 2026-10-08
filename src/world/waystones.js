// Wegsteine (Teleporter zwischen Städten/Lagern). Reihenfolge = Reihenfolge im Reisemenü.
// zoneId: Zone, in der der Stein steht; spawnId: Ankunftspunkt (Spawn-Punkt 'waystone' der Karte);
// name: Ort (Stadt/Lager); region: Zonenname; levels: Stufenbereich der Zone.
// Freigeschaltet, wenn world.flags['waystone:<zoneId>'] gesetzt ist (erster Besuch in ~4 Kacheln Nähe).
export const WAYSTONES = [
  { zoneId: 'emberhollow', spawnId: 'waystone', name: 'Dorf Glutsenke', region: 'Glutsenke', levels: '1–6' },
  { zoneId: 'ashwood', spawnId: 'waystone', name: 'Lager der Wächter', region: 'Der Aschenwald', levels: '6–12' },
  { zoneId: 'cinder_peaks', spawnId: 'waystone', name: 'Rauhwacht', region: 'Die Schlackenhöhen', levels: '12–20' },
  { zoneId: 'ashen_steppe', spawnId: 'waystone', name: 'Steppenwacht', region: 'Die Aschensteppe', levels: '20–25' },
  { zoneId: 'blighted_marsh', spawnId: 'waystone', name: 'Mirefeste', region: 'Die Faulmarsch', levels: '25–31' },
  { zoneId: 'frostspire', spawnId: 'waystone', name: 'Frosthold', region: 'Die Frostzinnen', levels: '31–36' },
  { zoneId: 'ember_wastes', spawnId: 'waystone', name: 'Letzte Bastion', region: 'Die Glutöde', levels: '36–40' },
];

export const waystoneFlag = (zoneId) => `waystone:${zoneId}`;
export const waystoneOf = (zoneId) => WAYSTONES.find((w) => w.zoneId === zoneId) ?? null;

export const TRAVEL_BLOCKED_COMBAT = 'Im Kampf kannst du nicht reisen.';
// Kampfsperre: Held in den letzten 5 s getroffen worden oder hat selbst getroffen (hero.combatTime),
// oder ein lebender Gegner in der Nähe ist mit ihm im Kampf (aggro, nicht auf dem Rückweg).
export function inCombat(world) {
  const h = world?.hero;
  if (!h || h.dead) return true;
  if ((h.combatTime ?? 99) < 5) return true;
  return world.enemies.some((e) => !e.dead && e.aggroed && e.state !== 'return' && e.state !== 'idle' && Math.hypot(e.x - h.x, e.y - h.y) < 320);
}

// Nutzlast für 'travel:open' (Reisemenü, Panel 'travel' von Thread D).
export function travelInfo(world) {
  const flags = world.state.slices.world?.flags ?? {};
  const from = world.zone.id;
  return {
    from,
    list: WAYSTONES.map((w) => ({ ...w, unlocked: !!flags[waystoneFlag(w.zoneId)] || w.zoneId === from, current: w.zoneId === from })),
    blocked: inCombat(world) ? TRAVEL_BLOCKED_COMBAT : null,
  };
}
