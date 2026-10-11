// Wo die Gewandmeisterin in den Städten steht: Abstand zum Wegstein in Spielpixeln (eine Kachel = 16), in Sichtweite
// von Auktionator und Rabenpost (market/places.js, mail/places.js), aber so weit weg, dass sich die Namen nicht
// überdecken. mirror: Seite des Standspiegels (1 = rechts von ihr, -1 = links); sie schaut zur anderen Seite.
// Platz wie beim Auktionator: nichts Hohes über dem Namen, freier Boden davor, nicht auf dem Questpfad.
export const PLACES = {
  emberhollow: { dx: -18, dy: 100, mirror: 1 },
  ashwood: { dx: -150, dy: -6, mirror: -1 },
  cinder_peaks: { dx: 136, dy: 44, mirror: 1 },
  ashen_steppe: { dx: -208, dy: -24, mirror: -1 },
  blighted_marsh: { dx: 240, dy: -12, mirror: 1 },
  frostspire: { dx: -280, dy: 76, mirror: -1 },
  ember_wastes: { dx: -100, dy: 24, mirror: -1 },
};
