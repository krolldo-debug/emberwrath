// Wo der Auktionator in den Städten steht: Abstand zum Wegstein in Spielpixeln (eine Kachel = 16).
// lectern: Seite des Pults (1 = rechts von ihm, -1 = links). Zonen ohne Eintrag haben kein Auktionshaus.
// room: Der Auktionator steht im Auktionshaus (Raum-ID aus world/townHouses.js) auf Kachel at = [dx, dy] im Raum;
// dx/dy gelten dann nicht. Ohne room steht er draußen neben dem Wegstein.
// Gemeinsam mit Gewandmeisterin (transmog/places.js) und Briefkasten (mail/places.js) gewählt: alle drei mitten im Ort
// bei den Häusern, 60–200 px auseinander. Über dem Namen kein Haus und kein anderes Schild, durch Namen und Körper
// läuft kein Questpfad vom Wegstein oder von den Zoneneingängen zu den Ortsbewohnern.
export const PLACES = {
  emberhollow: { room: 'glut_halle', at: [9, 5], lectern: 1 },          // Auktionshaus (Dorfhalle)
  ashwood: { room: 'wald_baumhaus1', at: [9, 5], lectern: 1 },     // Auktionshaus im westlichen Baumhaus
  cinder_peaks: { dx: 176, dy: -114, lectern: -1 }, // Zeltreihe der Rauhwacht, Nordost
  ashen_steppe: { room: 'steppe_jurte2', at: [9, 5], lectern: 1 },  // Auktionsjurte der Nordreihe
  blighted_marsh: { room: 'marsch_halle', at: [9, 5], lectern: 1 },  // Pfahlhalle
  frostspire: { room: 'frost_langhaus1', at: [9, 5], lectern: 1 }, // westliches Langhaus
  ember_wastes: { dx: 112, dy: 30, lectern: -1 },  // Ostseite des Bastionshofs
  sternhafen: { dx: 16, dy: 64, lectern: -1 },      // Ostseite des Ankerplatzes
};
