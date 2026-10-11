import { Translator } from './translate.js';
import { EN } from './en.js';
import { ES } from './es.js';
import { FR } from './fr.js';

// Sprache des Spiels. Texte im Code bleiben deutsch und dienen als Schlüssel; übersetzt wird beim Anzeigen:
// DOM-Texte und -Attribute (MutationObserver), PixelFont, Dialoge und Zahlen-/Datumsformate.
// Regeln für neue Texte: src/i18n/README.md. Neue Sprache: Wörterbuch xx.js anlegen und hier in LANGS eintragen.
// Die Wahl liegt unter 'emberwrath:lang' im localStorage, geteilt mit der Website (gleiche Domain; die Website
// selbst gibt es auf Deutsch und Englisch, andere Sprachen sehen dort Englisch).

export const LANG_KEY = 'emberwrath:lang';
// label = Name in der eigenen Sprache. dict fehlt bei Deutsch (Quelltext). Fehlt ein Text im Wörterbuch einer
// weiteren Sprache, erscheint er englisch statt deutsch.
export const LANGS = [
  { id: 'de', label: 'Deutsch', locale: 'de-DE' },
  { id: 'en', label: 'English', locale: 'en-US', dict: EN },
  { id: 'es', label: 'Español', locale: 'es-ES', dict: ES },
  { id: 'fr', label: 'Français', locale: 'fr-FR', dict: FR },
];
const byId = new Map(LANGS.map((l) => [l.id, l]));
const translators = new Map();
let translator = null;
let current = detect();
const listeners = new Set();

function translatorFor(id) {
  if (!translators.has(id)) {
    const def = byId.get(id);
    translators.set(id, new Translator(id === 'en' ? EN : { ...EN, ...def.dict }, { quotes: id }));
  }
  return translators.get(id);
}

function detect() {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (byId.has(q)) { localStorage.setItem(LANG_KEY, q); return q; }
    const saved = localStorage.getItem(LANG_KEY);
    if (byId.has(saved)) return saved;
  } catch { /* privater Modus: Browsersprache */ }
  // Erste unterstützte Sprache aus den Browser-Einstellungen, sonst Englisch
  for (const l of navigator.languages ?? [navigator.language ?? 'en']) {
    const id = String(l).toLowerCase().slice(0, 2);
    if (byId.has(id)) return id;
  }
  return 'en';
}

export const lang = () => current;
export const locale = () => byId.get(current).locale;
// Übersetzt einen Anzeigetext in die aktuelle Sprache (Deutsch: unverändert).
export const tr = (text) => (current === 'de' ? text : (translator ??= translatorFor(current)).tr(text));
export const fmtNum = (n, opts) => Number(n).toLocaleString(locale(), opts);
export const fmtDate = (d, opts) => new Date(d).toLocaleDateString(locale(), opts);
export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function setLang(id) {
  if (!byId.has(id)) return;
  try { localStorage.setItem(LANG_KEY, id); } catch { /* egal */ }
  if (id === current) return;
  const prev = current === 'de' ? null : (translator ??= translatorFor(current));
  current = id;
  translator = null;
  document.documentElement.lang = id;
  retranslateAll(prev);
  for (const fn of listeners) { try { fn(id); } catch (e) { console.error(e); } }
}

// Sprachauswahl „Languages / Sprachen“ für Titelbild und Einstellungen: ein Knopf mit der aktuellen Sprache,
// der eine Liste aller Sprachen öffnet (src/i18n/i18n.css). { inline: true }: kompakt für eine Einstellungszeile,
// dort steht die Beschriftung schon daneben. Die Namen bleiben in ihrer eigenen Sprache (translate="no").
const GLOBE = '<svg viewBox="0 0 9 9" width="9" height="9" aria-hidden="true" shape-rendering="crispEdges" fill="currentColor"><path d="M3 0h3v1H3zM1 1h2v1H1zM6 1h2v1H6zM0 2h1v5H0zM8 2h1v5H8zM4 1h1v7H4zM1 4h7v1H1zM2 2h1v1H2zM6 2h1v1H6zM2 6h1v1H2zM6 6h1v1H6zM1 7h2v1H1zM6 7h2v1H6zM3 8h3v1H3z"/></svg>';

