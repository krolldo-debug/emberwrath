import { filterChat } from './chatFilter.js';

// Namen, die nach Team oder Spielbetreiber aussehen, und anstößige Namen. Läuft auf dem Welt-Server für jeden Namen,
// den andere Spieler sehen (worker/shard.js); auch für die Charaktererstellung gedacht (gleiche Regeln, sofortige Rückmeldung).
//
// Normalisiert wie der Chatfilter (Kleinschreibung, Umlaute, 0→o 1→i …, Sonderzeichen weg), damit „Adm1n“, „A_d_m_i_n“
// oder „Suppοrt“ mit Zeichen-Tricks nicht durchgehen. RESERVED trifft auch als Wortteil, RESERVED_WORDS nur ganze Wörter.
const RESERVED = ['admin', 'administrator', 'support', 'moderator', 'gamemaster', 'emberwrath', 'emberfall', 'offiziell',
  'official', 'entwickler', 'developer', 'staff', 'kundendienst', 'systemnachricht'];
const RESERVED_WORDS = new Set(['gm', 'mod', 'mods', 'dev', 'devs', 'team', 'system', 'server', 'sysop', 'owner', 'root', 'betreiber']);
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i', '|': 'i' };
// häufige Doppelgänger aus anderen Schriften (kyrillisch/griechisch) auf lateinische Buchstaben
const LOOKALIKE = { а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', і: 'i', ѕ: 's', ο: 'o', α: 'a', ε: 'e', ι: 'i', κ: 'k', ν: 'v', ρ: 'p', τ: 't' };

const words = (s) => String(s).toLowerCase()
  .replace(/[а-яёіѕα-ω]/g, (c) => LOOKALIKE[c] ?? c)
  .replace(/[0-9@$!|]/g, (c) => LEET[c] ?? c)
  .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .split(/[^a-z]+/).filter(Boolean);

// -> null (in Ordnung) | 'reserviert' | 'anstoessig'
export function nameProblem(name) {
  const parts = words(name);
  const joined = parts.join('');
  if (RESERVED.some((r) => joined.includes(r)) || parts.some((w) => RESERVED_WORDS.has(w))) return 'reserviert';
  // „GameMaster“ und einzeln geschriebene Buchstaben („A d m i n“) erkennt oben joined; anstößige Wörter der Chatfilter.
  if (filterChat(name).filtered > 0 || filterChat(parts.join(' ')).filtered > 0) return 'anstoessig';
  return null;
}
