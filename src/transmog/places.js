// Wo die Gewandmeisterin in den Städten steht: Abstand zum Wegstein in Spielpixeln (eine Kachel = 16).
// mirror: Seite des Standspiegels (1 = rechts von ihr, -1 = links); sie schaut zur anderen Seite.
// Gemeinsam mit Auktionator und Briefkasten gewählt (siehe market/places.js): im Ort, in Sichtweite, aber nicht
// auf einem Fleck; kein Schild über Häusern, anderen Schildern oder Questpfaden.
export const PLACES = {
  emberhollow: { dx: -16, dy: 110, mirror: 1 },    // südliche Dorfgasse
  ashwood: { dx: 96, dy: -114, mirror: -1 },       // beim Baumhaus des Händlers
  cinder_peaks: { dx: 16, dy: -130, mirror: 1 },   // Zeltreihe nördlich des Wegsteins
  ashen_steppe: { dx: 80, dy: -82, mirror: 1 },    // zwischen den Jurten der Nordreihe
  blighted_marsh: { dx: -48, dy: 94, mirror: -1 }, // Südhang des Lehmhügels
  frostspire: { dx: -48, dy: -66, mirror: 1 },     // vor dem Langhaus, links des Wegsteins
  ember_wastes: { dx: 64, dy: 206, mirror: 1 },    // Südseite des Bastionshofs
  sternhafen: { dx: -48, dy: 192, mirror: 1 },     // Marktgasse am Ankerplatz
};
