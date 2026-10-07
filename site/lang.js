// Sprache der Website: deutsche Seiten unter /, englische unter /en/ (site/i18n/build-en.mjs).
// Steht im <head> hinter den hreflang-Verweisen und leitet sofort weiter, wenn die gewünschte Sprache eine andere ist:
// gespeicherte Wahl ('emberwrath:lang', geteilt mit dem Spiel), sonst Browsersprache (Deutsch bei de, sonst Englisch).
// Suchmaschinen werden nie umgeleitet, damit beide Fassungen im Index bleiben.
(() => {
  const KEY = 'emberwrath:lang';
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch { /* privater Modus */ }
  const nav = (navigator.languages?.[0] ?? navigator.language ?? 'de').toLowerCase();
  const want = saved === 'de' || saved === 'en' ? saved : nav.startsWith('de') ? 'de' : 'en';
  const bot = /bot|crawl|spider|slurp|lighthouse|preview|facebookexternalhit|embedly/i.test(navigator.userAgent);
  // Seiten ohne eigene englische Fassung (404.html, Cloudflare kennt nur eine): im Browser übersetzen.
  if (document.querySelector('meta[name="ew-lang-auto"]')) {
    if (location.pathname.startsWith('/en/') || (!bot && want === 'en')) {
      document.documentElement.lang = 'en';
      document.write('<script src="/en/i18n.js"><\/script>'); // synchron, bevor der Seiteninhalt entsteht
    }
  } else if (!bot && want !== document.documentElement.lang) {
    const alt = document.querySelector(`link[rel="alternate"][hreflang="${want}"]`)?.getAttribute('href');
    if (alt) {
      const to = new URL(alt, location.href);
      if (to.pathname !== location.pathname) { location.replace(to.pathname + location.search + location.hash); return; }
    }
  }
  // Ausdrückliche Wahl über den Umschalter merken
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('[data-setlang]');
    if (a) try { localStorage.setItem(KEY, a.dataset.setlang); } catch { /* egal */ }
  });
})();
