// Glutöde (Stufe 36–40): Maße und Verhalten passend zu sprites/foes_wastes.js.
// Nur Abweichungen vom Vorbild (enemyTypes3.js). Schaden bleibt beim Skalierer;
// Spezialangriffe mit dmgK (Faktor relativ zum Grundangriff).
export const DEFS = {
  // Schwebender Geist: Klauenhieb statt Sprungbiss, weicht nach dem Treffer zurück
  ash_wraith: {
    bodyHeight: 36, eye: { x: 7, y: -35 }, radius: 7, hurtRadius: 10, shadowW: 16, mass: 1.1, speed: 40,
    material: 'ember', spawnStyle: 'fade', hitAndRun: 0.5,
    attackPatch: { kind: 'melee', range: 34, windup: 0.55, active: 0.16, recover: 0.5, cooldown: 1.1, knockback: 140, reach: 30, arc: 1.8, lunge: 110 },
  },
  // Schwer gepanzert: Kolbenschlag in den Boden (Einschlag 20 px vor ihm)
  cinder_knight: {
    bodyHeight: 46, eye: { x: 6, y: -40 }, radius: 10, hurtRadius: 13, shadowW: 30, mass: 5, speed: 28,
    material: 'stone', spawnStyle: 'fade',
    attackPatch: { kind: 'slam', range: 42, windup: 0.9, radius: 28, offset: 20, colors: ['#fff0b0', '#ffb640', '#f07a1c'] },
  },
  // Aufgerichtete Schlange: Feueratem aus meta.mouth
  magma_serpent: {
    bodyHeight: 38, eye: { x: 18, y: -37 }, radius: 12, hurtRadius: 15, shadowW: 46, mass: 4, speed: 36,
    material: 'ember', spawnStyle: 'fade',
    attackPatch: { kind: 'breath', range: 74, reach: 78, arc: 0.8, windup: 0.8 },
  },
  // Zauberer: drei Feuerbolzen, dazu ein Glutfeld am Boden (Animation 'cast', Einschlag bei ≈ 1,0 s)
  ember_cultist_adept: {
    bodyHeight: 32, eye: { x: 4, y: -25 }, radius: 6, hurtRadius: 8, shadowW: 16, mass: 1,
    material: 'flesh', spawnStyle: 'fade',
    specials: [
      { kind: 'cloud', anim: 'cast', range: 130, windup: 1.0, radius: 26, duration: 4, dmgK: 0.3, element: 'fire', cooldown: 9 },
    ],
  },
  // Elite: Schwinger, Bodenschlag mit beiden Fäusten (Animation 'slam', Einschlag Frame 9 ≈ 1,0–1,1 s)
  // und Ansturm (Ausholen mit 'brace', dann 'charge'-Loop)
  waste_colossus: {
    bodyHeight: 68, eye: { x: 12, y: -64 }, radius: 16, hurtRadius: 21, shadowW: 54, mass: 9, speed: 30,
    material: 'stone', spawnStyle: 'fade', roar: true, roarTime: 1.2,
    attackPatch: { kind: 'melee', range: 40, reach: 42, arc: 2.2, windup: 0.65, lunge: 60 },
    specials: [
      { kind: 'slam', anim: 'slam', range: 90, windup: 1.05, radius: 46, offset: 22, dmgK: 1.35, wave: 130, cooldown: 7, recover: 0.9, colors: ['#ffffff', '#ffd060', '#ff8c24'] },
      { kind: 'charge', anim: 'brace', range: 170, minRange: 70, windup: 0.85, speed: 260, duration: 0.65, dmgK: 1.15, cooldown: 8, stun: 1.4 },
    ],
  },
};
