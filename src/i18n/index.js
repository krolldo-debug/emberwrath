import { Translator } from './translate.js';
import { EN } from './en.js';

// Sprache des Spiels (Deutsch/Englisch). Texte im Code bleiben deutsch und dienen als Schlüssel;
// übersetzt wird beim Anzeigen: DOM-Texte und -Attribute (MutationObserver), PixelFont, Dialoge
// und Zahlen-/Datumsformate. Regeln für neue Texte: src/i18n/README.md.
// Die Wahl liegt unter 'emberwrath:lang' im localStorage, geteilt mit der Website (gleiche Domain).

export const LANG_KEY = 'emberwrath:lang';
export const LANGS = [{ id: 'de', label: 'Deutsch' }, { id: 'en', label: 'English' }];

const translator = new Translator(EN);
let current = detect();
const listeners = new Set();

function detect() {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'de' || q === 'en') { localStorage.setItem(LANG_KEY, q); return q; }
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'de' || saved === 'en') return saved;
  } catch { /* privater Modus: Browsersprache */ }
  const nav = (navigator.languages?.[0] ?? navigator.language ?? 'de').toLowerCase();
  return nav.startsWith('de') ? 'de' : 'en';
}

export const lang = () => current;
export const locale = () => (current === 'en' ? 'en-US' : 'de-DE');
// Übersetzt einen Anzeigetext in die aktuelle Sprache (Deutsch: unverändert).
export const tr = (text) => (current === 'de' ? text : translator.tr(text));
export const fmtNum = (n, opts) => Number(n).toLocaleString(locale(), opts);
export const fmtDate = (d, opts) => new Date(d).toLocaleDateString(locale(), opts);
export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function setLang(id) {
  if (id !== 'de' && id !== 'en') return;
  try { localStorage.setItem(LANG_KEY, id); } catch { /* egal */ }
  if (id === current) return;
  current = id;
  document.documentElement.lang = id;
  retranslateAll();
  for (const fn of listeners) { try { fn(id); } catch (e) { console.error(e); } }
}

// Umschalter „Deutsch | English“ für Einstellungen und Titelbild. Ohne Optionen: Klasse ef-lang (src/i18n/i18n.css);
// mit { cls, btnCls, role: 'radio' } passt er sich an vorhandene Segment-Knöpfe an (z. B. set-seg in den Einstellungen).
export function langSwitch({ cls = 'ef-lang', btnCls = '', role = null } = {}) {
  const wrap = document.createElement('div');
  wrap.className = cls;
  wrap.setAttribute('translate', 'no');
  wrap.setAttribute('role', role === 'radio' ? 'radiogroup' : 'group');
  wrap.setAttribute('aria-label', 'Sprache / Language');
  const state = role === 'radio' ? 'aria-checked' : 'aria-pressed';
  const btns = LANGS.map(({ id, label }) => {
    const b = document.createElement('button');
    b.type = 'button';
    if (btnCls) b.className = btnCls;
    if (role) b.setAttribute('role', role);
    b.textContent = label;
    b.lang = id;
    b.addEventListener('click', (e) => { e.preventDefault(); setLang(id); });
    wrap.append(b);
    return [id, b];
  });
  const sync = () => btns.forEach(([id, b]) => b.setAttribute(state, String(id === current)));
  sync();
  onLangChange(sync);
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

// Nach einem Sprachwechsel: alles Sichtbare aus dem gemerkten Original neu übersetzen.
function retranslateAll() {
  observer?.disconnect();
  observer = null;
  const it = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = it.nextNode(); n; n = it.nextNode()) {
    if (n.nodeType === 3) {
      const rec = textSrc.get(n);
      if (rec && n.data === rec.out) n.data = rec.src;
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
// Der Code formatiert oft mit fest 'de-DE'; im Englischen wird daraus en-US (1,234 statt 1.234).
function patchBuiltins() {
  for (const name of ['alert', 'confirm', 'prompt']) {
    const orig = window[name]?.bind(window);
    if (orig) window[name] = (msg, ...rest) => orig(tr(String(msg ?? '')), ...rest);
  }
  const fix = (loc) => (current === 'en' && (loc == null || (typeof loc === 'string' && loc.startsWith('de'))) ? 'en-US' : loc);
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
      translator.missing = new Set();
      window.__i18nMissing = translator.missing;
    }
  } catch { /* egal */ }
  if (current !== 'de') { walk(document.documentElement); startObserver(); }
}
