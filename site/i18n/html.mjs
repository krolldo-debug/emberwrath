// Kleiner HTML-Übersetzer für die eigenen, sauber geschriebenen Seiten in site/ (kein allgemeiner Parser).
// Übersetzungseinheiten:
//  - Elemente, deren Inhalt nur aus Text und Inline-Tags besteht (p, li, h1 … mit <a>, <strong> …):
//    der ganze innere HTML-Text ist ein Schlüssel, die Übersetzung darf dieselben Tags enthalten.
//  - sonst einzelne Textstücke
//  - Attribute alt, title, aria-label, placeholder, data-zoom, content von description/og-Metas
//  - Elemente mit translate="no" bleiben unberührt.

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const INLINE = new Set(['a', 'b', 'strong', 'i', 'em', 'span', 'br', 'small', 'abbr', 'time', 'code', 'kbd', 'sup', 'sub', 'mark', 'wbr', 'q', 'cite']);
const RAW = new Set(['script', 'style']);
export const ATTRS = ['alt', 'title', 'aria-label', 'placeholder', 'data-zoom'];
const META_NAMES = new Set(['description', 'og:title', 'og:description', 'og:image:alt', 'twitter:title', 'twitter:description']);

export function parse(html) {
  const root = { tag: '#root', children: [], attrs: '' };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/gi;
  let last = 0;
  let m;
  const top = () => stack[stack.length - 1];
  while ((m = re.exec(html))) {
    if (m.index > last) top().children.push({ text: html.slice(last, m.index) });
    last = re.lastIndex;
    if (m[0].startsWith('<!')) { top().children.push({ raw: m[0] }); continue; }
    if (m[1]) {
      const tag = m[1].toLowerCase();
      while (stack.length > 1 && top().tag !== tag) stack.pop();
      if (stack.length > 1) stack.pop();
      continue;
    }
    const tag = m[2].toLowerCase();
    const el = { tag, name: m[2], attrs: m[3] ?? '', selfClose: m[4], children: [] };
    top().children.push(el);
    if (RAW.has(tag)) {
      const end = html.indexOf(`</${tag}`, last);
      const close = html.indexOf('>', end);
      el.rawBody = html.slice(last, end);
      last = close + 1;
      re.lastIndex = last;
      continue;
    }
    if (!VOID.has(tag) && !m[4]) stack.push(el);
  }
  if (last < html.length) top().children.push({ text: html.slice(last) });
  return root;
}

export function serialize(node) {
  if (node.text != null) return node.text;
  if (node.raw != null) return node.raw;
  const inner = node.rawBody ?? node.children.map(serialize).join('');
  if (node.tag === '#root') return inner;
  const open = `<${node.name}${node.attrs}${node.selfClose ? ' /' : ''}>`;
  if (VOID.has(node.tag)) return open;
  return `${open}${inner}</${node.name}>`;
}

export const getAttr = (el, name) => {
  const m = el.attrs.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  return m ? decode(m[2] ?? m[3]) : null;
};
export const setAttr = (el, name, value) => {
  const v = encodeAttr(value);
  const re = new RegExp(`(\\s${name}\\s*=\\s*)("[^"]*"|'[^']*')`, 'i');
  el.attrs = re.test(el.attrs) ? el.attrs.replace(re, (_, a) => `${a}"${v}"`) : `${el.attrs} ${name}="${v}"`;
};
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const encodeAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

const hasLetters = (s) => /[A-Za-zÄÖÜäöüß]/.test(s.replace(/&[a-z]+;|&#\d+;/g, ''));
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const noTranslate = (el) => /\stranslate\s*=\s*"no"/i.test(el.attrs) || /\bclass\s*=\s*"[^"]*\bnotranslate\b/i.test(el.attrs);
const inlineOnly = (el) => el.children.every((c) => c.text != null || c.raw != null || (INLINE.has(c.tag) && !noTranslate(c) && inlineOnly(c)));
const ownText = (el) => el.children.some((c) => c.text != null && hasLetters(c.text));

// Geht alle Einheiten durch. fn(key, kind) gibt die Übersetzung zurück (oder null = unverändert).
// kind: 'html' (innerer HTML-Text), 'text', 'attr'.
export function translateTree(root, fn) {
  const visit = (el) => {
    if (el.text != null || el.raw != null) return;
    if (el.tag !== '#root' && noTranslate(el)) return;
    for (const a of ATTRS) {
      const v = getAttr(el, a);
      if (v && hasLetters(v)) { const t = fn(norm(v), 'attr'); if (t != null) setAttr(el, a, t); }
    }
    if (el.tag === 'meta') {
      const key = getAttr(el, 'name') ?? getAttr(el, 'property');
      const v = getAttr(el, 'content');
      if (META_NAMES.has(key) && v) { const t = fn(norm(v), 'attr'); if (t != null) setAttr(el, 'content', t); }
    }
    if (el.rawBody != null) return;
    if (el.tag !== '#root' && ownText(el) && inlineOnly(el)) {
      const inner = el.children.map(serialize).join('');
      const lead = inner.match(/^\s*/)[0];
      const trail = inner.match(/\s*$/)[0];
      const t = fn(norm(inner), 'html');
      if (t != null) { el.children = [{ text: lead + t + trail }]; return; }
    }
    for (const c of el.children) {
      if (c.text != null) {
        if (!hasLetters(c.text)) continue;
        const t = fn(norm(c.text), 'text');
        if (t != null) c.text = c.text.match(/^\s*/)[0] + t + c.text.match(/\s*$/)[0];
      } else visit(c);
    }
  };
  visit(root);
  return root;
}

export function walkElements(root, fn) {
  const visit = (el) => { if (el.children) { fn(el); el.children.forEach(visit); } };
  visit(root);
}
