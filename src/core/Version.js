import { EV } from './events.js';

// Veraltete Spielversion erkennen (z. B. ein Tab, der seit vor dem letzten Release offen ist).
// Das Spiel kennt seinen Stand (globalThis.EMBERWRATH_BUILD, tools/build.mjs), der Server meldet den aktuellen in
// /version.json. Weichen sie ab, lädt alter Code keine Spielstände mehr hoch (CloudSync fragt isOutdated()):
// Er kennt neue Teile des Spielstands nicht und würde sie beim Speichern verlieren oder vom Server abgelehnt werden.
// Stattdessen speichert das Spiel auf dem Gerät und lädt an einer ruhigen Stelle einmal neu: sofort außerhalb der
// Welt (Titel, Konto, Heldenwahl), sonst beim nächsten Gebietswechsel oder wenn der Tab im Hintergrund ist.
// Ohne bekannten eigenen Stand (Entwicklung, dist/emberfall.html) passiert nichts.

const CHECK_EVERY = 5 * 60 * 1000;
const MAX_AGE = 60 * 1000;
const RELOADED_KEY = 'emberwrath:reloadedFor';

const own = () => globalThis.EMBERWRATH_BUILD?.commit;
let latest = null;      // Stand laut Server
let checkedAt = 0;
let pending = null;

const active = () => /^https?:$/.test(globalThis.location?.protocol ?? '') && !!own() && own() !== 'dev';

// true, sobald der Server einen anderen Stand meldet (bleibt dann true bis zum Neuladen)
export const isOutdated = () => !!latest && latest !== own();

// Fragt den Server höchstens einmal pro maxAge. Ergebnis: isOutdated() danach. Fehler (offline) zählen nicht als veraltet.
export function checkVersion({ maxAge = MAX_AGE } = {}) {
  if (!active() || isOutdated()) return Promise.resolve(isOutdated());
  if (pending) return pending;
  if (Date.now() - checkedAt < maxAge) return Promise.resolve(false);
  pending = fetch('/version.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((v) => { if (typeof v?.commit === 'string' && /^[0-9a-f]{7,40}$/.test(v.commit)) latest = v.commit; checkedAt = Date.now(); return isOutdated(); })
    .catch(() => false)
    .finally(() => { pending = null; });
  return pending;
}

export function installVersionCheck(game) {
  if (!active()) return;
  let announced = false;
  const reload = () => {
    try { game.saveNow?.('version'); } catch { /* Spielstand liegt ohnehin zuletzt gespeichert vor */ }
    try { sessionStorage.setItem(RELOADED_KEY, latest); } catch { /* egal */ }
    location.reload();
  };
  // Schon einmal für diesen Stand neu geladen und immer noch alt (Zwischenspeicher hängt): nicht im Kreis laden
  const reloadedBefore = () => { try { return sessionStorage.getItem(RELOADED_KEY) === latest; } catch { return false; } };
  const onOutdated = () => {
    if (!isOutdated()) return;
    if (reloadedBefore()) {
      if (!announced && game.scenes?.currentId === 'play') { announced = true; game.bus.emit(EV.UI_TOAST, { text: 'Eine neue Version ist da. Bitte lade die Seite neu, damit dein Fortschritt gespeichert wird.', kind: 'warn' }); }
      return;
    }
    if (game.scenes?.currentId !== 'play' || document.hidden) { reload(); return; }
    if (!announced) { announced = true; game.bus.emit(EV.UI_TOAST, { text: 'Eine neue Version ist da. Sie wird beim nächsten Gebietswechsel geladen.', kind: 'info' }); }
  };
  const check = (maxAge) => checkVersion({ maxAge }).then(onOutdated);
  setInterval(() => check(), CHECK_EVERY);
  document.addEventListener('visibilitychange', () => { if (document.hidden) onOutdated(); else check(0); }); // zurück zu einem alten Tab: sofort fragen
  game.bus.on(EV.SCENE_CHANGE, () => onOutdated());
  // Beim Verlassen eines Gebiets liegt ohnehin die Ladeansicht über dem Bild
  game.bus.on(EV.ZONE_LEAVE, () => { if (isOutdated() && !reloadedBefore()) reload(); });
  check();
}
