// Wo der Auktionator in den Städten steht: Abstand zum Wegstein in Spielpixeln (eine Kachel = 16).
// lectern: Seite des Pults (1 = rechts von ihm, -1 = links). Zonen ohne Eintrag haben kein Auktionshaus.
// Gemeinsam mit Gewandmeisterin (transmog/places.js) und Briefkasten (mail/places.js) gewählt: alle drei mitten im Ort
// bei den Häusern, 60–200 px auseinander. Über dem Namen kein Haus und kein anderes Schild, durch Namen und Körper
// läuft kein Questpfad vom Wegstein oder von den Zoneneingängen zu den Ortsbewohnern.
export const PLACES = {
  emberhollow: { dx: -112, dy: 14, lectern: 1 },   // am Marktstand des Dorfplatzes
  ashwood: { dx: -96, dy: -178, lectern: -1 },     // Lagerplatz unter dem westlichen Baumhaus
  cinder_peaks: { dx: 176, dy: -114, lectern: -1 }, // Zeltreihe der Rauhwacht, Nordost
  ashen_steppe: { dx: 176, dy: -82, lectern: 1 },  // zwischen den Jurten der Nordreihe
  blighted_marsh: { dx: 144, dy: 30, lectern: -1 }, // Marktplattform östlich des Hügels
  frostspire: { dx: 48, dy: -66, lectern: -1 },    // vor dem Langhaus, rechts des Wegsteins
  ember_wastes: { dx: 112, dy: 30, lectern: -1 },  // Ostseite des Bastionshofs
  sternhafen: { dx: 256, dy: 224, lectern: -1 },    // Sternmarkt, Ostrand des Platzes
};
