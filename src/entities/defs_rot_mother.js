// Wertänderungen für Mutter Fäulnis (rot_mother), werden über ENEMY_TYPES.rot_mother gelegt.
// Leben bleibt 17 500 (enemyTypes3.js). Maße passend zur großen, stationären Figur;
// Schaden der Angriffe steht in RotMother.js (DMG) und richtet sich nach Magier-HP Stufe 32 (≈ 591).
export const DEFS = {
  rot_mother: {
    speed: 16,
    radius: 18,
    mass: 30,
    hurtRadius: 24,
    bodyHeight: 64,
    shadowW: 76,
    material: 'flesh',
    eye: { x: 20, y: -86 },
  },
};
