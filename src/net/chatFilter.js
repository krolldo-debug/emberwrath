// Einfacher Wortfilter für den Gebietschat. Läuft auf dem Welt-Server (worker/shard.js) für jede Nachricht,
// lässt sich also im Browser nicht umgehen. Ziel: grobe Beleidigungen, Hassbegriffe und Werbelinks ausblenden,
// nicht jede Formulierung erkennen; dafür gibt es „Melden“.
//
// Erkennung je Wort nach Normalisierung (Kleinschreibung, Umlaute, 0→o 1→i 3→e 4→a 5→s 7→t @→a $→s,
// doppelte Buchstaben zusammengezogen). STEMS trifft auch als Wortteil („Hurensöhne“), WORDS nur das ganze Wort,
// PHRASES über Wortgrenzen hinweg. Getroffene Wörter werden durch Sternchen gleicher Länge ersetzt.

const STEMS = [
  'hurenso', 'hurenkind', 'wichser', 'fotze', 'schlampe', 'missgeburt', 'mißgeburt', 'spast',
  'schwuchtel', 'kanake', 'nigger', 'neger', 'zigeuner', 'kinderficker', 'vergewaltig',
  'motherfuck', 'faggot', 'retard', 'cunt', 'whore', 'fick', 'fuck', 'arschloch', 'arschgeige', 'drecksau',
  'hitler', 'judensau', 'untermensch',
].map((s) => norm(s));
const WORDS = new Set(['kys', 'nazi', 'fag', 'hure', 'huren', 'bitch', 'slut', 'nutte', 'wixer', 'wixxer']
  .map((s) => norm(s)));
const PHRASES = ['sieg heil', 'heil hitler', 'kill yourself', 'bring dich um', 'häng dich auf', 'hang dich auf', 'töte dich']
  .map((s) => norm(s));

const LINK_RE = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]{2,}\.(?:com|de|net|org|ru|gg|io|xyz|ly|me|tk|to|cc|tv|app|shop)\b(?:\/\S*)?/gi;
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i', '|': 'i' };

function norm(s) {
  return String(s).toLowerCase()
    .replace(/[0-9@$!|]/g, (c) => LEET[c] ?? c)
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z ]/g, '')
    .replace(/(.)\1+/g, '$1');
}

const stars = (w) => '*'.repeat(Math.max(3, [...w].length));

// -> { text, filtered } ; filtered = Anzahl ersetzter Stellen
export function filterChat(text) {
  let filtered = 0;
  let out = String(text).replace(LINK_RE, () => { filtered++; return '[Link entfernt]'; });
  // Wörter einzeln prüfen (Satzzeichen bleiben stehen)
  out = out.replace(/[\p{L}\p{N}@$!|_*.-]+/gu, (w) => {
    if (w === '[Link' || /^\*+$/.test(w)) return w;
    const n = norm(w);
    if (!n) return w;
    if (WORDS.has(n) || STEMS.some((s) => n.includes(s))) { filtered++; return stars(w); }
    return w;
  });
  // Wendungen über mehrere Wörter und gesperrt geschriebene Wörter („h i t l e r“)
  const flat = ` ${norm(out.replace(/\s+/g, ' '))} `;
  const spaced = [...out.matchAll(/(?:^|\s)((?:\S\s+){3,}\S)(?=\s|$)/g)].map((m) => norm(m[1]).replace(/ /g, ''));
  if (PHRASES.some((p) => flat.includes(` ${p} `)) || spaced.some((w) => WORDS.has(w) || STEMS.some((st) => w.includes(st)))) {
    filtered++;
    out = '[Nachricht vom Filter entfernt]';
  }
  return { text: out, filtered };
}
