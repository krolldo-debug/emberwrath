// Kurze Chatzeilen der Söldner – so, wie Mitspieler in Gruppen schreiben: knapp, locker, selten.
// lineFor(event, style, ctx) -> Text oder null. Jede Person schreibt nach ihrem Stil (Klein-/Großschreibung,
// Umgangssprache) und nur mit einer Wahrscheinlichkeit, die von ihrer Redseligkeit abhängt.

const LINES = {
  hello: { p: 0.8, plain: ['Hallo zusammen', 'Hi', 'Moin', 'Hallo!', 'Servus', 'Abend zusammen'], slang: ['hi', 'moin', 'hey', 'o/', 'yo'] },
  enter: { p: 0.35, plain: ['Los gehts', 'Auf gehts', 'Bin bereit', 'Viel Glück'], slang: ['gogo', 'los', 'gl hf', 'go'] },
  tankLead: { p: 0.5, plain: ['Ich geh vor', 'Ich ziehe, bleibt hinter mir', 'Bleibt hinter mir'], slang: ['ich tank', 'ich pull', 'hinter mir bleiben'] },
  playerTank: { p: 0.5, plain: ['Du führst', 'Wir folgen dir'], slang: ['du pullst', 'go tank'] },
  bossNear: { p: 0.55, plain: ['Boss vorne. Alle bereit?', 'Da hinten ist der Boss', 'Gleich der Boss'], slang: ['boss ready?', 'boss?', 'rdy?'] },
  bossPull: { p: 0.45, plain: ['Los!', 'Auf ihn!', 'Fokus auf den Boss'], slang: ['go', 'los', 'dmg!'] },
  bossHalf: { p: 0.3, plain: ['Halb unten!', 'Gleich haben wir ihn'], slang: ['50%', 'halb', 'weiter so'] },
  bossDown: { p: 0.9, plain: ['Gut gespielt!', 'Geschafft', 'Starke Gruppe', 'Sauber'], slang: ['gg', 'gg wp', 'ez', 'nice', 'gg :)'] },
  thanks: { p: 0.6, plain: ['Danke für die Gruppe', 'Danke euch', 'Bis zum nächsten Mal'], slang: ['ty', 'thx all', 'danke o/', 'cya'] },
  selfDied: { p: 0.55, plain: ['Mist', 'Sorry', 'Das tat weh', 'Hab die Fläche nicht gesehen'], slang: ['sry', 'rip', 'argh', 'upsi', 'lag'] },
  playerDied: { p: 0.45, plain: ['Halt durch, wir machen das', 'Ich hol dich gleich hoch', 'Kein Ding, wir schaffen das'], slang: ['np', 'wir machen das', 'hang on'] },
  revived: { p: 0.35, plain: ['Weiter gehts', 'Wieder da'], slang: ['back', 'ty', 're'] },
  wipe: { p: 0.8, plain: ['Das war nix', 'Nochmal?', 'Puh, der hat es in sich'], slang: ['wipe :(', 'rip', 'nochmal?', 'nochmal rein'] },
  levelUp: { p: 0.8, plain: ['Glückwunsch!', 'Gratuliere zum Aufstieg'], slang: ['gz', 'grats', 'gz!', 'gw'] },
  lowMana: { p: 0.35, plain: ['Wenig Mana', 'Kurz Mana auffüllen'], slang: ['oom', 'mana'] },
  afk: { p: 0.5, plain: ['Weiter?', 'Noch da?', 'Alles gut?'], slang: ['?', 'weiter?', 'afk?'] },
  greetBack: { p: 0.9, plain: ['Hi!', 'Hallo', 'Moin'], slang: ['hey', 'hi', 'o/'] },
  thanksBack: { p: 0.8, plain: ['Gern', 'Kein Problem', 'Immer wieder'], slang: ['np', 'gern', 'kein ding'] },
  ggBack: { p: 0.8, plain: ['Gut gespielt', 'Gleichfalls'], slang: ['gg', 'gg wp', 'wp'] },
  questionBack: { p: 0.6, plain: ['Weiß ich auch nicht genau', 'Schauen wir mal', 'Klar'], slang: ['kp', 'klar', 'jo', 'mal sehen'] },
  yesBack: { p: 0.7, plain: ['Bereit', 'Jep', 'Ja'], slang: ['rdy', 'jo', 'ja', 'y'] },
};

// Antwort auf eine Zeile des Spielers -> Ereignis oder null
export function replyEvent(text) {
  const t = String(text).toLowerCase();
  if (/\b(hi|hallo|hey|moin|servus|huhu|abend|o\/)\b/.test(t)) return 'greetBack';
  if (/\b(danke|thx|ty|dankeschön|merci)\b/.test(t)) return 'thanksBack';
  if (/\b(gg|wp|gut gespielt)\b/.test(t)) return 'ggBack';
  if (/\b(ready|rdy|bereit|bereit\?|los\?|go\?)\b/.test(t)) return 'yesBack';
  if (t.includes('?')) return 'questionBack';
  return null;
}

export function lineFor(event, style = {}, { force = false } = {}) {
  const L = LINES[event];
  if (!L) return null;
  const chatty = style.chatty ?? 0.5;
  if (!force && Math.random() > L.p * (0.35 + chatty * 0.9)) return null;
  const pool = style.lang === 'slang' ? L.slang : L.plain;
  let s = pool[Math.floor(Math.random() * pool.length)];
  if (style.caps === 'lower') s = s.toLowerCase();
  if (style.caps === 'lower' && Math.random() < 0.5) s = s.replace(/[.!]$/, '');
  return s;
}