export function langSwitch({ inline = false } = {}) {
  const make = (tag, cls, attrs = {}) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };
  const wrap = make('div', inline ? 'ef-lang ef-lang-inline' : 'ef-lang', { translate: 'no' });
  const btn = make('button', 'ef-lang-btn', { type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-label': 'Languages / Sprachen' });
  btn.innerHTML = GLOBE;
  if (!inline) btn.append(make('span', 'ef-lang-title'));
  const cur = make('span', 'ef-lang-cur');
  btn.append(cur, make('span', 'ef-lang-caret', { 'aria-hidden': 'true' }));
  if (!inline) btn.querySelector('.ef-lang-title').textContent = 'Languages / Sprachen';
  const list = make('div', 'ef-lang-list', { role: 'listbox', 'aria-label': 'Languages / Sprachen' });
  list.hidden = true;
  const opts = LANGS.map(({ id, label }) => {
    const o = make('button', 'ef-lang-opt', { type: 'button', role: 'option', lang: id });
    o.textContent = label;
    o.addEventListener('click', (e) => { e.preventDefault(); close(true); setLang(id); });
    list.append(o);
    return [id, o];
  });
  wrap.append(btn, list);

  const onDoc = (e) => { if (!wrap.contains(e.target)) close(); };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(true); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = opts.map(([, o]) => o);
    const i = items.indexOf(document.activeElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
  };
  const onMove = () => close();
  function open() {
    list.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    // Fest am Bildschirm ausrichten (Panels scrollen und schneiden ab); nach oben, wenn unten kein Platz ist
    const r = btn.getBoundingClientRect();
    const h = list.offsetHeight;
    const up = r.bottom + h + 6 > innerHeight && r.top - h - 6 > 0;
    list.style.left = `${Math.max(4, Math.min(r.left, innerWidth - list.offsetWidth - 4))}px`;
    list.style.top = `${up ? r.top - h - 4 : r.bottom + 4}px`;
    list.style.minWidth = `${r.width}px`;
    (opts.find(([id]) => id === current)?.[1] ?? opts[0][1]).focus();
    document.addEventListener('pointerdown', onDoc, true);
    document.addEventListener('keydown', onKey, true);
    addEventListener('resize', onMove);
    addEventListener('scroll', onMove, true);
  }
  function close(focus = false) {
    if (list.hidden) return;
    list.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onDoc, true);
    document.removeEventListener('keydown', onKey, true);
    removeEventListener('resize', onMove);
    removeEventListener('scroll', onMove, true);
    if (focus) btn.focus();
  }
  btn.addEventListener('click', (e) => { e.preventDefault(); if (list.hidden) open(); else close(); });

  const sync = () => {
    cur.textContent = byId.get(current).label;
    for (const [id, o] of opts) o.setAttribute('aria-selected', String(id === current));
  };
  sync();
  // Abmelden, sobald der Knopf nicht mehr im Bild ist (Titelbild wird oft neu aufgebaut)
  const off = onLangChange(() => { if (!wrap.isConnected) { off(); close(); } else sync(); });
  return wrap;
}

// ---- DOM ----
const ATTRS = ['title', 'placeholder', 'aria-label', 'alt', 'data-tip', 'data-label'];
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'CANVAS', 'svg']);
const textSrc = new WeakMap(); // Text-Knoten → { src, out }
const attrSrc = new WeakMap(); // Element → { [attr]: { src, out } }
let observer = null;

function skipped(el) {
  for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
    if (SKIP_TAGS.has(e.tagName) || e.isContentEditable) return true;
    if (e.getAttribute('translate') === 'no' || e.classList.contains('notranslate')) return true;
  }
  return false;
}

function doText(node) {
  const rec = textSrc.get(node);
  const data = node.data;
  if (rec && data === rec.out) return;
  const src = data;
  const out = tr(src);
  textSrc.set(node, { src, out });
  if (out !== data) node.data = out;
}

