// Wo der Auktionator in den Städten steht: Abstand zum Wegstein in Spielpixeln (eine Kachel = 16).
// lectern: Seite des Pults (1 = rechts von ihm, -1 = links). Zonen ohne Eintrag haben kein Auktionshaus.
export const PLACES = {
  emberhollow: { dx: 56, dy: -20, lectern: -1 },
  ashwood: { dx: -64, dy: 6, lectern: 1 },
  cinder_peaks: { dx: 52, dy: -18, lectern: -1 },
  ashen_steppe: { dx: -60, dy: 40, lectern: 1 },
  blighted_marsh: { dx: -44, dy: 44, lectern: 1 },
  frostspire: { dx: -44, dy: 12, lectern: 1 },
  ember_wastes: { dx: 52, dy: -18, lectern: -1 },
};
