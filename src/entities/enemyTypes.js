// Datengetriebene Gegnerdefinitionen. Ein neuer Gegner = neuer Eintrag
// + Sprite-Generator; die KI in Enemy.js ist generisch.
// Wird zusätzlich als Content 'enemy' registriert (world/index.js), damit
// andere Bereiche Namen, Stufe und XP per ID lesen können.
//
// KI-Felder:
//   level, xp        Anzeige und Belohnung (EV.ENEMY_KILLED)
//   aggro            Sichtweite, ab der der Gegner angreift (px, braucht Sichtlinie)
//   leash            max. Entfernung vom Heimatpunkt, danach Rückzug (heilt voll)
//   wander           Radius, in dem er ohne Ziel umherstreift (0 = steht)
//   spawnStyle       'rise' (aus dem Boden) | 'fade' (aus dem Schatten)
//   hitAndRun        nach dem Angriff kurz zurückweichen (Rudeltiere)
//   howl             ruft beim Entdecken das Rudel (und beschleunigt es)
//   family           grobe Art für Feedback/Sound: 'undead' | 'beast' | 'spider'
export const ENEMY_TYPES = {
  wolf: {
    name: 'Aschewolf', family: 'beast', levels: [1, 2], xp: 10,
    sprites: 'wolf',
    hp: 30, speed: 72, radius: 5, mass: 0.9, hurtRadius: 7, bodyHeight: 12, shadowW: 20,
    material: 'flesh',
    eye: { x: 11, y: -16 },
    hurtTime: 0.22,
    aggro: 92, leash: 250, wander: 28, spawnStyle: 'fade',
    strafe: true, hitAndRun: 0.7,
    attack: { kind: 'lunge', range: 46, windup: 0.45, active: 0.22, recover: 0.35, cooldown: 1.3, damage: 8, knockback: 110, lungeSpeed: 215 },
  },
  wolf_alpha: {
    name: 'Rudelführer Glutfang', family: 'beast', level: 3, xp: 30, elite: true,
    sprites: 'wolf_alpha',
    hp: 95, speed: 66, radius: 7, mass: 1.6, hurtRadius: 9, bodyHeight: 16, shadowW: 26,
    material: 'flesh',
    eye: { x: 14, y: -21 },
    hurtTime: 0.18,
    aggro: 110, leash: 280, wander: 20, spawnStyle: 'fade',
    strafe: true, hitAndRun: 0.5, howl: true,
    attack: { kind: 'lunge', range: 56, windup: 0.6, active: 0.26, recover: 0.45, cooldown: 1.1, damage: 15, knockback: 170, lungeSpeed: 240 },
  },
  skeleton: {
    name: 'Skelettkrieger', family: 'undead', levels: [3, 5], xp: 15,
    sprites: 'skeleton',
    hp: 38, speed: 36, radius: 5, mass: 1, hurtRadius: 7, bodyHeight: 18, shadowW: 13,
    material: 'bone',
    eye: { x: 3, y: -20 },
    hurtTime: 0.26,
    aggro: 100, leash: 320, wander: 10, spawnStyle: 'rise',
    attack: { kind: 'melee', range: 22, windup: 0.5, active: 0.12, recover: 0.55, cooldown: 0.7, damage: 12, knockback: 150, reach: 22, arc: 2.2, lunge: 70 },
  },
  archer: {
    name: 'Skelettschütze', family: 'undead', levels: [3, 5], xp: 14,
    sprites: 'archer',
    hp: 26, speed: 32, radius: 5, mass: 0.9, hurtRadius: 7, bodyHeight: 18, shadowW: 13,
    material: 'bone',
    eye: { x: 3, y: -20 },
    hurtTime: 0.3,
    aggro: 135, leash: 320, wander: 0, spawnStyle: 'rise',
    attack: { kind: 'ranged', range: 140, minRange: 64, windup: 0.75, active: 0.05, recover: 0.6, cooldown: 1.1, damage: 9, projectileSpeed: 175 },
  },
  spider: {
    name: 'Höhlenspinne', family: 'spider', levels: [4, 6], xp: 12,
    sprites: 'spider',
    hp: 26, speed: 64, radius: 6, mass: 0.8, hurtRadius: 8, bodyHeight: 10, shadowW: 22,
    material: 'chitin',
    eye: { x: 6, y: -8 },
    hurtTime: 0.2,
    aggro: 70, leash: 260, wander: 16, spawnStyle: 'fade',
    strafe: true, hitAndRun: 0.4,
    attack: { kind: 'lunge', range: 50, windup: 0.42, active: 0.26, recover: 0.6, cooldown: 0.9, damage: 10, knockback: 120, lungeSpeed: 230 },
  },
  bonelord: {
    name: 'Varkhul, der Knochenfürst', family: 'undead', level: 6, xp: 260,
    boss: true, bossId: 'bonelord',
    sprites: 'bonelord',
    hp: 3000, speed: 40, radius: 10, mass: 6, hurtRadius: 13, bodyHeight: 44, shadowW: 34,
    material: 'bone',
    eye: { x: 3, y: -54 },
    hurtTime: 0,
    aggro: 0, leash: Infinity, wander: 0, spawnStyle: 'rise',
    attack: { kind: 'boss' },
  },
  // --- Aschenwald (Stufe 6–11)
  ash_boar: {
    name: 'Aschekeiler', family: 'beast', levels: [6, 7], xp: 40, sprites: 'ash_boar',
    hp: 210, speed: 50, radius: 10, mass: 2.6, hurtRadius: 12, bodyHeight: 20, shadowW: 30, material: 'flesh',
    eye: { x: 14, y: -13 }, hurtTime: 0.2, aggro: 100, leash: 260, wander: 24, spawnStyle: 'fade',
    attack: { kind: 'charge', range: 110, windup: 0.7, active: 0.55, recover: 0.5, cooldown: 2.2, damage: 23, knockback: 230, chargeSpeed: 230, hitRadius: 12, stun: 1.1 },
  },
  bandit: {
    name: 'Bandit', family: 'human', levels: [7, 9], xp: 45, sprites: 'bandit',
    hp: 215, speed: 44, radius: 6, mass: 1.1, hurtRadius: 8, bodyHeight: 24, shadowW: 14, material: 'flesh',
    eye: { x: 3, y: -23 }, hurtTime: 0.24, aggro: 110, leash: 300, wander: 16, spawnStyle: 'fade',
    attack: { kind: 'melee', range: 24, windup: 0.45, active: 0.12, recover: 0.45, cooldown: 0.8, damage: 19, knockback: 150, reach: 24, arc: 2.2, lunge: 80 },
  },
  bandit_archer: {
    name: 'Banditenschütze', family: 'human', levels: [7, 9], xp: 45, sprites: 'bandit_archer',
    hp: 160, speed: 40, radius: 6, mass: 1, hurtRadius: 8, bodyHeight: 24, shadowW: 14, material: 'flesh',
    eye: { x: 3, y: -23 }, hurtTime: 0.28, aggro: 150, leash: 300, wander: 0, spawnStyle: 'fade',
    attack: { kind: 'ranged', range: 150, minRange: 60, windup: 0.7, active: 0.05, recover: 0.55, cooldown: 1.1, damage: 17, projectileSpeed: 200 },
  },
  thorn_crawler: {
    name: 'Dornenkriecher', family: 'beast', levels: [7, 9], xp: 50, sprites: 'thorn_crawler',
    hp: 280, speed: 26, radius: 9, mass: 2, hurtRadius: 11, bodyHeight: 12, shadowW: 26, material: 'wood',
    eye: { x: 12, y: -7 }, hurtTime: 0.2, aggro: 90, leash: 220, wander: 12, spawnStyle: 'rise',
    attack: { kind: 'ranged', projectile: 'bolt', element: 'poison', range: 110, minRange: 20, windup: 0.8, active: 0.05, recover: 0.6, cooldown: 1.6, damage: 12, projectileSpeed: 120, count: 3, spread: 0.5 },
  },
  bandit_chief: {
    name: 'Rask, der Brandschatzer', family: 'human', level: 10, xp: 300, elite: true, sprites: 'bandit_chief',
    hp: 1700, speed: 42, radius: 10, mass: 4, hurtRadius: 13, bodyHeight: 38, shadowW: 30, material: 'flesh',
    eye: { x: 5, y: -32 }, hurtTime: 0.15, aggro: 120, leash: 260, wander: 8, spawnStyle: 'fade', roar: true, roarTime: 1.1,
    attack: { kind: 'melee', range: 30, windup: 0.6, active: 0.14, recover: 0.5, cooldown: 1.0, damage: 30, knockback: 220, reach: 32, arc: 2.4, lunge: 90 },
    specials: [
      { kind: 'spin', anim: 'spin', range: 70, windup: 0.6, duration: 2.0, radius: 26, damage: 16, speedMul: 0.9, cooldown: 9 },
      { kind: 'charge', range: 160, minRange: 60, windup: 0.8, speed: 250, duration: 0.6, damage: 40, cooldown: 7, stun: 1.2 },
    ],
  },
  // --- Versunkener Tempel (Stufe 10–12)
  drowned: {
    name: 'Ertrunkener', family: 'undead', levels: [10, 11], xp: 55, sprites: 'drowned',
    hp: 290, speed: 34, radius: 6, mass: 1.3, hurtRadius: 8, bodyHeight: 22, shadowW: 14, material: 'flesh',
    eye: { x: 7, y: -20 }, hurtTime: 0.25, aggro: 100, leash: 320, wander: 8, spawnStyle: 'rise',
    attack: { kind: 'lunge', range: 40, windup: 0.55, active: 0.2, recover: 0.5, cooldown: 1.0, damage: 24, knockback: 140, lungeSpeed: 170 },
  },
  tide_cultist: {
    name: 'Gezeitenkultist', family: 'human', levels: [10, 12], xp: 60, sprites: 'tide_cultist',
    hp: 220, speed: 38, radius: 6, mass: 1, hurtRadius: 8, bodyHeight: 26, shadowW: 16, material: 'flesh',
    eye: { x: 4, y: -23 }, hurtTime: 0.28, aggro: 150, leash: 320, wander: 0, spawnStyle: 'fade',
    attack: { kind: 'ranged', projectile: 'bolt', element: 'water', range: 150, minRange: 64, windup: 0.8, active: 0.05, recover: 0.6, cooldown: 1.3, damage: 24, projectileSpeed: 140, homing: 0.8 },
  },
  temple_guardian: {
    name: 'Tempelwächter', family: 'construct', levels: [11, 12], xp: 80, sprites: 'temple_guardian',
    hp: 500, speed: 26, radius: 10, mass: 4, hurtRadius: 13, bodyHeight: 36, shadowW: 28, material: 'stone', stagger: false,
    eye: { x: 6, y: -32 }, hurtTime: 0.2, aggro: 100, leash: 240, wander: 0, spawnStyle: 'fade',
    attack: { kind: 'slam', range: 40, windup: 0.95, active: 0.15, recover: 0.8, cooldown: 1.6, damage: 34, knockback: 240, radius: 26, offset: 18, colors: ['#ffffff', '#b8f0ff', '#50c8e0'] },
  },
  // --- Schlackenhöhen (Stufe 12–17)
  fire_imp: {
    name: 'Feuerwicht', family: 'demon', levels: [12, 14], xp: 45, sprites: 'fire_imp',
    hp: 200, speed: 80, radius: 5, mass: 0.6, hurtRadius: 7, bodyHeight: 26, shadowW: 10, material: 'flesh',
    eye: { x: 3, y: -22 }, hurtTime: 0.2, aggro: 120, leash: 280, wander: 30, spawnStyle: 'fade', strafe: true, hitAndRun: 0.6,
    attack: { kind: 'lunge', range: 44, windup: 0.4, active: 0.2, recover: 0.3, cooldown: 1.0, damage: 22, knockback: 90, lungeSpeed: 230, hitRadius: 7 },
  },
  magma_hound: {
    name: 'Magmahund', family: 'beast', levels: [13, 16], xp: 70, sprites: 'magma_hound',
    hp: 365, speed: 70, radius: 9, mass: 1.4, hurtRadius: 11, bodyHeight: 22, shadowW: 30, material: 'stone',
    eye: { x: 17, y: -20 }, hurtTime: 0.2, aggro: 110, leash: 280, wander: 26, spawnStyle: 'fade', strafe: true, hitAndRun: 0.6,
    attack: { kind: 'lunge', range: 52, windup: 0.5, active: 0.24, recover: 0.4, cooldown: 1.2, damage: 29, knockback: 150, lungeSpeed: 240 },
  },
  ash_golem: {
    name: 'Aschegolem', family: 'construct', levels: [14, 16], xp: 95, sprites: 'ash_golem',
    hp: 620, speed: 28, radius: 10, mass: 4.5, hurtRadius: 13, bodyHeight: 36, shadowW: 30, material: 'stone', stagger: false,
    eye: { x: 5, y: -34 }, hurtTime: 0.2, aggro: 95, leash: 240, wander: 6, spawnStyle: 'rise',
    attack: { kind: 'slam', range: 42, windup: 1.0, active: 0.15, recover: 0.8, cooldown: 1.6, damage: 42, knockback: 260, radius: 28, offset: 18, colors: ['#fff0b0', '#ffb640', '#f07a1c'] },
  },
  cinder_cultist: {
    name: 'Schlackenkultist', family: 'human', levels: [13, 16], xp: 75, sprites: 'cinder_cultist',
    hp: 275, speed: 38, radius: 6, mass: 1, hurtRadius: 8, bodyHeight: 26, shadowW: 16, material: 'flesh',
    eye: { x: 5, y: -23 }, hurtTime: 0.28, aggro: 160, leash: 320, wander: 0, spawnStyle: 'fade',
    attack: { kind: 'ranged', projectile: 'bolt', element: 'fire', range: 160, minRange: 64, windup: 0.8, active: 0.05, recover: 0.6, cooldown: 1.3, damage: 30, projectileSpeed: 160 },
  },
  magma_behemoth: {
    name: 'Der Schlackenkoloss', family: 'construct', level: 16, xp: 500, elite: true, sprites: 'magma_behemoth',
    hp: 2600, speed: 30, radius: 16, mass: 7, hurtRadius: 20, bodyHeight: 54, shadowW: 46, material: 'stone', stagger: false,
    eye: { x: 13, y: -50 }, hurtTime: 0.15, aggro: 120, leash: 240, wander: 0, spawnStyle: 'fade', roar: true, roarTime: 1.2,
    attack: { kind: 'slam', range: 48, windup: 0.9, active: 0.15, recover: 0.7, cooldown: 1.4, damage: 48, knockback: 260, radius: 30, offset: 22, colors: ['#fff0b0', '#ffb640', '#f07a1c'] },
    specials: [{ kind: 'slam', anim: 'slam', range: 110, windup: 1.1, radius: 46, offset: 16, damage: 60, wave: 130, cooldown: 8, recover: 1.0 }],
  },
  // --- Glutschmiede (Stufe 17–20)
  forge_golem: {
    name: 'Schmiedegolem', family: 'construct', levels: [17, 19], xp: 120, sprites: 'forge_golem',
    hp: 700, speed: 30, radius: 10, mass: 4.5, hurtRadius: 13, bodyHeight: 36, shadowW: 30, material: 'metal', stagger: false,
    eye: { x: 6, y: -37 }, hurtTime: 0.2, aggro: 100, leash: 260, wander: 0, spawnStyle: 'fade',
    attack: { kind: 'slam', range: 42, windup: 0.9, active: 0.15, recover: 0.75, cooldown: 1.5, damage: 50, knockback: 260, radius: 28, offset: 18, colors: ['#ffffff', '#ffe070', '#ffb640'] },
  },
  flame_acolyte: {
    name: 'Flammenakolyth', family: 'human', levels: [17, 19], xp: 100, sprites: 'flame_acolyte',
    hp: 350, speed: 40, radius: 6, mass: 1, hurtRadius: 8, bodyHeight: 26, shadowW: 16, material: 'flesh',
    eye: { x: 4, y: -23 }, hurtTime: 0.28, aggro: 160, leash: 320, wander: 0, spawnStyle: 'fade',
    attack: { kind: 'ranged', projectile: 'bolt', element: 'fire', range: 160, minRange: 60, windup: 0.75, active: 0.05, recover: 0.6, cooldown: 1.4, damage: 22, projectileSpeed: 170, count: 3, spread: 0.35 },
  },
  ember_drake: {
    name: 'Glutdrache', family: 'beast', levels: [18, 20], xp: 150, sprites: 'ember_drake',
    hp: 640, speed: 42, radius: 12, mass: 3.5, hurtRadius: 14, bodyHeight: 24, shadowW: 40, material: 'flesh',
    eye: { x: 23, y: -21 }, hurtTime: 0.18, aggro: 130, leash: 280, wander: 10, spawnStyle: 'fade',
    attack: { kind: 'breath', element: 'fire', range: 70, windup: 0.8, active: 1.0, recover: 0.7, cooldown: 2.2, damage: 10, reach: 72, arc: 0.8, tick: 0.15, track: 1.0 },
  },
  forge_warden: {
    name: 'Wächter der Esse', family: 'construct', level: 19, xp: 700, elite: true, sprites: 'forge_warden',
    hp: 3200, speed: 32, radius: 15, mass: 7, hurtRadius: 19, bodyHeight: 52, shadowW: 44, material: 'metal', stagger: false,
    eye: { x: 5, y: -50 }, hurtTime: 0.15, aggro: 130, leash: 260, wander: 0, spawnStyle: 'fade', roar: true, roarTime: 1.2,
    attack: { kind: 'melee', range: 36, windup: 0.7, active: 0.14, recover: 0.6, cooldown: 1.1, damage: 55, knockback: 240, reach: 36, arc: 2.4, lunge: 70 },
    specials: [
      { kind: 'slam', anim: 'slam', range: 90, windup: 1.0, radius: 44, offset: 18, damage: 70, wave: 120, cooldown: 7, recover: 0.9, colors: ['#ffffff', '#ffe070', '#ffb640'] },
      { kind: 'charge', range: 170, minRange: 70, windup: 0.8, speed: 260, duration: 0.65, damage: 60, cooldown: 8, stun: 1.4 },
    ],
  },
  // --- Bosse Runde 2 (Logik in Nerith.js / Ignaroth.js)
  drowned_priestess: {
    name: 'Nerith, die Ertrunkene Priesterin', family: 'undead', level: 12, xp: 900, boss: true, bossId: 'drowned_priestess',
    sprites: 'nerith',
    hp: 6000, speed: 46, radius: 10, mass: 6, hurtRadius: 13, bodyHeight: 52, shadowW: 30,
    material: 'flesh', hurtTime: 0.2, eye: { x: 4, y: -55 },
  },
  ember_tyrant: {
    name: 'Ignaroth, der Glut-Tyrann', family: 'demon', level: 20, xp: 2600, boss: true, bossId: 'ember_tyrant',
    sprites: 'ignaroth',
    hp: 11000, speed: 44, radius: 12, mass: 8, hurtRadius: 15, bodyHeight: 56, shadowW: 40,
    material: 'stone', hurtTime: 0.2, eye: { x: 6, y: -64 },
  },
};
