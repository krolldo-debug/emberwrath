import { EV } from '../core/events.js';
import { hasAppStore, appStore } from './store.js';

// Bewertungsfrage von Apple (nur iOS-App ab 1.1): einmal, ein paar Sekunden nach einem Bosssieg, wenn Siegesbanner und
// Beute durch sind. Ob die Frage wirklich erscheint, entscheidet iOS (höchstens dreimal im Jahr je Gerät).
const ASKED_KEY = 'ew-review-asked';
const DELAY_MS = 8000;

const asked = () => { try { return localStorage.getItem(ASKED_KEY) === '1'; } catch { return true; } };
const remember = () => { try { localStorage.setItem(ASKED_KEY, '1'); } catch { /* egal */ } };

export function installReviewPrompt(game) {
  if (!hasAppStore()) return;
  game.addSessionSystem('reviewPrompt', (sess) => {
    let timer = null;
    const off = sess.bus.on(EV.BOSS_DEFEATED, () => {
      if (timer || asked()) return;
      timer = setTimeout(() => {
        if (document.visibilityState !== 'visible' || asked()) return;
        remember();
        appStore.requestReview().catch(() => {});
      }, DELAY_MS);
    });
    return { dispose: () => { off?.(); clearTimeout(timer); } };
  }, 90);
}
