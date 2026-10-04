// Maße und Verhalten der Frostzinnen-Gegner (Figuren: sprites/foes_frost.js).
// Nur geänderte Felder; Schaden/Leben skaliert enemyTypes3.js. `eye` = Augenpunkt
// der Idle-Figur relativ zum Anker, `bodyHeight` ≈ sichtbare Rumpfhöhe.
const ICE_COLORS = ['#ffffff', '#b8ecfa', '#6ab4d8'];

export const DEFS = {
  // Eistroll: schwerer Keulenschläger (Vorbild Aschegolem), Überkopf-Schmettern.
  ice_troll: {
    bodyHeight: 34, eye: { x: 19, y: -25 }, radius: 10, hurtRadius: 13, shadowW: 34, mass: 4.5, speed: 30,
    material: 'flesh', spawnStyle: 'fade',
    attackPatch: { range: 46, offset: 32, radius: 26, windup: 1.0, colors: ICE_COLORS },
  },
  // Frostwolf: Rudeljäger – heult beim Entdecken und ruft das Rudel.
  frost_wolf: {
    bodyHeight: 20, eye: { x: 14, y: -23 }, radius: 6, hurtRadius: 8, shadowW: 24, mass: 1.1, speed: 80,
    material: 'flesh', spawnStyle: 'fade', strafe: true, hitAndRun: 0.7, howl: true,
    attackPatch: { lungeSpeed: 235, hitRadius: 10 },
  },
  // Reifhexe: Frostbolzen aus dem Stabkristall (meta.hand), legt Frostfelder.
  rime_witch: {
    bodyHeight: 30, eye: { x: 4, y: -25 }, radius: 6, hurtRadius: 8, shadowW: 16, mass: 1, material: 'flesh',
    attackPatch: { projectile: 'bolt', element: 'frost', homing: 0.6 },
    specials: [
      { kind: 'cloud', anim: 'field', range: 170, windup: 0.9, radius: 30, duration: 4, dmgK: 0.3, element: 'frost', cooldown: 10 },
    ],
  },
  // Schneepirscher: lauert im Schnee (steigt auf), schnelle Doppel-Prankenhiebe.
  snow_stalker: {
    bodyHeight: 18, eye: { x: 15, y: -18 }, radius: 7, hurtRadius: 9, shadowW: 28, mass: 1.3, speed: 62,
    material: 'flesh', spawnStyle: 'rise', strafe: true, hitAndRun: 0.5,
    attackPatch: { range: 28, reach: 30, arc: 2.0, windup: 0.5, cooldown: 0.75, lunge: 130 },
  },
  // Gorm Eisfaust (Elite): Faustschmettern, Spezial beidhändiger Eisdorn-Slam und Sturmlauf.
  ice_troll_chief: {
    bodyHeight: 52, eye: { x: 27, y: -36 }, radius: 15, hurtRadius: 19, shadowW: 48, mass: 7, speed: 32,
    material: 'flesh', spawnStyle: 'fade', roar: true, roarTime: 1.15,
    attackPatch: { range: 52, offset: 44, radius: 30, windup: 0.9, colors: ICE_COLORS },
    specials: [
      { kind: 'slam', anim: 'slam', range: 110, windup: 1.05, radius: 46, offset: 40, dmgK: 1.25, wave: 130, cooldown: 8, recover: 1.0,
        colors: ICE_COLORS, waveColor: [150, 215, 255], element: 'frost' },
      { kind: 'charge', anim: 'brace', range: 170, minRange: 70, windup: 0.8, speed: 250, duration: 0.65, dmgK: 1.2, cooldown: 8, stun: 1.3 },
    ],
  },
};
