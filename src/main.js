import { Game } from './Game.js';
import { PlayScene } from './scenes/PlayScene.js';
import { installCharacter } from './character/index.js';
import { installAccount } from './account/index.js';
import { installWorld } from './world/index.js';
import { installProgression } from './progression/index.js';
import { installUi } from './ui/index.js';
import { installOnline } from './online/index.js';
import { installNet } from './net/index.js';
import { installFinder } from './finder/index.js';

// Einstiegspunkt. Reihenfolge der Bereiche = Reihenfolge ihrer Registrierung.
// Das Game-Objekt ist für Debugging und Tests unter window.emberfall erreichbar.
const canvas = document.getElementById('game');
const game = new Game(canvas);
game
  .use(installCharacter)   // Thread A
  .use(installAccount)     // Thread A
  .use(installWorld)       // Thread B
  .use(installProgression) // Thread C
  .use(installUi)          // Thread D
  .use(installOnline)      // Online-Konten (src/online, docs/ONLINE.md)
  .use(installNet)         // Mehrspieler: Welten, andere Spieler, Chat (src/net, worker/)
  .use(installFinder);     // Dungeonsuche: 3er-Gruppen, Söldner füllen freie Plätze (src/finder, worker/finder)
game.scenes.register('play', (g) => new PlayScene(g));
window.emberfall = game;
game.start('title');
document.getElementById('boot')?.remove();
