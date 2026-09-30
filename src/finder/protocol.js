// Gruppensuche für Dungeons (Client und Server teilen diese Datei; siehe src/finder/README.md).
//
// Transport: eine WebSocket-Verbindung je suchendem Spieler zum Durable Object `DungeonFinder`
// (worker/finder/queue.js), nur solange gesucht wird. Nachrichten sind JSON-Objekte mit Feld t (Typ).
//
// Client -> Server
//   hello   { v, token, char: { id, name, level, classId, raceId } }     erste Nachricht
//   queue   { dungeonId, role }                                            anmelden (role: 'tank' | 'dps')
//   cancel  {}                                                             abmelden
//   accept  { groupId, ok }                                                Bereitschaftsprüfung beantworten
// Server -> Client
//   welcome   { v }
//   queued    { dungeonId, role, since, searching }                        searching = echte Spieler in dieser Suche
//   stats     { searching, total }                                         alle paar Sekunden, solange gesucht wird
//   proposal  { group }                                                    Gruppe gefunden, Bereitschaft bis group.expires
//   ready     { groupId, ticketId }                                        ein Mitspieler ist bereit
//   start     { group }                                                    alle bereit -> Dungeon betreten
//   requeued  { reason }                                                   ein anderer Spieler hat abgelehnt, weiter suchen
//   cancelled { reason }                                                   'declined' | 'timeout' | 'invalid'
//   bye       { reason }                                                   'auth' | 'version' | 'replaced'
//
// Gruppe = { id, dungeonId, seed, expires, members: [Mitglied] }
//   Mitglied = { kind: 'player', ticketId, name, level, classId, raceId, role }
//            | { kind: 'merc', id, name, level, classId, raceId, role, look, style }   (Söldner, siehe mercs.js)
//
// Grundsatz: echte Spieler zuerst. Söldner füllen nur freie Plätze, wenn die Warteschlange keine passenden
// Spieler liefert (matchmaker.js).

export const FINDER_VERSION = 1;
export const FINDER_PATH = '/net/finder';
export const GROUP_SIZE = 3;

// Rollen der 3er-Gruppe: 1 Verteidiger + 2 Schaden. Verteidigen können nur Krieger.
export const ROLES = {
  tank: { name: 'Verteidiger', short: 'Tank', slots: 1, classes: ['warrior'], desc: 'Hält die Gegner auf sich und schützt die Gruppe.' },
  dps: { name: 'Schaden', short: 'Schaden', slots: 2, classes: null, desc: 'Besiegt die Gegner, während der Verteidiger sie bindet.' },
};
export const ROLE_IDS = ['tank', 'dps'];

export const TIMING = {
  botFillMs: [7000, 13000],  // so lange wird nach echten Spielern gesucht, wenn sonst niemand sucht
  humanWaitMs: 45_000,       // sucht jemand Passendes, wird so lange auf eine echte Gruppe gewartet
  partialMs: 20_000,         // danach reichen auch zwei echte Spieler (+ ein Söldner)
  readyMs: 30_000,           // Bereitschaftsprüfung
  statsMs: 4000,             // Server: Suchstand so oft melden
};

export const DUNGEON_ID_RE = /^[a-z][a-z0-9_]{0,47}$/;
const NAME_MAX = 24;
const CTRL = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g;
const int = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const id = (v) => (typeof v === 'string' && /^[a-z0-9_]{1,48}$/.test(v) ? v : null);

export const cleanRole = (r) => (r === 'tank' ? 'tank' : 'dps');
export const cleanDungeon = (d) => (typeof d === 'string' && DUNGEON_ID_RE.test(d) ? d : null);
export const cleanName = (s) => String(s ?? '').replace(CTRL, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) || 'Unbekannt';

// Angaben eines Spielers zur Suche (Server prüft Form, der Client hat die Inhalte).
export function cleanChar(c) {
  const o = c && typeof c === 'object' ? c : {};
  return {
    id: typeof o.id === 'string' ? o.id.slice(0, 64) : '',
    name: cleanName(o.name), level: int(o.level, 1, 99, 1),
    classId: id(o.classId) ?? 'warrior', raceId: id(o.raceId) ?? 'human',
  };
}

// Rolle erlaubt? (Tank nur mit passender Klasse)
export function roleAllowed(role, classId) {
  const r = ROLES[role];
  return !!r && (!r.classes || r.classes.includes(classId));
}
