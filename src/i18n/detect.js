// Sprache beim Start: ?lang=xx (wird gespeichert), sonst die gespeicherte Wahl, sonst die erste unterstützte
// Browsersprache, sonst Englisch. tools/build.mjs kopiert diese Funktion als Text vor das Spiel, damit das
// Wörterbuch schon vor dem Start geladen wird. Deshalb ohne Importe und ohne Bezug auf anderen Code.
export function detectLang(ids, key) {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (ids.includes(q)) { localStorage.setItem(key, q); return q; }
    const saved = localStorage.getItem(key);
    if (ids.includes(saved)) return saved;
  } catch { /* privater Modus: Browsersprache */ }
  const nav = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language ?? 'en'];
  for (const l of nav) {
    const id = String(l).toLowerCase().slice(0, 2);
    if (ids.includes(id)) return id;
  }
  return 'en';
}
