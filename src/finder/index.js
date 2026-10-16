import { FinderService } from './FinderService.js';
import { FinderSession } from './FinderSession.js';
import { createFinderPanel } from './FinderPanel.js';
import { hireCost, hireable } from './hire.js';
import { EV } from '../core/events.js';

// Dungeon-Gruppensuche (Online-Dungeonmodus): 3er-Gruppen aus echten Spielern, freie Plätze füllen Söldner.
// Beschreibung, Protokoll und Einbau: src/finder/README.md. Server: worker/finder/queue.js.
//
// game.finder (FinderService) für andere Bereiche:
//   state ('idle' | 'offer' | 'queued' | 'proposal' | 'accepted' | 'active'), group, queue({ dungeonId, role }), cancel(), leave()
// Command 'finder:hire' { dungeonId, mercs }: Söldner bezahlen, am Portal oder in der Dungeonsuche (Preis aus hire.js, nur Gold-Abgang;
// das Fortschrittsbuch bucht Ausgaben ohne eigene Regel).
// Panel 'finder' (Taste O, Knopf in der HUD-Menüreihe), Sitzungssystem 'finder' (Party, HUD, Chat).
export function installFinder(game) {
  const finder = new FinderService(game);
  game.finder = finder;
  game.state.defineCommand('finder:hire', (s, { dungeonId, mercs = 2 }, ctx) => {
    const zone = ctx.content.find('zone', dungeonId);
    if (!hireable(zone)) return { ok: false, reason: 'zone' };
    const cost = hireCost(zone, mercs), w = s.get('wallet');
    if (!cost) return { ok: true, cost: 0 };
    if (w.gold < cost) return { ok: false, reason: 'gold', cost };
    w.gold -= cost;
    ctx.bus.emit(EV.GOLD_CHANGED, { delta: -cost, total: w.gold, source: `hire:${zone.id}` });
    return { ok: true, cost };
  });
  game.panels.register('finder', (session, params) => createFinderPanel(session, params), { title: 'Dungeonsuche' });
  game.addSessionSystem('finder', (session) => {
    const fs = new FinderSession(session, finder);
    finder.session = fs; // laufende Sitzung (Party, HUD) – für Tests und andere Bereiche lesbar
    return { update: (dt) => fs.update(dt), draw: (ctx) => fs.draw(ctx), dispose: () => { fs.dispose(); if (finder.session === fs) finder.session = null; } };
  }, 105); // nach dem HUD (100), das ui.hud beim Aufbau leert
}
