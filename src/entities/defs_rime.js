// Reifhöhlen (35–37): Maße/Verhalten passend zu sprites/foes_rime.js.
// Wird über die Basiswerte aus enemyTypes3.js gelegt; attackPatch wird in
// `attack` gemischt (Schaden bleibt vom Skalierer).
export const DEFS = {
  // Schwebender Kristallkörper, Fernkampf: Eissplitter-Kugel (Frost).
  // Vorbild fire_imp (Nahkampf-Sprung) → hier Fernkämpfer mit Abstand.
  ice_elemental: {
    bodyHeight: 42, eye: { x: 5, y: -36 }, radius: 7, hurtRadius: 10, shadowW: 18, mass: 1.2, speed: 46,
    material: 'stone', spawnStyle: 'fade', strafe: false, hitAndRun: 0,
    attackPatch: {
      kind: 'ranged', projectile: 'bolt', element: 'frost', range: 150, minRange: 56,
      windup: 0.7, active: 0.05, recover: 0.6, cooldown: 1.5, projectileSpeed: 150, count: 1, knockback: 60,
    },
  },
  // Spinne mit Kristallpanzer: schnell, Sprungbiss, weicht zurück.
  crystal_spider: {
    bodyHeight: 18, eye: { x: 10, y: -10 }, radius: 8, hurtRadius: 11, shadowW: 32, mass: 1.2, speed: 80,
    material: 'chitin', spawnStyle: 'fade', strafe: true, hitAndRun: 0.5,
    attackPatch: { range: 56, windup: 0.5, lungeSpeed: 270, hitRadius: 10 },
  },
  // Im Eis erstarrter Ritter mit Zweihänder: langsamer Bodenschlag (slam), Eis bricht auf.
  frozen_knight: {
    bodyHeight: 44, eye: { x: 5, y: -36 }, radius: 10, hurtRadius: 13, shadowW: 30, mass: 4.5, speed: 24,
    material: 'stone', spawnStyle: 'rise',
    attackPatch: { range: 44, windup: 1.0, radius: 28, offset: 26, colors: ['#ffffff', '#b8f0ff', '#50c8e0'] },
  },
};
