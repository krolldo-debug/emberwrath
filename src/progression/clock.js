// Serverzeit für Tageswechsel (Auftragsbrett, Tagesbelohnung, Wochenherausforderung).
// Die Uhr des Geräts lässt sich verstellen; der Date-Kopf einer Antwort der eigenen Seite nicht.
// Einmal beim Start (und danach stündlich) fragt das Spiel /version.json ab und merkt sich den Abstand.
// Ohne Antwort (keine Verbindung, Datei geöffnet) bleibt ready() false: Wer Belohnungen nach Tagen vergibt,
// wartet darauf. Rückwärts gehen Tage ohnehin nie (board.js / daily.js speichern den größten Tag).

const RESYNC_MS = 3600000;
let offset = 0;
let synced = false;
let last = 0;
let pending = null;

export const serverNow = () => Date.now() + offset;
export const clockReady = () => synced || !/^https?:$/.test(globalThis.location?.protocol ?? '');

export function syncClock(url = '/version.json') {
  if (pending || (synced && Date.now() - last < RESYNC_MS) || typeof fetch !== 'function') return pending;
  const t0 = Date.now();
  pending = fetch(url, { method: 'HEAD', cache: 'no-store' })
    .then((res) => {
      const at = Date.parse(res.headers.get('date') ?? '');
      if (!Number.isFinite(at)) return false;
      const t1 = Date.now();
      // Date hat Sekundengenauigkeit: Mitte der Sekunde und Mitte der Laufzeit
      offset = at + 500 - (t0 + t1) / 2;
      synced = true;
      last = t1;
      return true;
    })
    .catch(() => false)
    .finally(() => { pending = null; });
  return pending;
}

// Nur für Tests
export function setClockOffset(ms) { offset = ms; synced = true; last = Date.now(); }
