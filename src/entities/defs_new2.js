// Runde 5: Maße und Verhalten der neuen Gegner Stufe 20–40 (Figuren: sprites/foes_new2.js).
// Schaden skaliert enemyTypes3.js; specials geben dmgK relativ zum Grundangriff.
// Verhalten der neuen special-Arten: entities/Enemy.js (#beginNewSpecial / #updateNewSpecial).
// Alle Warnungen ≥ 0,5 s; Treffer liegen genau in der gezeichneten Warnung.

const SLIME_COLS = ['#d8f0a0', '#7a9a38', '#3a4a1a'];

export const DEFS = {
  // Staubschamane: Staubbolzen, hält Abstand, setzt ein Heiltotem (zerstörbar) und heilt Verletzte
  dust_shaman: {
    bodyHeight: 28, eye: { x: 7, y: -23 }, radius: 6, hurtRadius: 8, shadowW: 14, mass: 1, speed: 40, material: 'flesh', spawnStyle: 'fade',
    attackPatch: { projectile: 'bolt', element: 'dust', range: 150, minRange: 72, windup: 0.75, count: 1 },
    specials: [
      { kind: 'totem', anim: 'cast', type: 'dust_totem', max: 1, range: 230, windup: 0.9, recover: 0.6, cooldown: 12 },
      { kind: 'heal', anim: 'cast', range: 230, radius: 130, below: 0.7, amount: 0.22, windup: 0.8, recover: 0.5, cooldown: 7 },
    ],
  },
  // Staubtotem: ortsfest, heilt alle 2 s Verbündete im Ring (85 px) um 5 %, vergeht nach 25 s
  dust_totem: {
    static: true, noChampion: true, stagger: false, speed: 0, aggro: 0, leash: Infinity, wander: 0, spawnStyle: 'rise',
    bodyHeight: 32, eye: { x: 0, y: -28 }, radius: 7, hurtRadius: 9, shadowW: 16, mass: 99, material: 'wood', hurtTime: 0,
    totem: { radius: 85, every: 2, heal: 0.05, life: 25 },
    attackPatch: { kind: 'none', range: 0, windup: 1, active: 0, recover: 0, cooldown: 99 },
  },
  // Fallensteller: Speerwurf auf Abstand, Netz (Linienwarnung 0,7 s, festgehalten 1,2 s)
  gnoll_trapper: {
    bodyHeight: 23, eye: { x: 9, y: -22 }, radius: 6, hurtRadius: 8, shadowW: 16, mass: 1.1, speed: 46, material: 'flesh', spawnStyle: 'fade',
    attackPatch: { range: 150, minRange: 80, windup: 0.7 },
    specials: [
      { kind: 'net', anim: 'throw', range: 140, minRange: 0, windup: 0.7, speed: 230, len: 160, width: 14, root: 1.2, dmgK: 0.3, recover: 0.5, cooldown: 7 },
    ],
  },
  // Moorschleim: langsamer Klatscher (Kreis), zerfällt beim Tod in zwei kleine
  bog_slime: {
    bodyHeight: 16, eye: { x: 6, y: -10 }, radius: 10, hurtRadius: 12, shadowW: 30, mass: 2.4, speed: 26, material: 'flesh', spawnStyle: 'rise', stagger: true,
    split: { type: 'bog_slime_small', count: 2 },
    attackPatch: { kind: 'slam', range: 34, windup: 0.75, radius: 20, offset: 12, colors: SLIME_COLS },
  },
  bog_slime_small: {
    bodyHeight: 13, eye: { x: 5, y: -8 }, radius: 8, hurtRadius: 10, shadowW: 24, mass: 0.6, speed: 60, material: 'flesh', spawnStyle: 'rise',
    noChampion: true, strafe: true, hitAndRun: 0.4,
    attackPatch: { kind: 'lunge', range: 42, windup: 0.5, lungeSpeed: 200, hitRadius: 8 },
  },
  // Sumpfhexe: Fluchbolzen; kommt man ihr nahe, blinzelt sie zu einer Uferstelle (Flimmern 0,6 s)
  // und legt sofort eine Fluchzone (Kreiswarnung 0,9 s, Schaden + Verlangsamung)
  marsh_hag: {
    bodyHeight: 32, eye: { x: 7, y: -27 }, radius: 6, hurtRadius: 8, shadowW: 16, mass: 1, speed: 36, material: 'flesh', spawnStyle: 'fade',
    attackPatch: { projectile: 'bolt', element: 'curse', homing: 0.6, range: 150, minRange: 60 },
    specials: [
      { kind: 'blink', anim: 'vanish', range: 70, minRange: 0, windup: 0.5, warn: 0.6, minDist: 70, maxDist: 130, recover: 0.4, cooldown: 7, then: 'curse', colors: ['#ffffff', '#c8f0a0', '#6a8a40'] },
      { kind: 'curse', anim: 'cast', range: 175, minRange: 0, windup: 0.9, radius: 26, duration: 4, dmgK: 0.3, slow: 0.6, recover: 0.5, cooldown: 9 },
    ],
  },
  // Frostwiedergänger: Eispanzer (60 % des Lebens als eigene Leiste, nur 25 % gehen durch, schwere Treffer ×1,6),
  // bricht er, taumelt er 1,4 s und kämpft ohne Panzer; nach 12 s friert er sich neu ein (1 s Ausholen).
  frost_revenant: {
    bodyHeight: 34, eye: { x: 4, y: -30 }, radius: 8, hurtRadius: 10, shadowW: 22, mass: 2.2, speed: 34, material: 'ice', spawnStyle: 'rise',
    armor: { share: 0.6, intake: 0.25, heavyMul: 1.6, stun: 1.4 },
    attackPatch: { range: 26, reach: 28, windup: 0.6, arc: 2.3, lunge: 70 },
    specials: [
      { kind: 'icestrike', anim: 'windup', range: 90, minRange: 18, windup: 0.8, len: 96, width: 16, dmgK: 1.2, knockback: 160, recover: 0.7, cooldown: 6 },
      { kind: 'refreeze', anim: 'cast', range: 999, windup: 1.0, after: 12, recover: 0.4, cooldown: 4 },
    ],
  },
  // Schneewurm: wie der Glutkäfer, größer, Schneespur; Rundumschlag beim Auftauchen (Kreis 28)
  snow_burrower: {
    bodyHeight: 28, eye: { x: 12, y: -27 }, radius: 10, hurtRadius: 12, shadowW: 36, mass: 2.4, speed: 40, material: 'flesh', spawnStyle: 'rise',
    attackPatch: { kind: 'lunge', range: 42, windup: 0.55, active: 0.22, recover: 0.5, cooldown: 1.2, lungeSpeed: 190, hitRadius: 10 },
    specialStart: 1.5,
    specials: [
      { kind: 'burrow', anim: 'dig', range: 220, minRange: 0, windup: 0.55, speed: 72, maxTravel: 3, warn: 0.85, radius: 28, dmgK: 1.4, knockback: 220, recover: 0.9, cooldown: 7,
        trail: 'snow', trailColor: '#e8f0ff', colors: ['#ffffff', '#d8f0ff', '#8ab0d0'], color: [150, 200, 255] },
    ],
  },
  // Aschebombardier: Bogenwurf auf den Standort beim Ausholen (Kreiswarnung bis zum Einschlag, 1,5 s),
  // kurz brennender Boden im Kreis; hält Abstand
  cinder_bombardier: {
    bodyHeight: 38, eye: { x: 14, y: -24 }, radius: 10, hurtRadius: 12, shadowW: 26, mass: 1.1, speed: 40, material: 'flesh', spawnStyle: 'fade',
    attackPatch: { projectile: 'lob', fixed: true, range: 175, minRange: 80, windup: 0.6, flight: 0.9, radius: 22, burn: 2.5, recover: 0.6, cooldown: 1.8, count: 1 },
  },
  // Phasengeist: verschwindet, Flimmern + Kreiswarnung (0,6 s) hinter dem Helden, dann Hieb genau dort
  phase_wraith: {
    bodyHeight: 38, eye: { x: 6, y: -37 }, radius: 6, hurtRadius: 8, shadowW: 14, mass: 1.1, speed: 46, material: 'flesh', spawnStyle: 'fade',
    attackPatch: { range: 26, reach: 28, windup: 0.55 },
    specials: [
      { kind: 'blink', behind: true, anim: 'vanish', range: 160, minRange: 0, windup: 0.35, warn: 0.6, radius: 22, dmgK: 1.3, knockback: 170, recover: 0.6, cooldown: 6, colors: ['#ffffff', '#c8a0ff', '#6030a0'] },
    ],
  },
};
