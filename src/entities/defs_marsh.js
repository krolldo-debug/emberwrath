// Maße/Verhalten der Faulmarsch-Gegner (Figuren: sprites/foes_marsh.js).
// Nur Felder, die vom Vorbild in enemyTypes3.js abweichen. Schaden bleibt vom
// Skalierer; Spezialangriffe mit dmgK (Faktor relativ zum Grundangriff).
// eye/bodyHeight aus den Idle-Frames gemessen (relativ zum Fußpunkt, Blick rechts).

const POISON_COLS = ['#f2ffb4', '#b0ec48', '#548a18'];
const MUD_COLS = ['#bab288', '#6e6648', '#3a3222'];

export const DEFS = {
  // Nahkampf, taucht aus dem Morast auf und springt an (lunge)
  bog_lurker: {
    bodyHeight: 24, eye: { x: 8, y: -17 }, radius: 7, hurtRadius: 9, shadowW: 20, mass: 1.4, speed: 36,
    material: 'flesh', spawnStyle: 'rise',
    attackPatch: { kind: 'lunge', range: 46, windup: 0.55, lungeSpeed: 185 },
  },
  // Zauberer: Giftbolzen aus der Faulkugel (meta.hand), dazu Giftwolke (Animation 'cast')
  rot_shaman: {
    bodyHeight: 33, eye: { x: 6, y: -24 }, radius: 6, hurtRadius: 8, shadowW: 16, mass: 1,
    material: 'flesh', spawnStyle: 'fade',
    attackPatch: { projectile: 'bolt', element: 'poison', range: 150, minRange: 64 },
    specials: [
      { kind: 'cloud', anim: 'cast', range: 130, windup: 1.0, radius: 26, duration: 4.5, dmgK: 0.3, element: 'poison', cooldown: 10 },
    ],
  },
  // Schwarm: klein, schnell, springt mit der Saugscheibe an
  swamp_leech: {
    bodyHeight: 9, eye: { x: 10, y: -5 }, radius: 5, hurtRadius: 7, shadowW: 22, mass: 0.7, speed: 58,
    material: 'flesh', spawnStyle: 'rise', strafe: true, hitAndRun: 0.45,
    attackPatch: { kind: 'lunge', range: 44, lungeSpeed: 215 },
  },
  // Fern: Giftspucke (meta.hand = Maul), bläht sich zur Giftwolke auf (Animation 'puff')
  plague_toad: {
    bodyHeight: 17, eye: { x: 6, y: -14 }, radius: 9, hurtRadius: 11, shadowW: 26, mass: 2.2, speed: 28,
    material: 'flesh', spawnStyle: 'rise',
    attackPatch: { projectile: 'bolt', element: 'poison', range: 120, minRange: 24, windup: 0.7, count: 3, spread: 0.35 },
    specials: [
      { kind: 'cloud', anim: 'puff', range: 60, windup: 1.1, radius: 30, duration: 4, dmgK: 0.35, element: 'poison', cooldown: 9 },
    ],
  },
  // Elite „Das Moorgrauen“: Brüllen, Grundangriff = Doppelfaust (slam),
  // Moorbeben (slam, Animation 'slam', Aufschlag bei ~1,1 s) und Faulatem (cloud, Animation 'belch')
  bog_horror: {
    bodyHeight: 64, eye: { x: 24, y: -38 }, radius: 17, hurtRadius: 21, shadowW: 50, mass: 8, speed: 30,
    material: 'flesh', spawnStyle: 'rise', roar: true, roarTime: 1.2,
    attackPatch: { kind: 'slam', range: 50, windup: 0.9, radius: 30, offset: 24, colors: MUD_COLS },
    specials: [
      { kind: 'slam', anim: 'slam', range: 100, windup: 1.1, radius: 46, offset: 24, dmgK: 1.3, wave: 130, cooldown: 8, recover: 1.0,
        colors: MUD_COLS, waveColor: [120, 150, 70], element: 'poison' },
      { kind: 'cloud', anim: 'belch', range: 120, windup: 1.0, radius: 34, duration: 5, dmgK: 0.4, element: 'poison', cooldown: 12,
        colors: POISON_COLS },
    ],
  },
};
