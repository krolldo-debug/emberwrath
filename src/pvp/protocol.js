// Arena-Protokoll (Client und Arena-Server teilen diese Datei; siehe src/pvp/README.md).
//
// Transport: eine WebSocket-Verbindung je Spieler zum Durable Object `PvpArena` (worker/pvp/arena.js), offen von der
// Suche bis zum Ende des Kampfes. JSON-Objekte mit Feld t (Typ). Zustände und Kampfereignisse wie im Welt-Server
// (src/net/protocol.js: cleanState, cleanFx, cleanLook).
//
// Client -> Server
//   hello   { v, token, char: { id, name, level, classId, raceId }, look }   erste Nachricht
//   queue   {}                     gewertete Suche 1 gegen 1
//   cancel  {}                     Suche beenden
//   ready   { id }                 in der Arena angekommen (Kampf id)
//   s       { s, fx? }             eigener Zustand im Kampf (wird an den Gegner weitergegeben)
//   hit     { d, dot?, heavy? }    eigener Treffer am Gegner: d = Grundschaden ohne Krit (Server würfelt Krit, rechnet
//                                  Rüstung, Kriegsschrei, Unbeugsam, Glutsturm und Leben)
//   leave   {}                     Kampf aufgeben
//   botresult { id, score, hp }    Ergebnis gegen einen Herausforderer (score 1/0.5/0, hp = eigenes Leben in Prozent)
//   top     {}                     Bestenliste der Saison anfragen
// Server -> Client
//   welcome { v, me: Wertung, season: { n, start, end } }
//   queued  { searching }          stats { searching }
//   match   { id, side, foe: Gegner, startIn }      echter Gegner (side 'a' startet im Westen, 'b' im Osten)
//   bot     { id, foe: Herausforderer }               kein echter Gegner gefunden
//   go      { in }                 beide in der Arena: Kampf beginnt in `in` ms
//   u       { s, fx? }             Zustand des Gegners
//   hp      { side, hp, max, dmg, crit, dot, heal, ub }   Leben eines Kämpfers nach Treffer/Heilung (ub: Unbeugsam)
//   end     { id, result, reason, me: Wertung, delta, gold }   result 'win'|'loss'|'draw', reason 'ko'|'time'|'left'|'absent'
//   top     { season, list: [{ name, classId, rating, wins, losses }] }
//   bye     { reason }             'auth' | 'version' | 'replaced' | 'level' | 'char' (Charakter nicht gespeichert)
//
// Wertung = { rating, wins, losses, draws, games, best, tier, season, daily }
// Gegner  = { name, level, classId, raceId, look, rating }
// Herausforderer = Gegner + { bot: true, seed, skill }

export const PVP_VERSION = 1;
export const PVP_PATH = '/net/arena';

const int = (v, lo, hi, d = 0) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
export const MATCH_ID_RE = /^[a-z0-9]{4,24}$/;
export const cleanMatchId = (v) => (typeof v === 'string' && MATCH_ID_RE.test(v) ? v : null);

// Treffer eines Spielers: Grundschaden (ganzzahlig, gedeckelt), Gift, schwer
export function cleanHit(m) {
  const d = Number(m?.d);
  if (!Number.isFinite(d) || d <= 0) return null;
  return { d: Math.min(100_000, d), dot: !!m.dot, heavy: !!m.heavy };
}

export function cleanBotResult(m) {
  const id = cleanMatchId(m?.id);
  if (!id) return null;
  const score = m.score === 1 || m.score === 0.5 ? m.score : 0;
  return { id, score, hp: int(m.hp, 0, 100) };
}
