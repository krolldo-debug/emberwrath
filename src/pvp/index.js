import { EV } from '../core/events.js';
import { PvpService } from './PvpService.js';
import { ArenaSession } from './ArenaSession.js';
import { buildArena, ARENA_ZONE_DEF } from './arenaLevel.js';
import { ARENA_ZONE, PVP_MIN_LEVEL, START_RATING, seasonAt } from './rules.js';
import { checkAchievements } from '../progression/endgame.js';

// Glutarena: gewertete Kämpfe 1 gegen 1 (PvP). Beschreibung, Regeln und Protokoll: src/pvp/README.md.
// Server: worker/pvp/ (Durable Object PvpArena), Pfad /net/arena.
//
// game.pvp (PvpService) für andere Bereiche:
//   state ('idle' | 'queued' | 'match' | 'result'), busy, match, queue(), cancel(), leave(), rating(), top()
// Zone 'pvp_arena' (Karte als content 'level'), Slice 'pvp', Command 'pvp:record', Sitzungssystem 'pvp',
// Reiter „Glutarena“ im Fenster der Dungeonsuche (Taste O, ab Stufe PVP_MIN_LEVEL).
export function installPvp(game) {
  const { content, state } = game;
  content.define('zone', ARENA_ZONE, ARENA_ZONE_DEF);
  content.defineLazy('level', ARENA_ZONE, buildArena);

  // Stand in der Arena (für Erfolge, Titel und die Anzeige vor der ersten Verbindung). Wertung und Ergebnis
  // bestimmt der Arena-Server; hier liegt nur, was er zuletzt gemeldet hat, und die Siege über alle Saisons.
  const empty = () => ({ season: seasonAt().n, rating: START_RATING, best: START_RATING, bestTier: 0, wins: 0, losses: 0, draws: 0, seasonWins: 0, seasonLosses: 0 });
  const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
  state.defineSlice('pvp', {
    create: empty,
    deserialize: (raw) => {
      const e = empty();
      for (const k of Object.keys(e)) e[k] = Math.max(0, Math.round(num(raw?.[k], e[k])));
      e.bestTier = Math.min(5, e.bestTier);
      return e;
    },
  });
  // { result: 'win'|'loss'|'draw'|null, rating, best, season, tier (beste Liga der Saison 0..5), wins, losses } vom Server
  state.defineCommand('pvp:record', (s, p, ctx) => {
    const v = s.slices.pvp;
    if (p.result === 'win') v.wins++;
    else if (p.result === 'loss') v.losses++;
    else if (p.result === 'draw') v.draws++;
    if (Number.isFinite(p.season)) v.season = p.season;
    if (Number.isFinite(p.rating)) v.rating = Math.round(p.rating);
    if (Number.isFinite(p.best)) v.best = Math.round(p.best);
    if (Number.isFinite(p.tier)) v.bestTier = Math.max(v.bestTier, Math.min(5, Math.max(0, p.tier | 0)));
    if (Number.isFinite(p.wins)) v.seasonWins = p.wins;
    if (Number.isFinite(p.losses)) v.seasonLosses = p.losses;
    checkAchievements(s, ctx);
    return { ok: true };
  }, { authoritative: true });

  const pvp = new PvpService(game);
  game.pvp = pvp;

  // Heiltrank-Knopf (ui/Hud.js ruft progression.usePotion): in der Arena ohne Wirkung; der Knopf zeigt dort 0
  // (dann erscheint auch der Hinweis „Heiltrank trinken“ nicht)
  const prog = game.progression;
  if (prog?.potionCount) {
    const count = prog.potionCount;
    prog.potionCount = () => (pvp.inArena ? 0 : count());
  }
  if (prog?.usePotion) {
    const use = prog.usePotion;
    prog.usePotion = () => {
      if (!pvp.inArena) return use();
      game.bus.emit(EV.UI_TOAST, { text: 'In der Arena wirken keine Tränke.', kind: 'warn' });
      return false;
    };
  }

  game.addSessionSystem('pvp', (session) => {
    const arena = new ArenaSession(session, pvp);
    pvp.session = arena;
    return { update: (dt) => arena.update(dt), draw: (ctx) => arena.draw(ctx), dispose: () => { arena.dispose(); if (pvp.session === arena) pvp.session = null; } };
  }, 5); // vor dem Fortschritt (10): Heiltränke in der Arena abfangen

  // Stufe 10: Hinweis, dass die Arena offen ist (einmal)
  game.bus.on(EV.LEVEL_UP, (e) => {
    if (e?.level === PVP_MIN_LEVEL) game.bus.emit(EV.UI_TOAST, { text: 'Die Glutarena ist offen: Dungeonsuche (O).', kind: 'quest' });
  });
}
