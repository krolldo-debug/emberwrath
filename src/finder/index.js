import { FinderService } from './FinderService.js';
import { FinderSession } from './FinderSession.js';
import { createFinderPanel } from './FinderPanel.js';

// Dungeon-Gruppensuche (Online-Dungeonmodus): 3er-Gruppen aus echten Spielern, freie Plätze füllen Söldner.
// Beschreibung, Protokoll und Einbau: src/finder/README.md. Server: worker/finder/queue.js.
//
// game.finder (FinderService) für andere Bereiche:
//   state ('idle' | 'queued' | 'proposal' | 'accepted' | 'active'), group, queue({ dungeonId, role }), cancel(), leave()
// Panel 'finder' (Taste O, Knopf in der HUD-Menüreihe), Sitzungssystem 'finder' (Party, HUD, Chat).
export function installFinder(game) {
  const finder = new FinderService(game);
  game.finder = finder;
  game.panels.register('finder', (session) => createFinderPanel(session), { title: 'Dungeonsuche' });
  game.addSessionSystem('finder', (session) => {
    const fs = new FinderSession(session, finder);
    finder.session = fs; // laufende Sitzung (Party, HUD) – für Tests und andere Bereiche lesbar
    return { update: (dt) => fs.update(dt), draw: (ctx) => fs.draw(ctx), dispose: () => { fs.dispose(); if (finder.session === fs) finder.session = null; } };
  }, 105); // nach dem HUD (100), das ui.hud beim Aufbau leert
}
