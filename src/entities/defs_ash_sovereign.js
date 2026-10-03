// Werte für Malgareth (ergänzt ENEMY_TYPES.ash_sovereign aus enemyTypes3.js).
// Maße passend zur Figur (sprites/ash_sovereign.js): Riese, rund 85 × 120 px mit Kragen und Krone,
// Augen ~97 px über dem Boden, breite Schultern (Schatten/Trefferradius entsprechend).
// hp absolut (Endboss: Kampf 90–150 s auf Stufe 40).
export const DEFS = {
  ash_sovereign: { hp: 100000, bodyHeight: 100, eye: { x: 7, y: -97 }, radius: 15, hurtRadius: 23, shadowW: 58, mass: 12, speed: 42 },
};
