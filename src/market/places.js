// Wo der Auktionator in den Städten steht: Abstand zum Wegstein in Spielpixeln (eine Kachel = 16).
// lectern: Seite des Pults (1 = rechts von ihm, -1 = links). Zonen ohne Eintrag haben kein Auktionshaus.
// Platz so gewählt, dass über dem Namen nichts Hohes steht (Feuer, Banner, Laternen, Stände), davor freier Boden ist
// und keine Hauptwege vom Wegstein (Questpfad) durch ihn laufen.
export const PLACES = {
  emberhollow: { dx: -144, dy: 102, lectern: 1 },
  ashwood: { dx: -64, dy: 6, lectern: 1 },
  cinder_peaks: { dx: 40, dy: 48, lectern: 1 },
  ashen_steppe: { dx: -60, dy: 60, lectern: 1 },
  blighted_marsh: { dx: 160, dy: 8, lectern: 1 },
  frostspire: { dx: -176, dy: 72, lectern: 1 },
  ember_wastes: { dx: 104, dy: 16, lectern: 1 },
};
