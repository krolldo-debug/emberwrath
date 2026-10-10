// Engine-weite Konstanten (Darstellung, Takt, Licht). Balancing-Werte der
// Bereiche gehören in deren eigene Datendateien (Klassen, Gegner, Items …),
// nicht hierher.
export const CONFIG = {
  // Interne Pixel-Auflösung (16:9). Wird ganzzahlig hochskaliert (1080p = 4x).
  viewWidth: 480,
  viewHeight: 270,
  // Hochformat (Handy): Das Spielbild wird schmal und hoch statt 16:9 verkleinert.
  // Game.resize() setzt viewWidth/viewHeight zur Laufzeit; nur in diesen Szenen.
  landscapeView: { width: 480, height: 270, maxWidth: 640, maxHeight: 360 }, // Querformat: Breite folgt dem Seitenverhältnis (16:9 bis 21:9)
  portraitView: { width: 270, minHeight: 360, maxHeight: 480 },
  portraitScenes: ['play'],
  // Überabtastung (INTEGRATION §11.12): Das Spielbild wird mit bis zu spriteRes Bildpunkten je Weltpixel
  // gezeichnet (Game setzt ctx.setTransform(k,0,0,k,0,0)). Systeme zeichnen weiter in Weltpixeln; Figuren mit
  // frame.res > 1 zeigen dadurch feinere Details. renderScale = das aktuell genutzte k (live lesen, nur Game schreibt).
  spriteRes: 2,
  renderScale: 1,
  tileSize: 16,
  fixedStep: 1 / 60,
  maxFrameTime: 0.25,
  backgroundCatchUp: 1,  // s: so viel rechnet der Hintergrund-Takt je Aufruf höchstens (Tab verborgen, 60 Schritte); der Rest verfällt
  maxStepsPerFrame: 4,  // schwache Geräte: lieber kurz langsamer als ein Nachhol-Stau (unter 15 fps läuft das Spiel verlangsamt)
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
