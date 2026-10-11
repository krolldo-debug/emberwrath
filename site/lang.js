// Sprache der Website: deutsche Seiten unter /, die anderen unter /en/, /es/, /fr/ (site/i18n/build-en.mjs).
// Steht im <head> hinter den hreflang-Verweisen. Auf deutschen Seiten leitet es sofort weiter, wenn die gewünschte Sprache
// eine andere ist: gespeicherte Wahl ('emberwrath:lang', geteilt mit dem Spiel), sonst Browsersprache (sonst Englisch).
// Suchmaschinen werden nie umgeleitet, damit alle Fassungen im Index bleiben.
// Außerdem: Sprachauswahl in der Kopfleiste (Globus öffnet die Liste, Klick merkt die Wahl).
(() => {
  const KEY = 'emberwrath:lang';
  const IDS = ['de', 'en', 'es', 'fr'];
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch { /* privater Modus */ }
  const nav = (navigator.languages?.[0] ?? navigator.language ?? 'de').toLowerCase().slice(0, 2);
  const want = IDS.includes(saved) ? saved : IDS.includes(nav) ? nav : 'en';
  const bot = /bot|crawl|spider|slurp|lighthouse|preview|facebookexternalhit|embedly/i.test(navigator.userAgent);
  // Seiten ohne eigene Fassungen (404.html, Cloudflare kennt nur eine): im Browser übersetzen.
  if (document.querySelector('meta[name="ew-lang-auto"]')) {
    const id = location.pathname.match(/^\/(en|es|fr)\//)?.[1] ?? (!bot && want !== 'de' ? want : null);
    if (id) {
      document.documentElement.lang = id;
      document.write(`<script src="/${id}/i18n.js"><\/script>`); // synchron, bevor der Seiteninhalt entsteht
    }
  } else if (!bot && document.documentElement.lang === 'de' && want !== 'de') {
    // Nur deutsche Adressen leiten um (gespeicherte Wahl, sonst Browsersprache). Eine Sprachadresse (/en/, /es/, /fr/ …)
    // bleibt, wie sie ist, damit geteilte Links in ihrer Sprache ankommen; gewechselt wird über die Auswahl.
    const alt = document.querySelector(`link[rel="alternate"][hreflang="${want}"]`)?.getAttribute('href');
    if (alt) {
      const to = new URL(alt, location.href);
      if (to.pathname !== location.pathname) { location.replace(to.pathname + location.search + location.hash); return; }
    }
  }

  const menuOf = (el) => el?.closest?.('[data-lang-menu]');
  const setOpen = (menu, open) => {
    menu.classList.toggle('open', open);
    menu.querySelector('.lang-btn')?.setAttribute('aria-expanded', String(open));
  };
  const closeAll = (except) => { for (const m of document.querySelectorAll('[data-lang-menu].open')) if (m !== except) setOpen(m, false); };
  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('.lang-btn');
    if (btn) {
      const menu = menuOf(btn);
      closeAll(menu);
      setOpen(menu, !menu.classList.contains('open'));
      if (menu.classList.contains('open')) (menu.querySelector('[aria-current]') ?? menu.querySelector('a'))?.focus({ preventScroll: true });
      return;
    }
    // Ausdrückliche Wahl merken; Abschnitt der Seite (#…) mitnehmen
    const a = e.target.closest?.('[data-setlang]');
    if (a) {
      try { localStorage.setItem(KEY, a.dataset.setlang); } catch { /* egal */ }
      if (location.hash && !a.hash && a.pathname !== location.pathname) a.hash = location.hash;
    }
    if (!menuOf(e.target)) closeAll();
  });
  document.addEventListener('keydown', (e) => {
    const menu = menuOf(document.activeElement);
    if (!menu?.classList.contains('open')) return;
    if (e.key === 'Escape') { setOpen(menu, false); menu.querySelector('.lang-btn').focus(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const links = [...menu.querySelectorAll('.lang-list a')];
    const i = links.indexOf(document.activeElement);
    links[(i + (e.key === 'ArrowDown' ? 1 : links.length - 1)) % links.length]?.focus();
  });
  document.addEventListener('focusout', (e) => {
    const menu = menuOf(e.target);
    if (menu && !menu.contains(e.relatedTarget) && e.relatedTarget) setOpen(menu, false);
  });
})();
