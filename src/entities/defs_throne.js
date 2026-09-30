// Aschethron (38–40): Maße/Verhalten passend zu sprites/foes_throne.js.
// attackPatch wird in `attack` gemischt; specials verwenden dmgK (Faktor
// relativ zum Grundangriff) statt damage.
export const DEFS = {
  // Nahkampf mit Hellebarde (längere Reichweite als der Bandit) und Turmschild.
  throne_guard: {
    bodyHeight: 36, eye: { x: 3, y: -29 }, radius: 7, hurtRadius: 9, shadowW: 18, mass: 1.8, speed: 40,
    material: 'stone', spawnStyle: 'fade',
    attackPatch: { range: 30, reach: 34, arc: 2.2, lunge: 70, windup: 0.55 },
  },
  // Zauberer: Glutbolzen (3er-Fächer vom Vorbild) + Glutfeld am Boden (anim 'cast').
  ash_priest: {
    bodyHeight: 38, eye: { x: 6, y: -27 }, radius: 6, hurtRadius: 8, shadowW: 16, material: 'flesh', spawnStyle: 'fade',
    specials: [
      { kind: 'cloud', anim: 'cast', range: 130, minRange: 24, windup: 1.0, radius: 30, duration: 4, dmgK: 0.3, element: 'fire', cooldown: 10 },
    ],
  },
  // Rudel: heult beim Entdecken (anim 'howl') und ruft die anderen Hunde.
  ember_hellhound: {
    bodyHeight: 26, eye: { x: 19, y: -22 }, radius: 9, hurtRadius: 11, shadowW: 34, mass: 1.5, speed: 82,
    material: 'ember', spawnStyle: 'fade', strafe: true, hitAndRun: 0.6, howl: true,
    attackPatch: { range: 54, lungeSpeed: 270 },
  },
  // Elite: riesiger belebter Obsidian-Wächter. roar + Bodenstoß (slam) + Wirbel (spin).
  throne_sentinel: {
    bodyHeight: 60, eye: { x: 6, y: -47 }, radius: 16, hurtRadius: 20, shadowW: 52, mass: 8, speed: 30,
    material: 'stone', spawnStyle: 'fade', roar: true, roarTime: 1.2,
    attackPatch: { range: 44, reach: 50, arc: 2.4, lunge: 60, windup: 0.7 },
    specials: [
      { kind: 'slam', anim: 'slam', range: 90, windup: 1.1, radius: 44, offset: 28, dmgK: 1.4, wave: 130, cooldown: 8, recover: 0.9,
        colors: ['#fff4d8', '#ffb070', '#f0602a'], element: 'fire' },
      { kind: 'spin', anim: 'spin', range: 60, windup: 0.7, radius: 42, duration: 2.2, dmgK: 0.45, speedMul: 0.7, cooldown: 11 },
    ],
  },
};
