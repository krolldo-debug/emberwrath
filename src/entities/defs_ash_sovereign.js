// Werte für Malgareth (ergänzt ENEMY_TYPES.ash_sovereign aus enemyTypes3.js).
// Maße passend zur Figur (sprites/ash_sovereign.js): Riese, Kronenspitze ~84 px, Augen ~76 px über dem Boden,
// breite Schultern (Schatten/Trefferradius entsprechend). hp absolut (Endboss: Kampf 75–110 s auf Stufe 40).
export const DEFS = {
  ash_sovereign: { hp: 60000, bodyHeight: 78, eye: { x: 5, y: -76 }, radius: 13, hurtRadius: 19, shadowW: 46, mass: 12, speed: 42 },
};
