// Werte-Anpassungen für Skalvyr, den Frostwurm (Boss der Reifhöhlen, Stufe 37).
// Wird über ENEMY_TYPES.frost_wyrm gemischt (Leben/XP bleiben vom Skalierer).
// Maße passen zu sprites/frost_wyrm.js: Anker = Leibmitte, Brust bei +16 px,
// Kopf bis ca. +62 px, Schwanzspitze bis ca. -54 px (Blick nach rechts).
export const DEFS = {
  frost_wyrm: {
    radius: 15,        // Kollision am Boden
    hurtRadius: 26,    // Trefferfläche: deckt Brust, Leibmitte und Schwanzansatz
    bodyHeight: 36,    // Mitte der Trefferfläche 18 px über dem Boden
    shadowW: 104,      // Leibschatten (Skalvyr zeichnet einen eigenen, flachen Schatten)
    mass: 14,
    speed: 40,
    material: 'stone',
    eye: { x: 44, y: -50 },
  },
};
