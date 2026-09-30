// Heulendes Hügelgrab (Stufe 24–26): Maße und Verhalten passend zu sprites/foes_barrow.js.
// Schaden skaliert enemyTypes3.js; specials geben dmgK relativ zum Grundangriff.
export const DEFS = {
  barrow_wight: {
    bodyHeight: 28, eye: { x: 5, y: -29 }, radius: 6, hurtRadius: 9, shadowW: 16, mass: 1.4, speed: 34, material: 'bone',
    spawnStyle: 'rise',
    attackPatch: { range: 26, reach: 28, windup: 0.55, arc: 2.3, lunge: 80 },
  },
  grave_hound: {
    bodyHeight: 16, eye: { x: 14, y: -15 }, radius: 6, hurtRadius: 8, shadowW: 26, mass: 1, speed: 76, material: 'bone',
    spawnStyle: 'fade', strafe: true, hitAndRun: 0.7, howl: true,
    attackPatch: { range: 50, windup: 0.42, active: 0.22, recover: 0.35, cooldown: 1.2, lungeSpeed: 235, hitRadius: 8 },
  },
  bone_archer: {
    bodyHeight: 26, eye: { x: 3, y: -26 }, radius: 5, hurtRadius: 8, shadowW: 14, mass: 0.9, material: 'bone',
    spawnStyle: 'rise',
    attackPatch: { range: 150, minRange: 64, windup: 0.7 },
  },
  wight_caller: {
    bodyHeight: 30, eye: { x: 5, y: -27 }, radius: 6, hurtRadius: 9, shadowW: 16, mass: 1, material: 'bone',
    spawnStyle: 'fade',
    attackPatch: { projectile: 'bolt', element: 'water', range: 150, minRange: 70, windup: 0.75, homing: 0.8 },
    specials: [
      { kind: 'summon', type: 'barrow_wight', count: 2, max: 3, range: 180, cooldown: 12, windup: 1.1, anim: 'summon' },
    ],
  },
};
