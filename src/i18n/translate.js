// Übersetzt angezeigte Texte. Schlüssel ist der deutsche Originaltext, so wie er im Code steht.
// Einträge mit {0}, {1} … sind Muster (aus Template-Literalen): die eingesetzten Werte werden
// ihrerseits übersetzt, so dass z. B. `${item} erhalten` mit einem Gegenstandsnamen klappt.
// Wird von src/i18n/index.js (Spiel, zur Laufzeit) und site/build-site.mjs (Website, beim Build) genutzt.

const LETTER = /[A-Za-zÄÖÜäöüß]/;
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const headOf = (s) => (s.trimStart().match(/^[^\s{]+/)?.[0] ?? '').toLowerCase();
// Trenner, an denen zusammengesetzte Anzeigen (z. B. „Stufe 12 · Krieger“) zerlegt werden dürfen.
// Letzter Versuch: an Zahlen zerlegen („Stufe 12 Krieger“).
const NUM = /(\s*[+\-]?\d[\d.,]*\s*%?\s*)/;
const SPLIT = /(\s+[·–—|/]\s+|\s*\n\s*|:\s+|\s+\(|\)\s*|,\s+)/;

// Deutsche Anführungszeichen „…“ werden im Englischen zu “…”, ‚…‘ zu ‘…’.
const englishQuotes = (s) => s.replace(/„([^“”]*)[“”]/g, '“$1”').replace(/‚([^‘’]*)[‘’]/g, '‘$1’');

export class Translator {
  constructor(dict = {}) {
    this.exact = new Map();
    this.upper = new Map(); // für Code, der vor dem Zeichnen toUpperCase() aufruft (PixelFont)
    this.byHead = new Map(); // erstes Wort des festen Anfangs → Muster
    this.cache = new Map();
    this.outputs = new Set(); // englische Werte: schon übersetzt, nicht noch einmal anfassen
    this.same = new Set(); // bewusst gleich (Namen wie „Meteor“) oder kein Anzeigetext: nicht als fehlend melden
    this.missing = null; // Set, wenn fehlende Texte gesammelt werden sollen (Entwicklung)
    this.add(dict);
  }

  add(dict) {
    for (let [de, en] of Object.entries(dict)) {
      if (typeof en !== 'string' || !en || en === de) { this.same.add(norm(de)); continue; }
      const k = norm(de);
      en = en.trim(); // Leerzeichen am Rand kommen aus dem Originaltext (tr), nicht aus dem Wörterbuch
      if (/\{\d+\}/.test(k)) this.#addPattern(k, en); else { this.exact.set(k, en); this.upper.set(k.toUpperCase(), en.toUpperCase()); }
      this.outputs.add(norm(en));
      this.outputs.add(norm(en).toUpperCase());
    }
    for (const list of this.byHead.values()) list.sort((a, b) => b.lit - a.lit);
    this.cache.clear();
  }

  #addPattern(k, en) {
    const parts = k.split(/(\{\d+\})/);
    const lit = parts.filter((_, i) => i % 2 === 0).join('');
    // Nur Muster mit genug festem Text, sonst passt „{0} {1}“ auf alles.
    if ((lit.match(/[A-Za-zÄÖÜäöüß]/g) ?? []).length < 2) return;
    let re = '^';
    const order = [];
    parts.forEach((p, i) => {
      if (i % 2) { order.push(Number(p.slice(1, -1))); re += '(.+?)'; } else re += esc(p);
    });
    const pat = { re: new RegExp(`${re}$`, 's'), order, en, lit: lit.length };
    const head = headOf(parts[0]);
    if (!this.byHead.has(head)) this.byHead.set(head, []);
    this.byHead.get(head).push(pat);
  }

  // true, wenn es für den Text einen Eintrag gibt (auch einen absichtlich gleichen)
  known(text) { const k = norm(text); return this.exact.has(k) || this.same.has(k) || this.outputs.has(k) || this.#pattern(k, 0) != null; }

  // Liefert die Übersetzung oder den Originaltext (nie undefined).
  tr(text) {
    if (typeof text !== 'string' || !LETTER.test(text)) return text;
    const hit = this.cache.get(text);
    if (hit !== undefined) return hit;
    const m = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const core = norm(m[2]);
    let out = this.#core(core, 0);
    if (out != null) out = englishQuotes(out);
    if (out == null) {
      out = text;
      if (this.missing && core.length > 1 && !this.outputs.has(core) && !this.same.has(core)) this.missing.add(core);
    } else out = m[1] + out + m[3];
    if (this.cache.size > 20000) this.cache.clear();
    this.cache.set(text, out);
    return out;
  }

  // null = keine Übersetzung gefunden
  #core(s, depth) {
    if (!LETTER.test(s)) return s;
    const ex = this.exact.get(s);
    if (ex !== undefined) return ex;
    if (s === s.toUpperCase()) { const up = this.upper.get(s); if (up !== undefined) return up; }
    if (this.outputs.has(s) || this.same.has(s)) return s;
    const p = this.#pattern(s, depth);
    if (p != null) return p;
    if (depth > 3) return null;
    // Vorn/hinten Zahlen und Zeichen abtrennen: „+12 Stärke“, „Stufe 12“, „(3)“ …
    const m = s.match(/^([^A-Za-zÄÖÜäöüß]*)(.*?)([^A-Za-zÄÖÜäöüß.!?]*)$/s);
    if (m && (m[1] || m[3]) && m[2]) {
      const inner = this.#core(m[2], depth + 1);
      if (inner != null) return m[1] + inner + m[3];
    }
    for (const splitter of [SPLIT, NUM]) {
      const seg = s.split(splitter);
      if (seg.length < 2) continue;
      let any = false;
      const out = seg.map((p, i) => {
        if (i % 2 || !LETTER.test(p)) return p;
        const t = this.#core(p, depth + 1);
        if (t != null) { any = true; return t; }
        return p;
      });
      if (any) return out.join('');
    }
    return null;
  }

  #pattern(s, depth) {
    if (depth > 4) return null;
    const lists = [this.byHead.get(headOf(s)), this.byHead.get('')];
    for (const list of lists) {
      if (!list) continue;
      for (const p of list) {
        const m = p.re.exec(s);
        if (!m) continue;
        const vals = [];
        p.order.forEach((idx, i) => { vals[idx] = m[i + 1]; });
        return p.en.replace(/\{(\d+)\}/g, (_, i) => {
          const v = vals[Number(i)] ?? '';
          const w = v.match(/^(\s*)([\s\S]*?)(\s*)$/);
          return w[1] + (this.#core(w[2], depth + 1) ?? w[2]) + w[3];
        });
      }
    }
    return null;
  }
}
