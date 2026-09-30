// Sporenschlund (Stufe 30–32): Maße und Verhalten passend zu sprites/foes_spore.js.
// Schaden skaliert enemyTypes3.js; specials geben dmgK relativ zum Grundangriff.
export const DEFS = {
  sporeling: {
    bodyHeight: 14, eye: { x: 2, y: -7 }, radius: 5, hurtRadius: 7, shadowW: 14, mass: 0.6, speed: 66, material: 'flesh',
    spawnStyle: 'fade', strafe: true, hitAndRun: 0.5,
    attackPatch: { range: 48, windup: 0.42, active: 0.24, recover: 0.5, cooldown: 1.0, lungeSpeed: 225, hitRadius: 7 },
  },
  fungal_brute: {
    bodyHeight: 40, eye: { x: 17, y: -30 }, radius: 11, hurtRadius: 14, shadowW: 36, mass: 5, speed: 26, material: 'flesh',
    spawnStyle: 'rise',
    attackPatch: { range: 44, windup: 0.9, radius: 26, offset: 24, colors: ['#e0ffbc', '#92ee62', '#36bc32'] },
  },
  spore_caster: {
    bodyHeight: 30, eye: { x: 4, y: -25 }, radius: 6, hurtRadius: 8, shadowW: 16, mass: 1, material: 'flesh',
    spawnStyle: 'fade',
    attackPatch: { projectile: 'bolt', element: 'poison', range: 150, minRange: 64, windup: 0.75 },
    specials: [
      { kind: 'cloud', anim: 'cloud', range: 170, windup: 0.6, radius: 26, duration: 4, dmgK: 0.25, element: 'poison', cooldown: 11 },
    ],
  },
};
