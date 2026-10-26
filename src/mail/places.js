// Briefkästen der Rabenpost in den Städten: Abstand zum Wegstein in Spielpixeln (eine Kachel = 16).
// Gemeinsam mit Auktionator und Gewandmeisterin gewählt (siehe market/places.js): im Ort, nicht direkt neben
// den beiden, kein Briefkasten auf einem Questpfad. Glutsenke und Glutöde haben einen zweiten Kasten.
export const PLACES = {
  emberhollow: [{ dx: -112, dy: 78 }, { dx: 48, dy: 78 }],
  ashwood: [{ dx: 16, dy: -194 }],
  cinder_peaks: [{ dx: 224, dy: -50 }],
  ashen_steppe: [{ dx: 256, dy: -66 }],
  blighted_marsh: [{ dx: 80, dy: 14 }],
  frostspire: [{ dx: -112, dy: -98 }],
  ember_wastes: [{ dx: -80, dy: 110 }, { dx: 64, dy: -2 }],
  sternhafen: [{ dx: -64, dy: -16 }, { dx: 112, dy: 448 }],
};
