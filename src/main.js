import { installI18n } from './i18n/index.js';
import { Game } from './Game.js';
import { EV } from './core/events.js';
import { PlayScene } from './scenes/PlayScene.js';
import { installCharacter } from './character/index.js';
import { installAccount } from './account/index.js';
import { installWorld } from './world/index.js';
import { installProgression } from './progression/index.js';
import { installUi } from './ui/index.js';
import { installOnline } from './online/index.js';
import { installNet } from './net/index.js';
import { installFinder } from './finder/index.js';
import { installPvp } from './pvp/index.js';
import { installShop } from './shop/index.js';
import { installMarket } from './market/index.js';
import { installMail } from './mail/index.js';
import { installTransmog } from './transmog/index.js';
import { installRotateGate } from './ui/RotateGate.js';
import { installVersionCheck } from './core/Version.js';

// Einstiegspunkt. Reihenfolge der Bereiche = Reihenfolge ihrer Registrierung.
// Das Game-Objekt ist für Debugging und Tests unter window.emberfall erreichbar (nur lokal und für Admins).
installI18n(); // Sprache zuerst: alle Oberflächen entstehen danach (src/i18n/README.md)
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
  .use(installFinder)      // Dungeonsuche: 3er-Gruppen, Söldner füllen freie Plätze (src/finder, worker/finder)
  .use(installPvp)         // Glutarena: gewertete Kämpfe 1 gegen 1 (src/pvp, worker/pvp)
  .use(installShop)        // Gold-Shop mit Stripe (src/shop, worker/shop.js, docs/SHOP.md)
  .use(installMarket)      // Auktionshaus in jeder Stadt (src/market, Buchungen nur in der Datenbank)
  .use(installMail)        // Postfach in jeder Stadt (src/mail): Auktionshaus, Briefe von Spielern, Bossbeute
  .use(installTransmog);   // Gewandmeisterin in jeder Stadt (src/transmog): Aussehen aus der Sammlung gegen Gold
game.scenes.register('play', (g) => new PlayScene(g));
// Nur lokal (Entwicklung, Tests) und für Admins: in der Konsole frei erreichbar wäre es ein Schummel-Werkzeug.
// (Der Server prüft Spielstände zusätzlich, siehe supabase/migrations/20261003130000_spielstand_pruefung.sql.)
const devHost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname) || window.location.protocol === 'file:';
if (devHost) window.emberfall = game;
else game.bus.on(EV.ONLINE_CHANGED, ({ user }) => {
  if (user && !window.emberfall) game.online?.isAdmin().then((ok) => { if (ok) window.emberfall = game; });
});
installRotateGate(game); // Handy/Tablet: nur Querformat
installVersionCheck(game); // Alter Tab nach einem Release: nicht mehr hochladen, einmal neu laden (src/core/Version.js)
game.start('title');
document.getElementById('boot')?.remove();
