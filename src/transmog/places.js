// Wo die Gewandmeisterin in den Städten steht: Abstand zum Wegstein in Spielpixeln (eine Kachel = 16).
// mirror: Seite des Standspiegels (1 = rechts von ihr, -1 = links); sie schaut zur anderen Seite.
// Gemeinsam mit Auktionator und Briefkasten gewählt (siehe market/places.js): im Ort, in Sichtweite, aber nicht
// auf einem Fleck; kein Schild über Häusern, anderen Schildern oder Questpfaden.
// room: Sie steht in der Schneiderei (Raum-ID aus world/townHouses.js) auf Kachel at = [dx, dy] im Raum.
export const PLACES = {
  emberhollow: { room: 'glut_haus5', at: [6, 5], mirror: 1 },    // Schneiderei an der südlichen Dorfgasse
  ashwood: { dx: 96, dy: -114, mirror: -1 },       // beim Baumhaus des Händlers
  cinder_peaks: { dx: 16, dy: -130, mirror: 1 },   // Zeltreihe nördlich des Wegsteins
  ashen_steppe: { room: 'steppe_jurte1', at: [6, 5], mirror: 1 }, // Schneiderjurte im Westen
  blighted_marsh: { dx: -48, dy: 94, mirror: -1 }, // Südhang des Lehmhügels
  frostspire: { room: 'frost_sode1', at: [6, 5], mirror: 1 },     // Schneiderei in der westlichen Sodenhütte
  ember_wastes: { dx: 64, dy: 206, mirror: 1 },    // Südseite des Bastionshofs
  sternhafen: { dx: -336, dy: 96, mirror: 1 },     // Westseite des Ankerplatzes
};
