// Engine-weite Konstanten (Darstellung, Takt, Licht). Balancing-Werte der
// Bereiche gehören in deren eigene Datendateien (Klassen, Gegner, Items …),
// nicht hierher.
export const CONFIG = {
  // Interne Pixel-Auflösung (16:9). Wird ganzzahlig hochskaliert (1080p = 4x).
  viewWidth: 480,
  viewHeight: 270,
  // Hochformat (Handy): Das Spielbild wird schmal und hoch statt 16:9 verkleinert.
  // Game.resize() setzt viewWidth/viewHeight zur Laufzeit; nur in diesen Szenen.
  landscapeView: { width: 480, height: 270 },
  portraitView: { width: 270, minHeight: 360, maxHeight: 480 },
  portraitScenes: ['play'],
  tileSize: 16,
  fixedStep: 1 / 60,
  maxFrameTime: 0.25,
  autosaveInterval: 20, // Sekunden

  lighting: {
    ambient: [46, 38, 66], // Grundhelligkeit des Dungeons (RGB 0..255)
    heroLightRadius: 110,
    heroLightColor: [255, 196, 140],
  },

  // Rückfallwert, falls eine Trefferzone keine eigene Krit-Chance trägt
  // (Heldenwerte kommen aus src/character/, Gegnerwerte aus enemyTypes.js).
  hero: { critChance: 0.1 },

  feedback: {
    hitstopLight: 0.055,
    hitstopHeavy: 0.1,
    hitstopKill: 0.12,
    shakeLight: 2.2,
    shakeHeavy: 4.5,
  },
};
