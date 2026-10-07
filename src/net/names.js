import { filterChat, foldText } from './chatFilter.js';

// Namen, die nach Team oder Spielbetreiber aussehen, und anstößige Namen. Läuft auf dem Welt-Server und in der
// Dungeonsuche für jeden Namen, den andere Spieler sehen; auch für die Charaktererstellung gedacht (gleiche Regeln).
//
// 1. Zeichen: wie bei der Charaktererstellung (src/character/index.js) nur lateinische Buchstaben mit Akzenten,
//    Leerzeichen, Bindestrich und Apostroph, 2–16 Zeichen. Damit scheitern Breit-/Fettschrift („Ａｄｍｉｎ“), fremde
//    Schriften („Ꭺdmin“, „Suppoгt“), Sonderzeichen („Admın“) und unsichtbare Namen.
// 2. Reserviert: nach Normalisierung (Akzente weg, „Admín“ → „admin“). RESERVED trifft auch als Wortteil,
//    RESERVED_WORDS nur ganze Wörter.
// 3. Anstößig: der Chatfilter.
const NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ' -]{1,15}$/;
const RESERVED = ['admin', 'administrator', 'support', 'moderator', 'gamemaster', 'emberwrath', 'emberfall', 'offiziell',
  'official', 'entwickler', 'developer', 'staff', 'kundendienst', 'systemnachricht'];
const RESERVED_WORDS = new Set(['gm', 'mod', 'mods', 'dev', 'devs', 'team', 'system', 'server', 'sysop', 'owner', 'root', 'betreiber']);

const words = (s) => foldText(s, 'ae').split(/[^a-z]+/).filter(Boolean);

// -> null (in Ordnung) | 'zeichen' | 'reserviert' | 'anstoessig'
export function nameProblem(name) {
  const raw = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!NAME_RE.test(raw)) return 'zeichen';
  for (const fold of ['ae', 'a']) {
    const parts = foldText(raw, fold).split(/[^a-z]+/).filter(Boolean);
    const joined = parts.join('');
    if (RESERVED.some((r) => joined.includes(r)) || parts.some((w) => RESERVED_WORDS.has(w))) return 'reserviert';
  }
  // „GameMaster“ und einzeln geschriebene Buchstaben („A d m i n“) erkennt oben joined; anstößige Wörter der Chatfilter.
  if (filterChat(raw).filtered > 0 || filterChat(words(raw).join(' ')).filtered > 0) return 'anstoessig';
  return null;
}
