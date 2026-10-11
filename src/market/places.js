// Wo der Auktionator in den Städten steht: Abstand zum Wegstein in Spielpixeln (eine Kachel = 16).
// lectern: Seite des Pults (1 = rechts von ihm, -1 = links). Zonen ohne Eintrag haben kein Auktionshaus.
// Platz so gewählt, dass über dem Namen nichts Hohes steht (Feuer, Banner, Laternen) und davor freier Boden ist.
export const PLACES = {
  emberhollow: { dx: -56, dy: -12, lectern: -1 },
  ashwood: { dx: -64, dy: 6, lectern: 1 },
  cinder_peaks: { dx: 40, dy: 48, lectern: 1 },
  ashen_steppe: { dx: -60, dy: 40, lectern: 1 },
  blighted_marsh: { dx: 96, dy: 32, lectern: -1 },
  frostspire: { dx: 100, dy: 44, lectern: -1 },
  ember_wastes: { dx: 48, dy: 40, lectern: -1 },
};
