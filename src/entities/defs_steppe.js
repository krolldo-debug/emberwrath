// Aschensteppe (Stufe 20–25): Maße und Verhalten passend zu sprites/foes_steppe.js.
// Schaden skaliert enemyTypes3.js; specials geben dmgK relativ zum Grundangriff.
export const DEFS = {
  steppe_raider: {
    bodyHeight: 25, eye: { x: 3, y: -22 }, radius: 6, hurtRadius: 8, shadowW: 15, mass: 1.2, material: 'flesh',
    attackPatch: { range: 26, reach: 26, windup: 0.5, arc: 2.3, lunge: 90 },
  },
  raider_archer: {
    bodyHeight: 24, eye: { x: 3, y: -22 }, radius: 6, hurtRadius: 8, shadowW: 14, mass: 1, material: 'flesh',
    attackPatch: { range: 155, minRange: 62, windup: 0.75 },
  },
  dust_hyena: {
    bodyHeight: 15, eye: { x: 13, y: -19 }, radius: 6, hurtRadius: 8, shadowW: 24, mass: 1.1, speed: 78, material: 'flesh',
    spawnStyle: 'fade', strafe: true, hitAndRun: 0.8, howl: true,
    attackPatch: { range: 48, windup: 0.38, active: 0.2, recover: 0.3, cooldown: 1.0, lungeSpeed: 240, hitRadius: 8 },
  },
  ash_vulture: {
    bodyHeight: 38, eye: { x: 10, y: -30 }, radius: 6, hurtRadius: 10, shadowW: 18, mass: 0.8, speed: 76, material: 'flesh',
    spawnStyle: 'fade', strafe: true, hitAndRun: 1.0,
    attackPatch: { range: 62, windup: 0.55, active: 0.26, recover: 0.4, cooldown: 1.4, lungeSpeed: 255, hitRadius: 9 },
  },
  steppe_warlord: {
    bodyHeight: 44, eye: { x: 5, y: -34 }, radius: 10, hurtRadius: 14, shadowW: 34, mass: 4.5, material: 'flesh',
    roar: true, roarTime: 1.15,
    attackPatch: { range: 34, reach: 36, arc: 2.6, windup: 0.62, lunge: 95 },
    specials: [
      { kind: 'spin', anim: 'spin', range: 72, windup: 0.62, duration: 2.0, radius: 30, dmgK: 0.55, speedMul: 0.85, cooldown: 9 },
      { kind: 'charge', anim: 'chargeup', range: 170, minRange: 60, windup: 0.85, speed: 265, duration: 0.6, dmgK: 1.35, cooldown: 8, stun: 1.3 },
    ],
  },
};