function doAttrs(el) {
  for (const a of ATTRS) {
    if (!el.hasAttribute(a)) continue;
    const val = el.getAttribute(a);
    let recs = attrSrc.get(el);
    const rec = recs?.[a];
    if (rec && val === rec.out) continue;
    const out = tr(val);
    if (!recs) attrSrc.set(el, (recs = {}));
    recs[a] = { src: val, out };
    if (out !== val) el.setAttribute(a, out);
  }
  if (el.tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit') && el.value) {
    const out = tr(el.value);
    if (out !== el.value) el.value = out;
  }
}

function walk(root) {
  if (root.nodeType === 3) { if (root.parentElement && !skipped(root.parentElement)) doText(root); return; }
  if (root.nodeType !== 1 || skipped(root)) return;
  doAttrs(root);
  const it = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      if (n.nodeType === 1) return SKIP_TAGS.has(n.tagName) || n.getAttribute('translate') === 'no' || n.classList.contains('notranslate') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = it.nextNode(); n; n = it.nextNode()) {
    if (n.nodeType === 3) doText(n); else doAttrs(n);
  }
}

function onMutations(list) {
  for (const m of list) {
    if (m.type === 'characterData') { if (m.target.parentElement && !skipped(m.target.parentElement)) doText(m.target); }
    else if (m.type === 'attributes') { if (!skipped(m.target)) doAttrs(m.target); }
    else for (const n of m.addedNodes) walk(n);
  }
}

function startObserver() {
  if (observer || current === 'de') return;
  observer = new MutationObserver(onMutations);
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

// Nach einem Sprachwechsel: alles Sichtbare aus dem gemerkten Original neu übersetzen. Texte, die der Code schon
// übersetzt hineingeschrieben hat (z. B. Hud über tr()), führt prev (Übersetzer der alten Sprache) aufs Deutsche zurück.
function retranslateAll(prev) {
  const back = (s) => { const m = prev && s.match(/^(\s*)([\s\S]*?)(\s*)$/); const de = m && prev.rev.get(m[2].replace(/\s+/g, ' ')); return de ? m[1] + de + m[3] : s; };
  observer?.disconnect();
  observer = null;
  const it = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = it.nextNode(); n; n = it.nextNode()) {
    if (n.nodeType === 3) {
      const rec = textSrc.get(n);
      const src = back(rec && n.data === rec.out ? rec.src : n.data);
      if (src !== n.data) n.data = src;
      textSrc.delete(n);
    } else {
      const recs = attrSrc.get(n);
      if (recs) for (const [a, rec] of Object.entries(recs)) if (n.getAttribute(a) === rec.out) n.setAttribute(a, rec.src);
      attrSrc.delete(n);
    }
  }
  if (current !== 'de') { walk(document.documentElement); startObserver(); }
}

// Fest eingebaute Browser-Funktionen: Dialoge und Zahlen-/Datumsformate.
// Der Code formatiert oft mit fest 'de-DE'; in anderen Sprachen wird daraus deren Format (en-US: 1,234 statt 1.234).
function patchBuiltins() {
  for (const name of ['alert', 'confirm', 'prompt']) {
    const orig = window[name]?.bind(window);
    if (orig) window[name] = (msg, ...rest) => orig(tr(String(msg ?? '')), ...rest);
  }
  const fix = (loc) => (current !== 'de' && (loc == null || (typeof loc === 'string' && loc.startsWith('de'))) ? locale() : loc);
  for (const [proto, names] of [[Number.prototype, ['toLocaleString']], [Date.prototype, ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString']]]) {
    for (const name of names) {
      const orig = proto[name];
      Object.defineProperty(proto, name, { configurable: true, writable: true, value: function (loc, opts) { return orig.call(this, fix(loc), opts); } });
    }
  }
}

let installed = false;
// Früh in main.js aufrufen, bevor Oberflächen entstehen. Entwicklung: ?i18n=missing sammelt fehlende Texte
// in window.__i18nMissing (Set), siehe tools/i18n-check.mjs.
export function installI18n() {
  if (installed) return;
  installed = true;
  document.documentElement.lang = current;
  patchBuiltins();
  try {
    if (new URLSearchParams(location.search).has('i18n')) {
      window.__i18nMissing = new Set();
      for (const l of LANGS) if (l.dict) translatorFor(l.id).missing = window.__i18nMissing;
    }
  } catch { /* egal */ }
  if (current !== 'de') { walk(document.documentElement); startObserver(); }
}
