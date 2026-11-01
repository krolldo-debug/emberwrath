import { LEVEL_CAP, xpToNext } from './xp.js';

// Ruhebonus (01.11., wie in anderen Online-Rollenspielen): Wer pausiert, sammelt Erholung. Solange sie reicht, geben
// Gegner doppelte Erfahrung; die EP-Leiste zeigt den Vorrat (ui/Hud.js). Ziel: Grund, am nächsten Tag wiederzukommen.
//
// Der Server führt den Vorrat (src/ledger/rules.js openSession): Beim Spielstart rechnet er die Pause seit dem letzten
// Eintrag an und gibt den Vorrat der neuen Sitzung mit (worker/ledger.js → src/ledger/index.js → Command progress:rested).
// Das Spiel bekommt davon CLIENT_SHARE, damit kleine Unterschiede (Stufe, Rundung) nie mehr Erfahrung ergeben, als das
// Buch erlaubt. Ohne Fortschrittsbuch (abgemeldet) gibt es keinen Ruhebonus. Ohne DOM, damit Tests es prüfen können.
export const RESTED = {
  levels: 1,        // höchstens eine Stufe Erfahrung
  fullHours: 16,    // in 16 Stunden Pause voll (über Nacht weitgehend)
  clientShare: 0.9,
};

export function restedCap(level) {
  return level >= LEVEL_CAP ? 0 : Math.round(xpToNext(level) * RESTED.levels);
}

// Vorrat nach einer Pause von `ms` Millisekunden auf Stufe `level`, ausgehend von `carry`
export function restedPool(carry, ms, level) {
  const cap = restedCap(level);
  const gain = (Math.max(0, ms) / (RESTED.fullHours * 3600000)) * cap;
  return Math.floor(Math.min(cap, Math.max(0, carry || 0) + gain));
}

// Zusatz-Erfahrung für einen Kill mit `xp` Erfahrung
export const restedBonus = (pool, xp) => Math.max(0, Math.min(Math.floor(pool || 0), Math.floor(xp || 0)));

// Anteil, den das Spiel vom Vorrat des Servers bekommt
export const clientPool = (serverPool) => Math.floor(Math.max(0, serverPool || 0) * RESTED.clientShare);
