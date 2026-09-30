import { TitleScene } from './TitleScene.js';
import { AccountScene } from './AccountScene.js';
import { CharacterListScene } from './CharacterListScene.js';
import { CharacterCreateScene } from './CharacterCreateScene.js';

// Thread A – Titel, Charakterliste, Charaktererstellung.
// Szenen:
//   'title'            Spielen (→ Charakterauswahl) · Konto; ohne Anmeldung: Anmelden · Konto erstellen
//   'account'          Weiterleitung (früher Demo-Account), führt zur Charakterauswahl bzw. Anmeldung
//   'characters'       Charaktere des eingeloggten Accounts (spielen, löschen, neu)
//   'characterCreate'  Volk, Klasse, Aussehen, Name -> game.newGame(...)
// Zurück ins Hauptmenü aus dem Spiel: game.scenes.go('title') (PlayScene speichert beim Verlassen).
export function installAccount(game) {
  game.scenes.register('title', (g) => new TitleScene(g));
  game.scenes.register('account', (g) => new AccountScene(g));
  game.scenes.register('characters', (g) => new CharacterListScene(g));
  game.scenes.register('characterCreate', (g) => new CharacterCreateScene(g));
}
