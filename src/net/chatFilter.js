// Einfacher Wortfilter für den Gebietschat. Läuft auf dem Welt-Server (worker/shard.js) für jede Nachricht,
// lässt sich also im Browser nicht umgehen. Ziel: grobe Beleidigungen, Hassbegriffe und Werbelinks ausblenden,
// nicht jede Formulierung erkennen; dafür gibt es „Melden“.
//
// Erkennung je Wort nach Normalisierung (foldText): Breit-, Fett- und hochgestellte Schrift (NFKC), Akzente weg,
// kyrillische/griechische Doppelgänger, 0→o 1→i 3→e 4→a 5→s 7→t @→a $→s, doppelte Buchstaben zusammengezogen.
// Umlaute werden einmal als „ae“ und einmal als „a“ geprüft. STEMS trifft auch als Wortteil („Hurensöhne“), WORDS nur
// das ganze Wort, PHRASES über Wortgrenzen hinweg. Ein Wort mit höchstens zwei Buchstaben wird zusätzlich mit seinem
// Nachbarn zusammen geprüft („fü ck“). Getroffene Wörter werden durch Sternchen ersetzt.
//
// Unsichtbare Zeichen entfernt schon cleanText (protocol.js), bevor der Filter läuft.

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i', '|': 'i' };
// häufige Doppelgänger aus anderen Schriften auf lateinische Buchstaben (а е о р с у х і ѕ ј ԁ ɡ ı / ο α ε ι κ ν ρ τ υ χ)
const LOOKALIKE = {
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', і: 'i', ѕ: 's', ј: 'j', ԁ: 'd', ɡ: 'g', ı: 'i', г: 'r', к: 'k', м: 'm', н: 'h', т: 't', в: 'b',
  ο: 'o', α: 'a', ε: 'e', ι: 'i', κ: 'k', ν: 'v', ρ: 'p', τ: 't', υ: 'u', χ: 'x',
};
const LOOKALIKE_RE = new RegExp(`[${Object.keys(LOOKALIKE).join('')}]`, 'g');

// Text auf einfache Kleinbuchstaben a–z (und Leerzeichen) zurückführen. umlaut: 'ae' (ä→ae) oder 'a' (ä→a).
export function foldText(s, umlaut = 'ae') {
  let t = String(s).normalize('NFKC').toLowerCase().replace(LOOKALIKE_RE, (c) => LOOKALIKE[c]);
  if (umlaut === 'ae') t = t.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue');
  return t.replace(/ß/g, 'ss').normalize('NFKD').replace(/\p{M}/gu, '')
    .replace(/[0-9@$!|]/g, (c) => LEET[c] ?? c);
}
const norm = (s, umlaut) => foldText(s, umlaut).replace(/[^a-z ]/g, '').replace(/(.)\1+/g, '$1');
const both = (s) => [...new Set([norm(s, 'ae'), norm(s, 'a')])];

const STEMS = [
  'hurenso', 'hurenkind', 'wichser', 'fotze', 'schlampe', 'missgeburt', 'spast',
  'schwuchtel', 'kanake', 'nigger', 'neger', 'zigeuner', 'kinderficker', 'vergewaltig',
  'motherfuck', 'faggot', 'retard', 'cunt', 'whore', 'fick', 'fuck', 'arschloch', 'arschgeige', 'drecksau',
  'hitler', 'judensau', 'untermensch',
].map((s) => norm(s, 'ae'));
const WORDS = new Set(['kys', 'nazi', 'fag', 'hure', 'huren', 'bitch', 'slut', 'nutte', 'wixer', 'wixxer']
  .map((s) => norm(s, 'ae')));
const PHRASES = ['sieg heil', 'heil hitler', 'kill yourself', 'bring dich um', 'häng dich auf', 'hang dich auf', 'töte dich']
  .flatMap((s) => both(s));

const TLD = 'com|de|net|org|ru|gg|io|xyz|ly|me|tk|to|cc|tv|app|shop|eu|at|ch|info|biz|link|site|online|store|pro|top';
// Links, auch verschleiert: „evil . com“, „discord(.)gg“, „gold [punkt] de“, „www . x“
const LINK_RE = new RegExp(String.raw`\b(?:https?:\/\/|www\s*[.(\[{])\S+|\b[a-z0-9-]{3,}\s*(?:[(\[{]\s*)?(?:\.|dot|punkt)(?:\s*[)\]}])?\s*(?:${TLD})\b(?:\/\S*)?`, 'gi');

const hit = (w) => both(w).some((n) => n && (WORDS.has(n) || STEMS.some((s) => n.includes(s))));
const stars = (w) => '*'.repeat(Math.max(3, [...w].length));

// -> { text, filtered } ; filtered = Anzahl ersetzter Stellen
export function filterChat(text) {
  let filtered = 0;
  let out = String(text).normalize('NFKC').replace(LINK_RE, () => { filtered++; return '[Link entfernt]'; });
  // Wörter einzeln prüfen (Satzzeichen bleiben stehen)
  const WORD = /[\p{L}\p{N}@$!|_*.-]+/gu;
  out = out.replace(WORD, (w) => {
    if (w === '[Link' || /^\*+$/.test(w)) return w;
    if (hit(w)) { filtered++; return stars(w); }
    return w;
  });
  // Kurzes Wortstück mit dem Nachbarn („fü ck“, „ar schloch“)
  const tokens = [...out.matchAll(WORD)];
  for (let i = 0; i + 1 < tokens.length; i++) {
    const a = tokens[i][0], b = tokens[i + 1][0];
    if (/^\*+$/.test(a) || /^\*+$/.test(b)) continue;
    if (Math.min(norm(a).length, norm(b).length) <= 2 && hit(a + b)) { filtered++; out = '[Nachricht vom Filter entfernt]'; break; }
  }
  // Wendungen über mehrere Wörter und gesperrt geschriebene Wörter („h i t l e r“)
  const flat = both(out.replace(/\s+/g, ' ')).map((n) => ` ${n} `);
  const spaced = [...out.matchAll(/(?:^|\s)((?:\S\s+){3,}\S)(?=\s|$)/g)].map((m) => m[1].replace(/\s+/g, ''));
  if (PHRASES.some((p) => flat.some((f) => f.includes(` ${p} `))) || spaced.some(hit)) {
    filtered++;
    out = '[Nachricht vom Filter entfernt]';
  }
  return { text: out, filtered };
}
